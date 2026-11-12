#!/usr/bin/env node
// T89 acceptance: the shared bare body standing still in the game's four directions.
//
// Checks output/pixelfx-character/barebody/barebody-idle-4dir.{png,json}:
//   - 4 rows in the order down, up, right, left, 1 frame each, 76x76 cells, pivot [38,62],
//     8 fps, one column
//   - the sheet is exactly the fork's render of idle-4dir.js (colour per pixel, no extra pixel)
//   - every opaque colour is the T86 bare-body palette
//   - one 8-connected body, a closed ink outline, no enclosed transparent pixel
//   - every rig part is drawn with >= 2 px (the fork's posedParts)
//   - each arm's four parts are one 4-connected shape and no ink pixel lies between two
//     parts of the same arm; 2-4 px arm width; the hand is at most 1 px wider than the forearm
//   - down/up: both arms fully visible, hands at mid-thigh, arms mirror-symmetric within 1 px
//   - right/left: the far arm still shows >= 8 px of forearm + hand
//   - left row = right row mirrored in the cell
//   - down 2 eye pixels, up 0
//
// Exit 0 = all hold; 1 = a check failed (FAIL lines first, then the counts).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'output/pixelfx-character/barebody');
const SHEET = path.join(OUT, 'barebody-idle-4dir.png');
const JSONF = path.join(OUT, 'barebody-idle-4dir.json');
const DIRS = ['down', 'up', 'right', 'left'];
const CW = 76, CH = 76, PX = 38, PY = 62;

const PALETTE = ['#1d1410', '#f6c894', '#e4b78d', '#c88f5f', '#9a6440', '#5b4b3e', '#463a30'];
const INK = '#1d1410';
const SKIN = new Set(['#f6c894', '#e4b78d', '#c88f5f', '#9a6440']);
const TONES = ['#f6c894', '#e4b78d', '#c88f5f', '#9a6440'];
const SEAM = '#9a6440';
const TRUNK = new Set(['pelvis', 'waist', 'chest', 'neck', 'head', 'face']);
const PARTS = ['pelvis', 'waist', 'chest', 'neck', 'head', 'face', 'upperN', 'elbowN', 'foreN', 'handN', 'upperF', 'elbowF', 'foreF', 'handF', 'thighN', 'kneeN', 'shinN', 'footN', 'thighF', 'kneeF', 'shinF', 'footF'];
const ARMS = { near: ['upperN', 'elbowN', 'foreN', 'handN'], far: ['upperF', 'elbowF', 'foreF', 'handF'] };
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
  console.log('FAIL missing output/pixelfx-character/barebody/barebody-idle-4dir.{png,json}');
  console.log('FAIL 1 check(s)');
  process.exit(1);
}

// ---- the fork's poses and per-pixel part info
let rig, idle, body;
try {
  rig = await import(pathToFileURL(path.join(ROOT, 'pipeline/scripts/pixelfx/character/core/rig.js')).href);
  idle = await import(pathToFileURL(path.join(ROOT, 'pipeline/scripts/pixelfx/character/idle-4dir.js')).href);
  body = await import(pathToFileURL(path.join(ROOT, 'pipeline/scripts/pixelfx/character/barebody.js')).href);
  rig.setMaterial(body.BARE_BODY);
} catch (e) {
  console.log(`FAIL cannot import the fork or idle-4dir.js: ${e.message}`);
  console.log('FAIL 1 check(s)');
  process.exit(1);
}

