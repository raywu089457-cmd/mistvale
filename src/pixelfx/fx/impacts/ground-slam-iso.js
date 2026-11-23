// Ground slam for the game's 2:1 isometric camera: impacts/ground-slam rewritten for the floor the game sees, not
// its picture squashed, stretched or scaled. The recipe is the source's (the floor takes the blow, cracks open and
// glow, shock waves race out, dust rolls out and a cloud stands up, rocks burst up and settle), but the world it
// happens in is the game's:
//   - the floor is a plane: the flash, the dent, the cracks and the shock rings all lie flat on it, squashed 2:1, and
//     the wave runs out in every direction round the impact instead of only left and right;
//   - height is height: the dust cloud and the rocks thrown up stand straight up the screen and come back down the
//     same way, never squashed into the floor;
//   - what is thrown flies in three dimensions (x across, z into the floor, h up) and lands at its own depth: sparks,
//     grit and rocks are drawn behind the impact while their depth is negative and in front of it once it is
//     positive, so the debris settles around the dent instead of in a line through it;
//   - the dent is a dish in the floor with its rim thrown up all round, the glow in it cools to soot, and the whole
//     mark dissolves into the dust before the effect ends.
// 1 px = 1 character sprite px (32 x 16 px tiles).
// The rocks, grit and dust recipes are adapted from Sprite Fusion's open-source explosion
// (https://www.spritefusion.com/pixel-art-vfx/explosion), MIT License, Copyright (c) 2026 Hugo Duprez.
import { Rng, fit, clamp, smooth, ease, TAU, WHITE, hex, mix } from "../../core/index.js";
import { stone, rock, rockShape, SOOT, dustRing } from "./_lib.js";
import { scorchFloor, bandFloor, floorShadow } from "../_iso.js";
import { pnoise, soft } from "../fire/_lib.js";

export const meta = {
  name: "Ground slam (iso)",
  desc: "impacts/ground-slam on the 2:1 floor: a flash, a dented, cracking floor, shock rings running out, dust rolling out and standing up, rocks bursting up and settling.",
  tags: ["impact", "ground", "slam", "shockwave", "quake", "rocks", "dust", "one-shot", "iso", "top-down", "ground"],
  size: [300, 240],
  origin: [150, 178],
  duration: 3.2,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: ["#2a1712", "#5e2c1c", "#a4502a", "#e8893a", "#ffc764", "#fff0b4", "#ffffff"], stone: "#4a3f69", reach: 104, seed: 5 },
};

const WAVE = 0.6;   // seconds for the shock front to run out
const FL = 0.5;     // the floor's 2:1: a point z deep on the floor sits z/2 down the screen
const DUST_C = hex("#8d8598");
const DUST_LIT = mix(DUST_C, WHITE, 0.3);
const DUST_WARM = hex("#b98a63");
const STONE_DUST = mix(DUST_C, hex("#7a6f86"), 0.5);

/** Where a body thrown in the game's 3D is t seconds after launch: drag on all three axes, gravity down. */
function fly(x0, z0, h0, vx, vz, vh, t, k = 2.2, ay = -427) {
  const e = Math.exp(-k * t), vt = ay / k, f = (1 - e) / k;
  return [x0 + vx * f, z0 + vz * f, h0 + vt * t + (vh - vt) * f];
}

/** When a body launched up at vh from h0 comes back to the floor (Infinity if it never does). */
function landAt(h0, vh, ay) {
  const disc = vh * vh + 2 * ay * h0;
  if (disc < 0) return Infinity;
  const t = (-vh + Math.sqrt(disc)) / ay;
  return t > 0 ? t : Infinity;
}

// a heat ramp for the scorched floor, from a fire palette: white-hot ... ember, soot
const fireRamp = (F) => [F[6], F[5], F[4], F[3], F[2], F[1], mix(F[1], F[0], 0.5), F[0]];
const heatRamp = (FR) => [...FR, mix(FR[FR.length - 1], SOOT, 0.35), mix(FR[FR.length - 1], SOOT, 0.7)];

