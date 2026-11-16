// pipeline/scripts/heroloom/restyle-monsters3.mjs —deterministic HeroLoom restyle of the EXISTING
// monsters3 sheets (the "all monsters in HeroLoom style" pass). No image model, no network, no spend.
//
// What this does, and what it deliberately does NOT do
// ----------------------------------------------------
//   * decodes every assets/monsters3/<id>.png with the dependency-free codec in png.mjs
//   * keeps the alpha channel BYTE-EXACT (binary alpha in, binary alpha out) and therefore keeps the
//     silhouette byte-exact —no pixel is added outside the original sprite and none is removed
//   * remaps every opaque source colour onto a small HeroLoom material ramp (2–5 shade steps per
//     family, colours lifted from assets/heroloom-scene/palette.json — the 96-colour ramp sampled from
//     the real HeroLoom art — plus the pale-cyan ladder of assets/heroloom-scene/cold@1x.png for ice):
//     skin / leather / bone / cool grey / stone shadow / moss green / ice / blue / white / accent.
//     The material is chosen from the source colour's OKLab hue + chroma + lightness, so each monster
//     keeps its identity (grey wolf stays grey, moss troll stays green, mummy stays tan, ice beetle
//     stays pale cyan, flower stays salmon) while the shading collapses to chunky flat ramps.
//   * inks the silhouette: opaque pixels that touch transparency are pulled toward #150d1b (the
//     HeroLoom outline) and snapped onto a 4-step ink ladder, and the 1 px band just below a top
//     silhouette edge is snapped one ramp step darker (fake 2.5D top light / under-hang shadow).
//   * caps the resulting palette BELOW the original colour count (never above), merging the least-used
//     colours into their nearest neighbour in OKLab. The original sheets have 15..246 opaque colours;
//     the restyled sheets land around 10..35, which is what makes them read as pixel art.
//   * copies assets/monsters3/<id>.json to assets/heroloom-monsters3/<id>.json UNCHANGED —geometry
//     (y/cell/frames/frameTime/release/impact/cycle/head/heroHeight/footFromBottom/artSize/...) is
//     byte-identical, so build.mjs / pixel-world.js consume it as a drop-in replacement.
//   * writes A/B proof PNGs (original | restyled) to output/heroloom-ext/monsters3-proof/.
//
// Determinism: pure functions of the input bytes, no randomness, no seeds, iteration order is
// explicit. Running it twice produces byte-identical PNGs on the same Node/zlib version.
//
// Usage:
//   node pipeline/scripts/heroloom/restyle-monsters3.mjs
//   node pipeline/scripts/heroloom/restyle-monsters3.mjs --only=wolfman,moss,treant
//   node pipeline/scripts/heroloom/restyle-monsters3.mjs --no-proofs
//   node pipeline/scripts/heroloom/restyle-monsters3.mjs --dry-run
//
// Outputs:
//   assets/heroloom-monsters3/<id>.png        (indexed PNG, binary alpha, original dimensions)
//   assets/heroloom-monsters3/<id>.json       (verbatim copy of the original meta)
//   output/heroloom-ext/monsters3-proof/compare-<id>.png, all-contact.png, restyle-report.json

import fs from 'node:fs';
import path from 'node:path';
import { decodePng, encodeRgba, encodeIndexed } from './png.mjs';
import {
  srgbToOklab, oklabToSrgb, packRgb, unpackRgb, rgbHex,
  uniqueOpaqueColors, meanHueShift,
} from './scene-color.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const SRC = path.join(ROOT, 'assets', 'monsters3');
const OUT = path.join(ROOT, 'assets', 'heroloom-monsters3');
const PROOF = path.join(ROOT, 'output', 'heroloom-ext', 'monsters3-proof');

