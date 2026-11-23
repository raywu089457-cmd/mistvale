// nature/toxic-puddle on the game's 2:1 camera.
//
// The side-view puddle is a shallow lens of tar: a glossy black surface with oil-sheen bands and chartreuse
// light leaking up through cracks in the crust, a bright lip where the tar meets the ground, bubbles that
// swell, stretch, pop and throw spatter, and wisps of vapour drifting off it. On this camera 1 px is 1
// sprite px and the ground is foreshortened by half, so the pool is now a real 2:1 ellipse on the floor:
// its far half is drawn behind the hero and dimmer, its near lip shows the thickness of the tar, the
// bubbles stand on the surface at their own floor depth, their pop ripples run round the ellipse in 2:1 and
// their spatter flies in 3-D. Everything is closed-form in t (no create()) so the 4 s loop has no seam.

import { fit, rng, smooth, clamp, TAU, tileNoise, noise2, ease } from "../../core/index.js";
import { FLOOR, bandFloor } from "../_iso.js";

const D = 4;                       // one full cycle
const FL = FLOOR;                  // 2:1 foreshortening

const PALETTE = ["#06070a", "#0c100c", "#141a10", "#1e2814", "#2e3c18", "#5a7a1c", "#a6d42a", "#ecff86"];
const SHEEN = ["#2a1648", "#5a2e8e", "#1e7a86", "#6adccc"];
const GREY = "#b4b8ae";

export const meta = {
  name: "Toxic puddle (iso)",
  desc: "nature/toxic-puddle on the 2:1 floor: a tar pool in an ellipse, sheen bands and glowing cracks, bubbles that swell and pop, vapour wisps, looping on 4 s.",
  tags: ["nature", "toxic", "poison", "puddle", "liquid", "loop", "iso", "top-down", "ground"],
  size: [200, 130],
  origin: [100, 84],
  duration: D,
  loop: true,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: PALETTE, sheen: SHEEN, width: 42, seed: 2 },
};

export function drawBack(p, t, o) {
  const C = fit(o.palette ?? PALETTE, 8), Sh = fit(o.sheen ?? SHEEN, 4);
  const W = o.width ?? 42, seed = o.seed ?? 2;
  const pulse = 0.5 + 0.5 * Math.sin((TAU * t) / D);
  p.glow(0, -3, W * 1.3, C[5], 0.2 * pulse);
  p.glow(0, -12, W * 1.1, C[6], 0.09 * pulse);
  for (const s of [-1, 1]) p.glow(s * W, -1, 12, C[6], 0.3 * pulse);
  skin(p, C, Sh, W, t, seed, -1);
  bubbles(p, C, Sh, W, t, seed, -1);
  ribbons(p, C, W, t, seed, -1);
}

export function draw(p, t, o) {
  const C = fit(o.palette ?? PALETTE, 8), Sh = fit(o.sheen ?? SHEEN, 4);
  const W = o.width ?? 42, seed = o.seed ?? 2;
  skin(p, C, Sh, W, t, seed, 1);
  bubbles(p, C, Sh, W, t, seed, 1);
  ribbons(p, C, W, t, seed, 1);
}

