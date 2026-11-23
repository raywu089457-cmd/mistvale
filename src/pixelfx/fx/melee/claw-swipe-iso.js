// Claw swipe, rewritten for the game's 2:1 isometric camera: melee/claw-swipe in the world the game sees, not the
// side view's picture squashed onto the floor.
//
// The recipe is the source's: three claw marks rake down one after another, each tears open in a couple of frames,
// runs white-hot and cools through yellow and orange to a deep red, then closes up from both ends and leaves a
// dotted scar; hot flecks are thrown off the wound, and the floor takes a faint scuff. Same palette, same beats,
// same stagger.
// What the camera changes:
//   - the three rakes are real curves in 3-D (down and forward, a little further across the floor and a little
//     lower with each finger), so they lie across the space in front of the hero whichever way he faces: side on
//     they read as three diagonal furrows, facing the camera as three stacked ones;
//   - the furrows tear in the air and stand up the screen at their true height: one pixel of height is one pixel,
//     nothing is squashed onto the floor;
//   - what they flick off flies in 3-D (x across, z into the floor, h up), falls and lies at its own depth;
//   - the only thing on the floor is the scuff: a faint 2:1 scratch under each rake, with the dust it lifts.
// 1 px = 1 character sprite px. aim is a floor angle: 0 = screen right, PI/2 = down the screen toward the viewer.
import { Rng, fit, clamp, smooth, ease, TAU, WHITE, sparkle } from "../../core/index.js";
import { FLOOR, bandFloor } from "../_iso.js";

export const meta = {
  name: "Claw swipe (iso)",
  desc: "Three claw rakes across the air in 2:1 iso: ragged tapered furrows tear open white-hot and cool to ember, chips and sparks flicked off, a faint scuff on the floor.",
  tags: ["melee", "claw", "swipe", "beast", "scratch", "combat", "directional", "one-shot", "iso", "top-down", "ground"],
  size: [200, 180],
  origin: [100, 150],
  duration: 0.54,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  actor: 2,
  options: {
    palette: ["#2a0808", "#5c0f12", "#a51d1d", "#e2401f", "#ff8a2a", "#ffd166", "#fff3c4"],
    aim: 0,
    seed: 8,
  },
};

const D = meta.duration, FL = FLOOR, G = 620;
const RAKE = 0.05;        // each mark tears open in this long
const STAGGER = 0.04;     // the second and third arrive this much later
const CLOSE0 = 0.22;      // then it starts closing up from both ends ...
const CLOSE = 0.2;        // ... and is shut this much later
const COOL = 0.3;         // white-hot -> deep ember
const N = 44;             // samples along a rake

/** When a furrow's tearing head, racing out with ease.outExpo, reaches fraction s of the way along it. */
const passAt = (s) => RAKE * (-Math.log2(1 - clamp(s, 0, 0.985)) / 10);

/** An offcut thrown in the game's 3-D: drag on the floor, one small bounce, then rest at its own depth. */
function toss(u, v, h, vu, vv, vh, drag = 1.4) {
  const disc = vh * vh + 2 * G * h, t1 = (vh + Math.sqrt(disc)) / G, vDown = Math.sqrt(disc);
  const vUp = vDown * 0.3, t2 = (2 * vUp) / G;
  return { u, v, h, vu, vv, vh, drag, t1, vUp, t2, end: t1 + t2 };
}
function tossAt(b, age) {
  const t = Math.min(age, b.end), e = Math.exp(-b.drag * t), d = (1 - e) / b.drag;
  const u = b.u + b.vu * d, v = b.v + b.vv * d;
  let h;
  if (t < b.t1) h = b.h + b.vh * t - 0.5 * G * t * t;
  else {
    const tb = t - b.t1;
    h = tb < b.t2 ? b.vUp * tb - 0.5 * G * tb * tb : 0;
  }
  return [u, v, h];
}

