// A burning patch of floor: the ground version of the fire in this folder, drawn to lie on a 2:1 isometric plane.
// The flame tongues, fire puffs, embers, sparks and smoke follow the same recipe as campfire.js and brazier.js.
// The fire is laid out in clusters, not on a ring: a ring of evenly spaced tongues reads as candles, a cluster
// reads as one fire. Kept small and dense on purpose, so it can sit under a column and read as its base.
import { fit, hex, mix, Rng, clamp, smooth, WHITE } from "../../core/index.js";
import { noiseFor, hotFirst, flameTongue, firePuff, lick, smokePuff, ember, spark, drift, floorLight, looped, LAYERS, BACK_LAYERS } from "./_lib.js";

export const meta = {
  name: "Burning ground",
  desc: "A patch of floor on fire: tongues leap out of scorched ground, coals breathe in the ash, embers and sparks rise, thin smoke drifts off, all lying flat on a 2:1 floor.",
  tags: ["fire", "ground", "burn", "aoe", "loop", "iso", "top-down"],
  size: [210, 182],
  origin: [105, 112],
  duration: 2.4,
  loop: true,
  fps: 30,
  bg: "ground",
  options: {
    palette: ["#4a1712", "#8a1f17", "#c9281f", "#f2561d", "#ff8a2a", "#ffc23d", "#ffe26b", "#fff3a6", "#ffffff"],
    radius: 1,
    growth: 1,      // how far the fire has spread from the middle: 0 nothing yet, 1 the whole patch
    fuel: 1,        // how much is left to burn: 1 a fresh fire, 0 burnt out (the coals glow on, then the ash)
    ash: 1,         // how much of the scorch is left: 1 all of it, 0 gone (a one-shot that uses it must end at 0)
    seed: 3,
  },
};

const D = meta.duration, NL = noiseFor(D), FLOOR = 0.5, TAU = Math.PI * 2;
const stain = (p, x, y, rx, ry, c, a) => {           // a blended elliptical glow: true alpha, never a dithered disc
  // the same field as before, but walked only out to the radius where the alpha still shows, with the fraction
  // worked out per row instead of per pixel and no Math.hypot (it is several times slower than a plain sqrt)
  const lim = 1 - Math.sqrt(0.004 / a), lim2 = lim * lim;
  if (!(lim > 0)) return;
  const irx = 1 / rx, iry = 1 / ry;
  for (let py = Math.ceil(y - ry * lim); py <= Math.floor(y + ry * lim); py++) {
    const q = (py - y) * iry, q2 = q * q;
    if (q2 >= lim2) continue;
    const w = rx * Math.sqrt(lim2 - q2);
    const px0 = Math.ceil(x - w), px1 = Math.floor(x + w);
    for (let px = px0; px <= px1; px++) {
      const u = (px - x) * irx, d = Math.sqrt(u * u + q2), k = (1 - d) * (1 - d) * a;
      if (k > 0.004) p.blend(px, py, c, k);
    }
  }
};
const SMOKE1 = hex("#5b5566"), SOOT = [hex("#121014"), hex("#1f1714"), hex("#2e231d")], ASH = [hex("#2a2530"), hex("#4a4350"), hex("#6b6270")];

