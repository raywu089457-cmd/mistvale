// The game's fire tornado (the mage's cinder cyclone) for a 2:1 isometric camera, born and killed the way a fire
// whirl is, never by stretching, scaling, fading or masking a picture into place:
//
//   strike   the spell's heat lands: a white-hot point on the floor and sparks skipping out along it
//   catch    the floor catches and the fire runs out from the strike as a front (burning-ground's growth)
//   turn     the air over the burn is drawn in and starts to turn: ash and embers spiral in along the floor and a
//            ring of flame winds up round the middle
//   climb    a whirl lifts out of the burn: a rolling head of flame shoots up and slows as it nears full height,
//            leaving the column in its wake, thin at first, fattening and brightening as it spins up
//   roar     it stands: spiral bands turning up it, licks off its sides, embers orbiting, a crest of tongues
//            breaking at its top and the smoke it makes leaving as a plume
//   starve   the burn under it runs out of fuel (burning-ground's fuel): its tongues die one by one, coals glow on
//   rope     the column thins into a snaking rope that leans away on the draught, and its foot lifts off the floor
//   break    gaps open up it; the pieces burn out up their own spiral strands into smoke and a shower of embers
//   ash      the floor smoulders and the scorch settles to nothing
//
// Every pixel is drawn 1:1 at full size, the same pixel as the heroes (the floor is 32 x 16 px tiles). The column
// is the library fire tornado's (fire-tornado.js) with its height held fixed, so its bands never stretch: it climbs
// by building upward, not by growing a picture.
//
// Its top is built the way a flame's top actually is: the body is optically thick, so no background shows through
// the middle of it; the body ends in a churning, lobed crest (a 2:1 camera sees the mouth's far rim standing half a
// radius above the axis) cooled to deep red, the way a flame's tip is its coolest part; the crest breaks into
// tongues rather than a row of equal ones, and out of it the smoke leaves as a buoyant plume —born at the tip,
// widening as it entrains air, lit warm while it is close to the fire, cooling and bending away with height.
import { fit, mix, hex, clamp, smooth, noise, Rng, WHITE, TAU } from "../../core/index.js";
import { pnoise, hotFirst, flameTongue, firePuff, smokePuff, soft, ember, spark, drift, looped, floorLight, LAYERS, BACK_LAYERS } from "./_lib.js";
import * as burning from "./burning-ground.js";

export const meta = {
  name: "Cinder cyclone (iso)",
  desc: "The mage's fire tornado on a 2:1 floor, born and killed like a real fire whirl: the floor catches, a whirl climbs out of the burn and spins up, then ropes out and burns out.",
  tags: ["fire", "tornado", "vortex", "spell", "aoe", "one-shot", "iso", "top-down", "ground"],
  size: [272, 320],   // the same frame and the same standing height as the blizzard vortex (ice/blizzard-vortex-iso)
  origin: [136, 258],
  duration: 5.2,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: {
    palette: ["#4a1712", "#8a1f17", "#c9281f", "#f2561d", "#ff8a2a", "#ffc23d", "#ffe26b", "#fff3a6", "#ffffff"],
    height: 96,    // the column at full height, in sprite px (a hero stands about 38); the blizzard vortex stands 96
    width: 1.75,   // its girth: 1 is the library fire tornado's (widened to the blizzard vortex's body)
    radius: 2.1,   // the burn under it, as burning-ground's radius (the blizzard vortex's 218 px ground)
    lean: 1,       // which way the dying rope leans on the draught: 1 right, -1 left
    part: "all",   // "floor": the burn alone, to draw under the actors; "air": all that stands up; "all": both
    seed: 4,
  },
};

// when each part of its life happens, in seconds: the [start, end] its change eases across
const SPREAD = [0.03, 1.0], TURN = [0.22, 0.85], CLIMB = [0.5, 1.55], FATTEN = [0.55, 1.75];
const STARVE = [3.0, 4.3], ROPE = [3.3, 4.3], LIFT = [3.7, 4.65], BREAK = [3.95, 4.55], BURNOUT = [4.2, 4.95], SETTLE = [4.6, 5.15];
const END = 5.12;   // every particle is dead by now, so the last frame is empty
const PERIOD = 2;   // the library tornado's clock: its spin and noise rates are per 2 s
const PUFF = 0.52;  // how often a buoyant eddy comes up the burn and climbs the column, in seconds
const GAPS = [{ v: 0.5, dt: 0 }, { v: 0.84, dt: 0.12 }];
// the crown's layers: a flame's top is its coolest part, so deep red rim, red, orange, gold —no white heart
const CROWN = [[1, 1, 5], [0.72, 0.86, 4], [0.46, 0.64, 3], [0.2, 0.36, 2]];
const SMOKE1 = hex("#5b5566"), GRIT = [hex("#2c2427"), hex("#4b3f3c"), hex("#6d5d55")];
const ramp = ([a, b], t) => smooth(a, b, t);
const climbAt = (t) => clamp((t - CLIMB[0]) / (CLIMB[1] - CLIMB[0]));
const shade = (H, h) => (h > 0.95 ? H[0] : h > 0.82 ? H[1] : h > 0.7 ? H[2] : h > 0.58 ? H[3] : h > 0.46 ? H[4] : h > 0.34 ? H[5] : h > 0.2 ? H[6] : H[7]);

