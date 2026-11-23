// Frost nova for the game's 2:1 isometric camera: ice/frost-nova rewritten for the floor the game sees, not its picture
// squashed, stretched or scaled (this file used to be a projection of it). The recipe is the source's: the cold
// spirals in and gathers into a spinning snowflake at the caster's chest, it lets go, a wave blooms out over the
// floor and three rings of ice crystals punch up as it reaches them, snow drifts, frost creeps, then the ice melts
// back into the floor. What changed is the world it happens in:
//   - the wave is a 2:1 ring racing out over the floor and the crystals stand all the way round the caster, not on a
//     line beside him: each punches up when the wave reaches it, leaning out from him, the ones behind him drawn
//     behind him, the ones in front in front; the tall inner ones stand to his sides and back so he stays in view;
//   - the frost is a 2:1 patch spreading with the wave, rime standing up out of it, and it melts away patch by patch;
//   - what flies (the shards, the spray off each crystal, the drips) flies in 3D and lands at its own depth;
//   - the cold gathers from every side, the vapour slides in over the floor from every side.
// The caster is the game's own character (it stands at the origin): the effect draws no stand-in.
// 1 px = 1 character sprite px (32 x 16 px tiles).
import { Particles, Lights, P, Rng, fit, band, flare, clamp, smooth, ease, rand, noise2, TAU, WHITE, GRAVITY } from "../../core/index.js";
import { floorLight } from "../fire/_lib.js";
import { spike, SPIKE_KIND } from "./_lib.js";
import { pixelSet, setPx, drawSet, ringNoise } from "../_iso.js";

export const meta = {
  name: "Frost nova (iso)",
  desc: "ice/frost-nova on the 2:1 floor: cold gathers into a snowflake, a wave rings out over the floor and three rings of crystals punch up all round the caster, then melt away.",
  tags: ["ice", "nova", "aoe", "frost", "magic", "one-shot", "iso", "top-down"],
  size: [276, 194],
  origin: [138, 118],
  duration: 3.4,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: ["#151a3d", "#212f6b", "#2c58aa", "#3a8bd8", "#62c8f4", "#a6ecff", "#dcfbff", "#ffffff"], reach: 104, seed: 4, style: -1 },
};

const FL = 0.5;
const CHARGE = 0.42, SPREAD = 0.62, HOLD = 1.95, MELT = 0.7, CORE_H = 24;
// three rings of crystals: tall ones close round the caster (to his sides and back), smaller ones further out all
// the way round. ang: where round him they may stand (radians, 0 = his right, + toward us), or null for anywhere
const RINGS = [
  { q: [0.15, 0.25], h: [28, 36], w: [12, 15], n: 4, kids: 1, ang: [-2.5, -1.4, 0.3, 2.4] },
  { q: [0.4, 0.55], h: [16, 22], w: [9, 11], n: 6, kids: 1, ang: null },
  { q: [0.68, 0.92], h: [7, 12], w: [5, 7], n: 7, kids: 0, ang: null },
];

// the snowflake the cold gathers into: six arms with side branches, spinning, pulsing (it faces us, as in the side view)
function snowflake(p, C, x, y, L, spin, k) {
  if (L < 0.8) return;
  for (let i = 0; i < 6; i++) {
    const a = spin + (i * TAU) / 6, ca = Math.cos(a), sa = Math.sin(a);
    // solid arms: a clean 1 px line with a brighter heart, not a dotted trail
    for (let d = 0; d <= L; d += 0.5) p.px(x + ca * d, y + sa * d, d < L * 0.4 ? WHITE : C[6]);
    if (L > 3)
      for (const s of [-1, 1]) {
        const bx = x + ca * L * 0.6, by = y + sa * L * 0.6, ba = a + s * 0.9;
        for (let d = 0; d <= L * 0.35; d += 0.5) p.px(bx + Math.cos(ba) * d, by + Math.sin(ba) * d, C[5]);
      }
  }
  p.px(x, y, WHITE);
  p.glow(x, y, 10 + L * 3, C[5], 0.35 + 0.5 * k);
}

