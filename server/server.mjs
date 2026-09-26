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
// The prompt, the solution and the confession text only exist in this process.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadScenario, buildSystemInstruction, TOOLS, evidenceMessage, directorNote, CONFESSION_NEEDS, confessionSecret, revealable, toMin, fmt } from '../prompts/build-prompt.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 5173);

// .env loader (KEY=VALUE lines), without printing anything.
const envFile = join(ROOT, '.env');
if (existsSync(envFile)) for (const line of readFileSync(envFile, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const GEMINI = process.env.GEMINI_API_KEY, GRADIUM = process.env.GRADIUM_API_KEY;

let S = loadScenario();
const reload = () => { S = loadScenario(); };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml' };
const PUBLIC = /^\/(index\.html|cast\.html|plan\.html|assets\/[\w\-./]+)$/;

function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  if (!PUBLIC.test(p) || p.includes('..')) { res.writeHead(404).end('not found'); return; }
  const f = normalize(join(ROOT, p));
  if (!f.startsWith(ROOT) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(f).pipe(res);
}

const json = (res, x, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(x)); };
const body = (req) => new Promise((ok, bad) => { let d = ''; req.on('data', (c) => { d += c; if (d.length > 2e6) req.destroy(); }); req.on('end', () => { try { ok(JSON.parse(d || '{}')); } catch (e) { bad(e); } }); });

// ---- Gemini brain ----
async function* geminiStream(model, payload) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': GEMINI }, body: JSON.stringify(payload) });
  if (!r.ok) { const t = await r.text(); const e = new Error(`Gemini ${r.status}: ${t.slice(0, 300)}`); e.status = r.status; throw e; }
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
  const b = await body(req);
  const c = S.characters.find((x) => x.id === b.character), ch = S.chapters.find((x) => x.id === b.chapter);
  if (!c || !ch || !c.chapters.includes(ch.id)) return json(res, { error: 'bad character or chapter' }, 400);
  if (!GEMINI) return json(res, { error: 'GEMINI_API_KEY missing' }, 503);
  const now = Number.isFinite(b.now) ? b.now : toMin(ch.start);
  const history = Array.isArray(b.history) ? b.history.slice(-40) : [];
  const shown = new Set(b.shown || []), revealed = new Set(b.revealed || []);
  const killer = S.solution.killer, conf = confessionSecret(S);

  // What the character "hears" this turn. Evidence text and director notes come from here, never the client.
  const inp = b.input || {};
  let say;
  if (inp.kind === 'greet') say = `[DIRECTOR: It is ${fmt(now)}. The inspector has just walked up to you${history.length ? ' again' : ''}. Greet him in one short sentence, in character, as fits the moment.]`;
  else if (inp.kind === 'present') {
    if (!S.evidence.some((e) => e.id === inp.evidence) || ch.phase !== 'after') return json(res, { error: 'bad evidence' }, 400);
    shown.add(inp.evidence);
    say = evidenceMessage(S, inp.evidence);
  } else say = String(inp.text || '').slice(0, 800);
  let gateOpen = false;
  if (c.id === killer && ch.phase === 'after' && !revealed.has(conf.id) && CONFESSION_NEEDS.filter((e) => shown.has(e)).length >= 3) {
    gateOpen = true; say += '\n' + directorNote(S, killer, conf.id);
  }

  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
  const send = (type, data) => res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);

  const allowed = new Set(revealable(S, c.id, ch.id).filter((id) => id !== conf.id || gateOpen));
  const unlockOf = Object.fromEntries(c.secrets.map((x) => [x.id, x.unlocks]));
  const newTurns = [{ role: 'user', parts: [{ text: say }] }];
  const system = buildSystemInstruction(S, c.id, ch.id, now);
  const models = [S.brain.model, S.brain.fallbackModel].filter(Boolean);

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
          for await (const d of geminiStream(model, payload)) {
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
          break;
        } catch (e) { if (attempt === models.length - 1 || parts.length) throw e; }
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
        else if (fc.name !== 'end_interview') ok = false;
        send('tool', { name: fc.name, args: a, ok, unlock });
        responses.push({ functionResponse: { name: fc.name, ...(fc.id ? { id: fc.id } : {}), response: { ok } } });
      }
      newTurns.push({ role: 'user', parts: responses });
      // If the model already spoke this round, don't ask it to talk again after the tool call.
      if (parts.some((p) => p.text && p.text.trim())) break;
    }
    send('done', { turns: newTurns, gateOpen });
  } catch (e) {
    send('error', { message: String(e.message || e) });
  }
  res.end();
}

async function gradiumToken(res) {
  if (!GRADIUM) return json(res, { error: 'GRADIUM_API_KEY missing' }, 503);
  const r = await fetch('https://api.gradium.ai/api/api-keys/token', { headers: { 'x-api-key': GRADIUM } });
  if (!r.ok) return json(res, { error: 'Could not create Gradium token' }, 502);
  json(res, await r.json());
}

createServer(async (req, res) => {
  try {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/api/status') return json(res, { live: !!(GEMINI && GRADIUM), brain: !!GEMINI, voice: !!GRADIUM, model: S.brain.model });
    if (p === '/api/gradium-token') return gradiumToken(res);
    if (p === '/api/talk' && req.method === 'POST') return talk(req, res);
    if (p === '/api/reload' && req.method === 'POST') { reload(); return json(res, { ok: true }); }
    serveStatic(req, res);
  } catch (e) { if (!res.headersSent) json(res, { error: String(e.message || e) }, 500); else res.end(); }
}).listen(PORT, () => console.log(`Last Stop, Simplon-Orient -> http://localhost:${PORT}  (brain: ${GEMINI ? S.brain.model : 'demo only'}, voice: ${GRADIUM ? 'Gradium' : 'off'})`));
