// Generate every game asset in the locked style (art/STYLE.md), using the approved scene stills as references.
//   node tools/gen-assets.mjs                 -> everything missing
//   node tools/gen-assets.mjs bg-c7 char-hale -> only those (by id prefix), always regenerated
// Output: art/assets/<group>/<id>.jpg (+ .png cut-outs for sprites/items/ui), art/assets/manifest.json
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../server/log.mjs';

const log = logger('gen-assets');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const A = (...p) => join(ROOT, 'art', ...p);
const STYLE_REF = A('concept/style-a-gather.jpg'), CAST_REF = A('scenes/01-dining-breakfast.jpg'), SOREL_REF = A('characters/sorel-sheet.jpg');
const S = (n) => A('scenes', n);

const STYLE = 'Art style: EXACTLY the attached reference game art: cozy top-down RPG pixel art like Gather.town, slight 3/4 tilt, warm lamp light, rich wood panelling, brass, green and wine-red Art Deco patterns, soft pixel shading, dark outlines, cute chibi characters with big heads. Same pixel density, palette and outline weight as the reference. Setting: the Simplon-Orient Express, December 1931, snowbound in the Alps.';
const NO_TEXT = 'No text, no letters, no numbers, no labels, no UI anywhere in the image.';
const KEY = 'Place everything on a perfectly flat, uniform pure magenta (#FF00FF) background with no shadows on the background, no gradient, no floor, so it can be cut out.';
const EMPTY = 'Redraw the SAME room from the SAME camera as the first attached image, with identical layout, walls, windows, furniture, floor, colours and lighting, but completely EMPTY of people: remove every character, every name label, every UI element (the buttons, the title plate, the time panel), every sparkle, speech bubble and "!" marker. Where the UI covered the image, continue the scenery naturally. The result is a clean background plate for a game.';

const LOOKS = {
  sorel: 'Inspector Marc Sorel: a man about 35, short dark-brown hair, clean-shaven, strong eyebrows, belted camel trench coat, dark trousers, brown fedora with a dark band, holding a small notebook',
  ferrand: 'Dr Ferrand: older man, grey hair, short grey beard, round glasses, brown tweed three-piece suit',
  irina: 'Countess Voss: woman about 48, dark wavy hair, pearl necklace, wine-red velvet gown, white fur stole',
  hale: 'Major Hale: man about 52, ginger hair, big ginger moustache, olive-khaki tweed suit',
  mila: 'Mila Novak: young woman, glossy black bob with a small purple hair ornament, purple dress, red lips',
  brandt: 'Herr Brandt: man about 38, pale blond slicked hair, round glasses, dark grey suit',
  theo: 'Théo: young sleeping-car conductor, brown Wagons-Lits uniform with brass buttons, brown peaked cap with gold band',
  castelli: 'Castelli: older train manager, big white moustache, navy uniform with gold braid, navy kepi with gold band',
  cook: 'the cook, Luigi: plump man in white chef jacket, white apron and tall white toque, dark moustache',
};
const CHAR_REF = { sorel: [SOREL_REF, CAST_REF], cook: [S('06-kitchen.jpg')] };

const ASSETS = [];
const add = (id, group, refs, prompt, o = {}) => ASSETS.push({ id, group, refs, prompt, ...o });

