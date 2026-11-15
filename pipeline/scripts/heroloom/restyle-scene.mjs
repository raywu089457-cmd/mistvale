// pipeline/scripts/heroloom/restyle-scene.mjs — deterministic HeroLoom restyle of the EXISTING scene art.
//
// What it does (no redrawing, no image model):
//   * decodes each original PNG with the dependency-free codec in png.mjs
//   * applies a hue-preserving colour transform in OKLab: lift shadows, pull chroma down a little,
//     quantise L / C / hue to a small pixel-art grid (hue quantised at +/-7.5 deg, so every material
//     keeps its hue family: greens stay green, water stays teal-blue, snow stays near-white, ...)
//   * darkens the 1-2 px rim inside the silhouette toward the HeroLoom outline plum (never adds pixels)
//   * repairs tile seams by making the two opposite edge columns/rows exactly equal and easing the
//     correction over a 10 px band, so repeating tiles and repeating atlas cells are truly seamless
//   * keeps the alpha mask byte-exact and the dimensions byte-exact
//   * encodes each output as an indexed PNG when it has <= 256 colours, RGBA otherwise
//
// plaza.png is the one asset that is not a straight restyle: the original plaza tile is byte-identical
// to assets/xilurus/tex-stone.png and carries a hard 1 px border (light top/left, dark right/bottom)
// that is impossible to tile. The matching HeroLoom art already has a seamless stone slab tile
// (assets/heroloom-buildings/terrain/stone.png, lr/tb = 0.00), so plaza is built from that tile with a
// warm-stone luminance ladder. This is documented in docs/HEROLOOM-SCENE.md.
//
// Usage: node pipeline/scripts/heroloom/restyle-scene.mjs
// Outputs: assets/heroloom-scene/** (mirrors the original relative names; originals are untouched)

import fs from 'node:fs';
import path from 'node:path';
import { decodePng, encodeRgba, encodeIndexed, isBinaryAlpha } from './png.mjs';
import {
  srgbToOklab, oklabToSrgb, packRgb, unpackRgb, rgbHex,
  regionStats, paletteDistance, uniqueOpaqueColors, edgeMismatch, coverage, meanHueShift,
} from './scene-color.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const SRC = path.join(ROOT, 'assets');
const OUT = path.join(SRC, 'heroloom-scene');

const PARAMS = {
  // shadow lift: L' = L + liftRel*(1-L) + liftAbs  (about +5..10% value in the dark/mid range)
  liftRel: 0.06,
  liftAbs: 0.012,
  // chroma: keep the material's hue, but mute it slightly toward the HeroLoom pastel ramps
  chromaScale: 0.90,
  chromaMax: 0.14,
  // below this chroma a colour is treated as neutral (grey stone, snow); it gets a tiny warm bias
  neutralC: 0.018,
  // pixel-art quantisation grid (hue step 15 deg => the source hue is preserved within +/-7.5 deg)
  hueStep: 15,
  chromaStep: 0.02,
  lStep: 0.04,
  // 1 px (or 2 px at @2x) darker rim blending toward the HeroLoom outline
  rim1x: 0.35,
  rim2xNear: 0.30,
  rim2xFar: 0.13,
  // seam-repair ease band in px
  seamBand: 10,
  outline: [21, 13, 27], // #150d1b HeroLoom outline
};

// ---------------------------------------------------------------------------------------------
// reference ramp (HeroLoom buildings / outfits / paperdoll parts) — reference metadata + QA only
// ---------------------------------------------------------------------------------------------

const REF_DIRS = ['assets/heroloom-buildings', 'assets/heroloom-outfits', 'assets/heroloom/parts'];
const CORE_RAMP_SIZE = 96;

function listPngs(relDir) {
  const out = [];
  const walk = (abs) => {
    for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
      const p = path.join(abs, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.toLowerCase().endsWith('.png')) out.push(p);
    }
  };
  walk(path.join(ROOT, relDir));
  return out.sort();
}

