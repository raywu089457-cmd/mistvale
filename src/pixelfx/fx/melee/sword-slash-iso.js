// Sword slash, rewritten for the game's 2:1 isometric camera. The source swept a big crescent round the hero's
// whole body; this one cuts across his front: one tilted crescent whips through the air at chest height, white-hot
// at the leading edge and cooling to steel blue behind it, with a 1 px glint on the tip and a dotted trail where it
// passed. The crescent is drawn in the plane he faces -sideways on it stands up tall, facing the camera it lies
// down into a wide slash -and everything is squeezed the way the 2:1 camera squeezes a swing: full width to his
// sides, half of it toward the viewer. Shavings and sparks are thrown off the edge in three dimensions, fall and
// land on the floor at their own depth; the floor takes a faint scuff, a little light and a lift of dust.
import { Rng, fit, clamp, smooth, ease, WHITE, sparkle } from "../../core/index.js";
import { FLOOR, bandFloor } from "../_iso.js";

export const meta = {
  name: "Sword slash (iso)",
  desc: "A sword cut across the hero's front: a tilted crescent, white-hot edge cooling to steel blue, a tip glint, a dotted trail, sparks and shavings thrown in three dimensions, dust.",
  tags: ["melee", "slash", "sword", "combat", "directional", "one-shot", "iso", "top-down", "ground"],
  size: [200, 180],
  origin: [100, 150],
  duration: 0.66,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  actor: 2,
  options: {
    palette: ["#212f6b", "#2c58aa", "#3a8bd8", "#62c8f4", "#b8c9e8", "#e8f1ff", "#ffffff"],
    sparks: ["#fff3a6", "#ffe26b", "#ff8a2a", "#f2561d"],
    aim: 0,
    seed: 2,
  },
};

