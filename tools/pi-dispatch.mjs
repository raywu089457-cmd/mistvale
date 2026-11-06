// pi-dispatch.mjs — Claude 派工給 pi(預設 DeepSeek v4.1 Flash):一次可派多張卡,依序執行,最後只印一張總表。
// 用法:node tools/pi-dispatch.mjs T30 [T31 ...] [--timeout 40] [--note "補充"] [--attempts 3] [--no-review] [--dry-run] [--full] [--force] [--parallel] [--keep-worktree] [--worktree-selftest] [--no-retry] [--keep-going]
//   - 每張卡分成幾個階段,每個階段是獨立的 pi session:
//     PLAN(卡片沒有 ## Steps 時:pi 讀程式,寫 output/pi-results/<id>.plan.md 的 Files 與 Steps;`Accept: auto` 時計畫第一行是驗收指令)
//       驗收指令至少要跑一個 tools/checks/ 檢查器;只有 npm test / npm run verify 之類的一般套件就退回 PLAN 一次
//       (accept:generic:第二次仍是一般套件 → BLOCKED,不進實作)
//     → PRECHECK(`Accept: auto` 且驗收用到 tools/checks/ 檢查器,新的舊的都算:先在沒改動的樹上跑一次;
//       已經通過就退回 PLAN 改寫一次,改寫後仍通過 → 判定 ALREADY(目標早已達成),跳過實作與 REVIEW)
//     → 實作(pi -p,拿到「卡片 + 計畫」)→ ACCEPT(派工腳本自己跑卡片的驗收指令,不是 LLM,結果可信)
//     → REVIEW(新開一個 pi 當批評者看 diff,寫 <id>.review.md;有 high 問題就退回實作,算一次嘗試)
//   - 預設最多 3 次嘗試(--attempts N 改);失敗自動帶錯誤摘要重派一次;卡片報 BLOCKED 立刻停
//   - 預設每張卡只印一行:`Txx VERDICT accept:.. scope:.. review:OK|ISSUES|skip precheck:..|n/a Nx Mm $x`
//     內容(結果檔,上限 1200 字元;偵察卡 3000;--full 4000)只印沒過的卡或加了 --full;多張卡最後再印一行一張的總表
//   - 每次結果追加一行到 docs/pi-tasks/cost-log.csv(..., scope, review, precheck, stages)
//   - 計畫閘門:`Gate: plan` 或 --approve-plan 讓卡片停在 PLAN(與它的 PRECHECK)之後,狀態改成 plan-review,並印一行
//     `Txx PLAN-READY plan: <檔> (N lines)`(不算失敗,佇列繼續);之後 `--approved [--note "方向"]` 跳過 PLAN、沿用既有計畫檔再往下跑
//   - Opus 複核:`opus: tier-c|review-failed|big-diff|sample`(改到 pixel-game/world、review 用盡次數仍 high、diff > 300 行、卡號 ÷5),
//     有值就多印一行 diff/review 路徑給 Claude 讀;`--opus-verdict Txx ok|missed|fixed "note"` 寫進 docs/pi-tasks/opus-review.csv
//   - --dry-run:只解析卡片、印出階段清單與每個階段的提示詞,不跑 pi、不跑驗收、不改卡片狀態
//   - --parallel:每張卡各自在 output/pi-worktrees/<id> 的 git worktree 跑(HEAD + 主 checkout 未提交的改動;node_modules 用 junction),
//     建置與驗收都在 worktree 裡、每張卡自己的 PORT/HOST;通過後 patch 用 git apply 套回主 checkout,
//     套不上就是 CONFLICT(留 <id>.patch 與 worktree,主 checkout 不動)。沒加 --parallel 時行為完全不變
//   - <id>.diff 只含這張卡自己的改動:跑卡前已經髒掉或未追蹤的檔案,以跑卡前的內容為基準做 diff(乾淨的檔案以 HEAD 為基準),
//     big-diff 的行數也從這份 diff 算,不再把先前的未提交改動算進來
//   - pi 對話在 output/pi-sessions/,完整輸出在 output/pi-results/<id>.log,驗收輸出在 <id>.accept.log
// 卡片狀態 `Status:` 只由本腳本改:todo → in-progress → done/failed;`reusable` 的卡(T01 驗收、T04 推送)跑完維持 reusable。
// 結束碼:全部卡 DONE 且驗收通過(或沒有 Accept 行)→ 0;否則 1。同一時間只派一條(兩邊同時建置會互刪 outputs/media)。
import { spawn, execSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acceptCheckers, isGenericAccept, allowedWithCheckers } from './dispatch-accept.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TASKS = path.join(ROOT, 'docs/pi-tasks');
const args = process.argv.slice(2);
const VALUED = new Set(['--timeout', '--note', '--attempts', '--ledger', '--cost-log']);
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const flag = k => args.includes('--' + k);
const ids = args.filter((a, i) => !a.startsWith('--') && !VALUED.has(args[i - 1]));
const resolveCard = a => /^T\d+$/i.test(a)
  ? (fs.readdirSync(TASKS).filter(f => f.toUpperCase().startsWith(a.toUpperCase() + '-')).map(f => 'docs/pi-tasks/' + f)[0] || null)
  : (fs.existsSync(path.join(ROOT, a)) ? a : null);   // a plain relative path works too (selftest fixtures live in tools/checks/fixtures/)
// the Opus verdict ledger and the per-card cost log can be pointed elsewhere, so the selftest never writes repo data
const LEDGER = opt('ledger') ? path.resolve(ROOT, opt('ledger')) : path.join(TASKS, 'opus-review.csv');
const LOG_CSV = opt('cost-log') ? path.resolve(ROOT, opt('cost-log')) : path.join(TASKS, 'cost-log.csv');
// positional arguments: a flag's own value is skipped, but --opus-verdict's values (card, verdict, note) stay positional
const positional = () => { const out = []; for (let i = 0; i < args.length; i++) { if (args[i].startsWith('--')) { if (VALUED.has(args[i])) i++; continue; } out.push(args[i]); } return out; };
// --opus-verdict Txx ok|missed|fixed "note": record what Opus said about one card, so the pi-review miss rate is a number and not a feeling
function opusVerdict() {
  const [cardArg, verdictArg, ...noteParts] = positional();
  const verdicts = ['ok', 'missed', 'fixed'];
  if (!cardArg || !verdicts.includes(verdictArg) || !/^T\d+$/i.test(cardArg)) {
    console.error('用法: node tools/pi-dispatch.mjs --opus-verdict Txx ok|missed|fixed "note" [--ledger <path>]');
    process.exit(2);
  }
  const id = cardArg.toUpperCase(), note = noteParts.join(' ').replace(/[\r\n]+/g, ' ').trim();
  let log = ''; try { log = fs.readFileSync(LOG_CSV, 'utf8'); } catch { }
  const lines = log.split('\n').filter(l => l.trim());
  const head = lines.length && lines[0].startsWith('date,') ? lines.shift().split(',') : [];
  const col = n => head.indexOf(n);
  let reason = '-', piReview = '-';   // latest row for that card; a row written before the opus column existed has reasons '-'
  for (const line of lines) { const c = line.split(','); if ((c[1] || '').toUpperCase() !== id) continue;
    reason = (col('opus') >= 0 ? c[col('opus')] : '') || '-';
    piReview = (col('review') >= 0 ? c[col('review')] : '') || '-';
  }
  const csv = v => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const HEAD = 'date,card,reason,pi_review,opus_verdict,note\n';
  const row = [new Date().toISOString().slice(0, 16), id, reason, piReview, verdictArg, note || '-'].map(csv).join(',');
  const ledger = LEDGER;
  fs.mkdirSync(path.dirname(ledger), { recursive: true });
  const old = fs.existsSync(ledger) ? fs.readFileSync(ledger, 'utf8') : null;
  if (old == null) fs.writeFileSync(ledger, HEAD);
  else if (!old.startsWith(HEAD)) fs.writeFileSync(ledger, HEAD + old);   // same header-rewrite method as cost-log.csv
  fs.appendFileSync(ledger, row + '\n');
  console.log(`opus-verdict ${id} reason:${reason} pi-review:${piReview} verdict:${verdictArg} -> ${path.relative(ROOT, ledger).split(path.sep).join('/')}`);
  process.exit(0);
}
if (flag('opus-verdict')) opusVerdict();
if (flag('diff-selftest')) diffSelftest();
if (flag('base-selftest')) baseSelftest();
const WT_SELFTEST = flag('worktree-selftest');   // runs the real runCard/finalize against a throwaway repo, no dsh calls
const cards = WT_SELFTEST ? [] : ids.map(a => [a, resolveCard(a)]);
if (!WT_SELFTEST && (!cards.length || cards.some(([, c]) => !c))) {
  console.error('用法: node tools/pi-dispatch.mjs Txx [Tyy ...] [--timeout 分鐘] [--note "補充"] [--attempts 3] [--no-review] [--dry-run] [--full] [--force] [--parallel] [--keep-worktree] [--no-retry] [--keep-going] [--approve-plan] [--approved]');
  for (const [a, c] of cards) if (!c) console.error(`找不到卡片:${a}`);
  process.exit(2);
}
const RES = path.join(ROOT, 'output/pi-results'), SESS = path.join(ROOT, 'output/pi-sessions');
fs.mkdirSync(RES, { recursive: true }); fs.mkdirSync(SESS, { recursive: true });
const CAP = flag('full') ? 4000 : 1200;
const minutes = Number(opt('timeout')) || 60;   // hard cap per stage; hangs are caught by the idle watchdog below
const IDLE_MIN = Number(opt('idle')) || 10;      // no agent output for this long = hung (T65 sat silent for 40 min); tool calls run ≤ 7 min
const MAX_ATTEMPTS = Math.max(1, Number(opt('attempts')) || 3);   // 2 was too few now that a review can send work back
const noReview = flag('no-review'), DRY = flag('dry-run');

