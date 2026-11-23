// Meteor for the game's 2:1 isometric camera: fire/meteor rewritten for the floor the game sees, not its picture
// squashed, stretched or scaled. The recipe is the source's (its rock, comet of flame, flash, flare, fireball and
// smoke column, its palette and timing); what changed is the world it happens in:
//   - the air keeps its height: the comet, the fireball and the smoke column stand up the screen as they do in the
//     side view, because height is height in both cameras;
//   - the floor has depth now: the light of the incoming rock is a pool on the floor right under it, tightening and
//     brightening as it comes down; the crater is a 2:1 bowl with its broken lip heaped round it; the shock lifts a
//     ring of dust racing out over the floor as a 2:1 ellipse; the ground surge rolls out every way, not just left
//     and right;
//   - what is thrown out flies in three dimensions (x across, z into the floor, h up): rocks, grit, sparks and
//     burning brands go out every way round the strike, fall, bounce, slide and come to rest at their own depth,
//     kicking dust where they land;
//   - it leaves the way such a thing would: the brands burn down and go out, the smoke thins, the hot rocks crumble,
//     the crater cools to soot and settles grain by grain, the rock in it cracks apart. Nothing fades as a picture.
// 1 px = 1 character sprite px (32 x 16 px tiles).
import { Particles, Lights, P, PF, Rng, fit, band, flare, clamp, smooth, ease, noise, noise2, rand, TAU, WHITE, hex, mix, scale, rgb } from "../../core/index.js";
import { hotFirst, flameBlade, flameTongue, simDraw, floorLight, firePuff, spark, LAYERS } from "./_lib.js";

export const meta = {
  name: "Meteor (iso)",
  desc: "fire/meteor rewritten for the 2:1 floor, its blast twice the reach: the fireball stands up, dust races out, rocks and brands fly every way and land at their own depth.",
  tags: ["fire", "meteor", "impact", "explosion", "spell", "debris", "one-shot", "iso", "top-down", "ground"],
  size: [480, 410],
  origin: [240, 290],
  duration: 5,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: {
    palette: ["#4a1712", "#8a1f17", "#c9281f", "#f2561d", "#ff8a2a", "#ffc23d", "#ffe26b", "#fff3a6", "#ffffff"],
    stone: "#4a3f69",
    rock: ["#120e16", "#2a2230", "#463a4a", "#6a5a66"],
    seed: 9,
  },
};

const HIT = 0.62, D = meta.duration, FL = 0.5;          // FL: the floor's 2:1 (a point z deep sits z/2 down the screen)
const FROM = { x: -112, z: -40, h: 122 };                // where the rock comes from: up, left and a little behind
const SOOT = hex("#0d0a12"), SOOT2 = hex("#17121d"), OUTLINE = hex("#1a1422"), WARM = rgb(255, 176, 96);
const CR = 72;                                           // the crater's radius across the floor: twice the side view's blast

function stone(c) {
  c = hex(c);
  return { light: mix(scale(c, 1.35), WHITE, 0.08), body: c, shade: scale(c, 0.64), dust: mix(scale(c, 1.2), rgb(150, 140, 150), 0.3) };
}

/** A body in the game's 3D: x across, z into the floor, h up. Gravity pulls it down; the floor bounces it, then it slides to rest. */
function step3(b, dt) {
  if (b.rest) return;
  const k = Math.exp(-b.drag * dt);
  b.vx *= k; b.vz *= k; b.vh *= k;
  b.vh -= b.g * dt;
  b.x += b.vx * dt; b.z += b.vz * dt; b.h += b.vh * dt;
  if (b.h > 0) return;
  b.h = 0;
  if (!b.landed) { b.landed = true; b.onLand?.(b); }
  if (-b.vh > 40) { b.vh = -b.vh * b.bounce; b.vx *= 0.6; b.vz *= 0.6; return; }
  b.vh = 0;
  const f = Math.exp(-9 * dt);
  b.vx *= f; b.vz *= f;
  if (Math.hypot(b.vx, b.vz) < 3) b.rest = true;
}
const sx = (b) => b.x, sy = (b) => b.z * FL - b.h;

