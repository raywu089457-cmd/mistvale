// Arcane missiles for the game's 2:1 isometric camera: arcane/arcane-missiles rewritten for the floor the game sees,
// not its picture squashed, stretched or scaled. The recipe is the source's: a volley of violet bolts fans out of
// the hand, curls round on twisting ribbons and pops on the target one after another, a lock closing on it. What
// changed is the world it happens in:
//   - the volley fans out in 3D round the way he faces (`aim` radians on the floor, 0 = right, + toward us; or `dir`
//     0..7) and seeks: of the `targets` ({ x, z, h } round the caster: x across, z into the floor toward us, h the
//     height to hit) it takes the nearest in `range`, the ones ahead counting nearer, or with `spread` > 1 that many
//     of them, the bolts taking turns; with none in range the bolts fly out to the end of their range and pop there;
//   - the lock is a sigil of four brackets on the floor round the target's feet, 2:1, pulsing as each bolt lands;
//   - the pops throw their sparks every way in 3D, and the sparks fall to the floor at their own depth.
// The caster and the targets are the game's own characters (the caster stands at the origin): no stand-in.
// 1 px = 1 character sprite px (32 x 16 px tiles).
import { Lights, P, Rng, PAL, fit, clamp, smooth, ease, TAU, WHITE } from "../../core/index.js";
import { floorLight } from "../fire/_lib.js";
import { Fly3 } from "../_iso.js";

export const meta = {
  name: "Arcane missiles (iso)",
  desc: "arcane/arcane-missiles on the 2:1 floor: a volley of violet bolts fans out of the hand in 3D, seeks the nearest target in range and pops on it one after another.",
  tags: ["arcane", "missile", "projectile", "homing", "volley", "magic", "directional", "one-shot", "iso", "top-down"],
  size: [440, 300],
  origin: [220, 176],
  duration: 2.1,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  over: true,
  options: { palette: PAL.arcane, aim: 0, range: 180, spread: 1, targets: [{ x: 132, z: 52, h: 18 }], seed: 3 },
};

const FL = 0.5, HAND = 9, HH = 24, TRAIL = 18;

/** The targets the volley takes: up to n of those in range, nearest first, the ones ahead counting nearer. */
export function ranked(targets, aim, range, n) {
  return (targets ?? [])
    .map((q) => ({ q, d: Math.hypot(q.x, q.z) }))
    .filter((e) => e.d <= range && e.d >= 4)
    .map((e) => ({ q: e.q, s: e.d * (1.6 - 0.6 * Math.cos(Math.atan2(e.q.z, e.q.x) - aim)) }))
    .sort((a, b) => a.s - b.s)
    .slice(0, Math.max(1, n))
    .map((e) => e.q);
}