/** The storm at time t: everything it does is one of these numbers changing. */
function state(t, o) {
  const HT = o.height, c = climbAt(t), lift = clamp((t - LIFT[0]) / (LIFT[1] - LIFT[0])), burn = ramp(BURNOUT, t);
  // the starting plume's head shoots up and slows as it nears full height; once the plume is established the flame
  // stands at the height its burning gives it (HT), and the head's fire burns out into the smoke above it
  const head = HT * 1.2 * (1 - Math.pow(1 - c, 2.4));
  const stand = HT * (1 + 0.035 * Math.sin(t * 0.83 + 1.7)) * (1 - 0.72 * burn);
  return {
    HT,
    top: head + (stand - head) * smooth(CLIMB[1] - 0.15, CLIMB[1] + 0.75, t),
    rise: c > 0 && c < 1 ? (HT * 1.2 * 2.4 * Math.pow(1 - c, 1.4)) / (CLIMB[1] - CLIMB[0]) : 0, // its speed, px/s
    foot: HT * 0.55 * Math.pow(lift, 1.6),                               // a foot lifting off, slowly then faster
    W: o.width * (0.38 + 0.62 * ramp(FATTEN, t)) * (1 - 0.62 * ramp(ROPE, t)),
    heat: (0.8 + 0.2 * ramp(FATTEN, t)) * (1 - 0.3 * smooth(3.3, 4.6, t)),
    glow: smooth(0.6, 1.4, t) * (1 - smooth(3.5, 4.5, t)),
    bend: 12 * smooth(3.2, 4.3, t),
    lean: 10 * (o.lean ?? 1) * smooth(3.5, 4.8, t),
    burn,
    gaps: GAPS.map((g) => ({ v: g.v, w: 0.16 * smooth(BREAK[0] + g.dt, BREAK[1] + g.dt, t) })),
    show: smooth(0.85, 1.6, t) * (1 - smooth(3.55, 4.45, t)),           // its side show: orbiting embers, flung flame
    ring: ramp(TURN, t) * (1 - smooth(3.5, 4.05, t)),                     // the ring of flame whirling at its foot
  };
}
// the funnel: its spine snaking as it turns (and snaking harder, leaning away, as it ropes out), narrow at the foot
const spine = (L, v, t) => L.W * (3.2 * Math.sin(v * 4.2 - (t / PERIOD) * TAU * 2) * v + 2 * Math.sin((t / PERIOD) * TAU) * v)
  + L.bend * Math.sin(v * 3.1 - t * 2.3) * v + L.lean * v * v;
const girth = (L, v) => L.W * (3.5 + 15 * Math.pow(v, 1.35));

const JAG = new Float32Array(160), JAG0 = -80;   // scratch: the lifted foot's fray, one value a column, per frame

