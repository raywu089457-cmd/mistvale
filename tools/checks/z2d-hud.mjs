// z2d-hud.mjs — Z2D(2026-11-12 圖鑑 v2):主 HUD、toast、新手引導、標題畫面、簡體字、小尺寸與橫向版面。每一項都是「改回舊行為就會紅」。
//   H. 主 HUD(規格 a、diff #13):資源數字 16–18px、金幣／星晶旁有小「＋」框(點了開交易／地下城)、資源疊不撞右側圖示、
//      可領獎勵時任務追蹤與委託圖示有紅點／N 徽章(不閃爍)、觸控熱區 ≥44、HUD 字 ≥12px。
//   T. toast(規格 m、diff #16、UX #9):半透明暗帶＋成功金字／失敗紅字、最多 2 行;位置規則(沒開窗在頁籤列上方、C 視窗在視窗上方、A 抽屜在抽屜上方不蓋標題列工具鈕);
//      由按鈕觸發的失敗訊息改成在該按鈕上方出現一行小提示(.z2d-tip)、不出現在螢幕最上方。
//   G. 新手引導(規格 l、diff #17、UX #4):開場是白色像素氣泡＋粗黑框＋尾巴＋大頭像、一次一步、目標頁籤有高亮與手指;人數從資料讀(不寫死「五位」);
//      開場結束後只剩一條主引導(顧問),任務追蹤不閃、沒有「出發吧」toast;開局即完成的委託 01 不當第一步。
//   S. 標題畫面(UX #2):「重新開始」是不顯眼的文字連結,點了先跳確認 C 視窗(標題「重新開始」、說明「會刪除目前存檔」、確認刪除(紅)／取消),取消不刪、確認才刪;「繼續遊戲」正常。
//   C. 簡體字(UX #17):src/ 顯示文字沒有簡體字。
//   L. 小尺寸與橫向(round3-mobile R6/R7/R9/R10/R11):667×375 與 740×360 的獵人小卡不蓋縮放鈕／徽章／任務、橫向委託面板不被頁籤列切到、
//      橫向難度／招募主按鈕看得到、平板 768×1024／1024×768 手動操控清單不蓋 HUD 且鈕 ≥44、#placement 不壓 #hv-left、360×640／375×667 頂部堆疊 ≤ 38% 高。
//   用法:node tools/checks/z2d-hud.mjs(TARGET 空＝自己開臨時伺服器;TARGET=別台可量修前版本)。SHOTS_DIR=資料夾 會存截圖。
import * as L from './fix-a-lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
const srv = await L.startServer(); const browser = await L.launch();
const fails = [], oks = []; const fix = m => fails.push(m), ok = m => oks.push(m);
const SHOTS = process.env.SHOTS_DIR || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const base = srv.url.replace(/\?.*/, '');
const urlPreview = base + '?preview=1';
const VIEWS = {
  desktop: { w: 1440, h: 900 }, phone: { w: 390, h: 844, mobile: true }, land: { w: 844, h: 390, mobile: true },
  s360: { w: 360, h: 640, mobile: true }, s375: { w: 375, h: 667, mobile: true }, l667: { w: 667, h: 375, mobile: true }, l740: { w: 740, h: 360, mobile: true },
  pad768: { w: 768, h: 1024, mobile: true }, pad1024: { w: 1024, h: 768, mobile: true },
};
const only = (process.env.VIEWS || Object.keys(VIEWS).join(',')).split(',');
const want = (process.env.PARTS || 'H,T,G,S,C,L').split(',');

const PAGE = () => {
  const R = e => { if (!e) return null; const q = e.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height }; };
  const vis = e => { if (!e) return false; const q = e.getBoundingClientRect(); if (q.width < 1 || q.height < 1) return false; for (let p = e; p; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0 || p.hidden || p.classList?.contains('hidden')) return false; } return true; };
  const inter = (a, b) => !!a && !!b && Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5;
  const rgb = s => { const m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const open = (a, id) => { const el = document.createElement('button'); el.dataset.action = a; if (id != null) el.dataset.id = id; el.style.display = 'none'; document.body.append(el); el.click(); el.remove(); };
  const name = e => (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/)[0] : '') || e.tagName;
  const cn = n => ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][n] ?? String(n);
  return { R, vis, inter, rgb, open, name, cn };
};
const ev = (page, fn, arg) => page.evaluate(`(async()=>{const P=(${PAGE.toString()})();const f=${fn.toString()};return await f(P,${JSON.stringify(arg ?? null)});})()`);
const settle = (page, ms = 450) => page.waitForTimeout(ms);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
const closeAll = async page => { await page.evaluate(() => { const b = document.querySelector('#modal-backdrop:not(.hidden)'); if (b) { const m = document.querySelector('#modal'); if (m.dataset.kind === 'confirm') document.querySelector('[data-action=confirmNo]')?.click(); else document.querySelector('#modal [data-action=close]')?.click(); } if (!document.querySelector('#inspector').classList.contains('hidden')) document.querySelector('[data-action=closeInspector]')?.click(); document.querySelector('#unit-card .uc-x')?.click(); }); await settle(page, 250); };
const newPage = async (v, extra) => { const ctx = await L.newCtx(browser, v); const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push('pageerror ' + String(e).slice(0, 160))); page.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text().slice(0, 160)); }); return { ctx, page, errs }; };
const prep = page => page.evaluate(() => { const g = globalThis.__mistvaleGame; for (const k of ['resources', 'buildings', 'heal']) g.cheat(k); g.state.paused = true; });

// ───────────────────────────── C. 簡體字(純檔案掃描)
if (want.includes('C')) {
  const chars = Array.from('战选门东发无说时个为这们会对开关进过还点经样动当从实现体长问间给让请认记设计话语读听见观觉条转钱银铁锁错');
  const root = L.ROOT; const bad = [];
  for (const f of fs.readdirSync(path.join(root, 'src'))) {
    if (!/\.(js|html)$/.test(f) || /^(game|world|main|data|gl-renderer)\.js$/.test(f)) continue;   // 舊版 Three.js 檔不管
    const t = fs.readFileSync(path.join(root, 'src', f), 'utf8');
    for (const c of chars) if (t.includes(c)) bad.push(`${f}:${c}`);
  }
  if (bad.length) fix('C 簡體字還在 src/:' + bad.join(' ')); else ok('C src/ 沒有簡體字');
}

