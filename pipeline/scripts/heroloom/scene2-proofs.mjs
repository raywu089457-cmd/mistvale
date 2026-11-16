// HeroLoom scene round 2 — proof sheets for task-10 (terrain cells, plaza, fence).
// Dependency-free: decodes PNGs with pipeline/scripts/heroloom/png.mjs, composites with plain arrays.
// Output: output/heroloom-ext/scene2/
//   terrain-12cells-contact.png  original | redrawn, each cell at 2x, labelled
//   plaza-2x2.png                original 2x2 tiling | redrawn 2x2 tiling
//   fence-closeup-4x.png         fence cell art at 4x | in-game fence crop at 4x
// (fence-in-village.png and terrain-in-game-1440x900.png are browser screenshots, not generated here)
import fs from 'node:fs';
import path from 'node:path';
import { decodePng, encodeRgba } from './png.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const PROOF = path.join(ROOT, 'output/heroloom-ext/scene2');
const SRC = path.join(ROOT, 'assets');
const OUT = path.join(SRC, 'heroloom-scene');

const read = (p) => decodePng(fs.readFileSync(p));

// ── tiny canvas ──────────────────────────────────────────────────────────────
function makeCanvas(w, h, bg = [32, 34, 40]) {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = bg[0]; data[i + 1] = bg[1]; data[i + 2] = bg[2]; data[i + 3] = 255; }
  return { w, h, data };
}
function setPx(c, x, y, rgb, a = 255) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const o = (y * c.w + x) * 4;
  const t = a / 255;
  c.data[o] = Math.round(rgb[0] * t + c.data[o] * (1 - t));
  c.data[o + 1] = Math.round(rgb[1] * t + c.data[o + 1] * (1 - t));
  c.data[o + 2] = Math.round(rgb[2] * t + c.data[o + 2] * (1 - t));
  c.data[o + 3] = 255;
}
function fillRect(c, x0, y0, w, h, rgb) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) setPx(c, x, y, rgb); }
function checkerRect(c, x0, y0, w, h, size = 8) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const odd = ((Math.floor(x / size) + Math.floor(y / size)) & 1) === 1;
    setPx(c, x0 + x, y0 + y, odd ? [150, 150, 150] : [198, 198, 198]);
  }
}
function border(c, x0, y0, w, h, rgb = [90, 90, 96]) {
  fillRect(c, x0 - 1, y0 - 1, w + 2, 1, rgb); fillRect(c, x0 - 1, y0 + h, w + 2, 1, rgb);
  fillRect(c, x0 - 1, y0, 1, h, rgb); fillRect(c, x0 + w, y0, 1, h, rgb);
}
/** blit image region (or whole image) at integer scale; alpha composited onto checker canvas */
function blit(c, img, dx, dy, scale = 1, region = null) {
  const r = region || { x: 0, y: 0, w: img.width, h: img.height };
  // destination dx/dy always refers to the top-left of the region

  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const o = ((r.y + y) * img.width + r.x + x) * 4;
    const a = img.rgba[o + 3];
    for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
      const px = dx + x * scale + sx, py = dy + y * scale + sy;
      if (a < 128) continue;
      setPx(c, px, py, [img.rgba[o], img.rgba[o + 1], img.rgba[o + 2]]);
    }
  }
}
function save(c, name) {
  fs.mkdirSync(PROOF, { recursive: true });
  fs.writeFileSync(path.join(PROOF, name), encodeRgba(c.w, c.h, c.data));
  console.log(`  ${name.padEnd(28)} ${c.w}x${c.h}`);
}

// ── 3x5 font ─────────────────────────────────────────────────────────────────
const FONT = {
  A: '010,101,111,101,101', B: '110,101,110,101,110', C: '011,100,100,100,011', D: '110,101,101,101,110',
  E: '111,100,110,100,111', F: '111,100,110,100,100', G: '011,100,101,101,011', H: '101,101,111,101,101',
  I: '111,010,010,010,111', J: '001,001,001,101,010', K: '101,101,110,101,101', L: '100,100,100,100,111',
  M: '101,111,111,101,101', N: '101,111,101,101,101', O: '010,101,101,101,010', P: '110,101,110,100,100',
  Q: '010,101,101,111,011', R: '110,101,110,101,101', S: '011,100,010,001,110', T: '111,010,010,010,010',
  U: '101,101,101,101,111', V: '101,101,101,101,010', W: '101,101,111,111,101', X: '101,101,010,101,101',
  Y: '101,101,010,010,010', Z: '111,001,010,100,111',
  0: '111,101,101,101,111', 1: '010,110,010,010,111', 2: '110,001,010,100,111', 3: '110,001,010,001,110',
  4: '101,101,111,001,001', 5: '111,100,110,001,110', 6: '011,100,110,101,010', 7: '111,001,010,010,010',
  8: '010,101,010,101,010', 9: '010,101,011,001,110',
  ' ': '000,000,000,000,000', '-': '000,000,111,000,000', ':': '000,010,000,010,000',
  '/': '001,001,010,100,100', '.': '000,000,000,000,010', '#': '101,111,101,111,101',
};
function drawText(c, text, x, y, scale = 2, rgb = [240, 240, 245]) {
  let cx = x;
  for (const ch of String(text).toUpperCase()) {
    const rows = (FONT[ch] || FONT[' ']).split(',');
    for (let ry = 0; ry < rows.length; ry++) for (let rx = 0; rx < 3; rx++) {
      if (rows[ry][rx] === '1') fillRect(c, cx + rx * scale, y + ry * scale, scale, scale, rgb);
    }
    cx += 4 * scale;
  }
}
const textWidth = (s, scale = 2) => String(s).length * 4 * scale - scale;

