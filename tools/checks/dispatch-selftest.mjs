// dispatch-selftest.mjs — check the dispatcher's stage list and one-line output without running pi.
// Runs `node tools/pi-dispatch.mjs <fixture> --dry-run` on the fixture cards and asserts what a real run would do:
// plan only for a card without Steps, plan gate stops after PLAN, no review for scout cards, the `opus:` escalation
// (tier-c from the Files list), and the `Txx VERDICT accept:.. scope:.. review:.. precheck:.. Nx Mm $x` line.
// Also checks that `--opus-verdict` appends one correct row to a ledger it is pointed at (`--ledger`, `--cost-log`),
// and that `--diff-selftest` counts only the card's own change (T48: the review diff is built against the text the file
// had before the run, not against HEAD) and `--base-selftest` picks that before text (snapshot → HEAD → empty, binary → 0).
// Exit 1 on any failure. Cheap (no pi, no accept command, no status change), so it is safe in an Accept line.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIX = 'tools/checks/fixtures';
// the exact stage order a real run would use; `precheck` is listed because `Accept: auto` gets one
const LINE = /^\S+ DRY-RUN accept:\S+ scope:\S+ review:(OK|ISSUES|skip) precheck:\S+ \d+x \d+m \$\d+\.\d{3}$/;
const CASES = [
  { file: `${FIX}/normal.md`, stages: ['implement', 'accept', 'review'], line: /^\S+ DRY-RUN accept:n\/a scope:ok review:OK precheck:n\/a 0x 0m \$0\.000$/, opus: '-' },
  { file: `${FIX}/goal-only.md`, stages: ['plan', 'precheck', 'implement', 'accept', 'review'], line: /^\S+ DRY-RUN accept:auto scope:n\/a review:OK precheck:n\/a 0x 0m \$0\.000$/, opus: '-' },
  { file: `${FIX}/scout.md`, stages: ['implement'], line: /^\S+ DRY-RUN accept:n\/a scope:ok review:skip precheck:n\/a 0x 0m \$0\.000$/, opus: '-' },
  // Gate: plan stops after PLAN and its precheck; the card is not a failure, it waits for Opus
  { file: `${FIX}/plan-gate.md`, stages: ['plan', 'precheck'], line: /^\S+ DRY-RUN accept:auto scope:ok review:pending precheck:n\/a 0x 0m \$0\.000$/, opus: '-', planReady: true },
  // a gated card with its own Accept line has no precheck: the stage list ends at plan
  { file: `${FIX}/plan-gate-steps.md`, stages: ['plan'], line: /^\S+ DRY-RUN accept:n\/a scope:ok review:pending precheck:n\/a 0x 0m \$0\.000$/, opus: '-', planReady: true },
  // a card whose Files name tier C code must be escalated to Opus from the file list alone
  { file: `${FIX}/opus-tierc.md`, stages: ['implement', 'accept', 'review'], line: /^\S+ DRY-RUN accept:n\/a scope:ok review:OK precheck:n\/a 0x 0m \$0\.000$/, opus: 'tier-c' },
  // the montage gate stops after plan -> implement -> accept and one look at the montage: review is pending, no PLAN-READY
  { file: `${FIX}/montage.md`, stages: ['implement', 'accept', 'montage-gate'], line: /^\S+ DRY-RUN accept:n\/a scope:ok review:pending precheck:n\/a 0x 0m \$0\.000$/, opus: '-', montage: true, noLine: true },
];

let bad = 0;
const fail = (file, msg) => { bad++; console.log(`FAIL ${file}: ${msg}`); };
// the dispatcher that started this run may hold .running already: compare instead of asserting absence
const LOCK = path.join(ROOT, 'output/pi-results/.running');
const lockBefore = fs.existsSync(LOCK) ? fs.readFileSync(LOCK, 'utf8') : null;

