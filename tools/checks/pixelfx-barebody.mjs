#!/usr/bin/env node
// T86 acceptance: the shared bare-body walk sheet.
//
// Checks output/pixelfx-character/barebody/barebody-walk.{png,json}:
//   - 8 frames (or the move's count), fps / cell size / pivot / columns as export-sheet.mjs --actor gives the move
//   - every frame's alpha mask equals the stock pixelfx checkout's grey render of the same
//     move/frame without the weapon (PIXELFX_DIR, read only; T86 accepted 0 missing / 0 extra)
//   - every opaque colour is in the bare-body palette (or the baked foot shadow)
//   - no #f53cd1, no DUMMY_PAL tone
//   - every frame has >= 1 interior #1d1410 head pixel (the eye)
//   - every frame has shorts pixels on both legs' hip band
//
// Exit 0 = all hold; 1 = a check failed (FAIL lines first, then the counts).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'output/pixelfx-character/barebody');
const SHEET = path.join(OUT, 'barebody-walk.png');
const JSONF = path.join(OUT, 'barebody-walk.json');
const PF = process.env.PIXELFX_DIR || 'C:/Users/ray/pixelfx';
const PAD = 6; // export-sheet.mjs --actor pad (fxlib renderAct default)

const PALETTE = ['#1d1410', '#f6c894', '#e4b78d', '#c88f5f', '#9a6440', '#5b4b3e', '#463a30'];
const INK = '#1d1410';
const SHORTS = new Set(['#5b4b3e', '#463a30']);
const DUMMY = ['#0e0c14', '#e4e6ec', '#b6b9c3', '#868995', '#5c5e6a', '#6e707c', '#4b4d58', '#34353f', '#2a2b33', '#f53cd1'];
const fail = [];
const bad = (msg) => { if (fail.length < 40) fail.push(msg); };

// ---- a tiny RGBA PNG reader (8-bit, non-interlaced), same shape as tools/checks/mage-attack-fx.mjs
function readPNG(file) {
  let b;
  try { b = fs.readFileSync(file); } catch { return null; }
  if (b.length < 8 || b.toString('ascii', 1, 4) !== 'PNG') return null;
  let p = 8, w = 0, h = 0, depth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (p + 8 <= b.length) {
    const len = b.readUInt32BE(p), type = b.toString('ascii', p + 4, p + 8), data = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; colorType = data[9]; interlace = data[12]; }
    else if (type === 'IDAT') idat.push(data);
    p += 12 + len;
    if (type === 'IEND') break;
  }
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 0 ? 1 : 0;
  if (!w || !h || depth !== 8 || interlace || !ch) return null;
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch, pixels = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride), off = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[off++], row = raw.subarray(off, off + stride); off += stride;
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, up = prev[x], c = x >= ch ? prev[x - ch] : 0;
      let v = row[x];
      if (filter === 1) v = (v + a) & 255;
      else if (filter === 2) v = (v + up) & 255;
      else if (filter === 3) v = (v + ((a + up) >> 1)) & 255;
      else if (filter === 4) {
        const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c)) & 255;
      }
      cur[x] = v;
    }
    cur.copy(pixels, y * stride); prev = cur;
  }
  return { w, h, ch, pixels };
}
const hexOf = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

// ---- the stock grey reference, read-only through the pixelfx checkout
let rig, move, actLib;
try {
  rig = await import(pathToFileURL(path.join(PF, 'src/core/rig.js')).href);
  move = await import(pathToFileURL(path.join(PF, 'src/fx/moves/archer-walk.js')).href);
  actLib = await import(pathToFileURL(path.join(PF, 'src/core/act.js')).href);
} catch (e) {
  console.log(`FAIL cannot import the stock pixelfx core at ${PF}: ${e.message}`);
  console.log('FAIL stock-reference');
  process.exit(1);
}

const poses = move.act.poses.map(([t, p]) => {
  const q = { ...p };
  delete q.weapon;
  return [t, q];
});
const b = actLib.actBounds(move);
const cell = { w: b.x1 - b.x0 + PAD * 2, h: b.y1 - b.y0 + PAD * 2, px: PAD - b.x0, py: PAD - b.y0 };
const nFrames = poses.length, fps = move.meta.fps, cols = Math.ceil(Math.sqrt((nFrames * cell.h) / cell.w));

console.log(`stock reference: ${nFrames} frames @ ${fps} fps, cell ${cell.w}x${cell.h}, pivot [${cell.px},${cell.py}], ${cols} columns`);

// ---- the sheet
const sheetJson = (() => { try { return JSON.parse(fs.readFileSync(JSONF, 'utf8')); } catch { return null; } })();
const png = readPNG(SHEET);
if (!sheetJson) bad(`missing or unreadable ${path.relative(ROOT, JSONF)}`);
if (!png) bad(`missing or unreadable ${path.relative(ROOT, SHEET)}`);
if (!sheetJson || !png) {
  console.log(fail.map((f) => `FAIL ${f}`).join('\n'));
  console.log('FAIL no bare-body walk sheet yet');
  process.exit(1);
}

