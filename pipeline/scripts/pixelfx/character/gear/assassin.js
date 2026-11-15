// T160: the assassin's gear set (刺客), stacked on the shared bare body (../barebody.js).
//
// Identity: a hooded knife fighter - a deep cowl that swallows the face, a fitted dark leather
// jacket with crossed chest straps, a belt of pouches, tight trousers and short boots, a trailing
// scarf behind the shoulders and a dagger in each hand (main hand forward, off hand reversed).
// The class colour #7a6a9c is a cold slate purple used only on the scarf, the strap buckles and the
// dagger guards, so the silhouette stays dark and lean.
//
// The module exports the same shape as ./archer.js:
//   layers    body layers, top first (the exporter appends the bare body's own layers under them)
//   drawGear  the gear pass: the hood's tail and the scarf behind the body, the near shoulder pad,
//             the chest straps and the dagger guards in front
//   pose      the class weapons in the class holds (stock WEAPONS.dagger, recoloured below; the
//             off hand uses the rig's offWeapon slot so both blades come from the rig, not from
//             extra pixels)
//   recolour  the stock dagger steel -> dark blue-slate steel with purple guards
//   seam, name
// and a `fine` variant of the same shape with a richer purple and a longer scarf; `variants`
// exposes both.
//
// Rest rows are the rig's own rest cells: 0-7 head, 8-13 chest, 12-20 waist, 17-28 thighs,
// 28-35 shins, 35-36 feet; x grows toward the character's front, the face column is x 15.
import { hex } from '../core/color.js';
import { EYE } from '../barebody.js';

const PAL = {
  base: {
    hood: ['#6c6488', '#544e6a', '#3d3852', '#2a2638'].map(hex),
    leather: ['#615a76', '#4a4458', '#35303f', '#232029'].map(hex),
    trouser: ['#524c60', '#3f3a4a', '#2c2936', '#1d1a25'].map(hex),
    boot: ['#474252', '#36313e', '#26222e', '#18151d'].map(hex),
    accent: hex('#7a6a9c'),
    accentHi: hex('#a294c8'),
    accentDk: hex('#554a72'),
    ink: hex('#241c1e'),
    skin: ['#f6c894', '#e4b78d', '#c88f5f', '#9a6440'].map(hex),
    blade: ['#8b99ab', '#6b7a8c', '#3a4453', '#262f3a'].map(hex),
    spec: hex('#e8eef5'),
  },
  fine: {
    hood: ['#6a6286', '#54506a', '#3d3850', '#2a2636'].map(hex),
    leather: ['#5d5670', '#484254', '#342f40', '#241f2c'].map(hex),
    trouser: ['#4e4859', '#3d3848', '#2c2836', '#1d1a25'].map(hex),
    boot: ['#454050', '#342f3c', '#26222e', '#18151e'].map(hex),
    accent: hex('#8f7eb4'),
    accentHi: hex('#b8a9dc'),
    accentDk: hex('#6a5c8e'),
    ink: hex('#241c1e'),
    skin: ['#f6c894', '#e4b78d', '#c88f5f', '#9a6440'].map(hex),
    blade: ['#9dabbb', '#7c8998', '#454f5e', '#2f373f'].map(hex),
    spec: hex('#f4f8fc'),
  },
};

const inRows = (y, a, b) => y >= a && y <= b;
const isLeg = (bone) => /^(thigh|shin|foot)(N|F)$/.test(bone ?? '');
const ramp = (colors, tone) => colors[Math.min(colors.length - 1, tone)];

