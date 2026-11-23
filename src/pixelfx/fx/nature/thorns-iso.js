// Thorns for the game's 2:1 isometric camera: nature/thorns rewritten for the floor the game sees, not its picture
// squashed or stretched. The recipe is the source's -- a seam of light races out along the ground and hooked thorns
// punch up through it one after another, each bigger than the last, in bursts of dirt and green light; they hold,
// glint, and sink -- but the world is the game's:
//   - the seam runs along the FLOOR, in the aim's own ground direction, so the thorns burst in a line spreading away
//     from the caster instead of across the screen;
//   - each thorn is a cylinder in three dimensions: its ribs are 2:1 floor widths, its axis leans along the seam and
//     its point hooks forward over the ground it came from, so it reads as standing up out of a tilted floor;
//   - what is thrown flies in x/z/h and lands at its own depth: grit is drawn behind the thorns while its depth is
//     negative and in front of them once it is positive, and the clods settle round the holes they came from;
//   - births and deaths are physics: the ground splits before a thorn arrives, the thorn overshoots and settles, and
//     at the end it draws back down into its own hole, closing it a little.
// 1 px = 1 character sprite px (32 x 16 px tiles).
// The wave (spikes punching up one after another, each bigger, with overshoot, a white frame, a burst of debris and
// glints, a line running along the floor ahead of them) is adapted from Sprite Fusion's open-source ice spikes
// (https://www.spritefusion.com/pixel-art-vfx/ice), MIT License, Copyright (c) 2026 Hugo Duprez.
import { fit, clamp, smooth, ease, rand, Rng, TAU, WHITE, Particles, P } from "../../core/index.js";
import { FLOOR, bandFloor, floorShadow, ringNoise, Fly3 } from "../_iso.js";

export const meta = {
  name: "Thorns (iso)",
  desc: "A seam of green light races along the floor and hooked thorns punch up through it one after another, each bigger, throwing dirt; they hold, glint, and sink back into their holes.",
  tags: ["nature", "thorns", "plant", "spikes", "ground", "attack", "one-shot", "iso", "top-down"],
  size: [264, 168],
  origin: [120, 126],
  duration: 2.4,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: {
    palette: ["#160c0e", "#2e1418", "#4e2224", "#743a30", "#9a5a3e", "#c08458", "#e2b484", "#fbe8c8"],
    glow: ["#123818", "#2f7a2a", "#6cb83a", "#c8f070"],
    soil: ["#120c0c", "#251917", "#3b2a24", "#553d31", "#715440", "#8f6e52", "#b8966e", "#e6d0a8"],
    count: 6,
    aim: 0,
    seed: 8,
  },
};

const RISE = 0.11, SINK = 0.36;

