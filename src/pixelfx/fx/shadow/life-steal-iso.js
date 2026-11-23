// Life steal for the game's 2:1 isometric camera: shadow/life-steal rewritten for the floor the game sees.
// The source is a side-view beam that pulls blood-red orbs out of a target back into the caster. On the iso
// floor the two ends are two points on the ground and the stolen life travels the line between them:
//   - the target's ground is the hero-sized patch at the end of o.aim; the tether runs back along -aim to the
//     caster's chest, sagging in the air a little, so it reads as a line between two bodies on one floor;
//   - the ground under the target darkens and cracks while it is being emptied, and the caster's end warms as
//     each wisp arrives, so the two ends of the same motion are both readable;
//   - the wisps themselves are comets in 3-D: their depth squashes on screen, their height does not, and each
//     one leaves the crimson flash at the target and dies into the warm glow at the caster.
// 1 px = 1 character sprite px (32 x 16 px floor tiles). The hero is 38 px tall.
import { Rng, fit, clamp, smooth, TAU } from "../../core/index.js";
import { ringNoise } from "../_iso.js";


export const meta = {
  name: "Life steal (iso)",
  desc: "life-steal in 2:1 iso: a crimson tether runs from the target back to the caster, its ground darkens, wisps fly home along it, a crimson flash leaves and a warm glow arrives.",
  tags: ["shadow", "drain", "blood", "lifesteal", "tether", "one-shot", "iso", "top-down", "ground"],
  size: [200, 144],
  origin: [100, 100],
  duration: 1.2,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: {
    palette: ["#14040a", "#3a0a14", "#6a101c", "#a01824", "#d42a30", "#ff5a50", "#ff9a8a", "#ffe6de"],
    aim: 0,
    seed: 12,
  },
};

const FL = 0.5;       // the floor's 2:1: a point z deep on the floor sits z / 2 down the screen
const REACH = 64;     // the target's floor point, this far along the aim from the caster's feet
const CHEST = 18;     // both chests are this far above the floor
const D = 1.2;

// a ring lying flat on the floor, drawn as SOLID pixels: no dithered alpha, so no halftone. `col(d, ang)` is
// called for every pixel of the 2:1 annulus and may return 0 to leave the floor showing through.
function annulus(p, cx, cy, r, w, col) {
  const rr = Math.max(1.2, r), d0 = Math.max(0, 1 - Math.max(1, w) / rr);
  p.ellipse(cx, cy, rr, rr * FL, (d, ang) => (d > d0 ? col(d, ang) : 0), 1);
}
// a puff of haze on the floor: a TRUE alpha blend per pixel (p.blendPx), never the ordered dither of p.dot
function softEllipse(p, cx, cy, rx, ry, c, a) {
  p.each(cx - rx, cy - ry, cx + rx, cy + ry, (lx, ly, sx, sy) => {
    const dx = (lx - cx) / rx, dy = (ly - cy) / ry, d2 = dx * dx + dy * dy;
    if (d2 >= 1) return;
    p.blendPx(sx, sy, c, a * (1 - Math.sqrt(d2)));
  });
}

