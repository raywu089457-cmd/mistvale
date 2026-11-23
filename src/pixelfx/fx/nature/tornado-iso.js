// Tornado for the game's 2:1 isometric camera: nature/tornado rewritten for the floor the game sees, never its picture
// squashed onto it. The recipe is the source's (a snaking funnel of spinning wind, a torn churning mouth, lightning
// flickering through it, leaves and debris whirling round it front and back, dust boiling at its foot, its two-second
// cycle); what changed is the world it stands in:
//
//   - height stays height: the funnel stands on one point of the floor and is drawn upright, as tall as in the side
//     view (132 px). Its mouth, its crown and the lightning over it are never squashed into the ground;
//   - the floor has depth: the bank of stirred sand under it and the scuff it drags round its foot are flat 2:1
//     ellipses on the floor, pale on their rim so they read as dust, never as a black hole; the dust boiling round its
//     foot is a three-dimensional bank, widest at the ground;
//   - the axis snakes across the screen AND into the floor's depth, so the column leans toward the camera and away
//     from it; its wall, its debris and its dust are drawn behind or in front by their own depth;
//   - the wall is one solid column of dust, 16 to 44 px through: a wide foot, a narrow waist, heavy shoulders and a
//     long flare into a wide torn mouth, ochre on its lit flank turning to brown-grey shade, with broken helical ribs
//     so the turning reads. Its top is thrown open: a ragged lip with the wall's own thickness in it, the far rim
//     catching the light, the near rim dark, around a throat that stays readable rather than a black hole;
//   - the debris flies in three dimensions (x across, z into the floor, h up): leaves, twigs and pebbles skid in
//     across the floor, spiral up outside the wall and are flung off its mouth, landing at their own depth;
//   - everything that turns in it turns exactly a whole number of times a loop, and the loop phase is snapped at the
//     seam, so frame 0 and frame 60 are the same picture.
// 1 px = 1 character sprite px (32 x 16 px tiles).
import { fit, mix, smooth, TAU, WHITE, rng, cycle, bolt } from "../../core/index.js";
import { FLOOR, ringNoise } from "../_iso.js";

export const meta = {
  name: "Tornado (iso)",
  desc: "nature/tornado on the 2:1 floor: a solid ochre funnel of dust spins on the ground, its top torn open over a dark throat, lightning flickering as leaves and debris whirl round it.",
  tags: ["nature", "wind", "tornado", "storm", "hazard", "loop", "iso", "top-down", "ground"],
  size: [252, 232],
  origin: [126, 198],
  duration: 2,
  loop: true,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: {
    palette: ["#241d16", "#3a2f24", "#53432f", "#6f5a3d", "#8f744e", "#b08a5a", "#c3b49a", "#d9cbb2"],
    dust: ["#2a2018", "#4e3e2e", "#76624a", "#a08a6a", "#cbb894"],
    leaves: ["#4a200c", "#a8541c", "#e8962e", "#ffd27a", "#123818", "#2f7a2a", "#6cb83a", "#c8f070"],
    height: 132,
    seed: 4,
  },
};

const D = meta.duration, FL = FLOOR;

// a small pointed leaf, 5 px: a lit upper half, a shaded lower, a dark rim. pal: [dark, shade, body, light]
function leaf(p, x, y, ang, flip, pal, a) {
  if (a <= 0.02) return;
  const ca = Math.cos(ang), sa = Math.sin(ang), wide = 0.6 + 0.5 * Math.abs(Math.cos(flip));
  for (let i = 0; i < 5; i++) {
    const u = (i + 0.5) / 5, half = wide * Math.sin(Math.PI * u) * 1.25;
    const px = x + ca * (i - 2), py = y + sa * (i - 2);
    p.dot(px, py, u < 0.45 ? pal[3] : u < 0.82 ? pal[2] : pal[1], a);
    if (half > 0.55) p.dot(px - sa * half, py + ca * half, pal[1], a * 0.85);
  }
}
// a pebble: two or three pixels of stone, its lit top corner catching the light
function pebble(p, x, y, s, a, back, soil) {
  if (a <= 0.02) return;
  p.dot(x, y, back ? soil[2] : soil[3], a);
  if (s > 1.8) {
    p.dot(x + 1, y, soil[1], a * 0.9);
    p.dot(x, y - 1, back ? soil[3] : soil[4], a * 0.8);
  }
}

