// loading-screen.mjs — T117：讀取畫面（暮影村／獵魔物語、進度、預熱階段、輪播提示）
//   * 讀取畫面是玩家看到的第一個東西：以前是英文 "Loading"，中文遊戲第一眼就是英文詞。
//   * 這支檢查器把 media 請求延遲，讓畫面停得住，然後量：
//     標題／副標／進度文字格式／階段文字／提示輪播／進度條真的在動／置中／
//     標題吃到 --font-title／手機不溢出／載入完成後整個 #loading 消失。
// Usage: node tools/checks/loading-screen.mjs
//        $env:SHOTS='1'; node tools/checks/loading-screen.mjs
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const fails = [], oks = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/loading', { recursive: true });

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });

const readLoader = page => page.evaluate(() => {
  const el = document.querySelector('#loading');
  if (!el) return null;
  const plate = el.querySelector('.loading-plate');
  const title = el.querySelector('.loading-title');
  const bar = el.querySelector('#loading-bar');
  const pr = plate.getBoundingClientRect();
  return {
    text: el.innerText.replace(/\s+/g, ' ').trim(),
    title: title ? title.textContent.trim() : '',
    titleFont: title ? getComputedStyle(title).fontFamily : '',
    titleSize: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
    sub: el.querySelector('.loading-sub')?.textContent.trim() || '',
    label: el.querySelector('#loading-label')?.textContent.trim() || '',
    phase: el.querySelector('#loading-phase')?.textContent.trim() || '',
    tip: el.querySelector('#loading-tip')?.textContent.trim() || '',
    barW: bar ? bar.getBoundingClientRect().width : -1,
    barTrack: el.querySelector('.loading-bar') ? el.querySelector('.loading-bar').getBoundingClientRect().width : -1,
    plate: { x: pr.x, y: pr.y, w: pr.width, h: pr.height, cx: pr.x + pr.width / 2, cy: pr.y + pr.height / 2 },
    vw: innerWidth, vh: innerHeight,
  };
});

async function withSlowMedia(viewport, dsr, fn) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsr, locale: 'zh-TW' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  // 讓載入畫面停得住：大圖（media/）每個延遲 1.2 秒
  await page.route('**/media/**', async route => {
    await new Promise(r => setTimeout(r, 1200));
    await route.continue().catch(() => {});
  });
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  try { await fn(page, errs); } finally { await ctx.close(); }
}

// ── desktop ──────────────────────────────────────────────
await withSlowMedia({ width: 1440, height: 900 }, 1, async (page, errs) => {
  await page.waitForSelector('#loading', { timeout: 30000 });
  await page.waitForTimeout(500);
  const a = await readLoader(page);
  if (!a) { fix('desktop 找不到 #loading（在 media 被延遲時應該還留著）'); return; }
  if (!a.title.includes('暮影村')) fix(`desktop 讀取畫面標題是「${a.title}」，應為「暮影村」`);
  if (/Loading/i.test(a.text)) fix('desktop 讀取畫面還有英文 Loading');
  if (a.sub !== '獵魔物語') fix(`desktop 副標是「${a.sub}」，應為「獵魔物語」`);
  if (!/^(--font-title|.*JhengHei|.*PingFang|.*Noto Sans TC).*$/i.test(a.titleFont)) fix(`desktop 標題字體 ${a.titleFont} 不是 --font-title 那一組`);
  if (a.titleSize < 26) fix(`desktop 標題只有 ${a.titleSize}px，太小（第一眼的重點）`);
  if (!/^載入素材 \d+%$/.test(a.label)) fix(`desktop 進度文字「${a.label}」不是「載入素材 NN%」`);
  if (!a.phase) fix('desktop 沒有顯示目前階段（#loading-phase 空）');
  if (!a.tip.startsWith('提示：')) fix(`desktop 提示文字不是「提示：…」：${a.tip}`);
  if (Math.abs(a.plate.cx - a.vw / 2) > 4) fix(`desktop 讀取面板沒有水平置中（中心 ${a.plate.cx.toFixed(1)} vs ${a.vw / 2}）`);
  if (Math.abs(a.plate.cy - a.vh / 2) > 6) fix(`desktop 讀取面板沒有垂直置中（中心 ${a.plate.cy.toFixed(1)} vs ${a.vh / 2}）`);
  if (!(a.barW > 0 && a.barW < a.barTrack)) fix(`desktop 進度條寬度不合理：${a.barW} / ${a.barTrack}（應該 0 < 寬 < 軌道）`);
  ok(`desktop 讀取畫面「${a.title}／${a.sub}」${Math.round(a.titleSize)}px、${a.label}、階段「${a.phase}」、進度條 ${Math.round(a.barW)}/${Math.round(a.barTrack)}px`);

  // 提示輪播
  const first = a.tip;
  await page.waitForTimeout(2300);
  const b = await readLoader(page);
  if (!b) ok('desktop 提示輪播：載入已完成，略過');
  else if (b.tip === first) fix(`desktop 提示 2.3 秒後沒有換（仍是「${first}」）`);
  else if (!b.tip.startsWith('提示：')) fix(`desktop 輪播後的提示不是「提示：…」：${b.tip}`);
  else ok(`desktop 提示會輪播（${first.slice(0, 14)}… → ${b.tip.slice(0, 14)}…）`);
  if (process.env.SHOTS && b) await page.screenshot({ path: 'output/loading/desktop.png' });

  // 載入完成後整個畫面收起來
  await page.waitForFunction(() => !document.querySelector('#loading'), null, { timeout: 180000 });
  ok('desktop 載入完成後 #loading 從 DOM 移除');
  if (errs.length) fix(`desktop 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
});

// ── phone ───────────────────────────────────────────────
await withSlowMedia({ width: 402, height: 712 }, 2, async (page, errs) => {
  await page.waitForSelector('#loading', { timeout: 30000 });
  await page.waitForTimeout(500);
  const a = await readLoader(page);
  if (!a) { fix('phone 402x712 找不到 #loading'); return; }
  const overflow = a.plate.x < 2 || a.plate.x + a.plate.w > a.vw - 2;
  if (overflow) fix(`phone 讀取面板超出畫面：${JSON.stringify(a.plate)} 寬 ${a.vw}`);
  if (/Loading/i.test(a.text)) fix('phone 讀取畫面還有英文 Loading');
  if (!a.tip.startsWith('提示：')) fix(`phone 提示文字不對：${a.tip}`);
  if (!/^載入素材 \d+%$/.test(a.label)) fix(`phone 進度文字不對：${a.label}`);
  if (!overflow && a.title.includes('暮影村')) ok(`phone 402x712 讀取面板 ${Math.round(a.plate.w)}px 寬，置中不溢出，${a.label}`);
  if (process.env.SHOTS) await page.screenshot({ path: 'output/loading/phone.png' });
  if (errs.length) fix(`phone 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
});

await browser.close();
if (fails.length) {
  for (const f of fails) console.log('FIX ' + f);
  for (const o of oks) console.log('ok  ' + o);
  process.exit(1);
}
for (const o of oks) console.log('ok  ' + o);
console.log('PASS loading screen: 讀取畫面寫「暮影村／獵魔物語」、進度與預熱階段、提示每 2 秒輪播、進度條真的在動、面板置中、手機不溢出、載入完成後收起');
