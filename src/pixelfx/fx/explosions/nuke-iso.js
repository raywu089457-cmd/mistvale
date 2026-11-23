// Nuke for the game's 2:1 isometric camera: explosions/nuke rewritten for the floor the game sees, not its picture
// squashed, stretched or scaled. The recipe is the source's (the white frame, the fireball on a thin stem, the wide
// rolling cap that glows from inside, the condensation veil and skirt, the dust surge, its palette and timing); what
// changed is the world it happens in:
//   - the air keeps its height: the fireball, the stem, the cap and the skirt stand up the screen as tall as in the
//     side view, because height is height in both cameras;
//   - the cap is the same vortex ring seen from above: its ring turns on the floor's 2:1 (the far side higher up the
//     screen, the near side lower) and its lobes are drawn far to near and low to high, so we look down on its top
//     and the stem goes in under it; the veil is a dome over it and the skirt a bell round the stem, both round in
//     3D, their far halves behind;
//   - the floor has depth: the ground shock and the dust surge race out as 2:1 ellipses every way round, the
//     afterwinds come in over the floor from every side and go up the stem, the stem's foot spreads round on the
//     floor, the cap's light is a pool on the floor under it;
//   - what is thrown out flies in three dimensions (x across, z into the floor, h up): sparks and grit go out every
//     way round, fall and land at their own depth;
//   - it leaves the way it would: the stem breaks up from the bottom, the cap cools, frays and thins, the surge thins
//     as it spreads, the grit settles grain by grain. Nothing fades as a picture.
// 1 px = 1 character sprite px (32 x 16 px tiles).
// The fire puffs, sparks and embers are adapted from Sprite Fusion's open-source explosion
// (https://www.spritefusion.com/pixel-art-vfx/explosion), MIT License, Copyright (c) 2026 Hugo Duprez.
import { Particles, Lights, P, Rng, fit, band, clamp, smooth, ease, lerp, noise, noise2, rand, TAU, WHITE, GRAVITY, hex, mix, scale } from "../../core/index.js";
import { fireRamp, drawPs, cull, fadeEdges, pool, glowDome, lobe, Plume } from "./_lib.js";
import { spark, flameTongue, hotFirst, LAYERS } from "../fire/_lib.js";
import { pixelSet, setPx, drawSet } from "../_iso.js";

export const meta = {
  name: "Nuke (iso)",
  desc: "explosions/nuke rewritten for the 2:1 floor: a white frame, a fireball on a thin stem into a rolling cap seen from above, a shock and dust surge racing out every way.",
  tags: ["explosion", "nuke", "mushroom", "cloud", "big", "ground", "one-shot", "iso", "top-down"],
  size: [440, 430],
  origin: [220, 306],
  duration: 9,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: ["#4a1712", "#c9281f", "#f2561d", "#ff8a2a", "#ffc23d", "#ffe26b", "#fff3a6", "#ffffff"], dust: "#8a7466", seed: 5 },
};

const FLASH = 0.05, LIFT = 0.07, SKIRT = [0.55, 1.75], FL = 0.5;   // FL: the floor's 2:1 (a point z deep sits z/2 down the screen)
// the cap's smoke: a lit crescent, two mid tones, a dark underside, the darkest hollow
const CAP = ["#a0918c", "#7c6f6e", "#5f5458", "#40373f", "#271f27"].map(hex);
const LIFTS = new Set([P.SMOKE, P.DUST, P.FIRE, P.EMBER, P.VAPOUR]);

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

/**
 * The cap: the side view's vortex ring (Plume), its ring turned onto our floor (tilt FL), its lobes drawn in the
 * order our camera sees them: far before near, and at the same depth the underside before the top.
 */
class Cap extends Plume {
  lobesAt(t) {
    const L = super.lobesAt(t), S = this.shape(t), span = S.ring + S.tube || 1;
    for (const e of L) {
      const Z = e.z * span, up = S.y + Z * this.o.tilt - e.y;   // how far the lobe sits above the ring's plane
      e.z = (Z + FL * up) / span;
    }
    return L.sort((a, b) => a.z - b.z);
  }
}

/**
 * The stem: the side view's rising column (Column), its foot spread round on the floor, not just left and right:
 * lobes boil up from a 2:1 patch, swaying, cooling from fire to smoke and dust; it breaks up from the bottom.
 */
class Stem {
  constructor(R, o = {}) {
    this.R = R;
    this.o = { w: 7, foot: 16, speed: 70, size: [5, 8], n: 18, sway: 2.5, style: 0, ...o };
    this.t = 0;
    this.lobes = [];
    this.acc = 0;
  }
  spawn(y) {
    const R = this.R, o = this.o, a = R.range(0, TAU), m = Math.sqrt(R.next());
    this.lobes.push({ y, x: Math.cos(a) * m, z: Math.sin(a) * m, s: R.range(o.size[0], o.size[1]), ph: R.range(0, TAU), a: 0, v: R.range(0.8, 1.2) });
  }
  update(dt, top, feed) {
    const o = this.o, L = Math.max(10, -top);
    this.t += dt;
    if (feed > 0) for (this.acc += dt * feed * o.n * (o.speed / L); this.acc > 1; this.acc--) this.spawn(-1);
    for (let i = this.lobes.length - 1; i >= 0; i--) {
      const b = this.lobes[i], u = clamp(-b.y / L);
      b.y -= o.speed * b.v * (0.45 + 0.55 * Math.min(1, -b.y / 24)) * dt;
      b.a = Math.min(1, b.a + dt * 4);
      if (b.y < top || (feed <= 0 && (b.a -= dt * (2 - u)) <= 0)) this.lobes.splice(i, 1);
    }
  }
  draw(p, top, FR, SM, fire, glow) {
    const o = this.o, L = Math.max(10, -top), list = [];
    for (const b of this.lobes) {
      const u = clamp(-b.y / L), foot = Math.pow(1 - u, 4), w = o.w + o.foot * foot;
      const x = b.x * w * 0.45 + Math.sin(this.t * 1.7 + b.ph + u * 3) * o.sway * u, z = b.z * w * 0.45;
      const r = b.s * (0.75 + 0.5 * foot + 0.35 * u) * Math.min(1, b.a * 1.5);
      list.push({ b, u, foot, x, y: b.y - r * 0.3 * foot + z * FL, r });
    }
    // top first, the near side of the foot last
    list.sort((a, b) => a.y - b.y);
    for (const e of list) {
      const end = 1 - smooth(0.85, 1, e.u);
      lobe(p, e.x, e.y, e.r, FR, SM, clamp(fire * (1.1 - e.u * 0.9)), glow * smooth(0.55, 1, e.u), Math.min(1, e.b.a) * end * 0.9, e.b.z * e.foot, e.u > 0.5 ? 0 : 1, o.style);
    }
  }
}

