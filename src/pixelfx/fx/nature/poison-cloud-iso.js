// nature/poison-cloud on the game's 2:1 camera.
//
// The side-view cloud is a low bank of gas: a bright yellow-green haze on the ground, a puffy mass of
// billowing lobes above it, tendrils that curl over, and glowing specks drifting through. On this camera
// 1 px is 1 sprite px of height and depth is foreshortened by half, so the gas now sits in a real 2:1
// footprint -- and, because one flat bank read as a single lens in the earlier version, it is built out of
// FOUR banks stacked in depth: two behind the character (smaller, dimmer, higher on screen), two in front
// (larger, brighter, lower). Each bank owns its own elliptical footprint, its own lumpy crown, its own
// drift phase and its own lit near rim, so the cloud has a visible thickness instead of one silhouette.
// The tendrils curl over the crown, the plumes rise straight up at their own floor depth and the specks
// drift in 3-D. Everything is closed-form in t (no create()), so the 4 s loop has no seam.

import { fit, rng, smooth, clamp, TAU, tileNoise } from "../../core/index.js";
import { FLOOR } from "../_iso.js";

const D = 4;                       // one full cycle
const FL = FLOOR;                  // 2:1 foreshortening

const PALETTE = ["#0e0816", "#24123a", "#3e2056", "#5a3a62", "#6a6a3a", "#96aa30", "#cce040", "#f4ffa0"];

export const meta = {
  name: "Poison cloud (iso)",
  desc: "Four banks of poison gas stacked in depth over their own 2:1 footprints: far ones small and dim, near ones large and lit, tendrils curling, specks drifting, looping on 4 s.",
  tags: ["nature", "poison", "gas", "cloud", "aoe", "loop", "iso", "top-down", "ground"],
  size: [224, 144],
  origin: [112, 88],
  duration: D,
  loop: true,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: PALETTE, spread: 1, seed: 3 },
};

// the puffs the crown of a bank is made of: x as a fraction of that bank's radius, relative height, width.
// The union of them is the lumpy silhouette of the gas; they are not drawn as separate shapes.
const PUSH = [
  [-0.78, 0.5, 0.3],
  [-0.44, 0.82, 0.28],
  [-0.14, 0.6, 0.24],
  [0.14, 0.96, 0.3],
  [0.48, 0.64, 0.26],
  [0.78, 0.46, 0.28],
];

// four banks, far to near. zc is the centre of the bank's footprint in floor units (negative = away),
// rs its radius as a fraction of the cloud's, hs its height, dim how much light reaches it, ph its own
// drift phase so no two banks breathe together, band -1 draws behind the character, +1 in front of it.
const BANKS = [
  { zc: -0.92, rs: 0.5, hs: 0.92, dim: 0.42, band: -1, ph: 0.31 },
  { zc: -0.42, rs: 0.68, hs: 0.98, dim: 0.64, band: -1, ph: 0.62 },
  { zc: 0.1, rs: 0.86, hs: 1.0, dim: 0.92, band: 1, ph: 0.05 },
  { zc: 0.58, rs: 0.5, hs: 0.7, dim: 1.0, band: 1, ph: 0.44 },
];

export function drawBack(p, t, o) {
  const C = fit(o.palette ?? PALETTE, 8), E = 96 * (o.spread ?? 1), seed = o.seed ?? 3;
  for (const L of BANKS) if (L.band < 0) { floorMarks(p, C, E, t, seed, L); bank(p, C, E, t, seed, L); }
  plumes(p, C, E, t, seed, -1);
  specks(p, C, E, t, seed, true);
}

export function draw(p, t, o) {
  const C = fit(o.palette ?? PALETTE, 8), E = 96 * (o.spread ?? 1), seed = o.seed ?? 3, ph = t / D;
  const pulse = 0.85 + 0.15 * Math.sin((TAU * t * 2) / D);
  for (const L of BANKS) if (L.band > 0) { floorMarks(p, C, E, t, seed, L); bank(p, C, E, t, seed, L); }
  curls(p, C, E, t, seed, ph);
  plumes(p, C, E, t, seed, 1);
  specks(p, C, E, t, seed, false);
  p.glow(0, 0, E * 1.05, C[5], 0.1 * pulse);
}

