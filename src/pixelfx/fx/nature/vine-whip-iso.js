// Vine whip for the game's 2:1 isometric camera: nature/vine-whip rewritten for the floor the game sees, never its
// picture squashed onto it. The recipe is the source's (a thorny vine bursts up out of the ground, rears back coiled,
// lashes out in a whip crack that sprays sap and tears off leaves, then slides back under, its palette and its 1.4 s
// timing); what changed is the world it happens in:
//
//   - the vine is a body in the air above a point on the floor, not a shape painted on the screen: its pose is the
//     source's, lived in the vertical plane that runs along the lash's floor direction, so its reach lies along the
//     2:1 floor and its height stays height. It rears back behind the root and lashes out toward the camera, and every
//     part of it is drawn behind or in front by its own depth;
//   - the floor has depth: the hole it tears open, the sap it sprays and the ring of dust the crack kicks up are flat
//     2:1 patches and ellipses, their far halves dimmer, and the hole closes as the vine sinks back in;
//   - what it throws flies in three dimensions (x across, z into the floor, h up): sap drops arc out and land at their
//     own depth, rocks and grit bounce where they come down, torn leaves flutter away, all of it sorted by depth;
//   - the smear of the lash is the tip's path on the screen, which is what a smear is on any camera.
// 1 px = 1 character sprite px (32 x 16 px tiles).
// The smear, the glint and the crack burst are adapted from Sprite Fusion's open-source slash
// (https://www.spritefusion.com/pixel-art-vfx/slash), MIT License, Copyright (c) 2026 Hugo Duprez.
import { Rng, fit, sparkle, clamp, smooth, ease, lerp, TAU, WHITE } from "../../core/index.js";
import { FLOOR } from "../_iso.js";

export const meta = {
  name: "Vine whip (iso)",
  desc: "nature/vine-whip on the 2:1 floor: a thorny vine bursts up out of the ground, rears back coiled, then lashes out in a whip crack that sprays sap and leaves before sinking back.",
  tags: ["nature", "vine", "plant", "whip", "melee", "directional", "one-shot", "iso", "top-down", "ground"],
  size: [196, 150],
  origin: [78, 106],
  duration: 1.4,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: {
    palette: ["#0c1a10", "#173a1a", "#24582a", "#357a34", "#52a03e", "#86c84e", "#c4ec7a", "#f4ffd0"],
    thorn: ["#2a1410", "#5e2a1a", "#a04c2e", "#e89a6a"],
    soil: ["#120c0c", "#251917", "#3b2a24", "#553d31", "#715440", "#8f6e52", "#b8966e", "#e6d0a8"],
    seed: 3,
  },
};

const D = meta.duration, FL = FLOOR;
const N = 24, LS = 3.3, LASH = 0.36, LAG = 0.0052, TAU_S = 0.055, OMEGA = TAU / 0.21;
const CRACK = LASH + LAG * N + (Math.PI - Math.atan(OMEGA * TAU_S)) / OMEGA;   // ≈ 0.556 s
const SINK = 1.08;
// the lash's floor direction: out to the right and a little toward the camera, so its reach lies on the 2:1 floor
const A = 0.42, CA = Math.cos(A), SA = Math.sin(A), SLOPE = Math.tan(A) * FL;

// a damped spring's step: 0 before u = 0, swings past 1, settles
const spring = (u) => (u <= 0 ? 0 : 1 - Math.exp(-u / TAU_S) * (Math.cos(OMEGA * u) + Math.sin(OMEGA * u) / (OMEGA * TAU_S)));

