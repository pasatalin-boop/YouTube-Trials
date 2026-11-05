import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { fal } from "@fal-ai/client";

const app = express();
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const falKey = process.env.FAL_KEY;
const imageEndpoint = process.env.PIPELINE_IMAGE_ENDPOINT ?? "fal-ai/flux/schnell";
const videoEndpoint = process.env.PIPELINE_VIDEO_ENDPOINT ?? "fal-ai/wan-i2v";
const allowedOrigins = (process.env.ALLOWED_ORIGIN ?? "http://localhost:5173")
  .split(",").map((value) => value.trim()).filter(Boolean);
const allowedEndpoints = new Set(
  (process.env.FAL_ALLOWED_ENDPOINTS ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean),
);
const jobs = new Map();
const JOB_TTL_MS = 60 * 60 * 1000;
const MAX_JOBS = 100;

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}
if (falKey) fal.config({ credentials: falKey });

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed by CORS."));
  },
}));
app.use(express.json({ limit: "1mb", strict: true }));
app.use("/api", rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
}));

function cleanOldJobs() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.updatedAt < cutoff) jobs.delete(id);
  }
  while (jobs.size >= MAX_JOBS) {
    const oldestId = jobs.keys().next().value;
    if (!oldestId) break;
    jobs.delete(oldestId);
  }
}

function publicJob(job) {
  return {
    jobId: job.jobId,
    status: job.status,
    stage: job.stage,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    imageUrl: job.imageUrl ?? null,
    videoUrl: job.videoUrl ?? null,
    error: job.error ?? null,
  };
}

function updateJob(job, updates) {
  Object.assign(job, updates, { updatedAt: new Date().toISOString() });
}

async function runImageToVideoPipeline(job, { imagePrompt, motionPrompt, resolution, aspectRatio }) {\n  const imageSize = aspectRatio === "9:16" ? "portrait_16_9" : aspectRatio === "16:9" ? "landscape_16_9" : "square_hd";
  try {
    updateJob(job, { status: "processing", stage: "image_generation" });
    const imageResult = await fal.subscribe(imageEndpoint, {
      input: {
        prompt: imagePrompt,
        image_size: imageSize,
        num_inference_steps: 4,
        num_images: 1,
        output_format: "jpeg",
        enable_safety_checker: true,
      },
      logs: false,
    });
    const imageUrl = imageResult?.data?.images?.[0]?.url;
    if (typeof imageUrl !== "string" || !imageUrl.startsWith("https://")) {
      throw new Error("Image model returned no valid HTTPS image URL.");
    }

    updateJob(job, { stage: "video_generation", imageUrl });
    const videoResult = await fal.subscribe(videoEndpoint, {
      input: {
        image_url: imageUrl,
        prompt: motionPrompt,
        resolution,
        aspect_ratio: aspectRatio,
        num_frames: 81,
        frames_per_second: 16,
        enable_safety_checker: true,
      },
      logs: false,
    });
    const videoUrl = videoResult?.data?.video?.url;
    if (typeof videoUrl !== "string" || !videoUrl.startsWith("https://")) {
      throw new Error("Video model returned no valid HTTPS video URL.");
    }

    updateJob(job, {
      status: "completed",
      stage: "completed",
      videoUrl,
      imageRequestId: imageResult.requestId,
      videoRequestId: videoResult.requestId,
    });
  } catch (error) {
    console.error("Image-to-video pipeline failed:", error?.message ?? "Unknown error");
    updateJob(job, {
      status: "failed",
      stage: "failed",
      error: "Generation failed. Check the fal.ai model configuration, input schema and account credits.",
    });
  }
}

app.get("/health", (_request, response) => {
  response.json({
    status: "ok",
    falConfigured: Boolean(falKey),
    pipelineConfigured: allowedEndpoints.has(imageEndpoint) && allowedEndpoints.has(videoEndpoint),
    models: { image: imageEndpoint, video: videoEndpoint },
  });
});

