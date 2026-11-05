// harness-ab.mjs — same task, same model, same base commit: pi vs opencode. Measures tokens, time, accept.
// Usage: node tools/harness-ab.mjs [--arms pi,opencode] [--tasks a,b] [--base HEAD] [--timeout 40] [--out <dir>]
// Each (arm, task) runs in its own fresh `git worktree add --detach` with node_modules junctioned and
// tools/checks copied from this checkout. Rows append to docs/pi-tasks/harness-ab.csv.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync, spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const MODEL = 'opencode-go/deepseek-v4.1-flash';
const OC_EXE = process.env.OC_EXE || 'C:/Users/ray/.opencode2/npm/node_modules/@opencode/cli/bin/opencode.exe';
const OC_ENV = { XDG_DATA_HOME: process.env.OC_DATA || 'C:/Users/ray/.opencode2/data' };
const OUT = path.resolve(opt('out', path.join(os.tmpdir(), 'harness-ab')));
const TIMEOUT = Number(opt('timeout', 40)) * 60e3;
const BASE = spawnSync('git', ['rev-parse', opt('base', 'HEAD')], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();

const TASKS = {
  smoke: { check: 'touch-targets.mjs', goal: 'Smoke test of the harness: change nothing at all, just run the checker once.' },
  'reduced-motion': { check: 'reduced-motion.mjs', goal: 'Players with `prefers-reduced-motion: reduce` get a calm interface: CSS animations and transitions (and JS el.animate calls) in the HUD, modals, toasts and loading screen are removed or shortened to <= 100ms opacity fades, with no layout jumps; normal users see no change. Canvas/game rendering is out of scope.' },
  'modal-close': { check: 'modal-close.mjs', goal: 'Every modal behaves the same way: a close button in the same top-right spot with the same size and style, Esc closes the topmost modal, clicking the backdrop closes it (except confirm dialogs), and focus returns to the control that opened it. Desktop and 375px phone.' },
  'empty-states': { check: 'ui-empty-states.mjs', goal: 'Every list the player can open (hunters roster, quests/commissions, inventory/storage, build menu, logs) shows a short friendly empty-state message in Traditional Chinese with a hint of what to do next, instead of a blank area, when it has no items. Style it once in CSS and reuse it.' },
};
const arms = opt('arms', 'pi,opencode').split(',');
const tasks = opt('tasks', Object.keys(TASKS).filter(k => k !== 'smoke').join(',')).split(',');

const prompt = t => [
  `Goal: ${TASKS[t].goal}`,
  `Done when \`node tools/checks/${TASKS[t].check}\` exits 0. Read that checker to see exactly what it measures, implement, and run it yourself until it passes.`,
  'Rules: work only inside the current directory; do not read or run anything in other checkouts of this repo. Do not edit anything under tools/checks/. Never edit src/pixel-game.js or src/pixel-world.js. UI lives in src/pixel-ui.js, src/pixel-index.html, src/pixel-style.css. Do not commit. Do not start subagents. Stop after the checker passes or after you are truly stuck.',
  'Final line of your reply: DONE or FAILED, then the files you changed.',
].join('\n\n');

const sh = (cmd, a, o = {}) => spawnSync(cmd, a, { encoding: 'utf8', maxBuffer: 256 << 20, ...o });
const run = (cmd, a, cwd, env = {}) => new Promise(res => {
  const t0 = Date.now(); let out = '';
  const p = spawn(cmd, a, { cwd, env: { ...process.env, PWD: cwd, INIT_CWD: cwd, ...env }, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
  const timer = setTimeout(() => { spawnSync('taskkill', ['/pid', String(p.pid), '/t', '/f']); }, TIMEOUT);
  p.on('close', code => { clearTimeout(timer); res({ code, out, min: (Date.now() - t0) / 60e3 }); });
});

function worktree(name) {
  const dir = path.join(OUT, name);
  if (fs.existsSync(dir)) { sh('git', ['worktree', 'remove', '--force', dir], { cwd: ROOT }); fs.rmSync(dir, { recursive: true, force: true }); }
  // a standalone clone, not `git worktree`: a worktree's .git points at this repo, and opencode then
  // resolves its project root to this checkout and edits files here (seen 2026-11-04)
  sh('git', ['clone', '--shared', '--no-checkout', '--quiet', ROOT, dir]);
  sh('git', ['checkout', '--quiet', '--detach', BASE], { cwd: dir });
  sh('cmd', ['/c', 'mklink', '/J', path.join(dir, 'node_modules'), path.join(ROOT, 'node_modules')]);
  fs.cpSync(path.join(ROOT, 'tools', 'checks'), path.join(dir, 'tools', 'checks'), { recursive: true });
  return dir;
}

function piTokens(sessDir) {
  const s = { calls: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0, usd: 0 };
  for (const f of fs.existsSync(sessDir) ? fs.readdirSync(sessDir, { recursive: true }) : []) {
    if (!String(f).endsWith('.jsonl')) continue;
    for (const line of fs.readFileSync(path.join(sessDir, f), 'utf8').split('\n')) {
      if (!line.includes('"usage"')) continue;
      let e; try { e = JSON.parse(line); } catch { continue; }
      const u = e.message?.usage; if (!u) continue;
      s.calls++; s.input += u.input || 0; s.cacheRead += u.cacheRead || 0; s.cacheWrite += u.cacheWrite || 0;
      s.output += u.output || 0; s.reasoning += u.reasoning || 0; s.usd += u.cost?.total || 0;
    }
  }
  return s;
}

function ocTokens(sessionID) {
  const s = { calls: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0, usd: 0 };
  if (!sessionID) return s;
  const r = sh(OC_EXE, ['session', 'export', sessionID], { env: { ...process.env, ...OC_ENV } });
  let j; try { j = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))); } catch { return s; }
  for (const m of j.messages || []) {
    const t = m.info?.tokens || m.tokens; if (!t || m.info?.role === 'user') continue;
    s.calls++; s.input += t.input || 0; s.output += t.output || 0; s.reasoning += t.reasoning || 0;
    s.cacheRead += t.cache?.read || 0; s.cacheWrite += t.cache?.write || 0; s.usd += m.info?.cost || 0;
  }
  return s;
}

