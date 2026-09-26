# Stack: APIs, frameworks and tools

Everything Last Alibi uses, what it is used for, and where it lives in the repo.

## In the game (runtime)

| What | Used for | Where |
|---|---|---|
| **Google Gemini API** (`gemini-3.8-flash`, fallback `gemini-3.5-flash-lite`) | Character brains: dialogue, tool calls, the confession gate; Castelli the sidekick; speech-to-text second pass | `server/server.mjs`, `server/sidekick.mjs`, `server/transcribe.mjs`, `worker/index.mjs` |
| **Gradium** (WebSocket TTS + STT, Voice Design) | Every character's voice, push-to-talk microphone, the narrator of the opening film | `assets/voice.js`, `server/stt-token.mjs`, `/api/gradium-token` |
| **Cloudflare Workers** (+ static assets, secrets) | Hosting: https://last-alibi.kaisspace.workers.dev | `worker/index.mjs`, `wrangler.jsonc`, `tools/deploy.mjs` |
| **Browser platform** (Canvas 2D, Web Audio, WebSocket, MediaRecorder) | The engine, playback, microphone. No front-end framework, no build step | `engine/*.js`, `assets/*.js`, `index.html` |
| **Node.js ≥ 20** | Local server (no dependencies) and tooling | `server/`, `tools/` |

Server endpoints: [api.md](api.md). How the pieces fit: [architecture.md](architecture.md).

## Making the content (art pipeline, not shipped)

| What | Used for | Where |
|---|---|---|
| **Gemini image models (Nano Banana)** | Backgrounds, sprites, portraits, film keyframes | `tools/gen-image.mjs`, `tools/gen-assets.mjs`, `tools/gen-scenes.mjs` |
| **Kling v3** | Film clips chained between keyframes | `art/opening-film/` |
| **Veo 3.1 + Lyria** (Gemini API) | Film sound and music | `tools/gen-music.mjs` |
| **Gradium Voice Design** | The "Last Alibi Narrator" voice (`WW11EX7sml7QCnvF`) | opening film |
| **ffmpeg**, **Python + Pillow** | Video encoding, audio mix, typewriter subtitles, sprite cutting | `tools/*.py` |
| **Headless Chrome (CDP)** | Playtesting and screenshots | `tools/cdp.mjs` |
| **Wrangler CLI** | Deploys and Worker secrets | `npm run deploy` |

Details of the art pipeline: [art-pipeline.md](art-pipeline.md).
