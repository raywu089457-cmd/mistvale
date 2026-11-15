#!/usr/bin/env node
// doll-pack.mjs -- the REAL paperdoll art pack for Mistvale's six hero classes.
//
// Everything here is drawn by the pixelfx rig (the same rig that already ships assets/heroes/):
// the class body and head come from the bespoke costume pass (costume.mjs, painted through
// stockbody.paintStock), the six equipment pieces are the body's own pixels recoloured through
// the per-class costume ramp with the donor's rampOf()/ornament discipline, and the weapon is the
// rig's own WEAPONS[type] geometry standing in the near hand.
//
// Output (see docs/PAPERDOLL.md for the data format):
//   assets/paperdoll-classes/paperdoll.json   one format:"mistvale-paperdoll" document
//   assets/paperdoll-classes/<class>.png      one indexed atlas per class (shared frame layout)
//
// Usage: node pipeline/scripts/pixelfx/character/doll-pack.mjs [--only=archer] [--verbose]
//
// The pack is deterministic: same rig + same code -> byte-identical files (no timestamps, fixed
// ordering everywhere, minified json).

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { STAND, posed, skeleton, setMaterial, setGearPass } from './core/rig.js';
import { poseAt } from './core/act.js';
import * as idle4 from './idle-4dir.js';
import * as walk4 from './walk-4dir.js';
import {
  STOCK_HOLD,
  stockMaterial,
  paintStock,
  MARK_INK,
  MARK_SEAM,
  MARK_MARK,
  WEAPON_STEEL_RAMP,
  WEAPON_WOOD_RAMP,
} from './stockbody.mjs';
import { COSTUMES, costumePalette } from './costume.mjs';
import { encodePNG } from './png-io.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const OUT_DIR = path.join(ROOT, 'assets', 'paperdoll-classes');

const ARGS = Object.fromEntries(
  process.argv.slice(2).map((s) => {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(s);
    return m ? [m[1], m[2] ?? true] : [s, true];
  })
);
const ONLY = typeof ARGS.only === 'string' ? ARGS.only.split(',') : null;
const VERBOSE = !!ARGS.verbose;

// ---------------------------------------------------------------------------------------------
// constants shared with the hero-sheet exporter
// ---------------------------------------------------------------------------------------------

const ALL_CLASSES = ['archer', 'berserker', 'paladin', 'sorcerer', 'assassin', 'priest'];
const GEAR_SLOTS = ['helm', 'chest', 'belt', 'legs', 'boots', 'gloves'];
// helmet silhouette family per class: great = great helm + visor + plume, iron = iron cap + fur brim
// + two horns, cloth = pointed cloth hood (the sorcerer's hat becomes the hood crown), leather =
// leather hood with a brim, hood = hood + lower-face mask, circlet = thin band over the veil.
const HELM_STYLE = {
  archer: 'leather',
  berserker: 'iron',
  paladin: 'great',
  sorcerer: 'cloth',
  assassin: 'hood',
  priest: 'circlet',
};
const TICK = 20;
const CELL = 100;
const FOOT_FROM_BOTTOM = 8;
const CELL_W = 640; // atlas shelf width

// rig yaw per direction row: 0 up, 1 right, 2 down, 3 left, then the four diagonals.
const YAW = [-Math.PI / 2, 0, Math.PI / 2, Math.PI, -Math.PI / 4, Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4];
// the rig pose set whose arm layout matches that view (idle-4dir / walk-4dir only model 3 views)
const VIEW = ['up', 'right', 'down', 'right', 'up', 'down', 'down', 'up'];
const DIR_NAMES = ['up', 'right', 'down', 'left', 'upRight', 'downRight', 'downLeft', 'upLeft'];

const PART = {
  pelvis: 1, waist: 2, chest: 3, neck: 4, head: 5, face: 6,
  upperN: 7, elbowN: 8, foreN: 9, handN: 10,
  upperF: 11, elbowF: 12, foreF: 13, handF: 14,
  thighN: 15, kneeN: 16, shinN: 17, footN: 18,
  thighF: 19, kneeF: 20, shinF: 21, footF: 22,
  weapon: 23, offWeapon: 24,
};

// the class stance the hero sheets use (export-heroes.mjs STANCE); the pack must stand like them.
const STANCE = {
  archer: {},
  berserker: { fx: 2, fy: -18, bx: 8, by: -14, ffx: 7.5, fbx: -7.5, crouch: 1.4, sa: Math.PI / 2, wl: 1, scaleWeapon: 0.78 },
  paladin: { fx: 3, fy: -19, bx: 8, by: -12, ffx: 5, fbx: -5 },
  sorcerer: { fx: 4, fy: -23, bx: 8, by: -15, ffx: 3, fbx: -3 },
  assassin: { fx: -5, fy: -11, bx: -2, by: -12, crouch: 2.4, lean: 3, ffx: 5, fbx: -5 },
  priest: { fx: 2, fy: -18, bx: 6, by: -18, ffx: 2, fbx: -2 },
};

const POSE_COORDS = ['fx', 'fy', 'fz', 'bx', 'by', 'bz', 'ffx', 'ffy', 'fbx', 'fby', 'crouch', 'wz', 'handDropN', 'handDropF', 'handDyN', 'handDyF', 'foreTrimN', 'foreTrimF', 'y'];
const WSC = 1.05;

const WEAPON_TYPE = { archer: 'bow', berserker: 'greatsword', paladin: 'sword', sorcerer: 'staff', assassin: 'dagger', priest: 'staff' };

const FINE_WOOD = ['#c8a878', '#8a6a44', '#6d5334', '#2a1e14'];
const FINE_STEEL = ['#dfe6f2', '#b9c5d6', '#8591a4', '#4c5566'];
const FINE_STRING = '#f4ead2';
const STRING_HEX = '#e8dcc0';

// ---------------------------------------------------------------------------------------------
// action table (shared rows: every class uses the same skeleton, only the skin art differs)
// ---------------------------------------------------------------------------------------------

const ACTIONS = [
  { key: 'idle', slots: 4, af: [7, 14, 21, 28], loop: true },
  { key: 'walk', slots: 4, af: [5, 10, 15, 20], loop: true },
  { key: 'attack', slots: 5, af: [3, 8, 10, 11, 12], releaseSlot: 1, impactSlot: 2 },
  { key: 'attack.bow', slots: 5, af: [4, 8, 10, 12, 13], releaseSlot: 1, impactSlot: 2 },
  { key: 'attack.greatsword', slots: 5, af: [5, 8, 10, 11, 13], releaseSlot: 1, impactSlot: 2 },
  { key: 'attack.sword', slots: 5, af: [3, 8, 10, 11, 12], releaseSlot: 1, impactSlot: 2 },
  { key: 'attack.staff', slots: 5, af: [4, 8, 11, 12, 14], releaseSlot: 1, impactSlot: 2 },
  { key: 'attack.dagger', slots: 5, af: [2, 8, 9, 10, 11], releaseSlot: 1, impactSlot: 2 },
  { key: 'skill', slots: 5, af: [6, 12, 15, 18, 20], releaseSlot: 2, impactSlot: 3 },
  { key: 'hurt', slots: 2, af: [5, 10] },
];
const ACTION_BY_KEY = new Map(ACTIONS.map((a) => [a.key, a]));
const ACTION_ORDER = ACTIONS.map((a) => a.key);

// ---------------------------------------------------------------------------------------------
// motion tracks (side-view rig space; the yaw per row turns them into the 8 directions)
// ---------------------------------------------------------------------------------------------

