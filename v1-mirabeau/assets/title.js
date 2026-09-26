// Title screen: the Hôtel Mirabeau on the Promenade, storm, neon, police car. All code.
(function () {
  const { rect, px, line, ellipse, dither, vgrad, text, rain, drawRain } = PX;
  const W = 320, H = 180;
  const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

  const WIN = []; // facade windows: [x, y, lit, isSuite304]
  function drawStatic(b) {
    vgrad(b, 0, 0, W, 118, ['#0b0a14', '#161729', '#232845', '#34406e']);
    for (let i = 0; i < 70; i++) px(b, rnd() * W, rnd() * 70, rnd() < 0.2 ? 'cream' : 'lgrey');
    ellipse(b, 46, 34, 9, 9, 'cream'); ellipse(b, 50, 31, 8, 8, '#161729');
    for (let i = 0; i < 5; i++) ellipse(b, 20 + i * 60 + rnd() * 20, 52 + rnd() * 20, 22, 3, rnd() < 0.5 ? 'navy' : 'night');
    // distant hills + lights of the old town
    for (let x = 0; x < W; x++) { const h = 8 + Math.sin(x / 23) * 4 + Math.sin(x / 7) * 1.5; rect(b, x, 118 - h, 1, h, 'navy'); if (rnd() < 0.08) px(b, x, 118 - rnd() * h, 'amber'); }
    // sea
    rect(b, 0, 118, W, 62, 'navy');
    dither(b, 0, 118, W, 8, 'night', 'navy', 0.5);
    // lighthouse on its rock
    ellipse(b, 296, 124, 16, 5, 'ink'); rect(b, 292, 100, 7, 22, 'cream'); rect(b, 292, 106, 7, 3, 'red'); rect(b, 292, 114, 7, 3, 'red');
    rect(b, 291, 96, 9, 4, 'dgrey'); rect(b, 293, 93, 5, 3, 'ink');

    // hotel: facade, mansard, dome
    const X0 = 84, X1 = 236;
    rect(b, X0, 64, X1 - X0, 88, '#6e6f8e'); dither(b, X0, 64, X1 - X0, 88, '#6e6f8e', '#5a5b78', 0.35);
    rect(b, X0 - 2, 62, X1 - X0 + 4, 3, 'lgrey'); rect(b, X0, 150, X1 - X0, 2, 'dgrey');
    for (let x = X0; x < X1; x += 2) rect(b, x, 54 + (x % 4), 1, 8, 'night');
    rect(b, X0 + 2, 54, X1 - X0 - 4, 9, 'night'); rect(b, X0, 53, X1 - X0, 1, 'dgrey');
    for (let x = X0 + 10; x < X1 - 10; x += 16) { if (x > 108 && x < 206) continue; rect(b, x, 55, 6, 6, 'ink'); rect(b, x + 1, 56, 4, 4, rnd() < 0.5 ? 'amber' : 'blue'); }
    // pink dome (the Mirabeau's landmark)
    ellipse(b, 160, 53, 18, 13, 'pink');
    for (let y = 40; y < 53; y++) for (let x = 142; x < 179; x++) if ((((x - 160) / 18) ** 2 + ((y - 53) / 13) ** 2) <= 1 && x > 165) px(b, x, y, '#b86a7a');
    for (let x = 146; x <= 174; x += 7) line(b, 160, 41, x, 53, '#b86a7a');
    rect(b, 159, 34, 2, 7, 'gold'); px(b, 159, 33, 'gold'); rect(b, 140, 52, 40, 2, 'lgrey');
    // windows: 5 floors x 9 bays
    WIN.length = 0;
    for (let f = 0; f < 5; f++) for (let i = 0; i < 9; i++) {
      const x = X0 + 8 + i * 16, y = 70 + f * 16;
      rect(b, x - 1, y - 1, 10, 12, '#4a4b66');
      const lit = rnd() < 0.42;
      WIN.push([x, y, lit, f === 1 && i === 6]);
      rect(b, x, y, 8, 10, lit ? 'amber' : 'night');
      if (lit) { rect(b, x, y, 8, 2, 'gold'); rect(b, x + 3, y, 2, 10, 'brass'); }
      rect(b, x - 1, y + 10, 10, 1, 'lgrey');
      if (f === 0) { rect(b, x - 2, y + 11, 12, 1, 'dgrey'); for (let k = 0; k < 12; k += 2) px(b, x - 2 + k, y + 12, 'dgrey'); }
    }
    // entrance, awning
    rect(b, 146, 134, 28, 16, 'ink'); rect(b, 142, 130, 36, 4, 'wine2'); for (let x = 142; x < 178; x += 4) rect(b, x, 134, 2, 2, 'wine2');
    rect(b, 150, 138, 20, 12, 'amber'); rect(b, 159, 138, 2, 12, 'brass');
    // promenade
    rect(b, 0, 150, W, 6, 'dgrey'); rect(b, 0, 150, W, 1, 'lgrey');
    for (let x = 0; x < W; x += 6) rect(b, x, 152, 3, 1, 'grey');
    rect(b, 0, 156, W, 3, 'lgrey'); for (let x = 2; x < W; x += 8) rect(b, x, 156, 2, 2, 'grey');
    // palms
    for (const pxX of [20, 62, 262]) palm(b, pxX, 150);
    // street lamps
    for (const lx of [110, 210]) { rect(b, lx, 126, 1, 24, 'ink'); rect(b, lx - 2, 124, 5, 3, 'ink'); px(b, lx, 127, 'gold'); }
  }
  function palm(b, x, base) {
    for (let y = 0; y < 44; y++) px(b, x + Math.round(Math.sin(y / 14) * 3), base - y, y % 3 ? 'ink' : 'navy');
    const tx = x + Math.round(Math.sin(43 / 14) * 3), ty = base - 44;
    for (const [dx, dy] of [[-14, 6], [14, 6], [-10, -4], [10, -4], [-16, 12], [16, 12], [0, -8]]) {
      for (let i = 0; i <= 12; i++) { const t = i / 12; px(b, tx + dx * t, ty + dy * t - Math.sin(t * Math.PI) * 5, 'ink'); px(b, tx + dx * t, ty + dy * t - Math.sin(t * Math.PI) * 5 + 1, 'ink'); }
    }
  }

  function create(canvas) {
    const ctx = canvas.getContext('2d');
    const bg = document.createElement('canvas'); bg.width = W; bg.height = H; drawStatic(bg.getContext('2d'));
    const drops = rain(90, { x: 0, y: 0, w: W, h: H });
    const S = { t: 0, menu: false, sel: 0, flash: 0 };
    const NEON = 'HOTEL MIRABEAU';
    const MENU = ['NEW CASE', 'INTERROGATE', 'CAST'];

    function frame() {
      const t = ++S.t;
      ctx.drawImage(bg, 0, 0);
      // lighthouse beam across the sky
      const ph = (t / 70) % (Math.PI * 2), reach = -Math.cos(ph);
      if (reach > 0) for (let i = 4; i < 190 * reach; i++) {
        const y = 97 - i * (0.05 + 0.08 * Math.sin(ph) ** 2);
        if ((i + t) % 2 === 0) { px(ctx, 295 - i, y, i < 40 ? 'gold' : 'amber'); if (i < 90) px(ctx, 295 - i, y + 1, 'amber'); }
      }
      px(ctx, 295, 97, t % 30 < 15 ? 'white' : 'gold'); px(ctx, 296, 97, 'gold');
      // sea glints
      for (let i = 0; i < 40; i++) { const x = (i * 53 + (t >> 2)) % W, y = 126 + ((i * 17) % 22); if ((i + (t >> 3)) % 4 === 0) rect(ctx, x, y, 3, 1, 'blue'); }
      for (let y = 160; y < H; y += 3) for (let x = 144; x < 176; x += 2) if (((x + y + (t >> 2)) % 6) === 0) px(ctx, x, y, 'amber'); // entrance reflection
      // suite 304: the one window the police are in, flickering blue
      for (const [x, y, lit, is304] of WIN) if (is304) { rect(ctx, x, y, 8, 10, (t >> 4) % 2 ? 'ice' : 'blue'); rect(ctx, x + 3, y, 2, 10, 'ink'); }
      // police car + blue light on the facade
      const blue = (t >> 3) % 2 === 0;
      if (blue) dither(ctx, 186, 120, 50, 30, 'rgba(0,0,0,0)', '#5570a8', 0.12);
      rect(ctx, 188, 143, 30, 6, 'ink'); rect(ctx, 192, 139, 18, 5, 'ink'); rect(ctx, 194, 140, 6, 3, 'night'); rect(ctx, 202, 140, 6, 3, 'night');
      rect(ctx, 188, 145, 30, 1, 'lgrey'); px(ctx, 217, 145, 'amber'); px(ctx, 188, 145, 'red');
      ellipse(ctx, 193, 149, 2, 2, 'ink'); ellipse(ctx, 212, 149, 2, 2, 'ink');
      rect(ctx, 200, 137, 3, 2, blue ? 'ice' : 'blue');
      // neon sign on the roof, one letter dying
      const dead = t % 200 < 30 && (t >> 1) % 3 === 0;
      const nx = 160 - (NEON.length * 6) / 2;
      rect(ctx, nx - 3, 55, NEON.length * 6 + 5, 9, 'ink');
      NEON.split('').forEach((ch, i) => {
        const on = !(i === 10 && dead) && !(Math.random() < 0.002);
        
        text(ctx, ch, nx + i * 6, 56, on ? 'neon' : '#5e1627');
      });
      if (Math.random() < 0.003) S.flash = 5;
      if (S.flash > 0) { S.flash--; if (S.flash % 2) dither(ctx, 0, 0, W, 118, 'rgba(0,0,0,0)', '#9cc0e4', 0.25); }
      drawRain(ctx, drops, { x: 0, y: 0, w: W, h: H }, 'blue');

      // title
      text(ctx, 'DEATH AT THE', 160, 3, 'ice', { align: 'center', shadow: 'ink' });
      text(ctx, 'HOTEL MIRABEAU', 161, 13, 'ink', { align: 'center', scale: 2 });
      text(ctx, 'HOTEL MIRABEAU', 160, 12, 'gold', { align: 'center', scale: 2, shadow: 'rust' });
      text(ctx, 'NICE - 31.XII.1962', 160, 29, 'lgrey', { align: 'center' });

      if (!S.menu) { if (t % 60 < 38) { rect(ctx, 112, 164, 96, 11, 'ink'); text(ctx, 'PRESS START', 160, 166, 'cream', { align: 'center' }); } }
      else {
        PX.panel(ctx, 108, 134, 104, 42, { fill: 'navy' });
        MENU.forEach((m, i) => { text(ctx, (S.sel === i ? '> ' : '  ') + m, 116, 140 + i * 11, S.sel === i ? 'gold' : 'cream'); });
      }
    }
    return { frame, state: S, MENU };
  }
  window.TITLE = { create };
})();
