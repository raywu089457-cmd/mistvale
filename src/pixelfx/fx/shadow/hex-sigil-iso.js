// shadow/hex-sigil on the game's 2:1 isometric floor: not the side-view picture squashed onto the ground, but a
// sigil actually inscribed on the floor the camera sees. A pen of violet light draws the ring round the aim point,
// then the six spokes and the hexagon, its near half always in front of its far half because the floor recedes;
// three runes stand up out of the rim and light one after another; the ground inside chars; and the sigil lets go in
// a flat flare that races out along the floor and leaves the char behind.
// 1 px = 1 character sprite px (32 x 16 px tiles).
import { fit, clamp, smooth, ease, Rng, TAU, WHITE } from "../../core/index.js";
import { FLOOR, bandFloor, ringNoise } from "../_iso.js";
import { floorLight } from "../fire/_lib.js";
import { VOID } from "./_lib.js";

const D = 2.2, FL = FLOOR, AHEAD = 18, R = 26, HEX = 14, FLARE = 1.66, END = D - 1 / 40;

export const meta = {
  name: "Hex sigil (iso)",
  desc: "shadow/hex-sigil on the 2:1 floor: a violet pen draws a rune ring stroke by stroke, three rim runes light in turn, the floor chars, then it detonates in a flat flare.",
  tags: ["shadow", "hex", "sigil", "rune", "curse", "ground", "one-shot", "iso", "top-down"],
  size: [132, 122],
  origin: [66, 82],
  duration: D,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: VOID, aim: 0, seed: 7 },
};

// three rune marks, 3 x 5, drawn from the bottom up as they light
const RUNES = [
  [".x.", "x.x", "xxx", ".x.", "x.x"],
  ["x.x", ".x.", "xxx", ".x.", "x.x"],
  ["xxx", ".x.", ".x.", "xxx", "x.x"],
];

