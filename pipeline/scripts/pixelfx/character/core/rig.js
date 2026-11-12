// The character who acts: a real skeleton in 3D, drawn down to pixels the way Dead Cells makes its sprites. Bones have
// fixed lengths and hang from each other, pelvis to spine to chest to shoulders, so the body can twist, bend and turn round,
// and depth decides what's in front. A pose only says where the hands and feet should be and how the body is carrying
// itself; the solver works out every joint, and the renderer shades it into a few flat tones with one clean ink line.
//
// Coordinates: x right, y up, z towards the viewer, in pixels, the feet at the origin. Poses are in screen terms (y negative
// is up), as effects are. The character faces +x with his right side towards the viewer, so the right hand is the near one.
//
// A rendered pose also knows, for each of its pixels, which pixel of the standing character it came from (`src`). That
// is what lets an effect drawn on the standing body (frost, poison, a scan line) follow the body wherever it goes.

import { hex } from "./color.js";
import { DUMMY_PAL } from "./actor.js";

const PAL = Object.fromEntries(Object.entries(DUMMY_PAL).map(([k, v]) => [k, hex(v) >>> 0]));
// plates and joints: lit to dark
const SHELL = [PAL.A, PAL.B, PAL.C, PAL.D], CORE = [PAL.E, PAL.F, PAL.G, PAL.G];
const DEG = Math.PI / 180, W0 = 24, H0 = 38;

// ---- materials (forked): how a body pixel is coloured, instead of the baked DUMMY_PAL tones
// A material is { id, ink, seam, mark, fallback, layers }. `layers` is ordered top first; each layer is called with
// one object and returns a colour number or null:
//   { x, y }  the rest-space cell (0..23, 0..37) the pose pixel came from (`src`); -1 when it maps outside
//   { part }  "head" | "torso" | "nearLimb" | "farLimb" | "weapon"
//   { bone }  the exact rig part the pixel was drawn for (pelvis, chest, head, thighN, foreF, ...)
//   { tone }  pixelfx's flat tone: 0 lit, 1 base, 2 shade, 3 darkest (far limbs already one step down)
//   { mat }   0 shell, 1 core (the joints)
// The first layer that returns a colour wins; if none does, `fallback` is used.
const GREY = {
  id: "grey",
  ink: PAL.k, seam: PAL.J, mark: PAL.m, fallback: PAL.G,
  layers: [(p) => (p.mat === 1 ? CORE : SHELL)[p.tone]],
};
let MATERIAL = GREY;
/** Use `m` as the material for every later posed() that doesn't name one of its own (null restores the stock grey). */
export function setMaterial(m) { MATERIAL = m ?? GREY; }

// ---- vectors and turns
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => mul(a, 1 / (len(a) || 1e-6));
const rotY = (t) => { const c = Math.cos(t), s = Math.sin(t); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const rotZ = (t) => { const c = Math.cos(t), s = Math.sin(t); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
const mm = (A, B) => { const o = new Array(9); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]; return o; };
const mv = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
const tv = (M, v) => [M[0] * v[0] + M[3] * v[1] + M[6] * v[2], M[1] * v[0] + M[4] * v[1] + M[7] * v[2], M[2] * v[0] + M[5] * v[1] + M[8] * v[2]];
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ---- the body's measurements, in pixels
const M0 = {
  pelvis: 19.7, spine1: 2.8, spine2: 4.6, shoulderUp: 2.5, shoulderOut: 5.9, neckUp: 4.0, headUp: 3.1,
  hipDown: 1.1, hipOut: 2.8, thigh: 8.6, shin: 8.3, upper: 7.6, fore: 7.4, turn: 36 * DEG,
};
/** T90: the lengths materials need for bone-local rules (a thigh's own length). */
export const BONE_LEN = { thigh: M0.thigh };
/** Standing easy, in screen terms: hands and feet are where they should end up, y negative is up. */
export const STAND = { lean: 0, crouch: 0, yaw: 0, fx: -3, fy: -15, bx: 5, by: -15, ffx: -2, ffy: -4, fbx: 3, fby: -4 };

// ---- solving a pose: from where the hands and feet should be, to every joint
function ik(a, target, L1, L2, pole) {
  let to = sub(target, a), d = len(to);
  const reach = L1 + L2 - 0.02;
  if (d > reach) { to = mul(to, reach / d); d = reach; }
  const u = unit(to), along = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - along * along));
  let v = sub(pole, mul(u, dot(pole, u)));
  v = len(v) < 1e-4 ? unit(cross(u, [0, 0, 1])) : unit(v);
  return { joint: add(a, add(mul(u, along), mul(v, h))), end: add(a, to), u, v };
}
function frame(t, R) {
  return { t, R };
}
// a frame along a bone: its local x runs down the bone
function boneFrame(a, b, pole) {
  const x = unit(sub(b, a));
  let y = sub(pole, mul(x, dot(pole, x)));
  y = len(y) < 1e-4 ? unit(cross(x, [0, 0, 1])) : unit(y);
  const z = cross(x, y);
  return frame(a, [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]]);
}
const weaponOf = (name) => WEAPONS[name];

