// Procedural 48x48 portraits for "Last Stop, Simplon-Orient" (1931). No images: each character
// is a set of masks (hair/hat, outfit, accessories) evaluated per pixel, so expressions are parameters.
//
//   PORTRAITS.draw(ctx, id, x, y, { mouth: 0|1|2, blink, mood, t, dead })
//     mood: calm | nervous | angry | grieving | defensive | relieved | broken
//     dead: true -> closed eyes, grey-blue skin, no sweat/tears (used for Lazăr's body; works for any id)
//   PORTRAITS.CAST[id] -> { name, role, ... }
(function () {
  const { vgrad } = PX;
  const SKIN = {
    fair: ['#f5cfae', '#dfa47c', '#b0704f'], olive: ['#e2b48a', '#c28a60', '#8e5a3a'], pale: ['#f0d9c4', '#d6b39a', '#a88470'],
    ruddy: ['#eaae8c', '#cc7f62', '#94503c'], warm: ['#e6b08a', '#c88c64', '#8a5438'], weathered: ['#d9a582', '#b57c5a', '#7e5038'],
    dead: ['#b9c3cc', '#97a2b1', '#6f7a8c'],
  };
  const CAST = {
    sorel: { name: 'Marc Sorel', role: 'Inspector, Sûreté (you)', skin: 'fair', hair: 'fedora', outfit: 'trench', acc: ['jaw'], bg: ['#0b0a14', '#232845'], lip: '#9a6050', eye: '#35190f', hc: ['#35190f', '#1a1014', '#5a2d1c'], hat: ['#6e4e2a', '#4a3420', '#1a1014'] },
    lazar: { name: 'Anton Lazăr', role: 'Romanian envoy', skin: 'olive', hair: 'bald', outfit: 'tails', acc: ['waxtache', 'monocle'], bg: ['#2a0c14', '#5e1627'], lip: '#8e5a3a', eye: '#35190f', hc: ['#d8d6e0', '#a7a5b3', '#fffdf5'], smile: true },
    ferrand: { name: 'Dr Paul Ferrand', role: 'Physician, Passy', skin: 'pale', hair: 'grey', outfit: 'tweed', acc: ['beard', 'pincenez', 'bags'], bg: ['#1a1409', '#5a4a3a'], lip: '#a8746a', eye: '#34406e', hc: ['#b8b6c0', '#8a8898', '#e8e6ee'] },
    irina: { name: 'Countess Irina Voss', role: 'Austrian widow', skin: 'fair', hair: 'waves', outfit: 'velvet', acc: ['pearls'], bg: ['#2a0c24', '#7a2236'], lip: '#9a1a30', eye: '#34406e', fem: true, hc: ['#2a1a20', '#140c10', '#5a4048'] },
    hale: { name: 'Major Desmond Hale', role: 'Retired, Indian Army', skin: 'ruddy', hair: 'short', outfit: 'khaki', acc: ['bigtache'], bg: ['#1d2a14', '#4a5a2a'], lip: '#94503c', eye: '#34406e', hc: ['#c8683a', '#8a4221', '#e89a5a'] },
    mila: { name: 'Mila Novak', role: 'Cabaret singer', skin: 'pale', hair: 'bob', outfit: 'flapper', acc: ['drops'], bg: ['#0e2a24', '#2f5d4c'], lip: '#e0243a', eye: '#35190f', fem: true, hc: ['#16141e', '#0b0a14', '#4a4a6a'], longNeck: true },
    brandt: { name: 'Stefan Brandt', role: 'Oil company agent', skin: 'fair', hair: 'slick', outfit: 'dbsuit', acc: ['roundspecs', 'jaw'], bg: ['#161729', '#4b4a6a'], lip: '#b0704f', eye: '#5570a8', hc: ['#f0d890', '#c9a860', '#fffdf5'] },
    theo: { name: 'Théo Garnier', role: 'Sleeping-car conductor', skin: 'warm', hair: 'cap', outfit: 'conductor', acc: [], bg: ['#2a1409', '#8a4221'], lip: '#8a5438', eye: '#35190f', hc: ['#35190f', '#1a0c08', '#5a2d1c'], cap: ['#5a2d1c', '#35190f', '#ffd36b'], smile: true },
    castelli: { name: 'Bruno Castelli', role: 'Chef de train', skin: 'weathered', hair: 'kepi', outfit: 'chef', acc: ['whitetache', 'wrinkles'], bg: ['#0b0a14', '#34406e'], lip: '#7e5038', eye: '#35190f', hc: ['#e8e4dc', '#b8b4ac', '#fffdf5'], cap: ['#232845', '#161729', '#ffd36b'] },
  };

  const inEl = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const inHead = (x, y) => inEl(x, y, 24, 20, 9.5, 11.5);
  const ax = (x) => Math.abs(x - 24);

  // ---------- hair / hats: back (behind head) and front (over face) ----------
  const HAIR = {
    cloche: { back: (x, y) => inEl(x, y, 24, 22, 11, 8) && y >= 16 && y <= 28,
      front: (x, y) => inHead(x, y) && ax(x) >= 8 && y >= 15 && y <= 26 },
    bald: { back: () => false,
      front: (x, y) => inHead(x, y) && ax(x) >= 8 && y >= 15 && y <= 22 },
    grey: { back: (x, y) => inEl(x, y, 24, 17, 10, 9) && y <= 18,
      front: (x, y) => inHead(x, y) && (y < 12 + (x % 4 === 0 ? 1 : 0) || (ax(x) >= 8 && y <= 19)) },
    waves: { back: (x, y) => inEl(x, y, 24, 19, 12, 11) && y <= 28,
      front: (x, y) => inHead(x, y) && (y < 13 + (x < 24 ? 2 : 0) || (ax(x) >= 8 && y <= 27)) },
    short: { back: () => false,
      front: (x, y) => inHead(x, y) && (y < 12 || (ax(x) >= 8 && y <= 17)) },
    bob: { back: (x, y) => inEl(x, y, 24, 19, 12, 12) && y <= 28,
      front: (x, y) => (inHead(x, y) && (y < 15 || (ax(x) >= 7 && y <= 28))) || (y >= 19 && y <= 28 && ax(x) >= 7 && ax(x) <= 12) },
    slick: { back: (x, y) => inEl(x, y, 24, 17, 10, 9) && y <= 17,
      front: (x, y) => inHead(x, y) && (y < 12 || (y < 14 && x > 21) || (ax(x) >= 8 && y <= 16)) },
    fedora: { back: () => false, front: (x, y) => inHead(x, y) && ax(x) >= 8 && y >= 14 && y <= 20 },
    cap: { back: () => false, front: (x, y) => inHead(x, y) && ax(x) >= 8 && y >= 13 && y <= 19 },
    kepi: { back: () => false, front: (x, y) => inHead(x, y) && ax(x) >= 8 && y >= 13 && y <= 21 },
  };

  // ---------- outfits (x, y, skin) -> colour, inside the torso mask ----------
  const torso = (x, y) => y >= 35 && ax(x) <= 7 + (y - 35) * 1.8;
  const OUTFIT = {
    trench: (x, y) => {
      if (ax(x) <= (y - 34) * 0.35 && y < 44) return ax(x) <= 1 ? '#5e1627' : '#f3ead2';                // shirt + scarf knot
      if (ax(x) <= (y - 34) * 0.35 + 3 && y < 46) return (x < 24 ? '#c9a06a' : '#a0784a');               // lapels
      if (y === 46 || y === 47) return x === 24 || x === 25 ? '#c67a2f' : '#6e4e2a';                      // belt + buckle
      return x > 29 ? '#8a6a3f' : '#b08a55';
    },
    tails: (x, y) => {
      const sash = Math.abs(x - 14 - (y - 36) * 1.8) <= 2;
      if (sash) return Math.abs(x - 14 - (y - 36) * 1.8) > 1.4 ? '#ffd36b' : '#c93a48';
      if (y <= 37 && ax(x) <= 3) return y === 36 && ax(x) <= 3 ? '#fffdf5' : '#e8e4dc';                   // white tie
      if (ax(x) <= (y - 35) * 0.5 + 1) return (x === 24 && y % 3 === 0) ? '#c0c0d0' : '#fffdf5';         // shirt front + studs
      return x > 29 ? '#0b0a14' : '#1a1420';
    },
    tweed: (x, y) => {
      if (ax(x) <= 1 && y >= 36) return '#232845';                                                        // tie
      if (ax(x) <= (y - 34) * 0.3 + 1) return '#e8e4dc';
      if (ax(x) <= (y - 34) * 0.3 + 3) return '#3a2a1c';                                                  // waistcoat
      const base = x > 29 ? '#4a3622' : '#6e5236';
      return (x * 3 + y * 5) % 7 === 0 ? '#8a6a48' : (x + y) % 5 === 0 ? '#3a2a1c' : base;              // tweed fleck
    },
    velvet: (x, y) => {
      const fur = y <= 40 + ((x * 7) % 3) - (ax(x) < 6 ? 3 : 0) && ax(x) >= 4;                           // stole across shoulders
      if (fur) return (x + y * 2) % 5 === 0 ? '#d8d6e0' : (x * y) % 7 === 0 ? '#e8e4dc' : '#fffdf5';
      if (ax(x) <= 4 && y <= 40) return null;                                                             // skin neckline
      return (x + y) % 6 === 0 ? '#9a2a44' : x > 29 ? '#4a1020' : '#7a2236';
    },
    khaki: (x, y) => {
      if (ax(x) <= 1 && y >= 36) return ((y + (x & 1)) % 3 === 0) ? '#ffd36b' : '#5e1627';                // regimental stripes
      if (ax(x) <= (y - 34) * 0.35 + 1) return '#e8dcc0';
      const base = x > 29 ? '#6e5a34' : '#9a8250';
      return (x * 5 + y * 3) % 8 === 0 ? '#b8a068' : base;
    },
    flapper: (x, y) => {
      if (y <= 41 && ax(x) <= 6 - (y - 35) * 0.3) return null;                                           // bare skin V
      if (ax(x) === 6 && y <= 41) return '#ffd36b';                                                       // gold strap
      if ((x + (y % 2) * 2) % 4 === 0 && y % 2 === 0) return '#ffd36b';                                   // beads
      return x > 29 ? '#1d3a30' : '#2f5d4c';
    },
    dbsuit: (x, y) => {
      if (ax(x) <= 1 && y >= 36 && y < 42) return '#34406e';                                              // tie
      if (ax(x) <= (y - 34) * 0.3 + 1 && y < 42) return '#fffdf5';
      if ((x === 21 || x === 27) && (y === 43 || y === 46)) return '#1a1420';                             // two button rows
      if (Math.abs(ax(x) - ((y - 34) * 0.3 + 2)) < 1 && y < 44) return '#3b3a48';                          // lapel edge
      return x > 29 ? '#4b4a5a' : '#6b6a7a';
    },
    conductor: (x, y) => {
      if (y <= 37 && ax(x) <= 5) return y === 37 ? '#ffd36b' : '#5a2d1c';                                  // high collar with gold edge
      if (x === 24 && y % 3 === 0 && y > 38) return '#ffd36b';
      if ((x === 19 || x === 29) && y === 36) return '#ffd36b';                                             // collar insignia
      return x > 29 ? '#35190f' : '#5a2d1c';
    },
    chef: (x, y) => {
      if (y <= 37 && ax(x) <= 5) return y === 37 || (y === 36 && ax(x) === 5) ? '#ffd36b' : '#232845';
      if (y >= 35 && y <= 37 && ax(x) >= 9 && ax(x) <= 13) return (x + y) % 2 ? '#ffd36b' : '#c67a2f';     // epaulettes
      if ((x === 22 || x === 26) && y % 3 === 0 && y > 38) return '#ffd36b';
      return x > 29 ? '#161729' : '#232845';
    },
  };

  // st: { mouth: 0|1|2, blink, mood, t, dead }
  function draw(ctx, id, ox, oy, st = {}) {
    const C = CAST[id], dead = !!st.dead, S = dead ? SKIN.dead : SKIN[C.skin], H = HAIR[C.hair], O = OUTFIT[C.outfit];
    const mood = dead ? 'calm' : st.mood || 'calm', t = st.t || 0;
    const P = (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(ox + x, oy + y, 1, 1); };

    vgrad(ctx, ox, oy, 48, 48, dead ? ['#232845', '#0b0a14'] : [C.bg[1], C.bg[0]]);
    // faint Art Deco sunburst behind the head
    for (let k = -3; k <= 3; k++) { const a = -Math.PI / 2 + k * 0.42; for (let r = 14; r < 30; r += 2) { const x = Math.round(24 + Math.cos(a) * r), y = Math.round(22 + Math.sin(a) * r); if (x >= 0 && x < 48 && y >= 0) P(x, y, dead ? '#34406e' : '#ffd36b26'); } }
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
      if (H.back(x, y)) P(x, y, x > 28 ? C.hc[1] : C.hc[0]);
    }
    const neckTop = 28, neckW = C.longNeck ? 3 : 4;
    for (let y = neckTop; y < 42; y++) for (let x = 24 - neckW; x <= 24 + neckW; x++) P(x, y, y < 31 || x > 24 + neckW - 2 ? S[1] : S[0]);
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) if (torso(x, y)) {
      const c = O(x, y);
      if (c) P(x, y, c);
      else if (y >= 35) P(x, y, x > 27 ? S[1] : S[0]);
    }
    for (let y = 18; y <= 23; y++) { P(14, y, S[1]); P(34, y, S[2]); }                                    // ears
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) if (inHead(x, y)) {
      const dx = x - 24, dy = y - 20;
      P(x, y, dx > 5 || (dy > 8 && dx > 1) ? S[1] : S[0]);
      if (dy === 11 || dx > 7) P(x, y, S[2]);
    }
    if (C.acc.includes('jaw')) for (let x = 18; x <= 30; x++) P(x, 30, S[2]);                             // sharp jaw line
    if (C.hair === 'bald') { P(20, 11, '#fffdf5'); P(21, 11, '#fffdf5'); P(19, 12, S[0]); P(22, 10, '#fffdf5'); } // dome shine
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) if (H.front(x, y)) {
      let c = x > 28 ? C.hc[1] : C.hc[0];
      if (C.hair === 'waves' && ((x + y * 2) % 6 === 0 || (x - y) % 7 === 0)) c = C.hc[2];                 // finger waves
      else if (C.hair === 'bob' && (y === 9 || y === 10) && x >= 17 && x <= 23) c = C.hc[2];               // gloss
      else if (C.hair === 'slick' && y < 13 && (x * 2 + y) % 5 === 0) c = C.hc[2];                          // comb lines
      else if (C.hair === 'grey' && (x + y) % 3 === 0) c = C.hc[2];
      else if (C.hair === 'short' && (x + y * 3) % 5 === 0) c = C.hc[2];
      P(x, y, c);
    }
    if (C.hair === 'slick') for (let y = 9; y <= 12; y++) P(20, y, S[1]);                                 // side parting
    if (C.hair === 'bob') { P(21, 15, C.hc[0]); P(22, 15, C.hc[0]); P(22, 16, C.hc[0]); P(20, 16, C.hc[0]); P(21, 17, C.hc[0]); } // kiss curl

    // brows
    const browC = { grey: '#8a8898', short: '#a04a2a', slick: '#c9a860', kepi: '#e8e4dc', bald: '#a7a5b3' }[C.hair] || '#1a1014';
    const tilt = mood === 'angry' ? 1 : mood === 'grieving' || mood === 'broken' || mood === 'nervous' ? -1 : 0;
    const base = mood === 'defensive' ? 18 : mood === 'relieved' ? 16 : 17;
    if (!dead) for (let i = 0; i < 4; i++) {
      const lift = tilt === 0 ? 0 : tilt > 0 ? (i >= 2 ? 1 : 0) : (i >= 2 ? -1 : 0);
      P(18 + i, base + lift, browC); P(29 - i, base + lift, browC);
      if (C.hair === 'short' || C.hair === 'kepi') { P(18 + i, base - 1 + lift, browC); P(29 - i, base - 1 + lift, browC); }
    }
    // eyes
    if (dead || st.blink) { for (const x of [18, 19, 20, 27, 28, 29]) P(x, 20, dead ? S[2] : '#35190f'); }
    else {
      P(19, 19, '#1a1420'); P(20, 19, '#1a1420'); P(27, 19, '#1a1420'); P(28, 19, '#1a1420');
      P(19, 20, '#fffdf5'); P(20, 20, C.eye); P(27, 20, C.eye); P(28, 20, '#fffdf5');
      if (C.fem) { P(18, 19, '#1a1420'); P(29, 19, '#1a1420'); }
    }
    if (C.acc.includes('bags')) { P(19, 21, S[2]); P(20, 21, S[2]); P(27, 21, S[2]); P(28, 21, S[2]); }   // tired eyes
    // nose
    P(24, 22, S[1]); P(24, 23, S[1]); P(23, 24, S[2]); P(25, 24, S[1]);
    if (C.fem && !dead) { P(18, 23, C.lip + '55'); P(29, 23, C.lip + '55'); }
    if (C.skin === 'ruddy' && !dead) { P(18, 23, '#d06a58'); P(19, 23, '#d06a58'); P(29, 23, '#d06a58'); P(30, 23, '#d06a58'); P(24, 23, '#d06a58'); }

    // mouth
    const lip = dead ? S[2] : C.fem ? C.lip : S[2];
    const m = dead ? 0 : st.mouth || 0;
    if (m === 0) {
      for (let x = 22; x <= 26; x++) P(x, 27, lip);
      if (C.fem) for (let x = 23; x <= 25; x++) P(x, 28, lip);
      if (mood === 'relieved' || (C.smile && mood === 'calm')) { P(21, 26, lip); P(27, 26, lip); }
      if (mood === 'grieving' || mood === 'broken' || mood === 'angry') { P(21, 28, lip); P(27, 28, lip); }
      if (mood === 'nervous') { P(23, 28, lip); P(25, 26, S[1]); }
    } else {
      for (let x = 22; x <= 26; x++) P(x, 27, lip);
      for (let x = 23; x <= 25; x++) P(x, 28, '#3a0e14');
      if (m === 2) { for (let x = 23; x <= 25; x++) P(x, 28, '#fffdf5'); for (let x = 22; x <= 26; x++) P(x, 29, '#3a0e14'); for (let x = 23; x <= 25; x++) P(x, 30, lip); }
      else for (let x = 23; x <= 25; x++) P(x, 29, lip);
    }

    // accessories
    for (const a of C.acc) {
      if (a === 'pearls') for (let x = 19; x <= 29; x += 2) { const y = 31 + Math.round(2 * Math.sqrt(Math.max(0, 1 - ((x - 24) / 6) ** 2))); P(x, y, '#fffdf5'); P(x + 1, y, '#a7a5b3'); }
      if (a === 'jaw') { for (let x = 17; x <= 31; x++) if (inHead(x, 30) || inHead(x, 29)) P(x, 30, S[2]); P(19, 16, '#35190f'); P(20, 16, '#35190f'); P(28, 16, '#35190f'); P(29, 16, '#35190f'); } // squarer jaw shadow + heavier brows
      if (a === 'earring') { P(14, 24, '#ffd36b'); P(14, 25, '#ffd36b'); }
      if (a === 'drops') { P(14, 24, '#ffd36b'); P(14, 25, '#ffd36b'); P(14, 26, '#79ad7c'); P(34, 24, '#ffd36b'); P(34, 25, '#ffd36b'); P(34, 26, '#79ad7c'); }
      if (a === 'waxtache') { for (let x = 20; x <= 28; x++) P(x, 25, '#a7a5b3'); for (let x = 21; x <= 27; x++) P(x, 26, x === 24 ? S[1] : '#8a8898'); P(19, 24, '#a7a5b3'); P(29, 24, '#a7a5b3'); P(18, 23, '#d8d6e0'); P(30, 23, '#d8d6e0'); }
      if (a === 'bigtache') { for (let x = 19; x <= 29; x++) { P(x, 25, '#a04a2a'); P(x, 26, x % 2 ? '#c8683a' : '#a04a2a'); } for (const x of [18, 30]) { P(x, 26, '#a04a2a'); P(x, 27, '#8a4221'); } for (let x = 21; x <= 27; x++) P(x, 24, '#c8683a'); }
      if (a === 'whitetache') { for (let x = 19; x <= 29; x++) { P(x, 25, '#fffdf5'); P(x, 26, '#e8e4dc'); } for (const x of [17, 18, 30, 31]) P(x, 27, '#e8e4dc'); for (let x = 21; x <= 27; x++) P(x, 24, '#fffdf5'); }
      if (a === 'beard') {
        const bc = dead ? '#8a8898' : '#b8b6c0', bd = '#8a8898';
        for (let y = 23; y <= 33; y++) for (let x = 14; x <= 34; x++) {
          if (!inHead(x, y) && !(y >= 31 && ax(x) <= 5)) continue;
          const mouthHole = y >= 26 && y <= 29 && x >= 22 && x <= 26;
          if (mouthHole) continue;
          if ((y >= 25 && ax(x) >= 4) || y >= 29 || (y === 25 && ax(x) <= 4) || ax(x) >= 7) P(x, y, (x + y) % 3 === 0 ? bd : bc);
        }
      }
      if (a === 'monocle') {
        const f = '#d8d6e0';
        for (const [x, y] of [[18, 18], [19, 17], [20, 17], [21, 18], [22, 19], [22, 20], [21, 21], [20, 22], [19, 22], [18, 21], [17, 20], [17, 19]]) P(x, y, f);
        P(19, 18, '#9cc0e4'); if (t % 90 < 8) P(20, 18, '#fffdf5');
        for (let i = 0; i < 12; i++) P(17 - Math.floor(i / 4), 22 + i, i % 2 ? '#c0c0d0' : '#ffd36b');         // chain to the lapel
      }
      if (a === 'pincenez') {
        const f = '#c0c0d0';
        for (const bx of [18, 26]) { P(bx, 19, f); P(bx, 20, f); P(bx + 3, 19, f); P(bx + 3, 20, f); P(bx + 1, 18, f); P(bx + 2, 18, f); P(bx + 1, 21, f); P(bx + 2, 21, f); }
        P(23, 19, f); P(24, 18, f); P(25, 19, f);
        for (let i = 0; i < 8; i++) P(17 - (i >> 2), 21 + i, '#1a1420');                                     // black ribbon
      }
      if (a === 'roundspecs') {
        const f = '#8a8898';
        for (const cx of [19.5, 28.5]) for (let y = 16; y <= 23; y++) for (let x = 15; x <= 33; x++) { const d = Math.hypot(x - cx, y - 19.5); if (d >= 2.3 && d < 3.2) P(x, y, f); }
        P(23, 19, f); P(24, 19, f); P(25, 19, f); P(15, 19, f); P(33, 19, f);
        if (t % 120 < 10) P(18, 18, '#fffdf5');
      }
      if (a === 'wrinkles') { P(16, 20, S[2]); P(16, 21, S[2]); P(32, 20, S[2]); P(32, 21, S[2]); P(21, 14, S[1]); P(22, 14, S[1]); P(26, 14, S[1]); P(27, 14, S[1]); }
    }

    // hats
    if (C.hair === 'cloche') {
      const [h1, h2, band] = C.hat;
      for (let y = 2; y <= 15; y++) for (let x = 11; x <= 37; x++) if (inEl(x, y, 24, 14, 12, 12)) P(x, y, x > 31 ? h2 : (x + y) % 9 === 0 && x < 22 ? '#4b4a5a' : h1);
      for (let x = 12; x <= 36; x++) if (inEl(x, 12, 24, 14, 12.5, 12)) { P(x, 11, band); P(x, 12, band); }   // wine band
      P(31, 10, '#ffd36b'); P(32, 11, '#ffd36b'); P(31, 12, '#ffd36b'); P(30, 11, '#fffdf5');                 // deco brooch
      for (let y = 15; y <= 17; y++) for (let x = 11 - (y - 15); x <= 37 + (y - 15); x++) if (ax(x) >= 7 || y === 15) P(x, y, y === 17 ? '#161729' : h2); // brim
    }
    if (C.hair === 'fedora') {
      const [h1, h2, band] = C.hat;
      for (let y = 3; y <= 12; y++) for (let x = 14; x <= 34; x++) {
        if (!inEl(x, y, 24, 12, 10, 9) || (y <= 5 && ax(x) <= 2)) continue;                                  // crown with a pinched top
        P(x, y, x > 30 ? h2 : (x + y) % 11 === 0 && x < 22 ? '#8a6a3f' : h1);
      }
      for (let x = 14; x <= 34; x++) if (inEl(x, 10, 24, 12, 10.5, 9)) { P(x, 10, band); P(x, 11, band); }   // dark band
      for (let x = 8; x <= 40; x++) { P(x, 12, x > 34 ? h2 : h1); P(x, 13, x < 10 || x > 38 ? h2 : '#35190f'); } // wide brim
    }
    if (C.hair === 'cap' || C.hair === 'kepi') {
      const [c1, c2, band] = C.cap;
      const top = C.hair === 'kepi' ? 3 : 5;
      for (let y = top; y <= 11; y++) for (let x = 15 + (y === top ? 1 : 0); x <= 33 - (y === top ? 1 : 0); x++) P(x, y, y >= 10 ? band : x > 29 ? c2 : c1);
      if (C.hair === 'kepi') { for (let x = 16; x <= 32; x++) P(x, 6, band); }                               // braid
      for (let x = 14; x <= 32; x++) { P(x, 12, '#0b0a14'); P(x, 13, x < 18 ? '#3b3a48' : '#0b0a14'); }        // peak
      P(24, 8, band); P(23, 8, '#c67a2f'); P(25, 8, '#c67a2f');
      if (C.hair === 'cap') { P(22, 7, band); P(26, 7, band); }                                                 // CIWL badge wings
    }

    if (dead) return;
    if (mood === 'nervous' && t % 60 < 45) { P(33, 14, '#9cc0e4'); P(33, 15, '#9cc0e4'); P(32, 15, '#fffdf5'); }
    if (mood === 'broken' || mood === 'grieving') { const ty = 21 + ((t >> 3) % 5); P(20, ty, '#9cc0e4'); }
    if (mood === 'angry') { P(35, 10, '#c93a48'); P(37, 10, '#c93a48'); P(36, 9, '#c93a48'); P(36, 11, '#c93a48'); }
  }

  window.PORTRAITS = { CAST, draw, SKIN };
})();
