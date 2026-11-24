// Thorn aegis, the cast (Mistvale-local): the burst that opens 荊棘聖甲, out to the skill's whole radius.
// The holy light flashes gold at the paladin's feet and the briar answers out of the floor: three rings of hooked
// thorns punch up one after the other, each ring further out (the last one on the edge of the skill's reach), each
// thorn leaning outward with its point hooked over the ground beyond it, in bursts of grit and green light; a ring of
// green light races out over the floor ahead of them and leaves its edge lying on the reach for a moment. They hold,
// glint and sink back into their holes. The thorns are drawn like nature/thorns-iso's horns (a tapered column, one
// run of pixels per px of height, lit from the upper left), only stood in rings instead of along one seam.
// The game spawns it on the caster; `reach` is the skill radius already turned into px (pixel-world). The follow-up,
// the shield with the briar on it that stays on the paladin while the buff lasts, is ./thorn-aegis-iso.js.
// 1 px = 1 character sprite px.
import { P, Rng, fit, clamp, smooth, ease, TAU, WHITE, rand } from "../../../pixelfx/core/index.js";
import { FLOOR, bandFloor, Fly3 } from "../../../pixelfx/fx/_iso.js";
import { dustRing } from "../../../pixelfx/fx/impacts/_lib.js";
import { GOLD } from "../../../pixelfx/fx/holy/_lib.js";

export const meta = {
  name: "Thorn aegis burst (iso)",
  desc: "A gold flash at the caster's feet, then three rings of hooked thorns punch up out of the floor one after the other out to the skill's reach, a ring of green light running ahead of them; they hold, glint and sink.",
  tags: ["nature", "holy", "thorns", "burst", "ring", "ground", "one-shot", "iso", "top-down"],
  size: [288, 184],
  origin: [144, 110],
  duration: 1.6,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: {
    wood: ["#140d0a", "#2a1a12", "#43301c", "#5f4626", "#7f6232", "#a3884a", "#cdb878", "#f1e6b8"],
    glow: ["#123818", "#2f7a2a", "#6cb83a", "#c8f070"],
    soil: ["#120c0c", "#251917", "#3b2a24", "#553d31", "#715440", "#8f6e52", "#b8966e", "#e6d0a8"],
    gold: GOLD,
    reach: 112,
    seed: 5,
  },
};

const D = meta.duration, RISE = 0.12, SINK = 0.32;

