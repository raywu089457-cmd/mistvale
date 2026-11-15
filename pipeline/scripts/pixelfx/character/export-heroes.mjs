#!/usr/bin/env node
// ---------------------------------------------------------------------------------------------------------------
// export-heroes.mjs -render a Mistvale hero class from the pixelfx character rig into the game's sheet format.
//
//   node pipeline/scripts/pixelfx/character/export-heroes.mjs --class archer [--gear archer] [--out assets/heroes]
//                                                             [--parts] [--debug] [--old <legacy.png>]
//
// Output (default --out assets/heroes):
//   <class>.png   8 columns x 28 rows of 100 px cells, transparent, <=16 colours, 1 px ink outline
//   <class>.json  meta { hero, heroHeight, footFromBottom: 8, cell: 100, palette, groups, actions, source }
//   (--parts)     <class>-weapon / <class>-weapon-fine / <class>-armor sheets with the identical row table,
//                 cell size, y offsets, frame counts and head anchors, all anchored at offset [0, 0]
//
// Contract (docs/PIXELFX-PRESENTATION.md): cell 100, footFromBottom 8 (the ground line is row 92), columns 8,
// heroHeight is the rendered standing height (idle frame 0), rows in the runtime's actRow() names, hurt 4,
// death 8, victory 8, walk 8/attack 8 with the pixelfx act timing (release/impact + per-strike-frame strikeDur).
// The rig draws a 1 px ink ring and 3-tone material ramps already; this exporter adds the Mistvale post-pass:
// quantise every pixel to the class palette (<=16 colours, no semi-transparency), drop lone specks, and re-ink
// any silhouette pixel that ended up lighter than the ink line, so the sheet passes audit_hero_sheet.py.
// ---------------------------------------------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { STAND, posed, posedParts, setMaterial, setGearPass, skeleton } from './core/rig.js';
import { BARE_BODY_PLAIN, eyeLayer } from './barebody.js';
import { encodePNG, readPNG } from './png-io.mjs';
import { rasterText } from './core/font.js';
import * as idle4 from './idle-4dir.js';
import * as walk4 from './walk-4dir.js';
import { STOCK_CLASSES, STOCK_HOLD, stockMaterial, stockWeaponMaterial, stockPalette, paintStock, stockWeaponPalette, stockFinePalette, stockOutfit } from './stockbody.mjs';
import { COSTUMES, armourPalette, armourPaletteObj, armourRegions, costumePalette, costumeOutfit } from './costume.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');

// ---- arguments -----------------------------------------------------------------------------------------------
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}
const ARGS = parseArgs(process.argv.slice(2));
const CLASS = String(ARGS.class ?? 'archer');
const GEAR = String(ARGS.gear ?? CLASS);
const OUT = path.resolve(ROOT, String(ARGS.out ?? 'assets/heroes'));
const DEBUG = !!ARGS.debug || !!ARGS.verbose;
const PARTS = !!ARGS.parts;
const WANT_SCALE = Number(ARGS.scale ?? 1.9);
const WANT_WEAPON_SCALE = Number(ARGS.weaponScale ?? 1.05);
const OLD_SHEET = ARGS.old ? path.resolve(ROOT, String(ARGS.old)) : null;
const QUIET = !!ARGS.quiet;
// --split: the paperdoll layout (body sheet without the weapon, the weapon as its own part sheet, a
// weapon-fine variant and a full-body armour variant). This is the shipping contract for the game.
const SPLIT = !!ARGS.split || !!ARGS.paperdoll;
// STOCK body: the user asked for pixelfx's own class rig look, i.e. the donor toolchain's paint() bodies
// (tools/lib/classes.mjs) instead of our hand-authored gear layers. --fork restores the older look.
// COSTUME designs (2026-11-13): the RENDERING stays the donor's (part->region->ramp + ink), but the outfits are
// our own per-class designs (fur mantle, great helm, pointed hat, hood+quiver, face mask, stole). --donor forces
// the plain donor outfits so the comparison montage can prove the difference.
const COSTUME = !ARGS.donor && !ARGS.fork ? COSTUMES[CLASS] : null;
const STOCK = !ARGS.fork && (!!COSTUME || !!STOCK_CLASSES[CLASS]);
const CLS_DEF = COSTUME
  ? { part: COSTUME.part, palette: COSTUME.palette, regions: COSTUME.regions, draw: COSTUME.draw }
  : (STOCK_CLASSES[CLASS] ? { part: STOCK_CLASSES[CLASS].part, palette: STOCK_CLASSES[CLASS].palette, regions: null, draw: null } : null);
let PASS_MODE = 'body'; // 'body' | 'part' | 'armor'

// ---- the game cell -------------------------------------------------------------------------------------------
const CELL = 100;
// 9 columns: the shipped contract (assets/heroes/archer.png) is 900 px wide because its attack rows carry 9
// frames. Rows with fewer frames leave the trailing cells empty.
const COLS = 9;
const FOOT_FROM_BOTTOM = 8;
const GROUND = CELL - FOOT_FROM_BOTTOM;      // row 92 = the ground line (audit: lowest opaque row)
const CX = CELL / 2;                          // body centre column

// The 28 rows the shipped archer.json declares, in that exact order (y = index * 100).
const ROWS = [
  'idle', 'idleDown', 'idleUp', 'walk', 'walkDown', 'walkUp', 'walkDownRight', 'walkUpRight',
  'hurt', 'victory', 'death', 'attack', 'skill',
  'attackDownRight', 'attackDown', 'attackUpRight', 'attackUp', 'attackDownLeft', 'attackUpLeft', 'attackLeft',
  'idleLeft', 'walkLeft', 'idleDownRight', 'idleUpRight', 'idleDownLeft', 'idleUpLeft',
  'walkDownLeft', 'walkUpLeft',
];
// Rows generated by mirroring another row's cells (guarantees the audit's per-pixel mirror equality).
const MIRRORED_FROM = {
  idleLeft: 'idle', walkLeft: 'walk',
  idleDownLeft: 'idleDownRight', idleUpLeft: 'idleUpRight',
  walkDownLeft: 'walkDownRight', walkUpLeft: 'walkUpRight',
  attackLeft: 'attack', attackDownLeft: 'attackDownRight', attackUpLeft: 'attackUpRight',
};

// ---- class palette -------------------------------------------------------------------------------------------
// A class keeps one 16-colour sheet palette (the audit's whole-sheet budget). The gear module owns it when it
// exports one (gear/<class>.js `palette`); otherwise fall back to the archer's, which is the reference look.
const ARCHER_PALETTE = [
  '#241c1e', '#e8b98f', '#c98d63', '#8f5c3c', '#5a3a2a', '#6b4634', '#5fc0b8', '#3fa7a0',
  '#2b7874', '#96603c', '#6e462c', '#4f3120', '#3e2a1f', '#2a1c16', '#4a3428', '#d8d2c0',
];
// The gear modules carry their own ramps but do not export them as a palette, so each class declares its
// 16-colour sheet palette here, assembled from that module's own colours (gear/<class>.js PAL.base) and
// keeping the same slot roles as the archer: 0 ink, 1-3 skin, 4-5 hair/head, 6-8 garment A, 9-11 garment B,
// 12-13 darkest, 14 metal/wood, 15 light. Without this every class quantised to the ARCHER palette, so the
// paladin read cyan and the sorcerer read brown (the lead's bug report).
const BERSERKER_PALETTE = [
  '#241c1e', '#f6c894', '#e4b78d', '#c88f5f', '#7d4526', '#5c2f1a', '#f0a07c', '#d77a58',
  '#a34e34', '#8a6a44', '#66502f', '#473722', '#6e5f45', '#3b261a', '#6b7480', '#cfc7b4',
];
const PALADIN_PALETTE = [
  '#241c1e', '#f6c894', '#e4b78d', '#c88f5f', '#cfd8e2', '#8e9aa8', '#f0c66a', '#daaf48',
  '#a8802c', '#f2ece0', '#d9d1c0', '#b5ab97', '#6b7585', '#3a4453', '#6b4a2e', '#e8eef5',
];
const SORCERER_PALETTE = [
  '#241c1e', '#f6c894', '#e4b78d', '#c88f5f', '#e6cdf4', '#a678c4', '#7d529e', '#57356f',
  '#3a2452', '#9d74bd', '#5a3a78', '#b06ae0', '#4a3b56', '#40344a', '#9aa4b8', '#dfe4ee',
];
const ASSASSIN_PALETTE = [
  '#241c1e', '#f6c894', '#e4b78d', '#c88f5f', '#6c6488', '#544e6a', '#3d3852', '#a294c8',
  '#7a6a9c', '#554a72', '#4a4458', '#35303f', '#2c2936', '#18151d', '#6b7a8c', '#dfe8f0',
];
const PRIEST_PALETTE = [
  '#241c1e', '#f6c894', '#e4b78d', '#c88f5f', '#f7f3e8', '#e2dbc9', '#c0b8a3', '#fdfbf3',
  '#e9e2d1', '#c9c1ac', '#d2565c', '#b3434a', '#8a2f36', '#f2c75c', '#d09a2a', '#8a6526',
];
const PALETTE_BY_CLASS = {
  archer: ARCHER_PALETTE,
  berserker: BERSERKER_PALETTE,
  paladin: PALADIN_PALETTE,
  sorcerer: SORCERER_PALETTE,
  assassin: ASSASSIN_PALETTE,
  priest: PRIEST_PALETTE,
};
// groups.outfit = the garment hues the rarity recolour shifts (must be non-empty for the audit).
const OUTFIT_BY_CLASS = {
  archer: ['#5fc0b8', '#3fa7a0', '#2b7874', '#96603c', '#6e462c', '#4f3120'],
  berserker: ['#f0a07c', '#d77a58', '#a34e34', '#8a6a44', '#66502f', '#473722'],
  paladin: ['#f0c66a', '#daaf48', '#a8802c', '#f2ece0', '#d9d1c0', '#b5ab97'],
  sorcerer: ['#e6cdf4', '#a678c4', '#7d529e', '#57356f', '#3a2452', '#9d74bd'],
  assassin: ['#6c6488', '#544e6a', '#3d3852', '#a294c8', '#7a6a9c', '#554a72'],
  priest: ['#fdfbf3', '#e9e2d1', '#c9c1ac', '#d2565c', '#b3434a', '#8a2f36'],
};