const TRACK = {
  'attack.bow': [
    [0, { lean: -0.5, crouch: 0.2, fx: 7.5, fy: -16, bx: 0.5, by: -14, pull: true, nocked: true }],
    [0.12, { lean: -1.4, crouch: 0.5, fx: 8.8, fy: -16.6, bx: -2.5, by: -14.8, pull: true, nocked: true }],
    [0.26, { lean: -2.2, crouch: 0.9, fx: 10.2, fy: -17.3, bx: -5.5, by: -15.4, pull: true, nocked: true }],
    [0.38, { lean: -2.4, crouch: 1.0, fx: 10.4, fy: -17.4, bx: -7, by: -15.5, pull: true, nocked: true }],
    [0.44, { lean: 0.5, crouch: 0.6, fx: 11, fy: -16.4, bx: -9, by: -12.4, pull: false, nocked: false }],
    [0.52, { lean: 2, crouch: 0.5, fx: 10.8, fy: -15.6, bx: -9.5, by: -11 }],
    [0.65, { lean: 0.5, crouch: 0.3, fx: 8.8, fy: -15.4, bx: -1.5, by: -13 }],
  ],
  'attack.greatsword': [
    [0, { lean: -1, crouch: 0.2, fx: 5, fy: -15, sa: 2.3, wl: 1, two: true }],
    [0.14, { lean: -2, crouch: 0.5, fx: 5.8, fy: -14.2, sa: 2.8, two: true }],
    [0.3, { lean: 1, crouch: 0.6, fx: 8.8, fy: -16, sa: 1.3, two: true }],
    [0.4, { lean: 3, crouch: 0.8, fx: 11, fy: -17, sa: -0.9, two: true }],
    [0.5, { lean: 2, crouch: 0.7, fx: 10, fy: -16.4, sa: -1.5, two: true }],
    [0.65, { lean: 1, crouch: 0.4, fx: 8, fy: -15.4, sa: -1.1, two: true }],
  ],
  'attack.sword': [
    [0, { lean: -1, crouch: 0.2, fx: 6, fy: -15, sa: 1.9 }],
    [0.14, { lean: -1.6, crouch: 0.4, fx: 7, fy: -15, sa: 2.5 }],
    [0.3, { lean: 1, crouch: 0.5, fx: 9.4, fy: -16, sa: 1.0 }],
    [0.4, { lean: 2.5, crouch: 0.7, fx: 11, fy: -17, sa: -0.7 }],
    [0.5, { lean: 1.5, crouch: 0.5, fx: 10, fy: -16, sa: -1.3 }],
    [0.65, { lean: 0.6, crouch: 0.3, fx: 8.4, fy: -15.4, sa: -1.0 }],
  ],
  'attack.staff': [
    [0, { lean: -1, crouch: 0.2, fx: 4, fy: -15, sa: -2.2, wl: 1 }],
    [0.16, { lean: -2, crouch: 0.4, fx: 5, fy: -14.2, sa: -2.5 }],
    [0.3, { lean: 0, crouch: 0.5, fx: 8, fy: -16, sa: -1.0 }],
    [0.4, { lean: 2, crouch: 0.6, fx: 11, fy: -16.5, sa: -0.3 }],
    [0.5, { lean: 1.4, crouch: 0.5, fx: 10, fy: -16, sa: -0.6 }],
    [0.65, { lean: 0.6, crouch: 0.3, fx: 8, fy: -15.4, sa: -1.2 }],
  ],
  'attack.dagger': [
    [0, { lean: 1, crouch: 0.4, fx: 5, fy: -14, sa: 0.6 }],
    [0.1, { lean: 2, crouch: 0.6, fx: 4, fy: -13, sa: 1.0 }],
    [0.22, { lean: -1, crouch: 0.5, fx: 9, fy: -15.5, sa: -0.2 }],
    [0.4, { lean: 0, crouch: 0.4, fx: 10.4, fy: -16, sa: -0.6 }],
    [0.5, { lean: 0.6, crouch: 0.3, fx: 9, fy: -15.4, sa: -0.4 }],
    [0.65, { lean: 0.2, crouch: 0.2, fx: 7, fy: -15, sa: 0.1 }],
  ],
  skill: [
    [0, { lean: -1, crouch: 0.2, fx: 3, fy: -15 }],
    [0.2, { lean: -2, crouch: 0.4, fx: 2, fy: -14 }],
    [0.5, { lean: -2.4, crouch: 0.6, fx: 4, fy: -13.4 }],
    [0.75, { lean: -1, crouch: 0.5, fx: 8, fy: -16 }],
    [1.0, { lean: 0, crouch: 0.3, fx: 6, fy: -15 }],
  ],
  hurt: [
    [0, { lean: 0.5, crouch: 0.3, fx: 0, fy: -15, bx: 3, by: -14 }],
    [0.13, { lean: -3, crouch: 1, fx: -4, fy: -13, bx: 0, by: -13, turn: 0.1 }],
    [0.26, { lean: -5, crouch: 1.6, fx: -6, fy: -12, bx: -1, by: -12, turn: 0.05 }],
    [0.4, { lean: -2, crouch: 0.9, fx: -2, fy: -14, bx: 2, by: -13, turn: 0.15 }],
  ],
};

// the plain `attack` row uses the class weapon's own motion; archers draw the bow, casters thrust the staff
function trackFor(cls, action) {
  const t = WEAPON_TYPE[cls];
  if (action === 'attack') return TRACK[`attack.${t}`];
  return TRACK[action] ?? null;
}
const IDLE_BREATH = [-0.15, -0.7, -0.85, -0.3];

// ---------------------------------------------------------------------------------------------
// small colour helpers
// ---------------------------------------------------------------------------------------------

