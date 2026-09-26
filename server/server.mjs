// Local game server. Zero dependencies (Node 20+).
//   node server/server.mjs            -> http://localhost:5173
//
// - Serves the game (only index.html, cast.html and assets/, never .env or the scenario file,
//   which holds the solution).
// - GET  /api/status          -> { live, brain } : is the voice/brain stack configured?
// - GET  /api/gradium-token   -> { token, expires_at } : single-use token for one Gradium WebSocket
// - POST /api/talk            -> Server-Sent Events: the NPC brain (Gemini), streamed.
//        body { character, chapter, now, history, input: { kind: 'greet'|'say'|'present', text?, evidence? },
//               shown: [evidence ids shown to this character], revealed: [secret ids already out] }
//        events: text {delta} · tool {name, args, ok, unlock?} · done {turns} · error {message}
// - POST /api/notes/organize  -> the player's quick notes, organised by Gemini (server/notes.mjs; public facts only)
// - POST /api/claims          -> the factual claims in one answer, for the statements notebook (server/claims.mjs)
// - POST /api/english         -> { text } rewritten in English when speech-to-text drifted into another language (server/english.mjs)
// The prompt, the solution and the confession text only exist in this process.
// Logging: server/log.mjs. LOG_LEVEL=debug shows every static file, SSE event and prompt size.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger, reqId } from './log.mjs';
import { organize as organizeNotes } from './notes.mjs';
import { toEnglish } from './english.mjs';
import { extractClaims } from './claims.mjs';
import { judge } from './judge.mjs';
import { sidekick } from './sidekick.mjs';
import { detectReveals } from './reveals.mjs';
import { transcribe } from './transcribe.mjs';
import { sttToken } from './stt-token.mjs';
import { loadScenario, buildSystemInstruction, TOOLS, evidenceMessage, directorNote, CONFESSION_NEEDS, confessionSecret, revealable, toMin, fmt } from '../prompts/build-prompt.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 5173);

// .env loader (KEY=VALUE lines), without printing anything.
const envFile = join(ROOT, '.env');
if (existsSync(envFile)) for (const line of readFileSync(envFile, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const GEMINI = process.env.GEMINI_API_KEY, GRADIUM = process.env.GRADIUM_API_KEY;
const log = logger('server'), tlog = logger('talk'), glog = logger('gemini'), vlog = logger('gradium');

let S = loadScenario();
log.info('scenario loaded', { id: S.id, characters: S.characters.length, evidence: S.evidence.length, chapters: S.chapters.length });
const reload = () => { S = loadScenario(); log.info('scenario reloaded', { id: S.id, characters: S.characters.length, evidence: S.evidence.length }); };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
const PUBLIC = /^\/(index\.html|prototype\.html|cast\.html|plan\.html|assets\/[\w\-./]+|engine\/[\w\-./]+|game-assets\/[\w\-./]+)$/;

function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  if (!PUBLIC.test(p) || p.includes('..')) { log.warn('blocked path', { path: p }); res.writeHead(404).end('not found'); return; }
  const f = normalize(join(ROOT, p));
  if (!f.startsWith(ROOT) || !existsSync(f) || !statSync(f).isFile()) { log.warn('not found', { path: p }); res.writeHead(404).end('not found'); return; }
  log.debug('static', { path: p });
  res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(f).pipe(res);
}

const json = (res, x, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(x)); };
const body = (req) => new Promise((ok, bad) => { let d = ''; req.on('data', (c) => { d += c; if (d.length > 2e6) req.destroy(); }); req.on('end', () => { try { ok(JSON.parse(d || '{}')); } catch (e) { bad(e); } }); });

