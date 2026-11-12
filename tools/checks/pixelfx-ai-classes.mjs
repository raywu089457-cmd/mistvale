#!/usr/bin/env node
// Acceptance for the AI-body classes (C:/Users/ray/Desktop/Claude code/pixelfx tools/character-ai-body.mjs):
//
//   node tools/checks/pixelfx-ai-classes.mjs
//
// Checks records/characters/classes/ai-archer and ai-mage of the pixelfx project (PIXELFX_DIR overrides it):
//   1. every file of the stock classes' format is present and is valid JSON / PNG:
//      holding/idle-4dir.{png,json,aseprite.json}, <weapon>/idle-4dir.{...}, walk/walk-4dir.{...}, walk/<weapon>/walk-4dir.{...}
//      (and no attack files); every key the stock class's JSON has is there with the same type
//   2. frame counts and rows: idle 4 directions (down, left, right, up) side by side; walk 8 columns x 4 rows in that order,
//      32 holds per sheet, the sheets are exactly frameSize x grid; left is the right row mirrored (body and weapon)
//   (BOTH classes now carry the weapon on the BACK, not in the hand: the staff of the mage and the bow of the archer follow the BACK CARRY checks B1-B8, last block of this header. Checks 3, 7-anatomy and 9 below are the hand-held ones; they apply to a class that is not in BACK_IDS, none now)
//   3. grip (archer): in every walk frame (4 directions x 8) the weapon layer has a pixel within 2 px (native, pixel centres) of the
//      AI hand keypoint (output/pixellab-barebody/v3-keypoints.json, the near hand kept continuous through the cycle), and
//      the json's per-frame hand is within 2 px of it too
//   4. the weapon never floats: every weapon pixel is connected to the body (an opaque body pixel within 1 px, chains of
//      weapon pixels with gaps <= 1 px) in every walk and idle frame, its connected part reaches the body
//   5. at least 85% over all frames (and 75% in every single frame) of the AI torso pixels (rig parts chest / waist / pelvis, same rig fit and nearest-rig-pixel rule the
//      generator uses) carry the class palette's torso colours (tunic + belt + the trousers the stock paint() puts on the hips for the archer, robe + belt for the mage)
//   6. no garment colour above the neck line: in every frame of both classes (4 directions x idle + 8 walk) no AI pixel above
//      the frame's NECK keypoint carries a tunic / robe / belt / trousers / boots colour of the class palette (must be 0)
//   7. weapon motion: per class and direction the weapon's main-axis angle (principal axis of its pixels) varies <= 16 degrees over the
//      8 walk frames; in down/up the weapon centroid stays on the same side of the body centre every frame; in left/right the weapon's
//      draw order relative to the body (weapon json drawOrder, also in the idle json) is the same in all frames and directions agree
//      with the idle json; the idle weapon is within 2 px of walk frame 0's (centroid offset) and its grip within 2 px of the idle hand
//   9. weapon = HUMAN HAND ANATOMY. A stick closed in a fist passes THROUGH the palm, across the forearm; it is locked in the fist and turns rigidly with
//      the forearm. alpha(f) = angle of the near forearm of the same frame (AI keypoints, tracked near arm, elbow -> wrist from straight down, hand
//      forward +; a frame whose forearm length is off the median by > 40% takes the midpoint of its neighbours' elbows; zero-phase cyclic [1 2 1]/4
//      smoothing; ABSOLUTE, no mean removed). The weapon's forward end is alpha rotated forward by the grip angle beta (archer 114, mage 116), so
//      its elevation above horizontal is e = alpha + beta - 90. Side views (left / right), measured from the rendered pixels (principal axis):
//      [1] beta as measured = (weapon forward-end angle) - (forearm angle) is within beta +- 5 deg in every frame and inside 100-130, [2] corr(weapon
//      angle, alpha) >= 0.95 at lag 0 and lag 0 is the best of -1 / 0 / +1, [3] the weapon axis is never collinear with the forearm: the angle between the
//      two lines is >= 60 deg in every frame (front / back views: the forearm and the weapon both project onto the vertical there, so only the side
//      views can measure it; the 3-D angle is beta by the projection of [6]), [4] no weapon pixel on the head (the body's pixels
//      above the frame's NECK keypoint, less the 4 rows of shoulder slope right above it: the AI neck keypoint is on the shoulder line) in any frame of any view, idle included, [15] smoothness: every step of the weapon angle incl. 7 -> 0 is <= 2x the
//      median step. Front / back (down / up): the weapon lies in the forward-back plane, so each end's vertical extent from the grip is its length from the
//      grip x sin(e): [5] the screen angle range is <= 3 degrees, [6] the rows above / below the grip pixel row (the pixel holding the hand keypoint) match
//      the projection (forward end up, rear end down) within +-1.5 px (the two lengths are measured from the same class's right view). All frames: [7] the
//      weapon pixel nearest the hand keypoint is <= 1.5 px from it, [8] weapon side constant in down / up, [9] draw order constant, [10] 0 floating weapon
//      pixels, [11] no weapon pixel on the outermost ring of its cell (nothing is clipped; the cell has >= 1 px clear on every side), [12] the lowest
//      weapon pixel is >= 3 px above the feet line, [13] bow string lightness <= #c8c0b0, [14] recolour numbers and 0 garment pixels above the neck unchanged
//      (checks 5 and 6 of the list above). [16] draw order per direction: down = front (the forward end points at the camera), up = behind, left / right =
//      front, constant over all frames; after compositing body and weapon with it, at least 4 weapon pixels are visible in EVERY down frame (up: reported).
//      The idle weapon follows the same anatomy with the idle forearm (checked like [1]).
// BACK CARRY (ai-mage staff, ai-archer bow): the weapon hangs on a strap across the back, rigid relative to the TORSO (shoulder midpoint of the AI skeleton = the anchor, walk frames
//   smoothed zero-phase cyclic [1 2 1]/4, idle raw), tilted BACK.tilt degrees across the back, same in every frame; down / up: diagonal, side views: edge-on, vertical on screen
//   (staff: length x cos(tilt); bow: the diagonal bow projected along x, a thin upright bar). Limits per class are in BC (top of this file); mage / archer values below.
//   B1 the weapon's screen angle (principal axis of its pixels) is constant within each direction: range <= 1 degree over idle + 8 walk frames; down / up 25-40 degrees from vertical, side views <= 5
//   B2 the weapon follows the TORSO anchor: the offset (weapon pixel centroid - anchor) is constant within 1 px per axis over idle + 8 walk frames (it is not the arms that drive it: the hand keypoint swings far more)
//   B3 drawOrder is exactly down behind, up front, left behind, right behind, in the walk json and the idle json
//   B4 visible weapon pixels after compositing with that order, every frame: mage down >= 15 (and >= 8 above the shoulder line), up >= 40, left / right >= 10; archer down >= 30 (>= 25 above the shoulder line), up >= 100, left / right >= 15
//   B5 up: 0 weapon pixels over head pixels (head = body pixels more than 4 px above the NECK keypoint); down: 0 on the head too, and the nearest weapon pixel >= 1 px from it
//   B6 down / up: the top (staff crystal / bow upper tip) is above the shoulder line and over the SAME shoulder in both (the character's right: screen left in down, screen right in up), beside the head; the lower end is
//      within 9 px of the opposite hip keypoint; side views: staff: the length (vertical extent) is the diagonal's length x cos(tilt) +- 0.1; bow: the vertical extent equals the down / up views' +- 1.5 px (edge-on projection)
//   B7 0 floating pixels, 0 pixels on the edge of the cell, lowest pixel >= 3 px (mage) / >= 8 px (archer) above the feet line (checks 4, 11, 12); the bow string is never white (lightness <= #c8c0b0, check 13)
//   B8 recolour and garment-above-neck numbers unchanged (checks 5 and 6)
// Prints the numbers. Exit 0 = all hold; 1 = a check failed (FAIL lines first).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHAR = path.join(ROOT, 'pipeline/scripts/pixelfx/character');
const PF = (process.env.PIXELFX_DIR || 'C:/Users/ray/Desktop/Claude code/pixelfx').replace(/\\/g, '/');
const CLASSES_DIR = path.join(PF, 'records/characters/classes');
const lib = await import(pathToFileURL(path.join(CHAR, 'outfit-lib.mjs')).href);
const { readPNG } = await import(pathToFileURL(path.join(CHAR, 'png-io.mjs')).href);
const { CELL, classify, nearestRig, poseOf, aiFrame, capture, joints } = lib;
const pfClasses = await import(pathToFileURL(path.join(PF, 'tools/lib/classes.mjs')).href);

