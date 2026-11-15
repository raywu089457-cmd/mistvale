// src/heroloom-buildings.js — HeroLoom-style building + terrain drop-in pack.
//
// Pure module: no DOM, no fs, nothing loaded at import time. Tests: test-heroloom-monsters.mjs.
// docs/HEROLOOM-BUILDINGS.md has the contract the Lead applies in build.mjs / pixel-world.js.
//
// Pack layout (art-gen writes it, the Lead places it under assets/heroloom-buildings/):
//   assets/heroloom-buildings/<id>.png          single keyed (alpha) building, one of hall/inn/
//                                               tavern/forge/house; drop-in for assets/xilurus/<id>.png
//   assets/heroloom-buildings/terrain/<name>.png seamless terrain tile for grass/earth/stone
//
// build.mjs prefers the HeroLoom file when it exists and keeps emitting the same PIXEL_ASSETS keys
// (PIXEL_ASSETS.hall, .inn, ... + alphaAssets.<id> = true; conceptGrass/conceptEarth/conceptStone
// for terrain), so pixel-world.js needs no drawing changes.
//
// A building PNG is accepted only when it is a PNG with an alpha channel, 700-1500 px tall, and its
// width/height ratio is inside HEROLOOM_BUILDING_ASPECT_BAND *of* the xilurus reference ratio for
// that id (computed from assets/xilurus/<id>.png by the checker). This keeps a re-drawn building in
// the same silhouette family as the building it replaces instead of a wildly wider/taller sprite.

/** Building ids the drop-in pack may replace (all of them exist in assets/xilurus/). */
export const LOOM_BUILDINGS = Object.freeze({
  hall: Object.freeze({ label: '城鎮大廳' }),
  inn: Object.freeze({ label: '旅館' }),
  tavern: Object.freeze({ label: '酒館' }),
  forge: Object.freeze({ label: '鐵匠鋪' }),
  house: Object.freeze({ label: '獵人小屋' }),
});

/** Terrain concept textures the pack may replace (the 3 the village ground layer uses). */
export const LOOM_TERRAIN = Object.freeze({
  grass: Object.freeze({ label: '草地' }),
  earth: Object.freeze({ label: '泥土' }),
  stone: Object.freeze({ label: '石地' }),
});

export const HEROLOOM_BUILDING_IDS = Object.freeze(Object.keys(LOOM_BUILDINGS));
export const HEROLOOM_TERRAIN_NAMES = Object.freeze(Object.keys(LOOM_TERRAIN));

/** Accepted delivered aspect ratio, relative to the xilurus reference for the same id.
 *  A drop-in building shares the replaced building's footprint, so relative ≈ 1.0 is the target;
 *  ±20% is enough room for a HeroLoom-style redraw that is a little wider or narrower. */
export const HEROLOOM_BUILDING_ASPECT_BAND = Object.freeze({ min: 0.8, max: 1.2 });
/** Accepted pixel height of a delivered building PNG. */
export const HEROLOOM_BUILDING_HEIGHT = Object.freeze({ min: 700, max: 1500 });
/** Where the original building references live (used by the checker to compute the band). */
export const HEROLOOM_BUILDING_REFERENCE_DIR = 'assets/xilurus';

/** Base URL of the building pack; build.mjs emits media/heroloom-buildings/. */
export function HEROLOOM_BUILDINGS_BASE() {
  const a = globalThis.PIXEL_ASSETS;
  return (a && a.heroloomBuildingsBase) || 'media/heroloom-buildings/';
}

const joinBase = (base, rel) => String(base || '').replace(/\/+$/, '') + '/' + String(rel || '').replace(/^\/+/, '');

/** URL of the HeroLoom replacement for building <id> (e.g. .../heroloom-buildings/hall.png). */
export function buildingUrl(id) {
  return joinBase(HEROLOOM_BUILDINGS_BASE(), String(id) + '.png');
}

/** URL of the HeroLoom seamless terrain tile <name> (grass/earth/stone). */
export function terrainUrl(name) {
  return joinBase(HEROLOOM_BUILDINGS_BASE(), 'terrain/' + String(name) + '.png');
}