for (const name of only) {
  const v = VIEWS[name]; if (!v) continue;
  const touch = !!v.mobile, landscape = v.h <= 520, portraitPhone = v.w <= 760 && v.h > 520, label = `${name}(${v.w}×${v.h})`;
  const small = name === 's360' || name === 's375', hudViews = ['desktop', 'phone', 'land', 's360', 's375'], toastViews = ['desktop', 'phone', 'land'];
  const smallLand = name === 'l667' || name === 'l740', pad = name === 'pad768' || name === 'pad1024';
  const { ctx, page, errs } = await newPage(v);
  try {
    await L.boot(page, urlPreview); await prep(page); await settle(page, 300);

    // ───────────── H. 主 HUD
    if (want.includes('H') && hudViews.includes(name)) {
      const r = await ev(page, P => {
        const o = {}; const g = document.querySelector('#gold'), cs = getComputedStyle(g);
        o.font = parseFloat(cs.fontSize); o.tre = P.R(document.querySelector('#topbar .treasury'));
        o.plus = [...document.querySelectorAll('#topbar .treasury .res-plus')].map(e => ({ k: e.dataset.plus, vis: P.vis(e), r: P.R(e), before: getComputedStyle(e, '::before').content }));
        const others = ['#topbar .hv-tr1', '#topbar .hv-tr2', '#topbar #region-badge'].map(s => [s, P.R(document.querySelector(s))]);
        o.overlap = others.filter(([s, q]) => q && P.inter(o.tre, q)).map(([s]) => s);
        o.sizes = ['#gold', '#gems', '#wood', '#ore'].map(s => parseFloat(getComputedStyle(document.querySelector(s)).fontSize));
        const small = []; for (const e of document.querySelectorAll('#topbar *,#hv-left *,.hv-actions *')) { if (!P.vis(e) || !(e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))) continue; const fs0 = parseFloat(getComputedStyle(e).fontSize); if (fs0 < 12) small.push(P.name(e) + ':' + fs0); } o.small = small;
        o.hits = [...document.querySelectorAll('#topbar button,.hv-actions .hv-act,#hv-quest,#game-ui .view-tools button')].filter(P.vis).map(e => { const q = P.R(e); return { n: P.name(e), w: Math.round(q.w), h: Math.round(q.h) }; });
        return o;
      });
      if (!(r.font >= 16 && r.font <= 18)) fix(`${label} H 金幣數字 ${r.font}px 不在 16–18`); else ok(`${label} H 數字 ${r.font}px`);
      if (r.sizes.some(s => s < 16 || s > 18)) fix(`${label} H 四種資源數字不是都在 16–18px:${r.sizes.join('/')}`);
      if (r.plus.length !== 2 || r.plus.some(p => !p.vis)) fix(`${label} H 金幣／星晶旁沒有兩個可見的「＋」框(找到 ${r.plus.length})`);
      else {
        if (r.plus.some(p => p.before === 'none' || p.before === 'normal')) fix(`${label} H ＋框沒有畫出來(::before 空)`);
        if (r.plus.some(p => p.r.l < r.tre.l - 1 || p.r.r > r.tre.r + 1)) fix(`${label} H ＋框超出資源疊`);
      }
      if (r.overlap.length) fix(`${label} H 資源疊與右側 ${r.overlap.join(',')} 重疊`);
      if (r.small.length) fix(`${label} H HUD 有 <12px 的字:${r.small.slice(0, 4).join(' ')}`);
      if (touch) { const bad = r.hits.filter(h => (h.w < 44 || h.h < 44)); if (bad.length) fix(`${label} H 觸控熱區 <44px:${bad.map(b => `${b.n} ${b.w}×${b.h}`).join(' ')}`); else ok(`${label} H 熱區 ≥44(${r.hits.length} 個)`); }
      // ＋ 的點擊:金幣→交易、星晶→地下城
      for (const [k, type] of [['gold', 'trade'], ['gems', 'dungeon']]) {
        const pos = await ev(page, (P, k) => { const e = document.querySelector(`#topbar .treasury .res-plus[data-plus="${k}"]`); if (!e) return null; const q = P.R(e); return { x: q.l + q.w / 2, y: q.t + q.h / 2 }; }, k);
        if (!pos) { fix(`${label} H 找不到 ${k} 的 ＋`); continue; }
        if (touch) await page.touchscreen.tap(pos.x, pos.y); else await page.mouse.click(pos.x, pos.y);
        await settle(page, 450);
        const t = await page.evaluate(() => ({ open: !document.querySelector('#modal-backdrop').classList.contains('hidden'), type: document.querySelector('#modal')?.dataset.type }));
        if (!t.open || t.type !== type) fix(`${label} H 點 ${k} 的 ＋ 開的是 ${t.open ? t.type : '沒開'},應是 ${type}`); else ok(`${label} H ${k}＋ → ${type}`);
        await closeAll(page);
      }
      // 紅點／N 徽章:任務可領時追蹤與委託圖示
      await page.evaluate(() => { const s = globalThis.__mistvaleGame.state; s.quest = { ...(s.quest || {}), complete: true, claimed: false }; });
      await settle(page, 900);
      const bd = await ev(page, P => {
        const q = document.querySelector('#hv-quest'), hd = q.querySelector('.hq-head'), ic = document.querySelector('#topbar .hv-quests');
        return { ready: q.classList.contains('ready'), before: getComputedStyle(hd, '::before').content, w: parseFloat(getComputedStyle(hd, '::before').width), anim: getComputedStyle(q.querySelector('.hq-title')).animationName, icBadge: ic?.dataset.badge || '', icAfter: ic ? getComputedStyle(ic, '::after').content : '' };
      });
      if (!bd.ready) fix(`${label} H 任務追蹤沒進 ready 狀態(測試前置)`);
      else {
        if (!/^"?\d+\+?"?$/.test(bd.before) || !(bd.w >= 14)) fix(`${label} H 任務追蹤沒有 N 徽章(::before ${bd.before} 寬 ${bd.w})`); else ok(`${label} H 追蹤 N 徽章`);
        if (bd.anim !== 'none') fix(`${label} H 任務追蹤在可領時還在閃爍(${bd.anim});引導只留一條主聲音`);
        if (!bd.icBadge || bd.icAfter === 'none') fix(`${label} H 委託圖示沒有 N 徽章(${bd.icBadge}/${bd.icAfter})`);
      }
      await shot(page, `h-${name}`);
    }

    // ───────────── T. toast
    if (want.includes('T') && toastViews.includes(name)) {
      const read = () => ev(page, P => {
        const ts = [...document.querySelectorAll('#toasts .toast')].filter(P.vis); const t = ts[ts.length - 1]; if (!t) return null;
        const tx = t.querySelector('.toast-tx'), cs = getComputedStyle(t), tc = getComputedStyle(tx), lh = parseFloat(tc.lineHeight) || parseFloat(tc.fontSize) * 1.3;
        return { r: P.R(t), bg: P.rgb(cs.backgroundColor), color: P.rgb(tc.color), lines: Math.round(tx.getBoundingClientRect().height / lh), btns: [...document.querySelectorAll('#modal button,#modal [data-action],#bottom-bar button,#modal #modal-title')].filter(P.vis).map(e => P.R(e)).filter(q => P.inter(P.R(t), q)).length, tab: P.R(document.querySelector('#bottom-bar')), modal: P.vis(document.querySelector('#modal')) ? P.R(document.querySelector('#modal')) : null, insp: P.vis(document.querySelector('#inspector')) ? P.R(document.querySelector('#inspector')) : null };
      });
      const clearToasts = () => page.evaluate(() => { document.querySelectorAll('#toasts .toast').forEach(e => e.remove()); });
      // 樣式:成功金字／失敗紅字／半透明暗帶／最多 2 行
      await page.evaluate(() => globalThis.__toast('收入 120 金幣', true)); await settle(page, 450);
      let t = await read();
      if (!t) fix(`${label} T 沒有 toast`); else {
        const dark = t.bg && t.bg.a > 0.2 && t.bg.a < 0.95 && Math.max(t.bg.r, t.bg.g, t.bg.b) <= 60;
        if (!dark) fix(`${label} T 成功 toast 底不是半透明暗帶(${JSON.stringify(t.bg)})`); else ok(`${label} T 半透明暗帶 a=${t.bg.a}`);
        if (!(t.color.r >= 200 && t.color.g >= 150 && t.color.b <= 150)) fix(`${label} T 成功字不是金色(${JSON.stringify(t.color)})`);
        if (!(t.tab.t >= t.r.b - 1)) fix(`${label} T 沒開窗時 toast 蓋到頁籤列(toast 底 ${Math.round(t.r.b)} 頁籤列頂 ${Math.round(t.tab.t)})`);
      }
      await clearToasts();
      await page.evaluate(() => globalThis.__toast('資源不足，這棟建築還缺金幣 250、鐵礦 10、木材 40，先去狩獵或到交易所補貨再回來蓋蓋看，不用急，慢慢來，還有很多事可以做。', false)); await settle(page, 450);
      t = await read();
      if (!t) fix(`${label} T 沒有失敗 toast`); else {
        if (!(t.color.r >= 200 && t.color.g <= 140 && t.color.b <= 130)) fix(`${label} T 失敗字不是紅色(${JSON.stringify(t.color)})`); else ok(`${label} T 失敗紅字`);
        if (t.lines > 2) fix(`${label} T toast 超過 2 行(${t.lines})`); else ok(`${label} T 最多 2 行(${t.lines})`);
      }
      await clearToasts();
      // 位置:C 視窗開著 → 在視窗上方
      await L.act(page, 'quests'); await settle(page);
      await page.evaluate(() => globalThis.__toast('收入 120 金幣', true)); await settle(page, 450);
      t = await read();
      if (t && t.modal && t.btns) fix(`${label} T C 視窗開著 toast 蓋住視窗標題或 ${t.btns} 顆按鈕(toast 底 ${Math.round(t.r.b)} 視窗頂 ${Math.round(t.modal.t)})`);
      else ok(`${label} T C 視窗 toast 不蓋視窗標題與按鈕`);
      await clearToasts(); await closeAll(page);
      // 位置:A 抽屜開著 → 不蓋標題列工具鈕(R13)
      await L.act(page, 'hunters'); await settle(page, 600);
      await page.evaluate(() => globalThis.__toast('收入 120 金幣', true)); await settle(page, 450);
      t = await read();
      const tools = await ev(page, P => [...document.querySelectorAll('#modal .hv-tool,#modal .modal-title button,#modal .modal-title [data-action]')].filter(P.vis).map(e => P.R(e)));
      const hit = t ? tools.filter(q => !(t.r.r < q.l || t.r.l > q.r || t.r.b < q.t || t.r.t > q.b)).length : -1;
      if (!t) fix(`${label} T A 抽屜開著沒有 toast`);
      else if (hit > 0) fix(`${label} T A 抽屜開著 toast 蓋住 ${hit} 顆標題列工具鈕(R13)`);
      else if (t.modal && !landscape && t.r.b > t.modal.t + 1) fix(`${label} T A 抽屜開著 toast 沒有在抽屜上方(toast 底 ${Math.round(t.r.b)} 抽屜頂 ${Math.round(t.modal.t)})`);
      else ok(`${label} T A 抽屜 toast 不蓋工具鈕`);
      await shot(page, `t-A-${name}`);
      await clearToasts(); await closeAll(page);

      // 失敗訊息由按鈕觸發 → 在該按鈕上方一行小提示
      await L.act(page, 'dungeon'); await settle(page, 700);
      const picks = await page.evaluate(() => [...document.querySelectorAll('#modal [data-action=toggleDungeonHunter]')].length);
      if (picks < 4) fix(`${label} T(前置)地下城清單只有 ${picks} 位獵人,無法測第 4 位`);
      else {
        for (let i = 0; i < 3; i++) { await page.evaluate(i => document.querySelectorAll('#modal [data-action=toggleDungeonHunter]')[i].click(), i); await settle(page, 200); }
        await page.evaluate(() => document.querySelectorAll('#modal [data-action=toggleDungeonHunter]')[3].scrollIntoView({ block: 'center' })); await settle(page, 250);
        const target = await ev(page, P => { const b = document.querySelectorAll('#modal [data-action=toggleDungeonHunter]')[3]; return P.R(b); });
        await page.evaluate(() => { const b = document.querySelectorAll('#modal [data-action=toggleDungeonHunter]')[3]; b.click(); });
        await settle(page, 400);
        const tip = await ev(page, P => { const e = document.querySelector('.z2d-tip'); const all = [...document.querySelectorAll('#toasts .toast.kind-error')].filter(P.vis).length; if (!e || !P.vis(e)) return { tip: false, all }; const cs = getComputedStyle(e); return { tip: true, r: P.R(e), text: e.textContent, all, color: P.rgb(cs.color), role: e.getAttribute('role') }; });
        if (!tip.tip) fix(`${label} T 按鈕觸發的失敗訊息沒有在按鈕旁出現 .z2d-tip(全域紅 toast ${tip.all} 則)`);
        else {
          const gapAbove = target.t - tip.r.b, gapBelow = tip.r.t - target.b, cx = (tip.r.l + tip.r.r) / 2;
          const near = (gapAbove >= -2 && gapAbove <= 28) || (gapBelow >= -2 && gapBelow <= 28);
          if (!near) fix(`${label} T 小提示離按鈕太遠(上 ${Math.round(gapAbove)} 下 ${Math.round(gapBelow)})`);
          else if (cx < target.l - tip.r.w || cx > target.r + tip.r.w) fix(`${label} T 小提示水平沒對著按鈕`);
          else ok(`${label} T 失敗小提示貼著按鈕(上 ${Math.round(gapAbove)}px)`);
          if (tip.all) fix(`${label} T 小提示出現時螢幕最上方還有一則紅 toast(${tip.all})`);
          if (!/最多/.test(tip.text)) fix(`${label} T 小提示內容不對:${tip.text}`);
          if (tip.role !== 'alert' && tip.role !== 'status') fix(`${label} T 小提示沒有 role`);
          if (!(tip.color.r >= 200 && tip.color.g <= 160)) fix(`${label} T 小提示不是紅字(${JSON.stringify(tip.color)})`);
          await shot(page, `t-tip-${name}`);
        }
      }
      await closeAll(page);
    }

    // ───────────── L. 小尺寸與橫向
    if (want.includes('L')) {
      if (small) {
        await page.evaluate(() => { const g = globalThis.__mistvaleGame; g.state.paused = true; for (const m of ['農田已建成。', '獵人艾登升到 Lv.4。', '旅人到訪了村莊。']) g.log?.(m, 'success'); });
        await settle(page, 1200);
        const r = await ev(page, P => {
          const q = s => document.querySelector(s), vh = innerHeight, bottoms = ['#topbar', '#hv-quest', '#hv-advisor', '#notice-feed'].map(s => q(s) && P.vis(q(s)) ? P.R(q(s)).b : 0);
          const acts = q('.hv-actions'), vt = q('#game-ui .view-tools');
          return { stack: Math.max(...bottoms), vh, acts: P.R(acts), vt: P.R(vt), tab: P.R(q('#bottom-bar')) };
        });
        const pct = r.stack / r.vh * 100;
        if (pct > 38) fix(`${label} L(R11)頂部堆疊占 ${pct.toFixed(0)}% 高(>38%)`); else ok(`${label} L 頂部堆疊 ${pct.toFixed(0)}%`);
        if (r.acts.b > r.vt.t + 1.5) fix(`${label} L(R11)行動徽章(底 ${Math.round(r.acts.b)})壓到縮放鈕(頂 ${Math.round(r.vt.t)})`);   // 2026-11-27 HUD 簡化:召喚首領／競技場與縮放鈕併成同一條膠囊,上下段貼在一起(只准重疊上框 1px)
        if (r.acts.w > 60) fix(`${label} L(R11)行動徽章寬 ${Math.round(r.acts.w)}px 太寬,壓地名(≤60)`);
        await shot(page, `l-stack-${name}`);
        // R12:建築詳情開著時 #hv-left 是否被蓋(C 視窗有遮罩 → 不算 bug,只量測)
        await L.act(page, 'moveBuilding', 'forge').catch(() => {}); await page.evaluate(() => document.querySelector('[data-action=cancelMove]')?.click());
        await L.act(page, 'selectBuilding', 'forge'); await settle(page, 700);
        const r12 = await ev(page, P => { const i = document.querySelector('#inspector'); if (!i || i.classList.contains('hidden')) return null; const hl = document.querySelector('#hv-left'); return { mode: i.dataset.mode, overlap: P.inter(P.R(i), P.R(hl)), scrim: getComputedStyle(document.querySelector('#inspector-scrim')).display !== 'none', hlVisible: getComputedStyle(hl).visibility }; });
        console.error(`[z2d] ${label} R12 建築詳情:${JSON.stringify(r12)}`);
        await closeAll(page);
      }
      if (smallLand) {
        await page.evaluate(() => { globalThis.__mistvaleSelect('hunter:' + globalThis.__mistvaleGame.state.hunters[0].id); }); await settle(page, 400); await L.act(page, 'selInfo'); await settle(page, 500);
        const r = await ev(page, P => {
          const c = document.querySelector('#unit-card'); if (!c) return null; const cr = P.R(c);
          const bad = [...document.querySelectorAll('.view-tools button,.hv-actions button,#hv-quest,#topbar .hv-tr button')].filter(e => P.vis(e) && P.inter(cr, P.R(e))).map(P.name);
          return { cr, bad, w: cr.w, vw: innerWidth };
        });
        if (!r) fix(`${label} L(前置)沒有小卡`); else if (r.bad.length) fix(`${label} L(R6)獵人小卡蓋住 ${[...new Set(r.bad)].join(',')}`); else ok(`${label} L 小卡不蓋縮放鈕／徽章／任務(寬 ${Math.round(r.w)})`);
        await shot(page, `l-unit-${name}`); await closeAll(page);
        // R10 左側委託面板
        await page.evaluate(() => { const b = document.querySelector('#reopen-left'); if (b && !b.classList.contains('hidden')) b.click(); }); await settle(page, 500);
        const lp = await ev(page, P => { const c = document.querySelector('#left-panel'); if (!c || !P.vis(c)) return null; const tb = P.R(document.querySelector('#bottom-bar')); const cr = P.R(c); const qb = P.R(document.querySelector('#quest-button')), pr = P.R(c); return { cr, tabTop: tb.t, cut: cr.b > tb.t + 0.5, claimLow: qb ? qb.b > Math.min(cr.b, tb.t) + 0.5 : true, claim: qb }; });
        if (!lp) fix(`${label} L(前置)左側面板沒打開`); else if (lp.cut || lp.claimLow) fix(`${label} L(R10)左側委託面板底 ${Math.round(lp.cr.b)}／領取鈕底 ${Math.round(lp.claim?.b ?? -1)} 被頁籤列(頂 ${Math.round(lp.tabTop)})切到`); else ok(`${label} L 左側面板與領取鈕在頁籤列上方`);
        await shot(page, `l-left-${name}`);
        await page.evaluate(() => document.querySelector('#left-panel [data-action=toggleLeft]')?.click()); await settle(page, 300);
        // R7 招募／難度／首領
        await L.act(page, 'recruit'); await settle(page, 700);
        const rc = await ev(page, P => { const c = document.querySelector('#modal-content'), m = document.querySelector('#modal'); if (!c) return null; const cr = P.R(c); const bs = [...c.querySelectorAll('[data-action=recruitWanderer]')].filter(P.vis).map(e => P.R(e)); const tb = P.R(document.querySelector('#bottom-bar')); const lim = m.dataset.mode === 'C' ? innerHeight : tb.t; return { n: bs.length, hidden: bs.filter(q => q.b > Math.min(cr.b, lim) + 1 || q.t < cr.t - 1).length }; });
        if (!rc || !rc.n) fix(`${label} L(前置)招募面板沒有招募鈕`); else if (rc.hidden) fix(`${label} L(R7)橫向招募主按鈕 ${rc.hidden}/${rc.n} 顆被切掉／在頁籤列下(要捲才看到)`); else ok(`${label} L 招募主按鈕看得到`);
        await shot(page, `l-recruit-${name}`); await closeAll(page);
        await L.act(page, 'difficulty'); await settle(page, 600);
        const df = await ev(page, P => { const c = document.querySelector('#modal-content'); if (!c) return null; const cr = P.R(c); const b = [...c.querySelectorAll('[data-action=setDifficulty]')].filter(P.vis)[0]; const f = document.querySelector('#modal-foot,.z1-foot'); const fr = f && P.vis(f) ? P.R(f) : null; if (!b) return { none: true }; const q = P.R(b); return { top: q.t >= cr.t - 1 && q.b <= (fr ? fr.t : innerHeight) + 1, q, cr, vh: innerHeight }; });
        if (!df || df.none) console.error(`[z2d] ${label} 難度面板沒有 setDifficulty 鈕(可能是目前難度)`); else if (!df.top) fix(`${label} L(R7)橫向難度面板的主按鈕不在第一屏(要捲才看到:${Math.round(df.q.t)}–${Math.round(df.q.b)},內容區 ${Math.round(df.cr.t)}–${Math.round(df.cr.b)})`); else ok(`${label} L 難度主按鈕在第一屏`);
        await closeAll(page);
        await L.act(page, 'boss'); await settle(page, 600);
        const bs = await ev(page, P => { const m = document.querySelector('#modal'); const b = document.querySelector('#modal [data-action=startBoss],#modal [data-action=bossAsk]'); return { m: P.R(m), b: b && P.vis(b) ? P.R(b) : null, vh: innerHeight }; });
        if (bs.m.b > bs.vh + 0.5) fix(`${label} L(R7)首領面板底 ${Math.round(bs.m.b)} 超出視窗高 ${bs.vh}`); else if (!bs.b || bs.b.b > bs.vh) fix(`${label} L(R7)首領召喚鈕在視窗外`); else ok(`${label} L 首領面板在視窗內`);
        await closeAll(page);
      }
      if (pad) {
        await L.act(page, 'settings'); await settle(page, 400); await page.evaluate(() => document.querySelector('[data-action=pilotLab]')?.click()); await settle(page, 700);
        const r = await ev(page, P => {
          const c = document.querySelector('#pilotlab'); if (!c) return null; const cr = P.R(c);
          const bad = [...document.querySelectorAll('#topbar button,#topbar .treasury,.view-tools button,.hv-actions button,#hv-quest')].filter(e => P.vis(e) && !c.contains(e) && P.inter(cr, P.R(e))).map(P.name);
          const small = [...c.querySelectorAll('button')].filter(P.vis).map(e => Math.round(e.getBoundingClientRect().height)).filter(h => h < 44);
          return { bad, small: small.length, min: Math.min(...[...c.querySelectorAll('button')].filter(P.vis).map(e => e.getBoundingClientRect().height)) };
        });
        if (!r) fix(`${label} L(前置)手動操控清單沒開`); else {
          if (r.bad.length) fix(`${label} L(R9)手動操控清單蓋住 HUD:${[...new Set(r.bad)].join(',')}`); else ok(`${label} L 手動操控清單不蓋 HUD`);
          if (r.small) fix(`${label} L(R9)手動操控清單有 ${r.small} 顆鈕 <44px(最小 ${Math.round(r.min)})`); else ok(`${label} L 手動操控鈕 ≥44`);
        }
        await shot(page, `l-pilot-${name}`);
        await page.evaluate(() => { document.querySelector('#pilotlab [data-pilot=close],#pilotlab [data-pilot=stop]')?.click(); try { globalThis.__mistvaleGame.pilotStop?.(); } catch { } }); await settle(page, 300);
        await L.act(page, 'moveBuilding', 'forge'); await settle(page, 500);
        const pl = await ev(page, P => { const c = document.querySelector('#placement'); if (!c || !P.vis(c)) return null; const cr = P.R(c); return [...document.querySelectorAll('#hv-left,#hv-left>*,.hv-actions,.view-tools,#topbar .treasury')].filter(e => P.vis(e) && P.inter(cr, P.R(e))).map(P.name); });
        if (pl === null) fix(`${label} L(前置)沒有放置提示`); else if (pl.length) fix(`${label} L(R9)#placement 壓到 ${pl.join(',')}`); else ok(`${label} L #placement 不壓 HUD`);
        await shot(page, `l-place-${name}`);
      }
    }
    if (errs.length) fix(`${label} 頁面有 console／page error:${errs.slice(0, 2).join(' | ')}`);
  } catch (e) { fix(`${label} 例外:${String(e.message || e).split('\n')[0].slice(0, 200)}`); }
  await ctx.close();
}

