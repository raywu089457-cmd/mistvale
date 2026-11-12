// z2b-econ.mjs — Z2B(2026-11-12 圖鑑 v2 建築與經濟畫面):建築詳情、建設抽屜、交易所、倉庫、製作、委託、確認框、賣完導引。每一項都是「改回舊畫面就會紅」。
//   視窗:390×844(mobile+touch)、1440×900、844×390(mobile+touch)、360×640(mobile+touch)。VIEWS=phone,desk 可只跑部分。
//   A. 建築詳情(C 視窗 #inspector):標題「Lv.n 名稱」、右上幽靈鈕「移動位置」、說明在內凹框、生產清單列(粉名稱／米白說明／藍數字／金棕動作鈕)、文字型子頁籤(生產｜升級效果)、
//      升級需求提示框(達成綠字／未達成粉紅字)、底部 升級(橄欖綠)＋關閉(紅)、滿級不放升級鈕＋綠字狀態＋灰色 MAX、未建造只寫建築名;升級／鍛造／移動位置都真的生效。
//   B. 建設抽屜:成本字 ≥12px、缺的成本項目紅色、缺料灰鈕寫全「缺 金幣x、鐵礦y」(不能有「等」)、未建造卡有用途說明、「i」金色小方塊；建造／升級真的生效。
//   C. 交易所:上方說明框、3 欄方格(圖示框＋白名稱＋庫存單價)、金棕膠囊主鈕、±10／±1 步進(觸控 ≥44)；數值照舊(+10、−10、+1、−1)。
//   D. 倉庫:方格(圖示框＋數量＋名稱)、點一格看用途／來源、「前往」可用。E. 製作:清單列、材料 現有/需要(不足紅字＋「材料不足」灰鈕)、製作／做滿／鍛造生效。
//   F. 委託:每列 標題＋進度膠囊 x/y＋獎勵、可領取＝金棕「領取」且領得到、領過的列壓暗、雙細線區段標籤。G. 確認框:標題帶、說明內凹框、一行提問、確認(橄欖綠)＋取消(紅)，兩邊都真的生效。
//   H. 商品賣完:倉庫頁籤待辦徽章＋顧問「○○賣完了，到倉庫的製作補貨」(補貨後消失)。I. 每個畫面:字 ≥12px、觸控熱區 ≥44、按鈕不互蓋、沒有 console／page error。
//   用法:node tools/checks/z2b-econ.mjs(TARGET 空＝自己開臨時伺服器;TARGET=別台可量修前版本)。SHOTS_DIR=資料夾 會存截圖。
import * as L from './fix-a-lib.mjs';
import fs from 'node:fs';
const srv = await L.startServer(); const browser = await L.launch();
const fails = [], oks = []; const fix = m => fails.push(m), ok = m => oks.push(m);
const SHOTS = process.env.SHOTS_DIR || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const url = srv.url + (srv.url.includes('?') ? '' : '?preview=1');
const VIEWS = { phone: { w: 390, h: 844, mobile: true }, desk: { w: 1440, h: 900 }, land: { w: 844, h: 390, mobile: true }, small: { w: 360, h: 640, mobile: true } };
const only = (process.env.VIEWS || Object.keys(VIEWS).join(',')).split(',');
const C = { pink: 'rgb(246, 204, 204)', cream: 'rgb(246, 240, 210)', blue: 'rgb(90, 160, 224)', fee: 'rgb(252, 222, 138)', ok: 'rgb(176, 192, 64)', no: 'rgb(232, 144, 138)',
  olive: 'rgb(88, 104, 16)', red: 'rgb(141, 57, 37)', gold: 'rgb(144, 104, 24)', gray: 'rgb(80, 80, 80)', inset: 'rgb(22, 18, 17)', hint: 'rgb(41, 37, 33)', white: 'rgb(255, 255, 255)', done: 'rgb(54, 54, 54)' };

const G = fn => `(${fn.toString()})(globalThis.__mistvaleGame)`;
const setS = (page, fn, arg) => page.evaluate(`(()=>{const g=globalThis.__mistvaleGame,s=g.state,a=${JSON.stringify(arg ?? null)};(${fn.toString()})(s,g,a);})()`);
const getS = (page, fn, arg) => page.evaluate(`(()=>{const g=globalThis.__mistvaleGame,s=g.state,a=${JSON.stringify(arg ?? null)};return (${fn.toString()})(s,g,a);})()`);
const settle = (page, ms = 450) => page.waitForTimeout(ms);
const closeAll = async page => { await page.evaluate(() => { const i = document.querySelector('#inspector:not(.hidden) [data-action=closeInspector]'); if (i) i.click(); const m = document.querySelector('#modal-backdrop:not(.hidden)'); if (m) { const x = document.querySelector('#modal-foot [data-action=close],#modal-foot [data-action=confirmNo],#modal [data-action=close]'); x?.click(); } }); await page.waitForTimeout(250); };
const prep = page => page.evaluate(() => { const g = globalThis.__mistvaleGame; for (const k of ['resources', 'buildings']) g.cheat(k); const s = g.state; s.paused = true; s.visitors = []; });

