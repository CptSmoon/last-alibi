// A single-use Gemini Live token for the browser's speech-to-text: GET /api/stt-token -> { token, model }.
// The player's voice streams straight from the browser to Gemini's transcription model (gemini-3.5-transcribe-live,
// ~0.3 s after they stop talking); the API key stays on the server. The token is locked to that model, one session,
// and expires in two minutes. assets/voice.js falls back to Gradium when this fails.
import { logger } from './log.mjs';

const log = logger('stt-token');

export async function sttToken(S, key, rid) {
  if (!key) return { status: 503, body: { error: 'GEMINI_API_KEY missing' } };
  const model = (S.voice && S.voice.sttModel) || 'gemini-3.5-transcribe-live', t0 = Date.now();
  const at = (s) => new Date(Date.now() + s * 1000).toISOString();
  const r = await fetch('https://generativelanguage.googleapis.com/v1alpha/auth_tokens', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, signal: AbortSignal.timeout(5000),
    body: JSON.stringify({ uses: 1, expireTime: at(120), newSessionExpireTime: at(60), bidiGenerateContentSetup: { model: 'models/' + model } }),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e.message || e) }));
  if (!r.ok) { log.error('token failed', { rid, status: r.status, error: (await r.text()).slice(0, 160) }); return { status: 502, body: { error: 'could not create a speech token' } }; }
  const j = await r.json();
  log.info('token', { rid, model, ms: Date.now() - t0 });
  return { status: 200, body: { token: j.name, model } };
}
