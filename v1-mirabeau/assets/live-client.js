// Minimal browser client for the Gemini Live API (raw WebSocket, no SDK, no build step).
// One LiveSession = one character interview. Push-to-talk mic in (16 kHz PCM16),
// audio out (24 kHz PCM16), transcripts both ways, tool calls, resumption, goAway.
//
// PRODUCTION: pass `token` (an ephemeral token minted by server/token-worker.js with the
// character's config LOCKED in it) and leave `setup` empty - the prompt never reaches the browser.
// PROTOTYPE: pass `apiKey` + `setup` (the key is exposed to the page: local dev only).
//
// Written against ai.google.dev/api/live as of 2026-09-26. Not yet run against the live service.
(function () {
  const HOST = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService';

  const b64FromInt16 = (i16) => { let s = ''; const u8 = new Uint8Array(i16.buffer); for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const int16FromB64 = (b64) => { const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Int16Array(u8.buffer); };

  class Player { // gapless 24 kHz playback + level meter for lip-flap
    constructor() { this.ac = new AudioContext({ sampleRate: 24000 }); this.an = this.ac.createAnalyser(); this.an.fftSize = 512; this.an.connect(this.ac.destination); this.t = 0; this.src = []; this.buf = new Float32Array(512); }
    push(b64) {
      const i16 = int16FromB64(b64), f = new Float32Array(i16.length);
      for (let i = 0; i < i16.length; i++) f[i] = i16[i] / 32768;
      const ab = this.ac.createBuffer(1, f.length, 24000); ab.copyToChannel(f, 0);
      const s = this.ac.createBufferSource(); s.buffer = ab; s.connect(this.an);
      this.t = Math.max(this.t, this.ac.currentTime + 0.03); s.start(this.t); this.t += ab.duration;
      this.src.push(s); s.onended = () => { this.src = this.src.filter((x) => x !== s); };
    }
    flush() { this.src.forEach((s) => { try { s.stop(); } catch (_) {} }); this.src = []; this.t = 0; }
    level() { this.an.getFloatTimeDomainData(this.buf); let m = 0; for (const v of this.buf) m = Math.max(m, Math.abs(v)); return m; }
    get speaking() { return this.src.length > 0; }
  }

  class Mic { // 16 kHz mono PCM16 chunks of ~32 ms
    async start(onChunk) {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      this.ac = new AudioContext({ sampleRate: 16000 });
      const src = this.ac.createMediaStreamSource(this.stream);
      this.node = this.ac.createScriptProcessor(512, 1, 1); // an AudioWorklet in production
      this.on = false; this.level = 0;
      this.node.onaudioprocess = (e) => {
        const f = e.inputBuffer.getChannelData(0); let m = 0;
        const i16 = new Int16Array(f.length);
        for (let i = 0; i < f.length; i++) { const v = Math.max(-1, Math.min(1, f[i])); i16[i] = v * 32767; m = Math.max(m, Math.abs(v)); }
        this.level = m; if (this.on) onChunk(b64FromInt16(i16));
      };
      src.connect(this.node); this.node.connect(this.ac.destination);
    }
    stop() { this.stream && this.stream.getTracks().forEach((t) => t.stop()); this.ac && this.ac.close(); }
  }

  class LiveSession {
    // opts: { apiKey | token, setup, on: { open, text(role, delta), turn(), tool(call), interrupted(), close(ev), error(e), raw(dir, msg) } }
    constructor(opts) { this.o = opts; this.on = opts.on || {}; this.player = new Player(); this.handle = null; }
    connect() {
      const o = this.o;
      const url = o.token ? `${HOST}.BidiGenerateContentConstrained?access_token=${encodeURIComponent(o.token)}` : `${HOST}.BidiGenerateContent?key=${encodeURIComponent(o.apiKey)}`;
      return new Promise((resolve, reject) => {
        const ws = (this.ws = new WebSocket(url));
        ws.onopen = () => {
          const setup = Object.assign({}, o.setup || {});
          if (this.handle) setup.sessionResumption = { handle: this.handle };
          this.send({ setup });
        };
        ws.onerror = (e) => { this.on.error && this.on.error(e); reject(e); };
        ws.onclose = (e) => { this.on.close && this.on.close(e); };
        ws.onmessage = async (ev) => {
          const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : await ev.data.text());
          this.on.raw && this.on.raw('in', msg);
          if (msg.setupComplete) { resolve(this); this.on.open && this.on.open(); }
          const sc = msg.serverContent;
          if (sc) {
            if (sc.interrupted) { this.player.flush(); this.on.interrupted && this.on.interrupted(); }
            for (const p of (sc.modelTurn && sc.modelTurn.parts) || []) if (p.inlineData && p.inlineData.data) this.player.push(p.inlineData.data);
            if (sc.inputTranscription && sc.inputTranscription.text) this.on.text && this.on.text('user', sc.inputTranscription.text);
            if (sc.outputTranscription && sc.outputTranscription.text) this.on.text && this.on.text('model', sc.outputTranscription.text);
            if (sc.turnComplete) this.on.turn && this.on.turn();
          }
          if (msg.toolCall) for (const fc of msg.toolCall.functionCalls || []) {
            const res = (this.on.tool && this.on.tool(fc)) || { ok: true };
            this.send({ toolResponse: { functionResponses: [{ id: fc.id, name: fc.name, response: Object.assign({ scheduling: 'SILENT' }, res) }] } });
          }
          if (msg.sessionResumptionUpdate && msg.sessionResumptionUpdate.newHandle) this.handle = msg.sessionResumptionUpdate.newHandle;
          if (msg.goAway) { this.ws.close(); setTimeout(() => this.connect(), 50); } // resume with the saved handle
        };
      });
    }
    send(m) { this.on.raw && this.on.raw('out', m); this.ws && this.ws.readyState === 1 && this.ws.send(JSON.stringify(m)); }
    // Text the character "hears" (typed questions, [EVIDENCE PRESENTED], [DIRECTOR] notes). Ordered, and ends the turn.
    say(text) { this.send({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } }); }
    // Push-to-talk. Automatic activity detection is disabled in the setup, so we mark the turn ourselves.
    async talkStart() {
      if (!this.mic) { this.mic = new Mic(); await this.mic.start((b64) => this.send({ realtimeInput: { audio: { data: b64, mimeType: 'audio/pcm;rate=16000' } } })); }
      this.player.flush(); this.send({ realtimeInput: { activityStart: {} } }); this.mic.on = true;
    }
    talkEnd() { if (!this.mic) return; this.mic.on = false; this.send({ realtimeInput: { activityEnd: {} } }); }
    close() { this.mic && this.mic.stop(); this.player.flush(); this.ws && this.ws.close(); }
  }

  // Builds the raw-protocol setup message from the config shape build-prompt.mjs produces.
  function setupFrom(liveConfig) {
    const c = liveConfig.config;
    return {
      model: 'models/' + liveConfig.model,
      generationConfig: { responseModalities: c.responseModalities, speechConfig: c.speechConfig },
      systemInstruction: { parts: [{ text: c.systemInstruction }] },
      tools: c.tools, inputAudioTranscription: c.inputAudioTranscription, outputAudioTranscription: c.outputAudioTranscription,
      realtimeInputConfig: c.realtimeInputConfig, sessionResumption: c.sessionResumption, contextWindowCompression: c.contextWindowCompression,
    };
  }

  window.GeminiLive = { LiveSession, Player, Mic, setupFrom };
})();
