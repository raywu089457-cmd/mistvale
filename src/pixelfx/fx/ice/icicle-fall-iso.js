// Icicle fall for the game's 2:1 isometric camera: ice/icicle-fall rewritten for the floor the game sees, not its picture
// squashed, stretched or scaled. The recipe is the source's: an icicle hangs from a frosted crust, a drop of meltwater
// swells and falls, it trembles and frost sifts down, it snaps off its root, drops, stabs the floor and bursts into
// skidding shards, splinters and rolling frost. What changed is the world it happens in:
//   - nothing hangs over this floor, so the crust forms first: frost crystallizes into a slab in the air, 80 px up,
//     out from its middle, and the icicle freezes down from it, its tip last; seen from above we look on the crust's
//     lit top and its front edge, stubs of older icicles hanging under it;
//   - its shadow gathers on the floor as a 2:1 ellipse under it, tightening and darkening as it comes down;
//   - it bursts in 3D: the pieces, shards and chunks fly out every way round, land at their own depth, shatter, skid
//     and melt; the frost splash and the ring it throws are 2:1 on the floor, and the splash melts away patch by patch;
//   - at the end the crust crumbles, its snow sifting down, rather than fading.
// 1 px = 1 character sprite px (32 x 16 px tiles).
// The break recipe (a white frame, the ice flung apart as shards with ice dust and glints) is adapted from Sprite
// Fusion's open-source ice (https://www.spritefusion.com/pixel-art-vfx/ice), MIT License, Copyright (c) 2026 Hugo Duprez.
import { Particles, Lights, P, Rng, fit, sparkle, band, clamp, smooth, seg, ease, rand, noise2, TAU, WHITE, GRAVITY } from "../../core/index.js";
import { Panes, splitPoly, centroid } from "./_lib.js";
import { pixelSet, setPx, drawSet, ringNoise } from "../_iso.js";

export const meta = {
  name: "Icicle fall (iso)",
  desc: "ice/icicle-fall on the 2:1 floor: frost crusts in the air and an icicle freezes down from it, drips, snaps, drops and bursts on the floor, its shards landing all round.",
  tags: ["ice", "icicle", "fall", "trap", "shatter", "one-shot", "iso", "top-down"],
  size: [200, 168],
  origin: [100, 126],
  duration: 3,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: ["#151a3d", "#212f6b", "#2c58aa", "#3a8bd8", "#62c8f4", "#a6ecff", "#dcfbff", "#ffffff"], seed: 4 },
};

const FL = 0.5;
const ROOT = 80, LEN = 36, W = 12; // where it hangs (height over the floor), how long, how wide at the root
const CRUST = [0.0, 0.22], GROW = [0.14, 0.36]; // the crust crystallizes, then the icicle freezes down from it
const DRIP = 0.5, TREMBLE = 0.64, SNAP = 0.94, FREE = SNAP + 0.04;
const FALL_T = Math.sqrt((2 * (ROOT - LEN)) / GRAVITY), IMPACT = FREE + FALL_T;
const CRUMBLE = [2.35, 2.85]; // the crust breaks up and sifts down
const RX = 19, RZ = 11; // the crust's reach over the floor

// the icicle: a rippled taper hanging from (x, top) on screen, lit down its left side with a bright core streak, rings
// of light at the ripples, deep on the right, a dark rim; white flashes it; grown (0..1) is how far down it has frozen
// (its fresh tip white)
function icicle(p, C, x, top, len, w, opts = {}) {
  const hw = (u) => (w / 2) * Math.pow(1 - u, 0.75) * (1 + 0.14 * Math.sin(u * 13 + 0.5)) * (u < 0.08 ? 1.15 : 1) + 0.3;
  const grown = opts.grown ?? 1;
  p.shade(x - w / 2 - 4, top - 1, x + w / 2 + 4, top + len + 1, (px, py, o) => {
    const u = (py - top) / len, cx = x + 0.7 * Math.sin(u * 6 + 1), s = px - cx;
    if (u < 0 || u > 1 || u > grown) return;
    const h = hw(u);
    if (Math.abs(s) > h + 1) return;
    if (Math.abs(s) > h) {
      o.c = C[1];
      return;
    }
    if (opts.white || (grown < 1 && grown - u < 0.06)) return (o.c = WHITE);
    const q = s / h, ring = Math.sin(u * 13 + 0.5) > 0.7;
    let c = u > 0.88 ? WHITE : q < -0.72 ? C[6] : q < -0.2 ? (ring ? C[7] : C[5]) : q < 0.18 ? (u < 0.72 ? C[7] : C[6]) : q > 0.8 ? C[2] : Math.abs(q - 0.45) < 0.1 && u > 0.15 && u < 0.6 ? C[5] : q < 0.6 ? C[4] : C[3];
    if (opts.glint >= 0 && q < 0.25 && Math.abs(u - opts.glint) < 0.06) c = WHITE;
    o.c = c;
  });
}

