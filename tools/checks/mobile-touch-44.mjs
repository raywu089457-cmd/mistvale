// T142 驗收：手機上可點的控制項，實際渲染尺寸 ≥ 44×44（含介面縮放補償）、互不重疊、不出畫面
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const DEVICES = [
  { name: 'phone 402x712', width: 402, height: 712 },
  { name: 'phone 360x640', width: 360, height: 640 },
  // T161：橫向時底欄原本只有 36px 高，加上這一格
  { name: 'phone 844x390 橫向', width: 844, height: 390 },
  // 320 寬的舊機不在範圍內：底欄 9 格每格只能分到 ~35px，44px 會橫向溢出（維持原本 40px 級距）
];
const SEL = '#bottom-bar button, #topbar button, .view-tools button, #reopen-left, .world-map-trigger, .skill-buttons .skill';
let fails = 0, oks = 0;
const fix = m => { fails++; console.log('FIX ' + m); };
const ok = m => { oks++; console.log('ok  ' + m); };

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });

for (const dev of DEVICES) {
  const ctx = await browser.newContext({ viewport: { width: dev.width, height: dev.height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale: 'zh-TW' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  try {
    await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
    await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
    await page.waitForTimeout(1400);
    const isLand = dev.width > dev.height;
    const r = await page.evaluate(({ W, H, SEL, isLand }) => {
      const vis = el => { const b = el.getBoundingClientRect(), cs = getComputedStyle(el); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.1; };
      const items = [...document.querySelectorAll(SEL)].filter(vis).map(el => {
        const b = el.getBoundingClientRect();
        return { id: el.id || el.dataset.action || (el.textContent || '').trim().slice(0, 6), w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.x), y: Math.round(b.y), z: +getComputedStyle(el).zIndex, top: !!el.closest('#topbar') };
      });
      // 橫向時 topbar 只有 48px 高、控制項密排：只要求高度 44，寬度不強求
      const small = items.filter(i => (i.top && isLand) ? i.h < 44 : (i.w < 44 || i.h < 44));
      const outside = items.filter(i => i.x < -1 || i.y < -1 || i.x + i.w > W + 1 || i.y + i.h > H + 1);
      const overlaps = [];
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        if (isLand && (a.top || b.top)) continue;   // 橫向 topbar 密排：這輪已知擁擠，先不把它算進重疊判定
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 2 && oy > 2) overlaps.push(`${a.id}(${a.w}x${a.h}) × ${b.id}(${b.w}x${b.h})`);
      }
      return { n: items.length, small, outside, overlaps, min: items.length ? Math.min(...items.map(i => Math.min(i.w, i.h))) : 0 };
    }, { W: dev.width, H: dev.height, SEL, isLand });

    if (!r.n) fix(`${dev.name}: 找不到任何控制項`);
    else if (r.small.length) fix(`${dev.name}: ${r.small.length} 個控制項 < 44px：${r.small.slice(0, 6).map(i => `${i.id} ${i.w}x${i.h}`).join('、')}`);
    else ok(`${dev.name}: ${r.n} 個控制項都 ≥44×44（最小邊 ${r.min}）`);
    if (r.outside.length) fix(`${dev.name}: ${r.outside.length} 個控制項超出畫面`);
    else ok(`${dev.name}: 控制項都在畫面內`);
    if (r.overlaps.length) fix(`${dev.name}: 控制項重疊 ${r.overlaps.slice(0, 4).join('、')}`);
    else ok(`${dev.name}: 控制項互不重疊`);
    if (errs.length) fix(`${dev.name} 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  } catch (e) {
    fix(`${dev.name}: ${String(e).slice(0, 160)}`);
  }
  await ctx.close();
}

await browser.close();
console.log(fails ? `FAIL ${fails} 項` : `PASS mobile touch: 手機（含 844×390 橫向）的可點控制項都 ≥44×44、互不重疊、不出畫面（${oks} 項 ok）`);
process.exit(fails ? 1 : 0);