// ---- backgrounds: one plate per stage ----
const BG = [
  ['bg-night', '00-avalanche-night.jpg', 'Remove only the UI (buttons, title plate, time panel). Keep the train, the avalanche and the night scenery exactly.'],
  ['bg-dining', '01-dining-breakfast.jpg', 'Keep the tables set for breakfast (cups, croissants, lamps).'],
  ['bg-corridor', '03-corridor.jpg', 'Keep the seven numbered doors, the forced door 7 with splinters and the call board. Remove the handkerchief on the carpet.'],
  ['bg-c7', '04-compartment-7.jpg', 'Also remove the victim\'s body (leave the berth with its rumpled wine-red blanket and pillow), the black notebook, the pen, the ink blotter, the small ampoule case and the bundles of letters and papers (leave the empty table and the open empty attaché case). Keep the open window, the snow on the sill and the puddle on the floor.'],
  ['bg-lounge', '05-lounge.jpg', 'Remove the score sheet from the card table (keep the scattered playing cards).'],
  ['bg-kitchen', '06-kitchen.jpg', 'Remove the cook, the two small glasses and the bottle. Keep the conductor\'s cap on its hook and the footprints seen through the window.'],
  ['bg-outside', '07-outside-snow.jpg', 'Remove the inspector and the small glinting glass object. Keep the train, the buried engine, the open window and the line of footprints.'],
  ['bg-c3', '08-compartment-3.jpg', 'Remove the doctor\'s leather bag (the seat stays). Keep the shoes under the berth and the trousers on the heater.'],
  ['bg-c6', '09-compartment-6.jpg', 'Remove the tooth glass from the shelf (keep the folded towel).'],
];
for (const [id, still, extra] of BG) add(id, 'backgrounds', [S(still), STYLE_REF], `${EMPTY} ${extra} ${NO_TEXT}`, { scene: still });
const COMP = [
  ['bg-c1', "Compartment 1, the inspector's own sleeping compartment: a made-up berth, a small leather suitcase, a brown fedora hook, a folded newspaper, a writing case."],
  ['bg-c2', "Compartment 2, Major Hale's compartment: an army kitbag and a battered leather valise, a regimental photograph, a bottle of whisky, playing cards on the seat."],
  ['bg-c4', "Compartment 4, Mila Novak's compartment: a vanity case, sequinned dresses hanging, a feather boa, sheet music, a photograph of an old woman."],
  ['bg-c5', "Compartment 5, Countess Voss's compartment: hat boxes, a jewellery case, a fur coat on a hanger, a silver-framed photograph of a young man in uniform, a vase of wilted roses."],
];
for (const [id, what] of COMP) add(id, 'backgrounds', [S('08-compartment-3.jpg'), STYLE_REF], `Using the first attached image as the exact template for camera, size, walls, window, berth position and lighting, draw a DIFFERENT sleeping compartment on the same train, empty of people. ${what} No snow indoors. Do NOT draw any UI: no buttons, no title plate, no time panel, no labels (remove the ones in the template). ${STYLE} ${NO_TEXT}`);

// ---- characters: sprite sheets + dialogue portraits ----
for (const [c, look] of Object.entries(LOOKS)) {
  const refs = [STYLE_REF, ...(CHAR_REF[c] || [CAST_REF])];
  add(`char-${c}`, 'characters', refs, `Game sprite sheet of one character, ${look}. Exactly the same character and chibi proportions as in the attached game screenshots. One row of six full-body poses, evenly spaced, all the same size, feet on the same line: 1 facing the viewer standing, 2 facing left standing, 3 facing right standing, 4 facing away (back), 5 walking (side view, mid-stride), 6 talking with an expressive hand gesture. ${STYLE} ${KEY} ${NO_TEXT}`, { cut: true });
  add(`portrait-${c}`, 'portraits', refs, `Dialogue portrait sheet for a visual-novel style conversation box: three square bust portraits in a row of ${look}, chest-up, facing slightly towards the viewer, in the same cute pixel art style as the attached game (bigger and more detailed than the in-game sprites). Expressions: 1 neutral, 2 nervous or worried (a sweat drop), 3 shocked or angry. Each portrait sits inside the same small square frame of cream parchment with a thin gold border, on a warm dark wood background. ${NO_TEXT}`);
}
add('char-lazar-body', 'characters', [S('04-compartment-7.jpg'), STYLE_REF], `A single game sprite: the victim Anton Lazăr (bald with a grey fringe, a monocle, grey moustache) lying dead on his back, seen from above exactly as in the attached screenshot, head on a white pillow, body under a wine-red blanket, eyes closed. Only the pillow, the man and the blanket, no bed frame. ${STYLE} ${KEY} ${NO_TEXT}`, { cut: true });