export function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed), S0 = o.seed * 17;
  const ps = new Particles({ rng: R, ground: () => Infinity, sparks: [C[7], C[6], C[5], C[4]], haze: C[5] }), lights = new Lights();
  const shards = [], panes = [], drawer = new Panes();
  const shard = (b) => shards.push({ vx: 0, vz: 0, vh: 0, a: R.range(0, TAU), va: R.range(-20, 20), s: 2, rest: false, kind: 0, drag: 0.6, bounce: 0.3, ...b });
  const splinter = (x, z, v, n) => {
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(v[1], v[0]) + R.range(-1.2, 1.2), sp = Math.hypot(v[0], v[1]) * 0.5 + R.range(10, 45);
      shard({ x: x + R.range(-2, 2), z: z + R.range(-2, 2), h: 1, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vh: R.range(30, 100), drag: 0.6, bounce: 0.35, life: R.range(0.4, 0.75), s: R.range(1.2, 2.4), c: C[R.int(4, 7)] });
    }
  };

  // ---- the crust: a slab of rime hanging in the air, one column per floor pixel of its footprint (its thickness),
  // crystallizing out from the middle and crumbling at the end; stubs of older icicles hang from its front edge
  const CRY = Math.ceil(RZ * FL), CELLS = [], STUBS = [];
  for (let y = -CRY - 1; y <= CRY + 1; y++)
    for (let x = -RX - 2; x <= RX + 2; x++) {
      const fx = x + 0.5, fz = (y + 0.5) / FL, th = Math.atan2(fz / RZ, fx / RX), d = Math.hypot(fx / RX, fz / RZ) / (1 + 0.14 * ringNoise(th, 2, S0) + 0.08 * ringNoise(th, 6, S0 + 1));
      if (d >= 1) continue;
      CELLS.push({ x, y, d, thick: 1 + Math.round((0.6 + rand(x, y, S0 + 2) * 1.8) * (1 - d * 0.6)), gone: 0.85 * clamp(0.5 + 0.75 * noise2(fx * 0.2, fz * 0.2, S0 + 3)) + 0.15 * rand(x + 9, y, S0 + 4) });
    }
  CELLS.sort((a, b) => a.y - b.y);   // far rows first, so the nearer ones cover them
  for (const c of CELLS) {
    // a stub hangs under the front edge here and there (the cell with nothing nearer below it)
    const front = !CELLS.some((e) => e.x === c.x && e.y === c.y + 1);
    if (front && Math.abs(c.x) > 6 && rand(c.x, S0 + 5) < 0.32) STUBS.push({ c, L: 2 + Math.round(rand(c.x, S0 + 6) * 5 * (1 - c.d * 0.5)) });
  }
  const crustAt = (c) => CRUST[0] + (CRUST[1] - CRUST[0]) * c.d;   // when the crystallizing front reaches a cell

  // ---- the frost splashed over the floor where it strikes: a 2:1 patch, its fields worked out once
  const SR = 26, SPL = { x: [], y: [], d: [], gone: [] }, TUFTS = [];
  for (let y = -Math.ceil(SR * FL * 1.2); y <= Math.ceil(SR * FL * 1.2); y++)
    for (let x = -Math.ceil(SR * 1.2); x <= Math.ceil(SR * 1.2); x++) {
      const fx = x + 0.5, fz = (y + 0.5) / FL, th = Math.atan2(fz, fx), d = Math.hypot(fx, fz) / (SR * (1 + 0.16 * ringNoise(th, 2.5, S0 + 7) + 0.1 * ringNoise(th, 8, S0 + 8)));
      if (d >= 1) continue;
      SPL.x.push(x); SPL.y.push(y); SPL.d.push(d);
      SPL.gone.push(0.9 * clamp(0.5 + 0.75 * noise2(fx * 0.14, fz * 0.14, S0 + 9)) + 0.1 * rand(x, y + 3, S0 + 10));
      if (rand(x + 1, y + 2, S0 + 11) < 0.07) TUFTS.push({ x, y, d, L: Math.round((1 + rand(x, y, S0 + 12) * 2.5) * (1 - d)), s: Math.sign(fx) || 1, g: SPL.gone[SPL.gone.length - 1] });
    }
  const SSET = pixelSet(SPL.x.length, [-Math.ceil(SR * 1.2), -Math.ceil(SR * FL * 1.2), Math.ceil(SR * 1.2), Math.ceil(SR * FL * 1.2)]);

  let t = 0, snapped = false, landed = false, dripped = false;
  const top = () => ROOT - (t < FREE ? 0 : 0.5 * GRAVITY * (t - FREE) ** 2);   // the icicle's root, its height
  const splashMelt = () => smooth(IMPACT + 0.8, IMPACT + 1.5, t);

  return {
    update(dt) {
      t += dt;
      // the crust crystallizes: frost motes gather to it
      if (t < CRUST[1] + 0.1 && R.chance(0.6)) {
        const a = R.range(0, TAU), d = R.range(16, 34);
        ps.spawn(P.STREAK, Math.cos(a) * d, Math.sin(a) * d * FL - ROOT - R.range(-6, 6), -Math.cos(a) * R.range(60, 110), -Math.sin(a) * R.range(60, 110) * FL, R.range(0.1, 0.18), R.chance(0.5) ? C[6] : C[5]);
      }
      // a drop of meltwater swells at the tip and falls to the floor
      if (!dripped && t >= DRIP) {
        dripped = true;
        shard({ kind: 1, x: 0.5, z: 0, h: ROOT - LEN - 1, vh: -20, drag: 0, bounce: 0, life: 1.2, s: 1, c: C[6] });
      }
      // it trembles: frost sifts down from the root
      if (t > TREMBLE && t < SNAP && R.chance(0.25)) ps.spawn(P.FLAKE, R.range(-6, 6), -ROOT + R.range(0, 3), R.range(-8, 8), R.range(5, 20), R.range(0.6, 1.1), R.chance(0.5) ? WHITE : C[6], R.range(0.5, 1.1));
      // it snaps: a crack flashes across the root, chips burst off it every way, a puff
      if (!snapped && t >= SNAP) {
        snapped = true;
        lights.add(0, -ROOT + 4, 24, WHITE, 0.6, 0.1);
        lights.add(0, -ROOT + 4, 32, C[5], 0.4, 0.3);
        for (let i = 0; i < 7; i++) {
          const a = R.range(0, TAU), sp = R.range(30, 110);
          shard({ x: R.range(-4, 4), z: R.range(-2, 2), h: ROOT - 2, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vh: R.range(-20, 40), drag: 0.8, bounce: 0.3, life: R.range(0.9, 1.4), s: R.range(1, 2), c: C[R.int(5, 7)] });
        }
        for (let i = 0; i < 3; i++) ps.spawn(P.VAPOUR, R.range(-5, 5), -ROOT + 2, R.range(-25, 25), R.range(-5, 5), R.range(0.4, 0.7), C[6], R.range(1.6, 2.6));
        for (let i = 0; i < 5; i++) ps.spawn(P.FLAKE, R.range(-6, 6), -ROOT + 2, R.range(-30, 30), R.range(-20, 20), R.range(0.6, 1.2), R.chance(0.5) ? WHITE : C[6], R.range(0.5, 1.3));
      }
      // falling: it sheds frost motes that hang in the air behind it
      if (t > FREE && t < IMPACT && R.chance(0.5)) ps.spawn(P.MOTE, R.range(-3, 3), -top() + R.range(0, LEN * 0.6), R.range(-10, 10), R.range(-40, -10), R.range(0.2, 0.35), R.chance(0.5) ? C[6] : C[5], 0.6);
      // it stabs the floor and bursts every way round
      if (!landed && t >= IMPACT) {
        landed = true;
        lights.add(0, -16, 46, WHITE, 0.85, 0.12);
        lights.add(0, -16, 58, C[4], 0.5, 0.5);
        // the icicle in pieces: cut across its length, then down the middle; each piece from where it was on it
        let parts = [[[-W / 2, -LEN], [W / 2, -LEN], [0.5, 0]]];
        for (const v of [0.3, 0.58, 0.8]) parts = parts.flatMap((poly) => splitPoly(poly, 0, -LEN + LEN * v + R.range(-2, 2), R.range(-0.4, 0.4)));
        parts = parts.flatMap((poly) => (centroid(poly).area > 22 ? splitPoly(poly, centroid(poly).x, centroid(poly).y, Math.PI / 2 + R.range(-0.5, 0.5)) : [poly]));
        for (const part of parts) {
          const m = centroid(part), low = clamp(-m.y / LEN), a = (m.x < 0.5 ? Math.PI : 0) + R.range(-1.3, 1.3), sp = R.range(30, 110);
          panes.push({
            pts: part.map(([x, y]) => [x - m.x, y - m.y]), wx: m.x, wz: R.range(-1, 1), wh: Math.max(0.5, -m.y), vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vh: R.range(70, 200) * (0.4 + low),
            a: 0, va: R.range(-12, 12), f: R.range(-0.7, 0.7), vf: R.range(-8, 8), lit: 0.75, solid: true, ridge: Math.PI / 2, brittle: 2, hits: 0, crumble: R.range(0.15, 0.45), life: 9,
          });
        }
        for (let i = 0; i < 52; i++) {
          const a = R.range(0, TAU), up = R.range(0.3, 1), sp = R.range(60, 230), fwd = Math.sqrt(1 - up * up) * 0.95;
          shard({ kind: R.chance(0.15) ? 2 : 0, x: R.range(-3, 3), z: R.range(-2, 2), h: R.range(1, 10), vx: Math.cos(a) * sp * fwd, vz: Math.sin(a) * sp * fwd, vh: up * sp, drag: 0.6, bounce: 0.32, life: R.range(0.6, 1.2), s: R.range(1.2, 3), c: C[R.int(4, 7)] });
        }
        // ice dust rolling out over the floor every way round, flakes thrown up, glints
        for (let i = 0; i < 10; i++) {
          const a = R.range(0, TAU), v = R.range(25, 90), d = R.range(0, 8);
          ps.spawn(P.VAPOUR, Math.cos(a) * d, Math.sin(a) * d * FL - R.range(1, 6), Math.cos(a) * v, Math.sin(a) * v * FL - R.range(2, 14), R.range(0.6, 1.1), C[6], R.range(2.2, 3.8));
        }
        for (let i = 0; i < 12; i++) ps.spawn(P.FLAKE, R.range(-6, 6), -R.range(2, 16), R.range(-70, 70), -R.range(30, 110), R.range(1, 1.5), R.chance(0.6) ? WHITE : C[6], R.range(0.5, 1.5));
        for (let i = 0; i < 6; i++) ps.spawn(P.STAR, R.range(-24, 24), -R.range(4, 34), R.range(-10, 10), -R.range(4, 14), R.range(0.4, 0.8), R.chance(0.5) ? WHITE : C[6], R.range(1, 2.2));
      }
      if (landed && t < IMPACT + 0.9 && R.chance(0.08) && shards.length) {
        const b = R.pick(shards);
        ps.spawn(P.STAR, b.x, b.z * FL - b.h - 1, 0, -3, R.range(0.2, 0.4), R.chance(0.5) ? WHITE : C[6], R.range(0.6, 1.4));
      }
      // the crust crumbles: its snow sifts down
      if (t > CRUMBLE[0] && t < CRUMBLE[1] && R.chance(0.7)) {
        const c = R.pick(CELLS);
        ps.spawn(P.FLAKE, c.x + 0.5, c.y - ROOT, R.range(-6, 6), R.range(8, 22), R.range(0.6, 1), R.chance(0.5) ? WHITE : C[6], R.range(0.5, 1.2));
      }
      // the pieces: through the air in 3D; a piece bounces once, breaks on the floor into splinters with a puff, or
      // comes to rest and crumbles a moment later
      for (let i = panes.length - 1; i >= 0; i--) {
        const q = panes[i];
        if (q.rest) {
          if ((q.restT = (q.restT ?? 0) + dt) > q.crumble) {
            splinter(q.wx, q.wz, [q.vx, q.vz], 3);
            panes.splice(i, 1);
          }
          continue;
        }
        const k = Math.exp(-0.6 * dt);
        q.vx *= k; q.vz *= k; q.vh = q.vh * k - GRAVITY * 0.9 * dt;
        q.wx += q.vx * dt; q.wz += q.vz * dt; q.wh += q.vh * dt; q.a += q.va * dt; q.f += q.vf * dt;
        if (q.wh > 0) continue;
        q.wh = 0;
        const v = -q.vh;
        if (v > 70) {
          q.hits++;
          if (v >= 100) {
            ps.spawn(P.VAPOUR, q.wx, q.wz * FL - 1, R.range(-15, 15), R.range(-6, 6) * FL - R.range(2, 8), R.range(0.4, 0.6), C[6], R.range(1.4, 2.2));
            splinter(q.wx, q.wz, [q.vx, q.vz], 2);
          }
          if (q.hits >= q.brittle) {
            panes.splice(i, 1);
            continue;
          }
          (q.vh = v * 0.35), (q.vx *= 0.75), (q.vz *= 0.75), (q.va *= 0.6), (q.vf *= 0.5);
        } else (q.rest = true), (q.vh = 0);
      }
      for (let i = shards.length - 1; i >= 0; i--) {
        const b = shards[i];
        if ((b.life -= dt) <= 0) { shards.splice(i, 1); continue; }
        if (b.rest) {
          const f = Math.exp(-7 * dt);
          b.x += b.vx * dt; b.z += b.vz * dt; b.vx *= f; b.vz *= f; b.va *= f; b.a += b.va * dt;
          continue;
        }
        const k = Math.exp(-b.drag * dt);
        b.vx *= k; b.vz *= k; b.vh = b.vh * k - GRAVITY * (b.kind === 1 ? 0.9 : 0.85) * dt;
        b.x += b.vx * dt; b.z += b.vz * dt; b.h += b.vh * dt; b.a += b.va * dt;
        if (b.h > 0) continue;
        b.h = 0;
        if (b.kind === 1) b.life = Math.min(b.life, 0.2);   // the drop soaks into the floor
        else if (b.bounce > 0 && -b.vh > 70) (b.vh = -b.vh * b.bounce), (b.vx *= 0.7), (b.vz *= 0.7), (b.va *= 0.6);
        else (b.rest = true), (b.vh = 0), (b.vx *= 0.6), (b.vz *= 0.6);
      }
      ps.update(dt);
      lights.update(dt);
      const left = Math.max(0.001, meta.duration - 0.05 - t);
      for (const q of ps.list) if (q.life > left) q.life = left;
      for (const b of shards) if (b.life > left) b.life = left;
      for (const q of panes) if (q.rest && q.crumble > (q.restT ?? 0) + left) q.crumble = (q.restT ?? 0) + left;
    },
    drawBack(p) {
      // its shadow gathers on the floor under it as it comes down: tighter and darker the nearer it gets
      if (t > TREMBLE && t < IMPACT + 0.05) {
        const k = t < FREE ? seg(t, TREMBLE, FREE) * 0.35 : 0.35 + 0.65 * seg(t, FREE, IMPACT), rx = 3 + 7 * k;
        p.ellipse(0.5, 0.5, rx, rx * FL + 0.5, C[0], (d) => 0.7 * k * (1 - d * d));
      }
      splash(p);
      tufts(p, false);
      if (t >= IMPACT) {
        const k = seg(t, IMPACT, IMPACT + 0.35);
        if (k < 1) band(p, 0, 0.5, 6 + 34 * ease.outCubic(k), FL, Math.max(1, 4 * (1 - k)), 1.1 - k, [C[3], C[4], C[5], C[6]], (a) => Math.sin(a) < 0);
      }
      flying(p, false);
      ps.draw(p, "back");
    },
    draw(p) {
      tufts(p, true);
      if (t >= IMPACT) {
        const k = seg(t, IMPACT, IMPACT + 0.35);
        if (k < 1) band(p, 0, 0.5, 6 + 34 * ease.outCubic(k), FL, Math.max(1, 4 * (1 - k)), 1.1 - k, [C[3], C[4], C[5], C[6]], (a) => Math.sin(a) >= 0, k < 0.15);
        if (t < IMPACT + 0.22) sparkle(p, 0.5, -3, 10 * ease.outBack(Math.min(1, (t - IMPACT) / 0.05)) * (1 - (t - IMPACT) / 0.22), C[6], C[4], 0.7);
      }
      crust(p);
      if (t < IMPACT) {
        // the icicle: freezing down from the crust, trembling before it snaps, then falling with a streak of air behind
        const tp = -top(), jx = t > TREMBLE && t < SNAP ? (Math.floor(t * 36) % 2 ? 1 : 0) * Math.round(seg(t, TREMBLE, SNAP) * 1.4 + 0.4) : 0;
        const falling = t >= FREE, sp = falling ? GRAVITY * (t - FREE) : 0, grown = seg(t, GROW[0], GROW[1]);
        if (falling)
          for (const [dx, k] of [[-3, 0.7], [0.5, 1], [4, 0.6]]) {
            const L = Math.min(30, sp * 0.07) * k;
            if (L > 2) p.line(dx, tp - L, dx, tp + 3, (u) => (u > 0.75 ? C[6] : u > 0.4 ? C[4] : C[3]));
          }
        const gl = (t - GROW[1] - 0.04) / 0.3;
        if (grown > 0) icicle(p, C, jx + 0.5, tp, LEN, W, { grown, white: t >= IMPACT - 0.025 || (t >= SNAP && t < SNAP + 0.03), glint: gl >= 0 && gl <= 1 ? gl : -1 });
        if (snapped && t < SNAP + 0.12) p.line(-W / 2 - 1, -ROOT + 1, W / 2 + 1, -ROOT + 1, WHITE);
        if (grown > 0) p.glow(0.5, tp + LEN * 0.5 * grown, 20, C[4], 0.28 * grown);
        // the drop of meltwater swelling at the tip
        if (t > GROW[1] && t < DRIP) {
          const s = seg(t, GROW[1], DRIP);
          p.dot(0.5, -ROOT + LEN + 1, C[6], s);
          if (s > 0.6) p.px(0.5, -ROOT + LEN + 2, WHITE);
        }
      }
      flying(p, true);
      ps.draw(p, "front");
      lights.draw(p);
    },
  };

  // the crust in the air: each cell's column of rime (its thickness), far rows first; white along its crystallizing
  // front, a lit top, a deep front edge; the snapped root a jagged stub under it; it crumbles away cell by cell
  function crust(p) {
    const crumble = smooth(CRUMBLE[0], CRUMBLE[1], t);
    for (const c of CELLS) {
      const age = t - crustAt(c);
      if (age < 0 || c.gone < crumble) continue;
      const base = c.y - ROOT;
      for (let j = 0; j < c.thick; j++) p.px(c.x, base - j, age < 0.05 ? WHITE : j === c.thick - 1 ? (c.x < 0 ? WHITE : C[6]) : j === 0 ? C[3] : C[5]);
    }
    for (const st of STUBS) {
      const c = st.c, age = t - crustAt(c);
      if (age < 0.05 || c.gone < crumble) continue;
      const L = Math.min(st.L, Math.round((age - 0.05) * 60));
      for (let j = 1; j <= L; j++) p.px(c.x, c.y - ROOT + j, j === L ? WHITE : j === 1 ? C[5] : C[4]);
    }
    if (snapped && crumble < 1)
      for (let x = -W / 2 + 1; x <= W / 2 - 1; x++) {
        const L = 1 + Math.round(rand(x, 77) * 2.5);
        for (let j = 0; j < L; j++) p.px(x, -ROOT + 1 + j, j === L - 1 ? (t < SNAP + 0.15 ? WHITE : C[6]) : x < 0 ? C[5] : C[3]);
      }
    if (t > CRUST[0]) p.glow(0, -ROOT, 18, C[4], 0.3 * (1 - crumble) * smooth(CRUST[0], CRUST[1], t));
  }

  // the frost splashed over the floor where it struck: it races out to its ragged rim (white there while it runs), and
  // melts away patch by patch
  function splash(p) {
    if (t < IMPACT) return;
    const g = ease.outCubic(seg(t, IMPACT, IMPACT + 0.25)) * 1.15, gone = splashMelt();
    SSET.n = 0;
    for (let i = 0; i < SPL.x.length; i++) {
      const d = SPL.d[i];
      if (d > g || SPL.gone[i] < gone) continue;
      if (d > g - 0.12 && g < 1.15) setPx(SSET, SPL.x[i], SPL.y[i], WHITE, 0.8);
      else setPx(SSET, SPL.x[i], SPL.y[i], d < 0.4 ? C[6] : d < 0.75 ? C[5] : C[4], d < 0.4 ? 0.75 : d < 0.75 ? 0.55 : 0.35);
    }
    drawSet(p, SSET);
  }

  // rime tufts in the splash, leaning out from where it struck; they melt down with it
  function tufts(p, near) {
    if (t < IMPACT) return;
    const g = ease.outCubic(seg(t, IMPACT, IMPACT + 0.25)) * 1.15, gone = splashMelt();
    for (const k of TUFTS) {
      if (k.y >= 0 !== near || k.d > g) continue;
      const L = Math.round(k.L * (1 - clamp((gone - (k.g - 0.25)) / 0.25)));
      for (let j = 1; j <= L; j++) p.px(k.x + (j > 1 ? k.s : 0), k.y - j, j > 1 || L === 1 ? WHITE : C[5]);
    }
  }

  // what flies: the pieces (drawn as the side view draws them, placed at their 3D point), splinters (a sliver turning,
  // melting shorter where it lies), chunks (a shaded lump) and the drop; behind the strike first, in front after
  function flying(p, near) {
    const vis = panes.filter((q) => q.wz >= 0 === near);
    for (const q of vis) (q.x = q.wx), (q.y = q.wz * FL - q.wh);
    if (vis.length) {
      const all = drawer.list;
      drawer.list = vis;
      drawer.draw(p, C);
      drawer.list = all;
    }
    for (const b of shards) {
      if (b.z >= 0 !== near) continue;
      const x = b.x, y = b.z * FL - b.h, melt = Math.min(1, b.life / 0.4);
      if (b.kind === 1) {
        p.dot(x, y, b.c, 1);
        p.dot(x, y - 1, b.c, 0.5);
        continue;
      }
      if (b.kind === 2) {
        const ramp = [C[1], C[3], C[4], C[6], C[7]], ca = Math.cos(b.a), sa = Math.sin(b.a), sz = b.s * melt, r = Math.ceil(sz) + 1;
        if (sz < 0.5) continue;
        for (let py = -r; py <= r; py++)
          for (let px = -r; px <= r; px++) {
            const u = (px + 0.5) * ca + (py + 0.5) * sa, v = -(px + 0.5) * sa + (py + 0.5) * ca, d = Math.abs(u) / sz + Math.abs(v) / (sz * 0.62);
            if (d > 1.3) continue;
            p.px(Math.round(x) + px, Math.round(y) + py, d > 1 ? ramp[0] : v < 0 ? (u < 0 ? ramp[4] : ramp[3]) : u < 0 ? ramp[2] : ramp[1]);
          }
        continue;
      }
      const s = b.s * melt, ca = Math.cos(b.a), sa = Math.sin(b.a) * (b.rest ? FL : 1);
      if (s < 0.4) continue;
      for (let d = -s / 2; d <= s / 2; d += 0.5) p.px(x + ca * d, y + sa * d, d > s / 2 - 0.6 ? WHITE : b.c);
    }
  }
}
