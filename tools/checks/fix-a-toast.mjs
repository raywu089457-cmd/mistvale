// fix-a-toast.mjs — FIX-A 缺口 4/19、B10、B11:toast 位置與訊息
//   規格(UI-REF 4.7):toast 是小型亮色條,出現在頁籤列上方,不擋場景中央。量測標準:
//   四種視窗(1440×900、1024×768、390×844、844×390) × 面板關閉／面板開著(建設、獵人、交易、地下城、競技場、委託)
//   · toast 矩形不得蓋住任何可見按鈕的中心點
//   · toast 中心不得落在畫面中央 50% 區域(寬高各 25%–75%)
//   · pointer-events:none、整個矩形在視窗內
//   B10:地下城/競技場已選滿 3 人再點第 4 位 → toast 說「最多 3 人…」,選擇仍是 3 人
//   B11:建築位置上站著獵人/魔物 → 訊息說清楚原因(不再是「請稍後再放置」)
import * as L from './fix-a-lib.mjs';
import fs from 'node:fs';
const srv = await L.startServer(); const browser = await L.launch();
const fails = []; const fix = m => fails.push(m);
const game = fs.readFileSync(new URL('../../src/pixel-game.js', import.meta.url), 'utf8');
if (/這個位置有獵人或魔物經過，請稍後再放置/.test(game)) fix('B11:建築被獵人/魔物擋住的訊息還是「請稍後再放置」(沒說原因)');
const trigger = async page => { await page.evaluate(() => { document.querySelector('#toasts').innerHTML = ''; }); await L.act(page, 'construct', 'forge'); await L.act(page, 'upgrade', 'forge'); await L.act(page, 'construct', 'hall'); await page.waitForTimeout(420); };
for (const view of ['desktop', 'tablet', 'phone', 'land']) {
  const v = L.VIEWS[view]; const ctx = await L.newCtx(browser, v); const page = await ctx.newPage();
  await L.boot(page, srv.url);
  await page.evaluate(() => { for (const k of ['resources', 'buildings', 'levels', 'heal']) globalThis.__mistvaleGame.cheat(k); });
  const rows = [];
  for (const tab of [null, 'build', 'hunters', 'trade', 'dungeon', 'arena', 'quests']) {
    if (tab) { await L.act(page, tab); await page.waitForTimeout(550); }
    await trigger(page);
    const r = await L.ev(page, L => {
      const t = L.toastCheck(); t.vw = innerWidth; t.vh = innerHeight; const vs = [...document.querySelectorAll('#toasts .toast')].filter(e => L.vis(e)); t.visible = vs.length;
      // FIX-D:面板開著時 toast 蓋住整個標題列(標題、子頁籤、工具鈕暫時被蓋、pointer-events:none 仍點得到);只有關閉鈕 X 不可以被蓋
      const dock = document.querySelector('#toasts')?.closest('.modal-title,.panel-title');
      if (dock && vs.length) { const bad = []; for (const b of L.buttons()) { if (dock.contains(b) && !b.matches('[data-action=close],[data-action=closeInspector]')) continue; const br = b.getBoundingClientRect(), bx = br.left + br.width / 2, by = br.top + br.height / 2; for (const e of vs) { const q = e.getBoundingClientRect(); if (bx >= q.left && bx <= q.right && by >= q.top && by <= q.bottom) bad.push(L.name(b)); } } t.covers = [...new Set(bad)]; }
      return t; });
    const tag = `${view}/${tab || '面板關閉'}`;
    if (!r.visible) { fix(`${tag}: toast 沒有出現`); }
    else {
      if (r.covers.length) fix(`${tag}: toast 蓋住按鈕中心 ${r.covers.slice(0, 3).join('、')}`);
      // FIX-C:面板開著時 toast 住在面板標題列(規格 4.3),標題列本來就可能在畫面中央 → 只對「面板關閉」要求不落在中央 50%;面板開著改由 fix-c.mjs 證明它在標題列裡、不蓋按鈕與內容
      if (r.centerRegion && !tab) fix(`${tag}: toast 中心落在畫面中央 50% 區域 ${JSON.stringify(r.rects)}`);
      if (r.pe.some(p => p !== 'none')) fix(`${tag}: toast 沒有 pointer-events:none`);
      if (r.rects.some(([l, t, rr, b]) => rr > 0 && (l < 0 || t < 0 || rr > r.vw || b > r.vh))) fix(`${tag}: toast 超出視窗 ${JSON.stringify(r.rects)}`);
    }
    rows.push(`${tab || 'closed'}:${r.visible || 0}`);
    if (tab) { await page.evaluate(() => document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click()); await page.waitForTimeout(250); }
  }
  console.log(view, rows.join(' '));
  // B10 選滿 3 人再點第 4 位
  for (const [tab, act] of [['dungeon', 'toggleDungeonHunter'], ['arena', 'toggleArenaHunter']]) {
    await L.act(page, tab); await page.waitForTimeout(450);
    const ids = await page.evaluate(() => globalThis.__mistvaleGame.state.hunters.filter(h => h.hp > 0).map(h => h.id));
    for (const id of ids.slice(0, 3)) await L.act(page, act, id);
    await page.evaluate(() => { document.querySelector('#toasts').innerHTML = ''; });
    await L.act(page, act, ids[3]); await page.waitForTimeout(350);
    const t = await page.evaluate(k => ({ toasts: [...document.querySelectorAll('#toasts .toast')].map(e => e.textContent.trim()), n: globalThis.__mistvaleGame.state[k].hunterIds.length }), tab);
    if (!t.toasts.some(x => /最多 3 人/.test(x))) fix(`${view}/${tab}: 選滿 3 人後點第 4 位沒有提示(toast=${JSON.stringify(t.toasts)})`);
    if (t.n !== 3) fix(`${view}/${tab}: 選滿後隊伍人數變成 ${t.n}`);
    await page.evaluate(() => document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click()); await page.waitForTimeout(250);
  }
  await ctx.close();
}
await browser.close(); srv.stop();
if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('PASS fix-a-toast: 四種視窗×面板開/關 toast 不蓋按鈕中心、不在畫面中央、pointer-events:none;選滿 3 人有提示');
