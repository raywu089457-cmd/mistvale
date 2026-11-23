// nature/spore-burst on the game's 2:1 camera.
//
// The side-view effect is a toadstool that grows, swells and bursts into a cloud of gas and spores. On this
// camera 1 px is 1 sprite px and the ground is foreshortened by half: the toadstool still stands upright and
// exactly as tall as before (height is height), but it now stands in a real footprint on the 2:1 floor, its
// cap is a dome seen from above with the gills glowing under the near rim, the gas lumps it throws fly in
// 3-D and land at their own depth, the spores drift down through the volume and the dust ring at its foot is
// a 2:1 ellipse. The effect is authored as a timeline of closed-form events (grow 0.32 s, charge, burst at
// 0.8 s, long drift, sink at 2.15 s) so any frame renders alone and the run is deterministic.

import { fit, Rng, clamp, smooth, ease, TAU, noise2, sparkle, WHITE } from "../../core/index.js";
import { FLOOR, bandFloor } from "../_iso.js";

const FL = FLOOR;
const GROW = 0.32, PUFF = 0.8, SINK = 2.15;
const G = 620;

const PALETTE = ["#06141c", "#0c2a34", "#11484e", "#17706a", "#22a08a", "#4cd0a8", "#a8f4d0", "#f0fff6"];
const CAP = ["#1a0c1e", "#3a1438", "#62204e", "#8e3462", "#bc5276", "#e88a96"];
const STEM = ["#2a2230", "#5a4e5e", "#9a8e98", "#d8ccd0", "#f6eeee"];

export const meta = {
  name: "Spore burst (iso)",
  desc: "nature/spore-burst on the 2:1 floor: a toadstool grows on the floor, swells, bursts into 3-D gas and spores that land at their own depth, then sinks.",
  tags: ["nature", "fungus", "spore", "burst", "toxic", "puff", "one-shot", "iso", "top-down", "ground"],
  size: [220, 170],
  origin: [110, 122],
  duration: 3.2,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: PALETTE, cap: CAP, stem: STEM, seed: 9 },
};

// where the pale spots sit on the cap, in cap radii
const SPOTS = [[-0.45, 0.45, 1.4], [0.1, 0.72, 1.8], [0.55, 0.38, 1.2], [-0.12, 0.25, 1], [0.3, 0.12, 0.9], [-0.7, 0.16, 0.8]];

export function create(o) {
  const K = fit(o.palette ?? PALETTE, 8), Cs = fit(o.cap ?? CAP, 6), Sm = fit(o.stem ?? STEM, 5);
  const R = new Rng(o.seed ?? 9);
  const seed = o.seed ?? 9;

  // 30 gas lumps thrown at the burst, 3-D: they leave the cap, arc out and hang in the air as the cloud
  const lumps = [];
  for (let i = 0; i < 30; i++) {
    const a = -Math.PI / 2 + R.range(-1.15, 1.15), sp = R.range(10, 42);
    lumps.push({
      x0: R.range(-8, 8), z0: R.range(-4, 4), h0: R.range(-23, -17),
      vx: Math.cos(a) * sp * R.range(0.8, 1.3), vz: Math.sin(a) * sp * R.range(0.7, 1.1),
      vh: R.range(26, 62), r0: R.range(2.8, 4.6), rmax: R.range(8, 15),
      life: R.range(1.15, 1.7), tb: PUFF + R.range(0, 0.05), rot: R.range(0, TAU),
    });
  }
  // spores: slow drifting motes that fall through the cloud and settle on the floor
  const spores = [];
  for (let i = 0; i < 44; i++) {
    const a = -Math.PI / 2 + R.range(-1.5, 1.5), sp = R.range(16, 110);
    spores.push({
      x0: R.range(-6, 6), z0: R.range(-3, 3), h0: R.range(-22, -16),
      vx: Math.cos(a) * sp, vz: Math.sin(a) * sp * 0.85, vh: R.range(20, 90),
      life: R.range(1.0, 1.8), tb: PUFF + R.range(0, 0.12), size: R.range(0.5, 1),
    });
  }
  // grit kicked up when it first pushes out of the ground, and again when it sinks
  const grit = [];
  for (let i = 0; i < 14; i++) {
    const a = R.range(0, TAU), sp = R.range(8, 26);
    grit.push({ x0: R.range(-3, 3), z0: R.range(-2, 2), vx: Math.cos(a) * sp, vz: Math.sin(a) * sp * 0.7, vh: R.range(12, 34), tb: R.range(0.03, 0.2) });
  }
  for (let i = 0; i < 10; i++) {
    const a = R.range(0, TAU), sp = R.range(10, 30);
    grit.push({ x0: R.range(-4, 4), z0: R.range(-3, 3), vx: Math.cos(a) * sp, vz: Math.sin(a) * sp * 0.7, vh: R.range(8, 26), tb: SINK - 0.04 });
  }
  // converging streaks while it charges
  const charges = [];
  for (let i = 0; i < 14; i++) {
    const a = R.range(0, TAU), d = R.range(20, 40);
    charges.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, d, tb: R.range(GROW + 0.02, PUFF - 0.06), life: R.range(0.16, 0.3) });
  }

  return {
    t: 0,
    update(dt) { this.t += dt; },
    drawBack(p) { back(p, this.t, K, Cs, Sm, seed, lumps, charges); },
    draw(p) { front(p, this.t, K, Cs, Sm, seed, lumps, spores, grit, charges); },
  };
}

