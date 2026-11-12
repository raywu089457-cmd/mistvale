#!/usr/bin/env node
// T92 acceptance: the bare body's colour comes from the l0veyou v1 turnaround as measured bands
// plus one lighting rule, not as a per-pixel copy.
//
//   node tools/checks/pixelfx-barebody-tex.mjs
//
// Reads:
//   output/pixelfx-character/barebody/l0v-cloth.json      the measured bands
//   output/pixelfx-character/barebody/l0v-target-4dir.png 4 downscaled reference cells
// and checks the two re-exported sheets, on the fork's own render (the sheets must equal it):
//   1. idle, all four directions: the material CLASS (skin / cloth; the rig's ink is the outline)
//      agrees with the downscaled target in >= 85% of the comparable body pixels, strict (no
//      neighbour tolerance), and >= 90% over the four directions together. The left target is
//      built from the reference's own left figure, not the right target mirrored. Target cloth on
//      a non-garment bone is not comparable: the T90 material may only put cloth on
//      pelvis/waist/thigh/chest (natural.mjs enforces that), so those cells are counted apart.
//   2. each idle frame, each bone and screen row: the lit tone #f6c894 appears only at the
//      leftmost pixel and the shade #c88f5f only at the rightmost (violations = 0). The 1 px rim
//      row at the top of the head and of the chest is the one exception the brief asks for.
//   3. the chest wrap and the shorts are each one 8-connected region on the turned views (the
//      side view's near arm splits both in the T90 rig), and no 1 px skin strip is pinched between
//      cloth (horizontally, or a 1 px skin row between cloth above and below).
//   4. all 32 walk frames: no isolated single pixel whose colour none of its four neighbours has
//      (the eyes and the rig's ink are excluded).
//   5. layout: the old per-pixel l0v-tex.json is gone, the params json covers down/up/right,
//      the target is 4x76x76 cells of bare-body palette colours.
//
// Exit 0 = all hold; 1 = a check failed (FAIL lines first, then a count).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'output/pixelfx-character/barebody');
const TARGET = path.join(OUT, 'l0v-target-4dir.png');
const PARAMS = path.join(OUT, 'l0v-cloth.json');
const OLD_LOOKUP = path.join(OUT, 'l0v-tex.json');
const IDLE = path.join(OUT, 'barebody-idle-4dir.png');
const WALK = path.join(OUT, 'barebody-walk-4dir.png');
const DIRS = ['down', 'up', 'right', 'left'];
const CW = 76, CH = 76, PX = 38, PY = 62;
const MATCH_MIN = 85;   // per direction, strict
const ALL_MIN = 90;     // four directions together, strict
const PALETTE = ['#1d1410', '#f6c894', '#e4b78d', '#c88f5f', '#9a6440', '#5b4b3e', '#463a30'];
const INK = '#1d1410', BRIGHT = '#f6c894', SHADE = '#c88f5f';
const CLOTH = new Set(['#5b4b3e', '#463a30']);
const GARMENT = new Set(['pelvis', 'waist', 'thighN', 'thighF', 'chest']);
const SHORTS_BONES = new Set(['pelvis', 'waist', 'thighN', 'thighF']);
const fail = [];
const bad = (msg) => { if (fail.length < 40) fail.push(msg); };

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
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
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
const cls = (h) => (h === INK ? 'outline' : CLOTH.has(h) ? 'cloth' : 'skin');

