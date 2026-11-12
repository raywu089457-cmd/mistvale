// round2-new.mjs — 第二輪回歸稽核:修正造成的新問題(唯讀)。
// 用法: TARGET=http://127.0.0.1:5192 node pipeline/scripts/ui-audit/round2-new.mjs <desktop|tablet|phone|land> [phases]
// phases: toast,small,roster,lock,title,run,move,inspector,world,pilot  (預設全部)
// 輸出: output/ui-audit/round3-mobile/new/<view>/*.png 與 output/ui-audit/round3-mobile/new-<view>.json
import fs from 'node:fs';
import path from 'node:path';
process.env.OUT = process.env.OUT || 'output/ui-audit/round3-mobile/lib';
const L = await import('./round3-mobile-lib.mjs');
const VN = process.argv[2] || 'desktop', V = L.VIEWS[VN], MOBILE = !!V.mobile;
const PH = (process.argv[3] || 'toast,small,roster,lock,title,run,move,inspector,world,pilot').split(',');
const BASE = (process.env.TARGET || 'http://127.0.0.1:5192').replace(/\/$/, '');
const DIR = path.resolve('output/ui-audit/round3-mobile/new', VN); fs.mkdirSync(DIR, { recursive: true });
const F = [], errs = [], scans = [], info = {};
const find = (area, msg, d) => { F.push({ area, msg, d }); console.log('FIND', VN, area, msg, d ? JSON.stringify(d).slice(0, 300) : ''); };
const W = ms => new Promise(r => setTimeout(r, ms));
const b = await L.launch();
const mk = async () => {
  const ctx = await L.newCtx(b, V);
  await ctx.addInitScript(() => { try { localStorage.setItem('mistvale-touch-tip', '1'); } catch {} });
  const page = await ctx.newPage(); const S = L.hook(page, VN, errs);
  return { ctx, page, S };
};
let { ctx, page, S } = await mk();
const shot = async (n, p = page) => { try { await p.screenshot({ path: `${DIR}/${n}.png` }); } catch {} };
const ev = (fn, arg) => page.evaluate(fn, arg);
const act = (a, id) => L.act(page, a, id);
const step = s => { S.step = s; };
const boot = async (url = BASE + '/?preview=1') => { await L.boot(page, url); await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation-duration:0s!important;animation-delay:0s!important}' }); await W(2500); };
const rich = () => ev(() => { const g = globalThis.__mistvaleGame; Object.assign(g.state, { gold: 99999, wood: 9999, ore: 9999, herb: 9999, cloth: 9999, flour: 9999, leather: 9999, gems: 999 }); for (const id of Object.keys(g.state.buildings)) g.state.buildings[id] = Math.max(1, g.state.buildings[id]); });
const reset = async () => {
  await ev(() => {
    try { globalThis.__mistvaleCmdk?.close(); } catch {}
    try { globalThis.__mistvaleGame.pilotStop?.(); } catch {}
    try { globalThis.__mistvaleSelect?.(null); } catch {}
    document.querySelector('#unit-card [data-action=unitCardClose]')?.click();
    document.querySelector('#modal-backdrop:not(.hidden) [data-action=confirmNo]')?.click();
    document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click();
    document.querySelector('#modal-backdrop:not(.hidden) [data-action=offlineOk]')?.click();
    document.querySelector('#inspector:not(.hidden) [data-action=closeInspector]')?.click();
    document.querySelector('#placement:not(.hidden) [data-action=cancelMove]')?.click();
    document.querySelectorAll('#toasts .toast,#toasts>*').forEach(t => t.remove());
    const g = globalThis.__mistvaleGame; g.state.paused = false;
    try { g.retreatDungeon?.(); } catch {}
    try { if (g.state.expedition?.active) { g.state.expedition.active = false; g.state.enemies = g.state.enemies.filter(e => e.type !== 'boss'); } } catch {}
    globalThis.__mistvaleView?.focus('home');
  });
  await rich(); await page.mouse.move(2, 2); await W(300);
};
const tapEl = async (loc, timeout = 2500) => { try { MOBILE ? await loc.tap({ timeout }) : await loc.click({ timeout }); return { ok: true }; } catch (e) { return { ok: false, err: String(e.message || e).split('\n').slice(0, 3).join(' | ').slice(0, 260) }; } };