/** The column, row by row, from the foot to the crest: fire-tornado's spiral bands with the storm's life in them. */
function column(p, t, L, H, GLOW, S) {
  if (L.top - L.foot < 1) return;
  const HT = L.HT, ph = t / PERIOD, fl = 0.85 + 0.15 * noise(t * 7, S + 1);
  // the fray of the lifted foot is a property of the column, not of the row: work it out once for every column
  for (let x = JAG0; x < JAG0 + JAG.length; x++)
    JAG[x - JAG0] = 4.6 * Math.sin(x * 0.41 + S * 1.7) + 3.1 * Math.sin(x * 0.17 + S * 0.6) + 2.2 * Math.sin(x * 0.89 + S * 2.3);
  // the mouth at the top of the flame: a 2:1 camera sees its rim as an ellipse, so its far rim stands half a
  // radius above the axis. The crest is that rim, lobed and churning —a flame's top, not a cut across a tube
  const vc = Math.min(1, L.top / HT);
  const rimR = girth(L, vc) * (1 - 0.16 * smooth(0.78, 1.02, vc)), dome = 0.5 * rimR;
  for (let y = -Math.ceil(L.foot); y >= -Math.ceil(L.top + dome + 10); y--) {
    const h = -y, v = h / HT, vv = Math.min(1, v), c = spine(L, vv, t);
    // buoyant eddies are carried up it: the column swells and brightens where one passes, and the one that
    // reaches the top lifts the crest before it tears off as smoke
    const puff = Math.sin(TAU * (t / PUFF - vv * 2.2)), swell = smooth(0.3, 0.95, vv);
    const r = girth(L, vv) * (1 - 0.16 * smooth(0.78, 1.02, vv)) * (1 + 0.07 * noise(t * 3 + y * 0.1, S + 2) + 0.05 * puff * swell);
    const sp = ph * TAU * 3 + v * 5.5, tear0 = 0.18 * pnoise(y * 0.45 - ph * 30, 30, S + 6);
    // the funnel comes apart into spiral strands where a break tears open in it and as it burns out; while it
    // stands, the flame is optically thick and its body is solid —nothing shows through the middle of it
    let cut = L.burn, hole = false;
    for (const g of L.gaps) {
      if (g.w <= 0) continue;
      const e = Math.abs(v - g.v) - g.w * 0.5;
      if (e < 0) { hole = true; break; }
      cut = Math.max(cut, clamp(1 - e / 0.07) * clamp(g.w / 0.03));
    }
    if (hole) continue;
    const lickL = 0.3 * Math.max(0, pnoise(-y * 0.22 + ph * 18, 18, S + 3)), lickR = 0.3 * Math.max(0, pnoise(-y * 0.22 + ph * 18 + 9, 18, S + 4));
    for (let x = Math.floor(c - r * 1.35); x <= Math.ceil(c + r * 1.35); x++) {
      const dx = (x + 0.5 - c) / r, edge = 1 + (dx < 0 ? lickL : lickR);
      if (Math.abs(dx) > edge) continue;
      const th = Math.asin(clamp(dx, -1, 1));
      // the crest: the mouth's far rim, lobed by the turbulence and lifted by each eddy that arrives —a ragged
      // envelope over the whole top, never a ruler across it. Only rows near the mouth pay for it: lower down
      // nothing can be culled and the envelope is within a few per cent of the flame's height anyway
      let crest = 0;
      if (h > L.top * 0.9) {
        const lobe = 0.5 * pnoise(th * 3 - ph * 6, 12, S + 9) + 0.5 * Math.sin(th * 8.7 - t * 6.3);
        crest = L.top * (1 + 0.05 * lobe + 0.035 * puff * swell) + dome * Math.sqrt(Math.max(0, 1 - dx * dx));
        if (h > crest) continue;
      }
      const u = h / Math.max(1, crest || L.top);
      // the crest's flanks tear away where the sheet runs thin: the fire breaks out of a ragged edge, and a
      // tattered edge is the only place the body is thin enough for anything to show through it
      if (Math.abs(dx) > 0.76 && u > 0.7 && pnoise(x * 0.8 + h * 1.1 + ph * 24, 14, S + 11) < 0.42 * smooth(0.7, 1, u)) continue;
      // a lifted foot frays away from the floor column by column
      const ji = x - JAG0, jag = ji >= 0 && ji < JAG.length ? JAG[ji] : 0;
      const footCut = L.foot > 0.5 ? clamp(1 - (h - L.foot - jag * 0.6) / 14) : 0;
      const cc = Math.max(cut, footCut);
      // cos of the angle round the body: the part facing the camera is the hottest
      const depth = Math.sqrt(Math.max(0, 1 - dx * dx)), tear = tear0 + 0.05 * Math.sin(dx * 4.7 + y * 0.83 + ph * 9);
      const band = 0.5 + 0.5 * Math.sin((th + sp + tear) * 3), streak = band * band * band;
      if (cc > 0.03 && band < 0.3 + 0.62 * cc + 0.1 * pnoise(x * 0.7 + ph * 20, 20, S + 5)) continue;
      // a darker body with thin bright streaks spiralling up it, hottest where it faces us, cooling as it climbs,
      // and cooling off at the crest: the top of a flame is its coolest part, red where it still glows and soot-dark
      // only at the skin where the burning stops —but the sheet there is still thick, never a see-through cap
      const skin = smooth(0.72, 1.0, u);
      let heat = 0.22 + 0.36 * depth + 0.5 * streak - 0.22 * vv + 0.1 * (1 - vv) + 0.07 * puff * swell;
      heat -= (0.3 + 0.22 * (1 - streak)) * skin;
      heat = Math.max(heat, 0.32 - 0.12 * skin + 0.1 * streak);   // the crest keeps its red; only its skin goes sooty
      if (Math.abs(dx) > 1) heat = 0.3 - (Math.abs(dx) - 1) * 1.5;
      p.px(x, y, shade(H, heat * fl * L.heat));
    }
  }
  if (L.glow > 0) p.glow(spine(L, 0.55, t), -HT * 0.5, HT * 0.27, GLOW, 0.3 * fl * L.glow);
  // the mouth is where the fire is still bright enough to light the smoke leaving it
  p.glow(spine(L, vc, t), -L.top - dome * 0.3, 9 + 0.4 * rimR, mix(H[4], H[5], 0.4), 0.16 * L.heat * fl);
}

/** The ring of flame whirling round the foot: it winds up before the column climbs and dies before the foot lifts. */
function footRing(p, t, o, L, H, S, N, front) {
  if (L.ring <= 0.03) return;
  const Wr = o.width * (0.45 + 0.55 * ramp(TURN, t)), spin = (t / PERIOD) * TAU * 2;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + spin, z = Math.sin(a);
    if (z >= 0 !== front) continue;
    const nn = (S * 3 + i) * 19, R = Wr * (12 + 2 * N(2, nn)), x = Math.cos(a) * R, y = z * R * 0.5;
    const h = Wr * (5 + 5 * (0.5 + 0.5 * N(5, nn + 1))) * (front ? 1 : 0.8) * L.ring;
    if (h < 1.5) continue;
    flameTongue(p, x, y, h, 1.6 * Wr * (0.6 + 0.4 * L.ring), -Math.cos(a + Math.PI / 2) * 3 * Wr, N, nn, H, front ? LAYERS : BACK_LAYERS);
  }
}

