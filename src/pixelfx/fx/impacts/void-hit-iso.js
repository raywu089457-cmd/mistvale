// What dark magic leaves where it bites: the light goes out of a patch of grass, a violet ember sits in the wound and
// its smoke is drawn back down into it, lilac arms spiral inward across the ground and the grass keeps a violet scar.
// The shadow school's answer to impacts/hit-spark-iso (which throws light out; this one takes it in).
import { Rng, fit, clamp, smooth, TAU } from "../../core/index.js";
import { FLOOR, bandFloor, floorShadow, ringNoise } from "../_iso.js";

export const meta = {
  name: "Void hit (iso)",
  desc: "Dark magic bites on the 2:1 floor: the light goes out of a patch of grass, a violet ember burns in the wound, lilac arms spiral inward and a lilac ring runs out flat.",
  tags: ["impact", "hit", "shadow", "void", "dark", "drain", "one-shot", "iso", "top-down", "ground"],
  size: [150, 120],
  origin: [75, 90],
  duration: 0.52,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: ["#06040b", "#150c26", "#2a1150", "#461a84", "#6f2cc0", "#9d5cec", "#cfa6ff", "#f6eaff"], height: 16, aim: 0, seed: 4 },
};

export function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed ?? 4), H = o.height ?? 16, T = meta.duration;
  const ax = Math.cos(o.aim ?? 0), az = Math.sin(o.aim ?? 0) * FLOOR;
  const wx = ax * 5, wz = az * 5;   // the wound sits a little ahead, on the body
  // the scar: specks of dead ground left in the grass
  const scar = Array.from({ length: 30 }, () => {
    const a = R.range(0, TAU), s = R.range(6, 17);
    return { x: Math.cos(a) * s, z: Math.sin(a) * s, d: R.range(0, 0.08), life: R.range(0.28, 0.48) };
  });
  // embers: they hang around the wound and are pulled down into it (the opposite of a spark flying out)
  const embers = Array.from({ length: 16 }, () => {
    const a = R.range(0, TAU), s = R.range(6, 20);
    return { x0: Math.cos(a) * s, z0: Math.sin(a) * s, h0: R.range(0, 20), tb: R.range(0, 0.07), life: R.range(0.24, 0.44), c: R.pick([C[6], C[5], C[4], C[3]]) };
  });
  // wisps: curls of smoke that lift off the ground then are sucked back into the ember
  const wisps = Array.from({ length: 6 }, () => ({ a: R.range(0, TAU), tb: R.range(0, 0.09), life: R.range(0.3, 0.46), r: R.range(5, 13), up: R.range(12, 26), spin: R.pick([-1, 1]) }));
  // the spiral arms: lilac streaks that race inward across the floor while the bite is fresh
  const arms = Array.from({ length: 5 }, (_, i) => ({ a0: (i / 5) * TAU + R.range(-0.2, 0.2), d: R.range(0, 0.05) }));

  let t = 0;
  return {
    update(dt) { t += dt; },
    draw(p) {
      const fade = 1 - smooth(T - 0.14, T, t);
      if (fade <= 0) return;
      // the ground loses its light: a wide soft dark patch, then a rim of lilac where the light dies
      const k = clamp(t / 0.1);
      floorShadow(p, 0, 0, 13 * k, 0x000000, 0.22 * fade);
      p.ellipse(0, 0, 15 * k, 15 * k * FLOOR, C[0], 0.62 * fade);
      p.ellipse(0, 0, 9 * k, 9 * k * FLOOR, C[1], 0.5 * fade);
      if (t < 0.34) {
        const r = 12 * k;
        for (let i = 0; i < 40; i++) {
          const a = (i / 40) * TAU, j = 1 + (ringNoise(a, 5, 3) - 0.5) * 0.12;
          p.px(Math.cos(a) * r * j, Math.sin(a) * r * j * FLOOR, i % 2 ? C[4] : C[3]);
        }
      }
      for (const s of scar) {
        const age = t - s.d;
        if (age < 0 || age > s.life) continue;
        const u = age / s.life;
        p.px(s.x, s.z * FLOOR, u < 0.25 ? C[4] : u < 0.6 ? C[2] : C[1]);
        if (u < 0.4) p.blend(s.x, s.z * FLOOR, C[3], 0.3 * (1 - u / 0.4));
      }
      // the ring of lilac running out flat, with a thin echo behind it
      if (t < 0.3) {
        const r = 3 + 21 * Math.sqrt(t / 0.3), a = 0.85 * (1 - t / 0.3) ** 1.6;
        bandFloor(p, 0, 0, r, 1.9, a, [C[7], C[6], C[5], C[4], C[3], C[2]], () => true);
        if (t > 0.04) bandFloor(p, 0, 0, r * 0.6, 1.1, a * 0.55, [C[6], C[5], C[4], C[3], C[2]], () => true);
      }
      // spiral arms racing inward
      if (t < 0.2) {
        for (const arm of arms) {
          const age = t - arm.d;
          if (age < 0 || age > 0.2) continue;
          const u = age / 0.2, rr = 24 * (1 - u * 0.85);
          for (let s = 0; s < 22; s++) {
            const q = s / 22, r2 = rr * (1 - q * 0.5), a = arm.a0 - q * 2.2;
            if (r2 < 4) break;
            p.px(Math.cos(a) * r2, Math.sin(a) * r2 * FLOOR, q < 0.2 ? C[6] : C[4]);
          }
        }
      }
      // the wound: a violet ember with a white-lilac heart, the light it eats
      const pop = Math.exp(-t / 0.06);
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -5; dx <= 5; dx++) {
          const m = Math.abs(dx) * 0.62 + Math.abs(dy);
          if (m > 4.2) continue;
          p.px(wx + dx, -H + wz + dy, m < 1.4 ? "#fff" : m < 2.4 ? C[7] : m < 3.2 ? C[6] : C[4]);
        }
      p.ellipse(wx, -H + wz + 3, 4.5 * (0.7 + pop * 0.5), 2.6, C[3], 0.4 * fade);
      // embers drawn inward and down into the wound
      for (const e of embers) {
        const age = t - e.tb;
        if (age < 0 || age > e.life) continue;
        const u = age / e.life, pull = u * u;
        const x = wx + e.x0 * (1 - pull), h = e.h0 * (1 - pull) * 0.8;
        const y = -h + wz + e.z0 * (1 - pull) * FLOOR;
        p.px(x, y, u < 0.28 ? C[7] : u < 0.6 ? e.c : C[3]);
        if (u < 0.2) p.blend(x, y, C[6], 0.6);
        if (u > 0.86) p.px(x, y + 1, C[2]);
      }
      // wisps: each one a short curl that lifts, drifts out and is dragged back down into the ember
      for (const w of wisps) {
        const age = t - w.tb;
        if (age < 0 || age > w.life) continue;
        const u = age / w.life, pull = smooth(0.55, 1, u);
        for (let s = 0; s < 4; s++) {
          const q = u - s * 0.055;
          if (q < 0) continue;
          const lift = Math.sin(q * Math.PI) * w.up * 0.8;
          const rr = (w.r * (0.5 + q * 0.7) + pull * 4) * (1 - pull * 0.7);
          const a = w.a + q * 2.1 * w.spin + pull * 1.4;
          const x = wx + Math.cos(a) * rr, y = -lift - 3 + wz + Math.sin(a) * rr * FLOOR;
          p.px(x, y, s === 0 ? C[6] : s < 2 ? C[4] : C[2]);
          if (s < 2) { p.blend(x, y, C[5], 0.35); p.px(x + 1, y, C[3]); p.px(x, y + 1, C[2]); }
        }
      }
      // light: violet off the ground and the ember, a white pinprick in its heart
      p.glow(wx, -H + wz, 20, C[4], 0.4 * (0.55 * pop + 0.22) * fade);
      p.glow(0, 0, 20, C[3], 0.24 * Math.max(0, 1 - t / 0.22) * fade);
      if (pop > 0.05) p.glow(wx, -H + wz, 7, C[7], 0.5 * pop);
    },
  };
}
