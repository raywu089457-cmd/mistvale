// hv-fixb.mjs — FIX-B（2026-11-11）獵魔村風格缺口補完的驗收：
//   缺口 1 載入畫面（沒有木牌／金色雙框／金色進度條）、缺口 2/9/16 標題畫面（844×390 不裁切、炭黑小面板、hv 按鈕、小字 ≥12px）、
//   缺口 3 舊左面板（無 border-image、任務追蹤看得到）、缺口 5 建築詳情（底部抽屜幾何、手機滿寬、滿級改綠字）、
//   缺口 6 獵人名冊格（手機 4 欄、桌機 6 欄一列）、缺口 10 卡片只留一顆滿寬主按鈕（交易列／製作卡／區域卡）＋詳情頁按鈕一屏看得到、
//   缺口 11 對比 ≥4.5、缺口 13 指令面板、缺口 14 鎖頭、B6 建設卡「i」鈕 44px 熱區不被蓋。
// 沒給 TARGET 時自己在 127.0.0.1 開臨時 server.mjs（吃剛 build 好的 outputs/暮影村.html）；TARGET 可指到任何一台（含修前版本，用來證明檢查會紅）。
// 用法: node tools/checks/hv-fixb.mjs        環境變數 ONLY=G1,G3 只跑部分；SHOTS=dir 另存截圖
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let server = null, BASE = (process.env.TARGET || '').replace(/\?.*/, '');
if (!BASE) {
  const PORT = 6200 + Math.floor(Math.random() * 300);
  server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' }, stdio: 'ignore' });
  BASE = `http://127.0.0.1:${PORT}/`;
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE)).ok) break; } catch { } await new Promise(r => setTimeout(r, 200)); }
}
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = g => !ONLY || ONLY.includes(g);
const VIEWS = [
  { name: 'desktop 1440x900', w: 1440, h: 900, phone: false },
  { name: 'tablet 1024x768', w: 1024, h: 768, phone: false },
  { name: 'phone 390x844', w: 390, h: 844, phone: true },
  { name: 'land 844x390', w: 844, h: 390, phone: true },
];
let fails = 0, oks = 0;
const fix = m => { fails++; console.log('FIX ' + m); };
const ok = m => { oks++; console.log('ok  ' + m); };
const chk = (cond, okMsg, failMsg) => cond ? ok(okMsg) : fix(failMsg);
if (process.env.SHOTS) fs.mkdirSync(process.env.SHOTS, { recursive: true });

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });
const newCtx = v => browser.newContext(v.phone ? { viewport: { width: v.w, height: v.h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'zh-TW' } : { viewport: { width: v.w, height: v.h }, locale: 'zh-TW' });
const act = (page, a, id) => page.evaluate(([a, id]) => { const el = document.createElement('button'); el.dataset.action = a; if (id != null) el.dataset.id = id; el.style.display = 'none'; document.body.append(el); el.click(); el.remove(); }, [a, id]);
const RICH = () => { const g = globalThis.__mistvaleGame; Object.assign(g.state, { gold: 99999, wood: 9999, ore: 9999, herb: 9999, cloth: 9999, flour: 9999, leather: 9999, gems: 999 }); for (const id of Object.keys(g.state.buildings)) g.state.buildings[id] = Math.max(1, g.state.buildings[id]); };
const reset = async page => { await page.evaluate(() => { try { globalThis.__mistvaleCmdk?.close(); } catch { } try { globalThis.__mistvaleSelect?.(null); } catch { } document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click(); document.querySelector('#inspector:not(.hidden) [data-action=closeInspector]')?.click(); const lp = document.querySelector('#left-panel'); if (lp && !lp.classList.contains('hidden')) document.querySelector('[data-action=toggleLeft]')?.click(); globalThis.__mistvaleGame.state.paused = false; }); await page.evaluate(RICH); await page.mouse.move(2, 2); await page.waitForTimeout(250); };
async function boot(v) {
  const ctx = await newCtx(v); await ctx.addInitScript(() => { try { localStorage.setItem('mistvale-touch-tip', '1'); } catch { } });
  const page = await ctx.newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(String(e).slice(0, 160)));
  await page.goto(BASE + '?preview=1', { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
  await page.evaluate(RICH);
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation-duration:0s!important;animation-delay:0s!important;caret-color:transparent!important}' });
  await page.waitForTimeout(1800);
  return { ctx, page };
}
const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, name + '.png') }).catch(() => { }); };

