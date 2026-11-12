#!/usr/bin/env node
// T88 acceptance: the shared bare body walking in the game's four directions.
//
// Checks output/pixelfx-character/barebody/barebody-walk-4dir.{png,json}:
//   - 4 rows in the order down, up, right, left, 8 frames each, 76x76 cells,
//     pivot [38,62], 8 fps, one row per direction (8 columns)
//   - the right row is pixel-identical to the T86 barebody-walk.png frames
//   - the left row is the right row mirrored in the cell (x -> 75-x)
//   - every opaque colour is the T86 bare-body palette (or the baked foot shadow)
//   - one 8-connected body, a closed ink outline (every edge pixel is ink)
//   - down/up: no enclosed transparent pixel (the rig's seal closes the slits)
//   - every rig part is drawn with >= 2 px in every frame (the fork's posedParts)
//   - down frames have exactly 2 eye pixels, up frames 0 (a lone ink dot on skin
//     inside a 4 px box around the head joint)
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
const T86SHEET = path.join(OUT, 'barebody-walk.png');
const T86JSON = path.join(OUT, 'barebody-walk.json');
const DIRS = ['down', 'up', 'right', 'left'];
const FW = 8; // frames per direction

const PALETTE = ['#1d1410', '#f6c894', '#e4b78d', '#c88f5f', '#9a6440', '#5b4b3e', '#463a30'];
const INK = '#1d1410';
const SKIN = new Set(['#f6c894', '#e4b78d', '#c88f5f', '#9a6440']);
const CLOTH = new Set(['#5b4b3e', '#463a30']);
const SHADOW = '#000000';
const PARTS = ['pelvis', 'waist', 'chest', 'neck', 'head', 'face', 'upperN', 'elbowN', 'foreN', 'handN', 'upperF', 'elbowF', 'foreF', 'handF', 'thighN', 'kneeN', 'shinN', 'footN', 'thighF', 'kneeF', 'shinF', 'footF'];
const fail = [];
const bad = (msg) => { if (fail.length < 40) fail.push(msg); };

// ---- a tiny RGBA PNG reader (8-bit, non-interlaced)
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
  console.log(`FAIL missing output/pixelfx-character/barebody/barebody-walk-4dir.{png,json}`);
  console.log('FAIL 1 check(s)');
  process.exit(1);
}
const t86png = readPNG(T86SHEET);
let t86 = null;
try { t86 = JSON.parse(fs.readFileSync(T86JSON, 'utf8')); } catch { t86 = null; }
if (!t86png || !t86) {
  console.log('FAIL missing the T86 barebody-walk sheet; run T86 first');
  console.log('FAIL 1 check(s)');
  process.exit(1);
}

// ---- the fork's poses and per-part pixels
let rig, move;
try {
  rig = await import(pathToFileURL(path.join(ROOT, 'pipeline/scripts/pixelfx/character/core/rig.js')).href);
  move = await import(pathToFileURL(path.join(ROOT, 'pipeline/scripts/pixelfx/character/walk-4dir.js')).href);
  const body = await import(pathToFileURL(path.join(ROOT, 'pipeline/scripts/pixelfx/character/barebody.js')).href);
  rig.setMaterial(body.BARE_BODY);
} catch (e) {
  console.log(`FAIL cannot import the fork or walk-4dir.js: ${e.message}`);
  console.log('FAIL 1 check(s)');
  process.exit(1);
}

// ---- sheet convention (same cell, fps and pivot as T86)
const meta = sheetJson.meta?.pixelfx ?? {};
const t86m = t86.meta?.pixelfx ?? {};
const CW = t86m.frameSize?.[0], CH = t86m.frameSize?.[1], PX = t86m.pivot?.[0], PY = t86m.pivot?.[1];
if (JSON.stringify(meta.directions) !== JSON.stringify(DIRS)) bad(`directions ${JSON.stringify(meta.directions)} != ${JSON.stringify(DIRS)}`);
if (meta.rows !== 4) bad(`meta rows ${meta.rows} != 4`);
if (meta.columns !== FW) bad(`meta columns ${meta.columns} != ${FW}`);
if (meta.frames !== FW) bad(`meta frames ${meta.frames} != ${FW}`);
if (meta.fps !== t86m.fps) bad(`fps ${meta.fps} != ${t86m.fps}`);
if (meta.loop !== true) bad('meta loop is not true');
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

const rawAt = (img, x, y) => {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return null;
  const i = (y * img.w + x) * img.ch;
  return img.pixels[i + 3] > 0 ? { a: img.pixels[i + 3], hex: hexOf(img.pixels[i], img.pixels[i + 1], img.pixels[i + 2]) } : null;
};
const cellAt = (d, f, x, y) => rawAt(png, f * CW + x, d * CH + y);