// ---- one bank: a lumpy mass standing on its own 2:1 footprint. Its underside is lit by the poison light on
// the floor, its crown is dark violet. Drawn whole in the band it belongs to, so the four banks read as a
// stack with real thickness rather than one silhouette.
function bank(p, C, E, t, seed, L) {
  const ph = t / D + L.ph, R = E * L.rs, span = Math.ceil(R * 1.02), yg = L.zc * E * FL;
  // separable mottling: cheap per-column and per-row ramps, no trig per pixel
  const cw = 2 * span + 1, col = new Float32Array(cw), col2 = new Float32Array(cw);
  for (let i = 0; i < cw; i++) {
    const x = i - span;
    col[i] = 0.78 + 0.22 * Math.sin(x * 0.13 + ph * 4);
    col2[i] = 0.5 + 0.5 * Math.sin(x * 0.21 + ph * 7);
  }
  const H = 120, y0 = -60, row = new Float32Array(H), row2 = new Float32Array(H);
  for (let i = 0; i < H; i++) {
    const y = i + y0;
    row[i] = 0.85 + 0.15 * Math.sin(y * 0.21 - ph * 5);
    row2[i] = 0.5 + 0.5 * Math.sin(y * 0.33 + ph * 7);
  }
  for (let i = 0; i < cw; i++) {
    const x = i - span, xr = x / R, ax = Math.abs(xr), env = 1 - smooth(0.58, 1.02, ax);
    if (env <= 0.01) continue;
    let puff = 0;
    for (const q of PUSH) {
      const d = (xr - q[0]) / q[2];
      puff = Math.max(puff, q[1] * Math.exp(-d * d));
    }
    const breath = 1 + 0.06 * Math.sin(TAU * ph * 2 + xr * 1.6);
    const crownGrain = 0.55 + 0.45 * tileNoise(ax * 0.06 - ph * 3, 0, 1, 0, seed + 2);
    const hgt = (2 + 30 * L.hs * env * (0.4 + 0.6 * puff) * crownGrain) * breath;
    const top = Math.round(yg - hgt);
    const under = Math.sqrt(Math.max(0, 1 - xr * xr));        // footprint half-width at this column
    const bottom = Math.round(yg + under * R * FL * (1 + 0.04 * Math.sin(x * 0.42 + ph * 6)));
    const dim = L.dim, lift = dim < 0.5 ? -1 : dim < 0.75 ? 0 : 1; // far banks darker, near ones lighter
    for (let y = top; y <= bottom; y++) {
      const hh = (bottom - y) / Math.max(1, bottom - top);     // 0 on the ground, 1 at the crown
      const ri = clamp(y - y0, 0, H - 1);
      // solid stepped body: the dome is a mass of gas, not an alpha field. A per-pixel p.blend here was the
      // ordered-dither moiré in the middle of the cloud AND the source of stray single dark pixels (the
      // checkerboard's dark half), so the fill is opaque now and only the 1-2 px silhouette stays soft.
      if (y >= bottom - 1) {
        // the underside of this bank: a dark seam where it passes behind the next layer, lit only on the
        // frontmost bank whose rim catches the poison light off the floor
        const lip = L.zc > 0.4 ? C[5] : C[3];
        p.px(x, y, y === bottom ? lip : C[3]);
        continue;
      }
      // the band edges wander with a low-frequency noise (a smooth 2-D wobble, not a sine: sines at this size
      // read as chevron stripes and close the bands into rings, which makes the dome look like a beach ball)
      const wob = 0.3 * (tileNoise(x * 0.055, y * 0.04, 1, 0, seed + 13) - 0.5);
      const hh2 = hh + wob, lit = L.zc > 0.4;
      const band = hh2 > 0.85 ? 2 : hh2 > 0.6 ? 3 : hh2 > 0.3 ? 4 : lit ? 5 : 4;
      const tone = band;                                    // no extra lit rim: the gas is lit from the floor
      p.px(x, y, C[clamp(tone - lift, 2, 6)]);
    }
  }
}

// ---- the floor each bank stands on: the gas lights it from above and its weight sits in the footprint,
// no hard ring -- one soft ellipse per bank, so the four footprints overlap into a bed of poison light
function floorMarks(p, C, E, t, seed, L) {
  const pulse = 0.85 + 0.15 * Math.sin((TAU * t * 2) / D), R = E * L.rs, yg = L.zc * E * FL, dim = L.dim;
  for (let i = 0; i < 5; i++) {
    const g = rng(seed, i + L.band * 3 + Math.round(L.zc * 10), 41);
    const lx = g.range(-0.8, 0.8) * R, lz = g.range(-0.7, 0.7) * R * FL;
    p.glow(lx, yg + lz, g.range(14, 22) * L.rs, C[6], 0.14 * g.range(0.5, 1) * pulse * dim);
  }
  // the lit near lip of this bank's footprint, and the dark line its weight presses into the floor
  for (const s of [-1, 1]) {
    p.dot(s * R * 0.97, yg, C[6], 0.45 * pulse * dim);
    p.dot(s * R * 0.93, yg + 1, C[5], 0.32 * pulse * dim);
    p.glow(s * R * 0.95, yg, 8 * L.rs + 2, C[6], 0.28 * pulse * dim);
  }
  for (let x = -R * 0.8; x <= R * 0.8; x += 24) p.glow(x, yg + 2, 18 * L.rs, C[5], 0.09 * pulse * dim * (1 - Math.abs(x) / (R * 1.2)));
}

