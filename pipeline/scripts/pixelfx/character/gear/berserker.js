// T160: the berserker's gear set (狂戰士), stacked on the shared bare body (../barebody.js).
//
// Identity: a scarred, bare-armed brute with a dark red-brown mane, a shaggy fur mantle over the
// shoulders, an iron plate strapped across the chest with an orange sash, a leather kilt and fur
// boots, carrying a chunky greatsword rested back over the shoulder. The class colour #d77a58 is a
// spot colour only (warpaint, sash, buckle, wrist wrap).
//
// The module exports the same shape as ./archer.js:
//   layers    body layers, top first (the exporter appends the bare body's own layers under them)
//   drawGear  the gear pass: the fur mantle and far pauldron behind the body, the mane mass that
//             widens the head, the thicker bare arms, the near pauldron and wrist wrap in front
//   pose      the class weapon in the class hold (the stock WEAPONS.greatsword, recoloured below)
//   recolour  the stock greatsword steel -> dark blue-grey iron with a brass guard
//   seam, name
// and a `fine` variant of the same shape with richer colours and brass trim, so the runtime can
// promote a hero later; `variants` exposes both.
//
// Rest rows are the rig's own rest cells: 0-7 head, 8-13 chest, 12-20 waist, 17-28 thighs,
// 28-35 shins, 35-36 feet; x grows toward the character's front, the face column is x 15.
import { hex } from '../core/color.js';
import { EYE, PALETTE } from '../barebody.js';

const PAL = {
  base: {
    hair: ['#7d4526', '#5c2f1a', '#3f1f12', '#3f1f12'].map(hex),
    fur: ['#8a6a44', '#66502f', '#473722', '#473722'].map(hex),
    // the class colour #d77a58 worn big: the near pauldron is orange fur, not brown, so the
    // berserker never reads as the archer's brown-and-leather silhouette
    pauldron: ['#f0a07c', '#d77a58', '#a34e34', '#7a3524'].map(hex),
    iron: ['#a3aab8', '#7d8595', '#5a6170', '#3e4450'].map(hex),
    ironDk: ['#6f7787', '#5a6272', '#4a5058', '#343a44'].map(hex), // the lead's iron #4a5058
    ink: hex('#241c1e'), // every gear outline and every seam between overlapping parts
    leather: ['#7a4e30', '#5d3a24', '#452a1a', '#452a1a'].map(hex),
    // lighter, thinner clothing than the archer's dark leather so the two browns separate
    trouser: ['#8a7a5c', '#6e5f45', '#544730', '#3c3222'].map(hex),
    boot: ['#6d4a30', '#523524', '#3b261a', '#3b261a'].map(hex),
    sole: hex('#241a14'),
    orange: hex('#d77a58'),
    orangeHi: hex('#f0a07c'),
    orangeDk: hex('#a34e34'),
    trim: null, // the fine set adds brass trim
    // chunky RO steel: the bright tones are used for the two specular pixels only, so the blade
    // reads as mid-grey metal with a dark edge instead of a white slab
    blade: ['#7b8798', '#5f6a78', '#3a4453', '#262f3a'].map(hex),
    spec: hex('#e8eef5'),
    brass: hex('#c98a4a'),
    brassDk: hex('#8a5a32'),
    grip: hex('#4b2b26'),
    gripDk: hex('#2e1a16'),
  },
  fine: {
    hair: ['#8f5030', '#6b3a20', '#4a2416', '#4a2416'].map(hex),
    fur: ['#a8825a', '#7d5e3c', '#58422a', '#58422a'].map(hex),
    pauldron: ['#ffb98f', '#e08962', '#b25a3c', '#8a3f28'].map(hex),
    iron: ['#bcc3d0', '#949dae', '#6e7686', '#4b5160'].map(hex),
    ironDk: ['#7d8595', '#646c7c', '#4f5767', '#3a404c'].map(hex),
    ink: hex('#241c1e'),
    leather: ['#8a5a38', '#6b4529', '#4e311d', '#4e311d'].map(hex),
    trouser: ['#9a8a68', '#7d6d51', '#5f5238', '#473c28'].map(hex),
    boot: ['#7d5638', '#5e3f29', '#432c1d', '#432c1d'].map(hex),
    sole: hex('#241a14'),
    orange: hex('#e08962'),
    orangeHi: hex('#ffb98f'),
    orangeDk: hex('#b25a3c'),
    trim: hex('#d9b56a'),
    blade: ['#9dabbb', '#7c8998', '#454f5e', '#2f373f'].map(hex),
    spec: hex('#f4f8fc'),
    brass: hex('#e0a45c'),
    brassDk: hex('#9a683c'),
    grip: hex('#5a332c'),
    gripDk: hex('#361e18'),
  },
};

