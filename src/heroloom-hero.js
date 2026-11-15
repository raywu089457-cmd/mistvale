// HeroLoom hero renderer for Mistvale: browser half.
//
// Drop-in replacement for the DV2 provider (src/paperdoll-hero.js createDollHero) — same consumer API
// in src/pixel-world.js:
//   createDollHero({trackImage, makeCanvas, base, cap, onEvict, onReady, loadTimeoutMs})
//     -> { setSpec, status, covers, compose, get on, get data, weaponTypeOf, resolve }
// plus lab/test extras: look(), recipe(), composeRecipe(recipe, …), bakeRecipe(recipe), frame(), counters().
//
// compose(hunter, {action, tick, dir, hideWeapon, outfit}) returns
//   { cv, footX, footY, heroHeight, parts, look, key, shadow }
// where cv is the frame cell cropped to its alpha bbox (+1 px pad) and footX/footY are the pack's foot
// anchor [26,51] re-expressed in crop pixels, so the consumer draws it exactly like a DV2 doll:
//   ctx.drawImage(cv, x - footX*k, y - footY*k)   with k = 21 / heroHeight.
// Left-facing is a whole-canvas mirror (the pack only draws the right-facing side view).
//
// Implementation note: the pack bakes whole 512×448 sheets, but the game only ever needs one 64×56 cell at
// a time. We compose the cell from the part layers directly (tinting only that cell) and cache the cropped
// result, so there is no async bake on the render path, no sheet-sized memory per recipe, and swapping gear
// costs one 64×56 composition. bakeRecipe() still exists for the lab/tests that want a full sheet.
//
// The pack is licensed for use inside your own projects (see assets/heroloom/LICENSE.txt); it is copied to
// media/heroloom/ by build.mjs and is never exposed as a downloadable asset pack.
//
// Outfits (archer only): setOutfit('a'|'b'|'c'|null) swaps the archer to one of the generated
// full-character sheets from src/heroloom-outfits.js. A sheet is optional art loaded after the pack
// and NOT run through opts.trackImage (a 404 must not trip the game's asset-failure boot gate); when
// it is absent or invalid the layered compose above is used unchanged and status().outfit flags it.
// req.outfit beats look.outfit, which beats setOutfit(); 'off'/'default'/null forces layered.

import {
  HEROLOOM_ACTIONS,
  HEROLOOM_CELL,
  HEROLOOM_COLUMNS,
  HEROLOOM_ROWS,
  HEROLOOM_FOOT,
  HEROLOOM_HERO_HEIGHT,
  HEROLOOM_TICK_RATE,
  HEROLOOM_LAYERS,
  HEROLOOM_PALETTES,
  HEROLOOM_CLASSES,
  CLASS_LOOK,
  HEROLOOM_BASE,
  heroloomLook,
  heroloomRecipe,
  heroloomRecipeSig,
  heroloomActionKey,
  heroloomFrameIndex,
  heroloomAf,
  heroloomData,
} from './heroloom.js';
import {
  OUTFIT_ACTIONS,
  OUTFIT_ACTION_NAMES,
  OUTFIT_HERO_HEIGHT,
  OUTFIT_IDS,
  OUTFIT_SHEET,
  composeOutfitCell,
  isOutfitOffValue,
  normalizeOutfitId,
  outfitBase,
  outfitFrameIndex,
  outfitPlayback,
  outfitSheetFrames,
  outfitSheetUrl,
  resolveOutfitUse,
  validateOutfitSheet,
} from './heroloom-outfits.js';

const OFF_RE = /^(0|off|no|sheet|none|false)$/i;
const FALLBACK_TIMEOUT = 8000;
const MAX_CELLS = 420;   // tinted 64×56 cells (≈14 KB each)
const MAX_CROPS = 640;   // cropped frames (≈5 KB each)
const MAX_TINTS = 96;    // tinted full images, only used by bakeRecipe() (lab/tests)