// ───────── G1 載入畫面 ─────────
if (want('G1')) for (const v of [VIEWS[0], VIEWS[2]]) {
  const ctx = await newCtx(v); const page = await ctx.newPage();
  await page.route('**/media/**', async route => { await new Promise(r => setTimeout(r, 1500)); await route.continue().catch(() => { }); });
  await page.goto(BASE, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForSelector('#loading', { timeout: 30000 });
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const L = document.querySelector('#loading'), p = L.querySelector('.loading-plate'), bar = L.querySelector('.loading-bar'), fill = L.querySelector('#loading-bar');
    const pc = getComputedStyle(p), bc = getComputedStyle(bar), fc = getComputedStyle(fill), lc = getComputedStyle(L), pb = getComputedStyle(L, '::before');
    const rgb = s => (s.match(/[\d.]+/g) || []).map(Number);
    const lum = ([r, g, b]) => (.2126 * r + .7152 * g + .0722 * b) / 255;
    const gold = c => { const [r, g, b] = rgb(c); return r > 190 && g > 140 && b < 130; };
    return { plateBI: pc.borderImageSource, plateBorderW: parseFloat(pc.borderTopWidth), plateBorderLum: lum(rgb(pc.borderTopColor)), barBorderW: parseFloat(bc.borderTopWidth), barBorderLum: lum(rgb(bc.borderTopColor)), fillImg: fc.backgroundImage, fillGold: gold(fc.backgroundColor), fillAfter: (() => { const a = getComputedStyle(fill, '::after'); return a.content === 'none' || a.display === 'none' ? 'none' : a.backgroundImage; })(), rootImg: lc.backgroundImage, rootLum: lum(rgb(lc.backgroundColor)), beforeImg: pb.backgroundImage, shadow: pc.boxShadow };
  });
  const t = `載入畫面 ${v.name}`;
  chk(r.plateBI === 'none', `${t}: 面板沒有 border-image（木牌）`, `${t}: 面板還有 border-image（木牌九宮格）`);
  chk(r.plateBorderW <= 1.01 && r.plateBorderLum < .35, `${t}: 面板是 1px 暗線框（${r.plateBorderW}px）`, `${t}: 面板邊 ${r.plateBorderW}px／亮度 ${r.plateBorderLum.toFixed(2)}，不是 1px 暗線框（金色雙框）`);
  chk(r.barBorderW <= 1.01 && r.barBorderLum < .5, `${t}: 進度條外框 1px 暗線`, `${t}: 進度條外框 ${r.barBorderW}px／亮度 ${r.barBorderLum.toFixed(2)}（金色框）`);
  chk(!r.fillGold && r.fillImg === 'none' && r.fillAfter === 'none', `${t}: 進度條填色是硬邊單色（非金色、無光澤漸層）`, `${t}: 進度條填色是金色或有漸層／光澤（fill gold=${r.fillGold}, img=${r.fillImg.slice(0, 20)}, ::after=${r.fillAfter.slice(0, 20)}）`);
  chk(r.rootImg === 'none' && r.beforeImg === 'none' && r.rootLum < .08, `${t}: 底是炭黑單色（沒有插畫／漸層遮罩）`, `${t}: 底有插畫或漸層遮罩（img=${r.rootImg.slice(0, 20)}, ::before=${r.beforeImg.slice(0, 20)}, lum=${r.rootLum.toFixed(2)}）`);
  await shot(page, 'loading-' + v.w);
  await ctx.close();
}

// ───────── G2/G9/G16 標題畫面 ─────────
if (want('G2')) for (const v of [VIEWS[0], VIEWS[2], VIEWS[3]]) {
  const ctx = await newCtx(v); const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForSelector('#title-screen', { timeout: 120000 });
  await page.waitForTimeout(900);
  const r = await page.evaluate(() => {
    const t = document.querySelector('#title-screen'), inner = t.querySelector('.ts-inner'), cs = getComputedStyle(inner), ir = inner.getBoundingClientRect();
    const px = e => e ? parseFloat(getComputedStyle(e).fontSize) * (e.currentCSSZoom || 1) : 99;
    const btns = [...t.querySelectorAll('button')].map(b => { const c = getComputedStyle(b), q = b.getBoundingClientRect(); return { t: b.textContent.trim(), bgImg: c.backgroundImage, bg: c.backgroundColor, radius: parseFloat(c.borderTopLeftRadius), h: q.height, inView: q.top >= -.5 && q.bottom <= innerHeight + .5 }; });
    return { top: ir.top, bottom: ir.bottom, vh: innerHeight, bgImg: cs.backgroundImage, bgA: (cs.backgroundColor.match(/[\d.]+/g) || [])[3], radius: parseFloat(cs.borderTopLeftRadius), blur: cs.backdropFilter, meta: px(t.querySelector('.ts-meta')), hint: px(t.querySelector('.ts-hint')), btns, scrollable: inner.scrollHeight > inner.clientHeight + 1, ruleImg: getComputedStyle(t.querySelector('.ts-rule')).backgroundImage };
  });
  const t = `標題畫面 ${v.name}`;
  chk(r.top >= -.5 && r.bottom <= r.vh + .5, `${t}: .ts-inner 完整在視窗內（${Math.round(r.top)}–${Math.round(r.bottom)} / ${r.vh}）`, `${t}: .ts-inner 超出視窗（${Math.round(r.top)}–${Math.round(r.bottom)} / ${r.vh}），上下被裁`);
  chk(r.btns.every(b => b.inView), `${t}: 所有按鈕都在視窗內`, `${t}: 有按鈕在視窗外`);
  chk(r.radius <= 3 && r.bgImg === 'none' && (r.bgA === undefined || +r.bgA > .9), `${t}: 小面板炭黑實心、圓角 ${r.radius}px、無漸層`, `${t}: 面板圓角 ${r.radius}px／背景 ${r.bgImg.slice(0, 40)}（霧面漸層框）`);
  chk(r.ruleImg === 'none', `${t}: 分隔線不是金色漸層`, `${t}: 分隔線還是金色漸層`);
  chk(r.btns.every(b => b.bgImg === 'none' && b.radius <= 3), `${t}: 按鈕是 hv 實心樣式（無漸層、圓角 ≤3px）`, `${t}: 按鈕還是金箔漸層／圓角（${JSON.stringify(r.btns.map(b => [b.bgImg.slice(0, 12), b.radius]))}）`);
  chk(r.btns[0].bg === 'rgb(154, 51, 36)', `${t}: 主按鈕是磚紅`, `${t}: 主按鈕不是磚紅（${r.btns[0].bg}）`);
  chk(r.meta >= 11.95 && r.hint >= 11.95, `${t}: .ts-meta ${r.meta}px、.ts-hint ${r.hint}px ≥ 12`, `${t}: .ts-meta ${r.meta}px、.ts-hint ${r.hint}px < 12`);
  await shot(page, 'title-' + v.w + 'x' + v.h);
  await ctx.close();
}

