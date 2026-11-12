#!/usr/bin/env node
// T92: the bare body's colour from the l0veyou v1 turnaround, as measured bands + row lighting.
//
//   node pipeline/scripts/pixelfx/character/l0v-texture.mjs
//
// The shape and the motion stay the rig's (T86-T91). This script measures the reference and writes
// colour data only:
//   l0v-cloth.json      per direction: where the chest wrap starts/ends on the chest (px below the
//                       chest joint), where the shorts start on the waist, the thigh hem, the
//                       measured side protrusion, and the fitted values actually drawn. Measured on
//                       the full-resolution reference as fractions of the torso / thigh, then
//                       mapped onto this rig's idle joints; a fit (wrap lift, hem shortening,
//                       dropped side flap) is recorded instead of overwriting the measurement.
//   l0v-target-4dir.png 4 downscaled reference cells (one per direction), for the class check and
//                       the montage; the left cell comes from the reference's own left figure.
// and then re-exports the idle + walk sheets and builds tex-compare.png.
//
// The reference is output/l0veyou/barebody/barebody-4dir-v1.png: four figures (front, back, right
// side, left side) on flat grey, JPEG data under a .png name, so it is decoded with ffmpeg. The
// measured rows come from the full-resolution figures; the classes are the bare-body palette's
// skin / cloth / ink, the same classes the material shades.
//
// The left row of every sheet is the right row mirrored in the cell (T89/T90). The left target is
// built from the reference's own left figure (FIGS[3]), mapped straight onto the cell, so the left
// class test is not the right target mirrored.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { posed, setMaterial, skeleton, BONE_LEN } from './core/rig.js';
import { BARE_BODY_PLAIN, isClothPixel } from './barebody.js';
import { DIRECTIONS, posesOf } from './idle-4dir.js';
import { posesOf as walkPoses } from './walk-4dir.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const OUT = path.join(ROOT, 'output/pixelfx-character/barebody');
const REF = path.join(ROOT, 'output/l0veyou/barebody/barebody-4dir-v1.png');
const TARGET = path.join(OUT, 'l0v-target-4dir.png');
const CLOTH_FILE = path.join(OUT, 'l0v-cloth.json');
const OLD_LOOKUP = path.join(OUT, 'l0v-tex.json');
const CW = 76, CH = 76, PX = 38, PY = 62;

const PALETTE = ['#1d1410', '#f6c894', '#e4b78d', '#c88f5f', '#9a6440', '#5b4b3e', '#463a30'];
const RGB = PALETTE.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
const CLOTH = new Set([5, 6]);
const INK_U = ((255 << 24) | (RGB[0][2] << 16) | (RGB[0][1] << 8) | RGB[0][0]) >>> 0;
const DIRS = ['down', 'up', 'right'];

