// Procedural 48x48 portraits. Each character is a set of masks (hair, outfit, accessories)
// evaluated per pixel, so expressions (mouth frames, blink, mood) are just parameters.
(function () {
  const { vgrad } = PX;
  const SKIN = {
    fair: ['#f5cfae', '#dfa47c', '#b0704f'], olive: ['#e2b48a', '#c28a60', '#8e5a3a'], pale: ['#f0d9c4', '#d6b39a', '#a88470'],
    freckled: ['#f6d0b0', '#e0a882', '#b36f4e'], weathered: ['#d9a582', '#b57c5a', '#7e5038'],
  };
  const CAST = {
    helene: { name: 'Hélène Castellane', role: "The widow", skin: 'fair', hair: 'wave', outfit: 'gown', acc: ['pearls'], bg: ['#2a0c24', '#5e1627'], lip: '#b8283a', eye: '#34406e', fem: true, hc: ['#f0d890', '#c9a860', '#fffdf5'] },
    lucien: { name: 'Lucien Moreau', role: 'The leading man', skin: 'olive', hair: 'slick', outfit: 'tux', acc: ['pin'], bg: ['#161729', '#34406e'], lip: '#a8604a', eye: '#35190f', hc: ['#1a1420', '#0b0a14', '#4a4a6a'] },
    solange: { name: 'Solange Duret', role: 'The screenwriter', skin: 'fair', hair: 'bob', outfit: 'green', acc: ['cigarette'], bg: ['#12261f', '#2f5d4c'], lip: '#8e2a3a', eye: '#2f5d4c', fem: true, hc: ['#a7a5b3', '#6b6a7a', '#d8d6e0'] },
    armand: { name: 'Armand Petit', role: 'The accountant', skin: 'pale', hair: 'combover', outfit: 'greysuit', acc: ['specs'], bg: ['#1a1d33', '#3b3a48'], lip: '#a8746a', eye: '#5a2d1c', hc: ['#7a6a5a', '#5a4a3a', '#9a8a7a'] },
    margot: { name: 'Margot Lenoir', role: 'The chambermaid', skin: 'freckled', hair: 'auburn', outfit: 'maid', acc: ['freckles', 'cap'], bg: ['#35190f', '#8a4221'], lip: '#c85a5a', eye: '#2f5d4c', fem: true, hc: ['#a04a2a', '#6e2e1a', '#c8683a'] },
    emile: { name: 'Émile Bastide', role: 'The night concierge', skin: 'weathered', hair: 'kepi', outfit: 'livery', acc: ['moustache', 'wrinkles'], bg: ['#2a1409', '#5a2d1c'], lip: '#8e5a4a', eye: '#35190f', hc: ['#e8e4dc', '#b8b4ac', '#fffdf5'] },
    roux: { name: 'Inspecteur Roux', role: 'You', skin: 'fair', hair: 'fedora', outfit: 'trench', acc: ['stubble'], bg: ['#0b0a14', '#232845'], lip: '#9a6050', eye: '#35190f', hc: ['#2a2420', '#1a1410', '#4a4038'] },
  };

  const inEl = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const inHead = (x, y) => inEl(x, y, 24, 20, 9.5, 11.5);
  const ax = (x) => Math.abs(x - 24);

  const HAIR = {
    wave: { back: (x, y) => inEl(x, y, 24, 18, 12, 12) || (y >= 18 && y <= 35 && ax(x) >= 8 && ax(x) <= 12 + (y > 30 ? 1 : 0)),
      front: (x, y) => inHead(x, y) && (y < 13 + (x < 24 ? 3 : 1) - ((x + y) % 5 === 0 ? 1 : 0) || (ax(x) >= 8 && y < 25)) },
    slick: { back: (x, y) => inEl(x, y, 24, 17, 10, 10) && y <= 20,
      front: (x, y) => inHead(x, y) && (y < 12 || (y < 14 && x < 21) || (ax(x) >= 8 && y <= 18)) },
    bob: { back: (x, y) => inEl(x, y, 24, 19, 12, 12) && y <= 30,
      front: (x, y) => inHead(x, y) && (y < 15 || (ax(x) >= 7 && y <= 30)) },
    combover: { back: (x, y) => ax(x) >= 8 && ax(x) <= 10 && y >= 14 && y <= 22,
      front: (x, y) => (inHead(x, y) && ax(x) >= 8 && y >= 13 && y <= 21) || (y === 10 && x >= 17 && x <= 30 && x % 2 === 0) || (y === 11 && x >= 16 && x <= 28 && x % 3 !== 0) },
    auburn: { back: (x, y) => inEl(x, y, 24, 18, 11, 11) && y <= 26,
      front: (x, y) => inHead(x, y) && (y < 14 + (x % 3 === 0 ? 1 : 0) || (ax(x) >= 8 && y <= 24)) },
    kepi: { back: () => false, front: (x, y) => inHead(x, y) && ax(x) >= 8 && y >= 14 && y <= 22 },
    fedora: { back: () => false, front: (x, y) => inHead(x, y) && ax(x) >= 8 && y >= 13 && y <= 19 },
  };

  const torso = (x, y) => y >= 35 && ax(x) <= 7 + (y - 35) * 1.8;
  const OUTFIT = {
    gown: (x, y, S) => y < 41 ? (x > 27 ? S[1] : S[0]) : (ax(x) <= 6 - (y - 41) && y < 47 ? (x > 27 ? S[1] : S[0]) : (x > 28 ? '#0b0a14' : '#1a1420')),
    tux: (x, y) => (ax(x) <= (y - 34) * 0.45 + 1 ? '#fffdf5' : (ax(x) <= (y - 34) * 0.45 + 3 ? '#3b3a48' : (x > 29 ? '#0b0a14' : '#1a1420'))),
    green: (x, y) => (ax(x) <= (y - 34) * 0.5 ? '#f3ead2' : (x > 29 ? '#1d3a30' : '#2f5d4c')),
    greysuit: (x, y) => (ax(x) <= 1 && y >= 36 ? '#5e1627' : ax(x) <= (y - 34) * 0.4 + 1 ? '#fffdf5' : (x > 29 ? '#4b4a5a' : '#6b6a7a')),
    maid: (x, y) => (y <= 37 && ax(x) <= 6 ? '#fffdf5' : (ax(x) === 5 && y > 37 ? '#f3ead2' : (x > 29 ? '#0b0a14' : '#1a1420'))),
    livery: (x, y) => (y <= 36 && ax(x) <= 6 ? '#ffd36b' : ((x === 21 || x === 27) && y % 3 === 0 && y > 37 ? '#ffd36b' : (x > 29 ? '#3e0e1a' : '#5e1627'))),
    trench: (x, y) => (ax(x) <= 1 && y >= 36 ? '#232845' : ax(x) <= (y - 34) * 0.35 + 1 ? '#f3ead2' : ax(x) <= (y - 34) * 0.35 + 4 ? '#8a6a3f' : (x > 29 ? '#8a6a3f' : '#b08a55')),
  };

  // st: { mouth: 0|1|2, blink: bool, mood: 'calm'|'nervous'|'angry'|'grieving'|'defensive'|'relieved'|'broken', t: frame }
  function draw(ctx, id, ox, oy, st = {}) {
    const C = CAST[id], S = SKIN[C.skin], H = HAIR[C.hair], O = OUTFIT[C.outfit];
    const mood = st.mood || 'calm', t = st.t || 0;
    const P = (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(ox + x, oy + y, 1, 1); };

    vgrad(ctx, ox, oy, 48, 48, [C.bg[1], C.bg[0]]);
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
      if (H.back(x, y)) P(x, y, x > 28 ? C.hc[1] : C.hc[0]);
      if (torso(x, y)) P(x, y, O(x, y, S));
    }
    for (let y = 28; y < 38; y++) for (let x = 20; x <= 28; x++) P(x, y, y < 32 || x > 26 ? S[1] : S[0]); // neck
    for (let y = 18; y <= 23; y++) { P(14, y, S[1]); P(34, y, S[2]); }                                   // ears
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) if (inHead(x, y)) {
      const dx = x - 24, dy = y - 20;
      P(x, y, dx > 5 || (dy > 8 && dx > 1) ? S[1] : S[0]);
      if (dy === 11 || (dx > 7)) P(x, y, S[2]);
    }
    if (C.hair === 'fedora') for (let y = 13; y <= 16; y++) for (let x = 15; x <= 33; x++) if (inHead(x, y)) P(x, y, S[2]); // hat shadow
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) if (H.front(x, y)) {
      const hl = C.hc[2] && (x + y * 2) % 9 === 0 && x < 26;
      P(x, y, hl ? C.hc[2] : x > 28 ? C.hc[1] : C.hc[0]);
    }

    // brows
    const browC = C.hair === 'kepi' ? '#fffdf5' : C.hair === 'wave' ? '#c9a860' : C.hair === 'bob' ? '#6b6a7a' : '#35190f';
    const tilt = mood === 'angry' ? 1 : mood === 'grieving' || mood === 'broken' || mood === 'nervous' ? -1 : 0;
    for (let i = 0; i < 4; i++) {
      const lift = tilt === 0 ? 0 : tilt > 0 ? (i >= 2 ? 1 : 0) : (i >= 2 ? -1 : 0);
      P(18 + i, 17 + lift, browC); P(29 - i, 17 + lift, browC);
      if (C.hair === 'kepi') { P(18 + i, 16 + lift, browC); P(29 - i, 16 + lift, browC); }
    }
    // eyes
    if (st.blink) { for (const x of [19, 20, 27, 28]) P(x, 20, '#35190f'); }
    else {
      P(19, 19, '#1a1420'); P(20, 19, '#1a1420'); P(27, 19, '#1a1420'); P(28, 19, '#1a1420');
      P(19, 20, '#fffdf5'); P(20, 20, C.eye); P(27, 20, C.eye); P(28, 20, '#fffdf5');
      if (C.fem) { P(18, 19, '#1a1420'); P(29, 19, '#1a1420'); }
    }
    // nose
    P(24, 22, S[1]); P(24, 23, S[1]); P(23, 24, S[2]); P(25, 24, S[1]);
    if (C.fem) { P(18, 23, C.lip + '55'); P(29, 23, C.lip + '55'); }
    // mouth
    const lip = C.fem ? C.lip : S[2];
    const m = st.mouth || 0;
    if (m === 0) {
      for (let x = 22; x <= 26; x++) P(x, 27, lip);
      if (mood === 'relieved') { P(21, 26, lip); P(27, 26, lip); }
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
      if (a === 'pearls') for (let x = 18; x <= 30; x += 2) { const y = 31 + Math.round(5 * Math.sqrt(Math.max(0, 1 - ((x - 24) / 7) ** 2))); P(x, y, '#fffdf5'); P(x + 1, y, '#a7a5b3'); }
      if (a === 'pin') { P(18, 41, '#ffd36b'); } // his carnation is missing: only the pin is left
      if (a === 'specs') {
        const f = '#c0c0d0';
        for (const bx of [17, 25]) { for (let x = bx + 1; x <= bx + 4; x++) { P(x, 18, f); P(x, 21, f); } P(bx, 19, f); P(bx, 20, f); P(bx + 5, 19, f); P(bx + 5, 20, f); }
        P(23, 19, f); P(24, 19, f); if (t % 90 < 8) P(19, 19, '#fffdf5');
      }
      if (a === 'cigarette') {
        for (let i = 0; i < 9; i++) P(27 + i, 28 + Math.floor(i * 0.6), i > 5 ? '#fffdf5' : '#0b0a14');
        P(36, 33, t % 20 < 10 ? '#f0b54a' : '#c93a48');
        for (let k = 0; k < 4; k++) { const sy = 31 - ((t / 3 + k * 5) % 20), sx = 37 + Math.round(Math.sin((t + k * 9) / 6)); if (sy > 2) P(sx, sy, '#a7a5b3'); }
      }
      if (a === 'freckles') for (const [x, y] of [[18, 22], [20, 23], [19, 24], [28, 22], [29, 23], [27, 24]]) P(x, y, '#b36f4e');
      if (a === 'cap') {
        for (let y = 6; y <= 10; y++) for (let x = 14; x <= 34; x++) if (inEl(x, y, 24, 11, 11, 6) && (y < 10 || x % 2 === 0)) P(x, y, y === 9 ? '#d8c9a3' : '#fffdf5');
      }
      if (a === 'moustache') { for (let x = 20; x <= 28; x++) P(x, 25, '#fffdf5'); for (const x of [19, 20, 28, 29]) P(x, 26, '#e8e4dc'); }
      if (a === 'wrinkles') { P(16, 20, S[2]); P(16, 21, S[2]); P(32, 20, S[2]); P(32, 21, S[2]); P(21, 29, S[2]); }
      if (a === 'stubble') for (let y = 26; y <= 31; y++) for (let x = 17; x <= 31; x++) if (inHead(x, y) && (x + y) % 3 === 0 && !(y === 27 && x >= 22 && x <= 26)) P(x, y, S[2]);
    }
    if (C.hair === 'kepi') { // concierge cap
      for (let y = 4; y <= 11; y++) for (let x = 15 + (y === 4 ? 1 : 0); x <= 33 - (y === 4 ? 1 : 0); x++) P(x, y, y >= 10 ? '#ffd36b' : x > 29 ? '#161729' : '#232845');
      for (let x = 14; x <= 30; x++) { P(x, 12, '#0b0a14'); P(x, 13, x < 18 ? '#3b3a48' : '#0b0a14'); }
      P(24, 7, '#ffd36b'); P(23, 7, '#c67a2f'); P(25, 7, '#c67a2f');
    }
    if (C.hair === 'fedora') {
      for (let y = 3; y <= 11; y++) for (let x = 16; x <= 32; x++) if (!(y === 3 && ax(x) < 3)) P(x, y, y >= 9 ? '#0b0a14' : x > 28 ? '#35190f' : '#5a2d1c');
      for (let x = 10; x <= 38; x++) { P(x, 12, x > 33 ? '#35190f' : '#5a2d1c'); P(x, 13, '#35190f'); }
    }
    if (mood === 'nervous' && t % 60 < 45) { P(33, 14, '#9cc0e4'); P(33, 15, '#9cc0e4'); P(32, 15, '#fffdf5'); }
    if (mood === 'broken' || mood === 'grieving') { const ty = 21 + ((t >> 3) % 5); P(20, ty, '#9cc0e4'); }
    if (mood === 'angry') { P(35, 10, '#c93a48'); P(37, 10, '#c93a48'); P(36, 9, '#c93a48'); P(36, 11, '#c93a48'); }
  }

  window.PORTRAITS = { CAST, draw };
})();
