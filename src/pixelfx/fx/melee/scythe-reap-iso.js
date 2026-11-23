// Scythe reap, rewritten for the game's 2:1 isometric camera: melee/scythe-reap in the world the game sees, not the
// side view's picture laid on the floor.
//
// The recipe is the source's: a long curved blade comes round low and fast, leaves a thin dark crescent with a mint
// cutting edge, and the stroke lingers as dark smoke and shaved dust; a wide low reap, taken at ankle height through
// ~180 degrees in front of the hero.
// What the camera changes:
//   - the stroke is a horizontal circle at ankle height, so the swept path is an ellipse squeezed 2:1 (the same
//     squash the floor has), not a diagonal band: it is swept out in the floor's own directions all the way round
//     the front, and it reads the same whether the hero faces right, the viewer, left or away;
//   - it has depth: the half of the crescent behind the hero's feet is drawn behind his sprite, the half in front
//     over it, and the blade's tip is a hand's width above the floor, so the shadow it throws and the shaved dust
//     lie on the floor almost under the steel and the crescent floats above them;
//   - the dust is shaved off the floor along the arc's own track, laid down behind the tip as it passes, so it
//     trails the stroke and is still lying there when the steel is gone;
//   - the smoke is a trail, not a wall: each wisp is let go of at a point of the arc as the steel passes it, curls
//     up, drags to a standstill and thins out, so the smoke hangs where the stroke was;
//   - it leaves the way a reap would: the crescent's oldest end thins to nothing first, the smoke stands a moment
//     and is gone, and the shaved dust settles back onto the floor; no whole-picture fade.
// 1 px = 1 character sprite px (32 x 16 px floor tiles). aim is a floor angle: 0 = screen right, PI/2 = down the
// screen toward the viewer.
import { Rng, fit, clamp, smooth, ease, TAU, WHITE, mix, hex, noise2 } from "../../core/index.js";
import { FLOOR, bandFloor, floorShadow } from "../_iso.js";
import { stone } from "./_lib.js";
import { soft } from "../fire/_lib.js";

export const meta = {
  name: "Scythe reap (iso)",
  desc: "melee/scythe-reap in 2:1 iso: a long dark crescent reaping ankle-high ~180 degrees in front, a mint cutting edge, a line of dust shaved off the floor, smoke wisps and shavings.",
  tags: ["melee", "scythe", "reap", "blade", "sweep", "dark", "combat", "iso", "top-down", "one-shot", "directional"],
  size: [240, 190],
  origin: [120, 150],
  duration: 0.9,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: {
    palette: ["#0a0612", "#170d28", "#2a1440", "#3f2160", "#5e3d8c", "#7fd6c0", "#d8fff2"],
    aim: 0,
    seed: 13,
  },
};

const D = meta.duration, FL = FLOOR, G = 470;
// the source's beats, tightened for a 0.9 s stroke: it is already moving, the stroke is quick, then it hangs and goes
const WIND = 0.06, SWEEP = 0.40, HOLD = 0.42, LIFE = WIND + SWEEP;
// the circle the blade is swung on: a little in front of the feet, at ankle height, from the heel of the blade to the tip
const PU = 4, PV = 0, PH = 11;
const RIN = 29.5, ROUT = 39.5;
// the stroke: from the hero's right and a little behind him, ~190 degrees round the front, out to his left
const PHI0 = 1.9, PHI1 = -1.55;