const hex = (s) => {
  const n = parseInt(s.slice(1), 16);
  return ((0xff << 24) | ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff)) >>> 0;
};
const rgbOf = (c) => [c & 0xff, (c >>> 8) & 0xff, (c >>> 16) & 0xff];
const toHex = (c) => '#' + rgbOf(c).map((v) => v.toString(16).padStart(2, '0')).join('');
const pack = (r, g, b, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
const mix = (c1, c2, u) => {
  const a = rgbOf(c1), b = rgbOf(c2);
  return pack(
    Math.round(a[0] + (b[0] - a[0]) * u),
    Math.round(a[1] + (b[1] - a[1]) * u),
    Math.round(a[2] + (b[2] - a[2]) * u)
  );
};
const BLACK = pack(0, 0, 0); // packed-ABGR black (raw 0x000000ff would be pure RED in this layout)
const WHITE = 0xffffffff >>> 0;
const lum = (c) => {
  const [r, g, b] = rgbOf(c);
  return 0.3 * r + 0.59 * g + 0.11 * b;
};
// donor rampOf: one colour -> 4 shell ranks + 3 core ranks so gear shading matches the body
const RAMP_CACHE = new Map();
function rampOf(base) {
  if (RAMP_CACHE.has(base)) return RAMP_CACHE.get(base);
  const c = base;
  const lift = mix(c, WHITE, 0.2), mid = mix(c, BLACK, 0.16), shade = mix(c, BLACK, 0.34), deep = mix(c, BLACK, 0.6);
  const r = { shell: [lift, c, shade, deep], core: [mid, shade, deep] };
  RAMP_CACHE.set(base, r);
  return r;
}
function nearestHex(pal, targetHex) {
  const t = hex(targetHex);
  let best = pal[0], bd = Infinity;
  for (const p of pal) {
    const d = Math.abs(lum(p) - lum(t)) + 0.15 * Math.abs((p & 0xff) - (t & 0xff));
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// poses
// ---------------------------------------------------------------------------------------------

function poseFor(cls, dir, action, slot, SC, withWeapon = true) {
  const view = VIEW[dir];
  const yaw = YAW[dir];
  const hold = STOCK_HOLD[cls] ?? {};
  const stance = STANCE[cls] ?? {};
  const a = ACTION_BY_KEY.get(action);

  let base = null;
  if (action === 'idle') base = idle4[view];
  else if (action === 'walk') {
    const list = walk4.posesOf(view);
    base = list[(slot * 2) % list.length];
  }

  const out = { ...STAND, ...(base ?? {}), ...stance };
  const turned = Math.abs(yaw) > 1e-6;

  // the weapon is always in the near hand (skipped for the body pass: the costume's own decoration
  // shares the rig's offWeapon part id, so the two passes must be rendered separately)
  if (withWeapon) {
    out.weapon = hold.weapon;
    if (hold.offWeapon) out.offWeapon = hold.offWeapon;
  }
  if (hold.sa != null) out.sa = hold.sa;
  if (hold.wl != null) out.wl = hold.wl;
  if (hold.sb != null) out.sb = hold.sb;
  if (hold.scaleWeapon != null) out.scaleWeapon = hold.scaleWeapon;
  if (!turned && hold.fx != null && base == null) { out.fx = hold.fx; out.fy = hold.fy; out.fz = hold.fz; }

  if (action === 'idle' && base) {
    const b = IDLE_BREATH[slot % IDLE_BREATH.length];
    // export-heroes breathes on top of {idle view + STANCE}, so the stance offsets must be included
    out.crouch = (out.crouch ?? 0) + b;
    out.fy = (out.fy ?? STAND.fy) + b * 0.75;
    out.by = (out.by ?? STAND.by) + b * 0.6;
  }

  const track = trackFor(cls, action);
  if (track) {
    const t0 = slot === 0 ? 0 : a.af[slot - 1] / TICK;
    const extra = poseAt(track, t0 + 1e-4);
    for (const k of Object.keys(extra)) {
      if (k === 'x' || k === 'y') continue;
      out[k] = extra[k];
    }
  }

  out.yaw = yaw;
  for (const k of POSE_COORDS) if (typeof out[k] === 'number') out[k] = out[k] * SC;
  out.scale = SC;
  out.scaleWeapon = out.scaleWeapon ?? WSC;
  return out;
}

// ---------------------------------------------------------------------------------------------
// render one cell through the rig and split it into paperdoll layers
// ---------------------------------------------------------------------------------------------

// The installed hero sheets are post-processed per cell (quantise to the class palette, drop lone
// specks, ink the bright silhouette edge). The doll body/head must go through the exact same pass or
// the bare look stops matching the hero sheet pixel for pixel.
const PAL_CACHE = new Map();
function quantPalette(cls) {
  if (PAL_CACHE.has(cls)) return PAL_CACHE.get(cls);
  const list = costumePalette(cls).map((h) => hex(h));
  PAL_CACHE.set(cls, list);
  return list;
}
function nearestPal(col, pal) {
  const [r, g, b] = rgbOf(col);
  let bi = 0, bd = Infinity;
  for (let i = 0; i < pal.length; i++) {
    const [pr, pg, pb] = rgbOf(pal[i]);
    const dr = r - pr, dg = g - pg, db = b - pb;
    const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11; // same weights as export-heroes
    if (d < bd) { bd = d; bi = i; }
  }
  return pal[bi];
}

// From dead front/back a weapon held along the rig's sagittal axis foreshortens to a stick (a bow
// becomes an edge-on line, a greatsword a rod, a staff two floating blobs), so rows 0 and 2 bake the
// weapon from the same pose seen side-on and re-anchor it on the front-view hand joint. Side and
// diagonal rows keep the true yawed projection.
const WEAPON_ACROSS_ALL = true; // every class weapon needs this at 1 px, not just the bow

// The weapon pass renders with the costume gear pass OFF. rig.js draws the off-hand weapon grip with
// part id 24, which the costume decoration also uses as its default id: without this split the staff
// / greatsword shafts are missing from the sprite.
const WEAPON_MAT = { ...stockMaterial(), id: 'stock-weapon-pass' };

// COSTUMES[cls].palette describes ink/seam/mark as hex strings (they are read by the costume draw
// pass), while paintStock() expects packed ABGR numbers for those three keys: repack them once.
const PACKED_PAL = new Map();
function paintPalette(cls) {
  if (PACKED_PAL.has(cls)) return PACKED_PAL.get(cls);
  const p = COSTUMES[cls].palette;
  const out = { ...p, ink: hex('#000000'), seam: hex('#000000'), mark: hex(p.mark) };
  PACKED_PAL.set(cls, out);
  return out;
}

// Some rig weapons are drawn in two islands (a staff's wood haft stops at the grip ring and the orb
// starts a few rig px further along the axis), which reads as two floating blobs at 1 px. Bridge every
// disconnected island to its nearest neighbour with a straight line of that island's own colour, so a
// baked weapon sprite is always one solid silhouette.
function bridgeWeapon(pix) {
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const list = pix.slice();
  const key = (x, y) => x + ',' + y;
  for (let round = 0; round < 14; round++) {
    const byKey = new Map();
    for (let i = 0; i < list.length; i++) byKey.set(key(list[i].x, list[i].y), i);
    const label = new Int32Array(list.length).fill(-1);
    let ncomp = 0;
    for (let i = 0; i < list.length; i++) {
      if (label[i] >= 0) continue;
      const stack = [i];
      label[i] = ncomp;
      while (stack.length) {
        const j = stack.pop();
        const p = list[j];
        for (const [dx, dy] of N4) {
          const k = byKey.get(key(p.x + dx, p.y + dy));
          if (k === undefined || label[k] >= 0) continue;
          label[k] = ncomp;
          stack.push(k);
        }
      }
      ncomp++;
    }
    if (ncomp <= 1) break;
    // closest pair of pixels living in different islands (no distance cap: a shaft gap must close
    // even when the rig leaves the haft and the head a long way apart at this scale)
    let best = null;
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        if (label[a] === label[b]) continue;
        const d = Math.max(Math.abs(list[a].x - list[b].x), Math.abs(list[a].y - list[b].y));
        if (d <= 40 && (!best || d < best.d)) best = { a, b, d };
      }
    }
    if (!best) break;
    const A = list[best.a], B = list[best.b];
    const c = (A.c >>> 24) === 1 ? A.c : B.c;
    // 4-connected staircase, so the sprite stays one component under the verifier's 8-neighbour test
    let cx = A.x, cy = A.y;
    while (cx !== B.x || cy !== B.y) {
      cx += Math.sign(B.x - cx);
      if (!byKey.has(key(cx, cy))) {
        byKey.set(key(cx, cy), list.length);
        list.push({ x: cx, y: cy, part: PART.weapon, c, col: A.col });
      }
      if (cy !== B.y) {
        cy += Math.sign(B.y - cy);
        if (!byKey.has(key(cx, cy))) {
          byKey.set(key(cx, cy), list.length);
          list.push({ x: cx, y: cy, part: PART.weapon, c, col: A.col });
        }
      }
    }
  }
  return list.sort((p, q) => p.y - q.y || p.x - q.x);
}

function renderCell(cls, dir, action, slot, SC) {
  // body pass first: no weapon in the pose, because the costume's own decoration (hat, stole, mantle,
  // quiver) is drawn through the rig's gear pass with the offWeapon part id as its default
  const pose = poseFor(cls, dir, action, slot, SC, false);
  const r = posed(pose);
  const cols = paintStock(r, paintPalette(cls), COSTUMES[cls].part, COSTUMES[cls].regions);

  // ground the frame exactly like export-heroes: dy = GROUND - r.y1, i.e. the lowest body pixel
  // lands on the cell's ground row (92) for every action and view
  const yShift = -r.y1;

  // one pass over the rig record: every pixel keeps its part id so the gear split below can mask
  // whole limbs, bands and caps instead of repainting the body
  const all = [];
  const box = new Map();
  for (let i = 0; i < r.n; i++) {
    const part = r.part[i], x = r.xs[i], y = r.ys[i] + yShift;
    const px = { x, y, part, c: r.color[i], col: cols[i] };
    all.push(px);
    const b = box.get(part);
    if (!b) box.set(part, { x0: x, y0: y, x1: x, y1: y });
    else {
      if (x < b.x0) b.x0 = x;
      if (y < b.y0) b.y0 = y;
      if (x > b.x1) b.x1 = x;
      if (y > b.y1) b.y1 = y;
    }
  }
  const topFrac = (b, f) => b.y0 + Math.floor((b.y1 - b.y0 + 1) * f);
  const botFrac = (b, f) => b.y1 - Math.floor((b.y1 - b.y0 + 1) * f);
  const headB = box.get(PART.head);
  const faceB = box.get(PART.face);
  // The helmet is a SILHOUETTE decision per class, not a recolour: the great helm and the iron cap
  // cover the whole head and the face, the hoods cover the head (and the sorcerer's hat, which is a
  // costume decoration above the head, sits under a cloth hood), the assassin's piece is a hood plus
  // a lower-face mask, and the priest's is a circlet: a thin band, not a bucket.
  const helmStyle = HELM_STYLE[cls];
  const helmCoversFace = helmStyle === 'great' || helmStyle === 'iron';
  const maskLowerFace = helmStyle === 'hood';
  const circletBrow = headB ? headB.y0 + Math.round((headB.y1 - headB.y0 + 1) * 0.22) : -1e9;
  const headCap = headB ? (helmStyle === 'circlet' ? circletBrow + 1 : headB.y1) : -1e9;
  const faceCap = faceB ? topFrac(faceB, 1) : -1e9;
  const maskCut = faceB ? topFrac(faceB, 0.45) : 1e9;
  // pauldron caps: only the top two rows of each upper arm (a cap, not a sleeve)
  const upperCap = (p) => (box.get(p) ? box.get(p).y0 + 1 : -1e9);
  const pelvisCap = box.get(PART.pelvis) ? topFrac(box.get(PART.pelvis), 0.45) : -1e9;
  // Armour is a shoulder/waist piece, not a bib: only the paladin gets a full-plate torso; every
  // other class keeps the lower half of the torso as costume cloth (tunic, robe, stole).
  const chestCap = box.get(PART.chest) ? topFrac(box.get(PART.chest), cls === 'paladin' ? 1 : 0.72) : 1e9;
  const shinCut = (p) => (box.get(p) ? botFrac(box.get(p), 0.2) : 1e9);
  const foreCut = (p) => (box.get(p) ? botFrac(box.get(p), 0.45) : 1e9);

  const layers = { body: [], head: [], gear: Object.fromEntries(GEAR_SLOTS.map((s) => [s, []])), weapon: [] };

  for (const px of all) {
    const p = px.part;
    // costume decoration is drawn without a body part id (part 0) or with the rig's offWeapon default
    // id; keep it with the body/head it belongs to, and only the ink outline stays with the rim pass
    if (p === 0 || p === PART.weapon || p === PART.offWeapon) {
      // the assassin's off-hand dagger also carries the offWeapon id: it is a real weapon, not costume
      // decoration, and the doll shows a single visible dagger -- drop it from the body render
      if (p === PART.offWeapon && cls === 'assassin') continue;
      if (p === 0 && (px.c >>> 0) === MARK_INK) { layers.body.push({ x: px.x, y: px.y, c: px.col }); continue; }
      if (headB && px.y <= headB.y1 + 3) {
        layers.head.push({ x: px.x, y: px.y, c: px.col });
        // the helmet covers the costume's own headgear too: on the sorcerer/archer/assassin that is
        // the whole hat/hood (decorations above the skull), on the priest only the circlet band
        if (helmStyle === 'circlet' ? px.y <= headCap && px.y >= circletBrow - 1 : true) {
          // its ramp rank comes from the pixel's luminance (the decoration carries no rig tone)
          const lum = 0.3 * ((px.col >> 16) & 255) + 0.59 * ((px.col >> 8) & 255) + 0.11 * (px.col & 255);
          const rank = lum >= 150 ? 0 : lum >= 90 ? 1 : lum >= 40 ? 2 : 3;
          layers.gear.helm.push({ x: px.x, y: px.y, part: PART.head, c: (0x01000000 | rank) >>> 0 });
        }
      } else layers.body.push({ x: px.x, y: px.y, c: px.col });
      continue;
    }
    if (p === PART.head) {
      layers.head.push(px); // hair/hood/face are always under the helmet
      if (px.y <= headCap) layers.gear.helm.push(px);
      continue;
    }
    if (p === PART.face) {
      layers.head.push(px);
      if (helmCoversFace && px.y <= faceCap) layers.gear.helm.push(px);
      // the assassin's piece is a lower-face mask: the upper face stays visible under the hood
      if (maskLowerFace && px.y >= maskCut) layers.gear.helm.push(px);
      continue;
    }
    layers.body.push({ x: px.x, y: px.y, c: px.col });
    if (p === PART.chest || p === PART.neck) {
      if (p === PART.neck || px.y <= chestCap) layers.gear.chest.push(px);
      // the belt also takes the lowest sliver of the chest, so a robe class (priest) still gets a
      // readable band instead of a 1 px waist line; the claim pass gives belt priority over chest
      if (p === PART.chest && box.get(PART.chest) && px.y >= botFrac(box.get(PART.chest), 0.1)) layers.gear.belt.push(px);
    }
    else if (p === PART.upperN || p === PART.upperF) { if (px.y <= upperCap(p)) layers.gear.chest.push(px); }
    else if (p === PART.waist) layers.gear.belt.push(px);
    else if (p === PART.pelvis) { if (px.y <= pelvisCap) layers.gear.belt.push(px); }
    else if (p === PART.thighN || p === PART.kneeN || p === PART.thighF || p === PART.kneeF) layers.gear.legs.push(px);
    else if (p === PART.shinN || p === PART.shinF) {
      // the shin's bottom fifth is the boot cuff: it must belong to exactly one piece, otherwise the
      // two ramps fight over the same pixels
      if (px.y >= shinCut(p)) layers.gear.boots.push(px);
      else layers.gear.legs.push(px);
    } else if (p === PART.footN || p === PART.footF) layers.gear.boots.push(px);
    else if (p === PART.foreN || p === PART.foreF) { if (px.y >= foreCut(p)) layers.gear.gloves.push(px); }
    else if (p === PART.handN || p === PART.handF) layers.gear.gloves.push(px);
  }

  // The costume's own decoration (sash, harness, stole, hood trim) must stay readable on top of the
  // armour: a worn piece recolours the body part it owns, but it must not erase the garment's strap
  // pixels -- those are cut out of every gear layer and stay in the body/head layer below.
  const decoKeys = new Set();
  for (const px of all) {
    const p = px.part;
    if (p === 0 || p === PART.weapon || p === PART.offWeapon) decoKeys.add(px.x + ',' + px.y);
  }
  if (decoKeys.size) {
    // the helmet is the one piece that also covers the costume's own headgear (the sorcerer's hat,
    // the archer's hood brim) -- a worn helmet sits on top of it, so those pixels stay in the helm
    // layer. The sash/harness/stole pixels on the torso are still cut out of every piece.
    for (const slot of GEAR_SLOTS) {
      if (slot === 'helm') continue;
      layers.gear[slot] = layers.gear[slot].filter((p) => !decoKeys.has(p.x + ',' + p.y));
    }
  }
  // near and far limbs overlap in screen space, so one pixel can be claimed by two pieces (a near
  // shin's cuff and a far shin's leg, say). Resolve it once, front to back: every body pixel belongs
  // to at most one piece, so the six ramps never fight over the same pixel.
  const claimed = new Set();
  for (const slot of ['helm', 'belt', 'chest', 'legs', 'boots', 'gloves']) {
    const keepList = [];
    for (const p of layers.gear[slot]) {
      const k = p.x + ',' + p.y;
      if (claimed.has(k)) continue;
      claimed.add(k);
      keepList.push(p);
    }
    layers.gear[slot] = keepList;
  }

  // hero-sheet post pass: quantise to the class palette, drop lone specks, ink the bright silhouette
  // edge (export-heroes.mjs quantise/dropSpecks/inkRim). Doing it before the split keeps the bare
  // body + head composite identical to the installed hero cell.
  const pal = quantPalette(cls);
  const spot = new Map();
  for (const px of all) spot.set(px.x + ',' + px.y, px);
  for (const px of all) px.col = nearestPal(px.col, pal);
  const drop = new Set();
  for (const px of all) {
    let n = 0;
    for (let dy = -1; dy <= 1 && !n; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      if (spot.has(px.x + dx + ',' + (px.y + dy))) { n = 1; break; }
    }
    if (!n) drop.add(px);
  }
  // The installed hero sheets bake their ink as pure black (#000000), even though the class
  // palettes list ink as #0e0c14; matching the sheets (not the palette) is what makes the bare
  // doll cell pixel-identical to the hero idle frame. Barely visible, but it is 25% of the pixels.
  const inkCol = hex('#000000');
  for (const px of all) {
    if (drop.has(px)) continue;
    if (lum(px.col) < 92) continue;
    let edge = false;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      if (!spot.has(px.x + dx + ',' + (px.y + dy))) { edge = true; break; }
    }
    if (edge) px.col = inkCol;
  }
  for (const list of [layers.body, layers.head, ...GEAR_SLOTS.map((s) => layers.gear[s])]) {
    if (!list.length) continue;
    const keep = list.filter((p) => { const o = spot.get(p.x + ',' + p.y); return !(o && drop.has(o)); });
    list.length = 0;
    list.push(...keep);
  }

  // the rig keeps its own 1 px ink outline as part-0 pixels; the hero sheets show it, so every
  // sliced layer carries the outline pixels touching its own silhouette (same as the hero render)
  const rim = (list, rec, shift = 0) => {
    const set = new Set(list.map((p) => p.x + ',' + p.y));
    const out = list.slice();
    if (!set.size) return out;
    for (let i = 0; i < rec.n; i++) {
      if (rec.part[i] !== 0 || (rec.color[i] >>> 0) !== MARK_INK) continue;
      const x = rec.xs[i], y = rec.ys[i] + shift;
      if (set.has(x + 1 + ',' + y) || set.has(x - 1 + ',' + y) || set.has(x + ',' + (y + 1)) || set.has(x + ',' + (y - 1))) {
        out.push({ x, y, part: 0, c: MARK_INK, col: inkCol });
      }
    }
    return out.sort((a, b) => a.y - b.y || a.x - b.x);
  };

  // weapon pass: rendered with the costume gear pass OFF, so every part 23/24 pixel in this render
  // is a real weapon pixel (the costume decoration also uses part 24, which is why the body pass
  // above owns the decoration and this pass owns the weapon). Both hands' weapon pixels are taken:
  // the staff/greatsword shafts are drawn with the off-hand part id by the rig.
  const wpose = poseFor(cls, dir, action, slot, SC, true);
  // the rig draws the off-hand grip of a two-handed weapon (staff haft, greatsword shaft) with part
  // 24; the assassin's off-hand dagger is also part 24 but the doll shows a single visible dagger, so
  // that class keeps only the near-hand weapon
  const weaponParts = (p) => p === PART.weapon || (p === PART.offWeapon && cls !== 'assassin');
  // render only the weapon parts of one pose; the returned hand joint lets a cheat projection be
  // re-anchored on the pose's real hand position
  const renderWeapon = (pose) => {
    setMaterial(WEAPON_MAT);
    setGearPass(null);
    const rr = posed(pose);
    const pix = [];
    for (let i = 0; i < rr.n; i++) {
      if (!weaponParts(rr.part[i])) continue;
      pix.push({ x: rr.xs[i], y: rr.ys[i] + yShift, part: rr.part[i], c: rr.color[i] });
    }
    return { pix, r: rr, hand: skeleton(pose).joints.handN };
  };
  const trueHand = skeleton(wpose).joints.handN;
  // score a candidate projection by its longest visible axis: a weapon that foreshortens below ~16 px
  // stops reading at 1 px (that is what turned the dagger into a droplet and the sword into a shard)
  const extent = (pix) => {
    if (!pix.length) return 0;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pix) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    return Math.max(x1 - x0 + 1, y1 - y0 + 1);
  };
  const asSel = (s) => ({ pix: s.pix, r: s.r, dx: Math.round(trueHand[0] - s.hand[0]), dy: Math.round(trueHand[1] - s.hand[1]) });
  const truth = renderWeapon(wpose);
  // front/back rows use the side-on bake (a sagittal weapon foreshortens to a stick there); other rows
  // keep the true yawed projection
  let wsel = { pix: truth.pix, r: truth.r, dx: 0, dy: 0 };
  if (WEAPON_ACROSS_ALL && (dir === 0 || dir === 2)) wsel = asSel(renderWeapon({ ...wpose, yaw: 0 }));
  if (extent(wsel.pix) < 16) {
    // degenerate projection: sweep a few yaw offsets toward the camera and keep the most legible one,
    // re-anchored on the pose's real hand joint
    let bestScore = extent(wsel.pix);
    for (const off of [0.7, -0.7, 1.2, -1.2]) {
      const t = asSel(renderWeapon({ ...wpose, yaw: (wpose.yaw || 0) + off }));
      const sc = extent(t.pix);
      if (sc > bestScore + 2) { wsel = t; bestScore = sc; }
    }
  }
  if (!wsel.pix.length || extent(wsel.pix) < 5) {
    // some extreme yaw/pose combinations push a very short weapon (the assassin's dagger) entirely
    // behind the body and the weapon pass comes back empty or as a single speck; fall back to a
    // readable rest projection (same view, then side-on) and re-anchor it on this pose's hand so the
    // slot never renders an invisible weapon
    for (const [rdir, raction, rslot] of [[dir, 'idle', 0], [1, 'idle', 0], [2, 'idle', 0]]) {
      const restPose = poseFor(cls, rdir, raction, rslot, SC, true);
      const rest = renderWeapon(restPose);
      if (rest.pix.length && extent(rest.pix) >= 5) {
        const restHand = skeleton(restPose).joints.handN;
        wsel = {
          pix: rest.pix,
          r: rest.r,
          dx: Math.round(trueHand[0] - restHand[0]),
          dy: Math.round(trueHand[1] - restHand[1]),
        };
        break;
      }
    }
  }
  const wshift = wsel.dx || wsel.dy ? { dx: wsel.dx, dy: wsel.dy } : { dx: 0, dy: 0 };
  const weapon = rim(wsel.pix, wsel.r, yShift).map((p) => ({ x: p.x + wshift.dx, y: p.y + wshift.dy, part: p.part, c: p.c }));
  layers.weapon = bridgeWeapon(weapon);
  setMaterial(stockMaterial());
  setGearPass((ctx) => COSTUMES[cls].draw(ctx));
  layers.head = rim(layers.head, r, yShift);
  for (const slot of GEAR_SLOTS) layers.gear[slot] = rim(layers.gear[slot], r, yShift);
  return layers;
}

