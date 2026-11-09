// panel-headers.mjs — T138：每個面板的標題帶（banner）版型統一
//   規則：所有面板最上面都有一個 .encounter-banner（icon + h3 標題 + p 說明），
//         h3 用 Ark Pixel、15px（手機 14px），比 modal 標題（24px）低一階；
//         #modal-content 內距 20px；沒有橫向捲動。
// Usage: node tools/checks/panel-headers.mjs
//        $env:SHOTS='1'; node tools/checks/panel-headers.mjs
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const ACTIONS = ['build', 'hunters', 'recruit', 'trade', 'craft', 'dispatchHunters', 'dungeon', 'arena', 'quests', 'inventory', 'difficulty', 'settings', 'help', 'boss', 'worldmap', 'codex'];
const fails = [], oks = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/panel-headers', { recursive: true });

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });

const openModal = (page, act) => page.evaluate(async a => {
  const close = document.querySelector('#modal [data-action="close"]');
  if (close) close.click();
  await new Promise(r => setTimeout(r, 120));
  if (a === 'codex') {
    const wm = document.createElement('button'); wm.dataset.action = 'worldmap'; wm.style.display = 'none';
    document.body.append(wm); wm.click(); wm.remove();
    await new Promise(r => setTimeout(r, 300));
    const cx = document.querySelector('#modal [data-action="codex"]');
    if (!cx) return false;
    cx.click();
  } else {
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
  const banner = modal.querySelector('.encounter-banner');
  const h3 = banner?.querySelector('h3');
  const p = banner?.querySelector('p');
  const h2 = modal.querySelector('.modal-title h2');
  const cs = getComputedStyle(content);
  const h3cs = h3 ? getComputedStyle(h3) : null;
  return {
    banner: banner ? Math.round(banner.getBoundingClientRect().height) : 0,
    icon: !!banner?.querySelector('i'),
    h3: h3 ? (h3.textContent || '').trim() : '',
    h3size: h3cs ? parseFloat(h3cs.fontSize) : 0,
    h3fam: h3cs ? h3cs.fontFamily : '',
    p: p ? (p.textContent || '').trim() : '',
    h2size: h2 ? parseFloat(getComputedStyle(h2).fontSize) : 0,
    padL: cs.paddingLeft, padT: cs.paddingTop,
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
    if (!m.banner || m.banner < 84) problems.push(`banner 高度 ${m.banner}`);
    if (!m.icon) problems.push('沒有 icon');
    if (!m.h3 || m.h3.length < 3) problems.push(`h3「${m.h3}」`);
    if (m.h3size < 14 || m.h3size > 16) problems.push(`h3 字級 ${m.h3size}`);
    if (!/Ark Pixel/.test(m.h3fam)) problems.push(`h3 字體 ${m.h3fam.split(',')[0]}`);
    if (!m.p || m.p.length < 8) problems.push(`說明太短「${m.p}」`);
    if (Math.abs(m.h2size - 24) > 0.6) problems.push(`modal 標題字級 ${m.h2size}`);
    if (m.padL !== '20px' || m.padT !== '20px') problems.push(`內距 ${m.padT}/${m.padL}`);
    if (m.hscroll > 1) problems.push(`橫向溢出 ${m.hscroll}px`);
    if (problems.length) bad.push(`${a}: ${problems.join('、')}`);
    if (process.env.SHOTS) await page.screenshot({ path: `output/panel-headers/${a}.png` });
  }
  if (bad.length) for (const b of bad) fix(b);
  else ok(`${ACTIONS.length} 個面板的標題帶都一致（icon＋15px 標題＋說明、banner ≥84px、modal 標題 24px、內距 20px、無橫向溢出）`);

  // 標題帶的層級：banner h3 一定要比 modal 標題小
  await openModal(page, 'inventory');
  const sizes = await page.evaluate(() => {
    const h2 = parseFloat(getComputedStyle(document.querySelector('#modal .modal-title h2')).fontSize);
    const h3 = parseFloat(getComputedStyle(document.querySelector('#modal .encounter-banner h3')).fontSize);
    return { h2, h3 };
  });
  if (!(sizes.h3 < sizes.h2)) fix(`層級不對：banner 標題 ${sizes.h3}px 沒有小於 modal 標題 ${sizes.h2}px`);
  else ok(`標題層級正確（modal ${sizes.h2}px > banner ${sizes.h3}px）`);

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
  for (const a of ['build', 'inventory', 'worldmap', 'codex']) {
    const opened = await openModal(page, a);
    if (!opened) { bad.push(`${a}: 打不開`); continue; }
    const m = await measure(page);
    if (m.missing) { bad.push(`${a}: 面板沒出現`); continue; }
    const problems = [];
    if (!m.banner) problems.push('沒有 banner');
    if (!m.h3) problems.push('沒有 h3');
    if (m.h3size > 15.5) problems.push(`手機 h3 ${m.h3size}px 太大`);
    if (m.hscroll > 1) problems.push(`橫向溢出 ${m.hscroll}px`);
    if (problems.length) bad.push(`phone ${a}: ${problems.join('、')}`);
    if (process.env.SHOTS && a === 'codex') await page.screenshot({ path: 'output/panel-headers/phone-codex.png' });
  }
  if (bad.length) for (const b of bad) fix(b);
  else ok('phone 402x712 抽查 build／inventory／worldmap／codex 都有標題帶、字級縮小、沒有橫向溢出');
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
console.log('PASS panel headers: 每個面板最上方都有同一個標題帶（icon＋15px 標題＋說明），缺的兩個（世界地圖、魔物圖鑑）已補上，標題層級、內距與寬度一致');