function sampleReference() {
  const counts = new Map();
  const files = REF_DIRS.flatMap(listPngs);
  for (const file of files) {
    const img = decodePng(fs.readFileSync(file));
    for (let i = 0; i < img.rgba.length; i += 4) {
      if (img.rgba[i + 3] < 128) continue;
      const key = packRgb(img.rgba[i], img.rgba[i + 1], img.rgba[i + 2]);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return { counts, files };
}

function makeBox(items) {
  let wsum = 0;
  const mins = [Infinity, Infinity, Infinity], maxs = [-Infinity, -Infinity, -Infinity];
  const axes = ['L', 'a', 'b'];
  for (const it of items) {
    wsum += it.w;
    axes.forEach((ax, k) => {
      const v = it.lab[ax];
      if (v < mins[k]) mins[k] = v;
      if (v > maxs[k]) maxs[k] = v;
    });
  }
  let axis = 0;
  for (let k = 1; k < 3; k++) if (maxs[k] - mins[k] > maxs[axis] - mins[axis]) axis = k;
  return { items, wsum, axis: axes[axis], range: maxs[axis] - mins[axis] };
}

function medianCutRamp({ counts }, size) {
  const entries = [];
  for (const [key, w] of counts) {
    const [r, g, b] = unpackRgb(key);
    entries.push({ r, g, b, lab: srgbToOklab(r, g, b), w: Math.pow(w, 0.45) });
  }
  let boxes = [makeBox(entries)];
  while (boxes.length < size) {
    let best = -1, bestScore = -1;
    boxes.forEach((box, i) => {
      if (box.items.length < 2) return;
      const score = box.wsum * box.range;
      if (score > bestScore) { bestScore = score; best = i; }
    });
    if (best < 0) break;
    const box = boxes[best];
    const axis = box.axis;
    const sorted = box.items.slice().sort((p, q) => p.lab[axis] - q.lab[axis] || p.r - q.r || p.g - q.g || p.b - q.b);
    const half = sorted.reduce((s, it) => s + it.w, 0) / 2;
    let acc = 0, cut = 1;
    for (let i = 0; i < sorted.length - 1; i++) {
      acc += sorted[i].w;
      cut = i + 1;
      if (acc >= half) break;
    }
    const left = sorted.slice(0, cut), right = sorted.slice(cut);
    if (!left.length || !right.length) break;
    boxes.splice(best, 1, makeBox(left), makeBox(right));
  }
  const ramp = boxes.map((box) => {
    let r = 0, g = 0, b = 0, w = 0;
    for (const it of box.items) { r += it.r * it.w; g += it.g * it.w; b += it.b * it.w; w += it.w; }
    const rgb = [Math.round(r / w), Math.round(g / w), Math.round(b / w)];
    const lab = srgbToOklab(rgb[0], rgb[1], rgb[2]);
    return { r: rgb[0], g: rgb[1], b: rgb[2], L: lab.L, la: lab.a, lb: lab.b, w: +box.wsum.toFixed(1) };
  });
  // dedupe (median cut on a small unique-colour set can repeat) and sort by lightness
  const seen = new Set();
  const unique = [];
  for (const e of ramp.sort((p, q) => p.L - q.L)) {
    const key = packRgb(e.r, e.g, e.b);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(e);
  }
  return unique;
}

// ---------------------------------------------------------------------------------------------
// colour transform
// ---------------------------------------------------------------------------------------------

const OUT_LAB = srgbToOklab(...PARAMS.outline);
const HUE_STEP_RAD = PARAMS.hueStep * Math.PI / 180;

function lerp(a, b, t) { return a + (b - a) * t; }

/** sRGB float (0..255) from OKLab, unrounded and unclamped-then-clamped. */
function labToSrgbFloat(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  const enc = (v) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055;
    return Math.min(255, Math.max(0, 255 * c));
  };
  return [enc(lr), enc(lg), enc(lb)];
}

/** Continuous (pre-quantisation) transform of one source colour, optionally rim-blended toward the outline. */
function transformContinuous(r, g, b, rim) {
  let { L, a, b: lb } = srgbToOklab(r, g, b);
  if (rim > 0) {
    L = lerp(L, OUT_LAB.L, rim);
    a = lerp(a, OUT_LAB.a, rim);
    lb = lerp(lb, OUT_LAB.b, rim);
  }
  L = L + PARAMS.liftRel * (1 - L) + PARAMS.liftAbs;
  const C = Math.hypot(a, lb);
  if (C < PARAMS.neutralC) {
    // neutral: keep the small tint, warm it a touch, keep lightness structure untouched
    const a2 = a * 0.35 + 0.002;
    const b2 = lb * 0.35 + 0.010;
    return labToSrgbFloat(Math.min(0.975, Math.max(0.02, L)), a2, b2);
  }
  const C2 = Math.min(C * PARAMS.chromaScale, PARAMS.chromaMax);
  const rad = Math.atan2(lb, a);
  return labToSrgbFloat(Math.min(0.975, Math.max(0.02, L)), C2 * Math.cos(rad), C2 * Math.sin(rad));
}

/** Quantise an sRGB colour onto the pixel-art grid (L 0.04 / C 0.02 / hue 15 deg). */
function quantizeRgb(r, g, b) {
  let { L, a, b: lb } = srgbToOklab(r, g, b);
  const Lq = Math.min(0.98, Math.max(0.02, Math.round(L / PARAMS.lStep) * PARAMS.lStep));
  const C = Math.hypot(a, lb);
  if (C < PARAMS.neutralC) return oklabToSrgb(Lq, a * 0.35 + 0.002, lb * 0.35 + 0.010);
  const C2 = Math.min(C * PARAMS.chromaScale, PARAMS.chromaMax);
  const Cq = Math.max(PARAMS.chromaStep, Math.round(C2 / PARAMS.chromaStep) * PARAMS.chromaStep);
  const rad = Math.atan2(lb, a);
  const hq = Math.round(rad / HUE_STEP_RAD) * HUE_STEP_RAD;
  return oklabToSrgb(Lq, Cq * Math.cos(hq), Cq * Math.sin(hq));
}

const RIM_INDEX = { none: 0, near1x: 1, near2x: 2, far2x: 3 };
const RIM_FACTOR = [0, PARAMS.rim1x, PARAMS.rim2xNear, PARAMS.rim2xFar];

/** Cache of continuous transforms, keyed by packed source rgb + rim index. */
function makeContinuousCache() {
  const cache = new Map();
  return (r, g, b, rimIdx) => {
    const key = packRgb(r, g, b) * 4 + rimIdx;
    let v = cache.get(key);
    if (v === undefined) {
      v = transformContinuous(r, g, b, RIM_FACTOR[rimIdx]);
      cache.set(key, v);
    }
    return v;
  };
}

/** Rim index per pixel: 0 = interior, 1 = 1px from transparency, 2 = 2px at @2x far ring. */
function rimField(rgba, w, h, mode) {
  const idx = new Uint8Array(w * h);
  const isTransparent = (x, y) => x < 0 || y < 0 || x >= w || y >= h || rgba[(y * w + x) * 4 + 3] < 128;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] < 128) continue;
      let found = 0;
      for (let dy = -1; dy <= 1 && !found; dy++) {
        for (let dx = -1; dx <= 1 && !found; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (isTransparent(x + dx, y + dy)) found = 1;
        }
      }
      if (!found && mode === '2x') {
        for (let dy = -2; dy <= 2 && !found; dy++) {
          for (let dx = -2; dx <= 2 && !found; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== 2) continue;
            if (isTransparent(x + dx, y + dy)) found = 2;
          }
        }
      }
      idx[y * w + x] = found;
    }
  }
  return idx;
}

