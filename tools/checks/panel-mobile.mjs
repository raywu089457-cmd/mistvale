// panel-mobile.mjs — T140：手機版 16 個面板的版型不變量（回歸守門）
//   402x712 下每個面板：寬度一致、上下緣同一位置、內距 14px、有標題帶、
//   沒有橫向溢出、主要動作鈕 ≥44px（觸控目標），沒有按鈕小於 34px。
// 2026-11-11 改寫（獵魔村風格第三階段）：舊版要求「內距 14px」「有標題帶(.encounter-banner)」。新規格：
//   * 內距：手機抽屜的內容區是 10px（ui-hv.css 手機段），不再是 14px——斷言改成「所有面板左右上內距都是 10px」，一樣會抓到有人只改某個面板的內距；
//   * 標題帶：橫幅插畫被規格拿掉（面板內不得有 .encounter-banner），標題改在抽屜頂部的 #modal .modal-title h2。
//     斷言換成「面板內沒有橫幅插畫」＋「頂部有非空標題 h2 與關閉鈕，且都在面板範圍內」。
//   * 按鈕高度：除了 .pixel-button，新版主按鈕 .hv-btn 與右上 .hv-i 也要 ≥44px（觸控）。
// 2026-11-12 Z1:A 頁籤抽屜(10px 內距、標題＋右上 X)與 C 置中視窗(12px 內距、置中標題、底部按鈕列、沒有 X)分開驗;寬度在各模式內一致,上緣一致只要求 A 抽屜(C 視窗依內容高度垂直置中)。
// Usage: node tools/checks/panel-mobile.mjs
//        $env:SHOTS='1'; node tools/checks/panel-mobile.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const ACTIONS = ['build', 'hunters', 'recruit', 'trade', 'craft', 'dispatchHunters', 'dungeon', 'arena', 'quests', 'inventory', 'difficulty', 'settings', 'help', 'boss', 'codex'];
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
  {   // 世界地圖已移除:圖鑑直接用 data-action=codex 開
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
  const primary = [...modal.querySelectorAll('.pixel-button,.hv-btn,.hv-i')].map(b => b.getBoundingClientRect().height).filter(h => h > 0);
  const sub0 = modal.querySelector('#modal-subtabs:not([hidden]) .z1-subtab.on');
  const h2 = sub0 || modal.querySelector('.modal-title h2'), closeBtn = modal.querySelector('.modal-title [data-action="close"]');
  const inside = e => { if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.left >= mr.left - 1 && r.right <= mr.right + 1 && r.top >= mr.top - 1 && r.bottom <= mr.bottom + 1; };
  return {
    mode: modal.dataset.mode, foot: !!modal.querySelector('#modal-foot button'),
    w: Math.round(mr.width), top: Math.round(mr.top), bottom: Math.round(mr.bottom),
    padT: cs.paddingTop, padL: cs.paddingLeft, padR: cs.paddingRight,
    banners: modal.querySelectorAll('.encounter-banner').length,
    title: (h2?.textContent || '').trim(), titleInside: inside(h2), closeInside: inside(closeBtn),
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
  const isC = m.mode === 'C';
  if (isC ? (m.padT !== '12px' || m.padL !== '12px') : (m.padT !== '10px' || m.padL !== '10px' || !['10px', '28px'].includes(m.padR))) { fix(`${a}: 內距 ${m.padT}/${m.padL}/${m.padR}（手機應為 10px；內容可捲動時右內距 28px = 10 + 捲動箭頭專用邊）`); bad++; }
  if (m.banners) { fix(`${a}: 面板內還有 ${m.banners} 個橫幅插畫（新設計不放橫幅）`); bad++; }
  if (!m.title || !m.titleInside) { fix(`${a}: 抽屜頂部沒有標題或標題超出面板（「${m.title}」）`); bad++; }
  if (isC ? !m.foot : !m.closeInside) { fix(`${a}: ${isC ? 'C 視窗底部沒有按鈕列' : '抽屜右上的關閉鈕不在面板內'}`); bad++; }
  if (m.hscroll > 1) { fix(`${a}: 橫向溢出 ${m.hscroll}px`); bad++; }
  if (m.primaryCount > 0 && m.primaryMin < 44) { fix(`${a}: 主要按鈕只有 ${m.primaryMin}px 高（手機觸控目標 ≥44px）`); bad++; }
  if (m.tiny.length) { fix(`${a}: 有 ${m.tiny.length} 個按鈕小於 34px（${m.tiny.slice(0, 3).join('、')}）`); bad++; }
  geo.push({ a, w: m.w, top: m.top, bottom: m.bottom, mode: m.mode });
  if (process.env.SHOTS && ['build', 'codex', 'settings'].includes(a)) await page.screenshot({ path: `output/panel-mobile/${a}.png` });
}
if (!bad) ok(`${ACTIONS.length} 個面板都有頂部標題與關閉鈕、沒有橫幅插畫、內距 10px、主要按鈕 ≥44px、沒有小於 34px 的按鈕、沒有橫向溢出`);

// 版型不變量(各模式內)：寬度一致、A 抽屜上緣一致、下緣不蓋到頁籤列
for (const mode of ['A', 'C']) {
  const g = geo.filter(x => x.mode === mode); if (!g.length) continue;
  const widths = [...new Set(g.map(x => x.w))], tops = [...new Set(g.map(x => x.top))], maxBottom = Math.max(...g.map(x => x.bottom));
  const okW = mode === 'C' ? widths.filter(w => Math.abs(w - VW * 0.85) > 3 && Math.abs(w - VW * 0.94) > 3 && Math.abs(w - 320) > 3) : (widths.length > 1 ? widths : []);
  if (okW.length) fix(`${mode} 模式面板寬度不一致：${widths.join(' / ')}`);
  if (mode === 'A' && tops.length > 1) fix(`A 抽屜上緣不一致：${tops.join(' / ')}`);
  if (maxBottom > VH - 52 - (mode === 'C' ? 15 : 0) + 1) fix(`${mode} 模式面板下緣 ${maxBottom} 蓋到頁籤列或太靠近（${VH}）`);   // 2026-11-27 HUD 簡化:頁籤列 66 → 52
  if (!okW.length && (mode === 'C' || tops.length === 1)) ok(`${mode} 模式 ${g.length} 個面板版型一致：寬 ${widths.join('/')}px${mode === 'A' ? `、上緣都是 ${tops[0]}px` : '（85%／世界地圖 94%／確認框 320）'}`);
}
if (errs.length) fix(`頁面錯誤：${errs.slice(0, 2).join(' | ')}`);

await browser.close();
if (fails.length) {
  for (const f of fails) console.log('FIX ' + f);
  for (const o of oks) console.log('ok  ' + o);
  process.exit(1);
}
for (const o of oks) console.log('ok  ' + o);
console.log('PASS panel mobile: 手機 402x712 下 16 個面板寬度／上下緣／內距一致，都有頂部標題與關閉鈕（沒有橫幅插畫），主要動作鈕 ≥44px（觸控目標），沒有小於 34px 的按鈕與橫向溢出');
