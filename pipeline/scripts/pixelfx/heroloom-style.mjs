// HeroLoom style pass for the pixelfx VFX sheets.
//
// The HeroLoom characters are painted with a small set of 6-step, hue-shifted ramps and one shared ink
// (#150d1b); every shape carries a dark ink outline, highlights stop at warm cream (never pure white) and the
// saturated neon ramps of the original pixelfx library are gone. This module recolours a rendered pixelfx frame
// onto those ramps and adds the ink rim, without touching geometry: frame size, pivot, frame count, fps and
// timing stay exactly what the exporter produced, so src/pixel-world.js drawVfxSheet() keeps drawing the same
// world size with the same k factors.
//
// Ramps below are copied from assets/heroloom/character.json ("palettes", 5 ramps x 6 steps) plus three ramps
// derived from them (fire / warm-neutral), so the VFX palette literally comes from the character art.

export const HERO_INK = '#150d1b';

/** ramps copied verbatim from assets/heroloom/character.json palettes (dark -> light). */
export const HERO_RAMPS = {
  skin: ['#5a282b', '#7a3a34', '#b86a4c', '#e2a87c', '#f2cfa4', '#fcecd0'],
  hairBrown: ['#311925', '#40222e', '#6a4040', '#946a52', '#bc9670', '#e0c8a0'],
  red: ['#3d1322', '#501828', '#7c2c34', '#a84a44', '#cc7a60', '#ecb490'],
  green: ['#0a222a', '#0e3038', '#1c5444', '#44844c', '#84b464', '#d0dc98'],
  purple: ['#302344', '#3e2c58', '#5e4680', '#8468a0', '#a890bc', '#d4c4dc'],
  blue: ['#1b244c', '#222e5c', '#34507c', '#5478a0', '#88aac4', '#c8dfe4'],
  yellow: ['#492e29', '#5a3c34', '#846648', '#a89068', '#ccb890', '#ece0c0'],
  white: ['#3f395a', '#544e74', '#8884a0', '#b8b8c8', '#dcdee4', '#fafaf4'],
  black: ['#131123', '#1a1830', '#2c2e4c', '#484e6c', '#70788c', '#a8b0b4'],
  leather: ['#2e1318', '#3e1a1c', '#643422', '#8c5430', '#b88248', '#e0b874'],
  leatherBlack: ['#16111d', '#1e1826', '#34303e', '#524e58', '#7c7878', '#b0aca0'],
};

/** derived ramps (mixed from the HeroLoom rows above; no colour comes from outside the character palette). */
export const DERIVED_RAMPS = {
  // fire: the red cloth row pulled toward the leather row, one gold step added for the core -> muted ember amber.
  // The ramp keeps enough orange in the mid tones that a fire effect still reads as fire after the snap; it never
  // reaches the saturated #ff6a00 of the old pixelfx sheets, and its lightest step is cream, not white.
  fire: ['#2a1218', '#4a1a1c', '#7c2a22', '#b04a2a', '#d97a3a', '#f0b060', '#f8dca0'],
  // smoke/dust: leather brown mixed with leather black -> warm grey, so ash never reads cold
  warmNeutral: ['#1c161c', '#2a2226', '#433a36', '#5e5448', '#807462', '#a89c86'],
};

const ALL_RAMPS = { ...HERO_RAMPS, ...DERIVED_RAMPS };

/** Which ramps each effect family is allowed to snap to. Every family also gets the ink. */
// The warm families deliberately do NOT include the character "white" ramp: its steps are cool violet-grey, and
// once pure whites snapped onto them a fireball or a hit spark read as washed-out grey. Cream comes from the
// yellow/skin rows instead. The cool white row is only used where a cold material is the point (shadow, steel).
export const FAMILY_RAMPS = {
  fire: ['fire', 'red', 'yellow', 'leather', 'skin', 'warmNeutral'],
  holy: ['yellow', 'leather', 'skin', 'warmNeutral'],
  heal: ['green', 'yellow', 'skin', 'warmNeutral'],
  nature: ['green', 'leather', 'yellow', 'hairBrown', 'warmNeutral'],
  wood: ['leather', 'yellow', 'leatherBlack', 'warmNeutral'],
  physical: ['yellow', 'white', 'leatherBlack', 'warmNeutral'],
  blood: ['red', 'leather', 'black', 'warmNeutral'],
  shadow: ['purple', 'black', 'white', 'warmNeutral'],
};