/* -------------------------------------------------------------------------------------------- */
/* PNG header parsing + aspect helpers                                                           */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const readU32 = (b, o) => (((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0);

/**
 * Read a PNG header without an image library. Accepts a Buffer/Uint8Array/ArrayBuffer (26 bytes is
 * enough; a whole file also works and lets the chunk scan find tRNS) or a {width, height,
 * colorType?, hasTRNS?, alpha?} object. Returns {ok, width, height, colorType, hasTRNS, alpha,
 * errors?}; alpha is null when it cannot be determined from the input.
 */
export function pngHeaderInfo(input) {
  if (input == null) return { ok: false, errors: ['missing PNG header (pass a Buffer/Uint8Array or {width,height})'] };
  let bytes = null;
  if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
  else if (input instanceof Uint8Array) bytes = input;
  else if (typeof input === 'object' && typeof input.width === 'number' && typeof input.height === 'number') {
    if (!(input.width > 0 && input.height > 0)) return { ok: false, errors: ['PNG width/height must be positive numbers'] };
    const colorType = Number.isFinite(input.colorType) ? input.colorType : null;
    const hasTRNS = !!(input.hasTRNS || input.trns);
    let alpha = typeof input.alpha === 'boolean' ? input.alpha : null;
    if (alpha == null && colorType != null) alpha = colorType === 4 || colorType === 6 || hasTRNS;
    return { ok: true, width: input.width, height: input.height, colorType, hasTRNS, alpha };
  }
  if (!bytes) return { ok: false, errors: ['PNG header must be a Buffer/Uint8Array or a {width,height} object'] };
  if (bytes.length < 26) return { ok: false, errors: ['PNG header too short (' + bytes.length + ' bytes, need at least 26)'] };
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return { ok: false, errors: ['PNG signature mismatch (not a PNG file)'] };
  }
  if (String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]) !== 'IHDR') {
    return { ok: false, errors: ['first PNG chunk is not IHDR'] };
  }
  const width = readU32(bytes, 16), height = readU32(bytes, 20);
  if (!(width > 0 && height > 0)) return { ok: false, errors: ['PNG IHDR width/height is zero'] };
  const colorType = bytes[25];
  let hasTRNS = false;
  let off = 8;
  while (off + 8 <= bytes.length) {
    const len = readU32(bytes, off);
    const type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]);
    if (type === 'tRNS') hasTRNS = true;
    if (type === 'IEND') break;
    off += 8 + len + 4;
    if (len > bytes.length) break;
  }
  return { ok: true, width, height, colorType, hasTRNS, alpha: colorType === 4 || colorType === 6 || hasTRNS };
}

/** width/height ratio, or null for non-positive/non-numeric input (e.g. a missing reference). */
export function aspectRatio(width, height) {
  const w = Number(width), h = Number(height);
  if (!(w > 0) || !(h > 0) || !Number.isFinite(w) || !Number.isFinite(h)) return null;
  return w / h;
}

/** {width, height, ratio} of a PNG header (or of a {width,height} object), or null when unreadable. */
export function buildingAspect(pngHeader) {
  const png = pngHeaderInfo(pngHeader);
  if (!png.ok) return null;
  return { width: png.width, height: png.height, ratio: aspectRatio(png.width, png.height) };
}

/** Delivered aspect / reference aspect; null when either side is unusable. */
export function relativeAspect(pngHeader, refWidth, refHeight) {
  const a = buildingAspect(pngHeader);
  const ref = aspectRatio(refWidth, refHeight);
  if (!a || !ref) return null;
  return a.ratio / ref;
}

/* -------------------------------------------------------------------------------------------- */
/* validation                                                                                    */

/**
 * Validate a delivered building PNG header against the HeroLoom drop-in contract.
 *
 * opts = {
 *   id,             building id (hall/inn/tavern/forge/house); optional
 *   refWidth, refHeight | refAspect,   the assets/xilurus/<id>.png reference (the checker computes
 *                   it from disk at runtime; required unless opts.skipAspect === true)
 *   aspectBand,     default HEROLOOM_BUILDING_ASPECT_BAND ({min:0.55,max:0.95})
 *   minHeight/maxHeight, default 700/1500
 *   requireAlpha,   default true
 *   skipAspect,     default false; set true only for a wire-format-only check
 * }
 *
 * Ratio convention: ratio = width / height, relative = (w/h) / (refW/refH). A delivered 2:3
 * building (0.667) against the hall reference (1120x1400 = 0.8) scores 0.833 and passes.
 * Returns {ok, errors, width, height, ratio, refRatio, relative}; never throws.
 */
