// shadow/necro-skulls on the game's 2:1 isometric floor: three teal-green skulls push up out of the ground at the
// aim point on cold dark smoke, drift a little way round in a slow orbit trailing thin wisps of light, then sink
// again. The floor beneath them goes green-black and unlit. The skulls are tiny (7 x 7 sprites) so every pixel is
// load-bearing: the brightest bone in the palette, two-pixel eye sockets, a teeth line across the jaw.
// 1 px = 1 character sprite px (32 x 16 px tiles).
import { fit, clamp, smooth, ease, Rng, TAU } from "../../core/index.js";
import { FLOOR, bandFloor } from "../_iso.js";
import { floorLight } from "../fire/_lib.js";

const D = 1.8, FL = FLOOR, AHEAD = 15, ORB = 14, NS = 3, END = D - 1 / 40;

const TEAL = ["#040e10", "#0a2228", "#0f3d44", "#16615f", "#23907f", "#45c4a0", "#9af0c8", "#e8fff4"];

export const meta = {
  name: "Necro skulls (iso)",
  desc: "necro-skulls on the 2:1 floor: three teal skulls rise out of the dark on cold smoke, drift in a slow orbit trailing light wisps, then sink; the ground beneath goes green-black.",
  tags: ["shadow", "necro", "skulls", "undead", "ground", "one-shot", "iso", "top-down"],
  size: [136, 112],
  origin: [68, 74],
  duration: D,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: TEAL, aim: 0, seed: 9 },
};

// 7 x 7: a bright cranium, two-pixel sockets, a shaded jaw and alternating teeth
const SKULL = [".kkkkk.", "khhhhhk", "keeweek", "khhhhhk", "kwwwwwk", "kwkwkwk", ".kkkkk."];