const inRows = (y, a, b) => y >= a && y <= b;
const isLeg = (bone) => /^(thigh|shin|foot)(N|F)$/.test(bone ?? '');
const ramp = (colors, tone) => colors[Math.min(colors.length - 1, tone)];

function build(P) {
  // ── body layers, top first ─────────────────────────────────────────────────────────────────
  /** Dark red-brown mane: the crown, the back of the head and a heavy fringe; orange warpaint on the
   *  cheek (the one place the accent reads on the face at 1x). */
  const hairLayer = ({ x, y, part, tone, yaw }) => {
    if (part !== 'head') return null;
    // the face: two dark eye pixels with a cheek highlight head-on, one eye in profile
    if (y === EYE.y && (x === EYE.x || x === EYE.x - 1)) {
      if (x === EYE.x - 1 && Math.abs(yaw ?? 0) > 0.35) return null; // profile: the far eye is hidden
      return P.ink;
    }
    if (y === EYE.y + 1 && x === EYE.x) return PALETTE.skin[0]; // cheek highlight
    if (y <= 2) return ramp(P.hair, tone);
    if (y === 3 && x >= 13) return x >= 15 ? P.orange : P.orangeDk; // orange headband across the brow
    if (inRows(y, 3, 7) && x <= 12) return ramp(P.hair, tone);
    if (y === 3 && x <= 14) return ramp(P.hair, Math.min(2, tone + 1));
    if (y === 4 && x === 13) return ramp(P.hair, 2);
    if (y === 5 && x === 14) return P.orange;
    if (y === 6 && x === 14) return P.orangeDk;
    return null;
  };
  /** Fur-cuffed boots: the bottom third of each leg, sole on the lowest rest row. */
  const bootLayer = ({ y, bone, tone }) => {
    if (!isLeg(bone) || y < 29) return null;
    if (y >= 36) return P.sole;
    if (y <= 30) return ramp(P.fur, tone);
    return ramp(P.boot, tone);
  };
  /** Leather kilt and trousers from the hip down to the boot tops. */
  const trouserLayer = ({ y, part, bone, tone }) => {
    if (part === 'torso' && y >= 20) return ramp(P.leather, Math.min(2, tone));
    if (isLeg(bone) && inRows(y, 20, 28)) return ramp(P.trouser, tone);
    return null;
  };
  /** Wide orange war belt with a dark lower edge and an ink seam under it. */
  const beltLayer = ({ x, y, part, bone }) => {
    if (!inRows(y, 17, 19) || !(part === 'torso' || isLeg(bone))) return null;
    if (y === 19) return P.ink; // the belt's dark edge, so it separates from the kilt
    if (y === 18) return x >= 14 ? P.orangeHi : P.orange;
    return P.orangeDk;
  };
  /** Iron chest plate, fur collar, and the orange sash across the chest. The arms stay bare skin. */
  const armorLayer = ({ x, y, part, tone }) => {
    if (part !== 'torso') return null;
    if (inRows(y, 8, 9)) return ramp(P.fur, tone); // fur collar
    if (inRows(y, 10, 16)) {
      const sash = (y === 10 && x >= 14) || (y === 11 && x >= 13) || (y === 12 && x >= 12);
      if (sash) return y === 10 ? P.orangeHi : P.orange;
      if (y === 13) return P.iron[3]; // plate seam
      if (x >= 14) return P.iron[0]; // lit front edge
      if (P.trim && x === 13 && y >= 14) return P.trim; // fine: brass stud line
      return ramp(P.iron, tone);
    }
    return null;
  };

  // ── the gear pass ──────────────────────────────────────────────────────────────────────────
  const BW = 300, OX = 150, OY = 180;
  function drawGear({ S, PART, plot, along }) {
    const k = S.sc ?? 1;
    const put = (x, y, z, color, part = PART.offWeapon) => {
      const wx = Math.round(x), wy = Math.round(y);
      plot((OY - wy) * BW + (OX + wx), z, 2, part, 2, wx, wy, color);
    };
    const SKIN = PALETTE.skin;
    const head = S.B.head.t, chest = S.B.chest.t, shoulder = S.sN, pelvis = S.B.pelvis.t;
    // deterministic fur dither: three tones in a fixed pattern, so fur reads as shaggy, not flat
    const furTone = (x, y) => 1 + ((x * 5 + y * 3) % 3 === 0 ? -1 : (x * 7 + y * 5) % 4 === 0 ? 1 : 0);
    const furAt = (x, y) => ramp(P.fur, furTone(x, y));

    // ── a bigger, shaggier head: hair pixels only where the body is not (z 0.2 loses every body
    // pixel), so the mane widens the head silhouette by ~1.5 px and adds a knot on top
    const hx = head[0], hy = head[1];
    for (let dy = -5; dy <= 5; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const r = Math.hypot(dx * 0.9, dy * 0.8);
        if (r < 2.4 || r > 3.9) continue;
        if (dx >= 1 && dy <= 0) continue; // keep the face front clear
        put(hx + dx, hy + dy, 0.2, ramp(P.hair, r > 3.2 ? 2 : dy > 1 ? 0 : 1));
      }
    }
    put(hx - 0.6, hy + 3.4, 0.3, ramp(P.hair, 1)); // the knot: two spikes above the crown
    put(hx - 2.0, hy + 3.1, 0.3, ramp(P.hair, 2));
    put(hx - 1.4, hy + 4.2, 0.4, ramp(P.hair, 0));

    // ── thicker bare arms: skin pixels just outside each arm's own silhouette. Near arm at z 0.2
    // (drawn behind the body, so arm/torso pixels win), far arm at z -6.8 (behind the far arm).
    // The side facing up gets the lit skin tone, the side facing down the shade, so the arm reads
    // three-tone instead of a flat 2-tone band.
    const armExtend = (j, e, z) => {
      const dx = e[0] - j[0], dy = e[1] - j[1], len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      for (let t = 0.02; t <= 1.001; t += 0.1) {
        const cx = j[0] + dx * t, cy = j[1] + dy * t;
        for (let s = -3.2; s <= 3.21; s += 0.55) {
          const rr = Math.abs(s);
          if (rr < 2.0) continue; // the body's own arm wins here
          const up = ny * s > 0.2; // is this offset above the bone axis?
          put(cx + nx * s, cy + ny * s, z, ramp(SKIN, rr > 2.85 ? 2 : up ? 0 : 1));
        }
      }
    };
    armExtend(S.sN, S.armN.joint, 0.2);
    armExtend(S.armN.joint, S.armN.end, 0.2);

    // ── the shaggy fur mantle down the back, from the shoulder line to the hip (z -2.8 keeps every
    // body pixel in front of it, so only its silhouette shows, widening the upper body). The tone
    // dither makes it read as fur and not as a flat slab.
    const topY = Math.round(shoulder[1] + 1);
    const hemY = Math.round(pelvis[1] + 3 * k);
    const back = Math.round(chest[0] - 4);
    for (let y = hemY; y <= topY; y++) {
      const u = (topY - y) / Math.max(1, topY - hemY);
      const w = 3 + ((y * 7) % 3 === 0 ? 1 : 0) + (u > 0.5 ? 1 : 0);
      const x0 = back - w;
      for (let x = x0; x <= back; x++) put(x, y, -2.8, x === x0 || y === hemY ? P.ink : furAt(x, y));
    }
    put(back - 1, topY + 1, -2.7, ramp(P.fur, 0));
    put(back - 3, topY + 2, -2.7, ramp(P.fur, 1));
    put(back - 2, hemY - 1, -2.7, ramp(P.fur, 2));
    put(back - 4, hemY - 2, -2.7, ramp(P.fur, 2));

    // ── a fur collar ruff behind the neck (z -2.5, behind every body pixel), so the upper body
    // reads wider than the head from the side and the neck is not a bare stick
    const rsx = Math.round(shoulder[0]), rsy = Math.round(shoulder[1]);
    for (let dx = -4; dx <= 2; dx++) {
      for (let dy = -1; dy <= 3; dy++) {
        const rr = Math.hypot((dx + 1) * 0.72, (dy - 1) * 0.95);
        if (rr > 3.3) continue;
        put(rsx + dx, rsy + dy, -2.5, rr > 2.9 ? P.ink : rr > 2.6 ? ramp(P.fur, 2) : furAt(dx, dy));
      }
    }

    // ── the far pauldron: a fur-and-iron plate on the far shoulder, behind the body (z -2.5), so it
    // widens the upper-back silhouette instead of covering the near arm
    const fpx = Math.round(S.sF[0]), fpy = Math.round(S.sF[1]);
    for (const [dx, dy] of [[-2, 0], [-1, 0], [0, 0], [1, 0], [-2, 1], [-1, 1], [0, 1], [1, 1], [-2, 2], [-1, 2], [0, 2], [-3, 1], [-3, 0]]) {
      put(fpx + dx, fpy + dy, -2.5, dy === 0 ? ramp(P.iron, 3) : dy === 2 ? ramp(P.fur, 2) : ramp(P.iron, 1));
    }

    // ── the near shoulder: the class colour worn big — a shaggy ORANGE fur pauldron capping the
    // shoulder ball (a small dome, not a chest plate) with a 1 px ink edge and a dark iron cap on
    // top, in front of the near arm (z 6.2 beats every arm pixel). This is the berserker's strongest
    // 1x read and the thing that separates it from the archer's brown.
    const sx = Math.round(shoulder[0]), sy = Math.round(shoulder[1]);
    for (let dy = -2; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const r = Math.hypot((dx + 0.5) * 0.66, (dy - 1) * 0.9);
        if (r > 2.95) continue;
        if (r > 2.5) { put(sx + dx, sy + dy, 6.16, P.ink); continue; } // 1 px ink edge
        const t = r > 2.2 ? 3 : furTone(dx * 3 + 7, dy * 5 + 3);
        put(sx + dx, sy + dy, 6.2, ramp(P.pauldron, t));
      }
    }
    // the dark iron cap strapped over the orange fur
    for (const [dx, dy, tone] of [[-1, 3, 0], [0, 3, 0], [1, 3, 1], [-1, 2, 1], [0, 2, 1], [1, 2, 2]]) {
      put(sx + dx, sy + dy, 6.3, P.trim && dy === 3 && dx >= 0 ? P.trim : ramp(P.ironDk, tone));
    }
    if (P.trim) put(sx - 1, sy + 1, 6.35, P.trim); // fine: a brass rivet under the cap
    // ragged orange tufts hanging off the fur's bottom edge
    put(sx - 2, sy - 3, 6.1, ramp(P.pauldron, 2));
    put(sx, sy - 4, 6.1, ramp(P.pauldron, 3));
    put(sx + 2, sy - 3, 6.1, ramp(P.pauldron, 3));

    // ── the orange sash tail hanging off the front of the belt (z 6.0: in front of the hip)
    const beltY = Math.round(pelvis[1] + 1 * k);
    const front = Math.round(chest[0] + 3);
    for (let i = 0; i < 5; i++) {
      put(front, beltY - i, 6.0, i === 0 ? P.orangeHi : i >= 3 ? P.orangeDk : P.orange);
      if (i >= 2) put(front - 1, beltY - i, 5.9, P.orange);
    }

    // ── the wrist wrap on the near forearm (z 6.4 beats the arm pixels)
    const a = S.armN.joint, b = S.armN.end;
    const wx2 = a[0] + (b[0] - a[0]) * 0.6, wy2 = a[1] + (b[1] - a[1]) * 0.6;
    const ddx = b[0] - a[0], ddy = b[1] - a[1], len = Math.hypot(ddx, ddy) || 1;
    const nx2 = -ddy / len, ny2 = ddx / len;
    for (let i = -1.8; i <= 1.81; i += 0.6) put(wx2 + nx2 * i, wy2 + ny2 * i, 6.4, i < 0 ? P.orangeHi : P.orange);
    if (P.trim) for (let i = -1.2; i <= 1.21; i += 1.2) put(wx2 + nx2 * i + ddx / len * 1.3, wy2 + ny2 * i + ddy / len * 1.3, 6.35, P.trim);

    // ── one specular pixel on the blade's bright face (drawn in front of the weapon that the rig
    // draws after this pass, so it survives as the only white spot on the steel)
    const T = along(S.armN.end, S.axis, S.side, PART.weapon, S.sw);
    if (S.W) for (const i of [13, 20]) T(i, -1.3, P.spec, 2.4);
  }

  // a near-black seam (not a tinted one) so every overlapping part and limb gets a 1 px dark line
  const seam = P.ink;
  return {
    layers: [hairLayer, bootLayer, trouserLayer, beltLayer, armorLayer],
    seam,
    name: 'Berserker walk',
    // greatsword rested across the back over the shoulder: the grip stays in the near hand at the
    // hip, the blade leans up-back so the face, the fur mantle and the chest plate stay readable.
    // wl 0.75 makes the blade shorter than the body (RO-style), not a sword-shaped flag.
    pose: { weapon: 'greatsword', sa: -1.95, wl: 0.62, scaleWeapon: 0.9 },
    recolour: new Map([
      // chunky dark iron blade, brass crossguard, dark leather grip
      [hex('#ffffff') >>> 0, P.blade[0] >>> 0],
      [hex('#e8edf6') >>> 0, P.blade[1] >>> 0],
      [hex('#a4afc6') >>> 0, P.blade[2] >>> 0],
      [hex('#68748f') >>> 0, P.blade[3] >>> 0],
      [hex('#ffd84a') >>> 0, P.brass >>> 0],
      [hex('#b8862a') >>> 0, P.brassDk >>> 0],
      [hex('#7a3a2a') >>> 0, P.grip >>> 0],
      [hex('#4a2018') >>> 0, P.gripDk >>> 0],
    ]),
    drawGear,
  };
}

const base = build(PAL.base);
export const { layers, seam, name, pose, recolour, drawGear } = base;
export const fine = build(PAL.fine);
export const variants = { base, fine };
