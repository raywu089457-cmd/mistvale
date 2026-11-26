// panel-headers.mjs — T138：每個面板的標題帶（banner）版型統一
//   規則：所有面板最上面都有一個 .encounter-banner（icon + h3 標題 + p 說明），
//         h3 用 Ark Pixel、15px（手機 14px），比 modal 標題（24px）低一階；
//         #modal-content 內距 20px；沒有橫向捲動。
// 2026-11-11 改寫（獵魔村風格第三階段）：新規格（UI-REF §4.3）把面板內的標題橫幅插畫整個拿掉，只留抽屜頂部的一個標題頁籤，
//   舊斷言（banner ≥84px、icon、15px h3、說明、modal 標題 24px、內距 20px）全部對應不到。「每個面板的標題一致」這個不變量換成：
//     * 面板內沒有任何 .encounter-banner（沒有橫幅插畫；若哪天又出現就紅）
//     * 抽屜頂部：#modal .modal-title h2 非空、Ark Pixel、14px，左邊 #modal-icon 有圖示，右上有 32px 圓形關閉鈕（手機 44px）
//     * 16 個面板的標題字級、字體、內容區內距（桌機 12px／手機 10px）、關閉鈕尺寸全部一致，沒有橫向捲動
//   舊的「banner 標題比 modal 標題小」層級斷言：沒有橫幅了，改成「標題 14px 不小於內容區內最大的 h3/h4 小標」。
// 2026-11-12 Z1:面板分兩種外殼——A 頁籤抽屜(標題＝頁籤、圖示、右上圓形 X、14px)與 C 置中視窗(置中標題 20px、沒有圖示與 X、底部按鈕列有關閉)。
//   兩種都要「同一模式內全部一致、沒有橫幅插畫、沒有橫向溢出」;有子頁籤的 A 抽屜(地下城／倉庫)以選中的子頁籤當標題。
// Usage: node tools/checks/panel-headers.mjs
//        $env:SHOTS='1'; node tools/checks/panel-headers.mjs
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const ACTIONS = ['build', 'hunters', 'recruit', 'trade', 'craft', 'dispatchHunters', 'dungeon', 'arena', 'quests', 'inventory', 'difficulty', 'settings', 'help', 'boss', 'codex'];
const fails = [], oks = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/panel-headers', { recursive: true });

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });

const openModal = (page, act) => page.evaluate(async a => {
  const close = document.querySelector('#modal [data-action="close"]');
  if (close) close.click();
  await new Promise(r => setTimeout(r, 120));
  {   // 世界地圖已移除:圖鑑直接用 data-action=codex 開
    const b = document.createElement('button'); b.dataset.action = a; b.style.display = 'none';
    document.body.append(b); b.click(); b.remove();
  }
  await new Promise(r => setTimeout(r, 360));
  return true;
}, act);

const measure = page => page.evaluate(() => {
  const modal = document.querySelector('#modal');
  const content = document.querySelector('#modal-content');
  if (!modal || modal.parentElement.classList.contains('hidden')) return { missing: true };
  const sub = modal.querySelector('#modal-subtabs:not([hidden]) .z1-subtab.on');
  const h2 = sub || modal.querySelector('.modal-title h2');
  const icon = sub || modal.querySelector('.modal-title #modal-icon');
  const close = modal.querySelector('.modal-title [data-action="close"]');
  const cs = getComputedStyle(content);
  const h2cs = h2 ? getComputedStyle(h2) : null;
  const heads = [...content.querySelectorAll('h3,h4')].filter(e => e.offsetParent).map(e => parseFloat(getComputedStyle(e).fontSize));
  const mr = modal.getBoundingClientRect(), hr = h2?.getBoundingClientRect();
  return {
    banners: modal.querySelectorAll('.encounter-banner').length,
    h2: h2 ? (h2.textContent || '').trim() : '',
    h2size: h2cs ? parseFloat(h2cs.fontSize) : 0,
    h2fam: h2cs ? h2cs.fontFamily : '',
    h2inside: !!hr && hr.width > 0 && hr.left >= mr.left - 1 && hr.right <= mr.right + 1,
    mode: modal.dataset.mode, footBtn: !!modal.querySelector('#modal-foot button') && modal.querySelector('#modal-foot button').getBoundingClientRect().height >= 40,
    icon: !!sub || (!!icon && !!icon.dataset.icon && icon.getBoundingClientRect().width > 0 && icon.innerHTML.trim().length > 0),
    closeW: close ? Math.round(close.getBoundingClientRect().width) : 0, closeH: close ? Math.round(close.getBoundingClientRect().height) : 0,
    maxSub: heads.length ? Math.max(...heads) : 0,
    padL: cs.paddingLeft, padT: cs.paddingTop, padR: cs.paddingRight,
    hscroll: content.scrollWidth - content.clientWidth,
    modalTop: Math.round(modal.getBoundingClientRect().top),
  };
});