/** Embers orbiting the column on a 2:1 ellipse, behind it first and in front after; only where the column is. */
function orbiters(t, L, S) {
  const out = [];
  if (L.show <= 0.02) return out;
  looped(t, PERIOD, 30, S + 500, (r) => ({ v0: r.range(0.02, 0.7), rise: r.range(0.12, 0.3), a: r.range(0, TAU), w: r.range(4, 7), out: r.range(4, 12), life: r.range(1.2, 2.4), g: r.next() }), (q, age) => {
    const v = q.v0 + q.rise * age, h = v * L.HT;
    if (q.g > L.show || h > L.top || h < L.foot) return;
    const vv = Math.min(1, v), R = girth(L, vv) + q.out * L.W + age * 4, a = q.a + q.w * age;
    out.push({ x: spine(L, vv, t) + Math.cos(a) * R, y: -h + Math.sin(a) * R * 0.5, z: Math.sin(a), k: 1 - age / q.life, vx: -Math.sin(a) * R * q.w, vy: Math.cos(a) * R * q.w * 0.5 });
  });
  return out;
}
function drawOrbit(p, orbit, front, EMB, H) {
  for (const e of orbit) {
    if (e.z >= 0 !== front || e.k <= 0) continue;
    const sp = Math.hypot(e.vx, e.vy) || 1, len = Math.min(5, 1 + sp * 0.025), c = e.k > 0.6 ? EMB[0] : e.k > 0.3 ? EMB[1] : EMB[2];
    p.line(e.x - (e.vx / sp) * len, e.y - (e.vy / sp) * len, e.x, e.y, (u) => (u > 0.6 ? c : front ? EMB[3] : H[7]));
    p.glow(e.x, e.y, front ? 4 : 3, c, (front ? 0.4 : 0.15) * e.k);
  }
}

/** Flame flung off the spinning sides, cooling as it flies. */
function flung(p, t, L, H, S) {
  if (L.show <= 0.02) return;
  looped(t, PERIOD, 70, S + 200, (r) => ({ v: r.range(0.05, 0.95), side: r.sign(), sp: r.range(20, 50), life: r.range(0.25, 0.5), s: r.range(1.4, 2.8), f: r.next(), g: r.next() }), (q, age) => {
    const h = q.v * L.HT;
    if (q.g > L.show || h > L.top || h < L.foot) return;
    const x0 = spine(L, q.v, t - age) + q.side * girth(L, q.v);
    const [x, y] = drift(x0, -h, q.side * q.sp, -q.sp * 0.6, age, 0, -60, 3, 3);
    firePuff(p, x, y, 1 - age / q.life, q.s, q.f, H, 0.1, -q.side * 0.6, -0.8);
  });
}

// the climbing head: puffs of flame born at the head as it passes, thrown up and out (wider while it climbs fast),
// cooling into smoke: a rolling cap, the way a rising plume's head rolls over itself
const HEAD = (() => {
  const r = new Rng(901), out = [];
  for (let i = 0; i < 36; i++) out.push({ u: (i + r.next() * 0.8) / 36, side: r.chance(0.5) ? 1 : -1, out: r.range(0.2, 1), up: r.range(0.2, 1), lf: r.range(0.26, 0.48), ls: r.range(0.5, 0.95), s: r.range(1.8, 3.4), f: r.next(), smoke: r.chance(0.75) });
  return out;
})();
function head(p, t, o, H, SMOKE) {
  const span = (CLIMB[1] - CLIMB[0]) * 1.12;
  for (const q of HEAD) {
    const tb = CLIMB[0] + q.u * span, age = t - tb;
    if (age < 0 || age > q.lf) continue;
    const Lb = state(tb, o), vb = Math.min(1, Lb.top / Lb.HT);
    const x0 = spine(Lb, vb, tb) + q.side * q.out * girth(Lb, vb), y0 = -Lb.top;
    const vx = q.side * (6 + 18 * q.out), vy = -(0.3 * Lb.rise + 6 + 12 * q.up);
    const [x, y] = drift(x0, y0, vx, vy, age, 0, -40, 3, 2.2);
    firePuff(p, x, y, 1 - age / q.lf, q.s * (1 + 0.5 * (1 - q.u)), q.f, H, 0.16, q.side * 0.3, -1);
  }
  // the leading flame itself, while it climbs
  const c = climbAt(t);
  if (c > 0 && c < 1) {
    const L = state(t, o), x = spine(L, Math.min(1, L.top / L.HT), t), k = 1 - c;
    firePuff(p, x, -L.top + 1, 0.85, 2.2 + 2.2 * k, 0.05, H, 0.3 * k);
    p.glow(x, -L.top, 10 + 10 * k, H[2], 0.3 * k);
  }
}

