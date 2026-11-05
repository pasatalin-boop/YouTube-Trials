const baseUrl = (process.env.API_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const imagePrompt = process.env.IMAGE_PROMPT ??
  "A friendly small blue cartoon creature with large expressive eyes, round body and tiny arms, standing in a magical forest, polished 2D children's animation, colourful cinematic lighting, full body, centred composition, portrait illustration, no text, no watermark";
const motionPrompt = process.env.MOTION_PROMPT ??
  "The blue cartoon creature blinks, smiles, gently waves both arms and takes two small steps forward. Keep its face, colours and body proportions consistent. Add subtle floating magical lights and a gentle camera push-in. Smooth child-friendly 2D animation.";
const resolution = process.env.VIDEO_RESOLUTION ?? "480p";

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${payload.error ?? JSON.stringify(payload)}`);
  return payload;
}

const health = await requestJson(`${baseUrl}/health`);
if (!health.falConfigured || !health.pipelineConfigured) {
  throw new Error("Server is reachable, but fal.ai or pipeline model configuration is incomplete. Check .env.");
}
console.log("Server ready. Submitting image-to-video pipeline...");

const job = await requestJson(`${baseUrl}/api/pipelines/image-to-video`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ imagePrompt, motionPrompt, resolution, aspectRatio: "9:16" }),
});
console.log(`Job ${job.jobId} submitted. Initial status: ${job.status}`);

const deadline = Date.now() + 15 * 60 * 1000;
let latest = job;
while (Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 5000));
  latest = await requestJson(`${baseUrl}${job.statusUrl}`);
  console.log(`Status: ${latest.status}, stage: ${latest.stage}`);
  if (latest.status === "completed") {
    console.log("\nPipeline completed successfully.");
    console.log(`Image: ${latest.imageUrl}`);
    console.log(`Video: ${latest.videoUrl}`);
    process.exit(0);
  }
  if (latest.status === "failed") {
    throw new Error(latest.error ?? "Pipeline failed.");
  }
}
throw new Error("Timed out waiting for the pipeline after 15 minutes. Check the server logs and fal.ai dashboard.");
