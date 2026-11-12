// bughunt-extra.mjs — 補充流程(唯讀):世界地圖/旅行、設定開關、確認框、招募、檢視器按鈕、連點開關、Tab 焦點圈、toast 版面
// 用法: node pipeline/scripts/ui-audit/bughunt-extra.mjs <desktop|tablet|phone|land>  → output/ui-audit/round3-mobile/bh/<view>-extra.json
import * as L from './round3-mobile-lib.mjs';
import fs from 'node:fs';
const VN = process.argv[2] || 'desktop', V = L.VIEWS[VN], MOBILE = !!V.mobile;
const b = await L.launch(); const ctx = await L.newCtx(b, V); const page = await ctx.newPage();
const errs = [], F = [], scans = []; const S = L.hook(page, VN, errs);
const find = (area, title, detail, extra = {}) => F.push({ view: VN, area, title, detail: typeof detail === 'string' ? detail : JSON.stringify(detail), step: S.step, ...extra });
const step = s => { S.step = s; }; const W = ms => page.waitForTimeout(ms); const ev = (f, a) => page.evaluate(f, a); const act = L.act;
const shot = async n => { try { await page.screenshot({ path: `${L.OUT}/shots/${VN}-x-${n}.png` }); } catch {} };
const tap = async (sel, o = {}) => { const loc = o.scope ? page.locator(o.scope).locator(sel).first() : page.locator(sel).first(); try { if (MOBILE) await loc.tap({ timeout: 2500 }); else await loc.click({ timeout: 2500 }); return { ok: true }; } catch (e) { const m = String(e.message).split(/\r?\n/); return { ok: false, err: m[0].slice(0, 80) + ' | ' + m.filter(l => /intercepts|not visible|outside|enabled/.test(l)).slice(0, 1).join('').trim().slice(0, 160) }; } };
const UI = () => ev(() => { const q = x => document.querySelector(x); return { modalOpen: !q('#modal-backdrop').classList.contains('hidden'), type: q('#modal')?.dataset.type || '', kind: q('#modal')?.dataset.kind || '', tab: document.body.dataset.modalTab || '', inert: [...document.querySelectorAll('[inert]')].length, cls: document.body.className, veil: !!q('.travel-veil,#travel-veil'), gold: Math.round(globalThis.__mistvaleGame.state.gold), region: globalThis.__mistvaleGame.state.region, hunters: globalThis.__mistvaleGame.state.hunters.length, insp: !!q('#inspector:not(.hidden)') }; });
const reset = async () => { await ev(() => { try { globalThis.__mistvaleGame.pilotStop?.(); } catch {} document.querySelectorAll('#pilotlab [data-pilot=close],#pilotlab [data-pilot=stop]').forEach(b => b.click()); try { globalThis.__mistvaleCmdk?.close(); } catch {} document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click(); document.querySelector('[data-action=closeInspector]')?.click(); try { globalThis.__mistvaleSelect?.(null); } catch {} document.querySelector('#unit-card [data-action=unitCardClose]')?.click(); }); await W(150); };
await L.boot(page); await ev(() => { const mo = new MutationObserver(m => { for (const r of m) (globalThis.__toastLog ||= []).push(...[...r.addedNodes].map(n => (n.textContent || '').trim().slice(0, 80))); }); mo.observe(document.querySelector('#toasts'), { childList: true }); }); await W(2500);
await ev(() => { document.querySelector('#title-screen')?.remove(); const g = globalThis.__mistvaleGame; Object.assign(g.state, { gold: 99999, wood: 9999, ore: 9999, herb: 9999, cloth: 9999, flour: 9999, leather: 9999, gems: 999 }); }); await reset(); await W(300);
await ev(() => { document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click(); });
const T = async (name, fn) => { if (process.env.ONLY && !process.env.ONLY.split(',').includes(name)) return; try { step(name); await fn(); } catch (e) { find('harness', name + ' 腳本中斷', String(e.stack || e).slice(0, 300)); await shot('crash-' + name.replace(/\W+/g, '_')); await reset(); } console.error(VN, 'done', name, 'F', F.length, 'E', errs.length); };

