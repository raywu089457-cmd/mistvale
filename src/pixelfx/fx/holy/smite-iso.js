// Smite for the game's 2:1 isometric camera: holy/smite rewritten as an attack on a mark on the floor the game
// sees, not its picture squashed, stretched or scaled. The recipe is the source's: a glint marks the spot, then a
// bolt of light drops like a hammer: a white flash, a shockwave over the floor, stone chips flying and cracks that
// glow and cool. What changed is the world it happens in:
//   - the mark, the crater and the cracks lie 2:1 on the floor, the cracks running out all round the mark (the
//     source's ran to the sides and toward us only); the shockwave races out 2:1 over the floor, and the air shock
//     is a dome over the hit, its foot on the floor;
//   - the chips, the grit and the sparks fly every way round in 3D and land at their own depth, the chips bouncing
//     and crumbling where they lie; the dust rolls out over the floor all round;
//   - pass the target as `actor` and the hit flashes it white and the glowing cracks light it from below.
// 1 px = 1 character sprite px (32 x 16 px tiles).
import { Lights, P, Rng, fit, sparkle, band, bolt, clamp, smooth, seg, lerp, ease, TAU, WHITE, hex, mix, scale, GRAVITY } from "../../core/index.js";
import { GOLD, oval, shapeOf } from "./_lib.js";
import { Fly3 } from "../_iso.js";

export const meta = {
  name: "Smite (iso)",
  desc: "holy/smite on the 2:1 floor: a glint marks the spot, a hammer of light drops on it, a shockwave and cracks run out all round, chips fly and land at their own depth.",
  tags: ["holy", "smite", "strike", "impact", "light", "attack", "ground", "one-shot", "iso", "top-down"],
  size: [236, 220],
  origin: [118, 172],
  duration: 2.8,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: GOLD, stone: "#5a5066", seed: 9 },
};

const TOP = -160, FL = 0.5, MARK = 0.42, HIT = 0.54, LEN = 44;
const OUTLINE = hex("#1a1422");