function solve(pose) {
  // OUTFIT FORK: pose.scale multiplies every length (bones, radii, default offsets); 1 = the stock figure
  // pose.scaleLimb (default = scale) scales the arm and leg bones and radii on their own: the AI body has torso and head
  // proportions of 1.25x the rig but limbs of 1.0x.
  const SC = pose.scale ?? 1, SL = pose.scaleLimb ?? SC, LIMB_KEYS = ["thigh", "shin", "upper", "fore"];
  const M = SC === 1 && SL === 1 ? M0 : Object.fromEntries(Object.entries(M0).map(([k, v]) => [k, k === "turn" ? v : v * (LIMB_KEYS.includes(k) ? SL : SC)]));
  const q = { ...STAND, ...pose }, lean = q.lean, W = q.weapon && weaponOf(q.weapon), OW = q.offWeapon && weaponOf(q.offWeapon);
  const sa = q.sa ?? 0, wl = q.wl ?? 1, axisZ = Math.sqrt(Math.max(0, 1 - wl * wl)) * (q.wz ?? 1);
  const axis = [Math.cos(sa) * wl, -Math.sin(sa) * wl, axisZ], side = [-Math.sin(sa), -Math.cos(sa), 0];
  const two = !!(q.two && W), nearZ = q.fz ?? (two ? 3 : 4.5) * SC;
  // how the chest is turned follows the hands: a hand driving forward brings its shoulder round; one drawn back opens him up
  const fwd = (q.fx - STAND.fx) / 24, farFwd = two ? 0 : (q.bx - STAND.bx) / 22;
  let turn = M.turn + (fwd >= 0 ? -44 * DEG * Math.min(1, fwd) : 28 * DEG * Math.min(1, -fwd * 1.8));
  turn += (farFwd > 0 ? 34 * DEG * Math.min(1, farFwd) : 0) + (q.twist ?? 0) * 4 * DEG;
  if (q.turn !== undefined) turn = q.turn;
  const hipTurn = M.turn + (turn - M.turn) * 0.45, tilt = Math.atan2(lean, 13 * SC);
  const Rp = mm(rotZ(-tilt * 0.25), rotY(-hipTurn)), Rc = mm(rotZ(-tilt), rotY(-turn));
  // feet first: the pelvis sinks if that's what it takes for both legs to reach them
  const ankleN = [q.ffx, -q.ffy - 1.8 * SL, q.fzz ?? 2.4 * SC], ankleF = [q.fbx, -q.fby - 1.8 * SL, q.bzz ?? -2.4 * SC];
  let pelvis = [lean * 0.2, M.pelvis - q.crouch, 0];
  const hipAt = (s) => add(pelvis, mv(Rp, [0, -M.hipDown, s * M.hipOut]));
  const maxLeg = (M.thigh + M.shin) * 0.995;
  for (const [s, a] of [[1, ankleN], [-1, ankleF]]) {
    const h = hipAt(s), dx = h[0] - a[0], dz = h[2] - a[2], flat = dx * dx + dz * dz;
    if (flat < maxLeg * maxLeg) {
      const top = a[1] + Math.sqrt(maxLeg * maxLeg - flat);
      if (h[1] > top) pelvis = [pelvis[0], pelvis[1] - (h[1] - top), pelvis[2]];
    }
  }
  const waist = add(pelvis, [Math.sin(tilt * 0.45) * M.spine1, Math.cos(tilt * 0.45) * M.spine1, 0]);
  const chest = add(waist, [Math.sin(tilt) * M.spine2, Math.cos(tilt) * M.spine2, 0]);
  const neck = add(chest, mv(Rc, [0, M.neckUp, 0]));
  // the head keeps looking where he's going: it takes only part of the lean and part of the turn
  const headTurn = M.turn * 0.9 + (turn - M.turn) * 0.35, nod = tilt * 0.35 + (q.hy ?? 0) * 7 * DEG, roll = (q.hx ?? 0) * 7 * DEG;
  const Rh = mm(rotZ(-nod - roll), rotY(-headTurn));
  const head = add(neck, mv(Rh, [0.15 * SC, M.headUp, 0]));
  // the arms: shoulders reach a little towards a far hand
  const pick = (s, target) => {
    const base = add(chest, mv(Rc, [0, M.shoulderUp, s * M.shoulderOut])), to = sub(target, base), d = len(to);
    return add(base, mul(unit(to), Math.min(1.8 * SC, Math.max(0, d - 11 * SC) * 0.35)));
  };
  const nearT = [q.fx, -q.fy, nearZ];
  const farT = two ? [q.fx + axis[0] * W.two, -q.fy + axis[1] * W.two, nearZ + axis[2] * W.two] : [q.bx, -q.by, q.bz ?? (q.armsFront ? 5.5 : -4.5) * SC];
  const sN = pick(1, nearT), sF = pick(-1, farT);
  const pole = (s, T, shoulder, hold) => {
    // elbows hang down and back; overhead they go out and forward. q.armZ < 0 swings the
    // elbow across the body instead (T88: the turned front/back walk keeps the arms beside
    // the torso instead of bowing them out); default 1 is the stock side-walk elbow.
    const up = clamp01((T[1] - shoulder[1] + 2 * SC) / (10 * SC));
    const base = [-0.55 + up * 1.1, -1 + up * 0.9, s * (0.45 + up * 0.5) * (q.armZ ?? 1)];
    if (!hold) return base;
    // holding something, the forearm wants to meet the handle side on: try round the circle, keep the best
    const u = unit(sub(T, shoulder));
    let best = base, score = Infinity;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, x = unit(cross(u, [0.3, 1, 0.2])), y = cross(u, x), v = add(mul(x, Math.cos(a)), mul(y, Math.sin(a)));
      const A = ik(shoulder, T, M.upper, M.fore, v), f = unit(sub(A.end, A.joint));
      const cost = Math.abs(dot(f, hold)) * 0.7 + (1 - dot(unit(base), v)) * 0.55;
      if (cost < score) { score = cost; best = v; }
    }
    return best;
  };
  const holdN = W ? (W.across ? side : axis) : null, holdF = two ? (W.across ? side : axis) : OW ? [Math.cos(q.sb ?? Math.PI), -Math.sin(q.sb ?? Math.PI), 0] : null;
  const armN = ik(sN, nearT, M.upper, M.fore, pole(1, nearT, sN, holdN)), armF = ik(sF, farT, M.upper, M.fore, pole(-1, farT, sF, holdF));
  // the legs: knees forward, a little out
  const kneePole = (s) => mv(Rp, [1, 0, s * 0.35]);
  const hipN = hipAt(1), hipF = hipAt(-1);
  const legN = ik(hipN, ankleN, M.thigh, M.shin, kneePole(1)), legF = ik(hipF, ankleF, M.thigh, M.shin, kneePole(-1));
  const footDir = (s) => { const t = hipTurn * 0.6 + s * 8 * DEG; return [Math.cos(t), 0, Math.sin(t)]; };
  const B = {
    pelvis: frame(pelvis, Rp), waist: frame(waist, mm(rotZ(-tilt * 0.6), rotY(-(turn + hipTurn) / 2))), chest: frame(chest, Rc), head: frame(head, Rh), neck: frame(neck, Rh),
    upperN: boneFrame(sN, armN.joint, armN.v), foreN: boneFrame(armN.joint, armN.end, armN.v), upperF: boneFrame(sF, armF.joint, armF.v), foreF: boneFrame(armF.joint, armF.end, armF.v),
    thighN: boneFrame(hipN, legN.joint, legN.v), shinN: boneFrame(legN.joint, legN.end, legN.v), thighF: boneFrame(hipF, legF.joint, legF.v), shinF: boneFrame(legF.joint, legF.end, legF.v),
  };
  B.footN = frame(legN.end, mm(rotY(-Math.atan2(footDir(1)[2], footDir(1)[0])), rotZ(q.toeF ? -55 * DEG : 0)));
  B.footF = frame(legF.end, mm(rotY(-Math.atan2(footDir(-1)[2], footDir(-1)[0])), rotZ(q.toeB ? -55 * DEG : 0)));
  return { B, W, OW, q, axis, side, armN, armF, legN, legF, sN, sF, hipN, hipF, turn, sc: SC, sl: SL, sw: pose.scaleWeapon ?? SC };
}

