// Tiny structured logger for the server and the Node tools. Zero dependencies.
//   import { logger } from './log.mjs'; const log = logger('talk');
//   log.info('turn done', { character: 'hale', ms: 812 });
//   -> 14:02:11.482 INFO  [talk] turn done character=hale ms=812
//
// Env:
//   LOG_LEVEL=debug|info|warn|error|silent   (default info)
//   LOG_FORMAT=json                          one JSON object per line, for log shippers
//
// Never pass API keys, tokens or full prompts in the fields: log sizes and ids instead.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };
const MIN = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;
const JSON_OUT = (process.env.LOG_FORMAT || '').toLowerCase() === 'json';
const COLOR = process.stdout.isTTY && !JSON_OUT && !process.env.NO_COLOR;
const TINT = { debug: '\x1b[90m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m' };

// Anything that looks like a secret is masked, whatever the caller passes.
const SECRET_KEY = /key|token|secret|password|authorization/i;
const clean = (fields) => {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if (v === undefined) continue;
    out[k] = SECRET_KEY.test(k) && typeof v === 'string' ? `<${v.length} chars>` : v instanceof Error ? v.message : v;
  }
  return out;
};
const fmtValue = (v) => {
  if (typeof v === 'string') return /[\s="]/.test(v) ? JSON.stringify(v) : v;
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

function write(level, scope, msg, fields) {
  if (LEVELS[level] < MIN) return;
  const f = clean(fields), stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  if (JSON_OUT) { stream.write(JSON.stringify({ t: new Date().toISOString(), level, scope, msg, ...f }) + '\n'); return; }
  const time = new Date().toTimeString().slice(0, 8) + '.' + String(Date.now() % 1000).padStart(3, '0');
  const lv = level.toUpperCase().padEnd(5), kv = Object.entries(f).map(([k, v]) => `${k}=${fmtValue(v)}`).join(' ');
  const head = COLOR ? `\x1b[90m${time}\x1b[0m ${TINT[level]}${lv}\x1b[0m [${scope}]` : `${time} ${lv} [${scope}]`;
  stream.write(`${head} ${msg}${kv ? ' ' + kv : ''}\n`);
}

export function logger(scope) {
  return {
    debug: (msg, fields) => write('debug', scope, msg, fields),
    info: (msg, fields) => write('info', scope, msg, fields),
    warn: (msg, fields) => write('warn', scope, msg, fields),
    error: (msg, fields) => write('error', scope, msg, fields),
    child: (sub) => logger(`${scope}:${sub}`),
  };
}

// A short random id to follow one request through the log.
export const reqId = () => Math.random().toString(36).slice(2, 8);
