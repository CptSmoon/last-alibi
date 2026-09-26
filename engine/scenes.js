// Stages. Every room is one hand-composed stage: an empty background plate (game-assets/bg), a walkable
// floor polygon, exits to other stages, clue spots, props, and where people stand in each story beat.
// All coordinates are in background pixels (1376 x 768). Feet positions for people.
// Exits and spots may carry `beats: [...]`: they only exist in those story beats.
(function () {
  const INV = ['investigation'], BF = ['breakfast'];

  // Compartments 1-6 share one room shell (window centred on the back wall, berth along a side wall:
  // right for odd numbers, left for even ones, so No. 6's shelf sits against No. 7); the corridor door is
  // behind the camera, at the bottom edge.
  const CDEPTH = [505, 745, 0.95, 1.05];
  const compExit = (k, x) => ({ id: 'to-corridor', rect: [560, 706, 300, 62], to: 'corridor', spawn: [x, 470, 'front'], label: 'Corridor' });
  const DOOR_X = { 1: 207, 2: 397, 3: 577, 4: 727, 5: 897, 6: 1042 };

  window.SCENES = {
    night: { name: 'Simplon line', bg: 'bg-night', cinematic: true },

    dining: {
      name: 'Dining car', bg: 'bg-dining', base: 168, depth: [455, 600, 0.94, 1.04],
      walk: [[[12, 458], [1292, 458], [1292, 602], [12, 602]]],
      exits: [
        { id: 'to-corridor', rect: [0, 455, 26, 150], to: 'corridor', spawn: [1262, 500, 'left'], label: 'Sleeping car' },
        { id: 'to-kitchen', rect: [1282, 455, 94, 150], locked: 'The kitchen, and the lounge car beyond it. Finish your breakfast first.', label: 'Kitchen', beats: BF },
        { id: 'to-kitchen', rect: [1282, 455, 94, 150], to: 'kitchen', spawn: [90, 600, 'right'], label: 'Kitchen · Lounge car', beats: INV },
      ],
      spots: [
        { id: 'cupboard', at: [1235, 270], stand: [1235, 470], r: 70, label: 'A narrow door', text: 'The linen cupboard: starched napkins, spare tablecloths and a box of Wagons-Lits cutlery. Through the wall you can hear Luigi banging pans in the kitchen.' },
        { id: 'menu', at: [300, 360], stand: [300, 470], r: 40, label: 'Breakfast table', text: 'Café, croissants, oeufs à la coque. "With the compliments of the Compagnie, for the delay."', beats: BF },
        { id: 'trainlog', at: [300, 648], stand: [300, 596], r: 40, label: "Castelli's log book", clues: ['e_trainlog'], prop: 'e_trainlog', w: 52 },
      ],
    },

    corridor: {
      name: 'Sleeping car', bg: 'bg-corridor', base: 164, depth: [405, 585, 0.94, 1.04],
      walk: [[[150, 407], [1292, 407], [1292, 586], [22, 586], [22, 548], [150, 548]]],
      exits: [
        { id: 'to-dining', rect: [1282, 400, 94, 190], to: 'dining', spawn: [40, 530, 'right'], label: 'Dining car' },
        { id: 'to-c7', rect: [1186, 398, 96, 26], to: 'c7', spawn: [710, 585, 'back'], label: 'No. 7', beats: INV },
        ...Object.entries(DOOR_X).map(([k, x]) => ({ id: 'to-c' + k, rect: [x - 40, 160, 80, 258], to: 'c' + k, spawn: [900, 655, 'back'], label: 'No. ' + k, beats: INV })),
        { id: 'to-vestibule', rect: [0, 540, 32, 50], locked: 'The vestibule. The outside doors are bolted.', label: 'Vestibule', beats: BF },
        { id: 'to-outside', rect: [0, 540, 32, 50], to: 'outside', spawn: [1135, 600, 'front'], label: 'Outside (vestibule door)', beats: INV },
      ],
      spots: [
        ...Object.entries(DOOR_X).map(([k, x]) => ({ id: 'door' + k, at: [x, 270], stand: [x, 430], r: 60, label: 'No. ' + k, text: `Compartment ${k}. Locked for now: the conductor has the key.`, beats: BF })),
        { id: 'callboard', at: [40, 385], stand: [175, 470], r: 55, label: 'Call board', clues: ['e_callboard'] },
        { id: 'hanky', at: [1150, 470], stand: [1115, 480], r: 30, label: 'Something on the carpet', clues: ['e_handkerchief'], prop: 'e_handkerchief', w: 42 },
        { id: 'bolt', at: [1232, 330], stand: [1228, 440], r: 45, label: 'The broken bolt', clues: ['e_bolt'] },
      ],
    },

    c7: {
      // Same room shell as Nos. 1-6; the body and every clue object are painted into the plate.
      name: 'Compartment 7', bg: 'bg-c7', base: 250, depth: CDEPTH,
      walk: [[[330, 515], [1045, 515], [1045, 745], [320, 745], [320, 565], [330, 565]]],
      exits: [{ id: 'to-corridor', rect: [560, 706, 300, 62], to: 'corridor', spawn: [1200, 480, 'front'], label: 'Corridor' }],
      spots: [
        { id: 'body', at: [1190, 440], stand: [1030, 570], r: 70, label: 'Anton Lazăr', clues: ['e_puncture'] },
        { id: 'pillow', at: [1082, 405], stand: [1030, 525], r: 30, label: 'By the pillow', clues: ['e_notebook'] },
        { id: 'window', at: [820, 240], stand: [760, 525], r: 80, label: 'The window', clues: ['e_window'] },
        { id: 'table', at: [190, 415], stand: [345, 545], r: 45, label: 'The fold-down table', clues: ['e_blotter'] },
        { id: 'medcase', at: [245, 330], stand: [345, 525], r: 32, label: 'A small case', clues: ['e_camphor'] },
        { id: 'attache', at: [215, 625], stand: [345, 640], r: 60, label: 'The attaché case', clues: ['e_letters', 'e_contract'] },
      ],
    },

    lounge: {
      name: 'Lounge car', bg: 'bg-lounge', base: 172, depth: [432, 522, 0.95, 1.02],
      walk: [[[12, 432], [1228, 432], [1228, 522], [12, 522]]],
      exits: [{ id: 'to-kitchen', rect: [0, 430, 22, 95], to: 'kitchen', spawn: [1150, 620, 'left'], label: 'Kitchen · Dining car' }],
      spots: [
        { id: 'scorecard', at: [748, 345], stand: [748, 445], r: 42, label: 'The card table', clues: ['e_scorecard'], prop: 'e_scorecard', w: 40 },
        { id: 'piano', at: [540, 280], stand: [540, 445], r: 55, label: 'The piano', text: 'An upright piano, lid open on a page of Satie. Someone has left a cigarette burn on middle C.' },
        { id: 'stove', at: [930, 330], stand: [930, 450], r: 50, label: 'The stove', text: 'The lounge stove, still warm. Last night someone sat right up against it for a long time: the chair is pulled close.' },
        { id: 'bar', at: [300, 300], stand: [300, 445], r: 60, label: 'The bar', text: 'Cognac, grappa, a bottle of Slivovitz. The barman went to bed at one; the glasses are still out.' },
      ],
    },

    kitchen: {
      name: 'Kitchen', bg: 'bg-kitchen', base: 185, depth: [452, 705, 1.0, 1.08],
      walk: [[[1231, 540], [616, 540], [616, 455], [78, 455], [78, 705], [1231, 705]]],
      exits: [
        { id: 'to-dining', rect: [0, 455, 84, 250], to: 'dining', spawn: [1240, 540, 'left'], label: 'Dining car' },
        { id: 'to-lounge', rect: [1200, 540, 176, 170], to: 'lounge', spawn: [60, 480, 'right'], label: 'Lounge car' },
        { id: 'to-outside', rect: [116, 160, 140, 302], to: 'outside', spawn: [1250, 600, 'front'], label: 'Outside (kitchen door)' },
      ],
      spots: [
        { id: 'grappa', at: [1171, 330], stand: [1146, 560], r: 42, label: 'Behind the stove', clues: ['e_grappa'], prop: 'e_grappa', w: 58 },
        { id: 'cap', at: [341, 232], stand: [341, 480], r: 45, label: 'A cap on the hook', text: "A Wagons-Lits conductor's cap on the hook by the north window. Not Luigi's size." },
        { id: 'window', at: [506, 240], stand: [506, 475], r: 70, label: 'The north window', text: 'Through the glass: a line of footprints in the snow, running along the train towards the lounge end.' },
      ],
    },

    outside: {
      name: 'Outside, north side', bg: 'bg-outside', base: 140, depth: [542, 745, 0.95, 1.1],
      walk: [[[380, 545], [1376, 545], [1376, 745], [250, 745], [250, 640], [380, 565]]],
      exits: [
        { id: 'to-corridor', rect: [1100, 380, 80, 172], to: 'corridor', spawn: [80, 565, 'right'], label: 'Sleeping car door' },
        { id: 'to-kitchen', rect: [1210, 380, 80, 172], to: 'kitchen', spawn: [186, 480, 'front'], label: 'Kitchen door' },
      ],
      spots: [
        { id: 'prints', at: [800, 600], stand: [800, 665], r: 90, label: 'Footprints', clues: ['e_footprints'] },
        { id: 'ampoule', at: [652, 560], stand: [652, 612], r: 30, label: 'A glint in the snow', clues: ['e_ampoule_tip'], prop: 'e_ampoule_tip', w: 26 },
        { id: 'avalanche', at: [160, 330], stand: [330, 660], r: 110, label: 'The avalanche', text: 'A wall of snow as high as the engine, full of snapped pines. Nothing gets past until the relief crew digs through.' },
      ],
    },

    c1: {
      name: 'Compartment 1', bg: 'bg-c1', base: 250, depth: CDEPTH,
      walk: [[[330, 515], [1045, 515], [1045, 745], [355, 745], [355, 625], [60, 625], [60, 585], [330, 585]]], exits: [compExit(1, DOOR_X[1])],
      spots: [
        { id: 'mine', at: [272, 690], stand: [410, 690], r: 60, label: 'Your suitcase', text: 'Your own compartment. Your suitcase, yesterday\'s Figaro, and your fedora\'s empty hook. You slept through the whole thing.' },
        { id: 'desk', at: [405, 370], stand: [420, 535], r: 50, label: 'Your writing case', text: 'Your writing case, the Figaro and the Sûreté file for Belgrade. Nothing in it prepared you for this.' },
      ],
    },
    c2: {
      name: 'Compartment 2', bg: 'bg-c2', base: 250, depth: CDEPTH,
      walk: [[[350, 550], [1020, 550], [1020, 595], [1300, 595], [1330, 745], [350, 745]]], exits: [compExit(2, DOOR_X[2])],
      spots: [
        { id: 'cards', at: [200, 565], stand: [390, 610], r: 60, label: 'Cards on the berth', clues: ['e_marked_cards'] },
        { id: 'whisky', at: [990, 345], stand: [990, 560], r: 60, label: 'Whisky and a photograph', text: 'A bottle of Scotch, two-thirds gone, and a regimental photograph. One face has been scratched out.' },
      ],
    },
    c3: {
      name: 'Compartment 3', bg: 'bg-c3', base: 250, depth: CDEPTH,
      walk: [[[330, 515], [890, 515], [890, 590], [1040, 590], [1040, 745], [305, 745], [305, 565], [330, 565]]], exits: [compExit(3, DOOR_X[3])],
      spots: [
        { id: 'medbag', at: [1000, 690], stand: [920, 700], r: 45, label: "The doctor's bag", clues: ['e_medbag'], prop: 'e_medbag', w: 62 },
        { id: 'shoes', at: [970, 540], stand: [880, 610], r: 45, label: 'Shoes by the berth', clues: ['e_wet_shoes'] },
        { id: 'books', at: [150, 625], stand: [340, 665], r: 60, label: 'Medical books', text: 'A pharmacopoeia and a book of patience games, both well thumbed. A game of patience is laid out, abandoned halfway.' },
      ],
    },
    c4: {
      name: 'Compartment 4', bg: 'bg-c4', base: 250, depth: CDEPTH,
      walk: [[[350, 505], [1240, 505], [1300, 745], [350, 745]]], exits: [compExit(4, DOOR_X[4])],
      spots: [
        { id: 'vanity', at: [990, 345], stand: [990, 530], r: 60, label: 'A vanity case', clues: ['e_passports'] },
        { id: 'photo', at: [1120, 210], stand: [1120, 530], r: 45, label: 'A photograph', text: 'An old woman in a Zagreb studio portrait. On the back, in pencil: "Mama, 1929".' },
      ],
    },
    c5: {
      name: 'Compartment 5', bg: 'bg-c5', base: 250, depth: CDEPTH,
      walk: [[[330, 525], [1030, 525], [1030, 640], [935, 640], [935, 745], [60, 745], [60, 590], [330, 590]]], exits: [compExit(5, DOOR_X[5])],
      spots: [
        { id: 'jewels', at: [405, 350], stand: [420, 545], r: 60, label: 'A jewellery case', text: 'Pearls, a sapphire brooch, earrings. Everything is here. She offered them to someone, and they were refused.' },
        { id: 'photo', at: [960, 350], stand: [960, 550], r: 45, label: 'A young officer', text: 'A silver frame: a young man in an Austrian diplomatic uniform. Her son.' },
      ],
    },
    c6: {
      name: 'Compartment 6', bg: 'bg-c6', base: 250, depth: CDEPTH,
      walk: [[[355, 505], [1215, 505], [1300, 745], [1150, 745], [1150, 640], [1000, 640], [1000, 745], [355, 745]]],
      exits: [compExit(6, DOOR_X[6])],
      spots: [
        { id: 'tumbler', at: [1184, 257], stand: [1150, 525], r: 34, label: 'The shelf', clues: ['e_tumbler'], prop: 'e_tumbler', w: 22 },
        { id: 'attache', at: [985, 345], stand: [985, 525], r: 60, label: 'An attaché case', text: 'Oil company letterhead, maps of Ploiești, a cheque book with three stubs torn out.' },
      ],
    },
  };

  // Who stands where, per beat. [x, y, facing, pose?]  facing: front | back | left | right
  window.BEATS = {
    breakfast: {
      dining: { ferrand: [198, 440, 'right', 'sit'], hale: [420, 440, 'left', 'sit'], irina: [592, 440, 'right', 'sit'], mila: [822, 440, 'left', 'sit'], brandt: [1128, 440, 'left', 'sit'], castelli: [1240, 560, 'front'] },
      corridor: { theo: [1150, 440, 'back'] },
    },
    investigation: {
      corridor: { castelli: [1280, 500, 'left'], theo: [930, 470, 'right'], ferrand: [1085, 440, 'right'] },
      dining: { irina: [592, 440, 'right', 'sit'] },
      lounge: { hale: [838, 408, 'left', 'sit'], mila: [1190, 500, 'right'], brandt: [1052, 585, 'left', 'sit'] },
      kitchen: { cook: [756, 575, 'right'] },
      c7: {},
    },
  };
})();