// ---- the tongue curls: the gas rolls over itself at the top of the near banks, the source's signature detail
function curls(p, C, E, t, seed, ph) {
  const list = [];
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const q = (ph + i / 3 + (s > 0 ? 0.5 / 3 : 0)) % 1;
    list.push({ s, q, x: s * E * (0.3 + 0.82 * q), h: 26 * (0.8 - 0.5 * q), curl: Math.sin(Math.PI * q) });
  }
  for (const g of list) {
    if (g.curl < 0.15 || g.h < 5) continue;
    const r = 1.8 + g.h * 0.2, cx = g.x - g.s * r * 0.6, cy = -g.h * 0.75 + E * 0.06, spin = -g.s * g.q * TAU * 2.2;
    for (let a = 0; a < 4.6; a += 0.1) {
      const rr = r * (1 - a * 0.12), w = 1.5 * (1 - a / 6);
      const px = cx + g.s * Math.cos(spin + a) * rr, py = cy + Math.sin(spin + a) * rr;
      for (let ob = -w; ob <= w; ob += 0.8) {
        p.blend(px + g.s * Math.cos(spin + a) * ob * 0.3, py + Math.sin(spin + a) * ob, ob > w * 0.4 ? C[6] : C[5], 0.5 * g.curl * (1 - a / 5.5));
      }
    }
  }
}

// ---- plumes: thin wisps of gas rising out of the banks at their own floor depth, the source's tall spikes
function plumes(p, C, E, t, seed, face) {
  for (let k = 0; k < 7; k++) {
    const born = rng(seed, k, 911).next() * D, L = 2.4 + 0.8 * rng(seed, k, 5).next();
    let age = (((t - born) % D) + D) % D;
    for (; age < L; age += D) {
      const R = rng(seed, k), u = age / L, s = R.sign();
      const x0 = R.range(-0.6, 0.6) * E + s * 0.1 * E, z0 = R.range(-0.62, 0.62) * E, ph2 = R.range(0, TAU);
      if (z0 >= 0 !== face > 0) continue;
      const rise = R.range(14, 20), len = R.range(34, 48), amp = R.range(3, 5), base = z0 * FL - 16;
      const head = base - rise * age, tail = Math.max(base - 40, head + len);
      const fade = smooth(0, 0.15, u) * (1 - smooth(0.5, 1, u));
      if (fade < 0.02) continue;
      for (let hh = tail; hh < head; hh += 0.7) {
        const q = (head - hh) / Math.max(1, head - tail), tw = Math.cos(hh * 0.22 + age * 2.4 + ph2);
        const w = 0.6 + 2.2 * Math.abs(tw) * (1 - q * 0.5);
        const x = x0 + amp * Math.sin(hh * 0.12 + age + ph2) * (0.4 + q);
        const a = fade * Math.sin(Math.PI * Math.min(1, q * 1.2)) * 0.32;
        // opaque wisps: a translucent dark wisp is a dither field of near-black pixels on the lit floor, which
        // the audit (rightly) reads as specks. Thin and solid instead — the shape still tapers by column width.
        if (a <= 0.14) continue;
        for (let ob2 = -w; ob2 <= w; ob2 += 1) {
          p.px(x + ob2, hh, tw > 0 ? (Math.abs(ob2) < w * 0.5 ? C[6] : C[5]) : Math.abs(ob2) < w * 0.5 ? C[5] : C[4]);
        }
      }
    }
  }
}

// ---- glowing specks of poison drifting through the banks, at their own floor depth
function specks(p, C, E, t, seed, back) {
  for (let k = 0; k < 26; k++) {
    const born = rng(seed, k + 7, 911).next() * D, L = 1.5 + 1.1 * rng(seed, k + 7, 5).next();
    let age = (((t - born) % D) + D) % D;
    for (; age < L; age += D) {
      const R = rng(seed, k + 7), u = age / L, s = R.sign();
      const z = R.range(0.2, 0.62) * E * s;
      if (z >= 0 !== back) continue;
      const h = R.range(2, 22) + 3 * Math.sin(age * R.range(1.5, 3) + R.next() * TAU);
      const a = Math.min(1, u * 5) * Math.min(1, (1 - u) * 3) * (0.6 + 0.4 * Math.sin(age * R.range(6, 10) + R.next() * TAU));
      if (a < 0.08) continue;
      const x = s * (R.range(0.05, 0.75) * E + age * R.range(6, 14)), y = z * FL - h;
      p.dot(x, y, a > 0.7 ? C[7] : C[6], a * 1.3);
      p.glow(x, y, 4, C[6], 0.3 * a);
    }
  }
}
