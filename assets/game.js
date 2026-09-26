// Last Stop, Simplon-Orient: the game. Title -> menu -> a 5-second avalanche -> breakfast (tutorial)
// -> Théo runs in: a death in No. 7 -> the investigation (walk, examine, collect, talk, show) ->
// the accusation -> the newspaper. 320x180, integer-scaled, everything drawn in code except the
// title key art (generated with Gemini, tools/gen-image.mjs).
(function () {
  const log = (window.LOG || { scope: () => console }).scope('game');
  const { rect, px, text, wrap, panel, nameTag, vgrad, blip, measure } = PX;
  const VW = 320, VH = 180, OY = 4, T = WORLD.T;
  const toMin = (s) => { const [h, m] = s.split(':').map(Number); return (h < 12 ? h + 24 : h) * 60 + m; };
  const fmt = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  const byId = Object.fromEntries(CASE.characters.map((c) => [c.id, c]));
  const EV = Object.fromEntries(CASE.evidence.map((e) => [e.id, e]));
  const CHAP = Object.fromEntries(CASE.chapters.map((c) => [c.id, c]));
  const shortName = (id) => (id === 'lazar' ? 'Lazăr' : byId[id].name.split(' ').slice(-1)[0]);

  const CASES = [
    { title: 'Last Stop, Simplon-Orient', year: '1931', place: 'A night train, snowbound in the Alps', ready: true },
    { title: 'Death at the Hôtel Mirabeau', year: '1962', place: 'A storm on the Riviera', ready: false },
    { title: 'The Keeper of Ker-Avel', year: '1974', place: 'A lighthouse cut off by the sea', ready: false },
  ];
  const MORNING_LINES = {
    ferrand: 'Good morning, Inspector. You slept through the avalanche? I envy you.',
    hale: 'Snowed in, what? Castelli says the relief train comes at ten. Dreadful coffee.',
    irina: 'Inspector. Forgive me, I did not sleep. The mountains are too quiet.',
    mila: "Bonjour, chéri. Is it true you're police? ...Just asking.",
    brandt: "Ten o'clock. Three hours lost. My company will be delighted.",
    castelli: 'Buongiorno, Ispettore! The line is blocked at km 142. We dig at ten.',
    theo: 'Pardon, Monsieur, I must wake No. 7 for breakfast.',
  };
  const FLAVOUR = {
    f_menu: { ch: ['morning'], label: 'Breakfast menu', text: 'Café, chocolat, croissants. Oeufs à la coque. "With the compliments of the Compagnie, for the delay."' },
    f_obs: { ch: ['morning', 'ch3'], label: 'The big window', text: 'The valley is white and silent. Far below, the roofs of Iselle.' },
    f_avalanche: { ch: ['ch3'], label: 'The avalanche', text: 'A wall of snow as high as the engine, full of snapped pines. Nothing gets past until the relief crew digs through.' },
    f_piano: { ch: ['morning', 'ch3'], label: 'The piano', text: 'An upright piano, lid down. Someone has left a cigarette burn on middle C.' },
    f_samovar: { ch: ['morning', 'ch3'], label: "Conductor's samovar", text: "The conductor's samovar, still warm, and a tin of Russian tea. A pencil on a string for the call log." },
  };
  const HINTS = {
    morning: [
      { s: 'WASD OR ARROWS: WALK', done: () => G.moved > 30 },
      { s: 'WALK UP TO SOMEONE   E: TALK', done: () => G.saidHello },
    ],
    ch3: [
      { s: 'SPARKLES MARK CLUES   E: EXAMINE', done: () => G.found.size > 0 },
      { s: 'I: INVENTORY   J: NOTEBOOK', done: () => G.openedBag },
      { s: 'QUESTION EVERYONE. IN A TALK, TAB: SHOW WHAT YOU HAVE', done: () => G.showedSomething },
      { s: 'THE OUTSIDE DOORS ARE OPEN NOW. CHECK THE SNOW.', done: () => G.wentOutside },
      { s: 'READY? ASK CASTELLI TO GATHER EVERYONE', done: () => false, when: () => G.clock >= toMin('09:00') || G.found.size >= 8 },
    ],
  };

  // ---------------- state ----------------
  const G = {
    mode: 'title', frame: 0, menuSel: 0, ch: CHAP.morning, clock: 0, acc: 0, shake: 0,
    player: { x: 0, y: 0, dir: 'down', dist: 0, moving: false }, moved: 0,
    npcs: {}, per: {}, items: [], notes: [], found: new Set(), fired: new Set(),
    bubbles: [], toasts: [], read: null, target: null, fade: null, hits: [], carName: null, lastCar: null,
    settings: { voice: true, sound: true, crt: true, brain: 'scripted' }, server: { brain: false, voice: false },
    keys: {}, inv: null, book: null, acc_: null, result: null, runner: null, cut: 0,
  };
  const resetPer = () => { for (const c of CASE.characters) G.per[c.id] = { mood: 'calm', trust: 2, shown: new Set(), revealed: new Set(), done: false, history: {}, lines: [] }; };
  resetPer();
  let savedSettings = null;
  try { savedSettings = JSON.parse(localStorage.getItem('simplon-settings') || 'null'); if (savedSettings) Object.assign(G.settings, savedSettings); } catch (_) {}
  const saveSettings = () => { try { localStorage.setItem('simplon-settings', JSON.stringify(G.settings)); } catch (_) {} };
  const known = (id) => G.items.includes(id) || G.notes.includes(id);

  const cv = document.getElementById('screen'), ctx = PX.screen(cv, VW, VH, document.body);
  function fit() { const s = Math.max(1, Math.floor(Math.min(innerWidth / VW, (innerHeight - 8) / VH))); cv.style.width = VW * s + 'px'; cv.style.height = VH * s + 'px'; }
  fit(); addEventListener('resize', fit);
  const wrapEl = document.getElementById('wrap');
  const base = document.createElement('canvas'); base.width = WORLD.W; base.height = WORLD.H; WORLD.renderBase(base.getContext('2d'));
  const snowPat = makeSnow();
  const flakes = Array.from({ length: 70 }, () => ({ x: Math.random() * VW, y: Math.random() * VH, v: 0.3 + Math.random() * 0.5 }));
  const titleArt = new Image(); titleArt.src = 'assets/art/title-keyart.jpg';

  const talk = TALK.create(G, {
    clue: (id) => learn(id),
    confession: () => { toast('HE CONFESSED.', null, '#c93a48'); G.confessed = true; save(); },
    toast: (s) => toast(s),
    gather: () => setTimeout(gather, 1800),
  });

  // ---------------- flow ----------------
  function newGame() {
    log.info('new game');
    try { localStorage.removeItem('simplon-save'); } catch (_) {}
    G.items = []; G.notes = []; G.found = new Set(); G.confessed = false; resetPer();
    G.moved = 0; G.saidHello = false; G.openedBag = false; G.showedSomething = false; G.wentOutside = false;
    G.mode = 'prologue'; G.cut = 0; G.scrollP = 0;
  }
  function startChapter(id) {
    G.ch = CHAP[id]; G.clock = toMin(G.ch.start); G.acc = 0; G.fired = new Set(); G.bubbles = []; G.read = null; G.runner = null;
    G.chStart = performance.now();
    const sp = WORLD.waypoints[G.ch.playerStart];
    if (!sp) log.error('chapter has no valid player start', { chapter: id, playerStart: G.ch.playerStart }); G.player.x = sp.x; G.player.y = sp.y; G.player.dir = sp.dir;
    G.npcs = {};
    for (const c of CASE.characters) {
      if (!c.chapters.includes(id)) continue;
      const sched = (CASE.schedules[id] || {})[c.id]; if (!sched || !sched.length) continue;
      const w = currentWp(sched), p = WORLD.waypoints[w] || sp;
      if (!WORLD.waypoints[w]) log.warn('unknown waypoint in schedule, using player start', { chapter: id, who: c.id, waypoint: w });
      G.npcs[c.id] = { id: c.id, x: p.x, y: p.y, dir: p.dir, wp: w, path: [], dist: 0, moving: false, look: Object.assign({ id: c.id, seed: c.id.length * 31 }, c.look) };
    }
    G.lastCar = WORLD.carAt(...WORLD.tileOf(G.player.x, G.player.y - 3));
    G.mode = id === 'ch4' ? 'gather' : 'play';
    G.carName = { s: G.ch.title.replace(/^[IVX]+ · /, '').toUpperCase(), sub: G.ch.subtitle, t: 220 };
    log.info('chapter start', { chapter: id, clock: fmt(G.clock), mode: G.mode, npcs: Object.keys(G.npcs), items: G.items.length, notes: G.notes.length });
    save();
  }
  function fadeTo(lines, then) { G.fade = { t: 0, lines, then }; }
  const currentWp = (sched) => { let w = sched[0][1]; for (const [t, id] of sched) if (toMin(t) <= G.clock) w = id; return w; };
  const locked = () => { const s = new Set(['pantry']); if (G.ch.compartmentsLocked) for (let k = 1; k <= 7; k++) s.add('c' + k); return s; };

  // ---------------- knowledge ----------------
  function learn(id, quiet) {
    const e = EV[id]; if (!e || known(id)) return false;
    if (e.take) G.items.push(id); else G.notes.push(id);
    log.info(e.take ? 'item taken' : 'note learned', { id, key: !!e.key, clock: fmt(G.clock), total: G.items.length + G.notes.length });
    if (!quiet) toast((e.take ? '+ ' : 'NOTED: ') + e.name.replace(/^[^:]+: /, ''), id);
    if (G.ch.clock === 'actions' && !quiet) advance(G.ch.minutesPerClue || 0);
    save(); return true;
  }
  function toast(s, icon, col) { G.toasts.push({ s: s.toUpperCase().slice(0, 34), icon, col: col || (icon && EV[icon]?.take ? '#79ad7c' : '#9cc0e4'), t: 220 }); if (G.settings.sound) blip(icon ? 880 : 660, 0.07, 0.025); }
  function advance(min) {
    G.clock += min;
    if (min) log.debug('clock', { plus: min, now: fmt(G.clock) });
    if (G.ch.id === 'ch3' && G.clock >= toMin(G.ch.end) && !G.fade) fadeTo(['10:00. THE RELIEF TRAIN WHISTLES.', 'CASTELLI GATHERS EVERYONE.'], () => startChapter('ch4'));
  }

  // ---------------- people ----------------
  function updateNpcs() {
    const sch = CASE.schedules[G.ch.id] || {};
    for (const n of Object.values(G.npcs)) {
      if (talk.state.open && talk.state.who === n.id) { n.moving = false; faceTo(n, G.player); continue; }
      if (G.runner && G.runner.id === n.id) { runner(n); continue; }
      const w = currentWp(sch[n.id]);
      if (w !== n.wp) { log.debug('npc moves', { who: n.id, from: n.wp, to: w, clock: fmt(G.clock) }); n.wp = w; const p = WORLD.waypoints[w]; if (p) n.path = WORLD.path(WORLD.walkTile(n.x, n.y - 2), WORLD.walkTile(p.x, p.y - 2)) || []; }
      step(n, WORLD.waypoints[n.wp], 0.8);
    }
  }
  function step(n, goal, sp) {
    let tx, ty;
    if (n.path.length) { const [ax, ay] = n.path[0]; tx = ax * T + 4; ty = ay * T + 6; } else if (goal) { tx = goal.x; ty = goal.y; } else return;
    const dx = tx - n.x, dy = ty - n.y, d = Math.hypot(dx, dy);
    if (d > 0.6) { const k = Math.min(sp, d); n.x += (dx / d) * k; n.y += (dy / d) * k; n.dist += k; n.moving = true; n.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'); }
    else if (n.path.length) n.path.shift();
    else { n.moving = false; if (goal && goal.dir) n.dir = goal.dir; }
  }
  const faceTo = (n, p) => { const dx = p.x - n.x, dy = p.y - n.y; n.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'); };
  const roomOf = (x, y) => { const [tx, ty] = WORLD.tileOf(x, y - 3); return WORLD.roomAt(tx, ty); };
  const playerRoom = () => roomOf(G.player.x, G.player.y);
  const hidden = (n) => { const r = roomOf(n.x, n.y); return !!(r && r.private && r !== playerRoom()); };

  // The call to action: Théo runs into the dining car.
  function startRunner() {
    const n = G.npcs.theo, e = WORLD.waypoints.d_entry;
    n.x = e.x; n.y = e.y; n.path = []; G.runner = { id: 'theo', phase: 'run', t: 0 };
    bubble('theo', 'INSPECTOR! INSPECTOR!', 200);
    if (G.settings.sound) for (let i = 0; i < 6; i++) setTimeout(() => blip(520 + i * 40, 0.05, 0.03), i * 90);
  }
  function runner(n) {
    const R = G.runner; R.t++;
    const d = Math.hypot(G.player.x - n.x, G.player.y - n.y);
    if (R.phase === 'run') {
      if (R.t % 20 === 1) n.path = WORLD.path(WORLD.walkTile(n.x, n.y - 2), WORLD.walkTile(G.player.x, G.player.y - 2)) || [];
      step(n, { x: G.player.x - 12, y: G.player.y }, 2.1);
      if (d < 24 || R.t > 480) {
        R.phase = 'tell'; R.t = 0; n.moving = false; faceTo(n, G.player); faceTo(G.player, n);
        bubble('theo', "No. 7! The envoy won't wake and his door is bolted. Castelli is breaking it open. Come, please!", 400);
        bubble('irina', 'Mein Gott...', 220); bubble('ferrand', "I'm a doctor. I'll come.", 240);
      }
    } else if (R.phase === 'tell' && R.t > 240) {
      R.phase = 'done';
      fadeTo(['YOU RUN AFTER THÉO TO THE SLEEPING CAR.', '', 'CASTELLI FORCES THE BOLT OF NO. 7.', 'ANTON LAZĂR IS DEAD IN HIS BERTH.'], () => startChapter('ch3'));
    }
  }
  function bubble(who, s, t = 260) { G.bubbles = G.bubbles.filter((b) => b.who !== who); G.bubbles.push({ who, s, t }); }

  function movePlayer() {
    const k = G.keys; let dx = 0, dy = 0;
    if (k.ArrowLeft || k.KeyA) dx -= 1; if (k.ArrowRight || k.KeyD) dx += 1;
    if (k.ArrowUp || k.KeyW) dy -= 1; if (k.ArrowDown || k.KeyS) dy += 1;
    const p = G.player; p.moving = !!(dx || dy);
    if (!p.moving) return;
    const sp = k.ShiftLeft || k.ShiftRight ? 1.9 : 1.25, n = Math.hypot(dx, dy);
    const st = { locked: locked(), outside: !!G.ch.outsideDoors };
    const free = (x, y) => { for (const [ox, oy] of [[-3, -2], [2, -2], [-3, 0], [2, 0]]) { const [tx, ty] = WORLD.tileOf(x + ox, y + oy); if (WORLD.solidForPlayer(tx, ty, st)) return false; } return true; };
    const ox = p.x, oy = p.y, nx = p.x + (dx / n) * sp, ny = p.y + (dy / n) * sp;
    if (free(nx, p.y)) p.x = nx; if (free(p.x, ny)) p.y = ny;
    const moved = Math.hypot(p.x - ox, p.y - oy); p.dist += moved; G.moved += moved;
    p.dir = Math.abs(dx) >= Math.abs(dy) && dx ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    const car = WORLD.carAt(...WORLD.tileOf(p.x, p.y - 3));
    if (car !== G.lastCar) { log.debug('player enters', { car }); G.carName = { s: { sleeper: 'SLEEPING CAR', dining: 'DINING CAR', lounge: 'LOUNGE CAR', outside: 'OUTSIDE, IN THE SNOW' }[car], t: 110 }; G.lastCar = car; if (car === 'outside') G.wentOutside = true; }
  }

  function updateEvents() {
    if (G.carName && G.carName.sub && G.carName.t > 40) return;   // let the chapter title breathe first
    for (const e of CASE.events) {
      const key = e.chapter + e.t + e.who;
      if (e.chapter !== G.ch.id || G.fired.has(key) || toMin(e.t) > G.clock) continue;
      G.fired.add(key); log.debug('event', { chapter: e.chapter, t: e.t, who: e.who, present: !!G.npcs[e.who] }); if (G.npcs[e.who]) bubble(e.who, e.say);
    }
  }

  // ---------------- interaction ----------------
  function hotspotGroups() {
    const groups = {};
    for (const e of CASE.evidence) {
      if (!e.spot || !e.chapters?.includes(G.ch.id) || G.found.has(e.id)) continue;
      const h = WORLD.hotspots[e.spot]; if (!h) continue;
      (groups[h.x + ',' + h.y] ||= { kind: 'clue', x: h.x, y: h.y, ids: [], label: 'EXAMINE' }).ids.push(e.id);
    }
    const out = Object.values(groups);
    for (const [id, f] of Object.entries(FLAVOUR)) if (f.ch.includes(G.ch.id)) { const h = WORLD.hotspots[id]; out.push({ kind: 'flavour', id, x: h.x, y: h.y, label: f.label.toUpperCase() }); }
    return out;
  }
  function findTarget() {
    const p = G.player, cands = [];
    for (const n of Object.values(G.npcs)) if (!hidden(n) && !(G.runner && G.runner.id === n.id)) cands.push({ kind: 'npc', id: n.id, x: n.x, y: n.y, d: Math.hypot(n.x - p.x, n.y - p.y), label: 'TALK TO ' + shortName(n.id).toUpperCase() });
    for (let k = 1; k <= 7; k++) {
      const w = WORLD.waypoints['c' + k + '_door'], d = Math.hypot(w.x - p.x, w.y - p.y);
      if (d < 14 && locked().has('c' + k) && playerRoom()?.id !== 'c' + k) cands.push({ kind: 'text', x: w.x, y: w.y - 6, d: d + 4, label: 'NO. ' + k, text: k === 1 ? 'Your compartment. The conductor locked it while you were at breakfast.' : `Compartment ${k}. Locked.` });
    }
    for (const g of hotspotGroups()) {
      const r = roomOf(g.x, g.y + 3); if (r && r.private && r !== playerRoom()) continue;
      cands.push({ ...g, d: Math.hypot(g.x - p.x, g.y - p.y) + 1 });
    }
    cands.sort((a, b) => a.d - b.d);
    G.target = cands.find((c) => c.d < (c.kind === 'npc' ? 18 : 14)) || null;
  }
  function interact() {
    const t = G.target; if (!t) return;
    if (t.kind === 'npc') {
      if (G.ch.id === 'morning') { bubble(t.id, MORNING_LINES[t.id] || 'Bonjour.', 240); faceTo(G.npcs[t.id], G.player); G.saidHello = true; return; }
      return openTalk(t.id);
    }
    if (t.kind === 'text') return (G.read = { title: t.label, pages: pages(t.text), page: 0 });
    log.debug('interact', { kind: t.kind, id: t.id || t.ids });
    if (t.kind === 'clue') {
      t.ids.forEach((id) => G.found.add(id));
      const P = []; const owner = [];
      for (const id of t.ids) for (const pg of pages(EV[id].description)) { P.push(pg); owner.push(id); }
      G.read = { title: EV[t.ids[0]].name, pages: P, owner, page: 0, learn: t.ids };
      if (G.settings.sound) blip(660, 0.05, 0.03);
      return;
    }
    if (t.kind === 'flavour') { const f = FLAVOUR[t.id]; G.read = { title: f.label, pages: pages(f.text), page: 0 }; }
  }
  function pages(s) { const ls = wrap(s, 42), out = []; for (let i = 0; i < ls.length; i += 4) out.push(ls.slice(i, i + 4)); if (out.length > 1 && out[out.length - 1].length === 1) { out[out.length - 2].push(...out.pop()); } return out.length ? out : [[]]; }
  function closeRead() {
    const R = G.read; if (!R) return;
    if (R.page < R.pages.length - 1) { R.page++; return; }
    G.read = null; if (R.learn) R.learn.forEach((id) => learn(id));
  }
  function openTalk(id) { if (byId[id].isVictim) return; G.mode = 'talk'; talk.open(id); G.keys = {}; }
  function closeTalk() {
    if (!talk.state.open) return;
    const asked = talk.close(); G.mode = 'play';
    if (G.ch.clock === 'actions' && asked) advance(G.ch.minutesPerInterview || 10);
    save();
  }
  function gather() { log.info('gather: everyone to the dining car', { clock: fmt(G.clock), items: G.items.length, notes: G.notes.length }); closeTalk(); fadeTo(['CASTELLI GATHERS EVERYONE', 'IN THE DINING CAR.'], () => startChapter('ch4')); }

  // ---------------- accusation ----------------
  function openAccuse() { log.info('accusation opened'); G.acc_ = { step: 0, sel: 0, suspect: null, motive: null, picks: new Set() }; G.mode = 'accuse'; }
  function grade() {
    const r = CASE.accusation.requires, A = G.acc_;
    const keys = [...A.picks].filter((e) => r.evidenceAnyThreeOf.includes(e));
    const verdict = A.suspect === r.suspect && A.motive === r.motive && keys.length >= 3 ? 'solved' : A.suspect === r.suspect ? 'weak' : 'wrong';
    const all = [...new Set(r.evidenceAnyThreeOf)];
    G.result = { verdict, suspect: A.suspect, found: all.filter(known), missed: all.filter((e) => !known(e)) };
    log.info('accusation graded', { verdict, suspect: A.suspect, motive: A.motive, evidence: [...A.picks], keyEvidence: keys.length, confessed: !!G.confessed });
    G.mode = 'end'; try { localStorage.removeItem('simplon-save'); } catch (_) {}
  }

  // ---------------- save ----------------
  function save() {
    if (!['play', 'talk', 'gather'].includes(G.mode)) return;
    try {
      localStorage.setItem('simplon-save', JSON.stringify({ ch: G.ch.id, clock: G.clock, items: G.items, notes: G.notes, found: [...G.found], confessed: G.confessed,
        per: Object.fromEntries(Object.entries(G.per).map(([k, v]) => [k, { ...v, shown: [...v.shown], revealed: [...v.revealed] }])) }));
      log.debug('saved', { chapter: G.ch.id, clock: fmt(G.clock) });
    } catch (e) { log.warn('save failed', { error: String(e.message || e) }); }
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem('simplon-save') || 'null'); if (!s) return false;
      G.items = s.items; G.notes = s.notes; G.found = new Set(s.found); G.confessed = s.confessed;
      for (const [k, v] of Object.entries(s.per)) G.per[k] = { ...v, shown: new Set(v.shown), revealed: new Set(v.revealed) };
      G.saidHello = true; G.moved = 99; G.openedBag = G.showedSomething = G.wentOutside = true;
      startChapter(s.ch); G.clock = Math.max(G.clock, s.clock);
      log.info('save loaded', { chapter: s.ch, clock: fmt(G.clock), items: G.items.length, notes: G.notes.length });
      return true;
    } catch (e) { log.warn('save could not be loaded', { error: String(e.message || e) }); return false; }
  }
  const hasSave = () => { try { return !!localStorage.getItem('simplon-save'); } catch (_) { return false; } };

  // ---------------- drawing: world ----------------
  function makeSnow() {
    const c = document.createElement('canvas'); c.width = 256; c.height = WORLD.H; const g = c.getContext('2d');
    rect(g, 0, 0, 256, WORLD.H, '#e8eef4');
    for (let i = 0; i < 90; i++) px(g, (i * 97) % 256, 16 + (i * 53) % 24, '#b8c8dc'), px(g, (i * 61) % 256, 136 + (i * 29) % 40, '#b8c8dc');
    for (const [x, y] of [[20, 10], [70, 16], [140, 8], [200, 18], [240, 12], [40, 150], [110, 160], [180, 146], [230, 164]]) { for (let k = 0; k < 6; k++) rect(g, x - k, y + k * 2, k * 2 + 1, 2, '#2f5d4c'); rect(g, x, y + 12, 1, 3, '#35190f'); }
    rect(g, 0, 32, 256, 8, '#fffdf5'); rect(g, 0, 136, 256, 4, '#fffdf5');
    rect(g, 0, 152, 256, 1, '#6b6a7a'); rect(g, 0, 158, 256, 1, '#6b6a7a'); for (let x = 0; x < 256; x += 8) rect(g, x, 150, 3, 11, 'rgba(90,60,40,.3)');
    return c;
  }
  function drawOutside(camX) {
    const off = Math.floor(camX % 256); for (let x = -off; x < VW; x += 256) ctx.drawImage(snowPat, x, OY);
    const ax = -camX;
    if (ax > -120) { ctx.fillStyle = '#fffdf5'; ctx.beginPath(); ctx.moveTo(ax - 10, OY); ctx.lineTo(ax + 100, OY); ctx.lineTo(ax + 92, OY + 60); ctx.lineTo(ax + 110, OY + 120); ctx.lineTo(ax + 96, OY + 176); ctx.lineTo(ax - 10, OY + 176); ctx.fill(); for (let i = 0; i < 8; i++) rect(ctx, ax + 20 + i * 9, OY + 30 + (i * 37) % 110, 12, 2, '#35190f'); }
    const x0 = (WORLD.compWest(7) + 3) * T, x1 = 137.5 * T;                // the footprints
    for (let x = x0, i = 0; x < x1; x += 5, i++) { const sx = x - camX, sy = OY + 30 + (i % 2 ? 4 : 0) + Math.round(Math.sin(i / 5)); if (sx > -4 && sx < VW) { rect(ctx, sx, sy, 3, 2, '#9cc0e4'); px(ctx, sx + 1, sy, '#d8e4f0'); } }
    rect(ctx, x0 - camX - 3, OY + 33, 8, 5, '#9cc0e4');
  }
  function drawRoofs(camX) {
    const pr = playerRoom();
    for (const r of WORLD.rooms) {
      if (!r.private || r === pr) continue;
      const x = r.x0 * T - camX, y = r.y0 * T + OY, w = (r.x1 - r.x0 + 1) * T, h = (r.y1 - r.y0 + 1) * T;
      if (x > VW || x + w < 0) continue;
      const kit = r.id === 'kitchen';
      rect(ctx, x, y, w, h, kit ? '#4b4a5a' : '#4a2e1e'); for (let yy = y + 3; yy < y + h; yy += 5) rect(ctx, x, yy, w, 1, kit ? '#3b3a48' : '#3a2418'); rect(ctx, x, y, w, 1, '#c67a2f');
      if (r.id.startsWith('c')) { const k = r.id.slice(1); rect(ctx, x + w / 2 - 6, y + h / 2 - 5, 12, 10, '#161729'); text(ctx, k, x + w / 2 - 2, y + h / 2 - 3, '#f0b54a'); }
    }
    for (const d of WORLD.doors) {
      if (!locked().has(d.room)) continue;
      for (const [tx, ty] of d.tiles) { rect(ctx, tx * T - camX, ty * T + OY, T, T, '#8a4221'); rect(ctx, tx * T - camX, ty * T + OY + 3, T, 1, '#ffd36b'); }
    }
  }
  function drawPeople(camX) {
    const list = Object.values(G.npcs).filter((n) => !hidden(n)).map((n) => ({ n, y: n.y })).concat([{ p: true, y: G.player.y }]);
    list.sort((a, b) => a.y - b.y);
    for (const it of list) {
      const o = it.p ? G.player : it.n, look = it.p ? CASE.player.look : it.n.look;
      PEOPLE.drawPerson(ctx, look, o.x - camX, o.y + OY, { dir: o.dir, step: o.moving ? ((o.dist / 5) | 0) % 4 : -1, t: G.frame });
    }
  }
  function drawBubbles(camX) {
    G.bubbles = G.bubbles.filter((b) => --b.t > 0);
    const placed = [];
    for (const b of G.bubbles) {
      const n = G.npcs[b.who]; if (!n || hidden(n)) continue;
      const ls = wrap(b.s, 28), w = Math.max(...ls.map((l) => measure(l))) + 8, h = ls.length * 9 + 5;
      const sx = Math.round(n.x - camX), sy = Math.round(n.y + OY);
      if (sx < -40 || sx > VW + 40) continue;
      let x = Math.max(2, Math.min(VW - w - 2, sx - Math.round(w / 2))), y = sy - 22 - h, below = false;
      if (y < 14) { y = sy + 3; below = true; }
      for (const r of placed) if (x < r.x + r.w && x + w > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y) y = below ? r.y + r.h + 3 : r.y - h - 3;
      placed.push({ x, y, w, h });
      rect(ctx, x, y, w, h, '#fffdf5'); rect(ctx, x, y + h, w, 1, '#0b0a14'); rect(ctx, sx - 1, below ? y - 2 : y + h, 3, 2, '#fffdf5');
      ls.forEach((l, i) => text(ctx, l, x + 4, y + 3 + i * 9, '#0b0a14'));
    }
  }
  function drawSparkles(camX) {
    for (const g of hotspotGroups()) {
      if (g.kind !== 'clue') continue;
      const r = roomOf(g.x, g.y + 3); if (r && r.private && r !== playerRoom()) continue;
      const sx = g.x - camX, sy = g.y + OY - 6, on = (G.frame + g.x) % 60 < 30;
      if (sx < -4 || sx > VW + 4) continue;
      px(ctx, sx, sy, on ? '#ffd36b' : '#c67a2f'); if (on) { px(ctx, sx - 1, sy, '#c67a2f'); px(ctx, sx + 1, sy, '#c67a2f'); px(ctx, sx, sy - 1, '#c67a2f'); px(ctx, sx, sy + 1, '#c67a2f'); }
    }
  }
  function drawWorld() {
    let camX = Math.round(Math.max(0, Math.min(WORLD.W - VW, G.player.x - VW / 2)));
    if (G.shake > 0) { G.shake--; camX += Math.round((Math.random() - 0.5) * 6); }
    rect(ctx, 0, 0, VW, VH, '#0b0a14');
    drawOutside(camX);
    ctx.drawImage(base, camX, 0, VW, WORLD.H, 0, OY, VW, WORLD.H);
    if (G.ch.id !== 'morning') PEOPLE.drawBody(ctx, byId.lazar.look, (WORLD.compWest(7) + 1) * T + 1 - camX, 6 * T + 3 + OY);
    drawSparkles(camX); drawPeople(camX); drawRoofs(camX); drawBubbles(camX);
    if (G.target && G.mode === 'play' && !G.read && G.frame % 40 < 28) text(ctx, '▼', G.target.x - camX - 2, G.target.y + OY - (G.target.kind === 'npc' ? 28 : 16), '#f0b54a');
  }

  // ---------------- drawing: HUD & overlays ----------------
  function drawHud() {
    rect(ctx, 0, 0, VW, 11, 'rgba(11,10,20,.8)');
    const r = playerRoom(); const where = (r ? r.name : { sleeper: 'Sleeping car', dining: 'Dining car', lounge: 'Lounge car', outside: 'Outside' }[WORLD.carAt(...WORLD.tileOf(G.player.x, G.player.y - 3))] || '').replace(/^.* · /, '').toUpperCase();
    text(ctx, where.slice(0, 24), 3, 2, '#a7a5b3');
    const clock = fmt(G.clock) + (G.ch.id === 'ch3' ? '  RELIEF AT 10:00' : '');
    text(ctx, clock, VW - 3 - measure(clock), 2, G.ch.id === 'ch3' && G.clock >= toMin('09:30') ? '#c93a48' : '#f3ead2');
    if (G.carName && G.carName.t-- > 0) {
      ctx.globalAlpha = Math.min(1, G.carName.t / 30);
      rect(ctx, 0, 24, VW, G.carName.sub ? 36 : 24, 'rgba(11,10,20,.6)');
      text(ctx, G.carName.s, 160, 30, '#f0b54a', { align: 'center', scale: 2, shadow: '#0b0a14' });
      if (G.carName.sub) text(ctx, G.carName.sub.toUpperCase().slice(0, 52), 160, 48, '#f3ead2', { align: 'center', shadow: '#0b0a14' });
      ctx.globalAlpha = 1;
    }
    const [tx] = WORLD.tileOf(G.player.x, G.player.y);
    const edge = [[89, 93, '>> DINING CAR', 'r'], [95, 99, '<< SLEEPING CAR', 'l'], [136, 140, '>> LOUNGE CAR', 'r'], [142, 146, '<< DINING CAR', 'l']].find(([a, b]) => tx >= a && tx <= b);
    if (edge && G.mode === 'play' && G.player.y > 5 * T && G.player.y < 17 * T) { const s = edge[2]; text(ctx, s, edge[3] === 'r' ? VW - 4 - measure(s) : 4, 86, '#f0b54a', { shadow: '#0b0a14' }); }
    const hs = (HINTS[G.ch.id] || []).find((h) => !h.done() && (!h.when || h.when()));
    if (hs && G.mode === 'play' && !G.read && !(G.carName && G.carName.t > 0)) { const w = measure(hs.s) + 10, y = G.target ? VH - 32 : VH - 16; rect(ctx, (VW - w) / 2, y, w, 12, 'rgba(94,22,39,.9)'); rect(ctx, (VW - w) / 2, y + 11, w, 1, '#c67a2f'); text(ctx, hs.s, (VW - w) / 2 + 5, y + 3, '#f3ead2'); }
    if (G.target && G.mode === 'play' && !G.read) { const s = G.target.label, w = measure(s) + 18, x = (VW - w) / 2; panel(ctx, x, VH - 17, w, 15, { fill: 'navy' }); text(ctx, 'E', x + 5, VH - 13, '#f0b54a'); text(ctx, s, x + 13, VH - 13, '#f3ead2'); }
    drawToasts();
  }
  function drawToasts() {
    G.toasts = G.toasts.filter((t) => --t.t > 0).slice(-3);
    G.toasts.forEach((t, i) => {
      const w = measure(t.s) + (t.icon ? 26 : 10), x = VW - w - 4, y = 14 + i * 20;
      ctx.globalAlpha = Math.min(1, t.t / 20);
      rect(ctx, x, y, w, 18, 'rgba(11,10,20,.88)'); rect(ctx, x, y, 2, 18, t.col);
      if (t.icon) ICONS.draw(ctx, t.icon, x + 5, y + 1);
      text(ctx, t.s, x + (t.icon ? 22 : 6), y + 6, t.col);
      ctx.globalAlpha = 1;
    });
  }
  function drawRead() {
    const R = G.read; if (!R) return;
    const x = 6, y = 124, w = 308, h = 52, icon = R.owner ? R.owner[R.page] : null;
    panel(ctx, x, y, w, h, { fill: 'navy' });
    if (icon) { rect(ctx, x + 5, y + 5, 36, 34, '#161729'); ICONS.draw(ctx, icon, x + 7, y + 6, 2); }
    nameTag(ctx, (icon ? EV[icon].name : R.title).toUpperCase().slice(0, 40), x + 2, y - 11, 'amber');
    (R.pages[R.page] || []).forEach((l, i) => text(ctx, l, x + (icon ? 48 : 8), y + 5 + i * 9, '#f3ead2'));
    const lastOfItem = icon && (R.page === R.pages.length - 1 || R.owner[R.page + 1] !== icon);
    const more = R.page < R.pages.length - 1 && !lastOfItem ? 'E: MORE' : icon ? (EV[icon].take ? 'E: TAKE IT' : 'E: NOTE IT') : 'E: OK';
    if (G.frame % 50 < 36) text(ctx, more, x + w - 6 - measure(more), y + h - 9, '#f0b54a');
  }
  function hit(x, y, w, h, fn) { G.hits.push({ x, y, w, h, fn }); }

  // Inventory (I) and notebook (J). In a conversation they are for showing things.
  function drawInv() {
    const B = G.inv, list = G.items, x = 36, y = 10, w = 248, h = 160;
    rect(ctx, 0, 0, VW, VH, 'rgba(11,10,20,.5)'); panel(ctx, x, y, w, h, { fill: 'navy' });
    text(ctx, B.show ? 'SHOW ' + shortName(talk.state.who).toUpperCase() + '...' : 'INVENTORY', x + 8, y + 7, '#f0b54a');
    text(ctx, 'J: NOTEBOOK', x + w - 8 - measure('J: NOTEBOOK'), y + 7, '#6b6a7a');
    if (!list.length) { text(ctx, 'NOTHING YET. EXAMINE THINGS (E).', x + 8, y + 30, '#a7a5b3'); text(ctx, 'ESC: CLOSE', x + w - 8 - measure('ESC: CLOSE'), y + h - 11, '#6b6a7a'); return; }
    B.sel = Math.max(0, Math.min(list.length - 1, B.sel));
    list.forEach((id, i) => {
      const cx = x + 8 + (i % 10) * 22, cy = y + 20 + Math.floor(i / 10) * 22;
      rect(ctx, cx, cy, 20, 20, i === B.sel ? '#c67a2f' : '#232845'); rect(ctx, cx + 1, cy + 1, 18, 18, '#161729');
      ICONS.draw(ctx, id, cx + 2, cy + 2);
      hit(cx, cy, 20, 20, () => { if (B.sel === i && B.show) useSel(); B.sel = i; });
    });
    const e = EV[list[B.sel]], ty = y + 20 + Math.ceil(list.length / 10) * 22 + 4;
    rect(ctx, x + 8, ty, w - 16, 1, '#c67a2f');
    text(ctx, e.name.toUpperCase(), x + 8, ty + 5, '#f0b54a');
    const dl = wrap(e.description, 38), cap = Math.floor((y + h - ty - 28) / 9); (dl.length > cap ? dl.slice(0, cap - 1).concat([dl[cap - 1] + '...']) : dl).forEach((l, i) => text(ctx, l, x + 8, ty + 16 + i * 9, '#d8c9a3'));
    const f = B.show ? 'ENTER: SHOW   ESC: BACK' : 'ESC: CLOSE';
    text(ctx, f, x + w - 8 - measure(f), y + h - 11, '#6b6a7a');
  }
  const bookEntries = () => (G.book.tab === 'people' ? ['lazar', ...CASE.accusation.suspects, 'castelli'] : G.notes.slice().reverse());
  const bookPc = Object.assign(document.createElement('canvas'), { width: 48, height: 48 });
  function drawBook() {
    const B = G.book, x = 16, y = 14, w = 288, h = 152;
    rect(ctx, 0, 0, VW, VH, 'rgba(11,10,20,.5)'); panel(ctx, x, y, w, h, { fill: '#1d1a2e' });
    let tx = x + 8;
    for (const [id, name] of [['people', 'PEOPLE'], ['clues', 'WHAT I KNOW']]) {
      const tw = measure(name) + 8; rect(ctx, tx, y + 5, tw, 11, B.tab === id ? '#c67a2f' : '#232845'); text(ctx, name, tx + 4, y + 7, B.tab === id ? '#0b0a14' : '#a7a5b3');
      hit(tx, y + 5, tw, 11, () => { B.tab = id; B.sel = 0; }); tx += tw + 4;
    }
    const title = B.show ? 'TELL ' + shortName(talk.state.who).toUpperCase() : 'NOTEBOOK';
    text(ctx, title, x + w - 8 - measure(title), y + 7, '#f0b54a');
    const L = bookEntries(); B.sel = Math.max(0, Math.min(L.length - 1, B.sel));
    const listW = 104, rows = 13, top = Math.max(0, Math.min(B.sel - 6, L.length - rows));
    L.slice(top, top + rows).forEach((id, j) => {
      const i = top + j, ly = y + 22 + j * 9, name = B.tab === 'people' ? byId[id].name.replace(/^(Countess|Major|Dr) /, '') : EV[id].name.replace(/^[^:]+: /, '');
      if (i === B.sel) rect(ctx, x + 6, ly - 1, listW, 9, '#34406e');
      text(ctx, name.slice(0, 17), x + 8, ly, i === B.sel ? '#f3ead2' : '#a7a5b3');
      hit(x + 6, ly - 1, listW, 9, () => { if (B.sel === i && B.show && B.tab === 'clues') useSel(); B.sel = i; });
    });
    if (!L.length) text(ctx, 'NOTHING YET.', x + 8, y + 24, '#6b6a7a');
    rect(ctx, x + listW + 10, y + 20, 1, h - 26, '#3b3a48');
    const rx = x + listW + 16, id = L[B.sel];
    if (id && B.tab === 'people') {
      const c = byId[id];
      PORTRAITS.draw(bookPc.getContext('2d'), id, 0, 0, { dead: id === 'lazar' && G.ch.id !== 'morning' }); ctx.drawImage(bookPc, rx, y + 20);
      wrap(c.name.toUpperCase(), 20).slice(0, 2).forEach((l, i) => text(ctx, l, rx + 52, y + 22 + i * 9, '#f0b54a'));
      wrap(c.role, 20).slice(0, 3).forEach((l, i) => text(ctx, l, rx + 52, y + 42 + i * 9, '#a7a5b3'));
      const facts = [...G.items, ...G.notes].filter((e) => (EV[e].about || []).includes(id)).map((e) => '- ' + EV[e].name.replace(/^[^:]+: /, ''));
      const said = G.per[id]?.lines.filter((l) => l.who === id).length || 0;
      const lines = [id === 'lazar' ? 'THE VICTIM' : said ? 'QUESTIONED' : 'NOT QUESTIONED YET', ...facts];
      lines.slice(0, 9).forEach((l, i) => text(ctx, l.slice(0, 29), rx, y + 72 + i * 9, i === 0 ? '#79ad7c' : '#d8c9a3'));
    } else if (id) {
      const e = EV[id];
      rect(ctx, rx, y + 20, 36, 34, '#161729'); ICONS.draw(ctx, id, rx + 2, y + 21, 2);
      wrap(e.name.toUpperCase(), 22).slice(0, 3).forEach((l, i) => text(ctx, l, rx + 42, y + 22 + i * 9, '#f0b54a'));
      wrap(e.description, 29).slice(0, 10).forEach((l, i) => text(ctx, l, rx, y + 60 + i * 9, '#d8c9a3'));
    }
    const f = B.show && B.tab === 'clues' ? 'ENTER: TELL  TAB: PAGE  ESC' : 'TAB: PAGE   ESC: CLOSE';
    text(ctx, f, x + w - 8 - measure(f), y + h - 11, '#6b6a7a');
  }
  function useSel() {
    let id = null;
    if (G.inv && G.inv.show) id = G.items[G.inv.sel];
    else if (G.book && G.book.show && G.book.tab === 'clues') id = bookEntries()[G.book.sel];
    if (!id) return;
    G.inv = G.book = null; G.mode = 'talk'; G.showedSomething = true; talk.present(id);
  }

  const accPc = Object.assign(document.createElement('canvas'), { width: 48, height: 48 });
  const proofList = () => [...G.items, ...G.notes];
  function drawAccuse() {
    const A = G.acc_;
    rect(ctx, 0, 0, VW, VH, 'rgba(11,10,20,.84)');
    const heads = ['WHO KILLED ANTON LAZĂR?', 'WHY?', 'PROVE IT: CHOOSE THREE'];
    text(ctx, heads[A.step], 160, 10, '#f0b54a', { align: 'center', scale: A.step === 2 ? 1 : 2 });
    if (A.step === 0) {
      const S = CASE.accusation.suspects;
      S.forEach((id, i) => {
        const x = 8 + i * 51, y = 50;
        rect(ctx, x - 1, y - 1, 50, 50, i === A.sel ? '#ffd36b' : '#3b3a48');
        PORTRAITS.draw(accPc.getContext('2d'), id, 0, 0, { t: G.frame }); ctx.drawImage(accPc, x, y);
        text(ctx, shortName(id).toUpperCase(), x + 24, y + 54, i === A.sel ? '#f0b54a' : '#a7a5b3', { align: 'center' });
        hit(x - 1, y - 1, 50, 62, () => { if (A.sel === i) accuseNext(); A.sel = i; });
      });
      text(ctx, byId[S[A.sel]].role.slice(0, 50), 160, 124, '#d8c9a3', { align: 'center' });
    } else if (A.step === 1) {
      CASE.accusation.motives.forEach((m, i) => {
        const y = 44 + i * 16; if (i === A.sel) rect(ctx, 30, y - 3, 260, 13, '#34406e');
        text(ctx, m.label.slice(0, 42), 36, y, i === A.sel ? '#f3ead2' : '#a7a5b3');
        hit(30, y - 3, 260, 13, () => { if (A.sel === i) accuseNext(); A.sel = i; });
      });
    } else {
      const L = proofList(), rows = 11, top = Math.max(0, Math.min(A.sel - 5, L.length - rows));
      if (!L.length) text(ctx, 'YOU HAVE NO PROOF AT ALL.', 160, 60, '#c93a48', { align: 'center' });
      L.slice(top, top + rows).forEach((id, j) => {
        const i = top + j, y = 28 + j * 12, on = A.picks.has(id);
        if (i === A.sel) rect(ctx, 20, y - 2, 280, 11, '#34406e');
        rect(ctx, 24, y, 6, 6, on ? '#79ad7c' : '#3b3a48');
        text(ctx, EV[id].name.slice(0, 42), 36, y, on ? '#79ad7c' : i === A.sel ? '#f3ead2' : '#a7a5b3');
        hit(20, y - 2, 280, 11, () => { A.sel = i; togglePick(id); });
      });
      text(ctx, `${A.picks.size}/3 CHOSEN`, 160, 162, A.picks.size === 3 ? '#79ad7c' : '#a7a5b3', { align: 'center' });
      if (A.picks.size === 3) hit(100, 158, 120, 12, () => grade());
    }
    const f = A.step === 2 ? (A.picks.size === 3 ? 'ENTER: ACCUSE' : 'E: CHOOSE') + '   ESC: BACK' : 'ENTER: CHOOSE' + (A.step ? '   ESC: BACK' : '');
    text(ctx, f, 160, 172, '#f0b54a', { align: 'center' });
  }
  function togglePick(id) { const A = G.acc_; if (A.picks.has(id)) A.picks.delete(id); else if (A.picks.size < 3) A.picks.add(id); }
  function accuseNext() {
    const A = G.acc_;
    if (A.step === 0) { A.suspect = CASE.accusation.suspects[A.sel]; A.step = 1; A.sel = 0; }
    else if (A.step === 1) { A.motive = CASE.accusation.motives[A.sel].id; A.step = 2; A.sel = 0; }
    else if (A.picks.size === 3) grade();
  }

  // ---------------- screens ----------------
  function drawTitleArt(dim) {
    if (titleArt.complete && titleArt.naturalWidth) { ctx.imageSmoothingEnabled = true; ctx.drawImage(titleArt, 0, 0, VW, VH); ctx.imageSmoothingEnabled = false; }
    else vgrad(ctx, 0, 0, VW, VH, ['#0b0a14', '#161729', '#34406e']);
    for (const f of flakes) { f.y += f.v; f.x -= 0.2; if (f.y > VH) { f.y = 0; f.x = Math.random() * VW; } px(ctx, f.x, f.y, '#d8e4f0'); }
    if (dim) rect(ctx, 0, 0, VW, VH, `rgba(11,10,20,${dim})`);
  }
  function drawTitle() {
    drawTitleArt(0);
    rect(ctx, 0, 0, VW, 54, 'rgba(11,10,20,.55)'); rect(ctx, 0, 146, VW, 34, 'rgba(11,10,20,.7)');
    text(ctx, 'LAST STOP,', 160, 8, '#f3ead2', { align: 'center', scale: 2, shadow: '#0b0a14' });
    text(ctx, 'SIMPLON-ORIENT', 160, 26, '#f0b54a', { align: 'center', scale: 2, shadow: '#0b0a14' });
    text(ctx, 'A MURDER MYSTERY · 1931', 160, 44, '#a7a5b3', { align: 'center' });
    if (G.frame % 50 < 34) text(ctx, 'PRESS ENTER', 160, 158, '#f0b54a', { align: 'center' });
  }
  const menuItems = () => [
    ...(hasSave() ? [['CONTINUE', () => load() || newGame()]] : []),
    ['NEW GAME', () => newGame()],
    ['CHOOSE A CASE', () => { G.mode = 'cases'; G.menuSel = 0; }],
    ['SETTINGS', () => { G.mode = 'settings'; G.menuSel = 0; }],
  ];
  function drawMenu() {
    drawTitleArt(0.55);
    text(ctx, 'LAST STOP,', 160, 16, '#f3ead2', { align: 'center', scale: 2, shadow: '#0b0a14' });
    text(ctx, 'SIMPLON-ORIENT', 160, 34, '#f0b54a', { align: 'center', scale: 2, shadow: '#0b0a14' });
    const items = menuItems(); G.menuSel = Math.max(0, Math.min(items.length - 1, G.menuSel));
    items.forEach(([s], i) => {
      const y = 78 + i * 16, on = i === G.menuSel;
      if (on) { rect(ctx, 80, y - 4, 160, 15, 'rgba(198,122,47,.35)'); rect(ctx, 80, y - 4, 2, 15, '#f0b54a'); }
      text(ctx, s, 160, y, on ? '#f3ead2' : '#a7a5b3', { align: 'center' });
      hit(80, y - 4, 160, 15, () => { G.menuSel = i; menuEnter(); });
    });
    text(ctx, 'ARROWS + ENTER, OR CLICK', 160, 166, '#6b6a7a', { align: 'center' });
  }
  function drawCases() {
    drawTitleArt(0.75);
    text(ctx, 'CHOOSE A CASE', 160, 14, '#f0b54a', { align: 'center', scale: 2 });
    G.menuSel = Math.max(0, Math.min(CASES.length - 1, G.menuSel));
    CASES.forEach((c, i) => {
      const y = 42 + i * 40, on = i === G.menuSel;
      panel(ctx, 30, y, 260, 34, { fill: on ? '#232845' : '#161729', frame: on ? '#f0b54a' : '#3b3a48' });
      text(ctx, c.title.toUpperCase(), 40, y + 8, c.ready ? '#f3ead2' : '#6b6a7a');
      text(ctx, c.year + ' · ' + c.place.toUpperCase(), 40, y + 20, c.ready ? '#a7a5b3' : '#4b4a5a');
      if (!c.ready) text(ctx, 'SOON', 280 - measure('SOON'), y + 8, '#c67a2f');
      hit(30, y, 260, 34, () => { G.menuSel = i; menuEnter(); });
    });
    text(ctx, 'ENTER: PLAY   ESC: BACK', 160, 166, '#6b6a7a', { align: 'center' });
  }
  const settingsRows = () => [
    ['CHARACTERS', G.settings.brain === 'live' ? 'LIVE AI' : 'SCRIPTED', !G.server.brain],
    ['SPOKEN VOICES', G.settings.voice && G.settings.brain === 'live' ? 'ON' : 'OFF', !G.server.voice || G.settings.brain !== 'live'],
    ['SOUND EFFECTS', G.settings.sound ? 'ON' : 'OFF', false],
    ['OLD TV EFFECT', G.settings.crt ? 'ON' : 'OFF', false],
  ];
  function drawSettings() {
    drawTitleArt(0.75);
    text(ctx, 'SETTINGS', 160, 14, '#f0b54a', { align: 'center', scale: 2 });
    const R = settingsRows(); G.menuSel = Math.max(0, Math.min(R.length - 1, G.menuSel));
    R.forEach(([k, v, off], i) => {
      const y = 50 + i * 18, on = i === G.menuSel;
      if (on) rect(ctx, 50, y - 4, 220, 15, 'rgba(198,122,47,.35)');
      text(ctx, k, 58, y, off ? '#6b6a7a' : '#f3ead2'); text(ctx, v, 262 - measure(v), y, off ? '#4b4a5a' : '#f0b54a');
      hit(50, y - 4, 220, 15, () => { G.menuSel = i; menuEnter(); });
    });
    const note = G.server.brain ? 'LIVE AI: ASK THE CHARACTERS ANYTHING, BY VOICE OR TEXT. SCRIPTED: SUGGESTED QUESTIONS.' : 'LIVE AI NEEDS THE GAME SERVER (NPM START).';
    wrap(note, 46).forEach((l, i) => text(ctx, l, 160, 130 + i * 9, '#a7a5b3', { align: 'center' }));
    text(ctx, 'ENTER: CHANGE   ESC: BACK', 160, 166, '#6b6a7a', { align: 'center' });
  }
  function menuEnter() {
    if (G.mode === 'menu') { const m = menuItems()[G.menuSel]; m && m[1](); }
    else if (G.mode === 'cases') { if (CASES[G.menuSel].ready) newGame(); else toast('THIS CASE IS COMING SOON'); }
    else if (G.mode === 'settings') {
      const i = G.menuSel, s = G.settings;
      if (i === 0 && G.server.brain) s.brain = s.brain === 'live' ? 'scripted' : 'live';
      if (i === 1 && G.server.voice && s.brain === 'live') s.voice = !s.voice;
      if (i === 2) s.sound = !s.sound;
      if (i === 3) { s.crt = !s.crt; PX.crt(wrapEl, s.crt); }
      talk.setBrain(s.brain); saveSettings(); log.info('settings', { ...s });
    }
  }

  // The 5-second opening: the train runs, the mountain comes down, the train stops.
  function drawPrologue() {
    const t = G.cut++, speed = t < 150 ? 4 : Math.max(0, 4 - (t - 150) * 0.08);
    G.scrollP += speed;
    vgrad(ctx, 0, 0, VW, 110, ['#0b0a14', '#161729', '#232845']);
    for (let i = 0; i < 40; i++) px(ctx, (i * 97) % VW, (i * 31) % 60, '#5570a8');
    const mo = G.scrollP * 0.2;
    ctx.fillStyle = '#1d2240'; ctx.beginPath(); ctx.moveTo(0, 110);
    for (let x = -40; x <= VW + 40; x += 40) ctx.lineTo(x - (mo % 40), 60 + ((Math.floor((x + mo) / 40) * 53) % 30));
    ctx.lineTo(VW, 110); ctx.fill();
    rect(ctx, 0, 110, VW, 70, '#34406e'); rect(ctx, 0, 138, VW, 2, '#6b6a7a');
    for (let x = -(G.scrollP % 30); x < VW; x += 30) rect(ctx, x, 136, 12, 6, '#232845');
    for (let x = -((G.scrollP * 1.4) % 60); x < VW; x += 60) for (let k = 0; k < 6; k++) rect(ctx, x + 20 - k, 150 + k * 2, k * 2 + 1, 2, '#12261f');
    const tx = 40;
    rect(ctx, tx, 116, 200, 18, '#1a1d33'); rect(ctx, tx, 116, 200, 1, '#c67a2f');
    for (let x = 6; x < 196; x += 14) rect(ctx, tx + x, 120, 8, 6, (x / 14) % 5 === 3 ? '#34406e' : '#f0b54a');
    rect(ctx, tx + 200, 112, 34, 22, '#0b0a14'); rect(ctx, tx + 222, 104, 6, 8, '#0b0a14');
    if (speed > 0.5) for (let i = 0; i < 5; i++) rect(ctx, tx + 220 - i * 10 - (t % 10), 96 - i * 5, 7, 4, '#6b6a7a');
    if (t > 100) {
      const a = Math.min(1, (t - 100) / 60), edge = VW - a * 90;
      ctx.fillStyle = '#e8eef4'; ctx.beginPath(); ctx.moveTo(VW, 40); ctx.lineTo(edge + 30, 70); ctx.lineTo(edge, 110); ctx.lineTo(edge - 10, 140); ctx.lineTo(VW, 150); ctx.fill();
      if (t === 101 && G.settings.sound) for (let i = 0; i < 14; i++) setTimeout(() => blip(40 + Math.random() * 30, 0.12, 0.05), i * 70);
    }
    for (const f of flakes) { f.y += f.v * 1.5; f.x -= speed * 0.6 + 0.3; if (f.y > VH) f.y = 0; if (f.x < 0) f.x = VW; px(ctx, f.x, f.y, '#d8e4f0'); }
    if (t > 100 && t < 160) { const d = (Math.random() - 0.5) * 6; ctx.drawImage(cv, d, d / 2); }
    const cap = t < 100 ? ['18 DECEMBER 1931, 23:39', 'THE SIMPLON-ORIENT EXPRESS, ABOVE ISELLE'] : ['23:40. AN AVALANCHE.', 'THE TRAIN IS STUCK UNTIL MORNING.'];
    rect(ctx, 0, 0, VW, 30, 'rgba(11,10,20,.7)'); cap.forEach((l, i) => text(ctx, l, 160, 5 + i * 11, i ? '#a7a5b3' : '#f3ead2', { align: 'center' }));
    text(ctx, 'ENTER: SKIP', VW - 4 - measure('ENTER: SKIP'), VH - 10, '#6b6a7a');
    if (t > 290 && !G.fade) fadeTo(['07:00, THE NEXT MORNING.', 'THE DINING CAR.'], () => startChapter('morning'));
  }
  function drawFade() {
    const F = G.fade; F.t++;
    const a = F.t < 30 ? F.t / 30 : F.t < 150 ? 1 : Math.max(0, 1 - (F.t - 150) / 30);
    rect(ctx, 0, 0, VW, VH, `rgba(11,10,20,${a})`);
    if (F.t >= 30 && F.t < 160) F.lines.forEach((l, i) => text(ctx, l, 160, 80 + i * 11 - F.lines.length * 5, '#f3ead2', { align: 'center' }));
    if (F.t === 30 && F.then) { const fn = F.then; F.then = null; fn(); }
    if (F.t >= 180) G.fade = null;
  }
  function drawEnd() {
    const R = G.result;
    rect(ctx, 0, 0, VW, VH, '#e9dfc4'); for (let i = 0; i < 300; i++) px(ctx, (i * 131) % VW, (i * 71) % VH, '#d8c9a3');
    text(ctx, 'LA GAZZETTA DEL SEMPIONE', 160, 8, '#0b0a14', { align: 'center', scale: 2 });
    rect(ctx, 10, 26, 300, 1, '#0b0a14'); text(ctx, 'DOMODOSSOLA · SABATO 19 DICEMBRE 1931', 160, 29, '#35190f', { align: 'center' }); rect(ctx, 10, 38, 300, 1, '#0b0a14');
    const H = { solved: ['DEATH ON THE SIMPLON: THE DOCTOR', "SIGNED HIS OWN VICTIM'S CERTIFICATE"], weak: ['ORIENT EXPRESS: DOCTOR DETAINED,', 'BUT THE CASE IS "THIN", SAY JUDGES'], wrong: ["ENVOY'S DEATH: WRONG PASSENGER", 'ARRESTED. THE KILLER TAKES THE TRAIN'] }[R.verdict];
    H.forEach((l, i) => text(ctx, l, 160, 44 + i * 10, '#5e1627', { align: 'center' }));
    const body = { solved: 'Inspector Sorel of the Paris Sûreté proved that Dr Paul Ferrand killed the envoy Anton Lazăr with morphine, then left by the window into the snow. Lazăr had blackmailed him since a patient died at his Passy clinic in 1927.',
      weak: "Dr Ferrand was taken off the train at Domodossola, but the magistrate says the inspector's case leaves too many questions. He may walk free.",
      wrong: 'The carabinieri took ' + (byId[R.suspect]?.name || 'a passenger') + " off the train. A quiet French doctor continued to Belgrade. Lazăr's heart, he said, simply stopped." }[R.verdict];
    wrap(body, 50).forEach((l, i) => text(ctx, l, 12, 68 + i * 9, '#0b0a14'));
    text(ctx, 'KEY PROOFS FOUND ' + R.found.length + '/' + (R.found.length + R.missed.length), 12, 120, '#35190f');
    R.missed.slice(0, 4).forEach((e, i) => text(ctx, '- MISSED: ' + EV[e].name.slice(0, 38), 12, 131 + i * 9, '#8a4221'));
    if (G.frame % 50 < 34) text(ctx, 'ENTER: MENU', 160, 170, '#5e1627', { align: 'center' });
  }

  // ---------------- frame ----------------
  function frame() {
    G.frame++; G.hits = [];
    const M = G.mode;
    if (M === 'title') drawTitle();
    else if (M === 'menu') drawMenu();
    else if (M === 'cases') drawCases();
    else if (M === 'settings') drawSettings();
    else if (M === 'prologue') drawPrologue();
    else if (M === 'end') drawEnd();
    else {
      if (M === 'play' && !G.read && !G.fade) {
        movePlayer();
        if (G.ch.clock === 'realtime') { G.acc += 1 / 60; while (G.acc >= G.ch.secondsPerMinute) { G.acc -= G.ch.secondsPerMinute; G.clock++; } }
        updateEvents();
        if (G.ch.id === 'morning' && !G.runner) { const s = (performance.now() - G.chStart) / 1000; if (s > 26 || (G.saidHello && s > 14)) startRunner(); }
      }
      if (!G.fade) updateNpcs();
      if (M === 'play' && !G.read && !G.fade) findTarget(); else G.target = null;
      drawWorld();
      if (M === 'gather' && !G.fade) { G.gatherT = (G.gatherT || 0) + 1; if (G.gatherT > 120) { G.gatherT = 0; openAccuse(); } }
      if (M === 'play' || M === 'gather') drawHud(); else drawToasts();
      drawRead();
      if (M === 'talk') {
        talk.frame(ctx);
      }
      if (M === 'inv') drawInv();
      if (M === 'book') drawBook();
      if (M === 'accuse') drawAccuse();
    }
    if (G.fade) drawFade();
    if (['title', 'menu', 'cases', 'settings'].includes(M)) drawToasts();
  }

  // ---------------- input ----------------
  const DIRS = { up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'] };
  const is = (e, d) => DIRS[d].includes(e.code);
  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'Backspace'].includes(e.code)) e.preventDefault();
    const M = G.mode, enter = e.key === 'Enter', esc = e.key === 'Escape';
    unlockAudio();
    if (M === 'prologue') { if (enter || esc) { G.fade = null; startChapter('morning'); } return; }
    if (G.fade) return;
    if (M === 'title') { if (enter || e.code === 'Space' || e.code === 'KeyE') { G.mode = 'menu'; G.menuSel = 0; } return; }
    if (M === 'menu' || M === 'cases' || M === 'settings') {
      if (is(e, 'up')) G.menuSel--; if (is(e, 'down')) G.menuSel++;
      if (enter || e.code === 'KeyE') menuEnter();
      if (esc && M !== 'menu') { G.mode = 'menu'; G.menuSel = 0; }
      return;
    }
    if (M === 'end') { if (enter) { G.mode = 'menu'; G.menuSel = 0; } return; }
    if (M === 'accuse') {
      const A = G.acc_, n = A.step === 0 ? CASE.accusation.suspects.length : A.step === 1 ? CASE.accusation.motives.length : Math.max(1, proofList().length);
      if (is(e, A.step === 0 ? 'left' : 'up')) A.sel = (A.sel - 1 + n) % n;
      if (is(e, A.step === 0 ? 'right' : 'down')) A.sel = (A.sel + 1) % n;
      if (A.step === 2 && (e.code === 'KeyE' || e.code === 'Space') && proofList()[A.sel]) togglePick(proofList()[A.sel]);
      if (enter) accuseNext();
      if (esc && A.step > 0) { A.step--; A.sel = 0; }
      return;
    }
    if (M === 'inv' || M === 'book') {
      const B = M === 'inv' ? G.inv : G.book, n = M === 'inv' ? G.items.length : bookEntries().length;
      if (M === 'inv') { if (is(e, 'left')) B.sel--; if (is(e, 'right')) B.sel++; if (is(e, 'up')) B.sel -= 10; if (is(e, 'down')) B.sel += 10; }
      else { if (is(e, 'up')) B.sel--; if (is(e, 'down')) B.sel++; if ((e.code === 'Tab' && !B.show) || is(e, 'left') || is(e, 'right')) { B.tab = B.tab === 'people' ? 'clues' : 'people'; B.sel = 0; } }
      B.sel = Math.max(0, Math.min(Math.max(0, n - 1), B.sel));
      if (enter && B.show) return useSel();
      if (e.code === 'KeyJ' && M === 'inv') { G.book = { tab: B.show ? 'clues' : 'people', sel: 0, show: B.show }; G.inv = null; G.mode = 'book'; return; }
      if (e.code === 'KeyI' && M === 'book') { G.inv = { sel: 0, show: B.show }; G.book = null; G.mode = 'inv'; return; }
      if (esc || (e.code === 'Tab' && B.show) || (e.code === 'KeyI' && M === 'inv') || (e.code === 'KeyJ' && M === 'book')) { const back = B.show ? 'talk' : 'play'; G.inv = G.book = null; G.mode = back; }
      return;
    }
    if (M === 'talk') {
      const T = talk.state;
      if (esc) { if (T.buf) T.buf = ''; else closeTalk(); return; }
      if (e.code === 'Space' && !T.buf) { if (!e.repeat && talk.voiceMode()) talk.talkStart(); return; }
      if (enter) { if (T.buf) talk.submit(); return; }
      if (e.key === 'Backspace') { talk.backspace(); return; }
      if (!T.buf && /^[1-3]$/.test(e.key)) { talk.quick(+e.key - 1); return; }
      if (e.code === 'Tab') { G.inv = { sel: 0, show: true }; G.mode = 'inv'; return; }
      if (e.key.length === 1) talk.type(e.key);
      return;
    }
    if (M === 'play') {
      if (G.read) { if (e.code === 'KeyE' || enter || esc || e.code === 'Space') closeRead(); return; }
      G.keys[e.code] = true;
      if (e.code === 'KeyE' || enter) interact();
      if (e.code === 'KeyI') { G.openedBag = true; G.inv = { sel: 0, show: false }; G.mode = 'inv'; G.keys = {}; }
      if (e.code === 'KeyJ') { G.openedBag = true; G.book = { tab: 'people', sel: 0, show: false }; G.mode = 'book'; G.keys = {}; }
      if (esc) { save(); G.mode = 'menu'; G.menuSel = 0; }
    }
  });
  addEventListener('keyup', (e) => { G.keys[e.code] = false; if (e.code === 'Space' && G.mode === 'talk' && talk.state.listening) talk.talkEnd(); });
  addEventListener('blur', () => { G.keys = {}; });
  cv.addEventListener('click', (ev) => {
    unlockAudio();
    const m = PX.mouse(cv, ev);
    for (let i = G.hits.length - 1; i >= 0; i--) { const h = G.hits[i]; if (m.x >= h.x && m.x < h.x + h.w && m.y >= h.y && m.y < h.y + h.h) return h.fn(); }
    if (G.mode === 'title') { G.mode = 'menu'; G.menuSel = 0; }
    else if (G.mode === 'prologue') { G.fade = null; startChapter('morning'); }
    else if (G.mode === 'play' && G.read) closeRead();
    else if (G.mode === 'end') { G.mode = 'menu'; G.menuSel = 0; }
  });
  let audioOk = false;
  function unlockAudio() { if (audioOk) return; audioOk = true; try { VOICE.player.ensure(); } catch (_) {} }

  // ---------------- boot ----------------
  PX.crt(wrapEl, G.settings.crt);
  fetch('/api/status').then((r) => r.json()).then((s) => {
    G.server = { brain: !!s.brain, voice: !!s.voice };
    log.info('server status', s);
    if (!savedSettings && s.brain) G.settings.brain = 'live';
    if (!s.brain) G.settings.brain = 'scripted'; if (!s.voice) G.settings.voice = false;
    talk.setBrain(G.settings.brain);
  }).catch((e) => { log.warn('no game server: scripted brain, no voice', { error: String(e.message || e) }); G.settings.brain = 'scripted'; G.settings.voice = false; talk.setBrain('scripted'); });

  let last = performance.now(), lag = 0;
  (function loop(now) { lag += Math.min(100, now - last); last = now; while (lag >= 1000 / 60) { frame(); lag -= 1000 / 60; } requestAnimationFrame(loop); })(performance.now());

  window.GAME = { G, talk, learn, startChapter, openTalk, closeTalk, fmt, EV, byId, hidden, newGame, openAccuse, gather };
})();