await T('worldmap', async () => {
  await act(page, 'worldmap'); await W(600); await shot('worldmap'); scans.push({ tag: 'worldmap', ...L.summarize(await ev(L.SCAN)) });
  const cards = await ev(() => [...document.querySelectorAll('#modal [data-action=regionDetail]')].map(e => e.dataset.id));
  scans.push({ tag: 'worldmap-cards', cards });
  if (!cards.length) find('worldmap', '世界地圖沒有區域卡片(regionDetail)', '');
  for (const id of cards.slice(0, 3)) {
    await reset(); await act(page, 'worldmap'); await W(300);
    const r = await tap(`[data-action=regionDetail][data-id="${id}"]`, { scope: '#modal' }); await W(400); let u = await UI();
    if (!r.ok) { find('worldmap', `區域卡 ${id} 點不到`, r.err); continue; }
    if (u.type !== 'region') find('worldmap', `區域卡 ${id} 點了沒開詳細頁`, u);
    await shot('region-' + id); scans.push({ tag: 'region-' + id, ...L.summarize(await ev(L.SCAN)) });
    // 詳細頁所有按鈕
    const btns = await ev(() => [...document.querySelectorAll('#modal [data-action]')].filter(e => e.getBoundingClientRect().width > 0).map(e => [e.dataset.action, e.dataset.id || '', (e.textContent || '').trim().slice(0, 10)]));
    scans.push({ tag: 'region-btns-' + id, btns });
    const view = btns.find(x => x[0] === 'regionView');
    if (view) { await tap('[data-action=regionView]', { scope: '#modal' }); await W(800); u = await UI(); if (u.modalOpen) find('worldmap', '「在地圖上定位」後視窗沒關', u); await shot('region-view-' + id); }
    else find('worldmap', `區域詳細頁 ${id} 沒有「在地圖上定位」鈕`, btns);
    // 返回地圖
    await reset(); await act(page, 'regionDetail', id); await W(300);
    const back = await ev(() => [...document.querySelectorAll('#modal [data-action]')].map(e => e.dataset.action).filter(a => /back|worldmap|worldOverview|close/i.test(a)));
    scans.push({ tag: 'region-back-' + id, back });
  }
  // 旅行
  await reset(); await act(page, 'worldmap'); await W(300);
  const tr = await ev(() => [...document.querySelectorAll('#modal [data-action=regionTravel]')].map(e => ({ id: e.dataset.id, dis: e.disabled })));
  scans.push({ tag: 'travel-btns', tr });
  const t0 = tr.find(x => !x.dis && x.id !== 'meadow');
  if (t0) { const before = await UI(); const r = await tap(`[data-action=regionTravel][data-id="${t0.id}"]`, { scope: '#modal' }); await W(2500); const u = await UI(); await shot('travel-after');
    if (!r.ok) find('worldmap', '旅行鈕點不到', r.err); else if (u.modalOpen || u.veil) find('worldmap', '前往區域後視窗/轉場遮罩殘留', u); const inv = u.inert; if (inv) find('worldmap', '前往區域後 HUD 殘留 inert', u);
    scans.push({ tag: 'after-travel', before: before.region, after: u.region, id: t0.id });
    await act(page, 'home'); await W(600); }
  await reset();
});

await T('settings-toggles', async () => {
  await act(page, 'settings'); await W(500); await shot('settings');
  scans.push({ tag: 'settings', ...L.summarize(await ev(L.SCAN)) });
  const opts = await ev(() => [...document.querySelectorAll('#modal [data-action=setOpt]')].map(e => ({ key: e.dataset.key, value: e.dataset.value, pressed: e.getAttribute('aria-pressed'), cls: e.className })));
  scans.push({ tag: 'setopts', n: opts.length, opts: opts.slice(0, 12) });
  for (const o of opts.slice(0, 14)) {
    await reset(); await act(page, 'settings'); await W(250);
    const sel = `[data-action=setOpt][data-key="${o.key}"][data-value="${o.value}"]`;
    if (!(await page.locator('#modal ' + sel).count())) continue;
    const ge = errs.length; const r = await tap(sel, { scope: '#modal' }); await W(350);
    const after = await ev(sel => { const e = document.querySelector('#modal ' + sel); return e ? { pressed: e.getAttribute('aria-pressed'), cls: e.className } : null; }, sel);
    if (!r.ok) find('settings', `設定開關 ${o.key}=${o.value} 點不到`, r.err); else if (after && after.pressed === o.pressed && after.cls === o.cls && o.pressed !== 'true') find('settings', `設定 ${o.key}=${o.value} 點了狀態沒變`, { o, after });
    if (errs.length > ge) find('settings', `設定 ${o.key}=${o.value} 觸發錯誤`, errs.slice(ge).map(e => e.msg).join('|'));
  }
  // 畫質/解析度 toggleQuality
  await reset(); await act(page, 'toggleQuality'); await W(300); await reset();
  // 難度
  await act(page, 'difficulty'); await W(400); const diffs = await ev(() => [...document.querySelectorAll('#modal [data-action=setDifficulty]')].map(e => [e.dataset.id, e.disabled]));
  scans.push({ tag: 'difficulty', diffs });
  if (diffs.length > 1) { const d = diffs.find(x => !x[1]); if (d) { const before = await ev(() => globalThis.__mistvaleGame.state.difficulty); await act(page, 'setDifficulty', d[0]); await W(500); const after = await ev(() => ({ d: globalThis.__mistvaleGame.state.difficulty, name: document.querySelector('#difficulty-name')?.textContent })); scans.push({ tag: 'diff-set', before, after }); } }
  await reset();
});

await T('reset-confirm', async () => {
  await act(page, 'settings'); await W(400);
  let r = await tap('[data-action=reset]', { scope: '#modal' }); await W(500); let u = await UI();
  if (!r.ok) { find('confirm', '設定「重置存檔」鈕點不到', r.err); return; }
  if (u.kind !== 'confirm') find('confirm', '按重置沒有出現確認框', u);
  await shot('confirm'); scans.push({ tag: 'confirm', ...L.summarize(await ev(L.SCAN)) });
  await page.keyboard.press('Escape'); await W(300); u = await UI(); if (!u.modalOpen) find('confirm', '確認框被 Esc 關掉(規格:只能按按鈕)', u);
  await ev(() => document.querySelector('#modal-backdrop')?.click()); await W(200);
  const bd = await ev(() => { const m = document.querySelector('#modal').getBoundingClientRect(); return { l: m.left, w: innerWidth }; });
  if (bd.l > 20) { if (MOBILE) await page.touchscreen.tap(6, V.h / 2); else await page.mouse.click(6, V.h / 2); await W(300); u = await UI(); if (!u.modalOpen) find('confirm', '確認框被點背板關掉(規格:只能按按鈕)', u); }
  r = await tap('[data-action=confirmNo]', { scope: '#modal' }); await W(400); u = await UI();
  if (!r.ok) find('confirm', '確認框「取消」點不到', r.err); else if (u.type !== 'settings') scans.push({ tag: 'confirm-no-lands', type: u.type, open: u.modalOpen });
  await reset();
  // 真的重置(沙箱)
  await act(page, 'settings'); await W(300); await tap('[data-action=reset]', { scope: '#modal' }); await W(300);
  r = await tap('[data-action=confirmYes]', { scope: '#modal' }); await W(1500); u = await UI(); await shot('after-reset');
  scans.push({ tag: 'after-reset', u });
  if (!r.ok) find('confirm', '確認框「確定」點不到', r.err);
  if (u.modalOpen && u.type !== 'welcome') find('confirm', '重置後殘留視窗 ' + u.type, u);
  if (u.gold > 5000) find('confirm', '按「確定重置」後金幣沒回到初始值', u);
  await reset();
});

