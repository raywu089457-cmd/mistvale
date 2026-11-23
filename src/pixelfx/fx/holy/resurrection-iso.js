// Resurrection for the game's 2:1 isometric camera: holy/resurrection rewritten for the floor the game sees and for
// a body that lies where it fell, not its picture squashed, stretched or scaled. The recipe is the source's: light
// pours down on the fallen and life climbs back up the body; wings of light unfold, a halo forms, one great
// wingbeat, then the wings scatter into feathers. What changed:
//   - it raises a body that lies on its side (`side`: -1 fallen to the left of the screen, 1 to the right, 0 a body
//     slumped where it stands): the light pours on it where it lies, and life climbs it from the feet to the head
//     along the floor; then the game stands it up (`timing.rise` to `timing.stand`: its death fall played back), and
//     the shaft of light follows it up; it flashes white as it stands, and the halo and the wings come to it upright;
//   - the light lies on the floor as 2:1 pools and rings, and the wingbeat's gust runs out over the floor all round;
//   - what it sheds (streaks, stars, sparks, motes) moves in 3D and falls or rises from where it is.
// The character is the game's: pass it as `actor` (upright, feet at the origin): the effect draws no stand-in. If
// its death draws the body lying in a pose of its own, pass that as `fallen` (the death's last frame, same format):
// the light climbs that body from its feet to its head while it lies.
// 1 px = 1 character sprite px (32 x 16 px tiles).
import { Lights, P, Rng, fit, sparkle, flare, band, clamp, smooth, seg, lerp, ease, TAU, WHITE, mix, READY } from "../../core/index.js";
import { GOLD, ASH, shapeOf, toneOf, feather, Feathers, oval, FAR, NEAR } from "./_lib.js";
import { floorLight } from "../fire/_lib.js";
import { Fly3 } from "../_iso.js";

export const meta = {
  name: "Resurrection (iso)",
  desc: "holy/resurrection on the 2:1 floor for a fallen body: light pours on it where it lies, life climbs it, it stands, a halo and wings of light come to it, one wingbeat, feathers.",
  tags: ["holy", "revive", "resurrect", "wings", "halo", "light", "character", "one-shot", "iso", "top-down"],
  size: [200, 214],
  origin: [100, 166],
  duration: 5.3,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  pixels: 1,
  options: { palette: GOLD, ash: ASH, side: 0, seed: 5 },
};

const TOP = -140;
// the story: the light pours, life climbs the body, wings and halo, the beat, the wings come apart
const RISE = 0.45, FL = 0.5;
const POUR = 0.34, CL0 = 0.5, CL1 = 1.15, STAND = CL1 + RISE, W0 = 1.1 + RISE, H0 = 1.24 + RISE, H1 = 1.5 + RISE, B0 = 1.95 + RISE, B1 = 2.25 + RISE, B2 = 2.37 + RISE, B3 = 2.8 + RISE, SC = 2.95 + RISE, GONE = 3.85 + RISE;
/** When the game should stand the fallen body back up (its death fall played back): from rise to stand. */
export const timing = { rise: CL1, stand: STAND };
const HX = 0, HRX = 9.5, HRY = 2.6;

// the right wing (the left mirrors it), from its shoulder: the arm folded and spread, then each feather
// [where along the arm 0..1, angle spread, length, width, kind]: 0 primary, 1 secondary, 2 covert
const ARM_OPEN = [[0, 0], [7, -9], [15, -19], [20, -27]];
const ARM_FOLD = [[0, 0], [2, -2], [3, -3], [4, -3]];
const QUILLS = [
  [0.14, 1.35, 11, 2.6, 1], [0.26, 1.12, 14, 2.8, 1], [0.38, 0.88, 17, 3, 1], [0.5, 0.62, 19, 3.1, 1], [0.62, 0.35, 21, 3.2, 1], [0.72, 0.08, 23, 3.3, 1],
  [0.8, -0.2, 26, 3.4, 0], [0.85, -0.45, 29, 3.5, 0], [0.9, -0.72, 31, 3.6, 0], [0.95, -1, 30, 3.6, 0], [1, -1.3, 26, 3.4, 0],
  [0.22, 1.2, 7, 2.2, 2], [0.34, 0.98, 8, 2.3, 2], [0.46, 0.75, 9, 2.4, 2], [0.58, 0.5, 10, 2.5, 2], [0.7, 0.22, 10, 2.5, 2], [0.81, -0.1, 11, 2.6, 2], [0.92, -0.5, 11, 2.6, 2],
];
const FLEX = [1, 0.5, 0.3];

