// verify.mjs — 一個指令跑完驗收,只印一小段摘要(給 pi / Claude 看結果用,不用讀幾百行輸出)。
// 用法:
//   npm run verify          建置 + npm test + 按鈕巡檢(桌機＋手機同時跑,約 5–8 分鐘)
//   npm run verify:quick    建置 + npm test + 村莊名牌檢查 + 首領面板檢查(約 3 分鐘)
// 按鈕巡檢需要本機遊戲伺服器(node server.mjs,預設 http://100.79.149.0:5024)在跑;它每次請求都重讀 outputs/暮影村.html,建置完就是新版。
// 詳細輸出寫在 output/ui-audit/(不進 git):build.log、test.log、buttons-desktop.txt、buttons-phone.txt、verify-summary.md。
// 結束碼:全部通過 0;有任何一項失敗 1。
import { spawn } from 'node:child_process';
process.noDeprecation = true;   // Windows 上 spawn 要 shell:true,不要讓 DEP0190 警告洗版
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'output/ui-audit'); fs.mkdirSync(OUT, { recursive: true });
const QUICK = process.argv.includes('--quick');
const TARGET = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';

function run(cmd, args, logFile, env = {}) {
  return new Promise(resolve => {
    const t0 = Date.now(), out = fs.createWriteStream(path.join(OUT, logFile));
    const p = spawn(cmd, args, { cwd: ROOT, shell: process.platform === 'win32', env: { ...process.env, ...env } });
    let text = '';
    p.stdout.on('data', d => { text += d; out.write(d); }); p.stderr.on('data', d => { text += d; out.write(d); });
    p.on('close', code => { out.end(); resolve({ code, text, sec: Math.round((Date.now() - t0) / 1000) }); });
  });
}
const lines = [], fail = [];
const say = (ok, msg) => { lines.push(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail.push(msg); };

// 1) 建置
const b = await run('node', ['build.mjs'], 'build.log');
const built = b.text.match(/Built .*?\((\d+\.\d+ MB)\)/);
say(b.code === 0 && !!built, `build ${built ? built[1] : '失敗'} (${b.sec}s)`);

// 2) 測試
const t = await run('npm', ['test'], 'test.log');
const passes = (t.text.match(/^PASS/gm) || []).length, errLine = t.text.split('\n').find(l => /AssertionError|Error:/.test(l));
say(t.code === 0 && passes >= 11, `npm test ${passes} 項 PASS${t.code ? ' — ' + (errLine || '').trim().slice(0, 120) : ''} (${t.sec}s)`);

// 2a) 獵人自主狩獵(UX 稽核 round3 #5):全新存檔不下指令 20 分鐘,初始獵人要自己出村、有擊倒、錢有進帳;離線戰報分開列獵人/流浪英雄。純 node,quick 也跑
{
  const r = await run('node', ['tools/checks/hunter-autonomy.mjs'], 'hunter-autonomy.txt');
  const fl = r.text.split(/\r?\n/).filter(l => /^ - /.test(l));
  say(r.code === 0, `獵人自主狩獵 ${r.code === 0 ? (r.text.match(/^PASS.*$/m) || [''])[0].replace(/^PASS [^:]*:\s*/, '').slice(0, 60) : '— ' + (fl[0] || r.text.trim().split(/\r?\n/).pop() || '').trim().slice(0, 140)} (${r.sec}s)`);
}

// 2b) T151 村莊名牌不重疊(自己開臨時伺服器讀剛建好的版本,不需要 5024 那台)
const ml = await run('node', ['tools/checks/map-labels.mjs'], 'map-labels.txt');
const mlFix = ml.text.split('\n').filter(l => l.startsWith('FIX'));
say(ml.code === 0, `村莊名牌 ${(ml.text.match(/^PASS/gm) || []).length} 個情境 PASS${ml.code ? ' — ' + (mlFix[0] || ml.text.trim().split('\n').pop() || '').trim().slice(0, 120) : ''} (${ml.sec}s)`);

// 2c) T162 首領面板(戰力對比、參戰名單、限時說明、召喚鈕第一屏);自己開臨時伺服器,quick 也跑
const bp = await run('node', ['tools/checks/boss-panel.mjs'], 'boss-panel.txt', { TARGET: '' });
const bpFix = bp.text.split('\n').filter(l => l.startsWith('FIX'));
say(bp.code === 0, `首領面板 ${(bp.text.match(/^ok /gm) || []).length} 項 ok${bp.code ? ' — ' + (bpFix[0] || bp.text.trim().split('\n').pop() || '').trim().slice(0, 120) : ''} (${bp.sec}s)`);

// 2d) FIX-A(2026-11-11 抓 bug 修正):出征 HUD 位置(B1)、移動建築取消(B2)、獵人小卡(B4)、toast 位置(缺口 4/19)、標題畫面(B5/B12)、離線戰報/手動操控/放置列版面(B3/B7/缺口 8,12,20)
//     每支檢查都是「改回舊行為就會紅」;自己開臨時伺服器(TARGET 設空字串),quick 也跑
for (const [file, label] of [['fix-a-runhud', '出征 HUD'], ['fix-a-cancelmove', '移動建築取消'], ['fix-a-unitcard', '獵人小卡'], ['fix-a-toast', 'toast 位置'], ['fix-a-title', '標題畫面'], ['fix-a-layout', '版面(手動操控/離線戰報/放置列/任務欄)']]) {
  const r = await run('node', [`tools/checks/${file}.mjs`], `${file}.txt`, { TARGET: '' });
  const fl = r.text.split('\n').filter(l => /^ - /.test(l));
  say(r.code === 0, `${label} ${r.code === 0 ? (r.text.match(/^PASS.*$/m) || [''])[0].replace(/^PASS \S+:\s*/, '').slice(0, 60) : '— ' + (fl[0] || r.text.trim().split('\n').pop() || '').trim().slice(0, 140)} (${r.sec}s)`);
}

// 2e) FIX-B(2026-11-11 風格缺口補完):載入畫面/標題畫面/左面板/建築詳情/獵人名冊/卡片單一主按鈕/對比/指令面板/鎖頭/建設卡 i 鈕熱區;四種視窗,自己開臨時伺服器
{
  const r = await run('node', ['tools/checks/hv-fixb.mjs'], 'hv-fixb.txt', { TARGET: '' });
  const fl = r.text.split('\n').filter(l => l.startsWith('FIX'));
  say(r.code === 0, `風格缺口(FIX-B) ${(r.text.match(/^ok /gm) || []).length} 項 ok${r.code ? ' — ' + (fl[0] || r.text.trim().split('\n').pop() || '').trim().slice(0, 140) : ''} (${r.sec}s)`);
}

// 2f) FIX-C／FIX-D(2026-11-11 FIX-D = 第二輪回歸稽核 G1–G6、G9):面板開著 toast 在標題列／同句 ×N／橫向資源條／抽屜開著直接點另一棟／對齊值共用變數;
//     另外 toast 卡片(T116)與出征小隊 HUD(T107)兩支舊檢查以前沒掛進來,FIX-A 回報它們修前就紅(圖示改 <img>、血條加邊框),已更新檢查後掛上
for (const [file, label] of [['fix-c', 'FIX-C 面板 toast／資源條／切換建築'], ['toasts', 'toast 卡片'], ['run-hud', '出征小隊 HUD'], ['fix-d', 'FIX-D 橫向建築抽屜／面板 toast 蓋標題列／手動操控／對比']]) {
  const r = await run('node', [`tools/checks/${file}.mjs`], `${file}.txt`, { TARGET: '' });
  const fl = r.text.split(/\r?\n/).filter(l => /^ - |^FIX/.test(l));
  say(r.code === 0, `${label} ${r.code === 0 ? (r.text.match(/^PASS.*$/m) || [''])[0].replace(/^PASS [^:]*:\s*/, '').slice(0, 50) : '— ' + (fl[0] || r.text.trim().split(/\r?\n/).pop() || '').trim().slice(0, 140)} (${r.sec}s)`);
}

// 2g) Z1(2026-11-12 圖鑑 v2 外殼):頁籤列 5 格、A 抽屜／C 置中視窗(遮罩蓋頁籤列、底部按鈕列、Esc／遮罩可關)、建築詳情同套外殼、按鈕語意色、舊入口可達、觸控熱區;六種視窗,自己開臨時伺服器
{
  const r = await run('node', ['tools/checks/z1-shell.mjs'], 'z1-shell.txt', { TARGET: '' });
  const fl = r.text.split(/\r?\n/).filter(l => /^ - /.test(l));
  say(r.code === 0, `Z1 外殼與頁籤列 ${(r.text.match(/^ok /gm) || []).length} 項 ok${r.code ? ' — ' + (fl[0] || r.text.trim().split(/\r?\n/).pop() || '').trim().slice(0, 140) : ''} (${r.sec}s)`);
}

// 2h) Z2A(2026-11-12 圖鑑 v2 的獵人相關畫面):獵人卡(裝備環、經驗條、子頁籤、四色狀態條、動作在底部／清單列)、名冊卡(稀有度字／邊框／右上 i)、新獵人暗帶(D)、tooltip、流浪英雄不與獵人同名;四種視窗,自己開臨時伺服器
{
  const r = await run('node', ['tools/checks/z2a-hunter.mjs'], 'z2a-hunter.txt', { TARGET: '' });
  const fl = r.text.split(/\r?\n/).filter(l => /^ - /.test(l));
  say(r.code === 0, `Z2A 獵人卡／名冊／新獵人暗帶／tooltip ${(r.text.match(/^ok /gm) || []).length} 項 ok${r.code ? ' — ' + (fl[0] || r.text.trim().split(/\r?\n/).pop() || '').trim().slice(0, 140) : ''} (${r.sec}s)`);
}

// 2i) Z2D(2026-11-12 圖鑑 v2 的 HUD 與引導):主 HUD(數字 16–18px、金幣／星晶＋框、N 徽章)、toast(暗帶金字、失敗在按鈕旁、A 抽屜上方)、開場氣泡一次一步＋高亮手指、標題「重新開始」文字連結＋確認、簡體字、小尺寸與橫向版面(R6–R11);九種視窗,自己開臨時伺服器
{
  const r = await run('node', ['tools/checks/z2d-hud.mjs'], 'z2d-hud.txt', { TARGET: '' });
  const fl = r.text.split(/\r?\n/).filter(l => /^ - /.test(l));
  say(r.code === 0, `Z2D HUD／toast／引導／標題／橫向版面 ${(r.text.match(/^ok /gm) || []).length} 項 ok${r.code ? ' — ' + (fl[0] || r.text.trim().split(/\r?\n/).pop() || '').trim().slice(0, 140) : ''} (${r.sec}s)`);
}

// 2j) Z2B(2026-11-12 圖鑑 v2 的建築與經濟畫面):建築詳情(標題 Lv.n、清單列、子頁籤、需求提示框、MAX)、建設卡(用途說明、缺料寫全)、交易所 3 欄方格、倉庫方格、製作清單列、委託列、確認框、商品賣完徽章與顧問提示;四種視窗,自己開臨時伺服器
{
  const r = await run('node', ['tools/checks/z2b-econ.mjs'], 'z2b-econ.txt', { TARGET: '' });
  const fl = r.text.split(/\r?\n/).filter(l => /^ - /.test(l));
  say(r.code === 0, `Z2B 建築詳情／建設／交易／倉庫／製作／委託／確認框／賣完導引 ${(r.text.match(/^ok /gm) || []).length} 項 ok${r.code ? ' — ' + (fl[0] || r.text.trim().split(/\r?\n/).pop() || '').trim().slice(0, 140) : ''} (${r.sec}s)`);
}

// 3) 按鈕巡檢(桌機＋手機同時)
if (!QUICK) {
  let up = false; try { up = (await fetch(TARGET.replace(/\?.*/, ''), { signal: AbortSignal.timeout(5000) })).ok; } catch { }
  if (!up) say(false, `遊戲伺服器沒在跑(${TARGET});先 node server.mjs 再跑 npm run verify`);
  else {
    const crawl = mode => run('node', ['pipeline/scripts/ui-audit/buttons.mjs', mode], `buttons-${mode}.txt`, { TARGET });
    // 兩個 headless Chrome 同時跑,偶爾會被系統一起砍掉(同一秒兩邊都 "browser has been closed",不是頁面問題);
    // 另一種是 renderer 直接 "Target crashed"。兩種都單獨重跑一次就會過。頁面真的有問題時 text 裡會有 "total",不會走這條。
    const crashed = r => !/"total": \d+/.test(r.text) && /browser has been closed|Target page, context or browser|Target crashed|page\.evaluate: Target crashed/.test(r.text);
    const res = {}, retried = {};
    const [d, ph] = await Promise.all([crawl('desktop'), crawl('phone')]);
    res.desktop = d; res.phone = ph;
    for (const mode of ['desktop', 'phone']) if (crashed(res[mode])) { res[mode] = await crawl(mode); retried[mode] = true; }
    for (const mode of ['desktop', 'phone']) {
      const r = res[mode];
      const total = (r.text.match(/"total": (\d+)/) || [])[1] || '?';
      const errs = (r.text.match(/"errors": \[([\s\S]*?)\]/) || [])[1]?.trim();
      const bad = r.text.split('\n').filter(l => /NO REACTION|ERROR|click-failed|COVERED|OFFSCREEN|NO-LABEL/.test(l));
      say(r.code === 0 && !errs && !bad.length, `按鈕巡檢 ${mode}:${total} 次點擊,問題 ${bad.length} 個${errs ? '、頁面錯誤' : ''}${retried[mode] ? '、瀏覽器被砍後單獨重跑' : ''} (${r.sec}s)`);
      for (const l of bad.slice(0, 5)) lines.push('      ' + l.replace(/\s+/g, ' ').slice(0, 150));
    }
  }
}
const summary = [`verify ${new Date().toISOString().slice(0, 16).replace('T', ' ')}${QUICK ? '(quick)' : ''}: ${fail.length ? `${fail.length} 項失敗` : '全部通過'}`, ...lines,
  `詳細輸出:output/ui-audit/`].join('\n');
fs.writeFileSync(path.join(OUT, 'verify-summary.md'), summary + '\n');
console.log(summary);
process.exit(fail.length ? 1 : 0);
