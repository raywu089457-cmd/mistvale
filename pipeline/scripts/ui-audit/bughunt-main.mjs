// bughunt-main.mjs — QA 主流程(唯讀):全新存檔開局 → 導覽 → 各頁籤 → HUD → 世界選取 → 長時間 → 重新整理 → 縮放視窗
// 用法: node pipeline/scripts/ui-audit/bughunt-main.mjs <desktop|tablet|phone|land> [phases]
//   phases 逗號分隔,預設 boot,tabs,close,hud,world,long,resize,uiscale ; TARGET= 換網址(預設 http://127.0.0.1:5182/,先 node server.mjs 以 PORT=5182 HOST=127.0.0.1 起)
//   結果: output/ui-audit/bughunt/<view>.json + shots/<view>-*.png
import * as L from './bughunt-lib.mjs';
import fs from 'node:fs';
const VN = process.argv[2] || 'desktop', V = L.VIEWS[VN], PH = (process.argv[3] || 'boot,tabs,close,hud,world,pilot,realtime,long,resize,uiscale').split(',');
const MOBILE = !!V.mobile;
const b = await L.launch(); const ctx = await L.newCtx(b, V); const page = await ctx.newPage();
const errs = [], F = [], scans = [];
const S = L.hook(page, VN, errs);
const step = s => { S.step = s; };
const find = (area, title, detail, extra = {}) => { F.push({ view: VN, area, title, detail: typeof detail === 'string' ? detail : JSON.stringify(detail), step: S.step, ...extra }); };
const shot = async n => { try { await page.screenshot({ path: `${L.OUT}/shots/${VN}-${n}.png` }); } catch {} };
const W = ms => page.waitForTimeout(ms);
const act = L.act;
const ev = (fn, arg) => page.evaluate(fn, arg);
const scan = async (tag, { shotOnIssue = false } = {}) => {
  const s = await ev(L.SCAN); const sm = L.summarize(s); scans.push({ tag, ...sm });
  if (shotOnIssue && (s.covered.length || s.off.length || s.overlap.length)) await shot('scan-' + tag.replace(/[^\w-]+/g, '_'));
  return s;
};
// 真的點(桌機滑鼠/手機觸控);被擋住就回報
const tap = async (sel, o = {}) => {
  const loc = o.scope ? page.locator(o.scope).locator(sel).first() : page.locator(sel).first();
  try { if (MOBILE) await loc.tap({ timeout: o.timeout || 2500 }); else await loc.click({ timeout: o.timeout || 2500 }); return { ok: true }; }
  catch (e) { const m = String(e.message).split(/\r?\n/); return { ok: false, err: m[0].slice(0, 90) + ' | ' + m.filter(l => /intercepts|not visible|outside|not enabled/.test(l)).slice(0, 1).join('').trim().slice(0, 180) }; }
};
const tapAt = async (x, y) => { if (MOBILE) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); };
const UI = () => ev(() => {
  const g = globalThis.__mistvaleGame, s = g.state, q = x => document.querySelector(x), vis = e => e && !e.hidden && !e.classList.contains('hidden') && e.getBoundingClientRect().width > 0;
  const mb = q('#modal-backdrop');
  return {
    modalOpen: !mb.classList.contains('hidden'), modalType: q('#modal')?.dataset.type || '', title: q('#modal-title')?.textContent || '', modalTab: document.body.dataset.modalTab || '',
    bodyCls: document.body.className, inert: [...document.querySelectorAll('[inert]')].map(e => e.id || e.className.toString().slice(0, 20)),
    sel: vis(q('#hv-sel')), selTarget: q('#hv-sel')?.dataset.target || '', inspector: vis(q('#inspector')), unitCard: !!q('#unit-card:not(.hidden)') && vis(q('#unit-card')), placement: vis(q('#placement')),
    left: vis(q('#left-panel')), cmdk: !!q('#cmdk'), title_screen: !!q('#title-screen'), loading: !!q('#loading'), paused: s.paused, speed: s.speed, time: Math.round(s.time * 10) / 10,
    gold: Math.round(s.gold), wood: Math.round(s.wood), hunters: s.hunters.length, toasts: document.querySelectorAll('#toasts > *').length, scale: globalThis.__mistvaleView?.getScale?.(),
    active: (document.activeElement?.id || document.activeElement?.tagName || ''), docOverflow: [document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight],
    quest: q('#hv-quest-title')?.textContent || '', advisor: q('#hv-advisor')?.textContent?.replace(/\s+/g, ' ').slice(0, 60) || '',
  };
});
const sigOf = () => ev(() => {
  const g = globalThis.__mistvaleGame, s = g.state, mc = document.querySelector('#modal-content');
  let h = 0; const t = (mc?.innerHTML || ''); for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
  return JSON.stringify([!document.querySelector('#modal-backdrop').classList.contains('hidden'), document.querySelector('#modal')?.dataset.type, h, Math.round(s.gold), s.wood | 0, s.ore | 0, s.herb | 0, s.gems | 0, s.hunters.length, s.paused, s.speed, JSON.stringify(s.buildings), !document.querySelector('#inspector').classList.contains('hidden'), !document.querySelector('#placement').classList.contains('hidden'), document.body.className, globalThis.__toastSeen || 0, document.querySelector('#hv-sel')?.hidden]);
});
const cleanCheck = async (label) => {
  const u = await UI();
  if (u.modalOpen) find('close', `${label}: 關閉後 modal 仍開著`, u);
  if (u.modalTab) find('close', `${label}: 關閉後 body.dataset.modalTab 殘留`, u.modalTab);
  if (u.inert.length) find('close', `${label}: 關閉後 HUD 仍是 inert`, u.inert);
  const blocked = await ev(() => { const el = document.elementFromPoint(innerWidth / 2, innerHeight / 3); return el ? (el.id || el.className.toString().slice(0, 30) || el.tagName) : null; });
  if (blocked && !/world|hv-sel|hv-hud|screen-grade|hv-left/.test(blocked)) find('close', `${label}: 關閉後畫面中央被 ${blocked} 擋住(點不到場景)`, blocked);
};
const reset = async () => { await ev(() => { try { globalThis.__mistvaleCmdk?.close(); } catch {} try { globalThis.__mistvaleGame.pilotStop?.(); } catch {} document.querySelectorAll('#pilotlab [data-pilot=close],#pilotlab [data-pilot=stop]').forEach(b => b.click()); document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click(); document.querySelector('#title-screen')?.remove(); try { globalThis.__mistvaleSelect?.(null); } catch {} document.querySelector('[data-action=closeInspector]')?.click(); document.querySelector('#unit-card [data-action=unitCardClose]')?.click(); }); await W(150); };
await ev(() => {}).catch(() => {});

