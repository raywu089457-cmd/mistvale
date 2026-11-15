// HeroLoom outfit variants.
//
// The archer's three generated equipment sets ship as complete HeroLoom-format full-character
// sheets instead of 46 extra part layers: an outfit swap is one image + one cell crop, not a new
// layered rig. This module owns everything that can be tested in node: the registry, the sheet
// validator, the 8 fps frame tables, the cell crop/mirror math and the pure decision helper the
// browser provider uses to pick outfit vs layered compose.
//
// The heavy canvas work lives in src/heroloom-hero.js (composeOutfitCell below takes an injected
// makeCanvas for exactly that reason; the test suite drives it with a tiny in-memory canvas).
//
// Sheet format (full spec in docs/HEROLOOM-OUTFITS.md):
//   PNG 512x448, 8 columns x 8 rows, cell 64x56, foot anchor [26,51], transparent background,
//   right-facing side view. Rows follow the pack order; columns are frame indices.
//   idle and walk carry 8 frames at 125 ms (8 fps, same cadence as pipeline/scripts/pixelfx);
//   attack/hurt/jump/cast/thrust/shoot keep the HeroLoom pack frame counts and timings.

import {
  HEROLOOM_ACTIONS,
  HEROLOOM_CELL,
  HEROLOOM_COLUMNS,
  HEROLOOM_ROWS,
  HEROLOOM_FOOT,
  HEROLOOM_HERO_HEIGHT,
  HEROLOOM_TICK_RATE,
  heroloomFrameIndex,
} from './heroloom.js';

// ---------------------------------------------------------------------------
// Geometry / timing constants
// ---------------------------------------------------------------------------

export const OUTFIT_CELL = HEROLOOM_CELL; // [64, 56]
export const OUTFIT_COLUMNS = HEROLOOM_COLUMNS; // 8
export const OUTFIT_ROWS = HEROLOOM_ROWS; // 8
export const OUTFIT_FOOT = HEROLOOM_FOOT; // [26, 51]
export const OUTFIT_HERO_HEIGHT = HEROLOOM_HERO_HEIGHT; // 30
export const OUTFIT_FPS = 8;
export const OUTFIT_FRAME_MS = 1000 / OUTFIT_FPS; // 125 ms/frame
export const OUTFIT_SHEET = Object.freeze({
  width: OUTFIT_COLUMNS * OUTFIT_CELL[0], // 512
  height: OUTFIT_ROWS * OUTFIT_CELL[1], // 448
  columns: OUTFIT_COLUMNS,
  rows: OUTFIT_ROWS,
  cell: OUTFIT_CELL.slice(),
  foot: OUTFIT_FOOT.slice(),
});
// Whole-canvas mirror: right-facing art with foot anchor 26 mirrors to 64-1-26 = 37.
export const OUTFIT_MIRROR_FOOT_X = OUTFIT_CELL[0] - 1 - OUTFIT_FOOT[0]; // 37
export const OUTFIT_CELL_AREA = OUTFIT_CELL[0] * OUTFIT_CELL[1];

// Per-action row layout. idle/walk are the 8 fps rows the outfit sheets raise; the other rows
// keep the HeroLoom pack frames so the DV2 action keys and one-shot timing stay untouched.
export const OUTFIT_ACTIONS = Object.freeze({
  idle: Object.freeze({ row: 0, frames: 8, ms: OUTFIT_FRAME_MS, loop: true }),
  walk: Object.freeze({ row: 1, frames: 8, ms: OUTFIT_FRAME_MS, loop: true }),
  attack: Object.freeze({ row: 2, frames: 6, ms: 70, loop: false }),
  hurt: Object.freeze({ row: 3, frames: 3, ms: 100, loop: false }),
  jump: Object.freeze({ row: 4, frames: 5, ms: 90, loop: false }),
  cast: Object.freeze({ row: 5, frames: 5, ms: 110, loop: false }),
  thrust: Object.freeze({ row: 6, frames: 5, ms: 70, loop: false }),
  shoot: Object.freeze({ row: 7, frames: 5, ms: 100, loop: false }),
});
export const OUTFIT_ACTION_NAMES = Object.freeze(Object.keys(OUTFIT_ACTIONS));

