// screen-grade.mjs — T120：畫面色調疊層（暗角＋上方暖光）
//   * 只蓋世界層(z-index:1)：HUD/面板都在 3 以上，顏色不受影響。
//   * 必須 pointer-events:none：不能吃掉任何點擊（拖曳、點建築、點獵人）。
//   * 邊角要真的變暗、中央幾乎不變——用兩張截圖在同一個 canvas 上比對像素，
//     不靠「看起來有沒有」。
// Usage: node tools/checks/screen-grade.mjs      (game server on 5024 expected)
//        $env:SHOTS='1'; node tools/checks/screen-grade.mjs
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const fails = [], oks = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/grade', { recursive: true });

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });

async function boot(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, locale: 'zh-TW', deviceScaleFactor: 1, ...opts });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
  await page.waitForTimeout(1800);
  await page.evaluate(() => { globalThis.__mistvaleGame.state.paused = true; });
  await page.waitForTimeout(250);
  return { ctx, page, errs };
}

// 在頁面裡把兩張截圖畫進 canvas 比像素（不需額外影像套件）
const samplePair = (page, onB64, offB64, pts) => page.evaluate(async ({ on, off, pts }) => {
  const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/png;base64,' + src; });
  const [a, b] = await Promise.all([load(on), load(off)]);
  const read = img => {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    return (x, y) => { const d = g.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]]; };
  };
  const A = read(a), B = read(b);
  const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return pts.map(p => {
    const on = A(p.x, p.y), off = B(p.x, p.y);
    return { name: p.name, on, off, onLum: +lum(on).toFixed(1), offLum: +lum(off).toFixed(1), delta: +(lum(on) - lum(off)).toFixed(1) };
  });
}, { on: onB64, off: offB64, pts });