// ───────── toast 量測 ─────────
const TOAST_PROBE = () => {
  const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05; };
  const nm = e => (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '') || e.tagName;
  const ts = [...document.querySelectorAll('#toasts .toast,#toasts>*')].filter(vis);
  const out = { n: ts.length, toasts: [], hits: [] };
  const rects = ts.map(t => t.getBoundingClientRect());
  ts.forEach((t, i) => {
    const r = rects[i], cs = getComputedStyle(t);
    const leaf = [t, ...t.querySelectorAll('*')].find(x => [...x.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 3));
    const lcs = leaf ? getComputedStyle(leaf) : cs;
    const trunc = [t, ...t.querySelectorAll('*')].some(x => { const c = getComputedStyle(x); return x.scrollWidth > x.clientWidth + 1 && x.clientWidth > 0 && (c.overflowX !== 'visible'); }) || [t, ...t.querySelectorAll('*')].some(x => { const c = getComputedStyle(x); return x.scrollHeight > x.clientHeight + 2 && x.clientHeight > 0 && c.overflowY !== 'visible'; });
    const lines = leaf ? Math.round(leaf.getBoundingClientRect().height / (parseFloat(lcs.lineHeight) || parseFloat(lcs.fontSize) * 1.3)) : 0;
    out.toasts.push({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), clipped: r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1, trunc, lines, text: (t.textContent || '').trim().slice(0, 24), pe: cs.pointerEvents, z: cs.zIndex, ellipsis: lcs.textOverflow });
  });
  const targets = [...document.querySelectorAll('button,[data-action],.modal-title,#modal h1,#modal h2,#modal h3,#topbar *,#hv-left *,.hv-actions *,.view-tools *,#bottom-bar *')]
    .filter(e => vis(e) && !e.closest('#toasts') && [...e.childNodes].some(n => n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim()) ) );
  const seen = new Set();
  for (const e of targets) {
    const er = e.getBoundingClientRect(); if (er.width < 4 || er.height < 4) continue;
    if (er.right <= 0 || er.bottom <= 0 || er.left >= innerWidth || er.top >= innerHeight) continue;
    // 只看可見剪裁後的矩形
    for (const r of rects) {
      const w = Math.min(er.right, r.right) - Math.max(er.left, r.left), h = Math.min(er.bottom, r.bottom) - Math.max(er.top, r.top);
      if (w > 3 && h > 3) {
        const frac = w * h / (er.width * er.height);
        const isBtn = e.matches('button,[data-action]');
        if (frac > 0.12) { const k = nm(e) + (e.dataset?.action || '') + (e.dataset?.id || ''); if (seen.has(k)) continue; seen.add(k); out.hits.push({ el: nm(e), act: e.dataset?.action || '', id: e.dataset?.id || '', txt: (e.textContent || '').trim().slice(0, 10), frac: +frac.toFixed(2), btn: isBtn, rect: [Math.round(er.left), Math.round(er.top), Math.round(er.width), Math.round(er.height)] }); }
      }
    }
  }
  // 彈窗標題列區域:X 鈕是否被蓋
  const x = document.querySelector('#modal [data-action=close]');
  if (x && vis(x)) { const xr = x.getBoundingClientRect(); const top = document.elementFromPoint(xr.left + xr.width / 2, xr.top + xr.height / 2); out.xCovered = !(top && (top === x || x.contains(top))); out.xTop = top ? nm(top) : null; }
  return out;
};
const TOASTS = () => { const t = globalThis.__toast; t('建造完成：鍛造屋 Lv.2'); t('資源不足：還差 120 木材與 35 鐵礦，請先到交易所收購再回來升級大廳', false); t('獵人 艾登 升到 Lv.5', true, 'ok'); };

