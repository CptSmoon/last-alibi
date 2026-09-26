// Cloudflare Worker: serves the built game (dist/, via the static-assets binding) and the game API.
//   GET  /api/status          -> { live, brain, voice, model }
//   GET  /api/gradium-token   -> { token, expires_at }  single-use Gradium WebSocket token
//   POST /api/talk            -> Server-Sent Events from the Gemini brain (same contract as server/server.mjs)
//   POST /api/notes/organize  -> the notebook secretary (server/notes.mjs)
//   POST /api/claims          -> factual claims in one answer (server/claims.mjs)
//   POST /api/english         -> a transcript rewritten in English (server/english.mjs)
// Secrets (wrangler secret put): GEMINI_API_KEY, GRADIUM_API_KEY. The scenario (with the solution) is bundled
// into this Worker and never served: static files come only from dist/ (tools/build-web.mjs, an allow-list).
// Keep /api/talk in step with server/server.mjs talk(): same inputs, same events, same confession gate.
import scenario from '../scenario/orient.json';
import { buildSystemInstruction, TOOLS, evidenceMessage, directorNote, CONFESSION_NEEDS, confessionSecret, revealable, toMin, fmt } from '../prompts/prompt-core.mjs';
import { organize as organizeNotes } from '../server/notes.mjs';
import { toEnglish } from '../server/english.mjs';
import { extractClaims } from '../server/claims.mjs';
import { judge } from '../server/judge.mjs';
import { sidekick } from '../server/sidekick.mjs';
import { detectReveals } from '../server/reveals.mjs';
import { logger, reqId } from '../server/log.mjs';

const S = scenario;
const log = logger('worker'), tlog = logger('talk');

// ---- CORS: same origin, itch.io game frames, and anything listed in ALLOWED_ORIGINS ----
function corsOrigin(req, env) {
  const o = req.headers.get('origin');
  if (!o) return null;
  const extra = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const host = new URL(req.url).origin;
  if (o === host || extra.includes(o) || /^https:\/\/([\w-]+\.)*itch\.(zone|io)$/.test(o)) return o;
  return null;
}
const withCors = (res, origin) => {
  if (!origin) return res;
  const h = new Headers(res.headers);
  h.set('access-control-allow-origin', origin); h.set('vary', 'origin');
  h.set('access-control-allow-methods', 'GET, POST, OPTIONS'); h.set('access-control-allow-headers', 'content-type');
  return new Response(res.body, { status: res.status, headers: h });
};
const json = (x, status = 200) => new Response(JSON.stringify(x), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

// ---- rate limits (Workers Rate Limiting bindings; absent in plain local dev) ----
async function limited(env, name, key) {
  const rl = env[name];
  if (!rl || typeof rl.limit !== 'function') return false;
  const { success } = await rl.limit({ key });
  return !success;
}

// ---- Gemini brain (streamed) ----
async function* geminiStream(key, model, payload) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(payload),
  });
  if (!r.ok) { const t = await r.text(); const e = new Error(`Gemini ${r.status}: ${t.slice(0, 300)}`); e.status = r.status; throw e; }
  const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { value, done } = await rd.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (line.startsWith('data:')) yield JSON.parse(line.slice(5));
    }
  }
}

