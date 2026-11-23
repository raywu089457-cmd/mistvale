// shadow/shadow-tendrils on the game's 2:1 isometric floor: a black pool opens on the floor at the aim point with a
// cold lit rim, and six tapered tendrils burst out of it, lash over the stone and curl back into the dark. Their tips
// carry a white-lilac glint; low shadow smoke crawls round the pool the whole time. The pool is a real floor shape
// (2:1), the tendrils are drawn as rising spines so they read as coming up out of the ground, not lying on it.
// 1 px = 1 character sprite px (32 x 16 px tiles).
import { fit, clamp, smooth, ease, Rng, TAU, WHITE } from "../../core/index.js";
import { FLOOR, ringNoise } from "../_iso.js";
import { floorLight } from "../fire/_lib.js";
import { VOID } from "./_lib.js";

const D = 1.8, FL = FLOOR, AHEAD = 18, POOL_R = 17, NT = 6, END = D - 1 / 40;

export const meta = {
  name: "Shadow tendrils (iso)",
  desc: "shadow/tendrils on the 2:1 floor: a black pool opens at the aim point and six tapered tendrils lash out and curl back, pale glints at their tips, low smoke crawling round.",
  tags: ["shadow", "tendrils", "dark", "grab", "ground", "one-shot", "iso", "top-down"],
  size: [150, 120],
  origin: [75, 82],
  duration: D,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: VOID, aim: 0, seed: 3 },
};

function bez(p0, p1, p2, p3, u) {
  const a = 1 - u, a2 = a * a, u2 = u * u;
  return [a2 * a * p0[0] + 3 * a2 * u * p1[0] + 3 * a * u2 * p2[0] + u2 * u * p3[0], a2 * a * p0[1] + 3 * a2 * u * p1[1] + 3 * a * u2 * p2[1] + u2 * u * p3[1], a2 * a * p0[2] + 3 * a2 * u * p1[2] + 3 * a * u2 * p2[2] + u2 * u * p3[2]];
}

