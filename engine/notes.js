// Quick notes: the inspector's own jottings, and a secretary that tidies them.
// - N (or the pencil button) opens a small parchment input anywhere; in a conversation use Alt+N (or Ctrl+N)
//   or the "Note" button. Enter saves, Esc cancels. Click the mic button to dictate and again to stop (or Space while the note is still
//   empty) to dictate, when Gradium voice is on.
// - Each note keeps the game clock, the room, and who you were talking to. Stored in localStorage
//   ('simplon-notes'), cleared by a new game.
// - The notebook gets a "My notes" tab: raw notes (newest first, deletable) and the organised view.
//   Organising calls POST /api/notes/organize (Gemini, public facts only; see server/notes.mjs), and falls back
//   to a simple local grouping (by person mentioned and by time) when there is no server or no Gemini key.
// Loaded after assets/log.js and before engine/game.js; reads the game lazily through window.GAME.
(function () {
  const log = (window.LOG || { scope: () => console }).scope('notes');
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KEY = 'simplon-notes';
  const PEOPLE = ['lazar', 'ferrand', 'irina', 'hale', 'mila', 'brandt', 'theo', 'castelli', 'cook'];
  const ALIAS = {
    lazar: /\b(lazar|lazăr|envoy|victim|anton)\b/i, ferrand: /\b(ferrand|doctor|doc|dr\.?|physician)\b/i, irina: /\b(irina|countess|voss)\b/i,
    hale: /\b(hale|major)\b/i, mila: /\b(mila|novak|singer)\b/i, brandt: /\b(brandt|stefan)\b/i, theo: /\b(th[eé]o|conductor)\b/i, castelli: /\b(castelli|chef de train|bruno)\b/i,
    cook: /\b(luigi|cook|mancuso|kitchen)\b/i,
  };
  const TIME_RE = /\b([01]?\d|2[0-3])[:h.]([0-5]\d)\b/;
  const G = () => window.GAME && GAME.G;
  const fmt = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const order = (t) => { const m = TIME_RE.exec(t || ''); if (!m) return 1e9; const h = +m[1]; return (h < 12 ? h + 24 : h) * 60 + +m[2]; };
  const nameOf = (id) => (G() && G().names[id]) || (id === 'other' ? 'Others' : id);
  const MAX_NOTES = 80, MAX_CHARS = 400;

  // ---------- store ----------
  let S = { seq: 0, notes: [], org: null };
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && Array.isArray(s.notes)) S = { seq: s.seq || s.notes.length, notes: s.notes, org: s.org || null }; } catch (_) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) {} };
  const hashOf = () => { let h = 0; for (const c of JSON.stringify(S.notes.map((n) => [n.id, n.text]))) h = (h * 31 + c.charCodeAt(0)) | 0; return String(h); };

  function where() {
    const E = window.ENGINE, g = G(), t = window.GAME && GAME.talk.state;
    return { clock: g ? fmt(g.clock) : null, min: g ? g.clock : null, scene: E && E.sceneId || null, place: E && E.scene ? E.scene.name : null, who: t && t.open ? t.who : null };
  }
  function add(text, via = 'typed') {
    text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);
    if (!text) return null;
    if (S.notes.length >= MAX_NOTES) { window.UI && UI.toast(`The notebook is full (${MAX_NOTES} notes). Delete some first.`, null, 'alert'); return null; }
    const n = { id: 'n' + ++S.seq, text, t: Date.now(), via, ...where() };
    S.notes.push(n); save();
    log.info('note added', { id: n.id, chars: text.length, clock: n.clock, scene: n.scene, who: n.who, via });
    log.debug('note text', { id: n.id, text });
    changed();
    return n;
  }
  function remove(id) { S.notes = S.notes.filter((n) => n.id !== id); save(); log.info('note deleted', { id, left: S.notes.length }); changed(); }
  function reset() { S = { seq: 0, notes: [], org: null }; save(); log.info('notes cleared (new game)'); }

  // ---------- organising ----------
  let inflight = null, timer = null;
  function localOrganize() {
    const people = {}, timeline = [], questions = [];
    for (const n of S.notes) {
      const ids = PEOPLE.filter((id) => ALIAS[id].test(n.text));
      if (n.who && !ids.includes(n.who)) ids.push(n.who);
      for (const id of ids.length ? ids : ['other']) (people[id] ||= []).push({ text: n.text, sources: [n.id] });
      const m = TIME_RE.exec(n.text); if (m) timeline.push({ time: `${m[1].padStart(2, '0')}:${m[2]}`, event: n.text, sources: [n.id] });
      if (n.text.includes('?')) questions.push({ kind: 'open', text: n.text, sources: [n.id] });
    }
    timeline.sort((a, b) => order(a.time) - order(b.time));
    return { summary: '', people: [...PEOPLE, 'other'].filter((id) => people[id]).map((id) => ({ person: id, points: people[id] })), timeline, questions, leads: [] };
  }
  async function organize({ force = false } = {}) {
    const g = G(), hash = hashOf();
    if (!S.notes.length) { S.org = null; save(); return null; }
    if (!force && S.org && S.org.hash === hash && (S.org.ai || !(g && g.server.brain))) return S.org;
    if (inflight && inflight.hash === hash) return inflight.p;
    const p = (async () => {
      let org;
      if (g && g.server.brain) {
        const t0 = performance.now();
        const body = { notes: S.notes.map((n) => ({ id: n.id, text: n.text, clock: n.clock, place: n.place, with: n.who ? nameOf(n.who) : undefined })),
          facts: [...g.items, ...g.notes], people: PEOPLE };
        log.info('organize start', { notes: body.notes.length, facts: body.facts.length });
        try {
          const r = await fetch((window.API_BASE || '') + '/api/notes/organize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
          org = { hash, ai: true, model: j.model, at: g.clock, result: j };
          log.info('organize done', { model: j.model, people: j.people.length, timeline: j.timeline.length, questions: j.questions.length, leads: j.leads.length, ms: Math.round(performance.now() - t0) });
        } catch (e) {
          log.warn('organize failed, sorting locally', { error: String(e.message || e) });
          org = { hash, ai: false, at: g.clock, error: 'The secretary could not be reached, so the notes are sorted simply, on this device.', result: localOrganize() };
        }
      } else {
        org = { hash, ai: false, at: g ? g.clock : null, error: 'Sorted simply, on this device. AI organising needs the game server (npm start) with a Gemini key.', result: localOrganize() };
        log.info('organized locally', { notes: S.notes.length });
      }
      if (hashOf() === hash) { S.org = org; save(); }
      return org;
    })();
    inflight = { hash, p };
    try { return await p; } finally { if (inflight && inflight.p === p) inflight = null; }
  }
  // Auto re-organise, debounced, only while the notes tab is on screen and only when the notes changed.
  function schedule(ms = 900) {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (!mount || !mount.isConnected || $('#panel').hidden || !S.notes.length) return;
      if (S.org && S.org.hash === hashOf() && (S.org.ai || !G().server.brain)) return;
      renderOrg(true); await organize(); if (mount && mount.isConnected) renderOrg();
    }, ms);
  }
  function changed() { if (mount && mount.isConnected) { renderList(); renderOrg(); schedule(1500); } }

  // ---------- quick-note popup ----------
  let pop, popIn, popMic, listener = null, listening = false, dictBase = '';
  const voiceOn = () => { const g = G(); return !!(g && g.server.voice && g.settings.voice && window.VOICE && VOICE.Listener); };
  function build() {
    const css = document.createElement('style');
    css.textContent = `
#qnote { position: absolute; left: 1em; top: 5em; width: 27em; padding: .7em .8em .6em; display: grid; gap: .45em; z-index: 5; animation: tin .2s ease-out; }
#qnote .qmeta { font: 800 .8em var(--ui); color: var(--muted); letter-spacing: .02em; }
#qnote .qmeta b { color: var(--wine); }
#qnote .qrow { display: flex; gap: .4em; align-items: center; }
#qnote input, .nb-add input { flex: 1; min-width: 0; font: 600 1em var(--ui); padding: .5em .8em; border: .12em solid var(--edge); border-radius: .4em; background: #fffdf5; color: var(--ink); }
#qnote .qhelp { font: 600 .75em var(--ui); color: var(--muted); }
#qnote.listening #qn-mic { background: var(--red); color: #fff; }
.nb-tabs { position: sticky; top: 0; z-index: 1; display: flex; gap: .4em; padding-bottom: .6em; background: linear-gradient(#f1e2c2 80%, rgba(241,226,194,0)); }
.nb-tabs button { font: 800 .92em var(--ui); padding: .4em 1em; border-radius: .4em; border: .12em solid var(--edge); background: #fff8e6; color: var(--ink); cursor: pointer; }
.nb-tabs button.on { background: #f0c46a; border-color: var(--edge2); }
.nb-count { display: inline-block; min-width: 1.4em; margin-left: .3em; padding: 0 .35em; border-radius: 1em; background: var(--wine); color: #f5ead0; font-size: .8em; }
.nb-notes { display: grid; grid-template-columns: 19em 1fr; gap: 1em; align-items: start; }
.nb-notes > div:first-child { position: sticky; top: 2.8em; max-height: 27em; overflow: auto; padding-right: .2em; }
.nb-add { display: flex; gap: .4em; margin-bottom: .6em; }
.nb-list { display: grid; gap: .45em; }
.qn { position: relative; padding: .45em 1.9em .5em .7em; background: #fff8e6; border: .12em solid var(--edge); border-radius: .4em; font: 600 .9em/1.35 var(--ui); transition: background .3s, border-color .3s; }
.qn .qmeta { display: block; font: 800 .78em var(--ui); color: var(--muted); margin-bottom: .1em; }
.qn .qmeta b { color: var(--wine); font-variant-numeric: tabular-nums; }
.qn .qdel { position: absolute; right: .35em; top: .3em; width: 1.4em; height: 1.4em; padding: 0; border: 0; border-radius: .3em; background: none; color: var(--muted); font: 900 1em var(--ui); cursor: pointer; }
.qn .qdel:hover { background: #f3d9c9; color: var(--red); }
.qn.flash { background: #fff; border-color: #e0a72e; box-shadow: 0 0 0 .15em #f0c46a; }
.nb-orghead { display: flex; justify-content: space-between; align-items: center; gap: .6em; margin-bottom: .4em; }
.nb-orghead h4 { margin: 0; font: 900 1.05em var(--ui); }
.nb-status { font: 600 .82em/1.35 var(--ui); color: var(--muted); margin: 0 0 .6em; }
.nb-status.warn { color: var(--wine); }
.nb-summary { font: 700 .95em/1.4 var(--ui); font-style: italic; margin: 0 0 .7em; color: #35557a; }
.nb-sec { margin: 0 0 .8em; }
.nb-sec h5 { margin: 0 0 .35em; font: 900 .8em var(--ui); letter-spacing: .1em; text-transform: uppercase; color: var(--wine); border-bottom: .1em solid rgba(180,137,61,.4); padding-bottom: .15em; }
.nb-sec ul { margin: 0; padding: 0; list-style: none; display: grid; gap: .3em; }
.nb-sec li { font: 600 .9em/1.4 var(--ui); }
.nb-who { display: grid; grid-template-columns: 2.6em 1fr; gap: .55em; padding: .45em; background: #fff8e6; border: .12em solid var(--edge); border-radius: .4em; margin-bottom: .4em; }
.nb-who img, .nb-who .deadpic { width: 100%; height: auto; aspect-ratio: 1; min-width: 0; overflow: hidden; object-fit: cover; object-position: top; border-radius: .3em; font-size: 1.2em; }
.nb-who h6 { margin: 0 0 .15em; font: 900 .9em var(--ui); }
.nb-who ul { list-style: disc; padding-left: 1em; }
.nb-time { display: grid; grid-template-columns: 3.4em 1fr; gap: .5em; }
.nb-time b { font: 900 .95em var(--ui); color: var(--wine); font-variant-numeric: tabular-nums; }
.nb-q { padding: .3em .6em; border-left: .3em solid #4a78a8; background: #fff8e6; border-radius: .2em; }
.nb-q.contradiction { border-left-color: var(--red); }
.nb-q i { font: 900 .75em var(--ui); font-style: normal; text-transform: uppercase; letter-spacing: .06em; color: #4a78a8; margin-right: .3em; }
.nb-q.contradiction i { color: var(--red); }
.src { display: inline-block; margin-left: .25em; padding: 0 .4em; font: 800 .72em var(--ui); background: #fff; border: .1em solid var(--edge); border-bottom-width: .2em; border-radius: .3em; color: var(--muted); cursor: pointer; vertical-align: .1em; font-variant-numeric: tabular-nums; }
.src:hover { border-color: #e0a72e; color: var(--ink); }
.src.fact { cursor: default; background: #eef3ea; }
.nb-busy::after { content: " …"; animation: dots 1s steps(3) infinite; }
.nb-empty { font: 600 .95em/1.45 var(--ui); color: var(--muted); }
`;
    document.head.appendChild(css);
    pop = document.createElement('div'); pop.id = 'qnote'; pop.className = 'parch'; pop.hidden = true;
    pop.innerHTML = `<div class="qmeta" id="qn-meta"></div><div class="qrow"><button id="qn-mic" class="pill" title="Click to dictate, click again to stop (or Space while the note is empty)">🎙</button><input id="qn-input" class="note-input" maxlength="${MAX_CHARS}" placeholder="Jot it down…" autocomplete="off"><button id="qn-save" class="pill">Save</button></div><div class="qhelp"><kbd>Enter</kbd> save · <kbd>Esc</kbd> cancel</div>`;
    $('#stage').appendChild(pop);
    popIn = $('#qn-input'); popMic = $('#qn-mic');
    $('#qn-save').onclick = () => commit();
    popMic.addEventListener('click', (e) => { e.preventDefault(); listening ? micUp() : micDown(); });   // a toggle, not hold-to-talk
    const btn = $('#btn-note'); if (btn) btn.onclick = () => open();
    const dbtn = $('#dlg-note'); if (dbtn) dbtn.onclick = () => open();
  }
  function open() {
    if (!pop) return;
    const w = where(), hud = $('#hud');
    if (!hud || hud.hidden) return;
    $('#qn-meta').innerHTML = `Note · <b>${esc(w.clock || '')}</b>${w.place ? ' · ' + esc(w.place) : ''}${w.who ? ' · with ' + esc(nameOf(w.who)) : ''}`;
    popMic.hidden = !voiceOn();
    pop.hidden = false; popIn.value = ''; popIn.focus();
    log.debug('quick note open', { scene: w.scene, who: w.who });
  }
  function close() { if (listening) { listening = false; pop.classList.remove('listening'); listener && listener.stop().catch(() => {}); } pop.hidden = true; popIn.blur(); }
  function commit() {
    if (listening) return micUp().then(commit);
    const n = add(popIn.value, pop.dataset.via || 'typed'); delete pop.dataset.via;
    close();
    if (n) window.UI && UI.toast(`Note saved · ${n.clock || ''}`, null, 'note');
  }
  async function micDown() {
    if (!voiceOn() || listening) return;
    listening = true; pop.classList.add('listening'); dictBase = popIn.value ? popIn.value.trim() + ' ' : '';
    VOICE.player && VOICE.player.flush && VOICE.player.flush();
    listener = new VOICE.Listener({ partial: (t) => { popIn.value = dictBase + t; } });
    popIn.placeholder = 'Listening…';
    try { await listener.start(); log.info('dictation start'); }
    catch (e) { listening = false; pop.classList.remove('listening'); popIn.placeholder = 'Jot it down…'; window.UI && UI.toast('Microphone unavailable. Type the note instead.'); }
  }
  async function micUp() {
    if (!listening) return; listening = false; pop.classList.remove('listening'); popIn.placeholder = 'Jot it down…';
    const t = listener ? await listener.stop().catch(() => '') : '';
    if (t) { popIn.value = (dictBase + t).trim(); pop.dataset.via = 'voice'; }
    log.info('dictation done', { chars: (t || '').length });
    popIn.focus();
  }

  // Leaving the game (Alt-Tab, another tab) turns the microphone off at once: nothing more is heard or sent.
  function micOff() {
    if (!listening) return; listening = false; pop.classList.remove('listening'); popIn.placeholder = 'Jot it down…';
    listener && listener.cancel(); listener = null; log.info('dictation cancelled: the game lost focus');
    window.UI && UI.toast('Microphone off: the game lost focus.', null, 'alert');
  }
  addEventListener('blur', micOff); document.addEventListener('visibilitychange', () => document.hidden && micOff());

  // ---------- keys (window capture: runs before the game's and the dialogue's handlers) ----------
  addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && t.classList && t.classList.contains('note-input')) {
      // typing in a notes field: keep every game hotkey (J, E, WASD, Space-to-talk…) out of it
      e.stopImmediatePropagation();
      if (t === popIn) {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { e.preventDefault(); close(); }
        else if (e.code === 'Space' && listening) { e.preventDefault(); if (!e.repeat) micUp(); }
        else if (e.code === 'Space' && !popIn.value && voiceOn()) { e.preventDefault(); if (!e.repeat) micDown(); }
      } else if (e.key === 'Enter') { e.preventDefault(); t.dispatchEvent(new Event('commit')); }
      else if (e.key === 'Escape') { e.preventDefault(); t.blur(); }
      return;
    }
    if (e.code !== 'KeyN' || e.metaKey || e.repeat || !pop || !pop.hidden) return;
    const talking = window.GAME && GAME.talk.state.open, mod = e.altKey || e.ctrlKey;
    if (window.UI && UI.busy) return;
    if (mod) { e.preventDefault(); e.stopImmediatePropagation(); open(); return; }
    // plain N: never while typing anywhere, and not in a conversation (letters go to the question box there)
    if (talking || (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName))) return;
    e.preventDefault(); e.stopImmediatePropagation(); open();
  }, true);

  // ---------- notebook tab ----------
  let tab = 'people', mount = null;
  function notebook(body) {
    const people = body.innerHTML;
    body.innerHTML = `<nav class="nb-tabs"><button data-tab="people">People &amp; clues</button><button data-tab="statements">Statements${window.BOARD ? `<span class="nb-count">${BOARD.claims.length}</span>${BOARD.contradictions.length ? `<span class="nb-count warn">⚠ ${BOARD.contradictions.length}</span>` : ''}` : ''}</button><button data-tab="notes">My notes<span class="nb-count" id="nb-count">${S.notes.length}</span></button></nav>
      <div data-pane="people">${people}</div>
      <div data-pane="statements"><div id="nb-statements"></div></div>
      <div data-pane="notes"><div class="nb-notes"><div><div class="nb-add"><input id="nb-new" class="note-input" maxlength="${MAX_CHARS}" placeholder="Add a note…" autocomplete="off"><button class="pill" id="nb-addbtn">Add</button></div><div class="nb-list" id="nb-list"></div></div><div id="nb-org"></div></div></div>`;
    mount = body;
    const show = (k) => {
      tab = k;
      body.querySelectorAll('.nb-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === k));
      body.querySelectorAll('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== k));
      if (k === 'notes') { renderList(); renderOrg(); schedule(); }
      if (k === 'statements' && window.BOARD) BOARD.renderStatements(body.querySelector('#nb-statements'));
    };
    body.querySelectorAll('.nb-tabs button').forEach((b) => (b.onclick = () => show(b.dataset.tab)));
    const inp = body.querySelector('#nb-new'), go = () => { if (add(inp.value)) inp.value = ''; inp.focus(); };
    inp.addEventListener('commit', go); body.querySelector('#nb-addbtn').onclick = go;
    show(tab);
  }
  function renderList() {
    const el = mount && mount.querySelector('#nb-list'); if (!el) return;
    const c = mount.querySelector('#nb-count'); if (c) c.textContent = S.notes.length;
    el.innerHTML = S.notes.length ? [...S.notes].reverse().map((n) => `<div class="qn" data-id="${n.id}"><span class="qmeta">#${n.id.slice(1)} · <b>${esc(n.clock || '')}</b>${n.place ? ' · ' + esc(n.place) : ''}${n.who ? ' · with ' + esc(nameOf(n.who)) : ''}${n.via === 'voice' ? ' · 🎙' : ''}</span>${esc(n.text)}<button class="qdel" title="Delete this note" aria-label="Delete">×</button></div>`).join('')
      : '<p class="nb-empty">No notes yet. Press <kbd>N</kbd> anywhere (<kbd>Alt</kbd>+<kbd>N</kbd> in a conversation), or type one above.</p>';
    el.querySelectorAll('.qdel').forEach((b) => (b.onclick = () => remove(b.parentElement.dataset.id)));
  }
  function srcChips(sources) {
    return (sources || []).map((s) => {
      if (s.startsWith('f:')) { const e = G() && G().EV[s.slice(2)]; return e ? `<span class="src fact" title="${esc(e.description)}">${esc(e.name.replace(/^[^:]+: /, ''))}</span>` : ''; }
      const n = S.notes.find((x) => x.id === s); return n ? `<button class="src" data-src="${n.id}" title="${esc((n.clock ? n.clock + ' · ' : '') + n.text)}">#${n.id.slice(1)}</button>` : '';
    }).join('');
  }
  function renderOrg(busy) {
    const el = mount && mount.querySelector('#nb-org'); if (!el) return;
    const o = S.org, stale = o && o.hash !== hashOf();
    const g = G();
    let status = '';
    if (busy || inflight) status = `<p class="nb-status nb-busy">${g && g.server.brain ? 'Your secretary is sorting the notes' : 'Sorting'}</p>`;
    else if (!S.notes.length) status = '';
    else if (!o) status = '<p class="nb-status">Not organised yet.</p>';
    else if (o.error) status = `<p class="nb-status warn">${esc(o.error)}</p>`;
    else status = `<p class="nb-status">Organised by your secretary${o.at != null ? ' at ' + fmt(o.at) : ''}${stale ? ' · notes changed since' : ''}.</p>`;
    let html = `<div class="nb-orghead"><h4>Organised</h4><button class="pill ghost" id="nb-organize" ${S.notes.length ? '' : 'disabled'}>Organise</button></div>${status}`;
    if (o && S.notes.length) {
      const r = o.result;
      if (r.summary) html += `<p class="nb-summary">${esc(r.summary)}</p>`;
      if (r.people.length) html += `<div class="nb-sec"><h5>People</h5>${r.people.map((p) => {
        const pic = PEOPLE.includes(p.person) ? `<img src="game-assets/portraits/${p.person}-0.webp" alt="">` : '<div class="deadpic">?</div>';
        return `<div class="nb-who">${pic}<div><h6>${esc(nameOf(p.person))}</h6><ul>${p.points.map((x) => `<li>${esc(x.text)}${srcChips(x.sources)}</li>`).join('')}</ul></div></div>`;
      }).join('')}</div>`;
      if (r.timeline.length) html += `<div class="nb-sec"><h5>The night, in order</h5><ul>${r.timeline.map((x) => `<li class="nb-time"><b>${esc(x.time)}</b><span>${esc(x.event)}${srcChips(x.sources)}</span></li>`).join('')}</ul></div>`;
      if (r.questions.length) html += `<div class="nb-sec"><h5>Contradictions &amp; open questions</h5><ul>${r.questions.map((x) => `<li class="nb-q ${x.kind}"><i>${x.kind === 'contradiction' ? 'Contradiction' : 'Open'}</i>${esc(x.text)}${srcChips(x.sources)}</li>`).join('')}</ul></div>`;
      if (r.leads.length) html += `<div class="nb-sec"><h5>Leads</h5><ul>${r.leads.map((x) => `<li>▸ ${esc(x.text)}${srcChips(x.sources)}</li>`).join('')}</ul></div>`;
    } else if (!S.notes.length) html += '<p class="nb-empty">Your secretary sorts your notes by person and by time, and points out what does not fit.</p>';
    el.innerHTML = html;
    el.querySelector('#nb-organize').onclick = async () => { renderOrg(true); await organize({ force: true }); renderOrg(); };
    el.querySelectorAll('.src[data-src]').forEach((b) => (b.onclick = () => {
      const card = mount.querySelector(`.qn[data-id="${b.dataset.src}"]`); if (!card) return;
      card.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); card.classList.add('flash'); setTimeout(() => card.classList.remove('flash'), 1400);
    }));
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', build); else build();
  window.NOTES = { add, remove, reset, open, close, organize, notebook, list: () => S.notes, get org() { return S.org; }, localOrganize };
})();