// ── desktop：全部 16 個面板 ─────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-TW' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
  await page.waitForTimeout(1600);
  await page.evaluate(() => { globalThis.__mistvaleGame.state.paused = true; });

  const bad = [];
  for (const a of ACTIONS) {
    const opened = await openModal(page, a);
    if (!opened) { bad.push(`${a}: 打不開`); continue; }
    const m = await measure(page);
    if (m.missing) { bad.push(`${a}: 面板沒出現`); continue; }
    const problems = [];
    if (m.banners) problems.push(`面板內還有 ${m.banners} 個橫幅插畫`);
    if (!m.h2 || m.h2.length < 2) problems.push(`頂部標題「${m.h2}」`);
    if (!m.h2inside) problems.push('標題超出面板');
    if (m.mode === 'C') {
      if (m.icon) problems.push('C 視窗標題左邊不該有圖示');
      if (Math.abs(m.h2size - 20) > 0.6) problems.push(`C 視窗標題字級 ${m.h2size}（應 20）`);
      if (!/Ark Pixel/.test(m.h2fam)) problems.push(`標題字體 ${m.h2fam.split(',')[0]}`);
      if (m.closeW !== 0) problems.push(`C 視窗不該有右上 X（${m.closeW}x${m.closeH}）`);
      if (!m.footBtn) problems.push('C 視窗底部沒有按鈕列');
      if (m.padL !== '12px' || m.padT !== '12px') problems.push(`內距 ${m.padT}/${m.padL}/${m.padR}（C 視窗應為 12px）`);
    } else {
      if (!m.icon) problems.push('標題左邊沒有圖示');
      if (Math.abs(m.h2size - 14) > 0.6) problems.push(`標題字級 ${m.h2size}`);
      if (!/Ark Pixel/.test(m.h2fam)) problems.push(`標題字體 ${m.h2fam.split(',')[0]}`);
      if (m.closeW !== 32 || m.closeH !== 32) problems.push(`關閉鈕 ${m.closeW}x${m.closeH}（桌機 A 抽屜應為 32x32）`);
      if (m.maxSub > m.h2size + 0.6) problems.push(`內容小標 ${m.maxSub}px 比頂部標題 ${m.h2size}px 還大`);
      if (m.padL !== '12px' || m.padT !== '12px' || !['12px', '28px'].includes(m.padR)) problems.push(`內距 ${m.padT}/${m.padL}/${m.padR}（桌機應為 12px；可捲動時右內距 28px = 12 + 捲動箭頭專用邊）`);
    }
    if (m.hscroll > 1) problems.push(`橫向溢出 ${m.hscroll}px`);
    if (problems.length) bad.push(`${a}: ${problems.join('、')}`);
    if (process.env.SHOTS) await page.screenshot({ path: `output/panel-headers/${a}.png` });
  }
  if (bad.length) for (const b of bad) fix(b);
  else ok(`${ACTIONS.length} 個面板的標題外殼各模式一致（A 抽屜：圖示＋14px 標題＋32px X；C 視窗：20px 置中標題、沒有圖示與 X、底部按鈕列；沒有橫幅插畫、內距 12px、無橫向溢出）`);

  if (errs.length) fix(`desktop 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// ── phone：抽四個面板 ───────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 402, height: 712 }, locale: 'zh-TW', deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
  await page.waitForTimeout(1600);
  await page.evaluate(() => { globalThis.__mistvaleGame.state.paused = true; });
  const bad = [];
  for (const a of ['build', 'inventory', 'codex']) {
    const opened = await openModal(page, a);
    if (!opened) { bad.push(`${a}: 打不開`); continue; }
    const m = await measure(page);
    if (m.missing) { bad.push(`${a}: 面板沒出現`); continue; }
    const problems = [];
    if (m.banners) problems.push(`還有 ${m.banners} 個橫幅插畫`);
    if (!m.h2 || !m.h2inside) problems.push(`頂部標題「${m.h2}」不在面板內`);
    if (m.mode === 'C') {
      if (m.icon || m.closeW !== 0 || !m.footBtn) problems.push(`手機 C 視窗要沒有圖示與 X、底部有按鈕列（icon=${m.icon} X=${m.closeW} foot=${m.footBtn}）`);
      if (Math.abs(m.h2size - 20) > 0.6) problems.push(`手機 C 視窗標題 ${m.h2size}px 不是 20px`);
      if (m.padL !== '12px' || m.padT !== '12px') problems.push(`手機 C 視窗內距 ${m.padT}/${m.padL}/${m.padR}（應為 12px）`);
    } else {
      if (!m.icon) problems.push('標題左邊沒有圖示');
      if (m.h2size > 15.5 || m.h2size < 13.5) problems.push(`手機標題 ${m.h2size}px 不是 14px`);
      if (m.closeW < 44 || m.closeH < 44) problems.push(`手機關閉鈕 ${m.closeW}x${m.closeH}（觸控需 ≥44px）`);
      if (m.padL !== '10px' || m.padT !== '10px' || !['10px', '28px'].includes(m.padR)) problems.push(`手機內距 ${m.padT}/${m.padL}/${m.padR}（應為 10px；可捲動時右內距 28px）`);
    }
    if (m.hscroll > 1) problems.push(`橫向溢出 ${m.hscroll}px`);
    if (problems.length) bad.push(`phone ${a}: ${problems.join('、')}`);
    if (process.env.SHOTS && a === 'codex') await page.screenshot({ path: 'output/panel-headers/phone-codex.png' });
  }
  if (bad.length) for (const b of bad) fix(b);
  else ok('phone 402x712 抽查 build／inventory／codex 都有頂部標題與圖示、44px 關閉鈕、10px 內距、沒有橫幅插畫、沒有橫向溢出');
  if (errs.length) fix(`phone 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

await browser.close();
if (fails.length) {
  for (const f of fails) console.log('FIX ' + f);
  for (const o of oks) console.log('ok  ' + o);
  process.exit(1);
}
for (const o of oks) console.log('ok  ' + o);
console.log('PASS panel headers: 每個面板頂部都是同一種標題頁籤（圖示＋14px 標題＋關閉鈕），面板內沒有橫幅插畫，標題字級、內距、關閉鈕尺寸一致');
