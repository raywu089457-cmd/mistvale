// hv-gap-run.mjs — 獵魔村風格缺口稽核(唯讀):4 視窗 × 全部畫面,截圖＋量測,輸出 output/ui-audit/round2/<視窗>/<畫面>.png 與 data/<視窗>.json
// 用法: node pipeline/scripts/ui-audit/hv-gap-run.mjs [sizes] [only]    例:1440x900,390x844  only=build,hunters
// TARGET 預設 http://127.0.0.1:5186/?preview=1(node server.mjs 以 PORT=5181 HOST=127.0.0.1 啟動)
import { createRequire } from 'module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const OUT = path.resolve('output/ui-audit/round2');
const SIZES = (process.argv[2] || '1440x900,1024x768,390x844,844x390').split(',').map(s => s.split('x').map(Number));
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const TARGET = process.env.TARGET || 'http://127.0.0.1:5186/?preview=1';
fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });

// ───────── 頁面內量測(回傳 JSON) ─────────
const MEASURE = ({ phone, name }) => {
  const FONT = /Ark Pixel/i;
  const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.02 && !e.closest('.hidden,[hidden],.hv-sr,#screen-grade,#loading') && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight; };
  const sel = e => { let s = e.tagName.toLowerCase(); if (e.id) s += '#' + e.id; const c = [...e.classList].slice(0, 3).join('.'); if (c) s += '.' + c; return s; };
  const scopeOf = e => { for (const q of ['#modal', '#bottom-bar', '#topbar', '#hv-left', '.hv-actions', '.view-tools', '#toasts', '#hv-sel', '#unit-card', '#inspector', '#cmdk', '#left-panel', '#pause-label', '.map-hint', '#boss-bar', '#placement', '#next-step', '.tooltip,#tooltip,[role=tooltip]', '#dungeon-hud,#run-hud,.run-hud', '.offline-calc']) if (e.closest(q)) return q.split(',')[0]; return 'other:' + sel(e); };
  const zoomOf = e => e.currentCSSZoom || 1;
  const parseRGBA = s => { const m = String(s).match(/[\d.]+/g) || []; return { r: +m[0] || 0, g: +m[1] || 0, b: +m[2] || 0, a: m.length > 3 ? +m[3] : 1 }; };
  const lin = c => { c /= 255; return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); };
  const Lum = c => .2126 * lin(c.r) + .7152 * lin(c.g) + .0722 * lin(c.b);
  const CR = (a, b) => { const x = Lum(a), y = Lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const hex = c => '#' + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

  const clippedOut = el => { const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(cs.overflowY + cs.overflowX)) { const q = p.getBoundingClientRect(); if (cx < q.left || cx > q.right || cy < q.top || cy > q.bottom) return true; } } return false; };
  const out = { name, viewport: [innerWidth, innerHeight], issues: [] };
  const add = (kind, el, detail, extra = {}) => out.issues.push({ kind, sel: sel(el), scope: scopeOf(el), detail, ...extra });
  const all = [...document.querySelectorAll('body *')].filter(vis).filter(e => !e.closest('script,style,canvas#world,svg'));
  const modalOpen = !document.querySelector('#modal-backdrop')?.classList.contains('hidden');
  // 搜集重點資料
  const seen = new Map();
  const once = (key, fn) => { if (seen.has(key)) { seen.get(key).n++; return; } const o = { n: 1 }; seen.set(key, o); fn(o); };
  for (const el of all) {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect(), s = sel(el), sc = scopeOf(el);
    const area = r.width * r.height;
    if (r.width <= 2 || r.height <= 2) continue;   // 讀屏專用小點
    // 排除 hidden 底下被 inert 的背景 HUD?仍量(它們在畫面上看得到)
    if (cs.borderImageSource !== 'none') once('bi|' + s, o => add('border-image', el, cs.borderImageSource.slice(0, 80), { o }));
    if (cs.backgroundImage !== 'none' && area > 64) {
      const bg = cs.backgroundImage;
      const kinds = [];
      if (/url\(/.test(bg)) kinds.push('url:' + (bg.match(/url\("?([^")]{0,40})/)?.[1] || '?'));
      if (/gradient/.test(bg)) kinds.push('gradient:' + bg.replace(/\s+/g, ' ').slice(0, 90));
      if (kinds.length) once('bg|' + s + '|' + kinds.join(), o => add('bg-image', el, kinds.join(' + '), { o, w: Math.round(r.width), h: Math.round(r.height) }));
    }
    const radii = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'].map(k => parseFloat(cs[k]) || 0);
    const rmax = Math.max(...radii);
    if (rmax > 4.01 && area > 100) { const circle = Math.abs(r.width - r.height) < 3 && rmax >= Math.min(r.width, r.height) / 2 - 1; once('rad|' + s + '|' + rmax, o => add('radius', el, `${rmax}px${circle ? ' (circle)' : ''} ${Math.round(r.width)}x${Math.round(r.height)}`, { o, circle })); }
    const bs = cs.boxShadow;
    if (bs && bs !== 'none') {
      const parts = bs.split(/,(?![^(]*\))/).map(x => x.trim());
      const soft = parts.filter(p => { const nums = (p.replace(/rgba?\([^)]*\)/g, '').match(/-?[\d.]+px/g) || []).map(parseFloat); return nums.length >= 3 && (nums[2] > 3 || (nums[3] ?? 0) > 2); });
      if (soft.length && area > 400) once('sh|' + s, o => add('soft-shadow', el, soft[0].slice(0, 90), { o }));
    }
    // 字
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
    if (own) {
      const px = parseFloat(cs.fontSize) * zoomOf(el);
      const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      if (px > 0.5) {
        if (px < 11.95) once('px|' + s, o => add('small-text', el, `${px.toFixed(1)}px "${own.slice(0, 14)}"`, { o, px }));
        if (!FONT.test(fam)) once('font|' + s + fam, o => add('system-font', el, `${fam} "${own.slice(0, 14)}"`, { o }));
        // 浮在場景上:沒有不透明祖先底
        let p = el, opaque = false, bgc = null;
        while (p && p !== document.body && p !== document.documentElement) { const b = parseRGBA(getComputedStyle(p).backgroundColor); if (b.a > .55 || (getComputedStyle(p).backgroundImage !== 'none' && p !== el)) { opaque = true; bgc = b; break; } p = p.parentElement; }
        if (!opaque && !el.closest('#loading') && (sc === '#topbar' || sc === '#hv-left' || sc.startsWith('.hv-actions') || sc === '.view-tools' || sc === '#toasts' || sc === '#pause-label' || sc === '.map-hint' || sc === '#hv-sel' || sc.startsWith('other'))) {
          const ts = cs.textShadow, sw = parseFloat(cs.webkitTextStrokeWidth) || 0;
          { const parts = ts && ts !== 'none' ? ts.split(/,(?![^(]*\))/).map(x => x.trim()) : []; const dirs = new Set(); let dark = 0; for (const pt of parts) { const col = parseRGBA(pt.match(/rgba?\([^)]*\)/)?.[0] || 'rgb(0,0,0)'); const nums = (pt.replace(/rgba?\([^)]*\)/g, '').match(/-?[\d.]+px/g) || []).map(parseFloat); if (Lum(col) < .12 && col.a > .5) { dark++; dirs.add(Math.sign(nums[0] || 0) + ',' + Math.sign(nums[1] || 0)); } } (out.floatText = out.floatText || []).push({ sel: sel(el), scope: sc, text: own.slice(0, 12), color: cs.color, px: +px.toFixed(1), dirs: dirs.size, dark, crVsBlack: +CR(parseRGBA(cs.color), { r: 0, g: 0, b: 0 }).toFixed(1), stroke: sw }); }
          const nSh = ts && ts !== 'none' ? ts.split(/,(?![^(]*\))/).length : 0;
          if (!nSh && !sw) once('nostroke|' + s, o => add('float-text-no-outline', el, `"${own.slice(0, 14)}" color ${cs.color}`, { o }));
          else if (nSh < 2 && !sw) once('weak|' + s, o => add('float-text-weak-outline', el, `"${own.slice(0, 14)}" text-shadow ${ts.slice(0, 60)}`, { o }));
        }
        // 低對比:有不透明祖先底的文字(面板內)
        if (opaque && bgc && bgc.a > .9) {
          let op = 1; for (let q = el; q && q !== document.body; q = q.parentElement) op *= +getComputedStyle(q).opacity;
          const fg = parseRGBA(cs.color); const fgE = { r: fg.r * fg.a * op + bgc.r * (1 - fg.a * op), g: fg.g * fg.a * op + bgc.g * (1 - fg.a * op), b: fg.b * fg.a * op + bgc.b * (1 - fg.a * op) };
          const cr = CR(fgE, bgc);
          if (cr < 4.5 && !el.closest('canvas')) (out.lowContrast = out.lowContrast || []).push({ sel: s, scope: sc, text: own.slice(0, 12), fg: hex(fgE), bg: hex(bgc), cr: +cr.toFixed(2), px: +px.toFixed(1), dis: !!el.closest(':disabled,[disabled]') });
        }
        // 溢出:文字被裁
        if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
          const ov = cs.overflowX;
          if (cs.textOverflow !== 'ellipsis') once('ovw|' + s, o => add('text-overflow-x', el, `scrollW ${el.scrollWidth} > clientW ${el.clientWidth} overflow-x:${ov} "${own.slice(0, 14)}"`, { o }));
          else once('ovwe|' + s, o => add('ellipsis-truncated', el, `scrollW ${el.scrollWidth} > clientW ${el.clientWidth} "${own.slice(0, 14)}"`, { o }));
        }
        if ((cs.overflowY === 'hidden' || cs.overflowY === 'clip') && el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0 && !/-webkit-box/.test(cs.display)) once('ovh|' + s, o => add('text-clipped-y', el, `scrollH ${el.scrollHeight} > clientH ${el.clientHeight} "${own.slice(0, 14)}"`, { o }));
      }
    }
    // 觸控/熱區
    const isBtn = el.matches('button,[data-action],a,[role=button],select,input:not([type=hidden])');
    if (isBtn && !el.disabled) {
      const lim = phone ? 44 : 32;
      if (r.width < lim - .5 || r.height < lim - .5) once('tap|' + s + '|' + Math.round(r.width) + 'x' + Math.round(r.height), o => add('tap-target', el, `${Math.round(r.width)}x${Math.round(r.height)} (<${lim}) ${el.dataset.action || ''} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 10)}"`, { o, w: Math.round(r.width), h: Math.round(r.height) }));
      // 被別的元素擋住
      const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
      if (!clippedOut(el) && r.left + r.width / 2 <= innerWidth && r.top + r.height / 2 <= innerHeight) {
        const top = document.elementFromPoint(cx, cy);
        if (top && !(top === el || el.contains(top) || top.contains(el))) once('cov|' + s, o => add('covered', el, `center (${Math.round(cx)},${Math.round(cy)}) hit ${sel(top)}`, { o }));
      }
      if (r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.left < -1 || r.top < -1) once('off|' + s, o => add('offscreen-partial', el, `rect ${Math.round(r.left)},${Math.round(r.top)} → ${Math.round(r.right)},${Math.round(r.bottom)} in ${innerWidth}x${innerHeight}`, { o }));
    }
  }
  // 互蓋:可點擊元素兩兩相交
  const btns = all.filter(e => e.matches('button,[data-action]') && !e.disabled && !clippedOut(e)).map(e => ({ e, r: e.getBoundingClientRect() }));
  const ov = new Set();
  for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
    const a = btns[i], b = btns[j]; if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (w > 4 && h > 4) { const ia = w * h, mn = Math.min(a.r.width * a.r.height, b.r.width * b.r.height); if (ia / mn > .2) { const k = sel(a.e) + '×' + sel(b.e); if (!ov.has(k)) { ov.add(k); out.issues.push({ kind: 'overlap', sel: k, scope: scopeOf(a.e), detail: `${Math.round(w)}x${Math.round(h)} overlap (${Math.round(ia / mn * 100)}% of smaller)` }); } } }
  }
  // HUD 文字互蓋:浮在場景上的葉節點文字(無底板)兩兩相交
  {
    const hudRoots = ['#topbar', '#hv-left', '.hv-actions', '.view-tools', '#pause-label', '.map-hint', '#toasts'];
    const leaves = all.filter(e => hudRoots.some(q => e.closest(q)) && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && !e.closest('#modal'));
    const rs = leaves.map(e => { const rg = document.createRange(); rg.selectNodeContents(e); const q = rg.getBoundingClientRect(); return { e, q }; }).filter(x => x.q.width > 2 && x.q.height > 2);
    const seenP = new Set();
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j]; if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
      const w = Math.min(a.q.right, b.q.right) - Math.max(a.q.left, b.q.left), h = Math.min(a.q.bottom, b.q.bottom) - Math.max(a.q.top, b.q.top);
      if (w > 3 && h > 3) { const k = sel(a.e) + '×' + sel(b.e); if (!seenP.has(k)) { seenP.add(k); out.issues.push({ kind: 'hud-text-overlap', sel: k, scope: scopeOf(a.e) + '/' + scopeOf(b.e), detail: `"${a.e.textContent.trim().slice(0, 12)}" × "${b.e.textContent.trim().slice(0, 12)}" ${Math.round(w)}x${Math.round(h)}`, n: 1 }); } }
    }
  }
  // HUD 元件與面板/其他 HUD 元件整塊重疊(unit-card、toast、pause label 對 view-tools 等)
  {
    const boxes = [['#unit-card', '單位小卡'], ['#toasts', 'toast'], ['#pause-label', '暫停標籤'], ['.view-tools', '縮放鈕'], ['.hv-actions', '行動徽章'], ['#placement', '移動建築條'], ['#hv-left', '左側任務/事件'], ['#inspector', '建築面板'], ['#topbar .hv-tr', '右上圖示'], ['#topbar .hv-tl', '左上資源'], ['#hv-sel', '六角鈕']].map(([q, n]) => { const e = document.querySelector(q); if (!e || !vis(e)) return null; const r = e.getBoundingClientRect(); if (e.id === 'toasts') { const ch = [...e.children].filter(vis); if (!ch.length) return null; const rr = ch.map(c => c.getBoundingClientRect()); return { n, q, l: Math.min(...rr.map(x => x.left)), t: Math.min(...rr.map(x => x.top)), r: Math.max(...rr.map(x => x.right)), b: Math.max(...rr.map(x => x.bottom)) }; } return { n, q, l: r.left, t: r.top, r: r.right, b: r.bottom }; }).filter(Boolean);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i], b = boxes[j]; const w = Math.min(a.r, b.r) - Math.max(a.l, b.l), h = Math.min(a.b, b.b) - Math.max(a.t, b.t); if (w > 6 && h > 6) out.issues.push({ kind: 'hud-box-overlap', sel: a.q + '×' + b.q, scope: 'hud', detail: `${a.n} × ${b.n} ${Math.round(w)}x${Math.round(h)}`, n: 1 }); }
  }
  // 頁面層
  const de = document.documentElement;
  if (de.scrollWidth > innerWidth + 1) out.issues.push({ kind: 'page-hscroll', sel: 'html', scope: 'page', detail: `scrollWidth ${de.scrollWidth} > ${innerWidth}` });
  for (const [k, v] of seen) { /* counts are inside issues via o; merge */ }
  // 把 n 次數併入
  for (const it of out.issues) if (it.o) { it.n = it.o.n; delete it.o; }

  // 面板幾何
  const rect = q => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), b: Math.round(r.bottom), r: Math.round(r.right) }; };
  const bar = document.querySelector('#bottom-bar'), barR = bar?.getBoundingClientRect();
  const cell = [...document.querySelectorAll('#bottom-bar>button')].map(b => { const r = b.getBoundingClientRect(), cs = getComputedStyle(b); return { act: b.dataset.action, w: +r.width.toFixed(1), h: +r.height.toFixed(1), top: +r.top.toFixed(1), bg: cs.backgroundColor, color: cs.color, bl: cs.borderLeftWidth + ' ' + cs.borderLeftColor, sel: b.classList.contains('active') || b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-current') === 'page' }; });
  out.bar = barR ? { rect: rect('#bottom-bar'), cells: cell, bg: getComputedStyle(bar).backgroundColor, bgImg: getComputedStyle(bar).backgroundImage.slice(0, 60), bt: getComputedStyle(bar).borderTopWidth + ' ' + getComputedStyle(bar).borderTopColor, hidden: getComputedStyle(bar).display === 'none', centerHit: (() => { const e = document.elementFromPoint(barR.left + barR.width / 2, barR.top + barR.height / 2); return e ? sel(e) : null; })() } : null;
  const mb = document.querySelector('#modal-backdrop'), md = document.querySelector('#modal');
  if (modalOpen && md) {
    const cs = getComputedStyle(md), r = md.getBoundingClientRect(), cc = document.querySelector('#modal-content'), ccs = cc ? getComputedStyle(cc) : null;
    const title = md.querySelector('.modal-title'), tr = title?.getBoundingClientRect(), tcs = title ? getComputedStyle(title) : null;
    const x = md.querySelector('[data-action=close]'), xr = x?.getBoundingClientRect(), xcs = x ? getComputedStyle(x) : null;
    out.modal = {
      type: md.dataset.type, kind: md.dataset.kind, rect: rect('#modal'), bg: cs.backgroundColor, bgImg: cs.backgroundImage.slice(0, 80), border: cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor, radius: cs.borderTopLeftRadius, shadow: cs.boxShadow.slice(0, 80), bi: cs.borderImageSource.slice(0, 60),
      backdropBg: getComputedStyle(mb).backgroundColor, backdropBgImg: getComputedStyle(mb).backgroundImage.slice(0, 50), backdropBackdropFilter: getComputedStyle(mb).backdropFilter,
      barTop: barR ? Math.round(barR.top) : null, overlapsBar: barR ? r.bottom > barR.top + 1 : null, barVisibleAbove: barR ? (document.elementFromPoint(barR.left + 20, barR.top + barR.height / 2)?.closest('#bottom-bar') ? true : false) : null,
      title: tr ? { h: Math.round(tr.height), bg: tcs.backgroundColor, bgImg: tcs.backgroundImage.slice(0, 80), text: title.textContent.trim().slice(0, 30), family: tcs.fontFamily.split(',')[0] } : null,
      closeBtn: xr ? { w: Math.round(xr.width), h: Math.round(xr.height), radius: xcs.borderTopLeftRadius, bg: xcs.backgroundColor, bgImg: xcs.backgroundImage.slice(0, 50) } : null,
      content: cc ? { overflowY: ccs.overflowY, scrollH: cc.scrollHeight, clientH: cc.clientHeight, scrollable: cc.scrollHeight > cc.clientHeight + 2, canScroll: /auto|scroll/.test(ccs.overflowY), pad: ccs.padding, hintShown: !!document.querySelector('.scroll-hint:not(.hidden), #modal [data-scroll-hint]'), maskImg: ccs.maskImage?.slice(0, 60) || ccs.webkitMaskImage?.slice(0, 60) } : null,
      pseudo: ['::before', '::after'].map(p => { const c = getComputedStyle(md, p); return { p, content: c.content.slice(0, 20), bgImg: c.backgroundImage.slice(0, 80), h: c.height }; }),
      modalTools: (() => { const t = document.querySelector('#modal-tools'); if (!t) return null; const r2 = t.getBoundingClientRect(); return { x: Math.round(r2.left), y: Math.round(r2.top), w: Math.round(r2.width), h: Math.round(r2.height), n: t.children.length }; })(),
    };
  }
  // 重複卡片:每列張數、每張的按鈕數、主按鈕寬度占比
  const groups = {};
  for (const el of document.querySelectorAll('#modal [class*=card],#modal article,#modal [role=listitem]')) { if (!vis(el) || clippedOut(el) && false) continue; const k = el.tagName.toLowerCase() + '.' + [...el.classList].filter(c => !/^(on|off|is-)/.test(c)).slice(0, 2).join('.'); (groups[k] = groups[k] || []).push(el); }
  out.cards = Object.entries(groups).filter(([, v]) => v.length >= 2).map(([k, v]) => { const rows = {}; v.forEach(e => { const r = e.getBoundingClientRect(); const key = Math.round(r.top / 4); (rows[key] = rows[key] || []).push(Math.round(r.width)); }); const perRow = Object.values(rows).map(a => a.length); const e0 = v[0], r0 = e0.getBoundingClientRect(); const bs = [...e0.querySelectorAll('button')].map(b => { const q = b.getBoundingClientRect(), cs = getComputedStyle(b); return { cls: [...b.classList].join('.'), act: b.dataset.action || '', t: (b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 12), w: Math.round(q.width), h: Math.round(q.height), wFrac: +(q.width / r0.width).toFixed(2), bg: cs.backgroundColor, color: cs.color, radius: cs.borderTopLeftRadius }; }); const cs0 = getComputedStyle(e0); return { group: k, n: v.length, cardW: Math.round(r0.width), cardH: Math.round(r0.height), perRow, buttons: bs, bg: cs0.backgroundColor, bgImg: cs0.backgroundImage.slice(0, 60), border: cs0.borderTopWidth + ' ' + cs0.borderTopColor, radius: cs0.borderTopLeftRadius }; });
  out.tabInner = [...document.querySelectorAll('#bottom-bar>button')].map(b => { const i = b.querySelector('i'), l = b.querySelector('b'), k = b.querySelector('kbd'), ir = i?.getBoundingClientRect(); return { act: b.dataset.action, label: l ? getComputedStyle(l).color : null, labelPx: l ? parseFloat(getComputedStyle(l).fontSize) : null, iconW: ir ? Math.round(ir.width) : null, kbd: k ? getComputedStyle(k).display : null, badge: b.dataset.badge || null }; });
  out.topbar = rect('#topbar');
  const tb = document.querySelector('#topbar'); if (tb) { const cs = getComputedStyle(tb); out.topbarStyle = { bg: cs.backgroundColor, bgImg: cs.backgroundImage.slice(0, 80), border: cs.borderBottomWidth + ' ' + cs.borderBottomColor, shadow: cs.boxShadow.slice(0, 60) }; }
  out.toasts = [...document.querySelectorAll('#toasts .toast,#toasts>*')].filter(vis).map(t => { const r = t.getBoundingClientRect(), cs = getComputedStyle(t); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), cy: +(((r.top + r.bottom) / 2) / innerHeight).toFixed(2), barTop: barR ? Math.round(barR.top) : null, bg: cs.backgroundColor, color: cs.color, bgImg: cs.backgroundImage.slice(0, 60), radius: cs.borderTopLeftRadius, text: t.textContent.trim().slice(0, 30) }; });
  // hud 小件
  const hud = {};
  for (const [k, q] of [['hvLeft', '#hv-left'], ['quest', '#hv-quest'], ['actions', '.hv-actions'], ['viewTools', '.view-tools'], ['nextStep', '#next-step'], ['mapHint', '.map-hint'], ['pause', '#pause-label'], ['topbarTL', '#topbar .hv-tl'], ['topbarTR', '#topbar .hv-tr'], ['hvSel', '#hv-sel:not([hidden])'], ['unitCard', '#unit-card:not(.hidden)'], ['inspector', '#inspector:not(.hidden)'], ['leftPanel', '#left-panel:not(.hidden)']]) { const e = document.querySelector(q); if (e && vis(e)) { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); hud[k] = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), bg: cs.backgroundColor, bgImg: cs.backgroundImage.slice(0, 60), bd: cs.borderTopWidth + ' ' + cs.borderTopColor, radius: cs.borderTopLeftRadius }; } }
  out.hud = hud;
  return out;
};