// ---- sheet convention
const meta = sheetJson.meta?.pixelfx ?? {};
if (JSON.stringify(meta.directions) !== JSON.stringify(DIRS)) bad(`directions ${JSON.stringify(meta.directions)} != ${JSON.stringify(DIRS)}`);
if (meta.rows !== 4) bad(`meta rows ${meta.rows} != 4`);
if (meta.columns !== 1) bad(`meta columns ${meta.columns} != 1`);
if (meta.frames !== 1) bad(`meta frames ${meta.frames} != 1`);
if (meta.fps !== 8) bad(`fps ${meta.fps} != 8`);
if (meta.loop !== true) bad('meta loop is not true');
if (!meta.frameSize || meta.frameSize[0] !== CW || meta.frameSize[1] !== CH) bad(`frameSize ${JSON.stringify(meta.frameSize)} != [${CW},${CH}]`);
if (!meta.pivot || meta.pivot[0] !== PX || meta.pivot[1] !== PY) bad(`pivot ${JSON.stringify(meta.pivot)} != [${PX},${PY}]`);
if (sheetJson.frames?.length !== 4) bad(`frames ${sheetJson.frames?.length} != 4`);
if (png.w !== CW || png.h !== CH * 4) bad(`sheet is ${png.w}x${png.h}, expected ${CW}x${CH * 4}`);
for (let d = 0; d < 4; d++) {
  const fr = sheetJson.frames?.[d]?.frame;
  if (!fr || fr.x !== 0 || fr.y !== d * CH || fr.w !== CW || fr.h !== CH) bad(`frame ${d} rect is not cell (0,${d})`);
}
console.log(`sheet: 4 dirs x 1 frame @ ${meta.fps} fps, cell ${CW}x${CH}, pivot [${PX},${PY}]`);

const rawAt = (x, y) => {
  if (x < 0 || y < 0 || x >= png.w || y >= png.h) return null;
  const i = (y * png.w + x) * png.ch;
  return png.pixels[i + 3] > 0 ? { a: png.pixels[i + 3], hex: hexOf(png.pixels[i], png.pixels[i + 1], png.pixels[i + 2]) } : null;
};
const cellAt = (d, x, y) => rawAt(x, d * CH + y);

// ---- the left row is the right row mirrored in the cell (pivot 38 -> 76 - 38 = 38)
let leftSame = 0;
for (let y = 0; y < CH; y++)
  for (let x = 0; x < CW; x++) {
    const a = cellAt(3, x, y), b = cellAt(2, CW - 1 - x, y);
    if ((a?.hex ?? null) !== (b?.hex ?? null) || (a?.a ?? 0) !== (b?.a ?? 0)) { bad(`left is not the mirrored right row at ${x},${y}`); leftSame = -1; y = CH; break; }
  }
if (leftSame === 0) leftSame = 1;

