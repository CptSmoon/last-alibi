# Server API

`server/server.mjs` locally (default `http://localhost:5173`). In production, `worker/index.mjs` serves the same endpoints at https://simplon-orient.kaisspace.workers.dev, adding per-IP rate limits (`429` with `{ error }`) and CORS for itch.io; `/api/reload` exists only locally. See the README's *Deployment* section.

The local server has no dependencies and no session state; each request carries what it needs. Every `/api/*` request is logged with its status and duration (see [logging.md](logging.md)).

## `GET /api/status`

Tells the page which features the server can offer.

```json
{ "live": true, "brain": true, "voice": true, "model": "gemini-3.8-flash" }
```

| Field | Meaning |
|---|---|
| `brain` | `GEMINI_API_KEY` is set, so live AI characters are available |
| `voice` | `GRADIUM_API_KEY` is set, so speech is available |
| `live` | `brain && voice` |
| `model` | The primary Gemini model from `scenario.brain.model` |

If the call fails (for example, the page was opened without the server), both front ends fall back to the scripted brain with voice off.

## `POST /api/talk` (Server-Sent Events)

Runs one conversation turn with one character.

**Request body**

```json
{
  "character": "hale",
  "chapter": "ch3",
  "now": 460,
  "history": [ { "role": "user", "parts": [{ "text": "…" }] }, { "role": "model", "parts": [ … ] } ],
  "input": { "kind": "say", "text": "Did the doctor leave the table?" },
  "shown": ["e_scorecard"],
  "revealed": []
}
```

| Field | Notes |
|---|---|
| `character` | A character id. It must list `chapter` in its `chapters` |
| `chapter` | A chapter id from the scenario |
| `now` | Game clock in minutes. Times before noon count as the next day: `07:40` is `(7 + 24) * 60 + 40`. Defaults to the chapter start |
| `history` | Gemini `contents` from earlier turns with this character in this chapter. Echo back the `turns` from `done`. Only the last 40 are used |
| `input.kind` | `say` (with `text`, max 800 chars), `present` (with `evidence` id; only allowed after the murder), or `greet` |
| `shown` | Evidence ids already shown to this character. Used by the confession gate |
| `revealed` | Secret ids this character has already given up |

**Errors before streaming:** `400 { error: "bad character or chapter" }`, `400 { error: "bad evidence" }`, `503 { error: "GEMINI_API_KEY missing" }`.

**Stream.** The response is `text/event-stream`. Each event is one `data: {json}` line, and every event has a `type`.

| `type` | Fields | Meaning |
|---|---|---|
| `text` | `delta` | The next piece of the spoken answer. Show it and feed it to TTS |
| `tool` | `name`, `args`, `ok`, `unlock` | A tool call and the server's verdict. Apply it only if `ok`. For `reveal_secret`, `unlock` is the evidence id the secret gives the player (or `null`) |
| `done` | `turns`, `gateOpen` | The new turns to append to `history`. `gateOpen` is true when the confession gate opened on this turn |
| `error` | `message` | The model call failed (after trying the fallback model). The stream ends |

**Tools the model can call**

| Tool | Args | The server accepts it when |
|---|---|---|
| `reveal_secret` | `secret_id` | The id is one of this character's secrets, it's after the murder, and (for the confession) the gate is open |
| `set_mood` | `mood` (`calm`, `nervous`, `angry`, `grieving`, `defensive`, `relieved`, `broken`), `trust` 0–5 | `mood` is a string |
| `end_interview` | `reason` | Always |

## `GET /api/gradium-token`

Returns a short-lived, **single-use** Gradium token for one WebSocket (STT or TTS). The client asks for a new one for every socket.

```json
{ "token": "…", "expires_at": "…" }
```

`503` if `GRADIUM_API_KEY` is missing; `502` if Gradium refuses.

## `POST /api/claims`

Turns one answer a character just gave into structured claims, for the notebook's **Statements** tab and the
contradiction check (`engine/board.js`). Called by the browser after every live answer.

```json
{ "speaker": "castelli", "question": "Did you see the doctor last night?", "answer": "I saw Dr Ferrand in the dining car at a quarter past one." }
-> { "claims": [{ "about": "ferrand", "place": "dining", "from": "01:15", "to": "01:15", "how": "saw", "text": "Castelli says he saw Dr Ferrand in the dining car at 01:15." }] }
```

