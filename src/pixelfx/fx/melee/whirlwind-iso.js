// Whirlwind, rewritten for the game's 2:1 isometric camera. The source spun a tilted crescent round the waist on a
// screen-space plane; this one puts the ring where it belongs in the world — level, at waist/chest height, seen by
// the camera as a true 2:1 ellipse in the air. The blade goes once round: the far half runs behind the hero and is
// dimmed, the near half comes back in front of him bright. As it closes the ring flares white, swells, thins and
// breaks into a dotted trace; sparks are thrown all round in three dimensions and land on the floor at their own
// depth, while a ring of dust lifts off the 2:1 floor and the ground takes the spin's light.
import { Rng, fit, clamp, smooth, ease, rand, TAU, WHITE, sparkle } from "../../core/index.js";
import { FLOOR, bandFloor, ringNoise } from "../_iso.js";
import { swing, onSwing, smear, trace, glowAlong, travel } from "./_lib.js";

export const meta = {
  name: "Whirlwind (iso)",
  desc: "A 2:1 ring in the air whirls once at waist height: far half dim behind the hero, near half bright in front, then it flares white, breaks into dots, throws sparks and lifts dust.",
  tags: ["melee", "slash", "spin", "sword", "aoe", "combat", "directional", "one-shot", "iso", "top-down", "ground"],
  size: [200, 180],
  origin: [100, 150],
  duration: 0.75,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  actor: 2,
  options: {
    palette: ["#16224a", "#1f4a86", "#2a7fc0", "#48b8ec", "#9fe2ff", "#e2f7ff", "#ffffff"],
    sparks: ["#fff3a6", "#ffe26b", "#ff8a2a", "#f2561d"],
    aim: 0,
    seed: 3,
  },
};

const HIGH = 18;     // waist/chest height of the ring, px above the floor
const RING = 23;     // how wide it whirls
const SW = 0.17;     // the edge goes once round
const FLARE = 0.3;   // the closed ring flares and dissolves
const turn = (t) => 1 - Math.pow(1 - clamp(t / SW), 1.6);           // fraction of the turn the edge has made
const passedAt = (f) => SW * (1 - Math.pow(1 - clamp(f), 1 / 1.6));  // when the edge passed fraction f