export function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed ?? 12);
  const aim = o.aim ?? 0, ax = Math.cos(aim), az = Math.sin(aim);
  const FX = ax * REACH, FY = az * REACH * FL;       // the target's feet, in screen space
  const TX = FX, TY = FY - CHEST;                    // the target's chest (where the soul leaves)
  const CX = 0, CY = -CHEST;                         // the caster's chest (where it lands)
  // the tether: a quadratic that sags a little on the way, so it is a line through the air, not a rod
  const BX = (TX + CX) / 2, BY = (TY + CY) / 2 + 7;
  const bez = (s) => {
    const u = 1 - s;
    return [u * u * TX + 2 * u * s * BX + s * s * CX, u * u * TY + 2 * u * s * BY + s * s * CY];
  };

  // --- the wisps: they leave the target's chest and run the tether home, one after another --------------------
  const WISPS = Array.from({ length: 13 }, (_, i) => ({
    t0: 0.2 + (i / 13) * 0.6 + R.range(-0.04, 0.04), dur: R.range(0.26, 0.38), ph: R.range(0, TAU), off: R.range(-1.6, 1.6),
    big: i % 4 === 0,
  }));

  // --- the caster's welcome: motes climbing off the ground at the caster's feet as the stolen life arrives -----
  const HEAL = Array.from({ length: 8 }, () => ({
    x: R.range(-9, 9), z: R.range(-3, 3), t0: R.range(0.4, 0.98), life: R.range(0.16, 0.26), vh: R.range(18, 38), ph: R.range(0, TAU),
  }));

  // --- the drained ground: cracks opening under the target -------------------------------------------------------
  const CRACKS = Array.from({ length: 9 }, () => ({ a: R.range(0, TAU), l: R.range(5, 13), t0: R.range(0.08, 0.4) }));

  let t = 0;

  // --- the target's ground: dark, drained, cracked, with the blood's light in the cracks -----------------------
  function ground(p) {
    const grow = smooth(0.03, 0.24, t), fade = 1 - smooth(0.92, 1.14, t);
    if (fade <= 0) return;
    const rx = (5 + 13 * grow) * (0.35 + 0.65 * fade);
    // the patch darkens: a ragged hole in the stone, black-red at the heart
    p.shade(FX - rx - 2, FY - rx * FL - 2, FX + rx + 2, FY + rx * FL + 2, (x, y) => {
      const dx = x + 0.5 - FX, dy = (y + 0.5 - FY) / FL, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const e = rx * (0.84 + 0.18 * ringNoise(a, 3.4, 17));
      if (d > e) return;
      return d > e * 0.7 ? C[1] : C[0];
    });
    // cracks: the stone gives way, lit red from inside for a moment
    for (const q of CRACKS) {
      const age = t - q.t0;
      if (age < 0) continue;
      const k = clamp(age / 0.42);
      if (k >= 1) continue;
      const ca = Math.cos(q.a), sa = Math.sin(q.a) * FL, l = q.l * (0.55 + 0.45 * k) * (0.4 + 0.6 * fade);
      p.line(FX + ca * 3, FY + sa * 3, FX + ca * l, FY + sa * l, (u) => (u < 0.55 ? C[4] : C[2]), 1);
    }
    // a crimson rim round the drained patch, pulsing with the pull
    const beat = 0.7 + 0.3 * Math.sin(t * 13), hot = beat > 0.82;
    annulus(p, FX, FY, rx * 0.96, 1.8, (d) => (d > 0.99 - 2 / (rx * 0.96) ? (hot ? C[4] : C[3]) : C[2]));
    p.glow(FX, FY, rx * 0.8, C[3], 0.14 * grow * fade);
    // the last of it leaving: a violet-red haze off the ground under the flash
    p.glow(FX, FY - 10, 7 + 8 * grow, C[4], 0.2 * grow * fade * (1 - smooth(0.5, 0.9, t)));
  }

  // --- the tether: a thin two-tone line, flickering, with packets running down it ------------------------------
  function tether(p) {
    const on = smooth(0.05, 0.14, t) * (1 - smooth(0.98, 1.12, t));
    if (on <= 0.02) return;
    const N = 44;
    let px = 0, py = 0;
    for (let i = 0; i <= N; i++) {
      const s = i / N, [x, y] = bez(s);
      const wob = Math.sin(s * 11 - t * 13) * 0.9 * Math.sin(Math.PI * s);
      const xx = x + wob * 0.6, yy = y + wob;
      if (i > 0) {
        p.line(px, py + 1, xx, yy + 1, C[2], 1);
        p.line(px, py, xx, yy, C[3], 1);
      }
      px = xx; py = yy;
    }
    // the bright edge on the upper side, so it reads as a cord with thickness
    for (let i = 0; i <= N; i += 2) {
      const s = i / N, [x, y] = bez(s);
      const wob = Math.sin(s * 11 - t * 13) * 0.9 * Math.sin(Math.PI * s);
      p.px(x + wob * 0.6, y + wob - 1, i % 4 ? C[4] : C[5]);
    }
    // packets of the pull running home along it
    for (let i = 0; i < 3; i++) {
      const s0 = 1 - ((t * 0.72 + i / 3) % 1);
      for (let j = 0; j < 5; j++) {
        const s = clamp(s0 - j * 0.022, 0, 1), [x, y] = bez(s);
        p.px(x, y - 1, j === 0 ? C[6] : j < 3 ? C[4] : C[3]);
      }
    }
  }

  // --- the flash where the soul leaves -------------------------------------------------------------------------
  function flash(p) {
    const age = t - 0.13;
    if (age < 0) return;
    const k = clamp(age / 0.26), f = Math.pow(1 - k, 1.5);
    if (f <= 0) return;
    const L = 4 + 16 * (1 - k);
    p.glow(TX, TY, 8 + 18 * (1 - k), C[4], 0.5 * f);
    p.disc(TX, TY, 1 + 5 * (1 - k), C[5], f);
    p.disc(TX, TY, 1 + 2.4 * (1 - k), C[7], Math.min(1, f * 1.4));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.4, len = i % 2 ? L * 0.55 : L;
      p.line(TX, TY, TX + Math.cos(a) * len, TY + Math.sin(a) * len * 0.8,
        (u) => (u < 0.4 ? C[7] : u < 0.75 ? C[5] : C[4]), 1);
    }
    const rr = 4 + 20 * (1 - Math.pow(1 - k, 2)), th = Math.max(2, 1.6 * (1 - k) + 0.8);
    annulus(p, FX, FY, rr, th, (d) => (d > 0.99 - Math.min(1.6, th) / rr ? (k < 0.4 ? C[5] : C[4]) : C[2]));
  }

  // --- the wisps: comets running the tether from target to caster ----------------------------------------------
  function wisps(p) {
    for (const q of WISPS) {
      const age = t - q.t0;
      if (age <= 0 || age >= q.dur) continue;
      const u = age / q.dur, s = 1 - u;              // s: 1 at the target's chest, 0 at the caster's
      if (u < 0.06 || u > 0.94) continue;
      const dot = q.big ? 1 : 0;
      // the comet: three points a little apart down the tether, plus the glow of the life it carries
      for (let j = 3; j >= 0; j--) {
        const ss = clamp(s + j * 0.032, 0, 1), [x, y] = bez(ss);
        const y2 = y + Math.sin(ss * 14 + q.ph) * q.off * 0.6;
        if (j === 0) {
          p.light(x, y2, C[5], 0.4 * (0.6 + 0.4 * (1 - u)));
          p.px(x, y2, C[7]);
          p.px(x, y2 - 1, C[7]);
          if (dot) p.px(x + 1, y2 - 1, C[6]);
          if (dot) p.px(x - 1, y2, C[6]);
        } else if (j === 1) {
          p.px(x, y2, C[6]);
          p.px(x, y2 - 1, C[5]);
        } else {
          p.px(x, y2, j === 2 ? C[5] : C[4]);
        }
      }
    }
  }

  // --- the warm glow at the caster's end: the stolen life arriving -------------------------------------------
  function welcome(p) {
    const age = t - 0.14;
    if (age < 0) return;
    const on = (1 - smooth(0.96, 1.14, t)) * smooth(0.14, 0.4, t);
    if (on <= 0) return;
    const beat = 0.75 + 0.25 * Math.sin(t * 14);
    // the glow grows as the first wisps arrive
    const g = 0.35 + 0.65 * smooth(0.32, 0.72, t);
    p.glow(CX, CY - 2, 17 + 9 * g, C[2], 0.3 * g * on * beat);
    p.glow(CX, CY - 2, 9 + 6 * g, C[3], 0.45 * g * on * beat);
    p.glow(CX, CY - 2, 4 + 3.5 * g, C[4], 0.4 * g * on);
    p.glow(CX, CY - 2, 1.6 + 2.2 * g, C[5], 0.35 * g * on * beat);
    p.disc(CX, CY - 2, 1.2 + 1.8 * g, C[6], 0.8 * g * on * beat);
    // short warm rays, so the glow reads as a heart receiving life (no hard halo: it would read as a sprite)
    for (let i = 0; i < 7; i++) {
      const a = i * (TAU / 7) + t * 1.4, len = (5 + 7 * g) * (i % 2 ? 0.6 : 1);
      p.px(CX + Math.cos(a) * len, CY - 2 + Math.sin(a) * len * 0.8, i % 2 ? C[3] : C[4]);
    }
    // the floor under the caster catches the warmth too
    softEllipse(p, CX, 0, 5 + 6 * g, (5 + 6 * g) * FL, C[2], 0.5 * g * on * beat);
    p.glow(CX, 0, 6 + 6 * g, C[3], 0.16 * g * on);
    // warm sparks lifting off the chest as each wisp lands
    for (let i = 0; i < 5; i++) {
      const a = t - 0.42 - i * 0.1;
      if (a < 0 || a > 0.22) continue;
      const k = a / 0.22, ang = i * 1.9 + a * 6;
      const x = CX + Math.cos(ang) * (3 + 4 * k), y = CY - 2 - 3 * k - Math.sin(ang) * 2;
      p.px(x, y, k < 0.4 ? C[5] : C[4]);
    }
    // healed motes climbing off the ground at the caster's feet
    for (const q of HEAL) {
      const a = t - q.t0;
      if (a < 0 || a > q.life) continue;
      const k = a / q.life;
      const x = CX + q.x + Math.sin(a * 9 + q.ph) * 3;
      const y = q.z * FL - q.vh * a - 2;
      if (y < CY + 2) continue;
      p.px(x, y, k < 0.5 ? C[5] : C[4]);
      if (k < 0.3) p.light(x, y, C[4], 0.12 * on);
    }
  }

  return {
    update(dt) {
      t += dt;
    },
    draw(p) {
      if (t >= D - 1e-6) return;
      ground(p);
      tether(p);
      flash(p);
      wisps(p);
      welcome(p);
      // the light the theft puts into the air between the two ends
      const air = 0.5 * smooth(0.16, 0.5, t) * (1 - smooth(0.9, 1.12, t));
      if (air > 0) {
        p.glow((TX + CX) / 2, (TY + CY) / 2 - 2, 26, C[2], 0.1 * air);
        p.glow(TX, TY, 12, C[3], 0.1 * air);
      }
    },
  };
}