// ---- drawing: every part goes through one depth buffer
const BW = 300, BH = 240, OX = 150, OY = 180; // the scratch grid, big enough for a raised scythe; feet at (OX, OY)
const Zb = new Float32Array(BW * BH), Tone = new Float32Array(BW * BH), Part = new Int8Array(BW * BH), Mat = new Int8Array(BW * BH), Fr = new Int8Array(BW * BH), LX = new Float32Array(BW * BH), LY = new Float32Array(BW * BH), Col = new Uint32Array(BW * BH);
const touched = [];
const LIGHT = unit([-0.55, 0.72, 0.5]);
let clipBody = false, clipWeapon = false, curFrameIndex = 0, curDim = 0, onlyPart = 0;
const FRAME_IDS = ["pelvis", "waist", "chest", "head", "neck", "upperN", "foreN", "upperF", "foreF", "thighN", "shinN", "thighF", "shinF", "footN", "footF"];
function plot(i, z, tone, part, mat, wx, wy, color) {
  if (onlyPart && part !== onlyPart) return;
  if (Part[i] === 0) touched.push(i);
  else if (z <= Zb[i]) return;
  Zb[i] = z;
  Tone[i] = tone;
  Part[i] = part;
  Mat[i] = mat;
  Fr[i] = curFrameIndex;
  LX[i] = wx;
  LY[i] = wy;
  Col[i] = color;
}
function sphere(c, r, part, mat) {
  const x0 = Math.floor(c[0] - r), x1 = Math.ceil(c[0] + r), y0 = Math.floor(c[1] - r), y1 = Math.ceil(c[1] + r);
  for (let wy = y0; wy <= y1; wy++)
    for (let wx = x0; wx <= x1; wx++) {
      const dx = wx - c[0], dy = wy - c[1], d2 = dx * dx + dy * dy;
      if (d2 > r * r || (clipBody && wy < 1.5)) continue;
      const dz = Math.sqrt(r * r - d2), n = [dx / r, dy / r, dz / r], i = (OY - wy) * BW + (OX + wx);
      plot(i, c[2] + dz, dot(n, LIGHT), part, mat, wx, wy, 0);
    }
}
function sweep(a, b, ra, rb, part, mat, bulge = 0) {
  const n = Math.max(2, Math.ceil(len(sub(b, a)) / 0.4));
  for (let k = 0; k <= n; k++) {
    const u = k / n;
    sphere(add(a, mul(sub(b, a), u)), ra + (rb - ra) * u + bulge * Math.sin(u * Math.PI), part, mat);
  }
}
// an ellipsoid with radii r along the axes of frame R, seen along z
function ellipsoid(c, R, r, part, mat) {
  const big = Math.max(r[0], r[1], r[2]), x0 = Math.floor(c[0] - big), x1 = Math.ceil(c[0] + big), y0 = Math.floor(c[1] - big), y1 = Math.ceil(c[1] + big);
  const Rt = [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]], D = [1 / (r[0] * r[0]), 1 / (r[1] * r[1]), 1 / (r[2] * r[2])];
  // A = R diag(D) R^T
  const A = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) A[i * 3 + j] = R[i * 3] * D[0] * R[j * 3] + R[i * 3 + 1] * D[1] * R[j * 3 + 1] + R[i * 3 + 2] * D[2] * R[j * 3 + 2];
  void Rt;
  for (let wy = y0; wy <= y1; wy++)
    for (let wx = x0; wx <= x1; wx++) {
      if (clipBody && wy < 1.5) continue;
      const dx = wx - c[0], dy = wy - c[1];
      const qa = A[8], qb = 2 * (A[2] * dx + A[5] * dy), qc = A[0] * dx * dx + 2 * A[1] * dx * dy + A[4] * dy * dy - 1, disc = qb * qb - 4 * qa * qc;
      if (disc < 0) continue;
      const dz = (-qb + Math.sqrt(disc)) / (2 * qa);
      const n = unit([A[0] * dx + A[1] * dy + A[2] * dz, A[3] * dx + A[4] * dy + A[5] * dz, A[6] * dx + A[7] * dy + A[8] * dz]);
      plot((OY - wy) * BW + (OX + wx), c[2] + dz, dot(n, LIGHT), part, mat, wx, wy, 0);
    }
}
// parts: each has its own number, so edges between them can be seen
const PART = { pelvis: 1, waist: 2, chest: 3, neck: 4, head: 5, face: 6, upperN: 7, elbowN: 8, foreN: 9, handN: 10, upperF: 11, elbowF: 12, foreF: 13, handF: 14, thighN: 15, kneeN: 16, shinN: 17, footN: 18, thighF: 19, kneeF: 20, shinF: 21, footF: 22, weapon: 23, offWeapon: 24 };
const useFrame = (name) => { curFrameIndex = FRAME_IDS.indexOf(name); };
export const BONE = Object.fromEntries(Object.entries(PART).map(([k, v]) => [v, k]));
// the material's coarse regions, from the part number the pixel was drawn for
const isFar = (part) => (part >= PART.upperF && part <= PART.handF) || (part >= PART.thighF && part <= PART.footF);
function partOf(part) {
  if (part === PART.weapon || part === PART.offWeapon) return "weapon";
  if (part === PART.head || part === PART.face) return "head";
  if (part >= PART.pelvis && part <= PART.neck) return "torso";
  return isFar(part) ? "farLimb" : "nearLimb";
}

