// fix-a-shots.mjs — FIX-A 修後截圖(拼圖用):輸出 output/ui-audit/fix-a/cells/NN-名稱.png,再用 python pipeline/scripts/ui-audit/fix-a-collage.py 拼成 after.png
// 用法: TARGET=http://127.0.0.1:5183/ node pipeline/scripts/ui-audit/fix-a-shots.mjs
import * as L from '../../../tools/checks/fix-a-lib.mjs';
import fs from 'node:fs';
const OUT = 'output/ui-audit/fix-a/cells'; fs.mkdirSync(OUT, { recursive: true });
const srv = await L.startServer(); const browser = await L.launch();
const rich = page => page.evaluate(() => { for (const k of ['resources', 'buildings', 'levels', 'heal']) globalThis.__mistvaleGame.cheat(k); });
const fresh = async (view, o) => { const ctx = await L.newCtx(browser, L.VIEWS[view]); const page = await ctx.newPage(); await L.boot(page, srv.url, o); return page; };
const shot = (page, n) => page.screenshot({ path: `${OUT}/${n}.png` });
const dungeon = page => page.evaluate(() => { const g = globalThis.__mistvaleGame; g.startDungeon(g.state.hunters.slice(0, 3).map(h => h.id)); for (let i = 0; i < 40; i++) g.tick(.25); });
const toasts = async page => { await L.act(page, 'construct', 'forge'); await L.act(page, 'upgrade', 'forge'); await L.act(page, 'construct', 'hall'); await page.waitForTimeout(700); };
let p;
p = await fresh('phone'); await rich(p); await dungeon(p); await p.waitForTimeout(900); await shot(p, '01-b1-phone-run-hud'); await p.close();
p = await fresh('land'); await rich(p); await dungeon(p); await p.waitForTimeout(900); await shot(p, '02-b9-land-run-hud'); await p.close();
p = await fresh('phone'); await rich(p); await p.evaluate(() => { globalThis.__mistvaleGame.state.paused = true; }); await L.act(p, 'moveBuilding', 'forge'); await p.waitForTimeout(700); await shot(p, '03-b2-gap12-phone-placement'); await p.close();
p = await fresh('phone'); await rich(p); await L.act(p, 'settings'); await p.waitForTimeout(300); await L.act(p, 'pilotLab'); await p.waitForTimeout(500); await shot(p, '04-b3-phone-pilot-drawer'); await p.close();
p = await fresh('phone'); await rich(p); await p.evaluate(() => globalThis.__mistvaleSelect('hunter:' + globalThis.__mistvaleGame.state.hunters[0].id)); await p.waitForTimeout(300); await L.act(p, 'selInfo'); await p.waitForTimeout(500); await shot(p, '05-b4-phone-unit-card'); await p.close();
p = await fresh('phone'); await rich(p); await toasts(p); await shot(p, '06-toast-phone-closed'); await p.close();
p = await fresh('phone'); await rich(p); await L.act(p, 'dungeon'); await p.waitForTimeout(600); await toasts(p); await shot(p, '07-toast-phone-panel'); await p.close();
p = await fresh('tablet'); await rich(p); await L.act(p, 'trade'); await p.waitForTimeout(600); await toasts(p); await shot(p, '08-toast-tablet-panel'); await p.close();
p = await fresh('land'); await p.evaluate(() => globalThis.__mistvaleShowOffline?.()); await p.waitForTimeout(700); await shot(p, '09-b7-land-offline'); await p.close();
p = await fresh('land'); await shot(p, '10-gap8-land-hud'); await p.close();
p = await fresh('phone'); await shot(p, '11-gap20-phone-hud'); await p.close();
p = await fresh('phone', { keepTitle: true, closeModal: false }); await p.waitForSelector('#title-screen', { timeout: 8000 }); await p.waitForTimeout(1500); await shot(p, '12-b5-phone-new-player-title'); await p.close();
await browser.close(); srv.stop();
console.log('cells →', OUT);
