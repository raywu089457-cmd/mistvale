// T93: the rig's skeleton of a pose as PixelLab 18-joint keypoints (read-only: it only calls skeleton()/posed()).
//
// Shared by export-keypoints.mjs (writes data/rig-keypoints.json + the montage) and
// tools/checks/pixelfx-rig-keypoints.mjs (checks them against the rig's own render).
//
// Placement: a pose is rendered into the 76x76 export cell with the feet pivot at (38,62), exactly as
// export-4dir.mjs / export-idle-4dir.mjs do (pixel (cx,cy) is the rig's local pixel (px+xs, py+ys)), then
// doubled to the 152 canvas. A skeleton point (x,y) in rig-local px sits at the CENTRE of pixel round(x),
// so its cell coordinate is (px + x + 0.5, py + y + 0.5) and its canvas coordinate is twice that.
//
// Side convention: PixelLab labels are anatomical. The character's right-hand vector in screen space is
// forward x up = (-fz, +fx) in (x, z), z toward the viewer: facing the viewer (down) RIGHT is the viewer's
// LEFT, facing away (up) RIGHT is the viewer's right, and in the right-facing side view RIGHT is the side
// toward the viewer (RIGHT_VIEW_NEAR below; see the report for why this is not the card's "near = LEFT").
// A rig limb pair (..N / ..F) is assigned to RIGHT/LEFT from the idle shoulders' dot product with that
// vector, per direction, and kept for all of that direction's frames.
import { actBounds } from './core/act.js';
import { posed, setMaterial, skeleton } from './core/rig.js';
import { BARE_BODY } from './barebody.js';
import * as WALK from './walk-4dir.js';
import * as IDLE from './idle-4dir.js';

export const DIRS = ['down', 'up', 'right'];
export const LABELS = ['NOSE', 'NECK', 'RIGHT SHOULDER', 'RIGHT ELBOW', 'RIGHT ARM', 'LEFT SHOULDER', 'LEFT ELBOW', 'LEFT ARM',
  'RIGHT HIP', 'RIGHT KNEE', 'RIGHT LEG', 'LEFT HIP', 'LEFT KNEE', 'LEFT LEG', 'RIGHT EYE', 'LEFT EYE', 'RIGHT EAR', 'LEFT EAR'];
/** PixelLab bones, by label pairs (centre joints white in the montage, RIGHT red, LEFT blue). */
export const BONES = [['NECK', 'NOSE'], ['NOSE', 'RIGHT EYE'], ['NOSE', 'LEFT EYE'], ['RIGHT EYE', 'RIGHT EAR'], ['LEFT EYE', 'LEFT EAR'],
  ['NECK', 'RIGHT SHOULDER'], ['RIGHT SHOULDER', 'RIGHT ELBOW'], ['RIGHT ELBOW', 'RIGHT ARM'],
  ['NECK', 'LEFT SHOULDER'], ['LEFT SHOULDER', 'LEFT ELBOW'], ['LEFT ELBOW', 'LEFT ARM'],
  ['RIGHT SHOULDER', 'RIGHT HIP'], ['LEFT SHOULDER', 'LEFT HIP'], ['RIGHT HIP', 'LEFT HIP'],
  ['RIGHT HIP', 'RIGHT KNEE'], ['RIGHT KNEE', 'RIGHT LEG'], ['LEFT HIP', 'LEFT KNEE'], ['LEFT KNEE', 'LEFT LEG']];

export const CANVAS = 152, CELL = 76, PIVOT = [38, 62], SCALE = 2;
/** depth = 128 + DEPTH_PER_PX * z: the side view's near/far shoulders (z = +-5.6) differ by ~60. */
export const DEPTH_PER_PX = 5.36;
/**
 * Which anatomical side faces the viewer in the right-facing side view. Physically it is RIGHT (facing screen-right
 * with the viewer in front, the character's right hand is toward the viewer) and the estimate file fits it better
 * (summed joint error 60 vs 102 px). Flip to 'LEFT' to follow the card's literal text instead.
 */
export const RIGHT_VIEW_NEAR = process.env.RIG_RIGHT_VIEW_NEAR === 'LEFT' ? 'LEFT' : 'RIGHT'; // env override only to compare the two conventions

setMaterial(BARE_BODY);

// the export cell, as the exporters compute it (and assert)
const bb = actBounds({ act: { poses: WALK.right.map((p, i) => [i / 8, p]) }, meta: WALK.meta });
const cellW = bb.x1 - bb.x0 + 12, cellH = bb.y1 - bb.y0 + 12, px = 6 - bb.x0, py = 6 - bb.y0;
if (cellW !== CELL || cellH !== CELL || px !== PIVOT[0] || py !== PIVOT[1]) throw new Error(`unexpected cell ${cellW}x${cellH} pivot [${px},${py}]`);

/** The rig's poses of a direction: { idle: pose, walk: [8 poses] } (the same objects the exporters render). */
export const posesOfDir = (dir) => ({ idle: IDLE.posesOf(dir)[0], walk: WALK.posesOf(dir) });

