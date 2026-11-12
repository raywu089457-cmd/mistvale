// T89: the shared bare body standing still in the game's four directions.
//
// The rig's STAND pose with idle arm targets: arms hang beside the torso in the front and back
// views (hands in front of the thighs, so the whole limb shows) and the near arm hangs at the side
// in the right view with the far arm a little forward, so its forearm and hand still show.
// The left row is the right row mirrored in the cell, as in walk-4dir.js.
import { meta as sideMeta } from './walk.js';

export const DIRECTIONS = ['down', 'up', 'right', 'left'];
export const meta = sideMeta;

// Screen terms, as core/rig.js's STAND: y negative up, z toward the viewer.
// At yaw +-90 the pose z becomes screen x (the hand's spread) and the pose x the depth.
export const right = { turn: 0.2, fx: 2, fy: -14, bx: 8, by: -14, armThin: true, seal: true };
export const down = { yaw: Math.PI / 2, turn: 0, fz: 6.5, bz: -6.5, fx: 4.5, bx: 4.5, fy: -14, by: -14, armZ: -1, armThin: true, seal: true };
export const up = { ...down, yaw: -Math.PI / 2, fx: -4.5, bx: -4.5 };

/** The one idle pose of a direction; left has none (it is the right row mirrored). */
export const posesOf = (dir) => (dir === 'down' ? [down] : dir === 'up' ? [up] : dir === 'right' ? [right] : null);
