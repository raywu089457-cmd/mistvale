// hv-gap-title.mjs — 開場標題畫面(#title-screen)與讀取畫面(#loading)截圖＋量測。用法: node hv-gap-title.mjs  (非 preview 模式,乾淨 context)
import { createRequire } from 'module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');
const OUT = path.resolve('output/ui-audit/round2/shots');
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] });
const res = {};
for (const [w, h] of [[1440, 900], [390, 844], [844, 390]]) {
  const phone = Math.min(w, h) < 600; const tag = `${w}x${h}`;
  const ctx = await b.newContext(phone ? { viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:5186/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  fs.mkdirSync(path.join(OUT, tag), { recursive: true });
  let gotLoading = false;
  for (let i = 0; i < 40 && !gotLoading; i++) { gotLoading = await page.evaluate(() => { const l = document.querySelector('#loading'); return !!l && !l.classList.contains('done') && getComputedStyle(l).opacity > 0.9; }).catch(() => false); if (!gotLoading) await page.waitForTimeout(50); }
  if (gotLoading) await page.screenshot({ path: path.join(OUT, tag, 'loading.png') });
  await page.waitForSelector('#title-screen', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, tag, 'title.png') });
  res[tag] = await page.evaluate(() => {
    const t = document.querySelector('#title-screen'); if (!t) return { title: null };
    const q = s => { const e = t.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return { w: Math.round(r.width), h: Math.round(r.height), px: +(parseFloat(cs.fontSize) * (e.currentCSSZoom || 1)).toFixed(1), font: cs.fontFamily.split(',')[0], color: cs.color, bg: cs.backgroundColor }; };
    const cs = getComputedStyle(t);
    return { title: { bg: cs.backgroundColor, bgImg: cs.backgroundImage.slice(0, 50), inner: q('.ts-inner'), titleFont: q('.ts-title'), sub: q('.ts-sub'), save: q('.ts-save'), meta: q('.ts-meta'), hint: q('.ts-hint'), btns: [...t.querySelectorAll('button')].map(b => { const r = b.getBoundingClientRect(), c = getComputedStyle(b); return { t: b.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height), bg: c.backgroundColor, radius: c.borderTopLeftRadius, color: c.color }; }) }, loadingShot: true };
  });
  res[tag].gotLoading = gotLoading;
  // 進入:點畫面 → 第一次玩會出現 welcome 對話
  await page.evaluate(() => document.querySelector('#title-screen [data-ts=continue]')?.click());
  await page.waitForTimeout(1800);
  await page.screenshot({ path: path.join(OUT, tag, 'after-title.png') });
  await ctx.close();
}
fs.writeFileSync('output/ui-audit/round2/data/title.json', JSON.stringify(res, null, 1));
await b.close();
console.log(JSON.stringify(res).slice(0, 3000));