// ── 頁內共用量測:顏色、字級、熱區、重疊 ──
const SCAN = (root, minHit) => {
  const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); if (r.width < 1 || r.height < 1 || cs.visibility === 'hidden' || cs.display === 'none') return false; for (let p = e; p; p = p.parentElement) { if (p.hidden || getComputedStyle(p).display === 'none') return false; } return true; };
  const roots = [...document.querySelectorAll(root)].filter(vis);
  const zoomOf = e => e.currentCSSZoom || 1;
  const small = [], tiny = [], over = [];
  for (const r of roots) {
    for (const e of r.querySelectorAll('*')) {
      if (!vis(e) || e.closest('.hv-sr,.sr-only,kbd,canvas,svg,.scroll-hint,.hv-scroll-up,[data-action=close]')) continue;
      const own = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (own) { const px = parseFloat(getComputedStyle(e).fontSize) * zoomOf(e); if (px < 11.9) small.push((e.className || e.tagName) + ':' + (e.textContent || '').trim().slice(0, 8) + '=' + px.toFixed(1)); }
    }
  }
  const btns = roots.flatMap(r => [...r.querySelectorAll('button,[role=tab]')]).filter(b => vis(b) && !b.closest('.hv-sr') && !b.disabled || false).concat([]);
  const all = roots.flatMap(r => [...r.querySelectorAll('button,[role=tab]')]).filter(b => vis(b));
  const clipped = b => { const q = b.getBoundingClientRect(); for (let p = b.parentElement; p; p = p.parentElement) { const cs = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(cs.overflowY + cs.overflowX)) { const pr = p.getBoundingClientRect(); const cy = (q.top + q.bottom) / 2; if (cy < pr.top + 2 || cy > pr.bottom - 2) return true; /* 中心被捲動區切掉＝看不到、點不到,不算互蓋 */ } } return false; };
  const rects = [];
  for (const b of all) {
    if (clipped(b)) continue;
    const q0 = b.getBoundingClientRect(); let q = { left: q0.left, right: q0.right, top: q0.top, bottom: q0.bottom, width: q0.width, height: q0.height };
    for (let p = b.parentElement; p; p = p.parentElement) { const cs = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(cs.overflowY + cs.overflowX)) { const pr = p.getBoundingClientRect(); q.top = Math.max(q.top, pr.top); q.bottom = Math.min(q.bottom, pr.bottom); q.left = Math.max(q.left, pr.left); q.right = Math.min(q.right, pr.right); } }
    rects.push({ b, q });   /* 互蓋只算「看得到的部分」(被捲動區切掉的不算) */
    if (minHit && Math.min(q0.width, q0.height) < minHit - 0.5) tiny.push((b.dataset.action || b.className || 'btn') + ':' + (b.textContent || '').trim().slice(0, 6) + '=' + Math.round(q0.width) + '×' + Math.round(q0.height));
  }
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j]; if (a.b.contains(b.b) || b.b.contains(a.b)) continue;
    const w = Math.min(a.q.right, b.q.right) - Math.max(a.q.left, b.q.left), h = Math.min(a.q.bottom, b.q.bottom) - Math.max(a.q.top, b.q.top);
    if (w > 2 && h > 2) over.push((a.b.textContent || a.b.dataset.action).trim().slice(0, 5) + '×' + (b.b.textContent || b.b.dataset.action).trim().slice(0, 5));
  }
  return { small: [...new Set(small)].slice(0, 4), tiny: [...new Set(tiny)].slice(0, 4), over: over.slice(0, 3), n: all.length };
};
const scan = async (page, who, root, v, errs) => {
  const r = await page.evaluate(`(${SCAN.toString()})(${JSON.stringify(root)},${v.mobile ? 44 : 28})`);
  if (r.small.length) fix(`${who}: 有字小於 12px:${r.small.join('、')}`);
  if (r.tiny.length) fix(`${who}: 熱區太小:${r.tiny.join('、')}`);
  if (r.over.length) fix(`${who}: 按鈕互蓋:${r.over.join('、')}`);
  if (!r.small.length && !r.tiny.length && !r.over.length && r.n) ok(`${who}: ${r.n} 顆按鈕熱區${v.mobile ? '≥44' : '≥28'}、字 ≥12px、無互蓋`);
};
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

