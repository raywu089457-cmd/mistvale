// hv-phase3-shots.mjs — 獵魔村風格第三階段的改前/改後截圖(只在這支腳本裡改測試狀態,不動遊戲邏輯)。
// 用法: node pipeline/scripts/ui-audit/hv-phase3-shots.mjs <outdir> [shots]
//   shots 逗號分隔: hunter(獵人詳情)、dispatch(手機派遣面板捲到底)、states(獵人狀態底色)、pause(手機暫停標籤＋資訊小卡)
//   輸出 <outdir>/hunter-1440.png hunter-390.png dispatch-390.png states-1440.png states-390.png pause-390.png,
//   並把狀態底色的實際顏色與文字對比寫進 <outdir>/states.json(對比 = 文字色對卡片底色漸層最亮與最暗兩端的最小值)。
import { createRequire } from 'module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');
const OUT = path.resolve(process.argv[2] || 'output/ui-audit/hv-phase3');
const WANT = (process.argv[3] || 'hunter,dispatch,states,pause').split(',');
fs.mkdirSync(OUT, { recursive: true });
const TARGET = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] });

async function open(w, h) {
  const phone = Math.min(w, h) < 600;
  const ctx = await b.newContext(phone ? { viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: w, height: h } });
  await ctx.addInitScript(() => { try { localStorage.setItem('mistvale-touch-tip', '1'); } catch {} });   // 觸控首次提示 toast 會蓋住畫面底部,截圖時先標記已看過
  const page = await ctx.newPage();
  await page.goto(TARGET, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 120000 });
  await page.evaluate(() => { const g = globalThis.__mistvaleGame; for (const id of Object.keys(g.state.buildings)) g.state.buildings[id] = Math.max(1, g.state.buildings[id]); });
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation-duration:0s!important;animation-delay:0s!important;caret-color:transparent!important}' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { globalThis.__mistvaleGame.state.paused = true; });
  const clearToasts = () => page.evaluate(() => document.querySelectorAll('#toasts .toast').forEach(t => t.remove()));
  const act = (a, id) => page.evaluate(([a, id]) => { const el = document.createElement('button'); el.dataset.action = a; if (id != null) el.dataset.id = id; el.style.display = 'none'; document.body.append(el); el.click(); el.remove(); }, [a, id]);
  return { ctx, page, act, phone, clearToasts };
}

// 對比:WCAG 相對亮度
const CONTRAST = `(() => {
  const lin = c => { c /= 255; return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); };
  const L = ([r, g, bl]) => .2126 * lin(r) + .7152 * lin(g) + .0722 * lin(bl);
  window.__cr = (a, b2) => { const la = L(a), lb = L(b2); return (Math.max(la, lb) + .05) / (Math.min(la, lb) + .05); };
  window.__rgb = s => { const m = String(s).match(/[\\d.]+/g) || []; return m.slice(0, 3).map(Number); };
})()`;

if (WANT.includes('hunter')) for (const [w, h] of [[1440, 900], [390, 844]]) {
  const { ctx, page, act, clearToasts } = await open(w, h);
  await act('hunter', await page.evaluate(() => globalThis.__mistvaleGame.state.hunters[0].id));
  await page.waitForTimeout(700); await clearToasts();
  await page.screenshot({ path: path.join(OUT, `hunter-${w}.png`) });
  await ctx.close();
}