await T('recruit', async () => {
  await ev(() => { const g = globalThis.__mistvaleGame; g.state.gold = 99999; });
  await act(page, 'recruit'); await W(500); await shot('recruit');
  const before = (await UI()).hunters;
  const n = await ev(() => document.querySelectorAll('#modal [data-action=recruitVisitor]').length);
  scans.push({ tag: 'recruit', visitors: n, hunters: before });
  for (let i = 0; i < Math.min(n, 4); i++) { const r = await tap('[data-action=recruitVisitor]', { scope: '#modal' }); await W(350); if (!r.ok) { find('recruit', '招募鈕點不到', r.err); break; } }
  const after = await UI(); scans.push({ tag: 'recruit-after', before, after: after.hunters });
  if (after.hunters === before && n) find('recruit', '點招募後獵人數沒增加(也許已滿員)', { before, after: after.hunters });
  await reset();
});

await T('inspector-buttons', async () => {
  await ev(() => { const g = globalThis.__mistvaleGame; for (const id of Object.keys(g.state.buildings)) g.state.buildings[id] = Math.max(1, g.state.buildings[id]); });
  for (const bid of ['forge', 'tavern', 'house']) {
    await reset(); await act(page, 'selectBuilding', bid); await W(500); let u = await UI();
    if (!u.insp) { find('inspector', `開 ${bid} 檢視器失敗`, u); continue; }
    await shot('inspector-' + bid); scans.push({ tag: 'inspector-' + bid, ...L.summarize(await ev(L.SCAN)) });
    const btns = await ev(() => [...document.querySelectorAll('#inspector [data-action]')].filter(e => e.getBoundingClientRect().width > 0).map(e => [e.dataset.action, e.dataset.id || '', (e.textContent || '').trim().slice(0, 10), e.disabled]));
    scans.push({ tag: 'inspector-btns-' + bid, btns });
    for (const [a, id, lbl, dis] of btns) {
      if (dis || a === 'closeInspector' || a === 'moveBuilding') continue;
      await reset(); await act(page, 'selectBuilding', bid); await W(300);
      const sel = `[data-action=${a}]` + (id ? `[data-id="${id}"]` : ''); const s0 = await ev(() => JSON.stringify([document.querySelector('#inspector')?.innerHTML.length, JSON.stringify(globalThis.__mistvaleGame.state.buildings), globalThis.__mistvaleGame.state.gold, !document.querySelector('#modal-backdrop').classList.contains('hidden')]));
      const r = await tap(sel, { scope: '#inspector' }); await W(400); const s1 = await ev(() => JSON.stringify([document.querySelector('#inspector')?.innerHTML.length, JSON.stringify(globalThis.__mistvaleGame.state.buildings), globalThis.__mistvaleGame.state.gold, !document.querySelector('#modal-backdrop').classList.contains('hidden')]));
      if (!r.ok) find('inspector', `檢視器 ${bid} 按鈕 ${lbl}(${a}) 點不到`, r.err); else if (s0 === s1) find('inspector', `檢視器 ${bid} 按鈕 ${lbl}(${a}) 點了沒反應`, { a, id });
    }
    // X 關閉
    await reset(); await act(page, 'selectBuilding', bid); await W(300); const r = await tap('[data-action=closeInspector]', { scope: '#inspector' }); await W(300); u = await UI(); if (!r.ok) find('inspector', '檢視器 X 點不到', r.err); else if (u.insp) find('inspector', '檢視器 X 沒關', u);
  }
  await reset();
});

await T('spam-open-close', async () => {
  // 連點底欄頁籤 21 次 → 奇數次應該開著,偶數次關閉
  await reset();
  for (let i = 0; i < 21; i++) { if (MOBILE) await page.locator('#bottom-bar [data-action=build]').tap({ timeout: 2000 }).catch(() => {}); else await page.locator('#bottom-bar [data-action=build]').click({ timeout: 2000, delay: 0 }).catch(() => {}); await W(40); }
  await W(500); let u = await UI(); if (!(u.modalOpen && u.type === 'build')) find('spam', '連點建設頁籤 21 次(奇數)最後不是開著', u);
  await tap('#bottom-bar [data-action=build]'); await W(400); u = await UI(); if (u.modalOpen || u.tab || u.inert) find('spam', '連點後再關,狀態殘留', u);
  // Esc 連按、開關混合
  for (const k of ['1', '2', 'Escape', '3', 'Escape', 'Escape', '4', '5', 'Escape']) { if (!MOBILE) await page.keyboard.press(k); await W(60); }
  await W(400); u = await UI(); if (!MOBILE && (u.modalOpen || u.inert || u.tab)) find('spam', '快速鍵盤開關後殘留', u);
  // 快速切頁籤(不關)
  for (const t of ['build', 'hunters', 'trade', 'craft', 'dungeon', 'arena', 'quests', 'build']) { await page.locator(`#bottom-bar [data-action=${t}]`).dispatchEvent('click').catch(() => {}); await W(30); }
  await W(500); u = await UI(); if (!(u.modalOpen && u.type === 'build' && u.tab === 'build')) find('spam', '快速連切 7 個頁籤後最後狀態不對', u); await reset();
});

