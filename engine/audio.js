// Music and sound effects for the scene engine.
//   AUDIO.music('investigation')   crossfade to a looping track (ids: game-assets/audio/music.json); AUDIO.music(null) fades out
//   AUDIO.sfx('door')              one procedural effect (see SFX below)
//   AUDIO.scene('outside')         pick the ambience bed (train creaks, wind) and footstep surface for a stage
//   AUDIO.apply()                  re-read G.settings (music, musicVol, sfxVol, sound) after the settings panel changes them
// Music is Lyria-generated mp3 (tools/gen-music.mjs), streamed through <audio> elements into WebAudio so it
// can crossfade, loop seamlessly (the next pass starts while the last one fades) and duck while a voice speaks.
// Every effect is synthesized here with WebAudio: no sample files.
// Browsers only allow sound after a user gesture: everything waits for the first click or key, then starts.
(function () {
  const log = (window.LOG || { scope: () => console }).scope('audio');
  const XF = 2.8;                     // crossfade seconds between tracks and at the loop seam
  const DUCK_VOICE = 0.3, DUCK_TALK = 0.6;
  const SURFACE = { outside: 'snow', night: 'snow', dining: 'wood', lounge: 'wood', kitchen: 'wood' }; // others: carpet

  let ac = null, master, musicBus, duck, sfxBus, ambBus, noise = null, brown = null;
  let unlocked = false, want = null, current = null, manifest = {}, sceneId = null, amb = null;
  const settings = () => (window.GAME && GAME.G && GAME.G.settings) || { sound: true, music: true, musicVol: 0.7, sfxVol: 0.8 };
  const vol = (k, d) => { const v = settings()[k]; return typeof v === 'number' ? Math.max(0, Math.min(1, v)) : d; };
  const musicOn = () => settings().music !== false && vol('musicVol', 0.7) > 0;
  const sfxOn = () => settings().sound !== false && vol('sfxVol', 0.8) > 0;

  fetch('game-assets/audio/music.json').then((r) => r.json()).then((m) => { manifest = m; log.info('music manifest', { tracks: Object.keys(m).join(',') }); })
    .catch((e) => log.warn('no music manifest', { error: e.message }));

  // ---------- context ----------
  function init() {
    if (ac) return ac;
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.connect(ac.destination);
    musicBus = ac.createGain(); duck = ac.createGain(); musicBus.connect(duck); duck.connect(master);
    sfxBus = ac.createGain(); sfxBus.connect(master);
    ambBus = ac.createGain(); ambBus.connect(sfxBus);
    const n = ac.sampleRate * 2;
    noise = ac.createBuffer(1, n, ac.sampleRate); const w = noise.getChannelData(0); for (let i = 0; i < n; i++) w[i] = Math.random() * 2 - 1;
    brown = ac.createBuffer(1, n * 2, ac.sampleRate); const b = brown.getChannelData(0); let l = 0;
    for (let i = 0; i < n * 2; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = l * 3.5; }
    apply();
    log.info('audio context created', { sampleRate: ac.sampleRate, state: ac.state });
    return ac;
  }
  function unlock() {
    if (unlocked) return; unlocked = true; init();
    ac.resume().then(() => {
      log.info('unlocked by user gesture', { state: ac.state });
      if (want && !current) play(want);
      if (sceneId) ambience(sceneId);
      setTimeout(prefetchAll, 1500);
    });
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => addEventListener(ev, unlock, { capture: true }));

  function apply() {
    if (!ac) return;
    const t = ac.currentTime;
    musicBus.gain.setTargetAtTime(musicOn() ? vol('musicVol', 0.7) : 0, t, 0.15);
    sfxBus.gain.setTargetAtTime(sfxOn() ? vol('sfxVol', 0.8) : 0, t, 0.08);
    if (musicOn() && want && !current && unlocked) play(want);
    if (!musicOn() && current) play(null, 0.6);
    log.debug('settings applied', { music: musicOn(), musicVol: vol('musicVol', 0.7), sfx: sfxOn(), sfxVol: vol('sfxVol', 0.8) });
  }

  // ---------- music ----------
  // Each track is fetched once into a Blob URL: the server sends no-store and no byte ranges, so plain URLs
  // would re-download on every loop pass and could not seek.
  const blobs = {}, fetching = {};
  const srcOf = (id) => 'game-assets/' + (manifest[id] ? manifest[id].file : `audio/music-${id}.mp3`);
  function fetchTrack(id) {
    if (blobs[id] || fetching[id]) return fetching[id];
    return (fetching[id] = fetch(srcOf(id)).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
      .then((b) => { blobs[id] = URL.createObjectURL(b); log.debug('track cached', { id, kb: Math.round(b.size / 1024) }); })
      .catch((e) => { delete fetching[id]; log.warn('track fetch failed', { id, error: e.message }); }));
  }
  async function prefetchAll() { for (const id of Object.keys(manifest)) await fetchTrack(id); }
  function deck(id) {
    const url = blobs[id] || srcOf(id); if (!blobs[id]) fetchTrack(id);
    const m = manifest[id], el = new Audio(url); el.preload = 'auto'; el.crossOrigin = 'anonymous';
    const src = ac.createMediaElementSource(el), g = ac.createGain(); g.gain.value = 0; src.connect(g); g.connect(musicBus);
    const d = { id, el, g, loop: m ? m.loop !== false : true, chained: false, dead: false };
    el.addEventListener('error', () => { if (!d.dead) log.warn('track failed to load', { id, url, code: el.error && el.error.code }); });
    el.addEventListener('loadedmetadata', () => log.debug('track loaded', { id, seconds: +el.duration.toFixed(1) }), { once: true });
    el.addEventListener('ended', () => kill(d, 0));
    return d;
  }
  function fade(d, to, secs) { const t = ac.currentTime; d.g.gain.cancelScheduledValues(t); d.g.gain.setValueAtTime(d.g.gain.value, t); d.g.gain.linearRampToValueAtTime(to, t + secs); }
  function kill(d, secs) { if (d.dead) return; d.dead = true; if (secs) { fade(d, 0, secs); setTimeout(() => { d.el.pause(); d.el.src = ''; }, secs * 1000 + 100); } else { d.el.pause(); d.el.src = ''; } }
  function play(id, secs = XF) {
    const prev = current;
    if (!id) { current = null; if (prev) kill(prev, secs); return; }
    const d = deck(id); current = d;
    d.el.play().then(() => fade(d, 1, prev ? secs : Math.min(secs, 1.5))).catch((e) => log.warn('play blocked', { id, error: e.message }));
    if (prev) kill(prev, secs);
  }
  const AUDIO = {
    music(id, o = {}) {
      if (id === want && current && current.id === id && !current.dead) return;
      log.info('music', { track: id || 'off', from: want || 'none' });
      want = id;
      if (!ac || !unlocked || !musicOn()) { if (current && ac) play(null, o.fade ?? XF); return; }
      play(id, o.fade ?? XF);
    },
    get track() { return want; },
    get playing() { return current && !current.dead ? { id: current.id, t: +current.el.currentTime.toFixed(1), paused: current.el.paused } : null; },
  };

  // ---------- ambience: train creaks, low rumble, wind ----------
  function loopNoise(buf, filter, freq, q, gain, dest) {
    const s = ac.createBufferSource(); s.buffer = buf; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = filter; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain(); g.gain.value = gain; s.connect(f); f.connect(g); g.connect(dest); s.start();
    return { s, f, g };
  }
  function ambience(id) {
    if (!ac || !unlocked) return;
    const outside = id === 'outside' || id === 'night', t = ac.currentTime;
    if (!amb) {
      const bus = ac.createGain(); bus.gain.value = 0; bus.connect(ambBus);
      const hull = loopNoise(brown, 'lowpass', 140, 0.7, 0.35, bus);                 // the stopped train: a low steady hum
      const wind = loopNoise(noise, 'bandpass', 500, 0.8, 0.0, bus);                // wind: a swept band of noise
      const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 260; lfo.connect(lg); lg.connect(wind.f.frequency); lfo.start();
      const lfo2 = ac.createOscillator(), lg2 = ac.createGain(); lfo2.frequency.value = 0.13; lg2.gain.value = 0.5; lfo2.connect(lg2); lg2.connect(wind.g.gain); lfo2.start();
      amb = { bus, hull, wind, lg2, timer: null };
      const creak = () => { amb.timer = setTimeout(creak, 5000 + Math.random() * 9000); if (sceneId && !SCENE_OUT(sceneId)) sfx('creak'); };
      amb.timer = setTimeout(creak, 4000);
    }
    amb.bus.gain.setTargetAtTime(0.9, t, 0.8);
    amb.hull.g.gain.setTargetAtTime(outside ? 0.12 : 0.35, t, 0.8);
    amb.wind.g.gain.setTargetAtTime(outside ? 0.55 : 0.1, t, 0.8);            // indoors: muffled wind through the walls
    amb.lg2.gain.setTargetAtTime(outside ? 0.35 : 0.06, t, 0.8);
    amb.wind.f.Q.setTargetAtTime(outside ? 0.6 : 2.5, t, 0.8);
  }
  const SCENE_OUT = (id) => id === 'outside' || id === 'night';
  AUDIO.scene = (id) => { if (id === sceneId) return; sceneId = id; log.debug('scene', { id, surface: SURFACE[id] || 'carpet' }); ambience(id); };
  AUDIO.ambience = (on) => { if (!on) sceneId = null; if (amb && ac) amb.bus.gain.setTargetAtTime(on ? 0.9 : 0, ac.currentTime, 0.6); };

  // ---------- procedural effects ----------
  const env = (g, t, a, peak, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  function burst(t, { buf = noise, type = 'bandpass', f = 1000, q = 1, a = 0.005, d = 0.1, peak = 0.3, pan = 0, sweep, dest = sfxBus, rate = 1 }) {
    const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
    const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (sweep) fl.frequency.exponentialRampToValueAtTime(sweep, t + a + d);
    const g = ac.createGain(); env(g, t, a, peak, d);
    const p = ac.createStereoPanner ? ac.createStereoPanner() : null;
    s.connect(fl); fl.connect(g); if (p) { p.pan.value = pan; g.connect(p); p.connect(dest); } else g.connect(dest);
    s.start(t, Math.random() * 1.5); s.stop(t + a + d + 0.05);
  }
  function tone(t, { f = 440, type = 'sine', a = 0.005, d = 0.5, peak = 0.2, glide, dest = sfxBus, detune = 0, lp }) {
    const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + a + d);
    const g = ac.createGain(); env(g, t, a, peak, d);
    if (lp) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); fl.connect(g); } else o.connect(g);
    g.connect(dest); o.start(t); o.stop(t + a + d + 0.05);
  }
  const SFX = {
    step({ surface = 'carpet', pan = 0, gain = 1 } = {}) {
      const t = ac.currentTime, k = gain * (0.8 + Math.random() * 0.4);
      if (surface === 'wood') { burst(t, { type: 'bandpass', f: 520 + Math.random() * 200, q: 1.6, d: 0.07, peak: 0.22 * k, pan }); tone(t, { f: 95, d: 0.06, peak: 0.18 * k }); }
      else if (surface === 'snow') { for (let i = 0; i < 4; i++) burst(t + i * 0.022 + Math.random() * 0.01, { type: 'bandpass', f: 2200 + Math.random() * 1800, q: 0.9, d: 0.05, peak: 0.12 * k, pan }); burst(t, { type: 'lowpass', f: 500, d: 0.12, peak: 0.12 * k, pan }); }
      else burst(t, { type: 'lowpass', f: 320, q: 0.7, a: 0.01, d: 0.09, peak: 0.2 * k, pan });
    },
    door() {
      const t = ac.currentTime;
      burst(t, { type: 'highpass', f: 2500, d: 0.03, peak: 0.25 });                                   // latch
      tone(t + 0.04, { f: 180, type: 'sawtooth', a: 0.08, d: 0.45, peak: 0.05, glide: 260, lp: 900 }); // hinge creak
      burst(t + 0.05, { type: 'bandpass', f: 400, q: 6, a: 0.1, d: 0.4, peak: 0.08, sweep: 650 });
      tone(t + 0.5, { f: 70, d: 0.18, peak: 0.3 }); burst(t + 0.5, { type: 'lowpass', f: 300, d: 0.12, peak: 0.25 }); // closing thud
    },
    clue() { const t = ac.currentTime; [[1318.5, 0], [1975.5, 0.09], [2637, 0.18]].forEach(([f, dt]) => { tone(t + dt, { f, d: 1.1, peak: 0.07, type: 'triangle' }); tone(t + dt, { f: f * 2.01, d: 0.4, peak: 0.02 }); }); },
    page() { const t = ac.currentTime; burst(t, { type: 'highpass', f: 1500, a: 0.04, d: 0.18, peak: 0.12, sweep: 5000, pan: -0.2 }); burst(t + 0.12, { type: 'bandpass', f: 3000, q: 0.8, a: 0.02, d: 0.12, peak: 0.08, pan: 0.2 }); },
    click() { const t = ac.currentTime; tone(t, { f: 1800, d: 0.025, peak: 0.06, type: 'triangle' }); burst(t, { type: 'highpass', f: 4000, d: 0.015, peak: 0.05 }); },
    ping() { const t = ac.currentTime; tone(t, { f: 987.8, d: 0.35, peak: 0.06 }); tone(t + 0.08, { f: 1318.5, d: 0.5, peak: 0.05 }); },
    alert() { const t = ac.currentTime; tone(t, { f: 659, d: 0.3, peak: 0.08, type: 'triangle' }); tone(t + 0.14, { f: 523, d: 0.5, peak: 0.08, type: 'triangle' }); },
    creak() {
      const t = ac.currentTime, f = 140 + Math.random() * 120, pan = Math.random() * 1.4 - 0.7;
      burst(t, { type: 'bandpass', f, q: 18, a: 0.15, d: 0.5 + Math.random() * 0.6, peak: 0.12, sweep: f * (0.8 + Math.random() * 0.5), pan, dest: ambBus });
    },
    rumble() {                                   // the avalanche: a swelling roar, a sub drop and falling debris
      const t = ac.currentTime;
      burst(t, { buf: brown, type: 'lowpass', f: 220, q: 0.5, a: 0.35, d: 4.5, peak: 0.9, sweep: 60 });
      burst(t + 0.2, { type: 'lowpass', f: 900, a: 0.5, d: 3, peak: 0.12, sweep: 150 });
      tone(t, { f: 46, type: 'sine', a: 0.3, d: 3.8, peak: 0.45, glide: 28 });
      tone(t, { f: 38, type: 'sawtooth', a: 0.4, d: 2.5, peak: 0.06, lp: 120 });
      for (let i = 0; i < 14; i++) burst(t + 0.4 + Math.random() * 2.6, { type: 'bandpass', f: 300 + Math.random() * 900, q: 2, d: 0.08 + Math.random() * 0.15, peak: 0.05 + Math.random() * 0.08, pan: Math.random() * 1.6 - 0.8 });
    },
    // Théo bursts in: an orchestral stab (low diminished cluster, timpani, cymbal splash)
    sting() {
      const t = ac.currentTime;
      [65.4, 130.8, 155.6, 185, 261.6].forEach((f, i) => { tone(t, { f, type: 'sawtooth', a: 0.01, d: 1.6, peak: 0.07, lp: 1400, detune: (i % 2 ? 7 : -7) }); });
      tone(t, { f: 110, glide: 55, d: 0.9, peak: 0.5 });
      burst(t, { type: 'highpass', f: 5000, a: 0.005, d: 1.2, peak: 0.08 });
    },
    // the body is revealed: a slow low swell and a high trembling dissonance
    reveal() {
      const t = ac.currentTime;
      [49, 73.4, 77.8].forEach((f) => tone(t, { f, type: 'sawtooth', a: 0.6, d: 3.4, peak: 0.07, lp: 500 }));
      [1244.5, 1318.5].forEach((f) => { const o = ac.createOscillator(), g = ac.createGain(), v = ac.createOscillator(), vg = ac.createGain();
        o.frequency.value = f; v.frequency.value = 6.5; vg.gain.value = 9; v.connect(vg); vg.connect(o.frequency); env(g, t + 0.3, 0.8, 0.025, 2.6); o.connect(g); g.connect(sfxBus); o.start(t + 0.3); v.start(t + 0.3); o.stop(t + 3.8); v.stop(t + 3.8); });
      tone(t, { f: 55, d: 2.5, peak: 0.45, glide: 40 });
    },
  };
  const counts = {};
  function sfx(name, o) {
    if (!ac || !unlocked || !sfxOn() || !SFX[name]) return;
    counts[name] = (counts[name] || 0) + 1;
    try { SFX[name](o); if (name !== 'step' && name !== 'creak') log.debug('sfx', { name }); } catch (e) { log.warn('sfx failed', { name, error: e.message }); }
  }
  AUDIO.sfx = sfx;
  AUDIO.list = () => Object.keys(SFX);

  // ---------- per-frame: footsteps, ducking, loop seams ----------
  const stepIdx = new Map();
  function tick() {
    requestAnimationFrame(tick);
    if (!ac || !unlocked) return;
    const E = window.ENGINE;
    if (E && E.scene && !E.scene.cinematic && E.fade < 0.9) {
      const surface = SURFACE[E.sceneId] || 'carpet';
      for (const a of E.actors.values()) {
        if (!a.moving) { stepIdx.delete(a); continue; }
        const i = Math.floor(a.t / 18);
        if (stepIdx.get(a) !== i) { if (stepIdx.has(a)) sfx('step', { surface, pan: Math.max(-0.8, Math.min(0.8, (a.x / E.W) * 2 - 1)), gain: a === E.player ? 1 : 0.55 }); stepIdx.set(a, i); }
      }
      if (E.sceneId !== sceneId) AUDIO.scene(E.sceneId);
    }
    // duck the music under a speaking voice, a little while a conversation is open
    const speaking = window.VOICE && VOICE.player && VOICE.player.speaking, talking = window.GAME && GAME.talk && GAME.talk.state && GAME.talk.state.open;
    const d = speaking ? DUCK_VOICE : talking ? DUCK_TALK : 1;
    if (Math.abs(duck.gain.value - d) > 0.01 && duck._to !== d) { duck._to = d; duck.gain.setTargetAtTime(d, ac.currentTime, d < 1 ? 0.12 : 0.6); }
    // seamless loop: start the next pass before this one ends and crossfade
    const c = current;
    if (c && !c.dead && c.loop && !c.chained && c.el.duration && c.el.currentTime > c.el.duration - XF - 0.2) { c.chained = true; log.debug('loop seam', { id: c.id }); play(c.id, XF); }
  }
  requestAnimationFrame(tick);

  // ---------- UI sounds, with no edits to the UI code: clicks, toasts, the notebook ----------
  document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('button, .mbtn, .slot, .sus, .mot, .proof')) sfx('click'); }, true);
  addEventListener('DOMContentLoaded', watchDom); if (document.readyState !== 'loading') watchDom();
  function watchDom() {
    if (watchDom.done) return; watchDom.done = true;
    const toasts = document.getElementById('toasts');
    if (toasts) new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.classList) sfx(n.classList.contains('alert') ? 'alert' : 'ping'); }).observe(toasts, { childList: true });
    const panel = document.getElementById('panel');
    if (panel) new MutationObserver(() => { if (!panel.hidden && panel.dataset.kind === 'notebook') sfx('page'); }).observe(panel, { attributes: true, attributeFilter: ['hidden', 'data-kind'] });
  }

  AUDIO.apply = apply;
  AUDIO.seek = (sec) => { if (current && !current.dead) current.el.currentTime = sec; };   // debug: test the loop seam
  AUDIO.unlock = unlock;
  AUDIO.state = () => ({ ctx: ac ? ac.state : 'none', unlocked, want, playing: AUDIO.playing, scene: sceneId, music: musicOn(), sfx: sfxOn(), duck: duck ? +duck.gain.value.toFixed(2) : 1, sfxCounts: { ...counts } });
  window.AUDIO = AUDIO;
})();