// the source's pose: each segment's angle blends from standing, to reared back with the tip coiled over, to lashed
// out right; the lash runs up the vine as a wave, so the tip whips through last. X across the lash's plane, Y up.
function pose(t) {
  const grow = ease.outCubic(clamp(t / 0.14)) * (1 - ease.inCubic(clamp((t - 1.0) / 0.3)));
  const rear = smooth(0.1, LASH, t), relax = smooth(0.82, 1.0, t);
  const pts = [[0, (1 - grow) * (N * LS + 6)]];
  for (let i = 0; i < N; i++) {
    const s = i / N, stand = -Math.PI / 2 + 0.25 * Math.sin(s * 3 + t * 7) * s;
    const back = -Math.PI / 2 - 0.3 - 1.65 * Math.pow(s, 1.3), out = -1.0 + 0.9 * Math.pow(s, 0.6);
    let a = lerp(stand, back, rear);
    a = lerp(a, out, spring(t - LASH - LAG * i));
    a = lerp(a, stand, relax);
    const [x, y] = pts[i];
    pts.push([x + Math.cos(a) * LS, y + Math.sin(a) * LS]);
  }
  return pts;
}
// those points on our camera's screen: [sx, sy, depth z, height h]
function onScreen(pts) {
  const out = [];
  for (const [X, Y] of pts) out.push([CA * X, SA * X * FL + Y, SA * X, -Y]);
  return out;
}
const width = (s) => 1.2 + 4.8 * Math.pow(1 - s, 0.7);
// nothing may be drawn below the floor the vine grows out of: at a screen x the floor sits at this y
const under = (x, y) => y > x * SLOPE + 0.5;

// a small pointed leaf, 5 px: a lit upper half, a shaded lower, a dark rim. pal: [dark, shade, body, light]
function leaf(p, x, y, ang, flip, pal, a) {
  if (a <= 0.02) return;
  const ca = Math.cos(ang), sa = Math.sin(ang), wide = 0.6 + 0.5 * Math.abs(Math.cos(flip));
  for (let i = 0; i < 5; i++) {
    const u = (i + 0.5) / 5, half = wide * Math.sin(Math.PI * u) * 1.25;
    const px = x + ca * (i - 2), py = y + sa * (i - 2);
    if (!under(px, py)) p.dot(px, py, u < 0.45 ? pal[3] : pal[2], a);
    if (half > 0.55) p.dot(px - sa * half, py + ca * half, pal[2], a * 0.85);
  }
}
// a pebble of soil: two or three pixels, its lit corner catching the light
function pebble(p, x, y, s, a, S) {
  if (a <= 0.02) return;
  p.dot(x, y, S[4], a);
  p.dot(x + 1, y, S[2], a * 0.9);
  if (s > 1.7) p.dot(x, y - 1, S[5], a * 0.85);
}

