// Interrogation engine + renderer. The ENGINE owns the truth (evidence held, what was shown to
// whom, which secrets are out, when the killer breaks); the "brain" only produces dialogue.
// Two brains share one interface: the scripted DEMO, and a real Gemini Live session.
(function () {
  const { rect, px, text, wrap, panel, nameTag, vgrad, dither, ellipse, rain, drawRain, blip } = PX;
  const W = 320, H = 180;
  const MOODC = { calm: 'mint', nervous: 'amber', angry: 'red', grieving: 'ice', defensive: 'lav', relieved: 'mint', broken: 'pink' };

  function drawSalon(b) {
    rect(b, 0, 0, W, H, 'ink');
    vgrad(b, 0, 0, W, 124, ['#12261f', '#1d3a30', '#12261f']);
    for (let x = 6; x < W; x += 34) { rect(b, x, 10, 28, 70, '#1d3a30'); rect(b, x, 10, 28, 1, 'brass'); rect(b, x, 79, 28, 1, 'dbrown'); rect(b, x, 10, 1, 70, 'brass'); rect(b, x + 27, 10, 1, 70, 'dbrown'); }
    rect(b, 0, 86, W, 38, 'dbrown'); rect(b, 0, 86, W, 2, 'brass');
    for (let x = 0; x < W; x += 20) rect(b, x, 90, 1, 34, 'brown');
    // window (panes animated) between portrait and notes
    rect(b, 132, 12, 60, 70, 'dbrown'); rect(b, 134, 14, 56, 66, 'cream');
    // standing lamp
    rect(b, 124, 40, 2, 70, 'brass'); for (let y = 0; y < 8; y++) rect(b, 120 - y / 2, 32 + y, 10 + y, 1, y < 2 ? 'gold' : 'amber');
    ellipse(b, 125, 110, 6, 2, 'brass');
    // back of the sofa
    rect(b, 112, 100, 94, 24, 'wine'); rect(b, 112, 100, 94, 3, 'wine2'); for (let x = 116; x < 204; x += 8) px(b, x, 106, 'gold');
  }

  function createEngine(canvas, opts = {}) {
    const ctx = canvas.getContext('2d');
    const bg = document.createElement('canvas'); bg.width = W; bg.height = H; drawSalon(bg.getContext('2d'));
    const pc = document.createElement('canvas'); pc.width = 48; pc.height = 48; const pctx = pc.getContext('2d');
    const drops = rain(30, { x: 135, y: 15, w: 54, h: 64 });
    const evName = Object.fromEntries(CASE.evidence.map((e) => [e.id, e.name]));
    const secretsOf = (id) => Object.keys(CASE.unlocks).filter((s) => s.includes('_' + id + '_')).length;
    const log = (dir, obj) => opts.onLog && opts.onLog(dir, obj);

    const S = {
      t: 0, char: 'emile', link: 'SIMULATED', busy: false, banner: 0, bannerText: '', bannerC: 'green',
      per: Object.fromEntries(CASE.characters.map((c) => [c.id, { mood: 'calm', trust: 2, shown: new Set(), revealed: new Set(), done: false }])),
      notebook: new Set(opts.startEvidence || []),
      line: null, queue: [], blink: 0, level: 0,
    };
    const P = () => S.per[S.char];
    const castName = (id) => (PORTRAITS.CAST[id] || {}).name || id;

    function show(name, str, who) { S.queue.push({ name, lines: wrap(str, 48), n: 0, who }); }
    function banner(str, c = 'green') { S.banner = 140; S.bannerText = str; S.bannerC = c; blip(880, 0.08, 0.04); }

    // ---- tool calls, identical for both brains ----
    function onTool(fc) {
      log('in', { toolCall: { functionCalls: [fc] } });
      const p = P(), a = fc.args || {};
      if (fc.name === 'reveal_secret' && !p.revealed.has(a.secret_id)) {
        p.revealed.add(a.secret_id);
        const ev = CASE.unlocks[a.secret_id];
        if (ev && !S.notebook.has(ev)) { S.notebook.add(ev); banner('NEW CLUE: ' + evName[ev]); opts.onNotebook && opts.onNotebook(ev); }
        else if (a.secret_id === 's_armand_confession') banner('CONFESSION', 'wine');
        else banner('SECRET REVEALED', 'blue');
      }
      if (fc.name === 'set_mood') { p.mood = a.mood || p.mood; if (a.trust != null) p.trust = a.trust; }
      if (fc.name === 'end_interview') { p.done = true; banner('INTERVIEW OVER', 'wine'); }
      opts.onState && opts.onState();
      return { ok: true };
    }

    // ---- brains ----
    const demo = {
      greet(id) { setTimeout(() => show(castName(id), DEMO[id].greet, id), 250); },
      ask(q) {
        const d = DEMO[S.char], p = P(), l = q.toLowerCase();
        log('out', { clientContent: { turns: [{ role: 'user', parts: [{ text: q }] }], turnComplete: true } });
        const hit = d.topics.find((tp) => tp.k.some((k) => l.includes(k)) && (!tp.needs || p.revealed.has(tp.needs)));
        reply(hit || { r: d.fallback });
      },
      present(ev) {
        const d = DEMO[S.char];
        log('out', { clientContent: { turns: [{ role: 'user', parts: [{ text: CASE.evidenceMessages[ev] }] }], turnComplete: true } });
        if (gateOpen()) { log('out', { clientContent: { turns: [{ role: 'user', parts: [{ text: CASE.confessionNote }] }], turnComplete: true } }); return reply({ r: d.confession, reveal: 's_armand_confession', mood: 'broken' }); }
        reply(d.evidence[ev] || { r: "I don't see what that has to do with me, Inspecteur." });
      },
      close() {},
    };
    function reply(h) {
      S.busy = true;
      setTimeout(() => {
        const id = S.char; show(castName(id), h.r, id); S.busy = false;
        if (h.mood || h.trust != null) onTool({ id: 'demo-' + S.t, name: 'set_mood', args: { mood: h.mood || P().mood, trust: h.trust } });
        if (h.reveal) onTool({ id: 'demo-' + S.t + 'r', name: 'reveal_secret', args: { secret_id: h.reveal } });
      }, 700);
    }
    // The engine, not the model, decides when the killer breaks.
    function gateOpen() {
      if (S.char !== CASE.confession.character) return false;
      const n = CASE.confession.needAnyThreeOf.filter((e) => P().shown.has(e)).length;
      return n >= 3 && !P().revealed.has('s_armand_confession');
    }

    let live = null; // { session, cur }
    const liveBrain = {
      async start(id) {
        if (live) live.session.close();
        const cur = { name: castName(id), text: '' };
        const session = new GeminiLive.LiveSession({
          apiKey: opts.apiKey, setup: GeminiLive.setupFrom(CASE.live[id]),
          on: {
            raw: (dir, m) => { if (!(m.realtimeInput && m.realtimeInput.audio) && !(m.serverContent && m.serverContent.modelTurn)) log(dir, m); },
            open: () => { S.link = 'GEMINI LIVE'; opts.onState && opts.onState(); session.say('[DIRECTOR: The Inspecteur has just sat down in front of you in the petit salon. Greet them in one sentence, in character.]'); },
            text: (role, delta) => {
              if (role === 'user') { S.youLive = (S.youLive || '') + delta; return; }
              if (!cur.item) { cur.item = { name: cur.name, lines: [], n: 0, who: id, live: true, raw: '' }; S.queue.push(cur.item); }
              cur.item.raw += delta; cur.item.lines = wrap(cur.item.raw, 48);
            },
            turn: () => { cur.item = null; if (S.youLive) { opts.onYou && opts.onYou(S.youLive); S.youLive = ''; } },
            tool: onTool,
            close: () => { S.link = 'OFFLINE'; opts.onState && opts.onState(); },
            error: () => { S.link = 'ERROR'; opts.onState && opts.onState(); },
          },
        });
        live = { session, cur };
        S.link = 'CONNECTING'; opts.onState && opts.onState();
        await session.connect();
      },
      ask(q) { live && live.session.say(q); },
      present(ev) {
        if (!live) return;
        // One message, one turn: two turnComplete messages in a row would interrupt each other.
        live.session.say(CASE.evidenceMessages[ev] + (gateOpen() ? '\n' + CASE.confessionNote : ''));
      },
      close() { live && live.session.close(); live = null; },
    };
    let brain = demo;

    // ---- API used by the page ----
    const api = {
      state: S,
      select(id) { brain.close && brain === liveBrain && brain.close(); S.char = id; S.queue = []; S.line = null; if (brain === liveBrain) liveBrain.start(id).catch(() => {}); else demo.greet(id); opts.onState && opts.onState(); },
      ask(q) { if (!q.trim() || P().done) return; show('INSPECTEUR ROUX', q, 'roux'); brain.ask(q); },
      present(ev) { if (P().done) return; P().shown.add(ev); show('INSPECTEUR ROUX', 'Look at this: ' + evName[ev] + '.', 'roux'); brain.present(ev); opts.onState && opts.onState(); },
      async goLive(key) { opts.apiKey = key; brain = liveBrain; S.queue = []; S.line = null; await liveBrain.start(S.char); },
      goDemo() { liveBrain.close(); brain = demo; S.link = 'SIMULATED'; api.select(S.char); },
      talkStart() { if (brain === liveBrain && live) return live.session.talkStart(); },
      talkEnd() { if (brain === liveBrain && live) live.session.talkEnd(); },
      isLive: () => brain === liveBrain,
      secretsOf,
      frame,
    };

    function frame() {
      const t = ++S.t, p = P();
      ctx.drawImage(bg, 0, 0);
      vgrad(ctx, 135, 15, 54, 64, ['#0b0a14', '#232845']); drawRain(ctx, drops, { x: 135, y: 15, w: 54, h: 64 });
      rect(ctx, 161, 15, 2, 64, 'cream'); rect(ctx, 135, 46, 54, 2, 'cream');
      if (Math.random() < 0.003) dither(ctx, 135, 15, 54, 64, 'rgba(0,0,0,0)', 'white', 0.5);

      // current line: typewriter (demo) or streamed transcript (live)
      if (!S.line || (S.line.n >= S.line.lines.join('').length && !S.line.live && S.queue.length && t - (S.line.doneAt || t) > 30)) {
        if (S.queue.length) S.line = S.queue.shift();
      }
      const L = S.line;
      let talking = false;
      if (L) {
        const total = L.lines.join('').length;
        if (L.n < total) { L.n += L.who === 'roux' ? 2 : 0.9; talking = L.who === S.char; if ((L.n | 0) % 4 === 0 && L.who !== 'roux' && brain === demo) blip(180 + (L.who.length * 37) % 120, 0.02, 0.01); }
        else if (!L.doneAt) L.doneAt = t;
        if (L.live && S.queue.length && L.n >= total) S.line = S.queue.shift();
      }
      let mouth = 0;
      if (brain === liveBrain && live) { const lv = live.session.player.speaking ? live.session.player.level() : 0; S.level = lv; mouth = lv > 0.25 ? 2 : lv > 0.06 ? 1 : 0; }
      else if (talking) mouth = [0, 1, 2, 1][(t >> 2) % 4];
      if (--S.blink < -120 - Math.random() * 60) S.blink = 6;

      // portrait
      PORTRAITS.draw(pctx, S.char, 0, 0, { mouth, blink: S.blink > 0, mood: p.mood, t });
      rect(ctx, 10, 8, 102, 102, 'ink'); rect(ctx, 11, 9, 100, 100, 'gold'); rect(ctx, 12, 10, 98, 98, 'brass');
      ctx.imageSmoothingEnabled = false; ctx.drawImage(pc, 13, 11, 96, 96);
      const nm = castName(S.char);
      rect(ctx, 10, 110, 102, 11, 'ink'); text(ctx, nm.length > 16 ? nm.split(' ')[0] : nm, 61, 112, 'gold', { align: 'center' });

      // notes panel
      panel(ctx, 200, 6, 116, 114, { fill: 'navy' });
      text(ctx, 'MOOD', 207, 13, 'lgrey'); text(ctx, p.mood.toUpperCase(), 238, 13, MOODC[p.mood] || 'cream');
      text(ctx, 'TRUST', 207, 25, 'lgrey'); for (let i = 0; i < 5; i++) text(ctx, '♥', 244 + i * 7, 25, i < p.trust ? 'red' : 'dgrey');
      text(ctx, 'SECRETS', 207, 37, 'lgrey'); text(ctx, p.revealed.size + '/' + secretsTotal(S.char), 256, 37, 'amber');
      text(ctx, 'SHOWN', 207, 49, 'lgrey'); text(ctx, String(p.shown.size), 256, 49, 'amber');
      text(ctx, 'CLUES', 207, 61, 'lgrey'); text(ctx, String(S.notebook.size), 256, 61, 'amber');
      rect(ctx, 205, 72, 106, 1, 'brass');
      const lc = S.link === 'GEMINI LIVE' ? 'mint' : S.link === 'SIMULATED' ? 'amber' : 'red';
      text(ctx, 'LINK', 207, 77, 'lgrey'); if (t % 50 < 35) px(ctx, 234, 80, lc), px(ctx, 235, 80, lc), px(ctx, 234, 81, lc), px(ctx, 235, 81, lc);
      text(ctx, S.link, 207, 87, lc);
      // voice meter
      const lvl = brain === liveBrain ? S.level : talking ? 0.3 + 0.3 * Math.sin(t / 3) : 0;
      for (let i = 0; i < 14; i++) { const on = i / 14 < lvl * 1.6; rect(ctx, 207 + i * 7, 96, 5, 7, on ? (i > 10 ? 'red' : i > 7 ? 'amber' : 'mint') : 'dgrey'); }
      text(ctx, S.busy ? 'THINKING...' : talking || S.level > 0.05 ? 'SPEAKING' : 'LISTENING', 207, 107, S.busy ? 'amber' : 'lgrey');

      if (S.banner > 0) { S.banner--; const bw = PX.measure(S.bannerText) + 12, bx = (W - bw) / 2; panel(ctx, bx, 50, bw, 15, { fill: S.bannerC }); text(ctx, S.bannerText, bx + 6, 54, 'white'); }

      // dialogue box (shows the last 4 lines as it types)
      panel(ctx, 3, 128, 314, 50);
      if (L) {
        nameTag(ctx, L.name.toUpperCase(), 10, 121, L.who === 'roux' ? 'ice' : 'amber');
        const vis = PX.typed(L.lines, L.n | 0), from = Math.max(0, vis.length - 4);
        vis.slice(from).forEach((l, i) => text(ctx, l, 12, 136 + i * 9, L.who === 'roux' ? 'ice' : 'cream'));
        if (L.n >= L.lines.join('').length && t % 40 < 24) text(ctx, '▼', 304, 169, 'amber');
      }
      if (p.done) text(ctx, 'THIS WITNESS WILL NOT SPEAK AGAIN TONIGHT.', 160, 169, 'red', { align: 'center' });
    }
    const secretsTotal = (id) => ({ helene: 2, lucien: 3, solange: 2, armand: 3, margot: 2, emile: 2 }[id] || 0);

    return api;
  }

  window.INTERROGATION = { createEngine, drawSalon };
})();