export function create(o) {
  const F = fit(o.palette, 8), FR = fireRamp(F), R = new Rng(o.seed), dust = hex(o.dust);
  const DUST = [mix(dust, WHITE, 0.22), dust, mix(dust, hex("#3a3040"), 0.35), mix(dust, hex("#2a2330"), 0.6), mix(dust, hex("#1c1720"), 0.8)];
  const [W, H] = meta.size, [OX, OY] = meta.origin, X0 = -OX + 3, X1 = W - OX - 3, Y0 = -OY + 3, Y1 = H - OY - 3;
  const RMAX = OX - 22;                    // how far over the floor the surge reaches before it has thinned away
  const ps = new Particles({ rng: R, ground: () => 0, sparks: [F[6], F[5], F[3], F[2]] }), lights = new Lights();
  const SPK = [F[6], F[5], F[3], F[2]];
  const plume = new Cap(R, {
    x: 0, y: -26, rise: 152, tau: 1.7, drift: 3, tube: [14, 26], ring: [4, 46], grow: 1.6, n: 50, size: [9.5, 14.5], swell: 0.45,
    spin: 2.4, spinTau: 2.4, heat: 1.25, cool: 0.42, under: 0.6, tilt: FL, squash: 0.48, fade: [6.0, 8.3], spread: 26,
    style: 1, inner: true, hollow: true, fray: [4, 1.6, 6.4],
  });
  plume.onFray = (x, y, r, ux, uy) => ps.spawn(P.SMOKE, x, y, ux * R.range(10, 26), uy * R.range(4, 12) - R.range(2, 8), R.range(1, 1.7), CAP[R.int(0, 1)], r * R.range(0.3, 0.45));
  const column = new Stem(R, { w: 3.5, foot: 22, speed: 125, size: [5.5, 7], n: 84, sway: 1.4, style: 1 });
  const top = () => { const S = plume.shape(); return S.y + S.tube * 0.3; };
  // the condensation: a veil, a thin dome over the cap (points over its surface), and a bell flaring round the stem
  const veil = Array.from({ length: 130 }, () => ({ th: R.range(0, TAU), sh: R.range(0.03, 1), s: R.range(6, 10), w: R.range(0.97, 1.06), e: R.range(0.6, 1.3), dx: R.range(-1, 1), dy: R.range(-1, 0.2) }));
  const skirt = Array.from({ length: 110 }, () => ({ ph: R.range(0, TAU), v: R.range(0, 1), s: R.range(5, 9), w: R.range(0.9, 1.06), e: R.range(0.6, 1.3), dx: R.range(-1, 1), dy: R.range(-1, 0.4) }));
  const thrown = [];   // sparks and grit, flying in 3D
  let t = 0, boomed = false;

  // ---- the floor under the blast: what the flash burns, the fireball melts, the shock sweeps and the fires do ----
  const D = meta.duration, S0 = o.seed * 13, HF = hotFirst(F);   // HF: the palette white-hot first
  const SR = 150, CR = 30;   // how far over the floor the flash scorches it; the bowl the fireball melts into it
  const SOOT = hex("#0d0a12"), SOOT2 = hex("#17121d"), OUTLINE = hex("#1a1422");
  const ASH = mix(DUST[0], hex("#9c9696"), 0.5), GLASS = mix(SOOT, dust, 0.24), GLASS2 = mix(SOOT, dust, 0.1), GLINT = mix(dust, WHITE, 0.5);
  const SMOKE = mix(SOOT2, dust, 0.4);
  // the burn in bands, darkest in: [colour, alpha], blended over the floor so its own texture still shows through
  // (charred black, burnt black-brown, scorched brown, singed straw at the edge), so grass and stone read as burnt
  const BURN = [[SOOT, 0.86], [mix(SOOT2, hex("#3a2418"), 0.5), 0.78], [hex("#3b2a1f"), 0.64], [hex("#74552f"), 0.46]];
  const CUT = [0.42, 0.6, 0.8];
  const shockR = () => (t < LIFT ? 0 : 196 * ease.outCubic(clamp((t - LIFT) / 0.8)));
  const hitAt = (r) => LIFT + 0.8 * (1 - Math.cbrt(1 - Math.min(0.999, r / 196)));   // when the ground shock reaches r
  const ring = (th, k, seed) => noise2(Math.cos(th) * k, Math.sin(th) * k, seed);   // noise round a circle: no seam
  // the scorch, pixel by pixel, its fixed fields worked out once: v how far out in the burn (0 middle .. 1 edge,
  // ragged by blotches), st the rays the blast streaks into it, ash where ash settles, gone when it blows away
  const G = { x: [], y: [], r: [], v: [], st: [], ash: [], gone: [] };
  for (let y = -Math.ceil(SR * 1.2 * FL); y <= Math.ceil(SR * 1.2 * FL); y++)
    for (let x = -Math.ceil(SR * 1.2); x <= Math.ceil(SR * 1.2); x++) {
      const fx = x + 0.5, fz = (y + 0.5) / FL, r = Math.hypot(fx, fz);
      if (r < CR) continue;   // the bowl draws itself
      const th = Math.atan2(fz, fx), edge = SR * (1 + 0.16 * ring(th, 1.6, S0) + 0.08 * ring(th, 5, S0 + 1));
      const blot = 0.6 * noise2(fx * 0.045, fz * 0.045, S0 + 2) + 0.4 * noise2(fx * 0.12, fz * 0.12, S0 + 3);
      const v = r / edge + 0.12 * blot + 0.03 * (rand(x + 900, y + 900, S0 + 4) - 0.5);
      if (v >= 1) continue;
      G.x.push(x); G.y.push(y); G.r.push(r); G.v.push(v);
      // the rays come and go along their length: the blast scours unevenly
      G.st.push((0.75 * ring(th + 0.05 * noise(r * 0.04, S0 + 6), 14, S0 + 5) + 0.25 * ring(th, 30, S0 + 7)) * (0.7 + 0.6 * noise2(fx * 0.03, fz * 0.03, S0 + 20)));
      // how thick the ash lies: three steps, so the patches have soft edges rather than hard blots
      const ash = 0.65 * noise2(fx * 0.06, fz * 0.06, S0 + 8) + 0.35 * noise2(fx * 0.16, fz * 0.16, S0 + 17);
      G.ash.push(ash > 0.18 ? 2 : ash > 0.02 ? 1 : 0);
      // it blows away in patches, only their edges fraying grain by grain
      const gn = 0.6 * noise2(fx * 0.035, fz * 0.035, S0 + 18) + 0.4 * noise2(fx * 0.1, fz * 0.1, S0 + 19);
      G.gone.push(0.9 * clamp(0.5 + 0.75 * gn) + 0.1 * rand(x + 300, y + 700, S0 + 9));
    }
  const GN = G.x.length, GX = Int16Array.from(G.x), GY = Int16Array.from(G.y), GR = Float32Array.from(G.r), GV = Float32Array.from(G.v);
  const GST = Float32Array.from(G.st), GASH = Uint8Array.from(G.ash), GGONE = Float32Array.from(G.gone);
  let x0 = 0, x1 = 0, y0 = 0, y1 = 0, gKey = "";   // the scorch's box, local px
  for (let i = 0; i < GN; i++) (x0 = Math.min(x0, GX[i])), (x1 = Math.max(x1, GX[i])), (y0 = Math.min(y0, GY[i])), (y1 = Math.max(y1, GY[i]));
  const GSET = pixelSet(GN, [x0, y0, x1, y1]);
  // the bowl's pixels: how far out (d), how the melt cools in patches (k), the glass it cools to, when it blows away
  const BOWL = [];
  for (let y = -Math.ceil(CR * FL); y <= Math.ceil(CR * FL); y++)
    for (let x = -CR; x <= CR; x++) {
      const dx = (x + 0.5) / CR, dy = (y + 0.5) / (CR * FL), d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1) continue;
      const blot = noise2(x * 0.18, y * 0.36, S0 + 10);
      BOWL.push({ x, y, d, k: 0.5 + 0.4 * blot + 0.1 * (rand(x * 31 + y, S0 + 12) - 0.5), gone: 0.9 * clamp(0.5 + 0.75 * blot) + 0.1 * rand(x + 50, y + 50, S0 + 11),
        // cooled to glass: dark, its far wall a step lighter where it faces us and its rim too, a few glints
        glass: rand(x + 7, y + 3, S0 + 13) < 0.03 ? GLINT : (dy < -0.45 && d > 0.55) || d > 0.85 ? GLASS : GLASS2 });
    }
  // the bowl drawn as the scorch is (opaque: alpha 1), its colours worked out again only while they change
  const BN = BOWL.length, BX = Int16Array.from(BOWL, (q) => q.x), BY = Int16Array.from(BOWL, (q) => q.y);
  const BSET = pixelSet(BN, [-CR, -Math.ceil(CR * FL), CR, Math.ceil(CR * FL)]);
  // the floor's light, a 2:1 pool 140 px out: each pixel's distance out (0 middle .. 1 rim), worked out once
  const LR = 140, LX = [], LY = [], LD = [];
  for (let y = -LR * FL; y <= LR * FL; y++)
    for (let x = -LR; x <= LR; x++) {
      const d = Math.hypot((x + 0.5) / LR, (y + 0.5) / (LR * FL));
      if (d < 1) LX.push(x), LY.push(y), LD.push(d);
    }
  const LSET = { X: Int16Array.from(LX), Y: Int16Array.from(LY), D: Float32Array.from(LD), n: LX.length };
  let bKey = "";
  // fires the flash lights in the scorched ground; the shock blows some out (more near the middle), and of those
  // some catch again from their embers while the afterwinds feed them
  const fires = Array.from({ length: 44 }, (_, i) => {
    const a = R.range(0, TAU), r = SR * 0.95 * Math.sqrt(R.range(0.09, 1)), hit = hitAt(r), blown = R.chance(r < 90 ? 0.65 : 0.35);
    const re = blown && R.chance(0.6) ? hit + R.range(0.7, 2.0) : -1, fuel = R.range(2.2, 5.2), ign = FLASH + R.range(0.02, 0.22) * (0.4 + r / SR);
    return { x: Math.cos(a) * r, z: Math.sin(a) * r, r, ign, hit, blown, re, size: R.range(0.5, 1.2), n: i * 41 + 7, puffed: false,
      end: blown ? (re > 0 ? re + fuel : hit + R.range(1.2, 2.6)) : ign + fuel };
  });
  // how much flame a fire has now, and how much it smoulders
  const flameAt = (f) => {
    if (t < f.ign || t > f.end) return [0, 0];
    if (!f.blown) return [smooth(0, 0.35, t - f.ign) * clamp((f.end - t) / 1.4), 0];
    if (t < f.hit) return [smooth(0, 0.35, t - f.ign), 0];
    if (f.re > 0 && t >= f.re) return [smooth(0, 0.6, t - f.re) * clamp((f.end - t) / 1.4), 0];
    return [0, f.re > 0 ? 1 : clamp((f.end - t) / 1.0)];
  };

  // a puff on the floor: its depth rides in q.fz (screen px) and slows with the same drag as its x, so the surge
  // spreads as a true 2:1 ellipse while its y keeps only its height (buoyancy lifts it as in the side view).
  // kick: the blast wind sweeps it outward when the ground shock passes it
  const floorPuff = (k, x, z, h, vx, vz, vh, life, col, size, delay = 0, kick = false) => {
    ps.spawn(k, x, z * FL - h, vx, -vh, life, col, size, delay);
    const q = ps.list[ps.list.length - 1];
    q.fz = z * FL;
    q.vfz = vz * FL;
    if (kick) q.kick = 0;
  };
  // a direction every way round, from `lo` (sine of the elevation) up to straight up
  const dir3 = (lo) => {
    const th = R.range(0, TAU), s = R.range(lo, 1), c = Math.sqrt(1 - s * s);
    return [Math.cos(th) * c, Math.sin(th) * c, s];
  };

  const boom = () => {
    lights.add(0, -60, 150, F[4], 0.7, 1.6);
    // the fireball's first fire, embers and sparks, out of a sphere 26 px up, every way round
    for (let i = 0; i < 26; i++) {
      const [dx, dz, dh] = dir3(0), d = R.range(4, 22), sp = R.range(40, 160);
      // FIRE slows faster across than up (drag 5 against 3.2): its depth speed is scaled to land where it would
      ps.spawn(P.FIRE, dx * d, dz * d * FL - 26 - dh * d, dx * sp, dz * sp * FL * 0.64 - dh * sp * 0.7 - 30, R.range(0.6, 1.1), 0, R.range(7, 12), 0, R.chance(0.5) ? 3 : 0);
    }
    for (let i = 0; i < 50; i++) {
      const [dx, dz, dh] = dir3(0), sp = R.range(30, 140);
      ps.spawn(P.EMBER, dx * 20, dz * 20 * FL - 26 - dh * 20, dx * sp, dz * sp * FL - dh * sp - 60, R.range(1.6, 3.4), F[3]);
    }
    for (let i = 0; i < 90; i++) {
      const [dx, dz, dh] = dir3(-0.3), sp = R.range(200, 420);
      thrown.push({ kind: "spark", x: dx * 18, z: dz * 18, h: 26 + dh * 18, vx: dx * sp, vz: dz * sp, vh: dh * sp + 60, g: GRAVITY * 0.45, drag: 2.2, bounce: 0.45, life: R.range(0.3, 0.8) });
    }
    // the base surge: dust thrown out over the floor every way round, racing out; a slower ring behind. Round on the
    // floor it runs round a whole ring, not along a line, so it takes more dust to be as thick as the side view's
    for (let i = 0; i < 240; i++) {
      const slow = i >= 184, a = R.range(0, TAU), c = Math.cos(a), s = Math.sin(a), sp = slow ? R.range(110, 200) : R.range(240, 440);
      floorPuff(P.SMOKE, c * 14, s * 14, R.range(1, 3), c * sp, s * sp, R.range(0, slow ? 6 : 3), R.range(1.8, 3), dust, slow ? R.range(9, 13) : R.range(6.5, 11), R.range(0.05, 0.2));
    }
    // the floor smokes where the flash scorched it; the blast sweeps that smoke outward as it passes
    for (let i = 0; i < 46; i++) {
      const a = R.range(0, TAU), r = SR * Math.sqrt(R.range(0.06, 0.6));
      floorPuff(P.SMOKE, Math.cos(a) * r, Math.sin(a) * r, 1, 0, 0, R.range(6, 16), R.range(1.4, 2.4), SMOKE, R.range(4, 7), R.range(0.02, 0.25), true);
    }
    // grit flung up out of the floor, mostly high, a little outward every way round
    for (let i = 0; i < 40; i++) {
      const u = R.range(-1, 1), lean = 0.7 * Math.abs(u), sp = R.range(150, 380) * (1 - 0.4 * Math.abs(u)), a = R.range(0, TAU), m = 12 * Math.sqrt(R.next());
      thrown.push({
        kind: "grit", x: Math.cos(a) * m, z: Math.sin(a) * m, h: 1, vx: Math.cos(a) * Math.sin(lean) * sp, vz: Math.sin(a) * Math.sin(lean) * sp, vh: Math.cos(lean) * sp,
        g: GRAVITY, drag: 0.8, bounce: 0.25, c: R.pick(DUST.slice(0, 3)), s: R.chance(0.4) ? 2 : 1, stay: R.range(0.6, 2.4), onLand: (b) => (b.gone = t + b.stay),
      });
    }
  };

  // the air shock's foot: where its shell stands on the floor, a thin bright 2:1 ring (its far half seen through the
  // shell, fainter), kept inside the canvas
  const shockFoot = (p, rho, u, near) => {
    const n = Math.ceil(rho * TAU * 1.2), th = Math.max(1, 2.5 * (1 - u)), k = (1.1 - u) * (near ? 1 : 0.45);
    if (k < 0.14) return;   // fainter than this it would only dither into loose specks: the shell has passed
    for (let i = 0; i < n; i++) {
      const g = (i / n) * TAU, s = Math.sin(g);
      if (s >= 0 !== near) continue;
      for (let o = 0; o < th; o += 0.5) {
        const x = Math.cos(g) * (rho - o), y = s * (rho - o) * FL;
        if (Math.abs(x) > OX - 3 || y > H - OY - 3) continue;
        p.dot(x, y, o < 0.6 && u < 0.3 ? WHITE : F[6], k * (1 - o / (th + 0.5)));
      }
    }
  };

  // the updraft: up the stem, squeezed to its axis; near the floor the afterwinds pull in from every side
  const draft = (dt, { top, w, up, squeeze = 4, pull, low, reach, k }) => {
    if (k <= 0) return;
    for (const q of ps.list) {
      if (q.delay > 0 || !LIFTS.has(q.k) || q.y < top) continue;
      const z = (q.fz ?? 0) / FL, r = Math.hypot(q.x, z), u = r / w;
      if (u < 1) {
        const f = (1 - u * u) * k;
        q.vy -= up * f * dt;
        q.vx -= q.x * squeeze * f * dt;
        if (q.fz !== undefined) q.vfz -= q.fz * squeeze * f * dt;
      }
      if (pull && q.y > -low && r > w * 0.4 && r < reach) {
        const g = (pull * k * (1 - r / reach) * dt) / r;
        q.vx -= q.x * g;
        if (q.fz !== undefined) q.vfz -= z * g * FL;
      }
    }
  };

  return {
    update(dt) {
      t += dt;
      if (!boomed && t >= LIFT) (boomed = true), boom();
      if (t >= LIFT) plume.update(dt);
      const S = plume.shape(), hot = plume.hot();
      column.update(dt, top(), t > 0.35 && t < 4.9 ? 1 : 0);
      // afterwinds: dust drawn in over the floor from every side, toward the stem, a wisp at a time: a few puffs
      // strung out along the wind, the head thickest, so it reads as dust streaming in rather than loose bubbles
      if (t > 0.9 && t < 4.6 && R.chance(9 * dt)) {
        const a = R.range(0, TAU), d = R.range(50, 160), sp = R.range(20, 45), c = Math.cos(a), s = Math.sin(a), h = R.range(2, 6);
        for (let j = 0; j < 3; j++) {
          const dd = d + j * R.range(5, 8), side = R.range(-2, 2);
          floorPuff(P.VAPOUR, c * dd - s * side, s * dd + c * side, h + R.range(-1, 1), -c * sp, -s * sp, R.range(0, 4), R.range(1.2, 1.8) * (1 - j * 0.15), DUST[1], R.range(4, 6.5) * (1 - j * 0.2), j * 0.04);
        }
      }
      // embers shed off the cap's rim, all the way round it
      if (t > 0.3 && t < 3.4 && R.chance(14 * hot * dt)) {
        const a = R.range(0, TAU), rr = S.ring + S.tube, v = R.range(30, 80);
        ps.spawn(P.EMBER, S.x + Math.cos(a) * rr, S.y + Math.sin(a) * rr * FL, Math.cos(a) * v, Math.sin(a) * v * FL - R.range(10, 50), R.range(1.4, 2.6), F[3]);
      }
      // the fires: smoke off them while they burn or smoulder; the shock tears the flame off the ones it blows out
      for (const f of fires) {
        if (t < f.ign || t > f.end) continue;
        const [fl, sm] = flameAt(f);
        if (f.blown && !f.puffed && t >= f.hit) {
          f.puffed = true;
          const ux = f.x / f.r, uz = f.z / f.r;
          for (let j = 0; j < 3; j++) floorPuff(P.SMOKE, f.x, f.z, R.range(2, 6), ux * R.range(60, 140), uz * R.range(60, 140), R.range(4, 14), R.range(0.6, 1.1), SMOKE, R.range(2.5, 4));
          for (let j = 0; j < 3; j++) ps.spawn(P.EMBER, f.x, f.z * FL - 3, ux * R.range(60, 130), uz * R.range(60, 130) * FL - R.range(10, 40), R.range(0.4, 0.9), F[4]);
        }
        if ((fl > 0.35 && R.chance(0.8 * fl * dt)) || (sm > 0.3 && R.chance(0.4 * sm * dt)))
          floorPuff(P.SMOKE, f.x + R.range(-1, 1), f.z, 3 + (3 + 8 * f.size) * fl, 0, 0, R.range(10, 22), R.range(1.1, 1.8), SMOKE, R.range(2, 3.5));
      }
      const sr = shockR();
      for (const q of ps.list) if (q.fz !== undefined) q.y -= q.fz;
      draft(dt, { top: S.y + S.tube * 0.3, w: 9, up: 160, pull: 120, low: 14, reach: 170, k: 1 - smooth(4.4, 5.4, t) });
      ps.update(dt);
      for (let i = ps.list.length - 1; i >= 0; i--) {
        const q = ps.list[i];
        if (q.fz === undefined) continue;
        if (q.delay <= 0) {
          // the blast wind behind the ground shock sweeps smoke lying on the floor outward as it passes
          if (q.kick === 0) {
            const z = q.fz / FL, r = Math.hypot(q.x, z) || 1;
            if (r < sr) {
              const K = R.range(90, 160) * (1 - r / 240);
              q.vx += (q.x / r) * K;
              q.vfz += (z / r) * K * FL;
              q.kick = 1;
            }
          }
          q.vfz -= q.vfz * (q.k === P.SMOKE ? 1.6 : 4) * dt;
          q.fz += q.vfz * dt;
        }
        q.y += q.fz;
        // the surge thins as it spreads over the floor, gone before it reaches the edge of the blast's reach
        const e = (RMAX - Math.hypot(q.x, q.fz / FL) - q.size * 1.65) / 40;
        if (e <= 0) ps.list.splice(i, 1);
        else if (e < 1) q.life = Math.min(q.life, q.max * 0.42 * e);
      }
      cull(ps, X0, Y0, X1, Y1);
      fadeEdges(ps, X0, X1, 34, Y1);
      for (const b of thrown) step3(b, dt);
      lights.update(dt);
    },
    drawBack(p) {
      if (t < FLASH) return;
      const S = plume.shape(), E = plume.ember();
      scorch(p);
      bowl(p);
      drawFires(p, false);
      // the ground shock: a 2:1 ring racing out over the floor ahead of the dust (far half)
      const k = (t - LIFT) / 0.8;
      if (k > 0 && k < 1) band(p, 0, 0.5, 196 * ease.outCubic(k), FL, Math.max(1, 5 * (1 - k)), 1.15 - k, [DUST[2], DUST[0], F[5], F[7]], (g) => Math.sin(g) < 0);
      const u = (t - FLASH) / 0.7;
      if (u < 1) { const r = 30 + 250 * ease.outCubic(u); shockFoot(p, Math.sqrt(r * r - 26 * 26), u, false); }
      drawThrown(p, false);
      soft(p, false);
      skirtDraw(p, t, S, skirt, true);
      veilDraw(p, t, S, veil, true);
      // the stem goes in under the cap: drawn between the cap's far lobes and its near ones
      const mid = () => {
        column.draw(p, top(), FR, DUST, clamp(1 - t / 1.8), E * 0.8);
        skirtDraw(p, t, S, skirt, false);
      };
      if (plume.t >= plume.o.fade[1] + 0.5) mid();
      else plume.draw(p, FR, CAP, { mid });
      veilDraw(p, t, S, veil, false);
      // the light on the floor: the cap's from high above, the melt's round the bowl, the flash's on the burn
      floorLights(p);
    },
    draw(p) {
      // the blinding frame: a white-hot core in a wash of white light that fades out before the canvas edges
      if (t < FLASH) {
        wash(p, OX, OY, W, H, 0, -40, WHITE, 1.6);
        return p.circle(0, -40, 64, WHITE);
      }
      const k = (t - LIFT) / 0.8;
      if (k > 0 && k < 1) band(p, 0, 0.5, 196 * ease.outCubic(k), FL, Math.max(1, 5 * (1 - k)), 1.15 - k, [DUST[2], DUST[0], F[5], F[7]], (g) => Math.sin(g) >= 0);
      // out of the white: a crisp white-hot sphere, cooling into the fireball
      const f = (t - FLASH) / 0.13;
      if (f < 1) {
        const r = 22 + 8 * f;
        p.circle(0, -26, r + 1.5, F[2]);
        p.circle(0, -26, r, f < 0.5 ? F[6] : F[5]);
        p.circle(0, -26, r * 0.62, f < 0.5 ? WHITE : F[6]);
      }
      drawFires(p, true);
      soft(p, true);
      drawThrown(p, true);
      drawPs(p, ps, "front", FR);
      // the shock in the air: a thin bright shell racing out from the fireball, cut off by the floor and the canvas;
      // where it stands on the floor it draws its foot, a 2:1 ring, so the dome sits on the floor it races over
      const u = (t - FLASH) / 0.7;
      if (u < 1) {
        const r = 30 + 250 * ease.outCubic(u), cy = -26;
        const out = (a) => cy + Math.sin(a) * r > 0 || Math.abs(Math.cos(a) * r) > OX - 3 || cy + Math.sin(a) * r < 3 - OY;
        p.ring(0, cy, r, Math.max(1, 2.5 * (1 - u)), u < 0.3 ? WHITE : F[6], (v, a) => (out(a) ? 0 : 1.1 - u));
        glowDome(p, 0, cy, r, 7, F[5], 0.3 * (1 - u), [3 - OX, 3 - OY, W - OX - 4, 0]);
        shockFoot(p, Math.sqrt(r * r - cy * cy), u, true);
      }
      // the light of it: everything washed white, falling away fast, then the fireball's own warm light
      const w = Math.exp(-(t - FLASH) / 0.13);
      if (w > 0.02) wash(p, OX, OY, W, H, 0, -40, WHITE, 0.9 * w);
      lights.draw(p);
    },
  };

  // the scorch: the flash burns the floor from the middle out in the first half second (the nearer, the sooner it
  // chars), red-hot where it burns hardest while the pulse lasts; the shock streaks it with rays as it sweeps over;
  // ash and dust settle on it in patches; at the end it blows away patch by patch
  function scorch(p) {
    const a = t - FLASH;
    if (a <= 0) return;
    const pulse = clamp(1 - a / 1.1), ash = smooth(2.5, 6.5, t) * 0.5, gone = smooth(D - 1.5, D - 0.2, t);
    // every pixel's colour only changes while the burn spreads, the shock sweeps and the pulse glows (the first
    // second), then as the ash thickens and as it blows away: work it out again only then
    const key = a < 1.2 ? String(t) : `${Math.round(ash * 24)}/${gone}`;
    if (key !== gKey) {
      gKey = key;
      const reach = 0.25 + 0.75 * ease.outCubic(Math.min(1, a / 0.55)), sr = shockR();
      const tones = BURN.map(([c, k]) => [[c, mix(c, ASH, ash * 0.5), mix(c, ASH, ash)], k]);
      GSET.n = 0;
      for (let i = 0; i < GN; i++) {
        if (GGONE[i] < gone) continue;
        let v = GV[i] / reach;
        const swept = GR[i] < sr;
        if (swept) v += GST[i] * 0.09;
        if (v >= 1) continue;
        if (pulse > 0 && v < 0.62) {
          const T = pulse * (1 - v / 0.62) * 1.4;
          if (T > 0.2) { setPx(GSET, GX[i], GY[i], FR[T > 1 ? 2 : T > 0.75 ? 3 : T > 0.5 ? 4 : T > 0.32 ? 5 : 6], 0.9); continue; }
        }
        let j = v < CUT[0] ? 0 : v < CUT[1] ? 1 : v < CUT[2] ? 2 : 3;
        // swept by the blast: streaked in rays out from the middle, the burn a step darker along some, the ground
        // scoured a step lighter along others
        if (swept) j = GST[i] > 0.3 && j > 0 ? j - 1 : GST[i] < -0.32 && j < 3 ? j + 1 : j;
        const [c, k] = tones[j];
        setPx(GSET, GX[i], GY[i], c[GASH[i]], k);
      }
    }
    drawSet(p, GSET);
  }

  // three pools of light on the floor round ground zero, in one pass: the cap's (wide and soft, from high above,
  // while it still burns), the flash's on the burn (while the pulse lasts) and the melt's round the bowl (while it
  // is hot). Each falls off as (1 - d / reach)^2, as pool() does; once all three are out it costs nothing
  function floorLights(p) {
    const a = t - FLASH, kc = 0.3 * plume.hot(), kp = a > 0 ? 0.55 * clamp(1 - a / 1.1) : 0;
    const kb = a > 0 ? 0.6 * Math.pow(clamp(1 - a / 3.4), 1.3) : 0, rp = (SR * 0.75) / LR, rb = (CR * 1.9) / LR;
    if (kc <= 0.004 && kp <= 0.004 && kb <= 0.02) return;
    const c = F[3], cr = c & 255, cg = (c >>> 8) & 255, cb = (c >>> 16) & 255, k0 = p.fade * p.lightK;
    const { X, Y, D, n } = LSET, rot = p.sn !== 0 || p.cs !== 1;
    const L = p.L, w = p.w, h = p.h, fx = p.fx, bx = Math.floor(p.tx + 0.5) - p.ox, by = Math.floor(p.ty + 0.5) - p.oy;
    for (let i = 0; i < n; i++) {
      const d = D[i];
      let k = kc * (1 - d) * (1 - d);
      if (d < rp) k += kp * (1 - d / rp) * (1 - d / rp);
      if (d < rb && kb > 0.02) k += kb * (1 - d / rb) * (1 - d / rb);
      if (rot) { p.light(X[i], Y[i], c, k); continue; }
      k *= k0;
      if (k <= 0.004) continue;
      const x = fx > 0 ? bx + X[i] : bx - 1 - X[i], y = by + Y[i];
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const j = y * w + x, e = L[j];
      const r = Math.min(255, (e & 255) + cr * k) | 0, g = Math.min(255, ((e >>> 8) & 255) + cg * k) | 0, b = Math.min(255, ((e >>> 16) & 255) + cb * k) | 0;
      L[j] = (255 << 24) | (b << 16) | (g << 8) | r;
    }
  }

  // the bowl the fireball melts into the floor: white-hot, cooling in patches to dark glass with a few glints, its
  // far wall facing us a step lighter, the earth it pushed out heaped low round its rim; it blows away with the scorch
  function bowl(p) {
    const a = t - FLASH;
    if (a <= 0) return;
    const rx = CR, ry = rx * FL, gone = smooth(D - 1.5, D - 0.2, t), cool = Math.pow(clamp(1 - a / 3.4), 1.3);
    const key = cool > 0 ? String(t) : `g${gone}`;
    if (key !== bKey) {
      bKey = key;
      BSET.n = 0;
      for (let i = 0; i < BN; i++) {
        const q = BOWL[i];
        if (q.gone < gone) continue;
        const T = cool * (1.3 - q.d) - q.k * 0.35;
        setPx(BSET, BX[i], BY[i], T > 0.06 ? HF[Math.min(7, Math.floor((1 - Math.min(1, T)) * 7))] : q.glass, 1);
      }
    }
    drawSet(p, BSET);
    const n = Math.round(TAU * Math.sqrt((rx * rx + ry * ry) / 2) * 1.3), glow = clamp(1 - a / 2.4);
    for (let i = 0; i < n; i++) {
      const th = (i / n) * TAU, heap = 0.6 * ring(th, 3, S0 + 14) + 0.4 * ring(th, 7, S0 + 15);
      if (heap < -0.2) continue;   // a gap in the lip
      const x = Math.round(Math.cos(th) * rx * 1.04), y = Math.round(Math.sin(th) * ry * 1.04);
      if (0.9 * clamp(0.5 + 0.75 * heap) + 0.1 * rand(x + 500, y + 500, S0 + 16) < gone) continue;
      const hh = 1 + Math.round(1.6 * clamp(heap + 0.2)), far = Math.sin(th) < 0;
      for (let j = 0; j < hh; j++) p.dot(x, y - j, j === hh - 1 ? mix(DUST[0], HF[3], (far ? 0.6 : 0.1) * glow) : j === 0 && !far ? OUTLINE : DUST[2], 1);
    }
  }

  // the fires in the scorch, far ones (z < 0) behind the blast, near ones in front: they catch and grow, bend hard
  // outward when the shock's gust hits them, lean in toward the stem while the afterwinds blow, burn down and go out;
  // the ones the blast blew out smoulder, and some catch again
  function drawFires(p, front) {
    const NZ = (rate, seed = 0, off = 0) => noise(t * rate + off, seed), drift = 1 - smooth(4.4, 5.4, t);
    for (const f of fires) {
      if (f.z >= 0 !== front || t < f.ign || t > f.end) continue;
      const x = f.x, y = f.z * FL, [fl, sm] = flameAt(f), ux = f.x / f.r;
      const gust = t > f.hit ? Math.exp(-(t - f.hit) / 0.14) : 0, inflow = smooth(0.8, 1.6, t) * drift * (1 - f.r / 220);
      p.px(x - 1, y, SOOT2);
      p.px(x + 1, y, SOOT2);
      p.px(x, y, fl > 0.3 || sm > 0.5 ? HF[3] : HF[5]);
      if (fl > 0.02) {
        const h = (3 + 8 * f.size) * Math.pow(fl, 0.7) * (0.82 + 0.18 * NZ(6, f.n)) * (1 - 0.55 * gust);
        flameTongue(p, x, y - 0.5, h, (1.2 + 0.9 * f.size) * (0.6 + 0.4 * fl), ux * (12 * gust - 4 * inflow) + NZ(2.4, f.n + 3) * 1.2, NZ, f.n, HF, LAYERS, 0.4, 0.8);
        if (fl > 0.15) p.glow(x, y - 3, 5 + 4 * f.size * fl, HF[3], 0.34 * fl);
      } else if (sm > 0) {
        const k = sm * (0.6 + 0.4 * NZ(5, f.n + 9));
        p.px(x + (f.n % 2 ? 1 : -1), y, k > 0.5 ? HF[4] : HF[6]);
        p.glow(x, y - 1, 4, HF[4], 0.25 * k);
      }
    }
  }

  // the soft particles (smoke, dust, vapour): the surge on the near half of the floor in front, the rest behind
  function soft(p, near) {
    const all = ps.list;
    ps.list = all.filter((q) => (q.fz > 0) === near);
    drawPs(p, ps, "back", FR);
    ps.list = all;
  }

  // the sparks and grit behind the blast (z < 0) are drawn before it, the ones in front after it
  function drawThrown(p, front) {
    for (const b of thrown) {
      if ((b.z >= 0) !== front) continue;
      const x = b.x, y = b.z * FL - b.h, vy = b.vz * FL - b.vh;
      if (b.kind === "spark") {
        const k = 1 - (t - LIFT) / b.life;
        if (k > 0) spark(p, x, y, b.vx, vy, k, SPK);
        continue;
      }
      if (b.gone !== undefined && t > b.gone) continue;   // settled into the floor
      const sp = Math.hypot(b.vx, vy);
      if (!b.landed && sp > 140) {
        // dirt in flight: a short streak, the bit at its head
        const L = Math.min(5, sp * 0.012), ux = b.vx / sp, uy = vy / sp;
        p.line(x - ux * L, y - uy * L, x, y, (v) => (v < 0.5 ? scale(b.c, 0.7) : b.c));
      } else {
        p.px(x, y, b.c);
        if (b.s >= 2) p.px(x + 1, y, b.c), p.px(x, y + 1, scale(b.c, 0.8)), p.px(x + 1, y + 1, scale(b.c, 0.7));
      }
    }
  }
}