async function toastPhase() {
  step('toast');
  const PANELS = [
    ['none', async () => {}],
    ['build', () => act('build')], ['hunters', () => act('hunters')], ['hunters-menu', async () => { await act('hunters'); await W(300); await act('rosterMenu'); }],
    ['trade', () => act('trade')], ['craft', () => act('craft')], ['craft-gear', async () => { await act('craft'); await W(200); await act('craftTab', 'gear'); }],
    ['dungeon', () => act('dungeon')], ['arena', () => act('arena')], ['quests', () => act('quests')], ['inventory', () => act('inventory')], ['boss', () => act('boss')],
    ['settings', () => act('settings')], ['settings-quality', async () => { await act('settings'); await W(200); await act('toggleQuality'); }], ['settings-dev', async () => { await act('settings'); await W(200); await act('toggleDev'); }],
    ['help', () => act('help')], ['difficulty', () => act('difficulty')], ['worldmap', () => act('worldmap')], ['region-meadow', () => act('regionDetail', 'meadow')], ['region-snow', () => act('regionDetail', 'snow')],
    ['dispatch', () => act('dispatchHunters')], ['recruit', () => act('recruit')], ['codex', () => act('codex')], ['density', () => act('densityFor', 'meadow')],
    ['hunter-detail', async () => act('hunter', await ev(() => globalThis.__mistvaleGame.state.hunters[0].id))],
    ['inspector-forge', () => act('selectBuilding', 'forge')], ['inspector-hall', () => act('selectBuilding', 'hall')],
    ['offline', () => ev(() => globalThis.__mistvaleShowOffline())],
  ];
  const rows = [];
  for (const [name, fn] of PANELS) {
    try {
      step('toast:' + name); await reset(); await fn(); await W(500);
      // 子頁籤
      const tabs = await ev(() => [...document.querySelectorAll('#modal .tabs button,#modal [role=tab],#modal .modal-tabs button,#modal .hv-subtabs button')].filter(e => e.getBoundingClientRect().width > 0).map(e => ({ a: e.dataset.action, id: e.dataset.id || '', t: (e.textContent || '').trim().slice(0, 8) })));
      const states = [{ label: name }];
      for (const t of tabs) if (t.a) states.push({ label: `${name}/${t.t}`, tab: t });
      for (const st of states) {
        if (st.tab) { await act(st.tab.a, st.tab.id || undefined); await W(350); }
        await ev(() => document.querySelectorAll('#toasts .toast,#toasts>*').forEach(t => t.remove()));
        await ev(TOASTS); await W(450);
        const m = await ev(TOAST_PROBE);
        const safe = st.label.replace(/[^\w一-鿿-]+/g, '_');
        const bad = m.hits.filter(h => h.btn || h.frac > 0.35);
        rows.push({ label: st.label, n: m.n, toasts: m.toasts, hits: m.hits, xCovered: m.xCovered });
        const issue = m.n === 0 || m.toasts.some(t => t.clipped || t.trunc) || bad.length || m.xCovered;
        if (issue) { await shot('toast-' + safe); find('toast', `${st.label}: n=${m.n} ${m.toasts.some(t => t.clipped) ? 'CLIPPED ' : ''}${m.toasts.some(t => t.trunc) ? 'TRUNC ' : ''}${m.xCovered ? 'X-covered ' : ''}${bad.length ? 'covers ' + bad.map(h => `${h.act || h.el}${h.id ? ':' + h.id : ''}(${h.frac})`).slice(0, 6).join(',') : ''}`, { toasts: m.toasts.map(t => [t.x, t.y, t.w, t.h, t.lines]), bad: bad.slice(0, 6) }); }
        else if (['build', 'trade', 'hunters', 'worldmap', 'settings', 'none'].includes(st.label)) await shot('toast-ok-' + safe);
      }
    } catch (e) { find('toast', name + ' 腳本錯誤', String(e).slice(0, 200)); }
  }
  info.toastRows = rows.map(r => ({ l: r.label, n: r.n, pos: r.toasts.map(t => [t.x, t.y, t.w, t.h]) }));
  await reset();
}

// ───────── 小按鈕 ─────────
async function smallPhase() {
  step('small'); await reset();
  const lim = MOBILE ? 44 : 32;
  const hitTest = async sel => ev(sel0 => [...document.querySelectorAll(sel0)].filter(e => e.getBoundingClientRect().width > 0)  .map(e => {
    e.scrollIntoView({ block: 'center', inline: 'center' });
    const r = e.getBoundingClientRect(); const pts = [[.5, .5], [.15, .15], [.85, .15], [.15, .85], [.85, .85]].map(([fx, fy]) => { const x = r.left + r.width * fx, y = r.top + r.height * fy; if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return 'off'; const t = document.elementFromPoint(x, y); return t && (t === e || e.contains(t) || t.contains(e)) ? 'ok' : (t ? (t.id ? '#' + t.id : t.tagName + '.' + String(t.className).slice(0, 20)) : 'null'); });
    return { a: e.dataset.action, id: e.dataset.id || '', d: e.dataset.d || e.dataset.batches || '', w: Math.round(r.width), h: Math.round(r.height), pts };
  }), sel);
  const chk = (area, arr) => { for (const x of arr) { if (x.w < lim || x.h < lim) find(area, `${x.a}:${x.id} ${x.d} 熱區 ${x.w}x${x.h} < ${lim}`, x); if (x.pts.some(p => p !== 'ok' && p !== 'off')) find(area, `${x.a}:${x.id} ${x.d} 角落被蓋住`, x); } };
  // 交易
  await act('trade'); await W(500); await shot('small-trade');
  const tr = await hitTest('#modal [data-action=tradeStep],#modal [data-action=tradeClear],#modal [data-action=close]'); chk('small:trade', tr);
  info.tradeBtns = tr.slice(0, 6).map(x => `${x.d}:${x.w}x${x.h}`);
  const before = await ev(() => JSON.stringify(globalThis.__mistvaleGame.state.tradeRequests));
  const stepBtn = d => page.locator(`#modal [data-action=tradeStep][data-id=wood][data-d="${d}"]`).first();
  const results = {};
  for (const d of ['10', '1', '-1', '-10']) {
    const loc = stepBtn(d);
    if (!(await loc.count())) { results[d] = 'missing'; continue; }
    const b0 = await ev(() => globalThis.__mistvaleGame.state.tradeRequests.wood || 0);
    const r = await tapEl(loc); await W(300);
    const b1 = await ev(() => globalThis.__mistvaleGame.state.tradeRequests.wood || 0);
    results[d] = r.ok ? `${b0}→${b1}` : 'CLICK-FAIL ' + r.err;
    if (!r.ok || b0 === b1 && !(d.startsWith('-') && b0 === 0)) find('small:trade', `交易 ${d} 按了沒效果 (${results[d]})`, r);
  }
  info.tradeStepResults = results;
  // 一顆整排：「收購 +10」
  // 製作
  await reset(); await act('craft'); await W(300); await act('craftTab', 'goods'); await W(300); await shot('small-craft');
  const cr = await hitTest('#modal [data-action=craftProduct]'); chk('small:craft', cr);
  const mx = page.locator('#modal .hv-max').first();
  if (await mx.count()) {
    const s0 = await ev(() => JSON.stringify(globalThis.__mistvaleGame.state.stocks));
    const lab = await mx.textContent();
    const r = await tapEl(mx); await W(400);
    const s1 = await ev(() => JSON.stringify(globalThis.__mistvaleGame.state.stocks));
    info.craftMax = { lab: lab.trim(), r, changed: s0 !== s1 };
    if (!r.ok || s0 === s1) find('small:craft', '製作「做滿」按了沒效果', { r, s0, s1, lab });
  } else find('small:craft', '找不到 .hv-max 做滿鈕');
  // 世界地圖 i
  await reset(); await act('worldmap'); await W(600); await shot('small-worldmap');
  const ri = await hitTest('#modal [data-action=regionDetail],#modal [data-action=regionTravel],#modal [data-action=close]'); chk('small:worldmap', ri);
  // 區域卡 i 點擊 -> 詳情
  const iBtn = page.locator('#modal .hv-i[data-action=regionDetail]').first();
  if (await iBtn.count()) {
    await iBtn.scrollIntoViewIfNeeded().catch(() => {});
    const t0 = await ev(() => document.querySelector('#modal')?.dataset.type + '|' + document.querySelector('#modal .modal-title')?.textContent);
    const r = await tapEl(iBtn); await W(500);
    const t1 = await ev(() => document.querySelector('#modal')?.dataset.type + '|' + document.querySelector('#modal .modal-title')?.textContent);
    info.regionI = { t0, t1, r };
    if (!r.ok || t0 === t1) find('small:worldmap', '區域卡「i」點了沒開詳情', { t0, t1, r });
    await shot('small-region-detail');
    const rd = await hitTest('#modal button'); chk('small:region-detail', rd);
  } else find('small:worldmap', '找不到區域卡「i」');
  // 可見「i」鈕的視覺 i：建設卡 i
  await reset(); await act('build'); await W(500);
  const bi = await hitTest('#modal [data-action=buildingInfo],#modal .hv-i'); chk('small:build-i', bi);
  info.buildI = bi.slice(0, 3);
  await reset();
}

