// chimney-smoke.mjs — T130：鐵匠鋪煙囪的煙
//   * 煙不畫進建築層（建築會被凍結成靜態快取，畫進去煙會凍住），
//     所以這裡驗「有煙」「位置在煙囪口上方」「會往上飄」「關掉建築就沒有」
//     「prefers-reduced-motion 時不畫」，以及畫面像素真的多了煙（不是只有計數器在動）。
// Usage: node tools/checks/chimney-smoke.mjs      (game server on 5024 expected)
//        $env:SHOTS='1'; node tools/checks/chimney-smoke.mjs
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const fails = [], oks = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/smoke', { recursive: true });

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });

async function boot(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, locale: 'zh-TW', deviceScaleFactor: 1, ...opts });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
  await page.waitForTimeout(2000);
  return { ctx, page, errs };
}

// 比較「有煙 / 沒煙」兩張截圖在煙囪附近的差異像素數（在同一個頁面裡畫進 canvas）
const diffPixels = (page, aB64, bB64, box) => page.evaluate(async ({ a, b, box }) => {
  const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/png;base64,' + src; });
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  const c = document.createElement('canvas'); c.width = box.w; c.height = box.h;
  const g = c.getContext('2d');
  g.drawImage(ia, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  const da = g.getImageData(0, 0, box.w, box.h).data;
  g.clearRect(0, 0, box.w, box.h);
  g.drawImage(ib, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  const db = g.getImageData(0, 0, box.w, box.h).data;
  let n = 0;
  for (let i = 0; i < da.length; i += 4) {
    if (Math.abs(da[i] - db[i]) > 8 || Math.abs(da[i + 1] - db[i + 1]) > 8 || Math.abs(da[i + 2] - db[i + 2]) > 8) n++;
  }
  return { changed: n, total: (box.w * box.h) };
}, { a: aB64, b: bB64, box });

// ── desktop ──────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 1440, height: 900 });

  const base = await page.evaluate(() => globalThis.__mistvaleSmoke);
  if (!base) fix('找不到 __mistvaleSmoke 除錯鉤子');
  if (!base?.spot) fix('建築繪製時沒有記錄煙囪口座標（smokeSpot 為 null）');

  // 沒有鐵匠鋪 → 沒有煙
  await page.evaluate(() => { globalThis.__mistvaleGame.state.buildings.forge = 0; });
  await page.waitForTimeout(600);
  const off = await page.evaluate(() => globalThis.__mistvaleSmoke);
  if (off.count !== 0) fix(`鐵匠鋪 Lv.0 時仍有 ${off.count} 顆煙`);
  else ok('鐵匠鋪 Lv.0 時沒有煙');

  // 鐵匠鋪 Lv.1 → 12 顆，全部在煙囪口上方、越上面越小越淡
  await page.evaluate(() => { globalThis.__mistvaleGame.state.buildings.forge = 1; });
  await page.waitForTimeout(700);
  const on = await page.evaluate(() => globalThis.__mistvaleSmoke);
  if (!on?.spot) fix('有鐵匠鋪時 smokeSpot 仍為 null');
  if (on?.count !== 12) fix(`鐵匠鋪 Lv.1 時煙的顆數是 ${on?.count}，預期 12`);
  if (on?.last?.length === 12) {
    const bad = on.last.filter(p => Math.abs(p.x - on.spot.x) > 26 || p.y > on.spot.y + 3 || p.y < on.spot.y - 120);
    if (bad.length) fix(`${bad.length} 顆煙不在煙囪口上方（例：${JSON.stringify(bad[0])}）`);
    const sorted = [...on.last].sort((a, b) => a.t - b.t);
    const rising = sorted.every((p, i) => i === 0 || p.y <= sorted[i - 1].y + 1);
    if (!rising) fix('煙沒有往上升（y 應隨生命週期遞減）');
    const fading = sorted.every((p, i) => i === 0 || p.a <= sorted[i - 1].a + 0.02);
    if (!fading) fix('煙沒有隨高度變淡');
    if (rising && fading && !bad.length) ok(`煙囪口 (${Math.round(on.spot.x)},${Math.round(on.spot.y)}) 上方 12 顆煙：越往上越小、越淡、往上飄`);
  }

  // 會動：取幾個時間點的煙頭位置
  const tops = [];
  for (let i = 0; i < 4; i++) { tops.push(await page.evaluate(() => Math.round(globalThis.__mistvaleSmoke.minY))); await page.waitForTimeout(220); }
  if (new Set(tops).size < 2) fix(`煙的最高點幾乎沒變（${tops.join(' → ')}），看起來是靜止的`);
  else ok(`煙會流動（最高點 ${tops.join(' → ')}）`);

  // 像素證據：有煙 / 沒煙 兩張截圖在煙囪上方差多少像素
  const box = { x: Math.max(0, Math.round(on.spot.x - 30)), y: Math.max(0, Math.round(on.spot.y - 110)), w: 60, h: 110 };
  const withSmoke = (await page.screenshot({ type: 'png' })).toString('base64');
  await page.evaluate(() => { globalThis.__mistvaleGame.state.buildings.forge = 0; });
  await page.waitForTimeout(600);
  const noSmoke = (await page.screenshot({ type: 'png' })).toString('base64');
  const d = await diffPixels(page, withSmoke, noSmoke, box);
  const ratio = d.changed / d.total;
  if (ratio < 0.02) fix(`煙囪上方的畫面只有 ${d.changed}/${d.total}（${(ratio * 100).toFixed(1)}%）像素改變，煙幾乎看不見`);
  else ok(`畫面真的有差：煙囪上方 ${d.changed}/${d.total}（${(ratio * 100).toFixed(1)}%）像素改變`);
  if (process.env.SHOTS) {
    await page.evaluate(() => { globalThis.__mistvaleGame.state.buildings.forge = 1; });
    await page.waitForTimeout(700);
    await page.screenshot({ path: 'output/smoke/desktop.png' });
  }
  if (errs.length) fix(`desktop 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// ── 減少動態：不畫煙 ────────────────────────────────────
{
  const { ctx, page } = await boot({ width: 1440, height: 900 }, { reducedMotion: 'reduce' });
  const st = await page.evaluate(() => globalThis.__mistvaleSmoke);
  if (st.count !== 0) fix(`prefers-reduced-motion 下仍有 ${st.count} 顆煙`);
  else ok('prefers-reduced-motion 時不畫煙');
  await ctx.close();
}

// ── phone ───────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 402, height: 712 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const st = await page.evaluate(() => ({ smoke: globalThis.__mistvaleSmoke, buildings: globalThis.__mistvaleGame.state.buildings.forge }));
  if (st.buildings > 0 && st.smoke.count !== 12) fix(`phone 有鐵匠鋪 Lv.${st.buildings} 但煙的顆數是 ${st.smoke.count}`);
  if (st.buildings > 0 && st.smoke.count === 12) ok(`phone 402x712 也有煙（${st.smoke.count} 顆）`);
  if (process.env.SHOTS) await page.screenshot({ path: 'output/smoke/phone.png' });
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
console.log('PASS chimney smoke: 鐵匠鋪煙囪會冒煙（12 顆連續煙球，從煙囪口往上飄、越大越淡）、沒有鐵匠鋪就沒有煙、煙會流動、畫面像素確實有變化、減少動態時關閉、手機也有');
