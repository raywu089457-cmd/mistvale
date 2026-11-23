/* CQ FX look — repaint a pixelfx effect frame in the language of the shipped CQ effect art.
 *
 * Measured on the 194 `FX_*.png` textures exported from the shipped Unity project
 * (`_scratch/cq-herotown-re/dump/ar-export/ExportedProject/Assets/Texture2D`, copied for probing into
 * `tmp/cq-port/fx-src/`, stats in `tmp/cq-port/fx-stats.html`):
 *
 *   sprite                 size     opaque  semi  colours  sat    lum    hot%   palette
 *   fx_explosion_01        100x100  100%     0%     11     0.45   0.71    77%   #f0f0d8 #f8e080 #f89010 #f8c048 #503818
 *   fx_explosion_2x2_03    128x128  100%     0%     20     0.60   0.53    37%   #f8f8e0 core, #d85028 #785838 #503818
 *   fx_Hit_SkyBlue_00       50x50    53%    47%     13     0.41   0.79   100%   #48b0f8 #f8f8f8 #b0f8f8
 *   fx_Hit_Purple           64x64    37%    63%     12     0.64   0.59   100%   #c808f8 #f8f8f8
 *   fx_Hit_Magic_01         64x64   100%     0%     32     0.58   0.71
 *   fx_slash2              128x128      -    83%     43     0.40   0.88
 *
 * Against the pixelfx effects measured the same way (5-bit buckets, alpha > 1/255):
 *   semi 62–96%, colours 24–706, sat 0.31–0.97 (neon #60c8f0 / #70f860 / #c080f8 / #f800f8 at the top end),
 *   and every burst sits on a soft glow wash that CQ does not draw.
 *
 * The gap is four things, and this pass fixes all four:
 *   1. pixel density: the shipped effects are drawn at the cast's own 32 px/unit grid, so the pass works on the
 *      effect's 1:1 pixels and never groups blocks (`block: 1`); `?fxblock=2|3` exists only for A/B experiments,
 *   2. translucency: ours fade through everything, CQ is opaque at the core with a hard rim,
 *   3. colour count: ours run to hundreds of shades, CQ sprites sit at 11–43,
 *   4. chroma: ours reach for neon, CQ stays at sat 0.40–0.64.
 *
 * The shapes and the hue of each effect are left alone: this is a repaint, not a redesign. It is
 * deliberately non-destructive — nothing is culled except near-invisible coverage, so a big AoE keeps its
 * body — because the demo's effects are the thing being showcased.
 */

const CREAM = [248, 248, 232]; // CQ's white-hot core, averaged from the explosion sheets
const WARM = [74, 50, 26]; // #4a321a, the warm near-black CQ shades its bursts with /* derived */

/** Defaults. All of them can be overridden per call or from the page's URL (`?fxblock`, `?fxlook`). */
export const CQ_LOOK = {
  block: 1, // 1 = the characters' own pixel grid (the shipped CQ FX are drawn at the same 32 px/unit as the cast); 2-3 for experiments
  cut: 0.08, // coverage below this is nothing at all: the soft glow wash goes, the body stays
  bands: 2, // alpha grades: one hard rim step, which is what CQ's hit bursts have
  levels: 4, // per-channel levels; 4^3 = 64 colours before alpha, and the bands cut it further
  satMax: 0.52, // chroma ceiling, from the CQ FX band (0.40-0.64)
  hot: 0.55, // how far the brightest cells lean into the cream core
  warm: 0.3, // how far the darkest cells lean into CQ's warm shade
  haze: 0.45, // alpha multiplier on that dark end: CQ draws no smoke body, so the darkest cells turn to haze
  smoke: 0.55, // how far the low-chroma dark cells (dust/smoke) are pulled into the warm shade
  dust: 0.3, // alpha multiplier on those cells: CQ bursts have no grey cloud, only fire and shade
  outline: null, // CQ effects draw no outline; characters carry that. Left configurable.
  hueShift: 0, // degrees, 0 = untouched
  sample: "avg", // "avg" = blend the block's pixels, "center" = one crisp colour per block
  clean: 1, // 1-pixel despeckle after the repaint: kills the effect's own grain, keeps 1-px lines and sparks
};

const scratch = { w: 0, h: 0, f: null };

function ensureScratch(n) {
  if (!scratch.f || scratch.f.length < n * 6) scratch.f = new Float32Array(n * 6);
  return scratch.f;
}

