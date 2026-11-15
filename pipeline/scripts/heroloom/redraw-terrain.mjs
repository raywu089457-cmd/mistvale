// HeroLoom scene round 2 — structural redraw of the 12 biome terrain cells
// (assets/heroloom-scene/terrain-atlas.png), the plaza paving tile
// (assets/heroloom-scene/plaza.png) and the 12 unloaded xilurus biome textures.
//
// Everything is generated from periodic hash / value noise with wrap-around
// coordinates, so every tile and every atlas cell is seamless lr/tb by
// construction (all lattice periods divide 256). Palettes are derived from the
// round-1 restyled cell (or the original xilurus tile), so each material keeps
// its hue family while the structure becomes real: blade tufts, ripples, drifts,
// cracks, stone plates, planks, leaf litter.
//
// The game draws these at TERRAIN_TEX_SCALE = 0.29 (1 tex px ≈ 0.29 screen px),
// so shapes are deliberately coarse: features >= 3-4 tex px survive the
// downscale, single-pixel noise would only turn into mush.
import fs from 'node:fs';
import path from 'node:path';
import {decodePng, encodeRgba} from './png.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const SCENE = path.join(ROOT, 'assets/heroloom-scene');
const TILE = 256;

// ── deterministic noise (all periods divide TILE) ────────────────────────────
function hashInt(x, y, seed) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1013904223)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
const wrapIdx = (v, n) => ((v % n) + n) % n;

function vnoise(x, y, cell, seed) {
  const n = Math.round(TILE / cell);
  const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
  const tx = (x - gx * cell) / cell, ty = (y - gy * cell) / cell;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const g = (a, b) => hashInt(wrapIdx(a, n), wrapIdx(b, n), seed);
  const v00 = g(gx, gy), v10 = g(gx + 1, gy), v01 = g(gx, gy + 1), v11 = g(gx + 1, gy + 1);
  return (v00 * (1 - sx) + v10 * sx) * (1 - sy) + (v01 * (1 - sx) + v11 * sx) * sy;
}
function fbm(x, y, cell, octaves, seed) {
  let amp = 0.5, sum = 0, tot = 0;
  for (let i = 0; i < octaves; i++) { sum += amp * vnoise(x, y, cell * 2 ** i, seed + i * 17); tot += amp; amp *= 0.5; }
  return sum / tot;
}

// ── colour helpers ───────────────────────────────────────────────────────────
const srgb2lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lin2srgb = (v) => { v = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(v * 255))); };
function toOklab(r, g, b) {
  const R = srgb2lin(r), G = srgb2lin(g), B = srgb2lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromOklab(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    lin2srgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    lin2srgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    lin2srgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

// derive a 7-step ramp (dark -> light) from a source cell, keeping its hue family
function derivePalette(rgba, w, h) {
  const list = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (rgba[i + 3] < 200) continue;
    list.push([lum([rgba[i], rgba[i + 1], rgba[i + 2]]), [rgba[i], rgba[i + 1], rgba[i + 2]]]);
  }
  list.sort((a, b) => a[0] - b[0]);
  const out = [];
  const qs = [0.02, 0.10, 0.22, 0.34, 0.47, 0.60, 0.72, 0.85, 0.97];
  for (const q of qs) out.push(list[Math.min(list.length - 1, Math.round(q * (list.length - 1)))][1].slice());
  // force the ramp to be strictly spaced in OKLab luminance so banding reads
  for (let i = 1; i < out.length; i++) {
    const prev = toOklab(...out[i - 1]), cur = toOklab(...out[i]);
    if (cur[0] - prev[0] < 0.055) out[i] = fromOklab(Math.min(0.98, prev[0] + 0.055), cur[1] * 0.95, cur[2] * 0.95);
  }
  return out;
}

// ── canvas with wrapped writes ───────────────────────────────────────────────
function canvas(w, h) {
  const rgba = new Uint8Array(w * h * 4);
  const put = (x, y, c) => {
    x = wrapIdx(Math.round(x), w); y = wrapIdx(Math.round(y), h);
    const i = (y * w + x) * 4;
    rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255;
  };
  return {w, h, rgba, put};
}
const pick = (pal, t) => pal[Math.max(0, Math.min(pal.length - 1, Math.round(t * (pal.length - 1))))];
// palette-index-space tone: idx 0 (darkest) .. 8 (lightest) of the 9-step ramp
const IDX = (v) => Math.max(0, Math.min(1, v / 8));


// ── biome structure generators (all periodic over 256) ──────────────────────
function genGrass(pal, seed, opts = {}) {
  const {tufts = 0.42, flowers = 0, darkDots = 0.05} = opts;
  const cv = canvas(TILE, TILE);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const n = fbm(x, y, 32, 2, seed) * 0.40 + fbm(x, y, 8, 2, seed + 91) * 0.60;
    cv.put(x, y, pick(pal, 0.06 + n * 0.36));
  }
  // tufts of 3 blades on a 10px lattice: dark base, mid body, light tip
  for (let cy = 0; cy < TILE; cy += 10) for (let cx = 0; cx < TILE; cx += 10) {
    const r = hashInt(cx, cy, seed + 5);
    if (r > tufts) continue;
    const bx = cx + 2 + Math.floor(hashInt(cx, cy, seed + 7) * 6);
    const by = cy + 3 + Math.floor(hashInt(cx, cy, seed + 9) * 6);
    const hh = 4 + Math.floor(hashInt(cx, cy, seed + 11) * 4);
    const light = 0.74 + hashInt(cx, cy, seed + 13) * 0.24;
    for (let k = 0; k < hh; k++) {
      cv.put(bx, by - k, pick(pal, light - k * 0.08));
      if (k < hh - 1) cv.put(bx + 1, by - k, pick(pal, light - 0.20 - k * 0.06));
    }
    cv.put(bx + 2, by, pick(pal, light - 0.26));
    cv.put(bx - 1, by + 1, pick(pal, 0.08));
    cv.put(bx, by + 1, pick(pal, 0.14));
    // occasional bright seed head
    if (hashInt(cx, cy, seed + 17) > 0.86) cv.put(bx, by - hh, pick(pal, 0.98));
  }
  // sparse dark flecks, 2px, on a coarse lattice
  for (let cy = 0; cy < TILE; cy += 6) for (let cx = 0; cx < TILE; cx += 6) {
    if (hashInt(cx, cy, seed + 21) > 0.985) {
      cv.put(cx, cy, pick(pal, 0.04)); cv.put(cx + 1, cy, pick(pal, 0.04));
    } else if (darkDots && hashInt(cx, cy, seed + 23) > 1 - darkDots * 0.35) {
      cv.put(cx, cy, pick(pal, 0.26));
    }
  }
  // meadow flowers: 2x2 light specks with a dark stem pixel
  for (let k = 0; k < flowers; k++) {
    const fx = Math.floor(hashInt(k, 3, seed + 31) * TILE), fy = Math.floor(hashInt(k, 7, seed + 33) * TILE);
    cv.put(fx, fy, pick(pal, 0.99)); cv.put(fx + 1, fy, pick(pal, 0.88));
    cv.put(fx, fy + 1, pick(pal, 0.10));
  }
  return cv;
}

