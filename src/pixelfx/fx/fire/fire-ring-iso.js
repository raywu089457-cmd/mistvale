// Fire ring for the game's 2:1 isometric camera: fire/fire-ring rewritten for the floor the game sees, not its
// picture squashed, stretched or scaled (this file used to be a projection of it). The recipe is the source's: heat
// streaks in to the caster's feet, a white flash, then flames race out over the floor in a ring, flaring as the
// front passes and burning down behind it over a smouldering scorch. What changed is the world it happens in:
//   - the front is a 2:1 ring racing out over the floor all round him, its far half behind him, its near half in
//     front; the flames stand upright on the floor where they are, far ones behind him, near ones in front;
//   - what the fire throws (sparks, embers, puffs, smoke) flies in 3D and falls or rises from where it is;
//   - the scorch is a 2:1 stain where the front has crossed, embers cooling in it; it does not fade: the flames burn
//     down, the embers go dark, and the soot crumbles away patch by patch, grain by grain.
// The caster is the game's own character (it stands at the origin): the effect draws no stand-in.
// 1 px = 1 character sprite px (32 x 16 px tiles).
import { Lights, P, Rng, fit, band, clamp, smooth, ease, noise, noise2, TAU, WHITE, hex, mix, rgb } from "../../core/index.js";
import { hotFirst, simDraw, floorLight } from "./_lib.js";
import { Fly3, pixelSet, setPx, drawSet, ringNoise } from "../_iso.js";

export const meta = {
  name: "Fire ring (iso)",
  desc: "fire/fire-ring on the 2:1 floor: a white flash at the caster's feet, flames race out over the floor in a ring all round him and burn down over a scorch that crumbles away.",
  tags: ["fire", "ring", "nova", "aoe", "spell", "ground", "one-shot", "iso", "top-down"],
  size: [236, 200],
  origin: [118, 140],
  duration: 3.9,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: {
    palette: ["#4a1712", "#8a1f17", "#c9281f", "#f2561d", "#ff8a2a", "#ffc23d", "#ffe26b", "#fff3a6", "#ffffff"],
    reach: 92,
    seed: 6,
  },
};

const FL = 0.5, CHARGE = 0.32, SPREAD = 0.75, SOOT = hex("#241a17"), SOOT2 = hex("#31241d"), SOOT3 = hex("#3f2f25"), ASHC = hex("#514a44"), WARM = rgb(255, 176, 96);