// ===== phase: boot =====
async function pBoot() {
  step('boot:fresh-save');
  await L.boot(page);
  await ev(() => { const mo = new MutationObserver(m => { for (const r of m) { globalThis.__toastSeen = (globalThis.__toastSeen || 0) + r.addedNodes.length; (globalThis.__toastLog ||= []).push(...[...r.addedNodes].map(n => (n.textContent || '').trim().slice(0, 80))); } }); mo.observe(document.querySelector('#toasts'), { childList: true }); });
  // 標題畫面
  step('boot:title-screen');
  await page.waitForSelector('#title-screen', { timeout: 8000 }).catch(() => find('boot', '標題畫面沒有出現', ''));
  await W(600);
  const t0 = await UI(); await shot('01-title');
  const ts = await ev(() => ({ rect: document.querySelector('#title-screen .ts-inner')?.getBoundingClientRect().toJSON(), btns: [...document.querySelectorAll('#title-screen button')].map(e => [e.textContent, Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)]), vh: innerHeight, vw: innerWidth, welcomeBehind: document.querySelector('#modal')?.dataset.type }));
  scans.push({ tag: 'title', ...L.summarize(await ev(L.SCAN)) });
  await W(3000); const t1 = await UI();
  if (t1.time > t0.time + 1) find('boot', '標題畫面還在時遊戲時間已在跑(玩家還沒按開始)', { t0: t0.time, t1: t1.time });
  if (t1.modalOpen) find('boot', '標題畫面蓋住時,後面的「歡迎」對話框已經打開(焦點/鍵盤事件在看不到的視窗上)', { type: t1.modalType, active: t1.active });
  // Enter 鍵在標題畫面:同時被後面的 welcome 對話框接走嗎
  step('boot:dismiss-title');
  if (VN === 'desktop') { await page.keyboard.press('Enter'); }
  else if (VN === 'tablet') { await tapAt(30, 30); }
  else if (VN === 'phone') { await tapAt(V.w / 2, V.h - 20); }
  else { await tap('#title-screen [data-ts=continue]'); }
  await W(700);
  const t2 = await UI();
  if (t2.title_screen) find('boot', '標題畫面按了(' + (VN === 'desktop' ? 'Enter' : '點空白/按鈕') + ')關不掉', t2, {});
  await shot('02-after-title');
  step('boot:welcome');
  if (!t2.modalOpen || t2.modalType !== 'welcome') find('boot', '全新存檔進村後沒有看到歡迎導覽對話框', { modal: t2.modalType, open: t2.modalOpen });
  else {
    await scan('welcome', { shotOnIssue: true });
    const dlg = await ev(() => { const m = document.querySelector('#modal').getBoundingClientRect(); const a = [...document.querySelectorAll('#modal [data-action]')].map(e => { const r = e.getBoundingClientRect(); return [e.dataset.action, Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; }); return { m: [m.left, m.top, m.width, m.height].map(Math.round), a, vw: innerWidth, vh: innerHeight, scroll: document.querySelector('#modal-content').scrollHeight - document.querySelector('#modal-content').clientHeight }; });
    scans.push({ tag: 'welcome-geom', dlg });
    // 「看完整說明」→ help;再回去
    step('boot:welcome-help');
    let r = await tap('[data-action=welcomeHelp]', { scope: '#modal' });
    if (!r.ok) find('boot', '歡迎對話框「看完整說明」點不到', r.err);
    await W(300); const u1 = await UI();
    if (r.ok && u1.modalType !== 'help') find('boot', '歡迎→「看完整說明」沒有打開說明頁', { type: u1.modalType, title: u1.title });
    await shot('03-welcome-help');
    // 說明頁的關閉鈕
    r = await tap('[data-action=close]', { scope: '#modal' }); await W(250);
    if ((await UI()).modalOpen) find('boot', '說明頁 X 關不掉', '');
    // 重開歡迎(右上說明→重看開場)
    await act(page, 'welcomeReplay'); await W(300);
    step('boot:welcome-start');
    r = await tap('[data-action=welcomeStart]', { scope: '#modal' });
    if (!r.ok) find('boot', '歡迎對話框「開始遊戲」點不到', r.err);
    await W(400); const u2 = await UI();
    if (u2.modalOpen) find('boot', '按「開始遊戲」後對話框沒關', u2);
    await cleanCheck('歡迎對話框關閉');
  }
  await shot('04-hud-after-welcome');
  await scan('hud-fresh', { shotOnIssue: true });
  // 導覽:顧問提示與任務追蹤
  step('guide:advisor');
  for (let i = 0; i < 4; i++) {
    const adv = await ev(() => { const a = document.querySelector('#hv-advisor'); const btn = a?.querySelector('[data-action=nextStep]'); return { has: !!btn, txt: a?.textContent?.replace(/\s+/g, ' ').slice(0, 80), act: btn?.dataset.act, key: btn?.dataset.key, vis: btn && btn.getBoundingClientRect().width > 0 }; });
    scans.push({ tag: 'advisor-' + i, adv });
    if (!adv.has || !adv.vis) break;
    step('guide:advisor-click-' + i);
    let r = await tap('#hv-advisor [data-action=nextStep]');
    if (!r.ok) { find('guide', '顧問提示卡點不到', r.err); break; }
    await W(350); const u = await UI();
    if (!u.modalOpen || u.modalType !== 'advisor') find('guide', '點顧問提示沒有開出顧問對話框', { type: u.modalType, adv });
    else {
      await shot('05-advisor-' + i); await scan('advisor-dlg', { shotOnIssue: true });
      r = await tap('[data-action=nextStepGo]', { scope: '#modal' }); await W(350);
      const u3 = await UI();
      if (!r.ok) find('guide', '顧問對話框的前往鈕點不到', r.err);
      if (adv.act && ['quests', 'hunters', 'dungeon', 'build', 'worldmap'].includes(adv.act) && u3.modalType !== (adv.act === 'worldmap' ? 'worldmap' : adv.act)) find('guide', `顧問前往(${adv.act})沒有打開對應面板`, { type: u3.modalType });
      await reset();
    }
    break;
  }
  step('guide:quest-tracker');
  let r = await tap('#hv-quest'); await W(350); let u = await UI();
  if (!r.ok) find('guide', '左上任務追蹤點不到', r.err);
  else if (u.modalType !== 'quests') find('guide', '點任務追蹤沒有開委託面板', { type: u.modalType });
  await shot('06-quests-via-tracker');
  step('guide:quest-claim');
  { const q0 = await ev(() => document.querySelector('#hv-quest-title')?.textContent); const rr = await tap('[data-action=quest]', { scope: '#modal' }); await W(500); const q1 = await ev(() => document.querySelector('#hv-quest-title')?.textContent); scans.push({ tag: 'quest-claim', q0, q1, rr }); if (!rr.ok) find('guide', '委託面板「領取」點不到', rr.err); else if (q0 === q1) find('guide', '領取委託後 HUD 任務追蹤沒更新', { q0, q1 }); }
  await reset();
}

