// Double slash, rewritten for the game's 2:1 isometric camera: melee/double-slash in the world the game sees, not
// the side view's picture squashed onto the floor.
//
// The recipe is the source's: a first cut whips down across the hero's front, a second opposed cut answers it ~0.11 s
// later, the two crescents cross and the X flashes white, the crossing bursts light and sparks, a dotted X lingers,
// and the floor under it takes the blow. Same palette, same beats.
// What the camera changes:
//   - the X stands upright in the air in front of the hero at chest height (height stays height), turned across his
//     facing and mirrored when he faces left, lowered a little when he faces the camera;
//   - the crossing is a point in 3-D; the white-hot mark hangs there while a scuff and a ring of light run out on
//     the 2:1 floor below it;
//   - sparks are thrown off the cuts, and heavier chips fall out of the crossing in 3-D, landing at their own depth
//     on the floor.
// 1 px = 1 character sprite px. aim is a floor angle: 0 = screen right, PI/2 = down the screen toward the viewer.
import { Rng, fit, clamp, smooth, ease, TAU, WHITE, sparkle } from "../../core/index.js";
import { FLOOR, bandFloor, floorShadow } from "../_iso.js";
import { through, slash, slashEnd, onSwing, travel, sliver } from "./_lib.js";

export const meta = {
  name: "Double slash (iso)",
  desc: "Two opposed crescents cross in an X in the air: white leading edges, tip glints, sparks along the cuts, then a white-hot mark and a scuff on the 2:1 floor.",
  tags: ["melee", "slash", "combo", "sword", "cross", "combat", "directional", "one-shot", "iso", "top-down", "ground"],
  size: [200, 180],
  origin: [100, 150],
  duration: 0.68,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  actor: 2,
  options: {
    palette: ["#2a0a22", "#5e1238", "#a01f4e", "#e0386a", "#ff86a6", "#ffd2dd", "#ffffff"],
    aim: 0,
    seed: 6,
  },
};

const D = meta.duration, FL = FLOOR, G = 500;
const UP = 0.115;                 // the second cut starts: the source's beat
const FWD = 22, HC = 20;          // the crossing: well in front, at chest height, so the X stays clear of the body
const R0 = 39, AT = 0.55;         // a bowed crescent (a longer arc on a shorter radius), the crossing 55% along it
const SPAN0 = 0.84;
const SW1 = 0.06, HO1 = 0.07, TR1 = 0.2;   // the first cut: whip out, hold, trail off
const SW2 = 0.055, HO2 = 0.06, TR2 = 0.2;  // the second