// the inflow: ash, grit and embers drawn in across the floor and spun faster as they near the foot, then sucked up
const INFLOW = (() => {
  const r = new Rng(733), out = [];
  for (let i = 0; i < 60; i++) {
    const early = i < 34;   // most while the whirl winds up, then a trickle feeding it while it stands
    out.push({ tb: early ? 0.16 + r.next() * 1.25 : 1.45 + r.next() * 1.9, life: r.range(0.7, 1.15), a: r.range(0, TAU),
      r0: r.range(0.5, 1.1), ember: r.chance(0.42), s: r.chance(0.2) ? 2 : 1, ph: r.range(0, TAU), turns: r.range(0.9, 1.6) });
  }
  return out;
})();
function inflow(p, t, o, EMB) {
  const RG = 52 * clamp(o.radius ?? 1, 0.5, 1.6);
  for (const q of INFLOW) {
    const age = t - q.tb;
    if (age < 0 || age > q.life) continue;
    const at = (a) => {
      const u = a / q.life, rr = q.r0 * Math.pow(1 - u, 1.25) + 0.05, ang = q.a + q.turns * TAU * Math.pow(u, 1.7);
      return [Math.cos(ang) * rr * RG, Math.sin(ang) * rr * RG * 0.5 - 30 * smooth(0.6, 1, u)];
    };
    const [x, y] = at(age), k = 1 - age / q.life;
    if (q.ember) { ember(p, x, y, 0.35 + 0.65 * k, q.s, EMB, q.ph + age * 7); continue; }
    const [x0, y0] = at(Math.max(0, age - 0.04));
    p.line(x0, y0, x, y, GRIT[q.s === 2 ? 2 : 1]);
  }
}

// the burn's dressing, all static and deterministic: a burning area is not just its patch —it has coals breathing in
// the ash, grit skittering out, dust rolling low, and chips of burning debris thrown clear of it
const BFLOOR = (() => {
  const r = new Rng(2711), coal = [], grit = [], dust = [], deb = [];
  for (let i = 0; i < 80; i++) coal.push({ a: r.range(0, TAU), d: Math.sqrt(r.next()) * 0.96, w: r.range(0.7, 2.4), ph: r.range(0, TAU), s: r.chance(0.22) ? 2 : 1 });
  for (let i = 0; i < 14; i++) grit.push({ a: r.range(0, TAU), d: r.range(0.25, 1.0), tb: 0.45 + r.next() * 3.9, life: r.range(0.18, 0.34), sp: r.range(14, 40) });
  for (let i = 0; i < 9; i++) { const tb = 0.9 + r.next() * 2.7; deb.push({ a: r.range(0, TAU), d: r.range(0.12, 0.55), tb, sp: r.range(8, 26), up: r.range(24, 54), life: Math.min(r.range(0.7, 1.1), END - tb), s: r.range(1.6, 3) }); }
  for (let i = 0; i < 6; i++) { const tb = 0.75 + r.next() * 3.4; dust.push({ a: r.range(0, TAU), d: r.range(0.55, 1.05), tb, sp: r.range(3, 10), life: Math.min(r.range(0.9, 1.5), END - tb), s: r.range(2.4, 4.2) }); }
  return { coal, grit, dust, deb };
})();
const burnR = (o) => 52 * clamp(o.radius ?? 2, 0.5, 2.4);
function bedFloor(p, t, o, L, H) {
  const R = burnR(o), g = clamp((t - SPREAD[0]) / (SPREAD[1] - SPREAD[0])), grow = 1 - (1 - g) * (1 - g);
  const die = 1 - smooth(SETTLE[0], SETTLE[1], t), heatK = (0.35 + 0.65 * L.glow) * die;
  if (heatK <= 0.02) return;
  for (const q of BFLOOR.coal) {
    const z = Math.sin(q.a), x = Math.cos(q.a) * q.d * R * grow, y = z * q.d * R * 0.5 * grow;
    const k = heatK * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * q.w + q.ph)));
    if (k <= 0.1) continue;
    p.px(x, y, k > 0.72 ? H[4] : k > 0.42 ? H[3] : H[2]);
    if (q.s === 2) p.px(x + 1, y, k > 0.6 ? H[5] : H[4]);
  }
  for (const q of BFLOOR.grit) {
    const age = t - q.tb;
    if (age < 0 || age > q.life) continue;
    const run = Math.min(4, q.sp * age), d = Math.min(1.02, q.d * grow + run / R);
    const x = Math.cos(q.a) * d * R, y = Math.sin(q.a) * d * R * 0.5;
    spark(p, x, y, Math.cos(q.a) * q.sp, Math.sin(q.a) * q.sp * 0.5, 1 - age / q.life, [H[4], H[5], H[6]]);
  }
  for (const q of BFLOOR.dust) {
    const age = t - q.tb;
    if (age < 0 || age > q.life) continue;
    const [x, y] = drift(Math.cos(q.a) * Math.min(0.98, q.d * grow) * R, Math.sin(q.a) * Math.min(0.98, q.d * grow) * R * 0.5, q.sp, -q.sp * 0.35, age, 0, 0, 3, 2.5);
    smokePuff(p, x, y, 1 - age / q.life, q.s, mix(SMOKE1, H[3], 0.35), false, 0.5);
  }
  for (const q of BFLOOR.deb) {
    const age = t - q.tb;
    if (age < 0 || age > q.life) continue;
    const [x, y] = drift(Math.cos(q.a) * q.d * R, Math.sin(q.a) * q.d * R * 0.5, q.sp, -q.up, age, 0, 90, 2.2, 2.2);
    const s = Math.round(q.s), hot = 1 - age / q.life;
    p.rect(x - (s >> 1), y - (s >> 1), s, s, mix(hex("#2a2430"), H[1], 0.35));
    p.px(x, y - 1, hot > 0.6 ? H[5] : hot > 0.3 ? H[3] : H[1]);
  }
}

