// Star fall for the game's 2:1 isometric camera: arcane/star-fall rewritten for the floor the game sees, not its
// picture squashed, stretched or scaled. The recipe is the source's: stars streak down on long trails across an
// area, each landing with a white flash, a ring across the floor and a kick of sparks. What changed is the world it
// happens in:
//   - they land all over a round area of floor (`spread` px across it), not along a line: each comes down out of the
//     sky in 3D on the same slant (as if from one quarter of the sky), lands at its own depth, far ones behind
//     whatever stands in the area, near ones in front;
//   - each ring races out 2:1 over the floor round where it landed, the sparks it kicks fly every way round in 3D
//     and fall back at their own depth, and the glowing mark it leaves cools down to nothing;
//   - the area is lit beneath while they fall, a 2:1 pool, and each landing lights the floor where it hits.
// 1 px = 1 character sprite px (32 x 16 px tiles).
import { Lights, P, Rng, PAL, fit, band, flare, sparkle, clamp, ease, TAU, WHITE } from "../../core/index.js";
import { floorLight } from "../fire/_lib.js";
import { Fly3 } from "../_iso.js";

const N = 13, H = 124, SLANT = 0.38, TRAIL = 0.17, FL = 0.5;

export const meta = {
  name: "Star fall (iso)",
  desc: "arcane/star-fall on the 2:1 floor: stars streak down out of the sky all over a round area, each landing at its own depth with a flash, a 2:1 ring and a kick of sparks.",
  tags: ["arcane", "star", "meteor", "rain", "aoe", "magic", "ground", "one-shot", "iso", "top-down"],
  size: [252, 216],
  origin: [140, 176],
  duration: 2.6,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: PAL.arcane, spread: 52, seed: 13 },
};