// Sanity guard: the table must fit the sheet. Kept as a value so validateOutfitSheet() can report
// a broken table as an error instead of silently cropping outside the image.
const TABLE_PROBLEMS = (() => {
  const problems = [];
  for (const [name, act] of Object.entries(OUTFIT_ACTIONS)) {
    if (act.row < 0 || act.row >= OUTFIT_ROWS) problems.push(`${name}: row ${act.row} outside 0..${OUTFIT_ROWS - 1}`);
    if (act.frames < 1 || act.frames > OUTFIT_COLUMNS) problems.push(`${name}: ${act.frames} frames outside 1..${OUTFIT_COLUMNS}`);
    if (!(act.ms > 0)) problems.push(`${name}: bad frame duration ${act.ms}`);
  }
  if (new Set(OUTFIT_ACTION_NAMES.map((n) => OUTFIT_ACTIONS[n].row)).size !== OUTFIT_ACTION_NAMES.length) {
    problems.push('two actions share a row');
  }
  return problems;
})();

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

// `palette` is a documentation hint (what the generated art uses); the engine never tints outfit
// cells, so it is informational only.
export const OUTFITS = Object.freeze({
  a: Object.freeze({
    id: 'a',
    name: '森林遊俠',
    en: 'Forest Ranger',
    sheet: 'archer-a.png',
    palette: Object.freeze({ cloth: 'green', leather: 'brown', hair: 'brown' }),
  }),
  b: Object.freeze({
    id: 'b',
    name: '皇家藍銀',
    en: 'Royal Blue-Silver',
    sheet: 'archer-b.png',
    palette: Object.freeze({ cloth: 'blue', leather: 'silver', hair: 'blond' }),
  }),
  c: Object.freeze({
    id: 'c',
    name: '沙丘獵人',
    en: 'Desert Hunter',
    sheet: 'archer-c.png',
    palette: Object.freeze({ cloth: 'sand', leather: 'bronze', hair: 'brown' }),
  }),
});
export const OUTFIT_IDS = Object.freeze(Object.keys(OUTFITS));

const OFF_VALUES = new Set(['off', 'none', 'default', 'base', 'layered', '0', 'false', 'null']);

// Base URL for the outfit sheets. The build injects window.PIXEL_ASSETS.heroloomOutfitsBase (like
// heroloomBase); tests and node callers get the same path the game defaults to.
export function outfitBase() {
  const assets = typeof globalThis !== 'undefined' ? globalThis.PIXEL_ASSETS : null;
  const raw = (assets && assets.heroloomOutfitsBase) || 'media/heroloom-outfits/';
  return /\/$/.test(raw) ? raw : `${raw}/`;
}

// Accepts 'a', 'A', ' archer-a.png ', 'archer_a' ...; returns 'a'|'b'|'c' or null for unknown /
// off / default values.
export function normalizeOutfitId(value) {
  if (value == null) return null;
  const id = String(value).trim().toLowerCase()
    .replace(/^archer[-_]/, '')
    .replace(/\.png$/, '');
  return Object.prototype.hasOwnProperty.call(OUTFITS, id) ? id : null;
}

export function isOutfitId(value) {
  return normalizeOutfitId(value) != null;
}

export function isOutfitOffValue(value) {
  if (value == null) return true;
  const s = String(value).trim().toLowerCase();
  return s === '' || OFF_VALUES.has(s);
}

export function outfitSheetUrl(id) {
  const key = normalizeOutfitId(id);
  if (!key) return null;
  return outfitBase() + OUTFITS[key].sheet;
}

export function outfitLabel(id) {
  const key = normalizeOutfitId(id);
  if (!key) return '';
  return `${key.toUpperCase()} ${OUTFITS[key].name}`;
}