// the crown: the flame's crest breaking into tongues. They are rooted round the mouth's rim —the far half behind
// the body, the near half in front of it —wide-based and overlapping, and cooler than the body, because the top of
// a flame is where it is coolest; a row of equal white-hearted candles is what a flame's top never looks like.
function crown(p, t, o, L, H, S, N, back) {
  const env = L.heat * (1 - 0.6 * L.burn) * (1 - ramp(BURNOUT, t));
  if (L.top < 10 || env <= 0.05) return;
  const vc = Math.min(1, L.top / L.HT), c = spine(L, vc, t);
  const rimR = girth(L, vc) * (1 - 0.16 * smooth(0.78, 1.02, vc));
  for (let i = 0; i < 9; i++) {
    const nn = (S * 11 + i) * 23;
    // unevenly round the mouth, at uneven radii and heights: the crest breaks where it likes, never a picket fence
    const a = (i / 9) * TAU + 0.35 + 0.5 * N(1.7, nn + 3), z = Math.sin(a);
    if ((z < 0) !== back) continue;
    const rr = rimR * (0.8 + 0.22 * (0.5 + 0.5 * N(3, nn))), x = c + Math.cos(a) * rr, y = -L.top + z * rimR * 0.5;
    const tall = 0.5 + 0.5 * N(2.6, nn + 1);
    const h = (2.5 + 17 * tall * tall) * env * (0.72 + 0.28 * Math.min(1, L.top / 80));
    if (h < 2) continue;
    flameTongue(p, x, y, h, 2.6 + 1.4 * (0.5 + 0.5 * N(5, nn + 2)), Math.cos(a) * 3.2 + 0.8, N, nn, H, CROWN);
  }
}

// the flame sheds fragments off its crest: little licks that tear away, ride the updraught a few px and burn out.
// A standing flame's tip is alive with them —it is not a fixed row, and not smoke either
const SHED = (() => {
  const r = new Rng(2281), out = [];
  for (let i = 0; i < 52; i++) {
    out.push({ tb: 0.95 + (i / 52) * 3.75 + r.next() * 0.05, a: r.range(0, TAU), up: r.range(12, 30), vx: r.range(-3, 3), life: r.range(0.2, 0.38), s: r.range(0.8, 1.5) });
  }
  return out;
})();
function shreds(p, t, o, H) {
  for (const q of SHED) {
    const age = t - q.tb;
    if (age < 0 || age > q.life) continue;
    const Lb = state(q.tb, o), vc = Math.min(1, Lb.top / Lb.HT);
    const rimR = girth(Lb, vc) * (1 - 0.16 * smooth(0.78, 1.02, vc));
    const x0 = spine(Lb, vc, q.tb) + Math.cos(q.a) * rimR * 0.9;
    const y0 = -Lb.top + Math.sin(q.a) * rimR * 0.5;
    const [x, y] = drift(x0, y0, q.vx, -q.up, age, 0, -14, 2, 1.2);
    const k = 1 - age / q.life, hh = Math.max(1, Math.round((1.4 + 2.2 * k) * q.s));
    for (let i = 0; i < hh; i++) p.px(x + (i > hh * 0.6 ? 0.6 : 0), y - i, shade(H, 0.24 + 0.4 * k - i * 0.07));
  }
}

// tongues climbing off the burn at the column's foot: the fire under a fire whirl is fire, not a painted patch
function baseFlames(p, t, o, L, H, S, N, front) {
  const env = Math.max(L.ring, L.glow * 0.8);
  if (env <= 0.02) return;
  const R = burnR(o) * 0.62;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + (t / PERIOD) * TAU * 0.8, z = Math.sin(a);
    if ((z >= 0) !== front) continue;
    const nn = (S * 5 + i) * 31, rr = R * (0.75 + 0.25 * (0.5 + 0.5 * N(3, nn)));
    const h = (6 + 16 * (0.5 + 0.5 * N(4, nn + 1))) * env;
    if (h < 1.5) continue;
    flameTongue(p, Math.cos(a) * rr, z * rr * 0.5, h, 2.6 * L.W * (0.8 + 0.2 * env), -Math.cos(a + Math.PI / 2) * 4, N, nn, H, front ? LAYERS : BACK_LAYERS);
  }
}

