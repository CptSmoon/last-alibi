// Conversations, opened by walking up to someone and pressing E. A small box at the bottom of the
// screen: their portrait and name, what they say, and what you ask (typed, spoken, or a quick question).
// The ENGINE (this file + game.js) owns the truth: what was shown to whom, which secrets are out,
// when the killer breaks. A "brain" only produces words. Two brains, one interface:
//   scripted - keyword answers (assets/demo-dialogue.js), works offline
//   live     - Gemini on the server (/api/talk, SSE) + Gradium voice in the browser (voice.js)
(function () {
  const LOGT = (window.LOG || { scope: () => console }).scope('talk');
  const { rect, text, wrap, panel, nameTag, blip, measure } = PX;
  const BX = 6, BY = 124, BW = 308, BH = 52, TX = 62, CHARS = 40;
  const cname = (id) => (id === 'sorel' ? 'Inspector Sorel' : (PORTRAITS.CAST[id] || {}).name || id);

  function create(G, hooks) {
    const pc = document.createElement('canvas'); pc.width = pc.height = 48; const pctx = pc.getContext('2d');
    const T = { open: false, who: null, queue: [], line: null, busy: false, blink: 0, t: 0, listening: false, partial: '', brain: 'scripted', asked: 0, speech: null, abort: null, buf: '', usedQuick: {} };
    const P = () => G.per[T.who];
    const show = (who, str, live) => { const it = { who, lines: wrap(str, CHARS), n: 0, live, raw: str }; T.queue.push(it); return it; };
    const log = (who, str) => { P().lines.push({ who, s: str }); };

    function reveal(secretId, unlock) {
      const p = P(); if (p.revealed.has(secretId)) return;
      p.revealed.add(secretId);
      const ev = unlock || CASE.unlocks[secretId];
      LOGT.info('secret revealed', { who: T.who, secret: secretId, unlocks: ev || null, confession: secretId === CASE.confession.secretId });
      if (secretId === CASE.confession.secretId) hooks.confession();
      else if (ev) hooks.clue(ev);
    }
    function mood(m, trust) { const p = P(); LOGT.debug('mood', { who: T.who, mood: m, trust }); if (m) p.mood = m; if (trust != null) p.trust = Math.max(0, Math.min(5, trust)); }
    const gateOpen = () => T.who === CASE.confession.character && G.ch.phase === 'after' && !P().revealed.has(CASE.confession.secretId)
      && CASE.confession.needAnyThreeOf.filter((e) => P().shown.has(e)).length >= 3;

    // ---- scripted brain ----
    const scripted = {
      d() { return (DEMO[T.who] || {}).ch3 || { greet: '...', topics: [], evidence: {}, fallback: '...' }; },
      greet() { const d = this.d(); reply({ r: P().lines.length ? 'Inspector. Again?' : d.greet }, 250); },
      ask(q) {
        const d = this.d(), p = P(), l = q.toLowerCase();
        const ok = (tp) => tp.k.some((k) => l.includes(k)) && (!tp.needs || p.revealed.has(tp.needs));
        reply(d.topics.find((tp) => ok(tp) && (!tp.reveal || !p.revealed.has(tp.reveal))) || d.topics.find(ok) || { r: d.fallback });
      },
      present(ev) {
        if (gateOpen()) return reply({ r: DEMO[T.who].confession, reveal: CASE.confession.secretId, mood: 'broken' });
        reply(this.d().evidence[ev] || { r: "I don't see what that has to do with me, Inspector." });
      },
      close() {},
    };
    function reply(h, delay = 600) {
      T.busy = true;
      setTimeout(() => {
        if (!T.open) return;
        T.busy = false; show(T.who, h.r); log(T.who, h.r);
        if (h.mood || h.trust != null) mood(h.mood, h.trust);
        if (h.reveal) reveal(h.reveal);
      }, delay);
    }

    // ---- live brain: Gemini on the server, Gradium voice here ----
    const voiceOf = (who) => (CASE.characters.find((c) => c.id === who).voice || {}).gradium;
    const live = {
      async turn(input) {
        const who = T.who, p = P(), chId = G.ch.id, hist = (p.history[chId] ||= []);
        T.busy = true; if (T.speech) T.speech.cancel();
        // Open the voice now, while Gemini thinks, so the first sentence is spoken without waiting for a socket.
        let item = null; const speech = G.settings.voice && voiceOf(who) ? (T.speech = new VOICE.Speech(voiceOf(who), {})) : null;
        const ctrl = new AbortController(); T.abort = ctrl;
        const t0 = performance.now(); let first = 0;
        LOGT.info('live turn', { who, chapter: chId, clock: G.clock, kind: input.kind, evidence: input.evidence, history: hist.length });
        try {
          const r = await fetch('/api/talk', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctrl.signal,
            body: JSON.stringify({ character: who, chapter: chId, now: G.clock, history: hist, input, shown: [...p.shown], revealed: [...p.revealed] }) });
          if (!r.ok || !r.body) { let why = ''; try { why = (await r.json()).error; } catch (_) {} throw new Error(`talk ${r.status}${why ? ': ' + why : ''}`); }
          const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
          for (;;) {
            const { value, done } = await rd.read(); if (done) break;
            buf += dec.decode(value, { stream: true });
            let i; while ((i = buf.indexOf('\n\n')) >= 0) {
              const line = buf.slice(0, i).trim(); buf = buf.slice(i + 2);
              if (!line.startsWith('data:')) continue;
              const m = JSON.parse(line.slice(5));
              if (who !== T.who || !T.open) continue;
              if (m.type === 'text') {
                if (!first) { first = performance.now(); LOGT.debug('first words', { who, ms: Math.round(first - t0) }); }
                T.busy = false;
                if (!item) { item = show(who, '', true); item.speech = speech; }
                item.raw += m.delta; item.lines = wrap(item.raw.replace(/\s+/g, ' ').trim(), CHARS);
                speech && speech.text(m.delta);
              } else if (m.type === 'tool') {
                LOGT[m.ok ? 'info' : 'warn'](m.ok ? 'tool' : 'tool rejected by server', { who, name: m.name, args: m.args });
                if (!m.ok) continue;
                if (m.name === 'reveal_secret') reveal(m.args.secret_id, m.unlock);
                if (m.name === 'set_mood') mood(m.args.mood, m.args.trust);
                if (m.name === 'end_interview') p.done = true;
              } else if (m.type === 'done') {
                hist.push(...m.turns);
                LOGT.info('live turn done', { who, ms: Math.round(performance.now() - t0), chars: item ? item.raw.length : 0, gateOpen: !!m.gateOpen });
                if (item) { item.done = true; log(who, item.raw.trim()); }
              } else if (m.type === 'error') throw new Error(m.message);
            }
          }
          speech && speech.end();
        } catch (e) {
          if (speech && speech === T.speech) speech.cancel();
          if (e.name === 'AbortError') LOGT.debug('live turn aborted', { who });
          else { LOGT.error('live turn failed', { who, error: String(e.message || e) }); show(who, '...'); }
        } finally { T.busy = false; }
      },
      // First meeting in a chapter: the written greeting plays at once and goes into the history.
      greet() {
        const p = P(), hist = (p.history[G.ch.id] ||= []), g = scripted.d().greet;
        if (hist.length || !g) return this.turn({ kind: 'greet' });
        hist.push({ role: 'user', parts: [{ text: '[DIRECTOR: The inspector has just walked up to you. Greet him.]' }] }, { role: 'model', parts: [{ text: g }] });
        const it = show(T.who, g, true); it.done = true; log(T.who, g);
        if (G.settings.voice && voiceOf(T.who)) { const sp = (T.speech = it.speech = new VOICE.Speech(voiceOf(T.who), {})); sp.text(g); sp.end(); }
      },
      ask(q) { return this.turn({ kind: 'say', text: q }); },
      present(ev) { return this.turn({ kind: 'present', evidence: ev }); },
      close() { T.abort && T.abort.abort(); T.speech && T.speech.cancel(); T.speech = null; },
    };
    const brain = () => (T.brain === 'live' ? live : scripted);
    const voiceMode = () => T.brain === 'live' && G.settings.voice;

    const GATHER = 'Gather everyone. I am ready to accuse.';
    const canGather = () => T.who === 'castelli' && G.ch.id === 'ch3';
    function suggestions() {
      if (!T.who) return [];
      const used = (T.usedQuick[T.who] ||= new Set());
      const list = ((DEMO[T.who] || {}).ch3?.suggest || []).filter((s) => !used.has(s));
      return (canGather() ? [GATHER, ...list] : list).slice(0, 3);
    }
    const yourTurn = () => !T.busy && !T.listening && !T.queue.length && (!T.line || T.line.n >= T.line.lines.join('').length);

    const api = {
      state: T,
      open(id) {
        LOGT.info('open', { who: id, brain: T.brain, voice: voiceMode(), chapter: G.ch && G.ch.id });
        T.open = true; T.who = id; T.queue = []; T.line = null; T.asked = 0; T.partial = ''; T.buf = '';
        if (P().done) { LOGT.info('refuses to talk (interview ended)', { who: id }); show(id, 'I have nothing more to say to you, Inspector.'); return; }
        brain().greet();
      },
      close() { if (!T.open) return 0; LOGT.info('close', { who: T.who, asked: T.asked }); brain().close(); VOICE.player.flush(); T.open = false; const asked = T.asked; T.who = null; T.buf = ''; return asked; },
      ask(q) {
        q = (q || '').trim(); if (!q || !T.open || P().done || T.busy) return;
        T.asked++; T.queue = []; T.line = null; show('sorel', q); log('sorel', q);
        LOGT.info('ask', { who: T.who, brain: T.brain, q }); brain().ask(q);
        if (canGather() && /gather|accuse|everyone|assemble|ready/i.test(q)) hooks.gather();
      },
      quick(i) { const s = suggestions()[i]; if (!s || T.busy) return; if (s !== GATHER) T.usedQuick[T.who].add(s); api.ask(s); },
      present(ev) {
        if (!T.open || P().done || T.busy) return;
        T.asked++; P().shown.add(ev);
        LOGT.info('present', { who: T.who, evidence: ev, gateOpen: gateOpen() });
        const e = CASE.evidence.find((x) => x.id === ev);
        const line = e.take ? `Look at this: ${e.name.toLowerCase()}.` : `I know about this: ${e.name.replace(/^[^:]+: /, '').toLowerCase()}.`;
        T.queue = []; T.line = null; show('sorel', line); log('sorel', line); brain().present(ev);
      },
      type(ch) { if (T.buf.length < 160) T.buf += ch; },
      backspace() { T.buf = T.buf.slice(0, -1); },
      submit() { const q = T.buf; T.buf = ''; api.ask(q); },
      async talkStart() {
        if (T.listening || !T.open || T.busy || !voiceMode()) return;
        T.listening = true; T.partial = '';
        VOICE.player.flush(); T.speech && T.speech.cancel();
        T.listener = new VOICE.Listener({ partial: (t) => (T.partial = t) });
        try { await T.listener.start(); } catch (e) { LOGT.warn('push-to-talk failed', { error: String(e.message || e) }); T.listening = false; hooks.toast('Microphone unavailable. Type instead.'); }
      },
      async talkEnd() {
        if (!T.listening) return; T.listening = false;
        const q = T.listener ? await T.listener.stop() : ''; T.partial = '';
        if (q) api.ask(q); else hooks.toast("Didn't catch that. Hold SPACE while you speak.");
      },
      setBrain(b) { if (T.brain !== b) LOGT.info('brain', { brain: b }); T.brain = b; },
      voiceMode, suggestions, yourTurn, gateOpen,
      frame,
    };

    function frame(ctx) {
      const t = ++T.t;
      if (!T.line || (T.line.n >= T.line.lines.join('').length && (T.line.done || !T.line.live) && T.queue.length && t - (T.line.doneAt || t) > 20)) {
        if (T.queue.length) T.line = T.queue.shift();
      }
      const L = T.line; let talking = false;
      if (L) {
        const total = L.lines.join('').length;
        if (L.n < total) {
          // With voice, type in step with the spoken words (Gradium word timestamps); otherwise at a fixed pace.
          if (L.speech && !L.speech.cancelled) { const raw = L.raw.replace(/\s+/g, ' ').trim(); if (raw) L.n = Math.max(L.n, total * L.speech.caption(raw).length / raw.length); }
          else L.n += L.who === 'sorel' ? 3 : L.live && voiceMode() ? 0.3 : 0.9;
          talking = L.who !== 'sorel';
          if (!(L.live && voiceMode()) && (L.n | 0) % 4 === 0 && L.who !== 'sorel' && G.settings.sound) blip(170 + (L.who.length * 37) % 120, 0.02, 0.006);
        } else if (!L.doneAt) L.doneAt = t;
      }
      const typing = T.buf.length > 0 || T.listening;
      const speaker = typing ? 'sorel' : L ? L.who : T.who;
      let mouth = 0;
      const lv = VOICE.player.level();
      if (speaker !== 'sorel') { if (VOICE.player.speaking) mouth = lv > 0.2 ? 2 : lv > 0.05 ? 1 : 0; else if (talking) mouth = [0, 1, 2, 1][(t >> 2) % 4]; }
      if (--T.blink < -120 - Math.random() * 60) T.blink = 6;

      // quick questions: your turn, nothing typed yet
      const qs = suggestions();
      if (yourTurn() && !typing && qs.length && !P().done) {
        const h = qs.length * 9 + 5, y = BY - h - 14, w = Math.min(BW, Math.max(...qs.map((q) => measure(q.slice(0, 48)))) + 22);
        rect(ctx, BX, y, w, h, 'rgba(11,10,20,.82)');
        qs.forEach((q, i) => { text(ctx, String(i + 1), BX + 4, y + 3 + i * 9, '#f0b54a'); text(ctx, q.slice(0, 48), BX + 14, y + 3 + i * 9, '#d8c9a3'); });
      }
      panel(ctx, BX, BY, BW, BH, { fill: 'navy' });
      PORTRAITS.draw(pctx, speaker, 0, 0, { mouth, blink: T.blink > 0, mood: speaker !== 'sorel' && P().mood === 'broken' ? 'broken' : 'calm', t });
      ctx.drawImage(pc, BX + 3, BY + 2);
      nameTag(ctx, cname(speaker).toUpperCase(), BX + 2, BY - 11, speaker === 'sorel' ? 'ice' : 'amber');
      let lines = [], col = '#f3ead2';
      if (T.listening) { lines = wrap(T.partial || 'Listening...', CHARS).slice(-4); col = '#9cc0e4'; if (t % 30 < 18) rect(ctx, BX + BW - 10, BY + 6, 4, 4, '#c93a48'); }
      else if (T.buf) { lines = wrap(T.buf + (t % 40 < 20 ? '_' : ' '), CHARS).slice(-4); col = '#9cc0e4'; }
      else if (L) { const vis = PX.typed(L.lines, L.n | 0); lines = vis.slice(Math.max(0, vis.length - 4)); col = L.who === 'sorel' ? '#9cc0e4' : '#f3ead2'; }
      if (T.busy && !typing && (!L || (L.who === 'sorel' && L.n >= L.lines.join('').length))) { lines = ['.'.repeat(1 + ((t >> 4) % 3))]; col = '#f0b54a'; }
      lines.forEach((l, i) => text(ctx, l, TX, BY + 5 + i * 9, col));
      const hint = P().done ? 'ESC: LEAVE' : T.buf ? 'ENTER: ASK  ESC: CLEAR' : (voiceMode() ? 'HOLD SPACE: SPEAK  ' : '') + 'TYPE: ASK  TAB: SHOW  ESC';
      text(ctx, hint, BX + BW - 4 - measure(hint), BY + BH - 10, '#6b6a7a');
    }
    return api;
  }

  window.TALK = { create };
})();
