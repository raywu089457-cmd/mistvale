// shadow/grasping-hands on the game's 2:1 isometric floor: the ground at the aim point cracks open and bulges,
// six small violet claws reach up out of it and clutch at the air where the spell wants them, then sink back down,
// leaving black, disturbed earth behind. The claws are small by design — a three- or four-pixel palm and one-pixel
// fingers — so they are lit from behind by the spell's own violet bloom and read as dark silhouettes with bright
// claw-tips; back claws are dimmed, front claws catch the light.
// 1 px = 1 character sprite px (32 x 16 px tiles).
import { fit, clamp, smooth, ease, Rng, TAU, WHITE } from "../../core/index.js";
import { FLOOR, bandFloor } from "../_iso.js";
import { floorLight } from "../fire/_lib.js";
import { VOID } from "./_lib.js";

const D = 1.6, FL = FLOOR, AHEAD = 18, NH = 6, SPREAD = 12.5, RISE = 11, END = D - 1 / 40;

export const meta = {
  name: "Grasping hands (iso)",
  desc: "shadow/grasping-hands on the 2:1 floor: the ground cracks and bulges, six violet claws reach up out of it, clutch and sink back, leaving dark disturbed earth and dust.",
  tags: ["shadow", "hands", "grasp", "undead", "ground", "one-shot", "iso", "top-down"],
  size: [122, 112],
  origin: [61, 73],
  duration: D,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: VOID, aim: 0, seed: 5 },
};

