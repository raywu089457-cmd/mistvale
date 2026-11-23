// nature/quake on the game's 2:1 camera, rebuilt as an AREA spell: the quake is centred on the caster's feet
// and works outward across the floor, not along a rift drawn across the screen.
//
// The beats, all on the floor plane:
//   - the ground rumbles first: two ragged rings tremble round the caster's feet, clods of dirt sit there and
//     dust keeps boiling off it for the whole spell, so the centre never reads as an empty ring;
//   - three jolts (0.06 s, 0.5 s, 0.92 s) each kick a shock ring that travels out over the floor to the rim
//     (REACH px) and dies there. The ring is a WALL of displaced earth standing 8-14 px high: its top edge is
//     the LIT dust (bright, ragged column by column, shimmering per frame), the face steps down through mid and
//     dark dust to a single broken contact shadow, and loose clumps of dust settle on the floor around it. It is
//     earth-coloured throughout - the only heat is the amber core at the centre - so on grass it reads as a
//     ground burst, not as a magic ring;
//   - 6 radial cracks spider out from the centre, deep-brown seams (3 px at the centre thinning to 1 px at the
//     rim) with a lit lip of pushed-up dirt, glowing amber only near the hot centre in the first half second;
//   - the slabs land, bounce once, rest and fade in place; cracks and dust fade out in place. Nothing sinks
//     through the floor: every thrown thing is 3-D (x, z, h) with screen y = z * 0.5 - h and lands on its own z.
// 1 px = 1 character sprite px (32 x 16 px tiles).
import { Particles, Lights, P, Rng, fit, clamp, smooth, ease, rand, noise, TAU, WHITE, hex, mix } from "../../core/index.js";
import { FLOOR, Fly3, floorShadow } from "../_iso.js";

const D = 3.2;
const JOLTS = [0.06, 0.5, 0.92];
const FL = FLOOR;

export const meta = {
  name: "Quake (iso)",
  desc: "A caster-centred quake on the 2:1 floor: three jolts drive walls of earth to the rim, slabs of ground are thrown up and land, six radial cracks split the dirt open and cool.",
  tags: ["nature", "earth", "quake", "ground", "area", "aoe", "shockwave", "one-shot", "iso", "top-down"],
  size: [320, 212],
  origin: [160, 124],
  duration: D,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: {
    // earth ramp, all L>=65: on green ground the dust has to be the bright thing and the dark tones can only be
    // contact shadow under a mass, never a continuous outline.
    palette: ["#5b4632", "#6b5540", "#8a7355", "#a38963", "#c2a97f", "#d8c9a6", "#ecdfc4", "#f6efdd"],
    glow: ["#7a3a10", "#b4571c", "#e8a24a", "#ffd27a", "#fff4d0"],
    reach: 145,
    seed: 12,
  },
};

// a faceted stone chip at (x, y) on the screen, s across, turned by a: lit from the upper left, a dark rim. fade
// drops pixels rather than blending, so it never leaves a translucent dark bit on the lit floor.
function chip(p, x, y, s, a, seed, S, fade = 1, cap = 6) {
  if (s < 0.9 || fade <= 0) return;
  const rr = Math.ceil(s * 1.45) + 1, ca = Math.cos(a), sa = Math.sin(a), LX = -0.6, LY = -0.8;
  const NA = 7, rad = new Array(NA), jog = new Array(NA);
  for (let i = 0; i < NA; i++) {
    const an = (i / NA) * TAU;
    rad[i] = 1 + 0.24 * noise(an * 2.2 + seed, seed * 0.7) + 0.14 * noise(an * 4.7, seed + 1);
    jog[i] = rand(i, seed + 2) - 0.5;
  }
  p.shade(x - rr, y - rr, x + rr, y + rr, (px, py, out) => {
    const dx = px + 0.5 - x, dy = py + 0.5 - y;
    const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
    const d = Math.hypot(u / 1.05, v / 0.94);
    const ang = Math.atan2(v, u), ai = ((ang + TAU * 3) % TAU) * (NA / TAU) | 0;
    const r = s * rad[ai];
    if (d > r + 1) return;
    if (fade < 1 && rand(Math.floor(px) + 31, Math.floor(py) + 17, seed + 5) > fade) return;
    if (d > r) { out.c = S[1]; out.a = 1; return; }
    const dot = (dx * LX + dy * LY) / Math.max(1, s);
    let i = dot > 0.45 ? cap : dot > 0.1 ? cap - 1 : dot > -0.3 ? 4 : 3;
    const j = jog[ai];
    i = clamp(i + (j > 0.24 ? 1 : j < -0.26 ? -1 : 0), 2, cap);
    if (d > r - 1) i = dot > 0 ? cap : 2;
    out.c = S[i];
    out.a = 1;
  });
}

