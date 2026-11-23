// Dark explosion for the game's 2:1 isometric camera: shadow/dark-explosion rewritten for the floor the game sees,
// not its picture squashed or scaled. The recipe is the source's (a black core that swallows the light around it,
// a shock ring, shards thrown out, dust, a last violet-white flare); what changed is the world it happens in:
//   - the blast happens at a point on the floor in front of the caster (o.aim, radians: 0 = screen right, + turning
//     toward us), not in the screen plane: its heart is a black ball held above that floor point, and the shock ring
//     and the scorch lie flat, 2:1, around it;
//   - the ring races out through the ground in every direction, so it reads as an ellipse, not a circle;
//   - what the core throws flies in three dimensions (x across, z into the floor, h up), lands at its own depth and
//     lies there, so the debris settles round the crater instead of falling down one line;
//   - the light inside the core is not drawn: the floor glow, the ring and the motes crossing it are all drawn first
//     and the black fill is laid over them last with unlight(), so the core stays a hole in the light, not a dark
//     disc on top of it;
//   - it ends as light again: the core collapses and one violet-white flare blows the last of it out.
// 1 px = 1 character sprite px (32 x 16 px floor tiles). The hero is 38 px tall.
import { Rng, fit, clamp, smooth, mix, hex, TAU } from "../../core/index.js";
import { ringNoise } from "../_iso.js";
import { VOID, unlight } from "./_lib.js";

export const meta = {
  name: "Dark explosion (iso)",
  desc: "dark-explosion on the 2:1 floor: a black core swallows the light, a violet shock ring races out flat, shards fly in 3-D and land, dust rolls low, a last violet-white flare.",
  tags: ["shadow", "dark", "explosion", "void", "debris", "dust", "one-shot", "iso", "top-down", "ground"],
  size: [224, 184],
  origin: [112, 130],
  duration: 0.9,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: VOID, aim: 0, seed: 4 },
};

const FL = 0.5;       // the floor's 2:1: a point z deep on the floor sits z / 2 down the screen
const REACH = 54;     // the blast's floor point, this far along the aim from the caster's feet
const CORE_H = 20;    // the black core's heart, this far above that floor point
const RING_R = 46;    // how far the shock ring runs through the floor
const G = 340;        // what the thrown shards fall under

/** The quadratic profile of a body thrown at speed v: distance covered in t with drag k. */
const glide = (t, k) => (1 - Math.exp(-k * t)) / k;

