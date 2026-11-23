// Magic missile for the game's 2:1 isometric camera: projectiles/magic-missile rewritten for the floor the game sees,
// not its picture squashed, stretched or scaled. The recipe is the source's: motes gather into an arcane orb at the
// caster's hand, it weaves to its target trailing a twisting ribbon and bursts into a star of light. What changed is
// the world it happens in:
//   - it seeks: of the `targets` ({ x, z, h }: where each stands on the floor round the caster, x across, z into the
//     floor toward us, and the height to hit them at) it takes the nearest within `range`, those the way he faces
//     (`aim` radians on the floor, 0 = right, + toward us; or `dir` 0..7) counting as nearer, and steers onto it in
//     3D, its grip tightening as it flies so it always arrives; with none in range it flies out to the end of its
//     range the way he faces and bursts there;
//   - it lights the floor under it as it flies; the burst throws its motes and sparks every way in 3D, the sparks
//     fall to the floor at their own depth.
// The caster and the target are the game's own characters (the caster stands at the origin): the effect draws no
// stand-in. 1 px = 1 character sprite px (32 x 16 px tiles).
import { Lights, P, Rng, fit, flare, sparkle, clamp, ease, TAU, WHITE } from "../../core/index.js";
import { floorLight } from "../fire/_lib.js";
import { Fly3 } from "../_iso.js";

export const meta = {
  name: "Magic missile (iso)",
  desc: "projectiles/magic-missile on the 2:1 floor: an arcane orb gathers at the hand, seeks the nearest target in range and weaves onto it trailing a twisting ribbon, then bursts.",
  tags: ["projectile", "magic", "arcane", "missile", "spell", "homing", "directional", "one-shot", "iso", "top-down"],
  size: [440, 300],
  origin: [220, 176],
  duration: 2.3,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  over: true,
  options: {
    palette: ["#140a26", "#2b1252", "#481c88", "#6b2cc0", "#9a48ec", "#c684ff", "#ecc8ff", "#ffffff"],
    aim: 0, height: 22, range: 180, speed: 240, targets: [{ x: 128, z: 64, h: 18 }], seed: 6,
  },
};

const FL = 0.5, CHARGE = 0.2, HAND = 7, MAXFLY = 1.25;

/** The target a missile from the origin aimed `aim` picks: the nearest in range, the ones ahead counting nearer. */
export function pick(targets, aim, range) {
  let best = null, bs = Infinity;
  for (const q of targets ?? []) {
    const d = Math.hypot(q.x, q.z);
    if (d > range || d < 4) continue;
    const s = d * (1.6 - 0.6 * Math.cos(Math.atan2(q.z, q.x) - aim));
    if (s < bs) (bs = s), (best = q);
  }
  return best;
}

