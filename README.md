# Last Alibi

A murder-mystery game made of cases. The first case is **Last Stop, Simplon-Orient**; more are coming (the case list is in `engine/cases.js`).

## Case 1: Last Stop, Simplon-Orient

> *18 December 1931. An avalanche stops the Simplon-Orient Express in the Alps. By morning, the envoy in No. 7 is dead behind a bolted door.*

A 2D pixel-art murder mystery that you play by **talking to the suspects**. Every character is an AI actor: **Gemini** writes what they say, and **Gradium** gives them a voice and hears yours. The engine, not the model, keeps track of what is true: who knows what, which secrets are out, and when the killer breaks.

You play Inspector Sorel of the Paris Sûreté. You walk the train, search compartments and the snow outside, collect clues, and question seven passengers and crew by voice or text. You can show evidence in the middle of a conversation. When you're ready, you name the killer, the motive and three pieces of proof.

The plot and cast are original. Only the historic setting is borrowed (the Simplon-Orient Express and the Wagons-Lits company), not Agatha Christie's novel.

---

## Quick start

```bash
# Node 20+ and nothing to install: the server has zero dependencies.
cp .env.example .env        # then paste your keys (see below)
npm start                   # -> http://localhost:5173
```

| Page | What it is |
|---|---|
| `http://localhost:5173/` | The game on the new **scene engine** (hand-composed rooms, generated art), in `engine/` |
| `/prototype.html` | The earlier **top-down walkable train** (everything drawn in code), in `assets/game.js` |
| `/cast.html` | Cast sheet: portraits and bios |

**No keys?** The game still runs. Characters fall back to a **scripted brain** (keyword answers in `assets/demo-dialogue.js`) and voice is turned off.

### Environment (`.env`, never committed)

| Variable | Needed for | Notes |
|---|---|---|
| `GEMINI_API_KEY` | Live AI characters, art generation | Server-side only. Never sent to the browser |
| `GRADIUM_API_KEY` | Voice (speech-to-text and text-to-speech) | The server mints a **single-use token** for each WebSocket |
| `PORT` | Server port | Default `5173` |
| `LOG_LEVEL` | Server and tool logging | `debug` · `info` (default) · `warn` · `error` · `silent` |
| `LOG_FORMAT` | Server and tool logging | `json` gives one JSON object per line |

### Controls

| | Scene engine (`/`) | Prototype (`/prototype.html`) |
|---|---|---|
| Move | Click on the floor, or WASD / arrows | WASD / arrows |
| Talk or examine | Click a person or a sparkle, or **E** when near | **E** next to it |
| Ask | Type, quick questions **1–3**, or hold **Space** (or the mic button) to speak | Type, **1–3**, or hold **Space** |
| Show evidence | **Tab** or the *Show* button in a conversation | **Tab** in a conversation |
| Inventory / notebook / map | **I** / **J** / **M** (or the top-left buttons) | **I** / **J** |
| Quick note | **N** (or the pencil button); **Alt+N** or *✎ Note* in a conversation. **Enter** saves, **Esc** cancels; hold 🎙 (or **Space** on an empty note) to dictate. Notebook → *My notes* to read, delete and **Organise** them (Gemini sorts them by person, time, contradictions and leads) | – |
| Settings / menu | **Esc** | **Esc** |

---

## How it works

```
 browser                                   server/server.mjs (Node, no deps)            providers
 ────────                                  ─────────────────────────────────            ─────────
 engine/ or assets/game.js
   owns: clock, clues, who was shown what,
   which secrets are out, the accusation
        │  POST /api/talk  (SSE) ─────────▶ builds the character's prompt from
        │                                   scenario/orient.json, for THIS chapter
        │                                   and THIS clock time; validates every
        │  ◀── text · tool · done ───────── tool call; opens the confession gate ──▶ Gemini (text)
        │
        │  GET /api/gradium-token ────────▶ mints a one-use token ──────────────────▶ Gradium
        └─ assets/voice.js ═══ WebSocket (STT / TTS) with that token ═══════════════▶ Gradium
```

Why the suspects hold up against players who try to break them:
- **Each prompt contains only what that character knows at that moment.** Memories are cut at the game clock. The killer's prompt never describes the murder.
- **Evidence is real only when the engine sends it.** It arrives as an `[EVIDENCE PRESENTED: …]` turn. A player claiming "we found your fingerprints" is treated as a bluff.
- **Secrets come out through a tool call** (`reveal_secret`). The server checks each call against the list of secrets that character may reveal in the current chapter.
- **The confession is gated by the engine.** Only after three key items have been shown to the killer does the server add a `[DIRECTOR]` note that lets him break.
- **The solution never leaves the server.** The browser gets a public bundle (`assets/case-data.js`) with no prompts and no confession text.

More detail is in [docs/architecture.md](docs/architecture.md).

---

## Project layout

