#!/usr/bin/env node
// T87 acceptance: the archer's default gear set on the shared bare body.
//
// Checks output/pixelfx-character/archer/archer-walk.{png,json}:
//   - same frame count, cell, fps, columns and pivot as the bare-body sheet
//   - every opaque colour is in the T87 look table, the bare-body palette or the baked foot shadow
//   - the opaque mask of every frame contains the bare-body mask of the same frame
//   - per frame: pale hair on the head, the eye still visible, tunic + olive (olive <= 20% of tunic),
//     belt on rest rows 18-19, boots on both legs with base+lit >= 65%, a sole, one 8-connected cream
//     cloak component 5-7 wide / 15-18 tall whose top sits on the shoulder row and whose front edge
//     hugs the body, a 9-11 px quiver tube 2-3 wide at 60-75 degrees protruding <= 3 px past the cloak
//     with 2-3 fletching pixels above the shoulder, and the recoloured stock bow with >= 6 string pixels
//
// Exit 0 = all hold; 1 = a check failed (FAIL lines first, then the counts).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { posed, posedParts, skeleton, setGearPass } from '../../pipeline/scripts/pixelfx/character/core/rig.js';
import { BARE_BODY } from '../../pipeline/scripts/pixelfx/character/barebody.js';
import * as archerGear from '../../pipeline/scripts/pixelfx/character/gear/archer.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'output/pixelfx-character/archer');
const SHEET = path.join(OUT, 'archer-walk.png');
const JSONF = path.join(OUT, 'archer-walk.json');
const BARE = path.join(ROOT, 'output/pixelfx-character/barebody/barebody-walk.json');

// the look table (T87) plus the bare-body palette; #000000 at alpha 110 is the baked foot shadow
const INK = '#1d1410';
const HAIR = ['#fbe3a0', '#f0c870', '#c99a48'];
const HAIR_LIT = new Set(['#fbe3a0', '#f0c870']);
const TUNIC = ['#7d4b33', '#b07043', '#623d2f'];
const TROUSER = ['#623d2f', '#7d4b33', '#4b2b26'];
const BOOT = ['#ae6f40', '#c98a55', '#7d4b33'];
const CLOAK = ['#fde1bf', '#fee9d0', '#e4b78d'];
const CLOAK_LIGHT = new Set(['#fde1bf', '#fee9d0']);
const OLIVE = '#657138';
const BELT = '#4b2b26';
const BUCKLE = '#b2876d';
const SOLE = '#311d20';
const BOW_LIT = '#b17143';
const BOW = ['#b17143', '#7d4b33'];
const STRING = '#e4b78d';
const FLETCH = '#fee9d0';
const PALETTE = new Set([
  INK,
  '#f6c894', '#e4b78d', '#c88f5f', '#9a6440', '#5b4b3e', '#463a30', // bare body
  ...HAIR, ...TUNIC, OLIVE, BELT, BUCKLE, ...TROUSER, ...BOOT, SOLE, ...CLOAK, ...BOW, FLETCH,
]);
const DUMMY = ['#0e0c14', '#e4e6ec', '#b6b9c3', '#868995', '#5c5e6a', '#6e707c', '#4b4d58', '#34353f', '#2a2b33', '#f53cd1'];

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
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 0 ? 1 : 0;
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

// the sheet
const sheetJson = (() => { try { return JSON.parse(fs.readFileSync(JSONF, 'utf8')); } catch { return null; } })();
const png = readPNG(SHEET);
if (!sheetJson) bad(`missing or unreadable ${path.relative(ROOT, JSONF)}`);
if (!png) bad(`missing or unreadable ${path.relative(ROOT, SHEET)}`);
const bareJson = (() => { try { return JSON.parse(fs.readFileSync(BARE, 'utf8')); } catch { return null; } })();
if (!bareJson) bad(`missing or unreadable ${path.relative(ROOT, BARE)}`);
if (!sheetJson || !png || !bareJson) {
  console.log(fail.map((f) => `FAIL ${f}`).join('\n'));
  console.log('FAIL no archer gear sheet yet');
  process.exit(1);
}

const meta = sheetJson.meta?.pixelfx ?? {}, bare = bareJson.meta?.pixelfx ?? {};
const [cellW, cellH] = meta.frameSize ?? [0, 0], [px, py] = meta.pivot ?? [0, 0];
const nFrames = sheetJson.frames?.length ?? 0;

