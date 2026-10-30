// pi-dispatch.mjs — Claude 派工給 pi(預設 DeepSeek v4.1 Flash)用:把一張任務卡交給 pi 非互動執行,做完只印一段摘要。
// 用法:node tools/pi-dispatch.mjs docs/pi-tasks/T02-chatter.md [--timeout 40] [--note "這次的補充說明"]
//   - pi 以 `pi -p --approve` 在 repo 根目錄跑(會讀根目錄 AGENTS.md),對話記錄在 output/pi-sessions/,完整輸出在 output/pi-results/<id>.log
//   - pi 照卡把結果寫到 output/pi-results/<id>.md;本腳本最後印:結束碼、耗時、結果檔前 30 行(沒有結果檔就印 log 最後 30 行)、pi 改了哪些追蹤中的檔案
//   - 逾時(預設 40 分鐘)會結束 pi 整個行程樹
// 結束碼:pi 正常結束而且有結果檔 → 0;否則 1。同一時間只派一張卡(兩張卡同時建置會互相刪掉 outputs/media)。
import { spawn, execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), card = args.find(a => !a.startsWith('--') && /\.md$/i.test(a));
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
if (!card || !fs.existsSync(path.join(ROOT, card))) { console.error('用法: node tools/pi-dispatch.mjs docs/pi-tasks/Txx-*.md [--timeout 分鐘] [--note "補充"]'); process.exit(2); }
const id = (path.basename(card).match(/^(T\d+)/) || [, path.basename(card, '.md')])[1];
const RES = path.join(ROOT, 'output/pi-results'), SESS = path.join(ROOT, 'output/pi-sessions');
fs.mkdirSync(RES, { recursive: true }); fs.mkdirSync(SESS, { recursive: true });
const lock = path.join(RES, '.running');
if (fs.existsSync(lock)) { console.error(`已經有一張卡在跑:${fs.readFileSync(lock, 'utf8').trim()}(結束後再派,或確認那個 pi 已經停了再刪 ${lock})`); process.exit(2); }
const resultFile = path.join(RES, id + '.md'), logFile = path.join(RES, id + '.log');
try { fs.rmSync(resultFile); } catch { }
// which files changed: compare content hashes (a file that is already modified keeps the same `git status` line when edited again)
const snapshot = () => { const list = new Set(); try {
    for (const f of execSync('git diff --name-only', { cwd: ROOT }).toString().split('\n')) if (f) list.add(f);
    for (const f of execSync('git ls-files --others --exclude-standard src assets/ui docs pipeline tools', { cwd: ROOT }).toString().split('\n')) if (f) list.add(f);
  } catch { }
  const out = []; for (const f of list) { try { out.push(f + ':' + crypto.createHash('md5').update(fs.readFileSync(path.join(ROOT, f))).digest('hex')); } catch { } } return out; };
const tracked = snapshot;
const before = new Set(tracked());
const prompt = [   // agent-to-agent text is English (cheaper, clearer); user-facing replies stay Traditional Chinese
  `Do the task card ${card}. Read the whole card and the root AGENTS.md first.`,
  `You were dispatched by Claude in non-interactive mode: nobody can answer questions. Do not ask, do not wait for confirmation; if the card says to stop, write the reason into the result file and exit.`,
  `Run every command in the FOREGROUND and wait for it (npm run verify takes up to 12 minutes; that is fine). Never start background jobs: in -p mode the run ends as soon as you stop calling tools.`,
  `Button-crawl flakes: if a verify FAIL line names a button unrelated to this card, re-run verify at most once; if it fails again on a different unrelated button, treat it as a flake, note it in the result and continue.`,
  `When done, write the result to output/pi-results/${id}.md in the card's Report format, in short plain English. Do not end your turn until that file exists. Write the result file BEFORE optional slow steps like Telegram.`,
  opt('note') ? `Extra note for this run: ${opt('note')}` : '',
].filter(Boolean).join('\n');
fs.writeFileSync(lock, `${id} ${new Date().toISOString()}`);
const t0 = Date.now(), out = fs.createWriteStream(logFile);
// 直接用 node 跑 pi 的 cli.js(不經過 shell):提示詞有中文、空白、冒號、括號,經過 cmd.exe 會被拆壞。找不到就退回 PATH 上的 pi。
const npmRoot = (() => { try { return execSync('npm root -g').toString().trim(); } catch { return ''; } })();
const PI_CLI = process.env.PI_CLI || path.join(npmRoot, '@earendil-works/pi-coding-agent/dist/bundle/cli.js');
const piArgs = ['-p', '--approve', '--session-dir', SESS, '--name', `${id}-${new Date().toISOString().slice(0, 16)}`, prompt];
// stdin 一定要關掉:-p 模式下 pi 會等 stdin 結束才開始做(2026-10-30 第一次派工就卡在這裡)
const SP = { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] };
const p = fs.existsSync(PI_CLI) ? spawn(process.execPath, [PI_CLI, ...piArgs], SP) : spawn('pi', piArgs, SP);
p.stdout.pipe(out, { end: false }); p.stderr.pipe(out, { end: false });
const minutes = Number(opt('timeout')) || 40;
const timer = setTimeout(() => { out.write(`\n[pi-dispatch] 逾時 ${minutes} 分鐘,結束 pi\n`); try { process.platform === 'win32' ? execSync(`taskkill /pid ${p.pid} /T /F`) : p.kill('SIGKILL'); } catch { } }, minutes * 60e3);
p.on('close', code => {
  clearTimeout(timer); out.end(); try { fs.rmSync(lock); } catch { }
  const sec = Math.round((Date.now() - t0) / 1000), hasResult = fs.existsSync(resultFile);
  const changed = tracked().filter(l => !before.has(l)).map(l => l.replace(/:[0-9a-f]{32}$/, ''));
  const body = hasResult ? fs.readFileSync(resultFile, 'utf8') : fs.readFileSync(logFile, 'utf8').split('\n').slice(-30).join('\n');
  console.log(`[pi-dispatch] ${id}:pi 結束碼 ${code}、${Math.floor(sec / 60)} 分 ${sec % 60} 秒、結果檔${hasResult ? '有' : '沒有(下面是 log 最後 30 行)'}`);
  console.log(`[pi-dispatch] 這次新改到的追蹤檔案:${changed.length ? changed.join(' | ') : '無'}`);
  console.log('----'); console.log(body.split('\n').slice(0, 30).join('\n'));
  process.exit(code === 0 && hasResult ? 0 : 1);
});