// ---------------------------------------------------------------------------------------------
// HeroLoom palette. Every hex below is an exact entry of assets/heroloom-scene/palette.json except
// the pale-cyan `ice` ladder, which comes from the real cold-magic art (assets/heroloom-scene/
// cold@1x.png), and the salmon step of `accent`, which is palette entry #d58a76. Keeping the lists
// to literal palette entries is what makes the ">=95% of pixels within ramp distance" gate provable.
// ---------------------------------------------------------------------------------------------

const OUTLINE = [21, 13, 27]; // #150d1b —HeroLoom ink

/** Ink ladder: the outline pulled 15/30/45% toward the HeroLoom neutral grey #4a4a52. */
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

const INK_LADDER = buildInkLadder();

// 2–5 shade steps per material, sorted dark -> light. Hexes follow assets/heroloom-scene/palette.json
// (the reference ramp sampled from the real HeroLoom art); `ice` uses the cold@1x.png cyan ladder and
// `accent` ends on the salmon entry #d58a76 so pink flowers keep their hue instead of going orange.
// `shadow` is the original art's interior line/shadow family: kept a hair lighter than the ink
// ladder so that the measured ink-rim coverage stays a rim (the outline pass owns the ink ladder).
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

/** Ramp entries prepared once: {family, idx, r,g,b, L,la,lb, key}. */
const RAMP_ENTRIES = Object.entries(RAMPS).flatMap(([family, hexes]) => hexes.map((hex, idx) => {
  const [r, g, b] = hexToRgb(hex);
  const lab = srgbToOklab(r, g, b);
  return { family, idx, hex, r, g, b, L: lab.L, la: lab.a, lb: lab.b, key: packRgb(r, g, b) };
}));

const INK_ENTRIES = INK_LADDER.map((rgb, idx) => {
  const lab = srgbToOklab(rgb[0], rgb[1], rgb[2]);
  return { idx, rgb, hex: rgbHex(...rgb), L: lab.L, la: lab.a, lb: lab.b, key: packRgb(...rgb) };
});
const INK_KEYS = new Set(INK_ENTRIES.map((e) => e.key));

/** Full accepted ramp set (materials + ink ladder) for the QA metric. */
const ACCEPTED_RAMP = [...RAMP_ENTRIES, ...INK_ENTRIES];

function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** OKLab as {L, la, lb} —the shape every helper here (and paletteDistance in scene-color.mjs) uses. */
function labOf(r, g, b) {
  const lab = srgbToOklab(r, g, b);
  return { L: lab.L, la: lab.a, lb: lab.b };
}

const labDist = (a, b) => Math.sqrt(1.25 * (a.L - b.L) ** 2 + 0.85 * ((a.la - b.la) ** 2 + (a.lb - b.lb) ** 2));

function nearestEntry(entries, lab) {
  let best = entries[0], bestD = Infinity;
  for (const e of entries) {
    const d = labDist(lab, e);
    if (d < bestD - 1e-12) { bestD = d; best = e; }
  }
  return { entry: best, dist: bestD };
}

// ---------------------------------------------------------------------------------------------
// material classification: source colour -> one HeroLoom ramp step
// ---------------------------------------------------------------------------------------------

