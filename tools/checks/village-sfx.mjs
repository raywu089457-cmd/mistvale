// village-sfx.mjs — T113：村莊裡「有來源」的聲音（鐵匠鋪打鐵、酒館人聲、交易所零錢、大廳鐘聲）。
//   * 依建築等級決定間隔（等級越高越忙），沒這棟建築就沒有聲音。
//   * 只在相機看得到村莊時響：把鏡頭移開村莊就停，移回來就恢復。
//   * 靜音會收掉、解除靜音會長回來。
// Usage: node tools/checks/village-sfx.mjs          (game server on 5024 expected)
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'node:module';
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
await page.waitForTimeout(900);

// 第一次手勢上膛（音訊政策）；鏡頭固定在村莊，並給一組村莊建築等級
await page.mouse.click(720, 500);
await page.waitForTimeout(300);
await page.evaluate(() => {
  const g = globalThis.__mistvaleGame;
  g.state.paused = true;   // 凍結世界，避免相機被跟隨邏輯拉走
  Object.assign(g.state.buildings, { hall: 3, forge: 3, tavern: 2, trading: 2 });
  globalThis.__mistvaleView.lookAt(-15, 3, 2.2);
});
await page.waitForTimeout(1500);

const vState = () => page.evaluate(() => globalThis.__mistvaleAmbient.village());
const camXZ = () => page.evaluate(() => globalThis.__mistvaleView.cameraXZ());
const fired = async () => (await vState()).fired;

// 1) 來源與間隔依等級算出來
let v = await vState();
const ids = v.active.map(a => a.id);
const cam = await camXZ();
ok(`相機中心 (${cam.x.toFixed(1)}, ${cam.z.toFixed(1)})，來源：${v.active.map(a => `${a.id} Lv.${a.lv} ${a.everyMs}ms`).join(' / ')}`);
for (const id of ['forge', 'tavern', 'trading', 'hall']) if (!ids.includes(id)) fix(`建築等級都給了，卻沒有 ${id} 的聲音來源`);
const every = id => v.active.find(a => a.id === id)?.everyMs || 0;
if (!(every('forge') > 0 && every('tavern') > every('forge'))) fix(`間隔不合理：forge ${every('forge')}ms tavern ${every('tavern')}ms`);
if (every('hall') && every('hall') < 12000) fix(`大廳鐘聲間隔太短：${every('hall')}ms`);

// 2) 真的會響（等 12 秒）
await page.waitForTimeout(12000);
let f = await fired();
for (const id of ['forge', 'tavern', 'trading']) if (!(f[id] >= 1)) fix(`等了 12 秒，${id} 一次都沒有響（fired=${JSON.stringify(f)}）`);
if (f.forge >= 1 && f.tavern >= 1) ok(`12 秒內實際響了：打鐵 ${f.forge} 次、酒館 ${f.tavern} 次、交易所 ${f.trading} 次`);

// 3) 等級越高越忙（間隔變短）
const before = every('forge');
await page.evaluate(() => { globalThis.__mistvaleGame.state.buildings.forge = 1; });
await page.waitForTimeout(700);
v = await vState();
const after = every('forge');
if (!(after > before)) fix(`鐵匠鋪降級後間隔沒有變長（Lv.3 ${before}ms → Lv.1 ${after}ms）`);
else ok(`等級影響間隔：鐵匠鋪 Lv.3 ${before}ms → Lv.1 ${after}ms`);

// 4) 拆掉建築就沒有聲音
await page.evaluate(() => { globalThis.__mistvaleGame.state.buildings.forge = 0; });
await page.waitForTimeout(800);
v = await vState();
if (v.active.some(a => a.id === 'forge')) fix('鐵匠鋪拆掉後仍然有打鐵聲來源');
else if (v.timers !== v.active.length) fix(`拆掉鐵匠鋪後計時器 ${v.timers} 個，跟來源 ${v.active.length} 個對不上`);
else ok('拆掉鐵匠鋪後打鐵聲與它的計時器都消失');

// 5) 鏡頭移開村莊就停、移回來恢復
await page.evaluate(() => { globalThis.__mistvaleGame.state.buildings.forge = 3; });
await page.waitForTimeout(900);
await page.evaluate(() => globalThis.__mistvaleView.lookAt(70, 70, 2.2));
await page.waitForTimeout(900);
const camOut = await camXZ();
const beforeLeave = await fired();
const timersOut = (await vState()).timers;
await page.waitForTimeout(4200);
const afterLeave = await fired();
if (timersOut > 0) fix(`鏡頭離開村莊後仍有 ${timersOut} 個村莊計時器`);
else if (afterLeave.forge !== beforeLeave.forge) fix(`鏡頭離開村莊後打鐵聲仍在響（${beforeLeave.forge} → ${afterLeave.forge}）`);
else ok(`鏡頭移到 (${camOut.x.toFixed(0)}, ${camOut.z.toFixed(0)})：村莊音停止`);

await page.evaluate(() => globalThis.__mistvaleView.lookAt(-15, 3, 2.2));
await page.waitForTimeout(5200);
const back = await fired();
if (!(back.forge > afterLeave.forge)) fix(`鏡頭回到村莊後打鐵聲沒有恢復（${afterLeave.forge} → ${back.forge}）`);
else ok(`鏡頭回到村莊後打鐵聲恢復（${afterLeave.forge} → ${back.forge}）`);

// 6) 靜音會收掉、解除靜音會長回來
await page.evaluate(() => globalThis.__mistvaleSfx.muted(true));
await page.waitForTimeout(900);
const timersMuted = (await vState()).timers;
const afterMute = await fired();
await page.waitForTimeout(3200);
const stillMuted = await fired();
if (timersMuted > 0) fix(`靜音後還有 ${timersMuted} 個村莊計時器在跑`);
else if (stillMuted.forge !== afterMute.forge) fix(`靜音 3 秒後打鐵次數又變了（${afterMute.forge} → ${stillMuted.forge}）`);
else ok('靜音後村莊音全部收掉');

await page.evaluate(() => globalThis.__mistvaleSfx.muted(false));
await page.waitForTimeout(5200);
const afterUnmute = await fired();
if (!(afterUnmute.forge > stillMuted.forge)) fix(`解除靜音後打鐵聲沒有回來（${stillMuted.forge} → ${afterUnmute.forge}）`);
else ok(`解除靜音後打鐵聲回來（${stillMuted.forge} → ${afterUnmute.forge}）`);

if (errs.length) fix(`頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
await browser.close();

if (fails.length) {
  for (const f2 of fails) console.log('FIX ' + f2);
  for (const o of oks) console.log('ok  ' + o);
  process.exit(1);
}
for (const o of oks) console.log('ok  ' + o);
console.log('PASS village sfx: 村莊有來源的聲音（打鐵／酒館人聲／交易所零錢／大廳鐘聲）依建築等級決定間隔，拆掉就沒有、鏡頭離開村莊會停、靜音會收掉、回來都會恢復');
