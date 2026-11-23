// A ground blast authored for 2:1 isometric / top-down cameras. The library's other explosions play in the
// screen plane, as if the viewer stood beside them; this one spreads along the FLOOR. Its world is a floor:
// x across, z into the screen, and anything off the floor is height, so a ground direction of angle a moves
// (cos a, sin a * FLOOR) in screen terms and a ring on the floor is a 2:1 ellipse.
//
// The recipe is the library's blast recipe (Particles, Bits, Lights and the smoke Plume/Column, as in
// big-explosion, itself adapted from Sprite Fusion's MIT explosion), reshaped for that camera: the fire spreads
// flat, dust rolls out along the floor, the smoke climbs, and everything thrown out lands back on the ground.
import { Particles, Bits, Lights, P, PF, B, Rng, fit, flare, smooth, clamp, TAU, WHITE, hex, mix } from "../../core/index.js";
import { stone, fireRamp, heatRamp, drawPs, cull, rock, dome, pool, trail, Plume, Column } from "./_lib.js";
import { FLOOR, bandFloor, scorchFloor } from "../_iso.js";

export const meta = {
  name: "Ground blast",
  desc: "A top-down blast: rings running out across the floor as 2:1 ellipses, fire spreading flat, rocks and grit thrown along the ground, and a smoke column over fires left burning.",
  tags: ["explosion", "ground", "iso", "top-down", "fire", "smoke", "debris", "one-shot"],
  size: [208, 168],
  origin: [104, 132],
  duration: 4.4,
  loop: false,
  fps: 30,
  bg: "ground",
  options: {
    palette: ["#4a1712", "#c9281f", "#f2561d", "#ff8a2a", "#ffc23d", "#ffe26b", "#fff3a6", "#ffffff"],
    stone: "#4a3f69",
    seed: 4,
  },
};

const RAD = 26, POWER = 1.15;
// the plume's smoke, lit on top to sooty underneath
const SM = ["#83777f", "#6e6470", "#575060", "#3f3947", "#29242f"].map(hex);
// one main blast and two smaller ones a beat apart, walking out across the floor (off to the sides, as a
// top-down camera sees them, not climbing the screen like the side-view mushroom)
const BLASTS = [
  { t: 0, x: 0, z: 0, rad: RAD, power: POWER, main: true },
  { t: 0.14, x: -20, z: 14, rad: 13, power: 0.5 },
  { t: 0.26, x: 19, z: -12, rad: 12, power: 0.45 },
];
const SOOT = hex("#0d0a12"), SOOT2 = hex("#17121d");

