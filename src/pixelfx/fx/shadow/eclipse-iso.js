// Eclipse for the game's 2:1 isometric camera: shadow/eclipse rewritten as a shadow lying on the floor the camera
// looks down on. The source's recipe is kept: a black moon with a streaked corona, a diamond bead at the end of
// totality, dust, light coming back. What changed:
//   - it is a disc of darkness centred on a point on the floor `ADV` px ahead along `aim` (radians on the floor:
//     0 right, pi/2 down, pi left, -pi/2 up) instead of a moon pasted over the sky, and it is exactly 2:1 squashed
//     like every other floor shape, so it reads as a shadow on the stone and never as a vector ellipse;
//   - the whole shadow slides across the floor while a wipe edge crosses it, so the light leaves and comes back
//     rather than the disc simply appearing;
//   - inside the ellipse the stone loses its light: the interior is flat opaque bands (a violet step just inside the
//     rim, then the black heart), because a translucent dark wash dithers into grain at 1x. The corona is a few big
//     slow flames licking out of the rim, white-lilac at their root and violet at their tips, and the wipe edge that
//     takes the light away is one hard cut;
//   - the corona's shape comes from angular functions sampled into a table, its glow and the rim line stay soft, and
//     nothing on the floor is a dithered wash;
//   - the caster is never drawn and nothing is drawn once the two seconds are up.
// 1 px = 1 character sprite px (32 x 16 px tiles). Point (0,0) is the caster's feet.
import { ease, fit, flare, hash, mix, Rng, seg, smooth, TAU, WHITE } from "../../core/index.js";
import { FLOOR, ringNoise } from "../_iso.js";
import { VOID } from "./_lib.js";

const D = 2.0;            // seconds of totality and all
const ADV = 30;           // the aim point the shadow is centred on
const RX = 38;            // the shadow's radius along the floor
const RY = RX * FLOOR;    // 2:1, the same squash as every other thing lying on this floor
const SLIDE = 10;         // how far it drifts across while the light goes

// The corona is a function of the angle round the rim only, so its shape is sampled once into a small table and the
// per-pixel pass just reads it: same flames, a fraction of the noise calls. Only smooth angular functions live in
// here (no per-pixel hash), so the tongues come out as solid fingers of colour.
const NA = 256, AINV = NA / TAU;
const TBL = (s) => {
  const nA = new Float32Array(NA), ph = new Float32Array(NA);
  const len = new Float32Array(NA), lift = new Float32Array(NA), fil = new Float32Array(NA);
  for (let i = 0; i < NA; i++) {
    const th = ((i + 0.5) / NA) * TAU - Math.PI;
    const a = 0.5 + 0.5 * ringNoise(th, 1.6, s), b = 0.5 + 0.5 * ringNoise(th, 5, s + 5);
    const c = 0.5 + 0.5 * ringNoise(th, 14, s + 11);
    nA[i] = a; ph[i] = 7 * a + 3 * b;
    len[i] = 0.05 + 0.4 * a * Math.sqrt(a) + 0.14 * b * b; // big slow lobes reach furthest
    lift[i] = 0.55 + 0.45 * smooth(0.3, 0.85, a);
    fil[i] = 26 * th + 7 * c;
  }
  return { nA, ph, len, lift, fil };
};

export const meta = {
  name: "Eclipse (iso)",
  desc: "shadow/eclipse as a floor event: a 2:1 disc of darkness slides over the stone, a streaked corona licking out of it, a diamond bead, then the light returns.",
  tags: ["shadow", "eclipse", "dark", "corona", "floor", "ground", "one-shot", "iso", "top-down"],
  size: [212, 68],
  origin: [106, 34],
  duration: D,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: VOID, aim: 0, seed: 3 },
};