// ---- armour re-skin ------------------------------------------------------------------------------------------
// `<class>-armor` is a full body re-render (the runtime swaps the whole sheet when equipment.armor is set), so
// it needs its own 16-colour palette and a source-colour map: cloth/leather tones become steel, skin, hair,
// trousers, boots and the bow wood stay recognisable. Steel ramp per the project notes: #3a4453 / #6b7a8c /
// #b9c6d4 with #232a36 outline, brass trim for the buckle.
const ARMOUR_PALETTE = [
  '#241c1e', '#e8b98f', '#c98d63', '#8f5c3c', '#5a3a2a', '#6b4634', '#b9c6d4', '#6b7a8c',
  '#3a4453', '#232a36', '#8a97a8', '#4f3120', '#3e2a1f', '#2a1c16', '#b8862a', '#e8eef5',
];
// source hex (the class palette) -> armour hex
const ARMOUR_RESKIN = {
  '#5fc0b8': '#b9c6d4', '#3fa7a0': '#6b7a8c', '#2b7874': '#3a4453', // cloak/hood cloth -> plate
  '#96603c': '#8a97a8', '#6e462c': '#6b7a8c', '#4f3120': '#3a4453', // tunic -> cuirass
  '#4a3428': '#3a4453',                                            // bow wood stays in the weapon part, but armour is baked
  '#d8d2c0': '#e8eef5',                                            // string / buckle -> bright steel
};
const packedMap = (src, map) => {
  const out = new Map();
  for (const [from, to] of Object.entries(map)) {
    const a = hexToRgb(from), b = hexToRgb(to);
    out.set(((0xff << 24) | (a[2] << 16) | (a[1] << 8) | a[0]) >>> 0, ((0xff << 24) | (b[2] << 16) | (b[1] << 8) | b[0]) >>> 0);
  }
  return out;
};

const hexToRgb = (h) => {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};
const rgbToHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

// ---- pose assembly -------------------------------------------------------------------------------------------
// core/rig.js multiplies every bone length and body radius by pose.scale, but the hand/foot targets and `crouch`
// are read as absolute local pixels, so they have to be multiplied by the same factor here (see docs note).
const POSE_COORDS = ['fx', 'fy', 'fz', 'bx', 'by', 'bz', 'ffx', 'ffy', 'fbx', 'fby', 'crouch', 'wz',
  'handDropN', 'handDropF', 'handDyN', 'handDyF', 'foreTrimN', 'foreTrimF', 'y'];

let GEAR_MOD = null;      // the class's gear module (layers + gear pass)
let MATERIAL = null;      // the material used for the dressed body
let SC = WANT_SCALE;      // tuned so idle frame 0 is exactly 72 px tall
let WSC = WANT_WEAPON_SCALE;
let POSE_EXTRA = {};      // per-pass pose flags (e.g. {hideWeapon:true} for the paperdoll body sheet)
let RECOLOUR_EXTRA = null; // per-pass packed-colour override map (the armour re-skin)

/** pose(extras): STAND + the gear module's weapon pose + extras, then all pixel-space fields - SC. */
function pose(extras = {}) {
  // Stock mode: the donor's own class hold (weapon + sa, and the fist position for the rest rows) is the pose
  // the gallery sprites use; the body pass never carries a weapon, the weapon part pass always does.
  const hold = STOCK ? STOCK_HOLD[CLASS] : null;
  // Turned rows (idleDown/idleUp) keep the 4-dir rig's own arm targets, otherwise the donor carry fist would be
  // copied into a front/back view and the bow would hang behind the torso there.
  const turned = Math.abs(extras.yaw ?? 0) > 1e-6;
  const stockExtra = hold
    ? {
      ...(hold.weapon ? { weapon: PASS_MODE === 'part' ? hold.weapon : undefined } : {}),
      ...(hold.offWeapon ? { offWeapon: PASS_MODE === 'part' ? hold.offWeapon : undefined } : {}),
      ...(hold.sb !== undefined ? { sb: hold.sb } : {}),
      ...(hold.sa !== undefined ? { sa: hold.sa } : {}),
      ...(hold.wl !== undefined ? { wl: hold.wl } : {}),
      ...(hold.scaleWeapon !== undefined ? { scaleWeapon: hold.scaleWeapon } : {}),
      ...(PASS_MODE === 'part' || turned ? {} : { fx: hold.fx, fy: hold.fy, fz: hold.fz }),
    }
    : {};
  const src = { ...STAND, ...stockExtra, ...(STOCK ? {} : (GEAR_MOD?.pose ?? {})), ...POSE_EXTRA, ...extras };
  const out = { ...src };
  for (const k of POSE_COORDS) if (typeof out[k] === 'number') out[k] *= SC;
  out.scale = SC;
  out.scaleWeapon = src.scaleWeapon ?? WSC;
  return out;
}

// The rig's own side-view idle (idle-4dir.js's right pose) is the rest pose; the breathing frames only move the
// torso, the feet stay planted on the ground line.
const IDLE_BREATH = [-0.2, -0.5, -0.75, -0.8, -0.6, -0.25, 0.05, 0.15];

// One shared rig means the six classes would otherwise idle in exactly the same pose - and the audit's
// silhouette rule (idle frame 0 vs the other classes, IoU < .8 at 32 px) plus the player's eye both need a
// different outline per class. Each stance moves the hands and/or widens the legs: weapon hand raised
// (sorcerer), shield arm across the chest (paladin), wide low guard (berserker), tucked crouch (assassin),
// hands together (priest), bow hand forward (archer). Local rig px at scale 1 (pose() scales by SC).
const STANCE = {
  archer: {}, // art already accepted by the Lead, do not restage
  berserker: {
    // the greatsword hangs point-down beside the leg: sa = PI/2 with wl = 1 makes the blade axis world-
    // vertical (so it stays vertical in every yaw and never sweeps a slab across the chest), the hand sits
    // at hip/chest height so the tip clears the floor, and scaleWeapon 0.78 keeps the steel from outshining
    // the body (the lead's "carrying a surfboard" note).
    fx: 2, fy: -18, bx: 8, by: -14, ffx: 7.5, fbx: -7.5, crouch: 1.4,
    sa: Math.PI / 2, wl: 1, scaleWeapon: 0.78,
  },
  paladin: { fx: 3, fy: -19, bx: 8, by: -12, ffx: 5, fbx: -5 },
  sorcerer: { fx: 4, fy: -23, bx: 8, by: -15, ffx: 3, fbx: -3 },
  assassin: { fx: -5, fy: -11, bx: -2, by: -12, crouch: 2.4, lean: 3, ffx: 5, fbx: -5 },
  priest: { fx: 2, fy: -18, bx: 6, by: -18, ffx: 2, fbx: -2 },
};
const STANCE0 = () => STANCE[CLASS] ?? {};
function breath(i, base) {
  const b = IDLE_BREATH[i % IDLE_BREATH.length];
  return { ...base, crouch: (base.crouch ?? 0) + b, fy: (base.fy ?? STAND.fy) + b * 0.75, by: (base.by ?? STAND.by) + b * 0.6 };
}