/** The pose rendered into the 76x76 cell (RGBA, the exporters' renderPose). */
export function renderCell(pose) {
  const cell = new Uint8ClampedArray(CELL * CELL * 4), r = posed(pose, BARE_BODY);
  for (let i = 0; i < r.n; i++) {
    const x = PIVOT[0] + r.xs[i], y = PIVOT[1] + r.ys[i];
    if (x < 0 || y < 0 || x >= CELL || y >= CELL) continue;
    const c = r.color[i], o = (y * CELL + x) * 4;
    cell[o] = c & 255; cell[o + 1] = (c >>> 8) & 255; cell[o + 2] = (c >>> 16) & 255; cell[o + 3] = (c >>> 24) & 255;
  }
  return cell;
}
/** The cell doubled to the 152 canvas. */
export function renderCanvas(pose) {
  const cell = renderCell(pose), out = new Uint8ClampedArray(CANVAS * CANVAS * 4);
  for (let y = 0; y < CANVAS; y++) for (let x = 0; x < CANVAS; x++) {
    const s = (((y / SCALE) | 0) * CELL + ((x / SCALE) | 0)) * 4, d = (y * CANVAS + x) * 4;
    out[d] = cell[s]; out[d + 1] = cell[s + 1]; out[d + 2] = cell[s + 2]; out[d + 3] = cell[s + 3];
  }
  return out;
}

/** Forward of the figure in (x, z): the face's +x turned by the whole-figure yaw (down +z, up -z, right +x). */
export function forwardOf(pose) {
  const w = (pose.yaw ?? 0) + (pose.face === -1 ? Math.PI : 0);
  return [Math.cos(w), Math.sin(w)];
}
/** The character's right-hand vector in (x, z): forward x up. */
export const rightOf = ([fx, fz]) => [-fz, fx];

/** Which rig limb (N or F) is the character's RIGHT in this direction, decided on the idle pose. */
export function rightSideOf(dir) {
  const idle = posesOfDir(dir).idle, J = skeleton(idle).joints, f = forwardOf(idle);
  // the forward vector must agree with the rig's own feet: the toe lies in front of the ankle
  const toe = (J.toeN[0] - J.ankleN[0]) * f[0] + (J.toeN[2] - J.ankleN[2]) * f[1];
  if (toe <= 0) throw new Error(`${dir}: yaw forward disagrees with the toes`);
  let r = rightOf(f);
  if (dir === 'right' && RIGHT_VIEW_NEAR === 'LEFT') r = [-r[0], -r[1]];
  const dn = (J.shoulderN[0] - J.shoulderF[0]) * r[0] + (J.shoulderN[2] - J.shoulderF[2]) * r[1];
  if (Math.abs(dn) < 1) throw new Error(`${dir}: shoulders not separated along the right-hand vector`);
  return dn > 0 ? 'N' : 'F';
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const depthOf = (z) => clamp(Math.round(128 + DEPTH_PER_PX * z), 0, 255);

// head-relative face points (rig px): forward F, along the right-hand vector R, below the head joint DY
const FACE = { noseF: 3.0, noseDY: 1.5, eyeF: 2.8, eyeFfar: 2.0, eyeR: 1.25, eyeDY: 0.5, earR: 2.1, earF: 0, earFfar: -1.0, earDY: 0 };

/** The 18 PixelLab joints of one pose: [{ label, x, y, depth }] with x/y as fractions of the 152 canvas. */
export function keypointsOf(pose, dir) {
  const J = skeleton(pose).joints, f = forwardOf(pose), rightSide = rightSideOf(dir), leftSide = rightSide === 'N' ? 'F' : 'N';
  // the anatomical right-hand vector used for the face (same flip as the limbs)
  let r = rightOf(f);
  if (dir === 'right' && RIGHT_VIEW_NEAR === 'LEFT') r = [-r[0], -r[1]];
  const P = {};
  const put = (label, x, y, z) => {
    P[label] = { label, x: (PIVOT[0] + x + 0.5) * SCALE / CANVAS, y: (PIVOT[1] + y + 0.5) * SCALE / CANVAS, depth: depthOf(z) };
  };
  const limb = (side, tag) => {
    for (const [name, rig] of [['SHOULDER', 'shoulder'], ['ELBOW', 'elbow'], ['ARM', 'hand'], ['HIP', 'hip'], ['KNEE', 'knee'], ['LEG', 'ankle']]) {
      const j = J[rig + side];
      put(`${tag} ${name}`, j[0], j[1], j[2]);
    }
  };
  limb(rightSide, 'RIGHT');
  limb(leftSide, 'LEFT');
  // NECK: PixelLab puts it on the shoulder line, under the rig's neck joint
  put('NECK', J.neck[0], (J.shoulderN[1] + J.shoulderF[1]) / 2, J.neck[2]);
  // face: screen x of (forward F, right R) is head.x + fx*F + rx*R, its depth head.z + fz*F + rz*R
  const hd = J.head, at = (F, R, DY) => [hd[0] + f[0] * F + r[0] * R, hd[1] + DY, hd[2] + f[1] * F + r[1] * R];
  put('NOSE', ...at(FACE.noseF, 0, FACE.noseDY));
  for (const [tag, sgn] of [['RIGHT', 1], ['LEFT', -1]]) {
    const turnedAway = sgn * r[1] < -0.5; // the side that faces away from the viewer sits a little further back
    put(`${tag} EYE`, ...at(turnedAway ? FACE.eyeFfar : FACE.eyeF, sgn * FACE.eyeR, FACE.eyeDY));
    put(`${tag} EAR`, ...at(turnedAway ? FACE.earFfar : FACE.earF, sgn * FACE.earR, FACE.earDY));
  }
  return LABELS.map((l) => P[l]);
}

/** Everything in the json: { canvas, cell, pivot, scale, directions: { dir: { idle, walk: [8] } } }. */
export function buildKeypoints() {
  const directions = {};
  for (const dir of DIRS) {
    const { idle, walk } = posesOfDir(dir);
    directions[dir] = { idle: keypointsOf(idle, dir), walk: walk.map((p) => keypointsOf(p, dir)) };
  }
  return { canvas: CANVAS, cell: CELL, pivot: [...PIVOT], scale: SCALE, directions };
}
