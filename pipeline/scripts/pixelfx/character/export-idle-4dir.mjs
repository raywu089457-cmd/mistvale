#!/usr/bin/env node
// T89: export the shared bare body standing still in the game's four directions.
//
//   node pipeline/scripts/pixelfx/character/export-idle-4dir.mjs
//
// Writes only under output/pixelfx-character/barebody/ (never assets/vfx-sheets):
//   barebody-idle-4dir.png / .json   one row per direction (down, up, right, left), 1 frame each,
//                                    76x76 cells, pivot [38,62], 8 fps, 1 column
//   idle-4dir.png                    the montage: per direction the idle at 8x and next to it a
//                                    DEBUG view of the same frame with every rig part in a flat
//                                    distinct colour, and a legend row under the grid
// The T86/T88 walk sheets are left untouched: this exporter never writes their files.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { actBounds } from './core/act.js';
import { posed, setMaterial, BONE } from './core/rig.js';
import { rasterText } from './core/font.js';
import { BARE_BODY } from './barebody.js';
import { DIRECTIONS, posesOf, right, meta } from './idle-4dir.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const OUT = path.join(ROOT, 'output/pixelfx-character/barebody');
const NAME = 'barebody-idle-4dir';
const PAD = 6;
const ZOOM = 8;

setMaterial(BARE_BODY);

// the T86 cell, from the side walk's meta box (size 64x64, origin 32,56); the idle stays inside it
const b = actBounds({ act: { poses: [[0, right]] }, meta });
const cellW = b.x1 - b.x0 + PAD * 2, cellH = b.y1 - b.y0 + PAD * 2, px = PAD - b.x0, py = PAD - b.y0;
if (cellW !== 76 || cellH !== 76 || px !== 38 || py !== 62) {
  console.error(`unexpected cell ${cellW}x${cellH} pivot [${px},${py}]; T86 is 76x76 [38,62]`);
  process.exit(2);
}
const fps = meta.fps;

// ── RGBA canvas / PNG (same shape as export-4dir.mjs)
const crcT = (() => {
  const t = new Int32Array(256);
  for (let k = 0; k < 256; k++) { let c = k; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[k] = c; }
  return t;
})();
const crc32 = (buf) => { let c = -1; for (const v of buf) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const BG = [12, 11, 16, 255];
function canvas(w, h, fill = BG) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(fill, i * 4);
  return {
    w, h, data,
    paste(src, sw, sh, x, y, transparent = false) {
      for (let sy = 0; sy < sh; sy++) {
        const ty = y + sy;
        if (ty < 0 || ty >= h) continue;
        for (let sx = 0; sx < sw; sx++) {
          const tx = x + sx;
          if (tx < 0 || tx >= w) continue;
          const s = (sy * sw + sx) * 4, a = src[s + 3] / 255;
          if (!a) continue;
          const d = (ty * w + tx) * 4;
          if (transparent) { data[d] = src[s]; data[d + 1] = src[s + 1]; data[d + 2] = src[s + 2]; data[d + 3] = src[s + 3]; continue; }
          for (let c = 0; c < 3; c++) data[d + c] = src[s + c] * a + data[d + c] * (1 - a);
          data[d + 3] = Math.max(data[d + 3], src[s + 3]);
        }
      }
    },
    rect(x, y, rw, rh, rgb) {
      for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) {
        const tx = x + i, ty = y + j;
        if (tx >= 0 && ty >= 0 && tx < w && ty < h) data.set([...rgb, 255], (ty * w + tx) * 4);
      }
    },
    text(str, x, y, k = 2, rgb = [200, 196, 214]) {
      rasterText(str, 'mini', (gx, gy) => {
        for (let yy = 0; yy < k; yy++)
          for (let xx = 0; xx < k; xx++) {
            const tx = x + gx * k + xx, ty = y + gy * k + yy;
            if (tx >= 0 && ty >= 0 && tx < w && ty < h) data.set([...rgb, 255], (ty * w + tx) * 4);
          }
      });
    },
    png() { return encodePNG(w, h, data); },
  };
}
const upscale = (rgba, w, h, k) => {
  const out = new Uint8ClampedArray(w * k * h * k * 4);
  for (let y = 0; y < h * k; y++) for (let x = 0; x < w * k; x++) {
    const s = (((y / k) | 0) * w + ((x / k) | 0)) * 4, d = (y * w * k + x) * 4;
    out[d] = rgba[s]; out[d + 1] = rgba[s + 1]; out[d + 2] = rgba[s + 2]; out[d + 3] = rgba[s + 3];
  }
  return out;
};
const rgbOf = (hexStr) => [1, 3, 5].map((i) => parseInt(hexStr.slice(i, i + 2), 16));

// ── one pose in the T86 cell
function renderPose(pose) {
  const cell = new Uint8ClampedArray(cellW * cellH * 4), r = posed(pose);
  for (let i = 0; i < r.n; i++) {
    const x = px + r.xs[i], y = py + r.ys[i];
    if (x < 0 || y < 0 || x >= cellW || y >= cellH) continue;
    const c = r.color[i], o = (y * cellW + x) * 4;
    cell[o] = c & 255; cell[o + 1] = (c >>> 8) & 255; cell[o + 2] = (c >>> 16) & 255; cell[o + 3] = (c >>> 24) & 255;
  }
  return cell;
}
// the left row is the right row mirrored in the cell; pivot 38 -> 76 - 38 = 38
function mirrorCell(src) {
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < cellH; y++)
    for (let x = 0; x < cellW; x++) {
      const s = (y * cellW + (cellW - 1 - x)) * 4, d = (y * cellW + x) * 4;
      out[d] = src[s]; out[d + 1] = src[s + 1]; out[d + 2] = src[s + 2]; out[d + 3] = src[s + 3];
    }
  return out;
}

