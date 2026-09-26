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
    settings: { brain: 'scripted', voice: true, sound: true, music: true, musicVol: 0.7, sfxVol: 0.8, speechRate: 1 }, server: { brain: false, voice: false }, flags: {},
    canGather: () => G.beat === 'investigation',
  };
  try { Object.assign(G.settings, JSON.parse(localStorage.getItem('simplon-settings') || '{}')); } catch (_) {}
  const saveSettings = () => { try { localStorage.setItem('simplon-settings', JSON.stringify(G.settings)); } catch (_) {} VOICE.player.rate = G.settings.speechRate || 1; };
  // The 1.15x playback default was too fast (and raised the pitch): reset it once for players who had it saved.
  if (!G.settings.rateV2) { if (G.settings.speechRate === 1.15) G.settings.speechRate = 1; G.settings.rateV2 = true; try { localStorage.setItem('simplon-settings', JSON.stringify(G.settings)); } catch (_) {} }
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
  const tickClock = () => UI.clock(fmt(G.clock) + (G.beat === 'investigation' ? '|relief at 10:00' : ''), G.beat === 'investigation' && G.clock >= toMin('09:30'));

  // ---------- dialogue ----------
  const talk = DIALOGUE.create(G, {
    learn: (id) => learn(id),
    // "Follow me": the character walks with the inspector from room to room until told to wait.
    follow: (who, on) => {
      if (on && who === 'castelli') return;             // Castelli doesn't tag along: call him with his portrait (C)
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
    lead: () => lead(),
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
    // a spot looks emptied (its `patch` is drawn) once every takeable clue in it is in the inventory
    taken(sp) {
      const t = (sp.clues || []).filter((c) => EV[c] && EV[c].take);
      return t.length > 0 && t.every((c) => G.items.includes(c));
    },
    exitOpen: (e) => !e.beats || e.beats.includes(G.beat),
    exitLocked: (e) => UI.toast(e.locked),
    entered: (id) => {
      if (G.beat === 'alarm' && id !== 'dining') lead(); UI.place(SCENES[id].name); G.flags['been_' + id] = true; if (id === 'c7') G.flags.inC7 = true; },
    clickActor(a) {
      if (G.beat === 'alarm') { if (a.id === 'castelli') { a.face(E.player); talk.open('castelli'); } else E.say(a.id, 'Go, Inspector, go with Castelli!', 2200); return; }
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
    inTalk: () => (talk.state.open ? talk.state.who : null),   // they face the inspector for the whole conversation
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
    } else if (G.beat === 'alarm') {
      h = 'Talk to <b>Castelli</b>: ask him where it happened, or say <b>"Take me there"</b>';
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
    const r = ++run; L.info('intro skipped'); stopFilm();
    UI.caption(null); document.getElementById('card').hidden = true; E.clearBubbles(); E.shake = 0;
    if (!E.player) E.player = new E.Actor('sorel', 700, 500, 'right');
    E.fade = 1; E.fadeTarget = 1; E.fadeDone = null;
    startInvestigation(r);
  }
  // ---------- the opening film (onboarding): the avalanche night, 27 s with its own sound ----------
  // Plays over the stage; Skip intro stops it (the run token), and if it can't play at all the drawn night
  // scene with captions runs instead.
  // One place to switch the cut (e.g. to a narrated version): the web-encoded file and its poster frame.
  const FILM = { src: 'game-assets/film/opening-avalanche.mp4', poster: 'game-assets/film/opening-avalanche.jpg' };
  let film = null;
  function stopFilm() { if (!film) return; const f = film; film = null; f.el.pause(); f.el.remove(); f.done(false); }
  function playFilm() {
    return new Promise((done) => {
      const el = document.createElement('video');
      el.id = 'film'; el.src = FILM.src; el.poster = FILM.poster;
      el.playsInline = true; el.preload = 'auto'; el.muted = !G.settings.sound;
      el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000;z-index:4;opacity:0;transition:opacity .6s';   // under #skip (z 5)
      (document.getElementById('stage') || document.body).appendChild(el);
      film = { el, done };
      const end = (ok) => { if (!film || film.el !== el) return; film = null; el.style.opacity = '0'; setTimeout(() => el.remove(), 650); done(ok); };
      el.addEventListener('ended', () => end(true));
      el.addEventListener('error', () => { L.warn('opening film failed to load'); end(false); });
      el.addEventListener('playing', () => (el.style.opacity = '1'), { once: true });
      el.play().catch(() => { el.muted = true; el.play().catch(() => end(false)); });   // autoplay rules: fall back to muted, then give up
      L.info('opening film');
    });
  }
  async function opening() {
    const r = ++run; skipBtn.hidden = false;
    UI.hideMenu(); UI.hud(false);
    window.AUDIO && AUDIO.music(null);
    E.beat = null; E.scene = null;
    if (await playFilm()) {
      if (r !== run) return;
      await UI.card(['07:00, the next morning.', 'The dining car.'], 1800); if (r !== run) return;
      return breakfast(r);
    }
    if (r !== run) return;
    window.AUDIO && AUDIO.music('avalanche');
    await E.load('night'); if (r !== run) return; await E.fadeIn(600);
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
  // The opening (user request, 26 Sept): you walk into breakfast and Castelli, your assistant for the day, runs in
  // at once to tell you about No. 7. You talk to him (ask where, who found him, or "take me there"), and he leads
  // you to the sleeping car, then follows you for the whole investigation.
  async function breakfast(r) {
    G.beat = 'breakfast'; E.beat = 'breakfast'; G.clock = toMin('07:00');
    window.AUDIO && AUDIO.music('breakfast');
    E.player = new E.Actor('sorel', 40, 540, 'right');
    E.lock = true;
    await E.load('dining'); if (r !== run) return; UI.hud(true); tickClock();
    E.actors.delete('castelli');                        // he isn't at breakfast: he's about to run in
    await E.fadeIn(500);
    await E.player.walkTo(300, 540, null, 3);
    await E.wait(900); if (r !== run) return;
    await castelliArrives(r);
  }

  async function castelliArrives(r) {
    E.lock = true; UI.hint(null); E.clearBubbles();
    const p = E.player; p.stop();
    // Step into the aisle (away from the tables) and leave him room by the door.
    const ax = Math.max(320, Math.min(1100, p.x)), ay = 548;
    if (Math.hypot(p.x - ax, p.y - ay) > 8) await p.walkTo(ax, ay, null, 5);
    const c = E.addActor('castelli', 30, ay, 'right');
    L.info('castelli arrives');
    window.AUDIO && (AUDIO.sfx('sting'), AUDIO.music(null, { fade: 1 }));
    E.say('castelli', 'Inspector! Inspector!', 1800, { alert: true });
    await c.walkTo(Math.max(120, p.x - 110), p.y, null, 7); if (r !== run) return;   // he comes right up to you first
    c.face(p); p.face(c);
    ['irina', 'ferrand', 'hale', 'mila', 'brandt'].forEach((id) => E.actors.get(id)?.face(c));
    await E.wait(250); E.clearBubbles();
    G.beat = 'alarm'; E.lock = false; skipBtn.hidden = true;
    talk.open('castelli');                              // he tells you; you answer (chips, typing or voice)
    await new Promise((res) => (G.flags.onLead = res)); if (r !== run) return;
    await E.fadeOut(500);
    window.AUDIO && AUDIO.sfx('reveal');
    await UI.card(['Castelli leads you to the sleeping car.', 'The door of No. 7 hangs open.', 'Anton Lazăr is dead in his berth.'], 3000); if (r !== run) return;
    await startInvestigation(r);
  }
  // "Take me there" (said to Castelli), or walking off towards the sleeping car: he leads you to No. 7.
  function lead() {
    if (G.beat !== 'alarm' || G.flags.led) return; G.flags.led = true;
    L.info('castelli leads the way');
    setTimeout(() => { if (talk.state.open) talk.close(); G.flags.onLead && G.flags.onLead(); }, talk.state.open ? 1600 : 0);
  }

  async function startInvestigation(r) {
    skipBtn.hidden = true; UI.hint(null); E.lock = true; if (talk.state.open) talk.close();
    G.beat = 'investigation'; E.beat = 'investigation'; G.clock = toMin('07:20'); BOARD.hud();
    window.AUDIO && AUDIO.music('investigation');
    await E.load('corridor', [700, 500, 'right']); if (r !== run) return; UI.hud(true); tickClock(); await E.fadeIn(500);
    E.lock = false;
    E.say('castelli', 'Here, Inspector. I stay close: call me whenever you need me.', 4200);
    window.SIDEKICK && SIDEKICK.hud();
    UI.toast('Need Castelli? Click his portrait (bottom right) or press C: he comes to you.', null, 'note');
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
    window.PROGRESS && PROGRESS.record((window.CASES && CASES[0] && CASES[0].id) || 'simplon-orient', verdict);   // remembered on the case postcard
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
  // Ask for the microphone as soon as the player presses Play, so the browser prompt never interrupts a
  // conversation later (user request). The stream is closed at once: this only grants the permission.
  let micAsked = false;
  function askMic() {
    if (micAsked || !navigator.mediaDevices || !G.server.voice) return; micAsked = true;
    navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => { s.getTracks().forEach((t) => t.stop()); L.info('microphone allowed'); })
      .catch((e) => L.warn('microphone refused', { error: e.name }));
  }
  function chooseCase() { askMic(); UI.cases(window.CASES || [], (c) => { if (c.ready) newGame(); }, title); }

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