// ── desktop ──────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 1440, height: 900 });

  const geo = await page.evaluate(() => {
    const g = document.querySelector('#screen-grade');
    if (!g) return { exists: false };
    const cs = getComputedStyle(g), r = g.getBoundingClientRect();
    const world = document.querySelector('#world');
    const hudZ = Math.min(...['#topbar', '#bottom-bar', '#left-panel', '#inspector', '.view-tools']
      .map(s => { const e = document.querySelector(s); return e ? (parseInt(getComputedStyle(e).zIndex) || 0) : 999; }));
    const pt = (x, y) => { const e = document.elementFromPoint(x, y); return e ? (e.id || e.tagName) : 'null'; };
    return {
      exists: true, pe: cs.pointerEvents, z: parseInt(cs.zIndex) || 0, pos: cs.position,
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      worldZ: parseInt(getComputedStyle(world).zIndex) || 0, hudZ,
      layers: (cs.backgroundImage.match(/gradient/g) || []).length,
      bg: cs.backgroundImage,
      hitCenter: pt(innerWidth / 2, innerHeight / 2),
      hitBottom: pt(innerWidth / 2, innerHeight - 60),
    };
  });
  if (!geo.exists) fix('找不到 #screen-grade 色調疊層');
  else {
    if (geo.pos !== 'fixed') fix(`#screen-grade position=${geo.pos}，應為 fixed`);
    if (Math.abs(geo.rect.w - 1440) > 1 || Math.abs(geo.rect.h - 900) > 1) fix(`#screen-grade 沒有鋪滿畫面：${JSON.stringify(geo.rect)}`);
    if (geo.pe !== 'none') fix(`#screen-grade pointer-events=${geo.pe}，會吃掉點擊`);
    if (!(geo.z > geo.worldZ && geo.z < geo.hudZ)) fix(`#screen-grade z-index=${geo.z}，必須在世界(${geo.worldZ})之上、HUD(${geo.hudZ})之下`);
    if (geo.layers < 2) fix(`#screen-grade 只有 ${geo.layers} 層漸層，應有暗角＋上下暖光兩層`);
    if (geo.hitCenter !== 'world') fix(`畫面中央的點擊被 ${geo.hitCenter} 接走（應為 world）`);
    if (!geo.hitCenter.startsWith('world')) fix(`中央點擊沒有穿透到世界層：${geo.hitCenter}`);
    else if (geo.z > geo.worldZ && geo.z < geo.hudZ && geo.pe === 'none' && geo.layers >= 2) {
      ok(`疊層鋪滿 1440x900、pointer-events:none、z-index ${geo.z}（世界 ${geo.worldZ} < ${geo.z} < HUD ${geo.hudZ}）、兩層漸層`);
    }
  }

  // 像素比對：邊角要變暗、中央幾乎不變、HUD 完全不變
  const onShot = (await page.screenshot({ type: 'png' })).toString('base64');
  await page.evaluate(() => { document.querySelector('#screen-grade').style.display = 'none'; });
  await page.waitForTimeout(250);
  const offShot = (await page.screenshot({ type: 'png' })).toString('base64');
  await page.evaluate(() => { document.querySelector('#screen-grade').style.display = ''; });

  const pts = [
    { name: 'corner-tl', x: 24, y: 150 }, { name: 'corner-tr', x: 1416, y: 150 },
    { name: 'corner-bl', x: 24, y: 760 }, { name: 'edge-left', x: 6, y: 450 },
    { name: 'center', x: 720, y: 450 }, { name: 'hud-top', x: 720, y: 20 },
  ];
  const rows = await samplePair(page, onShot, offShot, pts);
  for (const r of rows) {
    if (r.name.startsWith('hud')) {
      if (Math.abs(r.delta) > 0.5) fix(`HUD 也被色調疊層影響（${r.name} Δ${r.delta}）`);
      continue;
    }
    if (r.name === 'center') {
      if (Math.abs(r.delta) > 2) fix(`畫面中央也被壓暗（Δ${r.delta}），暗角應該只影響邊角`);
      continue;
    }
    const ratio = r.offLum > 0 ? r.onLum / r.offLum : 1;
    if (ratio > 0.95) fix(`${r.name} 沒有變暗（亮度 ${r.offLum} → ${r.onLum}，比例 ${ratio.toFixed(3)}）`);
  }
  const edges = rows.filter(r => /corner|edge/.test(r.name));
  const worst = edges.reduce((a, b) => (a.onLum / a.offLum < b.onLum / b.offLum ? a : b));
  const hud = rows.find(r => r.name === 'hud-top'), centre = rows.find(r => r.name === 'center');
  if (!fails.length) ok(`邊角變暗（${edges[0].name} ${edges[0].offLum}→${edges[0].onLum}，最暗 ${worst.name} 比例 ${(worst.onLum / worst.offLum).toFixed(2)}）、中央 Δ${centre.delta}、HUD Δ${hud.delta}`);

  // 點擊仍然穿透：點一棟建築要開 inspector
  const clicked = await page.evaluate(async () => {
    const view = globalThis.__mistvaleView;
    const rects = view.hitRects().filter(r => r.id && !String(r.id).includes(':'));
    if (!rects.length) return { none: true };
    const r = rects[0];
    const p = view.unproject(r.x + r.w / 2, r.y + r.h / 2);
    const el = document.elementFromPoint(p.sx, p.sy);
    return { id: r.id, top: el ? (el.id || el.tagName) : 'null' };
  });
  if (clicked.none) fix('找不到可點的建築');
  else if (!String(clicked.top).startsWith('world')) fix(`建築上的點擊被 ${clicked.top} 接走（預期 world）`);
  else ok(`建築位置(${clicked.id})的點擊仍穿透到世界層`);

  if (process.env.SHOTS) {
    await page.evaluate(() => { document.querySelector('#screen-grade').style.display = 'none'; });
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'output/grade/off.png' });
    await page.evaluate(() => { document.querySelector('#screen-grade').style.display = ''; });
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'output/grade/on.png' });
  }
  if (errs.length) fix(`desktop 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// ── 對比度偏好：直接關掉 ────────────────────────────────
{
  const { ctx, page } = await boot({ width: 1440, height: 900 }, { contrast: 'more' });
  const shown = await page.evaluate(() => {
    const g = document.querySelector('#screen-grade');
    return g ? getComputedStyle(g).display : 'missing';
  });
  if (shown !== 'none') fix(`prefers-contrast:more 下色調疊層仍是 display:${shown}`);
  else ok('prefers-contrast:more 時色調疊層自動關閉');
  await ctx.close();
}

// ── phone ───────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 402, height: 712 });
  const info = await page.evaluate(() => {
    const g = document.querySelector('#screen-grade');
    const cs = getComputedStyle(g), r = g.getBoundingClientRect();
    const covered = [];
    for (const a of ['worldmap', 'pause', 'speed']) {
      const b = document.querySelector(`[data-action="${a}"]`);
      if (!b) continue;
      const br = b.getBoundingClientRect();
      const top = document.elementFromPoint(br.x + br.width / 2, br.y + br.height / 2);
      if (!(top === b || b.contains(top))) covered.push(a);
    }
    const pt = document.elementFromPoint(200, 360);
    return { z: parseInt(cs.zIndex) || 0, pe: cs.pointerEvents, rect: { w: r.width, h: r.height }, covered, centreTop: pt ? (pt.id || pt.tagName) : 'null' };
  });
  if (Math.abs(info.rect.w - 402) > 1 || Math.abs(info.rect.h - 712) > 1) fix(`phone 色調疊層沒有鋪滿畫面：${JSON.stringify(info.rect)}`);
  if (info.pe !== 'none') fix(`phone 色調疊層 pointer-events=${info.pe}`);
  if (info.covered.length) fix(`phone 色調疊層蓋住浮動鈕：${info.covered}`);
  if (info.centreTop !== 'world') fix(`phone 中央點擊被 ${info.centreTop} 接走`);
  if (!info.covered.length && info.centreTop === 'world' && info.pe === 'none') ok(`phone 402x712 疊層鋪滿畫面、點擊穿透、浮動鈕仍可點`);
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
console.log('PASS screen grade: 暗角疊層鋪滿畫面、只壓世界層（HUD 與中央亮度不變）、邊角實測變暗、點擊全部穿透、prefers-contrast:more 自動關閉、手機不擋浮動鈕');
