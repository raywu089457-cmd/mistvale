#!/usr/bin/env node
// tools/checks/heroloom-monsters3.mjs
//
// Gate for the deterministic HeroLoom restyle of the monsters3 sheets
// (produced by pipeline/scripts/heroloom/restyle-monsters3.mjs).
//
// For every id in assets/monsters3/ the check requires a pair in
// assets/heroloom-monsters3/ and verifies, per sheet:
//
//   1. the pair exists (png + json) and the json decodes;
//   2. the PNG is exactly the same sheet size as the original (no re-layout);
//   3. the alpha mask is BYTE-IDENTICAL to the original silhouette (binary alpha
//      in, binary alpha out, no pixel added or removed);
//   4. the meta json is deep-equal to the original (geometry is not allowed to drift);
//   5. the palette is strictly reduced (fewer unique opaque colours than the original);
//   6. the ink-rim coverage (opaque pixels snapped onto the #150d1b ink ladder)
//      is inside 3%..18% of the opaque pixels — with binary alpha and this ink
//      pass the rim is the silhouette, so a wildly off number means either a
//      half-inked sprite or ink flooding the interior;
//   7. >= 95% of the opaque pixels sit within OKLab distance 0.08 of the declared
//      HeroLoom ramp set (material ramps + ink ladder + shadow family), i.e. the
//      sheet really is painted from the reference palette.
//
// The ramp set is duplicated here on purpose: the checker must not trust the
// generator's own copy of the contract. Keep both lists in sync when the restyle
// ramps change (pipeline/scripts/heroloom/restyle-monsters3.mjs, const RAMPS).
//
// Usage:
//   node tools/checks/heroloom-monsters3.mjs [project-root]
//
// Exit code: 0 when every pair passes, 1 otherwise.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodePng } from '../../pipeline/scripts/heroloom/png.mjs';
import { srgbToOklab, oklabToSrgb, packRgb } from '../../pipeline/scripts/heroloom/scene-color.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'assets', 'monsters3');
const OUT = path.join(ROOT, 'assets', 'heroloom-monsters3');

// --- contract constants ------------------------------------------------------------------------

const INK_COVERAGE_MIN = 0.03;
const INK_COVERAGE_MAX = 0.18;
const RAMP_DIST_MAX = 0.08;
const RAMP_WITHIN_MIN = 0.95;
const MIN_PALETTE_REDUCTION = 1; // strictly fewer unique opaque colours than the original

const OUTLINE = [21, 13, 27]; // #150d1b

function buildInkLadder() {
  const ink = srgbToOklab(...OUTLINE);
  const grey = srgbToOklab(0x4a, 0x4a, 0x52);
  const mix = (t) => oklabToSrgb(
    ink.L + (grey.L - ink.L) * t,
    ink.a + (grey.a - ink.a) * t,
    ink.b + (grey.b - ink.b) * t,
  );
  return [OUTLINE, mix(0.15), mix(0.30), mix(0.45)];
}

// Exact copy of the RAMPS table in pipeline/scripts/heroloom/restyle-monsters3.mjs.
const RAMPS = {
  shadow:  ['#19192d', '#3e2029'],
  grey:    ['#353a47', '#4a4a52', '#6b6b73', '#9a9aa0'],
  leather: ['#4a2f1c', '#79553a', '#8a613f', '#a67c44'],
  skin:    ['#8a5a33', '#a8753f', '#c8a05a', '#e0c080'],
  bone:    ['#ad8a63', '#d1aa7d', '#e1cbbc', '#ece8da'],
  green:   ['#435521', '#546a21', '#718e32', '#98aa44'],
  ice:     ['#457b9f', '#84c9e5', '#aee1f6', '#d7e8ef'],
  blue:    ['#1b2d4f', '#2d4b73', '#486495', '#4e7daa'],
  white:   ['#c8c8c8', '#e1cbbc', '#ece8da', '#f6faf3'],
  accent:  ['#6a2a17', '#be2d29', '#e69436', '#ecc35e', '#d58a76'],
};

function hexToRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function entryOf(hex, ink) {
  const [r, g, b] = hexToRgb(hex);
  const lab = srgbToOklab(r, g, b);
  return { hex, r, g, b, L: lab.L, la: lab.a, lb: lab.b, ink };
}

const INK_LADDER = buildInkLadder();
const ACCEPTED = [
  ...INK_LADDER.map((rgb, i) => entryOf(rgbHexOf(rgb), true, i)),
  ...Object.values(RAMPS).flatMap((hexes) => hexes.map((hex) => entryOf(hex, false))),
];

function rgbHexOf(rgb) {
  return '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

function labDist(a, b) {
  const dL = a.L - b.L;
  const da = a.la - b.la;
  const db = a.lb - b.lb;
  return Math.sqrt(1.25 * dL * dL + 0.85 * (da * da + db * db));
}

const TRANSPARENT = 0; // packRgb(0,0,0) — alpha 0 pixels are not measured

// --- small helpers -----------------------------------------------------------------------------

const failures = [];
const notes = [];
let passCount = 0;

function fail(id, msg) {
  failures.push(`${id}: ${msg}`);
  console.log(`FAIL  ${id}  ${msg}`);
}

function pass(id, msg) {
  passCount++;
  console.log(`PASS  ${id}  ${msg}`);
}

function note(msg) {
  notes.push(msg);
  console.log(`NOTE  ${msg}`);
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return false;
    if (!deepEqual(a[ka[i]], b[kb[i]])) return false;
  }
  return true;
}

/** Packed-colour → nearest-accepted-entry cache for one sheet. Keys are packed rgba ints. */
function makeClassifier() {
  const cache = new Map();
  return (key) => {
    let hit = cache.get(key);
    if (hit) return hit;
    const r = (key >>> 16) & 0xff;
    const g = (key >>> 8) & 0xff;
    const b = key & 0xff;
    const lab0 = srgbToOklab(r, g, b);
    const lab = { L: lab0.L, la: lab0.a, lb: lab0.b };
    let best = null;
    let bestD = Infinity;
    for (const e of ACCEPTED) {
      const d = labDist(lab, e);
      if (d < bestD - 1e-12) { bestD = d; best = e; }
    }
    hit = { entry: best, dist: bestD };
    cache.set(key, hit);
    return hit;
  };
}

/** True for opaque pixels that have at least one 4-neighbour transparent pixel. */
function edgeMask(png) {
  const { width, height, rgba } = png;
  const mask = new Uint8Array(width * height);
  const isOpaque = (x, y) => x >= 0 && y >= 0 && x < width && y < height && rgba[(y * width + x) * 4 + 3] !== 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (rgba[idx * 4 + 3] === 0) continue;
      if (!isOpaque(x - 1, y) || !isOpaque(x + 1, y) || !isOpaque(x, y - 1) || !isOpaque(x, y + 1)) mask[idx] = 1;
    }
  }
  return mask;
}

function uniqueOpaqueColors(png) {
  const seen = new Set();
  const { rgba } = png;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] === 0) continue;
    seen.add(packRgb(rgba[i], rgba[i + 1], rgba[i + 2]));
  }
  return seen;
}

/** Byte-compare the alpha channel of two sheets of the same size. */
function alphaMismatchCount(a, b) {
  if (a.rgba.length !== b.rgba.length) return Infinity;
  let diff = 0;
  for (let i = 3; i < a.rgba.length; i += 4) if (a.rgba[i] !== b.rgba[i]) diff++;
  return diff;
}

function nonBinaryAlphaPixels(png) {
  let n = 0;
  for (let i = 3; i < png.rgba.length; i += 4) {
    const v = png.rgba[i];
    if (v !== 0 && v !== 255) n++;
  }
  return n;
}

