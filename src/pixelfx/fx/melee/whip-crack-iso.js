// Whip crack, rewritten for the game's 2:1 isometric camera (docs/AUTHORING.md, "The game's camera").
//
// The side-view crack rolled a loop out to the right and flipped its tip into a pop. On the 2:1 floor the whip is a
// real line in the world: from the hand out along the aim, a taut curve with a small kink running down it, and when
// the kink reaches the tip the whip cracks - a hard little star, a ring of air opening 2:1 on the floor under it,
// sparks, slivers and a scuff of dust - and then the line is pulled back in and dissolves into a dotted trace.
// What the camera changes:
//   - the whip is a curve in the vertical plane through the aim, so sideways it is a long horizontal lash, into the
//     screen it foreshortens and the kink reads as a vertical flick, and away from the viewer it lies over the hero;
//   - the pop's ring and the scuff are 2:1 marks on the floor at the strike's own depth, split off behind the hero;
//   - the sparks are thrown in 3-D and die on the floor at the depth of the strike.
// 1 px = 1 character sprite px. aim is a floor angle: 0 = screen right, PI/2 = down the screen toward the viewer.
import { Rng, fit, clamp, smooth, ease, TAU, WHITE, sparkle, hex } from "../../core/index.js";
import { FLOOR, bandFloor } from "../_iso.js";
import { star, sliver } from "./_lib.js";

export const meta = {
  name: "Whip crack (iso)",
  desc: "A whip cracks on the 2:1 floor: a taut curve lashes out along the aim, its tip pops into a hard star and a ring of air on the floor, then the lash recoils into a dotted trace.",
  tags: ["melee", "whip", "crack", "lash", "combat", "directional", "one-shot", "iso", "top-down"],
  size: [200, 180],
  origin: [100, 150],
  duration: 0.56,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: {
    palette: ["#2a1a10", "#5c3a1e", "#9c6a34", "#d8a45a", "#ffd890", "#fff4d6", "#ffffff"],
    aim: 0,
    seed: 3,
  },
};

const D = meta.duration, FL = FLOOR, G = 620;
const HIP = 21;                                  // the hand, at chest height
const HU = 9;                                    // ... a little in front of the feet
const REACH = 38;                                // the tip lands this far ahead along the aim
const HIT = 20;                                  // ... at this height, so the strike stays on the feet line
const ROLL0 = 0.02, ROLL = 0.17, CRACK = ROLL0 + ROLL;
const RECOIL = 0.16;                             // the lash is pulled back in after the crack

