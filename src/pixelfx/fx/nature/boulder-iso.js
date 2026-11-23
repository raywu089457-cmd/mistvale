// Boulder for the game's 2:1 isometric camera: nature/boulder rewritten for the floor the game sees, not its picture
// squashed, stretched or scaled. The recipe is the source's (its thrown rock shedding dust and pebbles, the white hero
// frame as it breaks, chunks, gravel, sparks, dust rolling out, the scar it leaves and its palette and timing); what
// changed is the world it happens in:
//   - the throw is a floor direction, not a line across the screen: o.dir 0..7 is the eight ways a character faces on
//     this floor (0 east, along the screen to the right, then a quarter turn at a time toward us: 2 south, straight
//     down the screen; 4 west; 6 north, away from us), or o.aim any way at all (radians on the floor, same sense; not
//     `angle`, which every effect takes as a turn of its whole picture, the very thing this camera must never do);
//   - what stands in the air keeps its height: the boulder is drawn upright, as tall as in the side view, its shadow a
//     flat 2:1 ellipse on the floor under it, tightening as it comes down;
//   - the floor has depth: the scar is a 2:1 dent with cracks running out over it, the shock and the rolling dust race
//     out every way as 2:1 ellipses, and what is thrown out flies in 3D (x across, z into the floor, h up, screen
//     y = z / 2 - h) and falls, bounces, skids and settles at its own depth, every way round the strike, not one line;
//   - it leaves the way a rock does: the chunks come to rest and crumble grain by grain, the dust thins, the scar
//     settles out of the ground a grain at a time.
// 1 px = 1 character sprite px (32 x 16 px tiles).
import { Particles, Lights, P, Rng, fit, flare, sparkle, clamp, smooth, ease, noise, rand, TAU, WHITE, hex, mix } from "../../core/index.js";
import { FLOOR, bandFloor, floorShadow, Fly3 } from "../_iso.js";

export const meta = {
  name: "Boulder (iso)",
  desc: "nature/boulder on the 2:1 floor, thrown any of eight ways (o.dir 0-7): a spinning rock arcs out, smashes the ground white and bursts into chunks, gravel and dust.",
  tags: ["nature", "earth", "rock", "projectile", "impact", "directional", "8-dir", "one-shot", "iso", "top-down"],
  size: [380, 220],
  origin: [190, 130],
  duration: 2.3,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: {
    palette: ["#100e12", "#1e1a22", "#38313f", "#463e4c", "#5e5464", "#7c7080", "#a0949e", "#cec4c8"],
    sparks: ["#fff3a6", "#ffe26b", "#ff8a2a", "#f2561d"],
    size: 11,
    dir: 0,
    seed: 11,
  },
};

const LX = -0.6, LY = -0.8;   // the light: upper left, as the side view has it
const D = 92;                 // how far the throw lands, floor px ahead along the aim
const H0 = 26, VH = 150, G = 860;   // it leaves the hand 26 up, rises a little, falls: the source's arc, as height

// a faceted stone at (x, y) on the screen, s across, turned by a: a lumpy outline, facets that catch the light from the
// upper left, a bright rim on the lit side and a dark one round the rest. `melt` drops it grain by grain.
// a soft shadow on the floor, composited with p.blend so it stays smooth (no ordered dither, no black specks)
function blendShadow(p, x, y, rx, c, a) {
  if (rx < 0.6 || a <= 0.01) return;
  const ry = rx * FLOOR;
  for (let yy = -Math.ceil(ry); yy <= Math.ceil(ry); yy++)
    for (let xx = -Math.ceil(rx); xx <= Math.ceil(rx); xx++) {
      const d = Math.hypot(xx / rx, yy / ry);
      if (d >= 1) continue;
      p.blend(Math.round(x + xx), Math.round(y + yy), c, a * (1 - 0.45 * d));
    }
}

