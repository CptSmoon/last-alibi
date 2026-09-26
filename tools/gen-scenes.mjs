// Generate the scene stills ("style targets") for every stage of the case, in the locked style of
// art/concept/style-a-gather.jpg. Each still defines how that stage should look in the finished game.
//   node tools/gen-scenes.mjs              -> all scenes into art/scenes/
//   node tools/gen-scenes.mjs corridor c7  -> only those
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../server/log.mjs';

const log = logger('gen-scenes');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STYLE_REF = join(ROOT, 'art/concept/style-a-gather.jpg');
const CAST_REF = join(ROOT, 'art/scenes/01-dining-breakfast.jpg'); // approved still: the cast's exact looks
const SOREL_REF = join(ROOT, 'art/characters/sorel-sheet.jpg');     // the inspector (a man): exact look

const STYLE = `Match the attached reference image EXACTLY in art style: cozy top-down RPG pixel art like Gather.town, seen from above at a slight 3/4 angle, clean readable tile grid, warm lamp light, rich wood panelling, brass details, green and wine-red Art Deco patterns, soft pixel shading, cute chibi characters with big heads and small bodies, small rounded name labels above each character, the same framed game UI: three square icon buttons top-left (map, people, settings), a scroll-shaped title plate top-centre with the location name, and a small panel top-right with the time. Same pixel density, same outline weight, same palette, same character proportions as the reference. Setting: the Simplon-Orient Express, December 1931, stuck in deep Alpine snow after an avalanche.
CAMERA (strict): exactly the same camera as the reference: a straight-on top-down view with a slight 3/4 tilt, the back wall along the top edge, the room drawn as a rectangle that fills the frame from edge to edge. NOT isometric, NOT diagonal, NOT a hexagonal or cut-away diorama.
RULES (strict): every named character appears exactly ONCE, never duplicated. No text anywhere except the UI plate, the time panel and the name labels (no signs, no writing on walls or on the train). Name labels are spelled exactly as given.`;

const CAST = `The first reference image defines the art style and camera. When there are three reference images, the second shows the exact cast looks. The LAST reference image is Inspector Sorel's character sheet: draw him exactly like that man (fedora, trench coat, masculine face), but in the same small chibi proportions as the other characters. The cast (keep their looks identical to the reference and consistent across scenes; use ONLY these name labels, never any other names):
- "Inspector Sorel": the player, a MAN, about 35, detective with short dark-brown hair, clean-shaven, strong eyebrows, in a camel trench coat with the belt tied and a brown fedora hat, holding a small notebook. (If a reference image shows a woman detective, IGNORE her look: the detective is now this man.)
- "Dr Ferrand": grey hair, short grey beard, round glasses, brown tweed suit.
- "Countess Voss": dark wavy hair, pearls, wine-red velvet gown, white fur stole.
- "Major Hale": ginger hair, big ginger moustache, olive-khaki tweed suit.
- "Mila Novak": young singer, glossy black bob, purple dress, red lips.
- "Herr Brandt": pale blond slicked hair, round glasses, dark grey suit.
- "Théo": young sleeping-car conductor, brown Wagons-Lits uniform and brown peaked cap with gold band.
- "Castelli": train manager, older, big white moustache, navy uniform with gold braid and navy kepi.
- The victim "Anton Lazăr": bald, grey fringe, monocle, only ever shown lying in his berth under a wine-red blanket.`;

