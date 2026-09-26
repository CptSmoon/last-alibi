// Deploy exactly the committed HEAD to Cloudflare (not the working tree, which other sessions may be editing).
//   npm run deploy
// 1. refuses if wrangler is logged into the wrong Cloudflare account
// 2. checks HEAD is pushed (warns if not)
// 3. builds dist/ in a clean temporary checkout of HEAD and runs `wrangler deploy` there
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../server/log.mjs';

const log = logger('deploy');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ACCOUNT = 'b23d1748734924e02ec038742f418125'; // bd96kais@gmail.com, also pinned in wrangler.jsonc
const sh = (cmd, args, o = {}) => execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...o });

const who = sh('wrangler', ['whoami']);
if (!who.includes(ACCOUNT)) { log.error('wrangler is not logged into the game account (bd96kais@gmail.com). Run: wrangler logout && wrangler login'); process.exit(1); }

const head = sh('git', ['rev-parse', '--short', 'HEAD']).trim();
try { sh('git', ['fetch', '-q', 'origin']); } catch (_) {}
const ahead = (() => { try { return Number(sh('git', ['rev-list', '--count', 'origin/main..HEAD']).trim()); } catch (_) { return -1; } })();
if (ahead > 0) log.warn('HEAD is not pushed yet: deploying it anyway, push right after', { head, ahead });

const dir = mkdtempSync(join(tmpdir(), 'simplon-deploy-'));
try {
  sh('git', ['worktree', 'add', '--detach', dir, 'HEAD']);
  log.info('building HEAD in a clean checkout', { head });
  execFileSync('node', ['tools/build-web.mjs'], { cwd: dir, stdio: 'inherit' });
  execFileSync('wrangler', ['deploy', '--message', `git ${head}`], { cwd: dir, stdio: 'inherit' });
  log.info('deployed', { head, url: 'https://simplon-orient.kaisspace.workers.dev' });
} finally {
  try { sh('git', ['worktree', 'remove', '--force', dir]); } catch (_) { rmSync(dir, { recursive: true, force: true }); }
}
