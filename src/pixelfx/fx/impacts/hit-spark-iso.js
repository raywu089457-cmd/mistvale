// The everyday hit, seen from the game's 2:1 camera: a white cross flare at the point that was struck, a ring of
// light spreading on the floor under it, sparks thrown out in three dimensions and hot chips that fall, tick off the
// floor and lie there. Same recipe as impacts/hit-spark, with the floor as a plane instead of a line.
import { Rng, fit, clamp, smooth, TAU, WHITE, mix } from "../../core/index.js";
import { FLOOR, bandFloor, floorShadow } from "../_iso.js";

export const meta = {
  name: "Hit spark (iso)",
  desc: "A hit on the 2:1 floor: a white cross flare at the wound, a ring of light running out along it, sparks thrown in three dimensions, hot chips falling and lying where they land.",
  tags: ["impact", "hit", "spark", "combat", "one-shot", "iso", "top-down", "ground"],
  size: [120, 100],
  origin: [60, 72],
  duration: 0.44,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: ["#4a1712", "#c9281f", "#f2561d", "#ff8a2a", "#ffe26b", "#fff3a6", "#ffffff"], height: 20, seed: 4 },
};

// one ray of the cross: fat at the root, a hair at the tip, white cooling outward
function ray(p, x, y, a, L, w, C, from = 0) {
  const c = Math.cos(a), s = Math.sin(a);
  for (let d = from * L; d <= L; d += 0.5) {
    const u = d / L, hw = w * Math.pow(1 - u, 1.6);
    const col = u < 0.3 ? WHITE : u < 0.62 ? C[5] : u < 0.88 ? C[4] : C[3];
    p.px(x + c * d, y + s * d, col);
    if (hw > 0.45) for (let o = 0.5; o <= hw; o += 0.5) for (const e of [-o, o]) p.px(x + c * d - s * e, y + s * d + c * e, u < 0.3 && o < 1 ? C[5] : C[4]);
  }
}

// the core: a crisp white diamond with a pale rim
function diamond(p, x, y, r, C) {
  for (let dy = -r - 1; dy <= r + 1; dy++)
    for (let dx = -r - 1; dx <= r + 1; dx++) {
      const m = Math.abs(dx) + Math.abs(dy);
      if (m <= r) p.px(x + dx, y + dy, WHITE);
      else if (m === r + 1) p.px(x + dx, y + dy, C[3]);
    }
}

// a spark or a chip in the air: it flies out on the floor plane and falls straight down the screen; h < 0 means it
// has landed, so it lies at its landing spot and cools. Positions are closed form, so any frame can be drawn alone.
function flySpark(p, q, t, C) {
  const age = t - q.tb;
  if (age < 0 || age > q.life) return;
  const u = clamp(age / q.life);
  let h = q.h0 + q.vh * age - 0.5 * 420 * age * age, vh = q.vh, x = q.x0 + q.vx * age, z = q.z0 + q.vz * age;
  if (h < 0) {
    // one bounce: it hits the floor, hops, and lies where it stops
    const th = (-q.vh + Math.sqrt(Math.max(0, q.vh * q.vh + 2 * 420 * q.h0))) / 420;
    const hb = q.vh - 420 * th, tb = age - th;
    x = q.x0 + q.vx * (th + tb * 0.4); z = q.z0 + q.vz * (th + tb * 0.4);
    h = Math.max(0, -hb * 0.32 * tb - 0.5 * 420 * tb * tb);
    vh = -hb * 0.32;
  }
  const sy = z * FLOOR - h;
  if (h <= 0.4) {
    // on the floor: a chip lying there, its glow dying out
    p.px(x, z * FLOOR, u < 0.5 ? q.c : C[1]);
    return;
  }
  p.px(x, sy, u < 0.22 ? WHITE : u < 0.5 ? q.c : C[2]);
  if (u < 0.35) p.px(x - q.vx * 0.02, sy + (vh > 0 ? 1 : -1), C[3]);
  p.blend(x, sy, mix(q.c, C[3], 0.15), 0.5);
}