// ---- Gemini brain ----
async function* geminiStream(model, payload, rid) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;
  const t0 = Date.now();
  glog.debug('request', { rid, model, turns: payload.contents.length, systemChars: payload.systemInstruction.parts[0].text.length });
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': GEMINI }, body: JSON.stringify(payload) });
  if (!r.ok) { const t = await r.text(); glog.error('http error', { rid, model, status: r.status, ms: Date.now() - t0, body: t.slice(0, 300) }); const e = new Error(`Gemini ${r.status}: ${t.slice(0, 300)}`); e.status = r.status; throw e; }
  glog.debug('stream open', { rid, model, ms: Date.now() - t0 });
  const dec = new TextDecoder(); let buf = '';
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    let i; while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (line.startsWith('data:')) yield JSON.parse(line.slice(5));
    }
  }
}

async function talk(req, res) {
  const rid = reqId(), t0 = Date.now();
  const b = await body(req);
  const c = S.characters.find((x) => x.id === b.character), ch = S.chapters.find((x) => x.id === b.chapter);
  if (!c || !ch || !c.chapters.includes(ch.id)) { tlog.warn('bad character or chapter', { rid, character: b.character, chapter: b.chapter }); return json(res, { error: 'bad character or chapter' }, 400); }
  if (!GEMINI) { tlog.warn('no brain: GEMINI_API_KEY missing', { rid }); return json(res, { error: 'GEMINI_API_KEY missing' }, 503); }
  const now = Number.isFinite(b.now) ? b.now : toMin(ch.start);
  const history = Array.isArray(b.history) ? b.history.slice(-40) : [];
  const shown = new Set(b.shown || []), revealed = new Set(b.revealed || []);
  const killer = S.solution.killer, conf = confessionSecret(S);

  // What the character "hears" this turn. Evidence text and director notes come from here, never the client.
  const inp = b.input || {};
  let say;
  if (inp.kind === 'greet') say = `[DIRECTOR: It is ${fmt(now)}. The inspector has just walked up to you${history.length ? ' again' : ''}. Greet him in one short sentence, in character, as fits the moment.]`;
  else if (inp.kind === 'present') {
    if (!S.evidence.some((e) => e.id === inp.evidence) || ch.phase !== 'after') { tlog.warn('bad evidence', { rid, character: c.id, evidence: inp.evidence, chapter: ch.id }); return json(res, { error: 'bad evidence' }, 400); }
    shown.add(inp.evidence);
    say = evidenceMessage(S, inp.evidence);
  } else say = String(inp.text || '').slice(0, 800);
  let gateOpen = false;
  if (c.id === killer && ch.phase === 'after' && !revealed.has(conf.id) && CONFESSION_NEEDS.filter((e) => shown.has(e)).length >= 3) {
    gateOpen = true; say += '\n' + directorNote(S, killer, conf.id);
    tlog.info('confession gate OPEN', { rid, character: c.id, shownKeys: CONFESSION_NEEDS.filter((e) => shown.has(e)) });
  }
  tlog.info('turn start', { rid, character: c.id, chapter: ch.id, clock: fmt(now), kind: inp.kind || 'say', evidence: inp.evidence, historyTurns: history.length, shown: shown.size, revealed: revealed.size });
  tlog.debug('player input', { rid, text: inp.kind === 'say' ? say.slice(0, 200) : undefined });

  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
  let chars = 0;
  const send = (type, data) => { if (type === 'text') chars += data.delta.length; else tlog.debug('sse', { rid, type }); res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`); };
  req.on('close', () => { if (!res.writableEnded) tlog.info('client closed early', { rid, character: c.id, ms: Date.now() - t0 }); });

  const allowed = new Set(revealable(S, c.id, ch.id).filter((id) => id !== conf.id || gateOpen));
  const unlockOf = Object.fromEntries(c.secrets.map((x) => [x.id, x.unlocks]));
  const newTurns = [{ role: 'user', parts: [{ text: say }] }];
  const system = buildSystemInstruction(S, c.id, ch.id, now);
  // Interviews use brain.talkModel first (the lite model: first words in ~0.6 s; its missing tool calls are covered
  // by server/reveals.mjs), then brain.model (thinking 'low', reliable tools) if it fails.
  const models = [...new Set([S.brain.talkModel, S.brain.model, S.brain.fallbackModel].filter(Boolean))];

  let usedModel = models[0];
  try {
    for (let round = 0; round < 3; round++) {
      let model = models[0], parts = [], calls = [];
      for (let attempt = 0; attempt < models.length; attempt++) {
        model = models[attempt];
        try {
          parts = []; calls = []; let textPart = null;
          const payload = {
            systemInstruction: { parts: [{ text: system }] },
            contents: [...history, ...newTurns],
            tools: TOOLS,
            generationConfig: { maxOutputTokens: 600, ...(model.startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: model.includes('lite') ? 'minimal' : S.brain.thinkingLevel || 'low' } } : {}) },
          };
          for await (const d of geminiStream(model, payload, rid)) {
            for (const p of d.candidates?.[0]?.content?.parts || []) {
              if (p.thought) continue;
              if (p.functionCall) { parts.push(p); calls.push(p.functionCall); continue; }
              if (typeof p.text === 'string') {
                if (!textPart) { textPart = { text: '' }; parts.push(textPart); }
                textPart.text += p.text; if (p.thoughtSignature) textPart.thoughtSignature = p.thoughtSignature;
                if (p.text) send('text', { delta: p.text });
              }
            }
          }
          usedModel = model;
          break;
        } catch (e) {
          if (attempt === models.length - 1 || parts.length) throw e;
          glog.warn('model failed, trying fallback', { rid, model, next: models[attempt + 1], error: e.message.slice(0, 160) });
        }
      }
      newTurns.push({ role: 'model', parts });
      if (!calls.length) break;
      const responses = [];
      for (const fc of calls) {
        const a = fc.args || {}; let ok = true, unlock = null;
        if (fc.name === 'reveal_secret') {
          ok = allowed.has(a.secret_id);
          if (ok) { unlock = unlockOf[a.secret_id] || null; revealed.add(a.secret_id); }
        } else if (fc.name === 'set_mood') ok = typeof a.mood === 'string';
        else if (fc.name === 'follow_inspector') ok = typeof a.follow === 'boolean' && ch.phase !== 'before';
        else if (fc.name !== 'end_interview') ok = false;
        (ok ? tlog.info : tlog.warn)(ok ? 'tool call' : 'tool call REJECTED', { rid, character: c.id, tool: fc.name, args: a, unlock });
        send('tool', { name: fc.name, args: a, ok, unlock });
        responses.push({ functionResponse: { name: fc.name, ...(fc.id ? { id: fc.id } : {}), response: { ok } } });
      }
      newTurns.push({ role: 'user', parts: responses });
      // If the model already spoke this round, don't ask it to talk again after the tool call.
      if (parts.some((p) => p.text && p.text.trim())) break;
    }
    // Secrets said without a reveal_secret call (thinking "minimal" rarely calls tools): see server/reveals.mjs.
    {
      const answer = newTurns.filter((t) => t.role === 'model').flatMap((t) => t.parts).map((p) => p.text || '').join(' ').trim();
      const candidates = c.secrets.filter((x) => allowed.has(x.id) && !revealed.has(x.id));
      for (const id of await detectReveals(S, GEMINI, { character: c, question: say, answer, candidates }, rid)) {
        revealed.add(id); send('tool', { name: 'reveal_secret', args: { secret_id: id }, ok: true, unlock: unlockOf[id] || null, detected: true });
      }
    }
    send('done', { turns: newTurns, gateOpen });
    tlog.info('turn done', { rid, character: c.id, model: usedModel, chars, ms: Date.now() - t0 });
  } catch (e) {
    tlog.error('turn failed', { rid, character: c.id, ms: Date.now() - t0, error: String(e.message || e).slice(0, 300) });
    send('error', { message: String(e.message || e) });
  }
  res.end();
}

async function gradiumToken(res) {
  if (!GRADIUM) { vlog.warn('token refused: GRADIUM_API_KEY missing'); return json(res, { error: 'GRADIUM_API_KEY missing' }, 503); }
  const t0 = Date.now();
  const r = await fetch('https://api.gradium.ai/api/api-keys/token', { headers: { 'x-api-key': GRADIUM } });
  if (!r.ok) { vlog.error('token mint failed', { status: r.status, ms: Date.now() - t0 }); return json(res, { error: 'Could not create Gradium token' }, 502); }
  const tok = await r.json();
  vlog.info('token minted', { ms: Date.now() - t0, expires_at: tok.expires_at });
  json(res, tok);
}

createServer(async (req, res) => {
  const t0 = Date.now();
  try {
    const p = new URL(req.url, 'http://x').pathname;
    if (p.startsWith('/api/')) {
      log.debug('api', { method: req.method, path: p });
      res.on('finish', () => (res.statusCode >= 400 ? log.warn : log.info)(`${req.method} ${p}`, { status: res.statusCode, ms: Date.now() - t0 }));
    }
    if (p === '/api/status') return json(res, { live: !!(GEMINI && GRADIUM), brain: !!GEMINI, voice: !!GRADIUM, model: S.brain.model });
    if (p === '/api/gradium-token') return gradiumToken(res);
    if (p === '/api/talk' && req.method === 'POST') return talk(req, res);
    if (p === '/api/notes/organize' && req.method === 'POST') { const r = await organizeNotes(S, GEMINI, await body(req).catch(() => null), reqId()); return json(res, r.body, r.status); }
    if (p === '/api/stt-token') { const r = await sttToken(S, GEMINI, reqId()); return json(res, r.body, r.status); }
    if (p === '/api/transcribe' && req.method === 'POST') { const r = await transcribe(S, GEMINI, await body(req).catch(() => null), reqId()); return json(res, r.body, r.status); }
    if (p === '/api/sidekick' && req.method === 'POST') { const r = await sidekick(S, GEMINI, await body(req).catch(() => null), reqId()); return json(res, r.body, r.status); }
    if (p === '/api/judge' && req.method === 'POST') { const r = await judge(S, GEMINI, await body(req).catch(() => null), reqId()); return json(res, r.body, r.status); }
    if (p === '/api/claims' && req.method === 'POST') { const r = await extractClaims(S, GEMINI, await body(req).catch(() => null), reqId()); return json(res, r.body, r.status); }
    if (p === '/api/english' && req.method === 'POST') { const r = await toEnglish(S, GEMINI, await body(req).catch(() => null), reqId()); return json(res, r.body, r.status); }
    if (p === '/api/reload' && req.method === 'POST') { reload(); return json(res, { ok: true }); }
    serveStatic(req, res);
  } catch (e) {
    log.error('request failed', { method: req.method, url: req.url, error: String(e.message || e), stack: e.stack?.split('\n')[1]?.trim() });
    if (!res.headersSent) json(res, { error: String(e.message || e) }, 500); else res.end();
  }
}).listen(PORT, () => {
  log.info(`Last Stop, Simplon-Orient -> http://localhost:${PORT}`, { brain: GEMINI ? S.brain.model : 'demo only', fallback: S.brain.fallbackModel, voice: GRADIUM ? 'Gradium' : 'off', tts: GRADIUM ? { model: S.voice?.ttsModel || 'default', speed: S.voice?.gradiumSpeed ?? 0, temp: S.voice?.gradiumTemp ?? 0.7 } : undefined, logLevel: process.env.LOG_LEVEL || 'info' });
  if (!GEMINI) log.warn('GEMINI_API_KEY not set: characters use the scripted demo brain');
  if (!GRADIUM) log.warn('GRADIUM_API_KEY not set: voice is off, typing only');
});
process.on('unhandledRejection', (e) => log.error('unhandled rejection', { error: String(e?.message || e) }));
process.on('uncaughtException', (e) => log.error('uncaught exception', { error: e.message, stack: e.stack?.split('\n')[1]?.trim() }));