const meta = sheetJson.meta?.pixelfx ?? {};
if (sheetJson.frames?.length !== nFrames) bad(`frame count ${sheetJson.frames?.length} != ${nFrames}`);
if (meta.frames !== nFrames) bad(`meta frames ${meta.frames} != ${nFrames}`);
if (meta.fps !== fps) bad(`fps ${meta.fps} != ${fps}`);
if (meta.loop !== true) bad('meta loop is not true');
if (!meta.frameSize || meta.frameSize[0] !== cell.w || meta.frameSize[1] !== cell.h) bad(`frameSize ${JSON.stringify(meta.frameSize)} != [${cell.w},${cell.h}]`);
if (!meta.pivot || meta.pivot[0] !== cell.px || meta.pivot[1] !== cell.py) bad(`pivot ${JSON.stringify(meta.pivot)} != [${cell.px},${cell.py}]`);
if (meta.columns !== cols) bad(`columns ${meta.columns} != ${cols}`);
const wantW = cell.w * cols, wantH = cell.h * Math.ceil(nFrames / cols);
if (png.w !== wantW || png.h !== wantH) bad(`sheet is ${png.w}x${png.h}, expected ${wantW}x${wantH}`);

// ---- per frame
const at = (x, y) => {
  const i = ((y * png.w) + x) * png.ch;
  return png.pixels[i + 3] > 0 ? { a: png.pixels[i + 3], hex: hexOf(png.pixels[i], png.pixels[i + 1], png.pixels[i + 2]) } : null;
};
const alphaAt = (x, y) => (x < 0 || y < 0 || x >= png.w || y >= png.h ? 0 : png.pixels[((y * png.w) + x) * png.ch + 3]);
let eyeFrames = 0, shortsFrames = 0, colourBad = 0, maskBad = 0, missingTotal = 0, extraTotal = 0;
const seenColours = new Set();
for (let f = 0; f < nFrames; f++) {
  const fr = sheetJson.frames[f]?.frame;
  if (!fr || fr.w !== cell.w || fr.h !== cell.h) { bad(`frame ${f} rect is not the cell`); continue; }
  const q = poses[f][1], r = rig.posed(q);
  const stock = new Set(), srcAt = new Map();
  for (let i = 0; i < r.n; i++) {
    const x = cell.px + r.xs[i], y = cell.py + r.ys[i], k = `${x},${y}`;
    stock.add(k);
    srcAt.set(k, r.src[i]);
  }
  const mine = new Set();
  for (let y = 0; y < cell.h; y++)
    for (let x = 0; x < cell.w; x++) {
      const c = at(fr.x + x, fr.y + y);
      if (!c) continue;
      mine.add(`${x},${y}`);
      seenColours.add(c.hex);
      const shadow = c.hex === '#000000' && c.a === 110;
      if (!PALETTE.includes(c.hex) && !shadow) { colourBad++; if (colourBad <= 6) bad(`frame ${f}: colour ${c.hex} at ${x},${y} is not in the palette`); }
      if (DUMMY.includes(c.hex)) bad(`frame ${f}: DUMMY_PAL tone ${c.hex} at ${x},${y}`);
    }
  let missing = 0, extra = 0;
  for (const k of stock) if (!mine.has(k)) missing++;
  for (const k of mine) if (!stock.has(k)) extra++;
  missingTotal += missing; extraTotal += extra;
  console.log(`frame ${f}: mask vs stock ${missing} missing, ${extra} extra`);
  if (missing || extra) { maskBad++; bad(`frame ${f}: alpha mask differs from the stock body (${missing} missing, ${extra} extra)`); }

  // the eye: an interior ink pixel on a head rest row
  let eyes = 0;
  for (const k of mine) {
    if (at(fr.x + Number(k.split(',')[0]), fr.y + Number(k.split(',')[1])).hex !== INK) continue;
    const [x, y] = k.split(',').map(Number);
    if (!alphaAt(fr.x + x, fr.y + y) || !alphaAt(fr.x + x + 1, fr.y + y) || !alphaAt(fr.x + x - 1, fr.y + y) || !alphaAt(fr.x + x, fr.y + y + 1) || !alphaAt(fr.x + x, fr.y + y - 1)) continue;
    const s = srcAt.get(k);
    if (s >= 0 && Math.floor(s / 24) <= 7) eyes++;
  }
  if (eyes >= 1) eyeFrames++; else bad(`frame ${f}: no interior ink head pixel (the eye)`);

  // shorts on both legs' hip band: stock part pixels whose rest row is 18..23
  let legs = 0;
  for (const part of rig.posedParts(q)) {
    if (part.name !== 'thighN' && part.name !== 'thighF') continue;
    let hit = false;
    for (let i = 0; i < part.n && !hit; i++) {
      const x = cell.px + part.xs[i], y = cell.py + part.ys[i], k = `${x},${y}`, s = srcAt.get(k);
      if (s === undefined || s < 0) continue;
      const row = Math.floor(s / 24);
      if (row < 18 || row > 23) continue;
      const c = at(fr.x + x, fr.y + y);
      if (c && SHORTS.has(c.hex)) hit = true;
    }
    if (hit) legs++;
  }
  if (legs === 2) shortsFrames++; else bad(`frame ${f}: shorts on ${legs}/2 legs' hip band`);
}

console.log(`palette seen: ${[...seenColours].sort().join(' ')}`);
console.log(`mask vs stock: ${missingTotal} missing, ${extraTotal} extra over ${nFrames} frames`);
console.log(`eye ${eyeFrames}/${nFrames} frames, shorts ${shortsFrames}/${nFrames} frames, mask ${nFrames - maskBad}/${nFrames}, colours off-palette ${colourBad}`);
if (fail.length) {
  console.log(fail.map((f) => `FAIL ${f}`).join('\n'));
  console.log(`FAIL ${fail.length} check(s)`);
  process.exit(1);
}
console.log(`PASS bare-body walk: ${nFrames} frames ${cell.w}x${cell.h}, mask=stock (${missingTotal} missing, ${extraTotal} extra), palette=${PALETTE.length} colours, eye ${nFrames}/${nFrames}, shorts ${nFrames}/${nFrames}`);