export function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed ?? 4), D = meta.duration;
  const aim = o.aim ?? 0, ax = Math.cos(aim), az = Math.sin(aim);
  // the heart on screen, and the floor point under it (what lies flat is drawn round that)
  const HX = ax * REACH, HY = az * REACH * FL - CORE_H;
  const FX = ax * REACH, FY = az * REACH * FL;
  // the ramp the ring reads through, dark inside to bright at its lip
  const RING = [C[3], C[4], C[5], C[6], C[7], C[7]];
  const DUSTC = mix(C[2], C[5], 0.42), DUST2 = mix(C[1], C[4], 0.5);

  // --- the core's ragged edge: one radius per angle, sampled from a smooth noise round the circle ---------------
  const edge = (th, r, tt = t) => r * (0.86 + 0.2 * ringNoise(th, 3.1, 7) + 0.07 * Math.sin(th * 5 - tt * 5.5));

  // --- solid fills: a flat ring and a soft floor puff, both drawn in whole pixels (no dither static) ------------
  // A ring lying 2:1 on the floor, drawn between floor radius r - w and r, one colour per pixel.
  function annulus(p, cx, cy, r, w, col) {
    const rr = Math.max(1.2, r), d0 = Math.max(0, 1 - Math.max(1, w) / rr);
    p.ellipse(cx, cy, rr, rr * FL, (d, ang) => (d > d0 ? col(d, ang) : 0), 1);
  }
  // A soft 2:1 floor puff: a smooth blend (no halftone), used for the dust the blast rolls out.
  function softEllipse(p, cx, cy, rx, ry, c, a) {
    if (rx < 0.6 || a <= 0.02) return;
    p.each(cx - rx, cy - ry, cx + rx, cy + ry, (lx, ly, sx, sy) => {
      const dx = (lx - cx) / rx, dy = (ly - cy) / ry, d2 = dx * dx + dy * dy;
      if (d2 >= 1) return;
      p.blendPx(sx, sy, c, a * (1 - Math.sqrt(d2)));
    });
  }

  // --- the motes it pulls in while it is a hole: started round it, spiralling in, gone before the collapse ------
  const MOTES = Array.from({ length: 18 }, () => ({
    a: R.range(0, TAU), r0: R.range(18, 30), t0: R.range(0.02, 0.32), dur: R.range(0.16, 0.32), spin: R.range(1.2, 2.4), big: R.chance(0.4),
  }));

  // --- shards and chunks thrown out of it: they fly in 3-D and lie where they come down ------------------------
  const THROWN = [];
  for (let i = 0; i < 16; i++) {
    const a = R.range(0, TAU), sp = R.range(26, 82);
    THROWN.push({ x: FX, z: az * REACH, h: CORE_H + R.range(-6, 6), vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vh: R.range(34, 118), a: R.range(0, TAU), va: R.range(-9, 9), s: R.int(1, 3), bounce: 2, delay: R.range(0.02, 0.13), rest: false, dust: 0 });
  }
  for (let i = 0; i < 6; i++) {
    const a = R.range(0, TAU), sp = R.range(20, 54);
    THROWN.push({ x: FX, z: az * REACH, h: CORE_H, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vh: R.range(44, 100), a: R.range(0, TAU), va: R.range(-5, 5), s: R.int(2, 4), bounce: 1, delay: R.range(0.04, 0.18), rest: false, dust: 1 });
  }

  // --- dust rolling out low over the floor (2:1), and the soot that stays after the light ----------------------------------
  const DUST = Array.from({ length: 10 }, () => ({
    a: R.range(0, TAU), t0: R.range(0.02, 0.16), life: R.range(0.4, 0.66), size: R.range(5, 9.5), sp: R.range(0.55, 0.95), spin: R.range(-1, 1),
  }));

  let t = 0;

  function step(dt) {
    for (const q of THROWN) {
      if (q.delay > 0) { q.delay -= dt; if (q.delay > 0) continue; }
      if (q.rest) continue;
      q.vh -= G * dt;
      const f = Math.exp(-2.2 * dt);
      q.vx *= f; q.vz *= f;
      q.x += q.vx * dt; q.z += q.vz * dt; q.h += q.vh * dt;
      q.a += q.va * dt;
      if (q.h > 0) continue;
      q.h = 0;
      if (q.bounce > 0 && -q.vh > 48) { q.bounce--; q.vh = -q.vh * 0.34; q.vx *= 0.55; q.vz *= 0.55; q.va *= 0.6; }
      else q.rest = true, q.dust = q.dust || 1;
    }
  }

  // --- what lies on the floor: a dark stain, the light bleeding out of the ground, then the two shock rings -----
  function ground(p) {
    const grow = smooth(0.01, 0.16, t);
    // the scorch: a soot puddle opening from the heart, three solid steps, ragged only at its rim
    const rx = 8 + 18 * grow;
    p.shade(FX - rx - 2, FY - rx * FL - 2, FX + rx + 2, FY + rx * FL + 2, (x, y) => {
      const dx = x + 0.5 - FX, dy = (y + 0.5 - FY) / FL, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const e = rx * (0.86 + 0.14 * ringNoise(a, 3.1, 17));
      if (d > e) return;
      return d > e * 0.72 ? mix(C[0], C[1], 0.65) : d > e * 0.4 ? C[0] : mix(C[0], C[1], 0.25);
    });
    // the light the core is holding: a violet wash out of the floor under it
    const lit = 1 - smooth(0.42, 0.64, t);
    if (lit > 0) {
      p.glow(FX, FY, 22 + 8 * grow, C[3], 0.2 * lit);
      p.glow(FX, FY - 2, 10 + 6 * grow, C[4], 0.18 * lit);
    }
    // the shock ring: one bright, one slower and dimmer behind it. Solid 2:1 bands, no dithered fill.
    for (let i = 0; i < 2; i++) {
      const age = t - 0.05 - i * 0.055;
      if (age < 0) continue;
      const k = clamp(age / (i ? 0.46 : 0.4));
      if (k >= 1) continue;
      const r = 6 + (RING_R * (i ? 0.66 : 1) - 6) * Math.sqrt(k);
      const th = Math.max(1, (i ? 2.8 : 4.6) * (1 - k) + 0.9);
      // the lip cools from a pale violet to a dim one, in two solid steps
      const col = mix(C[6], C[4], Math.min(1, k * 1.5));
      const dim = mix(C[4], C[2], Math.min(1, k * 1.2));
      annulus(p, FX, FY, r, th, (d) => (d > 0.995 - Math.min(1.3, th) / r ? col : dim));
    }
  }

  function dust(p) {
    for (const q of DUST) {
      const age = t - q.t0;
      if (age < 0 || age > q.life) continue;
      const k = age / q.life, u = 1 - (1 - k) * (1 - k);
      const d = 3 + RING_R * 0.66 * u * q.sp, h = 2 + 6 * Math.sin(Math.PI * k);
      const sx = FX + Math.cos(q.a + q.spin * 0.3 * u) * d, sy = FY + Math.sin(q.a + q.spin * 0.3 * u) * d * FL - h;
      const r = q.size * (1 + 1.35 * u), env = Math.sin(Math.PI * Math.min(1, k * 1.25)), al = 0.82 * (1 - k) * (0.35 + 0.65 * env);
      softEllipse(p, sx, sy, r, r * FL * 0.8, DUSTC, al);
      softEllipse(p, sx, sy - 1, r * 0.64, r * 0.64 * FL * 0.8, DUST2, al * 0.9);
    }
  }

  // --- the motes and the thrown shards (drawn in front of the ground, behind the black core) -------------------
  function motes(p) {
    for (const q of MOTES) {
      const age = t - q.t0;
      if (age <= 0) continue;
      const u = clamp(age / q.dur);
      if (u >= 1) continue;
      const r = q.r0 * Math.pow(1 - u, 1.7), a = q.a + q.spin * u * 2.6;
      const x = HX + Math.cos(a) * r, y = HY + Math.sin(a) * r * 0.86;
      const x2 = HX + Math.cos(a + 0.55) * (r + 5.5), y2 = HY + Math.sin(a + 0.55) * (r + 5.5) * 0.86;
      const rr = Math.hypot(x - HX, (y - HY) / 0.92), e = edge(Math.atan2(y - HY, x - HX), 14 + 6 * smooth(0.02, 0.2, t));
      if (rr < e + 1) continue;
      p.light(x2, y2, C[4], 0.55 * (1 - u) + 0.18);
      // a streak: the mote and the tail it is being dragged by, both solid pixels
      p.px(x, y, u < 0.3 ? C[7] : u < 0.7 ? C[6] : C[5]);
      p.px(x + 1, y + 0.5, C[4]);
      p.px(x + 2, y + 1, C[3]);
      if (q.big) p.px(x - 1, y - 0.5, C[6]);
    }
  }

  function thrown(p) {
    // the debris is the last of it to go: it stays solid, and the effect simply ends when the clock does
    for (const q of THROWN) {
      if (q.delay > 0) continue;
      const sx = q.x, sy = q.z * FL - q.h;
      if (q.rest) {
        // come down: a sliver lying at its own depth, one edge still catching the void light
        const ca = Math.cos(q.a), sa = Math.sin(q.a);
        for (let i = -q.s; i <= q.s; i++) {
          p.px(sx + ca * i * 1.2, sy + sa * i * 0.26, i === 0 ? C[4] : i < 0 ? C[2] : C[1]);
          if (q.s >= 2) p.px(sx + ca * i * 1.2, sy + sa * i * 0.26 + 1, C[1]);
        }
        if (q.s >= 3) p.px(sx - ca * 1.4, sy - 1, C[3]);
        continue;
      }
      const ca = Math.cos(q.a), sa = Math.sin(q.a), L = 1 + q.s;
      // in the air: a sliver tumbling, a dark body with one lit edge
      for (let i = -L; i <= L; i++) {
        const x = sx + ca * i, y = sy + sa * i * 0.7;
        p.px(x, y, i === 0 ? C[5] : i < 0 ? C[2] : C[0]);
        if (q.s >= 2) p.px(x + sa * 1.1, y - ca * 1.1, C[1]);
      }
      if (q.s >= 3) { p.px(sx + ca * 1.5, sy + sa * 1.5, C[4]); p.px(sx - ca * 1.5, sy - sa * 1.5, C[0]); }
    }
  }

  // --- the core itself: a ragged black ball holding the light inside it ----------------------------------------
  function core(p) {
    const grow = smooth(0.015, 0.14, t), collapse = smooth(0.44, 0.6, t);
    const r = 2.5 + (17.5 - 2.5) * grow - 14.5 * collapse;
    if (r < 1.4 || t >= 0.62) return;
    const R2 = partition(r);
    // a violet lip of light around the black ball, then the black laid over everything inside it
    p.glow(HX, HY, r + 7, C[4], 0.22 * (1 - collapse));
    p.shade(HX - R2 - 2, HY - R2 - 2, HX + R2 + 2, HY + R2 + 2, (x, y) => {
      const dx = x + 0.5 - HX, dy = y + 0.5 - HY, d = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
      const e = edge(th, r);
      if (d > e + 1.35) return;
      if (d > e) {                                                      // the rim: brightest under it, where the floor glows
        const up = clamp((dy + e) / (2 * e));
        return mix(C[4], C[6], up * up);
      }
      return d > e * 0.7 ? C[1] : C[0];                                  // the body: black, a breath of violet under it
    });
    // a hole in the light: nothing glows through the black
    unlight(p, HX - R2 - 2, HY - R2 - 2, HX + R2 + 2, HY + R2 + 2, (x, y) => {
      const dx = x + 0.5 - HX, dy = y + 0.5 - HY;
      return Math.hypot(dx, dy) < edge(Math.atan2(dy, dx), r) + 0.8;
    }, 0);
    // the light it is swallowing does not vanish: thin violet filaments slide across the black and are eaten
    if (r > 6 && t < 0.52) {
      for (let i = 0; i < 7; i++) {
        const ph = (t * 1.9 + i / 7) % 1, a0 = i * 2.39996 + t * 1.3;
        const rr = edge(a0, r) * (1 - 0.88 * ph);
        const x = HX + Math.cos(a0) * rr, y = HY + Math.sin(a0) * rr * 0.92;
        const ca = Math.cos(a0), sa = Math.sin(a0) * 0.92;
        const c = mix(C[6], C[5], ph);
        p.px(x, y, c);
        p.px(x - ca * 2, y - sa * 2, C[4]);
        p.px(x - ca * 3.6, y - sa * 3.6, C[3]);
      }
    }
  }

  /** A whole box round a ball of radius r, in local pixels. */
  const partition = (r) => Math.ceil(r) + 1;

  // --- the last flare: the core is gone, so the light comes back all at once -----------------------------------
  function flare(p) {
    const age = t - 0.62;
    if (age < 0) return;
    const k = clamp(age / 0.24), f = Math.pow(1 - k, 1.6);
    if (f <= 0) return;
    const L = 3 + 31 * (1 - k);
    p.glow(HX, HY, 8 + 24 * (1 - k), C[5], 0.5 * f);
    p.disc(HX, HY, 2 + 12 * (1 - k), C[6], f);
    p.disc(HX, HY, 1 + 4 * (1 - k), C[7], f);
    // the star: eight rays, long on the axes, shorter between, each a solid line of stepped colour
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4, len = i % 2 ? L * 0.5 : L, ca = Math.cos(a), sa = Math.sin(a);
      p.line(HX, HY, HX + ca * len, HY + sa * len, (u) => (u < 0.35 ? C[7] : u < 0.7 ? C[6] : C[5]), 1);
    }
    // and a flat ring of it racing out over the floor: a solid band that cools as it widens
    const rr = 8 + 28 * (1 - Math.pow(1 - k, 2)), th = Math.max(1, 2.4 * (1 - k) + 0.6);
    annulus(p, FX, FY, rr, th, (d) => (d > 0.99 - 1.2 / rr ? C[7] : d > 0.985 - 2.4 / rr ? C[5] : C[4]));
    p.glow(FX, FY, 18 + 26 * (1 - k), C[3], 0.22 * f);
  }

  return {
    update(dt) {
      t += dt;
      step(dt);
    },
    draw(p) {
      if (t >= D - 1e-6) return;
      ground(p);
      dust(p);
      thrown(p);
      core(p);
      motes(p);
      flare(p);
    },
  };
}
