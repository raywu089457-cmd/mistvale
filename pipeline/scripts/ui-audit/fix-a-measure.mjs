// fix-a-measure.mjs — FIX-A 量測:B1/B2/B3/B4/B7/B10/toast/缺口 8,12,19,20 的修前修後數值
// 用法: TARGET=http://127.0.0.1:5183/ node pipeline/scripts/ui-audit/fix-a-measure.mjs <phase> [view,view...] [item,item...]
//   phase = before|after(截圖與 JSON 寫到 output/ui-audit/fix-a/<phase>/);view 預設 desktop,tablet,phone,land
import * as L from '../../../tools/checks/fix-a-lib.mjs';
import fs from 'node:fs';
const PHASE = process.argv[2] || 'after';
const VIEWS = (process.argv[3] || 'desktop,tablet,phone,land').split(',');
const ITEMS = (process.argv[4] || 'b1,b2,b3,b4,toast,b7,b10,gap8,gap12,gap19').split(',');
const OUT = `output/ui-audit/fix-a/${PHASE}`; fs.mkdirSync(OUT, { recursive: true });
const srv = await L.startServer(); const URL = srv.url;
const browser = await L.launch();
const result = {};
const { ev } = L;
async function fresh(view, { rich = false, keepTitle = false } = {}) {
  const v = L.VIEWS[view]; const ctx = await L.newCtx(browser, v); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  await L.boot(page, URL, { keepTitle });
  if (rich) await page.evaluate(() => { const g = globalThis.__mistvaleGame; for (const k of ['resources', 'buildings', 'levels', 'heal']) g.cheat(k); });
  page.__errs = errs; page.__ctx = ctx; page.__view = view; return page;
}
const shot = (page, n) => page.screenshot({ path: `${OUT}/${n}-${page.__view}.png` }).catch(() => {});
const tap = async (page, sel) => { const l = page.locator(sel).first(); if (page.__view === 'phone' || page.__view === 'land') await l.tap({ timeout: 3000 }); else await l.click({ timeout: 3000 }); };