// ---------------------------------------------------------------------------
// Frame tables
// ---------------------------------------------------------------------------

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

// Cumulative frame-end times in HeroLoom ticks (tickRate 20 → 50 ms). Fractional values are fine:
// heroloomFrameIndex compares tick+1 against them, so an 8-frame idle at 2.5 ticks/frame alternates
// 3/2 ticks → 150/100 ms on screen, averaging exactly 125 ms (8 fps).
export function outfitAfFor(name, frames) {
  const act = OUTFIT_ACTIONS[name];
  if (!act) return [];
  const n = frames == null ? act.frames : Math.max(0, Math.min(act.frames, Math.floor(Number(frames) || 0)));
  if (!n) return [];
  const per = (act.ms * HEROLOOM_TICK_RATE) / 1000;
  const af = [];
  for (let i = 0; i < n; i++) af.push(round4((i + 1) * per));
  return af;
}

export function outfitAf(name) {
  return outfitAfFor(name, null);
}

// Same loop/clamp rule as the layered engine: loop actions wrap, one-shots clamp and hold the last
// frame (the game only advances them while the action plays).
export function outfitFrameIndex(af, tick) {
  return heroloomFrameIndex(af, tick);
}

// Playback for one action given how many frames the delivered sheet actually has. A 4- or 6-frame
// idle/walk sheet still plays correctly at the declared frame duration; `short` is what the lab
// shows when the art lags the 8-frame target.
export function outfitPlayback(name, available) {
  const act = OUTFIT_ACTIONS[name];
  if (!act) return null;
  const declared = act.frames;
  const usable = Number.isFinite(available) && available > 0 ? Math.floor(available) : declared;
  const frames = Math.max(1, Math.min(declared, usable));
  return {
    action: name,
    row: act.row,
    frames,
    declared,
    ms: act.ms,
    loop: !!act.loop,
    af: outfitAfFor(name, frames),
    short: frames < declared,
  };
}

// Cell rectangle for a frame. `frames` overrides the declared count so a sheet whose idle row only
// has 4 usable cells loops over 4. Returns null for an unknown action.
export function outfitCellRect(action, frame, opts = {}) {
  const act = OUTFIT_ACTIONS[action];
  if (!act) return null;
  const total = Number.isFinite(opts.frames) && opts.frames > 0
    ? Math.max(1, Math.min(act.frames, Math.floor(opts.frames)))
    : act.frames;
  const n = Math.floor(Number(frame) || 0);
  const index = act.loop
    ? ((n % total) + total) % total
    : Math.max(0, Math.min(total - 1, n));
  const cw = OUTFIT_CELL[0];
  const ch = OUTFIT_CELL[1];
  return {
    action,
    row: act.row,
    index,
    frames: total,
    declared: act.frames,
    sx: index * cw,
    sy: act.row * ch,
    w: cw,
    h: ch,
  };
}

// Foot anchor for a cropped cell. The crop is taken after the whole 64-px cell is mirrored, so the
// mirrored right-facing anchor becomes 37 - x0; normal cells keep 26 - x0.
export function outfitAnchor(mirror, x0, y0) {
  const anchorX = mirror ? OUTFIT_MIRROR_FOOT_X : OUTFIT_FOOT[0];
  return {
    footX: anchorX - (Number(x0) || 0),
    footY: OUTFIT_FOOT[1] - (Number(y0) || 0),
  };
}

