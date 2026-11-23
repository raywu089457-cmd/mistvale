// A blade landing on the game's 2:1 floor: the edge bites with a white cut across the wound, a hard star and a steel
// fan of sparks and shavings, then the floor takes a ring and a scuff and the cut cools from white to steel blue.
// Three blades, one recipe (options.kind):
//   "slash"  one cut across the wound, a four-point star, a fan of sparks along the cut;
//   "heavy"  a cleave: a wide white bite, a dent in the floor, dust rolling out, grit and rock chips thrown up;
//   "pierce" a needle through the wound: a long thin star along the aim and a pierce ring on the floor.
// Same recipe as impacts/hit-spark-iso's sparks, seen on the game's floor: 1 px = 1 hero px, heights are heights,
// the floor lies 2:1. Deterministic, closed form in t, empty by meta.duration.
import { Rng, fit, clamp, smooth, TAU, WHITE, mix } from "../../core/index.js";
import { FLOOR, bandFloor, floorShadow } from "../_iso.js";

export const meta = {
  name: "Blade hit (iso)",
  desc: "A blade lands on the 2:1 floor: a white cut across the wound, a hard star, a fan of steel sparks and shavings that fly in three dimensions and lie, a ring and a scuff on the floor.",
  tags: ["impact", "hit", "blade", "steel", "slash", "pierce", "combat", "one-shot", "iso", "top-down", "ground"],
  size: [150, 120],
  origin: [75, 88],
  duration: 0.5,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: ["#121a2e", "#27437a", "#4a86c8", "#8ecbff", "#cfe8ff", "#ffffff", "#fff2c4"], height: 18, kind: "slash", aim: 0, seed: 3 },
};

// a tapered ray out of the star: white at the root, a hair at the tip, thicker at the base
function ray(p, x, y, a, L, w, C, from = 0) {
  const c = Math.cos(a), s = Math.sin(a);
  for (let d = from * L; d <= L; d += 0.5) {
    const u = d / L, hw = w * Math.pow(1 - u, 1.6);
    p.px(x + c * d, y + s * d, u < 0.3 ? WHITE : u < 0.62 ? C[5] : u < 0.88 ? C[4] : C[3]);
    if (hw > 0.45) for (let o = 0.5; o <= hw; o += 0.5) for (const e of [-o, o]) p.px(x + c * d - s * e, y + s * d + c * e, u < 0.3 && o < 1 ? C[5] : C[4]);
  }
}

// one cut of the bite: a hot groove through the wound, fat in the middle, cooling toward both tips
function cut(p, x, y, a, L, w, C, k, dim = 1) {
  const c = Math.cos(a), s = Math.sin(a);
  for (let d = -L; d <= L; d += 0.5) {
    const u = Math.abs(d) / L, hw = w * Math.pow(1 - Math.pow(u, 1.6), 0.7) * k;
    if (hw <= 0.2) continue;
    const px = x + c * d, py = y + s * d;
    p.px(px, py, u < 0.36 * dim ? WHITE : u < 0.4 ? C[5] : u < 0.75 ? C[4] : C[3]);
    if (hw > 0.8) for (let o = 0.5; o <= hw; o += 0.5) for (const e of [-o, o]) {
      const xx = px - s * e, yy = py + c * e;
      p.px(xx, yy, u < 0.26 * dim && o < 1.1 ? C[5] : o < hw * 0.6 ? C[4] : C[3]);
    }
  }
}