/** Default canvas factory (document in the game, OffscreenCanvas in workers). */
function defaultCanvas(w, h) {
  if (typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  throw new Error('heroloom: no canvas implementation');
}

/**
 * Load one image through the injected loader (or an <img> element).
 * `track` MUST be called before `src` is set: the game's trackImage() attaches load/error
 * listeners to count asset progress, and an already-loaded image never fires them (that made
 * the boot progress stick at 67% forever).
 */
function loadImageUrl(url, injected, timeoutMs, track) {
  if (injected) return Promise.resolve(injected(url));
  return new Promise((ok, fail) => {
    const img = new Image();
    try { track?.(img); } catch (e) { /* count failures must not break loading */ }
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; fail(new Error('heroloom: image timeout ' + url)); } }, timeoutMs || FALLBACK_TIMEOUT);
    img.onload = () => { if (!done) { done = true; clearTimeout(timer); ok(img); } };
    img.onerror = () => { if (!done) { done = true; clearTimeout(timer); fail(new Error('heroloom: cannot load ' + url)); } };
    img.src = url;
  });
}

const HEX = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
/** Game direction index (0 up, 1 side-right, 2 down, 3 side-left) — pixel-world uses it for mounts / DOLL_HOR. */
const DIR_INDEX = { up: 0, side: 1, sideRight: 1, down: 2, left: 3, sideLeft: 3 };
const dirIndexOf = (dir) => (DIR_INDEX[dir] != null ? DIR_INDEX[dir] : 1);
/**
 * parts for one compose call: dir = what is actually drawn (the pack only has the side view: 1 right, 3 mirrored left),
 * wantDir = the requested 4-quadrant direction (0 up, 1 right, 2 down, 3 left). Built per call because the crop cache is keyed by
 * mirror only and is shared by every direction (a cached parts object would carry the direction of whoever filled the entry first).
 */
const partsFor = (e, want, mirror) => Object.assign([], { action: e.action, slot: e.slot, dir: mirror ? 3 : 1, dirName: mirror ? 'sideLeft' : 'side', wantDir: dirIndexOf(want) });