// which files changed: compare content hashes (a file that is already modified keeps the same `git status` line when edited again)
const snapshot = (root = ROOT) => { const list = new Set(); try {
    const git = c => execSync(c, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString();   // stderr off: CRLF warnings flood the output
    for (const f of git('git diff HEAD --name-only').split('\n')) if (f) list.add(f);   // vs HEAD: an agent that `git add`s its work must still show up (exp 9, pi T65)
    for (const f of git('git ls-files --others --exclude-standard src assets/ui docs pipeline tools sprites').split('\n')) if (f) list.add(f);
  } catch { }
  const out = []; for (const f of list) { try { out.push(f + ':' + crypto.createHash('md5').update(fs.readFileSync(path.join(root, f))).digest('hex')); } catch { } } return out; };

// files outside the card's "Files you may change" list: path-like tokens become prefixes (dir/), globs (*), exact paths, or bare basenames
const allowedFiles = text => {
  const sec = (text.match(/^## Files[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m) || [])[1] || '';
  return [...sec.matchAll(/[\w.*\-\/]+\/[\w.*\-\/|]*|[\w*\-]+\.[\w*|.]+/g)].flatMap(m => {
    const [first, ...alts] = m[0].replace(/^\.\//, '').split('|');   // `dir/*.py|*.mjs` → dir/*.py, dir/*.mjs
    const dir = first.includes('/') ? first.slice(0, first.lastIndexOf('/') + 1) : '';
    return [first, ...alts.map(a => a.includes('/') ? a : dir + a)];
  });
};
const glob = t => new RegExp('^' + t.replace(/[.+^${}()[\]\\]/g, '\\$&').replace(/\*\*/g, '\0').replace(/\*/g, '[^/]*').replace(/\0/g, '.*') + '$');
const outOfScope = (changed, allowed) => {
  if (!allowed.length) return null;   // no parsable list: skip the check rather than guess
  const ok = f => allowed.some(t => t.endsWith('/') ? f.startsWith(t)
    : t.includes('/') ? (t.includes('*') ? glob(t).test(f) : f === t || f.startsWith(t + '/'))
    : glob(t).test(path.basename(f)));   // bare names (`demo.js`, `*.png`) match the basename anywhere
  return changed.filter(f => !ok(f));
};

const header = (text, key) => (text.match(new RegExp(`^${key}:\\s*(.+)$`, 'm')) || [])[1]?.trim() || '';
// Opus reads the diff only when the card is risky or pi's own review cannot be trusted; the reason is recorded per card
const opusReason = (changed, { reviewFailed = false, diffLines = 0, num = 0 } = {}) => {
  if (changed.some(f => f === 'src/pixel-game.js' || f === 'src/pixel-world.js')) return 'tier-c';
  if (reviewFailed) return 'review-failed';
  if (diffLines > 300) return 'big-diff';
  return num && Number(num) % 5 === 0 ? 'sample' : '-';
};
const cardNum = id => Number((String(id).match(/\d+/) || [])[0]) || 0;   // T45 → 45; a fixture name without a number → 0
const setStatus = (card, v, root = ROOT) => { try { const f = path.join(root, card), t = fs.readFileSync(f, 'utf8'); if (/^Status:/m.test(t)) fs.writeFileSync(f, t.replace(/^Status:.*$/m, 'Status: ' + v)); } catch { } };
const readFileOr = (f, d = '') => { try { return fs.readFileSync(f, 'utf8'); } catch { return d; } };
// changed lines the way the reviewer sees them: the + / - lines of this card's own diff (headers excluded).
// Function declarations (like readText/baseOf below) so --base-selftest can call this before the const helpers exist.
// A binary file has no text on one side: skip it, or an empty "before" would count the whole file as added.
function diffLineCount(files, base = new Map(), root = ROOT) {
  let n = 0;
  for (const f of files) {
    const after = readText(path.join(root, f)), before = baseOf(f, base, root);
    if (before == null || after == null) continue;
    n += diffOne(f, before, after).lines;
  }
  return n;
}
const section = (text, name) => (text.match(new RegExp(`^## ${name}[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm')) || [])[1] || '';
const rel = p => path.relative(ROOT, p).split(path.sep).join('/');

// Everything every card used to repeat (scope, report format, stop rules) lives here, so cards hold only Goal/Files/Steps/Accept.
const buildPrompt = (card, id, type, accept, note, plan, resHint = 'output/pi-results') => [   // agent-to-agent text is English (cheaper, clearer)
  `Do the task card ${card}. Read the whole card and the root AGENTS.md first; use docs/ARCHITECTURE.md as the file map instead of exploring.`,
  `Non-interactive run dispatched by Claude: nobody can answer questions. Never ask or wait; if you must stop, write the reason into the result file and exit.`,
  `Scope: do the steps in order, change only the files under "Files you may change", do not widen the task. Never edit the card itself.`,
  plan ? `A PLAN stage already read the code and wrote ${plan}: its "Files you may change" and "Steps" are the scope and the work order. If the plan and the card disagree, the card wins; say so in the result file.` : '',
  `Cards name functions, selectors and keys, not line numbers: find them with grep and read only those parts; never read src/pixel-game.js or src/pixel-world.js whole.`,
  `Run every command in the FOREGROUND and wait (npm run verify takes up to 12 minutes; fine). No background jobs: in -p mode the run ends when you stop calling tools.`,
  `Button-crawl flakes: if a verify FAIL line names a button unrelated to this card, re-run verify at most once; if it fails again on a different unrelated button, treat it as a flake, note it and continue.`,
  `Stop after the same check fails twice: no big rewrites; write the error summary into the result file and hand back to Claude.`,
  `Do not commit or push unless the card says so. Do not spend PixelLab credits unless the card states a budget. Do not touch hunter AI, combat or save code in src/pixel-game.js, or drawing code in src/pixel-world.js, unless the card's Files list names that exact function.`,
  // with an Accept line, that command is the whole check: T43 spent most of its 37 min on an unrequested full `npm run verify` (button crawl)
  accept ? `The dispatcher will run this acceptance command itself after you finish: \`${accept}\`. While you work, run only the tools/checks/ checker(s) it names (plus \`npm run build\` when they need a fresh build). Do NOT run \`npm test\`, \`npm run verify\` or \`npm run verify:quick\` yourself, even if this command includes them: the dispatcher runs the full command once after you finish and sends you its failure output if it fails.` : '',   // 2026-11-06: each verify:quick is 1–2.5 min and cards ran it many times
  type === 'scout'
    ? `This is a SCOUT card: change no files at all. Your result file is a brief for Claude: line 1 \`DONE | scout\`, then at most 40 lines: exact function/selector names with file paths, current behaviour, constraints, and open questions. No code dumps.`
    : `Result file ${resHint}/${id}.md: line 1 exactly \`DONE|BLOCKED|FAILED | files: <names> | ${accept ? 'accept: <PASS|FAIL and the last line it printed>' : 'verify: <first line of output/ui-audit/verify-summary.md, or n/a>'}\`, then at most 10 short lines (max 1000 characters): key numbers and problems, or "none". No pasted logs.`,
  `Do not end your turn until ${resHint}/${id}.md exists. Write it BEFORE optional slow steps like Telegram.`,
  note ? `Extra note for this run: ${note}` : '',
].filter(Boolean).join('\n');

// PLAN: pi reads the code and turns a goal-only card into a normal card (Files + Steps), so Claude never has to read code to write one.
const buildPlanPrompt = (card, id, type, acceptHead, extra, resHint = 'output/pi-results') => [
  `Planning stage for the task card ${card} (id ${id}). Do NOT change any project file: the only file you write is ${resHint}/${id}.plan.md.`,
  `Read the whole card and the root AGENTS.md first; use docs/ARCHITECTURE.md as the file map and docs/API-pi.md for export names instead of exploring. Grep for the functions, selectors and keys the card names; never read src/pixel-game.js or src/pixel-world.js whole.`,
  `Write ${resHint}/${id}.plan.md in the shape of a normal card: a line \`## Files you may change\` with one path per bullet (globs allowed), then \`## Steps\` as a numbered list of exact edits and commands. Name functions, selectors and keys, never line numbers. Keep it under 25 lines and cover only what the card asks for.`,
  acceptHead === 'auto'
    ? `This card says \`Accept: auto\`, so the FIRST line of the plan must be \`Accept: <one shell command>\`. It must run at least one checker under tools/checks/ — an existing one (\`node tools/checks/*.mjs\`) or a new deterministic checker you write as part of the plan (list it under \`## Files you may change\`; naming it in the Accept line is enough for scope). Generic suites (\`npm test\`, \`npm run verify\`, \`npm run verify:quick\`, \`npm run build\`) may only be chained after the checker as a regression guard: an accept line with nothing but those is sent back to you once and then blocks the card. Never \`npm run verify\` (button crawl) and never anything that needs the network or a browser. The checker must FAIL on the current tree and pass once the work is done — if it already passes, you get one rewrite and then the card is closed as ALREADY (goal already met).`
    : `The card's own Accept line (${acceptHead || 'none'}) stays the check; do not invent another one.`,
  `Non-interactive run: never ask or wait. If the card cannot be planned as written, say why in the plan file and stop.`,
  extra || '',
].filter(Boolean).join('\n');

// REVIEW: a fresh session with no stake in the work reads the diff and says whether it does the goal and nothing else.
const buildReviewPrompt = (card, id, goal, plan, diff, resHint = 'output/pi-results') => [
  `Independent review stage for the task card ${card} (id ${id}). Change no files: the only file you write is ${resHint}/${id}.review.md.`,
  `You are the critic, not the author. Read the card ${card}${plan ? `, the plan ${plan}` : ''} and the diff ${diff}. The diff is the whole change; read a file it touches only if you need context (grep, docs/ARCHITECTURE.md).`,
  `Judge only this: does the diff do what the card's Goal asks, nothing more, nothing broken (missing call site, dead code, wrong selector, unhandled state, scope creep, an acceptance command that would pass without the change)?`,
  `The card's Goal, for reference:\n${goal.trim()}`,
  `Write ${resHint}/${id}.review.md: line 1 exactly \`OK\` or \`ISSUES\`, then at most 10 lines, each starting with \`high\` or \`low\` and one concrete problem (file + function/selector + what to change). Use \`high\` only for a real defect or scope creep that must be fixed. No praise, no code dumps.`,
  `Non-interactive run: never ask or wait.`,
].filter(Boolean).join('\n');

const npmRoot = (() => { try { return execSync('npm root -g').toString().trim(); } catch { return ''; } })();
const PI_CLI = process.env.PI_CLI || path.join(npmRoot, '@earendil-works/pi-coding-agent/dist/bundle/cli.js');

// 直接用 node 跑 pi 的 cli.js(不經過 shell):提示詞有中文、空白、冒號、括號,經過 cmd.exe 會被拆壞。
// stdin 一定要關掉:-p 模式下 pi 會等 stdin 結束才開始做(2026-10-30 第一次派工就卡在這裡)
// The child agent is DeepSeek Harness (dsh) since 2026-11-05 (docs/pi-tasks/COST-LOG.md: cheapest or tied, fastest, no hangs).
// DISPATCH_AGENT=pi is the fallback. Every stage (plan / implement / review) runs on the same agent.
// Token usage of every stage goes to output/pi-results/agent-tokens.csv. It lives under output/ on purpose:
// a file in docs/ would count as a change the agent made and fail the scope check.
const AGENT = process.env.DISPATCH_AGENT || 'dsh';
if (!['dsh', 'pi'].includes(AGENT)) { console.error(`DISPATCH_AGENT must be dsh or pi, got ${AGENT}`); process.exit(2); }
const TOK_CSV = path.join(ROOT, 'output/pi-results/agent-tokens.csv');
// dsh runs headless (`dsh --profile headless --json -`, task on stdin).
// DSH_PATCH (default tools/dsh-overlay.yml) is a --patch overlay that picks the provider/model: opencode-go/deepseek-v4.1-flash, same as pi.
// The sandbox must be off: on Windows dsh's workspace-write sandbox blocks child-process pipes (git, esbuild, Playwright all EPERM),
// and headless mode has no approval channel to escalate (Experiment 9). danger-full-access = the same trust pi runs with.
const DSH_BIN = process.env.DSH_BIN || path.join(npmRoot, '@deepseek-ai/dsh/lib/bin.js');
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const DSH_PATCH = process.env.DSH_PATCH || (fs.existsSync(path.join(ROOT, 'tools/dsh-overlay.yml')) ? path.join(ROOT, 'tools/dsh-overlay.yml') : '');
const DSH_ENV = { DSH_PERMISSION_MODE: process.env.DSH_PERMISSION_MODE || 'danger-full-access' };
// dsh reports no provider cost: price its tokens at the provider's rates (USD per 1M tokens, same as pi's log) so $ stays comparable
const PRICE = { input: 0.15, output: 0.60, cacheRead: 0.003 };
const stageUsd = new Map();
function stageTokens(name, agentOut) {
  const s = { calls: 0, input: 0, cacheRead: 0, output: 0, reasoning: 0, usd: 0 };
  if (AGENT === 'dsh') {   // totals live in the session projection cache; output already includes reasoning
    const sid = (agentOut.match(/"sessionId":"(session-[^"]+)"/) || [])[1]; if (!sid) return s;
    s.calls = (agentOut.match(/"type":"(text|tool_call)"/g) || []).length;
    try {
      const j = JSON.parse(fs.readFileSync(path.join(DSH_HOME, 'storages/session_projcache/sessions', sid + '.json'), 'utf8'));
      const t = JSON.stringify(j).match(/"tokenUsage":\{[^]*?"totals":(\{[^}]*\})/); const u = t ? JSON.parse(t[1]) : {};
      s.input = u.uncachedInputTokens || 0; s.cacheRead = u.cacheReadTokens || 0; s.output = u.outputTokens || 0;
    } catch { }
    return s;
  }
  for (const f of fs.readdirSync(SESS).filter(f => f.endsWith('.jsonl'))) {
    const t = fs.readFileSync(path.join(SESS, f), 'utf8'); if (!t.includes(`"name":"${name}"`)) continue;
    for (const line of t.split('\n')) { if (!line.includes('"usage"')) continue; let u; try { u = JSON.parse(line).message?.usage; } catch { } if (!u) continue;
      s.calls++; s.input += u.input || 0; s.cacheRead += u.cacheRead || 0; s.output += u.output || 0; s.reasoning += u.reasoning || 0; s.usd += u.cost?.total || 0; }
  }
  return s;
}
let runAgent = null;   // --worktree-selftest swaps in a fake agent; real runs use runPi
const runPi = (prompt, name, logFile, root = ROOT, env = {}) => new Promise(resolve => {
  const t0 = Date.now();
  const piArgs = ['-p', '--approve', '--session-dir', SESS, '--name', name, prompt];
  const SP = { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } };
  const p = AGENT === 'dsh'
    ? spawn(process.execPath, [DSH_BIN, '--profile', 'headless', ...(DSH_PATCH ? ['--patch', DSH_PATCH] : []), '--json', '-'], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...DSH_ENV, PWD: root, ...env }, windowsHide: true })
    : fs.existsSync(PI_CLI) ? spawn(process.execPath, [PI_CLI, ...piArgs], SP) : spawn('pi', piArgs, SP);
  if (AGENT === 'dsh') p.stdin.end(prompt);
  const out = fs.createWriteStream(logFile, { flags: 'a' });
  let agentOut = '';
  if (AGENT !== 'pi') { p.stdout.on('data', d => { agentOut += d; out.write(d); }); p.stderr.on('data', d => out.write(d)); }
  else { p.stdout.pipe(out, { end: false }); p.stderr.pipe(out, { end: false }); }
  // 2026-11-06: idle watchdog instead of a flat 20-minute kill (that cut T68/T70 mid-work and left a half-written file).
  // A run is killed only when it prints nothing for IDLE_MIN (a hang, like T65), or at the hard cap of `minutes`.
  let lastOut = Date.now();
  p.stdout.on('data', () => { lastOut = Date.now(); }); p.stderr.on('data', () => { lastOut = Date.now(); });
  const kill = why => { out.write(`\n[pi-dispatch] ${why},結束 ${AGENT}\n`); try { process.platform === 'win32' ? execSync(`taskkill /pid ${p.pid} /T /F`) : p.kill('SIGKILL'); } catch { } };
  const timer = setInterval(() => {
    if (Date.now() - lastOut > IDLE_MIN * 60e3) { clearInterval(timer); kill(`${IDLE_MIN} 分鐘沒有任何輸出(卡住)`); }
    else if (Date.now() - t0 > minutes * 60e3) { clearInterval(timer); kill(`逾時 ${minutes} 分鐘(上限)`); }
  }, 30e3);
  p.on('close', code => {
    clearInterval(timer); out.end();
    try { const s = stageTokens(name, agentOut);
      if (AGENT !== 'pi') s.usd = (s.input * PRICE.input + s.output * PRICE.output + s.cacheRead * PRICE.cacheRead) / 1e6;
      stageUsd.set(name, (stageUsd.get(name) || 0) + s.usd);
      if (!fs.existsSync(TOK_CSV)) fs.writeFileSync(TOK_CSV, 'date,agent,stage,minutes,exit,calls,input,cache_read,output,reasoning,usd\n');
      fs.appendFileSync(TOK_CSV, [new Date().toISOString().slice(0, 16), AGENT, name, ((Date.now() - t0) / 60e3).toFixed(1), code, s.calls, s.input, s.cacheRead, s.output, s.reasoning, s.usd.toFixed(4)].join(',') + '\n');
    } catch { }
    resolve(code);
  });
});

// the acceptance check is a plain command, so its verdict does not depend on what pi claims
const runAccept = (cmd, file, root = ROOT, env = {}) => {
  const r = spawnSync(cmd, { cwd: root, shell: true, encoding: 'utf8', env: { ...process.env, ...env }, timeout: 30 * 60e3, maxBuffer: 64 << 20 });
  const text = (r.stdout || '') + (r.stderr || '');
  fs.writeFileSync(file, `$ ${cmd}\n${text}\n[exit ${r.status}]\n`);
  return { pass: r.status === 0, tail: failureSummary(text) };
};
// what a retry needs to know: the lines that name the failure (FAIL / Error / assert message / test file:line), then
// the last lines. The last 5 lines alone were Node's assert object fields (T68: operator '==') with no test name.
const failureSummary = text => {
  const lines = text.trim().split('\n').map(l => l.trimEnd()).filter(Boolean);
  const key = lines.filter(l => /\bFAIL|Error\b|AssertionError|assert|expected|actual|not ok|✗|\.m?js:\d+/i.test(l) && !/^\s*(operator|generatedMessage|code|diff):/.test(l)).slice(0, 12);
  const out = [...new Set([...key, '...', ...lines.slice(-5)])].join('\n');
  return out.length > 2000 ? out.slice(0, 2000) + '\n…' : out;
};

// read a file as text; null when it is missing, unreadable or binary (binary gets a one-line note instead of a diff)
function readText(abs) { try { const b = fs.readFileSync(abs); return b.includes(0) ? null : b.toString('utf8'); } catch { return null; } }
// the text a file had before the card ran: what the pre-run snapshot stored for a file that was already dirty/untracked,
// else HEAD (the file was clean), else empty (the file did not exist yet)
function baseOf(f, base, root = ROOT) {
  if (base.has(f)) return base.get(f) ?? '';
  const r = spawnSync('git', ['show', `HEAD:${f}`], { cwd: root, maxBuffer: 32 << 20 });
  return r.status === 0 ? (r.stdout.includes(0) ? null : r.stdout.toString()) : '';
}
// one file's change as a normal unified diff with the repo path in the headers (git diff --no-index over two temp copies).
// Function declarations on purpose: --diff-selftest runs before the const helpers are initialised.
function countDiffLines(d) { return d.split('\n').filter(l => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l)).length; }
function diffOne(repoPath, beforeTxt, afterTxt) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-diff-'));
  try {
    const a = path.join(tmp, 'a', repoPath), b = path.join(tmp, 'b', repoPath);
    fs.mkdirSync(path.dirname(a), { recursive: true }); fs.mkdirSync(path.dirname(b), { recursive: true });
    fs.writeFileSync(a, beforeTxt); fs.writeFileSync(b, afterTxt);
    const slash = p => p.split(path.sep).join('/');
    const aAbs = slash(a), bAbs = slash(b);
    const r = spawnSync('git', ['diff', '--no-index', '--no-color', '--', aAbs, bAbs], { cwd: tmp, encoding: 'utf8', maxBuffer: 32 << 20 });
    // git prefixes the paths it was given with a/ and b/, so the temp roots are replaced by the repo path (headers only)
    const diff = (r.stdout || '').split('\n')
      .filter(l => !l.startsWith('index '))
      .map(l => l.replace('a/' + aAbs, 'a/' + repoPath).replace('b/' + bAbs, 'b/' + repoPath)).join('\n');
    return { diff, lines: countDiffLines(diff) };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
// the reviewer needs this card's change only: every changed file is diffed against the text it had before the run
const writeDiff = (files, file, base = new Map(), root = ROOT) => {
  const parts = [];
  for (const f of files) {
    const after = fs.existsSync(path.join(root, f)) ? readText(path.join(root, f)) : '';
    const before = baseOf(f, base, root);
    if (before == null || after == null) { parts.push(`--- ${f}: binary file changed (diff skipped)\n`); continue; }
    const { diff } = diffOne(f, before, after);
    if (diff.trim()) parts.push(diff);
  }
  fs.writeFileSync(file, (parts.join('\n') || '(no changed files)\n').slice(0, 400e3));
};
// --diff-selftest <before> <after> [repoPath]: print one generated file diff, so dispatch-selftest.mjs can test the helper
// (function declarations on purpose: this runs before the const helpers further down are initialised)
function diffSelftest() {
  const [a, b, p] = positional();
  if (!a || !b) { console.error('用法: node tools/pi-dispatch.mjs --diff-selftest <before.txt> <after.txt> [repoPath]'); process.exit(2); }
  const read = f => {   // a typo'd fixture must fail loudly instead of silently diffing against an empty file
    try { return fs.readFileSync(f); } catch (e) { console.error(`讀不到檔案:${f} (${e.code || e.message})`); process.exit(2); }
  };
  const { diff, lines } = diffOne(p || 'src/example.js', read(a), read(b));
  console.log(diff.replace(/\n+$/, ''));
  console.log(`lines: ${lines}`);
  process.exit(0);
}
// --base-selftest <repoPath> [dirtyTextFile]: print what baseOf() finds as a file's pre-run text, plus the line count the
// Opus decision uses, so dispatch-selftest.mjs can test the snapshot → HEAD → empty chain without running pi
function baseSelftest() {
  const [p, dirty] = positional();
  if (!p) { console.error('用法: node tools/pi-dispatch.mjs --base-selftest <repoPath> [dirty.txt]'); process.exit(2); }
  const base = new Map();
  if (dirty) {
    try { base.set(p, fs.readFileSync(dirty, 'utf8')); } catch { console.error(`讀不到檔案:${dirty}`); process.exit(2); }
  }
  const before = baseOf(p, base);
  const inHead = spawnSync('git', ['show', `HEAD:${p}`], { cwd: ROOT, maxBuffer: 32 << 20 }).status === 0;
  console.log(`base: ${before == null ? 'binary' : base.has(p) ? 'dirty' : inHead ? 'head' : 'empty'}`);
  console.log(`text: ${JSON.stringify(before ?? '')}`);
  console.log(`lines: ${diffLineCount([p], base)}`);
  process.exit(0);
}

// ---- per-card git worktrees (--parallel) -------------------------------------------------------------
// Each parallel card runs in its own checkout under output/pi-worktrees/<id>, made from HEAD plus the main
// checkout's uncommitted state, with node_modules linked back to the main checkout. Changes come back as a
// binary diff against the baseline commit, applied with `git apply` (3-way only when the plain apply fails).
const WT_REL = path.join('output', 'pi-worktrees');
const HOST = '127.0.0.1';
const portFor = i => 5100 + i;
const worktreesDir = mainRoot => path.join(mainRoot, WT_REL);

function unlinkNodeModules(wt) {   // never recursive: deleting through the junction would empty the main node_modules
  const link = path.join(wt, 'node_modules');
  let st = null; try { st = fs.lstatSync(link); } catch { return; }
  if (!st.isSymbolicLink() && !st.isDirectory()) return;
  try { fs.unlinkSync(link); } catch { try { fs.rmdirSync(link); } catch { } }
}

function linkNodeModules(mainRoot, wt) {
  const target = path.join(mainRoot, 'node_modules');
  try { if (!fs.statSync(target).isDirectory()) return false; } catch { return false; }
  const link = path.join(wt, 'node_modules');
  try { fs.lstatSync(link); unlinkNodeModules(wt); } catch { }
  fs.symlinkSync(target, link, 'junction');
  return true;
}

function createWorktree(mainRoot, id) {
  const dir = path.join(worktreesDir(mainRoot), id);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  if (fs.existsSync(dir)) {   // a stale worktree: drop the junction first, then ask git, never a blind recursive delete
    unlinkNodeModules(dir);
    spawnSync('git', ['worktree', 'remove', '--force', dir], { cwd: mainRoot });
    spawnSync('git', ['worktree', 'prune'], { cwd: mainRoot });
    if (fs.existsSync(dir) && !fs.existsSync(path.join(dir, 'node_modules'))) fs.rmSync(dir, { recursive: true, force: true });
    if (fs.existsSync(dir)) throw new Error(`cannot clear stale worktree ${dir}`);
  }
  try {
    const add = spawnSync('git', ['worktree', 'add', '--detach', '--force', dir, 'HEAD'], { cwd: mainRoot, encoding: 'utf8', maxBuffer: 64 << 20 });
    if (add.status !== 0) throw new Error(`git worktree add failed: ${(add.stderr || add.stdout || '').trim()}`);
    const diff = spawnSync('git', ['diff', 'HEAD', '--binary'], { cwd: mainRoot, maxBuffer: 256 << 20 });
    if (diff.status !== 0) throw new Error(`git diff HEAD failed in ${mainRoot}`);
    if (diff.stdout.length) {
      const ap = spawnSync('git', ['apply', '--binary', '-'], { cwd: dir, input: diff.stdout, maxBuffer: 256 << 20, encoding: 'utf8' });
      if (ap.status !== 0) throw new Error(`git apply of the main checkout's diff failed: ${(ap.stderr || '').trim()}`);
    }
    const others = spawnSync('git', ['ls-files', '--others', '--exclude-standard', 'src', 'assets', 'tools', 'pipeline'], { cwd: mainRoot, encoding: 'utf8', maxBuffer: 64 << 20 });
    for (const f of (others.stdout || '').split('\n').filter(Boolean)) {
      const dst = path.join(dir, f);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(path.join(mainRoot, f), dst);
    }
    spawnSync('git', ['add', '-A'], { cwd: dir });
    const commit = spawnSync('git', ['-c', 'user.name=pi-dispatch', '-c', 'user.email=pi@local', 'commit', '--allow-empty', '-m', 'baseline'], { cwd: dir, encoding: 'utf8' });
    if (commit.status !== 0) throw new Error(`baseline commit failed: ${(commit.stderr || commit.stdout || '').trim()}`);
    const base = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).stdout.trim();
    return { dir, base };
  } catch (e) {   // a setup failure must not leave a half-made worktree behind
    unlinkNodeModules(dir);
    spawnSync('git', ['worktree', 'remove', '--force', dir], { cwd: mainRoot });
    spawnSync('git', ['worktree', 'prune'], { cwd: mainRoot });
    if (fs.existsSync(dir) && !fs.existsSync(path.join(dir, 'node_modules'))) fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }
}

function collectPatch(wt, base) {
  spawnSync('git', ['add', '-A'], { cwd: wt });
  const r = spawnSync('git', ['diff', base, '--binary'], { cwd: wt, maxBuffer: 256 << 20 });
  return r.status === 0 ? r.stdout.toString('utf8') : '';
}

function removeWorktree(mainRoot, dir) {
  unlinkNodeModules(dir);
  spawnSync('git', ['worktree', 'remove', '--force', dir], { cwd: mainRoot });
  spawnSync('git', ['worktree', 'prune'], { cwd: mainRoot });
  if (fs.existsSync(dir) && !fs.existsSync(path.join(dir, 'node_modules'))) fs.rmSync(dir, { recursive: true, force: true });
}

// applies one card's patch to the main checkout; a patch that does not apply cleanly is kept for a human
function applyBack(mainRoot, res, id, patch) {
  if (!patch || !patch.trim()) return { ok: true, applied: false };
  const gitRun = (extra, input = patch) => spawnSync('git', ['apply', ...extra, '-'], { cwd: mainRoot, input, encoding: 'utf8', maxBuffer: 256 << 20 });
  let mode = [];
  let r = gitRun(['--check']);
  if (r.status !== 0) { mode = ['--3way']; r = gitRun(['--3way', '--check']); }
  let ok = r.status === 0;
  let out = r.stderr || r.stdout || '';
  if (ok) { const ap = gitRun(mode); ok = ap.status === 0; out = ap.stderr || ap.stdout || ''; }
  if (ok) return { ok: true, applied: true };
  fs.mkdirSync(res, { recursive: true });
  fs.writeFileSync(path.join(res, id + '.patch'), patch);
  return { ok: false, applied: false, error: String(out).trim() };
}
const sessionCost = name => {   // pi writes real provider USD into its session log; other agents were priced in runPi
  if (AGENT !== 'pi') return stageUsd.get(name) || 0;
  let usd = 0;
  for (const f of fs.readdirSync(SESS).filter(f => f.endsWith('.jsonl'))) {
    const t = fs.readFileSync(path.join(SESS, f), 'utf8');
    if (!t.includes(`"name":"${name}"`)) continue;
    for (const line of t.split('\n')) if (line.includes('"usage"')) { try { usd += JSON.parse(line).message?.usage?.cost?.total || 0; } catch { } }
  }
  return usd;
};
const cap = (s, n = CAP) => s.length > n ? s.slice(0, n) + `\n…(截斷,全文 ${s.length} 字元,見結果檔)` : s;

// --dry-run: resolve everything a real run would resolve and print it, without running pi, the accept command or touching the card
function dryRun({ card, id, text, type, acceptHead, goalOnly, planFile, reviewFile, diffFile, gate, approved }) {
  const plan = readFileOr(planFile);
  const accept = acceptHead === 'auto' ? (goalOnly ? (header(plan, 'Accept') || 'auto') : 'auto') : (acceptHead || 'n/a');
  const allowed = allowedFiles(/^## Files/m.test(text) ? text : (plan || text));
  const stages = [];
  const stopAfterPlan = gate && !approved;   // Gate: plan stops once the plan (and its precheck) is ready for Opus
  if (goalOnly || gate) stages.push('plan');
  // PRECHECK runs for every tools/checks/ checker the accept command uses, new or old (an old one may already pass: ALREADY)
  const preWanted = acceptHead === 'auto' && (!plan || acceptCheckers(accept).length > 0);   // no plan yet: precheck is still possible
  if (preWanted) stages.push('precheck');
  const review = stopAfterPlan ? 'pending' : type === 'scout' || noReview ? 'skip' : 'OK';
  if (!stopAfterPlan) {
    stages.push('implement');
    if (accept !== 'n/a') stages.push('accept');
    if (review !== 'skip') stages.push('review');
  }
  console.log(`${id} DRY-RUN accept:${acceptHead === 'auto' ? 'auto' : 'n/a'} scope:${allowed.length ? 'ok' : 'n/a'} review:${review} precheck:n/a 0x 0m $0.000`);
  console.log(`card: ${card}`);
  console.log(`files: ${allowed.length ? allowed.join(',') : '(none)'}`);
  console.log(`stages: ${stages.join(',')}`);
  console.log(`opus: ${opusReason(allowed, { num: cardNum(id) })}`);   // tier-c is decidable from the Files list alone
  if (stopAfterPlan) console.log(`${id} PLAN-READY plan: ${rel(planFile)} (${plan.trim() ? plan.trim().split('\n').length : 0} lines)`);
  const show = (label, prompt) => { console.log(`--- ${label}`); console.log(prompt); };
  if (goalOnly || gate) show(`stage plan | session ${id}-plan`, buildPlanPrompt(card, id, type, acceptHead, null));
  if (preWanted) show(`stage precheck | command: ${accept === 'auto' ? '(from the plan)' : accept}`, '(every tools/checks/ checker the accept line uses, new or old: it must fail on the unchanged tree; if it passes, PLAN gets one rewrite and then the card ends as ALREADY)');
  if (!stopAfterPlan) {
    show(`stage implement | session ${id}-a1`, buildPrompt(card, id, type, accept === 'auto' ? null : accept, null, goalOnly || approved ? rel(planFile) : null));
    show(`stage accept | command: ${accept === 'auto' ? '(from the plan)' : accept}`, '(the dispatcher runs this itself; the verdict does not come from pi)');
    if (review !== 'skip') show(`stage review | session ${id}-review-a1`, buildReviewPrompt(card, id, section(text, 'Goal'), goalOnly || approved ? rel(planFile) : null, rel(diffFile)));
  }
  return { id, verdict: 'DRY-RUN', ok: true };
}

// one card, from PLAN to REVIEW. Under --parallel root is its own worktree; otherwise root is the main checkout
// and nothing about the run changes.
async function runCard(card, opts = {}) {
  const mainRoot = opts.mainRoot || ROOT;
  const res = opts.res || RES;
  const costLog = opts.costLog || LOG_CSV;
  const ledger = opts.ledger || LEDGER;
  const index = opts.index || 0;
  const parallel = opts.parallel ?? (flag('parallel') && !DRY);
  const id = (path.basename(card).match(/^(T\d+)/) || [, path.basename(card, '.md')])[1];
  const text = fs.readFileSync(path.join(mainRoot, card), 'utf8');
  const status = header(text, 'Status'), type = header(text, 'Type').toLowerCase(), acceptHead = header(text, 'Accept');
  const gate = header(text, 'Gate').toLowerCase() === 'plan' || flag('approve-plan');   // Opus approves pi's plan before any work
  const approved = flag('approved');   // second run: the plan is signed off, implement it
  const reusable = status === 'reusable';
  const goalOnly = !/^## Steps/m.test(text) && type !== 'scout';   // no Steps: pi plans before it implements
  const planFile = path.join(res, id + '.plan.md'), reviewFile = path.join(res, id + '.review.md'), diffFile = path.join(res, id + '.diff');
  const readPlan = () => readFileOr(planFile);
  if (DRY) return { early: dryRun({ card, id, text, type, acceptHead, goalOnly, planFile, reviewFile, diffFile, gate, approved }) };
  if (approved && !fs.existsSync(planFile)) { console.error(`[pi-dispatch] ${id} --approved 但沒有計畫檔 ${rel(planFile)}:先跑一次閘門(卡片加 Gate: plan 或這次加 --approve-plan)`); return { early: { id, verdict: 'NO-PLAN', exitCode: 2 } }; }
  if (status && status !== 'todo' && !reusable && !(approved && status === 'plan-review') && !flag('force')) return { early: { id, verdict: 'SKIPPED', note: `Status ${status}(要重跑加 --force)` } };
  // --parallel: one worktree and one per-card lock, so cards that touch different files no longer queue behind each other
  const lock = path.join(res, parallel ? `.running-${id}` : '.running');
  if (fs.existsSync(lock)) return { early: { id, verdict: 'LOCKED', note: `已經有卡在跑:${fs.readFileSync(lock, 'utf8').trim()}(確認那個 pi 已停再刪 ${path.relative(mainRoot, lock)})` } };
  const resultFile = path.join(res, id + '.md'), logFile = path.join(res, id + '.log'), acceptFile = path.join(res, id + '.accept.log');
  try { fs.rmSync(logFile); } catch { }
  try { fs.rmSync(diffFile); } catch { }   // per run: a leftover diff would be offered for a card that never wrote one
  fs.writeFileSync(lock, `${id} ${new Date().toISOString()}`);
  if (!reusable) setStatus(card, 'in-progress', mainRoot);
  // worktree from HEAD + the main checkout's uncommitted state; node_modules is linked back, never copied
  let root = mainRoot, wtDir = null, base = '', setupError = '';
  if (parallel) {
    try { const wt = createWorktree(mainRoot, id); wtDir = wt.dir; root = wt.dir; base = wt.base; linkNodeModules(mainRoot, root); }
    catch (e) { setupError = `${e.message}`; }
  }
  const env = root === mainRoot ? {} : { PORT: String(portFor(index)), HOST, PWD: root, TARGET: `http://${HOST}:${portFor(index)}/?preview=1` };
  // browser checkers default to the main server on 5024; a worktree card gets its own server.mjs (serving the worktree's dist/)
  let server = null;
  if (root !== mainRoot && !runAgent) { try { server = spawn(process.execPath, ['server.mjs'], { cwd: root, env: { ...process.env, ...env }, stdio: 'ignore', windowsHide: true }); } catch { } }
  // a worktree run has no docs/ or output/ of its own (the card and the result files stay in the main checkout),
  // so prompts for it name absolute paths; a normal run keeps the short repository-relative ones
  const slash = p => String(p).split(path.sep).join('/');
  const resHint = root === mainRoot ? 'output/pi-results' : slash(res);
  const promptPath = f => root === mainRoot ? rel(f) : slash(f);
  const cardRef = root === mainRoot ? card : slash(path.join(mainRoot, card));
  const agent = runAgent || runPi;
  const t0 = Date.now(), snapBefore = snapshot(root), before = new Set(snapBefore);
  // the text of every already-dirty/untracked file at the start: the review diff is built from these, not from `git diff` vs HEAD
  const baseContents = new Map(snapBefore.map(l => l.replace(/:[0-9a-f]{32}$/, '')).map(f => [f, readText(path.join(root, f))]));
  const changedList = () => snapshot(root).filter(l => !before.has(l)).map(l => l.replace(/:[0-9a-f]{32}$/, '')).filter(f => f !== card);
  const allowedFor = () => allowedFiles(/^## Files/m.test(text) ? text : (readPlan() || text));
  let attempts = 0, usd = 0, code, hasResult = false, acc = null, note = opt('note');
  let accept = acceptHead === 'auto' ? (goalOnly ? header(readPlan(), 'Accept') : '') : acceptHead;   // `Accept: auto` is filled in by PLAN
  let reviewState = 'skip', precheckState = 'n/a', reviewFailed = false, planReady = false, reviewRedos = 0;
  let already = false, generic = false;   // ALREADY: the checker passed on the unchanged tree twice; generic: two generic plans
  const stages = [];
  const planStage = async extra => {
    const name = `${id}-plan`;
    await agent(buildPlanPrompt(cardRef, id, type, acceptHead, extra, resHint), name, logFile, root, env);
    usd += sessionCost(name);
  };
  try {
    if (setupError) fs.writeFileSync(logFile, `[pi-dispatch] worktree setup failed: ${setupError}\n`);
    else if (approved) {   // Opus signed this plan off: do not plan again, reuse the file and carry the note as its direction
      accept = acceptHead === 'auto' ? (header(readPlan(), 'Accept') || '') : acceptHead;
      note = ['Opus approved the plan; implement it as written.', note ? `Opus direction: ${note}` : ''].filter(Boolean).join('\n');
    } else if (goalOnly || gate) {   // PLAN
      stages.push('plan');
      try { fs.rmSync(planFile); } catch { }
      await planStage(null);
      accept = acceptHead === 'auto' ? header(readPlan(), 'Accept') : acceptHead;
      if (!fs.existsSync(planFile)) note = [note, 'PLAN wrote no plan file; implement from the card alone.'].filter(Boolean).join('\n');
      // an accept line with nothing but generic suites proves nothing (T49: `npm test` printed accept:PASS with nothing changed)
      if (acceptHead === 'auto' && isGenericAccept(accept)) {
        await planStage(`Accept must run at least one tools/checks/ checker; generic suites only after it. Your Accept command \`${accept || '(none)'}\` runs no tools/checks/ checker, so it would pass without the work. Write a deterministic checker under tools/checks/ (list it under \`## Files you may change\`) and chain any generic suite after it.`);
        accept = header(readPlan(), 'Accept') || accept;
        if (isGenericAccept(accept)) generic = true;   // still generic after one rewrite: the card blocks, no implement stage
      }
    }
    // PRECHECK for every checker the accept command uses, new or old: it must fail on the unchanged tree or the goal is met
    if (!setupError && acceptHead === 'auto' && accept && !generic && acceptCheckers(accept).length > 0) {
      stages.push('precheck');
      let pre = runAccept(accept, path.join(res, id + '.precheck.log'), root, env);
      precheckState = pre.pass ? 'PASS' : 'FAIL';
      if (pre.pass) {
        await planStage(`PRECHECK: your Accept command \`${accept}\` already passes on the unchanged tree, so it proves nothing. Rewrite it so it fails before the work (assert the behaviour the card adds).`);
        accept = header(readPlan(), 'Accept') || accept;
        pre = runAccept(accept, path.join(res, id + '.precheck.log'), root, env);
        precheckState = pre.pass ? 'PASS' : 'FAIL';
        if (pre.pass) { already = true; acc = pre; }   // still green after the rewrite: the goal was already met, skip implement and review
      }
    }
    planReady = gate && !approved;   // Gate: plan stops here, before any file changes
    while (!setupError && !planReady && !already && !generic) {   // IMPLEMENT (a generic accept line never gets here)
      attempts++;
      acc = null;
      stages.push(`implement-a${attempts}`);
      try { fs.rmSync(resultFile); } catch { }
      const name = `${id}-${new Date().toISOString().slice(0, 16)}-a${attempts}`;
      code = await agent(buildPrompt(cardRef, id, type, accept || null, note, goalOnly || approved ? promptPath(planFile) : null, resHint), name, logFile, root, env);
      usd += sessionCost(name);
      hasResult = fs.existsSync(resultFile);
      const firstLine = hasResult ? fs.readFileSync(resultFile, 'utf8').split('\n')[0] : '';
      const piOk = code === 0 && hasResult && /^\s*\**DONE/i.test(firstLine);
      const blocked = hasResult && /^\s*\**BLOCKED/i.test(firstLine);
      if (!piOk) {
        if (attempts >= MAX_ATTEMPTS || flag('no-retry') || blocked) break;
        // automatic retry carrying the failure summary, so Claude does not have to read logs and re-dispatch by hand
        const why = !hasResult ? `previous attempt ended (exit ${code}) without a result file` : `previous attempt reported: ${firstLine}`;
        note = [opt('note'), `RETRY: ${why}. Fix only that, then report.`].filter(Boolean).join('\n');
        continue;
      }
      acc = accept ? runAccept(accept, acceptFile, root, env) : null;   // ACCEPT
      if (accept) stages.push('accept');
      if (acc && !acc.pass) {
        if (attempts >= MAX_ATTEMPTS || flag('no-retry')) break;
        note = [opt('note'), `RETRY: the acceptance command failed:\n${acc.tail}. Fix only that, then report.`].filter(Boolean).join('\n');
        continue;
      }
      if (type === 'scout' || noReview) break;   // REVIEW
      const changedNow = changedList();
      if ((outOfScope(changedNow, allowedWithCheckers(allowedFor(), accept)) || []).length) break;   // out of scope: the card fails already, a review would only burn tokens
      writeDiff(changedNow, diffFile, baseContents, root);
      const rname = `${id}-review-a${attempts}`;
      stages.push(`review-a${attempts}`);
      try { fs.rmSync(reviewFile); } catch { }
      await agent(buildReviewPrompt(cardRef, id, section(text, 'Goal'), goalOnly || approved ? promptPath(planFile) : null, promptPath(diffFile), resHint), rname, logFile, root, env);
      usd += sessionCost(rname);
      const rv = readFileOr(reviewFile).trim();
      const rvFirst = rv.split('\n')[0].replace(/[*#\s]/g, '').toUpperCase();
      reviewState = rvFirst.startsWith('ISSUES') ? 'ISSUES' : rvFirst.startsWith('OK') ? 'OK' : 'skip';
      const high = rv.split('\n').slice(1).filter(l => /^\s*[-*]?\s*high\b/i.test(l));
      if (!high.length) { if (reviewState === 'ISSUES') reviewState = 'LOW'; break; }   // low-only findings: the card passes; Claude sees them with the diff
      // 2026-11-06: at most ONE redo for review findings (T64 spent two and still missed); after that the card is flagged for Claude
      if (attempts >= MAX_ATTEMPTS || flag('no-retry') || reviewRedos >= 1) { reviewFailed = true; break; }   // the verdict keeps review:ISSUES
      reviewRedos++;
      note = [opt('note'), `REVIEW found high issues (${promptPath(reviewFile)}):\n${rv}\nFix only these, then report.`].filter(Boolean).join('\n');
    }
  } finally { try { fs.rmSync(lock); } catch { } try { server?.kill(); } catch { } }
  const changed = changedList();
  const patch = wtDir ? collectPatch(root, base) : '';
  return {
    id, card, text, type, parallel, mainRoot, res, costLog, ledger, root, wtDir, base, patch, changed,
    planFile, reviewFile, diffFile, acceptFile, resultFile, logFile,
    hasResult, attempts, usd, code, acc, accept, acceptHead, reusable, planReady, already, generic,
    reviewState, precheckState, reviewFailed, t0, sec: Math.round((Date.now() - t0) / 1000), baseContents, stages, setupError,
  };
}

// scope, diff, review verdict, status, cost log and the one-line output, then the patch goes back into the main checkout
function finalize(run) {
  const { id, card, text, type, mainRoot, res, costLog, ledger, reusable, planReady, already, generic, hasResult, accept, acceptHead, acc, attempts, usd, code, sec, changed, baseContents, reviewState, reviewFailed, precheckState, stages, patch, acceptFile, planFile, reviewFile, diffFile } = run;
  const body = hasResult ? fs.readFileSync(run.resultFile, 'utf8').trim() : readFileOr(run.logFile).split('\n').slice(-15).join('\n');
  const first = hasResult ? body.split('\n')[0].replace(/\*/g, '').trim() : '';
  let verdict = planReady ? 'PLAN-READY' : already ? 'ALREADY' : generic ? 'BLOCKED' : !hasResult ? 'FAILED' : (first.match(/^(DONE|BLOCKED|FAILED)/i)?.[1] || '?').toUpperCase();
  const accText = generic ? 'generic' : !accept ? (acceptHead === 'auto' ? 'not run' : 'n/a') : acc ? (acc.pass ? 'PASS' : 'FAIL') : 'not run';
  const stray = outOfScope(changed, allowedWithCheckers(allowedFiles(/^## Files/m.test(text) ? text : (readFileOr(planFile) || text)), accept));   // a tools/checks/ file named in Accept is in scope
  const scope = stray == null ? 'n/a' : stray.length ? 'OUT' : 'ok';
  // a plan-waiting card is not a failure: Opus just has to read the plan before the work starts
  const opus = planReady || already ? '-' : opusReason(changed, { reviewFailed, diffLines: diffLineCount(changed, baseContents, run.root), num: cardNum(id) });
  let ok = planReady || already || (code === 0 && verdict === 'DONE' && accText !== 'FAIL' && accText !== 'not run' && accText !== 'generic' && scope !== 'OUT' && reviewState !== 'ISSUES');
  let conflict = null;
  if (run.wtDir && ok) {   // the worktree measured the change; apply it back only when the card actually passed
    const ab = applyBack(mainRoot, res, id, patch);
    if (!ab.ok) { conflict = ab.error || 'patch did not apply'; verdict = 'CONFLICT'; ok = false; }
  }
  if (!reusable) setStatus(card, planReady ? 'plan-review' : ok ? 'done' : 'failed', mainRoot);
  const stageLog = [...new Set(stages)].join('+');
  try {   // start/end let tools/session-cost.mjs --from/--to cut the Claude side of the same window
    const HEAD = 'date,card,attempts,verdict,accept,minutes,usd,start,end,scope,review,precheck,stages,opus\n';
    if (!fs.existsSync(costLog)) fs.writeFileSync(costLog, HEAD);
    else { const t = fs.readFileSync(costLog, 'utf8'); if (!t.startsWith(HEAD)) fs.writeFileSync(costLog, HEAD + t.slice(t.indexOf('\n') + 1)); }
    fs.appendFileSync(costLog, `${new Date().toISOString().slice(0, 16)},${id},${attempts},${verdict},${accText},${(sec / 60).toFixed(1)},${usd.toFixed(4)},${new Date(run.t0).toISOString()},${new Date().toISOString()},${scope},${reviewState},${precheckState},${stageLog},${opus}\n`);
  } catch { }
  // one line per card is the whole point: Claude pays for every line it reads
  if (planReady) console.log(`${id} PLAN-READY plan: ${rel(planFile)} (${readFileOr(planFile).trim().split('\n').filter(l => l.trim()).length} lines)`);
  else console.log(`${id} ${verdict} accept:${accText} scope:${scope} review:${reviewState} precheck:${precheckState} ${attempts}x ${Math.floor(sec / 60)}m $${usd.toFixed(3)}`);
  if (conflict) console.log(`[pi-dispatch] ${id} CONFLICT: patch kept at ${path.join(res, id + '.patch')} (${conflict.split('\n')[0]})`);
  if (opus !== '-') {   // the escalation only prints the paths; the dispatcher never calls Claude itself
    writeDiff(changed, diffFile, baseContents, run.root);   // REVIEW writes it only when REVIEW ran; scout/--no-review/out-of-scope never do
    console.log(`${id} opus:${opus} diff: ${rel(diffFile)} (${readFileOr(diffFile).split('\n').filter(Boolean).length} lines) review: ${rel(reviewFile)}`);
  }
  if (acc && !acc.pass) console.log(`[pi-dispatch] 驗收失敗(${rel(acceptFile)}):\n${acc.tail}`);
  if (stray?.length) console.log(`[pi-dispatch] 超出卡片範圍:${stray.join(' | ')}`);
  if (changed.length && (!ok || flag('full'))) console.log(`[pi-dispatch] 改到的檔案:${changed.join(' | ')}`);
  if (!ok || flag('full') || type === 'scout') {   // scout briefs are the deliverable, so they always print
    console.log('----'); console.log(cap(body, type === 'scout' ? Math.max(CAP, 3000) : CAP));
  }
  if (run.wtDir) {   // a conflict keeps its worktree for inspection; every other ending removes it
    // a failed card's work is not applied, so keep it as a patch instead of throwing it away with the worktree
    if (!ok && verdict !== 'CONFLICT' && patch && patch.trim()) { fs.writeFileSync(path.join(res, id + '.patch'), patch); console.log(`[pi-dispatch] ${id} 沒套回主 checkout,改動留在 ${rel(path.join(res, id + '.patch'))}`); }
    if (verdict === 'CONFLICT' || flag('keep-worktree')) console.log(`[pi-dispatch] worktree kept: ${run.wtDir}`);
    else removeWorktree(mainRoot, run.wtDir);
  }
  return { id, verdict, accText, scope, reviewState, precheckState, attempts, sec, usd, ok, opus, wtDir: run.wtDir };
}

// --worktree-selftest: no dsh, no repo data. A throwaway git repo plus a fake agent drive the real runCard/finalize:
// two cards editing different files must both apply back; two cards editing the same line must end DONE then CONFLICT
// (patch kept, main file unchanged by the second). node_modules in the main checkout must survive every cleanup.
async function worktreeSelftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-worktree-'));
  const mainRoot = path.join(tmp, 'repo'), res = path.join(tmp, 'results');
  const costLog = path.join(tmp, 'cost-log.csv'), ledger = path.join(tmp, 'opus-review.csv');
  const bad = [];
  const check = (yes, msg) => { if (!yes) bad.push(msg); };
  let applied = false, conflictId = '', nodeKept = false, leftCount = 0, portList = '';
  try {
    const git = (a, cwd = mainRoot) => spawnSync('git', a, { cwd, encoding: 'utf8', maxBuffer: 64 << 20 });
    fs.mkdirSync(path.join(mainRoot, 'src'), { recursive: true });
    fs.mkdirSync(path.join(mainRoot, 'docs', 'pi-tasks'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'repo', 'node_modules', 'dep'), { recursive: true });
    fs.mkdirSync(res, { recursive: true });
    fs.writeFileSync(path.join(mainRoot, '.gitignore'), 'node_modules/\noutput/\n');
    fs.writeFileSync(path.join(mainRoot, 'src', 'a.txt'), 'a\n');
    fs.writeFileSync(path.join(mainRoot, 'src', 'b.txt'), 'b\n');
    fs.writeFileSync(path.join(mainRoot, 'node_modules', 'dep', 'index.js'), 'module.exports = 1;\n');
    if (git(['init', '-q']).status !== 0) throw new Error('git init failed');
    git(['config', 'user.name', 'pi-selftest']);
    git(['config', 'user.email', 'pi-selftest@local']);
    git(['config', 'core.autocrlf', 'false']);   // keep the LF text the fake agent writes byte-for-byte, as on the repo's own config
    git(['add', '-A']);
    if (git(['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'init']).status !== 0) throw new Error('initial commit failed');
    const cardFor = (id, file) => {
      const relCard = `docs/pi-tasks/${id}-selftest.md`;
      fs.writeFileSync(path.join(mainRoot, relCard), `# ${id}: selftest\nStatus: todo\n\n## Goal\nEdit ${file} in a worktree.\n\n## Files you may change\n- ${file}\n\n## Steps\n1. Write the content the fake agent is told to write.\n`);
      return relCard;
    };
    // fake agent: implement writes one file and the DONE result; review writes OK. No network, no dsh, no accept command.
    const write = new Map(), ports = new Map();
    runAgent = async (prompt, name, logFile, root, env) => {
      const id = (name.match(/^(T\d+)/) || [])[1];
      if (/^Independent review stage/m.test(prompt)) { fs.writeFileSync(path.join(res, `${id}.review.md`), 'OK\n'); return 0; }
      if (/^Planning stage/m.test(prompt)) return 1;   // the selftest cards carry Steps, so PLAN never runs
      const w = write.get(id); if (!w) return 1;
      fs.writeFileSync(path.join(root, w.file), w.text);
      fs.writeFileSync(path.join(res, `${id}.md`), `DONE | files: ${w.file} | accept: n/a\nnone\n`);
      if (env && env.PORT) ports.set(id, String(env.PORT));
      return 0;
    };
    const runBatch = async specs => {
      const runs = await Promise.all(specs.map((s, i) => {
        write.set(s.id, s);
        return runCard(cardFor(s.id, s.file), { mainRoot, res, costLog, ledger, index: i, parallel: true });
      }));
      return runs.map(r => r.early || finalize(r));
    };

    // 1) different files: both cards pass and both patches land in the main checkout
    const first = await runBatch([
      { id: 'T901', file: 'src/a.txt', text: 'a\none\n' },
      { id: 'T902', file: 'src/b.txt', text: 'b\ntwo\n' },
    ]);
    const firstOk = first.every(r => r.ok && r.verdict === 'DONE');
    const aText = fs.readFileSync(path.join(mainRoot, 'src', 'a.txt'), 'utf8');
    const bText = fs.readFileSync(path.join(mainRoot, 'src', 'b.txt'), 'utf8');
    applied = firstOk && aText === 'a\none\n' && bText === 'b\ntwo\n';
    check(firstOk, `different-file cards did not both pass: ${first.map(r => `${r.id}:${r.verdict}`).join(',')}`);
    check(aText === 'a\none\n', 'src/a.txt did not come back from T901');
    check(bText === 'b\ntwo\n', 'src/b.txt did not come back from T902');
    portList = ['T901', 'T902'].map(c => ports.get(c) || '?').join(',');
    check(portList === '5100,5101', `per-card ports wrong: ${portList}`);

    // 2) same line: T903 applies, T904 conflicts; its patch is kept and the main file keeps T903's text
    const second = await runBatch([
      { id: 'T903', file: 'src/a.txt', text: 'a\none\nthree\n' },
      { id: 'T904', file: 'src/a.txt', text: 'a\none\nfour\n' },
    ]);
    const aAfter = fs.readFileSync(path.join(mainRoot, 'src', 'a.txt'), 'utf8');
    conflictId = second[1].verdict === 'CONFLICT' && fs.existsSync(path.join(res, 'T904.patch')) ? 'T904' : '';
    check(second[0].ok && second[0].verdict === 'DONE', `T903 should apply, got ${second[0].verdict}`);
    check(second[1].verdict === 'CONFLICT' && second[1].ok === false, `T904 should be CONFLICT, got ${second[1].verdict}`);
    check(!!conflictId, 'T904 conflict patch was not kept');
    check(aAfter === 'a\none\nthree\n', 'main src/a.txt was changed by the conflicting card');
    check(!!second[1].wtDir && fs.existsSync(second[1].wtDir), 'the CONFLICT worktree was removed, it should be kept');
    if (second[1].wtDir && fs.existsSync(second[1].wtDir)) removeWorktree(mainRoot, second[1].wtDir);   // dropped on purpose: the check below wants 0

    const wtRoot = path.join(mainRoot, 'output', 'pi-worktrees');
    leftCount = fs.existsSync(wtRoot) ? fs.readdirSync(wtRoot).filter(Boolean).length : 0;
    check(leftCount === 0, `worktrees left behind: ${leftCount}`);
    const nm = path.join(mainRoot, 'node_modules');
    let st = null; try { st = fs.lstatSync(nm); } catch { }
    nodeKept = !!st && st.isDirectory() && !st.isSymbolicLink() && fs.existsSync(path.join(nm, 'dep', 'index.js'));
    check(nodeKept, 'main node_modules is missing or was emptied through the junction');
  } catch (e) {
    bad.push(`exception: ${e.message}`);
    try { nodeKept = fs.existsSync(path.join(mainRoot, 'node_modules', 'dep', 'index.js')); } catch { }
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { }
  }
  console.log(`apply: ${applied ? 'both' : 'failed'}`);
  console.log(`conflict: ${conflictId ? `${conflictId} patch kept` : 'none'}`);
  console.log(`node_modules: ${nodeKept ? 'kept' : 'missing'}`);
  console.log(`worktrees: ${leftCount} left`);
  console.log(`ports: ${portList || '?'}`);
  if (bad.length) { console.log(`FAIL ${bad.join(' | ')}`); return false; }
  return true;
}

const rows = [];
function record(r) {
  if (r.exitCode === 2) process.exit(2);   // --approved with no plan file: nothing to implement, do not start another card
  if (r.verdict === 'SKIPPED' || r.verdict === 'LOCKED') console.log(`[pi-dispatch] ${r.id} ${r.verdict}:${r.note}\n`);
  rows.push(r);
  if (!r.ok && r.verdict !== 'SKIPPED' && r.verdict !== 'ALREADY' && !flag('keep-going')) {
    const rest = flag('parallel') && !DRY ? [] : cards.slice(rows.length).map(([a]) => a);   // parallel cards already ran
    if (rest.length) console.log(`[pi-dispatch] ${r.id} 沒過,停下後面的卡:${rest.join(' ')}(要繼續加 --keep-going)\n`);
    return false;
  }
  return true;
}
// --worktree-selftest: drive the real runCard/finalize against a throwaway repo with a fake agent, then stop
if (WT_SELFTEST) { process.exit(await worktreeSelftest() ? 0 : 1); }
if (flag('parallel') && !DRY) {   // every card starts at once, each in its own worktree; patches apply back in argument order
  const runs = await Promise.all(cards.map(([, card], i) => runCard(card, { index: i, parallel: true })));
  for (const run of runs) record(run.early || finalize(run));   // finalize all: it is what applies the patch back and removes the worktree
} else {
  for (const [, card] of cards) { const run = await runCard(card); if (!record(run.early || finalize(run))) break; }
}
if (cards.length > 1 && !DRY) {
  console.log('==== 總表');
  for (const r of rows) console.log(r.sec == null ? `${r.id} ${r.verdict}` : `${r.id} ${r.verdict} accept:${r.accText} scope:${r.scope} review:${r.reviewState} precheck:${r.precheckState} ${r.attempts}x ${(r.sec / 60).toFixed(1)}m $${r.usd.toFixed(3)}`);
}
// how often Opus found something pi's own review called OK: only cards Opus actually looked at are in the denominator
if (rows.some(r => r.opus && r.opus !== '-')) {
  const ledger = readFileOr(LEDGER).split('\n').filter(l => l.trim() && !l.startsWith('date,'));
  console.log(`pi-review miss rate: ${ledger.filter(l => (l.split(',')[4] || '').trim() === 'missed').length}/${ledger.length}`);
}
process.exit(rows.length === cards.length && rows.every(r => r.ok || r.verdict === 'SKIPPED' || r.verdict === 'ALREADY') ? 0 : 1);