// Submit one complete image-to-video job. Poll the returned statusUrl for progress.
app.post("/api/pipelines/image-to-video", (request, response) => {
  if (!falKey) {
    return response.status(503).json({ error: "FAL_KEY is not configured on the server." });
  }
  if (!allowedEndpoints.has(imageEndpoint) || !allowedEndpoints.has(videoEndpoint)) {
    return response.status(503).json({
      error: "Pipeline models are not enabled. Add both configured model IDs to FAL_ALLOWED_ENDPOINTS.",
    });
  }

  const body = request.body ?? {};
  const { imagePrompt, motionPrompt } = body;
  const resolution = body.resolution ?? "480p";
  const aspectRatio = body.aspectRatio ?? "9:16";

  if (typeof imagePrompt !== "string" || imagePrompt.trim().length < 5 || imagePrompt.length > 5000) {
    return response.status(400).json({ error: "imagePrompt must be a string between 5 and 5000 characters." });
  }
  if (typeof motionPrompt !== "string" || motionPrompt.trim().length < 5 || motionPrompt.length > 5000) {
    return response.status(400).json({ error: "motionPrompt must be a string between 5 and 5000 characters." });
  }
  if (!["480p", "720p"].includes(resolution)) {
    return response.status(400).json({ error: "resolution must be 480p or 720p." });
  }
  if (!["9:16", "16:9", "1:1"].includes(aspectRatio)) {
    return response.status(400).json({ error: "aspectRatio must be 9:16, 16:9 or 1:1." });
  }

  cleanOldJobs();
  const now = new Date().toISOString();
  const job = {
    jobId: randomUUID(),
    status: "queued",
    stage: "queued",
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(job.jobId, job);

  // Run in the background so the HTTP request returns immediately.
  void runImageToVideoPipeline(job, {
    imagePrompt: imagePrompt.trim(),
    motionPrompt: motionPrompt.trim(),
    resolution,
    aspectRatio,
  });

  return response.status(202).json({
    ...publicJob(job),
    statusUrl: `/api/pipelines/${job.jobId}`,
  });
});

app.get("/api/pipelines/:jobId", (request, response) => {
  const job = jobs.get(request.params.jobId);
  if (!job) {
    return response.status(404).json({ error: "Pipeline job not found. Jobs are stored in memory and expire after one hour." });
  }
  return response.json(publicJob(job));
});

// Keep the generic allowlisted model endpoint for individual model tests.
app.post("/api/generate", async (request, response) => {
  if (!falKey) return response.status(503).json({ error: "FAL_KEY is not configured on the server." });
  const { endpointId, input } = request.body ?? {};
  if (typeof endpointId !== "string" || !allowedEndpoints.has(endpointId)) {
    return response.status(400).json({ error: "endpointId is missing or not enabled in FAL_ALLOWED_ENDPOINTS." });
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return response.status(400).json({ error: "input must be a JSON object." });
  }
  try {
    const result = await fal.subscribe(endpointId, { input, logs: false });
    return response.json({ status: "completed", requestId: result.requestId, data: result.data });
  } catch (error) {
    console.error("fal.ai request failed:", error?.message ?? "Unknown error");
    return response.status(502).json({ error: "fal.ai generation failed. Check the model endpoint, input schema and provider status." });
  }
});

app.use((error, _request, response, _next) => {
  if (error?.type === "entity.too.large") return response.status(413).json({ error: "Request body exceeds the 1 MB limit." });
  if (error instanceof SyntaxError && "body" in error) return response.status(400).json({ error: "Request body must contain valid JSON." });
  if (error?.message === "Origin not allowed by CORS.") return response.status(403).json({ error: "Origin not allowed." });
  console.error("Unhandled server error:", error?.message ?? "Unknown error");
  return response.status(500).json({ error: "Internal server error." });
});

app.listen(port, () => console.log(`YouTube Trials fal.ai API listening on port ${port}`));