/** assets/vfx-sheets id -> family. Timing/identity are untouched; only the colour/material family is chosen. */
export const SHEET_FAMILY = {
  arrow: 'wood',
  'berserk-hit': 'blood',
  bird: 'wood',
  'cinder-cyclone': 'fire',
  'cinder-cyclone-iso': 'fire',
  'crit-hit': 'holy',
  'crit-spray': 'blood',
  'dark-cleave': 'shadow',
  'double-slash': 'physical',
  'feather-burst': 'holy',
  'fireball-blast': 'fire',
  fireball: 'fire',
  flare: 'fire',
  'gale-arrow': 'nature',
  haste: 'holy',
  'hit-spark': 'holy',
  'holy-hit': 'holy',
  'leaf-storm': 'nature',
  parry: 'holy',
  'priest-heal': 'heal',
  'root-snare': 'nature',
  'spell-charge': 'fire',
  'thorn-row': 'nature',
  thorns: 'nature',
};

const hexNum = (h) => parseInt(h.slice(1), 16);
const rOf = (c) => (c >> 16) & 255, gOf = (c) => (c >> 8) & 255, bOf = (c) => c & 255;
const luma = (c) => (0.299 * rOf(c) + 0.587 * gOf(c) + 0.114 * bOf(c)) / 255;
const ink = hexNum(HERO_INK);
const mixTo = (c, t, k) => {
  const r = rOf(c) + (rOf(t) - rOf(c)) * k, g = gOf(c) + (gOf(t) - gOf(c)) * k, b = bOf(c) + (bOf(t) - bOf(c)) * k;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
};

/** Palette for a family: every colour of its ramps, dark to light, de-duplicated. */
export function familyPalette(family) {
  const ramps = FAMILY_RAMPS[family];
  if (!ramps) throw new Error(`unknown VFX family "${family}"`);
  const set = new Set(ramps.flatMap((r) => ALL_RAMPS[r]));
  // The brightest ramps in the character file are eyes/white cloth (luma 0.93-0.98). VFX must never reach them:
  // a pure-white core is exactly the cold laser look the HeroLoom art does not have. Cap at cream (<= 0.90).
  return [...set].map(hexNum).filter((c) => luma(c) <= 0.9).sort((a, b) => luma(a) - luma(b));
}
// ---- nearest-colour lookup (5 bits per channel cache, so a 16 Mpx sheet stays fast)
const cache = new WeakMap(); // palette array -> Int32Array(32768)
function lookupFor(pal) {
  let lut = cache.get(pal);
  if (lut) return lut;
  lut = new Int32Array(32768).fill(-1);
  // the same palette with one extra dark step so mid-greys have somewhere warm to land
  cache.set(pal, lut);
  return lut;
}
function nearest(pal, lut, r, g, b) {
  const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
  let hit = lut[key];
  if (hit >= 0) return hit;
  // weight green a little higher and blue a little lower: sRGB distance alone maps warm mid-tones to grey
  let best = 0, bestD = Infinity;
  for (let i = 0; i < pal.length; i++) {
    const c = pal[i], dr = rOf(c) - r, dg = gOf(c) - g, db = bOf(c) - b;
    const d = 0.35 * dr * dr + 0.45 * dg * dg + 0.2 * db * db;
    if (d < bestD) { bestD = d; best = i; }
  }
  hit = lut[key] = best;
  return best;
}

/**
 * Recolour every frame onto the family ramp and add the ink rim.
 * frames: array of Uint8ClampedArray RGBA (each w*h*4). Mutated in place and returned.
 * opts.rim: 1 (default) or 0 to skip the outline pass.
 */