// ---- clue items ----
const ITEMS = {
  'items-c7': ['a small black leather notebook', 'an ink blotter on a wooden rocker with faint mirrored writing marks', 'a bundle of old love letters tied with a pink ribbon', 'a folded official document with a red wax seal', 'a small open leather case holding six glass ampoules', 'a broken brass door bolt with two screws', 'a lace handkerchief with a monogram'],
  'items-train': ['the snapped-off glass neck of a medical ampoule', 'two small grappa glasses and a nearly empty grappa bottle', 'a card score sheet with a pencil', "a doctor's black leather bag, open, showing a morphine case and a syringe", 'a tooth glass (tumbler) upside down', 'two passports (one green, one blue)', 'a deck of playing cards fanned out'],
  'items-facts': ['a pair of black patent evening shoes stuffed with newspaper', 'a conductor\'s call log book with a pencil on a string', 'a thick train log book with a brass clasp', 'a small magnifying glass', 'the brown fedora of the inspector', 'a small open notebook with a pencil'],
};
for (const [id, list] of Object.entries(ITEMS)) add(id, 'items', [STYLE_REF, S('04-compartment-7.jpg')], `Game item sprite sheet: ${list.length} separate objects in one row, evenly spaced, each drawn as a small pickable game item in the same cozy pixel art style and 3/4 top-down angle as the attached game: ${list.map((x, i) => `${i + 1}) ${x}`).join('; ')}. Each object isolated with space around it, same scale. ${KEY} ${NO_TEXT}`, { cut: true });

// ---- UI kit ----
add('ui-kit', 'ui', [STYLE_REF, CAST_REF], `Game UI kit sheet matching EXACTLY the UI in the attached game screenshots (cream parchment panels with thin gold borders, cozy pixel art): arranged in a neat grid with space between pieces: three square icon buttons (a folded map, two people, a gear), an empty scroll-shaped title plate, an empty rectangular time panel with a small clock icon, an empty rounded name label, a wide empty dialogue box with a square portrait slot on the left, an empty square inventory slot and a selected (gold-glowing) inventory slot, a white speech bubble with "!" , a white speech bubble with three dots, a small gold sparkle, a gold down-arrow cursor. ${KEY} No text except the "!" and the three dots.`, { cut: true });

// ---- run ----
const only = process.argv.slice(2);
const todo = ASSETS.filter((a) => (only.length ? only.some((o) => a.id.startsWith(o)) : !existsSync(A('assets', a.group, a.id + '.jpg')) && !existsSync(A('assets', a.group, a.id + '.png'))));
log.info('start', { todo: todo.length, total: ASSETS.length, only: only.join(',') || undefined });
const t0 = Date.now(), failed = [];
const run = (a) => new Promise((res) => {
  const out = A('assets', a.group, a.id), ts = Date.now();
  log.debug('generating', { id: a.id, group: a.group, refs: a.refs.length });
  const p = spawn('node', [join(ROOT, 'tools/gen-image.mjs'), out, a.prompt], { env: { ...process.env, RAW: '1', REF: a.refs.join(','), ASPECT: '16:9' }, stdio: ['ignore', 'pipe', 'inherit'] });
  let o = ''; p.stdout.on('data', (d) => (o += d));
  p.on('exit', (code) => {
    const file = (o.match(/wrote (\S+)/) || [])[1];
    if (code === 0 && file && a.cut) {       // chroma-key the magenta background to transparency
      try { execFileSync('magick', [file, '-fuzz', '22%', '-transparent', '#FF00FF', '-channel', 'A', '-morphology', 'Erode', 'Disk:1', '+channel', file.replace(/\.\w+$/, '.png')]); } catch (e) { log.warn('cutout failed (is ImageMagick installed?)', { id: a.id, error: e.message.split('\n')[0] }); }
    }
    if (code === 0) log.info('ok', { id: a.id, ms: Date.now() - ts, left: queue.length });
    else { failed.push(a.id); log.error('FAIL', { id: a.id, code }); }
    res();
  });
});
const queue = [...todo];
await Promise.all(Array.from({ length: 5 }, async () => { while (queue.length) await run(queue.shift()); }));
writeFileSync(A('assets', 'manifest.json'), JSON.stringify(ASSETS.map(({ id, group, scene }) => ({ id, group, scene })), null, 1));
(failed.length ? log.warn : log.info)('done', { made: todo.length - failed.length, failed: failed.length ? failed.join(',') : 0, s: Math.round((Date.now() - t0) / 1000) });
