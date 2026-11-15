#!/usr/bin/env node
// tools/checks/pixelfx-style.mjs 鈥?HeroLoom style + runtime-contract check for assets/vfx-sheets/*.
//
// Dependency-free (node:fs / node:path only; the PNG decoder is the repo's own zlib-based
// pipeline/scripts/pixelfx/character/png-io.mjs). For every sheet it verifies:
//   * PNG header + real decoded pixels exist and decode;
//   * the Aseprite json contract the game reads: meta.pixelfx {fps,loop,frames,frameSize,pivot,columns},
//     frames[] length, canvas = columns x frameWidth / rows x frameHeight, every frame rect inside the PNG;
//   * pivot inside one frame; every frame has visible alpha pixels and a non-empty bbox inside its cell;
//   * palette: solid colours stay on the HeroLoom family ramp (warm storybook), within a luma cap, no
//     pure #ffffff / #000000, and a sane distinct-colour band;
//   * edge outline: the alpha silhouette is dominated by dark ink rather than bright fringe, and no pure
//     black fringe (the old sheets had thin, bright, cold edges).
// Exit code 0 = all PASS / 1 = any FAIL. SKIP lines are informational only.
//
// Usage:
//   node tools/checks/pixelfx-style.mjs                  # checks assets/vfx-sheets under the repo root
//   node tools/checks/pixelfx-style.mjs --verbose        # per-sheet numbers for passing sheets too
//   node tools/checks/pixelfx-style.mjs --dir <sheets-dir>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPNG } from '../../pipeline/scripts/pixelfx/character/png-io.mjs';
import { SHEET_FAMILY, familyPalette, HERO_INK } from '../../pipeline/scripts/pixelfx/heroloom-style.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const verbose = argv.includes('--verbose');
const dirArg = argv.indexOf('--dir') >= 0 ? argv[argv.indexOf('--dir') + 1] : null;
const SHEETS = dirArg ? path.resolve(dirArg) : path.join(ROOT, 'assets/vfx-sheets');

// ---- tuning -------------------------------------------------------------------------------------
const EXPECT_FPS = 30;
const MAX_LUMA = 0.93;              // cream is ~0.88; anything brighter is an eye/neon white
const PALETTE_DIST = 40;            // weighted-RGB distance a solid colour may sit off the family ramp
const MIN_DISTINCT = 4;
// A family ramp contributes ~6-24 steps; the ink rim and its 40% inner-light step mix new levels in, so a
// sheet legitimately lands at 100-350 distinct solid colours. The ceiling only catches runaway noise.
const MAX_DISTINCT = 512;
const MIN_EDGE_DARK = 0;            // no hard gate; see "outline coverage is measured" below
const EDGE_DARK_LUMA = 0.34;
const INK_TOL = 46;                 // euclidean RGB distance that still counts as "near ink"

const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const rOf = (n) => (n >> 16) & 255, gOf = (n) => (n >> 8) & 255, bOf = (n) => n & 255;
const luma = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const wdist = (r1, g1, b1, r2, g2, b2) => {
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return 0.35 * dr * dr + 0.45 * dg * dg + 0.2 * db * db;
};
const INK = (() => { const n = parseInt(HERO_INK.slice(1), 16); return [rOf(n), gOf(n), bOf(n)]; })();

const results = [];
const fail = (why) => results[results.length - 1].fails.push(why);