const SCENES = [
  { id: '01-dining-breakfast', title: 'DINING CAR', time: '07:00',
    p: `The dining car at breakfast. Long carriage with windows along the top wall showing snowy mountains and snow piled against the glass. Tables with white cloths, little lamps, coffee cups, croissants. Seated at tables: Dr Ferrand and Major Hale at one table, Countess Voss alone, Mila Novak alone, Herr Brandt alone with a newspaper. Castelli stands by the kitchen door. Inspector Sorel walks down the patterned green aisle carpet. Calm, cozy morning.` },
  { id: '02-dining-alarm', title: 'DINING CAR', time: '07:04',
    p: `Same dining car, a moment later: Théo the conductor has just burst in through the door at the left end, running, one arm raised, with a small "!" alert bubble above him. Everyone else is still at their breakfast tables and turns towards him: Countess Voss (dark wavy hair, no hat) puts a hand to her mouth, Dr Ferrand is standing up from his chair, Major Hale drops his cup, Mila Novak and Herr Brandt stare. Castelli is NOT in this scene. Inspector Sorel stands in the aisle facing Théo. Théo appears only once: the running conductor at the left door.` },
  { id: '03-corridor', title: 'SLEEPING CAR', time: '07:12',
    p: `The sleeping-car corridor. Top half: a row of exactly seven compartment doors in polished wood with brass numbers 1, 2, 3, 4, 5, 6, 7 in order from left to right; bottom: the narrow corridor with a long wine-red patterned carpet and windows along the bottom wall showing snow. At the left end the conductor's little seat and a call board with numbered flags. At door 7 (right side) the door has been forced open, splinters on the carpet, the brass bolt hanging broken. Castelli holds a crowbar, Théo stands shocked, Dr Ferrand kneels in the doorway looking in. Inspector Sorel arrives from the left. A lace handkerchief lies on the carpet by door 7.` },
  { id: '04-compartment-7', title: 'COMPARTMENT 7', time: '07:20',
    p: `Inside compartment 7, the crime scene, seen from above filling the frame: a narrow luxurious sleeping compartment with wood panelling. Along the top wall a made-up berth where the victim Anton Lazăr lies still on his back under a wine-red blanket, monocle on the pillow; a black notebook peeks from under the pillow. Above the berth a window with its catch undone, a small puddle of melted snow on the floor beneath it and snow on the sill. A fold-down table with an ink blotter, a pen and a small leather case of glass ampoules. A leather attaché case on the floor with a bundle of ribbon-tied letters and papers. The door on the bottom wall hangs open with a broken bolt. Inspector Sorel stands inside examining, small sparkle markers on the notebook, the blotter, the window and the ampoule case to show clues. Dim, tense morning light.` },
  { id: '05-lounge', title: 'LOUNGE CAR', time: '08:30',
    p: `The lounge car. A polished bar counter with bottles and brass stools along the top-left, an upright piano, a small card table with a piquet game abandoned mid-play and a score sheet, a black iron stove glowing red, green velvet armchairs and a sofa, and large observation windows at the right end showing the snowy valley. Major Hale sits at the card table shuffling cards, Mila Novak smokes by the observation window, Herr Brandt (pale BLOND hair, round glasses) reads in an armchair. Inspector Sorel walks in.` },
  { id: '06-kitchen', title: 'KITCHEN', time: '08:10',
    p: `The small dining-car kitchen: a black cast-iron stove with copper pots, a counter with bread and coffee pots, shelves of plates, and a small window on the top wall looking out onto snow with a line of footprints visible outside (the snow is ONLY seen through the window glass; the kitchen floor inside is clean tiles, no snow indoors). Behind the stove, two small grappa glasses and a nearly empty grappa bottle, and a conductor's brown cap hanging on a hook by the window (sparkle marker on the glasses). A cook in white apron and toque works at the stove. Inspector Sorel stands in the doorway.` },
  { id: '07-outside-snow', title: 'OUTSIDE', time: '08:45',
    p: `Outside the train in deep snow, seen from above: the long dark blue-and-brass carriages (plain, with NO lettering) run horizontally across the middle of the frame, seen from above at the same slight 3/4 tilt, snow heaped up to the windows. A single line of deep footprints runs through the snow along the train from beneath one window (compartment 7, slightly open) to a carriage door further along. Near the window a tiny glinting glass object in the snow (sparkle marker). Pine trees, the white valley, blue sky. At the far left the locomotive buried in the avalanche snow with snapped pines. Inspector Sorel in her trench coat and cloche hat walks in the snow following the prints.` },
  { id: '08-compartment-3', title: 'COMPARTMENT 3', time: '09:00',
    p: `Inside compartment 3, Dr Ferrand's sleeping compartment: tidy berth, a leather doctor's bag open on the seat showing a morphine case with one empty slot and a syringe, black patent evening shoes under the berth stuffed with newspaper to dry, dinner trousers drying over the heater, medical books. Sparkle markers on the bag and the shoes. Inspector Sorel searches. Nobody else present.` },
  { id: '09-compartment-6', title: 'COMPARTMENT 6', time: '09:10',
    p: `Inside compartment 6, Herr Brandt's compartment (the whole frame is the inside of this one compartment, like the compartment 7 scene): a berth along the top wall under a window, briefcase with oil-company papers, a tooth glass standing upside down on the shelf pressed against the shared wall with a folded towel beside it (sparkle marker). Herr Brandt stands stiffly by the window, arms crossed, while Inspector Sorel questions him; a small speech bubble with "..." above Brandt.` },
  { id: '10-accusation', title: 'DINING CAR', time: '10:00',
    p: `The dining car at 10:00, the gathering: all suspects sit at the tables facing the centre, each exactly once: Countess Voss, Major Hale, Mila Novak, Herr Brandt, and Théo standing by the wall; Castelli guards the door on the right; Dr Ferrand stands alone in the aisle. Inspector Sorel stands in the middle of the aisle pointing dramatically at Dr Ferrand, who has gone pale with a small sweat drop. Tense, theatrical, lamps lit, snow outside. Ferrand's name label glows red.` },
  { id: '00-avalanche-night', title: 'SIMPLON LINE', time: '23:40',
    p: `Night, 23:40, the opening scene, seen from above: the whole Simplon-Orient Express (locomotive, sleeping cars, dining car, lounge car) running along a mountain track in the snow, windows glowing amber; ahead of the locomotive a huge avalanche of snow and snapped pines pours down across the track. Dramatic but cute, deep blue night, falling snow. No characters visible except tiny silhouettes in the lit windows.` },
];

const only = process.argv.slice(2);
const todo = SCENES.filter((s) => !only.length || only.some((o) => s.id.includes(o)));
log.info('start', { todo: todo.map((s) => s.id).join(',') });
const t0 = Date.now(), failed = [];
const run = (s) => new Promise((res) => {
  const ts = Date.now();
  const prompt = `${STYLE}\n\n${CAST}\n\nSCENE: ${s.p}\nThe title plate reads "${s.title}" and the time panel reads "${s.time}". Only these texts and the name labels may appear. 16:9 game screenshot.`;
  const p = spawn('node', [join(ROOT, 'tools/gen-image.mjs'), join(ROOT, 'art/scenes', s.id), prompt], { env: { ...process.env, RAW: '1', REF: [STYLE_REF, ...(s.id.startsWith('01') ? [] : [CAST_REF]), SOREL_REF].join(',') }, stdio: 'inherit' });
  p.on('exit', (code) => { if (code === 0) log.info('ok', { id: s.id, ms: Date.now() - ts }); else { failed.push(s.id); log.error('FAIL', { id: s.id, code }); } res(); });
});
// 4 at a time
const queue = [...todo];
await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) await run(queue.shift()); }));
(failed.length ? log.warn : log.info)('done', { made: todo.length - failed.length, failed: failed.join(',') || 0, s: Math.round((Date.now() - t0) / 1000) });
