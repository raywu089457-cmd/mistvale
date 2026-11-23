// Thrust, rewritten for the game's 2:1 isometric camera: melee/thrust in the world the game sees, not the side
// view's picture squashed or stretched onto the floor.
//
// The recipe is the source's: the point gathering light in the hand, the bundle of speed streaks raking out
// along the aim to a point ~40 px ahead, the long four-point white star at the tip, the pierce ring on the floor
// under it, the sparks, the motes, the speed lines, the dust kicked out behind; the same palette, the same beats
// and the same timing.
// What the camera changes:
//   - the pierce follows the aim ACROSS the floor, at hip height: the streak bundle converges into the tip in
//     3-D, so it reads along the screen direction of the aim (horizontal, into the screen, or up-screen);
//   - the point punches the floor's depth too: the pierce ring and its light pool are 2:1 ellipses on the floor
//     under the tip, not a ring in the air;
//   - the dust is kicked out BEHIND the thrust, opposite the aim, and spreads every way in 3-D;
//   - it is gone the way such a thing goes: the bundle is pulled into the point, the star dims, the ring rolls
//     out, the dust drifts and thins, the sparks fall. Nothing is dropped or faded as a picture.
// 1 px = 1 character sprite px. aim is a floor angle: 0 = screen right, PI/2 = down the screen toward the viewer.
import { Rng, fit, clamp, smooth, ease, lerp, TAU, WHITE, mix, hex } from "../../core/index.js";
import { FLOOR, bandFloor } from "../_iso.js";
import { stone } from "./_lib.js";
import { soft } from "../fire/_lib.js";

export const meta = {
  name: "Thrust (iso)",
  desc: "melee/thrust on the 2:1 floor: speed streaks from hip height to a point ahead, a long four-point white star at the tip, a pierce ring under it, sparks, dust kicked out behind.",
  tags: ["melee", "thrust", "spear", "pierce", "stab", "combat", "iso", "top-down", "one-shot", "directional"],
  size: [220, 160],
  origin: [110, 126],
  duration: 0.7,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: {
    palette: ["#2a1608", "#6b3c10", "#b8701a", "#f0b42e", "#ffe27a", "#fff6cf", "#ffffff"],
    aim: 0,
    seed: 4,
  },
};

const D = meta.duration, FL = FLOOR, G = 470;
// the source's beats: the point arrives, holds, then is pulled back out of the world
const OUT = 0.07, HOLD = 0.06, PULL = 0.2, PULL_END = OUT + HOLD + PULL;
// the pierce: the hand at hip height, the point 40 px of floor ahead of the caster's feet
const HIP = 20, U0 = 9, TIP = 40;

/** A speck thrown in 3-D: drag on the floor, one small bounce, then rest. */
function toss(u, v, h, vu, vv, vh, drag = 2.4) {
  const disc = vh * vh + 2 * G * h, t1 = (vh + Math.sqrt(disc)) / G, vDown = Math.sqrt(disc);
  const vUp = vDown * 0.3, t2 = (2 * vUp) / G;
  return { u, v, h, vu, vv, vh, drag, t1, vUp, t2, end: t1 + t2 };
}
function tossAt(b, age) {
  const t = Math.min(age, b.end), e = Math.exp(-b.drag * t), d = 1 - e;
  const u = b.u + (b.vu * d) / b.drag, v = b.v + (b.vv * d) / b.drag;
  let h;
  if (t < b.t1) h = b.h + b.vh * t - 0.5 * G * t * t;
  else {
    const tb = t - b.t1;
    h = tb < b.t2 ? b.vUp * tb - 0.5 * G * tb * tb : 0;
  }
  return [u, v, h];
}
/** A dust puff: rolls out and slows, lifting as it thins. */
function puffAt(d, age) {
  const t = Math.min(age, d.life), e = Math.exp(-2.4 * t), dist = (d.sp * (1 - e)) / 2.4;
  return [d.u + d.du * dist, d.v + d.dv * dist * 0.7, d.h + (d.rise * (1 - Math.exp(-1.2 * t))) / 1.2 + 0.5 * t];
}

