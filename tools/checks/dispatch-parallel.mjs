// dispatch-parallel.mjs — check the dispatcher's per-card worktree mode (--parallel) without running dsh.
// `node tools/pi-dispatch.mjs --worktree-selftest` builds a throwaway git repo with a real node_modules and a fake
// agent: two cards edit different files and must both apply back; two cards edit the same line, so the second must
// end CONFLICT with its .patch kept and the main file untouched by it; every worktree must be removed (the CONFLICT
// one is dropped by the selftest itself), and the main checkout's node_modules must still be there afterwards.
// Exit 1 unless that exits 0, prints all five marker lines below, and the repo's own node_modules survived.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MARKERS = [
  /^apply: both$/m,
  /^conflict: T\d+ patch kept$/m,
  /^node_modules: kept$/m,
  /^worktrees: 0 left$/m,
  /^ports: \d+,\d+$/m,
];

let bad = 0;
const fail = msg => { bad++; console.log(`FAIL ${msg}`); };

const r = spawnSync(process.execPath, ['tools/pi-dispatch.mjs', '--worktree-selftest'], {
  cwd: ROOT, encoding: 'utf8', timeout: 5 * 60e3, maxBuffer: 64 << 20,
});
const out = `${r.stdout || ''}${r.stderr || ''}`;
if (r.status !== 0) {
  fail(`--worktree-selftest exit ${r.status}: ${out.trim().split('\n').slice(-6).join(' / ')}`);
}
for (const re of MARKERS) if (!re.test(out)) fail(`missing marker ${re.source}`);
if (!/^ports: 5100,5101$/m.test(out)) fail('per-card ports are not 5100,5101');
if (!fs.existsSync(path.join(ROOT, 'node_modules'))) fail('the main checkout lost node_modules');

if (bad) { console.log(`dispatch-parallel: ${bad} failure(s)`); process.exit(1); }
console.log('dispatch-parallel: PASS');