if (WANT.includes('dispatch')) {
  const { ctx, page, act, clearToasts } = await open(390, 844);
  await act('dispatchHunters'); await page.waitForTimeout(600);
  await page.evaluate(() => { const c = document.querySelector('#modal-content'); c.scrollTop = c.scrollHeight; });
  await page.waitForTimeout(300); await clearToasts();
  await page.screenshot({ path: path.join(OUT, 'dispatch-390.png') });
  // 另外量一份:捲到底時最後一張卡與固定條的間距、固定條是否不透明
  const m = await page.evaluate(() => {
    const c = document.querySelector('#modal-content'), go = c.querySelector('.dispatch-go'), last = [...c.querySelectorAll('.region-pick,.party-pick')].at(-1);
    const gb = go.getBoundingClientRect(), lb = last.getBoundingClientRect();
    return { gapLastCardToBar: Math.round(gb.top - lb.bottom), barBg: getComputedStyle(go).backgroundColor };
  });
  fs.writeFileSync(path.join(OUT, 'dispatch.json'), JSON.stringify(m, null, 1));
  await ctx.close();
}

if (WANT.includes('states')) for (const [w, h] of [[1440, 900], [390, 844]]) {
  const { ctx, page, act, clearToasts } = await open(w, h);
  // 只改測試狀態:六位獵人各設一種狀態(資料欄位與遊戲自己用的一樣:status 文字、hp、task)
  await page.evaluate(() => {
    const hs = globalThis.__mistvaleGame.state.hunters;
    const set = (i, o) => { if (hs[i]) Object.assign(hs[i], o); };
    set(0, { status: '狩獵中', task: 'hunt', hp: hs[0].maxHp });                  // hunt
    set(1, { status: '休息中', task: 'rest', hp: hs[1].maxHp });                  // rest
    set(2, { status: '正在用餐', task: 'eat', hp: hs[2].maxHp });                 // eat
    set(3, { status: '待命', task: null, hp: Math.max(1, Math.floor(hs[3].maxHp * 0.3)) });          // hurt(血量低,狀態字不能含「治療/休息」,否則會被判成 rest)
    set(4, { status: '倒下了', task: 'revive', hp: 0 });                          // down
    set(5, { status: '地下城遠征', task: 'dungeon', hp: hs[5].maxHp });            // away
    if (hs.length < 7) hs.push({ ...hs[0], id: 'tst7', name: '測試七', status: '待命', task: null, hp: hs[0].maxHp });   // idle(只在截圖腳本裡多放一位,湊滿七種狀態)
  });
  await act('hunters'); await page.waitForTimeout(900);
  await page.evaluate(CONTRAST);
  const info = await page.evaluate(() => {
    return [...document.querySelectorAll('.hv-hgrid .hv-hcard')].map(el => {
      const art = el.querySelector('.hc-art'), cs = getComputedStyle(art);
      const a = cs.getPropertyValue('--st-a').trim(), bb = cs.getPropertyValue('--st-b').trim();
      const hex = s => { const m = s.replace('#', ''); return [0, 2, 4].map(i => parseInt(m.slice(i, i + 2), 16)); };
      const card = getComputedStyle(el).backgroundColor;
      const txt = [['hc-name', el.querySelector('.hc-name')], ['hc-sub', el.querySelector('.hc-sub')], ['hc-status', el.querySelector('.hc-status')]].map(([k, n]) => ({
        k, text: n.textContent.trim(), color: getComputedStyle(n).color,
        // 狀態文字本身畫在 .hc-art 之外(卡片底色上);名字與職業也在卡片底色上
        cr: +window.__cr(window.__rgb(getComputedStyle(n).color), window.__rgb(card)).toFixed(2),
      }));
      return { state: el.dataset.state, name: el.querySelector('.hc-name').textContent, from: a, to: bb, card, text: txt,
        // 立繪底漸層上方(--st-a)與下方(--st-b)互相的對比;越低越難分辨相鄰狀態
        gradient: { a, b: bb } };
    });
  });
  // 狀態之間是否可區分:兩兩比較漸層上緣色的 RGB 距離
  const hex = s => { const m = s.replace('#', ''); return [0, 2, 4].map(i => parseInt(m.slice(i, i + 2), 16)); };
  const dist = (x, y) => Math.round(Math.hypot(...hex(x).map((v, i) => v - hex(y)[i])));
  const pairs = [];
  for (let i = 0; i < info.length; i++) for (let j = i + 1; j < info.length; j++) pairs.push({ a: info[i].state, b: info[j].state, dTop: dist(info[i].from, info[j].from), dBottom: dist(info[i].to, info[j].to) });
  const minDist = Math.min(...pairs.map(p => p.dTop)), minCr = Math.min(...info.flatMap(c => c.text.map(t => t.cr)));
  const kinds = [...new Set(info.map(c => c.state))].sort();
  fs.writeFileSync(path.join(OUT, `states-${w}.json`), JSON.stringify({ kinds, minPairDistanceTop: minDist, minTextContrast: minCr, cards: info, pairs }, null, 1));
  await clearToasts();
  await page.screenshot({ path: path.join(OUT, `states-${w}.png`) });
  // 驗收:七種狀態都出現、任兩種狀態的底色上緣 RGB 距離 >= 40(看得出差別)、所有文字對卡片底 >= 4.5:1
  const ok = kinds.length === 7 && minDist >= 40 && minCr >= 4.5;
  console.log(`${ok ? 'PASS' : 'FAIL'} states ${w}: kinds=${kinds.join('/')} minDistance=${minDist} minContrast=${minCr}`);
  if (!ok) process.exitCode = 1;
  await ctx.close();
}