// ===== phase: tabs =====
const TABS = [['build', '1'], ['hunters', '2'], ['trade', '3'], ['craft', '4'], ['dungeon', '5'], ['arena', '6'], ['quests', '7']];
const EXTRA = ['worldmap', 'inventory', 'recruit', 'difficulty', 'settings', 'help', 'boss', 'dispatchHunters', 'codex'];
const DANGER = new Set(['reset', 'export', 'cheat', 'toggleDev', 'regionTravel', 'setOpt', 'welcomeReplay']);
async function openTab(a) {
  const barBtn = `#bottom-bar [data-action="${a}"]`;
  if (await page.locator(barBtn).count()) return tap(barBtn);
  const top = `#topbar [data-action="${a}"]`; if (await page.locator(top).count()) return tap(top);
  await act(page, a); return { ok: true, synthetic: true };
}
async function pTabs() {
  await reset();
  // 給足資源(測「按了有反應」,不是測資源不足)
  await ev(() => { const g = globalThis.__mistvaleGame; Object.assign(g.state, { gold: 99999, wood: 9999, ore: 9999, herb: 9999, cloth: 9999, flour: 9999, leather: 9999, gems: 999 }); });
  for (const a of [...TABS.map(t => t[0]), ...EXTRA]) {
    step('tab:' + a + ':open');
    await reset();
    const r = await openTab(a);
    await W(500);
    let u = await UI();
    if (!r.ok) { find('tabs', `${a}: 入口按鈕點不到`, r.err); await act(page, a); await W(400); u = await UI(); }
    if (!u.modalOpen) { find('tabs', `${a}: 開了沒有視窗`, u); continue; }
    await shot('tab-' + a);
    const s = await scan('tab-' + a, { shotOnIssue: true });
    // 捲動容器
    step('tab:' + a + ':scroll');
    const sc = await ev(() => { const c = document.querySelector('#modal-content'); const before = c.scrollTop; c.scrollTop = c.scrollHeight; const after = c.scrollTop; const hint = document.querySelector('#scroll-hint'); const hintShown = hint && getComputedStyle(hint).display !== 'none' && hint.getBoundingClientRect().height > 0; const bottomHint = hintShown; c.scrollTop = 0; return { sh: c.scrollHeight, ch: c.clientHeight, moved: after - before, hintShown: bottomHint }; });
    scans.push({ tag: 'scroll-' + a, ...sc });
    // 子頁籤
    step('tab:' + a + ':subtabs');
    const subs = await ev(() => [...document.querySelectorAll('#modal [role=tab],#modal .tab-row button,#modal .subtabs button,#modal [data-action=craftTab],#modal [data-action=dispatchTab]')].filter(e => e.getBoundingClientRect().width > 0).map((e, i) => ({ i, a: e.dataset.action, id: e.dataset.id, idx: e.dataset.index, t: e.textContent.trim().slice(0, 8) })));
    for (const sub of subs) {
      const sel = sub.a ? `[data-action="${sub.a}"]${sub.id ? `[data-id="${sub.id}"]` : ''}${sub.idx ? `[data-index="${sub.idx}"]` : ''}` : `#modal [role=tab]:nth-of-type(${sub.i + 1})`;
      const s0 = await sigOf(); const rr = await tap(sel, { scope: '#modal' }); await W(300);
      if (!rr.ok) find('tabs', `${a}: 子頁籤「${sub.t}」點不到`, rr.err); else if ((await sigOf()) === s0 && !/active|selected/.test('')) find('tabs', `${a}: 子頁籤「${sub.t}」點了沒反應`, sub);
    }
    // 每顆按鈕
    step('tab:' + a + ':buttons');
    await reset(); await openTab(a); await W(400);
    const list = await ev(() => [...document.querySelectorAll('#modal [data-action], #modal button')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest('.hidden'); }).map((e, i) => ({ i, a: e.dataset.action || '', id: e.dataset.id || '', di: e.dataset.index || '', dv: e.dataset.value || '', key: e.dataset.key || '', lbl: (e.textContent || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 16), dis: e.disabled })));
    const seen = new Set(); let tested = 0;
    for (const bt of list) {
      const k = bt.a + '|' + bt.id + '|' + bt.di + '|' + bt.dv + '|' + bt.key; if (seen.has(k) && bt.a) continue; seen.add(k);
      if (bt.a === 'close' || DANGER.has(bt.a) || bt.dis || (tested >= (MOBILE || VN === 'desktop' ? 40 : 14))) continue;
      tested++;
      step(`tab:${a}:btn:${bt.a || bt.lbl}${bt.id ? '(' + bt.id + ')' : ''}`);
      await reset(); await openTab(a); await W(250);
      let sel = bt.a ? `[data-action="${bt.a}"]` + (bt.id ? `[data-id="${bt.id}"]` : '') + (bt.di ? `[data-index="${bt.di}"]` : '') + (bt.dv ? `[data-value="${bt.dv}"]` : '') + (bt.key ? `[data-key="${bt.key}"]` : '') : null;
      let loc = sel ? page.locator('#modal ' + sel).first() : page.locator('#modal button').nth(bt.i);
      if (!(await loc.count())) { find('tabs', `${a}: 按鈕「${bt.lbl}」重開後找不到`, bt); continue; }
      await loc.scrollIntoViewIfNeeded().catch(() => {});
      const ge = errs.length, s0 = await sigOf();
      let rr; try { if (MOBILE) await loc.tap({ timeout: 2500 }); else await loc.click({ timeout: 2500 }); rr = { ok: true }; } catch (e) { rr = { ok: false, err: String(e.message).split(/\r?\n/).filter(l => /intercepts|outside|not visible|not enabled|Timeout/.test(l)).slice(0, 2).join(' ').slice(0, 200) }; }
      await W(350);
      if (!rr.ok) { find('tabs', `${a}: 按鈕「${bt.lbl}」(${bt.a}) 點不到`, rr.err, { bt }); continue; }
      const s1 = await sigOf();
      { const pl = await ev(() => ({ placing: !document.querySelector('#placement').classList.contains('hidden'), toast: (globalThis.__toastLog || []).slice(-2) })); scans.push({ tag: 'btn-result', tab: a, a: bt.a, id: bt.id, lbl: bt.lbl, changed: s1 !== s0, ...pl }); if (pl.placing) find('tabs', `${a}: 按鈕「${bt.lbl}」(${bt.a}) 之後進入了放置模式(#placement 顯示)`, pl, { bt }); }
      if (s1 === s0) find('tabs', `${a}: 按鈕「${bt.lbl}」(${bt.a}${bt.id ? ':' + bt.id : ''}) 點了沒反應`, bt, { bt });
      if (errs.length > ge) find('tabs', `${a}: 按鈕「${bt.lbl}」(${bt.a}) 觸發錯誤`, errs.slice(ge).map(e => e.msg).join(' | '));
    }
    await reset();
  }
}

// ===== phase: close =====
async function pClose() {
  for (const [a] of TABS) {
    step('close:' + a);
    await reset();
    // 再點同頁籤
    await openTab(a); await W(350);
    let r = await tap(`#bottom-bar [data-action="${a}"]`); await W(350);
    let u = await UI(); if (!r.ok) find('close', `${a}: 開著時再點頁籤點不到(底欄被擋)`, r.err); else if (u.modalOpen) find('close', `${a}: 再點同頁籤沒有關閉(應切換)`, { type: u.modalType });
    await cleanCheck(a + ' 再點同頁籤'); await reset();
    // X
    await openTab(a); await W(350); r = await tap('[data-action=close]', { scope: '#modal' }); await W(350);
    if (!r.ok) find('close', `${a}: X 點不到`, r.err); await cleanCheck(a + ' X'); await reset();
    // Esc
    await openTab(a); await W(350); await page.keyboard.press('Escape'); await W(350); await cleanCheck(a + ' Esc');
    // 點場景(背板邊緣)
    await openTab(a); await W(350);
    const bd = await ev(() => { const m = document.querySelector('#modal').getBoundingClientRect(); return { l: m.left, t: m.top, r: m.right, b: m.bottom, w: innerWidth, h: innerHeight }; });
    const px = bd.l > 14 ? 6 : bd.r < bd.w - 14 ? bd.w - 6 : null, py = bd.t > 70 ? 8 : null;
    if (px != null || py != null) { await tapAt(px ?? bd.w / 2, px != null ? bd.h / 2 : py); await W(350); u = await UI(); if (u.modalOpen) find('close', `${a}: 點視窗外的場景沒有關閉`, { px, py, bd }); }
    else scans.push({ tag: 'close-bd-none-' + a, bd });
    await reset();
  }
  // 開 A 再直接點 B
  step('close:A-then-B');
  const pairs = [['build', 'hunters'], ['hunters', 'quests'], ['craft', 'build'], ['dungeon', 'arena'], ['trade', 'craft'], ['quests', 'dungeon']];
  for (const [A, B] of pairs) {
    await reset(); await openTab(A); await W(300);
    const r = await tap(`#bottom-bar [data-action="${B}"]`); await W(450); const u = await UI();
    if (!r.ok) find('close', `開 ${A} 後點 ${B} 頁籤點不到(底欄被擋)`, r.err);
    else if (u.modalType !== B || !u.modalOpen) find('close', `開 ${A} 再點 ${B}:狀態錯誤`, { type: u.modalType, open: u.modalOpen, tab: u.modalTab });
    else if (u.modalTab !== B) find('close', `開 ${A} 再點 ${B}:body.modalTab=${u.modalTab}`, u);
    await scan(`A-${A}-B-${B}`, { shotOnIssue: true });
  }
  // 頂欄入口在 modal 開著時也要能點:資源疊→倉庫
  step('close:topbar-while-modal');
  await reset(); await openTab('build'); await W(300);
  for (const [sel, expect] of [['#topbar .treasury', 'inventory'], ['#topbar [data-action=hunters]', 'hunters'], ['#topbar [data-action=settings]', 'settings'], ['#topbar [data-action=help]', 'help'], ['#topbar [data-action=worldmap]', 'worldmap']]) {
    await openTab('build'); await W(250);
    const r = await tap(sel); await W(350); const u = await UI();
    if (!r.ok) find('close', `modal 開著時頂欄 ${sel} 點不到`, r.err); else if (u.modalType !== expect) find('close', `modal 開著時點 ${sel} 預期 ${expect} 實際 ${u.modalType}`, u);
  }
  await reset();
}

