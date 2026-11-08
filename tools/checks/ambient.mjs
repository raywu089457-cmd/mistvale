// ambient.mjs — T108：環境音層。風聲底噪要跟著區域與日夜換，靜音要收掉，背景分頁要停。
//   * 第一次手勢前不建 AudioContext（瀏覽器自動播放政策）。
//   * 區域換 → 底噪換（village / meadow / forest / taiga / snow / mountain / desert）。
//   * 相位 >.55 且 <.95 → 夜間（蟲鳴／貓頭鷹），音量比白天低。
//   * 靜音 → 底噪收掉；解除靜音 → 回來。
//   * 稀疏點綴不能把 voices 疊爆。
// Usage: node tools/checks/ambient.mjs        (game server on 5024; TARGET overrides)
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const fails = [], oks = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-TW' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
await page.waitForTimeout(1200);

const ambient = () => page.evaluate(() => globalThis.__mistvaleAmbient ? globalThis.__mistvaleAmbient.state() : null);
const sfxState = () => page.evaluate(() => globalThis.__mistvaleSfx ? globalThis.__mistvaleSfx.state() : 'none');
const setTime = t => page.evaluate(t => { globalThis.__mistvaleGame.state.time = t; }, t);
const setRegion = id => page.evaluate(id => { globalThis.__mistvaleGame.exploreRegion(id); }, id);

// 1. 手勢前不該有底噪（AudioContext 只記錄狀態，preview 模式會自己開面板）
const before = await ambient();
const st0 = await sfxState();
if (before && before.playing) fix('還沒互動就在播環境音');
if (before && before.armed) fix('還沒互動就上膛（armed=true）');
else ok(`手勢前沒有底噪（AudioContext ${st0}、armed=false）`);

// 2. 第一次手勢 → 開始播（目前的區域；preview 預設在狩獵區）
await page.evaluate(() => document.querySelector('#bottom-bar [data-action="hunters"]')?.click());
await page.waitForTimeout(700);
await setTime(36);   // 0.15 = 下午
await page.waitForTimeout(600);
const region0 = await page.evaluate(() => globalThis.__mistvaleGame.state.region);
const v = await ambient();
if (!v) fix('沒有 __mistvaleAmbient 除錯鉤子');
else {
  if (!v.playing) fix('第一次手勢後沒有環境音');
  if (v.bed !== region0) fix(`${region0} 的底噪是 ${v.bed || '(空)'}，預期 ${region0}`);
  if (v.night) fix(`相位 0.15 不該是夜間（night=${v.night}）`);
  if (!(v.target > 0.02)) fix(`底噪音量 ${v.target} 太小，聽不到`);
  if (v.target > 0.1) fix(`底噪音量 ${v.target} 太大，會蓋過事件音`);
  else ok(`底噪 ${v.bed} playing，目標音量 ${v.target}（白天）`);
}

// 3. 換區域 → 底噪換、舊的淡出（只留一條）
for (const id of ['forest', 'snow']) {
  await setRegion(id);
  await page.waitForTimeout(900);
  const a = await ambient();
  if (!a || a.bed !== id) fix(`切到 ${id} 之後底噪是 ${a && a.bed}，預期 ${id}`);
  else ok(`切到 ${id} 底噪換過（gain ${a.gain}）`);
}

// 4. 夜晚：相位 .7 → night，音量比白天低
await setRegion('meadow');
await setTime(36);
await page.waitForTimeout(900);
const dayA = await ambient();
await setTime(168);   // .7
await page.waitForTimeout(900);
const nightA = await ambient();
if (!nightA) fix('夜間取不到環境音狀態');
else {
  if (!nightA.night) fix(`相位 0.7 應該是夜間（night=${nightA.night}）`);
  if (dayA && !(nightA.target < dayA.target + 0.001)) fix(`夜間音量 ${nightA.target} 沒有比白天 ${dayA.target} 低`);
  else ok(`夜間目標音量 ${nightA && nightA.target}（白天 ${dayA && dayA.target}）`);
}

// 5. 靜音 → 收掉；解除 → 回來
await page.evaluate(() => globalThis.__mistvaleSfx.muted(true));
await page.waitForTimeout(300);
const mutedA = await ambient();
if (mutedA && mutedA.playing) fix('靜音了還在播環境音');
else ok('靜音後環境音收掉');
await page.evaluate(() => globalThis.__mistvaleSfx.muted(false));
await page.waitForTimeout(700);
const backA = await ambient();
if (!backA || !backA.playing) fix('解除靜音後環境音沒有回來');
else ok(`解除靜音後底噪回來（${backA.bed}）`);

// 6. 稀疏點綴不能疊爆 voices；底噪不要在每次 frame 重開；鳥叫／蟲鳴要真的出現
const c0 = (await ambient()).count;
await page.waitForTimeout(12000);
const vCount = await page.evaluate(() => globalThis.__mistvaleSfx.voices());
const a2 = await ambient();
if (vCount > 6) fix(`環境音讓同時發聲數升到 ${vCount}，太多了`);
else ok(`同時發聲數 ${vCount}（含鳥叫／蟲鳴）`);
if (a2.count - c0 > 2) fix(`底噪被重開 ${a2.count - c0} 次，每一幀都在重建`);
else ok('底噪沒有每幀重建');
if (!(a2.chirps > 0)) fix('12 秒內一次鳥叫／蟲鳴都沒有');
else ok(`12 秒內稀疏點綴出現 ${a2.chirps} 次`);

// 7. 原始碼有接上（避免只改到測試鉤子）
const ui = fs.readFileSync('src/pixel-ui.js', 'utf8');
if (!/ambientSet\(game\.state\.region/.test(ui)) fix('src/pixel-ui.js 沒有在 frame 裡呼叫 ambientSet');

if (errs.length) fix(`頁面錯誤：${errs.slice(0, 2).join(' | ')}`);

await browser.close();
for (const m of fails) console.log('FIX ', m);
for (const m of oks) console.log('ok  ', m);
if (fails.length) { console.log(`\nFAIL ambient: ${fails.length} 個問題`); process.exit(1); }
console.log(`\nPASS ambient: 環境音底噪跟著區域與日夜換、靜音會收掉、回來會長回來、稀疏鳥叫不疊爆、底噪不會每幀重建（村落／森林／雪原／夜間都量過）`);
