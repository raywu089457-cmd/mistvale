// Judgment hammer (Mistvale-local): the paladin's 審判巨錘. melee/hammer-smash-iso's whole blow, unchanged (the glint
// over the head, the blunt head coming down, the white star, the dished dent and its cracks, the dust column, the
// rocks), with one thing the skill needs that the source does not draw: a shock wave that runs out over the floor to
// the skill's own radius and leaves its edge lying there for a moment, so the area that was hit is the area you see.
//   - the game draws it ANCHORED ON THE TARGET: the blit origin is shifted back along the aim by the hammer's REACH
//     (pixel-runtime AHEAD_PX), so the head lands, and the wave starts, on the target's feet;
//   - the game draws it at twice the hammer's usual size (LIVE_TUNE), so `reach` (px) is the radius already turned
//     into this module's px at that size (pixel-world spawnLiveEffect, from the skill's radius);
//   - the wave leaves the strike at the frame the head meets the floor (HIT = RAISE + SWING = 0.39 s); the skill's
//     damage `delay` is the same number.
// Floor work (the wave, its dust wall, the edge ring, the ground cracks running out under it) is in the back layer so
// it lies under the units standing in it; the hammer itself is drawn in front, as the source draws it.
// 1 px = 1 character sprite px.
import { Rng, fit, clamp, smooth, ease, TAU, WHITE, mix, hex, rand } from "../../../pixelfx/core/index.js";
import { FLOOR, bandFloor, ringNoise } from "../../../pixelfx/fx/_iso.js";
import { dustRing } from "../../../pixelfx/fx/impacts/_lib.js";
import * as hammer from "../../../pixelfx/fx/melee/hammer-smash-iso.js";

export const HIT = 0.39;      // hammer-smash-iso: RAISE 0.26 + SWING 0.13
export const REACH = 24;      // hammer-smash-iso: U1, px ahead of the origin along the aim where the head lands

export const meta = {
  name: "Judgment hammer (iso)",
  desc: "melee/hammer-smash-iso's blow landing on the target, with a shock wave that runs out over the floor to the skill's radius and leaves its edge lying there.",
  tags: ["melee", "hammer", "smash", "blunt", "heavy", "impact", "ground", "shockwave", "aoe", "iso", "top-down", "one-shot", "directional"],
  size: [264, 232],
  origin: [132, 168],
  duration: 1.6,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { ...hammer.meta.options, reach: 73 },
};

export function create(o) {
  const base = hammer.create(o);
  const F = fit(o.palette, 7), R = new Rng((o.seed ?? 9) + 31);
  const aim = o.aim ?? 0, IX = REACH * Math.cos(aim), IY = REACH * Math.sin(aim) * FLOOR;
  const reach = clamp(o.reach ?? 73, 30, 110);
  const DUST = mix(hex("#7a6a58"), F[4], 0.25), RIM = [mix(F[2], hex("#3a2f26"), 0.4), F[3], F[4], F[5], F[6], WHITE];
  // ground cracks the wave tears open: long jagged walks from the dent out toward the edge
  const SPLITS = [];
  for (let i = 0; i < 10; i++) {
    const th = (i / 10) * TAU + R.range(-0.2, 0.2), len = reach * R.range(0.55, 0.9);
    const pts = [];
    let a = th, d = 14;
    while (d < len) { pts.push([Math.cos(a) * d, Math.sin(a) * d]); a += R.range(-0.28, 0.28); a = th + clamp(a - th, -0.35, 0.35); d += R.range(3, 5); }
    SPLITS.push({ pts, seed: R.int(1, 999) });
  }
  let t = 0;
  return {
    update(dt) { t += dt; base.update(dt); },
    drawBack(p) {
      const age = t - HIT;
      if (age < 0 || t >= meta.duration) return;
      // the wave: a bright band racing out to the reach, a lumpy dust wall a step behind it
      const u = clamp(age / 0.42), rr = 10 + (reach - 10) * ease.outCubic(u);
      if (u < 1) {
        bandFloor(p, IX, IY, rr, 3 + 5 * (1 - u), 0.85 * Math.pow(1 - u, 0.5), RIM, (g) => ringNoise(g, 7, 13) > 0.18 - 0.2 * (1 - u));
        dustRing(p, IX, IY, rr * 0.86, 3 + 4 * (1 - u), 0.24 * (1 - u * 0.5), DUST, { sy: FLOOR, ph: 3 * u, brk: 0.4 * u, lit: 0.45 });
      }
      // the edge it leaves on the reach: the area of the blow, held a beat, then breaking up as the dust settles
      const ek = smooth(0.3, 0.42, age) * (1 - smooth(0.75, 1.15, age));
      if (ek > 0.02) {
        dustRing(p, IX, IY, reach, 3.6, 0.3 * ek, DUST, { sy: FLOOR, ph: 1.7, brk: 0.15 + 0.6 * smooth(0.7, 1.15, age), lit: 0.5 });
        bandFloor(p, IX, IY, reach, 1.5, 0.55 * ek, RIM.slice(1, 5), (g) => rand(Math.round(g * 48), 5) > 0.2);
      }
      // the cracks running out under the wave: they open behind its front, cool and get buried as it settles
      const open = clamp(age / 0.36), bury = smooth(0.8, 1.2, age);
      for (const s of SPLITS) {
        const m = Math.floor(s.pts.length * open);
        for (let k = 1; k < m; k++) {
          const [x0, z0] = s.pts[k - 1], [x1, z1] = s.pts[k];
          if (rand(k * 7 + s.seed, 11) < bury) continue;
          const hot = clamp(1 - age / 0.5) * (1 - k / s.pts.length);
          p.line(IX + x0, IY + z0 * FLOOR, IX + x1, IY + z1 * FLOOR, hot > 0.35 ? F[6] : mix(F[0], hex("#1a1410"), 0.5));
          p.dot(IX + x1 + 1, IY + z1 * FLOOR - 1, F[4], 0.5 * (1 - bury));
        }
      }
    },
    draw(p, tt) { base.draw(p, Math.min(tt ?? t, hammer.meta.duration)); },
  };
}
