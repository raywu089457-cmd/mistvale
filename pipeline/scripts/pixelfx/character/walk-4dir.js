// T88: the shared bare body walking in the game's four directions.
//
// The right row is T86's side walk, untouched: the same pose objects from ./walk.js, so the
// 4-direction sheet's right row stays pixel-identical to barebody-walk.png. Down and up are the
// same walk turned by the rig's whole-figure yaw: +90 degrees faces the camera (the face's +x
// becomes +z), -90 faces away. With yaw the walk's fx/bx swing becomes a swing in depth, the feet
// step in depth, and the chest keeps the stock walk's slight counter-twist (the pose's own turn,
// no override). The arms hang: hands directly under the shoulders at fz/bz +-5.9 and at mid-thigh
// (handDrop 14.4 below the shoulder), the elbows are pulled in with armZ -1 so the upper arm stays
// against the torso.
// T90: the arms swing opposite the legs in depth, and the swing is made readable from the front:
// the hand that swings forward is drawn lower and a px outside the hip line, the hand that swings
// back higher and on the hip line behind the thigh; on the odd frames the two hands' lowest points
// differ by 1-2 px. The swing foot is capped at 1-3 px of lift in the passing frames so the stock
// bob and the stock stance leg carry the pelvis, and the far (swing) leg is drawn in clean two-tone
// skin. `seal` closes the 1 px arm/torso slits the turned depth buffer leaves. Left is not a pose:
// the exporter mirrors the right cells (pivot 38 -> 38).
import { act as sideAct, meta as sideMeta } from './walk.js';

export const DIRECTIONS = ['down', 'up', 'right', 'left'];
export const meta = sideMeta;
/** The T86 side walk's poses (the right row), tagged so the T92 texture cleans walk frames only. */
export const right = sideAct.poses.map(([, pose]) => ({ ...pose, walk: true }));

const clamp1 = (v) => Math.max(-1, Math.min(1, v));
const turned = (pose, yaw) => {
  // T90: the arms swing opposite the legs in depth. Make that readable from the front: the hand
  // that swings forward (nearer the camera in the down view) is drawn 1 px lower than its fixed
  // drop under the shoulder, the hand that swings back 1 px higher (and stays partly behind the
  // hip/thigh). The drop is anchored to the shoulder so the 2 px swing is the swing, not the IK's
  // clamped reach.
  const fwdN = clamp1(pose.fx - 4) > 0, fwdF = clamp1((pose.bx - 3) / 2) > 0;
  return {
    ...pose,
    walk: true, // T92: the texture despeckles walk frames only, never the idle
    yaw,
    // T90: the forward hand hangs a px outside the hip line so it clears the thigh and shows its
    // drop; the back hand stays tucked on the hip line, behind the thigh
    fz: 5.9 + (fwdN ? 0.8 : 0),
    bz: -5.9 - (fwdF ? 0.8 : 0),
    fy: -11.6, // the IK reach; the drawn height is the shoulder drop below
    by: -11.6,
    handDropN: 14.4,
    handDropF: 14.4,
    handDyN: fwdN ? -0.8 : 0.8,
    handDyF: fwdF ? -0.8 : 0.8,
    ffy: Math.max(pose.ffy, -8), // the swing foot lifts 1-3 px, never pixelfx's full 4 px
    fby: Math.max(pose.fby, -8),
    armZ: -1, // elbows hang beside the torso instead of bowing out
    armThin: true, // T91: the turned rows keep T88-T90's thin arm; the side walk draws the stock one
    seal: true,
  };
};

/** Facing the camera. */
export const down = right.map((pose) => turned(pose, Math.PI / 2));
/** Facing away. */
export const up = right.map((pose) => turned(pose, -Math.PI / 2));

/** The 8 poses of a direction; left has none (it is the right row mirrored). */
export const posesOf = (dir) =>
  dir === 'down' ? down : dir === 'up' ? up : dir === 'right' ? right : null;

export const act = { poses: down.map((pose, i) => [i / 8, pose]) };
export default act;
