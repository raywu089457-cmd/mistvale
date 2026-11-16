// HeroLoom wooden fenceRail — round 4 (PixelLab-style wooden fence, authored to the
// engine's tiling contract).
//
// Why authored rather than pasted: the PixelLab object (output/heroloom-ext/fence-pl/
// candidate-1.png) is a 256x256 3/4-view fence panel that cannot tile as the engine's
// 112x104 repeating cell (rails are horizontal in the generated art, while the runtime
// adds a .125 centre shear and advances each segment along the 2:1 iso line). We keep the
// PixelLab palette / post-and-cap design (target_palette from the generation) and author
// the cell so it tiles: rails baked at 0.35 rising to the right (the checker's contract),
// bottom edges at GROUND-48 / GROUND-22 at the LEFT edge, posts vertical bottom-aligned.
//
// Usage: node pipeline/scripts/heroloom/redraw-fence-pl.mjs [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodeRgba, isBinaryAlpha } from './png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const P = (...p) => path.join(ROOT, ...p);
const W = 112, H = 104, PERIOD = 56, POST_W = 20, SLOPE = 0.35, GROUND = 107;
const INK = [21, 13, 27];
const CAP_TOP = [240, 214, 158], CAP = [223, 185, 138], LIGHT = [196, 150, 94], BODY = [166, 116, 68];
const DARK = [134, 88, 50], DEEP = [112, 72, 43], SHADOW = [82, 51, 27];

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const cell = new Uint8ClampedArray(W * H * 4);
const px = (x, y, c) => {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  cell[i] = c[0]; cell[i + 1] = c[1]; cell[i + 2] = c[2]; cell[i + 3] = 255;
};
const hspan = (x, y0, y1, c) => { for (let y = Math.round(y0); y <= Math.round(y1); y++) px(x, y, c); };
const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(x, y, c); };
const vline = (x, y0, y1, c) => { for (let y = y0; y <= y1; y++) px(x, y, c); };

// --- rails (bottom-left at GROUND-22 / GROUND-48, rising to the right)
function rail(bottomLeft, thickness) {
  const yBot = x => bottomLeft - SLOPE * x;
  for (let x = 0; x < W; x++) {
    const yb = yBot(x), yt = yb - thickness;
    hspan(x, yt, yb, BODY);
    px(x, yt, INK);
    px(x, yt + 1, LIGHT); px(x, yt + 2, LIGHT);
    px(x, yb - 3, DARK); px(x, yb - 2, DARK);
    px(x, yb, INK);
  }
  const r = rng(Math.round(bottomLeft));
  for (let k = 0; k < 20; k++) {
    const x = 2 + Math.floor(r() * (W - 10));
    const yy = yBot(x) - 5 - Math.floor(r() * (thickness - 8));
    const len = 2 + Math.floor(r() * 4);
    for (let i = 0; i < len; i++) px(x + i, yy, DARK);
  }
}
rail(GROUND - 22, 16);
rail(GROUND - 48, 16);

// --- posts
function post(x0, y0, y1) {
  const x1 = x0 + POST_W;
  rect(x0 - 2, y0, x1 + 1, y0 + 8, CAP);
  for (let x = x0 - 2; x <= x1 + 1; x++) { px(x, y0, INK); px(x, y0 + 1, CAP_TOP); px(x, y0 + 8, INK); }
  vline(x0 - 2, y0, y0 + 8, INK); vline(x1 + 1, y0, y0 + 8, INK);
  for (let y = y0 + 9; y <= y1; y++) {
    for (let x = x0; x <= x0 + 3; x++) px(x, y, LIGHT);
    for (let x = x0 + 4; x <= x1 - 6; x++) px(x, y, BODY);
    for (let x = x1 - 5; x <= x1 - 2; x++) px(x, y, DARK);
    px(x1 - 1, y, DEEP);
  }
  vline(x0 - 1, y0 + 9, y1, INK); vline(x1, y0 + 9, y1, INK);
  const r = rng(x0 * 13 + 5);
  for (let k = 0; k < 12; k++) {
    const x = x0 + 4 + Math.floor(r() * (POST_W - 9));
    const y = y0 + 13 + Math.floor(r() * (y1 - y0 - 18));
    const len = 2 + Math.floor(r() * 3);
    for (let i = 0; i < len; i++) px(x, y + i, DEEP);
  }
  for (let x = x0 - 2; x <= x1 + 1; x++) px(x, y1, SHADOW);
}
post(0, 6, H - 1);
post(PERIOD, 6, H - 1);

