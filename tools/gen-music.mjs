// Generate the soundtrack with Gemini's Lyria (music model) and pack it for the game.
//   node tools/gen-music.mjs                 all tracks
//   node tools/gen-music.mjs investigation   one track (or several ids)
//   node tools/gen-music.mjs --list          print the track list
// Env:
//   MODEL=lyria-3.5          override the model for every track (default: per track, see TRACKS)
//   KEEP_RAW=1               also keep the untouched model output next to the game file (<id>.raw.mp3)
// Reads GEMINI_API_KEY from .env. Needs ffmpeg + ffprobe on PATH for the packing step (trim silence,
// level to about -18 LUFS, fade, mp3 at 128 kbps mono-compatible stereo). Without ffmpeg the raw file is kept as is.
// Output: game-assets/audio/music-<id>.mp3 and game-assets/audio/music.json (id -> file, seconds, bytes, loop).
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { logger } from '../server/log.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(join(ROOT, '.env'))) for (const l of readFileSync(join(ROOT, '.env'), 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim(); }
const log = logger('gen-music');
const OUT = join(ROOT, 'game-assets', 'audio');

// Shared direction appended to every prompt: the world, and the hard rule that there are no voices.
const WORLD = 'Setting: 1931, the Simplon-Orient Express snowbound in the Swiss Alps at night after an avalanche; an Art Deco sleeping car; a classic detective story. Strictly instrumental: no vocals, no singing, no choir, no spoken words. Warm analog recording, intimate small ensemble.';

// id -> model, prompt, packing. loop: the game loops it (keep full length, gentle edges); max: trim to N seconds with a fade out.
const TRACKS = {
  title: { model: 'lyria-3.5', loop: true, max: 150, prompt: 'Main title theme for a 1930s murder-mystery game. Slow, elegant and melancholy waltz-tinged melody on solo piano, joined by a muted string quartet and a soft clarinet; a hint of a steam train rhythm under it. Mysterious but beautiful, minor key, 70 bpm, loop-friendly with no big ending.' },
  avalanche: { model: 'lyria-3.5', loop: true, max: 90, prompt: 'Night tension underscore: a train stopped in the snow after an avalanche. Low sustained cello and double-bass drones, distant timpani rolls, trembling tremolo violins, cold high harmonics like wind; sparse, dark, ominous, no melody to speak of, slow, loop-friendly.' },
  breakfast: { model: 'lyria-3.5', loop: true, max: 150, prompt: 'Warm 1930s dining-car salon music at breakfast: light gentle piano with a small string trio, a little brushed snare, a café-orchestra feel from a Wagons-Lits restaurant car; relaxed, civilised and charming, major key, 95 bpm, background level, loop-friendly with no big ending.' },
  investigation: { model: 'lyria-3.5', loop: true, max: 180, prompt: 'Investigation underscore for a detective searching a snowbound train. Moody, restrained and curious: pizzicato double bass walking slowly, soft muted piano figures, a low clarinet, occasional celesta; low tension that never builds to a climax and does not tire over thirty minutes; minor key, 80 bpm, sparse and steady, loop-friendly with no ending.' },
  accusation: { model: 'lyria-3.5', loop: true, max: 120, prompt: 'Confrontation music for the moment the detective names the murderer in front of all the suspects: tense insistent low strings ostinato, stabbing piano chords, a slow heartbeat timpani, rising dread and drama but controlled; minor key, 100 bpm, loop-friendly.' },
  solved: { model: 'lyria-3-clip-preview', loop: false, max: 22, prompt: 'Short ending sting: the murder is solved. A resolving, bittersweet and dignified cadence for piano and strings in a 1930s film-score style, ending on a warm major chord, then silence.' },
  failed: { model: 'lyria-3-clip-preview', loop: false, max: 22, prompt: 'Short ending sting: the detective failed and the killer escapes on the train. A dark, unresolved descending phrase for low strings and piano ending on a hollow minor chord that fades into cold wind, then silence.' },
};

const args = process.argv.slice(2);
if (args.includes('--list')) { for (const [id, t] of Object.entries(TRACKS)) console.log(`${id.padEnd(14)} ${t.model.padEnd(22)} ${t.prompt.slice(0, 90)}…`); process.exit(0); }
const ids = args.length ? args : Object.keys(TRACKS);
for (const id of ids) if (!TRACKS[id]) { log.error('unknown track', { id, known: Object.keys(TRACKS).join(',') }); process.exit(1); }
if (!process.env.GEMINI_API_KEY) { log.error('GEMINI_API_KEY missing (put it in .env)'); process.exit(1); }
const has = (bin) => { try { execFileSync('which', [bin], { stdio: 'ignore' }); return true; } catch (_) { return false; } };
const FFMPEG = has('ffmpeg') && has('ffprobe');
if (!FFMPEG) log.warn('ffmpeg/ffprobe not found: saving the raw model output without trimming or re-encoding');
mkdirSync(OUT, { recursive: true });

