// Uppercut, rewritten for the game's 2:1 isometric camera: melee/uppercut in the world the game sees, not the side
// view's picture squashed onto the floor.
//
// The recipe is the source's: dust is kicked off the floor, a hot thin crescent rises from hip height up past the
// hero's head, its white tip marks the hit, sparks and twinkles fly, and it is gone inside half a second. Same
// palette, same beats.
// What the camera changes:
//   - the crescent is a real arc in the air, standing up the screen at its true height and turned to the hero's
//     facing: the floor angle leans and mirrors it, and when he faces the camera it sits low over the body instead of
//     edge on;
//   - the hit at the tip is light, not ink: a white-hot star thin enough to composite additively over the hero, a
//     ring that breaks into dots, slivers and sparks, with no opaque comic fill;
//   - the floor is the game's 2:1 floor: the dust rises off it at the aim's own depth, grit hops in 3-D and lands
//     where it was kicked from.
// 1 px = 1 character sprite px. aim is a floor angle: 0 = screen right, PI/2 = down the screen toward the viewer.
import { Rng, fit, clamp, smooth, ease, TAU, WHITE, hex, sparkle } from "../../core/index.js";
import { FLOOR, bandFloor } from "../_iso.js";
import { swing, slash, slashEnd, onSwing, sliver } from "./_lib.js";

export const meta = {
  name: "Uppercut (iso)",
  desc: "An uppercut in 2:1 iso: a hot thin crescent rises from hip past the head, white tip, a short after-trail, sparks and a white-hot burst, with floor dust kicked up at the start.",
  tags: ["melee", "uppercut", "punch", "rise", "combo", "combat", "directional", "one-shot", "iso", "top-down", "ground"],
  size: [200, 180],
  origin: [100, 150],
  duration: 0.56,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  actor: 2,
  options: {
    palette: ["#3a1408", "#7a2a10", "#c4501a", "#f08a2a", "#ffc94a", "#fff2a8", "#ffffff"],
    aim: 0,
    seed: 11,
  },
};

const D = meta.duration, FL = FLOOR, G = 500;
const DUST = hex("#7a7088");

/** An offcut thrown in the game's 3-D: drag on the floor, one small bounce, then rest at its own depth. */
function toss(u, v, h, vu, vv, vh, drag = 1.7) {
  const disc = vh * vh + 2 * G * h, t1 = (vh + Math.sqrt(disc)) / G, vDown = Math.sqrt(disc);
  const vUp = vDown * 0.28, t2 = (2 * vUp) / G;
  return { u, v, h, vu, vv, vh, drag, t1, vUp, t2, end: t1 + t2 };
}
function tossAt(b, age) {
  const t = Math.min(age, b.end), e = Math.exp(-b.drag * t), d = (1 - e) / b.drag;
  const u = b.u + b.vu * d, v = b.v + b.vv * d;
  let h;
  if (t < b.t1) h = b.h + b.vh * t - 0.5 * G * t * t;
  else {
    const tb = t - b.t1;
    h = tb < b.t2 ? b.vUp * tb - 0.5 * G * tb * tb : 0;
  }
  return [u, v, h];
}

