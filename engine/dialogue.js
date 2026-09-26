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
    const T = { open: false, who: null, busy: false, speech: null, abort: null, listening: false, listener: null, typer: null, asked: 0, used: {}, lastQ: '', full: '' };
    const P = () => G.per[T.who];
    const name = (id) => G.names[id] || id;
    const voiceOf = (id) => (CASE.characters.find((c) => c.id === id)?.voice || {}).gradium;
    const voiceMode = () => G.settings.brain === 'live' && G.settings.voice && G.server.voice;

    // ---- rendering ----
    function portrait(id, mood) { pic.src = `game-assets/portraits/${id}-${EXPR[mood] ?? 0}.webp`; pic.alt = name(id); }
    function speaker(id) { nm.textContent = name(id); box.dataset.who = id === 'sorel' ? 'you' : 'them'; portrait(id, id === 'sorel' ? 'calm' : P().mood); }
    function type(id, text, instant) {
      clearInterval(T.typer); speaker(id); txt.textContent = ''; T.full = text;
      if (instant) { txt.textContent = text; return; }
      let i = 0; T.typer = setInterval(() => { i += 2; txt.textContent = text.slice(0, i); if (i >= text.length) clearInterval(T.typer); }, 16);
    }
    function renderChips() {
      chips.innerHTML = '';
      if (P().done) return;
      const used = (T.used[T.who] ||= new Set());
      const list = T.who === 'castelli' && window.SIDEKICK && SIDEKICK.active() ? SIDEKICK.chips()
        : [...(T.who === 'castelli' && G.canGather() ? ['Gather everyone. I am ready to accuse.'] : []), ...((DEMO[T.who] || {}).ch3?.suggest || []).filter((s) => !used.has(s))].slice(0, 3);
      list.forEach((s, i) => { const b = document.createElement('button'); b.className = 'chip'; b.innerHTML = `<kbd>${i + 1}</kbd>${s}`; b.onclick = () => ask(s, true); chips.appendChild(b); });
    }
    // Immediate feedback: the box says who is thinking the moment you ask, even before the model answers.
    function thinking(on) {
      T.busy = on; box.classList.toggle('thinking', on);
      if (on && T.who) { clearInterval(T.typer); speaker(T.who); txt.textContent = `${name(T.who).replace(/^(Dr|Countess|Major|Herr) /, '')} is thinking`; }
    }
    // Skip: stop the voice and show the whole line (click the text, or Enter with nothing typed).
    function skip() {
      if (T.busy || T.listening) return;
      clearInterval(T.typer); if (T.full) txt.textContent = T.full;
      if (T.speech) { T.speech.cancel(); T.speech = null; } VOICE.player.flush();
    }

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
        // "Follow me" / "wait here" work with every character, even without a written topic.
        if (/\b(follow me|come with me|come along|show me|lead the way|accompany me|walk with me)\b/.test(l)) return reply({ r: 'Of course, Inspector. After you.', follow: true });
        if (/\b(wait here|stay here|stay put|you can go|go back|stop following|that will be all)\b/.test(l)) return reply({ r: 'Very well, Inspector. I shall wait here.', follow: false });
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
        if (h.follow != null) hooks.follow && hooks.follow(T.who, h.follow);
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
        let text = '', started = false;
        const speech = voiceMode() && voiceOf(who) ? (T.speech = new VOICE.Speech(voiceOf(who), {})) : null;
        const ctrl = new AbortController(); T.abort = ctrl;
        try {
          const r = await fetch((window.API_BASE || '') + '/api/talk', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctrl.signal,
            body: JSON.stringify({ character: who, chapter: 'ch3', now: G.clock, history: hist, input, shown: [...p.shown], revealed: [...p.revealed] }) });
          if (r.status === 429) { thinking(false); type(who, '(Too many questions at once on this network. Wait a few seconds and ask again.)', true); return; }
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
                if (!started) { started = true; thinking(false); clearInterval(T.typer); speaker(who); }
                // The whole text shows as it streams in (QA: reading is faster than listening); the voice follows.
                text += m.delta; T.full = txt.textContent = text.replace(/\s+/g, ' ').trim(); speech && !speech.cancelled && speech.text(m.delta);
              } else if (m.type === 'tool' && m.ok) {
                if (m.name === 'reveal_secret') reveal(m.args.secret_id, m.unlock);
                if (m.name === 'set_mood') mood(m.args.mood, m.args.trust);
                if (m.name === 'end_interview') p.done = true;
                if (m.name === 'follow_inspector') hooks.follow && hooks.follow(who, !!m.args.follow);
              } else if (m.type === 'done') { hist.push(...m.turns); if (text) { p.lines.push({ who, s: text.trim() }); hooks.speaking(who, text.trim()); hooks.said(who, input.kind === 'greet' ? '' : T.lastQ, text.trim()); } }
              else if (m.type === 'error') throw new Error(m.message);
            }
          }
          speech && !speech.cancelled && speech.end();
        } catch (e) { if (speech && speech === T.speech) speech.cancel(); if (e.name !== 'AbortError') { console.warn('[talk]', e); type(who, '...', true); } }
        finally { thinking(false); renderChips(); }
      },
      greet() {
        const p = P(), hist = (p.history.ch3 ||= []), g = scripted.d().greet;
        if (hist.length || !g) return this.turn({ kind: 'greet' });
        hist.push({ role: 'user', parts: [{ text: '[DIRECTOR: The inspector has just walked up to you. Greet him.]' }] }, { role: 'model', parts: [{ text: g }] });
        p.lines.push({ who: T.who, s: g }); hooks.speaking(T.who, g);
        if (voiceMode() && voiceOf(T.who)) { const sp = (T.speech = new VOICE.Speech(voiceOf(T.who), {})); sp.text(g); sp.end(); }
        type(T.who, g);
        renderChips();
      },
      ask(q) { return this.turn({ kind: 'say', text: q }); },
      present(ev) { return this.turn({ kind: 'present', evidence: ev }); },
      close() { T.abort && T.abort.abort(); T.speech && T.speech.cancel(); T.speech = null; },
    };
    // ---- Castelli as the inspector's sidekick (engine/sidekick.js, /api/sidekick): help, and errands ----
    const side = {
      say(text) {
        type('castelli', text); P().lines.push({ who: 'castelli', s: text });
        if (voiceMode() && voiceOf('castelli')) { const sp = (T.speech = new VOICE.Speech(voiceOf('castelli'), {})); sp.text(text); sp.end(); }
      },
      greet() { this.say(SIDEKICK.greet()); renderChips(); },
      async ask(q) {
        thinking(true);
        const r = await SIDEKICK.ask(q).catch((e) => { console.warn('[sidekick]', e); return null; });
        if (!T.open || T.who !== 'castelli') return;
        thinking(false);
        this.say((r && r.text) || 'Scusi, Ispettore, I did not follow. Again?');
        renderChips();
        // An errand: he leaves once he has said so.
        if (r && r.actions && r.actions[0] && SIDEKICK.run(r.actions[0])) setTimeout(() => T.open && T.who === 'castelli' && api.close(), 1600);
      },
      present(ev) { const e = CASE.evidence.find((x) => x.id === ev); return this.ask(`Look at this, Castelli: ${e.name}. ${e.description} What do you make of it?`); },
      close() { T.speech && T.speech.cancel(); T.speech = null; },
    };
    const brain = () => (G.settings.brain === 'live' && G.server.brain ? (T.who === 'castelli' && window.SIDEKICK && SIDEKICK.active() ? side : live) : scripted);

    // ---- actions ----
    function ask(q, quick) {
      q = (q || '').trim(); if (!q || !T.open || P().done || T.busy) return;
      if (quick) (T.used[T.who] ||= new Set()).add(q);
      if (T.who === 'castelli' && G.canGather() && /\b(gather|assemble)\b|ready to accuse|i('| a)m ready/i.test(q)) { type('sorel', q, true); setTimeout(() => hooks.gather(), 700); return; }
      T.asked++; T.lastQ = q; type('sorel', q, true); P().lines.push({ who: 'sorel', s: q });
      setTimeout(() => brain().ask(q), 350);
    }
    function present(ev) {
      if (!T.open || P().done || T.busy) return;
      T.asked++; P().shown.add(ev);
      const e = CASE.evidence.find((x) => x.id === ev);
      const line = e.take ? `Look at this: ${e.name.toLowerCase()}.` : `I know about this: ${e.name.replace(/^[^:]+: /, '').toLowerCase()}.`;
      T.lastQ = line; type('sorel', line, true); P().lines.push({ who: 'sorel', s: line }); hooks.shown(ev);
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
      if (q) ask(q); else { hooks.toast("Didn't catch that. Click Talk, speak, then click again."); type(T.who, P().lines.filter((l) => l.who === T.who).slice(-1)[0]?.s || '', true); }
    }

    // Leaving the game (Alt-Tab, another tab, another window) turns the microphone off at once: nothing more is
    // recorded or sent, and nothing is asked. Speaking again needs a new press of the mic.
    function micOff() {
      if (!T.listening) return; T.listening = false; box.classList.remove('listening');
      T.listener && T.listener.cancel(); T.listener = null;
      hooks.toast('Microphone off: the game lost focus.');
      if (T.open) type(T.who, P().lines.filter((l) => l.who === T.who).slice(-1)[0]?.s || '', true);
    }
    addEventListener('blur', micOff); document.addEventListener('visibilitychange', () => document.hidden && micOff());

    // ---- wiring ----
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { if (!input.value.trim()) skip(); else { ask(input.value); input.value = ''; } } if (e.key === 'Escape') input.blur(); });
    txt.addEventListener('click', skip); txt.title = 'Click to skip';
    $('#dlg-send').onclick = () => { ask(input.value); input.value = ''; };
    $('#dlg-leave').onclick = () => api.close();
    $('#dlg-show').onclick = () => hooks.openShow();
    // The mic is a toggle: one click (or Space) starts listening, the next one stops and asks.
    const mic = $('#dlg-mic');
    const micToggle = () => (T.listening ? micUp() : micDown());
    const micLabel = () => { mic.textContent = T.listening ? '■ Stop & ask' : '🎙 Talk'; mic.title = T.listening ? 'Click (or Space) when you have finished speaking' : 'Click (or press Space), speak, then click again'; };
    mic.addEventListener('click', (e) => { e.preventDefault(); micToggle(); });
    new MutationObserver(micLabel).observe(box, { attributes: true, attributeFilter: ['class'] }); micLabel();
    addEventListener('keydown', (e) => {
      if (!T.open || document.activeElement === input || hooks.panelOpen()) return;
      if (e.code === 'Space' && !e.repeat) { e.preventDefault(); micToggle(); }
      if (/^[1-3]$/.test(e.key)) { const b = chips.children[+e.key - 1]; b && b.click(); }
      if (e.key === 'Escape') api.close();
      if (e.key === 'Enter') skip();
      if (e.code === 'Tab') { e.preventDefault(); hooks.openShow(); }
      if (e.key.length === 1 && /[a-z]/i.test(e.key) && !e.metaKey && !e.ctrlKey && e.code !== 'Space') { input.focus(); }
    });

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