// --- replacement regime (HeroLoom-style Muse sheets) ------------------------------------------
// 18 of the 22 ids were later replaced by freshly drawn 1280x800 8x5 HeroLoom-style sheets
// (output/heroloom-ext/monsters-v2). Those intentionally do NOT keep the old silhouette/meta:
// they ship the reduced 5-action meta the runtime already supports (dir4 fallbacks), so the gate
// here is the runtime monster contract instead of the recolor contract.
//
// Per replacement sheet we require:
//   a. the reduced meta contract (id, heroHeight 72, footFromBottom 12, artSize 60..140,
//      actions idle/walk/attack/hurt/death at y 0/160/320/480/640, cell 160,
//      frames 4/8/6/3/5, walk.cycle 85, numeric timing);
//   b. sheet 1280x800, binary alpha, no magenta leftovers, palette <= 40 looks;
//   c. every declared frame cell actually holds art (alpha bbox non-empty, width/height sane)
//      and sits on the shared baseline (content bottom 138..156 from the cell top, except the
//      flat death row which may lie lower);
//   d. an ink outline is present: >= 1.5% of opaque pixels are dark (OKLab L < 0.26).

const REPL_ACTIONS = [
  ['idle', 0, 4], ['walk', 160, 8], ['attack', 320, 6], ['hurt', 480, 3], ['death', 640, 5],
];

function checkReplacement(id, png, meta) {
  const problems = [];
  if (png.width !== 1280 || png.height !== 800) problems.push(`sheet must be 1280x800, got ${png.width}x${png.height}`);
  if (meta.hero !== id) problems.push(`meta.hero ${JSON.stringify(meta.hero)} != ${id}`);
  if (meta.heroHeight !== 72) problems.push(`heroHeight ${meta.heroHeight} != 72`);
  if (meta.footFromBottom !== 12) problems.push(`footFromBottom ${meta.footFromBottom} != 12`);
  if (!(meta.artSize >= 60 && meta.artSize <= 140)) problems.push(`artSize ${meta.artSize} outside 60..140`);
  const acts = meta.actions || {};
  if (Object.keys(acts).length !== REPL_ACTIONS.length) problems.push(`actions should be exactly 5, got ${Object.keys(acts).length}`);
  if (acts.walk && acts.walk.cycle !== 85) problems.push(`walk.cycle ${acts.walk.cycle} != 85`);

  // alpha sanity
  let nonBinary = 0;
  let magenta = 0;
  const dark = [];
  for (let i = 0; i < png.rgba.length; i += 4) {
    const a = png.rgba[i + 3];
    if (a === 0) continue;
    if (a !== 255) nonBinary++;
    const r = png.rgba[i], g = png.rgba[i + 1], b = png.rgba[i + 2];
    if (r > 235 && g < 45 && b > 235) magenta++;
    dark.push([r, g, b]);
  }
  if (nonBinary) problems.push(`${nonBinary} pixel(s) with non-binary alpha`);
  if (magenta) problems.push(`${magenta} magenta pixel(s) left unkeyed`);
  const colours = new Set(dark.map(([r, g, b]) => packRgb(r, g, b)));
  if (colours.size > 40) problems.push(`palette ${colours.size} colours > 40`);

  // per-frame art presence + baseline (reuse the decoded sheet)
  const W = png.width;
  for (const [name, y0, frames] of REPL_ACTIONS) {
    const a = acts[name];
    if (!a) continue;
    if (a.y !== y0) problems.push(`${name}.y ${a.y} != ${y0}`);
    if (a.cell !== 160) problems.push(`${name}.cell ${a.cell} != 160`);
    if (a.frames !== frames) problems.push(`${name}.frames ${a.frames} != ${frames}`);
    if (typeof a.frameTime !== 'number' || !(a.frameTime > 0)) problems.push(`${name}.frameTime invalid`);
    if (name === 'attack' && a.release == null && a.impact == null) problems.push('attack needs release/impact');
    for (let f = 0; f < Math.min(frames, 8); f++) {
      let bottom = -1, count = 0;
      for (let y = 0; y < 160; y++) {
        for (let x = 0; x < 160; x++) {
          if (png.rgba[((y0 + y) * W + f * 160 + x) * 4 + 3] !== 0) { count++; if (y > bottom) bottom = y; }
        }
      }
      if (count < 40) problems.push(`${name} frame ${f} looks empty (${count} px)`);
      else if (name !== 'death' && (bottom < 138 || bottom > 156)) problems.push(`${name} frame ${f} baseline ${bottom} outside 138..156`);
    }
  }

  // ink outline presence
  let inked = 0;
  let opaque = 0;
  for (let i = 0; i < png.rgba.length; i += 4) {
    if (png.rgba[i + 3] === 0) continue;
    opaque++;
    const lab = srgbToOklab(png.rgba[i], png.rgba[i + 1], png.rgba[i + 2]);
    if (lab.L < 0.26) inked++;
  }
  const inkPct = opaque ? inked / opaque : 0;
  if (inkPct < 0.015) problems.push(`ink outline coverage ${(inkPct * 100).toFixed(2)}% < 1.5%`);

  if (problems.length) { fail(id, 'replacement sheet: ' + problems.join('; ')); return; }
  pass(id, `replacement ${png.width}x${png.height}  5 actions  colours ${colours.size}  ink ${(inkPct * 100).toFixed(2)}%`);
}

