// fix-d.mjs — FIX-D(2026-11-11 第二輪回歸稽核 G1–G6、G9):每一項都是「改回舊行為就會紅」
//   四種視窗:1440×900、1024×768、390×844(mobile+touch)、844×390(mobile+touch)
//   A. G1／G2 橫向(844×390)建築詳情 #inspector = 右側抽屜(寬 min(440px,52vw)、從頂到頁籤列):
//      可升級(高)與滿級(矮)兩種建築都量——X 中心 elementFromPoint 打到 X 且真的點會關抽屜(不會開設定);
//      抽屜與任何可見 HUD 元素交集 0;左半邊露出世界,點得到另一棟建築;可升級時「升級」鈕在抽屜內看得到、點得到。
//   B. G3／G4／G5 面板開著的 toast(Z2D 改版):A 抽屜開著時不再蓋標題列(R13:蓋住子頁籤與工具鈕),直向手機／桌機貼在抽屜上緣上方、橫向留在頁籤列上方;
//      量:22／34 字訊息完整(最多兩行)、不蓋標題列任何鈕、X 與標題列的鈕都點得到、pointer-events:none、同句合併 ×N、連續 3 則最多同時 2 則;C 視窗則在視窗上方遮罩區。
//   C. G6 手動操控清單 #pilotlab 開著時,縮放鈕與清單交集 0(隱藏或不重疊)。
//   D. G9 任務面板文字對比 ≥ 4.5:1(說明、「未解鎖」標籤、獎勵標題)。
//   用法:node tools/checks/fix-d.mjs(TARGET 空＝自己開臨時伺服器)
import * as L from './fix-a-lib.mjs';
import fs from 'node:fs';
const srv = await L.startServer(); const browser = await L.launch();
const fails = [], oks = []; const fix = m => fails.push(m), ok = m => oks.push(m);
const SHOTS = process.env.SHOTS_DIR || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const url = srv.url;
const MSG22 = '升級資源不足，請收購更多木材與鐵礦後再來升級'; // 22 字(稽核抓到的真實訊息長度:舊版手機被省略號截掉)
const MSG_LONG = '升級資源不足，請先收購更多木材與鐵礦，等資源夠了再回來升級這一棟建築'; // 34 字:手機兩行放得下

// ───────── 頁面內共用 ─────────
const PAGE = () => {
  const R = e => { if (!e) return null; const q = e.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height }; };
  const vis = e => { if (!e) return false; const q = e.getBoundingClientRect(); if (q.width < 1 || q.height < 1) return false; for (let p = e; p; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; } return true; };
  const inter = (a, b) => !!a && !!b && Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5;
  const hitsSelf = e => { const q = e.getBoundingClientRect(); const t = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return !!t && (t === e || e.contains(t)); };
  return { R, vis, inter, hitsSelf };
};
const P_inter = (a, b) => !!a && !!b && Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5;
const ev = (page, fn, arg) => page.evaluate(`(async()=>{const P=(${PAGE.toString()})();const f=${fn.toString()};return await f(P,${JSON.stringify(arg ?? null)});})()`);
const closeAll = async page => { await page.evaluate(() => { document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click(); document.querySelector('#inspector:not(.hidden) [data-action=closeInspector]')?.click(); }); await page.waitForTimeout(280); };
const fresh = async (page, url, { levels = true } = {}) => { await L.boot(page, url); await page.evaluate(lv => { for (const k of lv ? ['resources', 'buildings', 'levels', 'heal'] : ['resources', 'buildings', 'heal']) globalThis.__mistvaleGame.cheat(k); if (!lv) globalThis.__mistvaleGame.state.buildings.forge = 2; }, levels); };

