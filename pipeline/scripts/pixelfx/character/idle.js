// T160: one standing pose per frame, so a gear set can be previewed without any motion:
//   node pipeline/scripts/pixelfx/character/export-actor.mjs --gear archer --move idle
// It is the rig's neutral STAND (core/act.js), exactly what an attack or hurt move starts and ends
// on, so it is also the reference frame when a new pose set looks wrong.
import { STAND } from './core/act.js';

export const meta = {
  name: 'Idle',
  desc: 'The shared bare body standing in the rig\'s neutral STAND pose, no motion.',
  tags: ['move', 'idle'],
  size: [64, 64],
  origin: [32, 56],
  duration: 1,
  loop: true,
  fps: 8,
  bg: 'none',
};

export const act = { poses: [[0, { ...STAND }]] };

export function draw() {}