// the burn is a speck field, never a filled disc: a filled ellipse of any alpha reads as a hole punched in the grass
const SPECK = (() => {
  const r = new Rng(77), out = [];
  for (let i = 0; i < 400; i++) {
    const a = r.range(0, TAU), d = Math.pow(r.next(), 0.55);
    out.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, h: r.next(), big: r.chance(0.12), ph: r.range(0, TAU), f: r.next() });
  }
  return out;
})();
// coals: fewer points, each with its own glow phase, so the heat comes and goes unevenly across the burn
const COAL = (() => {
  const r = new Rng(311), out = [];
  for (let i = 0; i < 160; i++) {
    const a = r.range(0, TAU), d = Math.pow(r.next(), 0.65);
    out.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, s: r.chance(0.35) ? 2 : 1, ph: r.range(0, TAU), rate: r.range(1.4, 3.2), hot: r.next() });
  }
  return out;
})();
// the carpet: small overlapping puffs, static in place, flickering per frame: they make the body of fire that the
// tongues stand in. Without them the tongues read as separate candles on bare grass.
const CARPET = (() => {
  const r = new Rng(555), out = [];
  for (let i = 0; i < 230; i++) {
    const a = r.range(0, TAU), d = Math.pow(r.next(), 0.8);
    out.push({ x: Math.cos(a) * d, y: Math.sin(a) * d * FLOOR, s: 1.1 + 1.5 * r.next(), ph: r.range(0, TAU), rate: r.range(2, 5), up: r.chance(0.3) ? 1 + r.next() * 2 : 0 });
  }
  return out;
})();
// the tongues: a hot crown in the middle, a ring of dense clusters around it, thinning out to the rim
const TONGUE = (() => {
  const r = new Rng(1229), out = [];
  for (let i = 0; i < 14; i++) {                       // the crown: the fire where the column stands
    const a = r.range(0, TAU), d = 0.04 + 0.18 * r.next();
    out.push({ a, d, h: 18 + 26 * r.range(0.6, 1.2), w: r.range(3.6, 5.6), big: true, n: (i + 3) * 37 });
  }
  for (let c = 0; c < 4; c++) {                       // clusters, each a small fire of its own
    const ca = r.range(0, TAU), cd = 0.12 + 0.48 * Math.pow(r.next(), 0.8), n = 3 + ((r.next() * 2) | 0);
    for (let i = 0; i < n; i++) {
      const a = ca + r.range(-0.5, 0.5), d = clamp(cd + r.range(-0.09, 0.09), 0.05, 1);
      out.push({ a, d, h: 8 + 16 * (1.15 - d * 0.85) * r.range(0.55, 1.1), w: r.range(3.4, 5.2), big: r.chance(0.3), n: ((c * 7 + i) + 11) * 37 });
    }
  }
  return out;
})();

