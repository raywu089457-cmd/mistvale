// fix-c.mjs — FIX-C(2026-11-11):面板開著時的 toast 住進標題列、同句合併「×N」、橫向資源條、抽屜開著直接點另一棟建築
//   四種視窗:1440×900、1024×768、390×844(mobile+touch)、844×390(mobile+touch)
//   A. toast(規格 4.3/4.7;FIX-D 改版、Z2D 再改):底部抽屜(A 模式)開著時,toast 不再蓋標題列(R13:蓋住子頁籤與工具鈕),
//      直向手機／桌機出現在抽屜上緣上方、最多 2 則,橫向(抽屜滿版)留在頁籤列上方;不蓋標題列的鈕、不疊在內容區上;面板關著時維持在頁籤列上方。
//      所有情況下同一句話連續出現要合併成一條(DOM 只有一個 .toast、data-n=N、寬度夠時顯示「×N」)。
//   B. 資源條:HUD 被藏起來的視窗(橫向)面板標題列有 金幣/星晶/木材/鐵礦(圖示＋數字),數字跟頂欄同一份資料、即時更新;
//      HUD 看得到的視窗不出現;不擠掉 X 與子頁籤鈕,不跟 toast 互蓋。(建設面板自己有庫存列 → 不放)
//   C. 建築詳情抽屜開著時,用滑鼠直接點世界上露出的另一棟建築 → 抽屜內容直接換成那一棟(沒關過、沒出六角鈕)。
//   D. #hv-left 與 #left-panel 的對齊值共用一個變數 --hv-left-top;量測值要等於修前(align-before.json)。
//   每一項都是「改回舊行為就會紅」。用法:node tools/checks/fix-c.mjs(TARGET 空＝自己開臨時伺服器)
import * as L from './fix-a-lib.mjs';
import fs from 'node:fs';
const srv = await L.startServer(); const browser = await L.launch();
const fails = [], oks = []; const fix = m => fails.push(m), ok = m => oks.push(m);
const SHOTS = process.env.SHOTS_DIR || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const url = srv.url.includes('?') ? srv.url : srv.url;
const MSG = '這棟建築已經建好';

// 頁面內:量測標題列與 toast 的幾何
const measure = () => {
  const R = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const hit = (a, b) => a && b && Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5;
  const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
  const modalOpen = !document.querySelector('#modal-backdrop').classList.contains('hidden');
  const insOpen = !document.querySelector('#inspector').classList.contains('hidden');
  const host = modalOpen ? document.querySelector('#modal') : insOpen ? document.querySelector('#inspector') : null;
  const title = host ? host.querySelector('.modal-title,.panel-title') : null;
  const all = [...document.querySelectorAll('#toasts .toast')].filter(vis);
  const t = all[all.length - 1] || null, tr = R(t);
  const out = { host_t: host ? R(host).t : 0, host: host?.id || '', nShown: all.length, nDom: document.querySelectorAll('#toasts .toast').length, text: t?.textContent || '', badge: t?.querySelector('.toast-n')?.textContent || '', dataN: +(t?.dataset.n || 0), toast: tr, inTitleDom: !!(title && t && title.contains(t)) };
  if (title) {
    const tt = R(title); out.title = tt;
    out.inside = !!tr && tr.l >= tt.l - 1 && tr.r <= tt.r + 1 && tr.t >= tt.t - 1 && tr.b <= tt.b + 1;
    const blockers = [...title.querySelectorAll('button,#modal-icon,h2,#inspect-title,.hv-pres')].filter(e => vis(e) && !e.closest('#toasts'));
    out.overlaps = tr ? blockers.filter(e => hit(tr, R(e))).map(e => (e.id ? '#' + e.id : e.tagName.toLowerCase()) + ':' + (e.textContent || '').trim().slice(0, 6)) : [];
    const content = host.querySelector('#modal-content,#inspect-content'); out.overContent = !!(tr && hit(tr, R(content)));
    const x = title.querySelector('[data-action=close],[data-action=closeInspector]'); out.x = R(x); out.xOk = !!x && vis(x) && R(x).r <= tt.r + 1 && R(x).l >= tt.l;
    out.tools = [...title.querySelectorAll('.hv-tool')].map(R);
  }
  const bb = R(document.querySelector('#bottom-bar')); out.bar = bb;
  const strip = document.querySelector('#modal-res'); out.stripShown = !!(strip && modalOpen && vis(strip)); out.strip = out.stripShown ? R(strip) : null;
  out.stripItems = strip ? [...strip.querySelectorAll('[data-res]')].map(e => ({ k: e.dataset.res, v: e.textContent, icon: !!e.parentElement.querySelector('img,canvas'), vis: vis(e) })) : [];
  out.hud = ['gold', 'gems', 'wood', 'ore'].map(k => document.querySelector('#' + k)?.textContent);
  const tb = document.querySelector('#topbar'), tbs = tb && getComputedStyle(tb); out.hudHidden = !tb || tbs.visibility === 'hidden' || +tbs.opacity === 0 || tbs.display === 'none';
  out.stripOverToast = !!(out.strip && tr && hit(out.strip, tr));
  return out;
};
const fire = (page, n = 3) => page.evaluate(([m, n]) => { document.querySelector('#toasts').querySelectorAll('.toast').forEach(e => e.remove()); for (let i = 0; i < n; i++) globalThis.__toast(m, true); }, [MSG, n]);
const closeAll = async page => { await page.evaluate(() => { document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click(); document.querySelector('#inspector:not(.hidden) [data-action=closeInspector]')?.click(); }); await page.waitForTimeout(250); };

