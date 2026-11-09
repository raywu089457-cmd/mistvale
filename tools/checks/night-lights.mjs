// night-lights.mjs — T131：夜裡真的變暗（正片疊底）＋每棟有蓋建築門前的暖光
//   * 舊版夜色是「半透明藍色疊層」：只是把畫面洗淡，看起來反而更亮。改成正片疊底(multiply)。
//   * 燈光畫在門前地面（用 sprite 不透明範圍的底緣定位），位置給 __mistvaleNight.pts 檢查器採樣。
// Usage: node tools/checks/night-lights.mjs     (game server on 5024)
//        $env:SHOTS='1'; node tools/checks/night-lights.mjs
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const fails = [], oks = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/night', { recursive: true });

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });

async function boot(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, locale: 'zh-TW', deviceScaleFactor: 1, ...opts });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
  await page.waitForTimeout(1600);
  await page.evaluate(() => { globalThis.__mistvaleGame.state.paused = true; });
  return { ctx, page, errs };
}

const setPhase = (page, t) => page.evaluate(t => { globalThis.__mistvaleGame.state.time = t; }, t);

// 取樣：把 base64 截圖畫進頁面 canvas 讀像素
const sample = (page, b64, pts) => page.evaluate(async ({ b64, pts }) => {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/png;base64,' + b64; });
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  return pts.map(p => { const d = g.getImageData(p.x, p.y, 1, 1).data; return { ...p, r: d[0], g: d[1], b: d[2], lum: +(0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]).toFixed(1) }; });
}, { b64, pts });

