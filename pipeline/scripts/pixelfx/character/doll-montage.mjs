#!/usr/bin/env node
// doll-montage.mjs — output/doll-pack/montage.png
//
// Renders the REAL generated pack (assets/paperdoll-classes/) through the REAL compose code
// (computeParts + drawParts from src/paperdoll.js) in a browser page, then screenshots the canvas:
//
//   row A  the installed hero sheet cell (idleDown) above the doll's bare idle cell, per class
//   row 1  six classes, idle, facing the camera
//   row 2  six classes, their own attack row, at the impact slot
//   row 3  the six gear pieces toggling on/off (bare -> one piece -> all six)
//   row 4  weapon silhouettes (side attack, impact frame) so a 1 px weapon stays readable
//
// 3x nearest-neighbour scale, Chinese captions, neutral grey background.
//
//   node pipeline/scripts/pixelfx/character/doll-montage.mjs
//
// No build, no repo server: a throw-away static server (127.0.0.1:5071, or a free port if busy)
// serves this checkout read-only and is killed before the script exits.

import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const OUT = path.join(ROOT, 'output', 'doll-pack');
const PACK = path.join(ROOT, 'assets', 'paperdoll-classes');
fs.mkdirSync(OUT, { recursive: true });

if (!fs.existsSync(path.join(PACK, 'paperdoll.json'))) {
  console.error('doll-montage: run doll-pack.mjs first (assets/paperdoll-classes/paperdoll.json missing)');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

const PAGE = `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8">
<title>doll-pack montage</title>
<style>html,body{margin:0;background:#6b7078}canvas{display:block}</style>
</head><body><div id="host"></div>
<script type="module">
import { computeParts, drawParts } from '/src/paperdoll.js';

const PACK = '/assets/paperdoll-classes/';
const data = await (await fetch(PACK + 'paperdoll.json')).json();
const images = {};
for (const [key, file] of Object.entries(data.images)) {
  const img = new Image();
  img.src = PACK + file;
  await img.decode();
  images[key] = img;
}

const CELL = 300, PX = 3, GAP = 14, PAD = 24, LABEL = 30, TITLE = 56, PAIR = 2 * CELL + 12;
const CLASSES = ['archer', 'berserker', 'paladin', 'sorcerer', 'assassin', 'priest'];
const CN = { archer: '弓手', berserker: '狂戰士', paladin: '聖騎士', sorcerer: '巫師', assassin: '刺客', priest: '牧師' };
const GEAR = ['helm', 'chest', 'belt', 'legs', 'boots', 'gloves'];
const GEAR_CN = { helm: '頭盔', chest: '胸甲', belt: '腰帶', legs: '護腿', boots: '戰靴', gloves: '護手' };

const kit = (cls, opts = {}) => ({ ...data.meta.kits[cls], ...opts });

function compose(look, action, dir, tick) {
  const c = document.createElement('canvas');
  c.width = 100; c.height = 100;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const parts = computeParts(data, { action, dir, tick, globalTick: tick, look });
  drawParts(ctx, parts, images, { x: 50, y: 92 }, 1);
  return c;
}

function stripCell(cls, gearWorn) {
  const look = kit(cls);
  for (const g of GEAR) look[g] = gearWorn.includes(g) ? data.meta.kits[cls][g] : null;
  return compose(look, 'idle', 2, 0);
}

// the installed hero sheet cell (idleDown frame 0) for row A: the doll's bare body must match it
const HERO = {};
for (const cls of CLASSES) {
  const meta = await (await fetch('/assets/heroes/' + cls + '.json')).json();
  const img = new Image();
  img.src = '/assets/heroes/' + cls + '.png';
  await img.decode();
  HERO[cls] = { img, y: meta.actions.idleDown.y };
}
function heroCell(cls) {
  const c = document.createElement('canvas');
  c.width = 100; c.height = 100;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(HERO[cls].img, 0, HERO[cls].y, 100, 100, 0, 0, 100, 100);
  return c;
}
function bareCell(cls) {
  const look = kit(cls);
  for (const g of GEAR) look[g] = null;
  return compose(look, 'idle', 2, 0);
}
// weapon-only silhouette: proves each class weapon reads at 1 px before it is scaled into the game
function weaponCell(cls) {
  const c = document.createElement('canvas');
  c.width = 100; c.height = 100;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const parts = computeParts(data, { action: 'attack', dir: 1, tick: 8, globalTick: 8, look: kit(cls) });
  drawParts(ctx, parts.filter((p) => p.kind === 'weapon'), images, { x: 50, y: 92 }, 1);
  return c;
}

const ROWS = [
  {
    label: 'A · 官方英雄圖（assets/heroes idleDown）vs 紙娃娃裸裝（同朝向 dir 2）— 每格上方英雄圖、下方紙娃娃',
    pair: true,
    cells: CLASSES.map((cls) => ({ img: heroCell(cls), img2: bareCell(cls), cap: CN[cls] + ' · 英雄圖 / 裸裝' })),
  },
  {
    label: '待機 · idle（全套裝備，面向鏡頭，dir 2）',
    cells: CLASSES.map((cls) => ({ img: compose(kit(cls), 'idle', 2, 0), cap: CN[cls] + ' · 待機' })),
  },
  {
    label: '攻擊 · 各職業專屬攻擊動作（命中格 impactSlot 2）',
    cells: CLASSES.map((cls) => ({
      img: compose(kit(cls), 'attack', 2, 8),
      cap: CN[cls] + ' · ' + data.meta.kits[cls].weaponType + ' 攻擊',
    })),
  },
  {
    label: '六部位裝備疊加 · 聖騎士（單穿 → 全套）',
    cells: [
      { img: stripCell('paladin', []), cap: '裸裝' },
      ...GEAR.map((g) => ({ img: stripCell('paladin', [g]), cap: GEAR_CN[g] })),
      { img: stripCell('paladin', GEAR.slice()), cap: '全套', accent: true },
    ],
  },
  {
    label: '六部位裝備疊加 · 弓手（同一套資料、不同職業配色）',
    cells: [
      { img: stripCell('archer', []), cap: '裸裝' },
      ...GEAR.map((g) => ({ img: stripCell('archer', [g]), cap: GEAR_CN[g] })),
      { img: stripCell('archer', GEAR.slice()), cap: '全套', accent: true },
    ],
  },
  {
    label: '武器剪影 · 側面 attack 命中格（確認 1 px 仍可辨識）',
    cells: CLASSES.map((cls) => ({
      img: weaponCell(cls),
      cap: CN[cls] + ' · ' + data.meta.kits[cls].weaponType,
    })),
  },
];

const W = 8 * CELL + 7 * GAP + 2 * PAD;
let H = PAD + TITLE;
for (let i = 0; i < ROWS.length; i++) H += LABEL + (ROWS[i].pair ? PAIR : CELL) + (i === ROWS.length - 1 ? 0 : GAP);
H += PAD;

const canvas = document.createElement('canvas');
canvas.width = W; canvas.height = H;
canvas.id = 'c';
document.getElementById('host').appendChild(canvas);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#6b7078';
ctx.fillRect(0, 0, W, H);
ctx.textBaseline = 'middle';

ctx.fillStyle = '#f2f4f7';
ctx.font = 'bold 30px "Microsoft JhengHei","Noto Sans TC",sans-serif';
ctx.textAlign = 'center';
ctx.fillText('暮影村 · 紙娃娃六職業 × 六部位裝備', W / 2, PAD + 20);
ctx.font = '16px "Microsoft JhengHei","Noto Sans TC",sans-serif';
ctx.fillStyle = '#dfe3e9';
ctx.fillText('pixelfx rig 生成 · ' + data.meta.classes.length + ' 職業 · 10 動作 · 8 方位 · 3×', W / 2, PAD + 44);

let y = PAD + TITLE;
for (const row of ROWS) {
  ctx.textAlign = 'left';
  ctx.font = 'bold 18px "Microsoft JhengHei","Noto Sans TC",sans-serif';
  ctx.fillStyle = '#eef1f5';
  ctx.fillText(row.label, PAD, y + 10);
  y += LABEL;

  const rowW = row.cells.length * CELL + (row.cells.length - 1) * GAP;
  const cellH = row.pair ? PAIR : CELL;
  let x = Math.round((W - rowW) / 2);
  for (const cell of row.cells) {
    ctx.fillStyle = cell.accent ? '#5d6470' : '#565b64';
    ctx.fillRect(x, y, CELL, cellH);
    ctx.strokeStyle = cell.accent ? '#ffd884' : '#828994';
    ctx.lineWidth = cell.accent ? 3 : 1;
    ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, cellH - 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cell.img, 0, 0, 100, 100, x, y, CELL, CELL);
    if (cell.img2) {
      ctx.strokeStyle = '#828994';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 18, y + CELL + 6);
      ctx.lineTo(x + CELL - 18, y + CELL + 6);
      ctx.stroke();
      ctx.drawImage(cell.img2, 0, 0, 100, 100, x, y + CELL + 12, CELL, CELL);
    }
    ctx.textAlign = 'center';
    ctx.font = 'bold 17px "Microsoft JhengHei","Noto Sans TC",sans-serif';
    ctx.fillStyle = '#1c1f24';
    ctx.fillText(cell.cap, x + CELL / 2 + 1, y + cellH - 15 + 1);
    ctx.fillStyle = cell.accent ? '#ffe6a8' : '#f2f4f7';
    ctx.fillText(cell.cap, x + CELL / 2, y + cellH - 15);
    x += CELL + GAP;
  }
  y += cellH + GAP;
}

window.__montage = { w: W, h: H };
window.__ready = true;
</script></body></html>`;

const htmlPath = path.join(OUT, 'montage.html');
fs.writeFileSync(htmlPath, PAGE);

// ---------------------------------------------------------------------------------------------
// throw-away static server
// ---------------------------------------------------------------------------------------------

function freePort() {
  return new Promise((res) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
  });
}