for (const view of ['desktop', 'tablet', 'phone', 'land']) {
  const v = L.VIEWS[view]; const ctx = await L.newCtx(browser, v); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await L.boot(page, url);
  await page.evaluate(() => { for (const k of ['resources', 'buildings', 'levels', 'heal']) globalThis.__mistvaleGame.cheat(k); });
  // ── A. 面板關著:同句三次 → 一條 ×3,在頁籤列上方 ──
  await fire(page); await page.waitForTimeout(450);
  let m = await page.evaluate(measure);
  if (m.nDom !== 1 || m.dataN !== 3) fix(`${view}/面板關閉: 同一句話連續 3 次應合併成 1 條(×3),實際 DOM ${m.nDom} 條、data-n=${m.dataN}`);
  else if (m.badge !== '×3') fix(`${view}/面板關閉: 合併後沒有顯示「×3」(badge="${m.badge}")`);
  if (m.toast && m.bar && m.toast.b > m.bar.t + 0.5) fix(`${view}/面板關閉: toast 底 ${Math.round(m.toast.b)} 蓋到頁籤列(頂 ${Math.round(m.bar.t)})`);
  if (SHOTS && view === 'phone') await page.screenshot({ path: `${SHOTS}/closed-merged-${view}.png` });
  // 不同句子不合併
  await page.evaluate(() => { document.querySelector('#toasts').innerHTML = ''; globalThis.__toast('甲', true); globalThis.__toast('乙', true); });
  await page.waitForTimeout(150);
  if ((await page.evaluate(() => document.querySelectorAll('#toasts .toast').length)) !== 2) fix(`${view}: 兩句不同的話不該被合併`);
  // ── A/B. 面板開著 ──
  const rows = [];
  for (const tab of ['build', 'hunters', 'trade', 'craft']) {
    await L.act(page, tab); await page.waitForTimeout(550);
    await fire(page); await page.waitForTimeout(450);
    m = await page.evaluate(measure); const tag = `${view}/${tab}`;
    if (!m.nShown) { fix(`${tag}: toast 沒有出現`); await closeAll(page); continue; }
    // Z2D(R13):A 抽屜開著時 toast 不再住進標題列(會蓋住子頁籤與工具鈕)→ 直向手機／桌機出現在抽屜上方;橫向(抽屜滿版)留在頁籤列上方並閃避按鈕。z2d-hud.mjs 也量這件事。
    const landscapeA = view === 'land';
    if (m.inTitleDom) fix(`${tag}: toast 還在面板標題列裡(host=${m.host});Z2D 起應在抽屜上方,不蓋標題列工具鈕`);
    if (m.nShown > 2) fix(`${tag}: 面板開著時最多顯示 2 則,實際 ${m.nShown} 則`);
    if (m.nDom !== 1 || m.dataN !== 3) fix(`${tag}: 同句 ×3 沒合併(DOM ${m.nDom} 條、n=${m.dataN})`);
    if (m.overlaps && m.overlaps.length) fix(`${tag}: toast 蓋住標題列的 ${m.overlaps.join('、')}`);
    if (!landscapeA && m.toast && m.title && m.toast.b > m.host_t + 1.5) fix(`${tag}: toast 底 ${Math.round(m.toast.b)} 沒在抽屜上緣(${Math.round(m.host_t)})以上`);
    if (!landscapeA && m.overContent) fix(`${tag}: toast 疊在面板內容區上`);
    if (!m.xOk) fix(`${tag}: 關閉鈕被擠出標題列或看不到`);
    // 寬度夠(≥ 140px)時 ×N 與文字都要看得到
    if (m.toast && m.toast.w >= 140 && m.badge !== '×3') fix(`${tag}: 空位 ${Math.round(m.toast.w)}px 夠寬卻沒顯示 ×3`);
    // ── B. 資源條 ──
    const isBuild = tab === 'build';
    if (m.stripShown !== (m.hudHidden && !isBuild)) fix(`${tag}: 資源條顯示=${m.stripShown},HUD 被藏起來=${m.hudHidden}(建設面板不放)`);
    if (m.stripShown) {
      if (m.stripItems.length !== 4 || m.stripItems.some(i => !i.vis || !i.icon || !i.v)) fix(`${tag}: 資源條要有 4 項圖示＋數字 ${JSON.stringify(m.stripItems)}`);
      const same = m.stripItems.map(i => i.v).join('|') === m.hud.join('|');
      if (!same) fix(`${tag}: 資源條數字 ${m.stripItems.map(i => i.v)} 跟頂欄 ${m.hud} 不同`);
      const bl = [m.x, ...(m.tools || [])].filter(Boolean).filter(b => Math.min(m.strip.r, b.r) - Math.max(m.strip.l, b.l) > 0.5);
      if (bl.length) fix(`${tag}: 資源條蓋住 X 或子頁籤鈕`);
    }
    rows.push(`${tab}:toast${Math.round(m.toast.w)}px${m.stripShown ? '+res' : ''}`);
    if (SHOTS && ((view === 'phone' && tab === 'trade') || (view === 'desktop' && tab === 'build') || (view === 'land' && tab === 'trade') || (view === 'land' && tab === 'hunters'))) await page.screenshot({ path: `${SHOTS}/panel-${view}-${tab}.png` });
    await closeAll(page);
  }
  // 資源條即時更新(橫向):金幣變動後,資源條與頂欄同步
  if (view === 'land') {
    await L.act(page, 'trade'); await page.waitForTimeout(500);
    await page.evaluate(() => { globalThis.__mistvaleGame.state.gold = 4321; globalThis.__mistvaleGame.state.wood = 777; });
    await page.waitForTimeout(700);
    const live = await page.evaluate(() => ({ strip: [...document.querySelectorAll('#modal-res [data-res]')].map(e => e.textContent), hud: ['gold', 'gems', 'wood', 'ore'].map(k => document.querySelector('#' + k).textContent) }));
    if (live.strip.join('|') !== live.hud.join('|') || !/4[,.]?3|4321|4\.3k/.test(live.strip[0])) fix(`${view}: 金幣改成 4321 後資源條沒有即時更新 strip=${live.strip} hud=${live.hud}`);
    else ok(`land 資源條即時更新:${live.strip.join(' ')}`);
    await closeAll(page);
  }
  // ── C. 抽屜開著時直接點另一棟建築 ──
  {
    const exposed = () => page.evaluate(() => {
      const vw = globalThis.__mistvaleView, cv = document.querySelector('#world'), rect = cv.getBoundingClientRect(), bot = vw.unproject(rect.right, rect.bottom);
      return vw.hitRects().map(u => ({ id: u.id, x: rect.left + ((u.x + u.w / 2) / bot.sx) * rect.width, y: rect.top + ((u.y + u.h / 2) / bot.sy) * rect.height }))
        .filter(p => p.x > 4 && p.y > 4 && p.x < innerWidth - 4 && p.y < innerHeight - 4 && document.elementFromPoint(p.x, p.y)?.id === 'world');
    });
    await page.evaluate(() => { globalThis.__mistvaleGame.state.paused = true; }); await page.waitForTimeout(120);
    const first = (await exposed())[0];
    if (!first) { ok(`${view} 世界上沒有露出的建築可點(略過 C)`); }
    else {
      await page.mouse.click(first.x, first.y); await page.waitForTimeout(300);
      const ib = await page.$('#hv-sel [data-action=selInfo]'); if (ib) { await ib.click(); await page.waitForTimeout(300); }
      const t1 = await page.evaluate(() => ({ open: !document.querySelector('#inspector').classList.contains('hidden'), title: document.querySelector('#inspect-title').textContent }));
      if (!t1.open) fix(`${view}: 先開不起第一棟建築的詳情抽屜(${first.id})`);
      else {
        const others = (await exposed()).filter(p => p.id !== first.id);
        if (!others.length) ok(`${view} 抽屜開著時沒有第二棟露出的建築可點(抽屜蓋住,略過 C)`);
        else {
          const b = others[0];
          await page.evaluate(() => { const el = document.querySelector('#inspector'); globalThis.__insHides = 0; new MutationObserver(() => { if (el.classList.contains('hidden')) globalThis.__insHides++; }).observe(el, { attributes: true, attributeFilter: ['class'] }); });
          await page.mouse.click(b.x, b.y); await page.waitForTimeout(350);
          const t2 = await page.evaluate(() => ({ open: !document.querySelector('#inspector').classList.contains('hidden'), title: document.querySelector('#inspect-title').textContent, hides: globalThis.__insHides, hex: !document.querySelector('#hv-sel').hidden }));
          if (!t2.open || t2.title === t1.title || t2.hides || t2.hex) fix(`${view}: 抽屜開著時直接點另一棟(${first.id}→${b.id})沒有直接切換:${JSON.stringify(t1)} → ${JSON.stringify(t2)}`);
          else ok(`${view} 抽屜開著直接點 ${first.id}→${b.id}:「${t1.title}」→「${t2.title}」,沒關過`);
          if (SHOTS && (view === 'desktop' || view === 'tablet')) await page.screenshot({ path: `${SHOTS}/switch-after-${view}.png` });
          // 點空地照舊:關掉詳情
          await closeAll(page);
        }
      }
    }
  }
  if (errs.length) fix(`${view}: 頁面錯誤 ${errs[0]}`);
  console.log(view, rows.join(' '));
  await ctx.close();
}

