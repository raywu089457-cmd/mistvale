// Hammer smash, rewritten for the game's 2:1 isometric camera: melee/hammer-smash in the world the game sees,
// not the side view's picture squashed onto the floor.
//
// The recipe is the source's: the light gathers over the head, the blunt head comes down, and the floor ahead takes
// it: the white impact star, the dished dent with its cracks, the shock ring rolling out, the dust column that rises
// and then sags, the chips and grit, the rocks thrown up that bounce and settle, and the light cooling off the mark.
// What the camera changes:
//   - the blow is one vertical swath in the plane that holds the aim: height stays height, so the head starts over
//     the hero's head as tall as in the side view and comes down into the floor ~22 px ahead, whichever way he faces
//     (when he faces the viewer the swath foreshortens into a line, as a real overhead blow would);
//   - the head is a blunt mass on the end of that swath, and it is the head that leads: the trail behind it thins and
//     flickers, and the air it comes through is left streaked;
//   - the floor is a plane with depth: the impact star is white and flat on the 2:1 floor, the shock rings are 2:1
//     rings running out every way, the dent is a 2:1 dish with its rim thrown up and its far wall catching the light,
//     the cracks radiate over the floor in the floor's own directions with their lips lit, and the light pools under
//     the blow;
//   - the dust is a column, not a wall: it lifts off the strike, hangs at the top of its climb and then sags back down
//     over the dent, so the head of the column leads and the foot of it lags;
//   - everything thrown flies in 3-D (u along the blow, v across the floor, h up): chips, grit and rocks go out every
//     way round the strike, land at their own depth, bounce once, roll and settle;
//   - it leaves the way such a blow would: the dust sags and buries the mark grain by grain, the stone stops bouncing
//     and settles, and the mark erodes away under the settling dust instead of fading as a picture.
// 1 px = 1 character sprite px (32 x 16 px floor tiles). aim is a floor angle: 0 = screen right, PI/2 = down the
// screen toward the viewer.
import { Rng, fit, clamp, smooth, ease, TAU, WHITE, mix, hex } from "../../core/index.js";
import { FLOOR, bandFloor, floorShadow, ringNoise, crash } from "../_iso.js";
import { stone, rock, sliver } from "./_lib.js";
import { dustRing } from "../impacts/_lib.js";
import { soft } from "../fire/_lib.js";

export const meta = {
  name: "Hammer smash (iso)",
  desc: "melee/hammer-smash in 2:1 iso: a cold glint, a blunt head down into the floor ahead, a flat white star, a dished dent and cracks, a dust column that sags, rocks that settle.",
  tags: ["melee", "hammer", "smash", "blunt", "heavy", "impact", "ground", "combat", "iso", "top-down", "one-shot", "directional"],
  size: [240, 200],
  origin: [120, 164],
  duration: 1.5,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: {
    palette: ["#0e101c", "#1d2238", "#333b5c", "#52608c", "#8396c6", "#c2cfee", "#f2f6ff"],
    aim: 0,
    seed: 9,
  },
};

const D = meta.duration, FL = FLOOR, G = 470;
// the source's beats, tightened: the glint gathers, the head comes down fast, the butt of the blow, then the dust
const RAISE = 0.26, SWING = 0.13, HIT = RAISE + SWING, HOLD = 0.06;
// the swing: a quadratic in the vertical plane that holds the aim. It starts up over the head (U0, H0), is pulled
// forward over it (UC, HC) and ends on the floor U1 px ahead of the feet: a blunt blow, not an arc.
const U0 = -8, H0 = 52, UC = 20, HC = 52, U1 = 24, H1 = 0;
const REACH = U1;

/** A body thrown in the game's 3-D: drag on the floor, one bounce, then rest at its own depth. */
function toss(u, v, h, vu, vv, vh, drag = 2) {
  const disc = vh * vh + 2 * G * h, t1 = (vh + Math.sqrt(disc)) / G, vDown = Math.sqrt(disc);
  const vUp = vDown * 0.3, t2 = (2 * vUp) / G;
  return { u, v, h, vu, vv, vh, drag, t1, vUp, t2, end: t1 + t2 };
}
function tossAt(b, age) {
  const t = Math.min(age, b.end), e = Math.exp(-b.drag * t), d = (1 - e) / b.drag;
  const u = b.u + b.vu * d, v = b.v + b.vv * d;
  let h;
  if (t < b.t1) h = b.h + b.vh * t - 0.5 * G * t * t;
  else {
    const tb = t - b.t1;
    h = tb < b.t2 ? b.vUp * tb - 0.5 * G * tb * tb : 0;
  }
  return [u, v, h];
}
/** A dust puff: it climbs, drags to a stop at the top of its climb, and then sags back down as it thins. */
function puffAt(d, age) {
  const t = Math.min(age, d.life), e = Math.exp(-d.drag * t), dist = (d.sp * (1 - e)) / d.drag;
  const h = Math.max(0.3, d.h0 + (d.vh * (1 - Math.exp(-1.1 * t))) / 1.1 - 0.5 * d.sag * t * t + d.rise * t);
  return [d.u + d.du * dist, d.v + d.dv * dist, h];
}