// ---- the pool: a 2:1 ellipse of tar. The far half (y < 0) is behind the hero, its lip is drawn dimmer.
// The crust is dark; oil sheen floats on it in bands; chartreuse light seeps up through cracks and round
// the rim; the near lip shows the tar's thickness with a bright meniscus edge.
// The pool is built as solid rings from the rim in: the bright meniscus, the stained rim and a wide band of
// sheen, then broad dark tar fields with smooth sheen bands inside them. Dark colours only ever sit in wide
// fields, never in a 1 px cell, and the light leaking through the crust is drawn as bright veins.
function skin(p, C, Sh, W, t, seed, face) {
  const rx = W, ry = Math.round(W * FL), ph = t / D;
  for (let y = -ry; y <= ry; y++) {
    if ((y >= 0) !== face > 0) continue;
    const yq = y / ry, span = Math.round(rx * Math.sqrt(Math.max(0, 1 - yq * yq)));
    const far = y < 0;
    for (let x = -span; x <= span; x++) {
      const xq = x / rx, d2 = xq * xq + yq * yq;
      if (d2 > 1) continue;
      const rr = Math.sqrt(d2), th = Math.atan2(yq, xq), edge = 1 - d2;
      if (rr > 0.955) {
        const lip = 0.5 + 0.5 * Math.sin(th * 3 + ph * TAU * 2 + seed * 1.7);
        p.px(x, y, lip > 0.6 ? C[7] : C[6]);
        continue;
      }
      if (rr > 0.9) { p.px(x, y, far ? C[5] : C[5]); continue; }
      if (rr > 0.74) {
        // the stained rim: chartreuse over teal, bright, and it never touches the dark tar
        const stain = Math.sin(th * 5 - ph * TAU + 1.7);
        p.px(x, y, stain > 0.5 ? Sh[2] : stain > -0.45 ? C[5] : C[4]);
        continue;
      }
      if (rr > 0.66) {
        // a solid chartreuse kerb between the lit rim and the tar: two pixels of mid green all the way round
        p.px(x, y, C[4]);
        continue;
      }
      // the crust: wide dark tar with smooth sheen fields, never a 1 px dark cell
      // low angular frequency near the middle (th swings fast there) and slow radial bands: every colour
      // step is at least two pixels wide, so a dark cell can never be stranded between two lit bands
      const band = Math.sin(rr * 7 + th * 1.6 * Math.min(1, rr * 2.2) + ph * TAU);
      let c = far ? C[2] : C[3];
      if (band > 0.62) c = C[4];
      else if (band > 0.2) c = far ? C[3] : C[4];
      p.px(x, y, c);
      // light leaking up through cracks: bright veins, 1 px, so they read on the dark tar
      const cr = Math.abs((((tileNoise(x * 0.09, y * 0.11 + ph * 3, 0, 3, seed) * 2.2) % 1) + 1) % 1 - 0.5) * 2;
      if (cr < 0.045 && rr < 0.7) p.px(x, y, C[6]);
    }
  }
  if (face > 0) {
    // the tar's thickness: solid rows of dark tar under the near lip, brightest just under the surface
    for (let x = -rx; x <= rx; x++) {
      const xq = x / rx, yy = Math.round(ry * Math.sqrt(Math.max(0, 1 - xq * xq)));
      p.px(x, yy + 1, C[6]);
      p.px(x, yy + 2, C[4]);
      p.px(x, yy + 3, C[2]);
    }
  }
}

function pulseCrack(t, x) { return 0.5 + 0.5 * Math.sin((TAU * t) / D + x * 0.1); }

// ---- bubbles: domes of gas splitting the tar, swelling and stretching before they pop into a ring of
// light, a handful of flying droplets and a ribbon of vapour, each at its own floor depth
function bubbles(p, C, Sh, W, t, seed, face) {
  const ph = t / D, rx = W, ry = Math.round(W * FL);
  for (let k = 0; k < 4; k++) {
    const born = rng(seed, k, 331).next() * D, L = 2.4 + 0.8 * rng(seed, k, 5).next();
    let age = (((t - born) % D) + D) % D;
    for (; age < L; age += D) {
      const R = rng(seed, k + 11), u = age / L;
      const bx = R.range(-0.46, 0.46) * rx, bz = R.range(-0.44, 0.44) * rx;
      const bz2 = bz / rx, nrm = Math.sqrt(1 - (bx / rx) ** 2 - bz2 * bz2);
      if (nrm < 0.15) continue;
      const by = bz * FL;                                     // its place on the 2:1 surface
      if (bz >= 0 !== face > 0) continue;
      const swell = R.range(1, 1.6), rmax = R.range(3.4, 6.4);
      if (age < swell) {
        const g = smooth(0.6, 1, age / swell), gr = ease.outCubic(Math.min(1, (age / swell) * 1.3));
        const r = rmax * gr * (1 + 0.4 * g), hh = r * (0.5 + 0.5 * g);
        // a glossy dome standing on the surface: solid cells with no holes, chartreuse light through the
        // glass and a lit rim — never a dark ring that a dark speck could hide in
        // a solid mid-green halo behind the dome: the lit glass never borders the dark tar directly
        p.ellipse(bx, by - hh * 0.4, r + 2.4, hh * 1.1 + 2.4, C[4], 1);
        const Rr = Math.max(1, Math.ceil(r)), Hh = Math.max(1, Math.ceil(hh));
        for (let dy = -Hh; dy <= 0; dy++) {
          for (let dx = -Rr; dx <= Rr; dx++) {
            const nx = dx / Math.max(1, r), ny = dy / Math.max(1, hh);
            const dd = Math.sqrt(nx * nx + ny * ny);
            if (dd > 1) continue;
            const lit = clamp(-nx * 0.7 - ny * 0.4, 0, 1);
            let c;
            if (dd > 0.78) c = C[4];
            else if (dy > -hh * 0.5) c = lit > 0.55 ? C[6] : lit > 0.25 ? C[5] : C[4];
            else c = lit > 0.45 ? Sh[3] : lit > 0.2 ? C[5] : C[4];
            p.px(bx + dx, by + dy, c);
          }
        }
        // specular pip and the glow coming off it
        p.px(bx - Math.round(r * 0.4), by - Math.round(hh * 0.62), C[7]);
        p.px(bx - Math.round(r * 0.4) + 1, by - Math.round(hh * 0.62), C[6]);
        p.glow(bx, by - hh * 0.5, 6 + r * 1.2, C[6], (0.2 + 0.3 * g) * gr);
      } else {
        const e = age - swell, k2 = clamp(e / 0.3, 0, 1);
        const rr = 2 + 13 * ease.outCubic(k2);
        // the pop: a solid disc of light with a bright edge, running out over the tar in 2:1. It is filled,
        // so no dark tar cell can be stranded inside a dashed ring.
        p.ellipse(bx, by, rr + 2.2, (rr + 2.2) * FL, C[4], 1);
        const Nx = Math.ceil(rr), Ny = Math.ceil(rr * FL) + 1;
        for (let dy = -Ny; dy <= Ny; dy++) {
          for (let dx = -Nx; dx <= Nx; dx++) {
            const d = Math.sqrt((dx / rr) ** 2 + (dy / Math.max(1, rr * FL)) ** 2);
            if (d > 1) continue;
            const ang = Math.atan2(dy, dx);
            if (Math.sin(ang) <= -0.2 && bz >= 0) continue;
            p.px(bx + dx, by + dy, d > 0.72 ? C[4] : d > 0.45 ? C[5] : C[6]);
          }
        }
        p.glowRing(bx, by, rr, 3, C[6], 0.3 * (1 - k2));
        if (e < 0.1) p.glow(bx, by - 2, 16, C[6], 0.7 * (1 - e / 0.1));
        // spatter: droplets thrown up from the pop, falling back to the floor at their own depth
        for (let j = 0; j < 7; j++) {
          const Q = rng(seed, k * 17 + j, 77), a = Q.range(0, TAU), sp = Q.range(26, 70);
          const vx = Math.cos(a) * sp, vz = Math.sin(a) * sp * 0.7, vh = Q.range(35, 95);
          const g2 = 780, tt = Math.min(e, 1);
          const dx = bx + vx * tt, dz = bz + vz * tt, h = vh * tt - 0.5 * g2 * tt * tt;
          if (h < 0) continue;
          const px2 = dx, py2 = (dz + 0) * FL - h;
          if (dz >= 0 !== face > 0) continue;
          p.px(px2, py2, C[4]);
          p.px(px2, py2 - 1, j & 1 ? Sh[3] : C[6]);
        }
        if (e > 0.1 && e < 0.55) ribbon(p, C, bx, by - 2, (e - 0.1) / 0.45, 0.7, rng(seed, k + 3));
      }
    }
  }
}