export function create(o) {
  const C = fit(o.palette, 7), S = fit(o.sparks, 4), Rg = new Rng(o.seed ?? 3), aim = o.aim ?? 0;
  const n = C.length, FL = FLOOR;
  // level ring at waist height, seen at 2:1: its far half is the upper half of the ellipse
  const A = swing({ cx: 0, cy: -HIGH, R: RING, sy: FL, rot: 0, a0: 0.55 + aim, dir: -1, k: 0 });
  const E = { ...A, R: RING * 0.82 };             // a thinner echo a beat behind
  const W = 10.5, WE = 4.4;
  const DIM = [C[0], C[0], C[1], C[2], C[3], C[4], C[5]];   // the far half sits deeper in the ramp

  // the smear: thickest just behind the edge, thinning and cooling where the edge passed longer ago
  const body = (p, s, w0, lag, half, rim) => {
    const U = TAU * turn(t - lag), ramp = half < 0 ? DIM : C;
    if (U < 0.02 || t - lag > SW + 0.02) return;
    smear(p, s, 0, U, w0, (u, r, out) => {
      const age = t - lag - passedAt(u / TAU), lead = U - u;
      const w = w0 * Math.pow(clamp(lead / 0.85), 0.5) * (0.3 + 0.7 * Math.exp(-age / 0.075)) * Math.pow(clamp(u / 1.3), 0.7);
      if (w < 0.4) return;
      const q = (s.R - r) / w;
      if (q < 0 || q > 1) return;
      const ci = rim && q < 0.3 && age < 0.09 ? 0 : Math.round(q * (n - 1) * 0.7 + age * 13 + (rim ? 0.4 : 1.4));
      // the far half never gets the white rim: it is behind the hero, so it only catches the light
      out.c = ramp[n - 1 - clamp(half < 0 ? Math.max(ci, 2) : ci, 0, n - 1)];
      out.a = (half < 0 ? 0.6 : 1) * Math.min(1, u / 1.1 + 0.2);
    }, half);
  };

  // sparks: thrown off the edge as it goes round, falling to the floor at their own depth
  const sparks = [];
  for (let i = 0; i < 26; i++) {
    const u = ((i + Rg.range(0, 1)) / 26) * TAU, a = A.a0 + A.dir * u;
    const out = Rg.range(12, 38), tan = Rg.range(-16, 16), vh = Rg.range(20, 85), g = Rg.range(620, 800);
    const h0 = HIGH + Rg.range(-2, 2), x0 = Math.cos(a) * RING, z0 = Math.sin(a) * RING;
    const vx = Math.cos(a) * out - Math.sin(a) * tan, vz = Math.sin(a) * out + Math.cos(a) * tan;
    const tl = (vh + Math.sqrt(vh * vh + 2 * g * h0)) / g, vhl = vh - g * tl;
    sparks.push({
      x0, z0, h0, vx, vz, vh, g, tl, lx: x0 + vx * tl, lz: z0 + vz * tl,
      hop: Math.max(0, -vhl * 0.3), tb: passedAt(u / TAU) + Rg.range(0, 0.015),
      life: Math.min(tl + Rg.range(0.14, 0.24), 0.62), big: false, chip: i % 3 === 0,
    });
  }
  // the burst where the ring closes
  for (let i = 0; i < 9; i++) {
    const a = A.a0 + Rg.range(-0.55, 0.55), out = Rg.range(30, 70), vh = Rg.range(30, 95), g = Rg.range(640, 800);
    const h0 = HIGH + Rg.range(-1, 2), x0 = Math.cos(a) * RING, z0 = Math.sin(a) * RING;
    const vx = Math.cos(a) * out, vz = Math.sin(a) * out;
    const tl = (vh + Math.sqrt(vh * vh + 2 * g * h0)) / g, vhl = vh - g * tl;
    sparks.push({
      x0, z0, h0, vx, vz, vh, g, tl, lx: x0 + vx * tl, lz: z0 + vz * tl,
      hop: Math.max(0, -vhl * 0.3), tb: SW + Rg.range(0, 0.03),
      life: Math.min(tl + Rg.range(0.14, 0.24), 0.66), big: true,
    });
  }
  // twinkles left hanging where the ring broke up
  const twinkles = [];
  for (let i = 0; i < 7; i++) {
    const a = Rg.range(0, TAU), r = RING + Rg.range(-2, 3);
    twinkles.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, h: HIGH + Rg.range(-2, 2), t0: SW + Rg.range(0.02, 0.14), life: Rg.range(0.18, 0.34), c: Rg.chance(0.5) ? C[5] : WHITE });
  }
  // the dust ring lifted off the 2:1 floor, and the grit it takes with it
  const dust = [], grit = [];
  for (let i = 0; i < 22; i++) {
    const a = Rg.range(0, TAU), d = Rg.range(15, 30);
    dust.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, t0: Rg.range(0.02, 0.2), life: Rg.range(0.28, 0.48), r: Rg.range(1.1, 2.6), rise: Rg.range(2, 7) });
  }
  for (let i = 0; i < 20; i++) {
    const a = Rg.range(0, TAU), d = Rg.range(13, 27);
    grit.push({ x: Math.cos(a) * d, y: Math.sin(a) * d * FL, t0: Rg.range(0.03, 0.22), k: Rg.range(0.12, 0.3), c: C[Rg.int(2, 4)] });
  }

  let t = 0, backT = -1e9;

  // the ring: the swept smear on each half, and once it closes, the white flare dissolving into dots
  const ring = (p, half) => {
    body(p, E, WE, 0.025, half, false);
    body(p, A, W, 0, half, true);
    if (t < SW + 0.04) {
      glowAlong(p, A, A.R - 4, 0, TAU * turn(t), 8, C[3], (u) => (half < 0 ? 0.14 : 0.24) * Math.exp(-(t - passedAt(u / TAU)) / 0.08), half);
    }
    if (t < SW) return;
    const f = (t - SW) / FLARE, ramp = half < 0 ? DIM : C;
    if (f < 1) {
      const R = A.R + 5 * ease.outCubic(f), th = f < 0.13 ? 4.5 : Math.max(1, 4 * Math.pow(1 - f, 1.5) + 0.5);
      const st = { ...A, R }, step = f < 0.13 ? 6 : f < 0.3 ? 5 : f < 0.55 ? 4 : 3;
      smear(p, st, 0, TAU, th, (u, r, out) => {
        const q = (R - r) / th;
        if (q < 0 || q > 1) return;
        out.c = f < 0.13 ? (half < 0 ? ramp[4] : q < 0.6 ? WHITE : ramp[5]) : q < 0.45 ? ramp[step] : ramp[step - 1];
        out.a = (half < 0 ? 0.58 : 1) * (f < 0.4 ? 1 : 1.3 - f);
      }, half);
      glowAlong(p, st, R - 1.5, 0, TAU, 8, C[4], (half < 0 ? 0.2 : 0.28) * (1 - f) * (1 - f), half);
      // the closed ring itself, drawn crisp and white for a beat, then gone
      if (f < 0.45) {
        const a2 = (1 - f / 0.45) * (half < 0 ? 0.4 : 1), st2 = { ...A, R };
        for (let u = 0; u < TAU - 0.04; u += f < 0.16 ? 0.05 : 0.085) {
          if ((half < 0) !== (Math.sin(A.a0 + A.dir * u) < 0)) continue;
          const [x, y] = onSwing(st2, R, u);
          p.dot(x, y, f < 0.16 ? WHITE : half < 0 ? C[4] : C[5], a2);
        }
      }
    }
    // the dotted trace of the blade's path lingers, then goes
    const k = 1 - clamp((t - SW - 0.06) / 0.42);
    if (k > 0) {
      trace(p, A, A.R - 0.4, 0, TAU, ramp[4], (u) => clamp(k * 1.5 - rand(Math.floor(u * 30), 5) * 0.85) * 0.95, half);
    }
  };

  // a spark in flight: head, streak, a little light; then it lands, hops once and lies there cooling
  function flier(p, q, back) {
    const age = t - q.tb;
    if (age < 0 || age > q.life) return;
    const air = Math.min(age, q.tl), h = q.h0 + q.vh * air - 0.5 * q.g * air * air;
    const x = q.x0 + q.vx * air, z = q.z0 + q.vz * air, sy = z * FL - h;
    if (back !== z < 0) return;
    const u = age / q.life, hc = q.chip ? C[4] : WHITE, sc = q.chip ? C[3] : S[0], sc2 = q.chip ? C[3] : S[2], gl = q.chip ? C[3] : S[1];
    if (age < q.tl) {
      const vy = q.vz * FL - (q.vh - q.g * air), l = Math.hypot(q.vx, vy) || 1;
      const len = Math.min(q.big ? 7 : 5, 1 + l * 0.02) * (q.chip ? 0.6 : 1);
      p.px(x, sy, u < 0.15 ? WHITE : u < 0.55 ? sc : sc2);
      p.dot(x - (q.vx / l) * len, sy - (vy / l) * len, sc2, 0.6 * (1 - u * 0.8));
      if (u < 0.5) p.glow(x, sy, q.big ? 4 : 3, gl, (q.big ? 0.36 : 0.3) * (1 - 2 * u));
      return;
    }
    const age2 = age - q.tl, h2 = q.hop * age2 - 0.5 * q.g * age2 * age2;
    if (h2 > 0) p.px(q.lx, q.lz * FL - h2, u < 0.6 ? sc : S[3]);
    else p.dot(q.lx, q.lz * FL, sc2, 0.45 * (1 - u));
  }

  function puff(p, q) {
    const age = t - q.t0;
    if (age < 0 || age > q.life) return;
    const u = age / q.life, h = q.rise * age;
    p.disc(q.x, q.z * FL - h, q.r + age * 7, C[4], 0.24 * (1 - u) * (1 - u));
  }

  // behind the hero: the far half of the ring, the floor marks, and everything falling behind him
  function behind(p) {
    ring(p, -1);
    const f = 1 - smooth(0.3, 0.6, t);
    if (t > 0.02 && f > 0) {
      bandFloor(p, 0, 0, 19, 7, 0.16 * f, C);                 // the dust ring on the 2:1 floor
      bandFloor(p, 0, 0, 28, 3, 0.09 * f, C);
      for (let i = 0; i < 44; i++) {                          // its dotted, uneven edge
        const a = (i / 44) * TAU, rr = 20 + 4 * ringNoise(a * 2, 1.5, 7);
        p.dot(Math.cos(a) * rr, Math.sin(a) * rr * FL, C[4], 0.16 * f * (0.45 + 0.55 * ringNoise(a * 3, 2, 11)));
      }
      for (const q of grit) if (t >= q.t0) p.dot(q.x, q.y, q.c, q.k * f);
    }
    if (t > 0.03 && t < 0.55) p.glow(0, 4, 17, C[3], 0.16 * (1 - t / 0.55));
    for (const q of dust) if (q.z < 0) puff(p, q);
    for (const q of sparks) flier(p, q, true);
  }

  return {
    update(dt) { t += dt; },
    drawBack(p) { behind(p); backT = t; },
    draw(p) {
      if (backT !== t) behind(p);
      backT = -1e9;
      ring(p, 1);
      for (const q of twinkles) {
        const age = t - q.t0;
        if (age < 0 || age > q.life) continue;
        const k = 1 - age / q.life, arm = 5 * Math.min(1, age / 0.06);
        if (q.z >= 0) sparkle(p, q.x, q.z * FL - q.h, arm * k, q.c, C[3], 0.55 * k);
      }
      for (const q of dust) if (q.z >= 0) puff(p, q);
      for (const q of sparks) flier(p, q, false);
    },
  };
}