export function styleFrames(frames, w, h, family, opts = {}) {
  const pal = familyPalette(family), lut = lookupFor(pal);
  const rim = opts.rim ?? 1;
  // "up one step" colour for the inner light: the next palette entry by luma
  const up = pal.map((c, i) => (i + 1 < pal.length ? pal[i + 1] : c));
  const solid = new Uint8Array(w * h), dist = new Uint8Array(w * h), idx = new Uint8Array(w * h);
  const tmpA = new Uint8Array(w * h), thick = new Uint8Array(w * h);

  for (const data of frames) {
    // 1. snap every visible pixel to the HeroLoom ramp nearest to it
    for (let i = 0, n = w * h; i < n; i++) {
      const a = data[i * 4 + 3];
      solid[i] = a >= 128 ? 1 : 0;
      if (a === 0) { idx[i] = 0; continue; }
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      const k = nearest(pal, lut, r, g, b);
      idx[i] = k;
      const c = pal[k];
      data[i * 4] = rOf(c); data[i * 4 + 1] = gOf(c); data[i * 4 + 2] = bOf(c);
    }
    if (!rim) continue;

    // 2. distance to the nearest empty pixel (8-neighbour chamfer). 1 = silhouette edge, 2 = the pixel inside it.
    dist.fill(0);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!solid[i]) { dist[i] = 0; continue; }
        let d = 255;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) d = 1;
        else {
          d = Math.min(dist[i - 1], dist[i - w], dist[i - w - 1], dist[i - w + 1]);
          d = d === 0 ? 1 : d + 1;
        }
        dist[i] = d;
      }
    for (let y = h - 1; y >= 0; y--)
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        if (!solid[i]) continue;
        let d = dist[i];
        if (x < w - 1) d = Math.min(d, dist[i + 1] + 1);
        if (y < h - 1) {
          d = Math.min(d, dist[i + w] + 1);
          if (x < w - 1) d = Math.min(d, dist[i + w + 1] + 1);
          if (x > 0) d = Math.min(d, dist[i + w - 1] + 1);
        }
        dist[i] = Math.min(255, d);
      }
    // 3. local substance: the largest distance-to-edge found within 5x5 (separable max, 10 lookups a pixel).
    //    That tells a 3-4 px flame tongue (a darker soft edge, no pure ink) apart from a 7+ px body (a full 1 px
    //    ink rim plus a second ring), so the rim never eats a small effect's whole silhouette.
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        let m = dist[i];
        if (x > 0) m = Math.max(m, dist[i - 1]);
        if (x > 1) m = Math.max(m, dist[i - 2]);
        if (x < w - 1) m = Math.max(m, dist[i + 1]);
        if (x < w - 2) m = Math.max(m, dist[i + 2]);
        tmpA[i] = m;
      }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        let m = tmpA[i];
        if (y > 0) m = Math.max(m, tmpA[i - w]);
        if (y > 1) m = Math.max(m, tmpA[i - 2 * w]);
        if (y < h - 1) m = Math.max(m, tmpA[i + w]);
        if (y < h - 2) m = Math.max(m, tmpA[i + 2 * w]);
        thick[i] = m;
      }
    const darker = new Map();
    const darken = (c, k) => {
      const key = (c << 8) | k;
      let v = darker.get(key);
      if (v === undefined) { v = mixTo(c, ink, k / 255); darker.set(key, v); }
      return v;
    };
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x, j = i * 4;
        if (!solid[i]) continue;
        const d = dist[i], t = thick[i], c = (data[j] << 16) | (data[j + 1] << 8) | data[j + 2];
        let nc = c;
        if (d === 1 && t >= 4) {
          nc = ink;                                    // full ink rim, only on shapes that carry a 1-2 px line
          data[j + 3] = 255;
        } else if (d === 1 && t >= 2) {
          nc = darken(c, 130);                         // medium shape: a soft dark edge, hue kept
          data[j + 3] = 255;
        } else if (d === 2 && t >= 4) {
          nc = darken(c, 40);                          // second ring: the rim reads 1-2 px, never a hairline
        } else if (d === 3 && t >= 5) {
          nc = mixTo(c, up[idx[i]], 0.4);              // inner light line: the ramp step above the local tone
        }
        data[j] = rOf(nc); data[j + 1] = gOf(nc); data[j + 2] = bOf(nc);
      }
  }
  return frames;
}

/** Luma/alpha helpers shared with the checker. */
export const stats = { luma };