export function create(o) {
  const F = fit(o.palette, 7);
  const R = new Rng(o.seed ?? 4);
  const aim = o.aim ?? 0;
  const ax = Math.cos(aim), az = Math.sin(aim);
  const P = (u, v, h) => [u * ax - v * az, (u * az + v * ax) * FL - h];
  const ST = stone(hex("#5a4630"));
  const [TX, TY] = P(TIP, 0, HIP);   // the point, at hip height
  const [FX, FY] = P(TIP, 0, 0);     // the floor under it
  const [HX, HY] = P(U0, 0, HIP);    // the hand
  // the pierce's screen direction (the floor's 2:1 squeezes it) and its perpendicular
  const sd = Math.hypot(ax, az * FL) || 1, dx = ax / sd, dy = (az * FL) / sd, ex = -dy, ey = dx;

  // ---- the streak bundle: offsets from the source, converging into the point ----
  const STREAKS = [-7, -4, -2, 0, 2, 4, 7].map((hOff, i) => ({
    hOff, vOff: R.range(-1.4, 1.4), t0: i * 0.004,
    uEnd: i === 3 ? TIP + 1 : TIP - Math.abs(hOff) * R.range(0.9, 1.6),
    hot: i === 3,
  }));

  // ---- speed lines: dotted lines raking in behind the bundle ----
  const LINES = [];
  for (let i = 0; i < 6; i++) LINES.push({ u0: R.range(-20, -4), v0: R.range(-7, 7), h0: HIP + R.range(-12, 12), sp: R.range(190, 330), t0: R.range(0, OUT + 0.06), life: R.range(0.2, 0.3) });

  // ---- dust kicked out behind the thrust (opposite the aim), every way round ----
  const DUSTS = [];
  for (let i = 0; i < 16; i++) {
    DUSTS.push({
      u: -R.range(5, 20), v: R.range(-14, 14), h: R.range(0.2, 1), du: -1.2 - R.range(0, 1), dv: R.range(-1, 1),
      sp: R.range(20, 46), rise: R.range(0.5, 2), r0: R.range(1.8, 3), r1: R.range(3.5, 6),
      life: Math.min(R.range(0.42, 0.66), D - 0.04), t0: R.range(0, 0.06), a: R.range(0.07, 0.11),
    });
  }
  // ---- grit off the floor, thrown behind with the dust ----
  const GRIT = [];
  for (let i = 0; i < 8; i++) {
    const th = R.range(0, TAU), sp = R.range(14, 34);
    const b = toss(-R.range(2, 9), R.range(-6, 6), R.range(0, 1), -Math.abs(Math.cos(th)) * sp - 4, Math.sin(th) * sp, R.range(24, 74), 2.6);
    b.c = R.pick([ST.light, ST.body, ST.dust]);
    GRIT.push(b);
  }

  // ---- sparks and motes at the point ----
  const SPARKS = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.atan2(dy, dx) + R.range(-0.42, 0.42), sp = R.range(60, 140);
    SPARKS.push({ t0: OUT + R.range(0, 0.02), a, sp, life: R.range(0.1, 0.2), x: TX, y: TY });
  }
  const MOTES = [];
  for (let i = 0; i < 10; i++) {
    const a = R.range(0, TAU), r = R.range(2, 9);
    MOTES.push({ t0: OUT + R.range(0, 0.06), x: TX + Math.cos(a) * r, y: TY + Math.sin(a) * r, vx: R.range(-14, 14) + dx * 10, vy: R.range(-14, 14) + dy * 10, life: R.range(0.18, 0.34) });
  }
  // the twinkle points around the head of the star while it holds
  const TWINKLES = [];
  for (let i = 0; i < 4; i++) TWINKLES.push({ a: R.range(0, TAU), r: R.range(5, 9), ph: R.range(0, TAU), life: R.range(0.14, 0.22), t0: OUT + R.range(0.02, 0.08) });

  // slow embers drifting off the point and cooling: the thrust's wake, filling the hold
  const DRIFT = [];
  for (let i = 0; i < 14; i++) DRIFT.push({ t0: OUT + R.range(0, 0.1), a: R.range(0, TAU), r: R.range(1, 7), sp: R.range(3, 16), life: R.range(0.34, 0.55) });

  let T = 0;
  const pullAt = (tt) => smooth(OUT + HOLD, PULL_END, tt);
  const headF = (s, tt) => ease.outExpo(clamp((tt - s.t0) / OUT));

  const draw = (p, tt) => {
    if (tt >= D) return;
    const t = Math.max(0, tt), pull = pullAt(t), alpha = clamp(1 - pull, 0, 1);

    // speed lines first: they are behind everything
    for (const l of LINES) {
      const age = t - l.t0;
      if (age <= 0 || age >= l.life) continue;
      const k = 1 - age / l.life;
      const u = l.u0 + l.sp * age;
      for (let j = 0; j < 3; j++) {
        const ua = u - j * 7.2, ub = ua - 3.6;
        const [x1, y1] = P(ua, l.v0, l.h0), [x2, y2] = P(ub, l.v0, l.h0);
        p.line(x1, y1, x2, y2, j === 0 ? F[6] : F[4], k * (0.62 - j * 0.16));
      }
    }

    // the pierce ring and its light, lying on the 2:1 floor under the point
    const rk = clamp((t - OUT) / 0.25);
    if (rk > 0 && rk < 1) {
      bandFloor(p, FX, FY, 3 + 9 * ease.outCubic(rk), Math.max(0.9, 2.6 * (1 - rk)), (1 - rk), [F[2], F[3], F[4], F[6]], () => true);
      const rx = 8 + 7 * rk, ry = rx * FL;
      p.shade(FX - rx, FY - ry, FX + rx, FY + ry, (x, y, out) => {
        const d = Math.hypot((x - FX) / rx, (y - FY) / ry);
        if (d >= 1) return;
        const f = 1 - d;
        out.l = mix(F[4], F[6], f); out.k = 0.22 * (1 - rk) * f * f;
      });
    }

    // dust rolling out behind, soft and thin
    const live = [];
    for (const d of DUSTS) {
      const age = t - d.t0;
      if (age <= 0 || age >= d.life) continue;
      const [u, v, h] = puffAt(d, age), [x, y] = P(u, v, h);
      live.push([y, d, age, x]);
    }
    live.sort((a, b) => a[0] - b[0]);
    for (const [y, d, age, x] of live) {
      const k = age / d.life, r = d.r0 + d.r1 * ease.outCubic(clamp(age / 0.1));
      const a = Math.min(0.34, d.a * Math.pow(1 - k, 1.5) * clamp(age / 0.03) * 1.8);
      if (a > 0.01) soft(p, x, y, r, ST.dust, a);
    }

    // grit skittering over the floor behind
    const gAge = t;
    if (gAge > 0) {
      const fade = clamp(1 - gAge / 0.5, 0, 1);
      for (const b of GRIT) {
        const [u, v, h] = tossAt(b, gAge), [x, y] = P(u, v, h);
        p.dot(x, y, b.c, fade);
      }
    }

    // the bundle: streaks of speed converging into the point
    for (const s of STREAKS) {
      let fh = headF(s, t), ft = 0;
      if (pull > 0) { ft = fh * pull; fh *= 1 + 0.02 * pull; }
      if (fh - ft < 0.012) continue;
      const at = (f) => P(lerp(U0, s.uEnd, f), s.vOff * (1 - f), HIP + s.hOff * (1 - f));
      const [xt, yt] = at(ft), [xh, yh] = at(fh);
      const col = (u) => (u > 0.8 ? WHITE : u > 0.6 ? F[6] : u > 0.42 ? F[5] : u > 0.25 ? F[4] : F[3]);
      const aa = (u) => alpha * (0.3 + 0.7 * u);
      p.line(xt, yt, xh, yh, col, aa);
      if (s.hot) p.glowLine(xt, yt, xh, yh, 7, F[5], 0.22 * alpha);
    }

    // the four-point star at the tip, its long axis on the pierce
    const arr = clamp((t - (OUT - 0.015)) / 0.05);
    const starK = clamp(1 - pull, 0, 1) * arr;
    if (starK > 0.02) {
      const L = 27 * ease.outCubic(arr) * (0.94 + 0.06 * Math.sin(t * 45));
      const arm = (ux, uy, len, sides) => {
        for (let d = 0.6; d <= len; d += 0.8) {
          const q = d / len, c = q < 0.3 ? WHITE : q < 0.62 ? F[6] : F[5];
          const x = TX + ux * d, y = TY + uy * d;
          p.dot(x, y, c, starK * (1 - 0.45 * q));
          if (sides && q < 0.3) {
            p.dot(x - uy * 0.9, y + ux * 0.9, c, starK * 0.45);
            p.dot(x + uy * 0.9, y - ux * 0.9, c, starK * 0.45);
          }
        }
      };
      arm(dx, dy, L, true);
      arm(-dx, -dy, L * 0.74, true);
      arm(ex, ey, L * 0.34, false);
      arm(-ex, -ey, L * 0.34, false);
      p.circle(TX, TY, 2.3, WHITE);
      p.px(TX, TY, WHITE);
    }

    // the point lights up when it arrives
    const fl = clamp(1 - (t - OUT) / 0.06, 0, 1);
    if (t >= OUT && fl > 0) p.glow(TX, TY, 16, WHITE, 0.5 * fl);
    if (starK > 0.02) {
      p.glow(TX, TY, 30, F[4], 0.3 * starK);
      p.glow(TX, TY, 13, mix(F[5], WHITE, 0.4), 0.42 * starK);
    }
    // the twinkle points around it while it holds
    for (const w of TWINKLES) {
      const age = t - w.t0;
      if (age <= 0 || age >= w.life) continue;
      const k = Math.sin((age / w.life) * Math.PI);
      const x = TX + Math.cos(w.a) * w.r, y = TY + Math.sin(w.a) * w.r;
      p.dot(x, y, WHITE, k);
      p.dot(x + 1, y, F[6], k * 0.6);
      p.dot(x, y + 1, F[6], k * 0.6);
    }

    // sparks thrown off the point, falling
    for (const s of SPARKS) {
      const age = t - s.t0;
      if (age <= 0 || age >= s.life) continue;
      const k = 1 - age / s.life;
      const x = s.x + Math.cos(s.a) * s.sp * age, y = s.y + Math.sin(s.a) * s.sp * age + 34 * age * age;
      const vx = Math.cos(s.a) * s.sp, vy = Math.sin(s.a) * s.sp + 68 * age;
      const len = Math.min(8, 1.5 + s.sp * 0.02);
      const sp = Math.hypot(vx, vy) || 1;
      p.line(x - (vx / sp) * len, y - (vy / sp) * len, x, y, k > 0.6 ? WHITE : F[5]);
      p.glow(x, y, 3, F[5], 0.35 * k);
    }

    // motes drifting off the point
    for (const m of MOTES) {
      const age = t - m.t0;
      if (age <= 0 || age >= m.life) continue;
      const k = 1 - age / m.life;
      p.dot(m.x + m.vx * age, m.y + m.vy * age - 10 * age * age, F[5], k * 0.8);
    }

    // slow embers off the point, cooling as they drift
    for (let i = 0; i < DRIFT.length; i++) {
      const e = DRIFT[i], age = t - e.t0;
      if (age <= 0 || age >= e.life) continue;
      const k = 1 - age / e.life, dr = 1 - Math.exp(-1.3 * age), d = (e.sp * dr) / 1.3;
      const x = TX + Math.cos(e.a) * (e.r + 4 * dr) + dx * d * 0.5;
      const y = TY + Math.sin(e.a) * (e.r + 4 * dr) - 7 * age + dy * d * 0.5;
      const c = k > 0.62 ? F[6] : k > 0.34 ? F[5] : F[4];
      p.dot(x, y, c, 0.35 + 0.65 * k);
      if (k > 0.45) p.dot(x + 0.7, y + 0.5, mix(c, WHITE, 0.3), 0.5 * k);
      if (i % 3 === 0) p.glow(x, y, 3, F[5], 0.14 * k);
    }

    // the point hangs for a moment after the pull, cooling to a pale speck
    if (t > PULL_END) {
      const k = clamp(1 - (t - PULL_END) / 0.24);
      if (k > 0) { p.dot(TX, TY, k > 0.5 ? F[6] : F[5], k); p.glow(TX, TY, 6, F[5], 0.16 * k); }
    }

    // the hand catches the light as the point starts
    if (t < 0.05) {
      const k = 1 - t / 0.05;
      p.glow(HX, HY, 8, F[5], 0.5 * k);
      p.dot(HX, HY, WHITE, k);
      p.dot(HX + 1, HY, F[6], k * 0.6);
      p.dot(HX - 1, HY, F[6], k * 0.6);
      p.dot(HX, HY - 1, F[6], k * 0.6);
    }
  };

  return { update(dt) { T += dt; }, draw };
}
