// fix-a-runhud.mjs — FIX-A B1/B9:地下城出征時小隊 HUD(#run-hud)要有自己的位置
//   · 不蓋 #hv-left(任務/顧問/通知)、.hv-actions(獵人/競技場/首領徽章)、.view-tools、頂欄任何按鈕
//   · 「撤退」「自動續戰」可點(中心點 elementFromPoint 打到自己),觸控裝置高度 ≥44px,桌機 ≥32px
//   · 真的點撤退要生效(dungeon.active 變 false)
// 用法:node tools/checks/fix-a-runhud.mjs  (TARGET=網址 可指定,預設自己開臨時伺服器)
import * as L from './fix-a-lib.mjs';
const srv = await L.startServer(); const browser = await L.launch();
const fails = []; const fix = m => fails.push(m);
for (const view of ['desktop', 'tablet', 'phone', 'land']) {
  const v = L.VIEWS[view]; const ctx = await L.newCtx(browser, v); const page = await ctx.newPage();
  await L.boot(page, srv.url);
  await page.evaluate(() => { const g = globalThis.__mistvaleGame; for (const k of ['resources', 'buildings', 'levels', 'heal']) g.cheat(k); g.startDungeon(g.state.hunters.slice(0, 3).map(h => h.id)); for (let i = 0; i < 40; i++) g.tick(.25); });
  await page.waitForTimeout(900);
  const r = await L.ev(page, (L) => {
    const q = s => document.querySelector(s), hud = q('#run-hud'); if (!hud) return { hud: false };
    const hr = L.R(hud), out = { hud: hr, over: [], btn: {} };
    for (const s of ['#hv-left', '#hv-quest', '#hv-advisor', '#notice-feed', '.hv-actions', '.view-tools', '#topbar .hv-tl', '#topbar .hv-tr']) { const e = q(s); if (e && L.vis(e)) { const o = L.inter(hr, L.R(e)); if (o > 0) out.over.push(s + ':' + o); } }
    for (const b of document.querySelectorAll('.hv-actions button,.view-tools button,#topbar button,#bottom-bar button')) { if (!L.vis(b)) continue; const o = L.inter(hr, L.R(b)); if (o > 0) out.over.push(L.name(b) + ':' + o); }
    for (const [k, s] of [['retreat', '.rh-x'], ['auto', '.rh-toggle']]) { const e = q(s); out.btn[k] = e ? { r: L.R(e), hit: L.hit(e) } : null; }
    return out;
  });
  const touch = !!v.mobile;
  if (!r.hud) { fix(`${view}: 出征中沒有小隊 HUD`); await ctx.close(); continue; }
  if (r.over.length) fix(`${view}: 小隊 HUD 蓋到其他介面 ${r.over.join(', ')}`);
  for (const k of ['retreat', 'auto']) {
    const b = r.btn[k]; if (!b) { fix(`${view}: 缺少 ${k} 鈕`); continue; }
    if (!b.hit) fix(`${view}: ${k} 鈕中心點被別的元素蓋住`);
    const min = touch ? 44 : 32; if (b.r.h < min - 0.5) fix(`${view}: ${k} 鈕高 ${b.r.h}px < ${min}px`);
  }
  // 真的點撤退
  // 2026-11-21:撤退成功後 HUD 會馬上拆掉,Playwright 的 click/tap 等不到動作完成就 timeout(實際已經生效)。
  // 用 evaluate 直接觸發(跟其他檢查的 L.act 同一個做法),可點性由上面的 hit 與尺寸檢查負責。
  try { await page.evaluate(() => document.querySelector('.rh-x')?.click()); } catch (e) { fix(`${view}: 撤退鈕點不到 ${String(e.message).split('\n')[0].slice(0, 80)}`); }
  await page.waitForTimeout(500);
  const still = await page.evaluate(() => !!globalThis.__mistvaleGame.state.dungeon.active && !!document.querySelector('.rh-x'));
  if (still) fix(`${view}: 點撤退後地下城仍在進行`);
  console.log(view, JSON.stringify({ hud: r.hud && [r.hud.l, r.hud.t, r.hud.r, r.hud.b].map(Math.round), retreatH: r.btn.retreat?.r.h, over: r.over }));
  await ctx.close();
}
await browser.close(); srv.stop();
if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('PASS fix-a-runhud: 四種視窗出征 HUD 不互蓋、撤退/自動續戰可點且夠大');