// light over most of the canvas, brightest near (cx, cy), falling to nothing just inside the canvas edges so it
// never shows the canvas as a box
function wash(p, OX, OY, W, H, cx, cy, c, k) {
  const rx = Math.min(OX + cx, W - OX - cx) - 4, up = OY + cy - 4, down = H - OY - cy - 4;
  p.shade(-OX, -OY, W - OX - 1, H - OY - 1, (x, y, out) => {
    const d = Math.hypot((x - cx) / rx, (y - cy) / (y < cy ? up : down));
    out.l = c;
    out.k = k * (1 - smooth(0, 1, d));
  });
}

// the condensation veil: a thin white dome over the cap that flashes and evaporates into wisps that drift apart.
// Its points lie over the dome's surface, so where we see it edge on they crowd into a brighter rim; the half that
// faces away from us is drawn behind the cap, the half that faces us in front of it.
function veilDraw(p, t, S, veil, back) {
  const u = (t - SKIRT[0]) / (SKIRT[1] - SKIRT[0]);
  if (u <= 0 || u >= 1) return;
  const a = Math.min(1, u / 0.06) * Math.pow(1 - u, 1.5) * 0.6, capR = (S.ring + S.tube) * 1.1, B0 = S.tube * 1.15 + 6;
  for (const q of veil) {
    const ev = u * u * q.e, A = capR * q.w * (1 + ev * 0.2), B = B0 * q.w, c = Math.sqrt(1 - q.sh * q.sh);
    const x = Math.cos(q.th) * c * A, z = Math.sin(q.th) * c * A, h = q.sh * B;
    // facing us: its normal leans toward the camera (toward the near side and up)
    if (z / (A * A) + (FL * h) / (B * B) >= 0 === back) continue;
    p.disc(x + q.dx * ev * 10, S.y + z * FL - h + q.dy * ev * 8, q.s * (1 - 0.5 * u), WHITE, a * (back ? 0.16 : 0.26));
  }
}