function drawBody(S) {
  const { B, armN, armF, legN, legF, sN, sF, hipN, hipF, turn } = S, F_ = (name) => B[name];
  const k = S.sc ?? 1, kl = S.sl ?? k, ks = (a) => a.map((v) => v * k); // OUTFIT FORK: scale (torso/head) and limb scale
  useFrame("pelvis");
  ellipsoid(add(F_("pelvis").t, mv(F_("pelvis").R, ks([0, -0.2, 0]))), F_("pelvis").R, ks([2.9, 2.6, 4.2]), PART.pelvis, 0);
  useFrame("waist");
  sweep(F_("pelvis").t, F_("chest").t, 3 * k, 3.3 * k, PART.waist, 1);
  useFrame("chest");
  ellipsoid(add(F_("chest").t, mv(F_("chest").R, ks([0.2, 0.9, 0]))), F_("chest").R, ks([3.4, 4.2, 5.5]), PART.chest, 0);
  useFrame("neck");
  sweep(F_("neck").t, add(F_("neck").t, mv(F_("head").R, ks([0, 1.6, 0]))), 1.25 * k, 1.15 * k, PART.neck, 1);
  useFrame("head");
  ellipsoid(F_("head").t, F_("head").R, ks([3, 3.3, 2.8]), PART.head, 0);
  ellipsoid(add(F_("head").t, mv(F_("head").R, ks([0.85, -0.45, 0]))), F_("head").R, ks([2.4, 2.7, 2.35]), PART.face, 0);
  const arm = (far, A, sh, up, el, fo, ha, nameU, nameF) => {
    curDim = far ? 1 : 0;
    useFrame(nameU);
    // T91: the turned/idle poses keep T88-T90's thin 2-4 px arm (armThin); a pose without the flag
    // draws the stock arm radii, so the side walk (and the T86 walk sheet) matches pixelfx exactly
    const thin = S.q.armThin === true;
    sphere(sh, (thin ? 1.8 : 2.5) * kl, up, 0);
    sweep(sh, A.joint, (thin ? 1.8 : 2.1) * kl, (thin ? 1.5 : 1.6) * kl, up, 0);
    sphere(A.joint, (thin ? 2.0 : 1.45) * kl, el, 1);
    useFrame(nameF);
    // T90: a hand can be drawn a px above/below its IK target (q.handDyN/F), or at a fixed drop
    // below the shoulder (q.handDropN/F) so the arm swing is exactly the offset and not the IK's
    // clamped reach; a forearm can be drawn short of it (q.foreTrimN/F)
    const drop = (far ? S.q.handDropF : S.q.handDropN) ?? 0;
    let end = drop ? [A.end[0], sh[1] - drop, A.end[2]] : A.end;
    const dy = (far ? S.q.handDyF : S.q.handDyN) ?? 0;
    if (dy) end = [end[0], end[1] + dy, end[2]];
    const trim = (far ? S.q.foreTrimF : S.q.foreTrimN) ?? 0;
    if (trim > 0) end = add(A.joint, mul(unit(sub(end, A.joint)), Math.max(1, len(sub(end, A.joint)) - trim)));
    sweep(A.joint, end, (thin ? 1.5 : 1.6) * kl, (thin ? 1.3 : 1.2) * kl, fo, 0, 0.15 * kl);
    sphere(end, (thin ? 1.5 : 1.9) * kl, ha, 0);
    curDim = 0;
  };
  arm(false, armN, sN, PART.upperN, PART.elbowN, PART.foreN, PART.handN, "upperN", "foreN");
  arm(true, armF, sF, PART.upperF, PART.elbowF, PART.foreF, PART.handF, "upperF", "foreF");
  const leg = (far, L, hip, th, kn, sh, fo, nameT, nameS, nameFt) => {
    useFrame(nameT);
    sweep(hip, L.joint, 3.2 * kl, 2.2 * kl, th, 0);
    sphere(L.joint, 1.9 * kl, kn, 1);
    useFrame(nameS);
    sweep(L.joint, L.end, 2.15 * kl, 1.4 * kl, sh, 0, 0.4 * kl);
    useFrame(nameFt);
    const R = F_(nameFt).R, a = F_(nameFt).t;
    sweep(add(a, mv(R, [-1.5 * kl, -0.6 * kl, 0])), add(a, mv(R, [4.6 * kl, -1.1 * kl, 0])), 1.7 * kl, 1.25 * kl, fo, 0);
  };
  leg(false, legN, hipN, PART.thighN, PART.kneeN, PART.shinN, PART.footN, "thighN", "shinN", "footN");
  leg(true, legF, hipF, PART.thighF, PART.kneeF, PART.shinF, PART.footF, "thighF", "shinF", "footF");
  void turn;
}

