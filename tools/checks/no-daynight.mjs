// no-daynight.mjs — 2026-11-26 拿掉遊戲內白天黑夜(使用者:需要白天黑夜作為條件的機制一律改用真實世界時間)
//   取代已刪除的 day-clock.mjs(T134 頂部晝夜時鐘)、night-lights.mjs(T131 夜色＋門前暖光)、night-windows.mjs(T133 窗光)。
//   * 頂欄沒有「第 N 天 · 白天/夜晚」時鐘;topbar 桌機與手機都不溢出、按鈕不互相重疊
//   * 把遊戲時間撥到以前的「深夜」(time % 240 = 180)畫面也不會變暗:沒有正片疊底的夜色覆蓋層、沒有燈光層、沒有 __mistvaleNight
//   * 設定面板沒有「夜晚變暗」
//   * 招募卡的婉拒冷卻顯示真實時間(「N 分鐘後」),不是「明天」
// Usage: node tools/checks/no-daynight.mjs            (自己開臨時伺服器;或 $env:TARGET='http://127.0.0.1:5052/')
//        $env:SHOTS='1'; node tools/checks/no-daynight.mjs   → output/no-daynight/*.png
// Exit: 0 = PASS line only, 1 = FIX lines.
import fs from 'node:fs';
import * as L from './fix-a-lib.mjs';

const fails = [], oks = [];
const fix = m => fails.push(m), ok = m => oks.push(m);
const SHOTS = !!process.env.SHOTS;
if (SHOTS) fs.mkdirSync('output/no-daynight', { recursive: true });

