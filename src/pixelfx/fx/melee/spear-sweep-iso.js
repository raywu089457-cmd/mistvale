// Spear sweep, rewritten for the game's 2:1 isometric camera (docs/AUTHORING.md, "The game's camera").
//
// The side-view sweep cut a flat crescent at shin height in the screen plane. On the 2:1 floor the sweep is a real
// horizontal circle at waist height round the hero: the shaft whips through 150 degrees in front of him, the tip
// dragging a thin bright arc behind it, a glint running out along the shaft, and the wind of it shaving a line of
// dust off the floor along the same arc. What the camera changes:
//   - the arc is a level circle in the world, projected with the 2:1 squash (sy = FLOOR) and centred on the aim, so
//     sideways it opens out across the screen, into the screen it foreshortens and dips low in front of the feet;
//   - the shaft is a straight level line from the hands to the tip, so it reads as a long horizontal pole in every
//     aim, and the sweep is the fan between the two ends of it;
//   - the floor takes the dust line along the projected arc, and every mark that lies behind the hero is split off by
//     depth like the rest of the library's iso rewrites.
// 1 px = 1 character sprite px. aim is a floor angle: 0 = screen right, PI/2 = down the screen toward the viewer.
import { Rng, fit, clamp, smooth, ease, TAU, WHITE, sparkle, hex } from "../../core/index.js";
import { FLOOR, bandFloor, ringNoise } from "../_iso.js";
import { swing, onSwing, trace, glowAlong, stone } from "./_lib.js";

export const meta = {
  name: "Spear sweep (iso)",
  desc: "A spear sweep on the 2:1 floor: a thin bright shaft whips 150 degrees at waist height, a glint riding it, shaving a dust line off the floor with sparks and shavings.",
  tags: ["melee", "spear", "sweep", "polearm", "aoe", "ground", "dust", "combat", "directional", "one-shot", "iso", "top-down"],
  size: [200, 180],
  origin: [100, 150],
  duration: 0.62,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: {
    palette: ["#0f2a2a", "#18504a", "#22806e", "#3fb894", "#8fe6c0", "#dcfff0", "#ffffff"],
    aim: 0,
    seed: 10,
  },
};

const D = meta.duration, FL = FLOOR, G = 640;
const HIP = 20;                                  // the sweep is at waist height
const RT = 38;                                   // the tip's reach: the whole sweep stays at or above the feet line
const SPAN = (150 * Math.PI) / 180, HALF = SPAN / 2;
const T0 = 0.02, SWEEP = 0.2, HOLD = 0.04, TRAIL = 0.11;
const LIFE = SWEEP + HOLD + TRAIL;               // the tip's trail is gone by T0 + LIFE + 0.18