// ===== phase: hud =====
async function pHud() {
  await reset(); await ev(() => { globalThis.__mistvaleGame.state.paused = false; });
  const cases = [['#topbar .treasury', 'inventory', '資源疊'], ['#topbar .hv-tr2 [data-action=inventory]', 'inventory', '右上倉庫鈕'], ['#topbar .hv-tr2 [data-action=worldmap]', 'worldmap', '右上世界地圖'], ['#topbar .hv-tr2 [data-action=help]', 'help', '右上說明'], ['#topbar .hv-tr2 [data-action=settings]', 'settings', '右上設定'], ['#topbar .population', 'hunters', '人口'], ['#topbar .hv-crest', 'difficulty', '徽章/難度'], ['.hv-actions [data-act=hunters]', 'hunters', '行動徽章:獵人'], ['.hv-actions [data-act=arena]', 'arena', '行動徽章:競技場'], ['.hv-actions [data-act=boss]', 'boss', '行動徽章:首領'], ['#hv-quest', 'quests', '任務追蹤']];
  for (const [sel, expect, name] of cases) {
    step('hud:' + name); await reset();
    const vis = await page.locator(sel).first().isVisible().catch(() => false);
    if (!vis) { find('hud', `${name}: 不可見(${sel})`, '', { sel }); continue; }
    const r = await tap(sel); await W(400); const u = await UI();
    if (!r.ok) find('hud', `${name}: 點不到`, r.err, { sel }); else if (u.modalType !== expect) find('hud', `${name}: 預期開 ${expect} 實際 ${u.modalType || '(無)'}`, u, { sel });
    await reset();
  }
  // 行動徽章文字(含冷卻)
  step('hud:badges');
  const bad = await ev(() => ({ hunters: document.querySelector('#hv-act-hunters')?.textContent, boss: [document.querySelector('#hv-act-boss1')?.textContent, document.querySelector('#hv-act-boss2')?.textContent] }));
  scans.push({ tag: 'badges-0', bad });
  // 暫停 / 速度
  step('hud:pause-speed');
  let u0 = await UI(); await tap('#pause'); await W(250); let u1 = await UI();
  if (u0.paused === u1.paused) find('hud', '暫停鈕點了狀態沒變', { u0: u0.paused, u1: u1.paused });
  const pl = await ev(() => ({ t: document.querySelector('#pause')?.textContent, lab: document.querySelector('#pause-label')?.className, vis: !document.querySelector('#pause-label').classList.contains('hidden') }));
  if (u1.paused && pl.vis === false) find('hud', '暫停後「遊戲暫停」標籤沒出現', pl);
  await tap('#pause'); await W(200);
  const sp0 = (await UI()).speed; await tap('#speed'); await W(200); const sp1 = (await UI()).speed; if (sp0 === sp1) find('hud', '速度鈕點了沒變', { sp0, sp1 });
  await tap('#speed'); await tap('#speed'); await W(200); // 回到 1x
  await ev(() => { globalThis.__mistvaleGame.state.speed = 1; });
  // 縮放鈕
  step('hud:zoom');
  const z0 = (await UI()).scale; await tap('.view-tools [data-action=zoomIn]'); await W(500); const z1 = (await UI()).scale; await tap('.view-tools [data-action=zoomOut]'); await tap('.view-tools [data-action=zoomOut]'); await W(500); const z2 = (await UI()).scale;
  if (!(z1 > z0)) find('hud', '放大鈕沒有放大', { z0, z1 }); if (!(z2 < z1)) find('hud', '縮小鈕沒有縮小', { z1, z2 });
  await tap('.view-tools [data-action=home]'); await W(600);
  // 左側面板收合/展開
  step('hud:left-panel');
  const hasLeft = await ev(() => { const e = document.querySelector('#left-panel'); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; });
  scans.push({ tag: 'left-panel-visible', hasLeft });
  if (hasLeft) { const r = await tap('#left-panel [data-action=toggleLeft]'); await W(300); const l1 = await UI(); if (!r.ok) find('hud', '左面板收合鈕點不到', r.err); else { if (l1.left) find('hud', '左面板按收合後仍可見', l1); const r2 = await tap('#reopen-left'); await W(300); if (!r2.ok) find('hud', '展開村務面板鈕點不到', r2.err); else if (!(await UI()).left) find('hud', '展開村務面板沒有展開', ''); } }
  else { const rl = await ev(() => { const b = document.querySelector('#reopen-left'); return b ? { hidden: b.classList.contains('hidden'), r: b.getBoundingClientRect().toJSON() } : null; }); scans.push({ tag: 'reopen-left', rl }); }
  // Ctrl/⌘+K
  step('hud:cmdk');
  await page.keyboard.press('Control+k'); await W(400); let cu = await UI(); await shot('hud-cmdk');
  if (!cu.cmdk) find('hud', 'Ctrl+K 沒有開出指令面板', ''); else {
    await scan('cmdk', { shotOnIssue: true });
    await page.keyboard.type('建設'); await W(200); await page.keyboard.press('Enter'); await W(400); cu = await UI();
    if (cu.cmdk) find('hud', '指令面板 Enter 後沒有關閉', ''); if (cu.modalType !== 'build') find('hud', '指令面板輸入「建設」Enter 後沒有開建設', { type: cu.modalType });
    await reset(); await page.keyboard.press('Control+k'); await W(250); await page.keyboard.press('Escape'); await W(250); if ((await UI()).cmdk) find('hud', '指令面板 Esc 關不掉', '');
    // 指令面板開著時開其他視窗會怎樣
    await page.keyboard.press('Control+k'); await W(250); await page.keyboard.press('Control+k'); await W(250);
  }
  await reset();
  // 鍵盤快捷鍵
  step('hud:keys');
  if (!MOBILE) {
    for (const [k, exp] of [['1', 'build'], ['2', 'hunters'], ['3', 'trade'], ['4', 'craft'], ['5', 'dungeon'], ['6', 'arena'], ['7', 'quests'], ['m', 'worldmap']]) {
      await reset(); await page.keyboard.press(k); await W(300); const u = await UI(); if (u.modalType !== exp) find('hud', `鍵盤 ${k} 預期開 ${exp} 實際 ${u.modalType || '(無)'}`, u);
    }
    await reset(); const p0 = (await UI()).paused; await page.keyboard.press('Space'); await W(200); if ((await UI()).paused === p0) find('hud', '空白鍵沒有切換暫停', ''); await page.keyboard.press('Space');
    // 開著視窗時按 1~7/M/Space 不該有副作用
    await openTab('build'); await W(300); await page.keyboard.press('Space'); await W(200); const pp = (await UI()).paused; if (pp !== p0) find('hud', '視窗開著按空白鍵改變了暫停狀態', { p0, pp });
    await reset();
  }
  // 日夜列 / 區域徽章 文字溢出
  await scan('hud-final', { shotOnIssue: true }); await shot('hud-final');
  // 可領獎提示:把任務完成
  step('hud:quest-claimable');
  const q = await ev(() => { const g = globalThis.__mistvaleGame; const ql = g.questList?.(); return Array.isArray(ql) ? ql.map(x => ({ id: x.id, done: x.done || x.complete, claimable: x.claimable, title: x.title })).slice(0, 3) : typeof ql; });
  scans.push({ tag: 'questlist', q });
}