let PORT = 5071;
const tryListen = (port, handler) => new Promise((res) => {
  const s = http.createServer(handler);
  s.once('error', () => res(null));
  s.listen(port, '127.0.0.1', () => res(s));
});

const handler = (req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = path.join(ROOT, url.replace(/^\/+/, ''));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end('not found'); return;
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
};

let server = await tryListen(PORT, handler);
if (!server) {
  PORT = await freePort();
  server = await tryListen(PORT, handler);
}
if (!server) {
  console.error('doll-montage: could not start a local server');
  process.exit(1);
}

// ---------------------------------------------------------------------------------------------
// playwright
// ---------------------------------------------------------------------------------------------

let pw = null;
try { pw = await import('playwright'); } catch { /* try the global npm root below */ }
if (!pw) {
  for (const root of [process.env.APPDATA && path.join(process.env.APPDATA, 'npm/node_modules')].filter(Boolean)) {
    try { pw = createRequire(path.join(root, 'noop.js'))('playwright'); break; } catch { /* keep looking */ }
  }
}
if (!pw) {
  console.error('doll-montage: playwright not found');
  server.close();
  process.exit(1);
}

const launchOpts = { headless: true, args: ['--headless=new'] };
for (const exe of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) {
  if (fs.existsSync(exe)) { launchOpts.executablePath = exe; break; }
}

let browser = null;
try {
  browser = await pw.chromium.launch(launchOpts);
  const ctx = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1, locale: 'zh-TW' });
  const page = await ctx.newPage();
  const errors = [];
  const noise = (t) => /favicon|ERR_|404 \(Not Found\)|Failed to load resource/i.test(t);
  page.on('pageerror', (e) => { if (!noise(String(e))) errors.push(String(e)); });
  page.on('console', (m) => { if (m.type() === 'error' && !noise(m.text())) errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/output/doll-pack/montage.html`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
  const dims = await page.evaluate('window.__montage');
  await page.setViewportSize({ width: dims.w, height: dims.h });
  const el = await page.$('#c');
  await el.screenshot({ path: path.join(OUT, 'montage.png') });
  if (errors.length) {
    console.error('doll-montage: page errors -> ' + errors.join(' | '));
    process.exitCode = 1;
  } else {
    console.log(`doll-montage: wrote ${path.relative(ROOT, path.join(OUT, 'montage.png'))} (${dims.w}x${dims.h})`);
  }
} catch (e) {
  console.error('doll-montage: FAIL ' + e.message);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.close();
}
