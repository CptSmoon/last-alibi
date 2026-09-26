# Art pipeline

All the art is generated with a Gemini image model, then cut up and packed for the game. The look is locked in [art/STYLE.md](../art/STYLE.md): cozy top-down pixel art in the style of Gather.town, warm wood and brass, a parchment UI, and chibi characters.

```
art/concept/style-a-gather.jpg  (the style reference)
        │
        ▼  tools/gen-scenes.mjs      one "target" screenshot for each stage of the case
art/scenes/*.jpg  →  art/scene-board.jpg
        │
        ▼  tools/gen-assets.mjs      backgrounds, sprite sheets, portrait sheets, item sheets, UI kit
art/assets/<group>/<id>.jpg|png  +  art/assets/manifest.json
        │
        ▼  tools/build-review.py     slices sheets into poses and single items, builds the review page
art/assets/slices/*.png  +  art/review/index.html
        │
        ▼  tools/build-game-assets.py   resizes and converts to what the engine loads
game-assets/{bg,sprites,portraits,items}/  +  game-assets/manifest.json
```

## Tools

| Command | Does |
|---|---|
| `node tools/gen-image.mjs <out> "<prompt>" [model]` | Generates one image. Environment: `REF=a.jpg,b.png` (reference images), `RAW=1` (don't add the default style suffix), `ASPECT=16:9`. Default model `gemini-3.1-flash-image`. Retries 3 times. Prints `wrote <path> (<mime>)` on stdout, and the other tools parse that line |
| `node tools/gen-scenes.mjs [ids…]` | Generates every scene still (4 at a time), or only those whose id contains one of the arguments. Each still uses the style reference, the cast still and Sorel's character sheet as references |
| `node tools/gen-assets.mjs [ids…]` | Generates every *missing* asset (5 at a time), or regenerates the named ones by id prefix. Sheets with `cut: true` are chroma-keyed from magenta to transparent with ImageMagick (`magick`) |
| `python3 tools/build-review.py` | Needs Pillow. Slices the sheets and writes `art/review/index.html`, a page for reviewing the art scene by scene |
| `python3 tools/build-game-assets.py` | Needs Pillow. Writes the game-ready files in `game-assets/` |
| `tools/cdp.mjs` | A small headless-Chrome driver for automated playtests and screenshots (see below) |

`build-game-assets.py` also grades a few backgrounds towards the lamp-lit palette (`GRADE`), and mirrors the kitchen plate (`FLIP`), so the kitchen sits between the dining car and the lounge as on the map. `engine/scenes.js` uses the mirrored coordinates. Seated sprites (`<id>-sit.png`) are copied as they are, because they are already sized so the head matches the 300 px standing sprites.

All the Node tools read `GEMINI_API_KEY` from `.env` and log through `server/log.mjs`. With `LOG_LEVEL=debug` you also see each request, the reference count, prompt size and timing.

## Audio

The music is generated with Gemini's **Lyria** and saved as game assets; every sound effect is synthesized in code (`engine/audio.js`), so there are no sample files. No other audio sources are used.

```bash
node tools/gen-music.mjs --list          # the tracks, their model and prompt
node tools/gen-music.mjs                 # generate all of them (2 at a time)
node tools/gen-music.mjs investigation   # regenerate one (or several) by id
KEEP_RAW=1 node tools/gen-music.mjs title   # also keep the untouched model output
```

- **API:** `POST /v1beta/interactions` with `{ model, input, response_format: { type: 'audio' } }`. Audio comes back base64 in `steps[].content[]` (`type: 'audio'`, `mime_type: 'audio/mpeg'`). Full tracks use `lyria-3.5` (about 2.5 to 3 minutes); the two ending stings use `lyria-3-clip-preview` (30 s). The tool retries 4 times; the prompt filter occasionally refuses a prompt at random, and a retry usually gets through.
- **Tracks:** `title`, `avalanche`, `breakfast`, `investigation`, `accusation` (looped), and `solved` and `failed` (stings). The prompts are in `TRACKS` in the tool. Every prompt ends with a shared line that sets the world and forbids vocals.
- **Packing (ffmpeg):** trims silence at both ends, caps the length (`max`), levels to about −20 LUFS (loops) or −18 LUFS (stings), fades the edges and encodes mp3 at 128 kbps. It writes `game-assets/audio/music-<id>.mp3` and `game-assets/audio/music.json`, which the engine reads for the loop flag. The whole set is about 11 MB.
- **In the game:** `AUDIO.music('<id>')` crossfades (2.8 s) and starts the next pass of a loop before the current one ends. Useful console checks are `AUDIO.state()` and `AUDIO.list()`, `AUDIO.sfx('rumble')`, `AUDIO.seek(140)` (to hear the loop seam), and `LOG.history().filter(e => e.scope === 'audio')`.

## Automated playtesting

```js
import { launch } from './tools/cdp.mjs';
const b = await launch('http://localhost:5173/prototype.html?debug');
await b.eval("GAME.newGame(); GAME.startChapter('ch3'); GAME.openTalk('hale')");
await b.sleep(800);
await b.canvasShot('/tmp/hale.png');
console.log(await b.eval('LOG.dump()'));   // the game's own log, as text
await b.close();
```

Set `CHROME=/path/to/chrome` if Chrome isn't in the default macOS location. With `LOG_LEVEL=debug`, the page's console lines are echoed into the tool's log as `[cdp] page …`.

## Prototype art

The prototype at `/prototype.html` draws everything in code:
- `assets/pixel.js` provides the `PX` toolkit: palette, rects, dithering, a 5×7 font, panels, name tags and the blip sound.
- `assets/people.js` draws the 10×18 people.
- `assets/portraits.js` draws 48×48 portraits.
- `assets/world.js` draws the 192×22-tile train.

The only generated image it uses is the title key art.