export function create(o) {
  const C = fit(o.palette, 7), R = new Rng(o.seed ?? 10), aim = o.aim ?? 0;
  const ax = Math.cos(aim), az = Math.sin(aim);
  // the 2:1 camera's projection: (forward, across, height) in the hero's frame -> screen
  const P = (u, v, h) => [u * ax - v * az, (u * az + v * ax) * FL - h];
  const dep = (u, v) => u * az + v * ax;         // negative is behind the hero
  const ST = stone(hex("#4a3f69"));

  // the tip's level circle at waist height, in screen space (sy = FLOOR squashes it 2:1), centred on the aim
  const A = swing({ cx: 0, cy: -HIP, R: RT, sy: FL, a0: aim - HALF, dir: 1, span: SPAN });
  // the same arc shaved off the floor
  const AF = swing({ cx: 0, cy: 0, R: RT * 0.98, sy: FL, a0: aim - HALF, dir: 1, span: SPAN });
  // where the sweep comes to rest, and its floor shadow
  const [EX, EY] = onSwing(A, RT, SPAN);
  const EZ = RT * Math.sin(aim + HALF);

  // the head winds up and whips through the middle over SWEEP, so the pole is seen crossing the horizontal
  const head = (t) => SPAN * ease.inOutSine(clamp((t - T0) / SWEEP));
  // when the tip passes the sweep fraction hf (inOutSine inverts: u = SWEEP * acos(1 - 2 hf) / PI)
  const when = (hf) => T0 + (SWEEP * Math.acos(1 - 2 * clamp(hf, 0, 0.98))) / Math.PI;

  // a shaving / a chip of grit: thrown in 3-D, drag on the floor, one small bounce, then rest
  function toss(u, v, h, vu, vv, vh, drag = 2.4) {
    const disc = vh * vh + 2 * G * h, t1 = (vh + Math.sqrt(disc)) / G, vDown = Math.sqrt(disc);
    const vUp = vDown * 0.3, t2 = (2 * vUp) / G;
    return { u, v, h, vu, vv, vh, drag, t1, vUp, t2, end: t1 + t2 };
  }
  function tossAt(b, age) {
    const tt = Math.min(age, b.end), e = Math.exp(-b.drag * tt), d = 1 - e;
    const u = b.u + (b.vu * d) / b.drag, v = b.v + (b.vv * d) / b.drag;
    let h;
    if (tt < b.t1) h = b.h + b.vh * tt - 0.5 * G * tt * tt;
    else {
      const tb = tt - b.t1;
      h = tb < b.t2 ? b.vUp * tb - 0.5 * G * tb * tb : 0;
    }
    return [u, v, h];
  }
  function puffAt(d, age) {
    const tt = Math.min(age, d.life), e = Math.exp(-2.4 * tt), dist = (d.sp * (1 - e)) / 2.4;
    return [d.u + d.du * dist, d.v + d.dv * dist * 0.7, d.h + (d.rise * (1 - Math.exp(-1.2 * tt))) / 1.2 + 0.5 * tt];
  }

  // ---- the dust line shaved off the floor along the arc ----
  const DUST = [];
  for (let i = 0; i < 16; i++) {
    const hf = R.range(0.04, 0.99), g = -HALF + SPAN * hf, rr = RT * R.range(0.9, 1.03), tang = g + Math.PI / 2;
    const t0 = when(hf) + 0.004;
    DUST.push({
      u: Math.cos(g) * rr, v: Math.sin(g) * rr, h: R.range(0.2, 0.9),
      du: Math.cos(g) * R.range(0.3, 0.7) + Math.cos(tang) * R.range(-0.3, 0.45),
      dv: Math.sin(g) * R.range(0.3, 0.7) + Math.sin(tang) * R.range(-0.3, 0.45),
      sp: R.range(14, 34), rise: R.range(0.5, 2.2), r0: R.range(1.4, 2.4), r1: R.range(2.6, 5),
      t0, life: Math.min(R.range(0.3, 0.46), D - 0.03 - t0), a: R.range(0.07, 0.11),
      c: R.pick([ST.dust, ST.body, C[2]]),
    });
  }
  // the wake piles up and rolls on past the tip
  const WAKE = [];
  for (let i = 0; i < 5; i++) {
    const g = HALF - R.range(0, 0.18), rr = RT * R.range(0.92, 1.06), tang = g + Math.PI / 2;
    const t0 = T0 + SWEEP + R.range(0, 0.03);
    WAKE.push({
      u: Math.cos(g) * rr, v: Math.sin(g) * rr, h: R.range(0.3, 0.7),
      du: Math.cos(g) * 0.5 + Math.cos(tang) * 0.6, dv: Math.sin(g) * 0.5 + Math.sin(tang) * 0.6,
      sp: R.range(24, 54), rise: R.range(1.2, 3), r0: R.range(2, 3.2), r1: R.range(5, 8),
      t0, life: Math.min(R.range(0.3, 0.42), D - 0.03 - t0), a: R.range(0.09, 0.14),
      c: R.pick([ST.dust, ST.body, ST.light]),
    });
  }

  // ---- sparks thrown off the tip as it passes ----
  const SPARK = [];
  for (let i = 0; i < 9; i++) {
    const hf = R.range(0.15, 0.99), a = aim - HALF + SPAN * hf;
    const [x, y] = onSwing(A, RT, SPAN * hf);
    const b = a + R.range(-1.1, 1.1), sp = R.range(45, 120);
    SPARK.push({
      t0: when(hf) + 0.006, life: R.range(0.1, 0.18), x, y, z: RT * Math.sin(a),
      vx: Math.cos(b) * sp, vy: Math.sin(b) * sp - R.range(0, 20),
      c: R.pick([WHITE, C[6], C[5]]),
    });
  }
  const TIP = [];
  for (let i = 0; i < 8; i++) {
    const b = aim + HALF + R.range(-0.7, 0.7), sp = R.range(70, 150);
    TIP.push({
      t0: T0 + SWEEP * 0.9 + R.range(0, 0.02), life: R.range(0.1, 0.22), x: EX, y: EY, z: EZ,
      vx: Math.cos(b) * sp, vy: Math.sin(b) * sp - R.range(10, 40),
      c: R.pick([WHITE, C[6], C[5]]),
    });
  }

  // ---- grit and shavings off the edge ----
  const GRIT = [];
  for (let i = 0; i < 9; i++) {
    const hf = R.range(0.2, 1), g = -HALF + SPAN * hf, tang = g + Math.PI / 2 + R.range(-0.5, 0.5), sp = R.range(18, 40);
    const q = toss(
      Math.cos(g) * RT * R.range(0.94, 1.02), Math.sin(g) * RT * R.range(0.94, 1.02), 0.4,
      Math.cos(tang) * sp + Math.cos(g) * sp * 0.5, Math.sin(tang) * sp + Math.sin(g) * sp * 0.5, R.range(16, 50)
    );
    q.t0 = when(hf) + 0.008;
    q.c = R.pick([ST.body, ST.dust, C[3]]);
    q.life = Math.min(q.end + 0.1, D - 0.03 - q.t0);
    GRIT.push(q);
  }
  const SHV = [];
  for (let i = 0; i < 5; i++) {
    const hf = R.range(0.25, 1), g = -HALF + SPAN * hf, tang = g + R.range(-0.8, 0.8), sp = R.range(20, 42);
    const q = toss(
      Math.cos(g) * RT, Math.sin(g) * RT, HIP,
      Math.cos(tang) * sp, Math.sin(tang) * sp, R.range(20, 50)
    );
    q.t0 = when(hf) + 0.004;
    q.c = R.pick([C[6], C[5], C[4]]);
    q.life = Math.min(q.end + 0.1, D - 0.03 - q.t0);
    SHV.push(q);
  }

  let T = 0, backT = -1e9;

  // the arc the tip drags: a thin line that whips out ahead of the shaft and cools behind it
  function trail(p, t, half) {
    const u = t - T0;
    if (u < 0 || u > LIFE + 0.2) return;
    const fade = 1 - smooth(LIFE, LIFE + 0.16, u);
    if (fade <= 0) return;
    const U = head(t), T = SPAN * smooth(SWEEP + HOLD, LIFE, u);
    if (U - T < 0.012) return;
    trace(p, A, RT, T, U,
      (v) => (v > U - 0.14 ? WHITE : v > U - 0.42 ? C[6] : v > U - 0.95 ? C[5] : C[4]),
      (v) => fade * (0.24 + 0.66 * clamp((v - T) / Math.max(0.02, U - T))), half, 0.34);
    glowAlong(p, A, RT, Math.max(T, U - 1.1), U, 5, C[5],
      (v) => 0.18 * fade * clamp((v - T) / Math.max(0.02, U - T)), half, 0.3);
  }
  // the shaft: a straight level line from the hands to the tip, hot along its length
  function shaft(p, t, half) {
    const u = t - T0;
    if (u < 0 || u > LIFE + 0.06) return;
    const U = head(t), a = aim - HALF + U, sg = Math.sin(a) < 0 ? -1 : 1;
    if (half !== sg) return;
    const fade = 1 - smooth(LIFE - 0.02, LIFE + 0.06, u);
    if (fade <= 0) return;
    const [x0, y0] = onSwing(A, 4, U), [x1, y1] = onSwing(A, RT, U);
    // a two-pixel pole with a dark under-rim, hot toward the head
    p.line(x0, y0 + 2, x1, y1 + 2, C[1], 0.5 * fade);
    p.line(x0, y0 + 1, x1, y1 + 1, (v) => (v > 0.5 ? C[4] : C[3]), 0.9 * fade);
    p.line(x0, y0, x1, y1, (v) => (v > 0.9 ? WHITE : v > 0.66 ? C[6] : v > 0.4 ? C[5] : C[4]), fade);
    p.dot(x1, y1, WHITE, fade);
    p.glow(x1, y1, 6, C[5], 0.22 * fade);
  }
  // the fan of the sweep: two ghost shafts left behind the edge
  function ghost(p, t, half, lag) {
    const u = t - T0 - lag;
    if (u < 0 || u > SWEEP * 0.95) return;
    const U = SPAN * ease.outExpo(clamp(u / SWEEP)), a = aim - HALF + U, sg = Math.sin(a) < 0 ? -1 : 1;
    if (half !== sg) return;
    const k = 1 - lag / 0.06;
    if (k <= 0) return;
    const [x0, y0] = onSwing(A, 6, U), [x1, y1] = onSwing(A, RT * 0.99, U);
    p.line(x0, y0, x1, y1, C[3], 0.26 * k);
  }
  // the travelling glint: a hot point running out from the hands to the tip
  function glint(p, t, half) {
    const u = t - T0;
    if (u < 0 || u > 0.2) return;
    const U = head(t), a = aim - HALF + U, sg = Math.sin(a) < 0 ? -1 : 1;
    if (half !== sg) return;
    const k = u < 0.13 ? 1 : 1 - (u - 0.13) / 0.07;
    if (k <= 0) return;
    const s = clamp(u / 0.13);
    const [x0, y0] = onSwing(A, 5, U), [x1, y1] = onSwing(A, RT, U);
    const f = 0.12 + 0.86 * s, gx = x0 + (x1 - x0) * f, gy = y0 + (y1 - y0) * f;
    // a short hot dash running out along the pole
    const bl = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / bl, uy = (y1 - y0) / bl;
    for (let d = 0; d <= 4; d++) p.px(gx - ux * d, gy - uy * d, d < 2 ? WHITE : C[6]);
    p.dot(gx + ux, gy + uy, C[6], 0.7 * k);
    p.glow(gx, gy, 7, C[6], 0.32 * k);
  }
  // the line the tip shaves off the 2:1 floor: a bright wet line, then a wider scuff outside it
  function dustArc(p, t, half) {
    const u = t - T0;
    if (u < 0) return;
    const fade = 1 - smooth(LIFE + 0.02, D - 0.02, u);
    if (fade <= 0) return;
    const U = head(t);
    trace(p, AF, AF.R, 0, U, (v) => (v > 0.72 ? C[5] : v > 0.4 ? C[4] : C[3]),
      (v) => 0.38 * fade * Math.max(0.12, 0.5 + 0.5 * ringNoise(v * 2.2 + aim * 3, 8, 4)), half, 0.7);
    trace(p, AF, AF.R + 2.6, 0, U, C[2],
      (v) => 0.2 * fade * Math.max(0.15, 0.5 + 0.5 * ringNoise(v * 3.1 + aim * 5, 10, 6)), half, 1.1);
  }
  // the tip arrives: a small hard star, its light, and a dust ring on the floor under it
  function tipHit(p, t, half) {
    const u = t - T0 - SWEEP * 0.82;
    if (u < 0 || u > 0.2) return;
    const a = aim + HALF, sg = Math.sin(a) < 0 ? -1 : 1;
    if (half !== sg) return;
    const k = 1 - u / 0.2;
    if (u < 0.045) sparkle(p, EX, EY, 2 + 4 * ease.outBack(clamp(u / 0.045)), C[6], C[4], 0.42 * k);
    p.glow(EX, EY, 9, C[5], 0.2 * Math.exp(-u / 0.05));
    p.glow(EX, EY, 4, WHITE, 0.24 * Math.exp(-u / 0.03));
  }
  function tipRing(p, t, half) {
    const rk = (t - T0 - SWEEP * 0.86) / 0.2;
    if (rk <= 0 || rk >= 1) return;
    const g = aim + HALF, u = Math.cos(g) * RT, v = Math.sin(g) * RT;
    if (half !== (dep(u, v) < 0)) return;
    const [x, y] = P(u, v, 0);
    bandFloor(p, x, y, 2 + 8 * ease.outCubic(rk), Math.max(0.8, 2 * (1 - rk)), 0.32 * (1 - rk) * (1 - rk), [C[4], C[3], C[2]], () => true);
  }

  // a spark: screen-space ballistic, dying on the floor at its own depth
  function spray(p, q, t, back) {
    if (back !== q.z < 0) return;
    const age = t - q.t0;
    if (age < 0 || age >= q.life) return;
    const u = age / q.life, k = 1 - u;
    const x = q.x + q.vx * age, y = q.y + q.vy * age + 0.5 * 560 * age * age;
    const floorY = q.z * FL;
    const vx = q.vx, vy = q.vy + 560 * age, l = Math.hypot(vx, vy) || 1, len = Math.min(4, 1 + l * 0.02);
    if (y >= floorY) { if (y < 27) p.dot(x, floorY, C[4], 0.5 * k); return; }
    if (y > 27) return;
    p.px(x, y, u < 0.35 ? WHITE : q.c);
    p.dot(x - (vx / l) * len, y - (vy / l) * len, C[4], 0.55 * k);
  }
  // a chip of grit or a shaving: in flight, then lying where it landed at its own depth
  function flier(p, q, t, back) {
    const age = t - q.t0;
    if (age < 0 || age > q.life) return;
    const [u, v, h] = tossAt(q, Math.min(age, q.end));
    if (back !== dep(u, v) < 0) return;
    const [x, y] = P(u, v, h);
    const k = 1 - clamp(age / q.life);
    if (age < q.t1) {
      const [u2, v2, h2] = tossAt(q, Math.max(0, age - 0.012));
      const [x2, y2] = P(u2, v2, h2);
      p.px(x, y, k > 0.75 ? WHITE : q.c);
      p.dot(x2, y2, C[4], 0.5 * k);
      if (k > 0.6) p.glow(x, y, 3, C[4], 0.16 * k);
    } else if (y < 27) p.dot(x, y, q.c, 0.45 * k);
  }
  function puff(p, d, t, back) {
    const age = t - d.t0;
    if (age < 0 || age > d.life) return;
    const [u, v, h] = puffAt(d, age);
    if (back !== dep(u, v) < 0) return;
    const [x, y] = P(u, v, h);
    if (y > 27) return;
    const k = age / d.life, r = d.r0 + d.r1 * ease.outCubic(clamp(age / 0.12));
    const a = Math.min(0.3, d.a * Math.pow(1 - k, 1.5) * clamp(age / 0.03) * 1.6);
    if (a > 0.01) p.disc(x, y, r, d.c, a);
  }

  function behind(p, t) {
    trail(p, t, -1);
    ghost(p, t, -1, 0.018);
    ghost(p, t, -1, 0.036);
    shaft(p, t, -1);
    glint(p, t, -1);
    tipHit(p, t, -1);
    dustArc(p, t, -1);
    tipRing(p, t, true);
    for (const d of DUST) puff(p, d, t, true);
    for (const d of WAKE) puff(p, d, t, true);
    for (const q of GRIT) flier(p, q, t, true);
    for (const q of SHV) flier(p, q, t, true);
    for (const q of SPARK) spray(p, q, t, true);
    for (const q of TIP) spray(p, q, t, true);
  }

  function front(p, t) {
    trail(p, t, 1);
    ghost(p, t, 1, 0.018);
    ghost(p, t, 1, 0.036);
    shaft(p, t, 1);
    glint(p, t, 1);
    tipHit(p, t, 1);
    dustArc(p, t, 1);
    tipRing(p, t, false);
    for (const d of DUST) puff(p, d, t, false);
    for (const d of WAKE) puff(p, d, t, false);
    for (const q of GRIT) flier(p, q, t, false);
    for (const q of SHV) flier(p, q, t, false);
    for (const q of SPARK) spray(p, q, t, false);
    for (const q of TIP) spray(p, q, t, false);
    // the light of the sweep, riding the edge and lighting the floor under it
    const u = t - T0;
    if (u > 0 && u < SWEEP + 0.12) {
      const U = head(t), k = 1 - clamp(u / (SWEEP + 0.12));
      const [x, y] = onSwing(A, RT - 5, U);
      p.glow(x, y, 30, C[3], 0.4 * k);
      const [fx, fy] = onSwing(AF, AF.R, U);
      p.glow(fx, fy, 14, C[3], 0.16 * k);
    }
  }

  return {
    update(dt) { T += dt; },
    drawBack(p, tt) {
      const t = Math.min(tt ?? T, D);
      if (t >= D) return;
      behind(p, t);
      backT = t;
    },
    draw(p, tt) {
      const t = Math.min(tt ?? T, D);
      if (t >= D) return;
      if (backT !== t) behind(p, t);
      backT = -1e9;
      front(p, t);
    },
  };
}
