// The train map panel ("The train", M): an illustrated cut-away of the snowbound train
// (game-assets/ui/train-map.webp, no text in the art) with crisp HTML over it: car plates, room tags,
// a pulsing "you are here" pin, visited / not-yet-visited rooms, who is where in this story beat,
// and hover tooltips. Read-only: no fast travel. UI.openPanel('map', o) delegates to MAP.render(body, o).
// Room boxes are in map-image pixels (1584 x 672) and placed in %, so everything scales with the panel;
// all sizes are in em, so it follows UI.fit like the rest of the parchment UI.
(function () {
  const W = 1584, H = 672, SRC = 'game-assets/ui/train-map.webp';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // rooms: [x, y, w, h] box on the art, anchor [x, y] for the pin / people, short tag, tooltip title + text
  const COMP = (k) => { const w = 415 / 7, x = 365 + w * (k - 1); return [Math.round(x), 280, Math.round(w), 82]; };
  const ROOMS = {
    night: { box: [168, 282, 170, 160], at: [250, 372], title: 'The engine', text: 'Buried in the avalanche. Nothing gets past until the relief crew digs through.' },
    outside: { box: [322, 128, 1238, 94], at: [905, 176], tag: 'The snow, north side', title: 'Outside, north side', text: 'Trampled snow along the train, under the compartment windows. Reached by the vestibule door.' },
    corridor: { box: [368, 364, 410, 78], at: [575, 404], tag: 'Corridor', title: 'Sleeping-car corridor', text: 'Doors to compartments 1 to 7. The vestibule door at the engine end leads out onto the snow.' },
    dining: { box: [818, 276, 262, 172], at: [948, 392], title: 'Dining car', text: "Tables, lamps and Castelli's log book. Breakfast was served here at seven." },
    kitchen: { box: [1082, 278, 100, 108], at: [1132, 352], tag: 'Kitchen', title: 'Kitchen', text: "Luigi's galley: the stove, the grappa, a window and a door onto the snow." },
    lounge: { box: [1218, 276, 308, 172], at: [1372, 380], title: 'Lounge car', text: 'Bar, piano, the piquet table and the stove. Where the passengers wait out the snow.' },
  };
  for (let k = 1; k <= 7; k++) {
    const b = COMP(k);
    ROOMS['c' + k] = { box: b, at: [b[0] + b[2] / 2, 336], num: k, title: 'Compartment ' + k,
      text: k === 7 ? "Anton Lazăr's compartment. The door was bolted from the inside." : 'A sleeping compartment off the corridor.' };
  }
  // car plates (below the train, on the snow)
  const CARS = [['Engine', 250, 478], ['Sleeping car', 572, 478], ['Dining car', 1000, 478], ['Lounge car', 1372, 478]];

  const css = `
#panel[data-kind="map"] { width: 62em; max-height: 38em; }
.tmap { position: relative; width: 100%; aspect-ratio: ${W} / ${H}; border: .16em solid var(--edge); border-radius: .4em; overflow: hidden;
  background: #e8eef4 url(${SRC}) center / 100% 100% no-repeat; box-shadow: inset 0 0 0 .12em #fff6dc, 0 .2em .5em rgba(58,36,20,.25); }
.tmap .z { position: absolute; border-radius: .3em; transition: background .15s, box-shadow .15s; }
.tmap .z.unseen { background: repeating-linear-gradient(135deg, rgba(58,36,20,.15) 0 .3em, rgba(58,36,20,.05) .3em .6em); backdrop-filter: saturate(.35); -webkit-backdrop-filter: saturate(.35); }
.tmap .z.static { cursor: default; }
.tmap .z:hover, .tmap .z:focus-visible { outline: none; background: rgba(255,240,196,.16); box-shadow: 0 0 0 .14em #f0c46a, 0 0 .9em .2em rgba(240,196,106,.55); backdrop-filter: none; -webkit-backdrop-filter: none; }
.tmap .z.here { box-shadow: 0 0 0 .14em #f0c46a, inset 0 0 1.2em rgba(240,196,106,.45); background: rgba(255,236,170,.12); backdrop-filter: none; -webkit-backdrop-filter: none; }
.tmap .lbl { position: absolute; transform: translate(-50%, -50%); pointer-events: none; white-space: nowrap; }
.tmap .plate { font: 900 .74em var(--ui); letter-spacing: .1em; text-transform: uppercase; color: var(--ink); padding: .28em 1.5em; border-radius: .3em;
  background: linear-gradient(var(--parch), var(--parch2)); border: .14em solid var(--edge); box-shadow: inset 0 0 0 .1em #fff6dc, 0 .18em 0 rgba(58,36,20,.3); }
.tmap .plate::before, .tmap .plate::after { content: "◆"; position: absolute; top: 50%; transform: translateY(-50%); color: var(--edge); font-size: .65em; }
.tmap .plate::before { left: .75em; } .tmap .plate::after { right: .75em; }
.tmap .tag { font: 800 .7em var(--ui); color: var(--ink); padding: .12em .6em; border-radius: .9em; background: rgba(245,234,208,.94); border: .12em solid var(--edge); box-shadow: 0 .12em .3em rgba(0,0,0,.25); }
.tmap .tag.unseen, .tmap .num.unseen { color: var(--muted); border-style: dashed; background: rgba(236,220,182,.9); }
.tmap .num { width: 1.45em; height: 1.45em; display: grid; place-items: center; border-radius: 50%; font: 900 .72em var(--ui); color: var(--ink);
  background: var(--parch); border: .13em solid var(--edge); box-shadow: 0 .1em .25em rgba(0,0,0,.35); }
.tmap .num.seven { background: var(--wine); color: #f5ead0; border-color: #e0a72e; }
.tmap .num.seven.unseen { background: #9a5a66; color: #f5ead0; }
.tmap .dot { position: absolute; width: 1.7em; height: 1.7em; transform: translate(-50%, -50%); border-radius: 50%; border: .13em solid var(--parch);
  background: #3a2414 center 32% / 190% auto no-repeat; box-shadow: 0 0 0 .1em var(--edge2), 0 .15em .35em rgba(0,0,0,.45); }
.tmap .dot.dead { filter: grayscale(.2); box-shadow: 0 0 0 .1em #1a100a, 0 .15em .35em rgba(0,0,0,.45); }
.tmap .you { position: absolute; width: 2.4em; height: 2.4em; transform: translate(-50%, -50%); pointer-events: none; z-index: 3; }
.tmap .you i { position: absolute; inset: 0; border-radius: 50%; border: .18em solid #f0c46a; background: #35557a url(game-assets/portraits/sorel-0.webp) center 32% / 190% auto no-repeat;
  box-shadow: 0 0 0 .12em var(--edge2), 0 .2em .5em rgba(0,0,0,.5); }
.tmap .you::before, .tmap .you::after { content: ""; position: absolute; inset: -.1em; border-radius: 50%; border: .2em solid #f0c46a; animation: tmpulse 1.8s ease-out infinite; }
.tmap .you::after { animation-delay: .9s; }
.tmap .you b { position: absolute; left: 50%; top: 100%; transform: translate(-50%, .15em); font: 900 .62em var(--ui); letter-spacing: .08em; text-transform: uppercase;
  color: #f5ead0; background: #35557a; border: .14em solid #f0c46a; border-radius: .8em; padding: .05em .6em; white-space: nowrap; }
@keyframes tmpulse { from { transform: scale(1); opacity: .9; } to { transform: scale(2.1); opacity: 0; } }
.tmap .tip { position: absolute; z-index: 5; width: 17em; padding: .55em .75em; pointer-events: none; font: 600 .82em/1.35 var(--ui); color: var(--ink);
  background: linear-gradient(var(--parch), var(--parch2)); border: .14em solid var(--edge); border-radius: .4em; box-shadow: inset 0 0 0 .1em #fff6dc, 0 .3em .8em rgba(0,0,0,.4); }
.tmap .tip h5 { margin: 0 0 .15em; font: 900 1.08em var(--ui); }
.tmap .tip p { margin: 0; }
.tmap .tip .st { margin-top: .3em; font: 800 .92em var(--ui); color: var(--green); }
.tmap .tip .st.no { color: var(--muted); } .tmap .tip .st.me { color: #35557a; }
.tmap-foot { display: flex; justify-content: space-between; align-items: center; gap: 1em; margin-top: .6em; font: 700 .95em var(--ui); }
.tmap-foot .where b { color: var(--wine); }
.tmap-key { display: flex; gap: 1.1em; align-items: center; font: 700 .8em var(--ui); color: var(--muted); }
.tmap-key span { display: inline-flex; align-items: center; gap: .4em; }
.tmap-key i { display: inline-block; width: 1.1em; height: 1.1em; border-radius: 50%; }
.tmap-key .k-you { background: #35557a; border: .15em solid #f0c46a; }
.tmap-key .k-dot { background: #7a5a3a; border: .15em solid var(--parch); box-shadow: 0 0 0 .08em var(--edge2); }
.tmap-key .k-seen { border-radius: .2em; background: #fff8e6; box-shadow: 0 0 0 .12em #f0c46a; }
.tmap-key .k-unseen { border-radius: .2em; background: #b3a590; border: .1em dashed var(--muted); }
`;
  let styled = false;
  const style = () => { if (styled) return; styled = true; const s = document.createElement('style'); s.id = 'map-css'; s.textContent = css; document.head.appendChild(s); };
  const pct = (v, of) => (v / of * 100).toFixed(3) + '%';
  const pos = (x, y) => `left:${pct(x, W)};top:${pct(y, H)}`;

  function render(body, o = {}) {
    style();
    const G = o.G || {}, flags = G.flags || {}, here = o.here, names = G.names || {};
    const beat = (window.BEATS || {})[G.beat] || {};
    const seen = (id) => id === here || !!flags['been_' + id];
    const known = (id) => !!(window.SCENES && SCENES[id]);
    const who = (id) => Object.keys(beat[id] || {}).filter((p) => p !== 'sorel');
    const people = (id) => {
      const list = who(id);
      if (id === 'c7' && (flags.been_c7 || flags.inC7)) list.push('lazar');
      return list;
    };

    let html = '<div class="tmap" role="img" aria-label="Map of the train">';
    for (const [id, r] of Object.entries(ROOMS)) {
      const [x, y, w, h] = r.box, isSeen = seen(id), stat = id === 'night' || !known(id);
      html += `<div class="z${isSeen || stat ? '' : ' unseen'}${id === here ? ' here' : ''}${stat ? ' static' : ''}" data-id="${id}" tabindex="0" aria-label="${esc(r.title)}"
        style="${pos(x, y)};width:${pct(w, W)};height:${pct(h, H)}"></div>`;
    }
    for (const [n, x, y] of CARS) html += `<div class="lbl plate" style="${pos(x, y)}">${esc(n)}</div>`;
    for (const [id, r] of Object.entries(ROOMS)) {
      const u = seen(id) ? '' : ' unseen';
      if (r.tag) html += `<div class="lbl tag${u}" style="${pos(id === 'corridor' ? 742 : r.at[0], id === 'corridor' ? 404 : id === 'kitchen' ? 298 : r.at[1] - 36)}">${esc(r.tag)}</div>`;
      if (r.num) html += `<div class="lbl num${u}${r.num === 7 ? ' seven' : ''}" style="${pos(r.at[0], 298)}">${r.num}</div>`;
    }
    // Who is where: the "you" pin and the portrait dots are laid out INSIDE each room's box. The pin takes the
    // left of the room you're in, the dots fill the rest in rows, so nothing spills over into the next car.
    const DOT = 47;                                            // dot pitch, in map pixels (the dot itself is 1.7em)
    for (const id of Object.keys(ROOMS)) {
      const r = ROOMS[id], mine = id === here && !r.num;
      const list = people(id); if (!list.length || (id === here && r.num)) continue; // a compartment is too small for the pin and dots together
      const [bx, by, bw, bh] = r.box;
      if (r.num) { list.slice(0, 1).forEach((p) => { html += `<div class="dot${p === 'lazar' ? ' dead' : ''}" data-who="${p}" style="${pos(r.at[0], 338)};background-image:url(game-assets/portraits/${p}-0.webp)" data-room="${id}"></div>`; }); continue; }
      const x0 = bx + (mine ? 62 : 14), x1 = bx + bw - 14, perRow = Math.max(1, Math.floor((x1 - x0) / DOT) + 1);
      const rows = Math.ceil(list.length / perRow), yc = by + bh / 2 + (id === 'corridor' ? 8 : 12);
      list.forEach((p, i) => {
        const row = Math.floor(i / perRow), n = Math.min(perRow, list.length - row * perRow), col = i % perRow;
        const span = (n - 1) * DOT, cx = x0 + (x1 - x0) / 2 - span / 2 + col * DOT, cy = yc + (row - (rows - 1) / 2) * DOT;
        html += `<div class="dot${p === 'lazar' ? ' dead' : ''}" data-who="${p}" style="${pos(cx, cy)};background-image:url(game-assets/portraits/${p}-0.webp)" data-room="${id}"></div>`;
      });
    }
    if (ROOMS[here]) {
      const r = ROOMS[here], crowd = people(here).length && !r.num;
      const x = crowd ? r.box[0] + 36 : r.at[0], y = r.num ? r.at[1] - 8 : crowd ? r.box[1] + r.box[3] / 2 + 4 : r.at[1];
      html += `<div class="you" style="${pos(x, y)}"><i></i><b>You</b></div>`;
    }
    html += '<div class="tip" hidden></div></div>';
    const hereName = o.hereName || (known(here) ? SCENES[here].name : '');
    html += `<div class="tmap-foot"><div class="where">You are in: <b>${esc(hereName)}</b>${here === 'outside' ? ' (the snow along the north side)' : ''}</div>
      <div class="tmap-key"><span><i class="k-you"></i>You</span><span><i class="k-dot"></i>People</span><span><i class="k-seen"></i>Visited</span><span><i class="k-unseen"></i>Not visited yet</span></div></div>`;
    body.innerHTML = html;

    // tooltips
    const map = body.querySelector('.tmap'), tip = map.querySelector('.tip');
    const show = (el) => {
      const id = el.dataset.room || el.dataset.id, r = ROOMS[id]; if (!r) return;
      let h = `<h5>${esc(r.title)}</h5><p>${esc(r.text)}</p>`;
      if (el.dataset.who) {
        const p = el.dataset.who;
        h = `<h5>${esc(names[p] || p)}</h5><p>${esc(p === 'lazar' ? 'The victim, where he was found.' : (G.roles && G.roles[p]) || '')}</p><p class="st">In: ${esc(r.title)}</p>`;
      } else {
        const ppl = people(id).filter((p) => p !== 'lazar').map((p) => names[p] || p);
        if (id === here) h += '<p class="st me">You are here</p>';
        else if (id !== 'night' && known(id)) h += seen(id) ? '<p class="st">Visited</p>' : '<p class="st no">Not visited yet</p>';
        if (ppl.length) h += `<p class="st">Here now: ${esc(ppl.join(', '))}</p>`;
      }
      tip.innerHTML = h; tip.hidden = false;
      const m = map.getBoundingClientRect(), b = el.getBoundingClientRect(), t = tip.getBoundingClientRect();
      let left = b.left + b.width / 2 - m.left - t.width / 2;
      left = Math.max(6, Math.min(m.width - t.width - 6, left));
      let top = b.top - m.top - t.height - 8;
      if (top < 6) top = Math.min(m.height - t.height - 6, b.bottom - m.top + 8);
      tip.style.left = left + 'px'; tip.style.top = top + 'px';
    };
    const hide = () => { tip.hidden = true; };
    map.querySelectorAll('.z, .dot').forEach((el) => {
      el.addEventListener('mouseenter', () => show(el)); el.addEventListener('mouseleave', hide);
      el.addEventListener('focus', () => show(el)); el.addEventListener('blur', hide);
    });
  }

  window.MAP = { render, ROOMS };
})();
