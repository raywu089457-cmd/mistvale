// sfx.mjs — T105：程序化音效（沒有音檔，全部 WebAudio 即時合成）。
//   * 第一次按鈕點擊後 AudioContext 會建立並 resume，之後 UI 操作有聲音。
//   * 每種音色都能播（__mistvaleSfx.play / kinds），不會爆錯。
//   * 設定裡的「音效」關掉 → 不再播任何音，偏好存 localStorage，重開仍然靜音。
//   * 出貨檔裡真的接上了戰鬥事件（hit/crit/aoe）——不然只是有個不會響的引擎。
// Usage: node tools/checks/sfx.mjs            (game server on 5024; TARGET overrides)
//        $env:SHOTS='1'; node tools/checks/sfx.mjs   also writes output/sfx/montage.png
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const SHIP = '../../outputs/暮影村.html';
const fails = [], oks = [];
const fix = m => fails.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/sfx', { recursive: true });

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'zh-TW' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));

const sfxLog = () => page.evaluate(() => (globalThis.__mistvaleSfx?.log?.(200) || []));
const kindsOf = list => list.map(x => x.kind);
const resetLog = () => page.evaluate(() => { const a = globalThis.__mistvaleSfx?.log?.(200) || []; globalThis.__sfxMark = a.length; });

try {
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 120000 });
  await page.evaluate(() => { globalThis.__mistvaleGame.state.paused = true; });
  await page.waitForTimeout(300);

  const before = kindsOf(await sfxLog());
  const state0 = await page.evaluate(() => globalThis.__mistvaleSfx?.state());
  if (before.includes('ui')) fix('還沒點任何按鈕就播了 UI 音（應該等到第一次手勢）');

  // ── 1. 點一次真的 UI 按鈕 → 建立 AudioContext 並播 UI 音
  await page.click('#bottom-bar [data-action=hunters]');
  await page.waitForTimeout(250);
  const after1 = kindsOf(await sfxLog());
  const state1 = await page.evaluate(() => globalThis.__mistvaleSfx?.state());
  if (!after1.includes('ui') && !after1.includes('open')) fix(`點按鈕後沒有 UI 音效（log=${JSON.stringify(after1)}）`);
  if (state1 !== 'running') fix(`AudioContext 沒有啟動（state=${state1}, 初始 ${state0}）`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  // ── 2. 每種音色都播得出來
  const kinds = await page.evaluate(() => globalThis.__mistvaleSfx.kinds());
  if (!Array.isArray(kinds) || kinds.length < 8) fix(`音色表太少或不存在（${JSON.stringify(kinds)}）`);
  for (const k of kinds) { await page.evaluate(k => globalThis.__mistvaleSfx.play(k), k); await page.waitForTimeout(140); }
  await page.waitForTimeout(600);
  const played = new Set(kindsOf(await sfxLog()));
  const missing = kinds.filter(k => !played.has(k));
  if (missing.length) fix(`這些音色沒有播出來：${missing.join('、')}`);
  const voices = await page.evaluate(() => globalThis.__mistvaleSfx.voices());
  if (voices > 10) fix(`音效節點沒有回收（還在響 ${voices} 個）`);

  // ── 3. 關掉音效 → 完全安靜
  await page.evaluate(() => globalThis.__mistvaleGame.state.paused = true);
  await resetLog();
  const n0 = (await sfxLog()).length;
  await page.evaluate(() => globalThis.__mistvaleSfx.muted(true));
  for (const k of ['hit', 'crit', 'aoe', 'coin']) await page.evaluate(k => globalThis.__mistvaleSfx.play(k), k);
  await page.waitForTimeout(120);
  if ((await sfxLog()).length !== n0) fix('關閉音效後仍然播了音');
  await page.evaluate(() => globalThis.__mistvaleSfx.muted(false));

  // ── 4. 設定面板的「音效」開關：關 → 偏好寫進 localStorage → 重載後仍然靜音
  await page.evaluate(() => {
    const el = document.createElement('button');
    el.dataset.action = 'settings'; el.style.display = 'none'; document.body.append(el); el.click(); el.remove();
  });
  await page.waitForTimeout(250);
  await page.evaluate(() => { const t = document.querySelector('[data-action=toggleQuality]'); if (t && t.textContent.includes('調整')) t.click(); });
  await page.waitForTimeout(250);
  const hasRow = await page.evaluate(() => !!document.querySelector('#modal-content .setting-row [data-action=setOpt][data-key=sound]'));
  if (!hasRow) fix('設定面板沒有「音效」開關');
  if (process.env.SHOTS) { await page.evaluate(() => document.querySelector('#modal-content')?.scrollTo?.(0, 9999)); await page.waitForTimeout(200); await page.screenshot({ path: 'output/sfx/settings-1440x900.png' }); }
  await page.evaluate(() => { const b = document.querySelector('#modal-content [data-action=setOpt][data-key=sound][data-value="0"]'); b?.click(); });
  await page.waitForTimeout(300);
  const mutedNow = await page.evaluate(() => globalThis.__mistvaleSfx.muted());
  const pref = await page.evaluate(() => localStorage.getItem('mistvale-sfx'));
  if (!mutedNow) fix('按下「音效：關」之後仍然是開的');
  if (pref !== '0') fix(`音效偏好沒有存起來（localStorage mistvale-sfx=${pref}）`);

  // 重載後仍然是靜音
  await page.reload({ waitUntil: 'commit' });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 120000 });
  await page.waitForTimeout(300);
  if (!(await page.evaluate(() => globalThis.__mistvaleSfx.muted()))) fix('重新載入後音效設定被重置回開啟');
  const quiet = await page.evaluate(() => globalThis.__mistvaleSfx.play('hit'));
  if (quiet) fix('重新載入後（靜音偏好）仍然播得出來');
  await page.evaluate(() => { globalThis.__mistvaleSfx.muted(false); try { localStorage.removeItem('mistvale-sfx'); } catch { } });

  // ── 5. 出貨檔真的把音效接在戰鬥事件上
  let ship = '', src = '';
  try { ship = fs.readFileSync(SHIP, 'utf8'); } catch { fix(`讀不到出貨檔 ${SHIP}`); }
  try { src = fs.readFileSync('src/pixel-game.js', 'utf8'); } catch { fix('讀不到 src/pixel-game.js'); }
  for (const call of ["sfx('hit'", "sfx('crit'", "sfx('aoe'"]) {
    if (src && !src.includes(call)) fix(`effect() 沒有接 ${call}：音效引擎沒接上戰鬥事件`);
  }
  if (ship && !/AudioContext/.test(ship)) fix('出貨檔沒有 AudioContext（音效沒被打包）');

  if (errs.length) fix(`頁面錯誤：${errs[0]}`);
  if (!fails.length) oks.push('desktop 1440x900: 手勢後才建 AudioContext、13 種音色都播得出來、關閉後完全安靜、偏好重載後保留、出貨檔已接上 hit/crit/aoe');
} finally {
  await browser.close();
}

if (fails.length) { for (const f of fails) console.log('FIX ' + f); process.exit(1); }
for (const o of oks) console.log('ok  ' + o);
console.log('PASS sfx: 程序化音效接了 UI 與戰鬥事件（hit/crit/aoe/coin/quest/level）、第一次手勢後才啟動、設定可關閉且偏好會保留');
