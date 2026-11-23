// Heavy cleave, rewritten for the game's 2:1 isometric camera: melee/heavy-cleave in the world the game sees,
// not the side view's picture squashed or stretched onto the floor.
//
// The recipe is the source's: the light gathering over the head, the ember crescent accelerating over the top
// and down into the floor ahead, the white slam, the star of the impact, the cracks breathing embers on the
// floor, the dust rolling out, the grit and rocks thrown up that bounce and settle, the embers rising, the same
// palette, the same beats, the same timing.
// What the camera changes:
//   - the swing is one vertical swath in the plane that holds the aim. Height stays height, so the crescent
//     stands up the screen as tall as in the side view and goes over the hero's head, then down into the floor
//     ~26 px ahead;
//   - the floor has depth: the slam lands on a 2:1 point ahead, the cracks radiate over the floor every way
//     round, the shock ring and the scorch are 2:1, and the light pools on the floor under the strike;
//   - everything thrown flies in 3-D (x across, z into the floor, h up): grit, rocks, embers and dust go out
//     every way round the strike, bounce, roll and settle at their own depth, never along a line;
//   - it leaves the way such a thing would: the crescent drains off its tail, the cracks cool from white-hot to
//     soot, the dust thins, the rocks stop bouncing and settle grain by grain. Nothing fades as a picture.
// 1 px = 1 character sprite px (32 x 16 px floor tiles). aim is a floor angle: 0 = screen right, PI/2 = down the
// screen toward the viewer.
import { Rng, fit, clamp, smooth, ease, TAU, WHITE, mix, hex } from "../../core/index.js";
import { FLOOR, bandFloor, floorShadow } from "../_iso.js";
import { stone, rock, sliver, along } from "./_lib.js";
import { soft } from "../fire/_lib.js";

export const meta = {
  name: "Heavy cleave (iso)",
  desc: "melee/heavy-cleave in 2:1 iso: a glint over the head, an ember arc over the top into the floor ahead, a white slam, cracks radiating, dust rolling out every way, embers rising.",
  tags: ["melee", "cleave", "axe", "heavy", "ground", "fire", "combat", "iso", "top-down", "one-shot", "directional"],
  size: [240, 200],
  origin: [120, 164],
  duration: 1.6,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: {
    palette: ["#2a0c10", "#5c1414", "#a3241a", "#e0481c", "#ff8a2a", "#ffc23d", "#fff0a0"],
    aim: 0,
    seed: 5,
  },
};

const D = meta.duration, FL = FLOOR, G = 470;
// the source's beats: raise (the light gathers), swing, hit, hold, trail out
const RAISE = 0.2, SWING = 0.135, HIT = RAISE + SWING, HOLD = 0.05, TRAIL = 0.22;
// the swing: ONE ellipse in the vertical plane that holds the aim -- radius RU across the floor, radius RV up.
// It starts high behind the head (A0), passes over the top, and meets the floor at A1, REACH px ahead.
const UC = 3, HC = 22, RU = 33.8, RV = 30, A0 = -2.45;
const A1 = Math.asin(HC / RV);            // where the blade reaches the floor
const U1 = A1 - A0;                        // how far it sweeps
const REACH = UC + RU * Math.cos(A1);      // ~26: the floor point ahead it lands on

