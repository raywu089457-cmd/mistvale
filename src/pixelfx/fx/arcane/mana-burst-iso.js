// Mana burst for the game's 2:1 isometric camera: arcane/mana-burst rewritten for the floor the game sees, not its
// picture squashed, stretched or scaled. The recipe is the source's: energy rushes into a point and blows out in a
// white flash and rings, flinging glowing runes that flare and pop into sparks one after another. What changed is
// the world it happens in:
//   - the energy rushes in from all round in 3D, and the runes are flung out every way round the point (a ring of
//     them round it, some up), slowing hard and hanging, behind the point or in front of it as they lie;
//   - the shock is a ring racing out level with the point, 2:1, its far half behind; where the blast reaches the
//     floor a second ring runs out over it; the floor catches the light as a 2:1 pool;
//   - what it sprays (motes, stars, sparks) flies in 3D; the sparks fall to the floor at their own depth.
// 1 px = 1 character sprite px (32 x 16 px tiles).
import { Lights, P, Rng, PAL, fit, flare, sparkle, clamp, ease, TAU, WHITE } from "../../core/index.js";
import { sigil } from "./_lib.js";
import { floorLight } from "../fire/_lib.js";
import { Fly3 } from "../_iso.js";

const H = 28, GATHER = 0.22, N = 9, FL = 0.5;

/**
 * A ring lying level with the floor (2:1), drawn solid: colour steps across its thickness instead of band()'s
 * ordered-dither alpha, so it reads as clean light, not a speckled band. cols runs dark inner .. bright outer.
 */
function ringBand(p, cx, cy, r, thickness, cols, keep) {
  const th = Math.max(1, thickness);
  if (r < 0.5) return;
  const n = Math.ceil(r * TAU * 1.4);
  for (let j = 0; j < n; j++) {
    const g = (j / n) * TAU;
    if (keep && !keep(g)) continue;
    const ca = Math.cos(g), sa = Math.sin(g) * FL;
    for (let o = 0; o < th; o += 0.5) {
      const u = o / th, c = u < 0.2 ? cols[3] : u < 0.45 ? cols[2] : u < 0.75 ? cols[1] : cols[0];
      if (c) {
        const x = cx + ca * (r - o), y = cy + sa * (r - o);
        p.px(x, y, c);
        p.px(x, y + 1, c);   // two rows on screen, so the ring has a body instead of a dotted rim
      }
    }
  }
}

export const meta = {
  name: "Mana burst (iso)",
  desc: "arcane/mana-burst on the 2:1 floor: energy rushes into a point, blows out in a flash and level rings, flinging runes every way round that hang, flare and pop one by one.",
  tags: ["arcane", "burst", "mana", "rune", "nova", "magic", "ground", "one-shot", "iso", "top-down"],
  size: [236, 190],
  origin: [118, 124],
  duration: 1.9,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: PAL.arcane, seed: 9 },
};