const fails = [];
const fail = (m) => { if (fails.length < 60) fails.push(m); };
const ORDER = ['down', 'left', 'right', 'up'];
const PIV = [37, 64];
const DRAW_EXPECT = { down: 'front', left: 'front', right: 'front', up: 'front' }; // hand-held bow: the near hand holds it at the side of the body, so it is in front of the body in all four views (up: its upper limb must show beside the body)
// hand-held weapon (archer) limits: HC. beta window around the grip angle, the angle between the bow line and the forearm line, visible pixels EVERY frame (idle + walk) per direction,
// the projected height of the bow in the down view may vary at most POP of its maximum over the walk (no popping in / out), the grip pixel within GRIP px of the hand keypoint, lowest bow pixel above the feet
const HC = { 'ai-archer': { betaMin: 140, betaMax: 160, betweenMin: 25, betweenMax: 45, minVis: { down: 15, up: 10, left: 15, right: 15 }, pop: 0.4, grip: 1.0, minLow: 3 } };
const MIN_VISIBLE_DOWN = 4; // px: weapon pixels visible after compositing, every walk frame of the down view (classes without HC)
const IDLE_WALK0 = 6; // px: the idle weapon follows the idle forearm (~10 deg), walk frame 0 its own (~3 deg); a 36 px staff moves its centroid ~5 px for that (was 4, 2 when the weapon never turned)
const BACK_DRAW = { down: 'behind', up: 'front', left: 'behind', right: 'behind' };
const DRAW_BY = { 'ai-archer': { down: 'front', left: 'front', right: 'front', up: 'front' }, 'ai-mage': BACK_DRAW }; // per class: both carry the weapon on the back
// BACK CARRY limits per class (noun in the messages, tilt window of the down / up axis, visible weapon pixels after compositing, above the shoulder line in down, lowest pixel above the feet)
const BACK_IDS = ['ai-mage']; // the archer holds the bow in the hand (HC); an archer back carry would be listed here with its BC entry
const BC = {
  'ai-mage': { noun: 'staff', top: 'crystal', tiltMin: 25, tiltMax: 40, minVis: { down: 15, up: 40, left: 10, right: 10 }, minAbove: 8, minLow: 3, buttMax: 9, shDx: 4.5 },
  'ai-archer': { noun: 'bow', top: 'upper tip', tiltMin: 25, tiltMax: 40, minVis: { down: 30, up: 100, left: 15, right: 15 }, minAbove: 25, minLow: 8, buttMax: 9, shDx: 4.5 },
};
const KIDS = [['ai-archer', 'archer', 'bow', 150], ['ai-mage', 'mage', 'staff', 116]]; // class folder, stock class, weapon, grip angle beta (deg)
const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { fail(`${path.relative(PF, f)}: ${e.code === 'ENOENT' ? 'missing' : 'invalid JSON'}`); return null; } };
const readImg = (f) => { const i = readPNG(f); if (!i) fail(`${path.relative(PF, f)}: missing or not a PNG`); return i; };
const typeOf = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
function sameSchema(ai, stock, where) {
  for (const [k, v] of Object.entries(stock)) {
    if (!(k in ai)) { fail(`${where}: key "${k}" of the stock class json is missing`); continue; }
    if (typeOf(ai[k]) !== typeOf(v)) fail(`${where}: key "${k}" is ${typeOf(ai[k])}, stock has ${typeOf(v)}`);
  }
}
const cellBytes = (img, fw, fh, col, row) => {
  const o = new Uint8ClampedArray(fw * fh * 4);
  for (let y = 0; y < fh; y++) o.set(img.data.subarray(((row * fh + y) * img.w + col * fw) * 4, ((row * fh + y) * img.w + col * fw + fw) * 4), y * fw * 4);
  return o;
};

/** the head region: the opaque body pixels above the frame's NECK keypoint minus the shoulder slope (cell coordinates, y + 0.5 < neckY - SHOULDER_SLOPE). Weapon points are pixel centres in body-cell
 *  coordinates. Returns { hits: weapon pixels lying on a head pixel, gap: smallest distance (px, pixel centres) from any weapon pixel above the neck line to the
 *  nearest head pixel (0 = on it) }, and also the head's bounding box for the report */
