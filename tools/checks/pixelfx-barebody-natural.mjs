#!/usr/bin/env node
// T90 acceptance: the shared bare body's materials by bone and its natural front/back walk.
//
// Checks output/pixelfx-character/barebody/barebody-walk-4dir.{png,json}:
//   - 4 rows (down, up, right, left) x 8 frames, 76x76 cells, pivot [38,62], 8 fps
//   - the sheet is exactly the fork's render of walk-4dir.js with barebody.js (colour per pixel,
//     no extra pixel); the left row is the right row mirrored in the cell
//   - cloth (the two cloth colours) only lands on the garment bones: pelvis/waist/thighN/thighF
//     (shorts) and chest (wrap); anywhere else (head, arms, shins, feet) is a failure
//   - shorts and wrap are each ONE 8-connected region per frame; the stock side rows (right/left,
//     stock arm) may show up to two far-garment slivers of 1-4 px behind the near limb
//     (right frame 7: shorts 26+4+2), and nothing bigger
//   - T91: a synthetic sealed hole is recoloured at its own output index, not at the next pixel
//   - down/up: pelvis height per frame equals the right walk's (the stock bob)
//   - feet: both on the ground line at the contacts (frames 0/4), the swing foot 1-3 px above it
//     in the passing frames (2/6)
//   - down/up hands: each upper arm within 1 px of the torso, hand screen-x travel <= 1 px,
//     hand up/down travel 1-2 px and anti-phase with its own foot's body-space forward
//     (pose.ffx / pose.fbx)
//
// Exit 0 = all hold; 1 = a check failed (FAIL lines first, then the counts).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'output/pixelfx-character/barebody');
const SHEET = path.join(OUT, 'barebody-walk-4dir.png');
const JSONF = path.join(OUT, 'barebody-walk-4dir.json');
const DIRS = ['down', 'up', 'right', 'left'];
const FW = 8;
const CW = 76, CH = 76, PX = 38, PY = 62;

const CLOTH = new Set(['#5b4b3e', '#463a30']);
const SKIN = new Set(['#f6c894', '#e4b78d', '#c88f5f', '#9a6440']);
const SHORTS_BONES = new Set(['pelvis', 'waist', 'thighN', 'thighF']);
const WRAP_BONE = 'chest';
const FAR_LEG = new Set(['thighF', 'kneeF', 'shinF', 'footF']); // the swing leg of the turned rows
const fail = [];
const bad = (msg) => { if (fail.length < 40) fail.push(msg); };

// ---- a tiny RGBA PNG reader (8-bit, non-interlaced), same shape as tools/checks/pixelfx-barebody.mjs
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

// ---- fail on a missing sheet BEFORE importing the fork, so the checker fails before the work
const png = readPNG(SHEET);
let sheetJson = null;
try { sheetJson = JSON.parse(fs.readFileSync(JSONF, 'utf8')); } catch { sheetJson = null; }
if (!png || !sheetJson) {
  console.log('FAIL missing output/pixelfx-character/barebody/barebody-walk-4dir.{png,json}');
  console.log('FAIL 1 check(s)');
  process.exit(1);
}

// ---- the fork's poses and per-pixel parts
let rig, move, body;
try {
  rig = await import(pathToFileURL(path.join(ROOT, 'pipeline/scripts/pixelfx/character/core/rig.js')).href);
  move = await import(pathToFileURL(path.join(ROOT, 'pipeline/scripts/pixelfx/character/walk-4dir.js')).href);
  body = await import(pathToFileURL(path.join(ROOT, 'pipeline/scripts/pixelfx/character/barebody.js')).href);
  rig.setMaterial(body.BARE_BODY);
} catch (e) {
  console.log(`FAIL cannot import the fork or walk-4dir.js: ${e.message}`);
  console.log('FAIL 1 check(s)');
  process.exit(1);
}