export function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed), SP = o.spread, END = meta.duration;
  const fly = new Fly3({ rng: R, sparks: [WHITE, C[6], C[5], C[4]] }), lights = new Lights();
  // where they land: spread over the round area, evenly but not on a grid (a sunflower with jitter), in a shuffled
  // order so the area fills up all over at once
  const spots = Array.from({ length: N }, (_, i) => {
    const r = SP * Math.sqrt((i + 0.5) / N) * R.range(0.85, 1.05), a = i * 2.39996 + R.range(-0.3, 0.3);
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
  for (let i = N - 1; i > 0; i--) {
    const j = R.int(0, i);
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  // they all come down on the same slant, out of the sky up and to the left, a little behind
  const sa = Math.PI + 0.35, sx = Math.cos(sa) * SLANT, sz = Math.sin(sa) * SLANT;
  const stars = spots.map(([x, z], i) => {
    const h = H * R.range(0.85, 1);
    return { x, z, x0: x + sx * h, z0: z + sz * h, h0: h, t0: 0.04 + i * 0.1 + R.range(0, 0.05), T: R.range(0.3, 0.4), landed: false, big: R.chance(0.35), ph: R.range(0, TAU) };
  });
  const hits = [];
  let t = 0;
  // where a star is at time tt: falling faster as it comes (x, z, h, how far down it is)
  const at = (s, tt) => {
    const q = clamp((tt - s.t0) / s.T), e = q * (0.35 + 0.65 * q);
    return [s.x0 + (s.x - s.x0) * e, s.z0 + (s.z - s.z0) * e, s.h0 * (1 - e), q];
  };
  const S = (q) => [q[0], q[1] * FL - q[2]];

  return {
    update(dt) {
      t += dt;
      for (const s of stars) {
        if (t < s.t0 || s.landed) continue;
        const q = at(s, t);
        // it sheds twinkles as it falls; they hang in the air and drift
        if (R.chance(0.55)) fly.spawn(P.STAR, q[0] + R.range(-1.5, 1.5), q[1] + R.range(-1.5, 1.5), q[2] + R.range(-1.5, 1.5), R.range(-12, 12), R.range(-6, 6), R.range(-4, 8), R.range(0.35, 0.7), R.pick([WHITE, C[6], C[5]]), R.chance(0.7) ? R.range(0.4, 0.9) : R.range(1.2, 1.8));
        if (q[3] >= 1) {
          s.landed = true;
          hits.push({ x: s.x, z: s.z, t, big: s.big });
          const y = s.z * FL;
          lights.add(s.x, y - 12, s.big ? 46 : 38, C[5], 0.9, 0.32);
          lights.add(s.x, y - 3, 16, WHITE, 0.8, 0.08);
          // a kick of sparks every way round, up off the floor and back down to it at their own depth
          for (let i = 0; i < (s.big ? 14 : 9); i++) {
            const a = R.range(0, TAU), sp = R.range(40, 110);
            fly.spawn(P.SPARK, s.x, s.z, 1, Math.cos(a) * sp, Math.sin(a) * sp, R.range(50, 150), R.range(0.25, 0.55));
          }
          for (let i = 0; i < 4; i++) fly.spawn(P.STAR, s.x + R.range(-4, 4), s.z + R.range(-3, 3), R.range(2, 8), R.range(-15, 15), R.range(-8, 8), R.range(10, 35), R.range(0.4, 0.8), R.pick([WHITE, C[6]]), R.range(0.8, 2));
        }
      }
      fly.update(dt);
      lights.update(dt);
      fly.cap(Math.max(0.001, END - 0.05 - t));
    },
    drawBack(p) {
      // the area lit beneath while they fall
      const k = clamp(t / 0.3) * (1 - clamp((t - 1.7) / 0.7));
      if (k > 0) floorLight(p, 0, 0, SP * 1.25, SP * 1.25 * FL, C[4], 0.22 * k);
      for (const h of hits) {
        const k2 = 1 - (t - h.t) / 0.35;
        if (k2 > 0) floorLight(p, h.x, h.z * FL, 20, 10, C[5], 0.35 * k2);
      }
      for (const h of hits) ring(p, h, true);
      marks(p, false);
      fly.draw(p, (q) => q.z < 0);
      for (const s of stars) if (t >= s.t0 && !s.landed && s.z < 0) star(p, s);
      for (const h of hits) if (h.z < 0) splash(p, h);
    },
    draw(p) {
      for (const h of hits) ring(p, h, false);
      marks(p, true);
      for (const s of stars) if (t >= s.t0 && !s.landed && s.z >= 0) star(p, s);
      for (const h of hits) if (h.z >= 0) splash(p, h);
      fly.draw(p, (q) => q.z >= 0);
      lights.draw(p);
    },
  };

  // a star coming down: a long tapered trail back up its path, white at the head, thinning into violet
  function star(p, s) {
    const [x, y] = S(at(s, t)), n = 20;
    for (let k = n; k >= 1; k--) {
      if (t - (k * TRAIL) / n < s.t0) continue;
      const [ax, ay] = S(at(s, t - (k * TRAIL) / n)), [bx, by] = S(at(s, t - ((k - 1) * TRAIL) / n)), u = k / n;
      const c = u < 0.15 ? WHITE : u < 0.4 ? C[6] : u < 0.7 ? C[5] : C[4];
      if (u < (s.big ? 0.55 : 0.35)) p.line(ax + 1, ay, bx + 1, by, u < 0.2 ? C[6] : C[5], 1.1 - u * 1.4);
      p.line(ax, ay, bx, by, c, 1.3 - u);
      if (k % 3 === 0) p.glow(ax, ay, 7 * (1 - u) + 2, C[5], 0.3 * (1 - u));
    }
    if (s.big) flare(p, x, y, 7 + 1.5 * Math.sin(t * 40 + s.ph), 0.8, C);
    else sparkle(p, x, y, 3.5 + Math.sin(t * 40 + s.ph), C[6], C[5], 0.6);
    p.circle(x, y, s.big ? 1.6 : 1.1, WHITE);
    p.glow(x, y, s.big ? 18 : 13, C[5], 0.6);
    p.glow(x, y, 5, WHITE, 0.35);
  }

  // the ring each landing sends out over the floor: 2:1, far half behind, near half in front
  function ring(p, h, far) {
    const k = (t - h.t) / 0.45;
    if (k < 0 || k >= 1) return;
    band(p, h.x, h.z * FL, 3 + (h.big ? 22 : 16) * ease.outCubic(k), FL, Math.max(1, 2.5 * (1 - k)), 1.15 - k, [C[3], C[5], C[6], WHITE], (g) => Math.sin(g) < 0 === far, k < 0.2);
  }

  // the flash where it lands
  function splash(p, h) {
    const k = (t - h.t) / 0.22, y = h.z * FL;
    if (k < 0 || k >= 1) return;
    if (k < 0.35) p.circle(h.x, y - 2, 5 * (1 - k / 0.35) + 1, WHITE);
    flare(p, h.x, y - 2, (h.big ? 16 : 12) * Math.pow(1 - k, 1.5) + 2, 1 - k, C);
  }

  // the glowing mark each leaves on the floor, cooling from white through violet to nothing, the edges first
  function marks(p, near) {
    for (const h of hits) {
      if (h.z >= 0 !== near) continue;
      const a = (t - h.t) / 0.75, y = h.z * FL;
      if (a >= 1) continue;
      p.px(h.x, y, a < 0.3 ? WHITE : a < 0.65 ? C[6] : C[5]);
      if (a < 0.6) for (const dx of [-1, 1]) p.px(h.x + dx, y, a < 0.25 ? C[6] : C[5]);
      if (a < 0.35) for (const dx of [-2, 2]) p.px(h.x + dx, y, C[4]);
      p.glow(h.x, y - 1, 10, C[5], 0.35 * (1 - a));
    }
  }
}