// channel quantise table, rebuilt only when the level count changes: the inner loop must not call Math.round
const qlut = new Uint8ClampedArray(256);
let qlutLevels = 0;
function ensureQuant(levels) {
  if (qlutLevels === levels) return qlut;
  const step = 255 / (levels - 1);
  for (let v = 0; v < 256; v++) qlut[v] = Math.round(Math.round(v / step) * step);
  qlutLevels = levels;
  return qlut;
}

/**
 * Second pass of the repaint, factored out so a frame that was composited in the same sweep can share it:
 * `lo`/`span` is the luminance window of the visible pixels, everything else is a knob. Pixels under the cut
 * are cleared to nothing.
 */
function styleRange(data, lo, span, cut, bands, levels, satMax, hot, warm, haze, smoke, dust, box) {
  const Q = ensureQuant(levels);
  const aCut = cut * 255;
  const lift = 1 / bands;
  const iSpan = 1 / span;
  // `box` walks only the inked rectangle of the buffer, row by row; without it the whole buffer is one run
  let i = 0, iEnd = data.length, rowBytes = 0, jump = 0, y = 0;
  if (box) {
    rowBytes = (box.x1 - box.x0 + 1) * 4;
    i = (box.y0 * box.w + box.x0) * 4;
    iEnd = i + rowBytes;
    jump = (box.w * 4) - rowBytes;
    y = box.y0;
  }
  for (;;) {
    for (; i < iEnd; i += 4) {
      const a = data[i + 3];
      if (a <= aCut) { data[i + 3] = 0; continue; }
      let r = data[i], g = data[i + 1], b = data[i + 2];
      const l = (0.299 * r + 0.587 * g + 0.114 * b) * 0.00392157;
      const t = (l - lo) * iSpan;

      // chroma ceiling: CQ never reaches neon, so pull the outliers toward their own grey
      const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
      const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
      const chroma = (mx - mn) * 0.00392157;
      if (chroma > satMax) {
        const mid = (mx + mn) * 0.5;
        const k = satMax / chroma;
        r = mid + (r - mid) * k;
        g = mid + (g - mid) * k;
        b = mid + (b - mid) * k;
      }

      // the two ends of the ramp: burnt warm dark below, cream-white core above. A violet shadow is not burnt
      // earth: when blue leads, the dark end keeps its own hue instead of being dragged into CQ's warm shade
      const cool = b > r + 6;
      if (t > 0.72) {
        const k = hot * ((t - 0.72) * 3.5714);
        r += (CREAM[0] - r) * k; g += (CREAM[1] - g) * k; b += (CREAM[2] - b) * k;
      } else if (t > 0.14 && t < 0.22 && !cool) {
        // only the dark-mid band leans warm: the darkest band is ink (a charred floor, a well) and keeps its own hue
        const k = warm * ((0.22 - t) / 0.08);
        r += (WARM[0] - r) * k; g += (WARM[1] - g) * k; b += (WARM[2] - b) * k;
      }

      const cov = a * 0.00392157;
      // only a translucent, neutral-warm dark body (smoke, a soft glow wash) thins into haze. Solid ink -- a well's
      // black, a flat band of shadow -- has to stay solid, and a violet shadow must not become warm dust
      const dustCell = chroma < 0.1 && t < 0.55 && cov < 0.95 && !cool;
      if (dustCell) {
        const k = smoke * (1 - chroma / 0.1);
        r += (WARM[0] - r) * k; g += (WARM[1] - g) * k; b += (WARM[2] - b) * k;
      }

      // solid ink band: leave the colour alone. Rounding each channel on its own turns a brown charred floor into
      // camouflage (63,47,37 lands on 85,85,0 -- olive); scaling to a quantised luminance made the lighter browns
      // jump a whole level. Char and wells are already painted flat, so the hue is what has to survive here.
      if (cov > 0.94 && chroma < 0.3) {
        data[i] = r | 0;
        data[i + 1] = g | 0;
        data[i + 2] = b | 0;
        data[i + 3] = a;
        continue;
      }

      data[i] = Q[(r + 0.5) | 0];
      data[i + 1] = Q[(g + 0.5) | 0];
      data[i + 2] = Q[(b + 0.5) | 0];

      // alpha: graded rim, faint haze left faint, nothing below the cut
      let A = cov > lift ? 255 * (Math.ceil(cov * bands) / bands) : a;
      if (t < 0.22 && cov < 0.95) A *= haze; // a thin dark wash thins further; solid black does not
      if (dustCell) A *= dust;
      data[i + 3] = A;
    }
    if (!box || ++y > box.y1) break;
    i += jump;
    iEnd = i + rowBytes;
  }
}

