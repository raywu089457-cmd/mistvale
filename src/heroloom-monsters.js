// src/heroloom-monsters.js — HeroLoom-style monster pack (reduced 5-row format).
//
// Pure module: no DOM, no fs, nothing loaded at import time. It is safe for tests (`node
// test-heroloom-monsters.mjs`) and for the browser bundle (src/pixel-world.js imports it so
// MON_SHEET can prefer the pack over assets/monsters3; see docs/HEROLOOM-MONSTERS.md).
//
// Pack layout (art-gen writes it, the Lead places it under assets/heroloom-monsters/):
//   assets/heroloom-monsters/<id>/sheet.png  1280x800 = 8 columns x 5 rows of 160x160 cells
//   assets/heroloom-monsters/<id>/meta.json  {hero, heroHeight, footFromBottom, artSize, actions}
//
// Row order / timing (the reduced HeroLoom monster format):
//   row 0 idle   4 frames @ 0.25 s          row 3 hurt   3 frames @ 0.1 s
//   row 1 walk   8 frames @ 0.125 s (8 fps) row 4 death  5 frames @ 0.14 s
//   row 2 attack 6 frames @ 0.09 s, release 3, impact 4
//
// The meta shape is the same one assets/monsters3 already uses, so the existing pixel-world.js
// MON_SHEET consumer (drawMonsterSheet / monsterSheetPose / monsterAttack) can read it unchanged.
// `loomMonsterMeta()` additionally adds idle/walk/attack Down+Up alias rows for the DIR_ACT
// lookups (same row content, harmless). It deliberately does NOT add <act>Left aliases: the pack
// has no left-facing rows, so a left-facing monster must be the same side-view row mirrored —
// src/dir4.js leftRow() only mirrors when actions[act+'Left'] is absent.

/** Game tick rate the DV2-style af tables expect (same as HEROLOOM_TICK_RATE). */
export const HEROLOOM_MONSTER_TICK_RATE = 20;
/** Square cell size of a monster sheet, px. */
export const HEROLOOM_MONSTER_CELL = 160;
/** Columns in a monster sheet (walk, the longest row, fills all 8). */
export const HEROLOOM_MONSTER_COLUMNS = 8;
/** Rows in a reduced HeroLoom monster sheet: idle/walk/attack/hurt/death. */
export const HEROLOOM_MONSTER_ROWS = 5;
/** Full sheet size implied by cell/columns/rows. */
export const HEROLOOM_MONSTER_SHEET_WIDTH = HEROLOOM_MONSTER_COLUMNS * HEROLOOM_MONSTER_CELL;   // 1280
export const HEROLOOM_MONSTER_SHEET_HEIGHT = HEROLOOM_MONSTER_ROWS * HEROLOOM_MONSTER_CELL;      // 800
/** Art constants every reduced monster meta must carry (heroHeight in art px per 21 game units). */
export const HEROLOOM_MONSTER_META = Object.freeze({ heroHeight: 72, footFromBottom: 12, artSize: 100 });

const ACTION_SPEC = {
  idle: { row: 0, frames: 4, frameTime: 0.25, loop: true },
  walk: { row: 1, frames: 8, frameTime: 0.125, cycle: 85, loop: true },
  attack: { row: 2, frames: 6, frameTime: 0.09, release: 3, impact: 4, loop: false },
  hurt: { row: 3, frames: 3, frameTime: 0.1, loop: false },
  death: { row: 4, frames: 5, frameTime: 0.14, loop: false },
};

/** Canonical action table: y = row * cell, plus frames/frameTime and attack release/impact. */
export const HEROLOOM_MONSTER_ACTIONS = Object.freeze(Object.fromEntries(
  Object.entries(ACTION_SPEC).map(([name, a]) => [name, Object.freeze({
    ...a, cell: HEROLOOM_MONSTER_CELL, y: a.row * HEROLOOM_MONSTER_CELL,
  })]),
));

/** Actions every reduced monster sheet must provide, in row order. */
export const HEROLOOM_MONSTER_ACTION_NAMES = Object.freeze(Object.keys(HEROLOOM_MONSTER_ACTIONS));

/**
 * Reduced-pack monster registry. Ids are the game's monster type ids (src/lore.js REGION_MONSTERS:
 * taiga wolfman/moss, desert mummy), labels taken from MONSTER_NAME so the docs and any future UI
 * use the same Traditional Chinese names the game already shows.
 */
export const LOOM_MONSTERS = Object.freeze({
  wolfman: Object.freeze({ label: '灰毛狼人' }),
  mummy: Object.freeze({ label: '木乃伊' }),
  moss: Object.freeze({ label: '苔蘚巨魔' }),
});

