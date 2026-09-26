// The parchment UI around the stage (DOM, so text stays crisp): top bar (buttons, place plate, clock),
// hints, notices, cinematic captions, the examine box, inventory / notebook / settings panels,
// the title menu, the accusation and the newspaper ending. Everything is sized in em from the stage width.
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const itemSrc = (id) => `game-assets/items/${id}.png`;
  const KIND = { fact: 'Noted', testimony: 'Testimony', observation: 'Seen', physical: 'Item', document: 'Document' };

  const UI = {
    // stage scale: 1em = stage width / 86
    fit() {
      const s = $('#stage'), r = Math.min(innerWidth / 1376, innerHeight / 768);
      s.style.width = 1376 * r + 'px'; s.style.height = 768 * r + 'px'; s.style.fontSize = (1376 * r) / 86 + 'px';
    },
    place(name) { $('#place').textContent = name; },
    clock(s, urgent) { $('#clock').textContent = s; $('#clock').classList.toggle('urgent', !!urgent); },
    hud(on) { $('#hud').hidden = !on; },
    hint(text) { const h = $('#hint'); h.hidden = !text; if (text) h.innerHTML = text; },
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
    get busy() { return !$('#examine').hidden || !$('#panel').hidden || !$('#menu').hidden || !$('#accuse').hidden || !$('#ending').hidden; },
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
      }
      if (kind === 'notebook') {
        $('#panel-title').textContent = 'Notebook';
        const people = ['lazar', 'ferrand', 'irina', 'hale', 'mila', 'brandt', 'theo', 'castelli'];
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
            + row('set-music', 'Music', s.music !== false ? 'On' : 'Off', false, 'Score by Lyria (Gemini)')
            + slider('set-musicvol', 'Music volume', s.musicVol ?? 0.7, s.music === false)
            + row('set-sound', 'Sound effects', s.sound ? 'On' : 'Off', false, 'Footsteps, doors, wind, the train')
            + slider('set-sfxvol', 'Effects volume', s.sfxVol ?? 0.8, !s.sound);
          $('#set-brain').onclick = () => { s.brain = s.brain === 'live' ? 'scripted' : 'live'; o.onChange(); draw(); };
          $('#set-voice').onclick = () => { s.voice = !s.voice; o.onChange(); draw(); };
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
      const v = $('#menu-cases'); $('#menu').hidden = false; $('#menu-main').hidden = true; v.hidden = false;
      v.innerHTML = `<h2>Choose a case</h2><div class="cases">${list.map((c, i) => `<button class="case parch" data-i="${i}" ${c.ready ? '' : 'disabled'}>
        <div class="art" ${c.art ? `style="background-image:url('${esc(c.art)}')"` : ''}>${c.art ? '' : '<b>?</b>'}</div>
        <div class="txt"><div class="m">${esc(c.year)} · ${esc(c.place)}</div><div class="t">${esc(c.title)}</div>${c.blurb ? `<p class="d">${esc(c.blurb)}</p>` : ''}${c.ready ? '<span class="play">Play</span>' : ''}</div>
        ${c.ready ? '' : '<span class="soon">Coming soon</span>'}</button>`).join('')}</div><button class="back">← Back</button>`;
      v.querySelectorAll('.case').forEach((b) => (b.onclick = () => onPick(list[+b.dataset.i])));
      const back = v.querySelector('.back'); back.onclick = () => { removeEventListener('keydown', key, true); onBack(); };
      const key = (e) => { if (e.key === 'Escape' && !v.hidden && !$('#menu').hidden) { e.stopPropagation(); back.onclick(); } };
      addEventListener('keydown', key, true);
      v.querySelector('.case:not([disabled])')?.focus();
    },
    hideMenu() { $('#menu').hidden = true; },

    // ---- accusation: who, why, three proofs ----
    accuse(G) {
      return new Promise((resolve) => {
        const a = $('#accuse'); a.hidden = false; let who = null, why = null; const picks = new Set();
        const step = (n) => {
          const body = $('#acc-body');
          if (n === 0) {
            $('#acc-title').textContent = 'Who killed Anton Lazăr?';
            body.innerHTML = `<div class="suspects">${CASE.accusation.suspects.map((id) => `<button class="sus" data-id="${id}"><img src="game-assets/portraits/${id}-0.webp" alt=""><b>${esc(G.names[id])}</b></button>`).join('')}</div>`;
            body.querySelectorAll('.sus').forEach((b) => (b.onclick = () => { who = b.dataset.id; step(1); }));
          } else if (n === 1) {
            $('#acc-title').textContent = `Why did ${G.names[who]} do it?`;
            body.innerHTML = `<div class="motives">${CASE.accusation.motives.map((m) => `<button class="mot" data-id="${m.id}">${esc(m.label)}</button>`).join('')}</div><button class="back">Back</button>`;
            body.querySelectorAll('.mot').forEach((b) => (b.onclick = () => { why = b.dataset.id; step(2); }));
            body.querySelector('.back').onclick = () => step(0);
          } else {
            $('#acc-title').textContent = 'Prove it: choose three';
            const all = [...G.items, ...G.notes];
            body.innerHTML = `<div class="proofs">${all.map((id) => `<button class="proof" data-id="${id}">${G.EV[id].take ? `<img src="${itemSrc(id)}" alt="">` : ''}<span>${esc(G.EV[id].name)}</span></button>`).join('') || '<p class="empty">You have no proof at all.</p>'}</div>
              <div class="accbar"><button class="back">Back</button><span id="acc-count">0 of 3 chosen</span><button class="go" disabled>Accuse</button></div>`;
            body.querySelectorAll('.proof').forEach((b) => (b.onclick = () => {
              const id = b.dataset.id; if (picks.has(id)) picks.delete(id); else if (picks.size < 3) picks.add(id);
              b.classList.toggle('on', picks.has(id)); $('#acc-count').textContent = `${picks.size} of 3 chosen`; body.querySelector('.go').disabled = picks.size !== 3;
            }));
            body.querySelector('.back').onclick = () => step(1);
            body.querySelector('.go').onclick = () => { a.hidden = true; resolve({ who, why, picks: [...picks] }); };
          }
        };
        step(0);
      });
    },
    ending(G, R) {
      const e = $('#ending'); e.hidden = false;
      const H = { solved: ['Death on the Simplon: the doctor signed his own victim\'s certificate'], weak: ['Orient Express: doctor detained, but judges call the case "thin"'], wrong: ['Envoy\'s death: wrong passenger arrested, the killer takes the train'] }[R.verdict];
      const body = { solved: 'Inspector Marc Sorel of the Paris Sûreté proved that Dr Paul Ferrand killed the envoy Anton Lazăr with morphine, then left by the window into the snow. Lazăr had blackmailed him since a patient died at his Passy clinic in 1927.',
        weak: "Dr Ferrand was taken off the train at Domodossola, but the magistrate says the inspector's case leaves too many questions. He may walk free.",
        wrong: `The carabinieri took ${G.names[R.who] || 'a passenger'} off the train. A quiet French doctor continued to Belgrade. Lazăr's heart, he said, simply stopped.` }[R.verdict];
      $('#end-head').textContent = H[0]; $('#end-body').textContent = body;
      $('#end-found').innerHTML = `Key proofs found: <b>${R.found.length} of ${R.found.length + R.missed.length}</b>` + (R.missed.length ? `<br>Missed: ${R.missed.map((m) => esc(G.EV[m].name)).join(', ')}` : '');
      return new Promise((r) => ($('#end-again').onclick = () => { e.hidden = true; r(); }));
    },
  };
  addEventListener('resize', UI.fit);
  window.UI = UI;
})();
