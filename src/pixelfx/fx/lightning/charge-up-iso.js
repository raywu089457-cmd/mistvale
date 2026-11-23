// Charge up for the game's 2:1 isometric camera: lightning/charge-up rewritten for the floor the game sees, not its
// picture squashed, stretched or scaled. The recipe is the source's: sparks streak and arcs whip in to a crackling
// core at the caster's hand, the core swells and its pulse quickens, then it flashes and bursts: bolts every way, a
// ring, a spray of sparks. What changed is the world it happens in:
//   - the core is in the hand he holds out (`aim` radians on the floor, 0 = right, + toward us; or `dir` 0..7 =
//     east, south-east (toward us), south ... as the game's eight facings), behind him when he faces away;
//   - the energy streams in from all round him in 3D, the bolts strike out every way round, and the ones that go
//     down strike the floor at their own depth and leave a scorch that cools and crumbles away grain by grain;
//   - the shock rings out level with the hand (a 2:1 ring, far half behind him), and where it reaches the floor it
//     kicks a ring of dust out over it; the sparks fall, bounce and skid out at their own depth;
//   - the charge lights the floor under the hand, and lifts grit off it before it lets go.
// The caster is the game's own character (it stands at the origin): the effect draws no stand-in. Pass `actor` (the
// character's mask) and the body catches the core's light and flashes with the release.
// 1 px = 1 character sprite px (32 x 16 px tiles).
import { Lights, P, Rng, fit, flare, clamp, smooth, ease, rng, rand, TAU, WHITE, hex, mix } from "../../core/index.js";
import { VOLT, PLASMA, zigzag, stroke } from "./_lib.js";
import { floorLight } from "../fire/_lib.js";
import { Fly3 } from "../_iso.js";

export const meta = {
  name: "Charge up (iso)",
  desc: "lightning/charge-up on the 2:1 floor: energy streams in to a core in the caster's hand, then it bursts: bolts strike out every way and scorch the floor, a shock kicks the dust.",
  tags: ["lightning", "electric", "charge", "spell", "power-up", "one-shot", "iso", "top-down"],
  size: [264, 210],
  origin: [132, 140],
  duration: 2.7,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: VOLT, sparks: PLASMA, charge: 1.6, aim: 0.5, seed: 4 },
};

const FL = 0.5, HAND = 9, CORE_H = 21, BK = [1, 0.7, 0.95, 0.5, 0.8, 0.35], ASH = hex("#5b5566"), GRIT = hex("#6a6156"), SOOT = hex("#17131c");

/**
 * A ring lying level (2:1) drawn solid: colour steps across its thickness, no ordered-dither alpha (band()'s
 * p.dot alpha speckles the floor), so the shock reads as clean light. cols runs dark inner .. bright outer lip.
 */
function ringBand(p, cx, cy, r, thickness, cols, keep) {
  const th = Math.max(2, thickness);
  if (r < 1) return;
  const n = Math.ceil(r * TAU * 1.4);
  for (let j = 0; j < n; j++) {
    const g = (j / n) * TAU;
    if (keep && !keep(g)) continue;
    const ca = Math.cos(g), sa = Math.sin(g) * FL;
    for (let o = 0; o < th; o += 0.5) {
      const u = o / th, c = u < 0.2 ? cols[3] : u < 0.45 ? cols[2] : u < 0.75 ? cols[1] : cols[0];
      if (c) {
        const x = cx + ca * (r - o), y = cy + sa * (r - o);
        p.px(x, y, c);
        p.px(x, y + 1, c);   // two rows on screen, so the wave front has a body instead of a dotted rim
      }
    }
  }
}

/** A thin crackle inked solid: a pale 1 px body, a white core on the trunk, light along it. */
function crackleSolid(p, b, k, C, glowK = 0.4) {
  for (const q of b.paths) {
    const thick = q.w >= 1;
    for (let i = 0; i < q.pts.length - 1; i += 3) p.glow(q.pts[i][0], q.pts[i][1], (thick ? 8 : 5) * (0.5 + k * 0.5), C[4], glowK * k * q.w);
    for (let i = 0; i < q.pts.length - 1; i++) {
      const [ax, ay] = q.pts[i], [bx, by] = q.pts[i + 1], l = Math.max(1, Math.hypot(bx - ax, by - ay));
      for (let d = 0; d <= l; d += 0.5) {
        const x = ax + ((bx - ax) * d) / l, y = ay + ((by - ay) * d) / l;
        p.px(x, y, thick && k > 0.3 ? C[7] : C[5]);
      }
    }
  }
}

