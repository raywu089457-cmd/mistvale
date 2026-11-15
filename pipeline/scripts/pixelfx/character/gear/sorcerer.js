// T160: the sorcerer gear set, stacked on the shared bare body (../barebody.js).
//
// Identity: a hooded violet mage - a long robe that flares to the ankles, a deep hood leaving only
// the lower face lit, a silver-trimmed placket and belt, a short mantle over the near shoulder and a
// tall wooden staff held in front with a glowing violet crystal. The class colour #b080ce is the
// robe's mid tone, with a pale arcane accent on the trim and the crystal's glow.
//
// The module exports the same shape as ./archer.js:
//   layers    body layers, top first (the exporter appends the bare body's own layers under them)
//   drawGear  the gear pass: the flared robe and the hood's peak behind the body, the crystal's glow,
//             the near mantle and the silver placket in front
//   pose      the class weapon in the class hold (stock WEAPONS.pfstaff, recoloured below)
//   recolour  the stock staff wood/steel/gold -> dark witchwood, arcane crystal and silver fittings
//   seam, name
// and a `fine` variant of the same shape with a richer violet and a brighter crystal; `variants`
// exposes both.
//
// Rest rows are the rig's own rest cells: 0-7 head, 8-13 chest, 12-20 waist, 17-28 thighs,
// 28-35 shins, 35-36 feet; x grows toward the character's front, the face column is x 15.
import { hex } from '../core/color.js';
import { EYE, PALETTE } from '../barebody.js';

const PAL = {
  base: {
    robe: ['#a678c4', '#7d529e', '#57356f', '#3a2452'].map(hex),
    robeHi: hex('#e6cdf4'),
    robeDk: hex('#3f2557'),
    hood: ['#9d74bd', '#7d529e', '#5a3a78', '#38224f'].map(hex),
    silver: ['#dfe4ee', '#9aa4b8', '#6a7386', '#454e5e'].map(hex),
    accent: hex('#e0c8f6'),
    glow: hex('#b06ae0'), // the crystal's saturated violet focus (not a white ball)
    ink: hex('#241c1e'),
    staff: ['#8f7fa6', '#6b5a7a', '#4a3b56', '#33283c'].map(hex),
    crystal: ['#dcbcfa', '#b06ae0', '#7a3ab0', '#3d1f63'].map(hex),
    boot: ['#574761', '#40344a', '#2c2334', '#1f1826'].map(hex),
  },
  fine: {
    robe: ['#b98ad8', '#8e60b2', '#643d80', '#452a5e'].map(hex),
    robeHi: hex('#f3e2fd'),
    robeDk: hex('#4a2b63'),
    hood: ['#b48cd4', '#8f65b2', '#6a4790', '#452a5e'].map(hex),
    silver: ['#f0f4fa', '#b6c0d2', '#7d8798', '#525b69'].map(hex),
    accent: hex('#f2dcff'),
    glow: hex('#c882f0'),
    ink: hex('#241c1e'),
    staff: ['#a390bc', '#846f99', '#5d4c6b', '#40344a'].map(hex),
    crystal: ['#e8d0ff', '#c07af0', '#8e4cc4', '#4a2470'].map(hex),
    boot: ['#634f70', '#4a3c56', '#352a3e', '#241d2b'].map(hex),
  },
};

const inRows = (y, a, b) => y >= a && y <= b;
const isLeg = (bone) => /^(thigh|shin|foot)(N|F)$/.test(bone ?? '');
const ramp = (colors, tone) => colors[Math.min(colors.length - 1, tone)];