/** Classify one opaque sRGB colour into {family, idx, rgb}. Pure + memoised by caller. */
function classify(r, g, b) {
  const lab = labOf(r, g, b);
  const { L, la: a, lb } = lab;
  const C = Math.hypot(a, lb);
  const H = Math.atan2(lb, a) * 180 / Math.PI; // -180..180

  // very dark pixels are the original pixel-art outline / deep shadow: snap them onto the shadow
  // ramp (the silhouette ink pass below is what puts #150d1b onto the actual edges).
  if (L < 0.22) return pick('shadow', lab);
  // near-neutral colours: stone / cloth / snow
  if (C < 0.028) {
    if (L > 0.72) return pick('white', { L, la: a, lb });
    return pick('grey', { L, la: a, lb });
  }
  // warm family (tan, leather, bone, gold accents)
  if (H >= 40 && H < 100) {
    if (C > 0.11) return pick('accent', { L, la: a, lb });
    if (L >= 0.72) return pick('bone', { L, la: a, lb });
    if (L >= 0.55) return pick('skin', { L, la: a, lb });
    return pick('leather', { L, la: a, lb });
  }
  // green family (moss, leaves, vines)
  if (H >= 95 && H < 150) return pick('green', { L, la: a, lb });
  // cyan / ice / deep blue and the cool neutrals
  if (H >= -180 && H < -150) return C >= 0.045 ? pick('ice', { L, la: a, lb }) : pick('grey', { L, la: a, lb });
  if (H >= -150 && H < -115) return L >= 0.45 ? pick('ice', { L, la: a, lb }) : pick('blue', { L, la: a, lb });
  if (H >= -115 && H < -45) return pick('grey', { L, la: a, lb });
  if (H >= -45 && H < -20) return C > 0.10 ? pick('accent', { L, la: a, lb }) : pick('grey', { L, la: a, lb });
  if (H >= -20 && H < 40) return C > 0.06 ? pick('accent', { L, la: a, lb }) : pick('grey', { L, la: a, lb });
  // H 150..180 (yellow / yellow-tan): treat like the warm family by lightness
  if (C > 0.11) return pick('accent', { L, la: a, lb });
  if (L >= 0.72) return pick('bone', { L, la: a, lb });
  if (L >= 0.55) return pick('skin', { L, la: a, lb });
  return pick('leather', { L, la: a, lb });
}

function pick(family, lab) {
  const { entry } = nearestEntry(RAMP_ENTRIES.filter((e) => e.family === family), lab);
  return { family, entry };
}

/** Per-source-colour memo: packedRGB -> {rgb, family, idx}. */
function makeClassifierCache() {
  const cacheMap = new Map();
  return (r, g, b) => {
    const key = packRgb(r, g, b);
    let v = cacheMap.get(key);
    if (v === undefined) {
      const c = classify(r, g, b);
      v = c.family === 'ink'
        ? { rgb: c.entry.rgb, family: 'ink', idx: c.entry.idx }
        : { rgb: [c.entry.r, c.entry.g, c.entry.b], family: c.entry.family, idx: c.entry.idx };
      cacheMap.set(key, v);
    }
    return v;
  };
}

// ---------------------------------------------------------------------------------------------
// restyle one sheet
// ---------------------------------------------------------------------------------------------

const MIX_EDGE = 0.55;      // ink pull on silhouette pixels (mid of the 35..55% from the brief, top of it)
const MIX_TOP = 0.68;       // a little stronger right at the top silhouette edge
const MIX_INNER_RIM = 1.0;  // 1 ramp step darker; kept at one step, no extra colour mixing

function mixLabToInk(r, g, b, t) {
  const src = labOf(r, g, b);
  const ink = labOf(...OUTLINE);
  const rgb = oklabToSrgb(
    src.L + (ink.L - src.L) * t,
    src.la + (ink.la - src.la) * t,
    src.lb + (ink.lb - src.lb) * t,
  );
  return nearestEntry(INK_ENTRIES, labOf(...rgb)).entry;
}

