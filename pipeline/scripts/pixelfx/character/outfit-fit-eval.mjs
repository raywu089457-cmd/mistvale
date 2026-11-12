#!/usr/bin/env node
// How well the fitted rig pose covers the AI body: silhouette IoU per frame (and a small grid search of the scales).
//   node pipeline/scripts/pixelfx/character/outfit-fit-eval.mjs [--grid]
import { CELL, SRC_DIRS, aiFrame, joints, capture } from './outfit-lib.mjs';
import { fitFrame, SCALES, PLACE } from './outfit-pose.mjs';

export function evalFit(scales, place = PLACE, verbose = false) {
  let sum = 0, n = 0;
  const per = {};
  for (const dir of SRC_DIRS) {
    per[dir] = [];
    for (let k = 0; k < 9; k++) {
      const { pose, place: pl } = fitFrame(dir, joints(dir, k), scales, place);
      const cap = capture(pose, pl, null);
      const ai = aiFrame(dir, k);
      let inter = 0, uni = 0;
      for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
        const a = ai[(y * CELL + x) * 4 + 3] > 127, r = cap.px.has(`${x},${y}`);
        if (a && r) inter++;
        if (a || r) uni++;
      }
      per[dir].push(inter / uni); sum += inter / uni; n++;
    }
  }
  if (verbose) for (const d of SRC_DIRS) console.log(d, per[d].map((v) => v.toFixed(2)).join(' '));
  return sum / n;
}
if (process.argv[1].endsWith('outfit-fit-eval.mjs')) {
  if (process.argv.includes('--grid')) {
    let best = null;
    for (const sc of [1.15, 1.2, 1.25, 1.3, 1.35]) for (const sl of [0.9, 0.95, 1.0, 1.05, 1.1]) for (const r0 of [62, 63, 64]) {
      const v = evalFit({ sc, sl }, { ...PLACE, r0 });
      if (!best || v > best.v) best = { sc, sl, r0, v };
    }
    console.log('best', best);
  } else console.log('mean IoU', evalFit(SCALES, PLACE, true).toFixed(3));
}