/**
 * Continuous restyle pass: returns Float32Array(w*h*3) of sRGB 0..255 floats (alpha handled separately).
 * rimMode: 'none' | '1x' | '2x'
 */
function continuousPass(rgba, w, h, rimMode) {
  const map = makeContinuousCache();
  const f = new Float32Array(w * h * 3);
  const rim = rimMode === 'none' ? null : rimField(rgba, w, h, rimMode);
  for (let i = 0, p = 0, o = 0; i < w * h; i++, p += 4, o += 3) {
    if (rgba[p + 3] < 128) continue;
    const rimIdx = rim ? (rim[i] === 2 ? RIM_INDEX.far2x : rim[i] === 1 ? (rimMode === '2x' ? RIM_INDEX.near2x : RIM_INDEX.near1x) : 0) : 0;
    const v = map(rgba[p], rgba[p + 1], rgba[p + 2], rimIdx);
    f[o] = v[0]; f[o + 1] = v[1]; f[o + 2] = v[2];
  }
  return f;
}

/** Force the opposite edge columns (lr) / rows (tb) of a region to be exactly equal, easing over `band` px. */
function seamRepairRegion(f, imgW, imgH, x0, y0, w, h, band) {
  const at = (x, y) => (y * imgW + x) * 3;
  const ease = (d) => (d <= 0 ? 1 : Math.max(0, 1 - d / band));
  // left/right columns
  for (let y = y0; y < y0 + h; y++) {
    const L = at(x0, y), R = at(x0 + w - 1, y);
    const delta = [0, 1, 2].map((c) => (f[R + c] - f[L + c]) / 2);
    for (let d = 0; d <= band && d < Math.floor(w / 2); d++) {
      const t = ease(d);
      const Lp = at(x0 + d, y), Rp = at(x0 + w - 1 - d, y);
      for (let c = 0; c < 3; c++) {
        f[Lp + c] += delta[c] * t;
        f[Rp + c] -= delta[c] * t;
      }
    }
  }
  // top/bottom rows
  for (let x = x0; x < x0 + w; x++) {
    const T = at(x, y0), B = at(x, y0 + h - 1);
    const delta = [0, 1, 2].map((c) => (f[B + c] - f[T + c]) / 2);
    for (let d = 0; d <= band && d < Math.floor(h / 2); d++) {
      const t = ease(d);
      const Tp = at(x, y0 + d), Bp = at(x, y0 + h - 1 - d);
      for (let c = 0; c < 3; c++) {
        f[Tp + c] += delta[c] * t;
        f[Bp + c] -= delta[c] * t;
      }
    }
  }
}