for (const c of CASES) {
  const r = spawnSync(process.execPath, ['tools/pi-dispatch.mjs', c.file, '--dry-run'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 << 20 });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  if (r.status !== 0) { fail(c.file, `dry-run exit ${r.status}: ${out.trim().split('\n').slice(-6).join(' / ')}`); continue; }

  const got = (out.match(/^stages: (.+)$/m) || [])[1];
  if (!got) { fail(c.file, 'no "stages:" line'); continue; }
  const stages = got.split(',').map(s => s.trim()).filter(Boolean);
  if (stages.join(',') !== c.stages.join(',')) fail(c.file, `stages ${stages.join(',')} != ${c.stages.join(',')}`);

  const line = out.split('\n').find(l => / DRY-RUN /.test(l));
  if (!line) fail(c.file, 'no one-line summary line');
  else if (!c.noLine && !c.line.test(line)) fail(c.file, `one-line output malformed: ${line}`);
  else if (!c.noLine && !c.planReady && !LINE.test(line)) fail(c.file, `one-line output off format: ${line}`);

  const opus = (out.match(/^opus: (.+)$/m) || [])[1];
  if (opus !== c.opus) fail(c.file, `opus reason ${opus} != ${c.opus} (the escalation is decided from the file list)`);

  if (!/^files: \S/m.test(out)) fail(c.file, 'no "files:" line (card or plan Files section was not parsed)');
  if (c.file.includes('normal') && !/^files: .*tools\/checks\/fixtures\/normal\.md/m.test(out)) fail(c.file, 'Files section of the card was not parsed');
  if (!/^card: \S+/m.test(out)) fail(c.file, 'no "card:" line');
  if (c.planReady) {
    if (!/^\S+ PLAN-READY plan: \S+ \(\d+ lines\)$/m.test(out)) fail(c.file, 'no `Txx PLAN-READY plan: <file> (N lines)` line');
    if (/^--- stage (implement|accept|review)/m.test(out)) fail(c.file, 'a gated card must stop after the plan stage');
  } else if (c.montage) {
    if (/ PLAN-READY /.test(out)) fail(c.file, 'a montage-gated card must not print PLAN-READY');
    if (!/^montage: \S+/m.test(out)) fail(c.file, 'no `montage: <path>` line');
    if (/^--- stage review/m.test(out)) fail(c.file, 'a montage-gated card must stop before the review stage');
  } else {
    if (!/^--- stage implement/m.test(out)) fail(c.file, 'no implement stage prompt');
    if (/ PLAN-READY /.test(out)) fail(c.file, 'only a `Gate: plan` card may stop with PLAN-READY');
  }
  if ((c.file.includes('goal-only') || c.planReady) && !/^--- stage plan/m.test(out)) fail(c.file, 'goal-only card has no plan stage prompt');
  if (c.montage && /^--- stage plan/m.test(out)) fail(c.file, 'a montage card with Steps must not get a plan stage (T84)');

  // a dry run must not touch the card
  const status = (fs.readFileSync(path.join(ROOT, c.file), 'utf8').match(/^Status:\s*(.+)$/m) || [])[1];
  if (status !== 'todo') fail(c.file, `dry-run changed Status to "${status}"`);
}

if ((fs.existsSync(LOCK) ? fs.readFileSync(LOCK, 'utf8') : null) !== lockBefore) fail('dry-run', 'created or changed the .running lock');
for (const f of ['normal', 'goal-only', 'scout', 'plan-gate', 'plan-gate-steps', 'opus-tierc', 'montage']) if (fs.existsSync(path.join(ROOT, 'output/pi-results', `.running-${f}`))) fail('dry-run', `left .running-${f} behind`);

// --montage-selftest: the whole montage-gate flow against a throwaway repo with a fake agent (no dsh, no repo data)
const montage = spawnSync(process.execPath, ['tools/pi-dispatch.mjs', '--montage-selftest'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 << 20 });
const montageOut = `${montage.stdout || ''}${montage.stderr || ''}`;
if (montage.status !== 0) fail('--montage-selftest', `exit ${montage.status}: ${montageOut.trim().split('\n').slice(-8).join(' / ')}`);
else if (!/^montage-selftest: PASS$/m.test(montageOut)) fail('--montage-selftest', 'missing `montage-selftest: PASS`');