// The shock ring as a WALL of displaced earth standing on the 2:1 ground. Two curtains are drawn, the far half
// (z < 0) first, then the near half, column by column: the top edge is the LIT dust and it is ragged column by
// column (2-px blocks) and shimmers per frame, so the silhouette is never a smooth ellipse and the bright line is
// on top where light lands, not a dark outline. The face steps down through mid and dark dust to a single broken
// contact shadow at the floor. Loose clumps of dust settle around the foot. Every colour is solid: no alpha.
function shockWall(p, r, th, ramp, jx, jz, seed, ph, dim) {
  if (r < 3 || th < 0.5) return;
  const [dk, lo, mid, hi, hi2] = ramp;
  const H = 6 + 18 * dim;
  const rX = Math.ceil(r + 9);
  for (let side = 0; side < 2; side++) {
    const zs = side === 0 ? -1 : 1;
    for (let x = -rX; x <= rX; x++) {
      const xx = x + jx;
      const roff = 8 * noise(xx * 0.021 + ph * 0.4, seed) + 4.5 * noise(xx * 0.11, seed + 5) + 2.2 * noise(xx * 0.37, seed + 9);
      const rO = r + roff;
      const z2 = rO * rO - xx * xx;
      if (z2 <= 0) continue;
      const z = Math.sqrt(z2);
      const yb = Math.round((zs * z - jz) * FL);
      const billow = 0.7 + 0.35 * noise(xx * 0.055 + ph, seed + 71) + 0.2 * noise(xx * 0.14 + ph * 0.7, seed + 73);
      const plume = noise(xx * 0.04 + seed * 0.37, seed + 79) > 0.66 ? 1.4 : 1;
      const hgt = Math.max(4, Math.round(H * billow * plume * (1 - 0.15 * Math.min(1, Math.abs(xx) / Math.max(1, r))) * (xx < 0 ? 1.06 : 0.94) / 2) * 2);
      if (hgt < 4) continue;
      const top = Math.round(yb - hgt);
      const g = noise(xx * 0.21 + ph * 0.9, seed + 31);
      for (let yy = top; yy <= yb; yy++) {
        const v = (yb - yy) / Math.max(1, hgt);
        const grain = noise(xx * 1.3 + yy * 0.9, seed + 57);
        let c;
        if (v > 0.88) c = g > 0.62 ? hi2 : hi;              // the lit crest: the brightest part
        else if (v > 0.55) c = grain > 0.72 ? hi : mid;       // the sunlit upper face
        else if (v > 0.22) c = grain > 0.7 ? hi : mid;       // the body of the wave
        else if (v > 0.09) c = grain > 0.62 ? mid : lo;      // the shaded lower face
        else c = grain > 0.45 ? lo : dk;                     // one broken contact row, never a line round the ring
        p.px(xx, yy, c);
      }
      // clods embedded in the crest, so the bright top is not one clean white line
      if (noise(xx * 0.07 + seed * 0.31, seed + 131) > 0.72) { p.px(xx, top, mid); p.px(xx, top + 1, lo); }
      // a few dust streamers blowing off the crest, so the silhouette is not a sawtooth fence
      if (noise(xx * 0.29 + seed * 0.5, seed + 83) > 0.55) {
        const sl = 2 + Math.round(2 * noise(xx * 0.9 + ph * 2, seed + 87));
        for (let k2 = 1; k2 <= sl; k2++) p.px(xx + (k2 & 1), top - k2, k2 > 1 ? mid : hi);
      }
    }
  }
  // loose clumps of dust settling on the floor just inside and outside the wall (never an even dotted ring)
  for (let i = 0; i < 14; i++) {
    const a = noise(i * 1.7 + seed * 0.11, seed + 99) * TAU;
    const rr = r + (i % 2 === 0 ? -1 : 1) * (4 + 7 * noise(i * 2.3 + seed, seed + 101));
    const cx = Math.round(Math.cos(a) * rr + jx), cy = Math.round((Math.sin(a) * rr - jz) * FL);
    const n = 2 + Math.round(2 * noise(i * 3.1, seed + 93));
    for (let k2 = 0; k2 < n; k2++) p.px(cx + (k2 % 2), cy + (k2 >> 1), k2 === 0 ? mid : lo);
  }
  // boiling puffs along the crest: a soft dusty top instead of a cut edge, with a shadow pixel under each
  for (let i = 0; i < 12; i++) {
    const a = noise(i * 2.1 + seed * 0.17, seed + 111) * TAU;
    const rr = r + 2 * noise(i * 1.3, seed + 113) - 1;
    const cx = Math.round(Math.cos(a) * rr + jx), cy = Math.round((Math.sin(a) * rr - jz) * FL - H * 0.74);
    const s = 2 + 2 * noise(i * 1.9, seed + 117);
    p.disc(cx, cy, s, i % 3 === 0 ? hi : mid, 1);
    p.px(cx, cy + Math.round(s), lo);
  }
}