/**
 * block === 1 fast path: one luminance pass and one paint pass over the pixels themselves. Same result as the
 * per-cell pass below for a one-pixel block, at about a third of the cost (a 480x410 nuke frame is the case
 * that matters: 24 ms per cell pass, 6-7 ms here).
 */
function paintPixels(data, cut, bands, levels, satMax, hot, warm, haze, smoke, dust) {
  const aCut = cut * 255;
  let lo = 1, hi = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a <= aCut) { data[i + 3] = 0; continue; }
    const l = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) * 0.00392157;
    if (l < lo) lo = l;
    if (l > hi) hi = l;
  }
  styleRange(data, lo, Math.max(0.08, hi - lo), cut, bands, levels, satMax, hot, warm, haze, smoke, dust);
}

/**
 * The whole pipeline in two sweeps instead of three: composite the frame's colour + light straight into `out`
 * (RGBA) while taking the luminance window, then repaint that buffer in the CQ language. The demo's hot loop
 * composites and repaints every layer of every live effect, so folding the two saves one full pass over the
 * frame: at four concurrent effects that is a couple of milliseconds a frame, and it is the same pixels out.
 *
 * Returns the layer's visible box `{x0, y0, x1, y1}`, or null when the layer came out empty. Effects are mostly
 * empty canvas — a meteor is 5% of its 480x410 frame, a nuke's back layer 18% — and the demo's frame cost is
 * dominated by blitting those canvases, so the box is what lets the caller upload and blit only the ink.
 * (The per-cell path, block > 1, still goes through composite + applyCqLook and reports the full frame.)
 */