export function create(o) {
  const C = fit(o.palette, 8), T = fit(o.thorn, 4), S = fit(o.soil, 8), R = new Rng(o.seed);
  let t = 0;
  // where the tip is when it cracks, and how fast it is going: the spray leaves from there, that way
  const a0 = pose(CRACK), a1 = pose(CRACK - 0.01);
  const [tx, ty] = a0[N], [px, py] = a1[N];
  const TIP = [CA * tx, SA * tx * FL + ty, SA * tx, -ty];        // screen x, screen y, z, h
  const vX = (tx - px) / 0.01;
  const TIPV = [CA * vX, SA * vX, -(ty - py) / 0.01];
  // sap: a cone of drops thrown on along the lash and up out of it
  const DROPS = Array.from({ length: 18 }, () => {
    const ang = A + R.range(-0.5, 0.5), elev = R.range(-0.05, 0.75), sp = R.range(45, 110);
    const vx = Math.cos(ang) * Math.cos(elev) * sp, vz = Math.sin(ang) * Math.cos(elev) * sp, vh = Math.sin(elev) * sp;
    const land = (vh + Math.sqrt(vh * vh + 1800 * TIP[3])) / 900;   // h = h0 + vh t − 450 t²
    const k = 1 - Math.exp(-2.4 * land);
    return { vx, vz, vh, s: R.chance(0.3) ? 2 : 1, land, lx: TIP[0] + (vx * k) / 2.4, lz: TIP[2] + (vz * k) / 2.4, ph: R.range(0, TAU) };
  });
  // rocks and grit thrown out of the hole as it opens and as it sinks back in
  const CHIPS = [], GRIT = [];
  const dirt = (n, sp, tb) => {
    // nothing thrown after the vine has gone may outlive the effect
    const cap = Math.max(0.12, D - tb - 0.07);
    for (let i = 0; i < n; i++) {
      const ang = R.range(0, TAU), s = R.range(40, 130) * sp, up = R.range(80, 230) * sp;
      CHIPS.push({ tb, x: R.range(-2, 2), z: R.range(-2, 2), h: 1, vx: Math.cos(ang) * s, vz: Math.sin(ang) * s, vh: up, s: R.range(1.4, 2.6), life: Math.min(R.range(0.6, 0.9), cap) });
    }
    for (let i = 0; i < n * 3; i++) {
      const ang = R.range(0, TAU), s = R.range(30, 110) * sp, up = R.range(50, 170) * sp;
      GRIT.push({ tb, x: R.range(-2, 2), z: R.range(-2, 2), h: 1, vx: Math.cos(ang) * s, vz: Math.sin(ang) * s, vh: up, c: R.pick([S[5], S[4], S[3]]), s: R.chance(0.3) ? 2 : 1, life: Math.min(R.range(0.5, 0.9), cap) });
    }
    for (let i = 0; i < n; i++)
      GRIT.push({ tb, dust: true, x: R.range(-3, 3), z: R.range(-3, 3), h: 0, vx: R.sign() * R.range(8, 34), vz: R.sign() * R.range(4, 22), vh: R.range(14, 34), c: S[5], s: R.range(2, 4), life: Math.min(R.range(0.4, 0.8), cap) });
  };
  dirt(6, 1, 0.0);
  dirt(3, 0.5, SINK);
  // leaves torn off the vine by the crack, fluttering away
  const TORN = Array.from({ length: 4 }, () => ({
    vx: TIPV[0] * 0.25 + R.range(-30, 30), vz: TIPV[1] * 0.25 + R.range(-30, 30), vh: R.range(20, 90),
    a: R.range(0, TAU), va: R.range(-12, 12), fl: R.range(0, TAU), vf: R.range(8, 16), life: R.range(0.65, 0.8),
  }));
  // the crack's sparks: a short white burst off the tip, thrown in 3D
  const SPARKS = Array.from({ length: 10 }, () => {
    const ang = R.range(0, TAU), elev = R.range(-0.2, 1.2), sp = R.range(50, 140);
    return { vx: Math.cos(ang) * Math.cos(elev) * sp, vz: Math.sin(ang) * Math.cos(elev) * sp, vh: Math.sin(elev) * sp, life: R.range(0.15, 0.34) };
  });

  // a body thrown in the game's 3D, drag on all three axes and gravity down
  const fly = (x0, z0, h0, vx, vz, vh, age, k, g = 900) => {
    const e = Math.exp(-k * age), f = (1 - e) / k;
    return [x0 + vx * f, z0 + vz * f, h0 + vh * f - 0.5 * g * age * age];
  };

  // ---- the vine itself: a thick stroke lit on its upper side, dark beneath, bark notches ----
  function vine(p, P, back) {
    for (let i = 0; i < N; i++) {
      const [ax, ay, az] = P[i], [bx, by, bz] = P[i + 1];
      if ((az + bz) * 0.5 < 0 !== back) continue;
      const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      const w0 = width(i / N) / 2, w1 = width((i + 1) / N) / 2, up = nx * -0.6 + ny * -0.8 > 0 ? 1 : -1;
      const X0 = Math.floor(Math.min(ax, bx) - 4), X1 = Math.ceil(Math.max(ax, bx) + 4), Y0 = Math.floor(Math.min(ay, by) - 4), Y1 = Math.ceil(Math.max(ay, by) + 4);
      for (let y = Y0; y <= Y1; y++)
        for (let x = X0; x <= X1; x++) {
          if (under(x, y)) continue;
          const px = x + 0.5 - ax, py = y + 0.5 - ay, u = (px * dx + py * dy) / (L * L);
          if (u < -0.15 || u > 1.15) continue;
          const d = px * nx + py * ny, w = lerp(w0, w1, clamp(u)) + 0.35;
          if (Math.abs(d) > w) continue;
          const side = Math.sign(d) * up, q = Math.abs(d) / w, arc = (i + u) * LS;
          let c = q > 0.8 ? (side > 0 ? C[5] : C[2]) : side > 0 ? (q > 0.35 ? C[4] : C[3]) : q > 0.4 ? C[2] : C[3];
          if (w > 1.6 && Math.abs(((arc + d * 0.8) % 5) - 2.5) < 0.45 && q < 0.8) c = C[2];
          p.px(x, y, c);
        }
    }
  }
  // thorns along it, alternating sides, hooked back toward the root; leaves on short stalks
  function thorns(p, P, back) {
    for (let i = 2; i < N - 1; i += 2) {
      const [ax, ay, az] = P[i], [bx, by, bz] = P[i + 1];
      if ((az + bz) * 0.5 < 0 !== back) continue;
      const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, side = (i / 2) % 2 ? 1 : -1;
      const nx = (-dy / L) * side, ny = (dx / L) * side, w = width(i / N) / 2, len = 1.8 + 2.4 * (1 - i / N);
      const x0 = ax + nx * (w - 0.5), y0 = ay + ny * (w - 0.5);
      if (under(x0, y0)) continue;
      const tx = x0 + nx * len - (dx / L) * len * 0.7, ty = y0 + ny * len - (dy / L) * len * 0.7;
      p.tri(x0 - (dx / L) * 1.6, y0 - (dy / L) * 1.6, x0 + (dx / L) * 1.4, y0 + (dy / L) * 1.4, tx, ty, T[1]);
      p.line(x0 + (dx / L) * 0.8, y0 + (dy / L) * 0.8, tx, ty, T[2]);
      p.px(tx, ty, T[3]);
    }
    for (const k of [7, 13, 18]) {
      const [ax, ay, az] = P[k], [bx, by, bz] = P[k + 1];
      if ((az + bz) * 0.5 < 0 !== back || ay > -2) continue;
      const ang = Math.atan2(by - ay, bx - ax), side = k % 2 ? 1 : -1;
      const la = ang + side * 1.1 + Math.sin(t * 9 + k) * 0.2, lx = ax + Math.cos(la) * 4, ly = ay + Math.sin(la) * 4;
      if (!under(lx, ly)) leaf(p, lx, ly, la, 0.3 + Math.sin(t * 5 + k) * 0.4, [C[1], C[3], C[5], C[6]], 1);
    }
  }
  // the smear: a fan of streaks, each the path one point of the outer vine just swept, the tip's white, the ones
  // further in cooling down the ramp, all fading back along their length
  function smear(p, P) {
    if (!(t > LASH + 0.04 && t < CRACK + 0.1)) return;
    const age = clamp((t - CRACK + 0.02) / 0.12), hist = [];
    for (let k = 0; k < 12; k++) hist.push(onScreen(pose(t - k * 0.0045)));
    for (let k = 0; k < 6; k++) {
      const q = [hist[k][N], hist[k + 1][N], hist[k + 1][N - 12], hist[k][N - 12]];
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of q) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y));
      const a = 0.16 * (1 - k / 6) * (1 - age);
      for (let y = Math.floor(y0); y <= Math.ceil(y1); y++)
        for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
          let inside = false;
          for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
            const [xi, yi] = q[i], [xj, yj] = q[j];
            if (yi > y + 0.5 !== yj > y + 0.5 && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) inside = !inside;
          }
          if (inside && !under(x, y)) p.blend(x, y, k < 2 ? C[5] : C[4], a);
        }
    }
    for (let i = N - 12; i <= N; i += 2) {
      const q = (N - i) / 12, col = q < 0.1 ? WHITE : q < 0.3 ? C[7] : q < 0.55 ? C[6] : q < 0.8 ? C[5] : C[4], len = Math.round(11 * (1 - q * 0.6));
      for (let k = 0; k < len; k++)
        p.line(hist[k][i][0], hist[k][i][1], hist[k + 1][i][0], hist[k + 1][i][1], k < 2 && q < 0.1 ? WHITE : col, (1 - age) * (k < len * 0.5 ? 1 : 2 * (1 - k / len)));
    }
    p.glowLine(hist[0][N][0], hist[0][N][1], hist[6][N][0], hist[6][N][1], 14, C[5], 0.35 * (1 - age));
  }

  // ---- the floor: the hole it tears, the sap it leaves, the ring the crack kicks up ----
  function floorMarks(p) {
    const k = 1 - smooth(1.15, 1.35, t);
    if (k > 0) {
      // a hole torn in the 2:1 floor: a dark mouth, a lip of thrown soil round its near side
      for (let y = -4; y <= 4; y++)
        for (let x = -8; x <= 8; x++) {
          const q = (x * x) / 64 + (y * y) / 16;
          if (q > 1) continue;
          p.px(x, y * FL, q > 0.55 ? S[3] : S[1]);
        }
      for (let i = 0; i < 16; i++) {
        const th = (i / 16) * TAU, x = Math.cos(th) * 8.5, z = Math.sin(th) * 4.5;
        p.px(x, z * FL + 1, z < 0 ? S[3] : S[4]);
        if (z >= 0) p.px(x, z * FL + 2, S[4]);
        if (z < 0) p.px(x, z * FL, S[2]);
      }
    }
    // the sap that has landed: a wet spot on the floor where each drop came down
    for (const d of DROPS) {
      const age = t - CRACK - d.land;
      if (age <= 0) continue;
      const a = 0.85 * (1 - smooth(0.2, 0.5, age));
      if (a <= 0.02) continue;
      const c = age < 0.08 ? C[5] : C[3];
      p.dot(d.lx, d.lz * FL, c, a);
      p.dot(d.lx + 1, d.lz * FL, C[4], a * 0.7);
      if (d.s > 1) p.dot(d.lx, d.lz * FL + 1, C[3], a * 0.7);
    }
    // the ring of dust the crack kicks up, flat on the floor under the tip
    const e = t - CRACK;
    if (e > 0 && e < 0.3) {
      const kk = 1 - e / 0.3, rr = 3 + 14 * ease.outCubic(e / 0.3);
      for (let i = 0; i < 30; i++) {
        const th = (i / 30) * TAU, sn = Math.sin(th);
        p.dot(TIP[0] + Math.cos(th) * rr, TIP[2] * FL + sn * rr * FL, sn < 0 ? S[2] : S[4], kk * (sn < 0 ? 0.55 : 0.9));
      }
      if (e < 0.1) {
        for (let i = 0; i < 12; i++) {
          const th = (i / 12) * TAU;
          p.dot(TIP[0] + Math.cos(th) * 4, TIP[2] * FL + Math.sin(th) * 2, C[6], 1 - e / 0.1);
        }
      }
    }
  }

  // ---- what it throws, drawn where its depth puts it ----
  function fliers(p, back) {
    // sap drops: out in 3D, then a spot on the floor at their own depth
    for (const d of DROPS) {
      const age = t - CRACK;
      if (age < 0 || age > d.land) continue;
      const [x, z, h] = fly(TIP[0], TIP[2], TIP[3], d.vx, d.vz, d.vh, age, 2.4);
      if ((z < 0) !== back) continue;
      const sp = Math.hypot(d.vx, d.vz, d.vh) || 1, L = Math.min(4, 1 + sp * 0.012);
      p.line(x - (d.vx / sp) * L, z * FL - h - ((d.vz * FL - d.vh) / sp) * L, x, z * FL - h, C[4], 0.8);
      p.px(x, z * FL - h, C[7]);
      if (d.s > 1) p.px(x - 1, z * FL - h, C[5]);
      p.glow(x, z * FL - h, 3 + d.s, C[5], 0.25);
    }
    // rocks: they tumble out, bounce once and lie where they land
    for (const c of CHIPS) {
      const age = t - c.tb;
      if (age < 0 || age > c.life) continue;
      const [x, z, h] = fly(c.x, c.z, c.h, c.vx, c.vz, c.vh, age, 1.1);
      const down = h <= 0;
      if ((z < 0) !== back) continue;
      if (down) pebble(p, x, z * FL, c.s * 0.8, Math.min(1, (c.life - age) / 0.25), S);
      else pebble(p, x, z * FL - h, c.s, 1, S);
    }
    // grit and the dust of the burst: thrown out, landing at its own depth
    for (const g of GRIT) {
      const age = t - g.tb;
      if (age < 0 || age > g.life) continue;
      const [x, z, h] = fly(g.x, g.z, g.h, g.vx, g.vz, g.vh, age, 1.4);
      if ((z < 0) !== back) continue;
      const k = Math.min(1, (g.life - age) / 0.25);
      if (g.dust) {
        const r = g.s * (1 + 1.6 * (age / g.life));
        p.disc(x, z * FL - Math.max(0, h), r, back ? S[3] : S[5], (d) => 0.38 * k * (1 - d * d));
      } else p.px(x, z * FL - Math.max(0, h), g.c, k);
    }
    // torn leaves, fluttering away
    for (const l of TORN) {
      const age = t - CRACK;
      if (age < 0 || age > l.life) continue;
      const [x, z, h] = fly(TIP[0], TIP[2], TIP[3], l.vx, l.vz, l.vh, age, 2.2, 160);
      if ((z < 0) !== back) continue;
      const a = Math.min(1, (l.life - age) / 0.3);
      leaf(p, x + Math.sin(l.fl + age * l.vf) * 2, z * FL - Math.max(0, h), l.a + age * l.va, l.fl + age * l.vf, [C[1], C[3], C[5], C[6]], a);
    }
    // the sparks of the crack
    for (const s of SPARKS) {
      const age = t - CRACK;
      if (age < 0 || age > s.life) continue;
      const [x, z, h] = fly(TIP[0], TIP[2], TIP[3], s.vx, s.vz, s.vh, age, 1.2, 560);
      if ((z < 0) !== back) continue;
      const k = 1 - age / s.life;
      p.px(x, z * FL - Math.max(0, h), k > 0.5 ? WHITE : C[6], k);
      p.glow(x, z * FL - Math.max(0, h), 3, C[6], 0.3 * k);
    }
  }

  return {
    update(dt) {
      t += dt;
    },
    drawBack(p) {
      if (t >= D) return;
      const P = onScreen(pose(t));
      floorMarks(p);
      vine(p, P, true);
      thorns(p, P, true);
      fliers(p, true);
    },
    draw(p) {
      if (t >= D) return;
      const P = onScreen(pose(t));
      smear(p, P);
      vine(p, P, false);
      thorns(p, P, false);
      const lk = smooth(LASH, CRACK, t) * (1 - smooth(CRACK, CRACK + 0.35, t));
      if (lk > 0) for (let i = 6; i <= N; i += 6) p.glow(P[i][0], P[i][1], 12, C[5], 0.18 * lk);
      // the crack: a white burst of air lines and a glint at the tip
      const e = t - CRACK;
      if (e >= 0 && e < 0.06) {
        // one white frame down the last of the vine: the punch the whole move hangs on
        for (let i = N - 4; i < N; i++) p.line(P[i][0], P[i][1], P[i + 1][0], P[i + 1][1], WHITE);
        p.glow(P[N][0], P[N][1], 16, WHITE, 0.5);
      }
      if (e >= 0 && e < 0.12) {
        const k = 1 - e / 0.12, [x, y] = [TIP[0], TIP[1]];
        for (let j = 0; j < 9; j++) {
          const a = (j / 9) * TAU + 0.3, r0 = 4 + 12 * (1 - k), r1 = r0 + 6 * k;
          p.line(x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r1, y + Math.sin(a) * r1, k > 0.5 ? WHITE : C[6]);
        }
        p.ring(x, y, 3 + 10 * (1 - k), 1, C[7], k);
        sparkle(p, x, y, 9 * k, C[7], C[5], 0.45);
        p.glow(x, y, 26, WHITE, 0.55 * k);
      }
      if (e >= 0 && e < 0.4) p.glow(TIP[0], TIP[1], 50, C[5], 0.35 * (1 - e / 0.4));
      fliers(p, false);
    },
  };
}