// ── desktop ──────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 1440, height: 900 });

  const geo = await page.evaluate(() => {
    const el = [...document.body.children].find(e => e.style && e.style.background === 'rgb(90, 106, 168)');
    if (!el) return { found: false };
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    return { found: true, blend: cs.mixBlendMode, z: parseInt(cs.zIndex) || 0, pe: cs.pointerEvents, w: r.width, h: r.height };
  });
  if (!geo.found) fix('找不到夜色覆蓋層（background #5a6aa8）');
  else {
    if (geo.blend !== 'multiply') fix(`夜色覆蓋層 mix-blend-mode=${geo.blend}，半透明藍會把畫面洗淡，應為 multiply`);
    if (geo.z !== 2) fix(`夜色覆蓋層 z-index=${geo.z}，應為 2（在世界 0 之上、HUD 之下）`);
    if (geo.pe !== 'none') fix(`夜色覆蓋層 pointer-events=${geo.pe}`);
    if (Math.abs(geo.w - 1440) > 1 || Math.abs(geo.h - 900) > 1) fix(`夜色覆蓋層沒有鋪滿畫面：${geo.w}x${geo.h}`);
    if (geo.blend === 'multiply' && geo.z === 2 && geo.pe === 'none') ok(`夜色覆蓋層：mix-blend-mode:multiply、z-index ${geo.z}、pointer-events:none、鋪滿 1440x900`);
  }

  // 白天
  await setPhase(page, 30);
  await page.waitForTimeout(700);
  const day = await page.evaluate(() => ({ night: globalThis.__mistvaleNight, built: Object.values(globalThis.__mistvaleGame.state.buildings).filter(v => v > 0).length }));
  if (day.night.strength !== 0) fix(`白天（phase .125）夜色強度 ${day.night.strength}，應為 0`);
  if (day.night.pools !== 0) fix(`白天有 ${day.night.pools} 盞燈，應為 0`);
  const dayShot = (await page.screenshot({ type: 'png' })).toString('base64');

  // 夜晚
  await setPhase(page, 173);
  await page.waitForTimeout(900);
  const night = await page.evaluate(() => globalThis.__mistvaleNight);
  if (!(night.strength > 0.7)) fix(`半夜（phase .72）夜色強度只有 ${night.strength}，應 > 0.7`);
  if (night.pools !== day.built) fix(`夜晚點亮 ${night.pools} 棟，但村子有 ${day.built} 棟已建造建築`);
  const nightShot = (await page.screenshot({ type: 'png' })).toString('base64');

  const pts = [
    { name: 'w1', x: 520, y: 300 }, { name: 'w2', x: 700, y: 330 },
    { name: 'w3', x: 900, y: 380 }, { name: 'w4', x: 560, y: 700 },
    { name: 'w5', x: 760, y: 690 }, { name: 'w6', x: 980, y: 660 },
    { name: 'hud-top', x: 720, y: 18 },
    ...(night.pts || []).slice(0, 3).map((p, i) => ({ name: 'lamp' + i, x: Math.max(2, Math.min(1436, p.x)), y: Math.max(2, Math.min(896, p.y + 1)) })),
  ];
  const rows = await sample(page, nightShot, pts);
  const rowsDay = await sample(page, dayShot, pts);
  const by = n => rows.find(r => r.name === n), byDay = n => rowsDay.find(r => r.name === n);

  const worldNames = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'];
  const ratios = worldNames.map(n => by(n).lum / Math.max(1, byDay(n).lum)).sort((a, b) => a - b);
  const median = ratios[Math.floor(ratios.length / 2)];
  if (median > 0.75) fix(`世界 6 個取樣點只有中位數 ${median.toFixed(2)} 的亮度比例，夜晚沒有明顯變暗（應 < 0.75）`);
  const centreRow = byDay('w2'), centreNight = by('w2');
  const hudD = byDay('hud-top'), hudN = by('hud-top');
  if (Math.abs(hudN.lum - hudD.lum) > 1.5) fix(`HUD 也跟著變暗了（${hudD.lum} → ${hudN.lum}）——夜色只該壓世界層`);
  const lamps = rows.filter(r => r.name.startsWith('lamp'));
  if (lamps.length < 2) fix(`取不到燈光位置（__mistvaleNight.pts 只有 ${lamps.length} 個）`);
  const warmLamps = lamps.filter(r => r.r > r.b + 6);
  if (lamps.length && warmLamps.length < lamps.length) fix(`${lamps.length - warmLamps.length}/${lamps.length} 盞燈的取樣點不夠暖（R 沒有明顯大於 B）`);
  if (!fails.length) {
    ok(`半夜世界明顯變暗（6 點中位數亮度比例 ${median.toFixed(2)}；例：${centreRow.lum} → ${centreNight.lum}），HUD 亮度不變（${hudD.lum} → ${hudN.lum}）`);
    ok(`${night.pools} 棟已建造建築門前都有暖光（取樣 ${warmLamps.length} 盞：R 比 B 高 ${warmLamps.map(l => l.r - l.b).join('/')}）`);
  }

  if (process.env.SHOTS) {
    fs.writeFileSync('output/night/desktop-day.png', Buffer.from(dayShot, 'base64'));
    fs.writeFileSync('output/night/desktop-night.png', Buffer.from(nightShot, 'base64'));
  }

  // 關掉「夜晚」設定 → 沒有夜色也沒有燈
  await page.evaluate(() => globalThis.__mistvaleView.setNight(false));
  await page.waitForTimeout(900);
  const off = await page.evaluate(() => ({ n: globalThis.__mistvaleNight, opacity: [...document.body.children].find(e => e.style && e.style.background === 'rgb(90, 106, 168)')?.style.opacity }));
  if (off.n.strength !== 0 || off.n.pools !== 0) fix(`夜晚設定關閉後仍有夜色（強度 ${off.n.strength}、燈 ${off.n.pools}）`);
  else ok('設定「夜晚」關掉後沒有夜色也沒有燈光');

  if (errs.length) fix(`desktop 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// ── phone ───────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 402, height: 712 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await setPhase(page, 173);
  await page.waitForTimeout(900);
  const n = await page.evaluate(() => globalThis.__mistvaleNight);
  const covered = await page.evaluate(() => {
    const out = [];
    for (const a of ['worldmap', 'pause', 'speed']) {
      const b = document.querySelector(`[data-action="${a}"]`);
      if (!b) continue;
      const r = b.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (!(top === b || b.contains(top))) out.push(a);
    }
    return out;
  });
  if (!(n.strength > 0.7)) fix(`phone 半夜夜色強度只有 ${n.strength}`);
  if (!(n.pools > 0)) fix('phone 半夜沒有點亮任何建築');
  if (covered.length) fix(`phone 夜色覆蓋層擋住浮動鈕：${covered}`);
  if (n.strength > 0.7 && n.pools > 0 && !covered.length) ok(`phone 402x712 半夜 ${n.pools} 盞燈、浮動鈕仍可點`);
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
console.log('PASS night lights: 夜晚用正片疊底真的變暗（世界亮度下降、HUD 不受影響）、每棟已建造建築門前有暖光、設定關閉夜晚就全部消失、手機不擋浮動鈕');