// The archer's bow-shot: the near hand pushes the bow forward, the far hand draws the string (pose.pull), the
// strike frames snap the string back and commit the body forward. release=5 / impact=6 -frames 0-4 windup,
// 5-6-7 strike (see sheetPose in src/pixel-world.js). The bow itself is drawn by gear/archer.js's drawGear.
const ATT_EXTRA = { turn: 0.3, fz: 4.5, bz: 3.2, ffx: 4.5, ffy: -4, fbx: -5, fby: -4 };
const ATTACK = [
  { lean: -0.5, crouch: 0.2, fx: 7.5, fy: -16, bx: 0.5, by: -14, pull: true, nocked: true },
  { lean: -1.0, crouch: 0.5, fx: 8.5, fy: -16.5, bx: -1.5, by: -14.5, pull: true, nocked: true },
  { lean: -1.6, crouch: 0.8, fx: 9.5, fy: -17, bx: -3.5, by: -15, pull: true, nocked: true },
  { lean: -2.2, crouch: 1.0, fx: 10.5, fy: -17.5, bx: -5.5, by: -15.5, pull: true, nocked: true },
  { lean: -2.4, crouch: 1.0, fx: 10.5, fy: -17.5, bx: -6.0, by: -15.6, pull: true, nocked: true },
  { lean: 0.5, crouch: 0.6, fx: 11.0, fy: -16.5, bx: -9.0, by: -12.5, pull: false, nocked: false },
  { lean: 2.0, crouch: 0.5, fx: 11.0, fy: -15.5, bx: -10.0, by: -11.0, pull: false, nocked: false },
  { lean: 0.6, crouch: 0.3, fx: 9.0, fy: -15.5, bx: -2.0, by: -13.0, pull: false, nocked: false },
  // 9th frame: the recovery hold, so the row matches the shipped contract's 9 attack frames
  { lean: 0.3, crouch: 0.15, fx: 7.0, fy: -15.0, bx: 3.0, by: -13.5, pull: false, nocked: false },
];
const SKILL = [
  { lean: -1.0, crouch: 0.2, fx: 6.0, fy: -18, bx: 1.0, by: -15.0, pull: true, nocked: true },
  { lean: -2.0, crouch: 0.4, fx: 6.5, fy: -20, bx: 0.0, by: -15.5, pull: true, nocked: true },
  { lean: -3.0, crouch: 0.7, fx: 7.0, fy: -22, bx: -1.0, by: -16.0, pull: true, nocked: true },
  { lean: -3.6, crouch: 0.9, fx: 7.0, fy: -23, bx: -1.5, by: -16.5, pull: true, nocked: true },
  { lean: -0.5, crouch: 0.6, fx: 7.5, fy: -20, bx: -5.0, by: -14.0, pull: false, nocked: false },
  { lean: 1.5, crouch: 0.4, fx: 8.0, fy: -18, bx: -7.0, by: -12.0, pull: false, nocked: false },
  { lean: 1.0, crouch: 0.3, fx: 7.0, fy: -16, bx: -3.0, by: -13.0, pull: false, nocked: false },
  { lean: 0.2, crouch: 0.2, fx: 6.0, fy: -16, bx: 0.5, by: -14.0, pull: false, nocked: false },
  { lean: 0.1, crouch: 0.15, fx: 5.0, fy: -15.5, bx: 2.0, by: -14.0, pull: false, nocked: false },
];
const VICTORY = [
  { lean: -2.0, crouch: 0.2, fx: 8, fy: -23, bx: 6, by: -21, sa: Math.PI },
  { lean: -2.4, crouch: 0.0, fx: 8.5, fy: -25, bx: 6, by: -22, sa: Math.PI },
  { lean: -2.2, crouch: -0.3, fx: 8, fy: -26, bx: 6, by: -22, sa: Math.PI },
  { lean: -2.0, crouch: 0.1, fx: 8, fy: -24, bx: 6.5, by: -21, sa: Math.PI },
  { lean: -2.4, crouch: 0.0, fx: 8.5, fy: -25.5, bx: 6, by: -22, sa: Math.PI },
  { lean: -2.2, crouch: -0.3, fx: 8, fy: -26.5, bx: 6, by: -22, sa: Math.PI },
  { lean: -2.0, crouch: 0.1, fx: 8, fy: -24, bx: 6.5, by: -21, sa: Math.PI },
  { lean: -1.6, crouch: 0.3, fx: 7.5, fy: -23, bx: 6, by: -20, sa: Math.PI },
];
const HURT = [
  { lean: 0.5, crouch: 0.3, fx: 0, fy: -15, bx: 3, by: -14 },
  { lean: -3.0, crouch: 1.0, fx: -4, fy: -13, bx: 0, by: -13, turn: 0.1 },
  { lean: -5.0, crouch: 1.6, fx: -6, fy: -12, bx: -1, by: -12, turn: 0.05 },
  { lean: -2.0, crouch: 0.9, fx: -2, fy: -14, bx: 2, by: -13, turn: 0.15 },
];
// The fall: pose.fall tips the whole figure about its feet in the picture plane (core/rig.js fallAll), and each
// death cell is re-centred horizontally because a 72 px body lying down is wider than the cell's half-width.
const DEATH_FALL = [0.05, 0.22, 0.45, 0.72, 1.0, 1.2, 1.34, 1.42];
const DEATH = DEATH_FALL.map((fall, i) => ({
  fall, lean: -1 - i * 0.2, crouch: 0.3 + i * 0.5,
  fx: -2 - i * 1.5, fy: -15 + i * 1.0, bx: 3 + i * 1.2, by: -14 + i * 1.0,
  turn: 0.2,
}));

// Direction yaws (about the vertical through the feet, radians; the rig draws the yawed body itself).
const YAW = { side: 0, downRight: Math.PI / 4, down: Math.PI / 2, upRight: -Math.PI / 4, up: -Math.PI / 2 };

// Every row: poses (unscaled extras), frame time, and any act-timing fields.
function buildActions() {
  const A = {};
  const add = (name, poses, extra = {}) => { A[name] = { poses, ...extra }; };

  const ST0 = STANCE[CLASS] ?? {};

  // In the front/back views the rest-frame `fz` (hand depth) IS the screen x, so holding the bow hand out to the
  // side is a bigger fz: the bow arc then clears the body silhouette instead of crossing the chest.
  const bowHand = STOCK ? (p) => p : (p) => ({ ...p, fz: (p.fz ?? 6.5) + 3.4, fy: (p.fy ?? -14) - 0.6 });

  // idle: 8 breathing frames, feet planted. idleDown / idleUp are the rig's turned rest poses (the body yaws,
  // the head keeps looking around); the diagonal idles are single rest frames (the runtime only needs one).
  add('idle', Array.from({ length: 8 }, (_, i) => breath(i, { ...idle4.right, ...ST0 })), { frameTime: 0.16 });
  add('idleDown', Array.from({ length: 8 }, (_, i) => breath(i, bowHand({ ...idle4.down, ...ST0 }))), { frameTime: 0.16 });
  add('idleUp', Array.from({ length: 8 }, (_, i) => breath(i, bowHand({ ...idle4.up, ...ST0 }))), { frameTime: 0.16 });

  // walk: the stock 8-frame side walk; down/up are walk-4dir's turned poses, diagonals are those poses at -45-.
  // the class weapon hold that must survive the walk cycle (angle/depth/scale only: the gait still swings the
  // arms); the berserker's greatsword would otherwise sweep its broad face across the torso on every step.
  const WHOLD = CLASS === 'berserker' ? { sa: Math.PI / 2, wl: 1, scaleWeapon: 0.78 } : {};
  const walkP = (dir) => walk4.posesOf(dir).map((p) => ({ ...p, ...WHOLD }));
  add('walk', walkP('right'), { frameTime: 0.125, cycle: 44 });
  add('walkDown', walkP('down').map(bowHand), { frameTime: 0.125, cycle: 44 });
  add('walkUp', walkP('up').map(bowHand), { frameTime: 0.125, cycle: 44 });
  add('walkDownRight', walkP('down').map((p) => ({ ...p, yaw: YAW.downRight })), { frameTime: 0.125, cycle: 44 });
  add('walkUpRight', walkP('up').map((p) => ({ ...p, yaw: YAW.upRight })), { frameTime: 0.125, cycle: 44 });

  add('hurt', HURT, { frameTime: 0.1 });
  add('victory', VICTORY, { frameTime: 0.16 });
  add('death', DEATH, { frameTime: 0.12 });

  // The bow shot, authored side-on and then yawed for the eight attack directions. Attack rows are baked in the
  // runtime (it never mirrors them), so all of Down/Up/Diagonal rows are real yawed renders; the Left rows are
  // the mirrored Right rows (see MIRRORED_FROM) -a baked left-side view is exactly the mirror of the right one.
  add('attack', ATTACK.map((p) => ({ ...ATT_EXTRA, ...p })), { frameTime: 0.075, release: 5, impact: 6, strikeDur: [0.075, 0.05, 0.08, 0.07], windupFrameTime: 0.09 });
  add('skill', SKILL.map((p) => ({ ...ATT_EXTRA, ...p })), { frameTime: 0.075, release: 4, impact: 5, strikeDur: [0.07, 0.06, 0.06, 0.06, 0.07], windupFrameTime: 0.09 });
  const att = (yaw) => ATTACK.map((p) => ({ ...ATT_EXTRA, ...p, yaw }));
  add('attackDownRight', att(YAW.downRight), { frameTime: 0.075, release: 5, impact: 6, strikeDur: [0.075, 0.05, 0.08, 0.07], windupFrameTime: 0.09 });
  add('attackDown', att(YAW.down), { frameTime: 0.075, release: 5, impact: 6, strikeDur: [0.075, 0.05, 0.08, 0.07], windupFrameTime: 0.09 });
  add('attackUpRight', att(YAW.upRight), { frameTime: 0.075, release: 5, impact: 6, strikeDur: [0.075, 0.05, 0.08, 0.07], windupFrameTime: 0.09 });
  add('attackUp', att(YAW.up), { frameTime: 0.075, release: 5, impact: 6, strikeDur: [0.075, 0.05, 0.08, 0.07], windupFrameTime: 0.09 });

  add('idleDownRight', [{ ...idle4.down, yaw: YAW.downRight }], { frameTime: 0.16 });
  add('idleUpRight', [{ ...idle4.up, yaw: YAW.upRight }], { frameTime: 0.16 });

  return A;
}

// ---- render one cell -----------------------------------------------------------------------------------------
function packRgb(c) { return [c & 255, (c >>> 8) & 255, (c >>> 16) & 255]; }

