// Suite 304 — the crime scene. Point-and-click: the detective walks to what you click and
// describes it; real clues go into the notebook. Everything is drawn in code.
(function () {
  const { rect, px, line, ellipse, dither, vgrad, sprite, text, wrap, panel, nameTag, typed, rain, drawRain, blip } = PX;
  const W = 320, H = 180, FLOOR = 128;

  // ---------- static room, drawn once ----------
  function drawRoom(b) {
    rect(b, 0, 0, W, H, 'ink');
    // wall + wallpaper
    rect(b, 0, 0, W, 88, 'wine');
    for (let x = 0; x < W; x++) for (let y = 5; y < 72; y++) {
      if (x % 8 === 0) px(b, x, y, 'wine2');
      const dx = (x % 8) - 4, dy = (y % 10) - 5;
      if (Math.abs(dx) + Math.abs(dy) === 1) px(b, x, y, 'wine2');
    }
    rect(b, 0, 0, W, 4, 'brown'); rect(b, 0, 4, W, 1, 'brass');
    // wainscot
    rect(b, 0, 72, W, 16, 'brown'); rect(b, 0, 72, W, 1, 'brass');
    for (let x = 4; x < W; x += 40) { rect(b, x, 75, 34, 1, 'rust'); rect(b, x, 84, 34, 1, 'dbrown'); rect(b, x, 75, 1, 10, 'rust'); rect(b, x + 33, 75, 1, 10, 'dbrown'); }
    rect(b, 0, 86, W, 2, 'dbrown');
    // carpet
    rect(b, 0, 88, W, 44, 'night');
    for (let y = 88; y < 132; y++) for (let x = 0; x < W; x++) {
      if ((x + y * 2) % 18 === 0 || (x - y * 2 + 360) % 18 === 0) px(b, x, y, 'blue');
      if ((x + y * 2) % 36 === 9 && (x - y * 2 + 360) % 36 === 9) px(b, x, y, 'brass');
    }
    rect(b, 0, 88, W, 3, 'wine'); rect(b, 0, 91, W, 1, 'brass');
    dither(b, 0, 124, W, 8, 'night', 'navy', 0.5);

    // window frame (panes are animated)
    rect(b, 14, 10, 62, 60, 'dbrown'); rect(b, 16, 12, 58, 56, 'cream');
    rect(b, 12, 68, 66, 4, 'cream'); rect(b, 12, 71, 66, 1, 'paper');
    // curtains
    for (const cx of [4, 70]) for (let x = 0; x < 14; x++) for (let y = 6; y < 86; y++) {
      const fold = (x + (y > 60 ? 1 : 0)) % 4;
      px(b, cx + x, y, fold === 0 ? 'wine' : fold === 3 ? 'red' : 'wine2');
    }
    rect(b, 2, 4, 86, 3, 'brass');
    rect(b, 4, 50, 14, 2, 'amber'); rect(b, 70, 50, 14, 2, 'amber');

    // connecting door to 305 (bolted on this side)
    rect(b, 98, 20, 30, 68, 'dbrown'); rect(b, 100, 22, 26, 66, 'brown');
    rect(b, 103, 26, 20, 24, 'rust'); rect(b, 104, 27, 18, 22, 'brown');
    rect(b, 103, 56, 20, 26, 'rust'); rect(b, 104, 57, 18, 24, 'brown');
    rect(b, 121, 52, 3, 3, 'gold');                       // knob
    rect(b, 106, 40, 12, 3, 'lgrey'); rect(b, 114, 39, 3, 5, 'grey'); // bolt, shut
    text(b, '305', 104, 12, 'paper');

    // painting of Victor above the fireplace
    rect(b, 180, 8, 52, 32, 'gold'); rect(b, 182, 10, 48, 28, 'brass'); rect(b, 184, 12, 44, 24, 'ink');
    vgrad(b, 184, 12, 44, 24, ['#1a1d33', '#35190f']);
    ellipse(b, 206, 22, 5, 6, 'skin3'); ellipse(b, 206, 35, 11, 5, 'dgrey'); rect(b, 201, 16, 10, 2, 'dgrey');
    px(b, 204, 21, 'ink'); px(b, 208, 21, 'ink'); rect(b, 212, 25, 6, 1, 'tan'); px(b, 218, 25, 'red');

    // fireplace
    rect(b, 166, 44, 80, 6, 'cream'); rect(b, 166, 49, 80, 1, 'paper');
    rect(b, 170, 50, 10, 38, 'cream'); rect(b, 232, 50, 10, 38, 'cream');
    rect(b, 178, 50, 2, 38, 'paper'); rect(b, 232, 50, 2, 38, 'paper');
    rect(b, 180, 54, 52, 34, 'ink'); rect(b, 180, 54, 52, 3, 'dgrey');
    rect(b, 186, 80, 40, 3, 'grey'); for (let x = 188; x < 226; x += 6) rect(b, x, 76, 2, 5, 'grey');
    // clock + the clean patch where the statuette stood
    rect(b, 186, 34, 14, 10, 'brass'); ellipse(b, 193, 38, 3, 3, 'cream'); line(b, 193, 38, 193, 36, 'ink'); line(b, 193, 38, 195, 38, 'ink');
    rect(b, 218, 42, 10, 2, 'white');

    // desk, lamp, diary, telephone
    rect(b, 254, 64, 62, 4, 'rust'); rect(b, 254, 67, 62, 1, 'dbrown');
    rect(b, 256, 68, 58, 16, 'brown'); rect(b, 258, 70, 26, 5, 'rust'); rect(b, 286, 70, 26, 5, 'rust');
    px(b, 271, 72, 'gold'); px(b, 299, 72, 'gold');
    rect(b, 258, 84, 4, 26, 'dbrown'); rect(b, 308, 84, 4, 26, 'dbrown');
    rect(b, 274, 56, 2, 8, 'brass'); rect(b, 270, 63, 10, 1, 'brass');
    for (let y = 0; y < 6; y++) rect(b, 268 - y, 50 + y, 14 + y * 2, 1, y < 2 ? 'mint' : 'green');
    rect(b, 286, 60, 16, 4, 'cream'); rect(b, 293, 60, 1, 4, 'paper');
    for (let y = 61; y < 64; y++) { rect(b, 288, y, 4, 1, 'grey'); rect(b, 295, y, 5, 1, 'grey'); }
    rect(b, 305, 59, 8, 5, 'ink'); rect(b, 304, 57, 10, 2, 'dgrey');

    // overturned marble table
    ellipse(b, 166, 110, 4, 12, 'cream'); ellipse(b, 166, 110, 2, 10, 'white');
    rect(b, 170, 108, 16, 3, 'brass'); rect(b, 184, 104, 3, 11, 'brass');
    // tape outline of the body
    const T = 'cream';
    ellipse(b, 84, 112, 5, 5, T); ellipse(b, 84, 112, 4, 4, 'night');
    line(b, 89, 113, 128, 116, T); line(b, 90, 119, 128, 121, T);
    line(b, 95, 113, 104, 104, T); line(b, 104, 104, 110, 106, T);
    line(b, 100, 120, 94, 127, T); line(b, 128, 116, 146, 112, T); line(b, 128, 121, 146, 125, T);
    line(b, 146, 112, 148, 114, T); line(b, 146, 125, 148, 123, T);
    // torn title page
    rect(b, 132, 124, 9, 6, 'paper'); rect(b, 142, 126, 7, 5, 'cream'); line(b, 133, 126, 139, 126, 'grey'); line(b, 143, 128, 147, 128, 'grey');
    // statuette under the desk
    rect(b, 280, 110, 8, 2, 'brown'); rect(b, 283, 104, 2, 6, 'gold');
    line(b, 278, 102, 284, 105, 'gold'); line(b, 284, 105, 290, 101, 'gold'); px(b, 290, 101, 'red');
  }

  // ---------- hotspots ----------
  const HOT = [
    { id: 'e_ledger_ash', name: 'Fireplace', r: [180, 54, 52, 34], walk: 206, clue: 'Burnt ledger pages',
      say: "Paper ash in a fireplace nobody lit for the gala. One fragment survived: 'Mouette d'Or - frais divers - 1.200.000 F'. Initialled A.P." },
    { id: 'e_diary', name: "Victor's diary", r: [284, 58, 20, 7], walk: 290, clue: "Victor's desk diary",
      say: "Tonight's page, in Victor's hand: '23H30 - A.P. - les comptes. Derniere chance.' Somebody had an appointment." },
    { id: 'e_statuette', name: 'Golden Gull', r: [276, 99, 16, 14], walk: 276, clue: 'The Golden Gull',
      say: "His prize, kicked under the desk. Wiped clean - too clean. But the tip of one bronze wing still has blood on it." },
    { id: 'e_bolted_door', name: 'Door to 305', r: [98, 20, 30, 68], walk: 112, clue: 'Connecting door 304/305',
      say: "The door to his wife's suite. Bolted from this side, and the dust on the bolt is undisturbed. Nobody came through here tonight." },
    { id: 'e_script_pages', name: 'Torn page', r: [131, 123, 19, 9], walk: 138, clue: 'Torn script pages',
      say: "The title page of 'La Mouette d'Or', torn in two. 'Scenario: Solange Duret' crossed out. 'Victor Castellane' written over it." },
    { id: 'e_divorce_papers', name: 'Desk drawer', r: [256, 68, 58, 16], walk: 300, clue: 'Divorce papers',
      say: "Unsigned divorce papers. Castellane v. Castellane, citing adultery. Under the marriage contract she walks away with nothing." },
    { id: 'dust', name: 'Mantelpiece', r: [214, 38, 18, 7], walk: 222,
      say: "A clean rectangle in the dust on the mantel. Something heavy stood here until tonight." },
    { id: 'table', name: 'Marble table', r: [160, 96, 28, 26], walk: 176,
      say: "The table is on its side. Its edge is spotless - no blood, no hair. Then what split his head open? Twice?" },
    { id: 'body', name: 'Tape outline', r: [78, 102, 72, 28], walk: 118,
      say: "Victor Castellane, 58. Two wounds on the back of the skull. A fall gives you one." },
    { id: 'window', name: 'Window', r: [16, 12, 58, 56], walk: 44,
      say: "Third floor, no balcony, and the storm hasn't stopped since ten. Nobody came in this way." },
    { id: 'phone', name: 'Telephone', r: [303, 56, 12, 8], walk: 300,
      say: "A direct line to the front desk. The night concierge logs every call. Worth asking him." },
    { id: 'painting', name: 'Portrait', r: [180, 8, 52, 32], walk: 206,
      say: "Victor, painted twenty years younger and twenty kilos lighter. Even in oils he looks like he's pricing you." },
  ];

  // ---------- detective sprite (12 x 21) ----------
  const KEY = { h: '#5a2d1c', H: '#0b0a14', s: '#f5cfae', S: '#dfa47c', c: '#b08a55', C: '#8a6a3f', b: '#35190f', p: '#232845', f: '#0b0a14' };
  const TOP = [
    '...hhhhh....', '..hhhhhhh...', '..HHHHHHH...', 'hhhhhhhhhhh.', '...SSsss....', '...sssss....', '....sss.....',
    '..cccccc....', '.ccCcccccc..', 'cccCccccCcc.', 'cccCccccCcc.', 'cc.Cbbbbcc..', 'ss.CccccC.ss', '...CccccC...', '...Ccccccc..', '...cccccccc.',
  ];
  const LEGS = [
    ['...pp..pp...', '...pp..pp...', '...pp..pp...', '..ff...ff...', '............'],
    ['...pp...pp..', '..pp....pp..', '..pp.....pp.', '.ff......ff.', '............'],
    ['....pppp....', '....pp.p....', '....pp.pp...', '...ff..ff...', '............'],
    ['..pp...pp...', '..pp....pp..', '.pp.....pp..', '.ff......ff.', '............'],
  ];
  function drawDetective(ctx, x, y, frame, flip) {
    sprite(ctx, TOP, KEY, x, y, flip); sprite(ctx, LEGS[frame], KEY, x, y + TOP.length, flip);
    for (let i = 0; i < 12; i++) px(ctx, x + i, y + 21, i > 1 && i < 10 ? '#0b0a14' : 'rgba(0,0,0,0)');
  }

  // ---------- state ----------
  function create(canvas, onClue) {
    const ctx = canvas.getContext('2d');
    const bg = document.createElement('canvas'); bg.width = W; bg.height = H; drawRoom(bg.getContext('2d'));
    // darkness at the edges of the room, dithered, computed once
    const dark = document.createElement('canvas'); dark.width = W; dark.height = H;
    const dk = dark.getContext('2d');
    for (let y = 0; y < 132; y++) for (let x = 0; x < W; x++) {
      const e = Math.abs(x - 160) / 160;
      if (e > 0.9 && (PX.BAYER[y & 3][x & 3] / 16) < (e - 0.9) * 5) px(dk, x, y, 'ink');
    }
    const drops = rain(40, { x: 17, y: 13, w: 56, h: 54 });
    const S = {
      t: 0, det: { x: 150, tx: 150, frame: 0, flip: false, target: null }, hover: null, found: new Set(), banner: 0, bannerText: '',
      msg: { name: 'INSPECTEUR ROUX', lines: wrap('Suite 304, 01:12. The hotel calls it a drunken fall. Click anything that looks wrong.', 48), n: 0 },
      flash: 0,
    };
    const say = (name, str) => { S.msg = { name, lines: wrap(str, 48), n: 0 }; };

    function click(x, y) {
      if (S.msg && S.msg.n < S.msg.lines.join('').length) { S.msg.n = 9999; return; }
      const h = HOT.find((o) => x >= o.r[0] && x < o.r[0] + o.r[2] && y >= o.r[1] && y < o.r[1] + o.r[3]);
      if (h) { S.det.tx = Math.max(6, Math.min(W - 18, h.walk - 6)); S.det.target = h; S.msg = null; }
      else if (y > 90 && y < 132) { S.det.tx = Math.max(6, Math.min(W - 18, x - 6)); S.det.target = null; S.msg = null; }
    }
    function arrive(h) {
      say('INSPECTEUR ROUX', h.say);
      if (h.clue && !S.found.has(h.id)) { S.found.add(h.id); S.banner = 110; S.bannerText = 'NEW CLUE: ' + h.clue; blip(880, 0.08, 0.04); onClue && onClue(h, S.found.size); }
    }
    function move(x, y) { S.hover = HOT.find((o) => x >= o.r[0] && x < o.r[0] + o.r[2] && y >= o.r[1] && y < o.r[1] + o.r[3]) || null; }

    function frame() {
      const t = ++S.t;
      ctx.drawImage(bg, 0, 0);
      // window: sky, sea, lighthouse, rain, lightning
      if (Math.random() < 0.004) S.flash = 6;
      const fl = S.flash > 0 ? S.flash-- : 0;
      for (const [x, y, w, h] of [[17, 13, 27, 23], [46, 13, 27, 23], [17, 38, 27, 29], [46, 38, 27, 29]]) {
        if (fl) { rect(ctx, x, y, w, h, fl % 2 ? 'ice' : 'white'); continue; }
        vgrad(ctx, x, y, w, h, y < 30 ? ['#0b0a14', '#161729'] : ['#161729', '#232845']);
        if (y > 30) { dither(ctx, x, 52, w, 15, 'navy', 'night', 0.35); for (let i = 0; i < w; i += 3) if ((i + t / 8 | 0) % 5 === 0) px(ctx, x + i, 53 + (i % 4) * 3, 'blue'); }
      }
      if (!fl) {
        ellipse(ctx, 27, 21, 3, 3, 'cream'); ellipse(ctx, 28, 20, 2, 2, '#161729');
        rect(ctx, 63, 44, 2, 8, 'cream'); px(ctx, 63, 43, t % 40 < 20 ? 'amber' : 'gold'); px(ctx, 64, 43, 'amber');
        const a = (t / 50) % (Math.PI * 2), bx = Math.cos(a);
        if (bx < 0.2) for (let i = 1; i < 26; i++) px(ctx, 64 - i * (0.3 - bx), 43 + i * 0.12 * Math.sin(a), i % 2 ? 'gold' : 'amber');
        drawRain(ctx, drops, { x: 17, y: 13, w: 56, h: 54 });
      }
      rect(ctx, 44, 13, 2, 54, 'cream'); rect(ctx, 17, 36, 56, 2, 'cream');
      // embers among the ash (the clue glows)
      for (let i = 0; i < 26; i++) {
        const ex = 190 + ((i * 37) % 32), ey = 82 - ((i * 13) % 6);
        const on = (i * 7 + (t >> 2)) % 9;
        px(ctx, ex, ey, on < 2 ? 'amber' : on < 4 ? 'red' : on < 6 ? 'grey' : 'dgrey');
      }
      for (let i = 0; i < 3; i++) { const sy = 80 - ((t / 2 + i * 9) % 26); px(ctx, 204 + Math.sin((t + i * 20) / 9) * 3, sy, 'dgrey'); }
      rect(ctx, 200, 84, 10, 2, 'paper'); px(ctx, 203, 84, 'ink'); px(ctx, 207, 85, 'ink');
      // lamp: bulb glow under the shade + a warm patch on the desk (flickers)
      const on = Math.random() > 0.03;
      rect(ctx, 264, 56, 22, 1, on ? 'gold' : 'amber');
      if (on) { dither(ctx, 262, 57, 26, 7, 'rgba(0,0,0,0)', '#f0b54a', 0.18); rect(ctx, 262, 64, 26, 1, 'amber'); }
      // statuette glint
      if (t % 120 < 6) px(ctx, 284, 104, 'white');
      ctx.drawImage(dark, 0, 0);

      // detective
      const d = S.det;
      if (Math.abs(d.tx - d.x) > 0.6) { d.flip = d.tx < d.x; d.x += Math.sign(d.tx - d.x) * 0.9; if (t % 6 === 0) d.frame = 1 + (d.frame % 3); }
      else { d.frame = 0; if (d.target) { const h = d.target; d.target = null; d.flip = h.walk < d.x + 6 ? true : false; arrive(h); } }
      drawDetective(ctx, Math.round(d.x), FLOOR - 21, d.frame, d.flip);

      // hover label
      if (S.hover) {
        const [x, y, w, h] = S.hover.r;
        for (let i = x; i < x + w; i += 2) { px(ctx, i, y, 'gold'); px(ctx, i, y + h - 1, 'gold'); }
        for (let j = y; j < y + h; j += 2) { px(ctx, x, j, 'gold'); px(ctx, x + w - 1, j, 'gold'); }
        const label = S.hover.name + (S.found.has(S.hover.id) ? ' *' : '');
        const lx = Math.max(2, Math.min(W - PX.measure(label) - 6, x + w / 2 - PX.measure(label) / 2));
        rect(ctx, lx - 2, Math.max(1, y - 11), PX.measure(label) + 5, 10, 'ink'); text(ctx, label, lx, Math.max(2, y - 10), 'gold');
      }
      // HUD
      rect(ctx, 242, 1, 77, 11, 'ink'); text(ctx, 'CLUES ' + S.found.size + '/6', 246, 3, S.found.size === 6 ? 'mint' : 'amber');
      rect(ctx, 1, 1, 94, 11, 'ink'); text(ctx, 'SUITE 304', 5, 3, 'cream');
      if (S.banner > 0) {
        S.banner--; const bw = PX.measure(S.bannerText) + 12, bx = (W - bw) / 2;
        panel(ctx, bx, 16, bw, 15, { fill: 'green' }); text(ctx, S.bannerText, bx + 6, 20, 'white');
      }
      // dialogue box
      panel(ctx, 3, 134, 314, 44);
      if (S.msg) {
        nameTag(ctx, S.msg.name, 10, 127);
        const total = S.msg.lines.join('').length;
        if (S.msg.n < total) { S.msg.n += 1.2; if ((S.msg.n | 0) % 3 === 0) blip(660 + Math.random() * 40, 0.015, 0.012); }
        typed(S.msg.lines, S.msg.n | 0).forEach((l, i) => text(ctx, l, 12, 144 + i * 9, 'cream'));
        if (S.msg.n >= total && t % 40 < 24) text(ctx, '▼', 304, 168, 'amber');
      } else text(ctx, '...', 12, 144, 'grey');
    }
    return { frame, click, move, state: S, HOT };
  }

  window.SCENE304 = { create, drawRoom, drawDetective, HOT };
})();
