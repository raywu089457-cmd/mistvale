// Earth spikes for the game's 2:1 isometric camera, cast any of eight ways: nature/earth-spike re-cut as a running
// wave, the way ice/ice-spikes-iso works, because what the game needs is a line of stone thrown across the floor, not
// one spike at a fixed point. The recipe is still the source's - the floor cracks open with light and heaves, faceted
// stone spikes ram up in a burst of chips, grit and dust, then split and crumble to rubble - and so are its palette,
// glow and stone shading; what changed is the shape and the world it happens in:
//   - o.dir 0..7 is the eight ways a character faces on this floor (0 east, along the screen to the right, then a
//     quarter turn at a time toward us: 2 south, straight down the screen; 4 west; 6 north, away from us), or o.aim
//     any way at all (radians on the floor, the same sense). Not `angle`, which every effect takes as a turn of its
//     whole picture, the very thing this camera must never do;
//   - a head races out over the floor from the caster's feet to `reach`, and clusters of spikes punch up behind it
//     live, each leaning into the wave: running toward us the tip comes down the screen, running away it goes up;
//   - every cluster stands two or three shards either side of the path (+-6..14 px across), far to near, so the wave
//     has the width a swept attack needs while still reading as a line lying on this floor;
//   - the scar it leaves is a strip on the floor, so it reads narrow across the screen running left/right and wide
//     running toward or away from us, as anything lying on this floor does: a dark split with glowing seams while the
//     head is near, cooling to broken dirt behind it;
//   - five hand-built silhouettes (needle, broken slab, split point, blunt obelisk, leaning fang) with three hard
//     faces, a bright ridge, stone courses and cracks, so a field of stone is not one repeated cone;
//   - everything thrown flies in 3D along the way it ran and lands at its own depth; the spikes crumble from the tip
//     down, oldest first, and the stumps fade in place - nothing sinks through the floor.
// The caster is the game's own character (at the origin): the effect draws no stand-in. 1 px = 1 sprite px.
//
// The eruption recipe (a line racing ahead, each spike punching up white with a spray of shards, a puff and a glint,
// the ground scarred behind) is adapted from Sprite Fusion's open-source ice
// (https://www.spritefusion.com/pixel-art-vfx/ice), MIT License, Copyright (c) 2026 Hugo Duprez.
import { Particles, Lights, P, Rng, fit, sparkle, clamp, smooth, seg, ease, lerp, rand, noise, TAU, WHITE, GRAVITY, hex, mix } from "../../core/index.js";
import { FLOOR, Fly3 } from "../_iso.js";

export const meta = {
  name: "Earth spikes (iso)",
  desc: "A wave of stone races out over the 2:1 floor (o.dir 0-7): faceted spikes punch up either side of its path, glow, shiver, then crumble from the tip down.",
  tags: ["nature", "earth", "stone", "spike", "ground", "wave", "directional", "8-dir", "attack", "one-shot", "iso", "top-down"],
  size: [480, 300],
  origin: [240, 162],
  duration: 3,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: {
    palette: ["#33291f", "#54422f", "#5f4c38", "#7a644c", "#8b7358", "#ab9174", "#c9ae8c", "#f7efe0"],
    glow: ["#4a1a0c", "#a8401a", "#ff8a2a", "#ffd27a", "#fff4d0"],
    reach: 140,
    height: 62,
    dir: 0,
    seed: 5,
    style: -1,
  },
};

const FL = 0.5;
const START = 0.05, RUN = 0.44;     // the head runs out
const SHIMMER = 0.72;               // a glint runs down the line
const TREMBLE = 1.12;               // they shiver together
const CRUMB = 1.5, CRUMB_RUN = 0.5; // each spike breaks from the tip down, oldest first
const SETTLE = 2.4, END = 2.96;     // the stumps fade where they stand
const HW = 16;                      // the scar strip's half width on the floor, wider than the shard field

// the five silhouettes: height and half-width as shares of the crest, lean as a share of the height, the taper's
// exponent, how broken the outline is, and the one peculiarity each has (a chopped top, a V between two prongs)
const STONE = [
  { h: 1.18, w: 0.5, lean: 0.15, exp: 1.2, jag: 0.3, knob: 0.5 },                                           // needle
  { h: 0.92, w: 0.9, lean: 0.13, exp: 1.0, jag: 0.26, knob: 0.3, flat: 0.8, chop: 0.22 },                  // broken slab
  { h: 1.2, w: 0.66, lean: 0.17, exp: 1.05, jag: 0.27, knob: 0.42, split: 0.5 },                           // split point
  { h: 1.0, w: 0.8, lean: 0.1, exp: 0.9, jag: 0.19, knob: 0.34, flat: 0.86 },                            // blunt obelisk
  { h: 1.1, w: 0.56, lean: 0.16, exp: 1.0, jag: 0.34, knob: 0.46, bend: 1 },                               // leaning fang
];

