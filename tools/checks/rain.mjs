// rain.mjs — T135：溫帶生態圈的雨天（雨絲＋濕氣疊層）
//   * 天氣由 state.time 決定（同一個時間一定同樣天氣），不是隨機。
//   * 雪地不下雨（那裡本來就下雪）、減少動態時不下雨。
//   * 濕氣層只是 DOM 疊層：不能吃點擊、不能蓋住 HUD。
// Usage: node tools/checks/rain.mjs
//        $env:SHOTS='1'; node tools/checks/rain.mjs
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'node:module';
import { REGIONS } from '../../src/overworld.js';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const fails = [], oks = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/rain', { recursive: true });

const WET_T = 10, DRY_T = 60;   // sin(time*0.037+1.7) 在 10 秒是溼的、60 秒是乾的；兩者都是白天
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });

async function boot(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, locale: 'zh-TW', deviceScaleFactor: 1, ...opts });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
  await page.waitForTimeout(1500);
  return { ctx, page, errs };
}
const setTime = async (page, t, wait = 800) => {
  await page.evaluate(v => { const s = globalThis.__mistvaleGame.state; s.paused = true; s.time = v; }, t);
  await page.waitForTimeout(wait);   // 濕氣層有 1.2s 的 CSS 淡出，要等它走完
};
const rainState = page => page.evaluate(() => {
  const t = document.querySelector('#rain-tint');
  return {
    r: globalThis.__mistvaleRain || null,
    tint: t ? { opacity: parseFloat(getComputedStyle(t).opacity), z: getComputedStyle(t).zIndex, pe: getComputedStyle(t).pointerEvents } : null,
  };
});