// ---- T91: the sealed-hole 4-neighbour recolour must land on the hole's own output index (2),
// never on the pixel pushed after it (3). A wrong index leaves the hole alone and eats pixel 3.
{
  const A = 0xff8dc4f6 >>> 0, C = 0xff3e6f9a >>> 0, INKC = 0xff10141d >>> 0;
  const out = { n: 4, xs: new Int16Array([0, 1, 0, 1]), ys: new Int16Array([0, 0, 1, 1]), color: new Uint32Array([A, A, C, INKC]) };
  rig.recolourSealedFills(out, [2], INKC);
  if (out.color[2] !== A || out.color[3] !== INKC)
    bad(`sealed-hole recolour: index 2 is ${out.color[2].toString(16)}, index 3 is ${out.color[3].toString(16)}; want the hole (2) recoloured and 3 untouched`);
  else console.log(`sealed-hole index: hole 2 recoloured to ${out.color[2].toString(16)}, index 3 ${out.color[3].toString(16)} untouched`);
}

// ---- sheet convention
const meta = sheetJson.meta?.pixelfx ?? {};
if (JSON.stringify(meta.directions) !== JSON.stringify(DIRS)) bad(`directions ${JSON.stringify(meta.directions)} != ${JSON.stringify(DIRS)}`);
if (meta.rows !== 4) bad(`meta rows ${meta.rows} != 4`);
if (meta.columns !== FW) bad(`meta columns ${meta.columns} != ${FW}`);
if (meta.frames !== FW) bad(`meta frames ${meta.frames} != ${FW}`);
if (meta.fps !== 8) bad(`fps ${meta.fps} != 8`);
if (!meta.frameSize || meta.frameSize[0] !== CW || meta.frameSize[1] !== CH) bad(`frameSize ${JSON.stringify(meta.frameSize)} != [${CW},${CH}]`);
if (!meta.pivot || meta.pivot[0] !== PX || meta.pivot[1] !== PY) bad(`pivot ${JSON.stringify(meta.pivot)} != [${PX},${PY}]`);
if (sheetJson.frames?.length !== 4 * FW) bad(`frames ${sheetJson.frames?.length} != ${4 * FW}`);
if (png.w !== CW * FW || png.h !== CH * 4) bad(`sheet is ${png.w}x${png.h}, expected ${CW * FW}x${CH * 4}`);
for (let d = 0; d < 4; d++)
  for (let f = 0; f < FW; f++) {
    const fr = sheetJson.frames?.[d * FW + f]?.frame;
    if (!fr || fr.x !== f * CW || fr.y !== d * CH || fr.w !== CW || fr.h !== CH) bad(`frame ${d * FW + f} rect is not (${f},${d}) cell`);
  }
console.log(`sheet: 4 dirs x ${FW} frames @ ${meta.fps} fps, cell ${CW}x${CH}, pivot [${PX},${PY}]`);

const sheetAt = (d, f, x, y) => {
  if (x < 0 || y < 0 || x >= CW || y >= CH) return null;
  const i = ((d * CH + y) * png.w + f * CW + x) * png.ch;
  return png.pixels[i + 3] > 0 ? hexOf(png.pixels[i], png.pixels[i + 1], png.pixels[i + 2]) : null;
};
// 8-connected components of a key set
function components(set) {
  const seen = new Set(), sizes = [];
  for (const k of set) {
    if (seen.has(k)) continue;
    let n = 0;
    const q = [k];
    seen.add(k);
    while (q.length) {
      n++;
      const [x, y] = q.pop().split(',').map(Number);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const kk = `${x + dx},${y + dy}`;
          if (set.has(kk) && !seen.has(kk)) { seen.add(kk); q.push(kk); }
        }
    }
    sizes.push(n);
  }
  return sizes.sort((a, b) => b - a);
}

// covariance of two equal-length series (sign = whether they move together)
function covOf(a, b) {
  const ma = a.reduce((x, y) => x + y, 0) / a.length, mb = b.reduce((x, y) => x + y, 0) / b.length;
  let c = 0;
  for (let i = 0; i < a.length; i++) c += (a[i] - ma) * (b[i] - mb);
  return c;
}

