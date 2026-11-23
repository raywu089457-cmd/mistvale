// Magic circle cast for the game's 2:1 isometric camera: arcane/magic-circle-cast rewritten for the floor the game
// sees, not its picture squashed, stretched or scaled. The recipe is the source's: a circle draws itself on the
// floor, runes ignite one by one, it flashes, and a column of light fires up and breaks apart into glints. What
// changed is the world it happens in:
//   - the circle, its ticks and its hexagram lie on the game's 2:1 floor (the source's floor was flatter), the shocks
//     race out over it, the halos climb the column as 2:1 rings round it; the runes and the column stand upright;
//   - what it throws (sparks, the low spray of twinkles, the glints) flies every way round in 3D and falls or drifts
//     from where it is, behind the column or in front of it;
//   - it ends as light does, not as a picture: the column breaks into holes and shards, each rune goes out in a puff
//     of glints, and the circle's lines cool and break up piece by piece, shedding a glint where each piece goes.
// 1 px = 1 character sprite px (32 x 16 px tiles).
import { Lights, P, Rng, PAL, fit, flare, sparkle, clamp, smooth, ease, noise2, fract, TAU, WHITE } from "../../core/index.js";
import { glyph } from "./_lib.js";
import { floorLight } from "../fire/_lib.js";
import { Fly3 } from "../_iso.js";

const R = 40, R2 = 35, RI = 24, RR = 30, FL = 0.5, TOP = 192, W = 11, NRUNE = 8;
const PEN = [0.04, 0.42], PEN2 = [0.1, 0.48], INNER = [0.3, 0.6], STAR = [0.52, 0.88], RUNES = [0.9, 1.3];
const FLASH = 1.52, BREAK = 2.42, GONE = 3.45, END = 3.9;

export const meta = {
  name: "Magic circle cast (iso)",
  desc: "arcane/magic-circle-cast on the 2:1 floor: a circle draws itself, runes ignite, it flashes, a column of light fires up and breaks into glints, and the circle breaks up.",
  tags: ["arcane", "magic", "circle", "rune", "cast", "column", "summon", "ground", "one-shot", "iso", "top-down"],
  size: [240, 262],
  origin: [120, 212],
  duration: END,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: PAL.arcane, seed: 6 },
};

const wrap = (a) => ((a % TAU) + TAU) % TAU;
const fromFront = (g) => Math.abs(Math.atan2(Math.sin(g - Math.PI / 2), Math.cos(g - Math.PI / 2)));
const outerAt = (g, w) => w[0] + (fromFront(g) / Math.PI) * (w[1] - w[0]);
const innerAt = (g) => INNER[0] + (wrap(g + Math.PI / 2) / TAU) * (INNER[1] - INNER[0]);
const runeAngle = (k) => -Math.PI / 2 + ((k + 0.5) * TAU) / NRUNE;
const runeLit = (k) => RUNES[0] + (k * (RUNES[1] - RUNES[0])) / (NRUNE - 1);
const runeOut = (k) => BREAK + 0.2 + k * 0.08;

// how bright the drawn circle burns: settled while it's drawn, swelling as the runes light, white at the flash,
// cooling once the column breaks (its lines then break up rather than fade)
function level(t) {
  if (t < RUNES[0]) return 0.55;
  if (t < FLASH) return 0.55 + 0.4 * smooth(RUNES[0], FLASH, t);
  if (t < FLASH + 0.07) return 1.2;
  if (t < BREAK) return 0.92;
  return 0.92 - 0.55 * smooth(BREAK, GONE, t);
}

/**
 * A 1-px ring lying level (2:1) inked solid. floorRing() drew its line through the ordered dither (its alpha was a
 * per-pixel ramp), which read as static on the dark floor; here every lit pixel is a whole colour.
 */
function ringOn(p, r, colFn, onFn, keepFn) {
  const n = Math.ceil(r * TAU * 1.5);
  for (let j = 0; j < n; j++) {
    const g = (j / n) * TAU;
    if (keepFn && !keepFn(g)) continue;
    if (onFn && !onFn(g)) continue;
    const x = Math.cos(g) * r, y = Math.sin(g) * r * FL, col = colFn(g);
    p.px(x, y, col);
    p.px(x, y + 1, col);   // two rows: a solid band on screen, not a dotted one-pixel outline
  }
}

