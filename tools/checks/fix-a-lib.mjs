// fix-a-lib.mjs — FIX-A 檢查共用:開臨時伺服器(或用 TARGET)、四種視窗、開機到可操作、常用量測
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
export const { chromium } = require('playwright');
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const VIEWS = {
  desktop: { w: 1440, h: 900 }, tablet: { w: 1024, h: 768 }, phone: { w: 390, h: 844, mobile: true }, land: { w: 844, h: 390, mobile: true },
};
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
// 先確認 port 沒被別的(殘留)伺服器佔用;佔用時 spawn 會失敗、fetch 卻打到別人的伺服器
const portFree = port => new Promise(res => { const s = net.createServer(); s.once('error', () => res(false)); s.listen(port, '127.0.0.1', () => s.close(() => res(true))); });
export async function startServer() {
  if (process.env.TARGET) return { url: process.env.TARGET, stop() {} };
  let port = 5300 + Math.floor(Math.random() * 400);
  for (let i = 0; i < 20 && !(await portFree(port)); i++) port = 5300 + Math.floor(Math.random() * 400);
  const p = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break; } catch {} await new Promise(r => setTimeout(r, 150)); }
  return { url: `http://127.0.0.1:${port}/`, stop() { try { p.kill(); } catch {} } };
}
export const launch = () => chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });
export const newCtx = (b, v) => b.newContext(v.mobile
  ? { viewport: { width: v.w, height: v.h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: UA }
  : { viewport: { width: v.w, height: v.h }, deviceScaleFactor: 1 });
// 開機:新存檔(prime 可先放 localStorage),等讀取畫面消失
export async function boot(page, url, { keepTitle = false, closeModal = true } = {}) {
  // 機器忙(完整 verify 時)偶爾整頁卡住:等 60 秒沒開機就重新載入一次,再給 90 秒
  const ready = () => globalThis.__mistvaleGame && !document.querySelector('#loading');
  await page.goto(url, { waitUntil: 'commit', timeout: 120000 });
  try { await page.waitForFunction(ready, null, { timeout: 60000 }); }
  catch { await page.reload({ waitUntil: 'commit', timeout: 120000 }); await page.waitForFunction(ready, null, { timeout: 90000 }); }
  await page.waitForTimeout(500);
  if (!keepTitle) { await page.waitForSelector('#title-screen', { timeout: 4000 }).catch(() => {}); await page.evaluate(() => document.querySelector('#title-screen')?.remove()); }
  // 新存檔:歡迎對話框在標題關掉後才會打開(FIX-A B5),等它出現再關
  if (closeModal && !keepTitle) await page.waitForFunction(() => document.querySelector('#modal')?.dataset.type === 'welcome' && !document.querySelector('#modal-backdrop').classList.contains('hidden'), null, { timeout: 4000 }).catch(() => {});
  if (closeModal) await page.evaluate(() => { document.querySelector('#modal-backdrop:not(.hidden) [data-action=close],#modal-backdrop:not(.hidden) [data-action=welcomeStart]')?.click(); });
  await page.waitForTimeout(300);
}
export const act = (page, a, id) => page.evaluate(([a, id]) => { const el = document.createElement('button'); el.dataset.action = a; if (id != null) el.dataset.id = id; el.style.display = 'none'; document.body.append(el); el.click(); el.remove(); }, [a, id]);
export const adv = (page, sec, dt = 0.25) => page.evaluate(([sec, dt]) => { const g = globalThis.__mistvaleGame; for (let t = 0; t < sec; t += dt) g.tick(dt); }, [sec, dt]);
// 矩形工具(在頁面內執行)
export const RECT = `(sel)=>{const e=typeof sel==='string'?document.querySelector(sel):sel;if(!e)return null;const r=e.getBoundingClientRect();return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height};}`;
export const visible = `(e)=>{if(!e)return false;const r=e.getBoundingClientRect(),cs=getComputedStyle(e);if(r.width<1||r.height<1||cs.visibility==='hidden'||cs.display==='none'||+cs.opacity===0)return false;for(let p=e;p;p=p.parentElement){if(p.hidden||p.classList?.contains('hidden')||getComputedStyle(p).display==='none')return false;}return true;}`;
// 頁面內共用函式
export const PAGE_LIB = () => {
  const R = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { l: +r.left.toFixed(1), t: +r.top.toFixed(1), r: +r.right.toFixed(1), b: +r.bottom.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
  const vis = e => { if (!e) return false; const r = e.getBoundingClientRect(), cs = getComputedStyle(e); if (r.width < 1 || r.height < 1 || cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false; for (let p = e; p; p = p.parentElement) { if (p.hidden || p.classList?.contains('hidden') || getComputedStyle(p).display === 'none') return false; } return true; };
  const inter = (a, b) => { if (!a || !b) return 0; const w = Math.min(a.r, b.r) - Math.max(a.l, b.l), h = Math.min(a.b, b.b) - Math.max(a.t, b.t); return w > 0 && h > 0 ? +(w * h).toFixed(0) : 0; };
  const hit = e => { const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && (t === e || e.contains(t) || t.contains(e)); };
  const name = e => (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/)[0] : '') || e.tagName;
  const clipped = e => { const r = e.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(cs.overflowY + cs.overflowX)) { const pr = p.getBoundingClientRect(); if (cx < pr.left || cx > pr.right || cy < pr.top || cy > pr.bottom) return true; } } return false; };
  // 所有可見按鈕(不含 toast 自己)
  const buttons = () => [...document.querySelectorAll('button,[data-action],a[href],[role=button]')].filter(e => vis(e) && !e.closest('#toasts,#world,#loading') && !clipped(e) && (() => { const r = e.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; return cx >= 0 && cy >= 0 && cx <= innerWidth && cy <= innerHeight; })() && hit(e));   // 「可見」= 中心點真的打得到自己(被抽屜蓋在底下的不算)
  // toast 量測:矩形蓋住哪些按鈕中心、中心是否在畫面中央 50%
  const toastCheck = () => {
    const ts = [...document.querySelectorAll('#toasts .toast')]; if (!ts.length) return { n: 0 };
    const btns = buttons(), bad = [], out = { n: ts.length, rects: [], centerRegion: false, pe: [] };
    for (const t of ts) {
      const r = R(t); out.rects.push([r.l, r.t, r.r, r.b].map(Math.round)); out.pe.push(getComputedStyle(t).pointerEvents);
      const cx = (r.l + r.r) / 2, cy = (r.t + r.b) / 2;
      if (cx > innerWidth * .25 && cx < innerWidth * .75 && cy > innerHeight * .25 && cy < innerHeight * .75) out.centerRegion = true;
      for (const b of btns) { const br = b.getBoundingClientRect(), bx = br.left + br.width / 2, by = br.top + br.height / 2; if (bx >= r.l && bx <= r.r && by >= r.t && by <= r.b) bad.push(name(b) + (b.textContent || '').trim().slice(0, 6)); }
    }
    out.covers = [...new Set(bad)]; return out;
  };
  return { R, vis, inter, hit, name, clipped, buttons, toastCheck };
};
const LIBSRC = `(${PAGE_LIB.toString()})()`;
export const ev = (page, fn, arg) => page.evaluate(`(async()=>{const __L=${LIBSRC};const f=${fn.toString()};return await f(__L,${JSON.stringify(arg ?? null)});})()`);