function genForestFloor(pal, seed) {
  const cv = canvas(TILE, TILE);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const n = fbm(x, y, 32, 2, seed) * 0.8 + fbm(x, y, 8, 2, seed + 3) * 0.2;
    cv.put(x, y, pick(pal, 0.06 + n * 0.46));
  }
  // leaf litter: 3-4px clumps in the warm/light steps, wrapped
  for (let cy = 0; cy < TILE; cy += 5) for (let cx = 0; cx < TILE; cx += 5) {
    const r = hashInt(cx, cy, seed + 5);
    if (r > 0.40) continue;
    const x = cx + Math.floor(hashInt(cx, cy, seed + 7) * 5), y = cy + Math.floor(hashInt(cx, cy, seed + 9) * 5);
    const light = 0.62 + hashInt(cx, cy, seed + 11) * 0.34;
    cv.put(x, y, pick(pal, light)); cv.put(x + 1, y, pick(pal, light - 0.1));
    cv.put(x, y + 1, pick(pal, light - 0.2)); cv.put(x + 2, y, pick(pal, light - 0.26));
  }
  // thick twigs / roots: 2px runs, 6-10px long
  for (let k = 0; k < 22; k++) {
    const x0 = Math.floor(hashInt(k, 13, seed + 17) * TILE), y0 = Math.floor(hashInt(k, 19, seed + 19) * TILE);
    const len = 6 + Math.floor(hashInt(k, 23, seed + 21) * 5);
    const dir = hashInt(k, 29, seed + 25) > 0.5 ? 1 : 0;
    for (let i = 0; i < len; i++) {
      cv.put(x0 + (dir ? i : 0), y0 + (dir ? 0 : i), pick(pal, 0.04));
      cv.put(x0 + (dir ? i : 1), y0 + (dir ? 1 : i), pick(pal, 0.20));
    }
  }
  return cv;
}





function genDesert(pal, seed) {
  const cv = canvas(TILE, TILE);
  // smooth multiscale sand shading: tone distributed over most of the ramp so the cell's
  // mean/sd already match the original (~0.72 / 0.07) and GRASS_TONE does not amplify contrast.
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const n = fbm(x, y, 48, 3, seed + 7) * 0.62 + fbm(x, y, 16, 2, seed + 13) * 0.38;
    const grain = (hashInt(x, y, seed + 31) - 0.5) * 0.9;
    // subtle warped wind ripples, only +-0.5 palette steps on top of the smooth base
    const phase = 2 * Math.PI * (y / 27.7 + y / 61.3 + x / 73.1) + n * 5.5;
    const sm = Math.sin(phase);
    const rip = sm > 0.86 ? 0.55 : sm > 0.55 ? 0.25 : sm < -0.86 ? -0.55 : sm < -0.55 ? -0.25 : 0;
    cv.put(x, y, pick(pal, IDX(5.4 + (n - 0.5) * 9.0 + grain + rip)));
  }
  // sparse wind-crest glints and small pebbles (structure, not contrast)
  for (let k = 0; k < 90; k++) {
    const x = Math.floor(hashInt(k, 7, seed + 29) * TILE), y = Math.floor(hashInt(k, 9, seed + 33) * TILE);
    if (hashInt(k, 19, seed + 37) > 0.5) cv.put(x, y, pick(pal, IDX(8)));
  }
  for (let k = 0; k < 44; k++) {
    const x = Math.floor(hashInt(k, 3, seed + 11) * TILE), y = Math.floor(hashInt(k, 5, seed + 13) * TILE);
    cv.put(x, y, pick(pal, IDX(1))); cv.put(x + 1, y, pick(pal, IDX(2)));
    cv.put(x, y - 1, pick(pal, IDX(6))); cv.put(x + 1, y - 1, pick(pal, IDX(5)));
  }
  return cv;
}