async function talk(b, env) {
  const rid = reqId(), t0 = Date.now();
  const c = S.characters.find((x) => x.id === b.character), ch = S.chapters.find((x) => x.id === b.chapter);
  if (!c || !ch || !c.chapters.includes(ch.id)) return json({ error: 'bad character or chapter' }, 400);
  if (!env.GEMINI_API_KEY) return json({ error: 'GEMINI_API_KEY missing' }, 503);
  const now = Number.isFinite(b.now) ? b.now : toMin(ch.start);
  const history = Array.isArray(b.history) ? b.history.slice(-40) : [];
  const shown = new Set(b.shown || []), revealed = new Set(b.revealed || []);
  const killer = S.solution.killer, conf = confessionSecret(S);

  const inp = b.input || {};
  let say;
  if (inp.kind === 'greet') say = `[DIRECTOR: It is ${fmt(now)}. The inspector has just walked up to you${history.length ? ' again' : ''}. Greet him in one short sentence, in character, as fits the moment.]`;
  else if (inp.kind === 'present') {
    if (!S.evidence.some((e) => e.id === inp.evidence) || ch.phase !== 'after') return json({ error: 'bad evidence' }, 400);
    shown.add(inp.evidence); say = evidenceMessage(S, inp.evidence);
  } else say = String(inp.text || '').slice(0, 800);
  let gateOpen = false;
  if (c.id === killer && ch.phase === 'after' && !revealed.has(conf.id) && CONFESSION_NEEDS.filter((e) => shown.has(e)).length >= 3) {
    gateOpen = true; say += '\n' + directorNote(S, killer, conf.id);
  }
  tlog.info('turn start', { rid, character: c.id, chapter: ch.id, clock: fmt(now), kind: inp.kind || 'say', historyTurns: history.length });

  const { readable, writable } = new TransformStream();
  const w = writable.getWriter(), enc = new TextEncoder();
  const send = (type, data) => w.write(enc.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`));

  (async () => {
    const allowed = new Set(revealable(S, c.id, ch.id).filter((id) => id !== conf.id || gateOpen));
    const unlockOf = Object.fromEntries(c.secrets.map((x) => [x.id, x.unlocks]));
    const newTurns = [{ role: 'user', parts: [{ text: say }] }];
    const system = buildSystemInstruction(S, c.id, ch.id, now);
    const models = [S.brain.model, S.brain.fallbackModel].filter(Boolean);
    try {
      for (let round = 0; round < 3; round++) {
        let parts = [], calls = [];
        for (let attempt = 0; attempt < models.length; attempt++) {
          const model = models[attempt];
          try {
            parts = []; calls = []; let textPart = null;
            const payload = {
              systemInstruction: { parts: [{ text: system }] }, contents: [...history, ...newTurns], tools: TOOLS,
              generationConfig: { maxOutputTokens: 600, ...(model.startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: model.includes('lite') ? 'minimal' : S.brain.thinkingLevel || 'low' } } : {}) },
            };
            for await (const d of geminiStream(env.GEMINI_API_KEY, model, payload)) {
              for (const p of d.candidates?.[0]?.content?.parts || []) {
                if (p.thought) continue;
                if (p.functionCall) { parts.push(p); calls.push(p.functionCall); continue; }
                if (typeof p.text === 'string') {
                  if (!textPart) { textPart = { text: '' }; parts.push(textPart); }
                  textPart.text += p.text; if (p.thoughtSignature) textPart.thoughtSignature = p.thoughtSignature;
                  if (p.text) await send('text', { delta: p.text });
                }
              }
            }
            break;
          } catch (e) { if (attempt === models.length - 1 || parts.length) throw e; }
        }
        newTurns.push({ role: 'model', parts });
        if (!calls.length) break;
        const responses = [];
        for (const fc of calls) {
          const a = fc.args || {}; let ok = true, unlock = null;
          if (fc.name === 'reveal_secret') { ok = allowed.has(a.secret_id); if (ok) { unlock = unlockOf[a.secret_id] || null; revealed.add(a.secret_id); } }
          else if (fc.name === 'set_mood') ok = typeof a.mood === 'string';
          else if (fc.name === 'follow_inspector') ok = typeof a.follow === 'boolean' && ch.phase !== 'before';
          else if (fc.name !== 'end_interview') ok = false;
          await send('tool', { name: fc.name, args: a, ok, unlock });
          responses.push({ functionResponse: { name: fc.name, ...(fc.id ? { id: fc.id } : {}), response: { ok } } });
        }
        newTurns.push({ role: 'user', parts: responses });
        if (parts.some((p) => p.text && p.text.trim())) break;
      }
      // Secrets said without a reveal_secret call (thinking "minimal" rarely calls tools): see server/reveals.mjs.
      {
        const answer = newTurns.filter((t) => t.role === 'model').flatMap((t) => t.parts).map((p) => p.text || '').join(' ').trim();
        const candidates = c.secrets.filter((x) => allowed.has(x.id) && !revealed.has(x.id));
        for (const id of await detectReveals(S, env.GEMINI_API_KEY, { character: c, question: say, answer, candidates }, rid)) {
          revealed.add(id); await send('tool', { name: 'reveal_secret', args: { secret_id: id }, ok: true, unlock: unlockOf[id] || null, detected: true });
        }
      }
      await send('done', { turns: newTurns, gateOpen });
      tlog.info('turn done', { rid, character: c.id, ms: Date.now() - t0 });
    } catch (e) {
      tlog.error('turn failed', { rid, character: c.id, error: String(e.message || e).slice(0, 300) });
      await send('error', { message: 'The character could not answer. Try again.' });
    }
    await w.close();
  })();
  return new Response(readable, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' } });
}

async function gradiumToken(env) {
  if (!env.GRADIUM_API_KEY) return json({ error: 'GRADIUM_API_KEY missing' }, 503);
  const r = await fetch('https://api.gradium.ai/api/api-keys/token', { headers: { 'x-api-key': env.GRADIUM_API_KEY } });
  if (!r.ok) { log.error('token mint failed', { status: r.status }); return json({ error: 'Could not create Gradium token' }, 502); }
  return json(await r.json());
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), p = url.pathname;
    if (!p.startsWith('/api/')) return env.ASSETS.fetch(req);
    const origin = corsOrigin(req, env);
    if (req.headers.get('origin') && !origin) return json({ error: 'origin not allowed' }, 403);
    if (req.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }), origin);
    const ip = req.headers.get('cf-connecting-ip') || 'local';
    try {
      if (p === '/api/status') return withCors(json({ live: !!(env.GEMINI_API_KEY && env.GRADIUM_API_KEY), brain: !!env.GEMINI_API_KEY, voice: !!env.GRADIUM_API_KEY, model: S.brain.model }), origin);
      if (p === '/api/gradium-token' && req.method === 'GET') {
        if (await limited(env, 'VOICE_LIMIT', ip)) return withCors(json({ error: 'Too many voice requests, slow down.' }, 429), origin);
        return withCors(await gradiumToken(env), origin);
      }
      if (p === '/api/talk' && req.method === 'POST') {
        if (await limited(env, 'TALK_LIMIT', ip)) return withCors(json({ error: 'Too many questions at once. Wait a few seconds.' }, 429), origin);
        const b = await req.json().catch(() => null); if (!b) return withCors(json({ error: 'bad json' }, 400), origin);
        return withCors(await talk(b, env), origin);
      }
      if (p === '/api/notes/organize' && req.method === 'POST') {
        if (await limited(env, 'NOTES_LIMIT', ip)) return withCors(json({ error: 'Too many requests, slow down.' }, 429), origin);
        const r = await organizeNotes(S, env.GEMINI_API_KEY, await req.json().catch(() => null), reqId());
        return withCors(json(r.body, r.status), origin);
      }
      if (p === '/api/sidekick' && req.method === 'POST') {
        if (await limited(env, 'TALK_LIMIT', ip)) return withCors(json({ error: 'Too many requests, slow down.' }, 429), origin);
        const r = await sidekick(S, env.GEMINI_API_KEY, await req.json().catch(() => null), reqId());
        return withCors(json(r.body, r.status), origin);
      }
      if (p === '/api/judge' && req.method === 'POST') {
        if (await limited(env, 'TALK_LIMIT', ip)) return withCors(json({ error: 'Too many requests, slow down.' }, 429), origin);
        const r = await judge(S, env.GEMINI_API_KEY, await req.json().catch(() => null), reqId());
        return withCors(json(r.body, r.status), origin);
      }
      if (p === '/api/claims' && req.method === 'POST') {
        if (await limited(env, 'TALK_LIMIT', ip)) return withCors(json({ error: 'Too many requests, slow down.' }, 429), origin);
        const r = await extractClaims(S, env.GEMINI_API_KEY, await req.json().catch(() => null), reqId());
        return withCors(json(r.body, r.status), origin);
      }
      if (p === '/api/english' && req.method === 'POST') {
        if (await limited(env, 'VOICE_LIMIT', ip)) return withCors(json({ error: 'Too many voice requests, slow down.' }, 429), origin);
        const r = await toEnglish(S, env.GEMINI_API_KEY, await req.json().catch(() => null), reqId());
        return withCors(json(r.body, r.status), origin);
      }
      return withCors(json({ error: 'not found' }, 404), origin);
    } catch (e) {
      log.error('request failed', { path: p, error: String(e.message || e) });
      return withCors(json({ error: 'server error' }, 500), origin);
    }
  },
};