const target = readPNG(TARGET);
let params = null;
try { params = JSON.parse(fs.readFileSync(PARAMS, 'utf8')); } catch { params = null; }
if (!target || !params) {
  console.log('FAIL missing l0v-target-4dir.png or l0v-cloth.json (run pipeline/scripts/pixelfx/character/l0v-texture.mjs)');
  console.log('FAIL 1 check(s)');
  process.exit(1);
}
if (fs.existsSync(OLD_LOOKUP)) bad('the old per-pixel l0v-tex.json is still there');
if (target.w !== CW || target.h !== CH * 4) bad(`target is ${target.w}x${target.h}, expected ${CW}x${CH * 4}`);
for (let d = 0; d < 4; d++) {
  let n = 0;
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const i = ((d * CH + y) * target.w + x) * target.ch;
    if (target.pixels[i + 3] === 0) continue;
    n++;
    const h = hexOf(target.pixels[i], target.pixels[i + 1], target.pixels[i + 2]);
    if (!PALETTE.includes(h)) bad(`target ${DIRS[d]} ${x},${y} is ${h}, not a palette colour`);
  }
  if (!n) bad(`target ${DIRS[d]} is empty`);
}
const keys = Object.keys(params.dirs ?? {});
if (params.version !== 1 || JSON.stringify(keys) !== JSON.stringify(['down', 'up', 'right'])) bad(`l0v-cloth.json dirs ${JSON.stringify(keys)} != down/up/right`);
console.log(`params: ${keys.join('/')} | target: 4x${CW}x${CH}, directions ${DIRS.join('/')} (left target from the reference's left figure)`);

let rig, idle, move, body;
try {
  rig = await import(pathToFileURL(path.join(ROOT, 'pipeline/scripts/pixelfx/character/core/rig.js')).href);
  idle = await import(pathToFileURL(path.join(ROOT, 'pipeline/scripts/pixelfx/character/idle-4dir.js')).href);
  move = await import(pathToFileURL(path.join(ROOT, 'pipeline/scripts/pixelfx/character/walk-4dir.js')).href);
  body = await import(pathToFileURL(path.join(ROOT, 'pipeline/scripts/pixelfx/character/barebody.js')).href);
  rig.setMaterial(body.BARE_BODY);
} catch (e) {
  console.log(`FAIL cannot import the fork or barebody.js: ${e.message}`);
  console.log('FAIL 1 check(s)');
  process.exit(1);
}
const targetAt = (d, x, y) => {
  if (x < 0 || y < 0 || x >= CW || y >= CH) return null;
  const i = ((d * CH + y) * target.w + x) * target.ch;
  return target.pixels[i + 3] > 0 ? hexOf(target.pixels[i], target.pixels[i + 1], target.pixels[i + 2]) : null;
};
const cellOf = (d, pose, mirror) => {
  const r = rig.posed(pose), out = new Map();
  for (let i = 0; i < r.n; i++) {
    const x = PX + r.xs[i], y = PY + r.ys[i];
    out.set(`${mirror ? CW - 1 - x : x},${y}`, { c: hexOf(r.color[i] & 255, (r.color[i] >>> 8) & 255, (r.color[i] >>> 16) & 255), bone: rig.BONE[r.part[i]] ?? null });
  }
  return out;
};

// ---- 1. idle material class vs the downscaled target, strict per direction
const per = [];
let allN = 0, allM = 0;
for (let d = 0; d < 4; d++) {
  const dir = DIRS[d], mirror = dir === 'left';
  const poses = dir === 'left' ? idle.posesOf('right') : idle.posesOf(dir);
  if (!poses || poses.length !== 1) { bad(`idle-4dir.js has no single pose for ${dir}`); continue; }
  const cell = cellOf(d, poses[0], mirror);
  let n = 0, m = 0, skipped = 0;
  for (const [k, v] of cell) {
    if (v.c === INK) continue;
    const [x, y] = k.split(',').map(Number);
    const t = targetAt(d, x, y);
    if (!t || t === INK) continue;
    const tc = cls(t);
    // the material cannot put cloth on a non-garment bone (natural.mjs): not comparable
    if (tc === 'cloth' && !GARMENT.has(v.bone)) { skipped++; continue; }
    n++;
    if (tc === cls(v.c)) m++;
  }
  const pct = n ? (100 * m) / n : 0;
  allN += n; allM += m;
  per.push(`${dir} ${pct.toFixed(1)}% (${m}/${n}${skipped ? `, ${skipped} unreachable` : ''})`);
  console.log(`class ${dir}: ${m}/${n} = ${pct.toFixed(1)}% strict${skipped ? `, ${skipped} target-cloth px on non-garment bones not comparable` : ''}`);
  if (pct < MATCH_MIN) bad(`idle class ${dir} is ${pct.toFixed(1)}% of comparable px (strict), want >= ${MATCH_MIN}%`);
}
const allPct = allN ? (100 * allM) / allN : 0;
console.log(`class all four: ${allM}/${allN} = ${allPct.toFixed(1)}% strict`);
if (allPct < ALL_MIN) bad(`idle class over all four is ${allPct.toFixed(1)}% (strict), want >= ${ALL_MIN}%`);

