// Browser logger with scopes and levels. Load it before the other scripts.
//   const log = LOG.scope('talk'); log.info('turn start', { who: 'hale' });
//   -> [12.48s] [talk] turn start {who: 'hale'}
//
// Level: ?debug in the URL, or localStorage 'simplon-log' = debug|info|warn|error|silent (default info).
// In the console: LOG.level('debug') switches it live, LOG.history() shows the last 500 entries
// (also kept when the console was closed), LOG.dump() copies them as text for a bug report.
//
// Every module guards with (window.LOG || { scope: () => console }), so a page without this file still works.
(function () {
  const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };
  const KEY = 'simplon-log';
  let min = LEVELS.info;
  try {
    const q = new URLSearchParams(location.search);
    const want = q.has('debug') ? 'debug' : q.get('log') || localStorage.getItem(KEY);
    if (want && LEVELS[want] != null) min = LEVELS[want];
  } catch (_) {}

  const t0 = performance.now();
  const ring = [];
  const STYLE = { debug: 'color:#888', info: 'color:#4aa3c9', warn: 'color:#d99a1e', error: 'color:#c93a48;font-weight:bold' };
  const OUT = { debug: console.debug, info: console.info, warn: console.warn, error: console.error };

  function write(level, scope, msg, fields) {
    const t = ((performance.now() - t0) / 1000).toFixed(2);
    ring.push({ t: +t, level, scope, msg, fields });
    if (ring.length > 500) ring.shift();
    if (LEVELS[level] < min) return;
    const args = [`%c[${t}s] [${scope}]%c ${msg}`, STYLE[level], ''];
    if (fields !== undefined) args.push(fields);
    OUT[level].apply(console, args);
  }

  function scope(name) {
    return {
      debug: (msg, f) => write('debug', name, msg, f),
      info: (msg, f) => write('info', name, msg, f),
      warn: (msg, f) => write('warn', name, msg, f),
      error: (msg, f) => write('error', name, msg, f),
      // Runs fn and logs how long it took (debug), e.g. LOG.scope('world').time('render', () => ...)
      time(label, fn) { const s = performance.now(); try { return fn(); } finally { write('debug', name, `${label} took ${(performance.now() - s).toFixed(1)} ms`); } },
    };
  }

  const root = scope('page');
  addEventListener('error', (e) => root.error('uncaught error', { message: e.message, at: `${e.filename}:${e.lineno}:${e.colno}` }));
  addEventListener('unhandledrejection', (e) => root.error('unhandled promise rejection', { reason: String(e.reason && e.reason.message || e.reason) }));

  window.LOG = {
    scope,
    level(l) { if (LEVELS[l] == null) return Object.keys(LEVELS).find((k) => LEVELS[k] === min); min = LEVELS[l]; try { localStorage.setItem(KEY, l); } catch (_) {} return l; },
    history: () => ring.slice(),
    dump() {
      const txt = ring.map((r) => `[${r.t}s] ${r.level.toUpperCase()} [${r.scope}] ${r.msg}${r.fields !== undefined ? ' ' + JSON.stringify(r.fields) : ''}`).join('\n');
      try { navigator.clipboard.writeText(txt); } catch (_) {}
      return txt;
    },
  };
  root.info('logger ready', { level: window.LOG.level() });
})();
