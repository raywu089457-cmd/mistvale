// pi-dispatch.mjs — Claude 派工給 pi(預設 DeepSeek v4.1 Flash):一次可派多張卡,依序執行,最後只印一張總表。
// 用法:node tools/pi-dispatch.mjs T30 [T31 ...] [--timeout 40] [--note "補充"] [--attempts 2] [--no-review] [--dry-run] [--full] [--force] [--parallel|--serial] [--keep-worktree] [--worktree-selftest] [--gate-selftest] [--montage-selftest] [--no-retry] [--keep-going] [--no-auto-gate] [--montage-gate] [--montage-ok]
//   - 每張卡分成幾個階段,每個階段是獨立的 pi session:
//     PLAN(卡片沒有 ## Steps 時:pi 讀程式,寫 output/pi-results/<id>.plan.md 的 Files 與 Steps;`Accept: auto` 時計畫第一行是驗收指令)
//       驗收指令至少要跑一個 tools/checks/ 檢查器;只有 npm test / npm run verify 之類的一般套件就退回 PLAN 一次
//       (accept:generic:第二次仍是一般套件 → BLOCKED,不進實作)
//     → PRECHECK(`Accept: auto` 且驗收用到 tools/checks/ 檢查器,新的舊的都算:先在沒改動的樹上跑一次;
//       已經通過就退回 PLAN 改寫一次,改寫後仍通過 → 判定 ALREADY(目標早已達成),跳過實作與 REVIEW)
//     → 實作(pi -p,拿到「卡片 + 計畫」)→ ACCEPT(派工腳本自己跑卡片的驗收指令,不是 LLM,結果可信)
//     → REVIEW(新開一個 pi 當批評者看 diff,寫 <id>.review.md;有 high 問題就退回實作,算一次嘗試)
//   - 預設最多 2 次嘗試(--attempts N 改;2026-11-07 起從 3 改 2:第三輪幾乎不收斂,47% 重做的卡占 67% 花費);
//     失敗自動帶錯誤摘要重派;卡片報 BLOCKED 立刻停。REVIEW 的 high 退回實作也算一次嘗試,只受 --attempts 限制;
//     收斂偵測:某輪 review 的 high 項全部與上一輪的 high 項實質相同(關鍵字正規化比對,REPEAT_OVERLAP)
//     → 立刻停,保留 review:ISSUES,opus 原因 repeat-issue(不管還剩幾次嘗試)
//   - 預設每張卡只印一行:`Txx VERDICT accept:.. scope:.. review:OK|ISSUES|skip precheck:..|n/a Nx Mm $x`
//     內容(結果檔,上限 1200 字元;偵察卡 3000;--full 4000)只印沒過的卡或加了 --full;多張卡最後再印一行一張的總表
//   - 每次結果追加一行到 docs/pi-tasks/cost-log.csv(..., scope, review, precheck, stages, opus, opus_verdict, found_at);
//     最後兩欄由 --opus-verdict 回填(新欄只加在最後,舊列缺欄位照樣能讀)
//   - 計畫閘門:`Gate: plan` 或 --approve-plan 讓卡片停在 PLAN(與它的 PRECHECK)之後,狀態改成 plan-review,並印一行
//     `Txx PLAN-READY plan: <檔> (N lines)`(不算失敗,佇列繼續);之後 `--approved [--note "方向"]` 跳過 PLAN、沿用既有計畫檔再往下跑
//     自動閘門:PLAN_GATE_RULES(下方常數)任一條成立就等同 Gate: plan,另印 `Txx gate:auto(<規則>)`;
//     卡片本身成立 → 有 Steps 的卡也先跑 PLAN;goal-only 卡在 PLAN 之後用「卡片 + 計畫」再判一次。--no-auto-gate 關掉
//     PLAN 一律多寫一節 `## Facts this card depends on`(用哪張 sheet、哪個座標系、改動影響哪些使用者,附 grep 證據)
//     PLAN 階段代理非零結束或沒寫計畫檔時,絕不印 PLAN-READY:log 有 QUOTA/429 → BLOCKED note:quota 並停下整個佇列
//     (後面的卡會撞同一道限制),否則 FAILED note:no plan
//   - 拼圖閘門:`Gate: montage` 或 --montage-gate(視覺卡自動開啟,不管 Accept 有沒有檢查器)在 plan → 實作第一次 →
//     跑一次 Accept 之後停下,狀態 montage-review,印 `Txx MONTAGE-READY montage: <path> accept:PASS|FAIL`;
//     拼圖路徑取自 `Montage:` 標頭,否則取計畫/卡片文字中第一個 compare.png|montage|frames-6x.png 路徑;
//     檔案不存在或比這次開跑舊 → FAILED note:no montage。Opus 看過拼圖後 `--approved --note "數值表"` 續用同一個
//     實作 session 往下跑,`--montage-ok` 直接沿用既有實作結果進 REVIEW;--no-auto-gate 關掉自動視覺閘門
//   - Opus 複核:`opus: repeat-issue|tier-c|review-failed|big-diff|sample`(review high 與上一輪相同、diff 的 hunk 落在
//     TIER_C_CODE 列的狀態/時序/存檔/獵人 AI/方向動畫函式、review 用盡次數仍 high、本卡 diff > BIG_DIFF_LINES 行(不算
//     BIG_DIFF_EXCLUDE:tools/checks/、測試、生成檔)、卡號 ÷5),有值就多印一行 diff/review 路徑給 Claude 讀;
//     `--opus-verdict Txx ok|missed|fixed|skip "note" [--found-at plan|accept|review|opus]` 寫進 docs/pi-tasks/opus-review.csv
//     並回填 cost-log 該卡最新一列;批次結束列出所有還沒判定的 opus 卡(`opus 未判定:`;單獨查:--opus-open)
//   - --gate-selftest:用內建假資料與假代理測上面這些規則(不呼叫 dsh、不寫 repo 資料)
//   - tier-c/big-diff 只看這張卡自己的改動:worktree 模式就是 worktree 的 diff;共用 checkout 模式另外排除「不在卡片範圍、
//     代理紀錄也沒寫過」的檔(主對話同時改的),那些檔照樣算 scope OUT 並標「代理沒寫過」
//   - --dry-run:只解析卡片、印出階段清單與每個階段的提示詞,不跑 pi、不跑驗收、不改卡片狀態
//   - --parallel:每張卡各自在 output/pi-worktrees/<id> 的 git worktree 跑(HEAD + 主 checkout 未提交的改動;node_modules 用 junction),
//     建置與驗收都在 worktree 裡、每張卡自己的 PORT/HOST;通過後 patch 用 git apply 套回主 checkout,
//     套不上就是 CONFLICT(留 <id>.patch 與 worktree,主 checkout 不動)
//   - 自動並行(2026-11-07):沒加 --parallel/--serial 時,≥2 張卡的 Files 清單都讀得到、兩兩不重疊,而且卡片/驗收/
//     驗收用的檢查器都沒提到 output/ 或 outputs/(worktree 不帶這些未追蹤檔)→ 自動走 --parallel;否則照舊串行
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
const VALUED = new Set(['--timeout', '--note', '--attempts', '--ledger', '--cost-log', '--found-at', '--idle']);

// ---- quality-gate rules (2026-11-07) -------------------------------------------------------------------------
// Data, not flow: tune these lists instead of editing runCard/finalize. `--gate-selftest` exercises every one of them.
// Measured on 34 cards / 18 Opus verdicts: 74% of cards were flagged opus: (tier-c fired on any touch of the two big
// files, big-diff counted new checkers), and Opus's real finds were premise errors pi's plan+review shared.

// cost-log.csv columns; new columns only ever go at the end so old rows (fewer cells) stay readable by header index
const COST_HEAD = 'date,card,attempts,verdict,accept,minutes,usd,start,end,scope,review,precheck,stages,opus,opus_verdict,found_at\n';
const OPUS_VERDICTS = ['ok', 'missed', 'fixed', 'skip'];   // skip = closed without a judgement (does not count in the miss rate)
const FOUND_AT = ['plan', 'accept', 'review', 'opus'];      // the stage that caught the defect

// big-diff: changed lines of THIS card above this count, not counting checkers, tests and generated files
const BIG_DIFF_LINES = 300;
const BIG_DIFF_EXCLUDE = [
  /^tools\/checks\//,                     // new checkers (T58: the diff was mostly its own checker)
  /(^|\/)test-[^/]*\.m?js$/, /\.test\.m?js$/, /(^|\/)(tests?|__tests__|fixtures)\//,
  /^docs\/API-pi\.md$/, /^docs\/pi-tasks\/[^/]+\.csv$/,   // generated docs and ledgers
  /(^|\/)package-lock\.json$/, /\.min\.js$/, /^(dist|outputs?)\//,
];

// tier-c: a hunk counts only when a changed line sits inside one of these functions (nearest named enclosing function
// or its parent) or itself contains one of the words. Names come from grepping the two files (2026-11-07); add new ones here.
const TIER_C_CODE = {
  'src/pixel-game.js': {
    funcs: [
      // hunter AI: town tasks, departures, movement, kiting, healing, targeting, routing
      'idleInTown', 'searchStep', 'depart', 'nextTownTask', 'returnToTown', 'runTownTask', 'goToBuilding', 'walk',
      'wandererNextTownTask', 'wandererReturnToTown', 'wandererDepart', 'newHunter', 'newWanderer', 'downWanderer',
      'isRanged', 'kiteHeld', 'endKite', 'kiteStep', 'healTarget', 'woundedAllyNear', 'attackHealTarget', 'basicHeal',
      'moveEnemy', 'pathBetween', 'route', 'ringWaypoints', 'rerouteHunters', 'bestRegionFor', 'pilotStep', 'died', 'revive',
      // combat timing: the step loop, attacks, shots, skills, dungeon/arena stepping and rewards
      'step', 'tick', 'attackInterval', 'castSkill', 'galeVolley', 'launchShot', 'landHits', 'stepShots', 'shotHit', 'hit',
      'spawn', 'rewardEnemy', 'stepDungeon', 'stepArena', 'dgWave', 'dgEvent', 'dgSync', 'dgSkill', 'endDungeon', 'endArena', 'floorCleared',
      // save / load structure
      'serialize', 'restore', 'normalizeSettings', 'normalizeRegionDensity', 'normalizeTeams', 'defaultDispatchTeams',
    ],
    words: /\b(serialize|deserialize|restore|migrat\w*|saveVersion|SAVE_[A-Z0-9_]+|localStorage|attackInterval)\b/,
  },
  'src/pixel-world.js': {
    funcs: [   // direction and animation state machine (drawing/vfx functions are deliberately not here)
      'moveDir', 'moveDirStable', 'dirSuffix', 'leftRow', 'actRow', 'actOf', 'screenDir', 'dirFromScreen', 'windupLen',
      'combatPose', 'posed', 'gaitFrame', 'motionOf', 'sheetPose', 'noSkip', 'monsterSheetPose', 'heroFrameFor', 'sheetFrame', 'unifyHeroTiming',
    ],
    words: /\b(moveDir\w*|dirSuffix|screenDir|dirFromScreen|sheetPose|combatPose|windupLen)\b/,
  },
};

// convergence: a high item "repeats" when this share of its keywords also appears in one of last round's high items
const REPEAT_OVERLAP = 0.6;
const REPEAT_STOP = new Set(('the and that this with should must not does but when from into file line function change '
  + 'changes fix fixes missing wrong still high low card goal diff uses used use only also need needs instead which there').split(' '));

