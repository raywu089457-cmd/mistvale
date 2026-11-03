// shots-all.mjs — 每個彈窗/介面各截一張(桌機或手機),給 UI 審視用。
// 用法: node pipeline/scripts/ui-audit/shots-all.mjs [desktop|phone] [outdir] [WxH]   預設輸出 output/ui-audit/shots/(不進 git)。TARGET= 可換網址。
//   argv[4] 可指定手機視窗尺寸（例如 375x812），沒給就維持 402x712。
import { createRequire } from 'module';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const MODE = process.argv[2] || 'desktop', OUT = (process.argv[3] || fileURLToPath(new URL('../../../output/ui-audit/shots', import.meta.url))) + '/';
fs.mkdirSync(OUT, { recursive: true });
const PHONE = MODE === 'phone';
// optional 4th arg: phone viewport size, e.g. 375x812 (falls back to the long-standing 402x712)
const SIZE = /^(\d+)x(\d+)$/.exec(process.argv[4] || '');
const PHONE_W = SIZE ? Number(SIZE[1]) : 402, PHONE_H = SIZE ? Number(SIZE[2]) : 712;
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] });
const page = await (await b.newContext(PHONE ? { viewport: { width: PHONE_W, height: PHONE_H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(process.env.TARGET || 'http://100.79.149.0:5024/?preview=1', { waitUntil: 'commit', timeout: 120000 });
await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 120000 });
await page.evaluate(() => { const g = globalThis.__mistvaleGame; for (const id of Object.keys(g.state.buildings)) g.state.buildings[id] = Math.max(1, g.state.buildings[id]); for (const h of g.state.hunters) h.huntRegion = 'meadow'; });
await page.waitForTimeout(6000);
const act = (a, id) => page.evaluate(([a, id]) => { document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click(); const el = document.createElement('button'); el.dataset.action = a; if (id != null) el.dataset.id = id; document.body.append(el); el.click(); el.remove(); }, [a, id]);
const list = [['hud'], ['worldmap'], ['build'], ['hunters'], ['hunter', 'H'], ['recruit'], ['trade'], ['craft'], ['dungeon'], ['arena'], ['quests'], ['inventory'], ['difficulty'], ['settings'], ['help'], ['boss'], ['dispatchHunters'], ['selectBuilding', 'forge']];
for (const [a, id] of list) {
  if (a !== 'hud') await act(a, id === 'H' ? await page.evaluate(() => globalThis.__mistvaleGame.state.hunters[0].id) : id);
  await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}${MODE}-${a}.png` });
  if (a === 'selectBuilding') await page.evaluate(() => document.querySelector('[data-action=closeInspector]')?.click());
}
await b.close(); console.log('done');
