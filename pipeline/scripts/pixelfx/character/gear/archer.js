// T87: the archer's default gear set, stacked on the shared bare body (../barebody.js).
//
// Three exports, all consumed by ../export-actor.mjs:
//   layers    the body layers (hair, tunic, belt, trousers, boots, near bracer), top first; the
//             exporter appends the bare body's own layers underneath
//   drawGear  the gear pass: the hooded cloak and the quiver, drawn into the same depth buffer right
//             after the body and before the weapons
//   pose + recolour  the stock WEAPONS.bow in the stock archer-walk hold, recoloured by the exporter
//             (the geometry and the hold stay exactly the rig's)
//
// Identity: output/l0veyou/ref-archer.png (pale blond hair, cream hooded cloak, dark brown leather
// tunic with olive patches, belt, brown trousers, knee-high boots, wooden bow). Rest rows are the
// rig's own rest cells (src / 24); rows 0-7 head, 8-13 chest, 12-20 waist, 17-28 thighs, 28-35
// shins, 35-36 feet.
import { hex } from '../core/color.js';
import { EYE } from '../barebody.js';

const C = {
  hair: ['#fbe3a0', '#f0c870', '#c99a48', '#c99a48'].map(hex), // lit, base, shade
  tunic: ['#b07043', '#7d4b33', '#623d2f', '#623d2f'].map(hex),
  olive: hex('#657138'),
  belt: hex('#4b2b26'),
  buckle: hex('#b2876d'),
  trouser: ['#7d4b33', '#623d2f', '#4b2b26', '#4b2b26'].map(hex),
  boot: ['#c98a55', '#ae6f40', '#ae6f40', '#ae6f40'].map(hex), // lit, base
  bootShade: hex('#7d4b33'),
  sole: hex('#311d20'),
  bracer: ['#b07043', '#7d4b33', '#7d4b33', '#7d4b33'].map(hex),
  cloak: { lit: hex('#fee9d0'), base: hex('#fde1bf') },
  quiver: { base: hex('#7d4b33'), shade: hex('#623d2f') },
  fletch: hex('#fee9d0'),
  bow: { lit: hex('#b17143'), base: hex('#7d4b33'), string: hex('#e4b78d'), grip: hex('#4b2b26') },
};

const inRows = (y, a, b) => y >= a && y <= b;
const isLeg = (bone) => bone === 'thighN' || bone === 'shinN' || bone === 'footN' || bone === 'thighF' || bone === 'shinF' || bone === 'footF';
const isUpperArm = (bone) => bone === 'upperN' || bone === 'upperF';
const ramp = (colors, tone) => colors[Math.min(3, tone)];
// Olive patches on the chest and belly (rest cells). The near arm and the stock bow hide the front
// of the torso, so the visible patch sits on the belly side at rows 12-15, plus one chest speck.
const OLIVE_CELLS = new Set(['14,10', '9,12', '10,13', '9,14', '10,14', '9,15', '10,15', '11,15']);

/** Pale hair: the crown, the back of the head down to the jaw and a short fringe; the face front stays skin. */
export const hairLayer = ({ x, y, part, tone }) => {
  if (part !== 'head' || (x === EYE.x && y === EYE.y)) return null;
  const crown = y <= 2;
  const back = inRows(y, 3, 6) && x <= 12;
  const fringe = y === 3 && (x === 13 || x === 14);
  const temple = y === 4 && x === 13;
  return crown || back || fringe || temple ? ramp(C.hair, tone) : null;
};
/** Knee-high boots: the bottom 45% of each leg, sole on the lowest rest row, shade on the far/dark tone. */
export const bootLayer = ({ y, bone, tone }) => {
  if (!isLeg(bone) || y < 29) return null;
  if (y >= 36) return C.sole;
  return bone.endsWith('F') && tone === 3 ? C.bootShade : ramp(C.boot, tone);
};
/** Trousers from the belt down to the boot top. */
export const trouserLayer = ({ y, part, bone, tone }) =>
  (isLeg(bone) && inRows(y, 20, 28)) || (part === 'torso' && y >= 20) ? ramp(C.trouser, tone) : null;
/** Belt on rest rows 18-19 with one buckle pixel on the front torso column. */
export const beltLayer = ({ x, y, part, bone }) =>
  inRows(y, 18, 19) && (part === 'torso' || isLeg(bone))
    ? (x === 15 && y === 18 ? C.buckle : C.belt)
    : null;