/** Quantise a continuous float buffer into an RGBA byte buffer, preserving the source alpha mask. */
function quantizePass(f, srcRgba) {
  const out = new Uint8Array(f.length / 3 * 4);
  for (let i = 0, o = 0, p = 0; i < f.length / 3; i++, o += 3, p += 4) {
    const a = srcRgba[p + 3];
    if (a < 128) {
      out[p] = 0; out[p + 1] = 0; out[p + 2] = 0; out[p + 3] = 0;
      continue;
    }
    const q = quantizeRgb(Math.round(f[o]), Math.round(f[o + 1]), Math.round(f[o + 2]));
    out[p] = q[0]; out[p + 1] = q[1]; out[p + 2] = q[2]; out[p + 3] = a;
  }
  return out;
}

/** Copy one rectangular region out of an RGBA sheet (for per-cell metrics). */
function cropRgba(rgba, imgW, r) {
  const copy = new Uint8Array(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++) {
    const src = ((r.y + y) * imgW + r.x) * 4;
    copy.set(rgba.subarray(src, src + r.w * 4), y * r.w * 4);
  }
  return copy;
}

// ---------------------------------------------------------------------------------------------
// palette-based encoding
// ---------------------------------------------------------------------------------------------

function encodeOutput(relOut, width, height, rgba) {
  const counts = uniqueOpaqueColors(rgba);
  let hasTransparent = false;
  let semi = false;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] === 0) hasTransparent = true;
    else if (rgba[i] !== 255) semi = true;
  }
  const paletteHex = [];
  let buf, encoder;
  if (!semi && counts.size + (hasTransparent ? 1 : 0) <= 256) {
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
      if (rgba[p + 3] === 0) { indices[i] = transparentIndex; continue; }
      indices[i] = indexOf.get(packRgb(rgba[p], rgba[p + 1], rgba[p + 2]));
    }
    buf = encodeIndexed(width, height, indices, palette, transparentIndex);
    encoder = 'indexed';
  } else {
    const clean = new Uint8Array(rgba);
    for (let i = 0; i < clean.length; i += 4) {
      if (clean[i + 3] === 0) { clean[i] = 0; clean[i + 1] = 0; clean[i + 2] = 0; }
    }
    for (const key of [...counts.keys()].sort((p, q) => p - q)) {
      const [r, g, b] = unpackRgb(key);
      paletteHex.push(rgbHex(r, g, b));
    }
    buf = encodeRgba(width, height, clean);
    encoder = 'rgba';
  }
  const abs = path.join(OUT, relOut);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buf);
  return { buf, encoder, paletteHex, hasTransparent, bytes: buf.length };
}

// ---------------------------------------------------------------------------------------------
// per-file restyle
// ---------------------------------------------------------------------------------------------

const report = { tool: 'pipeline/scripts/heroloom/restyle-scene.mjs', params: PARAMS, files: [] };

