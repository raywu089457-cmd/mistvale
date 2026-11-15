// Stock pixelfx class bodies for the Mistvale hero sheets.
//
// The user asked for the ORIGINAL pixelfx character rig look, i.e. the bodies
// in the donor checkout's records/characters/classes/ gallery. Those are produced by
// C:\Users\ray\Desktop\Claude code\pixelfx\tools\lib\classes.mjs -> paint(pose, cls.palette, cls.part, cell):
// the stock rig renders the body (its own ink lines, seams, shell/core shading), then every pixel is recoloured
// by the body PART it came from through a P(shell4, core3) ramp. Nothing is hand-drawn here: no custom garment
// layers, no custom hood, no invented silhouette, no outline post-pass.
//
// This module reproduces that pipeline on our vendored fork of the same rig (same renderer plus pose.scale,
// which Mistvale needs because its cells are 100 px with a 64-90 px body while the donor cell is 24x38). The
// donor's two-stage lookup is kept exactly:
//   material layer -> SHELL/CORE tone marker (stands in for the donor's DUMMY_PAL shell/core colours)
//   paintStock     -> donor part table -> class ramp: shell[tone] / core[tone]
// Only the ramp ARGUMENTS differ per Mistvale class, which is what the donor's own P() helper is for. Each class
// ramp is built from at most three 4-step families plus two darker accents so the whole sheet stays inside the
// 16-colour budget the Mistvale hero audit enforces (the donor's own palettes use ~50).

import { hex } from './core/color.js';

// ---- donor part tables (tools/lib/classes.mjs, verbatim) ------------------------------------------------
export const DONOR_ARCHER_PART = {
  1: 'belt', 2: 'belt', 3: 'tunic', 4: 'skin', 5: 'hood', 6: 'skin',
  7: 'tunic', 9: 'skin', 10: 'skin', 11: 'tunic', 13: 'skin', 14: 'skin',
  15: 'pants', 16: 'pants', 17: 'pants', 18: 'boots', 19: 'pants', 20: 'pants', 21: 'pants', 22: 'boots',
};
export const DONOR_MAGE_PART = {
  1: 'belt', 2: 'belt', 3: 'robe', 4: 'robe', 5: 'hood', 6: 'skin',
  7: 'robe', 9: 'robe', 10: 'skin', 11: 'robe', 13: 'robe', 14: 'skin',
  15: 'robe', 16: 'robe', 17: 'robe', 18: 'boots', 19: 'robe', 20: 'robe', 21: 'robe', 22: 'boots',
};
export const DONOR_WARRIOR_PART = {
  1: 'belt', 2: 'belt', 3: 'tabard', 4: 'plate', 5: 'helm', 6: 'helm',
  7: 'tabard', 9: 'skin', 10: 'skin', 11: 'plate', 13: 'skin', 14: 'skin',
  15: 'pants', 16: 'pants', 17: 'pants', 18: 'boots', 19: 'pants', 20: 'pants', 21: 'pants', 22: 'boots',
};

// ---- stock tone markers ------------------------------------------------------------------------------
// The fork's material layers return the final colour, so the SHELL/CORE identity of the donor palette is carried
// in the colour itself: SHELL[i] = 0x01000000|i, CORE[i] = 0x02000000|i; ink/seam/mark keep the DUMMY_PAL values.
const SHELL_CODE = (i) => (0x01000000 | i) >>> 0;
const CORE_CODE = (i) => (0x02000000 | i) >>> 0;
export const MARK_INK = hex('#0e0c14') >>> 0;
export const MARK_SEAM = hex('#2a2b33') >>> 0;
export const MARK_MARK = hex('#f53cd1') >>> 0;
export const INK_HEX = '#0e0c14';

const shellOf = (c) => ((c >>> 24) === 1 ? c & 255 : -1);
const coreOf = (c) => ((c >>> 24) === 2 ? c & 255 : -1);