// ---------------------------------------------------------------------------------------------
// gear: recolour + the donor's procedural ornament pass
// ---------------------------------------------------------------------------------------------

// Per-class kit: the six pieces are NOT one shared steel set. Each class authors its own base colour
// per slot, so a mixed set (e.g. an archer hood with paladin greaves) still reads as that class's
// material family: paladin steel+gold, berserker iron+brass+fur, archer leather green+quilted,
// assassin near-black leather, sorcerer cloth violet+gold thread, priest ivory cloth+gold.
const GEAR_KIT = {
  // Value ladder per class: helm lightest -> gloves -> chest -> belt -> legs -> boots darkest, all
  // inside the class's hue family. That is what keeps the six pieces apart at 1x while a mixed set
  // still reads as one class's kit: paladin steel+gold, berserker iron+brass+fur, archer leather
  // green+quilted, assassin black leather (blue-grey ladder), sorcerer violet cloth+gold thread,
  // priest ivory cloth+gold.
  paladin: { helm: '#d8e4f0', chest: '#78889e', belt: '#d9b34a', legs: '#505c6e', boots: '#303642', gloves: '#aab8cc', trim: '#e6c258', accent: '#fff2c0', plate: true },
  berserker: { helm: '#b0bccc', chest: '#8a6a4a', belt: '#b08b3c', legs: '#4e3a26', boots: '#2e2214', gloves: '#c99a5e', trim: '#c9a24a', accent: '#e8dcc0', fur: '#5a3f24' },
  archer: { helm: '#9fb46f', chest: '#4e5f36', belt: '#b08b46', legs: '#3a4726', boots: '#5e3b1e', gloves: '#6f8449', trim: '#9db063', accent: '#c8d68a', cloth: true },
  assassin: { helm: '#9aa8bc', chest: '#4e586a', belt: '#6e6a5e', legs: '#3a4356', boots: '#2a211a', gloves: '#7a8496', trim: '#8b93a6', accent: '#b6bfd0', cloth: true },
  sorcerer: { helm: '#c3b0f0', chest: '#6b4fa4', belt: '#caa94e', legs: '#453072', boots: '#2d2340', gloves: '#9c7ad0', trim: '#e8cf7a', accent: '#c9b2f0', cloth: true },
  priest: { helm: '#f6efdb', chest: '#b8ab90', belt: '#d4b45c', legs: '#8f8570', boots: '#63584a', gloves: '#d8cbaf', trim: '#e6c96a', accent: '#fff4cc', cloth: true },
};