function genSnow(pal, seed) {
  const cv = canvas(TILE, TILE);
  // near-white base with only a whisper of wind-stretched drift shading (no oval banks:
  // GRASS_TONE rescales cell contrast at load, so large soft shapes become visible blobs).
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const d = fbm(x * 0.42, y * 1.9, 20, 3, seed + 9) * 0.62 + fbm(x, y, 64, 2, seed + 13) * 0.38;
    const g = (hashInt(x, y, seed + 41) - 0.5) * 0.30;
    cv.put(x, y, pick(pal, IDX(7.55 + (d - 0.5) * 0.7 + g)));
  }
  // fine cool snow grain (1px): this carries the cell's variance like the old art did,
  // so the runtime mean/sd normalisation stays ~1x and does not amplify big shapes.
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const h = hashInt(x, y, seed + 71);
    if (h > 0.982) { cv.put(x, y, pick(pal, IDX(1))); if (hashInt(x, y, seed + 73) > 0.5) cv.put(x + 1, y, pick(pal, IDX(2))); }
    else if (h > 0.955) cv.put(x, y, pick(pal, IDX(2)));
    else if (h > 0.880) cv.put(x, y, pick(pal, IDX(4)));
    else if (h > 0.820) cv.put(x, y, pick(pal, IDX(5)));
  }
  // sparse wind crests: thin 1px slightly brighter lines
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const c = fbm(x * 0.5, y * 1.4, 24, 2, seed + 11);
    if (c > 0.68 && c < 0.695 && hashInt(x, y, seed + 77) > 0.5) cv.put(x, y, pick(pal, IDX(8)));
  }
  // a handful of crisp ice specks / old stones, 2-4px, for material readability
  for (let k = 0; k < 26; k++) {
    const x = Math.floor(hashInt(k, 11, seed + 17) * TILE), y = Math.floor(hashInt(k, 13, seed + 19) * TILE);
    if (hashInt(k, 15, seed + 23) > 0.55) { cv.put(x, y, pick(pal, IDX(8))); cv.put(x, y + 1, pick(pal, IDX(6))); }
    else { cv.put(x, y, pick(pal, IDX(1))); cv.put(x + 1, y, pick(pal, IDX(2))); cv.put(x, y - 1, pick(pal, IDX(5))); }
  }
  return cv;
}
function genIce(pal, seed) {
  const cv = canvas(TILE, TILE);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const n = fbm(x, y, 64, 3, seed) * 0.7 + fbm(x, y, 32, 2, seed + 3) * 0.3;
    cv.put(x, y, pick(pal, 0.40 + n * 0.54));
  }
  // frosted plates: 2-3 tone cells with a lit rim (32px lattice, wrapped)
  const P = 32;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const gx = Math.floor(x / P), gy = Math.floor(y / P);
    const tone = 0.46 + hashInt(wrapIdx(gx, TILE / P), wrapIdx(gy, TILE / P), seed + 21) * 0.40;
    const lx = x % P, ly = y % P;
    if (lx < 3 || ly < 3) cv.put(x, y, pick(pal, 0.10));            // plate seam
    else if (lx < 5 && ly < 5) cv.put(x, y, pick(pal, Math.min(0.98, tone + 0.22))); // lit corner
    else cv.put(x, y, pick(pal, tone + fbm(x, y, 16, 2, seed + 27) * 0.10));
  }
  // cracks: 2px wide, 80-160px long, wrapped
  for (let k = 0; k < 8; k++) {
    let x = hashInt(k, 3, seed + 7) * TILE, y = hashInt(k, 5, seed + 11) * TILE;
    const ang = hashInt(k, 7, seed + 13) * Math.PI * 2;
    const len = 80 + hashInt(k, 9, seed + 17) * 90;
    const bx = Math.cos(ang), by = Math.sin(ang);
    for (let t = 0; t < len; t++) {
      cv.put(x + bx * t, y + by * t, pick(pal, 0.16));
      cv.put(x + bx * t - by, y + by * t + bx, pick(pal, 0.24));
      if (t % 4 === 0) cv.put(x + bx * t + by, y + by * t - bx, pick(pal, 0.86));
    }
  }
  return cv;
}