/** Material for the stock body: it does not choose a look, it reports which SHELL/CORE step the rig shaded. */
export function stockMaterial() {
  return {
    id: 'stock-class',
    ink: MARK_INK,
    seam: MARK_SEAM,
    mark: MARK_MARK,
    fallback: SHELL_CODE(1),
    layers: [({ tone }) => SHELL_CODE(Math.max(0, Math.min(3, tone | 0)))],
    overlay: null,
  };
}

// The stock WEAPONS are drawn through the rig's own tone ramp; the weapon part sheet keeps the rig's shading and
// ink and maps the ramp to the class's material (the bow/staff stay wood, blades steel). The ramp is deliberately
// dark: the rig's baked blade colours sit on the bright end (#ffffff/#e8edf6), so a pale ramp here would paint every
// blade face near-white and read as a slab (lead 2026-11-12). These steps keep the face mid-grey and leave the
// highlight to the rig's own specular pixels.
export const WEAPON_STEEL = ['#9aa6b8', '#77839a', '#55606f', '#333b47'];
export const WEAPON_WOOD = ['#8a6a44', '#6d5334', '#4a3424', '#2a1e14'];
export const WEAPON_STRING = '#e8dcc0';
export const WEAPON_STEEL_RAMP = WEAPON_STEEL.map((c) => hex(c) >>> 0);
export const WEAPON_WOOD_RAMP = WEAPON_WOOD.map((c) => hex(c) >>> 0);

export function stockWeaponMaterial(cls) {
  const ramp = cls === 'archer' ? WEAPON_WOOD_RAMP : WEAPON_STEEL_RAMP;
  return {
    id: 'stock-weapon',
    ink: MARK_INK,
    seam: MARK_SEAM,
    mark: MARK_MARK,
    fallback: ramp[1],
    layers: [({ part, tone }) => {
      if (part !== 23 && part !== 24) return null;
      return ramp[Math.max(0, Math.min(3, tone | 0))];
    }],
    overlay: null,
  };
}

// The rig draws weapons with its own baked palette (this fork's WEAPONS use the STEEL table). The stock body pass
// keeps the rig's colours and then quantises them to the class ramps, so the weapon part sheet needs its own
// ramp: the donor look has a wooden bow, dark wood with a pale string, and steel for blades.
export const stockWeaponPalette = (cls) => [INK_HEX, ...(cls === 'archer' ? [...WEAPON_WOOD, WEAPON_STRING] : WEAPON_STEEL)];
/** The upgraded ("fine") weapon: the same silhouette one step brighter (trim), never a white face. */
export const stockFinePalette = (cls) => [INK_HEX, ...(cls === 'archer'
  ? ['#c8a878', '#8a6a44', '#6d5334', '#2a1e14', WEAPON_STRING]
  : ['#b9c5d6', '#7b8798', '#55606f', '#333b47'])];

const ramp = (list) => list.map((c) => (hex(c) >>> 0));
/** Donor P() helper: P(shell4, core3). */
export const P = (shell, core) => ({ shell: ramp(shell), core: ramp(core) });
/** Same family for both the lit (shell) and the turned-away (core) side. */
const fam = (list) => P(list, [list[2], list[3], list[3]]);

/** Recolour one stock render exactly like the donor's paint(): by body part, shell/core step.
 *
 * `regions` (optional) are the costume ramps: the alpha-5/alpha-6 tone codes emitted by costume.mjs's geometry
 * pass are resolved through them (region index in byte 1, step in byte 0, ramp tone shift applied). Costume geometry
 * therefore costs no palette entries and is shaded by the same ramp as the garment it belongs to. */
export function paintStock(r, C, partOf, regions) {
  const out = new Uint32Array(r.n);
  for (let i = 0; i < r.n; i++) {
    const c = r.color[i] >>> 0;
    let v;
    const ax = c >>> 24;
    if (ax === 5 || ax === 6) {
      const reg = regions?.[(c >>> 8) & 255];
      if (!reg) v = C.mark;
      else {
        const step = Math.min(ax === 5 ? 3 : 2, c & 255);
        const sh = reg.shift | 0;
        v = ax === 5 ? reg.shell[Math.max(0, Math.min(3, step + sh))]
          : reg.core[Math.max(0, Math.min(2, step + sh))];
      }
    } else if (c === MARK_INK) v = C.ink;
    else if (c === MARK_SEAM) v = C.seam;
    else if (c === MARK_MARK) v = C.mark;
    else {
      const pv = partOf[r.part[i]];
      const region = (pv && C[pv]) || C.plate || C.robe || C.tunic;
      const si = shellOf(c);
      if (si >= 0) v = region.shell[Math.min(3, si)];
      else {
        const ci = coreOf(c);
        v = ci >= 0 ? region.core[Math.min(2, ci)] : C.mark;
      }
    }
    out[i] = v >>> 0;
  }
  return out;
}

