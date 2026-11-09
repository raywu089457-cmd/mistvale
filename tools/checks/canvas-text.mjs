// canvas-text.mjs — T119：canvas 上的文字也改用像素字型（建築標籤／對話泡泡／小地圖區域名／傷害數字）
//   像素字型要落在設計尺寸（12／24／36）才清楚，所以世界用 textSize() 把字級吸到整數倍，
//   再交給 textFont() 組字串。這支檢查器：
//     (1) textSize/textFont 的吸附規則
//     (2) 實際渲染時，canvas 的 ctx.font 真的都是 "Ark Pixel 12" 與 12/24/36px
//     (3) src 裡不再有硬寫 "Microsoft JhengHei"（除了 fallback）
//     (4) 字型真的載入完成
// Usage: node tools/checks/canvas-text.mjs        (game server on 5024 expected)
//        $env:SHOTS='1'; node tools/checks/canvas-text.mjs
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const fails = [], oks = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/canvas-text', { recursive: true });

// (3) 原始碼：canvas 的 font 賦值不能再硬討系統字型
for (const f of ['src/pixel-world.js', 'src/pixel-ui.js', 'src/pixel-game.js']) {
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((l, i) => {
    if (!/(?:ctx|screen|g)\.font\s*=/.test(l)) return;
    if (!l.includes('Ark Pixel 12') && !l.includes('textFont(')) fix(`${f}:${i + 1} 的 canvas font 還沒有指定像素字型`);
  });
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-TW' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });

// 字型真的載入完成
const fontState = await page.evaluate(async () => {
  try { await document.fonts.ready; } catch {}
  return {
    check: document.fonts.check('12px "Ark Pixel 12"'),
    status: document.fonts.status,
    faces: [...document.fonts].filter(f => /Ark Pixel/.test(f.family)).map(f => `${f.family}:${f.status}`),
  };
});
if (!fontState.check) fix(`document.fonts.check('12px "Ark Pixel 12"') 是 false（faces: ${fontState.faces.join(',') || '無'}）`);
else ok(`像素字型已載入（${fontState.faces.join(' / ')}）`);

// (1) 吸附規則
const snap = await page.evaluate(() => {
  const v = globalThis.__mistvaleView;
  if (!v || typeof v.textSize !== 'function') return null;
  return {
    cases: [8, 11, 13, 17, 20, 24, 30, 37, 48].map(n => [n, v.textSize(n)]),
    font13: v.textFont(13),
    font30: v.textFont(30),
    normal: v.textFont(12, 'normal'),
  };
});
if (!snap) fix('createPixelWorld 沒有匯出 textSize/textFont');
else {
  const want = { 8: 12, 11: 12, 13: 12, 17: 12, 20: 24, 24: 24, 30: 24, 37: 36, 48: 36 };
  for (const [n, got] of snap.cases) if (got !== want[n]) fix(`textSize(${n}) = ${got}，預期 ${want[n]}`);
  if (!/^bold 12px "Ark Pixel 12"/.test(snap.font13)) fix(`textFont(13) = ${snap.font13}`);
  if (!/^bold 24px "Ark Pixel 12"/.test(snap.font30)) fix(`textFont(30) = ${snap.font30}`);
  if (!/^normal 12px "Ark Pixel 12"/.test(snap.normal)) fix(`textFont(12,'normal') = ${snap.normal}`);
  if (!fails.length) ok('textSize 把 8–48px 吸到 12/24/36，textFont 產生 "Ark Pixel 12" 字串');
}

// (2) 實際渲染：攔截 canvas font 賦值，收集實際用到的字型字串
await page.evaluate(() => {
  globalThis.__fontLog = new Set();
  const d = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'font');
  if (d && d.set) {
    Object.defineProperty(CanvasRenderingContext2D.prototype, 'font', {
      configurable: true,
      get: d.get,
      set(v) { try { globalThis.__fontLog.add(String(v)); } catch {} return d.set.call(this, v); },
    });
  }
});
// 讓世界至少畫幾幀（建築標籤／區域文字）
await page.waitForTimeout(1200);
const used = await page.evaluate(() => [...globalThis.__fontLog]);
const pixel = used.filter(f => /Ark Pixel 12/.test(f));
const bad = used.filter(f => !/Ark Pixel 12/.test(f));
if (!used.length) fix('這一幀沒有任何 canvas 文字被畫出來（攔截不到 font 賦值）');
if (bad.length) fix(`${bad.length} 種 canvas 字型沒有用像素字型：${bad.slice(0, 3).join(' | ')}`);
const sizes = pixel.map(f => Number((f.match(/(\d+)px/) || [])[1])).filter(Boolean);
const offSize = sizes.filter(s => ![12, 24, 36].includes(s));
if (offSize.length) fix(`canvas 字級不在 12/24/36：${[...new Set(offSize)].join(',')}px（像素字型會糊）`);
if (!bad.length && !offSize.length && used.length) ok(`canvas 實際使用 ${pixel.length} 種像素字型字串、字級 ${[...new Set(sizes)].sort((a, b) => a - b).join('/')}px，沒有殘留系統字型`);

if (process.env.SHOTS) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'output/canvas-text/hud-1440.png' });
  // 逼出對話泡泡與傷害數字：把一隻獵人拉到鏡頭前攻擊
  await page.evaluate(() => {
    const g = globalThis.__mistvaleGame, v = globalThis.__mistvaleView;
    g.state.paused = true;
    try { v.lookAt(-15, 3, 1.1); } catch {}
    g.state.hunters[0].x = -15; g.state.hunters[0].z = 3;
    globalThis.__fontLog && globalThis.__fontLog.clear();
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'output/canvas-text/labels-1440.png' });
}

if (errs.length) fix(`頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
await browser.close();

if (fails.length) {
  for (const f of fails) console.log('FIX ' + f);
  for (const o of oks) console.log('ok  ' + o);
  process.exit(1);
}
for (const o of oks) console.log('ok  ' + o);
console.log('PASS canvas text: 世界裡的文字（建築標籤／對話泡泡／小地圖區域名／傷害數字）都改用 Ark Pixel 12，字級吸到 12/24/36，實際渲染時沒有殘留系統字型');