export function create(o) {
  const C = fit(o.palette, 7), n = C.length, R = new Rng(o.seed ?? 11), aim = o.aim ?? 0;
  const ca = Math.cos(aim), sa = Math.sin(aim);
  const P = (u, v, h) => [u * ca - v * sa, (u * sa + v * ca) * FL - h];

  // ---- the crescent: an arc in the vertical plane that faces the camera (so it rises at true height), mirrored
  // when he faces left, leaned a little toward the facing and pushed down a touch when he faces the camera ----
  const mir = ca < 0 ? -1 : 1;
  const A = swing({
    cx: mir * 6 + ca * 3, cy: -27 + sa * FL * 2, R: 17, sy: 1, rot: 0,
    a0: mir > 0 ? 0.75 : Math.PI - 0.75, dir: mir > 0 ? -1 : 1, k: 0,
    span: 2.1, W: 5.5, t0: 0.02, sweep: 0.06, hold: 0.045, trail: 0.18, ramp: C,
  });
  const HIT = A.t0 + A.sweep * 0.85;                 // the fist arrives at the top
  const tip = slashEnd(A);
  const [GX, GY] = P(6, 0, 0);                       // the floor the punch was launched from
  const [AX, AY] = P(8, 0, 0);                       // a scuff a little further out

  // ---- the floor: dust kicked up at the start, grit hopping in 3-D, a faint scuff and the light of the strike ----
  const PUFFS = [];
  for (let i = 0; i < 10; i++) {
    const [x, y] = P(3 + R.range(0, 8), R.range(-4, 4), 0);
    PUFFS.push({ x, y, t0: R.range(0, 0.035), life: R.range(0.26, 0.44), r: R.range(2, 3.4), rise: R.range(8, 18), drift: R.range(-6, 6) });
  }
  const GRIT = [];
  for (let i = 0; i < 3; i++) {
    const [u, v] = [R.range(2, 8), R.range(-3, 3)];
    const b = toss(u, v, 0, R.range(-10, 24), R.sign() * R.range(6, 26), R.range(24, 58), 2);
    b.t0 = R.range(0.005, 0.03);
    b.life = Math.min(b.t0 + b.end + 0.12, D - 0.06);
    GRIT.push(b);
  }
  const SCUFF = [];
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 2; j++) {
      const [x, y] = P(R.range(2, 11), R.range(-3.5, 3.5), 0);
      SCUFF.push({ x: x + R.range(-1.5, 1.5), y: y + R.range(-0.8, 0.8), k: R.range(0.08, 0.2), c: R.pick([C[1], C[2], C[2]]) });
    }

  // ---- the hit: a white-hot star at the tip, a ring that breaks into dots, slivers, twinkles, sparks ----
  const RING = [];
  for (let i = 0; i < 18; i++) RING.push({ a: (i / 18) * TAU + R.range(-0.05, 0.05), g: R.range(0.4, 1) });
  const SPARKS = [];
  for (let i = 0; i < 11; i++) {
    const a = R.range(-Math.PI * 0.85, -Math.PI * 0.15), sp = R.range(70, 190);
    SPARKS.push({ x: tip.x, y: tip.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t0: HIT + R.range(0, 0.03), life: R.range(0.14, 0.3) });
  }
  const SLIVERS = [0, 1, 2, 3].map(() => ({ a: R.range(-Math.PI, 0), r: R.range(3, 6), v: R.range(80, 140), arc: R.range(0.35, 0.7) }));
  const TWINKLES = [0, 1, 2].map(() => ({ a: R.range(-Math.PI * 0.9, -Math.PI * 0.1), r: R.range(4, 7), t0: R.range(0.02, 0.11), life: R.range(0.12, 0.18) }));
  const MINTS = [];
  for (let i = 0; i < 3; i++) {
    const b = toss(8 + R.range(-2, 2), R.range(-1.5, 1.5), 42 + R.range(-3, 2), R.range(-14, 16), R.range(-16, 16), R.range(20, 55), 1.8);
    b.t0 = HIT + R.range(0, 0.02);
    b.life = Math.min(b.t0 + b.end + 0.12, D - 0.06);
    b.c = R.pick([C[4], C[5]]);
    MINTS.push(b);
  }

  let T = 0;

  const floorDraw = (p, t, fade) => {
    for (const q of PUFFS) {
      const age = t - q.t0;
      if (age < 0 || age > q.life) continue;
      const k = age / q.life;
      p.disc(q.x + q.drift * k, q.y - q.rise * ease.outCubic(k), q.r + age * 8, DUST, 0.4 * (1 - k) * (1 - k));
    }
    for (const b of GRIT) {
      const age = t - b.t0;
      if (age < 0 || age > b.life - b.t0) continue;
      const [u, v, h] = tossAt(b, age), [x, y] = P(u, v, h);
      const k = clamp(1 - age / (b.life - b.t0));
      if (h > 0.4) p.px(x, y, age < 0.04 ? WHITE : age < 0.12 ? C[5] : C[3]);
      else p.dot(x, y, C[2], 0.7 * k * fade);
    }
    for (const q of SCUFF) p.dot(q.x, q.y, q.c, q.k * fade);
    if (t < 0.46) {
      p.glow(GX, GY, 13, C[2], 0.12 * (1 - smooth(0.06, 0.46, t)) * fade);
      p.glow(AX, AY, 9, C[2], 0.09 * (1 - smooth(0.1, 0.4, t)) * fade);
    }
  };

  // a crisp white leading edge riding the outer rim of the rise
  const rim = (p, t) => {
    const u0 = t - A.t0;
    if (u0 < 0) return;
    const head = ease.outExpo(clamp(u0 / A.sweep)) * A.span;
    const tail = smooth(A.sweep + A.hold, A.sweep + A.hold + A.trail, u0) * A.span;
    if (head - tail < 0.02) return;
    const fade = 1 - smooth(A.sweep + A.hold + A.trail * 0.5, A.sweep + A.hold + A.trail + 0.06, u0);
    if (fade <= 0) return;
    const steps = Math.max(7, Math.ceil((head - tail) * 10));
    for (let i = 0; i <= steps; i++) {
      const uu = tail + ((head - tail) * i) / steps, v = i / steps;
      const [x, y] = onSwing(A, A.R - 0.45, uu);
      if (y > -0.5) continue;
      if (v > 0.86) p.px(x, y, WHITE);
      else if (v > 0.4) p.px(x, y, C[6]);
      else p.dot(x, y, C[5], 0.5 * v * fade);
    }
  };

  // the hit: white tip, then a light-only burst at the apex
  const hitDraw = (p, t, fade) => {
    const q = t - HIT;
    // the fist's white tip, growing as the edge arrives
    const g = t - (HIT - 0.02);
    if (g > 0) {
      const k = (1 - smooth(0.06, 0.14, t)) * 0.26;
      if (k > 0) sparkle(p, tip.x, tip.y, 1 + ease.outBack(clamp(g / 0.03)), C[6], WHITE, k * fade);
    }
    if (q < 0) return;
    // a thin ring that breaks into dots
    const k = q / 0.2;
    if (k < 1) {
      for (const r of RING) {
        if (k > 0.35 + r.g * 0.5) continue;
        const rr = 2 + 8 * ease.outCubic(k) * r.g;
        const c = k < 0.25 ? WHITE : C[6];
        p.dot(tip.x + Math.cos(r.a) * rr, tip.y + Math.sin(r.a) * rr, c, 0.42 * (1 - k) * fade);
      }
      p.glow(tip.x, tip.y, 14, C[4], 0.16 * (1 - k) * fade);
    }
    // the white-hot mark the blow leaves, cooling into a speck of light
    const m = 1 - smooth(0.04, 0.24, q);
    if (m > 0) {
      const hot = 1 - smooth(0.015, 0.14, q);
      const arm = 2 + Math.round(2 * hot);
      p.px(tip.x, tip.y, WHITE);
      for (let d = 1; d <= arm; d++) {
        const c = d > arm * 0.6 ? C[5] : C[6];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.px(tip.x + dx * d, tip.y + dy * d, c);
      }
      if (hot > 0.1) p.glow(tip.x, tip.y, 4 + 4 * hot, hot > 0.4 ? WHITE : C[5], 0.3 * hot * m * fade);
    }
    if (q >= 0.03 && q < 0.17) {
      const e = (q - 0.03) / 0.14;
      for (const s of SLIVERS) sliver(p, tip.x, tip.y, s.a, s.r + s.v * (q - 0.03), s.arc * (1 - 0.4 * e), e < 0.45 ? C[6] : C[5], 1 - e);
    }
    for (const w of TWINKLES) {
      const a = q - w.t0;
      if (a <= 0 || a >= w.life) continue;
      sparkle(p, tip.x + Math.cos(w.a) * w.r, tip.y + Math.sin(w.a) * w.r, 2, C[5], WHITE, 0.25 * Math.sin((a / w.life) * Math.PI) * fade);
    }
    for (const s of SPARKS) {
      const age = t - s.t0;
      if (age < 0 || age >= s.life) continue;
      const x = s.x + s.vx * age, y = s.y + s.vy * age + 0.5 * 400 * age * age;
      if (y > -0.5) continue;
      const kk = 1 - age / s.life, sp = Math.hypot(s.vx, s.vy + 400 * age) || 1, len = Math.min(6, 1.6 + sp * 0.018);
      p.line(x - (s.vx / sp) * len, y - ((s.vy + 400 * age) / sp) * len, x, y, kk > 0.55 ? C[6] : C[4], 0.9 * kk * fade);
      if (kk > 0.5) p.glow(x, y, 3, C[4], 0.1 * kk * fade);
    }
    for (const b of MINTS) {
      const age = t - b.t0;
      if (age < 0 || age > b.life - b.t0) continue;
      const [u, v, h] = tossAt(b, age), [x, y] = P(u, v, h);
      const kk = clamp(1 - age / (b.life - b.t0));
      if (h > 0.4) {
        p.px(x, y, age < 0.05 ? WHITE : age < 0.15 ? C[5] : b.c);
        if (age < 0.1) p.glow(x, y, 3, C[4], 0.12 * kk * fade);
      } else p.dot(x, y, C[2], 0.6 * kk * fade);
    }
  };

  return {
    update(dt) { T += dt; },
    draw(p, tt) {
      const t = tt ?? T;
      const fade = 1 - smooth(0.48, 0.54, t);
      if (fade <= 0) return;
      floorDraw(p, t, fade);
      slash(p, A, t);
      rim(p, t);
      hitDraw(p, t, fade);
    },
  };
}
