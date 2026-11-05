# YouTube Trials

A minimal server-side fal.ai integration starter for image, video and other generative-media workflows.

## Requirements

- Node.js 22.23.4 or newer
- npm
- A fal.ai API key

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env`.
3. Set `FAL_KEY` to an API key from your fal.ai account.
4. Add the exact model endpoint IDs you intend to use to `FAL_ALLOWED_ENDPOINTS`, separated by commas.
5. Set `ALLOWED_ORIGIN` to the exact origin of your frontend.
6. Start the API:

   ```bash
   npm run dev
   ```

The server reads `.env` through Node's `--env-file` option only if you add it to the start command, or you can export the variables in your shell / hosting environment. For local development, use:

   ```bash
   node --env-file=.env --watch src/server.js
   ```

For production:

   ```bash
   node --env-file=.env src/server.js
   ```

## API

### Health check

`GET /health`

Returns server status and whether the fal.ai key is configured. It never returns the key.

### Generate media

`POST /api/generate`

Example request:

```json
{
  "endpointId": "fal-ai/your-selected-model",
  "input": {
    "prompt": "A colourful cinematic 2D cartoon scene"
  }
}
```

The endpoint ID must exactly match one of the entries in `FAL_ALLOWED_ENDPOINTS`. The `input` object must follow the schema published on that model's fal.ai page. The server uses `fal.subscribe`, which submits the job through fal's queue and waits for its result.

## Security

- Keep `FAL_KEY` on the server. Never add it to browser code or commit a real `.env` file.
- `.env` is ignored by Git.
- Restrict model endpoint IDs with `FAL_ALLOWED_ENDPOINTS`.
- Configure `ALLOWED_ORIGIN` to the exact frontend origin.
- The API includes basic request rate limiting, JSON size limits and security headers.
- Before public deployment, add user authentication and per-user quotas. CORS is not authentication.
- Review provider pricing and each model's input/output limits before enabling it.

## Current scope and next steps

This repository is an API foundation, not yet a complete Shorts production application. The next implementation phase should select the image and video models, define their input schemas, then add job persistence, progress polling, asset storage and a user interface.

## References

- [fal.ai documentation](https://fal.ai/docs)
- [fal JavaScript client](https://github.com/fal-ai/fal-js)
- [fal JavaScript client README](https://github.com/fal-ai/fal-js/blob/main/libs/client/README.md)
