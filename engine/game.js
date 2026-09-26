// The story, directed on the scene engine: title -> avalanche -> breakfast (tutorial) -> Théo bursts in ->
// the forced door of No. 7 -> the investigation (search, collect, question, show) -> gather -> accuse -> newspaper.
(function () {
  const E = ENGINE;
  const toMin = (s) => { const [h, m] = s.split(':').map(Number); return (h < 12 ? h + 24 : h) * 60 + m; };
  const fmt = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const EV = Object.fromEntries(CASE.evidence.map((e) => [e.id, e]));
  const L = window.LOG ? LOG.scope('story') : { info() {}, debug() {}, warn() {} };

  const NAMES = { sorel: 'Inspector Sorel', ferrand: 'Dr Ferrand', irina: 'Countess Voss', hale: 'Major Hale', mila: 'Mila Novak', brandt: 'Herr Brandt', theo: 'Théo', castelli: 'Castelli', cook: 'Luigi', lazar: 'Anton Lazăr' };
  const ROLES = { sorel: 'You', ferrand: 'Physician, Paris', irina: 'Austrian widow', hale: 'Retired, Indian Army', mila: 'Cabaret singer', brandt: 'Oil company agent', theo: 'Sleeping-car conductor', castelli: 'Chef de train', cook: 'Cook', lazar: 'Romanian trade envoy' };
  const MORNING = {
    ferrand: 'Good morning, Inspector. You slept through the avalanche? I envy you.',
    hale: 'Snowed in, what? Castelli says the relief train comes at ten. Dreadful coffee.',
    irina: 'Inspector. Forgive me, I did not sleep. The mountains are too quiet.',
    mila: "Bonjour, chéri. Is it true you're police? ...Just asking.",
    brandt: "Ten o'clock. Three hours lost. My company will be delighted.",
    castelli: 'Buongiorno, Inspector! The line is blocked at km 142. We dig at ten.',
    cook: 'Inspector! Coffee? The stove is the only warm thing on this train.',
  };

  const G = {
    names: NAMES, roles: ROLES, EV, beat: null, clock: toMin('07:00'), items: [], notes: [], found: new Set(), per: {},
    settings: { brain: 'scripted', voice: true, sound: true, music: true, musicVol: 0.7, sfxVol: 0.8, speechRate: 1.15 }, server: { brain: false, voice: false }, flags: {},
    canGather: () => G.beat === 'investigation',
  };
  try { Object.assign(G.settings, JSON.parse(localStorage.getItem('simplon-settings') || '{}')); } catch (_) {}
  const saveSettings = () => { try { localStorage.setItem('simplon-settings', JSON.stringify(G.settings)); } catch (_) {} VOICE.player.rate = G.settings.speechRate || 1; };
  VOICE.player.rate = G.settings.speechRate || 1;
  const resetPer = () => { for (const c of CASE.characters) G.per[c.id] = { mood: 'calm', trust: 2, shown: new Set(), revealed: new Set(), done: false, history: {}, lines: [] }; };
  const known = (id) => G.items.includes(id) || G.notes.includes(id);

  // ---------- knowledge ----------
  function learn(id, quiet) {
    const e = EV[id]; if (!e || known(id)) return;
    (e.take ? G.items : G.notes).push(id);
    if (!quiet) UI.toast((e.take ? 'Added: ' : 'Noted: ') + e.name.replace(/^[^:]+: /, ''), e.take ? id : null, e.take ? 'item' : 'note');
    if (G.beat === 'investigation' && !quiet) advance(2);
    window.BOARD && BOARD.hud();
    L.info('learned', id);
  }
  function advance(min) {
    G.clock += min; tickClock();
    if (G.beat === 'investigation' && G.clock >= toMin('10:00') && !G.flags.gathering) { UI.toast('10:00. The relief train whistles.', null, 'alert'); gather(true); }
  }
  const tickClock = () => UI.clock(fmt(G.clock) + (G.beat === 'investigation' ? '  ·  relief at 10:00' : ''), G.beat === 'investigation' && G.clock >= toMin('09:30'));

  // ---------- dialogue ----------
  const talk = DIALOGUE.create(G, {
    learn: (id) => learn(id),
    // "Follow me": the character walks with the inspector from room to room until told to wait.
    follow: (who, on) => {
      if (on) { E.follow(who); UI.toast(`${NAMES[who]} follows you`, null, 'note'); }
      else if (E.follower === who) { E.unfollow(who); UI.toast(`${NAMES[who]} waits here`, null, 'note'); }
      L.info(on ? 'follow' : 'unfollow', { who, room: E.sceneId });
    },
    confession: (who) => { G.flags.confessed = true; UI.toast(`${NAMES[who]} confessed.`, null, 'alert'); },
    speaking: () => {},
    shown: () => {},
    toast: (s) => UI.toast(s),
    gather: () => gather(false),
    said: (who, q, a) => window.BOARD && BOARD.heard(who, q, a),
    openShow: () => UI.openPanel('inventory', { G, show: true, who: talk.state.who, onPick: (id) => talk.present(id), onStatement: (c) => { G.flags.confronted = true; talk.ask(BOARD.confrontLine(c)); } }),
    panelOpen: () => UI.panelOpen(),
    closed: (who, asked) => { const a = E.actors.get(who); if (a) a.talking = false; if (asked) advance(8); },
  });

  // ---------- engine hooks ----------
  Object.assign(E.hooks, {
    busy: () => UI.busy || talk.state.open || E.lock,
    nameOf: (id) => NAMES[id],
    verb: (a) => (G.beat === 'breakfast' ? 'Say good morning to' : 'Talk to'),
    spots() {
      const s = E.scene; if (!s || !s.spots) return [];
      return s.spots.filter((sp) => (!sp.beats || sp.beats.includes(G.beat)) && !(sp.clues && G.beat !== 'investigation')).map((sp) => {
        if (sp.clues) sp.done = sp.clues.every((c) => G.found.has(c));
        return sp.clues && sp.done && sp.prop && G.items.includes(sp.clues[0]) ? { ...sp, prop: null } : sp;
      });
    },
    exitOpen: (e) => !e.beats || e.beats.includes(G.beat),
    exitLocked: (e) => UI.toast(e.locked),
    entered: (id) => { UI.place(SCENES[id].name); G.flags['been_' + id] = true; if (id === 'c7') G.flags.inC7 = true; },
    clickActor(a) {
      if (G.beat === 'breakfast') {
        if (E.lock) return;
        E.clearBubbles(); const home = a.dir; a.face(E.player); G.greeting = { a, home, d0: Math.hypot(a.x - E.player.x, a.y - E.player.y) };
        E.say(a.id, MORNING[a.id] || 'Bonjour.', 3200).then(() => { if (G.greeting && G.greeting.a === a) { a.dir = home; G.greeting = null; } });
        G.flags.greeted = true; (G.flags.greetedSet ||= new Set()).add(a.id); G.flags.greetedAt = performance.now();
        return;
      }
      if (G.beat === 'investigation') { a.face(E.player); talk.open(a.id); }
    },
    async clickSpot(s) {
      if (!s.clues) { await UI.examine({ title: s.label, text: s.text }); return; }
      for (const id of s.clues) {
        const e = EV[id]; G.found.add(id); window.AUDIO && AUDIO.sfx('clue');
        await UI.examine({ title: e.name, icon: e.take ? id : null, text: e.description, action: e.take ? 'Take it' : 'Note it' });
        learn(id);
      }
    },
    // at breakfast a click greets from where you stand: no walking over to their table
    quick: (a) => G.beat === 'breakfast' && !E.lock,
    frame() {
      hints();
      // walk away from someone you've just greeted and they go back to their breakfast
      const g = G.greeting;
      if (g && E.player && Math.hypot(g.a.x - E.player.x, g.a.y - E.player.y) > g.d0 + 160) { E.clearBubbles(g.a.id); g.a.dir = g.home; G.greeting = null; }
    },
  });

  // E: act on what the "E ..." prompt shows (engine.js target(): the nearest person, or an unsearched clue)
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyE' || E.hooks.busy() || !E.player || E.scene.cinematic) return;
    const t = E.target(), p = E.player; if (!t) return;
    if (t.kind === 'actor') { p.stop(); p.face(t.a); E.ping = { x: t.a.x, y: t.a.y, t: 24 }; E.hooks.clickActor(t.a); } else E.hooks.clickSpot(t.s);
  });
  addEventListener('keydown', (e) => {
    if (E.hooks.busy() || !E.player || E.scene.cinematic || document.activeElement?.tagName === 'INPUT') return;
    if (e.code === 'KeyI' && G.beat === 'investigation') UI.openPanel('inventory', { G });
    if (e.code === 'KeyJ' && G.beat === 'investigation') UI.openPanel('notebook', { G });
    if (e.code === 'KeyM') UI.openPanel('map', mapOpts());
    if (e.key === 'Escape') UI.openPanel('settings', { G, onChange: saveSettings });
  });
  document.getElementById('btn-map').onclick = () => UI.openPanel('map', mapOpts());
  document.getElementById('btn-people').onclick = () => UI.openPanel('notebook', { G });
  document.getElementById('btn-bag').onclick = () => UI.openPanel('inventory', { G });
  // Fast travel (map): arrive where the door into that room would put you. Only rooms already visited, only
  // while investigating (QA: walking between rooms was downtime).
  function spawnFor(id) {
    for (const sc of Object.values(SCENES)) for (const x of sc.exits || []) if (x.to === id && E.hooks.exitOpen(x) && !x.locked) return x.spawn;
    return null;
  }
  const mapOpts = () => ({ G, here: E.sceneId, hereName: E.scene?.name,
    canTravel: (id) => G.beat === 'investigation' && !E.lock && !!spawnFor(id),
    travel: (id) => { const sp = spawnFor(id); if (!sp || E.lock) return; document.getElementById('panel-close').click(); L.info('fast travel', { from: E.sceneId, to: id }); E.goto(id, sp); } });
  // The case briefing lives behind the blinking bulb (and the case meter): it no longer stops the game.
  document.getElementById('casepill').onclick = document.getElementById('btn-brief').onclick = () => BOARD.briefing();
  document.getElementById('btn-settings').onclick = () => UI.openPanel('settings', { G, onChange: saveSettings });

  // ---------- tutorial hints ----------
  function hints() {
    if (!E.player || E.scene.cinematic || talk.state.open || UI.busy || E.lock) return UI.hint(null);
    const f = G.flags;
    let h = null;
    if (G.beat === 'breakfast') {
      if (!f.moved) { if (E.player.moving) f.moved = true; h = 'Click the floor to walk <kbd>or WASD</kbd>'; }
      else if (!f.greeted) h = 'Say good morning: click someone, or walk up and press <kbd>E</kbd>';
      else if (f.greetedSet && f.greetedSet.size < 2) h = 'Say good morning to someone else';
    } else if (G.beat === 'investigation') {
      const contra = window.BOARD ? BOARD.contradictions.length : 0, st = window.BOARD ? BOARD.strength() : { n: 0 };
      if (!f.inC7) h = 'Examine the body: go into <b>compartment 7</b> (the open door)';
      else if (!G.found.size) h = 'Look for clues: walk up to a ✦ sparkle and press <kbd>E</kbd> (or click it) to examine and pick it up';
      else if (!f.talked) h = 'Now question people about last night: click someone, or walk up and press <kbd>E</kbd>';
      else if (contra && !f.confronted) h = '⚠ Two statements disagree. In a conversation, <b>Show…</b> › Statements to confront them';
      else if (!f.showed && G.items.length) h = 'In a conversation, <b>Show…</b> them what you found and watch how they react';
      else if (st.n >= 3 && (G.clock >= toMin('09:00') || st.n >= 5)) h = 'Your case can hold. When ready, ask <b>Castelli</b> to gather everyone';
      else if (G.clock >= toMin('09:15')) h = 'Time is short: the carabinieri come at 10:00. Ask <b>Castelli</b> to gather everyone when ready';
    }
    UI.hint(h);
  }

  // ---------- story ----------
  // Skip intro (demo): each run of the intro has a token; skipping starts a new run, so the abandoned cutscene
  // stops at its next step and the investigation starts at once.
  let run = 0;
  const skipBtn = document.getElementById('skip');
  skipBtn.onclick = () => skipIntro();
  function skipIntro() {
    const r = ++run; L.info('intro skipped');
    UI.caption(null); document.getElementById('card').hidden = true; E.clearBubbles(); E.shake = 0;
    if (!E.player) E.player = new E.Actor('sorel', 700, 500, 'right');
    E.fade = 1; E.fadeTarget = 1; E.fadeDone = null;
    startInvestigation(r);
  }
  async function opening() {
    const r = ++run; skipBtn.hidden = false;
    UI.hideMenu(); UI.hud(false);
    window.AUDIO && AUDIO.music('avalanche');
    E.beat = null; await E.load('night'); if (r !== run) return; await E.fadeIn(600);
    UI.caption(['23:39, 18 December 1931', 'The Simplon-Orient Express, above Iselle']);
    await E.wait(2200); if (r !== run) return;
    E.shake = 70; rumble(); UI.caption(['23:40. An avalanche.', 'The train will not move again until morning.']);
    await E.wait(2600); if (r !== run) return; UI.caption(null);
    await E.fadeOut(600);
    await UI.card(['07:00, the next morning.', 'The dining car.'], 1800); if (r !== run) return;
    await breakfast(r);
  }
  function rumble() { if (!G.settings.sound) return; if (window.AUDIO) return AUDIO.sfx('rumble'); try { const ac = VOICE.player.ensure(); const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sawtooth'; o.frequency.value = 38; g.gain.value = 0.12; g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 2.2); o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 2.2); } catch (_) {} }

  // Breakfast is the tutorial: one thing happens at a time. Sorel walks in from the sleeping car,
  // Castelli makes his announcement, then the room is yours until you've greeted two people.
  async function breakfast(r) {
    G.beat = 'breakfast'; E.beat = 'breakfast'; G.clock = toMin('07:00');
    window.AUDIO && AUDIO.music('breakfast');
    E.player = new E.Actor('sorel', 40, 540, 'right');
    E.lock = true;
    await E.load('dining'); if (r !== run) return; UI.hud(true); tickClock(); await E.fadeIn(500);
    await E.player.walkTo(300, 540, null, 3);
    await E.wait(300); if (r !== run) return;
    await E.say('castelli', 'Buongiorno, signori! The relief train comes at ten. Coffee is on the house.', 3800); if (r !== run) return;
    E.lock = false;
    const start = performance.now(), greeted = () => (G.flags.greetedSet ? G.flags.greetedSet.size : 0);
    let nudged = false;
    await new Promise((res) => {
      const iv = setInterval(() => {
        const s = (performance.now() - start) / 1000, since = (performance.now() - (G.flags.greetedAt || 0)) / 1000;
        if (G.flags.moved || greeted()) skipBtn.hidden = true; // playing the breakfast now: Skip intro has done its job
        if (!nudged && s > 9 && !greeted()) { nudged = true; E.say('hale', 'Morning, Inspector! Snowed in, by Jove.', 3200); }
        if (r !== run || (greeted() >= 2 && since > 3.5) || (greeted() === 1 && s > 30 && since > 3.5) || s > 50) { clearInterval(iv); res(); }
      }, 250);
    });
    if (r !== run) return;
    await theoArrives(r);
  }

  async function theoArrives(r) {
    E.lock = true; UI.hint(null); E.clearBubbles();
    if (E.sceneId !== 'dining') await E.goto('dining', [420, 540, 'left']);
    E.lock = true;
    const p = E.player; p.stop();
    // Step into the aisle (away from the tables) and leave Théo room by the door.
    const ax = Math.max(320, Math.min(1100, p.x)), ay = 548;
    if (Math.hypot(p.x - ax, p.y - ay) > 8) await p.walkTo(ax, ay, null, 5);
    const theo = E.addActor('theo', 30, ay, 'right');
    L.info('theo arrives');
    window.AUDIO && (AUDIO.sfx('sting'), AUDIO.music(null, { fade: 1 }));
    E.say('theo', 'Inspector! Inspector!', 1800, { alert: true });
    await theo.walkTo(Math.max(120, p.x - 130), p.y, null, 7);
    theo.face(p); p.face(theo);
    ['irina', 'ferrand', 'hale', 'mila', 'brandt', 'castelli'].forEach((id) => E.actors.get(id)?.face(theo));
    await E.wait(250);
    await E.say('theo', "No. 7! The envoy won't wake, and his door is bolted from inside. Castelli is breaking it open. Come, please!", 4600, { alert: true }); if (r !== run) return;
    await E.say('irina', 'Mein Gott...', 1500); if (r !== run) return;
    await E.say('ferrand', "I'm a doctor. I'll come with you.", 2200); if (r !== run) return;
    await E.fadeOut(500);
    window.AUDIO && AUDIO.sfx('reveal');
    await UI.card(['You run after Théo to the sleeping car.', 'Castelli forces the bolt of No. 7.', 'Anton Lazăr is dead in his berth.'], 3000); if (r !== run) return;
    await startInvestigation(r);
  }
  async function startInvestigation(r) {
    skipBtn.hidden = true; UI.hint(null); E.lock = true;
    G.beat = 'investigation'; E.beat = 'investigation'; G.clock = toMin('07:20'); BOARD.hud();
    window.AUDIO && AUDIO.music('investigation');
    await E.load('corridor', [700, 500, 'right']); if (r !== run) return; UI.hud(true); tickClock(); await E.fadeIn(500);
    E.lock = false;
    E.say('castelli', 'Inspector, please. Find out what happened before the carabinieri come at ten.', 4200);
    await E.wait(4400); E.say('ferrand', 'His heart, Inspector. About half past one. I am sorry.', 3600);
  }

  // forced: 10:00 has come, no more waiting. Otherwise the player first sees how strong the case is, and can go
  // back to investigating (QA: people accused with a weak case without knowing it).
  async function gather(forced) {
    if (G.flags.gathering) return; G.flags.gathering = true; E.resetMoves();
    if (talk.state.open) talk.close();
    if (!(await BOARD.readiness({ canWait: !forced && G.clock < toMin('10:00') }))) { G.flags.gathering = false; E.lock = false; L.info('accusation postponed', { strength: BOARD.strength().n }); return; }
    E.lock = true; window.AUDIO && AUDIO.music('accusation'); await E.fadeOut(500);
    await UI.card(['Castelli gathers everyone in the dining car.'], 2000);
    E.beat = 'breakfast'; await E.load('dining', [700, 540, 'back']); E.beat = 'investigation';
    E.actors.get('castelli')?.face(E.player); await E.fadeIn(500);
    await E.say('castelli', 'They are all here, Inspector.', 2200);
    const r = await UI.accuse(G, { judge: async (b) => {
      if (!G.server.brain) return null;
      const res = await fetch((window.API_BASE || '') + '/api/judge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
      if (!res.ok) throw new Error('judge ' + res.status);
      return res.json();
    } });
    L.info('accusation', { who: r.who, motive: r.why, proofs: r.picks, words: r.words });
    const req = CASE.accusation.requires, keys = r.picks.filter((e) => req.evidenceAnyThreeOf.includes(e));
    const verdict = r.who === req.suspect && r.why === req.motive && keys.length >= 3 ? 'solved' : r.who === req.suspect ? 'weak' : 'wrong';
    if (verdict !== 'wrong') { E.actors.get(r.who)?.face(E.player); await E.say(r.who, verdict === 'solved' ? '...Colette. She was nineteen. I am so tired, Inspector.' : 'You cannot prove any of this.', 3000); }
    const all = [...new Set(req.evidenceAnyThreeOf)];
    window.AUDIO && AUDIO.music(verdict === 'solved' ? 'solved' : 'failed', { fade: 1.5 });
    await UI.ending(G, { verdict, who: r.who, remark: r.remark, found: all.filter(known), missed: all.filter((e) => !known(e)) });
    title();
  }

  function newGame() {
    E.resetMoves();
    G.items = []; G.notes = []; G.found = new Set(); G.flags = {}; G.beat = null; resetPer(); window.NOTES && NOTES.reset(); window.BOARD && BOARD.reset(); opening();
  }
  function title() {
    run++; skipBtn.hidden = true; UI.hud(false); E.scene = null; E.player = null; window.AUDIO && (AUDIO.music('title'), AUDIO.ambience(false));
    UI.menu([['Play', chooseCase], ['Settings', () => UI.openPanel('settings', { G, onChange: saveSettings })]],
      'A murder mystery game · more cases coming soon');
  }
  // Only the Simplon-Orient case exists so far; picking any ready case starts it.
  function chooseCase() { UI.cases(window.CASES || [], (c) => { if (c.ready) newGame(); }, title); }

  // ---------- boot ----------
  resetPer(); UI.fit();
  fetch((window.API_BASE || '') + '/api/status').then((r) => r.json()).then((s) => {
    G.server = { brain: !!s.brain, voice: !!s.voice };
    if (!localStorage.getItem('simplon-settings') && s.brain) G.settings.brain = 'live';
    if (!s.brain) G.settings.brain = 'scripted';
  }).catch(() => { G.settings.brain = 'scripted'; });
  E.preload(['bg/bg-night', 'bg/bg-dining', 'bg/bg-corridor', 'bg/bg-c7', 'sprites/lazar-body', ...['sorel', 'theo', 'ferrand', 'hale', 'irina', 'mila', 'brandt', 'castelli', 'cook'].flatMap((a) => ['front', 'back', 'left', 'right', 'walk', 'talk'].map((p) => `sprites/${a}-${p}`))]);
  title();
  window.GAME = { G, talk, learn, newGame, gather, E };
})();