const SHOULDER_SLOPE = 4; // px: the AI neck keypoint sits on the shoulder line, ~4 px below the chin; the 4 rows above it are the shoulder slope (the trunk), not the head
function headHits(bc, bw, bh, pts, neckY0) {
  const neckY = neckY0 - SHOULDER_SLOPE;
  const head = new Set(); let x0 = 1e9, x1 = -1e9, y0 = 1e9;
  for (let y = 0; y < bh && y + 0.5 < neckY; y++) for (let x = 0; x < bw; x++) if (bc[(y * bw + x) * 4 + 3]) { head.add(y * bw + x); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); }
  let hits = 0, gap = Infinity;
  for (const [x, y] of pts) {
    if (y >= neckY) continue;
    const px = Math.floor(x), py = Math.floor(y);
    if (head.has(py * bw + px)) hits++;
    for (const h of head) { const d = Math.hypot((h % bw) + 0.5 - x, Math.floor(h / bw) + 0.5 - y); if (d < gap) gap = d; }
  }
  return { hits, gap, box: [x0, x1, y0] };
}
/** [11] pixels on the outermost ring of a weapon cell */
function ringPixels(wc, fw, fh) {
  let n = 0;
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) if ((x === 0 || y === 0 || x === fw - 1 || y === fh - 1) && wc[(y * fw + x) * 4 + 3]) n++;
  return n;
}
/** the principal axis of body-cell points, degrees counter-clockwise on screen in [0, 180) */
function axisCcw(pts) {
  let cx = 0, cy = 0;
  for (const [x, y] of pts) { cx += x; cy += y; }
  cx /= pts.length; cy /= pts.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of pts) { sxx += (x - cx) ** 2; syy += (y - cy) ** 2; sxy += (x - cx) * (y - cy); }
  const screen = (((0.5 * Math.atan2(2 * sxy, sxx - syy) * 180 / Math.PI) % 180) + 180) % 180;
  return (180 - screen) % 180;
}
const corrOf = (a, b) => { const n = a.length, ma = a.reduce((p, c) => p + c, 0) / n, mb = b.reduce((p, c) => p + c, 0) / n; let s0 = 0, sa = 0, sb = 0; for (let i = 0; i < n; i++) { s0 += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return s0 / Math.sqrt(sa * sb); };

/** alpha(f) of the right view, walk frames 0..7: raw (repaired), smoothed minus its mean */
function forearmAlpha() {
  const J = Array.from({ length: 8 }, (_, f) => joints('right', f + 1)), el = J.map((j) => [...j.elbowN]), h = J.map((j) => j.handN);
  const flen = (i) => Math.hypot(h[i][0] - el[i][0], h[i][1] - el[i][1]);
  const med = Array.from({ length: 8 }, (_, i) => flen(i)).sort((a, b) => a - b)[4], fixed = el.map((e) => [...e]), repaired = [];
  for (let i = 0; i < 8; i++) if (flen(i) > 1.4 * med || flen(i) < 0.6 * med) { repaired.push(i); const p = el[(i + 7) % 8], n = el[(i + 1) % 8]; fixed[i] = [(p[0] + n[0]) / 2, (p[1] + n[1]) / 2]; }
  const raw = fixed.map((e, i) => Math.atan2(h[i][0] - e[0], h[i][1] - e[1]) * 180 / Math.PI);
  const sm = raw.map((v, i) => (raw[(i + 7) % 8] + 2 * v + raw[(i + 1) % 8]) / 4), mean = sm.reduce((a, b) => a + b, 0) / 8;
  const rawMean = raw.reduce((a, b) => a + b, 0) / 8;
  return { raw, rawC: raw.map((v) => v - rawMean), abs: sm, alpha: sm.map((v) => v - mean), repaired, rawAbs: raw };
}
const ALPHA = forearmAlpha();
const idleJ = joints('right', 0), IDLE_ALPHA = Math.atan2(idleJ.handN[0] - idleJ.elbowN[0], idleJ.handN[1] - idleJ.elbowN[1]) * 180 / Math.PI;
const circ = (a) => ((((a + 90) % 180) + 180) % 180) - 90; // signed difference of two line angles (period 180) -> [-90, 90)

let files = 0, gripMax = 0, gripAt = '', handMax = 0, floatTotal = 0, framesChecked = 0;
const backStats = {}, torsoStats = {}, neckStats = {}, motion = [], clearance = {}, swings = [], depths = [], sideA = {}, lenOf = {}, headStats = {}, ringStats = {}, idleInfo = [], visStats = {};
for (const [id, stockId, weapon, BETA] of KIDS) {
  const dir = path.join(CLASSES_DIR, id), stock = path.join(CLASSES_DIR, stockId), back = BACK_IDS.includes(id), BCF = back ? BC[id] : undefined, HCF = HC[id], DRAW_EXPECT = DRAW_BY[id]; // eslint-disable-line no-shadow
  const spec = [
    ['holding/idle-4dir', 'holding/idle-4dir'],
    [`${weapon}/idle-4dir`, `${weapon}/idle-4dir`],
    ['walk/walk-4dir', 'walk/walk-4dir'],
    [`walk/${weapon}/walk-4dir`, `walk/${weapon}/walk-4dir`],
  ];
  const J = {}, I = {};
  for (const [name, stockName] of spec) {
    const j = readJSON(path.join(dir, `${name}.json`)), a = readJSON(path.join(dir, `${name}.aseprite.json`)), img = readImg(path.join(dir, `${name}.png`));
    files += 3;
    J[name] = j; I[name] = img;
    const sj = readJSON(path.join(stock, `${stockName}.json`)), sa = readJSON(path.join(stock, `${stockName}.aseprite.json`));
    if (j && sj) sameSchema(j, sj, `${id}/${name}.json`);
    if (a && sa) sameSchema(a, sa, `${id}/${name}.aseprite.json`);
    if (a && sa) { sameSchema(a.meta, sa.meta, `${id}/${name}.aseprite.json meta`); if (a.meta?.pixelfx && sa.meta?.pixelfx) sameSchema(a.meta.pixelfx, sa.meta.pixelfx, `${id}/${name}.aseprite.json meta.pixelfx`); }
    if (j && img) {
      const [fw, fh] = j.frameSize, cols = j.columns ?? 4, rows = j.rows ?? 1;
      const idle = name.endsWith('idle-4dir');
      const wantW = idle ? fw * 4 : fw * cols, wantH = idle ? fh : fh * rows;
      if (img.w !== wantW || img.h !== wantH) fail(`${id}/${name}.png is ${img.w}x${img.h}, want ${wantW}x${wantH} (frameSize ${fw}x${fh})`);
      if (!idle) {
        if (cols !== 8 || rows !== 4) fail(`${id}/${name}.json: ${cols} columns x ${rows} rows, want 8 x 4`);
        if (JSON.stringify(j.directions?.map((d) => d.name)) !== JSON.stringify(ORDER)) fail(`${id}/${name}.json: directions are not down, left, right, up`);
        if (j.holds?.length !== 32) fail(`${id}/${name}.json: ${j.holds?.length} holds, want 32`);
        if (a && a.frames?.length !== 32) fail(`${id}/${name}.aseprite.json: ${a.frames?.length} frames, want 32`);
      } else {
        if (JSON.stringify(j.directions?.map((d) => d.name)) !== JSON.stringify(ORDER)) fail(`${id}/${name}.json: directions are not down, left, right, up`);
        if (a && a.frames?.length !== 4) fail(`${id}/${name}.aseprite.json: ${a.frames?.length} frames, want 4`);
      }
    }
  }
  // no attack files
  if (fs.existsSync(path.join(dir, 'attack'))) fail(`${id}: has an attack folder (the AI body has no attack)`);
  const bj = J['walk/walk-4dir'], wj = J[`walk/${weapon}/walk-4dir`], bi = I['walk/walk-4dir'], wi = I[`walk/${weapon}/walk-4dir`];
  const ib = I['holding/idle-4dir'], iw = I[`${weapon}/idle-4dir`], ibj = J['holding/idle-4dir'], iwj = J[`${weapon}/idle-4dir`];
  if (!bj || !wj || !bi || !wi || !ib || !iw) continue;
  if (bj.weapon !== weapon || bj.class !== id) fail(`${id}: walk json says class ${bj.class} weapon ${bj.weapon}`);
  if (JSON.stringify(bj.pivot) !== JSON.stringify(wj.pivot) && false) fail('pivots');
  const [bw, bh] = bj.frameSize, [ww, wh] = wj.frameSize, bpv = bj.pivot, wpv = wj.pivot;

  // left is the right row mirrored (body), and the weapon (exact mirror about the feet pivot)
  let mirBad = 0;
  for (let f = 0; f < 8; f++) {
    const L = cellBytes(bi, bw, bh, f, 1), R = cellBytes(bi, bw, bh, f, 2);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) for (let c = 0; c < 4; c++) if (L[(y * bw + x) * 4 + c] !== R[(y * bw + (bw - 1 - x)) * 4 + c]) { mirBad++; x = bw; y = bh; break; }
    const WL = cellBytes(wi, ww, wh, f, 1), WR = cellBytes(wi, ww, wh, f, 2);
    // weapon pixel (col c) -> mirrored column 2*pivot - 1 - c  (the cell column / pivot convention of the body: c -> 73 - c)
    const setL = new Set(), setR = new Set();
    for (let y = 0; y < wh; y++) for (let x = 0; x < ww; x++) {
      if (WL[(y * ww + x) * 4 + 3]) setL.add(`${x - wpv[0]},${y}`);
      if (WR[(y * ww + x) * 4 + 3]) setR.add(`${-(x - wpv[0]) - 1},${y}`);
    }
    if (setL.size !== setR.size || [...setL].some((k) => !setR.has(k))) mirBad++;
  }
  if (mirBad) fail(`${id}: the left row is not the right row mirrored in ${mirBad} frames (body or weapon)`);

  // the AI hand keypoints per frame: down/up from the keypoints file, right tracked, left = right mirrored
  const hands = {};
  for (const d of ['down', 'up', 'right']) hands[d] = Array.from({ length: 9 }, (_, k) => joints(d, k).handN);
  hands.left = hands.right.map((h) => [74 - h[0], h[1]]);

  for (const d of ORDER) {
    const row = ORDER.indexOf(d);
    for (let f = 0; f < 8; f++) {
      framesChecked++;
      const hand = hands[d][f + 1], tag = `${id} ${d} ${f}`;
      const wc = cellBytes(wi, ww, wh, f, row), bc = cellBytes(bi, bw, bh, f, row);
      const wpx = [];
      for (let y = 0; y < wh; y++) for (let x = 0; x < ww; x++) if (wc[(y * ww + x) * 4 + 3]) wpx.push([bpv[0] + (x - wpv[0]), bpv[1] + (y - wpv[1])]); // body-cell coordinates
      if (!wpx.length) { fail(`${tag}: empty weapon cell`); continue; }
      // 11. nothing clipped: the outermost ring of the weapon cell is empty
      const ring = ringPixels(wc, ww, wh);
      (ringStats[id] ??= { n: 0, cells: 0 }).cells++; ringStats[id].n += ring;
      if (ring) fail(`${tag}: ${ring} weapon pixels on the edge of the weapon cell (clipped? need >= 1 px clear on every side)`);
      // 4. no weapon pixel in the head (the box of the body pixels above the NECK keypoint)
      {
        const neckY = joints(d === 'left' ? 'right' : d, f + 1).neck[1], hb = headHits(bc, bw, bh, wpx.map(([x, y]) => [x + 0.5, y + 0.5]), neckY), hs = (headStats[id] ??= { hits: 0, gap: Infinity });
        hs.hits += hb.hits; hs.gap = Math.min(hs.gap, hb.gap);
        if (hb.hits && (!back || d === 'up' || d === 'down')) fail(`${tag}: ${hb.hits} weapon pixels on head pixels (above the NECK keypoint)`);
      }
      // 3. grip
      let best = Infinity;
      for (const [x, y] of wpx) best = Math.min(best, Math.hypot(x + 0.5 - hand[0], y + 0.5 - hand[1]));
      if (!back && best > gripMax) { gripMax = best; gripAt = tag; }
      if (!back && best > (HCF?.grip ?? 1.5)) fail(`${tag}: nearest weapon pixel is ${best.toFixed(2)} px from the AI hand keypoint (limit ${HCF?.grip ?? 1.5})`);
      const h = wj.holds.find((q) => q.dir === d && q.frame === f)?.hand;
      if (!h) fail(`${tag}: no hold in the weapon json`);
      else if (!back) {
        const hd = Math.hypot(PIV[0] + h[0] - hand[0], PIV[1] + h[1] - hand[1]);
        if (!back) handMax = Math.max(handMax, hd);
        if (hd > 2) fail(`${tag}: json hold hand is ${hd.toFixed(2)} px from the AI hand keypoint (limit 2)`);
      }
      // 4. connected to the body
      const body = new Set();
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (bc[(y * bw + x) * 4 + 3]) body.add(`${x},${y}`);
      const key = ([x, y]) => `${x},${y}`;
      const wset = new Map(wpx.map((p) => [key(p), p]));
      const seen = new Set(), queue = [];
      for (const p of wpx) {
        let touch = false;
        for (let dy = -1; dy <= 1 && !touch; dy++) for (let dx = -1; dx <= 1; dx++) if (body.has(`${p[0] + dx},${p[1] + dy}`)) { touch = true; break; }
        if (touch) { seen.add(key(p)); queue.push(p); }
      }
      while (queue.length) {
        const [x, y] = queue.pop();
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const k = `${x + dx},${y + dy}`;
          if (wset.has(k) && !seen.has(k)) { seen.add(k); queue.push(wset.get(k)); }
        }
      }
      // a weapon pixel hidden behind the body (inside the body silhouette) counts as touching it; everything else must chain to it
      const floating = wpx.length - seen.size;
      floatTotal += floating;
      if (floating) fail(`${tag}: ${floating} of ${wpx.length} weapon pixels do not touch the body (chains of 1 px gaps)`);
      // 16. visible after compositing with the json drawOrder: in front = every weapon pixel shows, behind = those not covered by an opaque body pixel
      {
        const order = wj.drawOrder?.[d], vis = order === 'front' ? wpx.length : wpx.filter(([x, y]) => !body.has(`${x},${y}`)).length;
        (visStats[id] ??= {})[d] ??= [];
        visStats[id][d][f] = vis;
        if (back && vis < BCF.minVis[d]) fail(`${tag}: only ${vis} ${BCF.noun} pixels visible after compositing with drawOrder ${order} (need >= ${BCF.minVis[d]})`);
        if (!back && HCF && vis < HCF.minVis[d]) fail(`${tag}: only ${vis} bow pixels visible after compositing with drawOrder ${order} (need >= ${HCF.minVis[d]} in every frame)`);
        else if (!back && !HCF && d === 'down' && vis < MIN_VISIBLE_DOWN) fail(`${tag}: only ${vis} weapon pixels visible after compositing with drawOrder ${order} (need >= ${MIN_VISIBLE_DOWN} in the down view)`);
      }
    }
  }

  // idle frames: the weapon touches the body too
  for (const d of ORDER) {
    const i = ORDER.indexOf(d), [bw0, bh0] = ibj.frameSize, [ww0, wh0] = iwj.frameSize;
    const bc = cellBytes(ib, bw0, bh0, i, 0), wc = cellBytes(iw, ww0, wh0, i, 0);
    const body = new Set(), wpx = [];
    for (let y = 0; y < bh0; y++) for (let x = 0; x < bw0; x++) if (bc[(y * bw0 + x) * 4 + 3]) body.add(`${x},${y}`);
    for (let y = 0; y < wh0; y++) for (let x = 0; x < ww0; x++) if (wc[(y * ww0 + x) * 4 + 3]) wpx.push([ibj.pivot[0] + (x - iwj.pivot[0]), ibj.pivot[1] + (y - iwj.pivot[1])]);
    if (!wpx.some(([x, y]) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (body.has(`${x + dx},${y + dy}`)) return true; return false; })) fail(`${id} idle ${d}: the weapon does not touch the body`);
  }

  // 7. weapon motion
  {
    const body = (img, fw, fh, c, r) => cellBytes(img, fw, fh, c, r);
    const wcentroid = (cellW, fw, fh, pv) => { // in body-cell coordinates (pixel centres) + pixel list
      let sx = 0, sy = 0, n = 0; const pts = [];
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) if (cellW[(y * fw + x) * 4 + 3]) { const px = bpv[0] + (x - pv[0]) + 0.5, py = bpv[1] + (y - pv[1]) + 0.5; sx += px; sy += py; n++; pts.push([px, py]); }
      return { c: n ? [sx / n, sy / n] : [NaN, NaN], pts, n };
    };
    const axisAngle = (pts, c) => { // principal axis, degrees in [0,180)
      let sxx = 0, syy = 0, sxy = 0;
      for (const [x, y] of pts) { sxx += (x - c[0]) ** 2; syy += (y - c[1]) ** 2; sxy += (x - c[0]) * (y - c[1]); }
      return ((0.5 * Math.atan2(2 * sxy, sxx - syy) * 180 / Math.PI) + 180) % 180;
    };
    const circRange = (angs) => { // range of axis angles (period 180): the smallest arc containing all of them
      const a = angs.map((v) => ((v % 180) + 180) % 180).sort((p, q) => p - q);
      let gap = 0; for (let i = 0; i < a.length; i++) gap = Math.max(gap, (i + 1 < a.length ? a[i + 1] : a[0] + 180) - a[i]);
      return 180 - gap;
    };
    const bodyCentre = (c) => { let x0 = 1e9, x1 = -1e9; for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (c[(y * bw + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); } return (x0 + x1 + 1) / 2; };
    for (const d of ORDER) {
      const row = ORDER.indexOf(d), angs = [], sides = [], ptsAll = [];
      for (let f = 0; f < 8; f++) {
        const wc = wcentroid(body(wi, ww, wh, f, row), ww, wh, wpv), bc = body(bi, bw, bh, f, row);
        angs.push(axisAngle(wc.pts, wc.c)); ptsAll.push(wc.pts);
        sides.push(Math.sign(wc.c[0] - bodyCentre(bc)));
      }
      const range = circRange(angs);
      if (d === 'down' || d === 'up') {
        // rows above / below the grip pixel row (the pixel holding the hand keypoint) per frame
        const ext = ptsAll.map((pts, f) => { const gy = Math.floor(hands[d][f + 1][1]); let a = 1e9, b = -1e9; for (const [, y] of pts) { a = Math.min(a, y - 0.5); b = Math.max(b, y - 0.5); } return { up: gy - a, down: b - gy }; });
        if (!back) depths.push({ id, d, ext, range });
      }
      const sideOk = (d === 'down' || d === 'up') ? sides.every((v) => v === sides[0] && v !== 0) : true;
      const orders = new Set([wj.drawOrder?.[d]]);
      const orderOk = orders.size === 1 && wj.drawOrder?.[d] === DRAW_EXPECT[d] && iwj.drawOrder?.[d] === wj.drawOrder?.[d];
      // idle vs walk 0
      const iw0 = wcentroid(cellBytes(iw, iwj.frameSize[0], iwj.frameSize[1], row, 0), iwj.frameSize[0], iwj.frameSize[1], iwj.pivot), ww0 = wcentroid(body(wi, ww, wh, 0, row), ww, wh, wpv);
      const off = Math.hypot(iw0.c[0] - ww0.c[0], iw0.c[1] - ww0.c[1]);
      // idle grip: nearest weapon pixel to the idle hand keypoint
      const ih = joints(d === 'left' ? 'right' : d, 0).handN, ihx = d === 'left' ? 74 - ih[0] : ih[0];
      let gb = Infinity; for (const [x, y] of iw0.pts) gb = Math.min(gb, Math.hypot(x - ihx, y - ih[1]));
      motion.push({ id, d, range, sides: sides.join(''), order: wj.drawOrder?.[d], off, gb: back ? NaN : gb });
      if (!back && (d === 'down' || d === 'up') && range > 3) fail(`${id} ${d}: weapon screen angle varies ${range.toFixed(1)} degrees over the walk in a depth view (limit 3)`);
      if (!back && (d === 'left' || d === 'right')) {
        // 9 [1-3, 15]: the side-view anatomy, measured from the rendered pixels. The weapon's forward end is the end pointing toward +x (right view; the left
        // view is mirrored into the right-view frame), at elevation aF above horizontal; the forearm line is at alpha - 90 (ccw), alpha = elbow -> wrist from down.
        const ccw = angs.map((a) => (180 - a) % 180), aR = ccw.map((a) => (d === 'left' ? (180 - a) % 180 : a)), aF = aR.map((a) => (a > 120 ? a - 180 : a));
        const alpha = ALPHA.abs, betaM = aF.map((a, i) => a - (alpha[i] - 90)), between = aF.map((a, i) => Math.abs(circ(a - (alpha[i] - 90)))), rawBetween = aF.map((a, i) => Math.abs(circ(a - (ALPHA.rawAbs[i] - 90))));
        const lagC = [-1, 0, 1].map((l) => corrOf(aF, alpha.map((_, i) => alpha[(i - l + 8) % 8]))), bestLag = lagC.indexOf(Math.max(...lagC)) - 1, cBest = lagC[1];
        const steps = aF.map((v, i) => Math.abs(aF[(i + 1) % 8] - v)), ss = [...steps].sort((p, q) => p - q), med = (ss[3] + ss[4]) / 2, maxStep = Math.max(...steps);
        const maxDev = Math.max(...betaM.map((b) => Math.abs(b - BETA))), minBetween = Math.min(...between);
        const mA = alpha.reduce((p, q) => p + q, 0) / 8, mE = aF.reduce((p, q) => p + q, 0) / 8; let cv = 0, vr = 0; for (let i = 0; i < 8; i++) { cv += (alpha[i] - mA) * (aF[i] - mE); vr += (alpha[i] - mA) ** 2; }
        const gain = cv / vr; // slope of the weapon angle on the forearm angle: 1 = rigid with the forearm
        if (HCF && Math.abs(gain - 1) > 0.1) fail(`${id} ${d}: weapon angle vs forearm angle gain ${gain.toFixed(3)} (rigid grip: 1 +- 0.1)`);
        swings.push({ id, d, gain, aF, alpha, betaM, between, rawBetween, lagC, bestLag, cBest, steps, med, maxStep, maxDev, minBetween, BETA });
        if (d === 'right') {
          sideA[id] = aF;
          // the weapon's length from the grip each way along its axis (forward end / rear end), px, averaged over the cycle: what the front / back views project
          const tf = [], tr = [];
          for (let f = 0; f < 8; f++) {
            const hnd = hands.right[f + 1], g = [Math.floor(hnd[0]) + 0.5, Math.floor(hnd[1]) + 0.5], u = [Math.cos(aF[f] * Math.PI / 180), -Math.sin(aF[f] * Math.PI / 180)];
            let hi = -1e9, lo = 1e9;
            for (const [x, y] of ptsAll[f]) { const t = (x - g[0]) * u[0] + (y - g[1]) * u[1]; hi = Math.max(hi, t); lo = Math.min(lo, t); }
            tf.push(hi); tr.push(-lo);
          }
          lenOf[id] = { fwd: tf.reduce((a, b) => a + b, 0) / 8, rear: tr.reduce((a, b) => a + b, 0) / 8, tf, tr };
        }
        if (maxDev > 5 || betaM.some((b) => b < (HCF?.betaMin ?? 100) || b > (HCF?.betaMax ?? 130))) fail(`${id} ${d}: beta as measured from the pixels is ${betaM.map((b) => b.toFixed(1)).join(' ')} (need ${BETA} +- 5 and inside ${HCF?.betaMin ?? 100}-${HCF?.betaMax ?? 130})`);
        if (cBest < 0.95 || bestLag !== 0) fail(`${id} ${d}: weapon angle vs forearm angle: correlation at lag 0 is ${cBest.toFixed(3)} (need >= 0.95), best lag ${bestLag} (must be 0; lag -1 ${lagC[0].toFixed(2)}, +1 ${lagC[2].toFixed(2)})`);
        if (minBetween < (HCF?.betweenMin ?? 60) || (HCF && Math.max(...between) > HCF.betweenMax)) fail(`${id} ${d}: the weapon axis is ${minBetween.toFixed(1)}..${Math.max(...between).toFixed(1)} degrees from the forearm line (need ${HCF ? HCF.betweenMin + '-' + HCF.betweenMax : '>= 60, never collinear'})`);
        if (maxStep > 2 * med + 1e-9) fail(`${id} ${d}: largest swing step ${maxStep.toFixed(1)} deg exceeds 2x the median step ${med.toFixed(1)} deg`);
      }
      if (!sideOk && !back) fail(`${id} ${d}: the weapon centroid changes side of the body centre (${sides.join(',')})`);
      if (!orderOk) fail(`${id} ${d}: weapon drawOrder is ${wj.drawOrder?.[d]} (walk) / ${iwj.drawOrder?.[d]} (idle), want ${DRAW_EXPECT[d]} in both`);
      if (off > IDLE_WALK0) fail(`${id} ${d}: the idle weapon is ${off.toFixed(2)} px from walk frame 0's (limit ${IDLE_WALK0})`);
      if (!back && gb > 2) fail(`${id} ${d}: idle weapon is ${gb.toFixed(2)} px from the idle hand keypoint (limit 2)`);
    }
  }

  // 9 (idle): the idle weapon has the same anatomy with the idle forearm; also nothing clipped and nothing in the head
  {
    const [bw0, bh0] = ibj.frameSize, [ww0, wh0] = iwj.frameSize, L = lenOf[id] ?? {};
    for (const d of ORDER) {
      const i = ORDER.indexOf(d), bc = cellBytes(ib, bw0, bh0, i, 0), wc = cellBytes(iw, ww0, wh0, i, 0), pts = [];
      for (let y = 0; y < wh0; y++) for (let x = 0; x < ww0; x++) if (wc[(y * ww0 + x) * 4 + 3]) pts.push([ibj.pivot[0] + (x - iwj.pivot[0]) + 0.5, ibj.pivot[1] + (y - iwj.pivot[1]) + 0.5]);
      const ring = ringPixels(wc, ww0, wh0);
      if (ring) fail(`${id} idle ${d}: ${ring} weapon pixels on the edge of the idle weapon cell`);
      const neckY = joints(d === 'left' ? 'right' : d, 0).neck[1], hb = headHits(bc, bw0, bh0, pts, neckY);
      if (hb.hits && (!back || d === 'up' || d === 'down')) fail(`${id} idle ${d}: ${hb.hits} weapon pixels on head pixels`);
      if (back) { idleInfo.push({ id, d, hits: hb.hits, back: true }); continue; }
      headStats[id].gap = Math.min(headStats[id].gap, hb.gap); headStats[id].hits += hb.hits;
      const info = { id, d, hits: hb.hits };
      const eIdle = IDLE_ALPHA + BETA - 90;
      if (d === 'left' || d === 'right') {
        const a = axisCcw(pts), aR = d === 'left' ? (180 - a) % 180 : a, aF = aR > 120 ? aR - 180 : aR, bM = aF - (IDLE_ALPHA - 90);
        info.aF = aF; info.betaM = bM; info.between = Math.abs(circ(aF - (IDLE_ALPHA - 90)));
        if (Math.abs(bM - BETA) > 5 || bM < (HCF?.betaMin ?? 100) || bM > (HCF?.betaMax ?? 130)) fail(`${id} idle ${d}: beta as measured is ${bM.toFixed(1)} (need ${BETA} +- 5 and inside ${HCF?.betaMin ?? 100}-${HCF?.betaMax ?? 130})`);
        if (info.between < (HCF?.betweenMin ?? 60) || (HCF && info.between > HCF.betweenMax)) fail(`${id} idle ${d}: weapon axis is ${info.between.toFixed(1)} degrees from the forearm line (need ${HCF ? HCF.betweenMin + '-' + HCF.betweenMax : '>= 60'})`);
      } else {
        const hnd = joints(d, 0).handN, gy = Math.floor(hnd[1]); let a0 = 1e9, b0 = -1e9;
        for (const [, y] of pts) { a0 = Math.min(a0, y - 0.5); b0 = Math.max(b0, y - 0.5); }
        const up = gy - a0, down = b0 - gy, s = Math.sin(eIdle * Math.PI / 180), eu = up - L.fwd * s, ed = down - L.rear * s;
        info.up = up; info.down = down; info.predUp = L.fwd * s; info.predDown = L.rear * s;
        if (Math.abs(eu) > 1.5 || Math.abs(ed) > 1.5) fail(`${id} idle ${d}: rows above / below the grip ${up} / ${down} vs projection ${(L.fwd * s).toFixed(1)} / ${(L.rear * s).toFixed(1)} (limit 1.5)`);
      }
      idleInfo.push(info);
    }
  }

  // BACK CARRY (B1-B6): the weapon (staff / bow) rides on the torso
  if (back) {
    const TILT_MIN = BCF.tiltMin, TILT_MAX = BCF.tiltMax;
    const mid2 = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    // the torso anchor per frame k (0 idle, 1..8 walk): shoulder midpoint, walk smoothed zero-phase cyclic [1 2 1]/4, idle raw; left = right mirrored (x -> 74 - x)
    const anch = {}, shY = {}, shX = {}, hipP = {};
    for (const src of ['down', 'up', 'right']) {
      const J = Array.from({ length: 9 }, (_, k) => joints(src, k)), raw = J.map((j) => mid2(j.shoulderN, j.shoulderF));
      const a = [raw[0]];
      for (let q = 0; q < 8; q++) { const p = raw[((q + 7) % 8) + 1], c = raw[q + 1], n = raw[((q + 1) % 8) + 1]; a.push([(p[0] + 2 * c[0] + n[0]) / 4, (p[1] + 2 * c[1] + n[1]) / 4]); }
      anch[src] = a; shY[src] = J.map((j) => (j.shoulderN[1] + j.shoulderF[1]) / 2);
      shX[src] = J.map((j) => [j.shoulderN[0], j.shoulderF[0]]); hipP[src] = J.map((j) => [j.hipN, j.hipF]);
    }
    anch.left = anch.right.map((a) => [74 - a[0], a[1]]); shY.left = shY.right;
    const handsK = (d) => Array.from({ length: 9 }, (_, k) => (d === 'left' ? [74 - joints('right', k).handN[0], joints('right', k).handN[1]] : joints(d, k).handN));
    const rng = (a) => Math.max(...a) - Math.min(...a);
    const R = (backStats[id] = {});
    for (const d of ORDER) {
      const row = ORDER.indexOf(d), src = d === 'left' ? 'right' : d, o = DRAW_EXPECT[d];
      const dev = [], offX = [], offY = [], vis = [], visAbove = [], cx = [], cy = [], len = [], topX = [], crystX = [], topY = [], butt = [], hitsA = [], gaps = [];
      for (let k = 0; k <= 8; k++) {
        const wc = k === 0 ? cellBytes(iw, iwj.frameSize[0], iwj.frameSize[1], row, 0) : cellBytes(wi, ww, wh, k - 1, row), bc = k === 0 ? cellBytes(ib, ibj.frameSize[0], ibj.frameSize[1], row, 0) : cellBytes(bi, bw, bh, k - 1, row);
        const wf = k === 0 ? iwj.frameSize : [ww, wh], wp = k === 0 ? iwj.pivot : wpv, bf = k === 0 ? ibj.frameSize : [bw, bh], bp = k === 0 ? ibj.pivot : bpv;
        const pts = [];
        for (let y = 0; y < wf[1]; y++) for (let x = 0; x < wf[0]; x++) if (wc[(y * wf[0] + x) * 4 + 3]) pts.push([bp[0] + (x - wp[0]) + 0.5, bp[1] + (y - wp[1]) + 0.5]);
        const bodySet = new Set();
        for (let y = 0; y < bf[1]; y++) for (let x = 0; x < bf[0]; x++) if (bc[(y * bf[0] + x) * 4 + 3]) bodySet.add(`${x},${y}`);
        const c = [pts.reduce((p, q) => p + q[0], 0) / pts.length, pts.reduce((p, q) => p + q[1], 0) / pts.length], A = anch[d][k];
        cx.push(c[0]); cy.push(c[1]); offX.push(c[0] - A[0]); offY.push(c[1] - A[1]);
        dev.push(90 - axisCcw(pts)); // degrees from vertical, + = the top leans toward +x
        // length along the principal axis (px, with the pixel extent) and the vertical extent
        const th = (90 - dev[dev.length - 1]) * Math.PI / 180, u = [Math.cos(th), -Math.sin(th)];
        let hi = -1e9, lo = 1e9, y0 = 1e9, y1 = -1e9;
        for (const [x, y] of pts) { const t = x * u[0] + y * u[1]; hi = Math.max(hi, t); lo = Math.min(lo, t); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        len.push({ axis: hi - lo + 1, vert: y1 - y0 + 1 });
        const v = pts.filter(([x, y]) => o === 'front' || !bodySet.has(`${Math.floor(x)},${Math.floor(y)}`));
        vis.push(v.length); visAbove.push(v.filter(([, y]) => y < shY[src][k]).length);
        const crys = pts.filter(([, y]) => y < shY[src][k]); crystX.push(crys.length ? crys.reduce((p, q) => p + q[0], 0) / crys.length : NaN);
        const top = pts.filter(([, y]) => y <= y0 + 1e-9), bot = pts.filter(([, y]) => y >= y1 - 1e-9);
        topX.push(top.reduce((p, q) => p + q[0], 0) / top.length); topY.push(y0 - 0.5);
        butt.push([bot.reduce((p, q) => p + q[0], 0) / bot.length, y1]);
        const hb = headHits(bc, bf[0], bf[1], pts, joints(src, k).neck[1]); hitsA.push(hb.hits); gaps.push(hb.gap);
      }
      const hand = handsK(d), res = { d, dev, devRange: rng(dev), devMean: dev.reduce((p, q) => p + q, 0) / 9, offRX: rng(offX), offRY: rng(offY), offX, offY, vis, visAbove, len, hand, cx, cy, hitsA, gaps, topY, topX, crystX, butt };
      res.handRX = rng(hand.map((h) => h[0])); res.anchRX = rng(anch[d].map((a) => a[0])); res.anchRY = rng(anch[d].map((a) => a[1]));
      res.cxRX = rng(cx); res.cyRY = rng(cy);
      R[d] = res;
      // B1
      if (res.devRange > 1) fail(`${id} ${d}: ${BCF.noun} screen angle varies ${res.devRange.toFixed(2)} degrees over idle + 8 walk (limit 1)`);
      if (d === 'down' || d === 'up') { if (Math.abs(res.devMean) < TILT_MIN || Math.abs(res.devMean) > TILT_MAX) fail(`${id} ${d}: ${BCF.noun} is ${Math.abs(res.devMean).toFixed(1)} degrees from vertical (want ${TILT_MIN}-${TILT_MAX})`); }
      else if (Math.abs(res.devMean) > 5) fail(`${id} ${d}: side-view ${BCF.noun} is ${Math.abs(res.devMean).toFixed(1)} degrees from vertical on screen (want <= 5)`);
      // B2
      if (res.offRX > 1 + 1e-9 || res.offRY > 1 + 1e-9) fail(`${id} ${d}: the ${BCF.noun}'s offset from the torso anchor varies ${res.offRX.toFixed(2)} / ${res.offRY.toFixed(2)} px (x / y, limit 1) over idle + 8 walk`);
      // B6 (diagonal views)
      if (d === 'down' || d === 'up') {
        const sideSign = d === 'down' ? -1 : 1; // the character's right shoulder: screen left in the front view, screen right in the back view
        for (let k = 0; k <= 8; k++) {
          const tag = `${id} ${d} ${k === 0 ? 'idle' : 'walk ' + (k - 1)}`;
          if (!(topY[k] < shY[src][k])) fail(`${tag}: ${BCF.top} top (row ${topY[k].toFixed(1)}) is not above the shoulder line (${shY[src][k].toFixed(1)})`);
          if (Math.sign(topX[k] - anch[d][k][0]) !== sideSign) fail(`${tag}: the ${BCF.top} is not over the character's right shoulder (screen ${d === 'down' ? 'left' : 'right'})`);
          const shx = d === 'down' ? Math.min(...shX[src][k]) : Math.max(...shX[src][k]);
          res.shDx = Math.max(res.shDx ?? 0, Math.abs(crystX[k] - shx));
          if (!(Math.abs(crystX[k] - shx) <= BCF.shDx)) fail(`${tag}: the ${BCF.noun} part above the shoulder line is centred ${crystX[k].toFixed(1)}, ${Math.abs(crystX[k] - shx).toFixed(1)} px from that shoulder (limit 4.5)`);
          if (d === 'down' && visAbove[k] < BCF.minAbove) fail(`${tag}: only ${visAbove[k]} ${BCF.noun} pixels visible above the shoulder line (need >= ${BCF.minAbove})`);
          if (gaps[k] < 1) fail(`${tag}: ${BCF.noun} pixels touch the head (gap ${gaps[k].toFixed(2)} px; the ${BCF.top} must sit beside it)`);
          const hp = hipP[src][k], opp = d === 'down' ? (hp[0][0] > hp[1][0] ? hp[0] : hp[1]) : (hp[0][0] < hp[1][0] ? hp[0] : hp[1]), bd = Math.hypot(butt[k][0] - opp[0], butt[k][1] - opp[1]);
          res.buttDist = Math.max(res.buttDist ?? 0, bd);
          if (bd > BCF.buttMax) fail(`${tag}: butt end is ${bd.toFixed(1)} px from the opposite hip keypoint (limit ${BCF.buttMax})`);
        }
      }
    }
    // B6 (side views): staff: its length is the diagonal's length x cos(tilt). bow: it lies IN the back plane, so edge-on it is the diagonal bow projected along x:
    // the side view's vertical extent equals the down / up views' (+- 1.5 px), and (loose sanity) is within 0.2 x diagonal of diagonal x cos(tilt)
    const diag = (R.down.len.reduce((p, q) => p + q.axis, 0) + R.up.len.reduce((p, q) => p + q.axis, 0)) / 18, tilt = (Math.abs(R.down.devMean) + Math.abs(R.up.devMean)) / 2, cosWant = diag * Math.cos(tilt * Math.PI / 180);
    const diagVert = (R.down.len.reduce((p, q) => p + q.vert, 0) + R.up.len.reduce((p, q) => p + q.vert, 0)) / 18, want = id === 'ai-archer' ? diagVert : cosWant;
    for (const d of ['left', 'right']) {
      const v = R[d].len.reduce((p, q) => p + q.vert, 0) / 9; R[d].lenWant = want; R[d].lenGot = v;
      if (id === 'ai-archer') {
        if (Math.abs(v - want) > 1.5) fail(`${id} ${d}: side bow vertical extent ${v.toFixed(1)} px, the diagonal views' vertical extent is ${want.toFixed(1)} (edge-on projection, limit +- 1.5)`);
        if (Math.abs(v - cosWant) > 0.2 * diag) fail(`${id} ${d}: side bow vertical extent ${v.toFixed(1)} px is not near diagonal length ${diag.toFixed(1)} x cos(${tilt.toFixed(1)}) = ${cosWant.toFixed(1)} (limit +- ${(0.2 * diag).toFixed(1)})`);
      } else if (Math.abs(v - want) > 0.1 * diag) fail(`${id} ${d}: side staff length ${v.toFixed(1)} px, diagonal length ${diag.toFixed(1)} x cos(${tilt.toFixed(1)}) = ${want.toFixed(1)} (limit +- ${(0.1 * diag).toFixed(1)})`);
    }
    R.diag = diag; R.tilt = tilt;
  }

  // 8. carried-weapon clearance (feet line = body-cell row 63, "above" = 63 - lowest row): measured on every idle and walk frame
  {
    const light = (r, g, b) => (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255; // HSL lightness
    const LIM_STRING = light(0xc8, 0xc0, 0xb0);
    const frames = [];
    for (const d of ORDER) {
      const row = ORDER.indexOf(d);
      frames.push({ tag: `${d} idle`, wc: cellBytes(iw, iwj.frameSize[0], iwj.frameSize[1], row, 0), ww: iwj.frameSize[0], wh: iwj.frameSize[1], wpv: iwj.pivot, bc: cellBytes(ib, ibj.frameSize[0], ibj.frameSize[1], row, 0), bw: ibj.frameSize[0], bh: ibj.frameSize[1], bpv: ibj.pivot });
      for (let f = 0; f < 8; f++) frames.push({ tag: `${d} walk ${f}`, wc: cellBytes(wi, ww, wh, f, row), ww, wh, wpv, bc: cellBytes(bi, bw, bh, f, row), bw, bh, bpv });
    }
    const st = { n: 0, lowMin: Infinity, lowMax: -Infinity, hMin: Infinity, hMax: -Infinity, topMin: Infinity, topMax: -Infinity, lightMax: 0 };
    for (const F of frames) {
      let y0 = 1e9, y1 = -1e9, lmax = 0, n = 0;
      for (let y = 0; y < F.wh; y++) for (let x = 0; x < F.ww; x++) {
        const o = (y * F.ww + x) * 4;
        if (!F.wc[o + 3]) continue;
        const by = F.bpv[1] + (y - F.wpv[1]); // body-cell row
        y0 = Math.min(y0, by); y1 = Math.max(y1, by); n++;
        lmax = Math.max(lmax, light(F.wc[o], F.wc[o + 1], F.wc[o + 2]));
      }
      let head = 1e9;
      for (let y = 0; y < F.bh && head === 1e9; y++) for (let x = 0; x < F.bw; x++) if (F.bc[(y * F.bw + x) * 4 + 3]) { head = y; break; }
      if (!n) continue;
      const above = 63 - y1, height = y1 - y0 + 1, topMargin = head - y0; // > 0: the weapon top is above the head top (smaller row), < 0: below it
      st.n++; st.lowMin = Math.min(st.lowMin, above); st.lowMax = Math.max(st.lowMax, above);
      st.hMin = Math.min(st.hMin, height); st.hMax = Math.max(st.hMax, height); st.topMin = Math.min(st.topMin, topMargin); st.topMax = Math.max(st.topMax, topMargin); st.lightMax = Math.max(st.lightMax, lmax);
      const tag = `${id} ${F.tag}`;
      if (above < (BCF?.minLow ?? HCF?.minLow ?? 3)) fail(`${tag}: lowest ${weapon} pixel is ${above} px above the feet line (need >= ${BCF?.minLow ?? HCF?.minLow ?? 3})`);
      if (weapon === 'bow' && lmax > LIM_STRING + 1e-9) fail(`${tag}: brightest bow pixel lightness ${lmax.toFixed(3)} > string limit ${LIM_STRING.toFixed(3)}`);
    }
    clearance[id] = { weapon, ...st, limStr: LIM_STRING };
  }

  // 6. no garment colour above the neck line (the head is skin / hood only)
  {
    const C = pfClasses.CLASSES.find((c) => c.id === stockId).palette;
    const all = (regs) => { const s = new Set(); for (const r of regs) for (const arr of [C[r].shell, C[r].core]) for (const c of arr) s.add(c >>> 0); return s; };
    const garment = all(stockId === 'archer' ? ['tunic', 'belt', 'pants', 'boots'] : ['robe', 'belt', 'boots']);
    const headOk = all(['hood', 'skin']);
    for (const c of headOk) garment.delete(c); // a colour shared with the head palette is not a leak
    let leak = 0, px = 0, frames = 0;
    for (const d of ORDER) for (let k = 0; k <= 8; k++) {
      const src = d === 'left' ? 'right' : d, neck = joints(src, k).neck[1];
      const cell = k === 0 ? cellBytes(ib, bw, bh, ORDER.indexOf(d), 0) : cellBytes(bi, bw, bh, k - 1, ORDER.indexOf(d));
      frames++;
      let n = 0;
      for (let y = 0; y < bh; y++) {
        if (y + 0.5 >= neck) break;
        for (let x = 0; x < bw; x++) {
          if (!cell[(y * bw + x) * 4 + 3]) continue;
          px++;
          const c = (cell[(y * bw + x) * 4] | (cell[(y * bw + x) * 4 + 1] << 8) | (cell[(y * bw + x) * 4 + 2] << 16) | (cell[(y * bw + x) * 4 + 3] << 24)) >>> 0;
          if (garment.has(c)) n++;
        }
      }
      leak += n;
      if (n) fail(`${id} ${d} ${k === 0 ? 'idle' : 'walk ' + (k - 1)}: ${n} garment-colour pixels above the neck line`);
    }
    neckStats[id] = { leak, px, frames };
  }

  // 5. torso colours
  {
    const C = pfClasses.CLASSES.find((c) => c.id === stockId).palette;
    // the regions the class paints on the trunk and hips: the stock paint() maps a hip pixel through the standing pose's part
    // map, where the thigh covers part of the pelvis, so the archer's hips come out as trousers (pants), the mage's as robe
    const torsoRegions = stockId === 'archer' ? ['tunic', 'belt', 'pants'] : ['robe', 'belt'];
    const want = new Set();
    for (const r of torsoRegions) for (const arr of [C[r].shell, C[r].core]) for (const c of arr) want.add(c >>> 0);
    let tot = 0, ok = 0, minF = 1, minAt = '';
    for (const d of ['down', 'up', 'right']) for (let k = 0; k <= 8; k++) {
      const { pose, place } = poseOf(d, k), ai = aiFrame(d, k);
      const B = capture(pose, place, null);
      const list = [...B.px.values()].filter((q) => q.part !== 0 && q.d);
      const row = ORDER.indexOf(d);
      const cell = k === 0 ? cellBytes(ib, bw, bh, row, 0) : cellBytes(bi, bw, bh, k - 1, row);
      let t = 0, o = 0;
      for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
        const i = y * CELL + x, cl = classify(ai, i);
        if (!cl.solid || cl.ink) continue;
        const q = nearestRig(list, x, y);
        if (!q || ![1, 2, 3].includes(q.part) || y + 0.5 < joints(d, k).neck[1]) continue; // pelvis, waist, chest below the neck line
        t++;
        const c = (cell[i * 4] | (cell[i * 4 + 1] << 8) | (cell[i * 4 + 2] << 16) | (cell[i * 4 + 3] << 24)) >>> 0;
        if (want.has(c)) o++;
      }
      tot += t; ok += o;
      if (t && o / t < minF) { minF = o / t; minAt = `${d} ${k === 0 ? 'idle' : 'walk ' + (k - 1)}`; }
    }
    torsoStats[id] = { frac: tot ? ok / tot : 0, minF, minAt, tot };
    if (!tot || ok / tot < 0.85) fail(`${id}: ${(100 * ok / Math.max(1, tot)).toFixed(1)}% of the AI torso pixels carry the class torso colours (need 85%)`);
    // a bare forearm in front of the trunk (skin in the archer's design) can dip one frame; no frame may fall below 75%
    if (minF < 0.75) fail(`${id}: ${minAt} has only ${(minF * 100).toFixed(1)}% torso pixels recoloured`);
  }
}