// ───────── 獵人名冊欄數 ─────────
async function rosterPhase() {
  step('roster'); await reset(); await ev(() => { const g = globalThis.__mistvaleGame; });
  for (const n of [6, 8]) {
    await reset();
    if (n === 8) { await ev(() => { const g = globalThis.__mistvaleGame; for (let i = 0; i < 2; i++) { try { g.recruit?.(); } catch {} } }); }
    await act('hunters'); await W(600);
    const m = await ev(() => {
      const cards = [...document.querySelectorAll('#modal [data-action=hunter]')].filter(e => e.getBoundingClientRect().width > 0);
      const cardEls = cards.map(c => c.closest('article,li,div[class*=card],[class*=hc]') || c);
      const lefts = [...new Set(cardEls.map(c => Math.round(c.getBoundingClientRect().left / 4)))];
      const rows = [...new Set(cardEls.map(c => Math.round(c.getBoundingClientRect().top / 4)))];
      const info = cardEls.slice(0, 3).map(c => { const r = c.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), c.tagName + '.' + String(c.className).slice(0, 30)]; });
      const loc = [...document.querySelectorAll('#modal [data-action=locateHunter]')].filter(e => e.getBoundingClientRect().width > 0).map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
      return { n: cards.length, cols: lefts.length, rows: rows.length, info, loc: loc.slice(0, 2) };
    });
    info['roster' + n] = m; await shot('roster-' + n);
    const want = MOBILE ? 4 : 6;
    if (m.n >= want && m.cols !== want && !(VN === 'tablet' && m.cols === 5)) find('roster', `獵人 ${m.n} 人時欄數 ${m.cols}(規格 ${want})`, m);
    if (VN === 'tablet' && m.cols !== 6) find('roster', `1024 寬獵人 ${m.n} 人欄數 ${m.cols}(規格桌機 6)`, m);
    if (m.n < 6 && n === 6) find('roster', `起始獵人只有 ${m.n}`, m);
  }
  await reset();
}

