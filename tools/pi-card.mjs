// pi-card.mjs — 開一張新任務卡:自動取下一個編號、補上卡頭,Claude 只寫 Goal / Files / Steps。
// 用法(一次 Bash 呼叫,內文從 stdin 進來):
//   node tools/pi-card.mjs <slug> --accept "npm run verify:quick" [--scout] [--reusable] [--title "一行標題"] <<'EOF'
//   ## Goal
//   ...
//   ## Files you may change
//   - src/pixel-style.css
//   ## Steps
//   1. ...
//   EOF
// --goal-only:內文只要 ## Goal(可選 ## Notes);Files 與 Steps 由派工腳本的 PLAN 階段(pi 自己讀程式)寫出來。
// --accept auto:寫 `Accept: auto`,驗收指令由 PLAN 階段決定(既有檢查,或它自己寫在 tools/checks/ 的新檢查器)。
// 印出卡片路徑與編號。共同規則(範圍、回報格式、失敗兩次停、不推)在 pi-dispatch.mjs 的提示詞裡,卡片不用重寫。
// 卡片寫函式名/選擇器,不要寫行號(寫行號就得先讀程式,而且會漂移)。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TASKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs/pi-tasks');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const slug = args.find((a, i) => !a.startsWith('--') && !['--accept', '--title'].includes(args[i - 1]));
const scout = args.includes('--scout'), goalOnly = args.includes('--goal-only');
if (!slug || !/^[a-z0-9-]+$/.test(slug)) { console.error('usage: node tools/pi-card.mjs <slug> [--accept "cmd"|"auto"] [--scout] [--goal-only] [--reusable] [--title "..."] < body.md'); process.exit(2); }
let body = ''; try { body = fs.readFileSync(0, 'utf8').trim(); } catch { }
if (!/## Goal/.test(body)) { console.error('body needs "## Goal"'); process.exit(2); }
// --goal-only: only the Goal is Claude's job; PLAN writes Files and Steps, so the body is not checked for them
if (!goalOnly && !scout && !/## Files you may change/.test(body)) { console.error('body needs "## Files you may change" (or --goal-only / --scout)'); process.exit(2); }
// every non-scout card needs a command the dispatcher runs itself (T30–T32 had none, so "DONE" was only pi's word)
if (!scout && !opt('accept')) { console.error('non-scout cards need --accept "<cmd>" (or --accept auto); keep reusable checkers in tools/checks/ (output/ is scratch)'); process.exit(2); }
// a checker script under output/, not a data path like --dir output/...
if (/\b(node|python3?)\s+(-\w+\s+)*output\//.test(opt('accept') || '')) console.error('[pi-card] warning: Accept runs a checker under output/; move it to tools/checks/ so it survives and can be reused');
if (/\bline[s]?\s+\d+/i.test(body)) console.error('[pi-card] warning: body mentions line numbers; prefer function/selector names');
// an id is taken if any card file, ledger row (cost-log.csv) or dispatch result (output/pi-results) ever used it:
// deleted cards must not hand their number to a new card that would then mix with the old results (2026-11-05)
const used = [...fs.readdirSync(TASKS).map(f => f.match(/^T(\d+)-/)?.[1])];
try { used.push(...fs.readFileSync(path.join(TASKS, 'cost-log.csv'), 'utf8').split('\n').map(l => l.split(',')[1]?.match(/^T(\d+)$/)?.[1])); } catch { }
try { used.push(...fs.readdirSync(path.join(TASKS, '../../output/pi-results')).map(f => f.match(/^T(\d+)[.-]/)?.[1])); } catch { }
const next = 1 + Math.max(0, ...used.map(n => Number(n || 0)));
const id = 'T' + String(next).padStart(2, '0');
const file = path.join(TASKS, `${id}-${slug}.md`);
const head = [
  `Status: ${args.includes('--reusable') ? 'reusable' : 'todo'}`,
  args.includes('--scout') && 'Type: scout',
  opt('accept') && `Accept: ${opt('accept')}`,
].filter(Boolean);
fs.writeFileSync(file, `# ${id}: ${opt('title') || slug.replace(/-/g, ' ')}\n\n${head.join('\n')}\n\n${body}\n`);
console.log(`${id} docs/pi-tasks/${path.basename(file)}`);