// ---- per direction
let compBad = 0, edgeBad = 0, holesBad = 0, partsBad = 0, eyesBad = 0, armBad = 0, symBad = 0, staleBad = 0, farBad = 0, trunkBad = 0, faceBad = 0, toneBad = 0, armEdgeBad = 0, handBad = 0;
const seenColours = new Set();
for (let d = 0; d < 4; d++) {
  const dir = DIRS[d], mirror = dir === 'left';
  const poses = dir === 'left' ? idle.posesOf('right') : idle.posesOf(dir);
  if (!poses || poses.length !== 1) { bad(`idle-4dir.js has no single pose for ${dir}`); continue; }
  const pose = poses[0];
  const r = rig.posed(pose);
  const sk = rig.skeleton(pose);
  // the part map of the composed render, in cell coords (left = the right row mirrored)
  const cells = new Map();
  const at = (i) => ({ c: hexOf(r.color[i] & 255, (r.color[i] >>> 8) & 255, (r.color[i] >>> 16) & 255), part: rig.BONE?.[r.part[i]] ?? null });
  for (let i = 0; i < r.n; i++) {
    const x = mirror ? CW - 1 - (PX + r.xs[i]) : PX + r.xs[i];
    cells.set(`${x},${PY + r.ys[i]}`, at(i));
  }
  // stale-sheet guard + palette + the set of opaque cells
  const set = new Set();
  for (const [k, v] of cells) {
    const [x, y] = k.split(',').map(Number);
    const c = cellAt(d, x, y);
    if (!c || c.hex !== v.c || c.a !== 255) { staleBad++; if (staleBad <= 6) bad(`${dir}: sheet ${x},${y} is ${c ? c.hex : 'transparent'}, fork draws ${v.c}`); continue; }
    set.add(k);
  }
  for (let y = 0; y < CH; y++)
    for (let x = 0; x < CW; x++) {
      const c = cellAt(d, x, y);
      if (c && !cells.has(`${x},${y}`)) { staleBad++; if (staleBad <= 6) bad(`${dir}: extra sheet pixel ${x},${y} (${c.hex})`); }
      if (!c) continue;
      seenColours.add(c.hex);
      if (!PALETTE.includes(c.hex)) bad(`${dir}: colour ${c.hex} at ${x},${y} is not in the palette`);
    }

  // one 8-connected body
  {
    const seen = new Set(); let comps = 0;
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
    if (comps !== 1) { compBad++; bad(`${dir}: ${comps} 8-connected body components, want 1`); }
  }

  // closed ink outline: every edge pixel is ink
  for (const k of set) {
    const [x, y] = k.split(',').map(Number);
    let edge = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!set.has(`${x + dx},${y + dy}`)) edge = true;
    if (edge && cellAt(d, x, y).hex !== INK) { edgeBad++; bad(`${dir}: edge pixel ${x},${y} is ${cellAt(d, x, y).hex}, not ink`); break; }
  }

  // no enclosed transparent pixel
  {
    const free = new Set(), seenF = new Set();
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (!set.has(`${x},${y}`)) free.add(`${x},${y}`);
    const q = [[0, 0]]; seenF.add('0,0');
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, kk = `${nx},${ny}`;
        if (nx < 0 || ny < 0 || nx >= CW || ny >= CH || seenF.has(kk) || set.has(kk)) continue;
        seenF.add(kk); q.push([nx, ny]);
      }
    }
    let holes = 0;
    for (const k of free) if (!seenF.has(k)) { holes++; if (holes <= 3) bad(`${dir}: hole at ${k}`); }
    if (holes) holesBad++;
  }

  // every rig part drawn with >= 2 px
  for (const p of rig.posedParts(pose)) if (p.n < 2) { partsBad++; bad(`${dir}: rig part ${p.name} has ${p.n} px`); }
  for (const name of PARTS) if (!rig.posedParts(pose).some((p) => p.name === name)) { partsBad++; bad(`${dir}: rig part ${name} is not drawn`); }

  // ---- the arms (local render coords, so the part map is the fork's)
  const local = new Map();
  for (let i = 0; i < r.n; i++) local.set(`${r.xs[i]},${r.ys[i]}`, at(i));
  const rowWidths = (names) => {
    // the limb's drawn width: its own pixels plus the 1 px ink edge it carries over other regions
    const rows = new Map();
    for (const [k, v] of local) {
      if (!names.includes(v.part)) continue;
      const [x, y] = k.split(',').map(Number);
      if (!rows.has(y)) rows.set(y, new Set());
      rows.get(y).add(x);
    }
    const out = new Map();
    for (const [y, xs] of rows) {
      let best = 0, run = 0, prev = -9;
      for (const x of [...xs].sort((a, b) => a - b)) { run = x === prev + 1 ? run + 1 : 1; best = Math.max(best, run); prev = x; }
      out.set(y, best);
    }
    return out;
  };
  for (const [side, arm] of Object.entries(ARMS)) {
    const keys = [...local].filter(([, v]) => arm.includes(v.part)).map(([k]) => k);
    const armSet = new Set(keys), seen = new Set();
    let comps = 0;
    for (const k of keys) {
      if (seen.has(k)) continue;
      comps++;
      const q = [k]; seen.add(k);
      while (q.length) {
        const [x, y] = q.pop().split(',').map(Number);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const kk = `${x + dx},${y + dy}`;
          if (armSet.has(kk) && !seen.has(kk)) { seen.add(kk); q.push(kk); }
        }
      }
    }
    if (comps !== 1) { armBad++; bad(`${dir}: ${side} arm has ${comps} 4-connected components, want 1`); }
    let inkPairs = 0;
    for (const [k, v] of local) {
      if (!arm.includes(v.part)) continue;
      const [x, y] = k.split(',').map(Number);
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const o = local.get(`${x + dx},${y + dy}`);
        if (!o || !arm.includes(o.part) || o.part === v.part) continue;
        if (v.c === INK || o.c === INK) inkPairs++;
      }
    }
    if (inkPairs) { armBad++; bad(`${dir}: ${inkPairs} ink pixel(s) between two ${side}-arm parts`); }
    // down/up: both arms fully visible, 2-4 px wide
    if (d < 2) {
      const vis = {};
      for (const v of local.values()) if (arm.includes(v.part) && v.c !== INK) vis[v.part] = (vis[v.part] || 0) + 1;
      for (const name of arm) if ((vis[name] || 0) < 2) { armBad++; bad(`${dir}: ${side} ${name} shows ${vis[name] || 0} px, want >= 2`); }
      for (const [y, w] of rowWidths(arm)) if (w < 2 || w > 4) { armBad++; bad(`${dir}: ${side} arm row ${y} is ${w} px wide, want 2-4`); break; }
    }
  }
  const nearW = rowWidths(ARMS.near), farW = rowWidths(ARMS.far);
  for (const [y, w] of nearW) if (w < 2 || w > 4) { armBad++; bad(`${dir}: near arm row ${y} is ${w} px wide, want 2-4`); break; }
  const maxOf = (m) => Math.max(0, ...m.values());
  const fMax = maxOf(rowWidths(['foreN'])), hMax = maxOf(rowWidths(['handN']));
  if (hMax > fMax + 1) { armBad++; bad(`${dir}: hand is ${hMax} px wide, forearm ${fMax} (want <= forearm + 1)`); }
  if (d < 2) {
    const hMaxF = maxOf(rowWidths(['foreF'])), handF = maxOf(rowWidths(['handF']));
    if (handF > hMaxF + 1) { armBad++; bad(`${dir}: far hand is ${handF} px wide, forearm ${hMaxF}`); }
    // per-row arm extents mirror-symmetric within 1 px about the cell centre
    const extents = (names) => {
      const rows = new Map();
      for (const [k, v] of local) {
        if (!names.includes(v.part) || v.c === INK) continue;
        const [x, y] = k.split(',').map(Number);
        const a = rows.get(y) || [1e9, -1e9];
        rows.set(y, [Math.min(a[0], x), Math.max(a[1], x)]);
      }
      return rows;
    };
    const na = extents(ARMS.near), fa = extents(ARMS.far);
    for (const y of new Set([...na.keys(), ...fa.keys()])) {
      const A = na.get(y), B = fa.get(y);
      if (!A || !B) { symBad++; bad(`${dir}: row ${y} has only one arm`); break; }
      const dx = Math.max(Math.abs(A[0] + B[1]), Math.abs(A[1] + B[0]));
      if (dx > 1) { symBad++; bad(`${dir}: arms differ by ${dx} px at row ${y}, want <= 1`); break; }
    }
    // hands at mid-thigh
    const hip = sk.joints.hipN[1], knee = sk.joints.kneeN[1];
    const hy = [...local].filter(([, v]) => v.part === 'handN' || v.part === 'handF').map(([k]) => Number(k.split(',')[1]));
    const mid = hy.reduce((a, b) => a + b, 0) / (hy.length || 1);
    if (!hy.length || mid < hip || mid > knee) { armBad++; bad(`${dir}: hands at y ${mid.toFixed(1)}, want between hip ${hip.toFixed(1)} and knee ${knee.toFixed(1)}`); }
    // the hand must not merge into the thigh: every touching hand/thigh pair carries a line
    let noLine = 0;
    for (const [k, v] of local) {
      if (v.part !== 'handN' && v.part !== 'handF') continue;
      const [x, y] = k.split(',').map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const o = local.get(`${x + dx},${y + dy}`);
        if (!o || (o.part !== 'thighN' && o.part !== 'thighF')) continue;
        if (v.c !== INK && v.c !== SEAM && o.c !== INK && o.c !== SEAM) noLine++;
      }
    }
    if (noLine) { handBad++; bad(`${dir}: ${noLine} hand/thigh contact(s) with no line`); }
    // down 2 eyes, up 0 (a lone ink pixel on skin near the head joint)
    if (d < 2) {
      const hx = Math.round(sk.joints.head[0]) * (mirror ? -1 : 1);
      let eyes = 0;
      for (let y = Math.round(sk.joints.head[1]) - 4; y <= Math.round(sk.joints.head[1]) + 4; y++)
        for (let x = hx - 4; x <= hx + 4; x++) {
          const sx = mirror ? CW - 1 - (PX + x) : PX + x;
          const c = cellAt(d, sx, PY + y);
          if (!c || c.hex !== INK) continue;
          const n4 = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => cellAt(d, sx + dx, PY + y + dy));
          if (n4.some((v) => !v || !SKIN.has(v.hex))) continue;
          eyes++;
        }
      if (d === 0 && eyes !== 2) { eyesBad++; bad(`down: ${eyes} eye pixels, want 2`); }
      if (d === 1 && eyes !== 0) { eyesBad++; bad(`up: ${eyes} eye pixels, want 0`); }
    }
  }
  // right/left: the far arm still shows >= 8 px of forearm + hand
  if (d >= 2) {
    let n = 0;
    for (const v of local.values()) if ((v.part === 'foreF' || v.part === 'handF') && v.c !== INK) n++;
    if (n < 8) { farBad++; bad(`${dir}: far arm shows ${n} px of forearm + hand, want >= 8`); }
  }
  // ---- the rendered surface: trunk joins with no line; only limb edges get ink inside
  const hx0 = PX + Math.round(sk.joints.head[0]) * (mirror ? -1 : 1), hy0 = PY + Math.round(sk.joints.head[1]);
  let trunkInk = 0;
  for (const [k, v] of cells) {
    if (v.c !== INK || !v.part || !TRUNK.has(v.part)) continue;
    const [x, y] = k.split(',').map(Number);
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => cells.get(`${x + dx},${y + dy}`));
    if (nb.some((q) => !q)) continue; // the outline is not "inside"
    if (Math.abs(x - hx0) <= 4 && Math.abs(y - hy0) <= 4) continue; // the two pupils
    if (nb.some((q) => q.part && q.part !== v.part && TRUNK.has(q.part))) trunkInk++;
  }
  if (trunkInk) { trunkBad++; bad(`${dir}: ${trunkInk} ink pixel(s) inside the trunk`); }
  // the face carries exactly the two eyes (down) and none on the back
  let faceInk = 0;
  for (const v of cells.values()) if (v.c === INK && v.part === 'face') faceInk++;
  if (d === 0 && faceInk !== 2) { faceBad++; bad(`down: face has ${faceInk} ink pixels, want 2`); }
  if (d === 1 && faceInk !== 0) { faceBad++; bad(`up: face has ${faceInk} ink pixels, want 0`); }
  // no tone speckle: a skin pixel whose tone differs from all four same-part neighbours
  let iso = 0;
  for (const [k, v] of cells) {
    const t = TONES.indexOf(v.c);
    if (t < 0 || !v.part) continue;
    const [x, y] = k.split(',').map(Number);
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => cells.get(`${x + dx},${y + dy}`));
    if (!nb.every((q) => q && q.part === v.part && TONES.includes(q.c))) continue;
    if (nb.some((q) => TONES.indexOf(q.c) === t)) continue;
    iso++;
  }
  if (iso > 3) { toneBad++; bad(`${dir}: ${iso} isolated-tone pixels, want <= 3`); }
  // side views: the near arm is edged in ink against the torso
  if (d >= 2) {
    let edge = 0;
    for (const [k, v] of cells) {
      if (v.c !== INK || !v.part || !ARMS.near.includes(v.part)) continue;
      const [x, y] = k.split(',').map(Number);
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => cells.get(`${x + dx},${y + dy}`));
      if (nb.some((q) => q && q.part && TRUNK.has(q.part))) edge++;
    }
    if (edge < 6) { armEdgeBad++; bad(`${dir}: near arm has ${edge} ink edge px against the torso, want >= 6`); }
  }
}

console.log(`palette seen: ${[...seenColours].sort().join(' ')}`);
console.log(`left=mirror ${leftSame > 0 ? 'yes' : 'no'}, stale ${staleBad}, components bad ${compBad}, edge bad ${edgeBad}, holes bad ${holesBad}, parts bad ${partsBad}, eyes bad ${eyesBad}, arms bad ${armBad}, symmetry bad ${symBad}, far arm bad ${farBad}, trunk ink bad ${trunkBad}, face ink bad ${faceBad}, tone bad ${toneBad}, arm edge bad ${armEdgeBad}, hand/thigh bad ${handBad}`);
if (fail.length) {
  console.log(fail.map((f) => `FAIL ${f}`).join('\n'));
  console.log(`FAIL ${fail.length} check(s)`);
  process.exit(1);
}
console.log(`PASS bare-body idle, 4 directions: 4x1 frames ${CW}x${CH}, left=mirror, ${PARTS.length} parts, arms 4-connected with no ink between their parts, no ink inside the trunk, 2 eye px down / 0 up, tone speckle <= 3, hand/thigh and near-arm edges lined`);