export function create(o) {
  const C = fit(o.palette, 8), S = o.seed ?? 9, RNG = new Rng(S);
  const aim = o.aim ?? 0;
  const SX = Math.cos(aim) * AHEAD, SY = Math.sin(aim) * AHEAD * FL; // the aim point: floor and screen
  let t = 0;

  // bone is the brightest thing on the floor; the far skulls use a half-step dimmer set
  const palFront = { k: C[0], h: C[7], w: C[6], e: C[0] };
  const palBack = { k: C[0], h: C[5], w: C[4], e: C[0] };

  // ---- three skulls, each with its own orbit phase, height and direction
  const skulls = [];
  for (let i = 0; i < NS; i++) {
    skulls.push({
      a0: (i / NS) * TAU + 0.55 + RNG.range(-0.16, 0.16),
      dir: i === 1 ? -1 : 1,
      t0: 0.08 + i * 0.07,
      t1: 1.06 + i * 0.07,
      H: [12, 17, 14][i] + RNG.range(-0.6, 0.6),
      r: ORB * RNG.range(0.9, 1.1),
      flip: RNG.next() < 0.5,
    });
  }

  // ---- dark smoke off the broken ground, and a few cold motes drawn up with it
  const smoke = [];
  for (let i = 0; i < 18; i++) {
    const g = RNG.range(0, TAU), r = ORB * RNG.range(0.3, 1.5);
    smoke.push({ x: SX + Math.cos(g) * r, y: SY + Math.sin(g) * r * FL, ph: RNG.range(0, 1.4), life: RNG.range(1.4, 2.3), rise: RNG.range(6, 14), drift: RNG.range(-2.4, 2.4), s: RNG.range(1, 2), bl: RNG.next() });
  }
  const motes = [];
  for (let i = 0; i < 6; i++) {
    const g = RNG.range(0, TAU), r = ORB * RNG.range(0.2, 1.4);
    motes.push({ x: SX + Math.cos(g) * r, y: SY + Math.sin(g) * r * FL, ph: RNG.range(0, 1.2), life: RNG.range(0.8, 1.5), rise: RNG.range(10, 20), sw: RNG.range(-2, 2), bl: RNG.next() });
  }

  // the ground the skulls come through: unlit green-black in three solid bands, with a cold torn ring where
  // they break the surface. No per-pixel grain — the dead patch opens outward as the skulls rise.
  function drawFloor(p, t) {
    const k = smooth(0.02, 0.14, t) * (1 - smooth(D - 0.3, D - 0.1, t));
    if (k <= 0.02) return;
    const RR = (ORB + 11) * (0.55 + 0.45 * k);
    p.shade(SX - RR, SY - RR * FL, SX + RR, SY + RR * FL, (x, y, out) => {
      const dx = (x - SX) / RR, dy = (y - SY) / (RR * FL), d = Math.hypot(dx, dy);
      if (d > 1) return;
      const th = Math.atan2(dy, dx);
      if (d > 0.88) {
        // a cold green bleed at the edge of the dead ground, torn into solid arcs
        if (0.5 + 0.5 * Math.cos(4 * th + 0.6) < 0.38) return;
        out.c = Math.sin(th) > 0.1 ? C[2] : C[1];
        out.a = 1;
        return;
      }
      const lobe = 0.5 + 0.5 * Math.cos(3 * th + 1.1 + d * 1.8);
      out.c = d < 0.45 ? C[0] : d < 0.78 ? (lobe > 0.5 ? C[0] : C[1]) : C[1];
      out.a = 1;
    });
    if (t < 0.42) bandFloor(p, SX, SY, 4 + 24 * ease.outCubic(t / 0.42), 1.8, 1, [C[0], C[1], C[2], C[3]], (g) => Math.sin(g) > -0.1);
    floorLight(p, SX, SY, RR * 0.85, RR * 0.85 * FL, C[3], 0.14 * k + 0.04 * Math.sin(t * 6));
  }

  function drawSmoke(p, t) {
    for (const q of smoke) {
      const a = ((t + q.ph) % q.life) / q.life;
      const x = q.x + q.drift * a, y = q.y - a * q.rise;
      // the smoke body is flat: two opaque steps that shrink out of existence instead of a translucent wash
      const s = 0.6 + 0.4 * Math.sin(Math.PI * a), r = (1.8 + a * 1.6) * s;
      p.disc(x, y, r, C[2], 1);
      p.disc(x, y, r * 0.62, C[1], 1);
    }
    for (const q of motes) {
      const a = ((t + q.ph) % q.life) / q.life;
      if (a > 0.8) continue;
      const x = q.x + q.sw * a, y = q.y - a * q.rise;
      p.px(x, y, q.bl < 0.35 ? C[6] : C[5]);
    }
  }

  // one skull: wisps behind it, the sprite itself, the teeth already in the sprite
  function skullState(sk, t) {
    const rise = ease.outBack(clamp((t - sk.t0) / 0.3), 1.6);
    const sinkK = ease.inCubic(clamp((t - sk.t1) / 0.3));
    if (t < sk.t0 || sinkK >= 1) return null;
    const ang = sk.a0 + sk.dir * t * 0.8;
    const rr = sk.r * (1 - 0.45 * sinkK) * (1 + 0.05 * Math.sin(t * 1.7 + sk.a0));
    const fx = Math.cos(ang) * rr, fz = Math.sin(ang) * rr;
    const up = rise * (1 - sinkK);
    const h = sk.H * up + Math.sin(t * 2.6 + sk.a0) * 1.2 * up;
    return { sk, ang, rr, fx, fz, up, h, bx: SX + fx, by: SY + fz * FL - h, dim: fz < -1.5 };
  }

  function drawSkull(p, st, t) {
    const sk = st.sk, up = st.up, bx = st.bx, by = st.by, dim = st.dim;
    const fy = SY + st.fz * FL;
    // the dark ground it came up on: flat 2:1 bands that grow with the rise, masking the floor edge
    p.ellipse(bx, fy - 1, 3.1 * up, 1.55 * up, C[1], 1);
    p.ellipse(bx, fy - 3, 2.2 * up, 1.1 * up, C[0], 1);
    // a cold glow under the skull on the ground, and a backlight so it lifts off the smoke
    p.glow(bx, fy, 7, C[3], 0.2 * up);
    p.glow(bx, by - 2, 8, C[3], 0.18 * up);
    // wisps of light trailing behind along its orbit
    if (up > 0.42)
      for (let k = 2; k >= 0; k--) {
        const wa = st.ang - sk.dir * (k + 1) * 0.22, wr = st.rr * (1 - 0.03 * k);
        const wx = SX + Math.cos(wa) * wr, wy = SY + Math.sin(wa) * wr * FL - st.h * (1 - 0.12 * k) + Math.sin(t * 3 - k * 0.9 + sk.a0) * 0.9;
        p.px(wx, wy, k === 0 ? C[6] : C[5]);
      }
    // the skull sprite
    const tx = Math.round(bx) - 3, ty = Math.round(by) - 3;
    p.sprite(SKULL, dim ? palBack : palFront, tx, ty, { flip: sk.flip });
    // a black shadow under the jaw so the skull sits in front of the smoke
    if (up > 0.5) p.px(tx + 3, ty + 7, C[0]);
  }

  return {
    update(dt) {
      t += dt;
    },
    draw(p, tt) {
      const t = tt;
      if (t >= END) return;
      drawFloor(p, t);
      drawSmoke(p, t);
      const states = skulls.map((sk) => skullState(sk, t)).filter(Boolean);
      states.sort((a, b) => a.fz - b.fz);
      for (const st of states) drawSkull(p, st, t);
      // a cold flash as they break the surface
      if (t < 0.3) p.glow(SX, SY, 14, C[4], 0.4 * (1 - t / 0.3));
    },
  };
}
