// The parchment UI around the stage (DOM, so text stays crisp): top bar (buttons, place plate, clock),
// hints, notices, cinematic captions, the examine box, inventory / notebook / settings panels,
// the title menu, the accusation and the newspaper ending. Everything is sized in em from the stage width.
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const itemSrc = (id) => `game-assets/items/${id}.png`;
  const KIND = { fact: 'Noted', testimony: 'Testimony', observation: 'Seen', physical: 'Item', document: 'Document' };

  // Without the server (scripted mode), the accusation words are read with plain keywords.
  const MOTIVE_WORDS = { m_passy: /passy|patient|colette|clinic|nurse|girl|certificate|1927|blackmail/i, m_letters: /letter|love/i, m_cards: /card|gambl|cheat|debt|piquet/i, m_oil: /oil|bribe|concession/i, m_passport: /passport/i, m_robbery: /rob|steal|theft|money/i };
  function localJudge(G, words, held) {
    const motive = Object.keys(MOTIVE_WORDS).find((k) => MOTIVE_WORDS[k].test(words.why)) || null, t = words.proof.toLowerCase();
    const proofs = held.filter((id) => G.EV[id].name.replace(/^[^:]+: /, '').toLowerCase().split(/[^a-zà-ÿ]+/).some((w) => w.length > 4 && t.includes(w)));
    return { motive, proofs, remark: '' };
  }
  const UI = {
    // stage scale: 1em = stage width / 86
    fit() {
      const s = $('#stage'), r = Math.min(innerWidth / 1376, innerHeight / 768);
      s.style.width = 1376 * r + 'px'; s.style.height = 768 * r + 'px'; s.style.fontSize = (1376 * r) / 86 + 'px';
    },
    // The room name arrives large, then settles into a small caption so the top of the screen stays calm.
    place(name) { const el = $('#place'); el.textContent = name; el.classList.remove('mini'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.add('mini'), 3200); },
    // "07:22|relief 10:00": the time, and an optional small second line.
    clock(s, urgent) { const [t, sub] = String(s).split('|'); $('#clock').innerHTML = esc(t) + (sub ? `<small>${esc(sub)}</small>` : ''); $('#clock').classList.toggle('urgent', !!urgent); },
    hud(on) { $('#hud').hidden = !on; },
    // A hint appears when it's new, stays ~7 s, then fades away; it only comes back when the next step changes.
    // The step-hint banner is gone (QA: clutter). The case briefing (bulb) explains the goal, and the in-scene
    // "E  Talk to… / E  Examine…" prompts show what can be done. Kept as a no-op so callers need no change.
    hint() { const h = $('#hint'); if (h) h.hidden = true; },
    toast(text, icon, tone = 'note') {
      const t = document.createElement('div'); t.className = 'toast ' + tone;
      t.innerHTML = (icon ? `<img src="${itemSrc(icon)}" alt="">` : '') + `<span>${esc(text)}</span>`;
      $('#toasts').appendChild(t); setTimeout(() => t.classList.add('out'), 3200); setTimeout(() => t.remove(), 3800);
    },
    caption(lines) { const c = $('#caption'); c.hidden = !lines; if (lines) c.innerHTML = lines.map((l, i) => `<p class="${i ? '' : 'big'}">${esc(l)}</p>`).join(''); },
    card(lines, ms = 2600) { const c = $('#card'); c.innerHTML = lines.map((l) => `<p>${esc(l)}</p>`).join(''); c.hidden = false; c.classList.remove('out'); return new Promise((r) => setTimeout(() => { c.classList.add('out'); setTimeout(() => { c.hidden = true; r(); }, 500); }, ms)); },

    // examine: a small parchment box with the item, paged text, and Take / Note
    examine({ title, icon, text, action }) {
      const box = $('#examine'); box.hidden = false;
      $('#ex-title').textContent = title; $('#ex-img').hidden = !icon; if (icon) $('#ex-img').src = itemSrc(icon);
      $('#ex-text').textContent = text; const btn = $('#ex-act'); btn.textContent = action || 'OK';
      return new Promise((res) => {
        const done = () => { box.hidden = true; removeEventListener('keydown', key, true); res(); };
        const key = (e) => { if (['KeyE', 'Enter', 'Space', 'Escape'].includes(e.code)) { e.preventDefault(); e.stopPropagation(); done(); } };
        btn.onclick = done; addEventListener('keydown', key, true); btn.focus();
      });
    },
    get busy() { return !$('#examine').hidden || !$('#panel').hidden || !$('#brief').hidden || !$('#menu').hidden || !$('#accuse').hidden || !$('#ending').hidden; },
    panelOpen: () => !$('#panel').hidden,

    // ---- panels ----
    openPanel(kind, o = {}) {
      const p = $('#panel'); p.hidden = false; p.dataset.kind = kind;
      const G = o.G;
      const close = () => { p.hidden = true; o.onClose && o.onClose(); removeEventListener('keydown', key, true); };
      const key = (e) => { if (e.key === 'Escape' || (kind === 'inventory' && e.code === 'KeyI') || (kind === 'notebook' && e.code === 'KeyJ') || (kind === 'map' && e.code === 'KeyM')) { e.preventDefault(); e.stopPropagation(); close(); } };
      addEventListener('keydown', key, true);
      $('#panel-close').onclick = close;
      const body = $('#panel-body');
      if (kind === 'inventory') {
        const all = [...G.items, ...(o.show ? G.notes : [])];
        $('#panel-title').textContent = o.show ? `Show ${G.names[o.who]}…` : 'Inventory';
        body.innerHTML = all.length ? `<div class="slots">${all.map((id) => { const e = G.EV[id]; return `<button class="slot${e.take ? '' : ' fact'}" data-id="${id}" title="${esc(e.name)}">${e.take ? `<img src="${itemSrc(id)}" alt="">` : `<span class="factmark">${KIND[e.kind] ? KIND[e.kind][0] : '?'}</span>`}<em>${esc(e.name.replace(/^[^:]+: /, ''))}</em></button>`; }).join('')}</div><div class="slot-detail" id="slot-detail">${o.show ? 'Pick what to show or tell.' : 'Pick an item to look at it.'}</div>`
          : '<p class="empty">Nothing yet. Look closely at things: click the sparkles.</p>';
        body.querySelectorAll('.slot').forEach((b) => {
          b.onmouseenter = b.onfocus = () => { const e = G.EV[b.dataset.id]; $('#slot-detail').innerHTML = `<b>${esc(e.name)}</b> <span class="kind">${KIND[e.kind] || ''}</span><br>${esc(e.description)}`; };
          b.onclick = () => { if (o.show) { close(); o.onPick(b.dataset.id); } else b.onfocus(); };
        });
        // Statements others made (engine/board.js): put them to this person, e.g. to confront a contradiction.
        const st = o.show && window.BOARD ? BOARD.confrontable(o.who) : [];
        if (st.length) {
          const hot = new Set(BOARD.contradictions.flatMap((x) => [x.a, x.b]));
          body.insertAdjacentHTML('beforeend', `<div class="show-sec">Statements: put one to ${esc(G.names[o.who])}</div><div class="show-stmts">${st.map((c) => `<button data-s="${c.id}" class="${hot.has(c.id) ? 'hot' : ''}">${hot.has(c.id) ? '⚠ ' : ''}${esc(c.text)}</button>`).join('')}</div>`);
          body.querySelectorAll('.show-stmts button').forEach((b) => (b.onclick = () => { close(); o.onStatement && o.onStatement(st.find((c) => c.id === b.dataset.s)); }));
        }
      }
      if (kind === 'notebook') {
        $('#panel-title').textContent = 'Notebook';
        const people = ['lazar', 'ferrand', 'irina', 'hale', 'mila', 'brandt', 'theo', 'castelli', 'cook'];
        const known = [...G.items, ...G.notes];
        body.innerHTML = `<div class="people">${people.map((id) => {
          const facts = known.filter((e) => (G.EV[e].about || []).includes(id));
          const talked = (G.per[id]?.lines || []).some((l) => l.who === id);
          const pic = `<img src="game-assets/portraits/${id}-0.webp" alt="" onerror="this.outerHTML='<div class=&quot;deadpic&quot;>${id === 'lazar' ? '†' : '?'}</div>'">`;
          return `<article class="person${id === 'lazar' ? ' dead' : ''}">${pic}<div><h4>${esc(G.names[id])}</h4><p class="role">${esc(G.roles[id])}</p>
            <p class="status">${id === 'lazar' ? 'The victim' : talked ? 'Questioned' : 'Not questioned yet'}</p>
            <ul>${facts.map((e) => `<li>${esc(G.EV[e].name.replace(/^[^:]+: /, ''))}</li>`).join('')}</ul></div></article>`;
        }).join('')}</div>`;
        if (window.NOTES) NOTES.notebook(body); // adds the "My notes" tab (engine/notes.js)
      }
      if (kind === 'settings') {
        $('#panel-title').textContent = 'Settings';
        const s = G.settings, row = (id, label, val, dis, note) => `<label class="set${dis ? ' off' : ''}"><span>${label}<small>${note || ''}</small></span><button id="${id}" ${dis ? 'disabled' : ''}>${val}</button></label>`;
        const slider = (id, label, v, dim) => `<label class="set${dim ? ' off' : ''}"><span>${label}</span><input type="range" id="${id}" min="0" max="100" step="5" value="${Math.round(v * 100)}"></label>`;
        const draw = () => {
          body.innerHTML = row('set-brain', 'Characters', s.brain === 'live' ? 'Live AI' : 'Scripted', !G.server.brain, G.server.brain ? 'Live AI: ask anything, by voice or text' : 'Live AI needs the game server (npm start)')
            + row('set-voice', 'Spoken voices', s.voice && s.brain === 'live' ? 'On' : 'Off', !G.server.voice || s.brain !== 'live', 'Gradium voices, and the microphone')
            + row('set-rate', 'Speech speed', `${(s.speechRate || 1).toFixed(2).replace(/0$/, '')}×`, !G.server.voice || s.brain !== 'live' || !s.voice, 'How fast the characters talk. Click to change')
            + row('set-music', 'Music', s.music !== false ? 'On' : 'Off', false, 'Score by Lyria (Gemini)')
            + slider('set-musicvol', 'Music volume', s.musicVol ?? 0.7, s.music === false)
            + row('set-sound', 'Sound effects', s.sound ? 'On' : 'Off', false, 'Footsteps, doors, wind, the train')
            + slider('set-sfxvol', 'Effects volume', s.sfxVol ?? 0.8, !s.sound);
          $('#set-brain').onclick = () => { s.brain = s.brain === 'live' ? 'scripted' : 'live'; o.onChange(); draw(); };
          $('#set-voice').onclick = () => { s.voice = !s.voice; o.onChange(); draw(); };
          $('#set-rate').onclick = () => { const R = [1, 1.15, 1.3], i = R.indexOf(s.speechRate || 1); s.speechRate = R[(i + 1) % R.length]; o.onChange(); draw(); };
          $('#set-sound').onclick = () => { s.sound = !s.sound; o.onChange(); window.AUDIO && AUDIO.apply(); draw(); };
          $('#set-music').onclick = () => { s.music = s.music === false; o.onChange(); window.AUDIO && AUDIO.apply(); draw(); };
          [['set-musicvol', 'musicVol'], ['set-sfxvol', 'sfxVol']].forEach(([id, k]) => { const r = $('#' + id);
            r.oninput = () => { s[k] = r.value / 100; window.AUDIO && AUDIO.apply(); }; r.onchange = () => { o.onChange(); k === 'sfxVol' && window.AUDIO && AUDIO.sfx('ping'); }; });
        };
        draw();
      }
      if (kind === 'map') {
        $('#panel-title').textContent = 'The train';
        if (window.MAP) MAP.render(body, o); // the illustrated map (engine/map.js); the boxes below are its fallback
        else {
        const cars = [['night', 'Engine', 'Buried in the avalanche'], ['corridor', 'Sleeping car', 'Compartments 1 to 7'], ['dining', 'Dining car', 'and the kitchen'], ['lounge', 'Lounge car', 'Bar, piano, cards']];
        const carOf = (h) => (/^c\d$/.test(h) ? 'corridor' : h === 'kitchen' ? 'dining' : h);
        body.innerHTML = `<div class="train">${cars.map(([id, n, d]) => `<div class="car${carOf(o.here) === id ? ' here' : ''}"><b>${n}</b><span>${d}</span></div>`).join('<div class="coupling"></div>')}</div><p class="empty">You are in: <b>${esc(o.hereName)}</b>${o.here === 'outside' ? ' (the snow along the north side of the train)' : ''}</p>`;
        }
      }
    },

    // ---- title + menu: the Last Alibi main menu, and the case library behind "Play" ----
    menu(items, sub) {
      const m = $('#menu'); m.hidden = false; $('#menu-main').hidden = false; $('#menu-cases').hidden = true;
      $('#menu-list').innerHTML = items.map(([label, , off], i) => `<button class="mbtn parch" data-i="${i}" ${off ? 'disabled' : ''}>${esc(label)}</button>`).join('');
      $('#menu-sub').innerHTML = sub || '';
      m.querySelectorAll('.mbtn').forEach((b) => (b.onclick = () => items[+b.dataset.i][1]()));
      m.querySelector('.mbtn:not([disabled])')?.focus();
    },
    cases(list, onPick, onBack) {
      const v = $('#menu-cases'); $('#menu').hidden = false; $('#menu-main').hidden = true; v.hidden = false; v.classList.remove('focus');
      const tilt = [-3, 2.2, -1.6, 2.8, -2.4], bg = (c) => (c.art ? `style="background-image:url('${esc(c.art)}')"` : '');
      const prog = (c) => (window.PROGRESS && PROGRESS.get(c.id)) || {}, day = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (_) { return ''; } };
      v.innerHTML = `<h2>Choose a case</h2><div class="cases">${list.map((c, i) => `<div class="pc${c.ready ? '' : ' soon'}${prog(c).solvedAt ? ' solved' : ''}" data-i="${i}" style="--r:${tilt[i % tilt.length]}deg">
        <div class="pc-flip">
          <button class="pc-front" ${c.ready ? '' : 'aria-disabled="true"'} aria-label="${esc(c.title)}${c.ready ? '' : ', coming soon'}">
            <div class="art" ${bg(c)}>${c.art ? '' : '<b>?</b>'}</div>
            <div class="cap"><span>${esc(c.title)}</span><small>${esc(c.year)}</small></div>
          </button>
          ${c.ready ? `<div class="pc-back" inert>
            <div class="l"><div class="m">${esc(c.year)} · ${esc(c.place)}</div><div class="t">${esc(c.title)}</div>${c.blurb ? `<p class="d">${esc(c.blurb)}</p>` : ''}</div>
            <div class="r"><div class="stamp"><i ${bg(c)}></i></div><div class="postmark"><span>${esc(c.postmark || '')}</span><b>${esc(c.year)}</b></div>
              <div class="addr"><span>To the detective</span><i></i><i></i><i></i></div>
              ${prog(c).plays ? `<div class="record">${prog(c).solvedAt ? `Solved on ${esc(day(prog(c).solvedAt))}` : 'Not solved yet'} · ${prog(c).plays} ${prog(c).plays === 1 ? 'attempt' : 'attempts'}</div>` : ''}
              <div class="acts"><button class="play">${prog(c).plays ? 'Play again' : 'Open the case'}</button><button class="putback">Put it back</button></div></div>
          </div>` : ''}
        </div><span class="tape"></span>${c.ready ? '' : '<span class="rubber">Coming soon</span>'}${prog(c).solvedAt ? `<span class="rubber done">Solved<small>${esc(day(prog(c).solvedAt))}</small></span>` : ''}</div>`).join('')}</div><div class="cases-shade"></div><button class="back">← Back</button>`;
      let open = null;
      const peel = (pc) => { // take the card off the wall: fly it to the middle of the menu, then turn it over
        const r = pc.getBoundingClientRect(), m = $('#menu').getBoundingClientRect();
        pc.style.setProperty('--dx', `${m.left + m.width / 2 - (r.left + r.width / 2)}px`); pc.style.setProperty('--dy', `${m.top + m.height / 2 - (r.top + r.height / 2)}px`);
        open = pc; pc.classList.add('open'); v.classList.add('focus');
        const back = pc.querySelector('.pc-back'); back.inert = false; pc.querySelector('.pc-front').tabIndex = -1;
        setTimeout(() => open === pc && back.querySelector('.play').focus({ preventScroll: true }), 450);
        window.AUDIO && AUDIO.sfx('page');
      };
      const putBack = () => {
        if (!open) return; const pc = open; open = null;
        pc.classList.remove('open'); v.classList.remove('focus'); pc.querySelector('.pc-back').inert = true;
        const f = pc.querySelector('.pc-front'); f.tabIndex = 0; f.focus({ preventScroll: true });
      };
      v.querySelectorAll('.pc').forEach((pc) => {
        const c = list[+pc.dataset.i];
        pc.querySelector('.pc-front').onclick = () => {
          if (c.ready) return open ? null : peel(pc);
          pc.classList.remove('nudge'); void pc.offsetWidth; pc.classList.add('nudge');
        };
        pc.addEventListener('animationend', () => pc.classList.remove('nudge'));
        if (c.ready) { pc.querySelector('.play').onclick = () => { removeEventListener('keydown', key, true); onPick(c); }; pc.querySelector('.putback').onclick = putBack; }
      });
      v.querySelector('.cases-shade').onclick = putBack;
      const back = v.querySelector('.back'); back.onclick = () => { removeEventListener('keydown', key, true); onBack(); };
      const key = (e) => { if (e.key === 'Escape' && !v.hidden && !$('#menu').hidden) { e.stopPropagation(); open ? putBack() : back.onclick(); } };
      addEventListener('keydown', key, true);
    },
    hideMenu() { $('#menu').hidden = true; },

    // ---- accusation: who, why, three proofs ----
    accuse(G, o = {}) {
      return new Promise((resolve) => {
        const a = $('#accuse'); a.hidden = false; let who = null; const words = { why: '', proof: '' };
        const voiceOn = () => G.settings.brain === 'live' && G.settings.voice && G.server.voice && window.VOICE && VOICE.Listener;
        const step = (n) => {
          const body = $('#acc-body');
          if (n === 0) {
            $('#acc-title').textContent = 'Who killed Anton Lazăr?';
            body.innerHTML = `<div class="suspects">${CASE.accusation.suspects.map((id) => `<button class="sus" data-id="${id}"><img src="game-assets/portraits/${id}-0.webp" alt=""><b>${esc(G.names[id])}</b></button>`).join('')}</div>`;
            body.querySelectorAll('.sus').forEach((b) => (b.onclick = () => { who = b.dataset.id; step(1); }));
          } else if (n === 1 || n === 2) {
            // Motive and proofs are said or typed, in the inspector's own words; the magistrate (the AI) reads them.
            const why1 = n === 1, held = [...G.items, ...G.notes];
            $('#acc-title').textContent = why1 ? `Why did ${G.names[who]} do it?` : `Prove it: what points to ${G.names[who]}?`;
            body.innerHTML = `<p class="acc-help">${why1 ? 'Say it or type it: what drove them to kill?' : 'Say it or type it: name at least <b>three</b> things you found that prove it.'}</p>
              <div class="acc-say"><textarea id="acc-text" rows="3" placeholder="${why1 ? 'He killed him because…' : 'The needle mark, …'}">${esc(why1 ? words.why : words.proof)}</textarea>
              ${voiceOn() ? '<button class="pill" id="acc-mic" title="Click, speak, click again">🎙 Speak</button>' : ''}</div>
              ${why1 ? '' : `<div class="acc-held"><span>What you hold (click to add):</span>${held.length ? held.map((id) => `<button class="chipx" data-id="${id}">${esc(G.EV[id].name.replace(/^[^:]+: /, ''))}</button>`).join('') : '<em>Nothing. Your case rests on words alone.</em>'}</div>`}
              <div class="accbar"><button class="back">Back</button><span id="acc-note"></span><button class="go" id="acc-next">${why1 ? 'Next' : 'Accuse'}</button></div>`;
            const ta = $('#acc-text'); ta.focus(); ta.addEventListener('keydown', (e) => e.stopPropagation());
            const keep = () => { if (why1) words.why = ta.value; else words.proof = ta.value; };
            body.querySelectorAll('.chipx').forEach((b) => (b.onclick = () => { ta.value = (ta.value.trim() ? ta.value.trim().replace(/[.,;]?$/, ', ') : '') + G.EV[b.dataset.id].name.replace(/^[^:]+: /, '').toLowerCase(); keep(); ta.focus(); }));
            const mic = $('#acc-mic'); let L = null, base = '';
            const micStop = async (cancel) => { if (!L) return; const l = L; L = null; mic.classList.remove('on'); mic.textContent = '🎙 Speak'; if (cancel) return l.cancel(); const t = await l.stop().catch(() => ''); if (t) ta.value = (base + t).trim(); keep(); };
            if (mic) mic.onclick = async () => {
              if (L) return micStop();
              base = ta.value.trim() ? ta.value.trim() + ' ' : ''; L = new VOICE.Listener({ partial: (t) => (ta.value = base + t) });
              mic.classList.add('on'); mic.textContent = '■ Stop';
              try { await L.start(); } catch (_) { L = null; mic.classList.remove('on'); mic.textContent = '🎙 Speak'; UI.toast('Microphone unavailable. Type it instead.'); }
            };
            const off = () => micStop(true); addEventListener('blur', off, { once: true });
            body.querySelector('.back').onclick = async () => { await micStop(true); keep(); step(n - 1); };
            $('#acc-next').onclick = async () => {
              await micStop(); keep();
              if (!ta.value.trim()) { $('#acc-note').textContent = why1 ? 'Say why first.' : 'Name your proof first.'; return; }
              if (why1) return step(2);
              $('#acc-next').disabled = true; $('#acc-note').textContent = 'The magistrate is reading your case…';
              const r = await (o.judge ? o.judge({ suspect: who, motive: words.why, proofs: words.proof, held }) : null).catch(() => null) || localJudge(G, words, held);
              // Fewer than three proofs recognised: say which ones counted, once, and let them add more or insist.
              if (r.proofs.length < 3 && words.warned !== words.proof) {
                words.warned = words.proof; $('#acc-next').disabled = false; $('#acc-next').textContent = 'Accuse anyway';
                $('#acc-note').innerHTML = `The magistrate counts <b>${r.proofs.length}</b> proof${r.proofs.length === 1 ? '' : 's'}${r.proofs.length ? ': ' + r.proofs.map((id) => esc(G.EV[id].name.replace(/^[^:]+: /, ''))).join(', ') : ''}. Name three things you found.`;
                return;
              }
              a.hidden = true; resolve({ who, why: r.motive, picks: r.proofs, remark: r.remark, words });
            };
          }
        };
        step(0);
      });
    },
    ending(G, R) {
      const e = $('#ending'); e.hidden = false;
      const H = { solved: ['Death on the Simplon: the doctor signed his own victim\'s certificate'], weak: ['Orient Express: doctor detained, but judges call the case "thin"'], wrong: ['Envoy\'s death: wrong passenger arrested, the killer takes the train'] }[R.verdict];
      const body = { solved: 'Inspector Marc Sorel of the Paris Sûreté proved that Dr Paul Ferrand killed the envoy Anton Lazăr with morphine, then left by the window into the snow. Lazăr had blackmailed him since a patient died at his Passy clinic in 1927.',
        weak: R.who === 'ferrand' ? "Dr Ferrand was taken off the train at Domodossola, but the magistrate says the inspector's case leaves too many questions: the motive, or the proofs, did not hold up. He may walk free." : "The magistrate says the inspector's case leaves too many questions. The suspect may walk free.",
        wrong: `The carabinieri took ${G.names[R.who] || 'a passenger'} off the train. A quiet French doctor continued to Belgrade. Lazăr's heart, he said, simply stopped.` }[R.verdict];
      $('#end-head').textContent = H[0]; $('#end-body').textContent = body;
      $('#end-found').innerHTML = (R.remark ? `<i>The magistrate: “${esc(R.remark)}”</i><br>` : '') + `Key proofs found: <b>${R.found.length} of ${R.found.length + R.missed.length}</b>` + (R.missed.length ? `<br>Missed: ${R.missed.map((m) => esc(G.EV[m].name)).join(', ')}` : '');
      return new Promise((r) => ($('#end-again').onclick = () => { e.hidden = true; r(); }));
    },
  };
  addEventListener('resize', UI.fit);

  // Fullscreen: a small button in the bottom-left corner and the F key. On itch.io the game is embedded in a frame;
  // this fills the screen from inside it (the frame allows it). Hidden where fullscreen isn't allowed.
  (function () {
    const d = document, root = d.documentElement, can = d.fullscreenEnabled || d.webkitFullscreenEnabled;
    const btn = d.createElement('button'); btn.id = 'fs-btn'; btn.className = 'parch';
    const draw = () => { const on = !!(d.fullscreenElement || d.webkitFullscreenElement); btn.title = on ? 'Exit fullscreen (F)' : 'Fullscreen (F)'; btn.setAttribute('aria-label', btn.title);
      btn.innerHTML = on ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>'; };
    const toggle = () => { if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d); else { const r = (root.requestFullscreen || root.webkitRequestFullscreen).call(root); r && r.catch && r.catch(() => {}); } };
    btn.onclick = toggle; btn.hidden = !can; draw();
    d.addEventListener('fullscreenchange', () => { draw(); setTimeout(UI.fit, 50); }); d.addEventListener('webkitfullscreenchange', () => { draw(); setTimeout(UI.fit, 50); });
    addEventListener('keydown', (e) => { if (e.code !== 'KeyF' || e.repeat || e.metaKey || e.ctrlKey || e.altKey || !can) return; const t = d.activeElement; if (t && ['INPUT', 'TEXTAREA'].includes(t.tagName)) return; toggle(); });
    const mount = () => ($('#stage') || d.body).appendChild(btn);
    if (d.readyState === 'loading') addEventListener('DOMContentLoaded', mount); else mount();
  })();
  window.UI = UI;
})();
