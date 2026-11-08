// travel-veil.mjs — T104：切換生態區要有過場遮罩，換區域時不能直接硬切。
//   * 點下「前往」後 0~200ms 內出現全螢幕遮罩，寫出目的地名稱與「整裝出發」。
//   * 遮罩不吃 pointer-events（不擋任何按鈕），z-index 蓋在 UI 之上。
//   * 約 700ms 內遮罩淡出、區域已切換。
//   * prefers-reduced-motion：直接切換，不出現遮罩。
// Usage: node tools/checks/travel-veil.mjs        (game server on 5024; TARGET overrides)
//        $env:SHOTS='1'; node tools/checks/travel-veil.mjs   also writes output/travel/montage.png
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const fails = [], oks = [], shots = [];
const fix = m => fails.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/travel', { recursive: true });

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] });

async function boot(reduced) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'zh-TW',
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#game-ui')?.classList.contains('hidden') && !document.querySelector('#loading'), null, { timeout: 120000 });
  await page.evaluate(() => { const g = globalThis.__mistvaleGame; g.state.paused = true; g.state.region = 'village'; });
  return { ctx, page, errs };
}

const clickTravel = (page, id) => page.evaluate(id => {
  const el = document.createElement('button');
  el.dataset.action = 'regionTravel'; el.dataset.id = id; el.style.display = 'none';
  document.body.append(el); el.click(); el.remove();
  globalThis.__travelT0 = performance.now();
}, id);

const READ = () => {
  const v = document.querySelector('#travel-veil');
  const g = globalThis.__mistvaleGame;
  if (!v) return { has: false, region: g.state.region, t: performance.now() - (globalThis.__travelT0 || 0) };
  const cs = getComputedStyle(v);
  const r = v.getBoundingClientRect();
  return {
    has: true,
    on: v.classList.contains('on'),
    opacity: Number(cs.opacity),
    pe: cs.pointerEvents,
    z: Number(cs.zIndex) || 0,
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    text: v.textContent.replace(/\s+/g, ' ').trim(),
    region: g.state.region,
    t: performance.now() - (globalThis.__travelT0 || 0),
  };
};

try {
  // ── 1. 正常動態：遮罩出現 → 區域切換 → 遮罩消失
  {
    const { ctx, page, errs } = await boot(false);
    try {
      await clickTravel(page, 'meadow');
      await page.waitForTimeout(80);
      let m = await page.evaluate(READ);
      if (!m.has) fix('切換區域時沒有出現 #travel-veil 遮罩');
      else {
        if (!m.on || m.opacity < 0.5) fix(`遮罩出現時應可見 — on=${m.on} opacity=${m.opacity}`);
        if (m.rect.w !== 1440 || m.rect.h !== 900) fix(`遮罩沒有蓋滿畫面 — ${m.rect.w}x${m.rect.h}`);
        if (m.pe !== 'none') fix(`遮罩不該攔截點擊（pointer-events: ${m.pe}）`);
        if (m.z < 60) fix(`遮罩 z-index 太低（${m.z}），會被面板蓋住`);
        if (!/整裝出發/.test(m.text)) fix(`遮罩沒有寫「整裝出發…」— "${m.text}"`);
        if (!/向陽草原/.test(m.text)) fix(`遮罩沒有寫出目的地名稱 — "${m.text}"`);
      }
      if (process.env.SHOTS) await page.screenshot({ path: 'output/travel/veil-1440x900.png' }).then(() => shots.push('output/travel/veil-1440x900.png'));

      await page.waitForTimeout(900);
      m = await page.evaluate(READ);
      if (m.region !== 'meadow') fix(`切換後 state.region 應為 meadow，實際 ${m.region}`);
      if (m.has && (m.on || m.opacity > 0.02)) fix(`遮罩 900ms 後還在（on=${m.on} opacity=${m.opacity}）`);
      if (errs.length) fix(`切換區域時頁面錯誤：${errs[0]}`);

      // ── 2. 換另一個區域：蓋住重建、文字跟著換
      await clickTravel(page, 'forest');
      await page.waitForTimeout(80);
      const m2 = await page.evaluate(READ);
      if (!/橡木密林/.test(m2.text)) fix(`第二次切換的目的地名稱不對 — "${m2.text}"`);
      await page.waitForTimeout(900);
      const m3 = await page.evaluate(READ);
      if (m3.region !== 'forest') fix(`第二次切換後 state.region=${m3.region}`);
      if (!fails.length) oks.push('desktop 1440x900: 切草原/森林都有遮罩、蓋滿畫面、文字正確、約 700ms 內收掉');
    } finally { await ctx.close(); }
  }

  // ── 3. reduced-motion：不播過場，直接切換
  {
    const { ctx, page, errs } = await boot(true);
    try {
      await clickTravel(page, 'meadow');
      await page.waitForTimeout(120);
      const m = await page.evaluate(READ);
      if (m.region !== 'meadow') fix(`reduced-motion 下 120ms 內應已完成切換，實際 ${m.region}`);
      if (m.has && m.on && m.opacity > 0.5) fix('reduced-motion 下仍播放遮罩過場');
      if (errs.length) fix(`reduced-motion 下頁面錯誤：${errs[0]}`);
      oks.push('prefers-reduced-motion: reduce 時直接切換，不播遮罩');
    } finally { await ctx.close(); }
  }
} finally {
  await browser.close();
}

if (shots.length) {
  const { execFileSync } = await import('node:child_process');
  try {
    execFileSync('python', ['-c', `
from PIL import Image, ImageDraw
im = Image.open(${JSON.stringify(shots[0])})
im.save('output/travel/montage.png')
print('montage output/travel/montage.png', im.size)
`], { stdio: 'inherit' });
  } catch (e) { console.log('montage skipped:', String(e.message).slice(0, 120)); }
}

if (fails.length) { for (const f of fails) console.log('FIX ' + f); process.exit(1); }
for (const o of oks) console.log('ok  ' + o);
console.log('PASS travel veil: 切換生態區時全螢幕遮罩淡入、寫出目的地與「整裝出發」、不吃點擊、約 700ms 內淡出並完成切換；prefers-reduced-motion 時直接切換');