export function create(o) {
  const C = fit(o.palette, 8), S = o.seed ?? 3, RNG = new Rng(S);
  const aim = o.aim ?? 0;
  const SX = Math.cos(aim) * AHEAD, SY = Math.sin(aim) * AHEAD * FL; // the aim point: floor and screen
  let t = 0;

  // ---- the tendrils: bases spaced round the rim, each with its own reach, height and writhe
  const tendrils = [];
  for (let i = 0; i < NT; i++) {
    const g = (i / NT) * TAU + RNG.range(-0.3, 0.3);
    const fz = Math.sin(g);
    const drops = [];
    for (let j = 0; j < 3; j++) {
      const ga = g + RNG.range(-0.5, 0.5);
      drops.push({ d: RNG.range(0, 0.12), vx: Math.cos(ga) * RNG.range(5, 13), vz: Math.sin(ga) * RNG.range(5, 13), vh: RNG.range(16, 30), life: RNG.range(0.28, 0.4), bl: RNG.next() });
    }
    tendrils.push({
      g,
      ph: RNG.range(0, TAU),
      t0: 0.06 + RNG.range(0, 0.2) + (fz < 0 ? 0.04 : 0),
      len: RNG.range(12, 19),
      H: RNG.range(10, 22),
      w0: RNG.range(2.2, 3.2),
      dim: fz < -0.15,
      fx: Math.cos(g) * POOL_R * 0.95,
      fz: fz * POOL_R * 0.95,
      drops,
    });
  }
  tendrils.sort((a, b) => a.fz - b.fz);

  // ---- low shadow smoke round the pool, and a few glints on the water
  const smoke = [];
  for (let i = 0; i < 26; i++) {
    const g = RNG.range(0, TAU), r = POOL_R * RNG.range(0.2, 1.5);
    smoke.push({ ang: g, r, ph: RNG.range(0, 1.2), life: RNG.range(0.9, 1.6), rise: RNG.range(6, 15), drift: RNG.range(-2.5, 2.5), bl: RNG.next(), front: Math.sin(g) > 0.2 });
  }
  const glints = [];
  for (let i = 0; i < 6; i++) {
    const g = (i / 6) * TAU + 0.4, r = POOL_R * (0.42 + 0.1 * (i % 3));
    glints.push({ x: SX + Math.cos(g) * r, y: SY + Math.sin(g) * r * FL, ph: i * 1.1 });
  }

  // the pool: black water in clean solid bands — a dark heart, two slow swirling arms and a cold lit rim.
  // Every pixel matches its neighbours; the shape breathes by opening, not by dithering.
  function drawPool(p, t) {
    const k = smooth(0.02, 0.12, t) * (1 - smooth(D - 0.3, D - 0.1, t));
    if (k <= 0.02) return;
    const RX = POOL_R + 3, grow = 0.55 + 0.45 * k;
    p.shade(SX - RX, SY - RX * FL, SX + RX, SY + RX * FL, (x, y, out) => {
      const ax = x - SX, ay = (y - SY) / FL;
      const ang = Math.atan2(ay, ax);
      const rr = POOL_R * grow * (1 + 0.05 * ringNoise(ang, 3, S));
      const d = Math.hypot(ax / rr, ay / rr);
      if (d > 1) return;
      const near = Math.sin(ang) > 0;
      if (d < 0.52) out.c = C[0];
      else if (d < 0.88) {
        // two solid spiral arms turning slowly through the black
        const arm = 0.5 + 0.5 * Math.cos(2 * ang - 2.4 * t + d * 5.5);
        out.c = arm > 0.52 ? C[1] : C[0];
      } else out.c = near ? C[2] : C[1];
      out.a = 1;
    });
    // one crisp rim highlight where the cold light catches the near lip
    const rr2 = POOL_R * grow;
    for (let i = 0; i <= 72; i++) {
      const ga = Math.PI * (0.18 + (0.64 * i) / 72);
      p.px(SX + Math.cos(ga) * rr2, SY + Math.sin(ga) * rr2 * FL, C[3]);
    }
    // a few cold twinkles on the water, each one on for a moment
    if (k > 0.35)
      for (const q of glints) if (Math.sin(t * 6.5 + q.ph) > 0.55) p.px(q.x, q.y, C[4]);
    floorLight(p, SX, SY, POOL_R, POOL_R * FL, C[4], 0.15 * k);
    p.glowRing(SX, SY, POOL_R + 3, POOL_R - 2, C[4], 0.12 * k);
  }

  function drawSmoke(p, t, front) {
    for (const q of smoke) {
      if (q.front !== front) continue;
      const a = ((t + q.ph) % q.life) / q.life;
      const rr = q.r + a * 2.5;
      const x = SX + Math.cos(q.ang) * rr + q.drift * a;
      const y = SY + Math.sin(q.ang) * rr * FL - a * q.rise;
      // the smoke body is flat: two opaque steps that shrink away instead of a translucent wash
      const s = 0.6 + 0.4 * Math.sin(Math.PI * a), r = (2.4 + a * 1.8) * s;
      p.disc(x, y, r, C[2], 1);
      p.disc(x, y, r * 0.62, C[1], 1);
    }
  }

  // one tendril: a tapered spine out of the pool that lashes, then hooks back down into the dark
  function drawTendril(p, d, t) {
    const a = t - d.t0;
    if (a < 0) return;
    const rise = ease.outCubic(clamp(a / 0.26));
    const curl = ease.inOutCubic(clamp((a - 0.52) / 0.5));
    const sink = clamp((a - 1.0) / 0.34);
    const ext = rise * (1 - ease.inCubic(sink));
    if (ext < 0.03) return;
    const g = d.g, ox = Math.cos(g), oz = Math.sin(g), tx = -oz, tz = ox;
    const sway = Math.sin(t * 5.4 + d.ph) * (1.2 + 2.4 * ext) * ext;
    const L = d.len, H = d.H;
    const P0 = [0, 0, 0];
    const P1 = [ox * L * 0.28 * ext + tx * sway * 0.4, oz * L * 0.28 * ext + tz * sway * 0.4, 10 * ext];
    const P2 = [ox * L * 0.68 * ext + tx * sway * 0.85, oz * L * 0.68 * ext + tz * sway * 0.85, (H + 4) * ext * (1 - 0.3 * curl)];
    const P3 = [ox * L * (0.9 - 0.45 * curl) * ext + tx * (sway + curl * 3), oz * L * (0.9 - 0.45 * curl) * ext + tz * (sway + curl * 3), (H * 0.75) * ext * (1 - 0.9 * curl) + 2];
    const N = 16, pts = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, q = bez(P0, P1, P2, P3, u);
      pts.push([SX + d.fx + q[0], SY + (d.fz + q[1]) * FL - q[2], u]);
    }
    const bx = SX + d.fx, by = SY + d.fz * FL;
    // the collar where it leaves the pool: a clean solid lip
    p.ellipse(bx, by, 2.9, 1.5, (dd, ang) => (dd > 0.55 ? (Math.sin(ang) > 0 ? C[4] : C[2]) : 0));
    // the body: one solid tapered tube built from overlapping solid discs, so the mass is smooth and clean.
    // Then a single cold lit rim line down the light side — no per-section colour bands (those read as a ladder).
    const front = { body: C[2], rim: C[3], far: C[0] };
    const back = { body: C[1], rim: C[2], far: C[0] };
    const cc = d.dim ? back : front;
    const pu = (t * 0.75 + d.ph * 0.31) % 1;
    const nx_ = [], ny_ = [], ws = [];
    for (let i = 0; i <= N; i++) {
      const q = pts[i], qa = pts[Math.max(0, i - 1)], qb = pts[Math.min(N, i + 1)];
      let nx = -(qb[1] - qa[1]), ny = qb[0] - qa[0];
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl;
      ny /= nl;
      if (nx * -0.6 + ny * -0.8 < 0) {
        nx = -nx;
        ny = -ny;
      }
      nx_.push(nx);
      ny_.push(ny);
      ws.push((d.w0 * Math.pow(1 - q[2], 0.9) + 0.6) * (0.65 + 0.35 * ext));
      p.disc(q[0], q[1], ws[i], cc.body, 1);
    }
    for (let i = 0; i <= N; i++) {
      const q = pts[i], w = ws[i], nx = nx_[i], ny = ny_[i];
      // the cold rim catches the light on one side only; the far side is swallowed by the dark
      if (i >= N - 2) {
        p.px(q[0], q[1], i === N ? WHITE : C[6]);
      } else {
        p.px(q[0] + nx * (w - 0.6), q[1] + ny * (w - 0.6), cc.rim);
        if (Math.abs(q[2] - pu) < 0.06) p.px(q[0] + nx * (w - 1.6), q[1] + ny * (w - 1.6), C[4]);
        if (Math.abs(q[2] - pu) < 0.06) p.light(q[0], q[1], C[4], 0.3);
      }
    }
    // the glint at the tip
    const tip = pts[N];
    p.glow(tip[0], tip[1] - 1, 6, C[5], 0.24 * (1 - curl) * ext);
    // the pool water thrown up as it breaks the surface
    for (const q of d.drops) {
      const a2 = a - q.d;
      if (a2 < 0 || a2 > q.life) continue;
      const h = q.vh * a2 - 260 * a2 * a2;
      if (h < -1) continue;
      p.px(bx + q.vx * a2, by - h, q.bl < 0.4 ? C[5] : C[3]);
      p.px(bx + q.vx * a2 * 0.7, by - h * 0.55 - 1, C[2]);
    }
  }

  return {
    update(dt) {
      t += dt;
    },
    draw(p, tt) {
      const t = tt;
      if (t >= END) return;
      drawPool(p, t);
      drawSmoke(p, t, false);
      for (const d of tendrils) drawTendril(p, d, t);
      drawSmoke(p, t, true);
    },
  };
}