// ───────── 其餘情境:每個視窗開一次遊戲 ─────────
const sceneNeeded = ['G3', 'G5', 'G6', 'G10', 'G11', 'G13', 'G14', 'B6'].some(want);
if (sceneNeeded) for (const v of VIEWS) {
  const { ctx, page } = await boot(v);
  const T = n => `${n} ${v.name}`;
  const portraitPhone = v.w <= 760, landscapeDrawer = v.h <= 520, drawerFull = v.w <= 760 && v.h > 520;   // FIX-D:橫向(高 ≤520)建築詳情改成右側抽屜 min(440px,52vw)

  // 缺口 3
  if (want('G3')) {
    await reset(page); await act(page, 'toggleLeft'); await page.waitForTimeout(450);
    const r = await page.evaluate(() => {
      const L = document.querySelector('#left-panel'), q = document.querySelector('#hv-quest'), cs = getComputedStyle(L);
      const qr = q.getBoundingClientRect(), lr = L.getBoundingClientRect(), hit = document.elementFromPoint(qr.left + qr.width / 2, qr.top + qr.height / 2);
      return { open: !L.classList.contains('hidden'), bi: cs.borderImageSource, border: parseFloat(cs.borderTopWidth), inner: [...L.querySelectorAll('*')].filter(e => getComputedStyle(e).borderImageSource !== 'none').length, qVisible: qr.width > 0 && qr.height > 0 && getComputedStyle(document.querySelector('#hv-left')).display !== 'none' && getComputedStyle(q).visibility !== 'hidden', qHit: !!hit && (hit === q || q.contains(hit)), overlap: Math.min(qr.bottom, lr.bottom) - Math.max(qr.top, lr.top) > 1 && Math.min(qr.right, lr.right) - Math.max(qr.left, lr.left) > 1 };
    });
    chk(r.open, T('舊左面板') + ': 打得開', T('舊左面板') + ': 按村務鈕沒打開');
    chk(r.bi === 'none' && r.border === 0 && r.inner === 0, T('舊左面板') + ': 沒有 border-image／棕框', T('舊左面板') + `: 還有 border-image（aside ${r.bi.slice(0, 12)}、邊 ${r.border}px、內部 ${r.inner} 個）`);
    if (landscapeDrawer) {   // Z2D R10(ui-hv.css「橫向左側委託面板」):橫向面板自己就是委託面板,#hv-quest 刻意藏起來(visibility:hidden)避免與面板重複;改驗面板裡的委託區塊看得到
      const qp = await page.evaluate(() => { const e = document.querySelector('#left-panel .quest-panel'), q = document.querySelector('#hv-quest'); if (!e) return null; const r = e.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(20, r.height / 2)); return { vis: r.width > 0 && r.height > 0, hit: !!hit && e.contains(hit), trackerHidden: getComputedStyle(q).visibility === 'hidden' }; });
      chk(qp && qp.vis && qp.hit && qp.trackerHidden, T('舊左面板') + ': 橫向面板內的委託區塊看得到、點得到,任務追蹤讓位(Z2D R10)', T('舊左面板') + `: 橫向委託區塊不可用(${JSON.stringify(qp)})`);
    } else
    chk(r.qVisible && r.qHit && !r.overlap, T('舊左面板') + ': 打開時任務追蹤仍看得到、點得到、不互蓋', T('舊左面板') + `: 任務追蹤被藏起來或被蓋住（visible=${r.qVisible}, hit=${r.qHit}, overlap=${r.overlap}）`);
    await shot(page, 'leftpanel-' + v.w + 'x' + v.h);
  }

  // 缺口 5 + 14（建築詳情）
  if (want('G5') || want('G14')) {
    await reset(page); await page.evaluate(() => { const g = globalThis.__mistvaleGame; g.state.buildings.forge = 1; g.state.buildings.hall = 3; }); await act(page, 'selectBuilding', 'forge'); await page.waitForTimeout(500);
    const geo = () => page.evaluate(() => {
      const I = document.querySelector('#inspector'), r = I.getBoundingClientRect(), bar = document.querySelector('#bottom-bar').getBoundingClientRect(), note = I.querySelector('.inspect-note'), lv = I.querySelector('.inspect-level');
      const acts = [...I.querySelectorAll('.inspect-actions button')].map(b => ({ cls: b.className, bg: getComputedStyle(b).backgroundColor, dis: b.disabled }));
      const done = I.querySelector('.inspect-done');
      return { mode: I.dataset.mode, h: r.height, open: !I.classList.contains('hidden'), l: r.left, rr: innerWidth - r.right, w: r.width, gap: bar.top - r.bottom, noteW: note ? note.getBoundingClientRect().width : 0, lvPx: lv ? parseFloat(getComputedStyle(lv).fontSize) * (lv.currentCSSZoom || 1) : 0, acts, done: done ? { text: done.textContent.trim(), c: getComputedStyle(done).color } : null, lock: !!I.querySelector('.hv-lock'), I: I.scrollHeight > I.clientHeight + 1 };
    });
    if (want('G5')) {
      const g = await geo(); const W = Math.min(960, v.w - 32);
      chk(g.open, T('建築詳情') + ': 打得開', T('建築詳情') + ': 沒打開');
      // Z1(2026-11-12):建築詳情是 C 置中視窗(遮罩蓋頁籤列、水平置中、高 ≤ min(100vh−頁籤列−32,760)、橫向 ≤ 100%−24),不再是底部抽屜;完整幾何見 z1-shell.mjs
      const cw = landscapeDrawer ? Math.min(720, v.w * .92) : portraitPhone ? v.w * .85 : Math.min(560, v.w * .85);
      chk(g.mode === 'C' && Math.abs(g.l - g.rr) <= 1.5, T('建築詳情') + ': C 置中視窗且水平置中', T('建築詳情') + `: 不是置中 C 視窗(mode=${g.mode}、左 ${Math.round(g.l)}／右 ${Math.round(g.rr)})`);
      chk(Math.abs(g.w - cw) <= 2.5, T('建築詳情') + `: 寬 ${Math.round(g.w)}＝${Math.round(cw)}`, T('建築詳情') + `: 寬 ${Math.round(g.w)} 應 ${Math.round(cw)}`);
      chk(landscapeDrawer ? g.h <= v.h - 24 + 1.5 : g.gap >= 15, T('建築詳情') + ': 底緣離頁籤列 ≥16(橫向高 ≤ 100%−24)', T('建築詳情') + `: 底緣離頁籤列 ${Math.round(g.gap)}px／高 ${Math.round(g.h)}`);
      if (portraitPhone) chk(g.noteW >= g.w * .8, T('建築詳情') + `: 說明列用滿寬（${Math.round(g.noteW)}/${Math.round(g.w)}）`, T('建築詳情') + `: 說明列只有 ${Math.round(g.noteW)}px（擠成窄欄）`);
      chk(g.lvPx >= 11.95, T('建築詳情') + `: 等級字 ${g.lvPx}px ≥ 12`, T('建築詳情') + `: 等級字 ${g.lvPx}px < 12`);
      await shot(page, 'inspector-' + v.w + 'x' + v.h);
      // 滿級
      await reset(page); await page.evaluate(() => { globalThis.__mistvaleGame.state.buildings.forge = 5; }); await act(page, 'selectBuilding', 'forge'); await page.waitForTimeout(450);
      const m = await geo();
      chk(!m.acts.some(a => /gold/.test(a.cls) || a.bg === 'rgb(154, 51, 36)'), T('建築詳情(滿級)') + ': 沒有紅色主按鈕', T('建築詳情(滿級)') + ': 滿級還放紅色主按鈕');
      chk(m.done && /已達最高等級/.test(m.done.text) && (m.done.c.match(/\d+/g) || [])[1] > 170, T('建築詳情(滿級)') + ': 改成一行綠色「已達最高等級」', T('建築詳情(滿級)') + `: 沒有綠色狀態字（${JSON.stringify(m.done)}）`);
    }
    if (want('G14')) {
      await reset(page); await page.evaluate(() => { const g = globalThis.__mistvaleGame; g.state.buildings.hall = 1; g.state.buildings.forge = 2; }); await act(page, 'selectBuilding', 'forge'); await page.waitForTimeout(450);
      const g = await geo();
      chk(g.lock, T('鎖頭(建築詳情 先升級大廳)') + ': 有鎖頭', T('鎖頭(建築詳情 先升級大廳)') + ': 停用鈕沒有鎖頭');
    }
  }

  // 缺口 6 獵人名冊
  if (want('G6')) {
    await reset(page); await act(page, 'hunters'); await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#modal-content .hv-hcard')], rows = {};
      cards.forEach(c => { const k = Math.round(c.getBoundingClientRect().top / 8); (rows[k] = rows[k] || []).push(c); });
      const per = Object.values(rows).map(a => a.length), trunc = [];
      cards.forEach(c => c.querySelectorAll('.hc-name,.hc-sub,.hc-status,.hc-btns button').forEach(e => { if (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 2) trunc.push(e.className + ':' + e.textContent.trim().slice(0, 6)); }));
      const mb = Math.min(...cards.flatMap(c => [...c.querySelectorAll('button')].map(b => { const q = b.getBoundingClientRect(); return Math.min(q.width, q.height); })));
      const sc = document.querySelector('#modal-content');
      return { n: cards.length, per, trunc, mb, hs: sc.scrollWidth > sc.clientWidth + 1 };
    });
    const want1 = v.h <= 520 ? Math.min(r.n, 6) : v.w <= 760 ? 4 : Math.min(r.n, 6);
    chk(r.per[0] === want1, T('獵人名冊') + `: 每列 ${r.per.join('+')}（第一列 ${want1} 張）`, T('獵人名冊') + `: 第一列 ${r.per[0]} 張（應 ${want1}），分列 ${r.per.join('+')}`);
    chk(r.trunc.length === 0 && !r.hs, T('獵人名冊') + ': 卡片內容沒被截斷、沒有橫向捲動', T('獵人名冊') + `: 卡片內容被截斷 ${r.trunc.slice(0, 3).join(' ')}／橫向捲動 ${r.hs}`);
    if (v.phone) chk(r.mb >= 43.5, T('獵人名冊') + `: 按鈕熱區 ≥44（${Math.round(r.mb)}）`, T('獵人名冊') + `: 按鈕熱區 ${Math.round(r.mb)}px < 44`);
    await shot(page, 'hunters-' + v.w + 'x' + v.h);
  }

  // 缺口 10 卡片按鈕結構
  if (want('G10')) {
    const cardsOf = (sel) => page.evaluate(sel => [...document.querySelectorAll('#modal-content ' + sel)].map(c => { const cr = c.getBoundingClientRect(); const bs = [...c.querySelectorAll('button')].map(b => { const r = b.getBoundingClientRect(); return { w: r.width, h: r.height, f: r.width / cr.width }; }); const big = bs.filter(b => b.f >= .85), small = bs.filter(b => b.f < .85); return { big: big.length, small: small.length, minS: small.length ? Math.min(...small.map(b => Math.min(b.w, b.h))) : 99, maxS: small.length ? Math.max(...small.map(b => Math.max(b.w, b.h))) : 0 }; }), sel);
    const lim = v.phone ? 43.5 : 31.5;
    // Z2B(2026-11-12 圖鑑 e/f 節):交易列=方格(一顆滿寬金棕膠囊＋2×2 步進鈕,步進鈕不再是 ≤48 的小圖示鈕);製作卡=清單列(.zc-row:右側一顆金棕「製作」＋小鈕「做滿」,沒有滿寬鈕)
    for (const [scene, sel, label] of [['trade', '.trade-row', '交易列'], ['craft', '.zc-row', '製作卡'], ['worldmap', '.region-card', '區域卡']]) {
      await reset(page); await act(page, scene); await page.waitForTimeout(500);
      const cs = await cardsOf(sel);
      if (scene === 'craft') { chk(cs.length > 0 && cs.every(c => c.big === 0 && c.small >= 1 && c.minS >= lim), T(label) + `: ${cs.length} 列清單,每列右側金棕動作鈕＋小鈕(≥${lim}px)`, T(label) + `: 清單列按鈕結構不對(滿寬 ${[...new Set(cs.map(c => c.big))].join('/')}、小鈕 ${[...new Set(cs.map(c => c.small))].join('/')}、最小 ${Math.min(...cs.map(c => c.minS))})`); if (v.w === 1440 || v.w === 390) await shot(page, `${scene}-${v.w}x${v.h}`); continue; }
      if (scene === 'worldmap') {   // Z2C:區域卡改成清單列(.z2c-row):收合時只有「整列主鈕(展開詳情)＋前往/回村」兩顆看得到,「詳情」鈕收在展開區(寬 0),沒有滿寬鈕
        const rr = await page.evaluate(sel => [...document.querySelectorAll('#modal-content ' + sel)].map(c => { const bs = [...c.querySelectorAll('button')].map(b => { const r = b.getBoundingClientRect(); return { a: b.dataset.action, w: r.width, h: r.height }; }).filter(b => b.w > 0 && b.h > 0); return { acts: bs.map(b => b.a).sort().join(), min: bs.length ? Math.min(...bs.map(b => Math.min(b.w, b.h))) : 0 }; }), sel);
        chk(rr.length > 0 && rr.every(r => /^(regionRow,regionTravel|regionRow,regionView)$/.test(r.acts) && r.min >= lim), T(label) + `: ${rr.length} 列清單,每列 整列主鈕＋前往/回村 兩顆(≥${lim}px),詳情收在展開區`, T(label) + `: 區域清單列按鈕結構不對(${[...new Set(rr.map(r => r.acts))].join(' | ')}、最小 ${Math.min(...rr.map(r => r.min))})`);
        if (v.w === 1440 || v.w === 390) await shot(page, `${scene}-${v.w}x${v.h}`); continue;
      }
    // 2026-11-19：交易列每張卡的滿寬鈕數量會隨「有沒有庫存可賣」與「手機窄卡」變動，所以不能算顆數：
    //   每張卡必須剛好 1 顆金棕主鈕 tradeStep d=10 ＋ 1 顆持續收購開關 tradeStanding；
    //   其餘滿寬鈕只允許 matSell（賣給行商，有庫存才出現）與 tradeStep d=1（手機 113px 窄卡時「＋」自己佔滿第二列，才不會 <44px）。
    const bigActs = sel => page.evaluate(sel => [...document.querySelectorAll('#modal-content ' + sel)].map(c => { const cr = c.getBoundingClientRect(); return [...c.querySelectorAll('button')].filter(b => b.getBoundingClientRect().width / cr.width >= .85).map(b => (b.dataset.action || '') + (b.dataset.d ? ':' + b.dataset.d : '')); }), sel);
    const ba = await bigActs('.trade-row');
    const allow = new Set(['tradeStep:10', 'tradeStanding', 'matSell', 'tradeStep:1']);
    const mainOk = ba.length > 0 && ba.every(a => a.filter(x => x === 'tradeStep:10').length === 1 && a.filter(x => x === 'tradeStanding').length === 1 && a.every(x => allow.has(x)));
    chk(mainOk, T(label) + `: ${ba.length} 張卡每張 一顆金棕主鈕（收購 +10）＋一顆持續收購開關` + (ba.some(a => a.includes('matSell')) ? '（有庫存的卡另有「賣 N 份」）' : ''),
      T(label) + `: 每張卡要有 1 顆 tradeStep:10 主鈕＋1 顆 tradeStanding 開關,其餘滿寬鈕只能是 matSell／手機的 tradeStep:1.實際:${JSON.stringify([...new Set(ba.map(String))])}`);
      chk(cs.every(c => c.minS >= lim && (scene === 'trade' || c.maxS <= 48.5)), T(label) + `: 其餘動作是 ${v.phone ? 44 : 32}px 小圖示鈕`, T(label) + `: 小鈕尺寸不對（最小 ${Math.min(...cs.map(c => c.minS))}、最大 ${Math.max(...cs.map(c => c.maxS))}）`);
      if (v.w === 1440 || v.w === 390) await shot(page, `${scene}-${v.w}x${v.h}`);
    }
    // 製作與交易的功能不能少:-10/-1/+1/+10 都在、做滿在
    await reset(page); await act(page, 'trade'); await page.waitForTimeout(400);
    const ds = await page.evaluate(() => [...document.querySelectorAll('#modal-content .trade-row')][0] ? [...new Set([...document.querySelectorAll('#modal-content .trade-row')[0].querySelectorAll('[data-action=tradeStep]')].map(b => b.dataset.d))].sort().join(',') : '');
    chk(ds === '-1,-10,1,10', T('交易列') + ': −10／−1／＋1／＋10 四個動作都還在', T('交易列') + `: 動作不全（${ds}）`);
    await reset(page); await act(page, 'craft'); await page.waitForTimeout(400);
    const mx = await page.evaluate(() => document.querySelectorAll('#modal-content .zc-row [data-batches]').length);
    chk(mx >= 1, T('製作卡') + ': 「做滿」動作還在（小圖示鈕）', T('製作卡') + ': 做滿動作不見了');
    // 詳情頁(Z2A 改版):底部列 修煉(橄欖綠)＋關閉(紅),一屏看得到;學習技能／強化裝備／轉世在子頁籤清單列(見 z2a-hunter.mjs)
    const hid = await page.evaluate(() => globalThis.__mistvaleGame.state.hunters[0].id);
    await reset(page); await act(page, 'hunter', hid); await page.waitForTimeout(500);
    const hd = await page.evaluate(() => { const c = document.querySelector('#modal-content'), cr = c.getBoundingClientRect(); const bs = [...document.querySelectorAll('#modal-foot button')].map(b => { const r = b.getBoundingClientRect(); return { vis: r.top >= 0 && r.bottom <= innerHeight, red: getComputedStyle(b).backgroundColor === 'rgb(88, 104, 16)', lock: !!b.querySelector('.hv-lock'), dis: b.disabled }; }); return { n: bs.length, vis: bs.every(b => b.vis), red: bs.filter(b => b.red).length, lockOk: bs.filter(b => b.dis).every(b => b.lock) }; });
    chk(hd.n === 2 && hd.red === 1, T('獵人詳情') + ': 底部按鈕列 修煉＋關閉,只有 1 顆橄欖綠主按鈕(Z2A:其餘動作在子頁籤清單列)', T('獵人詳情') + `: 按鈕 ${hd.n} 顆、橄欖綠 ${hd.red} 顆`);
    chk(hd.vis, T('獵人詳情') + ': 全部按鈕一屏內看得到（不用捲動）', T('獵人詳情') + ': 有按鈕要捲動才看得到');
    await shot(page, `hunter-detail-${v.w}x${v.h}`);
    await reset(page); await act(page, 'regionDetail', 'meadow'); await page.waitForTimeout(500);
    // Z1:區域詳情的 前往(橄欖綠)＋返回地圖(紅)住在 C 視窗底部按鈕列;「在地圖上定位」留在內容裡(金棕清單動作)
    const rd = await page.evaluate(() => { const f = document.querySelector('#modal-foot'), fr = f.getBoundingClientRect(), bs = [...f.querySelectorAll('button')].map(b => { const r = b.getBoundingClientRect(), bg = getComputedStyle(b).backgroundColor; return { w: r.width, vis: r.top >= fr.top - .5 && r.bottom <= fr.bottom + .5, red: bg === 'rgb(88, 104, 16)', cancel: bg === 'rgb(141, 57, 37)' }; }); return { n: bs.length, red: bs.filter(b => b.red).length, cancel: bs.filter(b => b.cancel).length, vis: bs.every(b => b.vis), redWidest: true }; });
    chk(rd.n >= 2 && rd.red === 1 && rd.cancel === 1, T('區域詳情') + ': 底部按鈕列 = 一顆橄欖綠主動作(前往)＋一顆紅(返回)', T('區域詳情') + `: 主按鈕結構不對（按鈕 ${rd.n}、橄欖綠 ${rd.red}、紅 ${rd.cancel}）`);
    chk(rd.vis, T('區域詳情') + ': 按鈕列一屏內看得到', T('區域詳情') + ': 按鈕列在視窗外');
    if (v.h <= 520) {
      await reset(page); await act(page, 'recruit'); await page.waitForTimeout(500);
      const rc = await page.evaluate(() => { const c = document.querySelector('#modal-content'), cr = c.getBoundingClientRect(); const bs = [...c.querySelectorAll('.visitor-card button')]; return { n: bs.length, vis: bs.every(b => { const r = b.getBoundingClientRect(); return r.top >= cr.top - .5 && r.bottom <= cr.bottom + .5; }) }; });
      chk(rc.n > 0 && rc.vis, T('招募卡') + ': 橫向全部「邀請加入」鈕一屏內看得到', T('招募卡') + ': 橫向招募卡的按鈕要捲動才看得到');
    }
  }

  // 缺口 14 鎖頭（建設、難度、獵人詳情）
  if (want('G14')) {
    await reset(page); await page.evaluate(() => { const g = globalThis.__mistvaleGame; Object.assign(g.state, { gold: 200, wood: 40, ore: 12 }); g.state.buildings.hall = 1; }); await act(page, 'build'); await page.waitForTimeout(500);
    const lk = await page.evaluate(() => [...document.querySelectorAll('#modal-content .hv-btn.locked')].map(b => { const i = b.querySelector('.hv-lock'), r = i ? i.getBoundingClientRect() : null; return { has: !!i, w: r ? r.width : 0, img: i ? getComputedStyle(i).backgroundImage !== 'none' : false }; }));
    chk(lk.length > 0 && lk.every(l => l.has && l.w >= 8 && l.img), T('鎖頭(建設 需要大廳)') + `: ${lk.length} 顆鎖定鈕都畫出鎖頭`, T('鎖頭(建設 需要大廳)') + `: ${lk.length} 顆鎖定鈕，其中 ${lk.filter(l => !l.img).length} 顆鎖頭沒有圖（背景圖被蓋掉）`);
    await reset(page); await act(page, 'difficulty'); await page.waitForTimeout(450);
    const dl = await page.evaluate(() => [...document.querySelectorAll('#modal-content .difficulty-card.locked button:disabled')].map(b => { const i = b.querySelector('.hv-lock'); return { has: !!i, img: i ? getComputedStyle(i).backgroundImage !== 'none' : false }; }));
    chk(dl.length > 0 && dl.every(l => l.has && l.img), T('鎖頭(難度 未解鎖)') + `: ${dl.length} 顆都有鎖頭`, T('鎖頭(難度 未解鎖)') + `: ${dl.length} 顆未解鎖鈕沒有鎖頭圖示`);
    const hid = await page.evaluate(() => globalThis.__mistvaleGame.state.hunters[0].id);
    await reset(page); await act(page, 'hunter', hid); await page.waitForTimeout(450); await act(page, 'hunterTab', 'rebirth'); await page.waitForTimeout(250);   // Z2A:轉世在獵人卡的「轉世」子頁籤,條件不足＝aria-disabled(仍可點,點了用提示說明)
    const hl = await page.evaluate(() => { const b = document.querySelector('#modal-content [data-action=reincarnate]'); const i = b && b.querySelector('.hv-lock'); return { dis: b ? b.getAttribute('aria-disabled') === 'true' : null, has: !!i, img: i ? getComputedStyle(i).backgroundImage !== 'none' : false }; });
    chk(hl.dis && hl.has && hl.img, T('鎖頭(獵人詳情 轉世)') + ': 停用的轉世鈕有鎖頭', T('鎖頭(獵人詳情 轉世)') + `: 轉世鈕停用但沒有鎖頭（${JSON.stringify(hl)}）`);
  }

  // 缺口 11 對比
  if (want('G11')) {
    await reset(page); await act(page, 'hunter', await page.evaluate(() => globalThis.__mistvaleGame.state.hunters[0].id)); await page.waitForTimeout(400);
    const FN = `const P=s=>{const m=String(s).match(/[\\d.]+/g)||[];return{r:+m[0]||0,g:+m[1]||0,b:+m[2]||0,a:m.length>3?+m[3]:1}};const lin=c=>{c/=255;return c<=.03928?c/12.92:Math.pow((c+.055)/1.055,2.4)};const Lm=c=>.2126*lin(c.r)+.7152*lin(c.g)+.0722*lin(c.b);const CR=(a,b)=>{const x=Lm(a),y=Lm(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};const bgOf=e=>{for(let p=e;p;p=p.parentElement){const b=P(getComputedStyle(p).backgroundColor);if(b.a>.9)return b}return{r:20,g:17,b:15}};const cr=e=>{const cs=getComputedStyle(e);let op=1;for(let q=e;q;q=q.parentElement)op*=+getComputedStyle(q).opacity;const f=P(cs.color),bg=bgOf(e),a=f.a*op;return CR({r:f.r*a+bg.r*(1-a),g:f.g*a+bg.g*(1-a),b:f.b*a+bg.b*(1-a)},bg)};`;
    const c1 = await page.evaluate(`(()=>{${FN} const o={}; const add=(k,es)=>{es.forEach(e=>{(o[k]=o[k]||[]).push(cr(e))})}; add('頁籤列 kbd',[...document.querySelectorAll('#bottom-bar kbd')]); add('獵人詳情按鈕副標',[...document.querySelectorAll('#modal-content .hunter-actions small, #modal-content .hunter-actions small i')]); return Object.fromEntries(Object.entries(o).map(([k,v])=>[k,Math.min(...v)])); })()`);
    await reset(page); await act(page, 'difficulty'); await page.waitForTimeout(400);
    const c2 = await page.evaluate(`(()=>{${FN} const es=[...document.querySelectorAll('.diff-gate.short')]; return es.length?Math.min(...es.map(cr)):99})()`);
    await reset(page); await act(page, 'codex'); await page.waitForTimeout(500);
    const c3 = await page.evaluate(`(()=>{${FN} const es=[...document.querySelectorAll('.cx-card.unknown .cx-lore,.cx-card.unknown .cx-stats span,.cx-card.unknown .cx-drop,.cx-card.unknown .cx-nm')]; return es.length?Math.min(...es.map(cr)):99})()`);
    await reset(page); await page.evaluate(() => globalThis.__toast('獵人 艾登 升到 Lv.5', true, 'ok')); await page.waitForTimeout(500);
    const c4 = await page.evaluate(`(()=>{${FN} const e=document.querySelector('#toasts .toast-check'); if(!e) return 99; const cs=getComputedStyle(e); return CR(P(cs.color),P(cs.backgroundColor))})()`);
    const rows = { ...c1, '難度未解鎖說明 .diff-gate.short': c2, '圖鑑未知文字': c3, 'toast 勾勾': c4 };
    for (const [k, val] of Object.entries(rows)) chk(val >= 4.5, T('對比') + ` ${k} ${(+val).toFixed(2)}:1 ≥ 4.5`, T('對比') + ` ${k} ${(+val).toFixed(2)}:1 < 4.5`);
  }

  // 缺口 13 指令面板
  if (want('G13')) {
    await reset(page); await page.evaluate(() => globalThis.__mistvaleCmdk.open()); await page.waitForTimeout(350);
    const r = await page.evaluate(() => {
      const C = document.querySelector('#cmdk'), px = e => parseFloat(getComputedStyle(e).fontSize) * (e.currentCSSZoom || 1);
      const texts = [...C.querySelectorAll('*')].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).map(px);
      const rad = ['.cmdk-box', 'input', '.cmdk-esc', '.cmdk-key', '.cmdk-row'].map(s => { const e = C.querySelector(s); return e ? parseFloat(getComputedStyle(e).borderTopLeftRadius) : 0; });
      const ctl = [...C.querySelectorAll('input,.cmdk-esc,.cmdk-key')].map(e => e.getBoundingClientRect().height);
      return { blur: getComputedStyle(C).backdropFilter, rad: Math.max(...rad), font: Math.min(...texts), ctl: Math.min(...ctl) };
    });
    chk(r.blur === 'none', T('指令面板') + ': 沒有全螢幕 blur', T('指令面板') + `: 全螢幕 backdrop-filter ${r.blur}`);
    chk(r.rad <= 3, T('指令面板') + `: 圓角 ${r.rad}px ≤ 3`, T('指令面板') + `: 圓角 ${r.rad}px`);
    chk(r.font >= 11.95, T('指令面板') + `: 最小字 ${r.font}px ≥ 12`, T('指令面板') + `: 最小字 ${r.font}px < 12`);
    chk(r.ctl >= (v.phone ? 43.5 : 31.5), T('指令面板') + `: 控制項高 ≥ ${v.phone ? 44 : 32}（${Math.round(r.ctl)}）`, T('指令面板') + `: 控制項高 ${Math.round(r.ctl)}px`);
    await shot(page, 'cmdk-' + v.w + 'x' + v.h);
    await page.evaluate(() => globalThis.__mistvaleCmdk.close());
  }

  // B6 建設卡「i」鈕熱區
  if (want('B6')) {
    await reset(page); await act(page, 'build'); await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const cc = document.querySelector('#modal-content').getBoundingClientRect(), bad = []; let n = 0;
      document.querySelectorAll('#modal-content .hv-card .hv-i').forEach(b => { const r = b.getBoundingClientRect(); if (r.top < cc.top || r.bottom > cc.bottom) return; n++; const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 4, r.top + 4], [r.right - 4, r.top + 4], [r.left + 4, r.bottom - 4], [r.right - 4, r.bottom - 4]]; pts.forEach(([x, y], i) => { const t = document.elementFromPoint(x, y); if (!(t && (t === b || b.contains(t)))) bad.push(i + ':' + (t ? t.tagName + '.' + t.className : 'null')); }); });
      return { n, bad: bad.slice(0, 4), nb: bad.length };
    });
    chk(r.n > 0 && r.nb === 0, T('建設卡「i」鈕') + `: ${r.n} 顆的中心與四角（內縮 4px）都打得到自己`, T('建設卡「i」鈕') + `: ${r.nb} 個點被別的元素蓋住（${r.bad.join(' ')}）`);
  }
  if (page.errs.length) fix(T('頁面') + ' pageerror: ' + page.errs[0]);
  await ctx.close();
}
await browser.close();
if (server) try { server.kill(); } catch { }
if (fails) { console.log(`FAIL ${fails} 項不合（${oks} 項 ok）`); process.exit(1); }
console.log(`PASS FIX-B 風格缺口：${oks} 項（載入畫面／標題畫面／左面板／建築詳情／獵人名冊／卡片按鈕結構／對比／指令面板／鎖頭／i 鈕熱區）`);
