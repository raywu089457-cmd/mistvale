// T141 驗收：手機手勢（雙擊縮放、雙指縮放釘住指間、拖曳甩動慣性、單點仍能選取）
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = 'http://100.79.149.0:5024/?preview=1';
let fails = 0, oks = 0;
const fix = m => { fails++; console.log('FIX ' + m); };
const ok = m => { oks++; console.log('ok  ' + m); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });
const ctx = await browser.newContext({ viewport: { width: 402, height: 712 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale: 'zh-TW' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
await page.waitForTimeout(1500);

// 合成 pointer 事件的工具（Playwright 沒有多點觸控 API）
const ev = (type, id, x, y, extra = {}) => page.evaluate(({ type, id, x, y, extra }) => {
  const c = document.querySelector('#world');
  const e = new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: !extra.secondary, clientX: x, clientY: y, bubbles: true, cancelable: true, ...extra });
  c.dispatchEvent(e);
}, { type, id, x, y, extra });
const tap = async (x, y, id = 101) => { await ev('pointerdown', id, x, y); await ev('pointerup', id, x, y); };

const state = () => page.evaluate(() => {
  const v = globalThis.__mistvaleView;
  return { scale: v.getScale(), pan: v.panState(), cam: v.cameraXZ() };
});

// 1) 雙擊放大：比例變大、指下的世界點不動
{
  const a = await state();
  const wx0 = await page.evaluate(() => { const p = globalThis.__mistvaleView.unproject(201, 360); return { x: p.x, z: p.z }; });
  await tap(201, 360, 101); await page.waitForTimeout(90); await tap(201, 360, 102);
  await page.waitForTimeout(200);
  const b = await state();
  const wx1 = await page.evaluate(() => { const p = globalThis.__mistvaleView.unproject(201, 360); return { x: p.x, z: p.z }; });
  if (!(b.scale > a.scale + 1e-6)) fix(`double tap 沒有放大（${a.scale.toFixed(3)} → ${b.scale.toFixed(3)}）`);
  else ok(`double tap 放大：${a.scale.toFixed(3)} → ${b.scale.toFixed(3)}`);
  const drift = Math.hypot(wx1.x - wx0.x, wx1.z - wx0.z);
  if (drift > 2.5) fix(`double tap 之後指下的世界點漂移 ${drift.toFixed(2)}（應 < 2.5）`);
  else ok(`double tap 釘住指下的世界點（漂移 ${drift.toFixed(2)}）`);
}

// 2) 雙指張開：比例變大、指間中點的世界點不動
{
  await page.evaluate(() => globalThis.__mistvaleView.zoomTo(1));
  await page.waitForTimeout(120);
  const a = await state();
  const mid = await page.evaluate(() => { const p = globalThis.__mistvaleView.unproject(201, 400); return { x: p.x, z: p.z }; });
  await ev('pointerdown', 201, 161, 400); await ev('pointerdown', 202, 241, 400, { secondary: true });
  for (const [l, r] of [[151, 251], [141, 261], [131, 271], [121, 281]]) {
    await ev('pointermove', 201, l, 400); await ev('pointermove', 202, r, 400, { secondary: true });
    await page.waitForTimeout(40);
  }
  await ev('pointerup', 201, 121, 400); await ev('pointerup', 202, 281, 400, { secondary: true });
  await page.waitForTimeout(200);
  const b = await state();
  const mid2 = await page.evaluate(() => { const p = globalThis.__mistvaleView.unproject(201, 400); return { x: p.x, z: p.z }; });
  if (!(b.scale > a.scale + 1e-6)) fix(`雙指張開沒有放大（${a.scale.toFixed(3)} → ${b.scale.toFixed(3)}）`);
  else ok(`雙指張開放大：${a.scale.toFixed(3)} → ${b.scale.toFixed(3)}`);
  const drift = Math.hypot(mid2.x - mid.x, mid2.z - mid.z);
  if (drift > 3) fix(`雙指縮放沒有釘住指間（漂移 ${drift.toFixed(2)}）`);
  else ok(`雙指縮放釘住指間中點（漂移 ${drift.toFixed(2)}）`);
}

// 3) 甩動慣性：放手後鏡頭還會滑一小段，然後停下
{
  await page.evaluate(() => globalThis.__mistvaleView.zoomTo(1));
  await page.waitForTimeout(150);
  const before = await state();
  await ev('pointerdown', 301, 200, 560);
  for (const y of [520, 480, 440, 400, 360]) { await ev('pointermove', 301, 200, y); await page.waitForTimeout(16); }
  await ev('pointerup', 301, 200, 360);
  const atRelease = await state();
  const glide0 = Math.hypot(atRelease.cam.x - before.cam.x, atRelease.cam.z - before.cam.z);
  await page.waitForTimeout(420);
  const after = await state();
  const glide1 = Math.hypot(after.cam.x - before.cam.x, after.cam.z - before.cam.z);
  if (!(atRelease.pan.inertia && (Math.abs(atRelease.pan.inertia.vx) + Math.abs(atRelease.pan.inertia.vy)) > 0.01)) fix('放手後沒有留下慣性速度');
  else ok(`放手後留下慣性（vx ${atRelease.pan.inertia.vx.toFixed(3)} / vy ${atRelease.pan.inertia.vy.toFixed(3)}）`);
  if (!(glide1 > glide0 * 1.02)) fix(`放手後鏡頭沒有繼續滑（${glide0.toFixed(2)} → ${glide1.toFixed(2)}）`);
  else ok(`放手後鏡頭繼續滑：${glide0.toFixed(2)} → ${glide1.toFixed(2)} 世界單位`);
  await page.waitForTimeout(700);
  const settled = await state();
  if (settled.pan.inertia) fix('慣性沒有停下');
  else ok('慣性會停下（不會一直滑）');
}

// 4) 單點不受影響：點一下不會縮放，仍會選取目標
{
  const a = await state();
  const rect = await page.evaluate(() => { const r = globalThis.__mistvaleView.hitRects()[0]; return r; });
  const screen = await page.evaluate(({ x, y, w, h }) => { const v = globalThis.__mistvaleView; return v.project(x + w / 2, y + h / 2); }, rect);
  const sx = screen.sx ?? screen.x, sy = screen.sy ?? screen.y;
  await tap(sx, sy, 401);
  await page.waitForTimeout(320);
  const b = await state();
  if (Math.abs(b.scale - a.scale) > 1e-6) fix(`單點也改變了比例（${a.scale.toFixed(3)} → ${b.scale.toFixed(3)}）`);
  else ok('單點不會縮放');
  const selected = await page.evaluate(() => !document.querySelector('#inspector').classList.contains('hidden'));
  if (!selected) fix('單點建築沒有開啟建築面板（選取回歸）');
  else ok('單點建築仍會開啟建築面板');
}

if (errs.length) fix('頁面錯誤：' + errs.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `FAIL ${fails} 項` : `PASS touch gestures: 雙擊縮放會放大並釘住指下世界點、雙指縮放釘住指間、拖曳甩動會滑一小段再停、單點仍能選取（${oks} 項 ok）`);
process.exit(fails ? 1 : 0);
