// "Taken" patches: the takeable clue objects painted into a background plate (the blotter on the table in
// No. 7, the cards on Hale's berth, ...) disappear once the player has taken them. For each one this tool
// sends a 4x zoom of the plate around the object to Gemini (tools/gen-image.mjs, RAW) asking for the same
// picture without the object, lines the answer up with the plate, and cuts only the object's box (feathered)
// into game-assets/patches/<room>-<spot>.png. The engine draws it over the plate once every takeable clue of
// the spot is in the inventory (engine/scenes.js `patch`, engine/engine.js frame()).
//
//   node tools/gen-patches.mjs                 generate + cut every patch
//   node tools/gen-patches.mjs c7-table        only the ids containing one of the arguments
//   CUT_ONLY=1 node tools/gen-patches.mjs      re-cut from the last model outputs (no API calls)
//
// Work files (model inputs, outputs, before/after previews) go to tools/assets/patches/rounds/ (git-ignored).
// Writes game-assets/patches/manifest.json: { id: { x, y, w, h } }. Copy x, y into the spot's `patch` in scenes.js.
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../server/log.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORK = join(ROOT, 'tools/assets/patches/rounds');
const MANIFEST = join(ROOT, 'game-assets/patches/manifest.json');
const log = logger('gen-patches');

// box: [x0, y0, x1, y1] in plate px, tight around the object (the cutter adds a feathered margin).
// what: the object to remove, and what should show instead. mode 'fill' = no model, OpenCV inpaint.
const PATCHES = [
  { id: 'c7-table', room: 'c7', box: [164, 396, 236, 450], what: 'the black rocker ink blotter lying on the cream fold-down tabletop (keep the fountain pen next to it). The cream tabletop continues where it was' },
  { id: 'c7-medcase', room: 'c7', box: [188, 266, 299, 390], what: 'the small open brown leather case of glass medicine ampoules standing on the corner of the fold-down table. Where it stood, show the empty cream tabletop and the wood-panelled wall and green-and-wine Art Deco panel behind it, continuing naturally' },
  { id: 'c7-pillow', room: 'c7', box: [1056, 383, 1118, 430], what: 'the small black notebook lying on the pillow beside the old man\'s head. The pillow and sheet continue where it was; the old man stays exactly as he is' },
  { id: 'c7-attache', room: 'c7', box: [163, 606, 297, 702], what: 'all the papers inside the open brown leather attaché case on the floor: the stack of letters tied with a wine-red ribbon, the documents and the small blue object. The case stays, open and empty, showing its plain brown leather interior' },
  { id: 'c2-cards', room: 'c2', box: [146, 531, 254, 615], what: 'the fan of playing cards and the single blue-backed card lying on the olive-green blanket of the berth. The blanket with its folds continues where they were (leave the cards on the floor carpet alone)' },
  { id: 'corridor-bolt', room: 'corridor', box: [1164, 278, 1209, 316], what: 'the brass door bolt hanging off the splintered frame of the forced door. The splintered dark wood of the door and frame continues where it was' },
];

const only = process.argv.slice(2);
const list = PATCHES.filter((p) => !only.length || only.some((o) => p.id.includes(o)));
mkdirSync(WORK, { recursive: true });
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
const py = (cmd, spec) => {
  const f = join(WORK, `${spec.id}.json`); writeFileSync(f, JSON.stringify({ ...spec, work: WORK }));
  return JSON.parse(execFileSync('python3', [join(ROOT, 'tools/cut-patches.py'), cmd, f], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim().split('\n').pop());
};

async function one(p) {
  if (p.mode !== 'fill' && process.env.CUT_ONLY !== '1') {
    const { in: input } = py('prep', p);
    const prompt = `This is a zoomed crop of a 16-bit pixel-art background of a 1931 night-train compartment. Reproduce this image exactly, pixel for pixel: same framing, same scale, same pixel grid, same colours, style and lamp lighting. Change only one thing: remove ${p.what}. Nothing else may move or change.`;
    const t0 = Date.now();
    const { stdout: out } = await promisify(execFile)('node', [join(ROOT, 'tools/gen-image.mjs'), join(WORK, `${p.id}-out`), prompt], { env: { ...process.env, REF: input, RAW: '1', ASPECT: '16:9' }, encoding: 'utf8' });
    log.info('generated', { id: p.id, ms: Date.now() - t0, out: out.match(/wrote (\S+)/)?.[1] });
  }
  const r = py('cut', p);
  manifest[p.id] = { x: r.x, y: r.y, w: r.w, h: r.h };
  log.info('patch', { id: p.id, x: r.x, y: r.y, w: r.w, h: r.h, preview: `tools/assets/patches/rounds/${p.id}-preview.png` });
}

for (let i = 0; i < list.length; i += 3) await Promise.all(list.slice(i, i + 3).map((p) => one(p).catch((e) => log.error('failed', { id: p.id, error: e.message }))));
mkdirSync(dirname(MANIFEST), { recursive: true });
writeFileSync(MANIFEST, '{\n' + Object.keys(manifest).sort().map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(manifest[k])}`).join(',\n') + '\n}\n');
log.info('done', { patches: list.length, manifest: 'game-assets/patches/manifest.json' });