export function create(o) {
  const S = fit(o.palette, 8), G = fit(o.glow, 5), R = new Rng(o.seed);
  const REACH = o.reach ?? 145;
  const ps = new Particles({ rng: R, ground: () => 0, sparks: [G[4], G[3], G[2], G[1]] });
  const fly = new Fly3({ rng: R, sparks: [G[4], G[3], G[2], G[1]] });
  const lights = new Lights();
  const SD = R.int(1, 999);
  const DUST = hex("#f2e8cc"), DUST2 = hex("#e2d3b0");
  // stone for the slabs and debris: darker than the dust, lit on top
  const ST = [S[1], S[1], S[2], S[2], S[3], S[3]];
  // the wall's ramp: contact shadow, shaded dust, sunlit dust, bright top, brightest top
  const WALL_HI = [S[2], S[3], S[4], S[5], S[6]];
  const WALL_MID = [S[1], S[2], S[3], S[4], S[5]];
  const WALL_LOW = [S[1], S[1], S[2], S[2], S[3]];

  // the jolts' shock rings: each one leaves at its jolt, runs out to the rim and dies there
  const rings = JOLTS.map((t0, i) => ({ t0, life: 0.62, r0: 14 + i * 4, seed: SD + i * 17 }));
  // six radial cracks: a jagged path in floor coordinates (x, z); only the first two fork
  const cracks = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + R.range(-0.24, 0.24);
    const len = REACH * R.range(0.35, 0.66);
    const pts = [];
    let r = 6, off = 0;
    while (r < len) {
      off += R.range(-4.2, 4.2);
      pts.push({ x: Math.cos(a) * r - Math.sin(a) * off, z: Math.sin(a) * r + Math.cos(a) * off });
      r += R.range(3.5, 6.5);
    }
    const branches = [];
    if (i < 2 && pts.length > 5) {
      const k0 = R.int(2, pts.length - 3), base = pts[k0], da = R.range(0.5, 0.9) * (R.chance(0.5) ? 1 : -1);
      let bx = base.x, bz = base.z, ang = Math.atan2(bz, bx) + da;
      const bp = [{ x: bx, z: bz }];
      for (let s2 = 0; s2 < R.range(8, 22); s2 += R.range(3, 6)) {
        ang += R.range(-0.3, 0.3);
        bx += Math.cos(ang) * R.range(3, 6); bz += Math.sin(ang) * R.range(3, 6);
        bp.push({ x: bx, z: bz });
      }
      branches.push(bp);
    }
    cracks.push({ pts, branches, at: 0.08 + i * 0.02, heat: R.range(0.9, 1.1) });
  }
  // small clods of dirt standing round the feet: the ground the quake is coming out of
  const clods = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + R.range(-0.4, 0.4), rad = R.range(3, 15);
    clods.push({ x: Math.cos(a) * rad, z: Math.sin(a) * rad, s: R.range(2.2, 4.6), seed: R.int(1, 999), rot: R.range(0, TAU) });
  }
  // slabs of ground kicked up by the rings: thrown up and outward, they land on their own z, bounce once, rest
  const slabs = [];
  const throwSlabs = (k, r) => {
    const n = 2 + (k === 2 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const a = R.range(0, TAU), rad = r * R.range(0.7, 1.0);
      slabs.push({
        x: Math.cos(a) * rad, z: Math.sin(a) * rad, h: 0, vx: Math.cos(a) * R.range(26, 52),
        vz: Math.sin(a) * R.range(26, 52), vh: R.range(95, 150) * (k === 2 ? 1 : 0.85),
        s: R.range(5, 8.5), rot: R.range(0, TAU), vr: R.range(-5, 5), rest: false, bounced: false,
        restAt: 0, seed: R.int(1, 999),
      });
    }
  };
  const jolt = (k) => {
    lights.add(0, 0, REACH * 0.8, G[2], 0.42, 0.32);
    lights.add(0, 0, 46, WHITE, 0.3, 0.16);
    const r = 20 + k * 34;
    throwSlabs(k, r + 22);
    for (let i = 0; i < 30; i++) {
      const a = R.range(0, TAU), rad = R.range(r * 0.55, Math.min(REACH * 0.86, r + 42));
      const sp = R.range(30, 90);
      fly.spawn(P.GRIT, Math.cos(a) * rad, Math.sin(a) * rad, R.range(0, 4),
        Math.cos(a) * sp, Math.sin(a) * sp, R.range(60, 150), R.range(0.5, 1.0),
        R.pick([S[5], S[4], S[3], S[2]]), R.chance(0.25) ? 2 : 1);
    }
    for (let i = 0; i < 9; i++) {
      const a = R.range(0, TAU), rad = R.range(r * 0.5, r + 30);
      const sp = R.range(50, 130);
      fly.spawn(P.SPARK, Math.cos(a) * rad, Math.sin(a) * rad, R.range(1, 6),
        Math.cos(a) * sp, Math.sin(a) * sp, R.range(70, 170), R.range(0.14, 0.34), 0, 1, { drag: 2.2 });
    }
    for (let i = 0; i < 4; i++) {
      const a = R.range(0, TAU), rad = R.range(10, r + 26);
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      ps.spawn(P.SMOKE, x, z * FL - R.range(0, 3), Math.cos(a) * R.range(6, 26), -R.range(3, 16), R.range(0.8, 1.5), R.chance(0.5) ? DUST : DUST2, R.range(3, 5.2));
      ps.spawn(P.DUST, x + R.range(-5, 5), z * FL + R.range(-1, 2), Math.cos(a) * R.range(14, 44), -R.range(2, 9), R.range(0.5, 1), DUST2, R.range(1.6, 3));
    }
  };

  let t = 0;
  const jolted = [false, false, false];
  const heat = () => {
    if (t < 0.02) return 0;
    const base = 1 - smooth(1.55, 2.5, t), flick = 0.82 + 0.18 * Math.sin(t * 17) * Math.sin(t * 6.3);
    return clamp(base * flick, 0, 1);
  };
  const rumble = () => {
    if (t > 1.3) return 0;
    let s = 0;
    for (const tj of JOLTS) if (t >= tj) s += Math.exp(-(t - tj) * 8) * Math.sin((t - tj) * 70);
    return s + 0.35 * Math.sin(t * 46) * (1 - smooth(0.9, 1.3, t));
  };

  return {
    update(dt) {
      t = Math.min(D, t + dt);
      const f = Math.min(1, dt * 120);
      for (let i = 0; i < JOLTS.length; i++) if (t >= JOLTS[i] && !jolted[i]) { jolted[i] = true; jolt(i); }
      // the slabs ride their kick, land on their own depth, bounce once and rest where they fall
      for (const sl of slabs) {
        if (sl.rest) continue;
        sl.h += sl.vh * dt; sl.vh -= 950 * dt;
        sl.x += sl.vx * dt; sl.z += sl.vz * dt;
        sl.vx *= 1 - 1.6 * dt; sl.vz *= 1 - 1.6 * dt;
        sl.rot += sl.vr * dt;
        if (sl.h <= 0) {
          sl.h = 0;
          if (!sl.bounced && sl.vh < -120) {
            sl.bounced = true; sl.vh *= -0.3; sl.vx *= 0.5; sl.vz *= 0.5; sl.vr *= 0.6;
            ps.spawn(P.DUST, sl.x, sl.z * FL, R.sign() * R.range(8, 26), -R.range(2, 10), R.range(0.4, 0.8), DUST2, R.range(1.6, 2.8));
          } else { sl.rest = true; sl.vh = 0; sl.vr = 0; sl.restAt = t; }
        }
      }
      // the centre never goes quiet: dust boils and grit rattles round the feet for the whole spell
      if (t < D - 1.2) {
        if (R.chance(0.5 * f)) {
          const a = R.range(0, TAU), rad = R.range(2, 13);
          ps.spawn(P.SMOKE, Math.cos(a) * rad, Math.sin(a) * rad * FL - R.range(0, 1), R.range(-5, 5), -R.range(2, 8), R.range(0.35, 0.7), R.chance(0.5) ? DUST : DUST2, R.range(2, 3.4));
        }
        if (R.chance(0.5 * f)) {
          const a = R.range(0, TAU), rad = R.range(2, 15);
          fly.spawn(P.GRIT, Math.cos(a) * rad, Math.sin(a) * rad, R.range(0, 1), R.range(-8, 8), R.range(-8, 8), R.range(18, 52), R.range(0.35, 0.7), R.pick([S[6], S[5], S[4]]), 1);
        }
      }
      // dust keeps lifting off the hot cracks while the quake is on
      const hk = heat();
      if (hk > 0.25) {
        if (R.chance(0.5 * f)) {
          const a = R.range(0, TAU), rad = R.range(8, REACH * 0.9);
          fly.spawn(P.GRIT, Math.cos(a) * rad, Math.sin(a) * rad, R.range(0, 2), R.range(-10, 10), R.range(-10, 10), R.range(14, 44), R.range(0.5, 1.0), R.pick([S[7], S[6], S[5]]), 1);
        }
        if (R.chance(0.08 * f)) {
          const a = R.range(0, TAU), rad = R.range(6, REACH * 0.85);
          ps.spawn(P.SMOKE, Math.cos(a) * rad, Math.sin(a) * rad * FL - R.range(0, 2), R.range(-8, 8), -R.range(3, 12), R.range(0.4, 0.8), DUST, R.range(1.6, 3));
        }
        if (R.chance(0.3 * f)) {
          const a = R.range(0, TAU), rad = R.range(6, REACH * 0.8);
          fly.spawn(P.SPARK, Math.cos(a) * rad, Math.sin(a) * rad, R.range(0, 3), R.range(-26, 26), R.range(-20, 20), R.range(40, 96), R.range(0.1, 0.24), 0, 1, { drag: 2 });
        }
      }
      // the crest drags dust: the travelling wall leaves a low trail of it on the floor
      for (const g of rings) {
        const k = (t - g.t0) / g.life;
        if (k < 0 || k > 0.9) continue;
        if (R.chance(0.12 * f)) {
          const a = R.range(0, TAU), r = g.r0 + (REACH - g.r0) * ease.outCubic(k);
          ps.spawn(P.DUST, Math.cos(a) * r, Math.sin(a) * r * FL - R.range(0, 2), Math.cos(a) * R.range(4, 16), -R.range(1, 6), R.range(0.3, 0.6), DUST2, R.range(1.4, 2.6));
        }
      }
      ps.update(dt);
      fly.update(dt);
      for (const q of fly.list) if (q.rest && !q.dusted) { q.dusted = true; ps.spawn(P.DUST, q.x, q.z * FL, R.sign() * R.range(4, 18), -R.range(1, 8), R.range(0.25, 0.45), DUST2, R.range(1.2, 2.2)); }
      lights.update(dt);
      const left = Math.max(0.001, D - 0.06 - t);
      fly.cap(left);
      for (const q of ps.list) if (q.life > left) q.life = left;
    },
    drawBack(p) {
      if (t >= D - 1e-6) return;
      const hk = heat(), jr = rumble(), ph = t * 3.4;
      // the floor under it all: a wide patch of churned earth that cools in place and fades at the tail
      const scarA = smooth(0.02, 0.2, t) * (1 - smooth(D - 0.55, D - 0.05, t));
      if (scarA > 0.02) {
        const rx = 19 + 9 * smooth(0.05, 0.5, t), ry = rx * FL;
        p.shade(-rx - 2, -ry - 2, rx + 2, ry + 2, (x, y, out) => {
          const d = Math.hypot(x / rx, y / ry);
          if (d > 1) return;
          const k = Math.hypot(x, y * 2) / Math.max(1, rx);
          if (scarA < 0.9 && rand(Math.floor(x) + 7, Math.floor(y) + 3, SD) > scarA) return;
          out.c = d > 0.88 ? S[2] : hk > 0.4 && k < 0.45 ? G[2] : k < 0.4 ? S[0] : S[1];
          out.a = 1;
        });
      }
      // the dirt churned up round the feet: a low 2:1 patch of broken ground that stays for the whole spell
      const footFade = 1 - smooth(D - 0.35, D - 0.02, t);
      if (footFade > 0.02) {
        const fr = 11 + 3 * smooth(0.05, 0.6, t), fr2 = fr * FL;
        p.shade(-fr - 1, -fr2 - 1, fr + 1, fr2 + 1, (x, y, out) => {
          const d = Math.hypot(x / fr, y / fr2);
          if (d > 1) return;
          if (footFade < 0.9 && rand(Math.floor(x) + 13, Math.floor(y) + 29, SD + 3) > footFade) return;
          out.c = d > 0.82 ? S[3] : d > 0.55 ? S[2] : S[1];
          out.a = 1;
        });
      }
      // the clods of dirt round the feet: the ground the quake comes out of, trembling with it
      const clodFade = 1 - smooth(D - 0.45, D - 0.05, t);
      if (clodFade > 0.02) for (const q of clods) {
        const jx = jr * 0.8 * Math.sin(q.seed), jz = jr * 0.5 * Math.cos(q.seed * 1.7);
        chip(p, q.x + jx, q.z * FL + jz, q.s, q.rot + t * 0.4, q.seed, ST, clodFade, 4);
      }
      // the cracks: deep-brown seams, 3 px at the centre thinning to 1 px at the rim, with a lit lip of pushed
      // dirt. Only the hot centre goes amber, and only in the first half second.
      for (const c of cracks) {
        const open = smooth(c.at, c.at + 0.42, t);
        if (open <= 0.02) continue;
        const n = Math.max(2, Math.floor(c.pts.length * open));
        const seam = (pts, i0, i1, thin) => {
          for (let i = i0; i < i1; i++) {
            const a = pts[i - 1], b = pts[i];
            const x0 = a.x, y0 = a.z * FL, x1 = b.x, y1 = b.z * FL;
            const rho = Math.hypot(a.x, a.z);
            const hot = clamp((1 - smooth(0.1, 0.45, t)) * (1 - rho / 42), 0, 1) * c.heat;
            const w = thin || rho > REACH * 0.5 ? 1 : rho > REACH * 0.22 ? 2 : 3;
            p.line(x0, y0 - 1, x1, y1 - 1, rho > REACH * 0.45 ? S[2] : S[3], 1);   // the lip of pushed-up dirt
            p.line(x0, y0, x1, y1, hot > 0.45 ? G[2] : S[0], 1);                    // the seam itself
            if (w > 1) p.line(x0, y0 + 1, x1, y1 + 1, hot > 0.3 ? G[1] : S[0], 1);
            if (w > 2) p.line(x0, y0 + 2, x1, y1 + 2, S[1], 1);
            if (hot > 0.55 && i % 3 === 0) p.px(Math.round(x1), Math.round(y1), G[3]);
          }
        };
        seam(c.pts, 1, n, false);
        for (const bp of c.branches) if (bp.length > 1) seam(bp, 1, Math.min(bp.length, Math.max(2, Math.floor(bp.length * open))), true);
      }
      // the rumble: two ragged rings trembling round the feet before and between the jolts
      if (jr > 0.01 && t < 1.25) {
        const jx = jr * 1.8, jz = jr * 0.9;
        shockWall(p, 17 + 2 * Math.sin(t * 9), 3.4, WALL_MID, jx, jz, SD, ph, 0.42);
        shockWall(p, 30 + 3 * Math.sin(t * 7 + 1.3), 3, WALL_MID, -jx, jz, SD + 9, ph + 1.7, 0.34);
        if (t < 0.5) p.glow(0, 0, 26, G[2], 0.1 * (1 - t / 0.5));
      }
      // the jolts' shock walls, travelling out to the rim and dying there
      for (const g of rings) {
        const k = (t - g.t0) / g.life;
        if (k < 0 || k > 1) continue;
        const r = g.r0 + (REACH - g.r0) * ease.outCubic(k);
        const th = Math.min(5 + 9 * Math.pow(1 - k, 0.6), r * 0.9);
        const dim = k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
        const ramp = dim > 0.55 ? WALL_HI : WALL_MID;
        shockWall(p, r, th, ramp, jr * 1.2, 0, SD + g.seed, ph + g.seed * 0.7, dim);
        if (k < 0.3) p.glow(0, 0, r * 0.9, G[2], 0.04 * (1 - k / 0.3));
      }
    },
    draw(p) {
      if (t >= D - 1e-6) return;
      const hk = heat();
      // slabs thrown up by the rings: drawn at their own height and depth, shadowed on the floor below
      for (const sl of slabs) {
        const y = sl.z * FL - sl.h;
        const fade = sl.rest ? 1 - smooth(sl.restAt + 0.45, sl.restAt + 1.15, t) : 1;
        if (fade <= 0.02) continue;
        if (sl.h < 44) { const k = 1 - sl.h / 44; floorShadow(p, sl.x, sl.z * FL, sl.s * 0.9 * (0.55 + 0.45 * k), k > 0.5 ? S[1] : S[2], 1); }
        chip(p, sl.x, y, sl.s, sl.rot, sl.seed, ST, fade, 3);
      }
      // grit, chips and embers, each at its own depth: behind the caster first
      fly.draw(p, (q) => q.z < 0, (fp) => {
        for (const q of fp.list) {
          const fade = Math.min(1, q.life / 0.35);
          if (fade <= 0) continue;
          if (q.size < 2.2) { p.px(Math.round(q.x), Math.round(q.y), S[q.life < 0.16 ? 5 : 4]); continue; }
          if (q.h < 30) { const k = 1 - q.h / 30; floorShadow(p, q.x, q.z * FL, q.size * 0.8 * (0.6 + 0.4 * k), k > 0.45 ? S[1] : S[2], 1); }
          chip(p, q.x, q.y, q.size * 0.7, q.seed * 6.283 + fly.t * 2.4, q.seed * 37, ST, fade, 4);
        }
      });
      ps.draw(p, "back");
      // the near half of the same debris
      fly.draw(p, (q) => q.z >= 0, (fp) => {
        for (const q of fp.list) {
          const fade = Math.min(1, q.life / 0.35);
          if (fade <= 0) continue;
          if (q.size < 2.2) { p.px(Math.round(q.x), Math.round(q.y), S[q.life < 0.16 ? 5 : 4]); continue; }
          if (q.h < 30) { const k = 1 - q.h / 30; floorShadow(p, q.x, q.z * FL, q.size * 0.8 * (0.6 + 0.4 * k), k > 0.45 ? S[1] : S[2], 1); }
          chip(p, q.x, q.y, q.size * 0.7, q.seed * 6.283 + fly.t * 2.4, q.seed * 37, ST, fade, 4);
        }
      });
      ps.draw(p, "front");
      // the hot heart of the floor while the quake is on
      if (hk > 0.1) p.glow(0, 0, 20 + 10 * hk, G[2], 0.14 * hk);
      lights.draw(p);
    },
  };
}