if (WANT.includes('pause')) for (const [w, h] of [[390, 844], [844, 390]]) {
  const { ctx, page } = await open(w, h);
  // OLD_PAUSE=1:把第三階段之前的位置規則塞回去(暫停標籤貼在頁籤列上 8px、資訊小卡在 +34px),用來補拍「改前」圖
  if (process.env.OLD_PAUSE) await page.addStyleTag({ content: 'html body #game-ui #pause-label{bottom:calc(var(--hv-tab-h,60px) + env(safe-area-inset-bottom,0px) + 8px)!important}html body:has(#pause-label:not(.hidden)) #unit-card{bottom:calc(var(--bb,62px) + 34px)!important}' });
  await page.evaluate(() => { const g = globalThis.__mistvaleGame, v = globalThis.__mistvaleView, h = g.state.hunters[0]; g.state.paused = true; v.lookAt(h.x, h.z, 2.2); });
  await page.waitForTimeout(1200);
  await page.evaluate(() => globalThis.__mistvaleSelect('hunter:' + globalThis.__mistvaleGame.state.hunters[0].id));
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('#hv-sel [data-action=selInfo]')?.click());
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, `pause-${w}.png`) });
  const m = await page.evaluate(() => {
    const r = s => { const e = document.querySelector(s); if (!e) return null; const q = e.getBoundingClientRect(); const cs = getComputedStyle(e); return cs.display === 'none' || q.width === 0 ? null : { top: Math.round(q.top), bottom: Math.round(q.bottom), left: Math.round(q.left), right: Math.round(q.right) }; };
    return { pauseLabel: r('#pause-label'), unitCard: r('#unit-card'), paused: globalThis.__mistvaleGame.state.paused };
  });
  const L = m.pauseLabel, U = m.unitCard;
  // 兩者在水平方向有交集時,垂直間距要 >= 8px;沒有交集(橫向手機並排)也算分開
  const hOverlap = L && U && L.left < U.right && L.right > U.left;
  const gap = !L || !U ? null : !hOverlap ? 999 : Math.max(L.top - U.bottom, U.top - L.bottom);
  fs.writeFileSync(path.join(OUT, `pause-${w}.json`), JSON.stringify({ ...m, gap }, null, 1));
  const ok = !!L && !!U && gap >= 8;
  console.log(`${ok ? 'PASS' : 'FAIL'} pause+unit-card ${w}x${h}: gap=${gap}px (label ${JSON.stringify(L)}, card ${JSON.stringify(U)})`);
  if (!ok) process.exitCode = 1;
  await ctx.close();
}
await b.close();
console.log('hv-phase3-shots done →', OUT);
