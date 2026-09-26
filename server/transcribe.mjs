// The player's spoken question, transcribed by Gemini: POST /api/transcribe { audio } -> { text }.
// `audio` is a base64 16-bit mono WAV recorded while the player held the mic (assets/voice.js). Gradium still
// streams the live words on screen while they speak; this gives the final text. Gradium alone was poor on real,
// accented speech; Gemini flash with the game's context (who is speaking, the cast's names) got every test clip
// right, including two heavily accented ones Gradium turned into nonsense (measured 26 Sept, ~1.2-2 s).
import { logger } from './log.mjs';

const log = logger('transcribe');
const MAX_B64 = 3_000_000; // ~30 s of 24 kHz 16-bit mono

export async function transcribe(S, key, b, rid) {
  const t0 = Date.now();
  const audio = typeof b?.audio === 'string' ? b.audio : '';
  if (!audio || audio.length > MAX_B64 || !/^[A-Za-z0-9+/=]+$/.test(audio.slice(0, 200))) return { status: 400, body: { error: 'audio (base64 wav) required, max ~30 s' } };
  if (!key) return { status: 503, body: { error: 'GEMINI_API_KEY missing' } };
  const names = [...new Set(S.characters.flatMap((c) => c.name.split(/\s+/)).filter((w) => w.length > 2 && /^[A-ZÀ-Ý]/.test(w)))].join(', ');
  const prompt = `You transcribe what the player says in a 1931 murder-mystery game aboard the Simplon-Orient Express. The player is a police inspector questioning people, speaking English, often with an accent. Names you may hear: ${names}. Places: compartment 1 to 7, the corridor, the dining car, the kitchen, the lounge car.
Output only the words the player said, in English (translate if they used another language). No quotes, no notes. If there is no speech, output nothing.`;
  const models = [[S.brain.model, { thinkingLevel: 'low' }], [S.brain.fallbackModel, { thinkingLevel: 'minimal' }]].filter(([m]) => m);
  for (const [model, thinking] of models) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, signal: AbortSignal.timeout(8000),
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'audio/wav', data: audio } }, { text: prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 1024, thinkingConfig: thinking } }),   // thinking counts here too: 300 cut answers to one word
      });
      if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 160)}`);
      const j = await r.json();
      const text = (j.candidates?.[0]?.content?.parts || []).map((p) => (p.thought ? '' : p.text || '')).join('').replace(/\s+/g, ' ').trim().replace(/^["“]|["”]$/g, '');
      log.info('transcribed', { rid, model, kb: Math.round(audio.length * 0.75 / 1024), chars: text.length, ms: Date.now() - t0 });
      log.debug('text', { rid, text });
      return { status: 200, body: { text, model } };
    } catch (e) { log.warn('model failed', { rid, model, error: String(e.message || e).slice(0, 160) }); }
  }
  return { status: 502, body: { error: 'transcription failed' } };
}
