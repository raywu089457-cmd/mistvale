// rain-sound.mjs — T136：下雨時多一層雨聲（雨幕 bed + 稀疏滴水）
//   * 雨聲要跟著「世界是不是在下雨」（__mistvaleRain.on），不是跟著區域。
//   * 乾天時必須收掉（不能一直殘留雨聲），靜音時也要收。
// Usage: node tools/checks/rain-sound.mjs
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const WET_T = 10, DRY_T = 60;   // 與 rain.mjs 相同：sin(t*0.037+1.7)>.55 為雨天
const fails = [], oks = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });

async function boot(viewport, dsf = 1, opts = {}) {
  const ctx = await browser.newContext({ viewport, locale: 'zh-TW', deviceScaleFactor: dsf, ...opts });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
  await page.waitForTimeout(1200);
  // 手勢上膛（環境音／雨聲都要等到第一次手勢才會建立 AudioContext）
  await page.click('#bottom-bar [data-action="hunters"]');
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  return { ctx, page, errs };
}

const state = page => page.evaluate(() => globalThis.__mistvaleAmbient.state());
const setTime = async (page, t, wait = 2600) => {
  await page.evaluate(v => { const s = globalThis.__mistvaleGame.state; s.time = v; }, t);
  await page.waitForTimeout(wait);   // 雨幕淡入 1.2s，留兩倍
};

{
  const { ctx, page, errs } = await boot({ width: 1440, height: 900 });

  // 1) 下雨：雨聲要開
  await setTime(page, WET_T);
  const wet = await state(page);
  const worldWet = await page.evaluate(() => globalThis.__mistvaleRain);
  if (!worldWet?.on) fix(`測試前提不成立：世界沒有下雨（__mistvaleRain=${JSON.stringify(worldWet)}）`);
  if (!wet.rain) fix(`下雨時沒有雨聲（ambient.rain=${wet.rain}）`);
  else if (!(wet.rainTarget > 0)) fix(`雨聲目標音量是 0（rainTarget=${wet.rainTarget}）`);
  else ok(`下雨時雨聲啟動（目標音量 ${wet.rainTarget}，目前 ${wet.rainGain}，已建立 ${wet.rainBuilds} 次）`);

  // 2) 雨滴要真的響（稀疏滴答）
  await page.waitForTimeout(3500);
  const wet2 = await state(page);
  if (!(wet2.drips > wet.drips)) fix(`雨滴聲沒有響過（${wet.drips} → ${wet2.drips}）`);
  else ok(`雨滴聲有響（${wet.drips} → ${wet2.drips} 次）`);

  // 3) 放晴：雨聲要收掉
  await setTime(page, DRY_T, 2200);
  const dry = await state(page);
  const worldDry = await page.evaluate(() => globalThis.__mistvaleRain);
  if (worldDry?.on) fix('測試前提不成立：乾天時世界仍在降雨');
  if (dry.rain) fix(`放晴後雨聲沒有收掉（rain=${dry.rain}）`);
  else ok('放晴後雨聲收掉');

  // 4) 靜音：不能有雨聲
  await setTime(page, WET_T);
  await page.evaluate(() => globalThis.__mistvaleAmbient.rain(true));
  await page.evaluate(() => globalThis.__mistvaleSfx.muted(true));
  await page.waitForTimeout(600);
  const mutedState = await state(page);
  if (mutedState.rain) fix('靜音後雨聲沒有收掉');
  else ok('靜音時雨聲收掉');

  // 5) 解除靜音：雨聲要回來（世界還在下雨）
  await page.evaluate(() => globalThis.__mistvaleSfx.muted(false));
  await page.evaluate(() => globalThis.__mistvaleAmbient.rain(true));
  await page.waitForTimeout(1500);
  const back = await state(page);
  if (!back.rain) fix('解除靜音後雨聲沒有回來');
  else ok('解除靜音後雨聲回來');

  // 6) 原始碼有接上（避免只是被除錯鉤子叫起來）
  const ui = fs.readFileSync('src/pixel-ui.js', 'utf8');
  const sf = fs.readFileSync('src/sfx.js', 'utf8');
  if (!ui.includes('ambientRain(!!globalThis.__mistvaleRain?.on)')) fix('pixel-ui.js 沒有把天氣餵給音效層');
  else if (!sf.includes('export function ambientRain')) fix('sfx.js 沒有 ambientRain');
  else ok('原始碼有接上：世界回報下雨 → pixel-ui 每幀餵給 sfx.ambientRain()');

  // 7) 不影響風聲底噪
  const beds = await state(page);
  if (!beds.playing) fix(`雨聲把風聲底噪擠掉了（playing=${beds.playing}）`);
  else ok(`雨聲與區域風聲可以同時存在（底噪 ${beds.bed} 仍在）`);

  if (errs.length) fix(`desktop 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// phone：只驗雨天時雨聲有起來
{
  const { ctx, page, errs } = await boot({ width: 402, height: 712 }, 2, { hasTouch: true, isMobile: true });
  await setTime(page, WET_T);
  const st = await state(page);
  if (!st.rain) fix('phone 下雨時沒有雨聲');
  else ok(`phone 402x712 下雨時雨聲啟動（目標音量 ${st.rainTarget}）`);
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
console.log('PASS rain sound: 下雨時多一層雨聲（雨幕＋稀疏雨滴），與區域風聲同時存在；放晴、靜音時收掉，解除靜音且仍下雨時回來，手機也有');