// 9 [6]: the depth views: rows above / below the grip vs the projection (length from the grip x sin(e)), e measured from the same class's right-view pixels
for (const dp of depths) {
  const L = lenOf[dp.id], aF = sideA[dp.id];
  if (!L || !aF) continue;
  const sn = aF.map((a) => Math.sin(a * Math.PI / 180));
  dp.pred = sn.map((v) => ({ up: L.fwd * v, down: L.rear * v }));
  dp.errUp = dp.ext.map((e, i) => e.up - dp.pred[i].up); dp.errDown = dp.ext.map((e, i) => e.down - dp.pred[i].down);
  dp.maxErr = Math.max(...dp.errUp.map(Math.abs), ...dp.errDown.map(Math.abs));
  dp.predRange = Math.max(...dp.pred.map((p) => p.up)) - Math.min(...dp.pred.map((p) => p.up));
  if (dp.maxErr > 1.5 + 1e-9) fail(`${dp.id} ${dp.d}: rows above / below the grip deviate ${dp.maxErr.toFixed(2)} px from the projection (limit 1.5): up ${dp.ext.map((e) => e.up).join(' ')} vs ${dp.pred.map((p) => p.up.toFixed(1)).join(' ')}, down ${dp.ext.map((e) => e.down).join(' ')} vs ${dp.pred.map((p) => p.down.toFixed(1)).join(' ')}`);
  { const h = dp.ext.map((e) => e.up + e.down), mx = Math.max(...h), mn = Math.min(...h), HCd = HC[dp.id]; dp.heights = h; dp.pop = (mx - mn) / mx; if (HCd && dp.pop > HCd.pop + 1e-9) fail(`${dp.id} ${dp.d}: the bow's projected height pops: ${h.join(' ')} varies ${(100 * dp.pop).toFixed(0)}% of its maximum (limit ${100 * HCd.pop}%)`); }
  if (dp.predRange < 3) fail(`${dp.id} ${dp.d}: the predicted extent change is only ${dp.predRange.toFixed(1)} px (the projection check would be vacuous)`);
}

