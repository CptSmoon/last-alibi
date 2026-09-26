# Scenarios: format and writing guide

> **Spoilers.** The case summary at the bottom gives away the solution.

A case is a single JSON file (`scenario/orient.json`). The server reads it directly. The browser receives only the public bundle that `npm run build:prompts` generates (`assets/case-data.js`).

## Top-level shape

| Key | What it holds |
|---|---|
| `id`, `title`, `tagline`, `copyrightNote` | Identity and pitch |
| `setting` | `place`, `date`, `weather`, `premise`, `playerRole`. The first sentence of `playerRole` is how characters refer to the player |
| `victim` | `id`, `name`, `age`, `role`, `foundAt`, `apparentCause`, `trueCause` |
| `solution` | `killer`, `motive`, `means`, `opportunity`, `motives[]` (the choices in the accusation form) and `accusationRequires` `{ suspect, motive, evidenceAnyThreeOf[] }` |
| `timeline[]` | The master timeline: `{ t, event, witnesses[] }`. This is for authors and is not sent to any model |
| `chapters[]` | See [Chapters](#chapters) |
| `flow[]` | The chapter ids actually played, in order. Currently `morning → ch3 → ch4`. `ch1` and `ch2` are authored but not in the flow |
| `events[]` | Ambient lines spoken in the world: `{ chapter, t, who, say, observation? }` |
| `locations[]` | Cars and their rooms |
| `evidence[]` | See [Evidence](#evidence) |
| `characters[]` | See [Characters](#characters) |
| `schedules` | `{ [chapter]: { [characterId]: [[time, waypoint], …] } }`: where each person is and when |
| `player` | The player's id, name and `look` colours |
| `brain` | `{ provider: "gemini", model, fallbackModel, thinkingLevel }` |
| `voice` | `{ provider: "gradium", sttLanguage, ttsFormat }` |

## Chapters

```json
{ "id": "ch3", "title": "II · Compartment 7", "phase": "after", "start": "07:20", "end": "10:00",
  "clock": "actions", "minutesPerInterview": 10, "minutesPerClue": 2,
  "outsideDoors": true, "compartmentsLocked": false, "playerStart": "c7_scene",
  "situation": "…what everyone knows…", "goal": "…", "endWhen": "…" }
```

- `phase` is `before` (the murder hasn't happened: no lies, secrets or evidence showing), `morning`, or `after`.
- `clock` is one of:
  - `realtime`, which advances by `secondsPerMinute`;
  - `actions`, where each interview costs `minutesPerInterview` and each clue costs `minutesPerClue`;
  - `none`.
- `situationAfterStop` + `stopAt`: extra situation text that applies once the clock passes `stopAt`.
- Times are `"HH:MM"`. Anything before noon counts as the next morning, so `00:20` comes after `23:40`.

## Evidence

```json
{ "id": "e_scorecard", "name": "Piquet score sheet", "kind": "document", "chapters": ["ch3"],
  "location": "lounge_hall", "spot": "h_scorecard", "key": true, "take": true,
  "description": "…what the player reads…", "pointsTo": "ferrand was away for 30 minutes", "about": ["hale", "ferrand"] }
```

- `kind` is one of `physical`, `document`, `fact`, `observation` or `testimony`. Physical items and documents are *put in front of* the character; the rest are *told* to them.
- `take`: `true` puts it in the inventory, `false` puts it in the notebook.
- `key` marks evidence that matters to the solution.
- Id prefixes are only a convention: `e_` evidence, `t_` testimony (usually unlocked by a secret), `o_` observation (from an event).

## Characters

| Field | Used for |
|---|---|
| `id`, `name`, `age`, `role`, `chapters[]` | Identity and the chapters where they appear |
| `isVictim`, `isKiller`, `isStaff` | Staff and the victim are not suspects in the accusation form |
| `look` | Colours for the code-drawn sprites (prototype) |
| `voice` | `{ gemini, style, gradium, gradiumName }`. `gradium` is the voice id used for TTS; `style` goes into the prompt |
| `bio`, `personality[]`, `speechStyle` | Persona |
| `relationships` | `{ otherId: "what I think of them" }` |
| `knowledge[]` | Facts they know. Prefix `AFTER: ` for things known only after the murder; lines starting `NOTE FOR THE ENGINE` never reach the model |
| `witnessed[]` | `{ t, what }`, cut at the game clock: they only remember what has already happened |
| `chapterNotes` | `{ [chapter]: "what they are doing and feeling right now" }` |
| `coverStory` | What they tell the police first (after the murder) |
| `lies[]` | `{ claim, truth, breaksWhen }`: name the evidence ids that break the lie |
| `secrets[]` | `{ id, text, revealWhen, unlocks?, promptVisibility? }` |

**Secrets** are the heart of the game:
- When the model tells one, it calls `reveal_secret(id)`. If `unlocks` names an evidence id, the player gains that clue. For example, Hale's `s_hale_absent` unlocks the testimony `t_hale_absent`.
- `promptVisibility: "engine"` keeps a secret out of every prompt. The killer's confession is the only one: it reaches the model only when the server's confession gate opens (see `CONFESSION_NEEDS` in `prompts/build-prompt.mjs`).

## Writing a new case: checklist

1. **Three-clue rule.** Every conclusion the player must reach should be supported by at least three clues.
2. **Fair play (Knox / Van Dine).** The killer appears early. No twins, no secret passages, and every clue is shown to the player.
3. **Four to six suspects.** Each has at least two of motive, means and opportunity; only the killer has all three.
4. **Every innocent has a secret** that makes them look guilty (a red herring) and a lie that covers it.
5. **Write the master timeline first,** in slots of 5–15 minutes. Then derive each character's `witnessed` from it, and each character's view only from what they could actually see or hear.
6. **Each lie must name the evidence that breaks it**, and each secret must say when it comes out. The model follows these conditions.
7. **Never describe the murder in the killer's prompt.** The `ABOVE ALL` section says he is hiding "something terrible", and that's enough.
8. Run `npm run build:prompts` and read `prompts/compiled/`. The build warns if the confession gate, the accusation or a secret's `unlocks` names evidence that doesn't exist.
9. Play the case with `LOG_LEVEL=debug` and watch for `tool call REJECTED`. Each one means a model tried something the rules don't allow.

---

## The current case: *Last Stop, Simplon-Orient* (spoilers)

**Setting.** The Simplon-Orient Express, 18–19 December 1931. An avalanche stops the train near Iselle, Italy, at 23:40. At 07:10 the envoy **Anton Lazăr** is found dead in compartment 7, bolted from the inside. **Dr Ferrand** says heart failure at about 01:30. You play **Inspector Marc Sorel** of the Sûreté, travelling in compartment 1. The Italian police arrive with the relief train at 10:00.

**Flow.** `morning` (breakfast and the tutorial; Théo runs in with the news) → `ch3` (the investigation, 07:20–10:00, where the clock moves with your actions) → `ch4` (everyone gathers in the dining car and you accuse). Chapters `ch1` (dinner) and `ch2` (the night) are fully authored for a future playable "before" section.

| Character | Role | Hiding | Gradium voice |
|---|---|---|---|
| Anton Lazăr, 60 | Romanian trade envoy, the **victim**. He "collects" other people's secrets | n/a | Graham |
| Dr Paul Ferrand, 55 | Paris physician, the **killer** | His absence from the lounge (00:10–00:40), the Passy blackmail, and the confession (engine-gated) | Rémi |
| Countess Irina Voss, 48 | Austrian widow | 1919 love letters to a Soviet commissar. Visited No. 7 at 23:15 and knocked again at 00:50 | Holly |
| Major Desmond Hale, 52 | Retired Indian Army officer who plays cards for a living | Ferrand left the game and came back soaked. Hale himself was caught with marked cards in Cairo in 1929 | British Narrator |
| Mila Novak, 26 | Cabaret singer | A forged passport (her real name is Ljudmila Horvat), and she was smoking in the corridor 00:20–00:40 | Eva |
| Stefan Brandt, 38 | Agent of a German oil company | Listened through the wall from No. 6. Paid Lazăr three bribes | Arthur |
| Théo Garnier, 31 | Sleeping-car conductor | Left his seat for grappa in the kitchen, and saw a figure pass the window at 00:28 | Toby |
| Bruno Castelli, 57 | Chef de train (staff, not a suspect) | Nothing. His log shows the dining car's north door was found unbolted at 01:00 | Austin |

**Solution.** Lazăr made Ferrand travel as his personal physician and had blackmailed him for four years over a patient's morphine death at Ferrand's Passy clinic in 1927. That night Lazăr demanded 50,000 francs. At about 00:20 Ferrand injected morphine into Lazăr's neck in place of his usual camphor-oil heart injection. Mila was standing in the corridor, so Ferrand left through the window into the snow, passed the kitchen window at 00:28, and came back in through the unbolted dining-car north door at about 00:32.

**Accusation.** The suspect `ferrand`, the motive `m_passy`, and any three of: `e_blotter`, `e_ampoule_tip`, `e_medbag`, `e_wet_shoes`, `e_footprints`, `e_scorecard`, `t_hale_absent`, `e_puncture`, `e_camphor`, `t_theo_figure`, `o_medicine`.
