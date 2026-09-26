// Conversations in the scene engine: a compact parchment box at the bottom of the stage.
// Portrait (expression follows mood) + name + what they say + what you ask (type, speak, quick question, show).
// The ENGINE owns the truth (what was shown to whom, which secrets are out, when the killer breaks);
// a brain only produces words. scripted = keyword answers (assets/demo-dialogue.js);
// live = Gemini on the server (/api/talk, SSE) + Gradium voice (assets/voice.js).
(function () {
  const $ = (s) => document.querySelector(s);
  const EXPR = { calm: 0, relieved: 0, nervous: 1, defensive: 1, grieving: 1, angry: 2, broken: 2 };

  function create(G, hooks) {
    const box = $('#dialog'), txt = $('#dlg-text'), nm = $('#dlg-name'), pic = $('#dlg-portrait'), chips = $('#dlg-chips'), input = $('#dlg-input');
    const T = { open: false, who: null, busy: false, speech: null, abort: null, listening: false, listener: null, typer: null, asked: 0, used: {} };
    const P = () => G.per[T.who];
    const name = (id) => G.names[id] || id;
    const voiceOf = (id) => (CASE.characters.find((c) => c.id === id)?.voice || {}).gradium;
    const voiceMode = () => G.settings.brain === 'live' && G.settings.voice && G.server.voice;

    // ---- rendering ----
    function portrait(id, mood) { pic.src = `game-assets/portraits/${id}-${EXPR[mood] ?? 0}.webp`; pic.alt = name(id); }
    function speaker(id) { nm.textContent = name(id); box.dataset.who = id === 'sorel' ? 'you' : 'them'; portrait(id, id === 'sorel' ? 'calm' : P().mood); }
    function type(id, text, instant) {
      clearInterval(T.typer); speaker(id); txt.textContent = '';
      if (instant) { txt.textContent = text; return; }
      let i = 0; T.typer = setInterval(() => { i += 2; txt.textContent = text.slice(0, i); if (i >= text.length) clearInterval(T.typer); }, 16);
    }
    // With voice on, the words appear as they are spoken (Gradium word timestamps), not ahead of them.
    function caption(sp, full, streaming) {
      clearInterval(T.typer);
      const tick = () => {
        if (sp.cancelled) return clearInterval(tm);
        const f = full().replace(/\s+/g, ' ').trim(), c = sp.caption(f);
        txt.textContent = c;
        if (!streaming() && c.length >= f.length) clearInterval(tm);
      };
      const tm = (T.typer = setInterval(tick, 40));
    }
    function renderChips() {
      chips.innerHTML = '';
      if (P().done) return;
      const used = (T.used[T.who] ||= new Set());
      const list = [...(T.who === 'castelli' && G.canGather() ? ['Gather everyone. I am ready to accuse.'] : []), ...((DEMO[T.who] || {}).ch3?.suggest || []).filter((s) => !used.has(s))].slice(0, 3);
      list.forEach((s, i) => { const b = document.createElement('button'); b.className = 'chip'; b.innerHTML = `<kbd>${i + 1}</kbd>${s}`; b.onclick = () => ask(s, true); chips.appendChild(b); });
    }
    function thinking(on) { T.busy = on; box.classList.toggle('thinking', on); }

    // ---- effects ----
    function reveal(secretId, unlock) {
      const p = P(); if (p.revealed.has(secretId)) return;
      p.revealed.add(secretId);
      if (secretId === CASE.confession.secretId) return hooks.confession(T.who);
      const ev = unlock || CASE.unlocks[secretId]; if (ev) hooks.learn(ev);
    }
    function mood(m, trust) { const p = P(); if (m) p.mood = m; if (trust != null) p.trust = Math.max(0, Math.min(5, trust)); portrait(T.who, p.mood); }
    const gateOpen = () => T.who === CASE.confession.character && !P().revealed.has(CASE.confession.secretId) && CASE.confession.needAnyThreeOf.filter((e) => P().shown.has(e)).length >= 3;

    // ---- scripted brain ----
    const scripted = {
      d: () => (DEMO[T.who] || {}).ch3 || { greet: '...', topics: [], evidence: {}, fallback: '...' },
      greet() { const d = this.d(); reply({ r: P().lines.length ? 'Inspector. Again?' : d.greet }, 150); },
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
    function reply(h, delay = 550) {
      thinking(true);
      setTimeout(() => {
        if (!T.open) return;
        thinking(false); if (h.mood || h.trust != null) mood(h.mood, h.trust);
        type(T.who, h.r); P().lines.push({ who: T.who, s: h.r }); hooks.speaking(T.who, h.r);
        if (h.reveal) reveal(h.reveal);
        renderChips();
      }, delay);
    }

    // ---- live brain ----
    const live = {
      async turn(input) {
        const who = T.who, p = P(), hist = (p.history.ch3 ||= []);
        thinking(true); T.speech && T.speech.cancel();
        // Open the voice now, while Gemini thinks: token + socket + setup are ready for the first sentence.
        let text = '', started = false, streaming = true;
        const speech = voiceMode() && voiceOf(who) ? (T.speech = new VOICE.Speech(voiceOf(who), {})) : null;
        const ctrl = new AbortController(); T.abort = ctrl;
        try {
          const r = await fetch((window.API_BASE || '') + '/api/talk', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctrl.signal,
            body: JSON.stringify({ character: who, chapter: 'ch3', now: G.clock, history: hist, input, shown: [...p.shown], revealed: [...p.revealed] }) });
          if (!r.ok || !r.body) throw new Error('talk ' + r.status);
          const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
          for (;;) {
            const { value, done } = await rd.read(); if (done) break;
            buf += dec.decode(value, { stream: true });
            let i; while ((i = buf.indexOf('\n\n')) >= 0) {
              const line = buf.slice(0, i).trim(); buf = buf.slice(i + 2);
              if (!line.startsWith('data:') || who !== T.who || !T.open) continue;
              const m = JSON.parse(line.slice(5));
              if (m.type === 'text') {
                if (!started) { started = true; thinking(false); clearInterval(T.typer); speaker(who); if (speech) caption(speech, () => text, () => streaming); }
                text += m.delta; if (!speech) txt.textContent = text.replace(/\s+/g, ' ').trim(); speech && speech.text(m.delta);
              } else if (m.type === 'tool' && m.ok) {
                if (m.name === 'reveal_secret') reveal(m.args.secret_id, m.unlock);
                if (m.name === 'set_mood') mood(m.args.mood, m.args.trust);
                if (m.name === 'end_interview') p.done = true;
              } else if (m.type === 'done') { hist.push(...m.turns); if (text) { p.lines.push({ who, s: text.trim() }); hooks.speaking(who, text.trim()); } }
              else if (m.type === 'error') throw new Error(m.message);
            }
          }
          speech && speech.end();
        } catch (e) { if (speech && speech === T.speech) speech.cancel(); if (e.name !== 'AbortError') { console.warn('[talk]', e); type(who, '...', true); } }
        finally { streaming = false; thinking(false); renderChips(); }
      },
      greet() {
        const p = P(), hist = (p.history.ch3 ||= []), g = scripted.d().greet;
        if (hist.length || !g) return this.turn({ kind: 'greet' });
        hist.push({ role: 'user', parts: [{ text: '[DIRECTOR: The inspector has just walked up to you. Greet him.]' }] }, { role: 'model', parts: [{ text: g }] });
        p.lines.push({ who: T.who, s: g }); hooks.speaking(T.who, g);
        if (voiceMode() && voiceOf(T.who)) { const sp = (T.speech = new VOICE.Speech(voiceOf(T.who), {})); sp.text(g); sp.end(); clearInterval(T.typer); speaker(T.who); caption(sp, () => g, () => false); }
        else type(T.who, g);
        renderChips();
      },
      ask(q) { return this.turn({ kind: 'say', text: q }); },
      present(ev) { return this.turn({ kind: 'present', evidence: ev }); },
      close() { T.abort && T.abort.abort(); T.speech && T.speech.cancel(); T.speech = null; },
    };
    const brain = () => (G.settings.brain === 'live' && G.server.brain ? live : scripted);

    // ---- actions ----
    function ask(q, quick) {
      q = (q || '').trim(); if (!q || !T.open || P().done || T.busy) return;
      if (quick) (T.used[T.who] ||= new Set()).add(q);
      if (T.who === 'castelli' && G.canGather() && /gather|accuse|ready|everyone|assemble/i.test(q)) { type('sorel', q, true); setTimeout(() => hooks.gather(), 700); return; }
      T.asked++; type('sorel', q, true); P().lines.push({ who: 'sorel', s: q });
      setTimeout(() => brain().ask(q), 350);
    }
    function present(ev) {
      if (!T.open || P().done || T.busy) return;
      T.asked++; P().shown.add(ev);
      const e = CASE.evidence.find((x) => x.id === ev);
      const line = e.take ? `Look at this: ${e.name.toLowerCase()}.` : `I know about this: ${e.name.replace(/^[^:]+: /, '').toLowerCase()}.`;
      type('sorel', line, true); P().lines.push({ who: 'sorel', s: line }); hooks.shown(ev);
      setTimeout(() => brain().present(ev), 350);
    }
    async function micDown() {
      if (!voiceMode() || T.listening || T.busy || !T.open) return;
      T.listening = true; box.classList.add('listening'); VOICE.player.flush(); T.speech && T.speech.cancel();
      speaker('sorel'); txt.textContent = 'Listening...';
      T.listener = new VOICE.Listener({ partial: (t) => (txt.textContent = t) });
      try { await T.listener.start(); } catch (e) { T.listening = false; box.classList.remove('listening'); hooks.toast('Microphone unavailable. Type your question instead.'); }
    }
    async function micUp() {
      if (!T.listening) return; T.listening = false; box.classList.remove('listening');
      const q = T.listener ? await T.listener.stop() : '';
      if (q) ask(q); else { hooks.toast("Didn't catch that. Hold the mic while you speak."); type(T.who, P().lines.filter((l) => l.who === T.who).slice(-1)[0]?.s || '', true); }
    }

    // ---- wiring ----
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { ask(input.value); input.value = ''; } if (e.key === 'Escape') input.blur(); });
    $('#dlg-send').onclick = () => { ask(input.value); input.value = ''; };
    $('#dlg-leave').onclick = () => api.close();
    $('#dlg-show').onclick = () => hooks.openShow();
    const mic = $('#dlg-mic');
    mic.addEventListener('pointerdown', (e) => { e.preventDefault(); micDown(); });
    addEventListener('pointerup', () => micUp());
    addEventListener('keydown', (e) => {
      if (!T.open || document.activeElement === input || hooks.panelOpen()) return;
      if (e.code === 'Space' && !e.repeat) { e.preventDefault(); micDown(); }
      if (/^[1-3]$/.test(e.key)) { const b = chips.children[+e.key - 1]; b && b.click(); }
      if (e.key === 'Escape') api.close();
      if (e.code === 'Tab') { e.preventDefault(); hooks.openShow(); }
      if (e.key.length === 1 && /[a-z]/i.test(e.key) && !e.metaKey && !e.ctrlKey && e.code !== 'Space') { input.focus(); }
    });
    addEventListener('keyup', (e) => { if (e.code === 'Space' && T.open) micUp(); });

    const api = {
      state: T,
      open(id) {
        T.open = true; T.who = id; T.asked = 0; box.hidden = false;
        box.classList.toggle('voice', voiceMode());
        speaker(id); txt.textContent = ''; renderChips();
        if (P().done) { type(id, 'I have nothing more to say to you, Inspector.'); return; }
        brain().greet();
      },
      close() {
        if (!T.open) return; brain().close(); VOICE.player.flush(); clearInterval(T.typer);
        T.open = false; box.hidden = true; const who = T.who, asked = T.asked; T.who = null; hooks.closed(who, asked);
      },
      present, ask,
    };
    return api;
  }
  window.DIALOGUE = { create };
})();