// Each piece's ramp is anchored on the costume region it covers (so the worn look keeps the
// class's own hue) and only then pulled 30% toward the class kit's own base colour.
const GEAR_ANCHOR = { helm: PART.head, chest: PART.chest, belt: PART.waist, legs: PART.thighN, boots: PART.footN, gloves: PART.handN };
const REGION_FALLBACK = ['clothes', 'robe', 'vest', 'tunic', 'wrap', 'leather', 'fur', 'trouser', 'steel', 'ivory'];

function anchorColour(cls, part) {
  const pal = COSTUMES[cls].palette;
  let name = COSTUMES[cls].part[part];
  if (!name || name === 'skin' || name === 'hair' || name === 'gold') name = REGION_FALLBACK.find((n) => pal[n]) ?? name;
  const ramp = pal[name];
  return ramp ? ramp.shell[1] : null;
}

function gearRamps(cls) {
  const kit = GEAR_KIT[cls];
  const ramps = {}, dark = {}, anchors = {}, bright = {};
  for (const slot of GEAR_SLOTS) {
    const anchor = anchorColour(cls, GEAR_ANCHOR[slot]);
    const base = anchor == null ? hex(kit[slot]) : mix(hex(kit[slot]), anchor, 0.18);
    anchors[slot] = base;
    ramps[slot] = rampOf(base);
    dark[slot] = rampOf(mix(base, BLACK, 0.2));
    // a one-step brighter rank for the top edge (helmet crown, plate neckline, knee highlight)
    bright[slot] = rampOf(mix(base, hex('#ffffff'), 0.3));
  }
  return {
    ramps,
    dark,
    bright,
    anchors,
    kit,
    trim: rampOf(hex(kit.trim)),
    accent: rampOf(hex(kit.accent)),
    fur: rampOf(hex(kit.fur ?? '#6b4a2a')),
    ink: hex('#000000'),
  };
}

// which ramp a gear pixel uses, by the body part it was cut from (pauldrons, knee cops and boot
// cuffs read as different materials from the cloth under them)
function rampForPart(slot, part, gc) {
  switch (slot) {
    case 'chest': return part === PART.upperN || part === PART.upperF ? gc.trim : gc.ramps.chest;
    case 'helm': return gc.ramps.helm;
    case 'legs': return gc.ramps.legs;
    case 'boots': return gc.ramps.boots;
    case 'gloves': return gc.ramps.gloves;
    default: return gc.ramps[slot];
  }
}

function rankOf(raw) {
  const a = raw >>> 24;
  if (a === 1) return { rank: raw & 0xff, core: false };
  if (a === 2) return { rank: raw & 0xff, core: true };
  if (a === 5 || a === 6) return { rank: raw & 0xff, core: a === 6 };
  return null;
}

function facingOf(dir) {
  const y = YAW[dir];
  if (Math.abs(y - Math.PI / 2) < 0.5) return 'down';
  if (Math.abs(y + Math.PI / 2) < 0.5) return 'up';
  return 'right';
}