export function create(o) {
  const W = fit(o.wood, 8), G = fit(o.glow, 4), S = fit(o.soil, 8), Au = fit(o.gold, 8);
  const R = new Rng(o.seed ?? 5);
  const reach = clamp(o.reach ?? 112, 40, 128);
  // three rings: further out, later, more thorns; the outer ring stands on the reach itself
  const RINGS = [{ f: 0.34, n: 7, at: 0.05, h: [20, 27] }, { f: 0.66, n: 11, at: 0.13, h: [17, 24] }, { f: 0.95, n: 15, at: 0.21, h: [13, 20] }];
  const THORNS = [];
  for (const [ri, ring] of RINGS.entries())
    for (let i = 0; i < ring.n; i++) {
      const a = (i / ring.n) * TAU + ri * 0.37 + R.range(-0.12, 0.12), d = reach * ring.f + R.range(-4, 4);
      const h = R.range(ring.h[0], ring.h[1]);
      THORNS.push({
        a, d, x: Math.cos(a) * d, z: Math.sin(a) * d, h, w: 5 + h * 0.32,
        lean: R.range(2, 5) + h * 0.12, hook: h * R.range(0.16, 0.26),
        at: ring.at + (i / ring.n) * 0.05 + R.range(0, 0.02), sink: 0.95 + ri * 0.08 + R.range(0, 0.06),
        seed: R.int(1, 999), up: false, down: false,
      });
    }
  THORNS.sort((p, q) => p.z - q.z);
  const ps = new Fly3({ rng: R, ground: () => 0, sparks: [G[3], G[2], G[1], G[0]] });
  let t = 0;
  const grown = (s) => (t < s.at ? 0 : ease.outBack(clamp((t - s.at) / RISE), 2.6));
  const sunk = (s) => smooth(s.sink, s.sink + SINK, t);
  const burst = (s, sp, nn) => {
    for (let i = 0; i < nn; i++) {
      const a = R.range(0, TAU), v = R.range(30, 110) * sp, up = R.range(50, 150) * sp;
      ps.spawn(P.GRIT, s.x + R.range(-3, 3), s.z + R.range(-2, 2), R.range(0, 3), Math.cos(a) * v, Math.sin(a) * v, up, Math.min(R.range(0.5, 0.9), D - 0.06 - t), R.pick([S[5], S[4], S[3]]), R.chance(0.35) ? 2 : 1);
    }
    for (let i = 0; i < 2; i++) ps.spawn(P.MOTE, s.x + R.range(-4, 4), s.z + R.range(-3, 3), R.range(2, 8), R.range(-6, 6), R.range(-6, 6), R.range(30, 70), R.range(0.4, 0.7), G[3], 0.8);
  };

  return {
    update(dt) {
      t += dt;
      for (const s of THORNS) {
        if (!s.up && t >= s.at) { s.up = true; burst(s, 0.6 + 0.5 * (s.h / 27), 3 + Math.round(4 * (s.h / 27))); }
        if (!s.down && t >= s.sink) { s.down = true; burst(s, 0.3, 2); }
      }
      if (D - t < 0.25) ps.cap(Math.max(0.001, D - t - 0.03));
      ps.update(dt);
    },
    drawBack(p) {
      if (t >= D) return;
      // the gold flash at the paladin's feet: the holy shield answering before the briar does
      const fk = 1 - clamp(t / 0.22);
      if (fk > 0) {
        p.ellipse(0, 0, 10 + 22 * (1 - fk), (10 + 22 * (1 - fk)) * FLOOR, Au[6], 0.7 * fk);
        p.glow(0, -10, 26, Au[5], 0.5 * fk);
      }
      // the ring of green light racing out over the floor ahead of the thorns, its edge left lying on the reach
      const u = clamp((t - 0.02) / 0.34), rr = 6 + (reach - 6) * ease.outCubic(u);
      if (u < 1) bandFloor(p, 0, 0, rr, 3 + 4 * (1 - u), 0.7 * (1 - u * 0.6), ["#123818", "#2f7a2a", "#6cb83a", "#c8f070", "#f4ffd0"], () => true);
      const edge = (u >= 1 ? 1 : u) * (1 - smooth(0.7, 1.25, t));
      if (edge > 0.02) {
        dustRing(p, 0, 0, reach, 3.2, 0.22 * edge, S[4], { sy: FLOOR, ph: 2.3, brk: 0.3 + 0.5 * smooth(0.6, 1.2, t), lit: 0.4 });
        bandFloor(p, 0, 0, reach, 1.5, 0.45 * edge, ["#1d4a1a", "#2f7a2a", "#6cb83a", "#c8f070"], (g) => rand(Math.round(g * 40), 9) > 0.25);
      }
      // the seams the thorns came up through, dark with green light in them while they stand
      for (const s of THORNS) {
        const k = grown(s), gone = sunk(s);
        if (k <= 0 || gone >= 1) continue;
        const r0 = Math.max(6, s.d - 10), steps = Math.ceil(s.d - r0);
        for (let j = 0; j <= steps; j += 1) {
          const d = r0 + j, x = Math.cos(s.a) * d, y = Math.sin(s.a) * d * FLOOR, hot = clamp(1 - (s.d - d) / 10) * (1 - gone);
          p.dot(x, y, hot > 0.5 ? G[3] : G[1], 0.6 * (1 - gone));
          if (rand(j + s.seed, 3) < 0.4) p.dot(x + 1, y, S[2], 0.7 * (1 - gone));
        }
      }
      ps.draw(p, (q) => q.z < 0);
      for (const s of THORNS) if (s.z < 0) horn(p, s);
    },
    draw(p) {
      if (t >= D) return;
      for (const s of THORNS) if (s.z >= 0) horn(p, s);
      ps.draw(p, (q) => q.z >= 0);
    },
  };

  // One thorn standing up out of the floor, leaning outward from the caster with its point hooked over the ground
  // beyond it: one horizontal run per px of height, half-width tapering to nothing at the point (as thorns-iso).
  function horn(p, s) {
    const g = grown(s), k = sunk(s), hh = s.h * g;
    if (g <= 0 || k >= 1) return;
    const ex = Math.cos(s.a), ey = Math.sin(s.a) * FLOOR, footX = s.x, footY = s.z * FLOOR, base = k * s.h;
    // the hole and its contact shadow
    const sx2 = s.w * 0.7 + 3, sy2 = sx2 * FLOOR;
    p.ellipse(footX, footY, sx2, sy2, S[3], 1 - k);
    p.ellipse(footX, footY, sx2 * 0.65, sy2 * 0.65, S[1], 1 - k);
    const white = t - s.at < 0.035;
    for (let v = 0; v <= hh; v += 1) {
      const f = clamp(v / Math.max(1, s.h), 0, 1), along = s.lean * f + s.hook * f * f * f;
      const cx = footX + ex * along, cy = footY + ey * along - v + base;
      if (cy > footY + 0.5) continue;
      const hw = (s.w / 2) * Math.pow(1 - f, 1.25) + 0.4 + Math.sin(v * 1.9 + s.seed) * 0.35 * (1 - f);
      for (let u = -hw; u <= hw; u += 1) {
        if (white) { p.px(cx + u, cy, WHITE); continue; }
        const q = (u + hw) / (2 * hw);
        let i = q < 0.08 ? 6 : q < 0.2 ? 5 : q < 0.3 ? 6 : q < 0.44 ? 4 : q < 0.72 ? 3 : 2;
        if (f > 0.88) i = q < 0.5 ? 7 : 5;
        p.px(cx + u, cy, W[i]);
        if (q > 0.7 && f < 0.45 && ((v + s.seed) & 3) === 0) p.blend(cx + u, cy, G[1], 0.5);
      }
    }
    // a barb raking back off the horn
    if (!white && hh > 12) {
      const f0 = 0.45, aa = s.lean * f0 + s.hook * f0 * f0 * f0, hw0 = (s.w / 2) * Math.pow(1 - f0, 0.8);
      const bx = footX + ex * aa + hw0 * 0.7, by = footY + ey * aa - hh * f0 + base;
      for (let u = 1; u < s.w * 0.45; u += 1) p.px(bx + u * 0.75, by - u * 0.85, u > s.w * 0.28 ? W[3] : W[5]);
    }
    // the punch of green light, and leaves at the foot
    const age = t - s.at;
    if (age < 0.3) p.glow(footX, footY - hh * 0.5, hh * 0.6 + 6, G[2], 0.4 * (1 - age / 0.3));
    const lk = clamp((age - 0.04) / 0.16) * (1 - k);
    if (lk > 0.05)
      for (const [side, spread] of [[-1, 1.3], [1, 1.0], [1, 1.9]]) {
        const la = s.a + side * spread, len = (4 + s.w * 0.5) * lk;
        for (let u = 1; u <= len; u += 1) {
          const w = Math.max(0.5, (1 - u / len) * 1.5 + 0.3);
          for (let s2 = -w; s2 <= w; s2 += 1) {
            const px = footX + Math.cos(la) * u - Math.sin(la) * s2 * 0.9;
            const py = footY + (Math.sin(la) * u + Math.cos(la) * s2 * 0.9) * FLOOR - (u / len) * 1.4;
            p.px(px, py, s2 > w * 0.5 ? G[0] : u > len * 0.7 ? G[2] : G[1]);
          }
        }
      }
  }
}
