// theme-shots.mjs — 主題導入前後的全面板截圖(2026-11-11,B・Mana Soul 導入用)。
// 用法: node pipeline/scripts/ui-audit/theme-shots.mjs <outdir> [desktop|phone|all]
//   desktop:1440x900 與 1024x768 各拍一輪全面板(dsf 1);phone:390x844 主 HUD 與建設(dsf 2,isMobile)。
//   檔名 <W>x<H>-<面板>.png。TARGET= 可換網址。動畫關掉、狀態固定,前後兩輪可直接並排比較。
import { createRequire } from 'module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const OUT = path.resolve(process.argv[2] || 'output/ui-audit/theme-shots');
const MODE = process.argv[3] || 'all';
fs.mkdirSync(OUT, { recursive: true });
const TARGET = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';

const DESKTOP = [
  ['hud'], ['build'], ['hunters'], ['hunter', 'H'], ['trade'], ['craft'], ['dungeon'], ['arena'], ['quests'],
  ['inventory'], ['worldmap'], ['region', 'meadow'], ['boss'], ['help'], ['settings'], ['offline'], ['welcome'],
  ['cmdk'], ['recruit'], ['difficulty'], ['dispatchHunters'], ['inspector', 'forge'], ['tooltip'], ['toast'],
];
const PHONE = [['hud'], ['build']];

const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] });
async function session(w, h, phone, list) {
  const ctx = await b.newContext(phone ? { viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(TARGET, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 120000 });
  await page.evaluate(() => { const g = globalThis.__mistvaleGame; for (const id of Object.keys(g.state.buildings)) g.state.buildings[id] = Math.max(1, g.state.buildings[id]); for (const h of g.state.hunters) h.huntRegion = 'meadow'; });
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation-duration:0s!important;animation-delay:0s!important;caret-color:transparent!important}' });
  await page.waitForTimeout(5000);
  const reset = () => page.evaluate(() => {
    globalThis.__mistvaleCmdk?.close();
    document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click();
    document.querySelector('#inspector:not(.hidden) [data-action=closeInspector]')?.click();
    document.querySelectorAll('#toasts .toast').forEach(t => t.remove());
  });
  const act = (a, id) => page.evaluate(([a, id]) => { const el = document.createElement('button'); el.dataset.action = a; if (id != null) el.dataset.id = id; el.style.display = 'none'; document.body.append(el); el.click(); el.remove(); }, [a, id]);
  for (const [name, id] of list) {
    await reset(); await page.mouse.move(2, 2); await page.waitForTimeout(250);
    if (name === 'hud') { /* nothing */ }
    else if (name === 'hunter') await act('hunter', await page.evaluate(() => globalThis.__mistvaleGame.state.hunters[0].id));
    else if (name === 'region') await act('regionDetail', id);
    else if (name === 'inspector') await act('selectBuilding', id);
    else if (name === 'offline') await page.evaluate(() => globalThis.__mistvaleShowOffline());
    else if (name === 'welcome') await act('welcomeReplay');
    else if (name === 'cmdk') await page.evaluate(() => globalThis.__mistvaleCmdk.open());
    else if (name === 'toast') await page.evaluate(() => { globalThis.__toast('建造完成：鍛造屋 Lv.2'); globalThis.__toast('資源不足：還差 120 木材', false); });
    else if (name === 'tooltip') {
      await act('hunters'); await page.waitForTimeout(400);
      const el = await page.$('#modal .hunter-card .hunter-health');
      if (el) await el.hover();
    }
    else await act(name, id);
    await page.waitForTimeout(name === 'worldmap' || name === 'offline' ? 900 : 500);
    await page.screenshot({ path: path.join(OUT, `${w}x${h}-${name}.png`) });
  }
  await ctx.close();
}
if (MODE === 'desktop' || MODE === 'all') { await session(1440, 900, false, DESKTOP); await session(1024, 768, false, DESKTOP); }
if (MODE === 'phone' || MODE === 'all') await session(390, 844, true, PHONE);
await b.close();
console.log('theme-shots done →', OUT);