function genWater(pal, seed) {
  const cv = canvas(TILE, TILE);
  // smooth multiscale water body, tone centred near the original cell's mean/sd (~0.50 / 0.08)
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const n = fbm(x, y, 64, 3, seed) * 0.7 + fbm(x, y, 24, 2, seed + 5) * 0.3;
    const g = (hashInt(x, y, seed + 51) - 0.5) * 0.8;
    const phase = 2 * Math.PI * (y / 23.9 + y / 67.1 + x / 91.3) + fbm(x, y, 64, 2, seed + 5) * 4.5;
    const sm = Math.sin(phase);
    const rip = sm > 0.93 ? 0.8 : sm > 0.74 ? 0.35 : sm < -0.93 ? -0.8 : sm < -0.74 ? -0.35 : 0;
    cv.put(x, y, pick(pal, IDX(2.2 + (n - 0.5) * 10.0 + g + rip)));
  }
  // sparkles / glints on crests, sparse and small
  for (let k = 0; k < 34; k++) {
    const x = Math.floor(hashInt(k, 3, seed + 11) * TILE), y = Math.floor(hashInt(k, 5, seed + 13) * TILE);
    cv.put(x, y, pick(pal, IDX(7))); cv.put(x + 1, y + 1, pick(pal, IDX(6)));
  }
  for (let k = 0; k < 14; k++) {
    const x = Math.floor(hashInt(k, 31, seed + 57) * TILE), y = Math.floor(hashInt(k, 33, seed + 59) * TILE);
    cv.put(x, y, pick(pal, IDX(8)));
  }
  return cv;
}
function genStonePlates(pal, seed, plateSize = 44) {
  const cv = canvas(TILE, TILE);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const n = fbm(x, y, 32, 2, seed) * 0.5;
    cv.put(x, y, pick(pal, 0.34 + n * 0.26));
  }
  // irregular stone plates on a jittered lattice with 3px dark seams + lit rims
  const n = Math.round(TILE / plateSize);
  for (let py = 0; py < TILE; py++) for (let px = 0; px < TILE; px++) {
    let best = 1e9, second = 1e9, bi = 0, bj = 0;
    const gx = Math.floor(px / plateSize), gy = Math.floor(py / plateSize);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = gx + dx, cy = gy + dy;
      const jx = (wrapIdx(cx, n) + 0.5 + (hashInt(cx, cy, seed + 7) - 0.5) * 0.55) * plateSize;
      const jy = (wrapIdx(cy, n) + 0.5 + (hashInt(cx, cy, seed + 11) - 0.5) * 0.55) * plateSize;
      const d = Math.hypot(px - jx, py - jy);
      if (d < best) { second = best; best = d; bi = wrapIdx(cx, n); bj = wrapIdx(cy, n); }
      else if (d < second) second = d;
    }
    const edge = second - best;
    if (edge < 2.2) { cv.put(px, py, pick(pal, 0.04)); continue; }
    if (edge < 3.4) { cv.put(px, py, pick(pal, 0.20)); continue; }
    const tone = 0.38 + hashInt(bi, bj, seed + 13) * 0.42;
    let t = tone + fbm(px, py, 16, 2, seed + 17) * 0.16;
    if (edge < 7) t += 0.16;
    if (edge > 14 && edge < 17) t -= 0.10;
    cv.put(px, py, pick(pal, t));
  }
  // gravel specks in the seams
  for (let k = 0; k < 420; k++) {
    const x = Math.floor(hashInt(k, 3, seed + 31) * TILE), y = Math.floor(hashInt(k, 5, seed + 33) * TILE);
    if (hashInt(k, 7, seed + 37) > 0.45) { cv.put(x, y, pick(pal, 0.78)); cv.put(x + 1, y, pick(pal, 0.56)); cv.put(x, y + 1, pick(pal, 0.30)); }
  }
  return cv;
}

function genDirt(pal, seed, pebbles = 1) {
  const cv = canvas(TILE, TILE);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const n = fbm(x, y, 32, 2, seed) * 0.7 + fbm(x, y, 8, 2, seed + 3) * 0.3;
    cv.put(x, y, pick(pal, 0.12 + n * 0.56));
  }
  // clods: 3-4px light/dark patches on a 10px lattice
  for (let cy = 0; cy < TILE; cy += 10) for (let cx = 0; cx < TILE; cx += 10) {
    const r = hashInt(cx, cy, seed + 7);
    if (r > 0.55) continue;
    const x = cx + 1 + Math.floor(hashInt(cx, cy, seed + 9) * 7), y = cy + 1 + Math.floor(hashInt(cx, cy, seed + 11) * 7);
    if (r < 0.22) { cv.put(x, y, pick(pal, 0.76)); cv.put(x + 1, y, pick(pal, 0.62)); cv.put(x, y + 1, pick(pal, 0.48)); }
    else { cv.put(x, y, pick(pal, 0.06)); cv.put(x + 1, y, pick(pal, 0.18)); }
  }
  if (pebbles) for (let k = 0; k < 70; k++) {
    const x = Math.floor(hashInt(k, 3, seed + 11) * TILE), y = Math.floor(hashInt(k, 5, seed + 13) * TILE);
    cv.put(x, y, pick(pal, 0.08)); cv.put(x + 1, y, pick(pal, 0.20));
    cv.put(x, y - 1, pick(pal, 0.88)); cv.put(x + 1, y - 1, pick(pal, 0.68));
  }
  return cv;
}

function genPlanks(pal, seed) {
  const cv = canvas(TILE, TILE);
  const PLANK = 32;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const pi = Math.floor(x / PLANK);
    const tone = 0.22 + hashInt(pi, 0, seed) * 0.26;
    const grain = fbm(x, y, 8, 2, seed + 5) * 0.20;
    cv.put(x, y, pick(pal, tone + grain));
  }
  // 3px dark gaps between planks + a lit edge and a nail pair per plank
  for (let x = 0; x < TILE; x += PLANK) {
    for (let y = 0; y < TILE; y++) {
      cv.put(x, y, pick(pal, 0.04)); cv.put(x + 1, y, pick(pal, 0.10));
      cv.put(x + 2, y, pick(pal, 0.20)); cv.put(x + PLANK - 1, y, pick(pal, 0.76));
    }
    for (const y of [24, 148]) { cv.put(x + 6, y, pick(pal, 0.02)); cv.put(x + 7, y, pick(pal, 0.60)); }
  }
  return cv;
}

function genCobbles(pal, seed) {
  const cv = canvas(TILE, TILE);
  const W = 32, H = 24;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const row = Math.floor(y / H), off = (row % 2) * W / 2;
    const col = Math.floor((x + off) / W);
    const ncx = wrapIdx(col, TILE / W), ncy = wrapIdx(row, TILE / H);
    const cx = col * W - off + W / 2 + (hashInt(ncx, ncy, seed + 3) - 0.5) * 6;
    const cy = row * H + H / 2 + (hashInt(ncx, ncy, seed + 7) - 0.5) * 6;
    const rad = Math.hypot((x - cx) / W, (y - cy) / H);
    if (rad > 0.80) { cv.put(x, y, pick(pal, 0.04)); continue; }
    if (rad > 0.68) { cv.put(x, y, pick(pal, 0.22)); continue; }
    const tone = 0.40 + hashInt(ncx, ncy, seed + 11) * 0.36;
    let t = tone + (rad < 0.38 ? 0.14 : 0) - rad * 0.16;
    if (rad < 0.20) t += 0.08;
    cv.put(x, y, pick(pal, t));
  }
  return cv;
}