async function generate(id) {
  const t = TRACKS[id], model = process.env.MODEL || t.model, t0 = Date.now();
  const body = { model, input: `${t.prompt}\n\n${WORLD}`, response_format: { type: 'audio' } };
  let j, r, audio;
  for (let attempt = 0; attempt < 4; attempt++) {
    log.info('request', { id, model, attempt: attempt + 1, promptChars: body.input.length });
    try {
      r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, body: JSON.stringify(body),
      });
      j = await r.json();
    } catch (e) { j = { error: { message: e.message } }; r = { ok: false, status: 0 }; }
    // Response: { status, steps: [{ type:'model_output', content:[{type:'text'}|{type:'audio', mime_type, data}] }] }
    audio = (j.steps || []).flatMap((s) => s.content || []).find((c) => c.type === 'audio' && c.data);
    if (r.ok && audio) break;
    log.warn('no audio, retrying', { id, attempt: attempt + 1, status: r.status, state: j.status, error: j.error?.message?.slice(0, 200) });
    await new Promise((s) => setTimeout(s, 3000 * (attempt + 1)));
  }
  if (!audio) throw new Error(`${id}: no audio after retries (status ${r?.status})`);
  const ext = audio.mime_type === 'audio/wav' || audio.mime_type === 'audio/x-wav' ? '.wav' : '.mp3';
  const raw = join(tmpdir(), `lyria-${id}-${Date.now()}${ext}`);
  writeFileSync(raw, Buffer.from(audio.data, 'base64'));
  const note = (j.steps || []).flatMap((s) => s.content || []).find((c) => c.type === 'text')?.text;
  log.info('generated', { id, model, mime: audio.mime_type, rawBytes: statSync(raw).size, seconds: probe(raw), ms: Date.now() - t0, note: note?.slice(0, 60) });
  return pack(id, raw);
}

function probe(f) {
  if (!FFMPEG) return null;
  try { return +(+execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim()).toFixed(2); } catch (_) { return null; }
}

// Trim leading/trailing silence, cap the length, level the loudness, fade the edges, encode mp3 128 kbps.
function pack(id, raw) {
  const t = TRACKS[id], out = join(OUT, `music-${id}.mp3`);
  if (process.env.KEEP_RAW === '1') writeFileSync(join(OUT, `music-${id}.raw${raw.slice(-4)}`), readFileSync(raw));
  if (!FFMPEG) { writeFileSync(out, readFileSync(raw)); unlinkSync(raw); return out; }
  const trimmed = raw + '.trim.wav';
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-af',
    'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse',
    '-ar', '44100', '-ac', '2', trimmed]);
  const len = Math.min(probe(trimmed) || t.max, t.max);
  // loops: short fades so the engine's crossfade hides the seam; stings: fade the tail.
  const fadeIn = t.loop ? 0.4 : 0.02, fadeOut = t.loop ? 2.5 : Math.min(4, len / 4);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', trimmed, '-t', String(len), '-af',
    `loudnorm=I=${t.loop ? -20 : -18}:TP=-1.5:LRA=11,afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${(len - fadeOut).toFixed(2)}:d=${fadeOut}`,
    '-ar', '44100', '-ac', '2', '-codec:a', 'libmp3lame', '-b:a', '128k', out]);
  unlinkSync(raw); unlinkSync(trimmed);
  return out;
}

function writeManifest() {
  const man = {};
  for (const id of Object.keys(TRACKS)) {
    const f = join(OUT, `music-${id}.mp3`);
    if (existsSync(f)) man[id] = { file: `audio/music-${id}.mp3`, seconds: probe(f), bytes: statSync(f).size, loop: TRACKS[id].loop };
  }
  writeFileSync(join(OUT, 'music.json'), JSON.stringify(man, null, 2) + '\n');
  const total = Object.values(man).reduce((s, m) => s + m.bytes, 0);
  log.info('manifest', { tracks: Object.keys(man).length, totalMB: +(total / 1048576).toFixed(2) });
}

// Two at a time: kind to the quota, still quick.
const queue = [...ids], failed = [];
await Promise.all([0, 1].map(async () => {
  while (queue.length) {
    const id = queue.shift();
    try { const f = await generate(id); console.log(`wrote ${f.replace(ROOT + '/', '')} (${probe(f) ?? '?'} s, ${(statSync(f).size / 1024).toFixed(0)} KB)`); }
    catch (e) { failed.push(id); log.error('track failed', { id, error: e.message }); }
  }
}));
writeManifest();
if (failed.length) { log.error('some tracks failed', { failed: failed.join(',') }); process.exit(1); }
