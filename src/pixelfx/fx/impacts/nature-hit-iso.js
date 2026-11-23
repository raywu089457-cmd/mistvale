// What a nature cast leaves where it bites: one impact for the whole school, with a kind per cast so a thorn
// wound is splinters and sap, a boulder is stone chips and dust, an acid splash hisses and a leaf storm leaves
// leaves spinning in the grass. 2:1 floor (the splash ring and the stain are flat ellipses), everything thrown
// rises upright and lands at its own depth, and every birth is the blow itself -- no picture fade.
import { Rng, fit, clamp, smooth, TAU } from "../../core/index.js";
import { FLOOR, bandFloor, floorShadow, ringNoise, Fly3 } from "../_iso.js";
import { Particles, P } from "../../core/index.js";

export const meta = {
  name: "Nature hit (iso)",
  desc: "Nature's bite on the 2:1 floor, one kind per cast: acid hisses, thorns throw splinters, stone cracks out chips, leaves spin, spores puff and blooms scatter petals.",
  tags: ["impact", "hit", "nature", "ground", "one-shot", "iso", "top-down"],
  size: [150, 110],
  origin: [75, 84],
  duration: 0.46,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { kind: "thorn", aim: 0, seed: 4 },
};

// per kind: colours (dark -> light), the debris it throws, the stain it leaves, and how it moves
const KIND = {
  acid:   { pal: ["#101a06", "#243a0a", "#3f6412", "#5f8f1c", "#8fc22a", "#c2e84a", "#eaff8a", "#ffffff"], debris: 14, style: "drop", grav: 150, spin: 1.6, stain: "#4f7a18", ring: "#c2e84a", glow: "#8fc22a", life: 0.9 },
  toxic:  { pal: ["#0e0816", "#24123a", "#3e2056", "#5a3a62", "#6a6a3a", "#96aa30", "#cce040", "#f4ffa0"], debris: 10, style: "bubble", grav: 90, spin: 1.2, stain: "#4c5a22", ring: "#cce040", glow: "#96aa30", life: 1.2 },
  spore:  { pal: ["#1a1608", "#2e2810", "#4a3f1c", "#6a5a28", "#8c7a3a", "#b8a24e", "#ded27a", "#fff6b8"], debris: 16, style: "mote", grav: 40, spin: 0.8, stain: "#5c5024", ring: "#ded27a", glow: "#c8b95c", life: 1.0 },
  stone:  { pal: ["#12100e", "#262220", "#3e3832", "#5a5248", "#7a7164", "#9c9384", "#c4bcaa", "#f0ece0"], debris: 14, style: "chip", grav: 210, spin: 2.2, stain: "#3a352e", ring: "#c4bcaa", glow: "#9c9384", life: 0.7 },
  earth:  { pal: ["#0f0b08", "#241a12", "#3d2c1c", "#573f28", "#725838", "#8f7450", "#b89a70", "#e6d0a8"], debris: 14, style: "clod", grav: 220, spin: 1.8, stain: "#3d2c1c", ring: "#b89a70", glow: "#8f7450", life: 0.75 },
  thorn:  { pal: ["#160c0e", "#2e1418", "#4e2224", "#743a30", "#9a5a3e", "#c08458", "#e2b484", "#fbe8c8"], debris: 12, style: "splinter", grav: 180, spin: 2.6, stain: "#4e2224", ring: "#c08458", glow: "#9a5a3e", life: 0.8 },
  leaf:   { pal: ["#0b1406", "#16300c", "#245016", "#356e1e", "#4e8c26", "#6fae34", "#a4d04a", "#e8ff9a"], debris: 12, style: "leaf", grav: 55, spin: 3.0, stain: "#2c4a18", ring: "#a4d04a", glow: "#6fae34", life: 1.4 },
  wind:   { pal: ["#12161a", "#222e34", "#384a52", "#526a74", "#7494a0", "#a2bec6", "#d0e4e8", "#ffffff"], debris: 0, style: "none", grav: 0, spin: 0, stain: "#38474c", ring: "#d0e4e8", glow: "#a2bec6", life: 0.5 },
  vine:   { pal: ["#0a1408", "#142c14", "#224a20", "#336a2c", "#4a8c3a", "#70b050", "#a4d67a", "#e8ffc0"], debris: 10, style: "sap", grav: 160, spin: 1.4, stain: "#224a20", ring: "#a4d67a", glow: "#70b050", life: 0.9 },
  bloom:  { pal: ["#1a0c14", "#321a26", "#54303a", "#7a4850", "#a86a68", "#d09692", "#f0c4b8", "#fff4ea"], debris: 8, style: "petal", grav: 70, spin: 2.0, stain: "#54303a", ring: "#fff4ea", glow: "#f0c4b8", life: 1.1 },
};