export function create(o) {
  const C = fit(o.palette, 8), S = o.seed | 0, aim = o.aim ?? 0;
  const TB = TBL(S);
  const NA_ = TB.nA, PH = TB.ph, LEN = TB.len, LIFT = TB.lift, FIL = TB.fil;
  const AX = Math.cos(aim) * ADV, AY = Math.sin(aim) * ADV * FLOOR;
  const R = new Rng(hash(S, 43));
  // dust lying on the floor being drawn into the dark
  const DUST = Array.from({ length: 34 }, () => ({
    a: R.range(0, TAU), r0: R.range(0.55, 1.34), rr: R.range(0.04, 0.2), hot: R.chance(0.45),
    ph: R.range(0, TAU), sp: R.range(0.06, 0.2) * (R.chance(0.5) ? 1 : -1),
  }));
  // the longest strands of the corona, fixed so they do not crawl between frames
  const STRAND = Array.from({ length: 10 }, () => ({
    a: R.range(0, TAU), l: R.range(0.22, 0.56), w: R.chance(0.5) ? 1 : 0.7,
  }));
  let t = 0;

  const drift = () => (ease.inOutSine(Math.min(1, t / D)) - 0.5) * 2 * SLIDE;
  const corona = () => smooth(0.22, 0.4, t) * (1 + 0.7 * smooth(1.44, 1.62, t)) * (1 - smooth(1.66, 1.9, t));
  const cover = () => smooth(-0.02, 0.3, t) * (1 - smooth(1.62, 1.9, t));
  const ca = () => corona() * cover();

  return {
    update(dt) {
      t = Math.min(D, t + dt);
    },

    drawBack(p) {
      if (t >= D - 1e-6) return;
      const lit = ca();
      if (lit <= 0.01) return;
      const cx = AX + drift(), cy = AY;
      const ct5 = Math.cos(t * 5.5), st5 = Math.sin(t * 5.5);
      const ct5b = Math.cos(t * 5), st5b = Math.sin(t * 5);
      // the wipe: the edge of the shadow sweeps across the stone, in at the start and back out at the end
      const edge = cx - RX * 1.2 + (t > 1.5 ? seg(t, 1.5, 1.74) : seg(t, 0, 0.3)) * RX * 2.4;
      p.each(cx - RX * 1.58, cy - RY * 1.58, cx + RX * 1.58, cy + RY * 1.58, (x, y) => {
        const u = (x - cx) / RX, v = (y - cy) / RY, r = Math.sqrt(u * u + v * v);
        if (r > 1.58) return;
        // the sweep edge is one hard line, so the light leaves as one clean cut instead of a stipple
        if (x > edge) return;
        const cov = lit;
        if (cov <= 0.02) return;
        const dir = Math.sqrt(RX * RX * u * u + RY * RY * v * v) / r; // px per unit of r in this direction
        const e = (r > 1 ? r - 1 : 1 - r) * dir;                      // px from the rim
        if (r < 1) {
          // the light gone off the stone, as flat opaque bands: a violet step just inside the rim where the corona
          // stands, then the black heart. Opaque with hard edges — a translucent dark wash dithers into grain at 1x.
          p.px(x, y, r > 0.9 ? C[1] : r > 0.86 ? C[2] : C[0]);
          return;
        }
        const th = Math.atan2(v, u);
        const i = (((th + Math.PI) * AINV) | 0) & (NA - 1);
        const flick = 0.75 + 0.25 * (st5 * Math.cos(PH[i]) + ct5 * Math.sin(PH[i]));
        const reach = LEN[i] * flick * dir;
        if (e > reach) return;
        // a corona flame licking out, white-lilac at its root and violet at its tip, in solid colour steps
        const outward = e / reach;
        const filv = 0.5 + 0.5 * (ct5b * Math.cos(FIL[i]) - st5b * Math.sin(FIL[i]));
        if (outward > 0.3 && filv < 0.42) return; // the gaps between one finger of flame and the next
        const col =
          outward < 0.16 ? mix(WHITE, C[7], 0.35)
          : outward < 0.4 ? C[7]
          : outward < 0.68 ? C[6]
          : outward < 0.88 ? C[5] : C[4];
        p.blend(x, y, col, Math.min(1, cov * (1.45 - 0.65 * outward) * LIFT[i]));
      });
      // the rim itself: one clean line of light round the ellipse, thickest where the flame above it is big
      p.each(cx - RX - 2, cy - RY - 2, cx + RX + 2, cy + RY + 2, (x, y) => {
        const u = (x - cx) / RX, v = (y - cy) / RY, r = Math.sqrt(u * u + v * v);
        const dir = Math.sqrt(RX * RX * u * u + RY * RY * v * v) / (r || 1);
        const e = Math.abs(r - 1) * dir;
        if (e > 1.05) return;
        if (x > edge) return;
        const i = (((Math.atan2(v, u) + Math.PI) * AINV) | 0) & (NA - 1);
        // one clean colour for the whole rim (only the size of the lobes varies it), so it reads as a drawn line
        p.blend(x, y, e < 0.4 && NA_[i] > 0.45 ? mix(WHITE, C[7], 0.25) : C[6], lit);
      });
      // the corona's own glow, and the long strands of it that reach furthest
      p.each(cx - RX * 1.3, cy - RY * 1.3, cx + RX * 1.3, cy + RY * 1.3, (x, y) => {
        const u = (x - cx) / RX, v = (y - cy) / RY, r = Math.sqrt(u * u + v * v);
        if (r < 0.99 || r > 1.3) return;
        const f = 1 - smooth(1.0, 1.3, r);
        p.light(x, y, C[4], 0.34 * f * f * lit);
        if (r < 1.12) p.light(x, y, C[6], 0.16 * f * f * lit);
      });
      for (const s of STRAND) {
        for (let i = 0; i < 2; i++) {
          const rr = 1.05 + s.l + i * 0.06;
          p.blend(
            cx + Math.cos(s.a) * rr * RX, cy + Math.sin(s.a) * rr * RY,
            i ? C[4] : C[6], 0.62 * lit * s.w * (1 - i * 0.3),
          );
        }
      }
    },

    draw(p) {
      if (t >= D - 1e-6) return;
      const lit = ca();
      const cx = AX + drift(), cy = AY;
      // dust drifting over the stone: dim inside the dark, catching the light at the rim, dim again outside
      const vis = smooth(0.02, 0.26, t) * (1 - smooth(1.74, 1.94, t));
      if (vis > 0.02) {
        for (const g of DUST) {
          const a = g.a + g.sp * t;
          const rr = g.r0 + g.rr * Math.sin(t * 1.7 + g.ph);
          const x = cx + Math.cos(a) * rr * RX;
          const y = cy + Math.sin(a) * rr * RY;
          // inside the totality there is no light to catch, so the dust only shows where the corona can reach it
          if (rr < 0.9) p.blend(x, y, C[3], 0.22 * vis);
          else if (rr < 1.1) {
            p.blend(x, y, C[6], 0.6 * vis);
            if (g.hot) p.blend(x, y - 1, WHITE, 0.55 * vis);
          } else p.blend(x, y, C[4], 0.5 * vis);
        }
      }
      if (lit <= 0.01) return;
      // the diamond bead as totality breaks: the last of the light through one notch of the rim
      const dl = seg(t, 1.46, 1.7);
      if (dl > 0 && dl < 1) {
        const k = Math.sin(dl * Math.PI);
        const bx = cx + RX * 0.8, by = cy - RY * 0.55;
        flare(p, bx, by, 5 + 16 * k, 0.95 * k, C);
        p.glow(bx, by, 12, C[6], 0.8 * k);
        p.glow(bx, by, 26, C[4], 0.45 * k);
        p.disc(bx, by, 1 + 0.6 * k, WHITE, k);
      }
    },
  };
}