export function create(o) {
  const C = fit(o.palette, 8), REACH = o.reach, R = new Rng(o.seed), S0 = o.seed * 11;
  const ps = new Particles({ rng: R, ground: () => Infinity, sparks: [C[7], C[6], C[5], C[4]], haze: C[5] }), lights = new Lights();
  const shards = [];
  // the wave's reach over the floor, and when it reaches a distance
  const front = (t) => (t < CHARGE ? 0 : REACH * (1 - Math.pow(1 - clamp((t - CHARGE) / SPREAD), 3)));
  // the frost's visible edge: it spreads with the wave, then retreats inward as it melts (a solid front, not holes)
  const visR = (tt) => (tt < CHARGE ? 0 : REACH * (1 - Math.pow(1 - clamp((tt - CHARGE) / SPREAD), 3)) * Math.max(0, 1 - 1.02 * smooth(HOLD + 0.2, HOLD + MELT + 0.6, tt)));
  const reachedAt = (d) => CHARGE + SPREAD * (1 - Math.cbrt(1 - Math.min(1, d / REACH)));
  const sink = (tt) => smooth(HOLD, HOLD + MELT, tt);
  const melt = (tt) => smooth(HOLD + 0.2, HOLD + MELT + 0.6, tt);

  // ---- the crystals: three rings round the caster, each site a blade leaning out from him with smaller ones at its
  // foot; where it stands on the floor (x, z), how tall, and when the wave reaches it. Each site takes one of the six
  // ice silhouettes (needle, broad shard, split point, bowed fang, tiered crystal, blunt obelisk) and that shape sizes
  // it and its smaller blades, so the ring is not one repeated cone
  const styleOf = () => (o.style >= 0 ? o.style : R.int(0, SPIKE_KIND.length - 1));
  const sites = [];
  RINGS.forEach((ring) => {
    for (let i = 0; i < ring.n; i++) {
      const q = R.range(...ring.q), th = ring.ang ? ring.ang[i] + R.range(-0.2, 0.2) : ((i + R.range(0.15, 0.85)) / ring.n) * TAU, d = q * REACH;
      const kind = styleOf(), K = SPIKE_KIND[kind];
      const x = Math.cos(th) * d, z = Math.sin(th) * d, h = R.range(...ring.h) * K.h, w = R.range(...ring.w) * K.w, k = R.range(0.1, 0.28) * (K.lean ?? 1);
      const parts = [{ dx: 0, dz: 0, h, w, lx: Math.cos(th) * h * k, lz: Math.sin(th) * h * k, style: kind }];
      for (let j = 0; j < ring.kids; j++) {
        // a smaller blade at its foot, off to one side round the ring, leaning further out
        const s = j % 2 ? -1 : 1, off = R.range(0.3, 0.5) * w, ph = th + s * Math.PI / 2;
        const ks = R.chance(0.5) ? kind : styleOf(), KK = SPIKE_KIND[ks], kh = h * R.range(0.4, 0.62) * KK.h, kw = w * 0.62 * KK.w, kk = R.range(0.35, 0.6) * (KK.lean ?? 1);
        parts.unshift({ dx: Math.cos(ph) * off, dz: Math.sin(ph) * off, h: kh, w: kw, lx: (Math.cos(th) + s * 0.6 * Math.cos(ph)) * kh * kk, lz: (Math.sin(th) + s * 0.6 * Math.sin(ph)) * kh * kk, style: ks });
      }
      sites.push({ x, z, th, d, h, t0: reachedAt(d) + R.range(0, 0.03), up: false, parts, phase: R.next() });
    }
  });
  sites.sort((a, b) => a.z - b.z);   // far ones first, so nearer ones stand in front of them

  // ---- the frost on the floor: a 2:1 patch spreading with the wave, ragged at its rim, its fields worked out once;
  // gone and glints come from smooth fields (never per-pixel randomness inside the fill)
  const FR = Math.ceil(REACH * 1.12), FRY = Math.ceil(FR * FL), F = { x: [], y: [], r: [], gone: [] }, TICKS = [], GLINTS = [];
  for (let y = -FRY; y <= FRY; y++)
    for (let x = -FR; x <= FR; x++) {
      const fx = x + 0.5, fz = (y + 0.5) / FL, r = Math.hypot(fx, fz), th = Math.atan2(fz, fx);
      const v = r / (REACH * (1 + 0.07 * ringNoise(th, 2, S0) + 0.04 * ringNoise(th, 9, S0 + 1))) + 0.04 * noise2(fx * 0.08, fz * 0.08, S0 + 2);
      if (v >= 1.04) continue;
      const g = 0.9 * clamp(0.5 + 0.75 * (0.6 * noise2(fx * 0.05, fz * 0.05, S0 + 3) + 0.4 * noise2(fx * 0.13, fz * 0.13, S0 + 4))) + 0.1 * clamp(0.5 + 0.5 * noise2(fx * 0.31, fz * 0.31, S0 + 5));
      F.x.push(x); F.y.push(y); F.r.push(v * REACH); F.gone.push(g);
      // a few discrete sparkles on the crust, spread evenly over the patch but not a stipple field
      if ((((x * 67 + y * 43 + S0) & 1023) === 0)) GLINTS.push({ x, y, r: v * REACH });
      // rime: solid rimed crust plates standing out of it, grown in clumps, taller nearer the caster
      const clump = clamp(0.5 + 0.6 * noise2(fx * 0.09, fz * 0.09, S0 + 11));
      if (clump > 0.72 && ((x + y) & 1) === 0 && rand(x + 17, y + 3, S0 + 7) < 0.018) TICKS.push({ x, y, r: v * REACH, s: 3 + Math.round(rand(x, y, S0 + 8)), g });
    }
  const FSET = pixelSet(F.x.length, [-FR, -FRY, FR, FRY]);
  let fKey = "";

  let t = 0, released = false;
  const shard = (b) => shards.push({ vx: 0, vz: 0, vh: 0, a: R.range(0, TAU), va: R.range(-20, 20), s: 2, rest: false, kind: 0, drag: 0.6, bounce: 0.3, ...b });

  return {
    update(dt) {
      t += dt;
      if (t < CHARGE - 0.06) {
        // the cold gathers: streaks spiral in to the core from every side, vapour slides in over the floor
        if (R.chance(0.9)) {
          const a = R.range(0, TAU), e = R.range(-0.5, 1), c = Math.sqrt(1 - e * e), D = R.range(26, 58), T = R.range(0.2, 0.3), v = (D * 3) / (Math.exp(3 * T) - 1);
          const dx = Math.cos(a) * c, dz = Math.sin(a) * c, h = Math.max(2, CORE_H + e * D), sx = dx * D, sy = dz * D * FL - h, l = Math.hypot(sx, sy + CORE_H) || 1;
          ps.spawn(P.STREAK, sx, sy, (-sx / l) * v, ((-CORE_H - sy) / l) * v, T, R.chance(0.5) ? C[6] : C[5]);
        }
        if (R.chance(0.2)) {
          const a = R.range(0, TAU), d = R.range(28, 60), v = R.range(35, 70);
          ps.spawn(P.VAPOUR, Math.cos(a) * d, Math.sin(a) * d * FL - R.range(0, 2), -Math.cos(a) * v, -Math.sin(a) * v * FL - R.range(0, 3), R.range(0.35, 0.5), C[6], R.range(2, 3));
        }
      }
      if (t >= CHARGE && !released) {
        released = true;
        lights.add(0, -CORE_H, 84, C[4], 0.8, 0.55);
        lights.add(0, -CORE_H, 45, WHITE, 0.7, 0.12);
        // shards flung out of the core every way round and up, flakes thrown off it
        for (let i = 0; i < 22; i++) {
          const a = R.range(0, TAU), sp = R.range(110, 280), up = R.range(-0.2, 0.9);
          shard({ x: R.range(-3, 3), z: R.range(-3, 3), h: CORE_H, vx: Math.cos(a) * sp * (1 - up * 0.6), vz: Math.sin(a) * sp * (1 - up * 0.6), vh: up * sp, drag: 0.6, bounce: 0.3, life: R.range(0.9, 1.5), s: R.range(1.5, 3.5), c: R.pick([C[7], C[6], C[5]]) });
        }
        for (let i = 0; i < 14; i++) {
          const a = R.range(-Math.PI, 0), sp = R.range(40, 160);
          ps.spawn(P.FLAKE, 0, -CORE_H, Math.cos(a) * sp, Math.sin(a) * sp, R.range(1.2, 1.8), R.chance(0.6) ? WHITE : C[6], R.range(0.5, 1.6));
        }
      }
      // along the wave, all the way round: vapour thrown out over the floor and flakes lifting off it
      const fr = front(t);
      if (t > CHARGE && t < CHARGE + SPREAD)
        for (let k = 0; k < 4; k++) {
          const a = R.range(0, TAU), c = Math.cos(a), s = Math.sin(a), v = R.range(15, 75);
          ps.spawn(P.VAPOUR, c * fr, s * fr * FL - R.range(0, 5), c * v, s * v * FL - R.range(2, 15), R.range(0.6, 1), R.chance(0.7) ? C[6] : C[5], R.range(3, 5.5) * (1 - 0.4 * (fr / REACH)));
          if (R.chance(0.05)) ps.spawn(P.FLAKE, c * fr, s * fr * FL - 2, c * R.range(10, 45), s * R.range(10, 45) * FL - R.range(30, 85), R.range(1.1, 1.9), C[6], R.range(1.5, 2.6));
        }
      for (const s of sites) {
        if (!s.up && t >= s.t0) {
          s.up = true;
          // each crystal punches up with a spray of shards out of the floor round it, a puff and a glint
          for (let i = 0; i < 2 + Math.round(s.h / 8); i++) {
            const a = s.th + R.range(-1.3, 1.3), sp = R.range(30, 110) * (0.5 + s.h / 40);
            shard({ x: s.x + R.range(-3, 3), z: s.z + R.range(-3, 3), h: 1, vx: Math.cos(a) * sp * 0.6, vz: Math.sin(a) * sp * 0.6, vh: R.range(60, 200) * (0.5 + s.h / 40), drag: 0.6, bounce: 0.3, life: R.range(0.9, 1.6), s: R.range(1.5, 3), c: R.pick([C[7], C[6], C[5]]) });
          }
          ps.spawn(P.VAPOUR, s.x, s.z * FL - 1, R.range(-30, 30), R.range(-15, 15) * FL - R.range(2, 8), R.range(0.5, 0.9), C[6], R.range(2.5, 4));
          if (s.h > 10) ps.spawn(P.STAR, s.x + R.range(-3, 3), s.z * FL - R.range(4, s.h * 0.8), 0, -3, R.range(0.3, 0.6), C[6], R.range(1, 2.4));
        }
      }
      // while it holds: glints run over the crystals, snow drifts down over the frost
      if (t > CHARGE + 0.2 && t < HOLD + 0.2) {
        if (R.chance(0.5)) {
          const s = R.pick(sites);
          if (s.up) ps.spawn(P.STAR, s.x + R.range(-3, 3), s.z * FL - R.range(2, s.h * 0.9), 0, -3, R.range(0.3, 0.6), R.chance(0.6) ? C[6] : WHITE, R.range(0.6, 2.2));
        }
        if (t < HOLD - 0.3 && R.chance(0.1)) {
          const a = R.range(0, TAU), d = R.range(0, 1) * fr;
          // the drift starts at most just inside the top of the canvas: the far edge of the patch is 52 px up
          // the floor, so the old 40..90 range could put a flake above the frame
          const y = Math.max(6 - meta.origin[1], Math.sin(a) * d * FL - R.range(40, 90));
          ps.spawn(P.FLAKE, Math.cos(a) * d, y, R.range(-5, 5), R.range(3, 10), R.range(1.1, 1.5), C[6], R.range(1.4, 2.4));
        }
      }
      // melting: drips run off the crystals to the floor at their feet, vapour lifts off the frost
      if (t > HOLD && t < HOLD + MELT) {
        if (R.chance(0.5)) {
          const s = R.pick(sites);
          shard({ kind: 1, x: s.x + R.range(-3, 3), z: s.z + R.range(-1, 1), h: R.range(3, Math.max(3.5, s.h * 0.6 * (1 - sink(t)))), vh: -10, drag: 0, bounce: 0, life: 1, s: 1, c: C[5] });
        }
        if (R.chance(0.25)) {
          const a = R.range(0, TAU), d = R.range(0, 0.8) * REACH;
          ps.spawn(P.VAPOUR, Math.cos(a) * d, Math.sin(a) * d * FL - R.range(0, 3), R.range(-10, 10), -R.range(6, 16), R.range(0.6, 1), C[5], R.range(3, 5));
        }
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
        b.vx *= k; b.vz *= k; b.vh = b.vh * k - GRAVITY * (b.kind ? 0.6 : 0.7) * dt;
        b.x += b.vx * dt; b.z += b.vz * dt; b.h += b.vh * dt; b.a += b.va * dt;
        if (b.h > 0) continue;
        b.h = 0;
        if (b.kind) b.life = Math.min(b.life, 0.2);   // a drip soaks into the frost
        else if (b.bounce > 0 && -b.vh > 70) (b.vh = -b.vh * b.bounce), (b.vx *= 0.7), (b.vz *= 0.7), (b.va *= 0.6);
        else (b.rest = true), (b.vh = 0), (b.vx *= 0.6), (b.vz *= 0.6);
      }
      ps.update(dt);
      lights.update(dt);
      const left = Math.max(0.001, meta.duration - 0.05 - t);
      for (const q of ps.list) if (q.life > left) q.life = left;
      for (const b of shards) if (b.life > left) b.life = left;
    },
    drawBack(p) {
      if (t >= meta.duration - 1e-6) return;
      frost(p);
      ticks(p, false);
      ring(p, true);
      crystals(p, false);
      flying(p, false);
      ps.draw(p, "back");
    },
    draw(p) {
      if (t >= meta.duration - 1e-6) return;
      ring(p, false);
      crystals(p, true);
      ticks(p, true);
      if (t < CHARGE) {
        const k = t / CHARGE, beat = 1 + 0.25 * Math.exp(-((t - CHARGE * 0.55) ** 2) / 0.002) + 0.3 * Math.exp(-((t - CHARGE * 0.85) ** 2) / 0.002);
        snowflake(p, C, 0, -CORE_H, (2 + 5.5 * k * k) * beat, t * 4, k);
      } else if (t < CHARGE + 0.22) {
        const a = (t - CHARGE) / 0.22;
        flare(p, 0, -CORE_H, 36 * Math.pow(1 - a, 1.5), 1 - a, C);
        p.glow(0, -CORE_H, 46, WHITE, 0.6 * (1 - a));
      }
      // the frosted floor gives off a cold light while the ice stands
      if (t > CHARGE) {
        const k = (1 - smooth(HOLD, HOLD + MELT + 0.3, t)) * (0.85 + 0.15 * Math.sin(t * 2.4)), fr = Math.max(8, front(t));
        floorLight(p, 0, 0, fr, fr * FL, C[4], 0.2 * k);
      }
      flying(p, true);
      ps.draw(p, "front");
      lights.draw(p);
    },
  };

  // the frost: it spreads with the wave, a white crust at its running edge, rime inside with a glint here and there;
  // it melts away patch by patch, fraying grain by grain at the edges of each patch
  function frost(p) {
    if (t <= CHARGE) return;
    const fr = visR(t), key = String(t);
    if (key !== fKey) {
      fKey = key;
      FSET.n = 0;
      for (let i = 0; i < F.x.length; i++) {
        const r = F.r[i];
        if (r > fr * 1.04 + 1) continue;
        if (r > fr - 1) setPx(FSET, F.x[i], F.y[i], WHITE, 0.85);
        else if (r > fr - 4) setPx(FSET, F.x[i], F.y[i], C[6], 0.85);
        else {
          const q = r / REACH;
          setPx(FSET, F.x[i], F.y[i], q < 0.3 ? C[6] : q < 0.65 ? C[5] : C[4], q < 0.3 ? 0.82 : q < 0.65 ? 0.74 : 0.66);
        }
      }
    }
    drawSet(p, FSET);
    // sparkles: a handful of discrete glints on the crust, not a stipple field
    for (const q of GLINTS) if (q.r <= fr) { p.px(q.x, q.y, WHITE); p.px(q.x + 1, q.y, C[6]); }
  }

  // rimed crust plates standing up out of the frost once the wave has passed; they melt down with their patch
  function ticks(p, near) {
    if (t <= CHARGE) return;
    const fr = visR(t), gone = melt(t);
    for (const k of TICKS) {
      if (k.y >= 0 !== near || k.r > fr) continue;
      const m = clamp((gone - (k.g - 0.3)) / 0.3), s = Math.round(k.s * (1 - m));
      if (s <= 0) continue;
      // one solid plate, 3 px across: a lit crest row over a shaded foot, never a scattered stipple
      p.px(k.x - 1, k.y, C[4]); p.px(k.x, k.y, C[5]); p.px(k.x + 1, k.y, C[4]);
      if (s >= 2) { p.px(k.x - 1, k.y - 1, C[5]); p.px(k.x, k.y - 1, C[6]); p.px(k.x + 1, k.y - 1, C[5]); }
      if (s >= 3) p.px(k.x, k.y - 2, WHITE);
    }
  }

  // the wave: a 2:1 ring racing out over the floor, its far half behind, its near half in front, light at its sides
  function ring(p, back) {
    if (t < CHARGE) return;
    const u = clamp((t - CHARGE) / (SPREAD + 0.15));
    if (u >= 1) return;
    const r = front(t) + 2;
    band(p, 0, 0, r, FL, Math.max(2, 10 * Math.pow(1 - u, 0.7)), 1, C, (g) => Math.sin(g) < 0 === back, t - CHARGE < 0.1);
    if (!back) for (let i = 0; i < 6; i++) {
      const g = (i / 6) * TAU + 0.3;
      p.glow(Math.cos(g) * r, Math.sin(g) * r * FL - 2, 18, C[5], 0.4 * (1 - u));
    }
  }

  // the crystals, far to near: each punches up out of the floor as the wave reaches it (white for a moment, past its
  // height, then settling), glints sweep up them while they stand, and they melt down into the floor
  function crystals(p, near) {
    const m = sink(t);
    if (m >= 1) return;
    for (const s of sites) {
      if (!s.up || s.z >= 0 !== near) continue;
      const g = ease.outBack(clamp((t - s.t0) / 0.1), 2.6), white = t < s.t0 + 0.03, sw = (((t - s.t0) * 0.7 + s.phase * 3) % 1.6) / 0.5;
      for (const q of s.parts) {
        // its foot on the floor at its own depth; its lean out from the caster carries the tip across and (toward or
        // away from us) down or up the screen
        const bx = s.x + q.dx, by = (s.z + q.dz) * FL, hh = q.h * g * (1 - m), lean = q.lx * g * (1 - m);
        spike(p, bx, by, bx + lean, by - Math.max(0, hh - q.lz * g * (1 - m) * FL), q.w * (1 - m * 0.3), C, { style: q.style, white, glint: sw <= 1 ? sw : -1 });
      }
    }
  }

  // shards (a sliver turning, melting shorter where it lies, never fading) and drips, behind the caster or in front
  function flying(p, near) {
    for (const b of shards) {
      if (b.z >= 0 !== near) continue;
      const x = b.x, y = b.z * FL - b.h;
      if (b.kind) {
        p.px(x, y, b.c);
        p.px(x, y - 1, C[5]);
        continue;
      }
      const s = b.s * Math.min(1, b.life / 0.4), ca = Math.cos(b.a), sa = Math.sin(b.a) * (b.rest ? FL : 1);
      if (s < 0.4) continue;
      for (let d = -s / 2; d <= s / 2; d += 0.5) p.px(x + ca * d, y + sa * d, d > s / 2 - 0.6 ? WHITE : b.c);
    }
  }
}
