// Holy pillar for the game's 2:1 isometric camera: holy/holy-pillar rewritten as an attack on a mark on the floor
// the game sees, not its picture squashed, stretched or scaled. The recipe is the source's: light breaks through
// from above, a sun opens at the top and shafts converge on the mark, pulsing, while a sigil burns on the floor;
// then the shafts fold shut and the light lifts away. What changed is the world it happens in:
//   - the shafts are a cone of light in 3D, not a fan in the picture: each comes down out of the sky on its own
//     slant from its own side, all meeting at the mark, so the ones leaning toward us come down in front of whoever
//     stands there and the rest behind; they swing in from straight down as they open and swing back as they fold;
//   - the sigil burns 2:1 on the floor round the mark and cools; the sparks of the hit fly every way round in 3D and
//     fall back at their own depth; the dust in the air lights up only where a shaft passes through it;
//   - pass the target as `actor` and the shafts light it while they pour on it.
// 1 px = 1 character sprite px (32 x 16 px tiles).
import { Lights, P, Rng, fit, sparkle, clamp, smooth, seg, lerp, ease, rand, TAU, WHITE } from "../../core/index.js";
import { GOLD, Feathers, oval, shapeOf } from "./_lib.js";
import { Fly3 } from "../_iso.js";

export const meta = {
  name: "Holy pillar (iso)",
  desc: "holy/holy-pillar on the 2:1 floor: a sun opens high over the mark and a cone of light shafts converges on it from all round, a sigil burns under it, then it folds shut.",
  tags: ["holy", "pillar", "light", "rays", "attack", "sigil", "ground", "one-shot", "iso", "top-down"],
  size: [208, 256],
  origin: [104, 226],
  duration: 3.5,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: GOLD, shafts: 7, seed: 3 },
};

const HT = 204, SUNH = 166, FL = 0.5, RX = 26, W = 208;
const OPEN = 0.3, HIT = 0.66, FOLD = 2.05, SHUT = 2.45, LIFT = 2.75;
const frac = (x) => x - Math.floor(x);