// ---- shared families -----------------------------------------------------------------------------------
// Donor colours wherever they fit. Each family is 4 steps; the darker accents are two more colours; a class uses
// at most three families + two accents + ink = 15, so the sheet stays inside the 16-colour audit budget.
const SKIN4 = ['#f0c8a0', '#d8a070', '#b07850', '#7a4e30'];
const GREEN4 = ['#9ab86a', '#6a8a40', '#456028', '#263a14'];
const BROWN4 = ['#c8a074', '#96744e', '#745436', '#523a24'];
// The lead's recipe (2026-11-12): one ramp per body REGION, skin always on the donor's skin ramp, and the head
// region either bare skin or a hood/helm that differs from the torso so the figure never reads as one hue.
const BERSERK_RUST4 = ['#e07448', '#b04c2c', '#7c321c', '#421a0e']; // tabard: deep rust
const GREYBROWN4 = ['#6e6656', '#524a3e', '#38342a', '#1e1c16']; // pants: donor warrior trousers
const BRASS4 = ['#c8a24a', '#9a7430', '#66481c', '#38260e']; // belt: donor warrior brass
const PALADIN_IVORY4 = ['#f2ece0', '#d8d0bc', '#b3a68c', '#7a6f5c']; // tabard
const PALADIN_GOLD4 = ['#e8c46a', '#c8a24a', '#9a7430', '#5a3e10']; // belt: donor gold
const ROBE_VIOLET4 = ['#a894e0', '#7457b8', '#4f3590', '#2e1c55']; // donor mage robe
const HOOD_VIOLET4 = ['#7457b8', '#4f3590', '#2e1c55', '#160c2c']; // hood: one step darker than the robe
const SLATE_HOOD4 = ['#9aa0b8', '#6a7088', '#434a62', '#262b3a']; // assassin hood
const LEATHER4 = ['#5a5f70', '#3e4353', '#2a2e3c', '#171a24']; // assassin tunic: near-black leather
const ASSASSIN_PANTS4 = ['#4a4f60', '#33374a', '#22253a', '#12141f'];
const CRIMSON4 = ['#d4676c', '#b3434a', '#7c2b31', '#4e171c']; // priest stole
const STEEL4 = ['#cfd8e2', '#8e9aa8', '#5a6572', '#333c4a'];
const IVORY4 = ['#f2ece0', '#d9d1c0', '#b5ab97', '#8a8170'];
const SKIN = fam(SKIN4);
const bootsOf = (fam4, dark) => fam([fam4[1], fam4[2], fam4[3], dark]);
const beltOf = (famA, famB) => fam([famA[1], famB[1], famB[2], famB[3]]);