const srv = await L.startServer();
const browser = await L.launch();
try {
  for (const view of ['desktop', 'phone']) {
    const v = L.VIEWS[view], ctx = await L.newCtx(browser, v), page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await L.boot(page, srv.url);
    // 以前的深夜相位:time % 240 = 180(夜色最濃)
    await page.evaluate(() => { const s = globalThis.__mistvaleGame.state; s.paused = true; s.time = 240 * 3 + 180; });
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => {
      const tb = document.querySelector('#topbar');
      const overlays = [...document.body.children].filter(e => { const cs = getComputedStyle(e); return cs.position === 'fixed' && cs.mixBlendMode === 'multiply'; }).map(e => ({ id: e.id || e.tagName, op: getComputedStyle(e).opacity }));
      const lightCanvases = [...document.body.children].filter(e => e.tagName === 'CANVAS' && getComputedStyle(e).position === 'fixed' && getComputedStyle(e).zIndex === '3').length;
      const btns = [...tb.querySelectorAll('button')].map(b => b.getBoundingClientRect()).filter(q => q.width > 0);
      let overlap = 0; for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) { const a = btns[i], b = btns[j]; const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); if (w > 1 && h > 1) overlap++; }
      const perf = globalThis.__mistvalePerf?.() || {};
      return { clock: !!document.querySelector('#day-clock,#day-num,#day-phase'), overlays, lightCanvases, night: typeof globalThis.__mistvaleNight, perfNight: 'night' in perf || 'phase' in perf,
        sw: tb.scrollWidth, cw: tb.clientWidth, overlap, text: tb.textContent.replace(/\s+/g, ' ') };
    });
    if (r.clock) fix(`${view}: 頂欄還有晝夜時鐘元素`);
    if (/第 \d+ 天|白天|夜晚/.test(r.text)) fix(`${view}: 頂欄文字還有天數/日夜：${r.text.slice(0, 80)}`);
    if (r.overlays.length) fix(`${view}: 還有正片疊底覆蓋層 ${JSON.stringify(r.overlays)}`);
    if (r.lightCanvases) fix(`${view}: 還有夜晚燈光畫布(${r.lightCanvases})`);
    if (r.night !== 'undefined' || r.perfNight) fix(`${view}: 還在輸出夜晚狀態(__mistvaleNight ${r.night}, perf night/phase ${r.perfNight})`);
    if (r.sw > r.cw + 1) fix(`${view}: topbar 橫向溢出 ${r.sw - r.cw}px`);
    if (r.overlap) fix(`${view}: topbar 有 ${r.overlap} 組按鈕重疊`);
    if (!r.clock && !r.overlays.length && !r.lightCanvases && r.night === 'undefined' && !r.perfNight && r.sw <= r.cw + 1 && !r.overlap) ok(`${view}: 沒有晝夜時鐘、夜色覆蓋層與燈光層(以前的深夜時間也一樣);topbar 不溢出、按鈕不重疊`);
    if (SHOTS) await page.screenshot({ path: `output/no-daynight/${view}-world.png` });

    // 設定面板:沒有「夜晚變暗」
    await L.act(page, 'settings'); await page.waitForTimeout(400);
    await page.evaluate(() => { const b = document.querySelector('#modal [data-action=toggleQuality]'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); });   // 展開「畫質與效能」細項(以前「夜晚變暗」在這裡)
    await page.waitForTimeout(300);
    const set = await page.evaluate(() => ({ open: document.querySelector('#modal')?.dataset.type, text: document.querySelector('#modal-content')?.textContent || '', night: !!document.querySelector('#modal [data-key=night]') }));
    if (set.open !== 'settings') fix(`${view}: 設定面板沒打開(${set.open})`);
    else if (set.night || /夜晚變暗/.test(set.text)) fix(`${view}: 設定面板還有「夜晚變暗」`);
    else ok(`${view}: 設定面板沒有「夜晚變暗」`);
    await page.evaluate(() => document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click()); await page.waitForTimeout(250);

    // 招募卡:婉拒冷卻顯示真實時間
    if (view === 'desktop') {
      await page.evaluate(() => { const g = globalThis.__mistvaleGame, s = g.state; s.gold = 99999; s.capacity = Math.max(s.capacity, s.hunters.length + 3);
        s.wanderers.forEach((w, i) => { w.hp = w.maxHp; w.affinity = 100; w.recruitRetryAt = i === 0 ? g.realNow() + 150e3 : 0; }); });
      await L.act(page, 'recruit'); await page.waitForTimeout(500);
      const rc = await page.evaluate(() => { const id = globalThis.__mistvaleGame.state.wanderers[0].id, card = document.querySelector(`#modal-content .rc-card[data-id="${id}"]`); const meta = card?.querySelector('.rc-meta'); return { found: !!card, state: card?.dataset.state, text: card?.textContent.replace(/\s+/g, ' ') || '', all: document.querySelector('#modal-content')?.textContent || '', metaClip: meta ? meta.scrollWidth - meta.clientWidth : 0 }; });
      if (!rc.found) fix('招募頁找不到冷卻中的那張卡');
      else if (rc.metaClip > 1) fix(`冷卻中那張卡的好感/狀態列被截掉 ${rc.metaClip}px`);
      else if (rc.state !== 'cd' || !/3 分鐘後/.test(rc.text) || /明天/.test(rc.all)) fix(`招募卡冷卻文字不對(state ${rc.state}):${rc.text.slice(0, 120)}`);
      else ok('招募卡的婉拒冷卻顯示「3 分鐘後」(真實時間),整頁沒有「明天」');
      if (SHOTS) await page.screenshot({ path: 'output/no-daynight/desktop-recruit.png' });
      await page.evaluate(() => document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click());
    }
    if (errs.length) fix(`${view}: 頁面錯誤 ${errs.slice(0, 2).join(' | ')}`);
    await ctx.close();
  }
} finally { await browser.close(); srv.stop(); }

if (fails.length) { for (const f of fails) console.log('FIX ' + f); for (const o of oks) console.log('ok  ' + o); process.exit(1); }
for (const o of oks) console.log('ok  ' + o);
console.log('PASS no day/night: 沒有晝夜時鐘、夜色、夜晚燈光與「夜晚變暗」設定;招募冷卻顯示真實時間');
