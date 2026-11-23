// Dagger flurry, rewritten for the game's 2:1 isometric camera (docs/AUTHORING.md, "The game's camera").
//
// The side-view flurry cut a fan of points in the screen plane. On the 2:1 floor the hero stabs at points in front
// of him in the world instead: ten short stabs at different (forward, across, height) points over half a second,
// each one arriving as a hot dash, nicking the target with a white-hot cut and a two-pixel spark spray, shaving a
// little nick into the floor below it, and then a hard finisher: a star, a ring on the floor, sparks, slivers and
// shavings. What the camera changes:
//   - the points are placed in the hero's frame and projected, so the flurry reads from any aim: sideways on it runs
//     out across the screen, into the screen it foreshortens and sits lower;
//   - the floor takes its nicks in 2:1, along the flattened line of each stab, and every mark that lies behind the
//     hero is split off by depth like the rest of the library's iso rewrites;
//   - the shavings and sparks are thrown in 3-D, fall and land at their own depth.
// 1 px = 1 character sprite px. aim is a floor angle: 0 = screen right, PI/2 = down the screen toward the viewer.
import { Rng, fit, clamp, smooth, ease, TAU, WHITE, sparkle } from "../../core/index.js";
import { FLOOR, bandFloor } from "../_iso.js";
import { star, sliver } from "./_lib.js";

export const meta = {
  name: "Dagger flurry (iso)",
  desc: "A dagger flurry on the 2:1 floor: ten short stabs in front of the hero, each a white-hot nick with a spark spray and a fading floor nick, finished by a hard star.",
  tags: ["melee", "dagger", "stab", "flurry", "combo", "combat", "directional", "one-shot", "iso", "top-down"],
  size: [200, 180],
  origin: [100, 150],
  duration: 0.68,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: {
    palette: ["#1b1630", "#3a2f63", "#6150a3", "#9480d8", "#c7b8f5", "#efe9ff", "#ffffff"],
    aim: 0,
    seed: 12,
  },
};

const D = meta.duration, FL = FLOOR, G = 640;
const HIP = 21;          // the stabbing hand, at chest height
const HU = 8;            // ... a little in front of the feet
const ABOVE = -0.6;      // nothing but floor marks is drawn below the feet
const FT = 0.44;         // the finisher, the hardest stab of the flurry
const FU = 28, FH = 18;  // where it lands, in the hero's frame

// the ten stabs, in the hero's frame: forward, across, height. Heights are picked so the flurry stays above the
// feet line for every aim (aim = PI/2 foreshortens the reach and drops the points lowest).
const LAYOUT = [
  [14, -6, 16],
  [22, -7, 20],
  [17, 3, 24],
  [26, 3, 17],
  [15, 7, 19],
  [24, -2, 24],
  [19, -5, 14],
  [23, 6, 21],
  [20, 0, 26],
  [12, 4, 18],
];