const csv = path.join(ROOT, 'docs', 'pi-tasks', 'harness-ab.csv');
if (!fs.existsSync(csv)) fs.writeFileSync(csv, 'date,arm,task,base,minutes,agent_exit,accept,files,diff_lines,scope,calls,input,cache_read,cache_write,output,reasoning,usd,last_line\n');
fs.mkdirSync(OUT, { recursive: true });

for (const t of tasks) for (const arm of arms) {   // interleave arms per task to spread time-of-day effects
  const name = `${arm}-${t}`, dir = worktree(name);
  let r, tok;
  if (arm === 'pi') {
    const sess = path.join(OUT, name + '-sessions');
    const cli = process.env.PI_CLI || path.join(process.env.APPDATA, 'npm', 'node_modules', '@earendil-works', 'pi-coding-agent', 'dist', 'bundle', 'cli.js');
    r = fs.existsSync(cli) ? await run(process.execPath, [cli, '-p', '--approve', '--session-dir', sess, '--name', name, prompt(t)], dir)
      : await run('cmd', ['/c', 'pi', '-p', '--approve', '--session-dir', sess, '--name', name, prompt(t)], dir);
    tok = piTokens(sess);
  } else {
    const pf = path.join(OUT, name + '.prompt.txt'); fs.writeFileSync(pf, prompt(t));
    r = await run(OC_EXE, ['run', '--standalone', '--model', MODEL, '--auto', '--format', 'json', '--title', name, prompt(t)], dir, OC_ENV);
    const sid = (r.out.match(/"sessionID":"(ses_[^"]+)"/) || [])[1];
    tok = ocTokens(sid);
  }
  fs.writeFileSync(path.join(OUT, name + '.out.txt'), r.out);
  const acc = sh('node', [path.join('tools', 'checks', TASKS[t].check)], { cwd: dir, timeout: 600e3 });
  const changed = sh('git', ['diff', '--name-only'], { cwd: dir }).stdout.trim().split('\n').filter(Boolean);
  const untracked = sh('git', ['ls-files', '--others', '--exclude-standard', 'src'], { cwd: dir }).stdout.trim().split('\n').filter(Boolean);
  const files = [...changed, ...untracked];
  const diffLines = sh('git', ['diff', '--numstat'], { cwd: dir }).stdout.trim().split('\n').filter(Boolean).reduce((a, l) => a + (+l.split('\t')[0] || 0) + (+l.split('\t')[1] || 0), 0);
  const scope = files.some(f => /pixel-(game|world)\.js$/.test(f)) ? 'TIER-C' : 'ok';
  sh('git', ['diff'], { cwd: dir }).stdout && fs.writeFileSync(path.join(OUT, name + '.diff'), sh('git', ['diff'], { cwd: dir }).stdout);
  const last = (r.out.replace(/"[^"]{200,}"/g, '""').match(/\b(DONE|FAILED)\b[^\n"]{0,80}/g) || ['-']).pop().replace(/,/g, ';');
  const row = [new Date().toISOString().slice(0, 16), arm, t, BASE.slice(0, 7), r.min.toFixed(1), r.code, acc.status === 0 ? 'PASS' : 'FAIL', files.length, diffLines, scope,
    tok.calls, tok.input, tok.cacheRead, tok.cacheWrite, tok.output, tok.reasoning, tok.usd.toFixed(4), last];
  fs.appendFileSync(csv, row.join(',') + '\n');
  console.log(row.join(' | '));
}
console.log('worktrees + logs in', OUT);