// Alpha bounding box with the same 1 px pad the layered engine uses. Returns null for a fully
// transparent cell (that frame is unusable, the provider falls back to the layered rig).
export function outfitCropRect(rgba, width, height) {
  if (!rgba || !width || !height) return null;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    let o = (y * width) * 4 + 3;
    for (let x = 0; x < width; x++, o += 4) {
      if (rgba[o]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - 1);
  y0 = Math.max(0, y0 - 1);
  x1 = Math.min(width - 1, x1 + 1);
  y1 = Math.min(height - 1, y1 + 1);
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// ---------------------------------------------------------------------------
// Sheet validation (dependency free: header-level PNG parsing, no image libs)
// ---------------------------------------------------------------------------

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const PNG_COLOR_TYPES = Object.freeze({ 0: 'gray', 2: 'rgb', 4: 'gray+alpha', 6: 'rgba' });

function toBytes(input) {
  if (!input) return null;
  if (input instanceof Uint8Array) return input;
  if (typeof ArrayBuffer !== 'undefined' && input instanceof ArrayBuffer) return new Uint8Array(input);
  if (typeof input === 'object' && input.buffer instanceof ArrayBuffer) {
    return new Uint8Array(input.buffer, input.byteOffset || 0, input.byteLength || input.buffer.byteLength);
  }
  return null;
}

function isImageLike(input) {
  return !!input && typeof input === 'object'
    && (typeof input.naturalWidth === 'number' || typeof input.width === 'number');
}

function readIhdr(bytes) {
  // PNG layout: 8-byte signature, then length(4) type(4) data... The first chunk must be IHDR.
  if (bytes.length < 33) return null;
  const length = (bytes[8] << 24 | bytes[9] << 16 | bytes[10] << 8 | bytes[11]) >>> 0;
  const type = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (type !== 'IHDR' || length !== 13) return null;
  const u32 = (o) => ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
  return {
    width: u32(16),
    height: u32(20),
    bitDepth: bytes[24],
    colorType: bytes[25],
    compression: bytes[26],
    filter: bytes[27],
    interlace: bytes[28],
  };
}

// Accepts a PNG byte array (Uint8Array/Buffer/ArrayBuffer) or an image-like object with
// naturalWidth/width and naturalHeight/height (the browser provider passes the loaded <img>).
// Returns { ok, errors, warnings, geometry, png, source }. Geometry is checked against the sheet
// spec; the frame occupancy scan is outfitSheetFrames() and is intentionally separate so a
// 4-frame idle sheet still loads (it plays 4 frames and reports short).
export function validateOutfitSheet(input) {
  const errors = [];
  const warnings = [];
  const bytes = toBytes(input);
  let source = null;
  let width = 0;
  let height = 0;
  let png = null;

  if (bytes) {
    source = 'bytes';
    if (bytes.length < 33) {
      errors.push(`sheet is shorter than a PNG header (${bytes.length} B)`);
    } else {
      let signatureOk = true;
      for (let i = 0; i < PNG_SIGNATURE.length; i++) {
        if (bytes[i] !== PNG_SIGNATURE[i]) { signatureOk = false; break; }
      }
      if (!signatureOk) {
        errors.push('not a PNG: bad 8-byte signature');
      } else {
        png = readIhdr(bytes);
        if (!png) {
          errors.push('PNG has no readable IHDR chunk');
        } else {
          width = png.width;
          height = png.height;
          if (png.bitDepth !== 8) errors.push(`PNG bit depth ${png.bitDepth}, expected 8`);
          if (png.colorType === 2) warnings.push('PNG colour type 2 (RGB): no alpha channel, transparency will be ignored');
          else if (png.colorType === 4) warnings.push('PNG colour type 4 (gray+alpha): alpha scan needs an RGBA conversion');
          else if (png.colorType === 0) warnings.push('PNG colour type 0 (gray): no alpha channel, transparency will be ignored');
          if (png.interlace) errors.push('interlaced PNG (Adam7) is not supported');
        }
      }
    }
  } else if (isImageLike(input)) {
    source = 'image';
    width = Number(input.naturalWidth || input.width) || 0;
    height = Number(input.naturalHeight || input.height) || 0;
    if (!width || !height) errors.push('image reports no width/height');
  } else {
    errors.push('unsupported sheet source: pass PNG bytes, a Buffer, or an image-like {width,height}');
  }

  if (width && height && (width !== OUTFIT_SHEET.width || height !== OUTFIT_SHEET.height)) {
    errors.push(
      `sheet is ${width}x${height}, expected ${OUTFIT_SHEET.width}x${OUTFIT_SHEET.height} `
      + `(${OUTFIT_COLUMNS} columns x ${OUTFIT_ROWS} rows of ${OUTFIT_CELL[0]}x${OUTFIT_CELL[1]})`,
    );
  }
  for (const problem of TABLE_PROBLEMS) errors.push(`frame table: ${problem}`);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    source,
    png,
    geometry: { width, height },
    expected: {
      width: OUTFIT_SHEET.width,
      height: OUTFIT_SHEET.height,
      columns: OUTFIT_COLUMNS,
      rows: OUTFIT_ROWS,
      cell: OUTFIT_CELL.slice(),
      foot: OUTFIT_FOOT.slice(),
      actions: OUTFIT_ACTION_NAMES.map((name) => ({ name, ...OUTFIT_ACTIONS[name] })),
    },
  };
}

// Per-row occupancy scan over decoded RGBA pixels. Tells the provider (and the art report) which
// cells actually carry art: `ok` is true only when every declared frame of every row has ink, which
// is the "full 8-frame idle/walk sheet" target. Empty cells are listed so a partially generated
// sheet degrades one action at a time instead of failing wholesale.
export function outfitSheetFrames(rgba, width, height, opts = {}) {
  const errors = [];
  if (!rgba || typeof rgba.length !== 'number') errors.push('pixel buffer missing');
  if (!width || !height) errors.push('pixel dimensions missing');
  if (!errors.length && rgba.length < width * height * 4) {
    errors.push(`pixel buffer is ${rgba.length} B, expected at least ${width * height * 4} B`);
  }
  if (!errors.length && (width !== OUTFIT_SHEET.width || height !== OUTFIT_SHEET.height)) {
    errors.push(`pixel buffer is ${width}x${height}, expected ${OUTFIT_SHEET.width}x${OUTFIT_SHEET.height}`);
  }
  if (errors.length) return { ok: false, errors, rows: [], width, height, minPixels: 0 };

  const minPixels = Number.isFinite(opts.minPixels) ? Math.max(1, Math.floor(opts.minPixels)) : 24;
  const cw = OUTFIT_CELL[0];
  const ch = OUTFIT_CELL[1];
  const rows = [];
  let ok = true;
  for (const name of OUTFIT_ACTION_NAMES) {
    const act = OUTFIT_ACTIONS[name];
    const cells = [];
    const empty = [];
    for (let i = 0; i < act.frames; i++) {
      const sx = i * cw;
      const sy = act.row * ch;
      let pixels = 0;
      for (let y = 0; y < ch; y++) {
        let o = ((sy + y) * width + sx) * 4 + 3;
        for (let x = 0; x < cw; x++, o += 4) {
          if (rgba[o] > 8) pixels++;
        }
      }
      const used = pixels >= minPixels;
      cells.push({ index: i, pixels, used });
      if (!used) empty.push(i);
    }
    if (empty.length) ok = false;
    rows.push({
      action: name,
      row: act.row,
      frames: act.frames,
      declared: act.frames,
      used: act.frames - empty.length,
      empty,
      loop: !!act.loop,
      ms: act.ms,
      cells,
    });
  }
  return { ok, errors: [], rows, width, height, cell: OUTFIT_CELL.slice(), minPixels };
}

// ---------------------------------------------------------------------------
// Compose
// ---------------------------------------------------------------------------

function defaultCanvas(width, height) {
  if (typeof document !== 'undefined' && document && typeof document.createElement === 'function') {
    const cv = document.createElement('canvas');
    cv.width = width;
    cv.height = height;
    return cv;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  throw new Error('heroloom-outfits: no canvas implementation available (pass opts.makeCanvas)');
}

// Crop one cell from a full outfit sheet, mirror it if needed, box+pad it and compute the foot
// anchor. Same contract shape as the layered compose in src/heroloom-hero.js, with an empty
// `parts` list because an outfit cell is a single baked image. Returns null for an unusable
// request (unknown action, sheet too small, transparent cell) so the provider can fall back.
export function composeOutfitCell(img, action, frame, opts = {}) {
  if (!img) return null;
  const act = OUTFIT_ACTIONS[action];
  if (!act) return null;
  const iw = Number(img.naturalWidth || img.width) || 0;
  const ih = Number(img.naturalHeight || img.height) || 0;
  if (iw < OUTFIT_SHEET.width || ih < OUTFIT_SHEET.height) return null;

  const makeCanvas = typeof opts.makeCanvas === 'function' ? opts.makeCanvas : defaultCanvas;
  const cw = OUTFIT_CELL[0];
  const ch = OUTFIT_CELL[1];
  const rect = outfitCellRect(action, frame, { frames: opts.frames });
  if (!rect) return null;

  const cell = makeCanvas(cw, ch);
  cell.getContext('2d').drawImage(img, rect.sx, rect.sy, cw, ch, 0, 0, cw, ch);

  const mirror = !!opts.mirror;
  let source = cell;
  if (mirror) {
    source = makeCanvas(cw, ch);
    const mctx = source.getContext('2d');
    mctx.translate(cw, 0);
    mctx.scale(-1, 1);
    mctx.drawImage(cell, 0, 0);
  }

  const pixels = source.getContext('2d').getImageData(0, 0, cw, ch).data;
  const crop = outfitCropRect(pixels, cw, ch);
  if (!crop) return null;

  const cv = makeCanvas(crop.w, crop.h);
  cv.getContext('2d').drawImage(source, crop.x0, crop.y0, crop.w, crop.h, 0, 0, crop.w, crop.h);
  const anchor = outfitAnchor(mirror, crop.x0, crop.y0);
  const id = normalizeOutfitId(opts.id) || '';
  const key = `outfit|${id}|${action}|${rect.index}|${mirror ? 1 : 0}`;

  return {
    cv,
    footX: anchor.footX,
    footY: anchor.footY,
    heroHeight: OUTFIT_HERO_HEIGHT,
    parts: [],
    shadow: { cv, footX: anchor.footX, footY: anchor.footY },
    look: opts.look || null,
    key,
    outfit: id || null,
    action,
    frame: rect.index,
    mirror,
    crop: { x0: crop.x0, y0: crop.y0, w: crop.w, h: crop.h },
  };
}

// ---------------------------------------------------------------------------
// Outfit-vs-layered decision (pure, shared by the provider and the tests)
// ---------------------------------------------------------------------------

// Precedence: per-call req.outfit -> look.outfit -> setOutfit() default. Only the archer has outfit
// art, so every other class always layers. Explicit off/default/null disables; unknown ids are
// reported (and layered). `loaded` says whether the provider currently has a validated sheet; when
// it does not, `reason` tells the caller why (pending / invalid / missing) so status() can flag it.
export function resolveOutfitUse(opts = {}) {
  const classId = String(opts.classId || '').split('@')[0].trim().toLowerCase();
  if (classId !== 'archer') return { id: null, use: false, reason: 'class' };

  const candidates = [opts.reqOutfit, opts.lookOutfit, opts.defaultOutfit];
  let raw = null;
  for (const candidate of candidates) {
    if (candidate != null && String(candidate).trim() !== '') { raw = candidate; break; }
  }
  if (raw == null || isOutfitOffValue(raw)) return { id: null, use: false, reason: 'off' };

  const id = normalizeOutfitId(raw);
  if (!id) return { id: null, use: false, reason: 'unknown' };
  if (!opts.loaded) {
    const reason = opts.pending ? 'pending' : (opts.failed ? 'invalid' : 'missing');
    return { id, use: false, reason };
  }
  return { id, use: true, reason: 'outfit' };
}