// --opus-verdict: one row per verdict, reason and pi_review taken from the latest cost-log row for that card
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-selftest-'));
try {
  const cost = path.join(tmp, 'cost-log.csv'), ledger = path.join(tmp, 'opus-review.csv');
  const HEAD = 'date,card,attempts,verdict,accept,minutes,usd,start,end,scope,review,precheck,stages,opus\n';
  fs.writeFileSync(cost, HEAD + '2026-01-01T00:00,T99,1,DONE,PASS,1.0,0.01,2026-01-01T00:00:00.000Z,2026-01-01T00:01:00.000Z,ok,ISSUES,0,implement,big-diff\n');
  const run = (...a) => spawnSync(process.execPath, ['tools/pi-dispatch.mjs', ...a], { cwd: ROOT, encoding: 'utf8' });
  const r = run('--opus-verdict', 'T99', 'missed', 'selftest note', '--ledger', ledger, '--cost-log', cost);
  if (r.status !== 0) fail('--opus-verdict', `exit ${r.status}: ${(r.stdout || r.stderr || '').trim().split('\n').slice(-3).join(' / ')}`);
  const rows = fs.existsSync(ledger) ? fs.readFileSync(ledger, 'utf8').trim().split('\n') : [];
  if (rows.length !== 2) fail('--opus-verdict', `ledger has ${rows.length} line(s), expected a header and one row`);
  if (rows[0] !== 'date,card,reason,pi_review,opus_verdict,note') fail('--opus-verdict', `ledger header is "${rows[0]}"`);
  const cell = (rows[1] || '').split(',');
  if (cell.length !== 6) fail('--opus-verdict', `row has ${cell.length} columns: ${rows[1]}`);
  else if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(cell[0])) fail('--opus-verdict', `bad date "${cell[0]}"`);
  else if (cell[1] !== 'T99' || cell[2] !== 'big-diff' || cell[3] !== 'ISSUES' || cell[4] !== 'missed' || cell[5] !== 'selftest note')
    fail('--opus-verdict', `row does not carry card/reason/pi_review/verdict/note: ${rows[1]}`);
  // a second verdict appends instead of rewriting, and a bad verdict is a usage error
  if (run('--opus-verdict', 'T99', 'ok', '--ledger', ledger, '--cost-log', cost).status !== 0) fail('--opus-verdict', 'second verdict failed');
  else if (fs.readFileSync(ledger, 'utf8').trim().split('\n').length !== 3) fail('--opus-verdict', 'second verdict did not append a row');
  if (run('--opus-verdict', 'T99', 'wat', '--ledger', ledger, '--cost-log', cost).status !== 2) fail('--opus-verdict', 'a bad verdict must exit 2');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

// --diff-selftest: a file that was already dirty before the card must not have its old edits counted as this card's change
const dt = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-diff-'));
try {
  const before = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
  const after = before.replace('line 7\n', 'line 7 changed\n') + 'line 21\n';   // one changed line + one added line
  const bf = path.join(dt, 'before.txt'), af = path.join(dt, 'after.txt');
  fs.writeFileSync(bf, before); fs.writeFileSync(af, after);
  const run2 = (...a) => spawnSync(process.execPath, ['tools/pi-dispatch.mjs', ...a], { cwd: ROOT, encoding: 'utf8' });
  const r = run2('--diff-selftest', bf, af, 'src/example.js');
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  if (r.status !== 0) fail('--diff-selftest', `exit ${r.status}: ${out.trim().split('\n').slice(-3).join(' / ')}`);
  const n = Number((out.match(/^lines: (\d+)$/m) || [])[1]);
  if (n !== 3) fail('--diff-selftest', `line count ${n} != 3 (20-line file, one changed + one added line; a whole-file diff would count 21)`);
  if (!/^diff --git a\/src\/example\.js b\/src\/example\.js$/m.test(out)) fail('--diff-selftest', 'diff --git header does not carry the repo path');
  if (!/^--- a\/src\/example\.js$/m.test(out) || !/^\+\+\+ b\/src\/example\.js$/m.test(out)) fail('--diff-selftest', '---/+++ headers do not carry the repo path');
  if (out.includes(dt) || out.includes(dt.split(path.sep).join('/'))) fail('--diff-selftest', 'headers still point at the temp directory');
  // identical before/after: nothing to review and a zero count
  const same = run2('--diff-selftest', bf, bf, 'src/example.js');
  const sameOut = `${same.stdout || ''}${same.stderr || ''}`;
  if (same.status !== 0 || !/^lines: 0$/m.test(sameOut)) fail('--diff-selftest', `identical before/after must print "lines: 0", got ${sameOut.trim().split('\n').slice(-2).join(' / ')}`);
  // a mistyped fixture path must fail instead of silently diffing against an empty file
  const missing = run2('--diff-selftest', path.join(dt, 'nope.txt'), af, 'src/example.js');
  if (missing.status !== 2) fail('--diff-selftest', `an unreadable path must exit 2, got ${missing.status}`);
} finally { fs.rmSync(dt, { recursive: true, force: true }); }

