// T160: the priest's gear set (祭司), stacked on the shared bare body (../barebody.js).
//
// Identity: a white-and-gold healer - a white cowl with a gold circlet and a golden halo ring behind
// the head, a long white gown with a crimson stole down the front, a gold-hemmed belt, a short
// crimson cape, and a tall gold holy staff whose head is a white-gold crystal with a pale halo. The
// class colour #b3434a is the stole and the cape; the rest is ivory and gold.
//
// The module exports the same shape as ./archer.js:
//   layers    body layers, top first (the exporter appends the bare body's own layers under them)
//   drawGear  the gear pass: the halo, the cape and the cowl's back behind the body, the crystal's
//             halo, the stole and the shoulder mantle in front
//   pose      the class weapon in the class hold (stock WEAPONS.pfstaff, recoloured to a holy staff)
//   recolour  the stock staff wood/gold/steel -> gold shaft, ivory crystal, crimson wrap
//   seam, name
// and a `fine` variant of the same shape with a brighter gold and a fuller halo; `variants` exposes
// both.
//
// Rest rows are the rig's own rest cells: 0-7 head, 8-13 chest, 12-20 waist, 17-28 thighs,
// 28-35 shins, 35-36 feet; x grows toward the character's front, the face column is x 15.
import { hex } from '../core/color.js';
import { EYE, PALETTE } from '../barebody.js';

const PAL = {
  base: {
    robe: ['#fdfbf3', '#e9e2d1', '#c9c1ac', '#9c9480'].map(hex),
    robeShade: ['#efe9db', '#d8d0bd', '#b3aa95', '#8a8170'].map(hex),
    cowl: ['#f7f3e8', '#e2dbc9', '#c0b8a3', '#948c78'].map(hex),
    gold: hex('#e8b93c'),
    goldHi: hex('#ffe27a'),
    goldDk: hex('#a07a20'),
    ink: hex('#241c1e'),
    crimson: hex('#b3434a'),
    crimsonHi: hex('#d2565c'),
    crimsonDk: hex('#8a2f36'),
    skin: PALETTE.skin,
    staff: ['#9a7628', '#7a5a1c', '#553d12', '#37270c'].map(hex),
    // the staff head is a small saturated gold focus (the lead's #f2c75c), never a white ball
    crystal: ['#fff2c4', '#f2c75c', '#d09a2a', '#8a6a1e'].map(hex),
    boot: ['#a8823a', '#8a6526', '#6b4c1a', '#4c3512'].map(hex),
  },
  fine: {
    robe: ['#fffef9', '#f2ecdd', '#d7cfba', '#aaa18b'].map(hex),
    robeShade: ['#faf5e9', '#e6dfcd', '#c1b8a2', '#948c78'].map(hex),
    cowl: ['#fffdf5', '#ece5d3', '#cbc3ad', '#9c9480'].map(hex),
    gold: hex('#f7ca48'),
    goldHi: hex('#fff0a0'),
    goldDk: hex('#b08a28'),
    ink: hex('#241c1e'),
    crimson: hex('#c14c53'),
    crimsonHi: hex('#e0666c'),
    crimsonDk: hex('#982f37'),
    skin: PALETTE.skin,
    staff: ['#b08a34', '#8c6a24', '#664a18', '#40300f'].map(hex),
    crystal: ['#fff6d8', '#f7d068', '#dda634', '#96741e'].map(hex),
    boot: ['#b89248', '#96702c', '#77561e', '#563d14'].map(hex),
  },
};

const inRows = (y, a, b) => y >= a && y <= b;
const isLeg = (bone) => /^(thigh|shin|foot)(N|F)$/.test(bone ?? '');
const ramp = (colors, tone) => colors[Math.min(colors.length - 1, tone)];