// ---- the right row is the T86 walk, pixel for pixel
let rightSame = 0;
for (let f = 0; f < FW; f++) {
  const tr = t86.frames?.[f]?.frame;
  if (!tr) { bad(`T86 has no frame ${f}`); continue; }
  let diff = 0;
  for (let y = 0; y < CH; y++)
    for (let x = 0; x < CW; x++) {
      const ia = ((2 * CH + y) * png.w + (f * CW + x)) * png.ch, ib = ((tr.y + y) * t86png.w + (tr.x + x)) * t86png.ch;
      for (let k = 0; k < png.ch; k++) if (png.pixels[ia + k] !== t86png.pixels[ib + k]) { diff++; break; }
    }
  if (diff) bad(`right row frame ${f} differs from the T86 sheet in ${diff} px`); else rightSame++;
}

// ---- the left row is the right row mirrored in the cell
let leftSame = 0;
for (let f = 0; f < FW; f++) {
  let diff = 0;
  for (let y = 0; y < CH; y++)
    for (let x = 0; x < CW; x++) {
      const a = rawAt(png, f * CW + x, 3 * CH + y), b = rawAt(png, f * CW + (CW - 1 - x), 2 * CH + y);
      if ((a?.hex ?? null) !== (b?.hex ?? null) || (a?.a ?? 0) !== (b?.a ?? 0)) diff++;
    }
  if (diff) bad(`left row frame ${f} is not the mirrored right row (${diff} px)`); else leftSame++;
}