// ---- Mistvale classes ----------------------------------------------------------------------------------
// slot meaning stays the donor's: ink / seam / mark + one P(shell4,core3) ramp per body REGION; partOf decides
// which region a body part takes (tools/lib/classes.mjs). Only the ramp ARGUMENTS differ per Mistvale class.
export const BERSERK_PART = {
  ...DONOR_WARRIOR_PART,
  // bare head (no orange helm): head + face stay on the skin ramp, the chest/hips take the rust tabard
  3: 'tabard', 4: 'tabard', 5: 'skin', 6: 'skin', 7: 'tabard', 11: 'tabard',
};
export const STOCK_CLASSES = {
  archer: { // donor ARCHER as-is: green hood + tunic, tan skin, brown trousers/boots, leather belt
    part: DONOR_ARCHER_PART,
    palette: { ink: hex(INK_HEX) >>> 0, seam: hex(GREEN4[3]) >>> 0, mark: hex('#d84a3a') >>> 0,
      hood: fam(GREEN4), tunic: fam(GREEN4), skin: SKIN, pants: fam(BROWN4),
      boots: bootsOf(BROWN4, '#1e120a'), belt: beltOf(SKIN4, BROWN4) },
  },
  berserker: { // WARRIOR part table, bare skin head, deep-rust tabard, dark legs, brass belt
    part: BERSERK_PART,
    palette: { ink: hex(INK_HEX) >>> 0, seam: hex(BERSERK_RUST4[3]) >>> 0, mark: hex(BERSERK_RUST4[3]) >>> 0,
      tabard: fam(BERSERK_RUST4), plate: fam(BERSERK_RUST4), skin: SKIN,
      pants: fam([GREYBROWN4[0], GREYBROWN4[1], GREYBROWN4[2], BERSERK_RUST4[3]]),
      boots: fam([GREYBROWN4[1], GREYBROWN4[2], GREYBROWN4[3], BERSERK_RUST4[3]]),
      belt: fam([BRASS4[0], BRASS4[1], BERSERK_RUST4[2], BERSERK_RUST4[3]]) },
  },
  paladin: { // WARRIOR stock steel helm/plate + ivory tabard + gold belt: the steel/ivory/gold value contrast
    part: DONOR_WARRIOR_PART,
    palette: { ink: hex(INK_HEX) >>> 0, seam: hex(STEEL4[3]) >>> 0, mark: hex(PALADIN_GOLD4[1]) >>> 0,
      helm: fam(STEEL4), plate: fam(STEEL4), tabard: fam(PALADIN_IVORY4), skin: SKIN,
      pants: fam([STEEL4[1], STEEL4[2], STEEL4[3], PALADIN_IVORY4[3]]),
      boots: fam([STEEL4[2], STEEL4[3], PALADIN_IVORY4[3], PALADIN_IVORY4[3]]),
      belt: fam([PALADIN_GOLD4[1], PALADIN_GOLD4[2], PALADIN_IVORY4[3], PALADIN_IVORY4[3]]) },
  },
  sorcerer: { // MAGE stock: violet robe + a darker violet hood so the head separates, gold belt, dark boots
    part: DONOR_MAGE_PART,
    palette: { ink: hex(INK_HEX) >>> 0, seam: hex(ROBE_VIOLET4[3]) >>> 0, mark: hex('#b06ae0') >>> 0,
      hood: fam(HOOD_VIOLET4), robe: fam(ROBE_VIOLET4), skin: SKIN,
      boots: fam([ROBE_VIOLET4[2], ROBE_VIOLET4[3], '#181222', '#181222']),
      belt: fam([PALADIN_GOLD4[0], PALADIN_GOLD4[1], PALADIN_GOLD4[2], '#38260e']) },
  },
  assassin: { // ARCHER part table, slate hood + near-black leather; the pale blade glint stays on 'mark'
    part: DONOR_ARCHER_PART,
    palette: { ink: hex('#08070c') >>> 0, seam: hex(LEATHER4[3]) >>> 0, mark: hex('#dfe8f0') >>> 0,
      hood: fam([SLATE_HOOD4[0], SLATE_HOOD4[1], SLATE_HOOD4[2], LEATHER4[3]]), tunic: fam(LEATHER4), skin: SKIN,
      pants: fam([ASSASSIN_PANTS4[0], LEATHER4[2], LEATHER4[3], LEATHER4[3]]),
      boots: fam([LEATHER4[2], LEATHER4[3], '#121016', '#121016']),
      belt: beltOf(SLATE_HOOD4, LEATHER4) },
  },
  priest: { // MAGE part table, ivory gown + crimson stole + gold mark, dark brown boots
    part: DONOR_MAGE_PART,
    palette: { ink: hex(INK_HEX) >>> 0, seam: hex(IVORY4[3]) >>> 0, mark: hex('#e8c46a') >>> 0,
      hood: fam(IVORY4), robe: fam(IVORY4), skin: SKIN, boots: bootsOf(IVORY4, '#5c5444'),
      belt: fam([CRIMSON4[0], CRIMSON4[1], CRIMSON4[2], IVORY4[3]]) },
  },
  // The armour variant is the same body on a steel/ivory ramp (the runtime swaps the whole sheet).
  armour: {
    part: null,
    palette: { ink: hex(INK_HEX) >>> 0, seam: hex(STEEL4[3]) >>> 0, mark: hex('#e8c46a') >>> 0,
      helm: fam(STEEL4), plate: fam(STEEL4), tabard: fam(PALADIN_IVORY4), hood: fam(STEEL4), tunic: fam(STEEL4),
      robe: fam(STEEL4), skin: SKIN, pants: fam(STEEL4), boots: bootsOf(STEEL4, '#222833'),
      belt: fam([PALADIN_GOLD4[1], PALADIN_GOLD4[2], PALADIN_GOLD4[3], '#38260e']) },
  },
};

