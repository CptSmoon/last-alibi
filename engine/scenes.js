// Stages. Every room is one hand-composed stage: an empty background plate (game-assets/bg), a walkable
// floor polygon, exits to other stages, clue spots, props, and where people stand in each story beat.
// All coordinates are in background pixels (1376 x 768). Feet positions for people.
// Exits and spots may carry `beats: [...]`: they only exist in those story beats.
(function () {
  const INV = ['investigation'], BF = ['breakfast'];

  // Compartments 1, 3, 4 and 5 share one template (desk left, berth top right, carpet along the bottom);
  // the corridor door is behind the camera, at the bottom edge.
  const COMP_WALK = [[[330, 585], [1340, 585], [1350, 712], [560, 712], [330, 712]]];
  const compExit = (k, x) => ({ id: 'to-corridor', rect: [560, 706, 300, 62], to: 'corridor', spawn: [x, 470, 'front'], label: 'Corridor' });
  const DOOR_X = { 1: 207, 2: 397, 3: 577, 4: 727, 5: 897, 6: 1042 };

  window.SCENES = {
    night: { name: 'Simplon line', bg: 'bg-night', cinematic: true },

    dining: {
      name: 'Dining car', bg: 'bg-dining', base: 168, depth: [455, 600, 0.94, 1.04],
      walk: [[[12, 458], [1292, 458], [1292, 602], [12, 602]]],
      exits: [
        { id: 'to-corridor', rect: [0, 455, 26, 150], to: 'corridor', spawn: [1262, 500, 'left'], label: 'Sleeping car' },
        { id: 'to-lounge', rect: [1282, 455, 94, 150], locked: 'The lounge car is further on. Finish your breakfast first.', label: 'Lounge car', beats: BF },
        { id: 'to-lounge', rect: [1282, 455, 94, 150], to: 'lounge', spawn: [60, 480, 'right'], label: 'Lounge car', beats: INV },
        { id: 'to-kitchen', rect: [1185, 160, 105, 302], to: 'kitchen', spawn: [1250, 500, 'left'], label: 'Kitchen', beats: INV },
      ],
      spots: [
        { id: 'kitchen-door', at: [1235, 270], stand: [1235, 470], r: 70, label: 'Kitchen door', text: 'The kitchen. Luigi is banging pans; he waves you away. Later.', beats: BF },
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
      name: 'Compartment 7', bg: 'bg-c7', base: 190, depth: [470, 700, 1.0, 1.1],
      walk: [[[300, 480], [1255, 472], [1262, 602], [818, 602], [818, 712], [604, 712], [604, 602], [300, 602]]],
      exits: [{ id: 'to-corridor', rect: [604, 706, 214, 62], to: 'corridor', spawn: [1200, 480, 'front'], label: 'Corridor' }],
      props: [{ img: 'sprites/lazar-body', x: 822, y: 262, w: 450, flip: true }],
      spots: [
        { id: 'body', at: [1170, 330], stand: [1120, 500], r: 70, label: 'Anton Lazăr', clues: ['e_puncture'] },
        { id: 'pillow', at: [1195, 402], stand: [1180, 500], r: 30, label: 'Under the pillow', clues: ['e_notebook'], prop: 'e_notebook', w: 40 },
        { id: 'window', at: [700, 235], stand: [700, 495], r: 80, label: 'The window', clues: ['e_window'] },
        { id: 'table', at: [385, 405], stand: [420, 500], r: 45, label: 'The fold-down table', clues: ['e_blotter'], prop: 'e_blotter', w: 64 },
        { id: 'medcase', at: [455, 392], stand: [480, 500], r: 32, label: 'A small case', clues: ['e_camphor'], prop: 'e_camphor', w: 54 },
        { id: 'attache', at: [362, 628], stand: [470, 590], r: 60, label: 'The attaché case', clues: ['e_letters', 'e_contract'], prop: 'e_letters', w: 56 },
      ],
    },

    lounge: {
      name: 'Lounge car', bg: 'bg-lounge', base: 172, depth: [432, 522, 0.95, 1.02],
      walk: [[[12, 432], [1228, 432], [1228, 522], [12, 522]]],
      exits: [{ id: 'to-dining', rect: [0, 430, 22, 95], to: 'dining', spawn: [1262, 530, 'left'], label: 'Dining car' }],
      spots: [
        { id: 'scorecard', at: [748, 345], stand: [748, 445], r: 42, label: 'The card table', clues: ['e_scorecard'], prop: 'e_scorecard', w: 40 },
        { id: 'piano', at: [540, 280], stand: [540, 445], r: 55, label: 'The piano', text: 'An upright piano, lid open on a page of Satie. Someone has left a cigarette burn on middle C.' },
        { id: 'stove', at: [930, 330], stand: [930, 450], r: 50, label: 'The stove', text: 'The lounge stove, still warm. Last night someone sat right up against it for a long time: the chair is pulled close.' },
        { id: 'bar', at: [300, 300], stand: [300, 445], r: 60, label: 'The bar', text: 'Cognac, grappa, a bottle of Slivovitz. The barman went to bed at one; the glasses are still out.' },
      ],
    },

    kitchen: {
      name: 'Kitchen', bg: 'bg-kitchen', base: 185, depth: [452, 705, 1.0, 1.08],
      walk: [[[145, 540], [760, 540], [760, 455], [1298, 455], [1298, 705], [145, 705]]],
      exits: [
        { id: 'to-dining', rect: [1292, 440, 84, 140], to: 'dining', spawn: [1237, 500, 'front'], label: 'Dining car' },
        { id: 'to-outside', rect: [1120, 160, 140, 302], to: 'outside', spawn: [1250, 600, 'front'], label: 'Outside (kitchen door)' },
      ],
      spots: [
        { id: 'grappa', at: [205, 330], stand: [230, 560], r: 42, label: 'Behind the stove', clues: ['e_grappa'], prop: 'e_grappa', w: 58 },
        { id: 'cap', at: [1035, 232], stand: [1035, 480], r: 45, label: 'A cap on the hook', text: "A Wagons-Lits conductor's cap on the hook by the north window. Not Luigi's size." },
        { id: 'window', at: [870, 240], stand: [870, 475], r: 70, label: 'The north window', text: 'Through the glass: a line of footprints in the snow, running along the train towards the lounge end.' },
      ],
    },

    outside: {
      name: 'Outside, north side', bg: 'bg-outside', base: 140, depth: [542, 745, 0.95, 1.1],
      walk: [[[380, 545], [1376, 545], [1376, 745], [250, 745], [250, 640], [380, 565]]],
      exits: [
        { id: 'to-corridor', rect: [1100, 380, 80, 172], to: 'corridor', spawn: [80, 565, 'right'], label: 'Sleeping car door' },
        { id: 'to-kitchen', rect: [1210, 380, 80, 172], to: 'kitchen', spawn: [1190, 480, 'front'], label: 'Dining car (kitchen door)' },
      ],
      spots: [
        { id: 'prints', at: [800, 600], stand: [800, 665], r: 90, label: 'Footprints', clues: ['e_footprints'] },
        { id: 'ampoule', at: [652, 560], stand: [652, 612], r: 30, label: 'A glint in the snow', clues: ['e_ampoule_tip'], prop: 'e_ampoule_tip', w: 26 },
        { id: 'avalanche', at: [160, 330], stand: [330, 660], r: 110, label: 'The avalanche', text: 'A wall of snow as high as the engine, full of snapped pines. Nothing gets past until the relief crew digs through.' },
      ],
    },

    c1: {
      name: 'Compartment 1', bg: 'bg-c1', base: 250, depth: [585, 712, 1.0, 1.06], walk: COMP_WALK, exits: [compExit(1, DOOR_X[1])],
      spots: [{ id: 'mine', at: [200, 500], stand: [420, 650], r: 60, label: 'Your suitcase', text: 'Your own compartment. Your suitcase, yesterday\'s Figaro, and your fedora\'s empty hook. You slept through the whole thing.' }],
    },
    c2: {
      name: 'Compartment 2', bg: 'bg-c2', base: 250, depth: [585, 712, 1.0, 1.06],
      walk: [[[705, 592], [1340, 592], [1350, 712], [330, 712], [330, 674], [705, 674]]], exits: [compExit(2, DOOR_X[2])],
      spots: [
        { id: 'cards', at: [855, 485], stand: [855, 640], r: 60, label: 'Cards on the seat', clues: ['e_marked_cards'] },
        { id: 'whisky', at: [450, 480], stand: [450, 690], r: 60, label: 'Whisky and a photograph', text: 'A bottle of Scotch, two-thirds gone, and a regimental photograph. One face has been scratched out.' },
      ],
    },
    c3: {
      name: 'Compartment 3', bg: 'bg-c3', base: 250, depth: [585, 712, 1.0, 1.06], walk: COMP_WALK, exits: [compExit(3, DOOR_X[3])],
      spots: [
        { id: 'medbag', at: [1000, 530], stand: [1000, 645], r: 50, label: "The doctor's bag", clues: ['e_medbag'], prop: 'e_medbag', w: 96 },
        { id: 'shoes', at: [825, 495], stand: [825, 640], r: 45, label: 'Shoes under the berth', clues: ['e_wet_shoes'] },
        { id: 'books', at: [430, 530], stand: [470, 650], r: 60, label: 'Medical books', text: 'A pharmacopoeia and a book of patience games, both well thumbed.' },
      ],
    },
    c4: {
      name: 'Compartment 4', bg: 'bg-c4', base: 250, depth: [585, 712, 1.0, 1.06],
      walk: [[[330, 620], [1010, 610], [1340, 620], [1350, 712], [330, 712]]], exits: [compExit(4, DOOR_X[4])],
      spots: [
        { id: 'vanity', at: [415, 480], stand: [470, 650], r: 60, label: 'A vanity case', clues: ['e_passports'] },
        { id: 'photo', at: [925, 490], stand: [925, 650], r: 45, label: 'A photograph', text: 'An old woman in a Zagreb studio portrait. On the back, in pencil: "Mama, 1929".' },
      ],
    },
    c5: {
      name: 'Compartment 5', bg: 'bg-c5', base: 250, depth: [585, 712, 1.0, 1.06],
      walk: [[[330, 610], [1100, 600], [1340, 620], [1350, 712], [330, 712]]], exits: [compExit(5, DOOR_X[5])],
      spots: [
        { id: 'jewels', at: [420, 480], stand: [470, 650], r: 60, label: 'A jewellery case', text: 'Pearls, a sapphire brooch, earrings. Everything is here. She offered them to someone, and they were refused.' },
        { id: 'photo', at: [790, 495], stand: [800, 650], r: 45, label: 'A young officer', text: 'A silver frame: a young man in an Austrian diplomatic uniform. Her son.' },
      ],
    },
    c6: {
      name: 'Compartment 6', bg: 'bg-c6', base: 168, depth: [470, 705, 0.97, 1.06],
      walk: [[[205, 472], [880, 472], [880, 592], [1188, 592], [1188, 708], [230, 708], [205, 640]]],
      exits: [{ id: 'to-corridor', rect: [560, 702, 300, 66], to: 'corridor', spawn: [DOOR_X[6], 470, 'front'], label: 'Corridor' }],
      spots: [
        { id: 'tumbler', at: [330, 372], stand: [330, 520], r: 34, label: 'The shelf', clues: ['e_tumbler'], prop: 'e_tumbler', w: 26 },
        { id: 'attache', at: [1040, 420], stand: [1000, 640], r: 60, label: 'An attaché case', text: 'Oil company letterhead, maps of Ploiești, a cheque book with three stubs torn out.' },
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
      kitchen: { cook: [620, 575, 'left'] },
      c7: {},
    },
  };
})();
