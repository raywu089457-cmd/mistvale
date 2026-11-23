// Mixed text: the built-in pixel fonts (mini, big) set at an effect's own scale, and anything they lack,
// Chinese above all, from Ark Pixel 12 (src/core/glyphs-ark.js) at its native 12 px, never scaled down to
// 5 or 7 rows. It needs no canvas and no font loading, so Node renders it the same as the browser.

import { FONTS } from "./font.js";
import { ARK_DATA, ARK_H } from "./glyphs-ark.js";

let index = null, bits = null;
const cache = new Map();
function load() {
  index = new Map();
  let cp = 0;
  ARK_DATA.cps.split(",").forEach((d, i) => index.set((cp += parseInt(d, 36)), i));
  const bin = atob(ARK_DATA.rows);
  bits = new Uint16Array(bin.length >> 1);
  for (let i = 0; i < bits.length; i++) bits[i] = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
}

// what a missing character draws: a hollow box the size of a Chinese glyph, so a gap in the font shows
const TOFU = (() => {
  const rows = Array.from({ length: ARK_H }, (_, y) => Array.from({ length: 12 }, (_, x) => y < 11 && x > 0 && x < 10 && (y === 0 || y === 10 || x === 1 || x === 9)));
  return { w: 12, rows, flat: true, native: true, missing: true, ink: [1, 10], top: 0, bottom: 10 };
})();

/**
 * Ark Pixel 12's glyph for one character: { w (advance, px), rows (ARK_H rows of booleans), flat (no bevel:
 * its 1 px strokes are all edge), native, ink: [first, last inked column], top, bottom (inked rows) }, or null
 * if the font doesn't have it.
 */
export function arkGlyph(ch) {
  if (!index) load();
  if (cache.has(ch)) return cache.get(ch);
  const i = index.get(ch.codePointAt(0));
  let g = null;
  if (i !== undefined) {
    const w = parseInt(ARK_DATA.widths[i], 16) + 1, rows = [];
    let x0 = w, x1 = -1, top = ARK_H, bottom = -1;
    for (let y = 0; y < ARK_H; y++) {
      const b = bits[i * ARK_H + y], row = [];
      for (let x = 0; x < w; x++) {
        const on = ((b >> x) & 1) === 1;
        row.push(on);
        if (on) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (top = Math.min(top, y)), (bottom = Math.max(bottom, y));
      }
      rows.push(row);
    }
    g = { w, rows, flat: true, native: true, ink: [x0, x1], top, bottom };
  }
  cache.set(ch, g);
  return g;
}

/** Whether every character of str can be drawn (by the built-in font or Ark Pixel 12): no boxes. */
export function canSpell(str, font = "big") {
  const F = FONTS[font];
  for (const ch of String(str)) if (!/\s/.test(ch) && !F.glyphs[ch] && !F.glyphs[ch.toUpperCase()] && !arkGlyph(ch)) return false;
  return true;
}

/**
 * Lay str out left to right, in font pixels of the built-in font (mini 5 rows, big 7) at the effect's scale:
 * multiply every x, y, w, h by the px per font pixel you draw at, and a letter's own glyph by that times k.
 * Letters the font has come out exactly as they always did (k = 1, y = 0); the rest are Ark Pixel 12 glyphs
 * with k = native / scale, so at the nominal scale they land at `native` (a whole number, 1 by default) px
 * per pixel, and the line grows to fit them, centered. A character neither font has draws as a hollow box.
 * Returns { letters: [{ ch, g (null for a space), x, y, w, h, k, native }], w, h, scale, pw, ph (the ink's
 * real size in px at the nominal scale), native (any Ark glyphs) }.
 */
export function layoutText(str, font = "big", scale = 1, native = 1) {
  const F = FONTS[font], letters = [];
  const n = Math.max(1, Math.round(native)), kn = n / scale;
  let x = 0, prev = null, any = false, top = ARK_H, bottom = -1;
  for (const ch of String(str)) {
    let g = F.glyphs[ch] ?? F.glyphs[ch.toUpperCase()] ?? null, k = 1, nat = false;
    if (!g && !/\s/.test(ch)) (g = arkGlyph(ch) ?? TOFU), (k = kn), (nat = any = true);
    // spacing: the font's gap after its own letters; an Ark glyph's advance already has its 1 px, so after
    // one only what makes up the font's gap before a built-in letter, and before one the font's gap again
    if (prev) x += prev.native ? (nat ? 0 : Math.max(0, F.gap - kn)) : F.gap;
    if (nat && !prev) x -= g.ink[0] * k; // the line starts at the first ink, as the built-in glyphs do
    const w = g ? g.w * k : F.space;
    if (nat) (top = Math.min(top, g.top)), (bottom = Math.max(bottom, g.bottom));
    const L = { ch, g, x, y: 0, w, h: nat ? ARK_H * k : F.h, k, native: nat };
    letters.push(L);
    x += w;
    prev = L;
  }
  // the width ends at the last ink: an Ark glyph's advance carries blank columns on its right
  let w = Math.max(0, x);
  if (prev?.native) w -= (prev.g.w - 1 - prev.g.ink[1]) * prev.k;
  let h = F.h;
  if (any) {
    // the line is as tall as the taller of the font and the Chinese ink; both are centered on it, in whole px
    const ink = (bottom - top + 1) * n, H = Math.max(F.h * scale, ink);
    const fy = Math.round((H - F.h * scale) / 2) / scale, ny = (Math.round((H - ink) / 2) - top * n) / scale;
    for (const L of letters) L.y = L.native ? ny : fy;
    h = H / scale;
  }
  return { letters, w, h, scale, pw: Math.round(w * scale), ph: Math.round(h * scale), native: any };
}

/** The real size [w, h] in px of str laid out by layoutText at that scale. */
export function textSize(str, font = "big", scale = 1, native = 1) {
  const t = layoutText(str, font, scale, native);
  return [t.pw, t.ph];
}
