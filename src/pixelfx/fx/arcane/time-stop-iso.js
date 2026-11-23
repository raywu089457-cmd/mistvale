// Time stop for the game's 2:1 isometric camera: arcane/time-stop rewritten as an area spell for the floor the game
// sees, with arcane/rune-circle marking the area on the floor, not their pictures squashed, stretched or scaled. The
// recipes are the sources': a clock face springs open, ticks slower and slower, freezes drained of colour, cracks
// and shatters into falling shards; a rune circle turns on the floor, runes riding round it lit by chasing light, a
// square turning inside, motes rising off it. What changed:
//   - it is an area: the rune circle lies 2:1 on the floor round where it's cast (`reach` px from its middle), drawn
//     by a pen of light running round from the front; the clock hangs upright over its middle;
//   - time slows inside it: the circle's turning, the chasing light, the motes rising off it and the ripples each
//     tick sends out over the floor all run on the clock's own time, so they drag to a halt and hang there, drained
//     of colour, until it breaks;
//   - it breaks the way glass does: cracks walk out over the clock and over the floor circle, the clock bursts into
//     shards that fly in 3D, fall, skid and melt where they lie, and the circle breaks into glints as colour comes
//     back into the world.
// 1 px = 1 character sprite px (32 x 16 px tiles).
import { Lights, P, Rng, PAL, fit, flare, sparkle, clamp, smooth, ease, luma, rgb, cycle, TAU, WHITE, GRAVITY } from "../../core/index.js";
import { glyph, mote } from "./_lib.js";
import { floorLight } from "../fire/_lib.js";
import { Fly3 } from "../_iso.js";

const CY = -42, RC = 26, OPEN = 0.3, FREEZE = 1.75, CRACK = 2.2, SHATTER = 2.42, FL = 0.5, NR = 12;
const TICKS = [0.36, 0.46, 0.57, 0.7, 0.85, 1.03, 1.24, 1.49];

export const meta = {
  name: "Time stop (iso)",
  desc: "arcane/time-stop as an area spell on the 2:1 floor: a rune circle marks the area, a clock over it ticks slower until everything in it stops drained grey, then it all shatters.",
  tags: ["arcane", "time", "clock", "freeze", "stop", "shatter", "rune", "circle", "aoe", "magic", "one-shot", "iso", "top-down"],
  size: [236, 190],
  origin: [118, 128],
  duration: 3.7,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: PAL.arcane, reach: 56, seed: 14 },
};

/** When everything in the area stops (drained of colour) and when it breaks free again: for the game to hold
 *  whatever stands inside `reach` still and grey between the two. */
export const timing = { stop: FREEZE, release: SHATTER };

function hand(t) {
  let a = 0;
  for (const tk of TICKS) if (t > tk) a += ease.outBack(clamp((t - tk) / 0.07), 3);
  return -Math.PI / 2 + a * (TAU / 12);
}
const flow = (t) => (t < OPEN ? 1 : Math.max(0, 1 - (t - OPEN) / (FREEZE - OPEN)) ** 1.6);
function clockTime(t) {
  let s = 0;
  for (let u = 0; u < Math.min(t, FREEZE); u += 1 / 120) s += flow(u) / 120;
  return s;
}
// a 1 px ring lying 2:1 on the floor, stepped round its rim (cheaper than shading its whole box): c and a may be
// functions of the angle round it, keep(g) picks the far or near half
function ellipse(p, r, c, a, keep) {
  if (r < 0.5) return;
  const fc = typeof c === "function", fa = typeof a === "function", m = Math.ceil(TAU * Math.sqrt((r * r + (r * FL) ** 2) / 2) * 1.6);
  for (let j = 0; j < m; j++) {
    const g = (j / m) * TAU;
    if (!keep(g)) continue;
    const k = fa ? a(g) : a;
    if (k < 0.5) continue;   // a 1 px ring is either there or not: it never fades through a dither
    const col = fc ? c(g) : c, x = Math.cos(g) * r, y = Math.sin(g) * r * FL;
    p.px(x, y, col);
    p.px(x, y + 1, col);   // two rows on screen: a solid band, not a one-pixel dotted outline
  }
}
const gap = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const fromFront = (g) => gap(g, Math.PI / 2);

