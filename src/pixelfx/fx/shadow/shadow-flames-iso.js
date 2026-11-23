// Shadow flames for the game's 2:1 isometric camera: shadow/shadow-flames rewritten for the floor the game sees.
// The source is inside-out fire: a pale violet skin round a pure black heart, tongues that climb and fall back,
// soot and embers. On the iso floor it becomes:
//   - a patch of ground in front of the caster (o.aim, radians: 0 = screen right, + turning toward us) where the
//     fire stands up out of the floor, its tongues rooted in a scorched 2:1 patch, not in a wall of fire;
//   - each tongue is its own life: it climbs, holds, falls back, and others climb while it dies, so the patch
//     breathes instead of being one frozen shape;
//   - the base is a soot mound lying flat (2:1) with the same black heart as the source at its centre, lit round
//     the rim by violet and with unlight() kept off it so it stays a hole;
//   - the smoke rolls low over the floor in every direction and the embers climb straight up the screen, so the
//     column and the floor stay separate planes.
// 1 px = 1 character sprite px (32 x 16 px floor tiles). The hero is 38 px tall.
import { Rng, fit, clamp, smooth, mix, TAU, noise2 } from "../../core/index.js";
import { ringNoise } from "../_iso.js";
import { flameTongue } from "../fire/_lib.js";
import { VOID, unlight, PK, Puffs } from "./_lib.js";

export const meta = {
  name: "Shadow flames (iso)",
  desc: "shadow-flames on the 2:1 floor: violet-black tongues climb and die back over a scorched patch, a soot base with a void heart, soot drifting low, embers climbing.",
  tags: ["shadow", "fire", "flame", "void", "smoke", "ember", "one-shot", "iso", "top-down", "ground"],
  size: [204, 192],
  origin: [104, 144],
  duration: 1.8,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: VOID, aim: 0, seed: 6 },
};

const FL = 0.5;       // the floor's 2:1: a point z deep on the floor sits z / 2 down the screen
const REACH = 50;     // the patch of ground the fire stands on, this far along the aim
const BASE_R = 15;    // the soot mound's floor radius (2:1 on screen)
const D = 1.8;

// a ring lying flat on the floor, drawn as SOLID pixels: no dithered alpha, so no halftone. `col(d, ang)` is
// called for every pixel of the 2:1 annulus and may return 0 to leave the floor showing through.
function annulus(p, cx, cy, r, w, col) {
  const rr = Math.max(1.2, r), d0 = Math.max(0, 1 - Math.max(1, w) / rr);
  p.ellipse(cx, cy, rr, rr * FL, (d, ang) => (d > d0 ? col(d, ang) : 0), 1);
}