export function create(o) {
  const C = fit(o.palette, 7), R = new Rng(o.seed ?? 3), aim = o.aim ?? 0;
  const ax = Math.cos(aim), az = Math.sin(aim);
  // the 2:1 camera's projection: (forward, across, height) in the hero's frame -> screen
  const P = (u, v, h) => [u * ax - v * az, (u * az + v * ax) * FL - h];
  const dep = (u, v) => u * az + v * ax;         // negative is behind the hero
  const [HX, HY] = P(HU, 0, HIP);                // the hand on screen
  const [TX, TY] = P(REACH, 0, HIT);             // the crack
  const [FX, FY] = P(REACH, 0, 0);               // ... and the floor under it
  const TZ = dep(REACH, 0);

  const phase = (t) => clamp((t - ROLL0) / ROLL);
  // the whip rolls out: the tip whips out fastest at the end, so the lash accelerates into the crack
  const ext = (t) => HU + (REACH - HU) * ease.inQuad(phase(t));

  // the whip's shape: a taut curve from the hand to the tip, a shallow sag, a little lateral S, and a kink that runs
  // out along it and vanishes at the crack. Closed form in t, so any frame renders alone.
  function pt(s, t) {
    const e = Math.max(1, ext(t)), f = clamp(s / e), ph = ease.inQuad(phase(t));
    const kink = Math.exp(-Math.pow((s - e * (0.3 + 0.66 * ph)) / (3 + 2.4 * f), 2)) * (1 - ph * ph * ph);
    const h = HIP + (HIT - HIP) * f - 3.6 * Math.sin(Math.PI * f) + 5.6 * kink;
    const v = 2.4 * Math.sin(2 * Math.PI * f) * (1 - 0.4 * f);
    return P(s, v, h);
  }

  // the crack's star and slivers (Sprite Fusion's impact recipe, as in the source)
  const SPIKES = [0, 0.8, 1.6, 2.4, 3.14, 3.9, 4.7, 5.5].map((a, i) => ({
    a: a + R.range(-0.14, 0.14), len: (i === 0 ? 6.5 : i % 2 ? 3.2 : 4.4) + R.range(0, 1.4), w: 1.1 + R.range(0, 0.4),
  }));
  const SLIVER = [-1.2, -0.3, 0.5, 1.3].map((a) => ({
    a: a + R.range(-0.2, 0.2), r: R.range(3.5, 5.5), v: R.range(55, 95), arc: R.range(0.5, 0.8),
  }));
  // sparks and dust off the pop
  const SPARK = [];
  for (let i = 0; i < 12; i++) {
    const a = R.range(-1.4, 1.4) + aim, sp = R.range(70, 170);
    SPARK.push({
      t0: CRACK + R.range(0, 0.02), life: R.range(0.12, 0.3),
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - R.range(10, 60),
      c: R.pick([WHITE, C[6], C[5]]),
    });
  }
  const DUST = [];
  for (let i = 0; i < 5; i++) {
    const b = R.range(0, TAU), t0 = CRACK + 0.01 + R.range(0, 0.05);
    DUST.push({
      u: REACH + Math.cos(b) * R.range(0, 3), v: Math.sin(b) * R.range(0, 3), h: 0.4,
      du: Math.cos(b), dv: Math.sin(b) * 0.7, sp: R.range(10, 26), rise: R.range(0.8, 2.2),
      r0: R.range(1.5, 2.4), r1: R.range(3, 5), t0, life: Math.min(R.range(0.26, 0.4), D - 0.03 - t0),
      a: R.range(0.08, 0.12), c: R.pick([C[2], C[3], C[1]]),
    });
  }
  // the scuff scratched into the floor at the strike
  const SCUFF = [];
  for (let i = 0; i < 10; i++) {
    const b = R.range(0, TAU), rr = R.range(0, 1) ** 0.7;
    SCUFF.push({ u: REACH + Math.cos(b) * rr * 7, v: Math.sin(b) * rr * 3.2, c: R.pick([C[1], C[2], C[3]]), r: R.range(0.6, 1.4) });
  }

  let T = 0, backT = -1e9;

  // the lash: a taut curve, hot toward the tip, its kink lit, then pulled back and dotted out after the crack
  function lash(p, t) {
    const rec = smooth(CRACK + 0.02, CRACK + 0.02 + RECOIL, t);
    const fade = 1 - smooth(CRACK + RECOIL - 0.02, CRACK + RECOIL + 0.07, t);
    if (fade <= 0) return;
    const e = REACH - (REACH - 11) * rec, step = 1 + 2.8 * rec;
    const near = t > CRACK - 0.07 ? 1 - clamp((CRACK - t) / 0.07) : 0;
    let prev = null, prevS = 0;
    for (let s = 0; s <= e + 0.01; s += step) {
      const f = clamp(s / Math.max(1, e)), [x, y] = pt(Math.min(s, e), t);
      // it sags as it's pulled back in
      const yy = y + 7 * rec * Math.sin(Math.PI * f);
      if (prev) {
        const hot = f > 0.86 && near > 0.05;
        const col = hot ? WHITE : f < 0.3 ? C[3] : f < 0.62 ? C[4] : f < 0.88 ? C[5] : C[6];
        p.line(prev[0], prev[1], x, yy, col, fade);
        // the leather's shadow side, so the lash has a thickness
        p.line(prev[0], prev[1] + 1, x, yy + 1, f < 0.4 ? C[1] : C[2], fade * 0.75);
        if (prevS < 0.02) p.px(prev[0], prev[1], WHITE);
      }
      prev = [x, yy]; prevS = f;
    }
    // the kink shines while it runs
    if (t < CRACK) {
      const e2 = ext(t), ph = ease.inQuad(phase(t)), ks = e2 * (0.3 + 0.66 * ph);
      const [kx, ky] = pt(ks, t);
      p.glow(kx, ky, 5, C[5], 0.28 * (1 - ph * 0.5));
    }
    // afterimages a beat and two beats back: the lash's motion
    if (t < CRACK) {
      for (const [lag, c, a] of [[0.03, C[2], 0.4], [0.015, C[3], 0.55]]) {
        const tt = Math.max(ROLL0, t - lag), ee = ext(tt);
        let pp = null;
        for (let s = 0; s <= ee; s += 2.5) {
          const q = pt(s, tt);
          if (pp) p.line(pp[0], pp[1], q[0], q[1], c, a * fade);
          pp = q;
        }
      }
    }
  }
  // the tip's own streak just before the pop: it is moving fastest
  function tipStreak(p, t) {
    if (t >= CRACK || t < CRACK - 0.075) return;
    let prev = pt(ext(t), t);
    for (let lag = 0.008; lag <= 0.034; lag += 0.008) {
      const tt = Math.max(ROLL0, t - lag), q = pt(ext(tt), tt);
      const k = 1 - lag / 0.04;
      p.line(prev[0], prev[1], q[0], q[1], k > 0.5 ? WHITE : C[6], k);
      prev = q;
    }
  }
  // the pop: a hard little star, then its light
  function pop(p, t) {
    const q = t - CRACK;
    if (q < 0 || q > 0.2) return;
    if (q < 0.035) star(p, TX, TY, SPIKES, 1, 1, WHITE, C[5], C[6], C[4]);
    else if (q < 0.075) {
      const k = (q - 0.035) / 0.04;
      star(p, TX, TY, SPIKES, 1 + 0.4 * ease.outCubic(k), 0.55 * (1 - k) + 0.14, C[6], C[5], C[5], C[3]);
    }
    if (q < 0.14) {
      p.glow(TX, TY, 12, C[5], 0.4 * Math.exp(-q / 0.045));
      p.glow(TX, TY, 5, WHITE, 0.45 * Math.exp(-q / 0.03));
    }
    if (q > 0.012 && q < 0.14) {
      const k = (q - 0.012) / 0.128;
      for (const s of SLIVER) sliver(p, TX, TY, s.a, s.r + s.v * (q - 0.012), s.arc * (1 - 0.4 * k), k < 0.4 ? WHITE : C[5], 1 - k);
    }
  }
  // the ring of air opening out 2:1 on the floor under the pop
  function ring(p, t, back) {
    if (back !== TZ < 0) return;
    const rk = (t - CRACK - 0.005) / 0.19;
    if (rk <= 0 || rk >= 1) return;
    bandFloor(p, FX, FY, 2 + 11 * ease.outCubic(rk), Math.max(0.9, 2.2 * (1 - rk)), 0.5 * (1 - rk) * (1 - rk), [C[6], C[5], C[4], C[3]], () => true);
  }
  // the scuff at the strike, and the dust it throws
  function scuff(p, t, back) {
    if (back !== TZ < 0) return;
    const age = t - CRACK;
    if (age < 0 || age > 0.34) return;
    const k = 1 - age / 0.34, f = 1 - smooth(0.14, 0.34, age);
    for (const d of SCUFF) {
      const [x, y] = P(d.u, d.v, 0);
      p.dot(x, y, d.c, 0.55 * k * f);
    }
    // two scratches along the aim
    for (let i = -2; i <= 4; i++) {
      const [x, y] = P(REACH + i, i % 2 ? 0.6 : -0.6, 0);
      p.dot(x, y, C[1], 0.4 * k * f);
    }
  }
  // a spark: screen-space ballistic, dying on the floor at the strike's depth
  function spray(p, q, t) {
    const age = t - q.t0;
    if (age < 0 || age >= q.life) return;
    const u = age / q.life, k = 1 - u;
    const x = TX + q.vx * age, y = TY + q.vy * age + 0.5 * 540 * age * age;
    const floorY = TZ * FL;
    const vx = q.vx, vy = q.vy + 540 * age, l = Math.hypot(vx, vy) || 1, len = Math.min(4, 1 + l * 0.02);
    if (y >= floorY) { if (y < 27) p.dot(x, floorY, C[4], 0.45 * k); return; }
    if (y > 27) return;
    p.px(x, y, u < 0.35 ? WHITE : q.c);
    p.dot(x - (vx / l) * len, y - (vy / l) * len, C[4], 0.5 * k);
  }
  function puff(p, d, t, back) {
    const age = t - d.t0;
    if (age < 0 || age > d.life) return;
    const tt = Math.min(age, d.life), e = Math.exp(-2.4 * tt), dist = (d.sp * (1 - e)) / 2.4;
    const u = d.u + d.du * dist, v = d.v + d.dv * dist * 0.7;
    if (back !== dep(u, v) < 0) return;
    const h = d.h + (d.rise * (1 - Math.exp(-1.2 * tt))) / 1.2 + 0.5 * tt;
    const [x, y] = P(u, v, h);
    if (y > 27) return;
    const k = age / d.life, r = d.r0 + d.r1 * ease.outCubic(clamp(age / 0.12));
    const a = Math.min(0.3, d.a * Math.pow(1 - k, 1.5) * clamp(age / 0.03) * 1.6);
    if (a > 0.01) p.disc(x, y, r, d.c, a);
  }

  function behind(p, t) {
    ring(p, t, true);
    scuff(p, t, true);
    for (const d of DUST) puff(p, d, t, true);
  }
  function front(p, t) {
    lash(p, t);
    tipStreak(p, t);
    pop(p, t);
    ring(p, t, false);
    scuff(p, t, false);
    for (const d of DUST) puff(p, d, t, false);
    for (const q of SPARK) spray(p, q, t);
    // the hand keeps a little light through the lash
    if (t < CRACK + 0.06) p.glow(HX, HY, 4, C[4], 0.16 * (1 - clamp(t / (CRACK + 0.06))));
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