/** A ring with body, drawn solid: colour steps across its thickness, no dither. cols runs dark inner .. bright lip. */
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
      if (c) p.px(cx + ca * (r - o), cy + sa * (r - o), c);
    }
  }
}

export function create(o) {
  const C = fit(o.palette, 8), S = o.seed, Rg = new Rng(S);
  const fly = new Fly3({ rng: Rg, sparks: [WHITE, C[6], C[5], C[4]] }), lights = new Lights();
  const COL = [WHITE, C[6], C[5], C[4], C[3]];
  const strands = Array.from({ length: 9 }, () => ({ o: Rg.range(-0.85, 0.85), w: Rg.range(0.04, 0.1), f: Rg.range(1, 3) }));
  // the hexagram: two triangles inside the inner ring, each drawn edge by edge (points on the floor: x, z)
  const tri = (a0) => [0, 1, 2].map((k) => a0 + (k * TAU) / 3).map((a) => [Math.cos(a) * RI, Math.sin(a) * RI]);
  const A = tri(-Math.PI / 2), Bt = tri(Math.PI / 2), edges = [];
  for (let k = 0; k < 3; k++) for (const T of [A, Bt]) edges.push({ p0: T[k], p1: T[(k + 1) % 3], t0: STAR[0] + (k * (STAR[1] - STAR[0])) / 3, dur: (STAR[1] - STAR[0]) / 3 });
  // the circle breaking up: each piece of line goes when the break-up passes its own threshold
  const crumble = () => smooth(BREAK + 0.15, GONE, t);
  const piece = (u, v) => 0.55 + 0.45 * noise2(u * 0.35, v * 0.35, S + 3);
  let t = 0, flashed = false, broke = false, lastCrumble = 0;
  const out = new Array(NRUNE).fill(false);

  const lineCol = (lvl, age) => (age < 0.05 ? WHITE : age < 0.16 ? C[6] : lvl > 1 ? WHITE : lvl > 0.8 ? C[6] : lvl > 0.45 ? C[5] : lvl > 0.28 ? C[4] : C[3]);
  const lineA = (lvl) => clamp(lvl / 0.3);

  // a straight line on the floor, drawn by a pen from p0 to p1 over [t0, t0 + dur]; only its far or near part
  function planeLine(p, p0, p1, t0, dur, lvl, far) {
    const s = clamp((t - t0) / dur);
    if (s <= 0) return;
    const L = Math.hypot(p1[0] - p0[0], (p1[1] - p0[1]) * FL), cr = crumble();
    if (lineA(lvl) < 0.2) return;
    for (let d = 0; d <= L * s; d += 0.5) {
      const u = d / L, x = p0[0] + (p1[0] - p0[0]) * u, z = p0[1] + (p1[1] - p0[1]) * u;
      if (z < 0 !== far || (cr > 0 && piece(x, z) < cr * 1.1)) continue;
      const col = lineCol(lvl, t - (t0 + u * dur));
      p.px(x, z * FL, col);
      p.px(x, z * FL + 1, col);
    }
  }

  function circle(p, far) {
    if (t >= GONE) return;
    const lvl = level(t), keep = far ? (g) => Math.sin(g) < 0 : (g) => Math.sin(g) >= 0, a = lineA(lvl), cr = crumble();
    if (a < 0.2) return;
    const ring = (r, when, chase) =>
      ringOn(p, r, (g) => (chase && chase(g) ? WHITE : lineCol(lvl, t - when(g))), (g) => t >= when(g) && !(cr > 0 && piece(Math.cos(g) * r, Math.sin(g) * r) < cr * 1.1), keep);
    const run = t > RUNES[0] && t < BREAK ? (t - RUNES[0]) * 5 + (t - RUNES[0]) ** 2 * 4 : null;
    const chase = run === null ? null : (g) => [0, Math.PI].some((q) => Math.abs(Math.atan2(Math.sin(g - run - q), Math.cos(g - run - q))) < 0.22);
    ring(R, (g) => outerAt(g, PEN), chase);
    ring(R2, (g) => outerAt(g, PEN2));
    ring(RI, innerAt);
    for (let j = 0; j < 32; j++) {
      const g = ((j + 0.5) * TAU) / 32;
      if (Math.sin(g) < 0 !== far) continue;
      const when = outerAt(g, PEN2) + 0.03;
      if (t < when || (cr > 0 && piece(Math.cos(g) * R, Math.sin(g) * R + 7) < cr * 1.1)) continue;
      // the long ticks: the shorter ones simply take a dimmer step of the ramp, they are not half-lit
      const tc2 = j % 2 ? (lvl > 0.8 ? C[5] : C[4]) : lineCol(lvl, t - when);
      p.line(Math.cos(g) * R2, Math.sin(g) * R2 * FL, Math.cos(g) * R, Math.sin(g) * R * FL, tc2);
      p.line(Math.cos(g) * R2, Math.sin(g) * R2 * FL + 1, Math.cos(g) * R, Math.sin(g) * R * FL + 1, tc2);
    }
    for (const e of edges) planeLine(p, e.p0, e.p1, e.t0, e.dur, lvl, far);
  }

  // the runes stand on the circle; dim when the inner pen passes, lit one by one, each going out in a white blink
  function runes(p, far) {
    for (let k = 0; k < NRUNE; k++) {
      const g = runeAngle(k);
      if (Math.sin(g) < 0 !== far) continue;
      const x = Math.cos(g) * RR, y0 = Math.sin(g) * RR * FL, lit = t - runeLit(k), go = t - runeOut(k);
      if (t < innerAt(g) || go >= 0.07) continue;
      if (lit < 0) {
        glyph(p, k, x, y0 - 1, C[3]);
        continue;
      }
      const rise = 3 * ease.outBack(clamp(lit / 0.2), 2.4), bob = lit > 0.2 ? Math.sin(t * 5 + k) * 0.5 : 0, y = y0 - 1 - rise + bob;
      const hot = lit < 0.07 || (t > FLASH && t < FLASH + 0.07) || go >= 0, lvl = level(t);
      glyph(p, k, x, y, hot ? WHITE : lvl > 0.8 ? WHITE : C[6], 1, hot ? C[6] : C[4]);
      if (lit < 0.1) sparkle(p, x, y - 2, 4 * (1 - lit / 0.1) + 1, C[6], C[5], 0.5);
      p.glow(x, y - 2, 8, C[5], 0.3 + 0.3 * lvl);
    }
  }

  // the column of light: the thread that climbs first, then the beam that fires up, holds and breaks into holes
  function column(p) {
    if (t < FLASH - 0.22 || t > BREAK + 0.6) return;
    if (t < FLASH) {
      const a = smooth(FLASH - 0.22, FLASH - 0.04, t), top = -(TOP - 10) * ease.outCubic(a);
      for (let y = -1; y >= top; y--) {
        const k = a * (0.35 + 0.65 * (1 + y / TOP));
        if (k < 0.4) continue;   // the thread appears at full ink as the pen climbs, it is not dithered in
        p.px(0, y, k > 0.8 ? WHITE : C[6]);
      }
      p.glow(0, top, 9, C[6], 0.5 * a);
      p.glow(0, -6, 24, C[5], 0.4 * a);
      return;
    }
    const u = t - FLASH, brk = clamp((t - BREAK) / 0.45), top = -TOP * ease.outExpo(clamp(u / 0.09));
    const w = t < BREAK ? W * (1 + 0.38 * Math.exp(-u * 9)) : W * (1 - ease.outCubic(brk) * 0.85);
    const lit = 1 - brk, white = u < 0.067;
    for (let y = 3; y >= Math.ceil(top); y--) {
      const h = -y, ww = w * (1 + 0.5 * Math.exp(-Math.max(0, h) / 6)), pulse = fract(h * 0.022 - u * 2.6) < 0.07 ? 1 : 0;
      for (let x = Math.floor(-ww * 1.3); x <= Math.ceil(ww * 1.3); x++) {
        const q = Math.abs(x + 0.5) / ww;
        // as it breaks, holes open and grow and drift upward until nothing is left
        if (brk > 0 && noise2(x * 0.32, h * 0.11 - (t - BREAK) * 6, S) * 0.5 + 0.5 < brk * 1.3 - 0.1) continue;
        let lv = q < 0.2 ? 0 : q < 0.42 ? 1 : q < 0.66 ? 2 : q < 0.88 ? 3 : 4;
        for (const s of strands) if (Math.abs((x + 0.5) / ww - s.o - 0.05 * Math.sin(t * s.f + s.o * 9)) < s.w) lv = Math.max(0, lv - 1);
        lv = white ? 0 : Math.max(0, lv - pulse);
        if (q > 1) continue;   // the flare ends on a hard edge of its darkest step, not a dithered fade
        p.px(x, y, COL[lv]);
      }
      if ((h & 7) === 0 && h < TOP - ww * 2.4 - 8) p.glow(0, y, ww * 2.4 + 6, C[5], 0.3 * lit);
    }
    // halos climbing it: rings round the column, 2:1 like everything level
    for (let i = 0; i < 6; i++) {
      const k = (t - (FLASH + 0.08 + i * 0.16)) / 0.8;
      if (k < 0 || k > 1 || t > BREAK) continue;
      const rx = w * 1.4 * (1 + k * 0.35), ry = rx * FL, yc = -3 - ease.outQuad(k) * 120, n = Math.ceil(rx * 7);
      for (let j = 0; j < n; j++) {
        const g = (j / n) * TAU;
        p.px(Math.cos(g) * rx, yc + Math.sin(g) * ry, k < 0.3 ? WHITE : k < 0.8 ? C[6] : C[5]);
      }
    }
    p.glow(0, -4, 34, C[6], 0.45 * lit);
    p.glow(0, -60, 70, C[4], 0.25 * lit);
  }

  function shock(p, far) {
    for (const [d, r0, r1, th, dur] of [[0, R * 0.6, R * 2, 6, 0.5], [0.08, R * 0.4, R * 1.4, 3, 0.4]]) {
      const k = (t - FLASH - d) / dur;
      if (k < 0 || k >= 1) continue;
      ringBand(p, 0, 0, r0 + (r1 - r0) * ease.outCubic(k), Math.max(2, th * (1 - k)), [C[3], C[5], C[6], k < 0.25 ? WHITE : C[6]], (g) => Math.sin(g) < 0 === far);
    }
  }

  const star = (x, z, h, vx, vz, vh, life, c, size, delay = 0) => fly.spawn(P.STAR, x, z, h, vx, vz, vh, life, c, size, { delay });
  return {
    update(dt) {
      t += dt;
      // the pens shed glitter as they write
      if (t > PEN[0] && t < STAR[1] && Rg.chance(0.5)) {
        let x, z;
        if (t < PEN[1]) {
          const g = Math.PI / 2 + Rg.sign() * ((t - PEN[0]) / (PEN[1] - PEN[0])) * Math.PI;
          (x = Math.cos(g) * R), (z = Math.sin(g) * R);
        } else if (t < INNER[1]) {
          const g = -Math.PI / 2 + ((t - INNER[0]) / (INNER[1] - INNER[0])) * TAU;
          (x = Math.cos(g) * RI), (z = Math.sin(g) * RI);
        } else {
          const e = Rg.pick(edges.filter((e) => t >= e.t0 && t < e.t0 + e.dur)) ?? edges[0], s = clamp((t - e.t0) / e.dur);
          (x = e.p0[0] + (e.p1[0] - e.p0[0]) * s), (z = e.p0[1] + (e.p1[1] - e.p0[1]) * s);
        }
        fly.spawn(P.EMBER, x, z, 1, Rg.range(-12, 12), Rg.range(-8, 8), Rg.range(8, 30), Rg.range(0.25, 0.55), C[6], 1);
      }
      // gathering: light rushes in over the floor to the heart of the circle from all round
      if (t > RUNES[1] - 0.1 && t < FLASH - 0.05 && Rg.chance(0.7)) {
        const g = Rg.range(0, TAU), D = Rg.range(R * 0.7, R * 1.1), T = Rg.range(0.16, 0.24), v = (D * 3) / (Math.exp(3 * T) - 1);
        fly.spawn(P.STREAK, Math.cos(g) * D, Math.sin(g) * D, 1, -Math.cos(g) * v, -Math.sin(g) * v, 4, T, Rg.chance(0.5) ? C[6] : C[5]);
      }
      if (!flashed && t >= FLASH) {
        flashed = true;
        lights.add(0, -56, 104, C[5], 0.9, 0.6);
        lights.add(0, -5, 36, WHITE, 0.8, 0.14);
        for (let i = 0; i < 36; i++) {
          const g = Rg.range(0, TAU), d = Rg.range(0, R * 0.5), sp = Rg.range(70, 150);
          fly.spawn(P.SPARK, Math.cos(g) * d, Math.sin(g) * d, 1, Math.cos(g) * sp, Math.sin(g) * sp, Rg.range(30, 180), Rg.range(0.25, 0.7));
        }
        for (let i = 0; i < 26; i++) {
          const g = Rg.range(0, TAU), d = Rg.range(0, R);
          star(Math.cos(g) * d, Math.sin(g) * d, Rg.range(1, 6), Rg.range(-20, 20), Rg.range(-12, 12), Rg.range(40, 130), Rg.range(0.5, 1.1), Rg.pick([WHITE, C[6], C[5]]), Rg.range(0.8, 2.3));
        }
        // and a spray of twinkles flung out low over the floor every way round
        for (let i = 0; i < 34; i++) {
          const g = Rg.range(0, TAU), sp = Rg.range(50, 130);
          star(Math.cos(g) * 6, Math.sin(g) * 6, Rg.range(1, 4), Math.cos(g) * sp, Math.sin(g) * sp, Rg.range(10, 90), Rg.range(0.4, 0.95), Rg.pick([WHITE, C[6], C[6], C[5]]), Rg.range(0.7, 2.2));
        }
      }
      // glints pop along the burning circle
      if (t > RUNES[0] && t < BREAK + 0.2 && Rg.chance(0.12)) {
        const g = Rg.range(0, TAU), r = Rg.pick([R, R2, RI]);
        star(Math.cos(g) * r, Math.sin(g) * r, 1, 0, 0, Rg.range(2, 8), Rg.range(0.25, 0.45), Rg.pick([WHITE, C[6]]), Rg.range(0.8, 2));
      }
      // the column throws off stars, and light streams up inside it
      if (t > FLASH && t < BREAK) {
        if (Rg.chance(0.5)) {
          const g = Rg.range(0, TAU), d = Rg.range(0, 1) * W * 1.5;
          star(Math.cos(g) * d, Math.sin(g) * d, Rg.range(0, 120), Rg.range(-10, 10), Rg.range(-6, 6), Rg.range(30, 85), Rg.range(0.5, 1.1), Rg.pick([WHITE, C[6], C[5]]), Rg.range(0.7, 2));
        }
        if (Rg.chance(0.35)) fly.spawn(P.MOTE, Rg.range(-1, 1) * W * 0.8, Rg.range(-4, 4), Rg.range(0, 50), 0, 0, Rg.range(160, 300), Rg.range(0.2, 0.35), Rg.chance(0.5) ? WHITE : C[6], 0.8);
      }
      // it breaks apart into glints that twinkle as they drift up
      if (!broke && t >= BREAK) {
        broke = true;
        for (let i = 0; i < 46; i++) star(Rg.range(-1, 1) * W * 0.9, Rg.range(-5, 5), Rg.range(2, TOP * 0.8), Rg.range(-12, 12), Rg.range(-8, 8), Rg.range(8, 40), Rg.range(0.5, 1.15), Rg.pick([WHITE, WHITE, C[6], C[5]]), Rg.range(0.6, 2.4));
      }
      if (t > BREAK && t < BREAK + 0.4 && Rg.chance(0.8)) {
        star(Rg.range(-1, 1) * W * 0.7, Rg.range(-4, 4), Rg.range(2, TOP * 0.78), Rg.range(-8, 8), Rg.range(-5, 5), Rg.range(10, 50), Rg.range(0.4, 0.9), Rg.pick([WHITE, C[6], C[5]]), Rg.range(0.6, 1.8));
        if (Rg.chance(0.4)) fly.spawn(P.MOTE, Rg.range(-1, 1) * W * 0.5, 0, Rg.range(2, TOP * 0.7), 0, 0, Rg.range(60, 140), Rg.range(0.2, 0.4), C[6], 0.7);
      }
      // the runes go out one by one, each in a little puff of glints
      for (let k = 0; k < NRUNE; k++)
        if (!out[k] && t >= runeOut(k)) {
          out[k] = true;
          const g = runeAngle(k), x = Math.cos(g) * RR, z = Math.sin(g) * RR;
          for (let i = 0; i < 5; i++) star(x + Rg.range(-2, 2), z + Rg.range(-1, 1), Rg.range(3, 7), Rg.range(-14, 14), Rg.range(-8, 8), Rg.range(10, 40), Rg.range(0.3, 0.55), Rg.pick([WHITE, C[6]]), Rg.range(0.6, 1.6));
        }
      // the circle's lines break up: a glint off a piece of it as it goes
      const cr = crumble();
      if (cr > lastCrumble && cr < 1)
        for (let i = 0; i < 3; i++) {
          if (!Rg.chance(0.8)) continue;
          const g = Rg.range(0, TAU), r = Rg.pick([R, R2, RI]), x = Math.cos(g) * r, z = Math.sin(g) * r, v = piece(x, z);
          if (v < cr * 1.1 && v > lastCrumble * 1.1 - 0.05) star(x, z, 1, 0, 0, Rg.range(4, 12), Rg.range(0.25, 0.45), Rg.pick([C[6], C[5]]), Rg.range(0.6, 1.4));
        }
      lastCrumble = cr;
      fly.update(dt);
      lights.update(dt);
      fly.cap(Math.max(0.001, END - 0.05 - t));
    },
    drawBack(p) {
      const lvl = level(t);
      if (t < GONE) {
        // the circle's light on the floor, 2:1, going as its lines go
        const k = lvl * smooth(PEN[0], PEN[1] + 0.2, t) * (1 - crumble());
        floorLight(p, 0, 0, R * 1.3, R * 1.3 * FL, C[4], 0.3 * k);
      }
      shock(p, true);
      circle(p, true);
      runes(p, true);
      fly.draw(p, (q) => q.z < 0);
      column(p);
    },
    draw(p) {
      shock(p, false);
      circle(p, false);
      runes(p, false);
      // the pens: white points running round, writing light
      const pen = (x, y) => {
        sparkle(p, x, y, 2, C[6], C[5], 0.5);
        p.glow(x, y, 7, C[6], 0.45);
      };
      if (t > PEN[0] && t < PEN[1]) for (const s of [-1, 1]) {
        const g = Math.PI / 2 + s * ((t - PEN[0]) / (PEN[1] - PEN[0])) * Math.PI;
        pen(Math.cos(g) * R, Math.sin(g) * R * FL);
      }
      if (t > INNER[0] && t < INNER[1]) {
        const g = -Math.PI / 2 + ((t - INNER[0]) / (INNER[1] - INNER[0])) * TAU;
        pen(Math.cos(g) * RI, Math.sin(g) * RI * FL);
      }
      for (const e of edges)
        if (t > e.t0 && t < e.t0 + e.dur) {
          const s = (t - e.t0) / e.dur;
          pen(e.p0[0] + (e.p1[0] - e.p0[0]) * s, (e.p0[1] + (e.p1[1] - e.p0[1]) * s) * FL);
        }
      if (t >= FLASH && t < FLASH + 0.24) {
        const a = (t - FLASH) / 0.24;
        flare(p, 0, -8, 34 * Math.pow(1 - a, 1.5), 1 - a, C);
        p.glow(0, -26, 56, WHITE, 0.5 * (1 - a));
      }
      fly.draw(p, (q) => q.z >= 0);
      lights.draw(p);
    },
  };
}