// ── the reference (8-bit RGBA, decoded by ffmpeg: the file is JPEG data)
function decodeReference() {
  const res = spawnSync('ffmpeg', ['-v', 'error', '-i', REF, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 30 });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`ffmpeg cannot decode ${path.relative(ROOT, REF)}: ${res.stderr}`);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', REF]);
  const [w, h] = String(probe.stdout).trim().split(',').map(Number);
  if (!w || !h || res.stdout.length !== w * h * 4) throw new Error(`unexpected reference size ${w}x${h}`);
  return { w, h, buf: res.stdout };
}
const ref = decodeReference();
const refAt = (x, y) => { const i = (y * ref.w + x) * 4; return [ref.buf[i], ref.buf[i + 1], ref.buf[i + 2]]; };
const BG = refAt(2, 2);
const bgDiff = (c) => Math.abs(c[0] - BG[0]) + Math.abs(c[1] - BG[1]) + Math.abs(c[2] - BG[2]);
const BG_TOL = 40;
const qTo = (c) => {
  let best = 0, bd = 1e9;
  for (let i = 0; i < PALETTE.length; i++) {
    const d = (c[0] - RGB[i][0]) ** 2 + (c[1] - RGB[i][1]) ** 2 + (c[2] - RGB[i][2]) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
};

/** The four figures, each cut by its own non-background bbox. Left to right: front, back, right, left. */
function figures() {
  const colHas = new Array(ref.w).fill(false);
  for (let y = 0; y < ref.h; y++) for (let x = 0; x < ref.w; x++) if (bgDiff(refAt(x, y)) > BG_TOL) colHas[x] = true;
  const runs = [];
  let start = -1;
  for (let x = 0; x <= ref.w; x++) {
    if (x < ref.w && colHas[x] && start < 0) start = x;
    if (start >= 0 && (x === ref.w || !colHas[x])) { runs.push([start, x - 1]); start = -1; }
  }
  return runs.filter(([a, b]) => b - a > 20).map(([x0, x1]) => {
    let y0 = 1e9, y1 = -1;
    for (let y = 0; y < ref.h; y++) for (let x = x0; x <= x1; x++) if (bgDiff(refAt(x, y)) > BG_TOL) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return { x0, x1, y0, y1 };
  });
}
const FIGS = figures();
if (FIGS.length !== 4) throw new Error(`expected the 4 reference figures, found ${FIGS.length}`);

/** At the reference's own resolution: the wrap and shorts row bands, the shoulder row, and (side
 *  view) how far the shorts reach behind the leg. */
function measureFigure(f) {
  const rows = [];
  for (let y = f.y0; y <= f.y1; y++) {
    let cloth = 0, n = 0, x0 = 1e9, x1 = -1;
    for (let x = f.x0; x <= f.x1; x++) {
      const c = refAt(x, y);
      if (bgDiff(c) <= BG_TOL) continue;
      n++; if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (CLOTH.has(qTo(c))) cloth++;
    }
    rows.push({ y, cloth, n, w: x1 >= 0 ? x1 - x0 + 1 : 0 });
  }
  const maxCloth = Math.max(...rows.map((r) => r.cloth)), maxW = Math.max(...rows.map((r) => r.w));
  const runs = [];
  let s = -1;
  for (const r of rows) {
    const on = r.cloth >= Math.max(6, maxCloth * 0.25) && r.w >= maxW * 0.35;
    if (on && s < 0) s = r.y;
    if (s >= 0 && !on) { if (r.y - s >= 15) runs.push([s, r.y - 1]); s = -1; }
  }
  if (s >= 0 && f.y1 - s >= 15) runs.push([s, f.y1]);
  if (runs.length < 2) throw new Error(`figure at x ${f.x0} has no wrap+shorts bands`);
  const wrap = runs[0], shorts = runs[1];
  const headW = Math.max(...rows.filter((r) => r.y < f.y0 + (f.y1 - f.y0) * 0.12).map((r) => r.w));
  const shoulder = rows.find((r) => r.w >= Math.min(headW * 1.5, maxW * 0.9))?.y ?? f.y0;
  // backward protrusion: the shorts' rear edge vs the upper leg's rear edge
  const rear = (y0, y1, clothOnly) => {
    let x0 = 1e9;
    for (let y = y0; y <= y1; y++) for (let x = f.x0; x <= f.x1; x++) {
      const c = refAt(x, y);
      if (bgDiff(c) <= BG_TOL) continue;
      if (clothOnly && !CLOTH.has(qTo(c))) continue;
      if (x < x0) x0 = x;
    }
    return x0;
  };
  return { wrap, shorts, shoulder, legRear: rear(shorts[1] + 4, Math.round((shorts[1] + f.y1) / 2), false), shortsRear: rear(shorts[0], shorts[1], true) };
}
const MEAS = FIGS.slice(0, 3).map(measureFigure);
const RECORD = { ...BARE_BODY_PLAIN, id: 't92-record', layers: [], overlay: null, fallback: 0 };

// ── every walk frame's descriptors too: the measured wrap band must stay one region on all of
// them (the back view's lower chest rows belong to the waist, which would split the band)
const walkDesc = {}, walkInk = {};
for (const dir of DIRS) {
  walkDesc[dir] = [];
  walkInk[dir] = [];
  for (const pose of walkPoses(dir)) {
    const rec = [];
    RECORD.layers = [(px) => { rec.push(px); return 0; }];
    setMaterial(RECORD);
    posed(pose);
    walkDesc[dir].push(rec);
    // the rig's ink marks (limb edges, seams) are skipped by the shade; the region prediction
    // has to skip them too
    setMaterial(BARE_BODY_PLAIN);
    const pr = posed(pose);
    const ink = new Set();
    for (let i = 0; i < pr.n; i++) if ((pr.color[i] >>> 0) === INK_U) ink.add(`${PX + pr.xs[i]},${PY + pr.ys[i]}`);
    walkInk[dir].push(ink);
  }
}

// ── the idle render: bbox, joints, and every body pixel's descriptor
const idle = {};
for (const dir of DIRS) {
  const pose = posesOf(dir)[0];
  const rec = [];
  RECORD.layers = [(px) => { rec.push(px); return 0; }];
  setMaterial(RECORD);
  const r = posed(pose);
  const skel = skeleton(pose);
  let bx0 = 1e9, bx1 = -1, by0 = 1e9, by1 = -1;
  for (let i = 0; i < r.n; i++) {
    const x = PX + r.xs[i], y = PY + r.ys[i];
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
  }
  const desc = new Map();
  for (const px of rec) desc.set(`${PX + px.sx},${PY - px.sy}`, px);
  idle[dir] = { desc, bx0, bx1, by0, by1, chestCell: PY + skel.joints.chest[1], hipCell: PY + skel.joints.hipN[1] };
  console.log(`${dir}: bbox ${bx0}-${bx1} x ${by0}-${by1}, ${desc.size} body px, chest ${idle[dir].chestCell.toFixed(2)}, hip ${idle[dir].hipCell.toFixed(2)}`);
}

// ── the target: the reference figure box-sampled to the idle bbox, majority per palette class.
// down/up/right use figures 0/1/2; left uses figure 3 (the reference's left side) on the same
// right-view bbox, left-to-right, which is exactly the orientation of the mirrored left sheet row.
const targetCells = new Map();
DIRECTIONS.forEach((dir, d) => {
  const f = FIGS[d], s = dir === 'left' ? idle.right : idle[dir];
  const w = s.bx1 - s.bx0 + 1, h = s.by1 - s.by0 + 1, sw = f.x1 - f.x0 + 1, sh = f.y1 - f.y0 + 1;
  const t = new Map();
  for (const k of s.desc.keys()) {
    const [cx, cy] = k.split(',').map(Number);
    const sx0 = f.x0 + Math.floor(((cx - s.bx0) * sw) / w), sx1 = f.x0 + Math.floor(((cx - s.bx0 + 1) * sw) / w) - 1;
    const sy0 = f.y0 + Math.floor(((cy - s.by0) * sh) / h), sy1 = f.y0 + Math.floor(((cy - s.by0 + 1) * sh) / h) - 1;
    const votes = new Array(PALETTE.length).fill(0);
    for (let sy = sy0; sy <= sy1; sy++) for (let sx = sx0; sx <= sx1; sx++) {
      const c = refAt(sx, sy);
      if (bgDiff(c) > BG_TOL) votes[qTo(c)]++;
    }
    let bi = -1, bd = -1;
    for (let i = 0; i < votes.length; i++) if (votes[i] > bd) { bd = votes[i]; bi = i; }
    if (bi >= 0) t.set(k, bi);
  }
  targetCells.set(dir, t);
  console.log(`${dir}: target ${t.size} cells`);
});
const CLOTH_IDS = new Set([5, 6]);
const GARMENT_BONES = new Set(['pelvis', 'waist', 'chest', 'thighN', 'thighF']);
/** Strict material-class agreement of a candidate garment rule with the downscaled target on the
 *  idle (the left target is not used: left has no params of its own). Target ink cells and target
 *  cloth on a bone the T90 rule forbids are not comparable. */
function idleClassScore(dir, p) {
  const target = targetCells.get(dir);
  let n = 0, ok = 0;
  for (const [k, px] of idle[dir].desc) {
    const t = target.get(k);
    if (t === undefined || t === 0) continue;
    const tc = CLOTH_IDS.has(t) ? 'cloth' : 'skin';
    if (tc === 'cloth' && !GARMENT_BONES.has(px.bone)) continue;
    n++;
    if ((isClothPixel(px, p) ? 'cloth' : 'skin') === tc) ok++;
  }
  return n ? ok / n : 0;
}

// ── measured params, mapped onto our idle joints
const round2 = (v) => Math.round(v * 100) / 100;
const round3 = (v) => Math.round(v * 1000) / 1000;
/** 8-connected component sizes of a set of "sx,sy" keys, largest first. */
function sizesOf(set) {
  const seen = new Set(), sizes = [];
  for (const k of set) {
    if (seen.has(k)) continue;
    let n = 0;
    const q = [k]; seen.add(k);
    while (q.length) {
      n++;
      const [x, y] = q.pop().split(',').map(Number);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const kk = `${x + dx},${y + dy}`;
        if (set.has(kk) && !seen.has(kk)) { seen.add(kk); q.push(kk); }
      }
    }
    sizes.push(n);
  }
  return sizes.sort((a, b) => b - a);
}
/** The shorts a candidate (shortsTop, hem, back) would draw on a frame, in cell coordinates. */
function shortsSizes(pxs, p, ink) {
  const set = new Set();
  for (const q of pxs) {
    if (!(q.bone === 'pelvis' || q.bone === 'waist' || q.bone === 'thighN' || q.bone === 'thighF')) continue;
    const k = `${PX + q.sx},${PY - q.sy}`;
    if (ink.has(k)) continue;
    if (isClothPixel(q, { ...p, wrap: p.wrap })) set.add(k);
  }
  return sizesOf(set);
}
/** The natural checker's shorts region rule on every walk frame. */
function walkShortsOk(dir, p) {
  for (let f = 0; f < walkDesc[dir].length; f++) {
    const z = shortsSizes(walkDesc[dir][f], p, walkInk[dir][f]);
    // 2 px of margin: the actual sheet also skips shade-time ink and the ink edge of the near
    // limb can differ by a pixel from this plain-material prediction
    if (dir === 'right') { if (z.length > 3 || z.slice(1).some((v) => v > 2)) return false; }
    else if (z.length !== 1) return false;
  }
  return true;
}
/** 8-connected component sizes of the chest cloth a candidate wrap band would draw on a frame. */
function wrapSizes(pxs, band, ink) {
  const set = new Set();
  for (const p of pxs) {
    if (p.bone !== 'chest' || p.cy - p.sy < band[0] || p.cy - p.sy > band[1]) continue;
    const k = `${PX + p.sx},${PY - p.sy}`;
    if (!ink.has(k)) set.add(k);
  }
  return sizesOf(set);
}
/** The measured band can fall a row below where the chest bone is continuous (the back view's
 *  middle rows belong to the waist), which would split the wrap. Lift it until every walk frame
 *  passes the natural checker's region rule: one region down/up, <= 3 with extras <= 4 px at the
 *  side. */
