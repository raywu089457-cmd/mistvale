// Shared by the isometric variants of effects. Not an effect (the leading _ keeps the tools away).
//
// An effect in this library is authored for a side view: its own space is x across and y up the screen, the floor
// is the line y = 0 and a blast spreads in the screen plane. A 2:1 isometric camera looks down at the same floor
// from above, so the variant keeps the same recipe (particles, plume, lights, debris) but reads its own space
// differently:
//
//   - the floor is a plane, not a line: a ground direction of angle a moves (cos a, sin a * FLOOR) on screen, so
//     something thrown in a circle on the floor lands in a 2:1 ellipse;
//   - anything that leaves the floor keeps moving straight up the screen, and comes back down the same way;
//   - a ring, a scorch or a shadow that lies on the floor is drawn squashed 2:1 (`bandFloor`, `scorchFloor`,
//     `floorShadow`), while smoke columns and flame tongues stand upright.
//
// The rewrites for the game's camera (docs/AUTHORING.md, "The game's camera") draw their floor with these: rings,
// shadows and scorches lying 2:1 on the floor, `ringNoise` for ragged edges with no seam, and packed pixel sets for a
// floor drawn pixel by pixel every frame.
import { band, clamp, noise2, hex, Particles, P, GRAVITY } from "../core/index.js";

/** One world unit across the floor is this many units up the screen: a tilted floor seen from 2:1. */
export const FLOOR = 0.5;

/** A ground direction (angle a, speed s) as a screen velocity: the depth axis is squashed, the height is not. */
export function groundV(a, s) {
  return [Math.cos(a) * s, Math.sin(a) * s * FLOOR];
}

/** A ring of radius r lying flat on the floor at (x, y): band() with the 2:1 squash baked in. */
export function bandFloor(p, x, y, r, th, k, ramp, keep) {
  band(p, x, y, r, FLOOR, th, k, ramp, keep);
}

/** A contact shadow on the floor under something at height h: a flat 2:1 ellipse, tighter as it lifts. */
export function floorShadow(p, x, y, rx, c, a) {
  p.ellipse(x, y, rx, rx * FLOOR, c, a);
}

const SOOT = 0xff12100d, SOOT2 = 0xff1d1712;

/**
 * A scorch left on the floor, drawn in perspective: a soot puddle 2:1 on the screen, white-hot at the heart at
 * first and cooling through a heat ramp to soot, with a ragged dithered rim. HR: heatRamp(fireRamp(palette)).
 * cool: seconds to go cold. fade: 1 to 0 over the effect's tail.
 */
export function scorchFloor(p, HR, t, rx0, cool, fade) {
  if (fade <= 0) return;
  const heat = [...HR].reverse(), rx = rx0 * Math.min(1, t / 0.08), ry = rx0 * FLOOR;
  p.shade(-rx - 2, -ry - 2, rx + 2, ry + 2, (x, y, out) => {
    const d = Math.hypot(x / rx, y / ry), k = ((x * 13 + y * 7) & 7) / 8;
    if (d > 0.95 - k * 0.2) return;
    const T = Math.pow(clamp(1 - t / cool), 1.3) * (1.2 - d) - k * 0.3;
    out.c = T > 0.06 ? heat[Math.min(heat.length - 1, Math.floor((1 - Math.min(1, T)) * (heat.length - 1)))] : d < 0.55 ? SOOT : SOOT2;
    out.a = fade * (d < 0.85 ? 1 : 0.7);
  });
}

/** Noise round a circle (angle th, k features a turn): ragged edges and rays with no seam where the angle wraps. */
export function ringNoise(th, k, seed) {
  return noise2(Math.cos(th) * k, Math.sin(th) * k, seed);
}