function loadSrc(rel) {
  const file = path.join(SRC, rel);
  const img = decodePng(fs.readFileSync(file));
  return { file, img };
}

function sameAlphaMask(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 3; i < a.length; i += 4) if (a[i] !== b[i]) return false;
  return true;
}

function fileMetrics({ rel, srcRgba, srcW, srcH, outRgba, outW, outH, enc, cores, regions, rimMode }) {
  const before = regionStats(srcRgba, srcW);
  const after = regionStats(outRgba, outW);
  const entry = {
    rel,
    outRel: rel,
    width: outW,
    height: outH,
    dimsMatch: srcW === outW && srcH === outH,
    encoder: enc.encoder,
    bytes: enc.bytes,
    palette: enc.paletteHex,
    colorsBefore: uniqueOpaqueColors(srcRgba).size,
    colorsAfter: uniqueOpaqueColors(outRgba).size,
    coverageBefore: +coverage(srcRgba).toFixed(4),
    coverageAfter: +coverage(outRgba).toFixed(4),
    alphaMaskSame: sameAlphaMask(srcRgba, outRgba),
    syntax: { rimMode },
    geometry: {
      lrBefore: srcW > 1 ? edgeMismatch(srcRgba, srcW, srcH, 'lr') : null,
      tbBefore: srcH > 1 ? edgeMismatch(srcRgba, srcW, srcH, 'tb') : null,
      lr: edgeMismatch(outRgba, outW, outH, 'lr'),
      tb: edgeMismatch(outRgba, outW, outH, 'tb'),
    },
    hue: {
      before,
      after,
      meanShift: meanHueShift(srcRgba, outRgba),
    },
    paletteDistance: {
      coreRampBefore: paletteDistance(srcRgba, cores).meanDist,
      coreRampAfter: paletteDistance(outRgba, cores).meanDist,
    },
  };
  if (regions && regions.length) {
    entry.regions = regions.map((r) => {
      const b = regionStats(srcRgba, srcW, r.x, r.y, r.w, r.h);
      const a = regionStats(outRgba, outW, r.x, r.y, r.w, r.h);
      const srcCell = cropRgba(srcRgba, srcW, r);
      const outCell = cropRgba(outRgba, outW, r);
      return {
        name: r.name,
        x: r.x, y: r.y, w: r.w, h: r.h,
        lr: cellEdge(outRgba, outW, r, 'lr'),
        tb: cellEdge(outRgba, outW, r, 'tb'),
        hueBefore: b.meanHue,
        hueAfter: a.meanHue,
        hueShift: meanHueShift(srcCell, outCell),
        Lbefore: b.meanL,
        Lafter: a.meanL,
        Cbefore: b.meanC,
        Cafter: a.meanC,
        hueBeforeTop: b.topBuckets,
        hueAfterTop: a.topBuckets,
      };
    });
  }
  return entry;
}

/** Edge mismatch of one region inside a larger sheet (the test the game applies per atlas cell). */
function cellEdge(rgba, imgW, r, mode) {
  return edgeMismatch(cropRgba(rgba, imgW, r), r.w, r.h, mode);
}

function processOpaqueAtlas(rel, opts) {
  const { img } = loadSrc(rel);
  const f = continuousPass(img.rgba, img.width, img.height, 'none');
  const regions = opts && opts.regions;
  for (const r of regions || []) seamRepairRegion(f, img.width, img.height, r.x, r.y, r.w, r.h, PARAMS.seamBand);
  const out = quantizePass(f, img.rgba);
  const enc = encodeOutput(rel, img.width, img.height, out);
  const entry = fileMetrics({
    rel, srcRgba: img.rgba, srcW: img.width, srcH: img.height,
    outRgba: out, outW: img.width, outH: img.height, enc, cores: report.ramp, regions, rimMode: 'none',
  });
  report.files.push(entry);
  console.log(`  ${rel.padEnd(22)} ${img.width}x${img.height}  ${enc.encoder.padEnd(7)} ${String(entry.colorsBefore).padStart(3)} -> ${String(entry.colorsAfter).padEnd(3)} colors  seam ${entry.geometry.lr}/${entry.geometry.tb}  hue ${entry.hue.before.meanHue} -> ${entry.hue.after.meanHue}`);
  return entry;
}