/** Debug aid: which rig part owns each pixel of the cell (PXFX_DUMP_BOX). */
function dumpParts(p, dx, dy) {
  const box = (process.env.PXFX_DUMP_BOX ?? '24,8,76,96').split(',').map(Number);
  const [x0, y0, x1, y1] = box;
  const parts = posedParts({ ...p });
  const key = new Map();
  parts.forEach((part, i) => key.set(part.name, CHARS_PART[i % CHARS_PART.length]));
  const grid = new Map();
  for (const part of parts) {
    for (let i = 0; i < part.n; i++) grid.set((dy + part.ys[i]) * CELL + dx + part.xs[i], key.get(part.name));
  }
  const lines = [];
  for (let y = y0; y <= y1; y++) {
    let s = String(y).padStart(3) + ' ';
    for (let x = x0; x <= x1; x++) s += grid.get(y * CELL + x) ?? '.';
    lines.push(s);
  }
  console.log('--- parts ---');
  console.log(lines.join('\n'));
  console.log('parts: ' + [...key].map(([n, c]) => `${c}=${n}`).join(' '));
  // head-local debug: (sy - hy) in rig px for every head/face pixel, so an overlay region can be aimed
  const rel = new Map();
  let hy = null, hx = null;
  for (const part of parts) {
    for (let i = 0; i < part.n; i++) if (part.px?.[i] !== undefined) { /* noop */ }
  }
  for (const part of parts) {
    if (part.name !== 'head' && part.name !== 'face') continue;
    for (let i = 0; i < part.n; i++) {
      const px = part.pxDesc?.[i] ?? part.px?.[i];
      if (!px) continue;
      hy = px.hy; hx = px.hx;
      rel.set((dy + part.ys[i]) * CELL + dx + part.xs[i], Math.round(px.sy - px.hy));
    }
  }
  if (!rel.size) { console.log('(no per-pixel px descriptors on parts; skip rel grid)'); return; }
  const rl = [];
  for (let y = y0; y <= y1; y++) {
    let s = String(y).padStart(3) + ' ';
    for (let x = x0; x <= x1; x++) {
      const v = rel.get(y * CELL + x);
      s += v === undefined ? '.' : v < 0 ? '-' : String(v);
    }
    rl.push(s);
  }
  console.log(`--- sy - hy (hy=${hy} hx=${hx}) ---`);
  console.log(rl.join('\n'));
}
const CHARS_PART = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function dumpCell(cell, label, showColours) {
  const box = (process.env.PXFX_DUMP_BOX ?? '24,8,76,96').split(',').map(Number);
  const [x0, y0, x1, y1] = box;
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  const legend = new Map();
  const cellChar = (o) => {
    if (!cell[o + 3]) return '.';
    const rgb = [cell[o], cell[o + 1], cell[o + 2]];
    if (!showColours) {
      const i = QUANT.pal.findIndex((p) => p[0] === rgb[0] && p[1] === rgb[1] && p[2] === rgb[2]);
      return i < 0 ? '?' : chars[i];
    }
    const key = rgb.join(',');
    if (!legend.has(key)) legend.set(key, chars[legend.size]);
    return legend.get(key);
  };
  const lines = [];
  for (let y = y0; y <= y1; y++) {
    let s = String(y).padStart(3) + ' ';
    for (let x = x0; x <= x1; x++) s += cellChar((y * CELL + x) * 4);
    lines.push(s);
  }
  console.log(`--- ${label} ---`);
  console.log(lines.join('\n'));
  if (legend.size) {
    const out = [];
    for (const [key, ch] of legend) {
      const [r, g, b] = key.split(',').map(Number);
      out.push(`${ch}=#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`);
    }
    console.log('colours: ' + out.join(' '));
  }
}

/** Render one frame into a 100x100 cell: quantise to the class palette and clean it up. */
function renderCell(p, opts = {}) {
  const r = posed(p);
  const cell = new Uint8ClampedArray(CELL * CELL * 4);
  const dx = opts.origin ? opts.origin.dx : opts.center ? CX - Math.round((r.x0 + r.x1) / 2) : CX;
  const dy = opts.origin ? opts.origin.dy : GROUND - r.y1;
  const recolour = GEAR_MOD?.recolour;
  // Stock mode: recolour by body part exactly like the donor's paint() - the rig's own shading and ink lines are
  // kept, only the class ramp differs. No quantiser and no ink pass: the stock renderer already draws both.
  const stockCols = STOCK && PASS_MODE !== 'part'
    ? paintStock(r, stockClass().palette, stockClass().part, stockClass().regions ?? null)
    : null;
  for (let i = 0; i < r.n; i++) {
    const x = dx + r.xs[i], y = dy + r.ys[i];
    if (x < 0 || x >= CELL || y < 0 || y >= CELL) continue;
    const c0 = stockCols ? stockCols[i] : r.color[i];
    const c1 = RECOLOUR_EXTRA?.get(c0) ?? c0;
    const c = recolour && !stockCols ? (recolour.get(c1) ?? c1) : c1;
    const o = (y * CELL + x) * 4;
    const rgb = packRgb(c);
    cell[o] = rgb[0]; cell[o + 1] = rgb[1]; cell[o + 2] = rgb[2]; cell[o + 3] = (c >>> 24) & 255 || 255;
  }
  const dump = process.env.PXFX_DUMP && (!opts.tag || process.env.PXFX_DUMP === opts.tag) ? opts.tag : null;
  if (dump) {
    dumpCell(cell, `${dump} raw`, true);
    dumpParts(p, dx, dy);
  }
  if (!stockCols) {
    quantise(cell);
    if (dump) dumpCell(cell, `${dump} quantised`, false);
    dropSpecks(cell);
    inkRim(cell);
  }  if (dump) dumpCell(cell, `${dump} final`, false);
  // head anchor: the rig's head joint in the same local space, mirrored to cell space
  let head = [CX + 0.5, GROUND - 40];
  try {
    const j = skeleton(p).joints.head;
    head = [dx + j[0] + 0.5, dy - j[1] + 0.5];
  } catch { /* keep the fallback anchor */ }
  return { cell, head, dx, dy };
}

// nearest-colour cache for the post-pass
function makeQuantiser(paletteHex) {
  const pal = paletteHex.map(hexToRgb);
  const cache = new Map();
  const nearest = (r, g, b) => {
    const key = (r << 16) | (g << 8) | b;
    let best = cache.get(key);
    if (best !== undefined) return best;
    let bi = 0, bd = Infinity;
    for (let i = 0; i < pal.length; i++) {
      const p = pal[i];
      const dr = r - p[0], dg = g - p[1], db = b - p[2];
      // perceptual-ish weights: the eye is far more sensitive to green, and dark blues read as near-black
      const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
      if (d < bd) { bd = d; bi = i; }
    }
    cache.set(key, bi);
    return bi;
  };
  return { pal, nearest };
}
let QUANT = null;

function quantise(cell) {
  for (let o = 0; o < cell.length; o += 4) {
    if (!cell[o + 3]) continue;
    const i = QUANT.nearest(cell[o], cell[o + 1], cell[o + 2]);
    const p = QUANT.pal[i];
    cell[o] = p[0]; cell[o + 1] = p[1]; cell[o + 2] = p[2]; cell[o + 3] = 255;
  }
}

/** Drop 8-connected components of exactly one opaque pixel (audit: <=1 % isolated pixels, and they read as noise). */
function dropSpecks(cell) {
  const solid = (x, y) => x >= 0 && y >= 0 && x < CELL && y < CELL && cell[(y * CELL + x) * 4 + 3] > 0;
  const lone = [];
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
    if (!solid(x, y)) continue;
    let n = 0;
    for (let dy = -1; dy <= 1 && n < 2; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      if (solid(x + dx, y + dy)) { n++; break; }
    }
    if (!n) lone.push(y * CELL + x);
  }
  for (const i of lone) cell[i * 4 + 3] = 0;
}

const LUM = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
/** RO look: every silhouette pixel is the dark ink line (the rig already draws it, this only closes gaps). */
function inkRim(cell) {
  const ink = QUANT.pal[0];
  const at = (x, y) => (x < 0 || y < 0 || x >= CELL || y >= CELL ? null : (y * CELL + x) * 4);
  const edge = [];
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
    const o = (y * CELL + x) * 4;
    if (!cell[o + 3]) continue;
    let out = false;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const q = at(x + dx, y + dy);
      if (q === null || !cell[q + 3]) { out = true; break; }
    }
    if (out) edge.push(o);
  }
  for (const o of edge) {
    if (LUM(cell.subarray(o, o + 3)) >= 92) { cell[o] = ink[0]; cell[o + 1] = ink[1]; cell[o + 2] = ink[2]; }
  }
}

// ---- mirroring (Left rows) -----------------------------------------------------------------------------------
function mirrorCell({ cell, head }) {
  const out = new Uint8ClampedArray(cell.length);
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
    const s = (y * CELL + (CELL - 1 - x)) * 4, d = (y * CELL + x) * 4;
    out[d] = cell[s]; out[d + 1] = cell[s + 1]; out[d + 2] = cell[s + 2]; out[d + 3] = cell[s + 3];
  }
  return { cell: out, head: [CELL - head[0], head[1]] };
}