function genBridge(pal, seed) { return genPlanks(pal, seed); }

// ── exact seam fix: make the right/bottom edges identical to the left/top edges.
// The game tiles these patterns, so edgeMismatch must be ~0; a 1px duplicated
// row/column is invisible at TERRAIN_TEX_SCALE=0.29 but guarantees a clean join.
function seamFix(cv) {
  const {w, h, rgba} = cv;
  for (let y = 0; y < h; y++) {
    const src = y * w * 4, dst = (y * w + w - 1) * 4;
    for (let k = 0; k < 4; k++) rgba[dst + k] = rgba[src + k];
  }
  for (let x = 0; x < w; x++) {
    const src = x * 4, dst = ((h - 1) * w + x) * 4;
    for (let k = 0; k < 4; k++) rgba[dst + k] = rgba[src + k];
  }
  return cv;
}

// Weighted mean hue (degrees) of the opaque pixels, weighted by chroma.
function meanHueOf(rgba, w, h) {
  let hx = 0, hy = 0, hw = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const [L, A, B] = toOklab(rgba[i], rgba[i + 1], rgba[i + 2]);
    const C = Math.hypot(A, B);
    if (C < 0.02) continue;
    const h = Math.atan2(B, A);
    hx += Math.cos(h) * C; hy += Math.sin(h) * C; hw += C;
  }
  if (!hw) return null;
  return Math.atan2(hy, hx) * 180 / Math.PI;
}

// Rotate every palette colour of a generated cell in OKLab so its mean hue lands on
// refHue. Deterministic, keeps lightness and chroma; used to guarantee "hue family kept".
function hueLock(cv, refHue, minDeg = 0.5, passes = 4) {
  if (refHue == null) return cv;
  for (let pass = 0; pass < passes; pass++) {
  const genHue = meanHueOf(cv.rgba, cv.w, cv.h);
  if (genHue == null) return cv;
  let delta = ((refHue - genHue + 540) % 360) - 180;
  if (Math.abs(delta) < minDeg) return cv;
  const rad = delta * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  const map = new Map();
  const rotate = (r, g, b) => {
    const [L, A, B] = toOklab(r, g, b);
    const C = Math.hypot(A, B);
    if (C < 0.015) return [r, g, b];           // neutrals: leave as-is
    const A2 = A * cos - B * sin, B2 = A * sin + B * cos;
    return fromOklab(L, A2, B2);
  };
  for (let i = 0; i < cv.rgba.length; i += 4) {
    if (cv.rgba[i + 3] < 128) continue;
    const key = (cv.rgba[i] << 16) | (cv.rgba[i + 1] << 8) | cv.rgba[i + 2];
    let out = map.get(key);
    if (!out) { out = rotate(cv.rgba[i], cv.rgba[i + 1], cv.rgba[i + 2]); map.set(key, out); }
    cv.rgba[i] = out[0]; cv.rgba[i + 1] = out[1]; cv.rgba[i + 2] = out[2];
  }
  }
  return cv;
}

// ── plaza: HeroLoom blue-grey flagstones with mortar joints ───────────────────
function genPlaza() {
  const cv = canvas(TILE, TILE);
  const pal = [
    [58, 58, 66], [74, 75, 84], [91, 93, 102], [110, 112, 121],
    [131, 134, 143], [152, 155, 164], [176, 180, 189], [204, 207, 214],
  ];
  const mortar = [46, 45, 52];
  const mortarEdge = [62, 62, 70];
  const WARM = [178, 164, 141], WARM2 = [160, 148, 128];
  const ROWS = [0, 64, 136, 200, 256];
  const LAYOUTS = [
    [0, 88, 168, 256],
    [0, 56, 136, 208, 256],
    [0, 72, 152, 232, 256],
    [0, 64, 128, 192, 256],
  ];
  for (let y = 0; y < TILE; y++) {
    let ri = 0;
    while (ri < ROWS.length - 2 && y >= ROWS[ri + 1]) ri++;
    const y0 = ROWS[ri], y1 = ROWS[ri + 1];
    const segs = LAYOUTS[ri % LAYOUTS.length];
    for (let x = 0; x < TILE; x++) {
      let sj = 0;
      while (sj < segs.length - 2 && x >= segs[sj + 1]) sj++;
      const x0 = segs[sj], x1 = segs[sj + 1];
      const lx = x - x0, ly = y - y0, sw = x1 - x0, sh = y1 - y0;
      const jv = lx < 3 || sw - lx <= 3;
      const jh = ly < 3 || sh - ly <= 3;
      if (jv || jh) {
        cv.put(x, y, (jv && lx < 3) || (jh && ly < 3) ? mortarEdge : mortar);
        continue;
      }
      const idA = ri * 13 + sj;
      const r = hashInt(idA, 5, 3);
      let t = 0.30 + r * 0.22 + fbm(x, y, 32, 1, 9) * 0.10;
      if (ly < 9) t += 0.16;
      else if (ly < 13) t += 0.08;
      if (sh - ly < 10) t -= 0.12;
      if (lx < 5) t += 0.06;
      cv.put(x, y, pick(pal, t));
      if (ly < 4 && lx > 4) cv.put(x, y, pal[7]);
      else if (ly < 7 && lx > 4) cv.put(x, y, pal[6]);
      if (lx < 3) cv.put(x, y, pal[5]);
      if (ly === 4 && lx > 5 && lx < 9 + Math.floor(hashInt(idA, 11, 7) * 8) && hashInt(idA, 9, 3) > 0.78) cv.put(x, y, WARM);
      if (ly === 5 && lx > 6 && hashInt(idA, 11, 7) > 0.3 && hashInt(idA, 9, 3) > 0.78) cv.put(x, y, WARM2);
    }
  }
  for (let k = 0; k < 26; k++) {
    const x = Math.floor(hashInt(k, 3, 21) * TILE), y = Math.floor(hashInt(k, 7, 23) * TILE);
    const len = 5 + Math.floor(hashInt(k, 11, 27) * 10);
    const dir = hashInt(k, 13, 29) > 0.45;
    for (let i = 0; i < len; i++) cv.put(x + (dir ? i : 0), y + (dir ? 0 : i), pal[1]);
  }
  return cv;
}