// ───────── 場景 ─────────
const act = (page, a, id, extra) => page.evaluate(([a, id, extra]) => { const el = document.createElement('button'); el.dataset.action = a; if (id != null) el.dataset.id = id; if (extra) for (const [k, v] of Object.entries(extra)) el.dataset[k] = v; el.style.display = 'none'; document.body.append(el); el.click(); el.remove(); }, [a, id, extra]);
const hid = page => page.evaluate(() => globalThis.__mistvaleGame.state.hunters[0].id);
const wait = (page, ms) => page.waitForTimeout(ms);
const setTime = (page, off) => page.evaluate(off => { const g = globalThis.__mistvaleGame; g.state.time = Math.floor((g.state.time || 0) / 240) * 240 + off; }, off);

const SCENES = [
  ['hud-day', async p => { await setTime(p, 50); await wait(p, 1200); }],
  ['hud-night', async p => { await setTime(p, 180); await wait(p, 1500); }],
  ['hud-snow-day', async p => { await setTime(p, 50); await p.evaluate(() => { const v = globalThis.__mistvaleView; v.focus('region:snow'); v.zoomBy(1.5); }); await wait(p, 2800); }],
  ['hud-snow-night', async p => { await setTime(p, 180); await p.evaluate(() => { const v = globalThis.__mistvaleView; v.focus('region:snow'); v.zoomBy(1.5); }); await wait(p, 2800); }],
  ['build', p => act(p, 'build')],
  ['build-scrolled', async p => { await act(p, 'build'); await wait(p, 300); await p.evaluate(() => { const c = document.querySelector('#modal-content'); c.scrollTop = Math.floor((c.scrollHeight - c.clientHeight) / 2); c.dispatchEvent(new Event('scroll')); }); await wait(p, 300); }],
  ['build-states', async p => { await p.evaluate(() => { const g = globalThis.__mistvaleGame; Object.assign(g.state, { gold: 200, wood: 40, ore: 12 }); g.state.buildings.trading = 0; g.state.buildings.hall = 0; g.state.buildings.inn = 0; for (const k of ['forge', 'clinic']) g.state.buildings[k] = 5; }); await act(p, 'build'); }],
  ['hunters', p => act(p, 'hunters')],
  ['hunters-menu', async p => { await act(p, 'hunters'); await wait(p, 300); await act(p, 'rosterMenu'); }],
  ['trade', p => act(p, 'trade')],
  ['craft-goods', p => act(p, 'craft')],
  ['craft-gear', async p => { await act(p, 'craft'); await wait(p, 200); await act(p, 'craftTab', 'gear'); }],
  ['dungeon', p => act(p, 'dungeon')],
  ['dungeon-run', async p => { await act(p, 'dungeon'); await wait(p, 300); await p.evaluate(() => { const g = globalThis.__mistvaleGame; const ids = g.state.hunters.slice(0, 3).map(h => h.id); const r = g.startDungeon(ids); return r; }); await wait(p, 400); await act(p, 'dungeon'); await wait(p, 600); }],
  ['dungeon-hud', async p => { await p.evaluate(() => { const g = globalThis.__mistvaleGame; g.startDungeon(g.state.hunters.slice(0, 3).map(h => h.id)); }); await wait(p, 1500); }],
  ['boss-fight', async p => { await p.evaluate(() => { const g = globalThis.__mistvaleGame; g.expedition(); }); await wait(p, 1800); }],
  ['arena', p => act(p, 'arena')],
  ['quests', p => act(p, 'quests')],
  ['inventory', p => act(p, 'inventory')],
  ['boss', p => act(p, 'boss')],
  ['settings', p => act(p, 'settings')],
  ['settings-quality', async p => { await act(p, 'settings'); await wait(p, 200); await act(p, 'toggleQuality'); }],
  ['settings-dev', async p => { await act(p, 'settings'); await wait(p, 200); await act(p, 'toggleDev'); }],
  ['help', p => act(p, 'help')],
  ['difficulty', p => act(p, 'difficulty')],
  ['worldmap', p => act(p, 'worldmap')],
  ['region-meadow', p => act(p, 'regionDetail', 'meadow')],
  ['region-snow', p => act(p, 'regionDetail', 'snow')],
  ['dispatch', p => act(p, 'dispatchHunters')],
  ['dispatch-region-info', async p => { await act(p, 'dispatchHunters'); await wait(p, 250); await act(p, 'regionInfo', 'forest'); }],
  ['density', p => act(p, 'densityFor', 'meadow')],
  ['recruit', p => act(p, 'recruit')],
  ['codex', p => act(p, 'codex')],
  ['hunter-detail', async p => act(p, 'hunter', await hid(p))],
  ['building-inspector', p => act(p, 'selectBuilding', 'forge')],
  ['building-inspector-hall', p => act(p, 'selectBuilding', 'hall')],
  ['offline', p => p.evaluate(() => globalThis.__mistvaleShowOffline())],
  ['welcome', p => act(p, 'welcomeReplay')],
  ['advisor', p => p.evaluate(() => { const b = document.querySelector('#next-step'); if (b) return b.click(); const el = document.createElement('button'); el.dataset.action = 'nextStep'; el.dataset.act = 'build'; el.dataset.key = 'build'; el.innerHTML = '<span class="ns-tx">資源夠了，可以蓋新的建築</span><b class="ns-go">去建設</b>'; el.style.display = 'none'; document.body.append(el); el.click(); el.remove(); })],
  ['confirm', p => p.evaluate(() => globalThis.__mistvaleConfirm('確定要重置村莊嗎？目前的進度會全部清除，無法復原。'))],
  ['toast', async p => { await p.evaluate(() => { globalThis.__toast('建造完成：鍛造屋 Lv.2'); globalThis.__toast('資源不足：還差 120 木材', false); globalThis.__toast('獵人 艾登 升到 Lv.5', true, 'ok'); }); await wait(p, 500); }],
  ['toast-modal', async p => { await act(p, 'build'); await wait(p, 300); await p.evaluate(() => { globalThis.__toast('建造完成：鍛造屋 Lv.2'); globalThis.__toast('資源不足：還差 120 木材', false); }); await wait(p, 500); }],
  ['tooltip', async p => { const el = await p.$('#topbar [data-action=worldmap]'); if (el) await el.hover(); await wait(p, 500); }],
  ['tooltip-tab', async p => { const el = await p.$('#bottom-bar [data-action=hunters]'); if (el) await el.hover(); await wait(p, 500); }],
  ['select-building', async p => { await p.evaluate(() => globalThis.__mistvaleView.focus('home')); await wait(p, 900); await p.evaluate(() => globalThis.__mistvaleSelect('forge')); await wait(p, 500); }],
  ['select-hunter', async p => { await p.evaluate(() => { const g = globalThis.__mistvaleGame, v = globalThis.__mistvaleView, h = g.state.hunters[0]; g.state.paused = true; v.lookAt(h.x, h.z, 2.2); }); await wait(p, 1200); await p.evaluate(() => globalThis.__mistvaleSelect('hunter:' + globalThis.__mistvaleGame.state.hunters[0].id)); await wait(p, 500); }],
  ['unit-card', async p => { await p.evaluate(() => { const g = globalThis.__mistvaleGame, v = globalThis.__mistvaleView, h = g.state.hunters[0]; g.state.paused = true; v.lookAt(h.x, h.z, 2.2); }); await wait(p, 1200); await p.evaluate(() => globalThis.__mistvaleSelect('hunter:' + globalThis.__mistvaleGame.state.hunters[0].id)); await wait(p, 400); await p.evaluate(() => document.querySelector('#hv-sel [data-action=selInfo]')?.click()); await wait(p, 500); }],
  ['select-foe', async p => { const ok = await p.evaluate(() => { const g = globalThis.__mistvaleGame; const e = (g.state.enemies || [])[0]; if (!e) return false; globalThis.__mistvaleView.lookAt(e.x, e.z, 2.2); globalThis.__mistvaleSelect('foe:' + e.id); return true; }); await wait(p, 900); }],
  ['cmdk', p => p.evaluate(() => globalThis.__mistvaleCmdk.open())],
  ['placement', async p => { await act(p, 'moveBuilding', 'forge'); await wait(p, 500); }],
  ['paused', async p => { await p.evaluate(() => { globalThis.__mistvaleGame.state.paused = true; }); await wait(p, 600); }],
  ['left-panel', async p => { await act(p, 'toggleLeft'); await wait(p, 500); }],
];