// ---- canvas helpers (PNG montages; same shape as export-actor.mjs but dependency-free) ----------------------
class Canvas {
  constructor(w, h, bg = [14, 12, 18, 255]) {
    this.w = w; this.h = h; this.data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) this.data.set(bg, i * 4);
  }
  rect(x, y, w, h, rgb = [36, 32, 44]) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      if (xx < 0 || yy < 0 || xx >= this.w || yy >= this.h) continue;
      const o = (yy * this.w + xx) * 4; this.data[o] = rgb[0]; this.data[o + 1] = rgb[1]; this.data[o + 2] = rgb[2]; this.data[o + 3] = 255;
    }
  }
  /** paste an RGBA cell (100x100) scaled by k, nearest neighbour, alpha as binary */
  blit(rgba, sw, sh, dx, dy, k = 1) {
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const s = (y * sw + x) * 4;
      if (!rgba[s + 3]) continue;
      for (let yy = 0; yy < k; yy++) for (let xx = 0; xx < k; xx++) {
        const X = dx + x * k + xx, Y = dy + y * k + yy;
        if (X < 0 || Y < 0 || X >= this.w || Y >= this.h) continue;
        const o = (Y * this.w + X) * 4;
        this.data[o] = rgba[s]; this.data[o + 1] = rgba[s + 1]; this.data[o + 2] = rgba[s + 2]; this.data[o + 3] = 255;
      }
    }
  }
  label(txt, x, y, k = 2, rgb = [214, 210, 196]) {
    rasterText(String(txt), 'mini', (gx, gy) => {
      for (let yy = 0; yy < k; yy++) for (let xx = 0; xx < k; xx++) {
        const X = x + gx * k + xx, Y = y + gy * k + yy;
        if (X < 0 || Y < 0 || X >= this.w || Y >= this.h) continue;
        const o = (Y * this.w + X) * 4;
        this.data[o] = rgb[0]; this.data[o + 1] = rgb[1]; this.data[o + 2] = rgb[2]; this.data[o + 3] = 255;
      }
    });
  }
  png() { return encodePNG(this.w, this.h, this.data); }
}

// ---- the sheet ----------------------------------------------------------------------------------------------
function sheetBuffer(framesByRow) {
  const H = ROWS.length * CELL, W = COLS * CELL;
  const rgba = new Uint8ClampedArray(W * H * 4);
  ROWS.forEach((name, row) => {
    const fr = framesByRow[name];
    if (!fr) return;
    fr.forEach((f, i) => {
      const ox = i * CELL, oy = row * CELL;
      for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
        const s = (y * CELL + x) * 4, d = ((oy + y) * W + (ox + x)) * 4;
        rgba[d] = f.cell[s]; rgba[d + 1] = f.cell[s + 1]; rgba[d + 2] = f.cell[s + 2]; rgba[d + 3] = f.cell[s + 3];
      }
    });
  });
  return { rgba, W, H };
}

function usedPalette(framesByRow) {
  const seen = new Set();
  for (const fr of Object.values(framesByRow)) for (const f of fr) {
    for (let o = 0; o < f.cell.length; o += 4) {
      if (!f.cell[o + 3]) continue;
      seen.add(rgbToHex([f.cell[o], f.cell[o + 1], f.cell[o + 2]]));
    }
  }
  // keep the declared palette order, drop unused entries (meta.palette must match the PNG's colours)
  return QUANT.palette.filter((h) => seen.has(h));
}

function fullHeight(cell) {
  let lo = 1e9, hi = -1;
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) if (cell[(y * CELL + x) * 4 + 3]) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
  return hi < 0 ? 0 : hi - lo + 1;
}

// ---- parts -------------------------------------------------------------------------------------------------
// A part sheet must carry the identical row/frame table as the body, with the same cell and anchors, so the
// runtime's parts loop can draw it at offset [0, 0].
function partCell(framesByRow, partName, { fine = false } = {}) {
  const out = {};
  for (const [name, list] of Object.entries(framesByRow)) {
    out[name] = list.map((f) => {
      const cell = new Uint8ClampedArray(CELL * CELL * 4);
      if (f.partCells?.[partName]) cell.set(f.partCells[partName]);
      if (fine) {
        // fine palette: the weapon's wood reads as gold/steel against the cream string
        const fineMap = new Map([[7, 5], [8, 6], [9, 13], [13, 8]]); // tunic lit->hair lit, base->hair shade, ...
        for (let o = 0; o < cell.length; o += 4) {
          if (!cell[o + 3]) continue;
          const hex = rgbToHex([cell[o], cell[o + 1], cell[o + 2]]);
          const idx = QUANT.palette.indexOf(hex);
          const to = fineMap.get(idx);
          if (to === undefined) continue;
          const p = QUANT.pal[to];
          cell[o] = p[0]; cell[o + 1] = p[1]; cell[o + 2] = p[2];
        }
      }
      return { cell, head: f.head.slice() };
    });
  }
  return out;
}

// ---- montages -----------------------------------------------------------------------------------------------
function debugMontage(framesByRow, outFile) {
  const k = 3, LABEL = 12;
  const rows = ROWS.filter((r) => framesByRow[r]);
  const maxFrames = Math.max(...rows.map((r) => framesByRow[r].length));
  const W = maxFrames * (CELL * k + 4) + 4, H = rows.length * (CELL * k + LABEL + 4) + 4;
  const c = new Canvas(W, H);
  rows.forEach((name, ri) => {
    const y0 = 4 + ri * (CELL * k + LABEL + 4);
    c.label(name, 4, y0, 2);
    framesByRow[name].forEach((f, i) => c.blit(f.cell, CELL, CELL, 4 + i * (CELL * k + 4), y0 + LABEL, k));
  });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, c.png());
  return outFile;
}

/**
 * Old art vs new art in the same pose, at 1x (sheet pixels) and 2x: the gate for the art swap. Panels:
 * old cell | new cell | old 2x | new 2x, one row per action/frame, cell-aligned so pivot and foot match.
 */
function compareMontage(framesByRow, oldPng, oldJson, outFile) {
  const png = readPNG(oldPng), meta = JSON.parse(fs.readFileSync(oldJson, 'utf8'));
  const pick = [['idle', 0], ['walk', 0], ['walk', 4], ['attack', 5], ['attack', 6], ['hurt', 1], ['death', 5], ['victory', 0]];
  const rows = pick.filter(([a]) => meta.actions[a]);
  const K = 2, GAP = 8, LAB = 14;
  const C1 = CELL, C2 = CELL * K;
  const W = 4 + C1 * 2 + GAP * 2 + C2 * 2 + GAP + 6;
  const H = LAB + 4 + rows.length * (C2 + LAB + GAP);
  const c = new Canvas(W, H);
  const xOld1 = 4, xNew1 = xOld1 + C1 + GAP, xOld2 = xNew1 + C1 + GAP * 2, xNew2 = xOld2 + C2 + GAP;
  const oldCell = (act, i) => {
    const a = meta.actions[act], n = Math.min(i, a.frames - 1);
    const ox = n * a.cell, oy = a.y, out = new Uint8ClampedArray(CELL * CELL * 4);
    for (let yy = 0; yy < CELL; yy++) for (let xx = 0; xx < CELL; xx++) {
      const s = ((oy + yy) * png.w + ox + xx) * 4, d = (yy * CELL + xx) * 4;
      out[d] = png.data[s]; out[d + 1] = png.data[s + 1]; out[d + 2] = png.data[s + 2]; out[d + 3] = png.data[s + 3];
    }
    return out;
  };
  c.label('OLD', xOld1, 2, 2, [230, 160, 120]);
  c.label('NEW', xNew1, 2, 2, [150, 220, 160]);
  c.label('OLD 2x', xOld2, 2, 2, [230, 160, 120]);
  c.label('NEW 2x', xNew2, 2, 2, [150, 220, 160]);
  rows.forEach(([act, fi], ri) => {
    const y = LAB + 4 + ri * (C2 + LAB + GAP);
    const old = oldCell(act, fi);
    const a = meta.actions[act], i = Math.min(fi, a.frames - 1);
    const fresh = framesByRow[act]?.[i]?.cell ?? new Uint8ClampedArray(CELL * CELL * 4);
    c.label(`${act}[${i}]`, 4, y - LAB + 2, 1.5);
    c.blit(old, CELL, CELL, xOld1, y, 1);
    c.blit(fresh, CELL, CELL, xNew1, y, 1);
    c.blit(old, CELL, CELL, xOld2, y, K);
    c.blit(fresh, CELL, CELL, xNew2, y, K);
  });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, c.png());
  return outFile;
}

// ---- main ---------------------------------------------------------------------------------------------------
function loadGear() {
  const file = path.join(HERE, 'gear', `${GEAR}.js`);
  if (!fs.existsSync(file)) throw new Error(`gear module not found: ${file}`);
  return import(`./gear/${GEAR}.js`);
}

/**
 * The face. RO sprites read at 31 px because the front-facing rows carry a real face: skin, a pair of eyes
 * with a highlight and a mouth shadow. The rig's own eye overlay is a single pixel, and the gear layers paint
 * hair/hood by rest-cell position, which in the turned rows would cover the face - so this overlay repaints a
 * skin patch and the eyes in screen space (px.sx/sy are rig screen pixels, y up; px.hx/hy is the head joint).
 * yaw: 0 = profile (one eye), +PI/2 = facing the camera (two eyes), -PI/2 = facing away (nothing).
 */