function build(P) {
  // ── body layers, top first ─────────────────────────────────────────────────────────────────
  /** White cowl with a gold circlet across the brow; the face stays lit (a healer shows her face). */
  const cowlLayer = ({ x, y, part, tone, yaw }) => {
    if (part !== 'head') return null;
    // the face is the healer's read at 1x: two dark eyes head-on (one in profile) plus a highlight
    if (y === EYE.y && (x === EYE.x || x === EYE.x - 1)) {
      if (x === EYE.x - 1 && Math.abs(yaw ?? 0) > 0.35) return null;
      return P.ink;
    }
    if (y === EYE.y + 1 && x === EYE.x) return PALETTE.skin[0];
    if (y <= 2) return y === 0 && x >= 12 ? P.goldHi : ramp(P.cowl, tone);
    if (y === 3) return x >= 11 ? P.gold : ramp(P.cowl, Math.min(2, tone));
    if (y === 4) return x >= 13 ? null : ramp(P.cowl, Math.min(2, tone + 1)); // brow edge, face below
    if (y === 5) return x <= 12 ? ramp(P.cowl, 2) : null;
    if (y === 6) return x <= 11 ? ramp(P.cowl, 2) : null;
    if (y === 7) return x <= 10 ? ramp(P.cowl, 3) : null;
    return null;
  };
  /** The long ivory gown: lit front column, shaded back, a gold hem above the boots. */
  const robeLayer = ({ x, y, part, bone, tone }) => {
    if (part === 'torso') {
      if (y < 8) return null;
      if (inRows(y, 17, 19)) return null; // the belt layer owns the waist
      if (x >= 15) return ramp(P.robe, 0);
      if (x <= 10) return ramp(P.robeShade, Math.min(3, tone + 1));
      return ramp(P.robe, Math.min(2, tone));
    }
    if (isLeg(bone)) {
      if (y >= 35) return ramp(P.boot, tone);
      if (y >= 33) return P.gold; // the hem band
      return x >= 16 ? ramp(P.robe, 1) : ramp(P.robeShade, Math.min(3, tone + 1));
    }
    return null;
  };
  /** The crimson stole down the front of the gown, gold-edged. */
  const stoleLayer = ({ x, y, part, tone }) => {
    if (part !== 'torso' || y < 8 || y > 16) return null;
    if (x >= 14) return x >= 15 ? (tone <= 0 ? P.crimsonHi : P.crimson) : P.crimsonDk;
    if (x === 13) return P.goldDk; // the gold trim line running beside the stole
    return null;
  };
  /** Gold belt with a crimson sash knot on the front column. */
  const beltLayer = ({ x, y, part, bone }) => {
    if (!inRows(y, 17, 19) || !(part === 'torso' || isLeg(bone))) return null;
    if (y === 18 && x >= 14) return P.crimsonHi;
    if (y === 17) return P.goldHi;
    return P.gold;
  };
  /** White sleeves with a gold cuff; bare hands. */
  const sleeveLayer = ({ part, bone, tone }) => {
    if (part !== 'nearLimb' && part !== 'farLimb') return null;
    if (bone === 'handN' || bone === 'handF') return ramp(P.skin, Math.min(2, tone));
    if (bone === 'foreN' || bone === 'foreF') return ramp(P.robe, Math.min(3, tone + 1));
    return ramp(P.robe, Math.min(3, tone));
  };

  // ── the gear pass ──────────────────────────────────────────────────────────────────────────
  const BW = 300, OX = 150, OY = 180;
  function drawGear({ S, PART, plot, along }) {
    const k = S.sc ?? 1;
    const put = (x, y, z, color, part = PART.offWeapon) => {
      const wx = Math.round(x), wy = Math.round(y);
      plot((OY - wy) * BW + (OX + wx), z, 2, part, 2, wx, wy, color);
    };
    const head = S.B.head.t, chest = S.B.chest.t, shoulder = S.sN, pelvis = S.B.pelvis.t;
    const hx = Math.round(head[0]), hy = Math.round(head[1]);

    // ── the golden halo behind the head (z -2.6: it only shows where the head is not, so it reads
    // as a ring around the cowl)
    for (let a = 0; a < 26; a++) {
      const ang = Math.PI * (0.13 + (a / 25) * 0.74); // the top arc only: a halo, not a frame
      const rr = 4.35 + (a % 4 === 0 ? 0.3 : 0);
      put(hx - Math.cos(ang) * rr, hy + Math.sin(ang) * rr * 0.95, -2.6, a % 3 === 0 ? P.goldHi : P.gold);
    }

    // ── the cowl's back and the crimson cape behind the body (z -2.8): shoulder to mid-shin
    const topY = Math.round(shoulder[1] + 1);
    const hemY = Math.round(pelvis[1] - 5 * k);
    const back = Math.round(chest[0] - 4);
    for (let y = hemY; y <= topY; y++) {
      const u = (topY - y) / Math.max(1, topY - hemY);
      const w = 2 + Math.round(u * 3) + ((y * 7) % 5 === 0 ? 1 : 0);
      const x0 = back - w;
      for (let x = x0; x <= back; x++) {
        // crimson coat for its whole length with an ink edge; the white cowl back is the top band
        if (y <= topY - 1) put(x, y, -2.8, x === x0 ? P.ink : P.crimson);
        else put(x, y, -2.8, x === x0 ? P.ink : ramp(P.robeShade, 2));
      }
    }
    put(back - 2, hemY - 1, -2.7, P.crimsonDk); // the cape's tail below the hem
    put(back - 3, hemY - 2, -2.7, P.goldDk);

    // ── the holy crystal's halo: a pale-gold ring behind the staff head (z 4.5 sits behind the
    // crystal's 4.55), so the light spills around the crystal without covering it
    const T = along(S.armN.end, S.axis, S.side, PART.weapon, S.sw);
    if (S.W) {
      // a tight 1 px gold ring hugging the middle of the crystal, so the staff head reads as a small
      // warm focus instead of a pale oval
      for (let i = 17; i <= 21; i++) {
        for (const sgn of [-1, 1]) T(i, sgn * 2.0, sgn < 0 ? P.crystal[1] : P.gold, -0.05);
      }
      // one warm-white spark at the crystal's core: the staff head's only bright pixel
      T(19.5, -0.4, P.crystal[0], 2.5);
    }

    // ── the shoulder mantle: a white cloth mantle with a gold edge over the near shoulder, in front
    // of the arm (z 6.2)
    const sx = Math.round(shoulder[0]), sy = Math.round(shoulder[1]);
    for (let dy = -1; dy <= 2; dy++) {
      for (let dx = -2; dx <= 3; dx++) {
        const r = Math.hypot((dx - 0.3) * 0.62, (dy - 0.2) * 0.8);
        if (r > 2.9) continue;
        put(sx + dx, sy + dy, 6.2, dy === 2 ? P.goldDk : r > 2.5 ? P.gold : ramp(P.cowl, dy < 0 ? 0 : 2));
      }
    }
    // the mantle's crimson edge trailing down the back of the upper arm
    for (let i = 0; i < 3; i++) put(sx - 1 - i * 0.2, sy - 3 - i, 6.1, i === 2 ? P.crimsonDk : P.crimson);
  }

  return {
    layers: [cowlLayer, stoleLayer, robeLayer, beltLayer, sleeveLayer],
    seam: P.ink,
    name: 'Priest walk',
    // the tall holy staff carried in front like a censer: hand lifted to chest height so the shaft
    // leans past the face and the crystal glows above the head
    pose: { weapon: 'pfstaff', sa: -1.2, fx: 5, fy: -16, wl: 1.05, scaleWeapon: 0.95 },
    recolour: new Map([
      [hex('#8a5a32') >>> 0, P.staff[1] >>> 0],
      [hex('#5a3820') >>> 0, P.staff[3] >>> 0],
      [hex('#ffffff') >>> 0, P.crystal[1] >>> 0], // the crystal's lit face: saturated gold, not white
      [hex('#e8edf6') >>> 0, P.crystal[2] >>> 0],
      [hex('#a4afc6') >>> 0, P.crystal[3] >>> 0],
      [hex('#68748f') >>> 0, P.staff[2] >>> 0],
      [hex('#ffd84a') >>> 0, P.gold >>> 0],
      [hex('#b8862a') >>> 0, P.goldDk >>> 0],
      [hex('#3a3448') >>> 0, P.staff[2] >>> 0],
      [hex('#262033') >>> 0, P.staff[3] >>> 0],
    ]),
    drawGear,
  };
}

const base = build(PAL.base);
export const { layers, seam, name, pose, recolour, drawGear } = base;
export const fine = build(PAL.fine);
export const variants = { base, fine };