export function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed ?? 6);
  const aim = o.aim ?? 0, ax = Math.cos(aim), az = Math.sin(aim);
  const FX = ax * REACH, FY = az * REACH * FL;      // the patch's centre on the floor, in screen space
  // the tongues' colours, laid on the way flameTongue wants them: brightest skin first, black heart last
  const H = [C[0], C[1], C[2], C[3], C[3], C[4], C[5], C[6]];
  const N = (rate, seed = 0, off = 0) => noise2(t * rate + off, seed * 7.3 + 0.5);
  // the soot puffs the wind takes off the top of the fire: violet-lit caps, violet-grey bodies. The bodies stay
  // above the dark band on purpose: Puffs draws them as soft alpha discs, and a near-black alpha body is exactly
  // the translucent dark mass that turns into a dithered halftone at 1 px per art px.
  const puffs = new Puffs({
    rng: R,
    flame: [C[7], C[6], C[5], C[3], C[1]],
    soot: [mix(C[3], C[5], 0.5), mix(C[2], C[4], 0.55)],
    cap: C[6],
    rim: [C[7], C[6], C[5]],
    floor: () => FY,
  });

  // --- the tongues: each one climbs from nothing, holds, then falls back to the mound; their lives overlap ------
  const TONGUES = [];
  for (let i = 0; i < 7; i++) {
    const a = R.range(0, TAU), rr = R.range(0.15, 1);
    TONGUES.push({
      dx: Math.cos(a) * BASE_R * 0.8 * rr, dz: Math.sin(a) * BASE_R * 0.8 * rr * FL,
      h0: R.range(24, 44), w: R.range(3.4, 6.2), sx: R.range(-6, 6), n: R.int(1, 99),
      t0: R.range(0.06, 0.66), life: R.range(0.7, 0.98), rate: R.range(3.5, 6),
    });
  }
  // the last tongues to go: they carry the fire through its final third instead of leaving one thin wisp
  for (let i = 0; i < 3; i++) {
    const a = R.range(0, TAU), rr = R.range(0.2, 0.9);
    TONGUES.push({
      dx: Math.cos(a) * BASE_R * 0.8 * rr, dz: Math.sin(a) * BASE_R * 0.8 * rr * FL,
      h0: R.range(18, 34), w: R.range(3.4, 5.6), sx: R.range(-4, 4), n: R.int(200, 299),
      t0: R.range(0.92, 1.22), life: R.range(0.5, 0.62), rate: R.range(3, 5.2),
    });
  }
  // a low crown licking round the mound: it keeps the silhouette wide where the big tongues leave gaps
  const CROWN = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + R.range(-0.16, 0.16), rr = R.range(0.72, 1);
    CROWN.push({
      dx: Math.cos(a) * BASE_R * rr, dz: Math.sin(a) * BASE_R * rr * FL,
      h0: R.range(6, 14), w: R.range(2.4, 3.6), sx: R.range(-2, 2), n: R.int(100, 199),
      t0: R.range(0.05, 0.2), life: R.range(1.45, 1.66), rate: R.range(4, 7),
    });
  }

  // --- embers climbing straight up the screen out of the patch ------------------------------------------------
  const EMBERS = Array.from({ length: 26 }, () => {
    const a = R.range(0, TAU), rr = R.range(0.2, 1);
    return {
      x: Math.cos(a) * BASE_R * 0.85 * rr, z: Math.sin(a) * BASE_R * 0.85 * rr * FL,
      vx: R.range(-11, 11), vh: R.range(34, 90), ph: R.range(0, TAU), t0: R.range(0.06, 1.0), life: R.range(0.5, 0.68),
    };
  });

  // --- the scorch: a soot patch with a violet heat lip, cooling through the tail ---------------------------------
  const CRACKS = Array.from({ length: 7 }, () => ({ a: R.range(0, TAU), l: R.range(5, 11), t0: R.range(0.06, 0.3) }));

  let t = 0, spawned = 0;

  // soot is let go in a slow trickle across the burn rather than all at the ignition
  function spawnSoot(dt) {
    const want = t < 1.36 ? 22 * Math.min(1, t / 0.16) * Math.min(1, (1.4 - t) / 0.36) : 0;
    while (spawned < want) {
      const a = R.range(0, TAU), rr = R.range(0.2, 1), d = BASE_R * 0.72 * rr;
      puffs.spawn(PK.SOOT, FX + Math.cos(a) * d, FY + Math.sin(a) * d * FL - R.range(2, 7),
        Math.cos(a) * R.range(5, 20), R.range(-10, -2), R.range(0.68, 1.0), R.range(3.0, 6.2), 0);
      spawned++;
    }
  }

  function step(dt) {
    spawnSoot(dt);
    puffs.update(dt);
  }

  // --- the floor: the burnt patch, its heat lip, the light it puts into the ground --------------------------------
  function ground(p) {
    const grow = smooth(0.02, 0.2, t), fade = 1 - smooth(1.42, 1.72, t);
    if (fade <= 0) return;
    const rx = (6 + (BASE_R + 2) * grow) * (0.3 + 0.7 * fade);
    // the soot: a puddle darker than the stone, ragged at the rim
    p.shade(FX - rx - 3, FY - rx * FL - 3, FX + rx + 3, FY + rx * FL + 3, (x, y) => {
      const dx = x + 0.5 - FX, dy = (y + 0.5 - FY) / FL, d = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
      const e = rx * (0.82 + 0.16 * ringNoise(th, 3.4, 21));
      if (d > e) return;
      return d > e * 0.72 ? C[1] : C[0];
    });
    // the burnt rim: one solid, ragged outline of soot right where the patch stops
    p.ellipse(FX, FY, rx, rx * FL, (d, ang) => {
      const e = 0.94 + 0.13 * ringNoise(ang, 3.6, 5);
      if (Math.abs(d - e) > 1.15 / rx) return 0;
      return ringNoise(ang, 7.7, 9) > 0.15 ? C[1] : C[0];
    }, 1);
    // the heat still in it: a violet lip round the rim, cooling from the edge in
    const cool = 1 - smooth(0.45, 1.35, t);
    if (cool > 0) {
      const lip = cool > 0.62 ? C[4] : cool > 0.3 ? C[3] : C[2];
      annulus(p, FX, FY, rx * 0.94, 1.4, (d) => (d > 0.99 - 1 / (rx * 0.94) ? lip : mix(lip, C[2], 0.5)));
      for (let i = 0; i < 6; i++) {
        const a = i * 1.7 + 0.8, r = rx * 0.9;
        p.px(FX + Math.cos(a) * r, FY + Math.sin(a) * r * FL, C[4]);
      }
    }
    // cracks: short violet scars in the soot while it is hot
    for (const q of CRACKS) {
      const age = t - q.t0; if (age < 0) continue;
      const k = clamp(age / 0.5);
      if (k >= 1) continue;
      const ca = Math.cos(q.a), sa = Math.sin(q.a), l = q.l * (0.5 + 0.5 * k);
      p.line(FX + ca * 2, FY + sa * 2 * FL, FX + ca * l, FY + sa * l * FL, (u) => (u < 0.5 ? C[3] : C[2]), 1);
    }
    // the light the fire puts down into the stone under it
    const lit = (0.16 + 0.1 * Math.sin(t * 11)) * (1 - smooth(1.3, 1.7, t));
    if (lit > 0) {
      p.glow(FX, FY, 20 + 8 * grow, C[3], lit);
      p.glow(FX, FY - 2, 11 + 5 * grow, C[4], lit * 0.8);
    }
  }

  // --- the first spark: the patch catches before the first tongue stands up --------------------------------------
  function ignition(p) {
    const f = 1 - smooth(0, 0.15, t);
    if (f <= 0) return;
    p.glow(FX, FY - 4, 4 + 9 * (1 - f), C[5], 0.45 * f);
    p.disc(FX, FY - 5, 1 + 2.2 * f, C[7], Math.min(1, f * 1.6));
    p.disc(FX, FY - 5, 0.8 + 1 * f, C[7], 1);
    annulus(p, FX, FY, 1.5 + 6 * (1 - f), 1.2, () => C[4]);
  }

  // --- one tongue's whole row of lives --------------------------------------------------------------------------
  function tongues(p, back) {
    for (const q of TONGUES) {
      const age = t - q.t0;
      if (age < 0 || age > q.life) continue;
      const isBack = q.dz < 0;
      if (isBack !== back) continue;
      const u = age / q.life;
      const env = Math.pow(Math.sin(Math.PI * u), 0.62) * (1 - smooth(1.62, D - 0.02, t));
      const h = q.h0 * env;
      if (h < 2) continue;
      const sway = N(q.rate, q.n, 0) * 2.2 + q.sx * u;
      const x = FX + q.dx + sway, y = FY + q.dz;
      flameTongue(p, x, y, h, q.w * 1.18 * (0.72 + 0.28 * Math.min(1, u * 5)), q.sx, N, q.n, H, undefined, 0.6, 1.4);
      // the tongue's tip burns violet-white for a moment as it dies back
      if (u > 0.68 && u < 0.92) p.px(x + sway * 0.4, y - h + 1, C[6]);
    }
    for (const q of CROWN) {
      const age = t - q.t0;
      if (age < 0 || age > q.life) continue;
      const isBack = q.dz < 0;
      if (isBack !== back) continue;
      const u = age / q.life;
      const env = Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 0.8) * (1 - smooth(1.62, D - 0.02, t));
      const h = q.h0 * env;
      if (h < 1.4) continue;
      flameTongue(p, FX + q.dx + N(q.rate, q.n, 0) * 1.2, FY + q.dz, h, q.w * 1.12, q.sx, N, q.n, H, undefined, 0.5, 0.9);
    }
  }

  // --- the soot mound lying flat on the floor, and the black heart at its centre ---------------------------------
  function base(p) {
    const grow = smooth(0.03, 0.2, t), fade = 1 - smooth(1.46, 1.7, t);
    if (fade <= 0) return;
    // the mound shrinks away at the end instead of fading: solid steps only, so no dithered skin
    const rx = (BASE_R * 0.42 + BASE_R * 0.58 * grow) * (0.35 + 0.65 * fade);
    // the mound: a low dome, 2:1, soot over violet stone
    p.ellipse(FX, FY - 2, rx, rx * FL, mix(C[1], C[2], 0.4), 1);
    p.ellipse(FX, FY - 3, rx * 0.78, rx * 0.78 * FL, C[1], 1);
    p.ellipse(FX, FY - 4, rx * 0.52, rx * 0.52 * FL, C[0], 1);
    // the violet heart: the source's black core, a hole with a violet lip round it
    const beat = 0.82 + 0.18 * Math.sin(t * 9.5);
    const hr = (3.5 + 3 * grow) * (1 - smooth(1.22, 1.46, t));
    if (hr > 1) {
      p.glow(FX, FY - 4, hr + 9, C[4], 0.26 * beat);
      p.ring(FX, FY - 4, hr + 1.1, 1.2, beat > 0.9 ? C[6] : C[5], 1);
      p.ellipse(FX, FY - 4, hr, hr * 0.9, C[0], 1);
      unlight(p, FX - hr - 2, FY - hr - 6, FX + hr + 2, FY + hr - 2, (x, y) => {
        const dx = x + 0.5 - FX, dy = (y + 0.5 - (FY - 4)) / 0.9;
        return Math.hypot(dx, dy) < hr;
      }, 0);
    }
  }

  // --- the embers -----------------------------------------------------------------------------------------------
  function embers(p) {
    for (const q of EMBERS) {
      const age = t - q.t0;
      if (age < 0 || age > q.life) continue;
      const u = age / q.life;
      const x = FX + q.x + q.vx * age + Math.sin(age * 7 + q.ph) * 2.4;
      const y = FY + q.z - q.vh * age + 26 * age * age;
      p.px(x, y, u < 0.35 ? C[7] : u < 0.7 ? C[6] : C[5]);
      if (u < 0.6) p.px(x + 1, y + 1, C[4]);
      if (u < 0.4) p.light(x, y, C[5], 0.22 * (1 - u));
    }
  }

  return {
    update(dt) {
      t += dt;
      step(dt);
    },
    draw(p) {
      if (t >= D - 1e-6) return;
      ground(p);
      ignition(p);
      tongues(p, true);
      base(p);
      puffs.draw(p, PK.SOOT, { x: FX, y: FY - 6, k: 0.8, reach: 40 });
      tongues(p, false);
      embers(p);
    },
  };
}
