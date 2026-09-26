// Small top-down people (10x18 px, Among Us scale) drawn from a character's `look` colours.
// drawPerson(ctx, look, x, y, { dir: 'down'|'up'|'left'|'right', step: 0..3 | -1 idle, t })
// (x, y) is the point between the feet. drawBody() draws the victim lying in his berth.
(function () {
  const INK = '#0b0a14', SHADOW = 'rgba(11,10,20,.35)';
  const DRESS = { waves: true, bob: true };

  function drawPerson(ctx, L, x, y, o = {}) {
    const dir = o.dir || 'down', step = o.step ?? -1, side = dir === 'left' || dir === 'right';
    const ox = Math.round(x) - 5, oy = Math.round(y) - 17;
    const flip = dir === 'left';
    const r = (dx, dy, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(flip ? ox + 10 - dx - w : ox + dx, oy + dy, w, h); };
    const dress = DRESS[L.hairStyle];
    const lift = (leg) => (step === 1 && leg === 0) || (step === 3 && leg === 1) ? 1 : 0;

    r(1, 16, 8, 1, SHADOW); r(2, 17, 6, 1, SHADOW);

    // legs + shoes
    if (side) {
      const a = step === 1 ? 1 : step === 3 ? -1 : 0;
      r(4 + a, 12, 2, 4, L.legs); r(4 + a, 16, 3, 1, INK);
      r(4 - a, 12, 2, 4, shade(L.legs)); r(4 - a, 16, 3, 1, INK);
    } else {
      r(3, 12, 2, 4 - lift(0), L.legs); r(3, 16 - lift(0), 2, 1, INK);
      r(5, 12, 2, 4 - lift(1), shade(L.legs)); r(5, 16 - lift(1), 2, 1, INK);
    }
    // body
    if (side) { r(3, 7, 5, 6, L.coat); r(3, 7, 1, 6, L.coat2); if (dress) r(2, 11, 6, 4, L.coat); }
    else {
      r(2, 7, 6, 6, L.coat); r(7, 7, 1, 6, L.coat2);
      if (dress) { r(1, 11, 8, 4, L.coat); r(8, 11, 1, 4, L.coat2); }
      if (dir === 'down') {
        r(4, 7, 2, 2, L.trim);
        if (L.hairStyle === 'cap' || L.hairStyle === 'kepi') { r(4, 9, 1, 1, '#ffd36b'); r(4, 11, 1, 1, '#ffd36b'); }
        if (L.acc === 'pearls') { r(3, 7, 1, 1, '#fffdf5'); r(6, 7, 1, 1, '#fffdf5'); }
        if (L.acc === 'beads') for (let i = 0; i < 3; i++) { r(3 + i * 2, 9, 1, 1, '#ffd36b'); r(2 + i * 2, 11, 1, 1, '#ffd36b'); }
        if (L.id === 'lazar') { r(3, 8, 1, 1, L.trim); r(4, 9, 1, 1, L.trim); r(5, 10, 1, 1, L.trim); r(6, 11, 1, 1, L.trim); }
      } else if (dir === 'up') r(4, 8, 1, 4, L.coat2);
    }
    // arms (swing while walking)
    const sw = step === 1 ? -1 : step === 3 ? 1 : 0;
    if (side) { r(5 + sw, 8, 2, 4, L.coat2); r(5 + sw, 12, 2, 1, L.skin); }
    else { r(1, 8 + sw, 1, 4, L.coat2); r(1, 12 + sw, 1, 1, L.skin); r(8, 8 - sw, 1, 4, L.coat2); r(8, 12 - sw, 1, 1, L.skin); }

    head(r, L, dir, side, o);
  }

  function head(r, L, dir, side, o) {
    const H = L.hair, S = L.skin, st = L.hairStyle;
    if (dir === 'up') {
      r(2, 2, 6, 5, H === '#d8d6e0' && st === 'bald' ? S : H);
      if (st === 'bald') { r(2, 3, 1, 2, H); r(7, 3, 1, 2, H); r(2, 5, 6, 1, H); }
      hat(r, L, st, 'up');
      return;
    }
    if (side) {
      r(3, 2, 5, 5, S); r(8, 4, 1, 1, S);                            // face + nose
      r(6, 4, 1, 1, INK);                                           // eye
      if (st !== 'bald') { r(3, 1, 5, 2, H); r(3, 3, 2, 2, H); }
      else { r(3, 3, 1, 2, H); r(4, 2, 1, 1, '#fffdf5'); }
      if (DRESS[st]) r(2, 2, 2, 4, H);
      if (L.acc === 'moustache' || L.acc === 'beard') r(6, 5, 3, 1, H);
      if (L.acc === 'beard') r(5, 6, 3, 1, H);
      if (L.acc === 'specs') r(5, 4, 3, 1, '#c0c0d0');
      if (L.acc === 'monocle') r(6, 4, 1, 1, '#d8d6e0');
      hat(r, L, st, 'side');
      return;
    }
    // facing down
    r(2, 2, 6, 5, S); r(7, 2, 1, 5, shade(S));
    const blink = o.t != null && (o.t + (L.seed || 0)) % 170 < 5;
    if (!blink) { r(3, 4, 1, 1, INK); r(6, 4, 1, 1, INK); } else { r(3, 4, 1, 1, shade(S)); r(6, 4, 1, 1, shade(S)); }
    if (st === 'bald') { r(2, 3, 1, 2, H); r(7, 3, 1, 2, H); r(4, 2, 1, 1, '#fffdf5'); }
    else if (st === 'waves' || st === 'bob') { r(1, 1, 8, 2, H); r(1, 3, 2, st === 'bob' ? 3 : 4, H); r(7, 3, 2, st === 'bob' ? 3 : 4, H); if (st === 'bob') r(3, 3, 1, 1, H); }
    else if (st === 'grey' || st === 'short' || st === 'slick') { r(2, 1, 6, 2, H); r(2, 3, 1, 1, H); r(7, 3, 1, 1, H); if (st === 'slick') r(3, 2, 1, 1, shade(H)); }
    if (L.acc === 'moustache') r(3, 5, 4, 1, H === '#d8d6e0' ? '#e8e4dc' : H);
    if (L.acc === 'beard') { r(2, 5, 6, 2, H); r(4, 5, 2, 1, shade(S)); }
    if (L.acc === 'specs') { r(2, 4, 6, 1, '#c0c0d0'); r(3, 4, 1, 1, INK); r(6, 4, 1, 1, INK); }
    if (L.acc === 'monocle') r(6, 4, 1, 1, '#d8d6e0');
    if (L.id === 'lazar') { r(3, 5, 4, 1, '#d8d6e0'); }
    hat(r, L, st, 'down');
  }

  function hat(r, L, st, view) {
    if (st === 'cap' || st === 'kepi') {
      const c = st === 'kepi' ? '#232845' : L.coat;
      r(2, 0, 6, 2, c); r(2, 2, 6, 1, '#ffd36b');
      if (view === 'down') r(2, 3, 6, 1, INK); else if (view === 'side') r(7, 2, 3, 1, INK);
    }
    if (st === 'fedora') { r(2, 0, 6, 2, L.coat2 === '#8a6a3f' ? '#6e4e2a' : L.coat2); r(2, 1, 6, 1, '#1a1014'); if (view === 'down') { r(1, 2, 8, 1, '#6e4e2a'); r(2, 3, 1, 1, L.hair); r(7, 3, 1, 1, L.hair); } else if (view === 'side') r(1, 2, 9, 1, '#6e4e2a'); else r(1, 2, 8, 1, '#6e4e2a'); }
    if (st === 'cloche') { r(1, 0, 8, 3, '#2a2a36'); r(1, 2, 8, 1, L.trim); if (view !== 'up') r(1, 3, 2, 1, '#2a2a36'); }
  }

  function shade(hex) {
    const n = parseInt(hex.slice(1, 7), 16), k = 0.72;
    const c = (v) => Math.round(v * k).toString(16).padStart(2, '0');
    return '#' + c(n >> 16) + c((n >> 8) & 255) + c(n & 255);
  }

  // The victim, lying on his back in the berth, head to the left.
  function drawBody(ctx, L, x, y) {
    const r = (dx, dy, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy, w, h); };
    r(0, 0, 7, 6, '#f3ead2');                     // pillow
    r(1, 1, 5, 4, '#b8c4cc'); r(1, 1, 1, 4, '#d8d6e0'); r(5, 1, 1, 4, '#d8d6e0'); r(3, 2, 1, 1, '#d8d6e0');
    r(7, -1, 22, 8, '#5e1627'); r(7, -1, 22, 1, '#7a2236'); for (let i = 9; i < 28; i += 4) r(i, 2, 1, 1, '#c67a2f'); // blanket
    r(10, 6, 3, 2, '#b8c4cc');                     // hand hanging down
  }

  window.PEOPLE = { drawPerson, drawBody, shade };
})();
