#!/usr/bin/env node
// doll-pack-gear-sheet.mjs — output/doll-pack/gear-identity.png
//
// Task-10 art sheet: proves each class's six gear pieces are a DIFFERENT material, and that a mix of
// pieces still reads as that class. Rendered through the real pack (assets/paperdoll-classes/) and the
// real compose code (computeParts + drawParts from src/paperdoll.js) in a browser page:
//
//   section 1  4x grid: for every class, bare | helm | chest | belt | legs | boots | gloves | all six
//   section 2  1x strip (real in-game size) of the same grid, so "is it visible at 1x" is checkable
//   section 3  4x mixed-wear row: each class wearing a different four-piece subset, plus one full set
//
// It also prints, per class and piece, the number of body pixels the piece changes at 1x (the art
// budget the checker asserts on), so the report numbers come from the same draw call the game uses.
//
//   node pipeline/scripts/pixelfx/character/doll-pack-gear-sheet.mjs
//
// No build, no repo server: a throw-away static server (127.0.0.1:5072, or a free port if busy)
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
  console.error('doll-pack-gear-sheet: run doll-pack.mjs first (assets/paperdoll-classes/paperdoll.json missing)');
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
<title>doll-pack gear identity</title>
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

const CLASSES = ['archer', 'berserker', 'paladin', 'sorcerer', 'assassin', 'priest'];
const CN = { archer: '弓手', berserker: '狂戰士', paladin: '聖騎士', sorcerer: '巫師', assassin: '刺客', priest: '牧師' };
const GEAR = ['helm', 'chest', 'belt', 'legs', 'boots', 'gloves'];
const GEAR_CN = { helm: '頭盔', chest: '胸甲', belt: '腰帶', legs: '護腿', boots: '戰靴', gloves: '護手' };
const KITM = data.meta.gearKits || {};

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
function cellFor(cls, worn) {
  const look = kit(cls);
  for (const g of GEAR) look[g] = worn.includes(g) ? data.meta.kits[cls][g] : null;
  return compose(look, 'idle', 2, 0);
}