export function create(o) {
  const C = fit(o.palette, 7), n = C.length, R = new Rng(o.seed ?? 8), aim = o.aim ?? 0;
  const ax = Math.cos(aim), az = Math.sin(aim);
  // local (forward u, across v, up h) -> the picture, with the 2:1 floor under it
  const P = (u, v, h) => [u * ax - v * az, (u * az + v * ax) * FL - h];

  // ---- the three rakes: high and a hand's width out from the body, raking down and out across the front ----
  const RAKES = [];
  for (let i = 0; i < 3; i++) {
    const v0 = (i - 1) * 10.5;
    const S = [5.0, v0, 32.5 - i * 2.0];
    const E = [29.5 - i * 0.8, v0 + 14, 17.5 - i * 0.9];
    const K = [(S[0] + E[0]) / 2 + 1.8, (S[1] + E[1]) / 2 + 1.5, (S[2] + E[2]) / 2 + 2.0];
    const pts = [];
    for (let j = 0; j < N; j++) {
      const s = j / (N - 1), a = (1 - s) * (1 - s), b = 2 * (1 - s) * s, d = s * s;
      const u = a * S[0] + b * K[0] + d * E[0], v = a * S[1] + b * K[1] + d * E[1], h = a * S[2] + b * K[2] + d * E[2];
      const du = 2 * (1 - s) * (K[0] - S[0]) + 2 * s * (E[0] - K[0]);
      const dv = 2 * (1 - s) * (K[1] - S[1]) + 2 * s * (E[1] - K[1]);
      const dh = 2 * (1 - s) * (K[2] - S[2]) + 2 * s * (E[2] - K[2]);
      const [x, y] = P(u, v, h);
      const sx = du * ax - dv * az, sy = (du * az + dv * ax) * FL - dh, len = Math.hypot(sx, sy) || 1;
      const w = (1.7 - i * 0.1) * Math.pow(Math.sin(Math.PI * s), 0.8);   // a lens: sharp at both ends
      pts.push({
        u, v, h, x, y, w, nx: -sy / len, ny: sx / len, tp: passAt(s),
        r1: R.range(0.6, 1.16), r2: R.range(0.6, 1.16), g: R.range(0.55, 1),     // ragged lips
      });
    }
    RAKES.push({ i, t0: i * STAGGER, pts });
  }

  // ---- chips and shards flicked off the furrows, thrown in 3-D and landing at their own depth ----
  const CHIPS = [];
  for (let i = 0; i < 14; i++) {
    const m = RAKES[i % 3], q = m.pts[Math.min(N - 2, R.int(8, N - 3))];
    const b = toss(q.u, q.v, q.h, R.range(-8, 30), R.sign() * R.range(14, 52), R.range(30, 84), 1.5);
    const t0 = m.t0 + q.tp + R.range(0, 0.012);
    b.t0 = t0;
    b.life = Math.min(t0 + b.end + 0.16, D - 0.05);
    b.c = R.pick([C[5], C[4], C[3], WHITE]);
    b.s = R.chance(0.5) ? 2 : 1;
    CHIPS.push(b);
  }
  // ---- hot sparks off the tearing edges: fast, short-lived, still in the air when they die ----
  const SPARKS = [];
  for (let i = 0; i < 12; i++) {
    const m = RAKES[i % 3], q = m.pts[Math.min(N - 2, R.int(10, N - 3))];
    SPARKS.push({
      u: q.u, v: q.v, h: q.h, t0: m.t0 + q.tp + R.range(0, 0.01), life: R.range(0.1, 0.2),
      vu: R.range(-16, 30), vv: R.sign() * R.range(20, 70), vh: R.range(20, 60),
    });
  }

  // ---- the scuff the lunge leaves on the 2:1 floor (a scraped arc in front of the feet), and the dust it lifts ----
  const SCUFF = [];
  for (let i = 0; i < 20; i++) {
    const a = R.range(-0.8, 0.8), r = R.range(8, 20);
    const [x, y] = P(Math.cos(a) * r, Math.sin(a) * r, 0);
    SCUFF.push({ x, y, k: R.range(0.1, 0.2), c: R.pick([C[1], C[2], C[2]]), t0: R.range(0, 0.13) });
  }
  for (let i = 0; i < 3; i++) {                                  // a few short straight scrapes across it
    const a = R.range(-0.55, 0.55), r0 = R.range(9, 15);
    for (let j = 0; j < 5; j++) {
      const [x, y] = P(Math.cos(a) * (r0 + j * 1.6), Math.sin(a) * (r0 + j * 1.6), 0);
      SCUFF.push({ x: x + R.range(-0.4, 0.4), y: y + R.range(-0.4, 0.4), k: R.range(0.14, 0.24), c: C[2], t0: 0.02 + j * 0.012 });
    }
  }
  const DUST = [];
  for (let i = 0; i < 6; i++) {
    const a = R.range(-0.7, 0.7), r = R.range(5, 15);
    const [x, y] = P(Math.cos(a) * r, Math.sin(a) * r, 0);
    DUST.push({ x, y, t0: R.range(0.005, 0.1), life: R.range(0.24, 0.4), r: R.range(2, 3), rise: R.range(8, 16), d: R.range(-4, 4) });
  }

  let T = 0;

  // the faint scratch on the floor: parallel to the rake that made it, dithered into the floor
  const floorDraw = (p, t, fade) => {
    for (const q of SCUFF) {
      const age = t - q.t0;
      if (age < 0 || age > 0.5) continue;
      p.dot(q.x, q.y, q.c, q.k * fade);
      p.dot(q.x, q.y + 1, q.c, q.k * 0.45 * fade);   // 2:1, so the scuff is wider than it is deep
    }
    for (const q of DUST) {
      const age = t - q.t0;
      if (age < 0 || age > q.life) continue;
      const u = age / q.life;
      p.disc(q.x + q.d * u, q.y - q.rise * ease.outCubic(u), q.r + age * 7, C[4], 0.3 * (1 - u) * (1 - u));
    }
    if (t < 0.42) {
      const [lx, ly] = P(13, 0, 0);
      p.glow(lx, ly, 16, C[3], 0.11 * (1 - t / 0.42));
    }
  };

  // the tearing furrow: head races out, the width cools behind it, then both ends close in
  const furrow = (p, m, t, fade) => {
    const u = t - m.t0;
    if (u < 0) return;
    const head = ease.outExpo(clamp(u / RAKE));
    const close = smooth(CLOSE0, CLOSE0 + CLOSE, u);
    const lo = 0.5 * close, hi = Math.min(head, 1 - 0.5 * close);
    if (hi - lo < 0.012) return;
    const i0 = Math.max(0, Math.ceil(lo * (N - 1))), i1 = Math.min(N - 1, Math.floor(hi * (N - 1)));
    const hiI = hi * (N - 1);
    for (let i = i0; i <= i1; i++) {
      const q = m.pts[i];
      const age = u - q.tp;
      if (age < 0) continue;
      const z = q.u * az + q.v * ax;
      const heat = clamp(1 - age / COOL) * (z < 0 ? 0.8 : 1);   // the far rake sits deeper in the ramp
      if (heat <= 0.02) continue;
      const near = hiI - i < 2.5;                                // just torn: white-hot
      const w = q.w * (1 - 0.5 * close);
      if (w < 0.22) continue;
      for (let off = -w * q.r1; off <= w * q.r2; off += 0.5) {
        const x = q.x + q.nx * off, y = q.y + q.ny * off;
        if (y > -0.5) continue;                                  // the air never paints below the feet
        const e = Math.abs(off) / w;                             // 0 at the heart, 1 at the lip
        const rr = (i * 7 + Math.round(off * 4) * 13) & 7;       // a fixed ragged pattern
        if (e > 0.76 && (q.g * 7 < rr || rr === 6)) continue;    // torn lips, not a clean stroke
        const hp = clamp(heat * (1 - e * 0.34) + (near ? 0.42 : 0));
        const c = hp > 0.99 && near && e < 0.5 ? WHITE
          : hp > 0.88 ? C[6] : hp > 0.68 ? C[5] : hp > 0.46 ? C[4] : hp > 0.26 ? C[3] : C[2];
        if (e < 0.55) p.px(x, y, c); else p.dot(x, y, c, 0.62);   // light centre, dithered torn lip
      }
    }
    // light along the tear, and the glint of the claw as it comes through
    for (let i = i0; i <= i1; i += 4) {
      const q = m.pts[i], age = u - q.tp;
      if (age < 0) continue;
      p.glow(q.x, q.y, 3.5, C[4], 0.06 * clamp(1 - age / COOL) * fade);
    }
    const q = m.pts[i1];
    const g = u - q.tp;
    if (g > -0.01 && g < 0.1) {
      const k = 1 - clamp(g / 0.1);
      sparkle(p, q.x, q.y, 2 + (1 - clamp(u / RAKE)), C[6], WHITE, 0.26 * k * fade);
    }
    // where it has closed, a dotted scar lingers
    const sk = 0.5 * (1 - clamp((u - CLOSE0 - CLOSE * 0.5) / 0.36)) * fade;
    if (close > 0.06 && sk > 0.01) {
      for (let i = 1; i < i0; i += 2) p.dot(m.pts[i].x, m.pts[i].y, C[2], sk);
      for (let i = i1 + 2; i < N - 1; i += 2) p.dot(m.pts[i].x, m.pts[i].y, C[2], sk);
    }
  };

  const chipDraw = (p, t, fade) => {
    for (const b of CHIPS) {
      const age = t - b.t0;
      if (age < 0 || age > b.life - b.t0) continue;
      const [u, v, h] = tossAt(b, age), [x, y] = P(u, v, h);
      const k = clamp(1 - (t - b.t0) / (b.life - b.t0));
      if (h > 0.4) {
        const c = age < 0.05 ? WHITE : age < 0.16 ? C[5] : b.c;
        p.px(x, y, c);
        if (b.s > 1) p.px(x + 1, y + 1, b.c);
        if (age < 0.1) {
          const [u0, v0, h0] = tossAt(b, Math.max(0, age - 0.01));
          const [x0, y0] = P(u0, v0, h0);
          p.line(x0, y0, x, y, C[5], 0.55);
          p.glow(x, y, 3, C[4], 0.1 * k);
        }
      } else p.dot(x, y, k > 0.4 ? C[3] : C[2], 0.7 * k * fade);
    }
  };

  const sparkDraw = (p, t, fade) => {
    for (const s of SPARKS) {
      const age = t - s.t0;
      if (age < 0 || age > s.life) continue;
      const u = s.u + s.vu * age, v = s.v + s.vv * age, h = s.h + s.vh * age - 0.5 * G * age * age;
      const [x, y] = P(u, v, h);
      if (y > -0.5) continue;
      const vy = (s.vv * ax) * FL - (s.vh - G * age);
      const vx = s.vu * ax - s.vv * az, sp = Math.hypot(vx, vy) || 1, len = Math.min(5, 1.4 + sp * 0.018);
      const k = 1 - age / s.life;
      p.line(x - (vx / sp) * len, y - (vy / sp) * len, x - (vx / sp) * len * 0.35, y - (vy / sp) * len * 0.35, k > 0.6 ? C[6] : C[4], 0.9 * k * fade);
      p.px(x, y, k > 0.45 ? WHITE : C[5]);
      if (k > 0.4) p.glow(x, y, 3, C[4], 0.14 * k * fade);
    }
  };

  return {
    update(dt) { T += dt; },
    draw(p, tt) {
      const t = tt ?? T;
      const fade = 1 - smooth(0.46, 0.52, t);
      if (fade <= 0) return;
      floorDraw(p, t, fade);
      sparkDraw(p, t, fade);
      chipDraw(p, t, fade);
      for (const m of RAKES) furrow(p, m, t, fade);
    },
  };
}
