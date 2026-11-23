// Healing ring for the game's 2:1 isometric camera: holy/heal-aoe rewritten as an area heal for the floor the game
// sees, not its picture squashed, stretched or scaled. The recipe is the source's: a seed of green light sinks into
// the floor and a soft ring rolls out from it, the floor glows where it passes, plus signs sprout and float up. What
// changed is the world it happens in:
//   - the ring rolls out 2:1 over the floor all round where it's cast (`reach`), far half behind, near half in front;
//     the plus signs sprout all over the area at their own depth, the dew rises off the floor behind the front;
//   - it heals: every one of `targets` ({ x, z, h }: the allies round it on the floor, x across, z into the floor
//     toward us, h how tall they stand) inside the reach is healed as the ring reaches them: a ring of light closes
//     round their feet, green light streams up them and plus signs rise off them;
//   - what it throws (motes, stars, dew) moves in 3D and settles or rises from where it is.
// The allies are the game's own characters: the effect draws no stand-in. 1 px = 1 character sprite px.
import { Lights, P, Rng, fit, mix, sparkle, flare, clamp, smooth, seg, ease, rand, TAU, WHITE } from "../../core/index.js";
import { GREEN, plus } from "./_lib.js";
import { Fly3 } from "../_iso.js";

export const meta = {
  name: "Healing ring (iso)",
  desc: "holy/heal-aoe as an area heal on the 2:1 floor: a seed of light sinks in, a ring rolls out over the floor, plus signs sprout, and every ally it reaches is healed.",
  tags: ["holy", "heal", "aoe", "ring", "plus", "ground", "one-shot", "iso", "top-down"],
  size: [256, 200],
  origin: [128, 132],
  duration: 2.9,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: GREEN, reach: 104, targets: [{ x: -52, z: -40, h: 28 }, { x: 60, z: 30, h: 28 }], seed: 6 },
};

const FL = 0.5, SEED = 0.3, ROLL = 1.0;