export function create(o) {
  const F = fit(o.palette, 8), FR = fireRamp(F), HR = heatRamp(FR), st = stone(o.stone), R = new Rng(o.seed);
  const [W, H] = meta.size, [OX, OY] = meta.origin;
  const X0 = -OX + 3, X1 = W - OX - 3, Y0 = -OY + 3, Y1 = H - OY - 3;
  const floor = () => 0, WARM = mix(F[3], F[6], 0.45);
  const ps = new Particles({ rng: R, ground: floor, sparks: [F[6], F[5], F[3], F[2]], onLand: (x, y) => t < 1.3 && burns.push({ x, y: y - 0.25, life: R.range(0.9, 1.6), max: 1.6, acc: R.next(), power: R.range(0.6, 1.1), seed: R.range(0, 100) }) });
  const burns = [];
  const rocks = new Bits({ ground: floor }), lights = new Lights(), flashes = [], rings = [];
  // the smoke column boiling up out of the blast: a cap that spreads as it rises over a stem fed from the floor
  const plume = new Plume(R, {
    x: 0, y: -14, rise: 58, tau: 1.0, drift: 3, tube: [5, 13], ring: [2, 11], grow: 0.8, n: 14, size: [4, 7],
    swell: 0.6, spin: 2.0, spinTau: 1.4, heat: 1.1, cool: 0.5, under: 0.5, tilt: 0.15, squash: 0.7, fade: [1.5, 2.15], spread: 8,
  });
  const column = new Column(R, { w: 4, foot: 12, speed: 60, size: [5, 8], n: 12, sway: 1.8 });
  const top = () => { const S = plume.shape(); return S.y + S.tube * 0.45; };
  let t = 0, next = 0;

  const blast = ({ x, y, rad, power, main }) => {
    if (!main) flashes.push({ x, y, r: rad * 1.1, life: 0.06, max: 0.06 });
    rings.push({ x, y, r0: rad * 0.5, r1: rad * (main ? 2.7 : 2.2), life: main ? 0.42 : 0.28, max: main ? 0.42 : 0.28, thick: main ? 3.2 : 2, c: F[5] },
      { x, y, r0: rad * 0.3, r1: rad * 1.7, life: 0.24, max: 0.24, thick: 1.8, c: F[3] });
    lights.add(x, y - 18, main ? 50 : rad * 2.4, WARM, 0.55 * power, 0.8);
    lights.add(x, y, main ? 32 : rad * 1.4, WHITE, 0.5, 0.1);
    // fire: thrown out across the floor, climbing the screen, cooling into smoke
    for (let i = 0; i < Math.round(17 * power); i++) {
      const a = R.range(0, TAU), sp = R.range(30, 150) * power, d = R.range(0, rad * 0.5);
      ps.spawn(P.FIRE, x + Math.cos(a) * d, y + Math.sin(a) * d * FLOOR, Math.cos(a) * sp, Math.sin(a) * sp * FLOOR - R.range(28, 78),
        R.range(0.5, 1.1), 0, R.range(rad * 0.2, rad * 0.4), 0, R.chance(0.45) ? PF.SMOKES | PF.BIG : 0);
    }
    for (let i = 0; i < 3; i++) ps.spawn(P.FIRE, x + R.range(-3, 3), y + R.range(-2, 2), R.range(-18, 18), R.range(-62, -26), R.range(0.2, 0.34), 0, R.range(rad * 0.4, rad * 0.56));
    // dust: the skirt rolls flat along the floor (cheap discs), the haze climbs off it
    for (let i = 0; i < Math.round(7 * power); i++) {
      const a = R.range(0, TAU), sp = R.range(20, 90), d = R.range(0, rad * 0.4);
      ps.spawn(P.DUST, x + Math.cos(a) * d, y + Math.sin(a) * d * FLOOR + 1, Math.cos(a) * sp, Math.sin(a) * sp * FLOOR - R.range(1, 6),
        R.range(0.7, 1.5), st.dust, R.range(3, 6));
    }
    for (let i = 0; i < Math.round(4 * power); i++) {
      const a = R.range(0, TAU), sp = R.range(12, 50), d = R.range(0, rad * 0.5);
      ps.spawn(P.SMOKE, x + Math.cos(a) * d, y + Math.sin(a) * d * FLOOR, Math.cos(a) * sp, Math.sin(a) * sp * FLOOR - R.range(25, 60),
        R.range(1.3, 2.0), 0, R.range(rad * 0.26, rad * 0.42), R.range(0.05, 0.2), PF.BIG);
    }
    // sparks and embers ride the same floor-plane directions, then climb
    for (let i = 0; i < Math.round(36 * power); i++) {
      const a = R.range(0, TAU), sp = R.range(120, 330);
      ps.spawn(P.SPARK, x, y, Math.cos(a) * sp, Math.sin(a) * sp * FLOOR - R.range(50, 110), R.range(0.2, 0.55));
    }
    for (let i = 0; i < Math.round(12 * power); i++) {
      const a = R.range(0, TAU), sp = R.range(25, 120);
      ps.spawn(P.EMBER, x + Math.cos(a) * rad * 0.35, y + Math.sin(a) * rad * 0.35 * FLOOR, Math.cos(a) * sp, Math.sin(a) * sp * FLOOR - R.range(60, 110),
        R.range(1.0, 2.0), F[3]);
    }
    if (!main) return;
    // burning brands land around the blast and leave little fires behind
    for (let i = 0; i < 10; i++) {
      const a = R.range(0, TAU), sp = R.range(110, 230);
      ps.spawn(P.BRAND, 0, 0, Math.cos(a) * sp, Math.sin(a) * sp * FLOOR - R.range(90, 180), R.range(0.8, 1.3));
    }
    // grit: chips of the floor, thrown flat and skittering (they bounce on the floor line)
    for (let i = 0; i < Math.round(RAD * 2.8); i++) {
      const a = R.range(0, TAU), sp = R.range(40, 180);
      ps.spawn(P.GRIT, R.range(-2, 2), -1, Math.cos(a) * sp, Math.sin(a) * sp * FLOOR - R.range(20, 80),
        R.range(1.1, 2.0), R.pick([st.light, st.body, st.body, st.shade]), R.chance(0.45) ? 2 : 1);
    }
    // rocks, heavy enough to arc and land hard
    for (let i = 0; i < 12; i++) {
      const a = R.range(0, TAU), sp = R.range(40, 160), big = i < 4;
      rocks.add({ kind: B.CHUNK, x: 0, y: -4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * FLOOR - R.range(180, big ? 320 : 380),
        g: 1, drag: 0.3, bounce: 0.3, life: R.range(1.8, 2.4), a: R.range(0, TAU), va: R.range(-14, 14),
        s: big ? R.range(2.4, 3.4) : R.range(1.2, 2.2), heat: R.chance(0.4) ? R.range(0.6, 1) : 0 });
    }
  };

  return {
    update(dt) {
      t += dt;
      while (next < BLASTS.length && t >= BLASTS[next].t) { const b = BLASTS[next++]; blast({ ...b, y: b.z * FLOOR }); }
      if (t > 0.06) plume.update(dt);
      const S = plume.shape(), k = 1 - smooth(1.25, 1.9, t);
      // the stem: dust and fire boiling up off the floor into the cap
      if (t > 0.18 && t < 1.2 && R.chance(7 * k * dt)) ps.spawn(P.SMOKE, R.range(-8, 8), -R.range(1, 5), R.range(-6, 6), -R.range(30, 65), R.range(0.9, 1.4), st.dust, R.range(4, 7), 0, PF.BIG);
      if (t < 1.1 && R.chance(10 * dt)) ps.spawn(P.FIRE, R.range(-6, 6), -R.range(3, 12), R.range(-8, 8), -R.range(70, 130), R.range(0.45, 0.75), 0, R.range(3, 6), 0, R.chance(0.45) ? PF.SMOKES | PF.BIG : 0);
      if (t > 0.4 && t < 1.6 && R.chance(7 * k * dt)) {
        const a = R.range(0, TAU), sp = R.range(20, 60);
        ps.spawn(P.DUST, Math.cos(a) * sp, Math.sin(a) * sp * FLOOR + 1, Math.cos(a) * sp * 0.6, Math.sin(a) * sp * FLOOR * 0.6 - 2, R.range(0.8, 1.4), st.dust, R.range(2.5, 4));
      }
      // the cap sheds embers while it still glows
      if (t > 0.25 && t < 1.3 && R.chance(9 * plume.hot() * dt)) {
        const a = R.range(0, TAU);
        ps.spawn(P.EMBER, S.x + Math.cos(a) * (S.ring + S.tube), S.y + Math.sin(a) * S.tube * 0.4, Math.cos(a) * R.range(30, 70), -R.range(10, 50), R.range(0.8, 1.4), F[3]);
      }
      column.update(dt, top(), t > 0.2 && t < 1.25 ? 1 : 0);
      for (const b of rocks.list) b.pvy = b.vy;
      rocks.update(dt);
      // rocks that hit hard kick up floor dust and leave the ground burning if they are still hot
      for (let i = rocks.list.length - 1; i >= 0; i--) {
        const b = rocks.list[i];
        if (b.x < X0 + 10 || b.x > X1 - 10) { rocks.list.splice(i, 1); continue; }
        if (b.heat > 0) {
          b.heat = Math.max(0, b.heat - dt * 0.3);
          if (b.rest && R.chance(3 * b.heat * dt)) ps.spawn(P.SMOKE, b.x, b.y - 1, R.range(-3, 3), -R.range(5, 12), R.range(0.8, 1.4), 0, R.range(1.6, 2.6));
        }
        const landed = (b.pvy > 0 && b.vy <= 0) || (b.rest && !b.dusted);
        if (landed && b.pvy > 60) {
          for (let j = 0; j < 2 + Math.round(b.s); j++) ps.spawn(P.DUST, b.x + R.range(-1.5, 1.5), -0.5, R.sign() * R.range(8, 36), -R.range(14, 24), R.range(0.3, 0.6), st.dust, R.range(1.3, 1 + b.s));
          if (b.heat > 0.5 && !b.dusted) burns.push({ x: b.x, y: -0.25, life: R.range(0.9, 1.4), max: 1.4, acc: R.next(), power: 0.7, seed: R.range(0, 100) });
        }
        if (b.rest) b.dusted = true;
      }
      // the little fires left burning: short puffs only, so they are gone before the effect ends
      for (let i = burns.length - 1; i >= 0; i--) {
        const b = burns[i];
        if ((b.life -= dt) <= 0) { burns.splice(i, 1); continue; }
        const kk = b.life / b.max;
        for (b.acc += dt * (10 + 14 * kk); b.acc > 1; b.acc--) {
          const s = R.range(1.4, 2.8) * b.power;
          ps.spawn(P.FIRE, b.x + R.range(-1.6, 1.6), b.y - s * 0.6, R.range(-5, 5), R.range(-32, -14), R.range(0.26, 0.5), 0, s, 0, PF.BACK);
        }
      }
      ps.update(dt);
      cull(ps, X0 + 10, Y0 + 10, X1 - 10, Y1 - 10);
      lights.update(dt);
      for (const a of [flashes, rings]) for (let i = a.length - 1; i >= 0; i--) if ((a[i].life -= dt) <= 0) a.splice(i, 1);
    },

    drawBack(p) {
      // the floor: a scorch ellipse (a 2:1 puddle, not a side-on smear) and the far half of the shock rings
      scorchFloor(p, HR, t, 30, 1.5, 1 - smooth(meta.duration - 1.0, meta.duration - 0.25, t));
      for (const r of rings) {
        const k = r.life / r.max, e = 1 - Math.pow(k, 3), R0 = r.r0 + (r.r1 - r.r0) * e;
        bandFloor(p, r.x, r.y, R0, Math.max(1, r.thick * k + 0.4), Math.min(1, k * 1.7), [F[1], F[2], F[3], F[6]], (a) => Math.sin(a) < 0);
      }
      drawPs(p, ps, "back", FR);
      column.draw(p, top(), FR, SM, 1 - t / 1.2, plume.hot());
      plume.draw(p, FR, SM);
      for (const b of burns) {
        const kk = b.life / b.max;
        p.px(b.x, b.y, kk > 0.4 ? (Math.sin(b.life * 31 + b.seed) > 0 ? F[3] : F[2]) : F[1]);
        p.glow(b.x, b.y, 5 + 4 * kk * b.power, F[3], 0.28 * kk * b.power);
      }
      pool(p, 0, 1, 48, 12, F[3], 0.26 * plume.hot() + 0.4 * Math.max(0, 1 - t / 0.5) ** 2);
    },

    draw(p) {
      // the first beat: a white-hot dome off the floor, a flare, and the ring's near half
      if (t < 0.04) {
        dome(p, F, 0, 38, 1);
        p.glow(0, -20, 50, WHITE, 0.5);
      } else if (t < 0.12) dome(p, F, 0, 32 - (t - 0.04) * 120, 1 - (t - 0.04) / 0.08);
      for (const r of rings) {
        const k = r.life / r.max, e = 1 - Math.pow(k, 3), R0 = r.r0 + (r.r1 - r.r0) * e;
        bandFloor(p, r.x, r.y, R0, Math.max(1, r.thick * k + 0.4), Math.min(1, k * 1.7), [F[1], F[2], F[3], F[6]], (a) => Math.sin(a) >= 0);
      }
      // rocks arc over the floor, so their shadow stays under them; the chunk itself is drawn where it is
      for (const b of rocks.list) {
        const h = Math.max(0, -b.y);
        p.shade(b.x - 3, 0, b.x + 3, 2, (x, y, out) => {
          const d = Math.hypot((x - b.x) / (2.2 + b.s * 0.6), y / 1.4);
          if (d > 1) return;
          out.c = SOOT; out.a = 0.34 * (1 - clamp(h / 120));
        });
        if (b.heat > 0.05) trail(p, (b.pts ??= []), t, FR, SM, 0.4, 0.5 + b.s * 0.3, b.heat);
        rock(p, b, st, FR);
      }
      drawPs(p, ps, "front", FR);
      if (t < 0.26) flare(p, 0, -12, 58 * Math.pow(1 - t / 0.26, 1.4), 1 - t / 0.26, F);
      for (const f of flashes) {
        const k = f.life / f.max, r = f.r * (0.8 + 0.2 * k);
        p.circle(f.x, f.y, r + 1.2, F[2]);
        p.circle(f.x, f.y, r, k > 0.45 ? F[6] : F[5]);
        p.circle(f.x, f.y, r * 0.6, k > 0.45 ? WHITE : F[6]);
      }
      lights.draw(p);
    },
  };
}
