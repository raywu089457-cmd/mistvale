// Chain lightning for the game's 2:1 isometric camera, cast any way and chaining on its own: lightning/chain-lightning
// rewritten for the floor the game sees, not its picture squashed, stretched, scaled or turned. The recipe is the
// source's: the charge gathers at the hand, a bolt leaps out to a target and on to the next in turn, each lands with a
// flash, sparks and a pop of light, the links flicker as they re-strike, arcs crawl over each target and ground it to
// the floor, which scorches; then the chain gives out link by link, each target pops once more and smokes, and the
// spent channels cool. What changed is the world it happens in:
//   - it is cast any way over the floor (o.aim, radians: 0 to the right of the screen, + turning toward us; or o.dir,
//     the eight ways 0..7; not `angle`, which every effect takes as a turn of its whole picture) and it picks its own chain: given the characters standing round (o.targets, each { x, z, h }
//     relative to the caster: x across the screen, z into the floor toward us, h the height it strikes them at), it
//     leaps to the nearest one ahead of the aim (within 70 degrees, the straighter the likelier), then on to the
//     nearest one not yet struck, hop after hop (o.hops, at most o.hop apart); with none ahead it grounds itself on the
//     floor out along the aim. Without o.targets (a preview) three stand ahead along the aim, as in the side view;
//   - every link runs between points in 3D and bows upward in 3D, so it reads right whichever way it runs: across the
//     screen, toward us (short on screen), away from us;
//   - each target grounds itself to the floor at its own feet and the floor there scorches as a 2:1 spot; the sparks
//     fly in 3D and land at their own depth;
//   - it is light: meta.over says its bolts are drawn over the characters they strike (its floor goes under them).
// The caster is the game's own character (at the origin): the effect draws no stand-in. 1 px = 1 sprite px.
// The hop timing, the link shapes that re-strike every other frame, the glowing nodes and the crawling arcs follow
// Sprite Fusion's open-source lightning (https://www.spritefusion.com/pixel-art-vfx/lightning), MIT License,
// Copyright (c) 2026 Hugo Duprez.
import { Particles, Lights, P, Rng, fit, sparkle, clamp, smooth, ease, rng, rand, TAU, WHITE, hex, mix, GRAVITY } from "../../core/index.js";
import { VOLT, PLASMA, SOOT, SOOT2, zigzag, stroke, crackle, trace, spark, heat } from "./_lib.js";

export const meta = {
  name: "Chain lightning (iso)",
  desc: "lightning/chain-lightning on the 2:1 floor, cast any way: it leaps to the nearest target ahead and chains on by itself (o.aim, o.targets), grounding each to the floor.",
  tags: ["lightning", "electric", "chain", "spell", "combat", "directional", "any-direction", "one-shot", "iso", "top-down"],
  size: [480, 300],
  origin: [240, 165],
  duration: 1.8,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  over: true,
  options: { palette: VOLT, sparks: PLASMA, dir: 0, hops: 3, range: 150, hop: 110, seed: 3 },
};

const FL = 0.5;
const WIND = 0.12, LEAP = 0.05, GAP = 0.075, HOLD = 0.78, BREAK = 0.16, ASH = hex("#5b5566");
const REACH = 215; // nothing is chained further than this from the caster (it would leave the canvas)
const on = (i) => WIND + i * GAP + LEAP; // when link i lands on its target
const off = (i) => HOLD + i * 0.05; // when it starts to give out

// a link's strength: a hard first flash, a restless hum, then it stutters out
function level(i, t) {
  const a = t - on(i);
  if (a < 0) return 0;
  const hum = a < 0.1 ? [1, 0.55, 1][Math.floor(a * 30)] ?? 1 : 0.78 + 0.22 * Math.sin(t * 61 + i) * Math.sin(t * 23 + i * 2);
  const b = t - off(i);
  return b < 0 ? hum : b < BREAK ? hum * (1 - b / BREAK) * (Math.floor(b * 60) % 3 === 1 ? 0.5 : 1) : 0;
}

