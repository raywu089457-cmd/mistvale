// measure.mjs — 主畫面擁擠度量測。用法: TARGET=http://127.0.0.1:5085/?preview=1 node output/hud-simplify/measure.mjs before|after
// 每個視窗:開機 -> 不開任何面板 -> 3 秒(settle)與 11 秒(transient 已收)各量一次,存截圖(11 秒那張)。
import * as L from '../../tools/checks/fix-a-lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const tag = process.argv[2] || 'after';
const dir = path.dirname(fileURLToPath(import.meta.url));
const VPS = { '390x844': { w: 390, h: 844, mobile: true }, '844x390': { w: 844, h: 390, mobile: true }, '695x800': { w: 695, h: 800 }, '705x793': { w: 705, h: 793 }, '1440x900': { w: 1440, h: 900 } };
const url = process.env.TARGET || 'http://127.0.0.1:5085/?preview=1';
const b = await L.launch();
const MEASURE = () => {
  const SEL = '#hd2d-cam,button,[data-action],#hv-advisor,#notice-feed,#region-badge,#pause-label,.map-hint,#toasts .toast,#save-label,#boss-bar,#placement,.hv-sel,.hv-pres';
  const vis = e => { const r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return false; for (let p = e; p; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05 || p.hidden || p.classList.contains('hidden')) return false; } return true; };
  const els = [...document.querySelectorAll(SEL)].filter(e => !e.closest('#world,#loading,#modal-backdrop,#inspector,#title-screen') && vis(e));
  // 去重:巢狀只留最外層(例如 #hv-advisor 內的按鈕不重複算)
  const outer = els.filter(e => !els.some(o => o !== e && o.contains(e)));
  const rects = outer.map(e => { const r = e.getBoundingClientRect(); return { n: (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : '') + ':' + (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 8), l: Math.max(0, r.left), t: Math.max(0, r.top), r: Math.min(innerWidth, r.right), b: Math.min(innerHeight, r.bottom) }; });
  // 13px 以內的格子(約 1/4 解析度)合併
  const S = 4, W = Math.ceil(innerWidth / S), H = Math.ceil(innerHeight / S), g = new Uint8Array(W * H);
  for (const q of rects) for (let y = Math.floor(q.t / S); y < Math.ceil(q.b / S); y++) for (let x = Math.floor(q.l / S); x < Math.ceil(q.r / S); x++) if (x >= 0 && y >= 0 && x < W && y < H) g[y * W + x] = 1;
  let cov = 0; for (const v of g) cov += v;
  // 最大空白矩形(直方圖法)
  const hts = new Array(W).fill(0); let best = { a: 0, w: 0, h: 0 };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) hts[x] = g[y * W + x] ? 0 : hts[x] + 1;
    const st = [];
    for (let x = 0; x <= W; x++) { const h = x < W ? hts[x] : 0; let s = x; while (st.length && st[st.length - 1][1] >= h) { const [px, ph] = st.pop(); const a = (x - px) * ph; if (a > best.a) best = { a, w: (x - px) * S, h: ph * S }; s = px; } st.push([s, h]); }
  }
  const btns = outer.filter(e => e.matches('button,[data-action]')).length + [...document.querySelectorAll('.hv-hud button,.hv-hud [data-action]')].filter(e => vis(e) && !outer.includes(e) && !e.closest('#modal-backdrop,#inspector')).length;
  const ov = []; for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) { const a = rects[i], c = rects[j], w = Math.min(a.r, c.r) - Math.max(a.l, c.l), h = Math.min(a.b, c.b) - Math.max(a.t, c.t); if (w > 0 && h > 0) ov.push(a.n + ' x ' + c.n + ' ' + Math.round(w) + 'x' + Math.round(h)); }
  const cam = document.querySelector('#hd2d-cam'); const camR = cam && vis(cam) ? (r => [r.left, r.top, r.right, r.bottom].map(Math.round))(cam.getBoundingClientRect()) : null;
  return { overlaps: ov, cam: camR, hud: rects.length, buttons: new Set([...document.querySelectorAll('button,[data-action]')].filter(e => !e.closest('#world,#loading,#modal-backdrop,#inspector,#title-screen') && vis(e))).size, covPct: +(100 * cov / (W * H)).toFixed(1), freeW: best.w, freeH: best.h, freePct: +(100 * best.a / (W * H)).toFixed(1), names: rects.map(q => q.n) };
};
const rows = {};
for (const [k, v] of Object.entries(VPS)) {
  const ctx = await L.newCtx(b, v); const page = await ctx.newPage();
  await L.boot(page, url);
  await page.waitForTimeout(300);
  const m3 = await page.evaluate(`(${MEASURE.toString()})()`);
  await page.waitForTimeout(11000);
  const m11 = await page.evaluate(`(${MEASURE.toString()})()`);
  await page.screenshot({ path: path.join(dir, `${tag}-${k}.png`) });
  rows[k] = { t3: m3, t11: m11 };
  await ctx.close();
}
await b.close();
fs.writeFileSync(path.join(dir, `metrics-${tag}.json`), JSON.stringify(rows, null, 1));
console.log('viewport | t | HUD blocks | buttons | covered% | free w×h | free% of viewport');
for (const [k, r] of Object.entries(rows)) for (const t of ['t3', 't11']) { const m = r[t]; console.log(`${k} | ${t === "t3" ? "boot" : "boot+11s"} | ${m.hud} | ${m.buttons} | ${m.covPct} | ${m.freeW}x${m.freeH} | ${m.freePct}`); }
for (const [k, r] of Object.entries(rows)) { console.log(k, '11s:', r.t11.names.join(' ; ')); console.log(k, 'cam', JSON.stringify(r.t11.cam), 'overlaps@3s', JSON.stringify(r.t3.overlaps), 'overlaps@11s', JSON.stringify(r.t11.overlaps)); }
