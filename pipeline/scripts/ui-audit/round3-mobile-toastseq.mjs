// round3-mobile-toastseq.mjs — FIX-D 副作用:toast 排隊卡住/不消失、面板切換後容器掉了、HUD 隱藏後沒恢復。唯讀。
import fs from 'node:fs';
process.env.OUT = 'output/ui-audit/round3-mobile/toastseq';
const L = await import('./round3-mobile-lib.mjs');
const names = (process.argv[2] || 'm360x640').split(',');
const BASE = (process.env.TARGET || 'http://127.0.0.1:5192').replace(/\/$/, '');
const W = ms => new Promise(r => setTimeout(r, ms));
const b = await L.launch();
const F = []; const find = (v, area, msg, d) => { F.push({ v, area, msg, d }); console.log('FIND', v, area, msg, d ? JSON.stringify(d).slice(0, 240) : ''); };
const TS = () => {
  const box = document.querySelector('#toasts'); if (!box) return { box: false };
  const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > .05; };
  const all = [...box.children];
  return { box: true, inDom: document.contains(box), parent: box.parentElement?.id || box.parentElement?.className?.toString().split(' ')[0] || box.parentElement?.tagName, docked: !!box.dataset.dock, n: all.length, visible: all.filter(vis).length, wait: all.filter(t => t.classList.contains('tq-wait')).length, done: all.filter(t => t.classList.contains('tq-done')).length, out: all.filter(t => t.classList.contains('out')).length, msgs: all.map(t => t.dataset.msg) };
};
const HUD = () => Object.fromEntries(['.view-tools', '.hv-actions', '#topbar', '#bottom-bar', '#hv-left', '#pause'].map(s => {
  const e = document.querySelector(s); if (!e) return [s, null];
  const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
  return [s, { vis: cs.visibility, disp: cs.display, w: Math.round(r.width), h: Math.round(r.height), op: cs.opacity }];
}));
for (const VN of names) {
  const V = L.VIEWS[VN]; const errs = []; const land = V.w > V.h && V.h < 520;
  const ctx = await L.newCtx(b, V); await ctx.addInitScript(() => { try { localStorage.setItem('mistvale-touch-tip', '1'); } catch {} });
  const page = await ctx.newPage(); L.hook(page, VN, errs);
  await L.boot(page, BASE + '/?preview=1'); await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation-duration:0s!important}' }); await W(3000);
  const rich = () => page.evaluate(() => { const g = globalThis.__mistvaleGame; Object.assign(g.state, { gold: 99999, wood: 9999, ore: 9999, herb: 9999, cloth: 9999, flour: 9999, leather: 9999, gems: 999 }); for (const id of Object.keys(g.state.buildings)) g.state.buildings[id] = Math.max(1, g.state.buildings[id]); g.state.buildings.hall = 1; });
  const closeAll = async () => { await page.evaluate(() => { document.querySelector('#modal-backdrop:not(.hidden) [data-action=confirmNo]')?.click(); document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click(); document.querySelector('#inspector:not(.hidden) [data-action=closeInspector]')?.click(); }); await W(350); };
  const clearToasts = () => page.evaluate(() => document.querySelectorAll('#toasts .toast').forEach(t => t.remove()));
  const push = (n, pre = '訊息') => page.evaluate(([n, pre]) => { for (let i = 0; i < n; i++) globalThis.__toast(`${pre}${i + 1}：資源不足，還差 ${100 + i} 木材`, i % 2 === 0); }, [n, pre]);
  await rich();
  // T1 面板開著連續 3 則 → 馬上關面板 → 1.5s 後 / 6.5s 後的 toast 狀態
  for (const [pname, opener] of [['build', () => L.act(page, 'build')], ['hunters', () => L.act(page, 'hunters')], ['quests', () => L.act(page, 'quests')], ['inspector', () => L.act(page, 'selectBuilding', 'hall')]]) {
    await closeAll(); await clearToasts(); await opener(); await W(500);
    await push(3, 'A'); await W(300); await closeAll();
    await W(1500); const s1 = await page.evaluate(TS);
    await W(5000); const s2 = await page.evaluate(TS);
    if (s1.box && s1.parent !== 'BODY') find(VN, 'T1', `${pname}: 關面板後容器不在 body(${s1.parent})`, s1);
    if (s1.n && s1.visible === 0) find(VN, 'T1', `${pname}: 關面板後 1.5s 有 ${s1.n} 則 toast 但沒有一則看得到(wait=${s1.wait})`, s1);
    if (s1.wait) find(VN, 'T1b', `${pname}: 關面板後 1.5s 仍有 ${s1.wait} 則停在排隊(隱藏)狀態,在 body 裡被藏起來`, s1);
    if (s2.n > 0) find(VN, 'T1', `${pname}: 關面板 6.5s 後仍殘留 ${s2.n} 則 toast(wait ${s2.wait}、done ${s2.done})`, s2);
    if (!s2.box) find(VN, 'T1', `${pname}: #toasts 容器消失`, s2);
  }
  // T2 面板之間切換後,容器還在、新 toast 看得到、最後會消失
  await closeAll(); await clearToasts();
  await L.act(page, 'build'); await W(400); await push(2, 'B');
  for (const a of ['hunters', 'trade', 'craft', 'worldmap', 'settings', 'quests']) { await L.act(page, a); await W(250); }
  await L.act(page, 'selectBuilding', 'forge'); await W(400);
  const t2a = await page.evaluate(TS); await push(2, 'C'); await W(500); const t2b = await page.evaluate(TS);
  if (!t2a.box || !t2a.inDom) find(VN, 'T2', '切換面板後 #toasts 容器掉出 DOM', t2a);
  if (t2b.box && t2b.visible === 0) find(VN, 'T2', '切換面板後新 toast 看不到', t2b);
  await closeAll(); await W(7000); const t2c = await page.evaluate(TS); if (t2c.n) find(VN, 'T2', `切換面板後關閉 7s 仍殘留 ${t2c.n} 則`, t2c);
  // T3 toast 蓋住標題列時,標題列工具鈕/子頁籤仍點得到
  for (const [pname, op, sel] of [['hunters', () => L.act(page, 'hunters'), '#modal .modal-title button:not([data-action=close]),#modal #modal-tools button'], ['craft', () => L.act(page, 'craft'), '#modal [data-action=craftTab]'], ['dispatch', () => L.act(page, 'dispatchHunters'), '#modal [data-action=dispatchTab]']]) {
    await closeAll(); await clearToasts(); await op(); await W(500); await push(1, 'D'); await W(450);
    const els = await page.evaluate(sel0 => [...document.querySelectorAll(sel0)].filter(e => e.getBoundingClientRect().width > 0).map(e => {
      const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const te = document.querySelector('#toasts .toast'); const tb = te?.getBoundingClientRect();
      return { a: e.dataset.action, t: (e.textContent || '').trim().slice(0, 6), hit: !!t && (t === e || e.contains(t)), underToast: tb ? (r.left + r.width / 2 > tb.left && r.left + r.width / 2 < tb.right && r.top + r.height / 2 > tb.top && r.top + r.height / 2 < tb.bottom) : false };
    }), sel);
    const blocked = els.filter(e => !e.hit);
    if (blocked.length) find(VN, 'T3', `${pname}: toast 顯示時按鈕點不到 ${blocked.map(e => e.a + ':' + e.t).join(',')}`, blocked);
    const under = els.filter(e => e.underToast); if (under.length) find(VN, 'T3L', `${pname}: toast 蓋住(看不見但點得到)的按鈕 ${under.map(e => e.a + ':' + e.t).join(',')}`, under);
  }
  // T4 HUD 隱藏後恢復
  await closeAll(); await clearToasts(); await W(300); const hud0 = await page.evaluate(HUD);
  const compare = async label => { const h1 = await page.evaluate(HUD); for (const k of Object.keys(hud0)) { const a = hud0[k], c = h1[k]; if (!a || !c) continue; if (c.vis !== a.vis || c.disp !== a.disp || Math.abs(c.w - a.w) > 2 || Math.abs(c.h - a.h) > 2) find(VN, 'T4', `${label} 後 ${k} 沒恢復(前 ${JSON.stringify(a)} 後 ${JSON.stringify(c)})`); } };
  await L.act(page, 'selectBuilding', 'hall'); await W(500); await closeAll(); await W(500); await compare('關建築抽屜');
  if (land) { await L.act(page, 'selectBuilding', 'hall'); await W(500); await page.evaluate(() => globalThis.__mistvaleSelect('forge')); await W(500); await closeAll(); await W(500); await compare('抽屜切換建築後關'); }
  await L.act(page, 'hunters'); await W(500); await closeAll(); await W(400); await compare('關面板');
  await L.act(page, 'selectBuilding', 'hall'); await W(400); await L.act(page, 'hunters'); await W(400); await closeAll(); await W(400); await closeAll(); await W(400); await compare('抽屜+面板疊開後全關');
  await L.act(page, 'settings'); await W(300); await L.act(page, 'pilotLab'); await W(600);
  const pl = await page.evaluate(() => { const p = document.querySelector('#pilotlab'); const vt = document.querySelector('.view-tools'); const r = vt?.getBoundingClientRect(); return { open: !!p && p.getBoundingClientRect().height > 0, vt: vt ? getComputedStyle(vt).visibility + '/' + getComputedStyle(vt).display + '/' + Math.round(r.width) : null }; });
  await page.evaluate(() => document.querySelector('#pilotlab [data-pilot=close]')?.click()); await W(500); await compare('關手動操控清單');
  const vtAfter = await page.evaluate(() => { const e = document.querySelector('.view-tools'); const r = e.getBoundingClientRect(); const bs = [...e.querySelectorAll('button')].map(b => { const q = b.getBoundingClientRect(); const t = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return !!t && (t === b || b.contains(t)); }); return { vis: getComputedStyle(e).visibility, w: Math.round(r.width), hits: bs }; });
  if (vtAfter.vis === 'hidden' || vtAfter.hits.some(h => !h)) find(VN, 'T4', '關手動操控清單後縮放鈕沒恢復/點不到', { pl, vtAfter });
  await L.act(page, 'settings'); await W(300); await L.act(page, 'pilotLab'); await W(500); await page.evaluate(() => document.querySelector('#pilotlab [data-pilot=pick]')?.click()); await W(300); await page.evaluate(() => document.querySelector('#pilotlab [data-pilot=close]')?.click()); await W(500); await compare('手動操控選角後關');
  await closeAll();
  console.log('done', VN, 'errs', errs.length, JSON.stringify(errs.slice(0, 2)));
  for (const e of errs) F.push({ v: VN, area: 'err', msg: e.type + ' ' + e.msg });
  await ctx.close();
}
fs.writeFileSync(`${L.OUT}/toastseq-${names.join('_')}.json`, JSON.stringify(F, null, 1));
await b.close();