// ── desktop ──────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 1440, height: 900 });

  await setTime(page, WET_T);
  const wet = await rainState(page);
  const wetShot = (await page.screenshot({ type: 'png' })).toString('base64');
  if (!wet.r) fix('沒有 __mistvaleRain 除錯鉤子');
  else {
    if (!wet.r.on) fix(`雨天時間（${WET_T}s）沒有下雨：${JSON.stringify(wet.r)}`);
    if (wet.r.drops < 100) fix(`雨絲只有 ${wet.r.drops} 條，看起來不會像雨`);
  }
  if (!wet.tint) fix('沒有 #rain-tint 濕氣層');
  else {
    if (wet.tint.opacity < 0.9) fix(`下雨時濕氣層透明度只有 ${wet.tint.opacity}`);
    if (wet.tint.z !== '1') fix(`濕氣層 z-index=${wet.tint.z}，應為 1（世界之上、HUD 之下）`);
    if (wet.tint.pe !== 'none') fix(`濕氣層 pointer-events=${wet.tint.pe}，會擋住點擊`);
  }

  // 雨絲會動：暫停時世界不推進，先恢復再取第二張
  await page.evaluate(() => { globalThis.__mistvaleGame.state.paused = false; });
  await page.waitForTimeout(200);
  const wetShot2 = (await page.screenshot({ type: 'png' })).toString('base64');
  await page.evaluate(v => { const s = globalThis.__mistvaleGame.state; s.paused = true; s.time = v; }, WET_T);

  await setTime(page, DRY_T, 1700);
  const dry = await rainState(page);
  const dryShot = (await page.screenshot({ type: 'png' })).toString('base64');
  if (dry.r?.on) fix(`乾的時間（${DRY_T}s）仍在下雨`);
  if (dry.r?.drops) fix(`乾的時間還有 ${dry.r.drops} 條雨絲`);
  if (dry.tint && dry.tint.opacity > 0.05) fix(`乾的時間濕氣層仍不透明（${dry.tint.opacity}）`);

  // 用同一頁的 canvas 比對像素：雨天 vs 乾天必須有明顯差異
  const diff = await page.evaluate(async ({ a, b, c }) => {
    const load = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = 'data:image/png;base64,' + src; });
    const [ia, ib, ic] = await Promise.all([load(a), load(b), load(c)]);
    const grab = img => { const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; cv.getContext('2d').drawImage(img, 0, 0); return cv.getContext('2d').getImageData(0, 0, img.width, img.height).data; };
    const da = grab(ia), db = grab(ib), dc = grab(ic);
    const meanAbs = (A, B) => { let s = 0, n = 0; for (let i = 0; i < A.length; i += 4 * 13) { s += Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]); n += 3; } return s / n; };
    return { wetVsDry: +meanAbs(da, db).toFixed(2), wetVsWet: +meanAbs(da, dc).toFixed(2) };
  }, { a: wetShot, b: dryShot, c: wetShot2 });
  if (diff.wetVsDry < 2) fix(`雨天與乾天畫面幾乎一樣（平均像素差 ${diff.wetVsDry}）`);
  if (diff.wetVsWet < 0.4) fix(`兩張雨天畫面沒有變化（平均像素差 ${diff.wetVsWet}），雨絲可能靜止`);
  if (!fails.length) ok(`雨天與乾天畫面上有明顯差異（平均像素差 ${diff.wetVsDry}），雨絲會動（${diff.wetVsWet}）`);

  // 雪地不下雨
  const snowR = REGIONS.find(r => r.id === 'snow');
  await page.evaluate(({ x, z }) => { globalThis.__mistvaleGame.exploreRegion('snow'); globalThis.__mistvaleView.lookAt(x, z); }, { x: snowR.x, z: snowR.z });
  await page.waitForTimeout(3000);
  await setTime(page, WET_T, 1400);
  const snow = await rainState(page);
  if (snow.r?.on) fix(`雪地（biome=${snow.r.biome}）不該下雨，應該只有雪`);
  else ok(`雪地不下雨（biome=${snow.r?.biome}）`);

  // 濕氣層不影響點擊
  const hits = await page.evaluate(() => {
    const ids = ['pause', 'speed'];
    const bad = [];
    for (const a of ids) {
      const b = document.querySelector(`[data-action="${a}"]`);
      if (!b) continue;
      const r = b.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (!(top === b || b.contains(top))) bad.push(a);
    }
    const c = document.elementFromPoint(720, 500);
    return { bad, centre: c ? (c.id || c.tagName) : 'null' };
  });
  if (hits.bad.length) fix(`濕氣層擋住浮動鈕：${hits.bad.join(',')}`);
  if (hits.centre !== 'world' && !hits.centre.startsWith('world')) fix(`畫面中央點擊被 ${hits.centre} 接走`);
  if (!hits.bad.length && hits.centre.startsWith('world')) ok('濕氣層不擋浮動鈕，畫面中央點擊仍穿透到世界');

  if (process.env.SHOTS) {
    fs.writeFileSync('output/rain/wet.png', Buffer.from(wetShot, 'base64'));
    fs.writeFileSync('output/rain/dry.png', Buffer.from(dryShot, 'base64'));
  }
  if (errs.length) fix(`desktop 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// ── 減少動態：不下雨 ────────────────────────────────────
{
  const { ctx, page } = await boot({ width: 1440, height: 900 }, { reducedMotion: 'reduce' });
  await setTime(page, WET_T);
  const r = await rainState(page);
  if (r.r?.on) fix('prefers-reduced-motion 下仍在下雨');
  else if (r.tint && r.tint.opacity > 0.05) fix(`prefers-reduced-motion 下雨絲關了但濕氣層還在（${r.tint.opacity}）`);
  else ok('prefers-reduced-motion 時不下雨、濕氣層也收掉');
  await ctx.close();
}

// ── phone ───────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 402, height: 712 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await setTime(page, WET_T);
  const r = await rainState(page);
  if (!r.r?.on) fix(`phone 雨天沒有下雨：${JSON.stringify(r.r)}`);
  else {
    if (r.r.drops < 100) fix(`phone 雨絲只有 ${r.r.drops} 條`);
    if (!r.tint || r.tint.opacity < 0.9) fix('phone 下雨時沒有濕氣層');
    if (!fails.length) ok(`phone 402x712 也會下雨（${r.r.drops} 條雨絲＋濕氣層）`);
  }
  if (process.env.SHOTS) await page.screenshot({ path: 'output/rain/phone-wet.png' });
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
console.log('PASS rain: 溫帶地區在雨天時段會下雨（雨絲會動、畫面明顯變化＋濕氣層），雪地只有雪、減少動態時不下雨，濕氣層不擋點擊不壓 HUD');
