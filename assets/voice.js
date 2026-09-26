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
      speed: pick(over.speed, v.gradiumSpeed, g.gradiumSpeed, DEFAULTS.speed),
      temp: pick(over.temp, v.gradiumTemp, g.gradiumTemp, DEFAULTS.temp),
    };
  }

  // Gapless 24 kHz playback with a level meter for lip-flap. push() returns when the chunk will
  // play (AudioContext time), so a Speech can follow its own playhead for captions.
  class Player {
    constructor() { this.ac = null; this.t = 0; this.src = new Set(); }
    ensure() {
      if (!this.ac) { log.info('audio output ready', { sampleRate: RATE }); this.ac = new AudioContext({ sampleRate: RATE }); this.an = this.ac.createAnalyser(); this.an.fftSize = 512; this.an.connect(this.ac.destination); this.buf = new Float32Array(512); }
      if (this.ac.state === 'suspended') this.ac.resume();
      return this.ac;
    }
    push(f32) {
      const ac = this.ensure(), ab = ac.createBuffer(1, f32.length, RATE); ab.copyToChannel(f32, 0);
      const s = ac.createBufferSource(); s.buffer = ab; s.connect(this.an);
      // Start the first chunk right away (a few ms of headroom), then queue the rest back to back.
      const at = (this.t = Math.max(this.t, ac.currentTime + 0.03)); s.start(at); this.t += ab.duration;
      this.src.add(s); s.onended = () => this.src.delete(s);
      return { at, dur: ab.duration };
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
      this.segs.push({ at: p.at, off: this.audioSec, dur: p.dur }); this.audioSec += p.dur;
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
      for (const g of this.segs) { if (now < g.at) break; s = g.off + Math.min(g.dur, now - g.at); }
      return s;
    }
    get finished() { return this.failed || (this.eos && (!this.segs.length || player.now() >= this.segs[this.segs.length - 1].at + this.segs[this.segs.length - 1].dur)); }
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
  class Listener {
    constructor(on = {}) { this.on = on; }
    async start() {
      this.text = ''; this.queue = []; this.open = false; this.t0 = performance.now();
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
    async stop() {
      const t0 = performance.now();
      try { this.node && this.node.disconnect(); } catch (_) {}
      this.stream && this.stream.getTracks().forEach((t) => t.stop()); this.ac && this.ac.close();
      if (this.ws && this.ws.readyState <= 1) {
        await new Promise((res) => {
          let flushed = false; this.resolveFlush = () => { flushed = true; res(); }; const go = () => this.ws.send(JSON.stringify({ type: 'flush', flush_id: 1 }));
          if (this.open) go(); else this.queue.push(JSON.stringify({ type: 'flush', flush_id: 1 }));
          setTimeout(() => { if (flushed) return; log.warn('stt flush timed out, using partial text'); res(); }, 1500);
        });
        try { this.ws.send(JSON.stringify({ type: 'end_of_stream' })); this.ws.close(); } catch (_) {}
      }
      log.info('heard', { text: this.text.trim() || '(nothing)', flushMs: Math.round(performance.now() - t0) });
      return this.text.trim();
    }
  }

  window.VOICE = { Player, player, Speech, Listener, token, settingsFor, nextChunk };
})();