// a faceted stone chip at (x, y) on the screen, s across, turned by a: lit from the upper left, a dark rim, and the
// odd pit and glint. cap keeps small chips from reading as white speckle.
function chip(p, x, y, s, a, seed, S, fade = 1, cap = 6) {
  if (s < 0.9 || fade <= 0) return;
  // small debris is a stone pebble with a lit top and a shaded underside, never a single saturated pixel
  if (s < 2.2) {
    const X = Math.round(x), Y = Math.round(y);
    p.px(X, Y, S[5]);
    p.px(X + 1, Y + 1, S[3]);
    if (s > 1.8) p.px(X + 1, Y, S[4]);
    return;
  }
  const rr = Math.ceil(s * 1.45) + 1, ca = Math.cos(a), sa = Math.sin(a), LX = -0.6, LY = -0.8;
  // the outline and its facet jogs are sampled once per 12 angles, not per pixel: the same stone for far less work
  const NA = 12, rad = new Array(NA), jog = new Array(NA);
  for (let i = 0; i < NA; i++) {
    const an = (i / NA) * TAU;
    rad[i] = 1 + 0.16 * noise(an * 2.4 + seed, seed * 0.7) + 0.1 * noise(an * 5.3, seed + 1);
    jog[i] = rand(i, seed + 2) - 0.5;
  }
  p.shade(x - rr, y - rr, x + rr, y + rr, (px, py, out) => {
    const dx = px + 0.5 - x, dy = py + 0.5 - y;
    const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
    const d = Math.hypot(u / 1.05, v / 0.94);
    if (d > s * 1.2) return;
    if (fade < 1 && rand(px + 31, py + 17, seed + 5) > fade) return;
    const dot = (dx * LX + dy * LY) / Math.max(1, s);
    let ai = 0, r = s * 1.4;
    if (d > s * 0.55) {                                    // only near the outline can the jogs be seen
      const ang = Math.atan2(v, u);
      ai = (((ang + TAU * 3) % TAU) * (NA / TAU)) | 0;
      r = s * rad[ai];
      if (d > r + 1) return;
      if (d > r) { out.c = S[2]; out.a = 1; return; }       // the rim: one shade down, never a black outline
    }
    let i = dot > 0.45 ? cap : dot > 0.1 ? cap - 1 : dot > -0.3 ? 4 : 3;
    const j = jog[ai];
    i = clamp(i + (j > 0.24 ? 1 : j < -0.26 ? -1 : 0), 2, cap);
    if (d > r - 1) i = dot > 0 ? cap : 2;
    out.c = S[i];
    out.a = 1;
  });
}

// a soft shadow on the floor, composited with p.blend so it stays smooth: no ordered dither, no black specks
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