const packPal = (i) => {
  const p = QUANT.pal[Math.max(0, Math.min(QUANT.pal.length - 1, i))] ?? [0, 0, 0];
  return ((0xff << 24) | (p[2] << 16) | (p[1] << 8) | p[0]) >>> 0;
};
const faceLayer = (px) => {
  if (px.part !== 'head' && px.part !== 'face') return null;
  const yaw = px.yaw ?? 0;
  const facing = Math.sin(yaw);
  if (facing < -0.5) return null;
  const sx = Math.round(px.sx), sy = Math.round(px.sy);
  const fwdX = Math.cos(yaw);
  const st = px.tone >= 3 ? 3 : px.tone >= 2 ? 2 : 1;
  if (facing < 0.5) {
    // profile: a small skin face patch on the front of the head plus one eye and its catch-light. The gear
    // hood paints the skull only (part 'head'), so the rig's own 'face' part shows skin here.
    const cx = Math.round(px.hx + fwdX * 0.9 * SC);
    const cy = Math.round(px.hy + 1.3 * SC);
    const ey = Math.round(px.hy + 1.6 * SC);
    const ex = Math.round(cx + 1.9 * SC);
    const fdx = sx - cx, fdy = sy - cy;
    if (Math.abs(fdy) <= Math.round(1.1 * SC) && fdx >= -Math.round(0.4 * SC) && fdx <= Math.round(1.6 * SC)) {
      if (sx === ex && (sy === ey || sy === ey - 1)) return packPal(0);
      if (sx === ex - 1 && sy === ey) return packPal(15);
      if (sx === ex && sy === ey - 2) return packPal(3);
      return packPal(fdy >= 0 ? (fdx >= 0 ? 1 : 2) : 3);
    }
    return null;
  }
  // Front / three-quarter view: the head is painted in screen space (the rig's colour layers key off rest-cell
  // position, which in a turned view maps to view depth, so they cannot say where a face is).
  // Proportions in rig pixels above the head joint (the jaw): crown +3.3, hairline +2.0, eyes +1.5/+1.15,
  // nose +0.9, mouth +0.45, chin +0.15. Head half width ~2.6, face half width ~1.35.
  const at = (k) => Math.round(px.hy + k * SC);
  const cap = at(2.55), brow = at(1.95), chin = at(0.15);
  const eyeA = at(1.5), eyeB = at(1.15), noseY = at(0.9), mouthY = at(0.45), browShade = at(1.95) - 1;
  const icx = Math.round(px.hx);
  const hwd = Math.round(1.35 * SC); // face half width
  const hairW = Math.round(2.0 * SC); // hair/hood side band
  const dx = sx - icx;
  const adx = Math.abs(dx);
  if (sy > cap) return packPal(dx < 0 ? 6 : 7); // hood over the crown
  if (sy > brow) return packPal(dx < 0 ? 5 : 4); // auburn fringe, lit on the upper left
  if (sy < chin) {
    // jaw: one row of shadow, then the hood collar (a bare neck reads as a beard at this size)
    return sy > chin - Math.round(0.85 * SC) ? packPal(dx < 0 ? 8 : 7) : null;
  }
  if (adx <= hwd) {
    if (sy === eyeA) {
      if (adx === 1 || adx === 2) return packPal(dx === -1 ? 15 : 0); // two 2 px eyes with a lit pixel
      if (adx === 0) return packPal(2); // nose bridge
      return packPal(0); // outer eye pixel
    }
    if (sy === eyeB) return packPal(dx === 0 ? 2 : 3); // socket shadow under the eyes
    if (sy === browShade) return packPal(3); // brow shadow under the hood brim
    if (sy === noseY && dx === 0) return packPal(3);
    if (sy === mouthY) {
      if (dx === 0 || adx === hwd) return packPal(3); // mouth + cheek shade
      return packPal(dx < 0 ? 1 : 2);
    }
    return packPal(dx < 0 ? 1 : dx > 0 ? 2 : 1); // skin: lit left, mid right
  }
  if (adx <= hairW) return packPal(4); // sideburn / hair around the face
  return packPal(sy < brow ? 8 : 7); // hood rim
};

function buildMaterial(gearMod) {
  if (STOCK) return PASS_MODE === 'part' ? stockWeaponMaterial(CLASS) : stockMaterial();  // The dressed material: the gear module's layers (hair, clothes), the bare-body side-view eye, then the
  // class's own skin ramp. The plain bare body is used on purpose: the textured BARE_BODY's shade() would
  // repaint the tunic/trousers through the gear layers.
  const layers = [...(gearMod.layers ?? []), eyeLayer, gearMod.skinLayer ?? frontSkinLayer];
  return {
    ...BARE_BODY_PLAIN,
    id: `hero-${CLASS}`,
    seam: gearMod.seam ?? BARE_BODY_PLAIN.seam,
    ink: QUANT.pal[0] ? (0xff000000 | (QUANT.pal[0][2] << 16) | (QUANT.pal[0][1] << 8) | QUANT.pal[0][0]) >>> 0 : BARE_BODY_PLAIN.ink,
    layers,
    shade: null,
    overlay: faceLayer,
  };
}
const frontSkinLayer = ({ tone }) => BARE_BODY_PLAIN.layers[1]({ tone });

/** The class ramp currently in use: the armour pass keeps the class part table on the steel/ivory ramp. */
function stockClass() {
  const cls = CLS_DEF || STOCK_CLASSES[CLASS];
  if (PASS_MODE === 'armor') {
    if (COSTUME) return { palette: armourPaletteObj(CLASS), part: cls.part, regions: armourRegions(CLASS) };
    return { palette: STOCK_CLASSES.armour.palette, part: cls.part };
  }
  return cls;
}

/** all weapon pixels for one pose, rendered alone (with their own ink outline) via posedParts(). */
function weaponCells(p) {
  const parts = posedParts({ ...p });
  const out = {};
  for (const part of parts) out[part.name] = part;
  return out;
}

function stampPart(part, base) {
  const cell = new Uint8ClampedArray(CELL * CELL * 4);
  if (!part) return { cell, head: base.head };
  const dx = base.dx, dy = base.dy;
  for (let i = 0; i < part.n; i++) {
    const x = dx + part.xs[i], y = dy + part.ys[i];
    if (x < 0 || x >= CELL || y < 0 || y >= CELL) continue;
    const c = part.color[i];
    const o = (y * CELL + x) * 4;
    cell[o] = c & 255; cell[o + 1] = (c >>> 8) & 255; cell[o + 2] = (c >>> 16) & 255; cell[o + 3] = 255;
  }
  quantise(cell); dropSpecks(cell); inkRim(cell);
  return { cell, head: base.head };
}

/** Write one sheet: <id>.png/.json plus its <id>@2x LOD (cell 200, heroHeight x2, footFromBottom 16).
 * The renderer swaps to @2x when the hero is drawn big enough (sheetFor hi >= .66 enter), and the parts loop
 * follows the body LOD, so every part sheet needs its own @2x or it pops on zoom. */
function writeSheet(outDir, id, framesByRow, sheetMeta, { lod = !ARGS.noLod } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const { rgba, W, H } = sheetBuffer(framesByRow);
  const png = path.join(outDir, `${id}.png`), json = path.join(outDir, `${id}.json`);
  fs.writeFileSync(png, encodePNG(W, H, rgba));
  fs.writeFileSync(json, JSON.stringify(sheetMeta, null, 1) + '\n', 'utf8');
  const files = [png];
  if (!lod) return files;
  const up = new Uint8ClampedArray(W * 2 * H * 2 * 4);
  for (let y = 0; y < H * 2; y++) {
    for (let x = 0; x < W * 2; x++) {
      const si = (((y >> 1) * W + (x >> 1)) << 2), di = ((y * W * 2 + x) << 2);
      up[di] = rgba[si]; up[di + 1] = rgba[si + 1]; up[di + 2] = rgba[si + 2]; up[di + 3] = rgba[si + 3];
    }
  }
  const hi = {
    ...sheetMeta,
    cell: CELL * 2,
    heroHeight: sheetMeta.heroHeight * 2,
    footFromBottom: FOOT_FROM_BOTTOM * 2,
    actions: Object.fromEntries(Object.entries(sheetMeta.actions).map(([k, v]) => [k, {
      ...v,
      y: v.y * 2,
      cell: CELL * 2,
      head: v.head ? v.head.map(([x, y]) => [x * 2, y * 2]) : undefined,
      offset: v.offset ? v.offset.map(([x, y]) => [x * 2, y * 2]) : undefined,
    }])),
  };
  const hp = path.join(outDir, `${id}@2x.png`), hj = path.join(outDir, `${id}@2x.json`);
  fs.writeFileSync(hp, encodePNG(W * 2, H * 2, up));
  fs.writeFileSync(hj, JSON.stringify(hi, null, 1) + '\n', 'utf8');
  files.push(hp);
  return files;
}