export function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed), REL = o.charge, END = meta.duration;
  const aim = o.dir != null && o.aim === meta.options.aim ? (o.dir * Math.PI) / 4 : o.aim;
  // the hand: out from his body toward where he aims, at chest height; on screen (HX, HY)
  const hx = Math.cos(aim) * HAND, hz = Math.sin(aim) * HAND, HX = hx, HY = hz * FL - CORE_H, coreNear = hz >= 0;
  const fly = new Fly3({ rng: R, sparks: o.sparks }), lights = new Lights();
  const behind = (q) => q.z < 0, before = (q) => q.z >= 0;

  // the bolts of the release: every way round him, some up, most out and down; one that goes down strikes the floor
  // at its own depth, where it leaves a scorch: a hot spot with a few short forks burnt out over the floor
  const bolts = [], scars = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + R.range(-0.25, 0.25), e = R.range(-0.85, 0.5), c = Math.sqrt(1 - e * e), L = R.range(46, 74);
    let dx = Math.cos(a) * c, dz = Math.sin(a) * c, dh = e, s = L;
    if (CORE_H + dh * s < 0) s = CORE_H / -dh;   // it meets the floor first
    const x1 = hx + dx * s, z1 = hz + dz * s, h1 = Math.max(0, CORE_H + dh * s);
    const b = { x1, z1, h1, t0: REL + R.range(0, 0.05), seed: R.int(0, 1e6) };
    bolts.push(b);
    if (h1 < 0.5) {
      const px = [];
      const put = (x, y, g) => px.push({ x: Math.round(x), y: Math.round(y), g, r: Math.hypot(x - x1, (y - z1 * FL) / FL) });
      for (let y = -1; y <= 1; y++) for (let x = -2; x <= 2; x++) if (Math.abs(x) + Math.abs(y) * 2 <= 2) put(x1 + x, z1 * FL + y, R.range(0.3, 1));
      for (let k = 0, n = R.int(3, 5); k < n; k++) {
        let fa = R.range(0, TAU), x = x1, z = z1;
        for (let j = 0, m = R.int(4, 9); j < m; j++) {
          fa += R.range(-0.7, 0.7);
          x += Math.cos(fa); z += Math.sin(fa) * 1.4;
          put(x, z * FL, R.range(0, 1) * (1 - j / m));
        }
      }
      scars.push({ x: x1, z: z1, t0: b.t0, px });
    }
  }
  const arcs = [];
  let t = 0, released = false, phase = 0, beats = [];
  const level = () => clamp(t / REL);

  return {
    update(dt) {
      t += dt;
      const k = level(), e = k * k;
      if (t < REL) {
        // energy streams in from all round him, more and more of it, swirling as it comes
        for (let acc = (60 + 340 * e) * dt; acc > 0; acc--) {
          if (acc < 1 && !R.chance(acc)) break;
          const a = R.range(0, TAU), el = R.range(-0.45, 1), c = Math.sqrt(1 - el * el), d = R.range(30, 70) * (1 - 0.35 * k);
          const ux = Math.cos(a) * c, uz = Math.sin(a) * c, life = R.range(0.16, 0.26), sp = (d / life) * 0.95;
          const h = Math.max(2, CORE_H + el * d);
          fly.spawn(P.MOTE, hx + ux * d, hz + uz * d, h, -ux * sp - uz * sp * 0.4, -uz * sp + ux * sp * 0.4, (CORE_H - h) / life, life, R.pick([C[7], C[6], C[5]]), 1);
        }
        // arcs whip in from the air round him
        if (k > 0.2 && R.chance((2 + 16 * e) * dt)) {
          const a = R.range(0, TAU), d = R.range(20, 40), el = R.range(-0.4, 0.8);
          arcs.push({ x: hx + Math.cos(a) * d, z: hz + Math.sin(a) * d * 0.9, h: Math.max(3, CORE_H + el * d), t, seed: R.int(0, 1e6) });
        }
        // near the end the charge reaches down to the floor: grit hops up off it under the hand
        if (k > 0.55 && R.chance(30 * (k - 0.55) * dt * 4)) {
          const a = R.range(0, TAU), d = R.range(4, 26);
          fly.spawn(P.GRIT, hx + Math.cos(a) * d, hz + Math.sin(a) * d, 0, R.range(-8, 8), R.range(-8, 8), R.range(40, 110) * k, R.range(0.5, 0.9), GRIT, R.chance(0.2) ? 2 : 1);
        }
        if (k > 0.75 && R.chance(5 * (k - 0.75) * dt * 4)) {
          const a = R.range(0, TAU), d = R.range(6, 20);
          arcs.push({ x: hx + Math.cos(a) * d, z: hz + Math.sin(a) * d, h: 0, t, seed: R.int(0, 1e6) });
        }
        // the pulse quickens
        phase += (1.5 + 11 * e) * dt;
        if (phase >= 1) (phase -= 1), beats.push(t);
        if (R.chance(4 * e * dt)) fly.spawn(P.STAR, hx + R.range(-12, 12), hz + R.range(-10, 10), CORE_H + R.range(-10, 12), 0, 0, 4, R.range(0.2, 0.35), C[6], R.range(1, 2));
      } else if (!released) {
        released = true;
        lights.add(HX, HY, 96, C[4], 0.8, 0.5);
        lights.add(HX, HY, 28, WHITE, 0.6, 0.08);
        // the spray: sparks every way round, falling to the floor at their own depth, bouncing and skidding out
        for (let i = 0; i < 80; i++) {
          const a = R.range(0, TAU), el = R.range(-0.8, 0.8), c = Math.sqrt(1 - el * el), sp = R.range(100, 210) * (el > 0.4 ? 0.7 : 1);
          fly.spawn(R.chance(0.25) ? P.MOTE : P.SPARK, hx, hz, CORE_H, Math.cos(a) * c * sp, Math.sin(a) * c * sp, el * sp, R.range(0.35, 0.8), R.pick([C[7], C[6], C[5]]), R.range(0.8, 1.4));
        }
        for (let i = 0; i < 10; i++) {
          const a = R.range(0, TAU), el = R.range(-0.5, 0.8), sp = R.range(50, 130);
          fly.spawn(P.STAR, hx, hz, CORE_H, Math.cos(a) * sp, Math.sin(a) * sp, el * sp, R.range(0.4, 0.8), R.chance(0.5) ? C[6] : C[5], R.range(1.2, 2.4));
        }
        for (let i = 0; i < 4; i++) fly.spawn(P.SMOKE, hx + R.range(-5, 5), hz + R.range(-4, 4), CORE_H + R.range(-4, 4), R.range(-12, 12), R.range(-8, 8), R.range(8, 18), R.range(0.6, 0.85), mix(ASH, C[4], 0.3), R.range(3, 5), { delay: R.range(0.05, 0.15) });
      }
      if (released) {
        const a = t - REL;
        // where a bolt strikes the floor: a burst of sparks off it and a flash of light
        for (const s of scars)
          if (!s.hit && t >= s.t0) {
            s.hit = true;
            lights.add(s.x, s.z * FL, 26, C[5], 0.55, 0.25);
            for (let i = 0; i < 7; i++) {
              const g = R.range(0, TAU), sp = R.range(40, 120);
              fly.spawn(P.SPARK, s.x, s.z, 1, Math.cos(g) * sp, Math.sin(g) * sp, R.range(40, 150), R.range(0.3, 0.6), C[6], 1);
            }
          }
        // the shock reaches the floor round him and kicks the dust out over it in a ring
        const q = a / 0.45, r = 8 + 80 * ease.outCubic(Math.min(1, q));
        if (q < 0.8 && r > CORE_H) {
          const fr = Math.sqrt(r * r - CORE_H * CORE_H);
          for (let i = 0; i < 2; i++) {
            const g = R.range(0, TAU), v = R.range(20, 50);
            fly.spawn(P.VAPOUR, hx + Math.cos(g) * fr, hz + Math.sin(g) * fr, R.range(0, 2), Math.cos(g) * v, Math.sin(g) * v, R.range(4, 12), R.range(0.45, 0.75), mix(GRIT, WHITE, 0.3), R.range(3, 5));
          }
        }
      }
      beats = beats.filter((b) => t - b < 0.22);
      for (let i = arcs.length - 1; i >= 0; i--) if (t - arcs[i].t > 0.07) arcs.splice(i, 1);
      fly.update(dt);
      lights.update(dt);
      fly.cap(Math.max(0.001, END - 0.05 - t));
    },
    drawBack(p) {
      const k = level();
      // the floor under the hand lights up as it charges, flares with the burst and goes dark again
      const lit = t < REL ? 0.32 * k * k : 0.5 * Math.pow(1 - clamp((t - REL) / 0.5), 2);
      floorLight(p, hx, hz * FL, 14 + 36 * k, (14 + 36 * k) * FL, C[4], lit);
      scorches(p);
      fly.draw(p, behind);
      arcsAt(p, false);
      if (!coreNear) core(p);
      boltsAt(p, false);
      shock(p, true);
    },
    draw(p) {
      arcsAt(p, true);
      if (coreNear) core(p);
      boltsAt(p, true);
      shock(p, false);
      fly.draw(p, before);
      // the body catches the core's light, and flashes white with the release
      const A = o.actor;
      if (A?.mask) {
        if (t < REL) glint(p, A, level());
        else if (t - REL < 0.07) p.mask(A.mask, A.x, A.y, t - REL < 0.035 ? WHITE : C[6]);
      }
      lights.draw(p);
    },
  };

  // the core in his hand (charging) or the flare it bursts into, with the beats falling in to it
  function core(p) {
    const k = level(), e = k * k, f = Math.floor(t * 30 + 1e-4);
    if (t < REL) {
      const jit = k > 0.85 ? (f % 2 ? 1 : -1) * ((k - 0.85) / 0.15) : 0, x = HX + jit, y = HY, pr = 0.5 + 0.5 * Math.sin(phase * TAU);
      for (const b of beats) {
        const q = (t - b) / 0.22;
        p.ring(x, y, 4 + 20 * (1 - ease.inQuad(q)) * (0.5 + k), 1, q > 0.75 ? C[6] : q > 0.4 ? C[5] : C[4], 1);
      }
      const r = 1.2 + 6.5 * e + pr * (0.5 + 1.2 * k);
      p.circle(x, y, r + 1.3, C[2]);
      p.circle(x, y, r, C[4]);
      p.circle(x - r * 0.12, y - r * 0.12, r * 0.7, C[5]);
      p.circle(x, y, r * 0.38, WHITE);
      if (r > 3)
        for (const s of [0, Math.PI])
          for (let a = 0; a < 1.3; a += 0.12) {
            const ang = t * 10 + s + a, rr = r * (0.62 + 0.1 * Math.sin(a * 3));
            p.dot(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr, a < 0.5 ? WHITE : C[6]);
          }
      if (k > 0.35) {
        const q = rng(o.seed, 5, f), a = q.range(0, TAU), l = q.range(3, 6) * (0.5 + k);
        crackleSolid(p, zigzag(q, x + Math.cos(a) * r, y + Math.sin(a) * r, x + Math.cos(a) * (r + l), y + Math.sin(a) * (r + l), 0.4, 0.3), 0.7, C, 0.3);
      }
      p.glow(x, y, 12 + 30 * k, C[4], 0.35 + 0.45 * k);
      p.glow(x, y, 6 + 6 * k, C[6], 0.25 + 0.3 * k);
      return;
    }
    const a = t - REL;
    if (a < 0.22) {
      const q = a / 0.22;
      flare(p, HX, HY, 46 * Math.pow(1 - q, 1.4), 1 - q, C);
      if (q < 0.3) p.circle(HX, HY, 12 * (1 - q * 2.5) + 1.5, WHITE);
    }
    // the charge bleeds off in a few last crackles at the hand
    if (a > 0.15 && a < 0.5) {
      const qq = rng(o.seed, 8, f), ang = qq.range(0, TAU), l = qq.range(5, 10);
      crackleSolid(p, zigzag(qq, HX, HY, HX + Math.cos(ang) * l, HY + Math.sin(ang) * l, 0.45, 0.3), 0.8 * (1 - (a - 0.15) / 0.35) + 0.15, C, 0.3);
    }
  }

  // arcs whipping in to the core from the air round him (and, near the end, up off the floor)
  function arcsAt(p, near) {
    if (t >= REL) return;
    const f = Math.floor(t * 30 + 1e-4);
    for (const a of arcs) if (a.z >= 0 === near) crackleSolid(p, zigzag(rng(a.seed, f), a.x, a.z * FL - a.h, HX, HY, 0.35, 0.4), 0.85, C, 0.4);
  }

  // the bolts, struck and flickering; one that hits the floor lights it where it strikes
  function boltsAt(p, near) {
    for (const [i, b] of bolts.entries()) {
      const ba = Math.floor((t - b.t0) * 30 + 1e-4);
      if (t < b.t0 || ba >= BK.length || b.z1 >= 0 !== near) continue;
      const ex = b.x1, ey = b.z1 * FL - b.h1;
      stroke(p, zigzag(rng(o.seed, 3, i, ba >> 1), HX, HY, ex, ey, 0.25, 0.75), BK[ba], C, ba === 0 ? 0.95 : 0.75, { hero: ba === 0 });
      if (b.h1 < 0.5) p.glow(ex, ey, 14, C[5], 0.5 * BK[ba]);
    }
  }

  // the shock: a ring racing out level with the hand, a fainter echo inside it; the far half behind him
  function shock(p, back) {
    const a = t - REL, q = a / 0.45;
    if (a < 0 || q >= 1) return;
    const keep = (g) => Math.sin(g) < 0 === back, y = hz * FL - CORE_H;
    const r = 8 + 80 * ease.outCubic(q), r2 = 6 + 56 * ease.outCubic(Math.min(1, q * 1.3));
    ringBand(p, hx, y, r, Math.max(2, 4 * (1 - q)), [C[4], C[5], C[6], q < 0.18 ? WHITE : C[7]], keep);
    // (no echo ring: one clean wave front reads better at 1x than two stacked ones)
    if (!back) p.glow(HX, HY, Math.min(r * 0.9, 46), C[3], 0.42 * (1 - q) * (1 - q));
  }

  // the scorches the bolts burnt into the floor: white where they struck, cooling blue, then soot that crumbles
  // away grain by grain
  function scorches(p) {
    for (const s of scars) {
      const a = t - s.t0;
      if (a < 0) continue;
      const gone = smooth(END - 0.95, END - 0.15, t);
      for (const q of s.px) {
        if (q.g < gone) continue;
        const heat = clamp(1 - a / 0.5 - q.r * 0.05);
        const c = heat > 0.75 ? WHITE : heat > 0.45 ? C[6] : heat > 0.15 ? C[4] : SOOT;
        p.blend(q.x, q.y, c, heat > 0.15 ? 1 : 0.6);
      }
    }
  }

  // the body's edge nearest the core catches its light
  function glint(p, A, k) {
    const e = k * k;
    if (e < 0.08) return;
    const m = A.mask;
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        if (!m.data[y * m.w + x]) continue;
        const ex = A.x + x, ey = A.y + y;
        if (m.data[y * m.w + x - 1] && m.data[y * m.w + x + 1] && y > 0 && m.data[(y - 1) * m.w + x] && y < m.h - 1 && m.data[(y + 1) * m.w + x]) continue;
        const d = Math.hypot(ex + 0.5 - HX, ey + 0.5 - HY);
        if (d < 6 + 10 * k && rand(ex, ey, 7) < 0.9) p.px(ex, ey, d < 4 + 6 * k && e > 0.4 ? C[6] : C[4]);
      }
  }
}