await T('focus-trap', async () => {
  if (MOBILE) return; await reset(); await act(page, 'hunters'); await W(500);
  const out = []; for (let i = 0; i < 40; i++) { await page.keyboard.press('Tab'); const inside = await ev(() => !!document.activeElement?.closest('#modal')); if (!inside) out.push(i); }
  if (out.length) find('focus', 'Tab 40 次有 ' + out.length + ' 次焦點跑出視窗(焦點圈失效)', { at: out.slice(0, 5) });
  await reset();
});

await T('toasts', async () => {
  await reset(); await ev(() => { for (let i = 0; i < 5; i++) globalThis.__toast('測試提示 ' + i + ' —— 這是一段比較長的提示文字,用來檢查手機窄版時會不會蓋住底欄或被裁掉', i % 2 === 0, i === 3 ? 'warn' : undefined); }); await W(500);
  const g = await ev(() => { const t = document.querySelector('#toasts'), r = t.getBoundingClientRect(), bb = document.querySelector('#bottom-bar').getBoundingClientRect(), tb = document.querySelector('#topbar').getBoundingClientRect(); return { toasts: [r.left, r.top, r.right, r.bottom].map(Math.round), kids: t.children.length, bb: [bb.top, bb.height].map(Math.round), tb: Math.round(tb.bottom), vw: innerWidth, vh: innerHeight, cs: getComputedStyle(t).pointerEvents }; });
  scans.push({ tag: 'toasts', g }); await shot('toasts');
  if (g.toasts[2] > g.vw + 1 || g.toasts[0] < -1) find('toast', 'toast 超出視窗寬', g); if (g.toasts[3] > g.bb[0] + 4) find('toast', 'toast 蓋到底欄', g);
  scans.push({ tag: 'toast-scan', ...L.summarize(await ev(L.SCAN)) }); await W(5500); await shot('toasts-later');
});

await T('unitcard-vs-modal', async () => {
  await reset(); await ev(() => { const g = globalThis.__mistvaleGame; g.state.paused = true; const h = g.state.hunters[0]; globalThis.__mistvaleView.lookAt(h.x, h.z, 2.2); globalThis.__mistvaleSelect('hunter:' + h.id); }); await W(900);
  let r = await tap('[data-action=selInfo]', { scope: '#hv-sel' }); await W(500);
  const card = await ev(() => { const c = document.querySelector('#unit-card'); return c ? { vis: !c.classList.contains('hidden') && c.getBoundingClientRect().width > 0, r: [c.getBoundingClientRect().left, c.getBoundingClientRect().top, c.getBoundingClientRect().width, c.getBoundingClientRect().height].map(Math.round) } : null; });
  scans.push({ tag: 'unitcard', card, r }); await shot('unitcard');
  scans.push({ tag: 'unitcard-scan', ...L.summarize(await ev(L.SCAN)) });
  if (card?.vis) {
    // 開面板:小卡該收起或在視窗之下
    await page.keyboard.press('1').catch(() => {}); if (MOBILE) await act(page, 'build'); await W(500);
    const st = await ev(() => { const c = document.querySelector('#unit-card'); const modalOpen = !document.querySelector('#modal-backdrop').classList.contains('hidden'); if (!c) return { modalOpen, card: null }; const r = c.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { modalOpen, cardVisible: r.width > 0 && !c.classList.contains('hidden'), centerTop: t ? (t.closest('#unit-card') ? 'unit-card-on-top' : t.closest('#modal') ? 'modal' : t.id || t.className.toString().slice(0, 20)) : null }; });
    scans.push({ tag: 'unitcard-then-modal', st });
    if (st.modalOpen && st.centerTop === 'unit-card-on-top') find('unitcard', '獵人小卡在面板開著時仍蓋在視窗上面', st);
    await reset(); const after = await ev(() => !!document.querySelector('#unit-card') && !document.querySelector('#unit-card').classList.contains('hidden')); scans.push({ tag: 'unitcard-after-reset', after });
    // 小卡 + 縮放鈕互蓋(手機)
    await ev(() => { const g = globalThis.__mistvaleGame, h = g.state.hunters[0]; globalThis.__mistvaleSelect('hunter:' + h.id); }); await W(500); await tap('[data-action=selInfo]', { scope: '#hv-sel' }); await W(400);
    const ov = await ev(() => { const c = document.querySelector('#unit-card'); if (!c) return null; const cr = c.getBoundingClientRect(); return [...document.querySelectorAll('.view-tools button')].filter(b => b.getBoundingClientRect().width > 0).map(b => { const r = b.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return [b.dataset.action, (t === b || b.contains(t)) ? 'ok' : 'covered by ' + (t?.closest('#unit-card') ? 'unit-card' : t?.className?.toString().slice(0, 20))]; }); });
    scans.push({ tag: 'unitcard-vs-viewtools', ov }); const bad = (ov || []).filter(x => x[1] !== 'ok'); if (bad.length) { find('unitcard', '獵人小卡蓋住右側縮放/村莊全景鈕(' + bad.map(b => b[0]).join(',') + ')', ov); await shot('unitcard-overlap'); }
    // 小卡的 X 熱區
    const x = await ev(() => { const e = document.querySelector('#unit-card .uc-x'); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }); scans.push({ tag: 'uc-x', x }); if (MOBILE && x && (x[0] < 44 || x[1] < 44)) find('unitcard', `小卡關閉鈕 ${x[0]}x${x[1]} < 44px`, x);
  }
  await reset();
});

