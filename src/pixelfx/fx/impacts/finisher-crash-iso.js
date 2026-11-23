// The ground beat under a finisher: the moment a heavy blow lands, the floor takes it — a white-hot core blooms
// and collapses, two shock waves race out through the 2:1 ground, a fan of cracks opens from the point of impact,
// a low glow outlives the flash and a crown of dust is thrown up. It is spawned together with a finisher skill (the
// page adds it at the strike point) so every heavy move shares one grammar, whatever the weapon effect on top.
import { fit, fit as _fit, Rng } from "../../core/index.js";
import { crash, FLOOR } from "../_iso.js";

export const meta = {
  name: "Finisher crash (iso)",
  desc: "A heavy blow lands on the 2:1 floor: a white-hot core blooms and collapses, two shock waves race out, cracks open in a fan and a crown of dust goes up.",
  tags: ["impact", "finisher", "shockwave", "cracks", "dust", "heavy", "one-shot", "iso", "top-down", "ground"],
  size: [240, 170],
  origin: [120, 132],
  duration: 0.76,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: ["#2a1608", "#6b3c10", "#b8701a", "#f0b42e", "#ffe27a", "#fff6cf", "#ffffff"], reach: 48, aim: 0, seed: 5 },
};

export function create(o) {
  const C = fit(o.palette, 7), R = new Rng(o.seed ?? 5);
  const reach = o.reach ?? 48, aim = o.aim ?? 0;
  const ax = Math.cos(aim), az = Math.sin(aim);
  // a landing point a little in front of the caster, along the aim (the blow's own centre)
  const px = ax * (o.ahead ?? 10), pz = az * (o.ahead ?? 10);
  const grit = Array.from({ length: 14 }, () => {
    const a = R.range(0, Math.PI * 2), sp = R.range(30, 120);
    return { a, sp, vh: R.range(26, 90), t0: R.range(0.01, 0.06), life: R.range(0.3, 0.55) };
  });
  let t = 0;
  return {
    update(dt) { t += dt; },
    draw(p) {
      if (t > meta.duration) return;
      // a scorch ring that the heat leaves behind, drawn under everything
      const soot = C[0];
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2 + 0.3, r = reach * (0.55 + 0.42 * ((i * 7) % 5) / 5);
        p.px(px + Math.cos(a) * r, (pz + Math.sin(a) * r) * FLOOR, soot);
      }
      crash(p, t, {
        x: px, z: pz, reach, r0: 5, rings: 2, ringLife: 0.5, coreLife: 0.19, coreR: 13,
        white: 0xffffffff, hot: C[6], mid: C[5], rim: [0xffffffff, C[6], C[5], C[4], C[3], C[1]],
        crack: C[4], dust: C[1], seed: (o.seed ?? 5) + 3, crackN: 10, dustN: 7,
      });
      // grit thrown up out of the cracks, landing at its own depth
      for (let i = 0; i < grit.length; i++) {
        const q = grit[i], age = t - q.t0;
        if (age < 0 || age > q.life) continue;
        const u = age / q.life, h = q.vh * age - 0.5 * 420 * age * age;
        const r = 3 + q.sp * age * 0.6;
        if (h > 0) p.px(px + Math.cos(q.a) * r, (pz + Math.sin(q.a) * r) * FLOOR - h, u < 0.4 ? C[4] : C[2]);
        else p.px(px + Math.cos(q.a) * r, (pz + Math.sin(q.a) * r) * FLOOR, C[1]);
      }
    },
  };
}