// everything the effect draws, in one place: back = the layer that goes behind whatever stands at its depth
function render(p, t, o, back) {
  const C = fit(o.palette, 8), DST = fit(o.dust, 5), LF = fit(o.leaves, 8);
  const H = o.height, S = o.seed, FH = H;
  // the loop's phase, snapped to exactly 0 at a whole cycle: the renderer's accumulated t can land a few ulps past
  // D at the seam, and an ulp of phase is enough to flip a couple of wall pixels. Everything periodic below is built
  // from this ph, so t = 0 and t = D draw pixel-identical frames.
  const cyc = t / D;
  const ph = Math.abs(cyc - Math.round(cyc)) < 1e-9 ? 0 : cyc - Math.floor(cyc);
  const tc = ph * D;
  // the snaking axis, in the hero's frame: two low-frequency sines laid along the height bend it into a slow S (so it
  // is never a straight post), and a third into the floor's depth. All phases are whole cycles of ph, so the seam holds.
  const ax = (u) => {
    const h = u * H;
    return (4.6 * Math.sin(TAU * ph + h * 0.018) + 2.4 * Math.sin(2 * TAU * ph + h * 0.048 + 1.1)) * (0.3 + 0.7 * u);
  };
  const az = (u) => 7.5 * Math.sin(TAU * ph - 2.1 * u + 1.1) * u;
  // 22 px of wall at the foot, 16 px at the waist, 26 px through the shoulders, then a long flare thrown open to a
  // 44 px torn mouth; a slow, frozen-in-place raggedness keeps the flare from reading as a turned wooden bowl
  const rad = (u) => 9.0 - 1.0 * smooth(0, 0.35, u) + 5.0 * smooth(0.3, 0.68, u)
    + 9.0 * Math.pow(smooth(0.68, 1.0, u), 1.15)
    + 0.9 * (0.5 + 0.5 * ringNoise(u * 9 + Math.sin(TAU * ph) * 1.6, 2.2, S + 3)) * smooth(0.82, 1, u);
  // the lightning's flicker: a hard flash and two softer ones a beat later; zero at both ends of the loop
  const q = ph;
  const flash = Math.max(0, 1 - Math.abs(q - 0.6) / 0.04) + 0.7 * Math.max(0, 1 - Math.abs(q - 0.66) / 0.03)
    + 0.9 * Math.max(0, 1 - Math.abs(q - 0.71) / 0.025);
  const LIT = (c) => mix(c, C[7], Math.min(1, flash) * 0.42);
  const rimYc = -FH + az(1) * FL, cxT = ax(1), RT = rad(1), RY = RT * FL;

  // ---- the floor: no disc under it. A broken skirt of dust blobs, chewed at the edge and lit on the near side, so
  //      the column grows out of kicked-up dirt instead of standing in a flowerpot ----
  if (back) {
    // the skirt: nine blobs of stirred earth at uneven distances, each chewed by two sines; the near ones catch the light
    for (let i = 0; i < 9; i++) {
      const R = rng(S, 1600 + i, 29);
      const a = (i / 9) * TAU + R.range(-0.5, 0.5) + TAU * ph * (i % 3 ? 1 : -1) * 0.5;
      const rr = 7 + 37 * R.next(), x0 = Math.cos(a) * rr, z0 = Math.sin(a) * rr;
      if ((z0 < 0) !== back) continue;
      const r0 = 5.5 + 10 * R.next(), sq = 0.4 + 0.12 * R.next();
      const near = z0 > 0, cA = near ? DST[3] : DST[2], cB = near ? DST[4] : mix(DST[2], DST[3], 0.55);
      const w1 = R.range(0.1, 0.25), w2 = R.range(0, TAU);
      for (let dy = -Math.ceil(r0 * sq); dy <= Math.ceil(r0 * sq); dy++)
        for (let dx = -Math.ceil(r0); dx <= Math.ceil(r0); dx++) {
          const th = Math.atan2(dy / sq, dx);
          const w = 1 + w1 * Math.sin(th * 3.1 + w2) + 0.08 * Math.sin(th * 6.7 + i);
          const e = ((dx * dx) / (r0 * r0) + (dy * dy) / (r0 * r0 * sq * sq)) / (w * w);
          if (e > 1) continue;
          p.px(Math.round(x0 + dx), Math.round(z0 * FL + dy + 2), e < 0.45 ? cA : cB);
        }
    }
    // the core it stands in: the same dust, a little deeper, never a dark hole
    for (let dy = -6; dy <= 6; dy++)
      for (let dx = -14; dx <= 14; dx++) {
        const e = (dx * dx) / 196 + (dy * dy) / 36 + 0.12 * Math.sin(Math.atan2(dy, dx) * 5 + 1.3);
        if (e > 1) continue;
        p.px(dx, dy + 2, e < 0.5 ? mix(DST[2], DST[3], 0.4) : mix(DST[3], DST[4], 0.4));
      }
    // three big dust balls where the column leaves the ground: they break the straight line of its foot
    for (let i = 0; i < 4; i++) {
      const R = rng(S, 1500 + i, 23);
      const a = (i / 4) * TAU + R.range(-0.4, 0.4) + TAU * ph * (i % 2 ? 1 : -1);
      const rr = 7 + 8 * R.next(), x0 = Math.cos(a) * rr, z0 = Math.sin(a) * rr;
      if ((z0 < 0) !== back) continue;
      const r2 = 5 + 2 * R.next();
      p.disc(x0, z0 * FL - 2, r2, DST[3], (d) => 0.75 * (1 - d * d));
      p.disc(x0 - 1, z0 * FL - 3, r2 * 0.6, DST[4], (d) => 0.7 * (1 - d * d));
    }
    // dust torn up off the ground and dragged round the foot: soft puffs boiling up, thinning as they rise
    for (let i = 0; i < 7; i++) {
      const R = rng(S, 1200 + i, 17);
      const a = R.range(-Math.PI, Math.PI) + TAU * ph * (i % 2 ? 1 : -1);
      const rr = 10 + 30 * R.next(), x0 = Math.cos(a) * rr, z0 = Math.sin(a) * rr;
      const lean = R.range(-0.7, 0.7), n = 2 + Math.round(4 * R.next());
      for (let k = 0; k < n; k++) {
        const f = k / (n - 1), r2 = 3.8 - f * 1.7;
        p.disc(Math.round(x0 + lean * k * 1.2), Math.round(z0 * FL - 2 - k * 1.9), r2,
          DST[3], (d) => 0.5 * (1 - f) * (1 - d * d));
      }
    }
  }

  // ---- the wall: one solid column, ochre on its lit flank, turning brown-grey into shade. Each height is drawn as
  //      the whole screen span between its own row and the next one's: the axis drifts into the floor's depth, so a
  //      single row per step would now and then leave a one-pixel hole of sky through the funnel ----
  if (back) {
    for (let h = 0; h <= FH; h++) {
      const u = h / FH, r = rad(u), cx = ax(u), cz = az(u);
      const warm = 1 - smooth(0.03, 0.42, u);                             // dust-brown at the foot, greyer up top
      const grey = smooth(0.5, 0.98, u);
      // the whole row's palette up front: warm/grey mixtures are the same across the row, so the pixel loop only picks
      const wL = mix(DST[2], DST[3], 0.5), wS = mix(DST[1], DST[2], 0.5), gL = mix(C[5], C[4], 0.5);
      const post = (col, l) => {
        let q = col;
        if (warm > 0.02) q = mix(q, l ? wL : wS, warm * 0.35);
        if (grey > 0.02) q = mix(q, l ? gL : C[3], grey * 0.5);
        return q;
      };
      const base = [mix(C[5], C[6], 0.35 + grey * 0.15), C[5], C[4], mix(C[4], C[3], 0.55), C[3], mix(C[3], C[2], 0.5),
        mix(C[5], C[6], 0.5 + 0.35 * (0.5 + 0.5 * ringNoise(u * 13, 1.5, S + 9)))];   // a lit flank, no white line
      // a slow vertical tone drift, sampled once per row: it keeps the cone from reading as a turned wooden post
      const vt = 0.5 + 0.5 * ringNoise(u * 4.6 + 2.1, 1.7, S + 29);
      base[0] = mix(base[0], C[6], 0.1 * vt);
      base[1] = mix(base[1], C[6], 0.07 * vt);
      base[3] = mix(base[3], C[2], 0.1 * (1 - vt));
      base[4] = mix(base[4], C[2], 0.08 * (1 - vt));
      const litV = base.map((c) => post(c, true)), shaV = base.map((c) => post(c, false));
      // horizontal density bands instead of crossing ribs: one every 7.5 px of height, 2–3 px thick, a step lighter
      // on the lit flank and a step darker in shade. The set rides up the column with the phase (exactly four spacings
      // per loop, so the seam is exact) and leans a little with the width, which reads as the column turning.
      const byBase = h + 22.5 * ph;
      const yb = Math.round(cz * FL - h);
      const ya = h === FH ? yb : Math.round(az((h + 1) / FH) * FL - (h + 1));
      for (let y0 = Math.min(ya, yb); y0 <= Math.max(ya, yb); y0++) {
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          const c = (x + 0.5 - cx) / r;
          if (c < -1 || c > 1) continue;
          // lateral light: the left flank catches the sun, the right turns away into shade
          const l = c < 0, V = l ? litV : shaV;
          let col = c < -0.62 ? V[0] : c < -0.2 ? V[1] : c < 0.22 ? V[2] : c < 0.5 ? V[3] : V[4];
          if (c < -0.88) col = V[6];                                       // a broken lit rim on the sunward edge
          if (c > 0.64) col = V[4];
          if (c > 0.88) col = V[5];                                        // the dark turn, 2 px, not a black line
          // the density band crossing this pixel, leaning slightly across the width
          if ((byBase + 0.7 * c) % 7.5 < 2.6) col = mix(col, l ? C[6] : C[2], 0.5);
          p.px(x, y0, col);
        }
        // the wall's two edges: one light pixel on the lit flank, a wider dark turn on the shade flank
        const xe = Math.round(cx + r) - 1, xl = Math.round(cx - r) + 1;
        p.px(xl, y0, mix(C[4], C[5], 0.55));                             // the sunward edge, one warm pixel
        p.px(xe, y0, C[2]);
        p.px(xe - 1, y0, mix(C[2], C[3], 0.5));
      }
    }

    // ---- the mouth: the rim of the wall seen in 2:1. Its far arc is the funnel's silhouette and catches the light;
    //      its near arc is the wall's thickness in shade; the lip is ragged and torn away in patches ----
    const iRx = RT - 4.2, iRy = RY - 2.6;
    // the rim's raggedness and its bites depend on the angle only: tabulate them once instead of sampling noise per pixel
    const NB = 48, ragT = new Float32Array(NB), biteT = new Float32Array(NB), spotT = new Float32Array(NB);
    for (let i = 0; i < NB; i++) {
      const a = -Math.PI + (i + 0.5) * TAU / NB;
      ragT[i] = 0.6 * ringNoise(a * 2.6 + 4.0, 1.9, S + 5) + 0.4 * ringNoise(a * 6.2 + 1.7, 1.2, S + 71);
      biteT[i] = ringNoise(a * 3.1, 1.5, S + 51);
      spotT[i] = ringNoise(a * 5.5, 1.2, S + 37);
    }
    const band = (t, a) => t[Math.min(NB - 1, Math.max(0, Math.floor((a + Math.PI) * NB / TAU)))];
    for (let y = -Math.ceil(RY) - 3; y <= Math.ceil(RY) + 3; y++)
      for (let x = -Math.ceil(RT) - 3; x <= Math.ceil(RT) + 3; x++) {
        const ex = x / RT, ey = y / RY, e = ex * ex + ey * ey;
        const ang = Math.atan2(ey, ex);
        if (e > 1 + 0.17 * band(ragT, ang)) continue;
        const px = Math.round(cxT + x), py = Math.round(rimYc + y);
        const ix = (x * x) / (iRx * iRx) + (y * y) / (iRy * iRy);
        if (ix < 1) {
          // the throat: the far wall's inner face in shade, deepest at its heart, with faint lit streaks down it —
          // kept thin and lifted off black so it reads as a hole in a wall of dust, not a hole in the world
          let col = ix < 0.35 ? mix(C[1], C[2], 0.3) : ix < 0.72 ? mix(C[1], C[2], 0.12) : mix(C[2], C[1], 0.45);
          if (ringNoise(x * 0.42 + 3, y * 0.42, S + 61) > 0.45) col = mix(col, C[2], 0.55);
          p.px(px, py, LIT(col));
        } else {
          if (band(biteT, ang) < -0.12) continue;                        // bitten away in patches, wide gaps
          const far = y < -RY * 0.12;
          let col;
          if (far) col = x < -RT * 0.35 ? mix(C[5], C[6], 0.6) : x < RT * 0.3 ? C[5] : C[4];   // the far lip, lit
          else col = y > RY * 0.55 ? mix(C[3], C[2], 0.55) : mix(C[3], C[2], 0.3); // the near lip: wall in shade
          if (ix > 0.86) col = mix(col, C[2], 0.3);                      // its inner edge
          if (band(spotT, ang) > 0.6) col = mix(col, C[2], 0.5);
          p.px(px, py, LIT(col));
        }
      }
    // tatters standing over the rim on the far side, torn flaps hanging into the mouth on the near side: a few, big,
    // unevenly spaced, so the rim reads as torn cloth rather than a turned lip
    for (let j = 0; j < 8; j++) {
      const R = rng(S, 620 + j, 41);
      const a = -Math.PI + (j + R.range(0.1, 0.9)) * TAU / 8;
      const x = Math.round(cxT + Math.cos(a) * RT * R.range(0.55, 1.05));
      const y = Math.round(rimYc + Math.sin(a) * RY * R.range(0.55, 1.05));
      const inward = Math.sin(a) >= -0.2, hgt = 1 + Math.round(3 * R.next());
      for (let k = 1; k <= hgt; k++) {
        const xk = x + (inward ? (R.next() < 0.5 ? -1 : 1) : 0);
        const yk = inward ? y + k : y - k;
        p.px(xk, yk, k === hgt ? C[5] : k === 1 ? C[4] : C[3]);
      }
    }
    // the lightning lights the throat from inside
    if (flash > 0.05) {
      for (let y = -Math.round(iRy * 0.7); y <= Math.round(iRy * 0.7); y++)
        for (let x = -Math.round(iRx * 0.7); x <= Math.round(iRx * 0.7); x++)
          if ((x * x) / (iRx * iRx) + (y * y) / (iRy * iRy) < 0.5) p.blend(cxT + x, rimYc + y, C[7], 0.5 * Math.min(1, flash));
    }
  }

  // ---- dust at the foot: a bank of stirred sand boiling up in 3D, widest at the ground, and the scuff it drags ----
  {
    cycle(tc, D, 30, S + 800, (g) => g.range(0.85, 1.4), (age, life, g) => {
      const a = g.next() * TAU, r0 = 10 + 16 * g.next(), k = age / life;
      const rr = r0 * (1 + 0.55 * k), z = Math.sin(a) * rr;
      if ((z < 0) !== back) return;
      const x = Math.cos(a) * rr, y = z * FL - (1 + 11 * k * k), rp = 4.5 + 4.5 * k;
      const al = 0.5 * (1 - k) * Math.min(1, age / 0.1) * (back ? 0.7 : 1);
      p.disc(x, y, rp, mix(DST[2], DST[3], 0.45), (d) => al * 0.85 * (1 - d * d));
      p.disc(x - rp * 0.18, y - rp * 0.28, rp * 0.62, DST[3], (d) => al * 0.95 * (1 - d * d));
      if (!back && k < 0.3) p.px(x - rp * 0.3, y - rp * 0.55, DST[4]);   // the lit top of a puff
    });
    cycle(tc, D, 8, S + 900, (g) => g.range(0.35, 0.6), (age, life, g) => {
      const a = g.next() * TAU, sp = 20 + 28 * g.next(), vh = 30 + 34 * g.next();
      const x = Math.cos(a) * sp * age, z = Math.sin(a) * sp * age, hh = vh * age - 450 * age * age;
      if (hh < 0 || (z < 0) !== back) return;
      p.px(x, z * FL - hh, back ? DST[2] : DST[3]);
    });
    // the scuff it drags round its foot: broken arcs of sand on the 2:1 floor, the near half lit
    for (let i = 0; i < 9; i++) {
      const R = rng(S, 950 + i, 13);
      const a0 = (i / 9) * TAU + TAU * ph, rr = 26 + 22 * R.next();
      for (let j = 0; j < 6; j++) {
        const a = a0 + j * 0.05, sn = Math.sin(a);
        if ((sn < 0) !== back) continue;
        const c = back ? mix(DST[1], DST[2], 0.5) : j < 2 ? DST[4] : j < 4 ? DST[3] : DST[2];
        p.px(Math.cos(a) * rr, sn * rr * FL, c);
      }
    }
  }

  // ---- debris: leaves, twigs and pebbles skid in, spiral up outside the wall and are flung off its mouth ----
  {
    const LFC = [LF[0], LF[1], mix(LF[2], DST[2], 0.45), mix(LF[3], DST[3], 0.5), LF[4], LF[5],
      mix(LF[6], DST[3], 0.3), mix(LF[7], DST[3], 0.45)];
    cycle(tc, D, 14, S + 700, (g) => g.range(1.3, 1.95), (age, life, g) => {
      const qq = age / life, u = 0.04 + 0.94 * Math.pow(qq, 0.85);
      const th = g.next() * TAU + (2 + 1.2 * g.next()) * qq * TAU;
      const fling = smooth(0.78, 1, qq), far = 33 + 22 * g.next();
      // they ride outside the wall, where a spinning funnel would throw them, then are flung clear of the mouth
      const rr = rad(u) * 1.3 + 4 * g.next() + fling * far;
      const x = ax(u) + Math.cos(th) * rr, z = az(u) + Math.sin(th) * rr, h = u * FH + fling * 4;
      if ((z < 0) !== back) return;
      const sx = x, sy = z * FL - h, kind = g.next(), spin = g.next() * TAU + qq * 9;
      const fade = Math.min(1, age / 0.12) * (qq > 0.85 ? (1 - qq) / 0.15 : 1);
      if (kind < 0.62) leaf(p, sx, sy, spin, g.next(), LFC, fade);
      else if (kind < 0.8) {
        p.line(sx - 2, sy + 1, sx + 2, sy - 1, back ? LF[2] : LF[5], fade);
        p.px(sx + 2, sy - 1, LF[1]);
      } else pebble(p, sx, sy, 1.4 + 1.2 * g.next(), fade, back, DST);
    });
  }

  // ---- the dust light at its foot, and the lightning flickering through its top ----
  if (!back) {
    p.glow(ax(0), az(0) * FL - 2, 18, DST[2], 0.1);
    if (flash > 0.05) {
      const R = rng(S, 99, Math.floor(ph * 7));
      p.glow(cxT, rimYc - 2, 22, C[7], 0.34 * Math.min(1, flash));
      p.glow(cxT, rimYc - 4, 8, WHITE, 0.16 * Math.min(1, flash));
      // the bolt itself forks through the dark above the mouth, where it reads against the sky
      p.polyline(bolt(R, cxT - 20, rimYc - 14, cxT + 16, rimYc - 40, { jag: 0.4, depth: 3 }), flash > 0.62 ? WHITE : C[7], Math.min(1, flash * 1.5));
      p.polyline(bolt(rng(S, 98, Math.floor(ph * 7)), cxT + 2, rimYc - 28, cxT - 14, rimYc - 50, { jag: 0.36, depth: 2 }), C[7], Math.min(1, flash));
      p.glow(cxT - 2, rimYc - 28, 20, C[7], 0.28 * Math.min(1, flash));
    }
  }
}

export function drawBack(p, t, o) {
  render(p, t, o, true);
}
export function draw(p, t, o) {
  render(p, t, o, false);
}
