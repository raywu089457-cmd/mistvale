// The follow-through of a critical hit: the spray that keeps going on along the blow after the star has gone.
// Where impacts/crit-hit is the punch, this is the debris — sparks streaking away from the hit, hot chips
// tumbling and bouncing on the floor, embers rising, a couple of wind streaks that sell the direction.
// Aim is +x by default (a blow to the right); the caller mirrors the sheet for a blow to the left.
import { Particles, Bits, Lights, P, B, Rng, fit, sparkle, WHITE } from "../../core/index.js";

export const meta = {
  name: "Crit spray",
  desc: "What a critical hit throws on past itself: a tight cone of hot sparks and streaks along the blow, chips that tumble, bounce twice and settle, and embers drifting up in its wake.",
  tags: ["impact", "hit", "crit", "sparks", "debris", "directional", "one-shot"],
  size: [200, 120],
  origin: [52, 72],
  duration: 0.6,
  loop: false,
  fps: 30,
  bg: "ground",
  options: { palette: ["#4a1712", "#8a1f17", "#c9281f", "#f2561d", "#ff8a2a", "#ffe26b", "#fff3a6", "#ffffff"], aim: 0, height: 0, floor: 42, seed: 5 },
};

export function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed), X = 0, Y = -(o.height ?? 0), A = o.aim ?? 0;
  const F = o.floor ?? 42; // the target's feet, in art px below the hit point (chest)
  const floor = () => F;
  const ps = new Particles({ rng: R, ground: floor, sparks: [C[7], C[6], C[5], C[4]] });
  const bits = new Bits({ ground: floor }), lights = new Lights();

  // the blow itself: a fast white cone, tight round the aim so the direction reads at a glance
  for (let i = 0; i < 26; i++) {
    const a = A + R.range(-1, 1) * 0.26, v = R.range(300, 560);
    ps.spawn(P.SPARK, X + 2, Y, Math.cos(a) * v, Math.sin(a) * v + R.range(-30, 30), R.range(0.1, 0.26), i < 16 ? WHITE : C[6], 1);
  }
  // and a wider, slower one behind it that falls and bounces off the floor
  for (let i = 0; i < 24; i++) {
    const a = A + R.range(-1, 1) * 0.75, v = R.range(120, 320);
    ps.spawn(P.SPARK, X, Y, Math.cos(a) * v, Math.sin(a) * v - R.range(10, 70), R.range(0.22, 0.5), R.pick([WHITE, C[6], C[5], C[5], C[4]]), 1);
  }
  // wind streaks: three straight lines flung out along the blow, gone in a flick
  for (let i = 0; i < 3; i++) {
    const a = A + R.range(-0.16, 0.16), v = R.range(420, 620);
    ps.spawn(P.STREAK, X + R.range(0, 6), Y + R.range(-8, 8), Math.cos(a) * v, Math.sin(a) * v, R.range(0.05, 0.09), i ? C[6] : WHITE, 1);
  }
  // hot chips knocked off: they tumble, hit the floor, bounce once or twice and go out
  for (let i = 0; i < 11; i++) {
    const a = A + R.range(-1, 1) * 0.85, v = R.range(110, 300);
    bits.add({ kind: B.SHARD, x: X + 2, y: Y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - R.range(20, 70), g: 0.85, drag: 0.55, bounce: 0.4, life: R.range(0.35, 0.58), a: R.range(0, 6.28), va: R.range(-26, 26), s: R.range(2, 4.5), c: R.pick([WHITE, C[6], C[5], C[5], C[4]]) });
  }
  // grit that just drops off and dies on the floor
  for (let i = 0; i < 7; i++) {
    const a = A + R.range(-1, 1) * 1.1, v = R.range(70, 190);
    ps.spawn(P.GRIT, X + 1, Y, Math.cos(a) * v, Math.sin(a) * v - R.range(40, 100), R.range(0.35, 0.58), R.pick([C[5], C[4], C[3]]), 1);
  }
  // embers of light left hanging in the wake
  for (let i = 0; i < 12; i++) {
    const a = A + R.range(-1, 1) * 1.2, v = R.range(20, 90);
    ps.spawn(P.MOTE, X + Math.cos(a) * R.range(4, 22), Y + Math.sin(a) * R.range(4, 18), Math.cos(a) * v, Math.sin(a) * v - R.range(8, 26), R.range(0.3, 0.58), R.pick([C[6], C[5], C[5], C[4]]), 0.7, R.range(0, 0.06));
  }
  // the second beat: a handful of sparks thrown on again from further out, so the spray is not one dead cone
  for (let i = 0; i < 10; i++) {
    const d = R.range(26, 44), a = A + R.range(-1, 1) * 0.5, v = R.range(90, 260);
    ps.spawn(P.SPARK, X + Math.cos(A) * d, Y + Math.sin(A) * d + R.range(-6, 6), Math.cos(a) * v, Math.sin(a) * v - R.range(0, 50), R.range(0.12, 0.3), R.pick([WHITE, C[6], C[5], C[4]]), 1, R.range(0.12, 0.19));
  }

  lights.add(X, Y, 34, C[5], 0.4, 0.12);
  lights.add(X + Math.cos(A) * 22, Y + Math.sin(A) * 22, 24, C[6], 0.35, 0.14);
  lights.add(X + Math.cos(A) * 46, Y + Math.sin(A) * 46, 16, C[4], 0.22, 0.18);

  let t = 0;
  return {
    update(dt) {
      t += dt;
      ps.update(dt);
      bits.update(dt);
      lights.update(dt);
    },
    draw(p) {
      ps.draw(p);
      bits.draw(p);
      lights.draw(p);
      // the first two frames: a hot smear from the hit out along the blow, then just its trail
      if (t < 0.034) p.glowLine(X, Y, X + Math.cos(A) * 88, Y + Math.sin(A) * 88, 10, C[5], 0.55);
      else if (t < 0.1) p.glowLine(X + Math.cos(A) * 34, Y + Math.sin(A) * 34, X + Math.cos(A) * 96, Y + Math.sin(A) * 96, 6, C[4], 0.3 * (1 - (t - 0.034) / 0.066));
      // and a glint out past the hit as the second beat of sparks pops
      const g2 = t - 0.15;
      if (g2 > 0 && g2 < 0.1) {
        const kk = 1 - g2 / 0.1;
        sparkle(p, X + Math.cos(A) * 38, Y + Math.sin(A) * 38 - 3, 1.6 + 2.4 * kk, C[6], WHITE, 0.55 * kk);
      }
    },
  };
}