/** Base URL of the monster pack; build.mjs emits media/heroloom-monsters/. */
export function HEROLOOM_MONSTERS_BASE() {
  const a = globalThis.PIXEL_ASSETS;
  return (a && a.heroloomMonstersBase) || 'media/heroloom-monsters/';
}

const joinBase = (base, rel) => String(base || '').replace(/\/+$/, '') + '/' + String(rel || '').replace(/^\/+/, '');

/** URL of a monster sheet for <id> (the meta.json is emitted inline by build.mjs). */
export function monsterSheetUrl(id) {
  return joinBase(HEROLOOM_MONSTERS_BASE(), String(id) + '/sheet.png');
}

/* -------------------------------------------------------------------------------------------- */
/* meta objects                                                                                  */

const metaMemo = new Map();

/** Canonical meta object for <id>, geometry from HEROLOOM_MONSTER_ACTIONS (no pack needed). */
export function canonicalMonsterMeta(id) {
  const hero = String(id == null || id === '' ? 'monster' : id);
  const actions = {};
  for (const name of HEROLOOM_MONSTER_ACTION_NAMES) {
    const spec = HEROLOOM_MONSTER_ACTIONS[name];
    const a = { y: spec.y, cell: spec.cell, frames: spec.frames, frameTime: spec.frameTime };
    if (spec.cycle != null) a.cycle = spec.cycle;
    if (spec.release != null) a.release = spec.release;
    if (spec.impact != null) a.impact = spec.impact;
    actions[name] = a;
  }
  return {
    hero,
    heroHeight: HEROLOOM_MONSTER_META.heroHeight,
    footFromBottom: HEROLOOM_MONSTER_META.footFromBottom,
    artSize: HEROLOOM_MONSTER_META.artSize,
    actions,
  };
}

const packedMonsterMeta = (id) => {
  const A = globalThis.PIXEL_ASSETS;
  const looms = A && A.loomMonsters;
  const v = looms && looms[id];
  if (!v) return null;
  let meta = v.meta !== undefined ? v.meta : v;
  if (typeof meta === 'string') {
    try { meta = JSON.parse(meta); } catch { return null; }
  }
  return meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : null;
};

// Copy a pack action over the canonical one: trust the delivered geometry when it is numeric,
// keep the canonical defaults for anything the pack omitted (frameTime/release/impact/cycle).
const mergeAction = (canonical, packed) => {
  const out = { ...canonical };
  if (packed && typeof packed === 'object') {
    for (const k of ['y', 'cell', 'frames', 'frameTime', 'cycle', 'release', 'impact']) {
      if (packed[k] != null && Number.isFinite(Number(packed[k]))) out[k] = Number(packed[k]);
    }
    for (const [k, v] of Object.entries(packed)) if (!(k in out)) out[k] = v;
  }
  return out;
};

/**
 * Meta object the existing MON_SHEET consumer should use for <id>.
 * Uses PIXEL_ASSETS.loomMonsters[id].meta when build.mjs emitted the pack, otherwise the canonical
 * reduced-format meta (so tests and the pre-build game never see holes). Adds Down/Up aliases for
 * idle/walk/attack so src/dir4.js dirSuffix() never falls back to a missing row. Memoized (same
 * object identity per id); call clearLoomMonsterMetaCache() after changing PIXEL_ASSETS in tests.
 */
export function loomMonsterMeta(id) {
  const key = String(id == null ? '' : id);
  if (metaMemo.has(key)) return metaMemo.get(key);
  const meta = canonicalMonsterMeta(key);
  const packed = packedMonsterMeta(key);
  if (packed) {
    if (typeof packed.hero === 'string' && packed.hero) meta.hero = packed.hero;
    for (const k of ['heroHeight', 'footFromBottom', 'artSize']) {
      if (packed[k] != null && Number.isFinite(Number(packed[k]))) meta[k] = Number(packed[k]);
    }
    const acts = packed.actions;
    if (acts && typeof acts === 'object') {
      for (const name of HEROLOOM_MONSTER_ACTION_NAMES) {
        if (acts[name]) meta.actions[name] = mergeAction(meta.actions[name], acts[name]);
      }
    }
  }
  // Direction aliases: same row data, only so `walkDown`/`attackUp`/`idleDown` exist for DIR_ACT.
  // No `Left` aliases: left facings mirror the side-view row (see header comment).
  for (const dir of ['Down', 'Up']) {
    for (const name of ['idle', 'walk', 'attack']) {
      if (meta.actions[name] && !meta.actions[name + dir]) meta.actions[name + dir] = meta.actions[name];
    }
  }
  metaMemo.set(key, meta);
  return meta;
}