const ITEM = {
  async b1(view) {
    const page = await fresh(view, { rich: true });
    await page.evaluate(() => { const g = globalThis.__mistvaleGame; g.startDungeon(g.state.hunters.slice(0, 3).map(h => h.id)); for (let i = 0; i < 40; i++) g.tick(.25); });
    await page.waitForTimeout(900);
    const r = await ev(page, (L) => {
      const q = s => document.querySelector(s), hud = q('#run-hud'); if (!hud) return { hud: false };
      const hr = L.R(hud), out = { hud: hr, over: {} };
      const others = { hvLeft: '#hv-left', quest: '#hv-quest', advisor: '#hv-advisor', feed: '#notice-feed', actions: '.hv-actions', viewTools: '.view-tools', topbar: '#topbar .hv-tl', tr: '#topbar .hv-tr' };
      for (const [k, s] of Object.entries(others)) { const e = q(s); if (e && L.vis(e)) out.over[k] = L.inter(hr, L.R(e)); }
      out.actBtn = [...document.querySelectorAll('.hv-actions button,.view-tools button,#topbar button')].filter(L.vis).map(b => ({ n: L.name(b), o: L.inter(hr, L.R(b)) })).filter(x => x.o > 0);
      const x = q('.rh-x'), t = q('.rh-toggle');
      out.retreat = x ? { rect: L.R(x), hit: L.hit(x) } : null; out.toggle = t ? { rect: L.R(t), hit: L.hit(t) } : null;
      // 小隊 HUD 內文字(不含按鈕)是否被其他 fixed 元素蓋住
      out.hudCovered = L.hit(hud) ? 0 : 1;
      return out;
    });
    await shot(page, 'b1'); await page.__ctx.close(); return r;
  },
  async b2(view) {
    const page = await fresh(view, { rich: true });
    const before = await page.evaluate(() => { const g = globalThis.__mistvaleGame; const f = g.state.layout?.forge || null; return JSON.stringify(f); });
    await L.act(page, 'moveBuilding', 'forge'); await page.waitForTimeout(400);
    const st1 = await ev(page, (L) => { const p = document.querySelector('#placement'); const btn = p.querySelector('[data-action=cancelMove]'); return { shown: L.vis(p), btn: btn && L.R(btn), hit: btn && L.hit(btn), label: p.textContent.trim().slice(0, 30), cursor: document.querySelector('#world').style.cursor, rect: L.R(p) }; });
    await shot(page, 'b2-placing');
    await tap(page, '#placement [data-action=cancelMove]').catch(e => { st1.tapErr = String(e.message).split('\n')[0]; });
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => { const g = globalThis.__mistvaleGame; return { layout: JSON.stringify(g.state.layout?.forge || null), shown: !document.querySelector('#placement').classList.contains('hidden'), cursor: document.querySelector('#world').style.cursor }; });
    // 取消後點地圖空地不該再搬建築
    await page.mouse.click(60, 60).catch(() => {}); await page.waitForTimeout(200);
    const after2 = await page.evaluate(() => JSON.stringify(globalThis.__mistvaleGame.state.layout?.forge || null));
    // 畫布提示文字(觸控裝置)
    const hint = await page.evaluate(() => { const s = [...document.scripts].map(x => x.textContent).join(''); return { coarse: matchMedia('(pointer:coarse)').matches, esc: /點擊放置 · ESC 取消/.test(s) }; });
    await page.__ctx.close();
    return { placing: st1, movedBack: before === after.layout, closed: !after.shown, cursor: after.cursor, layoutStable: after.layout === after2, hint };
  },
  async b3(view) {
    const page = await fresh(view, { rich: true });
    await L.act(page, 'settings'); await page.waitForTimeout(400);
    await L.act(page, 'pilotLab'); await page.waitForTimeout(500);
    const r = await ev(page, (L) => {
      const p = document.querySelector('#pilotlab'); if (!p) return { open: false };
      const pr = L.R(p), tb = L.R(document.querySelector('#topbar')), out = { open: true, rect: pr, topbarOverlap: L.inter(pr, tb), covered: [] };
      for (const b of document.querySelectorAll('#topbar button,.hv-actions button,#bottom-bar button')) { if (!L.vis(b)) continue; if (!L.hit(b)) out.covered.push(L.name(b)); }
      out.closeBtn = L.R(p.querySelector('[data-pilot=close]')); out.closeHit = L.hit(p.querySelector('[data-pilot=close]'));
      return out;
    });
    await shot(page, 'b3');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    r.escCloses = !(await page.evaluate(() => !!document.querySelector('#pilotlab')));
    await L.act(page, 'settings'); await page.waitForTimeout(300); await L.act(page, 'pilotLab'); await page.waitForTimeout(300);
    // 點外面(畫面中央場景)
    const v = L.VIEWS[view]; await page.mouse.click(v.w / 2, v.h * 0.45).catch(() => {}); await page.waitForTimeout(300);
    r.outsideCloses = !(await page.evaluate(() => !!document.querySelector('#pilotlab')));
    await L.act(page, 'settings'); await page.waitForTimeout(300); await L.act(page, 'pilotLab'); await page.waitForTimeout(300);
    try { await tap(page, '#pilotlab [data-pilot=close]'); } catch (e) { r.closeTapErr = String(e.message).split('\n')[0]; }
    await page.waitForTimeout(300); r.closeBtnCloses = !(await page.evaluate(() => !!document.querySelector('#pilotlab')));
    await page.__ctx.close(); return r;
  },
  async b4(view) {
    const page = await fresh(view, { rich: true });
    await page.evaluate(() => { globalThis.__mistvaleSelect('hunter:' + globalThis.__mistvaleGame.state.hunters[0].id); });
    await page.waitForTimeout(400); await L.act(page, 'selInfo'); await page.waitForTimeout(500);
    const r = await ev(page, (L) => {
      const c = document.querySelector('#unit-card'); if (!c) return { card: false };
      const x = c.querySelector('.uc-x'), out = { card: true, rect: L.R(c), x: L.R(x), xHit: L.hit(x), tools: [] };
      for (const b of document.querySelectorAll('.view-tools button')) { if (!L.vis(b)) continue; out.tools.push({ n: L.name(b), hit: L.hit(b), r: L.R(b) }); }
      out.toolsCovered = out.tools.filter(t => !t.hit).length;
      return out;
    });
    await shot(page, 'b4'); await page.__ctx.close(); return r;
  },
  async toast(view) {
    const out = {};
    for (const mode of ['closed', 'panel']) {
      const page = await fresh(view, { rich: true });
      if (mode === 'panel') { await L.act(page, 'build'); await page.waitForTimeout(600); }
      await L.act(page, 'construct', 'forge'); await L.act(page, 'upgrade', 'forge'); await L.act(page, 'construct', 'hall');
      await page.waitForTimeout(450);
      out[mode] = await ev(page, L => L.toastCheck());
      await shot(page, 'toast-' + mode); await page.__ctx.close();
    }
    // 面板開著 + 各頁籤(同一頁面輪流開):量 toast 蓋到哪些按鈕中心
    out.tabs = {};
    const page = await fresh(view, { rich: true });
    for (const tab of ['build', 'hunters', 'trade', 'craft', 'dungeon', 'arena', 'quests']) {
      await L.act(page, tab); await page.waitForTimeout(550);
      await page.evaluate(() => { document.querySelector('#toasts').innerHTML = ''; });
      await L.act(page, 'construct', 'forge'); await L.act(page, 'upgrade', 'forge'); await L.act(page, 'construct', 'hall'); await page.waitForTimeout(380);
      const tc = await ev(page, L => L.toastCheck()); out.tabs[tab] = { covers: tc.covers, centerRegion: tc.centerRegion, rects: tc.rects };
      await page.evaluate(() => document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click()); await page.waitForTimeout(250);
    }
    await page.__ctx.close();
    return out;
  },
  async b7(view) {
    const page = await fresh(view);
    await page.evaluate(() => { globalThis.__mistvaleShowOffline?.(); }); await page.waitForTimeout(700);
    const r = await ev(page, (L) => {
      const m = document.querySelector('#modal-backdrop:not(.hidden) #modal'); if (!m) return { open: false };
      const b = [...m.querySelectorAll('button')].find(x => /收下/.test(x.textContent)); const content = document.querySelector('#modal-content');
      return { open: true, btn: b ? L.R(b) : null, inView: b ? (L.R(b).b <= innerHeight + 0.5 && L.R(b).t >= 0) : false, vh: innerHeight, scrollable: content ? content.scrollHeight > content.clientHeight + 2 : null, hit: b ? L.hit(b) : null, modal: L.R(m) };
    });
    await shot(page, 'b7'); await page.__ctx.close(); return r;
  },
  async b10(view) {
    const page = await fresh(view, { rich: true });
    const res = {};
    for (const tab of ['dungeon', 'arena']) {
      await L.act(page, tab); await page.waitForTimeout(500);
      const act = tab === 'dungeon' ? 'toggleDungeonHunter' : 'toggleArenaHunter';
      const ids = await page.evaluate(() => globalThis.__mistvaleGame.state.hunters.filter(h => h.hp > 0).map(h => h.id));
      const have = await page.evaluate(a => [...document.querySelectorAll('#modal [data-action]')].map(e => e.dataset.action).filter((x, i, ar) => ar.indexOf(x) === i), act);
      res[tab + 'Actions'] = have.filter(a => /Hunter|Pick|party/i.test(a));
      const realAct = have.find(a => /(toggle|pick).*(dungeon|arena)|(dungeon|arena).*(toggle|pick)/i.test(a)) || act;
      for (const id of ids.slice(0, 3)) await L.act(page, realAct, id);
      await page.evaluate(() => { document.querySelector('#toasts').innerHTML = ''; });
      await L.act(page, realAct, ids[3]); await page.waitForTimeout(350);
      res[tab] = await page.evaluate(() => [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent.trim()));
      await page.evaluate(() => document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click()); await page.waitForTimeout(300);
    }
    await page.__ctx.close(); return res;
  },
  async gap8(view) {
    const page = await fresh(view);
    const r = await ev(page, (L) => {
      const q = s => document.querySelector(s), out = {};
      const a = q('#difficulty-name'), b = q('#hv-quest-title'), qq = q('#hv-quest');
      out.diffVsTitle = L.inter(L.R(a), L.R(b)); out.diff = L.R(a); out.title = L.R(b);
      // 日期標籤(第 N 天 · 白天)熱區
      const day = q('#day-clock') || q('.day-clock'); out.day = day && L.vis(day) ? L.R(day) : null;
      out.questVsDay = day && L.vis(day) ? L.inter(L.R(qq), L.R(day)) : 0; out.quest = L.R(qq);
      // 任務追蹤與頂欄內所有按鈕
      out.questVsBtn = [...document.querySelectorAll('#topbar button,#topbar [data-action],#topbar .day-clock,#topbar #day-clock')].filter(L.vis).map(x => ({ n: L.name(x), o: L.inter(L.R(qq), L.R(x)) })).filter(x => x.o > 0);
      return out;
    });
    await shot(page, 'gap8'); await page.__ctx.close(); return r;
  },
  async gap12(view) {
    const page = await fresh(view, { rich: true });
    await page.evaluate(() => { globalThis.__mistvaleGame.state.paused = true; }); await L.act(page, 'moveBuilding', 'forge'); await page.waitForTimeout(600);
    const r = await ev(page, (L) => {
      const p = document.querySelector('#placement'), out = { rect: L.R(p), vw: innerWidth };
      out.widthRatio = +(out.rect.w / innerWidth).toFixed(2);
      const bg = getComputedStyle(p).backgroundColor; out.bg = bg;
      out.over = [];
      for (const s of ['#reopen-left', '#pause-label', '.view-tools', '.hv-actions', '#bottom-bar', '#hv-left', '#topbar']) { const e = document.querySelector(s); if (e && L.vis(e)) { const o = L.inter(L.R(p), L.R(e)); if (o) out.over.push(s + ':' + o); } }
      out.btnOver = [...document.querySelectorAll('.view-tools button,.hv-actions button,#bottom-bar button,#topbar button')].filter(L.vis).map(b => ({ n: L.name(b), o: L.inter(L.R(p), L.R(b)) })).filter(x => x.o > 0);
      const c = p.querySelector('[data-action=cancelMove]'); out.cancel = L.R(c); out.cancelHit = L.hit(c);
      return out;
    });
    // 左側面板收合後(#reopen-left 出現)
    await page.evaluate(() => { document.querySelector('#reopen-left')?.classList.remove('hidden'); });
    r.reopen = await ev(page, (L) => { const e = document.querySelector('#reopen-left'), p = document.querySelector('#placement'); return e && L.vis(e) ? { o: L.inter(L.R(p), L.R(e)), rect: L.R(e) } : null; });
    await shot(page, 'gap12'); await page.__ctx.close(); return r;
  },
  async gap19(view) {
    const page = await fresh(view, { rich: true });
    await L.act(page, 'build'); await page.waitForTimeout(700);
    const r = await ev(page, (L) => {
      const m = document.querySelector('#modal'), out = { modal: L.R(m) };
      const tre = document.querySelector('#topbar .treasury'); out.treasury = tre && L.vis(tre) ? L.R(tre) : null; out.treasuryVsModal = tre ? L.inter(L.R(tre), L.R(m)) : null;
      out.treasuryHit = tre && L.vis(tre) ? L.hit(tre) : null;
      out.topbarVisible = L.vis(document.querySelector('#topbar')); out.topbarVis = getComputedStyle(document.querySelector('#topbar')).visibility;
      out.resRows = [...document.querySelectorAll('#topbar .res-row')].map(e => ({ v: L.vis(e), r: L.R(e), covered: !L.hit(e) }));
      return out;
    });
    await shot(page, 'gap19'); await page.__ctx.close(); return r;
  },
};

for (const view of VIEWS) {
  result[view] = {};
  for (const it of ITEMS) {
    try { result[view][it] = await ITEM[it](view); }
    catch (e) { result[view][it] = { error: String(e.message).split('\n')[0].slice(0, 200) }; }
  }
}
await browser.close(); srv.stop();
fs.writeFileSync(`${OUT}/measure.json`, JSON.stringify(result, null, 1));
console.log(JSON.stringify(result));
