// z1-shell.mjs — Z1(2026-11-12 圖鑑 v2):所有面板共用的外殼與底部頁籤列。每一項都是「改回舊行為就會紅」。
//   視窗:1440×900、1024×768、390×844(mobile+touch)、844×390(mobile+touch)、360×640(touch)、768×1024(平板觸控)。
//   A. 底部頁籤列 5 格(建設、地下城、獵人、倉庫、交易):順序、高度(桌機 72、手機 68–71、橫向 58)、每格 ≥44、桌機每格 ≤150、選中齊平 #948973、標籤 13px。
//   B. 每個面板的模式:A 頁籤抽屜(建設、獵人、倉庫、製作、交易、地下城、競技場、派遣、招募)、C 置中視窗(獵人詳情、確認、離線戰報、委託、首領、設定、說明、世界地圖、區域詳情、難度、圖鑑、建築詳情)。
//   C. A 抽屜幾何:貼在頁籤列上方、手機高 50%／桌機高 45%、桌機寬 960、遮罩透明(HUD 與場景不壓暗)、有圓形 X、地下城／倉庫有子頁籤。
//   D. C 視窗幾何:遮罩 rgba(0,0,0,.55) 蓋到頁籤列、手機寬 85%、桌機寬 ≤560、高 ≤ min(100vh−頁籤列−32,760)、水平置中、沒有 X、底部按鈕列(只有關閉 130×42／兩顆 118×43 間距 14)、
//      底部關閉鈕點得到、Esc 與點遮罩都能關(確認框例外:只能按鈕)、橫向高 = 100% − 24。
//   E. 建築詳情 #inspector 是同一套 C 視窗(遮罩、底部 升級＋關閉、移動位置在標題右上、點遮罩與 Esc 關閉、底緣離頁籤列 ≥ 16 吃 safe-area)。
//   F. 按鈕顏色語意:紅 #8d3925＝關閉／取消、橄欖綠 #586810＝確認與視窗主動作、金棕 #906818＝清單列動作、灰 #505050(＋鎖頭)＝不能用。
//   G. 舊入口都還到得了:data-action(build/hunters/trade/craft/dungeon/arena/quests/inventory…)、數字鍵 1–8、Ctrl+K 指令面板 14 項;競技場=地下城子頁籤、製作=倉庫子頁籤、頁籤高亮正確;委託徽章在右上圖示。
//   H. 觸控(含平板 768×1024 觸控)熱區 ≥44;C 視窗開著 toast 在視窗上方遮罩區、不蓋標題;頁面沒有 console／page error。
//   用法:node tools/checks/z1-shell.mjs(TARGET 空＝自己開臨時伺服器;TARGET=別台可量修前版本)。SHOTS_DIR=資料夾 會存截圖。
import * as L from './fix-a-lib.mjs';
import fs from 'node:fs';
const srv = await L.startServer(); const browser = await L.launch();
const fails = [], oks = []; const fix = m => fails.push(m), ok = m => oks.push(m);
const SHOTS = process.env.SHOTS_DIR || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const url = srv.url + (srv.url.includes('?') ? '' : '?preview=1');
const VIEWS = {
  desktop: { w: 1440, h: 900 }, tablet: { w: 1024, h: 768 }, phone: { w: 390, h: 844, mobile: true }, land: { w: 844, h: 390, mobile: true },
  small: { w: 360, h: 640, mobile: true }, pad: { w: 768, h: 1024, mobile: true },
};
const only = (process.env.VIEWS || Object.keys(VIEWS).join(',')).split(',');
const A_TYPES = ['build', 'hunters', 'inventory', 'craft', 'trade', 'dungeon', 'arena', 'dispatch', 'recruit'];
const C_TYPES = ['quests', 'settings', 'help', 'worldmap', 'difficulty', 'boss', 'region', 'codex', 'confirm', 'hunter', 'offline'];
const ROLE = { red: 'rgb(141, 57, 37)', olive: 'rgb(88, 104, 16)', gold: 'rgb(144, 104, 24)', gray: 'rgb(80, 80, 80)' };

const PAGE = () => {
  const R = e => { if (!e) return null; const q = e.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height }; };
  const vis = e => { if (!e) return false; const q = e.getBoundingClientRect(); if (q.width < 1 || q.height < 1) return false; for (let p = e; p; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0 || p.hidden || p.classList?.contains('hidden')) return false; } return true; };
  const inter = (a, b) => !!a && !!b && Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5;
  const hitsSelf = e => { const q = e.getBoundingClientRect(); const t = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return !!t && (t === e || e.contains(t)); };
  const open = (a, id) => { const el = document.createElement('button'); el.dataset.action = a; if (id != null) el.dataset.id = id; el.style.display = 'none'; document.body.append(el); el.click(); el.remove(); };
  const bg = e => getComputedStyle(e).backgroundColor;
  return { R, vis, inter, hitsSelf, open, bg };
};
const ev = (page, fn, arg) => page.evaluate(`(async()=>{const P=(${PAGE.toString()})();const f=${fn.toString()};return await f(P,${JSON.stringify(arg ?? null)});})()`);
const DBG = !!process.env.DEBUG; const trace = m => { if (DBG) console.error('[z1]', m); };
const settle = (page, ms = 450) => page.waitForTimeout(ms);
const closeAll = async page => { await page.evaluate(() => { const b = document.querySelector('#modal-backdrop:not(.hidden)'); if (b) { const m = document.querySelector('#modal'); if (m.dataset.kind === 'confirm') document.querySelector('[data-action=confirmNo]')?.click(); else document.querySelector('#modal [data-action=close]')?.click(); } if (!document.querySelector('#inspector').classList.contains('hidden')) document.querySelector('[data-action=closeInspector]')?.click(); }); await settle(page, 250); };
const openType = async (page, t) => {
  if (t === 'confirm') await page.evaluate(() => globalThis.__mistvaleConfirm('確定要重置村莊嗎？此動作無法復原。'));
  else if (t === 'hunter') await page.evaluate(() => { const id = globalThis.__mistvaleGame.state.hunters[0].id; const el = document.createElement('button'); el.dataset.action = 'hunter'; el.dataset.id = id; el.style.display = 'none'; document.body.append(el); el.click(); el.remove(); });
  else if (t === 'region') await page.evaluate(() => { const el = document.createElement('button'); el.dataset.action = 'regionDetail'; el.dataset.id = 'forest'; el.style.display = 'none'; document.body.append(el); el.click(); el.remove(); });
  else if (t === 'offline') await page.evaluate(() => { globalThis.__mistvaleShowOffline?.(); });
  else await L.act(page, t === 'dispatch' ? 'dispatchHunters' : t);
  await settle(page);
};