await T('left-panel-reopen', async () => {
  await reset(); const vis0 = await ev(() => { const b = document.querySelector('#reopen-left'); return b ? { hidden: b.classList.contains('hidden'), r: b.getBoundingClientRect().toJSON() } : null; }); scans.push({ tag: 'reopen-left', vis0 });
  const r = await tap('#reopen-left'); await W(500); await shot('left-open');
  const st = await ev(() => { const lp = document.querySelector('#left-panel'); const r = lp.getBoundingClientRect(); const q = document.querySelector('#hv-left').getBoundingClientRect(); const a = document.querySelector('.hv-actions').getBoundingClientRect(); const ov = (x, y) => Math.min(x.right, y.right) - Math.max(x.left, y.left) > 4 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 4; return { hidden: lp.classList.contains('hidden'), r: [r.left, r.top, r.right, r.bottom].map(Math.round), vsHvLeft: ov(r, q), vsActions: ov(r, a), vh: innerHeight, vw: innerWidth }; });
  scans.push({ tag: 'left-open', st, ok: r.ok }); scans.push({ tag: 'left-open-scan', ...L.summarize(await ev(L.SCAN)) });
  if (!r.ok) find('left', '展開村務面板鈕點不到', r.err); else if (st.hidden) find('left', '按展開村務面板沒有展開', st); else { if (st.vsHvLeft && st.r[0] < 360 && !MOBILE) find('left', '展開的村務面板與左上任務追蹤區重疊', st); if (st.r[2] > st.vw + 1 || st.r[3] > st.vh + 1) find('left', '村務面板超出視窗', st); }
  // 面板開著時開頁籤 → 應該一起被 inert,關閉後恢復
  await act(page, 'hunters'); await W(400); await reset(); await W(200); const in2 = await ev(() => [...document.querySelectorAll('[inert]')].map(e => e.id || e.className.toString().slice(0, 20))); if (in2.length) find('left', '開關面板後仍有 inert 元素', in2);
  // 面板內的按鈕
  const bt = await ev(() => [...document.querySelectorAll('#left-panel [data-action]')].filter(e => e.getBoundingClientRect().width > 0).map(e => [e.dataset.action, e.dataset.id || '', (e.textContent || '').trim().slice(0, 8)])); scans.push({ tag: 'left-btns', bt });
  for (const [a, id] of bt.slice(0, 8)) { if (a === 'toggleLeft') continue; await reset(); const lo = await ev(() => !document.querySelector('#left-panel').classList.contains('hidden')); if (!lo) await tap('#reopen-left'); await W(200); const sel = `#left-panel [data-action=${a}]` + (id ? `[data-id="${id}"]` : ''); const s0 = await ev(() => document.querySelector('#modal-backdrop').classList.contains('hidden')); const rr = await tap(sel); await W(400); const u = await UI(); if (!rr.ok) find('left', `村務面板按鈕 ${a} 點不到`, rr.err); else if (!u.modalOpen && a !== 'craftProduct') find('left', `村務面板按鈕 ${a} 沒開面板`, u); }
  await reset(); await tap('#left-panel [data-action=toggleLeft]'); await W(300);
});

await T('truncation', async () => {
  const TR = () => [...document.querySelectorAll('#modal *, #topbar *, #hv-left *, .hv-actions *, #bottom-bar *, #inspector *')].filter(e => { const r = e.getBoundingClientRect(); if (r.width < 8 || r.height < 6 || !e.textContent.trim() || e.children.length > 2) return false; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const clampV = cs.webkitLineClamp && cs.webkitLineClamp !== 'none' && e.scrollHeight > e.clientHeight + 2; const ell = cs.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1; const clip = /(hidden|clip)/.test(cs.overflowX) && cs.textOverflow !== 'ellipsis' && e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 0; return clampV || ell || clip; }).map(e => ({ t: e.textContent.trim().slice(0, 24), n: (e.id ? '#' + e.id : '') + '.' + String(e.className).split(' ')[0], w: e.clientWidth, sw: e.scrollWidth })).slice(0, 12);
  const all = {};
  for (const a of ['', 'build', 'hunters', 'trade', 'craft', 'dungeon', 'arena', 'quests', 'inventory', 'worldmap', 'settings', 'help', 'difficulty', 'recruit', 'dispatchHunters', 'boss']) { await reset(); if (a) { await act(page, a); await W(400); } const t = await ev(TR); if (t.length) all[a || 'hud'] = t; }
  scans.push({ tag: 'truncated', all });
  const n = Object.values(all).reduce((s, v) => s + v.length, 0); if (n) find('truncation', `共 ${n} 處文字被截斷/裁切(${Object.keys(all).join(',')})`, all);
  await reset();
});

