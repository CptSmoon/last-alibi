// Gradium voice in the browser: push-to-talk speech-to-text and streaming text-to-speech.
// The API key never reaches the page: server/server.mjs mints a short-lived, single-use token
// per WebSocket (GET /api/gradium-token), as Gradium's browser guide recommends.
// Wire protocol: docs.gradium.ai/guides/websocket-lifecycle (checked 2026-09-26).
(function () {
  const WSS = 'wss://api.gradium.ai/api/speech';
  const RATE = 24000; // STT input "pcm" = 24 kHz; TTS output "pcm_24000"

  async function token() {
    const r = await fetch('/api/gradium-token');
    if (!r.ok) throw new Error('no Gradium token (is the server running?)');
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

  // Gapless 24 kHz playback with a level meter for lip-flap.
  class Player {
    constructor() { this.ac = null; this.t = 0; this.src = new Set(); }
    ensure() {
      if (!this.ac) { this.ac = new AudioContext({ sampleRate: RATE }); this.an = this.ac.createAnalyser(); this.an.fftSize = 512; this.an.connect(this.ac.destination); this.buf = new Float32Array(512); }
      if (this.ac.state === 'suspended') this.ac.resume();
      return this.ac;
    }
    push(f32) {
      const ac = this.ensure(), ab = ac.createBuffer(1, f32.length, RATE); ab.copyToChannel(f32, 0);
      const s = ac.createBufferSource(); s.buffer = ab; s.connect(this.an);
      this.t = Math.max(this.t, ac.currentTime + 0.05); s.start(this.t); this.t += ab.duration;
      this.src.add(s); s.onended = () => this.src.delete(s);
    }
    flush() { for (const s of this.src) { try { s.stop(); } catch (_) {} } this.src.clear(); this.t = 0; }
    level() { if (!this.an || !this.src.size) return 0; this.an.getFloatTimeDomainData(this.buf); let m = 0; for (const v of this.buf) m = Math.max(m, Math.abs(v)); return m; }
    get speaking() { return this.src.size > 0; }
  }
  const player = new Player();

  // One reply = one TTS socket. Text arrives in pieces from the brain; we forward whole
  // phrases (Gradium's LLM-to-TTS recipe) and end with <flush> + end_of_stream.
  class Speech {
    constructor(voiceId, on = {}) { this.voiceId = voiceId; this.on = on; this.queue = []; this.buf = ''; this.open = false; this.closed = false; this.start(); }
    async start() {
      try {
        const url = new URL(WSS + '/tts'); url.searchParams.set('token', await token());
        const ws = (this.ws = new WebSocket(url));
        ws.onopen = () => {
          ws.send(JSON.stringify({ type: 'setup', model_name: 'default', voice_id: this.voiceId, output_format: 'pcm_24000' }));
          this.open = true; for (const m of this.queue) ws.send(m); this.queue = [];
        };
        ws.onmessage = (ev) => {
          const m = JSON.parse(ev.data);
          if (m.type === 'audio') player.push(f32FromB64(m.audio));
          else if (m.type === 'error') this.on.error && this.on.error(m);
          else if (m.type === 'end_of_stream') this.on.done && this.on.done();
        };
        ws.onerror = (e) => this.on.error && this.on.error(e);
      } catch (e) { this.on.error && this.on.error(e); }
    }
    send(obj) { const m = JSON.stringify(obj); if (this.open) this.ws.send(m); else this.queue.push(m); }
    text(delta) {
      this.buf += delta;
      const cut = Math.max(this.buf.lastIndexOf('. '), this.buf.lastIndexOf('? '), this.buf.lastIndexOf('! '), this.buf.lastIndexOf(', '));
      if (cut > 0 || this.buf.length > 90) {
        const at = cut > 0 ? cut + 1 : this.buf.lastIndexOf(' ');
        if (at > 0) { this.send({ type: 'text', text: this.buf.slice(0, at).trim() }); this.buf = this.buf.slice(at); }
      }
    }
    end() {
      if (this.closed) return; this.closed = true;
      this.send({ type: 'text', text: (this.buf.trim() + ' <flush>').trim() }); this.buf = '';
      this.send({ type: 'end_of_stream' });
    }
    cancel() { this.closed = true; try { this.ws && this.ws.close(); } catch (_) {} player.flush(); }
  }

  // Push-to-talk transcription. start() opens the socket and the mic; stop() flushes and
  // resolves with the final text.
  class Listener {
    constructor(on = {}) { this.on = on; }
    async start() {
      this.text = ''; this.queue = []; this.open = false;
      const url = new URL(WSS + '/asr'); url.searchParams.set('token', await token());
      const ws = (this.ws = new WebSocket(url));
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'setup', model_name: 'default', input_format: 'pcm', json_config: { language: CASE.voice.sttLanguage || 'en' } }));
        this.open = true; for (const m of this.queue) ws.send(m); this.queue = [];
      };
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.type === 'text') { this.text += (this.text ? ' ' : '') + m.text.trim(); this.on.partial && this.on.partial(this.text); }
        else if (m.type === 'flushed' && this.resolveFlush) this.resolveFlush();
        else if (m.type === 'error') this.on.error && this.on.error(m);
      };
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      this.ac = new AudioContext({ sampleRate: RATE });
      const src = this.ac.createMediaStreamSource(this.stream);
      this.node = this.ac.createScriptProcessor(2048, 1, 1); // ~85 ms chunks; an AudioWorklet in production
      this.node.onaudioprocess = (e) => {
        const f = e.inputBuffer.getChannelData(0); let m = 0; for (const v of f) m = Math.max(m, Math.abs(v)); this.level = m;
        const msg = JSON.stringify({ type: 'audio', audio: b64FromF32(f) });
        if (this.open) ws.send(msg); else this.queue.push(msg);
      };
      src.connect(this.node); this.node.connect(this.ac.destination);
    }
    async stop() {
      try { this.node && this.node.disconnect(); } catch (_) {}
      this.stream && this.stream.getTracks().forEach((t) => t.stop()); this.ac && this.ac.close();
      if (this.ws && this.ws.readyState <= 1) {
        await new Promise((res) => {
          this.resolveFlush = res; const go = () => this.ws.send(JSON.stringify({ type: 'flush', flush_id: 1 }));
          if (this.open) go(); else this.queue.push(JSON.stringify({ type: 'flush', flush_id: 1 }));
          setTimeout(res, 1500);
        });
        try { this.ws.send(JSON.stringify({ type: 'end_of_stream' })); this.ws.close(); } catch (_) {}
      }
      return this.text.trim();
    }
  }

  window.VOICE = { Player, player, Speech, Listener, token };
})();
