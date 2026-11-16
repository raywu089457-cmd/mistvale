// HeroLoom → Mistvale hero paper-doll mapping (pure, no DOM).
//
// The heroloom-free 1.0.0 pack (assets/heroloom/, LICENSE.txt) is a side-view layered character
// kit: one 512×448 sheet per recipe, 8 actions × 8 columns, cell 64×56, foot anchor [26,51],
// faces right. The game's hero renderer (src/pixel-world.js drawDollHero) speaks the DV2 paper-doll
// protocol: data.actions[key].af (cumulative ticks), tickRate 20, resolveAction/actionTiming helpers
// in src/paperdoll.js. This module bridges the two:
//
//   * look/recipe mapping: hunter (classId + equipment booleans) → {parts, colors}
//   * a DV2-compatible `data` facade whose only purpose is to drive the existing timing helpers:
//     af tables are the heroloom frame times expressed in 50 ms ticks, timings are chosen so attack /
//     skill release + impact land on the game's hit windows
//   * heroloom action names, frame math, and the engine constants
//
// The browser half (bake/tint/compose) lives in src/heroloom-hero.js and imports from here.
import { EQUIPMENT, EQUIP_SLOTS } from './pixel-data.js';

/** Heelroom sheet geometry (verbatim from character.json). */
export const HEROLOOM_CELL = Object.freeze([64, 56]);
export const HEROLOOM_COLUMNS = 8;
export const HEROLOOM_ROWS = 8;
export const HEROLOOM_FOOT = Object.freeze([26, 51]);
/** Rendered figure height in sheet pixels (top of helmet/hair to foot), measured from parts/*.png. */
export const HEROLOOM_HERO_HEIGHT = 30;
/** Game tick rate the DV2 helpers expect; the af tables below are expressed in these ticks. */
export const HEROLOOM_TICK_RATE = 20;

/** 8 animation rows of the pack: row, frames, ms per frame, loop. */
export const HEROLOOM_ACTIONS = Object.freeze({
  idle: { row: 0, frames: 4, ms: 200, loop: true },
  walk: { row: 1, frames: 6, ms: 90, loop: true },
  attack: { row: 2, frames: 6, ms: 70, loop: false },
  hurt: { row: 3, frames: 3, ms: 100, loop: false },
  jump: { row: 4, frames: 5, ms: 90, loop: false },
  cast: { row: 5, frames: 5, ms: 110, loop: false },
  thrust: { row: 6, frames: 5, ms: 70, loop: false },
  shoot: { row: 7, frames: 5, ms: 100, loop: false },
});
export const HEROLOOM_ACTION_NAMES = Object.freeze(Object.keys(HEROLOOM_ACTIONS));

/** Draw order (bottom → top) of the 22 layers, verbatim from character.json `layers`. */
export const HEROLOOM_LAYERS = Object.freeze([
  { slot: 'back', layer: 'main' },
  { slot: 'cape', layer: 'main' },
  { slot: 'hair', layer: 'back' },
  { slot: 'hat', layer: 'back' },
  { slot: 'body', layer: 'back' },
  { slot: 'top', layer: 'back' },
  { slot: 'shield', layer: 'main' },
  { slot: 'body', layer: 'main' },
  { slot: 'bottom', layer: 'main' },
  { slot: 'shoes', layer: 'main' },
  { slot: 'top', layer: 'main' },
  { slot: 'weapon', layer: 'back' },
  { slot: 'body', layer: 'head' },
  { slot: 'face', layer: 'main' },
  { slot: 'acc', layer: 'main' },
  { slot: 'hair', layer: 'main' },
  { slot: 'hat', layer: 'main' },
  { slot: 'acc', layer: 'front' },
  { slot: 'weapon', layer: 'main' },
  { slot: 'body', layer: 'front' },
  { slot: 'top', layer: 'front' },
  { slot: 'cape', layer: 'front' },
]);

/**
 * Slot facets (copy of character.json, kept in code so the lab/tests do not need an XHR).
 * color = palette ramp the slot follows, parts = part ids available, variants = palette variants.
 * test-heroloom.mjs compares this table against character.json and fails on drift.
 */