// ---- what they hold: drawn along the handle from the fist, through the same depth buffer
function along(H, axis, side, part, sc = 1) {
  const n = cross(axis, side);
  // OUTFIT FORK: sc scales the weapon's own measurements (1 = the stock weapon, same arithmetic as before)
  const T = (i, k, c, lift = 0) => {
    const x = sc === 1 ? H[0] + axis[0] * i + side[0] * k + n[0] * lift : H[0] + (axis[0] * i + side[0] * k + n[0] * lift) * sc, y = sc === 1 ? H[1] + axis[1] * i + side[1] * k + n[1] * lift : H[1] + (axis[1] * i + side[1] * k + n[1] * lift) * sc, z = sc === 1 ? H[2] + axis[2] * i + side[2] * k + n[2] * lift : H[2] + (axis[2] * i + side[2] * k + n[2] * lift) * sc;
    const wx = Math.round(x), wy = Math.round(y);
    if (clipWeapon && wy < 0) return;
    const idx = (OY - wy) * BW + (OX + wx);
    if (idx < 0 || idx >= BW * BH) return;
    curFrameIndex = -1;
    plot(idx, z + 0.05, 2, part, 2, wx, wy, c);
  };
  T.at = (i, k) => (sc === 1 ? [H[0] + axis[0] * i + side[0] * k, H[1] + axis[1] * i + side[1] * k, H[2] + axis[2] * i + side[2] * k] : [H[0] + (axis[0] * i + side[0] * k) * sc, H[1] + (axis[1] * i + side[1] * k) * sc, H[2] + (axis[2] * i + side[2] * k) * sc]);
  return T;
}
const STEEL = Object.fromEntries(Object.entries({ hi: "#ffffff", a: "#e8edf6", b: "#a4afc6", d: "#68748f", gold: "#ffd84a", goldD: "#b8862a", grip: "#7a3a2a", gripD: "#4a2018", wood: "#8a5a32", woodD: "#5a3820", dark: "#3a3448", darkD: "#262033", olive: "#58663f", oliveA: "#7d8c58", oliveD: "#3a4529" }).map(([k, v]) => [k, hex(v) >>> 0]));
function blade(T, from, length, w) {
  for (let i = from; i <= from + length + 0.01; i += 0.4) {
    const r = i - from, wd = r > length - 5 ? Math.max(0, ((length - r) / 5) * w) : w;
    for (let k = -wd; k <= wd + 0.01; k += 0.4) T(i, k, k < -w * 0.4 ? STEEL.hi : k > w * 0.4 ? STEEL.d : STEEL.a);
  }
}
const haft = (T, from, to, a, d, r = 0.8) => {
  for (let i = from; i <= to; i += 0.4) for (let k = -r; k <= r + 0.01; k += 0.4) T(i, k, k > 0.1 ? d : a);
};
export const WEAPONS = {
  // the fist is at i = 0; `two` is where the other hand goes; `across`: the handle lies across the weapon's length
  sword: { two: -4.4, draw(T, q) {
    const end = q.two ? -6.5 : -2.6;
    haft(T, end, 2.2, STEEL.grip, STEEL.gripD);
    for (let k = -1.4; k <= 1.4; k += 0.4) T(end - 0.4, k, STEEL.gold);
    for (let k = -4.6; k <= 4.6; k += 0.4) (T(2.6, k, Math.abs(k) > 3.8 ? STEEL.goldD : STEEL.gold), T(3, k, STEEL.goldD));
    blade(T, 3.2, 25, 2.2);
  } },
  greatsword: { two: -4.8, draw(T) {
    haft(T, -7.2, 2.2, STEEL.grip, STEEL.gripD);
    for (let k = -1.8; k <= 1.8; k += 0.4) T(-7.6, k, STEEL.gold);
    for (let k = -6.6; k <= 6.6; k += 0.4) (T(2.6, k, Math.abs(k) > 5.6 ? STEEL.goldD : STEEL.gold), T(3, k, STEEL.goldD));
    blade(T, 3.2, 31, 3);
    for (let i = 4; i <= 28; i += 0.4) T(i, 0, STEEL.b);
  } },
  dagger: { draw(T) {
    haft(T, -2.4, 1.8, STEEL.grip, STEEL.gripD);
    for (let k = -2.6; k <= 2.6; k += 0.4) T(2.2, k, STEEL.goldD);
    blade(T, 2.6, 10, 1.3);
  } },
  spear: { two: -12, draw(T) {
    haft(T, -18, 36, STEEL.wood, STEEL.woodD, 0.5);
    blade(T, 36, 11, 2);
    for (let k = -2.4; k <= 2.4; k += 0.4) T(36, k, STEEL.goldD);
  } },
  hammer: { two: -7, draw(T) {
    for (const lift of [-0.8, 0, 0.8]) for (let i = -10; i <= 18; i += 0.4) for (let k = -0.8; k <= 0.81; k += 0.4) T(i, k, k > 0.1 ? STEEL.woodD : STEEL.wood, lift);
    // the head is a block: its two faces, and the steel between them
    for (let i = 18; i <= 28; i += 0.4) for (let k = -9; k <= 9; k += 0.4) {
      const face = Math.abs(k) > 7.4 ? (k < 0 ? STEEL.a : STEEL.d) : i < 20 ? STEEL.hi : i > 26.4 ? STEEL.d : Math.abs(k) < 2 ? STEEL.gold : STEEL.b;
      T(i, k, face, 4.5);
      T(i, k, face, -4.5);
      if (i < 18.4 || i > 27.6 || Math.abs(k) > 8.6) for (let l = -4; l <= 4; l += 0.4) T(i, k, k < 0 ? STEEL.a : i > 27.6 ? STEEL.d : STEEL.b, l);
    }
  } },
  scythe: { two: -11, draw(T) {
    haft(T, -16, 31, STEEL.dark, STEEL.darkD, 0.5);
    for (let j = 0; j <= 28; j += 0.4) {
      const u = j / 28, w = 3.2 * (1 - u) + 0.3, b = 31.5 - u * u * 12;
      for (let k = -w; k <= w; k += 0.4) T(b + k, j + 0.8, k > w * 0.3 ? STEEL.hi : k < -w * 0.4 ? STEEL.d : STEEL.b);
    }
  } },
  claw: { draw(T) {
    for (const q0 of [-2.4, 0, 2.4])
      for (let i = 2; i <= 9.5; i += 0.4) {
        const u = (i - 2) / 7.5, k = q0 + u * u * 1.8;
        T(i, k, u > 0.55 ? STEEL.hi : STEEL.a);
        if (u < 0.6) T(i, k + 0.8, STEEL.d);
      }
  } },
  bow: { across: true, draw(T, q, off) {
    for (let u = -1; u <= 1.001; u += 0.025) {
      const k = u * 17, i = 6 * (1 - u * u) - 1;
      T(i, k, Math.abs(u) > 0.85 ? STEEL.goldD : STEEL.wood);
      T(i + 0.8, k, STEEL.woodD);
    }
    const tipA = T.at(-1, -17), tipB = T.at(-1, 17), mid = q.pull ? off : T.at(-1, 0);
    const line = (A, B, c) => {
      const n = Math.max(2, Math.ceil(len(sub(B, A)) / 0.4)), Z = STEEL.a;
      for (let k = 0; k <= n; k++) {
        const P = add(A, mul(sub(B, A), k / n)), wx = Math.round(P[0]), wy = Math.round(P[1]), idx = (OY - wy) * BW + (OX + wx);
        curFrameIndex = -1;
        plot(idx, P[2] + 0.05, 2, PART.weapon, 2, wx, wy, c ?? Z);
      }
    };
    line(tipA, mid);
    line(tipB, mid);
    if (q.nocked) {
      const nock = mid, tip = T.at(13, 0);
      line(nock, tip, STEEL.wood);
      for (let i = 9; i <= 13; i += 0.4) for (let k = -(13 - i) * 0.45; k <= (13 - i) * 0.45; k += 0.4) T(i, k, STEEL.hi);
    }
  } },
  pistol: { across: true, draw(T) {
    for (let i = -1; i <= 9.5; i += 0.4) for (let k = -4.2; k <= -2.4; k += 0.4) T(i, k, k < -3.6 ? STEEL.a : k > -2.9 ? STEEL.d : STEEL.b);
    for (let i = -1.2; i <= 1.2; i += 0.4) for (let k = -2.4; k <= 2.4; k += 0.4) T(i, k, STEEL.gripD);
    T(9, -4.6, STEEL.hi);
  } },
  launcher: { two: -9, draw(T) {
    for (let i = -14; i <= 22; i += 0.4) for (let k = -6; k <= -1; k += 0.4) T(i, k, k < -4.8 ? STEEL.oliveA : k > -2.2 ? STEEL.oliveD : Math.abs(i - 3) < 1.4 ? STEEL.gold : STEEL.olive);
    for (let k = -6.8; k <= -0.2; k += 0.4) (T(22.4, k, STEEL.b), T(-14.4, k, STEEL.d));
  } },
  // OUTFIT FORK: pixelfx's current staff and bow (Desktop/Claude code/pixelfx src/core/rig.js), copied verbatim under their own names
  pfstaff: { two: -9, draw(T) {
    haft(T, -14, 12, STEEL.wood, STEEL.woodD, 0.7);
    for (let i = -4; i <= 4; i += 0.4)
      for (let k = -1.3; k <= 1.3; k += 0.4) T(i, k, k > 0.25 ? STEEL.gripD : STEEL.grip);
    for (const i of [-14, 6, 12, 13]) for (let k = -1.7; k <= 1.7; k += 0.4) T(i, k, i < 6 ? STEEL.goldD : STEEL.gold);
    for (let i = 15; i <= 24; i += 0.3) {
      const u = (i - 15) / 9, w = 3.2 * (1 - Math.abs(u * 2 - 1));
      for (let k = -w; k <= w + 0.01; k += 0.4) {
        const v = k / Math.max(0.1, w);
        T(i, k, v < -0.55 ? STEEL.hi : v < -0.1 ? STEEL.a : v > 0.5 ? STEEL.dark : v > 0.05 ? STEEL.b : STEEL.d);
      }
    }
    for (const k of [-2.3, 2.3]) for (let i = 13; i <= 17; i += 0.4) T(i, k - (i - 13) * 0.2, STEEL.goldD);
    for (let k = -2.3; k <= 2.3; k += 0.4) T(13, k, STEEL.gold);
    for (let i = 17; i <= 21; i += 0.4) T(i, -1.6 + (i - 17) * 0.16, STEEL.hi);
  } },
  pfbow: { across: true, draw(T, q, off) {
    for (let u = -1; u <= 1.001; u += 0.025) {
      const k = u * 17, i = 6 * (1 - u * u) - 4;
      T(i, k, Math.abs(u) > 0.85 ? STEEL.goldD : STEEL.wood);
      T(i + 0.8, k, STEEL.woodD);
    }
    const tipA = T.at(-4, -17), tipB = T.at(-4, 17), mid = q.pull ? off : T.at(-4, 0);
    const line = (A, B, c) => {
      const n = Math.max(2, Math.ceil(len(sub(B, A)) / 0.4)), Z = STEEL.a;
      for (let k = 0; k <= n; k++) {
        const P = add(A, mul(sub(B, A), k / n)), wx = Math.round(P[0]), wy = Math.round(P[1]), idx = (OY - wy) * BW + (OX + wx);
        curFrameIndex = -1;
        plot(idx, P[2] + 0.05, 2, PART.weapon, 2, wx, wy, c ?? Z);
      }
    };
    line(tipA, mid);
    line(tipB, mid);
    if (q.nocked) {
      const nock = mid, tip = T.at(13, 0);
      line(nock, tip, STEEL.wood);
      for (let i = 9; i <= 13; i += 0.4) for (let k = -(13 - i) * 0.45; k <= (13 - i) * 0.45; k += 0.4) T(i, k, STEEL.hi);
    }
  } },
  handle: { draw(T) {
    haft(T, -2.6, 6, STEEL.grip, STEEL.gripD);
    for (let k = -1.6; k <= 1.6; k += 0.4) (T(-3, k, STEEL.gold), T(6.4, k, STEEL.gold));
  } },
};