function processAlphaAtlas(rel) {
  const { img } = loadSrc(rel);
  if (!isBinaryAlpha(img.rgba)) throw new Error(rel + ': expected binary alpha');
  const rimMode = rel.endsWith('@2x.png') ? '2x' : '1x';
  const f = continuousPass(img.rgba, img.width, img.height, rimMode);
  const out = quantizePass(f, img.rgba);
  const enc = encodeOutput(rel, img.width, img.height, out);
  const entry = fileMetrics({
    rel, srcRgba: img.rgba, srcW: img.width, srcH: img.height,
    outRgba: out, outW: img.width, outH: img.height, enc, cores: report.ramp, rimMode,
  });
  report.files.push(entry);
  console.log(`  ${rel.padEnd(22)} ${img.width}x${img.height}  ${enc.encoder.padEnd(7)} ${String(entry.colorsBefore).padStart(3)} -> ${String(entry.colorsAfter).padEnd(3)} colors  alpha=${entry.alphaMaskSame ? 'exact' : 'CHANGED'}  hue ${entry.hue.before.meanHue} -> ${entry.hue.after.meanHue}`);
  return entry;
}

// warm-stone ladder for plaza (OKLab interpolation between 8 warm-grey stops: stone, not wood, but
// clearly warmer than the old cool #4a4b53..#dbdee5 paving)
const WARM_STONE = [
  [56, 48, 44],    // #38302c dark joint shadow
  [84, 72, 64],    // #544840 joint
  [112, 98, 88],   // #706258 slab dark
  [140, 125, 112], // #8c7d70 slab mid
  [166, 151, 136], // #a69788 slab light
  [190, 176, 160], // #beb0a0 slab highlight
  [212, 199, 183], // #d4c7b7 worn edge
  [232, 221, 207], // #e8ddcf top highlight
];

function processPlaza() {
  const rel = 'plaza.png';
  const stoneRel = 'heroloom-buildings/terrain/stone.png';
  const { img: stone } = loadSrc(stoneRel);
  const counts = uniqueOpaqueColors(stone.rgba);
  const colors = [...counts.keys()].map((key) => {
    const [r, g, b] = unpackRgb(key);
    const lab = srgbToOklab(r, g, b);
    return { r, g, b, lab, key };
  }).sort((p, q) => p.lab.L - q.lab.L);
  const stopLabs = WARM_STONE.map(([r, g, b]) => srgbToOklab(r, g, b));
  const map = new Map();
  const plazaPalette = [];
  colors.forEach((c, i) => {
    const t = colors.length === 1 ? 0 : i / (colors.length - 1);
    const pos = t * (stopLabs.length - 1);
    const lo = Math.floor(pos), hi = Math.min(stopLabs.length - 1, lo + 1);
    const tt = pos - lo;
    const rgb = oklabToSrgb(
      lerp(stopLabs[lo].L, stopLabs[hi].L, tt),
      lerp(stopLabs[lo].a, stopLabs[hi].a, tt),
      lerp(stopLabs[lo].b, stopLabs[hi].b, tt),
    );
    map.set(c.key, rgb);
    plazaPalette.push(rgbHex(rgb[0], rgb[1], rgb[2]));
  });
  const out = new Uint8Array(stone.rgba.length);
  for (let p = 0; p < stone.rgba.length; p += 4) {
    const rgb = map.get(packRgb(stone.rgba[p], stone.rgba[p + 1], stone.rgba[p + 2])) || [0, 0, 0];
    out[p] = rgb[0]; out[p + 1] = rgb[1]; out[p + 2] = rgb[2]; out[p + 3] = 255;
  }
  const enc = encodeOutput(rel, stone.width, stone.height, out);
  const entry = fileMetrics({
    rel, srcRgba: stone.rgba, srcW: stone.width, srcH: stone.height,
    outRgba: out, outW: stone.width, outH: stone.height, enc, cores: report.ramp, rimMode: 'none',
  });
  entry.source = stoneRel;
  entry.note = 'plaza is rebuilt from the matching seamless HeroLoom stone tile (original plaza has a hard 1px border seam)';
  entry.plazaPalette = plazaPalette;
  report.files.push(entry);
  console.log(`  ${rel.padEnd(22)} ${stone.width}x${stone.height}  ${enc.encoder.padEnd(7)} ${String(entry.colorsBefore).padStart(3)} -> ${String(entry.colorsAfter).padEnd(3)} colors  seam ${entry.geometry.lr}/${entry.geometry.tb}  L ${entry.hue.before.meanL} -> ${entry.hue.after.meanL}`);
  return entry;
}