export function create(o) {
  const C = fit(o.palette, 8), S = o.seed ?? 7, RNG = new Rng(S);
  const aim = o.aim ?? 0;
  const SX = Math.cos(aim) * AHEAD, SY = Math.sin(aim) * AHEAD * FL; // the aim point, on the floor and on screen
  let t = 0;

  // ---- the strokes, in the order the pen walks them: outer ring, spokes, hexagon, hub
  const strokes = [];
  const stroke = (pts, speed) => {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    strokes.push({ pts, cum, len: cum[cum.length - 1], speed, t0: 0 });
  };
  const ringR = (g) => R * (1 + 0.045 * ringNoise(g, 2.3, S) + 0.018 * Math.sin(g * 5 + 1.7));
  const outer = [];
  const m = Math.round(TAU * R * 0.79 * 2);
  for (let j = 0; j < m; j++) {
    const g = Math.PI / 2 - (j / m) * TAU, r = ringR(g);
    outer.push([SX + Math.cos(g) * r, SY + Math.sin(g) * r * FL, Math.sin(g) * r]);
  }
  stroke(outer, 250);
  // the hexagon inscribed in the ring, chord by chord
  for (let k = 0; k < 6; k++) {
    const g0 = Math.PI / 6 + (k * TAU) / 6, g1 = g0 + TAU / 6, pts = [];
    const v0 = [Math.cos(g0), Math.sin(g0)], v1 = [Math.cos(g1), Math.sin(g1)];
    for (let i = 0; i <= 10; i++) {
      const u = i / 10, fx = (1 - u) * v0[0] + u * v1[0], fz = (1 - u) * v0[1] + u * v1[1];
      const w = 1 + 0.05 * ringNoise(g0 + u * (TAU / 6), 3, S + 9);
      pts.push([SX + fx * HEX * w, SY + fz * HEX * w * FL, fz * HEX * w]);
    }
    stroke(pts, 290);
  }
  // six spokes from the hub out through the hexagon corners to the ring, so the whole mark reads as one wheel
  for (let k = 0; k < 6; k++) {
    const g0 = Math.PI / 6 + (k * TAU) / 6, pts = [];
    for (let i = 0; i <= 12; i++) {
      const u = i / 12, g = g0 + 0.06 * u, r = 3 + u * (R * 0.98 - 3);
      pts.push([SX + Math.cos(g) * r, SY + Math.sin(g) * r * FL, Math.sin(g) * r]);
    }
    stroke(pts, 300);
  }
  // the hub mark
  stroke([[0, -4.5], [2.6, 0], [0, 4.5], [-2.6, 0], [0, -4.5]].map(([fx, fz]) => [SX + fx, SY + fz * FL, fz]), 190);
  let pen = 0.1;
  for (const s of strokes) {
    s.t0 = pen;
    pen += s.len / s.speed + 0.03;
  }
  const DRAWN = pen;

  // ---- the three runes standing on the rim, lit one after another
  const glyphs = [-2.05, 0.55, 2.55].map((g, i) => {
    const r = R * 0.83, fx = Math.cos(g) * r, fz = Math.sin(g) * r;
    return { x: SX + fx, y: SY + fz * FL, z: fz, t0: 1.05 + i * 0.14, rows: RUNES[i] };
  });

  // ---- what the detonation throws: sparks off the floor, shards of the ring, motes, ash smoke
  const sparks = [], shards = [], motes = [], puffs = [];
  for (let i = 0; i < 22; i++) sparks.push({ a: RNG.range(0, TAU), sp: RNG.range(16, 50), vh: RNG.range(7, 38), life: RNG.range(0.26, 0.44) });
  for (let i = 0; i < 14; i++) shards.push({ a: RNG.range(0, TAU), sp: RNG.range(12, 38), vh: RNG.range(22, 54), life: RNG.range(0.28, 0.4), bl: RNG.next() });
  for (let i = 0; i < 16; i++) motes.push({ a: RNG.range(0, TAU), rr: RNG.range(5, R * 0.9), h: RNG.range(8, 30), life: RNG.range(0.32, 0.44), bl: RNG.next(), sw: RNG.range(-1.4, 1.4) });
  for (let i = 0; i < 7; i++) puffs.push({ a: RNG.range(0, TAU), rr: RNG.range(4, R * 0.85), rise: RNG.range(5, 14), life: RNG.range(0.32, 0.42), s: RNG.range(1, 2), bl: RNG.next() });

  // the charred disc left on the floor: solid soot in clean radial bands plus a slow three-lobed ash front, a
  // torn 1-px rim. Every pixel matches its neighbours — the burn spreads outward instead of dithering in.
  function charFloor(p, t) {
    const k = smooth(0.35, 0.9, t / DRAWN) * (1 - smooth(D - 0.24, D - 0.09, t));
    if (k <= 0.02) return;
    const RR = R * (0.52 + 0.48 * k);
    p.shade(SX - RR, SY - RR * FL, SX + RR, SY + RR * FL, (x, y, out) => {
      const dx = (x - SX) / RR, dy = (y - SY) / (RR * FL), d = Math.hypot(dx, dy);
      if (d > 1) return;
      if (d > 0.92) { out.c = C[2]; out.a = 1; return; } // ash rim
      const th = Math.atan2(dy, dx);
      const lobe = 0.5 + 0.5 * Math.cos(3 * th + 0.9 + d * 1.7); // smooth three-armed cooling front
      out.c = d < 0.36 ? C[1] : lobe > 0.55 ? C[1] : C[0];
      out.a = 1;
    });
    bandFloor(p, SX, SY, RR * 0.985, 1.2, 0.9, [C[0], C[1], C[2], C[3]], (g) => Math.sin(g) > 0.15);
  }

  // the pen's trail: a freshly drawn pixel is white, cools through lilac into a settled violet, and later breathes.
  // Each dot is doubled along the outward radius so the line has some body on the dark stone at 1 px.
  // All ink is solid: the flare eats the lines back from their ends instead of dithering them away.
  function drawStrokes(p, t, far, pulse) {
    const keep = t < FLARE ? 1 : 1 - clamp((t - FLARE) / 0.16);
    if (keep <= 0.04) return;
    for (const s of strokes) {
      if (t < s.t0) continue;
      const to = (t - s.t0) * s.speed * keep;
      for (let i = 0; i < s.pts.length; i++) {
        if (s.cum[i] > to) break;
        const q = s.pts[i];
        if (q[2] < 0 !== far) continue;
        const age = t - (s.t0 + s.cum[i] / s.speed);
        const c = age < 0.045 ? WHITE : age < 0.13 ? C[6] : age < 0.4 ? C[5] : pulse > 0.5 ? C[5] : C[4];
        const c2 = c === WHITE ? C[6] : c === C[6] ? C[5] : c === C[5] ? C[4] : C[3];
        p.px(q[0], q[1], c);
        const dx = q[0] - SX, dz = q[2];
        const dl = Math.hypot(dx, dz) || 1;
        p.px(q[0] + (dx / dl) * 0.9, q[1] + (dz / dl) * 0.9 * FL, c2);
        // the ink smokes a little light, so the line reads on the dark stone
        if ((i & 5) === 0) p.light(q[0], q[1], C[4], age < 0.3 ? 0.7 : 0.4);
      }
    }
  }

  // the pen itself: a spark of white light where the line is being laid
  function penHead(p, t, far) {
    for (const s of strokes) {
      const d = (t - s.t0) * s.speed;
      if (d <= 0 || d >= s.len) continue;
      let i = 1;
      while (i < s.cum.length && s.cum[i] < d) i++;
      const q0 = s.pts[i - 1], q1 = s.pts[i];
      if (q1[2] < 0 !== far) continue;
      const u = (d - s.cum[i - 1]) / (s.cum[i] - s.cum[i - 1] || 1);
      const x = q0[0] + (q1[0] - q0[0]) * u, y = q0[1] + (q1[1] - q0[1]) * u;
      p.glow(x, y, 7, C[6], 0.45);
      p.px(x, y, WHITE);
      p.px(x + 1, y, C[7]);
    }
  }

  function drawGlyphs(p, t, far, pulse) {
    if (t >= FLARE + 0.06) return;
    for (const g of glyphs) {
      if (g.z < 0 !== far) continue;
      const age = t - g.t0;
      if (age < 0) continue;
      const reveal = smooth(0, 0.15, age), flip = t > FLARE ? 0.5 + 0.5 * Math.sin((t - FLARE) * 60) : 1;
      const lit = clamp(reveal * (0.75 + 0.25 * pulse) * flip, 0, 1);
      if (reveal > 0.82) {
        p.px(g.x - 1, g.y, C[2]);
        p.px(g.x + 1, g.y, C[2]);
      }
      for (let r = 0; r < g.rows.length; r++)
        for (let q = 0; q < 3; q++) {
          if (g.rows[r][q] !== "x") continue;
          const idx = (g.rows.length - 1 - r) * 3 + q;
          if (idx / 15 > reveal) continue;
          const pa = t - (g.t0 + idx * 0.011);
          const c = pa < 0.04 ? WHITE : pa < 0.13 ? C[6] : pulse > 0.5 ? C[6] : C[5];
          p.px(g.x + q - 1, g.y - 1 - (g.rows.length - 1 - r), c);
        }
      p.glow(g.x, g.y - 3, 8, C[6], 0.14 + 0.2 * lit);
      if (lit > 0.5) for (let h = 2; h < 11; h += 2) p.px(g.x, g.y - h, C[3]);
    }
  }

  // ---- the detonation: a flat star, shock rings on the floor, sparks, shards, motes, ash
  function detonate(p, t) {
    const a = t - FLARE;
    if (a < 0) return;
    // the light runs out along the floor, not up into the air: solid rays quantised into four clean steps
    const L = 9 + 30 * ease.outCubic(clamp(a / 0.26));
    for (let i = 0; i < 8; i++) {
      const an = (i * TAU) / 8 + 0.35, len = (i % 2 ? 0.55 : 1) * L;
      const px = -Math.sin(an), py = Math.cos(an) * FL;
      for (let d = 1; d <= len; d += 0.5) {
        const u = d / len;
        const c = u < 0.18 ? WHITE : u < 0.42 ? C[7] : u < 0.7 ? C[6] : C[5];
        p.px(SX + Math.cos(an) * d, SY + Math.sin(an) * d * FL, c);
        if (u < 0.55) p.px(SX + Math.cos(an) * d + px, SY + Math.sin(an) * d * FL + py, C[4]);
      }
    }
    // the star of light at the middle, for the instant it goes off
    if (a < 0.16) {
      const k = 1 - a / 0.16;
      for (let i = 0; i < 12; i++) {
        const an = (i * TAU) / 12, len = (i % 3 ? 2.5 : 5) * k;
        for (let d = 0.5; d < len; d += 0.5) p.px(SX + Math.cos(an) * d, SY + Math.sin(an) * d * FL, d < 1.5 ? WHITE : C[7]);
      }
    }
    if (a < 0.5) bandFloor(p, SX, SY, 4 + 30 * ease.outCubic(clamp(a / 0.42)), 2.4, 1, [C[1], C[3], C[5], C[6], WHITE], (g) => 0.3 + 0.7 * Math.max(0, Math.sin(g)));
    if (a < 0.3) bandFloor(p, SX, SY, 3 + 17 * ease.outCubic(clamp(a / 0.28)), 1.3, 1, [C[1], C[4], C[6], WHITE]);
    p.glow(SX, SY, 20, C[6], 0.6 * (1 - clamp(a / 0.5)));
    p.glow(SX, SY, 7, WHITE, 0.75 * (1 - clamp(a / 0.14)));
    p.px(SX, SY, WHITE);
    // sparks skidding out over the floor, a few shards of the ring thrown up and falling back
    for (const q of sparks) {
      if (a > q.life) continue;
      const r = 3 + q.sp * a, h = q.vh * a - 160 * a * a, u = a / q.life;
      if (h < -1) continue;
      const x = SX + Math.cos(q.a) * r, y = SY + Math.sin(q.a) * r * FL - h;
      p.px(x, y, a < 0.07 ? WHITE : u < 0.5 ? C[6] : C[5]);
      if (u < 0.6) p.px(SX + Math.cos(q.a) * (r - 2), SY + Math.sin(q.a) * (r - 2) * FL - h - (q.vh - 320 * a) * 0.03, C[4]);
    }
    for (const q of shards) {
      if (a > q.life) continue;
      const r = R * 0.85 + q.sp * a, h = q.vh * a - 300 * a * a, u = a / q.life;
      if (h < -1) continue;
      const x = SX + Math.cos(q.a) * r, y = SY + Math.sin(q.a) * r * FL - h;
      p.px(x, y, u < 0.2 ? WHITE : q.bl < 0.5 ? C[7] : C[6]);
      if (u < 0.6) p.px(x - Math.cos(q.a), y + Math.sin(q.a) * FL - (q.vh - 600 * a) * 0.04, C[4]);
    }
    // motes rising from the scorch, and low ash smoke
    for (const q of motes) {
      if (a > q.life) continue;
      const u = a / q.life, rr = q.rr + u * 3.5, an = q.a + u * q.sw;
      const x = SX + Math.cos(an) * rr, y = SY + Math.sin(an) * rr * FL - q.h * ease.outQuad(u) - 1;
      if (u > 0.82) continue;
      p.px(x, y, q.bl < 0.22 ? WHITE : q.bl < 0.6 ? C[6] : C[5]);
    }
    for (const q of puffs) {
      if (a > q.life) continue;
      const u = a / q.life, rr = q.rr + u * 6, an = q.a + u * 0.7;
      const x = SX + Math.cos(an) * rr, y = SY + Math.sin(an) * rr * FL - q.rise * ease.outQuad(u) - 1;
      // the ash body is flat: two opaque steps that shrink away instead of a translucent dark wash
      const s = 0.62 + 0.38 * (1 - smooth(0.6, 1, u)), r = (q.s + 1.6 + u * 2.2) * s;
      p.disc(x, y, r, q.bl < 0.5 ? C[2] : C[3], 1);
      p.disc(x, y, r * 0.6, q.bl < 0.5 ? C[1] : C[2], 1);
    }
  }

  return {
    update(dt) {
      t += dt;
    },
    drawBack(p, tt) {
      const t = tt;
      if (t >= END) return;
      const pulse = 0.5 + 0.5 * Math.sin(t * 9 + S);
      if (t > 0.4) charFloor(p, t);
      if (t < FLARE + 0.4) floorLight(p, SX, SY, R * 1.35, R * 1.35 * FL, C[4], t < FLARE ? 0.14 + 0.08 * pulse + 0.14 * smooth(DRAWN, FLARE, t) : 0.26 * (1 - (t - FLARE) / 0.4));
      drawStrokes(p, t, true, pulse);
      drawGlyphs(p, t, true, pulse);
      penHead(p, t, true);
    },
    draw(p, tt) {
      const t = tt;
      if (t >= END) return;
      const pulse = 0.5 + 0.5 * Math.sin(t * 9 + S);
      // before the ink lands: the point of light the pen comes from
      if (t < 0.16) {
        const k = t / 0.16;
        p.glow(SX, SY, 4 + 8 * k, C[6], 0.4 * k);
        p.px(SX, SY, k > 0.55 ? WHITE : C[6]);
      }
      drawStrokes(p, t, false, pulse);
      drawGlyphs(p, t, false, pulse);
      penHead(p, t, false);
      // two sparks of light run round the finished ring before it lets go
      if (t > DRAWN && t < FLARE) {
        for (const g of [(t * 4.1) % TAU, (t * 4.1 + Math.PI) % TAU]) {
          const r = ringR(g), x = SX + Math.cos(g) * r, y = SY + Math.sin(g) * r * FL;
          p.px(x, y, WHITE);
          p.px(x, y - 1, C[7]);
          p.glow(x, y, 7, C[6], 0.4);
        }
      }
      if (t >= FLARE) {
        floorLight(p, SX, SY, R * 1.55, R * 1.55 * FL, C[6], 0.4 * (1 - clamp((t - FLARE) / 0.3)));
        detonate(p, t);
      }
    },
  };
}