// the mushroom's growth: ease out of the ground, then sink back into it at SINK
function grow(t) {
  return ease.outBack(clamp(t / GROW), 1.6) * (1 - ease.inCubic(clamp((t - SINK) / 0.45)));
}
function squash(t) {
  const k = smooth(GROW, PUFF, t);
  if (t < PUFF) {
    const j = Math.sin(t * 70) * 0.04 * k;
    return [1 + 0.28 * k + j, 1 + 0.22 * k - j];
  }
  const e = t - PUFF, sp = Math.exp(-e * 7) * Math.cos(e * 26);
  return [1 + 0.25 * sp, 1 - 0.35 * sp];
}

// ---- the toadstool: upright, as tall as the side view; the cap is a dome seen from above with the gills
// glowing under its near rim, and the stem casts a small shadow on the 2:1 floor
function toadstool(p, K, Cs, Sm, g, sx, sy, glow, sink) {
  const H = 17 * g, cw = 17 * sx * g, ch = 13 * sy * g;
  const base = sink, top = base - H;
  if (g < 0.02) return;
  // stem (a short, thick column) with a frilled ring near the cap
  const sw = Math.max(1.5, 3 + (H / 17) * 1);
  for (let y = Math.round(top + H * 0.22); y <= Math.round(Math.min(0, base)); y++) {
    const w = sw * (0.8 + 0.3 * ((y - top) / Math.max(1, H)));
    for (let x = -Math.round(w); x <= Math.round(w); x++) {
      const q = (x + 0.5 + w) / (2 * w);
      p.px(x, y, Math.abs(x + 0.5) > w - 0.8 ? Sm[1] : q < 0.4 ? Sm[4] : q < 0.7 ? Sm[3] : Sm[2]);
    }
  }
  const ringY = Math.round(top + H * 0.3);
  for (let x = -Math.round(sw * 1.9); x <= Math.round(sw * 1.9); x++) {
    if (Math.abs(x) < sw * 0.8) continue;
    p.px(x, ringY + (Math.abs(x) > sw * 1.4 ? 1 : 0), Sm[2]);
  }
  // gills: a bright crescent under the cap's near rim, lit from below, and the light it throws on the stem
  const gy = Math.round(top + ch * 0.42);
  for (let x = -Math.round(cw * 0.95); x <= Math.round(cw * 0.95); x++) {
    const d = Math.abs(x + 0.5) / Math.max(1, cw), yy = Math.round(gy + (ch * 0.45) * Math.sin(Math.PI * Math.min(1, d * 1.15)));
    if (yy > 0) continue;
    p.px(x, yy, d < 0.25 ? Cs[2] : x & 1 ? Sm[2] : Sm[3]);
    if (glow > 0.05) p.px(x, yy, glow > 0.55 && (x & 1) ? K[7] : K[5]);
  }
  if (glow > 0.03) p.glow(0, gy + 2, cw * 1.5 + 6, K[5], 0.5 * glow);
  // cap: a domed ellipse seen from above, lit from the upper left, its pale spots on the top, the far rim
  // darker and the near rim highlighted where the dome curves away
  const cy = top + ch * 0.42, ry = Math.max(1.6, ch * 0.62);
  p.shade(-Math.round(cw) - 2, Math.round(cy - ry) - 2, Math.round(cw) + 2, Math.round(cy + ry * 0.9) + 2, (x, y, out) => {
    const dx = x / cw, dy = (y - cy) / ry, d2 = dx * dx + dy * dy;
    if (d2 > 1.06) return;
    const lit = clamp(0.48 - dx * 0.55 - dy * 0.5, 0, 1);
    if (d2 > 0.84) { out.c = Cs[2]; out.a = 1; return; }
    let i = dy < -0.15 ? (dx < -0.2 ? 3 : 2) : dy > 0.45 ? 4 : 3;
    if (lit > 0.72) i = 5;
    for (const s of SPOTS) {
      const ex = (dx - s[0]) * cw, ey = (dy - s[1]) * ch;
      if (ex * ex + ey * ey * 1.6 < (s[2] * 0.9) ** 2 * 3) { i = ex < 0 && ey > 0 ? 5 : 4; break; }
    }
    out.c = Cs[clamp(i, 0, 5)];
    out.a = 1;
  });
  // a hot rim light along the upper left of the dome
  for (let a = 2.5; a < 3.9; a += 0.08) {
    const x = Math.round(Math.cos(a) * cw * 0.99), y = Math.round(cy + Math.sin(a) * ry * 0.99);
    if (y > 0) continue;
    p.px(x, y, K[6]);
  }
}

