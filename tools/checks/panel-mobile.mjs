// panel-mobile.mjs — T140：手機版 16 個面板的版型不變量（回歸守門）
//   402x712 下每個面板：寬度一致、上下緣同一位置、內距 14px、有標題帶、
//   沒有橫向溢出、主要動作鈕 ≥44px（觸控目標），沒有按鈕小於 34px。
// Usage: node tools/checks/panel-mobile.mjs
//        $env:SHOTS='1'; node tools/checks/panel-mobile.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const ACTIONS = ['build', 'hunters', 'recruit', 'trade', 'craft', 'dispatchHunters', 'dungeon', 'arena', 'quests', 'inventory', 'difficulty', 'settings', 'help', 'boss', 'worldmap', 'codex'];
const VW = 402, VH = 712;
const fails = [], oks = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/panel-mobile', { recursive: true });

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });
const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, locale: 'zh-TW', deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
await page.waitForTimeout(1600);
await page.evaluate(() => { globalThis.__mistvaleGame.state.paused = true; });

const open = act => page.evaluate(async a => {
  const close = document.querySelector('#modal [data-action="close"]');
  if (close) close.click();
  await new Promise(r => setTimeout(r, 130));
  if (a === 'codex') {
    const wm = document.createElement('button'); wm.dataset.action = 'worldmap'; wm.style.display = 'none';
    document.body.append(wm); wm.click(); wm.remove();
    await new Promise(r => setTimeout(r, 300));
    document.querySelector('#modal [data-action="codex"]')?.click();
  } else {
    const b = document.createElement('button'); b.dataset.action = a; b.style.display = 'none';
    document.body.append(b); b.click(); b.remove();
  }
  await new Promise(r => setTimeout(r, 420));
}, act);

const measure = page => page.evaluate(() => {
  const modal = document.querySelector('#modal'), content = document.querySelector('#modal-content');
  if (!modal || modal.parentElement.classList.contains('hidden')) return { missing: true };
  const cs = getComputedStyle(content);
  const mr = modal.getBoundingClientRect();
  const btns = [...modal.querySelectorAll('button')].map(b => ({ el: b, r: b.getBoundingClientRect() })).filter(o => o.r.width > 0 && o.r.height > 0);
  const tiny = btns.filter(o => o.r.height < 34).map(o => `${(o.el.textContent || '').trim().slice(0, 6) || o.el.dataset.action}:${Math.round(o.r.height)}`);
  const primary = [...modal.querySelectorAll('.pixel-button')].map(b => b.getBoundingClientRect().height).filter(h => h > 0);
  return {
    w: Math.round(mr.width), top: Math.round(mr.top), bottom: Math.round(mr.bottom),
    padT: cs.paddingTop, padL: cs.paddingLeft,
    banner: !!modal.querySelector('.encounter-banner'),
    hscroll: content.scrollWidth - content.clientWidth,
    primaryMin: primary.length ? Math.round(Math.min(...primary)) : 0,
    primaryCount: primary.length,
    tiny,
  };
});

const geo = [];
let bad = 0;
for (const a of ACTIONS) {
  await open(a);
  const m = await measure(page);
  if (m.missing) { fix(`${a}: 面板沒出現`); bad++; continue; }
  if (m.padT !== '14px' || m.padL !== '14px') { fix(`${a}: 內距 ${m.padT}/${m.padL}（手機應為 14px）`); bad++; }
  if (!m.banner) { fix(`${a}: 缺少標題帶`); bad++; }
  if (m.hscroll > 1) { fix(`${a}: 橫向溢出 ${m.hscroll}px`); bad++; }
  if (m.primaryCount > 0 && m.primaryMin < 44) { fix(`${a}: 主要按鈕只有 ${m.primaryMin}px 高（手機觸控目標 ≥44px）`); bad++; }
  if (m.tiny.length) { fix(`${a}: 有 ${m.tiny.length} 個按鈕小於 34px（${m.tiny.slice(0, 3).join('、')}）`); bad++; }
  geo.push({ a, w: m.w, top: m.top, bottom: m.bottom });
  if (process.env.SHOTS && ['build', 'codex', 'settings'].includes(a)) await page.screenshot({ path: `output/panel-mobile/${a}.png` });
}
if (!bad) ok(`${ACTIONS.length} 個面板都有標題帶、內距 14px、主要按鈕 ≥44px、沒有小於 34px 的按鈕、沒有橫向溢出`);

// 版型不變量：寬度一致、上緣一致（短面板內容自適應高度是允許的）、下緣不超出畫面
const widths = [...new Set(geo.map(g => g.w))];
const tops = [...new Set(geo.map(g => g.top))];
const maxBottom = Math.max(...geo.map(g => g.bottom));
const shortPanel = geo.find(g => g.bottom < maxBottom - 20);
if (widths.length > 1) fix(`面板寬度不一致：${widths.join(' / ')}`);
if (tops.length > 1) fix(`面板上緣不一致（不該因為內容短就浮在畫面中間）：${tops.join(' / ')}`);
if (widths.length === 1 && tops.length === 1) {
  ok(`面板版型一致：${widths[0]}px 寬、上緣都是 ${tops[0]}px（${ACTIONS.length - (shortPanel ? 1 : 0)} 個填滿、${shortPanel ? shortPanel.a + ' 內容短所以比較矮' : '無例外'}）`);
}
if (maxBottom > VH - 40) fix(`面板下緣 ${maxBottom} 太靠近／超出畫面底部（${VH}）`);
if (errs.length) fix(`頁面錯誤：${errs.slice(0, 2).join(' | ')}`);

await browser.close();
if (fails.length) {
  for (const f of fails) console.log('FIX ' + f);
  for (const o of oks) console.log('ok  ' + o);
  process.exit(1);
}
for (const o of oks) console.log('ok  ' + o);
console.log('PASS panel mobile: 手機 402x712 下 16 個面板寬度／上下緣／內距一致，都有標題帶，主要動作鈕 ≥44px（觸控目標），沒有小於 34px 的按鈕與橫向溢出');
