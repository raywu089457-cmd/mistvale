// Blizzard vortex for the game's 2:1 isometric camera: ice/blizzard-vortex rewritten for the floor the game sees and
// given the life a snow whirl has, never its picture squashed, stretched, scaled or faded into place:
//
//   chill    the spell's cold lands: frost runs out over the floor from the spot as a front
//   gather   the air begins to turn: snow streams in along the floor from every side, turning faster as it closes
//            in (it keeps its spin), and heaps into a drift round the middle; puffs boil up off it
//   climb    the whirl lifts out of the drift: its funnel builds upward behind a head of snow, fattening and
//            spinning up as it goes
//   howl     it stands, as the source's loop does: wind bands winding up its walls, snow and ice crystals carried
//            round it and flung off its mouth to flutter down, snow boiling at its foot, cold light in its throat
//   slacken  the wind dies: the spin falls, the funnel ropes thin and leans, and its snow drops out from the top
//            down, flakes and crystals falling free to land at their own depth
//   settle   the drift, the frost and the fallen snow settle away patch by patch, grain by grain at the edges
//
// The funnel is a hollow wall of snow-laden air in 3D. Its rings lie on the floor's 2:1, so we look down into its
// mouth and see the far wall through the near one; where we see the wall edge on it is densest, as the side view's
// rim is, and its wind bands wind up it as helices that turn with the air. What orbits it passes behind and in
// front at its own depth. 1 px = 1 character sprite px (32 x 16 px tiles).
// Particles and bands passing behind and in front of a centre follow the recipe in Sprite Fusion's open-source black
// hole (https://www.spritefusion.com/pixel-art-vfx/black-hole), MIT License, Copyright (c) 2026 Hugo Duprez.
import { fit, clamp, smooth, ease, mix, noise2, rand, rng, Rng, TAU, WHITE } from "../../core/index.js";
import { floorLight } from "../fire/_lib.js";
import { pixelSet, setPx, drawSet, ringNoise } from "../_iso.js";

export const meta = {
  name: "Blizzard vortex (iso)",
  desc: "ice/blizzard-vortex on the 2:1 floor as one life: the boards crack and frost over, snow spirals in, and a wide funnel howls up throwing shards and a snow plume before it settles.",
  tags: ["ice", "snow", "blizzard", "tornado", "vortex", "wind", "spell", "one-shot", "iso", "top-down"],
  size: [272, 320],
  origin: [136, 258],
  duration: 5.6,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: ["#151a3d", "#212f6b", "#2c58aa", "#3a8bd8", "#62c8f4", "#a6ecff", "#dcfbff", "#ffffff"], height: 96, seed: 17 },
};

const FL = 0.5, D = meta.duration;   // FL: the floor's 2:1 (a point z deep sits z/2 down the screen)
// when each part of its life happens, in seconds: the [start, end] its change eases across
const SPREAD = [0.04, 0.9], GROW = [0.15, 1.3], SPIN = [0.15, 1.2], CLIMB = [0.42, 1.45], FATTEN = [0.4, 1.6];
const SLACK = [2.9, 4.0], SETTLE = [4.8, 5.5];
const FROST = 70, DRIFT = 38;   // how far the frost runs over the floor; the drift heaped round the foot (a spell this size)
const CROSS = [[1, 0], [-1, 0], [0, 1], [0, -1]], DIAG = [[1, 1], [-1, -1], [1, -1], [-1, 1]];

