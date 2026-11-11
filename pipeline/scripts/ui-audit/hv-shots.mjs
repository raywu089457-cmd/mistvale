// hv-shots.mjs — 獵魔村風格(UI-REF-HUNTER-VILLAGE)改前/改後截圖,四種視窗 × 主要面板。
// 用法: node pipeline/scripts/ui-audit/hv-shots.mjs <outdir> [sizes] [panels]
//   sizes  逗號分隔,例如 1440x900,1024x768,390x844,844x390(預設四種全拍)
//   panels 逗號分隔,例如 hud,build,hunters,inventory,quests,boss,settings(預設這 7 個)
//   寬或高 < 600 的視窗視為手機(isMobile、hasTouch、dsf 2)。TARGET= 可換網址。檔名 <W>x<H>-<面板>.png。
//   額外面板名:night(主 HUD 夜晚)、snow(主 HUD 鏡頭移到雪原)、trade、craft、dungeon、arena、hunter、toast、tooltip、confirm、cmdk、
//   offline、welcome、inspector、region、dispatch、worldmap、help、difficulty、recruit、codex(其餘名字直接當 data-action 開)
import { createRequire } from 'module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const OUT = path.resolve(process.argv[2] || 'output/ui-audit/hv-after');
const SIZES = (process.argv[3] || '1440x900,1024x768,390x844,844x390').split(',').map(s => s.split('x').map(Number));
const PANELS = (process.argv[4] || 'hud,build,hunters,inventory,quests,boss,settings').split(',');
fs.mkdirSync(OUT, { recursive: true });
const TARGET = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';

const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] });
for (const [w, h] of SIZES) {
  const phone = Math.min(w, h) < 600;
  const ctx = await b.newContext(phone ? { viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(TARGET, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 120000 });
  await page.evaluate(() => { const g = globalThis.__mistvaleGame; for (const id of Object.keys(g.state.buildings)) g.state.buildings[id] = Math.max(1, g.state.buildings[id]); for (const h of g.state.hunters) h.huntRegion = 'meadow'; });
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation-duration:0s!important;animation-delay:0s!important;caret-color:transparent!important}' });
  await page.waitForTimeout(5000);
  const reset = () => page.evaluate(() => {
    globalThis.__mistvaleCmdk?.close();
    try { globalThis.__mistvaleSelect?.(null); } catch {}
    document.querySelector('#unit-card [data-action=unitCardClose]')?.click();
    document.querySelectorAll('#pilotlab [data-pilot=close]').forEach(b => b.offsetParent && b.click());
    document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click();
    document.querySelector('#inspector:not(.hidden) [data-action=closeInspector]')?.click();
    document.querySelectorAll('#toasts .toast').forEach(t => t.remove());
  });
  const act = (a, id) => page.evaluate(([a, id]) => { const el = document.createElement('button'); el.dataset.action = a; if (id != null) el.dataset.id = id; el.style.display = 'none'; document.body.append(el); el.click(); el.remove(); }, [a, id]);
  for (const name of PANELS) {
    await reset(); await page.mouse.move(2, 2); await page.waitForTimeout(250);
    if (name === 'hud') { /* nothing */ }
    else if (name === 'night') { await page.evaluate(() => { const g = globalThis.__mistvaleGame; g.state.time = Math.floor((g.state.time || 0) / 240) * 240 + 180; }); await page.waitForTimeout(1500); }
    else if (name === 'snow') { await page.evaluate(() => { const g = globalThis.__mistvaleGame; g.state.time = Math.floor((g.state.time || 0) / 240) * 240 + 50; const v = globalThis.__mistvaleView; v.focus('region:snow'); v.zoomBy(1.5); }); await page.waitForTimeout(2500); }
    else if (name === 'hunter') await act('hunter', await page.evaluate(() => globalThis.__mistvaleGame.state.hunters[0].id));
    else if (name === 'cmdk') await page.evaluate(() => globalThis.__mistvaleCmdk.open());
    else if (name === 'toast') await page.evaluate(() => { globalThis.__toast('建造完成：鍛造屋 Lv.2'); globalThis.__toast('資源不足：還差 120 木材', false); });
    else if (name === 'tooltip') { const el = await page.$('#topbar .hv-tr2 [data-action=worldmap]'); if (el) await el.hover(); }
    else if (name === 'confirm') await page.evaluate(() => globalThis.__mistvaleConfirm('確定要重置村莊嗎？目前的進度會全部清除，無法復原。'));
    else if (name === 'offline') await page.evaluate(() => globalThis.__mistvaleShowOffline());
    else if (name === 'welcome') await act('welcomeReplay');
    else if (name === 'inspector') await act('selectBuilding', 'forge');
    else if (name === 'region') await act('regionDetail', 'meadow');
    else if (name === 'dispatch') await act('dispatchHunters');
    // 第二階段新增:世界內選取(六角鈕)、亮色對話框、名冊篩選展開、手動操控、建築資訊、單位小卡
    else if (name === 'select' || name === 'selinfo') { await page.evaluate(() => { const v = globalThis.__mistvaleView; v.focus('home'); }); await page.waitForTimeout(900); await page.evaluate(() => globalThis.__mistvaleSelect('forge')); await page.waitForTimeout(400); if (name === 'selinfo') await page.evaluate(() => document.querySelector('#hv-sel [data-action=selInfo]')?.click()); }
    else if (name === 'selhunter' || name === 'unitcard') { await page.evaluate(() => { const g = globalThis.__mistvaleGame, v = globalThis.__mistvaleView, h = g.state.hunters[0]; g.state.paused = true; v.lookAt(h.x, h.z, 2.2); }); await page.waitForTimeout(1200); await page.evaluate(() => globalThis.__mistvaleSelect('hunter:' + globalThis.__mistvaleGame.state.hunters[0].id)); await page.waitForTimeout(400); if (name === 'unitcard') await page.evaluate(() => document.querySelector('#hv-sel [data-action=selInfo]')?.click()); }
    else if (name === 'advisor') { await page.evaluate(() => { const b = document.querySelector('#next-step'); if (b) b.click(); else { const el = document.createElement('button'); el.dataset.action = 'nextStep'; el.dataset.act = 'build'; el.dataset.key = 'build'; el.innerHTML = '<span class="ns-tx">資源夠了，可以蓋新的建築</span><b class="ns-go">去建設</b>'; el.style.display = 'none'; document.body.append(el); el.click(); el.remove(); } }); }
    else if (name === 'rostermenu') { await act('hunters'); await page.waitForTimeout(300); await act('rosterMenu'); }
    else if (name === 'pilot') await act('pilotLab');
    else if (name === 'craftgear') { await act('craft'); await page.waitForTimeout(200); await act('craftTab', 'gear'); }
    else if (name === 'mapregion') { await act('worldmap'); await page.waitForTimeout(200); await act('regionDetail', 'meadow'); }
    else await act(name);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, `${w}x${h}-${name}.png`) });
  }
  await ctx.close();
}
await b.close();
console.log('hv-shots done →', OUT);
