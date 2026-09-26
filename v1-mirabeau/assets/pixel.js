// Tiny pixel-art toolkit shared by every visual page. No images: everything is drawn in code.
// 320x180 internal resolution, integer-scaled, one fixed palette, 5x7 bitmap font.
(function () {
  const PAL = {
    ink: '#0b0a14', navy: '#161729', night: '#232845', blue: '#34406e', sky: '#5570a8', ice: '#9cc0e4',
    white: '#fffdf5', cream: '#f3ead2', paper: '#d8c9a3', tan: '#b08a55', khaki: '#8a6a3f',
    gold: '#ffd36b', amber: '#f0b54a', brass: '#c67a2f', rust: '#8a4221', brown: '#5a2d1c', dbrown: '#35190f',
    wine: '#5e1627', wine2: '#7a2236', red: '#c93a48', pink: '#e98a8a', neon: '#ff5d8f',
    green: '#2f5d4c', mint: '#79ad7c', lav: '#9a7fb8', grey: '#6b6a7a', lgrey: '#a7a5b3', dgrey: '#3b3a48',
    skin1: '#f5cfae', skin2: '#dfa47c', skin3: '#b0704f', skin4: '#6e3f2c', blond: '#f0d890', blond2: '#c9a860',
  };

  // ---------- screen ----------
  function screen(canvas, w = 320, h = 180, fitEl) {
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    canvas.style.imageRendering = 'pixelated';
    const fit = () => {
      const box = fitEl || canvas.parentElement;
      const maxW = box.clientWidth || innerWidth;
      const maxH = innerHeight * 0.78;
      const s = Math.max(1, Math.floor(Math.min(maxW / w, maxH / h)));
      canvas.style.width = w * s + 'px'; canvas.style.height = h * s + 'px';
      canvas._scale = s;
    };
    fit(); addEventListener('resize', fit);
    return ctx;
  }
  function mouse(canvas, e) {
    const r = canvas.getBoundingClientRect();
    return { x: Math.floor((e.clientX - r.left) * canvas.width / r.width), y: Math.floor((e.clientY - r.top) * canvas.height / r.height) };
  }

  // ---------- primitives ----------
  const c_ = (c) => PAL[c] || c;
  function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c_(c); ctx.fillRect(x | 0, y | 0, w | 0, h | 0); }
  function px(ctx, x, y, c) { ctx.fillStyle = c_(c); ctx.fillRect(x | 0, y | 0, 1, 1); }
  function line(ctx, x0, y0, x1, y1, c) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy; ctx.fillStyle = c_(c);
    for (;;) { ctx.fillRect(x0, y0, 1, 1); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  }
  function ellipse(ctx, cx, cy, rx, ry, c) {
    ctx.fillStyle = c_(c);
    for (let y = -ry; y <= ry; y++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry)))); ctx.fillRect(cx - w, cy + y, w * 2 + 1, 1); }
  }
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  // Ordered-dither mix of two colours. t in 0..1 = share of c2.
  function dither(ctx, x, y, w, h, c1, c2, t) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const X = x + i, Y = y + j;
      px(ctx, X, Y, (BAYER[Y & 3][X & 3] + 0.5) / 16 < t ? c2 : c1);
    }
  }
  // Vertical dithered gradient through a list of colours.
  function vgrad(ctx, x, y, w, h, cols) {
    for (let j = 0; j < h; j++) {
      const f = (j / Math.max(1, h - 1)) * (cols.length - 1), k = Math.min(cols.length - 2, Math.floor(f)), t = f - k;
      dither(ctx, x, y + j, w, 1, cols[k], cols[k + 1], t);
    }
  }
  // Sprite from an array of strings + a key -> colour map ('.' is transparent).
  function sprite(ctx, rows, key, x, y, flip = false) {
    for (let j = 0; j < rows.length; j++) {
      const r = rows[j];
      for (let i = 0; i < r.length; i++) {
        const ch = r[flip ? r.length - 1 - i : i];
        if (ch !== '.' && ch !== ' ' && key[ch]) px(ctx, x + i, y + j, key[ch]);
      }
    }
  }

  // ---------- 5x7 font ----------
  const G = {
    A: [14, 17, 17, 17, 31, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [28, 18, 17, 17, 17, 18, 28],
    E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
    I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
    M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
    Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
    U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
    Y: [17, 17, 17, 10, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
    0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31], 3: [31, 2, 4, 2, 1, 17, 14],
    4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14], 6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8],
    8: [14, 17, 17, 14, 17, 17, 14], 9: [14, 17, 17, 15, 1, 2, 12],
    '.': [0, 0, 0, 0, 0, 12, 12], ',': [0, 0, 0, 0, 12, 4, 8], '!': [4, 4, 4, 4, 4, 0, 4], '?': [14, 17, 1, 2, 4, 0, 4],
    ':': [0, 12, 12, 0, 12, 12, 0], "'": [12, 4, 8, 0, 0, 0, 0], '-': [0, 0, 0, 31, 0, 0, 0], '"': [10, 10, 10, 0, 0, 0, 0],
    '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8], '/': [0, 1, 2, 4, 8, 16, 0], '#': [10, 10, 31, 10, 31, 10, 10],
    '>': [8, 4, 2, 1, 2, 4, 8], '<': [2, 4, 8, 16, 8, 4, 2], '+': [0, 4, 4, 31, 4, 4, 0], '%': [24, 25, 2, 4, 8, 19, 3],
    '*': [0, 4, 21, 14, 21, 4, 0], '=': [0, 0, 31, 0, 31, 0, 0], '[': [14, 8, 8, 8, 8, 8, 14], ']': [14, 2, 2, 2, 2, 2, 14],
    '_': [0, 0, 0, 0, 0, 0, 31], '▼': [0, 0, 31, 14, 4, 0, 0], '♥': [0, 10, 31, 31, 14, 4, 0],
  };
  const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[—–]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').toUpperCase();
  function text(ctx, str, x, y, c = 'cream', o = {}) {
    const s = o.scale || 1, sh = o.shadow;
    const t = norm(str);
    if (o.align === 'center') x -= (measure(t) * s) / 2;
    if (sh) text(ctx, str, x + s, y + s, sh, { scale: s });
    ctx.fillStyle = c_(c);
    let cx = x;
    for (const ch of t) {
      const g = G[ch];
      if (g) for (let r = 0; r < 7; r++) for (let b = 0; b < 5; b++) if (g[r] & (16 >> b)) ctx.fillRect(cx + b * s, y + r * s, s, s);
      cx += 6 * s;
    }
    return cx;
  }
  const measure = (s) => norm(s).length * 6 - 1;
  function wrap(str, maxChars) {
    const words = str.split(/\s+/), out = []; let cur = '';
    for (const w of words) { if ((cur + ' ' + w).trim().length > maxChars) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
    if (cur) out.push(cur); return out;
  }

  // ---------- UI chrome ----------
  function panel(ctx, x, y, w, h, o = {}) {
    rect(ctx, x, y, w, h, o.edge || 'ink');
    rect(ctx, x + 1, y + 1, w - 2, h - 2, o.frame || 'brass');
    rect(ctx, x + 2, y + 2, w - 4, h - 4, o.edge || 'ink');
    rect(ctx, x + 3, y + 3, w - 6, h - 6, o.fill || 'navy');
    [[x + 1, y + 1], [x + w - 2, y + 1], [x + 1, y + h - 2], [x + w - 2, y + h - 2]].forEach(([a, b]) => px(ctx, a, b, 'gold'));
  }
  function nameTag(ctx, name, x, y, c = 'amber') {
    const w = measure(name) + 8;
    panel(ctx, x, y, w, 13, { fill: 'wine' });
    text(ctx, name, x + 4, y + 3, c);
  }
  // Typewriter helper: returns the visible part of `lines` after `n` characters.
  function typed(lines, n) { const out = []; for (const l of lines) { if (n <= 0) break; out.push(l.slice(0, n)); n -= l.length; } return out; }

  // CRT overlay (scanlines + vignette) drawn on a DOM element above the canvas.
  function crt(el, on = true) { el.classList.toggle('crt', on); }

  // Rain: persistent drops over a region.
  function rain(n, area) { return Array.from({ length: n }, () => ({ x: Math.random() * area.w + area.x, y: Math.random() * area.h + area.y, v: 3 + Math.random() * 3 })); }
  function drawRain(ctx, drops, area, c = 'ice') {
    for (const d of drops) {
      d.y += d.v; d.x -= d.v * 0.25;
      if (d.y > area.y + area.h) { d.y = area.y - 4; d.x = area.x + Math.random() * area.w; }
      if (d.x >= area.x && d.x < area.x + area.w) { px(ctx, d.x, d.y, c); px(ctx, d.x + 0.25, d.y + 1, c); }
    }
  }

  // Simple square-wave blips for text (WebAudio, created on first user gesture).
  let AC;
  function blip(freq = 440, dur = 0.03, vol = 0.03) {
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = 'square'; o.frequency.value = freq; g.gain.value = vol;
      o.connect(g); g.connect(AC.destination); o.start(); o.stop(AC.currentTime + dur);
    } catch (_) {}
  }

  window.PX = { PAL, screen, mouse, rect, px, line, ellipse, dither, vgrad, sprite, text, measure, wrap, panel, nameTag, typed, crt, rain, drawRain, blip, BAYER };
})();