export const HEROLOOM_SLOTS = Object.freeze({
  back: { color: 'cloth', parts: { backpack: ['main'] } },
  cape: { color: 'cloth', parts: { cape: ['main'] } },
  hair: {
    color: 'hair',
    parts: {
      short: ['main', 'under'],
      spiky: ['main', 'under'],
      ponytail: ['main', 'back', 'under'],
      long: ['main', 'back', 'under'],
    },
  },
  hat: {
    color: 'cloth',
    parts: { wizard: ['main'], helmet: ['main', 'back'], band: ['main', 'back'] },
    coversHair: { wizard: true, helmet: true },
  },
  body: { color: 'skin', required: true, parts: { base: ['main', 'back', 'front', 'head'] } },
  top: { color: 'cloth', parts: { tunic: ['main', 'back', 'front'], robe: ['main', 'back', 'front'], armor: ['main', 'back', 'front'] } },
  shield: { color: 'cloth', parts: { buckler: ['main'] } },
  bottom: { color: 'cloth', parts: { pants: ['main'], skirt: ['main'] } },
  shoes: { color: 'leather', parts: { boots: ['main'], sandals: ['main'] } },
  weapon: { color: null, parts: { sword: ['main', 'back'], staff: ['main', 'back'], dagger: ['main', 'back'], bow: ['main', 'back'] } },
  face: { color: 'eye', required: true, parts: { eyes: ['main'] } },
  acc: { color: 'cloth', parts: { glasses: ['main'], beard: ['main'] }, colorFrom: { beard: 'hair' } },
});

export const HEROLOOM_PALETTES = Object.freeze({
  skin: { base: ['#5a282b', '#7a3a34', '#b86a4c', '#e2a87c', '#f2cfa4', '#fcecd0'], variants: ['light', 'tan', 'dark', 'moss'] },
  hair: { base: ['#311925', '#40222e', '#6a4040', '#946a52', '#bc9670', '#e0c8a0'], variants: ['brown', 'black', 'blonde', 'red', 'blue', 'pink', 'silver'] },
  cloth: { base: ['#1b244c', '#222e5c', '#34507c', '#5478a0', '#88aac4', '#c8dfe4'], variants: ['blue', 'red', 'green', 'purple', 'black', 'white', 'yellow'] },
  leather: { base: ['#2e1318', '#3e1a1c', '#643422', '#8c5430', '#b88248', '#e0b874'], variants: ['brown', 'black', 'white'] },
  eye: { base: ['#1a0f1e', '#3a1470', '#5c2cb0', '#8c5ce8', '#c4a8ff', '#ffffff'], variants: ['violet', 'red', 'green', 'blue', 'brown'] },
});

/** Base URL of the pack (build.mjs copies assets/heroloom → media/heroloom and sets PIXEL_ASSETS.heroloomBase). */
export function HEROLOOM_BASE() {
  const a = typeof globalThis !== 'undefined' ? globalThis.PIXEL_ASSETS : null;
  return (a && a.heroloomBase) || 'media/heroloom/';
}

// Game classes first (src/pixel-data.js CLASSES: berserker, paladin, sorcerer, archer, assassin, priest, traveler),
// then the two pack-only silhouettes (darkknight, warrior) so the lab and gear variants still have looks.
export const HEROLOOM_CLASSES = Object.freeze(['archer', 'sorcerer', 'priest', 'paladin', 'berserker', 'assassin', 'traveler', 'darkknight', 'warrior']);

