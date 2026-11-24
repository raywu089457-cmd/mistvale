// Iron sweep (Mistvale-local): 震地掃, the paladin's 長槍橫掃 when his weapon is blunt (鈍器). Heavy and short: the
// weapon is hauled round behind him, swung through a full low turn at knee height (a thick dark steel smear, not a
// light arc), and brought down into the floor in front of him at the end of the turn; the floor takes it:
//   - wind-up (0 .. 0.08 s): a cold glint gathers on the iron behind the hero;
//   - the sweep (0.08 .. 0.24 s): a thick steel crescent at knee height runs 330 degrees round him, its head lit
//     white-blue, sparks raked off the floor under it, its tail smoking out in grey;
//   - the slam (0.24 s = the skill's damage delay):
//       * a white flash over the whole hit area and a white star where the head lands;
//       * a thick, bright shock ring that runs out from the hero and stops exactly on the skill's reach (the band is
//         drawn inward from its radius, so its outer edge IS the reach), then lies there as a lit edge for a beat;
//       * a dent where the head hit, thick cracks (dark split, lit lip, hot orange at first) opening out of it;
//       * rocks and grit thrown up in 3-D, bouncing and settling, and a dust wall rolling out behind the ring;
//   - everything behind the hero (negative depth) goes in the back layer.
// `reach` is the skill radius in px (pixel-world turns the skill's 1.9 world units into it).
// 1 px = 1 character sprite px. aim is a floor angle: 0 = screen right, PI/2 = down the screen toward the viewer.
import { P, Rng, fit, clamp, smooth, ease, TAU, WHITE, sparkle, hex, mix, rand } from "../../../pixelfx/core/index.js";
import { FLOOR, bandFloor, ringNoise, Fly3, floorShadow } from "../../../pixelfx/fx/_iso.js";
import { dustRing, stone, rock, rockShape, SOOT } from "../../../pixelfx/fx/impacts/_lib.js";

export const meta = {
  name: "Iron sweep (iso)",
  desc: "A heavy iron sweep: a thick steel smear round the hero at knee height, then the iron slams the floor in front of him: a white flash, a star and a dent, thick cracks, rocks and grit thrown up, and a bright shock ring that stops on the skill's reach.",
  tags: ["melee", "iron", "sweep", "heavy", "blunt", "slam", "shockwave", "ground", "aoe", "directional", "one-shot", "iso", "top-down"],
  size: [184, 150],
  origin: [92, 98],
  duration: 1.05,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: {
    palette: ["#14161c", "#2a2e37", "#454c58", "#6b7482", "#9aa5b4", "#d2dae4", "#f4f8ff"],
    spark: ["#5a1c08", "#b4420e", "#f08a1c", "#ffd27a"],
    stone: "#5b5550",
    aim: 0,
    reach: 55,
    seed: 4,
  },
};

const D = meta.duration, KNEE = 7, WIND = 0.08, SWEEP = 0.16, HIT = WIND + SWEEP;   // HIT 0.24 = the skill's delay
const SPAN = (330 * Math.PI) / 180, WAVE = 0.2;                                     // the ring reaches the edge 0.2 s after the slam