function gearFrameColours(cls, slot, dir, pix, gc) {
  const cells = new Map();
  for (const p of pix) {
    const rk = rankOf(p.c);
    let col;
    if (!rk) col = (p.c >>> 0) === MARK_INK ? gc.ink : (p.c >>> 0) === MARK_SEAM ? hex('#2a2b33') : p.col;
    else {
      const ramp = rampForPart(slot, p.part, gc);
      col = rk.core ? ramp.core[Math.min(2, rk.rank)] : ramp.shell[Math.min(3, rk.rank)];
    }
    cells.set(p.x + ',' + p.y, { x: p.x, y: p.y, col });
  }

  const list = [...cells.values()];
  const set = (x, y, c) => {
    const r = cells.get(x + ',' + y);
    if (r && (r.c >>> 0) !== MARK_INK) r.col = c;
  };
  const band = (y0, y1, c) => { for (const r of list) if (r.y >= y0 && r.y <= y1) r.col = c; };

  if (list.length) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of list) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    const w = maxX - minX + 1, h = maxY - minY + 1;
    const trim = gc.trim.shell[0], trim2 = gc.trim.shell[1], accent = gc.accent.shell[0], dark = gc.ink;
    const cx = Math.round((minX + maxX) / 2);

    if (slot === 'helm') {
      const style = HELM_STYLE[cls];
      const tri0 = gc.trim.shell[0], tri1 = gc.trim.shell[1], acc = gc.accent.shell[0], ink = gc.ink;
      if (style === 'circlet') {
        // priest: a gold circlet over the ivory veil -- a band, never a skullcap
        band(minY, minY, gc.bright.helm.shell[0]);
        if (maxY > minY) band(maxY - 1, maxY - 1, gc.bright.helm.shell[0]);
        band(maxY, maxY, tri0);
        set(cx, maxY, acc);
        set(cx - 1, maxY, tri1);
        set(cx + 1, maxY, tri1);
      } else if (style === 'cloth') {
        // sorcerer: cloth hood with a gold thread band and a pointed crown (no steel anywhere)
        band(minY, minY, gc.bright.helm.shell[0]);
        const brow = minY + Math.max(1, Math.round(h * 0.36));
        band(brow, brow, tri0);
        band(brow + 1, brow + 1, tri1);
        list.push({ x: cx, y: minY - 1, col: gc.bright.helm.shell[0] });
        list.push({ x: cx, y: minY - 2, col: acc });
      } else if (style === 'great') {
        // paladin: great helm -- lit crown, gold brow band, gold central ridge, dark visor slit, plume
        for (const p of list) if (p.y === minY && Math.abs(p.x - cx) >= 2) p.col = gc.bright.helm.shell[0];
        const brow = minY + Math.max(1, Math.round(h * 0.3));
        band(brow, brow + 1, tri0);
        for (let y = brow; y <= maxY; y++) set(cx, y, tri1);
        const slit = minY + Math.round(h * 0.55);
        for (let x = minX + 2; x <= maxX - 2; x++) { set(x, slit, ink); set(x, slit + 1, ink); }
        list.push({ x: cx, y: minY - 1, col: tri0 });
        list.push({ x: cx, y: minY - 2, col: acc });
      } else if (style === 'iron') {
        // berserker: iron cap with a fur brim and two short horns
        for (const p of list) if (p.y === minY) p.col = gc.bright.helm.shell[0];
        band(maxY - 1, maxY, gc.fur.shell[1]);
        for (const p of list) if (p.y === maxY) p.col = gc.fur.shell[2];
        list.push({ x: cx - 4, y: minY - 1, col: gc.bright.helm.shell[1] });
        list.push({ x: cx - 4, y: minY - 2, col: gc.bright.helm.shell[2] });
        list.push({ x: cx + 4, y: minY - 1, col: gc.bright.helm.shell[1] });
        list.push({ x: cx + 4, y: minY - 2, col: gc.bright.helm.shell[2] });
      } else if (style === 'leather') {
        // archer: leather hood with a darker brim and a lit crown
        for (const p of list) if (p.y === minY) p.col = gc.bright.helm.shell[0];
        band(maxY - 1, maxY, gc.dark.helm.shell[1]);
        list.push({ x: cx, y: minY - 1, col: gc.bright.helm.shell[1] });
      } else {
        // assassin: near-black hood plus a lower-face mask with two lit eye slits
        for (const p of list) if (p.y === minY) p.col = gc.ramps.helm.shell[1];
        band(maxY - 2, maxY, gc.dark.helm.shell[2]);
        const eye = minY + Math.round(h * 0.62);
        set(cx - 2, eye, acc);
        set(cx + 2, eye, acc);
      }
      band(maxY, maxY, style === 'iron' ? gc.fur.shell[2] : gc.dark.helm.shell[2]); // gorget / rim
    } else if (slot === 'chest') {
      // plate with a lit neckline: bright top row, class trim right under it
      band(minY, minY, gc.bright.chest.shell[0]); // lit neckline
      band(minY + 1, minY + 1, trim); // yoke
      const cy = minY + Math.round(h * 0.5);
      if (cls === 'paladin') {
        for (let y = cy - 1; y <= cy + 1; y++) set(cx, y, accent); // paladin heraldic cross
        for (let x = cx - 1; x <= cx + 1; x++) set(x, cy, accent);
      } else {
        set(cx, cy, accent); // 1px clasp
        set(cx, cy + 1, accent);
      }
      band(maxY, maxY, gc.ramps.chest.shell[3]); // hem
    } else if (slot === 'belt') {
      band(minY, minY, trim);
      set(cx, minY + 1, accent); // buckle
      set(cx, minY + 2, accent);
      band(maxY, maxY, gc.ramps.belt.shell[2]); // leather band under the brass
    } else if (slot === 'legs') {
      const ky = minY + Math.round(h * 0.42);
      band(ky - 1, ky - 1, gc.bright.legs.shell[0]); // knee highlight
      band(ky, ky, trim); // knee cop
      for (const p of list) if (p.y >= maxY) p.col = gc.ramps.legs.shell[3];
    } else if (slot === 'boots') {
      band(minY, minY, gc.bright.boots.shell[0]); // lit cuff
      for (const p of list) {
        if (p.y >= maxY - 1 && (p.x <= minX + 2 || p.x >= maxX - 2)) p.col = accent; // toe caps
      }
    } else if (slot === 'gloves') {
      band(minY, minY, gc.bright.gloves.shell[0]); // bracer cuff
      const knuckle = Math.round(h * 0.55);
      for (let x = minX + 2; x <= maxX - 2; x++) set(x, minY + knuckle, trim2); // knuckle trim
    }
  }
  const out = new Uint32Array(list.length);
  for (let i = 0; i < list.length; i++) out[i] = list[i].col;
  return { pix: list, cols: out };
}

// weapon recolouring (base / _fine share one geometry)
function weaponColours(cls, pix, fine) {
  const baseRamp = cls === 'archer' ? WEAPON_WOOD_RAMP : WEAPON_STEEL_RAMP;
  const fineRamp = (cls === 'archer' ? FINE_WOOD : FINE_STEEL).map(hex);
  const stringCol = hex(STRING_HEX), fineString = hex(FINE_STRING);
  const cols = new Uint32Array(pix.length);
  for (let i = 0; i < pix.length; i++) {
    const c = pix[i].c >>> 0;
    if (c === MARK_INK) cols[i] = hex('#0e0c14');
    else if (c === MARK_SEAM) cols[i] = hex('#2a2b33');
    else if (c === stringCol) cols[i] = fine ? fineString : stringCol;
    else if ((c >>> 24) === 1) {
      const rank = Math.min(3, c & 0xff);
      cols[i] = fine ? fineRamp[rank] : baseRamp[rank];
    } else {
      const idx = baseRamp.indexOf(c);
      cols[i] = fine ? (idx >= 0 ? fineRamp[idx] : fineRamp[1]) : (idx >= 0 ? baseRamp[idx] : c);
    }
  }
  return cols;
}

// ---------------------------------------------------------------------------------------------
// indexed PNG writer (palette + tRNS) 鈥攌eeps the pack far smaller than RGBA
// ---------------------------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodeIndexedPNG(w, h, idx, palette) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 3; // indexed colour
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const plte = Buffer.alloc(palette.length * 3);
  const trns = Buffer.alloc(palette.length);
  for (let i = 0; i < palette.length; i++) {
    plte[i * 3] = palette[i][0];
    plte[i * 3 + 1] = palette[i][1];
    plte[i * 3 + 2] = palette[i][2];
    trns[i] = palette[i][3];
  }
  const rows = Buffer.alloc(h * (w + 1));
  for (let y = 0; y < h; y++) {
    rows[y * (w + 1)] = 0; // filter: none
    for (let x = 0; x < w; x++) rows[y * (w + 1) + 1 + x] = idx[y * w + x];
  }
  const idat = zlib.deflateSync(rows, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    chunk('tRNS', trns),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------------------------
// scale solver: the pack must stand exactly as tall as the installed hero sheets
// ---------------------------------------------------------------------------------------------

function heroHeight(cls) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'heroes', `${cls}.json`), 'utf8'));
    if (Number.isFinite(j.heroHeight)) return j.heroHeight;
  } catch { /* fall through */ }
  return 72;
}