/** Per-class look presets: parts per slot + palette variant per ramp. */
export const CLASS_LOOK = Object.freeze({
  archer: {
    parts: { hair: 'short', top: 'tunic', bottom: 'pants', shoes: 'boots', cape: 'cape', weapon: 'bow' },
    colors: { skin: 'light', hair: 'brown', cloth: 'green', leather: 'brown', eye: 'brown' },
  },
  sorcerer: {
    parts: { hair: 'long', hat: 'wizard', top: 'robe', shoes: 'boots', cape: 'cape', weapon: 'staff' },
    colors: { skin: 'light', hair: 'silver', cloth: 'purple', leather: 'brown', eye: 'violet' },
  },
  priest: {
    parts: { hair: 'long', hat: 'band', top: 'robe', shoes: 'boots', cape: 'cape', weapon: 'staff' },
    colors: { skin: 'light', hair: 'blonde', cloth: 'white', leather: 'white', eye: 'blue' },
  },
  paladin: {
    parts: { hair: 'short', hat: 'helmet', top: 'armor', bottom: 'pants', shoes: 'boots', shield: 'buckler', cape: 'cape', weapon: 'sword' },
    colors: { skin: 'light', hair: 'blonde', cloth: 'blue', leather: 'white', eye: 'blue' },
  },
  berserker: {
    parts: { hair: 'spiky', top: 'tunic', bottom: 'pants', shoes: 'boots', weapon: 'sword' },
    colors: { skin: 'tan', hair: 'red', cloth: 'yellow', leather: 'brown', eye: 'red' },
  },
  assassin: {
    parts: { hair: 'ponytail', hat: 'band', top: 'tunic', bottom: 'pants', shoes: 'sandals', cape: 'cape', weapon: 'dagger' },
    colors: { skin: 'tan', hair: 'black', cloth: 'black', leather: 'black', eye: 'green' },
  },
  traveler: {
    // 旅人: unarmed brawler — no weapon slot at all (game kit weapon is null).
    parts: { hair: 'short', top: 'tunic', bottom: 'pants', shoes: 'boots' },
    colors: { skin: 'tan', hair: 'brown', cloth: 'yellow', leather: 'brown', eye: 'brown' },
  },
  darkknight: {
    parts: { hair: 'short', hat: 'helmet', top: 'armor', bottom: 'pants', shoes: 'boots', shield: 'buckler', cape: 'cape', weapon: 'sword' },
    colors: { skin: 'dark', hair: 'black', cloth: 'black', leather: 'black', eye: 'red' },
  },
  warrior: {
    parts: { hair: 'short', hat: 'helmet', top: 'armor', bottom: 'pants', shoes: 'boots', weapon: 'sword' },
    colors: { skin: 'light', hair: 'brown', cloth: 'blue', leather: 'brown', eye: 'brown' },
  },
});

/** weaponKind (hunter data) → heroloom weapon part / game weaponType. Unknown kinds keep the class kit. */
const WEAPON_KIND = {
  bow: { part: 'bow', type: 'bow' },
  gun: { part: 'bow', type: 'bow' },
  staff: { part: 'staff', type: 'staff' },
  holystaff: { part: 'staff', type: 'holystaff' },
  wand: { part: 'staff', type: 'staff' },
  dagger: { part: 'dagger', type: 'dagger' },
  rapier: { part: 'dagger', type: 'dagger' },
  axe: { part: 'sword', type: 'axe' },
  sword: { part: 'sword', type: 'sword' },
  spear: { part: 'sword', type: 'sword' },
};

/** Class kit: weapon type drives which heroloom action plays for strike / skill (same idea as DV2 CLASS_KIT). */
const CLASS_WEAPON = Object.freeze({
  archer: 'bow',
  sorcerer: 'staff',
  priest: 'holystaff',
  paladin: 'sword',
  berserker: 'axe',
  assassin: 'dagger',
  traveler: null, // 赤手空拳: DV2 CLASS_KIT has no weapon for the traveler either
  darkknight: 'sword',
  warrior: 'sword',
});

const WEAPON_PART_FOR = { bow: 'bow', staff: 'staff', holystaff: 'staff', sword: 'sword', axe: 'sword', dagger: 'dagger' };

const eqOf = (h) => (h && h.equipment) || {};

/** Normalize a hunter class id to one of HEROLOOM_CLASSES. */
export function heroloomClass(h, fallback) {
  const raw = String((h && h.classId) || '').split('@')[0];
  return CLASS_LOOK[raw] ? raw : (CLASS_LOOK[fallback] ? fallback : 'warrior');
}

/**
 * hunter → heroloom look: {classId, gender, weaponType, parts:{slot:id}, colors:{ramp:variant}}.
 * 2026-11-15 裝備物品化:h.gear 存在時,帽子/上衣/褲子/鞋/披風/盾/武器全部由穿在身上的物品 look 決定
 * (脫下上衣就真的看不到上衣)。沒有 h.gear 的物件(舊資料、lab 的假 hunter)仍走舊的 equipment 布林值規則。
 */