export function compositeCq(f, out, o = CQ_LOOK) {
  const w = f.w, h = f.h, C = f.color, L = f.light;
  const style = o.style !== false;   // false = plain composite, still reporting the ink box (the governor's last step)
  const block = Math.max(1, Math.round(o.block ?? CQ_LOOK.block));
  const cut = o.cut ?? CQ_LOOK.cut;
  const aCut = style ? cut * 255 : 0;
  let lo = 1, hi = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;

  // The frame is mostly empty canvas on the big AoEs — a meteor inks 5% of its 480x410 frame, a nuke's back layer
  // 18% of 440x430 — and both passes below cost area, so on large frames find the inked rectangle first with a
  // read-only scan of the two source arrays and then only visit that rectangle. The scan is a load and two compares
  // per pixel, so it only pays once the frame is big enough that the ink is a small share of it (a 236x200 ring is
  // 40% ink and the scan loses, so small frames keep the plain full-frame loop). `?box=0` forces it off.
  const boxed = block === 1 && o.box !== false && w * h >= 150000;   // per-cell path needs the whole buffer anyway
  if (boxed) {
    let bx0 = w, by0 = h, bx1 = -1, by1 = -1;
    for (let y = 0; y < h; y++) {
      let i = y * w;
      for (let x = 0; x < w; x++, i++) {
        if ((C[i] >>> 24) || (L[i] & 0xffffff)) {
          if (x < bx0) bx0 = x;
          if (x > bx1) bx1 = x;
          if (y < by0) by0 = y;
          if (y > by1) by1 = y;
        }
      }
    }
    if (bx1 < 0) return null; // a fully empty frame: no upload, no blit, no repaint
    x0 = bx0; y0 = by0; x1 = bx1; y1 = by1;
    // the caller reuses this buffer every frame, and the blit only reads the box, but a few stale pixels outside it
    // would still be visible to the despeckle read: one memset is cheaper than tracking the previous box
    out.fill(0);
  }

  const yEnd = boxed ? y1 + 1 : h;
  for (let y = boxed ? y0 : 0; y < yEnd; y++) {
    let i = y * w + (boxed ? x0 : 0);
    for (let x = boxed ? x0 : 0; x < (boxed ? x1 + 1 : w); x++, i++) {
      const c = C[i], l = L[i] & 0xffffff;
      let r, g, b, a;
      const ca = c >>> 24;
      if (ca === 255) {
        r = c & 255; g = (c >>> 8) & 255; b = (c >>> 16) & 255; a = 255;
      } else {
        r = c & 255; g = (c >>> 8) & 255; b = (c >>> 16) & 255; a = ca;
      }
      if (l) {
        const lr = l & 255, lg = (l >>> 8) & 255, lb = (l >>> 16) & 255;
        if (a < 255) {
          // over transparency: premultiply what's there, add the light, divide by the new alpha
          const pa = a / 255, pr = r * pa + lr, pg = g * pa + lg, pb = b * pa + lb;
          const na = Math.min(1, Math.max(pa, Math.max(lr, lg, lb) / 255));
          if (na > 0) { r = Math.min(255, pr / na); g = Math.min(255, pg / na); b = Math.min(255, pb / na); a = na * 255; }
        } else {
          r = Math.min(255, r + lr); g = Math.min(255, g + lg); b = Math.min(255, b + lb);
        }
      }
      const j = i * 4;
      out[j] = r; out[j + 1] = g; out[j + 2] = b; out[j + 3] = a;
      // the box is taken from the pixels that survive the cut (the repaint clears everything under it), sharing the
      // branch the luminance window already needs instead of adding a second test per pixel
      if (a > aCut) {
        if (style) {
          // read the window off the bytes just written, not the floats: the repaint's thresholds see the clamped
          // 8-bit pixel, and taking the float here would drift the whole repaint on the brightest frames
          const ll = (0.299 * out[j] + 0.587 * out[j + 1] + 0.114 * out[j + 2]) * 0.00392157;
          if (ll < lo) lo = ll;
          if (ll > hi) hi = ll;
        }
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null; // nothing visible: no upload, no blit
  if (!style) return { x0, y0, x1, y1 };
  if (block !== 1) { applyCqLook(out, w, h, o); return { x0: 0, y0: 0, x1: w - 1, y1: h - 1 }; }
  styleRange(
    out, lo, Math.max(0.08, hi - lo), cut,
    Math.max(2, Math.round(o.bands ?? CQ_LOOK.bands)),
    Math.max(2, Math.round(o.levels ?? CQ_LOOK.levels)),
    o.satMax ?? CQ_LOOK.satMax, o.hot ?? CQ_LOOK.hot, o.warm ?? CQ_LOOK.warm,
    o.haze ?? CQ_LOOK.haze, o.smoke ?? CQ_LOOK.smoke, o.dust ?? CQ_LOOK.dust,
    boxed ? { x0, y0, x1, y1, w } : null,
  );
  if (o.clean ?? CQ_LOOK.clean) despeckle(out, w, h);
  return { x0, y0, x1, y1 };
}

/**
 * Voiced version of the pass: writes straight back into `data` (RGBA, w*h*4).
 * Only the canvas pixels are touched; the caller's frame buffer is what the demo blits.
 */
export function applyCqLook(data, w, h, o = {}) {
  const blockOpt = o.block ?? CQ_LOOK.block;
  // block 0 = auto: a hit spark keeps its own grid, a frost nova gets 2x2, the big AoEs 3x3, so that every
  // effect lands on the same apparent pixel size the shipped CQ effects read at.
  const block = blockOpt > 0 ? Math.max(1, Math.round(blockOpt)) : (Math.max(w, h) >= 320 ? 3 : Math.max(w, h) >= 200 ? 2 : 1);
  const cut = o.cut ?? CQ_LOOK.cut;
  const bands = Math.max(2, Math.round(o.bands ?? CQ_LOOK.bands));
  const levels = Math.max(2, Math.round(o.levels ?? CQ_LOOK.levels));
  const satMax = o.satMax ?? CQ_LOOK.satMax;
  const hot = o.hot ?? CQ_LOOK.hot;
  const warm = o.warm ?? CQ_LOOK.warm;
  const haze = o.haze ?? CQ_LOOK.haze;
  const smoke = o.smoke ?? CQ_LOOK.smoke;
  const dust = o.dust ?? CQ_LOOK.dust;
  const sample = o.sample ?? CQ_LOOK.sample;
  const clean = o.clean ?? CQ_LOOK.clean;

  if (block === 1) paintPixels(data, cut, bands, levels, satMax, hot, warm, haze, smoke, dust);
  else paintCells(data, w, h, block, sample, cut, bands, levels, satMax, hot, warm, haze, smoke, dust);
  if (clean) despeckle(data, w, h);
}

/**
 * One-pixel despeckle, for the 1:1 grid. A cell whose colour none of its solid neighbours share, while one
 * neighbour colour covers most of them, takes that neighbour colour: the effect's own per-pixel grain (invisible
 * once pixels are grouped, salt-and-pepper at 1x) goes, while a one-pixel line survives because its two collinear
 * neighbours already agree with it.
 */
const RING_DX = [-1, 0, 1, -1, 1, -1, 0, 1];
const RING_DY = [-1, -1, -1, 0, 0, 1, 1, 1];
const ringCols = new Int32Array(8);
let cleanSrc = null;   // reused copy buffer: this runs once per layer per frame, so no per-frame allocation
function despeckle(data, w, h) {
  if (w < 3 || h < 3) return;
  // one 32-bit word per pixel: this pass is memory-bound, and 4 byte loads per neighbour cost twice as much
  const n = w * h;
  if (!cleanSrc || cleanSrc.length < n) cleanSrc = new Uint32Array(n);
  const src = cleanSrc;
  src.set(new Uint32Array(data.buffer, data.byteOffset, n)); // copy
  const dst = new Uint32Array(data.buffer, data.byteOffset, n);
  for (let y = 1; y < h - 1; y++) {
    let i = y * w + 1;
    for (let x = 1; x < w - 1; x++, i++) {
      const k0 = src[i];
      if (k0 >>> 24 === 0) continue;
      const c0 = k0 & 0xffffff;
      const kl = src[i - 1], kr = src[i + 1], ku = src[i - w], kd = src[i + w];
      // a cell with matching solid neighbours on one axis and no neighbour of its own colour is grain: take
      // that neighbour colour. Two collinear neighbours agreeing is also what keeps a one-pixel line alive.
      const cl = kl & 0xffffff, cr = kr & 0xffffff;
      if (cl === cr && cl !== c0 && (kl >>> 24) >= 128 && (kr >>> 24) >= 128) { dst[i] = (k0 & 0xff000000) | cl; continue; }
      const cu = ku & 0xffffff, cd = kd & 0xffffff;
      if (cu === cd && cu !== c0 && (ku >>> 24) >= 128 && (kd >>> 24) >= 128) dst[i] = (k0 & 0xff000000) | cu;
    }
  }
}

/** Per-cell pass (block > 1): crush each block to one colour, then paint the blocks back. */
function paintCells(data, w, h, block, sample, cut, bands, levels, satMax, hot, warm, haze, smoke, dust) {
  const Q = ensureQuant(levels);
  const bx = Math.ceil(w / block);
  const by = Math.ceil(h / block);
  const cells = bx * by;
  const acc = ensureScratch(cells); // r, g, b, coverage, lum, count

  // ---- pass 1: crush each block down to its coverage-weighted colour ----
  for (let cy = 0; cy < by; cy++) {
    const y0 = cy * block, y1 = Math.min(h, y0 + block);
    for (let cx = 0; cx < bx; cx++) {
      const x0 = cx * block, x1 = Math.min(w, x0 + block);
      let ar = 0, ag = 0, ab = 0, aw = 0, n = 0;
      if (sample === "center") {
        // nearest sample: one crisp chunk per block, the way CQ art reads at this pixel size
        const sx = Math.min(w - 1, x0 + ((x1 - x0) >> 1)), sy = Math.min(h - 1, y0 + ((y1 - y0) >> 1));
        const j = (sy * w + sx) * 4, a = data[j + 3];
        ar = data[j] * a; ag = data[j + 1] * a; ab = data[j + 2] * a; aw = a; n = 1;
      } else {
        for (let y = y0; y < y1; y++) {
          let j = (y * w + x0) * 4;
          for (let x = x0; x < x1; x++, j += 4) {
            const a = data[j + 3];
            if (a) {
              ar += data[j] * a;
              ag += data[j + 1] * a;
              ab += data[j + 2] * a;
              aw += a;
            }
            n++;
          }
        }
      }
      const i = (cy * bx + cx) * 6;
      const cov = n ? aw / (n * 255) : 0;
      acc[i] = aw ? ar / aw : 0;
      acc[i + 1] = aw ? ag / aw : 0;
      acc[i + 2] = aw ? ab / aw : 0;
      acc[i + 3] = cov;
      acc[i + 4] = aw ? (0.299 * (ar / aw) + 0.587 * (ag / aw) + 0.114 * (ab / aw)) / 255 : 0;
      acc[i + 5] = n;
    }
  }

  // ---- luminance range of the visible cells, for the cream/warm ends ----
  let lo = 1, hi = 0;
  for (let c = 0; c < cells; c++) {
    const i = c * 6;
    if (acc[i + 3] < cut) continue;
    const l = acc[i + 4];
    if (l < lo) lo = l;
    if (l > hi) hi = l;
  }
  const span = Math.max(0.08, hi - lo);

  // ---- pass 2: paint it back, flat ----
  for (let cy = 0; cy < by; cy++) {
    const y0 = cy * block, y1 = Math.min(h, y0 + block);
    for (let cx = 0; cx < bx; cx++) {
      const x0 = cx * block, x1 = Math.min(w, x0 + block);
      const c = cy * bx + cx, i = c * 6;
      const cov = acc[i + 3];
      if (cov < cut) {
        for (let y = y0; y < y1; y++) {
          let j = (y * w + x0) * 4;
          for (let x = x0; x < x1; x++, j += 4) data[j + 3] = 0;
        }
        continue;
      }

      let r = acc[i], g = acc[i + 1], b = acc[i + 2];
      const l = acc[i + 4];
      const t = (l - lo) / span;

      // chroma ceiling: CQ never reaches neon, so pull the outliers toward their own grey
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const chroma = (mx - mn) / 255;
      if (chroma > satMax) {
        const mid = (mx + mn) * 0.5;
        const k = satMax / Math.max(0.0001, chroma);
        r = mid + (r - mid) * k;
        g = mid + (g - mid) * k;
        b = mid + (b - mid) * k;
      }

      // the two ends of the ramp: burnt warm dark below, cream-white core above. Blue leads => a violet shadow,
      // which keeps its own hue (see the block-1 pass above)
      const cool = b > r + 6;
      if (t > 0.72) {
        const k = hot * ((t - 0.72) / 0.28);
        r += (CREAM[0] - r) * k;
        g += (CREAM[1] - g) * k;
        b += (CREAM[2] - b) * k;
      } else if (t < 0.22 && !cool) {
        const k = warm * ((0.22 - t) / 0.22);
        r += (WARM[0] - r) * k;
        g += (WARM[1] - g) * k;
        b += (WARM[2] - b) * k;
      }

      // grey dust and smoke: CQ bursts have no grey in them, so a low-chroma warm-dark cell becomes warm haze. Solid
      // ink cells (coverage near 1) keep their colour, and a violet shadow is never dust
      const dustCell = (mx - mn) < 26 && t < 0.55 && cov < 0.95 && !cool;
      if (dustCell) {
        const k = smoke * (1 - (mx - mn) / 26);
        r += (WARM[0] - r) * k; g += (WARM[1] - g) * k; b += (WARM[2] - b) * k;
      }

      // flat shading: quantise each channel, which is what brings the colour count down to CQ's band
      const step = 255 / (levels - 1);
      const q = (v) => Math.round(Math.max(0, Math.min(255, v)) / step) * step;
      r = q(r); g = q(g); b = q(b);

      // alpha: opaque core, graded rim, nothing below the cut. Never *lifts* a pixel's opacity much, so a
      // translucent field stays translucent instead of turning into a flat disc.
      // Grade the rim upward, but never lift a faint haze to a visible band: below one band the coverage is
      // kept as-is, so an effect fading in or out fades instead of popping. /* derived */
      const band = Math.min(1, Math.ceil(cov * bands) / bands);
      const a = cov > 1 / bands ? band : cov;
      const A = Math.round(255 * a) * (t < 0.22 && cov < 0.95 ? haze : 1) * (dustCell ? dust : 1);

      for (let y = y0; y < y1; y++) {
        let j = (y * w + x0) * 4;
        for (let x = x0; x < x1; x++, j += 4) {
          data[j] = r;
          data[j + 1] = g;
          data[j + 2] = b;
          data[j + 3] = A;
        }
      }
    }
  }
}

/** Same pass, but reading the frame off a canvas and writing it back (used by the look lab). */
export function applyCqLookToCanvas(ctx, w, h, o = {}) {
  if (!ctx || !w || !h) return;
  const img = ctx.getImageData(0, 0, w, h);
  applyCqLook(img.data, w, h, o);
  ctx.putImageData(img, 0, 0);
}