// ── 1. terrain 12-cell contact sheet ─────────────────────────────────────────
function terrainContact() {
  const orig = read(path.join(SRC, 'terrain-atlas.png'));
  const next = read(path.join(OUT, 'terrain-atlas.png'));
  const man = JSON.parse(fs.readFileSync(path.join(SRC, 'terrain-atlas.manifest.json'), 'utf8'));
  const S = 2, cellPx = 256 * S, gap = 10, pairW = cellPx * 2 + gap, colGap = 26;
  const margin = 16, labelH = 26, rowH = cellPx + labelH;
  const cols = 2, rows = 6;
  const W = margin * 2 + cols * pairW + (cols - 1) * colGap;
  const H = margin * 2 + 34 + rows * rowH + (rows - 1) * 12;
  const c = makeCanvas(W, H);
  drawText(c, 'TERRAIN REDRAW - ORIGINAL | NEW (2X)', margin, margin, 2);
  const names = Object.keys(man.cells);
  names.forEach((name, i) => {
    const cell = man.cells[name];
    const col = i % cols, row = Math.floor(i / cols);
    const x0 = margin + col * (pairW + colGap);
    const y0 = margin + 34 + row * (rowH + 12);
    drawText(c, name, x0, y0, 2);
    drawText(c, 'ORIG', x0 + cellPx - 34, y0, 1);
    drawText(c, 'NEW', x0 + cellPx + gap + cellPx - 30, y0, 1);
    checkerRect(c, x0, y0 + 18, pairW, cellPx);
    blit(c, orig, x0, y0 + 18, S, cell);
    blit(c, next, x0 + cellPx + gap, y0 + 18, S, cell);
    border(c, x0, y0 + 18, cellPx, cellPx);
    border(c, x0 + cellPx + gap, y0 + 18, cellPx, cellPx);
  });
  save(c, 'terrain-12cells-contact.png');
}

// ── 2. plaza 2x2 tiling ──────────────────────────────────────────────────────
function plazaTiling() {
  const orig = read(path.join(SRC, 'plaza.png'));
  const next = read(path.join(OUT, 'plaza.png'));
  const S = 1, tile = 256 * S, gap = 22, margin = 16, labelH = 30;
  const W = margin * 2 + tile * 2 * 2 + gap, H = margin * 2 + labelH + tile * 2;
  const c = makeCanvas(W, H);
  drawText(c, 'PLAZA 2X2 TILING - ORIGINAL | REDRAWN', margin, margin, 2);
  const y0 = margin + labelH;
  for (const [i, img] of [orig, next].entries()) {
    const x0 = margin + i * (tile * 2 + gap);
    drawText(c, i ? 'HEROLOOM FLAGSTONES' : 'ORIGINAL', x0, margin + 20, 1);
    for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
      blit(c, img, x0 + tx * tile, y0 + ty * tile, S);
    }
    border(c, x0, y0, tile * 2, tile * 2);
  }
  save(c, 'plaza-2x2.png');
}

// ── 3. fence close-up: cell art 4x | in-game crop 4x ─────────────────────────
function fenceCloseup() {
  const man = JSON.parse(fs.readFileSync(path.join(SRC, 'details@1x.manifest.json'), 'utf8'));
  const cell = man.cells.fenceRail;
  const details = read(path.join(OUT, 'details@1x.png'));
  const shotPath = path.join(PROOF, 'fence-in-village.png');
  const shot = fs.existsSync(shotPath) ? read(shotPath) : null;
  const S = 4, margin = 16, labelH = 30;
  const cellW = cell.w * S, cellH = cell.h * S;
  const region = shot ? { x: 700, y: 545, w: 420, h: 250 } : null; // east palisade line + buildings
  const shotW = region ? region.w * S : cellW, shotH = region ? region.h * S : cellH;
  const W = margin * 2 + cellW + 24 + shotW;
  const H = margin * 2 + labelH + Math.max(cellH, shotH);
  const c = makeCanvas(W, H);
  drawText(c, 'FENCE RAIL - SPRITE CELL 4X | IN-GAME 4X', margin, margin, 2);
  const y0 = margin + labelH;
  drawText(c, 'SPRITE CELL', margin, margin + 20, 1);
  checkerRect(c, margin, y0, cellW, cellH);
  blit(c, details, margin, y0, S, cell);
  border(c, margin, y0, cellW, cellH);
  const x1 = margin + cellW + 24;
  if (shot) {
    drawText(c, 'IN GAME', x1, margin + 20, 1);
    blit(c, shot, x1, y0, S, region);
    border(c, x1, y0, shotW, shotH);
  }
  save(c, 'fence-closeup-4x.png');
}

terrainContact();
plazaTiling();
fenceCloseup();
console.log('OK scene2 proofs');
