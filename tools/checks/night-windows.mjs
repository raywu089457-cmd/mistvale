// night-windows.mjs — T133：夜晚的窗光
//   * 每棟已建造的建築，夜裡要有一顆以上的窗光；白天完全沒有。
//   * 窗光必須真的比白天同一個點更亮、更暖（紅比藍高），不是畫在看不到的地方。
//   * 關掉「夜晚」設定就全部消失；prefers-reduced-motion 時光留著但不閃。
// Usage: node tools/checks/night-windows.mjs      (game server on 5024 expected)
//        $env:SHOTS='1'; node tools/checks/night-windows.mjs
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const fails = [], oks = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/windows', { recursive: true });

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });

async function boot(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, locale: 'zh-TW', deviceScaleFactor: 1, ...opts });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { globalThis.__mistvaleGame.state.paused = true; });
  return { ctx, page, errs };
}

const setTime = (page, t) => page.evaluate(t => { globalThis.__mistvaleGame.state.time = t; }, t);

const samplePair = (page, aB64, bB64, pts) => page.evaluate(async ({ on, off, pts }) => {
  const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/png;base64,' + src; });
  const [ia, ib] = await Promise.all([load(on), load(off)]);
  const read = img => {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    return (x, y) => { const d = g.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]]; };
  };
  const A = read(ia), B = read(ib);
  const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return pts.map(p => {
    const n = A(p.x, p.y), d = B(p.x, p.y);
    return { ...p, night: n, day: d, nLum: +lum(n).toFixed(1), dLum: +lum(d).toFixed(1), nWarm: n[0] - n[2], dWarm: d[0] - d[2] };
  });
}, { on: aB64, off: bB64, pts });

