#!/usr/bin/env node
// T88: export the shared bare body on the game's four walk directions.
//
//   node pipeline/scripts/pixelfx/character/export-4dir.mjs
//
// Writes only under output/pixelfx-character/barebody/ (never assets/vfx-sheets):
//   barebody-walk-4dir.png / .json   one row per direction (down, up, right, left), 8 frames each,
//                                    76x76 cells, pivot [38,62], 8 fps, 8 columns
//   walk-down.gif, walk-up.gif, walk-left.gif   the row at 6x, 8 fps, looping
//   compare-4dir.png                 the 4 rows x frames 0,2,4,6 at 6x with labels
//   walk-natural.png                 T90 gate montage: 4 rows x 8 frames at 6x, labels
//                                    stock grey side walk | bare body right | down | up; the stock
//                                    row is the pixelfx checkout at PIXELFX_DIR (read-only)
// The T86 barebody-walk.png/.json are left untouched: this exporter is a separate file.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { actBounds } from './core/act.js';
import { posed, setMaterial } from './core/rig.js';
import { rasterText } from './core/font.js';
import { BARE_BODY } from './barebody.js';
import { DIRECTIONS, posesOf, right, meta } from './walk-4dir.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const OUT = path.join(ROOT, 'output/pixelfx-character/barebody');
const NAME = 'barebody-walk-4dir';
const PAD = 6;
const ZOOM = 6;

// the T86 cell, computed from the side walk only; the turned poses stay inside the same meta box
const b = actBounds({ act: { poses: right.map((p, i) => [i / 8, p]) }, meta });
const cellW = b.x1 - b.x0 + PAD * 2, cellH = b.y1 - b.y0 + PAD * 2, px = PAD - b.x0, py = PAD - b.y0;
if (cellW !== 76 || cellH !== 76 || px !== 38 || py !== 62) {
  console.error(`unexpected cell ${cellW}x${cellH} pivot [${px},${py}]; T86 is 76x76 [38,62]`);
  process.exit(2);
}
const fps = meta.fps;

// ── RGBA canvas / PNG (same shape as export-actor.mjs)
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

// ── one pose in the T86 cell
setMaterial(BARE_BODY);
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
const rows = DIRECTIONS.map((dir) => {
  const poses = posesOf(dir) ?? posesOf('right');
  const cells = poses.map(renderPose);
  return dir === 'left' ? cells.map(mirrorCell) : cells;
});

// ── T90 walk-natural.png: the stock grey side walk as the reference row (pixelfx, read-only)
const PF = process.env.PIXELFX_DIR || 'C:/Users/ray/pixelfx';
const stockPoses = (await import(pathToFileURL(path.join(PF, 'src/fx/moves/archer-walk.js')).href)).act.poses;
const stockRig = await import(pathToFileURL(path.join(PF, 'src/core/rig.js')).href);
const stockCells = stockPoses.map(([, p]) => {
  const q = { ...p };
  delete q.weapon; // the bare body carries no bow: the same pose T86's walk.js uses
  const r = stockRig.posed(q), cell = new Uint8ClampedArray(cellW * cellH * 4);
  for (let i = 0; i < r.n; i++) {
    const x = px + r.xs[i], y = py + r.ys[i];
    if (x < 0 || y < 0 || x >= cellW || y >= cellH) continue;
    const c = r.color[i], o = (y * cellW + x) * 4;
    cell[o] = c & 255; cell[o + 1] = (c >>> 8) & 255; cell[o + 2] = (c >>> 16) & 255; cell[o + 3] = (c >>> 24) & 255;
  }
  return cell;
});