for (const name of only) {
  const v = VIEWS[name]; if (!v) continue;
  const label = `${name}(${v.w}×${v.h})`, touch = !!v.mobile, land = v.h <= 520;
  const ctx = await L.newCtx(browser, v); const page = await ctx.newPage(); page.setDefaultTimeout(4000);
  const errs = []; page.on('pageerror', e => errs.push('pageerror ' + String(e).slice(0, 160))); page.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text().slice(0, 160)); });
  try {
    await L.boot(page, url); await prep(page);
    const scene = async (tag, fn) => { try { await fn(); } catch (e) { fix(`${label}/${tag}: 例外 ${String(e.message || e).split('\n')[0].slice(0, 140)}`); await closeAll(page).catch(() => {}); } };
    const openInsp = async id => { await closeAll(page); await L.act(page, 'selectBuilding', id); await settle(page, 380); };
    const readInsp = () => page.evaluate(() => {
      const I = document.querySelector('#inspector'), q = s => I.querySelector(s), cs = (e, p) => e ? getComputedStyle(e)[p] : null, R = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { w: r.width, h: r.height }; };
      const foot = [...document.querySelectorAll('#inspect-foot button')], rows = [...I.querySelectorAll('.z2b-rows .z2b-row')];
      const act = I.querySelector('.z2b-row .z2b-act .pixel-button');
      const chips = [...I.querySelectorAll('.inspect-req .cost-chip')];
      return {
        open: !I.classList.contains('hidden'), title: q('#inspect-title')?.textContent.trim(), mode: I.dataset.mode,
        ghost: (() => { const g = document.querySelector('#inspect-ghost .z1-ghost'); return g ? { text: g.textContent.trim(), act: g.dataset.action, r: R(g) } : null; })(),
        desc: { text: q('.z2b-desc .inspect-desc')?.textContent.trim() || '', bg: cs(q('.z2b-desc'), 'backgroundColor'), cls: q('.z2b-desc')?.className || '' },
        tabs: [...I.querySelectorAll('.z2b-tabs .z1-subtab')].map(t => ({ t: t.textContent.trim(), on: t.classList.contains('on'), bg: cs(t, 'backgroundColor') })),
        sep: !!q('.z2b-sep'), sepLines: (() => { const s = q('.z2b-sep'); if (!s) return 0; const b = getComputedStyle(s, '::before'); return parseFloat(b.borderTopWidth) + parseFloat(b.borderBottomWidth); })(),
        rows: rows.map(r => ({ nm: r.querySelector('.z2b-nm')?.textContent.trim(), nmC: cs(r.querySelector('.z2b-nm'), 'color'), dsC: cs(r.querySelector('.z2b-ds'), 'color'), blue: [...r.querySelectorAll('.z2b-n')].map(n => cs(n, 'color')), ic: !!r.querySelector('.z2b-ic'), fee: r.querySelector('.z2b-fee')?.textContent.trim() || '', feeC: cs(r.querySelector('.z2b-fee'), 'color'), btn: (() => { const b = r.querySelector('.z2b-act .pixel-button'); return b ? { t: b.textContent.trim(), bg: cs(b, 'backgroundColor'), dis: b.disabled, act: b.dataset.action } : null; })() })),
        req: { bg: cs(q('.inspect-req'), 'backgroundColor'), cls: q('.inspect-req')?.className || '', next: q('.inspect-next')?.textContent.trim() || '', note: q('.inspect-note')?.textContent.trim() || '', noteC: cs(q('.inspect-note'), 'color'), done: q('.inspect-done')?.textContent.trim() || '', doneC: cs(q('.inspect-done'), 'color'), chips: chips.map(c => ({ short: c.classList.contains('short'), c: cs(c, 'color'), t: c.textContent.replace(/\s+/g, ' ').trim() })) },
        foot: foot.map(b => ({ t: b.textContent.trim(), act: b.dataset.action, bg: cs(b, 'backgroundColor'), dis: b.disabled, w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height })),
        footN: document.querySelector('#inspect-foot')?.dataset.n,
        stray: [...I.querySelectorAll('#inspect-content [data-action=upgrade],#inspect-content [data-action=construct]')].length,
      };
    });

    // ───── A. 建築詳情 ─────
    await scene('A', async () => {
      await setS(page, s => { s.buildings.hall = 4; s.buildings.forge = 2; s.gold = 5000; s.wood = 500; s.ore = 500; s.leather = 80; s.cloth = 80; s.gearStock.weapon = 0; });
      await openInsp('forge');
      let r = await readInsp();
      if (!r.open || r.mode !== 'C') return fix(`${label}/A: 建築詳情沒開成 C 視窗(open=${r.open} mode=${r.mode})`);
      r.title === 'Lv.2 鐵匠鋪' ? ok(`${label}/A: 標題「${r.title}」`) : fix(`${label}/A: 標題應為「Lv.2 鐵匠鋪」,實際「${r.title}」`);
      r.ghost && r.ghost.text === '移動位置' && (!touch || r.ghost.r.h >= 44) ? ok(`${label}/A: 右上幽靈鈕「移動位置」(${Math.round(r.ghost.r.w)}×${Math.round(r.ghost.r.h)})`) : fix(`${label}/A: 標題右上要有幽靈鈕「移動位置」${touch ? '(觸控 ≥44)' : ''}:${JSON.stringify(r.ghost)}`);
      r.desc.text && r.desc.bg === C.inset && /z1-inset/.test(r.desc.cls) ? ok(`${label}/A: 說明在內凹框(${C.inset})`) : fix(`${label}/A: 說明要放在 .z1-inset 內凹框(bg ${C.inset}):${r.desc.bg} ${r.desc.cls}`);
      r.tabs.length === 2 && r.tabs[0].t === '生產' && r.tabs[1].t === '升級效果' && r.tabs[0].on && r.tabs[0].bg === 'rgb(171, 152, 146)' && r.tabs[1].bg === 'rgb(73, 65, 62)' ? ok(`${label}/A: 文字型子頁籤 生產｜升級效果(選中 #ab9892、未選 #49413e)`) : fix(`${label}/A: 有生產的建築要有文字子頁籤:${JSON.stringify(r.tabs)}`);
      r.sep && r.sepLines >= 2 ? ok(`${label}/A: 區段標籤夾雙細線`) : fix(`${label}/A: 區段標籤要有雙細線(線寬和 ${r.sepLines})`);
      if (r.rows.length !== 2) fix(`${label}/A: 鐵匠鋪生產清單應 2 列(武器、護甲),實際 ${r.rows.length}`);
      else {
        const w = r.rows[0], bad = [];
        if (w.nmC !== C.pink) bad.push('名稱不是粉色 ' + w.nmC); if (w.dsC !== C.cream) bad.push('說明不是米白 ' + w.dsC); if (!w.blue.length || w.blue.some(c => c !== C.blue)) bad.push('關鍵數字不是藍色 ' + w.blue.join('/')); if (!w.ic) bad.push('沒有圖示格');
        if (!w.btn || w.btn.bg !== C.gold || w.btn.dis) bad.push('動作鈕不是金棕可按 ' + JSON.stringify(w.btn));
        bad.length ? fix(`${label}/A: 清單列規格不符:${bad.join('；')}`) : ok(`${label}/A: 清單列 圖示格＋粉名稱＋米白說明＋藍數字＋金棕「${w.btn.t}」`);
      }
      // 升級需求提示框
      const rq = r.req; const hasOk = rq.chips.length && rq.chips.every(c => !c.short && c.c === C.ok);
      rq.bg === C.hint && /z1-hint/.test(rq.cls) && hasOk && rq.noteC === C.ok ? ok(`${label}/A: 升級需求提示框 ${C.hint}、達成=綠字`) : fix(`${label}/A: 需求提示框/綠字不符:bg ${rq.bg} chips ${JSON.stringify(rq.chips)} note ${rq.noteC}`);
      // 底部 升級(橄欖綠)＋關閉(紅)
      const fu = r.foot.find(b => b.act === 'upgrade'), fc = r.foot.find(b => b.act === 'closeInspector');
      fu && fc && fu.bg === C.olive && fc.bg === C.red && r.footN === '2' && r.stray === 0 ? ok(`${label}/A: 底部 升級(橄欖綠)＋關閉(紅),內容裡沒有殘留的升級鈕`) : fix(`${label}/A: 底部列不對:${JSON.stringify(r.foot)} n=${r.footN} stray=${r.stray}`);
      await scan(page, `${label}/A 建築詳情`, '#inspector', v);
      await shot(page, `${name}-insp-up`);
      // 動作:鍛造(清單列金棕鈕)
      const w0 = await getS(page, s => s.gearStock.weapon);
      await page.click('#inspector .z2b-row [data-action=craftGear]'); await settle(page, 300);
      const w1 = await getS(page, s => s.gearStock.weapon);
      w1 === w0 + 1 ? ok(`${label}/A: 清單列「鍛造」真的生效(武器庫存 ${w0}→${w1})`) : fix(`${label}/A: 清單列「鍛造」沒生效(${w0}→${w1})`);
      // 子頁籤:升級效果
      await page.click('#inspector .z2b-tabs [data-id=up]'); await settle(page, 260);
      r = await readInsp();
      const e = r.rows[0];
      e && /^Lv\.2 /.test(e.nm) && e.nmC === C.pink && /費用/.test(e.fee) && e.feeC === C.fee ? ok(`${label}/A: 升級效果列「${e.nm}」粉名稱＋金色「${e.fee}」`) : fix(`${label}/A: 升級效果列不符:${JSON.stringify(e)}`);
      // 升級
      await page.click('#inspect-foot [data-action=upgrade]'); await settle(page, 400);
      const lv = await getS(page, s => s.buildings.forge); r = await readInsp();
      lv === 3 && r.title === 'Lv.3 鐵匠鋪' ? ok(`${label}/A: 底部「升級」真的升級(Lv.2→Lv.${lv}),標題跟著變「${r.title}」`) : fix(`${label}/A: 升級後等級 ${lv}、標題「${r.title}」`);
      // 移動位置
      await page.click('#inspect-ghost .z1-ghost'); await settle(page, 300);
      const placing = await page.evaluate(() => !document.querySelector('#placement')?.classList.contains('hidden'));
      placing ? ok(`${label}/A: 「移動位置」進入放置模式`) : fix(`${label}/A: 按「移動位置」沒有進入放置模式`);
      await page.evaluate(() => document.querySelector('#placement [data-action=cancelMove]')?.click()); await settle(page, 200); await closeAll(page);

      // 資源不足:提示框粉紅字、升級鈕灰
      await setS(page, s => { s.buildings.hall = 4; s.buildings.house = 2; s.gold = 100; s.wood = 5; s.ore = 0; });
      await openInsp('house'); r = await readInsp();
      const sh = r.req.chips.filter(c => c.short), fu2 = r.foot.find(b => b.act === 'upgrade');
      sh.length >= 2 && sh.every(c => c.c === C.no) && r.req.noteC === C.no && /還缺/.test(r.req.note) && fu2 && fu2.dis && fu2.bg === C.gray ? ok(`${label}/A: 缺資源:需求粉紅字、說明「${r.req.note.slice(0, 18)}…」、升級鈕灰色停用`) : fix(`${label}/A: 缺資源狀態不符:${JSON.stringify({ sh, note: r.req.noteC, fu2 })}`);
      // 滿級
      await setS(page, s => { s.buildings.hall = 5; s.buildings.house = 5; });
      await openInsp('house'); r = await readInsp();
      const row = r.rows[0], noUp = !r.foot.some(b => b.act === 'upgrade');
      noUp && r.footN === '1' && /已達最高等級/.test(r.req.done) && r.req.doneC === C.ok && row && row.btn && row.btn.t === 'MAX' && row.btn.bg === C.gray && row.btn.dis ? ok(`${label}/A: 滿級:不放升級鈕、綠字「${r.req.done}」、清單列灰色 MAX`) : fix(`${label}/A: 滿級狀態不符:noUp=${noUp} n=${r.footN} done=${r.req.done}/${r.req.doneC} row=${JSON.stringify(row?.btn)}`);
      await shot(page, `${name}-insp-max`);
      // 未建造
      await setS(page, s => { s.buildings.hall = 3; s.buildings.academy = 0; s.gold = 5000; s.wood = 500; s.ore = 500; });
      await openInsp('academy'); r = await readInsp();
      const cons = r.foot.find(b => b.act === 'construct');
      r.title === '學院' && cons && cons.t === '建造' && cons.bg === C.olive && !cons.dis ? ok(`${label}/A: 未建造:標題「${r.title}」、底部「建造」橄欖綠`) : fix(`${label}/A: 未建造狀態不符:title=${r.title} foot=${JSON.stringify(r.foot)}`);
      await page.click('#inspect-foot [data-action=construct]'); await settle(page, 400);
      (await getS(page, s => s.buildings.academy)) === 1 ? ok(`${label}/A: 底部「建造」真的蓋出學院`) : fix(`${label}/A: 底部「建造」沒蓋出學院`);
      await closeAll(page);
    });

    // ───── B. 建設抽屜 ─────
    await scene('B', async () => {
      await setS(page, s => { s.buildings.hall = 2; s.gold = 200; s.wood = 660; s.ore = 5; s.buildings.academy = 0; s.buildings.training = 0; s.buildings.forge = 2; });
      await closeAll(page); await L.act(page, 'build'); await settle(page, 500);
      const r = await page.evaluate(() => {
        const cs = (e, p) => e ? getComputedStyle(e)[p] : null, z = e => e.currentCSSZoom || 1;
        return [...document.querySelectorAll('#modal-content .building-card')].map(c => ({
          id: c.dataset.id, unbuilt: c.classList.contains('unbuilt'), use: c.querySelector('.bc-use')?.textContent.trim() || '', useF: c.querySelector('.bc-use') ? parseFloat(cs(c.querySelector('.bc-use'), 'fontSize')) * z(c.querySelector('.bc-use')) : 0,
          btn: c.querySelector('.hv-btn')?.textContent.trim() || '', btnDis: !!c.querySelector('.hv-btn')?.disabled,
          costs: [...c.querySelectorAll('.hv-cost')].map(x => ({ short: x.classList.contains('short'), f: parseFloat(cs(x.querySelector('b'), 'fontSize')) * z(x), c: cs(x.querySelector('b'), 'color'), title: x.title })),
          i: (() => { const i = c.querySelector('.hv-i'); if (!i) return null; const r = i.getBoundingClientRect(), s = i.querySelector('span'); return { w: r.width, h: r.height, bg: cs(s, 'backgroundColor'), sw: s.getBoundingClientRect().width }; })(),
        }));
      });
      const unb = r.filter(c => c.unbuilt), built = r.filter(c => !c.unbuilt);
      unb.length >= 2 && unb.every(c => c.use.length >= 6 && c.useF >= 11.9) ? ok(`${label}/B: 未建造卡 ${unb.length} 張都有用途說明(≥12px),例:${unb[0].id}「${unb[0].use.slice(0, 14)}」`) : fix(`${label}/B: 未建造的建築卡要有用途說明:${JSON.stringify(unb.map(c => [c.id, c.use.length, c.useF]))}`);
      built.some(c => c.use) ? fix(`${label}/B: 已建造的卡不該再放用途說明`) : ok(`${label}/B: 已建造的卡沒有多餘用途說明`);
      const costs = r.flatMap(c => c.costs);
      costs.length && costs.every(c => c.f >= 11.9) ? ok(`${label}/B: 成本字 ≥12px(最小 ${Math.min(...costs.map(c => c.f)).toFixed(1)})`) : fix(`${label}/B: 成本字小於 12px:${Math.min(...costs.map(c => c.f)).toFixed(1)}`);
      const shorts = costs.filter(c => c.short), fine = costs.filter(c => !c.short);
      shorts.length && shorts.every(c => /^rgb\(240, 138, 124\)$/.test(c.c)) && fine.every(c => c.c === C.white) ? ok(`${label}/B: 缺的成本項目 ${shorts.length} 個紅字、夠的白字`) : fix(`${label}/B: 缺的成本沒有紅標:${JSON.stringify(shorts.slice(0, 2))}`);
      // 缺料灰鈕寫全
      const ac = r.find(c => c.id === 'academy'), need = ac ? ac.costs.filter(c => c.short).map(c => c.title.split(' ')[0]) : [];
      const full = ac && ac.btnDis && /^缺 /.test(ac.btn) && !/等/.test(ac.btn) && need.length >= 2 && need.every(n => ac.btn.includes(n)) && (ac.btn.match(/、/g) || []).length === need.length - 1;
      full ? ok(`${label}/B: 缺料灰鈕寫全「${ac.btn}」(缺 ${need.join('、')})`) : fix(`${label}/B: 缺料按鈕要寫全缺的項目、不能有「等」:${JSON.stringify({ btn: ac?.btn, need })}`);
      const ii = r.map(c => c.i).filter(Boolean);
      ii.length && ii.every(i => i.bg === 'rgb(230, 180, 60)' && i.sw <= 26 && (!touch || (i.w >= 44 && i.h >= 44))) ? ok(`${label}/B: 「i」統一金色小方塊(${Math.round(ii[0].sw)}px,熱區 ${Math.round(ii[0].w)}×${Math.round(ii[0].h)})`) : fix(`${label}/B: 「i」鈕要金色小方塊且觸控熱區 ≥44:${JSON.stringify(ii[0])}`);
      await scan(page, `${label}/B 建設抽屜`, '#modal', v);
      await shot(page, `${name}-build`);
      // 建造／升級生效
      await setS(page, s => { s.gold = 9000; s.ore = 900; });
      await L.act(page, 'build'); await settle(page, 450);
      await page.click('#modal-content .building-card[data-id=academy] .hv-btn.primary'); await settle(page, 350);
      (await getS(page, s => s.buildings.academy)) === 1 ? ok(`${label}/B: 卡片「建造」真的蓋出學院`) : fix(`${label}/B: 卡片「建造」沒生效`);
      await page.click('#modal-content .building-card[data-id=forge] .hv-btn.primary'); await settle(page, 350);
      (await getS(page, s => s.buildings.forge)) === 3 ? ok(`${label}/B: 卡片「升級 Lv.3」真的升級`) : fix(`${label}/B: 卡片「升級」沒生效`);
      await closeAll(page);
    });

    // ───── C. 交易所 ─────
    await scene('C', async () => {
      await setS(page, s => { s.gold = 5000; for (const k of Object.keys(s.tradeRequests)) s.tradeRequests[k] = 0; s.tradeRequests.wood = 30; });
      await closeAll(page); await L.act(page, 'trade'); await settle(page, 500);
      const r = await page.evaluate(() => {
        const cs = (e, p) => e ? getComputedStyle(e)[p] : null, rows = [...document.querySelectorAll('#modal-content .trade-row')];
        const info = document.querySelector('#modal-content .z2b-info');
        return { info: info ? { bg: cs(info, 'backgroundColor'), t: info.textContent.trim(), cls: info.className } : null, n: rows.length, cols: new Set(rows.map(r => Math.round(r.getBoundingClientRect().left / 4))).size,
          cell: rows.map(r => ({ id: r.dataset.id, ic: !!r.querySelector('.hv-item-ic [data-icon]'), icR: r.querySelector('.hv-item-ic')?.getBoundingClientRect().width, nm: r.querySelector('.tr-name b')?.textContent.trim(), nmC: cs(r.querySelector('.tr-name b'), 'color'), sub: r.querySelector('.tr-name small')?.textContent.trim(), big: (() => { const b = r.querySelector('.tr-big .pixel-button'); return b ? { t: b.textContent.trim(), bg: cs(b, 'backgroundColor'), h: b.getBoundingClientRect().height, w: b.getBoundingClientRect().width } : null; })(),
            step: [...r.querySelectorAll('.tr-step button')].map(b => { const q = b.getBoundingClientRect(); return { d: b.dataset.d, w: q.width, h: q.height }; }), out: r.querySelector('.tr-step output')?.textContent.trim() })) };
      });
      r.info && r.info.bg === C.inset && r.info.t.length > 10 ? ok(`${label}/C: 上方說明框(內凹 ${C.inset})`) : fix(`${label}/C: 交易所上方要有說明框:${JSON.stringify(r.info)}`);
      r.n === 6 && r.cols === 3 ? ok(`${label}/C: 6 個物品 3 欄方格`) : fix(`${label}/C: 應 6 格 3 欄,實際 ${r.n} 格 ${r.cols} 欄`);
      const c0 = r.cell[0];
      c0 && c0.ic && c0.icR >= 48 && c0.nmC === C.white && /庫存 .* · \d+ 金\/份/.test(c0.sub) && c0.big && c0.big.bg === C.gold && /\+10/.test(c0.big.t) ? ok(`${label}/C: 每格 圖示框(${Math.round(c0.icR)}px)＋白名稱＋「${c0.sub}」＋金棕膠囊「${c0.big.t}」`) : fix(`${label}/C: 方格內容不符:${JSON.stringify(c0)}`);
      const steps = r.cell.flatMap(c => c.step), dset = new Set(steps.map(s => s.d));
      ['-10', '-1', '1'].every(d => dset.has(d)) && (!touch || steps.every(s => s.w >= 43.5 && s.h >= 43.5)) && r.cell.every(c => !touch || (c.big.h >= 43.5)) ? ok(`${label}/C: ±10／±1 步進都在格下方${touch ? '且熱區 ≥44' : ''}`) : fix(`${label}/C: 步進鈕缺或熱區不足:${[...dset]} ${steps.filter(s => s.w < 43.5 || s.h < 43.5).length} 顆太小`);
      await scan(page, `${label}/C 交易所`, '#modal', v);
      await shot(page, `${name}-trade`);
      // 數值照舊
      const q = async () => getS(page, s => s.tradeRequests.ore);
      const clickStep = async (id, d) => { await page.click(`#modal-content .trade-row[data-id=${id}] [data-action=tradeStep][data-d="${d}"]`); await settle(page, 220); };
      const q0 = await q(); await clickStep('ore', 10); const q1 = await q(); await clickStep('ore', 1); const q2 = await q(); await clickStep('ore', -1); await clickStep('ore', -10); const q3 = await q();
      q1 === q0 + 10 && q2 === q1 + 1 && q3 === q0 ? ok(`${label}/C: 鐵礦收購 ${q0}→+10→${q1}→+1→${q2}→−1,−10→${q3}(數值照舊)`) : fix(`${label}/C: 步進數值不對:${q0},${q1},${q2},${q3}`);
      await closeAll(page);
    });

    // ───── D. 倉庫 ─────
    await scene('D', async () => {
      await setS(page, s => { s.stocks.drink = 0; s.flour = 580; });
      await closeAll(page); await L.act(page, 'inventory'); await settle(page, 500);
      const r = await page.evaluate(() => {
        const cs = (e, p) => e ? getComputedStyle(e)[p] : null, z = e => e.currentCSSZoom || 1, cells = [...document.querySelectorAll('#modal-content .hv-sq')];
        return { n: cells.length, cols: new Set(cells.map(c => Math.round(c.getBoundingClientRect().left / 4))).size, ic: cells.every(c => c.querySelector('.sq-ic [data-icon]')), q: cells.every(c => c.querySelector('.sq-q')), nmF: Math.min(...cells.map(c => parseFloat(cs(c.querySelector('.si-nm'), 'fontSize')) * z(c.querySelector('.si-nm')))), nmC: cells[0] && cs(cells[0].querySelector('.si-nm'), 'color'), first: cells[0]?.querySelector('.sq-btn')?.getBoundingClientRect().height,
          tip: cells[0]?.querySelector('.sq-btn')?.dataset.tipUse != null };
      });
      r.n === 12 && r.cols >= 3 && r.ic && r.q && r.nmF >= 11.9 && r.nmC === C.white ? ok(`${label}/D: 倉庫 12 格方格、${r.cols} 欄、圖示框＋數量＋白名稱(${r.nmF}px)`) : fix(`${label}/D: 倉庫方格不符:${JSON.stringify(r)}`);
      r.tip ? ok(`${label}/D: 格子留有 data-tip-* 接點(Z2A 共用 tooltip)`) : fix(`${label}/D: 格子缺 data-tip-* 接點`);
      await page.click('#modal-content .hv-sq[data-id=flour] .sq-btn'); await settle(page, 350);
      const d = await page.evaluate(() => { const b = document.querySelector('#modal-content .z2b-detail'); return b ? { id: b.dataset.id, use: b.querySelector('.si-use')?.textContent || '', src: b.querySelector('.si-src')?.textContent || '', num: b.querySelector('.si-num')?.textContent || '', go: b.querySelector('[data-action]')?.textContent.trim(), bg: getComputedStyle(b).backgroundColor, sel: !!document.querySelector('.hv-sq.sel[data-id=flour]') } : null; });
      d && d.id === 'flour' && /香烤麵包/.test(d.use) && /來源/.test(d.src) && /單價/.test(d.num) && d.sel && d.bg === C.inset ? ok(`${label}/D: 點一格→詳情框「${d.use}」「${d.num}」`) : fix(`${label}/D: 點格子沒有詳情框:${JSON.stringify(d)}`);
      await scan(page, `${label}/D 倉庫`, '#modal', v);
      await shot(page, `${name}-inv`);
      await page.click('#modal-content .z2b-detail .pixel-button'); await settle(page, 450);
      (await page.evaluate(() => document.querySelector('#modal')?.dataset.type)) === 'trade' ? ok(`${label}/D: 詳情框「前往收購」開得到交易所`) : fix(`${label}/D: 詳情框的前往鈕沒有開交易所`);
      await closeAll(page);
    });

    // ───── E. 製作 ─────
    await scene('E', async () => {
      await setS(page, s => { s.stocks.drink = 0; s.flour = 3; s.herb = 60; s.cloth = 60; s.leather = 50; s.ore = 120; s.wood = 160; s.gearStock.weapon = 0; });
      await closeAll(page); await L.act(page, 'craft'); await settle(page, 500);
      const r = await page.evaluate(() => {
        const cs = (e, p) => e ? getComputedStyle(e)[p] : null, rows = [...document.querySelectorAll('#modal-content .zc-row')];
        return rows.map(row => ({ id: row.dataset.id, nm: row.querySelector('.z2b-nm')?.firstChild?.textContent.trim(), nmC: cs(row.querySelector('.z2b-nm'), 'color'), out: !!row.querySelector('.z2b-out'), ic: !!row.querySelector('.z2b-ic [data-icon]'),
          chips: [...row.querySelectorAll('.cost-chip')].map(c => ({ have: +c.dataset.have, need: +c.dataset.need, short: c.classList.contains('short'), col: cs(c.querySelector('b'), 'color'), t: c.textContent.replace(/\s+/g, ' ').trim() })),
          meta: row.querySelector('.zc-meta')?.textContent.trim(), main: (() => { const b = row.querySelector('.z2b-act .pixel-button:not(.hv-max)'); return b ? { t: b.textContent.trim(), bg: cs(b, 'backgroundColor'), dis: b.disabled, h: b.getBoundingClientRect().height } : null; })(), full: (() => { const b = row.querySelector('.hv-max'); return b ? { b: b.dataset.batches, w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height } : null; })() }));
      });
      r.length === 4 ? ok(`${label}/E: 生活物資 4 列清單`) : fix(`${label}/E: 製作應 4 列,實際 ${r.length}`);
      const food = r.find(x => x.id === 'food'), drink = r.find(x => x.id === 'drink');
      const bed = r.find(x => x.id === 'bed');
      bed && bed.ic && bed.nmC === C.pink && bed.chips.length && bed.main && bed.main.bg === C.gold && !bed.main.dis && /製作/.test(bed.main.t) ? ok(`${label}/E: 列=圖示格＋粉名稱＋材料 ${bed.chips.map(c => c.t).join('、')}＋金棕「製作」`) : fix(`${label}/E: 製作列不符:${JSON.stringify(bed)}`);
      food && food.chips[0].have === 3 && food.chips[0].need === 5 && food.chips[0].short && /材料不足/.test(food.meta) && food.main.dis && food.main.bg === C.gray && food.chips[0].col === C.no ? ok(`${label}/E: 材料不足:小麥粉 3/5 紅字＋「材料不足」＋灰色停用鈕`) : fix(`${label}/E: 小麥粉 3/5 的不足狀態不符:${JSON.stringify(food)}`);
      drink && drink.out ? ok(`${label}/E: 庫存 0 的「莓果飲品」列標「賣完了」`) : fix(`${label}/E: 庫存 0 的商品要標「賣完了」`);
      const dm = r.find(x => x.id === 'drink');
      dm && dm.full && dm.full.b && dm.full.w >= (touch ? 43.5 : 28) && dm.full.h >= (touch ? 43.5 : 28) ? ok(`${label}/E: 「做滿」小鈕在(${dm.full.b} 批,${Math.round(dm.full.w)}×${Math.round(dm.full.h)})`) : fix(`${label}/E: 缺「做滿」小鈕或熱區不足:${JSON.stringify(dm?.full)}`);
      await scan(page, `${label}/E 製作`, '#modal', v);
      await shot(page, `${name}-craft`);
      const b0 = await getS(page, s => s.stocks.drink);
      await page.click('#modal-content .zc-row[data-id=drink] [data-action=craftProduct]:not(.hv-max)'); await settle(page, 350);
      const b1 = await getS(page, s => s.stocks.drink);
      b1 === b0 + 10 ? ok(`${label}/E: 「製作」真的補貨(莓果飲品 ${b0}→${b1})`) : fix(`${label}/E: 製作沒生效 ${b0}→${b1}`);
      await setS(page, s => { s.herb = 60; });
      await settle(page, 250);
      const hasFull = await page.$('#modal-content .zc-row[data-id=drink] .hv-max');
      if (hasFull) { await hasFull.click(); await settle(page, 350); const b2 = await getS(page, s => s.stocks.drink); b2 > b1 + 10 ? ok(`${label}/E: 「做滿」一次做多批(${b1}→${b2})`) : fix(`${label}/E: 做滿沒多做:${b1}→${b2}`); } else fix(`${label}/E: 藥草 60 時應有做滿鈕`);
      await page.click('#modal-content [data-action=craftTab][data-id=gear]'); await settle(page, 350);
      const g = await page.evaluate(() => [...document.querySelectorAll('#modal-content .zc-row')].map(r => ({ id: r.dataset.id, btn: r.querySelector('.z2b-act .pixel-button')?.textContent.trim(), bg: getComputedStyle(r.querySelector('.z2b-act .pixel-button')).backgroundColor })));
      g.length === 2 && g.every(x => x.bg === C.gold) ? ok(`${label}/E: 裝備製作 2 列(${g.map(x => x.btn.replace(/\s+/g, '')).join('、')})金棕鈕`) : fix(`${label}/E: 裝備製作列不符:${JSON.stringify(g)}`);
      const w0 = await getS(page, s => s.gearStock.weapon); await page.click('#modal-content .zc-row[data-id=weapon] [data-action=craftGear]'); await settle(page, 300);
      (await getS(page, s => s.gearStock.weapon)) === w0 + 1 ? ok(`${label}/E: 「鍛造」生效`) : fix(`${label}/E: 鍛造沒生效`);
      await closeAll(page);
    });

    // ───── F. 委託 ─────
    await scene('F', async () => {
      await setS(page, s => { s.quest.index = 2; s.quest.claimed = false; s.quest.complete = true; s.quest.progress = 10; s.counts.traded = 10; });
      await closeAll(page); await L.act(page, 'quests'); await settle(page, 500);
      const r = await page.evaluate(() => {
        const cs = (e, p) => e ? getComputedStyle(e)[p] : null, rows = [...document.querySelectorAll('#modal-content .zq-row')];
        const seps = [...document.querySelectorAll('#modal-content .z2b-sep')].map(s => { const b = getComputedStyle(s, '::before'); return { t: s.textContent.trim(), lines: parseFloat(b.borderTopWidth) + parseFloat(b.borderBottomWidth) }; });
        return { n: rows.length, seps, rows: rows.map(r => ({ cls: r.className, h3: r.querySelector('h3')?.textContent.trim(), cap: r.querySelector('.zq-cap b')?.textContent.trim(), capR: r.querySelector('.zq-cap')?.getBoundingClientRect().width, rw: r.querySelector('.zq-reward')?.textContent.replace(/\s+/g, ' ').trim(), bg: cs(r, 'backgroundColor'), claim: (() => { const b = r.querySelector('.zq-claim'); return b ? { t: b.textContent.trim(), bg: cs(b, 'backgroundColor'), dis: b.disabled, h: b.getBoundingClientRect().height } : null; })(), tag: r.querySelector('.zq-tag')?.textContent.trim() })) };
      });
      const total = await getS(page, (s, g) => g.questList().length);
      r.n === total ? ok(`${label}/F: ${r.n} 個委託每個一列`) : fix(`${label}/F: 委託列數 ${r.n} != ${total}`);
      const cur = r.rows.find(x => /current/.test(x.cls)), done = r.rows.filter(x => /done/.test(x.cls)), locked = r.rows.filter(x => /locked/.test(x.cls));
      cur && /^\d+\/\d+$/.test(cur.cap) && cur.rw && /獎勵/.test(cur.rw) && cur.h3 ? ok(`${label}/F: 目前列:標題「${cur.h3}」、進度膠囊「${cur.cap}」、${cur.rw}`) : fix(`${label}/F: 目前列缺標題/膠囊/獎勵:${JSON.stringify(cur)}`);
      cur && cur.claim && cur.claim.t === '領取' && cur.claim.bg === C.gold && !cur.claim.dis && (!touch || cur.claim.h >= 43.5) ? ok(`${label}/F: 可領取=金棕「領取」(${Math.round(cur.claim.h)}px)`) : fix(`${label}/F: 可領取的列要金棕「領取」:${JSON.stringify(cur?.claim)}`);
      done.length && done.every(d => d.bg === C.done && /已完成/.test(d.tag)) ? ok(`${label}/F: 領過的 ${done.length} 列壓暗 ${C.done}＋灰色「已完成」`) : fix(`${label}/F: 領過的列要壓暗:${JSON.stringify(done.slice(0, 1))}`);
      locked.length && locked.every(d => /未解鎖/.test(d.tag)) ? ok(`${label}/F: 之後 ${locked.length} 列標「未解鎖」`) : fix(`${label}/F: 鎖住列不符`);
      r.seps.length >= 2 && r.seps.every(s => s.lines >= 2) ? ok(`${label}/F: 區段「${r.seps.map(s => s.t).join('｜')}」雙細線標籤`) : fix(`${label}/F: 章節分隔要有雙細線標籤:${JSON.stringify(r.seps)}`);
      await scan(page, `${label}/F 委託`, '#modal', v);
      await shot(page, `${name}-quests`);
      const i0 = await getS(page, s => s.quest.index);
      await page.click('#modal-content .zq-claim'); await settle(page, 450);
      const i1 = await getS(page, s => s.quest.index);
      i1 === i0 + 1 ? ok(`${label}/F: 按「領取」真的領到(第 ${i0 + 1} 章→第 ${i1 + 1} 章)`) : fix(`${label}/F: 領取沒生效 ${i0}→${i1}`);
      await closeAll(page);
    });

    // ───── G. 確認框 ─────
    await scene('G', async () => {
      await closeAll(page); await L.act(page, 'settings'); await settle(page, 450);
      await page.evaluate(() => { document.querySelector('#modal-content [data-action=reset]')?.scrollIntoView({ block: 'center' }); });
      await settle(page, 200);
      await page.click('#modal-content [data-action=reset]'); await settle(page, 450);
      const r = await page.evaluate(() => {
        const M = document.querySelector('#modal'), cs = (e, p) => e ? getComputedStyle(e)[p] : null, f = [...document.querySelectorAll('#modal-foot button')];
        const p = M.querySelector('.hv-confirm p'), a = M.querySelector('.z2b-ask');
        return { kind: M.dataset.kind, mode: M.dataset.mode, title: M.querySelector('#modal-title')?.textContent.trim(), titleOk: !!M.querySelector('.modal-title') && M.querySelector('.modal-title').getBoundingClientRect().height >= 38, p: p ? { t: p.textContent.trim(), bg: cs(p, 'backgroundColor') } : null, a: a ? { t: a.textContent.trim(), f: parseFloat(cs(a, 'fontSize')) } : null,
          foot: f.map(b => ({ t: b.textContent.trim(), act: b.dataset.action, bg: cs(b, 'backgroundColor'), w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height })), w: M.getBoundingClientRect().width };
      });
      r.kind === 'confirm' && r.mode === 'C' && r.titleOk && r.title ? ok(`${label}/G: C 小視窗,標題帶「${r.title}」(寬 ${Math.round(r.w)})`) : fix(`${label}/G: 確認框要是 C 小視窗+標題帶:${JSON.stringify(r)}`);
      r.p && r.p.bg === C.inset && r.p.t.length > 4 ? ok(`${label}/G: 說明在內凹框「${r.p.t.slice(0, 14)}…」`) : fix(`${label}/G: 說明要在內凹框(${C.inset}):${JSON.stringify(r.p)}`);
      r.a && /？$/.test(r.a.t) && r.a.f >= 15 ? ok(`${label}/G: 一行提問「${r.a.t}」`) : fix(`${label}/G: 要有一行提問:${JSON.stringify(r.a)}`);
      const yes = r.foot.find(b => b.act === 'confirmYes'), no = r.foot.find(b => b.act === 'confirmNo');
      yes && no && yes.t === '確認' && no.t === '取消' && yes.bg === C.olive && no.bg === C.red && yes.h >= (touch ? 43.5 : 38) && no.h >= (touch ? 43.5 : 38) ? ok(`${label}/G: 底部「確認」橄欖綠＋「取消」紅(高 ${Math.round(yes.h)})`) : fix(`${label}/G: 按鈕不符(確認 olive／取消 red):${JSON.stringify(r.foot)}`);
      await scan(page, `${label}/G 確認框`, '#modal', v);
      await shot(page, `${name}-confirm`);
      await page.click('#modal-foot [data-action=confirmNo]'); await settle(page, 350);
      (await page.evaluate(() => document.querySelector('#modal')?.dataset.type)) === 'settings' ? ok(`${label}/G: 「取消」回到設定`) : fix(`${label}/G: 取消沒有回到設定`);
      await setS(page, s => { s.gold = 7; });
      await page.evaluate(() => { document.querySelector('#modal-content [data-action=reset]')?.scrollIntoView({ block: 'center' }); }); await settle(page, 150);
      await page.click('#modal-content [data-action=reset]'); await settle(page, 350);
      await page.click('#modal-foot [data-action=confirmYes]'); await settle(page, 600);
      const gold = await getS(page, s => s.gold);
      gold > 100 ? ok(`${label}/G: 「確認」真的重置村莊(金幣 7→${gold})`) : fix(`${label}/G: 確認沒有重置(金幣 ${gold})`);
      await closeAll(page); await prep(page);
    });

    // ───── H. 賣完導引 ─────
    await scene('H', async () => {
      await closeAll(page);
      await setS(page, s => { s.buildings.tavern = 1; s.buildings.restaurant = 1; s.stocks.drink = 0; s.stocks.food = 30; s.visitors = []; s.quest.complete = false; });
      await settle(page, 900);
      const r = await page.evaluate(() => ({ badge: document.querySelector('#bottom-bar [data-action=inventory]')?.dataset.badge, ns: document.querySelector('#next-step .ns-tx')?.textContent || '', go: document.querySelector('#next-step .ns-go')?.textContent || '', key: document.querySelector('#next-step')?.dataset.key }));
      r.badge === '1' ? ok(`${label}/H: 倉庫頁籤待辦徽章 ${r.badge}`) : fix(`${label}/H: 商品賣完倉庫頁籤要有徽章:${JSON.stringify(r)}`);
      /莓果飲品賣完了，到倉庫的製作補貨/.test(r.ns) ? ok(`${label}/H: 顧問提示「${r.ns}」(${r.go})`) : fix(`${label}/H: 顧問要提示「○○賣完了，到倉庫的製作補貨」:${JSON.stringify(r)}`);
      if (/賣完了/.test(r.ns)) {
        await page.evaluate(() => document.querySelector('#next-step')?.click()); await settle(page, 450);
        const adv = await page.evaluate(() => ({ type: document.querySelector('#modal')?.dataset.type, go: document.querySelector('#modal [data-action=advisorGo],#modal [data-action=nextStepGo]')?.textContent.trim() }));
        adv.type === 'advisor' ? ok(`${label}/H: 點提示展開顧問框(${adv.go || '有動作鈕'})`) : fix(`${label}/H: 點提示沒有展開顧問框 ${JSON.stringify(adv)}`);
        await closeAll(page);
      }
      await setS(page, s => { s.stocks.drink = 30; }); await settle(page, 900);
      const r2 = await page.evaluate(() => ({ badge: document.querySelector('#bottom-bar [data-action=inventory]')?.dataset.badge || '', ns: document.querySelector('#next-step .ns-tx')?.textContent || '' }));
      r2.badge === '' && !/賣完了/.test(r2.ns) ? ok(`${label}/H: 補貨後徽章與提示都消失`) : fix(`${label}/H: 補貨後徽章／提示沒消失:${JSON.stringify(r2)}`);
      // 沒有對應設施就不提示(不要對沒蓋餐廳的玩家嘮叨)
      await setS(page, s => { s.buildings.tavern = 0; s.stocks.drink = 0; }); await settle(page, 900);
      const r3 = await page.evaluate(() => document.querySelector('#bottom-bar [data-action=inventory]')?.dataset.badge || '');
      r3 === '' ? ok(`${label}/H: 沒蓋酒館就不為飲品賣完提示`) : fix(`${label}/H: 沒蓋酒館卻有賣完徽章 ${r3}`);
    });
  } catch (e) { fix(`${label}: 整體例外 ${String(e.message || e).split('\n')[0].slice(0, 160)}`); }
  if (errs.length) fix(`${label}: 頁面錯誤 ${[...new Set(errs)].slice(0, 2).join(' | ')}`); else ok(`${label}: 沒有 console／page error`);
  await ctx.close();
}
await browser.close(); srv.stop();
for (const m of oks) console.log('ok ' + m);
if (fails.length) { for (const m of fails) console.log(' - FIX ' + m); console.log(`FAIL z2b-econ: ${fails.length} 項不符、${oks.length} 項 ok`); process.exit(1); }
console.log(`PASS z2b-econ: ${oks.length} 項 ok(建築詳情／建設／交易／倉庫／製作／委託／確認框／賣完導引,${only.join('、')})`);