// ---- 2. lighting: lit only at the leftmost, shade only at the rightmost, per bone and row
let lightBad = 0;
for (let d = 0; d < 4; d++) {
  const dir = DIRS[d], mirror = dir === 'left';
  // left is the right row mirrored in the cell; unmirror x so the same left-lit rule applies
  const poses = mirror ? idle.posesOf('right') : idle.posesOf(dir);
  if (!poses) continue;
  const cell = cellOf(d, poses[0], mirror);
  const rows = new Map();
  const topOf = new Map();
  for (const [k, v] of cell) {
    if (v.c === INK || CLOTH.has(v.c)) continue; // the shade positions are skin-row positions
    const [x0, y] = k.split(',').map(Number);
    const x = mirror ? CW - 1 - x0 : x0;
    const key = `${v.bone}|${y}`;
    let g = rows.get(key); if (!g) rows.set(key, (g = []));
    g.push({ x, c: v.c, bone: v.bone });
    if (v.bone === 'head' || v.bone === 'chest') {
      if (!topOf.has(v.bone) || y < topOf.get(v.bone)) topOf.set(v.bone, y);
    }
  }
  for (const [key, g] of rows) {
    const bone = g[0].bone;
    const y = Number(key.split('|')[1]);
    if ((bone === 'head' || bone === 'chest') && y === topOf.get(bone)) continue; // the 1 px rim
    const xs = g.map((p) => p.x), minX = Math.min(...xs), maxX = Math.max(...xs);
    for (const p of g) {
      if (p.c === BRIGHT && p.x !== minX) { lightBad++; if (lightBad <= 8) bad(`${dir} ${p.x},${y} ${bone}: lit pixel not at the row's left edge`); }
      if (p.c === SHADE && p.x !== maxX) { lightBad++; if (lightBad <= 8) bad(`${dir} ${p.x},${y} ${bone}: shade pixel not at the row's right edge`); }
    }
  }
}
console.log(`lighting: ${lightBad} violation(s) on the 4 idle frames (lit only leftmost, shade only rightmost)`);
if (lightBad) bad(`${lightBad} lighting violation(s)`);

// ---- 3/4. cloth regions and no pinched 1 px skin strip; walk speckle
const comps = (set) => {
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
};
let stripBad = 0, compBad = 0;
for (let d = 0; d < 4; d++) {
  const dir = DIRS[d], mirror = dir === 'left';
  const poses = dir === 'left' ? idle.posesOf('right') : idle.posesOf(dir);
  if (!poses) continue;
  const cell = cellOf(d, poses[0], mirror);
  const shorts = new Set(), wrap = new Set();
  for (const [k, v] of cell) {
    if (!CLOTH.has(v.c)) continue;
    if (SHORTS_BONES.has(v.bone)) shorts.add(k);
    else if (v.bone === 'chest') wrap.add(k);
  }
  for (const [name, set] of [['shorts', shorts], ['wrap', wrap]]) {
    const z = comps(set);
    // the turned rows must be one region; the side view's near arm splits the shorts into a near
    // and a far part in the idle (the T90 body does the same), so the side only reports its sizes
    const turned = d < 2;
    if (turned && z.length !== 1) {
      compBad++;
      bad(`${dir}: ${name} has ${z.length} region(s) (${z.join('+')}), want 1`);
    }
  }
  for (const [k, v] of cell) {
    if (CLOTH.has(v.c) || v.c === INK || v.c === '#9a6440') continue; // the contact seam is a line
    const [x, y] = k.split(',').map(Number);
    const L = cell.get(`${x - 1},${y}`), R = cell.get(`${x + 1},${y}`);
    const U = cell.get(`${x},${y - 1}`), D = cell.get(`${x},${y + 1}`);
    const cloth = (o) => o && CLOTH.has(o.c);
    if (cloth(L) && cloth(R)) { stripBad++; if (stripBad <= 6) bad(`${dir} ${x},${y}: 1 px skin strip pinched between cloth left/right`); }
    if (cloth(U) && cloth(D)) { stripBad++; if (stripBad <= 6) bad(`${dir} ${x},${y}: 1 px skin strip pinched between cloth above/below`); }
  }
}
console.log(`cloth: ${compBad} region violation(s), ${stripBad} pinched skin strip(s) on the 4 idle frames`);
if (compBad || stripBad) bad(`${compBad + stripBad} cloth region/strip violation(s)`);