export function draw(p, t, o) {
  const F = fit(o.palette, 9), S = o.seed | 0, RAD = clamp(o.radius ?? 1, 0.5, 2.4);
  const H = hotFirst(F);
  while (H.length < 9) H.push(H[H.length - 1]);
  const HT = H.slice(); HT[7] = H[6]; HT[8] = H[6];   // tips stay amber: the white cap reads as burning grass
  // growth is how far the fire has spread: a front running out from the middle. Nothing slides or scales to get
  // there: every speck, coal, puff and tongue has its place in the whole patch and catches when the front reaches
  // it, low and small at first. fuel is what is left to burn: tongues die one by one, the coals glow on after the
  // flames, the smoke thickens while it smoulders. ash is the scorch that is left, settling speck by speck.
  const G = clamp(o.growth ?? 1), FUEL = clamp(o.fuel ?? 1), ASHK = clamp(o.ash ?? 1);
  if (G <= 0 || ASHK <= 0) return;
  const RG = 52 * RAD, RY = RG * FLOOR;
  const lit = (d) => clamp((G - d) / 0.22);            // how long the front has been past this spot, in front widths
  const alive = (th) => clamp((FUEL - th * 0.7) / 0.3); // a flame that dies at its own threshold th as the fuel goes
  const N = (rate, seed = 0, off = 0) => NL(t, rate, seed, off);
  const fl = 0.84 + 0.16 * N(7.3, S + 1);
  const GLOW = mix(mix(H[3], H[4], 0.5), WHITE, 0.25), SMOKE = mix(SMOKE1, H[6], 0.2 * FUEL);
  const EMB = [H[1], H[2], H[4], H[6]], SPK = [H[2], H[3], H[4], H[5]];
  const heatK = (0.25 + 0.75 * FUEL) * ASHK;

  // the heat in the ground: two soft blended stains (never dithered), so the burn sits in the grass instead of on it
  stain(p, 0, 0, RG * 1.02 * G, RY * 1.02 * G, mix(H[1], H[2], 0.4), 0.34 * fl * heatK);
  stain(p, 0, 0, RG * 0.62 * G, RY * 0.62 * G, mix(H[2], H[3], 0.4), 0.4 * fl * heatK);

  // smoke first, behind everything: it leaves the burn low and bends over with the draught as it rises. A fire that
  // is dying smokes more than a lively one, until there is nothing left to smoulder
  const smokeK = 0.8 * ASHK * (1 + 0.9 * (1 - FUEL));
  looped(t, D, 20, S + 300, (r) => ({ x: r.range(-0.5, 0.5), y: r.range(-4, 4), vx: r.range(-2.5, 2.5), vy: -r.range(5, 12), life: r.range(1.1, 2), s: r.range(1.6, 3) }), (q, age) => {
    if (Math.abs(q.x) * 2 > G) return;
    const [x, y] = drift(q.x * RG, q.y, q.vx, q.vy, age, 3, -9, 1.8, 1.4);
    smokePuff(p, x, y, (1 - age / q.life) * 0.8, q.s * (1 + age * 0.5), SMOKE, false, smokeK);
  });

  // the burnt ground: dark specks thinning out to the rim, then grey ash, then coals that breathe. The char follows
  // the front in, and it is the last thing to go
  for (const s of SPECK) {
    const d = Math.hypot(s.x, s.y);
    if (d > 0.86 || d > G - 0.03 || s.h > ASHK) continue; // no charred dots out at the rim, where they read as dirt
    const x = s.x * RG, y = s.y * RY;
    const c = d < 0.5 ? mix(SOOT[1], H[0], 0.3) : mix(ASH[1], H[0], 0.35);
    p.px(x, y, c);
    if (s.big) p.px(x + 1, y, s.h < 0.5 ? SOOT[0] : ASH[0]);
  }
  for (const c of COAL) {
    const d = Math.hypot(c.x, c.y);
    if (d > G || c.ph / TAU > ASHK) continue;
    const g = 0.5 + 0.5 * Math.sin((t / D) * TAU * c.rate + c.ph);
    const k = c.hot * g * Math.sqrt(lit(d)) * clamp(0.35 + FUEL);   // they catch a beat after the flames and outlast them
    if (k < 0.2) { p.px(c.x * RG, c.y * RY, ASH[k < 0.1 ? 2 : 1]); continue; }
    const col = k > 0.62 ? H[3] : k > 0.4 ? H[2] : H[1];
    p.px(c.x * RG, c.y * RY, col);
    if (c.s === 2) p.px(c.x * RG + 1, c.y * RY, k > 0.5 ? H[4] : H[2]);
    if (k > 0.55) p.glow(c.x * RG, c.y * RY, 3, col, 0.16 * k);
  }

  // low fire puffs licking off the floor here and there
  looped(t, D, 64, S + 210, (r) => ({ a: r.range(0, TAU), d: 0.12 + 0.88 * Math.pow(r.next(), 0.7), vx: r.range(-4, 4), vy: -r.range(8, 20), life: r.range(0.16, 0.3), s: r.range(1, 1.9), f: r.next() }), (q, age) => {
    if (q.d > G || q.f > FUEL * 1.1) return;
    const x = Math.cos(q.a) * q.d * RG, y = Math.sin(q.a) * q.d * RY;
    const [xx, yy] = drift(x, y, q.vx, q.vy, age, 0, -80, 6, 3.4);
    firePuff(p, xx, yy, 1 - age / q.life, q.s * (0.5 + 0.5 * lit(q.d)), q.f, H);
  });

  // the body of the fire: a static carpet of small puffs, each flickering on its own phase
  for (const c of CARPET) {
    const on = lit(Math.hypot(c.x, c.y / FLOOR));
    if (on <= 0 || c.ph / TAU > FUEL * 1.15) continue;
    const k = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin((t / D) * TAU * c.rate + c.ph));
    firePuff(p, c.x * RG, c.y * RY - c.up * on, 0.4 + 0.4 * k, c.s * (0.75 + 0.45 * k) * (0.45 + 0.55 * on), 0.35 + 0.3 * ((c.ph / TAU) % 1), H);
  }
  // the front itself: a ragged line of young, low flames running out over the grass it hasn't burnt yet
  const FRONT = 1 - smooth(0.8, 1, G);
  if (FRONT > 0 && FUEL > 0.5) {
    const n = Math.round(12 + 30 * G);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.35 * N(1.3, S + 900 + i), rr = G * (0.93 + 0.07 * N(4, S + 950 + i));
      const k = 0.5 + 0.35 * (0.5 + 0.5 * N(9, S + 980 + i));
      firePuff(p, Math.cos(a) * rr * RG, Math.sin(a) * rr * RY - 1, k, (1.1 + 0.9 * FRONT) * (0.8 + 0.4 * ((i * 0.618) % 1)), 0.15, H, 0.14);
    }
  }
  // the tongues themselves: the far half first, then the near half over the coals
  for (const back of [true, false]) {
    for (const T of TONGUE) {
      if ((Math.sin(T.a) < 0) !== back) continue;
      const on = lit(T.d), live = alive((T.n * 0.618) % 1);
      if (on <= 0 || live <= 0) continue;
      const x = Math.cos(T.a) * T.d * RG, y = Math.sin(T.a) * T.d * RY;
      const leap = Math.max(0, N(2.6, T.n + 70) - 0.5) * 1.5;
      const h = T.h * (0.82 + 0.18 * fl + leap) * (1 - 0.1 * T.d) * Math.pow(on, 0.6) * live;
      if (h < 2) continue;
      const sweep = N(2.2, T.n + 40) * (1 + h * 0.06) - Math.cos(T.a) * 1.5;
      flameTongue(p, x, y, h, T.w * (0.6 + 0.4 * Math.min(on, live)), sweep, N, T.n, HT, back ? BACK_LAYERS : LAYERS, 0.5, 1.1 + h * 0.03);
    }
  }

  // embers thrown off the burn, and sparks that pop and die before they land
  looped(t, D, 18, S + 500, (r) => ({ a: r.range(0, TAU), d: 0.1 + r.range(0, 0.85), vy: -r.range(9, 22), life: r.range(0.7, 1.4), s: r.chance(0.3) ? 2 : 1, ph: r.range(0, TAU) }), (q, age) => {
    if (q.d > G || q.ph / TAU > FUEL + 0.25) return;
    const x = Math.cos(q.a) * q.d * RG + Math.sin(age * 2 + q.ph) * 2, y = Math.sin(q.a) * q.d * RY + q.vy * age;
    ember(p, x, y, 1 - age / q.life, q.s, EMB, q.ph + age * 5);
  });
  looped(t, D, 8, S + 600, (r) => ({ a: r.range(0, TAU), d: r.range(0.15, 0.85), vx: r.range(-9, 9), vy: -r.range(16, 30), life: r.range(0.3, 0.5) }), (q, age) => {
    if (q.d > G || FUEL < 0.4) return;
    const x = Math.cos(q.a) * q.d * RG, y = Math.sin(q.a) * q.d * RY;
    spark(p, x + q.vx * age, y + q.vy * age, q.vx, q.vy, 1 - age / q.life, SPK);
  });
  // a few licks torn off the tallest tongues
  looped(t, D, 14, S + 700, (r) => ({ a: r.range(0, TAU), d: r.range(0.05, 0.65), vx: r.range(-3, 3), vy: -r.range(8, 16), life: 0.26, s: r.range(0.8, 1.4) }), (q, age) => {
    if (q.d > G || FUEL < 0.3) return;
    const x = Math.cos(q.a) * q.d * RG, y = Math.sin(q.a) * q.d * RY - 6 - age * 12;
    lick(p, x + q.vx * age, y + q.vy * age, 1 - age / q.life, q.s, H);
  });

  // the warm pool of light the fire throws on the floor (kept out of the colour buffer by design)
  floorLight(p, 0, 0, RG * 0.85 * G, RY * 0.85 * G, GLOW, 0.3 * fl * (0.15 + 0.85 * FUEL) * ASHK);
  floorLight(p, 0, 0, RG * 0.5 * G, RY * 0.5 * G, H[4], 0.2 * fl * FUEL);
}