export function create(o) {
  const F = fit(o.palette, 9), H = hotFirst(F), RK = fit(o.rock, 4), st = stone(o.stone), R = new Rng(o.seed), S = o.seed * 11;
  const ps = new Particles({ rng: R, ground: () => 0, sparks: [H[1], H[2], H[4], H[5]] });
  const lights = new Lights(), GLOW = mix(mix(H[3], H[4], 0.5), WHITE, 0.25), SPK = [H[1], H[2], H[4], H[5]];
  const thrown = [];   // rocks, grit, sparks and brands, flying in 3D
  // the flight: speeding up a touch as it falls, along a straight line out of the sky
  const prog = (tt) => ease.inQuad(clamp(tt / HIT)) * 0.35 + clamp(tt / HIT) * 0.65;
  const at = (tt) => { const k = 1 - prog(tt); return { x: FROM.x * k, z: FROM.z * k, h: FROM.h * k }; };
  const s0 = { x: FROM.x, y: FROM.z * FL - FROM.h }, len = Math.hypot(s0.x, s0.y), ux = -s0.x / len, uy = -s0.y / len;
  let t = 0, hit = false, last = at(0);

  // the meteor: a lumpy rock, white-hot on its leading face, cracks glowing over its dark back; `gone` crumbles it
  const meteor = (p, x, y, R0, cool, gone = 0) => {
    p.shade(x - R0 - 2, y - R0 - 2, x + R0 + 2, y + R0 + 2, (px, py, out) => {
      const dx = px - x, dy = py - y, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx), rr = R0 * (1 + 0.18 * noise(a * 2.2 + 3, S) + 0.1 * noise(a * 5, S + 1));
      if (d > rr + 1) return;
      if (gone > 0 && rand(Math.floor(dx) + 40, Math.floor(dy) + 40, S + 13) < gone) return;
      out.a = 1;
      if (d > rr) return OUTLINE;
      const face = (dx * ux + dy * uy) / Math.max(1, d), heat = (1 - cool) * (face * 0.6 + 0.5 - (d / rr) * 0.25);
      if (heat > 0.62) return heat > 0.85 ? H[0] : heat > 0.74 ? H[1] : H[2];
      if (heat > 0.42) return H[4];
      const h = rand(Math.floor(px - x), Math.floor(py - y), S + 3);
      if (h < 0.22 * (1 - cool * 0.7)) return (1 - cool) > 0.5 ? H[4] : H[6];
      return dx * -0.6 + dy * -0.8 > 0 ? RK[2] : d / rr > 0.6 ? RK[0] : RK[1];
    });
  };
  // a thrown rock, lit from the fire, crumbling grain by grain when it is done
  const rock = (p, b) => {
    const r = 0.6 + b.s * 0.75, x = sx(b), y = sy(b), gone = clamp((t - b.crumble) / 0.45), heat = clamp(1 - (t - HIT) / 1.6);
    if (gone >= 1) return;
    p.shade(x - r - 1, y - r - 1, x + r + 1, y + r + 1, (px, py, out) => {
      const dx = px - x, dy = py - y, d = Math.hypot(dx * 1.15, dy);
      if (d > r + 0.9) return;
      if (gone > 0 && rand(Math.floor(dx) + b.id * 7, Math.floor(dy) + 9, S + 17) < gone) return;
      const lit = dx * Math.cos(b.a) + dy * Math.sin(b.a);
      out.a = 1;
      out.c = d > r ? OUTLINE : lit < -0.4 ? (heat > 0.5 ? mix(st.light, H[4], heat - 0.3) : st.light) : lit > 0.6 ? st.shade : st.body;
    });
    if (b.h > 0.5) p.px(x, b.z * FL, mix(SOOT2, st.shade, 0.3));   // its shadow on the floor while it flies
  };
  // the crater: a 2:1 bowl of hot rock cooling to soot, its lip of broken floor heaped round it, settling at the end
  const crater = (p) => {
    if (t < HIT) return;
    const a = t - HIT, end = 1 - smooth(D - 1, D - 0.15, t), rx = CR * Math.min(1, a / 0.08), ry = rx * FL;
    for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++)
      for (let x = Math.floor(-rx); x <= Math.ceil(rx); x++) {
        const dx = (x + 0.5) / rx, dy = (y + 0.5) / ry, d = Math.sqrt(dx * dx + dy * dy);
        if (d > 1 || rand(x * 17 + 300, y * 131 + 300, S + 9) > end) continue;
        // the melt cools in patches and cracks, not as static: mostly a smooth field, a little grain
        const k = 0.5 + 0.4 * noise2(x * 0.15, y * 0.3, S + 5) + 0.1 * (rand(x * 31 + y, S + 5) - 0.5), T = Math.pow(clamp(1 - a / 2.6), 1.3) * (1.25 - d) - k * 0.35;
        if (T > 0.06) {
          const c = H[Math.min(8, Math.floor((1 - Math.min(1, T)) * 8))];
          p.dot(x, y, c, 1);
          if ((x & 3) === 0 && (y & 1) === 0) p.glow(x + 0.5, y, 7, c, 0.2 * T * end);
        } else p.dot(x, y, d < 0.55 ? SOOT : SOOT2, d < 0.95 - k * 0.3 ? 1 : 1 - d);
      }
    // the lip: broken floor heaped round the rim in clumps with gaps between them, every column of it touching the
    // next; the far side's inner face looks at us and catches the glow from the bowl
    const n = Math.round(TAU * Math.sqrt((rx * rx + ry * ry) / 2) * 1.3), glow = clamp(1 - a / 2);
    for (let i = 0; i < n; i++) {
      const th = (i / n) * TAU, heap = noise(th * 14 + 1.7, S + 8) * 0.6 + noise(th * 34, S + 12) * 0.4;
      if (heap < -0.15) continue;                                   // a gap in the lip
      const e = 1.02 + 0.05 * heap, x = Math.round(Math.cos(th) * rx * e), y = Math.round(Math.sin(th) * ry * e);
      if (rand(x + 500, y + 500, S + 21) > end) continue;
      const hh = 1 + Math.round(3.4 * clamp(heap + 0.15)), far = Math.sin(th) < 0;
      for (let j = 0; j < hh; j++) p.dot(x, y - j, j === hh - 1 ? mix(st.light, H[4], (far ? 0.65 : 0.15) * glow) : j === 0 && !far ? OUTLINE : st.shade, 1);
    }
  };
  const throw3 = (b) => { b.vx ??= 0; b.vz ??= 0; b.vh ??= 0; b.drag ??= 0.4; b.bounce ??= 0.3; b.id = thrown.length; thrown.push(b); return b; };
  // out every way round the strike: a heading on the floor, a speed along it, a speed up
  const outward = (lo, hi, uLo, uHi, bias = 0.2) => {
    const a = R.range(0, TAU), sp = R.range(lo, hi);
    return { vx: Math.cos(a) * sp + bias * sp, vz: Math.sin(a) * sp, vh: R.range(uLo, uHi), a };
  };
  // dust kicked up where something lands, rolling out over the floor
  const dust = (x, y, n, sp) => {
    for (let i = 0; i < n; i++) {
      const a = R.range(0, TAU), v = R.range(sp * 0.4, sp);
      ps.spawn(P.DUST, x + Math.cos(a) * 1.5, y + Math.sin(a) * 0.75 - 0.5, Math.cos(a) * v, Math.sin(a) * v * FL - R.range(2, 10), R.range(0.3, 0.6), st.dust, R.range(1.3, 2.6));
    }
  };

  return {
    update(dt) {
      t += dt;
      if (t < HIT) {
        // the flight: a comet of fire shed behind, smoke, sparks, embers, all in screen space as in the side view
        const b = at(t), x = b.x, y = b.z * FL - b.h, vx = (x - sx(last)) / dt, vy = (y - sy(last)) / dt;
        last = b;
        for (let i = 0; i < 5; i++) {
          if (!R.chance(0.8 * dt * 60)) continue;
          ps.spawn(P.FIRE, x - ux * R.range(4, 16) + R.range(-6, 6), y - uy * R.range(4, 16) + R.range(-6, 6), vx * 0.15 + R.range(-30, 30), vy * 0.15 + R.range(-40, 14), R.range(0.35, 0.7), 0, R.range(5, 10), 0, R.chance(0.65) ? PF.SMOKES | PF.BIG : 0);
        }
        if (R.chance(0.9 * dt * 60)) ps.spawn(P.SPARK, x + R.range(-6, 6), y + R.range(-6, 6), vx * 0.35 + R.range(-80, 80), vy * 0.35 + R.range(-80, 40), R.range(0.2, 0.5));
        if (R.chance(0.5 * dt * 60)) ps.spawn(P.EMBER, x + R.range(-6, 6), y + R.range(-6, 6), vx * 0.1 + R.range(-30, 30), vy * 0.1 + R.range(-40, 0), R.range(0.8, 1.6), H[3], R.chance(0.2) ? 2 : 1);
      } else if (!hit) {
        hit = true;
        lights.add(0, -50, 170, WARM, 0.95, 1.0);
        lights.add(0, -24, 76, WHITE, 0.9, 0.14);
        // the fireball: a dome of flame thrown up and out every way, leaning on with the rock's momentum
        for (let i = 0; i < 64; i++) {
          const a = R.range(0, TAU), sp = R.range(60, 300), up = R.range(50, 200);
          ps.spawn(P.FIRE, R.range(-12, 12), R.range(-6, 6) - R.range(2, 12), Math.cos(a) * sp * 0.9 + 35, Math.sin(a) * sp * FL - up, R.range(0.55, 1.2), 0, R.range(6, 11), 0, R.chance(0.5) ? PF.SMOKES | PF.BIG : 0);
        }
        for (let i = 0; i < 15; i++) ps.spawn(P.FIRE, R.range(-14, 14), R.range(-4, 4) - 6, R.range(-20, 20), -R.range(140, 240), R.range(0.8, 1.25), 0, R.range(7, 10), R.range(0, 0.12), PF.SMOKES | PF.BIG);
        // the smoke column, rising out of the whole mouth of the crater
        for (let i = 0; i < 32; i++) {
          const a = R.range(0, TAU), d = R.range(8, 36);
          ps.spawn(P.SMOKE, Math.cos(a) * d, Math.sin(a) * d * FL - R.range(6, 26), Math.cos(a) * R.range(20, 70), -R.range(30, 110), R.range(1.8, 2.8), 0, R.range(10, 15), R.range(0.15, 0.5), PF.BIG);
        }
        // the ground surge: dust rolling out over the floor every way from the strike
        for (let i = 0; i < 46; i++) {
          const a = R.range(0, TAU), sp = R.range(120, 270);
          ps.spawn(P.SMOKE, Math.cos(a) * 28, Math.sin(a) * 14 - R.range(1, 4), Math.cos(a) * sp, Math.sin(a) * sp * FL - R.range(2, 12), R.range(1.2, 2.0), st.dust, R.range(6, 10), R.range(0, 0.06), PF.BIG);
        }
        for (let i = 0; i < 56; i++) {
          const a = R.range(0, TAU), sp = R.range(80, 280);
          ps.spawn(P.EMBER, Math.cos(a) * 16, Math.sin(a) * 8 - 8, Math.cos(a) * sp, Math.sin(a) * sp * FL - 70, R.range(1.2, 2.6), H[3]);
        }
        // what is thrown out, in 3D: sparks, burning brands, rocks, grit
        for (let i = 0; i < 140; i++) {
          const v = outward(120, 420, 60, 280, 0.12);
          throw3({ kind: "spark", x: 0, z: 0, h: 4, ...v, g: 427, drag: 2.2, bounce: 0.45, life: R.range(0.2, 0.7) });
        }
        for (let i = 0; i < 20; i++) {
          const v = outward(90, 230, 90, 200, 0.12);
          throw3({ kind: "brand", x: 0, z: 0, h: 6, ...v, g: 320, drag: 0.5, bounce: 0.2, burn: R.range(1.3, 2.3), n: i * 37 + 5,
            onLand: (b) => { b.lit = t; dust(sx(b), sy(b), 2, 24); } });
        }
        for (let i = 0; i < 48; i++) {
          const v = outward(50, 180, 140, 300, 0.12);
          throw3({ kind: "rock", x: R.range(-16, 16), z: R.range(-16, 16), h: 3, ...v, g: 520, drag: 0.4, bounce: 0.3, s: R.int(1, 3), a: R.range(0, TAU),
            crumble: R.range(3.4, 4.3), onLand: (b) => dust(sx(b), sy(b), 3, 30) });
        }
        for (let i = 0; i < 100; i++) {
          // most of the grit falls back round the crater; only a few grains carry far
          const v = R.chance(0.8) ? outward(50, 200, 80, 220, 0.12) : outward(200, 300, 60, 160, 0.12);
          throw3({ kind: "grit", x: R.range(-12, 12), z: R.range(-12, 12), h: 1, ...v, g: 470, drag: 1.2, bounce: 0.25, c: R.pick([st.light, st.body, st.body, st.shade]), s: R.chance(0.45) ? 2 : 1, settle: R.next() });
        }
      }
      for (const b of thrown) step3(b, dt);
      ps.update(dt);
      lights.update(dt);
    },
    drawBack(p) {
      crater(p);
      simDraw(p, ps, H, "back");
      const k = (t - HIT) / 0.6;
      if (k > 0 && k < 1) band(p, 0, 0.5, 200 * ease.outCubic(k), FL, Math.max(1, 7 * (1 - k)), 1.15 - k, [st.body, st.light, H[4], H[1]], (g) => Math.sin(g) < 0);
      drawThrown(p, false);
    },
    draw(p) {
      const k = (t - HIT) / 0.6;
      if (k > 0 && k < 1) band(p, 0, 0.5, 200 * ease.outCubic(k), FL, Math.max(1, 7 * (1 - k)), 1.15 - k, [st.body, st.light, H[4], H[1]], (g) => Math.sin(g) >= 0, k < 0.12);
      if (t < HIT) {
        // the comet, and the pool of light it throws on the floor right under it: tighter and brighter as it comes
        const b = at(t), x = b.x, y = b.z * FL - b.h, NZ = (rate, seed = 0, off = 0) => noise(t * rate + off, seed), near = 1 - b.h / FROM.h;
        floorLight(p, b.x, b.z * FL, 28 + 0.6 * b.h, (28 + 0.6 * b.h) * FL, GLOW, 0.7 * near * near);
        [[72, 12, 0], [54, 13, -5], [54, 13, 5], [34, 14, 0], [44, 9, -9], [44, 9, 9]].forEach(([L, w, off], i) => {
          const n = (S + i) * 13;
          flameBlade(p, x - uy * off, y + ux * off, -ux, -uy, L * (0.85 + 0.25 * NZ(5, n)), w, NZ(3, n + 3) * 5, NZ, n, H, LAYERS, 0.7, 2.4);
        });
        meteor(p, x, y, 12, 0);
        p.glow(x, y, 80, GLOW, 0.6);
        p.glow(x, y, 22, H[1], 0.45);
      } else {
        // the rock itself sits half-buried in the crater, cooling, then cracks apart
        const a = t - HIT, cool = clamp(a / 2.8), gone = smooth(D - 1.1, D - 0.2, t);
        if (gone < 1) {
          meteor(p, 0, -2, 10, cool, gone);
          p.glow(0, -4, 38, GLOW, 0.4 * (1 - cool) * (1 - gone));
        }
      }
      drawThrown(p, true);
      simDraw(p, ps, H, "front");
      // the hero frame: a white-hot flash and a flare of rays
      const f = (t - HIT) / 0.08;
      if (f > 0 && f < 1) {
        p.circle(0, -8, 16 * (1 - f * 0.3) + 2, H[3]);
        p.circle(0, -8, 16 * (1 - f * 0.3), f < 0.5 ? H[1] : H[2]);
        p.circle(0, -8, 10 * (1 - f * 0.3), f < 0.5 ? WHITE : H[1]);
      }
      const fr = (t - HIT) / 0.24;
      if (fr > 0 && fr < 1) flare(p, 0, -8, 70 * Math.pow(1 - fr, 1.4), 1 - fr, [H[6], H[4], H[2], H[1]]);
      lights.draw(p);
    },
  };

  // the thrown things behind the strike (z < 0) are drawn before the fireball, the ones in front after it
  function drawThrown(p, front) {
    const end = 1 - smooth(D - 1, D - 0.15, t), NZ = (rate, seed = 0, off = 0) => noise(t * rate + off, seed);
    for (const b of thrown) {
      if ((b.z >= 0) !== front) continue;
      const x = sx(b), y = sy(b), age = t - HIT;
      if (b.kind === "spark") {
        const k = 1 - age / b.life;
        if (k > 0) spark(p, x, y, b.vx, b.vz * FL - b.vh, k, SPK);
      } else if (b.kind === "rock") rock(p, b);
      else if (b.kind === "grit") {
        if (b.settle > end) continue;
        p.px(x, y, b.c);
        if (b.s > 1) p.px(x + 1, y, b.h > 0 ? b.c : OUTLINE);
      } else if (b.kind === "brand") {
        if (!b.lit) {
          // in the air: a burning splinter trailing a lick of flame
          firePuff(p, x, y, 0.8, 2.2, 0.1, H, 0.2);
          firePuff(p, x - b.vx * 0.02, y - (b.vz * FL - b.vh) * 0.02, 0.45, 1.6, 0.3, H, 0.1);
        } else {
          // on the floor: it keeps burning, smaller and redder, until it goes out
          const k = 1 - (t - b.lit) / b.burn;
          if (k <= 0) continue;
          p.px(x - 1, y, SOOT2), p.px(x, y, k > 0.3 ? H[3] : H[6]), p.px(x + 1, y, SOOT2);
          const h = 2 + 7 * Math.pow(k, 0.7) * (0.8 + 0.2 * NZ(6, b.n));
          if (k > 0.12) flameTongue(p, x, y - 0.5, h, 1.4 + 0.8 * k, NZ(2.4, b.n + 3) * 1.5, NZ, b.n, H, LAYERS, 0.4, 0.8);
          p.glow(x, y - 2, 8, H[3], 0.3 * k);
        }
      }
    }
  }
}
