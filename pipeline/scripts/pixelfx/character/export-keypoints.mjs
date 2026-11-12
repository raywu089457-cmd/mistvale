#!/usr/bin/env node
// T93: export the rig's skeleton of every frame as PixelLab 18-joint keypoints.
//
//   node pipeline/scripts/pixelfx/character/export-keypoints.mjs
//
// Writes (and nothing else; it never touches the existing sheets):
//   pipeline/scripts/pixelfx/character/data/rig-keypoints.json
//       { canvas: 152, cell: 76, pivot: [38,62], scale: 2, directions: { down|up|right: { idle: [18], walk: [[18] x 8] } } }
//   output/pixelfx-character/rig-keypoints.png
//       montage at 4x of the 152 canvas: rows down / up / right, columns idle + walk 0..7, the rig's own render
//       doubled with the keypoints on top (RIGHT red, LEFT blue, centre white) and the bones as 1 px lines
// The mapping lives in rig-keypoints-lib.mjs (shared with tools/checks/pixelfx-rig-keypoints.mjs).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { rasterText } from './core/font.js';
import { DIRS, BONES, CANVAS, buildKeypoints, posesOfDir, renderCanvas, rightSideOf, RIGHT_VIEW_NEAR } from './rig-keypoints-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const JSON_OUT = path.join(HERE, 'data/rig-keypoints.json');
const PNG_OUT = path.join(ROOT, 'output/pixelfx-character/rig-keypoints.png');
const ZOOM = 4, CELLPX = CANVAS * ZOOM, GAP = 8, HEAD = 34;

const data = buildKeypoints();
fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
fs.writeFileSync(JSON_OUT, JSON.stringify(data, null, 1) + '\n');

// ── PNG (same encoder as export-4dir.mjs)
const crcT = (() => {
  const t = new Int32Array(256);
  for (let k = 0; k < 256; k++) { let c = k; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[k] = c; }
  return t;
})();
const crc32 = (buf) => { let c = -1; for (const v of buf) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, d) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(d.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), d])), 0);
  return Buffer.concat([head, d, crc]);
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
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ── montage canvas
const W = GAP + 9 * (CELLPX + GAP), H = HEAD + 3 * (CELLPX + GAP + 14);
const img = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < W * H; i++) img.set([12, 11, 16, 255], i * 4);
const set = (x, y, rgb) => { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < W && y < H) img.set([...rgb, 255], (y * W + x) * 4); };
const text = (str, x, y, k, rgb) => rasterText(str, 'mini', (gx, gy) => { for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) set(x + gx * k + a, y + gy * k + b, rgb); });
const line = (x0, y0, x1, y1, rgb) => {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    set(x0, y0, rgb);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
};
const RED = [255, 64, 64], BLUE = [64, 140, 255], WHITE = [255, 255, 255];
const colourOf = (label) => (label.startsWith('RIGHT') ? RED : label.startsWith('LEFT') ? BLUE : WHITE);

function drawFrame(ox, oy, pose, joints) {
  const rgba = renderCanvas(pose);
  for (let y = 0; y < CELLPX; y++) for (let x = 0; x < CELLPX; x++) {
    const s = (((y / ZOOM) | 0) * CANVAS + ((x / ZOOM) | 0)) * 4;
    if (rgba[s + 3]) set(ox + x, oy + y, [rgba[s], rgba[s + 1], rgba[s + 2]]);
    else set(ox + x, oy + y, ((x >> 5) + (y >> 5)) & 1 ? [22, 21, 30] : [18, 17, 25]);
  }
  const byLabel = Object.fromEntries(joints.map((j) => [j.label, [ox + j.x * CANVAS * ZOOM, oy + j.y * CANVAS * ZOOM]]));
  for (const [a, b] of BONES) {
    const ca = colourOf(a), cb = colourOf(b);
    line(...byLabel[a], ...byLabel[b], ca === cb ? ca : ca === WHITE ? cb : cb === WHITE ? ca : WHITE);
  }
  for (const j of joints) {
    const [cx, cy] = byLabel[j.label], c = colourOf(j.label);
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) set(cx + a, cy + b, Math.max(Math.abs(a), Math.abs(b)) === 2 ? [0, 0, 0] : c);
  }
}

text(`rig-keypoints  ${CANVAS}px canvas at ${ZOOM}x  RIGHT red  LEFT blue  centre white  side view near = ${RIGHT_VIEW_NEAR}`, GAP, 10, 2, [200, 196, 214]);
DIRS.forEach((dir, d) => {
  const { idle, walk } = posesOfDir(dir), k = data.directions[dir];
  const oy = HEAD + d * (CELLPX + GAP + 14);
  [['idle', idle, k.idle], ...walk.map((p, i) => [`walk ${i}`, p, k.walk[i]])].forEach(([name, pose, joints], c) => {
    const ox = GAP + c * (CELLPX + GAP);
    text(`${dir} ${name}${c === 0 ? `  RIGHT limb = rig ${rightSideOf(dir)}` : ''}`, ox, oy, 2, [200, 196, 214]);
    drawFrame(ox, oy + 14, pose, joints);
  });
});
fs.mkdirSync(path.dirname(PNG_OUT), { recursive: true });
fs.writeFileSync(PNG_OUT, encodePNG(W, H, img));

const n = DIRS.reduce((s, dir) => s + 1 + data.directions[dir].walk.length, 0);
console.log(`rig-keypoints -> ${path.relative(ROOT, JSON_OUT)} (${n} skeletons x 18 joints), ${path.relative(ROOT, PNG_OUT)} ${W}x${H}; RIGHT limb = ${DIRS.map((d) => `${d}:${rightSideOf(d)}`).join(' ')}`);
