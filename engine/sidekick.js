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
  const active = () => { const g = GG(); return !!g && g.beat === 'investigation' && g.settings.brain === 'live' && g.server.brain; };
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
    };
  }

  // ---------- conversation ----------
  function greet() {
    const s = st();
    if (!s.met) { s.met = true; return 'Ispettore, I am at your service. I can fetch someone for you, search a room, or go and ask someone a question. Or we think it through together.'; }
    return s.reports.length ? 'Ispettore? Shall I go somewhere else for you?' : 'Ispettore. What can I do?';
  }
  async function ask(input) {
    const s = st(), g = GG();
    const r = await fetch(API() + '/api/sidekick', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input, now: g.clock, history: s.history.slice(-16), file: file() }) });
    if (r.status === 429) return { text: 'Piano, Ispettore: too many questions at once. A moment, please.', actions: [] };
    if (!r.ok) throw new Error('sidekick ' + r.status);
    const out = await r.json();
    if (!out.text && out.actions.length) out.text = going(out.actions[0]);
    s.history.push({ role: 'user', text: input }, { role: 'model', text: out.text || '...' });
    log.info('asked', { input: input.slice(0, 120), actions: out.actions.map((a) => a.kind + ':' + (a.person || a.room)) });
    return out;
  }
  const going = (a) => a.kind === 'fetch' ? `Subito, Ispettore. I'll bring ${name(a.person)} to you.`
    : a.kind === 'search' ? `Sì, Ispettore. I'll search ${ROOM[a.room]} and come straight back.`
      : `I'll go and ask ${name(a.person)}, Ispettore, and tell you what they say.`;

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
    UI.toast(`Castelli: ${going(a).replace(/^[^.]+\. /, '')}`, null, 'note');
    const mine = s;
    const done = (report, extra) => { if (GG() && GG().flags.side === mine) back(a, report, extra); };
    if (a.kind === 'search') setTimeout(() => done(...search(a.room)), TIME.search);
    else if (a.kind === 'fetch') setTimeout(() => done(`I found ${name(a.person)}. Here, Ispettore.`, () => bring(a.person)), TIME.fetch);
    else if (a.kind === 'interview') {
      const t0 = Date.now();
      interview(a.person, a.question).then((ans) => setTimeout(() => done(ans ? `I asked ${name(a.person)}: "${a.question}" ${short(a.person)} said: "${ans}"` : `${name(a.person)} would not answer me, Ispettore.`,
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
    const names = got.map((id) => g.EV[id].name.replace(/^[^:]+: /, '').toLowerCase());
    const report = got.length ? `In ${ROOM[room]} I found: ${names.join(', ')}. I brought it all to you.` : `I searched ${ROOM[room]} from top to bottom, Ispettore. Nothing new there.`;
    return [report, () => got.forEach((id) => GAME.learn(id))];
  }

  // Ask someone the inspector's question through the normal interview brain, as Castelli.
  async function interview(who, q) {
    const g = GG(), p = g.per[who];
    try {
      const r = await fetch(API() + '/api/talk', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ character: who, chapter: 'ch3', now: g.clock, history: [], shown: [], revealed: [...p.revealed],
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
  function back(a, report, extra) {
    const s = st(), g = GG();
    s.errand = null; s.reports.push(report);
    g.clock += CLOCK[a.kind] || 6;
    arrive('castelli', 120);
    extra && extra();
    EE().say('castelli', report.length > 180 ? report.slice(0, 177) + '…' : report, 7000);
    UI.toast('Castelli is back: ' + (report.length > 110 ? report.slice(0, 107) + '…' : report), null, 'alert');
    window.AUDIO && AUDIO.sfx('reveal');
    L('errand done', { kind: a.kind, report: report.slice(0, 160) });
  }

  const chips = () => ['What should I do next?', 'Search a room for me', 'Gather everyone. I am ready to accuse.'];
  window.SIDEKICK = { active, away, greet, ask, run, chips, file };
})();
