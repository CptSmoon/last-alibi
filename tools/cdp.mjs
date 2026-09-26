// Tiny headless-Chrome driver for playtesting without extra dependencies (Node 22+).
//   import { launch } from './cdp.mjs'
//   const b = await launch('http://localhost:5173/'); await b.key('Enter'); await b.shot('x.png'); await b.close();
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logger } from '../server/log.mjs';

const log = logger('cdp');

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch(url, { width = 1280, height = 900, port = 9333 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'cdp-'));
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`,
    '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.length) break; } catch (_) {} await sleep(150); }
  const page = targets?.find((t) => t.type === 'page');
  if (!page) { proc.kill(); log.error('Chrome did not start (set CHROME=/path/to/chrome)', { chrome: CHROME, port }); throw new Error('no Chrome page target'); }
  log.info('chrome launched', { port, width, height });
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); const logs = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.consoleAPICalled') { const line = m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description).join(' '); log.debug('page', { line: line.slice(0, 300) }); }
    if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Runtime.exceptionThrown') log.warn('page exception', { error: m.params.exceptionDetails.exception?.description?.split('\n')[0] || m.params.exceptionDetails.text });
    if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url }); await sleep(1500);
  log.info('navigated', { url });

  const CODES = { Enter: ['Enter', 13], Escape: ['Escape', 27], Space: [' ', 32], ArrowLeft: ['ArrowLeft', 37], ArrowUp: ['ArrowUp', 38], ArrowRight: ['ArrowRight', 39], ArrowDown: ['ArrowDown', 40] };
  const keyInfo = (code) => {
    if (CODES[code]) return { key: CODES[code][0], code: code === 'Space' ? 'Space' : code, windowsVirtualKeyCode: CODES[code][1] };
    if (/^Digit[0-9]$/.test(code)) return { key: code[5], code, windowsVirtualKeyCode: 48 + +code[5], text: code[5] };
    if (/^Key[A-Z]$/.test(code)) return { key: code[3].toLowerCase(), code, windowsVirtualKeyCode: code.charCodeAt(3), text: code[3].toLowerCase() };
    return { key: code, code };
  };
  const b = {
    logs, send,
    async eval(expr) { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description; },
    async down(code) { await send('Input.dispatchKeyEvent', { type: 'keyDown', ...keyInfo(code) }); },
    async up(code) { await send('Input.dispatchKeyEvent', { type: 'keyUp', ...keyInfo(code) }); },
    async key(code, holdMs = 30) { await b.down(code); await sleep(holdMs); await b.up(code); await sleep(60); },
    async hold(code, ms) { await b.down(code); await sleep(ms); await b.up(code); },
    async shot(file, clip) {
      const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
      writeFileSync(file, Buffer.from(r.result.data, 'base64')); log.debug('screenshot', { file }); return file;
    },
    // Screenshot of just the game canvas.
    async canvasShot(file) { const box = await b.eval(`(() => { const r = document.getElementById('screen').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`); return b.shot(file, box); },
    sleep,
    async close() { try { ws.close(); } catch (_) {} proc.kill(); log.info('chrome closed', { consoleLines: logs.length }); },
  };
  return b;
}
