# Logging

The project has two loggers with the same shape, `scope.info(message, fields)`: one for Node (the server and the tools) and one for the browser.

## Server and tools: `server/log.mjs`

```js
import { logger } from '../server/log.mjs';
const log = logger('talk');
log.info('turn done', { character: 'hale', ms: 812 });
```

```
14:14:02.767 INFO  [talk] turn done rid=8zzqcr character=hale model=gemini-3.8-flash chars=311 ms=3249
```

| Env | Values | Default |
|---|---|---|
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error`, `silent` | `info` |
| `LOG_FORMAT` | `json`: one object per line, `{ t, level, scope, msg, …fields }` | Text |
| `NO_COLOR` | Any value turns off the colours | Colours on a TTY |

`warn` and `error` go to stderr; everything else goes to stdout.

**Secrets are masked.** Any field whose name contains `key`, `token`, `secret`, `password` or `authorization` is replaced by `<N chars>`. Even so, don't log prompts or keys; log ids and sizes instead.

### What the server logs

| Scope | Level | Event |
|---|---|---|
| `server` | info | Startup (port, models, whether voice is on), scenario loaded or reloaded, each `/api/*` request with `status` and `ms` |
| `server` | warn | Missing API keys at startup, `blocked path` (someone asked for `.env`, `scenario/` and so on), static 404s, API responses ≥ 400 |
| `server` | error | Unhandled request errors, uncaught exceptions and unhandled rejections |
| `server` | debug | Every static file served |
| `talk` | info | `turn start` (character, chapter, clock, input kind, evidence, history size), each `tool call`, `confession gate OPEN`, `turn done` (model actually used, characters streamed, ms), `client closed early` |
| `talk` | warn | Bad character, chapter or evidence; **`tool call REJECTED`**, meaning the model tried to reveal something it may not |
| `talk` | error | `turn failed` |
| `talk` | debug | The player's text (first 200 chars) and every non-text SSE event |
| `gemini` | debug / warn / error | Request size, time to open the stream, fallback to the second model, HTTP errors with the start of the response body |
| `gradium` | info / warn / error | Token minted (ms, expiry), key missing, mint failed |
| `notes` | info | `organize start` (note, fact and character counts, input chars), `organize done` (model used, section sizes, ms). Never the note text |
| `notes` | warn / error | `bad request` (the reason), no Gemini key, fallback to the second model, Gemini HTTP errors, `organize failed` |
| `notes` | debug | The full model input (notes and facts) and the organised output |

Every `/api/talk` request gets a `rid`. To follow one turn, run `grep rid=8zzqcr`.

### What the tools log

- **`build-prompt`:** the scenario summary and the number of prompts written. It warns when the confession gate, the accusation or a secret's `unlocks` names evidence that doesn't exist. Each prompt's size is logged at debug.
- **`gen-image`, `gen-scenes`, `gen-assets`:**
  - start, then a per-item `ok` or `FAIL` with timing;
  - retries, with the reason;
  - failed ImageMagick cut-outs;
  - a final summary listing the failed ids.
- **`cdp`:** Chrome launch and close, and page exceptions. At debug level it also logs every page console line and screenshot.

## Browser: `assets/log.js` (`window.LOG`)

Load it before the other scripts. Every module has a fallback (`(window.LOG || { scope: () => console })`), so a page without `log.js` still works; it just logs through plain `console`.

```js
const log = LOG.scope('talk');
log.info('open', { who: 'hale' });        // [1.48s] [talk] open {who: 'hale', …}
log.time('render', () => heavyWork());    // debug: "render took 3.2 ms"
```

| To | Do |
|---|---|
| See debug logs | Add `?debug` to the URL, or run `LOG.level('debug')` in the console. The level is kept in `localStorage['simplon-log']` |
| Silence logs | `LOG.level('silent')` |
| Get a bug report | `LOG.dump()` returns the last 500 entries as text and copies them to the clipboard, including entries below the current level |
| Inspect entries | `LOG.history()` returns an array of `{ t, level, scope, msg, fields }` |

Uncaught errors and unhandled promise rejections are logged automatically in the `page` scope.

### What the browser logs

| Scope | Events |
|---|---|
| `game` (prototype) | New game, chapter start (clock, who is present), item taken or note learned, clock advances, NPCs moving between waypoints, world events, entering a car, interactions, gather, accusation opened or graded (verdict, suspect, motive, evidence), save and load, settings, server status or its absence |
| `talk` (prototype) | Open and close, brain switch, ask, present (and whether the confession gate is open), live turn start and done (ms, chars), time to first words, each tool call (a warning if the server rejected it), secret revealed (and whether it's the confession), mood, errors |
| `voice` | Gradium token requests; TTS socket open, first audio (latency), done, errors and unexpected close; STT listening, partial text, the final "heard" text, flush timeout; microphone unavailable; playback flushes |
| `world` (prototype) | Tile world built (rooms, doors, waypoints); failed NPC pathfinding |
| `story` (engine) | Logged by `engine/game.js` |
| `notes` (engine) | `note added` (id, length, clock, scene, who, typed or voice), `note deleted`, `notes cleared (new game)`, dictation start and done, `organize start` / `organize done` (model, section sizes, ms), `organize failed, sorting locally`, `organized locally`. The note text only at debug |
| `page` | Logger ready, uncaught errors |