// ───────── 鎖頭圖示 ─────────
async function lockPhase() {
  step('lock'); await reset();
  const dump = sel => ev(sel0 => [...document.querySelectorAll(sel0)].filter(e => e.getBoundingClientRect().width > 0).slice(0, 8).map(e => { const b = getComputedStyle(e, '::before'), a = getComputedStyle(e, '::after'); return { txt: (e.textContent || '').trim().slice(0, 18), html: e.innerHTML.slice(0, 160), bef: b.content + '|' + b.backgroundImage.slice(0, 60), aft: a.content + '|' + a.backgroundImage.slice(0, 60), dis: e.disabled, cls: String(e.className) }; }), sel);
  // 建設:需要大廳 Lv.2
  await ev(() => { const g = globalThis.__mistvaleGame; Object.assign(g.state, { gold: 200, wood: 40, ore: 12 }); g.state.buildings.trading = 0; g.state.buildings.hall = 0; g.state.buildings.inn = 0; for (const k of ['forge', 'clinic']) g.state.buildings[k] = 5; });
  await act('build'); await W(500); await shot('lock-build');
  info.lockBuild = await ev(() => [...document.querySelectorAll('#modal i.hv-lock')].map(i => { const b = i.closest('button'); const r = i.getBoundingClientRect(); return { txt: (b?.textContent || '').trim().slice(0, 16), html: b?.innerHTML.slice(0, 80) || '', bef: '', aft: '', w: Math.round(r.width), h: Math.round(r.height) }; })); info.lockBuildLocks = await ev(() => document.querySelectorAll('#modal i.hv-lock').length);
  // 難度
  await reset(); await act('difficulty'); await W(500); await shot('lock-difficulty');
  info.lockDiff = await dump('#modal button:disabled,#modal button[aria-disabled=true],#modal button.locked,#modal .locked button');
  // 獵人詳情
  await reset(); await act('hunter', await ev(() => globalThis.__mistvaleGame.state.hunters[0].id)); await W(500); await shot('lock-hunter');
  info.lockHunter = await dump('#modal button:disabled,#modal button[aria-disabled=true],#modal button.locked');
  const hasLock = arr => arr.some(x => /🔒|鎖|lock/i.test(x.html + x.bef + x.aft + x.cls) || /url\(/.test(x.bef + x.aft));
  for (const k of ['lockBuild', 'lockDiff', 'lockHunter']) if (!info[k].length) find('lock', k + ' 找不到鎖定按鈕可驗', null); else if (!hasLock(info[k])) find('lock', k + ' 鎖定按鈕沒有可偵測的鎖頭(html/before/after)', info[k].slice(0, 3));
  await reset();
}

// ───────── 標題畫面:新玩家/回訪 ─────────
async function titlePhase() {
  step('title');
  const probe = () => ev(() => {
    const t = document.querySelector('#title-screen'); if (!t) return null;
    const r = t.querySelector('.ts-inner')?.getBoundingClientRect();
    const bs = [...t.querySelectorAll('button,[data-ts]')].filter(e => e.getBoundingClientRect().width > 0).map(e => { const q = e.getBoundingClientRect(); return { ts: e.dataset.ts, t: (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 14), w: Math.round(q.width), h: Math.round(q.height), off: q.bottom > innerHeight + 1 || q.top < -1 }; });
    const small = [...t.querySelectorAll('*')].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && e.getBoundingClientRect().width > 0 && parseFloat(getComputedStyle(e).fontSize) * (e.currentCSSZoom || 1) < 11.95).map(e => e.className + ':' + parseFloat(getComputedStyle(e).fontSize));
    return { inner: r ? [Math.round(r.width), Math.round(r.height), Math.round(r.top), Math.round(r.bottom)] : null, vh: innerHeight, buttons: bs, small, text: t.innerText.replace(/\s+/g, ' ').slice(0, 120) };
  });
  // 新玩家(乾淨 context)
  await page.close(); await ctx.close();
  ({ ctx, page, S } = await mk());
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('#title-screen', { timeout: 90000 }).catch(() => {}); await W(1200);
  await shot('title-new'); info.titleNew = await probe();
  if (!info.titleNew) find('title', '新玩家沒看到 #title-screen', null);
  else {
    const b = info.titleNew.buttons;
    if (b.some(x => /重新開始|繼續/.test(x.t)) && !b.some(x => /開始|點/.test(x.t))) find('title', '新玩家標題仍顯示「繼續／重新開始」', b);
    if (info.titleNew.inner && (info.titleNew.inner[3] > info.titleNew.vh + 1 || info.titleNew.inner[2] < -1)) find('title', `標題內容被裁:inner top ${info.titleNew.inner[2]} bottom ${info.titleNew.inner[3]} vs vh ${info.titleNew.vh}`, info.titleNew.inner);
    if (info.titleNew.small.length) find('title', '標題小於 12px 的字', info.titleNew.small);
    if (MOBILE && b.some(x => x.h < 44)) find('title', '標題按鈕 <44px', b);
  }
  // 點開始 → 歡迎對話
  const start = page.locator('#title-screen [data-ts]').first();
  if (await start.count()) { const r = await tapEl(start, 4000); await W(1800); await shot('title-new-after'); info.titleNewAfter = await ev(() => ({ ts: !!document.querySelector('#title-screen'), modal: document.querySelector('#modal')?.dataset.type || null, modalHidden: document.querySelector('#modal-backdrop')?.className })); if (!r.ok) find('title', '點開始失敗', r); }
  // 回訪:同 context 重新載入(存檔在 localStorage)
  await ev(() => { try { globalThis.__mistvaleGame && 0; } catch {} });
  await W(3000);
  info.saveKeys = await ev(() => Object.keys(localStorage).map(k => k + ':' + localStorage.getItem(k).length));
  { const np = await ctx.newPage(); L.hook(np, VN, errs); await page.close(); page = np; await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 120000 }); }
  await page.waitForSelector('#title-screen', { timeout: 90000 }).catch(() => {}); await W(1200);
  await shot('title-return'); info.titleReturn = await probe();
  if (!info.titleReturn) find('title', '回訪玩家沒看到 #title-screen', null);
  else { const b = info.titleReturn.buttons; if (!b.some(x => /繼續/.test(x.t))) find('title', '回訪玩家沒有「繼續」鈕', b); if (MOBILE && b.some(x => x.h < 44)) find('title', '回訪標題按鈕 <44px', b); }
  // 回到 preview
  await page.close(); await ctx.close(); ({ ctx, page, S } = await mk()); await boot(); await rich();
}