export function heroloomLook(h) {
  const classId = heroloomClass(h, 'warrior');
  const preset = CLASS_LOOK[classId];
  const eq = eqOf(h);
  const kit = CLASS_WEAPON[classId] ?? null;
  const kind = h && h.weaponKind && WEAPON_KIND[h.weaponKind];
  const weaponType = (kind && kind.type) || kit;
  const parts = { ...preset.parts };
  const colors = { ...preset.colors };
  const weaponPart = (kind && kind.part) || (weaponType && WEAPON_PART_FOR[weaponType]) || null;
  const gear = h && h.gear;
  if (gear) {
    // 裝備外觀:頭髮/膚色/眼睛保留職業基底;身上穿什麼就畫什麼。
    const layered = { hat: null, top: null, bottom: null, shoes: null, cape: null, shield: null };
    let weaponLook = null;
    for (const slot of EQUIP_SLOTS) {
      const inst = gear[slot], item = inst && EQUIPMENT[inst.itemId];
      if (!item || !item.look) continue;
      const look = item.look;
      if (look.hat) layered.hat = look.hat;
      if (look.top) layered.top = look.top;
      if (look.bottom) layered.bottom = look.bottom;
      if (look.shoes) layered.shoes = look.shoes;
      if (look.cape) layered.cape = look.cape;
      if (look.shield) layered.shield = look.shield;
      if (slot === 'weapon') weaponLook = look.weapon;
    }
    for (const key of ['hat', 'top', 'bottom', 'shoes', 'cape', 'shield']) { if (layered[key]) parts[key] = layered[key]; else delete parts[key]; }
    if (weaponLook === 'none' || (!weaponLook && !weaponPart)) delete parts.weapon;
    else if (weaponLook) parts.weapon = weaponLook;
    else parts.weapon = weaponPart;
  } else {
    // 舊版規則(沒有物品資料時):職業預設 + equipment 布林值。
    if (weaponPart) parts.weapon = weaponPart;
    else delete parts.weapon;
    // A fine weapon (DV2 equipment.weapon === true) keeps the heroloom weapon but adds its class cape, a cheap visual cue.
    if (eq.weapon === true && !parts.cape && preset.parts.cape) parts.cape = preset.parts.cape;
    if (eq.helm) parts.hat = 'helmet';
    if (eq.shield) parts.shield = 'buckler';
    const armoured = !!(eq.armor || eq.chest || eq.belt || eq.legs || eq.gloves || eq.boots);
    if (armoured) {
      parts.top = 'armor';
      parts.bottom = 'pants';
      parts.shoes = 'boots';
    }
    if (eq.cape) parts.cape = 'cape';
  }
  // Gender: the pack's long/ponytail hair reads as the female silhouette (head art is shared, like DV2 G6).
  if (h && h.gender === 'f') {
    if (parts.hair === 'short' || parts.hair === 'spiky') parts.hair = 'long';
    else if (parts.hair === 'ponytail') parts.hair = 'ponytail';
  }
  return { classId, gender: h && h.gender === 'f' ? 'f' : 'm', weaponType, parts, colors };
}

/** look → bake recipe {parts, colors}. hideWeapon drops the weapon slot (game hides weapons in some poses). */
export function heroloomRecipe(look, opts = {}) {
  const parts = { ...look.parts };
  if (opts.hideWeapon) delete parts.weapon;
  return { parts, colors: { ...look.colors } };
}

/** Stable cache key of a look (or recipe) — order-independent. */
export function heroloomRecipeSig(lookOrRecipe) {
  const p = lookOrRecipe.parts || {};
  const c = lookOrRecipe.colors || {};
  const pk = Object.keys(p).sort().map((k) => k + '=' + p[k]).join(',');
  const ck = Object.keys(c).sort().map((k) => k + '=' + c[k]).join(',');
  return pk + '|' + ck;
}

/** Frame times of one heroloom action in DV2 ticks (50 ms): af[i] = end tick of frame i. */
export function heroloomAf(name) {
  const a = HEROLOOM_ACTIONS[name];
  if (!a) return [];
  const per = (a.ms * HEROLOOM_TICK_RATE) / 1000;
  const out = [];
  for (let i = 0; i < a.frames; i++) out.push(Math.round((i + 1) * per * 10000) / 10000);
  return out;
}