/** A body thrown in the game's 3-D: drag on the floor, one bounce, then rest at its own depth. */
function toss(u, v, h, vu, vv, vh, drag = 1.1) {
  const disc = vh * vh + 2 * G * h, t1 = (vh + Math.sqrt(disc)) / G, vDown = Math.sqrt(disc);
  const vUp = vDown * 0.32, t2 = (2 * vUp) / G;
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
/** An ember: buoyant, dragging, wandering a little as it climbs. */
function emberAt(e, age) {
  const k = 1.6, e1 = Math.exp(-k * age), d = (1 - e1) / k;
  return [e.u + e.vu * d + 1.4 * Math.sin(age * 5.2 + e.ph), e.v + e.vv * d + 1.2 * Math.cos(age * 4.1 + e.ph * 1.7), e.h + e.vh * d + 4.5 * age];
}
/** A dust puff: rolls out and slows, and lifts as it thins. */
function puffAt(d, age) {
  const t = Math.min(age, d.life), k = d.drag, e = Math.exp(-k * t), dist = (d.sp * (1 - e)) / k;
  return [d.u + d.du * dist, d.v + d.dv * dist, d.h + (d.rise * (1 - Math.exp(-1.2 * t))) / 1.2 + 0.7 * t];
}

export function create(o) {
  const F = fit(o.palette, 7), n = F.length;
  const R = new Rng(o.seed ?? 5);
  const aim = o.aim ?? 0;
  const ax = Math.cos(aim), az = Math.sin(aim);
  const P = (u, v, h) => [u * ax - v * az, (u * az + v * ax) * FL - h];
  const [IX, IY] = P(REACH, 0, 0);
  const st = stone(hex("#4a3f69"));
  const BLACK = hex("#000000");
  const SOOT = mix(F[0], hex("#0d0b12"), 0.55);
  const SOOT2 = mix(SOOT, hex("#1d1712"), 0.5);
  // heat ramp, hottest first: white -> pale -> yellow -> orange -> red -> dark -> soot
  const HOT = [WHITE, F[6], F[5], F[4], F[3], F[2], F[1], mix(F[1], F[0], 0.5), F[0], SOOT];
  const heatAt = (h) => HOT[clamp(Math.floor((1 - clamp(h, 0, 1)) * (HOT.length - 1)), 0, HOT.length - 1)];
  const arc = (a, k, s) => [UC + (RU * k - s) * Math.cos(a), HC - (RV * k - s) * Math.sin(a)];
  const passedAt = (f) => RAISE + SWING * Math.sqrt(clamp(f));
  const lifeCap = (t0, want) => Math.max(0.06, Math.min(want, D - 0.04 - t0));

  // ---- the glint over the head: light gathering along the way the blade is about to come from ----
  const [gu, gh] = arc(A0, 1, 0);
  const [GX, GY] = P(gu, 0, gh);
  const MOTES = [];
  for (let i = 0; i < 9; i++) MOTES.push({ th: R.range(0, TAU), D: R.range(9, 22), dur: R.range(0.07, 0.13), arrive: RAISE - R.range(0, 0.05) });

  // ---- embers shed by the blade as it comes over the top (born where the blade passed, in 3-D) ----
  const EMBERS = [];
  for (let i = 0; i < 18; i++) {
    const f = R.range(0.1, 1), a = A0 + f * U1, [u, h] = arc(a, 1, R.range(0, 8));
    const du = -Math.sin(a) * RU, dh = -Math.cos(a) * RV, len = Math.hypot(du, dh) || 1, sp = R.range(20, 55), th2 = R.range(0, TAU);
    EMBERS.push({ t0: passedAt(f), u, v: 0, h, vu: (du / len) * sp + Math.cos(th2) * 8, vv: Math.sin(th2) * 8, vh: R.range(6, 26), life: R.range(0.5, 0.95), ph: R.range(0, TAU), big: R.chance(0.3) });
  }
  // embers off the impact
  for (let i = 0; i < 16; i++) {
    const th = R.range(0, TAU), sp = R.range(8, 34), t0 = HIT + R.range(0, 0.12);
    EMBERS.push({ t0, u: REACH + R.range(-2, 2), v: R.range(-2, 2), h: R.range(0.5, 2), vu: Math.cos(th) * sp, vv: Math.sin(th) * sp, vh: R.range(18, 46), life: lifeCap(t0, R.range(0.5, 1.0)), ph: R.range(0, TAU), big: false });
  }

  // ---- cracks: grown in the floor's own plane from the strike, then frozen into the screen ----
  const CRACKS = [];
  const addCrack = (ptsF) => {
    const pts = ptsF.map(([u, v]) => P(u, v, 0));
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    CRACKS.push({ pts, ptsF, L });
  };
  for (let i = 0; i < 12; i++) {
    const th = (i / 12) * TAU + R.range(-0.18, 0.18), reach = R.range(12, 32) * (i < 3 ? 1 : 0.78);
    let a = th, u = REACH + Math.cos(th) * 1.2, v = Math.sin(th) * 1.2, d = 0;
    const pts = [[u, v]];
    while (d < reach) {
      const stp = R.range(1.6, 3.4);
      a += R.range(-0.5, 0.5); u += Math.cos(a) * stp; v += Math.sin(a) * stp; d += stp;
      if ((u * az + v * ax) * FL > 31) break;   // the floor runs out of picture: cracks stop at the frame
      pts.push([u, v]);
      if (R.chance(0.2) && d > 5 && d < reach - 6) {
        let fa = a + R.sign() * R.range(0.5, 1.2), fu = u, fv = v;
        const fork = [[fu, fv]];
        for (let j = R.int(2, 4); j > 0; j--) {
          const s2 = R.range(1.4, 3); fa += R.range(-0.45, 0.45);
          fu += Math.cos(fa) * s2; fv += Math.sin(fa) * s2;
          if ((fu * az + fv * ax) * FL > 31) break;
          fork.push([fu, fv]);
        }
        addCrack(fork);
      }
    }
    addCrack(pts);
  }
  // embers out of the cracks while they are hot
  for (let i = 0; i < 12; i++) {
    const cr = R.pick(CRACKS), pf = cr.ptsF[Math.min(cr.ptsF.length - 1, R.int(1, Math.max(1, cr.ptsF.length - 1)))];
    const t0 = HIT + R.range(0.04, 0.9), th = R.range(0, TAU), sp = R.range(2, 10);
    EMBERS.push({ t0, u: pf[0], v: pf[1], h: R.range(0.3, 1.2), vu: Math.cos(th) * sp, vv: Math.sin(th) * sp, vh: R.range(8, 26), life: lifeCap(t0, R.range(0.4, 0.8)), ph: R.range(0, TAU), big: false });
  }

  // ---- dust (soft volumes, every way round, never a line) ----
  const DUSTS = [];
  const dust = (u, v, h, du, dv, sp, rise, r0, r1, life, t0, a, heat, drag) => DUSTS.push({ u, v, h, du, dv, sp, rise, r0, r1, life: lifeCap(t0, life), t0, a, heat, drag });
  for (let i = 0; i < 28; i++) {
    const th = R.range(0, TAU), sp = R.range(20, 54), r = R.range(1.5, 5), t0 = HIT + R.range(0, 0.02);
    dust(REACH + Math.cos(th) * r * 0.9, Math.sin(th) * r, R.range(0.4, 2.4), Math.cos(th), Math.sin(th), sp, R.range(1, 5), R.range(2, 3.2), R.range(3, 6), R.range(0.55, 0.95), t0, R.range(0.09, 0.15), R.range(0.2, 1), 1.6);
  }
  for (let i = 0; i < 8; i++) {   // the burst: big soft volumes rolling off the strike at once
    const th = R.range(0, TAU), t0 = HIT + R.range(0, 0.02);
    dust(REACH + Math.cos(th) * 2, Math.sin(th) * 2, R.range(0.6, 2), Math.cos(th), Math.sin(th), R.range(30, 62), R.range(2, 7), R.range(2.5, 3.5), R.range(5, 8), R.range(0.35, 0.6), t0, R.range(0.11, 0.17), R.range(0.4, 1), 1.9);
  }
  for (let i = 0; i < 5; i++) {   // the core lifting
    const th = R.range(0, TAU), t0 = HIT + R.range(0.02, 0.1);
    dust(REACH + R.range(-2, 2), R.range(-2, 2), R.range(1, 4), Math.cos(th) * 0.3, Math.sin(th) * 0.3, R.range(2, 6), R.range(9, 20), R.range(1.2, 2), R.range(2.4, 4.6), R.range(0.8, 1.1), t0, R.range(0.09, 0.14), 0, 1.4);
  }
  for (let i = 0; i < 8; i++) {   // low and fast, racing away over the floor
    const th = R.range(0, TAU), t0 = HIT + R.range(0, 0.03);
    dust(REACH, 0, R.range(0, 1.2), Math.cos(th), Math.sin(th), R.range(70, 100), R.range(0.5, 2), R.range(1, 1.8), R.range(1.8, 3.4), R.range(0.3, 0.5), t0, R.range(0.07, 0.13), R.range(0.2, 1), 3.2);
  }

  // ---- grit and rocks: thrown in 3-D, dragged, one bounce, settling ----
  const GRIT = [];
  for (let i = 0; i < 46; i++) {
    const th = R.range(0, TAU), sp = R.range(28, 88);
    const b = toss(REACH + R.range(-2.5, 2.5), R.range(-2, 2), R.range(0.5, 3), Math.cos(th) * sp, Math.sin(th) * sp, R.range(50, 210), 2.2);
    b.c = R.pick([st.light, st.body, st.body, st.dust]); b.s = R.chance(0.4) ? 2 : 1; b.warm = R.range(0.15, 1);
    GRIT.push(b);
  }
  const ROCKS = [];
  for (let i = 0; i < 7; i++) {
    const th = R.range(0, TAU), sp = R.range(18, 44);
    const b = toss(REACH + R.range(-3, 3), R.range(-2, 2), R.range(1, 4), Math.cos(th) * sp, Math.sin(th) * sp, R.range(90, 190), 1.5);
    b.s = R.int(2, 3); b.a = R.range(0, TAU);
    ROCKS.push(b);
    const [lu, lv] = tossAt(b, b.t1);
    dust(lu, lv, 0.5, Math.cos(th), Math.sin(th), 8, 4, 1.2, 3.5, R.range(0.3, 0.55), HIT + b.t1, 0.13, 0.3, 1.8);
  }

  // ---- sparks: light thrown up out of the floor in every direction ----
  const SPARKS = [];
  for (let i = 0; i < 26; i++) {
    const th = R.range(0, TAU), sp = R.range(18, 78);
    SPARKS.push({ u: REACH + R.range(-2, 2), v: R.range(-2, 2), h: R.range(0.5, 2), vu: Math.cos(th) * sp, vv: Math.sin(th) * sp, vh: R.range(110, 290), drag: 2.4, life: R.range(0.18, 0.42) });
  }

  // ---- the slam star, flat on the 2:1 floor: a long rake out along the strike, spikes all round ----
  const FSTAR = [];
  for (let i = 0; i < 8; i++) {
    const th = (i / 8) * TAU + R.range(-0.22, 0.22);
    FSTAR.push({ th, len: R.pick([24, 17, 13, 11, 9]) * R.range(0.85, 1.15) });
  }
  FSTAR.push({ th: 0, len: 30 }, { th: Math.PI, len: 21 }, { th: Math.PI * 0.5, len: 16 }, { th: -Math.PI * 0.5, len: 16 });
  // slivers of light off the strike
  const SLIVERS = [];
  for (let i = 0; i < 6; i++) SLIVERS.push({ a: R.range(0, TAU), arc: R.range(0.35, 0.8), r0: R.range(9, 13), grow: R.range(10, 16), life: R.range(0.12, 0.22), c: R.pick([F[6], F[5], WHITE]) });

  let T = 0;

  // ---- drawing ----
  const glint = (p, tt) => {
    const build = clamp(tt / RAISE);
    // the light comes in, fast at the end, and goes out in the blade
    for (const m of MOTES) {
      const u = (tt - (m.arrive - m.dur)) / m.dur;
      if (u <= 0 || u >= 1) continue;
      const e3 = (Math.exp(3 * u) - 1) / (Math.exp(3) - 1), r = m.D * (1 - e3);
      const ca = Math.cos(m.th), sa = Math.sin(m.th);
      p.dot(GX + ca * r, GY + sa * r, u > 0.5 ? F[6] : F[4], 0.35 + 0.6 * u);
      p.dot(GX + ca * (r + 1.3), GY + sa * (r + 1.3), F[3], 0.25 + 0.3 * u);
    }
    // the glint itself: a small white-hot four-point star breathing over the head
    const tw = 0.85 + 0.15 * Math.sin(tt * 44), L = (2 + 7 * build) * tw;
    for (let i = 0; i < 4; i++) {
      const dx = i === 0 ? 1 : i === 1 ? -1 : 0, dy = i === 2 ? -1 : i === 3 ? 1 : 0;
      for (let d = 0.5; d <= L; d += 0.6) p.dot(GX + dx * d, GY + dy * d, d < L * 0.45 ? WHITE : F[6], 1 - (0.55 * d) / L);
    }
    p.px(GX, GY, WHITE);
    p.dot(GX + 1, GY, WHITE, 1); p.dot(GX - 1, GY, WHITE, 1);
    p.dot(GX, GY + 1, WHITE, 1); p.dot(GX, GY - 1, WHITE, 1);
    p.glow(GX, GY, 6 + 5 * build, mix(F[5], WHITE, 0.5), 0.16 + 0.14 * build);
    // and it lets go: one crisp white cross, then the crescent owns the frame
    const pop = 1 - clamp((tt - RAISE) / 0.07);
    if (tt >= RAISE - 0.01 && pop > 0) {
      p.glow(GX, GY, 11, WHITE, 0.45 * pop);
      const pl = 4 + 7 * (1 - pop);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let d = 0; d <= pl; d += 0.6) p.dot(GX + dx * d, GY + dy * d, WHITE, pop);
    }
  };

  const crescent = (p, tt, kk, w0, rim) => {
    if (tt < RAISE) return;
    const gone = smooth(HIT + HOLD, HIT + HOLD + TRAIL, tt);
    const hd = ease.inQuad(clamp((tt - RAISE) / SWING));
    const aHead = A0 + U1 * hd, aTail = A0 + U1 * gone;
    if (aHead - aTail < 0.02) return;
    const al = clamp(1.2 - gone, 0, 1), step = 0.75 / (RU * kk);
    const cs = Math.hypot(az, ax * FL) || 1, cw = 1.5 / cs;
    for (let a = aTail; a <= aHead; a += step) {
      const bf = clamp((a - aTail) / (aHead - aTail));
      const w = w0 * (1 - 0.78 * gone) * Math.pow(Math.sin(Math.PI * Math.pow(bf, 2.2)), 0.6);
      if (w < 0.8) continue;
      const age = tt - passedAt((a - A0) / U1), aA = clamp(Math.min(1, bf / 0.3) * al, 0, 1);
      for (let s = 0; s <= w; s += 0.7) {
        const q = s / w;
        let ci = Math.round(q * (n - 1) * 0.62 + age * 7 + Math.max(0, tt - HIT) * 10 - bf * 0.8 + (rim ? 1.7 : 2.2));
        if (rim && bf > 0.86 && q < 0.2 && age < 0.12) ci = 0;
        const c = F[clamp(n - 1 - ci, 0, n - 1)], [u, h] = arc(a, kk, s), [x, y] = P(u, 0, h);
        p.dot(x, y, c, aA);
        if (q < 0.55) {
          p.dot(x - az * cw, y + ax * FL * cw, mix(c, F[1], 0.4), aA * 0.5);
          p.dot(x + az * cw, y - ax * FL * cw, mix(c, F[0], 0.5), aA * 0.5);
        }
      }
    }
    // the cutting edge catches the light
    if (rim) {
      let px = 0, py = 0, first = true;
      for (let a = Math.max(aTail, aHead - 0.9); a <= aHead; a += 0.045) {
        const [u, h] = arc(a, kk, 0), [x, y] = P(u, 0, h);
        const age = tt - passedAt(clamp((a - A0) / U1));
        if (!first) p.line(px, py, x, y, age < 0.1 ? WHITE : F[6], clamp(1 - gone, 0, 1));
        px = x; py = y; first = false;
      }
    }
    // and the cut glows
    for (let i = 0; i <= 12; i++) {
      const f = i / 12, a = aTail + (aHead - aTail) * f;
      if (a < A0) continue;
      const [u, h] = arc(a, kk, w0 * 0.45), [x, y] = P(u, 0, h);
      p.glow(x, y, rim ? 11 : 8, F[5], (rim ? 0.16 : 0.07) * al * f);
    }
  };

  const floorMarks = (p, age, tt) => {
    const fade = 1 - smooth(D - 0.42, D - 0.08, tt);
    if (fade <= 0) return;
    // the dish under the strike: white-hot, then ember red, then soot
    const rx = 10.5 * clamp(age / 0.08);
    if (rx > 0.5) {
      const ry = rx * FL;
      p.shade(IX - rx - 2, IY - ry - 2, IX + rx + 2, IY + ry + 2, (x, y, out) => {
        const d = Math.hypot((x - IX) / rx, (y - IY) / ry), nn = ((Math.floor(x) * 13 + Math.floor(y) * 7) & 7) / 8;
        if (d > 0.95 - nn * 0.2) return;
        const heat = Math.min(0.88, Math.pow(clamp(1 - age / 0.95), 1.3) * (1.2 - d) - nn * 0.3);
        out.c = heat > 0.06 ? heatAt(heat) : d < 0.55 ? SOOT : SOOT2;
        out.a = fade * (d < 0.85 ? 1 : 0.7);
      });
    }
    // cracks radiating over the floor, hot at the heart, cooling outward into char
    const grow = ease.outCubic(clamp(age / 0.17));
    for (const cr of CRACKS) {
      const len = cr.L * grow;
      if (len < 1) continue;
      along(cr.pts, len, (x0, y0, x1, y1, d0) => {
        const heat = clamp(1 - age / 0.75) * (1 - 0.45 * clamp(d0 / cr.L));
        p.line(x0, y0 + 1, x1, y1 + 1, mix(SOOT, F[0], 0.4), fade * 0.85);
        if (heat > 0.3) {
          p.line(x0, y0, x1, y1, heatAt(heat), fade);
          if (heat > 0.65) p.line(x0, y0 - 1, x1, y1 - 1, heatAt(heat * 0.96), fade * 0.75);
          if (heat > 0.7 && Math.floor(d0 * 0.5) % 3 === 0) p.glow(x0, y0, 6, F[4], 0.14 * heat * fade);
        } else p.line(x0, y0, x1, y1, mix(SOOT, F[1], 0.25), fade * 0.8);
      });
    }
    // the shock ring, rolling out over the 2:1 floor
    const rk = clamp(age / 0.42);
    if (rk < 1) bandFloor(p, IX, IY, 5 + 29 * ease.outCubic(rk), Math.max(1, 1.6 * (1 - rk)), (1 - rk), [st.body, F[3], F[5], F[6]], () => true);
  };

  // the white star of the slam, drawn in the floor's own plane so it lies flat and squeezed 2:1
  const floorStar = (p, age) => {
    const grow = ease.outCubic(clamp(age / 0.05)), die = 1 - smooth(0.1, 0.32, age);
    if (die <= 0) return;
    for (const sp of FSTAR) {
      const ca = Math.cos(sp.th), sa = Math.sin(sp.th), L = sp.len * grow;
      for (let d = 1; d <= L; d += 0.5) {
        const t = d / sp.len, w = Math.min(2.2, 0.5 + 2.2 * (1 - t));
        for (let o = -w; o <= w; o += 1) {
          const [x, y] = P(REACH + ca * d - sa * o, sa * d + ca * o, 0);
          const c = t < 0.4 ? WHITE : t < 0.72 ? F[6] : F[4];
          p.dot(x, y, c, die * (0.5 + 0.5 * (1 - t)));
        }
      }
    }
  };

  const impactCore = (p, age) => {
    if (age < 0.06) {
      const k = 1 - age / 0.06, rx = 3 + 5 * ease.outCubic(clamp(age / 0.06));
      p.ellipse(IX, IY, rx, rx * FL, F[6]);
      p.ellipse(IX, IY, rx * 0.5, rx * FL * 0.5, WHITE);
      if (k > 0.4) p.glow(IX, IY, 9, WHITE, 0.5 * k);
    }
    floorStar(p, age);
    for (const s of SLIVERS) {
      if (age > s.life) continue;
      const k = 1 - age / s.life;
      sliver(p, IX, IY, s.a, s.r0 + s.grow * ease.outCubic(age / s.life), s.arc, s.c, 0.85 * k);
    }
    if (age < 0.12) {
      const k = 1 - age / 0.12;
      p.line(IX, IY, IX, IY - 18 * k, WHITE, k);
      p.dot(IX - 1, IY - 18 * k, WHITE, k);
    }
  };

  const impactLight = (p, age) => {
    const l1 = 1 - clamp(age / 0.12), l2 = 1 - clamp(age / 0.8);
    if (l1 > 0) p.glow(IX, IY, 20, WHITE, 0.55 * l1);
    if (l2 > 0) {
      p.glow(IX, IY, 64, F[4], 0.3 * l2);
      p.glow(IX, IY, 30, F[5], 0.22 * l2);
      const rx = 16 + 8 * Math.sin(Math.min(1, age) * Math.PI), ry = rx * FL;
      p.shade(IX - rx, IY - ry, IX + rx, IY + ry, (x, y, out) => {
        const d = Math.hypot((x - IX) / rx, (y - IY) / ry);
        if (d >= 1) return;
        const f = 1 - d;
        out.l = mix(F[4], F[5], f); out.k = 0.2 * l2 * f * f;
      });
    }
  };

  const dustDraw = (p, tt) => {
    const live = [];
    for (const d of DUSTS) {
      const age = tt - d.t0;
      if (age <= 0 || age >= d.life) continue;
      const [u, v, h] = puffAt(d, age), [x, y] = P(u, v, h);
      live.push([y, d, age, x]);
    }
    live.sort((a, b) => a[0] - b[0]);
    for (const [y, d, age, x] of live) {
      const k = age / d.life, r = d.r0 + d.r1 * ease.outCubic(clamp(age / 0.14));
      const a = Math.min(0.42, d.a * Math.pow(1 - k, 1.5) * clamp(age / 0.03) * 1.9);
      if (a <= 0.01) continue;
      soft(p, x, y, r, st.dust, a);
      if (d.heat > 0.05 && k < 0.7) soft(p, x + (IX - x) * 0.3, y + (IY - y) * 0.3, r * 0.55, mix(st.dust, F[3], 0.55), Math.min(0.22, a * 0.45 * d.heat));
    }
  };

  const emberDraw = (p, tt) => {
    for (let i = 0; i < EMBERS.length; i++) {
      const e = EMBERS[i], age = tt - e.t0;
      if (age <= 0 || age > e.life) continue;
      const [u, v, h] = emberAt(e, age), [x, y] = P(u, v, h), heat = 1 - age / e.life;
      const c = heat > 0.72 ? WHITE : heat > 0.5 ? F[6] : heat > 0.32 ? F[5] : heat > 0.18 ? F[4] : F[3];
      const a = heat > 0.25 ? 1 : heat / 0.25;
      p.dot(x, y, c, a);
      if (e.big) p.dot(x + 0.7, y + 0.6, c, a * 0.6);
      if (heat > 0.55 && i % 3 === 0) p.glow(x, y, 5, F[5], 0.16 * heat);
    }
  };

  const debrisDraw = (p, tt) => {
    const age = tt - HIT;
    if (age <= 0) return;
    const fade = 1 - smooth(D - 0.34, D - 0.1, tt);
    if (fade <= 0) return;
    for (const b of GRIT) {
      const [u, v, h] = tossAt(b, age), [x, y] = P(u, v, h);
      const c = h > 1.2 ? mix(b.c, F[4], 0.4 * b.warm) : b.c;
      p.dot(x, y, c, fade);
      if (b.s > 1) p.dot(x + 0.6, y + 0.5, mix(c, F[2], 0.4), fade);
    }
    for (const b of ROCKS) {
      const [u, v, h] = tossAt(b, age), [x, y] = P(u, v, h);
      rock(p, { x, y, s: b.s, a: b.a, life: clamp((D - tt) * 1.2, 0, 0.5) }, st);
      if (h > 1.5) {
        const [fx, fy] = P(u, v, 0);
        floorShadow(p, fx, fy, 1.4 + h * 0.06, BLACK, 0.16 * clamp(1 - h / 14));
      }
    }
  };

  const sparkDraw = (p, tt) => {
    const age = tt - HIT;
    if (age <= 0) return;
    for (const b of SPARKS) {
      if (age > b.life) continue;
      const e = Math.exp(-b.drag * age), d = (1 - e) / b.drag;
      const u = b.u + b.vu * d, v = b.v + b.vv * d, h = b.h + b.vh * age - 0.5 * G * age * age;
      const [x, y] = P(u, v, h);
      const vx = b.vu * e * ax - b.vv * e * az, vy = (b.vu * e * az + b.vv * e * ax) * FL - (b.vh - G * age);
      const k = 1 - age / b.life;
      const sp = Math.hypot(vx, vy) || 1, ux = vx / sp, uy = vy / sp, len = Math.min(9, 1 + sp * 0.022);
      p.line(x - ux * len, y - uy * len, x - ux * len * 0.4, y - uy * len * 0.4, k > 0.5 ? F[6] : F[3]);
      p.line(x - ux * len * 0.45, y - uy * len * 0.45, x, y, k > 0.6 ? WHITE : F[5]);
      p.glow(x, y, 3, F[6], 0.4 * k);
    }
  };

  return {
    update(dt) { T += dt; },
    draw(p, tt) {
      const t = tt ?? T;
      if (t >= D) return;
      if (t < RAISE + 0.04) glint(p, t);
      if (t >= RAISE) {
        crescent(p, t - 0.02, 0.76, 5, false);
        crescent(p, t, 1, 16, true);
      }
      if (t >= HIT) floorMarks(p, t - HIT, t);
      dustDraw(p, t);
      emberDraw(p, t);
      debrisDraw(p, t);
      sparkDraw(p, t);
      if (t >= HIT) {
        impactCore(p, t - HIT);
        impactLight(p, t - HIT);
      }
    },
  };
}