// --- per-sheet check ---------------------------------------------------------------------------

function checkSheet(id) {
  const srcPng = path.join(SRC, `${id}.png`);
  const srcJson = path.join(SRC, `${id}.json`);
  const outPng = path.join(OUT, `${id}.png`);
  const outJson = path.join(OUT, `${id}.json`);

  if (!fs.existsSync(srcPng)) { fail(id, 'missing source sheet ' + rel(srcPng)); return; }
  if (!fs.existsSync(outPng)) { fail(id, 'missing restyled sheet ' + rel(outPng)); return; }
  if (!fs.existsSync(outJson)) { fail(id, 'missing restyled meta ' + rel(outJson)); return; }

  const original = decodePng(fs.readFileSync(srcPng));
  const restyled = decodePng(fs.readFileSync(outPng));

  let originalMeta;
  let restyledMeta;
  try {
    originalMeta = JSON.parse(fs.readFileSync(srcJson, 'utf8'));
    restyledMeta = JSON.parse(fs.readFileSync(outJson, 'utf8'));
  } catch (e) {
    fail(id, 'meta json does not parse: ' + e.message);
    return;
  }

  // Regime B: a freshly drawn reduced 5-action HeroLoom-style sheet (Muse replacements).
  if (restyledMeta.actions && Object.keys(restyledMeta.actions).length === 5
      && restyledMeta.actions.idle && restyledMeta.actions.idle.cell === 160) {
    checkReplacement(id, restyled, restyledMeta);
    return;
  }

  if (restyled.width !== original.width || restyled.height !== original.height) {
    fail(id, `sheet size ${restyled.width}x${restyled.height} != original ${original.width}x${original.height}`);
    return;
  }

  // 3. silhouette byte-exact
  const alphaDiff = alphaMismatchCount(original, restyled);
  if (alphaDiff !== 0) {
    fail(id, `alpha mask differs on ${alphaDiff} pixel(s) — silhouette must stay byte-exact`);
    return;
  }
  const nonBinary = nonBinaryAlphaPixels(restyled);
  if (nonBinary !== 0) {
    fail(id, `alpha is not binary: ${nonBinary} pixel(s) with 0<alpha<255`);
    return;
  }

  // 4. meta deep-equal
  if (!deepEqual(originalMeta, restyledMeta)) {
    fail(id, 'meta geometry drifted from the original json (must be deep-equal)');
    return;
  }

  // 5. palette reduced
  const colorsBefore = uniqueOpaqueColors(original);
  const colorsAfter = uniqueOpaqueColors(restyled);
  if (colorsAfter.size > colorsBefore.size - MIN_PALETTE_REDUCTION) {
    fail(id, `palette not reduced: ${colorsBefore.size} -> ${colorsAfter.size} unique opaque colours`);
    return;
  }

  // 6/7. ink coverage + ramp adherence
  const classify = makeClassifier();
  const edges = edgeMask(restyled);
  const opaqueTotal = restyled.width * restyled.height;
  let opaque = 0;
  let edgePixels = 0;
  let inkPixels = 0;
  let edgeInkPixels = 0;
  let within = 0;
  for (let idx = 0, o = 0; idx < opaqueTotal; idx++, o += 4) {
    if (restyled.rgba[o + 3] === 0) continue;
    opaque++;
    const key = packRgb(restyled.rgba[o], restyled.rgba[o + 1], restyled.rgba[o + 2]);
    const { entry, dist } = classify(key);
    if (entry.ink) inkPixels++;
    if (edges[idx]) {
      edgePixels++;
      if (entry.ink) edgeInkPixels++;
    }
    if (dist <= RAMP_DIST_MAX) within++;
  }

  const inkPct = opaque === 0 ? 0 : inkPixels / opaque;
  const edgeInkPct = edgePixels === 0 ? 0 : edgeInkPixels / edgePixels;
  const withinPct = opaque === 0 ? 0 : within / opaque;

  const problems = [];
  if (inkPct < INK_COVERAGE_MIN || inkPct > INK_COVERAGE_MAX) {
    problems.push(`ink-rim coverage ${(inkPct * 100).toFixed(2)}% outside ${INK_COVERAGE_MIN * 100}..${INK_COVERAGE_MAX * 100}%`);
  }
  if (withinPct < RAMP_WITHIN_MIN) {
    problems.push(`only ${(withinPct * 100).toFixed(2)}% of opaque pixels within ramp distance ${RAMP_DIST_MAX} (need >=${RAMP_WITHIN_MIN * 100}%)`);
  }
  if (problems.length) {
    fail(id, problems.join('; '));
    return;
  }

  pass(id, `colors ${colorsBefore.size} -> ${colorsAfter.size}  ink ${(inkPct * 100).toFixed(2)}%  edgeInk ${(edgeInkPct * 100).toFixed(2)}%  ramp ${(withinPct * 100).toFixed(2)}%`);
}