// ───────── 出征 HUD ─────────
async function runPhase() {
  step('run'); await reset();
  const r = await ev(() => { const g = globalThis.__mistvaleGame; return g.startDungeon(g.state.hunters.slice(0, 3).map(h => h.id)); });
  await W(2200); await shot('run-hud');
  const sc = await ev(L.SCAN); scans.push({ tag: 'run-hud', ...L.summarize(sc) });
  const hud = await ev(() => { const q = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; }; return { run: q('#run-hud'), actions: q('.hv-actions'), left: q('#hv-left'), tools: q('.view-tools'), retreat: q('[data-action=retreatDungeon],#run-hud button') }; });
  info.runHud = hud;
  const rr = (a, b2) => a && b2 && Math.min(a[0] + a[2], b2[0] + b2[2]) - Math.max(a[0], b2[0]) > 6 && Math.min(a[1] + a[3], b2[1] + b2[3]) - Math.max(a[1], b2[1]) > 6;
  if (rr(hud.run, hud.left)) find('run-hud', '#run-hud 與 #hv-left 重疊', hud);
  if (rr(hud.run, hud.actions)) find('run-hud', '#run-hud 與 .hv-actions 重疊', hud);
  if (rr(hud.run, hud.tools)) find('run-hud', '#run-hud 與 .view-tools 重疊', hud);
  const rt = page.locator('#run-hud [data-action]').first();
  const lab = await ev(() => [...document.querySelectorAll('#run-hud button')].map(b => (b.dataset.action || '') + ':' + Math.round(b.getBoundingClientRect().width) + 'x' + Math.round(b.getBoundingClientRect().height)));
  info.runBtns = lab;
  // 撤退鈕可點(真實點擊)
  const ret = page.locator('#run-hud [data-action*=etreat], #run-hud button:has-text("撤退")').first();
  if (await ret.count()) { const res = await tapEl(ret, 3000); await W(500); const active = await ev(() => !!globalThis.__mistvaleGame.state.dungeon?.active || !!document.querySelector('#run-hud:not(.hidden)')); info.retreat = { res, stillActive: active }; if (!res.ok) find('run-hud', '撤退鈕點不到', res); }
  else find('run-hud', '找不到撤退鈕', lab);
  await reset();
}

