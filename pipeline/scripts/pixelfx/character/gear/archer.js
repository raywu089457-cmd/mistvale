// T87 / Mistvale: the archer's default gear set, stacked on the shared bare body (../barebody.js).
//
// Three exports, all consumed by ../export-heroes.mjs:
//   palette   the class's 16-colour sheet palette (the exporter quantises the rig output to it)
//   layers    the body layers (hood, hair, boots, cape, trousers, belt, mantle, tunic, bracer), top
//             first; the exporter appends the bare body's eye layer and this skin layer underneath
//   drawGear  the gear pass: the quiver, the chest strap and the wooden bow, drawn into the same depth
//             buffer right after the body
//
// Identity: a hooded ranger - teal-green hood, shoulder yoke and cloak over a warm mid-brown leather
// tunic, dark trousers, near-black boots, dark-auburn hair, and a dark wooden bow with a cream string.
//
// The cloth is painted onto body pixels rather than built as 3D geometry. A 3D drape ring projects as a
// rectangle hiding the torso (it did, twice), while a painted layer follows the silhouette exactly. The
// painted layers are yaw-aware: the rest cell's x axis runs along the body's own front-back axis (the face
// sits at x ~= 15, the back of the skull at x ~= 5) and px.yaw is the whole-body yaw (0 = facing screen
// right / profile, +PI/2 = facing the viewer / down rows, -PI/2 = facing away / up rows). So the visible
// share of the cape and the hood is driven by the yaw: a strip down the back in profile, almost nothing
// when the class faces the camera (the teal yoke carries the class identity there), the whole back when
// it turns away.
import { hex } from '../core/color.js';

export const palette = [
  '#241c1e', //  0 ink outline / eyes
  '#e8b98f', //  1 skin lit
  '#c98d63', //  2 skin mid
  '#8f5c3c', //  3 skin shade / light wood edge
  '#5a3a2a', //  4 hair base
  '#6b4634', //  5 hair lit
  '#5fc0b8', //  6 cloak lit
  '#3fa7a0', //  7 cloak base
  '#2b7874', //  8 cloak shade
  '#96603c', //  9 tunic lit
  '#6e462c', // 10 tunic base
  '#4f3120', // 11 tunic shade / belt
  '#3e2a1f', // 12 trousers / boot top
  '#2a1c16', // 13 boots / quiver leather
  '#4a3428', // 14 bow wood
  '#d8d2c0', // 15 bow string / eye highlight / buckle
];

const C = {
  ink: hex(palette[0]),
  skin: ['#e8b98f', '#c98d63', '#8f5c3c', '#8f5c3c'].map(hex),
  hair: ['#6b4634', '#5a3a2a', '#5a3a2a', '#5a3a2a'].map(hex),
  cloak: { lit: hex('#5fc0b8'), base: hex('#3fa7a0'), shade: hex('#2b7874') },
  tunic: ['#96603c', '#6e462c', '#4f3120', '#4f3120'].map(hex),
  belt: hex('#4f3120'),
  buckle: hex('#d8d2c0'),
  trouser: ['#3e2a1f', '#3e2a1f', '#3e2a1f', '#3e2a1f'].map(hex),
  boot: ['#2a1c16', '#2a1c16', '#2a1c16', '#2a1c16'].map(hex),
  bootTop: hex('#3e2a1f'),
  sole: hex('#241c1e'),
  bow: { wood: hex('#4a3428'), woodMid: hex('#6e462c'), edge: hex('#8f5c3c'), tip: hex('#2a1c16'),
    string: hex('#d8d2c0'), grip: hex('#4f3120') },
  quiver: { base: hex('#2a1c16'), shade: hex('#4f3120'), fletch: hex('#d8d2c0') },
};

const inRows = (y, a, b) => y >= a && y <= b;
const isLeg = (bone) => bone === 'thighN' || bone === 'shinN' || bone === 'footN' || bone === 'thighF' || bone === 'shinF' || bone === 'footF';
const isUpperArm = (bone) => bone === 'upperN' || bone === 'upperF';
const ramp = (colors, tone) => colors[Math.min(3, tone)];

// How much of the body's back the current view shows: 1 at the profile, 0 facing the camera, 2-facing away.
const frontness = (yaw) => Math.sin(yaw);
const sideways = (yaw) => 1 - Math.abs(Math.sin(yaw));