/** Dark leather tunic: rest rows 10-17, the upper arms, and the hem over the top of the thighs. */
export const tunicLayer = ({ x, y, part, bone, tone }) => {
  if (part === 'torso' && inRows(y, 10, 17)) {
    return OLIVE_CELLS.has(`${x},${y}`) ? C.olive : ramp(C.tunic, tone);
  }
  if (isUpperArm(bone) || (isLeg(bone) && y <= 17)) return ramp(C.tunic, tone);
  return null;
};
/** Near forearm bracer. */
export const bracerLayer = ({ bone, tone }) => (bone === 'foreN' ? ramp(C.bracer, tone) : null);

// Top first; the exporter appends the bare body's own layers below these.
export const layers = [hairLayer, bootLayer, trouserLayer, beltLayer, tunicLayer, bracerLayer];
export const seam = C.tunic[2];
export const name = 'Archer walk';

// Extra pose fields: the stock archer walk's bow in the stock hold (sa -1.2); the rig's own
// WEAPONS.bow draws it, recoloured through `recolour` below.
export const pose = { weapon: 'bow', sa: -1.2 };
// The stock WEAPONS.bow is steel-coloured in core/rig.js. Recolour it (and only recolour it) here:
// bow wood lit, wood base, the gold tips as the dark grip, the steel string as cream-brown.
export const recolour = new Map([
  [hex('#8a5a32') >>> 0, C.bow.lit >>> 0],
  [hex('#5a3820') >>> 0, C.bow.base >>> 0],
  [hex('#b8862a') >>> 0, C.bow.grip >>> 0],
  [hex('#e8edf6') >>> 0, C.bow.string >>> 0],
]);

// core/rig.js's scratch grid: plot(index, z, tone, part, mat, wx, wy, color) with world y up.
const BW = 300, OX = 150, OY = 180;

/** The gear pass: cloak and hood, quiver, then the bow, all through the rig's depth buffer. */
export function drawGear({ S, PART, plot }) {
  const chest = S.B.chest.t, pelvis = S.B.pelvis.t, shoulder = S.sN;
  const cx = chest[0], kneeY = S.legN.joint[1];
  const put = (x, y, z, color, part = PART.offWeapon) => {
    const wx = Math.round(x), wy = Math.round(y);
    plot((OY - wy) * BW + (OX + wx), z, 2, part, 2, wx, wy, color);
  };

  // ── the cloak: one cream drape hanging down the back, top edge on the shoulder line (rest row
  // ~8) and hem just above the knee (rest row ~26), 5-7 px wide. Its front column sits on the
  // torso's back edge and z -3 keeps every body pixel in front of it.
  const top = Math.round(shoulder[1]);
  const hem = Math.round(kneeY) + 3;
  const back = Math.round(cx - 5);
  for (let y = hem; y <= top; y++) {
    const u = (top - y) / Math.max(1, top - hem);
    const x0 = back - (5 + (u > 0.55 ? 1 : 0) + (u > 0.85 ? 1 : 0)) + 1; // 5..7 px wide
    for (let x = x0; x <= back; x++) put(x, y, -3, x === x0 ? C.cloak.lit : C.cloak.base);
  }
  // the hood lying on the shoulders: a 2 px cream band at the top, behind the neck, joined to the drape
  for (let y = top - 1; y <= top; y++)
    for (let x = back - 4; x <= back; x++) put(x, y, -2.6, x === back - 4 ? C.cloak.lit : C.cloak.base);

  // ── the quiver: a 2 px tube along the cloak's back edge, 10 px long and steeply diagonal from the
  // back shoulder to the back hip, in front of the cloak but behind the body, protruding <= 3 px
  const qTop = [back - 2, top], qBot = [back - 6, pelvis[1] + 0.5];
  const qLen = Math.hypot(qBot[0] - qTop[0], qBot[1] - qTop[1]);
  const nx = (qBot[1] - qTop[1]) / qLen, ny = -(qBot[0] - qTop[0]) / qLen;
  for (let u = 0; u <= 1.0001; u += 1 / 16) {
    const x = qTop[0] + (qBot[0] - qTop[0]) * u, y = qTop[1] + (qBot[1] - qTop[1]) * u;
    put(x, y, -1.8, C.quiver.base);
    put(x + nx, y + ny, -1.8, C.quiver.shade);
  }
  // 3 fletching pixels #fee9d0 poking out above the shoulder (clear of the cream band)
  for (const [x, y] of [[back - 3, top + 3], [back - 2, top + 4], [back - 4, top + 3.2]])
    put(x, y, -1.6, C.fletch);
}
