// pipeline/scripts/heroloom/scene-color.mjs — shared colour math / metrics for the HeroLoom scene restyle.
//
// Used by:
//   pipeline/scripts/heroloom/restyle-scene.mjs   (produces the assets)
//   pipeline/scripts/heroloom/scene-proofs.mjs    (A/B proof sheets)
//   tools/checks/heroloom-scene-assets.mjs        (independent verification of the PNGs on disk)
//
// The metrics deliberately mirror what the game itself does where it matters:
//   edgeMismatch() is the same formula as edgeMismatch() in src/heroloom-buildings.js, so a
//   leftRight/topBottom score of 0 here means seamlessTileCheck() in the game would accept the tile.

// ---------- sRGB <-> OKLab (Björn Ottosson's reference matrices) ----------

const toLin = (v) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

const fromLin = (v) => {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return c * 255;
};

export function srgbToOklab(r, g, b) {
  const lr = toLin(r), lg = toLin(g), lb = toLin(b);
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return {
    L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  };
}

export function oklabToSrgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  const cl = (v) => Math.min(255, Math.max(0, Math.round(fromLin(v))));
  return [cl(lr), cl(lg), cl(lb)];
}

export const packRgb = (r, g, b) => ((r << 16) | (g << 8) | b) >>> 0;
export const unpackRgb = (v) => [(v >>> 16) & 255, (v >>> 8) & 255, v & 255];
export const rgbHex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

// ---------- colour statistics ----------

const HUE_KEYS = [-180, -150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150, 180];

function labOf(rgba, o) {
  return srgbToOklab(rgba[o], rgba[o + 1], rgba[o + 2]);
}

/**
 * Hue / lightness statistics over opaque pixels of a region.
 * meanHue is a chroma-weighted circular mean (degrees, -180..180); it is null when the region
 * has no pixel with C >= minChroma (i.e. it is effectively neutral).
 */
export function regionStats(rgba, width, x0 = 0, y0 = 0, w = width, h = 0, opts = {}) {
  if (h === 0) h = rgba.length / 4 / width - y0;
  const minChroma = opts.minChroma ?? 0.02;
  let n = 0, Lsum = 0, Csum = 0, minL = 1, maxL = 0;
  let hx = 0, hy = 0, hw = 0;
  const buckets = new Map();
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const o = (y * width + x) * 4;
      if (rgba[o + 3] < 128) continue;
      const lab = labOf(rgba, o);
      const C = Math.hypot(lab.a, lab.b);
      n++;
      Lsum += lab.L; Csum += C;
      if (lab.L < minL) minL = lab.L;
      if (lab.L > maxL) maxL = lab.L;
      if (C >= minChroma) {
        const rad = Math.atan2(lab.b, lab.a);
        const key = HUE_KEYS[Math.min(HUE_KEYS.length - 1, Math.max(0, Math.round((rad * 180 / Math.PI) / 30) + 6))];
        buckets.set(key, (buckets.get(key) || 0) + C);
        hx += C * Math.cos(rad); hy += C * Math.sin(rad); hw += C;
      }
    }
  }
  const totalBucket = [...buckets.values()].reduce((a, b) => a + b, 0) || 1;
  const topBuckets = [...buckets].sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([deg, weight]) => ({ deg, pct: +(100 * weight / totalBucket).toFixed(1) }));
  return {
    pixels: n,
    meanL: n ? +(Lsum / n).toFixed(4) : null,
    Lrange: n ? [+minL.toFixed(3), +maxL.toFixed(3)] : null,
    meanC: n ? +(Csum / n).toFixed(4) : null,
    meanHue: hw > 0 ? +(Math.atan2(hy, hx) * 180 / Math.PI).toFixed(1) : null,
    topBuckets,
  };
}

export function coverage(rgba) {
  let on = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] >= 128) on++;
  return on / (rgba.length / 4);
}

/** Unique fully-opaque RGB values (alpha >= 128) as a Map packedRgb -> count. */
export function uniqueOpaqueColors(rgba) {
  const map = new Map();
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const key = packRgb(rgba[i], rgba[i + 1], rgba[i + 2]);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

/** Mean OKLab distance of opaque pixels to the nearest colour of `ramp` ([{L,a,b}] or [{r,g,b}]). */
export function paletteDistance(rgba, ramp) {
  const entries = ramp.map((c) => {
    if (c.L != null) return { L: c.L, a: c.la ?? c.a, b: c.lb ?? c.b };
    const lab = srgbToOklab(c.r, c.g, c.b);
    return { L: lab.L, a: lab.a, b: lab.b };
  });
  const memo = new Map();
  let sum = 0, n = 0, onPalette = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const key = packRgb(rgba[i], rgba[i + 1], rgba[i + 2]);
    let best = memo.get(key);
    if (best == null) {
      const lab = srgbToOklab(rgba[i], rgba[i + 1], rgba[i + 2]);
      best = Infinity;
      for (const e of entries) {
        const d = Math.sqrt(1.25 * (lab.L - e.L) ** 2 + 0.85 * ((lab.a - e.a) ** 2 + (lab.b - e.b) ** 2));
        if (d < best) best = d;
      }
      best = +best.toFixed(6);
      memo.set(key, best);
    }
    sum += best; n++;
    if (best < 0.005) onPalette++;
  }
  return { meanDist: n ? +(sum / n).toFixed(4) : null, onPalettePct: n ? +(100 * onPalette / n).toFixed(2) : null };
}

/**
 * Same formula as edgeMismatch() in src/heroloom-buildings.js: mean absolute difference over the
 * RGBA edge pair, normalised to 0..1 (0 = perfectly seamless).
 */
export function edgeMismatch(rgba, w, h, mode) {
  let sum = 0, n = 0;
  if (mode === 'lr') {
    for (let y = 0; y < h; y++) {
      const a = (y * w) * 4, b = (y * w + w - 1) * 4;
      for (let c = 0; c < 4; c++) sum += Math.abs(rgba[a + c] - rgba[b + c]);
      n += 4;
    }
    return +(sum / (255 * n)).toFixed(5);
  }
  for (let x = 0; x < w; x++) {
    const a = x * 4, b = ((h - 1) * w + x) * 4;
    for (let c = 0; c < 4; c++) sum += Math.abs(rgba[a + c] - rgba[b + c]);
    n += 4;
  }
  return +(sum / (255 * n)).toFixed(5);
}

/** Absolute circular hue difference in degrees (0..180). */
export function hueDiff(a, b) {
  if (a == null || b == null) return null;
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return +d.toFixed(1);
}

/** Mean per-pixel chroma-weighted absolute hue shift between two same-size RGBA buffers. */
export function meanHueShift(before, after, minChroma = 0.02) {
  let sum = 0, wsum = 0;
  for (let i = 0; i < before.length; i += 4) {
    if (before[i + 3] < 128 || after[i + 3] < 128) continue;
    const lb = srgbToOklab(before[i], before[i + 1], before[i + 2]);
    const la = srgbToOklab(after[i], after[i + 1], after[i + 2]);
    const cb = Math.hypot(lb.a, lb.b), ca = Math.hypot(la.a, la.b);
    if (cb < minChroma || ca < minChroma) continue;
    const hb = Math.atan2(lb.b, lb.a), ha = Math.atan2(la.b, la.a);
    let d = Math.abs(hb - ha);
    if (d > Math.PI) d = 2 * Math.PI - d;
    const w = cb;
    sum += (d * 180 / Math.PI) * w; wsum += w;
  }
  return wsum > 0 ? +(sum / wsum).toFixed(2) : null;
}