function farAlpha(z, face) { return z < 0 ? 0.72 : 1; }

// ---- vapour: thin ribbons standing straight up off the surface at their own floor depth
function ribbons(p, C, W, t, seed, face) {
  const rx = W;
  for (let k = 0; k < 6; k++) {
    const born = rng(seed * 13 + 4, k, 911).next() * D, L = 2.4 + 1 * rng(seed * 13 + 4, k, 5).next();
    let age = (((t - born) % D) + D) % D;
    for (; age < L; age += D) {
      const R = rng(seed * 13 + 4, k + 19), u = age / L;
      const x0 = R.range(-0.85, 0.85) * rx, z0 = R.range(-0.8, 0.8) * rx;
      if (z0 >= 0 !== face > 0) continue;
      const by = z0 * FL;
      ribbon(p, C, x0, by - 1, age, L, R, 0.75);
    }
  }
}

function ribbon(p, C, x0, y0, age, life, R, k) {
  const u = clamp(age / life, 0, 1);
  if (u >= 1) return;
  const len = R.range(16, 26), rise = R.range(9, 14), amp = R.range(2, 4.5), w = R.range(0.18, 0.3), ph = R.range(0, TAU);
  const head = rise * age, tail = Math.max(0, head - len);
  const fray = smooth(0.35, 0.85, u), fade = smooth(0, 0.12, u) * (1 - smooth(0.5, 1, u)) * k;
  if (fade < 0.02 || head <= tail + 1) return;
  const n = fray > 0.05 ? 3 : 1;
  for (let h = tail; h <= head; h += 0.7) {
    const s = (h - tail) / Math.max(1, head - tail), cx = x0 + amp * Math.sin(h * w + ph + age * 1.6) * (0.3 + s);
    const a = fade * Math.sin(Math.PI * s) * 0.62;
    if (a < 0.38) continue;
    const lit = Math.max(0, 1 - h / 22) * (1 - 0.6 * fray);
    for (let q = 0; q < n; q++) {
      const off = n === 1 ? 0 : fray * s * (q - 1) * 3 + fray * 2.5 * Math.sin(h * (0.35 + q * 0.17) + ph * (q + 1) + age * 2);
      p.blend(cx + off, y0 - h, lit > 0.5 ? C[5] : C[4], Math.min(0.6, a) * (n === 1 ? 1 : 0.7 - 0.25 * fray));
    }
  }
}