export function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed), RA = o.reach, RR = RA - 7, RI = RA * 0.5, RCc = RA * 0.15, END = meta.duration;
  const G = C.map((c) => {
    const l = luma(c) * 255;
    return rgb(l * 0.92, l * 0.96, Math.min(255, l * 1.06));
  });
  const fly = new Fly3({ rng: R, sparks: [WHITE, C[6], C[5], C[4]] }), lights = new Lights(), shards = [];
  const motes = Array.from({ length: 14 }, (_, i) => ({ a: R.range(0, TAU), r: RC + R.range(5, 14), w: R.range(1.4, 2.6) * (i % 2 ? 1 : -1), tilt: R.range(-0.5, 0.5), c: R.pick([WHITE, C[6], C[5]]) }));
  // cracks: jagged walks out from a point on the face, and out from the middle over the floor circle
  const ix = R.range(-6, 6), iy = R.range(-6, 6), cracks = [], floorCracks = [];
  const walk = (out, x, y, a, len, depth, lim, step) => {
    const pts = [[x, y]];
    for (let s = 0; s < len; s++) {
      a += R.range(-0.55, 0.55);
      x += Math.cos(a) * R.range(step * 0.6, step);
      y += Math.sin(a) * R.range(step * 0.6, step);
      if (Math.hypot(x, y) > lim) break;
      pts.push([x, y]);
      if (depth < 1 && pts.length > 3 && R.chance(0.14)) walk(out, x, y, a + R.sign() * R.range(0.6, 1.1), len / 2, depth + 1, lim, step);
    }
    out.push(pts);
  };
  for (let i = 0; i < 7; i++) walk(cracks, ix, iy, (i / 7) * TAU + R.range(-0.3, 0.3), 16, 0, RC - 0.5, 2.6);
  for (let i = 0; i < 6; i++) walk(floorCracks, 0, 0, (i / 6) * TAU + R.range(-0.3, 0.3), 30, 0, RA - 1, 3.4);
  let t = 0, tc = 0, ticked = 0, shattered = false, frozen = false;
  const cold = () => t >= FREEZE && t < SHATTER + 0.1;
  const K = () => (t >= FREEZE && t < FREEZE + 0.06) || (t >= SHATTER - 0.05 && t < SHATTER) ? G.map(() => WHITE) : cold() ? G : C;
  // when the pen drawing the circle passes angle g, from the front round both sides
  const penAt = (g) => 0.02 + (fromFront(g) / Math.PI) * 0.3;
  // the circle breaking up after the shatter: each piece goes at its own moment, shedding a glint
  const piece = (g, r) => 0.5 + 0.5 * Math.sin(g * 7 + r * 0.3 + o.seed) * Math.cos(g * 3 - r * 0.17);
  const broken = () => smooth(SHATTER, SHATTER + 0.7, t);

  return {
    update(dt) {
      t += dt;
      tc = clockTime(t);
      while (ticked < TICKS.length && t >= TICKS[ticked]) {
        ticked++;
        const a = hand(t + 0.1), x = Math.cos(a) * (RC + 1), y = CY + Math.sin(a) * (RC + 1);
        lights.add(x, y, 22, C[6], 0.6, 0.12);
        for (let i = 0; i < 3; i++) fly.spawn(P.STAR, x, 0, -y, Math.cos(a) * 30 + R.range(-15, 15), R.range(-8, 8), -Math.sin(a) * 30 + R.range(-15, 15), R.range(0.2, 0.4), R.pick([WHITE, C[6]]), R.range(0.7, 1.3), { g: 0 });
      }
      if (!frozen && t >= FREEZE) {
        frozen = true;
        lights.add(0, CY, 70, WHITE, 0.7, 0.2);
      }
      if (!shattered && t >= SHATTER) {
        shattered = true;
        lights.add(0, CY, 80, WHITE, 0.8, 0.16);
        lights.add(0, CY, 100, C[5], 0.6, 0.6);
        // the face bursts into shards, cold grey, flying every way and falling to the floor at their own depth
        for (let i = 0; i < 60; i++) {
          const a = R.range(0, TAU), d = R.range(0, RC), x = Math.cos(a) * d, y = Math.sin(a) * d, sp = R.range(40, 130);
          const dx = x - ix, dy = y - iy, l = Math.hypot(dx, dy) || 1, out = R.range(-0.6, 0.9);
          shards.push({ x, z: 0, h: -CY - y, vx: (dx / l) * sp + R.range(-25, 25), vz: out * sp, vh: (-dy / l) * sp * 0.7 + R.range(40, 110), a: R.range(0, TAU), va: R.range(-22, 22), s: R.range(1.5, 3.6), life: R.range(0.8, 1.15), rest: false, c: R.pick([G[7], G[6], G[6], G[5]]) });
        }
        for (let i = 0; i < 26; i++) {
          const a = R.range(0, TAU), el = R.range(-0.6, 0.8), sp = R.range(30, 110), c = Math.sqrt(1 - el * el);
          fly.spawn(i % 2 ? P.STAR : P.MOTE, 0, 0, -CY, Math.cos(a) * c * sp, Math.sin(a) * c * sp, el * sp, R.range(0.4, 0.8), R.pick([WHITE, C[6], C[5]]), R.range(0.8, 1.8));
        }
        for (let i = 0; i < 18; i++) {
          const a = R.range(0, TAU), el = R.range(-0.5, 0.8), sp = R.range(80, 180), c = Math.sqrt(1 - el * el);
          fly.spawn(P.SPARK, 0, 0, -CY, Math.cos(a) * c * sp, Math.sin(a) * c * sp, el * sp, R.range(0.25, 0.5));
        }
        // the stopped time it held lifts away as a cold vapour
        for (let i = 0; i < 12; i++) {
          const a = R.range(0, TAU), d = R.range(0, RC * 0.8);
          fly.spawn(P.VAPOUR, Math.cos(a) * d, R.range(-6, 6), -CY - Math.sin(a) * d, Math.cos(a) * R.range(10, 40), R.range(-10, 10), R.range(5, 20), R.range(0.6, 1), R.chance(0.5) ? G[5] : C[4], R.range(3, 6));
        }
      }
      // the floor circle breaking up: glints off the pieces as they go
      const b = broken();
      if (b > 0 && b < 1 && R.chance(0.9))
        for (let i = 0; i < 3; i++) {
          const g = R.range(0, TAU), r = R.pick([RA, RI, RR]), v = piece(g, r);
          if (Math.abs(v - b) < 0.12) fly.spawn(P.STAR, Math.cos(g) * r, Math.sin(g) * r, 1, 0, 0, R.range(5, 16), R.range(0.25, 0.45), R.pick([C[6], C[5], WHITE]), R.range(0.6, 1.5));
        }
      // the shards: tumbling, falling, a skid where they land, melting shorter where they lie
      for (let i = shards.length - 1; i >= 0; i--) {
        const s = shards[i];
        if ((s.life -= dt) <= 0) { shards.splice(i, 1); continue; }
        if (s.rest) {
          const f = Math.exp(-7 * dt);
          s.x += s.vx * dt; s.z += s.vz * dt; s.vx *= f; s.vz *= f;
          continue;
        }
        const k = Math.exp(-0.5 * dt);
        s.vx *= k; s.vz *= k; s.vh = s.vh * k - GRAVITY * 0.9 * dt;
        s.x += s.vx * dt; s.z += s.vz * dt; s.h += s.vh * dt; s.a += s.va * dt;
        if (s.h <= 0) {
          s.h = 0;
          if (-s.vh > 80) (s.vh = -s.vh * 0.25), (s.vx *= 0.6), (s.vz *= 0.6), (s.va *= 0.5);
          else (s.rest = true), (s.vx *= 0.5), (s.vz *= 0.5);
        }
      }
      fly.update(dt);
      lights.update(dt);
      const left = Math.max(0.001, END - 0.05 - t);
      fly.cap(left);
      for (const s of shards) if (s.life > left) s.life = left;
    },
    drawBack(p) {
      // the area's light on the floor while time is held in it: cold once it stops
      const k = smooth(0, OPEN, t) * (1 - smooth(SHATTER, SHATTER + 0.5, t));
      if (k > 0) floorLight(p, 0, 0, RA * 1.2, RA * 1.2 * FL, cold() ? G[5] : C[4], 0.26 * k);
      circle(p, true);
      floorMotes(p, true);
      tickRipples(p, true);
      fracture(p, true);
      fly.draw(p, (q) => q.z < 0);
      flying(p, false);
      if (t < SHATTER) for (const m of motes) drawMote(p, m, true);
    },
    draw(p) {
      circle(p, false);
      floorMotes(p, false);
      tickRipples(p, false);
      fracture(p, false);
      const s = t < OPEN ? ease.outBack(t / OPEN, 2.6) : 1;
      if (t < SHATTER) {
        face(p, K(), s, clamp((t - CRACK) / 0.18));
        p.glow(0, CY, RC * 1.9, cold() ? G[5] : C[4], 0.32 * s);
        p.glowRing(0, CY, RC, 7, cold() ? G[6] : C[5], 0.28 * s);
        for (const m of motes) drawMote(p, m, false);
      }
      if (t < 0.35) {
        const q = t / 0.35;
        p.ring(0, CY, RC * (0.4 + 1.2 * ease.outCubic(q)), Math.max(1, 3 * (1 - q)), q < 0.3 ? WHITE : C[6]);
        if (q < 0.5) flare(p, 0, CY, 26 * (1 - q * 2) + 2, 1 - q * 2, C);
      }
      if (t < SHATTER)
        for (let ti = 0; ti < TICKS.length; ti++) {
          if (ti % 2) continue;   // every other beat gets a ring: eight stacked rings read as clutter, not as waves
          const tk = TICKS[ti];
          if (t < tk) continue;
          const q = (tc - clockTime(tk)) / 0.32;
          if (q >= 1) continue;
          p.ring(0, CY, RC + 3 + 24 * ease.outCubic(q), 2, cold() ? G[4] : q < 0.25 ? C[5] : q < 0.6 ? C[4] : C[3]);
        }
      if (t >= SHATTER && t < SHATTER + 0.2) {
        const q = (t - SHATTER) / 0.2;
        flare(p, 0, CY, 34 * (1 - q) + 2, 1 - q, C);
        p.ring(0, CY, RC + 30 * ease.outCubic(q), Math.max(1, 3 * (1 - q)), q < 0.3 ? WHITE : C[6]);
      }
      flying(p, true);
      fly.draw(p, (q) => q.z >= 0);
      lights.draw(p);
    },
  };

  // the clock face, upright over the middle of the area, in ramp K: glass, rims, ticks, hands, hub, cracks
  function face(p, K, s, cracked) {
    const r = RC * s;
    if (r < 1) return;
    p.disc(0, CY, r, K[1], (d) => 0.3 + 0.35 * d * d);
    p.ring(0, CY, r + 0.5, 1, K[6]);
    p.ring(0, CY, r - 1.5, 1, K[4]);
    p.ring(0, CY, r + 2, 1, K[2]);
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * TAU;
      if (i % 5) p.px(Math.cos(a) * (r - 3.5), CY + Math.sin(a) * (r - 3.5), K[3]);
      else {
        const q = i % 15 === 0, r0 = r - (q ? 8 : 6.5);
        p.line(Math.cos(a) * r0, CY + Math.sin(a) * r0, Math.cos(a) * (r - 3), CY + Math.sin(a) * (r - 3), q ? K[7] : K[6]);
      }
    }
    p.ring(0, CY, r * 0.3, 2, K[3]);
    const ha = -Math.PI / 2 + (hand(t) + Math.PI / 2) / 12 + 0.9, sa = hand(t) + (frozen ? Math.sin(t * 70) * 0.012 : 0);
    p.beam(0, CY, Math.cos(ha) * r * 0.48, CY + Math.sin(ha) * r * 0.48, 2.6, (u, v) => (v < 0.5 ? K[6] : K[4]));
    p.line(-Math.cos(sa) * 5, CY - Math.sin(sa) * 5, Math.cos(sa) * (r - 4), CY + Math.sin(sa) * (r - 4), (u) => (u > 0.75 ? K[7] : K[6]));
    p.line(-Math.cos(sa) * 5 + 0.5, CY - Math.sin(sa) * 5, -Math.cos(sa) * 2, CY - Math.sin(sa) * 2, K[5]);
    p.circle(0, CY, 2.2, K[5]);
    p.circle(0, CY, 1.2, K[7]);
    if (cracked > 0)
      for (const pts of cracks)
        for (let i = 0, n = Math.floor(pts.length * cracked); i < n; i++) {
          const [x, y] = pts[i], fresh = i > n - 3 && cracked < 1;
          p.px(x, CY + y, fresh ? WHITE : K[7]);
          if (!fresh) p.px(x, CY + y - 1, K[2]);
        }
  }

  // the rune circle on the floor: drawn round from the front by a pen of light, turning on the clock's time, its
  // runes riding round lit by two chasing sparks; drained when time stops; it breaks up after the shatter
  function circle(p, far) {
    if (t > SHATTER + 0.75) return;
    const k = K(), spin = (tc * TAU) / 16, chase = tc * TAU * 0.5, b = broken(), keep = (g) => Math.sin(g) < 0 === far;
    const lit = (g, w) => !cold() && (gap(g, chase) < w || gap(g, chase + Math.PI) < w);
    const shown = (g, r) => t >= penAt(g) && (b <= 0 || piece(g, r) > b);
    const ring = (r, hi, lo) => ellipse(p, r, (g) => (lit(g, 0.22) && r === RA ? WHITE : Math.sin(g) < 0 ? lo : hi), (g) => (shown(g, r) ? 1 : 0), keep);
    ring(RA, k[6], k[5]);
    ring(RI, k[5], k[4]);
    ring(RCc, k[6], k[5]);
    for (let j = 0; j < 16; j++) {
      const g = spin + ((j + 0.5) * TAU) / 16;
      if (Math.sin(g) < 0 !== far || !shown(g, RA + 3.5)) continue;
      const x = Math.cos(g) * (RA + 3.5), y = Math.sin(g) * (RA + 3.5) * FL, hot = lit(g, 0.3);
      p.px(x, y, hot ? WHITE : Math.sin(g) < 0 ? k[4] : j % 2 ? k[5] : k[6]);
      if (j % 2 === 0) for (const dx of [1, -1]) p.px(x + dx, y, hot ? k[6] : Math.sin(g) < 0 ? k[3] : k[4]);
    }
    // a square turning the other way inside the inner ring, its corners touching it
    const pts = [0, 1, 2, 3].map((q) => -spin + (q * TAU) / 4 + Math.PI / 4);
    for (let q = 0; q < 4; q++) {
      const g0 = pts[q], g1 = pts[(q + 1) % 4];
      for (let u = 0; u <= 1; u += 0.02) {
        const x = Math.cos(g0) * RI * (1 - u) + Math.cos(g1) * RI * u, z = Math.sin(g0) * RI * (1 - u) + Math.sin(g1) * RI * u, g = Math.atan2(z, x);
        if (z < 0 !== far || !shown(g, Math.hypot(x, z))) continue;
        p.dot(x, z * FL, far ? k[4] : k[5], 1);
      }
    }
    // the runes ride round in the band, bright at the front, dim behind, flaring as the light passes
    const gs = [...Array(NR).keys()].map((q) => [q, spin + ((q + 0.5) * TAU) / NR]).filter(([, g]) => Math.sin(g) < 0 === far);
    gs.sort((a, b2) => Math.sin(a[1]) - Math.sin(b2[1]));
    for (const [q, g] of gs) {
      if (!shown(g, RR)) continue;
      const x = Math.cos(g) * RR, y = Math.sin(g) * RR * FL, hot = lit(g, 0.2), bob = Math.sin(tc * TAU + 4 * g) * 0.5, rise = 2 * ease.outBack(clamp((t - penAt(g)) / 0.2), 2);
      glyph(p, [0, 3, 5][q % 3], x, y - 1 - rise + bob + 2, hot ? WHITE : far ? k[5] : k[6], 1, hot ? k[5] : far ? k[2] : k[3]);
      p.glow(x, y - 3, hot ? 10 : 6, cold() ? G[5] : C[5], hot ? 0.5 : far ? 0.12 : 0.22);
    }
    // the pens drawing it
    if (t < 0.34) for (const s of [-1, 1]) {
      const g = Math.PI / 2 + s * clamp((t - 0.02) / 0.3) * Math.PI;
      if (Math.sin(g) < 0 !== far) continue;
      sparkle(p, Math.cos(g) * RA, Math.sin(g) * RA * FL, 2, C[6], C[5], 0.5);
    }
  }

  // motes rising off the circle on a slow helix, on the clock's time: they slow, stop and hang, drained
  function floorMotes(p, far) {
    if (t > SHATTER) return;
    const D = 4, c = cold();
    cycle(tc + 3, D, 60, o.seed * 5 + 1, (g) => g.range(1.1, 1.9), (age, life, r) => {
      const g0 = r.range(0, TAU), r0 = r.pick([RA, RA, RR, RR, RI]), q = age / life, g = g0 + q * r.range(0.6, 1.4);
      if (Math.sin(g) < 0 !== far || t < penAt(g) + 0.2) return;
      const rr = r0 * (1 - 0.35 * q), h = 2 + ease.outQuad(q) * r.range(26, 52), x = Math.cos(g) * rr, y = Math.sin(g) * rr * FL - h;
      const a = Math.min(1, q * 5) * (1 - smooth(0.65, 1, q)), big = r.chance(0.2), v = flow(t);
      const col = c ? G[6] : r.chance(0.3) ? WHITE : r.chance(0.6) ? C[6] : C[5];
      mote(p, x, y, -Math.sin(g) * rr * 0.8 * v, (-36 * (1 - q) - 10) * v + 0.01, col, big ? 1.1 : r.range(0.55, 0.9), a, c ? 0.15 : big ? 0.5 : 0.3);
    });
  }

  // each tick sends a ripple out over the floor from under the clock, on the clock's time: they drag and hang
  function tickRipples(p, far) {
    if (t >= SHATTER) return;
    for (let ti = 0; ti < TICKS.length; ti++) {
      if (ti % 2) continue;   // one wave every other beat, so the dragged waves stay separable on the floor
      const tk = TICKS[ti];
      if (t < tk) continue;
      const q = (tc - clockTime(tk)) / 0.5;
      if (q >= 1) continue;
      ellipse(p, 6 + (RA - 6) * ease.outCubic(q), cold() ? G[4] : q < 0.3 ? C[5] : q < 0.66 ? C[4] : C[3], 1, (g) => Math.sin(g) < 0 === far);
    }
  }

  // the floor circle cracking at the crack, out from the middle, white at the running tips
  function fracture(p, far) {
    if (t < CRACK || t > SHATTER + 0.3) return;
    const c = clamp((t - CRACK) / 0.2), k = t < SHATTER ? K() : C;
    for (const pts of floorCracks)
      for (let i = 0, n = Math.floor(pts.length * c); i < n; i++) {
        const [x, z] = pts[i];
        if (z < 0 !== far || (t > SHATTER && piece(Math.atan2(z, x), Math.hypot(x, z)) < broken() * 1.4)) continue;
        p.px(x, z * FL, i > n - 3 && c < 1 ? WHITE : k[7]);
      }
  }

  // the clock's shards: slivers tumbling, lying flat on the floor once they land, melting shorter there
  function flying(p, near) {
    for (const s of shards) {
      if (s.z >= 0 !== near) continue;
      const x = s.x, y = s.z * FL - s.h, L = s.s * Math.min(1, s.life / 0.4), ca = Math.cos(s.a), sa = Math.sin(s.a) * (s.rest ? FL : 1);
      if (L < 0.4) continue;
      for (let d = -L / 2; d <= L / 2; d += 0.5) p.px(x + ca * d, y + sa * d, d > L / 2 - 0.6 ? WHITE : s.c);
    }
  }

  // a mote circling the clock on a tilted orbit, slowing with time; drained and still once it stops
  function drawMote(p, m, back) {
    const a = m.a + m.w * tc, z = Math.sin(a);
    if (z < 0 !== back) return;
    const x = Math.cos(a) * m.r, y = CY + Math.cos(a) * m.r * m.tilt + z * m.r * 0.3, v = flow(t) * m.w, c = cold() ? G[6] : m.c;
    p.px(x, y, back ? (c === WHITE ? G[5] : C[4]) : c);   // behind the clock: the same mote one step down, not half-lit
    if (Math.abs(v) > 0.2) for (let q = 1; q <= 3; q++) {
      const b = a - Math.sign(m.w) * q * 0.05 * Math.min(1, Math.abs(v));
      p.px(Math.cos(b) * m.r, CY + Math.cos(b) * m.r * m.tilt + Math.sin(b) * m.r * 0.3, q < 2 ? C[5] : C[4]);
    }
    if (!back) p.glow(x, y, 5, cold() ? G[6] : C[6], 0.3);
  }
}