export function validateBuildingPng(pngHeader, opts = {}) {
  const png = pngHeaderInfo(pngHeader);
  const out = {
    ok: false, errors: [], width: null, height: null, ratio: null, refRatio: null, relative: null,
  };
  if (!png.ok) { out.errors.push(...png.errors); return out; }
  out.width = png.width; out.height = png.height; out.ratio = aspectRatio(png.width, png.height);
  const err = (m) => out.errors.push(m);

  if (opts.requireAlpha !== false) {
    if (png.alpha !== true) {
      err('PNG must carry an alpha channel (RGBA/GA, or palette/greyscale + tRNS)' +
        (png.colorType != null ? '; IHDR colour type is ' + png.colorType : '; pass the raw PNG bytes or colorType'));
    }
  }
  const minH = Number.isFinite(opts.minHeight) ? opts.minHeight : HEROLOOM_BUILDING_HEIGHT.min;
  const maxH = Number.isFinite(opts.maxHeight) ? opts.maxHeight : HEROLOOM_BUILDING_HEIGHT.max;
  if (out.height < minH || out.height > maxH) {
    err('height ' + out.height + ' px outside the accepted ' + minH + '-' + maxH + ' px range');
  }
  if (opts.skipAspect !== true) {
    let refRatio = Number.isFinite(opts.refAspect) && opts.refAspect > 0 ? opts.refAspect : null;
    if (refRatio == null && Number.isFinite(opts.refWidth) && Number.isFinite(opts.refHeight)) {
      refRatio = aspectRatio(opts.refWidth, opts.refHeight);
    }
    if (refRatio == null) {
      err('reference aspect missing: pass refWidth/refHeight (or refAspect) from assets/xilurus/' +
        (opts.id || '<id>') + '.png');
    } else {
      const band = opts.aspectBand || HEROLOOM_BUILDING_ASPECT_BAND;
      out.refRatio = refRatio;
      out.relative = out.ratio / refRatio;
      if (out.relative < band.min || out.relative > band.max) {
        err('aspect ' + out.width + 'x' + out.height + ' = ' + out.ratio.toFixed(3) +
          ' is ' + out.relative.toFixed(3) + ' of the xilurus reference ' + refRatio.toFixed(3) +
          ', outside the accepted ' + band.min + '-' + band.max + ' band');
      }
    }
  }
  if (opts.id != null && !(String(opts.id) in LOOM_BUILDINGS)) {
    err('unknown building id "' + opts.id + '" (expected one of ' + HEROLOOM_BUILDING_IDS.join('/') + ')');
  }
  out.ok = out.errors.length === 0;
  return out;
}

/* -------------------------------------------------------------------------------------------- */
/* seamless terrain tiles                                                                        */

const edgeMismatch = (rgba, w, h, mode) => {
  let sum = 0, n = 0;
  if (mode === 'lr') {
    for (let y = 0; y < h; y++) {
      const a = (y * w) * 4, b = (y * w + w - 1) * 4;
      for (let c = 0; c < 4; c++) { sum += Math.abs((rgba[a + c] | 0) - (rgba[b + c] | 0)); n++; }
    }
  } else {
    for (let x = 0; x < w; x++) {
      const a = x * 4, b = ((h - 1) * w + x) * 4;
      for (let c = 0; c < 4; c++) { sum += Math.abs((rgba[a + c] | 0) - (rgba[b + c] | 0)); n++; }
    }
  }
  return n ? sum / (255 * n) : 0;
};

/**
 * Seamless-tile check on raw RGBA bytes (dependency-free; the checker decodes the PNG itself).
 * Tiling a texture repeats it, so the right edge sits next to the next tile's left edge and the
 * bottom row next to the next tile's top row: the mean per-channel difference across those edge
 * pairs must be <= threshold (0..1 of full byte range). A scored pair above the threshold is a
 * visible seam and is reported as an error.
 *
 * Returns {ok, errors, leftRight, topBottom, maxScore, threshold, width, height}.
 */
export function seamlessTileCheck(rgba, width, height, opts = {}) {
  const w = Math.floor(Number(width)), h = Math.floor(Number(height));
  const threshold = Number.isFinite(opts.threshold) ? opts.threshold : 0.05;
  const out = { ok: false, errors: [], leftRight: null, topBottom: null, maxScore: null, threshold, width: w, height: h };
  const err = (m) => out.errors.push(m);
  if (!(w > 1) || !(h > 1)) err('width/height must be integers > 1 (got ' + width + 'x' + height + ')');
  const len = rgba && typeof rgba.length === 'number' ? rgba.length : -1;
  if (len < 0) err('rgba must be an array-like of RGBA bytes');
  else if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 && len !== w * h * 4) {
    err('rgba length ' + len + ' != ' + w + 'x' + h + 'x4 = ' + w * h * 4);
  }
  if (opts.threshold != null && !(threshold >= 0 && threshold <= 1)) err('threshold must be within 0..1');
  if (out.errors.length) return out;
  out.leftRight = edgeMismatch(rgba, w, h, 'lr');
  out.topBottom = edgeMismatch(rgba, w, h, 'tb');
  out.maxScore = Math.max(out.leftRight, out.topBottom);
  if (out.leftRight > threshold) err('left/right edge mismatch ' + out.leftRight.toFixed(4) + ' > ' + threshold + ' (texture does not tile horizontally)');
  if (out.topBottom > threshold) err('top/bottom edge mismatch ' + out.topBottom.toFixed(4) + ' > ' + threshold + ' (texture does not tile vertically)');
  out.ok = out.errors.length === 0;
  return out;
}