// --base-selftest: the before-text lookup the review diff is built from (dirty-before snapshot → `git show HEAD:` → empty),
// and the diff-line count computed from it (T48: a binary file clean at HEAD must count 0 lines instead of crashing)
const bt = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-base-'));
try {
  const run3 = (...a) => spawnSync(process.execPath, ['tools/pi-dispatch.mjs', ...a], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 << 20 });
  const parse = r => {
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    const m = out.match(/^text: (.*)$/m);
    let text = null; try { text = m ? JSON.parse(m[1]) : null; } catch { text = null; }
    return { out, status: r.status, base: (out.match(/^base: (\S+)$/m) || [])[1], text, lines: Number((out.match(/^lines: (\d+)$/m) || [])[1]) };
  };
  const tracked = 'package.json';
  const head = spawnSync('git', ['show', `HEAD:${tracked}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 << 20 });
  if (head.status !== 0) fail('--base-selftest', `git show HEAD:${tracked} failed (${head.status})`);
  else {
    // 1. a file already dirty before the card: the pre-run snapshot text wins over HEAD
    const dirtyFile = path.join(bt, 'dirty.txt');
    fs.writeFileSync(dirtyFile, 'dirty marker\n');
    const dirty = parse(run3('--base-selftest', tracked, dirtyFile));
    if (dirty.status !== 0) fail('--base-selftest', `dirty case exit ${dirty.status}: ${dirty.out.trim().split('\n').slice(-2).join(' / ')}`);
    else if (dirty.base !== 'dirty' || dirty.text !== 'dirty marker\n') fail('--base-selftest', `dirty snapshot not used as the before text: base=${dirty.base} text=${JSON.stringify(dirty.text)}`);

    // 2. a file that was clean at HEAD: `git show HEAD:<path>` is the before text, and the line count matches a diff of that text
    const headFile = path.join(bt, 'head.txt');
    fs.writeFileSync(headFile, head.stdout);
    const clean = parse(run3('--base-selftest', tracked));
    if (clean.status !== 0) fail('--base-selftest', `head case exit ${clean.status}: ${clean.out.trim().split('\n').slice(-2).join(' / ')}`);
    else if (clean.base !== 'head' || clean.text !== head.stdout) fail('--base-selftest', `HEAD text not used as the before text: base=${clean.base} len=${(clean.text || '').length}/${head.stdout.length}`);
    else {
      const check = parse(run3('--diff-selftest', headFile, path.join(ROOT, tracked), tracked));
      if (check.status !== 0) fail('--base-selftest', `diff of the HEAD text exit ${check.status}`);
      else if (clean.lines !== check.lines) fail('--base-selftest', `diffLineCount ${clean.lines} != diff --no-index ${check.lines} for ${tracked}`);
    }
  }

  // 3. a file that does not exist at HEAD: empty before text (a new file), not a crash
  const fresh = parse(run3('--base-selftest', 'src/does-not-exist-T48.js'));
  if (fresh.status !== 0 || fresh.base !== 'empty' || fresh.text !== '') fail('--base-selftest', `new file must give base=empty text="", got base=${fresh.base} text=${JSON.stringify(fresh.text)} exit ${fresh.status}`);

  // 4. a binary file clean at HEAD: no text to diff, so 0 lines — never a null before-text written to a temp file
  const bin = parse(run3('--base-selftest', 'assets/cold@1x.png'));
  if (bin.status !== 0) fail('--base-selftest', `binary case exit ${bin.status}: ${bin.out.trim().split('\n').slice(-2).join(' / ')}`);
  else if (bin.base !== 'binary' || bin.lines !== 0) fail('--base-selftest', `binary file must give base=binary lines=0, got base=${bin.base} lines=${bin.lines}`);

  // a mistyped dirty snapshot file is a usage error, like the diff fixtures
  const badDirty = run3('--base-selftest', tracked, path.join(bt, 'nope.txt'));
  if (badDirty.status !== 2) fail('--base-selftest', `an unreadable dirty fixture must exit 2, got ${badDirty.status}`);
} finally { fs.rmSync(bt, { recursive: true, force: true }); }

if (bad) { console.log(`dispatch-selftest: ${bad} failure(s)`); process.exit(1); }
console.log(`dispatch-selftest: PASS (${CASES.length} fixture cards)`);