function rock(p, x, y, s, a, seed, S, melt = 1, white = false, cap = 7) {
  if (s < 0.9 || melt <= 0) return;
  const rr = Math.ceil(s * 1.4) + 1, ca = Math.cos(a), sa = Math.sin(a);
  p.shade(x - rr, y - rr, x + rr, y + rr, (px, py, out) => {
    const dx = px + 0.5 - x, dy = py + 0.5 - y;
    const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
    const d = Math.hypot(u / 1.05, v / 0.94), ang = Math.atan2(v, u);
    const rad = s * (1 + 0.15 * noise(ang * 2.4 + seed, seed * 0.7) + 0.09 * noise(ang * 5.3, seed + 1));
    if (d > rad + 1) return;
    if (melt < 1 && rand(Math.floor(px) + 31, Math.floor(py) + 17, seed + 5) > melt) return;
    if (d > rad) { out.c = S[2]; return; }                       // the dark rim (S[2]: dark, never black)
    out.c = S[1];
    if (white) { out.c = WHITE; return; }
    const dot = (dx * LX + dy * LY) / Math.max(1, s);
    let i = dot > 0.5 ? cap : dot > 0.2 ? cap - 1 : dot > -0.15 ? cap - 2 : dot > -0.55 ? 4 : 3;
    // the surface is faceted: each wedge of its own turning face steps the light up or down
    const fa = ((ang + TAU * 3) % TAU) / (TAU / 6), jog = rand(Math.floor(fa), seed + 2) - 0.5;
    i = clamp(i + (jog > 0.22 ? 1 : jog < -0.24 ? -1 : 0), 2, cap);
    if (d > rad - 1.1) i = dot > 0 ? cap : 2;                       // the lit and shaded rims
    const pit = rand(Math.floor(px * 3) + 7, Math.floor(py * 3) + 11, seed + 4);
    if (s > 3.6 && pit < 0.05 && d < rad - 1.4) i = Math.max(2, i - 2);       // shallow pits
    out.c = S[i];
  });
}

// mossy patches crawling over the stone, turning with it
function moss(p, x, y, s, a, seed, M, white) {
  if (white || s < 4.5) return;
  const ca = Math.cos(a), sa = Math.sin(a);
  for (let k = 0; k < 9; k++) {
    const g = 3.6 + (k / 8) * 1.25, rr = k % 3 === 1 ? 0.75 : 0.9;
    const u = Math.cos(g) * rr, v = Math.sin(g) * rr;
    p.px(x + (u * ca - v * sa) * s, y + (u * sa + v * ca) * s, M[k % 3 === 1 ? 0 : v < 0 ? 2 : 1]);
  }
}

// a wave of dust racing out over the floor from the strike: a low flat ring of grain a few pixels deep that thins as
// it runs. Real alpha (p.blend) so it reads as dust, not as a drawn ellipse; keep(g) picks the far or the near half.
function dustWave(p, x, y, r, cols, keep, seed, fade) {
  if (r < 1.5 || fade <= 0) return;
  const n = Math.ceil(r * TAU * 0.5);
  for (let i = 0; i < n; i++) {
    const g = (i / n) * TAU;
    if (!keep(g)) continue;
    const grain = rand(i * 5 + 1, seed, 9), rr = r + noise(g * 2.7, seed) * 1.6;
    for (let d = -3.2; d <= 0.6; d += 1) {
      const a = fade * (0.62 + d * 0.14) * (0.35 + 0.65 * grain);
      if (a <= 0.02) continue;
      p.blend(Math.round(x + Math.cos(g) * (rr + d)), Math.round(y + Math.sin(g) * (rr + d) * FLOOR), grain > 0.62 ? cols[1] : cols[0], a > 0.8 ? 0.8 : a);
    }
    // a few grains kicked just past the front, so the edge is dust rather than a line
    if (grain > 0.86) p.px(Math.round(x + Math.cos(g) * (rr + 2.4)), Math.round(y + Math.sin(g) * (rr + 2.4) * FLOOR), cols[1]);
  }
}