export function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed), s0 = hex(o.stone), END = meta.duration;
  const st = [scale(s0, 0.5), scale(s0, 0.75), s0, mix(scale(s0, 1.4), WHITE, 0.1)], dust = mix(s0, hex("#8a8094"), 0.4);
  const fly = new Fly3({ rng: R, sparks: [WHITE, C[6], C[5], C[3]] }), lights = new Lights(), chips = [];
  const shape = o.actor?.mask ? shapeOf(o.actor) : null;
  // cracks across the floor all round the mark, each its own length; points on the floor (x, z)
  const cracks = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * TAU + R.range(-0.25, 0.25), L = R.range(30, 54);
    const pts = bolt(R, 0, 0, Math.cos(a) * L, Math.sin(a) * L, { jag: 0.28, depth: 4 });
    const m = pts[Math.floor(pts.length * 0.5)], fa = a + R.sign() * 0.7;
    const fork = pts.length > 6 ? bolt(R, m[0], m[1], m[0] + Math.cos(fa) * L * 0.35, m[1] + Math.sin(fa) * L * 0.35, { jag: 0.3, depth: 3 }) : null;
    return { pts, fork, L, cool: R.range(1.6, 2.1) };
  });
  let t = 0, hit = false;
  const tipY = (tt) => lerp(TOP - 6, 0, ease.inCubic(seg(tt, MARK, HIT)));

  return {
    update(dt) {
      t += dt;
      if (t < MARK && R.chance(0.25)) fly.spawn(P.STAR, R.range(-10, 10), R.range(-6, 6), R.range(0, 18), 0, 0, R.range(4, 12), R.range(0.2, 0.4), R.chance(0.5) ? WHITE : C[6], R.range(0.5, 1.2));
      if (t > MARK && t < HIT && tipY(t) > TOP + 50 && R.chance(0.6)) {
        const a = R.range(0, TAU);
        fly.spawn(P.MOTE, Math.cos(a) * 6, Math.sin(a) * 6, -tipY(t) + R.range(4, 30), Math.cos(a) * 20, Math.sin(a) * 15, R.range(10, 40), R.range(0.15, 0.3), C[6], 0.7, { g: 0 });
      }
      if (!hit && t >= HIT) {
        hit = true;
        lights.add(0, -24, 92, C[5], 1, 0.6);
        lights.add(0, -8, 40, WHITE, 0.9, 0.12);
        // everything thrown out of the hit goes every way round and comes down at its own depth
        for (let i = 0; i < 60; i++) {
          const a = R.range(0, TAU), sp = R.range(70, 180);
          fly.spawn(P.SPARK, R.range(-3, 3), R.range(-2, 2), 2, Math.cos(a) * sp, Math.sin(a) * sp, R.range(80, 260), R.range(0.25, 0.75));
        }
        for (let i = 0; i < 16; i++) {
          const a = R.range(0, TAU), sp = R.range(30, 90);
          fly.spawn(P.STAR, R.range(-4, 4), R.range(-3, 3), 4, Math.cos(a) * sp, Math.sin(a) * sp, R.range(60, 150), R.range(0.4, 0.9), R.chance(0.5) ? WHITE : C[6], R.range(0.8, 2.4));
        }
        for (let i = 0; i < 16; i++) {
          const a = R.range(0, TAU), sp = R.range(50, 140);
          chips.push({ x: R.range(-5, 5), z: R.range(-3, 3), h: 2, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vh: R.range(100, 230), a: R.range(0, TAU), va: R.range(-14, 14), s: R.int(1, 3), life: R.range(1.2, 1.8), rest: false });
        }
        for (let i = 0; i < 40; i++) {
          const a = R.range(0, TAU), sp = R.range(40, 140);
          fly.spawn(P.GRIT, R.range(-4, 4), R.range(-3, 3), 1, Math.cos(a) * sp, Math.sin(a) * sp, R.range(60, 200), R.range(0.9, 1.5), R.pick(st.slice(1)), R.chance(0.4) ? 2 : 1);
        }
        // dust rolls out over the floor all round, a little smoke lifts off the crater
        for (let i = 0; i < 12; i++) {
          const a = R.range(0, TAU), sp = R.range(50, 120);
          fly.spawn(P.SMOKE, Math.cos(a) * 6, Math.sin(a) * 6, R.range(1, 4), Math.cos(a) * sp, Math.sin(a) * sp, R.range(2, 10), R.range(0.7, 1.2), mix(dust, C[4], 0.18), R.range(3.5, 6), { g: -0.004, drag: 2.4, delay: R.range(0, 0.06), big: true });
        }
        for (let i = 0; i < 4; i++) fly.spawn(P.SMOKE, R.range(-4, 4), R.range(-3, 3), R.range(2, 8), R.range(-8, 8), R.range(-5, 5), R.range(20, 45), R.range(1.2, 1.8), mix(dust, C[5], 0.25), R.range(4, 6), { delay: R.range(0.05, 0.3) });
      }
      // the cracks spit embers while they're hot
      if (t > HIT && t < HIT + 1.3 && R.chance(0.5)) {
        const c = R.pick(cracks), q = R.pick(c.pts);
        if (R.chance(0.75)) fly.spawn(P.EMBER, q[0], q[1], 1, R.range(-8, 8), R.range(-5, 5), R.range(15, 35), R.range(0.5, 0.9), C[5]);
        else fly.spawn(P.STAR, q[0], q[1], 2, 0, 0, R.range(4, 12), R.range(0.3, 0.6), R.chance(0.5) ? WHITE : C[6], R.range(0.8, 1.8));
      }
      // the chips: tumbling, a bounce, then lying where they land, crumbling to grit at the end
      for (let i = chips.length - 1; i >= 0; i--) {
        const b = chips[i];
        if ((b.life -= dt) <= 0) {
          chips.splice(i, 1);
          for (let k = 0; k < 2; k++) fly.spawn(P.GRIT, b.x, b.z, b.h + 0.5, fly.R.range(-10, 10), fly.R.range(-6, 6), fly.R.range(10, 30), 0.3, st[2], 1);
          continue;
        }
        if (b.rest) continue;
        const k = Math.exp(-0.4 * dt);
        b.vx *= k; b.vz *= k; b.vh = b.vh * k - GRAVITY * dt;
        b.x += b.vx * dt; b.z += b.vz * dt; b.h += b.vh * dt; b.a += b.va * dt;
        if (b.h <= 0) {
          b.h = 0;
          if (-b.vh > 90) (b.vh = -b.vh * 0.35), (b.vx *= 0.6), (b.vz *= 0.6), (b.va *= 0.5);
          else b.rest = true;
        }
      }
      fly.update(dt);
      lights.update(dt);
      const left = Math.max(0.001, END - 0.4 - t);
      fly.cap(left + 0.3);
      for (const b of chips) if (b.life > left) b.life = left;
    },
    drawBack(p) {
      crack(p, false);
      wave(p, true);
      fly.draw(p, (q) => q.z < 0);
      for (const b of chips) if (b.z < 0) chip(p, b);
    },
    draw(p) {
      crack(p, true);
      // the mark: a glint on the floor and a 2:1 ring closing on it
      if (t < HIT) {
        const u = seg(t, 0, MARK), k = smooth(0, 0.08, t), spin = t * 3, rr = lerp(26, 8, ease.inOutCubic(u));
        oval(p, 0, 0, rr, rr * FL, (g) => (Math.sin(g * 4 + spin) > 0 ? WHITE : C[5]), k * (0.65 + 0.35 * Math.sin(t * 40)));
        oval(p, 0, 1, rr, rr * FL, C[3], k * 0.6, (g) => Math.sin(g) > 0);
        const L = (3 + 8 * ease.outBack(clamp(t / 0.2), 2)) * (t > MARK ? 1 + 0.6 * seg(t, MARK, HIT) : 1);
        for (let i = 0; i < 4; i++) {
          const a = spin * 0.3 + (i * Math.PI) / 2, len = i % 2 ? L * 0.6 : L;
          p.line(0, -2, Math.cos(a) * len, -2 + Math.sin(a) * len, (v) => (v < 0.4 ? WHITE : C[5]), (v) => 1.2 - v);
        }
        p.px(0, -2, WHITE);
        p.glow(0, -2, 14 + 10 * u, C[5], 0.5 * k);
        p.glowLine(0, TOP + 6, 0, -2, 5, C[4], 0.12 * u);
      }
      // the target: struck white for a moment, then lit from below by the cracks
      if (shape && t >= HIT) {
        if (t < HIT + 0.07) p.mask(o.actor.mask, o.actor.x, o.actor.y, WHITE);
        const h = clamp(1 - (t - HIT) / 1.4);
        if (h > 0) for (const [x, y] of shape.out) p.light(x, y, C[5], 0.35 * h * clamp(1 + y / 30));
      }
      hammer(p);
      const ai = seg(t, HIT + 0.04, HIT + 0.55);
      if (t > HIT + 0.04 && ai < 1) {
        const w = 1 + 4 * Math.pow(1 - ai, 2);
        p.beam(0, TOP + 4, 0, -4, w, (u, v) => (v < 0.5 ? WHITE : C[5]), (u) => (0.3 + 0.7 * u) * (1 - ai * 0.5));
        p.glowLine(0, TOP + 16, 0, -6, 10, C[5], 0.4 * (1 - ai));
      }
      wave(p, false);
      // the air shock: a dome of light thrown up over the hit, its foot on the floor
      const d = seg(t, HIT, HIT + 0.28);
      if (t >= HIT && d < 1) {
        const r = 8 + 40 * ease.outCubic(d), n = Math.ceil(r * 5);
        for (let j = 0; j <= n; j++) {
          const g = Math.PI * (j / n), x = Math.cos(g) * r, y = -Math.sin(g) * r * 1.118;
          p.dot(x, y, d < 0.2 || j % 3 ? WHITE : C[5], 1.1 - d);
          if (j % 4 === 0) p.glow(x, y, 8, C[5], 0.3 * (1 - d));
        }
      }
      if (t >= HIT && t < HIT + 0.07) {
        p.circle(0, -6, 16, WHITE);
        p.circle(0, -6, 19, C[6], 0.6);
      }
      for (const b of chips) if (b.z >= 0) chip(p, b);
      fly.draw(p, (q) => q.z >= 0);
      if (t >= HIT && t < HIT + 0.25) sparkle(p, 0, -8, 16 * (1 - (t - HIT) / 0.25), WHITE, C[5], 0.7);
      lights.draw(p);
    },
  };

  // the hammer of light: a heavy blunt bolt that falls faster and faster
  function hammer(p) {
    if (t < MARK || t >= HIT + 0.06) return;
    const y1 = t >= HIT ? 0 : tipY(t), y0 = Math.max(TOP + 5, y1 - LEN * (t >= HIT ? 1 - (t - HIT) / 0.06 : 1)), white = t >= HIT;
    if (y1 < TOP + 12) return;
    for (const [dx, k] of [[-5, 0.6], [-2, 0.9], [2, 0.8], [5, 0.5]]) if (y0 > TOP + 2) p.line(dx, Math.max(TOP, y0 - 70), dx, y0, (u) => (u > 0.7 ? C[6] : C[4]), (u) => u * k);
    if (y1 - 3 > y0) p.beam(0, y0, 0, y1 - 3, 9, (u, v) => (white || v < 0.35 ? WHITE : v < 0.7 ? C[6] : C[5]));
    p.beam(0, y1 - 6, 0, y1 - 1, 13, (u, v) => (v < 0.6 || white ? WHITE : C[6]));
    p.glowLine(0, y0 + 10, 0, y1, 16, C[5], 0.6);
    p.glow(0, y1 - 4, Math.min(22, y1 - TOP - 6), WHITE, 0.5);
  }

  // the cracks, glowing and cooling, behind the mark (z < 0) or in front; the crater glowing at the heart
  function crack(p, near) {
    if (t < HIT) return;
    const grow = ease.outCubic(seg(t, HIT, HIT + 0.1));
    for (const c of cracks)
      for (const path of c.fork ? [c.pts, c.fork] : [c.pts]) {
        const n = Math.max(1, Math.round((path.length - 1) * grow));
        for (let i = 0; i < n; i++) {
          const [x0, z0] = path[i], [x1, z1] = path[i + 1];
          if ((z0 + z1) / 2 >= 0 !== near) continue;
          const d = Math.hypot(x0, z0) / c.L, heat = clamp(1 - (t - HIT) / c.cool - d * 0.5);
          if (heat <= 0) continue;
          const col = heat > 0.85 ? WHITE : heat > 0.65 ? C[6] : heat > 0.45 ? C[5] : heat > 0.3 ? C[4] : heat > 0.18 ? C[3] : C[2];
          p.line(x0, z0 * FL, x1, z1 * FL, col, heat < 0.12 ? heat / 0.12 : 1);
          if (d < 0.45 && path === c.pts) p.line(x0, z0 * FL + 1, x1, z1 * FL + 1, heat > 0.5 ? C[4] : C[2], heat < 0.12 ? heat / 0.12 : 1);
          if (i % 2 === 0) p.glow(x0, z0 * FL, 10, C[4], 0.45 * heat);
        }
      }
    const h = clamp(1 - (t - HIT) / 1.6);
    if (h > 0 && near) {
      oval(p, 0, 0, 6, 3, h > 0.6 ? WHITE : h > 0.3 ? C[5] : C[3], Math.min(1, h * 3));
      p.glow(0, 0, 18, C[4], 0.45 * h);
    }
  }

  // the shockwave over the floor: 2:1, far half behind, near half in front
  function wave(p, far) {
    const k = seg(t, HIT, HIT + 0.42);
    if (t >= HIT && k < 1) band(p, 0, 0, 6 + 84 * ease.outCubic(k), FL, Math.max(1, 5 * (1 - k)), 1.15 - k, C.slice(3), (g) => Math.sin(g) < 0 === far, k < 0.12);
  }

  // a chip of stone: lit side, shaded side, outline; it crumbles smaller over its last moments
  function chip(p, b) {
    const r = 0.6 + b.s * 0.7 * Math.min(1, b.life / 0.4), x0 = b.x, y0 = b.z * FL - b.h, lx = Math.cos(b.a) * r * 0.4, ly = Math.sin(b.a) * r * 0.4;
    p.shade(x0 - r - 1, y0 - r - 1, x0 + r + 1, y0 + r + 1, (x, y, out) => {
      const dx = x - x0, dy = y - y0, d = Math.hypot(dx * 1.2, dy);
      if (d > r + 0.9) return;
      const lit = dx * lx + dy * ly;
      out.c = d > r ? OUTLINE : lit < -0.3 ? st[3] : lit > 0.5 ? st[1] : st[2];
    });
  }
}
