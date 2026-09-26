// The case board: what makes the goal and the evidence visible (QA pass, 26 Sept).
// - Statements: after every live answer, POST /api/claims (server/claims.mjs) turns what the person said into
//   claims (who, where, when). They are kept for the whole game and listed in the notebook's "Statements" tab.
// - Contradictions: two claims about the same person, at overlapping times, in different places. Found here,
//   deterministically (no model): flagged with a toast, listed first in the tab, and usable in a conversation
//   (Show… > Statements) to confront someone.
// - Case strength: how many of the case's key proofs you hold (CASE.accusation.requires.evidenceAnyThreeOf),
//   shown on the HUD from the start, so "a strong case" means something before you accuse.
// - The briefing (what you're here to do) and the readiness check before an accusation.
// Loaded after engine/ui.js and before engine/game.js; reads the game lazily through window.GAME.
(function () {
  const log = (window.LOG || { scope: () => console }).scope('board');
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const G = () => window.GAME && GAME.G;
  const nameOf = (id) => (G() && G().names[id]) || id;
  const toMin = (s) => { const [h, m] = s.split(':').map(Number); return (h < 12 ? h + 24 : h) * 60 + m; };
  const fmt = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const PLACE = { c1: 'compartment 1', c2: 'compartment 2', c3: 'compartment 3', c4: 'compartment 4', c5: 'compartment 5', c6: 'compartment 6', c7: 'compartment 7', corridor: 'the corridor', dining: 'the dining car', lounge: 'the lounge car', outside: 'outside' };
  const SLACK = 10; // minutes: two moments this close together count as "the same time"

  let S = { seq: 0, claims: [], contra: [] };
  const reset = () => { S = { seq: 0, claims: [], contra: [] }; hud(); };

  // ---------- statements ----------
  async function heard(speaker, question, answer) {
    const g = G(); if (!g || !answer || !g.server.brain) return;
    try {
      const r = await fetch((window.API_BASE || '') + '/api/claims', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ speaker, question, answer }) });
      if (!r.ok) throw new Error('status ' + r.status);
      const { claims = [] } = await r.json();
      for (const c of claims) add({ ...c, speaker, clock: g.clock });
    } catch (e) { log.warn('could not record statements', { speaker, error: String(e.message || e) }); }
  }
  function add(c) {
    // the same claim twice (a repeated question) is kept once
    if (S.claims.some((x) => x.speaker === c.speaker && x.about === c.about && x.place === c.place && x.from === c.from && x.to === c.to)) return;
    const claim = { id: 's' + ++S.seq, ...c };
    S.claims.push(claim);
    log.info('statement', { id: claim.id, speaker: c.speaker, about: c.about, place: c.place, from: c.from, to: c.to });
    const found = S.claims.filter((o) => o !== claim && clash(o, claim)).map((o) => ({ a: o.id, b: claim.id }));
    for (const x of found) S.contra.push(x);
    const n = found.length;
    if (n) {
      const o = byId(found[0].a);
      window.AUDIO && AUDIO.sfx('sting');
      UI.toast(o.speaker === claim.speaker ? `Contradiction: ${short(claim.speaker)} just changed their story about ${claim.about === claim.speaker ? 'where they were' : nameOf(claim.about)}`
        : `Contradiction: ${short(o.speaker)} and ${short(claim.speaker)} disagree about ${nameOf(claim.about)}`, null, 'alert');
      log.info('contradiction', { a: o.id, b: claim.id });
    } else UI.toast('Statement noted: ' + claim.text, null, 'note');
    hud();
  }
  const byId = (id) => S.claims.find((c) => c.id === id);
  const short = (id) => (nameOf(id) || '').replace(/^(Dr|Countess|Major|Herr) /, '').split(' ').slice(-1)[0];
  function span(c) { if (!c.from) return null; const a = toMin(c.from), b = c.to ? toMin(c.to) : a; return [Math.min(a, b), Math.max(a, b)]; }
  // Same person, overlapping times, two different places: both can't be true.
  function clash(x, y) {
    if (x.about !== y.about || x.about === 'unknown' || x.place === 'unknown' || y.place === 'unknown' || x.place === y.place) return false;
    const a = span(x), b = span(y); if (!a || !b) return false;
    return a[0] <= b[1] + SLACK && b[0] <= a[1] + SLACK;
  }
  const when = (c) => (c.from ? (c.to && c.to !== c.from ? `${c.from}–${c.to}` : c.from) : '');

  function renderStatements(el) {
    const g = G();
    if (!S.claims.length) {
      el.innerHTML = `<p class="nb-empty">No statements yet. Question people: whatever they tell you about where someone was, and when, is written down here.${g && !g.server.brain ? '<br><b>Statements need Live AI characters (Settings).</b>' : ''}</p>`;
      return;
    }
    let html = '';
    if (S.contra.length) {
      html += `<div class="nb-sec"><h5>Contradictions (${S.contra.length})</h5>${S.contra.map((x) => { const a = byId(x.a), b = byId(x.b);
        return `<div class="contra"><b>⚠ ${esc(nameOf(a.about))}: ${esc(PLACE[a.place])} or ${esc(PLACE[b.place])}?</b><p>${esc(a.text)}</p><p>${esc(b.text)}</p><small>One of them is wrong, or lying. In a conversation: <b>Show…</b> › Statements to confront them.</small></div>`; }).join('')}</div>`;
    }
    const speakers = [...new Set(S.claims.map((c) => c.speaker))];
    html += speakers.map((sp) => `<div class="nb-sec"><h5>${esc(nameOf(sp))}</h5><ul>${S.claims.filter((c) => c.speaker === sp).map((c) => {
      const hot = S.contra.some((x) => x.a === c.id || x.b === c.id);
      return `<li class="stmt${hot ? ' hot' : ''}">${when(c) ? `<span class="t">${esc(when(c))}</span>` : ''}${esc(c.text)}<span class="at">told at ${esc(fmt(c.clock))}</span></li>`; }).join('')}</ul></div>`).join('');
    el.innerHTML = html;
  }
  // For "Show…": statements you can put to someone (not their own).
  const confrontable = (who) => S.claims.filter((c) => c.speaker !== who);
  const confrontLine = (c) => `${nameOf(c.speaker)} told me this: ${c.text.replace(/^[^ ]+ says /, '')} How do you explain that?`;

  // ---------- case strength ----------
  function strength() {
    const g = G(), key = (window.CASE && CASE.accusation.requires.evidenceAnyThreeOf) || [];
    const n = g ? key.filter((id) => g.items.includes(id) || g.notes.includes(id)).length : 0;
    const label = n >= 5 ? 'Strong' : n >= 3 ? 'Fair' : n >= 1 ? 'Weak' : 'No case yet';
    return { n, of: key.length, label, tone: n >= 5 ? 'strong' : n >= 3 ? 'fair' : 'weak' };
  }
  function hud() {
    const el = $('#casepill'), bulb = $('#btn-brief'); if (!el) return;
    const g = G(), on = g && g.beat === 'investigation';
    el.hidden = !on; if (bulb) { bulb.hidden = !on; bulb.classList.remove('blink'); }   // no blinking (QA): the bulb just sits there if (!on) return;
    const s = strength();
    el.className = 'parch ' + s.tone;
    el.innerHTML = `<span class="lab">Case</span><span class="dots">${Array.from({ length: s.of }, (_, i) => `<i class="${i < s.n ? 'on' : ''}"></i>`).join('')}</span><b>${s.n}/${s.of}</b><span class="lab">${esc(s.label)}</span>${S.contra.length ? `<span class="warn" title="Contradictions found">⚠ ${S.contra.length}</span>` : ''}`;
  }

  // ---------- briefing: a popup over the game, opened from the HUD bulb (it blinks until the first time) ----------
  const STEPS = [
    ['Investigate', 'Search compartment 7 and the rest of the train: walk up to a ✦ sparkle and press <kbd>E</kbd>. The map (<kbd>M</kbd>) takes you back to any room you\'ve visited.'],
    ['Question', 'Walk up to anyone and press <kbd>E</kbd>. Type your questions or use 🎙 Talk. What they tell you about who was where, and when, goes into your notebook (<kbd>J</kbd>) › Statements.'],
    ['Compare', 'When two statements can\'t both be true, you\'ll see ⚠. In a conversation, use <b>Show…</b> › Statements to confront them: someone is lying.'],
    ['Accuse', 'Ask <b>Castelli</b> to gather everyone. Point at the killer, then say or type <b>why</b> they did it and <b>three things you found</b> that prove it.'],
  ];
  function briefing() {
    return new Promise((res) => {
      const g = G(); if (g) { g.flags.briefed = true; hud(); }
      const b = $('#brief'); b.hidden = false; b.classList.add('pop');
      b.innerHTML = `<div class="inner parch"><button class="x" id="brief-x" aria-label="Close">×</button><p class="kick">Your case · A murder on the Simplon-Orient</p>
        <h2>Who killed Anton Lazăr, and why?</h2>
        <p class="lede">The envoy was found dead behind a bolted door. The doctor says his heart stopped. You don't believe it. The carabinieri board the relief train at <b>10:00</b>: by then you must name the killer and prove it.</p>
        <ol class="steps">${STEPS.map(([t, d], i) => `<li><span class="n">${i + 1}</span><div><b>${t}</b><p>${d}</p></div></li>`).join('')}</ol>
        <div class="meter"><b>Case strength</b> (top right) counts the proofs you hold that can convict. The magistrate weighs your words: the wrong motive, or fewer than three real proofs, and your suspect walks free.</div>
        <button class="go" id="brief-go">Got it</button></div>`;
      const done = () => { b.hidden = true; b.classList.remove('pop'); b.onclick = null; removeEventListener('keydown', key, true); res(); };
      const key = (e) => { if (['Enter', 'Escape', 'Space'].includes(e.code)) { e.preventDefault(); e.stopPropagation(); done(); } };
      addEventListener('keydown', key, true); $('#brief-go').onclick = $('#brief-x').onclick = done; $('#brief-go').focus();
      b.onclick = (e) => { if (e.target === b) done(); }; // click outside the card closes it
    });
  }

  // ---------- readiness, before the accusation ----------
  // Resolves true to accuse, false to keep investigating (only offered while there is time left).
  function readiness({ canWait }) {
    return new Promise((res) => {
      const s = strength(), b = $('#brief'); b.hidden = false; b.classList.remove('pop');
      const verdict = s.n >= 5 ? 'Your case is strong. Choose your three proofs carefully.'
        : s.n >= 3 ? 'Your case could hold, if you name the right motive and choose your proofs well.'
          : 'Your case is too weak. The magistrate will almost certainly let your suspect go.';
      b.innerHTML = `<div class="inner parch ready ${s.tone}"><p class="kick">Before you accuse</p><h2>Case strength: ${s.n}/${s.of} · ${esc(s.label)}</h2>
        <div class="bar"><i style="width:${Math.round((s.n / s.of) * 100)}%"></i></div>
        <p class="lede">${verdict}</p>
        <ul class="need"><li><b>Who</b> killed Anton Lazăr</li><li><b>Why</b>: the motive</li><li><b>Three proofs</b> that point at them</li></ul>
        ${S.contra.length ? `<p class="note">You found ${S.contra.length} contradiction${S.contra.length > 1 ? 's' : ''}. Have you asked about ${S.contra.length > 1 ? 'them' : 'it'}?</p>` : ''}
        <div class="row">${canWait ? '<button class="pill" id="rd-wait">Keep investigating</button>' : '<span class="late">10:00. The relief train is here: it\'s now or never.</span>'}<button class="go" id="rd-go">${s.n >= 3 ? 'Make the accusation' : 'Accuse anyway'}</button></div></div>`;
      const done = (v) => { b.hidden = true; res(v); };
      $('#rd-go').onclick = () => done(true);
      if (canWait) { $('#rd-wait').onclick = () => done(false); $('#rd-wait').focus(); } else $('#rd-go').focus();
    });
  }

  // ---------- styles ----------
  const css = `
#casepill { position: absolute; right: 1em; top: 4.1em; display: flex; align-items: center; gap: .45em; padding: .3em .8em; font: 800 .9em var(--ui); cursor: pointer; }
#casepill .lab { font-weight: 700; color: var(--muted); } #casepill .dots { display: flex; gap: .18em; }
#casepill .dots i { width: .62em; height: .62em; border-radius: 50%; background: rgba(58,36,20,.18); border: .08em solid rgba(58,36,20,.35); }
#casepill.weak .dots i.on { background: var(--red); } #casepill.fair .dots i.on { background: #d9962b; } #casepill.strong .dots i.on { background: var(--green); }
#casepill .warn { color: var(--wine); }
#toasts { top: 6.9em !important; }
#brief { position: absolute; inset: 0; z-index: 4; background: rgba(18,11,7,.8); display: grid; place-items: center; }
#brief .inner { position: relative; width: 52em; padding: 1.4em 1.8em; }
#brief.pop { background: rgba(18,11,7,.35); } #brief.pop .inner { width: 46em; font-size: .92em; animation: pop-in .22s cubic-bezier(.2,1.3,.4,1) both; }
@keyframes pop-in { from { transform: scale(.9); opacity: 0; } }
#brief .x { position: absolute; top: .5em; right: .6em; width: 1.8em; height: 1.8em; border-radius: 50%; border: .12em solid var(--edge); background: #fff8e6; font: 900 1.1em/1 var(--ui); color: var(--ink); cursor: pointer; }
#btn-brief.blink { animation: bulb 1.1s ease-in-out infinite; }
@keyframes bulb { 50% { background: #f7d77f; color: #7a2236; border-color: #e0a72e; box-shadow: 0 0 1.1em .35em rgba(247,215,127,.85); } }
#brief .kick { margin: 0; font: 800 .8em var(--ui); letter-spacing: .14em; text-transform: uppercase; color: var(--wine); }
#brief h2 { margin: .15em 0 .4em; font: 900 1.9em/1.15 var(--ui); }
#brief .lede { font: 600 1.08em/1.45 var(--ui); margin: 0 0 .9em; }
#brief .steps { list-style: none; margin: 0 0 .9em; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: .6em; }
#brief .steps li { display: flex; gap: .6em; padding: .6em .7em; background: #fff8e6; border: .12em solid var(--edge); border-radius: .45em; }
#brief .steps .n { flex: none; width: 1.8em; height: 1.8em; border-radius: 50%; display: grid; place-items: center; background: var(--wine); color: #f5ead0; font: 900 .95em var(--ui); }
#brief .steps b { font: 900 1em var(--ui); } #brief .steps p { margin: .15em 0 0; font: 600 .88em/1.35 var(--ui); }
#brief .meter { font: 600 .9em/1.4 var(--ui); padding: .5em .7em; border-left: .3em solid #d9962b; background: rgba(240,196,106,.18); margin-bottom: 1em; }
#brief .go { display: block; margin: 0 auto; }
#brief .bar { height: .7em; border-radius: .35em; background: rgba(58,36,20,.15); overflow: hidden; margin-bottom: .8em; } #brief .bar i { display: block; height: 100%; }
#brief .weak .bar i { background: var(--red); } #brief .fair .bar i { background: #d9962b; } #brief .strong .bar i { background: var(--green); }
#brief .need { margin: 0 0 .8em; padding-left: 1.2em; font: 600 1em/1.5 var(--ui); } #brief .note { font: 700 .95em var(--ui); color: var(--wine); }
#brief .row { display: flex; justify-content: space-between; align-items: center; gap: 1em; margin-top: 1em; } #brief .row .go { margin: 0; } #brief .late { font: 800 .95em var(--ui); color: var(--red); }
.contra { padding: .5em .7em; margin-bottom: .45em; background: #fbe3dc; border: .12em solid var(--red); border-radius: .4em; }
.contra b { font: 900 .95em var(--ui); color: var(--red); } .contra p { margin: .25em 0; font: 600 .9em/1.35 var(--ui); } .contra small { font: 600 .8em var(--ui); color: var(--muted); }
.stmt { display: flex; gap: .5em; align-items: baseline; } .stmt .t { flex: none; font: 900 .85em var(--ui); color: #35557a; font-variant-numeric: tabular-nums; }
.stmt .at { margin-left: auto; flex: none; font: 600 .75em var(--ui); color: var(--muted); } .stmt.hot { color: var(--red); }
.nb-count.warn { background: var(--red); }
.show-sec { margin: .8em 0 .3em; font: 900 .8em var(--ui); letter-spacing: .1em; text-transform: uppercase; color: var(--wine); }
.show-stmts { display: grid; gap: .35em; max-height: 11em; overflow: auto; }
.show-stmts button { text-align: left; font: 600 .9em/1.35 var(--ui); padding: .45em .7em; background: #fff8e6; border: .12em solid var(--edge); border-radius: .4em; cursor: pointer; color: var(--ink); }
.show-stmts button:hover { border-color: #e0a72e; background: #fff; } .show-stmts button.hot { border-color: var(--red); }`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  window.BOARD = { heard, add, reset, strength, hud, briefing, readiness, renderStatements, confrontable, confrontLine, get claims() { return S.claims; }, get contradictions() { return S.contra; }, clash };
})();