// ── atlas assembly ───────────────────────────────────────────────────────────
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/terrain-atlas.manifest.json'), 'utf8'));
const atlasFile = path.join(SCENE, 'terrain-atlas.png');
const origAtlas = decodePng(fs.readFileSync(path.join(ROOT, 'assets/terrain-atlas.png')));
const atlas = decodePng(fs.readFileSync(atlasFile));
const warning = [];
const report = {generator: 'pipeline/scripts/heroloom/redraw-terrain.mjs', generatedAt: new Date().toISOString(), cells: [], textures: []};


// Mean colour + per-pixel integer delta on all channels (equal delta keeps the source hue).
function cellMeanColour(src, w, h) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < src.length; i += 4) if (src[i + 3] > 200) { r += src[i]; g += src[i + 1]; b += src[i + 2]; n++; }
  return n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : [128, 128, 128];
}

// deterministic short dashes (<= 14 px), isotropic directions, never a continuous line across the tile
function addDashes(cv, base, seed, count, toneDelta, maxLen, gridStep) {
  for (let k = 0; k < count; k++) {
    const gx = Math.floor(hashInt(k, 1, seed) * (TILE / gridStep));
    const gy = Math.floor(hashInt(k, 3, seed) * (TILE / gridStep));
    const x0 = gx * gridStep + Math.floor(hashInt(k, 5, seed) * gridStep);
    const y0 = gy * gridStep + Math.floor(hashInt(k, 7, seed) * gridStep);
    const len = 3 + Math.floor(hashInt(k, 9, seed) * (maxLen - 3));
    const dir = Math.floor(hashInt(k, 11, seed) * 4); // 0..3 => right / down-right / down / up-right
    for (let i = 0; i < len; i++) {
      const x = dir === 0 || dir === 1 ? x0 + i : dir === 2 ? x0 : x0 + i;
      const y = dir === 0 ? y0 : dir === 1 ? y0 + i : dir === 2 ? y0 + i : y0 - i;
      cv.put(x, y, addEq(base, toneDelta));
    }
  }
}
function addEq(base, d) {
  return [clamp8(base[0] + d), clamp8(base[1] + d), clamp8(base[2] + d)];
}
function clamp8(v) { return v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }

// Granular cells: local deviation stays inside the requested contrast budget, features are
// isotropic and short (no long crest lines / blobs), fine grain survives the 0.29 texture scale.
function genGranular(src, w, h, seed, kind) {
  const cv = canvas(w, h);
  const base = cellMeanColour(src, w, h);
  const putD = (x, y, d) => cv.put(x, y, addEq(base, d));
  // base mottle + isotropic 1-2px grain (bounded local deviation; no long coherent structure)
  const motA = kind === 'sand' ? 3 : kind === 'snow' ? 2 : kind === 'ice' ? 3 : kind === 'rock' ? 4 : kind === 'floor' ? 3 : 3;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n1 = (vnoise(x, y, 8, seed + 1) - 0.5) * 2;
    const n2 = (vnoise(x, y, 20, seed + 2) - 0.5) * 2;
    const gr = (hashInt(x, y, seed + 3) - 0.5) * 2;
    let d = (n1 * 0.5 + n2 * 0.3 + gr * 0.2) * motA;
    if (kind === 'sand') d = Math.max(-5, Math.min(5, d));
    else if (kind === 'snow') d = Math.max(-6, Math.min(6, d));
    else if (kind === 'water') d = Math.max(-6, Math.min(6, d));
    else if (kind === 'ice') d = Math.max(-7, Math.min(7, d));
    else if (kind === 'rock') d = Math.max(-8, Math.min(8, d));
    else if (kind === 'floor') d = Math.max(-7, Math.min(7, d));
    else if (kind === 'bridge') d = Math.max(-6, Math.min(6, d));
    putD(x, y, d);
  }
  if (kind === 'sand') {
    addDashes(cv, base, seed + 31, 90, 3, 12, 24);
    addDashes(cv, base, seed + 37, 70, -3, 10, 24);
    for (let k = 0; k < 40; k++) {
      const x = Math.floor(hashInt(k, 3, seed + 41) * w), y = Math.floor(hashInt(k, 5, seed + 43) * h);
      cv.put(x, y, addEq(base, -5)); cv.put(x + 1, y, addEq(base, -4)); cv.put(x, y - 1, addEq(base, 4));
    }
  } else if (kind === 'grass') {
    // grass: isotropic fine base + short blade dashes and low-contrast clumps (no lattice bands)
    addDashes(cv, base, seed + 211, 240, 8, 4, 9);
    addDashes(cv, base, seed + 223, 170, -6, 4, 11);
    addDashes(cv, base, seed + 227, 90, 5, 3, 14);
    addDashes(cv, base, seed + 229, 50, -4, 3, 16);
    for (let k = 0; k < 26; k++) {
      const x = Math.floor(hashInt(k, 23, seed + 233) * w), y = Math.floor(hashInt(k, 29, seed + 239) * h);
      cv.put(x, y, addEq(base, 7)); cv.put(x, y - 1, addEq(base, 5));
    }
  } else if (kind === 'snow') {
    addDashes(cv, base, seed + 47, 120, -5, 14, 22);
    addDashes(cv, base, seed + 53, 60, 5, 10, 26);
    for (let k = 0; k < 18; k++) {
      const x = Math.floor(hashInt(k, 7, seed + 59) * w), y = Math.floor(hashInt(k, 9, seed + 61) * h);
      cv.put(x, y, addEq(base, -6)); cv.put(x + 1, y, addEq(base, -6));
    }
  } else if (kind === 'water') {
    addDashes(cv, base, seed + 67, 130, 8, 12, 22);
    addDashes(cv, base, seed + 71, 70, 4, 8, 26);
    addDashes(cv, base, seed + 73, 90, -6, 10, 24);
    for (let k = 0; k < 40; k++) {
      const x = Math.floor(hashInt(k, 13, seed + 79) * w), y = Math.floor(hashInt(k, 17, seed + 83) * h);
      cv.put(x, y, addEq(base, 10));
    }
  } else if (kind === 'ice') {
    addDashes(cv, base, seed + 89, 70, -7, 12, 26);
    addDashes(cv, base, seed + 97, 60, 4, 8, 30);
    addDashes(cv, base, seed + 101, 40, 2, 6, 32);
  } else if (kind === 'rock') {
    // rock: broken crack dashes (never a lattice line across the tile) + chipped highlights
    addDashes(cv, base, seed + 103, 70, -8, 12, 25);
    addDashes(cv, base, seed + 107, 55, 5, 9, 29);
    addDashes(cv, base, seed + 109, 45, 3, 6, 32);
    for (let k = 0; k < 30; k++) {
      const x = Math.floor(hashInt(k, 11, seed + 113) * w), y = Math.floor(hashInt(k, 13, seed + 127) * h);
      cv.put(x, y, addEq(base, -6)); cv.put(x + 1, y, addEq(base, -4));
    }
  } else if (kind === 'floor') {
    // forest floor: scattered leaf clumps and twigs (random placement, no row alignment)
    addDashes(cv, base, seed + 131, 240, 6, 5, 12);
    addDashes(cv, base, seed + 137, 200, -6, 4, 12);
    addDashes(cv, base, seed + 139, 60, -7, 10, 18);
    addDashes(cv, base, seed + 149, 90, 3, 4, 10);
  } else if (kind === 'bridge') {
    // bridge deck: staggered short board seams (8-16px with gaps), grain, nails
    for (let row = 0; row < h; row += 6) {
      const off = Math.floor(hashInt(row, 1, seed + 151) * 16);
      for (let x = 0; x < w; x++) {
        const seg = Math.floor((x + off) / 14);
        const inSeg = (x + off) % 14;
        if (inSeg < 1 && hashInt(seg, row, seed + 157) > 0.25) cv.put(x, row, addEq(base, -7));
      }
    }
    addDashes(cv, base, seed + 163, 140, 3, 6, 14);
    addDashes(cv, base, seed + 167, 120, -3, 5, 16);
    for (let k = 0; k < 40; k++) {
      const x = Math.floor(hashInt(k, 17, seed + 173) * w), y = Math.floor(hashInt(k, 19, seed + 179) * h);
      cv.put(x, y, addEq(base, -8));
    }
  }
  return cv;
}
const BIOMES = {
  village: (pal, seed, src, cell) => genGranular(src, cell.w, cell.h, seed, 'grass'),
  meadow: (pal, seed, src, cell) => genGranular(src, cell.w, cell.h, seed + 3, 'grass'),
  birch: (pal, seed, src, cell) => genGranular(src, cell.w, cell.h, seed, 'floor'),
  forest: (pal, seed, src, cell) => genGranular(src, cell.w, cell.h, seed, 'floor'),
  taiga: (pal, seed, src, cell) => genGranular(src, cell.w, cell.h, seed + 7, 'grass'),
  snow: (pal, seed, src, cell) => genGranular(src, cell.w, cell.h, seed, 'snow'),
  mountain: (pal, seed, src, cell) => genGranular(src, cell.w, cell.h, seed, 'rock'),
  desert: (pal, seed, src, cell) => genGranular(src, cell.w, cell.h, seed, 'sand'),
  river: (pal, seed, src, cell) => genGranular(src, cell.w, cell.h, seed, 'water'),
  ocean: (pal, seed, src, cell) => genGranular(src, cell.w, cell.h, seed + 11, 'water'),
  ice: (pal, seed, src, cell) => genGranular(src, cell.w, cell.h, seed, 'ice'),
  bridge: (pal, seed, src, cell) => genGranular(src, cell.w, cell.h, seed, 'bridge'),
};
let seed = 1;
for (const [name, cell] of Object.entries(manifest.cells)) {
  const src = new Uint8Array(cell.w * cell.h * 4);
  for (let y = 0; y < cell.h; y++) for (let x = 0; x < cell.w; x++) {
    const si = ((cell.y + y) * origAtlas.width + cell.x + x) * 4;
    src.set(origAtlas.rgba.subarray(si, si + 4), (y * cell.w + x) * 4);
  }
  const pal = derivePalette(src, cell.w, cell.h);
  const gen = BIOMES[name];
  if (!gen) { warning.push(`no generator for ${name}`); continue; }
  const refHue = meanHueOf(src, cell.w, cell.h);
  let cv = hueLock(seamFix(gen(pal, seed++ * 37 + cell.x, src, cell)), refHue);
  cv = seamFix(cv);
  if (cv.w !== cell.w || cv.h !== cell.h) throw new Error(`cell ${name} size ${cv.w}x${cv.h} != ${cell.w}x${cell.h}`);
  for (let y = 0; y < cell.h; y++) for (let x = 0; x < cell.w; x++) {
    const di = ((cell.y + y) * atlas.width + cell.x + x) * 4, si = (y * cell.w + x) * 4;
    for (let k = 0; k < 4; k++) atlas.rgba[di + k] = cv.rgba[si + k];
  }
  const colours = new Set();
  for (let i = 0; i < cv.rgba.length; i += 4) if (cv.rgba[i + 3]) colours.add(cv.rgba[i] << 16 | cv.rgba[i + 1] << 8 | cv.rgba[i + 2]);
  const lockedHue = meanHueOf(cv.rgba, cv.w, cv.h);
  report.cells.push({name, x: cell.x, y: cell.y, w: cell.w, h: cell.h, colors: colours.size, colours: colours.size, hue: lockedHue == null ? null : +lockedHue.toFixed(1), refHue: refHue == null ? null : +refHue.toFixed(1), palette: [...colours].map(c => '#' + c.toString(16).padStart(6, '0'))});
}
const atlasPng = encodeRgba(atlas.width, atlas.height, atlas.rgba);
fs.writeFileSync(atlasFile, atlasPng);
console.log(`terrain-atlas.png ${atlas.width}x${atlas.height} ${atlasPng.length}B`);