/** Teal hood: the skull. The rig gives the face its own part, so the hood simply refuses to paint it - the
 * skin layer shows through and the exporter's face overlay puts the eye in. The hood keeps a brim highlight
 * row over the brow and a shadow row under it so it reads as cloth, not a helmet. */
export const hoodLayer = ({ x, y, part, yaw }) => {
  if (part !== 'head') return null;
  const away = Math.max(0, -frontness(yaw));
  if (away > 0.5) return ramp([C.cloak.base, C.cloak.base, C.cloak.lit, C.cloak.shade], y <= 1 ? 2 : y >= 4 ? 3 : 0);
  if (y === 2) return C.cloak.lit;   // brim catch-light
  if (y === 3) return C.cloak.shade; // brim shadow over the eyes
  return ramp([C.cloak.base, C.cloak.base, C.cloak.lit, C.cloak.shade], y <= 1 ? 2 : 0);
};
/** Dark-auburn hair: the crown rows over the hood rim at the back of the skull. */
export const hairLayer = ({ x, y, part, tone }) => {
  if (part !== 'head') return null;
  if (y <= 1) return ramp(C.hair, tone);
  if (y === 2 && x >= 13) return ramp(C.hair, tone);
  return null;
};
/** The cloak: a narrow strip on the rear columns of the torso, shoulder-blade length. Narrow and short on
 * purpose - a wide or long painted cape is what turned the torso into a hunched block before. */
export const capeLayer = ({ x, y, part, tone, yaw }) => {
  const away = Math.max(0, -frontness(yaw));       // 0 profile, 1 facing away
  const wide = 5.2 + 1.8 * away;                   // rear columns, in rest-cell x
  if (part !== 'torso' || !inRows(y, 11, 20)) return null;
  if (x >= wide) return null;
  return ramp(tone > 2 || y >= 19 ? [C.cloak.base, C.cloak.shade, C.cloak.shade, C.cloak.shade]
    : [C.cloak.lit, C.cloak.base, C.cloak.shade, C.cloak.shade], tone);
};
/** Near-black boots: the bottom third of each leg, a two-row lighter cuff at the top. */
export const bootLayer = ({ y, bone }) => {
  if (!isLeg(bone)) return null;
  if (y >= 36) return C.sole;
  if (y >= 29) return C.bootTop;
  return null;
};
/** Dark trousers from the belt down to the boot top, with the far leg a touch darker. */
export const trouserLayer = ({ y, part, bone }) =>
  (isLeg(bone) && inRows(y, 20, 28)) || (part === 'torso' && y >= 20)
    ? (bone === 'thighF' || bone === 'shinF' || bone === 'footF' ? C.sole : C.trouser[0])
    : null;
/** Belt on rest rows 18-19 with one bright buckle pixel on the front torso column. */
export const beltLayer = ({ x, y, part, bone }) =>
  inRows(y, 18, 19) && (part === 'torso' || isLeg(bone))
    ? (x === 15 && y === 18 ? C.buckle : C.belt)
    : null;
/** The teal mantle: the hooded cape's shoulder yoke, painted straight onto the body so it reads in every
 * yaw. Only the shoulder rows; the tunic takes over from row 11 down so the chest is not one teal slab. */
export const mantleLayer = ({ y, part, bone, tone }) => {
  if (part === 'torso' && y <= 11) return ramp([C.cloak.lit, C.cloak.base, C.cloak.base, C.cloak.shade], tone);
  if (isUpperArm(bone) && y <= 13) return ramp([C.cloak.base, C.cloak.base, C.cloak.shade, C.cloak.shade], tone);
  return null;
};
/** Warm leather tunic: rest rows 10-17, the upper arms, and the hem over the top of the thighs.
 * Two-tone in SCREEN x (light from the upper left) so the fabric is not one flat colour in any yaw. */