function solveScale(cls) {
  const want = heroHeight(cls);
  const idleRest = { ...idle4.right, ...(STANCE[cls] ?? {}) };
  const heightAt = (sc) => {
    const p = { ...STAND, ...idleRest };
    p.weapon = STOCK_HOLD[cls].weapon;
    for (const k of POSE_COORDS) if (typeof p[k] === 'number') p[k] *= sc;
    p.scale = sc;
    p.scaleWeapon = STOCK_HOLD[cls].scaleWeapon ?? WSC;
    p.yaw = 0;
    const r = posed(p);
    return r.y1 - r.y0 + 1;
  };
  let lo = 1.6, hi = 2.4;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (heightAt(mid) < want) lo = mid; else hi = mid;
  }
  return Math.round(((lo + hi) / 2) * 1000) / 1000;
}

// ---------------------------------------------------------------------------------------------
// pass 1: render every frame of every class
// ---------------------------------------------------------------------------------------------

function frameKey(action, dir, slot) { return `${action}|${dir}|${slot}`; }

function bboxOf(pixList) {
  if (!pixList.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pixList) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
}

function buildClass(cls) {
  const SC = solveScale(cls);
  const gc = gearRamps(cls);
  const frames = new Map();
  const actions = ['idle', 'walk', 'attack', `attack.${WEAPON_TYPE[cls]}`, 'skill', 'hurt'];
  let count = 0;
  for (const action of actions) {
    const a = ACTION_BY_KEY.get(action);
    for (let dir = 0; dir < 8; dir++) {
      for (let slot = 0; slot < a.slots; slot++) {
        const layers = renderCell(cls, dir, action, slot, SC);
        const key = frameKey(action, dir, slot);
        const body = layers.body;
        const head = layers.head;
        const gear = {};
        for (const s of GEAR_SLOTS) gear[s] = layers.gear[s];
        const weaponPix = layers.weapon;
        frames.set(key, {
          body: { pix: body, box: bboxOf(body) },
          head: { pix: head, box: bboxOf(head) },
          gear: Object.fromEntries(GEAR_SLOTS.map((s) => [s, { pix: gear[s], box: bboxOf(gear[s]) }])),
          weapon: { pix: weaponPix, box: bboxOf(weaponPix) },
        });
        count++;
      }
    }
  }
  return { cls, SC, gc, frames, count, actions };
}

// ---------------------------------------------------------------------------------------------
// layout: one shared frame layout so every class atlas is a drop-in for the same rows
// ---------------------------------------------------------------------------------------------

const BLOCKS = ['body', 'head', ...GEAR_SLOTS, 'weapon_base', 'weapon_fine'];

function frameList() {
  const out = [];
  for (const action of ACTION_ORDER) {
    const a = ACTION_BY_KEY.get(action);
    for (let dir = 0; dir < 8; dir++) for (let slot = 0; slot < a.slots; slot++) out.push(frameKey(action, dir, slot));
  }
  return out;
}

function layerKeyOf(block) {
  if (block === 'weapon_base' || block === 'weapon_fine') return 'weapon';
  return block;
}

function unionBox(classes, block, key) {
  const lk = layerKeyOf(block);
  let box = null;
  for (const c of classes) {
    const f = c.frames.get(key);
    if (!f) continue;
    const b = lk === 'body' ? f.body.box : lk === 'head' ? f.head.box : lk === 'weapon' ? f.weapon.box : f.gear[block].box;
    if (!b) continue;
    box = box
      ? { x0: Math.min(box.x0, b.x0), y0: Math.min(box.y0, b.y0), x1: Math.max(box.x1, b.x1), y1: Math.max(box.y1, b.y1) }
      : { ...b };
  }
  if (!box) box = { x0: 0, y0: -1, x1: 0, y1: -1 };
  return { x0: box.x0, y0: box.y0, w: box.x1 - box.x0 + 1, h: box.y1 - box.y0 + 1 };
}

// content signature of one block/key across all classes: identical signatures are stored once and
// every seb frame that needs them points at the same atlas cell (no duplicated sprite cells).
function cellSignature(classes, block, key) {
  const lk = layerKeyOf(block);
  const parts = [];
  for (const c of classes) {
    const f = c.frames.get(key);
    if (!f) { parts.push('-'); continue; }
    const layer = lk === 'body' ? f.body : lk === 'head' ? f.head : lk === 'weapon' ? f.weapon : f.gear[block];
    if (!layer.pix.length) { parts.push('-'); continue; }
    const list = layer.pix
      .map((p) => `${p.x},${p.y},${(p.c >>> 0).toString(36)}`)
      .sort()
      .join(';');
    parts.push(list);
  }
  return parts.join('|');
}

function buildLayout(classes) {
  const keys = frameList();
  const blockY = {};
  const meta = new Map();
  const dedupe = {};
  let y = 1;
  let maxX = 1;
  for (const block of BLOCKS) {
    blockY[block] = y;
    const sigs = new Map();
    const rects = new Map();
    dedupe[block] = 0;
    for (const key of keys) {
      const sig = cellSignature(classes, block, key);
      if (sigs.has(sig)) { rects.set(key, sigs.get(sig)); dedupe[block]++; }
      else { sigs.set(sig, key); rects.set(key, key); }
    }
    const map = new Map();
    let cx = 1, cy = y, rowH = 0;
    for (const key of keys) {
      if (rects.get(key) !== key) continue; // alias of an earlier identical cell
      const box = unionBox(classes, block, key);
      if (cx + box.w + 1 > CELL_W) { cx = 1; cy += rowH + 1; rowH = 0; }
      map.set(key, [cx, cy - blockY[block], box.w, box.h, box.x0, box.y0]);
      cx += box.w + 1;
      rowH = Math.max(rowH, box.h);
      maxX = Math.max(maxX, cx);
    }
    for (const key of keys) {
      const target = rects.get(key);
      if (target !== key) map.set(key, map.get(target));
    }
    y = cy + rowH + 1;
    meta.set(block, map);
  }
  const blankY = y;
  y += 2;
  return { w: Math.max(maxX, 4), h: y, blockY, meta, blankY, keys, dedupe };
}

// ---------------------------------------------------------------------------------------------
// pass 2: write the per-class atlases and the json
// ---------------------------------------------------------------------------------------------

function toQuad(box) {
  // sprite tuple helper: [u,v,w,h,tx,ty,ru,rv]
  return (m) => [m[0], m[1], m[2], m[3], m[4], m[5], 0, 0];
}

function writeAtlas(clsData, layout) {
  const { cls, gc } = clsData;
  const W = layout.w, H = layout.h;
  const img = new Uint8Array(W * H);
  const palette = [[0, 0, 0, 0]];
  const index = new Map();
  const colorIdx = (c) => {
    if (!index.has(c)) {
      const [r, g, b] = rgbOf(c);
      palette.push([r, g, b, (c >>> 24) || 255]);
      index.set(c, palette.length - 1);
    }
    return index.get(c);
  };

  const blit = (block, key, pix, cols) => {
    const m = layout.meta.get(block).get(key);
    if (!m) return;
    const [u, v, , , bx, by] = m;
    const baseY = layout.blockY[block];
    for (let i = 0; i < pix.length; i++) {
      const X = u + (pix[i].x - bx);
      const Y = baseY + v + (pix[i].y - by);
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      img[Y * W + X] = colorIdx(cols[i]);
    }
  };

  for (const key of layout.keys) {
    const f = clsData.frames.get(key);
    if (!f) continue;
    const dir = Number(key.split('|')[1]);

    blit('body', key, f.body.pix, new Uint32Array(f.body.pix.map((p) => p.c)));
    blit('head', key, f.head.pix, new Uint32Array(f.head.pix.map((p) => p.col)));
    for (const slot of GEAR_SLOTS) {
      const g = f.gear[slot];
      const { pix: outPix, cols } = gearFrameColours(cls, slot, dir, g.pix, gc);
      blit(slot, key, outPix, cols);
    }
    const wbase = weaponColours(cls, f.weapon.pix, false);
    const wfine = weaponColours(cls, f.weapon.pix, true);
    blit('weapon_base', key, f.weapon.pix, wbase);
    blit('weapon_fine', key, f.weapon.pix, wfine);
  }

  const png = encodeIndexedPNG(W, H, img, palette);
  fs.writeFileSync(path.join(OUT_DIR, `${cls}.png`), png);
  return { png: png.length, colours: palette.length };
}