async function main() {
  const gearMod = await loadGear();
  GEAR_MOD = gearMod;

  const palette = STOCK
    ? (COSTUME ? costumePalette(CLASS) : stockPalette(CLASS))
    : (gearMod.palette ?? PALETTE_BY_CLASS[CLASS] ?? ARCHER_PALETTE);
  if (!Array.isArray(palette) || palette.length > 16) throw new Error(`class palette must be <=16 colours (${CLASS})`);
  QUANT = { ...makeQuantiser(palette), palette: palette.slice() };

  const mat = buildMaterial(gearMod);
  MATERIAL = mat;
  setMaterial(mat);
  setGearPass(COSTUME ? (ctx) => CLS_DEF.draw(ctx) : STOCK ? null : (ctx) => gearMod.drawGear?.(ctx));

  // -- scale: the audit wants idle frame 0 exactly 70-74 px tall (72 for every class but priest). The rig's idle
  // bbox grows ~linear with pose.scale, so solve for the scale that lands on 72 instead of hard-coding it.
  const idleRest = { ...idle4.right, ...STANCE0() };
  const heightAt = (sc) => {
    const saved = SC; SC = sc;
    const r = posed(pose({ ...idleRest }));
    SC = saved;
    return r.y1 - r.y0 + 1;
  };
  if (!ARGS.scale) {
    let lo = 1.6, hi = 2.4;
    for (let it = 0; it < 22; it++) {
      const mid = (lo + hi) / 2;
      if (heightAt(mid) < 72) lo = mid; else hi = mid;
    }
    SC = Math.round(((lo + hi) / 2) * 1000) / 1000;
  }

  const actions = buildActions();
  const framesByRow = {};
  const headByRow = {};
  const baseByRow = {};     // per-frame stamp origin (dx,dy) used by the body sheet: part sheets must reuse it
  const partCellsByRow = {};
  // --split: the body sheet is dressed but weaponless; the weapon is its own sheet (meta.parts).
  if (SPLIT) POSE_EXTRA = { hideWeapon: true };
  for (const [name, def] of Object.entries(actions)) {
    framesByRow[name] = [];
    headByRow[name] = [];
    baseByRow[name] = [];
    partCellsByRow[name] = [];
    const center = name === 'death';
    for (const e of def.poses) {
      const p = pose(e);
      const f = renderCell(p, { center, tag: `${name}[${framesByRow[name].length}]` });
      framesByRow[name].push(f);
      headByRow[name].push(f.head);
      baseByRow[name].push({ dx: f.dx, dy: f.dy });
    }
  }
  if (PARTS || SPLIT) {
    // Part cells reuse the BODY frame's stamp origin. Recomputing it from the weapon-bearing pose shifts the
    // weapon by however far the blade dips below the feet (greatsword tip-down, staff butt) and breaks alignment.
    POSE_EXTRA = {};
    PASS_MODE = 'part';
    setMaterial(buildMaterial(GEAR_MOD));
    const savedQuantPart = QUANT;
    if (STOCK) {
      // Weapon part sheets use their own ramp: the stock rig bakes weapon colours (this fork's STEEL table) and the
      // class body palette has no wood/steel tones, so quantising a bow to the body ramps turned it blue.
      const wPal = stockWeaponPalette(CLASS);
      QUANT = { ...makeQuantiser(wPal), palette: wPal };
    }
    for (const [name, def] of Object.entries(actions)) {
      partCellsByRow[name] = def.poses.map((e, i) => {
        const p = pose(e);
        const parts = weaponCells(p);
        const base = { ...baseByRow[name][i], head: headByRow[name][i] };
        return { weapon: stampPart(parts.weapon, base), offWeapon: stampPart(parts.offWeapon, base) };
      });
    }
    QUANT = savedQuantPart;
    PASS_MODE = 'body';
    setMaterial(buildMaterial(GEAR_MOD));
  }
  for (const name of ROWS) {
    const from = MIRRORED_FROM[name];
    if (!from) continue;
    framesByRow[name] = framesByRow[from].map(mirrorCell);
    headByRow[name] = framesByRow[name].map((f) => f.head);
    if (PARTS || SPLIT) {
      partCellsByRow[name] = (partCellsByRow[from] ?? []).map((pc) => ({
        weapon: pc.weapon ? mirrorCell(pc.weapon) : pc.weapon,
        offWeapon: pc.offWeapon ? mirrorCell(pc.offWeapon) : pc.offWeapon,
      }));
    }
  }

  const idleH = fullHeight(framesByRow.idle[0].cell);

  // ---- paperdoll self-check (--checkparts) ---------------------------------------------------------------
  // Composite the weapon part sheet over the body sheet offline and diff it against the same frame rendered
  // with the weapon baked in. Equal positions mean the part/body pose pair and the stamp origin agree; a large
  // diff means the part drifted (the earlier bug: the part was stamped from the weapon-bearing bbox, so a blade
  // dipping below the feet shifted the whole part up).
  if (SPLIT && (ARGS.checkparts || ARGS['check-parts'])) {
    const savedPose = POSE_EXTRA;
    POSE_EXTRA = {};
    const SAMPLE = [['idle', 0], ['walk', 2], ['walk', 4], ['attack', 4], ['attack', 5], ['attack', 6],
      ['attackDown', 4], ['attackDownRight', 5], ['hurt', 1], ['death', 3], ['victory', 0]];
    let worst = 0;
    for (const [name, i] of SAMPLE) {
      const def = actions[name];
      if (!def || !def.poses[i]) continue;
      // Stock mode draws the weapon only in the part pass, so a weapon-baked body render does not exist; the
      // expected weapon bbox comes straight from the rig's own weapon part at the body's stamp origin instead.
      const baked = STOCK ? null : renderCell(pose(def.poses[i]), { center: name === 'death', origin: baseByRow[name][i] }).cell;
      const body = framesByRow[name]?.[i]?.cell;
      const part = partCellsByRow[name]?.[i]?.weapon?.cell ?? partCellsByRow[name]?.[i]?.weapon;
      if (!body || !part) { console.log(`  checkparts ${name}[${i}]: missing frame`); worst = 1; continue; }
      const comp = body.slice();
      for (let k = 0; k < CELL * CELL; k++) {
        const o = k * 4;
        if (part[o + 3]) { comp[o] = part[o]; comp[o + 1] = part[o + 1]; comp[o + 2] = part[o + 2]; comp[o + 3] = 255; }
      }
      // The baked render is the same pose stamped at the body's origin: weapon pixels are exactly where the
      // baked and the weaponless renders differ. Comparing bounding boxes reports alignment (offset 0,0) and is
      // immune to z-order/ink differences that make a raw pixel diff noisy.
      const savedInner = POSE_EXTRA;
      POSE_EXTRA = { hideWeapon: true };
      const bodyOnly = STOCK ? null : renderCell(pose(def.poses[i]), { center: name === 'death', origin: baseByRow[name][i] }).cell;
      POSE_EXTRA = savedInner;
      const bbox = (isWeapon) => {
        let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
        for (let k = 0; k < CELL * CELL; k++) {
          const o = k * 4;
          const on = isWeapon(o, k);
          if (!on) continue;
          const x = k % CELL, y = (k - x) / CELL;
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
          n++;
        }
        return n ? { x0, y0, x1, y1, n } : { x0: 0, y0: 0, x1: 0, y1: 0, n: 0 };
      };
      const pb = bbox((o) => part[o + 3] > 0);
      let bb;
      if (STOCK) {
        const savedMode = PASS_MODE;
        PASS_MODE = 'part';
        setMaterial(buildMaterial(GEAR_MOD));
        const wp = weaponCells(pose(def.poses[i])).weapon;
        const base = baseByRow[name][i];
        bb = { x0: 1e9, y0: 1e9, x1: -1, y1: -1, n: 0 };
        for (let k = 0; k < wp.n; k++) {
          const x = base.dx + wp.xs[k], y = base.dy + wp.ys[k];
          if (x < 0 || x >= CELL || y < 0 || y >= CELL) continue;
          bb.x0 = Math.min(bb.x0, x); bb.y0 = Math.min(bb.y0, y); bb.x1 = Math.max(bb.x1, x); bb.y1 = Math.max(bb.y1, y);
          bb.n++;
        }
        PASS_MODE = savedMode;
        setMaterial(buildMaterial(GEAR_MOD));
      } else {
        bb = bbox((o) => {
          const ab = baked[o + 3], ao = bodyOnly[o + 3];
          if (ab !== ao) return true;
          if (!ab) return false;
          return Math.abs(baked[o] - bodyOnly[o]) + Math.abs(baked[o + 1] - bodyOnly[o + 1]) + Math.abs(baked[o + 2] - bodyOnly[o + 2]) > 12;
        });
      }
      const off = Math.max(Math.abs(pb.x0 - bb.x0), Math.abs(pb.y0 - bb.y0), Math.abs(pb.x1 - bb.x1), Math.abs(pb.y1 - bb.y1));
      let opaque = 0, diff = 0;
      for (let k = 0; baked && k < CELL * CELL; k++) {
        const o = k * 4, ab = baked[o + 3], ac = comp[o + 3];
        if (!ab && !ac) continue;
        opaque++;
        if (ab !== ac) { diff++; continue; }
        if (Math.abs(baked[o] - comp[o]) + Math.abs(baked[o + 1] - comp[o + 1]) + Math.abs(baked[o + 2] - comp[o + 2]) > 48) diff++;
      }
      const pct = opaque ? diff / opaque : 0;
      worst = Math.max(worst, off);
      console.log(`  checkparts ${name}[${i}]: bbox offset ${off}px, part ${pb.n}px [${pb.x0},${pb.y0},${pb.x1},${pb.y1}] vs baked ${bb.n}px [${bb.x0},${bb.y0},${bb.x1},${bb.y1}], pixel diff ${(pct * 100).toFixed(1)}%`);
    }
    POSE_EXTRA = savedPose;
    console.log(`  checkparts worst bbox offset ${worst}px ${worst > 0 ? 'FAIL' : 'ok'}`);
  }

  // ---- metadata ----
  // meta.palette stays the declared class palette (stable indices for groups.outfit): the PNG only uses these
  // colours, so the audit's <=16 whole-sheet rule holds whether or not every slot is painted.
  const outfitHexes = STOCK
    ? (COSTUME ? costumeOutfit(CLASS) : stockOutfit(CLASS))
    : (gearMod.outfit ?? OUTFIT_BY_CLASS[CLASS] ?? OUTFIT_BY_CLASS.archer);
  const outfit = outfitHexes.map((h) => palette.findIndex((p) => p.toLowerCase() === h.toLowerCase())).filter((i) => i >= 0);
  const metalHexes = gearMod.metal ?? [];
  const metal = metalHexes.map((h) => palette.findIndex((p) => p.toLowerCase() === h.toLowerCase())).filter((i) => i >= 0);
  const meta = {
    hero: CLASS,
    heroHeight: idleH,
    footFromBottom: FOOT_FROM_BOTTOM,
    cell: CELL,
    palette: palette.slice(),
    groups: { outfit, metal },
    actions: {},
    source: 'pixelfx rig pipeline (pipeline/scripts/pixelfx/character/export-heroes.mjs)',
  };
  for (const name of ROWS) {
    const def = actions[name] ?? actions[MIRRORED_FROM[name]] ?? null;
    if (!def) continue;
    const row = {
      y: ROWS.indexOf(name) * CELL,
      cell: CELL,
      cols: COLS,
      frames: framesByRow[name].length,
      frameTime: def.frameTime,
      head: headByRow[name].map((h) => [Math.round(h[0] * 10) / 10, Math.round(h[1] * 10) / 10]),
      bakedMotion: true,
    };
    if (def.release !== undefined) row.release = def.release;
    if (def.impact !== undefined) row.impact = def.impact;
    if (def.strikeDur) row.strikeDur = def.strikeDur;
    if (def.windupFrameTime !== undefined) row.windupFrameTime = def.windupFrameTime;
    if (def.cycle !== undefined) row.cycle = def.cycle;
    meta.actions[name] = row;
  }
  // Paperdoll: the runtime draws meta.parts over the body sheet, keyed by the BODY's action key, so the part
  // sheets carry the exact same rows/frames/y/cell and land pixel-exact at offset [0,0].
  if (SPLIT) meta.parts = [{ id: 'weapon', sheet: `${CLASS}-weapon`, shadow: false }];

  // ---- write the primary (fully dressed, weaponless in --split mode) sheet + its @2x LOD ----
  const sheetFiles = writeSheet(OUT, CLASS, framesByRow, meta);
  const pngFile = sheetFiles[0];
  const jsonFile = pngFile.replace(/\.png$/, '.json');


  // ---- debug / compare montages ----
  const workDir = path.join(ROOT, 'output', 'pixelfx-heroes', CLASS);
  let debugFile = null, compareFile = null;
  if (DEBUG) debugFile = debugMontage(framesByRow, path.join(workDir, 'rows-3x.png'));
  const oldPng = OLD_SHEET ?? path.join(ROOT, 'assets', 'heroes', 'legacy', `${CLASS}.png`);
  const oldJson = oldPng.replace(/\.png$/, '.json');
  if (fs.existsSync(oldPng) && fs.existsSync(oldJson) && ARGS.compare !== false) {
    compareFile = compareMontage(framesByRow, oldPng, oldJson, path.join(workDir, 'compare.png'));
  }

  // ---- part sheets: the weapon as its own sheet, in both the normal and the upgraded ("fine") skin ----
  const partFiles = [];
  if (PARTS || SPLIT) {
    const weapon = {}, weaponFine = {};
    // Weapon part sheets carry their own ramp (stock mode: wooden bow / steel blade, no class-body tones) so the
    // sparse part sheet stays inside the 16-colour budget and the bow does not quantise to the tunic ramps.
    const wPal = STOCK ? stockWeaponPalette(CLASS) : meta.palette;
    const fPal = STOCK ? stockFinePalette(CLASS) : meta.palette;
    // "fine" weapon skin: same silhouette, richer ramp. Fork mode remaps inside the class palette; stock mode
    // re-quantises to the finer ramp (gold-trimmed wood, brighter steel).
    const FINE_MAP = new Map([[14, 9], [3, 5], [11, 10]]);
    const fineQuant = STOCK ? { ...makeQuantiser(fPal), palette: fPal } : null;
    const fineCell = ({ cell, head }) => {
      const out = cell.slice();
      for (let o = 0; o < out.length; o += 4) {
        if (!out[o + 3]) continue;
        if (fineQuant) {
          const p = fineQuant.pal[fineQuant.nearest(out[o], out[o + 1], out[o + 2])];
          out[o] = p[0]; out[o + 1] = p[1]; out[o + 2] = p[2];
          continue;
        }
        const hex = rgbToHex([out[o], out[o + 1], out[o + 2]]);
        const to = FINE_MAP.get(wPal.indexOf(hex));
        if (to === undefined) continue;
        const p = QUANT.pal[to];
        out[o] = p[0]; out[o + 1] = p[1]; out[o + 2] = p[2];
      }
      return { cell: out, head: head.slice() };
    };
    for (const name of ROWS) {
      weapon[name] = (partCellsByRow[name] ?? []).map((pc) => pc.weapon);
      weaponFine[name] = weapon[name].map(fineCell);
    }
    const partMeta = (id, pal) => ({
      part: true,
      hero: id,
      partsOf: CLASS,
      heroHeight: idleH,
      footFromBottom: FOOT_FROM_BOTTOM,
      cell: CELL,
      palette: pal,
      actions: Object.fromEntries(Object.entries(meta.actions).map(([k, v]) => [k, {
        ...v,
        offset: Array.from({ length: v.frames }, () => [0, 0]),
      }])),
      source: meta.source,
    });
    for (const [id, rows, pal] of [[`${CLASS}-weapon`, weapon, wPal], [`${CLASS}-weapon-fine`, weaponFine, fPal]]) {
      partFiles.push(...writeSheet(OUT, id, rows, partMeta(id, pal)));
    }
    // The armour sheet is a full body re-render on its own steel palette, also WEAPONLESS and carrying the same
    // meta.parts, so the weapon part (normal or fine) is drawn on top of either body independently. Baking the
    // weapon into the armour body made the runtime skip the -weapon-fine part for upgraded players.
    const savedQuant = QUANT, savedRecol = RECOLOUR_EXTRA, savedPose = POSE_EXTRA;
    const aPal = STOCK ? (COSTUME ? armourPalette(CLASS) : stockPalette('armour')) : ARMOUR_PALETTE.slice();
    QUANT = { ...makeQuantiser(aPal), palette: aPal };
    RECOLOUR_EXTRA = STOCK ? null : packedMap(Object.fromEntries(palette.map((h) => [h, h])), ARMOUR_RESKIN);
    POSE_EXTRA = { hideWeapon: true };
    if (STOCK) { PASS_MODE = 'armor'; setMaterial(buildMaterial(GEAR_MOD)); }
    const aFrames = {}, aHeads = {};
    for (const [name, def] of Object.entries(actions)) {
      aFrames[name] = []; aHeads[name] = [];
      for (const e of def.poses) {
        const f = renderCell(pose(e), { center: name === 'death' });
        aFrames[name].push(f); aHeads[name].push(f.head);
      }
    }
    for (const name of ROWS) {
      const from = MIRRORED_FROM[name];
      if (!from) continue;
      aFrames[name] = aFrames[from].map(mirrorCell);
      aHeads[name] = aFrames[name].map((f) => f.head);
    }
    const armourMeta = {
      ...meta,
      hero: `${CLASS}-armor`,
      parts: [{ id: 'weapon', sheet: `${CLASS}-weapon`, shadow: false }],
      palette: aPal,
      groups: { outfit: [6, 7, 8, 10], metal: [14] },
      actions: Object.fromEntries(Object.entries(meta.actions).map(([k, v]) => [k, {
        ...v,
        head: (aHeads[k] ?? []).map((h) => [Math.round(h[0] * 10) / 10, Math.round(h[1] * 10) / 10]),
      }])),
    };
    partFiles.push(...writeSheet(OUT, `${CLASS}-armor`, aFrames, armourMeta));
    QUANT = savedQuant; RECOLOUR_EXTRA = savedRecol; POSE_EXTRA = savedPose;
    if (STOCK) { PASS_MODE = 'body'; setMaterial(buildMaterial(GEAR_MOD)); }
  }

  if (!QUIET) {
    console.log(`${CLASS}: ${path.relative(ROOT, pngFile)} (${COLS * CELL}x${ROWS.length * CELL}), ${path.relative(ROOT, jsonFile)}`);
    console.log(`  scale ${SC}  heroHeight ${idleH}  palette ${meta.palette.length}`);
    console.log(`  rows: ${ROWS.map((r) => `${r}:${framesByRow[r]?.length ?? 0}`).join(' ')}`);
    if (debugFile) console.log(`  rows montage: ${path.relative(ROOT, debugFile)}`);
    if (compareFile) console.log(`  compare:     ${path.relative(ROOT, compareFile)}`);
    for (const f of partFiles) console.log(`  part:        ${path.relative(ROOT, f)}`);
  }
}

main().catch((e) => { console.error(e?.stack ?? e); process.exit(1); });
