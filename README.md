# YouTube Trials

A server-side fal.ai image-to-video generation API for YouTube Shorts workflows.

## Requirements

- Node.js 22.23.4 or newer
- npm
- A fal.ai account with API credits

## Setup

1. Clone this repository and install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env`.
3. Add your fal.ai key to `FAL_KEY`. Never commit this file.
4. Keep the default model configuration initially:
   - Image: `fal-ai/flux/schnell`
   - Video: `fal-ai/wan-i2v`
5. Start the API:

   ```bash
   npm run check
   npm run dev
   ```

6. Verify the server at `http://localhost:3000/health`. The response should show `falConfigured: true` and `pipelineConfigured: true`.

## Automated image-to-video pipeline

### Submit a job

`POST /api/pipelines/image-to-video`

Example:

```json
{
  "imagePrompt": "A friendly blue cartoon creature in a magical forest, polished 2D animation style, portrait composition",
  "motionPrompt": "The creature waves, smiles and takes two steps forward. Keep its appearance consistent.",
  "resolution": "480p",
  "aspectRatio": "9:16"
}
```

The API responds with HTTP 202 and a `jobId` plus `statusUrl`. It generates the image first, passes the returned HTTPS image URL to the video model, then stores the final video URL in the job status.

### Check job status

`GET /api/pipelines/{jobId}`

Possible states:

- `queued`: accepted by the API.
- `processing` with stage `image_generation`: image is being generated.
- `processing` with stage `video_generation`: image is ready and video generation is running.
- `completed`: both outputs are available as `imageUrl` and `videoUrl`.
- `failed`: the pipeline stopped. Check server logs and fal.ai account/model configuration.

### Run the end-to-end test

With the server running in one terminal, run this in another:

```bash
npm run test:e2e
```

The script submits a sample prompt, polls the job every 3 seconds for up to 15 minutes, and prints the image and video URLs. Optional environment variables: `API_BASE_URL`, `IMAGE_PROMPT`, `MOTION_PROMPT`, and `VIDEO_RESOLUTION`.

PowerShell alternative:

```powershell
$env:VIDEO_RESOLUTION = "480p"
npm run test:e2e
```

## Individual model endpoint

The existing `POST /api/generate` endpoint remains available for isolated model tests. It accepts an allowlisted `endpointId` and a model-specific `input` object.

## Configuration

| Variable | Purpose |
|---|---|
| `FAL_KEY` | Server-side fal.ai API key |
| `FAL_ALLOWED_ENDPOINTS` | Comma-separated allowlist of model endpoint IDs |
| `PIPELINE_IMAGE_ENDPOINT` | Image model endpoint |
| `PIPELINE_VIDEO_ENDPOINT` | Image-to-video model endpoint |
| `PORT` | API port, default 3000 |
| `ALLOWED_ORIGIN` | Comma-separated exact frontend origins |

Both pipeline model IDs must also appear in `FAL_ALLOWED_ENDPOINTS`.

## Security and operational limitations

- Keep `FAL_KEY` server-side. Never expose it in browser code or commit a real `.env` file.
- The API includes Helmet, CORS restrictions, request rate limiting and JSON size limits. CORS is not authentication.
- Add authentication and per-user quotas before exposing this API publicly.
- Pipeline job state is currently stored in process memory, retained for up to one hour, and limited to 100 jobs. A server restart clears active jobs. Add a persistent database and durable worker before production use.
- fal.ai output URLs are provider-hosted URLs. Copy important outputs to durable object storage if they must be retained.
- Generation costs depend on model pricing, resolution and retries. Start with 480p and monitor usage in your fal.ai dashboard.

## Model references

- [FLUX.1 Schnell API schema](https://fal.ai/models/fal-ai/flux/schnell/api)
- [WAN 2.1 Image-to-Video API schema](https://fal.ai/models/fal-ai/wan-i2v/api)
- [fal JavaScript client queue documentation](https://fal-ai.github.io/fal-js/reference/interfaces/QueueClient.html)