/** Drop the loomMonsterMeta() memo (tests, or after PIXEL_ASSETS is replaced at runtime). */
export function clearLoomMonsterMetaCache() {
  metaMemo.clear();
}

/* -------------------------------------------------------------------------------------------- */
/* animation timing                                                                              */

const ROW_NAMES = HEROLOOM_MONSTER_ACTION_NAMES;
const ACTION_ALIASES = {
  idle: 'idle', stand: 'idle', wait: 'idle', breathe: 'idle', rest: 'idle', sleep: 'idle',
  walk: 'walk', run: 'walk', move: 'walk', step: 'walk', creep: 'walk',
  attack: 'attack', strike: 'attack', swing: 'attack', cast: 'attack', shoot: 'attack',
  thrust: 'attack', skill: 'attack', special: 'attack', lunge: 'attack',
  hurt: 'hurt', hit: 'hurt', pain: 'hurt', flinch: 'hurt', damage: 'hurt', recoil: 'hurt',
  death: 'death', die: 'death', dead: 'death', dying: 'death', slain: 'death', defeated: 'death',
};
const DIR_SUFFIXES = ['downleft', 'downright', 'upleft', 'upright', 'down', 'up', 'left', 'right'];

/**
 * Map a game monster action key (DV2 style, possibly with a Down/Up/Left/Right suffix) onto one of
 * the five rows of the reduced pack. Never returns null: unknown keys fall back to 'idle'.
 * Examples: attackDownLeft -> attack, walkUp -> walk, hurtDown -> hurt, death -> death.
 */
export function monsterActionKey(dv2Key) {
  let k = String(dv2Key == null ? '' : dv2Key).trim().toLowerCase();
  if (!k) return 'idle';
  // 'attack.bow', 'walk cycle' etc. -> the action word is the first token.
  k = k.split(/[.\s]+/)[0];
  const lookup = (s) => (s && (ACTION_ALIASES[s] || (ROW_NAMES.includes(s) ? s : null))) || null;
  let candidate = k;
  for (let guard = 0; guard < 8; guard++) {
    const hit = lookup(candidate) || lookup(candidate.replace(/[_\-\s]+$/, ''));
    if (hit) return hit;
    const cleaned = candidate.replace(/[_\-\s]+$/, '');
    let stripped = null;
    for (const suf of DIR_SUFFIXES) {
      if (cleaned.endsWith(suf) && cleaned.length > suf.length) { stripped = cleaned.slice(0, -suf.length); break; }
    }
    if (!stripped) break;
    candidate = stripped;
  }
  const cleaned = k.replace(/[_\-\s]+$/, '');
  for (const name of ROW_NAMES) if (cleaned.startsWith(name)) return name;
  return 'idle';
}

/**
 * Cumulative end-tick table for one action, at HEROLOOM_MONSTER_TICK_RATE, from the meta frameTime.
 * Same shape as heroloomAf()/DV2 af tables: [5,10,15,20] for idle, [2.5,5,...,20] for walk,
 * [1.8,...,10.8] for attack, [2,4,6] for hurt, [2.8,...,14] for death.
 */
export function monsterAf(id, action) {
  const meta = loomMonsterMeta(id);
  const key = monsterActionKey(action);
  const a = meta.actions[key] || meta.actions.idle;
  const per = (Number(a.frameTime) || 0) * HEROLOOM_MONSTER_TICK_RATE;
  const frames = Math.max(1, Math.floor(Number(a.frames) || 1));
  const out = [];
  for (let i = 0; i < frames; i++) out.push(Math.round((i + 1) * per * 10000) / 10000);
  return out;
}

/** Frame index for a tick, with the same wrap (negative -> from the end) and clamp as heroloomFrameIndex. */
export function monsterFrameIndex(af, tick) {
  if (!af || !af.length) return 0;
  const last = af[af.length - 1];
  if (!(last > 0)) return 0;
  const t = Math.floor(Number(tick) || 0);
  const rem = ((t % last) + last) % last;
  for (let i = 0; i < af.length; i++) if (rem < af[i]) return i;
  return 0;
}