let speckle = 0, frames = 0;
const where = [];
for (let d = 0; d < 4; d++) {
  const dir = DIRS[d], mirror = dir === 'left';
  const poses = dir === 'left' ? move.posesOf('right') : move.posesOf(dir);
  if (!poses || poses.length !== 8) { bad(`walk-4dir.js has no 8 poses for ${dir}`); continue; }
  poses.forEach((pose, f) => {
    frames++;
    const cell = cellOf(d, pose, mirror);
    for (const [k, v] of cell) {
      if (v.c === INK) continue;
      const [x, y] = k.split(',').map(Number);
      let same = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const o = cell.get(`${x + dx},${y + dy}`);
        if (o && o.c === v.c) { same = true; break; }
      }
      if (!same) { speckle++; if (where.length < 6) where.push(`${dir} ${f} ${x},${y} ${v.c}`); }
    }
  });
}
console.log(`walk: ${speckle} isolated-colour pixel(s) over ${frames} frames`);
if (speckle) bad(`${speckle} isolated walk pixel(s), want 0 (first: ${where.join(' | ')})`);

// ---- the sheets must equal the fork's own render (stale export guard)
let stale = 0;
for (const [pngFile, posesOf, label] of [[IDLE, idle.posesOf, 'idle'], [WALK, move.posesOf, 'walk']]) {
  const png = readPNG(pngFile);
  if (!png) { bad(`missing ${path.basename(pngFile)}`); continue; }
  const framesPer = label === 'idle' ? 1 : 8;
  for (let d = 0; d < 4; d++) {
    const dir = DIRS[d], mirror = dir === 'left';
    const poses = dir === 'left' ? posesOf('right') : posesOf(dir);
    if (!poses) continue;
    for (let f = 0; f < framesPer; f++) {
      const cell = cellOf(d, poses[f], mirror);
      for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
        const i = ((d * CH + y) * png.w + (f * CW + x)) * png.ch;
        const a = png.pixels[i + 3] > 0;
        const o = cell.get(`${x},${y}`);
        if (!o !== !a) { stale++; continue; }
        if (o && hexOf(png.pixels[i], png.pixels[i + 1], png.pixels[i + 2]) !== o.c) stale++;
      }
    }
  }
}
console.log(`sheets: ${stale} pixel(s) differ from the fork's render`);
if (stale) bad(`${stale} sheet pixel(s) are stale; re-run l0v-texture.mjs`);

console.log(`idle class: ${per.join(' | ')} | all ${allPct.toFixed(1)}% (per dir >= ${MATCH_MIN}%, all >= ${ALL_MIN}%)`);
if (fail.length) {
  console.log(fail.map((f) => `FAIL ${f}`).join('\n'));
  console.log(`FAIL ${fail.length} check(s)`);
  process.exit(1);
}
console.log(`PASS bare-body l0veyou texture: class per dir >= ${MATCH_MIN}% (all ${allPct.toFixed(1)}% >= ${ALL_MIN}%), 0 lighting violations, 1 wrap + 1 shorts region on the turned views, no pinched skin strip, 0 isolated walk pixels over ${frames} frames`);
