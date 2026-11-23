// Soul drain for the game's 2:1 isometric camera: shadow/soul-drain rewritten for the floor the game sees.
// The source funnels pale souls down a crystal vessel in the screen plane. On the iso floor the vessel becomes
// a well in the ground at the aim point, and the drain happens in the round:
//   - the well is a hole lying 2:1 on the floor: its far inner wall catches the violet light (that is what makes
//     it read as depth, not as a dark disc), its mouth stays black and unlight() keeps every glow out of it;
//   - the souls are torn from all round the well and from the air above it, then spiral inward and down, so each
//     wisp is a short moving trail in 3-D: its depth squashes on screen, its height does not;
//   - the floor is being pulled in too: short streaks run inward along the ground while each sip pushes a violet
//     ring back out, so the two motions read against each other;
//   - the ground round the well darkens as it drains and lightens again as the well closes.
// 1 px = 1 character sprite px (32 x 16 px floor tiles). The hero is 38 px tall.
import { Rng, fit, clamp, smooth, mix, TAU, WHITE } from "../../core/index.js";
import { ringNoise } from "../_iso.js";
import { VOID, unlight } from "./_lib.js";

export const meta = {
  name: "Soul drain (iso)",
  desc: "soul-drain on the 2:1 floor: a dark well swallows the light, pale wisps torn from around and above spiral down into it, streaks pull in, a violet ring pulses out with each sip.",
  tags: ["shadow", "drain", "soul", "void", "well", "spiral", "one-shot", "iso", "top-down", "ground"],
  size: [208, 196],
  origin: [104, 144],
  duration: 1.6,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: VOID, aim: 0, seed: 9 },
};

const FL = 0.5;       // the floor's 2:1: a point z deep on the floor sits z / 2 down the screen
const REACH = 52;     // the well's centre, this far along the aim from the caster's feet
const RW = 16;        // the well's mouth, floor radius (2:1 on screen)
const D = 1.6;

// a ring lying flat on the floor, drawn as SOLID pixels: no dithered alpha, so no halftone. `col(d, ang)` is
// called for every pixel of the 2:1 annulus and may return 0 to leave the floor showing through.
function annulus(p, cx, cy, r, w, col) {
  const rr = Math.max(1.2, r), d0 = Math.max(0, 1 - Math.max(1, w) / rr);
  p.ellipse(cx, cy, rr, rr * FL, (d, ang) => (d > d0 ? col(d, ang) : 0), 1);
}