export function create(o) {
  const F = fit(o.palette, 7), n = F.length;
  const R = new Rng(o.seed ?? 9);
  const aim = o.aim ?? 0;
  const ax = Math.cos(aim), az = Math.sin(aim);
  /** A floor point (u along the blow, v across it) as a screen point; h is height off the floor. */
  const P = (u, v, h) => [u * ax - v * az, (u * az + v * ax) * FL - h];
  /** The screen offset of a floor offset from the strike, so a floor shape stays 2:1 for every aim. */
  const FS = (u, v) => [u * ax - v * az, (u * az + v * ax) * FL];
  const [IX, IY] = P(REACH, 0, 0);
  const st = stone(hex("#4a3f69"));
  const BLACK = hex("#000000");
  const SOOT = mix(F[0], hex("#0d0b12"), 0.55);
  const DUST = mix(st.dust, st.body, 0.3), DUSTL = mix(st.dust, F[5], 0.45);
  // the dent dissolves into the dust that settles over it: a per-pixel erosion, no fade of the whole mark
  const fadeMark = (t) => 1 - smooth(D - 0.5, D - 0.1, t);
  const gone = (u, v, t) => {
    const f = fadeMark(t);
    if (f >= 0.995) return false;
    return ((Math.floor(u) * 7 + Math.floor(v) * 13) & 7) / 8 > f;
  };
  const hash = (u, v) => ((Math.floor(u * 2.3) * 13 + Math.floor(v * 2.9) * 7 + 103) & 7) / 8;

  // ---- the swing in the plane that holds the aim: position and tangent at s along it ----
  const bz = (s) => {
    const m = 1 - s;
    return [
      m * m * U0 + 2 * m * s * UC + s * s * U1,
      m * m * H0 + 2 * m * s * HC + s * s * H1,
      2 * (m * (UC - U0) + s * (U1 - UC)),
      2 * (m * (HC - H0) + s * (H1 - HC)),
    ];
  };
  const headS = (t) => Math.pow(clamp((t - RAISE) / SWING), 1.9);

  // ---- the glint over the head: light gathering where the head is about to come from ----
  const [GX, GY] = P(U0, 0, H0);
  const MOTES = [];
  for (let i = 0; i < 12; i++) MOTES.push({ th: R.range(0, TAU), d: R.range(9, 24), dur: R.range(0.09, 0.16), arrive: RAISE - R.range(0, 0.04), c: R.chance(0.5) ? F[5] : F[4] });
  const SHAKEN = [];
  for (let i = 0; i < 7; i++) SHAKEN.push({ u: U0 + R.range(-4, 4), v: R.range(-2, 2), h: H0 + R.range(-3, 3), vh: R.range(-12, -3), life: R.range(0.16, 0.3), d: R.range(0, 0.09) });

  // ---- the dent: a dish in the floor, built once in the floor's own coordinates so it is 2:1 for every aim ----
  const DENT = [];
  const DU = 19, DV = 14.5, LIP = 1.12;
  for (let dv = -Math.ceil(DV * LIP); dv <= Math.ceil(DV * LIP); dv++)
    for (let du = -Math.ceil(DU * LIP); du <= Math.ceil(DU * LIP); du++) {
      const q = Math.hypot(du / DU, dv / DV);
      if (q > LIP) continue;
      const [ox, oy] = FS(du, dv);
      const hs = hash(du, dv);
      // the light comes from above the picture, so which wall of the dish is lit is a fact about the SCREEN, not about
      // the aim: rotate the dent's local coordinate out to the floor's own axes first
      const GV = du * az + dv * ax;
      let c, lift;
      if (q > 0.9) {                          // the lip the blow threw up: lit on its far side, shadowed near
        const rn = ringNoise(Math.atan2(dv, du), 5, 77);            // its crest is rubble, not a drawn circle
        const lit = clamp(0.35 + 0.5 * rn + 0.4 * hs, 0, 1);
        c = GV < 0 ? mix(mix(st.body, F[6], 0.2), mix(st.light, F[6], 0.3), lit)
          : mix(st.shade, SOOT, 0.25 + hs * 0.2);
        lift = GV < 0 ? -1.2 - 0.5 * lit : -0.3;
      } else if (q > 0.8) {                   // the crease just inside the lip: what makes the dish read as a dish
        c = mix(SOOT, st.shade, 0.3 + hs * 0.3);
        lift = 0.4;
      } else {                                // inside: only the far wall under the lip catches light; the rest is a hole
        const far = clamp(-GV / DV, 0, 1);
        const wall = clamp((q - 0.62) / 0.24, 0, 1) * clamp(far * 2.4 - 1.0, 0, 1);
        const near = clamp((GV / DV) * 1.2, 0, 1) * clamp((q - 0.55) / 0.3, 0, 1);
        let c = mix(SOOT, st.dark, 0.1 + hs * 0.16);                          // the bottom of the dish: nearly black
        c = mix(c, mix(st.body, st.light, 0.32), clamp(wall, 0, 1) * 0.6);    // the far wall, lit under the lip
        c = mix(c, mix(st.dark, st.body, 0.45), clamp(near, 0, 1) * 0.5);     // the near wall, barely
        c = mix(c, SOOT, clamp((GV / DV) * 1.4, 0, 1) * clamp((q - 0.45) / 0.4, 0, 1) * 0.55);  // the near side is in its own shadow
        if (Math.hypot(du / 9.6, dv / 6.2) < 1) c = mix(c, mix(SOOT, st.shade, 0.25), 0.6);  // the face's print
        lift = 0.4 + 0.6 * (1 - q);           // down into the dish
      }
      DENT.push({ x: ox, y: oy + lift, c, du, dv });
    }
  // scuff thrown out past the lip: single specks of broken stone lying on the floor around the mark, and a few
  // chunks that came to rest on the rim itself — a lip of loose rubble is what tells the eye the floor was broken
  const SCUFF = [];
  for (let i = 0; i < 52; i++) {
    const th = R.range(0, TAU), rr = R.range(1.02, 1.4);
    const big = i < 6;
    SCUFF.push({
      du: Math.cos(th) * DU * (big ? R.range(0.86, 1.12) : rr), dv: Math.sin(th) * DV * (big ? R.range(0.86, 1.12) : rr),
      c: big ? mix(st.light, F[5], 0.35) : R.chance(0.5) ? st.body : mix(st.light, st.dust, 0.4), big,
    });
  }

  // ---- cracks: jagged walks out across the floor from the dent, in the floor's own directions ----
  const CRACKS = [];
  for (let i = 0; i < 12; i++) {
    const th = (i / 12) * TAU + R.range(-0.18, 0.18), reach = R.range(8, 21) * (i < 4 ? 1.25 : 0.85);
    let a = th, u = REACH + Math.cos(th) * R.range(6, 9), v = Math.sin(th) * R.range(6, 9), d = 0;
    const pts = [[u, v, 0]];
    while (d < reach) {
      const stp = R.range(1.2, 2.4);
      a += R.range(-0.7, 0.7);
      u += Math.cos(a) * stp; v += Math.sin(a) * stp * 0.95; d += stp;
      if ((u * az + v * ax) * FL > 31) break;      // the picture runs out of floor
      pts.push([u, v, d]);
      if (R.chance(0.24) && d > 6 && d < reach - 6) {   // a fork
        let fa = a + R.sign() * R.range(0.5, 1.1), fu = u, fv = v, fd = d;
        const fork = [[fu, fv, fd]];
        for (let j = R.int(2, 4); j > 0; j--) {
          const s2 = R.range(1.4, 2.8);
          fa += R.range(-0.5, 0.5);
          fu += Math.cos(fa) * s2; fv += Math.sin(fa) * s2 * 0.95; fd += s2;
          if ((fu * az + fv * ax) * FL > 31) break;
          fork.push([fu, fv, fd]);
        }
        CRACKS.push({ pts: fork, len: fd });
      }
    }
    CRACKS.push({ pts, len: d });
  }

  // ---- the shock: one blunt ring of light off the head's face, then a slower ring of dust behind it ----
  const RINGS = [
    {
      d: 0.38, r0: 9, r1: 41, th: 7, dark: mix(SOOT, st.shade, 0.25),
      hot: mix(F[6], WHITE, 0.55), cool: mix(F[4], st.light, 0.3),
    },
    {
      dust: true, d: 0.62, r0: 6, r1: 31, th: 4,
    },
  ];

  // ---- the flat white star of the blow, lying in the floor's plane (so it is squeezed 2:1 like the floor) ----
  const FSTAR = [];
  for (let i = 0; i < 9; i++) FSTAR.push({ th: (i / 9) * TAU + R.range(-0.2, 0.2), len: R.range(7, 17), w: R.range(2.4, 4.2) });
  FSTAR.push({ th: 0, len: 22, w: 3.6 }, { th: Math.PI, len: 12, w: 2.8 });
  FSTAR.push({ th: Math.PI * 0.5, len: 16, w: 3.2 }, { th: -Math.PI * 0.5, len: 16, w: 3.2 });
  const SLIVERS = [];
  for (let i = 0; i < 6; i++) SLIVERS.push({ a: R.range(0, TAU), arc: R.range(0.35, 0.8), r0: R.range(11, 16), grow: R.range(12, 20), life: R.range(0.12, 0.2), c: R.pick([F[6], F[5], WHITE]) });

  // ---- dust: the column off the strike (it climbs, hangs, sags), the burst rolling out low, and the racers ----
  const DUSTS = [];
  const dust = (t0, u, v, h0, du, dv, sp, vh, sag, r0, r1, life, a, drag, rise = 0) =>
    DUSTS.push({ t0, u, v, h0, du, dv, sp, vh, sag, r0, r1, life: Math.min(life, D - 0.02 - t0), a, drag, rise });
  for (let i = 0; i < 11; i++) {          // the column: it stands up off the strike, then leans and sags
    const th = R.range(0, TAU), r = R.range(0.5, 3.4), t0 = HIT + R.range(0, 0.05);
    dust(t0, REACH + Math.cos(th) * r, Math.sin(th) * r, R.range(4.5, 8),
      Math.cos(th) * 0.18, Math.sin(th) * 0.18, R.range(3, 9), R.range(36, 82), R.range(14, 32),
      R.range(1.5, 2.4), R.range(2.8, 4.2), R.range(0.72, 0.95), R.range(0.08, 0.13), 1.5);
  }
  for (let i = 0; i < 9; i++) {           // the burst: soft volumes rolling off the strike, low and heavy
    const th = R.range(0, TAU), t0 = HIT + R.range(0, 0.03);
    dust(t0, REACH + Math.cos(th) * R.range(5, 8), Math.sin(th) * R.range(5, 8), R.range(0.4, 1.8),
      Math.cos(th), Math.sin(th), R.range(26, 46), R.range(4, 14), R.range(30, 52),
      R.range(2, 3), R.range(3, 4.6), R.range(0.4, 0.66), R.range(0.09, 0.14), 1.9);
  }
  for (let i = 0; i < 5; i++) {           // and a few low and fast, racing away over the floor
    const th = R.range(0, TAU), t0 = HIT + R.range(0, 0.03);
    dust(t0, REACH, 0, R.range(0, 1), Math.cos(th), Math.sin(th), R.range(58, 88), R.range(2, 9), 0,
      R.range(0.9, 1.6), R.range(1.6, 2.6), R.range(0.3, 0.46), R.range(0.06, 0.09), 3.2);
  }
  for (const l of SHAKEN) dust(RAISE - l.d, l.u, l.v, l.h, 0, 0, 2, l.vh, 0, 0.9, 1.5, l.life, 0.16, 1);

  // ---- grit and rocks: thrown in 3-D, dragged, one bounce, settling ----
  const stR = stone(hex("#6d6090"));
  const GRIT = [];
  for (let i = 0; i < 22; i++) {
    const th = R.range(0, TAU), sp = R.range(16, 62);
    const b = toss(REACH + R.range(-2.5, 2.5), R.range(-2, 2), R.range(0.5, 3), Math.cos(th) * sp, Math.sin(th) * sp, R.range(55, 195), 2.1);
    b.c = R.pick([stR.light, stR.body, stR.body, mix(stR.light, F[5], 0.35)]); b.s = R.chance(0.45) ? 2 : 1; b.dl = R.range(0, 0.12);
    GRIT.push(b);
  }
  const ROCKS = [];
  for (let i = 0; i < 7; i++) {
    const th = R.range(0, TAU), sp = R.range(14, 40);
    const b = toss(REACH + R.range(-3, 3), R.range(-2, 2), R.range(1, 4), Math.cos(th) * sp, Math.sin(th) * sp, R.range(78, 180), 1.6);
    b.s = R.int(2, 3); b.a = R.range(0, TAU); b.va = R.range(-7, 7); b.dl = R.range(0, 0.1);
    ROCKS.push(b);
    const [lu, lv] = tossAt(b, b.t1);     // the puff it kicks up where it lands
    dust(HIT + b.t1, lu, lv, 0.4, Math.cos(th), Math.sin(th), 5, 5, 26, 1.2, 3.4, R.range(0.26, 0.4), 0.13, 1.8);
  }
  // ---- sparks: hot chips skipping out of the stone, low and fast along the floor ----
  const SPARKS = [];
  for (let i = 0; i < 10; i++) {
    const th = R.range(0, TAU), sp = R.range(14, 42);
    SPARKS.push({ u: REACH + R.range(-2, 2), v: R.range(-2, 2), h: R.range(0.5, 2), vu: Math.cos(th) * sp, vv: Math.sin(th) * sp, vh: R.range(40, 110), drag: 2.8, life: R.range(0.08, 0.18) });
  }

  let T = 0;
  const softs = [];

  // ---- drawing ----
  // the head itself, up there and only as light: a blunt block, its face catching the sky and its underside dark.
  // No hero, no shaft — the weight is told by the shape of the light, not by drawing a weapon.
  const headHint = (p, cx, cy, s, k) => {
    for (let y = -Math.ceil(s * 0.62); y <= Math.ceil(s * 0.62); y++)
      for (let x = -Math.ceil(s); x <= Math.ceil(s); x++) {
        const q = Math.hypot(x / s, y / (s * 0.58));
        if (q > 1) continue;
        const c = q > 0.8 ? mix(F[2], SOOT, 0.6)
          : y < -s * 0.2 ? mix(F[6], WHITE, 0.35 + 0.5 * k)
          : mix(F[4], F[5], 0.45);
        p.dot(cx + x, cy + y, c, q > 0.8 ? 0.6 : 0.85);
      }
    p.dot(cx - s * 0.5, cy + s * 0.5, WHITE, 0.9);   // the striking face, already bright
    p.dot(cx + s * 0.5, cy + s * 0.5, WHITE, 0.9);
  };

  const glint = (p, t) => {
    const build = clamp(t / RAISE);
    for (const m of MOTES) {
      const u = (t - (m.arrive - m.dur)) / m.dur;
      if (u <= 0 || u >= 1) continue;
      const e3 = (Math.exp(3 * u) - 1) / (Math.exp(3) - 1), r = m.d * (1 - e3);
      p.dot(GX + Math.cos(m.th) * r, GY + Math.sin(m.th) * r, u > 0.55 ? m.c : F[3], 0.3 + 0.65 * u);
    }
    // the cold light drawing itself in: a faint ring closing on the head, the block gathering weight, the glint
    p.ring(GX, GY, 13 - 5 * build, 1, mix(F[5], WHITE, 0.2), 0.08 + 0.14 * build);
    headHint(p, GX, GY + Math.sin(t * 31) * 0.8 * build, 5.4 + 2.2 * build, build);
    const tw = 0.88 + 0.12 * Math.sin(t * 53), L = (2.5 + 7 * build) * tw;
    for (let i = 0; i < 4; i++) {
      const dx = i === 0 ? 1 : i === 1 ? -1 : 0, dy = i === 2 ? -1 : i === 3 ? 1 : 0;
      for (let d = 1.5; d <= L; d += 0.55) p.dot(GX + dx * d, GY - 4 + dy * d, d < L * 0.42 ? WHITE : F[5], 1 - (0.5 * d) / L);
    }
    p.px(GX, GY - 4, WHITE);
    p.glow(GX, GY, 7 + 7 * build, mix(F[5], WHITE, 0.4), 0.13 + 0.15 * build);
    // and it lets go: one crisp cross, then the swath owns the frame
    const pop = 1 - clamp((t - RAISE) / 0.06);
    if (t >= RAISE - 0.01 && pop > 0) {
      p.glow(GX, GY, 14, WHITE, 0.42 * pop);
      const pl = 5 + 10 * (1 - pop);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let d = 0; d <= pl; d += 0.55) p.dot(GX + dx * d, GY + dy * d, WHITE, pop);
    }
  };

  // the blow: a blunt head leading, and the air it comes through left streaked behind it
  const swath = (p, t) => {
    if (t < RAISE || t > HIT) return;                  // the head's own flash takes over at the floor
    const sH = headS(t), sT = Math.max(0, sH - 0.3);
    if (sH - sT < 0.01) return;
    // the smear: an opaque wedge, white at the head and cooling back to the dark of the air at the tail
    const N = 40;
    for (let oi = -5; oi <= 5; oi++) {
      const of = oi / 5, ao = Math.abs(of);
      for (let i = 0; i <= N; i++) {
        const bf = i / N, [u, h, du, dh] = bz(sT + (sH - sT) * bf), [x, y] = P(u, 0, h);
        const l = Math.hypot(dh * ax, dh * az * FL + du) || 1;
        const px = -dh * ax / l, py = -(dh * az * FL + du) / l;
        const half = (1.1 + 4.8 * Math.pow(bf, 0.75)) * (1 - 0.5 * ao * ao);   // the section, rounded
        const c = bf > 0.7 ? (ao < 0.55 ? WHITE : F[6])
          : bf > 0.42 ? mix(F[6], F[5], ao * 0.8)
            : bf > 0.18 ? mix(F[5], F[4], 0.35 + 0.55 * ao)
              : mix(F[4], F[2], 0.45 + 0.55 * ao);
        p.px(x + px * of * half, y + py * of * half, c);
      }
    }
    // the light of it on the air at the edges, and the speed lines it drags
    for (let k = 0; k < 3; k++) {
      const bf = 0.35 + k * 0.22, [u, h, du, dh] = bz(sT + (sH - sT) * bf), [x, y] = P(u, 0, h);
      const l = Math.hypot(dh * ax, dh * az * FL + du) || 1;
      const px = -(dh * ax / l), py = -((dh * az * FL + du) / l);
      for (const sgn of [-1, 1]) for (let q = 7; q <= 12; q += 0.5) p.dot(x + px * sgn * q, y + py * sgn * q, F[3], 0.22 * (1 - (q - 7) / 5));
    }
    // the head: a blunt mass on the end of the stroke, white-hot, with a dark rim that keeps it an object
    if (sH < 0.97) {
      const [hu, hh, hdu, hdh] = bz(sH), [hx, hy] = P(hu, 0, hh);
      const tl = Math.hypot(hdu * ax, hdu * az * FL - hdh) || 1;
      const tx = (hdu * ax) / tl, ty = (hdu * az * FL - hdh) / tl;
      const qx = -ty, qy = tx;
      const hl = 5, hc = 7;
      p.shade(hx - 16, hy - 16, hx + 16, hy + 16, (x, y, out) => {
        const dx = x - hx, dy = y - hy;
        const a = dx * tx + dy * ty, b = dx * qx + dy * qy;
        if (Math.abs(a) > hl || Math.abs(b) > hc) return;
        const rim = Math.abs(b) > hc - 1.1 || Math.abs(a) > hl - 1.1;
        const face = a > hl - 2;
        out.c = rim ? mix(F[2], SOOT, 0.55) : face ? WHITE : mix(F[6], F[5], (b / hc) * (b / hc) * 0.4);
        out.a = 1;
        if (!rim) { out.l = WHITE; out.k = 0.1; }
      });
      p.glow(hx, hy, 10, WHITE, 0.32);
    }
  };

  const floorMarks = (p, age, t) => {
    if (fadeMark(t) <= 0.001) return;
    // the scuff of broken stone lying round the mark
    for (const s of SCUFF) {
      const [x, y] = FS(s.du, s.dv);
      if (gone(s.du, s.dv, t)) continue;
      if (s.big) {   // a chunk on the rim, one lit face and one shadowed
        p.px(IX + x, IY + y - 1, s.c);
        p.px(IX + x + 1, IY + y - 1, mix(s.c, F[6], 0.3));
        p.px(IX + x, IY + y, mix(SOOT, st.shade, 0.5));
      } else p.dot(IX + x, IY + y, s.c, 0.55);
    }
    // the dent: a dish in the 2:1 floor, its far wall catching the light, its rim thrown up
    for (const d of DENT) {
      const fu = d.x * ax + d.y * 2 * az, fv = -d.x * az + d.y * 2 * ax;   // back to floor coords for the erosion
      if (gone(fu, fv, t)) continue;
      p.px(IX + d.x, IY + d.y, d.c);
    }
    // the cracks, running out over the floor: hot at the heart, cooling to the cold stone they opened, lips lit
    const grow = ease.outCubic(clamp(age / 0.13));
    for (const c of CRACKS) {
      const len = c.len * grow;
      if (len < 0.5) continue;
      for (let i = 1; i < c.pts.length; i++) {
        const [u0, v0, d0] = c.pts[i - 1], [u1, v1, d1] = c.pts[i];
        if (d0 >= len) break;
        const f = d1 > len ? (len - d0) / (d1 - d0) : 1;
        const eu = u0 + (u1 - u0) * f, ev = v0 + (v1 - v0) * f, steps = Math.max(1, Math.round((d1 - d0) * 0.8));
        for (let j = 0; j <= steps; j++) {
          const g = j / steps, u = u0 + (eu - u0) * g, v = v0 + (ev - v0) * g;
          if (gone(u, v, t)) continue;
          const heat = clamp(1 - age / 0.4) * (1 - 0.5 * clamp(d0 / c.len));
          const [x, y] = FS(u, v), px = IX + Math.round(x), py = IY + Math.round(y), hs2 = hash(u * 3.1, v * 2.7);
          p.px(px, py, mix(SOOT, st.shade, 0.12 + 0.26 * hs2));               // the groove, always dark
          p.px(px, py + 1, mix(SOOT, st.shade, 0.42));                        // its near wall, in shadow
          const near = clamp(1 - d0 / Math.max(4, c.len * 0.8), 0, 1);
          const lipC = mix(st.light, F[6], 0.45 + 0.4 * near);
          if (hs2 < 0.3 + 0.6 * near) p.px(px, py - 1, lipC);                 // and its lip, lit
          if (near > 0.55) {                                                  // freshly split: a second pixel each side
            p.px(px + 1, py + 1, mix(SOOT, st.shade, 0.3));
            if (hs2 > 0.45) p.px(px + 1, py - 1, lipC);
          }
        }
      }
    }
    // the rings: light off the face, then the dust the face pushed out, running out over the floor
    shock(p, age);
  };

  // A ring on a floor is a wall of pushed-up dust with light on its crest, not a drawn circle: it wobbles, it breaks
  // into arcs where the ground gives it nothing, the far side leads, and it cools as it runs. In the floor's plane,
  // so it is a 2:1 ring for every aim.
  const shock = (p, age) => {
    for (let ri = 0; ri < RINGS.length; ri++) {
      const r = RINGS[ri], u = clamp(age / r.d);
      if (u >= 1) continue;
      const rad = r.r0 + (r.r1 - r.r0) * ease.outCubic(u);
      const k = Math.pow(1 - u, 0.5);
      if (r.dust) {
        // the dust it pushed out: a low, lumpy wall that tears apart as it slows, lit along its far crest
        dustRing(p, IX, IY, rad, 3.4 + 4 * (1 - u), k * 0.17, mix(st.dust, st.body, 0.35),
          { sy: FL, ph: 4 * u, brk: 0.65 * u, lit: 0.45 });
        continue;
      }
      const bright = mix(r.hot, r.cool, clamp(u * 1.15));
      const step = 0.5 / Math.max(2, rad * 0.7);
      const base = mix(st.dark, st.body, 0.62);                   // the wave is lighter than the floor it crosses
      for (let a = 0; a < TAU; a += step) {
        const n = ringNoise(a, 3, 11 + ri * 9), n2 = ringNoise(a, 11, 31 + ri), n3 = ringNoise(a, 21, 5 + ri);
        if (n3 < -0.22) continue;                               // the ground gives it nothing here
        const seg = clamp(0.55 + 0.6 * n2 + 0.2 * n3, 0, 1);    // it breaks into arcs as it runs
        const front = seg * k * (0.85 + 0.15 * -Math.sin(a));    // the far side (up-screen) leads brighter
        if (front <= 0.07) continue;
        const rr = rad + n * 1.9 + n3 * 1.1, ca = Math.cos(a), sa = Math.sin(a) * FL;
        const th = Math.max(3.4, 6.2 * (1 - 0.2 * u) * (0.85 + 0.4 * Math.abs(n2)));
        // the crest: a wall of light thick enough to be a wall, bright along its leading edge, dim behind it
        for (let o = 0; o <= th; o += 0.5) {
          const q = o / th;
          const prof = q < 0.42 ? 0.5 + 0.5 * (q / 0.42) : 1 - (q - 0.42) / 0.58;
          p.px(IX + ca * (rr + o), IY + sa * (rr + o), mix(base, bright, clamp(prof * (0.35 + 0.65 * front), 0, 1)));
        }
        // and the shadow it shoves ahead of it, close behind the crest: that is what makes it read as a wave
        if (n2 > -0.3) for (let o = 1.2; o <= 3.2; o += 0.6)
          p.dot(IX + ca * (rr - o), IY + sa * (rr - o), SOOT, 0.5 * front);
      }
    }
  };

  const impactStar = (p, age) => {
    const grow = ease.outCubic(clamp(age / 0.05)), die = 1 - smooth(0.05, 0.2, age);
    if (die <= 0) return;
    for (const sp of FSTAR) {
      const ca = Math.cos(sp.th), sa = Math.sin(sp.th), L = sp.len * grow * (0.45 + 0.55 * die);
      // one long splitting spine, wide at the heart and tapering to nothing: the floor giving, not a scratch
      for (let d = 0.4; d <= L; d += 0.4) {
        const g = d / sp.len, w = Math.max(0, sp.w * (1 - g) - 0.35);
        for (let o = -w; o <= w; o += 1) {
          const [x, y] = FS(REACH + ca * d - sa * o, sa * d + ca * o);
          p.px(IX + x, IY + y, g < 0.4 ? WHITE : g < 0.75 ? F[6] : F[4]);
        }
      }
    }
  };

  const impactCore = (p, age) => {
    // the head's face landing: a small hard flash at the heart of the star, gone before the eye settles on it
    if (age < 0.07) {
      const k = 1 - age / 0.07, rx = 3 + 6 * ease.outCubic(clamp(age / 0.07));
      p.ellipse(IX, IY, rx, rx * FL, () => WHITE, 0.95);
      if (k > 0.3) p.glow(IX, IY, 14, WHITE, 0.6 * k);
      // the light of it leaping straight up out of the dent: a short solid beam, not a dotted line
      const hh = 13 * k;
      for (let y = 0; y <= hh; y += 1) {
        const q = 1 - y / hh;
        p.px(IX, IY - y, WHITE);
        if (q > 0.3) { p.px(IX - 1, IY - y, mix(F[6], F[5], 1 - q)); p.px(IX + 1, IY - y, mix(F[6], F[5], 1 - q)); }
      }
    }
    impactStar(p, age);
    for (const s of SLIVERS) {
      if (age > s.life) continue;
      const k = 1 - age / s.life;
      sliver(p, IX, IY, s.a, s.r0 + s.grow * ease.outCubic(age / s.life), s.arc, s.c, 0.8 * k);
    }
  };

  const impactLight = (p, age) => {
    const l1 = 1 - clamp(age / 0.11), l2 = 1 - clamp(age / 0.9);
    if (l1 > 0) p.glow(IX, IY, 24, WHITE, 0.5 * l1);
    if (l2 > 0) {
      p.glow(IX, IY, 46, F[4], 0.2 * l2);
      p.glow(IX, IY, 24, F[5], 0.17 * l2);
      // a small pool of light left on the floor under the blow, not a wash over the whole mark
      const rx = 8 + 3 * Math.sin(Math.min(1, age * 1.4) * Math.PI), ry = rx * FL;
      p.shade(IX - rx, IY - ry, IX + rx, IY + ry, (x, y, out) => {
        const d = Math.hypot((x - IX) / rx, (y - IY) / ry);
        if (d >= 1) return;
        const f = 1 - d;
        out.l = mix(F[4], F[5], f); out.k = 0.05 * l2 * f * f;
      });
    }
  };

  const dustDraw = (p, t) => {
    softs.length = 0;
    for (const d of DUSTS) {
      const age = t - d.t0;
      if (age <= 0 || age >= d.life) continue;
      const [u, v, h] = puffAt(d, age), [x, y] = P(u, v, h);
      const k = age / d.life, r = d.r0 + d.r1 * ease.outCubic(clamp(age / 0.18));
      const a = Math.min(0.18, d.a * Math.pow(1 - k, 1.3) * clamp(age / 0.04) * 2.2) * (1 - 0.3 * clamp(h / 40));
      if (a <= 0.014) continue;
      softs.push({ x, y, r, a });
    }
    softs.sort((a, b) => a.y - b.y);
    for (const s of softs) {
      soft(p, s.x, s.y, s.r, DUST, s.a);                                        // the body of the puff
      soft(p, s.x - s.r * 0.24, s.y - s.r * 0.36, s.r * 0.56, DUSTL, s.a * 0.6); // and the light on top of it
    }
  };

  // The dust settles over the mark, so the lip of the crater and the edges of the cracks are laid down once more on
  // top of it: a mark that vanishes under its own smoke is a mark that never happened.
  const rimBoost = (p, t) => {
    const fade = 1 - smooth(D - 0.55, D - 0.12, t);
    if (fade <= 0) return;
    for (const d of DENT) {
      const q = Math.hypot(d.du / DU, d.dv / DV);
      if (q < 0.925 || q > LIP * 0.995) continue;
      if (hash(d.du * 1.7, d.dv * 2.3) < 0.55) continue;      // a rubble lip, not a dotted outline
      const c = d.dv < 0 ? mix(st.light, F[6], 0.35) : mix(st.body, st.light, 0.5);
      p.dot(IX + d.x, IY + d.y, c, 0.9 * fade);
    }
    for (const c of CRACKS) {
      for (let i = 2; i < c.pts.length; i += 2) {
        const [u, v] = c.pts[i], [x, y] = FS(u, v);
        p.dot(IX + x, IY + y - 1, mix(st.light, F[5], 0.45), 0.6 * fade);
      }
    }
  };

  const debris = (p, t) => {
    const age = t - HIT;
    if (age <= 0) return;
    for (const b of GRIT) {
      const [u, v, h] = tossAt(b, age), [x, y] = P(u, v, h);
      const ga = clamp((D - t - b.dl) / 0.22, 0, 1);
      if (ga <= 0) continue;
      const c = h > 1.2 ? mix(b.c, F[4], 0.35) : b.c;
      p.dot(x, y, c, ga);
      if (b.s > 1) { p.dot(x + 1, y, mix(c, st.shade, 0.4), ga); p.dot(x, y + 1, mix(c, SOOT, 0.5), ga * 0.8); }
    }
    for (const b of ROCKS) {
      const [u, v, h] = tossAt(b, age), [x, y] = P(u, v, h);
      const ga = clamp((D - t - b.dl) / 0.25, 0, 1);
      if (ga <= 0) continue;
      const a = h > 0.4 ? b.a + b.va * age : b.a + b.va * b.t1;
      rock(p, { x, y, s: b.s, a, life: 0.5 * ga }, stR);
      if (h > 1.5) {
        const [fx, fy] = P(u, v, 0);
        floorShadow(p, fx, fy, 1.5 + h * 0.05, BLACK, 0.18 * clamp(1 - h / 13) * ga);
      }
      if (ga > 0.5 && h <= 0.4) {   // settled stone catching the light now and then as the dust thins
        const tw = Math.sin((t - HIT - b.t1) * 17 + b.a * 3);
        if (tw > 0.955) p.dot(x - 1, y - 1, F[6], 0.85);
      }
    }
  };

  const sparkDraw = (p, age) => {
    if (age <= 0) return;
    for (const b of SPARKS) {
      if (age > b.life) continue;
      const e = Math.exp(-b.drag * age), d = (1 - e) / b.drag;
      const u = b.u + b.vu * d, v = b.v + b.vv * d, h = b.h + b.vh * age - 0.5 * G * age * age;
      if (h < 0) continue;
      const [x, y] = P(u, v, h);
      const vx = b.vu * e * ax - b.vv * e * az, vy = (b.vu * e * az + b.vv * e * ax) * FL - (b.vh - G * age);
      const k = 1 - age / b.life, sp = Math.hypot(vx, vy) || 1, ux = vx / sp, uy = vy / sp, len = Math.min(4, 1 + sp * 0.05);
      p.line(x - ux * len, y - uy * len, x - ux * len * 0.45, y - uy * len * 0.45, k > 0.5 ? F[6] : F[3]);
      p.line(x - ux * len * 0.5, y - uy * len * 0.5, x, y, k > 0.6 ? WHITE : F[5]);
      p.glow(x, y, 2, F[6], 0.3 * k);
    }
  };

  return {
    update(dt) { T += dt; },
    draw(p, tt) {
      const t = tt ?? T;
      if (t >= D) return;
      if (t < RAISE + 0.05) glint(p, t);
      swath(p, t);
      const age = t - HIT;
      if (age > 0) {
        floorMarks(p, age, t);
        impactCore(p, age);
        impactLight(p, age);
        // the finisher beat: a second, much wider shock wave rolls out past the hammer's own ring, the floor
        // cracks open under it and a crown of dust goes up, so the blow reads as the end of the fight
        crash(p, age, {
          x: REACH * ax, z: REACH * az, reach: 66, r0: 6, rings: 2, ringLife: 0.54, coreLife: 0.22, coreR: 16,
          white: 0xffffffff, hot: F[6], mid: F[5], rim: [0xffffffff, F[6], F[5], F[4], F[3], F[1]],
          crack: F[4], dust: DUST, seed: 7, crackN: 10, dustN: 8,
        });
      }
      dustDraw(p, t);
      if (age > 0) rimBoost(p, t);
      debris(p, t);
      if (age > 0) sparkDraw(p, age);
    },
  };
}
