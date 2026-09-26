// Gradium voice in the browser: push-to-talk speech-to-text and streaming text-to-speech.
// The API key never reaches the page: server/server.mjs mints a short-lived, single-use token
// per WebSocket (GET /api/gradium-token), as Gradium's browser guide recommends.
// Wire protocol: docs.gradium.ai/guides/websocket-lifecycle (checked 2026-09-26).
//
// Tuning (measured 2026-09-26, see docs/architecture.md "Voice pipeline"):
// - model "gradium-tts-beta": first audio ~90 ms after the first text vs ~330 ms on "default",
//   and ~10% shorter audio for the same text.
// - json_config.padding_bonus (speed, negative = faster) and temp come from the scenario:
//   CASE.voice.gradiumSpeed / gradiumTemp / ttsModel, overridden per character by
//   characters[].voice.gradiumSpeed / gradiumTemp.
// - Tokens live ~4 s and are single-use, and the account allows 2 live sessions, so we do not
//   keep a pool of warm tokens or sockets. Instead the caller opens the Speech as soon as the
//   player asks (VOICE.Speech before Gemini answers): token + socket + setup are ready by the
//   time the first sentence arrives.
(function () {
  const log = (window.LOG || { scope: () => console }).scope('voice');
  const WSS = 'wss://api.gradium.ai/api/speech';
  const RATE = 24000; // STT input "pcm" = 24 kHz; TTS output "pcm_24000"
  const DEFAULTS = { model: 'gradium-tts-beta', speed: -1.0, temp: 0.8 };
  const FASTER = 2;

  async function token() {
    const t0 = performance.now();
    const r = await fetch((window.API_BASE || '') + '/api/gradium-token');
    if (!r.ok) { log.error('token request failed', { status: r.status }); throw new Error('no Gradium token (is the server running?)'); }
    log.debug('token ok', { ms: Math.round(performance.now() - t0) });
    return (await r.json()).token;
  }
  function b64FromF32(f) {
    const i16 = new Int16Array(f.length);
    for (let i = 0; i < f.length; i++) { const v = Math.max(-1, Math.min(1, f[i])); i16[i] = v < 0 ? v * 32768 : v * 32767; }
    const u8 = new Uint8Array(i16.buffer); let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function f32FromB64(b64) {
    const bin = atob(b64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const i16 = new Int16Array(u8.buffer, 0, u8.length >> 1), f = new Float32Array(i16.length);
    for (let i = 0; i < i16.length; i++) f[i] = i16[i] / 32768;
    return f;
  }

  // TTS settings for a voice: scenario defaults (CASE.voice) + the character's own overrides.
  function settingsFor(voiceId, over = {}) {
    const C = window.CASE || {}, g = C.voice || {};
    const ch = (C.characters || []).find((c) => c.voice && c.voice.gradium === voiceId);
    const v = (ch && ch.voice) || {};
    const pick = (...xs) => xs.find((x) => typeof x === 'number' && isFinite(x));
    return {
      who: ch ? ch.id : null,
      model: over.model || v.gradiumModel || g.ttsModel || DEFAULTS.model,
      // QA (26 Sept): voices were too slow. Two notches faster than each character's tuned value keeps their
      // relative pace (-1 -> -3 is ~15% shorter audio, measured); Player.rate does the rest.
      speed: Math.max(-4, pick(over.speed, v.gradiumSpeed, g.gradiumSpeed, DEFAULTS.speed) - (over.speed != null ? 0 : FASTER)),
      temp: pick(over.temp, v.gradiumTemp, g.gradiumTemp, DEFAULTS.temp),
    };
  }

  // Gapless 24 kHz playback with a level meter for lip-flap. push() returns when the chunk will
  // play (AudioContext time), so a Speech can follow its own playhead for captions.
  class Player {
    // rate: playback speed of the voices (Settings > Speech speed). Gradium's own speed control (padding_bonus)
    // tops out at about +20%, so the rest is done here; a small rate keeps the voices recognisable.
    constructor() { this.ac = null; this.t = 0; this.src = new Set(); this.rate = 1; }
    ensure() {
      if (!this.ac) { log.info('audio output ready', { sampleRate: RATE }); this.ac = new AudioContext({ sampleRate: RATE }); this.an = this.ac.createAnalyser(); this.an.fftSize = 512; this.an.connect(this.ac.destination); this.buf = new Float32Array(512); }
      if (this.ac.state === 'suspended') this.ac.resume();
      return this.ac;
    }
    push(f32) {
      const ac = this.ensure(), ab = ac.createBuffer(1, f32.length, RATE); ab.copyToChannel(f32, 0);
      const s = ac.createBufferSource(), rate = this.rate || 1; s.buffer = ab; s.playbackRate.value = rate; s.connect(this.an);
      // Start the first chunk right away (a few ms of headroom), then queue the rest back to back.
      const at = (this.t = Math.max(this.t, ac.currentTime + 0.03)); s.start(at); this.t += ab.duration / rate;
      this.src.add(s); s.onended = () => this.src.delete(s);
      return { at, dur: ab.duration, rate };
    }
    now() { return this.ac ? this.ac.currentTime : 0; }
    flush() { if (this.src.size) log.debug('playback flushed', { chunks: this.src.size }); for (const s of this.src) { try { s.stop(); } catch (_) {} } this.src.clear(); this.t = 0; }
    level() { if (!this.an || !this.src.size) return 0; this.an.getFloatTimeDomainData(this.buf); let m = 0; for (const v of this.buf) m = Math.max(m, Math.abs(v)); return m; }
    get speaking() { return this.src.size > 0; }
  }
  const player = new Player();

  // Text chunking for TTS prosody (Gradium's LLM-to-TTS rules): send whole sentences, keep the
  // punctuation on its word, never a few-word fragment unless the reply is over. A sentence shorter
  // than MIN ("Oui." "Inspector.") waits and goes out with the next one. A long sentence with no end
  // in sight is cut at a clause boundary (, ; : dash) after at least CLAUSE_MIN chars.
  const MIN = 24, LONG = 120, CLAUSE_MIN = 40, HARD = 220;
  const ABBR = /(?:^|\s)(?:Mr|Mrs|Ms|Dr|St|Mme|Mlle|Mgr|M|Col|Capt|Maj|Lt|Sgt|Prof|No|vs|etc)\.$/i;
  function nextChunk(buf) {
    const end = /[.?!…]+["'”’»)\]]*(?=\s)/g; let m;
    while ((m = end.exec(buf))) {
      const at = m.index + m[0].length;
      if (at < MIN || ABBR.test(buf.slice(0, at))) continue;
      return at;
    }
    if (buf.length > LONG) {
      const head = buf.slice(0, LONG);
      const c = Math.max(head.lastIndexOf(', '), head.lastIndexOf('; '), head.lastIndexOf(': '), head.lastIndexOf(' — '), head.lastIndexOf(' – '));
      if (c >= CLAUSE_MIN) return c + 1;
    }
    if (buf.length > HARD) { const s = buf.lastIndexOf(' ', HARD); if (s > CLAUSE_MIN) return s; }
    return -1;
  }

  // One reply = one TTS socket. Create it as soon as you know a reply is coming (it opens the
  // socket and sends setup right away), feed text() as the brain streams, then end().
  // A reply that produced no words should be cancel()led. caption(text) returns how much of the
  // text has been spoken so far (from Gradium's word timestamps), for typing in sync with the voice.
  class Speech {
    constructor(voiceId, on = {}, opts = {}) {
      this.voiceId = voiceId; this.on = on; this.cfg = settingsFor(voiceId, opts);
      this.queue = []; this.sent = []; this.buf = ''; this.open = false; this.closed = false; this.ended = false; this.eos = false; this.failed = false;
      this.chunks = 0; this.chars = 0; this.held = []; this.words = []; this.segs = []; this.audioSec = 0; this.tries = 0;
      this.t0 = performance.now(); this.tText = 0; this.tAudio = 0;
      this.start();
    }
    setup() {
      const c = this.cfg, jc = { padding_bonus: c.speed, temp: c.temp };
      return { type: 'setup', model_name: c.model, voice_id: this.voiceId, output_format: 'pcm_24000', json_config: jc };
    }
    async start() {
      const t0 = performance.now(), c = this.cfg;
      try {
        const url = new URL(WSS + '/tts'); url.searchParams.set('token', await token());
        if (this.cancelled) return;
        const ws = (this.ws = new WebSocket(url));
        ws.onopen = () => {
          ws.send(JSON.stringify(this.setup()));
          log.info('tts setup', { who: c.who, voice: this.voiceId, model: c.model, speed: c.speed, temp: c.temp, queued: this.queue.length, openMs: Math.round(performance.now() - t0) });
          this.open = true; for (const m of this.queue) ws.send(m); this.queue = [];
        };
        ws.onmessage = (ev) => {
          if (ws !== this.ws) return;
          const m = JSON.parse(ev.data);
          if (m.type === 'audio') this.audio(m.audio);
          else if (m.type === 'text' && typeof m.start_s === 'number') this.words.push(m.start_s);
          else if (m.type === 'ready') log.debug('tts ready', { who: c.who, model: m.model_name, ms: Math.round(performance.now() - this.t0) });
          else if (m.type === 'error') this.fail(m.message || 'tts error');
          else if (m.type === 'end_of_stream') {
            this.eos = true; if (this.held.length) this.play(this.held[0]); const dropped = Math.max(0, this.held.length - 1) * 0.08; this.held = [];
            log.info('tts done', { trimmedSec: +dropped.toFixed(2), who: c.who, chunks: this.chunks, audioSec: +this.audioSec.toFixed(2), chars: this.chars, charsPerSec: this.audioSec ? +(this.chars / this.audioSec).toFixed(1) : null, ms: Math.round(performance.now() - this.t0) });
            this.on.done && this.on.done();
          }
        };
        ws.onerror = () => { if (ws === this.ws) this.fail('socket error'); };
        ws.onclose = (e) => { if (ws === this.ws && !this.eos && !this.cancelled) this.fail(`socket closed ${e.code} ${e.reason || ''}`.trim()); };
      } catch (e) { this.fail(String(e.message || e)); }
    }
    // Gradium pads the end of a reply with ~2 s of silence. Silent chunks are held back and only
    // played if more speech follows (a real pause), so VOICE.player.speaking, the music ducking and
    // the caption end when the voice does. At end_of_stream the held silence is dropped.
    audio(b64) {
      const f = f32FromB64(b64); let pk = 0; for (let i = 0; i < f.length; i += 4) pk = Math.max(pk, Math.abs(f[i]));
      if (pk < 0.02 && this.chunks) { this.held.push(f); return; }
      for (const h of this.held) this.play(h); this.held = [];
      this.play(f);
    }
    play(f) {
      const p = player.push(f);
      this.segs.push({ at: p.at, off: this.audioSec, dur: p.dur, rate: p.rate }); this.audioSec += p.dur;
      if (!this.chunks++) {
        this.tAudio = performance.now();
        log.info('tts first audio', { who: this.cfg.who, model: this.cfg.model, speed: this.cfg.speed, temp: this.cfg.temp, ttfaMs: this.tText ? Math.round(this.tAudio - this.tText) : null, sinceOpenMs: Math.round(this.tAudio - this.t0) });
        this.on.start && this.on.start();
      }
    }
    // Retry once when the socket fails before any audio (e.g. "Concurrency limit exceeded" while
    // the previous reply's socket is still closing); replay what was already sent.
    fail(why) {
      if (this.cancelled || this.failed) return;
      const retry = !this.chunks && this.tries++ < 1 && !/voice|model|json_config|should be/i.test(why);
      (retry ? log.warn : log.error)(retry ? 'tts failed, retrying' : 'tts failed', { who: this.cfg.who, error: String(why).split('\n')[0].slice(0, 160) });
      try { this.ws && this.ws.close(); } catch (_) {}
      if (retry) { this.ws = null; this.open = false; this.queue = [...this.sent]; setTimeout(() => this.start(), 350); return; }
      this.failed = true; this.on.error && this.on.error(why);
    }
    send(obj) {
      const m = JSON.stringify(obj); this.sent.push(m);
      if (obj.type === 'text' && !this.tText) this.tText = performance.now();
      if (this.open && this.ws && this.ws.readyState === 1) this.ws.send(m); else this.queue.push(m);
    }
    sendText(t) { t = t.trim(); if (!t) return; this.chars += t.replace(/\s*<flush>/, '').length; this.send({ type: 'text', text: t }); }
    text(delta) {
      if (this.closed) return;
      this.buf += delta;
      let at; while ((at = nextChunk(this.buf)) > 0) { this.sendText(this.buf.slice(0, at)); this.buf = this.buf.slice(at); }
      // If the brain stalls mid-reply (a tool call), let the voice finish what it already has.
      clearTimeout(this.idle);
      this.idle = setTimeout(() => { if (!this.closed && this.chars && !this.buf.trim()) this.send({ type: 'text', text: '<flush>' }); }, 800);
    }
    end() {
      if (this.closed) return; this.closed = this.ended = true; clearTimeout(this.idle);
      if (!this.chars && !this.buf.trim()) { log.debug('tts closed without text', { who: this.cfg.who }); this.cancelled = true; try { this.ws && this.ws.close(); } catch (_) {} this.eos = true; return; }
      this.sendText(this.buf.trim() + ' <flush>'); this.buf = '';
      this.send({ type: 'end_of_stream' });
    }
    cancel() { if (!this.closed || this.ended) log.debug('tts cancelled', { who: this.cfg.who }); this.closed = true; this.ended = false; this.cancelled = true; clearTimeout(this.idle); try { this.ws && this.ws.close(); } catch (_) {} player.flush(); }
    // Seconds of this reply's audio that have played.
    played() {
      const now = player.now(); let s = 0;
      for (const g of this.segs) { if (now < g.at) break; s = g.off + Math.min(g.dur, (now - g.at) * g.rate); }
      return s;
    }
    get finished() { return this.failed || (this.eos && (!this.segs.length || player.now() >= this.segs[this.segs.length - 1].at + this.segs[this.segs.length - 1].dur / this.segs[this.segs.length - 1].rate)); }
    // The part of `text` spoken so far, word by word. Falls back to the whole text when the voice
    // failed, finished, or has not produced audio 2.5 s after the first words were sent.
    caption(text) {
      if (this.finished || (!this.chunks && this.tText && performance.now() - this.tText > 2500)) return text;
      if (!this.chunks) return '';
      const t = this.played(); let n = 0; while (n < this.words.length && this.words[n] <= t) n++;
      const re = /\S+\s*/g; let m, i = 0, end = 0; while (i < n && (m = re.exec(text))) { end = m.index + m[0].length; i++; }
      return text.slice(0, end);
    }
  }

  // Push-to-talk transcription. start() opens the socket and the mic (in parallel); stop()
  // flushes and resolves with the final text.
  class GradiumListener {
    constructor(on = {}) { this.on = on; }
    async start() {
      this.text = ''; this.queue = []; this.open = false; this.cancelled = false; this.t0 = performance.now();
      log.info('listening (push-to-talk)');
      const C = window.CASE || {};
      // Character and place names, boosted so "Ferrand" doesn't come back as "for hand".
      const words = [...new Set((C.characters || []).flatMap((c) => String(c.name || '').split(/[\s'’.-]+/)).filter((w) => w.length > 2 && /^[A-ZÀ-Ý]/.test(w)))].slice(0, 60);
      const mic = navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      mic.catch(() => {}); // handled below
      let tok;
      try { tok = await token(); } catch (e) { mic.then((s) => s.getTracks().forEach((t) => t.stop())).catch(() => {}); throw e; }
      const url = new URL(WSS + '/asr'); url.searchParams.set('token', tok);
      const ws = (this.ws = new WebSocket(url));
      ws.onopen = () => {
        log.debug('stt socket open', { queued: this.queue.length, ms: Math.round(performance.now() - this.t0) });
        const jc = { language: (C.voice && C.voice.sttLanguage) || 'en', ...(words.length ? { keywords: { words, boost: 3 } } : {}) };
        ws.send(JSON.stringify({ type: 'setup', model_name: 'default', input_format: 'pcm', json_config: jc }));
        this.open = true; for (const m of this.queue) ws.send(m); this.queue = [];
      };
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.type === 'text') { this.text += (this.text ? ' ' : '') + m.text.trim(); log.debug('stt partial', { text: this.text }); this.on.partial && this.on.partial(this.text); }
        else if (m.type === 'flushed' && this.resolveFlush) this.resolveFlush();
        else if (m.type === 'error') { log.error('stt error', m); this.on.error && this.on.error(m); }
      };
      ws.onerror = () => log.error('stt socket error');
      try { this.stream = await mic; }
      catch (e) { log.error('microphone unavailable', { error: e.name + ': ' + e.message }); try { ws.close(); } catch (_) {} throw e; }
      if (this.cancelled) { this.stream.getTracks().forEach((t) => t.stop()); try { ws.close(); } catch (_) {} return; } // cancelled while the mic was opening
      this.ac = new AudioContext({ sampleRate: RATE });
      const src = this.ac.createMediaStreamSource(this.stream);
      this.node = this.ac.createScriptProcessor(2048, 1, 1); // ~85 ms chunks; an AudioWorklet in production
      this.node.onaudioprocess = (e) => {
        const f = e.inputBuffer.getChannelData(0); let m = 0; for (const v of f) m = Math.max(m, Math.abs(v)); this.level = m;
        const msg = JSON.stringify({ type: 'audio', audio: b64FromF32(f) });
        if (this.open) ws.send(msg); else this.queue.push(msg);
      };
      src.connect(this.node); this.node.connect(this.ac.destination);
      log.debug('mic live', { ms: Math.round(performance.now() - this.t0) });
    }
    // Drop everything: mic off, socket closed, nothing transcribed or sent (e.g. the game lost focus).
    cancel() {
      this.cancelled = true;
      try { this.node && this.node.disconnect(); } catch (_) {}
      this.stream && this.stream.getTracks().forEach((t) => t.stop()); try { this.ac && this.ac.state !== 'closed' && this.ac.close(); } catch (_) {}
      this.queue = []; this.open = false; try { this.ws && this.ws.close(); } catch (_) {}
      log.info('listening cancelled');
    }
    async stop() {
      const t0 = performance.now();
      try { this.node && this.node.disconnect(); } catch (_) {}
      this.stream && this.stream.getTracks().forEach((t) => t.stop()); this.ac && this.ac.close();
      if (this.ws && this.ws.readyState <= 1) {
        await new Promise((res) => {
          let flushed = false; this.resolveFlush = () => { flushed = true; res(); };
          // Flush alone drops the last word: the model holds back its last words waiting for context. Half a second
          // of silence first lets it finish the sentence. Measured 26 Sept on clips cut right at the last sound:
          // 0.33 s lost "o'clock", 0.5 s kept every word and answers ~200 ms sooner than the 1 s we used before.
          const silence = JSON.stringify({ type: 'audio', audio: b64FromF32(new Float32Array(2000)) });
          const tail = [...Array(6).fill(silence), JSON.stringify({ type: 'flush', flush_id: 1 })];
          if (this.open) tail.forEach((m) => this.ws.send(m)); else this.queue.push(...tail);
          setTimeout(() => { if (flushed) return; log.warn('stt flush timed out, using partial text'); res(); }, 2500);
        });
        try { this.ws.send(JSON.stringify({ type: 'end_of_stream' })); this.ws.close(); } catch (_) {}
      }
      log.info('heard', { text: this.text.trim() || '(nothing)', flushMs: Math.round(performance.now() - t0) });
      return english(this.text.trim());
    }
  }


  // ---------- speech-to-text with Gemini (the default) ----------
  // The mic streams to gemini-3.5-transcribe-live (single-use token from /api/stt-token): live words on screen, the
  // final text ~0.3 s after the player stops. It has no language lock, so heavily accented English can come back in
  // another script or language, or spelled letter by letter; then the recorded audio is read again by Gemini flash
  // with the game's context (/api/transcribe), which got every test clip right. If Gemini can't be reached at all,
  // Gradium takes over (GradiumListener). Same interface: start(), stop() -> text, cancel(), level, on.partial.
  const G_RATE = 16000;
  const garbled = (t) => !t || /[¿¡]/.test(t) || /[^\u0000-ɏḀ-ỿ -⁯€\s]/.test(t) || /(?:\b\w\b[\s.-]+){3,}/.test(t) || looksForeign(t);
  function wav16(chunks) {
    const n = chunks.reduce((a, c) => a + c.length, 0), b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, G_RATE, true); v.setUint32(28, G_RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
    let o = 44; for (const c of chunks) for (let i = 0; i < c.length; i++, o += 2) v.setInt16(o, c[i], true);
    const u8 = new Uint8Array(b); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  // Live words on screen while the player speaks. transcribe-live only sends a phrase once the player pauses, so
  // Gradium listens to the same audio in parallel just to show the words as they come; Gemini's text replaces them.
  function gradiumPartials(onText) {
    let ws = null, open = false, dead = false, q = [], text = '';
    token().then((tok) => {
      if (dead) return;
      ws = new WebSocket(WSS + '/asr?token=' + encodeURIComponent(tok));
      ws.onopen = () => { ws.send(JSON.stringify({ type: 'setup', model_name: 'default', input_format: 'pcm', json_config: { language: 'en' } })); open = true; for (const m of q) ws.send(m); q = []; };
      ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.type === 'text' && m.text) { text += (text ? ' ' : '') + m.text.trim(); onText(text); } };
      ws.onerror = () => {};
    }).catch(() => {});
    return {
      send(i16) {                                           // 16 kHz int16 -> 24 kHz float32 (Gradium's input)
        if (dead) return;
        const n = Math.floor(i16.length * 1.5), f = new Float32Array(n);
        for (let i = 0; i < n; i++) { const x = i / 1.5, j = Math.floor(x), a = i16[j] || 0, b = i16[j + 1] ?? a; f[i] = (a + (b - a) * (x - j)) / 32768; }
        const m = JSON.stringify({ type: 'audio', audio: b64FromF32(f) });
        if (open && ws.readyState === 1) ws.send(m); else if (q.length < 200) q.push(m);
      },
      close() { dead = true; try { ws && ws.close(); } catch (_) {} },
    };
  }
  class Listener {
    constructor(on = {}) { this.on = on; }
    // What the player sees while speaking: Gemini's finished phrases, then Gradium's live words beyond them.
    show() {
      const g = this.gtext || '', tail = g.length > this.gAt ? g.slice(this.gAt).trim() : '';
      const t = (this.text.trim() ? this.text.trim() + (tail ? ' ' + tail : '') : g).trim();
      if (t) this.on.partial && this.on.partial(t);
    }
    async start() {
      this.text = ''; this.gtext = ''; this.gAt = 0; this.pcm = []; this.queue = []; this.ready = false; this.cancelled = false; this.impl = null; this.pending = false; this.t0 = performance.now();
      const mic = navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }); mic.catch(() => {});
      let tok;
      try { const r = await fetch((window.API_BASE || '') + '/api/stt-token'); if (!r.ok) throw new Error('status ' + r.status); tok = await r.json(); }
      catch (e) {
        log.warn('gemini speech token failed, using Gradium', { error: String(e.message || e) });
        mic.then((st) => st.getTracks().forEach((t) => t.stop())).catch(() => {});
        this.impl = new GradiumListener(this.on); return this.impl.start();
      }
      log.info('listening (Gemini transcribe-live)');
      this.gp = gradiumPartials((g) => { this.gtext = g; this.show(); });
      const ws = (this.ws = new WebSocket('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=' + encodeURIComponent(tok.token)));
      ws.onopen = () => ws.send(JSON.stringify({ setup: { model: 'models/' + tok.model } }));
      ws.onmessage = async (e) => {
        const m = JSON.parse(typeof e.data === 'string' ? e.data : await e.data.text());
        if (m.setupComplete) { this.ready = true; for (const q of this.queue) ws.send(q); this.queue = []; log.debug('gemini stt ready', { ms: Math.round(performance.now() - this.t0) }); }
        const t = m.serverContent && m.serverContent.inputTranscription && m.serverContent.inputTranscription.text;
        if (t) { this.text += t; this.gAt = (this.gtext || '').length; this.show(); }
        // Gemini hears when speech starts and stops by itself: a phrase is final at generationComplete.
        if (m.voiceActivity && m.voiceActivity.type === 'ACTIVITY_START') this.pending = true;
        if (m.serverContent && (m.serverContent.generationComplete || m.serverContent.turnComplete)) { this.pending = false; this.resolveEnd && this.resolveEnd(); }
      };
      ws.onerror = () => log.error('gemini stt socket error');
      ws.onclose = (e) => { if (this.resolveEnd) this.resolveEnd(); if (e.code !== 1000) log.warn('gemini stt closed', { code: e.code, reason: e.reason }); };
      try { this.stream = await mic; }
      catch (e) { log.error('microphone unavailable', { error: e.name + ': ' + e.message }); try { ws.close(); } catch (_) {} throw e; }
      if (this.cancelled) { this.stream.getTracks().forEach((t) => t.stop()); try { ws.close(); } catch (_) {} return; }
      this.ac = new AudioContext({ sampleRate: G_RATE });
      const src = this.ac.createMediaStreamSource(this.stream);
      this.node = this.ac.createScriptProcessor(2048, 1, 1);
      this.node.onaudioprocess = (e) => {
        const f = e.inputBuffer.getChannelData(0); let mx = 0; const i16 = new Int16Array(f.length);
        for (let i = 0; i < f.length; i++) { const v = Math.max(-1, Math.min(1, f[i])); mx = Math.max(mx, Math.abs(v)); i16[i] = v < 0 ? v * 32768 : v * 32767; }
        this.level = mx; this.pcm.push(i16); this.gp && this.gp.send(i16);
        const u8 = new Uint8Array(i16.buffer); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
        const msg = JSON.stringify({ realtimeInput: { audio: { data: btoa(s), mimeType: 'audio/pcm;rate=' + G_RATE } } });
        if (this.ready && ws.readyState === 1) ws.send(msg); else this.queue.push(msg);
      };
      src.connect(this.node); this.node.connect(this.ac.destination);
    }
    cancel() {
      if (this.impl) return this.impl.cancel();
      this.gp && this.gp.close();
      this.cancelled = true; try { this.node && this.node.disconnect(); } catch (_) {}
      this.stream && this.stream.getTracks().forEach((t) => t.stop()); try { this.ac && this.ac.state !== 'closed' && this.ac.close(); } catch (_) {}
      this.queue = []; try { this.ws && this.ws.close(); } catch (_) {}
      log.info('listening cancelled');
    }
    async stop() {
      if (this.impl) return this.impl.stop();
      this.gp && this.gp.close();                          // live words were for the screen only
      const t0 = performance.now();
      try { this.node && this.node.disconnect(); } catch (_) {}
      this.stream && this.stream.getTracks().forEach((t) => t.stop()); this.ac && this.ac.close();
      const ws = this.ws;
      if (ws && ws.readyState === 1) {
        await new Promise((res) => {
          this.resolveEnd = res;
          for (const q of this.queue) try { ws.send(q); } catch (_) {}
          this.queue = [];
          try { ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } })); } catch (_) { res(); }
          if (!this.pending && this.text.trim()) res();          // the last phrase is already final: no wait
          setTimeout(res, 1500);
        });
        try { ws.close(); } catch (_) {}
      }
      let text = this.text.replace(/\s+/g, ' ').trim();
      const secs = this.pcm.reduce((a, c) => a + c.length, 0) / G_RATE;
      // Silence (or a muted mic) is never sent for a second opinion: with the game's context, Gemini flash invents a
      // plausible question from nothing ("Do you know where Bruno is?", measured). Peak below ~1.5% = nobody spoke.
      let peak = 0; for (const c of this.pcm) for (let i = 0; i < c.length; i += 4) { const v = Math.abs(c[i]); if (v > peak) peak = v; }
      if (peak < 500) { log.info('heard nothing (silence)', { secs: +secs.toFixed(1), peak }); return ''; }
      log.info('heard (gemini live)', { text: text || '(nothing)', ms: Math.round(performance.now() - t0), secs: +secs.toFixed(1) });
      if (secs > 0.4 && garbled(text)) {
        // Second opinion: the whole recording, read by Gemini flash with the game's context.
        const t1 = performance.now();
        try {
          const r = await fetch((window.API_BASE || '') + '/api/transcribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ audio: wav16(this.pcm) }), signal: AbortSignal.timeout(6000) });
          if (!r.ok) throw new Error('status ' + r.status);
          const j = await r.json();
          log.info('re-transcribed (gemini flash)', { from: text, to: j.text, ms: Math.round(performance.now() - t1) });
          if (j.text) return j.text;
        } catch (e) { log.warn('second pass failed', { error: String(e.message || e) }); }
        return english(text);
      }
      return text;
    }
  }

  // The game is English only, but Gradium's `language: 'en'` is a hint, not a lock: an accent or a noisy mic can
  // come back as Spanish or French. When a transcript looks non-English, the server (server/english.mjs, Gemini)
  // rewrites it as the English sentence the player meant. English transcripts skip this and cost nothing.
  const FOREIGN = new Set(('el los las que usted ustedes estaba dónde donde qué por con una pero cuando anoche está esta eso esto muy también ' +
    'señor usted cómo porque vous nous je est pas avec où une des du dans sur qui quoi était êtes monsieur pourquoi comment ' +
    'você não uma com der das und ist nicht sie ich wo wer warum il di che non sono de del').split(' '));
  function looksForeign(text) {
    const C = window.CASE || {};
    const names = new Set((C.characters || []).flatMap((c) => String(c.name || '').toLowerCase().split(/[\s'’.-]+/)));
    const words = text.toLowerCase().replace(/[^\p{L}\s'’-]/gu, ' ').split(/\s+/).filter((w) => w && !names.has(w));
    if (!words.length) return false;
    if (/[¿¡ñãõßáíóúàèìòùâêîôûäöüç]/.test(words.join(' '))) return true;
    const hits = words.filter((w) => FOREIGN.has(w)).length;
    return hits >= 2 || (hits >= 1 && words.length <= 3);
  }
  async function english(text) {
    if (!text || !looksForeign(text)) return text;
    const t0 = performance.now();
    try {
      const r = await fetch((window.API_BASE || '') + '/api/english', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(4000) });
      if (!r.ok) throw new Error('status ' + r.status);
      const out = (await r.json()).text || text;
      log.info('rewrote in English', { from: text, to: out, ms: Math.round(performance.now() - t0) });
      return out;
    } catch (e) { log.warn('could not rewrite in English, keeping the transcript', { text, error: String(e.message || e) }); return text; }
  }

  window.VOICE = { Player, player, Speech, Listener, GradiumListener, token, settingsFor, nextChunk, english, looksForeign };
})();
