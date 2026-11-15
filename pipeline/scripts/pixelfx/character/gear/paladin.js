// T160: the paladin gear set, stacked on the shared bare body (../barebody.js).
//
// Identity: a full-plate knight - a closed helm with a gold brow band and a dark visor slit, bright
// steel breastplate over a white surcoat with a gold cross, gold-trimmed pauldrons, a white cape,
// plate greaves, a kite shield held in front of the ribs and a short sword raised behind the
// shoulder. The class colour #daaf48 is the gold trim (helm band, cross, buckle, shield rim).
//
// The module exports the same shape as ./archer.js:
//   layers    body layers, top first (the exporter appends the bare body's own layers under them)
//   drawGear  the gear pass: cape and far pauldron behind the body, the plume above the crown, the
//             shield in front of the ribs and the near pauldron in front of the arm
//   pose      the class weapon in the class hold (stock WEAPONS.sword, recoloured below)
//   recolour  the stock sword steel -> bright plate steel with a gold guard
//   seam, name
// and a `fine` variant of the same shape with richer gold and a longer crest; `variants` exposes both.
//
// Rest rows are the rig's own rest cells: 0-7 head, 8-13 chest, 12-20 waist, 17-28 thighs,
// 28-35 shins, 35-36 feet; x grows toward the character's front, the face column is x 15.
import { hex } from '../core/color.js';
import { EYE } from '../barebody.js';

const PAL = {
  base: {
    steel: ['#a9b6c8', '#8592a6', '#5d6a7c', '#3c4654'].map(hex),
    steelDk: ['#8f99aa', '#6b7585', '#4c5462', '#333a46'].map(hex),
    gold: hex('#daaf48'),
    goldHi: hex('#ffd874'),
    goldDk: hex('#a07a28'),
    ink: hex('#241c1e'),
    cloth: ['#f2ece0', '#d9d1c0', '#b5ab97', '#8a8170'].map(hex),
    leather: ['#6b4a2e', '#503522', '#3a2618', '#2c1c12'].map(hex),
    blade: ['#6b7a8c', '#55606f', '#3a4453', '#222a33'].map(hex),
    spec: hex('#e8eef5'),
    visor: hex('#2a2f3a'),
    plume: hex('#c8423f'),
    plumeDk: hex('#8a2626'),
    cape: ['#e6dfd0', '#c9c0ad', '#a49a86', '#7d7462'].map(hex),
  },
  fine: {
    steel: ['#c2cfdf', '#9aa8bb', '#6d7a8c', '#485263'].map(hex),
    steelDk: ['#a3adbe', '#7d8798', '#5a6270', '#3d4450'].map(hex),
    gold: hex('#efc356'),
    goldHi: hex('#ffe89a'),
    goldDk: hex('#b8902f'),
    ink: hex('#241c1e'),
    cloth: ['#fffaf0', '#ece4d4', '#cbc2ae', '#9d947f'].map(hex),
    leather: ['#7a5536', '#5c3e27', '#452c1b', '#32200f'].map(hex),
    blade: ['#8b97a8', '#6b7684', '#414b5a', '#2b323a'].map(hex),
    spec: hex('#f4f8fc'),
    visor: hex('#232833'),
    plume: hex('#d95550'),
    plumeDk: hex('#9a2e2e'),
    cape: ['#f4eee0', '#d9d0bd', '#b4aa95', '#8a8170'].map(hex),
  },
};

const inRows = (y, a, b) => y >= a && y <= b;
const isLeg = (bone) => /^(thigh|shin|foot)(N|F)$/.test(bone ?? '');
const ramp = (colors, tone) => colors[Math.min(colors.length - 1, tone)];