function buildJson(classes, layout, stats) {
  const skins = { body: {}, hand: {}, head: {}, weapon: {} };
  for (const slot of GEAR_SLOTS) skins[slot] = {};
  for (const c of classes) {
    const cls = c.cls;
    skins.body[cls] = { img: cls, x: 0, y: layout.blockY.body };
    skins.head[cls] = { img: cls, x: 0, y: layout.blockY.head };
    skins.hand[cls] = { img: cls, x: 0, y: layout.blankY };
    for (const slot of GEAR_SLOTS) skins[slot][cls] = { img: cls, x: 0, y: layout.blockY[slot] };
    skins.weapon[cls] = { img: cls, x: 0, y: layout.blockY.weapon_base };
    skins.weapon[`${cls}_fine`] = { img: cls, x: 0, y: layout.blockY.weapon_fine };
  }

  const sebs = {};
  sebs['hand/std'] = { max: 8, frames: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i, [0, 0, 1, 1, 0, 0, 0, 0]])) };
  for (const action of ACTION_ORDER) {
    const a = ACTION_BY_KEY.get(action);
    for (let dir = 0; dir < 8; dir++) {
      for (let slot = 0; slot < a.slots; slot++) {
        const key = frameKey(action, dir, slot);
        const quad = (block) => toQuad(null)(layout.meta.get(block).get(key));
        sebs[`b/${action}/${dir}`] = sebs[`b/${action}/${dir}`] || { max: a.slots, frames: {} };
        sebs[`b/${action}/${dir}`].frames[slot] = quad('body');
        sebs[`h/${action}/${dir}`] = sebs[`h/${action}/${dir}`] || { max: a.slots, frames: {} };
        sebs[`h/${action}/${dir}`].frames[slot] = quad('head');
        for (const g of GEAR_SLOTS) {
          const k = `g/${g}/${action}/${dir}`;
          sebs[k] = sebs[k] || { max: a.slots, frames: {} };
          sebs[k].frames[slot] = quad(g);
        }
        const w = `w/${action}/${dir}`;
        sebs[w] = sebs[w] || { max: a.slots * 2, frames: {} };
        sebs[w].frames[slot * 2] = quad('weapon_base');
      }
    }
  }

  const ORDER = ['body', 'hand', 'legs', 'boots', 'belt', 'chest', 'gloves', 'head', 'helm', 'weapon'];
  const actions = {};
  for (const a of ACTIONS) {
    const rows = [];
    for (let dir = 0; dir < 8; dir++) {
      const parts = {
        body: { seb: `b/${a.key}/${dir}` },
        hand: { seb: 'hand/std' },
        head: { seb: `h/${a.key}/${dir}` },
        weapon: {
          seb: Array.from({ length: a.slots }, () => `w/${a.key}/${dir}`),
          sebF: Array.from({ length: a.slots }, (_, i) => i),
          show: Array.from({ length: a.slots }, () => 1),
        },
      };
      for (const g of GEAR_SLOTS) parts[g] = { seb: `g/${g}/${a.key}/${dir}` };
      rows.push({ parts, order: ORDER });
    }
    const entry = { af: a.af, loop: !!a.loop, rows };
    if (a.impactSlot != null) entry.impactSlot = a.impactSlot;
    if (a.releaseSlot != null) entry.releaseSlot = a.releaseSlot;
    actions[a.key] = entry;
  }

  const weapons = {};
  const kits = {};
  for (const c of classes) {
    const cls = c.cls;
    weapons[cls] = { skin: cls, handle: [0, 0], type: WEAPON_TYPE[cls] };
    weapons[`${cls}_fine`] = { skin: `${cls}_fine`, handle: [0, 0], type: WEAPON_TYPE[cls] };
    kits[cls] = {
      body: cls,
      head: cls,
      hand: cls,
      helm: cls,
      chest: cls,
      belt: cls,
      legs: cls,
      boots: cls,
      gloves: cls,
      weapon: cls,
      weaponType: WEAPON_TYPE[cls],
    };
  }

  const layers = {
    body: { kind: 'slot' },
    hand: { kind: 'slot', follows: 'body' },
    legs: { kind: 'slot', follows: 'body', attach: { after: 'body' } },
    boots: { kind: 'slot', follows: 'body', attach: { after: 'legs' } },
    belt: { kind: 'slot', follows: 'body', attach: { after: 'boots' } },
    chest: { kind: 'slot', follows: 'body', attach: { after: 'belt' } },
    gloves: { kind: 'slot', follows: 'body', attach: { after: 'chest' } },
    head: { kind: 'slot' },
    helm: { kind: 'slot', follows: 'head', attach: { after: 'head' } },
    weapon: { kind: 'weapon' },
  };

  const heroHeights = Object.fromEntries(classes.map((c) => [c.cls, heroHeight(c.cls)]));
  const data = {
    format: 'mistvale-paperdoll',
    version: 1,
    tickRate: TICK,
    meta: {
      placeholder: false,
      source: 'pipeline/scripts/pixelfx/character/doll-pack.mjs (pixelfx rig: core/rig.js + costume.mjs + stockbody.mjs)',
      generator: 'pipeline/scripts/pixelfx/character/doll-pack.mjs',
      classes: classes.map((c) => c.cls),
      dedupedCells: Object.values(layout.dedupe).reduce((a, b) => a + b, 0),
      gearSlots: GEAR_SLOTS,
      kits,
      // the authored per-class material set (one distinct base colour per slot), so a tool can
      // verify the six pieces are six different materials without guessing from rendered pixels
      gearKits: Object.fromEntries(classes.map((c) => [c.cls, { ...GEAR_KIT[c.cls], base: Object.fromEntries(GEAR_SLOTS.map((k) => [k, toHex(c.gc.ramps[k].shell[1])])) }])),
      heroHeight: heroHeights[classes[0].cls] ?? 72,
      heroHeights,
      footFromBottom: FOOT_FROM_BOTTOM,
      cell: CELL,
      dirs: DIR_NAMES,
      effectDirs: 4,
      diagonalActions: ['idle', 'walk'],
      defaultClass: classes[0].cls,
    },
    weaponOrigin: { dx: [0, 0, 0, 0, 0, 0, 0, 0], dy: 0 },
    layers,
    images: Object.fromEntries(classes.map((c) => [c.cls, `${c.cls}.png`])),
    skins,
    sebs,
    weapons,
    effects: {},
    actions,
    aliases: { stand: 'idle', move: 'walk', cast: 'skill', damage: 'hurt', hit: 'hurt' },
  };
  return data;
}

// ---------------------------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------------------------

function main() {
  const classNames = ALL_CLASSES.filter((c) => !ONLY || ONLY.includes(c));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  setMaterial(stockMaterial());

  console.log(`doll-pack: ${classNames.length} classes -> ${path.relative(ROOT, OUT_DIR)}`);
  const built = [];
  for (const cls of classNames) {
    setGearPass((ctx) => COSTUMES[cls].draw(ctx));
    const c = buildClass(cls);
    built.push(c);
    console.log(`  ${cls.padEnd(10)} SC ${c.SC.toFixed(3)}  frames ${c.count}`);
  }
  setGearPass(null);

  const layout = buildLayout(built);
  console.log(`  layout ${layout.w}x${layout.h} (${BLOCKS.length} blocks)`);

  let pngBytes = 0;
  for (const c of built) {
    const r = writeAtlas(c, layout);
    pngBytes += r.png;
    console.log(`  atlas ${c.cls.padEnd(10)} ${(r.png / 1024).toFixed(1)} KB  ${r.colours} colours`);
  }

  const data = buildJson(built, layout, {});
  const json = JSON.stringify(data);
  fs.writeFileSync(path.join(OUT_DIR, 'paperdoll.json'), json);

  console.log(`  json ${(json.length / 1024).toFixed(1)} KB`);
  console.log(`  png  ${(pngBytes / 1024).toFixed(1)} KB total`);
  const dedupeTotal = Object.values(layout.dedupe).reduce((a, b) => a + b, 0);
  console.log(`  cells deduped ${dedupeTotal} of ${layout.keys.length * BLOCKS.length}`);
  if (VERBOSE) {
    for (const a of ACTIONS) {
      const secs = a.af[a.af.length - 1] / TICK;
      const imp = a.impactSlot != null ? (a.af[a.impactSlot - 1] / TICK).toFixed(3) : '-';
      console.log(`  action ${a.key.padEnd(18)} ${a.slots} slots  ${secs.toFixed(2)}s  impact ${imp}s`);
    }
  }
}

main();