function build(P) {
  // ── body layers, top first ─────────────────────────────────────────────────────────────────
  /** Deep hood: the crown and the sides in violet, so only the lower face and the eye stay lit. */
  const hoodLayer = ({ x, y, part, tone, yaw }) => {
    if (part !== 'head') return null;
    // the face inside the hood: two dark eyes head-on, one in profile, plus a cheek highlight
    if (y === EYE.y && (x === EYE.x || x === EYE.x - 1)) {
      if (x === EYE.x - 1 && Math.abs(yaw ?? 0) > 0.35) return null;
      return P.ink;
    }
    if (y === EYE.y + 1 && x === EYE.x) return PALETTE.skin[0];
    if (y <= 2) return ramp(P.hood, tone);
    if (y === 3) return x >= 12 ? ramp(P.hood, 1) : ramp(P.hood, 2);
    if (y === 4) return x < EYE.x ? ramp(P.hood, 2) : null; // brow edge, the eye stays lit
    if (y === 5) return x <= 12 ? ramp(P.hood, 2) : null; // the cheek is bare
    if (y === 6) return x <= 11 ? ramp(P.hood, 3) : null;
    if (y === 7) return x <= 10 ? ramp(P.hood, 3) : null;
    return null;
  };
  /** The robe: a long violet gown over the torso and the thighs, with a lit front and a dark back. */
  const robeLayer = ({ x, y, part, bone, tone }) => {
    if (part === 'torso') {
      if (y < 8) return null;
      if (y === 8) return ramp(P.robeDk, 1); // high collar
      if (inRows(y, 17, 19)) return null; // the belt layer owns the waist
      if (x >= 15) return ramp(P.robe, 0); // the lit front column
      if (x <= 10) return ramp(P.robe, Math.min(3, tone + 1)); // the shadowed back
      return ramp(P.robe, Math.min(2, tone));
    }
    if (isLeg(bone)) {
      if (y >= 34) return ramp(P.boot, tone); // the hem just above the boots
      return x >= 16 ? ramp(P.robe, 1) : ramp(P.robe, Math.min(3, tone + 1));
    }
    return null;
  };
  /** Silver placket down the front of the robe and the arcane accent at the collar. */
  const placketLayer = ({ x, y, part, tone }) => {
    if (part !== 'torso' || y < 9 || y > 16) return null;
    if (x >= 15) return y === 9 ? P.accent : ramp(P.silver, Math.min(2, tone));
    if (y === 9 && x >= 13) return P.accent;
    return null;
  };
  /** Belt: a dark sash with a silver clasp on the front column. */
  const beltLayer = ({ x, y, part, bone }) => {
    if (!inRows(y, 17, 19) || !(part === 'torso' || isLeg(bone))) return null;
    if (y === 18 && x >= 14) return P.accent;
    if (y === 17) return ramp(P.hood, 2);
    return ramp(P.hood, 3);
  };
  /** Wide robe hem: the gown flares over the shins and stops above the boots. */
  const hemLayer = ({ y, bone, tone }) => {
    if (!isLeg(bone)) return null;
    if (y >= 34) return ramp(P.boot, Math.min(2, tone));
    if (y >= 32) return ramp(P.robe, 2); // the hem line
    return null;
  };
  /** Wide robe sleeves over both arms, bare hands at the cuffs. */
  const sleeveLayer = ({ part, bone, tone }) => {
    if (part !== 'nearLimb' && part !== 'farLimb') return null;
    if (bone === 'handN' || bone === 'handF') return ramp(PALETTE.skin, Math.min(2, tone));
    if (bone === 'foreN' || bone === 'foreF') return ramp(P.robe, Math.min(3, tone + 1)); // the sleeve hangs dark
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

    // ── the hood's peak and the hair mass behind the head (z -2.5: only its silhouette shows)
    for (let i = 0; i < 5; i++) {
      put(hx - 3.2 - i * 0.55, hy + 1.2 - i * 0.7, -2.5, i >= 3 ? P.ink : ramp(P.hood, 2));
      if (i < 3) put(hx - 3.6 - i * 0.5, hy + 0.2 - i * 0.7, -2.6, i >= 2 ? P.ink : ramp(P.hood, 3));
    }

    // ── the flared robe behind the body (z -2.8): narrow at the shoulders, wide at the hem, so the
    // lower body reads as a cone instead of a pair of legs
    const topY = Math.round(shoulder[1]);
    const hemY = Math.round(pelvis[1] - 8 * k);
    const back = Math.round(chest[0] - 4);
    for (let y = hemY; y <= topY; y++) {
      const u = (topY - y) / Math.max(1, topY - hemY);
      const w = 2 + Math.round(u * 4) + ((y * 7) % 5 === 0 ? 1 : 0);
      const x0 = back - w;
      for (let x = x0; x <= back; x++) put(x, y, -2.8, x === x0 || y <= hemY ? P.ink : ramp(P.robe, 3));
    }
    put(back - 5, hemY - 1, -2.7, ramp(P.robe, 3)); // the hem's back tooth

    // ── the arcane glow around the staff's crystal: drawn just behind the weapon (z 4.4), so it
    // only shows as a halo around the crystal and never covers the steel
    const T = along(S.armN.end, S.axis, S.side, PART.weapon, S.sw);
    if (S.W) {
      // a small 1 px halo hugging the crystal's middle (z 4.5 sits behind the crystal's 4.55, so it
      // only shows where the crystal is not), saturated violet rather than white
      for (const j of [-2, 2]) {
        for (let i = 17; i <= 21; i++) T(i, j, i % 2 ? P.glow : P.crystal[2], -0.05);
      }
      // one pale spark at the crystal's core: the only near-white pixel on the mage
      T(19.5, -0.4, P.crystal[0], 2.4);
    }

    // ── the short mantle over the near shoulder (z 6.2 beats every arm pixel): violet cloth with a
    // silver edge, hanging over the upper arm
    const sx = Math.round(shoulder[0]), sy = Math.round(shoulder[1]);
    for (let dy = -1; dy <= 2; dy++) {
      for (let dx = -2; dx <= 3; dx++) {
        const r = Math.hypot((dx - 0.3) * 0.62, (dy - 0.2) * 0.8);
        if (r > 2.9) continue;
        put(sx + dx, sy + dy, 6.2, dy === 2 || r > 2.5 ? ramp(P.hood, 1) : ramp(P.hood, dy < 0 ? 0 : 2));
      }
    }
    if (P.accent) put(sx + 2, sy + 2, 6.25, P.accent); // the silver clasp
    // the sleeve's wide bell hem: cloth pixels outside the near forearm (z 0.2 loses to the arm,
    // so this only widens the silhouette), plus a silver cuff
    {
      const a = S.armN.joint, b = S.armN.end;
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      for (let t = 0.35; t <= 1.001; t += 0.16) {
        const cx = a[0] + dx * t, cy = a[1] + dy * t;
        const w = 2.4 + t * 1.4; // flares toward the cuff
        for (const sgn of [-1, 1]) {
          for (let r = 2.2; r <= w; r += 0.7) put(cx + nx * r * sgn, cy + ny * r * sgn, 0.2, ramp(P.robe, sgn < 0 ? 1 : 2));
        }
      }
      put(b[0] + nx * 1.6, b[1] + ny * 1.6, 0.3, ramp(P.silver, 0));
      put(b[0] - nx * 1.6, b[1] - ny * 1.6, 0.3, ramp(P.silver, 2));
    }
    // the mantle's tail down the back of the upper arm
    for (let i = 0; i < 3; i++) put(sx - 1 - i * 0.2, sy - 3 - i, 6.1, ramp(P.hood, 3));
  }

  return {
    layers: [hoodLayer, placketLayer, robeLayer, beltLayer, hemLayer, sleeveLayer],
    seam: P.ink,
    name: 'Sorcerer walk',
    // tall staff carried in front of the body: the hand is lifted to chest height (fx/fy) so the
    // shaft leans past the face instead of through it, and the crystal sits above the head
    pose: { weapon: 'pfstaff', sa: -1.9, fx: -1, fy: -16, wl: 1.05, scaleWeapon: 0.95 },
    recolour: new Map([
      // the stock staff: wood haft, steel crystal, gold fittings
      [hex('#8a5a32') >>> 0, P.staff[1] >>> 0],
      [hex('#5a3820') >>> 0, P.staff[3] >>> 0],
      [hex('#ffffff') >>> 0, P.crystal[1] >>> 0], // a saturated violet focus, never a white ball
      [hex('#e8edf6') >>> 0, P.crystal[2] >>> 0],
      [hex('#a4afc6') >>> 0, P.crystal[3] >>> 0],
      [hex('#68748f') >>> 0, P.staff[2] >>> 0],
      [hex('#3a3448') >>> 0, P.robeDk >>> 0],
      [hex('#262033') >>> 0, P.robeDk >>> 0],
      [hex('#ffd84a') >>> 0, ramp(P.silver, 2) >>> 0],
      [hex('#b8862a') >>> 0, ramp(P.silver, 3) >>> 0],
    ]),
    drawGear,
  };
}

const base = build(PAL.base);
export const { layers, seam, name, pose, recolour, drawGear } = base;
export const fine = build(PAL.fine);
export const variants = { base, fine };