/** The brief's no-pinched-skin-strip rule around the chest band on the idle. */
function wrapStripOk(pxs, p) {
  const cloth = new Set(), skin = new Set();
  for (const q of pxs) {
    const k = `${q.sx},${q.sy}`;
    if (isClothPixel(q, p)) cloth.add(k);
    else if (q.cy - q.sy >= p.wrap[0] - 1 && q.cy - q.sy <= p.wrap[1] + 1) skin.add(k);
  }
  for (const k of skin) {
    if (cloth.has(k)) continue;
    const [x, y] = k.split(',').map(Number);
    if ((cloth.has(`${x - 1},${y}`) && cloth.has(`${x + 1},${y}`)) ||
      (cloth.has(`${x},${y - 1}`) && cloth.has(`${x},${y + 1}`))) return false;
  }
  return true;
}
/** The measured band can fall a row below where the chest bone is continuous (the back view's
 *  middle rows belong to the waist), which would split the wrap. Lift it until every walk frame
 *  passes the natural checker's region rule: one region down/up, <= 3 with extras <= 4 px at the
 *  side, and the idle has no 1 px skin strip pinched by cloth across the band. */
function wrapOk(dir, band, p) {
  for (let f = 0; f < walkDesc[dir].length; f++) {
    const z = wrapSizes(walkDesc[dir][f], band, walkInk[dir][f]);
    if (dir === 'right') { if (z.length > 3 || z.slice(1).some((v) => v > 4)) return false; }
    else if (z.length !== 1) return false;
  }
  return !p || wrapStripOk(idle[dir].desc.values(), { ...p, wrap: band });
}
const dirs = {};
DIRS.forEach((dir, d) => {
  const f = FIGS[d], m = MEAS[d], s = idle[dir];
  const h = s.by1 - s.by0 + 1, sh = f.y1 - f.y0 + 1;
  const toCell = (row) => s.by0 + (row - f.y0) * h / sh;
  const wrapTop = toCell(m.wrap[0]), wrapBottom = toCell(m.wrap[1]);
  const shortsTop = toCell(m.shorts[0]), hemCell = toCell(m.shorts[1]);
  const torsoLen = m.shorts[1] - m.shoulder;
  const backPx = dir === 'right' ? Math.max(0, (m.legRear - m.shortsRear) * h / sh) : 0;
  // the measured band in this rig's chest-joint offsets; lift it if the chest is not continuous
  const band = [wrapTop - s.chestCell, wrapBottom - s.chestCell];
  const measuredTop = round2(shortsTop - s.chestCell), measuredHem = round2(hemCell - s.hipCell);
  // The measured side protrusion cannot be drawn: the far thigh is separated from the near shorts
  // by the near leg and its ink edge, so painting it only produced detached cloth shards. The
  // measurement is kept in the json (backMeasured) and the side shorts use the near bones only.
  const probe = { wrap: band, shortsTop: measuredTop, hem: measuredHem, back: 0 };
  let wrap = band, shift = 0;
  for (; shift <= 3.01; shift += 0.5) {
    const cand = [band[0] - shift, band[1] - shift];
    if (wrapOk(dir, cand, { ...probe, wrap: cand })) { wrap = cand; break; }
  }
  probe.wrap = [round2(wrap[0]), round2(wrap[1])];
  // Pick the hem that best matches the downscaled reference's garment class on this direction's
  // idle, among the hems that still keep the shorts one region on every walk frame. The fit is
  // recorded in the json instead of writing the fitted number as if it were the measurement.
  let hemFit = 0, bestScore = -1;
  for (let dh = 0; dh <= 2.01; dh += 0.25) {
    const cand = { ...probe, hem: round2(measuredHem - dh) };
    if (!walkShortsOk(dir, cand)) continue;
    const score = idleClassScore(dir, cand);
    if (score > bestScore + 1e-9) { bestScore = score; probe.hem = cand.hem; hemFit = dh; }
  }
  if (probe.hem === measuredHem && !walkShortsOk(dir, probe)) {
    for (let dh = 0.25; dh <= 2.01; dh += 0.25) {
      const cand = { ...probe, hem: round2(measuredHem - dh) };
      if (walkShortsOk(dir, cand)) { probe.hem = cand.hem; hemFit = dh; break; }
    }
  }
  dirs[dir] = {
    wrap: probe.wrap,
    wrapMeasured: [round2(band[0]), round2(band[1])],
    shortsTop: probe.shortsTop,
    shortsTopMeasured: measuredTop,
    hem: probe.hem,
    hemMeasured: measuredHem,
    back: 0,
    backMeasured: round2(backPx),
    fit: { wrapShift: shift, hemShortened: hemFit, backDropped: dir === 'right' ? round2(backPx) : 0 },
    ratios: {
      wrapTopTorso: round3((m.wrap[0] - m.shoulder) / torsoLen),
      wrapBottomTorso: round3((m.wrap[1] - m.shoulder) / torsoLen),
      shortsTopTorso: round3((m.shorts[0] - m.shoulder) / torsoLen),
      hemThigh: round3(measuredHem / BONE_LEN.thigh),
      backPx: round2(backPx),
    },
  };
  console.log(`${dir}: wrap ${dirs[dir].wrap.join('..')} (below chest, measured ${band.map(round2).join('..')}, lifted ${shift}), shortsTop ${dirs[dir].shortsTop} (measured ${measuredTop}), hem ${dirs[dir].hem} (measured ${measuredHem}, shortened ${hemFit}), back 0 (measured ${round2(backPx)}, dropped) | ratios ${JSON.stringify(dirs[dir].ratios)}`);
});