export function create(o) {
  const F = fit(o.palette, 7), S = fit(o.spark, 4), R = new Rng(o.seed ?? 4), aim = o.aim ?? 0, st = stone(o.stone ?? "#5b5550");
  const RR = clamp(o.reach ?? 55, 24, 72), a0 = aim - SPAN;   // the turn ends on the aim, where the head comes down
  const HR = RR * 0.62, HX = Math.cos(aim) * HR, HZ = Math.sin(aim) * HR, HY = HZ * FLOOR;   // where the head comes down
  const fly = new Fly3({ rng: R, sparks: [S[3], S[2], S[1], S[0]] });
  const P3 = (r, a, h) => [Math.cos(a) * r, Math.sin(a) * r * FLOOR - h];
  const headA = (t) => a0 + SPAN * ease.inQuad(clamp((t - WIND) / SWEEP));
  const passed = (a) => WIND + SWEEP * Math.sqrt(clamp((a - a0) / SPAN));
  const DUST = mix(hex("#7a6a58"), F[3], 0.3), RIM = [F[2], F[3], F[4], F[5], F[6], "#ffffff"];
  // thick cracks out of the dent: jagged walks, the first ones aimed out across the hit area
  const CRACKS = [];
  for (let i = 0; i < 9; i++) {
    const th = aim + (i / 9) * TAU + R.range(-0.25, 0.25), len = RR * R.range(0.45, 0.85), pts = [];
    let a = th, d = 5;
    while (d < len) { pts.push([HX + Math.cos(a) * d, HY + Math.sin(a) * d * FLOOR]); a += R.range(-0.35, 0.35); a = th + clamp(a - th, -0.5, 0.5); d += R.range(2.5, 4); }
    CRACKS.push({ pts, seed: R.int(1, 999) });
  }
  // rocks knocked loose by the head: thrown up and out, bounce once or twice and settle
  const ROCKS = Array.from({ length: 11 }, (_, i) => {
    const s = i < 2 ? 4 : R.int(2, 3), a = R.range(0, TAU), sp = R.range(25, 70) * (s > 3 ? 0.6 : 1);
    return { s, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vh: R.range(70, 150) * (s > 3 ? 0.7 : 1), x: HX, z: HZ, h: 0, va: R.range(-9, 9), a2: R.range(0, TAU), rest: false, pts: rockShape(R) };
  });
  let t = 0, hit = false, raked = 0;

  return {
    update(dt) {
      t += dt;
      // sparks raked off the floor under the head as it goes round
      if (t > WIND && t < HIT) {
        const want = Math.floor(((t - WIND) / SWEEP) * 14);
        while (raked < want) {
          raked++;
          const a = headA(t), r = RR * R.range(0.75, 0.95);
          fly.spawn(P.SPARK, Math.cos(a) * r, Math.sin(a) * r, 1, -Math.sin(a) * R.range(40, 90), Math.cos(a) * R.range(40, 90), R.range(30, 80), R.range(0.12, 0.25), R.pick([S[3], S[2]]), 1);
        }
      }
      if (!hit && t >= HIT) {
        hit = true;
        for (let i = 0; i < 28; i++) {
          const a = R.range(0, TAU), v = R.range(40, 130);
          fly.spawn(P.GRIT, HX, HZ, R.range(0, 3), Math.cos(a) * v, Math.sin(a) * v, R.range(60, 190), R.range(0.4, 0.75), R.pick([DUST, st.light, st.body, F[2]]), R.chance(0.45) ? 2 : 1);
        }
        for (let i = 0; i < 16; i++) {
          const a = R.range(0, TAU), v = R.range(60, 160);
          fly.spawn(P.SPARK, HX, HZ, R.range(1, 4), Math.cos(a) * v, Math.sin(a) * v, R.range(50, 150), R.range(0.12, 0.3), R.pick([S[3], S[2], WHITE]), 1);
        }
      }
      if (hit) for (const q of ROCKS) {
        if (q.rest) continue;
        q.vh -= 427 * dt;
        const f = Math.exp(-1.4 * dt);
        q.vx *= f; q.vz *= f; q.va *= f;
        q.h += q.vh * dt; q.x += q.vx * dt; q.z += q.vz * dt; q.a2 += q.va * dt;
        if (q.h <= 0) {
          q.h = 0;
          if (Math.abs(q.vh) > 40) { q.vh = -q.vh * 0.32; q.vx *= 0.55; q.vz *= 0.55; }
          else { q.vh = 0; q.vx = 0; q.vz = 0; q.va = 0; q.rest = true; }
        }
      }
      if (D - t < 0.2) fly.cap(Math.max(0.001, D - t - 0.02));
      fly.update(dt);
    },
    drawBack(p) {
      if (t >= D) return;
      floor(p);
      smear(p, false);
      rocks(p, false);
      fly.draw(p, (q) => q.z < 0);
    },
    draw(p) {
      if (t >= D) return;
      if (t < WIND + 0.02) {
        // the glint gathering on the iron behind him before it moves
        const [x, y] = P3(RR * 0.8, a0, KNEE + 4), k = clamp(t / WIND);
        sparkle(p, x, y, 1 + 3 * k, WHITE, F[5], 0.5 + 0.4 * k);
        p.glow(x, y, 8, F[5], 0.4 * k);
      }
      smear(p, true);
      impact(p);
      rocks(p, true);
      fly.draw(p, (q) => q.z >= 0);
    },
  };

  // the steel crescent at knee height: thick at the head, smoking out grey along its tail
  function smear(p, front) {
    if (t < WIND) return;
    const hA = headA(t), da = 0.6 / RR;
    for (let a = a0; a <= hA; a += da) {
      const age = t - passed(a), k = Math.exp(-age / 0.07);
      if (k < 0.05) continue;
      if ((Math.sin(a) >= 0) !== front) continue;
      const lead = clamp(1 - (hA - a) / 1.2), r0 = RR * (0.42 + 0.3 * (1 - lead)), r1 = RR * 0.98;
      for (let r = r0; r <= r1; r += 1) {
        const q = (r - r0) / Math.max(1, r1 - r0);
        const [x, y] = P3(r, a, KNEE + q * 3);
        const c = lead > 0.85 && q > 0.7 ? F[6] : q > 0.75 ? F[5] : q > 0.4 ? F[4] : k > 0.5 ? F[3] : F[2];
        p.blend(x, y, c, (0.5 + 0.5 * q) * k);
      }
    }
    if (t < HIT && (Math.sin(hA) >= 0) === front) {
      const [x, y] = P3(RR * 0.95, hA, KNEE + 3);
      p.glow(x, y, 8, F[5], 0.5);
      p.px(x, y, WHITE);
    }
  }

  // the floor's answer: the flash, the ring running out to the reach and its edge left lying there, the dust wall,
  // the dent and the cracks
  function floor(p) {
    const age = t - HIT;
    if (age < 0) return;
    // a white flash over the whole hit area, the instant the iron lands
    const fk = 1 - clamp(age / 0.1);
    if (fk > 0) {
      p.ellipse(0, 0, RR, RR * FLOOR, WHITE, 0.32 * fk);
      p.ellipse(HX, HY, RR * 0.45, RR * 0.45 * FLOOR, WHITE, 0.55 * fk);
    }
    // the ring: thick and bright, white-hot for its first moments, running out and stopping on the reach
    const u = clamp(age / WAVE), rr = 8 + (RR - 8) * ease.outCubic(u);
    if (u < 1) {
      bandFloor(p, 0, 0, rr, 4 + 6 * (1 - u), 1, RIM, (g) => ringNoise(g, 6, 21) > 0.06);
      if (age < 0.08) bandFloor(p, 0, 0, rr, 2, 1, [WHITE, WHITE, WHITE, WHITE], () => true);
      dustRing(p, 0, 0, Math.max(4, rr * 0.82), 3 + 3 * (1 - u), 0.32 * (1 - u * 0.4), DUST, { sy: FLOOR, ph: 2 * u, brk: 0.35 * u, lit: 0.4 });
    }
    // the edge it leaves on the reach: the area of the blow, held a beat, then breaking up
    const ek = smooth(WAVE - 0.04, WAVE, age) * (1 - smooth(0.5, 0.75, age));
    if (ek > 0.02) {
      bandFloor(p, 0, 0, RR, 2.6, 0.95 * ek, RIM.slice(1), (g) => rand(Math.round(g * 44), 7) > 0.12 + 0.5 * smooth(0.45, 0.75, age));
      dustRing(p, 0, 0, RR - 1, 2.6, 0.22 * ek, DUST, { sy: FLOOR, ph: 1.3, brk: 0.2 + 0.5 * smooth(0.45, 0.75, age), lit: 0.45 });
    }
    // the dent the head made
    const dk = 1 - smooth(0.55, 0.8, age);
    if (dk > 0) {
      p.ellipse(HX, HY, 10, 5, F[2], 0.85 * dk);
      p.ellipse(HX, HY - 0.5, 7, 3.4, F[0], 0.95 * dk);
      p.ellipse(HX - 1, HY - 2, 7, 1.4, F[4], 0.5 * dk);   // the lit lip on its far side
    }
    // thick cracks: a dark split with a lit lip along its upper side, hot orange while the blow is fresh
    const open = clamp(age / 0.16), bury = smooth(0.6, 0.8, age);
    for (const c of CRACKS) {
      const m = Math.floor(c.pts.length * open);
      for (let k = 1; k < m; k++) {
        if (rand(k * 5 + c.seed, 3) < bury) continue;
        const [x0, y0] = c.pts[k - 1], [x1, y1] = c.pts[k], w = 1 - k / c.pts.length;
        const hot = age < 0.18 && k < 4;
        p.line(x0, y0, x1, y1, hot ? S[2] : F[0]);
        if (w > 0.35) p.line(x0, y0 + 1, x1, y1 + 1, hot ? S[1] : F[0]);
        p.line(x0, y0 - 1, x1, y1 - 1, F[4], 0.55 * (1 - bury));
      }
    }
  }

  // the white star and the flash where the iron lands
  function impact(p) {
    const age = t - HIT;
    if (age < 0 || age > 0.28) return;
    const k = 1 - age / 0.28;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + 0.2, len = (8 + (i % 2) * 8) * (0.5 + k);
      p.line(HX, HY, HX + Math.cos(a) * len, HY + Math.sin(a) * len * FLOOR, i % 2 ? F[6] : WHITE, k);
    }
    p.glow(HX, HY - 2, 22, S[3], 0.55 * k);
    p.glow(HX, HY - 2, 12, WHITE, 0.8 * k);
    if (age < 0.06) sparkle(p, HX, HY - 3, 7, WHITE, F[6], 1);
  }

  // the rocks, shadowed on the floor under them
  function rocks(p, front) {
    if (!hit || t > D - 0.04) return;
    for (const q of ROCKS) {
      if ((q.z >= 0) !== front) continue;
      floorShadow(p, q.x, q.z * FLOOR, 1.2 + q.s * 0.7, SOOT, 0.25 * Math.min(1, q.h / 25) + 0.1);
      rock(p, { x: q.x, y: q.z * FLOOR - q.h, s: q.s, a: q.a2, life: (D - t) * 0.6, pts: q.pts }, st);
    }
  }
}