// ── the sheet
const sheet = canvas(cellW * 8, cellH * 4, [0, 0, 0, 0]);
const frames = [];
rows.forEach((cells, d) => {
  cells.forEach((img, f) => {
    const x = f * cellW, y = d * cellH;
    sheet.paste(img, cellW, cellH, x, y, true);
    frames.push({
      filename: `${NAME} ${DIRECTIONS[d]} ${f}`, frame: { x, y, w: cellW, h: cellH }, rotated: false, trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: cellW, h: cellH }, sourceSize: { w: cellW, h: cellH },
      duration: Math.round(1000 / fps),
    });
  });
});
const json = {
  frames,
  meta: {
    app: 'https://github.com/patch-gg/pixelfx', version: '1', image: `${NAME}.png`, format: 'RGBA8888',
    size: { w: cellW * 8, h: cellH * 4 }, scale: '1',
    frameTags: DIRECTIONS.map((name, i) => ({ name, from: i * 8, to: i * 8 + 7, direction: 'forward' })),
    pixelfx: {
      id: `character/${NAME}`,
      name: 'Bare-body walk, four directions',
      fps, loop: true, frames: 8, rows: 4, columns: 8, directions: [...DIRECTIONS],
      frameSize: [cellW, cellH], pivot: [px, py],
      actor: { body: 'barebody', move: 'walk-4dir' },
    },
  },
};

// ── the looping GIFs (ffmpeg, raw rgba frames), 6x
function writeGif(cells, file) {
  const W = cellW * ZOOM, H = cellH * ZOOM, parts = [];
  for (const img of cells) parts.push(Buffer.from(upscale(img, cellW, cellH, ZOOM).buffer));
  const vf = 'split[a][b];[a]palettegen=max_colors=255:stats_mode=full[p];[b][p]paletteuse=dither=none';
  const args = ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', '-', '-vf', vf, '-loop', '0', file];
  const res = spawnSync('ffmpeg', args, { input: Buffer.concat(parts), maxBuffer: 1 << 30 });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`ffmpeg failed: ${res.stderr}`);
}

// ── the comparison montage: 4 rows (down, up, right, left) x frames 0, 2, 4, 6 at 6x
const panel = (img, label) => {
  const c = canvas(cellW * ZOOM, cellH * ZOOM + 26);
  c.text(label, 4, 4, 2);
  c.paste(upscale(img, cellW, cellH, ZOOM), cellW * ZOOM, cellH * ZOOM, 0, 20);
  return c;
};
const PICK = [0, 2, 4, 6];
const PW = cellW * ZOOM + 8, PH = cellH * ZOOM + 26 + 8;
const compare = canvas(4 * PW + 8, 34 + 4 * PH);
compare.text(`${NAME}  ${cellW}x${cellH}  pivot [${px},${py}]  ${fps} fps  ${ZOOM}x`, 8, 8, 2);
rows.forEach((cells, d) => {
  PICK.forEach((f, k) => {
    const p = panel(cells[f], `${DIRECTIONS[d]} ${f}  ${(f / fps).toFixed(3)}s`);
    compare.paste(p.data, p.w, p.h, 8 + k * PW, 30 + d * PH);
  });
});

// ── T90 gate montage: 4 rows x 8 frames at 6x, stock grey side walk | bare body right/down/up
const NATURAL = [
  ['stock grey side walk', stockCells],
  ['bare body right', rows[2]],
  ['bare body down', rows[0]],
  ['bare body up', rows[1]],
];
const natural = canvas(8 * PW + 8, 34 + 4 * PH);
natural.text(`walk-natural  ${cellW}x${cellH}  pivot [${px},${py}]  ${fps} fps  ${ZOOM}x`, 8, 8, 2);
NATURAL.forEach(([label, cells], d) => {
  cells.forEach((img, f) => {
    const p = panel(img, `${label} ${f}  ${(f / fps).toFixed(3)}s`);
    natural.paste(p.data, p.w, p.h, 8 + f * PW, 30 + d * PH);
  });
});

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, `${NAME}.png`), sheet.png());
fs.writeFileSync(path.join(OUT, `${NAME}.json`), JSON.stringify(json, null, 1));
fs.writeFileSync(path.join(OUT, 'compare-4dir.png'), compare.png());
fs.writeFileSync(path.join(OUT, 'walk-natural.png'), natural.png());
for (const dir of ['down', 'up', 'left']) writeGif(rows[DIRECTIONS.indexOf(dir)], path.join(OUT, `walk-${dir}.gif`));

console.log(`${NAME} -> ${path.relative(ROOT, OUT)}/${NAME}.{png,json}  ${cellW}x${cellH}, pivot [${px},${py}], 4x8 frames @ ${fps} fps; walk-down/up/left.gif, compare-4dir.png, walk-natural.png`);