// ---- the burst: gas lumps thrown out in 3-D, the cloud they make, spores drifting down, grit
function lump(p, q, t, K, face) {
  const air = t - q.tb;
  if (air < 0 || air > q.life + 0.4) return;
  const k = Math.min(1, air / q.life), ease2 = 1 - Math.exp(-air * 1.6), e3 = 1 - Math.exp(-air * 1.1);
  const x = q.x0 + q.vx * ease2, z = q.z0 + q.vz * ease2;
  if (z >= 0 !== face > 0) return;
  let h = q.h0 + (q.vh * 0.55 + 6) * (1 - Math.exp(-air * 1.5)) - 7 * air * air;
  if (h < 2) h = 2;
  const r = q.r0 + (q.rmax - q.r0) * e3;
  const y = z * FL - h;
  const fade = smooth(0, 0.08, air) * (1 - smooth(q.life, q.life + 0.4, air)) * (z < 0 ? 0.62 : 1);
  if (fade < 0.03) return;
  const rr = Math.max(1, r * r);
  for (let dy = -Math.round(r); dy <= Math.round(r); dy++) {
    const half = Math.sqrt(Math.max(0, rr - dy * dy));
    for (let dx = -Math.round(half); dx <= Math.round(half); dx++) {
      const f = 1 - (dx * dx + dy * dy) / rr;
      if (f <= 0) continue;
      const lit = clamp(-dx / r * 0.55 - dy / r * 0.55 + 0.25, 0, 1);
      const c = lit > 0.68 ? K[6] : lit > 0.4 ? K[5] : K[4];
      p.blend(x + dx, y + dy, c, (0.58 + 0.38 * f) * fade);
    }
  }
  p.glow(x - r * 0.3, y - r * 0.35, r * 0.9 + 4, K[5], 0.22 * fade * (z < 0 ? 0.5 : 1));
}

function spore(p, q, t, K) {
  const air = t - q.tb;
  if (air < 0 || air > q.life) return;
  const k = air / q.life, e2 = 1 - Math.exp(-air * 2.2);
  const x = q.x0 + q.vx * e2, z = q.z0 + q.vz * e2;
  let h = q.h0 + q.vh * air * 0.5 - 0.5 * 220 * air * air;
  if (h < 0) h = 0;
  const y = z * FL - h;
  const a = smooth(0, 0.1, air) * (1 - smooth(0.75, 1, k));
  if (a < 0.1 || y > 2) return;
  p.dot(x, y, a > 0.6 ? K[6] : K[5], a);
  if (a > 0.4) p.glow(x, y, 3, K[6], 0.25 * a);
}