function build(P) {
  // ── body layers, top first ─────────────────────────────────────────────────────────────────
  /** Closed helm: steel shell, gold brow band, a dark visor slit at the eye row (the eye pixel
   *  itself is left to the eye layer so the knight still has a face), a gold crest on the crown. */
  const helmLayer = ({ x, y, part, tone }) => {
    if (part !== 'head') return null;
    if (y <= 1) return y === 0 && x >= 11 && x <= 14 ? P.goldHi : ramp(P.steel, Math.min(1, tone));
    if (y === 2) return ramp(P.steel, tone);
    if (y === 3) return x >= 11 ? (x >= 15 ? P.goldHi : P.gold) : ramp(P.steelDk, Math.min(2, tone));
    // the visor slit: two near-black eye pixels and a single bright glint in the steel beside them
    if (y === 4) return x >= 13 ? (x >= 14 ? P.ink : ramp(P.steel, 0)) : ramp(P.steel, tone);
    if (y === 5) return x >= 14 ? P.visor : ramp(P.steel, tone);
    if (y === 6) return ramp(P.steel, Math.min(3, tone + 1));
    if (y === 7) return ramp(P.steelDk, 2);
    return null;
  };
  /** White surcoat over the breastplate: the front column carries a gold cross. */
  const surcoatLayer = ({ x, y, part, tone }) => {
    if (part !== 'torso' || y < 9 || y > 16 || x < 13) return null;
    if (y === 12 && x >= 13) return P.goldHi; // cross arms
    if (x >= 14 && inRows(y, 10, 15)) return P.gold; // cross stem
    return ramp(P.cloth, Math.min(2, tone));
  };
  /** Steel breastplate with a gold gorget and a lit front edge. */
  const plateLayer = ({ x, y, part, tone }) => {
    if (part !== 'torso') return null;
    if (inRows(y, 8, 8)) return y === 8 && x >= 13 ? P.gold : ramp(P.steelDk, 1);
    if (inRows(y, 9, 16)) {
      if (y === 16) return ramp(P.steelDk, 2);
      if (x >= 14) return ramp(P.steel, 0);
      return ramp(P.steel, tone);
    }
    return null;
  };
  /** White skirt below the belt with a gold hem - kept short so it does not read as a cream blob. */
  const skirtLayer = ({ y, part, bone, tone }) => {
    if (part === 'torso' && y >= 20) return y >= 23 ? P.gold : ramp(P.cloth, Math.min(2, tone));
    if (isLeg(bone) && inRows(y, 20, 23)) return ramp(P.cloth, 2);
    return null;
  };
  /** Leather belt with a big gold buckle on the front column. */
  const beltLayer = ({ x, y, part, bone }) => {
    if (!inRows(y, 17, 19) || !(part === 'torso' || isLeg(bone))) return null;
    if (y === 18 && x >= 14) return P.goldHi;
    if (y === 17) return ramp(P.steelDk, 3); // plate edge above the belt
    return ramp(P.leather, y === 19 ? 2 : 0);
  };
  /** Plate greaves: dark mail thighs, gold knee cops, bright steel shins, sabatons. */
  const greaveLayer = ({ y, bone, tone }) => {
    if (!isLeg(bone)) return null;
    if (y >= 36) return ramp(P.steelDk, 3);
    if (y <= 29) return y === 29 || y === 28 ? P.gold : ramp(P.steel, Math.min(2, tone));
    return ramp(P.steelDk, Math.min(3, tone + 1));
  };
  /** Plate arms: steel rerebrace/vambrace over both arms, leather gloves on the hands, so the knight
   *  has no bare skin showing anywhere (the berserker is the class that shows skin). */
  const armLayer = ({ part, bone, tone }) => {
    if (part !== 'nearLimb' && part !== 'farLimb') return null;
    if (bone === 'handN' || bone === 'handF') return ramp(P.leather, Math.min(2, tone)); // gauntlet
    if (bone === 'foreN' || bone === 'foreF') return ramp(P.steel, Math.min(2, tone + 1)); // vambrace
    return ramp(P.steel, Math.min(3, tone)); // rerebrace
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

    // ── the crest plume above the crown (z 0.2: only empty cells take it, so it reads as a spike
    // on the silhouette and never covers the helm)
    for (let i = 0; i < 3; i++) {
      put(hx - 1 + i * 0.5, hy + 4 + i, 0.2, i === 2 ? P.plumeDk : P.plume);
      if (i >= 1) put(hx + 1.5 - i * 0.5, hy + 4 + i, 0.2, P.plumeDk);
    }
    put(hx + 1, hy + 3.6, 0.3, P.gold); // the crest's socket

    // ── a white cape down the back (z -2.8 keeps every body pixel in front of it, so it only widens
    // the silhouette): shoulder line to just below the knee, gold hem
    const topY = Math.round(shoulder[1] + 1);
    const hemY = Math.round(pelvis[1] - 3 * k);
    const back = Math.round(chest[0] - 4);
    for (let y = hemY; y <= topY; y++) {
      const u = (topY - y) / Math.max(1, topY - hemY);
      const w = 2 + (u > 0.55 ? 1 : 0);
      const x0 = back - w;
      for (let x = x0; x <= back; x++) {
        put(x, y, -2.8, y === hemY ? P.goldDk : ramp(P.cape, x === x0 ? 2 : 1));
      }
    }
    put(back - 1, hemY - 1, -2.7, ramp(P.cape, 2));
    put(back - 3, hemY - 2, -2.7, P.goldDk);

    // ── the far pauldron (z -2.5, behind the far arm): a gold-rimmed steel plate that widens the
    // upper-back silhouette
    const fx0 = Math.round(S.sF[0]), fy0 = Math.round(S.sF[1]);
    for (const [dx, dy] of [[-2, 0], [-1, 0], [0, 0], [1, 0], [-2, 1], [-1, 1], [0, 1], [1, 1], [-2, 2], [-1, 2], [0, 2]]) {
      put(fx0 + dx, fy0 + dy, -2.5, dy === 2 ? P.gold : dy === 0 ? ramp(P.steel, 0) : ramp(P.steel, 1));
    }
    put(fx0 - 2, fy0 + 3, -2.4, P.goldDk); // the rim's bottom tooth

    // ── the kite shield in front of the ribs (z 6.3: beats every body pixel, including the near
    // arm which reaches z~6). It projects past the chest silhouette so the shield reads at 1x,
    // with a 1 px ink outline, a gold rim and a gold cross.
    const cx = Math.round(chest[0] + 4), cy = Math.round(pelvis[1] + 8 * k);
    for (let dy = -6; dy <= 7; dy++) {
      const half = dy <= 0 ? 3.4 + dy * 0.12 : 3.4 - dy * 0.42; // wide shoulders, pointed foot
      if (half < 0.6) continue;
      for (let dx = -4; dx <= 4; dx++) {
        if (Math.abs(dx) > half) continue;
        const outer = Math.abs(dx) > half - 0.6 || dy === -6 || dy >= 6;
        let color;
        if (outer) color = P.ink; // the plate's outline
        else if (Math.abs(dx) > half - 1.7) color = P.gold; // the rim
        else if (dy === -2 && Math.abs(dx) <= 1) color = P.goldHi; // cross arms
        else if (dx === 0 && dy >= -3 && dy <= 0) color = P.gold; // cross stem
        else color = dx < 0 ? ramp(P.steel, 2) : ramp(P.steel, 1);
        put(cx + dx, cy + dy, 6.3, color);
      }
    }
    put(cx + 1, cy + 1, 6.4, P.goldHi); // the boss

    // ── the near pauldron over the near arm (z 6.35 beats every arm pixel): ink-edged steel dome
    const sx = Math.round(shoulder[0]), sy = Math.round(shoulder[1]);
    for (let dy = -2; dy <= 1; dy++) {
      for (let dx = -2; dx <= 3; dx++) {
        const r = Math.hypot(dx * 0.72, (dy + 0.6) * 0.95);
        if (r > 3.0) continue;
        if (r > 2.5) { put(sx + dx, sy + dy, 6.3, P.ink); continue; } // 1 px ink edge
        put(sx + dx, sy + dy, 6.35, r > 2.0 || dy === -2 ? P.goldDk : dy === -1 ? ramp(P.steel, 0) : ramp(P.steel, toneFor(dx, dy)));
      }
    }
    if (P.gold) put(sx, sy + 1, 6.45, P.gold); // a gold rivet on the rim

    // -- one white specular on the blade lit face (the gear pass runs before the rig draws the
    // weapon, so a pixel at lift 2.4 lands just in front of the steel and survives as the highlight)
    const T = along(S.armN.end, S.axis, S.side, PART.weapon, S.sw);
    if (S.W) for (const i of [9, 16]) T(i, -1.2, P.spec, 2.4);
  }
  function toneFor(dx, dy) {
    return Math.abs(dx) >= 2 ? 2 : dy >= 0 ? 1 : 0;
  }

  return {
    layers: [helmLayer, surcoatLayer, plateLayer, skirtLayer, beltLayer, greaveLayer, armLayer],
    seam: P.ink,
    name: 'Paladin walk',
    // sword raised behind the shoulder (the kite shield owns the front of the body, so the blade
    // reads best as a second diagonal on the back half of the silhouette)
    pose: { weapon: 'sword', sa: -2.05, wl: 0.55, scaleWeapon: 0.8 },
    recolour: new Map([
      [hex('#ffffff') >>> 0, P.blade[0] >>> 0],
      [hex('#e8edf6') >>> 0, P.blade[1] >>> 0],
      [hex('#a4afc6') >>> 0, P.blade[2] >>> 0],
      [hex('#68748f') >>> 0, P.blade[3] >>> 0],
      [hex('#ffd84a') >>> 0, P.gold >>> 0],
      [hex('#b8862a') >>> 0, P.goldDk >>> 0],
      [hex('#7a3a2a') >>> 0, P.leather[1] >>> 0],
      [hex('#4a2018') >>> 0, P.leather[2] >>> 0],
    ]),
    drawGear,
  };
}

const base = build(PAL.base);
export const { layers, seam, name, pose, recolour, drawGear } = base;
export const fine = build(PAL.fine);
export const variants = { base, fine };
