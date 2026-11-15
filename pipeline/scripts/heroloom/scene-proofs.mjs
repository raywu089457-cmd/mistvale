// pipeline/scripts/heroloom/scene-proofs.mjs — A/B proof sheets for the HeroLoom scene restyle.
//
// Reads the originals in assets/ and the restyled copies in assets/heroloom-scene/ and writes
// side-by-side PNGs to output/heroloom-ext/scene/ :
//   proof-plaza.png           original 2x2 tiling vs restyled 2x2 tiling, 2x zoom (seam check by eye)
//   proof-terrain-atlas.png   whole 1024x768 terrain atlas before | after, full size
//   proof-terrain-cells.png   6 representative cells before | after at 2x
//   proof-biomes.png          the 12 xilurus biome textures before (top row) / after (bottom row)
//   proof-<atlas>.png         woods / flora / props / details / cold / villagers: 4 sample cells
//                             before | after at 4x on a checkerboard
//   proof-palette.png         HeroLoom reference ramp + the plaza warm-stone ladder
//
// Usage: node pipeline/scripts/heroloom/scene-proofs.mjs

import fs from 'node:fs';
import path from 'node:path';
import { decodePng, encodeRgba } from './png.mjs';
import { srgbToOklab } from './scene-color.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const SRC = path.join(ROOT, 'assets');
const OUT = path.join(SRC, 'heroloom-scene');
const PROOF = path.join(ROOT, 'output', 'heroloom-ext', 'scene');

// ---------------------------------------------------------------------------------------------
// tiny raster helpers
// ---------------------------------------------------------------------------------------------

function makeCanvas(w, h, fill = [18, 18, 22, 255]) {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = fill[0]; data[i + 1] = fill[1]; data[i + 2] = fill[2]; data[i + 3] = fill[3]; }
  return { w, h, data };
}

function setPx(c, x, y, rgb, a = 255) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const o = (y * c.w + x) * 4;
  c.data[o] = rgb[0]; c.data[o + 1] = rgb[1]; c.data[o + 2] = rgb[2]; c.data[o + 3] = a;
}

function fillRect(c, x0, y0, w, h, rgb, a = 255) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) setPx(c, x, y, rgb, a);
}

function checkerRect(c, x0, y0, w, h, size = 8) {
  const light = [198, 198, 198], dark = [150, 150, 150];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const odd = ((Math.floor(x / size) + Math.floor(y / size)) & 1) === 1;
      setPx(c, x0 + x, y0 + y, odd ? dark : light);
    }
  }
}

function blit(c, img, dx, dy, scale = 1, background = null) {
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const o = (y * img.width + x) * 4;
      const a = img.rgba[o + 3];
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const px = dx + x * scale + sx, py = dy + y * scale + sy;
          if (background) {
            const bo = (py * background.w + px) * 4;
            const bb = background.data;
            if (a === 0) { if (bo >= 0 && bo < bb.length) { c.data[bo] = bb[bo]; c.data[bo + 1] = bb[bo + 1]; c.data[bo + 2] = bb[bo + 2]; c.data[bo + 3] = 255; } continue; }
            const t = a / 255;
            if (bo >= 0 && bo < bb.length) {
              c.data[bo] = Math.round(img.rgba[o] * t + bb[bo] * (1 - t));
              c.data[bo + 1] = Math.round(img.rgba[o + 1] * t + bb[bo + 1] * (1 - t));
              c.data[bo + 2] = Math.round(img.rgba[o + 2] * t + bb[bo + 2] * (1 - t));
              c.data[bo + 3] = 255;
            }
            continue;
          }
          if (a < 128) continue;
          setPx(c, px, py, [img.rgba[o], img.rgba[o + 1], img.rgba[o + 2]]);
        }
      }
    }
  }
}

function border(c, x0, y0, w, h, rgb = [90, 90, 96]) {
  fillRect(c, x0 - 1, y0 - 1, w + 2, 1, rgb);
  fillRect(c, x0 - 1, y0 + h, w + 2, 1, rgb);
  fillRect(c, x0 - 1, y0, 1, h, rgb);
  fillRect(c, x0 + w, y0, 1, h, rgb);
}

function saveCanvas(c, name) {
  fs.mkdirSync(PROOF, { recursive: true });
  const file = path.join(PROOF, name);
  fs.writeFileSync(file, encodeRgba(c.w, c.h, c.data));
  console.log('  ' + name.padEnd(26) + c.w + 'x' + c.h);
  return file;
}

// ---- 3x5 bitmap font (enough for the proof sheet labels) ----

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
  '@': '010,101,111,100,011',
};