export function create(o) {
  const K = KIND[o.kind] ?? KIND.thorn;
  const C = fit(K.pal, 8), R = new Rng(o.seed ?? 4), T = meta.duration;
  const ax = Math.cos(o.aim ?? 0), az = Math.sin(o.aim ?? 0);
  const wx = ax * 4, wz = az * 4 * FLOOR;      // the wound sits a little ahead, on the body it bit
  o.palette = K.pal;                            // let the renderer and the page tint by kind
  const ps = new Fly3({ rng: R, sparks: [C[7], C[6], C[5]] });
  // what flies out: one particle per design, thrown up and out, landing at its own depth
  if (K.debris) {
    for (let i = 0; i < K.debris; i++) {
      const a = R.range(0, TAU), sp = R.range(40, 130), up = R.range(50, 150) * (K.grav > 100 ? 1 : 0.5);
      const leaf = K.style === "leaf" || K.style === "petal";
      ps.spawn(P.GRIT, R.range(-4, 4), R.range(-3, 3), R.range(0, 3),
        Math.cos(a) * sp, Math.sin(a) * sp, up,
        Math.min(R.range(0.3, 0.52), T - 0.04), R.pick([C[6], C[5], C[4]]), leaf ? 2 : R.chance(0.3) ? 2 : 1,
        { g: K.grav, bounce: K.style === "splinter" || K.style === "chip" ? 0.3 : 0 });
    }
  }
  // the splinters/sap that stay on the floor as droplets, and the puffs a gas wound keeps breathing
  const drops = Array.from({ length: K.style === "sap" || K.style === "drop" ? 8 : 0 }, () => {
    const a = R.range(0, TAU), s = R.range(6, 20);
    return { x: Math.cos(a) * s, z: Math.sin(a) * s, d: R.range(0, 0.06), life: R.range(0.24, 0.4) };
  });
  const puffs = Array.from({ length: K.style === "bubble" || K.style === "mote" ? 5 : 0 }, () => ({
    a: R.range(0, TAU), r: R.range(3, 12), up: R.range(10, 26), tb: R.range(0.02, 0.16), life: R.range(0.3, 0.44), s: R.range(1.4, 2.6),
  }));
  let t = 0;
  const fadeOut = () => 1 - smooth(T - 0.12, T, t);

  return {
    update(dt) { t += dt; ps.update(dt); },
    draw(p) {
      if (t >= T) return;
      const fade = fadeOut();
      if (fade <= 0) return;
      const k = clamp(t / 0.08), pop = Math.exp(-t / 0.07);
      // the stain it leaves: a flat 2:1 patch of dead ground, cooling out of the kind's own palette. Three solid
      // rings that shrink as they cool, never a dark colour at partial alpha: painter dithers those into scattered
      // black specks, and a stain is exactly where they show worst (it lies on the lit floor).
      const st = smooth(0.05, 0.3, t), cool = 1 - smooth(0.12, 0.36, t);
      if (st > 0 && cool > 0.02) {
        floorShadow(p, 0, 0, 12 * st, 0x000000, 0.18 * fade);
        p.ellipse(0, 0, 12 * st, 12 * st * FLOOR, C[3]);
        p.ellipse(0, 0, 9 * st, 9 * st * FLOOR, C[4]);
        p.ellipse(0, 0, 5.5 * st, 5.5 * st * FLOOR, C[5]);
        p.blend(0, 0, C[3], 0.28 * cool * fade);
      }
      // the ring running out flat, all 2:1
      if (t < 0.26) {
        const r = 3 + 20 * Math.sqrt(t / 0.26), a = 0.85 * (1 - t / 0.26) ** 1.6;
        bandFloor(p, 0, 0, r, 1.6, a, [C[7], C[6], C[5], C[4], C[3], C[2]], () => true);
        if (t > 0.03) bandFloor(p, 0, 0, r * 0.58, 1.0, a * 0.5, [C[6], C[5], C[4], C[3]], () => true);
      }
      // ground sprites: cracks for stone/earth, sizzle dots for acid, wet sap for vine
      if (t < 0.3) {
        const f = 1 - smooth(0.12, 0.3, t);
        for (let i = 0; i < (K.style === "chip" || K.style === "clod" ? 7 : 4); i++) {
          const a = (i / 7) * TAU + R.next() * 0.6, len = 6 + (i % 3) * 4;
          for (let s = 2; s < len; s++) {
            const j = 1 + (ringNoise(a, i * 3, 2) - 0.5) * 0.16;
            p.blend(Math.cos(a) * s * j, Math.sin(a) * s * j * FLOOR, i % 2 ? C[3] : C[2], 0.5 * f);
          }
        }
      }
      // the wound: a white-hot core cooling through the kind's own ladder
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -4; dx <= 4; dx++) {
          const m = Math.abs(dx) * 0.62 + Math.abs(dy);
          if (m > 3.4) continue;
          p.px(wx + dx, wz + dy, m < 1.2 ? "#fff" : m < 2.1 ? C[7] : m < 2.8 ? C[6] : C[5]);
        }
      // droplets and sizzle left in the grass
      for (const d of drops) {
        const age = t - d.d;
        if (age < 0 || age > d.life) continue;
        const u = age / d.life;
        p.px(d.x, d.z * FLOOR, u < 0.2 ? C[6] : u < 0.5 ? C[4] : C[2]);
        if (u < 0.25) p.blend(d.x, d.z * FLOOR, C[5], 0.4 * (1 - u / 0.25));
      }
      // gas puffs / spores lifting off the wound at their own depth
      for (const q of puffs) {
        const age = t - q.tb;
        if (age < 0 || age > q.life) continue;
        const u = age / q.life, lift = Math.sin(u * Math.PI) * q.up;
        const x = wx + Math.cos(q.a) * q.r * (0.6 + u * 0.8), y = -lift + wz + Math.sin(q.a) * q.r * FLOOR;
        const rr = q.s * (0.6 + u * 0.9);
        p.blend(x, y, C[4], 0.42 * (1 - u));
        p.blend(x, y - rr * 0.5, C[5], 0.3 * (1 - u));
        p.px(x, y - rr * 0.7, C[6]);
      }
      // what was thrown, drawn at its own depth, plus the light the kind gives off
      ps.draw(p);
      p.glow(wx, wz, 18, C[4], 0.35 * (0.6 * pop + 0.18) * fade);
      p.glow(0, 0, 16, C[3], 0.2 * Math.max(0, 1 - t / 0.2) * fade);
      if (pop > 0.06) p.glow(wx, wz, 6, C[7] || "#fff", 0.45 * pop);
    },
  };
}
