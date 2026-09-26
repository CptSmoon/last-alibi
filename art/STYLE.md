# Style bible: Last Stop, Simplon-Orient

Locked 26 Sept 2026. The reference is `concept/style-a-gather.jpg`. The approved scene stills are in `scenes/`,
and all of them are on `scene-board.jpg`. Every asset we make from now on must match these stills.

## Look
- Cozy top-down RPG pixel art, like Gather.town: warm, bright, readable, charming, with the mystery carried by the staging and not by darkness.
- **Camera:** straight-on top-down with a slight 3/4 tilt. The back wall runs along the top edge and the room is a rectangle filling the frame. Never isometric, diagonal, or a hexagonal cut-away.
- **Palette:** rich wood panelling, brass, green and wine-red Art Deco patterns, white tablecloths, amber lamp light, snowy blue-white outside.
- **Characters:** cute chibi proportions (big head, small body), soft pixel shading, dark outline, with a small rounded cream name label above each one.
- **UI frame:** cream parchment panels with thin gold borders. Top-left: three square icon buttons (map, people, settings). Top-centre: a scroll plate with the location name. Top-right: a time panel.
- **Clues:** small gold sparkles on the object.
- **Alerts:** a speech bubble with "!" or "...".

## Cast (looks locked by `scenes/01-dining-breakfast.jpg`)
| Label | Look |
|---|---|
| Inspector Sorel | the player; a man about 35, short dark-brown hair, clean-shaven, camel trench coat, brown fedora, holds a notebook |
| Dr Ferrand | grey hair, short grey beard, round glasses, brown tweed three-piece suit |
| Countess Voss | dark wavy hair, pearls, wine-red velvet gown, white fur stole |
| Major Hale | ginger hair, big ginger moustache, olive-khaki tweed suit |
| Mila Novak | glossy black bob with a hair ornament, purple dress |
| Herr Brandt | pale blond slicked hair, round glasses, dark grey suit |
| Théo | young conductor, brown Wagons-Lits uniform, brown peaked cap with gold band |
| Castelli | older train manager, big white moustache, navy uniform with gold braid, navy kepi |
| Anton Lazăr | the victim: bald, grey fringe, monocle; only shown lying in his berth under a wine-red blanket |
| Cook | white apron and toque; background character in the kitchen |

## Stages (one still each)
| # | Stage | Beat |
|---|---|---|
| 00 | Simplon line, night | opening: the avalanche stops the train |
| 01 | Dining car | breakfast, 07:00 (tutorial) |
| 02 | Dining car | Théo bursts in: "!" |
| 03 | Sleeping-car corridor | door 7 forced; Castelli, Théo, Ferrand; the handkerchief |
| 04 | Compartment 7 | crime scene: body, notebook, blotter, window, ampoules, attaché |
| 05 | Lounge car | bar, piano, piquet table, stove, observation windows |
| 06 | Kitchen | stove, grappa glasses, the conductor's cap, the window onto the footprints |
| 07 | Outside, north side | footprints from window 7, the ampoule in the snow, the buried engine |
| 08 | Compartment 3 | Ferrand's bag, wet shoes, trousers on the heater |
| 09 | Compartment 6 | Brandt; the tumbler on the shelf |
| 10 | Dining car, 10:00 | the accusation |

## Rules for the asset pass
- Always send `concept/style-a-gather.jpg` (style) and `scenes/01-dining-breakfast.jpg` (cast) as references: `tools/gen-image.mjs` with `REF=...`.
- **Backgrounds:** the same stage with no characters, no UI, no labels and no sparkles, so they can be layered.
- **Characters:** one sprite sheet per person on a flat background: 4 facing directions, idle, walk frames and a talk pose, all at the same scale as the stills.
- **Text:** no generated text anywhere. The UI, labels and time are drawn by the game.
- Regenerate scenes with `node tools/gen-scenes.mjs [ids]`; the prompts live in that file.
