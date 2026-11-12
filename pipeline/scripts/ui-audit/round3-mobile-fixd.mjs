// round3-mobile-fixd.mjs — fix-d.mjs 的多尺寸版(唯讀):用 VIEWSEL=m360x640,l844x390,... 指定視窗
import * as F from '../../../tools/checks/fix-a-lib.mjs';
import fs from 'node:fs';
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const M = (w, h, d) => ({ w, h, mobile: true, dsf: d });
const VIEWS = { 'm360x640': M(360, 640, 3), 'm375x667': M(375, 667, 2), 'm360x780': M(360, 780, 3), 'm390x844': M(390, 844, 3), 'm412x915': M(412, 915, 2.6), 'm430x932': M(430, 932, 3),
  'l667x375': M(667, 375, 2), 'l740x360': M(740, 360, 3), 'l844x390': M(844, 390, 3), 'l932x430': M(932, 430, 3), 'p768x1024': M(768, 1024, 2), 't1024x768': M(1024, 768, 2) };
const L = { ...F, VIEWS, newCtx: (b, v) => b.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: v.dsf || 2, isMobile: true, hasTouch: true, userAgent: UA }) };
const SEL = (process.env.VIEWSEL || Object.keys(VIEWS).join(',')).split(',');
const isLand = n => n.startsWith('l');
const isPhone = n => n[0] !== 'p' && n[0] !== 't';
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
const ev = (page, fn, arg) => page.evaluate(`(async()=>{const P=(${PAGE.toString()})();const f=${fn.toString()};return await f(P,${JSON.stringify(arg ?? null)});})()`);
const closeAll = async page => { await page.evaluate(() => { document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click(); document.querySelector('#inspector:not(.hidden) [data-action=closeInspector]')?.click(); }); await page.waitForTimeout(280); };
const fresh = async (page, url, { levels = true } = {}) => { await L.boot(page, url); await page.evaluate(lv => { for (const k of lv ? ['resources', 'buildings', 'levels', 'heal'] : ['resources', 'buildings', 'heal']) globalThis.__mistvaleGame.cheat(k); if (!lv) globalThis.__mistvaleGame.state.buildings.forge = 2; }, levels); };