function restyleSheet(img, label) {
  const { width: w, height: h, rgba } = img;
  const n = w * h;
  const solid = new Uint8Array(n);
  for (let i = 0, p = 3; i < n; i++, p += 4) solid[i] = rgba[p] >= 128 ? 1 : 0;

  const classifyColor = makeClassifierCache();
  const base = new Uint8Array(n * 4); // rgba of the mapped artwork (alpha filled later)

  // 1) material remap (alpha stays untouched)
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    if (!solid[i]) continue;
    const { rgb } = classifyColor(rgba[p], rgba[p + 1], rgba[p + 2]);
    base[p] = rgb[0]; base[p + 1] = rgb[1]; base[p + 2] = rgb[2]; base[p + 3] = rgba[p + 3];
  }

  // 2) silhouette ink + 1 px inner top rim (neighbour lookup is on the ORIGINAL alpha mask)
  let edgePixels = 0, inkPixels = 0, rimPixels = 0;
  const fits = (x, y) => x >= 0 && y >= 0 && x < w && y < h && solid[y * w + x] === 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!solid[i]) continue;
      const p = i * 4;
      const edge = !fits(x - 1, y) || !fits(x + 1, y) || !fits(x, y - 1) || !fits(x, y + 1);
      const topEdge = !fits(x, y - 1);
      if (edge) {
        edgePixels++;
        const ink = mixLabToInk(base[p], base[p + 1], base[p + 2], topEdge ? MIX_TOP : MIX_EDGE);
        base[p] = ink.rgb[0]; base[p + 1] = ink.rgb[1]; base[p + 2] = ink.rgb[2];
        inkPixels++;
        continue;
      }
      // 1 px inside a top silhouette edge: one ramp step darker (fake 2.5D)
      if (!topEdge && fits(x, y - 1) && !fits(x, y - 2)) {
        const c = classifyColor(rgba[p], rgba[p + 1], rgba[p + 2]);
        if (c.family !== 'ink') {
          const ramp = RAMPS[c.family];
          const target = ramp[Math.max(0, c.idx - MIX_INNER_RIM)];
          const rgb = hexToRgb(target);
          base[p] = rgb[0]; base[p + 1] = rgb[1]; base[p + 2] = rgb[2];
        }
        rimPixels++;
      }
    }
  }

  // 3) cap the palette strictly below the original opaque-colour count
  const beforeColors = uniqueOpaqueColors(rgba);
  const cap = Math.max(4, beforeColors.size - 1);
  const afterColors = capPalette(base, solid, cap);

  // report metrics on the final artwork
  let opaque = 0, ink = 0, onRamp = 0, distSum = 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    if (!solid[i]) continue;
    opaque++;
    const { entry, dist } = nearestEntry(ACCEPTED_RAMP, labOf(base[p], base[p + 1], base[p + 2]));
    distSum += dist;
    if (dist < 0.02) onRamp++;
    if (INK_KEYS.has(entry.key)) ink++;
  }

  return {
    rgba: base,
    width: w,
    height: h,
    label,
    metrics: {
      colorsBefore: beforeColors.size,
      colorsAfter: afterColors,
      opaque,
      edgePixels,
      inkPixels,
      inkPct: +(100 * ink / opaque).toFixed(2),
      edgeInkPct: +(100 * inkPixels / Math.max(1, edgePixels)).toFixed(1),
      rimPixels,
      rampPct: +(100 * onRamp / opaque).toFixed(2),
      meanRampDist: +(distSum / opaque).toFixed(4),
      hueShift: meanHueShift(rgba, base),
    },
  };
}

/**
 * Merge the least-used colours into their nearest neighbour until at most `cap` opaque colours
 * remain. Deterministic: lowest usage first, then packed value as the tie-break; ink is merged last
 * so the silhouette keeps its outline. Always merges into an existing colour, so every output pixel
 * stays on the HeroLoom ramp.
 */