/** Cumulative ends → frame index at a tick (looping wraps, one-shot clamps; same rule as src/paperdoll.js getSlot). */
export function heroloomFrameIndex(af, tick) {
  if (!af || !af.length) return 0;
  const last = af[af.length - 1];
  if (!(last > 0)) return 0;
  const t = Math.floor(Number(tick) || 0);
  const rem = ((t % last) + last) % last;
  for (let i = 0; i < af.length; i++) if (rem < af[i]) return i;
  return 0;
}

/** Which heroloom row plays for a DV2 action key (already resolved: 'attack.bow', 'skill', 'hurt', …). */
export function heroloomActionKey(dv2Key, weaponType) {
  const base = String(dv2Key || 'idle').split('.')[0];
  const suffix = String(dv2Key || '').split('.')[1] || weaponType || '';
  switch (base) {
    case 'idle':
    case 'walk':
    case 'hurt':
      return base;
    case 'victory':
    case 'jump_victory':
      return 'jump';
    case 'death':
    case 'hurt_dead':
      return 'hurt';
    case 'attack':
      if (suffix === 'bow') return 'shoot';
      if (suffix === 'dagger') return 'thrust';
      return 'attack';
    case 'skill':
      if (suffix === 'bow') return 'shoot';
      if (suffix === 'dagger') return 'thrust';
      if (suffix === 'staff' || suffix === 'holystaff' || suffix === 'wand') return 'cast';
      return 'attack';
    default:
      return 'idle';
  }
}

/** One-shot DV2 action keys the facade publishes, with the row they play and their release/impact slots. */
function buildFacadeActions() {
  const mk = (name, extra) => ({ af: heroloomAf(name), ...(extra || {}) });
  const attack = mk('attack', { releaseSlot: 1, impactSlot: 2 });
  const shoot = mk('shoot', { releaseSlot: 2, impactSlot: 2 });
  const thrust = mk('thrust', { releaseSlot: 2, impactSlot: 2 });
  const cast = mk('cast', { releaseSlot: 2, impactSlot: 2 });
  const actions = {
    idle: mk('idle', { loop: true }),
    walk: mk('walk', { loop: true }),
    hurt: mk('hurt'),
    // weapon variants: resolveAction tries `<name>.<weaponType>` first, so every class finds its row
    attack: { ...attack },
    'attack.sword': { ...attack },
    'attack.axe': { ...attack },
    'attack.holystaff': { ...attack },
    'attack.staff': { ...attack },
    'attack.bow': { ...shoot },
    'attack.dagger': { ...thrust },
    skill: { ...cast },
    'skill.staff': { ...cast },
    'skill.holystaff': { ...cast },
    'skill.sword': { ...attack },
    'skill.axe': { ...attack },
    'skill.bow': { ...shoot },
    'skill.dagger': { ...thrust },
    victory: mk('jump', { loop: true }),
  };
  return actions;
}

let facade = null;

/**
 * DV2-compatible data facade used by src/pixel-world.js drawDollHero + the timing helpers in
 * src/paperdoll.js / src/paperdoll-hero.js. No death / ride_* / give keys on purpose: the game then
 * takes its documented derived paths (death = last hurt frame + lie rotation, riding = walk/stand, etc.).
 */
export function heroloomData() {
  if (facade) return facade;
  const heroHeights = {};
  for (const c of HEROLOOM_CLASSES) heroHeights[c] = HEROLOOM_HERO_HEIGHT;
  const skins = {};
  for (const c of HEROLOOM_CLASSES) skins[c] = {};
  facade = {
    tickRate: HEROLOOM_TICK_RATE,
    meta: {
      heroHeight: HEROLOOM_HERO_HEIGHT,
      heroHeights,
      cell: HEROLOOM_CELL[0],
      dirs: ['up', 'right', 'down', 'left'],
      classes: HEROLOOM_CLASSES.slice(),
      source: 'heroloom',
    },
    skins: { body: skins },
    actions: buildFacadeActions(),
  };
  return facade;
}
