// fix-a-unitcard.mjs — FIX-A B4 / 缺口 7:獵人小卡 #unit-card
//   · 關閉鈕 .uc-x 熱區:桌機 ≥32px、手機(觸控)≥44px
//   · 手機(直向、橫向)上小卡不能蓋住 .view-tools 縮放鈕:每顆縮放鈕中心點 elementFromPoint 要打到自己
//   · 關閉鈕點得到、會關掉小卡
import * as L from './fix-a-lib.mjs';
const srv = await L.startServer(); const browser = await L.launch();
const fails = []; const fix = m => fails.push(m);
for (const view of ['desktop', 'tablet', 'phone', 'land']) {
  const v = L.VIEWS[view]; const ctx = await L.newCtx(browser, v); const page = await ctx.newPage();
  await L.boot(page, srv.url);
  await page.evaluate(() => { for (const k of ['resources', 'buildings']) globalThis.__mistvaleGame.cheat(k); globalThis.__mistvaleSelect('hunter:' + globalThis.__mistvaleGame.state.hunters[0].id); });
  await page.waitForTimeout(400); await L.act(page, 'selInfo'); await page.waitForTimeout(500);
  const r = await L.ev(page, (L) => {
    const c = document.querySelector('#unit-card'); if (!c) return { card: false };
    const x = c.querySelector('.uc-x'), out = { card: true, rect: L.R(c), x: L.R(x), xHit: L.hit(x), tools: [] };
    for (const b of document.querySelectorAll('.view-tools button')) { if (!L.vis(b)) continue; out.tools.push({ n: L.name(b), hit: L.hit(b) }); }
    return out;
  });
  if (!r.card) { fix(`${view}: 選獵人按資訊後沒有出現小卡`); await ctx.close(); continue; }
  const min = v.mobile ? 44 : 32;
  if (r.x.w < min - 0.5 || r.x.h < min - 0.5) fix(`${view}: 關閉鈕 ${r.x.w}x${r.x.h}px < ${min}px`);
  if (!r.xHit) fix(`${view}: 關閉鈕中心點被別的元素蓋住`);
  const covered = r.tools.filter(t => !t.hit).map(t => t.n);
  if (covered.length) fix(`${view}: 小卡蓋住縮放鈕 ${covered.join(', ')}`);
  console.log(view, JSON.stringify({ x: [r.x.w, r.x.h], tools: r.tools.length, covered }));
  try { if (v.mobile) await page.locator('#unit-card .uc-x').tap({ timeout: 2500 }); else await page.locator('#unit-card .uc-x').click({ timeout: 2500 }); } catch (e) { fix(`${view}: 關閉鈕點不到 ${String(e.message).split('\n')[0].slice(0, 80)}`); }
  await page.waitForTimeout(300);
  if (await page.evaluate(() => !!document.querySelector('#unit-card'))) fix(`${view}: 按關閉鈕後小卡還在`);
  await ctx.close();
}
await browser.close(); srv.stop();
if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('PASS fix-a-unitcard: 關閉鈕熱區夠大、小卡不蓋縮放鈕');