function capPalette(rgba, solid, cap) {
  const counts = new Map();
  for (let i = 0, p = 0; i < rgba.length / 4; i++, p += 4) {
    if (!solid[i]) continue;
    const key = packRgb(rgba[p], rgba[p + 1], rgba[p + 2]);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  if (counts.size <= cap) return counts.size;

  const entryOf = new Map();
  for (const key of counts.keys()) {
    const [r, g, b] = unpackRgb(key);
    entryOf.set(key, { key, r, g, b, lab: labOf(r, g, b) });
  }

  const order = [...counts.keys()].sort((x, y) => {
    const ix = INK_KEYS.has(x) ? 1 : 0, iy = INK_KEYS.has(y) ? 1 : 0;
    if (ix !== iy) return ix - iy;               // merge non-ink first
    const cx = counts.get(x), cy = counts.get(y);
    if (cx !== cy) return cx - cy;               // then the least-used
    return y - x;                                // deterministic tie-break
  });

  for (const victim of order) {
    if (counts.size <= cap) break;
    if (!counts.has(victim)) continue;
    const ve = entryOf.get(victim);
    let target = null, bestD = Infinity;
    for (const [key, e] of entryOf) {
      if (key === victim || !counts.has(key)) continue;
      const d = labDist(ve.lab, e.lab);
      if (d < bestD - 1e-12) { bestD = d; target = e; }
    }
    if (!target) break;
    for (let i = 0, p = 0; i < solid.length; i++, p += 4) {
      if (!solid[i]) continue;
      if (packRgb(rgba[p], rgba[p + 1], rgba[p + 2]) !== victim) continue;
      rgba[p] = target.r; rgba[p + 1] = target.g; rgba[p + 2] = target.b;
    }
    counts.set(target.key, counts.get(target.key) + counts.get(victim));
    counts.delete(victim);
  }
  return counts.size;
}

// ---------------------------------------------------------------------------------------------
// encoding / writing
// ---------------------------------------------------------------------------------------------

function encodeResult(width, height, rgba, solid) {
  const counts = uniqueOpaqueColors(rgba);
  const paletteHex = [];
  const transparent = new Uint8Array(width * height);
  for (let i = 0; i < solid.length; i++) transparent[i] = solid[i] ? 0 : 1;
  const hasTransparent = transparent.some((v) => v === 1);
  if (counts.size + (hasTransparent ? 1 : 0) <= 256) {
    const entries = [...counts.keys()].map((key) => {
      const [r, g, b] = unpackRgb(key);
      return { r, g, b, key, lab: srgbToOklab(r, g, b) };
    }).sort((p, q) => (p.lab.L - q.lab.L) || (p.key - q.key));
    const palette = entries.map((e) => { paletteHex.push(rgbHex(e.r, e.g, e.b)); return [e.r, e.g, e.b]; });
    const transparentIndex = hasTransparent ? entries.length : -1;
    if (hasTransparent) palette.push([0, 0, 0]);
    const indexOf = new Map(entries.map((e, i) => [e.key, i]));
    const indices = new Uint8Array(width * height);
    for (let i = 0, p = 0; i < width * height; i++, p += 4) {
      if (!solid[i]) { indices[i] = transparentIndex; continue; }
      indices[i] = indexOf.get(packRgb(rgba[p], rgba[p + 1], rgba[p + 2]));
    }
    return { buf: encodeIndexed(width, height, indices, palette, transparentIndex), paletteHex, encoder: 'indexed' };
  }
  const clean = new Uint8Array(rgba);
  for (let i = 0; i < clean.length; i += 4) {
    if (!solid[i / 4]) { clean[i] = 0; clean[i + 1] = 0; clean[i + 2] = 0; clean[i + 3] = 0; }
  }
  for (const key of [...counts.keys()].sort((p, q) => p - q)) paletteHex.push(rgbHex(...unpackRgb(key)));
  return { buf: encodeRgba(width, height, clean), paletteHex, encoder: 'rgba' };
}

// ---------------------------------------------------------------------------------------------
// proofs (reuse the tiny raster helpers pattern from scene-proofs.mjs)
// ---------------------------------------------------------------------------------------------

const FONT = {
  A: '010,101,111,101,101', B: '110,101,110,101,110', C: '011,100,100,100,011', D: '110,101,101,101,110',
  E: '111,100,110,100,111', F: '111,100,110,100,100', G: '011,100,101,101,011', H: '101,101,111,101,101',
  I: '111,010,010,010,111', J: '001,001,001,101,010', K: '101,101,110,101,101', L: '100,100,100,100,111',
  M: '101,111,111,101,101', N: '101,111,101,101,101', O: '010,101,101,101,010', P: '110,101,110,100,100',
  Q: '010,101,101,111,011', R: '110,101,110,101,101', S: '011,100,010,001,110', T: '111,010,010,010,010',
  U: '101,101,101,101,111', V: '101,101,101,101,010', W: '101,101,111,111,101', X: '101,101,010,101,101',
  Y: '101,101,010,010,010', Z: '111,001,010,100,111',
  0: '111,101,101,101,111', 1: '010,110,010,010,111', 2: '110,001,010,100,111', 3: '110,001,010,001,110',
  4: '101,101,111,001,001', 5: '111,100,110,001,110', 6: '011,100,110,101,010', 7: '111,001,010,010,010',
  8: '010,101,010,101,010', 9: '010,101,011,001,110',
  ' ': '000,000,000,000,000', '-': '000,000,111,000,000', ':': '000,010,000,010,000',
  '/': '001,001,010,100,100', '.': '000,000,000,000,010', '#': '101,111,101,111,101', '%': '101,001,010,100,101',
};

function makeCanvas(w, h, fill = [20, 18, 24, 255]) {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = fill[0]; data[i + 1] = fill[1]; data[i + 2] = fill[2]; data[i + 3] = fill[3]; }
  return { w, h, data };
}

