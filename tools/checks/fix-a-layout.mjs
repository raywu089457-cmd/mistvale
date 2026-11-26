// fix-a-layout.mjs — FIX-A 版面類:B3 / B7 / 缺口 8、12、20
//   B3  手動操控選角清單 #pilotlab:手機、橫向不能蓋住頂欄與行動徽章(那些按鈕中心點 elementFromPoint 要打到自己);
//       Esc、點外面、清單內「關閉」都能收
//   B7  離線戰報:「收下戰報」鈕不用捲就在視窗內、點得到(四種視窗)
//   缺口 8  難度色帶「初級」#difficulty-name 與任務標題 #hv-quest-title 不重疊;任務追蹤 #hv-quest 不蓋色帶按鈕
//   缺口 20 手機任務追蹤 #hv-quest 與日期標籤 #day-clock 熱區不重疊(2026-11-26 日期標籤隨日夜拿掉,元素不存在時這項自動略過)
//   缺口 12 手機/橫向放置列 #placement:不是滿寬實心橫條(寬 ≤ 視窗 70%),不蓋 #reopen-left、#pause-label、縮放鈕、行動徽章、頁籤列
import * as L from './fix-a-lib.mjs';
const srv = await L.startServer(); const browser = await L.launch();
const fails = []; const fix = m => fails.push(m);
const tapOrClick = async (page, v, sel) => { const l = page.locator(sel).first(); if (v.mobile) await l.tap({ timeout: 2500 }); else await l.click({ timeout: 2500 }); };
const openPilot = async page => { await L.act(page, 'settings'); await page.waitForTimeout(350); await L.act(page, 'pilotLab'); await page.waitForTimeout(450); };
const pilotOpen = page => page.evaluate(() => !!document.querySelector('#pilotlab'));
for (const view of ['desktop', 'tablet', 'phone', 'land']) {
  const v = L.VIEWS[view]; const ctx = await L.newCtx(browser, v); const page = await ctx.newPage();
  await L.boot(page, srv.url);
  // ── 缺口 8／20(新存檔、閒置主畫面)──
  const g = await L.ev(page, L => {
    const q = s => document.querySelector(s), a = q('#difficulty-name'), b = q('#hv-quest-title'), qq = q('#hv-quest'), day = q('#day-clock'), crest = q('.hv-crest');
    return { diffVsTitle: L.inter(L.R(a), L.R(b)), questVsDay: day && L.vis(day) ? L.inter(L.R(qq), L.R(day)) : 0, questVsCrest: L.inter(L.R(qq), L.R(crest)), quest: L.R(qq) };
  });
  if (g.diffVsTitle > 0) fix(`${view}: 難度色帶與任務標題重疊 ${g.diffVsTitle}px²`);
  if (g.questVsDay > 0) fix(`${view}: 任務追蹤與日期標籤熱區重疊 ${g.questVsDay}px²`);
  if (g.questVsCrest > 0) fix(`${view}: 任務追蹤蓋住難度徽記按鈕 ${g.questVsCrest}px²`);
  // ── B7 離線戰報 ──
  await page.evaluate(() => { for (const k of ['resources', 'buildings']) globalThis.__mistvaleGame.cheat(k); globalThis.__mistvaleShowOffline?.(); }); await page.waitForTimeout(650);
  const o = await L.ev(page, L => { const m = document.querySelector('#modal-backdrop:not(.hidden) #modal'); if (!m) return { open: false }; const b = [...m.querySelectorAll('button')].find(x => /收下/.test(x.textContent)); const r = L.R(b); return { open: true, r, inView: r.t >= 0 && r.b <= innerHeight + .5, hit: L.hit(b) }; });
  if (!o.open) fix(`${view}: 離線戰報沒打開`);
  else { if (!o.inView) fix(`${view}: 離線戰報「收下」鈕在視窗外(top ${o.r.t}、bottom ${o.r.b}、視窗高 ${v.h})`); if (!o.hit) fix(`${view}: 離線戰報「收下」鈕被蓋住`); }
  await page.evaluate(() => document.querySelector('#modal-backdrop:not(.hidden) [data-action=offlineOk],#modal-backdrop:not(.hidden) [data-action=close]')?.click()); await page.waitForTimeout(300);
  // ── B3 手動操控選角清單 ──
  await openPilot(page);
  const p = await L.ev(page, L => {
    const el = document.querySelector('#pilotlab'); if (!el) return { open: false };
    const out = { open: true, rect: L.R(el), covered: [] };
    for (const b of document.querySelectorAll('#topbar button,.hv-actions button,#bottom-bar button')) { if (!L.vis(b)) continue; if (!L.hit(b)) out.covered.push(L.name(b)); }
    return out;
  });
  if (!p.open) fix(`${view}: 手動操控選角清單沒打開`);
  else {
    if (v.mobile && p.covered.length) fix(`${view}: 選角清單蓋住頂欄/行動徽章/頁籤列按鈕:${p.covered.join('、')}`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    if (await pilotOpen(page)) fix(`${view}: Esc 收不掉選角清單`);
    await openPilot(page); await page.mouse.click(Math.round(v.w * .5), Math.round(v.h * .4)).catch(() => {}); await page.waitForTimeout(300);
    if (await pilotOpen(page)) fix(`${view}: 點清單外面收不掉選角清單`);
    await openPilot(page);
    try { await tapOrClick(page, v, '#pilotlab [data-pilot=close]'); } catch (e) { fix(`${view}: 清單內「關閉」點不到 ${String(e.message).split('\n')[0].slice(0, 70)}`); }
    await page.waitForTimeout(300);
    if (await pilotOpen(page)) fix(`${view}: 清單內「關閉」收不掉選角清單`);
  }
  // ── 缺口 12 放置列(手機、橫向)──
  if (v.mobile) {
    await page.evaluate(() => { document.querySelector('#reopen-left')?.classList.remove('hidden'); globalThis.__mistvaleGame.state.paused = true; });
    await L.act(page, 'moveBuilding', 'forge'); await page.waitForTimeout(600);
    const pl = await L.ev(page, L => {
      const e = document.querySelector('#placement'), r = L.R(e), out = { r, ratio: r.w / innerWidth, over: [] };
      for (const s of ['#reopen-left', '#pause-label', '#bottom-bar', '#hv-left', '.hv-actions', '.view-tools']) { const x = document.querySelector(s); if (x && L.vis(x)) { const o = L.inter(r, L.R(x)); if (o > 0) out.over.push(s + ':' + o); } }
      for (const b of document.querySelectorAll('.view-tools button,.hv-actions button,#bottom-bar button,#topbar button')) { if (!L.vis(b)) continue; const o = L.inter(r, L.R(b)); if (o > 0) out.over.push(L.name(b) + ':' + o); }
      return out;
    });
    if (pl.ratio > 0.7) fix(`${view}: 放置列寬 ${pl.r.w}px = 視窗 ${(pl.ratio * 100).toFixed(0)}%(滿寬實心橫條)`);
    if (pl.over.length) fix(`${view}: 放置列蓋到 ${pl.over.join('、')}`);
    await L.act(page, 'cancelMove');
  }
  console.log(view, JSON.stringify({ g, o: o.open && o.r && [o.r.t, o.r.b], pilot: p.open && p.covered }));
  await ctx.close();
}
await browser.close(); srv.stop();
if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('PASS fix-a-layout: 手動操控清單、離線戰報收下鈕、任務欄與難度色帶/日期標籤、放置列版面');