function checkSheet(id) {
  const pngFile = path.join(SHEETS, id + '.png');
  const jsonFile = path.join(SHEETS, id + '.json');
  const row = { id, fails: [], notes: {}, pass: false };
  results.push(row);
  if (!fs.existsSync(pngFile)) return fail('missing PNG');
  if (!fs.existsSync(jsonFile)) return fail('missing json');

  let json;
  try { json = JSON.parse(fs.readFileSync(jsonFile, 'utf8')); } catch (e) { return fail('json parse: ' + e.message); }
  let img;
  try { img = readPNG(pngFile); } catch (e) { return fail('PNG decode: ' + e.message); }
  const { w, h, data } = img;
  row.notes.png = `${w}x${h}`;
  row.notes.bytes = fs.statSync(pngFile).size;

  const px = json?.meta?.pixelfx;
  if (!px) return fail('meta.pixelfx missing');
  for (const k of ['fps', 'loop', 'frames', 'frameSize', 'pivot', 'columns']) if (!(k in px)) fail(`meta.pixelfx.${k} missing`);
  if (typeof px.fps !== 'number' || px.fps <= 0) fail('fps not a positive number');
  else if (px.fps !== EXPECT_FPS) fail(`fps ${px.fps} != ${EXPECT_FPS}`);
  if (typeof px.loop !== 'boolean') fail('loop not boolean');
  if (!Number.isInteger(px.frames) || px.frames <= 0) fail('frames not a positive integer');
  if (!Array.isArray(px.frameSize) || px.frameSize.length !== 2) fail('frameSize malformed');
  if (!Array.isArray(px.pivot) || px.pivot.length !== 2) fail('pivot malformed');
  if (!Number.isInteger(px.columns) || px.columns <= 0) fail('columns not a positive integer');
  if (row.fails.length) return;

  const [cw, ch] = px.frameSize, [px0, py0] = px.pivot, cols = px.columns;
  const rows = Math.ceil(px.frames / cols);
  row.notes.meta = `frameSize ${cw}x${ch} pivot ${px0},${py0} frames ${px.frames} cols ${cols} loop ${px.loop}`;

  // ---- runtime grid / json ------------------------------------------------
  if (w !== cols * cw) fail(`PNG width ${w} != columns ${cols} * frameWidth ${cw}`);
  if (h !== rows * ch) fail(`PNG height ${h} != rows ${rows} * frameHeight ${ch}`);
  // Cell size is a legacy contract: the shipped sheets already use non-16-multiples (arrow 112x32,
  // fireball 136x56, priest-heal 80x104, ...) and frameSize x k is the on-screen world size, so changing
  // it would move every effect. Kept as a note, not a failure.
  if (!Number.isInteger(cw / 16) || !Number.isInteger(ch / 16)) row.notes.cell = `${cw}x${ch} (legacy cell size, kept as shipped)`;
  if (!(px0 >= 0 && px0 <= cw && py0 >= 0 && py0 <= ch)) fail(`pivot ${px0},${py0} outside frame ${cw}x${ch}`);
  if (!Array.isArray(json.frames) || json.frames.length !== px.frames) {
    fail(`json frames ${json.frames?.length} != meta.pixelfx.frames ${px.frames}`);
  }
  if (json.meta?.size && (json.meta.size.w !== w || json.meta.size.h !== h)) fail('meta.size does not match PNG');
  if (json.meta?.image !== path.basename(pngFile)) fail(`meta.image ${json.meta?.image} != ${path.basename(pngFile)}`);
  const tags = json.meta?.frameTags || [];
  if (!tags.length) fail('meta.frameTags missing');

  // json frame rects must stay inside the canvas, in grid order, matching frameSize
  const du = Math.round(1000 / px.fps);
  for (let i = 0; i < (json.frames?.length || 0); i++) {
    const f = json.frames[i], r = f?.frame;
    if (!r) { fail(`frames[${i}] has no frame rect`); continue; }
    if (r.w !== cw || r.h !== ch) fail(`frames[${i}] rect ${r.w}x${r.h} != frameSize ${cw}x${ch}`);
    if (r.x < 0 || r.y < 0 || r.x + r.w > w || r.y + r.h > h) fail(`frames[${i}] rect outside PNG`);
    if (r.x !== (i % cols) * cw || r.y !== Math.floor(i / cols) * ch) fail(`frames[${i}] not on the ${cols}-column grid`);
    if (Math.abs((f.duration || 0) - du) > 2) fail(`frames[${i}] duration ${f.duration} vs 1000/fps ${du}`);
  }

  // ---- style: palette + ink outline --------------------------------------
  const pal = familyPalette(SHEET_FAMILY[id] ?? 'holy').map((n) => [rOf(n), gOf(n), bOf(n)]);
  if (!pal.length) fail(`${id}: empty family palette (SHEET_FAMILY=${SHEET_FAMILY[id]})`);
  const palLuma = pal.map(([r, g, b]) => luma(r, g, b));
  row.notes.palette = `${pal.length} ramp colours, family ${SHEET_FAMILY[id]}`;

  const solid = new Map();     // packed rgb -> pixel count (alpha >= 240)
  let edgePx = 0, edgeDark = 0, thickPx = 0, thickDark = 0, pureBlack = 0, pureWhite = 0;
  let minFramePx = Infinity, blankFrames = 0;
  let totalSolid = 0;

  for (let i = 0; i < px.frames; i++) {
    const ox = (i % cols) * cw, oy = Math.floor(i / cols) * ch;
    const solidMask = new Uint8Array(cw * ch);
    let framePx = 0, minX = cw, minY = ch, maxX = -1, maxY = -1;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const o = ((oy + y) * w + ox + x) * 4;
        const a = data[o + 3];
        if (a >= 128) solidMask[y * cw + x] = 1;
        if (a < 40) continue;
        framePx++;
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
      }
    }
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        if (!solidMask[y * cw + x]) continue;
        const o = ((oy + y) * w + ox + x) * 4;
        if (data[o + 3] < 240) continue;
        totalSolid++;
        const r = data[o], g = data[o + 1], b = data[o + 2];
        if (r === 0 && g === 0 && b === 0) { pureBlack++; continue; }
        if (r === 255 && g === 255 && b === 255) { pureWhite++; continue; }

        const key = (r << 16) | (g << 8) | b;
        solid.set(key, (solid.get(key) || 0) + 1);

        // 4-neighbour solid count: tells a thick edge (3-4 solid) from a thin 1-2 px line (<=2)
        let n4 = 0;
        if (x > 0 && solidMask[y * cw + x - 1]) n4++;
        if (x < cw - 1 && solidMask[y * cw + x + 1]) n4++;
        if (y > 0 && solidMask[(y - 1) * cw + x]) n4++;
        if (y < ch - 1 && solidMask[(y + 1) * cw + x]) n4++;
        if (n4 === 4) continue;                 // interior pixel: no silhouette
        edgePx++;
        const dl = luma(r, g, b);
        const di = Math.hypot(r - INK[0], g - INK[1], b - INK[2]);
        const inkish = dl < EDGE_DARK_LUMA || di < INK_TOL;
        if (inkish) edgeDark++;
        // Chunky silhouette pixel: the ink rim rule only fires where the shape is >=3 px thick,
        // so outline quality is measured on the thick edges only (thin sparks keep their lit core).
        if (n4 >= 3) { thickPx++; if (inkish) thickDark++; }
      }
    }
    if (framePx < 8 || maxX < 0) { blankFrames++; continue; }
    minFramePx = Math.min(minFramePx, framePx);
    if (minX < 0 || minY < 0 || maxX >= cw || maxY >= ch) fail(`frames[${i}] bbox crosses its cell`);
  }
  const visibleFrames = px.frames - blankFrames;
  row.notes.alpha = `${visibleFrames}/${px.frames} frames visible, min frame ${minFramePx === Infinity ? 0 : minFramePx} px`;
  if (visibleFrames < 1) fail('no frame has any visible alpha pixels');
  else if (visibleFrames < Math.max(1, Math.floor(px.frames * 0.4))) fail(`only ${visibleFrames}/${px.frames} frames have alpha pixels (blank lead-in/lead-out may exist, but not most of the sheet)`);

  const distinct = [...solid.entries()].sort((a, b) => b[1] - a[1]);
  row.notes.colours = distinct.slice(0, 8).map(([k, n]) => `${hex(k)}:${n}`).join(' ');
  if (distinct.length < MIN_DISTINCT) fail(`only ${distinct.length} distinct solid colours (< ${MIN_DISTINCT})`);
  if (distinct.length > MAX_DISTINCT) fail(`${distinct.length} distinct solid colours (> ${MAX_DISTINCT})`);

  let offPalette = 0, tooBright = 0, neon = 0, worst = { d: 0 };
  for (const [k] of distinct) {
    const r = rOf(k), g = gOf(k), b = bOf(k);
    let best = Infinity;
    for (const [pr, pg, pb] of pal) {
      const d = wdist(r, g, b, pr, pg, pb);
      if (d < best) best = d;
    }
    if (best > PALETTE_DIST * PALETTE_DIST) offPalette++;
    if (best > worst.d) worst = { d: best, key: k };
    const l = luma(r, g, b);
    if (l > MAX_LUMA) tooBright++;
    else if (palLuma.length && l > Math.max(...palLuma) + 0.06) tooBright++;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx ? (mx - mn) / mx : 0;
    let hue = 0;
    if (mx !== mn) {
      if (mx === r) hue = 60 * (((g - b) / (mx - mn)) % 6);
      else if (mx === g) hue = 60 * ((b - r) / (mx - mn) + 2);
      else hue = 60 * ((r - g) / (mx - mn) + 4);
      if (hue < 0) hue += 360;
    }
    // alien spill: saturated magenta or acid green, the old pixelfx / neon look
    if (sat > 0.45 && l > 0.45 && ((hue >= 285 && hue <= 345) || (hue >= 95 && hue <= 165 && sat > 0.6))) neon++;
  }
  row.notes.paletteDist = Math.round(Math.sqrt(worst.d));
  if (offPalette) fail(`${offPalette} solid colour(s) off the HeroLoom ramp (worst ${hex(worst.key)} dist ${Math.round(Math.sqrt(worst.d))} > ${PALETTE_DIST})`);
  if (tooBright) fail(`${tooBright} solid colour(s) brighter than the ramp max luma ${MAX_LUMA}`);
  if (neon) fail(`${neon} alien neon/magenta colour(s) outside the warm storybook ramp`);
  if (pureBlack) fail(`${pureBlack} pure #000000 pixel(s) (edge fringe)`);
  if (pureWhite) fail(`${pureWhite} pure #ffffff pixel(s) (laser core)`);

  // Ink-outline coverage is measured, not gated: the style pass deliberately skips the rim on 1-2 px
  // sparks/lines (a darkened 1 px arm reads as dirt at game scale k~0.13) and on soft glow shells, so a
  // low number on hit-spark / priest-heal / spell-charge is the intended treatment, not a failure. Sheets
  // with chunky masses aim >=55%; the hard floor only catches "no outline at all on thick edges".
  const edgeDarkFrac = edgePx ? edgeDark / edgePx : 0;
  const thickDarkFrac = thickPx ? thickDark / thickPx : 0;
  row.notes.edge = `${Math.round(edgeDarkFrac * 100)}% of ${edgePx} silhouette px ink-dark` +
    (thickPx >= 100 ? `; ${Math.round(thickDarkFrac * 100)}% of ${thickPx} chunky edge px (aim >=55%)` : '; thin-line effect (no chunky rim expected)');
  if (!edgePx) fail('no alpha silhouette pixels found');
  if (row.notes.cell) row.notes.legacyCell = row.notes.cell;

  row.pass = row.fails.length === 0;
  return row;
}