function setPx(c, x, y, rgb, a = 255) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const o = (y * c.w + x) * 4;
  c.data[o] = rgb[0]; c.data[o + 1] = rgb[1]; c.data[o + 2] = rgb[2]; c.data[o + 3] = a;
}

function fillRect(c, x0, y0, w, h, rgb, a = 255) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) setPx(c, x, y, rgb, a);
}

function border(c, x0, y0, w, h, rgb = [90, 90, 96]) {
  fillRect(c, x0 - 1, y0 - 1, w + 2, 1, rgb);
  fillRect(c, x0 - 1, y0 + h, w + 2, 1, rgb);
  fillRect(c, x0 - 1, y0, 1, h, rgb);
  fillRect(c, x0 + w, y0, 1, h, rgb);
}

function drawText(c, text, x, y, scale = 2, rgb = [235, 235, 240]) {
  let cx = x;
  for (const ch of String(text).toUpperCase()) {
    const glyph = FONT[ch] || FONT[' '];
    const rows = glyph.split(',');
    for (let ry = 0; ry < rows.length; ry++) {
      for (let rx = 0; rx < 3; rx++) {
        if (rows[ry][rx] !== '1') continue;
        fillRect(c, cx + rx * scale, y + ry * scale, scale, scale, rgb);
      }
    }
    cx += 4 * scale;
  }
  return cx;
}

const textWidth = (text, scale = 2) => String(text).length * 4 * scale - scale;

function checkerRect(c, x0, y0, w, h, size = 8) {
  const light = [192, 192, 196], dark = [150, 150, 156];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const odd = ((Math.floor(x / size) + Math.floor(y / size)) & 1) === 1;
      setPx(c, x0 + x, y0 + y, odd ? dark : light);
    }
  }
}

/** Nearest-neighbour blit of an RGBA image region onto the canvas, alpha-composited. */
function blitFit(c, img, sx, sy, sw, sh, dx, dy, dw, dh) {
  for (let y = 0; y < dh; y++) {
    const syy = Math.min(sh - 1, Math.floor(y * sh / dh));
    for (let x = 0; x < dw; x++) {
      const sxx = Math.min(sw - 1, Math.floor(x * sw / dw));
      const so = ((sy + syy) * img.width + sx + sxx) * 4;
      const a = img.rgba[so + 3] / 255;
      const o = ((dy + y) * c.w + dx + x) * 4;
      if (o < 0 || o + 3 >= c.data.length) continue;
      c.data[o] = Math.round(img.rgba[so] * a + c.data[o] * (1 - a));
      c.data[o + 1] = Math.round(img.rgba[so + 1] * a + c.data[o + 1] * (1 - a));
      c.data[o + 2] = Math.round(img.rgba[so + 2] * a + c.data[o + 2] * (1 - a));
      c.data[o + 3] = 255;
    }
  }
}