// T91: a sealed fill between two ink cells can still be alone; give it a non-ink 4-neighbour's
// colour. `fills` holds the output indices the holes were written at (finish records push()'s
// return), so each recolour lands on its own hole, never on the pixel after it.
export function recolourSealedFills(out, fills, ink) {
  const INKU = ink >>> 0, outAt = new Map();
  for (let r = 0; r < out.n; r++) outAt.set(`${out.xs[r]},${out.ys[r]}`, r);
  for (const q of fills) {
    const x = out.xs[q], y = out.ys[q], c = out.color[q];
    const nb = [];
    let same = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const r = outAt.get(`${x + dx},${y + dy}`);
      if (r === undefined) continue;
      if (out.color[r] === c) { same = true; break; }
      nb.push(out.color[r]);
    }
    if (same) continue;
    const pick = nb.find((v) => (v >>> 0) !== INKU);
    if (pick) out.color[q] = pick;
  }
  return out;
}

// ---- flat tones, seams, and one clean ink line
const frameScale = (S, name) => ((/^(upper|fore|thigh|shin|foot)/.test(name) ? S.sl : S.sc) ?? 1); // OUTFIT FORK
function finish(S, restFrames, material) {
  const M_ = material ?? MATERIAL, INK = M_.ink, SEAM = M_.seam;
  const INKU = INK >>> 0; // Col is a Uint32Array: compare its unsigned reads, not the signed constant
  const dim = (part) => part >= PART.upperF && part <= PART.handF ? 1 : part >= PART.thighF && part <= PART.footF ? 1 : 0;
  const toneOf = (v, part) => {
    let t = v > 0.8 ? 0 : v > 0.42 ? 1 : v > 0.08 ? 2 : 3;
    t = Math.min(3, t + dim(part));
    return t;
  };
  const tones = new Map();
  for (const i of touched) tones.set(i, toneOf(Tone[i], Part[i]));
  // a lone pixel of a tone, with no neighbour like it on the same part, takes its neighbours' tone
  for (const i of touched) {
    if (Mat[i] === 2) continue;
    const t = tones.get(i), votes = [0, 0, 0, 0];
    let same = false;
    for (const d of [-1, 1, -BW, BW]) {
      const j = i + d;
      if (Part[j] !== Part[i] || !tones.has(j)) continue;
      const u = tones.get(j);
      votes[u]++;
      if (u === t) same = true;
    }
    if (!same && votes.some((v) => v > 0)) tones.set(i, votes.indexOf(Math.max(...votes)));
  }
  // the rest cell each pixel came from (the material reads it), then the material's colour
  const { B } = S;
  const srcFor = (i) => {
    const f = Fr[i];
    if (f < 0 || !restFrames) return -1;
    const name = FRAME_IDS[f], A = B[name], R0 = restFrames[name], wx = (i % BW) - OX, wy = OY - ((i / BW) | 0), P = [wx, wy, Zb[i]];
    const lp = mul(tv(A.R, sub(P, A.t)), 1 / frameScale(S, name)), rp = add(R0.t, mv(R0.R, lp)), c = Math.round(rp[0]) + 12, r = 38 - Math.round(rp[1]);
    return c < 0 || r < 0 || c >= W0 || r >= H0 ? -1 : r * W0 + c;
  };
  const srcs = new Map();
  for (const i of touched) srcs.set(i, srcFor(i));
  // T88: the pixel descriptor a material layer sees (rest cell, part, and screen/head position)
  const descOf = (i) => {
    const s = srcs.get(i);
    // T90: the pixel in its drawn bone's local frame (x down a boneFrame bone, y up for frame
    // bones); materials pick clothes by bone-local position so turned views keep them whole
    let u = 0, v = 0;
    if (Fr[i] >= 0) {
      const A = B[FRAME_IDS[Fr[i]]], P = [(i % BW) - OX, OY - ((i / BW) | 0), Zb[i]];
      const lp = mul(tv(A.R, sub(P, A.t)), 1 / frameScale(S, FRAME_IDS[Fr[i]]));
      u = lp[0]; v = lp[1];
    }
    return {
      x: s >= 0 ? s % W0 : -1, y: s >= 0 ? Math.floor(s / W0) : -1,
      part: partOf(Part[i]), bone: BONE[Part[i]] ?? "weapon", tone: tones.get(i), mat: Mat[i], u, v,
      // the pixel's own screen cell and the head/chest joints, for materials that draw in
      // screen space (the front-view eyes); rest-cell layers ignore these
      yaw: S.whole ?? 0, sx: (i % BW) - OX, sy: OY - ((i / BW) | 0), hx: B.head.t[0], hy: B.head.t[1], cy: B.chest.t[1],
    };
  };
  for (const i of touched) {
    if (Mat[i] === 2) continue;
    const px = descOf(i);
    let c = null;
    for (const layer of M_.layers) { c = layer(px); if (c) break; }
    Col[i] = c || M_.fallback;
  }
  // the body colour under a pixel, ignoring the ink/seam marks drawn over it (used by T90's
  // cleanup of lone specks on the swing leg and by the pinhole fill)
  const bodyColour = (i) => {
    const px = descOf(i);
    let c = null;
    for (const layer of M_.layers) { c = layer(px); if (c) break; }
    if (M_.overlay) { const o = M_.overlay(px); if (o) c = o; }
    return c || M_.fallback;
  };
  // where two parts meet: the trunk and every other contact keep T88's soft seam (ink when one
  // stands clearly in front); only a limb in front of another region takes the 1 px ink edge on
  // its own side, and no mark is ever put between two segments of one limb.
  const marks = new Map();
  const LIMB = (p) => p >= 7 && p <= 22;
  const L = (p) => (p >= 7 && p <= 10 ? 7 : p >= 11 && p <= 14 ? 11 : p >= 15 && p <= 18 ? 15 : p >= 19 && p <= 22 ? 19 : p);
  for (const i of touched) {
    for (const d of [1, BW]) {
      const j = i + d;
      if (Part[j] === 0 || Part[j] === Part[i]) continue;
      const far = Zb[i] < Zb[j] ? i : j, near = far === i ? j : i, dz = Math.abs(Zb[i] - Zb[j]), steel = Mat[i] === 2 || Mat[j] === 2;
      if (Mat[far] === 2 && dz < 1) continue;
      if (L(Part[i]) === L(Part[j])) continue; // inside one limb: no line
      // never drop a mark on a pixel that also borders another part of the same limb, or the
      // 1 px line would cut across that limb
      const clash = (pix) => [pix - 1, pix + 1, pix - BW, pix + BW].some((k) => Part[k] !== 0 && Part[k] !== Part[pix] && L(Part[k]) === L(Part[pix]));
      if (steel) { if (!clash(far)) marks.set(far, INK); continue; } // gear keeps its own ink edge
      if (dz > 2.2 && LIMB(Part[near])) { if (!clash(near)) marks.set(near, INK); } // the limb in front gets the edge
      else if (!marks.has(far)) marks.set(far, SEAM); // a contact that touches: the T88 soft seam
    }
  }
  for (const [i, c] of marks) Col[i] = c;
  // T88: the material's `overlay` runs after the seams, so a face drawn on screen (the front
  // view's two eyes) is never swallowed by the face/head seam; absent on the stock materials.
  if (M_.overlay) for (const i of touched) {
    if (Mat[i] === 2) continue;
    const c = M_.overlay(descOf(i));
    if (c) Col[i] = c;
  }
  // T92: a material may recolour the whole body in one pass, after the overlay and before the
  // outline. Row-based lighting needs every pixel of a row at once, which a per-pixel layer cannot
  // see; the descriptors are the same ones the layers get. Gated by the material, so every earlier
  // material renders exactly as before.
  if (M_.shade) {
    const px = new Array(touched.length);
    for (let k = 0; k < touched.length; k++) px[k] = descOf(touched[k]);
    M_.shade({ cols: Col, idx: touched, px, ink: INK >>> 0, q: S.q });
  }
  // the mark on his chest, when it's facing us (a material without one leaves it bare)
  if (M_.mark) {
    const chestAt = add(B.chest.t, mv(B.chest.R, [3, 1.6, -1.8]));
    if (mv(B.chest.R, [1, 0, 0])[2] > 0.15) {
      const i = (OY - Math.round(chestAt[1])) * BW + (OX + Math.round(chestAt[0]));
      if (Part[i] === PART.chest) Col[i] = M_.mark;
    }
  }
  // T90: on a turned figure the swing (far) leg can pick up a lone 1 px ink speck where a hand
  // or forearm touches it; one ink pixel with no ink neighbour is not a line, so it goes back to
  // its body colour and the leg keeps no isolated speckles.
  if (S.whole ?? 0) {
    const farLeg = (p) => p >= PART.thighF && p <= PART.footF;
    const body = new Set(touched); // only drawn pixels: a ring cell's Col is stale
    const loose = [];
    for (const i of touched) {
      if ((Col[i] >>> 0) !== INKU || !farLeg(Part[i])) continue;
      if ([i - 1, i + 1, i - BW, i + BW].some((j) => body.has(j) && (Col[j] >>> 0) === INKU)) continue;
      loose.push(i);
    }
    for (const i of loose) Col[i] = bodyColour(i);
  }
  // the outline, and everything into a small list of pixels
  const list = touched.slice(), ring = new Map();
  for (const i of list) for (const d of [-1, 1, -BW, BW]) { const j = i + d; if (Part[j] === 0 && !ring.has(j)) ring.set(j, i); }
  // T88: close depth-buffer slits between parts on a turned figure: every transparent
  // cell not 4-reachable from the grid border becomes ink, so no pinhole is left inside
  // the body. Opt-in (q.seal), never on the yaw-0 side walk.
  const pinhole = new Map();
  if (S.q.seal) {
    const solid = new Set(list);
    for (const j of ring.keys()) solid.add(j);
    const seen = new Uint8Array(BW * BH), stack = [0];
    seen[0] = 1;
    while (stack.length) {
      const i = stack.pop(), x = i % BW, y = (i / BW) | 0;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= BW || ny >= BH) continue;
        const j = ny * BW + nx;
        if (seen[j] || solid.has(j)) continue;
        seen[j] = 1; stack.push(j);
      }
    }
    for (let j = 0; j < BW * BH; j++) {
      if (seen[j] || solid.has(j)) continue;
      let owner = -1;
      for (const d of [-1, 1, -BW, BW]) {
        const k = j + d;
        if (k >= 0 && k < BW * BH && solid.has(k)) { owner = ring.get(k) ?? k; break; }
      }
      if (owner >= 0) { ring.set(j, owner); solid.add(j); pinhole.set(j, owner); }
    }
  }
  const n = list.length + ring.size, out = { n, xs: new Int16Array(n), ys: new Int16Array(n), color: new Uint32Array(n), src: new Int16Array(n), ink: new Uint8Array(n), part: new Uint8Array(n), x0: 0, y0: 0, x1: 0, y1: 0 };
  let k = 0, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const push = (i, c, s, isInk, part) => {
    const at = k, x = (i % BW) - OX, y = ((i / BW) | 0) - OY;
    out.xs[k] = x; out.ys[k] = y; out.color[k] = c; out.src[k] = s; out.ink[k] = isInk ? 1 : 0; out.part[k] = part ?? Part[i] ?? 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    k++;
    return at; // T91: the index this pixel was written at (k has already advanced)
  };
  for (const i of list) push(i, Col[i], srcs.get(i), (Col[i] >>> 0) === INKU);
  // T90: a pinhole sealed inside the swing (far) leg is body, not an ink speck: fill it with the
  // colour of a 4-adjacent body pixel (never the ink line), so no lone dot sits inside the leg
  const bodySet = new Set(list), fills = [];
  for (const [j, i] of ring) {
    const owner = pinhole.get(j);
    if (owner === undefined || Part[owner] < PART.thighF || Part[owner] > PART.footF) { push(j, INK, srcs.get(i), true, 0); continue; }
    let c = 0;
    for (const d of [-1, 1, -BW, BW]) {
      const k = j + d;
      if (bodySet.has(k) && (Col[k] >>> 0) !== INKU) { c = Col[k]; break; }
    }
    if (!c) c = (bodyColour(owner) >>> 0) === INKU ? M_.fallback : bodyColour(owner);
    // T91: record the index push() wrote the hole at, never the counter it left behind
    fills.push(push(j, c, srcs.get(i), false, Part[owner])); // a sealed pinhole belongs to the leg it sits in
  }
  // a fill between two ink cells can still be alone: give it a 4-neighbour's colour
  recolourSealedFills(out, fills, INKU);
  let zs = 0;
  for (const i of list) zs += Zb[i];
  Object.assign(out, { x0, y0, x1, y1, z: list.length ? zs / list.length : 0 });
  for (const i of list) Part[i] = 0;
  touched.length = 0;
  return out;
}