// a spark or a shaving in the air: thrown in 3D (x across, z into the floor, h up), pulled down by gravity, and it
// lies where it lands at its own depth. A hard one bounces once. Closed form, so any frame draws alone.
function flyBit(p, q, t, C) {
  const age = t - q.tb;
  if (age < 0 || age > q.life) return;
  const u = clamp(age / q.life);
  let h = q.h0 + q.vh * age - 0.5 * 420 * age * age, vh = q.vh;
  let x = q.x0 + q.vx * age, z = q.z0 + q.vz * age;
  if (h < 0) {
    const th = (q.vh + Math.sqrt(Math.max(0, q.vh * q.vh + 2 * 420 * q.h0))) / 420;
    const hb = q.vh - 420 * th, tb = age - th;
    x = q.x0 + q.vx * (th + tb * 0.35); z = q.z0 + q.vz * (th + tb * 0.35);
    h = Math.max(0, -hb * 0.28 * tb - 0.5 * 420 * tb * tb);
    vh = -hb * 0.28;
  }
  const sy = z * FLOOR - h;
  if (h <= 0.5) {
    // lying on the floor: a lit chip cooling to a dark one
    p.px(x, z * FLOOR, u < 0.4 ? q.c : u < 0.7 ? C[2] : C[1]);
    return;
  }
  const hot = u < 0.3, mid = u < 0.6;
  p.px(x, sy, hot ? WHITE : mid ? q.c : C[2]);
  if (q.tail && u < 0.55) {
    // a streak behind it, so speed reads on a still frame
    const bx = x - q.vx * 0.022, bz = z * FLOOR - (h + vh * 0.022);
    p.px(bx, bz, hot ? C[5] : C[3]);
    if (u < 0.3) p.px(bx - q.vx * 0.02, bz - vh * 0.02, C[2]);
  } else if (u < 0.25) p.px(x, sy - Math.sign(vh || 1), C[4]);
}