// ---- per-piece changed-pixel table at 1x (same look the checker uses) -------------------------
function pixels(c) {
  const d = c.getContext('2d').getImageData(0, 0, 100, 100).data;
  const m = new Map();
  for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) {
    const i = (y * 100 + x) * 4;
    if (!d[i + 3]) continue;
    m.set(y * 100 + x, (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
  }
  return m;
}
const changedTable = {};
for (const cls of CLASSES) {
  const bare = pixels(cellFor(cls, []));
  changedTable[cls] = {};
  for (const g of GEAR) {
    const m = pixels(cellFor(cls, [g]));
    let n = 0;
    for (const [k, v] of m) if (bare.get(k) !== v) n++;
    changedTable[cls][g] = n;
  }
}

// ---- layout -----------------------------------------------------------------------------------
const PX = 4, CELL = 100 * PX;       // 4x main grid
const SMALL = 100, SCELL = SMALL;    // 1x strip
const COLS = 8, GAP = 10, PAD = 24, LABEL = 26, TITLE = 84;

const section1 = CLASSES.map((cls) => ([
  { img: cellFor(cls, []), cap: '裸裝' },
  ...GEAR.map((g) => ({ img: cellFor(cls, [g]), cap: GEAR_CN[g] })),
  { img: cellFor(cls, GEAR.slice()), cap: '全套', accent: true },
].map((c) => ({ ...c, cls }))));

const MIX = {
  archer: ['helm', 'chest', 'belt', 'gloves'],
  berserker: ['helm', 'legs', 'boots'],
  paladin: ['chest', 'belt', 'legs', 'boots'],
  sorcerer: ['helm', 'belt', 'gloves'],
  assassin: ['helm', 'chest', 'legs'],
  priest: ['helm', 'belt', 'boots'],
};
const section3 = CLASSES.map((cls) => ({
  img: cellFor(cls, MIX[cls]),
  cap: CN[cls] + ' · ' + MIX[cls].map((g) => GEAR_CN[g]).join('+'),
}));

const W = COLS * CELL + (COLS - 1) * GAP + 2 * PAD;
const H1 = CLASSES.length * (LABEL + CELL + GAP);
const W2 = COLS * SCELL + (COLS - 1) * GAP;
const H2 = LABEL + CLASSES.length * (SCELL + 6) + 8;
const H3 = LABEL + CELL + 4;
const H = PAD + TITLE + H1 + 18 + LABEL + H2 + 14 + H3 + PAD;

const canvas = document.createElement('canvas');
canvas.width = W; canvas.height = H;
canvas.id = 'c';
document.getElementById('host').appendChild(canvas);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#6b7078';
ctx.fillRect(0, 0, W, H);
ctx.textBaseline = 'middle';
ctx.imageSmoothingEnabled = false;

ctx.fillStyle = '#f2f4f7';
ctx.font = 'bold 30px "Microsoft JhengHei","Noto Sans TC",sans-serif';
ctx.textAlign = 'center';
ctx.fillText('暮影村 · 六職業專屬裝備材質（task-10 身份驗證）', W / 2, PAD + 20);
ctx.font = '16px "Microsoft JhengHei","Noto Sans TC",sans-serif';
ctx.fillStyle = '#dfe3e9';
ctx.fillText('每格以真實 pack + computeParts/drawParts 繪製 · 上：4× 下：1× 實際尺寸', W / 2, PAD + 48);

let y = PAD + TITLE;
ctx.textAlign = 'left';
ctx.font = 'bold 18px "Microsoft JhengHei","Noto Sans TC",sans-serif';
ctx.fillStyle = '#eef1f5';
ctx.fillText('① 4× · 每職業：裸裝 → 六部位單穿 → 全套（每個部位必須是不同的材質）', PAD, y + 8);
y += LABEL;
for (let r = 0; r < CLASSES.length; r++) {
  const cls = CLASSES[r];
  const rowW = COLS * CELL + (COLS - 1) * GAP;
  let x = Math.round((W - rowW) / 2);
  for (const cell of section1[r]) {
    ctx.fillStyle = cell.accent ? '#5d6470' : '#565b64';
    ctx.fillRect(x, y, CELL, CELL);
    ctx.strokeStyle = cell.accent ? '#ffd884' : '#828994';
    ctx.lineWidth = cell.accent ? 3 : 1;
    ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
    ctx.drawImage(cell.img, 0, 0, 100, 100, x, y, CELL, CELL);
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px "Microsoft JhengHei","Noto Sans TC",sans-serif';
    ctx.fillStyle = '#1c1f24';
    ctx.fillText(cell.cap, x + CELL / 2 + 1, y + CELL - 12 + 1);
    ctx.fillStyle = cell.accent ? '#ffe6a8' : '#f2f4f7';
    ctx.fillText(cell.cap, x + CELL / 2, y + CELL - 12);
    x += CELL + GAP;
  }
  // class label gutter on the left of the row
  ctx.textAlign = 'left';
  ctx.font = 'bold 20px "Microsoft JhengHei","Noto Sans TC",sans-serif';
  ctx.fillStyle = '#f2f4f7';
  ctx.fillText(CN[cls], PAD, y + 14);
  y += CELL + GAP;
}
y += 18;

ctx.textAlign = 'left';
ctx.font = 'bold 18px "Microsoft JhengHei","Noto Sans TC",sans-serif';
ctx.fillStyle = '#eef1f5';
ctx.fillText('② 1× 實際遊戲尺寸 · 同樣的順序（材質在 1 倍下仍要能分辨）', PAD, y + 8);
y += LABEL;
for (let r = 0; r < CLASSES.length; r++) {
  let x = PAD;
  for (const cell of section1[r]) {
    ctx.fillStyle = cell.accent ? '#5d6470' : '#565b64';
    ctx.fillRect(x, y, SCELL, SCELL);
    ctx.drawImage(cell.img, 0, 0, 100, 100, x, y, SCELL, SCELL);
    x += SCELL + GAP;
  }
  y += SCELL + 6;
}
y += 14;

ctx.textAlign = 'left';
ctx.font = 'bold 18px "Microsoft JhengHei","Noto Sans TC",sans-serif';
ctx.fillStyle = '#eef1f5';
ctx.fillText('③ 4× 混搭 · 每職業穿不同組合（混搭仍要讀得出職業）', PAD, y + 8);
y += LABEL;
{
  const rowW = CLASSES.length * CELL + (CLASSES.length - 1) * GAP;
  let x = Math.round((W - rowW) / 2);
  for (const cell of section3) {
    ctx.fillStyle = '#565b64';
    ctx.fillRect(x, y, CELL, CELL);
    ctx.strokeStyle = '#9aa2ae';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
    ctx.drawImage(cell.img, 0, 0, 100, 100, x, y, CELL, CELL);
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px "Microsoft JhengHei","Noto Sans TC",sans-serif';
    ctx.fillStyle = '#1c1f24';
    ctx.fillText(cell.cap, x + CELL / 2 + 1, y + CELL - 12 + 1);
    ctx.fillStyle = '#f2f4f7';
    ctx.fillText(cell.cap, x + CELL / 2, y + CELL - 12);
    x += CELL + GAP;
  }
  y += CELL;
}

window.__changed = changedTable;
window.__sheet = { w: W, h: H };
window.__ready = true;
</script></body></html>`;

const htmlPath = path.join(OUT, 'gear-identity.html');
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

let PORT = 5072;
let server = await tryListen(PORT, handler);
if (!server) {
  PORT = await freePort();
  server = await tryListen(PORT, handler);
}
if (!server) {
  console.error('doll-pack-gear-sheet: could not start a local server');
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
  console.error('doll-pack-gear-sheet: playwright not found');
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
  const bctx = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1, locale: 'zh-TW' });
  const page = await bctx.newPage();
  const errors = [];
  const noise = (t) => /favicon|ERR_|404 \(Not Found\)|Failed to load resource/i.test(t);
  page.on('pageerror', (e) => { if (!noise(String(e))) errors.push(String(e)); });
  page.on('console', (m) => { if (m.type() === 'error' && !noise(m.text())) errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/output/doll-pack/gear-identity.html`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
  const dims = await page.evaluate('window.__sheet');
  const changed = await page.evaluate('window.__changed');
  await page.setViewportSize({ width: dims.w, height: dims.h });
  const el = await page.$('#c');
  await el.screenshot({ path: path.join(OUT, 'gear-identity.png') });
  if (errors.length) {
    console.error('doll-pack-gear-sheet: page errors -> ' + errors.join(' | '));
    process.exitCode = 1;
  } else {
    console.log(`doll-pack-gear-sheet: wrote ${path.relative(ROOT, path.join(OUT, 'gear-identity.png'))} (${dims.w}x${dims.h})`);
  }
  // changed-pixel table at 1x vs the bare body: the visibility budget the task-10 acceptance asks for
  const GEAR = ['helm', 'chest', 'belt', 'legs', 'boots', 'gloves'];
  for (const cls of Object.keys(changed)) {
    console.log(`  changed@1x ${cls.padEnd(10)} ${GEAR.map((g) => `${g} ${String(changed[cls][g]).padStart(3)}`).join('  ')}`);
  }
} catch (e) {
  console.error('doll-pack-gear-sheet: FAIL ' + e.message);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.close();
}