export function create(o) {
  const S = fit(o.palette, 8), R = new Rng(o.seed), RAD = o.size, S0 = o.seed * 17;
  // o.dir is the way the character faces on the floor (0 east, 2 south, 4 west, 6 north); o.aim overrides it in radians
  const th = typeof o.aim === "number" ? o.aim : ((((Math.round(o.dir ?? 0) % 8) + 8) % 8) * TAU) / 8;
  const DX = Math.cos(th), DZ = Math.sin(th);
  const DUST = mix(S[6], hex("#9a8f86"), 0.4), DUST2 = mix(S[5], hex("#7a7068"), 0.35);
  const MOSS = [hex("#1f3a1e"), hex("#3f7a2c"), hex("#7cb83a")];
  const WAVE = [mix(S[3], hex("#8a7a6c"), 0.5), mix(S[6], hex("#b09a86"), 0.5)];  // low grey dust on the floor
  const ps = new Particles({ rng: R, ground: () => 0, sparks: o.sparks });
  const fly = new Fly3({ rng: R, sparks: o.sparks });
  const lights = new Lights();
  const chunks = [];
  const s0 = 8, tHit = (VH + Math.sqrt(VH * VH + 2 * G * (H0 - RAD * 0.85))) / G;
  const VS = (D - s0) / tHit;
  const hitH = RAD * 0.85;
  const HX = D * DX, HZ = D * DZ;                       // the floor point it breaks on
  const HXS = HX, HYS = HZ * FLOOR - hitH;              // and where that is on the screen
  const at = (tt) => ({ s: s0 + VS * tt, h: H0 + VH * tt - 0.5 * G * tt * tt });
  const sx = (b) => b.x, sy = (b) => b.z * FLOOR - b.h;
  const ROCK = (b) => { b.a ??= R.range(0, TAU); b.va ??= R.range(-16, 16); b.life ??= 1.5; chunks.push(b); return b; };
  let t = 0, hit = false, thrown = false;

  // where a chunk is right now, on screen, and whether it shows white (for the hero frame)
  const meltOf = (b) => clamp(b.life / 0.4, 0, 1);

  // the scar: a 2:1 dent torn in the floor, its near lip thrown up and catching the light, dirt spilled round it and
  // cracks running out; it settles back into the ground a grain at a time at the end
  const scar = (p) => {
    const e = t - tHit;
    if (e < 0) return;
    const settle = 1 - smooth(meta.duration - 0.6, meta.duration - 0.1, t), grow = Math.min(1, e / 0.07);
    const rx = 13 * grow, ry = rx * FLOOR, grain = (x, y, k) => rand(x + 500, y + 500, S0 + k);
    p.shade(HXS - rx * 1.6, HYS - ry * 1.6, HXS + rx * 1.6, HYS + ry * 1.6, (x, y, out) => {
      if (grain(x, y, 7) > settle) return;
      const dx = x + 0.5 - HXS, dy = y + 0.5 - HYS, d = Math.hypot(dx / rx, dy / ry);
      if (d > 1.6) return;
      const e = (d - 1) * (Math.hypot(dx, dy) / Math.max(0.001, d));       // px out from the lip, so it stays 1 px wide
      if (d < 0.72) { out.c = S[1]; out.a = 1; return; }                    // the pit, unlit
      if (e < -1.8) { out.c = S[2]; out.a = 1; return; }                    // its wall
      if (e < 1.5) { out.c = dy > 0 ? S[3] : S[2]; out.a = 1; return; }     // the rim it threw up, lit on our side
      if (e > 5 || grain(x, y, 13) > 0.55) return;                          // dirt spilled round it, in grains
      out.c = grain(x, y, 11) > 0.4 ? S[2] : S[3];
      out.a = 1;
    });
    // cracks: six jittered walks out through the floor plane, dark with a lit upper edge, fading as they run
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + noise(i * 3.1, S0 * 0.7) * 0.5, ux = Math.cos(a), uz = Math.sin(a);
      const len = 15 + 12 * Math.abs(noise(i * 1.7, S0 + 3));
      for (let d = rx * 0.6; d < len * grow; d += 1.3) {
        const jx = noise(d * 0.3, i * 2.3) * 1.8, jz = noise(i * 4.1, d * 0.25) * 1.8;
        if (rand(Math.floor(d * 3) + i * 40, Math.floor(a * 20), S0 + 9) > settle) continue;
        const X = HXS + ux * d + jx, Y = HYS + (uz * d + jz) * FLOOR;
        p.px(X, Y, d < len * 0.5 ? S[2] : S[3]);
        if (d < len * 0.62) p.px(X, Y - 1, S[3]);
      }
    }
  };

  return {
    update(dt) {
      t += dt;
      const f = Math.min(1, dt * 120);
      if (!thrown) {
        thrown = true;
        // it leaves the hand in a puff of dust, thrown along the way it goes
        for (let i = 0; i < 6; i++)
          ps.spawn(P.DUST, R.range(-4, 4) + DX * 6, -H0 * FLOOR + R.range(-4, 4), DX * R.range(10, 40), DZ * R.range(10, 40) * FLOOR - R.range(4, 20), R.range(0.4, 0.7), DUST, R.range(2.5, 4.5));
        lights.add(DX * 6, -H0, 30, WHITE, 0.3, 0.1);
      }
      if (t < tHit) {
        // it sheds dust and the odd pebble as it flies, and draws a shadow on the floor under it
        const b = at(t), x = sx({ x: b.s * DX, z: b.s * DZ }), y = b.s * DZ * FLOOR - b.h;
        if (R.chance(0.5 * f)) ps.spawn(P.DUST, x - R.range(2, 6), y + R.range(-4, 4), -R.range(10, 40), R.range(-10, 10), R.range(0.3, 0.6), DUST, R.range(2, 3.5));
        if (R.chance(0.12 * f))
          fly.spawn(P.GRIT, b.s * DX + R.range(-3, 3), b.s * DZ + R.range(-3, 3), b.h, DX * R.range(20, 70), DZ * R.range(20, 70), R.range(-20, 20), Math.min(R.range(0.6, 0.9), meta.duration - 0.1 - t), R.pick([S[5], S[4]]), R.chance(0.3) ? 2 : 1);
      }
      if (!hit && t >= tHit) {
        hit = true;
        lights.add(HXS, HYS, 40, WHITE, 0.8, 0.1);
        lights.add(HXS, HYS, 66, hex("#ffb060"), 0.5, 0.5);
        // the core of it stays where it broke, two heavy pieces settling in the dent
        ROCK({ x: HX, z: HZ, h: hitH * 0.9, vx: 10 * DX, vz: 10 * DZ, vh: 34, g: 1, drag: 2.6, bounce: 0.15, life: 1.95, s: 6.2, rot: S0, seed: R.int(1, 999) });
        ROCK({ x: HX + 5 * DZ, z: HZ - 5 * DX, h: hitH * 0.6, vx: 22 * DZ, vz: -22 * DX, vh: 26, g: 1, drag: 2.2, bounce: 0.2, life: 1.9, s: 4.4, rot: 2.1, seed: R.int(1, 999) });
        // big chunks of the boulder, thrown up and on every way round, spinning in 3D
        for (let i = 0; i < 6; i++) {
          const a = R.range(0, TAU), sp = R.range(30, 80), up = R.range(60, 200);
          ROCK({ x: HX + R.range(-4, 4), z: HZ + R.range(-4, 4), h: hitH, vx: Math.cos(a) * sp + DX * 25, vz: Math.sin(a) * sp + DZ * 25, vh: up, g: 1, drag: R.range(1.5, 2.1), bounce: 0.35, life: R.range(1.3, 1.7), s: R.range(3.4, 6.2), rot: R.range(0, TAU), seed: R.int(1, 999) });
        }
        for (let i = 0; i < 10; i++) {
          const a = R.range(0, TAU), sp = R.range(40, 95), up = R.range(30, 140);
          ROCK({ x: HX + R.range(-3, 3), z: HZ + R.range(-3, 3), h: hitH, vx: Math.cos(a) * sp + DX * 20, vz: Math.sin(a) * sp + DZ * 20, vh: up, g: 1, drag: R.range(1.7, 2.3), bounce: 0.3, life: R.range(1.1, 1.5), s: R.range(1.6, 2.8), rot: R.range(0, TAU), seed: R.int(1, 999) });
        }
        // gravel thrown out over the ground every way; it bounces and lies where it lands at its own depth
        for (let i = 0; i < 60; i++) {
          const a = R.range(0, TAU), sp = R.range(40, 150), up = R.range(40, 170);
          fly.spawn(P.GRIT, HX + R.range(-2, 2), HZ + R.range(-2, 2), 1, Math.cos(a) * sp + DX * 20, Math.sin(a) * sp + DZ * 20, up, Math.min(R.range(0.9, 1.6), meta.duration - 0.1 - t), R.pick([S[6], S[5], S[4], S[4], S[3]]), R.chance(0.4) ? 2 : 1, { drag: 2.2 });
        }
        for (let i = 0; i < 12; i++) {
          const a = R.range(0, TAU), sp = R.range(90, 220), up = R.range(60, 190);
          fly.spawn(P.SPARK, HXS, HYS, 2, Math.cos(a) * sp + DX * 30, Math.sin(a) * sp + DZ * 30, up, Math.min(R.range(0.15, 0.4), meta.duration - 0.1 - t), 0, 1, { drag: 3 });
        }
        // dust rolling out over the floor both ways, a cloud climbing off the break, and glints in it
        for (let i = 0; i < 14; i++) {
          const a = R.range(0, TAU), v = R.range(50, 150);
          ps.spawn(P.SMOKE, HX + Math.cos(a) * R.range(2, 8), HZ * FLOOR + Math.sin(a) * R.range(2, 8) * FLOOR - R.range(1, 5), Math.cos(a) * v, Math.sin(a) * v * FLOOR - R.range(4, 20), R.range(1.1, 1.8), R.chance(0.5) ? DUST : DUST2, R.range(3.6, 6.2));
        }
        for (let i = 0; i < 6; i++)
          ps.spawn(P.SMOKE, HX + R.range(-6, 6), HZ * FLOOR - R.range(4, 14), R.range(-15, 25), -R.range(14, 42), R.range(1.0, 1.5), DUST, R.range(3, 5));
        for (let i = 0; i < 3; i++) ps.spawn(P.STAR, HXS + R.range(-8, 8), HYS + R.range(-10, 4), 0, -4, R.range(0.2, 0.4), S[7], R.range(1, 2));
      }
      // the chunks: gravity, drag, a bounce on the floor at their own depth, then sliding to rest
      for (const b of chunks) {
        if (b.life > 0) b.life -= dt;
        if (b.rest) { b.rot += b.va * dt * 0.15; continue; }
        const k = Math.exp(-b.drag * dt);
        b.vx *= k; b.vz *= k; b.vh = b.vh * k - G * b.g * dt;
        b.x += b.vx * dt; b.z += b.vz * dt; b.h += b.vh * dt;
        b.rot += b.va * dt;
        if (b.h > 0) continue;
        b.h = 0;
        if (-b.vh > 60) {
          // it hits and kicks up a little dust where it lands
          b.vh = -b.vh * b.bounce; b.vx *= 0.7; b.vz *= 0.7; b.va *= 0.6;
          if (R.chance(0.7))
            for (let i = 0; i < 2; i++) ps.spawn(P.DUST, b.x, b.z * FLOOR - 0.5, R.sign() * R.range(8, 35), R.range(-2, 10), Math.min(R.range(0.3, 0.6), meta.duration - 0.05 - t), DUST2, R.range(1.3, 2.6));
        } else {
          b.vh = 0; b.rest = true;
          for (let i = 0; i < 2; i++) ps.spawn(P.DUST, b.x + R.range(-1.5, 1.5), b.z * FLOOR - 0.5, R.sign() * R.range(8, 30), R.range(-2, 12), Math.min(R.range(0.3, 0.6), meta.duration - 0.05 - t), DUST2, R.range(1.3, 2.6));
        }
      }
      fly.update(dt);
      ps.update(dt);
      lights.update(dt);
      const left = Math.max(0.001, meta.duration - 0.05 - t);
      fly.cap(left);
      for (const q of ps.list) if (q.life > left) q.life = left;
    },
    drawBack(p) {
      scar(p);
      const e = t - tHit, k = e / 0.45;
      if (k > 0 && k < 1) {
        p.glow(HXS, HYS, 50 * ease.outCubic(k), hex("#ffb060"), 0.3 * (1 - k));
        dustWave(p, HXS, HYS, 46 * ease.outCubic(k), WAVE, (g) => Math.sin(g) < 0, S0 + 1, 1 - k * 0.7);
      }
      fly.draw(p, (q) => q.z < HZ, null);
      ps.draw(p, "back");
    },
    draw(p) {
      if (t >= meta.duration - 1e-6) return;
      if (t < tHit) {
        const b = at(t), x = b.s * DX, z = b.s * DZ, y = z * FLOOR - b.h;
        // its shadow on the floor under it, tightening as it comes down; then the speed lines trailing it
        blendShadow(p, x, z * FLOOR, RAD * clamp(0.35 + 0.65 * (1 - b.h / 120), 0.2, 1), S[3], 0.45);
        const vx = VS * DX, vz = VS * DZ, vy = vz * FLOOR - (VH - G * t), sp = Math.hypot(vx, vy) || 1, ux = vx / sp, uy = vy / sp;
        for (let i = 0; i < 4; i++) {
          const off = (i - 1.5) * RAD * 0.55, nx = -uy * off, ny = ux * off, L = 10 + (i % 2) * 6;
          p.line(x - ux * (RAD + 2) + nx, y - uy * (RAD + 2) + ny, x - ux * (RAD + 2 + L) + nx, y - uy * (RAD + 2 + L) + ny, i % 2 ? S[3] : S[4]);
        }
        rock(p, x, y, RAD, t * 13, S0, S);
        moss(p, x, y, RAD * 0.82, t * 13, S0, MOSS, false);
        p.glow(x, y, RAD * 2, S[6], 0.12);
      }
      const e = t - tHit;
      // the hero frame: the boulder flashes white as it breaks, lines of force burst out over the ground
      if (e >= 0 && e < 0.07) {
        rock(p, HXS, HYS, RAD, tHit * 13, S0, S, 1, true);
        sparkle(p, HXS, HYS, 12 * (1 - e / 0.07), WHITE, hex("#ffd27a"), 0.6);
      }
      if (e >= 0 && e < 0.14) {
        const k = e / 0.14;
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * TAU, r0 = RAD + 4 + 16 * k, r1 = r0 + 8 * (1 - k);
          const dx = Math.cos(a), dz = Math.sin(a) * FLOOR;
          p.line(HXS + dx * r0, HYS + dz * r0, HXS + dx * r1, HYS + dz * r1, k < 0.5 ? WHITE : S[6]);
        }
      }
      const k = e / 0.45;
      if (k > 0 && k < 1) dustWave(p, HXS, HYS, 46 * ease.outCubic(k), WAVE, (g) => Math.sin(g) >= 0, S0 + 1, 1 - k * 0.7);
      for (const b of chunks) {
        // each piece of the broken boulder sits on the floor it lands on: its own little shadow under it
        if (b.h < 60) blendShadow(p, b.x, b.z * FLOOR, b.s * (0.9 + b.h / 140), S[3], 0.5 * (1 - b.h / 60));
        rock(p, sx(b), sy(b), b.s, b.rot, b.seed, S, meltOf(b), false, b.s > 4.2 ? 6 : b.s > 2.6 ? 5 : 4);
      }
      fly.draw(p, (q) => q.z >= HZ, null);
      ps.draw(p, "front");
      lights.draw(p);
    },
  };
}