export function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed ?? 9);
  const aim = o.aim ?? 0, ax = Math.cos(aim), az = Math.sin(aim);
  const FX = ax * REACH, FY = az * REACH * FL;       // the mouth's centre on the floor, in screen space

  // --- the sips: each one rings out across the floor, harder when the well has just taken a soul --------------
  const SIPS = [
    { t: 0.2, k: 1.0 }, { t: 0.5, k: 0.8 }, { t: 0.78, k: 1.15 }, { t: 1.06, k: 0.9 },
  ];

  // --- the wisps: from the floor round the well and from the air above it, all spiralling in and down ---------
  const WISPS = Array.from({ length: 20 }, (_, i) => {
    const air = i % 3 === 0;
    return {
      a0: R.range(0, TAU), r0: air ? R.range(8, 26) : R.range(20, 42), h0: air ? R.range(36, 58) : R.range(3, 11),
      spin: R.range(1.5, 2.8) * (R.chance(0.5) ? 1 : -1), t0: R.range(0.05, 1.12), dur: R.range(0.34, 0.58),
      bob: R.range(0, TAU), air,
    };
  });

  // --- the streaks the floor is pulled in along, and the cracks it opens at the rim ---------------------------
  const STREAKS = Array.from({ length: 14 }, () => ({
    a: R.range(0, TAU), r0: R.range(26, 44), t0: R.range(0, 0.7), dur: R.range(0.5, 0.85), len: R.int(3, 6),
  }));
  const RIM = Array.from({ length: 26 }, (_, i) => ({ a: (i / 26) * TAU + R.range(-0.05, 0.05), e: R.range(0.94, 1.16) }));

  let t = 0;

  // --- one wisp, at the point of its spiral its age puts it ---------------------------------------------------
  function wispAt(q, u) {
    const r = 2.6 + (q.r0 - 2.6) * Math.pow(1 - u, 0.9);
    const a = q.a0 + q.spin * Math.pow(u, 0.8);
    const h = q.h0 * Math.pow(1 - u, 1.3) + (q.air ? 0 : 5 * Math.sin(Math.PI * u) * Math.sin(q.bob));
    return { r, a, h, x: FX + Math.cos(a) * r, y: FY + Math.sin(a) * r * FL - h };
  }

  function wisps(p) {
    for (const q of WISPS) {
      const age = t - q.t0;
      if (age <= 0 || age >= q.dur) continue;
      const u = age / q.dur;
      const al = smooth(0, 0.12, u) * (1 - smooth(0.8, 0.98, u));
      if (al <= 0.02) continue;
      const head = wispAt(q, u), mid = wispAt(q, Math.max(0, u - 0.07)), tail = wispAt(q, Math.max(0, u - 0.14)), end = wispAt(q, Math.max(0, u - 0.22));
      // the tear: the moment it is pulled off the floor, or out of the air
      if (u < 0.1) p.px(q.air ? tail.x : head.x, q.air ? tail.y : FY + Math.sin(tail.a) * tail.r * FL, C[7]);
      // the body of the wisp: one curved ribbon of light in three solid steps, so the spiral is a spiral
      const p1 = mid, p2 = tail, p3 = end;
      p.line(p3.x, p3.y, p2.x, p2.y, C[4], 1);
      p.line(p2.x, p2.y, p1.x, p1.y, C[5], 1);
      p.line(p1.x, p1.y, head.x, head.y, C[6], 1);
      p.light(head.x, head.y, C[5], 0.22 + 0.2 * u);
      p.px(head.x, head.y, C[7]);
      p.px(head.x, head.y - 1, C[7]);
      p.px(head.x + 1, head.y - 1, C[6]);
      p.px(mid.x, mid.y - 1, C[6]);
      p.px(tail.x, tail.y, C[5]);
      // it goes out as it goes down: a last violet glint on the lip
      if (u > 0.9) p.px(FX + Math.cos(q.a0) * RW * 0.8, FY + Math.sin(q.a0) * RW * 0.8 * FL, C[6]);
    }
  }

  // --- the floor: the drained dark, the streaks into it, the rings out of it ----------------------------------
  function floor(p) {
    const grow = smooth(0.04, 0.3, t), fade = 1 - smooth(1.38, 1.56, t);
    if (fade <= 0) return;
    // the ground round the well darkens as it drains: a ragged soot patch, denser at the mouth
    const dr = 22 + 16 * grow;
    p.shade(FX - dr - 2, FY - dr * FL - 2, FX + dr + 2, FY + dr * FL + 2, (x, y) => {
      const dx = x + 0.5 - FX, dy = (y + 0.5 - FY) / FL, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const e = dr * (0.86 + 0.14 * ringNoise(a, 3.8, 31));
      if (d > e) return;
      return d > e * 0.74 ? mix(C[0], C[1], 0.55) : d > e * 0.4 ? C[0] : mix(C[0], C[1], 0.3);
    });
    p.glow(FX, FY, dr * 0.7, C[3], 0.1 * fade * grow);
    // streaks running inward along the ground
    for (const q of STREAKS) {
      const age = t - q.t0;
      if (age < 0) continue;
      const u = (age / q.dur) % 1;
      const r = q.r0 - (q.r0 - RW - 1) * u;
      if (r < RW + 1) continue;
      const ca = Math.cos(q.a), sa = Math.sin(q.a) * FL, m = Math.hypot(ca, sa) || 1, ux = ca / m, uy = sa / m;
      const lead = u < 0.55 ? C[5] : C[4];
      for (let i = 0; i < q.len; i++) {
        const rr = r + i * 1.7;
        if (rr > q.r0 + 1) break;
        p.px(FX + ux * rr, FY + uy * rr, i === 0 ? lead : i < 2 ? C[4] : C[3]);
      }
    }
    // each sip rings out: a violet band racing away from the mouth, thinning as it goes
    for (const s of SIPS) {
      const age = t - s.t;
      if (age < 0) continue;
      const k = age / 0.46;
      if (k >= 1) continue;
      const rr = RW * 0.55 + 22 * Math.sqrt(k), th = Math.max(2, 1.8 * (1 - k) + 0.9);
      const col = k < 0.3 ? C[5] : k < 0.6 ? C[4] : C[3], dim = k < 0.3 ? C[4] : k < 0.6 ? C[3] : C[2];
      annulus(p, FX, FY, rr, th, (d) => (d > 0.995 - Math.min(1.2, th) / rr ? col : dim));
    }
  }

  // --- the well: a hole with a lit far wall, a black mouth, a violet lip --------------------------------------
  function well(p) {
    const grow = smooth(0.02, 0.16, t), fade = 1 - smooth(1.3, 1.52, t);
    if (fade <= 0) return;
    const open = grow * (1 - smooth(1.24, 1.46, t));
    const rx = RW * (0.6 + 0.4 * open), ry = rx * FL;
    if (rx < 2) return;

    // the mouth: the far inner wall catches the light, the depth falls away to black
    p.shade(FX - rx - 3, FY - ry - 3, FX + rx + 3, FY + ry + 3, (x, y) => {
      const dx = x + 0.5 - FX, dy = (y + 0.5 - FY) / FL, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const e = rx * (0.92 + 0.1 * ringNoise(a, 3.2, 13)), u = d / e;
      if (u > 1.05) return;
      // the lip line: a dim violet edge on the near side, a lit one round the far side
      if (u > 0.99) return Math.sin(a) < 0 ? C[5] : C[2];
      // the far wall: brightest where it meets the far lip, sinking to black toward the mouth
      const wall = clamp((u - 0.55) / 0.45) * clamp(-Math.sin(a) * 1.35);
      if (wall > 0.02) return mix(C[0], C[5], wall * (0.4 + 0.6 * open) * fade);
      // the near inner wall, in shadow, and the throat below
      return u > 0.86 ? C[1] : C[0];
    });
    // the mouth: pure black, and it does not let the glows through
    unlight(p, FX - rx - 3, FY - ry - 4, FX + rx + 3, FY + ry + 3, (x, y) => {
      const dx = x + 0.5 - FX, dy = (y + 0.5 - FY) / FL;
      return Math.hypot(dx, dy) < rx * 0.92;
    }, 0);
    // the lip of the hole: a violet line round it, doubling when a sip lands
    if (open > 0.1) {
      annulus(p, FX, FY, rx * 0.985, 1.7, (d) => (d > 0.99 - 1.4 / (rx * 0.985) ? C[4] : C[3]));
      p.glow(FX, FY - 2, rx * 0.8, C[4], 0.13 * open * fade);
    }
    // the violet heart at the bottom of the throat, pulsing when a sip lands
    const beat = 0.7 + 0.3 * Math.sin(t * 10.5);
    const heart = (0.55 + 0.45 * open) * fade * beat;
    if (heart > 0.45) p.px(FX, FY - ry * 0.55, C[4]);
    if (heart > 0.7) p.px(FX + 1, FY - ry * 0.55 + 1, C[3]);
    if (heart > 0.5) p.light(FX, FY - ry * 0.55, C[4], 0.4 * heart);
    // the rim cracks: the stone breaking as the ground gives way
    for (const q of RIM) {
      const e = rx * q.e, age = t - 0.06;
      if (age < 0) continue;
      const a = clamp(age / 0.5), l = (1 + 2.4 * a) * (1 - smooth(0.66, 1, a));
      if (l < 0.6) continue;
      p.line(FX + Math.cos(q.a) * e, FY + Math.sin(q.a) * e * FL,
        FX + Math.cos(q.a) * (e + l), FY + Math.sin(q.a) * (e + l) * FL, (v) => (v < 0.55 ? C[2] : C[1]), 1);
    }
  }

  return {
    update(dt) {
      t += dt;
    },
    draw(p) {
      if (t >= D - 1e-6) return;
      floor(p);
      well(p);
      wisps(p);
      // the well's light in the air above it: a thin violet haze that thickens with every sip
      const haze = 0.1 + 0.06 * Math.sin(t * 6.5) - 0.06 * smooth(1.2, 1.5, t);
      if (haze > 0) p.glow(FX, FY - 14, 20, C[3], haze * (1 - smooth(1.32, 1.56, t)));
    },
  };
}