// same frame count, cell, fps, columns and pivot as the bare-body sheet
const want = { frames: bare.frames, w: bare.frameSize?.[0], h: bare.frameSize?.[1], px: bare.pivot?.[0], py: bare.pivot?.[1], fps: bare.fps, cols: bare.columns };
if (nFrames !== want.frames) bad(`frame count ${nFrames} != bare body ${want.frames}`);
if (meta.frames !== want.frames) bad(`meta frames ${meta.frames} != ${want.frames}`);
if (cellW !== want.w || cellH !== want.h) bad(`cell ${cellW}x${cellH} != bare body ${want.w}x${want.h}`);
if (px !== want.px || py !== want.py) bad(`pivot [${px},${py}] != bare body [${want.px},${want.py}]`);
if (meta.fps !== want.fps) bad(`fps ${meta.fps} != bare body ${want.fps}`);
if (meta.columns !== want.cols) bad(`columns ${meta.columns} != bare body ${want.cols}`);
if (meta.loop !== true) bad('meta loop is not true');
const wantW = want.w * want.cols, wantH = want.h * Math.ceil(want.frames / want.cols);
if (png.w !== wantW || png.h !== wantH) bad(`sheet is ${png.w}x${png.h}, expected ${wantW}x${wantH}`);

console.log(`sheet: ${nFrames} frames @ ${meta.fps} fps, cell ${cellW}x${cellH}, pivot [${px},${py}], ${meta.columns} columns`);