export function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed), END = meta.duration;
  const aim = o.dir != null && o.aim === meta.options.aim ? (o.dir * Math.PI) / 4 : o.aim;
  const fly = new Fly3({ rng: R, sparks: [WHITE, C[6], C[5], C[4]] }), lights = new Lights();
  const hx = Math.cos(aim) * HAND, hz = Math.sin(aim) * HAND;
  const picks = ranked(o.targets, aim, o.range, o.spread);
  const goals = picks.length ? picks.map((q) => ({ x: q.x, z: q.z, h: q.h ?? 18, feet: true })) : [{ x: Math.cos(aim) * o.range, z: Math.sin(aim) * o.range, h: HH, feet: false }];
  // each bolt leaves the hand on its own heading round the way he faces, then homes in harder and faster
  const fan = [-1.05, 0.7, -0.5, 1.1, -1.4], tilt = [0.5, -0.1, 0.75, 0.25, 0.05];
  const bolts = fan.map((a, i) => {
    const yaw = aim + a * 0.95 + R.range(-0.12, 0.12), pitch = tilt[i] + R.range(-0.1, 0.1), sp = R.range(130, 165), g = goals[i % goals.length];
    return { t0: 0.05 + i * 0.1, x: hx, z: hz, h: HH, vx: Math.cos(yaw) * Math.cos(pitch) * sp, vz: Math.sin(yaw) * Math.cos(pitch) * sp, vh: Math.sin(pitch) * sp, trail: [], hit: -1, on: false, g, tx: g.x + R.range(-2, 2), tz: g.z + R.range(-2, 2), th: g.h + R.range(-3, 3), tw: R.range(0, TAU), acc: 0 };
  });
  const pops = [];
  let t = 0;
  const S = (x, z, h) => [x, z * FL - h];

  return {
    update(dt) {
      t += dt;
      for (const b of bolts) {
        if (t < b.t0 || b.hit >= 0) continue;
        if (!b.on) {
          b.on = true;
          const [x, y] = S(hx, hz, HH);
          lights.add(x, y, 28, C[5], 0.7, 0.14);
          for (let i = 0; i < 4; i++) fly.spawn(P.MOTE, hx, hz, HH, b.vx * R.range(0.4, 0.9) + R.range(-30, 30), b.vz * R.range(0.4, 0.9) + R.range(-30, 30), b.vh * 0.6 + R.range(-30, 30), R.range(0.12, 0.25), C[6], 0.6);
        }
        const age = t - b.t0, dx = b.tx - b.x, dz = b.tz - b.z, dh = b.th - b.h, d = Math.hypot(dx, dz, dh) || 1;
        const sp = 150 + 560 * age * age, steer = Math.min(1, (1.4 + 15 * age) * dt);
        b.vx += ((dx / d) * sp - b.vx) * steer;
        b.vz += ((dz / d) * sp - b.vz) * steer;
        b.vh += ((dh / d) * sp - b.vh) * steer;
        const step = Math.hypot(b.vx, b.vz, b.vh) * dt;
        if (d <= Math.max(3, step) || age > 1.4) (b.x = b.tx), (b.z = b.tz), (b.h = b.th);
        else (b.x += b.vx * dt), (b.z += b.vz * dt), (b.h += b.vh * dt);
        b.trail.unshift(S(b.x, b.z, b.h));
        if (b.trail.length > TRAIL) b.trail.pop();
        if ((b.acc += dt) > 0.012) {
          b.acc = 0;
          if (R.chance(0.6)) fly.spawn(P.MOTE, b.x, b.z, b.h, -b.vx * 0.08 + R.range(-25, 25), -b.vz * 0.08 + R.range(-25, 25), -b.vh * 0.08 + R.range(-25, 25), R.range(0.2, 0.4), R.chance(0.5) ? C[6] : C[5], 0.55);
        }
        if (d <= Math.max(3, step) || age > 1.4) {
          b.hit = t;
          const [x, y] = S(b.x, b.z, b.h);
          pops.push({ t, x, y, fx: b.x, fz: b.z, fh: b.h, g: b.g });
          lights.add(x, y, 70, C[5], 0.9, 0.3);
          lights.add(x, y, 24, WHITE, 0.85, 0.09);
          // the pop: sparks every way round, falling to the floor at their own depth; motes and stars flung up
          for (let i = 0; i < 16; i++) {
            const a = R.range(0, TAU), el = R.range(-0.5, 0.8), c = Math.sqrt(1 - el * el), v = R.range(80, 200);
            fly.spawn(P.SPARK, b.x, b.z, b.h, Math.cos(a) * c * v, Math.sin(a) * c * v, el * v + 20, R.range(0.2, 0.5));
          }
          for (let i = 0; i < 7; i++) {
            const a = R.range(0, TAU), v = R.range(40, 120);
            fly.spawn(i % 2 ? P.STAR : P.MOTE, b.x, b.z, b.h, Math.cos(a) * v * 0.6, Math.sin(a) * v * 0.6, R.range(20, 110), R.range(0.25, 0.48), R.pick([WHITE, C[6], C[5]]), R.range(0.8, 1.6));
          }
        }
      }
      fly.update(dt);
      lights.update(dt);
      fly.cap(Math.max(0.001, END - 0.05 - t));
    },
    drawBack(p) {
      for (const g of goals) if (g.feet) lock(p, g, false);
      // each pop lights the floor under it
      for (const q of pops) {
        const k = 1 - (t - q.t) / 0.35;
        if (k > 0) floorLight(p, q.fx, q.fz * FL, 22, 11, C[5], 0.4 * k * clamp(1.3 - q.fh / 50));
      }
      fly.draw(p, (q) => q.z < 0);
      for (const b of bolts) if (b.z < 0) bolt(p, b);
    },
    draw(p) {
      for (const g of goals) if (g.feet) lock(p, g, true);
      for (const b of bolts) if (b.z >= 0) bolt(p, b);
      for (const q of pops) {
        const k = (t - q.t) / 0.42;
        if (k >= 0 && k < 1) pop(p, k, q.x, q.y);
      }
      fly.draw(p, (q) => q.z >= 0);
      lights.draw(p);
    },
  };

  function bolt(p, b) {
    if (!b.on) return;
    ribbon(p, b);
    if (b.hit < 0) head(p, b.trail[0][0], b.trail[0][1], b);
  }

  // the ribbon: a capsule tapering down the tail, white along its middle near the head, two strands twisting round
  function ribbon(p, b) {
    const pts = b.trail, n = pts.length, fade = b.hit < 0 ? 1 : 1 - clamp((t - b.hit) / 0.16);
    if (n < 2 || fade <= 0) return;
    for (let i = 0; i < n - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], L = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
      for (let d = 0; d < L; d += 0.5) {
        const u = (i + d / L) / (n - 1), x = x0 + ((x1 - x0) * d) / L, y = y0 + ((y1 - y0) * d) / L, a = (1 - u) * 1.7 * fade;
        const w = 2.6 * Math.pow(1 - u, 0.8) + 0.3;
        for (let q = -w; q <= w; q += 0.5) {
          const v = Math.abs(q) / w;
          p.dot(x + nx * q, y + ny * q, v < 0.35 ? (u < 0.25 ? WHITE : C[6]) : v < 0.7 ? (u < 0.4 ? C[6] : C[5]) : u < 0.5 ? C[5] : C[4], a * (v < 0.7 ? 1 : 0.75));
        }
        for (const s of [0, Math.PI]) {
          const ph = u * 10 - t * 26 + b.tw + s, off = Math.sin(ph) * (w + 1.4);
          if (Math.cos(ph) > -0.2) p.dot(x + nx * off, y + ny * off, Math.cos(ph) > 0.4 ? (u < 0.35 ? WHITE : C[6]) : C[4], a);
        }
      }
      if (i % 3 === 0) p.glow(x0, y0, 9 * (1 - i / n) + 3, C[5], 0.3 * (1 - i / n) * fade);
    }
  }

  function head(p, x, y, b) {
    for (let i = 0; i < 4; i++) {
      const a = t * 24 + (i * TAU) / 4 + b.tw, l = 5.5 + 1.5 * Math.sin(t * 50 + i);
      p.line(x + Math.cos(a) * 3.2, y + Math.sin(a) * 3.2, x + Math.cos(a) * l, y + Math.sin(a) * l, C[6]);
    }
    p.circle(x, y, 3.8, C[4]);
    p.circle(x, y, 3, C[5]);
    p.circle(x, y, 2.1, C[6]);
    p.circle(x, y, 1.2, WHITE);
    p.glow(x, y, 24, C[5], 0.6);
    p.glow(x, y, 7, WHITE, 0.4);
  }

  function pop(p, q, x, y) {
    if (q < 0.16) {
      const r = 9 * (1 - q / 0.16) + 1.5;
      p.circle(x, y, r + 1.5, C[5]);
      p.circle(x, y, r, WHITE);
    }
    if (q < 0.4) {
      const l = 15 * (1 - q / 0.4) + 3;
      for (let d = -l; d <= l; d++) {
        const a = Math.abs(d) / l, c = a < 0.3 ? WHITE : a < 0.65 ? C[6] : C[5];
        p.dot(x + d, y, c, 1.15 - a);
        p.dot(x, y + d * 0.7, c, 1.15 - a);
      }
    }
    const rr = 3 + 18 * ease.outCubic(q);
    p.ring(x, y, rr + 0.5, Math.max(1, 3 * (1 - q)), q < 0.3 ? WHITE : C[6], 1.2 - q);
  }

  // the lock: four brackets on the floor round the target's feet, closing in and turning, kicking as each bolt lands
  function lock(p, g, near) {
    const mine = pops.filter((q) => q.g === g), last = bolts.filter((b) => b.g === g).every((b) => b.hit >= 0) ? Math.max(...mine.map((q) => q.t)) : Infinity;
    const k = smooth(0, 0.22, t) * (1 - smooth(last + 0.05, last + 0.35, t));
    if (k <= 0) return;
    let kick = 0;
    for (const q of mine) kick = Math.max(kick, Math.exp(-(((t - q.t) / 0.06) ** 2)));
    const r = 11 + 10 * (1 - ease.outCubic(smooth(0, 0.22, t))) + 3 * kick, spin = t * 1.5, Y = g.z * FL;
    for (let i = 0; i < 4; i++) {
      const a0 = spin + (i * TAU) / 4 - 0.38;
      for (let a = a0; a <= a0 + 0.76; a += 0.05) {
        if (Math.sin(a) >= 0 !== near) continue;
        p.dot(g.x + Math.cos(a) * r, Y + Math.sin(a) * r * FL, kick > 0.4 ? WHITE : C[5], k);
      }
    }
    if (!near) floorLight(p, g.x, Y, 14, 7, C[4], 0.25 * k);
  }
}