export function create(o) {
  const C = fit(o.palette, 8), G = fit(o.glow, 4), S = fit(o.soil, 8);
  const R = new Rng(o.seed);
  const aim = o.aim ?? 0;
  // the seam's own axes on the floor: `e` runs out along the aim, `l` is its left, both squashed 2:1 on screen
  const ex = Math.cos(aim), ez = Math.sin(aim), lx = -ez, lz = ex;
  const n = Math.max(2, o.count);
  const gy = (s) => ez * s * FLOOR;              // the floor line at distance s along the seam
  const gx = (s) => ex * s;
  const list = Array.from({ length: n }, (_, i) => {
    const k = i / (n - 1);
    const h = 14 + 38 * k + R.range(-1.5, 1.5);
    return {
      s: 12 + i * (92 / (n - 1)) + R.range(-3, 3),   // distance along the seam
      h, w: 7 + 11 * k,
      lean: R.range(-1, 1.5) + k * 2,               // how far the horn leans along the seam at its tip...
      hook: h * R.range(0.16, 0.24),                // ...and how far the point hooks over the ground ahead
      at: 0.12 + i * 0.075, sink: 1.45 + i * 0.06, seed: R.int(1, 999), up: false, down: false,
    };
  });
  const reach = list[n - 1].s + 10;
  const ps = new Fly3({ rng: R, ground: () => 0, sparks: [G[3], G[2], G[1], G[0]] });
  let t = 0;

  const grown = (s) => (t < s.at ? 0 : ease.outBack(clamp((t - s.at) / RISE), 2.4));
  const sunk = (s) => smooth(s.sink, s.sink + SINK, t);

  // the dirt thrown when a thorn comes up (and a smaller fistful when it goes down): 3-D, landing at its own depth
  const burst = (s, sp, nn) => {
    const fx = gx(s.s), fz = ez * s.s;
    for (let i = 0; i < nn; i++) {
      const a = R.range(0, TAU), v = R.range(30, 120) * sp, up = R.range(40, 150) * sp;
      ps.spawn(P.GRIT, fx + R.range(-3, 3), fz + R.range(-2, 2), R.range(0, 3),
        Math.cos(a) * v, Math.sin(a) * v, up, Math.min(R.range(0.6, 1.0), meta.duration - 0.06 - t), R.pick([S[5], S[4], S[3]]), R.chance(0.35) ? 2 : 1);
    }
    for (let i = 0; i < Math.max(2, nn / 2); i++) {
      const a = R.range(0, TAU);
      ps.spawn(P.GRIT, fx + Math.cos(a) * 3, fz + Math.sin(a) * 2, 0.5, Math.cos(a) * 30 * sp, Math.sin(a) * 30 * sp, 0, 0.5, S[2], 1, { bounce: 0.3 });
    }
    for (let i = 0; i < 3; i++) ps.spawn(P.MOTE, fx + R.range(-4, 4), fz + R.range(-3, 3), R.range(2, 8), R.range(-4, 4), R.range(-4, 4), R.range(30, 70), R.range(0.4, 0.8), G[3], 0.7);
  };

  return {
    update(dt) {
      t += dt;
      for (const s of list) {
        if (!s.up && t >= s.at) {
          s.up = true;
          burst(s, 0.6 + 0.6 * (s.h / 52), 3 + Math.round(5 * (s.h / 52)));
        }
        if (!s.down && t >= s.sink) { s.down = true; burst(s, 0.35, 2); }
        if (s.up && !s.down && t > s.at + 0.25 && R.chance(0.05)) {
          // a glint runs up the lit edge while a thorn stands
          ps.spawn(P.MOTE, gx(s.s) + lx * (s.w * 0.2), ez * s.s, s.h * R.range(0.35, 0.85), 0, 0, -6, R.range(0.25, 0.45), C[7], 1.1);
        }
      }
      // the tail: what is still in the air is cut short so the frame is empty by the end
      if (meta.duration - t < 0.22) ps.cap(Math.max(0.001, meta.duration - t - 0.02));
      ps.update(dt);
    },

    drawBack(p) {
      if (t >= meta.duration) return;
      // the seam racing out along the floor: a dark split with green light in it, closing again behind the wave
      const run = ease.outCubic(clamp((t - 0.04) / 0.5)) * reach * clamp((2.26 - t) / 0.34, 0, 1);
      if (run <= 0) return;
      for (let s = -2; s <= run; s += 1) {
        const hot = clamp(1 - (run - s) / 18) * (1 - smooth(0.6, 1.2, t));
        const x = gx(s), y = gy(s), h = rand(Math.round(s), 31);
        p.px(x, y, hot > 0.4 ? G[3] : hot > 0.15 ? G[2] : S[2]);
        if (h < 0.55) p.px(x + lx, y + lz * FLOOR, S[3]);
        if (h < 0.18) p.px(x - lx, y - lz * FLOOR, S[4]);
        if (hot > 0.3 && (((s | 0) & 3) === 0)) p.glow(x, y, 6, G[2], 0.3 * hot);
      }
      // what is thrown behind the thorns
      ps.draw(p, (q) => q.z < 0);
    },

    draw(p) {
      if (t >= meta.duration) return;
      for (const s of list) {
        const g = grown(s), k = sunk(s), hh = s.h * g;
        if (g <= 0 || k >= 1) continue;
        const footX = gx(s.s), footY = gy(s.s), base = k * s.h;
        // its own 2:1 contact shadow, wider as the thorn thickens
        if (k < 1) {
          const sx2 = s.w * 0.72 + 3.2, sy2 = sx2 * FLOOR;
          p.ellipse(footX, footY, sx2, sy2, S[3], 1);
          p.ellipse(footX, footY, sx2 * 0.7, sy2 * 0.7, S[2], 1);
        }
        // the horn, drawn as a tapered column with real width on screen: one horizontal run per pixel of height,
        // its half-width falling to nothing at the point, the axis leaning along the seam and the point hooking over.
        // (A rib spread along the lateral floor axis would be pure depth for a seam aimed down the screen, which is
        // how the first version ended up as one-pixel wire rather than a thorn.)
        const white = t - s.at < 0.035;
        for (let v = 0; v <= hh; v += 1) {
          const f = clamp(v / Math.max(1, s.h), 0, 1);
          const along = s.lean * f + s.hook * f * f * f;   // leans along the seam, the point hooks over
          const cx = gx(s.s + along), cy = gy(s.s + along) - v + base;
          // a fast taper and a slightly ragged edge: a thorn, not a tusk
          const hw = (s.w / 2) * Math.pow(1 - f, 1.25) + 0.4 + Math.sin(v * 1.9 + s.seed) * 0.35 * (1 - f);
          for (let u = -hw; u <= hw; u += 1) {
            const px = cx + u, py = cy;
            if (py > footY + 0.5) continue;                 // never below the floor it stands on
            if (white) { p.px(px, py, WHITE); continue; }
            const q = (u + hw) / (2 * hw);
            // light from the upper left: a lit edge, a pale ridge just inside it, a warm body and a dark right side
            let i = q < 0.08 ? 6 : q < 0.2 ? 5 : q < 0.3 ? 6 : q < 0.44 ? 4 : q < 0.72 ? 3 : 2;
            if (f > 0.88) i = q < 0.5 ? 6 : 4;

            p.px(px, py, C[i]);
          }
        }
        // the 2:1 ellipse of the hole it broke through, dark round the foot and lit on the near lip
        if (k < 0.5) {
          const r = s.w * 0.62 + 1.4;
          for (let u = -r; u <= r; u += 1) {
            const d = Math.sqrt(Math.max(0, 1 - (u / r) * (u / r))) * r * FLOOR;
            p.px(footX + u, footY + d, u > r * 0.3 ? S[4] : S[3]);
            p.px(footX + u, footY - d, S[3]);
          }
        }
        // a barb raking back off the horn, and the pale point
        if (!white && hh > 15) {
          const f0 = 0.42, aa = s.lean * f0 + s.hook * f0 * f0 * f0, hw0 = (s.w / 2) * Math.pow(1 - f0, 0.8);
          const bx = gx(s.s + aa) + hw0 * 0.7, by = gy(s.s + aa) - hh * f0 + base;
          for (let u = 1; u < s.w * 0.4; u += 1) p.px(bx + u * 0.75, by - u * 0.85, u > s.w * 0.26 ? C[3] : C[4]);
        }
        // the burst of green light as it punches up, and the collar of leaves at its foot
        if (t - s.at < 0.3) p.glow(footX, footY - hh * 0.5, hh * 0.6 + 6, G[2], 0.35 * (1 - (t - s.at) / 0.3));
        const lk = clamp((t - s.at - 0.04) / 0.18) * (1 - k);
        if (lk > 0.05) {
          // leaves splayed on the 2:1 floor: each a tapered blade, pale at the base, cut dark underneath
          for (const [side, spread] of [[-1, 1.35], [1, 0.95], [-1, 0.55], [1, 1.75]]) {
            const la = aim + side * spread, len = (5 + s.w * 0.55) * lk;
            for (let u = 1; u <= len; u += 1) {
              const w = Math.max(0.5, (1 - u / len) * 1.6 + 0.3);
              for (let s2 = -w; s2 <= w; s2 += 1) {
                const px = footX + Math.cos(la) * u - Math.sin(la) * s2 * 0.9;
                const py = footY + (Math.sin(la) * u + Math.cos(la) * s2 * 0.9) * FLOOR - (u / len) * 1.6;
                p.px(px, py, s2 > w * 0.5 ? G[1] : u > len * 0.72 ? G[2] : G[1]);
              }
            }
          }
          p.glow(footX, footY, s.w + 6, G[2], 0.18 * lk);
        }
      }
      // what is thrown in front of them
      ps.draw(p, (q) => q.z >= 0);
    },
  };
}
