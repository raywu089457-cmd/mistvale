// Fit the pixelfx rig to a skeleton of the AI body (output/pixellab-barebody/v3-keypoints.json): for every frame the
// rig's handles (hands and feet) are put where the AI skeleton has them, the whole-figure yaw follows the
// direction, and crouch / lean come from the hip height and the torso angle. The rig is only used for the
// outfit (correspondence, gear pass), so a close pose is all that is needed, not an exact one.
//
// Cell mapping: keypoints are continuous native cell pixels (pixel (i, j) covers [i, i+1) x [j, j+1)); the rig draws
// pixel (wx, wy) at cell column x0 + ox + wx and row r0 - wy, so a keypoint (x, y) is the rig point
// (x - 0.5 - x0 - ox, r0 + 0.5 - y) in x right / y up terms. ox is a per-frame integer shift that puts the rig's
// pelvis under the AI hips.
//
// Scale: the AI body is ~47 px tall, the rig 38. core/rig.js (our fork) takes pose.scale (torso, head, shoulders)
// and pose.scaleLimb (arms and legs): the AI torso and head are ~1.25x the rig's but its limbs are about 1.0x,
// so the two are separate numbers. Rest cells (`src`) stay in the original units.
export const PLACE = { x0: 37, r0: 63 };
/** fitted by tools/checks/pixelfx-outfit.mjs --tune style search (see outfit-fit-eval.mjs): torso/head and limb scale */
export const SCALES = { sc: 1.35, sl: 1.0 };
export const TURN = { right: 0.2, down: 0, up: 0 };

const get = (frame) => Object.fromEntries(frame.map((j) => [j.label, [j.x, j.y]]));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

const LIMB = { arm: ['SHOULDER', 'ELBOW', 'ARM'], leg: ['HIP', 'KNEE', 'LEG'] };
/** mean luminance of the solid, non-outline AI pixels within r px of (x, y); null when there are none */
function lightness(ai, x, y, r = 3) {
  let s = 0, n = 0;
  for (let j = Math.floor(y - r); j <= Math.ceil(y + r); j++) for (let i = Math.floor(x - r); i <= Math.ceil(x + r); i++) {
    if (i < 0 || j < 0 || i >= 74 || j >= 74 || Math.hypot(i + 0.5 - x, j + 0.5 - y) > r) continue;
    const o = (j * 74 + i) * 4;
    if (ai[o + 3] < 128) continue;
    const L = 0.299 * ai[o] + 0.587 * ai[o + 1] + 0.114 * ai[o + 2];
    if (L <= 44) continue;
    s += L; n++;
  }
  return n ? s / n : null;
}

/**
 * The tracked joints of every frame (idle, walk 0..7) of a direction: { shoulderN, elbowN, handN, hipN, kneeN, ankleN,
 * ...F, neck, nose, near: { arm, leg } } with N = the near limb (the character's RIGHT in the front and back views,
 * and in the side view whichever of RIGHT / LEFT the estimator gave to the near side, kept continuous over the
 * cycle: frame 0 by lightness (the near limb is drawn lighter), then by distance to the previous frame).
 */
export function trackedJoints(dir, kp, aiOf) {
  const d = kp.directions[dir];
  const frames = [d.idle, ...d.walk].map(get);
  const out = [];
  frames.forEach((f, k) => {
    const near = {};
    for (const [limb, names] of Object.entries(LIMB)) {
      const key = names[2];
      const R = f[`RIGHT ${key}`], L = f[`LEFT ${key}`];
      if (dir !== 'right') { near[limb] = 'RIGHT'; continue; } // front / back: the character's right is the near hand
      if (k <= 1) {
        // idle and walk frame 0: the lighter limb is the near one (so idle and walk 0 use the same physical limb)
        const ai = aiOf(k), lr = lightness(ai, R[0], R[1]), ll = lightness(ai, L[0], L[1]);
        near[limb] = lr !== null && ll !== null && ll > lr + 1 ? 'LEFT' : 'RIGHT';
      } else {
        const prev = out[k - 1], pn = prev[`${key}N`], pf = prev[`${key}F`];
        const keep = dist(R, pn) + dist(L, pf), flip = dist(L, pn) + dist(R, pf);
        near[limb] = flip < keep ? 'LEFT' : 'RIGHT';
      }
    }
    const J = { near };
    const pick = (limb, label) => {
      const side = near[limb], other = side === 'RIGHT' ? 'LEFT' : 'RIGHT';
      return [f[`${side} ${label}`], f[`${other} ${label}`]];
    };
    for (const [limb, names] of Object.entries(LIMB)) {
      const tags = limb === 'arm' ? ['shoulder', 'elbow', 'hand'] : ['hip', 'knee', 'ankle'];
      names.forEach((label, i) => { const [n, fa] = pick(limb, label); J[`${tags[i]}N`] = n; J[`${tags[i]}F`] = fa; });
    }
    J.neck = f.NECK; J.nose = f.NOSE;
    // the tracking above reads prev[`${key}N`] with the keypoint label key; keep both spellings
    J.ARMN = J.handN; J.ARMF = J.handF; J.LEGN = J.ankleN; J.LEGF = J.ankleF;
    out[k] = J;
  });
  return out;
}

/** the rig pose (pose.scale / scaleLimb included) of one frame, and its integer placement shift */
export function fitFrame(dir, J, scales = SCALES, place = PLACE) {
  const { sc, sl } = scales;
  const hipMid = mid(J.hipN, J.hipF), shMid = mid(J.shoulderN, J.shoulderF);
  const ox = Math.round(hipMid[0] - 0.5 - place.x0);
  const W = (p) => [p[0] - 0.5 - place.x0 - ox, place.r0 + 0.5 - p[1]]; // rig x right, y up
  const hipW = W(hipMid), shW = W(shMid);
  const turned = dir !== 'right', yaw = dir === 'down' ? Math.PI / 2 : dir === 'up' ? -Math.PI / 2 : 0;
  const hN = W(J.handN), hF = W(J.handF), aN = W(J.ankleN), aF = W(J.ankleF);
  const pelvisY = hipW[1] + 1.1 * sc;
  const pose = {
    scale: sc, scaleLimb: sl, yaw, turn: TURN[dir], armThin: true, seal: true,
    crouch: 19.7 * sc - pelvisY,
    lean: 0,
    fy: -hN[1], by: -hF[1],
    ffy: -(aN[1] + 1.8 * sl), fby: -(aF[1] + 1.8 * sl),
  };
  if (!turned) {
    // side view: pose x is the screen x; the lean follows the torso angle
    pose.lean = Math.tan(Math.atan2(shW[0] - hipW[0], shW[1] - hipW[1])) * 13 * sc;
    // depth: the near arm hangs outside the (scaled) chest's half width 7.4 so it is drawn in front of it, the far arm behind
    Object.assign(pose, { fx: hN[0], bx: hF[0], ffx: aN[0], fbx: aF[0], fz: 8.4, bz: -8.4 });
  } else {
    // front / back: screen x = -z (down) or +z (up) of the pose; pose x is depth (kept 0)
    const s = dir === 'down' ? -1 : 1;
    Object.assign(pose, { fx: 0, bx: 0, ffx: 0, fbx: 0, fz: s * hN[0], bz: s * hF[0], fzz: s * aN[0], bzz: s * aF[0], armZ: -1 });
  }
  return { pose, place: { ox } };
}
