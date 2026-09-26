// Always-on mini-map (top right, under the clock): a strip of the illustrated train (the same art as the
// full map, game-assets/ui/train-map.webp) with the current room outlined and a pulsing pin on you.
// Click it (or press M) for the full map. Reads the room geometry from MAP.ROOMS (engine/map.js) and
// follows ENGINE.sceneId on its own, so the story code doesn't have to call it.
(function () {
  const log = (window.LOG || { scope: () => console }).scope('minimap');
  const IMG_W = 1584, IMG_H = 672, SRC = 'game-assets/ui/train-map.webp';
  const CROP = [150, 118, 1400, 392];                 // x, y, w, h of the train strip inside the map art
  const pct = (v, of) => (v / of * 100).toFixed(3) + '%';
  const css = `
#minimap { position: absolute; top: 4.1em; right: .9em; width: 15.5em; padding: .3em .3em .25em; cursor: pointer; }
#minimap .mm { position: relative; width: 100%; aspect-ratio: ${CROP[2]} / ${CROP[3]}; border-radius: .3em; overflow: hidden; border: .12em solid var(--edge);
  background: #e8eef4 url(${SRC}) no-repeat; background-size: ${pct(IMG_W, CROP[2])} auto;
  background-position: ${pct(CROP[0], IMG_W - CROP[2])} ${pct(CROP[1], IMG_H - CROP[3])}; filter: saturate(.85); }
#minimap .mm::after { content: ""; position: absolute; inset: 0; background: rgba(245,234,208,.12); pointer-events: none; }
#minimap .rm { position: absolute; border-radius: .2em; box-shadow: 0 0 0 .12em #f0c46a, 0 0 .6em .1em rgba(240,196,106,.75); background: rgba(255,236,170,.18); }
#minimap .pin { position: absolute; width: .8em; height: .8em; transform: translate(-50%, -50%); border-radius: 50%; background: #35557a; border: .13em solid #f0c46a; z-index: 2; }
#minimap .pin::after { content: ""; position: absolute; inset: -.15em; border-radius: 50%; border: .15em solid #f0c46a; animation: mmpulse 1.6s ease-out infinite; }
@keyframes mmpulse { from { transform: scale(1); opacity: .9; } to { transform: scale(2.6); opacity: 0; } }
#minimap .cap { display: flex; justify-content: space-between; align-items: baseline; gap: .5em; margin-top: .2em; font: 800 .62em var(--ui); color: var(--ink); padding: 0 .2em; }
#minimap .cap span { color: var(--muted); font-weight: 700; }
#minimap:hover { box-shadow: 0 0 0 .12em #f0c46a, 0 .3em .8em rgba(0,0,0,.35); }
`;
  let el = null, last = null;
  const CAR = { night: 'Engine', corridor: 'Sleeping car', dining: 'Dining car', kitchen: 'Dining car', lounge: 'Lounge car', outside: 'Outside' };

  function mount() {
    const hud = document.getElementById('hud'); if (!hud || !window.MAP || !MAP.ROOMS) return false;
    const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
    el = document.createElement('div'); el.id = 'minimap'; el.className = 'parch'; el.title = 'The train (M)';
    el.innerHTML = '<div class="mm"><div class="rm" hidden></div><div class="pin" hidden></div></div><div class="cap"><b></b><span>M: map</span></div>';
    el.addEventListener('click', () => {
      const E = window.ENGINE, G = window.GAME && GAME.G; if (!E || !G || !window.UI) return;
      UI.openPanel('map', { G, here: E.sceneId, hereName: E.scene && E.scene.name });
    });
    hud.appendChild(el);
    return true;
  }
  function update() {
    const E = window.ENGINE; if (!el && !mount()) return;
    const id = E && E.sceneId, show = !!(E && E.scene && !E.scene.cinematic && MAP.ROOMS[id]);
    el.hidden = !show; if (!show || id === last) return;
    last = id;
    const r = MAP.ROOMS[id], [x, y, w, h] = r.box, rm = el.querySelector('.rm'), pin = el.querySelector('.pin');
    const X = (v) => pct(v - CROP[0], CROP[2]), Y = (v) => pct(v - CROP[1], CROP[3]);
    Object.assign(rm.style, { left: X(x), top: Y(y), width: pct(w, CROP[2]), height: pct(h, CROP[3]) }); rm.hidden = false;
    Object.assign(pin.style, { left: X(r.at[0]), top: Y(r.num ? r.at[1] - 8 : r.at[1]) }); pin.hidden = false;
    const car = r.num ? 'Sleeping car' : CAR[id] || '';
    el.querySelector('.cap b').textContent = car && car !== E.scene.name ? `${car} · ${E.scene.name}` : E.scene.name;
    log.debug('room', { id });
  }
  setInterval(update, 250);
})();