export function create(o) {
  const C = fit(o.palette, 7), st = stone(o.stone), REACH = o.reach, R = new Rng(o.seed), D = meta.duration;
  const HR = heatRamp(fireRamp(C)), HOT = [WHITE, C[5], C[4], C[3]], SPKC = [C[5], C[4], C[2], C[1]];
  const front = (t) => 8 + (REACH - 8) * ease.outCubic(clamp((t - 0.01) / WAVE));   // the ring's radius on the floor
  const heat = (t) => Math.pow(clamp(1 - t / 1.1), 1.5);                            // the dent's glow cooling
  const fade = (t) => 1 - smooth(D - 0.75, D - 0.1, t);                             // how much of the mark is still there
  const gone = (qx, qz, t) => {                                                     // the mark dissolves into the dust
    if (fade(t) >= 0.995) return false;
    return (((qx * 7 + qz * 13) & 7) / 8) > fade(t);
  };

  // the dent: a dish in the floor, hot at the bottom, its rim thrown up all round
  const DISH = [];
  for (let z = -18; z <= 18; z++)
    for (let x = -20; x <= 20; x++) {
      const q = Math.hypot(x / 20, z / 18);
      if (q <= 1) DISH.push({ x, z, q });
    }
  // cracks: jagged walks out across the floor from the dent, a few forked
  const CRACKS = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + R.range(-0.16, 0.16), L = R.range(26, 62), pts = [];
    let x = Math.cos(a) * R.range(4, 8), z = Math.sin(a) * R.range(4, 8), d = 0, cur = a;
    pts.push([x, z, d]);
    while (d < L) {
      const s = Math.min(L - d, R.range(2, 4.5));
      cur += R.range(-0.42, 0.42);
      x += Math.cos(cur) * s;
      z += Math.sin(cur) * s * 0.92;
      d += s;
      pts.push([x, z, d]);
      if (R.chance(0.13) && d < L * 0.7) {   // a fork
        let fx = x, fz = z, fd = d, fc = cur + R.sign() * R.range(0.5, 1);
        const fork = [[fx, fz, fd]];
        for (let k = 0; k < 4; k++) {
          const fs = R.range(1.5, 3);
          fc += R.range(-0.6, 0.6);
          fx += Math.cos(fc) * fs; fz += Math.sin(fc) * fs * 0.92; fd += fs;
          fork.push([fx, fz, fd]);
        }
        CRACKS.push({ pts: fork, t0: R.range(0.01, 0.03), len: fd });
      }
    }
    CRACKS.push({ pts, t0: R.range(0, 0.03), len: L });
  }
  // embers caught in the cracks, flickering as they cool
  const EMBERS = [];
  for (const c of CRACKS) for (const [x, z, d] of c.pts) if (d > 3 && R.chance(0.2)) EMBERS.push({ x, z, life: R.range(0.8, 1.8), ph: R.range(0, TAU) });

  // contact: sparks off the stone. Low ones skitter out across the floor (2:1), most are thrown up.
  const SPARKS = Array.from({ length: 64 }, (_, i) => {
    const low = i < 16, s = R.sign();
    const a = low ? (s > 0 ? -R.range(0.04, 0.6) : Math.PI + R.range(0.04, 0.6)) : R.range(0, TAU);
    return { low, a, sp: low ? R.range(60, 160) : R.range(40, 130), vh: low ? 0 : R.range(90, 240), life: low ? R.range(0.16, 0.3) : R.range(0.22, 0.55), tb: low ? 0 : R.range(0, 0.06) };
  });
  // grit: floor bits thrown out every way, arcing over and lying where they come down
  const GRIT = Array.from({ length: 120 }, () => {
    const a = R.range(0, TAU), sp = R.range(40, 140), vh = R.range(8, 55);
    return { a, sp, vh, land: landAt(1, vh, -427), life: R.range(0.8, 1.5), c: R.pick([st.light, st.body, st.body, st.shade, st.shade, st.lip]), s: R.chance(0.3) ? 2 : 1 };
  });
  // rocks: three heavy ones that barely clear the dent, the rest thrown high; stepped so they bounce and settle
  const ROCKS = Array.from({ length: 26 }, (_, i) => {
    const s = i < 3 ? 5 : R.int(2, 4), a = R.range(0, TAU);
    const sp = s > 4 ? R.range(30, 70) : R.range(55, 140) * (s > 3 ? 0.8 : 1);
    return { s, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vh: s > 4 ? R.range(50, 95) : R.range(110, 240), x: 0, z: 0, h: 0, va: R.range(-9, 9), a2: R.range(0, TAU), rest: false, pts: rockShape(R) };
  });
  // the dust: a cloud that shoots up and mushrooms, and a heavy bank rolling out over the floor
  const PUFFS = Array.from({ length: 44 }, (_, i) => {
    const core = i < 26, s = R.sign();
    return { core, tb: R.range(0.02, core ? 0.3 : 0.22), x0: core ? R.range(-8, 8) : s * R.range(8, 24), z0: core ? R.range(-8, 8) : R.range(-22, 22), vh: core ? R.range(40, 105) : R.range(18, 55), life: R.range(1.2, 1.95), size: core ? R.range(7, 13) : R.range(3, 6), lit: R.chance(0.4), ph: R.range(0, TAU), hMax: core ? R.range(54, 94) : R.range(34, 62), dr: R.range(-8, 13) };
  });
  const BANK = Array.from({ length: 30 }, () => {
    const a = R.range(0, TAU), sp = R.range(90, 185);
    return { a, sp, tb: R.range(0.02, 0.3), life: R.range(1.2, 2.0), size: R.range(2.8, 6), ph: R.range(0, TAU) };
  });
  const FLAKES = Array.from({ length: 30 }, () => ({ x0: R.range(-26, 26), z0: R.range(-26, 26), vx: R.range(-10, 10), vz: R.range(-10, 10), vh: R.range(8, 55), life: R.range(1.0, 1.8) }));
  const WALL = [];   // dust kicked up by the front as it passes

  let t = 0;
  const acc = [R.next(), R.next()];

  // ---- drawing -------------------------------------------------------------------------------------------------
  const screen = (x, z, h) => [x, z * FL - h];
  const softs = [];
  const pushSoft = (x, z, h, size, k, col, big, ph) => { const [sx, sy] = screen(x, z, h); softs.push({ sx, sy, z, size, k, col, big, ph }); };

  // the dust cloud as one column: the core puffs give the envelope, filled a row at a time so it reads as one
  // billowing body of dust rather than a heap of balls; the bank and the wall are separate soft puffs
  function cloudDraw(p) {
    const core = softs.filter((q) => q.big);
    for (const q of softs) {
      if (q.big) continue;
      const r = q.size;
      if (r < 1.4) continue;
      const a = Math.min(1, q.k * 3) * 0.42, c = mix(q.col, SOOT, 0.35);
      soft(p, q.sx, q.sy, r * 1.05, c, a * 0.7);
      soft(p, q.sx - r * 0.15, q.sy - r * 0.25, r * 0.7, mix(c, WHITE, 0.14), a);
    }
    if (!core.length) return;
    let yTop = Infinity, yBot = -Infinity;
    for (const q of core) { yTop = Math.min(yTop, q.sy - q.size); yBot = Math.max(yBot, q.sy + q.size); }
    yTop = Math.floor(yTop) - 1; yBot = Math.min(8, Math.ceil(yBot) + 1);
    const H = yBot - yTop + 1;
    if (H <= 0) return;
    const baseC = mix(st.dust, SOOT, 0.44), litC = mix(baseC, DUST_WARM, 0.55), dkC = mix(baseC, SOOT, 0.42);
    for (let y = yTop; y <= yBot; y++) {
      let xl = Infinity, xr = -Infinity, kk = 0;
      for (const q of core) {
        const dy = y + 0.5 - q.sy;
        if (Math.abs(dy) > q.size) continue;
        const sp = Math.sqrt(q.size * q.size - dy * dy);
        if (q.sx - sp < xl) xl = q.sx - sp;
        if (q.sx + sp > xr) xr = q.sx + sp;
        if (q.k > kk) kk = q.k;
      }
      if (xr <= xl) continue;
      const rel = (y - yTop) / H, a = Math.min(1, kk * 3) * 0.78 * (0.45 + 0.55 * fade(t));
      const warmT = t < 0.7 ? 0.4 * (1 - t / 0.7) : 0;
      for (let x = Math.ceil(xl); x <= Math.floor(xr); x++) {
        const u = (x + 0.5 - xl) / (xr - xl);
        if (u < 0.1 && pnoise(x * 1.3 + y * 0.7, 13, 3) < 0.4) continue;
        if (u > 0.9 && pnoise(x * 1.3 + y * 0.7, 13, 5) < 0.4) continue;
        const nz = pnoise(x * 0.6 + y * 1.1 + t * 0.4, 31, 7) * 0.6 + pnoise(x * 0.25 - y * 0.5, 17, 11) * 0.4;
        let c;
        if (rel < 0.08 && nz > 0.15) c = litC;
        else if (rel > 0.9) c = dkC;
        else c = nz > 0.6 ? mix(baseC, SOOT, 0.16) : nz < 0.34 ? mix(baseC, litC, 0.2) : baseC;
        if (warmT > 0) c = mix(c, C[2], warmT * Math.max(0, 1 - Math.abs(x) / 30));
        p.blend(x, y, c, a);
      }
    }
  }

  function softDraw(p) {
    softs.length = 0;
    for (const q of PUFFS) {
      const age = t - q.tb;
      if (age < 0 || age > q.life) continue;
      const k = 1 - age / q.life;
      // the cloud climbs, swaying with the hot air, and widens (entrains) as it goes
      const [x, z, h] = fly(q.x0, q.z0, 2, 0, 0, q.vh, age, 1.3, 70);
      const sway = Math.sin(age * 1.7 + q.ph) * (0.5 + 2.6 * age) * (q.core ? 1 : 0.4);
      const drift = q.dr * age * (q.core ? 1 : 0.6);
      pushSoft(x + sway + drift, z, Math.min(q.hMax, Math.max(0, h)), q.size * (1 + 0.8 * (1 - k)), k, q.lit ? DUST_LIT : DUST_C, q.core, q.ph);
    }
    for (const q of BANK) {
      const age = t - q.tb;
      if (age < 0 || age > q.life) continue;
      const k = 1 - age / q.life;
      const [x, z, h] = fly(Math.cos(q.a) * 8, Math.sin(q.a) * 8, 2, Math.cos(q.a) * q.sp, Math.sin(q.a) * q.sp, 5, age, 2.4, 18);
      const sway = Math.sin(age * 1.2 + q.ph) * 2.2;
      pushSoft(x + Math.cos(q.a) * sway, z, Math.max(0, h), q.size * (1 + 1.0 * (1 - k)), k * 0.72, st.dust, false, q.ph);
    }
    for (const d of WALL) {
      const age = t - d.tb;
      if (age < 0 || age > 0.55) continue;
      const k = 1 - age / 0.55;
      const a = d.a + age * d.spin, rr = Math.min(104, d.r * (1 + age * 0.6));
      pushSoft(Math.cos(a) * rr, Math.sin(a) * rr, 1 + age * 9, (2.4 + 3.2 * d.big) * (1 + age * 1.2), k * 0.8, d.lit ? DUST_LIT : st.dust, false, d.ph);
    }
    softs.sort((a, b) => a.z - b.z);
    cloudDraw(p);
    // fine dust settling out of the cloud
    for (const q of FLAKES) {
      if (t > q.life) continue;
      const k = 1 - t / q.life;
      const [x, z, h] = fly(q.x0, q.z0, 26, q.vx, q.vz, q.vh * 0.35, t, 1.2, 22);
      if (h < 0) continue;
      const [sx, sy] = screen(x, z, h);
      p.blend(sx, sy, mix(st.lip, st.dust, 0.4), k * 0.7);
    }
  }

  function floorLayer(p) {
    // the scorch: the blow burns the floor from the middle out, then it cools to soot and blows away
    scorchFloor(p, HR, t, 30, 1.2, fade(t));
    // the shock rings, running out across the floor
    const u = clamp((t - 0.012) / (WAVE + 0.12));
    if (t > 0.012 && u < 0.96) {
      const fr = front(t), k = Math.pow(1 - u, 0.45);
      // the front itself: a hot line running out across the floor, its wake of dust right behind it
      dustRing(p, 0, 0, fr, 2 + 1.6 * k, clamp(k * 1.2), C[4], { sy: FL, ph: t * 9, lit: 0.2 });
      dustRing(p, 0, 0, fr * 0.94, 1.1 + 0.8 * k, clamp(k * 0.85), C[5], { sy: FL, ph: 2 + t * 7, lit: 0.35 });
      dustRing(p, 0, 0, fr * 1.01, 8 * k + 2, clamp(k * 0.5), mix(st.dust, STONE_DUST, 0.4), { sy: FL, ph: t * 6.3, brk: 0.25, lit: 0.5 });
    }
    // the dent's dish: soot in the bottom, its hot heart while it cools, its rim thrown up all round
    const mark = t > 0.02 && fade(t) > 0.001;
    if (mark) for (const q of DISH) {
      if (gone(q.x, q.z, t)) continue;
      if (q.q > 0.88) {
        const col = q.z < 0 ? (q.q > 0.96 ? st.light : st.lip) : q.q > 0.94 ? st.body : st.shade;
        p.px(q.x, q.z * FL - (q.z < 0 ? 1.5 : 1), col);
        continue;
      }
      const h = heat(t) * clamp((1 - q.q) * 1.9) * (0.72 + 0.28 * Math.sin(q.x * 1.9 + q.z * 1.5));
      const col = h > 0.66 ? HOT[0] : h > 0.44 ? HOT[1] : h > 0.24 ? HOT[2] : h > 0.08 ? HOT[3] : q.q < 0.5 ? SOOT : st.shade;
      p.px(q.x, q.z * FL - 0.5, col);
      if (h > 0.3) p.px(q.x, q.z * FL + 0.5, mix(col, 0, 0.35));
    }
    // cracks: they run out from the dent, white-hot first, cooling to dark
    if (mark) for (const c of CRACKS) {
      const g = c.len * ease.outCubic(clamp((t - c.t0) / 0.1));
      if (g <= 0) continue;
      for (let i = 1; i < c.pts.length; i++) {
        const [x0, z0, d0] = c.pts[i - 1], [x1, z1, d1] = c.pts[i];
        if (d0 >= g) break;
        const f = d1 > g ? (g - d0) / (d1 - d0) : 1, ex = x0 + (x1 - x0) * f, ez = z0 + (z1 - z0) * f;
        const h = heat(t) * clamp(1.25 - d0 / 42);
        const col = h > 0.78 ? HOT[0] : h > 0.52 ? HOT[1] : h > 0.3 ? HOT[2] : h > 0.13 ? HOT[3] : SOOT;
        for (let s = 0; s <= 1; s += 0.3) {
          const px = x0 + (ex - x0) * s, pz = z0 + (ez - z0) * s;
          if (gone(px, pz, t)) continue;
          p.px(px, pz * FL - 0.5, col);
          if (h < 0.5) p.px(px, pz * FL + 0.5, mix(col, 0, 0.45));
          else if (((px * 5 + pz * 3) | 0) & 3) p.px(px, pz * FL + 0.5, mix(col, 0, 0.3));
        }
      }
    }
    // embers in the cracks, flickering while they cool
    if (mark) for (const e of EMBERS) {
      const k = 1 - (t - 0.1) / e.life;
      if (t < 0.1 || k <= 0) continue;
      const f = 0.6 + 0.4 * Math.sin(t * 23 + e.ph);
      p.px(e.x, e.z * FL - 0.5, k * f > 0.55 ? C[5] : k * f > 0.25 ? C[4] : C[3]);
      p.glow(e.x, e.z * FL - 1, 5, C[4], 0.34 * k * f);
    }
    // the dust the shock front throws up, rolling out over the floor behind it
    const uu = clamp((t - 0.02) / (WAVE + 0.25));
    if (uu > 0 && uu < 1) {
      const dk = Math.pow(1 - uu, 1.1);
      dustRing(p, 0, 0, front(t) * 0.94, 10 * dk + 3, 0.55 * dk, mix(st.dust, SOOT, 0.2), { sy: FL, ph: t * 6.3, brk: 0.25, lit: 0.45 });
      dustRing(p, 0, 0, front(t) * 0.6, 8 * dk + 2, 0.36 * dk, mix(st.dust, SOOT, 0.12), { sy: FL, ph: 2.1 + t * 5.1, brk: 0.3, lit: 0.4 });
    }
    // the flash: a white star lying flat in the floor, its rays running out 2:1
    if (t < 0.1) {
      const q = 1 - t / 0.1;
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU + 0.1, L = (i % 2 ? 26 : 44) * q;
        const c = Math.cos(a), s = Math.sin(a) * FL;
        for (let d = 1; d <= L; d++) p.px(c * d, s * d, d < L * 0.45 ? WHITE : d < L * 0.75 ? C[5] : C[4]);
      }
      p.ellipse(0, 0, 10 + 34 * t, (10 + 34 * t) * FL, (d) => (d > 0.7 ? C[4] : d > 0.4 ? C[5] : WHITE));
    }
  }

  function debris(p, frontSide) {
    for (const q of SPARKS) {
      const age = t - q.tb;
      if (age < 0 || age > q.life) continue;
      const k = 1 - age / q.life;
      if (q.low) {
        // a spark skidding along the floor: its floor point, and the streak it left
        const x = Math.cos(q.a) * q.sp * age, z = Math.sin(q.a) * q.sp * age;
        if ((z >= 0) !== frontSide) continue;
        const [sx, sy] = screen(x, z, 0);
        const [px, py] = screen(x - Math.cos(q.a) * 6, z - Math.sin(q.a) * 6, 0);
        p.line(px, py, sx, sy, (u) => (u > 0.6 ? WHITE : C[3]), k);
      } else {
        const [x, z, h] = fly(0, 0, 1, Math.cos(q.a) * q.sp, Math.sin(q.a) * q.sp, q.vh, age, 1.6, -427);
        if (h < 0) continue;
        if ((z >= 0) !== frontSide) continue;
        const [sx, sy] = screen(x, z, h);
        const [px, py] = screen(...fly(0, 0, 1, Math.cos(q.a) * q.sp, Math.sin(q.a) * q.sp, q.vh, Math.max(0, age - 0.03), 1.6, -427));
        p.line(px, py, sx, sy, (u) => (u > 0.72 ? WHITE : u > 0.4 ? SPKC[1] : SPKC[2]), k);
      }
    }
    for (const q of GRIT) {
      if (t > q.life) continue;
      const down = t >= q.land;
      const [wx, wz, wh] = fly(0, 0, 1, Math.cos(q.a) * q.sp, Math.sin(q.a) * q.sp, q.vh, down ? q.land : t, 1.2, -427);
      if ((wz >= 0) !== frontSide) continue;
      const [sx, sy] = screen(wx, wz, down ? 0 : Math.max(0, wh));
      const k = 1 - t / q.life;
      if (k < 0.2) continue;
      p.px(sx, sy, q.c);
      if (q.s > 1) p.px(sx + (wz >= 0 ? 1 : -1), sy, mix(q.c, 0, 0.35));
    }
    // the rocks: stepped, so they bounce and settle; drawn where they are, shadowed on the floor below
    if (t < D - 0.04) for (const q of ROCKS) {
      if ((q.z >= 0) !== frontSide) continue;
      const [sx, sy] = screen(q.x, q.z, q.h);
      floorShadow(p, q.x, q.z * FL, 1.4 + q.s * 0.8, SOOT, 0.28 * Math.min(1, q.h / 30) + 0.1);
      rock(p, { x: sx, y: sy, s: q.s, a: q.a2, life: (D - t) * 0.5, pts: q.pts }, st);
    }
  }

  return {
    update(dt) {
      t += dt;
      // dust kicked up behind the racing front, all round the ring
      const u = clamp((t - 0.015) / WAVE);
      if (u > 0 && u < 1) {
        for (let i = 0; i < 2; i++) {
          for (acc[i] += dt * 110 * (1 - u * 0.7); acc[i] > 1; acc[i]--) {
            if (WALL.length > 190) break;
            WALL.push({ a: R.range(0, TAU), r: front(t) - R.range(0, 8), tb: t, spin: R.range(-0.2, 0.2), big: R.chance(0.4), lit: R.chance(0.3), ph: R.range(0, TAU) });
          }
        }
      }
      for (let i = WALL.length - 1; i >= 0; i--) if (t - WALL[i].tb > 0.55) WALL.splice(i, 1);
      // rocks fall, bounce once or twice and settle where they land
      for (const q of ROCKS) {
        if (q.rest) continue;
        q.vh -= 427 * dt;
        const f = Math.exp(-1.4 * dt);
        q.vx *= f; q.vz *= f; q.va *= f;
        q.h += q.vh * dt;
        q.x += q.vx * dt; q.z += q.vz * dt;
        q.a2 += q.va * dt;
        if (q.h <= 0) {
          q.h = 0;
          if (Math.abs(q.vh) > 40) { q.vh = -q.vh * 0.32; q.vx *= 0.55; q.vz *= 0.55; }
          else { q.vh = 0; q.vx = 0; q.vz = 0; q.va = 0; q.rest = true; }
        }
      }
    },
    drawBack(p) {
      floorLayer(p);
      softDraw(p);
      debris(p, false);
    },
    draw(p) {
      debris(p, true);
      // the impact itself: a white-hot star lying flat in the floor, seen through the dust while it is fresh
      const H = heat(t);
      if (H > 0.12) {
        const n = 16;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + 0.2, L = (3 + 15 * H) * (i % 2 ? 0.6 : 1);
          for (let d = 1; d <= L; d++) {
            const c = Math.cos(a) * d, s2 = Math.sin(a) * d * FL;
            p.px(c, s2, d < L * 0.4 ? WHITE : d < L * 0.7 ? C[5] : C[4]);
          }
        }
        p.px(Math.cos(t * 31) * 2, Math.sin(t * 27) * FL, WHITE);
        p.px(-1, -1, C[5]);
      }
      // the air above the dent is lit while it is hot
      if (H > 0) {
        p.glow(0, -1, 26 + 10 * H, C[4], 0.36 * H);
        p.glow(0, -3, 11, C[5], 0.34 * H);
      }
    },
  };
}
