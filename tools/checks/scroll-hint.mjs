// scroll-hint.mjs — T139：面板內容比視窗高時，底部提示「還有內容」
//   規則：#modal[data-scroll="1"] 時提示可見；捲到底變 "end" 且提示收起；
//         內容放得下時 data-scroll 為空字串、提示 hidden。捲軸樣式也要是細的深色。
// Usage: node tools/checks/scroll-hint.mjs
//        $env:SHOTS='1'; node tools/checks/scroll-hint.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const fails = [], oks = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/scroll-hint', { recursive: true });

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });

const openPanel = (page, act) => page.evaluate(async a => {
  const close = document.querySelector('#modal [data-action="close"]');
  if (close) close.click();
  await new Promise(r => setTimeout(r, 120));
  if (a === 'codex') {
    const wm = document.createElement('button'); wm.dataset.action = 'worldmap'; wm.style.display = 'none';
    document.body.append(wm); wm.click(); wm.remove();
    await new Promise(r => setTimeout(r, 300));
    document.querySelector('#modal [data-action="codex"]').click();
  } else {
    const b = document.createElement('button'); b.dataset.action = a; b.style.display = 'none';
    document.body.append(b); b.click(); b.remove();
  }
  await new Promise(r => setTimeout(r, 420));
}, act);

const info = page => page.evaluate(() => {
  const m = document.querySelector('#modal'), c = document.querySelector('#modal-content'), h = document.querySelector('#scroll-hint');
  const cs = getComputedStyle(c);
  const hr = h.getBoundingClientRect(), mr = m.getBoundingClientRect();
  return {
    scroll: m.dataset.scroll ?? '', hidden: h.hidden, opacity: parseFloat(getComputedStyle(h).opacity),
    text: (h.textContent || '').trim(),
    over: c.scrollHeight - c.clientHeight, top: c.scrollTop,
    scrollbarWidth: cs.scrollbarWidth, scrollbarColor: cs.scrollbarColor,
    insideModal: hr.width > 0 && hr.bottom <= mr.bottom + 1 && hr.top >= mr.top - 1,
    pe: getComputedStyle(h).pointerEvents,
    closeHit: (() => { const b = document.querySelector('#modal [data-action="close"]').getBoundingClientRect(); const e = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return e ? (e.closest('[data-action]')?.dataset.action || e.tagName) : 'null'; })(),
  };
});

async function run(viewport, dsf, mobile, label) {
  const ctx = await browser.newContext({ viewport, locale: 'zh-TW', deviceScaleFactor: dsf, hasTouch: mobile, isMobile: mobile });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { globalThis.__mistvaleGame.state.paused = true; });

  // 長內容：魔物圖鑑
  await openPanel(page, 'codex');
  const a = await info(page);
  if (a.over <= 12) fix(`${label}: 測試前提不成立，圖鑑內容沒有超出視窗（over=${a.over}）`);
  else {
    if (a.scroll !== '1') fix(`${label}: 圖鑑可捲動但 modal data-scroll="${a.scroll}"`);
    if (a.hidden || a.opacity < 0.5) fix(`${label}: 可捲動時沒有顯示「還有內容」提示（hidden=${a.hidden} opacity=${a.opacity}）`);
    if (!/還有內容/.test(a.text)) fix(`${label}: 提示文字不對「${a.text}」`);
    if (!a.insideModal) fix(`${label}: 提示沒有貼在面板下緣`);
    if (a.pe !== 'none') fix(`${label}: 提示會擋點擊（pointer-events=${a.pe}）`);
    if (a.closeHit !== 'close') fix(`${label}: 提示蓋住了關閉鈕（命中 ${a.closeHit}）`);
    if (a.scrollbarWidth !== 'thin') fix(`${label}: 捲軸沒有套用細樣式（scrollbar-width=${a.scrollbarWidth}）`);
    if (!/^rgb\(138, 106, 54\)/.test(a.scrollbarColor)) fix(`${label}: 捲軸顏色不是設定的金屬色（${a.scrollbarColor}）`);
    if (!fails.length) ok(`${label}: 圖鑑可捲動（超出 ${a.over}px）→ 顯示「還有內容」提示、捲軸細且深色、提示不擋點擊`);
  }

  // 捲到底 → 提示收起
  await page.evaluate(() => { const c = document.querySelector('#modal-content'); c.scrollTop = c.scrollHeight; });
  await page.waitForTimeout(300);
  const b = await info(page);
  if (b.scroll !== 'end') fix(`${label}: 捲到底時 data-scroll 應為 "end"，實際 "${b.scroll}"`);
  if (!b.hidden || b.opacity > 0.1) fix(`${label}: 捲到底後提示沒有收起（hidden=${b.hidden} opacity=${b.opacity}）`);
  else if (b.scroll === 'end') ok(`${label}: 捲到底後提示收起（data-scroll=end）`);

  // 短內容：把面板內容換成一小段（模擬「放得下」的面板），再觸發一次同步
  await openPanel(page, 'settings');
  await page.evaluate(() => {
    document.querySelector('#modal-content').innerHTML = '<p style="padding:8px">短內容</p>';
    document.querySelector('#modal-content').dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(320);
  const c = await info(page);
  if (c.over > 12) fix(`${label}: 短內容仍然可捲（over=${c.over}），測試前提不成立`);
  else if (c.scroll !== '' || !c.hidden) fix(`${label}: 內容放得下時不該有提示（data-scroll="${c.scroll}" hidden=${c.hidden}）`);
  else ok(`${label}: 內容放得下時沒有提示（data-scroll 清空、提示收起）`);

  if (process.env.SHOTS && label === 'desktop') {
    await openPanel(page, 'codex');
    await page.screenshot({ path: 'output/scroll-hint/desktop.png' });
    await page.evaluate(() => { const c = document.querySelector('#modal-content'); c.scrollTop = 260; });
    await page.waitForTimeout(250);
    await page.screenshot({ path: 'output/scroll-hint/desktop-scrolled.png' });
  }
  if (errs.length) fix(`${label} 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

await run({ width: 1440, height: 900 }, 1, false, 'desktop');
await run({ width: 402, height: 712 }, 2, true, 'phone');

await browser.close();
if (fails.length) {
  for (const f of fails) console.log('FIX ' + f);
  for (const o of oks) console.log('ok  ' + o);
  process.exit(1);
}
for (const o of oks) console.log('ok  ' + o);
console.log('PASS scroll hint: 面板內容超出視窗時底部顯示「還有內容」提示（不擋點擊），捲到底自動收起；內容放得下時不出現；捲軸改成細的金屬深色');