await T('hex-follow-pan', async () => {
  await reset(); await ev(() => { globalThis.__mistvaleGame.state.paused = true; globalThis.__mistvaleView.focus('home'); }); await W(800);
  await ev(() => globalThis.__mistvaleSelect('forge')); await W(500);
  const pos = () => ev(() => { const h = document.querySelector('#hv-sel'); const w = globalThis.__mistvaleView; const r = w.hitRects().filter(x => x.id === 'forge'); if (!r.length) return null; const cv = document.querySelector('#world'), cr = cv.getBoundingClientRect(), u = w.unproject(cr.left + cr.width, cr.top), k = u && u.sx > 0 ? cr.width / u.sx : 1; let x0 = 1e9, x1 = -1e9, y1 = -1e9; for (const q of r) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x + q.w); y1 = Math.max(y1, q.y + q.h); } const hr = h.getBoundingClientRect(); return { hidden: h.hidden, hexCx: Math.round(hr.left + hr.width / 2), bldCx: Math.round(cr.left + (x0 + x1) / 2 * k), hexTop: Math.round(hr.top), bldFoot: Math.round(cr.top + y1 * k), vw: innerWidth }; });
  const p0 = await pos(); scans.push({ tag: 'hex-follow-0', p0 });
  await ev(() => globalThis.__mistvaleView.zoomBy(1.5)); await W(600); const p1 = await pos(); scans.push({ tag: 'hex-follow-zoom', p1 });
  if (p1 && !p1.hidden && Math.abs(p1.hexCx - p1.bldCx) > 60 && p1.bldCx > 20 && p1.bldCx < p1.vw - 20) find('hex', '縮放後六角鈕沒有跟著建築移動', { p0, p1 });
  await ev(() => { const v = globalThis.__mistvaleView; v.lookAt(0, 0, v.getScale()); }); await W(800); const p2 = await pos(); scans.push({ tag: 'hex-follow-look', p2 });
  if (p2 && !p2.hidden && Math.abs(p2.hexCx - p2.bldCx) > 60 && p2.bldCx > 20 && p2.bldCx < p2.vw - 20) find('hex', '鏡頭移動後六角鈕沒有跟著建築', { p0, p2 });
  await ev(() => globalThis.__mistvaleView.zoomBy(1 / 1.5)); await reset();
});

await T('advisor-dismiss', async () => {
  await reset(); await ev(() => { globalThis.__mistvaleGame.state.paused = false; }); await W(600);
  const has = await ev(() => !!document.querySelector('#hv-advisor [data-action=nextStep]'));
  if (!has) { scans.push({ tag: 'advisor-none' }); return; }
  await tap('#hv-advisor [data-action=nextStep]'); await W(400); let u = await UI(); await shot('advisor');
  if (u.type !== 'advisor') { find('advisor', '點顧問卡沒有開顧問對話框', u); return; }
  const btns = await ev(() => [...document.querySelectorAll('#modal [data-action]')].map(e => [e.dataset.action, (e.textContent || '').trim().slice(0, 8)]));
  scans.push({ tag: 'advisor-btns', btns });
  const dismiss = btns.find(b => b[0] === 'close' && b[1]) || btns.find(b => /知道/.test(b[1]));
  if (!dismiss) { find('advisor', '顧問對話框沒有「知道了」類關閉鈕', btns); await reset(); return; }
  await tap(`[data-action=${dismiss[0]}]:not([aria-label])`, { scope: '#modal' }).catch(() => {}); await W(600); u = await UI();
  if (u.modalOpen) { await ev(() => document.querySelector('#modal [data-action=close]')?.click()); await W(300); }
  await W(1500); const again = await UI(); scans.push({ tag: 'advisor-after-dismiss', again: again.modalOpen });
  if (again.modalOpen && again.type === 'advisor') find('advisor', '按「知道了」後顧問對話框自己又彈出來', again);
  await reset();
});

