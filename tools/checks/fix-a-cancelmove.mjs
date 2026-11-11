// fix-a-cancelmove.mjs — FIX-A B2:移動建築時放置提示上的「取消」要真的有用
//   · 按「取消」→ 提示收起、退出移動模式(游標回 grab)、建築留在原位、之後點場景不會再搬建築
//   · 取消鈕可點(中心點打到自己)、觸控 ≥44px
//   · 觸控裝置沒有 Esc:畫布提示文字在觸控裝置不能寫「ESC 取消」(原始碼要有觸控版字樣)
//   · Esc 仍然能取消(桌機)
import * as L from './fix-a-lib.mjs';
import fs from 'node:fs';
const srv = await L.startServer(); const browser = await L.launch();
const fails = []; const fix = m => fails.push(m);
const world = fs.readFileSync(new URL('../../src/pixel-world.js', import.meta.url), 'utf8');
if (!/PLACE_HINT_COARSE\?'點擊放置 · 點取消鈕結束'/.test(world)) fix('pixel-world.js:觸控裝置的放置提示沒有改成「點取消鈕結束」');
for (const view of ['desktop', 'tablet', 'phone', 'land']) {
  const v = L.VIEWS[view]; const ctx = await L.newCtx(browser, v); const page = await ctx.newPage();
  await L.boot(page, srv.url);
  await page.evaluate(() => { for (const k of ['resources', 'buildings']) globalThis.__mistvaleGame.cheat(k); });
  const pos0 = await page.evaluate(() => JSON.stringify(globalThis.__mistvaleGame.state.layout.forge));
  await L.act(page, 'moveBuilding', 'forge'); await page.waitForTimeout(400);
  const st = await L.ev(page, (L) => { const p = document.querySelector('#placement'), b = p.querySelector('[data-action=cancelMove]'); return { shown: L.vis(p), r: L.R(b), hit: L.hit(b), cursor: document.querySelector('#world').style.cursor }; });
  if (!st.shown) { fix(`${view}: 移動建築沒有出現放置提示`); await ctx.close(); continue; }
  if (!st.hit) fix(`${view}: 取消鈕中心點被別的元素蓋住`);
  if (v.mobile && st.r.h < 43.5) fix(`${view}: 取消鈕高 ${st.r.h}px < 44px`);
  if (st.cursor !== 'crosshair') fix(`${view}: 進入移動模式後游標不是 crosshair(${st.cursor})`);
  try { if (v.mobile) await page.locator('#placement [data-action=cancelMove]').tap({ timeout: 2500 }); else await page.locator('#placement [data-action=cancelMove]').click({ timeout: 2500 }); } catch (e) { fix(`${view}: 取消鈕點不到 ${String(e.message).split('\n')[0].slice(0, 80)}`); }
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({ shown: !document.querySelector('#placement').classList.contains('hidden'), cursor: document.querySelector('#world').style.cursor, pos: JSON.stringify(globalThis.__mistvaleGame.state.layout.forge) }));
  if (after.shown) fix(`${view}: 按取消後放置提示還在`);
  if (after.cursor === 'crosshair') fix(`${view}: 按取消後仍在移動模式(游標 crosshair)`);
  if (after.pos !== pos0) fix(`${view}: 取消後建築位置變了`);
  // 取消後點場景不能再搬建築
  await page.mouse.click(Math.round(v.w * .3), Math.round(v.h * .5)).catch(() => {}); await page.waitForTimeout(250);
  const pos2 = await page.evaluate(() => JSON.stringify(globalThis.__mistvaleGame.state.layout.forge));
  if (pos2 !== pos0) fix(`${view}: 取消後點場景還是把建築搬走了`);
  // Esc 路徑仍然可用(桌機)
  if (!v.mobile) {
    await L.act(page, 'moveBuilding', 'forge'); await page.waitForTimeout(250); await page.keyboard.press('Escape'); await page.waitForTimeout(250);
    if (await page.evaluate(() => !document.querySelector('#placement').classList.contains('hidden'))) fix(`${view}: Esc 不能取消移動模式`);
  }
  console.log(view, JSON.stringify({ btnH: st.r.h, hit: st.hit, afterShown: after.shown, cursor: after.cursor, moved: pos2 !== pos0 }));
  await ctx.close();
}
await browser.close(); srv.stop();
if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('PASS fix-a-cancelmove: 取消鈕可點、退出移動模式、建築不動、觸控提示文字');
