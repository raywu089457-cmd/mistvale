// Black hole for the game's 2:1 isometric camera: shadow/black-hole rewritten as a hole lying in the floor the
// camera looks down on. The source's recipe is kept: a dark well, an accretion disc round it, dust and sparks pulled
// in, a ring spinning against the clock, a thin bright lip, a collapse at the end. What changed:
//   - it lies in the floor a little ahead of the caster along `aim` (radians on the floor: 0 right, pi/2 down,
//     pi left, -pi/2 up), so the disc is a 2:1 ellipse and matter spirals in across the floor plane, not the screen;
//   - the inside of the hole is never lit: the black well is drawn over the pull, and its cells have their light
//     taken away, so the ring's glow stops at the lip;
//   - only the far lip, the half above the well that the camera sees over, takes the thin white-lilac rim;
//   - the matter rides in three dimensions (floor radius, floor angle and height), so it is swallowed at the lip
//     from every side, not squashed onto one line.
// 1 px = 1 character sprite px (32 x 16 px tiles).
import { fit, Rng, hash, clamp, smooth, seg, ease, TAU, WHITE, mix, flare } from "../../core/index.js";
import { VOID, unlight } from "./_lib.js";
import { FLOOR, bandFloor } from "../_iso.js";

const D = 1.6;           // seconds
const ADV = 26;          // the hole sits this far ahead of the caster's feet, along `aim`
const RX = 24;           // its radius across the floor; on screen the well is a 2:1 ellipse, 24 x 12
const OPEN = 0.18;       // the floor darkens and the ring winds up over this long
const HOLD = 1.26;       // it starts to implode here...
const IMPLODE = 0.16;    // ...and is a point by here
const FLARE = 1.36;      // the collapse flare, thrown out of the last of it
const FLARE_END = 1.58;

// The ring and its darkening are drawn in flat quantised bands, never as a translucent wash: a wash of dark ink is
// rendered with an ordered dither, and at 1 px that dither reads as black grit scattered over the floor.
export const meta = {
  name: "Black Hole (iso)",
  desc: "shadow/black-hole lying in the 2:1 floor: the ground darkens, a violet accretion spiral turns against the clock and eats dust, sparks and grit.",
  tags: ["shadow", "void", "black-hole", "gravity", "pull", "dark", "ground", "one-shot", "iso", "top-down"],
  size: [184, 124],
  origin: [92, 60],
  duration: D,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: VOID, aim: 0, seed: 7 },
};