await T('dungeon-run', async () => {
  await reset(); await ev(() => { const g = globalThis.__mistvaleGame; g.state.paused = false; g.state.speed = 1; for (const id of Object.keys(g.state.buildings)) g.state.buildings[id] = Math.max(1, g.state.buildings[id]); for (const h of g.state.hunters) { h.hp = h.maxHp; } });
  await act(page, 'dungeon'); await W(500);
  let sel = await ev(() => document.querySelectorAll('#modal .party-pick.selected,#modal [aria-pressed=true][data-action=toggleDungeonHunter]').length);
  scans.push({ tag: 'dungeon-default-sel', sel });
  { const ids = await ev(() => globalThis.__mistvaleGame.state.hunters.filter(h => h.hp > 0).slice(0, 3).map(h => h.id)); for (const id of ids) { const rr = await tap(`[data-action=toggleDungeonHunter][data-id="${id}"]`, { scope: '#modal' }); if (!rr.ok) find('dungeon', '地下城選隊員點不到', rr.err); await W(250); } sel = await ev(() => document.querySelectorAll('#modal .party-pick.selected').length); scans.push({ tag: 'dungeon-sel-after', sel }); }
  let r = await tap('[data-action=startDungeon]', { scope: '#modal' }); await W(800); let u = await UI(); await shot('dungeon-start');
  const run1 = await ev(() => ({ active: globalThis.__mistvaleGame.state.dungeon.active, toast: (globalThis.__toastLog || []).slice(-1) })); scans.push({ tag: 'dungeon-start', r, run1, sel });
  if (!r.ok) { find('dungeon', '出發鈕點不到', r.err); await reset(); return; }
  if (!run1.active) { find('dungeon', '按「出發」後地下城沒有開始(預設隊伍)', run1); await reset(); return; }
  scans.push({ tag: 'dungeon-modal-running', ...L.summarize(await ev(L.SCAN)) });
  await tap('[data-action=close]', { scope: '#modal' }); await W(300);
  await ev(() => { const g = globalThis.__mistvaleGame; for (let i = 0; i < 60; i++) g.tick(0.25); }); await W(800); await shot('dungeon-hud');
  const hud = await ev(() => { const h = document.querySelector('#run-hud'); if (!h) return null; const r = h.getBoundingClientRect(); const btn = [...h.querySelectorAll('[data-action]')].map(b => { const br = b.getBoundingClientRect(); const t = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2); return [b.dataset.action, Math.round(br.width), Math.round(br.height), (t === b || b.contains(t)) ? 'ok' : 'covered:' + (t?.id || t?.className?.toString().slice(0, 20))]; }); return { r: [r.left, r.top, r.right, r.bottom].map(Math.round), btn, vw: innerWidth, vh: innerHeight }; });
  scans.push({ tag: 'run-hud', hud }); scans.push({ tag: 'run-hud-scan', ...L.summarize(await ev(L.SCAN)) });
  if (!hud) find('dungeon', '地下城進行中沒有出現 #run-hud(小隊 HUD)', await ev(() => ({ active: globalThis.__mistvaleGame.state.dungeon.active, floor: globalThis.__mistvaleGame.state.dungeon.floor })));
  else { for (const b of hud.btn) { if (b[3] !== 'ok') find('dungeon', `小隊 HUD 按鈕 ${b[0]} 被蓋住(${b[3]})`, hud); if (MOBILE && (b[1] < 44 || b[2] < 44)) find('dungeon', `小隊 HUD 按鈕 ${b[0]} 熱區 ${b[1]}x${b[2]} < 44`, hud); }
    const auto0 = await ev(() => globalThis.__mistvaleGame.state.dungeon.auto); const ra = await tap('#run-hud [data-action=runAuto]'); await W(300); const auto1 = await ev(() => globalThis.__mistvaleGame.state.dungeon.auto); if (!ra.ok) find('dungeon', '小隊 HUD「自動」點不到', ra.err); else if (auto0 === auto1) find('dungeon', '小隊 HUD「自動」點了沒切換', { auto0, auto1 });
    const rr = await tap('#run-hud [data-action=runRetreat]'); await W(500); const act1 = await ev(() => globalThis.__mistvaleGame.state.dungeon.active); await shot('dungeon-retreat'); if (!rr.ok) find('dungeon', '小隊 HUD「撤退」點不到', rr.err); else if (act1 && !(await ev(() => !!document.querySelector('#modal-backdrop:not(.hidden)')))) { await ev(() => { const g = globalThis.__mistvaleGame; for (let i = 0; i < 40; i++) g.tick(0.25); }); const act2 = await ev(() => globalThis.__mistvaleGame.state.dungeon.active); scans.push({ tag: 'retreat', act1, act2 }); if (act2) find('dungeon', '按撤退後 10 秒地下城仍在進行', { act1, act2 }); } }
  await reset();
  // 競技場
  await act(page, 'arena'); await W(500); r = await tap('[data-action=startArena]', { scope: '#modal' }); await W(1500); await shot('arena-start'); const ar = await ev(() => ({ toast: (globalThis.__toastLog || []).slice(-1), arena: JSON.stringify(globalThis.__mistvaleGame.state.arena || {}).slice(0, 120), modal: document.querySelector('#modal')?.dataset.type, open: !document.querySelector('#modal-backdrop').classList.contains('hidden') })); scans.push({ tag: 'arena-start', r, ar });
  await ev(() => { const g = globalThis.__mistvaleGame; for (let i = 0; i < 160; i++) g.tick(0.25); }); await W(800); await shot('arena-later'); scans.push({ tag: 'arena-later-scan', ...L.summarize(await ev(L.SCAN)) });
  await reset();
});

await T('hunter-detail', async () => {
  await reset(); await ev(() => { const g = globalThis.__mistvaleGame; Object.assign(g.state, { gold: 99999, gems: 999, wood: 9999, ore: 9999, herb: 9999, cloth: 9999, flour: 9999, leather: 9999 }); g.state.paused = true; });
  const id = await ev(() => globalThis.__mistvaleGame.state.hunters[0].id);
  await act(page, 'hunter', id); await W(500); await shot('hunter-detail'); scans.push({ tag: 'hunter-detail', ...L.summarize(await ev(L.SCAN)) });
  const bl = await ev(() => [...document.querySelectorAll('#modal [data-action]')].filter(e => e.getBoundingClientRect().width > 0).map(e => ({ a: e.dataset.action, id: e.dataset.id || '', lbl: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 12), dis: e.disabled })));
  scans.push({ tag: 'hunter-detail-btns', bl });
  const seen = new Set();
  for (const b of bl) {
    if (b.a === 'close' || b.dis || seen.has(b.a + b.id)) continue; seen.add(b.a + b.id);
    await reset(); await act(page, 'hunter', id); await W(300);
    const sel = `[data-action=${b.a}]` + (b.id ? `[data-id="${b.id}"]` : '');
    const loc = page.locator('#modal ' + sel).first(); await loc.scrollIntoViewIfNeeded().catch(() => {});
    const s0 = await ev(() => JSON.stringify([document.querySelector('#modal-content').innerHTML.length, globalThis.__mistvaleGame.state.gold, !document.querySelector('#modal-backdrop').classList.contains('hidden'), globalThis.__mistvaleGame.state.hunters[0].level, JSON.stringify(globalThis.__mistvaleGame.state.hunters[0].skills || '').length, (globalThis.__toastLog || []).length]));
    const ge = errs.length; const r = await tap(sel, { scope: '#modal' }); await W(400);
    const s1 = await ev(() => JSON.stringify([document.querySelector('#modal-content').innerHTML.length, globalThis.__mistvaleGame.state.gold, !document.querySelector('#modal-backdrop').classList.contains('hidden'), globalThis.__mistvaleGame.state.hunters[0].level, JSON.stringify(globalThis.__mistvaleGame.state.hunters[0].skills || '').length, (globalThis.__toastLog || []).length]));
    scans.push({ tag: 'hd-btn', a: b.a, id: b.id, lbl: b.lbl, ok: r.ok, changed: s0 !== s1, toast: await ev(() => (globalThis.__toastLog || []).slice(-1)) });
    if (!r.ok) find('hunter-detail', `獵人詳情按鈕「${b.lbl}」(${b.a}) 點不到`, r.err); else if (s0 === s1) find('hunter-detail', `獵人詳情按鈕「${b.lbl}」(${b.a}) 點了沒反應`, b);
    if (errs.length > ge) find('hunter-detail', `獵人詳情按鈕 ${b.a} 觸發錯誤`, errs.slice(ge).map(e => e.msg).join('|'));
  }
  await reset();
});