/* -------------------------------------------------------------------------------------------- */
/* validation                                                                                    */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Read a PNG header without any image library. Accepts a Buffer/Uint8Array/ArrayBuffer (>= 26
 * bytes is enough, though a whole file is fine) or a plain {width, height, colorType?} object.
 * Returns {ok, width, height, colorType?, hasTRNS?, alpha?, errors?}. Pure: never touches fs.
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
  const width = ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0;
  const height = ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0;
  if (!(width > 0 && height > 0)) return { ok: false, errors: ['PNG IHDR width/height is zero'] };
  const colorType = bytes[25];
  let hasTRNS = false;
  // Whole-file input: keep scanning chunks so palette/greyscale tRNS still counts as alpha.
  let off = 8;
  while (off + 8 <= bytes.length) {
    const len = ((bytes[off] << 24) | (bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3]) >>> 0;
    const type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]);
    if (type === 'tRNS') hasTRNS = true;
    if (type === 'IEND') break;
    off += 8 + len + 4;
    if (len > bytes.length) break;
  }
  const alpha = colorType === 4 || colorType === 6 || hasTRNS;
  return { ok: true, width, height, colorType, hasTRNS, alpha };
}

const approx = (a, b, tol = 1e-6) => Math.abs(Number(a) - Number(b)) <= tol;

/**
 * Validate one delivered monster meta.json + its sheet.png header.
 * Checks the reduced HeroLoom monster contract: 160x160 cells, 8 columns, 5 rows, y = row * 160,
 * the exact frames/frameTime per row (walk 8 @ 0.125 s, attack release 3 impact 4, ...),
 * heroHeight/footFromBottom/artSize, and a PNG whose IHDR is 1280x800.
 * Returns {ok, errors}; no fs access (callers read the bytes).
 */
export function validateMonsterSheet(meta, pngHeader) {
  const errors = [];
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return { ok: false, errors: ['meta must be a JSON object'] };
  }
  if (typeof meta.hero !== 'string' || !meta.hero.trim()) errors.push('meta.hero must be a non-empty monster id string');
  for (const [k, want] of Object.entries(HEROLOOM_MONSTER_META)) {
    if (meta[k] !== want) errors.push('meta.' + k + ' must be ' + want + ' (got ' + JSON.stringify(meta[k]) + ')');
  }
  const actions = meta.actions;
  if (!actions || typeof actions !== 'object' || Array.isArray(actions)) {
    errors.push('meta.actions must be an object with idle/walk/attack/hurt/death');
  } else {
    for (const name of HEROLOOM_MONSTER_ACTION_NAMES) {
      const spec = HEROLOOM_MONSTER_ACTIONS[name];
      const a = actions[name];
      if (!a || typeof a !== 'object') { errors.push('meta.actions.' + name + ' is missing'); continue; }
      if (a.cell !== spec.cell) errors.push('meta.actions.' + name + '.cell must be ' + spec.cell + ' (got ' + JSON.stringify(a.cell) + ')');
      if (a.y !== spec.y) errors.push('meta.actions.' + name + '.y must be row*cell = ' + spec.y + ' (got ' + JSON.stringify(a.y) + ')');
      if (a.frames !== spec.frames) errors.push('meta.actions.' + name + '.frames must be ' + spec.frames + ' (got ' + JSON.stringify(a.frames) + ')');
      if (!(Number.isFinite(Number(a.frameTime)) && approx(a.frameTime, spec.frameTime))) {
        errors.push('meta.actions.' + name + '.frameTime must be ' + spec.frameTime + ' (got ' + JSON.stringify(a.frameTime) + ')');
      }
      if (spec.cycle != null && a.cycle !== spec.cycle) errors.push('meta.actions.' + name + '.cycle must be ' + spec.cycle + ' (got ' + JSON.stringify(a.cycle) + ')');
      if (spec.release != null && a.release !== spec.release) errors.push('meta.actions.' + name + '.release must be ' + spec.release + ' (got ' + JSON.stringify(a.release) + ')');
      if (spec.impact != null && a.impact !== spec.impact) errors.push('meta.actions.' + name + '.impact must be ' + spec.impact + ' (got ' + JSON.stringify(a.impact) + ')');
    }
  }
  const png = pngHeaderInfo(pngHeader);
  if (!png.ok) for (const e of png.errors) errors.push('sheet.png: ' + e);
  else {
    if (png.width !== HEROLOOM_MONSTER_SHEET_WIDTH) errors.push('sheet.png width must be ' + HEROLOOM_MONSTER_SHEET_WIDTH + ' (got ' + png.width + ')');
    if (png.height !== HEROLOOM_MONSTER_SHEET_HEIGHT) errors.push('sheet.png height must be ' + HEROLOOM_MONSTER_SHEET_HEIGHT + ' (got ' + png.height + ')');
  }
  return { ok: errors.length === 0, errors };
}