export const tunicLayer = ({ y, part, bone, tone, sx, hx }) => {
  const side = sx - hx < -2.5 ? -1 : sx - hx > 2.5 ? 1 : 0;
  const t = (base) => ramp(C.tunic, Math.min(3, Math.max(base, side + 1)));
  if (part === 'torso' && inRows(y, 10, 17)) return t(tone);
  if (isUpperArm(bone) || (isLeg(bone) && y <= 17)) return t(Math.min(3, tone + 1));
  return null;
};
/** Leather gloves on both hands, with a darker cuff at the wrist. */
export const gloveLayer = ({ part, bone }) => {
  if (part === 'hand' || part === 'handN' || part === 'handF' || bone === 'handN' || bone === 'handF') return C.belt;
  return null;
};
/** Near forearm bracer. */
export const bracerLayer = ({ bone, tone }) => (bone === 'foreN' ? ramp(C.tunic, Math.min(3, tone + 1)) : null);
/** Skin for everything the clothes do not cover. */
export const skinLayer = ({ tone }) => C.skin[Math.min(3, tone)];

// Top first; the exporter appends the bare-body eye layer and this skin layer underneath these.
export const layers = [hoodLayer, hairLayer, bootLayer, capeLayer, trouserLayer, beltLayer, mantleLayer, tunicLayer, gloveLayer, bracerLayer];
export const seam = C.tunic[2];
export const name = 'Archer rig';
// The bow is drawn by drawGear (part = weapon), not by the stock WEAPONS.bow: the sheet needs a readable
// 2 px limb, a cream string and a screen-plane arc in every yaw.
export const pose = { weapon: undefined };

// core/rig.js's scratch grid: plot(index, z, tone, part, mat, wx, wy, color); world y up, bigger z in front.
const BW = 300, OX = 150, OY = 180;
const mv = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
const norm2 = (x, z) => { const l = Math.hypot(x, z) || 1e-6; return [x / l, z / l]; };