export function create(o) {
  const C = fit(o.palette, 7), R = new Rng(o.seed ?? 3), H = o.height ?? 18, kind = o.kind ?? "slash", aim = o.aim ?? 0;
  const heavy = kind === "heavy", pierce = kind === "pierce";
  const T = meta.duration, POP = 0.055;
  // the blow on screen: the aim squashed onto the 2:1 floor, and the cut lying ACROSS it (a blade crossing the body)
  const ax = Math.cos(aim), az = Math.sin(aim) * FLOOR, al = Math.hypot(ax, az) || 1, ux = ax / al, uy = az / al;
  const nd = Math.atan2(uy, ux);                               // the aim, as a screen angle
  const lean = R.range(0, 1) < 0.5 ? -1 : 1;                   // which way the blade ran through the wound
  const cutA = nd + Math.PI / 2 + 0.62 * lean;                 // the main cut: a diagonal across the aim
  const cutB = cutA - 1.18 * lean;                             // the crossing cut, so the bite reads as an X
  const CL = heavy ? 15 : pierce ? 7 : 11;                     // half the main cut's length
  const CW = heavy ? 3 : pierce ? 1.2 : 2.2;                   // its half thickness
  // the star: a long line along the main cut, a shorter crossing line, and (heavy) a pair of hair rays
  const rays = pierce
    ? [{ a: nd, L: 30, w: 1.5 }, { a: nd + Math.PI, L: 9, w: 1.4 }, { a: cutA, L: 6, w: 1 }, { a: cutA + Math.PI, L: 5, w: 1 }]
    : [{ a: cutA, L: heavy ? 26 : 19, w: heavy ? 2.7 : 2.1 }, { a: cutA + Math.PI, L: heavy ? 14 : 11, w: heavy ? 2.2 : 1.8 },
      { a: cutB, L: heavy ? 16 : 12, w: heavy ? 2.4 : 1.9 }, { a: cutB + Math.PI, L: heavy ? 8 : 6, w: 1.4 },
      ...(heavy ? [{ a: nd + 0.7, L: 7, w: 1.1 }, { a: nd - 0.7, L: 6, w: 1.1 }] : [])];
  const RING = { r0: 2, r1: heavy ? 22 : pierce ? 10 : 14, life: heavy ? 0.32 : 0.22 };
  // sparks: mostly a fan in the plane of the cut (that is what a blade throws), a few kicked back along the aim
  const sparks = [];
  const NS = heavy ? 28 : pierce ? 12 : 19;
  for (let i = 0; i < NS; i++) {
    const fan = i < NS * 0.72;
    const a = fan ? (R.range(0, 1) < 0.5 ? cutA : cutA + Math.PI) + R.range(-0.75, 0.75) : nd + R.range(-1.1, 1.1);
    const s = R.range(55, heavy ? 185 : 160);
    sparks.push({ x0: R.range(-1.5, 1.5), z0: 0, vx: Math.cos(a) * s, vz: Math.sin(a) * s, h0: H + R.range(-5, 4), vh: R.range(10, heavy ? 115 : 95), tb: R.range(0, 0.013), life: R.range(0.15, heavy ? 0.42 : 0.33), c: R.pick([C[5], C[5], C[4], C[3], C[3], C[2]]), tail: i % 3 !== 2 });
  }
  // shavings: heavier steel, they land, hop and lie there a while
  const chips = [];
  for (let i = 0; i < (heavy ? 10 : pierce ? 4 : 7); i++) {
    const a = (R.range(0, 1) < 0.5 ? cutA : cutA + Math.PI) + R.range(-1.1, 1.1), s = R.range(25, 95);
    chips.push({ x0: 0, z0: 0, vx: Math.cos(a) * s, vz: Math.sin(a) * s, h0: H + R.range(-5, 2), vh: R.range(8, 70), tb: R.range(0, 0.02), life: R.range(0.28, 0.46), c: R.pick([C[4], C[3], C[2]]) });
  }
  const all = [...sparks, ...chips];
  // heavy: dust rolling out of the bite, grit and rock chips thrown up off the floor
  const dust = heavy ? Array.from({ length: 8 }, () => {
    const a = R.range(0, TAU), s = R.range(12, 48);
    return { a, s, tb: R.range(0, 0.04), r0: R.range(2.5, 4), r1: R.range(7, 14), life: R.range(0.28, 0.5) };
  }) : [];
  const grit = heavy ? Array.from({ length: 13 }, () => {
    const a = R.range(0, TAU), s = R.range(30, 140);
    return { x0: 0, z0: 0, vx: Math.cos(a) * s, vz: Math.sin(a) * s, h0: 0.5, vh: R.range(35, 110), tb: 0, life: R.range(0.28, 0.5), c: R.pick([C[1], C[2], C[3]]) };
  }) : [];
  // marks loosened from the cut: short strokes on the floor at the wound's foot
  const strokes = Array.from({ length: heavy ? 6 : 4 }, () => ({ a: R.range(0, TAU), d: R.range(3, heavy ? 13 : 9), len: R.range(3, heavy ? 9 : 6), life: R.range(0.2, 0.42) }));

  let t = 0;
  return {
    update(dt) { t += dt; },
    draw(p) {
      const pop = Math.exp(-t / POP), fade = 1 - smooth(T - 0.14, T, t);
      if (fade <= 0) return;
      const ua = Math.atan2(uy, ux);
      // the floor takes the blow: the shadow under it, then the scuff strokes of the bite
      floorShadow(p, 0, 0, heavy ? 7 : 5, 0x000000, 0.18 * fade);
      if (t < 0.4) {
        const k = clamp(t / 0.06);
        for (const q of strokes) {
          if (t > q.life) continue;
          const f = 1 - t / q.life, ox = Math.cos(q.a) * q.d, oz = Math.sin(q.a) * q.d;
          for (let d = -q.len * k; d <= q.len * k; d += 1) {
            const u = Math.abs(d) / (q.len * k || 1);
            p.blend(ox + Math.cos(q.a) * d, oz + Math.sin(q.a) * d, u < 0.5 ? C[3] : C[2], 0.4 * f * f);
          }
        }
        // the tip ticked the floor: a dashed scuff under the wound, along the main cut
        for (let d = -CL * 0.7; d <= CL * 0.7; d += 1) {
          if (Math.abs(Math.round(d)) % 3 === 0) continue;
          const u = Math.abs(d) / (CL * 0.7), c = Math.cos(cutA), s = Math.sin(cutA);
          p.blend(c * d, s * d, u < 0.5 ? C[3] : C[2], (t < 0.1 ? 0.55 : 0.32) * (1 - t / 0.4));
        }
      }
      if (t < RING.life) {
        const k = t / RING.life, r = RING.r0 + (RING.r1 - RING.r0) * Math.sqrt(k);
        bandFloor(p, 0, 0, r, heavy ? 2 : 1.2, 0.65 * (1 - k) * (1 - k), [C[5], C[4], C[3], C[2], C[1]], () => true);
      }
      for (const q of dust) {
        const age = t - q.tb;
        if (age < 0 || age > q.life) continue;
        const u = age / q.life, rr = q.r0 + (q.r1 - q.r0) * Math.sqrt(u), a = 0.26 * (1 - u) * (1 - u);
        const x = Math.cos(q.a) * q.s * u * 1.5, z = Math.sin(q.a) * q.s * u * 1.5;
        p.ellipse(x, z * FLOOR, rr, rr * FLOOR, C[1], a);
      }
      for (const q of grit) flyBit(p, q, t, C);
      for (const q of all) flyBit(p, q, t, C);
      // the blade arriving: a short tapered streak from the aim's side into the wound, so the blow has a direction
      if (t < 0.085) {
        const back = heavy ? 15 : pierce ? 0 : 12;
        for (let d = 0; d <= back; d += 0.5) {
          const u = d / back, w = (1 - u) * (heavy ? 2.4 : 1.8) * (u < 0.5 ? 1 : 0.6);
          const bx = -ux * d, by = -H - uy * d;
          p.px(bx, by, u < 0.55 ? WHITE : C[4]);
          for (let o = 0.5; o <= w; o += 0.5) for (const e of [-o, o]) p.px(bx - uy * e, by + ux * e, u < 0.4 && o < 1 ? C[5] : C[3]);
        }
      }
      // the bite: two hot cuts crossing at the wound, then a white core where the edge stopped
      if (t < POP * 1.7) {
        const k = 1 - t / (POP * 1.7);
        cut(p, 0, -H, cutA, CL * (0.55 + 0.45 * k), CW * k + 0.7, C, 1);
        if (!pierce) cut(p, 0, -H, cutB, CL * 0.7 * (0.55 + 0.45 * k), CW * 0.7 * k + 0.6, C, 0.85);
        const cl = pierce ? 0.62 : 1;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -4; dx <= 4; dx++) {
          const m = Math.abs(dx) * 0.7 * cl + Math.abs(dy);
          if (m <= 2.1 * k + 0.5) p.px(dx, -H + dy, WHITE);
          else if (m <= 3.2 * k + 0.6) p.px(dx, -H + dy, C[5]);
        }
      }
      if (t < (heavy ? 0.09 : 0.07)) {
        for (const r of rays) ray(p, 0, -H, r.a, r.L, r.w, C);
      } else if (t < (heavy ? 0.18 : 0.13)) {
        for (const r of rays) ray(p, 0, -H, r.a, r.L * 1.15, r.w * 0.5, C, 0.18);
      } else if (t < (heavy ? 0.3 : 0.22)) {
        ray(p, 0, -H, rays[0].a, rays[0].L * 1.25, 0.5, [C[0], C[1], C[2], C[3], C[3], C[4], C[5]], 0.5);
      }
      // pierce: the needle's lane, tapered, and a ring standing on its point
      if (pierce && t < 0.16) {
        const k = t < 0.06 ? 1 : 1 - (t - 0.06) / 0.1;
        for (let d = -6; d <= 26; d += 0.5) {
          const u = (d + 6) / 32, hw = 1.5 * (1 - Math.abs(u - 0.45) * 1.4);
          p.px(d * ux, -H + d * uy, u < 0.3 ? WHITE : u < 0.65 ? C[5] : C[4]);
          if (t < 0.07 && hw > 0.8) for (const e of [-1, 1]) p.px(d * ux - uy * e, -H + d * uy + ux * e, e < 0 ? C[5] : C[4]);
        }
        if (t < 0.11) bandFloor(p, 26 * ux, 26 * uy, 6 * (0.4 + 0.6 * k) * (1 - (t - 0.03) / 0.08), 1, 0.5, [C[4], C[3], C[2]], () => true);
      }
      // light: the bite lights the body, the floor glow under it
      if (pop > 0.02) {
        p.glow(0, -H, heavy ? 30 : 23, C[3], 0.42 * pop);
        p.glow(0, -H, 7, WHITE, 0.24 * pop);
      }
      p.glow(0, 0, RING.r0 + (heavy ? 13 : 9), C[2], 0.18 * Math.max(0, 1 - t / 0.3));
      // heavy lands a dent: a dark bite in the floor with a bright rim and a couple of cracks
      if (heavy && t < 0.4) {
        const k = clamp(t / 0.05), f = 1 - t / 0.4;
        p.ellipse(0, 0, 5 * k, 2.5 * k, C[0], 0.55 * f);
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * TAU, rr = 5 * k;
          p.blend(Math.cos(a) * rr, Math.sin(a) * rr * FLOOR, i % 3 ? C[3] : C[2], 0.5 * f);
        }
        for (let a = 0; a < 4; a++) {
          const ang = R.range(0, TAU), len = R.range(5, 13) * k;
          for (let d = 0; d <= len; d += 1) p.blend(Math.cos(ang) * (5 + d), Math.sin(ang) * (5 + d) * FLOOR, C[2], 0.3 * f);
        }
      }
    },
  };
}