function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join('/');
}

// --- main --------------------------------------------------------------------------------------

function main() {
  console.log(`heroloom-monsters3 check — root ${ROOT}`);

  if (!fs.existsSync(SRC)) {
    console.log(`FAIL  missing source dir ${rel(SRC)} (this checkout should always have it)`);
    process.exit(1);
  }
  const ids = fs.readdirSync(SRC)
    .filter((f) => f.endsWith('.png') && !f.endsWith('.webp'))
    .map((f) => f.slice(0, -4))
    .sort();
  if (ids.length === 0) {
    console.log(`FAIL  no source sheets in ${rel(SRC)}`);
    process.exit(1);
  }

  if (!fs.existsSync(OUT)) {
    console.log(`FAIL  missing restyled dir ${rel(OUT)} — run: node pipeline/scripts/heroloom/restyle-monsters3.mjs`);
    process.exit(1);
  }

  note(`${ids.length} monster ids in ${rel(SRC)}: ${ids.join(', ')}`);

  for (const id of ids) {
    const srcJson = path.join(SRC, `${id}.json`);
    if (!fs.existsSync(srcJson)) { fail(id, `missing source meta ${rel(srcJson)}`); continue; }
    checkSheet(id);
  }

  const outFiles = fs.readdirSync(OUT).filter((f) => !f.startsWith('.'));
  const pairs = outFiles.filter((f) => f.endsWith('.png') || f.endsWith('.json'));
  const webps = outFiles.filter((f) => f.endsWith('.webp'));
  const expected = ids.length * 2;
  if (pairs.length !== expected) {
    note(`${rel(OUT)} holds ${pairs.length} png+json file(s) (expected ${expected}: ${ids.length} png + ${ids.length} json)`);
  }
  if (webps.length && webps.length !== ids.length) {
    note(`${rel(OUT)} holds ${webps.length} webp file(s) (expected 0 or ${ids.length}; build prefers webp when present)`);
  }

  if (failures.length) {
    console.log(`\nSummary: FAIL -- ${failures.length} problem(s) across ${ids.length} monster id(s).`);
    process.exit(1);
  }
  console.log(`\nSummary: PASS -- ${passCount}/${ids.length} restyled sheets match the HeroLoom contract (alpha byte-exact, meta deep-equal, palette reduced, ink + ramp gates inside band).`);
}

main();