function drawText(c, text, x, y, scale = 2, rgb = [235, 235, 240]) {
  let cx = x;
  for (const ch of String(text).toUpperCase()) {
    const glyph = FONT[ch] || FONT[' '];
    const rows = glyph.split(',');
    for (let ry = 0; ry < rows.length; ry++) {
      for (let rx = 0; rx < 3; rx++) {
        if (rows[ry][rx] !== '1') continue;
        fillRect(c, cx + rx * scale, y + ry * scale, scale, scale, rgb);
      }
    }
    cx += 4 * scale;
  }
  return cx;
}

const textWidth = (text, scale = 2) => String(text).length * 4 * scale - scale;

// ---------------------------------------------------------------------------------------------
// image loading
// ---------------------------------------------------------------------------------------------

const cache = new Map();
function load(rel) {
  if (!cache.has(rel)) {
    const file = path.join(SRC, rel);
    cache.set(rel, decodePng(fs.readFileSync(file)));
  }
  return cache.get(rel);
}
function loadOut(rel) {
  const key = 'out:' + rel;
  if (!cache.has(key)) cache.set(key, decodePng(fs.readFileSync(path.join(OUT, rel))));
  return cache.get(key);
}

function crop(img, x, y, w, h) {
  const out = { width: w, height: h, rgba: new Uint8Array(w * h * 4) };
  for (let yy = 0; yy < h; yy++) {
    out.rgba.set(img.rgba.subarray(((y + yy) * img.width + x) * 4, ((y + yy) * img.width + x + w) * 4), yy * w * 4);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// proof sheets
// ---------------------------------------------------------------------------------------------

function proofPlaza() {
  const before = load('plaza.png');
  const after = loadOut('plaza.png');
  const zoom = 2, tiles = 2;
  const side = before.width * zoom * tiles;
  const header = 22;
  const c = makeCanvas(side * 2 + 8, header + side);
  drawText(c, 'PLAZA 3X3 TILING BEFORE', 4, 6, 2, [235, 235, 240]);
  drawText(c, 'AFTER', side + 12, 6, 2, [255, 220, 160]);
  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      blit(c, before, tx * before.width * zoom, header + ty * before.height * zoom, zoom);
      blit(c, after, side + 8 + tx * after.width * zoom, header + ty * after.height * zoom, zoom);
    }
  }
  border(c, 0, header, side, side);
  border(c, side + 8, header, side, side);
  return saveCanvas(c, 'proof-plaza.png');
}

function proofTerrainAtlas() {
  const before = load('terrain-atlas.png');
  const after = loadOut('terrain-atlas.png');
  const header = 22;
  const c = makeCanvas(before.width * 2 + 8, header + before.height);
  drawText(c, 'TERRAIN ATLAS BEFORE', 4, 6, 2);
  drawText(c, 'AFTER', before.width + 12, 6, 2, [255, 220, 160]);
  blit(c, before, 0, header, 1);
  blit(c, after, before.width + 8, header, 1);
  border(c, 0, header, before.width, before.height);
  border(c, before.width + 8, header, after.width, after.height);
  return saveCanvas(c, 'proof-terrain-atlas.png');
}

const CELL_PREVIEW = ['village', 'meadow', 'snow', 'desert', 'river', 'ice'];

function proofTerrainCells() {
  const man = JSON.parse(fs.readFileSync(path.join(SRC, 'terrain-atlas.manifest.json'), 'utf8'));
  const before = load('terrain-atlas.png');
  const after = loadOut('terrain-atlas.png');
  const zoom = 2;
  const cells = CELL_PREVIEW.map((n) => ({ name: n, ...man.cells[n] }));
  const cellPx = man.tile * zoom;
  const colW = cellPx * 2 + 10;
  const rowH = cellPx + 30;
  const c = makeCanvas(colW * 3 + 10, rowH * 2 + 10);
  cells.forEach((cell, i) => {
    const cx = 6 + (i % 3) * colW;
    const cy = 6 + Math.floor(i / 3) * rowH;
    drawText(c, cell.name, cx, cy, 2, [235, 235, 240]);
    const b = crop(before, cell.x, cell.y, cell.w, cell.h);
    const a = crop(after, cell.x, cell.y, cell.w, cell.h);
    blit(c, b, cx, cy + 14, zoom);
    blit(c, a, cx + cellPx + 4, cy + 14, zoom);
    border(c, cx, cy + 14, cellPx, cellPx);
    border(c, cx + cellPx + 4, cy + 14, cellPx, cellPx);
  });
  return saveCanvas(c, 'proof-terrain-cells.png');
}

const BIOMES = ['desert', 'dirt', 'forest', 'grass', 'ice', 'meadow', 'mountain', 'snow', 'soil', 'stone', 'taiga', 'water'];