// The cut: centred at chest height, a hand's width in front of the feet. Sideways on, the reach runs out on the
// screen; facing the camera it foreshortens to half, and the width runs out on the screen instead.
const HC = 21;        // chest height of the cut, px above the floor
const FWD = 3;        // how far in front of the feet the cut's centre sits
const REACH = 20;     // how far ahead the cut reaches, seen from the side
const REACH2 = 13.5;  // ... and seen face on (the camera looks down on it, so it foreshortens)
const WIDE = 11.5;    // half its width seen from the side
const WIDE2 = 20;     // ... and seen face on
const BOOST = 0.55;   // how much of the forward reach rides up instead of down: keeps the cut at chest height
const ROLL = -0.2;    // the crescent's tilt
const SPAN = 3.0;     // how much of a turn the cut sweeps
const THICK = 8.5;    // how wide the smear is behind the edge
const ZR = 21;        // radius the sweep would have if it were a level circle: only tells us near from far

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function create(o) {
  const C = fit(o.palette, 7), S = fit(o.sparks, 4), R = new Rng(o.seed ?? 2), aim = o.aim ?? 0;
  const FL = FLOOR, A = aim;
  const ca = Math.cos(A), sa = Math.sin(A);
  const rf = REACH2 + (REACH - REACH2) * Math.abs(ca);   // forward reach, on the screen
  const rl = WIDE + (WIDE2 - WIDE) * Math.abs(sa);       // lateral reach, on the screen
  const ang = Math.atan2(sa * FL, ca);                    // where the aim points, on the screen
  const ux = Math.cos(ang), uy = Math.sin(ang);           // forward, on the screen
  const vx = -uy, vy = ux;                                // sideways, on the screen
  const cx = ca * FWD, cy = sa * FL * FWD - HC - Math.max(0, sa) * 8.5;   // the cut's centre, at chest height
  // face on, the cut foreshortens hard: let more of its reach ride up so it keeps a curve
  const boost = BOOST - 0.25 * Math.abs(sa);
  const cr = Math.cos(ROLL), sr = Math.sin(ROLL), lat = rl / rf;

  // a point on the cut: beta along it (0 = through the middle of the arc), r out from its centre
  const at = (beta, r) => {
    const k = Math.cos(beta), j = Math.sin(beta);
    const dx = r * k * ux + lat * r * j * vx;
    const dy = r * k * uy + lat * r * j * vy - boost * uy * r * k;
    return { x: cx + dx * cr - dy * sr, y: cy + dx * sr + dy * cr, z: Math.sin(A + beta) * ZR };
  };

  // the cut itself and the fainter echo that chases it a hair behind
  const A1 = { R: rf, W: THICK, span: SPAN, sweep: 0.075, hold: 0.05, trail: 0.28, ramp: C };
  const E1 = { R: rf - 3, W: THICK * 0.5, span: SPAN * 0.86, t0: 0.03, sweep: 0.06, hold: 0.03, trail: 0.2, ramp: C.slice(1) };

  // shavings and sparks: born on the edge, thrown out along it and upward, falling to the floor at their own depth
  const fliers = [];
  for (let i = 0; i < 21; i++) {
    const spark = i < 13;
    const u = SPAN * R.range(0.32, 1), beta = u - A1.span / 2;
    const e = at(beta, rf - R.range(0.5, THICK * 0.9));
    const th = A + beta + R.range(-0.45, 0.45), tgx = -Math.sin(th), tgz = Math.cos(th);
    const sp = R.range(10, 45), out = R.range(10, 40), vh = R.range(25, 85), g = R.range(620, 800);
    const ahead = R.range(4, 22);
    const vx0 = tgx * sp * 0.45 + Math.cos(th) * out + ca * ahead;
    const vz0 = tgz * sp * 0.45 + Math.sin(th) * out + sa * ahead;
    const h0 = Math.max(3, e.z * FL - e.y);
    const tl = (vh + Math.sqrt(vh * vh + 2 * g * h0)) / g, vhl = vh - g * tl;
    fliers.push({
      spark, x0: e.x, z0: e.z, h0, vx: vx0, vz: vz0, vh, g, tl,
      lx: e.x + vx0 * tl, lz: e.z + vz0 * tl, hop: Math.max(0, -vhl * 0.3),
      tb: 0.02 + (u / SPAN) * 0.05 + R.range(0, 0.015),
      life: Math.min(tl + R.range(0.14, 0.26), 0.6),
      c: spark ? S[3] : C[6], c2: spark ? S[1] : C[4],
    });
  }
  // the scuff the cut leaves on the 2:1 floor, and the dust it lifts off it
  const scuff = [];
  for (let i = 0; i < 54; i++) {
    const a = A + R.range(-1.2, 1.2), d = R.range(4, 21);
    scuff.push({ x: Math.cos(a) * d, y: Math.sin(a) * d * FL, t0: R.range(0, 0.05), k: R.range(0.1, 0.3), c: C[R.int(2, 4)] });
  }
  const dust = [];
  for (let i = 0; i < 14; i++) {
    const a = A + R.range(-0.9, 0.9), d = R.range(3, 15);
    dust.push({ x: Math.cos(a) * d, y: Math.sin(a) * d * FL, z: Math.sin(a) * d, t0: R.range(0.01, 0.1), life: R.range(0.26, 0.48), r: R.range(1.1, 2.4) });
  }

  let t = 0, backT = -1e9;

  // the crescent: the edge whips out, holds, then the tail chases it; rim hot, belly cooling back into steel
  function arc(p, s, back) {
    const u0 = t - (s.t0 ?? 0);
    if (u0 < 0) return;
    const n = s.ramp.length, life = s.sweep + s.hold + s.trail;
    const head = ease.outExpo(clamp(u0 / s.sweep)), tail = smooth(s.sweep + s.hold, life, u0);
    const U = s.span * head, T = s.span * tail, fade = 1 - smooth(0.4, 0.63, t);
    if (fade <= 0) return;
    const beta = (u) => u - s.span / 2;
    if (tail < 1 && U - T > 0.004) {
      const steps = Math.max(12, Math.ceil((U - T) * 16));
      for (let i = 0; i <= steps; i++) {
        const uu = T + ((U - T) * i) / steps, v = (uu - T) / (U - T);
        const w = s.W * (0.22 + 0.78 * Math.pow(Math.sin(Math.PI * Math.pow(v, 2.2)), 0.6)) * (1 - tail * 0.55);
        if (w < 0.35) continue;
        const heat = clamp(1 - (U - uu) / 1.7 - v * 0.05), al = Math.min(1, v / 0.3) * fade;
        for (let dr = 0; dr <= w; dr += 0.5) {
          const q = dr / w, e = at(beta(uu), s.R - dr);
          if (back !== e.z < 0) continue;
          const far = e.z < 0 ? 0.72 : 1, hh = clamp(heat - q * 0.55);
          if (dr < 1.3 && hh > 0.2) p.px(e.x, e.y, hh > 0.5 ? WHITE : s.ramp[5]);
          else p.dot(e.x, e.y, s.ramp[clamp(1 + Math.round(hh * 5), 1, n - 1)], al * far * (0.65 + 0.35 * hh));
        }
      }
      // light riding the hot edge
      const b0 = beta(Math.max(T, U - 0.9)), g0 = Math.max(2, Math.ceil((U - Math.max(T, U - 0.9)) / 0.22));
      for (let i = 0; i <= g0; i++) {
        const e = at(b0 + (i / g0) * (beta(U) - b0), s.R - s.W * 0.45);
        if (back !== e.z < 0) continue;
        p.glow(e.x, e.y, 5, s.ramp[3], 0.3 * fade * (0.3 + 0.7 * (i / g0)));
      }
    }
    // the dotted trail where the edge has already been
    const th = 0.75 * (1 - clamp((u0 - s.sweep - s.hold) / (s.trail + 0.26))) * fade;
    if (tail > 0.02 && th > 0.01) {
      const step = Math.max(0.06, 1.3 / s.R);
      for (let uu = 0; uu <= T; uu += step) {
        const e = at(beta(uu), s.R + 0.5);
        if (back !== e.z < 0) continue;
        p.dot(e.x, e.y, s.ramp[2], th * (0.35 + 0.65 * uu / s.span) * (e.z < 0 ? 0.55 : 1));
      }
    }
  }

  // the tiny glint the edge throws as it reaches full stretch
  function glint(p, back) {
    const g = t - A1.sweep * 0.72;
    if (g < 0 || g > 0.18) return;
    const e = at(SPAN / 2 * ease.outExpo(clamp(t / A1.sweep)), rf - 0.6);
    if (back !== e.z < 0) return;
    sparkle(p, e.x, e.y, 6 * ease.outBack(clamp(g / 0.09)), C[6], C[3], 0.5 * (1 - g / 0.18));
  }

  // thrown debris, closed form: off the edge, through the air, off the floor once, then lying there
  function flier(p, q, back) {
    const age = t - q.tb;
    if (age < 0 || age > q.life) return;
    const air = Math.min(age, q.tl), h = q.h0 + q.vh * air - 0.5 * q.g * air * air;
    const x = q.x0 + q.vx * air, z = q.z0 + q.vz * air;
    const sy = z * FL - h;
    if (back !== z < 0) return;
    const u = age / q.life;
    if (age < q.tl) {
      const vy = q.vz * FL - (q.vh - q.g * air), l = Math.hypot(q.vx, vy) || 1;
      const len = q.spark ? Math.min(5, 1 + l * 0.02) : 2.4;
      p.px(x, sy, u < 0.12 ? WHITE : q.spark && u < 0.5 ? S[0] : q.c);
      p.dot(x - (q.vx / l) * len, sy - (vy / l) * len, q.spark ? S[2] : q.c2, 0.6 * (1 - u * 0.8));
      if (u < 0.5) p.glow(x, sy, 3, q.spark ? S[1] : q.c, 0.3 * (1 - 2 * u));
      return;
    }
    const age2 = age - q.tl, h2 = q.hop * age2 - 0.5 * q.g * age2 * age2;
    if (h2 > 0) p.px(q.lx, q.lz * FL - h2, u < 0.6 ? q.c : q.c2);
    else p.dot(q.lx, q.lz * FL, q.spark ? S[2] : q.c2, 0.5 * (1 - u));
  }

  function puff(p, q) {
    const age = t - q.t0;
    if (age < 0 || age > q.life) return;
    const u = age / q.life;
    p.disc(q.x, q.y, q.r + age * 8, C[4], 0.26 * (1 - u) * (1 - u));
  }

  // slow fall of the dust to its own depth: a puff is a screen blob round a floor point
  function behind(p) {
    if (t > 0.03) {
      const f = 1 - smooth(0.34, 0.58, t);
      if (f > 0) {
        bandFloor(p, 0, 0, 9, 6, 0.16 * f, C, (g) => Math.abs(wrap(g - A)) < 1.2);
        bandFloor(p, 0, 0, 16, 3, 0.1 * f, C, (g) => Math.abs(wrap(g - A)) < 0.85);
      }
      for (const q of scuff) if (t >= q.t0) p.dot(q.x, q.y, q.c, q.k * f);
    }
    if (t > 0.02 && t < 0.46) p.glow(ca * 9, sa * 9 * FL, 10, C[3], 0.18 * (1 - t / 0.46));
    for (const q of dust) if (q.z < 0) puff(p, q);
    for (const q of fliers) flier(p, q, true);
  }

  return {
    update(dt) { t += dt; },
    drawBack(p) { behind(p); backT = t; },
    draw(p) {
      if (backT !== t) behind(p);
      backT = -1e9;
      arc(p, E1, false);
      arc(p, A1, false);
      glint(p, false);
      for (const q of dust) if (q.z >= 0) puff(p, q);
      for (const q of fliers) flier(p, q, false);
    },
  };
}