export function create(o) {
  const C = fit(o.palette, 8), N = Math.max(3, o.shafts | 0), R = new Rng(o.seed), END = meta.duration;
  const WING = [C[2], C[3], C[4], C[5], C[6], WHITE];
  const fly = new Fly3({ rng: R, sparks: [WHITE, C[6], C[5], C[3]] }), lights = new Lights(), feathers = new Feathers(R, 0);
  const shape = o.actor?.mask ? shapeOf(o.actor) : null;
  // the shafts: round the mark at their own bearing (az), each leaning out by its own tilt as it opens
  const shafts = Array.from({ length: N }, (_, i) => {
    const far = (i % 3) / 2;
    return { az: (i / N) * TAU + R.range(-0.2, 0.2) + 0.3, tilt: R.range(0.26, 0.4), spread: R.range(0.05, 0.085) * (1 - far * 0.25), b: (1 - far * 0.35) * R.range(0.8, 1), ph: R.range(0, 1), far };
  });
  const motes = Array.from({ length: 80 }, () => ({ x: R.range(-80, 80), z: R.range(-50, 50), y: R.range(0, 1), v: R.range(7, 18), amp: R.range(0.5, 2.5), f: R.range(0.6, 1.5), ph: R.range(0, TAU) }));
  for (let i = 0; i < 6; i++)
    feathers.add({ x: R.range(-46, 46), y: R.range(-150, -100), vx: R.range(-8, 8), vy: R.range(0, 8), a: R.range(-0.4, 0.4), len: R.range(7, 9), wid: R.range(1.9, 2.3), life: R.range(1.4, 1.7), sink: R.range(26, 36), back: i % 3 === 0, delay: HIT + 0.1 + i * 0.16 + R.range(0, 0.08) });
  const row = new Float32Array(W), core = new Uint8Array(W);
  let t = 0, hit = false, shut = false, glinted = false;

  const tiltOf = (s, tt) => {
    const st = s.far * 0.1, open = ease.outBack(seg(tt, OPEN + st, OPEN + st + 0.42), 1.5), fold = ease.inOutCubic(seg(tt, FOLD - s.far * 0.1, SHUT));
    return s.tilt * open * (1 - fold);
  };
  const frontD = (s, tt) => HT * (1 - ease.inQuad(seg(tt, OPEN + s.far * 0.06, HIT + s.far * 0.06)));
  const liftD = (tt) => HT * ease.inQuad(seg(tt, SHUT + 0.05, LIFT));
  const fade = (tt) => smooth(OPEN, OPEN + 0.1, tt) * (1 - smooth(LIFT - 0.05, LIFT + 0.05, tt));
  const width = (s, d, tt) => (1.4 + d * s.spread) * lerp(1, 0.25, smooth(SHUT, LIFT, tt));
  const pulse = (s, d, tt) => {
    if (tt < HIT || tt > SHUT) return 1;
    const D = HT * (1 - frac((tt - HIT) / 0.6 + s.ph));
    return 1 + 0.9 * Math.exp(-(((d - D) / 12) ** 2));
  };
  // a shaft seen on the screen: at screen row y (above the mark), how high up it the light is (dy) and where it
  // crosses the row (xc); a shaft leaning toward us climbs the screen more slowly
  const across = (s, a, y) => {
    const ta = Math.tan(a), k = 1 - FL * ta * Math.sin(s.az), dy = -y / k;
    return { dy, xc: ta * Math.cos(s.az) * dy, d: dy / Math.cos(a) };
  };
  const lightAt = (x, y) => {
    let I = 0;
    for (const s of shafts) {
      const a = tiltOf(s, t), { dy, xc, d } = across(s, a, y);
      if (dy <= 0 || dy > HT || d < liftD(t) || d < frontD(s, t)) continue;
      const v = (x - xc) / (width(s, d, t) / 2);
      if (Math.abs(v) < 1) I += (1 - v * v) * s.b;
    }
    return I * fade(t);
  };

  return {
    update(dt) {
      t += dt;
      if (t < OPEN + 0.1 && R.chance(0.5)) {
        const a = R.range(0, TAU), D = R.range(22, 34), T = R.range(0.18, 0.28), v = ((D - 10) * 3) / (Math.exp(3 * T) - 1);
        fly.spawn(P.STREAK, Math.cos(a) * D, R.range(-6, 6), SUNH - Math.sin(a) * D, -Math.cos(a) * v, 0, Math.sin(a) * v, T, R.chance(0.5) ? C[6] : C[5], 1, { g: 0 });
      }
      if (!hit && t >= HIT) {
        hit = true;
        lights.add(0, -30, 64, C[5], 0.85, 0.5);
        lights.add(0, -6, 30, WHITE, 0.8, 0.12);
        for (let i = 0; i < 26; i++) {
          const a = R.range(0, TAU), sp = R.range(50, 140);
          fly.spawn(P.SPARK, R.range(-3, 3), R.range(-2, 2), 2, Math.cos(a) * sp, Math.sin(a) * sp, R.range(60, 180), R.range(0.25, 0.6));
        }
      }
      if (t > HIT && t < SHUT + 0.1 && R.chance(0.35)) {
        const g = R.range(0, TAU), r = RX * (R.chance(0.5) ? 1 : 0.72);
        fly.spawn(P.EMBER, Math.cos(g) * r, Math.sin(g) * r, 1, R.range(-6, 6), R.range(-4, 4), R.range(12, 30), R.range(0.5, 0.8), C[5], 1);
      }
      if (t > HIT && t < FOLD && R.chance(0.05)) fly.spawn(P.STAR, R.range(-40, 40), R.range(-20, 20), R.range(20, 160), 0, 0, -R.range(2, 8), R.range(0.3, 0.6), R.chance(0.5) ? WHITE : C[6], R.range(0.8, 1.8), { g: 0 });
      if (!shut && t >= SHUT) {
        shut = true;
        lights.add(0, -60, 70, C[5], 0.7, 0.35);
        for (let i = 0; i < 12; i++) fly.spawn(P.STAR, R.range(-4, 4), R.range(-3, 3), R.range(10, 170), R.range(-25, 25), R.range(-12, 12), R.range(-10, 10), R.range(0.4, 0.8), R.chance(0.5) ? WHITE : C[6], R.range(0.8, 2), { g: 0 });
      }
      if (!glinted && t >= LIFT) {
        glinted = true;
        lights.add(0, -SUNH, 40, WHITE, 0.6, 0.2);
      }
      fly.update(dt);
      feathers.update(dt);
      lights.update(dt);
      fly.cap(Math.max(0.001, END - 0.05 - t));
    },
    drawBack(p) {
      fan(p, false);
      sigil(p, true);
      feathers.draw(p, WING, "back");
      fly.draw(p, (q) => q.z < 0);
    },
    draw(p) {
      sigil(p, false);
      // the target, lit by the shafts pouring on it
      if (shape && t > HIT - 0.05 && t < SHUT + 0.2) {
        const k = smooth(HIT - 0.05, HIT + 0.1, t) * (1 - smooth(SHUT - 0.1, SHUT + 0.2, t));
        for (const [x, y] of shape.out) p.light(x, y, C[5], 0.5 * k);
      }
      fan(p, true);
      for (const m of motes) {
        const y = -HT + ((((m.y * HT + t * m.v) % HT) + HT) % HT) + m.z * FL, x = m.x + Math.sin(t * m.f + m.ph) * m.amp, I = lightAt(x, y);
        if (I < 0.2) continue;
        p.dot(x, y, I > 0.7 ? WHITE : C[6], Math.min(1, I * 1.3));
        p.light(x, y, C[5], 0.4 * Math.min(1, I));
      }
      sun(p);
      if (t > HIT - 0.02 && t < HIT + 0.25) sparkle(p, 0, -3, 12 * (1 - (t - HIT) / 0.25), WHITE, C[5], 0.7);
      if (t > SHUT && t < SHUT + 0.2) sparkle(p, 0, -3, 8 * (1 - (t - SHUT) / 0.2), WHITE, C[5], 0.5);
      feathers.draw(p, WING, "front");
      fly.draw(p, (q) => q.z >= 0);
      lights.draw(p);
    },
  };

  // the shafts, row by row up the screen: the ones leaning toward us in front, the rest behind
  function fan(p, near) {
    const k = fade(t);
    if (k <= 0) return;
    const lift = liftD(t);
    for (let y = -HT; y < -1; y++) {
      row.fill(0);
      core.fill(0);
      let any = false;
      for (const s of shafts) {
        if (Math.sin(s.az) >= 0 !== near) continue;
        const a = tiltOf(s, t), { dy, xc, d } = across(s, a, y + 0.5);
        if (dy <= 0 || dy > HT || d < lift || d < frontD(s, t) - 6) continue;
        const hw = width(s, d, t) / 2, soft = smooth(frontD(s, t) - 6, frontD(s, t) + 4, d) * smooth(lift, lift + 6, d) * smooth(HT, HT - 40, dy);
        const I0 = s.b * pulse(s, d, t) * soft * k;
        for (let x = Math.floor(xc - hw); x <= Math.ceil(xc + hw); x++) {
          const v = (x + 0.5 - xc) / hw, i = x + W / 2;
          if (i < 0 || i >= W || Math.abs(v) >= 1) continue;
          row[i] += I0 * Math.pow(1 - v * v, 1.3);
          any = true;
        }
        const ci = Math.round(xc - 0.5) + W / 2;
        if (ci >= 0 && ci < W) core[ci] = Math.max(core[ci], Math.min(255, I0 * 200));
      }
      if (!any) continue;
      for (let i = 0; i < W; i++) {
        const I = row[i];
        if (I < 0.02) continue;
        const x = i - W / 2;
        p.blend(x, y, C[6], Math.min(0.6, I * 0.38));
        p.light(x, y, C[4], Math.min(0.9, I * 0.32));
        if (core[i]) p.dot(x, y, core[i] > 150 ? WHITE : C[6], Math.min(1, core[i] / 180));
      }
    }
    if (near && t > HIT - 0.05) p.glow(0, -4, 20, C[5], 0.5 * k);
  }

  // the sun: a halo high over the mark that opens like an iris, rays ticking round it, then closes with a glint
  function sun(p) {
    const r = 15 * ease.outBack(seg(t, 0.02, 0.45), 1.8) * (1 - ease.inBack(seg(t, SHUT, LIFT + 0.1), 1.5)), Y = -SUNH;
    if (r > 0.5) {
      const spin = t * 0.6;
      p.glow(0, Y, Math.min(32, r * 3), C[4], 0.5);
      p.glow(0, Y, r * 1.4, WHITE, 0.35);
      p.circle(0, Y, r * 0.45, WHITE);
      oval(p, 0, Y, r * 0.62, r * 0.62, C[6], 1);
      oval(p, 0, Y, r, r, (g) => (Math.sin(g * 6 + spin * 4) > 0.5 ? WHITE : C[5]), 1);
      for (let j = 0; j < 16; j++) {
        const g = spin + (j * TAU) / 16, l = j % 2 ? 3 : 6;
        p.line(Math.cos(g) * (r + 2), Y + Math.sin(g) * (r + 2), Math.cos(g) * (r + 2 + l), Y + Math.sin(g) * (r + 2 + l), (u) => (u < 0.4 ? C[6] : C[4]), (u) => 1.1 - u);
      }
    }
    if (t > LIFT && t < LIFT + 0.3) sparkle(p, 0, Y, 10 * (1 - (t - LIFT) / 0.3), WHITE, C[5], 0.6);
  }

  // the sigil burning on the floor round the mark: two 2:1 rings and a turning band of marks; white-hot, gold,
  // cooling down the ramp to dark; it burns in round from the front and goes out the same way
  function sigil(p, back) {
    if (t < HIT) return;
    const u = seg(t, HIT, HIT + 0.2), heat = 1 - smooth(SHUT, SHUT + 0.8, t), gone = seg(t, SHUT + 0.5, SHUT + 1.0);
    if (gone >= 1) return;
    const keep = back ? (g) => Math.sin(g) < 0 : (g) => Math.sin(g) >= 0;
    const fromFront = (g) => Math.abs(((((g - Math.PI / 2 + Math.PI) % TAU) + TAU) % TAU) - Math.PI) / Math.PI;
    const burnt = (g) => fromFront(g) <= u + 0.01 && fromFront(g) >= gone;
    const col = (g, hot) => {
      if (!burnt(g)) return 0;
      const flick = rand(Math.round(g * 40), Math.floor(t * 20)) < 0.18;
      return t < HIT + 0.08 || (flick && heat > 0.4) ? WHITE : heat > 0.6 ? (hot ? C[6] : C[5]) : heat > 0.3 ? C[4] : heat > 0.1 ? C[3] : C[2];
    };
    oval(p, 0, 0, RX, RX * FL, (g) => col(g, true), 1, (g) => keep(g) && burnt(g));
    oval(p, 0, 0, RX * 0.72, RX * 0.72 * FL, (g) => col(g, false), 1, (g) => keep(g) && burnt(g));
    for (let j = 0; j < 12; j++) {
      const g = t * 0.35 + (j * TAU) / 12;
      if (!keep(g) || !burnt(g)) continue;
      const c = col(g, j % 2 === 0), r0 = RX * 0.78, r1 = RX * (j % 3 === 0 ? 0.95 : 0.88);
      if (c) p.line(Math.cos(g) * r0, Math.sin(g) * r0 * FL, Math.cos(g) * r1, Math.sin(g) * r1 * FL, c, 1);
    }
    if (!back) {
      const out = 1 - gone;
      for (let i = -2; i <= 2; i++) p.glow(i * RX * 0.45, -2, 16, C[4], (0.34 - Math.abs(i) * 0.05) * out * heat);
      p.glow(0, -1, 10, WHITE, 0.3 * heat * out);
    }
  }
}