function chip(p, q, t, C, face) {
  const air = t - q.tb;
  if (air < 0 || air > 0.95) return;
  const x = q.x0 + q.vx * (1 - Math.exp(-air * 3)), z = q.z0 + q.vz * (1 - Math.exp(-air * 3));
  let h = q.vh * air - 0.5 * 900 * air * air;
  if (h < 0) h = 0;
  if (z >= 0 !== face > 0) return;
  p.px(x, z * FL - h, C[4]);
  p.px(x, z * FL - h + 1, C[3]);
}

function back(p, t, K, Cs, Sm, seed, lumps, charges) {
  const g = grow(t);
  // dust ring at its foot while it grows and when it sinks
  const kc = smooth(0.0, GROW * 0.7, t) * (1 - smooth(GROW, PUFF, t));
  if (kc > 0.02) {
    for (let x = -22; x <= 22; x++) p.dot(x, Math.round(0.5 * Math.abs(x) * 0.2), K[4], kc * 0.5 * (1 - Math.abs(x) / 24));
    bandFloor(p, 0, 0, 9 + 3 * kc, 2.5, 0.3 * kc, [K[2], K[3], K[4], K[5]], (a) => Math.sin(a) < 0.2);
  }
  // sparks being drawn into the swelling cap
  for (const c of charges) {
    const u = (t - c.tb) / c.life;
    if (u < 0 || u > 1) continue;
    if (c.z >= 0) continue;
    const r = c.d * (1 - ease.inCubic(u)), x = Math.cos(Math.atan2(c.z, c.x)) * r, z = Math.sin(Math.atan2(c.z, c.x)) * r;
    const y = z * FL - 18 - (1 - u) * 2;
    p.dot(x, y, K[5], 0.55 * Math.sin(Math.PI * u));
  }
  for (const q of lumps) lump(p, q, t, K, -1);
}

function front(p, t, K, Cs, Sm, seed, lumps, spores, grit, charges) {
  const g = grow(t), [sx, sy] = squash(t);
  const glow = t < PUFF ? smooth(GROW, PUFF, t) * (0.75 + 0.25 * Math.sin(t * (20 + 30 * smooth(GROW, PUFF, t)))) : Math.max(0, 1 - (t - PUFF) * 1.5);
  // floor shadow under the stem, in 2:1
  if (g > 0.05) for (let dy = -3; dy <= 3; dy++) for (let dx = -Math.round(7 * g); dx <= Math.round(7 * g); dx++) {
    const d2 = (dx / (7 * g)) ** 2 + (dy / 3) ** 2;
    if (d2 <= 0.35) p.px(dx, dy, K[2]);
    else if (d2 <= 0.8) p.px(dx, dy, K[3]);
    else if (d2 <= 1) p.px(dx, dy, K[4]);
  }
  for (const c of charges) {
    const u = (t - c.tb) / c.life;
    if (u < 0 || u > 1 || c.z < 0) continue;
    const r = c.d * (1 - ease.inCubic(u)), a = 0.55 * Math.sin(Math.PI * u);
    p.dot(Math.cos(Math.atan2(c.z, c.x)) * r, Math.sin(Math.atan2(c.z, c.x)) * r * FL - 18, K[5], a);
  }
  toadstool(p, K, Cs, Sm, g, sx, sy, glow, 0);
  // the puff: one white frame at the burst, then the lumps take over
  const burstK = t >= PUFF ? Math.max(0, 1 - (t - PUFF) / 0.16) : 0;
  if (burstK > 0) {
    sparkle(p, 0, -20, 7 * burstK, WHITE, K[7], 0.8 * burstK);
    p.glow(0, -22, 26, K[6], 0.5 * burstK);
  }
  for (const q of lumps) lump(p, q, t, K, 1);
  for (const q of spores) spore(p, q, t, K);
  for (const q of grit) chip(p, q, t, K, 1);
  // cloud centroid glow once the puff has spread
  if (t > PUFF + 0.1) {
    let cx = 0, cy = 0, n = 0;
    for (const q of lumps) {
      const air = t - q.tb;
      if (air < 0 || air > q.life + 0.3) continue;
      const e2 = 1 - Math.exp(-air * 1.6);
      cx += q.x0 + q.vx * e2; cy += q.z0 * FL - Math.max(2, q.h0 + (q.vh * 0.55 + 6) * (1 - Math.exp(-air * 1.5)) - 7 * air * air); n++;
    }
    if (n > 3) p.glow(cx / n, cy / n, 46, K[5], Math.min(0.3, 0.03 * n));
  }
}