function along(pts, s) {
  let L = 0;
  const seglen = [];
  for (let i = 1; i < pts.length; i++) L += seglen[i - 1] = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let d = s * L;
  for (let i = 0; i < seglen.length; i++) {
    if (d <= seglen[i] || i === seglen.length - 1) {
      const f = seglen[i] ? clamp(d / seglen[i]) : 0;
      return [lerp(pts[i][0], pts[i + 1][0], f), lerp(pts[i][1], pts[i + 1][1], f)];
    }
    d -= seglen[i];
  }
  return pts[pts.length - 1];
}

// the beat: a slow raise, a hard fast downstroke, a recovery that overshoots a touch
function beat(t) {
  if (t < B0) return 0;
  if (t < B1) return -0.34 * ease.inOutSine(seg(t, B0, B1));
  if (t < B2) return lerp(-0.34, 0.66, ease.inQuad(seg(t, B1, B2)));
  return 0.66 * (1 - ease.outBack(seg(t, B2, B3), 1.3));
}

export function create(o) {
  const C = fit(o.palette, 8), AS = fit(o.ash, 6), A = o.actor, S = shapeOf(A), R = new Rng(o.seed), side0 = Math.sign(o.side || 0), END = meta.duration;
  // the halo over his head and the wings at his shoulders, for this character's height
  const HY = A.y - 9, SHOULDER = [4, Math.round(A.y * 0.53)];
  // where a pixel of the upright body lies while he is down: turned onto his side about his feet, on the floor
  const lift = side0 ? Math.max(...S.edge.map(([x]) => side0 * (x + 0.5))) : 0;
  const lying = (x, y) => (side0 ? [-side0 * (y + 0.5) - 0.5, side0 * (x + 0.5) - lift - 0.5] : [x, y]);
  const pos = (x, y) => (side0 && t < STAND ? lying(x, y) : [x, y]);
  // the body's own pixels, to light up where they are
  const PIX = [];
  for (let j = 0; j < A.mask.h; j++) for (let i = 0; i < A.mask.w; i++) if (A.mask.data[j * A.mask.w + i]) PIX.push([A.x + i, A.y + j, A.pixels?.[j * A.mask.w + i] || C[3]]);
  const paint = (p, fn) => {
    for (const [x, y, c] of PIX) {
      const n = fn(c, x, y);
      if (!n) continue;
      const [px, py] = pos(x, y);
      p.px(px, py, n);
    }
  };
  // the shaft follows the body: over the middle of it where it lies, over him as he stands
  // the body as it lies, if the game gave it: each pixel with how far along the body it is, in the upright body's
  // terms (0 at the feet, A.y at the head), so the climbing light runs up it the same way
  const FB = o.fallen?.mask ? o.fallen : null, FPIX = [], FOUT = [];
  if (FB) {
    const m = FB.mask, on = (i, j) => i >= 0 && j >= 0 && i < m.w && j < m.h && m.data[j * m.w + i];
    let x0 = Infinity, x1 = -Infinity;
    for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) if (on(i, j)) (x0 = Math.min(x0, FB.x + i)), (x1 = Math.max(x1, FB.x + i));
    const span = Math.max(1, x1 - x0), head = side0 > 0 ? x1 : x0, along = (x) => (Math.abs(x - head) / span) * -A.y + A.y;
    for (let j = -1; j <= m.h; j++)
      for (let i = -1; i <= m.w; i++) {
        const x = FB.x + i, y = FB.y + j;
        if (on(i, j)) FPIX.push([x, y, FB.pixels?.[j * m.w + i] || C[3], along(x)]);
        else if (on(i - 1, j) || on(i + 1, j) || on(i, j - 1) || on(i, j + 1)) FOUT.push([x, y, along(x)]);
      }
  }
  const midX = FB ? FPIX.reduce((a, q) => a + q[0], 0) / FPIX.length : side0 ? lying(0, A.y + A.mask.h / 2)[0] : 0;
  const SX = () => midX * (1 - ease.inOutSine(seg(t, CL1, STAND)));
  const WING = [C[2], C[3], C[4], C[5], C[6], WHITE];
  const fly = new Fly3({ rng: R, sparks: [WHITE, C[6], C[5], C[3]], haze: C[4] });
  // a particle from the source's picture plane (x across, y up the screen) put in the world, a step either side
  const ps = { spawn: (k, x, y, vx, vy, life, col, size = 1, delay = 0) => fly.spawn(k, x, R.range(-3, 3), -y, vx, R.range(-8, 8), -vy, life, col, size, { delay }) };
  const lights = new Lights(), loose = new Feathers(R, 0);
  const rows = new Map();
  for (const [x, y] of S.edge) (rows.get(y) ?? rows.set(y, []).get(y)).push(x);
  // the shaft of light: a few rays of their own width and shimmer
  const rays = Array.from({ length: 6 }, (_, i) => ({ o: -0.75 + i * 0.3 + R.range(-0.08, 0.08), w: R.range(0.1, 0.2), b: R.range(0.55, 1), f: R.range(1.5, 3.5), ph: R.range(0, TAU) }));
  const cores = [...rays].sort((a, b) => b.b - a.b).slice(0, 2);
  const motes = Array.from({ length: 34 }, () => ({ q: R.range(-1, 1), y: R.range(0, 1), v: R.range(4, 11), amp: R.range(0.6, 2.4), ph: R.range(0, TAU), f: R.range(0.6, 1.4) }));
  // each feather opens on its own beat, outer ones last, and comes off at its own time, tips first
  const reach = QUILLS.map(([s, ang, len]) => { const b = along(ARM_OPEN, s); return Math.hypot(b[0] + Math.cos(ang) * len, b[1] + Math.sin(ang) * len); }), far = Math.max(...reach);
  const quills = QUILLS.map(([s, ang, len, wid, kind], i) => {
    const off = () => SC + (1 - reach[i] / far) * 0.2 + R.range(0, 0.04);
    return { s, ang, len, wid, kind, fold: 1.45 + (i % 6) * 0.04, open: kind === 0 ? 0.06 + (s - 0.8) * 0.45 : kind === 1 ? s * 0.06 : 0.03 + s * 0.05, off: [off(), off()], gone: [false, false] };
  });
  const profile = new Float32Array(121);
  let t = 0, poured = false, flashed = false, formed = false, beaten = false;

  const climbY = (tt) => lerp(1, S.top - 2, ease.inOutSine(seg(tt, CL0, CL1)));
  const shaftK = (tt) => smooth(0, 0.12, tt) * (1 - smooth(3.0 + RISE, 3.75 + RISE, tt));
  const shaftW = (tt) => lerp(0.4, 1, ease.outCubic(seg(tt, 0, 0.6))) * lerp(1, 0.12, ease.inCubic(seg(tt, 2.9 + RISE, 3.6 + RISE)));
  const halfW = (y, tt) => lerp(8, 25, (y - TOP) / -TOP) * shaftW(tt);

  // the pose of every feather of one wing at time tt: quill base (x, y), angle, length, width, alpha, hot
  function wing(tt, side) {
    const oa = ease.outBack(seg(tt, W0, W0 + 0.4), 1.6), rot = beat(tt), om = (beat(tt) - beat(tt - 0.03)) / 0.03;
    const arm = ARM_FOLD.map((f, i) => [lerp(f[0], ARM_OPEN[i][0], oa), lerp(f[1], ARM_OPEN[i][1], oa)]);
    const cr = Math.cos(rot), sr = Math.sin(rot), place = ([x, y]) => [side * (SHOULDER[0] + x * cr - y * sr), SHOULDER[1] + x * sr + y * cr];
    const a0 = smooth(W0, W0 + 0.1, tt), out = [];
    quills.forEach((q, i) => {
      if (tt >= q.off[side > 0 ? 0 : 1] + 0.05) return;
      const of = ease.outBack(seg(tt, W0 + q.open, W0 + q.open + 0.42), 2), [bx, by] = place(along(arm, q.s));
      const ang = lerp(q.fold, q.ang, of) + rot - clamp(om * 0.045 * FLEX[q.kind], -0.5, 0.5);
      out.push({ i, q, x: bx, y: by, ang: side > 0 ? ang : Math.PI - ang, len: q.len * lerp(0.3, 1, of), wid: q.wid, a: a0, hot: tt < W0 + q.open + 0.07 || tt >= q.off[side > 0 ? 0 : 1] ? 1 : 0 });
    });
    return { out, arm: arm.map(place) };
  }

  function drawWing(p, side) {
    const { out, arm } = wing(t, side);
    if (!out.length) return;
    const order = [...out].sort((a, b) => b.q.ang - a.q.ang);
    // the lowest feathers first, so each one above lays its warm trailing edge over the next; coverts on top
    for (const f of order) if (f.q.kind !== 2) feather(p, f.x, f.y, f.ang, f.len, f.wid, WING, f.a, side, f.hot);
    for (const f of order) if (f.q.kind === 2) feather(p, f.x, f.y, f.ang, f.len, f.wid, WING, f.a, side, f.hot);
    // the leading edge: a white bone of light with a gold underside
    const k = out.length / quills.length;
    if (k > 0.5) {
      p.polyline(arm.map(([x, y]) => [x, y + 1]), C[5], out[0].a);
      p.polyline(arm, WHITE, out[0].a);
    }
    p.glow(side * 28, -36, 38, C[4], 0.26 * out[0].a * k);
    const g = ((t - W0 - 0.45) * 1.3) % 1;
    if (k > 0.9 && t > W0 + 0.45 && g < 0.8) {
      const [gx, gy] = along(arm, g / 0.8);
      sparkle(p, gx, gy, 2 + Math.sin((g / 0.8) * Math.PI) * 2, WHITE, C[6], 0.4);
    }
    p.glowLine(arm[0][0], arm[0][1], arm[3][0], arm[3][1], 7, C[5], 0.25 * out[0].a * k);
    // the tips of the primaries leave trails of light as they come down
    if (t > B1 + 0.03 && t < B2 + 0.14)
      for (const i of [6, 8, 10]) {
        const pts = [];
        for (let j = 0; j < 10; j++) {
          const tt = Math.max(B1 + 0.01, t - j * 0.012), w = wing(tt, side).out.find((f) => f.i === i);
          if (w) pts.push([w.x + Math.cos(w.ang) * (w.len - 1), w.y + Math.sin(w.ang) * (w.len - 1)]);
        }
        const fade = 1 - smooth(B2, B2 + 0.14, t);
        for (let j = 1; j < pts.length; j++) p.line(pts[j - 1][0], pts[j - 1][1], pts[j][0], pts[j][1], j < 3 ? WHITE : j < 6 ? C[6] : C[4], fade * (1.1 - j / 10));
      }
  }

  function shaft(p) {
    const k = shaftK(t);
    if (k <= 0) return;
    for (let i = 0; i < profile.length; i++) {
      const q = (i - 60) / 40;
      let I = 0;
      for (const r of rays) {
        const d = (q - r.o) / r.w;
        I += r.b * Math.exp(-d * d) * (0.72 + 0.28 * Math.sin(t * r.f + r.ph));
      }
      profile[i] = (I * 0.6 + 0.35 * Math.max(0, 1 - q * q)) * smooth(1.25, 0.7, Math.abs(q));
    }
    const front = lerp(TOP, 1, ease.inQuad(seg(t, 0, POUR))), w0 = halfW(0, t) * 1.3;
    const cx = SX();
    p.each(cx - w0 - 1, TOP, cx + w0 + 1, Math.min(front, 0.5), (x, y, sx, sy) => {
      const w = halfW(y, t), q = (x - cx) / w;
      if (q < -1.5 || q > 1.5) return;
      const I = profile[Math.round(q * 40) + 60] * k * (0.75 + 0.25 * smooth(TOP, 0, y)) * smooth(front, front - 10, y);
      if (I <= 0.01) return;
      p.blendPx(sx, sy, C[6], I * 0.24);
      p.add(sx, sy, C[4], I * 0.3);
    });
    // the brightest rays show as fine lines, light running down them
    for (const r of cores) {
      const sh = 0.75 + 0.25 * Math.sin(t * r.f + r.ph);
      for (let y = TOP; y < Math.min(front, 0); y++) {
        const pulse = 0.5 + 0.5 * Math.sin(y * 0.13 - t * 11 + r.ph);
        p.dot(cx + r.o * halfW(y, t), y, pulse > 0.8 ? WHITE : C[6], k * sh * (0.15 + 0.55 * pulse) * smooth(front, front - 10, y));
      }
    }
    // the head of the pour
    if (t < POUR + 0.05 && front > TOP + 14) {
      const fy = Math.min(front, 0);
      p.glow(cx, fy, 14, C[5], 0.7 * k);
      for (let dy = -6; dy <= 0; dy++) p.dot(cx, fy + dy, dy > -3 ? WHITE : C[6], 1 + dy / 7);
    }
    // dust motes lit where they cross a ray
    for (const m of motes) {
      const y = TOP + ((((m.y * -TOP + t * m.v) % -TOP) + -TOP) % -TOP);
      if (y > front) continue;
      const w = halfW(y, t), x = cx + m.q * w + Math.sin(t * m.f + m.ph) * m.amp, I = profile[Math.round(((x - cx) / w) * 40) + 60] * k;
      if (I < 0.25) continue;
      p.dot(x, y, I > 0.75 ? WHITE : I > 0.5 ? C[6] : C[5], Math.min(1, I * 1.4));
      p.light(x, y, C[5], I * 0.5);
    }
  }

  // the floor catches the light: a 2:1 pool under the shaft, a bright ring at its edge
  function pool(p, back) {
    const k = shaftK(t) * smooth(POUR - 0.05, POUR + 0.1, t), w = halfW(0, t) * 1.25, cx = SX();
    if (k <= 0) return;
    if (back) {
      floorLight(p, cx, 0, w * 1.6, w * 1.6 * FL, C[4], 0.3 * k);
      oval(p, cx, 0, w, w * FL, C[5], 0.8 * k, FAR);
      return;
    }
    floorLight(p, cx, 0, w, w * FL, C[6], 0.35 * k);
    oval(p, cx, 0, w, w * FL, (g) => (Math.sin(g) > 0.6 ? WHITE : C[6]), k, NEAR);
  }

  function halo(p) {
    const form = ease.outCubic(seg(t, H0, H1)), k = 1 - smooth(3.35 + RISE, 3.9 + RISE, t);
    if (form <= 0 || k <= 0) return;
    const white = t >= H1 && t < H1 + 0.06, gl = (t - H1) * 4.2 + Math.PI / 2, n = 96;
    for (let j = 0; j < n; j++) {
      const g = (j / n) * TAU, fromFront = Math.abs(((g - Math.PI / 2 + Math.PI) % TAU + TAU) % TAU - Math.PI);
      if (fromFront > form * Math.PI + 0.02) continue;
      const x = HX + Math.cos(g) * HRX * (0.9 + 0.1 * form), y = HY + Math.sin(g) * HRY, near = Math.sin(g) >= 0;
      const dg = Math.abs(((g - gl + Math.PI) % TAU + TAU) % TAU - Math.PI), hot = white || dg < 0.22 || fromFront > form * Math.PI - 0.3;
      if (near) {
        p.dot(x, y, hot ? WHITE : C[6], k);
        p.dot(x, y + 1, hot ? C[6] : C[4], k);
      } else p.dot(x, y, hot ? C[6] : C[5], k * 0.9);
    }
    p.glow(HX, HY, 20, C[4], 0.4 * k * form);
    p.glow(HX, HY + 1, 9, WHITE, 0.2 * k * form);
    const gx = HX + Math.cos(gl) * HRX, gy = HY + Math.sin(gl) * HRY;
    if (t > H1 && Math.sin(gl) > 0.2) sparkle(p, gx, gy + 0.5, 2 + 2 * Math.sin(gl), C[6], C[4], 0.35 * k);
    if (t >= H1 && t < H1 + 0.3) sparkle(p, HX, HY + HRY + 0.5, 7 * (1 - (t - H1) / 0.3), WHITE, C[5], 0.6);
  }

  // the body: ash grey while it's down, life climbing it from the feet to the head (along the floor while it lies)
  // in a front of white light; while the game stands it up it glows; as it stands, the flash cools through gold
  function body(p) {
    if (t >= STAND + 0.6) return;
    const Ly = climbY(t);
    if (t < CL1 && FB) {
      // the light climbs the body where it lies, feet to head
      const col = (c, d) => (d < -0.5 ? toneOf(AS, c) : d < 0.5 ? WHITE : d < 1.5 ? C[6] : Math.exp(-(d - 1.5) / 4) * 0.7 > 0.08 ? mix(c, C[5], Math.exp(-(d - 1.5) / 4) * 0.7) : 0);
      for (const [x, y, c, a] of FPIX) {
        const n = col(c, a - Ly);
        if (n) p.px(x, y, n);
      }
      for (const [x, y, a] of FOUT) {
        const d = a - Ly;
        if (d < -0.5 || d > 12) continue;
        p.dot(x, y, d < 1 ? WHITE : d < 5 ? C[5] : C[4], d < 1 ? 1 : 1.1 - d / 12);
      }
      if (t > CL0) {
        const f = FPIX.reduce((b, q) => (Math.abs(q[3] - Ly) < Math.abs(b[3] - Ly) ? q : b), FPIX[0]);
        p.glow(f[0], f[1], 26, C[4], 0.5);
        p.glow(f[0], f[1], 8, WHITE, 0.3);
      }
      return;
    }
    if (t < CL1) {
      paint(p, (c, x, y) => {
        const d = y - Ly;
        if (d < -0.5) return toneOf(AS, c);
        if (d < 0.5) return WHITE;
        if (d < 1.5) return C[6];
        const k = Math.exp(-(d - 1.5) / 4) * 0.7;
        return k > 0.08 ? mix(c, C[5], k) : 0;
      });
      for (const [x, y] of S.out) {
        const d = y - Ly;
        if (d < -0.5 || d > 12) continue;
        const [px, py] = pos(x, y);
        p.dot(px, py, d < 1 ? WHITE : d < 5 ? C[5] : C[4], d < 1 ? 1 : 1.1 - d / 12);
      }
      if (t > CL0) {
        const [gx, gy] = pos(0, Ly);
        p.glow(gx, gy, 26, C[4], 0.5);
        p.glow(gx, gy, 8, WHITE, 0.3);
      }
      return;
    }
    if (t < STAND) {
      p.glow(SX(), -4 - 12 * seg(t, CL1, STAND), 30, C[5], 0.35);
      return;
    }
    const u = t - STAND;
    paint(p, (c) => (u < 0.06 ? WHITE : u < 0.45 ? mix(c, C[5], 0.55 * Math.pow(1 - u / 0.45, 2)) : 0));
    if (u < 0.25) for (const [x, y] of S.out) p.dot(x, y, u < 0.08 ? WHITE : C[5], 1 - u / 0.25);
  }

  return {
    update(dt) {
      t += dt;
      // light streaks pour down the shaft, faster as they fall
      if (t > 0.05 && t < 2.9 + RISE && R.chance(0.16)) {
        const q = R.range(-0.9, 0.9), y = TOP + R.range(8, 24), v0 = R.range(50, 90), life = Math.log(1 + (3 * (-y - 2)) / v0) / 3;
        ps.spawn(P.STREAK, SX() + q * halfW(y, t), y, q * 2, v0, life, R.chance(0.5) ? C[6] : C[5]);
      }
      if (t > 0.3 && t < 2.8 + RISE && R.chance(0.05)) ps.spawn(P.STAR, SX() + R.range(-1, 1) * halfW(-30, t), -R.range(4, 90), R.range(-3, 3), R.range(-4, 6), R.range(0.4, 0.8), R.chance(0.5) ? C[6] : WHITE, R.range(0.6, 1.8));
      if (!poured && t >= POUR) {
        poured = true;
        lights.add(0, -12, 42, C[5], 0.9, 0.4);
        lights.add(0, -6, 16, WHITE, 0.6, 0.1);
        for (let i = 0; i < 14; i++) ps.spawn(P.STAR, R.range(-18, 18), -R.range(0, 6), R.range(-20, 20), -R.range(10, 50), R.range(0.5, 1.1), R.chance(0.5) ? WHITE : C[6], R.range(0.6, 2.2));
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + R.range(-1.2, 1.2), sp = R.range(60, 150);
          ps.spawn(P.SPARK, R.range(-3, 3), -1, Math.cos(a) * sp, Math.sin(a) * sp, R.range(0.25, 0.5));
        }
      }
      // life climbs the body: bits of light peel off the rim at the front
      if (t > CL0 && t < CL1) {
        const Ly = Math.round(climbY(t));
        for (const y of [Ly, Ly + 1]) {
          const xs = rows.get(y);
          if (!xs || !R.chance(0.35)) continue;
          const x = R.pick(xs), s = Math.sign(x + 0.5), [px, py] = pos(x + s, y);
          ps.spawn(R.chance(0.6) ? P.MOTE : P.STAR, px, py, s * R.range(8, 30), -R.range(15, 45), R.range(0.35, 0.7), R.chance(0.5) ? C[6] : C[5], R.range(0.5, 1.1));
        }
      }
      if (!flashed && t >= STAND) {
        flashed = true;
        lights.add(0, -24, 64, C[5], 0.7, 0.5);
        lights.add(0, -30, 28, WHITE, 0.7, 0.1);
        for (let i = 0; i < 18; i++) {
          const a = R.range(0, TAU), sp = R.range(30, 110);
          ps.spawn(P.STAR, Math.cos(a) * 6, -24 + Math.sin(a) * 12, Math.cos(a) * sp, Math.sin(a) * sp * 0.7 - 20, R.range(0.4, 0.9), R.chance(0.5) ? WHITE : C[6], R.range(0.6, 2));
        }
      }
      // motes spiral in to make the halo
      if (t > H0 - 0.2 && t < H0 + 0.1 && R.chance(0.6)) {
        const g = R.range(0, TAU), D = R.range(14, 24), x = HX + Math.cos(g) * D, y = HY + Math.sin(g) * D * 0.5, tx = HX + Math.cos(g + 0.6) * HRX, ty = HY + Math.sin(g + 0.6) * HRY;
        const T = R.range(0.16, 0.24), l = Math.hypot(tx - x, ty - y) || 1, v = (l * 3) / (Math.exp(3 * T) - 1);
        ps.spawn(P.STREAK, x, y, ((tx - x) / l) * v, ((ty - y) / l) * v, T, R.chance(0.5) ? C[6] : C[5]);
      }
      if (!formed && t >= H1) {
        formed = true;
        lights.add(HX, HY, 30, C[6], 0.8, 0.3);
      }
      // the wings burst open with a scatter of light
      if (t > W0 && t < W0 + 0.35 && R.chance(0.5))
        for (const side of [-1, 1]) {
          const f = R.pick(wing(t, side).out);
          if (f) ps.spawn(P.STAR, f.x + Math.cos(f.ang) * f.len, f.y + Math.sin(f.ang) * f.len, side * R.range(5, 25), -R.range(5, 25), R.range(0.3, 0.6), R.chance(0.5) ? WHITE : C[6], R.range(0.6, 1.6));
        }
      // while the wings hold, light twinkles on the tips and motes lift off them
      if (t > W0 + 0.45 && t < SC)
        for (const side of [-1, 1]) {
          if (R.chance(0.045)) {
            const f = R.pick(wing(t, side).out.filter((w) => w.q.kind === 0));
            if (f) ps.spawn(P.STAR, f.x + Math.cos(f.ang) * (f.len - 2), f.y + Math.sin(f.ang) * (f.len - 2), 0, -R.range(2, 8), R.range(0.3, 0.6), R.chance(0.5) ? WHITE : C[6], R.range(1, 2.4));
          }
          if (R.chance(0.03)) {
            const f = R.pick(wing(t, side).out);
            if (f) ps.spawn(P.EMBER, f.x + Math.cos(f.ang) * f.len * 0.7, f.y + Math.sin(f.ang) * f.len * 0.7, R.range(-8, 8), -R.range(8, 25), R.range(0.6, 1.1), C[5]);
          }
        }
      // the downstroke: a gust along the floor, light flung off the tips, a few feathers shaken loose
      if (!beaten && t >= B2 - 0.03) {
        beaten = true;
        for (const side of [-1, 1]) {
          lights.add(side * 30, -34, 46, C[5], 0.6, 0.4);
          // the gust skims out along the floor as streaks of lit dust
          for (let i = 0; i < 7; i++) {
            const g = R.range(0, TAU), d = R.range(8, 22), v = R.range(90, 160);
            fly.spawn(P.MOTE, Math.cos(g) * d, Math.sin(g) * d, R.range(1, 4), Math.cos(g) * v, Math.sin(g) * v, R.range(0, 8), R.range(0.25, 0.45), R.chance(0.5) ? C[6] : C[5], R.range(0.6, 1));
          }
          for (const f of wing(t, side).out)
            if (f.q.kind === 0) {
              const tx = f.x + Math.cos(f.ang) * f.len, ty = f.y + Math.sin(f.ang) * f.len;
              ps.spawn(P.SPARK, tx, ty, side * R.range(30, 90), R.range(60, 160), R.range(0.3, 0.6));
            }
          for (let i = 0; i < 3; i++) {
            const f = R.pick(wing(t, side).out.filter((w) => w.q.kind === 1));
            if (f) loose.add({ x: f.x + Math.cos(f.ang) * f.len * 0.6, y: f.y + Math.sin(f.ang) * f.len * 0.6, vx: side * R.range(20, 70), vy: R.range(10, 50), a: f.ang, len: R.range(9, 12), wid: R.range(2.2, 2.8), life: R.range(1.2, 1.6), side });
          }
        }
      }
      // the wings come apart, tips first: each feather flashes and breaks into small ones and motes
      for (const side of [-1, 1]) {
        const si = side > 0 ? 0 : 1;
        for (const q of quills) {
          if (q.gone[si] || t < q.off[si]) continue;
          q.gone[si] = true;
          const f = wing(q.off[si] - 0.001, side).out.find((w) => w.q === q);
          if (!f) continue;
          const ca = Math.cos(f.ang), sa = Math.sin(f.ang), n = q.kind === 2 ? 0 : 1;
          for (let j = 0; j < n; j++) {
            const u = 0.55, x = f.x + ca * f.len * u, y = f.y + sa * f.len * u, ox = x - side * 4, oy = y + 20, l = Math.hypot(ox, oy) || 1, sp = R.range(60, 150);
            loose.add({ x, y, vx: (ox / l) * sp + R.range(-15, 15), vy: (oy / l) * sp * 0.5 - R.range(20, 50), a: f.ang + R.range(-0.4, 0.4), len: R.range(9, 12), wid: R.range(2.2, 2.8), life: R.range(1, 1.45), side, back: R.chance(0.35) });
          }
          for (let j = 0; j < 2; j++) ps.spawn(P.EMBER, f.x + ca * f.len * R.range(0.3, 1), f.y + sa * f.len * R.range(0.3, 1), R.range(-15, 15), -R.range(10, 40), R.range(0.6, 1.1), C[5]);
          if (R.chance(0.6)) ps.spawn(P.STAR, f.x + ca * f.len, f.y + sa * f.len, 0, -R.range(5, 15), R.range(0.3, 0.6), WHITE, R.range(1, 2));
        }
      }
      // the halo melts into rising motes
      if (t > 3.35 + RISE && t < 3.75 + RISE && R.chance(0.4)) {
        const g = R.range(0, TAU);
        ps.spawn(P.EMBER, HX + Math.cos(g) * HRX, HY + Math.sin(g) * HRY, R.range(-6, 6), -R.range(10, 25), R.range(0.5, 0.9), C[5]);
      }
      fly.update(dt);
      lights.update(dt);
      loose.update(dt);
      fly.cap(Math.max(0.001, END - 0.05 - t));
    },
    drawBack(p) {
      shaft(p);
      pool(p, true);
      if (t > POUR && t < POUR + 0.4) band(p, SX(), 0, 4 + 32 * ease.outCubic(seg(t, POUR, POUR + 0.4)), FL, 2.5 * (1 - seg(t, POUR, POUR + 0.4)) + 0.5, 1.1 - seg(t, POUR, POUR + 0.4), C.slice(3), FAR, t < POUR + 0.06);
      if (t > B2 - 0.03 && t < B2 + 0.45) {
        const u = seg(t, B2 - 0.03, B2 + 0.45);
        band(p, 0, 0, 10 + 70 * ease.outCubic(u), FL, Math.max(1, 4 * (1 - u)), (1 - u) * 1.2, C.slice(3), FAR, u < 0.1);
      }
      for (const side of [-1, 1]) drawWing(p, side);
      loose.draw(p, WING, "back");
      fly.draw(p, (q) => q.z < 0);
    },
    draw(p) {
      pool(p, false);
      if (t > POUR && t < POUR + 0.4) band(p, SX(), 0, 4 + 32 * ease.outCubic(seg(t, POUR, POUR + 0.4)), FL, 2.5 * (1 - seg(t, POUR, POUR + 0.4)) + 0.5, 1.1 - seg(t, POUR, POUR + 0.4), C.slice(3), NEAR, t < POUR + 0.06);
      body(p);
      // the downstroke sends a ring of light out over the floor all round
      if (t > B2 - 0.03 && t < B2 + 0.45) {
        const u = seg(t, B2 - 0.03, B2 + 0.45);
        band(p, 0, 0, 10 + 70 * ease.outCubic(u), FL, Math.max(1, 4 * (1 - u)), (1 - u) * 1.2, C.slice(3), NEAR, u < 0.1);
      }
      // the wings light the character from behind
      const wk = smooth(W0, W0 + 0.2, t) * (1 - smooth(SC, SC + 0.3, t));
      if (wk > 0) {
        for (const [x, y] of S.out) if (y < -8) p.light(x, y, C[5], 0.55 * wk);
        p.glow(0, -34, 76, C[4], 0.14 * wk);
      }
      halo(p);
      if (t >= STAND && t < STAND + 0.22) flare(p, 0, S.top - 1, 22 * (1 - (t - STAND) / 0.22), 1 - (t - STAND) / 0.22, C.slice(3));
      loose.draw(p, WING, "front");
      fly.draw(p, (q) => q.z >= 0);
      lights.draw(p);
    },
  };
}