export function create(o) {
  const C = fit(o.palette, 7), R = new Rng(o.seed ?? 4), H = o.height ?? 20, A = 0.1;
  const tilt = R.range(-0.1, 0.1);
  const rays = [
    { a: A + tilt, L: R.range(30, 34), w: 2.1 },
    { a: A + Math.PI + tilt, L: R.range(7, 9), w: 2.1 },
    { a: A - Math.PI / 2 + tilt, L: R.range(13, 16), w: 2.4 },
    { a: A + Math.PI / 2 + tilt, L: R.range(9, 11), w: 2.2 },
    { a: A - Math.PI / 4 + tilt, L: R.range(4, 6), w: 1 },
  ];
  // the ring of light on the floor, and the dust the blow kicks up under it
  const RING = { r0: 2.5, r1: 15, life: 0.24 };
  // sparks: thrown out of the wound in every floor direction, up and outward
  const sparks = [];
  for (let i = 0; i < 18; i++) {
    const a = R.range(0, TAU), s = R.range(50, 148);
    sparks.push({ x0: 0, z0: 0, vx: Math.cos(a) * s, vz: Math.sin(a) * s, h0: H + R.range(-2, 3), vh: R.range(20, 95), tb: R.range(0, 0.012), life: R.range(0.16, 0.34), c: R.pick([C[5], C[4], C[4], C[3], C[2]]) });
  }
  // chips: heavier, they land and stay
  const chips = [];
  for (let i = 0; i < 6; i++) {
    const a = R.range(0, TAU), s = R.range(25, 75);
    chips.push({ x0: 0, z0: 0, vx: Math.cos(a) * s, vz: Math.sin(a) * s, h0: H + R.range(-3, 2), vh: R.range(15, 55), tb: R.range(0, 0.02), life: R.range(0.24, 0.4), c: R.pick([C[3], C[2], C[1]]) });
  }
  const all = [...sparks, ...chips];

  let t = 0;
  return {
    update(dt) { t += dt; },
    draw(p) {
      const pop = Math.exp(-t / 0.05), fade = 1 - smooth(0.3, 0.44, t);
      if (fade <= 0) return;
      // the floor takes the blow: light running out along it, and the shadow of what is in the air over it
      floorShadow(p, 0, 0, 5, 0x000000, 0.16 * fade);
      if (t < RING.life) {
        const k = t / RING.life, r = RING.r0 + (RING.r1 - RING.r0) * Math.sqrt(k);
        bandFloor(p, 0, 0, r, 1.2, 0.62 * (1 - k) * (1 - k), [C[5], C[4], C[4], C[3], C[2]], () => true);
      }
      for (const q of all) flySpark(p, q, t, C);
      if (t < 0.045) {
        for (const r of rays) ray(p, 0, -H, r.a, r.L, r.w, C);
        diamond(p, 0, -H, 4, C);
        for (let d = -2; d <= 2; d++) p.px(d * 0.5, -H + d, WHITE);
      } else if (t < 0.09) {
        for (const r of rays) ray(p, 0, -H, r.a, r.L * 1.2, r.w * 0.55, C, 0.12);
        diamond(p, 0, -H, 3, C);
      } else if (t < 0.14) {
        ray(p, 0, -H, rays[0].a, rays[0].L * 1.3, 0.6, [C[0], C[1], C[2], C[3], C[3], C[4]], 0.4);
      }
      if (pop > 0.02) {
        p.glow(0, -H, 20, C[4], 0.34 * pop);
        p.glow(0, -H, 6, WHITE, 0.18 * pop);
      }
      p.glow(0, 0, RING.r0 + 8, C[3], 0.18 * Math.max(0, 1 - t / 0.28));
    },
  };
}