/**
 * The chain, chosen as the bolt would: from the hand to the nearest character ahead of the aim (within 70 degrees,
 * favouring the straightest), then from each to the nearest one not yet struck within a hop. th: the aim (radians on
 * the floor). Returns [{ x, z, h, floor }]: floor marks a bolt that found no one and grounds itself on the floor.
 */
export function chainOf(o, th) {
  const ax = Math.cos(th), az = Math.sin(th);
  if (!o.targets) return [[48, -6, 22], [94, 8, 30], [140, -4, 19]].map(([s, u, h]) => ({ x: s * ax - u * az, z: s * az + u * ax, h }));
  const left = o.targets.map((q) => ({ x: q.x, z: q.z, h: q.h ?? 22 })).filter((q) => Math.hypot(q.x, q.z) <= REACH && Math.hypot(q.x, q.z) > 4);
  const chain = [];
  let best = null, score = Infinity;
  for (const q of left) {
    const d = Math.hypot(q.x, q.z), cos = (q.x * ax + q.z * az) / d, s = d / (0.5 + cos);
    if (d <= (o.range ?? 150) && cos >= 0.34 && s < score) (best = q), (score = s);
  }
  if (!best) return [{ x: ax * 70, z: az * 70, h: 0, floor: true }];
  chain.push(best);
  while (chain.length < (o.hops ?? 3)) {
    const last = chain[chain.length - 1];
    let next = null, nd = o.hop ?? 110;
    for (const q of left) {
      if (chain.includes(q)) continue;
      const d = Math.hypot(q.x - last.x, q.z - last.z);
      if (d < nd) (next = q), (nd = d);
    }
    if (!next) break;
    chain.push(next);
  }
  return chain;
}

