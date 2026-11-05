import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { fal } from "@fal-ai/client";

const app = express();
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const falKey = process.env.FAL_KEY;
const allowedOrigins = (process.env.ALLOWED_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const allowedEndpoints = new Set(
  (process.env.FAL_ALLOWED_ENDPOINTS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}

if (falKey) {
  fal.config({ credentials: falKey });
}

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    // Requests without an Origin header are typically server-to-server or local CLI calls.
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

app.get("/health", (_request, response) => {
  response.json({ status: "ok", falConfigured: Boolean(falKey) });
});

app.post("/api/generate", async (request, response) => {
  if (!falKey) {
    return response.status(503).json({ error: "FAL_KEY is not configured on the server." });
  }

  const { endpointId, input } = request.body ?? {};

  if (typeof endpointId !== "string" || !allowedEndpoints.has(endpointId)) {
    return response.status(400).json({
      error: "endpointId is missing or not enabled. Add the exact model endpoint ID to FAL_ALLOWED_ENDPOINTS.",
    });
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return response.status(400).json({ error: "input must be a JSON object." });
  }

  try {
    const result = await fal.subscribe(endpointId, {
      input,
      logs: false,
    });

    return response.json({
      status: "completed",
      requestId: result.requestId,
      data: result.data,
    });
  } catch (error) {
    // Do not return provider credentials or raw internal details to callers.
    console.error("fal.ai request failed:", error?.message ?? "Unknown error");
    return response.status(502).json({
      error: "fal.ai generation failed. Check the model endpoint, input schema and provider status.",
    });
  }
});

app.use((error, _request, response, _next) => {
  if (error?.type === "entity.too.large") {
    return response.status(413).json({ error: "Request body exceeds the 1 MB limit." });
  }
  if (error instanceof SyntaxError && "body" in error) {
    return response.status(400).json({ error: "Request body must contain valid JSON." });
  }
  if (error?.message === "Origin not allowed by CORS.") {
    return response.status(403).json({ error: "Origin not allowed." });
  }
  console.error("Unhandled server error:", error?.message ?? "Unknown error");
  return response.status(500).json({ error: "Internal server error." });
});

app.listen(port, () => {
  console.log(`YouTube Trials fal.ai API listening on port ${port}`);
});
