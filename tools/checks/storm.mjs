// storm.mjs — T137：陣雨時偶爾打雷（閃光＋悶雷）
//   * 閃光用時間函數決定（每 23 秒一格、偶數格又在下雨才打）→ 可重現、可測。
//   * 閃光層必須 pointer-events:none、在夜色之上（不然夜裡打雷會被正片疊底壓暗）。
//   * 雷聲要跟著閃光次數觸發，乾天不能無故打雷。
// Usage: node tools/checks/storm.mjs
//        $env:SHOTS='1'; node tools/checks/storm.mjs
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const fails = [], oks = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/storm', { recursive: true });

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });

async function boot(viewport, dsf = 1, opts = {}) {
  const ctx = await browser.newContext({ viewport, locale: 'zh-TW', deviceScaleFactor: dsf, ...opts });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
  await page.waitForTimeout(1200);
  await page.click('#bottom-bar [data-action="hunters"]');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  return { ctx, page, errs };
}

const storm = page => page.evaluate(() => globalThis.__mistvaleStorm || null);

// 把時間調到「剛好跨過一格的偶數格起點」，並讓遊戲跑幾百毫秒觸發
const triggerStorm = async page => {
  // t=183.85：下一格是 8（偶數）且那一刻在下雨（sin(184*.037+1.7)=0.79>.55）→ 一定會打雷
  await page.evaluate(() => {
    const s = globalThis.__mistvaleGame.state;
    s.paused = false;
    s.time = 23 * 8 - 0.15;
  });
  await page.waitForTimeout(600);
  for (let i = 0; i < 8; i++) {
    const has = await page.evaluate(() => (globalThis.__mistvaleStorm?.count || 0) > 0 && globalThis.__mistvaleStorm.flash);
    if (has) break;
    await page.waitForTimeout(200);
  }
};

{
  const { ctx, page, errs } = await boot({ width: 1440, height: 900 });

  // 前提：這個時間點世界在下雨
  const wet = await page.evaluate(() => globalThis.__mistvaleRain);
  if (!wet?.on) {
    await page.evaluate(() => { const s = globalThis.__mistvaleGame.state; s.time = 10; });
    await page.waitForTimeout(600);
  }

  const before = await storm(page);
  await triggerStorm(page);
  const during = await storm(page);
  if (!during) fix('找不到 __mistvaleStorm 除錯鉤子');
  else {
    if (!(during.count > (before?.count ?? 0))) fix(`打雷次數沒有增加（${before?.count ?? 0} → ${during.count}）`);
    else ok(`陣雨時打雷了（第 ${during.count} 次）`);
    if (!during.flash) fix('打雷時沒有閃光（flash=false）');
    const peak = Math.max(during.peak || 0, during.opacity || 0);
    if (!(peak > 0.15)) fix(`閃光太弱（峰值 opacity=${peak}）`);
    else ok(`閃光實測峰值 opacity ${peak}`);
  }

  // 閃光層的樣式與層級
  const layer = await page.evaluate(() => {
    const el = document.querySelector('#lightning');
    if (!el) return { missing: true };
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    return {
      pe: cs.pointerEvents, z: parseInt(cs.zIndex) || 0, pos: cs.position,
      rect: { w: Math.round(r.width), h: Math.round(r.height) },
      nightZ: parseInt(getComputedStyle(document.body.children[0]).zIndex || '0') || 0,
      top: (() => { const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return e ? (e.id || e.tagName) : 'null'; })(),
    };
  });
  if (layer.missing) fix('找不到 #lightning 閃光層');
  else {
    if (layer.pe !== 'none') fix(`閃光層 pointer-events=${layer.pe}，會吃掉點擊`);
    if (layer.pos !== 'fixed') fix(`閃光層 position=${layer.pos}`);
    if (Math.abs(layer.rect.w - 1440) > 1 || Math.abs(layer.rect.h - 900) > 1) fix(`閃光層沒有鋪滿畫面：${JSON.stringify(layer.rect)}`);
    if (layer.z < 3) fix(`閃光層 z-index=${layer.z}，夜裡會被夜色（z-index 2）壓暗`);
    if (!String(layer.top).startsWith('world')) fix(`畫面中央的點擊被 ${layer.top} 接走（應為 world）`);
    if (!fails.length) ok(`閃光層鋪滿畫面、pointer-events:none、z-index ${layer.z}（在夜色之上）、點擊穿透`);
  }

  // 雷聲：sfx 記錄裡要出現 thunder
  const sounds = await page.evaluate(() => globalThis.__mistvaleSfx.log(40).map(x => x.kind));
  if (!sounds.includes('thunder')) fix(`打雷時沒有播放雷聲（最近音效：${sounds.join(',')}）`);
  else ok('打雷同時播放了雷聲');

  // 閃光要收掉（不是一直亮著）
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => ({ s: globalThis.__mistvaleStorm, o: parseFloat(getComputedStyle(document.querySelector('#lightning')).opacity) }));
  if (after.o > 0.05) fix(`閃光沒有淡掉（opacity=${after.o}）`);
  else ok('閃光約半秒內淡掉');

  // 乾天不能打雷：停在乾天時間 3 秒，次數不變
  await page.evaluate(() => { const s = globalThis.__mistvaleGame.state; s.paused = false; s.time = 60; });
  await page.waitForTimeout(300);
  const dry0 = (await storm(page))?.count ?? 0;
  await page.waitForTimeout(2600);
  const dry1 = (await storm(page))?.count ?? 0;
  const dryRain = await page.evaluate(() => globalThis.__mistvaleRain);
  if (dryRain?.on) fix('測試前提不成立：乾天時世界仍在降雨');
  else if (dry1 !== dry0) fix(`乾天時仍然打雷（${dry0} → ${dry1}）`);
  else ok('乾天不會打雷');

  if (process.env.SHOTS) {
    await page.evaluate(() => { const s = globalThis.__mistvaleGame.state; s.paused = false; s.time = 23 * 4 - 0.15; });
    await page.waitForTimeout(320);
    await page.screenshot({ path: 'output/storm/flash.png' });
  }

  if (errs.length) fix(`desktop 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// phone
{
  const { ctx, page, errs } = await boot({ width: 402, height: 712 }, 2, { hasTouch: true, isMobile: true });
  await page.evaluate(() => { const s = globalThis.__mistvaleGame.state; s.time = 10; });
  await page.waitForTimeout(400);
  await triggerStorm(page);
  const st = await storm(page);
  if (!st || !(st.count > 0)) fix('phone 陣雨時沒有打雷');
  else ok(`phone 402x712 也會打雷（第 ${st.count} 次，opacity ${st.opacity}）`);
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
console.log('PASS storm: 陣雨時偶爾打雷（閃光鋪滿畫面、在夜色之上、點擊穿透、半秒淡掉），同時播雷聲；乾天不會打雷，手機也有');
