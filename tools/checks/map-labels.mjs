// map-labels.mjs — T151:村莊地圖建築名牌不重疊、不出畫布。
//   讀遊戲實際畫出來的名牌矩形(globalThis.__mistvaleMapLabels:由 src/map-labels.js 的 layoutMapLabels 算出、
//   pixel-world.js 照同一份結果繪製 —— 這裡不另寫近似算法),每個情境檢查:
//     (1) 任兩個名牌之間至少留 2px(重疊或貼太近就 FIX)
//     (2) 名牌整個落在畫布內
//   情境(都是全新瀏覽器 = 初始存檔):
//     - 1024x768、1440x900:預設縮放(至少要畫出 10 個名牌,避免「沒畫」也算過),
//       再按「−」逐階拉遠,直到名牌依設計隱藏為止(每一階都要過)
//     - 1024x768 全部建築蓋到 Lv.1(14 個都是已建造的名牌),再選取城鎮大廳(名牌展開顯示等級)
//     - 手機 390x844:預設縮放,再按「+」逐階拉近到名牌出現後再多一階
// 需要先 build(outputs/暮影村.html);會自己在 127.0.0.1 開一個臨時 server.mjs,不依賴 5024 那台(TARGET= 可覆寫)。
// Usage: node tools/checks/map-labels.mjs     Exit: 0 = PASS, 1 = FIX lines.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIN_GAP = 2;
const PORT = 5600 + Math.floor(Math.random() * 300);
let server = null, url = process.env.TARGET;
if (!url) {
  server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' }, stdio: 'ignore' });
  url = `http://127.0.0.1:${PORT}/?preview=1`;
  for (let i = 0; i < 50; i++) { try { if ((await fetch(url.replace(/\?.*/, ''))).ok) break; } catch { } await new Promise(r => setTimeout(r, 200)); }
}
const fails = [], oks = [];
const DESK = w => ({ viewport: { width: w, height: w === 1024 ? 768 : 900 } });
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

// 等名牌穩定:連續兩次讀到一樣的矩形(開場鏡頭可能還在移動、圖集還在載入)
async function stable(page, minCount = 0) {
  let snap = null, prev = '';
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(350);
    snap = await page.evaluate(() => globalThis.__mistvaleMapLabels());
    const s = JSON.stringify(snap.labels);
    if (s === prev && (snap.labels.length >= minCount || i > 15)) break;
    prev = s;
  }
  return snap;
}
function judge(name, snap, minCount = 0) {
  const L = snap.labels, bad = [];
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const a = L[i], b = L[j];
    const gx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w)), gy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
    if (Math.max(gx, gy) < MIN_GAP) bad.push(`「${a.text}」與「${b.text}」${gx < 0 && gy < 0 ? '重疊' : '間隙 ' + Math.max(gx, gy).toFixed(1) + 'px'}`);
  }
  const out = L.filter(r => r.x < 0 || r.y < 0 || r.x + r.w > snap.width || r.y + r.h > snap.height).map(r => `「${r.text}」超出畫布`);
  if (L.length < minCount) fails.push(`${name}: 只畫出 ${L.length} 個名牌(預期至少 ${minCount})`);
  for (const m of [...bad, ...out]) fails.push(`${name}: ${m}`);
  if (!bad.length && !out.length && L.length >= minCount) oks.push(`${name} 縮放 ${snap.scale}:${L.length} 個名牌,間隙 ≥ ${MIN_GAP}px、都在畫布內`);
}
const click = (page, a) => page.evaluate(a => document.querySelector(`[data-action=${a}]`)?.click(), a);

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });
async function open(opt) {
  const page = await (await browser.newContext({ ...opt, locale: 'zh-TW' })).newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(String(e).slice(0, 160)));
  await page.goto(url, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && globalThis.__mistvaleMapLabels && !document.querySelector('#loading'), null, { timeout: 180000 });
  return page;
}
async function done(page, name) { if (page.errs.length) fails.push(`${name}: 頁面錯誤 ${page.errs[0]}`); await page.context().close(); }
try {
  for (const w of [1024, 1440]) {
    const name = `${w}x${w === 1024 ? 768 : 900}`, page = await open(DESK(w));
    judge(`${name} 預設`, await stable(page, 10), 10);
    for (let step = 1; step <= 5; step++) {   // 逐階拉遠,名牌在設計上會在縮放 ≤1.12 時隱藏
      await click(page, 'zoomOut');
      const snap = await stable(page);
      if (!snap.labels.length) break;
      judge(`${name} 拉遠 ${step} 階`, snap);
    }
    await done(page, name);
  }
  {
    const page = await open(DESK(1024));
    await page.evaluate(() => { const g = globalThis.__mistvaleGame; for (const id of Object.keys(g.state.buildings)) g.state.buildings[id] = Math.max(1, g.state.buildings[id]); });
    judge('1024x768 全部建築 Lv.1', await stable(page, 10), 10);
    // 選取中央的城鎮大廳:名牌展開成「城鎮大廳 Lv.N」,釘在原位,周圍名牌要讓開
    await page.evaluate(() => { const el = document.createElement('button'); el.dataset.action = 'selectBuilding'; el.dataset.id = 'hall'; document.body.append(el); el.click(); el.remove(); });
    const sel = await stable(page, 10);
    if (!sel.labels.some(l => /^城鎮大廳 Lv\.\d/.test(l.text))) fails.push('1024x768 選取城鎮大廳:名牌沒有展開成「城鎮大廳 Lv.N」');
    judge('1024x768 選取城鎮大廳', sel, 10);
    await done(page, '1024x768 全部建築');
  }
  {
    const page = await open(PHONE);
    judge('手機 390x844 預設', await stable(page));
    let shown = 0;
    for (let step = 1; step <= 8 && shown < 2; step++) {
      await click(page, 'zoomIn');
      const snap = await stable(page);
      if (snap.labels.length) { shown++; judge(`手機 390x844 拉近 ${step} 階`, snap); }
    }
    await done(page, '手機');
  }
} finally {
  await browser.close();
  server?.kill();
}
for (const m of oks) console.log('PASS  ' + m);
for (const m of fails) console.log('FIX   ' + m);
process.exit(fails.length ? 1 : 0);