export function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed), END = meta.duration;
  const fly = new Fly3({ rng: R, sparks: [WHITE, C[6], C[5], C[4]] }), lights = new Lights();
  // the runes: flung out every way round the burst, slowing hard, hanging while they burn, each popping in its turn
  const runes = Array.from({ length: N }, (_, i) => {
    const a = (i / N) * TAU + R.range(-0.25, 0.25), el = R.range(-0.15, 0.6), sp = R.range(150, 210), c = Math.cos(el);
    return { g: i, x: 0, z: 0, h: H, vx: Math.cos(a) * c * sp, vz: Math.sin(a) * c * sp, vh: Math.sin(el) * sp * 0.7, pop: GATHER + 0.42 + i * 0.065 + R.range(0, 0.05), popped: false, ph: R.range(0, TAU) };
  });
  const pops = [];
  let t = 0, released = false;
  const sy = (z, h) => z * FL - h;

  return {
    update(dt) {
      t += dt;
      if (t < GATHER - 0.03)
        for (let i = 0; i < 2; i++) {
          // the gather: streaks rush in from all round
          const a = R.range(0, TAU), el = R.range(-0.5, 0.9), c = Math.sqrt(1 - el * el), D = R.range(24, 52), T = R.range(0.12, 0.18), v = (D * 3) / (Math.exp(3 * T) - 1);
          const ux = Math.cos(a) * c, uz = Math.sin(a) * c, h = Math.max(2, H + el * D);
          fly.spawn(P.STREAK, ux * D, uz * D, h, -ux * v, -uz * v, ((H - h) / D) * v, T, R.chance(0.5) ? C[6] : C[5]);
        }
      if (t >= GATHER && !released) {
        released = true;
        lights.add(0, -H - 12, 96, C[5], 1, 0.5);
        lights.add(0, -H, 40, WHITE, 0.9, 0.1);
        // a spray of motes and stars every way round, and sparks that fall to the floor at their own depth
        for (let i = 0; i < 96; i++) {
          const a = R.range(0, TAU), el = R.range(-0.6, 0.9), c = Math.sqrt(1 - el * el), sp = R.range(90, 220);
          fly.spawn(R.chance(0.65) ? P.MOTE : P.STAR, 0, 0, H, Math.cos(a) * c * sp, Math.sin(a) * c * sp, el * sp, R.range(0.25, 0.55), R.pick([WHITE, C[6], C[5]]), R.range(0.8, 1.8));
        }
        for (let i = 0; i < 20; i++) {
          const a = R.range(0, TAU), el = R.range(-0.5, 0.8), c = Math.sqrt(1 - el * el), sp = R.range(110, 220);
          fly.spawn(P.SPARK, 0, 0, H, Math.cos(a) * c * sp, Math.sin(a) * c * sp, el * sp, R.range(0.3, 0.6));
        }
      }
      if (released)
        for (const r of runes) {
          if (r.popped) continue;
          const f = Math.exp(-4.2 * dt);
          r.vx *= f; r.vz *= f; r.vh = r.vh * f + 8 * dt;
          r.x += r.vx * dt; r.z += r.vz * dt; r.h = Math.max(6, r.h + r.vh * dt);
          if (R.chance(0.35)) fly.spawn(P.MOTE, r.x + R.range(-1.5, 1.5), r.z, r.h, r.vx * 0.2 + R.range(-10, 10), r.vz * 0.2, R.range(5, 25), R.range(0.2, 0.4), C[5], 0.5);
          if (t >= r.pop) {
            r.popped = true;
            pops.push({ t, x: r.x, z: r.z, h: r.h });
            const y = sy(r.z, r.h);
            lights.add(r.x, y, 34, C[5], 0.9, 0.22);
            lights.add(r.x, y, 12, WHITE, 0.8, 0.06);
            for (let i = 0; i < 9; i++) {
              const a = R.range(0, TAU), sp = R.range(60, 160);
              fly.spawn(P.SPARK, r.x, r.z, r.h, Math.cos(a) * sp * 0.8, Math.sin(a) * sp * 0.8, R.range(-20, 80), R.range(0.2, 0.45));
            }
            for (let i = 0; i < 5; i++) {
              const a = R.range(0, TAU), sp = R.range(20, 70);
              fly.spawn(i % 2 ? P.STAR : P.MOTE, r.x, r.z, r.h, Math.cos(a) * sp, Math.sin(a) * sp, R.range(5, 40), R.range(0.3, 0.6), R.pick([WHITE, C[6]]), R.range(0.8, 1.6));
            }
          }
        }
      fly.update(dt);
      lights.update(dt);
      fly.cap(Math.max(0.001, END - 0.05 - t));
    },
    drawBack(p) {
      // the floor beneath catches the burst, and each rune's pop
      const k = t < GATHER ? 0.4 * (t / GATHER) : Math.max(0, 1 - (t - GATHER) / 1.1);
      if (k > 0) floorLight(p, 0, 0, 56, 28, C[4], 0.32 * k);
      for (const q of pops) {
        const k2 = 1 - (t - q.t) / 0.3;
        if (k2 > 0) floorLight(p, q.x, q.z * FL, 14, 7, C[5], 0.3 * k2 * clamp(1.4 - q.h / 50));
      }
      shock(p, true);
      fly.draw(p, (q) => q.z < 0);
      for (const r of runes) if (r.z < 0) rune(p, r);
      for (const q of pops) if (q.z < 0) popAt(p, q);
    },
    draw(p) {
      if (t < GATHER) {
        // the point it gathers into: a swelling ball with a white heart
        const k = t / GATHER, r = 1 + 3.5 * k * k;
        p.circle(0, -H, r + 1.2, C[4]);
        p.circle(0, -H, r, C[6]);
        p.circle(0, -H, r * 0.5, WHITE);
        p.glow(0, -H, 10 + 20 * k, C[5], 0.4 + 0.4 * k);
        const q = clamp((t - GATHER * 0.35) / (GATHER * 0.65));
        if (q > 0 && q < 0.82) p.ring(0, -H, r + 2 + 16 * (1 - ease.outCubic(q)), 1, q > 0.6 ? WHITE : C[6], 1);
      } else {
        const q = (t - GATHER) / 0.6;
        if (q < 1) {
          if (q < 0.12) {
            p.circle(0, -H, 12 * (1 - q / 0.12) + 2, C[5]);
            p.circle(0, -H, 12 * (1 - q / 0.12), WHITE);
          }
          if (q < 0.32) flare(p, 0, -H, 30 * (1 - q / 0.32) + 4, 1 - q / 0.32, C);
          p.glow(0, -H, 60 * (0.4 + 0.6 * ease.outCubic(q)), C[5], 0.9 * (1 - q));
        }
      }
      shock(p, false);
      for (const r of runes) if (r.z >= 0) rune(p, r);
      for (const q of pops) if (q.z >= 0) popAt(p, q);
      fly.draw(p, (q) => q.z >= 0);
      lights.draw(p);
    },
  };

  // the shock: rings racing out level with the burst (far half behind), and where it reaches the floor a ring of
  // light running out over it
  function shock(p, far) {
    if (t < GATHER) return;
    const q = (t - GATHER) / 0.6;
    if (q >= 1) return;
    const keep = (g) => Math.sin(g) < 0 === far, e = ease.outCubic(q), r1 = 4 + 62 * e, r2 = 2 + 38 * ease.outCubic(Math.min(1, q * 1.4));
    const th = Math.max(2, 8 * (1 - q)), hi = q < 0.2 ? WHITE : C[6];
    ringBand(p, 0, -H, r1, th, [C[4], C[5], C[6], hi], keep);

    if (r1 > H) ringBand(p, 0, 0, Math.sqrt(r1 * r1 - H * H), Math.max(1, 3 * (1 - q)), [C[3], C[5], C[6], WHITE], keep);
  }

  // a rune: white as it flies, settling to lilac, flaring white just before it pops
  function rune(p, r) {
    if (!released || r.popped) return;
    const left = r.pop - t, hot = t - GATHER < 0.08 || left < 0.06, bob = Math.sin(t * 9 + r.ph) * 0.6, x = r.x, y = sy(r.z, r.h) + bob;
    sigil(p, r.g, x, y, hot ? WHITE : C[6], 1, hot ? C[4] : C[3]);
    p.glow(x, y, 10, C[5], hot ? 0.7 : 0.35);
    if (left < 0.06) sparkle(p, x, y, 3 + 4 * (1 - left / 0.06), C[6], C[5], 0.5);
  }

  // each pop: a small flare and a ring of light round it
  function popAt(p, q) {
    const k = (t - q.t) / 0.32, x = q.x, y = sy(q.z, q.h);
    if (k >= 1) return;
    if (k < 0.35) flare(p, x, y, 11 * (1 - k / 0.35) + 2, 1 - k / 0.35, C);
    p.ring(x, y, 2 + 11 * ease.outCubic(k), Math.max(1, 2 * (1 - k)), k < 0.3 ? WHITE : k < 0.62 ? C[6] : C[5], 1);
  }
}