// ═════ A. 橫向建築詳情(Z1 起是置中 C 視窗,取代舊的右側抽屜) ═════
//   2026-11-12 Z1:#inspector 與其他 C 視窗同一套外殼——55% 遮罩蓋住 HUD 與頁籤列、置中、高 ≤ 100% − 24、沒有 X、底部 升級＋關閉;
//   這裡只留 FIX-D 原本要證明的事:升級鈕在視窗內看得到點得到、關閉鈕(底部)點得到且真的關視窗(不會打開設定)、關掉後 HUD 回來。細節幾何見 z1-shell.mjs。
{
  const v = L.VIEWS.land; const ctx = await L.newCtx(browser, v); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await fresh(page, url, { levels: false });   // forge Lv.2(可升級=內容高)、hall 等其他已蓋的建築
  for (const [label, prep, id] of [['可升級(高)', () => { globalThis.__mistvaleGame.state.buildings.forge = 2; }, 'forge'], ['滿級(矮)', () => { globalThis.__mistvaleGame.state.buildings.forge = 5; }, 'forge']]) {
    await page.evaluate(prep); await page.evaluate(() => { globalThis.__mistvaleGame.state.paused = true; }); await L.act(page, 'selectBuilding', id); await page.waitForTimeout(600);
    const g = await ev(page, P => {
      const ins = document.querySelector('#inspector'), ir = P.R(ins), bar = P.R(document.querySelector('#bottom-bar'));
      const close = [...document.querySelectorAll('#inspect-foot button')].find(b => /關閉/.test(b.textContent)), cr = P.R(close);
      const act = ins.querySelector('[data-action=upgrade]'), ar = act && P.R(act);
      return { ir, bar, cr, closeHit: P.hitsSelf(close), mode: ins.dataset.mode, act: act ? { r: ar, hit: P.hitsSelf(act), inside: ar.t >= ir.t - 1 && ar.b <= ir.b + 1 && ar.l >= ir.l - 1 && ar.r <= ir.r + 1 } : null };
    });
    if (g.mode !== 'C' || g.ir.h > v.h - 24 + 1.5 || Math.abs((g.ir.l + g.ir.r) / 2 - v.w / 2) > 1.5) fix(`land/${label}: 橫向建築詳情要是置中 C 視窗(高 ≤ 100%−24)、實際 mode=${g.mode} ${Math.round(g.ir.l)}–${Math.round(g.ir.r)}×${Math.round(g.ir.t)}–${Math.round(g.ir.b)}`);
    if (!g.closeHit) fix(`land/${label}: 底部「關閉」鈕(${[g.cr.l, g.cr.t, g.cr.w, g.cr.h].map(Math.round)})中心 elementFromPoint 沒打到(被別的東西蓋住)`);
    if (label.startsWith('可升級')) {
      if (!g.act || !g.act.inside || !g.act.hit) fix(`land/${label}: 「升級」鈕要在視窗內、看得到、點得到(${JSON.stringify(g.act)})`);
    }
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/land-inspector-${label.startsWith('可') ? 'tall' : 'short'}.png` });
    const xc = [g.cr.l + g.cr.w / 2, g.cr.t + g.cr.h / 2];
    await page.mouse.click(xc[0], xc[1]); await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({ insHidden: document.querySelector('#inspector').classList.contains('hidden'), settings: !document.querySelector('#modal-backdrop').classList.contains('hidden') }));
    if (!after.insHidden || after.settings) fix(`land/${label}: 點底部關閉鈕 ${xc.map(Math.round)} 後視窗${after.insHidden ? '關了' : '沒關'}、設定${after.settings ? '被打開了' : '沒開'}`);
    else ok(`land/${label}: 視窗 ${Math.round(g.ir.l)}–${Math.round(g.ir.r)}×${Math.round(g.ir.t)}–${Math.round(g.ir.b)}、底部關閉點得到會關`);
    if (after.settings) await closeAll(page);
  }
  // 視窗關掉後 HUD 回來(右側圖示又看得到)
  const back = await ev(page, P => ['#pause', '.hv-actions button', '.view-tools button'].every(s => { const e = document.querySelector(s); return P.vis(e); }));
  if (!back) fix('land: 關掉建築詳情後右側 HUD(暫停鈕/行動徽章/縮放鈕)沒有恢復顯示');
  if (errs.length) fix(`land/A: 頁面錯誤 ${errs[0]}`);
  await ctx.close();
}

// ═════ B. 面板開著的 toast ═════
const PANELS = [['build'], ['hunters'], ['trade'], ['craft'], ['dungeon'], ['arena'], ['quests'], ['worldmap'], ['settings'], ['inspector'], ['hunterdetail']];
// Z1:C 置中視窗(委託、世界地圖、設定、建築詳情、獵人詳情)開著時 toast 出現在視窗上方的遮罩區(單行、最新一則),不蓋標題;A 抽屜(Z2D 起)出現在抽屜上方、不蓋標題列
const C_PANELS = new Set(['quests', 'worldmap', 'settings', 'inspector', 'hunterdetail']);
const openPanel = async (page, name) => {
  if (name === 'inspector') { await L.act(page, 'selectBuilding', 'forge'); }
  else if (name === 'hunterdetail') { const id = await page.evaluate(() => globalThis.__mistvaleGame.state.hunters[0].id); await L.act(page, 'hunter', id); }
  else await L.act(page, name);
  await page.waitForTimeout(520);
};
for (const view of ['desktop', 'tablet', 'phone', 'land']) {
  const v = L.VIEWS[view]; const ctx = await L.newCtx(browser, v); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await fresh(page, url);
  const rows = [];
  for (const [name] of PANELS) {
    await openPanel(page, name);
    const tag = `${view}/${name}`;
    if (C_PANELS.has(name)) {
      await page.evaluate(m => { document.querySelectorAll('#toasts .toast').forEach(e => e.remove()); globalThis.__toast(m, false); }, MSG22); await page.waitForTimeout(430); await page.evaluate(() => document.querySelectorAll('#toasts .toast:not(.out)').forEach(e => e.getAnimations().forEach(x => x.finish())));   // 2026-11-15: 機器忙時進場動畫晚開始,430ms 內還在淡入會被當成沒出現
      const r = await ev(page, P => {
        const host = document.querySelector('#modal-backdrop').classList.contains('hidden') ? document.querySelector('#inspector') : document.querySelector('#modal');
        const title = host.querySelector('#modal-title,#inspect-title'), ts = [...document.querySelectorAll('#toasts .toast')].filter(P.vis), t = ts[0], tx = t?.querySelector('.toast-tx');
        return { n: ts.length, tr: P.R(t), tt: P.R(title), wr: P.R(host), inBody: document.querySelector('#toasts').parentElement === document.body, pe: t ? getComputedStyle(t).pointerEvents : '', cut: tx ? tx.scrollWidth > tx.clientWidth + 1 : null };
      });
      const mt = `${view}/${name}/C/22字`;
      if (!r.n) fix(`${mt}: toast 沒有出現`);
      else {
        if (!r.inBody) fix(`${mt}: C 視窗開著 toast 不該住進視窗標題列`);
        if (r.cut) fix(`${mt}: 22 字訊息被截掉`);
        if (P_inter(r.tr, r.tt)) fix(`${mt}: toast 蓋住視窗標題`);
        if (r.tr.b > r.wr.t + 14) fix(`${mt}: toast 要在視窗上方遮罩區(toast 底 ${Math.round(r.tr.b)}、視窗頂 ${Math.round(r.wr.t)})`);
        if (r.pe !== 'none') fix(`${mt}: toast 沒有 pointer-events:none`);
        else rows.push(`${name}:${Math.round(r.tr.w)}px/上方遮罩`);
      }
      await closeAll(page); await page.evaluate(() => { document.querySelectorAll('#toasts .toast').forEach(e => e.remove()); }); await page.waitForTimeout(100);
      continue;
    }
    // B1 一則 22 字訊息(手機另測 34 字兩行)——Z2D:A 抽屜開著時 toast 不再蓋標題列(R13:會蓋住子頁籤與工具鈕),
    //    直向手機／桌機貼在抽屜上緣上方,橫向(抽屜滿版)留在頁籤列上方並閃避按鈕。量:不在標題列裡、不蓋標題列任何鈕、X 與標題列的鈕都點得到、訊息完整、最多兩行
    for (const msg of view === 'phone' || view === 'land' ? [MSG22, MSG_LONG] : [MSG22]) {
      await page.evaluate(m => { document.querySelectorAll('#toasts .toast').forEach(e => e.remove()); globalThis.__toast(m, false); }, msg); await page.waitForTimeout(430); await page.evaluate(() => document.querySelectorAll('#toasts .toast:not(.out)').forEach(e => e.getAnimations().forEach(x => x.finish())));   // 2026-11-15: 機器忙時進場動畫晚開始,430ms 內還在淡入會被當成沒出現
      const r = await ev(page, (P, m) => {
        const modalOpen = !document.querySelector('#modal-backdrop').classList.contains('hidden');
        const host = modalOpen ? document.querySelector('#modal') : document.querySelector('#inspector');
        const title = host.querySelector('.modal-title,.panel-title'), x = title.querySelector('[data-action=close],[data-action=closeInspector]');
        const ts = [...document.querySelectorAll('#toasts .toast')].filter(P.vis), t = ts[0], tx = t?.querySelector('.toast-tx');
        const tr = P.R(t), tt = P.R(title), xr = P.R(x), hr = P.R(host);
        const lh = tx ? parseFloat(getComputedStyle(tx).lineHeight) || 15.6 : 15.6;
        const tools = [...title.querySelectorAll('button,.z1-subtab,.hv-tool')].filter(b => P.vis(b) && !b.closest('#toasts')).map(b => ({ r: P.R(b), hit: (() => { const q = P.R(b); const e = document.elementFromPoint(q.l + q.w / 2, q.t + q.h / 2); return !!e && (e === b || b.contains(e)); })() }));
        return { host: host.id, inDom: !!t && title.contains(t), n: ts.length, tr, tt, xr, hr, xHit: P.hitsSelf(x), pe: t ? getComputedStyle(t).pointerEvents : '', pePar: getComputedStyle(document.querySelector('#toasts')).pointerEvents, text: tx?.textContent || '', full: tx ? tx.textContent === m : false, clamp: tx ? tx.scrollHeight > tx.clientHeight + 1 : null, lines: tx ? Math.round(tx.getBoundingClientRect().height / lh) : 0, fs: tx ? parseFloat(getComputedStyle(tx).fontSize) : 0, tools, covered: tools.filter(q => P.inter(q.r, tr)).length };
      }, msg);
      const mt = `${tag}/${msg.length}字`;
      if (!r.n) { fix(`${mt}: toast 沒有出現`); continue; }
      if (r.inDom) fix(`${mt}: toast 還住在面板標題列裡(Z2D 起 A 抽屜的 toast 不蓋標題列)`);
      if (!r.full || r.clamp) fix(`${mt}: 訊息沒有完整顯示(文字「${r.text}」,被截掉=${r.clamp})`);
      if (r.lines > 2) fix(`${mt}: 文字 ${r.lines} 行(最多兩行)`);
      if (r.fs < 12) fix(`${mt}: toast 字級 ${r.fs}px < 12`);
      if (r.covered) fix(`${mt}: toast 蓋住標題列的 ${r.covered} 顆鈕/子頁籤(R13)`);
      if (view !== 'land' && r.tr.b > r.hr.t + 1.5) fix(`${mt}: toast 底 ${Math.round(r.tr.b)} 要在抽屜上緣(${Math.round(r.hr.t)})以上`);
      if (!r.xHit) fix(`${mt}: 關閉鈕 X 被蓋住(中心點打不到 X)`);
      if (r.pe !== 'none' || r.pePar !== 'none') fix(`${mt}: toast 沒有 pointer-events:none(${r.pe}/${r.pePar})`);
      if (r.tools.some(q => !q.hit)) fix(`${mt}: 標題列的鈕被 toast 擋住點不到`);
      if (SHOTS && msg === MSG_LONG && ((view === 'phone' && name === 'hunters') || (view === 'land' && name === 'build') || (view === 'desktop' && name === 'trade'))) await page.screenshot({ path: `${SHOTS}/toast-${view}-${name}.png` });
      if (msg === MSG22) rows.push(`${name}:${Math.round(r.tr.w)}px/${r.lines}行`);
    }
    // B2 同句合併 ×N(Z2D:A 抽屜的 toast 不再排隊成一次一則,改成最多同時顯示 2 則;「連續 3 則都看得到」的排隊量測已移除)
    if (['hunters', 'build'].includes(name)) {
      await page.evaluate(() => { document.querySelectorAll('#toasts .toast').forEach(e => e.remove()); globalThis.__toast('甲乙丙', true); globalThis.__toast('甲乙丙', true); globalThis.__toast('甲乙丙', true); }); await page.waitForTimeout(450);
      const mg = await page.evaluate(() => ({ n: document.querySelectorAll('#toasts .toast').length, badge: document.querySelector('#toasts .toast .toast-n')?.textContent || '' }));
      if (mg.n !== 1 || mg.badge !== '×3') fix(`${tag}: 同句 3 次要合併成 1 條 ×3(DOM ${mg.n} 條、徽章「${mg.badge}」)`);
      const vis3 = await page.evaluate(async () => { document.querySelectorAll('#toasts .toast').forEach(e => e.remove()); for (const m of ['第一則：金幣不足', '第二則：木材不足', '第三則：鐵礦不足']) globalThis.__toast(m, true); await new Promise(r => setTimeout(r, 450)); return [...document.querySelectorAll('#toasts .toast')].filter(e => { const q = e.getBoundingClientRect(); return q.width > 0 && q.height > 0 && getComputedStyle(e).display !== 'none'; }).length; });
      if (vis3 > 2) fix(`${tag}: 連續 3 則同時顯示 ${vis3} 則(A 抽屜最多 2 則)`); else ok(`${tag}: 連續 3 則最多同時 ${vis3} 則、同句合併 ×3`);
      await page.evaluate(() => { document.querySelectorAll('#toasts .toast').forEach(e => e.remove()); globalThis.__toast('甲', true); globalThis.__toast('乙', true); });
    }
    await closeAll(page);
    const back = await page.evaluate(() => ({ inBody: document.querySelector('#toasts')?.parentElement === document.body, wait: document.querySelectorAll('#toasts .toast.tq-wait').length }));
    if (!back.inBody) fix(`${tag}: 關掉面板後 toast 容器沒回到 body`);
    if (back.wait) fix(`${tag}: 關掉面板後還有 ${back.wait} 則停在排隊狀態(藏起來)`);
    await page.evaluate(() => { document.querySelectorAll('#toasts .toast').forEach(e => e.remove()); }); await page.waitForTimeout(100);
  }
  console.log(view, rows.join(' '));
  if (errs.length) fix(`${view}/B: 頁面錯誤 ${errs[0]}`);
  await ctx.close();
}

// ═════ C. 手動操控清單 vs 縮放鈕 ═════
for (const view of ['desktop', 'tablet', 'phone', 'land']) {
  const v = L.VIEWS[view]; const ctx = await L.newCtx(browser, v); const page = await ctx.newPage(); await L.boot(page, url);
  await L.act(page, 'settings'); await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('#modal [data-action=pilotLab]')?.click()); await page.waitForTimeout(600);
  const r = await ev(page, P => { const p = document.querySelector('#pilotlab'); if (!p) return null; const pr = P.R(p); const vt = [...document.querySelectorAll('.view-tools button')].filter(P.vis); return { pr, overlap: vt.filter(b => P.inter(P.R(b), pr)).map(b => b.dataset.action || b.id), shown: vt.length, tools: P.R(document.querySelector('.view-tools')) }; });
  if (!r) fix(`${view}/G6: 手動操控清單沒有出現`);
  else if (r.overlap.length) fix(`${view}/G6: 手動操控清單 ${[r.pr.l, r.pr.t, r.pr.r, r.pr.b].map(Math.round)} 蓋住縮放鈕 ${r.overlap.join('、')}`);
  else ok(`${view}/G6: 清單開著時縮放鈕${r.shown ? '不重疊' : '隱藏'}`);
  if (SHOTS && view === 'land') await page.screenshot({ path: `${SHOTS}/land-pilotlab.png` });
  await ctx.close();
}

// ═════ D. 任務面板對比 ═════
const CONTRAST = () => {
  const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lin = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
  const lum = c => .2126 * lin(c.r) + .7152 * lin(c.g) + .0722 * lin(c.b);
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const bgOf = e => { const st = []; for (let p = e; p; p = p.parentElement) { const c = parse(getComputedStyle(p).backgroundColor); if (c && c.a > 0) st.push(c); if (c && c.a >= 1) break; } let base = { r: 20, g: 17, b: 15, a: 1 }; for (const c of st.reverse()) base = over(c, base); return base; };
  const opOf = e => { let o = 1; for (let p = e; p; p = p.parentElement) o *= +getComputedStyle(p).opacity; return o; };
  const out = [];
  for (const e of document.querySelectorAll('#modal-content *')) {
    if (![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue; const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || e.closest('button:disabled,[disabled]')) continue;
    const bg = bgOf(e); let fg = parse(cs.color); if (!fg) continue; fg = { ...fg, a: fg.a * opOf(e) }; const f = over(fg, bg);
    const l1 = lum(f), l2 = lum(bg); out.push({ cls: e.tagName.toLowerCase() + '.' + String(e.className || '').split(' ')[0], inLocked: !!e.closest('.zq-row.locked'), t: e.textContent.trim().slice(0, 12), ratio: (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05) });
  }
  return out;
};
for (const view of ['desktop', 'phone']) {
  const ctx = await L.newCtx(browser, L.VIEWS[view]); const page = await ctx.newPage(); await L.boot(page, url);
  await L.act(page, 'quests'); await page.waitForTimeout(600);
  const r = await page.evaluate(`(${CONTRAST.toString()})()`);
  const locked = r.filter(x => x.inLocked), tags = locked.filter(x => /zq-tag/.test(x.cls)), desc = locked.filter(x => /^p\./.test(x.cls));
  if (!tags.length || !desc.length) fix(`${view}/G9: 找不到鎖住章節的標籤/說明文字(tags ${tags.length}、desc ${desc.length})`);
  const low = r.filter(x => x.ratio < 4.5);
  if (low.length) fix(`${view}/G9: 任務面板有 ${low.length} 處文字對比 < 4.5:1,例如「${low[0].t}」(${low[0].cls})${low[0].ratio.toFixed(2)}:1`);
  else ok(`${view}/G9: 任務面板 ${r.length} 處文字最低對比 ${Math.min(...r.map(x => x.ratio)).toFixed(2)}:1(「未解鎖」${Math.min(...tags.map(x => x.ratio)).toFixed(2)}、說明 ${Math.min(...desc.map(x => x.ratio)).toFixed(2)})`);
  await ctx.close();
}

await browser.close(); srv.stop();
if (fails.length) { console.log('FAIL fix-d\n - ' + fails.slice(0, 40).join('\n - ') + (fails.length > 40 ? `\n ...另 ${fails.length - 40} 項` : '')); process.exit(1); }
for (const o of oks) console.log('ok  ' + o);
console.log('PASS fix-d: 橫向建築詳情右側抽屜(X 點得到、HUD 交集 0)、面板 toast 蓋整個標題列(22 字完整、X 不蓋、多則排隊不漏)、手動操控不蓋縮放鈕、任務文字對比 ≥ 4.5');