// ═════ A. 橫向建築詳情右側抽屜 ═════
for (const lvName of SEL.filter(isLand)) {
  const v = L.VIEWS[lvName]; const ctx = await L.newCtx(browser, v); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await fresh(page, url, { levels: false });   // forge Lv.2(可升級=內容高)、hall 等其他已蓋的建築
  for (const [label, prep, id] of [['可升級(高)', () => { globalThis.__mistvaleGame.state.buildings.forge = 2; }, 'forge'], ['滿級(矮)', () => { globalThis.__mistvaleGame.state.buildings.forge = 5; }, 'forge']]) {
    await page.evaluate(prep); await page.evaluate(() => { globalThis.__mistvaleGame.state.paused = true; }); await L.act(page, 'selectBuilding', id); await page.waitForTimeout(600);
    const g = await ev(page, P => {
      const ins = document.querySelector('#inspector'), ir = P.R(ins), vw = innerWidth, vh = innerHeight;
      const bar = P.R(document.querySelector('#bottom-bar')), x = ins.querySelector('[data-action=closeInspector]'), xr = P.R(x);
      const hudSel = ['#topbar button', '#topbar .res-row', '#topbar #day-clock', '#topbar .population', '#topbar .hv-crest', '#hv-left > *', '#hv-left button', '.hv-actions button', '.view-tools button', '#pause-label', '#placement', '#run-hud', '#unit-card', '#next-step', '#hv-sel button', '#notice-feed', '#boss-bar', '#region-badge', '#pilotlab', '#left-panel'];
      const hud = []; for (const s of hudSel) for (const e of document.querySelectorAll(s)) { if (ins.contains(e) || !P.vis(e)) continue; const r = P.R(e); if (P.inter(r, ir)) hud.push(s + ':' + (e.textContent || '').trim().slice(0, 6) + '@' + [r.l, r.t, r.r, r.b].map(Math.round)); }
      const strays = [...document.querySelectorAll('button,[data-action],[role=button]')].filter(e => !ins.contains(e) && !e.closest('#bottom-bar,#modal,#cmdk,#toasts') && P.vis(e) && P.inter(P.R(e), ir)).map(e => (e.id ? '#' + e.id : e.dataset.action || e.className || e.tagName) + '@' + [P.R(e).l, P.R(e).t].map(Math.round));
      const act = ins.querySelector('[data-action=upgrade]'), ar = P.R(act);
      return { ir, vw, vh, bar, xr, xHit: P.hitsSelf(x), z: +getComputedStyle(ins).zIndex || 0, hud, strays, act: act ? { r: ar, hit: P.hitsSelf(act), inside: ar.t >= ir.t - 1 && ar.b <= ir.b + 1 && ar.l >= ir.l - 1 && ar.r <= ir.r + 1 } : null, title: P.R(ins.querySelector('.panel-title')), scroll: P.R(ins.querySelector('#inspect-content')) };
    });
    const want = Math.min(440, v.w * 0.52);
    if (Math.abs(g.ir.w - want) > 3 || g.ir.r < v.w - 1) fix(`${lvName}/${label}: 抽屜應貼右邊、寬 min(440px,52vw)=${Math.round(want)},實際 ${Math.round(g.ir.l)}–${Math.round(g.ir.r)}(寬 ${Math.round(g.ir.w)})`);
    if (g.ir.t > 1 || Math.abs(g.ir.b - g.bar.t) > 1.5) fix(`${lvName}/${label}: 抽屜要從頂到頁籤列(頂 ${Math.round(g.ir.t)}、底 ${Math.round(g.ir.b)},頁籤列頂 ${Math.round(g.bar.t)})`);
    if (!g.xHit) fix(`${lvName}/${label}: 關閉鈕 X(${[g.xr.l, g.xr.t, g.xr.w, g.xr.h].map(Math.round)})中心 elementFromPoint 沒打到 X(被別的東西蓋住)`);
    if (g.hud.length) fix(`${lvName}/${label}: 抽屜與可見 HUD 元素交集 ${g.hud.length} 個:${g.hud.slice(0, 4).join('、')}`);
    if (g.strays.length) fix(`${lvName}/${label}: 抽屜下面還壓著可見按鈕 ${g.strays.slice(0, 4).join('、')}`);
    if (label.startsWith('可升級')) {
      if (!g.act || !g.act.inside || !g.act.hit) fix(`${lvName}/${label}: 「升級」鈕要在抽屜內、看得到、點得到(${JSON.stringify(g.act)})`);
    }
    // 左半邊露出世界:至少一棟建築名牌中心露在抽屜外、元素是世界畫布
    const exposed = await page.evaluate(() => { const vw = globalThis.__mistvaleView, cv = document.querySelector('#world'), rect = cv.getBoundingClientRect(), bot = vw.unproject(rect.right, rect.bottom); return vw.hitRects().map(u => ({ id: u.id, x: rect.left + ((u.x + u.w / 2) / bot.sx) * rect.width, y: rect.top + ((u.y + u.h / 2) / bot.sy) * rect.height })).filter(p => p.x > 4 && p.y > 4 && p.x < innerWidth - 4 && p.y < innerHeight - 4 && document.elementFromPoint(p.x, p.y)?.id === 'world').length; });
    if (!exposed) fix(`${lvName}/${label}: 抽屜開著時世界上沒有露出可點的建築(世界被蓋住,不能切換建築)`);
    // 真的點 X:抽屜關起來、設定面板沒開
    const xc = [g.xr.l + g.xr.w / 2, g.xr.t + g.xr.h / 2];
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${lvName}-inspector-${label.startsWith('可') ? 'tall' : 'short'}.png` });
    await page.mouse.click(xc[0], xc[1]); await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({ insHidden: document.querySelector('#inspector').classList.contains('hidden'), settings: !document.querySelector('#modal-backdrop').classList.contains('hidden') }));
    if (!after.insHidden || after.settings) fix(`${lvName}/${label}: 點 X 中心 ${xc.map(Math.round)} 後抽屜${after.insHidden ? '關了' : '沒關'}、設定${after.settings ? '被打開了' : '沒開'}`);
    else ok(`${lvName}/${label}: 抽屜 ${Math.round(g.ir.l)}–${Math.round(g.ir.r)}×${Math.round(g.ir.t)}–${Math.round(g.ir.b)}、X 點得到會關、HUD 交集 0、露出 ${exposed} 棟建築`);
    if (after.settings) await closeAll(page);
  }
  // 抽屜關掉後 HUD 回來(右側圖示又看得到)
  const back = await ev(page, P => ['#pause', '.hv-actions button', '.view-tools button'].every(s => { const e = document.querySelector(s); return P.vis(e); }));
  if (!back) fix(lvName+': 關掉抽屜後右側 HUD(暫停鈕/行動徽章/縮放鈕)沒有恢復顯示');
  if (errs.length) fix(`${lvName}/A: 頁面錯誤 ${errs[0]}`);
  await ctx.close();
}

// ═════ B. 面板開著的 toast ═════
const PANELS = [['build'], ['hunters'], ['trade'], ['craft'], ['dungeon'], ['arena'], ['quests'], ['worldmap'], ['settings'], ['inspector'], ['hunterdetail']];
const openPanel = async (page, name) => {
  if (name === 'inspector') { await L.act(page, 'selectBuilding', 'forge'); }
  else if (name === 'hunterdetail') { const id = await page.evaluate(() => globalThis.__mistvaleGame.state.hunters[0].id); await L.act(page, 'hunter', id); }
  else await L.act(page, name);
  await page.waitForTimeout(520);
};
for (const view of SEL) {
  const v = L.VIEWS[view]; const ctx = await L.newCtx(browser, v); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await fresh(page, url);
  const rows = [];
  for (const [name] of PANELS) {
    await openPanel(page, name);
    const tag = `${view}/${name}`;
    // B1 一則 22 字訊息(手機另測 24 字兩行)
    for (const msg of isPhone(view) ? [MSG22, MSG_LONG] : [MSG22]) {
      await page.evaluate(m => { document.querySelectorAll('#toasts .toast').forEach(e => e.remove()); globalThis.__toast(m, false); }, msg); await page.waitForTimeout(430);
      const r = await ev(page, (P, m) => {
        const modalOpen = !document.querySelector('#modal-backdrop').classList.contains('hidden');
        const host = modalOpen ? document.querySelector('#modal') : document.querySelector('#inspector');
        const title = host.querySelector('.modal-title,.panel-title'), x = title.querySelector('[data-action=close],[data-action=closeInspector]');
        const ts = [...document.querySelectorAll('#toasts .toast')].filter(P.vis), t = ts[0], tx = t?.querySelector('.toast-tx');
        const tr = P.R(t), tt = P.R(title), xr = P.R(x);
        const lh = tx ? parseFloat(getComputedStyle(tx).lineHeight) || 15.6 : 15.6;
        // 底下的標題列按鈕(不含 X)仍點得到:toast pointer-events:none → elementFromPoint 穿過去
        const under = [...title.querySelectorAll('button')].filter(b => b !== x && P.vis(b) && !b.closest('#toasts')).map(b => { const q = P.R(b); const e = document.elementFromPoint(q.l + q.w / 2, q.t + q.h / 2); return !!e && (e === b || b.contains(e)); });
        return { host: host.id, inDom: !!t && title.contains(t), n: ts.length, tr, tt, xr, xHit: P.hitsSelf(x), pe: t ? getComputedStyle(t).pointerEvents : '', pePar: getComputedStyle(document.querySelector('#toasts')).pointerEvents, text: tx?.textContent || '', full: tx ? tx.textContent === m : false, clamp: tx ? tx.scrollHeight > tx.clientHeight + 1 : null, lines: tx ? Math.round(tx.getBoundingClientRect().height / lh) : 0, fs: tx ? parseFloat(getComputedStyle(tx).fontSize) : 0, under, ellipsis: tx ? getComputedStyle(tx).textOverflow : '', content: P.R(host.querySelector('#modal-content,#inspect-content')) };
      }, msg);
      const mt = `${tag}/${msg.length}字`;
      if (!r.n) { fix(`${mt}: toast 沒有出現`); continue; }
      if (!r.inDom) fix(`${mt}: toast 不在面板標題列裡`);
      if (!r.full || r.clamp) fix(`${mt}: 訊息沒有完整顯示(文字「${r.text}」,被截掉=${r.clamp})`);
      if (r.lines > 2 || !isPhone(view) && r.lines > 1) fix(`${mt}: 文字 ${r.lines} 行(桌機一行、手機最多兩行)`);
      if (r.fs < 12) fix(`${mt}: toast 字級 ${r.fs}px < 12`);
      if (r.tr.l > r.tt.l + 2) fix(`${mt}: toast 左緣 ${Math.round(r.tr.l)} 沒蓋到標題列左緣 ${Math.round(r.tt.l)}`);
      if (r.tr.r > r.xr.l + 0.5 || r.tr.r < r.xr.l - 16) fix(`${mt}: toast 右緣 ${Math.round(r.tr.r)} 應停在 X 左邊(X 左緣 ${Math.round(r.xr.l)},寬度＝標題列寬減 X)`);
      if (Math.abs(r.tr.h - r.tt.h) > 3 || Math.abs(r.tr.t - r.tt.t) > 3) fix(`${mt}: toast 高 ${Math.round(r.tr.h)}/頂 ${Math.round(r.tr.t)} 要蓋滿標題列高 ${Math.round(r.tt.h)}/頂 ${Math.round(r.tt.t)}`);
      if (r.tr.w < 280 && !isLand(view)) fix(`${mt}: toast 只有 ${Math.round(r.tr.w)}px 寬(縮成圖示)`);
      if (!r.xHit) fix(`${mt}: 關閉鈕 X 被蓋住(中心點打不到 X)`);
      if (r.pe !== 'none' || r.pePar !== 'none') fix(`${mt}: toast 沒有 pointer-events:none(${r.pe}/${r.pePar})`);
      if (r.under.some(h => !h)) fix(`${mt}: 標題列底下的按鈕被 toast 擋住點不到`);
      if (r.tr.b > r.content.t + 0.5 && r.host !== 'inspector') fix(`${mt}: toast 疊到內容區(底 ${Math.round(r.tr.b)} > 內容頂 ${Math.round(r.content.t)})`);
      if (SHOTS && msg === MSG_LONG && ['hunters','build'].includes(name)) await page.screenshot({ path: `${SHOTS}/toast-${view}-${name}.png` });
      if (msg === MSG22) rows.push(`${name}:${Math.round(r.tr.w)}px/${r.lines}行`);
    }
    // B2 連續 3 則不同訊息 + 同句合併(挑代表面板,桌機/手機各一個標題列最擠的)
    if (['hunters', 'inspector', 'build'].includes(name)) {
      const log = await page.evaluate(async ms => {
        document.querySelectorAll('#toasts .toast').forEach(e => e.remove());
        const t0 = performance.now(), seen = [];
        const id = setInterval(() => { const vis = [...document.querySelectorAll('#toasts .toast')].filter(e => { const q = e.getBoundingClientRect(); return q.width > 0 && q.height > 0 && getComputedStyle(e).display !== 'none'; }).map(e => e.dataset.msg); seen.push([performance.now() - t0, vis]); }, 40);
        for (const m of ms) globalThis.__toast(m, true);
        globalThis.__toast(ms[0], true); globalThis.__toast(ms[0], true);   // 第一句再來兩次 → 合併成 ×3
        await new Promise(r => setTimeout(r, 6200)); clearInterval(id);
        return { seen, dom: document.querySelectorAll('#toasts .toast').length };
      }, ['第一則：金幣不足', '第二則：木材不足', '第三則：鐵礦不足']);
      const per = {}; let prev = 0, maxConc = 0, lastT = 0;
      for (const [t, vis] of log.seen) { const dt = t - prev; prev = t; maxConc = Math.max(maxConc, vis.length); for (const m of vis) per[m] = (per[m] || 0) + dt; lastT = t; }
      const names = ['第一則：金幣不足', '第二則：木材不足', '第三則：鐵礦不足'];
      const miss = names.filter(n => !per[n]);
      if (miss.length) fix(`${tag}/連續 3 則: 漏看 ${miss.join('、')}(各則顯示毫秒 ${JSON.stringify(per)})`);
      const short = names.filter(n => per[n] && per[n] < 1100);
      if (short.length) fix(`${tag}/連續 3 則: ${short.join('、')} 顯示不到 1.1 秒(${JSON.stringify(per)})`);
      if (maxConc > 1) fix(`${tag}/連續 3 則: 標題列同時顯示 ${maxConc} 則(應一次一則、排隊)`);
      else if (!miss.length && !short.length) ok(`${tag}: 3 則排隊都看得到(${names.map(n => Math.round(per[n])).join('/')}ms)、同時最多 ${maxConc} 則`);
      // 同句合併 ×N:第一則被合併過(×3)
      await page.evaluate(() => { document.querySelectorAll('#toasts .toast').forEach(e => e.remove()); globalThis.__toast('甲乙丙', true); globalThis.__toast('甲乙丙', true); globalThis.__toast('甲乙丙', true); }); await page.waitForTimeout(450);
      const mg = await page.evaluate(() => ({ n: document.querySelectorAll('#toasts .toast').length, badge: document.querySelector('#toasts .toast .toast-n')?.textContent || '' }));
      if (mg.n !== 1 || mg.badge !== '×3') fix(`${tag}: 同句 3 次要合併成 1 條 ×3(DOM ${mg.n} 條、徽章「${mg.badge}」)`);
      // 關面板:toast 容器回到 body、沒有殘留的排隊狀態
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
for (const view of SEL) {
  const v = L.VIEWS[view]; const ctx = await L.newCtx(browser, v); const page = await ctx.newPage(); await L.boot(page, url);
  await L.act(page, 'settings'); await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('#modal [data-action=pilotLab]')?.click()); await page.waitForTimeout(600);
  const r = await ev(page, P => { const p = document.querySelector('#pilotlab'); if (!p) return null; const pr = P.R(p); const vt = [...document.querySelectorAll('.view-tools button')].filter(P.vis); return { pr, overlap: vt.filter(b => P.inter(P.R(b), pr)).map(b => b.dataset.action || b.id), shown: vt.length, tools: P.R(document.querySelector('.view-tools')) }; });
  if (!r) fix(`${view}/G6: 手動操控清單沒有出現`);
  else if (r.overlap.length) fix(`${view}/G6: 手動操控清單 ${[r.pr.l, r.pr.t, r.pr.r, r.pr.b].map(Math.round)} 蓋住縮放鈕 ${r.overlap.join('、')}`);
  else ok(`${view}/G6: 清單開著時縮放鈕${r.shown ? '不重疊' : '隱藏'}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${view}-pilotlab.png` });
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
    const l1 = lum(f), l2 = lum(bg); out.push({ cls: e.tagName.toLowerCase() + '.' + String(e.className || '').split(' ')[0], inLocked: !!e.closest('.quest-step.locked'), t: e.textContent.trim().slice(0, 12), ratio: (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05) });
  }
  return out;
};
for (const view of SEL.filter(isPhone)) {
  const ctx = await L.newCtx(browser, L.VIEWS[view]); const page = await ctx.newPage(); await L.boot(page, url);
  await L.act(page, 'quests'); await page.waitForTimeout(600);
  const r = await page.evaluate(`(${CONTRAST.toString()})()`);
  const locked = r.filter(x => x.inLocked), tags = locked.filter(x => /qs-tag/.test(x.cls)), desc = locked.filter(x => /^p\./.test(x.cls));
  if (!tags.length || !desc.length) fix(`${view}/G9: 找不到鎖住章節的標籤/說明文字(tags ${tags.length}、desc ${desc.length})`);
  const low = r.filter(x => x.ratio < 4.5);
  if (low.length) fix(`${view}/G9: 任務面板有 ${low.length} 處文字對比 < 4.5:1,例如「${low[0].t}」(${low[0].cls})${low[0].ratio.toFixed(2)}:1`);
  else ok(`${view}/G9: 任務面板 ${r.length} 處文字最低對比 ${Math.min(...r.map(x => x.ratio)).toFixed(2)}:1(「未解鎖」${Math.min(...tags.map(x => x.ratio)).toFixed(2)}、說明 ${Math.min(...desc.map(x => x.ratio)).toFixed(2)})`);
  await ctx.close();
}

await browser.close(); srv.stop();
for (const o of oks) console.log('ok  ' + o);
for (const f of fails) console.log('FIX ' + f);
console.log(fails.length ? `FAIL ${fails.length}` : 'PASS');
