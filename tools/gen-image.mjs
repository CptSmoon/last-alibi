// Generate art with Gemini (image model).
//   node tools/gen-image.mjs <out> "<prompt>" [model]
// Env:
//   REF=a.jpg,b.png   reference images sent with the prompt (style / character consistency)
//   RAW=1             don't append the default pixel-art style suffix
//   ASPECT=16:9       aspect ratio (default 16:9)
// Reads GEMINI_API_KEY from .env. Default model: gemini-3.1-flash-image. Writes the file with the
// extension matching the returned mime type (.jpg or .png).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../server/log.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(join(ROOT, '.env'))) for (const l of readFileSync(join(ROOT, '.env'), 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim(); }

let [out, prompt, model = 'gemini-3.1-flash-image'] = process.argv.slice(2);
const log = logger('gen-image');
if (!out || !prompt) { log.error('usage: node tools/gen-image.mjs <out> "<prompt>" [model]'); process.exit(1); }
if (!process.env.GEMINI_API_KEY) { log.error('GEMINI_API_KEY missing (put it in .env)'); process.exit(1); }
const RAW = process.env.RAW === '1';
const STYLE = 'Style: 16-bit pixel art, 1931 Art Deco night train, limited palette of ink blue #0b0a14, navy #161729, brass #c67a2f, amber #f0b54a, wine #5e1627, cream #f3ead2, snow #e8eef4. Crisp pixels, no anti-aliasing, no text.';
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const refs = (process.env.REF || '').split(',').filter(Boolean).map((f) => ({ inlineData: { mimeType: MIME[extname(f).toLowerCase()] || 'image/jpeg', data: readFileSync(f).toString('base64') } }));

const body = {
  contents: [{ parts: [...refs, { text: RAW ? prompt : `${prompt}\n\n${STYLE}` }] }],
  generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: process.env.ASPECT || '16:9' } },
};
let j, r;
const t0 = Date.now();
log.debug('request', { out, model, refs: refs.length, promptChars: prompt.length, aspect: process.env.ASPECT || '16:9' });
for (let attempt = 0; attempt < 3; attempt++) {
  r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, body: JSON.stringify(body),
  });
  j = await r.json();
  if (r.ok && j.candidates?.[0]?.content?.parts?.some((p) => p.inlineData)) break;
  log.warn('no image, retrying', { out, attempt: attempt + 1, status: r.status, finish: j.candidates?.[0]?.finishReason, error: j.error?.message?.slice(0, 160) });
  await new Promise((s) => setTimeout(s, 2000 * (attempt + 1)));
}
if (!r.ok) { log.error('request failed', { out, status: r.status, body: JSON.stringify(j).slice(0, 400) }); process.exit(1); }
const img = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
if (!img) { log.error('no image in response', { out, body: JSON.stringify(j).slice(0, 400) }); process.exit(1); }
const ext = img.mimeType === 'image/png' ? '.png' : '.jpg';
out = out.replace(/\.(png|jpe?g|webp)$/i, '') + ext;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(img.data, 'base64'));
// gen-assets.mjs reads this exact line from stdout: keep "wrote <path>" first.
console.log(`wrote ${out} (${img.mimeType})`);
log.debug('done', { ms: Date.now() - t0, bytes: img.data.length * 0.75 | 0 });