export function create(o) {
  const C = fit(o.palette, 8), S = o.seed | 0, aim = o.aim ?? 0;
  // the well's centre: a floor point ahead along the aim, seen at 2:1
  const HX = Math.cos(aim) * ADV, HY = Math.sin(aim) * ADV * FLOOR;
  const R = new Rng(hash(S, 17));
  // the matter on its way in: where it starts, how it swirls and how high it rides, fixed at birth, so a frame is
  // a closed-form function of the clock (nothing to keep in step between frames, hence nothing to drift)
  const M = Array.from({ length: 92 }, () => ({
    birth: R.range(0.14, HOLD - 0.05),
    life: R.range(0.5, 0.92),
    a0: R.range(0, TAU),
    r0: R.range(RX * 1.6, 48),
    spin: R.range(2.4, 5.6),
    h0: R.range(0, 20),
    kind: R.pick([0, 0, 1, 1, 1, 2]), // 0 a spark streaking in, 1 dust/mote, 2 grit off the floor
    size: R.range(0.7, 1.6),
  }));
  let t = 0;
  // how much of the hole is open: the floor darkens on, then the well shrinks into the flare
  const openK = () =>
    t < HOLD ? ease.outCubic(clamp(t / OPEN)) : 1 - ease.inCubic(clamp((t - HOLD) / IMPLODE));

  return {
    update(dt) {
      t = Math.min(D, t + dt);
    },

    drawBack(p) {
      if (t >= D - 1e-6) return;
      const k = openK();
      if (k < 0.02) return;
      const rx = RX * k, ry = rx * FLOOR;
      const spin = -7.4 * t; // negative: on screen the pattern turns against the clock
      // the floor loses its light toward the lip in flat 2:1 bands, not as an ordered dither: a dithered wash of
      // near-black ink over the stones is *black grit scattered round the hole*, the one note a hole must not hit
      const patch = (r, c, edge) => p.ellipse(HX, HY, r, r * FLOOR, c, (d) => (d < edge ? 1 : 0));
      patch(rx * 2.68, C[1], 0.93);
      patch(rx * 2.34, C[2], 0.9);
      patch(rx * 2.08, C[0], 0.92);
      // one pass over the rest of the floor: the accretion spiral rides on the darkening
      p.shade(HX - rx * 2.05, HY - ry * 2.05, HX + rx * 2.05, HY + ry * 2.05, (x, y, out) => {
        const u = (x - HX) / rx, v = (y - HY) / ry, r = Math.sqrt(u * u + v * v);
        if (r > 2.05 || r < 1.02) return; // the well itself is drawn black over everything
        const th = Math.atan2(v, u), far = smooth(0.2, -0.72, v);
        // the accretion ring: three trailing arms and a finer counter-spiral, all turning with `spin`; the far half of
        // the ellipse is nearer the camera's light, so it reads a little hotter. No 19-lobe "grain" term any more: its
        // low-alpha tail dithered into black specks on the floor, which is the thing this pass is here to remove
        const q = r - 1.02;
        const c1 = 0.5 + 0.5 * Math.cos(3 * (th + spin) + q * 8);
        const arm = c1 * c1 * c1 * c1 * c1;
        const c2 = 0.5 + 0.5 * Math.cos(7 * (th + spin * 1.25) - q * 4 + 1.7);
        const c2b = c2 * c2 * c2, arm2 = c2b * c2b * c2b;
        const f =
          (0.16 + 1.5 * arm + 0.85 * arm2) *
          (0.42 + 1.05 * far) * (0.3 + 0.7 * smooth(2.05, 1.02, r));
        if (f > 1.55) { out.c = mix(C[7], WHITE, 0.55); out.a = 1; }
        else if (f > 1.12) { out.c = C[7]; out.a = 1; }
        else if (f > 0.76) { out.c = C[6]; out.a = 1; }
        else if (f > 0.48) { out.c = C[5]; out.a = 1; }
        else if (f > 0.27) { out.c = C[4]; out.a = 1; }
        else if (f > 0.2) { out.c = C[3]; out.a = 1; }
      });
      // the ring's violet light on the floor, kept to the far half so the well stays unlit
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU, far = -Math.sin(a);
        if (far < 0.04) continue;
        const gx = HX + Math.cos(a) * rx * 1.18, gy = HY + Math.sin(a) * ry * 1.18;
        p.glow(gx, gy, 8, C[5], 0.12 * far * k);
        p.glow(gx, gy, 4, C[6], 0.12 * far * k);
      }
      p.glow(HX, HY - ry * 1.2, rx * 0.9, C[5], 0.1 * k);
    },

    draw(p) {
      if (t >= D - 1e-6) return;
      const k = openK(), rx = RX * k, ry = rx * FLOOR;
      // the matter: pulled in across the floor plane and up off it, each speck at its own depth, swallowed at the lip
      if (k > 0.04) {
        const lip = RX * 1.01 * k;
        const at = (q, u, out) => {
          const e = ease.inCubic(u), r = lip + (q.r0 - lip) * (1 - e), a = q.a0 - q.spin * e;
          const h = q.kind === 0
            ? q.h0 * (1 - smooth(0.15, 0.9, u))
            : q.kind === 1 ? q.h0 * Math.sin(Math.PI * Math.min(1, u * 1.25))
              : Math.min(3.5, q.h0) * Math.sin(Math.PI * Math.min(1, u * 2));
          out.x = HX + Math.cos(a) * r;
          out.y = HY + Math.sin(a) * r * FLOOR - h;
          return out;
        };
        const A = { x: 0, y: 0 }, B = { x: 0, y: 0 };
        for (const q of M) {
          const qq = (t - q.birth) / q.life;
          if (qq < 0 || qq >= 1) continue;
          const fade = Math.min(1, qq * 7) * (1 - smooth(0.84, 1, qq));
          if (fade <= 0.02) continue;
          at(q, qq, A);
          if (q.kind === 0) {
            // a spark: a streak along its own path, white-hot at the head
            at(q, Math.max(0, qq - 0.05), B);
            p.line(B.x, B.y, A.x, A.y, (v) => (v > 0.5 ? mix(C[7], WHITE, 0.35) : C[5]), 0.9 * fade);
            p.px(A.x, A.y, WHITE);
            if (q.size > 1.15) p.px(A.x - 1, A.y + 1, C[7]);
            p.glow(A.x, A.y, 5, C[6], 0.18 * fade);
          } else if (q.kind === 1) {
            // dust: a speck in the air, brighter as it catches the ring
            if (q.size > 1.2) {
              p.px(A.x, A.y, C[6]);
              p.px(A.x + 1, A.y, C[5]);
              p.dot(A.x, A.y - 1, C[5], 0.6 * fade);
            } else p.dot(A.x, A.y, C[5], 0.95 * fade);
          } else {
            // grit: a chip off the floor with a short skid behind it
            at(q, Math.max(0, qq - 0.07), B);
            p.line(B.x, B.y, A.x, A.y, C[4], 0.65 * fade);
            p.px(A.x, A.y, q.size > 1.15 ? C[5] : C[4]);
          }
        }
      }
      // the well: unlit black, over whatever the pull dragged across it
      if (k > 0.03) {
        p.ellipse(HX, HY, rx, ry, (d) => (d < 0.9 ? C[0] : C[1]), 1);
        unlight(
          p,
          HX - rx - 1, HY - ry - 1, HX + rx + 1, HY + ry + 1,
          (x, y) => ((x - HX) ** 2) / (rx * rx) + ((y - HY) ** 2) / (ry * ry) < 1.01,
          0.02,
        );
        // the far lip takes the only bright rim: a thin white-lilac arc over the top of the well
        p.shade(HX - rx - 2, HY - ry - 2, HX + rx + 2, HY + 1, (x, y, out) => {
          const u = (x - HX) / rx, v = (y - HY) / ry, e = Math.hypot(u, v) - 1;
          if (e < -0.04 || e > 0.19) return;
          const far = smooth(0.1, -0.55, v) * (1 - smooth(0.82, 1.0, Math.abs(u)));
          if (far < 0.05) return;
          const shim = 0.8 + 0.2 * Math.sin(t * 9 + u * 4.6);
          if (e < 0.055) { out.c = mix(WHITE, C[7], 0.3); out.a = far * shim; }
          else if (e < 0.12) { out.c = C[6]; out.a = far * 0.55 * shim; }
          else { out.c = C[4]; out.a = far * clamp(0.5 - (e - 0.12) * 4); }
        });
        // the lip's own light, just outside the black
        for (let i = 0; i < 11; i++) {
          const a = Math.PI + 0.5 + (i / 10) * (Math.PI - 1.0), far = -Math.sin(a);
          p.glow(HX + Math.cos(a) * rx * 1.12, HY + Math.sin(a) * ry * 1.12, 4, C[6], 0.18 * far * k);
        }
      }
      // the collapse: the last of the well comes out as a flare and a thin ring racing over the floor
      const fl = seg(t, FLARE, FLARE_END);
      if (fl > 0 && fl < 1) {
        const fade = Math.pow(1 - fl, 1.3), out = ease.outCubic(fl);
        // the last of the well comes out hot: a white heart that swells and dies
        const core = 1 - smooth(0, 0.42, fl);
        if (core > 0.02) p.disc(HX, HY, 1 + 8 * (1 - core), (d) => (d < 0.6 ? WHITE : C[7]), 0.95 * core);
        flare(p, HX, HY, 10 + 26 * out, 0.75 * fade, C);
        p.glow(HX, HY, 6 + 26 * out, C[5], 0.6 * fade);
        p.glow(HX, HY, 4 + 12 * out, C[7], 0.5 * fade);
        bandFloor(p, HX, HY, 4 + 30 * out, 1.4 + 2 * (1 - fl), 0.8 * fade, [WHITE, C[7], C[6], C[5]], () => true);
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * TAU + 0.4, d = 3 + 26 * out * (0.55 + 0.45 * Math.sin(i * 2.3));
          p.dot(HX + Math.cos(a) * d, HY + Math.sin(a) * d * FLOOR, i % 3 ? C[6] : WHITE, 0.85 * fade);
        }
      }
    },
  };
}