// the strike: the spell's heat landing as a white-hot point, and sparks skipping out along the floor from it
const STRIKE = (() => {
  const r = new Rng(57), out = [];
  for (let i = 0; i < 16; i++) { const a = r.range(0, TAU), sp = r.range(40, 110); out.push({ vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, up: r.range(10, 40), life: r.range(0.22, 0.42) }); }
  return out;
})();
function strike(p, t, H, GLOW, SPK) {
  if (t > 0.45) return;
  const k = clamp(1 - t / 0.3);
  if (k > 0) {
    p.glow(0, -2, 28, GLOW, 0.9 * k);
    p.glow(0, 0, 9, WHITE, 0.9 * k);
    const rx = 2 + 4 * (1 - k), c = k > 0.6 ? H[0] : k > 0.3 ? H[1] : H[3];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx++) if ((dx / rx) ** 2 + (dy / (rx * 0.5)) ** 2 <= 1) p.px(dx, dy, c);
  }
  for (const s of STRIKE) {
    if (t > s.life) continue;
    const [x, y, vx, vy] = drift(0, 0, s.vx, s.vy - s.up, t, 0, 160, 3.5, 3.5);
    spark(p, x, y, vx, vy, 1 - t / s.life, SPK);
  }
}

const WAV = new Float32Array(104);   // scratch: the plume's ragged top edge, one value a column, per frame

// the plume: the smoke leaves the crest as one body of it, not as detached puffs. It comes off the top of the
// mouth over the vortex's core, rises on its own heat and widens as it entrains air (about 12 degrees off its
// axis), the mouth sheds eddies that travel up its sides, the fire lights it warm while it is still close, it
// cools to grey as it thins, and it mushrooms and tears apart where the buoyancy goes out of it, leaning off
// downwind with height. Its source follows the crest down as the flame burns out.
function plume(p, t, o, SMOKE, H, S) {
  const L = state(t, o), dir = o.lean ?? 1;
  const vc = Math.min(1, L.top / L.HT);
  const rimR = girth(L, vc) * (1 - 0.16 * smooth(0.78, 1.02, vc)), dome = 0.5 * rimR;
  const h0 = L.top + dome * 0.5, axis = spine(L, vc, t);
  const clear = (o.y ?? 258) - h0 - 6;
  const span = Math.max(10, Math.min(clear, (112 - 45 * L.burn) * smooth(0.35, 0.9, Math.min(1, L.top / L.HT))));
  // the smoke leaves the mouth as wide as the mouth is, necks in a little as the vortex pulls it through the core,
  // then widens with height as it entrains air
  const mouth = 0.4 * rimR, widen = 0.055 * span;
  const fadeIn = smooth(0.3, 0.8, L.heat) * (1 - smooth(4.7, 5.06, t)), cool = mix(SMOKE1, WHITE, 0.34);
  // where each column of the smoke gives out: a wavy edge over the top of the cap, so it thins away rather than
  // being cut off. Worked out once a frame for the columns the plume can reach, not per pixel
  const WX = Math.floor(axis - 52), WN = 104;
  for (let k = 0; k < WN; k++) {
    const x = WX + k;
    WAV[k] = 0.03 * Math.sin(x * 0.22 + t * 0.9) + 0.04 * pnoise(x * 0.1 + t * 0.35, 7, S + 75);
  }
  for (let i = 0; i <= span; i++) {
    const f = i / span, h = h0 + i;
    const sway = pnoise(h * 0.05 - t * 1.1, 28, S + 71) * (0.4 + 2.2 * f);
    const cx = axis + dir * (0.3 + 0.8 * f + 5 * f * f * f) + sway;
    // it entrains air, so it widens as it climbs; and the eddies the mouth sheds travel up its sides, so its
    // outline is lobed and billowing rather than a smooth tube, with the lumps moving up it
    let lob = 0;
    for (let j = 0; j < 4; j++) {
      const c = (j / 4 + t / 1.15) % 1, d = (f - c) / (0.11 + 0.05 * j);
      lob += (1.8 + 1.3 * j) * Math.exp(-d * d);
    }
    // its cap closes over rather than ending as a wall: a plume mushrooms, then the buoyancy goes out of it
    const cap = 1 - 0.26 * smooth(0.8, 1, f);
    const halfW = (mouth * (0.82 + 0.18 * smooth(0, 0.12, f)) + widen * f + lob * (0.55 + 0.45 * f)) * cap
      * (1 + 0.12 * pnoise(h * 0.12 + t * 0.6, 22, S + 72));
    const a0 = 0.72 * fadeIn * smooth(0, 0.08, f) * Math.pow(1 - f, 0.6) * (1 - 0.55 * L.burn);
    if (a0 < 0.012) continue;
    // sooty right at the tip and lit by the fire there, then cooling to a neutral grey as it climbs
    const col = mix(mix(SMOKE, H[5], 0.5 * (1 - f) * (1 - f)), cool, smooth(0.06, 0.8, f));
    for (let x = Math.floor(cx - halfW); x <= Math.ceil(cx + halfW); x++) {
      const dx = (x + 0.5 - cx) / halfW;
      if (dx < -1 || dx > 1) continue;
      const wi = x - WX;
      const topF = 0.96 - 0.12 * dx * dx + (wi >= 0 && wi < WN ? WAV[wi] : 0);
      const a = a0 * (1 - dx * dx) * (1 - smooth(topF - 0.3, topF, f));
      if (a > 0.035) p.blend(x, -h, col, a);   // below this it is not worth a blend: it is a step in the dark
    }
  }
}