// the condensation skirt: a bell flaring round the stem under the cap, round on the floor's 2:1, edged with a crisp
// white rim, evaporating into wisps that drift apart and thin; far half behind the stem, near half in front
function skirtDraw(p, t, S, skirt, back) {
  const u = (t - SKIRT[0]) / (SKIRT[1] - SKIRT[0]);
  if (u <= 0 || u >= 1) return;
  const a = Math.min(1, u / 0.06) * Math.pow(1 - u, 1.5) * 0.6, capR = (S.ring + S.tube) * 1.1, y0 = S.y + S.tube * 0.3, y1 = S.y * 0.55;
  for (const q of skirt) {
    const z = Math.sin(q.ph);
    if (z < 0 !== back) continue;
    const R = lerp(capR * 0.82, 13, Math.pow(q.v, 0.6)) * q.w, ev = u * u * q.e;
    const x = Math.cos(q.ph) * R * (1 + ev * 0.25) + q.dx * ev * 10, y = lerp(y0, y1, q.v) + z * R * FL + q.dy * ev * 8;
    p.disc(x, y, q.s * (1 - 0.55 * u), WHITE, a * (back ? 0.3 : 0.55) * (1 - q.v * 0.3));
  }
  // the bell's crisp lower edge, a 2:1 ring round the stem, dithering away as it evaporates
  if (u < 0.7) {
    const R = 13 * 1.25 * (1 + u * 0.6), k = 1 - u / 0.7, n = Math.ceil(R * TAU * 1.2);
    for (let i = 0; i < n; i++) {
      const g = (i / n) * TAU, z = Math.sin(g);
      if (z < 0 !== back) continue;
      p.dot(Math.cos(g) * R, y1 + 2 + z * R * FL, WHITE, k * (back ? 0.6 : 1));
    }
  }
}
