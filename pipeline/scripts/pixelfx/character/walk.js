// T86: the stock pixelfx side walk, riding the shared bare body.
//
// There is no generic walk move in src/fx/moves/ (only archer-walk, archer-walk-l0v and
// archer-walk-proc), so this is archer-walk's eight poses with its bow, its dead `skin`/`cloak`
// fields and its weapon-only `sa` dropped. Meta, frame count and timing are archer-walk's, so
// export-sheet.mjs --actor gives the same 8 frames, 8 fps, 76x76 cell and pivot [38,62].
//
// One pose per frame: [t, pose]. Feet: planted sole at the rig's ground line (-4), swinging foot
// lifts to -10. turn 0.2 keeps the chest nearly square to travel; lean 3 tips him forward. The
// near hand only drifts, the far hand swings the stride.
export const meta = {
  name: 'Bare-body walk',
  desc: 'The shared bare body on pixelfx\'s stock 8-frame side walk, no weapon and no equipment.',
  tags: ['move', 'walk', 'barebody', 'loop'],
  size: [64, 64],
  origin: [32, 56],
  duration: 1,
  loop: true,
  fps: 8,
  bg: 'none',
};

const STEP = (near, far, crouch, fx, fy, bx, by) => ({
  ffx: near[0], ffy: near[1], fbx: far[0], fby: far[1],
  crouch, lean: 3, turn: 0.2, yaw: 0,
  fx, fy, bx, by,
  walk: true, // T92: the texture despeckles walk frames only; the 4-direction right row copies these
});

export const act = {
  poses: [
    [0 / 8, STEP([6, -4], [-6, -4], 0, 3, -19, 8, -17)],        // contact: near foot forward, far arm forward
    [1 / 8, STEP([4, -4], [-5, -7], 2, 3.5, -19.5, 6, -16.5)],  // down: weight on the near foot, far heel lifts
    [2 / 8, STEP([1, -4], [-1, -10], 0, 4, -19, 3, -17.5)],     // passing: far foot swings under the body
    [3 / 8, STEP([-3, -4], [4, -7], 1, 4.5, -18.5, 0, -18)],    // up: body rises, far foot reaches forward
    [4 / 8, STEP([-6, -4], [6, -4], 0, 5, -19, -2, -17)],       // contact: far foot forward, near foot back
    [5 / 8, STEP([-4, -4], [5, -7], 2, 4.5, -19.5, 0, -16.5)],  // down: weight on the far foot, near heel lifts
    [6 / 8, STEP([-1, -4], [1, -10], 0, 4, -19, 4, -17.5)],     // passing: near foot swings under the body
    [7 / 8, STEP([3, -4], [-4, -7], 1, 3.5, -18.5, 7, -18)],    // up: near foot reaching forward to the next contact
  ],
};

export function draw() {}
