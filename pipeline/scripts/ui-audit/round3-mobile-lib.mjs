// bughunt-lib.mjs — QA 抓 bug 共用工具(唯讀測試,只寫 output/ui-audit/bughunt/)
import { createRequire } from 'module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
export const { chromium } = require('playwright');
export const TARGET = process.env.TARGET || 'http://127.0.0.1:5192/';
export const OUT = path.resolve(process.env.OUT || 'output/ui-audit/round3-mobile/lib');
fs.mkdirSync(OUT + '/shots', { recursive: true });
const M = (w, h, d) => ({ w, h, mobile: true, dsf: d });
export const VIEWS = {
  desktop: { w: 1440, h: 900 },
  'm360x640': M(360, 640, 3), 'm375x667': M(375, 667, 2), 'm360x780': M(360, 780, 3), 'm390x844': M(390, 844, 3), 'm412x915': M(412, 915, 2.6), 'm430x932': M(430, 932, 3),
  'l667x375': M(667, 375, 2), 'l740x360': M(740, 360, 3), 'l844x390': M(844, 390, 3), 'l932x430': M(932, 430, 3),
  'p768x1024': M(768, 1024, 2), 't1024x768': M(1024, 768, 2),
  // 舊名稱(給複製的腳本用)
  phone: M(390, 844, 2), land: M(844, 390, 2), tablet: M(1024, 768, 2),
};
export const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
export async function launch() {
  return chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] });
}
export async function newCtx(b, v) {
  return b.newContext(v.mobile ? { viewport: { width: v.w, height: v.h }, deviceScaleFactor: v.dsf || 2, isMobile: true, hasTouch: true, userAgent: UA }
    : { viewport: { width: v.w, height: v.h } });
}
// 錯誤收集:每筆帶「目前步驟」(S.step 由呼叫端更新)
export function hook(page, label, log) {
  const S = { step: 'boot' };
  const push = (type, msg) => { const m = String(msg).slice(0, 300); if (!log.some(e => e.type === type && e.msg === m && e.view === label)) log.push({ view: label, step: S.step, type, msg: m }); };
  page.on('pageerror', e => push('pageerror', e.message || e));
  page.on('console', m => { if (m.type() === 'error') push('console.error', m.text() + ' ' + (m.location()?.url || '').slice(-60)); });
  page.on('requestfailed', r => push('requestfailed', r.url().slice(-100) + ' ' + (r.failure()?.errorText || '')));
  page.on('response', r => { if (r.status() >= 400) push('http' + r.status(), r.url().slice(-100)); });
  page.on('dialog', d => { push('dialog', d.message()); d.dismiss().catch(() => {}); });
  page.addInitScript(() => { addEventListener('unhandledrejection', e => console.error('UNHANDLED_REJECTION ' + (e.reason?.stack || e.reason))); });
  return S;
}
export async function boot(page, url = TARGET) {
  await page.goto(url, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 120000 });
}
export const act = (page, a, id) => page.evaluate(([a, id]) => { const el = document.createElement('button'); el.dataset.action = a; if (id != null) el.dataset.id = id; el.style.display = 'none'; document.body.append(el); el.click(); el.remove(); }, [a, id]);
// 掃描:可見的互動元素 → 被蓋住 / 超出視窗 / 太小 / 文字溢出 / 固定定位重疊
export const SCAN = () => {
  const vw = innerWidth, vh = innerHeight, phone = matchMedia('(pointer:coarse)').matches || Math.min(vw, vh) < 600;
  const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); if (r.width < 1 || r.height < 1 || cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false; for (let p = e; p; p = p.parentElement) { if (p.hidden || p.classList?.contains('hidden') || getComputedStyle(p).display === 'none') return false; } return true; };
  const name = e => ((e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '')) || e.tagName;
  const lab = e => ((e.textContent || '').trim() || e.getAttribute('aria-label') || e.getAttribute('title') || '').replace(/\s+/g, ' ').slice(0, 14);
  const out = { covered: [], off: [], small: [], overflow: [], overlap: [] };
  const sel = 'button,[data-action],a[href],input,select,textarea,[role=button],[tabindex]:not([tabindex="-1"])';
  const els = [...document.querySelectorAll(sel)].filter(vis);
  for (const e of els) {
    const r = e.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const inView = cx >= 0 && cy >= 0 && cx <= vw && cy <= vh;
    let clipped = false; for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(cs.overflowY + cs.overflowX)) { const pr = p.getBoundingClientRect(); if (cx < pr.left || cx > pr.right || cy < pr.top || cy > pr.bottom) { clipped = true; break; } } }
    if (clipped) continue;
    if (!inView) { out.off.push({ n: name(e), l: lab(e), r: [r.left, r.top, r.right, r.bottom].map(Math.round) }); continue; }
    const top = document.elementFromPoint(cx, cy);
    if (!(top && (top === e || e.contains(top) || top.contains(e)))) out.covered.push({ n: name(e), l: lab(e), by: top ? name(top) : null, r: [r.left, r.top, r.width, r.height].map(Math.round) });
    const min = phone ? 44 : 24; if ((r.width < min || r.height < min) && !e.closest('input[type=range]')) out.small.push({ n: name(e), l: lab(e), w: Math.round(r.width), h: Math.round(r.height) });
    if (r.right > vw + 1 || r.left < -1 || r.bottom > vh + 1 || r.top < -1) out.off.push({ n: name(e), l: lab(e), r: [r.left, r.top, r.right, r.bottom].map(Math.round), partial: true });
  }
  for (const e of document.querySelectorAll('b,span,h2,h3,h4,p,small,div,strong,em,label,button')) {
    if (!vis(e) || e.children.length > 3) continue; const cs = getComputedStyle(e); if (!e.textContent.trim()) continue;
    if (cs.overflowX !== 'visible' && e.clientWidth > 4 && e.scrollWidth > e.clientWidth + 2 && cs.textOverflow !== 'ellipsis') out.overflow.push({ n: name(e), l: lab(e), sw: e.scrollWidth, cw: e.clientWidth });
  }
  const fixed = [...document.querySelectorAll('body *')].filter(e => { const cs = getComputedStyle(e); return (cs.position === 'fixed') && vis(e) && e.getBoundingClientRect().width > 8 && !e.closest('#toasts,#loading,#modal-backdrop,#screen-grade,#world,#title-screen')&&e.id!=='world' && cs.pointerEvents !== 'none'; });
  const tops = fixed.filter(f => !fixed.some(o => o !== f && o.contains(f)));
  for (let i = 0; i < tops.length; i++) for (let j = i + 1; j < tops.length; j++) {
    const a = tops[i].getBoundingClientRect(), b = tops[j].getBoundingClientRect();
    const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (ox > 6 && oy > 6) out.overlap.push({ a: name(tops[i]), b: name(tops[j]), ox: Math.round(ox), oy: Math.round(oy) });
  }
  return out;
};
export const summarize = s => Object.fromEntries(Object.entries(s).filter(([, v]) => v.length).map(([k, v]) => [k, v.slice(0, 14)]));
export const sleep = ms => new Promise(r => setTimeout(r, ms));