function processBiomeTile(name) {
  const rel = `xilurus/tex-${name}.png`;
  const sourceRel = name === 'stone' ? 'heroloom-buildings/terrain/stone.png' : rel;
  const { img } = loadSrc(sourceRel);
  const f = continuousPass(img.rgba, img.width, img.height, 'none');
  seamRepairRegion(f, img.width, img.height, 0, 0, img.width, img.height, PARAMS.seamBand);
  const out = quantizePass(f, img.rgba);
  const enc = encodeOutput(rel, img.width, img.height, out);
  const entry = fileMetrics({
    rel, srcRgba: img.rgba, srcW: img.width, srcH: img.height,
    outRgba: out, outW: img.width, outH: img.height, enc, cores: report.ramp, rimMode: 'none',
  });
  entry.source = sourceRel;
  report.files.push(entry);
  console.log(`  ${rel.padEnd(22)} ${img.width}x${img.height}  ${enc.encoder.padEnd(7)} ${String(entry.colorsBefore).padStart(3)} -> ${String(entry.colorsAfter).padEnd(3)} colors  seam ${entry.geometry.lr}/${entry.geometry.tb}  hue ${entry.hue.before.meanHue} -> ${entry.hue.after.meanHue}  L ${entry.hue.before.meanL} -> ${entry.hue.after.meanL}`);
  return entry;
}

// ---------------------------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------------------------

const ALPHA_ATLASES = ['woods', 'flora', 'props', 'details', 'cold', 'villagers'];
const BIOMES = ['desert', 'dirt', 'forest', 'grass', 'ice', 'meadow', 'mountain', 'snow', 'soil', 'stone', 'taiga', 'water'];

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  console.log('HeroLoom scene restyle');
  console.log('  sampling HeroLoom reference ramp ...');
  const ref = sampleReference();
  const ramp = medianCutRamp(ref, CORE_RAMP_SIZE);
  report.ramp = ramp;
  report.reference = { files: ref.files.length, uniqueColors: ref.counts.size, rampEntries: ramp.length };
  console.log(`  reference: ${ref.files.length} PNGs, ${ref.counts.size} unique colours, ramp ${ramp.length} entries`);
  fs.writeFileSync(path.join(OUT, 'palette.json'), JSON.stringify({
    version: 1,
    kind: 'mistvale-heroloom-scene-palette',
    generator: 'pipeline/scripts/heroloom/restyle-scene.mjs',
    note: 'HeroLoom reference ramp (metadata + QA). Scene content is hue-preserved, not snapped onto this ramp.',
    referenceFiles: ref.files.length,
    referenceUniqueColors: ref.counts.size,
    coreRamp: ramp.map((e) => ({ hex: rgbHex(e.r, e.g, e.b), r: e.r, g: e.g, b: e.b, L: +e.L.toFixed(4), la: +e.la.toFixed(4), lb: +e.lb.toFixed(4), weight: e.w })),
  }, null, 2) + '\n');

  console.log('\n plaza:');
  processPlaza();

  console.log('\n terrain atlas:');
  const terrainRel = 'terrain-atlas.png';
  const terrainManifest = JSON.parse(fs.readFileSync(path.join(SRC, 'terrain-atlas.manifest.json'), 'utf8'));
  const cells = Object.entries(terrainManifest.cells).map(([name, c]) => ({ name, x: c.x, y: c.y, w: c.w, h: c.h }));
  processOpaqueAtlas(terrainRel, { regions: cells });

  console.log('\n alpha atlases:');
  for (const name of ALPHA_ATLASES) {
    processAlphaAtlas(`${name}@1x.png`);
    processAlphaAtlas(`${name}@2x.png`);
  }

  console.log('\n biome tiles:');
  for (const name of BIOMES) processBiomeTile(name);

  fs.writeFileSync(path.join(OUT, 'restyle-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`\nwrote ${report.files.length} PNGs + palette.json + restyle-report.json to assets/heroloom-scene/`);
}

main();