// ===== phase: world =====
async function rectsOf(id) {
  return ev(id => { const w = globalThis.__mistvaleView, cv = document.querySelector('#world'), cr = cv.getBoundingClientRect(), u = w.unproject(cr.left + cr.width, cr.top), k = u && u.sx > 0 ? cr.width / u.sx : 1;
    let list; if (id.startsWith('hunter:')) list = w.unitRects?.().filter(r => 'hunter:' + r.id === id); else list = w.hitRects?.().filter(r => r.id === id);
    if (!list || !list.length) return null; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const r of list) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
    return { x: cr.left + (x0 + x1) / 2 * k, y: cr.top + (y0 + y1) / 2 * k, w: (x1 - x0) * k, h: (y1 - y0) * k }; }, id);
}
async function pWorld() {
  await reset();
  await ev(() => { const g = globalThis.__mistvaleGame; g.state.paused = true; for (const id of Object.keys(g.state.buildings)) g.state.buildings[id] = Math.max(1, g.state.buildings[id]); globalThis.__mistvaleView.focus('home'); });
  await W(900);
  const blds = ['forge', 'tavern', 'inn', 'hall'];
  for (const id of blds) {
    step('world:select-building:' + id); await reset(); await ev(() => globalThis.__mistvaleView.focus('home')); await W(700);
    const rc = await rectsOf(id);
    if (!rc) { scans.push({ tag: 'norect-' + id }); continue; }
    await tapAt(rc.x, rc.y); await W(500);
    let u = await UI();
    if (!u.sel || !u.selTarget) { find('world', `點建築 ${id}(${Math.round(rc.x)},${Math.round(rc.y)}) 沒有出現六角鈕`, { sel: u.sel, tgt: u.selTarget, modal: u.modalType, inspector: u.inspector, rc }); await shot('world-nosel-' + id); continue; }
    await shot('world-sel-' + id);
    const hx = await ev(() => { const q = s => document.querySelector(s); return [...document.querySelectorAll('#hv-sel button')].map(e => { const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { a: e.dataset.action, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), cov: !(top === e || e.contains(top)) ? (top?.id || top?.className?.toString().slice(0, 25) || top?.tagName) : '', vw: innerWidth, vh: innerHeight, bb: Math.round(q('#bottom-bar').getBoundingClientRect().top) }; }); });
    scans.push({ tag: 'hex-' + id, hx });
    for (const h of hx) { if (h.cov) find('world', `六角鈕 ${h.a} 被 ${h.cov} 擋住(點 ${id})`, h); if (MOBILE && (h.w < 44 || h.h < 44)) find('world', `六角鈕 ${h.a} 熱區 ${h.w}x${h.h} < 44`, h); if (h.y + h.h > h.bb + 2) find('world', `六角鈕 ${h.a} 壓到底欄`, h); }
    // 資訊
    let r = await tap('[data-action=selInfo]', { scope: '#hv-sel' }); await W(450); u = await UI();
    if (!r.ok) find('world', `六角「資訊」點不到(${id})`, r.err); else if (!u.inspector && !u.modalOpen) find('world', `點六角「資訊」後沒有開詳情(${id})`, u);
    await shot('world-info-' + id);
    if (u.inspector || u.modalOpen) { await scan('inspector-' + id, { shotOnIssue: true }); }
    // 關閉詳情後選取狀態
    await ev(() => { document.querySelector('[data-action=closeInspector]')?.click(); document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click(); }); await W(300); u = await UI();
    if (u.sel) find('world', `關閉詳情後六角鈕還在(選取沒清)(${id})`, u);
    // 重新選取 → 取消
    await tapAt(rc.x, rc.y); await W(400); r = await tap('[data-action=selCancel]', { scope: '#hv-sel' }); await W(300); u = await UI();
    if (!r.ok) find('world', `六角「取消」點不到(${id})`, r.err); else if (u.sel) find('world', `按六角取消後六角鈕仍在(${id})`, u);
    // 鍵盤 Enter / Esc
    if (!MOBILE) { await tapAt(rc.x, rc.y); await W(400); await ev(() => document.activeElement?.blur?.()); await page.keyboard.press('Enter'); await W(400); u = await UI(); if (!u.inspector && !u.modalOpen) find('world', `選取後按 Enter 沒開資訊(${id})`, u); await reset(); await tapAt(rc.x, rc.y); await W(300); await page.keyboard.press('Escape'); await W(300); if ((await UI()).sel) find('world', `選取後按 Esc 沒取消(${id})`, ''); }
  }
  // 獵人
  step('world:select-hunter'); await reset();
  const hid = await ev(() => { const g = globalThis.__mistvaleGame, h = g.state.hunters[0]; g.state.paused = true; globalThis.__mistvaleView.lookAt(h.x, h.z, 2.2); return 'hunter:' + h.id; });
  await W(900); let hr = await rectsOf(hid);
  if (!hr) find('world', '找不到獵人點擊框', hid); else {
    await tapAt(hr.x, hr.y); await W(500); let u = await UI();
    if (!u.sel) { find('world', '點獵人沒出現六角鈕', { u: u.selTarget, unit: u.unitCard, modal: u.modalType }); await shot('world-hunter-nosel'); }
    else {
      await shot('world-sel-hunter');
      let r = await tap('[data-action=selInfo]', { scope: '#hv-sel' }); await W(500); u = await UI(); await shot('world-hunter-card');
      if (!u.unitCard && !u.modalOpen) find('world', '獵人六角「資訊」沒有開卡片', u);
      else { await scan('unit-card', { shotOnIssue: true }); const det = await tap('#unit-card [data-action=unitDetail]'); await W(400); u = await UI(); if (!det.ok) find('world', '獵人小卡「詳情」點不到', det.err); else if (u.modalType !== 'hunter') find('world', '獵人小卡詳情沒開', u); await reset(); }
    }
  }
  // 選取中切面板
  step('world:select-then-panel'); await reset(); await ev(() => globalThis.__mistvaleView.focus('home')); await W(600);
  const rc2 = await rectsOf('forge'); if (rc2) {
    await tapAt(rc2.x, rc2.y); await W(400); await openTab('hunters'); await W(400); let u = await UI();
    if (u.sel) find('world', '選取建築後開獵人面板,六角鈕還浮在視窗上', u);
    await shot('world-sel-then-panel');
    await page.keyboard.press('Escape'); await W(400); u = await UI(); scans.push({ tag: 'after-panel-close', sel: u.sel, tgt: u.selTarget });
    if (u.sel === false && u.selTarget) find('world', '關面板後六角鈕沒回來但 selTarget 仍存在(不一致)', u);
    await reset();
    // 選取中點空地
    await tapAt(rc2.x, rc2.y); await W(300); await tapAt(V.w * 0.5, V.h * 0.25); await W(400); u = await UI(); scans.push({ tag: 'select-then-empty-tap', sel: u.sel });
    await reset();
    // 選取中按 hv-sel 的 Esc + 頁籤
  }
  // 拖曳 → 再點
  step('world:drag-then-select'); await reset(); await ev(() => globalThis.__mistvaleView.focus('home')); await W(600);
  const c0 = await ev(() => { const v = globalThis.__mistvaleView; return [v.project(0, 0, 0).x, v.project(0, 0, 0).y]; });
  if (MOBILE) { const cdp = await ctx.newCDPSession(page); const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i })) });
    await touch('touchStart', [[V.w / 2, V.h / 2]]); for (let i = 1; i <= 8; i++) await touch('touchMove', [[V.w / 2 - i * 14, V.h / 2 - i * 6]]); await touch('touchEnd', []); await W(500);
    const c1 = await ev(() => { const v = globalThis.__mistvaleView; return [v.project(0, 0, 0).x, v.project(0, 0, 0).y]; }); if (Math.abs(c1[0] - c0[0]) < 20 && Math.abs(c1[1] - c0[1]) < 10) find('world', '單指拖曳沒有平移畫面', { c0, c1 });
    const s0 = (await UI()).scale; await touch('touchStart', [[V.w / 2 - 40, V.h / 2], [V.w / 2 + 40, V.h / 2]]); for (let i = 1; i <= 8; i++) await touch('touchMove', [[V.w / 2 - 40 - i * 8, V.h / 2], [V.w / 2 + 40 + i * 8, V.h / 2]]); await touch('touchEnd', []); await W(500);
    const s1 = (await UI()).scale; if (!(s1 > s0 * 1.1)) find('world', '雙指張開沒有放大', { s0, s1 });
    const sel1 = await UI(); if (sel1.sel || sel1.modalOpen) find('world', '拖曳/捏合後誤觸選取或開視窗', sel1);
  } else {
    await page.mouse.move(V.w / 2, V.h / 2); await page.mouse.down(); for (let i = 1; i <= 8; i++) await page.mouse.move(V.w / 2 - i * 20, V.h / 2 - i * 8); await page.mouse.up(); await W(500);
    const c1 = await ev(() => { const v = globalThis.__mistvaleView; return [v.project(0, 0, 0).x, v.project(0, 0, 0).y]; }); if (Math.abs(c1[0] - c0[0]) < 20) find('world', '滑鼠拖曳沒有平移畫面', { c0, c1 });
    const sel1 = await UI(); if (sel1.sel || sel1.modalOpen) find('world', '拖曳後誤觸選取或開視窗', sel1);
    const s0 = (await UI()).scale; await page.mouse.move(V.w / 2, V.h / 2); await page.mouse.wheel(0, -400); await W(400); const s1 = (await UI()).scale; if (!(s1 > s0)) find('world', '滾輪沒有放大', { s0, s1 });
  }
  await ev(() => globalThis.__mistvaleView.focus('home')); await W(700);
  const rc3 = await rectsOf('forge'); if (rc3) { await tapAt(rc3.x, rc3.y); await W(400); const u = await UI(); if (!u.sel) find('world', '拖曳/縮放後再點建築沒有選取', { rc3, u }); }
  await shot('world-after-drag'); await reset();
  // 移動建築 → 取消(placement 鈕)
  step('world:placement-cancel'); await reset();
  await act(page, 'moveBuilding', 'forge'); await W(400); let u = await UI();
  if (!u.placement) find('world', '移動建築沒有出現放置提示', u); else {
    await shot('world-placement'); await scan('placement', { shotOnIssue: true });
    const r = await tap('[data-action=cancelMove]', { scope: '#placement' }); await W(400); const u2 = await UI();
    if (!r.ok) find('world', '放置提示「取消」鈕點不到', r.err); else if (u2.placement) find('world', '放置提示「取消」鈕按了沒反應(JS 沒有 cancelMove 處理)', u2);
    await page.keyboard.press('Escape'); await W(300);
  }
  await reset();
}

