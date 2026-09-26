# Murder mystery game: full context (as of 26 Sept 2026)

Owner: Kais Ben Daamech (Rowads). Workspace: Kais Universe (`c241925972fe6987`), item `murder-mystery-game/`.

## 1. What Kais asked for
1. **Original request:**
   - A retro 2D murder mystery game.
   - Research the genre.
   - Write scenarios and code them.
   - Players talk to the characters by voice using **Gemini Live**. Each character has its own prompt covering their life, personality, and what they witnessed.
   - Plan the Gemini Live integration.
   - Generate example visuals **using code only**.
2. **Correction (after v1):** "I want to be able to move in a 2D world with scenes, with rooms I move across. The characters should be there and move in the world, depending on the chapters. Like **Among Us**." v1 was point-and-click screens plus a separate interrogation screen. That is the wrong shape.
3. **Next scenario:** start with a **murder on the Orient Express**, and generate the example with that.

## 2. What exists (v1: Hôtel Mirabeau, Nice 1962)
| File | What it is |
|---|---|
| `index.html` | Plan doc: research, loop, scenario, prompts, Gemini Live architecture, anti-leak, art, stack, cost, roadmap, decisions |
| `title.html`, `scene.html`, `interrogation.html`, `cast.html` | Code-only pixel-art prototypes (320×180 canvas) |
| `scenario/mirabeau.json` | Scenario as data: setting, victim, solution, timeline, locations, 17 evidence items, 6 characters (bio, personality, speech, Gemini voice, relationships, knowledge, witnessed, cover story, lies with break conditions, secrets with reveal conditions/unlocks/`promptVisibility`) |
| `prompts/build-prompt.mjs` | Compiles the scenario into per-character system instructions, the Live config (tools, PTT, transcription, resumption, compression) and `assets/case-data.js`. Run with `node prompts/build-prompt.mjs` |
| `prompts/compiled/*.txt` | The 6 compiled prompts |
| `assets/pixel.js` | `PX` toolkit: palette, `screen`, `rect`/`px`/`line`/`ellipse`/`dither`/`vgrad`, `sprite(rows, key)`, 5×7 font `text()`, `wrap`, `panel`, `nameTag`, rain, `blip` |
| `assets/portraits.js` | `PORTRAITS.draw(ctx, id, x, y, {mouth 0-2, blink, mood, t})` renders procedural 48×48 portraits: helene, lucien, solange, armand, margot, emile, roux |
| `assets/interrogation.js` | Engine that owns the truth, plus two "brains": scripted demo and Gemini Live. Tool handling, confession gate, renderer. Some Mirabeau-specific ids are hardcoded |
| `assets/demo-dialogue.js` | Scripted keyword answers so the demo works with no key |
| `assets/live-client.js` | Browser Gemini Live client over raw WebSocket: PTT mic 16 kHz PCM16, 24 kHz player with level meter, transcripts, tool calls (SILENT responses), resumption, goAway |
| `server/token-worker.js` | Cloudflare Worker: mints ephemeral tokens with the config locked; `/api/present` (confession gate), `/api/reveal`, `/api/accuse` |

Verified: every page runs in jsdom with no errors, the canvas output was rendered and inspected, and the demo evidence-to-confession chain works. **Not verified:** a real Gemini Live session. There is no Gemini key in the vault, and the container proxy blocks WebSocket upgrades. `curl` does get `101` from the endpoint.

## 3. Research: Gemini Live API (checked against Google docs, 2026-09-26)
- **Models:**
  - `gemini-3.8-live` is GA (2026-09-15): native audio, async function calling by default, 30 voices, 99 languages.
  - `gemini-3.8-live-extended-thinking` is also GA.
  - The 2.0/2.5 Live models are shut down or restricted, and no half-cascade models remain.
- **Connection:**
  - Endpoint: `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=…`, or `…BidiGenerateContentConstrained?access_token=<ephemeral>`.
  - The first message must be `setup`.
  - Audio in is 16 kHz PCM16 in 20–40 ms chunks; audio out is 24 kHz PCM16.
  - JS SDK: `@google/genai` (2.24.0).
- **Ephemeral tokens:**
  - Minted with `authTokens.create` / `POST v1beta/auth_tokens`.
  - `uses` defaults to 1; `expireTime` defaults to 30 min; `newSessionExpireTime` defaults to 60 s.
  - `liveConnectConstraints` locks the model and config, so the prompt stays server-side.
  - Gemini API only; not documented for Vertex.
- **Config:**
  - `systemInstruction` is best ordered persona → rules → guardrails.
  - Voice is set via `speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName`.
  - There is no `languageCode`; the model follows the user's language.
  - Affective dialog was removed on 3.8, and proactive audio is always on.