await T('visibility-offline', async () => {
  await reset(); await ev(() => { const g = globalThis.__mistvaleGame; g.state.paused = false; });
  const hide = () => ev(() => { Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  const show = off => ev(off => { const real = Date.now; Date.now = () => real() + off; Object.defineProperty(document, 'hidden', { get: () => false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); setTimeout(() => { Date.now = real; }, 50); }, off);
  await hide(); await W(300); await show(2 * 3600 * 1000);
  let calc = false; for (let i = 0; i < 20; i++) { await W(250); const st = await ev(() => ({ calc: !!document.querySelector('.offline-calc'), open: !document.querySelector('#modal-backdrop').classList.contains('hidden'), type: document.querySelector('#modal')?.dataset.type })); if (st.calc) calc = true; if (st.open) { scans.push({ tag: 'vis-offline', st, sawCalc: calc }); break; } }
  const u = await UI(); await shot('vis-offline');
  if (!(u.modalOpen && u.type === 'offline')) find('offline', '切回分頁(離開 2 小時)沒有出現離線戰報', u);
  else { scans.push({ tag: 'vis-offline-scan', ...L.summarize(await ev(L.SCAN)) }); const rr = await tap('[data-action=offlineOk]'); if (!rr.ok) { const x = await tap('[data-action=close]', { scope: '#modal' }); find('offline', '離線戰報「收下」鈕要捲動才點得到/被擋', rr.err); } await W(400); const u2 = await UI(); if (u2.modalOpen) find('offline', '離線戰報關不掉', u2); }
  const stuck = await ev(() => ({ calc: !!document.querySelector('.offline-calc'), paused: globalThis.__mistvaleGame.state.paused })); if (stuck.calc) find('offline', '離線計算中遮罩殘留', stuck);
  await reset();
});

await T('dev-panel', async () => {
  await reset(); await act(page, 'settings'); await W(300); const r = await tap('[data-action=toggleDev]', { scope: '#modal' }); await W(400);
  scans.push({ tag: 'dev-panel', r, ...L.summarize(await ev(L.SCAN)) }); await shot('dev-panel'); await tap('[data-action=toggleDev]', { scope: '#modal' }); await reset();
});

await T('big-uiscale', async () => {
  if (MOBILE) return;
  for (const [w, h] of [[1920, 1080], [2560, 1440]]) {
    await page.setViewportSize({ width: w, height: h }); await W(800); await reset();
    for (const v of ['auto', '1', '1.3', '1.5']) {
      await act(page, 'setUiScale', v); await W(400); await reset(); await W(300);
      const s = await ev(L.SCAN); scans.push({ tag: `uiscale-${w}-${v}`, ...L.summarize(s) }); if (s.covered.length || s.off.length || s.overlap.length) { find('uiscale', `${w}x${h} 介面大小 ${v}: HUD 有被蓋住/超出/重疊`, L.summarize(s)); await shot(`uiscale-${w}-${v}`); }
      await act(page, 'build'); await W(400); const s2 = await ev(L.SCAN); if (s2.covered.length || s2.off.length) { find('uiscale', `${w}x${h} 介面大小 ${v}: 建設視窗有被蓋住/超出`, L.summarize(s2)); await shot(`uiscale-build-${w}-${v}`); } const dm = await ev(() => { const m = document.querySelector('#modal').getBoundingClientRect(); return [m.left, m.top, m.right, m.bottom].map(Math.round); }); scans.push({ tag: `uiscale-modal-${w}-${v}`, dm }); await reset();
    }
    await act(page, 'resetUiScale'); await shot('uiscale-' + w);
  }
  await page.setViewportSize({ width: V.w, height: V.h }); await reset();
});

fs.writeFileSync(`${L.OUT}/${VN}-extra${process.env.ONLY ? '-only' : ''}.json`, JSON.stringify({ view: VN, errs, findings: F, scans }, null, 1));
console.log(JSON.stringify({ view: VN, errs: errs.length, findings: F.length }));
await b.close();