let staleBad = 0, clothBad = 0, compBad = 0, pelvBad = 0, feetBad = 0, armBad = 0, legBad = 0;
// the stock bob every turned row must copy: the right walk's pelvis height per frame
const rightPelvis = move.posesOf('right').map((p) => rig.skeleton(p).joints.pelvis[1]);
const footBottom = {}, hand = {};
for (let d = 0; d < 4; d++) {
  const dir = DIRS[d], mirror = dir === 'left';
  const poses = dir === 'left' ? move.posesOf('right') : move.posesOf(dir);
  if (!poses || poses.length !== FW) { bad(`walk-4dir.js has no ${FW} poses for ${dir}`); continue; }
  for (let f = 0; f < FW; f++) {
    const pose = poses[f];
    const r = rig.posed(pose);
    const local = new Map();
    for (let i = 0; i < r.n; i++) {
      const x = PX + r.xs[i], y = PY + r.ys[i];
      local.set(`${mirror ? CW - 1 - x : x},${y}`, {
        hex: hexOf(r.color[i] & 255, (r.color[i] >>> 8) & 255, (r.color[i] >>> 16) & 255),
        bone: rig.BONE?.[r.part[i]] ?? null,
      });
    }
    // stale-sheet guard: the sheet must be exactly this render
    for (const [k, v] of local) {
      const [x, y] = k.split(',').map(Number);
      if (sheetAt(d, f, x, y) !== v.hex) { staleBad++; if (staleBad <= 6) bad(`${dir} ${f}: sheet ${x},${y} is ${sheetAt(d, f, x, y)}, fork draws ${v.hex}`); continue; }
    }
    for (let y = 0; y < CH; y++)
      for (let x = 0; x < CW; x++) {
        const c = sheetAt(d, f, x, y);
        if (c && !local.has(`${x},${y}`)) { staleBad++; if (staleBad <= 6) bad(`${dir} ${f}: extra sheet pixel ${x},${y} (${c})`); }
      }
    // cloth by bone: shorts and wrap sets; cloth anywhere else is the blotchy-body bug. Classified
    // on the SHEET's colour through the fork's part map, so a stale sheet is caught here too.
    const shorts = new Set(), wrap = new Set();
    for (const [k, v] of local) {
      const [x, y] = k.split(',').map(Number);
      if (!CLOTH.has(sheetAt(d, f, x, y))) continue;
      if (SHORTS_BONES.has(v.bone)) shorts.add(k);
      else if (v.bone === WRAP_BONE) wrap.add(k);
      else { clothBad++; if (clothBad <= 8) bad(`${dir} ${f}: cloth on ${v.bone ?? 'an unassigned part'} at ${k}`); }
    }
    // one region each; the stock side rows may keep the far garment's 1-4 px slivers (the stock
    // arm splits right frame 7's shorts into 26+4+2 px), the turned rows never split
    const maxComps = d < 2 ? 1 : 3, maxExtra = 4;
    for (const [name, set] of [['shorts', shorts], ['wrap', wrap]]) {
      const sizes = components(set);
      if (!sizes.length) { compBad++; bad(`${dir} ${f}: no ${name} pixels at all`); continue; }
      if (sizes.length > maxComps || sizes.slice(1).some((v) => v > maxExtra)) {
        compBad++;
        bad(`${dir} ${f}: ${name} has ${sizes.length} 8-connected components (${sizes.join('+')}), want <= ${maxComps} with extras <= ${maxExtra} px`);
      }
    }
    // per-frame skeleton numbers
    const sk = rig.skeleton(pose);
    const parts = new Map(rig.posedParts(pose).map((p) => [p.name, p]));
    if (d < 2 && Math.abs(sk.joints.pelvis[1] - rightPelvis[f]) > 0.05) {
      pelvBad++;
      bad(`${dir} ${f}: pelvis y ${sk.joints.pelvis[1].toFixed(2)}, right walk ${rightPelvis[f].toFixed(2)}`);
    }
    const foot = {};
    for (const name of ['footN', 'footF']) { const p = parts.get(name); if (p) foot[name] = Math.max(...p.ys); }
    footBottom[`${dir}${f}`] = foot;
    const hands = {};
    for (const name of ['handN', 'handF']) {
      const p = parts.get(name);
      if (!p) continue;
      const shoulder = name === 'handN' ? sk.joints.shoulderN : sk.joints.shoulderF;
      hands[name] = { x: p.cx, y: p.cy, lo: Math.max(...p.ys), rel: p.cy - shoulder[1] };
    }
    hand[`${dir}${f}`] = hands;
    // T90: the swing (far) leg on the odd frames is clean two-tone skin with no isolated pixel
    if (d < 2 && f % 2 === 1) {
      const tones = new Set();
      let iso = 0;
      for (const [k, v] of local) {
        if (!FAR_LEG.has(v.bone)) continue;
        const [x, y] = k.split(',').map(Number);
        const c = sheetAt(d, f, x, y);
        if (SKIN.has(c)) tones.add(c);
        const nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
        if (!nb.some(([a, b]) => sheetAt(d, f, a, b) === c)) {
          iso++;
          if (iso <= 3) bad(`${dir} ${f}: isolated ${v.bone} pixel at ${k} (${c})`);
        }
      }
      if (iso) legBad++;
      if (tones.size > 2) { legBad++; bad(`${dir} ${f}: swing-leg skin has ${tones.size} tones (${[...tones].join(' ')}), want 2`); }
    }
  }
  // feet: ground line from the contact frame, then contacts flat and the swing foot lifted 1-3 px
  if (d < 2) {
    const ground = footBottom[`${dir}0`];
    for (const f of [0, 4]) {
      for (const name of ['footN', 'footF']) {
        const v = footBottom[`${dir}${f}`]?.[name];
        if (v === undefined || Math.abs(v - ground[name]) > 0.5) { feetBad++; bad(`${dir} ${f}: ${name} bottom ${v}, contact should be on the ground line ${ground[name]}`); }
      }
    }
    for (const f of [2, 6]) {
      const feet = footBottom[`${dir}${f}`] ?? {};
      const names = ['footN', 'footF'], bottoms = names.map((n) => feet[n]);
      if (bottoms.some((v) => v === undefined)) { feetBad++; bad(`${dir} ${f}: a foot part is not drawn`); continue; }
      const lift = bottoms.map((v, i) => ground[names[i]] - v);
      const swing = lift.indexOf(Math.max(...lift));
      if (Math.min(...lift) !== 0) { feetBad++; bad(`${dir} ${f}: neither foot is on the ground line (lifts ${lift.join('/')})`); }
      if (Math.max(...lift) < 1 || Math.max(...lift) > 3) { feetBad++; bad(`${dir} ${f}: swing foot (${names[swing]}) lifts ${Math.max(...lift)} px, want 1-3`); }
    }
    // hands: arm rules, small screen travel, and the arm swing opposite the same-side leg. T90: the
    // hand rides its own arm, so it drops as the arm swings forward and lifts as the arm swings back.
    const ffx = poses.map((p) => p.ffx), fbx = poses.map((p) => p.fbx);
    const armFwd = { handN: poses.map((p) => p.fx), handF: poses.map((p) => p.bx) };
    for (const [name, legFwd] of [['handN', ffx], ['handF', fbx]]) {
      const xs = [], ys = [];
      for (let f = 0; f < FW; f++) { const h = hand[`${dir}${f}`]?.[name]; if (!h) break; xs.push(h.x); ys.push(h.rel); }
      if (xs.length !== FW) { armBad++; bad(`${dir}: ${name} is not drawn in every frame`); continue; }
      const xr = Math.max(...xs) - Math.min(...xs), yr = Math.max(...ys) - Math.min(...ys);
      if (xr > 1) { armBad++; bad(`${dir}: ${name} moves ${xr.toFixed(1)} px in/out across the cycle, want <= 1`); }
      // the swing is measured against the shoulder: the body bob itself is not the arm swing
      if (yr < 1 || yr > 2) { armBad++; bad(`${dir}: ${name} moves ${yr.toFixed(1)} px up/down on the shoulder across the cycle, want 1-2`); }
      if (covOf(armFwd[name], legFwd) >= 0) { armBad++; bad(`${dir}: ${name} swings with its own leg, want opposite`); }
      // ys are negative upward: a hand falling as its own arm swings forward gives a positive covariance
      if (covOf(armFwd[name], ys) <= 0) { armBad++; bad(`${dir}: ${name} does not drop as its arm swings forward`); }
    }
    // frames 1/3/5/7: one arm forward, one back, so the two hands' lowest points clearly differ
    for (const f of [1, 3, 5, 7]) {
      const a = hand[`${dir}${f}`]?.handN, b = hand[`${dir}${f}`]?.handF;
      if (!a || !b) { armBad++; bad(`${dir} ${f}: a hand is not drawn`); continue; }
      const dlo = Math.abs(a.lo - b.lo);
      if (dlo < 1) { armBad++; bad(`${dir} ${f}: the hands' lowest points differ by ${dlo} px, want >= 1`); }
    }
    // each upper arm stays within 1 px of the torso
    for (let f = 0; f < FW; f++) {
      const pose = poses[f], parts = new Map(rig.posedParts(pose).map((p) => [p.name, p]));
      const torsoRows = new Map();
      for (const name of ['pelvis', 'waist', 'chest']) {
        const p = parts.get(name);
        if (!p) continue;
        for (let i = 0; i < p.n; i++) {
          const a = torsoRows.get(p.ys[i]) || [1e9, -1e9];
          torsoRows.set(p.ys[i], [Math.min(a[0], p.xs[i]), Math.max(a[1], p.xs[i])]);
        }
      }
      for (const name of ['upperN', 'upperF']) {
        const p = parts.get(name);
        if (!p) continue;
        const rows = new Map();
        for (let i = 0; i < p.n; i++) {
          const a = rows.get(p.ys[i]) || [1e9, -1e9];
          rows.set(p.ys[i], [Math.min(a[0], p.xs[i]), Math.max(a[1], p.xs[i])]);
        }
        for (const [y, [a0, a1]] of rows) {
          if (a1 - a0 < 1) continue;
          const t = torsoRows.get(y);
          if (!t) continue;
          const gap = Math.max(0, t[0] - a1, a0 - t[1]);
          if (gap > 1) { armBad++; bad(`${dir} ${f}: ${name} is ${gap} px from the torso, want <= 1`); break; }
        }
      }
    }
  }
}

console.log(`pelvis y: right ${rightPelvis.map((v) => v.toFixed(2)).join(',')}`);
for (const dir of ['down', 'up']) {
  const ys = move.posesOf(dir).map((p) => rig.skeleton(p).joints.pelvis[1]);
  console.log(`pelvis y: ${dir} ${ys.map((v) => v.toFixed(2)).join(',')}`);
}
console.log(`stale ${staleBad}, cloth off-garment ${clothBad}, component bad ${compBad}, pelvis bad ${pelvBad}, feet bad ${feetBad}, arms/hands bad ${armBad}, swing leg bad ${legBad}`);
if (fail.length) {
  console.log(fail.map((f) => `FAIL ${f}`).join('\n'));
  console.log(`FAIL ${fail.length} check(s)`);
  process.exit(1);
}
console.log(`PASS bare-body natural: 4x${FW} frames ${CW}x${CH}, shorts/wrap by bone (1 region down/up; side rows <= 3 with extras <= 4 px), pelvis bob = right walk, contacts flat, swing foot 1-3 px, hands 1-2 px against the arm swing (>= 1 px apart at 1/3/5/7), swing leg 2-tone with no isolated pixel, sealed hole recoloured at its own index`);
