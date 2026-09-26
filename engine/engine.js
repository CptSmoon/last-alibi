// Scene engine: one stage at a time, drawn on a 1376x768 canvas scaled to the window.
// Owns: images, actors (sprites, walking, depth), the player, pathfinding on the stage's floor polygon,
// click / keyboard input, exits, clue spots, speech bubbles, fades and a small cutscene API.
// The story (beats, clues, talk) lives in game.js; the parchment UI in ui.js; conversations in dialogue.js.
(function () {
  const W = 1376, H = 768;
  const cv = document.getElementById('game'), ctx = cv.getContext('2d');
  cv.width = W; cv.height = H; ctx.imageSmoothingEnabled = false;

  // ---------- images ----------
  const cache = {};
  function img(path) {
    if (!cache[path]) { const i = new Image(); i.src = 'game-assets/' + path + (path.startsWith('bg/') || path.startsWith('portraits/') ? '.webp' : '.png'); cache[path] = i; }
    return cache[path];
  }
  const ready = (i) => i.complete && i.naturalWidth > 0;
  function preload(paths) { return Promise.all(paths.map((p) => new Promise((res) => { const i = img(p); if (ready(i)) res(); else { i.onload = res; i.onerror = res; } }))); }

  // ---------- geometry ----------
  function inPoly(x, y, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  const walkable = (x, y) => !!E.scene && (E.scene.walk || []).some((p) => inPoly(x, y, p));
  function nearestWalkable(x, y) {
    if (walkable(x, y)) return [x, y];
    for (let r = 6; r < 400; r += 6) for (let a = 0; a < 24; a++) {
      const px = x + Math.cos((a / 24) * Math.PI * 2) * r, py = y + Math.sin((a / 24) * Math.PI * 2) * r;
      if (walkable(px, py)) return [px, py];
    }
    return [x, y];
  }
  function lineOfWalk(x0, y0, x1, y1) {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 6);
    for (let i = 1; i <= n; i++) if (!walkable(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n)) return false;
    return true;
  }
  // A* on a 12 px grid over the floor, then string-pulled with line-of-walk.
  const G = 12;
  function findPath(x0, y0, x1, y1) {
    [x1, y1] = nearestWalkable(x1, y1);
    if (lineOfWalk(x0, y0, x1, y1)) return [[x1, y1]];
    const cols = Math.ceil(W / G), key = (c, r) => r * cols + c;
    const sc = Math.floor(x0 / G), sr = Math.floor(y0 / G), ec = Math.floor(x1 / G), er = Math.floor(y1 / G);
    const open = [[sc, sr]], came = new Map(), g = new Map([[key(sc, sr), 0]]), f = (c, r) => Math.hypot(c - ec, r - er);
    let found = false, guard = 0;
    while (open.length && guard++ < 20000) {
      open.sort((a, b) => (g.get(key(...a)) + f(...a)) - (g.get(key(...b)) + f(...b)));
      const [c, r] = open.shift();
      if (c === ec && r === er) { found = true; break; }
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nc = c + dc, nr = r + dr;
        if (!walkable(nc * G + G / 2, nr * G + G / 2) && !(nc === ec && nr === er)) continue;
        const ng = g.get(key(c, r)) + Math.hypot(dc, dr);
        if (ng < (g.get(key(nc, nr)) ?? Infinity)) { g.set(key(nc, nr), ng); came.set(key(nc, nr), [c, r]); if (!open.some(([a, b]) => a === nc && b === nr)) open.push([nc, nr]); }
      }
    }
    if (!found) return [[x1, y1]];
    const cells = []; let cur = [ec, er];
    while (cur && !(cur[0] === sc && cur[1] === sr)) { cells.push([cur[0] * G + G / 2, cur[1] * G + G / 2]); cur = came.get(key(...cur)); }
    cells.reverse(); cells[cells.length - 1] = [x1, y1];
    const out = []; let from = [x0, y0], i = 0;                     // string pulling
    while (i < cells.length) {
      let j = cells.length - 1;
      while (j > i && !lineOfWalk(from[0], from[1], cells[j][0], cells[j][1])) j--;
      out.push(cells[j]); from = cells[j]; i = j + 1;
    }
    return out;
  }

  // ---------- actors ----------
  class Actor {
    constructor(id, x, y, dir = 'front') { Object.assign(this, { id, x, y, dir, path: [], speed: 3.4, moving: false, t: 0, talking: false, then: null, visible: true }); }
    walkTo(x, y, then, speed) {
      this.path = findPath(this.x, this.y, x, y); this.then = then || null; if (speed) this.speed = speed;
      return new Promise((res) => { const t = this.then; this.then = () => { t && t(); res(); }; if (!this.path.length) { this.then(); this.then = null; } });
    }
    update() {
      this.t++;
      if (!this.path.length) { if (this.moving) { this.moving = false; if (this.then) { const t = this.then; this.then = null; t(); } } return; }
      const [tx, ty] = this.path[0], dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
      this.moving = true;
      this.dir = Math.abs(dx) > Math.abs(dy) * 0.8 ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'front' : 'back';
      if (d <= this.speed) { this.x = tx; this.y = ty; this.path.shift(); } else { this.x += (dx / d) * this.speed; this.y += (dy / d) * this.speed; }
    }
    // Seated people only turn their head side to side: they never flip to a front or back pose in their chair.
    face(o) {
      const dx = o.x - this.x, dy = o.y - this.y;
      if (this.seated && !this.moving) { this.dir = dx > 0 ? 'right' : 'left'; return; }
      this.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'front' : 'back';
    }
    stop() { this.path = []; this.moving = false; this.then = null; }
  }
  function scaleAt(y) { const d = E.scene.depth || [0, H, 1, 1]; const k = Math.max(0, Math.min(1, (y - d[0]) / (d[1] - d[0]))); return d[2] + (d[3] - d[2]) * k; }
  const SPRITE_H = 300;   // game-assets/sprites are normalised so a standing person is 300 px tall
  function spriteFor(a) {
    const s = (p) => img(`sprites/${a.id}-${p}`);
    if (a.moving) {
      const step = Math.floor(a.t / 9) % 2;
      if (a.dir === 'left' || a.dir === 'right') return { im: step ? s('walk') : s('right'), flip: a.dir === 'left', bob: step };
      return { im: s(a.dir === 'back' ? 'back' : 'front'), flip: step === 1, bob: step };
    }
    // Seated: a real sitting sprite (faces right, mirrored for left). A speaker only breathes, no pose swaps.
    if (a.seated) { const sit = s('sit'); if (ready(sit)) return { im: sit, flip: a.dir === 'left', bob: a.talking && Math.floor(a.t / 14) % 2 ? 1 : 0, sit: true }; }
    // Standing speaker: hold the gesture pose for the whole line instead of flickering between poses.
    if (a.talking) return { im: s('talk'), flip: a.dir === 'left', bob: Math.floor(a.t / 14) % 2 };
    return { im: s(a.dir), flip: false, bob: 0 };
  }
  function drawActor(a) {
    const { im, flip, bob, sit } = spriteFor(a);
    if (!ready(im)) return null;
    // Every sprite shares one pixel scale (standing = 300 px), so a seated sprite keeps the same head size.
    const h = ((E.scene.base * scaleAt(a.y)) / SPRITE_H) * im.naturalHeight, w = (im.naturalWidth * h) / im.naturalHeight;
    const x = a.x - w / 2, y = a.y - h - (bob ? (sit ? 1 : 2) : 0);
    if (!a.seated || a.moving) { ctx.save(); ctx.globalAlpha = 0.22; ctx.fillStyle = '#1a0f08'; ctx.beginPath(); ctx.ellipse(a.x, a.y - 2, w * 0.36, h * 0.05, 0, 0, 7); ctx.fill(); ctx.restore(); }
    ctx.save();
    if (flip) { ctx.translate(a.x * 2, 0); ctx.scale(-1, 1); }
    ctx.imageSmoothingEnabled = true;
    if (a.seated && !a.moving && !sit) {                // no sitting sprite yet: fall back to the top 70 %, lowered onto the chair
      const k = 0.7, sy = y + h * (1 - k) * 0.55;
      ctx.drawImage(im, 0, 0, im.naturalWidth, im.naturalHeight * k, x, sy, w, h * k);
      ctx.restore(); a.box = [x, sy, w, h * k]; return a.box;
    }
    ctx.drawImage(im, x, y, w, h);
    ctx.restore();
    a.box = [x, y, w, h];
    return a.box;
  }

  // ---------- text helpers ----------
  const FONT = '"Nunito", "Trebuchet MS", system-ui, sans-serif';
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  // A name tag. Text starting with "E  " is an action prompt: the E is drawn as a real keycap, so it reads
  // as "press E", not as part of the name.
  function label(text, cx, y, o = {}) {
    const key = /^E {2}/.test(text); if (key) text = text.slice(3);
    ctx.font = `700 ${o.size || 17}px ${FONT}`;
    const h = (o.size || 17) + 12, kw = key ? h - 6 : 0, w = ctx.measureText(text).width + 22 + (key ? kw + 8 : 0), x = cx - w / 2;
    ctx.fillStyle = 'rgba(40,24,12,.35)'; roundRect(x, y + 2, w, h, h / 2); ctx.fill();
    ctx.fillStyle = o.bg || '#f5ead0'; roundRect(x, y, w, h, h / 2); ctx.fill();
    ctx.strokeStyle = o.edge || '#b4893d'; ctx.lineWidth = 2; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (key) {
      const kx = x + 5, ky = y + 3, pulse = (Math.sin(E.t / 10) + 1) / 2;
      ctx.fillStyle = '#8a6224'; roundRect(kx, ky + 2, kw, kw, 5); ctx.fill();                 // key side
      ctx.fillStyle = '#fffdf6'; roundRect(kx, ky - pulse * 1.5, kw, kw, 5); ctx.fill();         // key top, gently pressing
      ctx.strokeStyle = '#8a6224'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#3a2414'; ctx.font = `900 ${(o.size || 17) - 2}px ${FONT}`; ctx.fillText('E', kx + kw / 2, ky + kw / 2 + 1 - pulse * 1.5);
      ctx.font = `700 ${o.size || 17}px ${FONT}`;
    }
    ctx.fillStyle = o.color || '#3a2414'; ctx.fillText(text, cx + (key ? (kw + 8) / 2 : 0), y + h / 2 + 1);
    return [x, y, w, h];
  }
  function wrapText(text, max) {
    const words = text.split(/\s+/), lines = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > max && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur); return lines;
  }
  // The nearest other person within talking range of the player (what E acts on), or null.
  // What E acts on: the nearest person, or a clue spot not searched yet. People win unless a spot is clearly
  // closer, so E never re-opens an old clue when you're standing next to someone (QA, 26 Sept).
  const REACH = 175;
  function target() {
    const p = E.player; if (!p || E.lock) return null;
    let best = null, bd = REACH;
    for (const a of E.actors.values()) { if (a === p || !a.visible) continue; const d = Math.hypot(a.x - p.x, a.y - p.y); if (d < bd) { bd = d; best = { kind: 'actor', a }; } }
    for (const sp of E.hooks.spots ? E.hooks.spots() : []) {
      if (sp.done || !sp.clues) continue;
      const d = Math.hypot(sp.stand[0] - p.x, sp.stand[1] - p.y) + 40; if (d < bd) { bd = d; best = { kind: 'spot', s: sp }; }
    }
    return best;
  }
  function nearestActor() { const t = target(); return t && t.kind === 'actor' ? t.a : null; }
  function bubble(b, placed) {
    const a = E.actors.get(b.who); if (!a || !a.box) return;
    const name = a === E.player ? null : E.hooks.nameOf(b.who);
    ctx.font = `600 19px ${FONT}`;
    const lines = wrapText(b.text, 300), lh = 25, head = name ? 20 : 0;
    ctx.font = `800 14px ${FONT}`; const nw = name ? ctx.measureText(name.toUpperCase()).width : 0; ctx.font = `600 19px ${FONT}`;
    const w = Math.max(nw, ...lines.map((l) => ctx.measureText(l).width)) + 34, h = lines.length * lh + 20 + head;
    let x = Math.max(8, Math.min(W - w - 8, a.x - w / 2)), y = a.box[1] - h - 34;
    if (y < 70) y = a.box[1] + a.box[3] - 10;
    for (const r of placed) if (x < r[0] + r[2] && x + w > r[0] && y < r[1] + r[3] && y + h > r[1]) y = r[1] - h - 8;
    placed.push([x, y, w, h]);
    const k = Math.min(1, b.t / 12);
    ctx.save(); ctx.globalAlpha = Math.min(1, b.left / 15) * k;
    ctx.fillStyle = 'rgba(40,24,12,.3)'; roundRect(x, y + 3, w, h, 14); ctx.fill();
    ctx.fillStyle = b.alert ? '#fff4e0' : '#fffdf6'; roundRect(x, y, w, h, 14); ctx.fill();
    ctx.strokeStyle = b.alert ? '#c0392b' : '#3a2414'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(a.x - 10, y + h - 1); ctx.lineTo(a.x + 10, y + h - 1); ctx.lineTo(a.x, y + h + 14); ctx.closePath(); ctx.fillStyle = b.alert ? '#fff4e0' : '#fffdf6'; ctx.fill();
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    if (name) { ctx.font = `800 14px ${FONT}`; ctx.fillStyle = b.alert ? '#b8322a' : '#8a6224'; ctx.fillText(name.toUpperCase(), x + 17, y + 10); ctx.font = `600 19px ${FONT}`; }
    ctx.fillStyle = '#2a1a10';
    lines.forEach((l, i) => ctx.fillText(l, x + 17, y + 11 + head + i * lh));
    ctx.restore();
  }

  // ---------- the engine ----------
  const E = {
    W, H, canvas: cv, ctx, img, preload, scene: null, sceneId: null, actors: new Map(), player: null, bubbles: [], t: 0,
    fade: 0, fadeTarget: 0, shake: 0, hover: null, lock: false, onArrive: null, beat: null,
    WALK: 6.4, HURRY: 9.5, // the player's speed, px per frame (was 3.4 / 5.2: QA found walking too slow). Shift hurries.
    hooks: { spots: () => [], taken: () => false, people: () => [], clickActor() {}, clickSpot() {}, exitLocked() {}, entered() {} },

    async load(id, spawn) {
      const s = SCENES[id]; E.scene = s; E.sceneId = id; E.clearBubbles(); E.hover = null; E.inExit = null; E.namesUntil = E.t + 200;
      const keep = E.player; E.actors = new Map();
      await preload(['bg/' + s.bg, ...(s.props || []).map((p) => p.img), ...(s.spots || []).filter((sp) => sp.patch).map((sp) => sp.patch.img)]);
      if (!s.cinematic && keep) { if (spawn) { keep.x = spawn[0]; keep.y = spawn[1]; keep.dir = spawn[2] || keep.dir; } keep.stop(); E.actors.set('sorel', keep); }
      const placed = (BEATS[E.beat] || {})[id] || {};
      for (const [who, [x, y, dir, pose]] of Object.entries(placed)) { const a = new Actor(who, x, y, dir); a.seated = pose === 'sit'; E.actors.set(who, a); }
      // People moved by the story in this beat override BEATS: someone left in another room isn't here,
      // someone left in this room is, and whoever follows the inspector arrives right behind him.
      for (const [who, r] of Object.entries(E.moved)) {
        if (r.beat !== E.beat || who === E.follower) continue;
        if (r.room !== id) E.actors.delete(who);
        else { const a = new Actor(who, r.x, r.y, r.dir); E.actors.set(who, a); }
      }
      if (E.follower && !s.cinematic && keep) {
        const back = { left: 1, right: -1 }[keep.dir] || 0, [fx, fy] = nearestWalkable(keep.x + back * 90, keep.y + (back ? 0 : keep.dir === 'back' ? 60 : -40));
        const f = new Actor(E.follower, fx, fy, keep.dir); E.actors.set(E.follower, f);
      }
      await preload([...E.actors.values()].flatMap((a) => ['front', 'back', 'left', 'right', 'walk', 'talk', ...(a.seated ? ['sit'] : [])].map((p) => `sprites/${a.id}-${p}`)));
      window.AUDIO && AUDIO.scene(id);
      E.hooks.entered(id);
    },
    // ---- followers: one person at a time can walk with the inspector, from room to room ----
    moved: {},                                   // who -> { beat, room, x, y, dir }: where the story left them
    follower: null,
    follow(who) {
      if (E.follower && E.follower !== who) E.unfollow(E.follower);
      E.follower = who; delete E.moved[who];
      const a = E.actors.get(who); if (a) { a.seated = false; a.stop(); }
    },
    unfollow(who) {
      if (!E.follower || (who && who !== E.follower)) return;
      const a = E.actors.get(E.follower);
      if (a) { a.stop(); E.moved[E.follower] = { beat: E.beat, room: E.sceneId, x: a.x, y: a.y, dir: a.dir }; }
      E.follower = null;
    },
    resetMoves() { E.follower = null; E.moved = {}; },
    addActor(id, x, y, dir) { const a = new Actor(id, x, y, dir); E.actors.set(id, a); preload(['front', 'back', 'left', 'right', 'walk', 'talk'].map((p) => `sprites/${id}-${p}`)); return a; },
    // Remove bubbles (all, or one person's) and settle them: their say() promises resolve and the
    // speakers stop their talking pose. Never clear E.bubbles directly.
    clearBubbles(who) {
      E.bubbles = E.bubbles.filter((b) => {
        if (who && b.who !== who) return true;
        const a = E.actors.get(b.who); if (a) a.talking = false; b.done && b.done(); return false;
      });
    },
    say(who, text, ms = 3200, o = {}) {
      E.clearBubbles(who);
      const b = { who, text, left: Math.round(ms / 16.7), t: 0, alert: o.alert }; E.bubbles.push(b);
      const a = E.actors.get(who); if (a) a.talking = true;
      return new Promise((res) => (b.done = res));
    },
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    fadeOut: (ms = 450) => E.fadeTo(1, ms),
    fadeIn: (ms = 450) => E.fadeTo(0, ms),
    fadeTo(v, ms) { return new Promise((r) => { if (E.fade === v) { E.fadeTarget = v; return r(); } E.fadeTarget = v; E.fadeSpeed = 1 / (ms / 16.7); E.fadeDone = r; }); },
    async goto(id, spawn) { E.lock = true; window.AUDIO && AUDIO.sfx('door'); await E.fadeOut(); await E.load(id, spawn); await E.fadeIn(); E.lock = false; },
    findPath, walkable, nearestWalkable, scaleAt, label, Actor, target,
  };

  // ---------- input ----------
  const keys = {};
  function toCanvas(ev) { const r = cv.getBoundingClientRect(); return [((ev.clientX - r.left) * W) / r.width, ((ev.clientY - r.top) * H) / r.height]; }
  function hitTest(x, y) {
    // Generous: the whole sprite plus a margin, so a person is hard to miss (QA, 26 Sept).
    for (const a of [...E.actors.values()].sort((p, q) => q.y - p.y)) if (a !== E.player && a.box && x >= a.box[0] - 18 && x <= a.box[0] + a.box[2] + 18 && y >= a.box[1] - 14 && y <= a.box[1] + a.box[3] + 22) return { kind: 'actor', a };
    for (const s of E.hooks.spots()) if (Math.hypot(x - s.at[0], y - s.at[1]) < s.r) return { kind: 'spot', s };
    for (const e of E.scene.exits || []) if (E.hooks.exitOpen(e) && x >= e.rect[0] && x <= e.rect[0] + e.rect[2] && y >= e.rect[1] - 40 && y <= e.rect[1] + e.rect[3] + 40) return { kind: 'exit', e };
    // the pool of light and chevrons in front of an exit count too (they sit just outside the exit's zone)
    for (const e of E.scene.exits || []) if (E.hooks.exitOpen(e) && !/^No\. \d$/.test(e.label || '') || (E.hooks.exitOpen(e) && e.rect[1] >= 300)) { const [ax, ay] = exitAnchor(e); if (Math.hypot(x - ax, (y - ay) * 1.6) < 70) return { kind: 'exit', e }; }
    return null;
  }
  cv.addEventListener('mousemove', (ev) => { if (!E.scene || E.scene.cinematic) return; const [x, y] = toCanvas(ev); E.hover = hitTest(x, y); cv.style.cursor = E.hover ? 'pointer' : 'default'; });
  cv.addEventListener('click', (ev) => {
    if (E.lock || !E.player || E.scene.cinematic || E.hooks.busy()) return;
    const [x, y] = toCanvas(ev), h = hitTest(x, y), p = E.player;
    const sp = ev.shiftKey ? E.HURRY : E.WALK;
    if (h && h.kind === 'actor') {
      // Instant feedback: a ring under them and a click, then talk at once if they're within reach.
      const a = h.a; E.ping = { x: a.x, y: a.y, t: 24 }; window.AUDIO && AUDIO.sfx('click');
      if (E.hooks.quick && E.hooks.quick(a)) { p.stop(); p.face(a); E.hooks.clickActor(a); return; }   // e.g. a good-morning from across the room
      if (Math.hypot(a.x - p.x, a.y - p.y) < REACH) { p.stop(); p.face(a); E.hooks.clickActor(a); return; }
      const side = p.x < a.x ? -1 : 1, [tx, ty] = nearestWalkable(a.x + side * 80, a.y + 6);
      p.walkTo(tx, ty, () => { p.face(a); E.hooks.clickActor(a); }, sp); return;
    }
    if (h && h.kind === 'spot') { const s = h.s; p.walkTo(s.stand[0], s.stand[1], () => { E.hooks.clickSpot(s); }, sp); return; }
    // an exit: walk to it and leave on arrival (door exits sit in a wall you can't walk into, so don't rely on stepping into the zone)
    if (h && h.kind === 'exit') { const e = h.e, [ax, ay] = nearestWalkable(...exitAnchor(e)); p.walkTo(ax, ay, () => { if (E.sceneId !== undefined && !E.lock) { if (e.locked) E.hooks.exitLocked(e); else if (e.to) { p.stop(); E.goto(e.to, e.spawn); } } }, sp); return; }
    E.ripple = { x, y, t: 20 }; p.walkTo(x, y, null, sp);
  });
  addEventListener('keydown', (e) => { if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return; keys[e.code] = true; });
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  function keyboardMove() {
    const p = E.player; if (!p || E.lock || E.hooks.busy()) return;
    let dx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), dy = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
    if (!dx && !dy) return false;
    p.path = []; p.then = null;
    const n = Math.hypot(dx, dy), sp = keys.ShiftLeft || keys.ShiftRight ? E.HURRY : E.WALK;
    const nx = p.x + (dx / n) * sp, ny = p.y + (dy / n) * sp;
    if (walkable(nx, ny)) { p.x = nx; p.y = ny; } else if (walkable(nx, p.y)) p.x = nx; else if (walkable(p.x, ny)) p.y = ny;
    p.dir = Math.abs(dx) >= Math.abs(dy) && dx ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'front' : 'back';
    p.moving = true; p.t++;
    return true;
  }
  E.keys = keys;

  // ---------- frame ----------
  function checkExits() {
    const p = E.player; if (!p || E.lock) return;
    for (const e of E.scene.exits || []) {
      if (!E.hooks.exitOpen(e)) continue;
      const [x, y, w, h] = e.rect, inside = p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h;
      if (!inside) { if (E.inExit === e.id) E.inExit = null; continue; }
      if (E.inExit === e.id) continue; E.inExit = e.id;
      if (e.locked) { E.hooks.exitLocked(e); p.stop(); const [nx, ny] = nearestWalkable(p.x + (x < 100 ? 60 : x > W - 200 ? -60 : 0), p.y + (y < 450 ? 40 : -40)); p.walkTo(nx, ny); return; }
      p.stop(); E.goto(e.to, e.spawn);
      return;
    }
  }
  // One light over the whole stage (plate + people), so generated sprites sit in the room instead of on it:
  // a soft lamp-coloured wash and a vignette. Outside scenes get a cold wash. Scenes can override with `light`.
  const LIGHT = { interior: { wash: 'rgba(255,170,90,0.06)', edge: 0.34 }, outside: { wash: 'rgba(150,185,230,0.07)', edge: 0.22 } };
  let vignette = null;
  function drawLight(s) {
    const L = s.light || (E.sceneId === 'outside' ? LIGHT.outside : LIGHT.interior);
    if (!vignette) { vignette = document.createElement('canvas'); vignette.width = W; vignette.height = H; }
    if (vignette.key !== L.edge) {
      const g = vignette.getContext('2d'), r = g.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, W * 0.62);
      g.clearRect(0, 0, W, H); r.addColorStop(0, 'rgba(18,10,4,0)'); r.addColorStop(1, `rgba(18,10,4,${L.edge})`); g.fillStyle = r; g.fillRect(0, 0, W, H); vignette.key = L.edge;
    }
    ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = L.wash; ctx.fillRect(0, 0, W, H); ctx.restore();
    ctx.drawImage(vignette, 0, 0);
  }
  // Ways out are marked in the world, not with signs: a soft pool of light on the floor at every exit, with
  // chevrons drifting the way you'd walk. Its name fades in only when you're close or pointing at it.
  // Compartment doors in the corridor instead carry their number engraved on the door's own brass plate.
  function exitSide(e) {
    const [x, y, w, h] = e.rect;
    return x < 60 ? 'left' : x + w > W - 60 ? 'right' : y + h > H - 70 ? 'down' : 'up';
  }
  function exitAnchor(e) {                                   // a point on the floor at the exit, and the way out
    const [x, y, w, h] = e.rect, side = exitSide(e);
    if (side === 'left') return [x + w + 20, y + h * 0.62, -1, 0];
    if (side === 'right') return [x - 20, y + h * 0.62, 1, 0];
    if (side === 'down') return [x + w / 2, y - 12, 0, 1];
    return [x + w / 2, y + h + 8, 0, -1];
  }
  function drawExits() {
    const cold = E.sceneId === 'outside', p = E.player, pulse = (Math.sin(E.t / 22) + 1) / 2, placed = [];
    for (const e of E.scene.exits || []) {
      if (!E.hooks.exitOpen(e)) continue;
      const [x, y, w, h] = e.rect, hov = E.hover && E.hover.kind === 'exit' && E.hover.e === e;
      const num = /^No\. (\d)$/.exec(e.label || '');
      if (num && y < 300) {                                   // a compartment door: engrave the number on its plate
        const cx = x + w / 2, cy = y + 57;
        ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `600 italic 17px Georgia, "Times New Roman", serif`;
        ctx.fillStyle = 'rgba(255,236,190,.55)'; ctx.fillText(num[1], cx, cy + 1.5);        // highlight under the cut
        ctx.fillStyle = hov ? '#2a1606' : '#4a2c12'; ctx.fillText(num[1], cx, cy);
        if (hov) { ctx.globalAlpha = 0.35 + pulse * 0.25; ctx.strokeStyle = '#ffe3a0'; ctx.lineWidth = 2; roundRect(cx - 27, cy - 9, 54, 18, 3); ctx.stroke(); }
        ctx.restore(); continue;
      }
      const [ax, ay, dx, dy] = exitAnchor(e), locked = !!e.locked;
      // the pool of light
      const rx = dy ? 62 : 46, ry = dy ? 18 : 30, g = ctx.createRadialGradient(ax, ay, 2, ax, ay, rx);
      const col = locked ? '200,190,175' : cold ? '215,235,255' : '255,214,140', a0 = locked ? 0.12 : (hov ? 0.42 : 0.24) + pulse * 0.1;
      g.addColorStop(0, `rgba(${col},${a0})`); g.addColorStop(1, `rgba(${col},0)`);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(ax, ay); ctx.scale(1, ry / rx); ctx.translate(-ax, -ay);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ax, ay, rx, 0, 7); ctx.fill(); ctx.restore();
      // chevrons drifting outwards (none on a locked way)
      if (!locked) {
        const ph = (E.t / 40) % 1, sq = dy ? 0.55 : 1;
        ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.shadowColor = cold ? 'rgba(90,130,190,.6)' : 'rgba(120,70,10,.55)'; ctx.shadowBlur = 5;
        for (let k = 0; k < 3; k++) {
          const t = (k / 3 + ph) % 1, d = -14 + t * 34, fade = Math.sin(t * Math.PI);
          const cx = ax + dx * d, cy = ay + dy * d * sq, s = 7;
          ctx.globalAlpha = fade * (hov ? 0.95 : 0.7); ctx.strokeStyle = cold ? '#f4fbff' : '#fff1cf';
          ctx.beginPath();
          if (dx) { ctx.moveTo(cx - dx * s, cy - s); ctx.lineTo(cx, cy); ctx.lineTo(cx - dx * s, cy + s); }
          else { ctx.moveTo(cx - s * 1.3, cy - dy * s * sq); ctx.lineTo(cx, cy); ctx.lineTo(cx + s * 1.3, cy - dy * s * sq); }
          ctx.stroke();
        }
        ctx.restore();
      }
      // the name, only when it matters
      const near = p ? Math.hypot(p.x - ax, p.y - ay) : 1e9, show = hov || near < 240 || E.t < (E.namesUntil || 0);
      e.labelA = Math.max(0, Math.min(1, (e.labelA || 0) + (show ? 0.08 : -0.06)));
      if (e.labelA > 0.02) {
        const text = (locked ? '🔒 ' : '') + (num ? 'Compartment ' + num[1] : e.label);
        ctx.save(); ctx.font = `800 16px ${FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        const tw = ctx.measureText(text).width;
        let tx = dx < 0 ? ax - 16 : dx > 0 ? ax + 16 - tw : ax - tw / 2, ty = dy ? ay - (dy < 0 ? 30 : 28) : ay - 34;
        tx = Math.max(10, Math.min(W - tw - 10, tx));
        for (let k = 0; k < 4; k++) { const hit = placed.find((r) => tx < r[0] + r[2] + 8 && tx + tw + 8 > r[0] && Math.abs(ty - r[1]) < 22); if (!hit) break; ty = hit[1] - 24; }
        placed.push([tx, ty, tw]);
        ctx.globalAlpha = e.labelA; ctx.shadowColor = 'rgba(16,8,2,.9)'; ctx.shadowBlur = 7; ctx.shadowOffsetY = 1;
        ctx.fillStyle = locked ? '#d8ccb8' : cold ? '#ffffff' : '#fff3da'; ctx.fillText(text, tx, ty);
        ctx.restore();
      }
    }
  }
  // The follower keeps a step behind the inspector: re-pathing a few times a second, stopping when close.
  function followTick() {
    const p = E.player, f = E.follower && E.actors.get(E.follower);
    if (!p || !f || E.lock) return;
    const d = Math.hypot(f.x - p.x, f.y - p.y);
    if (d < 95) { if (f.moving && f.path.length) f.stop(); if (!f.moving && E.t % 30 === 0) f.face(p); return; }
    if (E.t % 12 && f.path.length) return;
    const back = p.moving ? { left: 1, right: -1 }[p.dir] || 0 : Math.sign(f.x - p.x) || 1;
    const [tx, ty] = nearestWalkable(p.x + back * 80, p.y + (p.dir === 'back' ? 50 : p.dir === 'front' ? -50 : 0));
    f.walkTo(tx, ty, () => f.face(p), Math.max(4.5, E.WALK * 0.92));
  }
  function drawSpotMarkers() {
    for (const s of E.hooks.spots()) {
      if (s.prop) { const im = img('items/' + s.prop); if (ready(im)) { const w = s.w || 48, h = (im.naturalHeight * w) / im.naturalWidth; ctx.drawImage(im, s.at[0] - w / 2, s.at[1] - h / 2, w, h); } }
      if (!s.clues || s.done) continue;
      const k = (Math.sin((E.t + s.at[0]) / 14) + 1) / 2, r = 7 + k * 5, x = s.at[0] + (s.prop ? 18 : 0), y = s.at[1] - (s.prop ? 16 : 0);
      ctx.save(); ctx.globalAlpha = 0.55 + k * 0.45; ctx.fillStyle = '#ffe28a'; ctx.strokeStyle = '#fff6d0';
      ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, rr = i % 2 ? r * 0.35 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  function frame() {
    E.t++;
    const s = E.scene;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#120b07'; ctx.fillRect(0, 0, W, H);
    if (!s) return;
    if (E.shake > 0) { E.shake--; ctx.setTransform(1, 0, 0, 1, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 8); }
    const bg = img('bg/' + s.bg);
    if (ready(bg)) {
      if (s.cinematic) { const z = 1 + Math.min(E.t, 600) * 0.00018; ctx.drawImage(bg, (W - W * z) / 2, (H - H * z) / 2, W * z, H * z); }
      else ctx.drawImage(bg, 0, 0, W, H);
      // "taken" patches: a clue object painted into the plate is painted out once the player has taken it
      for (const sp of s.spots || []) if (sp.patch && E.hooks.taken(sp)) { const im = img(sp.patch.img); if (ready(im)) ctx.drawImage(im, sp.patch.x, sp.patch.y); }
    }
    if (!s.cinematic) {
      followTick();
      // Whoever is speaking, or in conversation with the inspector, looks at him (and he looks back).
      if (E.player) {
        const inTalk = E.hooks.inTalk ? E.hooks.inTalk() : null, nt = target(), nearTalker = nt && nt.kind === 'actor' && !E.player.moving ? nt.a : null;   // the one you're about to talk to turns to you
        for (const a of E.actors.values()) {
          if (a === E.player || a.moving || !(a.talking || a.id === inTalk || a === nearTalker)) continue;
          a.face(E.player);
          if (a.id === inTalk && !E.player.moving) E.player.face(a);
        }
      }
      if (!keyboardMove()) for (const a of E.actors.values()) a.update(); else for (const a of E.actors.values()) if (a !== E.player) a.update();
      for (const pr of s.props || []) { const im = img(pr.img); if (ready(im)) { const h = (im.naturalHeight * pr.w) / im.naturalWidth; ctx.save(); if (pr.flip) { ctx.translate(pr.x * 2 + pr.w, 0); ctx.scale(-1, 1); } ctx.drawImage(im, pr.x, pr.y, pr.w, h); ctx.restore(); } }
      drawSpotMarkers();
      if (E.ripple && E.ripple.t-- > 0) { ctx.save(); ctx.globalAlpha = E.ripple.t / 20; ctx.strokeStyle = '#fff6d0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(E.ripple.x, E.ripple.y, 26 - E.ripple.t, (26 - E.ripple.t) * 0.4, 0, 0, 7); ctx.stroke(); ctx.restore(); }
      const list = [...E.actors.values()].filter((a) => a.visible).sort((a, b) => a.y - b.y);
      for (const a of list) drawActor(a);
      drawLight(s);
      drawExits();
      // Name labels only where they help: the person under the cursor, and the one E would talk to.
      // Speakers carry their name inside the bubble, so a crowded room stays readable.
      const near = nearestActor(), talking = new Set(E.bubbles.map((b) => b.who));
      for (const a of list) {
        if (!a.box || a === E.player || talking.has(a.id)) continue;
        const hov = E.hover && E.hover.kind === 'actor' && E.hover.a === a;
        if (!hov && a !== near && !E.showNames && !keys.AltLeft && !keys.AltRight && E.t > (E.namesUntil || 0)) continue;
        const name = E.hooks.nameOf(a.id);
        if (name) label(a === near ? `E  ${E.hooks.verb ? E.hooks.verb(a) : 'Talk to'} ${name}` : name, a.x, a.box[1] - 26, hov || a === near ? { bg: '#fff3c4', edge: '#e0a72e', size: a === near ? 16 : 15 } : { size: 15 });
      }
      const tg = target(); if (tg && tg.kind === 'spot' && !(E.hover && E.hover.kind === 'spot' && E.hover.s === tg.s)) label('E  Examine: ' + tg.s.label, tg.s.at[0], tg.s.at[1] - tg.s.r - 34, { bg: '#fff3c4', edge: '#e0a72e', size: 15 });
      if (E.ping && E.ping.t-- > 0) { const k = E.ping.t / 24; ctx.save(); ctx.globalAlpha = k; ctx.strokeStyle = '#ffe28a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(E.ping.x, E.ping.y, 70 - k * 36, (70 - k * 36) * 0.35, 0, 0, 7); ctx.stroke(); ctx.restore(); }
      if (E.hover && E.hover.kind === 'spot') label(E.hover.s.label, E.hover.s.at[0], E.hover.s.at[1] - E.hover.s.r - 34, { bg: '#fff3c4', edge: '#e0a72e' });
      // Signed exits highlight themselves on hover; compartment-door badges get a full name tag.
      if (E.hover && E.hover.kind === 'exit' && /^No\. \d$/.test(E.hover.e.label) && E.hover.e.rect[1] < 300) { const e = E.hover.e; label('Compartment ' + e.label.slice(4), e.rect[0] + e.rect[2] / 2, e.rect[1] - 14, { bg: '#fff3c4', edge: '#e0a72e', size: 15 }); }
      checkExits();
    }
    E.bubbles = E.bubbles.filter((b) => { b.t++; if (--b.left <= 0) { const a = E.actors.get(b.who); if (a) a.talking = false; b.done && b.done(); return false; } return true; });
    const placed = []; for (const b of E.bubbles) bubble(b, placed);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (E.fade !== E.fadeTarget) { E.fade += Math.sign(E.fadeTarget - E.fade) * (E.fadeSpeed || 0.06); if (Math.abs(E.fade - E.fadeTarget) < 0.05) { E.fade = E.fadeTarget; E.fadeDone && E.fadeDone(); E.fadeDone = null; } }
    if (E.fade > 0) { ctx.fillStyle = `rgba(18,11,7,${E.fade})`; ctx.fillRect(0, 0, W, H); }
    E.hooks.frame && E.hooks.frame();
  }
  let last = performance.now(), acc = 0;
  (function loop(now) { acc += Math.min(100, now - last); last = now; while (acc >= 1000 / 60) { frame(); acc -= 1000 / 60; } requestAnimationFrame(loop); })(performance.now());

  window.ENGINE = E;
})();