export function create(o) {
  const C = fit(o.palette, 8), H = o.height, R = new Rng(o.seed), S0 = o.seed * 7;
  let t = 0;

  // ---- its life, as functions of time ----
  const spinK = (tt) => (0.12 + 0.88 * smooth(SPIN[0], SPIN[1], tt)) * (1 - 0.78 * smooth(SLACK[0], SLACK[1], tt));
  // how far the air has turned by tt (the spin's integral), so what it carries keeps its place as the spin changes
  const TURN = new Float64Array(Math.ceil((D + 1) * 240) + 2);
  for (let i = 1; i < TURN.length; i++) TURN[i] = TURN[i - 1] + spinK((i - 0.5) / 240) / 240;
  const turned = (tt) => {
    const f = clamp(tt, 0, D + 1) * 240, i = Math.min(TURN.length - 2, Math.floor(f));
    return TURN[i] + (TURN[i + 1] - TURN[i]) * (f - i);
  };
  const top = (tt) => 5 + (H - 1) * ease.outCubic(clamp((tt - CLIMB[0]) / (CLIMB[1] - CLIMB[0])));   // the head, 5 up to H + 4
  // screen y of the mouth, and the tall snow cloud that keeps going above it
  const SPAN = 118, LEAN = 10;
  const girth = (tt) => (0.42 + 0.58 * smooth(FATTEN[0], FATTEN[1], tt)) * (1 - 0.5 * smooth(SLACK[0], SLACK[1], tt));
  const strength = (tt) => smooth(0.3, 1.0, tt) * (1 - smooth(SLACK[0] + 0.2, SLACK[1], tt));
  // the snow the wall holds at height h: it drops out from the top down as the wind dies
  const load = (h, tt) => {
    const e = SLACK[0] + 0.05 + 0.7 * (1 - clamp(h / H));
    return 1 - smooth(e, e + 0.45, tt);
  };
  const radius = (h) => 6 + 40 * Math.pow(clamp(h / H), 1.3);
  const flare = (h) => Math.min(0.35, Math.max(0, h - H * 0.82) * 0.04);   // what it carries swings wider at the mouth
  // the axis: the source's sway become a slow precession round the floor point (its top circles, so it swings across
  // and bobs a little toward and away from us), and the lean the dying rope takes on the draught
  const AX = [0, 0];
  const axis = (h, tt) => {
    const k = clamp(h / H), ph = tt / 2, a1 = TAU * ph + h * 0.05, a2 = TAU * ph * 2 - h * 0.11;
    AX[0] = (5 * Math.sin(a1) + 1.5 * Math.sin(a2)) * k - 2 * k + 16 * smooth(SLACK[0], SLACK[1] + 0.3, tt) * Math.pow(k, 1.5);
    AX[1] = (4 * Math.cos(a1) + 1.2 * Math.cos(a2)) * k;
    return AX;
  };
  // particles born at a steady rate, each kept or not by gate (how strong the whirl was at its birth):
  // fn(age, life, r, born), r the same numbers for that particle every frame
  const emit = (rate, seed, life0, life1, gate, fn) => {
    const n = Math.floor(t * rate), first = Math.max(0, Math.floor((t - life1) * rate) - 1);
    for (let i = first; i <= n; i++) {
      const g = rng(seed, i, 911), born = (i + g.next()) / rate, life = g.range(life0, life1), age = t - born;
      if (age < 0 || age >= life || g.next() >= gate(born)) continue;
      fn(age, life, rng(seed, i), born);
    }
  };

  // ---- the floor ----
  // the frost, pixel by pixel, its fixed fields worked out once: v how far out (0 middle .. 1 edge, ragged), fern the
  // feathers it grows past its edge, gone when it settles away, glint the few crystals that catch the light
  const FR = Math.ceil(FROST * 1.25), FRY = Math.ceil(FR * FL);
  const F = { x: [], y: [], v: [], fern: [], gone: [], glint: [] };
  for (let y = -FRY; y <= FRY; y++)
    for (let x = -FR; x <= FR; x++) {
      const fx = x + 0.5, fz = (y + 0.5) / FL, r = Math.hypot(fx, fz), th = Math.atan2(fz, fx);
      const edge = FROST * (1 + 0.14 * ringNoise(th, 1.6, S0) + 0.07 * ringNoise(th, 5, S0 + 1));
      const v = r / edge + 0.07 * (0.6 * noise2(fx * 0.06, fz * 0.06, S0 + 2) + 0.4 * noise2(fx * 0.15, fz * 0.15, S0 + 3));
      if (v >= 1.02) continue;
      const gn = 0.6 * noise2(fx * 0.05, fz * 0.05, S0 + 6) + 0.4 * noise2(fx * 0.14, fz * 0.14, S0 + 7);
      F.x.push(x); F.y.push(y); F.v.push(v);
      F.fern.push(0.6 * ringNoise(th, 9, S0 + 4) + 0.4 * ringNoise(th + r * 0.015, 21, S0 + 5));
      F.gone.push(0.9 * clamp(0.5 + 0.75 * gn) + 0.1 * rand(x + 300, y + 700, S0 + 8));
      F.glint.push(rand(x + 41, y + 13, S0 + 9) < 0.022);
    }
  const FN = F.x.length, FSET = pixelSet(FN, [-FR, -FRY, FR, FRY]);
  let fKey = "";

  // the drift: a low mound of snow round the foot, its height a smooth field the wind has swept into a spiral, one
  // value per floor pixel of the screen; it grows as the snow streams in and settles away at the end
  const DR = Math.ceil(DRIFT * 1.15), DRY = Math.ceil(DR * FL), DW = DR * 2 + 1, DHt = DRY * 2 + 1;
  const DB = new Float32Array(DW * DHt), DG = new Float32Array(DW * DHt), TW = [];
  for (let y = -DRY; y <= DRY; y++)
    for (let x = -DR; x <= DR; x++) {
      const i = (y + DRY) * DW + x + DR, fx = x + 0.5, fz = (y + 0.5) / FL, r = Math.hypot(fx, fz), th = Math.atan2(fz, fx);
      const d = r / (DRIFT * (1 + 0.2 * ringNoise(th, 1.8, S0 + 10) + 0.08 * ringNoise(th, 6, S0 + 18)));
      // toward its edge the snow lies in patches: a broken fringe, not a rim
      if (d >= 1 || (d > 0.72 && noise2(fx * 0.22, fz * 0.22, S0 + 19) < (d - 0.72) * 3.2 - 0.45)) continue;
      DB[i] = (1 - d * d) * (2.2 + 2.2 * (0.5 + 0.5 * noise2(fx * 0.12, fz * 0.12, S0 + 11))) * (1 - 0.32 * (0.5 + 0.5 * Math.sin(2 * th + r * 0.35)));
      const gn = 0.6 * noise2(fx * 0.09, fz * 0.09, S0 + 12) + 0.4 * noise2(fx * 0.2, fz * 0.2, S0 + 13);
      DG[i] = 0.9 * clamp(0.5 + 0.75 * gn) + 0.1 * rand(x + 90, y + 90, S0 + 14);
      if (DB[i] > 1.2 && rand(x + 7, y + 77, S0 + 15) < 0.05) TW.push({ x, y, i, ph: rand(x, y, S0 + 16) * TAU, f: 4 + rand(y, x, S0 + 17) * 4 });
    }
  const DSET = pixelSet(DW * (DHt + 4), [-DR, -DRY - 4, DR, DRY]), DBUF = new Uint32Array(DW * (DHt + 4));
  let dKey = "", dGrow = 0, dGone = 0;
  const dHeight = (i) => (DB[i] > 0 && DG[i] >= dGone ? Math.round(DB[i] * dGrow) : 0);
  // its smooth height at a screen floor pixel (for shading), and the four tones its snow takes, shade to light
  const smoothAt = (x, y) => {
    if (x < -DR || x > DR || y < -DRY || y > DRY) return 0;
    const i = (y + DRY) * DW + x + DR;
    return DB[i] > 0 && DG[i] >= dGone ? DB[i] * dGrow : 0;
  };
  const TONE = [C[4], C[5], C[6], WHITE];
  // the drift's height under a floor point, for what lands on it
  const driftAt = (x, z) => {
    const X = Math.floor(x), Y = Math.floor(z * FL);
    return X < -DR || X > DR || Y < -DRY || Y > DRY ? 0 : dHeight((Y + DRY) * DW + X + DR);
  };

  // ---- what it carries ----
  // snow and ice carried round the wall (st 0), then flung off the mouth or dropped as the wind dies (st 1, falling
  // free, fluttering), then lying where it landed (st 2) until it settles away
  const orbs = [];
  let orbAcc = 0, orbN = 0;
  const release = (b, flung) => {
    const lh = Math.min(b.h, H), Rr = radius(lh) * girth(t) * (b.out + flare(b.h)), [ax, az] = axis(lh, t);
    const vt = b.w * (1.5 - lh / H) * spinK(t) * Rr, push = flung ? R.range(10, 26) : R.range(0, 8), c = Math.cos(b.th), s = Math.sin(b.th);
    b.x = ax + c * Rr;
    b.z = az + s * Rr;
    b.vx = -s * vt + c * push;
    b.vz = c * vt + s * push;
    b.vh = flung ? R.range(4, 16) : R.range(-4, 6);
    b.st = 1;
  };

  // the wall's snow along each line of sight, gathered per pixel each frame (see wall below)
  const WX0 = -64, WX1 = 64, WY0 = -112, WY1 = 12, WW = WX1 - WX0 + 1, WHt = WY1 - WY0 + 1;
  const NEAR = new Float32Array(WW * WHt), NEARB = new Float32Array(WW * WHt), FAR = new Float32Array(WW * WHt), FARB = new Float32Array(WW * WHt);
  let wT = -1;
  const splat = (Dn, Bn, X, Y, w, b) => {
    const yy = Y - 0.5 - WY0, y0 = Math.floor(yy), f = yy - y0, i = y0 * WW + X - WX0;
    if (y0 < 0 || y0 + 1 >= WHt || X < WX0 || X > WX1) return;
    Dn[i] += w * (1 - f);
    Bn[i] += w * b * (1 - f);
    Dn[i + WW] += w * f;
    Bn[i + WW] += w * b * f;
  };
  // the blow of it landing: two rings of frost race out over the boards, and a star of ice cracks is left in them
  const RINGS = [{ t0: 0.02, life: 0.55, r0: 7, r1: FROST * 1.02, w: 2.6 }, { t0: 0.09, life: 0.45, r0: 4, r1: FROST * 0.6, w: 1.8 }];
  function impact(p) {
    const age = t - 0.03;
    if (age <= 0) return;
    const k = clamp(age / 0.4), gone = smooth(SETTLE[0], SETTLE[1], t);
    if (gone < 0.98) {
      // a star of cracks in the frozen boards, white where they open then a cold fissure rime-filled
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * TAU + 0.29 + 0.6 * rand(i, 3, S0 + 61), L = (16 + 40 * rand(i, 8, S0 + 62)) * k;
        for (let d = 2; d < L; d += 1.4) {
          const j = (rand((i * 31 + d) | 0, (d * 7) | 0, S0 + 63) - 0.5) * 2.4;
          const x = Math.round(Math.cos(a) * d - Math.sin(a) * j), z = Math.sin(a) * d + Math.cos(a) * j;
          if (d < L * 0.3) p.px(x, z * FL, WHITE);
          else if (rand((i + d * 5) | 0, (d * 11) | 0, S0 + 64) < 0.4) p.px(x, z * FL, C[6]);
          else p.px(x, z * FL, mix(C[2], C[1], 0.35));
        }
      }
    }
    // the rings, a lit crest running out with the front
    for (const r of RINGS) {
      const a = t - r.t0;
      if (a <= 0 || a >= r.life) continue;
      const q = a / r.life, rr = r.r0 + (r.r1 - r.r0) * ease.outCubic(q), alpha = Math.pow(1 - q, 1.15) * 0.85;
      const steps = Math.max(24, Math.round(rr * 7));
      for (let i = 0; i < steps; i++) {
        const th = (i / steps) * TAU, wide = 1 + 0.9 * ringNoise(th, 3, S0 + 65 + r.t0 * 30);
        for (let w = 0; w < Math.ceil(r.w * wide); w++) {
          const r2 = rr - w * 0.75;
          p.blend(Math.round(Math.cos(th) * r2), Math.round(Math.sin(th) * r2 * FL), w === 0 ? WHITE : C[6], alpha * (1 - w / 3.2));
        }
      }
    }
  }

  // ice shards torn out of the frozen ground and thrown out by the spin: they tumble through the air and then stand
  // in the boards, bright tips catching the cold light, until the spell lets them go
  const SHARDS = [];
  for (let i = 0; i < 22; i++) {
    const a = R.range(0, TAU), sp = R.range(46, 118), up = R.range(90, 210);
    SHARDS.push({ delay: R.range(0.04, 0.45), x: 0, z: 0, h: 2, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vh: up,
      spin: R.range(-9, 9), s: R.range(1.1, 2.3), st: 0, land: 0, rot: R.range(0, TAU) });
  }

  // the snow cloud over its mouth: a tall ribbon widening as it entrains air, torn at the top and leaning with the
  // wind, so the spell reads as tall as the fire storm does
  function plume(p) {
    const st = strength(t) * (0.3 + 0.7 * smooth(0.5, 1.15, t));
    if (st <= 0.02) return;
    const tp = Math.min(H, top(t)), [ax, az] = axis(tp, t), y0 = az * FL - tp, wob = turned(t);
    const START = -4;
    for (let i = START; i <= SPAN; i++) {
      const f = (i - START) / (SPAN - START), y = Math.round(y0 - i);
      const sway = noise2(f * 2.6 + t * 0.22, t * 0.12, S0 + 71) * (2 + 7 * f) + LEAN * f * f;
      const cx = ax + sway;
      let lob = 0;
      for (let j = 0; j < 4; j++) { const c = (j / 4 + t / 1.15) % 1, d = (f - c) / 0.14; lob += Math.exp(-d * d) * (1.4 + 1.1 * j); }
      const MOUTH = Math.max(6, radius(tp) * girth(t) * 0.8);
      const half = (MOUTH * 0.6 + 10 * f + 26 * f * f + lob * 3.2) * (1 - 0.2 * smooth(0.86, 1, f));
      const a0 = st * 0.9 * smooth(0, 0.2, f) * Math.pow(1 - f, 1.05);
      if (a0 < 0.018) continue;
      const col = f < 0.3 ? mix(C[7], C[6], f * 2.4) : f < 0.7 ? mix(C[6], C[5], (f - 0.3) * 2.2) : mix(C[5], C[4], smooth(0.7, 1, f));
      const wide = Math.max(1, Math.round(half));
      for (let d = -wide; d <= wide; d++) {
        const dx = d / half;
        if (dx < -1 || dx > 1) continue;
        const topF = 0.92 - 0.2 * dx * dx + (0.16 + 0.1 * f) * ringNoise(Math.atan2(dx, f + 0.2) + wob * 0.25, 2.2, S0 + 72);
        const a = Math.min(0.96, a0 * Math.pow(1 - dx * dx, 0.5) * 1.5) * (1 - smooth(topF - 0.22, topF, f));
        if (a > 0.018) p.blend(Math.round(cx + d), y, col, a);
      }
    }
  }

  function shards(p, front) {
    const gone = smooth(SETTLE[0], SETTLE[1], t);
    for (const b of SHARDS) {
      if (t < b.delay) continue;
      if (b.st === 0) {
        if (b.z >= 0 !== front) continue;
        const x = Math.round(b.x), y = Math.round(b.z * FL - b.h), s = Math.round(b.s);
        const tilt = Math.round(Math.sin(b.rot) * 2);
        for (let j = -s; j <= s; j++) p.px(x + tilt + (j === s ? 0 : Math.round(Math.sin(b.rot + j) * 0.5)), y + j, j === -s || j === s ? WHITE : C[6]);
        p.px(x + tilt, y - s - 1, WHITE);
      } else if (b.g > gone) {
        const x = Math.round(b.x), y = Math.round(b.z * FL), s = Math.max(1, Math.round(b.s * 0.8));
        for (let j = 1; j <= s; j++) p.px(x, y - j, j === s ? WHITE : C[6]);
        p.px(x - 1, y, C[5]); p.px(x + 1, y, C[5]);
      }
    }
  }

  return {
    update(dt) {
      t += dt;
      // the shards fly out and stand where they land; the spell lets go of them as it settles
      for (const b of SHARDS) {
        if (t < b.delay || b.st === 1) continue;
        b.vh -= 430 * dt; b.vx -= b.vx * 1.1 * dt; b.vz -= b.vz * 1.1 * dt;
        b.x += b.vx * dt; b.z += b.vz * dt; b.h += b.vh * dt; b.rot += b.spin * dt;
        if (b.h <= 0) { b.h = 0; b.st = 1; b.land = t; b.g = rng(S0 + 88, (b.x * 13 + b.z * 7) | 0, S0 + 89).next(); }
      }
      // snow picked up off the drift and carried round, as many as the whirl can hold
      for (orbAcc += 32 * strength(t) * dt; orbAcc >= 1; orbAcc--)
        orbs.push({ st: 0, th: R.range(0, TAU), h: R.range(0, Math.max(0.5, Math.min(H * 0.6, top(t) - 3))), out: 1 + R.range(0.05, 0.3), w: R.range(7, 11), vc: R.range(14, 30),
          big: orbN++ % 5 === 0, ph: R.range(0, TAU), age: 0, hold: R.range(0.15, 0.85), g: R.next(), white: R.chance(0.5) });
      // as the wind dies the wall lets its snow go, from the top down: flakes fall out of it where it thins
      if (t > SLACK[0] && t < SLACK[1] + 0.6) {
        const tp = top(t), g = girth(t), sk = spinK(t);
        for (let i = 0; i < 48; i++) {
          const h = R.range(1, Math.min(H, tp));
          if (!R.chance((load(h, t - dt) - load(h, t)) * 1.6)) continue;
          const th = R.range(0, TAU), Rr = radius(h) * g * R.range(0.85, 1.15), [ax, az] = axis(h, t), c = Math.cos(th), s = Math.sin(th), vt = R.range(7, 11) * (1.5 - h / H) * sk * Rr;
          orbs.push({ st: 1, x: ax + c * Rr, z: az + s * Rr, h, vx: -s * vt, vz: c * vt, vh: R.range(-6, 4), big: R.chance(0.12), ph: R.range(0, TAU), g: R.next(), white: R.chance(0.5) });
        }
      }
      const sk = spinK(t), tp = top(t), drag = Math.exp(-3.4 * dt);
      for (const b of orbs) {
        if (b.st === 0) {
          // round and up on the spiral, faster low down
          b.age += dt;
          b.th += b.w * (1.5 - Math.min(b.h, H) / H) * sk * dt;
          b.h += b.vc * (0.4 + 0.6 * sk) * dt;
          if (b.h >= tp - 1) release(b, true);
          else if (load(Math.min(b.h, H), t) < b.hold) release(b, false);
        } else if (b.st === 1) {
          // falling free: the air slows it to a flake's slow fall, and it rocks from side to side as it comes down
          b.vx *= drag;
          b.vz *= drag;
          b.vh = b.vh * drag - 165 * dt;
          b.x += (b.vx + Math.cos(t * 4.3 + b.ph) * 9) * dt;
          b.z += (b.vz + Math.sin(t * 3.7 + b.ph) * 6) * dt;
          b.h += b.vh * dt;
          if (b.h <= driftAt(b.x, b.z)) (b.st = 2), (b.h = 0);
        }
      }
    },
    drawBack(p) {
      frost(p);
      impact(p);
      drift(p);
      lying(p);
      const st = strength(t), [ax0, az0] = axis(0, t);
      if (st > 0) {
        // the cold light of it on the floor round its foot, and in the air there
        floorLight(p, ax0, az0 * FL, 40, 20, C[4], 0.2 * st);
        p.glow(ax0, az0 * FL - 2, 20, C[4], 0.12 * st);
      }
      plume(p);
      shards(p, false);
      inflow(p, false);
      foot(p, false);
      streaks(p, false);
      orbiters(p, false);
      mouth(p, false);
      wall(p, true);
    },
    draw(p) {
      throat(p);
      wall(p, false);
      shards(p, true);
      inflow(p, true);
      streaks(p, true);
      orbiters(p, true);
      foot(p, true);
      mouth(p, true);
    },
  };

  // the frost: it runs out from the middle as a front, a crisp white crust forming just behind it, thick rime inside,
  // feathers reaching past its edge; it settles away patch by patch at the end
  function frost(p) {
    const a = t - SPREAD[0];
    if (a <= 0) return;
    const reach = 1.02 * ease.outCubic(clamp(a / (SPREAD[1] - SPREAD[0]))), gone = smooth(SETTLE[0], SETTLE[1], t);
    const key = reach < 1.02 ? String(t) : String(gone);
    if (key !== fKey) {
      fKey = key;
      FSET.n = 0;
      for (let i = 0; i < FN; i++) {
        const v = F.v[i];
        if (v >= reach || F.gone[i] < gone) continue;
        if (v > 0.84 && F.fern[i] < (v - 0.84) * 6 - 0.35) continue;   // past its edge only the feathers reach on, a little way
        if (reach < 1.02 && reach - v < 0.05) setPx(FSET, F.x[i], F.y[i], WHITE, 0.62);
        else if (F.glint[i]) setPx(FSET, F.x[i], F.y[i], WHITE, 0.85);
        else if (v < 0.42) setPx(FSET, F.x[i], F.y[i], C[6], 0.56);
        else if (v < 0.72) setPx(FSET, F.x[i], F.y[i], C[6], 0.42);
        else setPx(FSET, F.x[i], F.y[i], C[5], 0.32);
      }
    }
    drawSet(p, FSET);
  }

  // the drift, drawn as the low heap of snow it is: each floor pixel's column of snow standing on it, far rows first so
  // nearer columns hide what is behind them; its tops shaded by the slope of the heap, the faces of its steps a tone
  // darker than their tops, so the wind's spiral shows as soft ridges rather than lines
  function drift(p) {
    dGrow = smooth(GROW[0], GROW[1], t);
    dGone = smooth(SETTLE[0], SETTLE[1], t);
    if (dGrow <= 0) return;
    const key = `${Math.round(dGrow * 60)}/${dGone}`;
    if (key !== dKey) {
      dKey = key;
      DBUF.fill(0);
      for (let y = -DRY; y <= DRY; y++)
        for (let x = -DR; x <= DR; x++) {
          const hc = smoothAt(x, y), hg = Math.round(hc);
          if (hg < 1) continue;
          // lit from the far left and above: slopes that face that way bright, the near side of the heap in shade
          const L = (smoothAt(x + 1, y) - smoothAt(x - 1, y)) * 0.5 + (smoothAt(x, y + 1) - smoothAt(x, y - 1)) * 0.6;
          const lit = L > 0.16 ? 3 : L > -0.1 ? 2 : L > -0.36 ? 1 : 0;
          for (let j = 0; j < hg; j++) DBUF[(y - j + DRY + 4) * DW + x + DR] = TONE[j === hg - 1 ? lit : Math.max(0, lit - 1)];
        }
      DSET.n = 0;
      for (let Y = 0; Y < DHt + 4; Y++)
        for (let X = 0; X < DW; X++) {
          const c = DBUF[Y * DW + X];
          if (c) setPx(DSET, X - DR, Y - DRY - 4, c, 1);
        }
    }
    drawSet(p, DSET);
    // snow glitter: a few crystals on its top catch the light now and then
    for (const s of TW) {
      const hg = dHeight(s.i);
      if (hg < 1 || Math.sin(t * s.f + s.ph) < 0.88) continue;
      p.dot(s.x, s.y - hg + 1, WHITE, 1);
      p.light(s.x, s.y - hg + 1, C[6], 0.35);
    }
  }

  // what has landed: flakes lying on the frost and the drift, and crystals as bright flecks, settling away at the end
  function lying(p) {
    const gone = smooth(SETTLE[0], SETTLE[1], t);
    for (const b of orbs) {
      if (b.st !== 2 || b.g < gone) continue;
      const y = b.z * FL - driftAt(b.x, b.z);
      p.px(b.x, y, b.big || !b.white ? C[6] : WHITE);
      if (b.big) p.px(b.x + 1, y, C[5]);
    }
  }

  // the funnel's wall, seen along each line of sight. For every ring up its height and every column of pixels it
  // covers, the line of sight down that column meets the near wall once and the far wall once: there it passes
  // through as much wall as the ring's arc over that column (more where it grazes the wall edge on, at the sides),
  // and catches a wind band or not (helices round it, three a turn, turning with the air and climbing). That snow is
  // gathered per pixel, split between the two rows the meeting point falls across, then each pixel is blended once by
  // how much snow its line of sight passed through: smooth, densest along the sides, as the side view's rim is
  function gatherWall() {
    if (wT === t) return;
    wT = t;
    NEAR.fill(0); NEARB.fill(0); FAR.fill(0); FARB.fill(0);
    const tp = top(t), g = girth(t), ph = TAU * turned(t);
    for (let h = 1; h <= tp; h++) {
      const ld = load(h, t), k = h / H;
      if (ld <= 0.01) continue;
      const crestH = tp * (1 + 0.055 * (noise2(h * 0.03, t * 0.5, S0 + 66) - 0.5) * 2);
      const rho = ld * clamp((crestH - h) / 5) * (1 - smooth(0.74, 1.05, k)) * Math.min(1, h / 3.2);
      if (rho < 0.02) continue;
      const Rr = radius(h) * g * (1 - 0.08 * smooth(0.8, 1.02, h / tp)), [ax, az] = axis(h, t);
      for (let X = Math.ceil(ax - Rr - 0.5); X <= Math.floor(ax + Rr - 0.5); X++) {
        const dx = X + 0.5 - ax, s2 = Rr * Rr - dx * dx;
        if (s2 <= 0) continue;
        const sq = Math.sqrt(s2), th = Math.atan2(sq, dx);
        const wob = 1 + 0.05 * (noise2(th * 1.7 + ph * 0.3, t * 0.5, S0 + 67) - 0.5) * 2;
        const w = rho * Math.min(3.2, (Rr * wob) / Math.max(sq, 0.01));
        splat(NEAR, NEARB, X, (az + sq) * FL - h, w, 0.5 + 0.5 * Math.sin(4.6 * th + 0.55 * h - ph));
        splat(FAR, FARB, X, (az - sq) * FL - h, w, 0.5 + 0.5 * Math.sin(-4.6 * th + 0.55 * h - ph));
      }
    }
  }
  function wall(p, back) {
    gatherWall();
    const Pn = back ? FAR : NEAR, Pb = back ? FARB : NEARB, Qn = back ? NEAR : FAR, Qb = back ? NEARB : FARB;
    for (let y = 0; y < WHt; y++)
      for (let x = 0; x < WW; x++) {
        const i = y * WW + x, dp = Pn[i], dq = Qn[i] * 0.5, d = dp + dq;
        if (d < 0.05) continue;
        const b = (Pb[i] + Qb[i] * 0.5) / Math.max(0.001, d);
        let a = 1 - Math.exp(-0.95 * d * (0.4 + 1.0 * b));
        if (a < 0.02) continue;
        a *= 0.8 + 0.34 * b;                        // the bands itself: light where the wind band faces us, shade between
        // snow-laden air: blue where thin, paler over the bands, whitest where we look through the most of it
        const X = x + WX0, Y = y + WY0, rim = smooth(2.4, 4.8, d), snow = a * (0.8 + 0.2 * b);
        const col = mix(snow > 0.42 ? C[6] : C[5], WHITE, 0.5 * rim);
        if (back) p.blend(X, Y, mix(C[5], C[6], rim * 0.8 + b * 0.2), a * 0.92);
        else {
          p.blend(X, Y, col, a);
          if (rim > 0.5 || b > 0.85) p.light(X, Y, C[5], 0.05 * Math.min(1, d / 6));
        }
      }
  }

  // cold light in its throat, seen down its mouth
  function throat(p) {
    const st = strength(t), tp = top(t);
    if (st <= 0) return;
    for (const [f, r, c, k] of [[0.45, 34, C[4], 0.2], [0.15, 14, C[5], 0.24 + 0.06 * Math.sin(TAU * t * 2)], [0.05, 8, WHITE, 0.12]]) {
      const h = H * f;
      if (h > tp) continue;
      const [ax, az] = axis(h, t);
      p.glow(ax, az * FL - h, r, c, k * st * load(h, t));
    }
  }

  // wind streaks: arcs of snow-laden air swirling round the funnel and climbing it, a bright head and a thinning tail,
  // faster low down; the far half of each arc goes behind the wall, the near half in front
  function streaks(p, front) {
    const T = turned(t), tp = top(t), g = girth(t);
    emit(42, S0 + 20, 0.5, 0.95, strength, (age, life, r, born) => {
      const h0 = r.range(2, H), w = r.range(8, 12) * (1.45 - h0 / H), dT = T - turned(born), th = r.range(0, TAU) + w * dT, k = age / life;
      const fade = Math.min(1, age / 0.08) * (k > 0.7 ? (1 - k) / 0.3 : 1), L = r.range(0.7, 1.5), m = Math.ceil(L / 0.07);
      for (let j = 0; j <= m; j++) {
        const a = th - j * 0.07, s = Math.sin(a);
        if (s >= 0 !== front) continue;
        const h = Math.min(H + 4, h0 + 16 * dT - j * 0.25);
        if (h > tp + 1) continue;   // nothing above the head while it climbs
        const lh = Math.min(h, H), Rr = radius(lh) * g * (1 + Math.min(0.3, Math.max(0, h - H * 0.84) * 0.03)), [ax, az] = axis(lh, t), u = j / m;
        const c = front ? (u < 0.15 ? WHITE : u < 0.5 ? C[6] : C[5]) : u < 0.3 ? C[5] : u < 0.6 ? C[4] : C[3];
        p.dot(ax + Math.cos(a) * Rr, (az + s * Rr) * FL - h, c, fade * load(lh, t) * (u < 0.6 ? 1 : 1.5 - u * 1.2) * (front ? 1 : 0.85));
      }
    });
  }

  // snow and ice: carried round on the spiral (a streak back along its path, a bright head, crystals with a glint),
  // then falling free (a flake rocking down; a crystal tumbling between its two poses)
  function orbiters(p, front) {
    const g = girth(t);
    for (const b of orbs) {
      if (b.st === 0) {
        const s = Math.sin(b.th);
        if (s >= 0 !== front) continue;
        const lh = Math.min(b.h, H), Rr = radius(lh) * g * (b.out + flare(b.h)), [ax, az] = axis(lh, t), fade = Math.min(1, b.age / 0.1);
        const x = ax + Math.cos(b.th) * Rr, y = (az + s * Rr) * FL - b.h, th2 = b.th - 0.25;
        const x2 = ax + Math.cos(th2) * Rr, y2 = (az + Math.sin(th2) * Rr) * FL - b.h + 2;
        if (front) {
          p.line(x2, y2, x, y, (u) => (u > 0.6 ? C[6] : C[4]), (u) => u * fade);
          p.dot(x, y, b.big || b.white ? WHITE : C[6], fade);
          if (b.big) {
            for (const [dx, dy] of CROSS) p.dot(x + dx, y + dy, C[6], fade);
            p.glow(x, y, 5, C[5], 0.35 * fade);
          }
        } else {
          p.line(x2, y2, x, y, C[3], (u) => u * fade * 0.8);
          p.dot(x, y, b.big ? C[5] : C[4], fade);
        }
      } else if (b.st === 1) {
        if (b.z >= 0 !== front) continue;
        const x = b.x, y = b.z * FL - b.h, vy = b.vz * FL - b.vh, sp = Math.hypot(b.vx, vy);
        if (sp > 70) p.line(x - (b.vx / sp) * 2.5, y - (vy / sp) * 2.5, x, y, front ? C[5] : C[4], 0.7);
        if (b.big) {
          for (const [dx, dy] of Math.floor(t * 9 + b.ph * 3) % 2 ? CROSS : DIAG) p.dot(x + dx, y + dy, front ? C[6] : C[5], 1);
          p.dot(x, y, WHITE, 1);
          p.glow(x, y, 4, C[5], 0.25);
        } else p.dot(x, y, front ? (b.white ? WHITE : C[6]) : C[5], 1);
      }
    }
  }

  // snow boiling at its foot: soft puffs spinning round the base, lit on top
  function foot(p, front) {
    const T = turned(t), [ax, az] = axis(0, t), g = 0.6 + 0.4 * girth(t);
    emit(9, S0 + 30, 0.8, 1.25, (b) => smooth(0.15, 0.6, b) * (1 - smooth(SLACK[0] + 0.4, SLACK[1] + 0.2, b)), (age, life, r, born) => {
      const th = r.range(0, TAU) + r.range(4, 6) * (T - turned(born)), Rr = (9 + age * r.range(8, 16)) * g, s = Math.sin(th), k = age / life;
      if (s >= 0 !== front) return;
      const x = ax + Math.cos(th) * Rr, y = (az + s * Rr) * FL - 2 - age * r.range(4, 10), rad = 2 + 4 * k, a = 0.5 * (1 - k) ** 1.2 * Math.min(1, age / 0.1);
      p.disc(x, y, rad, front ? C[6] : C[5], (d) => a * (1 - d * d));
      p.disc(x - rad * 0.25, y - rad * 0.3, rad * 0.5, WHITE, (d) => a * 0.5 * (1 - d * d) * (1 - k));
    });
  }

  // snow thrown off the mouth (off the head while it climbs), spreading into a thin cloud that thins away
  function mouth(p, front) {
    const g = girth(t);
    emit(8, S0 + 40, 0.9, 1.35, (b) => smooth(0.45, 0.85, b) * (1 - smooth(SLACK[0], SLACK[0] + 0.5, b)), (age, life, r, born) => {
      const th = r.range(0, TAU), s = Math.sin(th);
      if (s >= 0 !== front) return;
      const h0 = top(born), lh = Math.min(h0, H), [ax, az] = axis(lh, t), k = age / life, Rc = Math.min(radius(lh) * g * (0.6 + age * 0.9), 36), rad = 3 + 6 * k;
      const x = ax + Math.cos(th) * Rc, y = (az + s * Rc) * FL - h0 - 2 - age * 4, a = 0.24 * (1 - k) * Math.min(1, age / 0.15);
      p.disc(x, y, rad * 0.8, C[6], (d) => a * (1 - d * d));
      p.glow(x, y, rad * 1.5, C[4], 0.08 * (1 - k));
    });
  }

  // snow streaming in along the floor from every side, a bright head and a trail behind: it keeps its spin as it
  // closes in, so it turns faster the nearer it gets, and lifts a little as it reaches the foot
  function inflow(p, front) {
    const [ax0, az0] = axis(0, t);
    emit(44, S0 + 50, 0.6, 0.9, (b) => smooth(0, 0.12, b) * (1 - 0.65 * smooth(0.9, 1.6, b)) * (1 - smooth(SLACK[0] - 0.2, SLACK[0] + 0.3, b)), (age, life, r, born) => {
      const r0 = r.range(30, 58), th0 = r.range(0, TAU), w = r.range(1.0, 1.5) * (0.4 + 0.6 * spinK(born)), k = age / life, m = 7;
      const fade0 = Math.min(1, age / 0.1) * (k > 0.8 ? (1 - k) / 0.2 : 1);
      for (let j = 0; j <= m; j++) {
        const u = k - j * 0.035;
        if (u < 0) break;
        const q = 1 - 0.78 * u, rr = r0 * q, th = th0 + (w * (1 / q - 1)) / 0.78, z = az0 + Math.sin(th) * rr;
        if (z >= 0 !== front) continue;
        p.dot(ax0 + Math.cos(th) * rr, z * FL - 0.6 - 2.5 * u * u, j === 0 ? WHITE : j < 3 ? C[6] : C[5], fade0 * (1 - j / (m + 1)) * 0.85);
      }
    });
  }
}