// A set of floor pixels drawn every frame (a scorch, a frost, a drift: tens of thousands of them): a packed list of the ones that show, at
// local (X, Y) in colour C at alpha A, with PRE what p.blend() leaves on an empty pixel (colour and alpha) and LIN
// each one's offset in the frame, so the loop that draws them is a read, a test and a write. box: their local box.
export function pixelSet(cap, box) {
  return { n: 0, box, X: new Int16Array(cap), Y: new Int16Array(cap), C: new Uint32Array(cap), A: new Float32Array(cap), PRE: new Uint32Array(cap), LIN: new Int32Array(cap), lin: "" };
}
export function setPx(S, x, y, c, a) {
  const i = S.n++;
  S.X[i] = x; S.Y[i] = y; S.C[i] = c; S.A[i] = a;
  S.PRE[i] = (((a * 255) & 255) << 24) | (c & 0xffffff);
  S.lin = "";
}
// blend c at alpha a over the frame pixel j holding d, as p.blendPx() does
function blendInto(F, j, d, c, a) {
  const oa = a + ((d >>> 24) / 255) * (1 - a), k = a / oa, m = 1 - k;
  const r = (((c >>> 16) & 255) * k + ((d >>> 16) & 255) * m) & 255;
  const g = (((c >>> 8) & 255) * k + ((d >>> 8) & 255) * m) & 255;
  const b = ((c & 255) * k + (d & 255) * m) & 255;
  F[j] = (((oa * 255) & 255) << 24) | (r << 16) | (g << 8) | b;
}
export function drawSet(p, S) {
  const n = S.n, X = S.X, Y = S.Y, A = S.A, CC = S.C;
  if (p.sn !== 0 || p.cs !== 1) {
    for (let i = 0; i < n; i++) p.blend(X[i], Y[i], CC[i], A[i]);
    return;
  }
  const F = p.C, w = p.w, h = p.h, fade = p.fade, fx = p.fx, B = S.box;
  // a local pixel X lands on screen column floor(tx + (X + 0.5) fx): bx + X, or bx - 1 - X mirrored
  const bx = Math.floor(p.tx + 0.5) - p.ox, by = Math.floor(p.ty + 0.5) - p.oy;
  const sx0 = fx > 0 ? bx + B[0] : bx - 1 - B[2], sx1 = fx > 0 ? bx + B[2] : bx - 1 - B[0];
  if (fade === 1 && sx0 >= 0 && sx1 < w && by + B[1] >= 0 && by + B[3] < h) {
    // wholly on the frame: every offset worked out once for this frame width and facing
    const key = `${w}/${fx}`, LIN = S.LIN, PRE = S.PRE, base = by * w + bx;
    if (S.lin !== key) {
      for (let i = 0; i < n; i++) LIN[i] = Y[i] * w + (fx > 0 ? X[i] : -1 - X[i]);
      S.lin = key;
    }
    for (let i = 0; i < n; i++) {
      const j = base + LIN[i], d = F[j];
      if (d === 0) F[j] = PRE[i];
      else blendInto(F, j, d, CC[i], A[i]);
    }
    return;
  }
  for (let i = 0; i < n; i++) {
    const x = fx > 0 ? bx + X[i] : bx - 1 - X[i], y = by + Y[i], a = A[i] * fade;
    if (x < 0 || y < 0 || x >= w || y >= h || a <= 0.004) continue;
    const j = y * w + x, d = F[j];
    if (d === 0 && fade === 1) F[j] = S.PRE[i];
    else blendInto(F, j, d, CC[i], a);
  }
}

