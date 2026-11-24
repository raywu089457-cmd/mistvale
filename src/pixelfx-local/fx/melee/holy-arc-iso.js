// Holy arc (Mistvale-local): 弧光斬, the paladin's 長槍橫掃 when his weapon is a sword (劍). A fast, wide sword arc of
// holy light at waist height in front of him, in the game's 2:1 world:
//   - the blade is a level crescent of light (a circle in the world, squashed 2:1 on screen, centred on the aim),
//     cut in 0.1 s through `span` degrees: white on its leading rim, gold through its body, thinning to a pale tail;
//     every part of it holds full light for HOLD (0.12 s) after the edge passed there, then fades, so the whole arc
//     reads bright for about 0.22 s before the tail evaporates;
//   - the floor under it takes a thin gold streak along the same arc, and a glint rides the tip;
//   - as it fades the crescent sheds gold stars and motes that drift up and out, the way a holy blade leaves light
//     behind it;
//   - the parts of the arc behind the hero (negative depth) are drawn in the back layer, the rest in front.
// `reach` is the skill radius in px (pixel-world turns the skill's 2.6 world units into it), `span` its arc in degrees.
// `streak` is the floor streak's 4-colour ramp and `shed` what the fading arc throws off ('star' = holy stars and motes,
// 'spark' = hot sparks and embers); melee/steel-arc-iso is this same cut with a steel/red palette and sparks.
// 1 px = 1 character sprite px. aim is a floor angle: 0 = screen right, PI/2 = down the screen toward the viewer.
import { P, Rng, fit, clamp, ease, TAU, WHITE, sparkle } from "../../../pixelfx/core/index.js";
import { FLOOR, bandFloor, Fly3 } from "../../../pixelfx/fx/_iso.js";
import { GOLD } from "../../../pixelfx/fx/holy/_lib.js";

const STREAK_GOLD = ["#7a3a2c", "#c4652e", "#ffd25e", "#fff0a0"];
export const meta = {
  name: "Holy arc (iso)",
  desc: "A fast, wide sword arc of holy light at waist height: a white-rimmed gold crescent cut through 150 degrees in a tenth of a second, a gold streak on the floor under it, shedding stars as it fades.",
  tags: ["melee", "sword", "slash", "arc", "holy", "light", "aoe", "directional", "one-shot", "iso", "top-down"],
  size: [204, 150],
  origin: [102, 96],
  duration: 0.74,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: GOLD, aim: 0, reach: 75, span: 150, seed: 6, streak: STREAK_GOLD, shed: "star" },
};

// HOLD: every part of the crescent stays at full light this long after the edge passed it, so the whole arc reads
// bright for SWEEP + HOLD ≈ 0.22 s (it used to start fading the moment it was cut and was only bright ~0.1 s).
const D = meta.duration, HIP = 14, T0 = 0.0, SWEEP = 0.1, HOLD = 0.12, FADE = 0.2;

export function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed ?? 6), aim = o.aim ?? 0;
  const RR = clamp(o.reach ?? 75, 30, 92), span = clamp(o.span ?? 150, 60, 300) * Math.PI / 180, a0 = aim - span / 2;
  const inner = RR * 0.5, streak = Array.isArray(o.streak) && o.streak.length >= 4 ? o.streak : STREAK_GOLD, sparks = o.shed === "spark";
  const fly = new Fly3({ rng: R, sparks: [WHITE, C[6], C[5], C[4]] });
  const P3 = (r, a, h) => [Math.cos(a) * r, Math.sin(a) * r * FLOOR - h];
  // the edge's angle at time t, and when it passed angle a
  const headA = (t) => a0 + span * ease.outCubic(clamp((t - T0) / SWEEP));
  const passed = (a) => { const u = clamp((a - a0) / span); return T0 + SWEEP * (1 - Math.cbrt(1 - u)); };
  let t = 0, shed = 0;

  return {
    update(dt) {
      t += dt;
      // the crescent sheds light as it fades: stars and motes off its rim, drifting up and out
      const want = Math.floor(clamp((t - T0) / (SWEEP + HOLD + FADE)) * 26);
      while (shed < want) {
        shed++;
        const a = a0 + span * R.range(0, 1), r = R.range(inner * 1.1, RR);
        fly.spawn(sparks ? (R.chance(0.6) ? P.SPARK : P.EMBER) : R.chance(0.55) ? P.STAR : P.MOTE, Math.cos(a) * r, Math.sin(a) * r, HIP + R.range(-2, 3),
          Math.cos(a) * R.range(10, 35), Math.sin(a) * R.range(10, 35), R.range(15, 45), R.range(0.25, 0.5), R.pick([WHITE, C[6], C[5]]), R.range(0.7, 1.4), { g: -0.15 });
      }
      if (D - t < 0.2) fly.cap(Math.max(0.001, D - t - 0.02));
      fly.update(dt);
    },
    drawBack(p) { if (t < D) { floor(p); blade(p, false); fly.draw(p, (q) => q.z < 0); } },
    draw(p) { if (t < D) { blade(p, true); fly.draw(p, (q) => q.z >= 0); } },
  };

  // the gold streak the arc lays on the floor under itself (all of it lies on the floor, so it goes in the back)
  function floor(p) {
    const k = clamp(1 - (t - T0 - SWEEP - HOLD) / 0.35) * clamp((t - T0) / 0.04);
    if (k <= 0) return;
    const hA = headA(t);
    bandFloor(p, 0, 0, RR * 0.92, 2.2, 0.5 * k, streak, (g) => {
      let d = g - a0; d = ((d % TAU) + TAU) % TAU; return d <= hA - a0;
    });
  }

  // the crescent: every sample on the swept fan, faded by how long ago the edge passed it
  function blade(p, front) {
    const hA = headA(t);
    if (t < T0) return;
    const da = 0.55 / RR;
    for (let a = a0; a <= hA; a += da) {
      const age = t - passed(a), k = (age < HOLD ? 1 : Math.exp(-(age - HOLD) / 0.09)) * (age < HOLD + FADE + SWEEP ? 1 : 0);
      if (k < 0.04) continue;
      const depth = Math.sin(a);
      if ((depth >= 0) !== front) continue;
      // the crescent is thick at the head and thins along its tail
      const lead = clamp(1 - (hA - a) / span), r0 = RR - (RR - inner) * (0.35 + 0.65 * lead) * Math.min(1, k * 1.4);
      for (let r = r0; r <= RR; r += 1) {
        const q = (r - r0) / Math.max(1, RR - r0);                 // 0 inner edge .. 1 outer rim
        const [x, y] = P3(r, a, HIP - (1 - q) * 3);
        const c = q > 0.86 ? WHITE : q > 0.6 ? C[6] : q > 0.3 ? C[5] : C[4];
        p.blend(x, y, c, (q > 0.86 ? 1 : 0.35 + 0.6 * q) * k);
      }
      if (k > 0.6 && ((a * 37) | 0) % 5 === 0) { const [x, y] = P3(RR, a, HIP); p.light(x, y, C[5], 0.35 * k); }
    }
    // the glint riding the tip while it cuts
    if (t < T0 + SWEEP + HOLD && (Math.sin(hA) >= 0) === front) {
      const [x, y] = P3(RR, hA, HIP);
      sparkle(p, x, y, 3.5, WHITE, C[6], 0.9);
      p.glow(x, y, 10, C[5], 0.5);
    }
  }
}