// automatic plan gate: any rule that holds stops the card at PLAN-READY for Opus, exactly like `Gate: plan`.
// ctx = { goal, files: [allowed paths], filesText, accept } (card alone before PLAN; card + plan after it).
const GATE_DIAG = /因為|原因是|原因在|根本原因|導致|root cause|because|caused by|due to/i;
const GATE_BUG = /\bbugs?\b|\bfix(es|ed|ing)?\b|修(正|復|好)|錯|壞|不對|失效|broken|wrong|regression/i;
// tuned on T47–T81 (2026-11-07): bare "constants", "fps" and "coordinate" fired on pixelfx rig cards and UI layout
// cards that had no shared-value risk, so only the shared/space/timing forms stay
const GATE_SHARED = /共用|全域|常數|座標系|世界座標|螢幕座標|畫面座標|存檔|讀檔|速度|倍速|時長|持續時間|放慢|加快|減速|加速|\b(shared|global)\s+(const|constant|value|setting)s?\b|\bcoordinate (space|system)s?\b|\b(screen|world)[- ](space|coord\w*)\b|\bsave (format|structure|schema|data|slot)s?\b|\bserializ\w*|\bspeed\w*\b|\bduration\w*\b|\btime ?scale\b/i;
// an ALL_CAPS_CONSTANT name (case-sensitive on purpose); asset ids like HERO_ARCHER_001 and path parts are not constants
const GATE_CAPS = /(?<![\w/.-])[A-Z][A-Z0-9]*(?:_[A-Z][A-Z0-9]*)+(?![\w/.-])/;
const GATE_SHARED_FILES = /(^|\/)(pixel-data|constants?|config|settings)\.m?js$/;
const GATE_VISUAL_FILES = /(^|\/)(sprites|assets)\/|pixelfx/i;
const GATE_VISUAL_GOAL = /外觀|看起來|顏色|色彩|配色|尺寸|大小|位置|好看|觀感|視覺|\blooks?\b|appearance|visual|colou?rs?\b|sprites?\b/i;
// a card whose Files are all tooling/docs talks about montages without drawing one (T83: the gate fired on dispatcher cards)
const GATE_TOOLING_FILES = /^(tools|docs)\//;
const PLAN_GATE_RULES = [
  { id: 'diagnosis', why: 'the Goal states a bug diagnosis; Opus checks the premise before code is written (T64)',
    test: c => (GATE_DIAG.test(c.goal) && GATE_BUG.test(c.goal)) || (/\bfix/i.test(c.goal) && /\bbugs?\b/i.test(c.goal)) },
  { id: 'shared-value', why: 'a shared constant, coordinate, save structure or speed/duration is touched (T60, T65)',
    test: c => GATE_SHARED.test(c.goal) || GATE_CAPS.test(c.goal) || GATE_SHARED.test(c.filesText) || c.files.some(f => GATE_SHARED_FILES.test(f)) },
  // T79/T80 passed their checkers and were only caught by Opus after a full run: every visual card now stops for one
  // look at its montage, whether or not Accept has a checker (`--no-auto-gate` turns the automatic half off).
  { id: 'montage', why: 'a visual card; Opus looks at the montage before a full run (T79, T80)',
    test: c => {
      const listed = (c.files || []).filter(Boolean);
      if (listed.length && listed.every(f => GATE_TOOLING_FILES.test(String(f).split(path.sep).join('/')))) return false;
      return c.files.some(f => GATE_VISUAL_FILES.test(f)) || GATE_VISUAL_GOAL.test(c.goal);
    } },
];
const gateHits = ctx => PLAN_GATE_RULES.filter(r => { try { return r.test({ goal: '', files: [], filesText: '', accept: '', ...ctx }); } catch { return false; } }).map(r => r.id);
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
// --opus-verdict Txx ok|missed|fixed|skip "note" [--found-at plan|accept|review|opus]: record what Opus said about one card,
// so the pi-review miss rate is a number and not a feeling. The same call fills the card's latest cost-log row
// (opus_verdict, found_at), which is how a flagged row is known to be judged.
function opusVerdict() {
  const [cardArg, verdictArg, ...noteParts] = positional();
  const foundArg = opt('found-at');
  if (!cardArg || !OPUS_VERDICTS.includes(verdictArg) || !/^T\d+$/i.test(cardArg) || (foundArg != null && !FOUND_AT.includes(foundArg))) {
    console.error(`用法: node tools/pi-dispatch.mjs --opus-verdict Txx ${OPUS_VERDICTS.join('|')} "note" [--found-at ${FOUND_AT.join('|')}] [--ledger <path>] [--cost-log <path>]`);
    process.exit(2);
  }
  // the stage that caught the defect; a defect Opus reports without saying where was caught by Opus itself
  const foundAt = foundArg || (verdictArg === 'missed' || verdictArg === 'fixed' ? 'opus' : '-');
  const id = cardArg.toUpperCase(), note = noteParts.join(' ').replace(/[\r\n]+/g, ' ').trim();
  let log = ''; try { log = fs.readFileSync(LOG_CSV, 'utf8'); } catch { }
  const lines = log.split('\n').filter(l => l.trim());
  const head = lines.length && lines[0].startsWith('date,') ? lines.shift().split(',') : [];
  const col = n => head.indexOf(n);
  let reason = '-', piReview = '-', rowIdx = -1;   // latest row for that card; a row written before the opus column existed has reasons '-'
  lines.forEach((line, i) => { const c = line.split(','); if ((c[1] || '').toUpperCase() !== id) return;
    reason = (col('opus') >= 0 ? c[col('opus')] : '') || '-';
    piReview = (col('review') >= 0 ? c[col('review')] : '') || '-';
    rowIdx = i;
  });
  if (rowIdx >= 0) {   // back-fill the cost-log row; an old header gains the new columns, an old short row is padded first
    const full = COST_HEAD.trim().split(',');
    const cells = lines[rowIdx].split(',');
    while (cells.length < full.length) cells.push('');
    cells[full.indexOf('opus_verdict')] = verdictArg;
    cells[full.indexOf('found_at')] = foundAt;
    lines[rowIdx] = cells.join(',');
    try { fs.writeFileSync(LOG_CSV, COST_HEAD + lines.map(l => l + '\n').join('')); } catch (e) { console.error(`[pi-dispatch] cost-log 回填失敗:${e.message}`); }
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
  console.log(`opus-verdict ${id} reason:${reason} pi-review:${piReview} verdict:${verdictArg} found-at:${foundAt} -> ${path.relative(ROOT, ledger).split(path.sep).join('/')}${rowIdx >= 0 ? '' : ' (cost-log 沒有這張卡的列,只寫了 ledger)'}`);
  process.exit(0);
}
if (flag('opus-verdict')) opusVerdict();
// --opus-open: list the cost-log cards flagged opus: that still have no verdict (read-only), then stop
if (flag('opus-open')) { const open = unjudgedOpus(); console.log(open.length ? `opus 未判定:${open.join(' ')}` : 'opus 未判定:(none)'); process.exit(0); }
if (flag('diff-selftest')) diffSelftest();
if (flag('base-selftest')) baseSelftest();
const WT_SELFTEST = flag('worktree-selftest');   // runs the real runCard/finalize against a throwaway repo, no dsh calls
const GATE_SELFTEST = flag('gate-selftest');     // the quality-gate rules above, on inline fixtures; no dsh, no repo data
const MONTAGE_SELFTEST = flag('montage-selftest');   // end-to-end montage gate flow against a throwaway repo, no dsh calls
const cards = WT_SELFTEST || GATE_SELFTEST || MONTAGE_SELFTEST ? [] : ids.map(a => [a, resolveCard(a)]);
if (!WT_SELFTEST && !GATE_SELFTEST && !MONTAGE_SELFTEST && (!cards.length || cards.some(([, c]) => !c))) {
  console.error('用法: node tools/pi-dispatch.mjs Txx [Tyy ...] [--timeout 分鐘] [--note "補充"] [--attempts 2] [--no-review] [--dry-run] [--full] [--force] [--parallel|--serial] [--keep-worktree] [--no-retry] [--keep-going] [--approve-plan] [--approved] [--montage-gate] [--montage-ok] [--no-auto-gate]');
  for (const [a, c] of cards) if (!c) console.error(`找不到卡片:${a}`);
  process.exit(2);
}
const RES = path.join(ROOT, 'output/pi-results'), SESS = path.join(ROOT, 'output/pi-sessions');
fs.mkdirSync(RES, { recursive: true }); fs.mkdirSync(SESS, { recursive: true });
const CAP = flag('full') ? 4000 : 1200;
const minutes = Number(opt('timeout')) || 60;   // hard cap per stage; hangs are caught by the idle watchdog below
const IDLE_MIN = Number(opt('idle')) || 10;      // no agent output for this long = hung (T65 sat silent for 40 min); tool calls run ≤ 7 min
// 2026-11-07: 3 → 2. 47% of cards redid twice or more (67% of $, 69% of time) and 7 of them still ended review:ISSUES
// after the third round; a card that does not converge in two goes to Opus instead (repeat-issue / review-failed).
const MAX_ATTEMPTS = Math.max(1, Number(opt('attempts')) || 2);
let MAX_ATTEMPTS_OVERRIDE = 0;   // --gate-selftest only: runs one card with 3 attempts without touching argv
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
// Opus reads the diff only when the card is risky or pi's own review cannot be trusted; the reason is recorded per card.
// tierC: the "file:function" hits from tierCHits (a non-empty list means a hunk landed in tier C logic).
const opusReason = ({ repeat = false, tierC = [], reviewFailed = false, diffLines = 0, num = 0 } = {}) => {
  if (repeat) return 'repeat-issue';   // the redo did not move the review: the premise is likely wrong, not the code
  if (tierC.length) return 'tier-c';
  if (reviewFailed) return 'review-failed';
  if (diffLines > BIG_DIFF_LINES) return 'big-diff';
  return num && Number(num) % 5 === 0 ? 'sample' : '-';
};
const bigDiffFiles = files => files.filter(f => !BIG_DIFF_EXCLUDE.some(re => re.test(f)));

// ---- tier-c by hunk: which named function encloses each changed line ----
const DEF_RE = [
  /^\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/,
  /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/,
  /^\s*([A-Za-z_$][\w$]*)\s*:\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/,
  /^\s*(?:async\s+)?(?!(?:if|for|while|switch|catch|function|return|else|do|with)\b)([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/,
];
function defName(line) { for (const re of DEF_RE) { const m = String(line).match(re); if (m) return m[1]; } return ''; }
function indentOf(line) { return String(line).match(/^\s*/)[0].replace(/\t/g, '  ').length; }
// the changed line's own definition (if it is one) plus the nearest `depth` named functions that enclose it by indentation;
// every less-indented line narrows the search, so a sibling helper above the line is never taken for its parent
function enclosingFuncs(lines, idx, depth = 2) {
  const out = [];
  const here = lines[idx] ?? '';
  const own = defName(here); if (own) out.push(own);
  let limit = indentOf(here);
  if (!here.trim()) { for (let j = idx + 1; j < lines.length; j++) if (lines[j].trim()) { limit = indentOf(lines[j]); break; } }
  for (let i = Math.min(idx, lines.length) - 1, found = 0; i >= 0 && found < depth && limit > 0; i--) {
    const l = lines[i]; if (!l.trim()) continue;
    const ind = indentOf(l); if (ind >= limit) continue;
    limit = ind;
    const n = defName(l); if (n) { out.push(n); found++; }
  }
  return out;
}
// every changed line of a TIER_C_CODE file → "file:function" or "file:word" hits; empty = no tier C hunk
function tierCHits(files, base = new Map(), root = ROOT) {
  const hits = new Set();
  for (const f of files) {
    const rule = TIER_C_CODE[f]; if (!rule) continue;
    const after = readText(path.join(root, f)), before = baseOf(f, base, root);
    if (before == null || after == null) continue;
    const A = after.split('\n'), B = before.split('\n');
    const memo = new Map();
    const mark = (lines, side, idx, text) => {
      const w = text.match(rule.words); if (w) hits.add(`${f}:${w[0]}`);
      const key = side + idx;
      if (!memo.has(key)) memo.set(key, enclosingFuncs(lines, idx));
      for (const n of memo.get(key)) if (rule.funcs.includes(n)) hits.add(`${f}:${n}`);
    };
    let oldNo = 0, newNo = 0, inHunk = false;
    for (const l of diffOne(f, before, after).diff.split('\n')) {
      const h = l.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (h) { oldNo = +h[1]; newNo = +h[2]; inHunk = true; continue; }
      if (!inHunk || l.startsWith('\\')) continue;   // file headers, "\ No newline at end of file"
      if (l.startsWith('+')) { mark(A, 'a', newNo - 1, l.slice(1)); newNo++; }
      else if (l.startsWith('-')) { mark(B, 'b', oldNo - 1, l.slice(1)); oldNo++; }
      else { oldNo++; newNo++; }
    }
  }
  return [...hits];
}

// ---- which changed files are this card's own (shared-checkout runs only) ----
// The agent log (dsh --json) records every edit/write tool call with its file_path, and shell commands as text.
// A changed file that is neither in the card's scope nor written/named by the agent was changed by someone else
// (T54–T56: the main conversation edited pixel-game/world during the batch); it must not raise tier-c or big-diff.
function agentWrites(logText, root) {
  const writes = new Set(), commands = [];
  const unq = s => { try { return JSON.parse(`"${s}"`); } catch { return s; } };
  const any = /"type":"tool_call"/.test(logText);
  for (const m of logText.matchAll(/"tool":"(edit|write|multi_edit|multiedit|apply_patch|str_replace)","input":\{"(?:file_path|path)":"((?:[^"\\]|\\.)*)"/g)) {
    const abs = unq(m[2]);
    const r = path.isAbsolute(abs) ? path.relative(root, abs) : abs;
    writes.add(r.split(path.sep).join('/'));
  }
  for (const m of logText.matchAll(/"tool":"(pwsh|bash|shell|powershell)","input":\{"command":"((?:[^"\\]|\\.)*)"/g)) commands.push(unq(m[2]).replace(/\\/g, '/'));
  return { any, writes, commands };
}
function ownFiles(changed, allowed, logText, root) {
  const { any, writes, commands } = agentWrites(logText || '', root);
  if (!any) return { own: changed, foreign: [] };   // no parsable tool log (pi fallback): count everything, as before
  const inScope = f => !(outOfScope([f], allowed) || []).length;   // an unparsable Files list counts as in scope
  const named = f => writes.has(f) || commands.some(c => c.includes(f) || c.includes(path.basename(f)));
  const own = [], foreign = [];
  for (const f of changed) (inScope(f) || named(f) ? own : foreign).push(f);
  return { own, foreign };
}

// ---- review convergence ----
function issueWords(line) {
  const t = String(line).toLowerCase().replace(/^\s*[-*]?\s*high\b[\s:—-]*/, '');
  const words = (t.match(/[a-z_$][\w$./-]{2,}/g) || []).map(w => w.replace(/[.\-/]+$/, '')).filter(w => w.length > 2 && !REPEAT_STOP.has(w));
  const cjk = t.match(/[一-鿿]+/g) || [];
  for (const run of cjk) for (let i = 0; i + 1 < run.length; i++) words.push(run.slice(i, i + 2));   // CJK bigrams
  return new Set(words);
}
function sameIssue(a, b) {
  const A = issueWords(a), B = issueWords(b);
  if (!A.size || !B.size) return false;
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size) >= REPEAT_OVERLAP;
}
// every high item of this round matches one of last round's: the redo changed nothing the reviewer cares about
const repeatedIssues = (cur, prev) => cur.length > 0 && prev.length > 0 && cur.every(c => prev.some(p => sameIssue(c, p)));

// ---- auto-parallel: Files lists that cannot overlap ----
const litPrefix = t => t.replace(/^\.\//, '').replace(/\*.*$/, '');
// conservative: a bare name (no directory) can match anywhere, so it overlaps everything
const tokensOverlap = (x, y) => !x.includes('/') || !y.includes('/') || litPrefix(x).startsWith(litPrefix(y)) || litPrefix(y).startsWith(litPrefix(x));
const filesOverlap = (a, b) => a.some(x => b.some(y => tokensOverlap(x, y)));

// ---- opus flags without a verdict ----
// a cost-log row flagged opus:<reason> is judged when its opus_verdict cell is filled, or (rows older than that column)
// when the ledger has a row for the card dated at or after it
function unjudgedOpus(costLog = LOG_CSV, ledger = LEDGER) {
  const rowsOf = f => { let t = ''; try { t = fs.readFileSync(f, 'utf8'); } catch { } const ls = t.split('\n').filter(l => l.trim()); const h = ls.length && ls[0].startsWith('date,') ? ls.shift().split(',') : []; return { h, ls }; };
  const c = rowsOf(costLog), l = rowsOf(ledger);
  const ci = n => c.h.indexOf(n);
  const judged = new Map();   // card → latest ledger date
  for (const line of l.ls) { const [d, card] = line.split(','); if (card && (!judged.has(card) || judged.get(card) < d)) judged.set(card, d); }
  const out = [];
  for (const line of c.ls) {
    const cells = line.split(',');
    const card = cells[1] || '', opus = (ci('opus') >= 0 ? cells[ci('opus')] : '') || '-';
    if (!card || opus === '-' ) continue;
    const v = ci('opus_verdict') >= 0 ? (cells[ci('opus_verdict')] || '') : '';
    if (v && v !== '-') continue;
    if ((judged.get(card) || '') >= (cells[0] || '')) continue;
    if (!out.includes(card)) out.push(card);
  }
  return out;
}
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
  `Do the task card ${card}. Read the whole card first. AGENTS.md and docs/ARCHITECTURE.md (the file map) are inlined at the end of this message unless you are continuing a session that already has them: use them instead of exploring.`,
  `Spend tool calls carefully: grep for a name, then read only the lines around it; do not re-read a file region you already have in this session.`,
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
  `Read the whole card first. AGENTS.md and docs/ARCHITECTURE.md (the file map) are inlined at the end of this message; use them and docs/API-pi.md (grep it, do not read it whole) for export names instead of exploring. The implement stage continues THIS session, so note in the plan what you learned that it needs (function names and the file each lives in). Grep for the functions, selectors and keys the card names; never read src/pixel-game.js or src/pixel-world.js whole.`,
  `Write ${resHint}/${id}.plan.md in the shape of a normal card: a line \`## Files you may change\` with one path per bullet (globs allowed), then \`## Steps\` as a numbered list of exact edits and commands. Name functions, selectors and keys, never line numbers. Keep Files and Steps under 25 lines and cover only what the card asks for.`,
  // 2026-11-07: Opus's real finds were wrong premises (T64 diagnosis, T71 reference sheet, T60 coordinate space, T65 a
  // shared speed constant): write them down where Opus can check them in one read, before any code changes
  `End the plan with \`## Facts this card depends on\` (at most 10 lines): every fact the Steps rely on, one per line, each with its evidence (the grep command and the file:function it found). Always cover what applies: which asset/sheet file the game actually loads for this, which coordinate space each value is in (world vs screen), every user of any constant, speed, duration or shared value you change, the save fields touched, and for a bug fix the observed cause (not a guess). Mark a fact you could not verify \`UNVERIFIED\`.`,
  acceptHead === 'auto'
    ? `This card says \`Accept: auto\`, so the FIRST line of the plan must be \`Accept: <one shell command>\`. It must run at least one checker under tools/checks/ — an existing one (\`node tools/checks/*.mjs\`) or a new deterministic checker you write as part of the plan (list it under \`## Files you may change\`; naming it in the Accept line is enough for scope). Generic suites (\`npm test\`, \`npm run verify\`, \`npm run verify:quick\`, \`npm run build\`) may only be chained after the checker as a regression guard: an accept line with nothing but those is sent back to you once and then blocks the card. Never \`npm run verify\` (button crawl) and never anything that needs the network or a browser. The checker must FAIL on the current tree and pass once the work is done — if it already passes, you get one rewrite and then the card is closed as ALREADY (goal already met).`
    : `The card's own Accept line (${acceptHead || 'none'}) stays the check; do not invent another one.`,
  `Non-interactive run: never ask or wait. If the card cannot be planned as written, say why in the plan file and stop.`,
  extra || '',
].filter(Boolean).join('\n');

// REVIEW: a fresh session with no stake in the work reads the diff and says whether it does the goal and nothing else.
const buildReviewPrompt = (card, id, goal, plan, diff, resHint = 'output/pi-results') => [
  `Independent review stage for the task card ${card} (id ${id}). Change no files: the only file you write is ${resHint}/${id}.review.md.`,
  `You are the critic, not the author. Read the card ${card}${plan ? `, the plan ${plan}` : ''} and the diff ${diff}. The diff is the whole change; read a file it touches only if you need context (grep, then a few lines around the hit).`,
  `Budget: about 10 tool calls. Start from the diff; open other code only to check a call site or a state the diff does not show. Do not run builds, tests or the game.`,
  `Judge only this: does the diff do what the card's Goal asks, nothing more, nothing broken (missing call site, dead code, wrong selector, unhandled state, scope creep, an acceptance command that would pass without the change)?`,
  // T65: slowing the hit effects also stretched the damage numbers, because they shared one value
  `If the diff changes a shared constant, a speed, a duration or a timing value (anything read in more than one place), grep every user of it and name each one with whether it should change, in a \`low\` line (several users may share one line); a user whose behaviour changes without the Goal asking for it is a \`high\` line instead.`,
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
// 2026-11-06 token diet (49 stages: output/reasoning 49% of $, every stage re-explored the same code from a cold start):
//   - stageSession: name → { sid, calls }, so the next stage can continue the session (--session-id) instead of re-reading
//   - sessionBilled: running totals already billed per sid, so a resumed session is not counted twice
//   - review runs at REVIEW_EFFORT (default high since 2026-11-07; was low 11-06..11-07: $0.027 vs $0.058 per review, but the user chose quality;
//     deepseek-v4.1-flash accepts only high|low, medium is UNSUPPORTED_REASONING_EFFORT). Set DSH_REVIEW_EFFORT=low to save again
const stageSession = new Map(), sessionBilled = new Map();
const REVIEW_EFFORT = process.env.DSH_REVIEW_EFFORT || 'high';
const RESUME_MAX_CALLS = 70;   // a session that already took more tool calls than this has too big a context to carry on
const effortPatch = effort => {
  if (!DSH_PATCH || !effort) return DSH_PATCH;
  const f = path.join(RES, `.dsh-overlay-${effort}.yml`);
  fs.writeFileSync(f, fs.readFileSync(DSH_PATCH, 'utf8').replace(/reasoningEffort:\s*\w+/, `reasoningEffort: ${effort}`));
  return f;
};
// AGENTS.md and the file map go into every fresh session's prompt: each stage used to spend tool calls re-reading them (T69: 4x each)
const sharedDocs = root => ['AGENTS.md', 'docs/ARCHITECTURE.md'].map(f => { const t = readText(path.join(root, f)); return t ? `\n--- ${f} (inlined; do not re-read it) ---\n${t.trim()}` : ''; }).join('');
function stageTokens(name, agentOut) {
  const s = { calls: 0, input: 0, cacheRead: 0, output: 0, reasoning: 0, usd: 0 };
  if (AGENT === 'dsh') {   // totals live in the session projection cache; output already includes reasoning
    const sid = (agentOut.match(/"sessionId":"(session-[^"]+)"/) || [])[1]; if (!sid) return s;
    s.calls = (agentOut.match(/"type":"(text|tool_call)"/g) || []).length;
    try {
      const j = JSON.parse(fs.readFileSync(path.join(DSH_HOME, 'storages/session_projcache/sessions', sid + '.json'), 'utf8'));
      const t = JSON.stringify(j).match(/"tokenUsage":\{[^]*?"totals":(\{[^}]*\})/); const u = t ? JSON.parse(t[1]) : {};
      s.input = u.uncachedInputTokens || 0; s.cacheRead = u.cacheReadTokens || 0; s.output = u.outputTokens || 0;
      // a resumed session (--session-id) reports running totals: bill only what this stage added
      const prev = sessionBilled.get(sid) || { input: 0, cacheRead: 0, output: 0 };
      sessionBilled.set(sid, { input: s.input, cacheRead: s.cacheRead, output: s.output });
      s.input -= prev.input; s.cacheRead -= prev.cacheRead; s.output -= prev.output;
    } catch { }
    stageSession.set(name, { sid, calls: s.calls });
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
const runPi = (prompt, name, logFile, root = ROOT, env = {}, { resume = '', effort = '' } = {}) => new Promise(resolve => {
  const t0 = Date.now();
  if (AGENT === 'dsh') prompt = resume ? `(continuing the same session)\n${prompt}` : prompt + sharedDocs(root);
  const patch = AGENT === 'dsh' ? effortPatch(effort) : DSH_PATCH;
  const piArgs = ['-p', '--approve', '--session-dir', SESS, '--name', name, prompt];
  const SP = { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } };
  const p = AGENT === 'dsh'
    ? spawn(process.execPath, [DSH_BIN, '--profile', 'headless', ...(patch ? ['--patch', patch] : []), '--json', ...(resume ? ['--session-id', resume] : []), '-'], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...DSH_ENV, PWD: root, ...env }, windowsHide: true })
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
// a stage the dispatcher records itself (the montage gate runs no agent): a zero-token row with runPi's 11 columns,
// so the stage shows up in agent-tokens.csv and in the cost-log `stages` column without inventing spend.
function stampStage(name, t0, exit = 0) {
  if (runAgent) return;   // a selftest fake agent: never write the real agent-tokens.csv
  try {
    if (!fs.existsSync(TOK_CSV)) fs.writeFileSync(TOK_CSV, 'date,agent,stage,minutes,exit,calls,input,cache_read,output,reasoning,usd\n');
    fs.appendFileSync(TOK_CSV, [new Date().toISOString().slice(0, 16), AGENT, name, ((Date.now() - t0) / 60e3).toFixed(1), exit, 0, 0, 0, 0, 0, '0.0000'].join(',') + '\n');
  } catch { }
}

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

// where the card's montage lives: an explicit `Montage:` header wins, else the first path-like token in the plan/card
// text that names a montage image (`compare.png`, `montage`, `frames-6x.png`). The gate hands this path to Opus, so a
// script that merely has "montage" in its name (e.g. pipeline/scripts/ui-audit/cinder-iso-montage.mjs) must never win.
function montagePath(text, plan = '') {
  const clean = s => String(s || '').trim().replace(/^[`"'(<[]+|[`"'),>\].,;:]+$/g, '');
  const isImage = t => /\.(png|jpe?g|webp|gif)$/i.test(t);
  const h = clean(header(text, 'Montage'));
  if (h && isImage(h)) return h;
  const toks = (`${plan || ''}\n${text}`).split(/\s+/).map(clean)
    .filter(t => t && /compare\.png|montage|frames-6x\.png/i.test(t) && /[\\/.]/.test(t) && !t.startsWith('#'));
  return toks.find(isImage) || (h && !/\.(mjs|cjs|js|ts|py|json|md|html?)$/i.test(h) ? h : '')
    || toks.find(t => !/\.(mjs|cjs|js|ts|py|json|md|html?)$/i.test(t)) || '';
}

// --dry-run: resolve everything a real run would resolve and print it, without running pi, the accept command or touching the card
function dryRun({ card, id, text, type, acceptHead, goalOnly, planFile, reviewFile, diffFile, gate, planGate = gate, montageGate, approved, autoGate = [] }) {
  const plan = readFileOr(planFile);
  const accept = acceptHead === 'auto' ? (goalOnly ? (header(plan, 'Accept') || 'auto') : 'auto') : (acceptHead || 'n/a');
  const allowed = allowedFiles(/^## Files/m.test(text) ? text : (plan || text));
  const stages = [];
  const stopAfterPlan = planGate && !approved && !montageGate;   // Gate: plan stops once the plan (and its precheck) is ready for Opus
  const stopAfterMontage = montageGate && !approved;         // the montage gate stops after attempt 1 + one accept run
  if (goalOnly || planGate) stages.push('plan');
  // PRECHECK runs for every tools/checks/ checker the accept command uses, new or old (an old one may already pass: ALREADY)
  const preWanted = acceptHead === 'auto' && (!plan || acceptCheckers(accept).length > 0);   // no plan yet: precheck is still possible
  if (preWanted) stages.push('precheck');
  const review = stopAfterPlan || stopAfterMontage ? 'pending' : type === 'scout' || noReview ? 'skip' : 'OK';
  if (!stopAfterPlan) {
    stages.push('implement');
    if (accept !== 'n/a') stages.push('accept');
    if (stopAfterMontage) stages.push('montage-gate');
    else if (review !== 'skip') stages.push('review');
  }
  console.log(`${id} DRY-RUN accept:${acceptHead === 'auto' ? 'auto' : 'n/a'} scope:${allowed.length ? 'ok' : 'n/a'} review:${review} precheck:n/a 0x 0m $0.000`);
  console.log(`card: ${card}`);
  console.log(`files: ${allowed.length ? allowed.join(',') : '(none)'}`);
  console.log(`stages: ${stages.join(',')}`);
  // without a diff, tier-c can only be predicted from the Files list; a real run needs a hunk inside a TIER_C_CODE function
  const predicted = allowed.filter(f => TIER_C_CODE[f]);
  console.log(`opus: ${opusReason({ tierC: predicted, num: cardNum(id) })}`);
  if (predicted.length) console.log(`opus-note: predicted from Files (${predicted.join(',')}); a real run flags tier-c only for hunks in TIER_C_CODE functions`);
  if (autoGate.length) console.log(`gate: auto(${autoGate.join(',')})`);
  if (montageGate) console.log(`montage: ${montagePath(text, plan) || '(unknown)'}`);
  if (stopAfterPlan) console.log(`${id} PLAN-READY plan: ${rel(planFile)} (${plan.trim() ? plan.trim().split('\n').length : 0} lines)`);
  const show = (label, prompt) => { console.log(`--- ${label}`); console.log(prompt); };
  if (goalOnly || planGate) show(`stage plan | session ${id}-plan`, buildPlanPrompt(card, id, type, acceptHead, null));
  if (preWanted) show(`stage precheck | command: ${accept === 'auto' ? '(from the plan)' : accept}`, '(every tools/checks/ checker the accept line uses, new or old: it must fail on the unchanged tree; if it passes, PLAN gets one rewrite and then the card ends as ALREADY)');
  if (!stopAfterPlan) {
    show(`stage implement | session ${id}-a1`, buildPrompt(card, id, type, accept === 'auto' ? null : accept, null, goalOnly || approved ? rel(planFile) : null));
    show(`stage accept | command: ${accept === 'auto' ? '(from the plan)' : accept}`, '(the dispatcher runs this itself; the verdict does not come from pi)');
    if (!stopAfterMontage && review !== 'skip') show(`stage review | session ${id}-review-a1`, buildReviewPrompt(card, id, section(text, 'Goal'), goalOnly || approved ? rel(planFile) : null, rel(diffFile)));
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
  const parallel = opts.parallel ?? (PARALLEL && !DRY);
  const id = (path.basename(card).match(/^(T\d+)/) || [, path.basename(card, '.md')])[1];
  const text = fs.readFileSync(path.join(mainRoot, card), 'utf8');
  // `Accept: n/a|none|-` means no accept command (T85: cmd.exe ran `n/a` as a command and failed the scout)
  const status = header(text, 'Status'), type = header(text, 'Type').toLowerCase(), acceptRaw = header(text, 'Accept');
  const acceptHead = /^(n\/?a|none|-)$/i.test((acceptRaw || '').trim()) ? '' : acceptRaw;
  const approved = opts.approved ?? flag('approved');   // second run: the plan (or the montage) is signed off
  const montageOk = opts.montageOk ?? flag('montage-ok');   // Opus saw the montage: skip the gate, keep the implement result
  const gk = header(text, 'Gate').toLowerCase();
  const explicitPlan = gk === 'plan' || flag('approve-plan');   // Opus approves pi's plan before any work
  const explicitMontage = gk === 'montage' || flag('montage-gate');   // Opus looks at the montage before the full run
  // automatic gate from the card alone (PLAN_GATE_RULES); a card with Steps then gets a PLAN stage too
  const autoGateOn = !approved && type !== 'scout' && !flag('no-auto-gate');
  const cardGate = autoGateOn ? gateHits({ goal: section(text, 'Goal'), files: /^## Files/m.test(text) ? allowedFiles(text) : [], filesText: section(text, 'Files'), accept: acceptHead }) : [];
  let planHits = cardGate.filter(x => x !== 'montage');
  let montageGate = type !== 'scout' && (explicitMontage || (!approved && autoGateOn && cardGate.includes('montage')));
  const gate = explicitPlan || planHits.length > 0 || montageGate;
  // the montage gate alone does not need a PLAN stage when the card already has Steps (T84: a 47-min PLAN for a Steps card)
  const planGate = explicitPlan || planHits.length > 0;
  const reusable = status === 'reusable';
  const goalOnly = !/^## Steps/m.test(text) && type !== 'scout';   // no Steps: pi plans before it implements
  const planFile = path.join(res, id + '.plan.md'), reviewFile = path.join(res, id + '.review.md'), diffFile = path.join(res, id + '.diff');
  const montageFile = path.join(res, id + '.montage.json');
  const readPlan = () => readFileOr(planFile);
  if (DRY) return { early: dryRun({ card, id, text, type, acceptHead, goalOnly, planFile, reviewFile, diffFile, gate, planGate, montageGate, approved, autoGate: explicitPlan ? [] : cardGate }) };
  const montageReview = status === 'montage-review';
  if (montageOk && !montageReview) return { early: { id, verdict: 'NO-MONTAGE-STATE', note: '--montage-ok 只用在 montage-review 的卡', exitCode: 2 } };
  if (approved && !montageReview && !fs.existsSync(planFile)) { console.error(`[pi-dispatch] ${id} --approved 但沒有計畫檔 ${rel(planFile)}:先跑一次閘門(卡片加 Gate: plan 或這次加 --approve-plan)`); return { early: { id, verdict: 'NO-PLAN', exitCode: 2 } }; }
  if ((approved || montageOk) && montageReview && !fs.existsSync(montageFile)) { console.error(`[pi-dispatch] ${id} montage-review 但沒有拼圖狀態 ${rel(montageFile)}`); return { early: { id, verdict: 'NO-MONTAGE-STATE', note: 'no montage state', exitCode: 2 } }; }
  if (status && status !== 'todo' && !reusable && !(approved && status === 'plan-review') && !((approved || montageOk) && montageReview) && !flag('force')) return { early: { id, verdict: 'SKIPPED', note: `Status ${status}(要重跑加 --force)` } };
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
  const changedList = () => {
    const now = snapshot(root).filter(l => !before.has(l)).map(l => l.replace(/:[0-9a-f]{32}$/, '')).filter(f => f !== card);
    return [...new Set([...resumedChanged, ...now])];   // a resumed montage run still owns attempt 1's files (T83)
  };
  const allowedFor = () => allowedFiles(/^## Files/m.test(text) ? text : (readPlan() || text));
  let attempts = 0, usd = 0, code, hasResult = false, acc = null, note = opts.note ?? opt('note');
  let accept = acceptHead === 'auto' ? (goalOnly ? header(readPlan(), 'Accept') : '') : acceptHead;   // `Accept: auto` is filled in by PLAN
  let reviewState = 'skip', precheckState = 'n/a', reviewFailed = false, planReady = false;
  let prevHigh = [], repeatIssue = false, autoGate = [];   // last round's high review items; the automatic gate rules that held
  let already = false, generic = false;   // ALREADY: the checker passed on the unchanged tree twice; generic: two generic plans
  let planFailed = false, planQuota = false, montageReady = false, montageMissing = false, montage = '', stopQueue = false;
  let resumedChanged = [];   // a montage resume (--approved or --montage-ok) keeps the files the gated attempt changed
  let montageResume = false, montageResumeFirst = false, montageOkOnce = false;
  const stages = [];
  let maxAttempts = MAX_ATTEMPTS_OVERRIDE || MAX_ATTEMPTS;
  // session reuse: implement continues PLAN's session, a retry or review redo continues the last implement session
  // (each cold start re-explored the same code: T69 read pixel-world.js 36 times). REVIEW always starts fresh: it must not share the author's view.
  let planSid = '', implSid = '';
  const sessCalls = new Map();
  const after = name => { const s = stageSession.get(name); if (!s?.sid) return ''; sessCalls.set(s.sid, (sessCalls.get(s.sid) || 0) + s.calls); return s.sid; };
  const canResume = sid => (sid && (sessCalls.get(sid) || 0) <= RESUME_MAX_CALLS ? sid : '');
  const planStage = async extra => {
    const name = `${id}-plan`;
    const pc = await agent(buildPlanPrompt(cardRef, id, type, acceptHead, extra, resHint), name, logFile, root, env, { resume: canResume(planSid) });
    planSid = after(name) || planSid;
    usd += sessionCost(name);
    return pc;
  };
  // a failed/empty PLAN is never PLAN-READY; a quota failure stops the whole queue (later cards hit the same limit)
  const markPlan = pc => {
    planFailed = pc !== 0 || !readPlan().trim();
    // quota = dsh's own error line, never a number inside the agent's JSON output (T84: a "429" in a tool result read as QUOTA)
    if (planFailed) { planQuota = readFileOr(logFile).split('\n').some(l => !l.trimStart().startsWith('{') && /GoUsageLimitError|\bQUOTA:\s*429|\b429\b:?\s*(Too Many Requests|rate.?limit|usage limit)/i.test(l)); stopQueue = planQuota; }
  };
  let montageState = null;
  if (montageReview) { try { montageState = JSON.parse(readFileOr(montageFile)); } catch { montageState = null; } }
  try {
    if (setupError) fs.writeFileSync(logFile, `[pi-dispatch] worktree setup failed: ${setupError}\n`);
    else if ((montageReview && approved) || montageOk) {   // Opus saw the montage: continue the same implement session (or keep its result)
      const st = montageState || {};
      attempts = Number(st.attempts) || 0;
      implSid = st.sid || '';
      accept = st.acceptCmd || accept;
      if (Array.isArray(st.base) && st.base.length) { baseContents.clear(); for (const [f, t] of st.base) baseContents.set(f, t); }
      if (Array.isArray(st.changed)) resumedChanged = st.changed;
      if (montageOk) {
        code = 0; hasResult = true;
        acc = { pass: !!st.accept, tail: '' };
        maxAttempts = attempts;   // no second implement: the montage was fine, only REVIEW is left
        if (st.result) fs.writeFileSync(resultFile, st.result);
        writeDiff(changedList(), diffFile, baseContents, root);
        montageOkOnce = true;
      } else {
        montageResume = true; montageResumeFirst = true;
        note = `Opus viewed the montage; fix only these:\n${note || ''}`.trim();
      }
    } else if (approved) {   // Opus signed this plan off: do not plan again, reuse the file and carry the note as its direction
      accept = acceptHead === 'auto' ? (header(readPlan(), 'Accept') || '') : acceptHead;
      note = ['Opus approved the plan; implement it as written.', note ? `Opus direction: ${note}` : ''].filter(Boolean).join('\n');
    } else if (goalOnly || planGate) {   // PLAN
      stages.push('plan');
      try { fs.rmSync(planFile); } catch { }
      markPlan(await planStage(null));
      accept = acceptHead === 'auto' ? header(readPlan(), 'Accept') : acceptHead;
      // an accept line with nothing but generic suites proves nothing (T49: `npm test` printed accept:PASS with nothing changed)
      if (!planFailed && acceptHead === 'auto' && isGenericAccept(accept)) {
        markPlan(await planStage(`Accept must run at least one tools/checks/ checker; generic suites only after it. Your Accept command \`${accept || '(none)'}\` runs no tools/checks/ checker, so it would pass without the work. Write a deterministic checker under tools/checks/ (list it under \`## Files you may change\`) and chain any generic suite after it.`));
        accept = header(readPlan(), 'Accept') || accept;
        if (!planFailed && isGenericAccept(accept)) generic = true;   // still generic after one rewrite: the card blocks, no implement stage
      }
    }
    // PRECHECK for every checker the accept command uses, new or old: it must fail on the unchanged tree or the goal is met
    if (!setupError && !planFailed && acceptHead === 'auto' && accept && !generic && acceptCheckers(accept).length > 0) {
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
    // automatic gate, second look: card + the plan's Files and accept line (a goal-only card has no Files before PLAN)
    if (autoGateOn && !setupError && !planFailed && !already && !generic && !explicitPlan) {
      const plan = readPlan();
      autoGate = [...new Set([...cardGate, ...gateHits({ goal: section(text, 'Goal'), files: allowedFor(), filesText: [section(text, 'Files'), section(plan, 'Files')].join('\n'), accept: accept || acceptHead })])];
      if (autoGate.length) stages.push('gate-auto');
    }
    if (autoGate.includes('montage')) montageGate = true;
    if (autoGate.length) planHits = autoGate.filter(x => x !== 'montage');
    // Gate: plan (written or automatic) stops before any file changes; a montage gate never stops here, it must see attempt 1
    planReady = !planFailed && !montageGate && !approved && !montageOk && (explicitPlan || planHits.length > 0);   // --montage-ok resumes a montage-review card; the plain plan gate must not fire again
    while (!setupError && !planFailed && !planReady && !already && !generic) {   // IMPLEMENT (a generic accept line never gets here)
      let resume = '';
      if (montageOkOnce) {
        montageOkOnce = false;
        stages.push(`montage-ok-a${attempts}`);   // reuse the implement result; go straight to REVIEW
      } else {
        if (!montageResumeFirst) attempts++;
        stages.push(`implement-a${attempts}`);
        try { fs.rmSync(resultFile); } catch { }
        acc = null;
        const name = `${id}-${new Date().toISOString().slice(0, 16)}-a${attempts}`;
        resume = montageResumeFirst ? canResume(implSid) : attempts === 1 ? canResume(planSid) : canResume(implSid);
        montageResumeFirst = false;
        code = await agent(buildPrompt(cardRef, id, type, accept || null, note, (goalOnly || approved) && fs.existsSync(planFile) ? promptPath(planFile) : null, resHint), name, logFile, root, env, { resume });
        implSid = after(name) || implSid;
        stages.push(resume ? `resume-a${attempts}` : `cold-a${attempts}`);
        usd += sessionCost(name);
        hasResult = fs.existsSync(resultFile);
        const firstLine = hasResult ? fs.readFileSync(resultFile, 'utf8').split('\n')[0] : '';
        const piOk = code === 0 && hasResult && /^\s*\**DONE/i.test(firstLine);
        const blocked = hasResult && /^\s*\**BLOCKED/i.test(firstLine);
        if (!piOk) {
          if (attempts >= maxAttempts || flag('no-retry') || blocked) break;
          // automatic retry carrying the failure summary, so Claude does not have to read logs and re-dispatch by hand
          const why = !hasResult ? `previous attempt ended (exit ${code}) without a result file` : `previous attempt reported: ${firstLine}`;
          note = [opt('note'), `RETRY: ${why}. Fix only that, then report.`].filter(Boolean).join('\n');
          continue;
        }
        acc = accept ? runAccept(accept, acceptFile, root, env) : null;   // ACCEPT
        if (accept) stages.push('accept');
        // MONTAGE GATE: one accept run, then stop for Opus with the result and diff in hand. No retry, whatever accept said.
        if (montageGate && !montageResume && !montageOk) {
          const gateT0 = Date.now();
          stages.push('montage-gate');
          montage = montagePath(text, readPlan());
          let mt = null; try { mt = montage ? fs.statSync(path.join(root, montage)).mtimeMs : null; } catch { mt = null; }
          montageMissing = !mt || mt < t0;
          montageReady = !montageMissing;
          if (montageReady) {
            const changedNow = changedList();
            writeDiff(changedNow, diffFile, baseContents, root);
            const state = {
              sid: implSid, montage, acceptCmd: accept, accept: acc ? !!acc.pass : false, attempts,
              changed: changedNow, base: changedNow.map(f => [f, baseOf(f, baseContents, root)]), result: readFileOr(resultFile),
            };
            fs.writeFileSync(montageFile, JSON.stringify(state));
          }
          stampStage('montage-gate', gateT0, 0);
          break;
        }
        if (acc && !acc.pass) {
          if (attempts >= maxAttempts || flag('no-retry')) break;
          note = [opt('note'), `RETRY: the acceptance command failed:\n${acc.tail}. Fix only that, then report.`].filter(Boolean).join('\n');
          continue;
        }
      }
      if (type === 'scout' || noReview) break;   // REVIEW
      const changedNow = changedList();
      if ((outOfScope(changedNow, allowedWithCheckers(allowedFor(), accept)) || []).length) break;   // out of scope: the card fails already, a review would only burn tokens
      writeDiff(changedNow, diffFile, baseContents, root);
      const rname = `${id}-review-a${attempts}`;
      stages.push(`review-a${attempts}`);
      try { fs.rmSync(reviewFile); } catch { }
      await agent(buildReviewPrompt(cardRef, id, section(text, 'Goal'), (goalOnly || approved) && fs.existsSync(planFile) ? promptPath(planFile) : null, promptPath(diffFile), resHint), rname, logFile, root, env, { effort: REVIEW_EFFORT });
      usd += sessionCost(rname);
      const rv = readFileOr(reviewFile).trim();
      const rvFirst = rv.split('\n')[0].replace(/[*#\s]/g, '').toUpperCase();
      reviewState = rvFirst.startsWith('ISSUES') ? 'ISSUES' : rvFirst.startsWith('OK') ? 'OK' : 'skip';
      const high = rv.split('\n').slice(1).filter(l => /^\s*[-*]?\s*high\b/i.test(l));
      if (!high.length) { if (reviewState === 'ISSUES') reviewState = 'LOW'; break; }   // low-only findings: the card passes; Claude sees them with the diff
      // 2026-11-07 convergence: the redo left every high item standing → stop now, whatever attempts remain (the premise
      // is probably wrong, which another pi round will not see either); the card keeps review:ISSUES and goes to Opus
      const repeat = repeatedIssues(high, prevHigh);
      prevHigh = high;
      if (repeat) { repeatIssue = true; reviewFailed = true; reviewState = 'ISSUES'; stages.push('repeat-issue'); break; }
      // review redos are bounded by --attempts alone (default 2 = at most one redo, as on 2026-11-06)
      if (attempts >= maxAttempts || flag('no-retry')) { reviewFailed = true; break; }   // the verdict keeps review:ISSUES
      note = [opt('note'), `REVIEW found high issues (${promptPath(reviewFile)}):\n${rv}\nFix only these, then report.`].filter(Boolean).join('\n');
    }
  } finally { try { fs.rmSync(lock); } catch { } try { server?.kill(); } catch { } }
  const changed = changedList();
  const patch = wtDir ? collectPatch(root, base) : '';
  return {
    id, card, text, type, parallel, mainRoot, res, costLog, ledger, root, wtDir, base, patch, changed,
    planFile, reviewFile, diffFile, acceptFile, resultFile, logFile, montageFile, montage,
    hasResult, attempts, usd, code, acc, accept, acceptHead, reusable, planReady, already, generic,
    reviewState, precheckState, reviewFailed, t0, sec: Math.round((Date.now() - t0) / 1000), baseContents, stages, setupError,
    repeatIssue, autoGate, planFailed, planQuota, montageReady, montageMissing, stopQueue, note,
  };
}

// scope, diff, review verdict, status, cost log and the one-line output, then the patch goes back into the main checkout
function finalize(run) {
  const { id, card, text, type, mainRoot, res, costLog, ledger, reusable, planReady, already, generic, hasResult, accept, acceptHead, acc, attempts, usd, code, sec, changed, baseContents, reviewState, reviewFailed, precheckState, stages, patch, acceptFile, planFile, reviewFile, diffFile, planFailed, planQuota, montageReady, montageMissing, montage } = run;
  const note = planFailed ? (planQuota ? 'quota' : 'no plan') : montageMissing ? 'no montage' : run.note;
  const body = hasResult ? fs.readFileSync(run.resultFile, 'utf8').trim() : readFileOr(run.logFile).split('\n').slice(-15).join('\n');
  const first = hasResult ? body.split('\n')[0].replace(/\*/g, '').trim() : '';
  let verdict = montageReady ? 'MONTAGE-READY' : montageMissing ? 'FAILED' : planFailed ? (planQuota ? 'BLOCKED' : 'FAILED')
    : planReady ? 'PLAN-READY' : already ? 'ALREADY' : generic ? 'BLOCKED' : !hasResult ? 'FAILED' : (first.match(/^(DONE|BLOCKED|FAILED)/i)?.[1] || '?').toUpperCase();
  const accText = generic ? 'generic' : !accept ? (acceptHead === 'auto' ? 'not run' : 'n/a') : acc ? (acc.pass ? 'PASS' : 'FAIL') : 'not run';
  const stray = outOfScope(changed, allowedWithCheckers(allowedFiles(/^## Files/m.test(text) ? text : (readFileOr(planFile) || text)), accept));   // a tools/checks/ file named in Accept is in scope
  const scope = stray == null ? 'n/a' : stray.length ? 'OUT' : 'ok';
  // the card's own change only: a worktree holds nothing else; in the shared checkout a file outside the card's scope
  // that the agent never wrote or named is someone else's concurrent edit (still scope OUT, but no tier-c/big-diff)
  const { own, foreign } = run.wtDir ? { own: changed, foreign: [] }
    : ownFiles(changed, allowedWithCheckers(allowedFiles(/^## Files/m.test(text) ? text : (readFileOr(planFile) || text)), accept), readFileOr(run.logFile), run.root);
  const tierC = planReady || already || montageReady || montageMissing || planFailed ? [] : tierCHits(own, baseContents, run.root);
  // a plan-waiting card is not a failure: Opus just has to read the plan before the work starts
  const opus = planReady || already || montageReady || montageMissing || planFailed ? '-' : opusReason({ repeat: run.repeatIssue, tierC, reviewFailed, diffLines: diffLineCount(bigDiffFiles(own), baseContents, run.root), num: cardNum(id) });
  let ok = montageReady || planReady || already || (code === 0 && verdict === 'DONE' && accText !== 'FAIL' && accText !== 'not run' && accText !== 'generic' && scope !== 'OUT' && reviewState !== 'ISSUES');
  let conflict = null;
  if (run.wtDir && ok) {   // the worktree measured the change; apply it back only when the card actually passed
    const ab = applyBack(mainRoot, res, id, patch);
    if (!ab.ok) { conflict = ab.error || 'patch did not apply'; verdict = 'CONFLICT'; ok = false; }
  }
  if (!reusable) setStatus(card, planReady ? 'plan-review' : montageReady ? 'montage-review' : ok ? 'done' : 'failed', mainRoot);
  const stageLog = [...new Set(stages)].join('+');
  try {   // start/end let tools/session-cost.mjs --from/--to cut the Claude side of the same window
    const HEAD = COST_HEAD;   // opus_verdict/found_at stay '-' until --opus-verdict fills them in
    if (!fs.existsSync(costLog)) fs.writeFileSync(costLog, HEAD);
    else { const t = fs.readFileSync(costLog, 'utf8'); if (!t.startsWith(HEAD)) fs.writeFileSync(costLog, HEAD + t.slice(t.indexOf('\n') + 1)); }
    fs.appendFileSync(costLog, `${new Date().toISOString().slice(0, 16)},${id},${attempts},${verdict},${accText},${(sec / 60).toFixed(1)},${usd.toFixed(4)},${new Date(run.t0).toISOString()},${new Date().toISOString()},${scope},${reviewState},${precheckState},${stageLog},${opus},-,-\n`);
  } catch { }
  // one line per card is the whole point: Claude pays for every line it reads
  if (montageReady) console.log(`${id} MONTAGE-READY montage: ${montage || '(unknown)'} accept:${accText}`);
  else if (montageMissing) console.log(`${id} FAILED note: no montage`);
  else if (planFailed) console.log(`${id} ${verdict} note: ${note}`);
  else if (planReady) console.log(`${id} PLAN-READY plan: ${rel(planFile)} (${readFileOr(planFile).trim().split('\n').filter(l => l.trim()).length} lines)`);
  else console.log(`${id} ${verdict} accept:${accText} scope:${scope} review:${reviewState} precheck:${precheckState} ${attempts}x ${Math.floor(sec / 60)}m $${usd.toFixed(3)}`);
  if ((planReady || montageReady) && run.autoGate?.length) console.log(`${id} gate:auto(${run.autoGate.join(',')}) 讀計畫的 Facts 節,再 --approved [--note "方向"]`);
  if (conflict) console.log(`[pi-dispatch] ${id} CONFLICT: patch kept at ${path.join(res, id + '.patch')} (${conflict.split('\n')[0]})`);
  if (opus !== '-') {   // the escalation only prints the paths; the dispatcher never calls Claude itself
    writeDiff(own, diffFile, baseContents, run.root);   // REVIEW writes it only when REVIEW ran; scout/--no-review/out-of-scope never do
    const why = opus === 'tier-c' ? ` why: ${tierC.slice(0, 4).join(',')}${tierC.length > 4 ? ',…' : ''}` : '';
    console.log(`${id} opus:${opus} diff: ${rel(diffFile)} (${readFileOr(diffFile).split('\n').filter(Boolean).length} lines) review: ${rel(reviewFile)}${why}`);
  }
  if (acc && !acc.pass) console.log(`[pi-dispatch] 驗收失敗(${rel(acceptFile)}):\n${acc.tail}`);
  if (stray?.length) console.log(`[pi-dispatch] 超出卡片範圍:${stray.map(f => foreign.includes(f) ? `${f}(代理沒寫過,可能是主對話同時改的)` : f).join(' | ')}`);
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
  return { id, verdict, accText, scope, reviewState, precheckState, attempts, sec, usd, ok, opus, wtDir: run.wtDir, stopQueue: run.stopQueue, note };
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

// --gate-selftest: the 2026-11-07 quality-gate rules on inline fixtures, plus two fake-agent runs of the real
// runCard/finalize (review convergence; a concurrent edit in the shared checkout). No dsh, no repo data written.
async function gateSelftest() {
  const bad = [];
  const check = (yes, msg) => { if (!yes) bad.push(msg); else console.log(`ok ${msg}`); };
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-gate-'));
  try {
    // 1. MAX_ATTEMPTS default
    check(opt('attempts') != null || MAX_ATTEMPTS === 2, 'default attempts is 2');

    // 2. tier-c by hunk
    const G = 'src/pixel-game.js';
    const before = [
      'export function createGame() {',
      '  function walk(h, dt) {',
      '    h.x += dt;',
      '  }',
      '  function drawThing(ctx) {',
      '    ctx.fill();',
      '  }',
      '  function stepDungeon(dt) {',
      '    state.list.forEach(e => {',
      '      e.t -= dt;',
      '    });',
      '  }',
      '  const api = {',
      '    serialize() { return {}; },',
      '  };',
      '}',
      '',
    ].join('\n');
    fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
    const hitsFor = (after, file = G) => { fs.writeFileSync(path.join(tmp, file), after); return tierCHits([file], new Map([[file, before]]), tmp); };
    check(eq(hitsFor(before.replace('ctx.fill();', "ctx.fill('x');")), []), 'tier-c: a hunk in a drawing helper is not tier C');
    check(hitsFor(before.replace('h.x += dt;', 'h.x += dt * 2;')).includes(`${G}:walk`), 'tier-c: a hunk inside walk() is tier C');
    check(hitsFor(before.replace('e.t -= dt;', 'e.t -= dt * 2;')).includes(`${G}:stepDungeon`), 'tier-c: an anonymous callback inside stepDungeon() is tier C');
    check(hitsFor(before.replace('ctx.fill();', 'ctx.fill(); localStorage.setItem("k", 1);')).includes(`${G}:localStorage`), 'tier-c: a save keyword in any function is tier C');
    check(hitsFor(before.replace('serialize() { return {}; }', 'serialize() { return { v: 2 }; }')).includes(`${G}:serialize`), 'tier-c: a one-line serialize() method is tier C');
    check(eq(hitsFor(before.replace('h.x += dt;', 'h.x += dt * 2;'), 'src/other.js'), []), 'tier-c: files outside TIER_C_CODE never count');

    // 3. big-diff without checkers, tests and generated files
    check(eq(bigDiffFiles(['tools/checks/x.mjs', 'src/a.js', 'test-pixel-game.mjs', 'docs/API-pi.md', 'src/foo.test.mjs', 'tools/checks/fixtures/n.md']), ['src/a.js']), 'big-diff: excluded paths');
    fs.mkdirSync(path.join(tmp, 'tools', 'checks'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'tools/checks/new.mjs'), Array.from({ length: 400 }, (_, i) => `// ${i}`).join('\n') + '\n');
    fs.writeFileSync(path.join(tmp, 'src/small.js'), Array.from({ length: 10 }, (_, i) => `x${i}();`).join('\n') + '\n');
    const nb = new Map([['tools/checks/new.mjs', ''], ['src/small.js', '']]);
    const all = ['tools/checks/new.mjs', 'src/small.js'];
    check(opusReason({ diffLines: diffLineCount(all, nb, tmp) }) === 'big-diff', 'big-diff: the raw count (410 lines) would flag');
    check(opusReason({ diffLines: diffLineCount(bigDiffFiles(all), nb, tmp) }) === '-', 'big-diff: a 400-line new checker alone does not flag');
    check(opusReason({ repeat: true, tierC: ['x'], reviewFailed: true }) === 'repeat-issue', 'opus reason: repeat-issue comes first');

    // 4. review convergence
    const prev = ['high src/pixel-world.js drawVfxSheet: passes world gx as screen x, so the ghost is drawn at the top-left'];
    check(repeatedIssues(['- high drawVfxSheet in src/pixel-world.js still receives world gx instead of screen x'], prev), 'repeat: the same issue reworded');
    check(!repeatedIssues(['high tools/checks/foo.mjs: checker passes without the change'], prev), 'repeat: a different issue is not a repeat');
    check(!repeatedIssues(['high drawVfxSheet in src/pixel-world.js still gets world gx', 'high tools/checks/foo.mjs passes on HEAD'], prev), 'repeat: one new issue among old ones is progress');
    check(!repeatedIssues(prev, []), 'repeat: the first round never repeats');
    check(repeatedIssues(['high 傷害數字 damageText 也被放慢到 2.5 秒'], ['high damageText 傷害數字跟著放慢'],), 'repeat: CJK wording');

    // 5. automatic plan gate rules
    const g = ctx => gateHits(ctx);
    check(g({ goal: '修正弓手卡住的 bug,原因是 kiteStep 沒有清 target' }).includes('diagnosis'), 'gate: Chinese diagnosis');
    check(g({ goal: 'Fix the bug where arrows vanish because the volley resets' }).includes('diagnosis'), 'gate: English diagnosis');
    check(g({ goal: 'Slow all pixelfx hit effects to 0.6x speed' }).includes('shared-value'), 'gate: a speed change');
    check(g({ goal: 'Draw the ghost trail at the hunter', files: ['src/pixel-world.js'], filesText: 'convert world coordinates' }).includes('shared-value'), 'gate: coordinates');
    check(g({ goal: 'Raise HUNTER_CAP to 12' }).includes('shared-value'), 'gate: an ALL_CAPS constant');
    check(!g({ goal: 'Pose after HERO_ARCHER_001 in sprites/characters/HERO_ARCHER_001/walk/, stock constants, 8 fps, share one top coordinate', accept: 'node tools/checks/a.mjs' }).includes('shared-value'), 'gate: asset ids, bare "constants"/"fps"/"coordinate" do not fire');
    check(g({ goal: 'Add a price row', files: ['src/pixel-data.js'] }).includes('shared-value'), 'gate: a shared data file');
    check(g({ goal: 'Make the archer look like the reference', files: ['sprites/archer/walk.png'], accept: 'npm run verify:quick' }).includes('montage'), 'gate: visual card with a generic accept');
    check(g({ goal: 'Make the archer look like the reference', files: ['sprites/archer/walk.png'], accept: 'node tools/checks/archer.mjs' }).includes('montage'), 'gate: visual card with a checker still gates on the montage');
    check(g({ goal: 'Make the archer look like the reference', accept: 'auto' }).includes('montage'), 'gate: Accept auto still gates a visual card');
    check(!g({ goal: 'Add the montage gate to the dispatcher', files: ['tools/pi-dispatch.mjs'] }).includes('montage'), 'gate: a dispatcher card that mentions montage stays non-visual');
    check(g({ goal: 'Make the archer look like the reference', files: ['tools/checks/archer.mjs', 'pipeline/scripts/pixelfx/x.mjs'] }).includes('montage'), 'gate: a card that also touches pipeline art still gates on the montage');
    check(eq(g({ goal: 'Add a tooltip to the shop button', files: ['src/pixel-ui.js'], accept: 'node tools/checks/tip.mjs' }), []), 'gate: an ordinary card passes');
    check(!g({ goal: 'Add a tooltip to the shop button', files: ['src/pixel-ui.js'], accept: 'node tools/checks/tip.mjs' }).includes('montage'), 'gate: a non-visual card never hits the montage gate');
    // the dispatch-selftest fixtures must keep their stage lists: only montage.md trips a rule
    const FIX = path.join(ROOT, 'tools/checks/fixtures');
    for (const f of fs.existsSync(FIX) ? fs.readdirSync(FIX).filter(f => f.endsWith('.md')) : []) {
      const t = fs.readFileSync(path.join(FIX, f), 'utf8');
      const hits = header(t, 'Type').toLowerCase() === 'scout' ? [] : gateHits({ goal: section(t, 'Goal'), files: /^## Files/m.test(t) ? allowedFiles(t) : [], filesText: section(t, 'Files'), accept: header(t, 'Accept') });
      const wanted = f === 'montage.md' ? ['montage'] : [];
      check(eq(hits, wanted), `gate: fixture ${f} trips only ${wanted.join(',') || 'none'} (${hits.join(',') || 'none'})`);
    }

    // 6. Files overlap and the auto-parallel decision
    check(!filesOverlap(['src/a.js'], ['src/b.js']), 'overlap: two different files');
    check(filesOverlap(['src/'], ['src/b.js']), 'overlap: a directory and a file in it');
    check(filesOverlap(['sprites/*.png'], ['sprites/hero/x.png']), 'overlap: a glob');
    check(filesOverlap(['demo.js'], ['src/x.js']), 'overlap: a bare name overlaps everything');
    check(!filesOverlap(['tools/checks/a.mjs'], ['tools/checks/b.mjs']), 'overlap: two checkers');
    const cardsDir = path.join(tmp, 'docs', 'pi-tasks'); fs.mkdirSync(cardsDir, { recursive: true });
    const mk = (id, body) => { const f = `docs/pi-tasks/${id}-x.md`; fs.writeFileSync(path.join(tmp, f), `# ${id}\n\nStatus: todo\nAccept: node --check x.mjs\n\n${body}\n`); return [id, f]; };
    const A = mk('T801', '## Goal\na\n\n## Files you may change\n- src/a.js\n\n## Steps\n1. a');
    const B = mk('T802', '## Goal\nb\n\n## Files you may change\n- src/b.js\n\n## Steps\n1. b');
    const C = mk('T803', '## Goal\nc\n\n## Files you may change\n- src/\n\n## Steps\n1. c');
    const D = mk('T804', '## Goal\nd');
    const E = mk('T805', '## Goal\nread output/ref/x.png\n\n## Files you may change\n- src/e.js\n\n## Steps\n1. e');
    const res = path.join(tmp, 'res'); fs.mkdirSync(res, { recursive: true });
    check(autoParallel([A, B], tmp, res).on, 'auto-parallel: disjoint Files run in parallel');
    check(!autoParallel([A, C], tmp, res).on, 'auto-parallel: overlapping Files stay serial');
    check(!autoParallel([A, D], tmp, res).on, 'auto-parallel: a goal-only card keeps the batch serial');
    check(!autoParallel([A, E], tmp, res).on, 'auto-parallel: a card that names output/ stays serial');
    check(!autoParallel([A], tmp, res).on, 'auto-parallel: one card is not a batch');

    // 7. own vs foreign files in the shared checkout
    const esc = s => JSON.stringify(s).slice(1, -1);
    const logText = [
      `{"type":"tool_call","callId":"c1","tool":"edit","input":{"file_path":"${esc(path.join(tmp, 'src', 'a.js'))}","old_string":"x"}}`,
      '{"type":"tool_call","callId":"c2","tool":"pwsh","input":{"command":"node tools/gen.mjs > src/gen.json"}}',
    ].join('\n');
    const of = ownFiles(['src/a.js', 'src/gen.json', 'src/pixel-game.js', 'docs/x.md'], ['docs/x.md'], logText, tmp);
    check(eq(of.own, ['src/a.js', 'src/gen.json', 'docs/x.md']) && eq(of.foreign, ['src/pixel-game.js']), `own files: edit/write and shell-named files are the agent's (${of.foreign.join(',')})`);
    check(eq(ownFiles(['src/pixel-game.js'], ['docs/x.md'], '', tmp).foreign, []), 'own files: no tool log means no filtering');

    // 8. --opus-verdict back-fills cost-log; old short rows survive; unjudged list
    const cost = path.join(tmp, 'cost-log.csv'), ledger = path.join(tmp, 'opus-review.csv');
    const OLD = 'date,card,attempts,verdict,accept,minutes,usd,start,end,scope,review,precheck,stages,opus\n';
    fs.writeFileSync(cost, OLD
      + '2026-11-01T00:15,T07,1,DONE,backfill,,0.0336\n'
      + '2026-11-02T00:00,T50,1,DONE,PASS,1.0,0.01,a,b,ok,OK,n/a,implement,tier-c\n'
      + '2026-11-02T01:00,T51,1,DONE,PASS,1.0,0.01,a,b,ok,OK,n/a,implement,big-diff\n'
      + '2026-11-02T02:00,T52,1,DONE,PASS,1.0,0.01,a,b,ok,OK,n/a,implement,-\n');
    fs.writeFileSync(ledger, 'date,card,reason,pi_review,opus_verdict,note\n2026-11-02T03:00,T51,big-diff,OK,ok,seen\n');
    check(eq(unjudgedOpus(cost, ledger), ['T50']), `unjudged: only the flagged row without a verdict (${unjudgedOpus(cost, ledger).join(',')})`);
    const self = (...a) => spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...a, '--ledger', ledger, '--cost-log', cost], { cwd: ROOT, encoding: 'utf8' });
    const v = self('--opus-verdict', 'T50', 'fixed', 'coords', '--found-at', 'review');
    check(v.status === 0, `opus-verdict exit 0 (${(v.stdout + v.stderr).trim().split('\n').pop()})`);
    const lines = fs.readFileSync(cost, 'utf8').trim().split('\n');
    check(lines[0] === COST_HEAD.trim(), 'cost-log header gained opus_verdict,found_at');
    check(lines[1] === '2026-11-01T00:15,T07,1,DONE,backfill,,0.0336', 'an old 7-column row is left as it was');
    check(lines[2].endsWith(',tier-c,fixed,review') && lines[2].split(',').length === 16, `the card's row ends with verdict and stage: ${lines[2]}`);
    check(eq(unjudgedOpus(cost, ledger), []), 'unjudged: empty after the verdict');
    const lrows = fs.readFileSync(ledger, 'utf8').trim().split('\n');
    check(lrows.length === 3 && lrows[2].split(',').length === 6, 'ledger keeps its 6 columns');
    check(self('--opus-verdict', 'T07', 'ok').status === 0 && fs.readFileSync(cost, 'utf8').split('\n')[1].split(',').length === 16, 'a verdict on an old short row pads it');
    check(self('--opus-verdict', 'T50', 'ok', '--found-at', 'later').status === 2, 'a bad --found-at exits 2');

    // 9. fake-agent runs of the real runCard/finalize in a throwaway repo (shared checkout)
    const repo = path.join(tmp, 'repo'), rres = path.join(tmp, 'rres');
    fs.mkdirSync(path.join(repo, 'src'), { recursive: true }); fs.mkdirSync(path.join(repo, 'docs', 'pi-tasks'), { recursive: true }); fs.mkdirSync(rres, { recursive: true });
    fs.writeFileSync(path.join(repo, '.gitignore'), 'output/\n');
    fs.writeFileSync(path.join(repo, 'src', 'a.txt'), 'a\n');
    fs.writeFileSync(path.join(repo, 'src', 'pixel-game.js'), before);
    const git = a => spawnSync('git', a, { cwd: repo, encoding: 'utf8' });
    if (git(['init', '-q']).status !== 0) throw new Error('git init failed');
    git(['config', 'user.name', 'pi-selftest']); git(['config', 'user.email', 'pi-selftest@local']); git(['config', 'core.autocrlf', 'false']);
    git(['add', '-A']); git(['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'init']);
    const card = id => { const f = `docs/pi-tasks/${id}-gate.md`; fs.writeFileSync(path.join(repo, f), `# ${id}: gate selftest\nStatus: todo\n\n## Goal\nEdit src/a.txt.\n\n## Files you may change\n- src/a.txt\n\n## Steps\n1. Write the text.\n`); return f; };
    let reviews = 0, mode = 'same', planMode = 'plain';
    runAgent = async (prompt, name, logFile, root) => {
      const id = (name.match(/^(T\d+)/) || [])[1];
      if (/^Independent review stage/m.test(prompt)) {
        reviews++;
        const item = mode === 'same' ? (reviews % 2 ? 'high src/a.txt: the second line says two, the Goal wants three' : '- high src/a.txt still says two on the second line; the Goal wants three')
          : (reviews % 2 ? 'high src/a.txt: the second line says two, the Goal wants three' : 'high tools/checks/none.mjs: nothing asserts the trailing newline');
        fs.writeFileSync(path.join(rres, `${id}.review.md`), `ISSUES\n${item}\n`);
        return 0;
      }
      if (/^Planning stage/m.test(prompt)) {
        if (planMode === 'quota') fs.appendFileSync(logFile, 'QUOTA: 429 GoUsageLimitError\n');
        return 1;   // no plan file written, non-zero exit: exactly the T82 first-run failure
      }
      fs.writeFileSync(path.join(root, 'src', 'a.txt'), `a\ntwo ${Date.now()}\n`);
      fs.appendFileSync(logFile, `{"type":"tool_call","callId":"c","tool":"write","input":{"file_path":"${esc(path.join(root, 'src', 'a.txt'))}"}}\n`);
      if (mode === 'foreign') fs.writeFileSync(path.join(root, 'src', 'pixel-game.js'), before.replace('h.x += dt;', 'h.x += dt * 3;'));   // the "main conversation"
      fs.writeFileSync(path.join(rres, `${id}.md`), 'DONE | files: src/a.txt | accept: n/a\nnone\n');
      return 0;
    };
    const runOne = async id => { const r = await runCard(card(id), { mainRoot: repo, res: rres, costLog: path.join(tmp, 'c2.csv'), ledger: path.join(tmp, 'l2.csv'), parallel: false }); return r.early || finalize(r); };
    const planCard = id => {
      const f = `docs/pi-tasks/${id}-gate.md`;
      fs.writeFileSync(path.join(repo, f), `# ${id}: plan failure\nStatus: todo\nAccept: node --check src/a.txt\nGate: plan\n\n## Goal\nEdit src/a.txt.\n\n## Files you may change\n- src/a.txt\n\n## Steps\n1. Write the text.\n`);
      return f;
    };
    const runPlan = async id => { const r = await runCard(planCard(id), { mainRoot: repo, res: rres, costLog: path.join(tmp, 'c2.csv'), ledger: path.join(tmp, 'l2.csv'), parallel: false }); return r.early || finalize(r); };
    const saved = MAX_ATTEMPTS_OVERRIDE; MAX_ATTEMPTS_OVERRIDE = 3;   // with 3 attempts allowed, only convergence can stop after round 2
    try {
      reviews = 0; mode = 'same';
      const s = await runOne('T911');
      check(s.opus === 'repeat-issue' && s.reviewState === 'ISSUES' && s.attempts === 2, `convergence: same high twice stops at 2 of 3 attempts (${s.opus} ${s.reviewState} ${s.attempts}x)`);
      reviews = 0; mode = 'different';
      const d = await runOne('T912');
      check(d.opus === 'review-failed' && d.attempts === 3, `convergence: new high items keep redoing to the cap (${d.opus} ${d.attempts}x)`);
      git(['checkout', '--', 'src']);
      reviews = 0; mode = 'foreign';
      const f = await runOne('T913');
      check(f.scope === 'OUT' && f.opus === '-', `shared checkout: a concurrent edit to pixel-game.js is scope OUT but not tier-c (${f.scope} opus:${f.opus})`);
      // a failed/empty PLAN must never be PLAN-READY; QUOTA also stops the queue
      planMode = 'plain';
      const p1 = await runPlan('T914');
      check(p1.verdict === 'FAILED' && p1.note === 'no plan' && !p1.ok, `failed PLAN is FAILED note no plan (${p1.verdict} note:${p1.note})`);
      planMode = 'quota';
      const p2 = await runPlan('T915');
      check(p2.verdict === 'BLOCKED' && p2.note === 'quota' && p2.stopQueue === true, `QUOTA PLAN is BLOCKED note quota (${p2.verdict} note:${p2.note})`);
      check(record(p2) === false, 'QUOTA PLAN stops the queue even with --keep-going');
      planMode = 'plain';
    } finally { MAX_ATTEMPTS_OVERRIDE = saved; runAgent = null; }
  } catch (e) {
    bad.push(`exception: ${e.stack || e.message}`);
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { }
  }
  if (bad.length) { for (const b of bad) console.log(`FAIL ${b}`); console.log(`gate-selftest: ${bad.length} failure(s)`); return false; }
  console.log('gate-selftest: PASS');
  return true;
}

// --montage-selftest: the whole montage gate against a throwaway git repo with a fake agent (no dsh, no repo data):
// a visual card stops at MONTAGE-READY/montage-review after attempt 1; --approved --note resumes the saved implement
// session and finishes DONE; --montage-ok finishes DONE without a second implement; a missing montage is FAILED.
async function montageSelftest() {
  const bad = [];
  const check = (yes, msg) => { if (!yes) bad.push(msg); else console.log(`ok ${msg}`); };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-montage-'));
  const repo = path.join(tmp, 'repo'), res = path.join(tmp, 'res');
  const costLog = path.join(tmp, 'cost-log.csv'), ledger = path.join(tmp, 'opus-review.csv');
  const SID = 'session-montage-selftest';
  let implCalls = 0, lastResume = '', writeMontage = true, lastReviewPrompt = '';
  try {
    fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
    fs.mkdirSync(path.join(repo, 'docs', 'pi-tasks'), { recursive: true });
    fs.mkdirSync(res, { recursive: true });
    fs.writeFileSync(path.join(repo, '.gitignore'), 'output/\n');
    fs.writeFileSync(path.join(repo, 'src', 'a.js'), 'export const a = 0;\n');
    const card = 'docs/pi-tasks/T815-montage.md';
    fs.copyFileSync(path.join(ROOT, 'tools/checks/fixtures/montage.md'), path.join(repo, card));
    const git = a => spawnSync('git', a, { cwd: repo, encoding: 'utf8' });
    if (git(['init', '-q']).status !== 0) throw new Error('git init failed');
    git(['config', 'user.name', 'pi-selftest']); git(['config', 'user.email', 'pi-selftest@local']); git(['config', 'core.autocrlf', 'false']);
    git(['add', '-A']); git(['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'init']);
    runAgent = async (prompt, name, logFile, root, env, opts = {}) => {
      const id = (name.match(/^(T\d+)/) || [])[1];
      stageSession.set(name, { sid: SID, calls: 1 });   // a fake dsh session the next stage can resume
      if (/^Planning stage/m.test(prompt)) {
        fs.writeFileSync(path.join(res, `${id}.plan.md`), '## Files you may change\n- src/a.js\n\n## Steps\n1. Update src/a.js.\n');
        return 0;
      }
      if (/^Independent review stage/m.test(prompt)) {
        lastReviewPrompt = prompt;
        fs.writeFileSync(path.join(res, `${id}.review.md`), 'OK\n');
        return 0;
      }
      implCalls++; lastResume = opts.resume || '';
      // the resumed implement (T83) must not touch attempt 1's file: it writes a different one
      const resumed = /Opus viewed the montage/.test(prompt);
      const touched = resumed ? 'src/b.js' : 'src/a.js';
      fs.writeFileSync(path.join(root, touched), `export const ${resumed ? 'b' : 'a'} = ${implCalls};\n`);
      fs.appendFileSync(logFile, `{"type":"tool_call","callId":"c","tool":"write","input":{"file_path":"${path.join(root, touched).split(path.sep).join('/')}"}}\n`);
      if (writeMontage) {
        fs.mkdirSync(path.join(root, 'output', 'fixture-montage'), { recursive: true });
        fs.writeFileSync(path.join(root, 'output', 'fixture-montage', 'compare.png'), 'png');
      }
      fs.writeFileSync(path.join(res, `${id}.md`), `DONE | files: ${touched} | accept: n/a\nnone\n`);
      return 0;
    };
    const runOne = async (opts = {}) => {
      const r = await runCard(card, { mainRoot: repo, res, costLog, ledger, parallel: false, ...opts });
      return r.early || finalize(r);
    };
    const status = () => (readFileOr(path.join(repo, card)).match(/^Status:\s*(.+)$/m) || [])[1]?.trim();
    // (a) a fresh visual card stops after attempt 1 with status montage-review
    const a = await runOne();
    check(a.verdict === 'MONTAGE-READY' && a.accText === 'PASS' && status() === 'montage-review', `fresh visual card stops at MONTAGE-READY (${a.verdict} accept:${a.accText} status:${status()})`);
    const state = JSON.parse(readFileOr(path.join(res, 'T815.montage.json')) || '{}');
    check(state.sid === SID && state.attempts === 1 && state.accept === true, `montage state keeps sid/attempts/accept (${state.sid} ${state.attempts} ${state.accept})`);
    const costRow = readFileOr(costLog).split('\n').find(l => l.split(',')[1] === 'T815') || '';
    check(costRow.split(',')[12] === 'plan+implement-a1+accept+montage-gate' || costRow.includes('montage-gate'), `cost-log stages name the montage gate (${costRow.split(',')[12] || '?'})`);
    // (b) --approved --note resumes the same implement session and finishes DONE; the diff still names attempt 1's file
    implCalls = 0;
    const b = await runOne({ approved: true, note: 'value table' });
    check(b.verdict === 'DONE' && implCalls === 1 && lastResume === SID, `--approved --note resumes the saved session and ends DONE (${b.verdict} calls:${implCalls} resume:${lastResume})`);
    const bDiff = readFileOr(path.join(res, 'T815.diff'));
    check(bDiff.includes('a/src/a.js') && bDiff.includes('a/src/b.js'), `resumed diff names attempt 1's file and the resumed one (${bDiff.split('\n').filter(l => l.startsWith('diff --git')).join(' | ') || 'empty'})`);
    // (c) --montage-ok finishes DONE with no second implement, and REVIEW still sees the attempt-1 diff
    fs.writeFileSync(path.join(repo, card), readFileOr(path.join(repo, card)).replace(/^Status:.*$/m, 'Status: montage-review'));
    implCalls = 0; lastReviewPrompt = '';
    const c = await runOne({ montageOk: true });
    check(c.verdict === 'DONE' && implCalls === 0, `--montage-ok skips the second implement (${c.verdict} calls:${implCalls})`);
    const cDiff = readFileOr(path.join(res, 'T815.diff'));
    check(cDiff.trim() !== '' && !/^\(no changed files\)/m.test(cDiff) && cDiff.includes('a/src/a.js') && /T815\.diff/.test(lastReviewPrompt),
      `--montage-ok REVIEWs the attempt-1 diff (${cDiff.trim().split('\n').length} lines, prompt:${/T815\.diff/.test(lastReviewPrompt) ? 'diff' : 'no diff'})`);
    // (d) a missing montage is FAILED no montage
    writeMontage = false;
    const missingCard = 'docs/pi-tasks/T816-montage.md';
    fs.writeFileSync(path.join(repo, missingCard), readFileOr(path.join(ROOT, 'tools/checks/fixtures/montage.md')).replace(/^Montage:.*$/m, 'Montage: output/fixture-montage/missing.png'));
    const m = await runCard(missingCard, { mainRoot: repo, res, costLog, ledger, parallel: false });
    const d = m.early || finalize(m);
    check(d.verdict === 'FAILED' && d.note === 'no montage', `missing montage is FAILED note no montage (${d.verdict} note:${d.note})`);
    // (e) a script whose name contains "montage" must not win over the image the gate hands to Opus
    const mp = montagePath('run `node pipeline/scripts/ui-audit/cinder-iso-montage.mjs`, it writes output/cinder-iso/montage.png');
    check(mp === 'output/cinder-iso/montage.png', `montagePath prefers the image over the script (${mp || 'empty'})`);
  } catch (e) {
    bad.push(`exception: ${e.stack || e.message}`);
  } finally {
    runAgent = null;
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { }
  }
  if (bad.length) { for (const b of bad) console.log(`FAIL ${b}`); console.log(`montage-selftest: ${bad.length} failure(s)`); return false; }
  console.log('montage-selftest: PASS');
  return true;
}

// ---- auto-parallel (2026-11-07): cards whose Files lists cannot overlap run at once, each in its own worktree ----
// Only when the user said neither --parallel nor --serial. Known limit of the worktree mode (reported, not changed
// here): a worktree gets HEAD + tracked diffs + untracked files under src/ assets/ tools/ pipeline/ only, so untracked
// material under output/ (and docs/, sprites/) is missing there — a card that names output/ stays serial.
function autoParallel(list, root = ROOT, res = RES) {
  if (list.length < 2) return { on: false, why: 'one card' };
  const sets = [];
  for (const [a, card] of list) {
    const text = readFileOr(path.join(root, card));
    const id = (path.basename(card).match(/^(T\d+)/) || [, path.basename(card, '.md')])[1];
    const plan = readFileOr(path.join(res, id + '.plan.md'));
    const type = header(text, 'Type').toLowerCase();
    let files;
    if (/^## Files/m.test(text)) files = allowedFiles(text);
    else if (flag('approved') && plan) files = allowedFiles(plan);   // an approved plan fixes the Files list
    else if (type === 'scout') files = [];                           // changes nothing
    else return { on: false, why: `${a} has no Files list yet (goal-only: PLAN decides)` };
    if (!files.length && type !== 'scout') return { on: false, why: `${a} Files list not parsable` };
    const acc = header(text, 'Accept') === 'auto' ? header(plan, 'Accept') : header(text, 'Accept');
    const checkerSrc = acceptCheckers(acc).map(f => readFileOr(path.join(root, f))).join('\n');
    if (/\boutputs?[\\/]/.test([text, plan, acc, checkerSrc].join('\n'))) return { on: false, why: `${a} uses output/ (untracked there, not copied into a worktree)` };
    sets.push([a, files]);
  }
  for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++)
    if (filesOverlap(sets[i][1], sets[j][1])) return { on: false, why: `${sets[i][0]} and ${sets[j][0]} share files` };
  return { on: true, why: 'auto: Files lists do not overlap' };
}
const PARALLEL_AUTO = flag('parallel') || flag('serial') || WT_SELFTEST || GATE_SELFTEST || MONTAGE_SELFTEST ? { on: false, why: 'flag' } : autoParallel(cards);
const PARALLEL = flag('parallel') || (!flag('serial') && PARALLEL_AUTO.on);

const rows = [];
function record(r) {
  if (r.exitCode === 2) process.exit(2);   // --approved with no plan file: nothing to implement, do not start another card
  if (r.verdict === 'SKIPPED' || r.verdict === 'LOCKED') console.log(`[pi-dispatch] ${r.id} ${r.verdict}:${r.note}\n`);
  rows.push(r);
  if (r.stopQueue) { console.log(`[pi-dispatch] ${r.id} PLAN 撞到 QUOTA,停下整個佇列(後面的卡會撞同一道限制)\n`); return false; }
  if (!r.ok && r.verdict !== 'SKIPPED' && r.verdict !== 'ALREADY' && !flag('keep-going')) {
    const rest = PARALLEL && !DRY ? [] : cards.slice(rows.length).map(([a]) => a);   // parallel cards already ran
    if (rest.length) console.log(`[pi-dispatch] ${r.id} 沒過,停下後面的卡:${rest.join(' ')}(要繼續加 --keep-going)\n`);
    return false;
  }
  return true;
}
// --worktree-selftest: drive the real runCard/finalize against a throwaway repo with a fake agent, then stop
if (WT_SELFTEST) { process.exit(await worktreeSelftest() ? 0 : 1); }
if (GATE_SELFTEST) { process.exit(await gateSelftest() ? 0 : 1); }
if (MONTAGE_SELFTEST) { process.exit(await montageSelftest() ? 0 : 1); }
if (PARALLEL_AUTO.on && !DRY) console.log(`[pi-dispatch] 自動並行:${cards.length} 張卡 Files 互不重疊,各自 worktree(要串行加 --serial)`);
if (DRY && cards.length > 1) console.log(`mode: ${PARALLEL ? 'parallel' : 'serial'} (${flag('parallel') ? '--parallel' : flag('serial') ? '--serial' : PARALLEL_AUTO.why})`);
if (PARALLEL && !DRY) {   // every card starts at once, each in its own worktree; patches apply back in argument order
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
// (a `skip` verdict closes a flag without a judgement, so it is not in the denominator either)
if (rows.some(r => r.opus && r.opus !== '-')) {
  const ledger = readFileOr(LEDGER).split('\n').filter(l => l.trim() && !l.startsWith('date,')).filter(l => (l.split(',')[4] || '').trim() !== 'skip');
  console.log(`pi-review miss rate: ${ledger.filter(l => (l.split(',')[4] || '').trim() === 'missed').length}/${ledger.length}`);
}
if (!DRY && rows.some(r => r.sec != null)) {
  // every opus: flag must end as one ledger row; the list covers the whole cost log, not just this batch
  const open = unjudgedOpus();
  if (open.length) console.log(`opus 未判定:${open.join(' ')}(各卡讀完 diff 後 node tools/pi-dispatch.mjs --opus-verdict Txx ${OPUS_VERDICTS.join('|')} "說明" [--found-at ${FOUND_AT.join('|')}])`);
  // the Claude side is not measured by this script; one line says how, nothing runs it automatically
  console.log('Claude 側 token:批次判斷完後 node tools/session-cost.mjs --label <名稱> --log(不會自動執行)');
}
process.exit(rows.length === cards.length && rows.every(r => r.ok || r.verdict === 'SKIPPED' || r.verdict === 'ALREADY') ? 0 : 1);