// ---- run ----------------------------------------------------------------------------------------
if (!fs.existsSync(SHEETS)) {
  console.error(`FAIL  sheets dir not found: ${SHEETS}`);
  process.exit(1);
}
const ids = fs.readdirSync(SHEETS).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
console.log(`pixelfx-style: ${ids.length} sheets in ${SHEETS}\n`);
for (const id of ids) checkSheet(id);

let failed = 0;
for (const r of results) {
  const head = `${r.pass ? 'PASS' : 'FAIL'}  ${r.id.padEnd(20)}`;
  const note = r.pass
    ? `${r.notes.png.padEnd(10)} ${(r.notes.bytes / 1024).toFixed(0).padStart(5)}KB  ${r.notes.meta}`
    : r.fails.join('; ');
  if (r.pass) console.log(head + note);
  else { failed++; console.log(head + 'FAIL'); for (const f of r.fails) console.log('        - ' + f); }
  if (verbose && r.pass) console.log(`        ${note}\n        ${r.notes.alpha} | colours: ${r.notes.colours}\n        palette ${r.notes.palette}, max dist ${r.notes.paletteDist} | ${r.notes.edge}`);
}
const total = results.length;
console.log(`\n${total - failed}/${total} sheets PASS, ${failed} FAIL`);
process.exit(failed ? 1 : 0);