function savePng(file, c) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodeRgba(c.w, c.h, c.data));
}

/** Crop the idle frame (row 0 of the pack convention is idle; the JSON y offset is the source of truth). */
function idleFrame(meta, img) {
  const a = meta.actions && meta.actions.idle ? meta.actions.idle : Object.values(meta.actions)[0];
  const cell = a.cell, x = 0, y = a.y || 0;
  return { x, y, w: Math.min(cell, img.width), h: Math.min(cell, img.height) };
}

function proofCompare(id, meta, before, after, outFile) {
  const cell = (meta.actions.idle || Object.values(meta.actions)[0]).cell;
  const zoom = 2, pad = 8, header = 26, footer = 18;
  const left = Math.min(cell, before.width) * zoom;
  const right = Math.min(cell, after.width) * zoom;
  const c = makeCanvas(pad * 2 + left + 8 + right, header + Math.max(left, right) + footer);
  drawText(c, id + '  BEFORE', pad, 6, 2, [235, 235, 240]);
  drawText(c, 'AFTER  (HEROLOOM)', pad + left + 8, 6, 2, [255, 220, 160]);
  const fr = idleFrame(meta, before);
  checkerRect(c, pad, header, left, left);
  checkerRect(c, pad + left + 8, header, right, right);
  blitFit(c, before, fr.x, fr.y, fr.w, fr.h, pad, header, left, left);
  blitFit(c, after, fr.x, fr.y, fr.w, fr.h, pad + left + 8, header, right, right);
  border(c, pad, header, left, left);
  border(c, pad + left + 8, header, right, right);
  drawText(c, 'CELL ' + cell + 'PX  ALPHA IDENTICAL', pad, header + left + 4, 2, [200, 200, 208]);
  savePng(outFile, c);
}

function proofContact(rows) {
  const cols = 5, box = 92, blockW = box * 2 + 18, blockH = box + 46, labelGap = 6;
  const rowsN = Math.ceil(rows.length / cols);
  const c = makeCanvas(16 + cols * blockW + (cols - 1) * 6, 34 + rowsN * blockH + 10);
  drawText(c, 'MISTVALE MONSTERS3  HEROLOOM RESTYLE  BEFORE | AFTER', 12, 8, 2, [255, 220, 160]);
  rows.forEach((row, i) => {
    const cx = 12 + (i % cols) * (blockW + 6);
    const cy = 30 + Math.floor(i / cols) * blockH;
    drawText(c, row.id, cx, cy, 2, [235, 235, 240]);
    checkerRect(c, cx, cy + 14, box, box);
    checkerRect(c, cx + box + 6, cy + 14, box, box);
    blitFit(c, row.before, row.fr.x, row.fr.y, row.fr.w, row.fr.h, cx, cy + 14, box, box);
    blitFit(c, row.after, row.fr.x, row.fr.y, row.fr.w, row.fr.h, cx + box + 6, cy + 14, box, box);
    border(c, cx, cy + 14, box, box, [120, 100, 110]);
    border(c, cx + box + 6, cy + 14, box, box, [255, 190, 120]);
    drawText(c, 'OLD', cx, cy + 14 + box + 3, 2, [190, 190, 198]);
    drawText(c, 'NEW', cx + box + 6, cy + 14 + box + 3, 2, [255, 200, 140]);
  });
  savePng(path.join(PROOF, 'all-contact.png'), c);
}