`place` is one of `c1`..`c7`, `corridor`, `dining`, `lounge`, `outside`, `unknown`. The model sees only the spoken
question and answer, the cast, the rooms and who sleeps where; never the solution or secrets. Gemini
(`brain.fallbackModel` first), JSON schema, temperature 0, about 1 s. Contradictions are found in the browser, not by
the model: same person, overlapping times (10 min slack), different places. On the Worker it shares `TALK_LIMIT`.

## `POST /api/english`

Rewrites a push-to-talk transcript in English. Gradium's `json_config.language: "en"` is only a hint: accented or
noisy English sometimes comes back as Spanish or French (measured 2026-09-26: a Spanish-sounding clip stayed Spanish
in 5 of 5 runs, even with `temp: 0`). `assets/voice.js` calls this only when a transcript looks non-English
(accented letters, or foreign function words such as `usted`, `vous`, `você`); English transcripts never hit it.

```json
{ "text": "¿Dónde estaba usted anoche a la una?" }
-> { "text": "Where were you last night at one o'clock?", "changed": true }
```

Gemini (`brain.fallbackModel` first for speed, then `brain.model`), temperature 0, about 0.5 s. Max 400 characters.
Errors: 400 (no text / too long), 503 (no `GEMINI_API_KEY`), 502 (both models failed); the browser then keeps the
original transcript. On the Worker it shares `VOICE_LIMIT`.

The speech-to-text client also sends 1 s of silence before `flush` when the player releases the mic: without it the
model held back its last ~800 ms and dropped the final word ("last night" came back as "last").

## `POST /api/notes/organize`

The notebook secretary (`server/notes.mjs`). Sorts the player's own quick notes, plus the public facts he has found, into an organised notebook. It is a secretary, not a detective: it never sees the solution, secrets, lies or unfound evidence, and it is told not to guess the killer.

**Request body**

```json
{
  "notes": [ { "id": "n4", "text": "Hale: doctor left the card table 00:10-00:40, came back soaked", "clock": "07:20", "place": "Sleeping car", "with": "Major Hale" } ],
  "facts": ["e_puncture", "e_camphor"],
  "people": ["lazar", "ferrand", "hale", "mila"]
}
```

| Field | Notes |
|---|---|
| `notes` | 1–80 notes. `text` is cut to 400 chars; `id` must be unique (`[\w-]`, max 24). `clock` (`HH:MM`), `place` and `with` are optional context |
| `facts` | Evidence ids the player has found (`G.items` + `G.notes`). Unknown ids are dropped. The server adds only each one's public `name` and `description` |
| `people` | Character ids; the server adds only their `name` and `role` |

The whole model input is capped at 24,000 chars. Gemini is called with `responseMimeType: application/json` and a `responseSchema`, using `scenario.brain.model` and then `fallbackModel` on failure.

**Response `200`**

```json
{
  "summary": "Notes examine the movements of passengers and the doctor during the night…",
  "people":   [ { "person": "hale", "points": [ { "text": "Stated that Dr Ferrand left the card table from 00:10 to 00:40…", "sources": ["n4"] } ] } ],
  "timeline": [ { "time": "00:10", "event": "Dr Ferrand leaves the card table, according to Major Hale.", "sources": ["n4"] } ],
  "questions": [ { "kind": "contradiction", "text": "Did Dr Ferrand play cards all night, or was he absent between 00:10 and 00:40?", "sources": ["n2", "n4"] } ],
  "leads":    [ { "text": "Establish who occupies compartment 3 where wet shoes were found.", "sources": ["n1"] } ],
  "model": "gemini-3.8-flash"
}
```

`sources` are the note ids sent, or `f:<evidence id>` for a found fact; anything else is removed. `person` is a sent character id or `other`. `timeline` is sorted as the night runs (12:00–23:59 first, then after midnight), `time` is `HH:MM` or `?`. `questions[].kind` is `contradiction` or `open`; there are at most 5 `leads`.

**Errors:** `400 { error }` for a bad body (no notes, too many, too long, duplicate ids), `503 { error: "GEMINI_API_KEY missing" }`, `502 { error: "organize failed" }` when both models fail. On any error the browser falls back to a simple local grouping (by person mentioned and by time) and says that AI organising needs the server.

## `POST /api/reload`

Rereads `scenario/orient.json` without restarting the server. Returns `{ ok: true }`. Run `npm run build:prompts` too if the browser bundle needs to change.

## Static files

Only these paths are served: `/`, `/index.html`, `/prototype.html`, `/cast.html`, `/plan.html`, `/assets/**`, `/engine/**`, `/game-assets/**`. Everything else returns 404, including `.env`, `scenario/`, `prompts/` and `server/`. Responses are sent with `cache-control: no-store`.