// --- 1px ink outline on the outer alpha edge
{
  const opaque = (x, y) => x >= 0 && y >= 0 && x < W && y < H && cell[(y * W + x) * 4 + 3] > 127;
  const isInk = (x, y) => { const i = (y * W + x) * 4; return cell[i] < 40 && cell[i + 1] < 32 && cell[i + 2] < 44; };
  const add = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!opaque(x, y)) continue;
    if ((!opaque(x - 1, y) || !opaque(x + 1, y) || !opaque(x, y - 1) || !opaque(x, y + 1)) && !isInk(x, y)) add.push([x, y]);
  }
  for (const [x, y] of add) px(x, y, INK);
}
if (!isBinaryAlpha(cell)) throw new Error('fence cell alpha is not binary');
const cell2x = new Uint8ClampedArray(W * 2 * H * 2 * 4);
for (let y = 0; y < H * 2; y++) for (let x = 0; x < W * 2; x++) {
  const si = ((y >> 1) * W + (x >> 1)) * 4, di = (y * W * 2 + x) * 4;
  for (let k = 0; k < 4; k++) cell2x[di + k] = cell[si + k];
}

// --- patch details@1x / @2x
const RECT = { 'details@1x': [154, 1094, 112, 104], 'details@2x': [306, 2180, 224, 208] };
const dry = process.argv.includes('--dry-run');
const report = { generatedAt: new Date().toISOString(), rects: RECT, cells: {} };
for (const variant of ['details@1x', 'details@2x']) {
  const file = P('assets/heroloom-scene', `${variant}.png`);
  const img = decodePng(fs.readFileSync(file));
  const [cx, cy, cw, ch] = RECT[variant];
  const src = variant === 'details@1x' ? cell : cell2x;
  const sw = variant === 'details@1x' ? W : W * 2;
  const sh = variant === 'details@1x' ? H : H * 2;
  if (cw !== sw || ch !== sh) throw new Error(`${variant}: rect ${cw}x${ch} != cell ${sw}x${sh}`);
  let changed = 0;
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const si = (y * sw + x) * 4, di = ((cy + y) * img.width + (cx + x)) * 4;
    if (img.rgba[di] !== src[si] || img.rgba[di + 1] !== src[si + 1] || img.rgba[di + 2] !== src[si + 2] || img.rgba[di + 3] !== src[si + 3]) changed++;
    for (let k = 0; k < 4; k++) img.rgba[di + k] = src[si + k];
  }
  const seen = new Set();
  for (let k = 0; k < src.length; k += 4) {
    if (src[k + 3] > 127) seen.add('#' + [src[k], src[k + 1], src[k + 2]].map(v => v.toString(16).padStart(2, '0')).join(''));
  }
  const palette = [...seen];
  report.cells[variant] = { rect: [cx, cy, cw, ch], changedPixels: changed, palette };
  if (!report.results) report.results = [];
  report.results.push({ file: `${variant}.png`, palette });
  if (!dry) fs.writeFileSync(file, encodeRgba(img.width, img.height, img.rgba));
  console.log(`${variant}: patched [${cx},${cy},${cw},${ch}] — ${changed} px changed${dry ? ' (dry run)' : ''}`);
}
if (!dry) {
  fs.writeFileSync(P('assets/heroloom-scene', 'redraw-fence-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('wrote assets/heroloom-scene/redraw-fence-report.json');
}