// the death: smoke left where the column comes apart, and the embers it lets go of, which float and then fall
const DEATH = (() => {
  const r = new Rng(1601), smoke = [], embers = [];
  for (let i = 0; i < 26; i++) { const tb = 3.85 + r.next() * 1.0; smoke.push({ tb, v: r.next(), side: r.range(-1, 1), life: Math.min(r.range(0.7, 1.1), END - tb), s: r.range(3, 5.2), vy: -r.range(10, 20) }); }
  for (let i = 0; i < 44; i++) { const tb = 3.9 + r.next() * 0.85; embers.push({ tb, v: r.next(), side: r.chance(0.5) ? 1 : -1, sp: r.range(14, 46), up: r.range(-10, 28), life: Math.min(r.range(0.5, 1.0), END - tb), s: r.chance(0.25) ? 2 : 1, ph: r.range(0, TAU) }); }
  return { smoke, embers };
})();
function death(p, t, o, SMOKE, EMB, front) {
  for (const q of front ? DEATH.embers : DEATH.smoke) {
    const age = t - q.tb;
    if (age < 0 || age > q.life) continue;
    const L = state(q.tb, o), h = L.foot + q.v * (L.top - L.foot), v = Math.min(1, h / L.HT), x0 = spine(L, v, q.tb);
    if (front) {
      const [x, y] = drift(x0 + q.side * girth(L, v) * 0.6, -h, q.side * q.sp, -q.up, age, 0, 70, 1.6, 1.6);
      ember(p, x, y, 1 - age / q.life, q.s, EMB, q.ph + age * 6);
    } else {
      const [x, y] = drift(x0 + q.side * girth(L, v) * 0.5, -h, q.side * 8 + L.lean, q.vy, age, 0, -8, 1.4, 1.2);
      smokePuff(p, x, y, 1 - age / q.life, q.s, SMOKE, true, 0.9);
    }
  }
}

export function draw(p, t, o) {
  const F = fit(o.palette, 9), H = hotFirst(F), S = o.seed | 0, L = state(t, o);
  const N = (rate, seed = 0, off = 0) => noise(t * rate + off, seed);
  const GLOW = mix(mix(H[3], H[4], 0.5), WHITE, 0.25), SMOKE = mix(SMOKE1, H[6], 0.25);
  const EMB = [H[1], H[2], H[4], H[6]], SPK = [H[2], H[3], H[4], H[5]];
  if (o.part !== "air") {
    // the floor: the burn, the light the storm throws on it, the inflow along it, the strike
    const g = clamp((t - SPREAD[0]) / (SPREAD[1] - SPREAD[0]));
    burning.draw(p, t, { palette: o.palette, seed: S + 1, radius: o.radius, growth: 1 - (1 - g) * (1 - g), fuel: 1 - ramp(STARVE, t), ash: 1 - ramp(SETTLE, t) });
    bedFloor(p, t, o, L, H);
    floorLight(p, 0, 0, 44 * L.W, 22 * L.W, GLOW, 0.35 * L.glow);
    inflow(p, t, o, EMB);
    strike(p, t, H, GLOW, SPK);
  }
  if (o.part === "floor") return;
  // the air, back to front: the plume behind it, the far side of its ring and orbit, the column, its crest, the
  // near side of the ring, the smoke of its death, the head
  plume(p, t, o, SMOKE, H, S);
  death(p, t, o, SMOKE, EMB, false);
  const orbit = orbiters(t, L, S);
  drawOrbit(p, orbit, false, EMB, H);
  baseFlames(p, t, o, L, H, S, N, false);
  footRing(p, t, o, L, H, S, N, false);
  crown(p, t, o, L, H, S, N, false);
  column(p, t, L, H, GLOW, S);
  crown(p, t, o, L, H, S, N, true);
  shreds(p, t, o, H);
  flung(p, t, L, H, S);
  baseFlames(p, t, o, L, H, S, N, true);
  footRing(p, t, o, L, H, S, N, true);
  drawOrbit(p, orbit, true, EMB, H);
  head(p, t, o, H, SMOKE);
  death(p, t, o, SMOKE, EMB, true);
  if (L.glow > 0) {
    p.glow(spine(L, 0.5, t), -L.HT * 0.5, 29 * L.W, GLOW, 0.62 * L.glow);
    p.glow(0, -6, 18, H[2], 0.3 * L.glow);
  }
}