for (const name of only) {
  const v = VIEWS[name]; if (!v) continue;
  const touch = !!v.mobile, landscape = v.h <= 520, portraitPhone = v.w <= 760, label = `${name}(${v.w}×${v.h})`;
  const ctx = await L.newCtx(browser, v); const page = await ctx.newPage();
  try {
  const errs = []; page.on('pageerror', e => errs.push('pageerror ' + String(e).slice(0, 160))); page.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text().slice(0, 160)); });
  await L.boot(page, url);
  await page.evaluate(() => { const g = globalThis.__mistvaleGame; for (const k of ['resources', 'buildings', 'heal']) g.cheat(k); g.state.paused = true; });
  const wantTab = landscape ? 58 : portraitPhone ? [68, 71] : 72;

  trace(label + ' A');
  // ───── A. 頁籤列 ─────
  {
    const g = await ev(page, P => {
      const bar = document.querySelector('#bottom-bar'), bs = [...bar.querySelectorAll(':scope>button')];
      return { bar: P.R(bar), n: bs.length, acts: bs.map(b => b.dataset.action), labels: bs.map(b => b.querySelector('b')?.textContent), rects: bs.map(b => P.R(b)), fs: bs.map(b => getComputedStyle(b.querySelector('b')).fontSize), vw: innerWidth,
        icon: bs.map(b => P.R(b.querySelector('[data-icon]'))), color: bs.map(b => getComputedStyle(b.querySelector('b')).color) };
    });
    if (g.n !== 5 || g.acts.join() !== 'build,dungeon,hunters,inventory,trade') fix(`${label}/A: 頁籤列要 5 格 建設、地下城、獵人、倉庫、交易,實際 ${g.n} 格 ${g.acts.join('/')}`);
    else if (g.labels.join() !== '建設,地下城,獵人,倉庫,交易') fix(`${label}/A: 頁籤標籤 ${g.labels.join('/')}`);
    else ok(`${label}/A: 頁籤列 5 格 ${g.labels.join('、')}`);
    const hh = g.bar.h - (await page.evaluate(() => { const p = document.createElement('div'); p.style.paddingBottom = 'var(--z1-sab)'; document.body.append(p); const v = parseFloat(getComputedStyle(p).paddingBottom) || 0; p.remove(); return v; }));
    const okH = Array.isArray(wantTab) ? hh >= wantTab[0] - 1 && hh <= wantTab[1] + 1 : Math.abs(hh - wantTab) <= 1.5;
    if (!okH) fix(`${label}/A: 頁籤列高 ${g.bar.h.toFixed(1)} 應為 ${wantTab}`);
    if (g.rects.some(r => r.h < 44 || r.w < 44)) fix(`${label}/A: 頁籤熱區 <44(${g.rects.map(r => Math.round(r.w) + '×' + Math.round(r.h)).join(',')})`);
    if (!portraitPhone && !landscape && g.rects.some(r => r.w > 150.5)) fix(`${label}/A: 桌機每格最寬 150,實際 ${Math.max(...g.rects.map(r => r.w)).toFixed(0)}`);
    if (g.bar.w < g.vw - 1) fix(`${label}/A: 頁籤列沒有滿寬(${g.bar.w})`);
    if (g.fs.some(f => f !== '13px')) fix(`${label}/A: 標籤字級要 13px,實際 ${g.fs.join('/')}`);
    if (!landscape) { const s = Math.min(...g.icon.map(r => r.w)); if (s < 35.5 || s > 40.5) fix(`${label}/A: 頁籤圖示 36–40px,實際 ${s}`); }
    if (!g.rects.every(r => Math.abs(r.t - g.rects[0].t) < 0.6)) fix(`${label}/A: 頁籤沒有齊平`);
    // 選中:點「建設」→ 該格背景 #948973、沒有上凸、標籤深色
    await L.act(page, 'build'); await settle(page, 800);
    const sel = await ev(page, P => { const b = document.querySelector('#bottom-bar [data-action=build]'), o = document.querySelector('#bottom-bar [data-action=trade]'); return { bg: P.bg(b), top: P.R(b).t, otherTop: P.R(o).t, h: P.R(b).h, otherH: P.R(o).h, text: getComputedStyle(b.querySelector('b')).color, tab: document.body.dataset.modalTab, shadow: getComputedStyle(b).boxShadow }; });
    if (sel.bg !== 'rgb(148, 137, 115)') fix(`${label}/A: 選中格要填 #948973,實際 ${sel.bg}`);
    if (Math.abs(sel.top - sel.otherTop) > 0.6 || Math.abs(sel.h - sel.otherH) > 0.6) fix(`${label}/A: 選中格要與列齊平(不上凸):top ${sel.top} vs ${sel.otherTop}`);
    if (sel.text !== 'rgb(28, 22, 15)') fix(`${label}/A: 選中標籤要 #1c160f,實際 ${sel.text}`);
    if (!/247, 242, 212/.test(sel.shadow)) fix(`${label}/A: 選中格上緣要 1px #f7f2d4,box-shadow=${sel.shadow}`);
    await closeAll(page);
  }

  // ───── B/C/D. 每個面板的模式與幾何 ─────
  for (const t of [...A_TYPES, ...C_TYPES]) {
    trace(label + ' panel ' + t);
    const wantMode = A_TYPES.includes(t) ? 'A' : 'C';
    if (t === 'recruit') await page.evaluate(() => { const g = globalThis.__mistvaleGame; g.state.gold = 99999; });
    await openType(page, t);
    const g = await ev(page, P => {
      const bd = document.querySelector('#modal-backdrop'), m = document.querySelector('#modal'), bar = document.querySelector('#bottom-bar');
      const foot = document.querySelector('#modal-foot'), kids = [...foot.children].filter(e => P.vis(e));
      const x = document.querySelector('#modal .modal-title [data-action=close]'), cb = P.R(bar);
      const sub = [...document.querySelectorAll('#modal-subtabs .z1-subtab')].filter(e => P.vis(e)).map(e => e.dataset.subtab);
      const centerBar = document.elementFromPoint(cb.l + cb.w / 2, cb.t + cb.h / 2);
      return { shown: !bd.classList.contains('hidden'), mode: m.dataset.mode, bmode: bd.dataset.mode, body: document.body.dataset.modalMode, type: m.dataset.type, tab: document.body.dataset.modalTab,
        m: P.R(m), bar: cb, bgColor: getComputedStyle(bd).backgroundColor, bdZ: getComputedStyle(bd).zIndex, xVis: !!x && P.vis(x), xr: x ? P.R(x) : null, kids: kids.map(e => ({ r: P.R(e), t: e.textContent.trim(), a: e.dataset.action, bg: P.bg(e), hit: P.hitsSelf(e), role: e.dataset.zbr })),
        coverBar: centerBar === bd || bd.contains(centerBar), sub, vw: innerWidth, vh: innerHeight, title: P.R(document.querySelector('#modal-title')), content: P.R(document.querySelector('#modal-content')) };
    });
    if (!g.shown) { fix(`${label}/B: ${t} 沒有打開`); continue; }
    if (g.mode !== wantMode || g.bmode !== wantMode || g.body !== wantMode) { fix(`${label}/B: ${t} 模式應為 ${wantMode},實際 modal=${g.mode}／backdrop=${g.bmode}／body=${g.body}`); continue; }
    if (wantMode === 'A') {
      const want = landscape ? null : (portraitPhone ? 0.5 : 0.45) * v.h;
      if (!landscape) {
        if (Math.abs(g.m.b - g.bar.t) > 1.5) fix(`${label}/C: ${t} 抽屜底 ${g.m.b.toFixed(1)} 應貼頁籤列頂 ${g.bar.t.toFixed(1)}`);
        if (Math.abs(g.m.h - want) > 2.5) fix(`${label}/C: ${t} 抽屜高 ${g.m.h.toFixed(1)} 應約 ${portraitPhone ? '50' : '45'}% = ${want.toFixed(0)}`);
        if (portraitPhone ? g.m.w < v.w - 1 : Math.abs(g.m.w - Math.min(960, v.w - 32)) > 2) fix(`${label}/C: ${t} 抽屜寬 ${g.m.w.toFixed(0)}(桌機 min(960,vw−32)、手機滿寬)`);
        if (!/rgba\(0, 0, 0, 0\)|transparent/.test(g.bgColor)) fix(`${label}/C: ${t} A 抽屜遮罩要透明(HUD 與場景不壓暗),實際 ${g.bgColor}`);
        if (g.coverBar) fix(`${label}/C: ${t} A 抽屜開著頁籤列不應被遮罩蓋住`);
      }
      if (!g.xVis || (!landscape && Math.abs(g.xr.w - g.xr.h) > 1)) fix(`${label}/C: ${t} A 抽屜要有圓形 X`);
      if (g.kids.length) fix(`${label}/C: ${t} A 抽屜不該有底部按鈕列(${g.kids.map(k => k.t).join(',')})`);
      const wantSub = { dungeon: 'dungeon,arena', arena: 'dungeon,arena', inventory: 'inventory,craft', craft: 'inventory,craft' }[t];
      if (wantSub && g.sub.join() !== wantSub) fix(`${label}/G: ${t} 子頁籤應為 ${wantSub},實際 ${g.sub.join('/') || '無'}`);
      const wantTabHL = { arena: 'dungeon', craft: 'inventory', dispatch: 'hunters', recruit: 'hunters' }[t] || t;
      if (g.tab !== wantTabHL) fix(`${label}/G: ${t} 開著時頁籤高亮應為 ${wantTabHL},實際 ${g.tab}`);
    } else {
      const area = v.h - g.bar.h - 32;
      const maxH = landscape ? v.h - 24 : Math.min(760, v.h - g.bar.h - 32);
      if (!g.coverBar || g.bdZ <= 32) fix(`${label}/D: ${t} C 遮罩要蓋住頁籤列(elementFromPoint=${g.coverBar},z=${g.bdZ})`);
      if (!/rgba\(0, 0, 0, 0\.55\)/.test(g.bgColor)) fix(`${label}/D: ${t} 遮罩應 rgba(0,0,0,.55),實際 ${g.bgColor}`);
      const wantW = landscape ? (t === 'worldmap' ? v.w - 24 : t === 'confirm' ? 320 : Math.min(720, v.w * 0.92)) : portraitPhone ? (t === 'worldmap' ? v.w * 0.94 : (t === 'confirm' ? Math.min(320, v.w * 0.85) : v.w * 0.85)) : (t === 'worldmap' ? Math.min(880, v.w * 0.94) : t === 'confirm' ? 320 : Math.min(560, v.w * 0.85));
      if (Math.abs(g.m.w - wantW) > 2.5) fix(`${label}/D: ${t} C 視窗寬 ${g.m.w.toFixed(0)} 應 ${wantW.toFixed(0)}`);
      if (g.m.h > maxH + 1.5) fix(`${label}/D: ${t} C 視窗高 ${g.m.h.toFixed(0)} 超過上限 ${maxH.toFixed(0)}`);
      if (Math.abs((g.m.l + g.m.r) / 2 - v.w / 2) > 1.5) fix(`${label}/D: ${t} C 視窗沒有水平置中(中心 ${((g.m.l + g.m.r) / 2).toFixed(1)})`);
      if (g.m.b > g.bar.t - (landscape ? 0 : 15) && !landscape) fix(`${label}/D: ${t} C 視窗底 ${g.m.b.toFixed(0)} 離頁籤列頂 ${g.bar.t.toFixed(0)} 要 ≥16`);
      if (landscape && Math.abs(g.m.h - (v.h - 24)) > 2 && t !== 'confirm' && g.m.h > v.h - 24 + 1.5) fix(`${label}/D: ${t} 橫向 C 視窗高 ${g.m.h} 應 ≤ 100% − 24`);
      if (g.xVis) fix(`${label}/D: ${t} C 視窗不該有右上 X`);
      const tr = g.title; if (!tr || Math.abs(g.m.t + 12 - tr.t) > 14) { /* 標題在視窗頂部 */ }
      const wantKids = t === 'confirm' ? 2 : (t === 'boss' || t === 'region') ? 2 : 1;
      if (g.kids.length < 1) fix(`${label}/D: ${t} C 視窗要有底部按鈕列`);
      else {
        const single = g.kids.length === 1;
        for (const k of g.kids) {
          const wantH = touch ? 44 : single ? 42 : 43, minW = single ? 130 : 118;
          if (Math.abs(k.r.h - wantH) > 1.6 || k.r.w < minW - 1.5) fix(`${label}/D: ${t} 底部鈕「${k.t}」尺寸 ${k.r.w.toFixed(0)}×${k.r.h.toFixed(0)} 應 ≥${minW}×${wantH}`);
          if (!k.hit) fix(`${label}/D: ${t} 底部鈕「${k.t}」中心點不到(被蓋住)`);
        }
        if (g.kids.length >= 2) { const gap = g.kids[1].r.l - g.kids[0].r.r; if (Math.abs(gap - 14) > 2 && g.kids[0].r.t === g.kids[1].r.t) fix(`${label}/D: ${t} 兩顆底部鈕間距 ${gap.toFixed(0)} 應 14`); const c0 = (g.kids[0].r.l + g.kids[g.kids.length - 1].r.r) / 2; if (Math.abs(c0 - v.w / 2) > 2) fix(`${label}/D: ${t} 底部鈕組沒有置中`); }
        void wantKids;
      }
      // 顏色語意
      const bgOf = n => g.kids.find(k => k.t.includes(n))?.bg;
      if (t === 'confirm') { if (bgOf('確定') !== ROLE.olive) fix(`${label}/F: 確認框「確定」要橄欖綠 #586810,實際 ${bgOf('確定')}`); if (bgOf('取消') !== ROLE.red) fix(`${label}/F: 確認框「取消」要紅 #8d3925,實際 ${bgOf('取消')}`); }
      else if (t === 'offline') { const ok1 = g.kids.find(k => k.a === 'offlineOk'); if (!ok1 || ok1.bg !== ROLE.olive) fix(`${label}/F: 離線戰報「收下」要橄欖綠,實際 ${ok1?.bg}`); }
      else if (t === 'boss') { const sb = g.kids.find(k => k.a === 'startBoss' || k.a === 'bossAsk'); if (sb && sb.bg !== ROLE.olive && sb.bg !== ROLE.gray) fix(`${label}/F: 首領「召喚」要橄欖綠(不能用時灰),實際 ${sb.bg}`); }
      else if (t === 'region') { const tv = g.kids.find(k => k.a === 'regionTravel' || k.a === 'dispatchRegion'); if (tv && tv.bg !== ROLE.olive) fix(`${label}/F: 區域「前往」要橄欖綠,實際 ${tv.bg}`); }
      const cl = g.kids.find(k => k.a === 'close'); if (cl && cl.bg !== ROLE.red) fix(`${label}/F: ${t} 底部「關閉」要紅 #8d3925,實際 ${cl.bg}`);
      if (SHOTS && ['hunter', 'settings', 'confirm'].includes(t)) await page.screenshot({ path: `${SHOTS}/${name}-${t}.png` });
      // 關閉方式:Esc、點遮罩(確認框例外)、底部鈕
      await page.keyboard.press('Escape'); await settle(page, 250);
      let closed = await page.evaluate(() => document.querySelector('#modal-backdrop').classList.contains('hidden'));
      if (t === 'confirm') { if (closed) fix(`${label}/D: 確認框不該被 Esc 關掉(只能按按鈕)`); } else if (!closed) fix(`${label}/D: ${t} 按 Esc 沒關掉`);
      if (!closed) {
        await page.mouse.click(Math.round(v.w / 2), t === 'confirm' ? 6 : 6); await settle(page, 250);
        closed = await page.evaluate(() => document.querySelector('#modal-backdrop').classList.contains('hidden'));
        if (t === 'confirm') { if (closed) fix(`${label}/D: 確認框不該被點遮罩關掉`); } else if (!closed) fix(`${label}/D: ${t} 點遮罩沒關掉`);
      }
      if (!closed) {
        // 用底部鈕關(關閉 or 取消)
        const btn = await page.evaluate(() => { const b = [...document.querySelectorAll('#modal-foot button')].find(e => /關閉|取消|收下/.test(e.textContent)); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
        await page.mouse.click(btn.x, btn.y); await settle(page, 250);
        closed = await page.evaluate(() => document.querySelector('#modal-backdrop').classList.contains('hidden'));
        if (!closed) fix(`${label}/D: ${t} 底部關閉鈕點了沒關掉`);
      }
    }
    await closeAll(page);
  }

  trace(label + ' E');
  // ───── E. 建築詳情 #inspector ─────
  {
    await page.evaluate(() => { globalThis.__mistvaleGame.state.buildings.forge = 2; });
    await L.act(page, 'selectBuilding', 'forge'); await settle(page, 500);
    const g = await ev(page, P => {
      const ins = document.querySelector('#inspector'), bar = document.querySelector('#bottom-bar'), sc = document.querySelector('#inspector-scrim'), br = P.R(bar), ir = P.R(ins);
      const kids = [...document.querySelectorAll('#inspect-foot button')].filter(e => P.vis(e)).map(e => ({ t: e.textContent.trim(), a: e.dataset.action, r: P.R(e), bg: P.bg(e), hit: P.hitsSelf(e) }));
      const x = ins.querySelector('.panel-title [data-action=closeInspector]'), ghost = [...document.querySelectorAll('#inspect-ghost button')].map(e => ({ t: e.textContent.trim(), r: P.R(e), vis: P.vis(e) }));
      const mid = document.elementFromPoint(br.l + 6, br.t + br.h / 2);
      return { mode: ins.dataset.mode, ir, br, vw: innerWidth, vh: innerHeight, kids, xVis: !!x && P.vis(x), ghost, scrim: !!sc && P.vis(sc), scrimBg: sc && getComputedStyle(sc).backgroundColor, coverBar: mid === sc, z: +getComputedStyle(ins).zIndex, title: ins.querySelector('.panel-title').getBoundingClientRect().height };
    });
    const maxH = landscape ? v.h - 24 : Math.min(760, v.h - g.br.h - 32);
    if (g.mode !== 'C') fix(`${label}/E: 建築詳情 data-mode 應為 C,實際 ${g.mode}`);
    if (!g.scrim || !/rgba\(0, 0, 0, 0\.55\)/.test(g.scrimBg) || !g.coverBar) fix(`${label}/E: 建築詳情要有 55% 遮罩蓋住頁籤列(scrim=${g.scrim} ${g.scrimBg} 蓋頁籤列=${g.coverBar})`);
    if (g.xVis) fix(`${label}/E: 建築詳情不該有右上 X`);
    if (!g.ghost.length || !g.ghost[0].vis || !/移動/.test(g.ghost[0].t)) fix(`${label}/E: 「移動位置」要在標題右上的幽靈鈕(${JSON.stringify(g.ghost)})`);
    const wantW = landscape ? Math.min(720, v.w * 0.92) : portraitPhone ? v.w * 0.85 : Math.min(560, v.w * 0.85);
    if (Math.abs(g.ir.w - wantW) > 2.5) fix(`${label}/E: 建築詳情寬 ${g.ir.w.toFixed(0)} 應 ${wantW.toFixed(0)}`);
    if (g.ir.h > maxH + 1.5) fix(`${label}/E: 建築詳情高 ${g.ir.h.toFixed(0)} 超過 ${maxH.toFixed(0)}`);
    if (!landscape && g.ir.b > g.br.t - 15) fix(`${label}/E: 建築詳情底 ${g.ir.b.toFixed(0)} 離頁籤列頂 ${g.br.t.toFixed(0)} 要 ≥16(R2 吃 safe-area)`);
    if (Math.abs((g.ir.l + g.ir.r) / 2 - v.w / 2) > 1.5) fix(`${label}/E: 建築詳情沒有水平置中`);
    const up = g.kids.find(k => k.a === 'upgrade' || k.a === 'construct'), cl = g.kids.find(k => k.a === 'closeInspector');
    if (!cl || cl.bg !== ROLE.red) fix(`${label}/F: 建築詳情「關閉」要紅,實際 ${cl?.bg}`);
    if (up && up.bg !== ROLE.olive && up.bg !== ROLE.gray) fix(`${label}/F: 建築詳情「升級」要橄欖綠(不夠資源時灰),實際 ${up.bg}`);
    if (!up) fix(`${label}/E: 底部列沒有升級鈕`); else if (g.kids.some(k => !k.hit)) fix(`${label}/E: 底部鈕被蓋住`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-inspector.png` });
    await page.keyboard.press('Escape'); await settle(page, 250);
    if (!(await page.evaluate(() => document.querySelector('#inspector').classList.contains('hidden')))) fix(`${label}/E: 建築詳情按 Esc 沒關`);
    await L.act(page, 'selectBuilding', 'forge'); await settle(page, 400);
    await page.mouse.click(Math.round(v.w / 2), 4); await settle(page, 250);
    if (!(await page.evaluate(() => document.querySelector('#inspector').classList.contains('hidden')))) fix(`${label}/E: 建築詳情點遮罩沒關`);
    await L.act(page, 'selectBuilding', 'forge'); await settle(page, 400);
    const cb = await page.evaluate(() => { const b = [...document.querySelectorAll('#inspect-foot button')].find(e => /關閉/.test(e.textContent)); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.click(cb.x, cb.y); await settle(page, 250);
    if (!(await page.evaluate(() => document.querySelector('#inspector').classList.contains('hidden')))) fix(`${label}/E: 建築詳情底部關閉鈕沒關`);
  }

  // ───── I. 安全區(R2/R3):覆寫 --z1-sa* 模擬瀏海／手勢列 ─────
  if (name === 'phone' || name === 'land') {
    await page.evaluate(w => { const st = document.documentElement.style; if (w === 'phone') st.setProperty('--z1-sab', '34px'); else { st.setProperty('--z1-sal', '47px'); st.setProperty('--z1-sar', '47px'); } }, name);
    await page.evaluate(() => { globalThis.__mistvaleGame.state.buildings.forge = 2; });
    await L.act(page, 'selectBuilding', 'forge'); await settle(page, 500);
    const q = await ev(page, P => ({ ir: P.R(document.querySelector('#inspector')), br: P.R(document.querySelector('#bottom-bar')), foot: [...document.querySelectorAll('#inspect-foot button')].map(e => P.R(e)) }));
    if (name === 'phone') {
      if (q.ir.b > q.br.t - 15) fix(`${label}/I: R2 模擬下方安全區 34px,建築詳情底 ${q.ir.b.toFixed(0)} 要在頁籤列頂 ${q.br.t.toFixed(0)} 上方 ≥16`);
      if (q.foot.some(r => r.b > q.br.t)) fix(`${label}/I: R2 底部按鈕被頁籤列蓋到`);
      if (Math.abs(q.br.h - (70 + 34)) > 1.5) fix(`${label}/I: 頁籤列高要含安全區(70+34),實際 ${q.br.h}`);
    } else {
      if (q.ir.l < 47 - 0.5 || q.ir.r > v.w - 47 + 0.5) fix(`${label}/I: R3 建築詳情要在左右安全區 47px 內(${q.ir.l.toFixed(0)}–${q.ir.r.toFixed(0)})`);
    }
    await closeAll(page);
    if (name === 'land') {
      await L.act(page, 'settings'); await settle(page, 400);
      const c = await ev(page, P => P.R(document.querySelector('#modal'))); if (c.l < 47 - 0.5 || c.r > v.w - 47 + 0.5) fix(`${label}/I: R3 C 視窗要在左右安全區內(${c.l.toFixed(0)}–${c.r.toFixed(0)})`);
      await closeAll(page);
      await L.act(page, 'build'); await settle(page, 400);
      const a = await ev(page, P => { const m = document.querySelector('#modal'); return { pl: parseFloat(getComputedStyle(m).paddingLeft), pr: parseFloat(getComputedStyle(m).paddingRight), bar: parseFloat(getComputedStyle(document.querySelector('#bottom-bar')).paddingLeft) }; });
      if (a.pl < 46.5 || a.pr < 46.5 || a.bar < 46.5) fix(`${label}/I: R3 橫向 A 抽屜與頁籤列要留左右安全區(padding ${a.pl}/${a.pr}/${a.bar})`);
      await closeAll(page);
    }
    await page.evaluate(() => { const st = document.documentElement.style; for (const k of ['--z1-sab', '--z1-sal', '--z1-sar']) st.removeProperty(k); });
  }

  trace(label + ' F');
  // ───── F. 其餘按鈕語意色 ─────
  {
    await page.evaluate(() => { const g = globalThis.__mistvaleGame; g.state.hunters.forEach(h => { h.hp = h.maxHp; }); });
    await L.act(page, 'build'); await settle(page);
    const c = await ev(page, P => { const b = document.querySelector('#modal-content .hv-card .hv-btn:not(:disabled)'); const d = document.querySelector('#modal-content .hv-card .hv-btn:disabled'); return { act: b && P.bg(b), dis: d && P.bg(d), lock: d ? getComputedStyle(d, '::before').content : null, hasLockIcon: d ? !!d.querySelector('.hv-lock') : null }; });
    if (c.act && c.act !== ROLE.gold) fix(`${label}/F: 建設卡的清單動作要金棕 #906818,實際 ${c.act}`);
    if (c.dis && c.dis !== ROLE.gray) fix(`${label}/F: 建設卡不能用的鈕要灰 #505050,實際 ${c.dis}`);
    await L.act(page, 'dungeon'); await settle(page);
    const d = await ev(page, P => { const b = document.querySelector('#modal-content [data-action=startDungeon]'), bar = b.closest('.z1-sticky'), sc = document.querySelector('#modal-content'); return { bg: P.bg(b), dis: b.disabled, lock: getComputedStyle(b, '::before').content, sticky: !!bar, pos: bar && getComputedStyle(bar).position, bb: P.R(b), sc: P.R(sc), hit: P.hitsSelf(b) }; });
    if (!d.sticky || d.pos !== 'sticky') fix(`${label}/F: 地下城「出發」要在 .z1-sticky 固定動作列(sticky=${d.sticky} pos=${d.pos})`);
    if (d.bb.b > d.sc.b + 1 || !d.hit) fix(`${label}/F: 地下城「出發」要固定在抽屜底部、點得到(鈕 ${Math.round(d.bb.t)}–${Math.round(d.bb.b)}、內容區底 ${Math.round(d.sc.b)}、hit=${d.hit})`);
    if (d.dis && (d.bg !== ROLE.gray || d.lock === 'none')) fix(`${label}/F: 地下城「出發」不能用時要灰＋鎖頭(bg=${d.bg} lock=${d.lock})`);
    await L.act(page, 'arena'); await settle(page);
    const a = await ev(page, P => { const b = document.querySelector('#modal-content [data-action=startArena]'); const bar = b.closest('.z1-sticky'); return { sticky: !!bar, bg: P.bg(b), dis: b.disabled }; });
    if (!a.sticky) fix(`${label}/F: 競技場「開始」要在 .z1-sticky 固定動作列`);
    // 湊滿 3 位獵人 → 啟用時橄欖綠
    await page.evaluate(() => { const g = globalThis.__mistvaleGame; g.state.arena.hunterIds = g.state.hunters.slice(0, 3).map(h => h.id); g.state.arena.cooldown = 0; g.state.dungeon.hunterIds = g.state.arena.hunterIds.slice(); g.state.dungeon.cooldown = 0; });
    await L.act(page, 'arena'); await settle(page);
    const a2 = await ev(page, P => { const b = document.querySelector('#modal-content [data-action=startArena]'); return { bg: P.bg(b), dis: b.disabled }; });
    if (!a2.dis && a2.bg !== ROLE.olive) fix(`${label}/F: 競技場「開始」啟用時要橄欖綠 #586810,實際 ${a2.bg}`);
    await L.act(page, 'dungeon'); await settle(page);
    const d2 = await ev(page, P => { const b = document.querySelector('#modal-content [data-action=startDungeon]'); return { bg: P.bg(b), dis: b.disabled }; });
    if (!d2.dis && d2.bg !== ROLE.olive) fix(`${label}/F: 地下城「出發」啟用時要橄欖綠 #586810,實際 ${d2.bg}`);
    await closeAll(page);
    await L.act(page, 'recruit'); await settle(page);
    const r = await ev(page, P => { const b = document.querySelector('#modal-content [data-action=recruitVisitor]:not(:disabled)'); return b ? P.bg(b) : null; });
    if (r && r !== ROLE.olive) fix(`${label}/F: 招募「邀請加入」要橄欖綠(確認動作),實際 ${r}`);
    await closeAll(page);
  }

  trace(label + ' G');
  // ───── G. 舊入口、數字鍵、指令面板、子頁籤、徽章 ─────
  if (name === 'desktop' || name === 'phone') {
    const wantType = { build: 'build', hunters: 'hunters', trade: 'trade', craft: 'craft', dungeon: 'dungeon', arena: 'arena', quests: 'quests', inventory: 'inventory', recruit: 'recruit', difficulty: 'difficulty', settings: 'settings', help: 'help', worldmap: 'worldmap', boss: 'boss' };
    for (const [a, t] of Object.entries(wantType)) { await L.act(page, a); await settle(page, 300); const ty = await page.evaluate(() => document.querySelector('#modal-backdrop').classList.contains('hidden') ? null : document.querySelector('#modal').dataset.type); if (ty !== t) fix(`${label}/G: data-action=${a} 應打開 ${t},實際 ${ty}`); await closeAll(page); }
    for (const [k, t] of Object.entries({ 1: 'build', 2: 'dungeon', 3: 'hunters', 4: 'inventory', 5: 'trade', 6: 'arena', 7: 'quests', 8: 'craft' })) { await page.keyboard.press(k); await settle(page, 300); const ty = await page.evaluate(() => document.querySelector('#modal-backdrop').classList.contains('hidden') ? null : document.querySelector('#modal').dataset.type); if (ty !== t) fix(`${label}/G: 數字鍵 ${k} 應打開 ${t},實際 ${ty}`); await closeAll(page); }
    if (name === 'desktop') {
      await page.keyboard.press('Control+k'); await settle(page, 250);
      const rows = await page.evaluate(() => [...document.querySelectorAll('#cmdk .cmdk-row')].map(r => r.dataset.type));
      const need = ['worldmap', 'build', 'hunters', 'recruit', 'trade', 'inventory', 'craft', 'dungeon', 'arena', 'quests', 'codex', 'difficulty', 'settings', 'help'];
      if (need.some(n => !rows.includes(n))) fix(`${label}/G: 指令面板缺項 ${need.filter(n => !rows.includes(n)).join(',')}`);
      await page.keyboard.press('Escape'); await settle(page, 150);
      for (const n of ['arena', 'craft', 'quests']) { await page.keyboard.press('Control+k'); await settle(page, 150); await page.evaluate(n => document.querySelector(`#cmdk .cmdk-row[data-type=${n}]`)?.click(), n); await settle(page, 300); const ty = await page.evaluate(() => document.querySelector('#modal').dataset.type); if (ty !== n) fix(`${label}/G: 指令面板 ${n} 開到 ${ty}`); await closeAll(page); }
    }
    // 子頁籤互通
    await L.act(page, 'dungeon'); await settle(page, 250);
    await page.evaluate(() => document.querySelector('#modal-subtabs [data-subtab=arena]').click()); await settle(page, 300);
    let st = await page.evaluate(() => ({ type: document.querySelector('#modal').dataset.type, tab: document.body.dataset.modalTab, on: document.querySelector('#modal-subtabs .on')?.dataset.subtab }));
    if (st.type !== 'arena' || st.tab !== 'dungeon' || st.on !== 'arena') fix(`${label}/G: 地下城→競技場子頁籤:${JSON.stringify(st)}`);
    await closeAll(page);
    await L.act(page, 'inventory'); await settle(page, 250);
    await page.evaluate(() => document.querySelector('#modal-subtabs [data-subtab=craft]').click()); await settle(page, 300);
    st = await page.evaluate(() => ({ type: document.querySelector('#modal').dataset.type, tab: document.body.dataset.modalTab, on: document.querySelector('#modal-subtabs .on')?.dataset.subtab }));
    if (st.type !== 'craft' || st.tab !== 'inventory' || st.on !== 'craft') fix(`${label}/G: 倉庫→製作子頁籤:${JSON.stringify(st)}`);
    await closeAll(page);
    // 底部頁籤:點選中的再點一次會關
    await page.evaluate(() => document.querySelector('#bottom-bar [data-action=inventory]').click()); await settle(page, 250);
    await page.evaluate(() => document.querySelector('#bottom-bar [data-action=inventory]').click()); await settle(page, 250);
    if (!(await page.evaluate(() => document.querySelector('#modal-backdrop').classList.contains('hidden')))) fix(`${label}/G: 再點一次同一個頁籤應關閉`);
    // 委託徽章:章節完成 → 右上委託圖示出徽章,頁籤列沒有委託格;HUD 任務追蹤點得開委託
    await page.evaluate(() => { const g = globalThis.__mistvaleGame; g.state.quest.complete = true; g.state.quest.claimed = false; });
    await settle(page, 700);
    const qb = await page.evaluate(() => { const b = document.querySelector('#topbar [data-action=quests]'); return { badge: b?.dataset.badge || '', after: b ? getComputedStyle(b, '::after').content : '', barQuest: !!document.querySelector('#bottom-bar [data-action=quests]') }; });
    if (qb.badge !== '1' || qb.after === 'none' || qb.barQuest) fix(`${label}/G: 委託徽章應在右上委託圖示:${JSON.stringify(qb)}`);
    else ok(`${label}/G: 委託徽章在右上圖示、頁籤列沒有委託格`);
    await L.act(page, 'quests'); await settle(page, 250); await closeAll(page);
    const hq = await page.evaluate(() => { const q = document.querySelector('#hv-quest'); q.click(); return document.querySelector('#modal').dataset.type; }); if (hq !== 'quests') fix(`${label}/G: HUD 任務追蹤點擊應開委託,實際 ${hq}`);
    await closeAll(page);
  }

  trace(label + ' H');
  // ───── H. 觸控熱區、toast 位置 ─────
  if (touch) {
    const small = [];
    for (const t of ['build', 'hunters', 'trade', 'inventory', 'dungeon', 'arena', 'settings', 'quests', 'boss', 'confirm', 'hunter']) {
      await openType(page, t);
      const bad = await ev(page, P => [...document.querySelectorAll('#modal button,#modal [data-action],#modal a[href],#modal input,#modal select')].filter(e => P.vis(e) && !e.closest('#toasts')).map(e => ({ n: (e.dataset.action || e.id || e.className || e.tagName) + ':' + (e.textContent || '').trim().slice(0, 6), r: P.R(e) })).filter(o => { const sc = document.querySelector('#modal-content'); const cr = sc.getBoundingClientRect(); const cy = (o.r.t + o.r.b) / 2; if (sc.contains(document.elementFromPoint(o.r.l + 1, cy) || document.body) === false && cy > cr.bottom) return false; return Math.min(o.r.w, o.r.h) < 43.5 && !/range|checkbox/.test(o.n); }));
      for (const b of bad) small.push(`${t}/${b.n}(${Math.round(b.r.w)}×${Math.round(b.r.h)})`);
      await closeAll(page);
    }
    if (small.length) fix(`${label}/H: 觸控熱區 <44px ${small.length} 個:${small.slice(0, 8).join('、')}`); else ok(`${label}/H: 觸控下各面板按鈕熱區 ≥44`);
    const hud = await ev(page, P => [...document.querySelectorAll('#topbar .play-controls button,#topbar .hv-ico,#topbar .population')].filter(e => P.vis(e)).map(e => ({ n: e.id || e.dataset.action || e.className, r: P.R(e) })).filter(o => Math.min(o.r.w, o.r.h) < 43.5));
    if (hud.length) fix(`${label}/H: 頂欄觸控熱區 <44px:${hud.map(o => `${o.n}(${Math.round(o.r.w)}×${Math.round(o.r.h)})`).join('、')}`);
  }
  {
    // C 視窗開著時 toast 在視窗上方遮罩區,不蓋標題
    await openType(page, 'settings');
    await page.evaluate(() => globalThis.__toast('升級完成，獵人 Lv.2', true));
    await settle(page, 400);
    const tt = await ev(page, P => { const ts = [...document.querySelectorAll('#toasts .toast')].filter(e => P.vis(e)); const m = P.R(document.querySelector('#modal')), tr = P.R(document.querySelector('#modal-title')); return { n: ts.length, rects: ts.map(e => P.R(e)), m, tr, host: document.querySelector('#toasts').parentElement.tagName, z: document.body.hasAttribute('data-z1-c') }; });
    if (!tt.n) fix(`${label}/H: C 視窗開著 toast 沒出現`);
    if (tt.n) {
      const ov = tt.rects.filter(r => Math.min(r.r, tt.tr.r) - Math.max(r.l, tt.tr.l) > 0.5 && Math.min(r.b, tt.tr.b) - Math.max(r.t, tt.tr.t) > 0.5);
      if (ov.length) fix(`${label}/H: toast 蓋住 C 視窗標題(toast ${ov[0].t.toFixed(0)}–${ov[0].b.toFixed(0)},標題 ${tt.tr.t.toFixed(0)}–${tt.tr.b.toFixed(0)})`);
      if (tt.host !== 'BODY') fix(`${label}/H: C 視窗開著 toast 不該住進標題列(${tt.host})`);
      if (tt.rects.some(r => r.b > tt.m.t + 14)) fix(`${label}/H: toast 要在視窗上方遮罩區(toast 底 ${Math.max(...tt.rects.map(r => r.b)).toFixed(0)}、視窗頂 ${tt.m.t.toFixed(0)})`);
    }
    await closeAll(page);
  }
  if (SHOTS && ['desktop', 'phone', 'land'].includes(name)) { await L.act(page, 'build'); await settle(page); await page.screenshot({ path: `${SHOTS}/${name}-build.png` }); await closeAll(page); await L.act(page, 'dungeon'); await settle(page); await page.screenshot({ path: `${SHOTS}/${name}-dungeon.png` }); await closeAll(page); }
  if (errs.length) fix(`${label}/H: 頁面有 console／page error:${errs.slice(0, 3).join(' | ')}`); else ok(`${label}: 無 console／page error`);
  } catch (e) { fix(`${label}: 檢查中斷(結構與預期不同):${String(e.message).split(String.fromCharCode(10))[0].slice(0, 120)}`); }
  await ctx.close();
}

await browser.close(); srv.stop();
if (fails.length) { console.log('FAIL z1-shell\n - ' + fails.slice(0, 60).join('\n - ') + (fails.length > 60 ? `\n ...另 ${fails.length - 60} 項` : '')); process.exit(1); }
for (const o of oks) console.log('ok  ' + o);
console.log('PASS z1-shell: 頁籤列 5 格、A 抽屜與 C 置中視窗(遮罩蓋頁籤列、底部按鈕列、Esc／遮罩可關)、建築詳情同套外殼、按鈕語意色、舊入口全部可達、觸控熱區 ≥44、toast 在 C 視窗上方');