export function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed), S0 = o.seed * 19;
  const th = o.aim ?? ((((Math.round(o.dir ?? 0) % 8) + 8) % 8) * Math.PI) / 4, ax = Math.cos(th), az = Math.sin(th);
  const ps = new Particles({ rng: R, ground: () => Infinity, sparks: o.sparks }), lights = new Lights(), sparks = [];
  const HOPS = chainOf(o, th), HAND = { x: ax * 10, z: az * 10, h: 16 }, pts = [HAND, ...HOPS];
  const sx = (q) => q.x, sy = (q) => q.z * FL - q.h;
  const hit = HOPS.map(() => false), popped = HOPS.map(() => false);
  // where each target grounds itself: a spot on the floor at its feet
  const ground = HOPS.map((q) => (q.floor ? { x: q.x, z: q.z } : { x: q.x + R.range(-5, 5), z: q.z + R.range(-3, 3) }));
  // a spark in 3D: thrown off, falling, bouncing on the floor at its own depth
  const fling = (q, vx, vz, vh, life, hot = false) => sparks.push({ x: q.x, z: q.z, h: q.h, vx, vz, vh, life, max: life, hot });
  let t = 0;
  // link i's shape for frame-pair f: a jagged bolt between its two points bowed upward in 3D at its middle
  const shape = (i, f, salt = 0) => {
    const r = rng(o.seed, 31 + salt, i, f), a = pts[i], b = pts[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z, b.h - a.h);
    const mid = { x: (a.x + b.x) / 2 + r.range(-2, 2), z: (a.z + b.z) / 2, h: (a.h + b.h) / 2 + L * r.range(0.05, 0.15) };
    const p0 = zigzag(r, sx(a), sy(a), sx(mid), sy(mid), 0.2, 0.4), p1 = zigzag(r, sx(mid), sy(mid), sx(b), sy(b), 0.2, 0.4);
    return { paths: [{ pts: [...p0.paths[0].pts, ...p1.paths[0].pts.slice(1)], w: 1 }, ...p0.paths.slice(1), ...p1.paths.slice(1)] };
  };

  return {
    update(dt) {
      t += dt;
      // the charge gathers at the hand
      if (t < WIND && R.chance(70 * dt)) {
        const a = R.range(0, TAU), d = R.range(10, 24), T = R.range(0.06, 0.1), v = (d * 3) / (Math.exp(3 * T) - 1);
        ps.spawn(P.STREAK, sx(HAND) + Math.cos(a) * d, sy(HAND) + Math.sin(a) * d, -Math.cos(a) * v, -Math.sin(a) * v, T, R.chance(0.5) ? C[6] : C[5]);
      }
      for (const [i, q] of HOPS.entries()) {
        const x = sx(q), y = sy(q);
        if (!hit[i] && t >= on(i)) {
          hit[i] = true;
          // it lands: light, sparks thrown on along the way it came and every way, hot drops, a glint, smoke
          const p0 = pts[i], dx = q.x - p0.x, dz = q.z - p0.z, dl = Math.hypot(dx, dz) || 1;
          lights.add(x, y, 56, C[4], 0.85, 0.22);
          lights.add(x, y, 16, WHITE, 0.7, 0.08);
          if (i === 0) lights.add(sx(HAND), sy(HAND), 40, C[4], 0.6, 0.15);
          for (let j = 0; j < 18; j++) {
            const on_ = R.chance(0.6), a = on_ ? Math.atan2(dz, dx) + R.range(-1.1, 1.1) : R.range(0, TAU), sp = R.range(70, 230), up = R.range(-0.3, 0.8);
            fling(q, Math.cos(a) * sp * (1 - Math.abs(up) * 0.5), Math.sin(a) * sp * (1 - Math.abs(up) * 0.5), up * sp + 40, R.range(0.15, 0.4));
          }
          for (let j = 0; j < 5; j++) fling({ x: q.x + R.range(-2, 2), z: q.z, h: Math.max(1, q.h - 2) }, R.range(-50, 50), R.range(-30, 30), R.range(-20, 60), R.range(0.5, 0.9), true);
          if (!q.floor) ps.spawn(P.STAR, x + R.range(-4, 4), y - R.range(3, 7), 0, -6, R.range(0.25, 0.4), C[6], R.range(1.5, 2.5));
          for (let j = 0; j < 2; j++) ps.spawn(P.SMOKE, x + R.range(-4, 4), y + R.range(-2, 3), R.range(-6, 6), -R.range(8, 16), R.range(0.7, 1), mix(ASH, C[2], 0.35), R.range(2, 3.5), R.range(0.1, 0.25));
          void dl;
        }
        // while the chain holds: sparks shed off the link, spit from the floor where the target grounds
        if (hit[i] && t < off(i)) {
          if (R.chance(9 * dt)) {
            const u = R.next(), p0 = pts[i];
            fling({ x: p0.x + (q.x - p0.x) * u, z: p0.z + (q.z - p0.z) * u, h: p0.h + (q.h - p0.h) * u + 2 }, R.range(-60, 60), R.range(-40, 40), R.range(-20, 90), R.range(0.1, 0.25));
          }
          if (R.chance(7 * dt)) {
            const a = R.range(0, TAU), sp = R.range(30, 70);
            fling({ x: ground[i].x, z: ground[i].z, h: 1 }, Math.cos(a) * sp, Math.sin(a) * sp, R.range(40, 140), R.range(0.12, 0.3));
          }
          if (R.chance(2 * dt)) fling({ x: q.x + R.range(-3, 3), z: q.z, h: Math.max(1, q.h - 3) }, R.range(-30, 30), R.range(-20, 20), R.range(-10, 30), R.range(0.5, 0.8), true);
        }
        // when it gives out, the target pops once more and smokes
        if (!popped[i] && t >= off(i) + BREAK) {
          popped[i] = true;
          for (let j = 0; j < 7; j++) {
            const a = R.range(0, TAU), sp = R.range(40, 140);
            fling(q, Math.cos(a) * sp, Math.sin(a) * sp, R.range(0, 80) + 30, R.range(0.12, 0.3));
          }
          ps.spawn(P.SMOKE, x, y, R.range(-4, 4), -R.range(10, 16), R.range(0.55, 0.7), mix(ASH, C[2], 0.35), R.range(2.5, 3.5));
          lights.add(x, y, 30, C[4], 0.5, 0.12);
        }
      }
      // the sparks: falling, slowed by the air, bouncing where they meet the floor
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        if ((s.life -= dt) <= 0) { sparks.splice(i, 1); continue; }
        const k = Math.exp(-2.2 * dt);
        s.vx *= k; s.vz *= k; s.vh = s.vh * k - GRAVITY * 0.45 * dt;
        s.x += s.vx * dt; s.z += s.vz * dt; s.h += s.vh * dt;
        if (s.h < 0) (s.h = 0), (s.vh = -s.vh * 0.45), (s.vx *= 0.7), (s.vz *= 0.7);
      }
      ps.update(dt);
      lights.update(dt);
      const left = Math.max(0.001, meta.duration - 0.05 - t);
      for (const q of ps.list) if (q.life > left) q.life = left;
      for (const s of sparks) if (s.life > left) s.life = left;
    },
    drawBack(p) {
      // the floor scorches where the targets ground themselves (a 2:1 spot), hot at first, cooling to soot that then
      // goes patch by patch
      for (const [i, g] of ground.entries()) {
        const a = t - on(i);
        if (a < 0) continue;
        const T0 = Math.min(1, a / 0.2) * Math.pow(clamp(1 - (t - off(i)) / 0.7), 1.3) * 0.9;
        scorch(p, g.x, g.z * FL, HOPS[i].floor ? 10 : 7, T0, smooth(1.35, 1.72, t), S0 + i);
      }
      ps.draw(p, "back");
    },
    draw(p) {
      const f = Math.floor(t * 30 + 1e-4), f2 = f >> 1, hx = sx(HAND), hy = sy(HAND);
      // the hand: a node that swells while the charge gathers and holds the chain
      const kh = t < WIND ? t / WIND : level(0, t);
      if (kh > 0.02) {
        const r = (1.2 + 1.6 * kh + Math.sin(t * 53) * 0.4) * Math.min(1, kh * 1.5);
        p.circle(hx, hy, r + 1.2, C[4]);
        p.circle(hx, hy, r, C[6]);
        p.circle(hx, hy, r * 0.5, WHITE);
        p.glow(hx, hy, 18, C[4], 0.6 * kh);
        if (t > WIND * 0.5) {
          const r2 = rng(o.seed, 5, f), a = r2.range(0, TAU), d = r2.range(4, 8);
          crackle(p, zigzag(r2, hx, hy, hx + Math.cos(a) * d, hy + Math.sin(a) * d, 0.4, 0.3), 0.6 * kh, C, 0.3);
        }
      }
      for (const [i, q] of HOPS.entries()) {
        const t0 = WIND + i * GAP, x = sx(q), y = sy(q);
        // the leap: the bolt races out from the last node with a hot head
        if (t >= t0 && t < on(i)) {
          const u = ease.outQuad((t - t0) / LEAP), b = shape(i, -1), trunk = { paths: [b.paths[0]] };
          stroke(p, trunk, 1, C, 0.75, { upTo: u });
          const tp = b.paths[0].pts, [px, py] = tp[Math.min(tp.length - 1, Math.floor(u * (tp.length - 1)))];
          p.circle(px, py, 2, WHITE);
          p.glow(px, py, 16, C[5], 0.7);
        }
        const k = level(i, t);
        if (k > 0) stroke(p, shape(i, f2), k, C, 0.75);
        else if (t >= off(i) + BREAK && t < off(i) + BREAK + 0.35) {
          // the spent channel: a dotted trace that cools and goes
          const g = 1 - (t - off(i) - BREAK) / 0.35, b = shape(i, Math.floor((off(i) + BREAK) * 15));
          trace(p, b.paths[0].pts, g > 0.5 ? C[4] : C[2], g * 0.9);
        }
        // the target: a flash as the bolt lands, then a node with arcs crawling over it and down to the floor at its feet
        const a = t - on(i);
        if (a >= 0 && a < 0.09) {
          const qq = a / 0.09;
          p.circle(x, y, 6 * (1 - qq) + 1.5, C[5]);
          p.circle(x, y, 5 * (1 - qq), WHITE);
          sparkle(p, x, y, Math.round(10 * (1 - qq)), C[6], C[4], 0.6);
        }
        if (k > 0.05 && !q.floor) {
          const r = (2.6 + Math.sin(t * 47 + i) * 0.7) * k;
          p.circle(x, y, r + 1.5, C[2]);
          p.circle(x, y, r + 0.7, C[5]);
          p.circle(x, y, r * 0.6, WHITE);
          p.glow(x, y, 26, C[4], 0.6 * k);
          p.glow(x, y, 8, C[6], 0.5 * k);
          const r2 = rng(o.seed, 11, i, f);
          for (let j = 0; j < (t - on(i) < 0.12 ? 2 : 1); j++) {
            const a0 = r2.range(0, TAU), a1 = a0 + r2.sign() * r2.range(0.5, 1), d0 = r2.range(4, 6), d1 = r2.range(5, 8);
            crackle(p, zigzag(r2, x + Math.cos(a0) * d0, y + Math.sin(a0) * d0, x + Math.cos(a1) * d1, y + Math.sin(a1) * d1, 0.35, 0), r2.range(0.45, 0.7) * k, C, 0.25);
          }
          if (r2.next() < 0.3 * k) {
            // an arc down the target to the floor at its feet
            const gx = ground[i].x + r2.range(-3, 3), gy = ground[i].z * FL;
            crackle(p, zigzag(r2, x + r2.range(-2, 2), y + 3, gx, gy - 0.5, 0.3, 0.35), 0.75 * k, C, 0.35);
            p.glow(gx, gy - 1, 12, C[5], 0.5 * k);
            p.px(gx, gy - 1, WHITE);
          }
        } else if (k > 0.05) {
          // no one there: the bolt grounds itself, a crown of light where it meets the floor
          p.glow(x, y - 1, 16, C[5], 0.6 * k);
          p.px(x, y - 1, WHITE);
        }
      }
      for (const s of sparks) {
        const k = s.life / s.max, x = s.x, y = s.z * FL - s.h;
        if (s.hot) {
          // a hot drop: a bead that cools from white to the bolt's blue as it falls
          p.px(x, y, k > 0.6 ? WHITE : k > 0.3 ? C[6] : C[4]);
          p.glow(x, y, 3, C[5], 0.4 * k);
        } else spark(p, x, y, s.vx, s.vz * FL - s.vh, k, o.sparks);
      }
      ps.draw(p, "front");
      lights.draw(p);
    },
  };
}

// heat left on the floor where a bolt grounds: a 2:1 spot, white-hot in its middle cooling through the fire ramp to
// soot; the soot then goes patch by patch (gone 0..1), never a fade
function scorch(p, cx, cy, rx, T0, gone, seed) {
  const ry = rx * FL;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1) continue;
      const n = rand(x, y, seed), T = T0 * (1.25 - d) - n * 0.35;
      if (T > 0.06) {
        const c = heat(T);
        p.px(x, y, c);
        if ((x & 3) === 0) p.glow(x + 0.5, y, 6, c, 0.18 * T);
      } else if (rand(x + 7, y + 3, seed + 1) * 0.6 + (1 - d) * 0.4 > gone) p.dot(x, y, d < 0.5 ? SOOT : SOOT2, d < 0.95 - n * 0.3 ? 1 : 1 - d);
    }
}