export function createDollHero(opts = {}) {
  const makeCanvas = typeof opts.makeCanvas === 'function' ? opts.makeCanvas : defaultCanvas;
  const capFn = () => (typeof opts.cap === 'function' ? opts.cap() : opts.cap) || MAX_CROPS;
  const base = () => {
    const b = typeof opts.base === 'function' ? opts.base() : opts.base;
    return b || HEROLOOM_BASE();
  };

  let spec = null;   // character.json
  let data = null;   // DV2-compatible facade (src/heroloom.js heroloomData)
  let on = false;    // spec requested by the game (?doll flag)
  let loading = false;
  let closed = false;
  let failed = null;
  let readyAt = 0;
  let classes = HEROLOOM_CLASSES.slice();

  const images = new Map();       // url -> Image (all part layers)
  const cellCache = new Map();    // url|variant|cellKey -> tinted 64×56 cell canvas
  const tintCache = new Map();    // url|ramp|variant -> full tinted image (bakeRecipe only)
  const cropCache = new Map();    // recipeSig|action|frame|mirror -> {cv, footX, footY, parts}

  // Outfit variants (archer only). Optional art: sheets load after the pack, never tracked, and a
  // missing/invalid sheet simply leaves the layered compose in charge.
  const outfitDisabled = opts.outfits === false;
  let outfitDefault = null;            // id set through setOutfit(); req.outfit still wins per call
  const outfitSheets = new Map();      // id -> {id, url, img, info, playback, usable}
  const outfitFailures = new Map();    // id -> error message (missing 404 / invalid header)
  const outfitRequests = new Set();    // ids currently loading
  const outfitCropCache = new Map();   // outfit|id|action|frame|mirror|sheetAt -> {cv,footX,footY,parts,key}
  let outfitComposes = 0, outfitHits = 0, outfitMisses = 0, outfitFallbacks = 0;

  let hits = 0, misses = 0, bakes = 0, composeCount = 0, composeMs = 0, lastBakeMs = 0, failedCount = 0;

  const isOn = () => !!(on && !closed);

  function setSpec(v) {
    const flag = String(v == null ? 'hero' : v).trim();
    if (OFF_RE.test(flag) || !flag) { on = false; return; }
    on = true;
    const m = /^(?:hero|heroloom|loom)(?::(.+))?$/i.exec(flag);
    const list = m && m[1] ? m[1].split(',').map((s) => s.trim().toLowerCase()).filter((c) => CLASS_LOOK[c]) : null;
    classes = list && list.length ? list : HEROLOOM_CLASSES.slice();
    if (!loading && !data && !failed) load();
  }

  function load() {
    if (loading || data || closed) return;
    loading = true;
    const timeoutMs = opts.loadTimeoutMs || FALLBACK_TIMEOUT;
    const url = base() + 'character.json';
    const get = (u) => new Promise((ok, fail) => {
      try {
        const x = new XMLHttpRequest();
        x.open('GET', u, true);
        x.responseType = 'text';
        x.onload = () => {
          if (x.status >= 200 && x.status < 300) ok(x.responseText);
          else fail(new Error('heroloom: ' + x.status + ' ' + u));
        };
        x.onerror = () => fail(new Error('heroloom: cannot fetch ' + u));
        x.send();
      } catch (e) { fail(e); }
    });
    let timer = null;
    const timeout = new Promise((_, fail) => { timer = setTimeout(() => fail(new Error('heroloom: load timeout')), timeoutMs); });
    Promise.race([get(url), timeout])
      .then((text) => { spec = JSON.parse(text); return preloadImages(timeoutMs); })
      .then(() => {
        data = heroloomData();
        return prewarm();
      })
      .then(() => {
        clearTimeout(timer);
        loading = false;
        readyAt = Date.now();
        try { opts.onReady?.(); } catch (e) { /* the game's asset event must not break the doll */ }
        // Optional outfit art, fire-and-forget: the hero is playable with the layered rig already.
        loadOutfits(timeoutMs);
      })
      .catch((e) => {
        clearTimeout(timer);
        loading = false;
        failed = String((e && e.message) || e);
        failedCount++;
      });
  }

  /** Collect every part layer file of the pack and load it once. */
  async function preloadImages(timeoutMs) {
    const urls = new Set();
    for (const def of Object.values(spec.slots || {})) {
      for (const part of Object.values(def.parts || {})) {
        for (const rel of Object.values(part.layers || {})) if (rel) urls.add(base() + rel);
      }
    }
    const list = [...urls];
    if (!list.length) throw new Error('heroloom: no part images in character.json');
    await Promise.all(list.map(async (u) => {
      if (images.has(u)) return;
      const img = await loadImageUrl(u, opts.loadImage, timeoutMs, opts.trackImage);
      images.set(u, img);
    }));
  }

  /** Compose the idle frame of every class once so the first visible frame is warm (cheap: one 64×56 cell each). */
  function prewarm() {
    for (const classId of HEROLOOM_CLASSES) {
      try { composeRecipe(heroloomRecipe(heroloomLook({ classId })), { action: 'idle', frame: 0, mirror: false }); } catch (e) { /* non-fatal */ }
    }
  }

  /** Palette tint of a full part image (bakeRecipe / lab export only). */
  function tintImage(url, ramp, variant) {
    const img = images.get(url);
    if (!img) return null;
    const pal = HEROLOOM_PALETTES[ramp];
    if (!pal || !variant) return img;
    const useVariant = spec.palettes && spec.palettes[ramp] && spec.palettes[ramp].variants[variant] ? variant : null;
    if (!useVariant) return img;
    const key = url + '|' + ramp + '|' + useVariant;
    const hit = tintCache.get(key);
    if (hit) { tintCache.delete(key); tintCache.set(key, hit); return hit; }
    const p = spec.palettes[ramp];
    const from = p.base.map(HEX), to = p.variants[useVariant].map(HEX);
    if (from.every((c, i) => c.join() === to[i].join())) return img;
    const cv = makeCanvas(img.width, img.height);
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, cv.width, cv.height), a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      if (!a[i + 3]) continue;
      for (let k = 0; k < from.length; k++) {
        if (a[i] === from[k][0] && a[i + 1] === from[k][1] && a[i + 2] === from[k][2]) {
          a[i] = to[k][0]; a[i + 1] = to[k][1]; a[i + 2] = to[k][2];
          break;
        }
      }
    }
    ctx.putImageData(d, 0, 0);
    tintCache.set(key, cv);
    while (tintCache.size > MAX_TINTS) tintCache.delete(tintCache.keys().next().value);
    return cv;
  }

  /** One 64×56 cell of one part: source pixels tinted with the slot's palette variant. */
  function cellOf(rel, ramp, variant, sx, sy) {
    const url = base() + rel;
    const img = images.get(url);
    if (!img) return null;
    const [cw, ch] = HEROLOOM_CELL;
    if (!variant || !ramp) {
      const c0 = makeCanvas(cw, ch);
      c0.getContext('2d').drawImage(img, sx, sy, cw, ch, 0, 0, cw, ch);
      return c0;
    }
    const pal = spec.palettes && spec.palettes[ramp];
    const variantOk = pal && pal.variants[variant];
    if (!variantOk) {
      const c0 = makeCanvas(cw, ch);
      c0.getContext('2d').drawImage(img, sx, sy, cw, ch, 0, 0, cw, ch);
      return c0;
    }
    const from = pal.base.map(HEX), to = pal.variants[variant].map(HEX);
    if (from.every((c, i) => c.join() === to[i].join())) {
      const c0 = makeCanvas(cw, ch);
      c0.getContext('2d').drawImage(img, sx, sy, cw, ch, 0, 0, cw, ch);
      return c0;
    }
    const key = url + '|' + ramp + '|' + variant + '|' + sx + ',' + sy;
    const hit = cellCache.get(key);
    if (hit) { cellCache.delete(key); cellCache.set(key, hit); return hit; }
    const cv = makeCanvas(cw, ch);
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, sx, sy, cw, ch, 0, 0, cw, ch);
    const d = ctx.getImageData(0, 0, cw, ch), a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      if (!a[i + 3]) continue;
      for (let k = 0; k < from.length; k++) {
        if (a[i] === from[k][0] && a[i + 1] === from[k][1] && a[i + 2] === from[k][2]) {
          a[i] = to[k][0]; a[i + 1] = to[k][1]; a[i + 2] = to[k][2];
          break;
        }
      }
    }
    ctx.putImageData(d, 0, 0);
    cellCache.set(key, cv);
    while (cellCache.size > MAX_CELLS) cellCache.delete(cellCache.keys().next().value);
    return cv;
  }

  /** Compose one heroloom frame from a recipe into a cell canvas (all layers, covered-hair rule). */
  function composeCell(recipe, action, frame) {
    const meta = HEROLOOM_ACTIONS[action];
    if (!meta) return null;
    const [cw, ch] = HEROLOOM_CELL;
    const f = ((frame % meta.frames) + meta.frames) % meta.frames;
    const sx = f * cw, sy = meta.row * ch;
    const chosen = {};
    for (const [slot, def] of Object.entries(spec.slots)) if (def.required) chosen[slot] = Object.keys(def.parts)[0];
    Object.assign(chosen, recipe.parts || {});
    const hat = chosen.hat && spec.slots.hat && spec.slots.hat.parts[chosen.hat];
    const covered = !!(hat && hat.coversHair);
    const out = makeCanvas(cw, ch);
    const ctx = out.getContext('2d');
    for (const { slot, layer } of HEROLOOM_LAYERS) {
      const def = spec.slots[slot], id = chosen[slot];
      const part = def && id && def.parts[id];
      if (!part) continue;
      const rel = part.layers[covered && slot === 'hair' && layer === 'main' ? 'under' : layer];
      if (!rel) continue;
      const colorSlot = part.colorFrom || slot;
      const ramp = spec.slots[colorSlot] && spec.slots[colorSlot].color;
      // heroloomLook()/heroloomRecipe() key colours by RAMP; an explicit lab recipe may key by SLOT. Accept both.
      const variant = (recipe.colors || {})[colorSlot] ?? (ramp ? (recipe.colors || {})[ramp] : undefined);
      const cell = cellOf(rel, ramp, variant, sx, sy);
      if (cell) ctx.drawImage(cell, 0, 0);
    }
    return out;
  }

  /** Cell canvas → alpha-bbox crop + foot anchor in crop pixels. */
  function cropCell(cell, mirror) {
    const [cw, ch] = HEROLOOM_CELL;
    const src = makeCanvas(cw, ch);
    const sctx = src.getContext('2d');
    if (mirror) { sctx.translate(cw, 0); sctx.scale(-1, 1); }
    sctx.drawImage(cell, 0, 0);
    const d = sctx.getImageData(0, 0, cw, ch).data;
    let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        if (d[(y * cw + x) * 4 + 3]) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return null; // empty frame (e.g. a weapon layer's back pass with nothing in it)
    x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1);
    x1 = Math.min(cw - 1, x1 + 1); y1 = Math.min(ch - 1, y1 + 1);
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const cv = makeCanvas(w, h);
    cv.getContext('2d').drawImage(src, x0, y0, w, h, 0, 0, w, h);
    // The pack's foot anchor is [26,51]; a mirrored canvas maps x → 63 − x (same cell width).
    const anchorX = (mirror ? cw - 1 - HEROLOOM_FOOT[0] : HEROLOOM_FOOT[0]) - x0;
    const anchorY = HEROLOOM_FOOT[1] - y0;
    return { cv, footX: anchorX, footY: anchorY };
  }

  /**
   * Compose an arbitrary recipe (lab inspector / tests) — synchronous once the pack is loaded.
   * opts = {action, frame, tick, dir, mirror}
   */
  function composeRecipe(recipe, o = {}) {
    if (!data) return null;
    const action = String(o.action || 'idle');
    const meta = HEROLOOM_ACTIONS[action];
    if (!meta) return null;
    const frame = o.frame != null ? o.frame : heroloomFrameIndex(heroloomAf(action), o.tick || 0);
    const dir = o.dir === 'left' || o.dir === 'sideLeft' ? 'sideLeft' : (o.dir === 'up' || o.dir === 'down' ? o.dir : 'side');
    const mirror = o.mirror != null ? !!o.mirror : (dir === 'sideLeft' || ((dir === 'up' || dir === 'down') && o.sideHint < 0));
    const sig = heroloomRecipeSig(recipe);
    const ck = sig + '|' + action + '|' + frame + '|' + (mirror ? 1 : 0);
    let e = cropCache.get(ck);
    if (e) { hits++; cropCache.delete(ck); cropCache.set(ck, e); }
    else {
      misses++;
      const cell = composeCell(recipe, action, frame);
      if (!cell) return null;
      const crop = cropCell(cell, mirror);
      if (!crop) return null;
      e = Object.assign(crop, { action, slot: frame });
      cropCache.set(ck, e);
      while (cropCache.size > capFn()) cropCache.delete(cropCache.keys().next().value);
    }
    return {
      cv: e.cv,
      footX: e.footX,
      footY: e.footY,
      heroHeight: HEROLOOM_HERO_HEIGHT,
      parts: partsFor(e, o.mirror != null && dir !== 'up' && dir !== 'down' ? (mirror ? 'sideLeft' : 'side') : dir, mirror),
      look: recipe.look || null,
      key: sig + '|' + action + '|' + frame,
      shadow: { cv: e.cv, footX: e.footX, footY: e.footY },
    };
  }

  function resolveKey(action, weaponType) {
    const acts = (data && data.actions) || {};
    const raw = String(action || 'idle');
    const baseName = raw.split('.')[0];
    const tries = [];
    if (weaponType) tries.push(raw + '.' + weaponType);
    tries.push(raw);
    if (baseName !== raw) {
      if (weaponType) tries.push(baseName + '.' + weaponType);
      tries.push(baseName);
    }
    tries.push('idle');
    for (const k of tries) if (acts[k]) return k;
    return 'idle';
  }

  // --- outfit sheets -------------------------------------------------------------------------

  /** Try every registered outfit sheet once (fire-and-forget; failures are recorded, not thrown). */
  function loadOutfits(timeoutMs) {
    if (outfitDisabled || closed) return;
    for (const id of OUTFIT_IDS) loadOutfit(id, timeoutMs);
  }

  /**
   * Load + validate one outfit sheet. `loadImageUrl` is called WITHOUT opts.trackImage: an absent
   * sheet is normal (art is generated separately) and must never mark the game's assets as failed.
   */
  function loadOutfit(id, timeoutMs) {
    if (outfitDisabled || closed) return;
    const key = normalizeOutfitId(id);
    if (!key || outfitSheets.has(key) || outfitRequests.has(key)) return;
    const url = outfitSheetUrl(key);
    if (!url) return;
    outfitRequests.add(key);
    outfitFailures.delete(key);
    Promise.resolve()
      .then(() => loadImageUrl(url, opts.loadImage, timeoutMs || opts.loadTimeoutMs || FALLBACK_TIMEOUT, undefined))
      .then((img) => {
        if (closed) return;
        const width = Number(img.naturalWidth || img.width) || 0;
        const height = Number(img.naturalHeight || img.height) || 0;
        const valid = validateOutfitSheet({ width, height });
        if (!valid.ok) throw new Error('invalid sheet: ' + valid.errors.join('; '));
        let rows = [];
        try { rows = scanOutfitSheet(img).rows || []; } catch (e) { /* alpha scan best-effort: tainted canvas / no getImageData */ }
        // A failed scan (rare) assumes the declared frame table; a transparent frame still makes
        // composeOutfitCell() return null and the caller falls back to layered for that frame.
        const scanned = rows.length > 0;
        const used = {}, usable = {}, playback = {};
        for (const action of OUTFIT_ACTION_NAMES) {
          const row = rows.find((r) => r.action === action);
          const avail = scanned ? (row ? row.used : 0) : OUTFIT_ACTIONS[action].frames;
          used[action] = avail;
          usable[action] = avail > 0;
          playback[action] = outfitPlayback(action, avail);
        }
        const info = {
          id: key, url, ok: true, width, height,
          errors: [], warnings: valid.warnings.slice(),
          rows, used, playback, usable,
          missingRows: OUTFIT_ACTION_NAMES.filter((a) => !usable[a]),
          at: Date.now(),
        };
        outfitSheets.set(key, { id: key, url, img, info, playback, usable });
        outfitFailures.delete(key);
      })
      .catch((e) => {
        if (!outfitSheets.has(key)) outfitFailures.set(key, String((e && e.message) || e || 'outfit sheet unavailable'));
      })
      .finally(() => { outfitRequests.delete(key); });
  }

  /** Decode the 512×448 sheet once and map its alpha coverage back to per-row frame counts. */
  function scanOutfitSheet(img) {
    const cv = makeCanvas(OUTFIT_SHEET.width, OUTFIT_SHEET.height);
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0, OUTFIT_SHEET.width, OUTFIT_SHEET.height);
    const d = ctx.getImageData(0, 0, OUTFIT_SHEET.width, OUTFIT_SHEET.height);
    return outfitSheetFrames(d.data, OUTFIT_SHEET.width, OUTFIT_SHEET.height);
  }

  /** Choose the outfit used by archers; null/off clears it. Unknown ids keep the current choice. */
  function setOutfit(id) {
    if (outfitDisabled) return null;
    if (id == null || isOutfitOffValue(id)) { outfitDefault = null; return null; }
    const key = normalizeOutfitId(id);
    if (!key) return outfitDefault;
    outfitDefault = key;
    if (!outfitSheets.has(key)) {
      outfitFailures.delete(key); // retry: the sheet may have been copied into place since
      loadOutfit(key);
    }
    return key;
  }

  /** Forget loaded sheets and re-validate them (lab 「重新檢查」; the art may have just arrived). */
  function reloadOutfits() {
    if (outfitDisabled || closed) return false;
    for (const id of OUTFIT_IDS) {
      outfitFailures.delete(id);
      outfitSheets.delete(id);
      loadOutfit(id);
    }
    return true;
  }

  function outfitSnapshot() {
    const sheets = {};
    for (const [id, sheet] of outfitSheets) sheets[id] = sheet.info;
    return {
      enabled: !outfitDisabled,
      skipped: outfitDisabled,
      base: outfitBase(),
      active: outfitDefault,
      loaded: [...outfitSheets.keys()],
      pending: [...outfitRequests].filter((id) => !outfitSheets.has(id) && !outfitFailures.has(id)),
      missing: [...outfitFailures.keys()],
      failed: Object.fromEntries(outfitFailures),
      sheets,
      cached: outfitCropCache.size,
      composes: outfitComposes,
      hits: outfitHits,
      misses: outfitMisses,
      fallbacks: outfitFallbacks,
    };
  }

  /**
   * One outfit frame, or null to let compose() fall back to the layered rig (missing sheet,
   * unusable action row, or a fully transparent frame cell).
   */
  function composeOutfitFrame(id, look, action, tick, mirror, dir) {
    outfitComposes++;
    const sheet = outfitSheets.get(id);
    const pb = sheet && sheet.playback[action];
    if (!sheet || !pb || !sheet.usable[action]) { outfitFallbacks++; return null; }
    const frame = outfitFrameIndex(pb.af, tick);
    const ck = id + '|' + action + '|' + frame + '|' + (mirror ? 1 : 0) + '|' + sheet.info.at;
    let e = outfitCropCache.get(ck);
    if (e) { outfitHits++; outfitCropCache.delete(ck); outfitCropCache.set(ck, e); }
    else {
      outfitMisses++;
      const composed = composeOutfitCell(sheet.img, action, frame, {
        makeCanvas, mirror, frames: pb.frames, id, look,
      });
      if (!composed) { outfitFallbacks++; return null; }
      // parts are rebuilt per call (partsFor): the cache key has mirror only, so a cached parts object would carry
      // the direction of whoever filled the entry first (same rule as the layered path).
      composed.action = action;
      composed.slot = frame;
      e = composed;
      outfitCropCache.set(ck, e);
      while (outfitCropCache.size > capFn()) outfitCropCache.delete(outfitCropCache.keys().next().value);
    }
    return {
      cv: e.cv,
      footX: e.footX,
      footY: e.footY,
      heroHeight: OUTFIT_HERO_HEIGHT,
      parts: Object.assign(partsFor(e, dir, mirror), { outfit: id }),
      look: Object.assign({}, look, { outfit: id }),
      key: e.key,
      shadow: { cv: e.cv, footX: e.footX, footY: e.footY },
      outfit: id,
    };
  }

  function compose(h, req = {}) {
    if (!isOn() || !data) return null;
    const t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : 0;
    composeCount++;
    const look = heroloomLook(h);
    const actKey = resolveKey(req.action, look.weaponType);
    const af = data.actions[actKey] && data.actions[actKey].af;
    const tick = req.tick || 0;
    const action = heroloomActionKey(actKey, look.weaponType);
    // The pack only has the side view. Up/down requests (4-quadrant facing, src/dir4.js) are drawn as the side view turned toward
    // req.sideHint (±1 = which way the character leans on screen; pixel-world passes its mirror), so they never face backwards.
    const dir = req.dir === 'left' || req.dir === 'sideLeft' ? 'sideLeft' : (req.dir === 'up' || req.dir === 'down' ? req.dir : 'side');
    const mirror = dir === 'sideLeft' || ((dir === 'up' || dir === 'down') && req.sideHint < 0);
    // Archer outfit sheets replace the layered cell when a validated sheet is loaded. Every other
    // class, and every missing/invalid/unusable sheet path, falls through to the layered compose.
    // (Outfit sheets are side-view only as well, so they take the same dir/mirror as the layered path.)
    const outfitPick = resolveOutfitUse({
      classId: look.classId,
      reqOutfit: Object.prototype.hasOwnProperty.call(req, 'outfit') ? req.outfit : undefined,
      lookOutfit: look.outfit,
      defaultOutfit: outfitDefault,
      loaded: true,
    });
    if (outfitPick.id) {
      const outfitComposed = composeOutfitFrame(outfitPick.id, look, action, tick, mirror, dir);
      if (outfitComposed) {
        if (t0) composeMs += performance.now() - t0;
        return outfitComposed;
      }
    }
    const frame = heroloomFrameIndex(af, tick);
    const recipe = heroloomRecipe(look, { hideWeapon: !!req.hideWeapon });
    const key = heroloomRecipeSig(recipe) + '|' + action + '|' + frame + '|' + (mirror ? 1 : 0);
    const ck = key;
    let e = cropCache.get(ck);
    if (e) { hits++; cropCache.delete(ck); cropCache.set(ck, e); }
    else {
      misses++;
      const cell = composeCell(recipe, action, frame);
      if (!cell) return null;
      const crop = cropCell(cell, mirror);
      if (!crop) return null;
      e = Object.assign(crop, { action, slot: frame });
      cropCache.set(ck, e);
      while (cropCache.size > capFn()) cropCache.delete(cropCache.keys().next().value);
    }
    if (t0) composeMs += performance.now() - t0;
    return {
      cv: e.cv,
      footX: e.footX,
      footY: e.footY,
      heroHeight: HEROLOOM_HERO_HEIGHT,
      parts: partsFor(e, dir, mirror),
      look,
      key,
      shadow: { cv: e.cv, footX: e.footX, footY: e.footY },
    };
  }

  /** Full 512×448 sheet of a recipe (lab export / tests). Async only because tinting 64 cells is not free. */
  async function bakeRecipe(recipe) {
    if (!spec) throw new Error('heroloom: not loaded');
    const t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : 0;
    const cv = makeCanvas(HEROLOOM_COLUMNS * HEROLOOM_CELL[0], HEROLOOM_ROWS * HEROLOOM_CELL[1]);
    const ctx = cv.getContext('2d');
    const chosen = {};
    for (const [slot, def] of Object.entries(spec.slots)) if (def.required) chosen[slot] = Object.keys(def.parts)[0];
    Object.assign(chosen, recipe.parts || {});
    const hat = chosen.hat && spec.slots.hat && spec.slots.hat.parts[chosen.hat];
    const covered = !!(hat && hat.coversHair);
    for (const { slot, layer } of HEROLOOM_LAYERS) {
      const def = spec.slots[slot], id = chosen[slot];
      const part = def && id && def.parts[id];
      if (!part) continue;
      const rel = part.layers[covered && slot === 'hair' && layer === 'main' ? 'under' : layer];
      if (!rel) continue;
      const colorSlot = part.colorFrom || slot;
      const ramp = spec.slots[colorSlot] && spec.slots[colorSlot].color;
      // Same dual lookup as composeCell: ramp keys from heroloomLook, slot keys from an explicit lab recipe.
      const variant = (recipe.colors || {})[colorSlot] ?? (ramp ? (recipe.colors || {})[ramp] : undefined);
      const img = tintImage(base() + rel, ramp, variant);
      if (!img) continue;
      ctx.drawImage(img, 0, 0);
    }
    bakes++;
    if (t0) lastBakeMs = performance.now() - t0;
    return cv;
  }

  function weaponTypeOf(h) {
    return heroloomLook(h).weaponType;
  }

  function covers(classId) {
    if (!isOn() || !data) return false;
    const c = String(classId || '').split('@')[0];
    if (!CLASS_LOOK[c]) return false;
    if (classes.length && !classes.includes(c)) return false;
    return !!(data.skins && data.skins.body && data.skins.body[c]);
  }

  function status() {
    return {
      on: isOn(),
      all: HEROLOOM_CLASSES.length,
      classes: classes.slice(),
      ready: !!data,
      failed,
      failedCount,
      cached: cropCache.size,
      cells: cellCache.size,
      tinted: tintCache.size,
      images: images.size,
      hits, misses, bakes, composeCount,
      composeMs: Math.round(composeMs * 10) / 10,
      lastBakeMs: Math.round(lastBakeMs * 10) / 10,
      base: base(),
      readyAt,
      source: 'heroloom',
      outfit: outfitSnapshot(),
    };
  }

  /** Close the provider (lab teardown / tests). */
  function dispose() {
    closed = true;
    on = false;
    cropCache.clear();
    cellCache.clear();
    tintCache.clear();
    images.clear();
    outfitCropCache.clear();
    outfitSheets.clear();
    outfitFailures.clear();
    outfitRequests.clear();
  }

  return {
    setSpec,
    status,
    covers,
    compose,
    composeRecipe,
    setOutfit,
    reloadOutfits,
    weaponTypeOf,
    resolve: (name, weaponType) => heroloomActionKey(resolveKey(name, weaponType), weaponType),
    look: (h) => heroloomLook(h),
    recipe: (h) => heroloomRecipe(heroloomLook(h)),
    bakeRecipe,
    frame: (action, i) => {
      const meta = HEROLOOM_ACTIONS[action];
      if (!meta) return null;
      const [cw, ch] = HEROLOOM_CELL;
      const n = meta.loop ? ((i % meta.frames) + meta.frames) % meta.frames : Math.max(0, Math.min(meta.frames - 1, i));
      return { x: n * cw, y: meta.row * ch, w: cw, h: ch, ms: meta.ms, index: n };
    },
    counters: () => ({
      bakes, cacheHits: hits, cacheMisses: misses, composeCount, composeMs, lastBakeMs, ready: !!data, failed,
      outfitComposes, outfitHits, outfitMisses, outfitFallbacks, outfitLoaded: outfitSheets.size,
    }),
    dispose,
    get on() { return isOn(); },
    get data() { return data; },
    get outfit() { return outfitDefault; },
  };
}

export {
  HEROLOOM_ACTIONS, HEROLOOM_CELL, HEROLOOM_FOOT, HEROLOOM_COLUMNS, HEROLOOM_ROWS,
  HEROLOOM_TICK_RATE, HEROLOOM_HERO_HEIGHT, HEROLOOM_CLASSES, HEROLOOM_LAYERS, CLASS_LOOK,
};