function build(P) {
  // ── body layers, top first ─────────────────────────────────────────────────────────────────
  /** Deep cowl: the crown and the sides in dark cloth, the face in shadow under the brim. The eye
   *  cell is left to the eye layer, so a cold glint is the only light in the hood. */
  const hoodLayer = ({ x, y, part, tone, yaw }) => {
    if (part !== 'head') return null;
    // the face is what stops the assassin reading as a black blob: a shadowed but lit face under the
    // brim, two dark eye pixels head-on (one in profile) and a cheek highlight
    if (y === EYE.y && (x === EYE.x || x === EYE.x - 1)) {
      if (x === EYE.x - 1 && Math.abs(yaw ?? 0) > 0.35) return null;
      return P.ink;
    }
    if (y === EYE.y + 1 && x === EYE.x) return P.skin[1];
    if (y <= 2) return ramp(P.hood, tone);
    if (y === 3) return x >= 12 ? ramp(P.hood, 1) : ramp(P.hood, 2);
    if (y === 4) return x >= EYE.x + 1 ? ramp(P.hood, 1) : ramp(P.hood, 3); // shadowed brow
    if (y === 5) return x >= 14 ? ramp(P.skin, 3) : ramp(P.hood, 3); // the lower face in shadow
    if (y === 6) return x >= 13 ? ramp(P.skin, 2) : ramp(P.hood, 3); // the cheek catches a little light
    if (y === 7) return x <= 12 ? ramp(P.hood, 3) : ramp(P.skin, 2); // the jaw stays skin
    return null;
  };
  /** Fitted leather jacket: dark, with a lit front seam and a slate under-shade on the back. */
  const jacketLayer = ({ x, y, part, bone, tone }) => {
    if (part === 'torso') {
      if (y < 8) return null;
      if (inRows(y, 17, 19)) return null; // the belt layer owns the waist
      if (x >= 15) return ramp(P.leather, 0);
      if (x <= 10) return ramp(P.leather, Math.min(3, tone + 1));
      return ramp(P.leather, Math.min(2, tone));
    }
    if (isLeg(bone)) {
      if (y >= 33) return ramp(P.boot, Math.min(3, tone));
      return ramp(P.trouser, Math.min(3, tone + (y >= 30 ? 1 : 0)));
    }
    return null;
  };
  /** The belt: a leather band with a slate buckle and two pouch rows. */
  const beltLayer = ({ x, y, part, bone, tone }) => {
    if (!inRows(y, 17, 19) || !(part === 'torso' || isLeg(bone))) return null;
    if (y === 18 && x >= 14) return P.accentHi; // buckle
    if (y === 19) return ramp(P.leather, 2);
    if (y === 17 && (x === 11 || x === 13)) return P.accentDk; // pouches
    return ramp(P.leather, 0);
  };
  /** Sleeves: dark leather to the wrist, bare hands. */
  const sleeveLayer = ({ part, bone, tone }) => {
    if (part !== 'nearLimb' && part !== 'farLimb') return null;
    if (bone === 'handN' || bone === 'handF') return ramp(P.skin, Math.min(2, tone));
    if (bone === 'foreN' || bone === 'foreF') return ramp(P.leather, Math.min(3, tone + 1));
    return ramp(P.leather, Math.min(3, tone));
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

    // ── the cowl's long tail hanging behind the head (z -2.5: only its silhouette shows)
    for (let i = 0; i < 6; i++) {
      put(hx - 3.4 - i * 0.5, hy + 1.4 - i * 1.05, -2.5, i >= 4 ? P.ink : ramp(P.hood, 2));
      if (i < 4) put(hx - 4.2 - i * 0.5, hy + 0.6 - i * 0.9, -2.6, i >= 3 ? P.ink : ramp(P.hood, 3));
    }

    // ── the scarf tails streaming behind the shoulders (z -2.7, behind every body pixel): two
    // wavy ribbons that give the walk a sense of speed
    const scy = Math.round(shoulder[1] - 1);
    const sback = Math.round(chest[0] - 3);
    for (let i = 0; i < 5; i++) {
      const wave = i % 2;
      put(sback - 1 - i, scy - wave, -2.7, i === 4 ? P.ink : P.accentHi);
      put(sback - 1 - i, scy - 1 - wave, -2.7, i === 4 ? P.ink : P.accent);
      put(sback - 1 - i, scy - 2 - wave, -2.7, P.accentDk);
    }

    // ── a small shoulder pad over the near shoulder (z 6.2 beats every arm pixel)
    const sx = Math.round(shoulder[0]), sy = Math.round(shoulder[1]);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const r = Math.hypot(dx * 0.7, (dy + 0.4) * 0.95);
        if (r > 2.3) { if (r <= 2.6) put(sx + dx, sy + dy, 6.15, P.ink); continue; } // 1 px ink edge
        put(sx + dx, sy + dy, 6.2, dy < 0 ? ramp(P.leather, 0) : ramp(P.leather, Math.abs(dx) >= 2 ? 2 : 1));
      }
    }
    put(sx, sy + 1, 6.3, P.accentHi); // a small buckle

    // ── the crossed chest straps in front of the jacket (z 6.0): two slate diagonals with a buckle
    // at the crossing, the closest thing to armour a knife fighter wears
    const cx = Math.round(chest[0]), cy = Math.round(chest[1]);
    for (let i = 0; i < 6; i++) {
      put(cx + 3 - i * 0.75, cy + 2 - i * 0.75, 6.0, P.accentDk);
      put(cx + 3 - i * 0.75, cy - 2 - i * 0.35, 6.0, P.accentDk);
    }
    put(cx + 1, cy + 0.4, 6.1, P.accentHi); // the buckle at the crossing

    // ── a white glint on each blade (drawn in front of the weapon the rig draws next)
    for (const side of [0, 1]) {
      const T = side
        ? along(S.armF.end, [Math.cos(S.q.sb ?? Math.PI), -Math.sin(S.q.sb ?? Math.PI), 0], S.side, PART.offWeapon, S.sw)
        : along(S.armN.end, S.axis, S.side, PART.weapon, S.sw);
      if (side ? S.OW : S.W) T(side ? 7 : 8, -0.6, P.spec, 2.4);
    }
  }

  return {
    layers: [hoodLayer, jacketLayer, beltLayer, sleeveLayer],
    seam: P.ink,
    name: 'Assassin walk',
    // both daggers out: the main hand carries it forward-low in a ready grip, the off hand holds the
    // second blade reversed (sb points it down-back) - the twin-knife stance is the class read
    pose: { weapon: 'dagger', sa: -0.75, sb: 2.1, offWeapon: 'dagger', scaleWeapon: 1.05 },
    recolour: new Map([
      [hex('#ffffff') >>> 0, P.blade[0] >>> 0],
      [hex('#e8edf6') >>> 0, P.blade[1] >>> 0],
      [hex('#a4afc6') >>> 0, P.blade[2] >>> 0],
      [hex('#68748f') >>> 0, P.blade[3] >>> 0],
      [hex('#ffd84a') >>> 0, P.accentHi >>> 0],
      [hex('#b8862a') >>> 0, P.accent >>> 0],
      [hex('#7a3a2a') >>> 0, P.leather[1] >>> 0],
      [hex('#4a2018') >>> 0, P.leather[3] >>> 0],
    ]),
    drawGear,
  };
}

const base = build(PAL.base);
export const { layers, seam, name, pose, recolour, drawGear } = base;
export const fine = build(PAL.fine);
export const variants = { base, fine };