// ───────────── G／S:新玩家與回訪玩家(不帶 ?preview,要看到標題畫面)
if (want.includes('G') || want.includes('S')) {
  for (const name of ['phone', 'desktop', 'land']) {
    const v = VIEWS[name]; if (!only.includes(name)) continue;
    const touch = !!v.mobile, label = `${name}(${v.w}×${v.h})`;
    const ctx = await L.newCtx(browser, v); const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push('pageerror ' + String(e).slice(0, 160))); page.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text().slice(0, 160)); });
    try {
      await page.goto(base + '?fresh=' + Date.now(), { waitUntil: 'commit', timeout: 120000 });
      await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 90000 });
      await page.waitForSelector('#title-screen', { timeout: 8000 });
      if (want.includes('G')) {
        const t0 = await page.evaluate(() => ({ cont: document.querySelector('[data-ts=continue]')?.textContent.trim(), fresh: !!document.querySelector('[data-ts=fresh]') }));
        if (t0.fresh) fix(`${label} G 全新玩家的標題畫面不該有「重新開始」`);
        await page.evaluate(() => document.querySelector('#title-screen [data-ts=continue]').click());
        await page.waitForFunction(() => document.querySelector('#modal')?.dataset.type === 'welcome' && !document.querySelector('#modal-backdrop').classList.contains('hidden'), null, { timeout: 6000 }).catch(() => { });
        await settle(page, 700);
        const st = () => ev(page, P => {
          const b = document.querySelector('#modal .z2d-bubble'); if (!b) return { bubble: false, type: document.querySelector('#modal')?.dataset.type };
          const cs = getComputedStyle(b), steps = [...document.querySelectorAll('#modal .z2d-step')].filter(P.vis), face = document.querySelector('#modal .hv-face');
          const tg = [...document.querySelectorAll('[data-z2d-target]')].filter(P.vis), fin = [...document.querySelectorAll('.z2d-finger')].filter(P.vis);
          const btns = [...document.querySelectorAll('#modal [data-action=welcomeNext],#modal [data-action=welcomeStart],#modal [data-action=welcomeHelp]')].filter(P.vis);
          return { bubble: true, bg: P.rgb(cs.backgroundColor), border: parseFloat(cs.borderTopWidth), bcol: P.rgb(cs.borderTopColor), color: P.rgb(getComputedStyle(b.querySelector('.z2d-step')).color), steps: steps.length, text: steps.map(s => s.textContent).join('|'), after: getComputedStyle(b, '::after').content, face: face ? P.R(face) : null, listCards: document.querySelectorAll('#modal .welcome-step').length,
            targets: tg.map(e => ({ n: P.name(e), r: P.R(e), act: e.dataset.action })), fingers: fin.length, btns: btns.map(e => ({ a: e.dataset.action, t: e.textContent.trim(), h: Math.round(e.getBoundingClientRect().height) })), n: globalThis.__mistvaleGame.state.hunters.length, cn: P.cn(globalThis.__mistvaleGame.state.hunters.length), step: document.querySelector('#modal .z2d-step')?.dataset.step };
        });
        let s = await st();
        if (!s.bubble) fix(`${label} G 開場不是氣泡(.z2d-bubble 不存在,modal=${s.type})`);
        else {
          if (!(s.bg.r >= 235 && s.bg.g >= 235 && s.bg.b >= 225 && s.bg.a >= 0.95)) fix(`${label} G 氣泡不是白底(${JSON.stringify(s.bg)})`);
          if (!(s.border >= 3 && s.bcol.r <= 40 && s.bcol.g <= 40)) fix(`${label} G 氣泡不是粗黑框(${s.border}px ${JSON.stringify(s.bcol)})`);
          if (!(s.color.r <= 60 && s.color.g <= 60)) fix(`${label} G 氣泡字不是黑字(${JSON.stringify(s.color)})`);
          if (s.after === 'none' || s.after === 'normal') fix(`${label} G 氣泡沒有尾巴(::after)`);
          if (!s.face || s.face.w < 64) fix(`${label} G 頭像太小(${s.face ? Math.round(s.face.w) : '無'}px,應 ≥64 約 3 倍)`);
          if (s.steps !== 1) fix(`${label} G 同時顯示 ${s.steps} 步,應一次一步`);
          if (s.listCards) fix(`${label} G 還有 ${s.listCards} 張步驟卡(.welcome-step)`);
          if (/五位|5 位/.test(s.text) || /五位/.test(await page.evaluate(() => document.querySelector('#modal-content').textContent))) fix(`${label} G 文字還有寫死的「五位」`);
          // 逐步走完:每步記錄,最後一步有 welcomeStart
          let seen = [s.step], guard = 0, sawNum = new RegExp(s.cn + '位').test(s.text), sawTarget = s.targets.length > 0, sawFinger = s.fingers > 0, bad = [];
          while (guard++ < 8) {
            s = await st(); if (!s.bubble) break;
            if (new RegExp(s.cn + '位').test(s.text)) sawNum = true;
            if (s.targets.length > 1) bad.push(`第 ${s.step} 步有 ${s.targets.length} 個高亮目標`);
            if (s.targets.length) { sawTarget = true; if (s.fingers < 1) bad.push(`第 ${s.step} 步高亮沒有手指`); else sawFinger = true; }
            if (touch && s.btns.some(b => b.h < 44)) bad.push(`第 ${s.step} 步按鈕 <44px`);
            if (!s.btns.length) { bad.push(`第 ${s.step} 步沒有按鈕`); break; }
            const nextB = s.btns.find(b => b.a === 'welcomeNext');
            if (guard === 1) await shot(page, `g-bubble-${name}`);
            if (!nextB) break;
            await page.evaluate(() => document.querySelector('#modal [data-action=welcomeNext]').click()); await settle(page, 350);
            const s2 = await st(); if (s2.bubble) seen.push(s2.step); if (s2.step === s.step) { bad.push('按下一步沒有換步'); break; }
          }
          if (bad.length) fix(`${label} G ${bad.join(';')}`);
          if (!sawNum) fix(`${label} G 文字沒有從資料讀獵人人數(應出現「${s.cn}位」)`);
          if (seen.length < 2 || seen.length > 6) fix(`${label} G 引導步數 ${seen.length} 不合理`); else ok(`${label} G 引導 ${seen.length} 步,一次一步`);
          if (!sawTarget) fix(`${label} G 沒有任何步驟高亮目標頁籤／圖示`); else if (!sawFinger) fix(`${label} G 高亮沒有手指圖示`); else ok(`${label} G 目標高亮＋手指`);
          const fin = (await st());
          if (!fin.btns.some(b => b.a === 'welcomeStart')) fix(`${label} G 最後一步沒有「開始遊戲」(welcomeStart)`);
          await page.evaluate(() => document.querySelector('#modal [data-action=welcomeStart]')?.click()); await settle(page, 900);
        }
        if (!s.bubble) await page.evaluate(() => document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click());
        await settle(page, 500);
        const after = await ev(page, P => {
          const q = document.querySelector('#hv-quest'), adv = [...document.querySelectorAll('#hv-advisor .next-step')].filter(P.vis);
          const toasts = [...document.querySelectorAll('#toasts .toast')].map(e => e.textContent);
          return { modalOpen: !document.querySelector('#modal-backdrop').classList.contains('hidden'), adv: adv.map(a => a.dataset.key), toasts, anim: getComputedStyle(q.querySelector('.hq-title')).animationName, ready: q.classList.contains('ready'), marks: document.querySelectorAll('[data-z2d-target]').length, quest: globalThis.__mistvaleGame.state.quest.complete, claimed: globalThis.__mistvaleGame.state.quest.claimed };
        });
        if (after.modalOpen) fix(`${label} G 按開始遊戲後視窗沒關`);
        if (after.toasts.some(t => /出發吧|先派/.test(t))) fix(`${label} G 開始遊戲後還有第三條叫玩家去地下城的 toast:${after.toasts.join('|')}`);
        if (after.adv.length > 1) fix(`${label} G 顧問同時有 ${after.adv.length} 條`);
        if (after.adv.includes('quest')) fix(`${label} G 開局即完成的委託 01 被當成顧問第一步`);
        if (after.ready && after.anim !== 'none') fix(`${label} G 開局即完成的委託 01 讓任務追蹤閃爍(${after.anim}),會跟顧問搶引導`);
        if (after.marks > 1) fix(`${label} G 同時有 ${after.marks} 個高亮目標,應只留一個`);
        if (!after.quest) console.error(`[z2d] ${label} 開局委託 01 complete=${after.quest}`);
        ok(`${label} G 開場後:顧問 ${after.adv.join(',') || '無'},高亮 ${after.marks},追蹤閃爍 ${after.anim}`);
        await shot(page, `g-after-${name}`);
      }
      if (want.includes('S')) {
        // 存一個標記存檔,再開新分頁看回訪玩家的標題
        if (!want.includes('G')) { await page.evaluate(() => document.querySelector('#title-screen [data-ts=continue]')?.click()); }
        await page.evaluate(() => { const g = globalThis.__mistvaleGame; g.state.gold = 77777; try { const k = Object.keys(localStorage).find(k => /mistvale|save/i.test(k) && localStorage.getItem(k)?.includes('hunters')); const d = JSON.parse(localStorage.getItem(k)); d.gold = 77777; localStorage.setItem(k, JSON.stringify(d)); } catch { } });
        const key = await page.evaluate(() => Object.keys(localStorage).find(k => localStorage.getItem(k)?.includes('"hunters"')));
        if (!key) { fix(`${label} S(前置)找不到存檔 key`); await ctx.close(); continue; }
        await page.close();   // 第一個分頁還活著會每 5 秒自動存檔,把剛刪掉的存檔寫回去(測試假紅)→ 先關掉
        const p2 = await ctx.newPage(); const errs2 = []; p2.on('pageerror', e => errs2.push(String(e).slice(0, 160)));
        await p2.goto(base + '?again=' + Date.now(), { waitUntil: 'commit', timeout: 120000 });
        await p2.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 90000 });
        await p2.waitForSelector('#title-screen', { timeout: 8000 }); await settle(p2, 700);
        const ts = await ev(p2, P => {
          const f = document.querySelector('[data-ts=fresh]'), c = document.querySelector('[data-ts=continue]'); if (!f) return { none: true, cont: c?.textContent.trim() };
          const cs = getComputedStyle(f), fr = P.R(f), cr = P.R(c);
          return { cont: c.textContent.trim(), fs: parseFloat(cs.fontSize), bg: P.rgb(cs.backgroundColor), gold: f.classList.contains('gold'), h: fr.h, w: fr.w, below: fr.t >= cr.b - 1, underline: cs.textDecorationLine, bw: parseFloat(cs.borderTopWidth) };
        });
        if (ts.none) fix(`${label} S 回訪玩家的標題畫面沒有「重新開始」`);
        else {
          if (ts.cont !== '繼續遊戲') fix(`${label} S 回訪玩家主按鈕是「${ts.cont}」,應為「繼續遊戲」`);
          if (ts.gold || !(ts.bg.a <= 0.1) || ts.fs > 13 || ts.bw > 0) fix(`${label} S「重新開始」不是不顯眼的文字連結(金色 ${ts.gold}、底 a=${ts.bg.a}、字 ${ts.fs}px、框 ${ts.bw})`); else ok(`${label} S 重新開始是文字連結(${ts.fs}px)`);
          if (!ts.below) fix(`${label} S「重新開始」沒在主按鈕下方`);
          if (touch && ts.h < 44) fix(`${label} S「重新開始」熱區高 ${Math.round(ts.h)}px <44`);
          await shot(p2, `s-title-${name}`);
          await p2.evaluate(() => document.querySelector('[data-ts=fresh]').click()); await settle(p2, 600);
          const cf = await ev(p2, P => {
            const m = document.querySelector('#modal'), bd = document.querySelector('#modal-backdrop'); const open = !bd.classList.contains('hidden');
            if (!open) return { open: false };
            const mr = P.R(m), t = document.elementFromPoint(mr.l + mr.w / 2, mr.t + mr.h / 2); const yes = document.querySelector('#modal [data-action=confirmYes]'), no = document.querySelector('#modal [data-action=confirmNo]');
            return { open, type: m.dataset.type, mode: m.dataset.mode, onTop: !!t && m.contains(t), title: document.querySelector('#modal-title')?.textContent.trim(), text: document.querySelector('#modal-content')?.textContent, yes: yes?.textContent.trim(), no: no?.textContent.trim(), yesBg: yes ? P.rgb(getComputedStyle(yes).backgroundColor) : null, titleShown: !!document.querySelector('#title-screen'), w: mr.w, vw: innerWidth };
          });
          if (!cf.open) fix(`${label} S 點「重新開始」沒有跳確認視窗`);
          else {
            if (cf.type !== 'confirm' || cf.mode !== 'C') fix(`${label} S 確認不是 C 小視窗(${cf.type}/${cf.mode})`);
            if (!cf.onTop) fix(`${label} S 確認視窗被標題畫面蓋在下面`);
            if (cf.title !== '重新開始') fix(`${label} S 確認標題是「${cf.title}」,應為「重新開始」`);
            if (!/會刪除目前存檔/.test(cf.text)) fix(`${label} S 確認說明沒有「會刪除目前存檔」:${cf.text}`);
            if (cf.yes !== '確認刪除' || cf.no !== '取消') fix(`${label} S 確認鈕是「${cf.yes}」「${cf.no}」`);
            if (!(cf.yesBg && cf.yesBg.r >= 110 && cf.yesBg.r > cf.yesBg.g * 1.8)) fix(`${label} S「確認刪除」不是紅色(${JSON.stringify(cf.yesBg)})`); else ok(`${label} S 確認框:${cf.title}／${cf.yes}(紅)／${cf.no}`);
            await shot(p2, `s-confirm-${name}`);
            // Esc 不該關掉標題(只有確認框在)
            await p2.keyboard.press('Escape'); await settle(p2, 300);
            const stillTitle = await p2.evaluate(() => !!document.querySelector('#title-screen'));
            if (!stillTitle) fix(`${label} S 確認框開著按 Esc 把標題畫面關掉了`);
            // 取消:存檔還在、標題還在
            await p2.evaluate(() => { document.querySelector('#modal-backdrop:not(.hidden) [data-action=confirmNo]')?.click(); }); await settle(p2, 400);
            const afterNo = await p2.evaluate(k => ({ title: !!document.querySelector('#title-screen'), gold: JSON.parse(localStorage.getItem(k) || 'null')?.gold, open: !document.querySelector('#modal-backdrop').classList.contains('hidden') }), key);
            // 遊戲在標題畫面後面照常跑、會自動存檔:金幣可能多幾枚(2026-11-15 量到 77787 = 一筆 +10 收入)。
            // 要驗的是「沒被刪」:刪掉的新存檔是開局 1500 枚,所以 ≥ 77777 就是原存檔還在。
            if (!afterNo.title || !(afterNo.gold >= 77777) || afterNo.open) fix(`${label} S 取消後狀態不對(標題 ${afterNo.title}、存檔金幣 ${afterNo.gold}、視窗 ${afterNo.open})`); else ok(`${label} S 取消不刪存檔`);
            // 確認刪除:存檔被清、重新載入
            await p2.evaluate(() => document.querySelector('[data-ts=fresh]').click()); await settle(p2, 500);
            const nav = p2.waitForNavigation({ waitUntil: 'commit', timeout: 20000 }).catch(() => null);
            await p2.evaluate(() => document.querySelector('#modal-backdrop:not(.hidden) [data-action=confirmYes]')?.click());
            await nav; await p2.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 90000 }).catch(() => { }); await settle(p2, 1500);
            const gold = await p2.evaluate(k => { try { return JSON.parse(localStorage.getItem(k) || 'null')?.gold ?? null; } catch { return -1; } }, key);
            if (gold >= 77777) fix(`${label} S 按「確認刪除」後存檔還在(金幣 ${gold})`); else ok(`${label} S 確認刪除才會清存檔(新存檔金幣 ${gold})`);
          }
          // 回訪玩家「繼續遊戲」
          const p3 = await ctx.newPage(); await p3.goto(base + '?cont=' + Date.now(), { waitUntil: 'commit' }); await p3.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 90000 }); await p3.waitForSelector('#title-screen', { timeout: 8000 }).catch(() => { });
          await p3.evaluate(() => document.querySelector('[data-ts=continue]')?.click()); await settle(p3, 1200);
          const c3 = await p3.evaluate(() => ({ title: !!document.querySelector('#title-screen'), modal: !document.querySelector('#modal-backdrop').classList.contains('hidden') }));
          if (c3.title) fix(`${label} S 按「繼續遊戲」標題沒關`); else if (c3.modal) fix(`${label} S 回訪玩家按繼續後又跳出視窗(歡迎導覽只給新玩家)`); else ok(`${label} S 繼續遊戲正常`);
          await p3.close();
        }
        await p2.close();
      }
      if (errs.length) fix(`${label} 頁面有 console／page error:${errs.slice(0, 2).join(' | ')}`);
    } catch (e) { fix(`${label} G/S 例外:${String(e.message || e).split('\n')[0].slice(0, 200)}`); }
    await ctx.close();
  }
}

await browser.close(); srv.stop();
for (const m of oks) console.log('ok ' + m);
if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
console.log(`PASS z2d-hud: ${oks.length} 項`);