// ===== phase: long =====
async function pLong() {
  step('long:setup'); await reset();
  await ev(() => { const g = globalThis.__mistvaleGame; g.state.paused = false; g.state.speed = 1; });
  // 推進到夜晚
  step('long:advance-night');
  const adv = async (sec, dt = 0.25) => ev(([sec, dt]) => { const g = globalThis.__mistvaleGame; for (let t = 0; t < sec; t += dt) g.tick(dt); return { time: g.state.time, hunters: g.state.hunters.map(h => ({ hp: Math.round(h.hp), max: h.maxHp, task: h.task })).slice(0, 8), day: Math.floor(g.state.time / 240) + 1, gold: g.state.gold, enemies: (g.state.enemies || []).length }; }, [sec, dt]);
  const a1 = await adv(150); await W(500); await shot('long-night'); scans.push({ tag: 'long-after-150s', a1 });
  await scan('night-hud', { shotOnIssue: true });
  const ph = await ev(() => ({ day: document.querySelector('#day-num')?.textContent, phase: document.querySelector('#day-phase')?.textContent, fill: document.querySelector('#day-fill')?.style.width }));
  scans.push({ tag: 'daybar-night', ph });
  // 受傷/死亡
  step('long:hunter-hurt');
  await ev(() => { const g = globalThis.__mistvaleGame; const hs = g.state.hunters; hs[0].hp = Math.max(1, Math.round(hs[0].maxHp * .2)); if (hs[1]) hs[1].hp = 0; if (hs[2]) hs[2].satiety = 5; });
  await W(800); await openTab('hunters'); await W(500); await shot('long-hunters-hurt'); await scan('hunters-hurt', { shotOnIssue: true });
  for (const f of ['care', 'down']) { await tap(`[data-action=rosterMenu]`); await W(200); await ev(() => {}); await act(page, 'rosterFilter', f); await W(300); const cnt = await ev(() => document.querySelectorAll('#modal-content .hunter-card,#modal-content [data-action=hunter]').length); scans.push({ tag: 'roster-filter-' + f, cnt }); }
  await shot('long-roster-down');
  // 倒下獵人:定位 / 詳情
  const dl = await ev(() => { const h = globalThis.__mistvaleGame.state.hunters[1]; return h?.id; });
  if (dl) { await act(page, 'hunter', dl); await W(400); await shot('long-hunter-detail-down'); await scan('hunter-detail-down', { shotOnIssue: true }); }
  await reset();
  // 首領
  step('long:boss');
  await ev(() => { const g = globalThis.__mistvaleGame; for (const h of g.state.hunters) { h.hp = h.maxHp; h.satiety = 100; h.stamina = 100; h.mood = 100; } });
  await act(page, 'boss'); await W(500); await shot('long-boss-panel'); await scan('boss-panel', { shotOnIssue: true });
  let r = await tap('[data-action=startBoss]', { scope: '#modal' }); await W(600);
  if (!r.ok) scans.push({ tag: 'boss-start-nobtn', err: r.err });
  await adv(20); await W(400); await shot('long-boss-active');
  const bb = await ev(() => ({ bar: !document.querySelector('#boss-bar').classList.contains('hidden'), rect: document.querySelector('#boss-bar').getBoundingClientRect().toJSON(), badge: [document.querySelector('#hv-act-boss1')?.textContent, document.querySelector('#hv-act-boss2')?.textContent], boss: !!globalThis.__mistvaleGame.state.boss }));
  scans.push({ tag: 'boss-active', bb }); await scan('boss-active', { shotOnIssue: true });
  // 競技場/地下城/冷卻
  step('long:dungeon-arena');
  await act(page, 'dungeon'); await W(400);
  const ids = await ev(() => globalThis.__mistvaleGame.state.hunters.filter(h => h.hp > 0).slice(0, 3).map(h => h.id));
  for (const id of ids) await act(page, 'toggleDungeonHunter', id); await W(200);
  r = await tap('[data-action=startDungeon]', { scope: '#modal' }); await W(500); await shot('long-dungeon-run');
  await reset(); await adv(30); await W(500); await shot('long-dungeon-hud'); await scan('dungeon-hud', { shotOnIssue: true });
  const dg = await ev(() => ({ run: !!document.querySelector('#run-hud, .run-hud, [data-action=runRetreat]'), st: JSON.stringify(globalThis.__mistvaleGame.state.dungeon).slice(0, 200) }));
  scans.push({ tag: 'dungeon-run', dg });
  r = await tap('[data-action=runRetreat]'); await W(300);
  // 委託完成
  step('long:quest-complete');
  const qs = await ev(() => { const g = globalThis.__mistvaleGame; const list = g.questList(); return JSON.stringify(list).slice(0, 400); });
  scans.push({ tag: 'questlist-raw', qs });
  // 派遣
  step('long:dispatch');
  await act(page, 'dispatchHunters'); await W(500); await shot('long-dispatch'); await scan('dispatch', { shotOnIssue: true });
  r = await tap('[data-action=startDispatch]', { scope: '#modal' }); await W(500); await reset(); await adv(30); await W(300);
  await shot('long-after-dispatch'); await scan('after-dispatch', { shotOnIssue: true });
  // 再推進一整天
  step('long:advance-day'); const a2 = await adv(240); await W(500); await shot('long-day2'); scans.push({ tag: 'long-after-day', a: { time: a2.time, day: a2.day, gold: a2.gold } });
  const dead = a2.hunters.filter(h => h.hp <= 0).length; scans.push({ tag: 'dead', dead });
  await scan('day2-hud', { shotOnIssue: true });
  // 存檔 → 重新整理
  step('long:save-reload');
  const pre = await UI(); await act(page, 'hunters'); await W(300); // 開著面板時重新整理
  await ev(() => { globalThis.__mistvaleGame.state.paused = false; });
  await W(1200);
  const saved = await ev(() => { const raw = localStorage.getItem('mistvale-pixel-v2'); return raw ? { len: raw.length } : null; });
  scans.push({ tag: 'save-before-reload', saved });
  if (!saved) find('long', '遊玩一段時間後 localStorage 沒有存檔', '');
  await page.reload({ waitUntil: 'commit' }); await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 120000 }); await W(2500);
  await ev(() => { const mo = new MutationObserver(m => { for (const r of m) { globalThis.__toastSeen = (globalThis.__toastSeen || 0) + r.addedNodes.length; (globalThis.__toastLog ||= []).push(...[...r.addedNodes].map(n => (n.textContent || '').trim().slice(0, 80))); } }); mo.observe(document.querySelector('#toasts'), { childList: true }); });
  const post = await UI(); await shot('long-after-reload');
  scans.push({ tag: 'reload', pre: { gold: pre.gold, hunters: pre.hunters, time: pre.time }, post: { gold: post.gold, hunters: post.hunters, time: post.time, modal: post.modalType, open: post.modalOpen, tab: post.modalTab, inert: post.inert, title: post.title_screen, paused: post.paused, sel: post.sel, bodyCls: post.bodyCls } });
  if (post.title_screen) find('long', '重新整理後標題畫面又跑出來(同一工作階段)', '');
  if (post.inert.length && !post.modalOpen) find('long', '重新整理後有 HUD 元素殘留 inert', post.inert);
  if (post.hunters !== pre.hunters) find('long', '重新整理後獵人數不同', { pre: pre.hunters, post: post.hunters });
  if (post.modalOpen) await scan('post-reload-modal', { shotOnIssue: true });
  await scan('post-reload-hud', { shotOnIssue: true });
  // 離線戰報
  step('long:offline-report');
  await reset();
  await page.addInitScript(() => { try { if (sessionStorage.getItem('__ofl')) { sessionStorage.removeItem('__ofl'); const raw = JSON.parse(localStorage.getItem('mistvale-pixel-v2')); raw.savedAt = Date.now() - 3 * 3600 * 1000; raw.paused = false; localStorage.setItem('mistvale-pixel-v2', JSON.stringify(raw)); } } catch {} });
  await ev(() => sessionStorage.setItem('__ofl', '1'));
  await page.evaluate(() => { window.onbeforeunload = null; });
  await page.reload({ waitUntil: 'commit' }); await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 120000 });
  await W(3500); await ev(() => document.querySelector('#title-screen')?.remove()); await W(800);
  let ou = await UI(); await shot('long-offline');
  scans.push({ tag: 'offline', modal: ou.modalType, open: ou.modalOpen, title: ou.title });
  if (!ou.modalOpen) find('long', '離線 3 小時後回來沒有出現離線戰報', ou); else {
    await scan('offline-report', { shotOnIssue: true });
    const geo = await ev(() => { const m = document.querySelector('#modal').getBoundingClientRect(); const ok = document.querySelector('[data-action=offlineOk]'); const r = ok?.getBoundingClientRect(); return { m: [m.left, m.top, m.width, m.height].map(Math.round), ok: r ? [r.left, r.top, r.width, r.height].map(Math.round) : null, vh: innerHeight, vw: innerWidth }; });
    scans.push({ tag: 'offline-geo', geo });
    if (geo.ok && (geo.ok[1] + geo.ok[3] > geo.vh + 1)) find('long', '離線戰報「收下」鈕超出視窗底', geo);
    const rr = await tap('[data-action=offlineOk]'); await W(500); ou = await UI(); if (!rr.ok) find('long', '離線戰報「收下」點不到', rr.err); else if (ou.modalOpen) find('long', '離線戰報按收下沒有關閉', ou);
    await cleanCheck('離線戰報');
  }
}