function proofBiomes() {
  const tile = 256, gap = 4, labelH = 24;
  const c = makeCanvas(BIOMES.length * tile + (BIOMES.length - 1) * gap, labelH * 2 + tile * 2 + gap);
  BIOMES.forEach((name, i) => {
    const x = i * (tile + gap);
    drawText(c, name, x, 2, 2, [235, 235, 240]);
    blit(c, load(`xilurus/tex-${name}.png`), x, labelH, 1);
    drawText(c, 'AFTER', x, labelH + tile + 6, 2, [255, 220, 160]);
    blit(c, loadOut(`xilurus/tex-${name}.png`), x, labelH + tile + gap + 20, 1);
    border(c, x, labelH, tile, tile);
    border(c, x, labelH + tile + gap + 20, tile, tile);
  });
  return saveCanvas(c, 'proof-biomes.png');
}

function pickCells(atlasName, count = 4) {
  const manRel = `${atlasName}@1x.manifest.json`;
  const man = JSON.parse(fs.readFileSync(path.join(SRC, manRel), 'utf8'));
  const all = Object.entries(man.cells).map(([name, c]) => ({ name, ...c })).sort((a, b) => a.w * a.h - b.w * b.h);
  const picked = [];
  const wanted = Math.min(count, all.length);
  for (let i = 0; i < wanted; i++) {
    const idx = Math.round((i + 0.5) / wanted * (all.length - 1));
    const cell = all[idx];
    if (!picked.some((p) => p.name === cell.name)) picked.push(cell);
  }
  return picked;
}

function proofAtlas(atlasName) {
  const before = load(`${atlasName}@1x.png`);
  const after = loadOut(`${atlasName}@1x.png`);
  const cells = pickCells(atlasName, 4);
  let zoom = 4;
  const widthAt = (z) => cells.reduce((s, c) => s + 2 * (c.w * z + 8) + 8, 8);
  if (widthAt(zoom) > 5200) zoom = 3;
  if (widthAt(zoom) > 5200) zoom = 2;
  const labelH = 20;
  const maxH = Math.max(...cells.map((c) => c.h * zoom));
  const c = makeCanvas(widthAt(zoom) + 8, labelH + maxH + 22);
  drawText(c, `${atlasName} BEFORE`, 4, 2, 2);
  let x = 8;
  for (const cell of cells) {
    const b = crop(before, cell.x, cell.y, cell.w, cell.h);
    const a = crop(after, cell.x, cell.y, cell.w, cell.h);
    drawText(c, cell.name, x, labelH - 2, 2, [235, 235, 240]);
    drawText(c, cell.w + 'X' + cell.h, x, labelH + 12, 1, [170, 170, 180]);
    checkerRect(c, x, labelH + 22, cell.w * zoom, cell.h * zoom, 8);
    blit(c, b, x, labelH + 22, zoom);
    checkerRect(c, x + cell.w * zoom + 8, labelH + 22, cell.w * zoom, cell.h * zoom, 8);
    blit(c, a, x + cell.w * zoom + 8, labelH + 22, zoom);
    border(c, x, labelH + 22, cell.w * zoom, cell.h * zoom);
    border(c, x + cell.w * zoom + 8, labelH + 22, cell.w * zoom, cell.h * zoom);
    x += 2 * (cell.w * zoom + 8) + 8;
  }
  return saveCanvas(c, `proof-${atlasName}.png`);
}

function proofPalette() {
  const palette = JSON.parse(fs.readFileSync(path.join(OUT, 'palette.json'), 'utf8'));
  const report = JSON.parse(fs.readFileSync(path.join(OUT, 'restyle-report.json'), 'utf8'));
  const plaza = report.files.find((f) => f.rel === 'plaza.png');
  const sw = 24, gap = 2;
  const rampW = palette.coreRamp.length * (sw + gap) + 10;
  const ladderW = (plaza.plazaPalette ? plaza.plazaPalette.length : 0) * 64 + 10;
  const c = makeCanvas(Math.max(rampW, ladderW), 2 * (sw + 26) + 30);
  drawText(c, 'HEROLOOM CORE RAMP (' + palette.coreRamp.length + ')', 4, 2, 2);
  palette.coreRamp.forEach((e, i) => {
    fillRect(c, 5 + i * (sw + gap), 22, sw, sw, [e.r, e.g, e.b]);
  });
  drawText(c, 'PLAZA WARM STONE LADDER (' + (plaza.plazaPalette ? plaza.plazaPalette.length : 0) + ')', 4, 22 + sw + 12, 2);
  (plaza.plazaPalette || []).forEach((hex, i) => {
    const rgb = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    fillRect(c, 5 + i * 64, 22 + sw + 32, 60, 60, rgb);
  });
  return saveCanvas(c, 'proof-palette.png');
}

// ---------------------------------------------------------------------------------------------

console.log('HeroLoom scene proof sheets -> output/heroloom-ext/scene/');
proofPlaza();
proofTerrainAtlas();
proofTerrainCells();
proofBiomes();
for (const name of ['woods', 'flora', 'props', 'details', 'cold', 'villagers']) proofAtlas(name);
proofPalette();
console.log('done');