// ── the four rows
const poseOf = (dir) => (dir === 'left' ? right : posesOf(dir)[0]);
const rows = DIRECTIONS.map((dir) => {
  const cell = renderPose(poseOf(dir));
  return dir === 'left' ? mirrorCell(cell) : cell;
});

// ── the sheet
const sheet = canvas(cellW, cellH * 4, [0, 0, 0, 0]);
const frames = [];
rows.forEach((img, d) => {
  sheet.paste(img, cellW, cellH, 0, d * cellH, true);
  frames.push({
    filename: `${NAME} ${DIRECTIONS[d]} 0`, frame: { x: 0, y: d * cellH, w: cellW, h: cellH }, rotated: false, trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: cellW, h: cellH }, sourceSize: { w: cellW, h: cellH },
    duration: Math.round(1000 / fps),
  });
});
const json = {
  frames,
  meta: {
    app: 'https://github.com/patch-gg/pixelfx', version: '1', image: `${NAME}.png`, format: 'RGBA8888',
    size: { w: cellW, h: cellH * 4 }, scale: '1',
    frameTags: DIRECTIONS.map((name, i) => ({ name, from: i, to: i, direction: 'forward' })),
    pixelfx: {
      id: `character/${NAME}`,
      name: 'Bare-body idle, four directions',
      fps, loop: true, frames: 1, rows: 4, columns: 1, directions: [...DIRECTIONS],
      frameSize: [cellW, cellH], pivot: [px, py],
      actor: { body: 'barebody', move: 'idle-4dir' },
    },
  },
};

// ── the DEBUG view: every rig part flat and distinct
const DBG = {
  upperN: '#e61919', elbowN: '#f28c1a', foreN: '#e8d21a', handN: '#37b24d',
  upperF: '#12b0b0', elbowF: '#1c6fd6', foreF: '#7a3fd6', handF: '#d63fb0',
  head: '#d9c08c', face: '#efd7a3', neck: '#b99a68', chest: '#a5814e', waist: '#8f6a3f', pelvis: '#7a5230',
  thighN: '#5a3a1a', kneeN: '#6f4b24', shinN: '#845c2e', footN: '#9a6f3a',
  thighF: '#3a4a5a', kneeF: '#4b5f73', shinF: '#5d748c', footF: '#7189a3',
};
const LEGEND = ['upperN', 'elbowN', 'foreN', 'handN', 'upperF', 'elbowF', 'foreF', 'handF',
  'head', 'face', 'neck', 'chest', 'waist', 'pelvis',
  'thighN', 'kneeN', 'shinN', 'footN', 'thighF', 'kneeF', 'shinF', 'footF'];
const INK = '#1d1410';
function debugCell(dir) {
  const out = new Uint8ClampedArray(cellW * cellH * 4);
  const r = posed(poseOf(dir));
  for (let i = 0; i < r.n; i++) {
    const x0 = dir === 'left' ? cellW - 1 - (px + r.xs[i]) : px + r.xs[i], y = py + r.ys[i];
    if (x0 < 0 || y < 0 || x0 >= cellW || y >= cellH) continue;
    const name = BONE[r.part[i]];
    const rgb = rgbOf(DBG[name] ?? INK), o = (y * cellW + x0) * 4;
    out[o] = rgb[0]; out[o + 1] = rgb[1]; out[o + 2] = rgb[2]; out[o + 3] = 255;
  }
  return out;
}

// ── the montage: per direction idle 8x | DEBUG 8x, each DEBUG pane with its own legend row block
const pane = cellW * ZOOM, GAP = 12, M = 8;
const sw = 10, lgK = 2, perRow = 8;
const lgRowH = lgK * 5 + 6;
const legendH = Math.ceil(LEGEND.length / perRow) * lgRowH;
const titleH = 22, rowH = 16 + pane, rowGap = 8 + legendH;
const W = M * 2 + pane * 2 + GAP;
const H = titleH + DIRECTIONS.length * (rowH + rowGap) + 8;
const montage = canvas(W, H);
montage.text(`${NAME}  ${cellW}x${cellH}  pivot [${px},${py}]  ${fps} fps  ${ZOOM}x  idle | rig parts`, M, 6, 2);
DIRECTIONS.forEach((dir, d) => {
  const y0 = titleH + d * (rowH + rowGap);
  montage.text(`${dir}  idle + DEBUG`, M, y0, 2);
  montage.paste(upscale(rows[d], cellW, cellH, ZOOM), pane, pane, M, y0 + rowH - pane);
  const dx0 = M + pane + GAP;
  montage.paste(upscale(debugCell(dir), cellW, cellH, ZOOM), pane, pane, dx0, y0 + rowH - pane);
  // the legend sits under this direction's DEBUG pane
  const colW = Math.floor((pane - 4) / perRow);
  LEGEND.forEach((name, i) => {
    const lx = dx0 + (i % perRow) * colW, ly = y0 + rowH + 4 + ((i / perRow) | 0) * lgRowH;
    montage.rect(lx, ly + 1, sw, sw, rgbOf(DBG[name]));
    montage.text(name, lx + sw + 4, ly + 2, lgK);
  });
});

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, `${NAME}.png`), sheet.png());
fs.writeFileSync(path.join(OUT, `${NAME}.json`), JSON.stringify(json, null, 1));
fs.writeFileSync(path.join(OUT, 'idle-4dir.png'), montage.png());

console.log(`${NAME} -> ${path.relative(ROOT, OUT)}/${NAME}.{png,json}  ${cellW}x${cellH}, pivot [${px},${py}], 4x1 frame @ ${fps} fps; idle-4dir.png ${W}x${H}`);