export function create(o) {
  const C = fit(o.palette, 8), REACH = o.reach, R = new Rng(o.seed), END = meta.duration;
  const fly = new Fly3({ rng: R, sparks: [WHITE, C[6], C[5], C[4]] }), lights = new Lights();
  const front = (tt) => (tt < SEED ? 0 : REACH * ease.outCubic(seg(tt, SEED, SEED + ROLL)));
  const passed = (d) => SEED + ROLL * (1 - Math.cbrt(1 - Math.min(0.999, d / REACH)));
  const sites = Array.from({ length: 30 }, (_, i) => {
    const a = R.range(0, TAU), d = REACH * Math.sqrt(R.range(0.04, 0.92)), big = i % 5 < 2;
    return { x: Math.cos(a) * d, z: Math.sin(a) * d, t0: passed(d) + R.range(0, 0.06), rise: R.range(18, 34), life: R.range(0.9, 1.3), sway: R.range(0, TAU), L: big ? 3 + (i % 5 === 0 ? 1 : 0) : i % 5 === 2 ? 1 : 2, thick: big ? 3 : 1, popped: false };
  });
  // the allies it reaches, and when
  const healed = (o.targets ?? []).filter((q) => Math.hypot(q.x, q.z) <= REACH).map((q) => ({ ...q, h: q.h ?? 28, t0: passed(Math.hypot(q.x, q.z)), done: false }));
  // their plus signs: a few each, rising off them in turn
  for (const q of healed)
    for (let k = 0; k < 4; k++) sites.push({ x: q.x + R.range(-6, 6), z: q.z + R.range(-2, 3), t0: q.t0 + 0.15 + k * 0.12, base: q.h * R.range(0.3, 0.8), rise: R.range(16, 26), life: R.range(0.8, 1.1), sway: R.range(0, TAU), L: k % 2 ? 2 : 3, thick: k % 2 ? 1 : 3, popped: false });
  const riders = Array.from({ length: 14 }, (_, i) => ({ a: (i / 14) * TAU + R.range(-0.2, 0.2), w: R.range(0.6, 1.1) * (i % 2 ? 1 : -1) }));
  let t = 0, released = false;

  return {
    update(dt) {
      t += dt;
      // the seed gathers: motes slide in over the floor to a point that brightens
      if (t < SEED - 0.04 && R.chance(0.7)) {
        const a = R.range(0, TAU), D = R.range(24, 48), T = R.range(0.16, 0.24), v = (D * 3) / (Math.exp(3 * T) - 1), h = R.range(1, 8);
        fly.spawn(P.STREAK, Math.cos(a) * D, Math.sin(a) * D, h, -Math.cos(a) * v, -Math.sin(a) * v, -h / T, T, R.chance(0.5) ? C[6] : C[5]);
      }
      if (!released && t >= SEED) {
        released = true;
        lights.add(0, -16, 76, C[5], 0.85, 0.55);
        lights.add(0, -6, 28, WHITE, 0.8, 0.12);
        for (let i = 0; i < 10; i++) fly.spawn(P.MOTE, R.range(-2, 2), R.range(-2, 2), R.range(2, 10), R.range(-25, 25), R.range(-15, 15), R.range(80, 170), R.range(0.3, 0.6), R.chance(0.5) ? WHITE : C[6], R.range(0.6, 1));
        for (let i = 0; i < 16; i++) {
          const a = R.range(0, TAU), sp = R.range(30, 90);
          fly.spawn(P.STAR, 0, 0, 3, Math.cos(a) * sp, Math.sin(a) * sp, R.range(20, 90), R.range(0.4, 0.8), R.chance(0.5) ? WHITE : C[6], R.range(0.6, 2));
        }
      }
      for (const s of sites)
        if (!s.popped && t >= s.t0) {
          s.popped = true;
          for (let i = 0; i < 3; i++) fly.spawn(P.STAR, s.x + R.range(-3, 3), s.z + R.range(-2, 2), (s.base ?? 0) + 1, R.range(-10, 10), R.range(-6, 6), R.range(15, 40), R.range(0.3, 0.6), R.chance(0.5) ? WHITE : C[6], R.range(0.5, 1.2));
        }
      // each ally the ring reaches: light streams up them
      for (const q of healed) {
        if (!q.done && t >= q.t0) {
          q.done = true;
          lights.add(q.x, q.z * FL - q.h * 0.5, 40, C[5], 0.8, 0.5);
        }
        if (q.done && t < q.t0 + 0.7 && R.chance(0.7))
          fly.spawn(R.chance(0.6) ? P.MOTE : P.STAR, q.x + R.range(-7, 7), q.z + R.range(-3, 3), R.range(0, q.h * 0.6), 0, 0, R.range(50, 110), R.range(0.3, 0.6), R.pick([WHITE, C[6], C[5]]), R.range(0.6, 1.3));
      }
      // dew rising off the glowing floor behind the ring
      if (t > SEED + 0.1 && t < 1.9 && R.chance(0.35)) {
        const fr = front(t), a = R.range(0, TAU), d = fr * Math.sqrt(R.next());
        fly.spawn(P.EMBER, Math.cos(a) * d, Math.sin(a) * d, 1, R.range(-5, 5), R.range(-3, 3), R.range(10, 30), R.range(0.5, 1), C[5], 1);
      }
      fly.update(dt);
      lights.update(dt);
      fly.cap(Math.max(0.001, END - 0.05 - t));
    },
    drawBack(p) {
      wash(p);
      ring(p, true);
      for (const q of healed) feet(p, q, true);
      sprouts(p, true);
      fly.draw(p, (q) => q.z < 0);
    },
    draw(p) {
      ring(p, false);
      for (const q of healed) feet(p, q, false);
      if (t < SEED) {
        const k = t / SEED;
        sparkle(p, 0, -3, 2 + 4 * k * k, WHITE, C[6], 0.3 + 0.4 * k);
        p.glow(0, -3, 10 + 16 * k, C[4], 0.5 * k);
      } else if (t < SEED + 0.2) flare(p, 0, -3, 22 * Math.pow(1 - (t - SEED) / 0.2, 1.5), 1 - (t - SEED) / 0.2, C.slice(3));
      // as it lets go, a jet of light leaps out of the floor, lets go of it and dissolves upward
      const g = seg(t, SEED, SEED + 0.5);
      if (g > 0 && g < 1) {
        const top = -4 - 46 * ease.outCubic(Math.min(1, g * 2.2)) - 10 * g, bot = -2 - 50 * ease.inQuad(seg(g, 0.35, 1)), w = 1 + 2.4 * (1 - g);
        if (bot - top > 2) {
          p.beam(0, bot, 0, top, w * 2, (u, v) => (v < 0.45 ? WHITE : u > 0.8 ? C[5] : C[6]));
          p.glowLine(0, bot, 0, top, 12, C[5], 0.55 * (1 - g));
          sparkle(p, 0, top, 4 * (1 - g) + 1, WHITE, C[6], 0.5 * (1 - g));
        }
      }
      for (const q of healed) surge(p, q);
      sprouts(p, false);
      fly.draw(p, (q) => q.z >= 0);
      lights.draw(p);
    },
  };

  // the floor glows behind the front as light, and goes dark again after it (light, not paint)
  function wash(p) {
    const fr = front(t);
    if (fr < 2 || t > 2.6) return;
    p.shade(-fr - 1, -fr * FL - 1, fr + 1, fr * FL + 1, (x, y, out) => {
      const d = Math.hypot(x + 0.5, (y + 0.5) / FL);
      if (d > fr) return;
      const age = t - passed(d), k = Math.exp(-age / 0.35) * smooth(fr, fr - 6, d) * (1 - smooth(1.4, 1.9, t));
      if (k < 0.04) return;
      out.l = C[4];
      out.k = 0.32 * k;
    });
  }

  // a ring on the 2:1 floor: uniform-thickness solid band of one colour per half (near lip brighter), no grain
  function solidRing(p, cx, cy, r, thick, keep, near) {
    const m = Math.ceil(r * TAU * 1.2), K = Math.max(2, Math.round(thick));
    for (let j = 0; j < m; j++) {
      const ang = (j / m) * TAU, ca = Math.cos(ang), sa = Math.sin(ang);
      if (!keep(ang)) continue;
      const px = cx + ca * r, py = cy + sa * r * FL;
      const nx = ca * FL, ny = sa, nl = Math.hypot(nx, ny) || 1;
      const c = near ? C[6] : C[5];
      for (let k = 0; k < K; k++) p.px(px - (nx / nl) * k, py - (ny / nl) * k, c);
    }
  }

  // a chunky plus of light: three-pixel arms in a single flat colour, so the glyph is a solid shape
  function solidPlus(p, X, Y, L, c, back) {
    const col = back ? C[4] : c;
    for (let i = -L; i <= L; i++) {
      for (let d = -1; d <= 1; d++) { p.px(X + d, Y + i, col); p.px(X + i, Y + d, col); }
    }
    if (!back) p.glow(X, Y, 4 + L * 2, C[4], 0.5);
  }

  function ring(p, back) {
    if (t < SEED) return;
    const u = seg(t, SEED, SEED + ROLL + 0.25), fr = front(t), live = u < 0.9;
    if (!live) return;
    const half = back ? -1 : 1, brk = seg(u, 0.86, 0.99);
    const keep = (g) => Math.sign(Math.sin(g)) === half && (brk <= 0 || Math.sin(g * 3 + 1.7 + (t - SEED) * 7) > -1 + 1.9 * brk);
    solidRing(p, 0, 0, fr, 4.5, keep, !back);
    // a crest of light blades rises off the front as it rolls
    for (let j = 0, n = Math.ceil(fr * 1.1); j < n; j++) {
      const g = (j / n) * TAU, near = Math.sin(g) >= 0;
      if (near === back) continue;
      const blade = Math.sin(g * 4 + t * 8 + (near ? 0 : 2.2));
      if (blade < (near ? 0.1 : 0.5) || brk > 0.45) continue;
      const x = Math.round(Math.cos(g) * fr), y = Math.sin(g) * fr * FL, h = Math.round((1.4 + 3.4 * (0.5 + 0.5 * blade)) * (near ? 1 : 0.6));
      for (let i = 1; i <= h; i++) {
        const cc = i >= h - 1 ? C[6] : i > h * 0.4 ? C[6] : near ? C[5] : C[4];
        p.px(x - 1, y - i, cc); p.px(x, y - i, cc); p.px(x + 1, y - i, cc);
      }
    }
    for (const r of riders) {
      const g = r.a + r.w * (t - SEED) * 2.2, near = Math.sin(g) >= 0;
      if (near !== back) continue;
      const x = Math.round(Math.cos(g) * fr), y = Math.sin(g) * fr * FL;
      for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) p.px(x + dx, y - 1 - dy, near ? C[6] : C[4]);
      if (!near) p.px(x, y, C[5]);
    }
    if (!back) for (let i = 0; i < 10; i++) {
      const g = (i / 10) * TAU;
      p.glow(Math.cos(g) * fr, Math.sin(g) * fr * FL - 2, 16, C[4], 0.22);
    }
  }

  // round a healed ally's feet: a ring of light closing in on them, far half behind them, near half in front
  function feet(p, q, back) {
    const a = (t - q.t0) / 0.45;
    if (a < 0 || a >= 1) return;
    const r = 16 * (1 - ease.outCubic(a)) + 5, keep = (g) => (Math.sin(g) < 0) === back;
    solidRing(p, q.x, q.z * FL, r, Math.max(2, 3.5 * (1 - a)), keep, !back);
  }
  // green light streaming up a healed ally, brightest at its feet
  function surge(p, q) {
    const a = (t - q.t0) / 0.7;
    if (a < 0 || a >= 1) return;
    const k = Math.sin(Math.PI * a), y0 = q.z * FL;
    p.glow(q.x, y0 - q.h * 0.5, q.h * 0.9, C[5], 0.4 * k);
    p.glow(q.x, y0 - 2, 12, C[6], 0.35 * k);
    for (let i = 0; i < 5; i++) {
      const u = (a * 1.6 + i / 5) % 1;
      if (u > 0.86 || k < 0.2) continue;
      const x = Math.round(q.x + Math.sin(i * 2.1 + t * 3) * 6), y = Math.round(y0 - u * q.h * 1.2);
      p.px(x, y, u < 0.22 ? WHITE : u < 0.6 ? C[6] : C[5]);
      if (u < 0.4) p.px(x, y + 1, C[5]);
    }
  }

  function sprouts(p, back) {
    for (const s of sites) {
      const a = t - s.t0;
      if (a < 0 || a > s.life || s.z < 0 !== back) continue;
      const u = a / s.life, h = s.rise * ease.outCubic(u) + (s.base ?? 0), x = s.x + Math.sin(a * 4 + s.sway) * 1.5 * u, y = s.z * FL - 2 - h;
      const pop = ease.outBack(clamp(a / 0.12), 2.6), end = s.life - 0.15, L = Math.max(1, Math.round(s.L * pop - (back ? 1 : 0)));
      if (a < 0.05) { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) p.px(x + dx, y + dy, WHITE); p.glow(x, y, 8, C[5], 0.6); }
      else if (a < end) solidPlus(p, Math.round(x), Math.round(y), Math.max(2, L), C[6], back);
      else {
        // it bursts into four sparks of light
        const v = (a - end) / 0.15, c = v < 0.4 ? WHITE : v < 0.85 ? C[6] : C[5];
        for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) p.px(x + dx * (2 + v * 5), y + dy * (2 + v * 5) - v * 2, c);
      }

      p.glow(x, y, 7 + L * 2, C[5], (back ? 0.2 : 0.34) * (a < end ? 1 : 1 - (a - end) / 0.15));
    }
  }
}