// Particles flying in 3D: x across, z into the floor (toward us), h up; on screen (x, z * FLOOR - h). The kinds and
// their looks are the core's (P.SPARK, MOTE, STREAK, STAR, EMBER, FLAKE, VAPOUR, DUST, SMOKE, GRIT); here they move
// in the world, so what falls lands at its own depth, bounces and skids on the floor there, and what rises rises.
// draw(p, keep) draws the ones keep(q) picks (q.x, q.z, q.h): split by depth round the caster, e.g. (q) => q.z < 0
// behind him and (q) => q.z >= 0 in front. opts: { rng, sparks, haze } as for Particles.
const FALL = { [P.FIRE]: -0.1, [P.SPARK]: 0.45, [P.GRIT]: 1, [P.FLAKE]: 0.04, [P.STAR]: -0.005, [P.EMBER]: -0.03, [P.SMOKE]: -0.018, [P.VAPOUR]: -0.004, [P.DUST]: 0.004 };
const DRAG = { [P.FIRE]: 3.6, [P.SPARK]: 2.2, [P.GRIT]: 0.8, [P.FLAKE]: 2.2, [P.MOTE]: 0.6, [P.EMBER]: 1.6, [P.SMOKE]: 1.3, [P.VAPOUR]: 4, [P.DUST]: 4, [P.STREAK]: -3 };
export class Fly3 {
  constructor(opts = {}) {
    this.ps = new Particles(opts);
    this.R = this.ps.R;
    this.list = [];
    this.t = 0;
  }
  /** o: { g (share of gravity, - rises), drag, bounce (0: it stops where it lands), delay, smokes (a FIRE puff that
   *  dies leaves smoke), big (that smoke bigger and slower) } */
  spawn(k, x, z, h, vx, vz, vh, life, col, size = 1, o = {}) {
    const q = { k, x, z, h, vx, vz, vh, life, max: life, col: col ? hex(col) : 0, size, seed: this.R.next() * 100, delay: o.delay ?? 0, flag: 0, g: o.g ?? FALL[k] ?? 0, drag: o.drag ?? DRAG[k] ?? 1.6, bounce: o.bounce ?? (k === P.SPARK ? 0.45 : 0), rest: false, smokes: !!o.smokes, big: !!o.big };
    q.v = { k, x: 0, y: 0, vx: 0, vy: 0, life, max: life, col: q.col, size, seed: q.seed, delay: 0, flag: 0 };
    this.list.push(q);
    return q;
  }
  get count() {
    return this.list.length;
  }
  update(dt) {
    this.t += dt;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const q = this.list[i];
      if (q.delay > 0) { q.delay -= dt; continue; }
      if ((q.life -= dt) <= 0) {
        this.list.splice(i, 1);
        if (q.smokes) this.spawn(P.SMOKE, q.x, q.z, q.h, q.vx * 0.6, q.vz * 0.6, q.vh * 0.6 + 6, q.big ? this.R.range(1.3, 2.3) : this.R.range(0.8, 1.4), 0, q.size * (q.big ? 0.85 : 0.7));
        continue;
      }
      const f = Math.exp(-q.drag * dt);
      q.vx *= f; q.vz *= f;
      q.vh = q.vh * f - GRAVITY * q.g * dt;
      if (q.k === P.EMBER) (q.vx += Math.cos(this.t * 2.3 + q.seed) * 40 * dt), (q.vz += Math.sin(this.t * 1.9 + q.seed) * 30 * dt);
      if (q.k === P.FLAKE) q.x += Math.sin(this.t * 2.5 + q.seed) * 7 * dt;
      if (q.k === P.SMOKE) q.x += Math.sin(this.t * 1.3 + q.seed) * 5 * dt;
      if (q.k === P.FIRE) q.vx += Math.sin(this.t * 17 + q.seed) * 30 * dt;
      q.x += q.vx * dt; q.z += q.vz * dt; q.h += q.vh * dt;
      if (q.h > 0 || q.g <= 0) continue;
      // on the floor at its own depth: a hard one bounces, the rest skid to a stop and lie there
      q.h = 0;
      if (q.bounce > 0 && -q.vh > 60) (q.vh = -q.vh * q.bounce), (q.vx *= 0.7), (q.vz *= 0.7);
      else {
        q.vh = 0;
        const s = Math.exp(-9 * dt);
        q.vx *= s; q.vz *= s;
        if (!q.rest) (q.rest = true), q.k === P.GRIT && (q.life = Math.min(q.life, 0.6));
      }
    }
  }
  /** fn(ps): draw the picked ones yourself from the core Particles ps (e.g. simDraw for flame puffs in a palette) */
  draw(p, keep, fn) {
    const L = this.ps.list;
    L.length = 0;
    for (const q of this.list) {
      if (q.delay > 0 || (keep && !keep(q))) continue;
      const v = q.v;
      v.x = q.x; v.y = q.z * FLOOR - q.h; v.vx = q.vx; v.vy = q.vz * FLOOR - q.vh; v.life = q.life; v.max = q.max;
      L.push(v);
    }
    this.ps.t = this.t;
    if (fn) fn(this.ps);
    else this.ps.draw(p, null);
    L.length = 0;
  }
  /** cut every life to end by `left` seconds from now (an effect's tail) */
  cap(left) {
    for (const q of this.list) if (q.life + q.delay > left) q.life = Math.max(0.001, left - q.delay);
  }
}