const at = (x, y) => {
  if (x < 0 || y < 0 || x >= png.w || y >= png.h) return null;
  const i = ((y * png.w) + x) * png.ch;
  return png.pixels[i + 3] > 0 ? { a: png.pixels[i + 3], hex: hexOf(png.pixels[i], png.pixels[i + 1], png.pixels[i + 2]) } : null;
};
const alphaAt = (x, y) => (x < 0 || y < 0 || x >= png.w || y >= png.h ? 0 : png.pixels[((y * png.w) + x) * png.ch + 3]);
const distSeg = (x, y, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const u = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l)) : 0;
  return Math.hypot(x - (ax + dx * u), y - (ay + dy * u));
};
// 8-connected components of a Set of "x,y" keys
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const comps8 = (keys) => {
  const seen = new Set(), out = [];
  for (const start of keys) {
    if (seen.has(start)) continue;
    const stack = [start], pts = [];
    seen.add(start);
    while (stack.length) {
      const [x, y] = stack.pop().split(',').map(Number);
      pts.push([x, y]);
      for (const [dx, dy] of DIRS) {
        const n = `${x + dx},${y + dy}`;
        if (keys.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); }
      }
    }
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    out.push({ pts, x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  return out.sort((a, b) => b.pts.length - a.pts.length);
};
// principal axis of a pixel blob: length, width and the angle of the long axis (0 = horizontal)
const pca = (pts) => {
  const n = pts.length;
  let mx = 0, my = 0;
  for (const [x, y] of pts) { mx += x; my += y; }
  mx /= n; my /= n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of pts) { const dx = x - mx, dy = y - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(th), uy = Math.sin(th), vx = -uy, vy = ux;
  let lo = 1e9, hi = -1e9, wl = 1e9, wh = -1e9;
  for (const [x, y] of pts) {
    const a = (x - mx) * ux + (y - my) * uy, b = (x - mx) * vx + (y - my) * vy;
    lo = Math.min(lo, a); hi = Math.max(hi, a); wl = Math.min(wl, b); wh = Math.max(wh, b);
  }
  return { len: hi - lo, w: wh - wl, ang: Math.abs(Math.atan2(uy, ux) * 180 / Math.PI) };
};
const hexOfColor = (c) => '#' + [c & 255, (c >>> 8) & 255, (c >>> 16) & 255].map((v) => v.toString(16).padStart(2, '0')).join('');
const LEG_PARTS = [['N', ['thighN', 'kneeN', 'shinN', 'footN']], ['F', ['thighF', 'kneeF', 'shinF', 'footF']]];

let frameOk = 0, colourBad = 0, maskBad = 0;
const seenColours = new Set();
const stat = { hair: 0, eye: 0, tunic: 0, belt: 0, boots: 0, sole: 0, cloak: 0, quiver: 0, bow: 0 };
for (let f = 0; f < nFrames; f++) {
  const fr = sheetJson.frames[f]?.frame;
  if (!fr || fr.w !== cellW || fr.h !== cellH) { bad(`frame ${f} rect is not the cell`); continue; }
  const pose = meta.act?.poses?.[f]?.pose;
  if (!pose) { bad(`frame ${f}: no pose in meta.pixelfx.act`); continue; }

  const ref = posed(pose, BARE_BODY); // same rig, bare material: reference mask + rest cells
  const srcAt = new Map(), refMask = new Set();
  for (let i = 0; i < ref.n; i++) {
    const k = `${px + ref.xs[i]},${py + ref.ys[i]}`;
    refMask.add(k);
    srcAt.set(k, ref.src[i]);
  }

  const cell = new Map();
  for (let y = 0; y < cellH; y++)
    for (let x = 0; x < cellW; x++) {
      const c = at(fr.x + x, fr.y + y);
      if (!c) continue;
      cell.set(`${x},${y}`, c);
      seenColours.add(c.hex);
      if (!PALETTE.has(c.hex) && !(c.hex === '#000000' && c.a === 110)) {
        colourBad++;
        if (colourBad <= 6) bad(`frame ${f}: colour ${c.hex} at ${x},${y} is not in the T87 / bare-body palette`);
      }
      if (DUMMY.includes(c.hex)) bad(`frame ${f}: DUMMY_PAL tone ${c.hex} at ${x},${y}`);
    }
  const hexAt = (x, y) => cell.get(`${x},${y}`)?.hex ?? null;

  // gear only adds pixels or covers body pixels
  let missing = 0;
  for (const k of refMask) if (!cell.has(k)) missing++;
  if (missing) { maskBad++; bad(`frame ${f}: ${missing}/${refMask.size} bare-body pixels missing (gear removed body)`); }

  const sk = skeleton(pose), j = sk.joints;
  const X = (p) => px + p[0], Y = (p) => py + p[1]; // local -> cell
  const head = [X(j.head), Y(j.head)], crown = [X(j.crown), Y(j.crown)];
  const sh = [X(j.shoulderN), Y(j.shoulderN)], hand = [X(j.handN), Y(j.handN)];

  // pale hair on the head (a short fringe, dark-free), the eye still visible
  let hairN = 0;
  for (const [k, c] of cell) {
    if (!HAIR_LIT.has(c.hex)) continue;
    const [x, y] = k.split(',').map(Number);
    if (Math.hypot(x - head[0], y - head[1]) <= 4.2 || Math.hypot(x - crown[0], y - crown[1]) <= 3.2) hairN++;
  }
  if (hairN) stat.hair++; else bad(`frame ${f}: no hair base/lit pixel on the head`);
  let eyes = 0;
  for (const [k, c] of cell) {
    if (c.hex !== INK) continue;
    const [x, y] = k.split(',').map(Number);
    const s = srcAt.get(k);
    if (s === undefined || s < 0 || Math.floor(s / 24) > 7) continue;
    if (!alphaAt(fr.x + x + 1, fr.y + y) || !alphaAt(fr.x + x - 1, fr.y + y) || !alphaAt(fr.x + x, fr.y + y + 1) || !alphaAt(fr.x + x, fr.y + y - 1)) continue;
    eyes++;
  }
  if (eyes) stat.eye++; else bad(`frame ${f}: the eye is not visible`);

  // tunic + olive patches, olive at most 20% of the tunic pixels
  let tunicN = 0, oliveN = 0;
  for (const c of cell.values()) {
    if (TUNIC.includes(c.hex)) tunicN++;
    else if (c.hex === OLIVE) oliveN++;
  }
  if (!tunicN) bad(`frame ${f}: no tunic pixels`);
  if (!oliveN) bad(`frame ${f}: no olive patches`);
  if (tunicN && oliveN > tunicN * 0.2) bad(`frame ${f}: olive is ${((oliveN / tunicN) * 100).toFixed(0)}% of the tunic`);
  if (tunicN && oliveN && oliveN <= tunicN * 0.2) stat.tunic++;

  // belt on rest rows 18-19, one buckle pixel
  let beltN = 0;
  for (const [k, c] of cell) {
    if (c.hex !== BELT) continue;
    const s = srcAt.get(k);
    if (s === undefined || s < 0) continue;
    const row = Math.floor(s / 24);
    if (row === 18 || row === 19) beltN++;
  }
  if (beltN) stat.belt++; else bad(`frame ${f}: no belt pixel on rest rows 18-19`);

  // the gear pass rendered alone: the cloak and quiver come out in the offWeapon slot, the bow in
  // the weapon slot, with the body pixels filtered out of each part
  setGearPass(archerGear.drawGear);
  const parts = new Map(posedParts(pose).map((p) => [p.name, p]));
  setGearPass(null);
  const gearPts = (part, pred) => {
    const out = [];
    if (!part) return out;
    for (let i = 0; i < part.n; i++) {
      if (pred(hexOfColor(part.color[i]))) out.push([px + part.xs[i], py + part.ys[i]]);
    }
    return out;
  };
  const offWeapon = parts.get('offWeapon');
  const creamGear = gearPts(offWeapon, (h) => CLOAK_LIGHT.has(h));

  // boots: >= 65% of the boot paint is base #ae6f40 or lit #c98a55 (shade at most 35%), on both legs
  const BOOT_PAINT = new Set(['#ae6f40', '#c98a55']);
  const bootTone = new Set(['#ae6f40', '#c98a55', '#7d4b33']);
  let bootLight = 0, bootTotal = 0, soleN = 0;
  const bootLegs = new Map();
  for (const [side, names] of LEG_PARTS) {
    let n = 0;
    for (const name of names) {
      const p = parts.get(name);
      if (!p) continue;
      for (let i = 0; i < p.n; i++) {
        const k = `${px + p.xs[i]},${py + p.ys[i]}`, s = srcAt.get(k);
        if (s === undefined || s < 0 || Math.floor(s / 24) < 29) continue;
        const h = hexAt(px + p.xs[i], py + p.ys[i]);
        if (h === SOLE) { soleN++; continue; }
        if (!bootTone.has(h)) continue;
        bootTotal++; n++;
        if (BOOT_PAINT.has(h)) bootLight++;
      }
    }
    bootLegs.set(side, n);
  }
  const bootPct = bootTotal ? (100 * bootLight) / bootTotal : 0;
  const bothLegs = [...bootLegs.values()].every((n) => n >= 3);
  if (bothLegs && bootTotal >= 8 && bootPct >= 65) stat.boots++;
  else bad(`frame ${f}: boot base+lit ${bootLight}/${bootTotal} = ${bootPct.toFixed(0)}% (need 65%), legs ${[...bootLegs.entries()].map(([s, n]) => s + n).join(',')}`);
  if (soleN) stat.sole++; else bad(`frame ${f}: no boot sole`);

  // the cloak: one 8-connected cream region, top edge on the shoulder row, 5-7 wide, 15-18 tall,
  // front edge hugging the back of the torso/legs. Measured on the gear render, where the stock bow
  // held in front of it does not cut the drape in two; the sheet must still show cream pixels.
  const cream = new Set(creamGear.map(([x, y]) => `${x},${y}`));
  let sheetCream = 0;
  for (const c of cell.values()) if (CLOAK_LIGHT.has(c.hex)) sheetCream++;
  if (sheetCream < 8) bad(`frame ${f}: only ${sheetCream} cream pixels in the sheet`);
  const ccs = comps8(cream);
  const big = ccs.filter((c) => c.pts.length >= 8), small = ccs.filter((c) => c.pts.length < 8);
  let cloakOk = false;
  if (big.length === 1 && small.every((c) => c.pts.length <= 4)) {
    const cc = big[0];
    const bodyPts = new Set();
    for (const name of ['chest', 'waist', 'pelvis', 'thighN', 'thighF', 'shinN', 'shinF']) {
      const p = parts.get(name);
      if (p) for (let i = 0; i < p.n; i++) bodyPts.add(`${px + p.xs[i]},${py + p.ys[i]}`);
    }
    const touch = cc.pts.some(([x, y]) => DIRS.some(([dx, dy]) => bodyPts.has(`${x + dx},${y + dy}`)));
    const byRow = new Map();
    for (const [x, y] of cc.pts) byRow.set(y, Math.max(byRow.get(y) ?? -1e9, x));
    let rows = 0, near = 0;
    for (const [y, mx] of byRow) {
      rows++;
      let best = 1e9;
      for (const k of bodyPts) { const [bx, by] = k.split(',').map(Number); if (by === y && bx > mx) best = Math.min(best, bx); }
      if (best - mx <= 3) near++;
    }
    cloakOk = cc.w >= 5 && cc.w <= 7 && cc.h >= 15 && cc.h <= 18 && Math.abs(cc.y0 - sh[1]) <= 2 &&
      touch && near / rows >= 0.5;
    if (!cloakOk) bad(`frame ${f}: cloak ${cc.w}x${cc.h}, top ${cc.y0} vs shoulder ${sh[1].toFixed(1)}, touch ${touch}, front-near ${near}/${rows}`);
  } else bad(`frame ${f}: cloak cream components ${ccs.map((c) => c.pts.length).join('/')} (need one)`);
  if (cloakOk) stat.cloak++;

  // the quiver: one tube 9-11 px long, 2-3 px wide, 60-75 degrees, <= 3 px past the cloak's back
  // edge; fletching above the shoulder and the tube visible in the exported sheet
  const qPts = gearPts(offWeapon, (h) => h === '#7d4b33' || h === '#623d2f');
  const qcs = comps8(new Set(qPts.map(([x, y]) => `${x},${y}`))).filter((c) => c.pts.length >= 6);
  let quiverOk = false;
  if (qcs.length === 1) {
    const q = pca(qcs[0].pts);
    const backAt = new Map();
    for (const [x, y] of creamGear) backAt.set(y, Math.min(backAt.get(y) ?? 1e9, x));
    let protrude = 0;
    for (const [x, y] of qcs[0].pts) { const bx = backAt.get(y); if (bx !== undefined) protrude = Math.max(protrude, bx - x); }
    quiverOk = q.len >= 9 && q.len <= 11 && q.w >= 1.5 && q.w <= 3.5 && q.ang >= 60 && q.ang <= 75 && protrude <= 3;
    if (!quiverOk) bad(`frame ${f}: quiver ${q.len.toFixed(1)} px long, ${q.w.toFixed(1)} wide, ${q.ang.toFixed(0)} deg, protruding ${protrude}`);
  } else bad(`frame ${f}: quiver components ${qcs.length} (need one)`);
  const fletchG = gearPts(offWeapon, (h) => h === FLETCH).filter(([, y]) => y <= sh[1] - 1.5);
  let qVisible = 0;
  if (qcs.length === 1) {
    for (const [k, c] of cell) {
      const [x, y] = k.split(',').map(Number);
      if (x >= qcs[0].x0 - 1 && x <= qcs[0].x1 + 1 && y >= qcs[0].y0 - 1 && y <= qcs[0].y1 + 1 &&
        (c.hex === '#7d4b33' || c.hex === '#623d2f')) qVisible++;
    }
  }
  if (quiverOk && fletchG.length >= 2 && fletchG.length <= 5 && qVisible >= 8) stat.quiver++;
  else bad(`frame ${f}: quiver fletching ${fletchG.length} px, sheet tube ${qVisible} px`);

  // the bow: the stock WEAPONS.bow recoloured, with >= 6 string pixels on its front string
  const sa = pose.sa ?? 0, wl = pose.wl ?? 1;
  const axX = Math.cos(sa) * wl, axY = Math.sin(sa) * wl;
  const sdX = -Math.sin(sa), sdY = Math.cos(sa);
  const atW = (i, k) => [hand[0] + axX * i + sdX * k, hand[1] + axY * i + sdY * k];
  const tipB = atW(-1, 17), mid = atW(-1, 0);
  let stringN = 0, woodLitN = 0;
  for (const [k, c] of cell) {
    const [x, y] = k.split(',').map(Number);
    if (c.hex === BOW_LIT) woodLitN++;
    if (c.hex === STRING && x >= hand[0] - 1 && distSeg(x, y, tipB[0], tipB[1], mid[0], mid[1]) <= 1.2) stringN++;
  }
  if (woodLitN >= 3 && stringN >= 6) stat.bow++;
  else bad(`frame ${f}: bow wood ${woodLitN} px / front string ${stringN} px (need 3 / 6)`);

  frameOk++;
}

console.log(`palette seen: ${[...seenColours].sort().join(' ')}`);
console.log(
  `frames ${frameOk}/${nFrames}, mask ${nFrames - maskBad}/${nFrames}, colours off-palette ${colourBad}; ` +
  `hair ${stat.hair}, eye ${stat.eye}, tunic+olive ${stat.tunic}, belt ${stat.belt}, boots ${stat.boots}, sole ${stat.sole}, ` +
  `cloak ${stat.cloak}, quiver ${stat.quiver}, bow ${stat.bow}`,
);
if (fail.length) {
  console.log(fail.map((f) => `FAIL ${f}`).join('\n'));
  console.log(`FAIL ${fail.length} check(s)`);
  process.exit(1);
}
console.log(
  `PASS archer gear: ${nFrames} frames ${cellW}x${cellH} pivot [${px},${py}], bare-body mask kept, ` +
  `${PALETTE.size} colours allowed, hair/eye/tunic/belt/boots/sole/cloak/quiver/bow ${nFrames}/${nFrames}`,
);