const turnAll = (S, a) => {
  // the whole figure turned about the vertical through the feet
  const R = rotY(-a), P = (v) => mv(R, v);
  for (const f of Object.values(S.B)) { f.t = P(f.t); f.R = mm(R, f.R); }
  for (const A of [S.armN, S.armF, S.legN, S.legF]) { A.joint = P(A.joint); A.end = P(A.end); }
  S.sN = P(S.sN); S.sF = P(S.sF); S.hipN = P(S.hipN); S.hipF = P(S.hipF);
  S.axis = P(S.axis); S.side = P(S.side);
};
let REST_FRAMES = null;
// ---- the gear hook (forked; nothing is drawn by default)
// Later cards hang equipment here: fn({ S, PART, useFrame, plot, sphere, sweep, ellipsoid, along, frame }) draws into
// the same z-buffer right after the body and before the weapons, so depth resolves gear in front of or behind limbs.
let GEAR_PASS = null;
export function setGearPass(fn) { GEAR_PASS = fn; }
function render(pose, material) {
  const S = solve(pose), q = S.q, whole = (q.yaw ?? 0) + (q.face === -1 ? Math.PI : 0);
  if (whole) turnAll(S, whole);
  S.whole = whole; // T88: materials see the yaw and the head joint (screen-anchored eyes)
  const air = (q.y ?? 0) < -0.5;
  clipBody = !air;
  clipWeapon = !air;
  drawBody(S);
  if (GEAR_PASS) GEAR_PASS({ S, PART, useFrame, plot, sphere, sweep, ellipsoid, along, frame });
  clipBody = false;
  if (S.W) S.W.draw(along(S.armN.end, S.axis, S.side, PART.weapon, S.sw), q, S.armF.end);
  if (S.OW) {
    const sb = q.sb ?? Math.PI;
    let ax = [Math.cos(sb), -Math.sin(sb), 0], sd = [-Math.sin(sb), -Math.cos(sb), 0];
    if (whole) { const R = rotY(-whole); ax = mv(R, ax); sd = mv(R, sd); }
    S.OW.draw(along(S.armF.end, ax, sd, PART.offWeapon, S.sw), q, S.armF.end);
  }
  clipWeapon = false;
  return finish(S, REST_FRAMES, material ?? MATERIAL);
}
REST_FRAMES = solve({}).B;