// ---------------------------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { only: null, proofs: true, dryRun: false };
  for (const arg of argv) {
    if (arg.startsWith('--only=')) opts.only = arg.slice(7).split(',').map((s) => s.trim()).filter(Boolean);
    else if (arg === '--no-proofs') opts.proofs = false;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log('usage: node pipeline/scripts/heroloom/restyle-monsters3.mjs [--only=id,id] [--no-proofs] [--dry-run]');
    return;
  }
  const ids = fs.readdirSync(SRC)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .map((f) => f.slice(0, -5)).sort();
  if (!ids.length) throw new Error('no monsters3 json found in ' + SRC);
  const selected = opts.only ? ids.filter((id) => opts.only.includes(id)) : ids;
  if (!selected.length) throw new Error('--only= matched no monster id');

  fs.mkdirSync(OUT, { recursive: true });
  const report = { tool: 'pipeline/scripts/heroloom/restyle-monsters3.mjs', params: { MIX_EDGE, MIX_TOP, inkLadder: INK_ENTRIES.map((e) => e.hex) }, ids: [] };
  const proofRows = [];
  const compareIds = new Set(selected); // every processed id gets the required A/B proof

  for (const id of selected) {
    const pngFile = path.join(SRC, id + '.png');
    const metaFile = path.join(SRC, id + '.json');
    const img = decodePng(fs.readFileSync(pngFile));
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    const t0 = Date.now();
    const result = restyleSheet(img, id);
    const solid = new Uint8Array(img.width * img.height);
    for (let i = 0, p = 3; i < solid.length; i++, p += 4) solid[i] = img.rgba[p] >= 128 ? 1 : 0;
    const enc = encodeResult(result.width, result.height, result.rgba, solid);
    const outFile = path.join(OUT, id + '.png');
    if (!opts.dryRun) {
      fs.writeFileSync(outFile, enc.buf);
      fs.copyFileSync(metaFile, path.join(OUT, id + '.json')); // byte-identical meta = identical geometry
    }
    const m = result.metrics;
    report.ids.push({
      id, width: img.width, height: img.height, bytes: enc.buf.length, encoder: enc.encoder,
      colorsBefore: m.colorsBefore, colorsAfter: m.colorsAfter, palette: enc.paletteHex,
      inkPct: m.inkPct, edgeInkPct: m.edgeInkPct, rimPixels: m.rimPixels,
      rampPct: m.rampPct, meanRampDist: m.meanRampDist, hueShift: m.hueShift, ms: Date.now() - t0,
    });
    console.log(
      `${id.padEnd(11)} colors ${String(m.colorsBefore).padStart(3)} -> ${String(m.colorsAfter).padEnd(3)}` +
      ` ink ${String(m.inkPct).padStart(5)}%  rim ${String(m.rimPixels).padStart(6)}px` +
      `  ramp ${String(m.rampPct).padStart(6)}%  dist ${m.meanRampDist.toFixed(4)}  hueD ${String(m.hueShift).padStart(6)}` +
      `  ${enc.buf.length >= 1024 ? (enc.buf.length / 1024).toFixed(1) + 'KB' : enc.buf.length + 'B'}  ${Date.now() - t0}ms`
    );
    if (opts.proofs && compareIds.has(id)) proofRows.push({ id, meta, before: img, after: { width: result.width, height: result.height, rgba: result.rgba }, fr: idleFrame(meta, img) });
  }

  if (!opts.dryRun) {
    fs.mkdirSync(PROOF, { recursive: true });
    fs.writeFileSync(path.join(PROOF, 'restyle-report.json'), JSON.stringify(report, null, 2) + '\n');
  }
  if (opts.proofs && !opts.dryRun) {
    for (const row of proofRows) {
      proofCompare(row.id, row.meta, row.before, { width: row.after.width, height: row.after.height, rgba: row.after.rgba }, path.join(PROOF, 'compare-' + row.id + '.png'));
    }
    proofContact(proofRows);
    console.log(`\nproofs: ${PROOF}  (${proofRows.length} compare-<id>.png + all-contact.png)`);
  }
  console.log(`\nrestyled ${selected.length} sheet(s)${opts.dryRun ? ' (dry run, nothing written)' : ' -> assets/heroloom-monsters3/'}`);
}

main();