// ── PNG helpers (same shape as the exporters)
const crcT = (() => { const t = new Int32Array(256); for (let k = 0; k < 256; k++) { let c = k; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[k] = c; } return t; })();
const crc32 = (buf) => { let c = -1; for (const v of buf) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0); head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function readPNG(file) {
  const b = fs.readFileSync(file);
  let p = 8, w = 0, h = 0, depth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (p + 8 <= b.length) {
    const len = b.readUInt32BE(p), type = b.toString('ascii', p + 4, p + 8), data = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; colorType = data[9]; interlace = data[12]; }
    else if (type === 'IDAT') idat.push(data);
    p += 12 + len;
    if (type === 'IEND') break;
  }
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!w || !h || depth !== 8 || interlace || !ch) throw new Error(`cannot read ${file}`);
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
      else if (filter === 4) { const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c); v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c)) & 255; }
      cur[x] = v;
    }
    cur.copy(pixels, y * stride); prev = cur;
  }
  return { w, h, ch, pixels };
}

// ── write the target sheet and the measured params; the old per-pixel lookup is gone
const targetRGBA = new Uint8ClampedArray(CW * CH * 4 * 4);
DIRECTIONS.forEach((dir, d) => {
  for (const [k, t] of targetCells.get(dir)) {
    const [x, y] = k.split(',').map(Number);
    targetRGBA.set([...RGB[t], 255], ((d * CH + y) * CW + x) * 4);
  }
});
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(TARGET, encodePNG(CW, CH * 4, targetRGBA));
if (fs.existsSync(OLD_LOOKUP)) fs.rmSync(OLD_LOOKUP);
fs.writeFileSync(CLOTH_FILE, JSON.stringify({
  version: 1,
  source: 'output/l0veyou/barebody/barebody-4dir-v1.png',
  cell: [CW, CH], pivot: [PX, PY],
  units: 'wrap + shortsTop are screen px below the chest joint; hem is px down the thigh from the hip; backMeasured is the side view rear protrusion, kept as a measurement only',
  note: 'left is the right row mirrored and has no params of its own; its target comes from the reference left figure; fit records wrapShift / hemShortened / backDropped',
  dirs,
}, null, 1));
console.log(`wrote ${path.relative(ROOT, TARGET)} and ${path.relative(ROOT, CLOTH_FILE)}; removed the old l0v-tex.json`);