// ───────── 移動建築 / 取消 / 擺放列 ─────────
async function movePhase() {
  step('move'); await reset();
  await act('moveBuilding', 'forge'); await W(700); await shot('move-placement');
  const pl = await ev(() => { const e = document.querySelector('#placement'); const r = e.getBoundingClientRect(); const q = s => { const x = document.querySelector(s); if (!x || x.getBoundingClientRect().width === 0) return null; const rr = x.getBoundingClientRect(); return [Math.round(rr.left), Math.round(rr.top), Math.round(rr.width), Math.round(rr.height)]; }; return { hidden: e.classList.contains('hidden'), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], pause: q('#pause-label'), reopen: q('#reopen-left'), tools: q('.view-tools'), actions: q('.hv-actions'), hvleft: q('#hv-left'), bar: q('#bottom-bar'), text: e.innerText.replace(/\s+/g, ' ').slice(0, 60), bg: getComputedStyle(e).backgroundColor, bgImg: getComputedStyle(e).backgroundImage.slice(0, 40) }; });
  info.placement = pl;
  if (pl.hidden) find('move', '擺放列沒出現', pl);
  const rr = (a, b2) => a && b2 && Math.min(a[0] + a[2], b2[0] + b2[2]) - Math.max(a[0], b2[0]) > 4 && Math.min(a[1] + a[3], b2[1] + b2[3]) - Math.max(a[1], b2[1]) > 4;
  for (const k of ['pause', 'reopen', 'tools', 'actions', 'hvleft', 'bar']) if (rr(pl.rect, pl[k])) find('move', `擺放列與 ${k} 重疊`, { rect: pl.rect, other: pl[k] });
  if (MOBILE && pl.rect[3] < 44) find('move', '擺放列高度 <44', pl.rect);
  const cb = page.locator('#placement [data-action=cancelMove]').first();
  if (await cb.count()) {
    const sz = await ev(() => { const r = document.querySelector('#placement [data-action=cancelMove]').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
    info.cancelSize = sz; if (MOBILE && (sz[0] < 44 || sz[1] < 44)) find('move', `取消鈕 ${sz} <44`, sz);
    const res = await tapEl(cb, 3000); await W(500);
    const after = await ev(() => ({ hidden: document.querySelector('#placement').classList.contains('hidden') }));
    info.cancelAfter = { res, ...after }; if (!res.ok || !after.hidden) find('move', '取消移動按了沒關掉擺放列', { res, after });
    await shot('move-after-cancel');
  } else find('move', '擺放列沒有 cancelMove 鈕', pl.text);
  await reset();
}

// ───────── 建築詳情抽屜 + 世界點選切換 ─────────
async function inspectorPhase() {
  step('inspector'); await reset();
  await ev(() => globalThis.__mistvaleView.focus('home')); await W(900);
  await act('selectBuilding', 'forge'); await W(700); await shot('inspector-forge');
  const g = await ev(() => { const r = document.querySelector('#inspector').getBoundingClientRect(); const q = (s) => { const e = document.querySelector(s); if (!e) return null; const rr = e.getBoundingClientRect(); return [Math.round(rr.left), Math.round(rr.top), Math.round(rr.width), Math.round(rr.height)]; }; const small = [...document.querySelectorAll('#inspector *')].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && e.getBoundingClientRect().width > 0 && parseFloat(getComputedStyle(e).fontSize) < 11.95 && parseFloat(getComputedStyle(e).fontSize) > 0.5).map(e => e.className + ':' + parseFloat(getComputedStyle(e).fontSize)); const btns = [...document.querySelectorAll('#inspector button')].filter(e => e.getBoundingClientRect().width > 0).map(e => { const q2 = e.getBoundingClientRect(); return (e.dataset.action || '') + ':' + Math.round(q2.width) + 'x' + Math.round(q2.height); }); const cov = ['#hv-quest', '.view-tools', '.hv-actions', '#pause-label', '#bottom-bar'].map(s => [s, q(s)]); return { rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], vw: innerWidth, vh: innerHeight, small, btns, cov, note: q('.inspect-note') }; });
  info.inspector = g;
  if (MOBILE && g.rect[0] !== 0) find('inspector', `手機抽屜 x=${g.rect[0]} w=${g.rect[2]} vw=${g.vw} 沒貼滿寬`, g.rect);
  if (g.small.length) find('inspector', '抽屜小於 12px 的字', g.small);
  if (g.note && g.note[2] < 120 && MOBILE) find('inspector', `.inspect-note 只有 ${g.note[2]}px 寬`, g.note);
  // 世界點選切換:點另一棟建築(用 __mistvaleMapLabels 取名牌位置)
  const labs = { labs: await ev(() => { const c = document.querySelector('canvas#world,#world,canvas'); const cr = c.getBoundingClientRect(); return globalThis.__mistvaleView.hitRects().map(l => ({ id: l.id, cx: l.x + l.w / 2 + cr.left, cy: l.y + l.h / 2 + cr.top, lx: l.x + cr.left, ly: l.y + cr.top, w: l.w, h: l.h })); }) };
  info.labelCount = labs.labs.length;
  const selNow = () => ev(() => { const t = document.querySelector('#inspector .inspect-title,#inspector h2,#inspector h3,#inspector b'); return { hidden: document.querySelector('#inspector').classList.contains('hidden'), title: t ? t.textContent.trim().slice(0, 12) : null, txt: document.querySelector('#inspector').innerText.replace(/\s+/g, ' ').slice(0, 20) }; });
  const targets = labs.labs.filter(l => l.id !== 'forge' && l.cx > 4 && l.cx < V.w - 4 && l.cy > 4 && l.cy < V.h - 4);
  let sw = 0, tried = 0;
  for (const t of targets.slice(0, 4)) {
    const before = await selNow();
    // 點名牌上方 24px(建築本體)
    const x = Math.round(t.cx), y = Math.round(t.cy);
    // 抽屜/HUD 蓋住的位置不點
    const top = await ev(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? (e.id || e.tagName) : null; }, [x, y]);
    if (top && top !== 'world' && top !== 'CANVAS') continue;
    tried++;
    if (MOBILE) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
    await W(700); const after = await selNow();
    if (!after.hidden && after.txt !== before.txt) sw++;
    else { info['worldClickFail' + t.id] = { before, after, x, y }; }
    await shot('inspector-switch-' + t.id);
    if (!after.hidden && after.txt !== before.txt) break;
  }
  info.worldSwitch = { tried, sw };
  if (tried === 0) find('inspector', '找不到可點的第二棟建築(名牌位置全被 HUD 蓋住)', { labs: labs.labs.length });
  else if (sw === 0) find('inspector', '抽屜開著時點世界另一棟建築沒有切換', info);
  // 抽屜開著，點空地 → 應關閉或維持?
  await reset();
}