export function drawGear({ S, PART, plot }) {
  const SC = S.sc ?? 1;
  const R = S.B.chest.R;
  const fwd = mv(R, [1, 0, 0]);          // where the chest faces (world)
  const sid = mv(R, [0, 0, 1]);          // the chest's side
  const chest = S.B.chest.t, pelvis = S.B.pelvis.t;
  const shoulderY = S.sN[1] + 2.2 * SC;
  const torsoR = 5.9 * SC;
  const put = (x, y, z, color, part = PART.offWeapon) => {
    const wx = Math.round(x), wy = Math.round(y);
    plot((OY - wy) * BW + (OX + wx), z, 2, part, 2, wx, wy, color);
  };
  /** a point on a vertical cylinder section around the torso: a = 0 is straight behind, radius r, height y */
  const at = (a, y, r, t = 0) => {
    const ca = Math.cos(a), sa = Math.sin(a);
    return [
      chest[0] + (pelvis[0] - chest[0]) * t + (ca * -fwd[0] + sa * sid[0]) * r,
      chest[1] + (pelvis[1] - chest[1]) * t,
      chest[2] + (pelvis[2] - chest[2]) * t + (ca * -fwd[2] + sa * sid[2]) * r,
    ];
  };
  /** a straight 1 px line in the screen plane (the bow string) */
  const line = (a, b, z, color, part = PART.offWeapon) => {
    const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1])));
    for (let i = 0; i <= n; i++) { const u = i / n; put(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, z, color, part); }
  };
  const N8 = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];

  // (The short 3D cloak that used to live here was removed: its ring rows landed 2 screen px apart, so
  // finish()'s ink ring outlined every row and the cloak rendered as horizontal stripes. The cape is painted
  // by capeLayer on body pixels instead, and it swings via the walk pose's own silhouette.)

  // Quiver: a SHORT leather tube high on the back-left (shoulder blade + a hand's width) with the fletching
  // above the shoulder. Keeping it short matters: a full-torso tube plus its ink ring reads as a backpack.
  const qTop = shoulderY + 2.2 * SC, qBot = chest[1] - 5.0 * SC;
  const qRows = Math.max(10, Math.round(qTop - qBot));
  for (let i = 0; i <= qRows; i++) {
    const u = i / qRows, y = qTop + (qBot - qTop) * u;
    for (const [a, color] of [[-0.55, C.quiver.base], [-0.85, C.quiver.shade]]) {
      const [x, , z] = at(a, y, torsoR + 2.4 * SC, 0.05);
      put(x, y, z, color);
    }
  }
  // Arrow shafts rising out of the quiver mouth, then the fletching on their tips: every light pixel has a
  // dark shaft pixel under it, so no fletching reads as a free-floating speck.
  for (const [a, dy] of [[-0.5, 1.7], [-0.7, 2.2], [-0.9, 1.5]]) {
    const yFletch = qTop + dy * SC;
    const [x, , z] = at(a, yFletch, torsoR + 2.4 * SC, 0);
    put(x, yFletch - 1.0 * SC, z, C.quiver.base);
    put(x, yFletch - 1.9 * SC, z, C.quiver.shade);
    put(x, yFletch, z, C.quiver.fletch);
  }

  // Chest strap: a leather band from the near shoulder across to the far hip, so the front and back views
  // get a diagonal instead of a flat slab.
  for (let i = 0; i <= 22; i++) {
    const u = i / 22;
    const y = shoulderY - 1.5 * SC + (pelvis[1] - shoulderY + 2 * SC) * u;
    const [x, , z] = at(-0.55 + 1.1 * u, y, torsoR + 1.4 * SC, u * 0.55);
    put(x, y, z, C.quiver.base);
    if (i % 7 === 3) put(x, y, z + 0.05, C.quiver.shade);
  }

  // The bow, drawn in the screen plane so it reads in every yaw: a 2 px wood arc with a lit outer edge, a
  // 1 px cream string, and an ink cushion that separates it from the body it overlaps. The arc hangs from
  // the near hand and bulges along the facing direction in the profile view; in the front/back views the
  // facing direction has no screen-x projection, so it bulges toward the near-hand side instead and the
  // whole arc stays clear of the silhouette.
  const q = S.q;
  // Paperdoll: drawn as its own part (weapon) so the exporter can ship the body and the bow as separate
  // sheets, and skipped entirely when the body sheet is rendered without its weapon.
  if (q.hideWeapon) return;
  const WP = PART.weapon;
  const hand = S.armN.end;
  const frontX = fwd[0], sideX = sid[0];
  const B = (Math.abs(frontX) > 0.35 || Math.abs(sideX) < 1e-3)
    ? [Math.sign(frontX) || 1, 0]
    : [Math.sign(sideX), 0];
  const A = norm2(B[0] * 0.20, 1);           // long axis: near vertical with a slight lean
  const L = 34, CW = 3.6;
  // Idle/walk: the bow hangs beside the hand. Attack (q.pull): the same arc is held out at the extended hand and
  // the string sits on the SHOOTER's side of the arc, with a short nock line back to the drawing hand. The old
  // long V-shaped pull chord crossed the whole torso in the attack rows and read as a shield.
  const aiming = !!q.pull;
  const anchor = [hand[0] + B[0] * (aiming ? 1.2 : 2.6), hand[1] + 1];
  const zBow = hand[2] + 0.4, zStr = hand[2] + 0.3;
  const arc = [];
  for (let i = 0; i <= 96; i++) {
    const u = i / 48 - 1;
    const along = u * L / 2, bulge = CW * (1 - u * u);
    arc.push([anchor[0] + A[0] * along + B[0] * bulge, anchor[1] + A[1] * along + B[1] * bulge, u]);
  }
  const tipA = arc[0], tipB = arc[arc.length - 1];
  if (aiming) {
    line([tipA[0] - B[0], tipA[1]], [tipB[0] - B[0], tipB[1]], zStr, C.bow.string, WP);
    const nock = [S.armF.end[0], S.armF.end[1]];
    const mid = [(tipA[0] + tipB[0]) / 2 - B[0], (tipA[1] + tipB[1]) / 2];
    if (Math.hypot(nock[0] - mid[0], nock[1] - mid[1]) < 13) line(mid, nock, zStr, C.bow.string, WP);
  } else {
    line(tipA, tipB, zStr, C.bow.string, WP);
  }
  for (const [x, y] of arc) for (const [dx, dy] of N8) put(x + dx, y + dy, zBow - 0.1, C.ink, WP);
  for (const [x, y, u] of arc) {
    const au = Math.abs(u), thick = au < 0.78 ? 2 : 1;
    for (let k = 0; k < thick; k++) {
      // dark wood body with the lit edge only on the outermost pixel, tips in the darker wood
      put(x + B[0] * k, y, zBow, au > 0.94 ? C.bow.tip : k === thick - 1 ? C.bow.edge : C.bow.wood, WP);
    }
  }
  // The grip: a 2 px notch where the hand closes on the bow.
  put(anchor[0], anchor[1] + 1, zBow + 0.1, C.bow.grip, WP);
  put(anchor[0], anchor[1] - 1, zBow + 0.1, C.bow.grip, WP);
}