// ── D. 對齊值只留一份:兩段 CSS 都引用 --hv-left-top,量測值跟修前一樣 ──
{
  const css = fs.readFileSync(new URL('../../src/ui-hv.css', import.meta.url), 'utf8');
  if (!/--hv-left-top:/.test(css)) fix('D: 找不到共用變數 --hv-left-top');
  // 116／92 這組數字(任務追蹤 top 的手機／橫向值)只能出現在 --hv-left-top 的定義;#hv-left 與 --hv-lp-top 都不得再手抄
  const hand = (css.match(/--hv-left-top:calc\(env\(safe-area-inset-top,0px\) \+ (116|92)px/g) || []).length;
  const copies = css.split(/\r?\n/).filter(l => /(#hv-left|#left-panel|--hv-lp-top)/.test(l) && /(116|92)px/.test(l)).length;
  if (hand !== 2 || copies) fix(`D: 116px/92px 應只在 --hv-left-top 的兩個定義各出現一次(定義 ${hand} 處、別處手抄 ${copies} 行)`);
  const before = JSON.parse(fs.readFileSync(new URL('../../output/ui-audit/fix-c/align-before.json', import.meta.url), 'utf8'));
  for (const view of ['desktop', 'tablet', 'phone', 'land']) {
    const ctx = await L.newCtx(browser, L.VIEWS[view]); const page = await ctx.newPage(); await L.boot(page, url);
    const r = await page.evaluate(() => { if (document.querySelector('#left-panel').classList.contains('hidden')) document.querySelector('#reopen-left')?.click(); return new Promise(res => setTimeout(() => res({ hvLeftTop: document.querySelector('#hv-left').getBoundingClientRect().top, lpTop: document.querySelector('#left-panel').getBoundingClientRect().top }), 400)); });
    if (Math.abs(r.hvLeftTop - before[view].hvLeftTop) > 0.5 || Math.abs(r.lpTop - before[view].lpTop) > 0.5) fix(`D ${view}: #hv-left top ${r.hvLeftTop}/#left-panel top ${r.lpTop},修前 ${before[view].hvLeftTop}/${before[view].lpTop}`);
    else ok(`D ${view}: #hv-left ${r.hvLeftTop} / #left-panel ${r.lpTop}(同修前)`);
    await ctx.close();
  }
}
await browser.close(); srv.stop();
if (fails.length) { console.log('FAIL fix-c\n - ' + fails.slice(0, 40).join('\n - ') + (fails.length > 40 ? `\n ...另 ${fails.length - 40} 項` : '')); process.exit(1); }
for (const o of oks) console.log('ok  ' + o);
console.log('PASS fix-c: 面板開著 toast 蓋滿標題列(留 X、一次一則、不蓋內容)、同句合併 ×N、橫向資源條即時、抽屜開著直接點另一棟、對齊值共用一個變數');
