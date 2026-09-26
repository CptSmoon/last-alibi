// Castelli, the inspector's sidekick (live AI only, during the investigation).
// Talking to him goes to POST /api/sidekick (server/sidekick.mjs) instead of the normal interview: he answers
// from the CASE FILE (what you've found and heard) and his own knowledge, helps you think, and can run ONE errand
// at a time:
//   fetch      he leaves, finds the person, and walks back in with them (E.moved puts them in your room)
//   search     he searches a room and brings back every clue still there (they're learned as if you found them)
//   interview  he asks someone your question (POST /api/talk as that person), then reports; the answer also
//              becomes statements (engine/board.js)
// While he's away he isn't anywhere on the train (E.moved room null). He comes back to wherever you are.
// State lives in G.flags.side, so a new game resets it; timers check that object before acting.
(function () {
  const log = (window.LOG || { scope: () => console }).scope('sidekick');
  const GG = () => window.GAME && GAME.G, EE = () => window.ENGINE;
  const API = () => window.API_BASE || '';
  const name = (id) => (GG() && GG().names[id]) || id;
  const ROOM = { c1: 'compartment 1', c2: 'compartment 2', c3: 'compartment 3', c4: 'compartment 4', c5: 'compartment 5', c6: 'compartment 6', c7: 'compartment 7', corridor: 'the corridor', dining: 'the dining car', kitchen: 'the kitchen', lounge: 'the lounge car', outside: 'the snow outside' };
  const TIME = { fetch: 10000, search: 12000, interview: 9000 }; // real ms away; the game clock also moves on
  const CLOCK = { fetch: 6, search: 10, interview: 8 };

  const st = () => { const g = GG(); return g && (g.flags.side ||= { history: [], reports: [], errand: null, met: false }); };
  const live = () => { const g = GG(); return !!g && g.settings.brain === 'live' && g.server.brain; };
  const active = () => { const g = GG(); return !!g && (g.beat === 'investigation' || g.beat === 'alarm') && live(); };   // the AI sidekick
  const handles = () => { const g = GG(); return !!g && (g.beat === 'alarm' || active()); };                          // his lines, AI or canned
  // Without the AI (scripted mode), the opening still works with canned lines.
  const offline = () => ({ text: 'In compartment 7, Inspector, in the sleeping car. Théo found the door bolted from inside; we forced it. Come, I will take you there.', actions: [] });
  const away = () => !!(st() && st().errand);

  // ---------- the case file he sees ----------
  function clueRooms() {
    const g = GG(), out = {};
    for (const [id, sc] of Object.entries(window.SCENES || {})) {
      const n = (sc.spots || []).filter((s) => s.clues && (!s.beats || s.beats.includes('investigation'))).flatMap((s) => s.clues).filter((c) => !g.found.has(c)).length;
      if (n && ROOM[id]) out[id] = n;
    }
    return out;
  }
  function file() {
    const g = GG(), B = window.BOARD;
    const byId = (id) => B.claims.find((c) => c.id === id);
    return {
      found: [...g.items, ...g.notes],
      statements: B ? B.claims.map((c) => c.text) : [],
      contradictions: B ? B.contradictions.map((x) => `${byId(x.a).text} / ${byId(x.b).text}`) : [],
      reports: st().reports,
      questioned: Object.keys(g.per).filter((id) => (g.per[id].lines || []).some((l) => l.who === id)),
      unsearched: clueRooms(),
      away: false,
      phase: g.beat,
      // who is in the room with the inspector right now: never offer to fetch them
      room: window.ENGINE ? ENGINE.sceneId : null,
      here: window.ENGINE ? [...ENGINE.actors.keys()].filter((id) => id !== 'sorel' && id !== 'castelli') : [],
    };
  }

  // ---------- conversation ----------
  function greet() {
    const s = st();
    if (s.greetReport) { const r = s.greetReport; s.greetReport = null; return r; }
    if (GG().beat === 'alarm') return (GG().settings.playerName ? `Inspector ${GG().settings.playerName}!` : 'Inspector!') + ' The envoy, Signor Lazăr, is dead in compartment 7. The door was bolted from the inside; we had to force it.';
    if (!s.met) { s.met = true; return 'Inspector, I am at your service. I can fetch someone for you, search a room, or go and ask someone a question. Or we think it through together.'; }
    return s.reports.length ? 'Inspector? Shall I go somewhere else for you?' : 'Inspector. What can I do?';
  }
  async function ask(input) {
    const s = st(), g = GG();
    const r = await fetch(API() + '/api/sidekick', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input, now: g.clock, player: g.settings.playerName || '', history: s.history.slice(-16), file: file() }) });
    if (r.status === 429) return { text: 'Piano, Inspector: too many questions at once. A moment, please.', actions: [] };
    if (!r.ok) throw new Error('sidekick ' + r.status);
    const out = await r.json();
    if (!out.text && out.actions.length) out.text = going(out.actions[0]);
    s.history.push({ role: 'user', text: input }, { role: 'model', text: out.text || '...' });
    log.info('asked', { input: input.slice(0, 120), actions: out.actions.map((a) => a.kind + ':' + (a.person || a.room)) });
    return out;
  }
  const going = (a) => a.kind === 'fetch' ? `Subito, Inspector. I'll bring ${name(a.person)} to you.`
    : a.kind === 'search' ? `Sì, Inspector. I'll search ${ROOM[a.room]} and come straight back.`
      : `I'll go and ask ${name(a.person)}, Inspector, and tell you what they say.`;

  // ---------- errands ----------
  function run(a) {
    const s = st(), g = GG(), E = EE();
    if (s.errand) { UI.toast('Castelli is already on an errand.', null, 'note'); return false; }
    s.errand = { ...a, at: Date.now() };
    L('errand', a);
    // He walks out of the room and is nowhere until he comes back.
    if (E.follower === 'castelli') E.unfollow('castelli');
    const c = E.actors.get('castelli');
    E.moved.castelli = { beat: 'investigation', room: null, x: 0, y: 0, dir: 'front' };
    if (c) { const ex = exitPoint(E); c.seated = false; c.walkTo(ex[0], ex[1], () => E.actors.get('castelli') === c && E.actors.delete('castelli'), 7); }
    UI.toast(`Castelli: ${going(a).replace(/^[^.]+\. /, '')}`, null, 'note'); hud();
    const mine = s;
    const done = (report, extra, items) => { if (GG() && GG().flags.side === mine) back(a, report, extra, items); };
    if (a.kind === 'search') setTimeout(() => { const [rep, , got] = search(a.room); done(rep, null, got); }, TIME.search);
    else if (a.kind === 'fetch') setTimeout(() => done(`I found ${name(a.person)}. Here, Inspector.`, () => bring(a.person)), TIME.fetch);
    else if (a.kind === 'interview') {
      const t0 = Date.now();
      interview(a.person, a.question).then((ans) => setTimeout(() => done(ans ? `I asked ${name(a.person)}: "${a.question}" ${short(a.person)} said: "${ans}"` : `${name(a.person)} would not answer me, Inspector.`,
        () => ans && window.BOARD && BOARD.heard(a.person, a.question, ans)), Math.max(0, TIME.interview - (Date.now() - t0))));
    }
    return true;
  }
  const short = (id) => name(id).replace(/^(Dr|Countess|Major|Herr) /, '').split(' ')[0];
  const L = (m, d) => log.info(m, d);

  function search(room) {
    const g = GG(), sc = (window.SCENES || {})[room], got = [];
    for (const sp of (sc && sc.spots) || []) {
      if (!sp.clues || (sp.beats && !sp.beats.includes('investigation'))) continue;
      for (const id of sp.clues) if (!g.found.has(id)) { g.found.add(id); got.push(id); }
    }
    const names = got.map((id) => g.EV[id].name.replace(/^[^:]+: /, '')).map((n, i) => (i ? n.replace(/^The /, 'the ') : n));
    const list = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names.slice(-1) : names[0];
    const report = got.length ? `I searched ${ROOM[room]}, Inspector. I found ${list.replace(/^The /, 'the ')}. Here, I brought ${got.length > 1 ? 'them' : 'it'} to you.`
      : `I searched ${ROOM[room]} from top to bottom, Inspector. Nothing new there.`;
    return [report, null, got];
  }

  // Ask someone the inspector's question through the normal interview brain, as Castelli.
  async function interview(who, q) {
    const g = GG(), p = g.per[who];
    try {
      const r = await fetch(API() + '/api/talk', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ character: who, chapter: 'ch3', now: g.clock, player: g.settings.playerName || '', history: [], shown: [], revealed: [...p.revealed],
          input: { kind: 'say', text: `[DIRECTOR: This is not the inspector. Bruno Castelli, the chef de train, comes to you with a question from the inspector. Answer him as you would, knowing he will repeat it to the inspector.] ${q}` } }) });
      if (!r.ok || !r.body) throw new Error('talk ' + r.status);
      const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '', text = '';
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i; while ((i = buf.indexOf('\n\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 2);
          if (!line.startsWith('data:')) continue;
          const m = JSON.parse(line.slice(5));
          if (m.type === 'text') text += m.delta;
          else if (m.type === 'tool' && m.ok && m.name === 'reveal_secret' && m.unlock) { p.revealed.add(m.args.secret_id); GAME.learn(m.unlock); }
        }
      }
      return text.replace(/\s+/g, ' ').trim();
    } catch (e) { log.warn('interview failed', { who, error: String(e.message || e) }); return ''; }
  }

  // He (and whoever he brings) walks in from the nearest way in, and stops beside the inspector.
  function exitPoint(E) {
    const p = E.player, exits = (E.scene && E.scene.exits || []).filter((x) => E.hooks.exitOpen(x));
    const e = exits.sort((a, b) => Math.hypot(a.rect[0] - p.x, a.rect[1] - p.y) - Math.hypot(b.rect[0] - p.x, b.rect[1] - p.y))[0];
    return e ? E.nearestWalkable(e.rect[0] + e.rect[2] / 2, e.rect[1] + e.rect[3] / 2) : E.nearestWalkable(p.x + 300, p.y);
  }
  function arrive(who, dx) {
    const E = EE(), p = E.player; if (!p || !E.scene || E.scene.cinematic) return null;
    const [sx, sy] = exitPoint(E), [tx, ty] = E.nearestWalkable(p.x + dx, p.y + 4);
    E.moved[who] = { beat: 'investigation', room: E.sceneId, x: tx, y: ty, dir: 'front' };
    if (E.follower === who) E.unfollow(who);
    E.actors.delete(who);
    const a = E.addActor(who, sx, sy, 'front');
    a.walkTo(tx, ty, () => a.face(p), 6);
    return a;
  }
  function bring(who) { arrive(who, -150); UI.toast(`${name(who)} is here.`, null, 'note'); }
  // Back from an errand: he walks up to you, hands you what he found (the same close-up as finding it yourself,
  // then it's in your items / notebook), and tells you himself in a conversation (spoken with his voice).
  // A fetched person just walks in with him. If you're busy or elsewhere, it waits until he is next to you.
  function back(a, report, extra, items) {
    const s = st(), g = GG(), E = EE();
    s.errand = null; s.reports.push(report);
    g.clock += CLOCK[a.kind] || 6;
    arrive('castelli', 120); hud();   // back at your side; he stays in this room
    window.AUDIO && AUDIO.sfx('reveal');
    L('errand done', { kind: a.kind, items, report: report.slice(0, 160) });
    if (a.kind === 'fetch') { extra && extra(); E.say('castelli', report, 4000); return; }
    s.deliver = { report, items: items || [], extra };
    UI.toast('Castelli is back.', null, 'alert');
    const mine = s, t = setInterval(() => {
      if (!GG() || GG().flags.side !== mine || !s.deliver) return clearInterval(t);
      const c = E.actors.get('castelli'), p = E.player;
      if (!c || c.moving || !p || E.lock || UI.busy || GAME.talk.state.open || Math.hypot(c.x - p.x, c.y - p.y) > 320) return;
      clearInterval(t); deliver();
    }, 300);
  }
  async function deliver() {
    const s = st(), d = s.deliver; if (!d) return; s.deliver = null;
    const g = GG(), E = EE(), c = E.actors.get('castelli');
    c && c.face(E.player); d.extra && d.extra();
    for (const id of d.items) {
      const e = g.EV[id]; window.AUDIO && AUDIO.sfx('clue');
      await UI.examine({ title: e.name, icon: e.take ? id : null, text: `Castelli hands it to you. ${e.description}`, action: e.take ? 'Take it' : 'Note it' });
      GAME.learn(id);
    }
    s.greetReport = d.report;                       // his first line in the conversation that opens now
    GAME.talk.open('castelli');
  }

  const chips = () => GG().beat === 'alarm' ? ['Where was it?', 'Who found him?', 'Take me there.']
    : ['What should I do next?', 'Search a room for me', 'Gather everyone. I am ready to accuse.'];

  // ---------- the portrait bubble (bottom right) and C: call him from anywhere ----------
  const btn = document.createElement('button');
  btn.id = 'castelli-btn'; btn.hidden = true; btn.title = 'Castelli, your assistant (C)'; btn.setAttribute('aria-label', 'Call Castelli');
  btn.innerHTML = '<img src="game-assets/portraits/castelli-0.webp" alt=""><span class="k">C</span><span class="st"></span>';
  (document.getElementById('stage') || document.body).appendChild(btn);
  function hud() {
    const g = GG(), on = !!g && g.beat === 'investigation';
    btn.hidden = !on; if (!on) return;
    const e = st().errand;
    btn.classList.toggle('away', !!e);
    btn.querySelector('.st').textContent = e ? (e.kind === 'fetch' ? 'fetching ' + short(e.person) : e.kind === 'search' ? 'searching' : 'asking ' + short(e.person)) : '';
  }
  // He comes to you (if he isn't already beside you) and the conversation opens. He then stays in that room.
  function summon() {
    const g = GG(), E = EE(), T = GAME.talk.state;
    if (!g || g.beat !== 'investigation' || E.lock || T.open) return;
    if (away()) { UI.toast(`Castelli is out ${btn.querySelector('.st').textContent}. He'll be back soon.`, null, 'note'); return; }
    const c = E.actors.get('castelli'), p = E.player;
    const talkNow = (a) => { a.face(p); if (st().deliver) deliver(); else GAME.talk.open('castelli'); };
    if (c && Math.hypot(c.x - p.x, c.y - p.y) < 260) { talkNow(c); return; }
    L('summoned', { room: E.sceneId });
    const a = arrive('castelli', 110); if (!a) return;
    E.say('castelli', 'Sì, Inspector? I am coming!', 1800);
    const t = setInterval(() => { if (!a.moving) { clearInterval(t); if (!GAME.talk.state.open && !E.lock) talkNow(a); } }, 150);
  }
  btn.onclick = summon;
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyC' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = document.activeElement; if (t && ['INPUT', 'TEXTAREA'].includes(t.tagName)) return;
    if (window.UI && UI.busy) return; summon();
  });
  const css = document.createElement('style');
  css.textContent = `#castelli-btn { position: absolute; right: 1.2em; bottom: 1.2em; z-index: 3; width: 5.4em; height: 5.4em; padding: 0; border-radius: 50%; overflow: visible; cursor: pointer;
    border: .2em solid #e0a72e; background: #3a2414; box-shadow: 0 .3em .8em rgba(0,0,0,.45), 0 0 0 .25em rgba(240,196,106,.25); transition: transform .12s; }
  #castelli-btn img { width: 100%; height: 100%; object-fit: cover; object-position: top; border-radius: 50%; }
  #castelli-btn:hover { transform: scale(1.06); }
  #castelli-btn .k { position: absolute; left: -.3em; top: -.3em; font: 900 .85em var(--ui); background: #fff8e6; color: var(--ink); border: .12em solid var(--edge); border-radius: .35em; padding: 0 .35em; }
  #castelli-btn .st { position: absolute; left: 50%; bottom: -1.5em; transform: translateX(-50%); white-space: nowrap; font: 800 .8em var(--ui); color: #f5ead0; text-shadow: 0 .1em .3em #000; }
  #castelli-btn.away img { filter: grayscale(1) brightness(.6); } #castelli-btn.away { border-style: dashed; animation: none; }
  #dialog:not([hidden]) ~ #castelli-btn, #castelli-btn.hide-talk { display: none; }`;
  document.head.appendChild(css);

  window.SIDEKICK = { active, handles, offline, away, greet, ask, run, chips, file, hud, summon };
})();