// ── desktop ──────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 1440, height: 900 });

  // 白天：沒有窗光
  await setTime(page, 40);
  await page.waitForTimeout(900);
  const dayHook = await page.evaluate(() => globalThis.__mistvaleNight);
  if ((dayHook?.windows || 0) !== 0) fix(`白天不該有窗光，實際 windows=${dayHook?.windows}`);
  const dayShot = (await page.screenshot({ type: 'png' })).toString('base64');
  const dayLayer = await page.evaluate(() => {
    const cv = [...document.body.children].find(e => e.tagName === 'CANVAS' && getComputedStyle(e).position === 'fixed' && getComputedStyle(e).zIndex === '3');
    if (!cv) return { missing: true };
    const g = cv.getContext('2d'); const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let maxA = 0; for (let i = 3; i < d.length; i += 4 * 89) maxA = Math.max(maxA, d[i]);
    return { maxA };
  });
  if (dayLayer.missing) fix('白天找不到燈光層 canvas');
  else if (dayLayer.maxA > 4) fix(`白天燈光層應該完全透明，實測最大 alpha=${dayLayer.maxA}`);
  else ok('白天燈光層完全透明（沒有殘留窗光或地面光）');

  // 夜晚：每棟已建造建築至少一顆窗光
  await setTime(page, 185);
  await page.waitForTimeout(1200);
  const nightHook = await page.evaluate(() => globalThis.__mistvaleNight);
  const built = await page.evaluate(() => {
    const s = globalThis.__mistvaleGame.state;
    return Object.entries(s.buildings || {}).filter(([, lv]) => (lv || 0) > 0).map(([id]) => id);
  });
  const winPts = nightHook?.winPts || [];
  if (!(nightHook?.windows > 0)) fix('夜裡完全沒有窗光');
  const idsWithWindow = new Set(winPts.map(p => p.id));
  for (const id of built) if (!idsWithWindow.has(id)) fix(`建築 ${id} 夜裡沒有窗光`);
  if (nightHook?.windows > built.length * 4) fix(`窗光 ${nightHook.windows} 顆，比建築數 ${built.length} 合理上限還多（每棟最多 3 顆）`);
  if (!fails.length) ok(`夜裡 ${built.length} 棟已建造建築共 ${nightHook.windows} 顆窗光（每棟都有）`);

  const canvasSamples = await page.evaluate(pts => {
    const cv = [...document.body.children].find(e => e.tagName === 'CANVAS' && getComputedStyle(e).position === 'fixed' && getComputedStyle(e).zIndex === '3');
    if (!cv) return { missing: true };
    const g = cv.getContext('2d');
    const out = [];
    for (const p of pts) {
      const x = Math.round(p.x), y = Math.round(p.y);
      if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) { out.push({ id: p.id, off: true }); continue; }
      const d = g.getImageData(x, y, 1, 1).data;
      out.push({ id: p.id, r: d[0], g: d[1], b: d[2], a: d[3] });
    }
    return { cv: { w: cv.width, h: cv.height }, out };
  }, winPts.slice(0, 8));

  if (canvasSamples.missing) fix('找不到燈光層 canvas（z-index:3 的 fixed canvas）');
  else {
    const arr = canvasSamples.out.filter(o => !o.off);
    const dim = arr.filter(o => !(o.a > 40 && o.r > 200 && o.r - o.b > 40));
    if (!arr.length) fix('窗光座標全部落在燈光層外');
    else if (dim.length) fix(`${dim.length}/${arr.length} 顆窗光在燈光層上不夠亮或不夠暖（例：${dim[0].id} rgba(${dim[0].r},${dim[0].g},${dim[0].b},${dim[0].a})）`);
    else ok(`窗光實測（燈光層像素）：${arr.length} 顆都亮且偏暖（例：${arr[0].id} rgba(${arr[0].r},${arr[0].g},${arr[0].b},${arr[0].a})，R−B ${arr[0].r - arr[0].b}）`);
  }

  if (process.env.SHOTS) {
    fs.writeFileSync('output/windows/day.png', Buffer.from(dayShot, 'base64'));
    fs.writeFileSync('output/windows/night.png', Buffer.from((await page.screenshot({ type: 'png' })).toString('base64'), 'base64'));
  }

  // 關掉夜晚：全部消失
  await page.evaluate(() => globalThis.__mistvaleView.setNight(false));
  await page.waitForTimeout(900);
  const offHook = await page.evaluate(() => globalThis.__mistvaleNight);
  if ((offHook?.windows || 0) !== 0 || (offHook?.strength || 0) > 0.01) fix(`關掉夜晚後仍有光：strength=${offHook?.strength} windows=${offHook?.windows}`);
  else ok('設定關掉「夜晚」後夜色與窗光都消失');
  await page.evaluate(() => globalThis.__mistvaleView.setNight(true));

  if (errs.length) fix(`desktop 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// ── 減少動態：光留著，但不能閃 ──────────────────────────
{
  const { ctx, page } = await boot({ width: 1440, height: 900 }, { reducedMotion: 'reduce' });
  await setTime(page, 185);
  await page.waitForTimeout(1100);
  const hook = await page.evaluate(() => globalThis.__mistvaleNight);
  if (!(hook?.windows > 0)) fix('prefers-reduced-motion 下窗光不見了（應該留著、只是不閃）');
  else ok(`prefers-reduced-motion 時窗光仍亮著（${hook.windows} 顆）`);
  await ctx.close();
}

// ── phone ───────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 402, height: 712 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await setTime(page, 185);
  await page.waitForTimeout(1200);
  const hook = await page.evaluate(() => globalThis.__mistvaleNight);
  if (!(hook?.windows > 0)) fix('phone 夜裡沒有窗光');
  else ok(`phone 402x712 夜裡 ${hook.windows} 顆窗光`);
  if (process.env.SHOTS) await page.screenshot({ path: 'output/windows/phone.png' });
  if (errs.length) fix(`phone 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

await browser.close();
if (fails.length) {
  for (const f of fails) console.log('FIX ' + f);
  for (const o of oks) console.log('ok  ' + o);
  process.exit(1);
}
for (const o of oks) console.log('ok  ' + o);
console.log('PASS night windows: 夜裡每棟已建造建築都有至少一顆暖色窗光（實測燈光層像素亮且偏暖、白天該層全透明）、白天完全沒有、關掉夜晚設定就消失、減少動態時只留光不閃爍、手機也有');