export function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed), H = o.height, END = meta.duration;
  const aim = o.dir != null && o.aim === meta.options.aim ? (o.dir * Math.PI) / 4 : o.aim;
  const fly = new Fly3({ rng: R, sparks: [WHITE, C[6], C[5], C[4]] }), lights = new Lights();
  const tg = pick(o.targets, aim, o.range);
  // where it is going: the target's chest, or the end of its range the way he faces, at the hand's height
  const goal = tg ? [tg.x, tg.z, tg.h ?? 18] : [Math.cos(aim) * o.range, Math.sin(aim) * o.range, H];
  // where it starts: the hand, out from him the way he faces
  const m = { x: Math.cos(aim) * HAND, z: Math.sin(aim) * HAND, h: H, vx: 0, vz: 0, vh: 0 };
  {
    // thrown out ahead and a little up and to one side, so it curls in on what it seeks
    const side = R.chance(0.5) ? 1 : -1, s = o.speed * 0.75, ga = Math.atan2(goal[1] - m.z, goal[0] - m.x), a = (tg ? ga * 0.5 + aim * 0.5 : aim) + side * 0.55;
    m.vx = Math.cos(a) * s; m.vz = Math.sin(a) * s; m.vh = s * 0.3;
  }
  const trail = [];
  let t = 0, age = 0, hit = -1, at = null, lastFloor = 0;
  const pos = () => {
    // the weave: the orb swings round its course, gentler as it closes in
    const sp = Math.hypot(m.vx, m.vz) || 1, nx = -m.vz / sp, nz = m.vx / sp, d = Math.hypot(goal[0] - m.x, goal[1] - m.z, goal[2] - m.h);
    const env = clamp(age / 0.12) * clamp(d / 30), w = Math.sin(age * TAU * 2.4) * 5 * env, u = Math.sin(age * TAU * 1.6) * 4 * env;
    return [m.x + nx * w, m.z + nz * w, m.h + u];
  };
  const sx = (q) => q[0], sy = (q) => q[1] * FL - q[2];

  return {
    update(dt) {
      t += dt;
      if (t < CHARGE) {
        // motes spiral in to the hand from round it
        if (R.chance(0.8)) {
          const a = R.range(0, TAU), el = R.range(-0.6, 0.9), c = Math.sqrt(1 - el * el), d = R.range(12, 26), sp = d / 0.14;
          const ux = Math.cos(a) * c, uz = Math.sin(a) * c;
          fly.spawn(P.MOTE, m.x + ux * d, m.z + uz * d, H + el * d, -ux * sp - uz * sp * 0.5, -uz * sp + ux * sp * 0.5, -el * sp, 0.14, R.pick([C[5], C[6], WHITE]), 0.8);
        }
      } else if (hit < 0) {
        // the flight: steering onto the goal, its grip tightening the longer it flies
        age += dt;
        const dx = goal[0] - m.x, dz = goal[1] - m.z, dh = goal[2] - m.h, d = Math.hypot(dx, dz, dh) || 1;
        const sp = o.speed * (1 + age * 0.6), k = Math.min(1, (2.5 + 16 * age) * dt);
        m.vx += ((dx / d) * sp - m.vx) * k; m.vz += ((dz / d) * sp - m.vz) * k; m.vh += ((dh / d) * sp - m.vh) * k;
        const step = Math.hypot(m.vx, m.vz, m.vh) * dt;
        if (d <= Math.max(3, step) || age > MAXFLY) (m.x = goal[0]), (m.z = goal[1]), (m.h = goal[2]), (hit = t);
        else (m.x += m.vx * dt), (m.z += m.vz * dt), (m.h += m.vh * dt);
        const q = pos();
        trail.push({ q, t });
        if (R.chance(0.6)) fly.spawn(P.MOTE, q[0], q[1], q[2], R.range(-50, 50), R.range(-50, 50), R.range(-50, 50), R.range(0.2, 0.4), R.pick([C[4], C[5], C[6]]), 0.7);
        if (R.chance(0.25)) fly.spawn(P.STAR, q[0] + R.range(-3, 3), q[1] + R.range(-3, 3), q[2] + R.range(-3, 3), R.range(-10, 10), R.range(-10, 10), R.range(-10, 10), R.range(0.25, 0.5), C[6], R.range(0.6, 1.6));
        if (hit >= 0) {
          at = [m.x, m.z, m.h];
          const X = sx(at), Y = sy(at);
          lights.add(X, Y, 52, C[4], 0.95, 0.55);
          lights.add(X, Y, 22, WHITE, 0.8, 0.12);
          // the burst: motes and stars every way round, sparks that fall to the floor at their own depth
          for (let i = 0; i < 26; i++) {
            const a = R.range(0, TAU), el = R.range(-0.7, 0.8), c = Math.sqrt(1 - el * el), s = R.range(60, 150);
            fly.spawn(i % 3 ? P.MOTE : P.STAR, at[0], at[1], at[2], Math.cos(a) * c * s, Math.sin(a) * c * s, el * s, R.range(0.25, 0.45), R.pick([C[5], C[6], WHITE]), R.range(0.8, 1.8));
          }
          for (let i = 0; i < 18; i++) {
            const a = R.range(0, TAU), el = R.range(-0.4, 0.8), c = Math.sqrt(1 - el * el), s = R.range(100, 200);
            fly.spawn(P.SPARK, at[0], at[1], at[2], Math.cos(a) * c * s, Math.sin(a) * c * s, el * s, R.range(0.25, 0.6));
          }
          for (let i = 0; i < 14; i++) {
            const a = R.range(0, TAU), d = R.range(4, 22);
            fly.spawn(P.STAR, at[0] + Math.cos(a) * d, at[1] + Math.sin(a) * d, at[2] + R.range(-10, 10), 0, 0, R.range(2, 8), R.range(0.5, 1.1), R.pick([C[6], WHITE, C[5]]), R.range(0.8, 2.6), { delay: R.range(0.05, 0.45) });
          }
        }
      }
      fly.update(dt);
      lights.update(dt);
      fly.cap(Math.max(0.001, END - 0.05 - t));
      lastFloor = hit < 0 && t >= CHARGE ? 1 : Math.max(0, lastFloor - dt * 4);
    },
    drawBack(p) {
      // the orb lights the floor under it, brighter the lower it flies; the burst lights it too
      const q = t < CHARGE ? [m.x, m.z, H] : hit < 0 ? pos() : at;
      if (q && (t < CHARGE || lastFloor > 0)) {
        const k = (t < CHARGE ? t / CHARGE : lastFloor) * clamp(1.4 - q[2] / 40);
        floorLight(p, q[0], q[1] * FL, 16, 8, C[4], 0.45 * k);
      }
      if (hit >= 0 && t - hit < 0.5) floorLight(p, at[0], at[1] * FL, 34, 17, C[4], 0.5 * (1 - (t - hit) / 0.5) * clamp(1.3 - at[2] / 50));
      fly.draw(p, (q) => q.z < 0);
    },
    draw(p) {
      ribbon(p);
      fly.draw(p, (q) => q.z >= 0);
      // the orb: gathering at the hand, then flying, its heart white, a ring of light turning round it
      if (hit < 0) {
        const k = t < CHARGE ? t / CHARGE : 1, q = t < CHARGE ? [m.x, m.z, H] : pos(), x = sx(q), y = sy(q), r = 1 + 3 * ease.outBack(k);
        p.circle(x, y, r + 1.4, C[3]);
        p.circle(x, y, r + 0.4, C[5]);
        p.circle(x - 0.4, y - 0.4, r * 0.55, WHITE);
        for (let i = 0; i < 3; i++) {
          const a = t * 14 + (i * TAU) / 3;
          p.px(x + Math.cos(a) * (r + 3), y + Math.sin(a) * (r + 3) * 0.6, i ? C[6] : WHITE);
        }
        p.glow(x, y, 20, C[4], 0.65 * k);
        p.glow(x, y, 7, C[6], 0.5 * k);
      } else {
        // the burst: a star flare and a ring that open out and fade
        const e = (t - hit) / 0.5, X = sx(at), Y = sy(at);
        if (e < 1) {
          if (e < 0.5) flare(p, X, Y, 26 * Math.pow(1 - e * 2, 1.2) + 2, 1 - e * 2, C);
          if (e < 0.12) p.circle(X, Y, 6 * (1 - e / 0.12) + 1, WHITE);
          p.ring(X, Y, 4 + 20 * ease.outCubic(e), Math.max(1, 2.5 * (1 - e)), e < 0.3 ? C[6] : C[5], Math.min(1, (1 - e) * 1.5));
          if (e < 0.4) sparkle(p, X, Y, 7 * (1 - e / 0.4), C[6], C[4], 0.6 * (1 - e / 0.4));
        }
      }
      lights.draw(p);
    },
  };

  // the ribbon: a strip that twists as it trails the orb, its bright face and dark back taking turns, thinning from
  // the tail
  function ribbon(p) {
    const keep = trail.filter((q) => t - q.t < 0.32);
    for (let i = 1; i < keep.length; i++) {
      const a = keep[i - 1], b = keep[i], ax = sx(a.q), ay = sy(a.q), dx = sx(b.q) - ax, dy = sy(b.q) - ay, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
      for (let f = 0; f < 1; f += 0.5 / l) {
        const tt = a.t + (b.t - a.t) * f, k = 1 - (t - tt) / 0.32, tw = Math.sin(tt * 26), w = 3.2 * k * Math.abs(tw) + 0.4, face = tw > 0;
        const x = ax + dx * f, y = ay + dy * f;
        for (let s = -w; s <= w; s += 0.5) {
          const edge = Math.abs(s) > w - 0.8, c = face ? (edge ? C[6] : k > 0.6 ? C[5] : C[4]) : edge ? C[4] : C[2];
          p.dot(x + nx * s, y + ny * s, c, k > 0.35 ? 1 : k / 0.35);
        }
      }
      if (i % 3 === 0) p.glow(sx(b.q), sy(b.q), 6, C[4], 0.25 * (1 - (t - b.t) / 0.32));
    }
  }
}