/** Packed rig colour (0xAABBGGRR: R in the low byte) -> '#rrggbb' for meta.palette / groups. */
export function hexOf(v) {
  const c = v >>> 0;
  const r = c & 255, g = (c >>> 8) & 255, b = (c >>> 16) & 255;
  return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
}

/** Every distinct colour a class's ramps can produce (the meta palette; <=16 by construction). */
export function stockPalette(cls) {
  const C = STOCK_CLASSES[cls];
  const out = [];
  const add = (v) => {
    const h = hexOf(v);
    if (!out.includes(h)) out.push(h);
  };
  for (const v of Object.values(C.palette)) {
    if (typeof v === 'number') add(v);
    else { for (const c of v.shell) add(c); for (const c of v.core) add(c); }
  }
  return out;
}

/** The garment families a class's rarity recolour may shift (audit requires a non-empty groups.outfit). */
export function stockOutfit(cls) {
  const C = STOCK_CLASSES[cls].palette;
  const names = ['hood', 'tunic', 'robe', 'plate', 'tabard', 'helm'];
  const out = [];
  for (const n of names) {
    const v = C[n];
    if (!v || typeof v === 'number') continue;
    for (const c of v.shell) {
      const h = hexOf(c);
      if (!out.includes(h)) out.push(h);
    }
  }
  return out.slice(0, 9);
}

// ---- the donor's own carry poses -------------------------------------------------------------------------
// tools/lib/classes.mjs: the weapon is a pose field (weapon + sa), and the fist position (fx/fy/fz) is what the
// gallery sprites use: hand forward and out to the side so the front/back views show the weapon beside the body.
export const STOCK_HOLD = {
  // The donor's gallery carry (sa -1.04) lays the whole limb arc across the thighs and reads as a hoop, so the
  // carry is swung to vertical: sa 0 aims the bow's axis forward, which stands the limbs up at the character's
  // side with the lower tip near the ground. The special rows (attack, skill) keep their own sa from the action
  // pose table, i.e. exactly stock. Weapon names are the rig's own (pfbow / pfstaff / sword / greatsword / dagger).
  archer: { weapon: 'pfbow', sa: 0, wl: 1, fx: 1, fy: -15, fz: 7 },
  berserker: { weapon: 'greatsword', sa: Math.PI / 2, wl: 1, scaleWeapon: 0.78, fx: 2, fy: -18, fz: 6 },
  paladin: { weapon: 'sword', sa: -2.05, wl: 0.55, scaleWeapon: 0.8, fx: 7, fy: -15, fz: 6 },
  sorcerer: { weapon: 'pfstaff', sa: -1.9, fx: -1, fy: -16, wl: 1.05, scaleWeapon: 0.95 },
  assassin: { weapon: 'dagger', sa: -0.75, sb: 2.1, offWeapon: 'dagger', scaleWeapon: 1.05, fx: 7, fy: -17, fz: 5 },
  priest: { weapon: 'pfstaff', sa: -1.2, fx: 5, fy: -16, wl: 1.05, scaleWeapon: 0.95 },
};