```
server/            server.mjs (static files + API), log.mjs (logger shared with the tools)
prompts/           build-prompt.mjs: scenario -> per-character system prompts + public bundle
scenario/          orient.json: the case (contains the SOLUTION; never served)
engine/            the scene engine: engine.js, scenes.js, game.js (story), dialogue.js, ui.js
game-assets/       game-ready art for the engine (backgrounds, sprites, portraits, items)
assets/            shared browser code (voice.js, log.js, case-data.js, demo-dialogue.js)
                   + the code-drawn prototype (game.js, world.js, talk.js, people.js, pixel.js, portraits.js)
art/               generated art: concept, scene stills, sheets, review page, STYLE.md (the style bible)
tools/             art generation (Gemini image), asset slicing, headless-Chrome playtest driver
docs/              documentation (start at docs/README.md)
v1-mirabeau/       v1: Hôtel Mirabeau, Nice 1962 (point-and-click + Gemini Live), kept for reference
CONTEXT.md         the full project history, research and open decisions
```

## Common tasks

```bash
npm start                                   # run the game
LOG_LEVEL=debug npm start                   # ...and see every API call, tool call and SSE event
npm run build:prompts                       # scenario/orient.json -> prompts/compiled/ + assets/case-data.js
node tools/gen-scenes.mjs corridor          # regenerate one scene still (needs GEMINI_API_KEY)
node tools/gen-assets.mjs char-hale         # regenerate one asset
python3 tools/build-review.py               # slice sheets + build art/review/index.html (needs Pillow)
python3 tools/build-game-assets.py          # art/ -> game-assets/ for the engine
```

After you edit `scenario/orient.json`, run `npm run build:prompts`. The server rereads the scenario on `POST /api/reload` or on restart.

## Deployment: deploy after every push

The game is live at **https://simplon-orient.kaisspace.workers.dev**, on a Cloudflare Worker that serves the game and its API.

- **Rule:** after every push to `main`, run `npm run deploy`. There is no CI; the person or agent who pushes deploys (see [CLAUDE.md](CLAUDE.md)).
- **What `npm run deploy` does** (`tools/deploy.mjs`): checks wrangler is logged into the game's Cloudflare account, then builds and deploys exactly the committed `HEAD` from a clean checkout.
- **Check it's live:** `curl -s https://simplon-orient.kaisspace.workers.dev/api/status` should return `"live":true`.
- **Keys:** `GEMINI_API_KEY` and `GRADIUM_API_KEY` are Worker secrets (`wrangler secret put ...`) and survive deploys. They are never in the repo.
- **What gets published:** only `dist/`, built from an allow-list (`tools/build-web.mjs`). The scenario (with the solution), the prompts, the server and `.env` are never uploaded.
- **Local test of the Worker:** `npm run dev:worker` (reads keys from `.dev.vars`, which is gitignored).
- **itch.io:** `npm run build:itch` writes `dist-itch.zip`, which calls the Worker's API. Upload it as an HTML5 game with "Click to launch in fullscreen".
- **Keep in step:** `worker/index.mjs` repeats the `/api/talk` logic from `server/server.mjs`. Change both.

```bash
npm run deploy        # deploy the committed HEAD (run after every push)
npm run dev:worker    # the Worker locally at http://localhost:8787
npm run build:itch    # dist-itch.zip for itch.io
```

## Logging

- **Server and tools** use `server/log.mjs`. Lines look like `14:02:11.482 INFO [talk] turn done rid=8zzqcr character=hale model=gemini-3.8-flash chars=311 ms=3249`. Each `/api/talk` request gets a `rid`, so you can follow one conversation turn through the log. Anything named like a key or token is masked.
- **Browser** uses `assets/log.js` (`window.LOG`). Add `?debug` to the URL, or run `LOG.level('debug')` in the console. `LOG.dump()` copies the last 500 entries for a bug report.

The full guide is in [docs/logging.md](docs/logging.md).

## Documentation

| Doc | For |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Components, data flow, the anti-leak design, the voice pipeline |
| [docs/api.md](docs/api.md) | The server's HTTP API and the SSE event format |
| [docs/scenario.md](docs/scenario.md) | The scenario JSON format and how to write a new case (**spoilers**) |
| [docs/art-pipeline.md](docs/art-pipeline.md) | How the art is generated, sliced and packed |
| [docs/logging.md](docs/logging.md) | Log levels, formats, and what each scope reports |
| [art/STYLE.md](art/STYLE.md) | The locked visual style bible |
| [CONTEXT.md](CONTEXT.md) | Background research, decisions and history |
| [CLAUDE.md](CLAUDE.md) | Working rules for AI agents: deploy after every push, deploy safety |

## Status

This is a hackathon prototype.
- **Works:** the full case can be played end to end with the scripted brain, and live Gemini turns have been tested against the real API (a Major Hale interview reveals his secret through `reveal_secret`).
- **Not yet tested here:** Gradium voice end to end in a browser.
- **Grading:** the accusation is also graded in the browser so the game works offline. That means a determined player can read the answer in `case-data.js`. Move grading to the server before any public release.