/**
 * The crash a finisher lands on: a white-hot core that blooms on the floor and collapses, a pair of shock rings
 * racing out through the 2:1 ground, a fan of cracks opening from the point of impact, a low glow that fades and a
 * crown of dust thrown up. One call draws the whole beat, so the heaviest blows share one grammar.
 *
 * p: painter. age: seconds since the strike (negative = not yet). o: {x, z} floor point (default 0,0),
 * reach (px the ring runs), coreR, colours white/hot/mid, rim (ring ramp), crack (crack colour), dust (colour),
 * seed, rings, crackN, dustN.
 */
export function crash(p, age, o = {}) {
  if (age < 0) return;
  const x0 = o.x ?? 0, y0 = (o.z ?? 0) * FLOOR;
  const R1 = o.reach ?? 40, r0 = o.r0 ?? 4;
  const white = o.white ?? 0xffffffff, hot = o.hot ?? 0xfffff2c0, mid = o.mid ?? 0xffffa030;
  const rim = o.rim ?? [white, hot, mid, 0xffff6a20, 0xffb04018, 0x646a3430];
  const crack = o.crack ?? 0xffffd28a, seed = o.seed ?? 1;
  const coreLife = o.coreLife ?? 0.17;
  // the core: a squashed disc of white and heat that collapses as the ring leaves it
  const ck = 1 - age / coreLife;
  if (ck > 0) {
    const rr = (o.coreR ?? 10) * (0.3 + ck * 1.15), ry = rr * FLOOR;
    for (let y = -Math.ceil(ry) - 1; y <= Math.ceil(ry) + 1; y++)
      for (let x = -Math.ceil(rr) - 1; x <= Math.ceil(rr) + 1; x++) {
        const d = Math.hypot(x / rr, y / ry);
        if (d > 1) continue;
        p.px(x0 + x, y0 + y, d < 0.28 ? white : d < 0.58 ? hot : mid);
      }
    p.glow(x0, y0, rr * 1.7, mid, 0.28 * ck);
  }
  // the rings: the first races out, the second follows dimmer and slower
  const ringLife = o.ringLife ?? 0.44, rings = o.rings ?? 2;
  for (let i = 0; i < rings; i++) {
    const a = age - i * 0.06, k = a / ringLife;
    if (a < 0 || k > 1) continue;
    const r = r0 + (R1 * (i ? 0.62 : 1) - r0) * Math.sqrt(k);
    const th = (i ? 1.2 : 1.9) * (1 - k) + 0.25;
    bandFloor(p, x0, y0, r, th, 0.62 * (1 - k) * (1 - k), rim, () => true);
  }
  // the cracks: a fan of jittered walks out through the floor plane, brighter near the point of impact
  const life = o.crackLife ?? 0.5, ck2 = age / life;
  if (ck2 < 1) {
    const n = o.crackN ?? 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + noise2(i * 3.1, seed * 0.7, seed) * 0.5;
      const len = R1 * (0.5 + 0.5 * Math.abs(noise2(i * 1.7, seed, seed + 3)));
      const step = 1.2, ux = Math.cos(a), uz = Math.sin(a);
      for (let d = r0 * 0.5; d <= len * Math.min(1, ck2 * 2.2); d += step) {
        const jx = noise2(d * 0.22, i * 2.3, seed) * 2.4, jz = noise2(i * 4.1, d * 0.19, seed + 9) * 2.4;
        const fade = 1 - d / len;
        p.px(x0 + ux * d + jx, y0 + uz * d * FLOOR + jz * FLOOR, fade > 0.45 ? crack : 0xff7a3a12);
      }
    }
  }
  // a low glow on the ground that outlives the flash
  p.glow(x0, y0, R1 * 0.55, mid, 0.18 * Math.max(0, 1 - age / 0.5));
  // dust thrown up in a crown, drifting out and up
  const dn = o.dustN ?? 6, dust = o.dust ?? 0xff6b5a42;
  for (let i = 0; i < dn; i++) {
    const a = (i / dn) * Math.PI * 2 + noise2(i, seed + 5, 2) * 0.6;
    const t0 = 0.02 + i * 0.012, k = (age - t0) / 0.42;
    if (k < 0 || k > 1) continue;
    const rr = 2 + k * 7, hh = Math.sin(k * Math.PI) * 9;
    p.ellipse(x0 + Math.cos(a) * (r0 + R1 * 0.45 * k), y0 + Math.sin(a) * (r0 + R1 * 0.45 * k) * FLOOR - hh, rr, rr * FLOOR, dust, 0.34 * (1 - k) * (1 - k));
  }
}