// ── plaza ────────────────────────────────────────────────────────────────────
const plazaSrc = decodePng(fs.readFileSync(path.join(SCENE, 'plaza.png')));
if (plazaSrc.width !== TILE || plazaSrc.height !== TILE) warning.push(`plaza source is ${plazaSrc.width}x${plazaSrc.height}, expected 256`);
const plaza = seamFix(genPlaza());
const plazaPng = encodeRgba(TILE, TILE, plaza.rgba);
fs.writeFileSync(path.join(SCENE, 'plaza.png'), plazaPng);
{
  const colours = new Set();
  for (let i = 0; i < plaza.rgba.length; i += 4) colours.add(plaza.rgba[i] << 16 | plaza.rgba[i + 1] << 8 | plaza.rgba[i + 2]);
  report.plaza = {file: 'assets/heroloom-scene/plaza.png', w: TILE, h: TILE, colours: colours.size, bytes: plazaPng.length, palette: [...colours].map(c => '#' + c.toString(16).padStart(6, '0'))};
}
console.log(`plaza.png 256x256 ${plazaPng.length}B colours=${report.plaza.colours}`);

// ── xilurus biome textures (not loaded by build.mjs, delivered for parity) ───
const TEX = {
  desert: (pal, s) => genDesert(pal, s),
  dirt: (pal, s) => genDirt(pal, s),
  forest: (pal, s) => genForestFloor(pal, s),
  grass: (pal, s) => genGrass(pal, s, {tufts: 0.40}),
  ice: (pal, s) => genIce(pal, s),
  meadow: (pal, s) => genGrass(pal, s, {tufts: 0.46, flowers: 24}),
  mountain: (pal, s) => genStonePlates(pal, s, 44),
  snow: (pal, s) => genSnow(pal, s),
  soil: (pal, s) => genDirt(pal, s, 1),
  stone: (pal, s) => genCobbles(pal, s),
  taiga: (pal, s) => genGrass(pal, s, {tufts: 0.32, darkDots: 0.10}),
  water: (pal, s) => genWater(pal, s),
};
fs.mkdirSync(path.join(SCENE, 'xilurus'), {recursive: true});
for (const [name, gen] of Object.entries(TEX)) {
  const file = path.join(SCENE, 'xilurus', `tex-${name}.png`);
  const src = decodePng(fs.readFileSync(file));
  if (src.width !== TILE || src.height !== TILE) throw new Error(`tex-${name} is ${src.width}x${src.height}`);
  const orig = decodePng(fs.readFileSync(path.join(ROOT, 'assets/xilurus', `tex-${name}.png`)));
  const pal = derivePalette(orig.rgba, orig.width, orig.height);
  const refHue = meanHueOf(orig.rgba, orig.width, orig.height);
  let cv = hueLock(seamFix(gen(pal, 1000 + name.length * 13)), refHue);
  cv = seamFix(cv);
  const png = encodeRgba(cv.w, cv.h, cv.rgba);
  fs.writeFileSync(file, png);
  const colours = new Set();
  for (let i = 0; i < cv.rgba.length; i += 4) if (cv.rgba[i + 3]) colours.add(cv.rgba[i] << 16 | cv.rgba[i + 1] << 8 | cv.rgba[i + 2]);
  report.textures.push({name: `xilurus/tex-${name}.png`, colours: colours.size, bytes: png.length, palette: [...colours].map(c => '#' + c.toString(16).padStart(6, '0'))});
}
console.log(`xilurus textures: ${report.textures.length}`);
if (warning.length) report.warnings = warning;
fs.writeFileSync(path.join(SCENE, 'redraw-terrain-report.json'), JSON.stringify(report, null, 2));
if (warning.length) console.error('WARN\n' + warning.join('\n'));
console.log('OK redraw-terrain');