// ── re-export the two sheets (their scripts re-read l0v-cloth.json through barebody.js)
for (const script of ['export-4dir.mjs', 'export-idle-4dir.mjs']) {
  const res = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), script)], { cwd: ROOT, stdio: 'inherit' });
  if (res.status !== 0) throw new Error(`${script} failed (${res.status})`);
}

// ── the montage: row 1 targets | shaded idles; rows 2-3 down/up walk; row 4 the right walk
const Z = 6, GAP = 6, PAD = 8, TITLE = 22;
const idlePng = readPNG(path.join(OUT, 'barebody-idle-4dir.png'));
const walkPng = readPNG(path.join(OUT, 'barebody-walk-4dir.png'));
const targetPng = readPNG(TARGET);
const P = CW * Z;
const cellOf = (png, x, y) => ({
  x, y,
  at: (cx, cy) => { const i = ((y + cy) * png.w + x + cx) * png.ch; return [png.pixels[i], png.pixels[i + 1], png.pixels[i + 2], png.pixels[i + 3]]; },
});
const FONT = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'], B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'], D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'], F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'], H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'], J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'], L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'], N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'], P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'], R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'], T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'], V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'], X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'], Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], 1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00110', '01000', '10000', '11111'], 3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], 5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'], 7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], 9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'], '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '|': ['00100', '00100', '00100', '00100', '00100', '00100', '00100'], '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
};
function drawText(data, w, h, str, x0, y0, k = 1) {
  let x = x0;
  for (const ch0 of str.toUpperCase()) {
    const g = FONT[ch0] ?? FONT[' '];
    for (let gy = 0; gy < 7; gy++) for (let gx = 0; gx < 5; gx++) {
      if (g[gy][gx] !== '1') continue;
      for (let yy = 0; yy < k; yy++) for (let xx = 0; xx < k; xx++) {
        const tx = x + gx * k + xx, ty = y0 + gy * k + yy;
        if (tx >= w || ty >= h) continue;
        data.set([200, 196, 214, 255], (ty * w + tx) * 4);
      }
    }
    x += 6 * k;
  }
}
const panel = (src, label) => {
  const c = { w: P, h: P + 18, data: new Uint8ClampedArray(P * (P + 18) * 4) };
  for (let i = 0; i < P * (P + 18); i++) c.data.set([12, 11, 16, 255], i * 4);
  for (let yy = 0; yy < P; yy++) for (let xx = 0; xx < P; xx++) {
    const [r0, g0, b0, a0] = src.at((xx / Z) | 0, (yy / Z) | 0);
    if (!a0) continue;
    c.data.set([r0, g0, b0, 255], ((18 + yy) * P + xx) * 4);
  }
  drawText(c.data, c.w, c.h, label, 4, 4);
  return c;
};
const cols = 8, panelW = P + GAP, rowH = P + 18 + GAP;
const W2 = PAD * 2 + cols * panelW, H2 = TITLE + rowH * 4 + PAD;
const montage = new Uint8ClampedArray(W2 * H2 * 4);
for (let i = 0; i < W2 * H2; i++) montage.set([12, 11, 16, 255], i * 4);
drawText(montage, W2, H2, `BARE BODY L0V TEXTURE ${Z}X  TARGETS | IDLE / WALK`, PAD, 6, 2);
const paste = (p, col, row) => {
  const x0 = PAD + col * panelW, y0 = TITLE + row * rowH;
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const s = (y * p.w + x) * 4, d = ((y0 + y) * W2 + x0 + x) * 4;
    montage.set([p.data[s], p.data[s + 1], p.data[s + 2], 255], d);
  }
};
DIRECTIONS.forEach((dir, d) => {
  paste(panel(cellOf(targetPng, 0, d * CH), `TARGET ${dir}`), d, 0);
  paste(panel(cellOf(idlePng, 0, d * CH), `IDLE ${dir}`), 4 + d, 0);
});
['down', 'up', 'right'].forEach((dir, row) => {
  const d = ['down', 'up', 'right', 'left'].indexOf(dir);
  for (let f = 0; f < 8; f++) paste(panel(cellOf(walkPng, f * CW, d * CH), `${dir} ${f}`), f, 1 + row);
});
fs.writeFileSync(path.join(OUT, 'tex-compare.png'), encodePNG(W2, H2, montage));
console.log(`wrote ${path.relative(ROOT, path.join(OUT, 'tex-compare.png'))} ${W2}x${H2}`);
