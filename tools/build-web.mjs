// Build the public web build of the game into dist/ (what Cloudflare and itch.io serve).
//   node tools/build-web.mjs                              -> dist/ calling the API on the same origin (Cloudflare Worker)
//   node tools/build-web.mjs --api https://x.workers.dev --zip   -> also dist-itch.zip for itch.io, calling that Worker
// Allow-list only: index.html, engine/, game-assets/ and the few assets/ files the page loads.
// scenario/, prompts/, server/, .env and the old prototype are never copied.
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { logger } from '../server/log.mjs';

const log = logger('build-web');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const args = process.argv.slice(2);
const api = args.includes('--api') ? args[args.indexOf('--api') + 1].replace(/\/$/, '') : '';

rmSync(DIST, { recursive: true, force: true }); mkdirSync(DIST, { recursive: true });

// 1. the page, with config.js (API address) loaded first
let html = readFileSync(join(ROOT, 'index.html'), 'utf8');
html = html.replace(/<script src="assets\/log\.js"><\/script>/, '<script src="config.js"></script>\n<script src="assets/log.js"></script>');
if (!html.includes('config.js')) html = html.replace('<script', '<script src="config.js"></script>\n<script');
writeFileSync(join(DIST, 'index.html'), html);
writeFileSync(join(DIST, 'config.js'), `// Written by tools/build-web.mjs. Where the game API lives ('' = same site).\nwindow.API_BASE = ${JSON.stringify(api)};\n`);

// 2. every local file the page references (scripts, CSS url()), plus the engine and game-assets folders
const refs = new Set(['engine', 'game-assets']);
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) if (!/^(https?:|#|data:)/.test(m[1]) && m[1] !== 'config.js') refs.add(m[1]);
for (const m of html.matchAll(/url\(([^)]+)\)/g)) if (!/^(https?:|data:)/.test(m[1])) refs.add(m[1].replace(/['"]/g, ''));
for (const r of refs) {
  if (/^(scenario|prompts|server|v1-mirabeau)\b|\.env/.test(r)) throw new Error('refusing to publish ' + r);
  const src = join(ROOT, r);
  if (!existsSync(src)) { log.warn('missing file referenced by index.html', { path: r }); continue; }
  mkdirSync(dirname(join(DIST, r)), { recursive: true });
  cpSync(src, join(DIST, r), { recursive: true });
}

// 3. report
let files = 0, bytes = 0;
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f), s = statSync(p); if (s.isDirectory()) walk(p); else { files++; bytes += s.size; } } };
walk(DIST);
log.info('built dist/', { files, mb: (bytes / 1e6).toFixed(1), api: api || '(same origin)' });
if (files > 1000) log.warn('itch.io accepts at most 1000 files', { files });

// 4. itch.io zip
if (args.includes('--zip')) {
  const zip = join(ROOT, 'dist-itch.zip'); rmSync(zip, { force: true });
  execFileSync('zip', ['-qr', zip, '.'], { cwd: DIST });
  log.info('wrote dist-itch.zip', { mb: (statSync(zip).size / 1e6).toFixed(1) });
}