// ===== phase: resize =====
async function pResize() {
  await reset(); await ev(() => { const g = globalThis.__mistvaleGame; g.state.paused = true; });
  const sizes = [[1440, 900], [390, 844], [844, 390], [1024, 768], [1440, 900]];
  for (const mode of ['hud', 'build', 'select', 'hunters']) {
    for (const [w, h] of sizes) {
      step(`resize:${mode}:${w}x${h}`);
      await page.setViewportSize({ width: w, height: h }); await W(700);
      if (mode === 'build') { await reset(); await act(page, 'build'); await W(400); } else if (mode === 'hunters') { await reset(); await act(page, 'hunters'); await W(400); } else if (mode === 'select') { await reset(); await ev(() => { globalThis.__mistvaleView.focus('home'); }); await W(500); await ev(() => globalThis.__mistvaleSelect('forge')); await W(400); } else { await reset(); await W(200); }
      const s = await scan(`resize-${mode}-${w}x${h}`, { shotOnIssue: false });
      const dims = await ev(() => ({ cv: [document.querySelector('#world').width, document.querySelector('#world').height, Math.round(document.querySelector('#world').getBoundingClientRect().width), Math.round(document.querySelector('#world').getBoundingClientRect().height)], doc: [document.documentElement.scrollWidth, document.documentElement.scrollHeight], modal: (() => { const m = document.querySelector('#modal'); const r = m.getBoundingClientRect(); return document.querySelector('#modal-backdrop').classList.contains('hidden') ? null : [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; })() }));
      if (dims.doc[0] > w + 1 || dims.doc[1] > h + 1) find('resize', `${mode} ${w}x${h}: 頁面出現捲動(${dims.doc})`, dims);
      if (dims.cv[2] !== w || dims.cv[3] !== h) find('resize', `${mode} ${w}x${h}: canvas 尺寸沒跟上 (${dims.cv})`, dims);
      if (dims.modal && (dims.modal[2] > w + 1 || dims.modal[3] > h + 1 || dims.modal[0] < -1 || dims.modal[1] < -1)) find('resize', `${mode} ${w}x${h}: 視窗超出螢幕`, dims);
      if (s.covered.length || s.off.length || s.overlap.length) await shot(`resize-${mode}-${w}x${h}`); else if (mode === 'hud' || mode === 'build') await shot(`resize-${mode}-${w}x${h}`);
    }
  }
  await page.setViewportSize({ width: V.w, height: V.h }); await reset();
}

// ===== phase: uiscale =====
async function pUiScale() {
  await reset();
  const opts = await ev(() => { document.querySelector('[data-action=settings]').click(); const o = [...document.querySelectorAll('#modal [data-action=setUiScale]')].map(e => e.dataset.id); document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click(); return o; });
  scans.push({ tag: 'uiscale-options', opts });
  for (const v of opts.length ? opts : ['auto']) {
    step('uiscale:' + v); await reset(); await act(page, 'setUiScale', v); await W(500); await reset(); await W(300);
    const sc = await ev(() => ({ root: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale') || document.documentElement.style.fontSize, fs: getComputedStyle(document.documentElement).fontSize, zoom: getComputedStyle(document.body).zoom }));
    const s = await scan('uiscale-hud-' + v); await shot('uiscale-' + String(v).replace('.', '_'));
    await act(page, 'build'); await W(400); const s2 = await scan('uiscale-build-' + v); if (s2.covered.length || s2.off.length) await shot('uiscale-build-' + String(v).replace('.', '_'));
    scans.push({ tag: 'uiscale-vals-' + v, sc });
    await reset();
  }
  await act(page, 'resetUiScale'); await reset();
}

// ===== phase: pilot =====
async function pPilot() {
  step('pilot:open'); await reset();
  await ev(() => { globalThis.__mistvaleGame.state.paused = false; });
  await act(page, 'settings'); await W(400);
  let r = await tap('[data-action=pilotLab]', { scope: '#modal' }); await W(400);
  if (!r.ok) { find('pilot', '設定裡「手動操控」鈕點不到', r.err); await reset(); return; }
  let u = await UI(); if (u.modalOpen) find('pilot', '按手動操控後設定視窗沒關', u);
  await shot('pilot-pick'); await scan('pilot-pick', { shotOnIssue: true });
  const cov = await ev(() => { const p = document.querySelector('#pilotlab'); if (!p) return null; const pr = p.getBoundingClientRect(); const tb = document.querySelector('#topbar').getBoundingClientRect(); return { pilot: [pr.left, pr.top, pr.right, pr.bottom].map(Math.round), top: [tb.left, tb.top, tb.right, tb.bottom].map(Math.round) }; });
  scans.push({ tag: 'pilot-geom', cov });
  if (cov && cov.pilot[1] < cov.top[3] && cov.pilot[0] < cov.top[2] && cov.pilot[2] > cov.top[0]) {
    const hit = await ev(() => ['#topbar .treasury', '#topbar [data-action=settings]', '#topbar [data-action=hunters]', '#topbar [data-action=worldmap]'].map(s => { const e = document.querySelector(s); if (!e) return [s, 'none']; const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return [s, (t === e || e.contains(t)) ? 'ok' : (t?.closest('#pilotlab') ? 'covered-by-pilotlab' : 'covered')]; }));
    scans.push({ tag: 'pilot-topbar-hit', hit });
    const bad = hit.filter(h => h[1] !== 'ok'); if (bad.length) find('pilot', '手動操控選角清單蓋住頂欄按鈕(' + bad.map(b => b[0].split(' ').pop()).join(',') + ')', hit);
  }
  r = await tap('[data-pilot=go]', { scope: '#pilotlab' }); await W(700); u = await UI();
  if (!r.ok) find('pilot', '手動操控選獵人點不到', r.err);
  await shot('pilot-active'); await scan('pilot-active', { shotOnIssue: true });
  const pu = await ev(() => ({ cls: document.body.className, joystick: !!document.querySelector('.pilot-stick,#pilot-stick,.pilot-hud'), hudVis: ['#topbar', '#bottom-bar', '.hv-actions', '#hv-left', '.view-tools'].map(s => { const e = document.querySelector(s); if (!e) return [s, null]; const cs = getComputedStyle(e); return [s, cs.display === 'none' || cs.visibility === 'hidden' ? 'hidden' : 'shown']; }) }));
  scans.push({ tag: 'pilot-state', pu });
  if (!/piloting/.test(pu.cls)) find('pilot', '選了獵人後 body 沒有 piloting', pu);
  // 在操控中按 Esc / 開面板 / 離開
  await page.keyboard.press('Escape'); await W(300);
  r = await tap('[data-pilot=stop]', { scope: '#pilotlab' }); await W(500); u = await UI();
  if (!r.ok) find('pilot', '手動操控「離開」點不到', r.err);
  const after = await ev(() => ({ cls: document.body.className, lab: !!document.querySelector('#pilotlab'), hud: document.querySelector('.pilot-hud,#pilot-hud') ? 'left-over' : 'gone', pilot: !!globalThis.__mistvaleGame.state.pilot }));
  scans.push({ tag: 'pilot-after', after });
  if (/piloting/.test(after.cls) || after.pilot) find('pilot', '離開手動操控後 piloting 狀態殘留', after);
  await cleanCheck('離開手動操控'); await reset();
}
// ===== phase: realtime =====
async function pRealtime() {
  step('realtime:speed3'); await reset();
  await ev(() => { const g = globalThis.__mistvaleGame; g.state.paused = false; g.state.speed = 3; });
  for (let i = 0; i < 5; i++) { await W(3000); }
  const st = await ev(() => { const g = globalThis.__mistvaleGame, s = g.state; return { time: s.time, statuses: Object.fromEntries(s.hunters.map(h => [h.id, h.status])), badge: document.querySelector('#hv-act-hunters')?.textContent, hp: s.hunters.map(h => Math.round(h.hp / h.maxHp * 100)) }; });
  scans.push({ tag: 'realtime-3x', st });
  const away = Object.values(st.statuses);
  scans.push({ tag: 'status-dist', dist: away.reduce((m, k) => (m[k] = (m[k] || 0) + 1, m), {}) });
  await shot('realtime-3x'); await scan('realtime-hud', { shotOnIssue: true });
  await ev(() => { globalThis.__mistvaleGame.state.speed = 1; });
  // 離線戰報版面(用遊戲自己的測試入口)
  step('realtime:offline-sample'); await reset();
  await ev(() => globalThis.__mistvaleShowOffline()); await W(600); let u = await UI();
  if (!u.modalOpen) find('realtime', '離線戰報測試入口沒開視窗', u); else {
    await shot('offline-sample'); await scan('offline-sample', { shotOnIssue: true });
    const geo = await ev(() => { const m = document.querySelector('#modal').getBoundingClientRect(); const ok = document.querySelector('[data-action=offlineOk]'); const r = ok?.getBoundingClientRect(); return { m: [m.left, m.top, m.right, m.bottom].map(Math.round), ok: r ? [r.left, r.top, r.right, r.bottom].map(Math.round) : null, vh: innerHeight, vw: innerWidth, bb: Math.round(document.querySelector('#bottom-bar').getBoundingClientRect().top) }; });
    scans.push({ tag: 'offline-sample-geo', geo });
    if (geo.ok && (geo.ok[3] > geo.vh || geo.ok[2] > geo.vw)) find('realtime', '離線戰報「收下」鈕超出視窗', geo);
    const rr = await tap('[data-action=offlineOk]'); await W(400); if (!rr.ok) find('realtime', '離線戰報「收下」點不到', rr.err); else if ((await UI()).modalOpen) find('realtime', '離線戰報按收下沒關', '');
  }
  await reset();
}
const map = { boot: pBoot, tabs: pTabs, close: pClose, hud: pHud, world: pWorld, long: pLong, resize: pResize, uiscale: pUiScale, pilot: pPilot, realtime: pRealtime };
if (!PH.includes('boot')) { await L.boot(page); await ev(() => { const mo = new MutationObserver(m => { for (const r of m) { globalThis.__toastSeen = (globalThis.__toastSeen || 0) + r.addedNodes.length; (globalThis.__toastLog ||= []).push(...[...r.addedNodes].map(n => (n.textContent || '').trim().slice(0, 80))); } }); mo.observe(document.querySelector('#toasts'), { childList: true }); }); await W(4000); await ev(() => document.querySelector('#title-screen')?.remove()); await reset(); }
for (const p of PH) { try { await map[p](); } catch (e) { find('harness', `phase ${p} 腳本中斷`, String(e.stack || e).slice(0, 400)); try { await shot('crash-' + p); await reset(); } catch {} } console.error(VN, 'phase done', p, 'findings', F.length, 'errs', errs.length); }
fs.writeFileSync(`${L.OUT}/${VN}.json`, JSON.stringify({ view: VN, errs, findings: F, scans }, null, 1));
console.log(JSON.stringify({ view: VN, errs: errs.length, findings: F.length }));
await b.close();