/** A body thrown in the game's 3-D: drag on the floor, one bounce, then rest at its own depth. */
function toss(u, v, h, vu, vv, vh, drag = 2) {
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
/** When the head of the stroke passes a floor angle. */
function passTime(phi) {
  const y = (phi - PHI0) / (PHI1 - PHI0);            // 0 at the start of the stroke, 1 at its end
  const u = Math.acos(clamp(1 - 2 * clamp(y, 0, 1), -1, 1)) / Math.PI;
  return WIND + SWEEP * u;
}

export function create(o) {
  const F = fit(o.palette, 7), n = F.length;
  const R = new Rng(o.seed ?? 13);
  const aim = o.aim ?? 0;
  const ax = Math.cos(aim), az = Math.sin(aim);
  /** A floor point (u along the aim, v across it) as a screen point; h is height off the floor. */
  const P = (u, v, h) => [u * ax - v * az, (u * az + v * ax) * FL - h];
  /** How near a floor point is to the viewer (negative = behind the hero's feet, up the screen). */
  const depth = (u, v) => u * az + v * ax;
  const st = stone(hex("#4a3f69"));
  const BLACK = hex("#000000");
  const SOOT = mix(F[0], hex("#0d0b12"), 0.5);
  const DUST = mix(st.dust, F[6], 0.32);
  // the heights of the swing circle's centre, and the blade: it hangs from the ankle down to the floor at the tip
  const [FX, FY] = P(PU, PV, 0);
  const hAt = (r) => PH - (PH - 1.9) * Math.pow(clamp((r - RIN) / (ROUT - RIN), 0, 1), 1.5);
  const phiHead = (t) => PHI0 + (PHI1 - PHI0) * ease.inOutSine(clamp((t - WIND) / SWEEP, 0, 1));
  const tipOf = (phi, r) => P(PU + r * Math.cos(phi), PV + r * Math.sin(phi), hAt(r));
  // the blade also lies on the floor: its shadow is cast where its points are above, and the shaved dust follows it
  const foot = (phi, r) => [PU + r * Math.cos(phi), PV + r * Math.sin(phi)];

  // ---- the crescent: a long thin blade at the head of the stroke, and behind it the smear of where it has been ----
  const crescent = (p, t, front) => {
    const ph = phiHead(t);
    const swept = Math.abs(ph - PHI0);
    if (swept < 0.02) return;
    const N = Math.max(6, Math.ceil((swept * 34) / 0.55));
    for (let i = 0; i <= N; i++) {
      const s = i / N;                                 // 0 at the steel now, 1 at the oldest end of the stroke
      const phi = ph + (PHI0 - ph) * s;
      const age = t - passTime(phi);
      if (age < 0) continue;
      const aAge = 1 - clamp(age / 0.26, 0, 1);         // the trail is a sixth of a second of motion, no more
      if (aAge <= 0.02) continue;
      const fresh = clamp(1 - age / 0.05);
      const blade = clamp(1 - s * 3.4);                // the steel itself, only at the head of the stroke
      const taper = 0.5 + 0.5 * Math.pow(Math.sin(Math.PI * clamp(s * 0.9 + 0.06, 0, 1)), 0.5);
      const th = (5.2 + 5.2 * blade) * taper;
      const rows = Math.max(2, Math.round(th / 0.5));
      for (let j = 0; j <= rows; j++) {
        const e = j / rows;                            // 0 = the cutting edge, 1 = the back of the blade
        const r = ROUT - th * e;
        const [u, v] = foot(phi, r);
        if ((depth(u, v) >= 0) !== front) continue;
        const [x, y] = P(u, v, hAt(r));
        if (aAge < 0.96 && noise2(x * 0.34, y * 0.44, 5) * 0.5 + 0.5 > 0.18 + aAge * 0.86) continue;
        if (e < 0.16) { p.px(x, y, fresh > 0.55 ? WHITE : mix(F[6], F[5], 0.35)); continue; }  // the cutting edge, one px
        const a = aAge * (blade > 0.25 ? 0.95 : 0.62 + 0.36 * aAge);
        if (e < 0.26) { p.dot(x, y, mix(F[3], F[4], 0.35 + 0.3 * fresh), a); continue; }       // the bevel, one px down
        if (e < 0.9) { p.dot(x, y, mix(F[2], F[1], 0.55), a); continue; }                      // the thin dark body
        p.dot(x, y, mix(F[2], F[3], 0.5), a * 0.7);                                           // and its dark back edge
      }
    }
  };

  // ---- what the steel shaved off the floor: a pale line laid down behind the tip, and the puffs it lifts ----
  const shaved = (p, t) => {
    const ph = phiHead(t);
    if (Math.abs(ph - PHI0) < 0.01) return;
    const N = Math.max(4, Math.ceil((Math.abs(ph - PHI0) * 34) / 0.7));
    for (let i = 0; i <= N; i++) {
      const s = i / N, phi = ph + (PHI0 - ph) * s;
      const age = t - passTime(phi);
      if (age < 0) continue;
      const a = 1 - clamp(age / 0.32, 0, 1);
      if (a <= 0.03) continue;
      // the line the tip shaves off the floor: pale stone dust laid down in a curve, with a dark groove behind it
      for (const [rr, k, col] of [
        [ROUT + 1, 0.85, mix(DUST, F[6], 0.4)],
        [ROUT + 2.2, 0.55, DUST],
        [RIN + 1.2, 0.3, mix(DUST, F[4], 0.3)],
      ]) {
        const [u, v] = foot(phi, rr), d = depth(u, v);
        if (d < 0) continue;                           // the shaved line is a floor mark, only in front of the feet
        const [x, y] = P(u, v, 0);
        const nn = noise2(x * 0.55, y * 0.55, 9) * 0.5 + 0.5;
        if (nn > 0.34 + a * 0.66) continue;
        if (k > 0.8) {                                 // the strip itself: two px, pale stone over a dark groove
          p.px(x, y, col);
          p.px(x, y + 1, mix(col, SOOT, 0.62));
        } else p.dot(x, y, col, 0.55 * k * a + 0.06);
      }
    }
    // the shadow the crescent throws: a dark smear on the floor almost under the steel
    const M = Math.max(4, Math.ceil((Math.abs(ph - PHI0) * 25) / 0.9));
    for (let i = 0; i <= M; i++) {
      const s = i / M, phi = ph + (PHI0 - ph) * s;
      const age = t - passTime(phi);
      if (age < 0 || age > 0.3) continue;
      const a = (1 - age / 0.3) * 0.3;
      if (a <= 0.02) continue;
      for (let rr = RIN + 2; rr <= ROUT - 1; rr += 1.9) {
        const [u, v] = foot(phi, rr), d = depth(u, v);
        if (d < 0) continue;
        const [x, y] = P(u, v, 0);
        if (noise2(x * 0.7, y * 0.7, 17) * 0.5 + 0.5 > 0.5) continue;
        p.dot(x, y, SOOT, a);
      }
    }
  };

  // ---- the dust: puffs kicked up along the track as the tip passes, and the low cloud that hangs after it ----
  const PUFFS = [];
  for (let i = 0; i < 20; i++) {
    const f = (i + 0.5) / 20, phi = PHI0 + (PHI1 - PHI0) * f;
    PUFFS.push({ phi, r: ROUT + R.range(0.4, 2.6), t0: passTime(phi) + R.range(0, 0.04), du: R.range(0, 0.05),
      rise: R.range(2.2, 7.5), dur: R.range(0.16, 0.3), r0: R.range(0.5, 1.1), r1: R.range(1.5, 3.1), a: R.range(0.09, 0.19) });
  }
  const puffAt = (d, age) => {
    const u = PU + d.r * Math.cos(d.phi) + d.du * age * 6, v = PV + d.r * Math.sin(d.phi) + d.du * age * 4;
    const h = 0.2 + (d.rise * (1 - Math.exp(-2.4 * age))) / 2.4;
    return [u, v, h];
  };

  // ---- the smoke: let go of the arc as the steel passes, curling up and thinning ----
  const WISPS = [];
  for (let i = 0; i < 13; i++) {
    const f = (i + 0.3) / 13, phi = PHI0 + (PHI1 - PHI0) * f;
    WISPS.push({ phi, r: R.range(RIN + 2, ROUT + 1), t0: passTime(phi) + R.range(0, 0.05), life: R.range(0.36, 0.55),
      rise: R.range(9, 24), drift: R.range(-0.12, 0.12), out: R.range(0, 3), sway: R.range(1.2, 3.2), sd: R.range(0, TAU), a: R.range(0.16, 0.3) });
  }
  const wispAt = (w, age) => {
    const phi = w.phi + w.drift * age, r = w.r + w.out * age;
    const sw = Math.sin(age * 7 + w.sd) * w.sway * Math.min(1, age * 5);
    const h = hAt(w.r) + (w.rise * (1 - Math.exp(-1.9 * age))) / 1.9;
    return [PU + r * Math.cos(phi) + sw * 0.25, PV + r * Math.sin(phi) + sw * 0.15, h];
  };

  // ---- the shavings: flung off the tip along the stroke, out and up, then bouncing once and settling ----
  const SHARDS = [];
  for (let i = 0; i < 10; i++) {
    const f = (i + 0.4) / 10, phi = PHI0 + (PHI1 - PHI0) * f;
    const tx = Math.sin(phi), tz = -Math.cos(phi);         // the way the tip is travelling
    const sp = R.range(16, 38);
    const b = toss(PU + ROUT * Math.cos(phi), PV + ROUT * Math.sin(phi), R.range(1.2, 2.6),
      tx * sp + Math.cos(phi) * sp * 0.4, tz * sp + Math.sin(phi) * sp * 0.4, R.range(26, 95), 2.6);
    b.t0 = passTime(phi); b.s = R.chance(0.4) ? 2 : 1;
    b.c = R.pick([F[6], F[5], DUST, mix(st.light, F[6], 0.3)]);
    SHARDS.push(b);
  }
  // ---- the light off the edge: a few sparks where the steel comes to the floor, and the cold flash at the tip ----
  const TIPS = [];
  for (let i = 0; i < 8; i++) {
    const f = (i + 0.5) / 8, phi = PHI0 + (PHI1 - PHI0) * f;
    TIPS.push({ phi, t0: passTime(phi), life: R.range(0.1, 0.2), c: R.pick([F[6], F[5], WHITE]) });
  }

  let T = 0;
  const softs = [];

  // ---- the wind: the steel is already there, held out to the side, and a glint runs out along it ----
  const wind = (p, t) => {
    const b = clamp(t / WIND);
    if (b <= 0) return;
    // the blade lying at the start of the stroke, brightening as it is drawn back
    for (let r = RIN; r <= ROUT; r += 0.7) {
      const [u, v] = foot(PHI0, r), [x, y] = P(u, v, hAt(r));
      p.dot(x, y, r > ROUT - 1.2 ? F[6] : F[3], 0.35 + 0.55 * b);
    }
    const [gx, gy] = tipOf(PHI0, ROUT);
    const L = (2 + 6 * b) * (0.9 + 0.1 * Math.sin(t * 60));
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let d = 0.4; d <= L; d += 0.55) p.dot(gx + dx * d, gy + dy * d, d < L * 0.4 ? WHITE : F[5], 1 - (0.55 * d) / L);
    p.px(gx, gy, WHITE);
    p.glow(gx, gy, 4 + 5 * b, F[5], 0.1 + 0.14 * b);
  };

  // ---- the tip of the steel and the light it carries while it is moving ----
  const tip = (p, t) => {
    const ph = phiHead(t);
    if (Math.abs(ph - PHI0) < 0.02) return;
    const k = 1 - clamp((t - LIFE) / 0.12, 0, 1);
    if (k <= 0) return;
    const [x, y] = tipOf(ph, ROUT);
    p.px(x, y, WHITE);
    p.dot(x + 1, y, F[6], 0.8 * k); p.dot(x, y - 1, F[6], 0.8 * k);
    p.glow(x, y, 7, mix(F[5], WHITE, 0.3), 0.22 * k);
    // the steel itself, a thin bright line back along the blade to the hands
    const steps = Math.max(5, Math.round((ROUT - RIN) * 1.4));
    for (let i = 0; i <= steps; i++) {
      const r = RIN + ((ROUT - RIN) * i) / steps, [bx, by] = tipOf(ph, r);
      p.dot(bx, by, i / steps > 0.6 ? WHITE : F[6], 0.5 + 0.5 * (i / steps) * k);
    }
  };

  return {
    update(dt) { T += dt; },
    drawBack(p, tt) {
      const t = tt ?? T;
      if (t >= D) return;
      crescent(p, t, false);
      wispDraw(p, t, false);
    },
    draw(p, tt) {
      const t = tt ?? T;
      if (t >= D) return;
      if (t < WIND + 0.02) wind(p, t);
      crescent(p, t, true);
      tip(p, t);
      shaved(p, t);
      dustDraw(p, t);
      shardDraw(p, t);
      wispDraw(p, t, true);
      if (t < LIFE + 0.06) sparkDraw(p, t);
    },
  };

  // ---- helpers that need the closed form, defined after the return for readability ----
  function wispDraw(p, t, front) {
    for (const w of WISPS) {
      const age = t - w.t0;
      if (age <= 0 || age >= w.life) continue;
      const [u0, v0] = wispAt(w, Math.max(0, age * 0.08));
      if ((depth(u0, v0) >= 0) !== front) continue;
      const a = w.a * Math.pow(1 - age / w.life, 1.2) * clamp(age / 0.03);
      if (a <= 0.01) continue;
      const steps = 8;
      for (let i = 0; i <= steps; i++) {
        const aa = age * (i / steps), [u, v, h] = wispAt(w, aa), [x, y] = P(u, v, h);
        const q = i / steps;                       // 0 = where it was let go, 1 = where it is now
        const c = q > 0.8 ? mix(F[3], F[4], 0.45) : q > 0.45 ? mix(F[2], F[3], 0.35) : mix(SOOT, F[2], 0.45);
        p.dot(x, y, c, a * (0.4 + 0.6 * q));
        if (i === 0) p.dot(x, y + 1, mix(DUST, F[5], 0.35), a * 0.7);   // the dust it lifts off the shaved track
      }
      const wt = wispAt(w, age), [ux, uy] = P(wt[0], wt[1], wt[2]);
      p.dot(ux, uy, mix(F[4], F[5], 0.45), a * 0.9);
    }
  }
  function dustDraw(p, t) {
    softs.length = 0;
    for (const d of PUFFS) {
      const age = t - d.t0;
      if (age <= 0 || age >= d.dur) continue;
      const [u, v, h] = puffAt(d, age), [x, y] = P(u, v, h);
      const k = age / d.dur, r = d.r0 + d.r1 * ease.outCubic(clamp(age / 0.1));
      const a = Math.min(0.34, d.a * Math.pow(1 - k, 1.3) * clamp(age / 0.02) * 2.5);
      if (a <= 0.012) continue;
      softs.push({ x, y, r, a });
    }
    softs.sort((a, b) => a.y - b.y);
    for (const s of softs) {
      soft(p, s.x, s.y, s.r, mix(DUST, SOOT, 0.15), s.a);
      soft(p, s.x - s.r * 0.2, s.y - s.r * 0.3, s.r * 0.6, mix(DUST, WHITE, 0.28), s.a * 0.5);
    }
  }
  function shardDraw(p, t) {
    for (const b of SHARDS) {
      const age = t - b.t0;
      if (age <= 0 || age > b.end + 0.06) continue;
      const [u, v, h] = tossAt(b, age), [x, y] = P(u, v, h);
      const ga = clamp((D - t) / 0.2, 0, 1);
      if (ga <= 0) continue;
      p.dot(x, y, b.c, ga);
      if (b.s > 1) p.dot(x + 0.7, y + 0.4, mix(b.c, F[3], 0.35), ga);
      if (h > 2) p.dot(x - 0.6, y - 0.4, mix(b.c, WHITE, 0.5), ga * 0.7);
    }
  }
  function sparkDraw(p, t) {
    for (const s of TIPS) {
      const age = t - s.t0;
      if (age < 0 || age > s.life) continue;
      const [x, y] = tipOf(s.phi, ROUT), k = 1 - age / s.life;
      p.dot(x - 1, y, s.c, 0.8 * k); p.dot(x, y + 1, s.c, 0.8 * k);
      if (k > 0.5) p.glow(x, y, 5, F[5], 0.16 * k);
    }
  }
  function hash(a, b) { return ((Math.floor(a * 64) * 13 + Math.floor(b * 64) * 7) & 7) / 8; }
}