// ---- per frame: palette, one body, closed outline, holes, parts, eyes
const seenColours = new Set();
let holesBad = 0, partsBad = 0, eyesBad = 0, compBad = 0, edgeBad = 0, armBad = 0, wrapBad = 0;
const poseCache = new Map();
for (let d = 0; d < 4; d++) {
  const dir = DIRS[d];
  const poses = move.posesOf(dir) ?? move.posesOf('right');
  if (!poses || poses.length !== FW) { bad(`walk-4dir.js has no ${FW} poses for ${dir}`); continue; }
  for (let f = 0; f < FW; f++) {
    const pose = poses[f];
    const set = new Set(), solid = new Set();
    for (let y = 0; y < CH; y++)
      for (let x = 0; x < CW; x++) {
        const c = cellAt(d, f, x, y);
        if (!c) continue;
        const shadow = c.hex === SHADOW && c.a === 110;
        if (shadow) continue;
        const k = `${x},${y}`;
        set.add(k); solid.add(k); seenColours.add(c.hex);
        if (!PALETTE.includes(c.hex)) bad(`${dir} ${f}: colour ${c.hex} at ${x},${y} is not in the palette`);
        if (c.hex === SHADOW && c.a !== 110) bad(`${dir} ${f}: unexpected black alpha ${c.a}`);
      }
    for (let y = 0; y < CH; y++)
      for (let x = 0; x < CW; x++) {
        const c = cellAt(d, f, x, y);
        if (c && c.hex === SHADOW && c.a === 110) solid.add(`${x},${y}`);
      }

    // one 8-connected body
    let comps = 0;
    const seen = new Set();
    for (const k of set) {
      if (seen.has(k)) continue;
      comps++;
      const q = [k]; seen.add(k);
      while (q.length) {
        const [x, y] = q.pop().split(',').map(Number);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const kk = `${x + dx},${y + dy}`;
            if (set.has(kk) && !seen.has(kk)) { seen.add(kk); q.push(kk); }
          }
      }
    }
    if (comps !== 1) { compBad++; bad(`${dir} ${f}: ${comps} 8-connected body components, want 1`); }

    // closed ink outline: every edge pixel is ink
    for (const k of set) {
      const [x, y] = k.split(',').map(Number);
      let edge = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!set.has(`${x + dx},${y + dy}`) && !solid.has(`${x + dx},${y + dy}`)) edge = true;
      if (edge && cellAt(d, f, x, y).hex !== INK) { edgeBad++; bad(`${dir} ${f}: edge pixel ${x},${y} is ${cellAt(d, f, x, y).hex}, not ink`); break; }
    }

    // down/up: no enclosed transparent pixel
    if (d < 2) {
      const free = new Set(), seenF = new Set();
      for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (!set.has(`${x},${y}`)) free.add(`${x},${y}`);
      const q = [[0, 0]]; seenF.add('0,0');
      while (q.length) {
        const [x, y] = q.pop();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, kk = `${nx},${ny}`;
          if (nx < 0 || ny < 0 || nx >= CW || ny >= CH || seenF.has(kk) || solid.has(kk)) continue;
          seenF.add(kk); q.push([nx, ny]);
        }
      }
      let holes = 0;
      for (const k of free) if (!seenF.has(k)) { holes++; if (holes <= 3) bad(`${dir} ${f}: hole at ${k}`); }
      if (holes) holesBad++;
    }

    // every rig part drawn with >= 2 px (posedParts = the fork's per-part pixels)
    const key = `${dir}:${f}`;
    let parts = poseCache.get(key);
    if (!parts) { parts = new Map(rig.posedParts(pose).map((p) => [p.name, p])); poseCache.set(key, parts); }
    for (const name of PARTS) {
      const n = parts.get(name)?.n ?? 0;
      if (n < 2) { partsBad++; bad(`${dir} ${f}: rig part ${name} has ${n} px`); }
    }

    // ---- down/up: hanging arms and the back wrap (T88 review)
    if (d < 2) {
      const sk = rig.skeleton(pose);
      const final = rig.posed(pose);
      const torsoSet = new Set(), torsoRows = new Map();
      for (const name of ['pelvis', 'waist', 'chest']) {
        const p = parts.get(name);
        if (!p) continue;
        for (let i = 0; i < p.n; i++) {
          torsoSet.add(`${p.xs[i]},${p.ys[i]}`);
          const a = torsoRows.get(p.ys[i]) || [1e9, -1e9];
          torsoRows.set(p.ys[i], [Math.min(a[0], p.xs[i]), Math.max(a[1], p.xs[i])]);
        }
      }
      // the hip-band bottom: the lowest shorts pixel on the torso (rest rows 18..23)
      let band = -Infinity;
      for (let i = 0; i < final.n; i++) {
        const s = final.src[i];
        if (s < 0) continue;
        const row = Math.floor(s / 24);
        if (row < 18 || row > 23 || !torsoSet.has(`${final.xs[i]},${final.ys[i]}`)) continue;
        const c = cellAt(d, f, PX + final.xs[i], PY + final.ys[i]);
        if (c && CLOTH.has(c.hex)) band = Math.max(band, final.ys[i]);
      }
      // each hand's lowest pixel is at or below the hip-band bottom + 3
      for (const name of ['handN', 'handF']) {
        const p = parts.get(name);
        let low = -Infinity;
        if (p) for (let i = 0; i < p.n; i++) if (cellAt(d, f, PX + p.xs[i], PY + p.ys[i])) low = Math.max(low, p.ys[i]);
        if (band > -Infinity && low < band + 3) {
          armBad++;
          bad(`${dir} ${f}: ${name} lowest pixel y ${low} is above the hip band bottom + 3 (${band + 3})`);
        }
      }
      // each upper arm stays within 1 px of the torso (1 px sliver rows at the deltoid are skipped)
      let gap = 0;
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
          gap = Math.max(gap, Math.max(0, t[0] - a1, a0 - t[1]));
        }
      }
      if (gap > 1) { armBad++; bad(`${dir} ${f}: upper arm is ${gap} px from the torso, want <= 1`); }
      // the up row's chest wrap is one band across the back (T90: the band is now the chest bone's
      // middle third, v -0.5..2.3 above the joint, so the window covers that band, not the belly)
      if (d === 1) {
        const cy = sk.joints.chest[1], y0 = Math.round(PY + cy - 4), y1 = Math.round(PY + cy + 1);
        const wrap = new Set();
        for (let yy = y0; yy <= y1; yy++) for (let xx = 0; xx < CW; xx++) {
          const c = cellAt(d, f, xx, yy);
          if (c && CLOTH.has(c.hex)) wrap.add(`${xx},${yy}`);
        }
        let wc = 0; const wseen = new Set();
        for (const k of wrap) {
          if (wseen.has(k)) continue;
          wc++; const q = [k]; wseen.add(k);
          while (q.length) {
            const [x, y] = q.pop().split(',').map(Number);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const kk = `${x + dx},${y + dy}`;
              if (wrap.has(kk) && !wseen.has(kk)) { wseen.add(kk); q.push(kk); }
            }
          }
        }
        if (wc !== 1) { wrapBad++; bad(`up ${f}: chest wrap has ${wc} connected component(s), want 1`); }
      }
    }

    // down: 2 eye pixels; up: 0 (a lone ink pixel on skin near the head joint)
    if (d < 2) {
      const sk = rig.skeleton(pose), hx = Math.round(sk.joints.head[0]), hy = Math.round(sk.joints.head[1]);
      let eyes = 0;
      for (let y = hy - 4; y <= hy + 4; y++)
        for (let x = hx - 4; x <= hx + 4; x++) {
          const c = cellAt(d, f, PX + x, PY + y);
          if (!c || c.hex !== INK) continue;
          const n4 = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => cellAt(d, f, PX + x + dx, PY + y + dy));
          if (n4.some((v) => !v || !SKIN.has(v.hex))) continue;
          eyes++;
        }
      if (d === 0 && eyes !== 2) { eyesBad++; bad(`down ${f}: ${eyes} eye pixels, want 2`); }
      if (d === 1 && eyes !== 0) { eyesBad++; bad(`up ${f}: ${eyes} eye pixels, want 0`); }
    }
  }
}

console.log(`palette seen: ${[...seenColours].sort().join(' ')}`);
console.log(`right=T86 ${rightSame}/${FW}, left=mirror ${leftSame}/${FW}, components bad ${compBad}, edge bad ${edgeBad}, holes bad ${holesBad}, parts bad ${partsBad}, eyes bad ${eyesBad}, arms bad ${armBad}, wrap bad ${wrapBad}`);
if (fail.length) {
  console.log(fail.map((f) => `FAIL ${f}`).join('\n'));
  console.log(`FAIL ${fail.length} check(s)`);
  process.exit(1);
}
console.log(`PASS bare-body 4 directions: 4x${FW} frames ${CW}x${CH}, right=T86, left=mirror, ${PARTS.length} parts, eyes 2 down / 0 up, hands at mid-thigh, back wrap 1 band`);