export function create(o) {
  const C = fit(o.palette, 8), S = o.seed ?? 5, RNG = new Rng(S);
  const aim = o.aim ?? 0;
  const SX = Math.cos(aim) * AHEAD, SY = Math.sin(aim) * AHEAD * FL; // the aim point: floor and screen
  let t = 0;

  // ---- six claws, spread on the floor round the aim point, each with its own reach, lean and moment
  const order = [0, 1, 2, 3, 4, 5];
  for (let i = order.length - 1; i > 0; i--) {
    const j = RNG.int(0, i);
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  const hands = [];
  for (let i = 0; i < NH; i++) {
    const g = (i / NH) * TAU + RNG.range(-0.32, 0.32);
    const r = SPREAD * RNG.range(0.82, 1.14);
    const fx = Math.cos(g) * r, fz = Math.sin(g) * r;
    const back = fz < 0;
    hands.push({
      i,
      bx: SX + fx,
      by: SY + fz * FL,
      bz: fz,
      H: RISE * (back ? RNG.range(0.98, 1.15) : RNG.range(0.9, 1.06)),
      t0: 0.14 + order[i] * 0.05,
      rise: 0.24,
      hold: 0.22,
      sink: 0.3,
      tilt: RNG.range(-0.5, 0.5),
      size: RNG.range(0.92, 1.15),
      back,
      snap: 0.07 + RNG.range(0, 0.06),
      thumb: RNG.next() < 0.5 ? -1 : 1,
      fingers: 2 + RNG.int(0, 1), // two or three fingers besides the thumb
    });
  }
  hands.sort((a, b) => a.bz - b.bz);

  // ---- the cracks that open first, wandering out from the aim point
  const cracks = [];
  for (let i = 0; i < 5; i++) {
    const g = (i / 5) * TAU + RNG.range(-0.4, 0.4);
    let fx = 0, fz = 0, a = g;
    const pts = [[SX, SY]];
    const n = 6 + RNG.int(0, 5);
    for (let j = 0; j < n; j++) {
      a += RNG.range(-0.4, 0.4);
      fx += Math.cos(a) * RNG.range(1.8, 3.6);
      fz += Math.sin(a) * RNG.range(1.8, 3.6);
      if (Math.hypot(fx, fz) > 19) break;
      pts.push([SX + fx, SY + fz * FL]);
    }
    cracks.push({ pts, t0: 0.02 + i * 0.03, hot: RNG.range(0.22, 0.42) });
  }

  // ---- litter on the broken floor: a clean ring of chips and small stones, no random scatter
  const chips = [];
  for (let i = 0; i < 16; i++) {
    const g = (i / 16) * TAU + 0.19, r = SPREAD + 1.5 + 2.6 * Math.cos(3 * g + 0.7);
    chips.push({ x: SX + Math.cos(g) * r, y: SY + Math.sin(g) * r * FL, c: i % 3 ? C[1] : C[2] });
  }
  // ---- dust: one puff as each claw breaks the floor, another as it lets go
  const dust = [];
  for (const h of hands) {
    for (let k = 0; k < 2; k++) {
      const g = RNG.range(0, TAU), r = RNG.range(1.4, 3.6);
      dust.push({
        x: h.bx + Math.cos(g) * r,
        y: h.by + Math.sin(g) * r * FL,
        t0: k === 0 ? h.t0 + 0.02 : h.t0 + h.rise + h.hold,
        rise: RNG.range(5, 10),
        drift: RNG.range(-2, 2),
        life: RNG.range(0.32, 0.44),
        s: RNG.range(1, 2),
        bl: RNG.next(),
      });
    }
  }
  // ---- a few violet motes drawn up with the hands
  const motes = [];
  for (let i = 0; i < 7; i++) {
    const g = RNG.range(0, TAU), r = RNG.range(2, SPREAD + 6);
    motes.push({ x: SX + Math.cos(g) * r, y: SY + Math.sin(g) * r * FL, phase: RNG.range(0, 1.2), life: RNG.range(0.55, 0.9), rise: RNG.range(9, 18), sw: RNG.range(-2, 2), bl: RNG.next() });
  }

  // how high a claw is right now
  function heightOf(h, t) {
    const age = t - h.t0;
    if (age < 0) return 0;
    const up = ease.outBack(clamp(age / h.rise), 1.5);
    const sa = age - h.rise - h.hold;
    const down = sa > 0 ? ease.inCubic(clamp(sa / h.sink)) : 0;
    return h.H * up * (1 - down);
  }

  // a digit: one pixel wide, curving as `bend` accumulates, with a lit edge toward the spell's glow and a pale claw tip
  function digit(p, x0, y0, ang, len, bend, c0, c1, tip, edge) {
    let x = x0, y = y0;
    const n = Math.max(2, Math.round(len * 2));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const a = ang + bend * u;
      x += Math.sin(a) * (len / n);
      y -= Math.cos(a) * (len / n);
      const c = u > 0.78 ? tip : u > 0.4 ? c1 : c0;
      p.px(x, y, c);
      if (edge && u < 0.9) p.px(x - 1, y, edge);
    }
    return [x, y];
  }

  // one claw: dark arm out of the rip, small palm, two or three fingers and a thumb
  function drawHand(p, h, t) {
    const age = t - h.t0;
    if (age < 0) return;
    const up = ease.outBack(clamp(age / h.rise), 1.5);
    const sa = age - h.rise - h.hold;
    const down = sa > 0 ? ease.inCubic(clamp(sa / h.sink)) : 0;
    const hh = h.H * up * (1 - down);
    const s = h.size;
    const by = h.by, bx = h.bx;
    const dim = h.back;
    const body = dim ? [C[0], C[1], C[2], C[3], C[4]] : [C[1], C[2], C[3], C[4], C[5]];
    const edge = dim ? C[2] : C[4];
    // the rip it comes out of stays after the claw has gone: a clean torn ring, solid, opening outward
    const ripA = smooth(0, 0.1, age) * (1 - smooth(1.2, 1.5, t));
    if (ripA > 0.3) {
      const rw = 3.4 * s * (0.62 + 0.38 * Math.min(1, ripA));
      p.ellipse(bx, by, rw, rw * 0.5, (d, ang) => {
        if (d <= 0.6) return 0;
        return Math.sin(ang) > 0.1 ? C[2] : C[1];
      });
      p.px(bx, by, C[0]);
    }
    if (hh < 1) return;
    const py = by - hh;
    const lean = clamp((SX - bx) * 0.06, -0.5, 0.5); // claws lean in toward the aim point
    const hx = bx + lean * hh * 0.5;
    const top = py + 1.5 * s;
    // the wrist: a short dark column from the rip up to the palm, lit on its left edge
    p.line(bx, by, hx, top, body[0]);
    p.line(bx + 1, by, hx + 1, top, C[0]);
    if (!dim) p.line(bx - 1, by - 1, hx - 1, top + 1, body[2]);
    // palm
    const snapK = clamp((age - h.rise * 0.6 - h.snap) / 0.08);
    const open = clamp(1 - ease.outBack(snapK, 2.0), -0.3, 1) * clamp(hh / h.H * 2.2);
    p.ellipse(hx, py, 2.2 * s, 1.8 * s, (d, ang) => {
      const lit = -Math.cos(ang) * 0.6 - Math.sin(ang) * 0.8;
      if (d > 0.86) return lit > 0.2 ? body[4] : body[1];
      if (d > 0.55) return lit > 0.35 ? body[3] : body[1];
      return body[0];
    });
    if (!dim) {
      p.px(hx - 1.4 * s, py - 1 * s, C[4]);
      p.px(hx - 2.1 * s, py + 0.2 * s, C[3]);
    }
    // the fingers fan while the claw rises, then snap shut on the clutch
    const spread = 0.42 + open * 0.75;
    const fy = py - 1.4 * s;
    const tipC = open > 0.6 ? (dim ? C[4] : C[6]) : dim ? C[3] : C[5];
    for (let k = 0; k < h.fingers; k++) {
      const off = (k - (h.fingers - 1) / 2) * 1.2 * s;
      const ang = h.tilt * 0.6 + lean + (k - (h.fingers - 1) / 2) * spread * 0.55;
      digit(p, hx + off, fy, ang, 3.4 * s, (1 - Math.max(0, open)) * 0.9, body[1], body[2], tipC, edge);
    }
    // thumb, off to one side
    digit(p, hx + h.thumb * 1.9 * s, py + 0.1, h.thumb * (1.15 + 0.25 * open) + h.tilt * 0.4 + lean, 2.4 * s, (1 - Math.max(0, open)) * 0.7, body[1], body[2], tipC, edge);
    // a spark where it has just closed
    if (snapK < 0.35) {
      const k = 1 - snapK / 0.35;
      p.glow(hx, py - 2 * s, 6, C[6], 0.25 * k);
      p.px(hx + 0.5, py - 2.2 * s, k > 0.5 ? WHITE : C[7]);
    }
    // a breath of vapour off the wrist
    const vk = Math.sin(age * 5 + h.i * 2);
    p.disc(hx + vk * 2, py + 1, 1.6, C[3], 0.3 * (1 - down));
  }

  // the ground the spell breaks: a broad soot stain, lit cracks, chips, a low mound at the middle.
  // The stain is three solid bands with a slow twin-lobed cooling front and a torn solid rim — no per-pixel grain.
  function drawFloor(p, t) {
    const k = smooth(0.02, 0.12, t) * (1 - smooth(D - 0.3, D - 0.1, t));
    if (k <= 0.02) return;
    const RR = (SPREAD + 9) * (0.55 + 0.45 * k);
    p.shade(SX - RR, SY - RR * FL, SX + RR, SY + RR * FL, (x, y, out) => {
      const dx = (x - SX) / RR, dy = (y - SY) / (RR * FL), d = Math.hypot(dx, dy);
      if (d > 1) return;
      const th = Math.atan2(dy, dx);
      if (d > 0.9) {
        // the rim tears: solid segments, the near ones lighter
        if (0.5 + 0.5 * Math.cos(5 * th + 0.4) < 0.42) return;
        out.c = Math.sin(th) > 0.1 ? C[2] : C[1];
        out.a = 1;
        return;
      }
      const lobe = 0.5 + 0.5 * Math.cos(2 * th + 0.8 + d * 2.1);
      out.c = d < 0.36 ? C[0] : d < 0.68 ? (lobe > 0.5 ? C[0] : C[1]) : C[0];
      out.a = 1;
    });
    // the bulge: a mound pushed up under the floor, its near crest catching a little light
    const ba = t - 0.03;
    if (ba > 0 && ba < 0.85) {
      const up = ease.outBack(clamp(ba / 0.26), 1.3);
      const down = 1 - smooth(0.5, 0.85, ba);
      const rr = 8 * up * (0.55 + 0.45 * down);
      p.ellipse(SX, SY - 1, rr, rr * FL * 1.12, (d, ang) => {
        if (d > 0.86) return Math.sin(ang) > 0 ? C[2] : C[1];
        if (d > 0.5) return C[1];
        return C[0];
      });
    }
    // cracks, white-violet at first and then cold — solid 1-px lines, revealed by length
    for (const c of cracks) {
      const rev = smooth(0, 0.14, t - c.t0);
      if (rev <= 0) continue;
      const heat = 1 - smooth(c.hot, c.hot + 0.35, t);
      for (let i = 1; i < c.pts.length; i++) {
        const q0 = c.pts[i - 1], q1 = c.pts[i];
        if (i / c.pts.length > rev) break;
        const n = Math.max(1, Math.round(Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) * 2));
        for (let j = 0; j < n; j++) {
          const u = j / n;
          const x = q0[0] + (q1[0] - q0[0]) * u, y = q0[1] + (q1[1] - q0[1]) * u;
          p.px(x, y, heat > 0.4 ? (u < 0.45 ? C[5] : C[4]) : heat > 0.15 ? C[2] : C[1]);
          if (heat > 0.4) p.light(x, y, C[5], 0.35);
        }
      }
    }
    // chips and grit round the break
    for (const q of chips) p.px(q.x, q.y, q.c);
    if (t < 0.24) bandFloor(p, SX, SY, 5 + 22 * ease.outCubic(t / 0.24), 1.6, 1, [C[0], C[1], C[2]], (g) => Math.sin(g) > 0);
    floorLight(p, SX, SY, RR * 0.8, RR * 0.8 * FL, C[4], k * (0.16 + 0.1 * Math.sin(t * 7)));
  }

  return {
    update(dt) {
      t += dt;
    },
    draw(p, tt) {
      const t = tt;
      if (t >= END) return;
      drawFloor(p, t);
      // the spell's own light under the claws, so their dark shapes read against it
      let alive = 0;
      for (const h of hands) if (heightOf(h, t) > 2) alive++;
      const lk = alive / NH;
      if (lk > 0) p.glow(SX, SY - 1 - 5 * lk, 12 + 3 * lk, C[4], 0.24 * lk);
      // dust, and the motes it lifts
      for (const q of dust) {
        const a = t - q.t0;
        if (a < 0 || a > q.life) continue;
        const u = a / q.life, rise = q.rise * ease.outQuad(u);
        const x = q.x + q.drift * u, y = q.y - rise;
        // the dust is flat: two opaque steps that shrink away at the end of the lift, no translucent wash
        const s = 0.62 + 0.38 * (1 - smooth(0.6, 1, u)), r = (q.s + 1.5 + u * 1.6) * s;
        p.disc(x, y, r, q.bl < 0.5 ? C[2] : C[1], 1);
        p.disc(x, y, r * 0.6, C[0], 1);
      }
      for (const q of motes) {
        const a = ((t + q.phase) % q.life) / q.life;
        if (a > 0.85) continue;
        const x = q.x + q.sw * a, y = q.y - q.rise * ease.outQuad(a);
        p.px(x, y, q.bl < 0.35 ? C[6] : C[5]);
      }
      for (const h of hands) drawHand(p, h, t);
    },
  };
}