const CACHE = new Map();
const keyOf = (p) => {
  let s = (p.y ?? 0) < -0.5 ? "air," : "";
  for (const k of Object.keys(p).sort()) {
    const v = p[k];
    if (v === undefined || k === "x" || k === "y" || k === "ghost") continue;
    s += k + (typeof v === "number" ? (k === "sa" || k === "sb" || k === "wl" || k === "yaw" || k === "turn" ? Math.round(v * 20) : k === "scale" || k === "scaleLimb" || k === "scaleWeapon" ? Math.round(v * 1000) : Math.round(v)) : v) + ",";
  }
  return s;
};
/** How far short of where the pose wants them the hands fall, in px: arms don't stretch. */
export function shortfall(pose) {
  const S = solve(pose), q = S.q, near = len(sub(S.armN.end, [q.fx, -q.fy, S.armN.end[2]])), far = q.two ? 0 : len(sub(S.armF.end, [q.bx, -q.by, S.armF.end[2]]));
  return Math.max(near, far);
}
/**
 * The pixels of a pose: { n, xs, ys, color, src, ink, x0, y0, x1, y1 }, in local space with the feet at (0, 0).
 * `material` colours it; without one, whatever setMaterial() last chose (stock grey by default).
 */
export function posed(pose, material) {
  const m = material ?? MATERIAL, key = (m.id ?? "custom") + "|" + keyOf(pose);
  let r = CACHE.get(key);
  if (!r) {
    if (CACHE.size > 6000) CACHE.clear();
    CACHE.set(key, (r = render(pose, m)));
  }
  return r;
}

/**
 * The skeleton of a pose, in the same local space as posed(): x right, y down, feet at (0, 0), z toward the viewer, whole
 * figure turned by its yaw. { joints: { name: [x, y, z] }, bones: [[from, to], ...], handles: [name, ...] }: the handles
 * are what a pose moves (hands and feet); everything else is solved from them.
 */
export function skeleton(pose) {
  const S = solve(pose), q = S.q, whole = (q.yaw ?? 0) + (q.face === -1 ? Math.PI : 0);
  if (whole) turnAll(S, whole);
  const { B, armN, armF, legN, legF, sN, sF, hipN, hipF } = S, at = (f, v) => add(f.t, mv(f.R, v));
  const J = {
    pelvis: B.pelvis.t, waist: B.waist.t, chest: B.chest.t, neck: B.neck.t, head: B.head.t, crown: at(B.head, [0, 3.3, 0]),
    shoulderN: sN, elbowN: armN.joint, handN: armN.end, shoulderF: sF, elbowF: armF.joint, handF: armF.end,
    hipN, kneeN: legN.joint, ankleN: legN.end, toeN: at(B.footN, [4.6, -1.1, 0]), hipF, kneeF: legF.joint, ankleF: legF.end, toeF: at(B.footF, [4.6, -1.1, 0]),
  };
  const joints = Object.fromEntries(Object.entries(J).map(([k, v]) => [k, [v[0], -v[1], v[2]]]));
  const bones = [["pelvis", "waist"], ["waist", "chest"], ["chest", "neck"], ["neck", "head"], ["head", "crown"], ["chest", "shoulderN"], ["shoulderN", "elbowN"], ["elbowN", "handN"], ["chest", "shoulderF"], ["shoulderF", "elbowF"], ["elbowF", "handF"], ["pelvis", "hipN"], ["hipN", "kneeN"], ["kneeN", "ankleN"], ["ankleN", "toeN"], ["pelvis", "hipF"], ["hipF", "kneeF"], ["kneeF", "ankleF"], ["ankleF", "toeF"]];
  return { joints, bones, handles: ["handN", "handF", "ankleN", "ankleF"] };
}
/** The figure taken apart: each part drawn alone, with its own outline, and where its middle is. For exploded views. */
export function posedParts(pose) {
  const out = [];
  for (const [name, part] of Object.entries(PART)) {
    onlyPart = part;
    const r = render(pose);
    onlyPart = 0;
    if (!r.n) continue;
    let cx = 0, cy = 0;
    for (let i = 0; i < r.n; i++) { cx += r.xs[i]; cy += r.ys[i]; }
    out.push({ name, part, n: r.n, xs: r.xs, ys: r.ys, color: r.color, cx: cx / r.n, cy: cy / r.n, z: r.z });
  }
  return out;
}