const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] });
for (const [w, h] of SIZES) {
  const phone = Math.min(w, h) < 600;
  const tag = `${w}x${h}`;
  const dir = path.join(OUT, 'shots', tag); fs.mkdirSync(dir, { recursive: true });
  const ctx = await b.newContext(phone ? { viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: w, height: h } });
  await ctx.addInitScript(() => { try { localStorage.setItem('mistvale-touch-tip', '1'); } catch {} });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + String(e).slice(0, 240)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text().slice(0, 240)); });
  page.on('requestfailed', r => errs.push('requestfailed: ' + r.url().slice(0, 100)));
  await page.goto(TARGET, { waitUntil: 'commit', timeout: 120000 });
  // 開場載入畫面(標題)盡快抓一張
  if (!ONLY || ONLY.includes('loading')) {
    try { await page.waitForSelector('#loading', { state: 'attached', timeout: 8000 }); await page.waitForTimeout(120); await page.screenshot({ path: path.join(dir, 'loading.png') });
      const m = await page.evaluate(MEASURE, { phone, name: 'loading' }).catch(() => null); if (m) fs.writeFileSync(path.join(OUT, 'data', `${tag}-loading-partial.json`), JSON.stringify(m)); } catch (e) { errs.push('loading shot: ' + e.message.slice(0, 80)); }
  }
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 120000 });
  await page.evaluate(() => { const g = globalThis.__mistvaleGame; Object.assign(g.state, { gold: 99999, wood: 9999, ore: 9999, herb: 9999, cloth: 9999, flour: 9999, leather: 9999, gems: 999 }); for (const id of Object.keys(g.state.buildings)) g.state.buildings[id] = Math.max(1, g.state.buildings[id]); for (const hh of g.state.hunters) hh.huntRegion = 'meadow'; });
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation-duration:0s!important;animation-delay:0s!important;caret-color:transparent!important}' });
  await page.waitForTimeout(4000);
  const reset = async () => {
    await page.evaluate(() => {
      try { globalThis.__mistvaleCmdk?.close(); } catch {}
      try { globalThis.__mistvaleSelect?.(null); } catch {}
      document.querySelector('#unit-card [data-action=unitCardClose]')?.click();
      document.querySelector('#modal-backdrop:not(.hidden) [data-action=confirmNo]')?.click();
      document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click();
      document.querySelector('#modal-backdrop:not(.hidden) [data-action=offlineOk]')?.click();
      document.querySelector('#inspector:not(.hidden) [data-action=closeInspector]')?.click();
      document.querySelector('#placement:not(.hidden) [data-action=cancelMove]')?.click();
      document.querySelectorAll('#toasts .toast,#toasts>*').forEach(t => t.remove());
      const g = globalThis.__mistvaleGame; g.state.paused = false;
      try { g.retreatDungeon?.(); } catch {}
      try { if (g.state.expedition?.active) { g.state.expedition.active = false; g.state.enemies = g.state.enemies.filter(e => e.type !== 'boss'); } } catch {}
      Object.assign(g.state, { gold: 99999, wood: 9999, ore: 9999, herb: 9999, cloth: 9999, flour: 9999, leather: 9999, gems: 999 }); for (const id of Object.keys(g.state.buildings)) g.state.buildings[id] = Math.max(1, g.state.buildings[id]);
      globalThis.__mistvaleView?.focus('home');
    });
    await page.mouse.move(2, 2); await page.waitForTimeout(350);
  };
  const results = [];
  for (const [name, fn] of SCENES) {
    if (ONLY && !ONLY.includes(name)) continue;
    try {
      await reset();
      await fn(page);
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(dir, name + '.png') });
      const m = await page.evaluate(MEASURE, { phone, name });
      results.push(m);
    } catch (e) { results.push({ name, error: String(e).slice(0, 300) }); console.log('ERR', tag, name, String(e).slice(0, 160)); }
  }
  fs.writeFileSync(path.join(OUT, 'data', `${tag}${ONLY ? '-only' : ''}.json`), JSON.stringify({ tag, phone, errors: [...new Set(errs)], results }));
  console.log('done', tag, results.length, 'scenes', [...new Set(errs)].length, 'errors');
  await ctx.close();
}
await b.close();