export function create(o) {
  const C = fit(o.palette, 7), R = new Rng(o.seed ?? 12), aim = o.aim ?? 0;
  const ax = Math.cos(aim), az = Math.sin(aim);
  // the 2:1 camera's projection: (forward, across, height) in the hero's frame -> screen
  const P = (u, v, h) => [u * ax - v * az, (u * az + v * ax) * FL - h];
  const PD = (u, v) => P(u, v, 0);
  const dep = (u, v) => u * az + v * ax;      // negative is behind the hero
  const [HX, HY] = P(HU, 0, HIP);             // the stabbing hand on screen

  // a shaving: thrown in 3-D, drag on the floor, one small bounce, then rest
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

  // ---- the stabs ----
  const STABS = LAYOUT.map(([u, v, h], i) => {
    const t0 = 0.01 + i * 0.045 + R.range(-0.004, 0.004);
    const [x, y] = P(u, v, h), [fx, fy] = PD(u, v), z = dep(u, v);
    // the blade comes in from the hand, so the nick runs along that line in 3-D ...
    const bx = (u - HU) * ax - v * az, by = ((u - HU) * az + v * ax) * FL - (h - HIP), bl = Math.hypot(bx, by) || 1;
    const dx = bx / bl, dy = by / bl;
    // ... and the floor takes a nick along the same line, flattened onto the 2:1 floor
    const gx0 = (u - HU) * ax - v * az, gy0 = ((u - HU) * az + v * ax) * FL, gl = Math.hypot(gx0, gy0) || 1;
    // a 1-2 px spark spray off the point
    const spark = [];
    for (let j = 0, n = i === 0 || i === 7 || i === 9 ? 3 : 2; j < n; j++) {
      const a = Math.atan2(dy, dx) + R.range(-0.85, 0.85), sp = R.range(40, 110);
      spark.push({
        t0: t0 + 0.008 + R.range(0, 0.012),
        life: R.range(0.09, 0.17),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - R.range(0, 12),
        c: R.pick([C[5], C[4], WHITE]),
      });
    }
    // the nick shaved into the floor under the point
    const nick = {
      t0: t0 + 0.01, x: fx, y: fy, z, gx: gx0 / gl, gy: gy0 / gl,
      c: R.pick([C[4], C[5], C[3]]),
      life: Math.min(R.range(0.3, 0.45), D - 0.03 - t0),
    };
    // a shaving off every other stab
    let shaving = null;
    if (i % 2 === 1 && i < 7) {
      const rl = Math.hypot(u - HU, v) || 1, sp = R.range(18, 40);
      shaving = toss(u, v, h, ((u - HU) / rl) * sp + R.range(-5, 5), (v / rl) * sp + R.range(-5, 5), R.range(25, 65));
      shaving.t0 = t0 + 0.01;
      shaving.c = R.pick([C[6], C[5], C[4]]);
      shaving.life = Math.min(shaving.end + 0.1, D - 0.03 - shaving.t0);
    }
    return { t0, x, y, z, dx, dy, spark, nick, shaving };
  });

  // ---- the finisher ----
  const [FX, FY] = P(FU, 0, FH), [FFX, FFY] = PD(FU, 0), FZ = dep(FU, 0);
  const FSPIKES = Array.from({ length: 8 }, (_, i) => ({
    a: (i * TAU) / 8 + R.range(-0.1, 0.1),
    len: (i % 2 ? 4 : 8) + R.range(0, 1.5),
    w: 1.2 + R.range(0, 0.4),
  }));
  const FSPARKS = [];
  for (let i = 0; i < 9; i++) {
    const a = R.range(0, TAU), sp = R.range(50, 150);
    FSPARKS.push({
      t0: FT + 0.005 + R.range(0, 0.02),
      life: R.range(0.1, 0.2),
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - R.range(8, 35),
      c: R.pick([WHITE, C[6], C[5]]),
    });
  }
  const FSHV = [];
  for (let i = 0; i < 4; i++) {
    const b = R.range(0, TAU), sp = R.range(30, 60);
    const q = toss(FU, 0, FH, Math.cos(b) * sp, Math.sin(b) * sp, R.range(35, 80));
    q.t0 = FT + 0.005 + R.range(0, 0.015);
    q.c = R.pick([C[6], C[5], C[4]]);
    q.life = Math.min(q.end + 0.1, D - 0.03 - q.t0);
    FSHV.push(q);
  }
  const FSLIVER = Array.from({ length: 4 }, () => ({
    a: R.range(0, TAU), r: R.range(3, 7), v: R.range(35, 70), arc: R.range(0.7, 1.2),
    c: R.pick([WHITE, C[6], C[5]]),
  }));
  const FDUST = [];
  for (let i = 0; i < 6; i++) {
    const b = R.range(0, TAU);
    const t0 = FT + 0.02 + R.range(0, 0.05);
    FDUST.push({
      u: FU + Math.cos(b) * R.range(0, 4), v: Math.sin(b) * R.range(0, 4), h: 0.3,
      du: Math.cos(b), dv: Math.sin(b), sp: R.range(12, 30), rise: R.range(0.6, 2),
      r0: R.range(1.6, 2.6), r1: R.range(3, 5), t0,
      life: Math.min(R.range(0.28, 0.4), D - 0.03 - t0), a: R.range(0.08, 0.12),
    });
  }

  let T = 0, backT = -1e9;

  // a stab: the blade runs out from the hand, nicks, and is gone. Each one reads as a stab because the line to the
  // hand is there while it travels - on the iso floor the hero can face any way and the arm is never drawn.
  function stab(p, s, t) {
    const age = t - s.t0;
    if (age < -0.065 || age > 0.19) return;
    if (age < 0) {
      const k = (age + 0.065) / 0.065;
      const tx = s.x - s.dx * 9 * (1 - k), ty = s.y - s.dy * 9 * (1 - k);
      p.line(HX, HY, tx, ty, (u) => (u > 0.72 ? WHITE : u > 0.42 ? C[6] : C[5]), 0.5 + 0.5 * k);
      p.px(tx, ty, WHITE);
      p.glow(tx, ty, 5, C[5], 0.22 * k);
      return;
    }
    const hot = 1 - clamp(age / 0.055), k = 1 - clamp(age / 0.18);
    // the blade is still in the hand for a frame
    if (age < 0.025) p.line(HX, HY, s.x - s.dx * 1.5, s.y - s.dy * 1.5, C[5], 0.45 * (1 - age / 0.025));
    // the nick: a tapered five-pixel cut along the blade, white-hot at the point
    for (let d = 0; d <= 5; d++) {
      const nx = s.x - s.dx * d, ny = s.y - s.dy * d;
      if (ny >= ABOVE) continue;
      p.px(nx, ny, d < 2 ? WHITE : d < 3.5 ? C[6] : C[5]);
    }
    // the cut opens a pixel either side
    if (hot > 0.05) {
      const px = s.x - s.dy * 1.4, py = s.y + s.dx * 1.4;
      if (py < ABOVE) p.dot(px, py, C[6], hot);
      const qx = s.x + s.dy * 1.4, qy = s.y - s.dx * 1.4;
      if (qy < ABOVE) p.dot(qx, qy, C[6], hot * 0.8);
    }
    // then it cools into a thin glint
    if (age > 0.09 && k > 0) {
      p.dot(s.x - s.dx * 2, s.y - s.dy * 2, C[5], 0.5 * k);
      p.dot(s.x - s.dx * 3.5, s.y - s.dy * 3.5, C[4], 0.3 * k);
    }
    p.glow(s.x, s.y, 7, C[4], 0.24 * k * k);
    if (age < 0.08) sparkle(p, s.x, s.y, 0.8 + 2.4 * (1 - age / 0.08), C[6], C[4], 0.28 * hot);
  }

  // the spark spray: screen-space ballistic, dying on the floor at the stab's own depth
  function spray(p, s, t, back) {
    if (back !== s.z < 0) return;
    const floorY = s.z * FL;
    for (const q of s.spark) {
      const age = t - q.t0;
      if (age < 0 || age >= q.life) continue;
      const u = age / q.life, k = 1 - u;
      const x = s.x + q.vx * age, y = s.y + q.vy * age + 0.5 * 560 * age * age;
      const vx = q.vx, vy = q.vy + 560 * age, l = Math.hypot(vx, vy) || 1, len = Math.min(4, 1 + l * 0.02);
      if (y >= floorY) { if (y < 27) p.dot(x, floorY, C[4], 0.5 * k); continue; }
      if (y > ABOVE) continue;
      p.px(x, y, u < 0.35 ? WHITE : q.c);
      p.dot(x - (vx / l) * len, y - (vy / l) * len, C[4], 0.55 * k);
    }
  }

  // the nick on the floor: a short 2:1 dash along the flattened stab, cooling to nothing
  function nick(p, q, t, back) {
    if (back !== q.z < 0) return;
    const age = t - q.t0;
    if (age < 0 || age > q.life) return;
    const k = 1 - age / q.life, f = 1 - smooth(q.life * 0.5, q.life, age);
    for (let i = -1; i <= 3; i++) p.dot(q.x + q.gx * i, q.y + q.gy * i, q.c, (0.7 - 0.11 * Math.abs(i)) * k * f);
    if (age < 0.12) p.glow(q.x, q.y, 6, C[3], 0.16 * (1 - age / 0.12));
    // the first flakes of the blow
    if (age < 0.05) {
      const h = 1 - age / 0.05;
      p.dot(q.x, q.y, C[5], 0.85 * h);
      p.dot(q.x + q.gx, q.y + q.gy, C[4], 0.6 * h);
    }
  }

  // a shaving in flight, then lying where it landed at its own depth
  function flier(p, q, t, back) {
    const age = t - q.t0;
    if (age < 0 || age > q.life) return;
    const [u, v, h] = tossAt(q, Math.min(age, q.end));
    const [x, y] = P(u, v, h);
    if (back !== dep(u, v) < 0) return;
    const k = 1 - clamp(age / q.life);
    if (age < q.t1) {
      const [u2, v2, h2] = tossAt(q, Math.max(0, age - 0.012));
      const [x2, y2] = P(u2, v2, h2);
      p.px(x, y, k > 0.75 ? WHITE : q.c);
      p.dot(x2, y2, C[4], 0.5 * k);
      if (k > 0.6) p.glow(x, y, 3, C[4], 0.18 * k);
    } else if (y < 27) p.dot(x, y, q.c, 0.5 * k);
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
    if (a > 0.01) p.disc(x, y, r, C[3], a);
  }

  // the finisher's light and the star, drawn over the hero like any strike (its floor ring is split by depth)
  function finisherAir(p, t) {
    const age = t - FT;
    if (age < 0 || age > 0.17) return;
    if (age < 0.032) star(p, FX, FY, FSPIKES, 1, 1, WHITE, C[5], C[6], C[4]);
    else if (age < 0.08) {
      const k = (age - 0.032) / 0.048;
      star(p, FX, FY, FSPIKES, 1 + 0.5 * ease.outCubic(k), 0.55 * (1 - k) + 0.16, C[6], C[5], C[5], C[3]);
    }
    if (age < 0.13) {
      p.glow(FX, FY, 22, C[5], 0.42 * Math.exp(-age / 0.05));
      p.glow(FX, FY, 9, WHITE, 0.5 * Math.exp(-age / 0.035));
    }
    const sa = age - 0.012;
    if (sa > 0 && sa < 0.13) {
      const k = sa / 0.13;
      for (const s of FSLIVER) sliver(p, FX, FY, s.a, s.r + s.v * sa, s.arc * (1 - 0.4 * k), k < 0.35 ? WHITE : k < 0.7 ? C[6] : C[5], 1 - k);
    }
  }
  // the ring under the blow, opening out 2:1 on the floor
  function finisherFloor(p, t, back) {
    if (back !== FZ < 0) return;
    const rk = (t - FT - 0.01) / 0.22;
    if (rk > 0 && rk < 1) bandFloor(p, FFX, FFY, 2 + 11 * ease.outCubic(rk), Math.max(0.9, 2.2 * (1 - rk)), 0.55 * (1 - rk) * (1 - rk), [C[6], C[5], C[4], C[3]], () => true);
  }

  function behind(p, t) {
    for (const s of STABS) {
      spray(p, s, t, true);
      nick(p, s.nick, t, true);
      if (s.shaving) flier(p, s.shaving, t, true);
    }
    for (const d of FDUST) puff(p, d, t, true);
    finisherFloor(p, t, true);
  }

  function front(p, t) {
    for (const s of STABS) {
      stab(p, s, t);
      spray(p, s, t, false);
      if (s.shaving) flier(p, s.shaving, t, false);
    }
    for (const d of FDUST) puff(p, d, t, false);
    finisherAir(p, t);
    finisherFloor(p, t, false);
    // the hand keeps a little light through the flurry
    if (t < 0.47) p.glow(HX, HY, 5, C[4], 0.12 * (1 - t / 0.47));
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