export function create(o) {
  const S = fit(o.palette, 8), G = fit(o.glow, 5), R = new Rng(o.seed), REACH = o.reach, H = o.height, SD = o.seed * 17 + 3;
  const th = o.aim ?? ((((Math.round(o.dir ?? 0) % 8) + 8) % 8) * Math.PI) / 4;
  const DX = Math.cos(th), DZ = Math.sin(th), AX = -DZ, AZ = DX;   // along its path over the floor, and across it
  const DUST = mix(S[6], hex("#b4aeba"), 0.4), DUST2 = mix(S[5], hex("#a29caa"), 0.4);
  const ps = new Particles({ rng: R, ground: () => Infinity, sparks: [G[4], G[3], G[2], G[1]], haze: G[2] });
  const fly = new Fly3({ rng: R, sparks: [G[4], G[3], G[2], G[1]] });
  const lights = new Lights();
  // a floor point s along the path and u across it: where it is (x, z), and on screen at height h
  const wx = (s, u) => s * DX + u * AX, wz = (s, u) => s * DZ + u * AZ;
  const front = (tt) => REACH * (1 - Math.pow(1 - seg(tt, START, START + RUN), 1.7));
  const reachedAt = (s) => START + RUN * (1 - Math.pow(1 - clamp(s / REACH), 1 / 1.7));
  const env = (q) => 0.48 + 0.52 * Math.exp(-(((q - 0.62) / 0.32) ** 2));  // heights swell to a crest past the middle
  const away = Math.abs(AZ) > 0.2 ? -Math.sign(AZ) : 1;                   // which side of the path lies away from us
  const LAT = 1 + 0.5 * Math.abs(DZ);                                     // across-path throw grows on the screen axis
  const WID = HW * (1 + 0.85 * Math.abs(DZ));                             // and so does the scar strip's width

  // ---- the clusters: a main shard on the path, one or two smaller ones offset across it, each its own silhouette
  const clusters = [], blades = [];
  const mk = (cs, u, h, hw, style, extra) => {
    const st = STONE[style];
    const b = {
      s: cs, u, h, hw, style, lean: h * st.lean * R.range(0.7, 1.25),
      x: wx(cs, u), z: wz(cs, u),
      look: { ph: R.range(0, TAU), sd: R.range(1, 9), bed: R.range(8.5, 11.5), knobs: [R.range(0.2, 0.36), R.range(0.46, 0.64), R.range(0.72, 0.9)] },
      t0: 0, delay: 0, topLast: 1, cut: R.range(0.24, 0.34), main: false, ...extra,
    };
    // the silhouette, sampled once: half width in pixels at 65 steps up the shard (no noise in the per-pixel loop)
    const pf = new Float32Array(65);
    for (let i = 0; i <= 64; i++) {
      const uu = i / 64;
      let w = Math.pow(Math.max(0, 1 - uu), st.exp);
      w *= 1 + st.jag * noise(uu * 5.4 + b.look.ph, b.look.sd);
      // tips break into points rather than towers: extra jag and a sharper taper over the top third
      if (uu > 0.6) w *= 1 + (0.55 * st.jag + 0.14) * noise(uu * 9.5 + b.look.ph * 1.7, b.look.sd + 4);
      if (uu > 0.7) w *= 1 - 0.82 * ((uu - 0.7) / 0.3);
      if (uu < 0.06) w *= 1.15;                                 // the foot spreads a little into the broken floor
      if (uu < 0.66) for (const k of b.look.knobs) if (uu > k - 0.045 && uu < k + 0.05) w *= 1.1;
      pf[i] = Math.max(0.34, w) * hw;
    }
    b.pf = pf;
    // each stone course shades a little differently: precomputed, so the per-pixel loop has no hash calls
    b.bands = new Int8Array(24);
    for (let i = 0; i < 24; i++) b.bands[i] = R.chance(0.32) ? 1 : R.chance(0.36) ? -1 : 0;
    return b;
  };
  // a strip of broken ground, not a line: the shards are thrown either side of the path. When the wave runs toward
  // or away from the camera the throw has to be wider, because a straight line down the screen would stack every
  // shard into one pile; a couple of small shards behind the caster give that pile depth.
  if (Math.abs(DZ) > 0.55)
    for (const sb of [-7, -3]) {
      const style = o.style >= 0 ? o.style : R.int(0, 4), hh = clamp(H * 0.2 * R.range(0.8, 1.25), 5, 15);
      const b = mk(sb, R.range(-15, 15) * LAT, hh, clamp(hh * 0.36, 2.6, 5.2), style, {});
      b.t0 = START + 0.03 + R.range(0, 0.03);
      b.crum = CRUMB + 0.04;
      blades.push(b);
      clusters.push({ s: sb, q: 0, list: [b], main: b, t0: b.t0, up: false, crum: b.crum });
    }
  let ci = 0;
  for (let s = 10; s < REACH - 4; s += R.range(15, 20)) {
    if (R.chance(0.05)) continue;                                // some stretches are skipped, so it is a wave
    const q = s / REACH, H0 = H * env(q) * R.range(0.88, 1.08);
    const style = o.style >= 0 ? o.style : R.int(0, 4);
    // short-tall-short down the line: the eye reads separate bursts instead of one fence
    const alt = (ci % 2 ? 0.76 : 1.18) * R.range(0.94, 1.08);
    const mainH = clamp(H0 * STONE[style].h * alt, 6, 50), mainW = clamp(H0 * 0.26 * STONE[style].w * R.range(0.88, 1.1), 3, 11);
    const side = R.sign(), oneSide = R.chance(0.42);
    const uA = side * R.range(8, 19) * LAT, uB = (oneSide ? side : -side) * R.range(9, 19) * LAT;
    const list = [mk(s, R.range(-3, 3) * LAT, mainH, mainW, style, { main: true })];
    list.push(mk(s + R.range(-4, 4), uA, mainH * R.range(0.44, 0.76), mainW * R.range(0.64, 0.9), R.chance(0.5) ? style : R.int(0, 4), { delay: R.range(0.02, 0.05) }));
    if (mainH > 20) list.push(mk(s + R.range(-7, 7), uB, mainH * R.range(0.26, 0.5), mainW * R.range(0.5, 0.72), R.chance(0.5) ? R.int(0, 4) : style, { delay: R.range(0.04, 0.09) }));
    if (mainH > 24) list.push(mk(s + R.range(-9, 9), (oneSide ? -side : side) * R.range(10, 18) * LAT, mainH * R.range(0.2, 0.38), mainW * R.range(0.4, 0.62), R.int(0, 4), { delay: R.range(0.06, 0.11) }));
    for (const b of list) {
      b.t0 = reachedAt(Math.max(0, b.s)) + 0.012 + b.delay;
      b.crum = CRUMB + clamp(b.s / REACH) * CRUMB_RUN + R.range(0, 0.06);   // oldest first, down the line
    }
    // keep a clear break between neighbouring shards: a 1-2 px sliver of sky between two bright pieces reads as dirt
    for (let i = 1; i < list.length; i++) {
      const pa = list[i - 1], nb = list[i];
      const gap = Math.abs(nb.s - pa.s) - (pa.hw + nb.hw) * 0.5;
      if (gap > 0 && gap < 4.5) {
        nb.s = pa.s + (Math.sign(nb.s - pa.s) || 1) * ((pa.hw + nb.hw) * 0.5 + 4.5);
        nb.x = wx(nb.s, nb.u);
        nb.z = wz(nb.s, nb.u);
      }
    }
    clusters.push({ s, q, list, main: list[0], t0: reachedAt(s) + 0.012, up: false, crum: CRUMB + clamp(q) * CRUMB_RUN + R.range(0, 0.05) });
    blades.push(...list);
    ci++;
  }
  blades.sort((a, b) => a.z - b.z);                              // far to near
  const crest = clusters.reduce((a, c) => (c.main.h > a.main.h ? c : a), clusters[0]);
  const ofCluster = (c) => [wx(c.s, 0), wz(c.s, 0)];

  let t = 0;
  // the top cuts down from the tip: fast at first, then the stump goes in four hard steps to the ground. It is the
  // stone breaking down, so it shrinks in height; nothing ever moves below the floor line.
  const topOf = (b) => {
    const t1 = t - b.crum;
    if (t1 <= 0) return 1;
    if (t1 < 0.5) return 1 - ease.inQuad(t1 / 0.5) * (1 - b.cut);
    const st = t1 < 0.62 ? 0.74 : t1 < 0.74 ? 0.44 : t1 < 0.86 ? 0.18 : 0;
    return b.cut * st;
  };
  // a chip or a chunk thrown into the air from a point up a shard, to land and rest at its own depth
  const launch = (x, z, h, vx, vz, vh, life, size) => fly.spawn(P.MOTE, x, z, h, vx, vz, vh, Math.min(life, meta.duration - 0.12 - t), 0, size, { g: 1, drag: 0.4, bounce: 0.3 });

  // a shard punches up out of the ground: chips, grit, dust and light
  function erupt(b) {
    const k = clamp(b.h / H, 0.25, 1.2);
    lights.add(b.x, b.z * FL - b.h * 0.35, 20 + b.h * 0.5, WHITE, 0.22 + 0.18 * k, 0.12);
    lights.add(b.x, b.z * FL - 3, 18 + 24 * k, G[2], 0.14 + 0.12 * k, 0.5);
    for (let i = 0; i < Math.round(1.6 * k) + 1; i++) {
      const a = R.range(0, TAU), sp = R.range(40, 130) * (0.6 + 0.4 * k);
      launch(b.x + R.range(-b.hw * 0.5, b.hw * 0.5), b.z + R.range(-2, 2), R.range(1, 5), Math.cos(a) * sp, Math.sin(a) * sp, R.range(28, 88), R.range(1.2, 1.9), R.range(2.4, 3.8) * (0.7 + 0.3 * k));
    }
    for (let i = 0; i < Math.round(4 * k) + 1; i++) {
      const a = R.range(0, TAU), sp = R.range(50, 170) * (1 - 0.3 * Math.abs(Math.sin(a)));
      fly.spawn(P.GRIT, b.x + Math.cos(a) * R.range(0, b.hw * 0.6), b.z + Math.sin(a) * R.range(0, b.hw * 0.6), R.range(0, 4), Math.cos(a) * sp, Math.sin(a) * sp, R.range(60, 170), R.range(0.9, 1.8), S[5], R.range(2.2, 3.2));
    }
    for (let i = 0; i < 1; i++) {
      const a = R.range(0, TAU), sp = R.range(120, 300);
      fly.spawn(P.SPARK, b.x, b.z, R.range(2, 10), Math.cos(a) * sp, Math.sin(a) * sp, R.range(110, 240), R.range(0.12, 0.28), 0, 1, { drag: 2.2 });
    }
    // dust: a low skirt rolling out over the floor and a thin puff climbing off the break
    for (let i = 0; i < Math.round(4 * k) + 2; i++) {
      const a = R.range(0, TAU), v = R.range(40, 130) * (0.5 + 0.5 * k);
//      ps.spawn(P.SMOKE, b.x + Math.cos(a) * R.range(2, 8), b.z * FL + Math.sin(a) * R.range(2, 8) * FL - R.range(0, 2), Math.cos(a) * v, Math.sin(a) * v * FL - R.range(0.2, 1.6), R.range(0.5, 0.9), R.chance(0.5) ? DUST : DUST2, R.range(2.6, 4.2) * (0.7 + 0.3 * k));
    }
    for (let i = 0; i < Math.round(9 * k) + 3; i++) {
      const a = R.range(0, TAU), v = R.range(40, 150);
      ps.spawn(P.DUST, b.x + Math.cos(a) * R.range(0, 8), b.z * FL + Math.sin(a) * R.range(0, 8) * FL - R.range(0, 3), Math.cos(a) * v, Math.sin(a) * v * FL - R.range(0, 5), R.range(0.35, 0.8), R.chance(0.5) ? DUST : DUST2, R.range(1.5, 2.8));
    }
    if (b.main) {
      ps.spawn(P.STAR, b.x + R.range(-4, 4), b.z * FL - R.range(8, b.h * 0.9), 0, -3, R.range(0.22, 0.42), S[7], R.range(1, 2));
      if (b.h > 26) ps.spawn(P.VAPOUR, b.x, b.z * FL - R.range(4, 12), R.range(-10, 10), -R.range(6, 16), R.range(0.5, 0.9), DUST, R.range(2.4, 3.8));
    }
  }

  // a band of a shard, u0..u1, breaks off into rubble that drops and tumbles out over the floor
  function chipBand(b, u1) {
    const u0 = Math.max(b.cut, u1 - 0.1);
    if (u1 <= b.cut + 0.01) return;
    const lean = b.lean, cx = b.x + lean * Math.pow((u0 + u1) / 2, STONE[b.style].bend ? 1.65 : 1);
    launch(cx, b.z + R.range(-2, 2), ((u0 + u1) / 2) * b.h, R.range(-22, 22), R.range(-20, 20), R.range(15, 55), R.range(0.8, 1.3), clamp(b.hw * 0.55, 2.2, 4.2));
    for (let i = 0; i < 2; i++)
      fly.spawn(P.GRIT, cx + R.range(-2, 2), b.z + R.range(-2, 2), u0 * b.h + R.range(-2, 2), R.range(-30, 30), R.range(-25, 25), -R.range(10, 60), R.range(0.7, 1.3), S[4], R.range(1.6, 2.4));
    if (R.chance(0.4)) ps.spawn(P.DUST, cx, b.z * FL - u1 * b.h, R.sign() * R.range(12, 34), R.range(6, 26), R.range(0.3, 0.5), DUST, R.range(1.4, 2.4));
  }

  return {
    update(dt) {
      t += dt;
      // the cast: the floor trembles and puffs of dust jump out where the wave begins
      if (t - dt <= START && t > START) {
        lights.add(wx(4, 0), wz(4, 0) * FL - 2, 12, G[2], 0.45, 0.3);
        for (let i = 0; i < 5; i++) {
          const a = R.range(0, TAU);
          ps.spawn(P.DUST, wx(R.range(0, 8), R.range(-3, 3)), wz(R.range(4, 8), 0) * FL - R.range(0, 2), Math.cos(a) * R.range(10, 40), Math.sin(a) * R.range(10, 40) * FL - R.range(2, 8), R.range(0.4, 0.7), DUST2, R.range(1.6, 2.6));
        }
      }
      // the running head: grit kicked ahead, a thin dust trail, sparks where the stone splits
      const fr = front(t);
      if (t > START && fr < REACH - 1) {
        const hx = wx(fr, 0), hz = wz(fr, 0);
        if (R.chance(0.5)) fly.spawn(P.GRIT, hx + R.range(-3, 3), hz + R.range(-3, 3), R.range(0, 3), DX * R.range(20, 60), DZ * R.range(20, 60), R.range(20, 90), R.range(0.3, 0.7), S[4], R.range(1.5, 2.2));
        if (R.chance(0.4)) ps.spawn(P.DUST, hx, hz * FL - R.range(0, 3), DX * R.range(-10, 30), DZ * R.range(-10, 30) * FL - R.range(1, 6), R.range(0.3, 0.6), DUST2, R.range(1.4, 2.4));
        if (R.chance(0.14)) {
          const a = R.range(0, TAU), sp = R.range(60, 150);
          fly.spawn(P.SPARK, hx, hz, 1, Math.cos(a) * sp, Math.sin(a) * sp, R.range(70, 160), R.range(0.1, 0.22), 0, 1, { drag: 2.4 });
        }
      }
      for (const c of clusters) {
        if (c.up || t < c.t0) continue;
        c.up = true;
        for (const b of c.list) erupt(b);
        if (c === crest) {
          const [cx, cz] = ofCluster(c);
          lights.add(cx, cz * FL - c.main.h * 0.5, 48, WHITE, 0.4, 0.14);
          for (let i = 0; i < 4; i++) {
            const a = R.range(0, TAU), v = R.range(20, 80);
            ps.spawn(P.VAPOUR, cx + R.range(-6, 6), cz * FL - R.range(0, 6), Math.cos(a) * v, Math.sin(a) * v * FL - R.range(4, 16), R.range(0.5, 0.9), DUST, R.range(2.6, 4));
          }
        }
      }
      // while they stand: glints wink on the stone, dust keeps sifting out of the split at their feet
      if (t > START + RUN && t < TREMBLE && R.chance(0.1) && blades.length) {
        const b = R.pick(blades), g = clamp((t - b.t0) / 0.1), u = R.range(0.3, 0.92);
        ps.spawn(P.STAR, b.x + b.lean * u, b.z * FL - u * b.h * g, 0, -3, R.range(0.2, 0.42), R.chance(0.6) ? S[7] : G[3], R.range(0.6, 1.8));
      }
      if (t > START + RUN && t < CRUMB + 0.4 && R.chance(0.14 * Math.min(1, dt * 120))) {
        const b = R.pick(blades);
        if (t > b.t0) fly.spawn(P.GRIT, b.x + R.range(-b.hw, b.hw), b.z + R.range(-2, 2), R.range(0, 2), R.range(-12, 12), R.range(-12, 12), R.range(20, 60), R.range(0.3, 0.7), S[4], R.range(1.5, 2.2));
      }
      // the shiver: chips fall off every spike
      if (t - dt < TREMBLE && t >= TREMBLE) {
        for (const b of blades) {
          if (t < b.t0) continue;
          fly.spawn(P.GRIT, b.x + R.range(-b.hw, b.hw), b.z + R.range(-2, 2), R.range(4, b.h * 0.8), R.range(-16, 16), R.range(-16, 16), R.range(0, 30), R.range(0.3, 0.6), S[4], R.range(1.5, 2.2));
        }
      }
      // the crumble: oldest first, each from the tip down, dropping its bands as rubble
      for (const b of blades) {
        if (t < b.crum) continue;
        const top = topOf(b);
        let guard = 0;
        while (b.topLast - top > 0.085 && guard++ < 8) {
          chipBand(b, b.topLast);
          b.topLast -= 0.085;
        }
        if (b.main && t < b.crum + 0.2 && R.chance(0.3)) {
          lights.add(b.x, b.z * FL - b.h * 0.4, 24, G[2], 0.18, 0.2);
        }
      }
      fly.update(dt);
      for (const q of fly.list)
        if (q.rest && !q.dusted) {
          q.dusted = true;
          if (R.chance(0.5)) ps.spawn(P.DUST, q.x + R.range(-1.5, 1.5), q.z * FL - 0.5, R.sign() * R.range(6, 24), -R.range(2, 10), R.range(0.3, 0.5), DUST2, R.range(1.2, 2));
        }
      ps.update(dt);
      lights.update(dt);
      const left = Math.max(0.001, meta.duration - 0.05 - t);
      fly.cap(left);
      for (const q of ps.list) if (q.life > left) q.life = left;
    },
    drawBack(p) {
      strip(p);
      berm(p);
      for (const b of blades) if (b.z < 0) drawShard(p, b);
      flying(p, false);
      ps.draw(p, "back");
    },
    draw(p) {
      for (const b of blades) if (b.z >= 0) drawShard(p, b);
      // the light the broken ground gives off, running along the path behind the head
      const k = (1 - smooth(SETTLE, SETTLE + 0.5, t)) * smooth(START, START + 0.25, t), fr = front(t);
      if (k > 0)
        for (let i = 0; i < 6; i++) {
          const s = (Math.min(fr, REACH) * (i + 0.5)) / 6;
          if (k > 0.01) p.light(wx(s, 0), wz(s, 0) * FL, G[2], 0.1 * k);
        }
      if (t > START && fr < REACH) {
        const hx = wx(fr, 0), hy = wz(fr, 0) * FL;
        p.glow(hx, hy - 1, 15, G[3], 0.4);
        p.glow(hx, hy - 1, 6, G[4], 0.45);
        p.px(hx, hy - 1, G[4]);
        p.px(hx, hy - 2, G[3]);
      }
      // the crest, while it is up, catches the eye: a glint runs down the line once
      if (t > SHIMMER && t < SHIMMER + 0.5) {
        const gl = (t - SHIMMER) / 0.5;
        for (const b of blades) {
          if (Math.abs(b.s / REACH - gl) > 0.08) continue;
          const g = clamp((t - b.t0) / 0.1);
          p.px(b.x + b.lean * 0.7, b.z * FL - b.h * g * 0.7, S[7]);
        }
      }
      flying(p, true);
      ps.draw(p, "front");
      // the hero frame: a flare where the crest breaks through
      const m = crest.main, e = t - m.t0;
      if (e > 0 && e < 0.22) {
        const g = ease.outBack(clamp(e / 0.1), 2.2);
        sparkle(p, m.x + m.lean, m.z * FL - m.h * g, 8 * (1 - e / 0.22), S[7], G[3], 0.5);
      }
      lights.draw(p);
    },
  };

  // the ground heaves up behind the wave: a low bank of broken soil on the far side of the scar, so the spike field
  // reads as one mass of riven earth instead of bright shapes with sky showing between their feet
  function berm(p) {
    const fr = Math.min(front(t), REACH);
    if (fr < 2) return;
    const k = smooth(START, START + 0.15, t) * (1 - smooth(SETTLE - 0.3, END, t));
    if (k <= 0.03) return;
    for (let s = -8; s <= fr + 8; s += 1) {
      const hh =
        (4 + 8 * (0.4 + 0.6 * Math.abs(noise(s * 0.13, SD + 2)))) *
        k * smooth(-8, 10, s) * smooth(fr + 9, fr - 3, s);
      if (hh < 1.2) continue;
      const x = Math.round(wx(s, -WID * 0.9)), zs = wz(s, -WID * 0.9);
      const y0 = Math.round(zs * FL);
      for (let h = 1; h <= hh; h++) {
        p.px(x, y0 - h, h > hh - 1.2 ? S[4] : h > hh * 0.4 ? S[2] : S[1]);
      }
    }
  }

  // ---- the scar: a strip lying on the floor along the path, split open with light while the head is near, cooling to
  // broken dirt behind it; its sides are ragged and the side toward the camera keeps a lit lip
  function strip(p) {
    if (t <= START) return;
    const fr = front(t);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const s of [-12, Math.min(fr + 16, REACH + 16) + 8])
      for (const u of [-WID * 2, WID * 2]) {
        const x = wx(s, u), y = wz(s, u) * FL;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    x0 = Math.floor(x0) - 2; x1 = Math.ceil(x1) + 2; y0 = Math.floor(y0) - 2; y1 = Math.ceil(y1) + 2;
    const fade = 1 - smooth(SETTLE - 0.3, END - 0.06, t);
    p.shade(x0, y0, x1, y1, (px, py, out) => {
      const fx = px + 0.5, fz = (py + 0.5) / FL;
      const s = fx * DX + fz * DZ, u = fx * AX + fz * AZ;
      // the crack runs a little ahead of the head, so the line the stone is pushing along is visible before it erupts
      if (s < -9 || s > fr + 16 || s > REACH + 18) return;
      const q = clamp(s / REACH);
      const lead = s > fr ? 1 - (s - fr) / 16 : 0;                 // the leading crack tapers out ahead of the head
      const hw = (WID * (1 - 0.28 * q) * (1 + 0.26 * noise(s * 0.085, SD)) + (s < -9 ? s + 9 : 0)) * (1 - 0.45 * lead);
      if (hw <= 0.6) return;
      const e = Math.abs(u) / hw;
      if (e > 1) return;
      const age = t - reachedAt(clamp(s, 0, REACH));
      if (fade < 1 && rand((px >> 2) + 7, (py >> 2) + 11, SD + 7) > fade) return;
      const near = u * AZ > 0, far = !near && Math.abs(AZ) > 0.2;   // the side toward the camera keeps a lit lip
      const deep = Math.abs(DZ) > 0.55;                             // on the screen axis the trench carries the read
      const hot = clamp(1 - age / 0.2);
      // seams: jagged cracks running through the split, glowing while the ground is hot
      if (rand(Math.floor(s * 0.4) + 7, Math.floor((u + 40) * 0.55) + 3, SD + 3) < 0.13) {
        out.c = hot > 0.5 ? G[4] : hot > 0.2 ? G[3] : hot > 0.05 ? G[2] : far ? S[2] : S[1];
        out.a = 1;
        return;
      }
      const lump = noise(Math.floor(s * 0.5) * 0.8, Math.floor((u + 40) * 0.8) * 0.8, SD + 9);
      // a hot seam runs down the split while the head is on it
      if (e < 0.2 && hot > 0.06) { out.c = hot > 0.6 ? G[4] : hot > 0.3 ? G[3] : G[2]; out.a = 1; return; }
      if (e < 0.55) {
        // the split and the dirt slumped into it
        if (lead > 0 && e > 0.5) return;                            // ahead of the head only the thin crack shows
      } else if (e < 0.82) {
        // clods thrown out either side, ragged enough to read as broken ground
        if (lump < -0.36) return;
        out.c = lump > 0.3 ? S[3] : S[2];
      } else {
        // only the camera side keeps a lit lip
        if (!near || lump < 0.04) return;
        out.c = deep ? S[5] : S[4];
      }
      out.a = 1;
    });
  }

  // ---- a spike, far to near: three hard faces lit from the upper left, a bright ridge, stone courses, cracks that
  // glow while it is hot, a white blink as it breaks through, and (once it starts to go) a top that recedes
  function drawShard(p, b) {
    if (t < b.t0) return;
    const g = ease.outBack(clamp((t - b.t0) / 0.1), 2.2);
    if (g <= 0.001) return;
    const top = topOf(b);
    if (top <= 0.006) return;
    // a shard further down the screen is nearer us, so it stands a little taller: the wave keeps its scale when it
    // runs toward or away from the camera and would otherwise collapse into one column
    const pk = 1 + clamp(b.z / (REACH * 1.6), -0.6, 0.6) * 0.42;
    const st = STONE[b.style], h = b.h * g * pk, lean = b.lean * g;
    if (h < 1.5) return;
    const jx = t >= TREMBLE && t < TREMBLE + 0.18 ? (((Math.floor(t * 46) + Math.round(b.s)) % 2) ? 1 : -1) : 0;
    const bx = Math.round(b.x + jx), by = Math.round(b.z * FL);
    const curve = st.bend ? 1.25 : 1;
    const lx = lean * DX, ly = lean * DZ * FL;              // the tip leans along the way the wave ran
    const hEff = Math.max(6, h - ly);
    const cxOf = curve === 1 ? (u) => bx + lx * Math.max(0, u) : (u) => bx + lx * Math.pow(Math.max(0, u), curve);
    const white = t - b.t0 < 0.1, hot = 1 - smooth(b.t0 + 0.1, b.t0 + 0.6, t);   // white heat only for the first blink
    const farSide = (Math.abs(AZ) > 0.25 && b.u * AZ < -1.5) || (Math.abs(DZ) > 0.55 && b.z < -10);  // far side / receding
    const x0 = Math.floor(bx + Math.min(0, lx) - b.hw * pk - 2), x1 = Math.ceil(bx + Math.max(0, lx) + b.hw * pk + 2);
    const y0 = Math.floor(by - hEff - 2), y1 = Math.ceil(by + 2);
    p.shade(x0, y0, x1, y1, (px, py, out) => {
      const u = (by - (py + 0.5)) / hEff;
      if (u < 0 || u > top) return;
      const hw = b.pf[Math.min(64, (u * 64) | 0)] * pk;
      if (hw < 0.5) return;
      const cx = cxOf(u), q = (px + 0.5 - cx) / hw;
      if (Math.abs(q) > 1) return;
      if (st.split && u > st.split) { const k = (u - st.split) / (1 - st.split); if (Math.abs(q) < k * 1.2) return; }   // the V between two prongs
      if (st.flat && u > st.flat) return;                                                                              // a chopped top
      if (st.chop && u > st.chop && Math.abs(q - 0.34) < 0.16) return;                                                 // a bite out of the slab
      if (white && u > 0.72) { out.c = S[7]; out.a = 1; return; }
      const bed = Math.floor((by - py) / b.look.bed), bl = (by - py) % b.look.bed;
      let i = q < -0.12 ? 5 : q < 0.42 ? 4 : 2;                 // a wide lit left face, a flat front, a dark right face
      i += b.bands[bed & 23];
      if (q > -0.2 && q < -0.06) i = 6;                        // the bright ridge along the arris
      if (q > 0.42 && q < 0.52) i = 3;                         // the crease between the faces
      if (bl < 1.2) i = Math.min(i, 3);                        // a stone course
      if (q < -0.88) i = 5;                                    // lit left edge
      if (q > 0.86) i = 2;                                     // a rim lighter than the shaded face, never a black outline
      if (hot > 0.28) i = Math.min(6, i + 1);                  // hot from its own eruption light
      if (u > 0.94) i = 6;                                     // the point catches the light
      if (u < 0.06) i = Math.min(i, 3);                        // darker where it comes out of the ground
      if (farSide) i = Math.max(2, i - 1);
      out.c = S[clamp(i, 0, 7)];
      out.a = 1;
    });
    if (hot > 0.05) p.glowLine(bx, by - 1, cxOf(Math.min(top, 0.7)), by - Math.min(top, 0.7) * hEff, 9, G[3], 0.1 * hot);
    // the cracks down the stone: dark seams when cool, glowing while it is hot inside
    if (b.cracks === undefined) {
      b.cracks = [
        { u0: R.range(0.05, 0.14), u1: R.range(0.3, 0.46), q: R.range(-0.6, -0.15), dq: R.range(-0.3, 0.3) },
        { u0: R.range(0.22, 0.4), u1: R.range(0.5, 0.78), q: R.range(0.05, 0.6), dq: R.range(-0.3, 0.3) },
      ];
    }
    for (const c of b.cracks) {
      if (c.u0 > top) continue;
      const u0 = c.u0, u1 = Math.min(top, c.u1), n = Math.max(3, Math.round((u1 - u0) * h * 1.1));
      for (let k = 0; k <= n; k++) {
        const u = lerp(u0, u1, k / n), jj = (rand(k, b.look.sd, 11) - 0.5) * 0.16;
        const q = clamp(c.q + ((u - u0) / Math.max(1e-3, u1 - u0)) * c.dq + jj, -0.9, 0.9);
        const pw = Math.min(64, (u * 64) | 0), pxp = Math.round(cxOf(u) + q * b.pf[pw] * pk), pyp = Math.round(by - u * hEff);
        if (hot > 0.35) {
          p.px(pxp, pyp, hot > 0.7 ? G[4] : G[3]);
          if (k % 4 === 0) p.light(pxp, pyp, G[2], 0.16 * hot);
        } else {
          p.px(pxp, pyp, S[2]);
          if (k % 2 === 0) p.px(pxp + 1, pyp, S[3]);
        }
      }
    }
  }

  // ---- what flies: chips and chunks (faceted stones at their own depth, with a soft shadow) behind the caster
  // first, in front after
  function flying(p, near) {
    fly.draw(p, (q) => (q.z >= 0) === near, (fp) => {
      for (const q of fp.list) {
        const a = q.seed * 6.283 + fly.t * (2.2 + q.seed * 0.02);
        // only throw a shadow where there is floor to catch it: a chip high above the horizon would smear dark over the sky
        if (q.h < 7 && q.z >= 5) blendShadow(p, q.x, q.z * FL, q.size * 0.9, S[4], 0.26);
        chip(p, q.x, q.y, q.size, a, q.seed * 37, S, Math.min(1, q.life / 0.4), 5);
      }
    });
  }
}