// ───────── 世界點選(不開抽屜)─────────
async function worldPhase() {
  step('world'); await reset();
  await ev(() => globalThis.__mistvaleView.focus('home')); await W(900);
  const labs = await ev(() => { const c = document.querySelector('canvas#world,#world,canvas'); const cr = c.getBoundingClientRect(); return globalThis.__mistvaleView.hitRects().map(l => ({ id: l.id, cx: l.x + l.w / 2 + cr.left, cy: l.y + l.h / 2 + cr.top })); });
  const t = labs.find(l => l.id === 'forge' && l.cx > 4 && l.cx < V.w - 4 && l.cy > 4 && l.cy < V.h - 4) || labs.find(l => l.cx > 4 && l.cx < V.w - 4 && l.cy > 4 && l.cy < V.h - 4);
  if (!t) { find('world', '無名牌可點', null); return; }
  const x = Math.round(t.cx), y = Math.round(t.cy);
  if (MOBILE) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
  await W(800); await shot('world-click-building');
  const st = await ev(() => ({ insp: !document.querySelector('#inspector').classList.contains('hidden'), sel: !!document.querySelector('#hv-sel') && document.querySelector('#hv-sel').getBoundingClientRect().width > 0, selHtml: document.querySelector('#hv-sel')?.innerHTML.slice(0, 120), unit: !document.querySelector('#unit-card')?.classList.contains('hidden') }));
  info.worldClick = st;
  // 小方鈕/六角鈕熱區
  const hs = await ev(() => [...document.querySelectorAll('#hv-sel button')].filter(e => e.getBoundingClientRect().width > 0).map(e => { const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { a: e.dataset.action, w: Math.round(r.width), h: Math.round(r.height), ok: !!t && (t === e || e.contains(t)) }; }));
  info.hvSel = hs;
  if (MOBILE) for (const h of hs) if (h.w < 44 || h.h < 44 || !h.ok) find('world', `世界選取鈕 ${h.a} ${h.w}x${h.h} ok=${h.ok}`, h);
  await reset();
}

// ───────── 手動操控抽屜 ─────────
async function pilotPhase() {
  step('pilot'); await reset();
  await act('settings'); await W(400);
  const btn = page.locator('#modal [data-action=pilotLab]').first();
  if (!(await btn.count())) { find('pilot', '設定裡找不到手動操控鈕', null); return; }
  const r = await tapEl(btn); await W(700);
  if (!r.ok) { find('pilot', '手動操控鈕點不到', r); return; }
  await shot('pilot-pick');
  const g = await ev(() => { const p = document.querySelector('#pilotlab'); if (!p) return null; const pr = p.getBoundingClientRect(); const top = document.querySelector('#topbar')?.getBoundingClientRect(); const items = ['#topbar [data-action=settings]', '#topbar [data-action=worldmap]', '#bottom-bar [data-action=build]', '.view-tools [data-action]'].map(s => { const e = document.querySelector(s); if (!e) return [s, null]; const q = e.getBoundingClientRect(); if (q.width === 0) return [s, 'hidden']; const t = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return [s, !!t && (t === e || e.contains(t)) ? 'reachable' : 'COVERED by ' + (t?.id || t?.tagName)]; }); return { rect: [Math.round(pr.left), Math.round(pr.top), Math.round(pr.width), Math.round(pr.height)], vw: innerWidth, vh: innerHeight, items, btns: [...p.querySelectorAll('button')].filter(e => e.getBoundingClientRect().width > 0).map(e => { const q = e.getBoundingClientRect(); return (e.dataset.pilot || e.dataset.action || '') + ':' + Math.round(q.width) + 'x' + Math.round(q.height); }) }; });
  info.pilot = g;
  if (!g) find('pilot', '#pilotlab 沒出現', null);
  else { if (g.items.some(([, s]) => /COVERED/.test(s || ''))) find('pilot', '手動操控清單蓋住 HUD', g.items); if (MOBILE && g.btns.some(x => { const [w, h] = x.split(':')[1].split('x').map(Number); return w < 44 || h < 44; })) find('pilot', '手動操控按鈕 <44px', g.btns); }
  await reset();
}

try {
  await boot(); await rich();
  const map = { toast: toastPhase, small: smallPhase, roster: rosterPhase, lock: lockPhase, run: runPhase, move: movePhase, inspector: inspectorPhase, world: worldPhase, pilot: pilotPhase };
  for (const p of PH) { if (p === 'title') continue; if (map[p]) { try { await map[p](); } catch (e) { find(p, '腳本錯誤', String(e).slice(0, 300)); } } }
  if (PH.includes('title')) { try { await titlePhase(); } catch (e) { find('title', '腳本錯誤', String(e).slice(0, 300)); } }
} finally {
  fs.writeFileSync(`output/ui-audit/round3-mobile/new-${VN}.json`, JSON.stringify({ view: VN, errs, findings: F, scans, info }, null, 1));
  console.log('DONE', VN, 'findings', F.length, 'errs', errs.length);
  await b.close();
}