/** An offcut thrown in the game's 3-D: drag on the floor, one small bounce, then rest at its own depth. */
function toss(u, v, h, vu, vv, vh, drag = 1.6) {
  const disc = vh * vh + 2 * G * h, t1 = (vh + Math.sqrt(disc)) / G, vDown = Math.sqrt(disc);
  const vUp = vDown * 0.3, t2 = (2 * vUp) / G;
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
/** When a slash's head has passed fraction f of its span (it races out with ease.outExpo). */
const passed = (f, span, sweep) => sweep * (-Math.log2(1 - clamp((f * span) / span, 0, 0.985)) / 10);

export function create(o) {
  const C = fit(o.palette, 7), n = C.length, R = new Rng(o.seed ?? 6), aim = o.aim ?? 0;
  const ca = Math.cos(aim), sa = Math.sin(aim);
  const P = (u, v, h) => [u * ca - v * sa, (u * sa + v * ca) * FL - h];

  // the two strokes: diagonals in the camera plane, the first down-right, the second up-right; mirrored when he
  // faces left, so the X always crosses in front of him and never turns edge on
  const mir = ca < 0 ? -1 : 1;
  const th1 = mir > 0 ? 0.85 : Math.PI - 0.85;
  const th2 = mir > 0 ? -0.78 : Math.PI + 0.78;
  const d1 = mir, d2 = -mir;
  let bx = FWD * ca, by = FWD * sa * FL - HC;

  // no air below the feet: if a tip of the X would dip under them, lift the whole X (its floor mark stays put)
  const lowY = (s) => {
    let m = -1e9;
    for (let i = 0; i <= 24; i++) {
      const uu = (i / 24) * s.span;
      m = Math.max(m, onSwing(s, s.R, uu)[1], onSwing(s, s.R - 10, uu)[1]);
    }
    return m;
  };
  for (let k = 0; k < 5; k++) {
    const q1 = through(bx, by, th1, d1, R0, SPAN0, AT), q2 = through(bx, by, th2, d2, R0, SPAN0, AT);
    const need = Math.max(lowY(q1), lowY(q2)) + 1.5;
    if (need <= 0) break;
    by -= need;
  }
  const CX = bx, CY = by;                              // the crossing, in the picture
  const [FX, FY] = P(FWD, 0, 0);                       // the floor under it, 2:1
  const down = through(CX, CY, th1, d1, R0, SPAN0, AT, { W: 7.2, t0: 0, sweep: SW1, hold: HO1, trail: TR1, ramp: C, lens: true });
  const up = through(CX, CY, th2, d2, R0, SPAN0, AT, { W: 8.0, t0: UP, sweep: SW2, hold: HO2, trail: TR2, ramp: C, lens: true });
  const ends = [slashEnd(down), slashEnd(up)];
  const CLOSE = UP + SW2 * AT;                         // the second cut reaches the crossing

  // ---- sparks thrown off both cuts: born where the edge passes, flung off it and upward ----
  const SPARKS = [];
  for (const s of [down, up])
    for (let i = 0; i < 6; i++) {
      const f = R.range(0.3, 0.98), uu = s.span * f;
      const [x, y] = onSwing(s, s.R - R.range(0.5, s.W * 0.7), uu);
      const tr = travel(s, uu), side = R.chance(0.5) ? 1 : -1;
      const a = Math.atan2(tr.dy, tr.dx) + side * R.range(1, 1.8), sp = R.range(60, 170);
      SPARKS.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - R.range(0, 30), t0: s.t0 + passed(f, s.span, s.sweep), life: R.range(0.1, 0.22) });
    }
  // ---- chips knocked out of the crossing: thrown up and out in 3-D, falling to the floor at their own depth ----
  const CHIPS = [];
  for (let i = 0; i < 5; i++) {
    const th = R.range(0, TAU), sp = R.range(14, 40);
    const b = toss(FWD + R.range(-1.5, 2), R.range(-1.5, 1.5), HC + R.range(-1.5, 1.5), Math.cos(th) * sp, Math.sin(th) * sp, R.range(30, 80), 1.8);
    b.t0 = CLOSE + R.range(0, 0.02);
    b.life = Math.min(b.t0 + b.end + 0.14, D - 0.06);
    b.c = R.pick([C[4], C[5], C[3]]);
    CHIPS.push(b);
  }
  // ---- the burst at the crossing: slivers, twinkles and sparks, all timed off CLOSE ----
  const SLIVERS = [0, 1, 2, 3].map(() => ({ a: R.range(0, TAU), r: R.range(4, 7), v: R.range(70, 120), arc: R.range(0.35, 0.7) }));
  const TWINKLES = [0, 1, 2].map(() => ({ a: R.range(0, TAU), r: R.range(5, 10), t0: R.range(0.01, 0.07), life: R.range(0.14, 0.22) }));
  const BURST = [];
  for (let i = 0; i < 12; i++) {
    const a = R.range(-Math.PI, Math.PI), sp = R.range(90, 240);
    BURST.push({ x: CX, y: CY, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, life: R.range(0.12, 0.3) });
  }
  // ---- the scuff on the 2:1 floor under the crossing: dots round it and a raked line along the aim ----
  const SCUFF = [];
  for (let i = 0; i < 20; i++) {
    const a = R.range(0, TAU), d = R.range(2, 9);
    SCUFF.push({ x: FX + Math.cos(a) * d, y: FY + Math.sin(a) * d * FL, k: R.range(0.1, 0.24), c: R.pick([C[1], C[2], C[2]]), t0: CLOSE + R.range(0, 0.03) });
  }
  for (let i = 0; i < 9; i++) SCUFF.push({ x: FX + ca * (i - 4) * 1.8, y: FY + sa * FL * (i - 4) * 1.8, k: R.range(0.12, 0.3), c: C[2], t0: CLOSE + R.range(0, 0.02) });

  let T = 0;

  // the floor the X leaves: light running out along it, the scuff, the light pool
  const floorDraw = (p, t, fade) => {
    if (t >= CLOSE) floorShadow(p, FX, FY, 4, 0x000000, 0.12 * fade);
    for (const q of SCUFF) if (t >= q.t0) p.dot(q.x, q.y, q.c, q.k * fade);
    const q = t - CLOSE;
    if (q >= 0 && q < 0.34) {
      const k = q / 0.34;
      bandFloor(p, FX, FY, 3 + 11 * ease.outCubic(k), Math.max(0.8, 2.4 * (1 - k)), 0.62 * (1 - k) * (1 - k), [C[2], C[3], C[4], C[5], C[6]], () => true);
    }
    if (t >= CLOSE) p.glow(FX, FY, 14, C[4], 0.12 * (1 - smooth(CLOSE, CLOSE + 0.4, t)));
  };

  // a crisp white leading edge riding the outer rim of a cut (during the flash the whole rim goes white)
  const rim = (p, s, t, flash) => {
    const u0 = t - s.t0;
    if (u0 < 0) return;
    const head = ease.outExpo(clamp(u0 / s.sweep)) * s.span;
    const tail = smooth(s.sweep + s.hold, s.sweep + s.hold + s.trail, u0) * s.span;
    if (head - tail < 0.02) return;
    const fade = 1 - smooth(s.sweep + s.hold + s.trail * 0.5, s.sweep + s.hold + s.trail + 0.08, u0);
    if (fade <= 0) return;
    const steps = Math.max(6, Math.ceil((head - tail) * 9));
    for (let i = 0; i <= steps; i++) {
      const uu = tail + ((head - tail) * i) / steps;
      const [x, y] = onSwing(s, s.R - 0.45, uu);
      if (y > -0.5) continue;
      const v = i / steps;
      if (flash || v > 0.82) p.px(x, y, WHITE);
      else if (v > 0.42) p.px(x, y, C[6]);
      else p.dot(x, y, C[5], 0.5 * v * fade);
    }
  };

  // the crossing: the X closes, both strokes flash, a white-hot mark hangs there, light and slivers fly off
  const crossDraw = (p, t, fade) => {
    const q = t - CLOSE;
    if (q < 0) return;
    for (const b of BURST) {
      if (q > b.life) continue;
      const k = 1 - q / b.life, x = b.x + b.vx * q, y = b.y + b.vy * q + 0.5 * 380 * q * q;
      if (y > -0.5) continue;
      const sp = Math.hypot(b.vx, b.vy + 380 * q) || 1, len = Math.min(6, 1.4 + sp * 0.016);
      p.line(x - (b.vx / sp) * len, y - ((b.vy + 380 * q) / sp) * len, x, y, k > 0.55 ? C[6] : C[4], 0.9 * k * fade);
      if (k > 0.4) p.glow(x, y, 3, C[4], 0.13 * k * fade);
    }
    const k = q / 0.2;
    if (k < 1) {
      const kk = (1 - k) * fade;
      if (k < 0.55) sparkle(p, CX, CY, 3, C[6], WHITE, 0.35 * kk);
      p.glow(CX, CY, 12, C[4], 0.14 * kk);
    }
    if (q >= 0.03 && q < 0.16) {
      const e = (q - 0.03) / 0.13;
      for (const s of SLIVERS) sliver(p, CX, CY, s.a, s.r + s.v * (q - 0.03), s.arc * (1 - 0.4 * e), e < 0.4 ? C[6] : e < 0.7 ? C[5] : C[4], 1 - e);
    }
    // the mark the crossing leaves: white-hot, then a pale speck that cools and goes
    const m = 1 - smooth(0.05, 0.34, q);
    if (m > 0) {
      const hot = 1 - smooth(0.015, 0.14, q);
      p.px(CX, CY, hot > 0.35 ? WHITE : C[6]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (hot > 0.22) p.px(CX + dx, CY + dy, C[6]);
        if (hot > 0.62) p.px(CX + dx * 2, CY + dy * 2, C[5]);
      }
      if (hot > 0.1) p.glow(CX, CY, 5 + 6 * hot, hot > 0.4 ? WHITE : C[5], 0.3 * hot * m * fade);
    }
    for (const w of TWINKLES) {
      const a = q - w.t0;
      if (a <= 0 || a >= w.life) continue;
      const kk = Math.sin((a / w.life) * Math.PI);
      sparkle(p, CX + Math.cos(w.a) * w.r, CY + Math.sin(w.a) * w.r, 3, C[5], WHITE, 0.35 * kk * fade);
    }
  };

  const chipDraw = (p, t, fade) => {
    for (const b of CHIPS) {
      const age = t - b.t0;
      if (age < 0 || age > b.life - b.t0) continue;
      const [u, v, h] = tossAt(b, age), [x, y] = P(u, v, h);
      const k = clamp(1 - age / (b.life - b.t0));
      if (h > 0.4) {
        p.px(x, y, age < 0.04 ? WHITE : age < 0.14 ? C[5] : b.c);
        if (age < 0.1) p.glow(x, y, 3, C[4], 0.12 * k * fade);
      } else p.dot(x, y, k > 0.4 ? C[3] : C[2], 0.6 * k * fade);
    }
  };

  return {
    update(dt) { T += dt; },
    draw(p, tt) {
      const t = tt ?? T;
      const fade = 1 - smooth(0.56, 0.66, t);
      if (fade <= 0) return;
      floorDraw(p, t, fade);
      chipDraw(p, t, fade);
      // the X closes: both rims flash white (a crisp white X), light breaks off the crossing
      down.hot = up.hot = 0;
      const flash = t >= CLOSE - 0.005 && t < CLOSE + 0.05;
      slash(p, down, t);
      slash(p, up, t);
      rim(p, down, t, flash);
      rim(p, up, t, flash);
      // glints at the ends of the strokes, as each cut reaches full stretch
      for (const [s, e] of [[down, ends[0]], [up, ends[1]]]) {
        const g = t - s.t0 - s.sweep * 0.6;
        if (g > 0 && g < 0.2) sparkle(p, e.x, e.y, 3 * ease.outBack(Math.min(1, g / 0.05)) * (1 - g / 0.2), C[5], WHITE, 0.3 * fade);
      }
      for (const s of SPARKS) {
        const age = t - s.t0;
        if (age < 0 || age >= s.life) continue;
        const x = s.x + s.vx * age, y = s.y + s.vy * age + 0.5 * 380 * age * age;
        if (y > -0.5) continue;
        const k = 1 - age / s.life, sp = Math.hypot(s.vx, s.vy + 380 * age) || 1, len = Math.min(5, 1.4 + sp * 0.016);
        p.line(x - (s.vx / sp) * len, y - ((s.vy + 380 * age) / sp) * len, x, y, k > 0.55 ? C[6] : C[4], 0.9 * k * fade);
        if (k > 0.45) p.glow(x, y, 3, C[5], 0.12 * k * fade);
      }
      crossDraw(p, t, fade);
    },
  };
}