export function create(o) {
  const F = fit(o.palette, 9), H = hotFirst(F), REACH = o.reach, R = new Rng(o.seed), S = o.seed * 7, END = meta.duration;
  const fly = new Fly3({ rng: R, sparks: [H[1], H[2], H[4], H[5]] }), lights = new Lights();
  const GLOW = mix(mix(H[3], H[4], 0.5), WHITE, 0.25);
  const front = (t) => REACH * ease.outCubic(clamp((t - CHARGE) / SPREAD));
  const reachedAt = (d) => CHARGE + SPREAD * (1 - Math.cbrt(1 - Math.min(1, d / REACH)));
  const behind = (q) => q.z < 0, before = (q) => q.z >= 0;

  // the flames: the crest of the burning ring. Columns are packed 2 px apart along the front, so the fire is one
  // solid wall with a ragged top; colour depends only on height above each column's own foot, so neighbours agree and
  // the wall keeps clean heat bands instead of a speckle. It runs out with the front while the floor behind it cools.

  // the scorch, worked out once per floor pixel: how far out it is (ragged), when the front crosses it, how hot its
  // patch cools, and when it crumbles (patches go first, then the grains at their edges). Every field is a smooth
  // function of where the pixel is, so the stain reads as one solid mass instead of a field of grains
  const RX = Math.ceil(REACH + 3), RY = Math.ceil(RX * FL), SC = { x: [], y: [], d: [], at: [], h: [], g: [], c: [] };
  for (let y = -RY; y <= RY; y++)
    for (let x = -RX; x <= RX; x++) {
      const fx = x + 0.5, fz = (y + 0.5) / FL, d = Math.hypot(fx, fz), th = Math.atan2(fz, fx);
      const v = d / (REACH * (1 + 0.04 * ringNoise(th, 3, S) + 0.03 * ringNoise(th, 11, S + 1)));
      if (v > 1) continue;
      SC.x.push(x); SC.y.push(y); SC.d.push(d); SC.at.push(reachedAt(d));
      SC.h.push(0.5 + 0.62 * noise2(fx * 0.085, fz * 0.085, S + 2));
      SC.g.push(0.97 * clamp(0.5 + 0.85 * (0.62 * noise2(fx * 0.055, fz * 0.055, S + 3) + 0.38 * noise2(fx * 0.16, fz * 0.16, S + 4))));
      SC.c.push(0.5 + 0.6 * noise2(fx * 0.13, fz * 0.13, S + 5));
    }
  const SSET = pixelSet(SC.x.length, [-RX, -RY, RX, RY]);
  // tongues of fire standing on the floor itself: they light where the front crosses them and gutter down as the
  // soot cools, so the ground keeps burning between the racing ring and the final frames instead of going flat
  const LICKS = [];
  for (let i = 0; i < 56; i++) {
    const a = R.range(0, TAU), d = Math.sqrt(R.range(0.02, 0.88)) * REACH;
    LICKS.push({ x: Math.round(Math.cos(a) * d), y: Math.round(Math.sin(a) * d * FL), d, at: reachedAt(d) + R.range(0, 0.12), life: R.range(1.5, 2.5), ph: R.range(0, TAU), s: R.range(0.55, 1.3) });
  }
  // the coals left lying in it: a handful of discrete embers, each cooling at its own time
  const EMBERS = [];
  for (let i = 0; i < 34; i++) {
    const a = R.range(0, TAU), d = Math.sqrt(R.range(0.02, 0.92)) * REACH;
    EMBERS.push({ x: Math.round(Math.cos(a) * d), y: Math.round(Math.sin(a) * d * FL), at: reachedAt(d) + R.range(0.05, 0.45), life: R.range(0.6, 1.5), twin: R.chance(0.45) });
  }

  let t = 0, burst = false;
  return {
    update(dt) {
      t += dt;
      // the charge: streaks of fire spiral in to his feet from every side, heat building there
      if (t < CHARGE - 0.05 && R.chance(0.9 * dt * 60)) {
        const a = R.range(0, TAU), d = R.range(26, 54), T = R.range(0.18, 0.26), v = (d * 3) / (Math.exp(3 * T) - 1), h = R.range(1, 12);
        const x = Math.cos(a) * d, z = Math.sin(a) * d, l = Math.hypot(x, z, h) || 1;
        fly.spawn(P.STREAK, x, z, h, (-x / l) * v, (-z / l) * v, (-h / l) * v, T, R.chance(0.5) ? H[2] : H[3]);
      }
      if (t < CHARGE && R.chance(0.5 * dt * 60 * (t / CHARGE))) fly.spawn(P.FIRE, R.range(-4, 4), R.range(-3, 3), 1, R.range(-8, 8), R.range(-6, 6), R.range(20, 40), R.range(0.12, 0.24), 0, R.range(1, 2.2));
      if (!burst && t >= CHARGE) {
        burst = true;
        lights.add(0, -18, 64, WARM, 0.85, 0.5);
        lights.add(0, -4, 30, WHITE, 0.8, 0.08);
        // sparks thrown out of the flash every way round, falling back to the floor at their own depth
        for (let i = 0; i < 44; i++) {
          const a = R.range(0, TAU), sp = R.range(70, 190);
          fly.spawn(P.SPARK, Math.cos(a) * 3, Math.sin(a) * 3, 2, Math.cos(a) * sp, Math.sin(a) * sp, R.range(60, 170), R.range(0.25, 0.6));
        }
      }
      // fire shed off the burning crest: a puff that rises over the wall and some cool into smoke, and the odd ember
      if (t > CHARGE && t < CHARGE + SPREAD + 0.8 && R.chance(1.1 * dt * 60)) {
        const a = R.range(0, TAU), fr = front(t), d = fr * R.range(0.94, 1.04);
        const x = Math.cos(a) * d, z = Math.sin(a) * d, h = R.range(12, 22);
        fly.spawn(P.FIRE, x, z, h, R.range(-4, 4), R.range(-3, 3), R.range(16, 34), R.range(0.18, 0.34), 0, R.range(1, 1.8), { smokes: R.chance(0.5) });
        if (R.chance(0.16)) fly.spawn(P.EMBER, x, z, h, R.range(-14, 14), R.range(-9, 9), R.range(30, 70), R.range(0.6, 1.2), H[3], 1);
      }
      // the scorch smoulders: a thread of smoke off it here and there while it's hot
      if (t > CHARGE + SPREAD && t < END - 1.2 && R.chance(6 * dt)) {
        const a = R.range(0, TAU), d = R.range(0.2, 1) * REACH;
        fly.spawn(P.SMOKE, Math.cos(a) * d, Math.sin(a) * d, 1, R.range(-4, 4), R.range(-3, 3), R.range(6, 14), R.range(0.9, 1.4), 0, R.range(2, 3.5));
      }
      fly.update(dt);
      lights.update(dt);
      fly.cap(Math.max(0.001, END - 0.05 - t));
    },
    drawBack(p) {
      scorch(p);
      // light on the floor running with the front, and the heat building at his feet before it
      const fr = front(t), k = t < CHARGE ? 0 : 1 - smooth(CHARGE + SPREAD, CHARGE + SPREAD + 1.4, t);
      if (k > 0) for (let i = 0; i < 18; i++) p.glow(Math.cos((i / 18) * TAU) * fr, Math.sin((i / 18) * TAU) * fr * FL - 2, 16, GLOW, 0.2 * k);
      if (t < CHARGE) floorLight(p, 0, 0, 6 + 20 * (t / CHARGE), (6 + 20 * (t / CHARGE)) * FL, GLOW, 0.5 * (t / CHARGE));
      ring(p, true);
      flames(p, false);
      groundFire(p);
      fly.draw(p, behind, (ps) => simDraw(p, ps, H));
    },
    draw(p) {
      ring(p, false);
      // the white flash at his feet: a hot 2:1 splash on the floor
      if (t >= CHARGE && t < CHARGE + 0.1) {
        const k = 1 - (t - CHARGE) / 0.1;
        p.ellipse(0, 0, 16 * (0.6 + 0.4 * k), 8 * (0.6 + 0.4 * k), H[2]);
        p.ellipse(0, 0, 10 * (0.6 + 0.4 * k), 5 * (0.6 + 0.4 * k), k > 0.5 ? WHITE : H[1]);
      }
      flames(p, true);
      fly.draw(p, before, (ps) => simDraw(p, ps, H));
      if (t < CHARGE) p.glow(0, -3, 8 + 22 * (t / CHARGE), GLOW, 0.6 * (t / CHARGE));
      const k = smooth(CHARGE - 0.05, CHARGE, t) * (1 - smooth(CHARGE + SPREAD * 0.5, CHARGE + SPREAD + 1.2, t));
      if (k > 0) p.glow(0, -8, 92, GLOW, 0.26 * k);
      lights.draw(p);
    },
  };

  // the flames: one crest ring of fire on the floor. It is filled per screen column (a column per x, one per arc),
  // so the wall is solid with a clean ragged crest; colour is a function of height over a global 30 px scale, so the
  // wall keeps clean heat bands (white-hot foot, yellow heart, orange body, red crest) instead of stripes or speckle.
  function flames(p, near) {
    const fr = front(t);
    if (fr < 6) return;
    // the fire burns up as the front starts and dies back to embers once the ring has run out
    const burn = smooth(CHARGE, CHARGE + 0.05, t) * (1 - smooth(CHARGE + SPREAD + 0.85, CHARGE + SPREAD + 2.15, t));
    if (burn <= 0) return;
    const q = Math.min(1, fr / REACH), HM = 22, top0 = 9 + 15 * q, X = Math.ceil(fr) + 1;
    // as the wall dies back it cools: the foot stops being white-hot, so the last frames are red embers, not a neon oval
    const hot = burn > 0.72 ? 0 : burn > 0.5 ? 1 : burn > 0.3 ? 2 : 3;
    const CR = [H[1], H[2], H[3], H[4], H[5]];
    const rowCol = new Int32Array(48);
    for (let j = 0; j < 48; j++) {
      const v = j / HM;
      rowCol[j] = CR[Math.min(4, hot + (v < 0.16 ? 0 : v < 0.4 ? 1 : v < 0.62 ? 2 : v < 0.82 ? 3 : 4))];
    }
    // tongue spacing along the ring: one flame every ~15 px of arc, so the crest scallops in broad strokes
    const per = TAU * Math.sqrt((fr * fr + (fr * FL) * (fr * FL)) * 0.5);
    const lobes = Math.max(8, Math.round(per / 15)), lobeK = Math.max(2, lobes / Math.PI);
    const crest = new Int16Array(2 * X + 1).fill(1 << 14);
    for (let x = -X; x <= X; x++) {
      const rem = fr * fr - x * x;
      if (rem <= 0) continue;
      const z = Math.sqrt(rem) * (near ? 1 : -1), fy = Math.round(z * FL), a = Math.atan2(z, x);
      // clumps: the fire stands higher in some stretches of the ring than others, so it reads as one fire
      const clump = 0.85 + 0.2 * ringNoise(a, 5, S + 9) + 0.1 * ringNoise(a, 13, S + 21);
      // lobes: the wall rises into tongues and dips between them, so its crest is scalloped in broad strokes
      const lobe = 0.5 + 0.5 * ringNoise(a, lobeK, S + 33);
      const h = top0 * burn * (0.5 + 0.95 * lobe) * clump * (1 + 0.12 * noise(t * 3.2 + a * 2, S + 31));
      const top = Math.round(h);
      crest[x + X] = fy - top;
      for (let j = 0; j < top; j++) p.px(x, fy - j, rowCol[Math.min(47, j)]);
    }
    // one tapered tongue over every lobe peak: a few discrete solid flames, so the wall reads as fire, not a ring of light
    for (let i = 0; i < lobes; i++) {
      const a = ((i + 0.5) / lobes) * TAU, z = Math.sin(a) * fr;
      if (z >= 0 !== near) continue;
      const x = Math.round(Math.cos(a) * fr), top = crest[x + X];
      if (top > 1 << 13) continue;
      const amp = clamp(0.5 + 0.55 * ringNoise(a, 9, S + 71));
      if (amp < 0.3) continue;
      const L = Math.round((4 + 10 * amp) * burn);
      if (L < 2) continue;
      const w = 1 + Math.round(2 * amp), sway = noise(t * 4.2 + a * 1.3, S + 61) * 1.8;
      for (let j = 0; j < L; j++) {
        const vv = j / L, ox = Math.round(sway * vv * vv);
        const ww = Math.max(1, Math.round(w * (1 - vv * 0.85)));
        const c = vv < 0.4 ? H[3] : vv < 0.75 ? H[4] : H[5];
        for (let k2 = 0; k2 < ww; k2++) p.px(x + ox - (ww >> 1) + k2, top - j, c);
      }
    }
  }

  // the front: a solid 2:1 wall of fire racing out over the floor, far half behind him, near half in front; it cools
  // from white-hot to deep red as it runs, and the band thins instead of fading, so it is never a stipple
  function ring(p, back) {
    const k = (t - CHARGE) / (SPREAD + 0.1);
    if (k < 0 || k >= 1) return;
    const ramp = k < 0.4 ? [H[7], H[5], H[3], H[1]] : k < 0.72 ? [H[7], H[6], H[4], H[2]] : [H[8], H[7], H[5], H[3]];
    band(p, 0, 0, front(t) + 1.5, FL, Math.max(2, 8 * Math.pow(1 - k, 0.8)), 1, ramp, (g) => Math.sin(g) < 0 === back, k < 0.12);
  }

  // the ground fire: short tongues standing on the soot, each guttering on its own phase. Drawn in the back layer
  // with the scorch, so the hero walks over the burning floor instead of through it.
  function groundFire(p) {
    const fr = front(t);
    if (fr < 4) return;
    for (const l of LICKS) {
      if (l.d > fr) continue;
      const k = 1 - (t - l.at) / l.life;
      if (k <= 0.02) continue;
      const flick = 0.74 + 0.26 * Math.sin(t * 11 + l.ph) + 0.1 * Math.sin(t * 23.5 + l.ph * 2.3);
      const top = Math.max(1, Math.round((1.2 + 3.6 * l.s * flick) * k));
      for (let j = 0; j < top; j++) {
        const f = j / Math.max(1, top - 1);
        p.px(l.x, l.y - j, f < 0.3 ? H[2] : f < 0.6 ? H[3] : f < 0.86 ? H[4] : H[5]);
      }
      p.px(l.x, l.y, H[1]);
    }
  }

  // the scorch: a solid soot stain where the fire has crossed, its heat cooling in broad patches; at the end it
  // crumbles away patch by patch (the ash rim follows the patch edges), never a fade on its own grain
  function scorch(p) {
    const fr = front(t);
    if (fr < 1) return;
    const gone = smooth(END - 1.45, END - 0.12, t);
    SSET.n = 0;
    for (let i = 0; i < SC.x.length; i++) {
      const d = SC.d[i];
      if (d > fr) continue;
      const since = t - SC.at[i], hot = 1 - since / (0.12 + SC.h[i] * 0.16);
      if (hot > 0.04) {
        const hk = hot > 0.55 ? H[3] : hot > 0.26 ? H[4] : H[5];
        setPx(SSET, SC.x[i], SC.y[i], hk, 1);
        continue;
      }
      // the coals: after the flames have crossed a patch, its hottest pockets keep burning amber for about a second
      // and only then cool into the soot. Flat and opaque, so the CQ repaint keeps it as heat bands, not grain.
      if (SC.c[i] > 0.72) {
        const ck = 1 - since / 1.15;
        if (ck > 0) {
          setPx(SSET, SC.x[i], SC.y[i], ck > 0.62 ? H[2] : ck > 0.3 ? H[3] : H[4], 1);
          continue;
        }
      }
      const g = SC.g[i];
      if (g < gone) continue;
      // flat soot bands, fully opaque: the playground draws the floor at one sprite pixel per screen pixel, and a
      // half-transparent stain dithers into a field of black grains there. The shade does the work instead: charred
      // browns in broad noise patches, a grey ash rim where the patch is about to crumble. /* derived */
      const edge = gone > 0 && g - gone < 0.05;
      const tone = g < 0.34 ? SOOT : g < 0.68 ? SOOT2 : SOOT3;
      setPx(SSET, SC.x[i], SC.y[i], edge ? ASHC : tone, 1);
    }
    drawSet(p, SSET);
    // the coals in it, each turning from orange to deep red as it cools
    for (const e of EMBERS) {
      const k = 1 - (t - e.at) / e.life;
      if (k <= 0) continue;
      p.px(e.x, e.y, k > 0.66 ? H[3] : k > 0.36 ? H[4] : H[5]);
      if (e.twin && k > 0.5) p.px(e.x + 1, e.y, H[5]);
    }
  }
}