- **Voices:** Zephyr/Autonoe bright · Puck/Laomedeia upbeat · Charon/Rasalgethi informative · Kore/Orus/Alnilam firm · Callirrhoe/Umbriel easy-going · Algieba/Despina smooth · Iapetus/Erinome clear · Fenrir excitable · Leda youthful · Aoede breezy · Enceladus breathy · Algenib gravelly · Achernar soft · Schedar even · Gacrux mature · Pulcherrima forward · Achird friendly · Zubenelgenubi casual · Vindemiatrix gentle · Sadachbia lively · Sadaltager knowledgeable · Sulafat warm.
- **Limits:**
  - 15 min audio-only session without compression; `contextWindowCompression.slidingWindow` removes that limit.
  - Connections last about 10 min, then `goAway` → `sessionResumption` handle (valid 2 h).
  - Context is 128k tokens; audio costs about 25 tokens/s.
  - The system instruction can't change mid-session → one session per character.
- **Tools:**
  - Declared as `functionDeclarations`; NON_BLOCKING is the default on 3.8.
  - Responses take `scheduling`: SILENT, WHEN_IDLE or INTERRUPT.
  - Transcription is enabled with `inputAudioTranscription: {}` / `outputAudioTranscription: {}`.
- **Voice activity and turn-taking:**
  - Push-to-talk: set `realtimeInputConfig.automaticActivityDetection.disabled: true` and send `activityStart`/`activityEnd` yourself.
  - Barge-in arrives as `interrupted`; flush playback when it does.
  - `sendClientContent` is ordered, but `turnComplete: true` interrupts, so combine messages into one turn.
- **Pricing:** audio in $3/1M tokens (≈$0.005/min), audio out $12/1M (≈$0.018/min). A 10-minute two-way conversation is ≈$0.23, so a full case is ≈$0.60–1.00.

## 4. Research: game design
- **Deduction references:**
  - Obra Dinn: confirm answers in batches of 3.
  - Golden Idol: fill in the deduction from found words.
  - Ace Attorney: press vs present.
  - L.A. Noire: label what a tone will do.
  - Her Story: free input returning authored content.
  - Paradise Killer / Shadows of Doubt: evidence tied to claims, form submission.
  - Murder-party kits: secrets revealed in tiers.
- **How LLM suspects fail** (Vaudeville, HN Claude murder game, Inworld Origins, arXiv 2609.23043 "knowledge trees"):
  - They invent alibis (58% of errors) and people (28%).
  - Bluffs ("we tracked his GPS") get confessions.
  - Role-play escapes work: "roleplay is over", "tomorrow's newspaper", "I'm your lawyer".
  - They forget earlier dialogue.
- **Mitigations built in:**
  - Each prompt holds only what that character knows.
  - The killer's prompt **excludes** the murder.
  - Evidence only reaches the model as engine-sent `[EVIDENCE PRESENTED]` turns, and a bare claim counts as a bluff.
  - The confession is engine-gated (3 key items shown to the killer) and injected as a `[DIRECTOR]` note.
  - Tool calls are validated server-side.
  - The accusation is a fixed form graded all at once.
  - An optional transcript monitor uses a text model.
- **Writing rules:**
  - Three-clue rule for every conclusion.
  - Knox/Van Dine fair play.
  - Each innocent has their own secret (the red herrings).
  - 4–6 suspects; each has at least 2 of motive/means/opportunity, and only the killer has all 3.
  - A master timeline in 5–15 min slots.
- **Pixel art:**
  - 320×180 with integer scaling.
  - Palettes: PICO-8, DB32, Endesga.
  - Portraits 48–64 px, dialogue box in the bottom third, typewriter text with blips, optional CRT.

## 5. Plan for v2 (not built yet)
- **World:** top-down, Among Us / Zelda-like, walking with WASD or arrows.
  - The camera follows the player through connected rooms.
  - Small chunky characters (about 16–24 px) with walk cycles and name tags.
  - Proximity "E to talk" opens a Gemini Live conversation with the portrait overlay.
  - Clues are world interactables; a map overlay is also planned.
- **NPCs:** they follow **schedules per chapter**, walking between waypoints. Where someone is, and when, is itself evidence.
- **Chapters** (Orient Express): 1 Departure/dinner → 2 The night (movements, the murder off-screen) → 3 Snowbound morning, body found, investigation → 4 Gathering and accusation.
- **Copyright:** Christie's *Murder on the Orient Express* (1934) is still in copyright (she died in 1976, so it runs to about 2046 in the EU/UK). Keep the **train and setting** (real, historic) but write an **original plot and cast**, not Ratchett, Poirot or the twelve-stabbings solution. Working pitch: "Last Stop, Simplon-Orient": an avalanche stops the train in the Alps, and a diplomat dies in a compartment locked from inside.
- **Reuse:**
  - PX toolkit, portrait system (new cast), live-client, token worker, and build-prompt (generalise its Mirabeau-specific strings).
  - The interrogation engine has Mirabeau ids hardcoded (`secretsTotal`, `s_armand_confession`); generalise it.
  - Scenario JSON gains `chapters[]` with per-character `schedule` (time, room, waypoint, activity).

## 6. Open decisions for Kais
Who pays for the voice (free cap, BYO key, or paid) · voice only or voice + typing · launch languages · hand-written vs generated scenarios · add a Gemini API key to ExtraSafe for real testing.