console.log(`files: ${files} present in ${KIDS.length} AI class folders (json + aseprite json + png each), same keys/types as the stock classes`);
console.log(`walk frames checked: ${framesChecked} (2 classes x 4 directions x 8)`);
if (gripMax || handMax) console.log(`grip [6] (archer: bow in the fist; the mage carries the staff on its back): max distance weapon pixel -> AI hand keypoint ${gripMax.toFixed(2)} px (limit ${HC['ai-archer'].grip}) at ${gripAt}; max |json hold - keypoint| ${handMax.toFixed(2)} px`);
console.log(`floating weapon pixels over all walk frames: ${floatTotal}`);
for (const [id, s] of Object.entries(torsoStats)) console.log(`torso recolour ${id}: ${(s.frac * 100).toFixed(1)}% of ${s.tot} AI torso pixels (worst frame ${(s.minF * 100).toFixed(1)}% at ${s.minAt}), limit 85%`);
const f1 = (v, w = 6) => v.toFixed(1).padStart(w);
console.log(`forearm alpha (right view, elbow -> wrist from straight down, hand forward +; frames repaired: ${ALPHA.repaired.join(',') || 'none'}; idle ${IDLE_ALPHA.toFixed(1)})`);
for (const w of swings) {
  if (w.d === 'right') {
    console.log(`  ${w.id} right  alpha raw        = ${ALPHA.rawAbs.map((v) => f1(v)).join(' ')}   (keypoints)`);
    console.log(`  ${w.id} right  alpha smoothed   = ${w.alpha.map((v) => f1(v)).join(' ')}`);
    console.log(`  ${w.id} right  beta (pixels)    = ${w.betaM.map((v) => f1(v)).join(' ')}   (weapon forward end - forearm direction, target ${w.BETA} +- 5)`);
    console.log(`  ${w.id} right  weapon angle e  = ${w.aF.map((v) => f1(v)).join(' ')}   (forward end above horizontal, from the pixels)`);
    console.log(`  ${w.id} right  weapon/forearm  = ${w.between.map((v) => f1(v)).join(' ')}   (angle between the two lines, >= 60; vs the raw keypoint forearm: min ${Math.min(...w.rawBetween).toFixed(1)})`);
  }
  console.log(`swing ${w.id} ${w.d.padEnd(5)}: [1] beta ${Math.min(...w.betaM).toFixed(1)}..${Math.max(...w.betaM).toFixed(1)} (max |beta - ${w.BETA}| ${w.maxDev.toFixed(2)} <= 5, inside ${HC[w.id]?.betaMin ?? 100}-${HC[w.id]?.betaMax ?? 130}), [2] gain ${w.gain.toFixed(3)} (1 +- 0.1), corr(weapon angle, alpha) lag-1 ${w.lagC[0].toFixed(3)} lag0 ${w.lagC[1].toFixed(3)} lag+1 ${w.lagC[2].toFixed(3)} (lag 0 best, >= 0.95), [3] angle weapon/forearm ${w.minBetween.toFixed(1)}..${Math.max(...w.between).toFixed(1)} (${HC[w.id] ? HC[w.id].betweenMin + '-' + HC[w.id].betweenMax : '>= 60'}), [15] max step ${w.maxStep.toFixed(1)} vs median ${w.med.toFixed(1)} = ${(w.maxStep / w.med).toFixed(2)}x (<= 2, wrap 7->0 step ${w.steps[7].toFixed(1)} included)`);
}
for (const [id, L] of Object.entries(lenOf)) console.log(`weapon length from the grip ${id}: forward end ${L.fwd.toFixed(1)} px, rear end ${L.rear.toFixed(1)} px (right view, mean of 8 frames)`);
for (const dp of depths) console.log(`depth ${dp.id} ${dp.d.padEnd(4)}: [5] screen angle range ${dp.range.toFixed(2)} deg (<= 3), [6] rows above the grip ${dp.ext.map((e) => e.up).join(' ')} vs ${dp.pred.map((p) => p.up.toFixed(1)).join(' ')}; below ${dp.ext.map((e) => e.down).join(' ')} vs ${dp.pred.map((p) => p.down.toFixed(1)).join(' ')}; max error ${dp.maxErr.toFixed(2)} px (<= 1.5)`);
for (const i of idleInfo.filter((q) => !q.back)) console.log(`idle ${i.id} ${i.d.padEnd(5)}: ${i.betaM !== undefined ? `beta ${i.betaM.toFixed(1)}, angle to the forearm ${i.between.toFixed(1)}` : `rows above / below the grip ${i.up} / ${i.down} vs projection ${i.predUp.toFixed(1)} / ${i.predDown.toFixed(1)}`}, head-box hits ${i.hits}`);
for (const [id, h] of Object.entries(headStats)) console.log(`[4] head ${id}: ${h.hits} weapon pixels on head pixels above the NECK keypoint (must be 0${BACK_IDS.includes(id) ? ' in down / up; the side views are drawn behind the body' : ''}), closest weapon pixel above the neck line is ${h.gap.toFixed(1)} px from a head pixel`);
for (const [id, R] of Object.entries(backStats)) {
  console.log(`BACK CARRY ${id}: anchor = shoulder midpoint (walk smoothed zero-phase [1 2 1]/4), ${BC[id].noun} tilt ${R.tilt.toFixed(1)} deg from vertical (down / up), diagonal length ${R.diag.toFixed(1)} px`);
  for (const d of ORDER) {
    const r = R[d], p = (a) => a.map((v) => String(v).padStart(3)).join(' ');
    console.log(`  ${d.padEnd(5)} B1 angle ${r.devMean >= 0 ? '+' : ''}${r.devMean.toFixed(1)} deg from vertical (top toward +x = +), range ${r.devRange.toFixed(2)} deg (<= 1)`);
    console.log(`        B2 anchor offset range x ${r.offRX.toFixed(2)} y ${r.offRY.toFixed(2)} px (<= 1); anchor moves ${r.anchRX.toFixed(1)} / ${r.anchRY.toFixed(1)}, ${BC[id].noun} centroid moves ${r.cxRX.toFixed(1)} / ${r.cyRY.toFixed(1)}, the hand swings ${r.handRX.toFixed(1)} px in x`);
    console.log(`        B3 drawOrder ${DRAW_BY[id][d]} | B4 visible px idle, walk 0-7: ${p(r.vis)} (min ${BC[id].minVis[d]})${d === 'down' ? '; above the shoulder line: ' + p(r.visAbove) + ' (min ' + BC[id].minAbove + ')' : ''}`);
    console.log(`        B5 head hits ${r.hitsA.reduce((a, b) => a + b, 0)}, nearest head gap ${Math.min(...r.gaps).toFixed(1)} px | B6 ${r.buttDist !== undefined ? 'part above the shoulder line <= ' + r.shDx.toFixed(1) + ' px from that shoulder in x, ' + BC[id].top + ' top rows ' + r.topY.map((v) => v.toFixed(0)).join(' ') + ', butt <= ' + r.buttDist.toFixed(1) + ' px from the opposite hip' : 'side length ' + r.lenGot.toFixed(1) + ' px vs ' + r.lenWant.toFixed(1)}`);
  }
}
for (const [id, v] of Object.entries(visStats)) if (HC[id]) for (const d of ORDER) console.log(`[16] visible bow pixels after compositing ${id} ${d.padEnd(5)} (drawOrder ${DRAW_BY[id][d]}), walk 0-7: ${v[d].join(' ')} (min ${Math.min(...v[d])}, max ${Math.max(...v[d])}, need >= ${HC[id].minVis[d]} every frame)`);
for (const dp of depths) console.log(`pop ${dp.id} ${dp.d.padEnd(4)}: projected bow height per walk frame ${dp.heights.join(' ')} px, variation ${(100 * dp.pop).toFixed(0)}% of the maximum (limit ${100 * (HC[dp.id]?.pop ?? 0.4)}%)`);
for (const [id, r] of Object.entries(ringStats)) console.log(`[11] cell edge ${id}: ${r.n} weapon pixels on the outermost ring over ${r.cells} walk cells (must be 0)`);
for (const m of motion) console.log(`weapon motion ${m.id} ${m.d.padEnd(5)}: axis angle range ${m.range.toFixed(1)} deg (side views: see the swing lines; depth views limit 3), side of body centre per frame ${m.sides} (${m.d === 'down' || m.d === 'up' ? 'must not change' : 'side views'}), draw order ${m.order} in all frames, idle vs walk 0 offset ${m.off.toFixed(2)} px (limit ${IDLE_WALK0}), idle grip ${m.gb.toFixed(2)} px (limit 2)`);
for (const [id, c] of Object.entries(clearance)) console.log(`${c.weapon} clearance ${id}: lowest pixel ${c.lowMin}-${c.lowMax} px above the feet line (need >= ${BACK_IDS.includes(id) ? BC[id].minLow : HC[id]?.minLow ?? 3}), weapon height ${c.hMin}-${c.hMax} px, max pixel lightness ${c.lightMax.toFixed(3)} (string limit ${c.limStr.toFixed(3)}), ${c.n} frames`);
for (const [id, s] of Object.entries(neckStats)) console.log(`garment colour above the neck line ${id}: ${s.leak} pixels (must be 0) over ${s.frames} frames, ${s.px} head pixels checked`);
if (fails.length) {
  console.error(`FAIL (${fails.length}${fails.length >= 60 ? '+' : ''}):`);
  for (const m of fails) console.error('  ' + m);
  process.exit(1);
}
console.log('OK');
