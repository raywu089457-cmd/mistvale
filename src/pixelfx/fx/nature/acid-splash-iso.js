// Acid splash for the game's 2:1 isometric camera: nature/acid-splash rewritten for the floor the game sees, not its
// picture squashed, stretched or scaled. The recipe is the source's: a gob falls out of the sky as a teardrop
// stretched by its speed, bursts with a white hero frame, throws a crown and a fan of droplets, eats a glowing pit
// into the floor, boils itself away in it, spitting beads, hissing pops and pale steam. What changed is the world:
//   - the gob lands on a floor point, not a line: everything it throws flies in 3D (x across, z into the floor, h up;
//     screen x = x, y = z / 2 - h) and lands at its own depth, all the way round, etching spatter spots where it hits;
//   - the crown is a ring of acid thrown up round the impact and falling back: its rim is a level 2:1 ellipse in the
//     air, its wall a curtain of drops between rim and floor, its spikes leaning out over the floor, beads breaking off
//     their tips; the far half is dimmer and drawn behind;
//   - the pit is a 2:1 patch of burnt, eaten floor with the acid lying in it as a shimmering disc that shrinks as it
//     boils dry, a chartreuse rim still glowing where it is eating, a pool of light under it and steam curling off;
//   - it leaves the way it would: the acid boils off, the rim cools from glowing green to burnt, the steam thins and
//     the spatter spots settle to soot. Nothing fades as a picture.
// 1 px = 1 character sprite px (the floor is 32 x 16 px tiles).
import { Rng, fit, sparkle, clamp, smooth, ease, noise2, TAU, WHITE, mix, hex } from "../../core/index.js";
import { FLOOR, bandFloor, floorShadow, ringNoise } from "../_iso.js";

export const meta = {
  name: "Acid splash (iso)",
  desc: "nature/acid-splash on the 2:1 floor: the gob falls out of the sky, bursts into a rising ring-crown, spatters every way and eats a glowing pit that boils dry in steam.",
  tags: ["nature", "acid", "poison", "splash", "liquid", "ground", "one-shot", "iso", "top-down"],
  size: [200, 160],
  origin: [100, 112],
  duration: 2.8,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: ["#0e140a", "#1c3010", "#2c5214", "#457e18", "#6aae1c", "#a0dc2a", "#dcff6a", "#f8ffd0"], seed: 6 },
};

const FL = FLOOR;
const HIT = 0.3, SKY = 62, V0 = 64.2, G = 950;   // the gob: from 62 px up, faster and faster, landing at HIT
const WIN = 0.27;                                 // the crown lives this long
const SPREAD = 0.4, DRY = 0.7, GONE = 2.2, W = 30, PIT = 5;

// a soft shadow on the floor, composited with p.blend so it stays smooth (no ordered dither, no black specks)
function blendShadow(p, x, y, rx, c, a) {
  if (rx < 0.6 || a <= 0.01) return;
  const ry = rx * FLOOR;
  for (let yy = -Math.ceil(ry); yy <= Math.ceil(ry); yy++)
    for (let xx = -Math.ceil(rx); xx <= Math.ceil(rx); xx++) {
      const d = Math.hypot(xx / rx, yy / ry);
      if (d >= 1) continue;
      p.blend(Math.round(x + xx), Math.round(y + yy), c, a * (1 - 0.45 * d));
    }
}

export function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed), S = o.seed * 17;
  const SCORCH = mix(C[0], hex("#140f0c"), 0.6), BURNT = mix(C[1], hex("#2a1a10"), 0.6), DEEP = mix(SCORCH, hex("#000000"), 0.45), STEAM = mix(C[7], hex("#e8ece6"), 0.75);
  let t = 0;

  // ---- the gob's fall: height above the floor, and how fast it is coming down
  const fall = (tt) => Math.max(0, SKY - V0 * tt - 0.5 * G * tt * tt);
  const vfall = (tt) => V0 + G * tt;
  // ---- how the pit grows, how deep it is eaten, how the acid sinks into it, and how wide the acid still is
  const pw = (tt) => 5 + W * 0.95 * ease.outCubic(clamp((tt - HIT) / SPREAD));
  const pitD = (tt) => PIT * ease.outCubic(clamp((tt - HIT) / 1.1));
  const level = (tt) => (tt < HIT ? 0 : -1.6 + (PIT + 1.6) * ease.inQuad(smooth(DRY, GONE, tt)));
  const width = (tt) => {
    const L = level(tt), w = pw(tt);
    return L <= 0 ? w : w * Math.sqrt(Math.max(0, 1 - (L / Math.max(0.1, pitD(tt))) ** 2));
  };
  const heat = (tt) => smooth(HIT, HIT + 0.3, tt) * (1 - smooth(GONE - 0.3, GONE + 0.25, tt));
  // a solid 2:1 ring in the air: a colour-stepped band of floor-radius r, one row of it, with no alpha anywhere
function ringSolid(p, cx, cy, r, cols, keep) {
  const n = Math.ceil(r * TAU * 1.4);
  for (let j = 0; j < n; j++) {
    const a = (j / n) * TAU, ca = Math.cos(a), sa = Math.sin(a);
    if (!keep(a)) continue;
    const x = cx + ca * r, y = cy + sa * r * FL, v = 0.5 + 0.5 * sa;
    const c = v > 0.82 ? cols[3] : v > 0.58 ? cols[2] : v > 0.3 ? cols[1] : cols[0];
    p.px(x, y, c);
    p.px(x, y + 1, c);
  }
}
// ---- the crown: the ring's radius and height, its spikes, their tips
  const crownR = (tt) => 4 + 11 * ease.outCubic(clamp((tt - HIT) / 0.16));
  const crownH = (tt) => 5 * Math.sin(Math.PI * clamp((tt - HIT) / WIN));
  const spikeK = (tt) => Math.sin(Math.PI * Math.pow(clamp((tt - HIT - 0.015) / WIN), 0.6));
  const spikes = Array.from({ length: 13 }, () => ({ a: R.range(0, TAU), h: R.range(5, 11), r: R.range(0.85, 1.12) }));
  const spikeAt = (s, tt) => {
    const r = crownR(tt) * s.r, h = crownH(tt), sh = s.h * spikeK(tt), ca = Math.cos(s.a), sa = Math.sin(s.a);
    return { bx: ca * r, bz: sa * r, bh: h, tx: ca * (r + sh * 0.55), tz: sa * (r + sh * 0.55), th: h + sh };
  };

  // ---- a body thrown in 3D, closed form: it flies, comes down and lands at its own depth
  const ball = (q, tt) => {
    const age = tt - q.t0;
    if (age < 0) return null;
    const tl = (q.vh + Math.sqrt(q.vh * q.vh + 2 * q.g * q.h0)) / q.g;
    if (age <= tl) {
      const h = q.h0 + q.vh * age - 0.5 * q.g * age * age;
      return { air: true, x: q.x + q.vx * age, z: q.z + q.vz * age, h, vh: q.vh - q.g * age, tl };
    }
    return { air: false, x: q.x + q.vx * tl, z: q.z + q.vz * tl, h: 0, tl };
  };
  // the burst: acid thrown out every way and up, sparks among it
  const bodies = [];
  for (let i = 0; i < 26; i++) {
    const a = R.range(0, TAU), sp = R.range(35, 155), up = R.range(40, 205);
    bodies.push({ spark: false, t0: HIT, x: R.range(-2, 2), z: R.range(-2, 2), h0: 1.5, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vh: up, g: G, s: R.chance(0.3) ? 2 : 1 });
  }
  for (let i = 0; i < 10; i++) {
    const a = R.range(0, TAU), sp = R.range(60, 190), up = R.range(90, 250);
    bodies.push({ spark: true, t0: HIT, x: R.range(-1.5, 1.5), z: R.range(-1.5, 1.5), h0: 1.2, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vh: up, g: G, s: 1 });
  }
  // beads break off the crown's spikes as they peak
  for (const s of spikes) {
    const tip = spikeAt(s, HIT + 0.09), a = R.range(0, TAU), sp = R.range(18, 55);
    bodies.push({ spark: false, t0: HIT + 0.09, x: tip.tx, z: tip.tz, h0: Math.max(1, tip.th), vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vh: R.range(45, 120), g: G, s: 1 });
  }
  // ---- the sizzle: bright pops on the surface, each spitting a bead or two, and the acid's beads
  const pops = [];
  for (let tt = HIT + 0.18; tt < GONE; tt += R.range(0.06, 0.14)) {
    const w2 = width(tt);
    if (w2 < 3) continue;
    const a = R.range(0, TAU), d = Math.sqrt(R.next()) * w2 * 0.85;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    pops.push({ t0: tt, x, z, s: R.range(0.8, 1.8) });
    for (let j = R.int(1, 3); j > 0; j--) bodies.push({ spark: false, t0: tt, x, z, h0: 1, vx: R.range(-40, 40), vz: R.range(-40, 40), vh: R.range(60, 130), g: G, s: 1 });
  }
  // ---- steam: pale wisps curling up off the pit, quick at the burst, thinner as it boils away
  const wisps = [];
  const steam = (tt, x, z, big) =>
    wisps.push({
      t0: tt, x, z, big,
      life: Math.min(R.range(0.5, 0.9) * (big ? 1.3 : 1), meta.duration - 0.05 - tt),
      rise: R.range(24, 34), len: R.range(10, 18) * (big ? 1.3 : 1), amp: R.range(1, 2.5), k: R.range(0.35, 0.6), ph: R.range(0, TAU), drift: R.range(-4, 4),
    });
  for (let i = 0; i < 5; i++) {
    const a = R.range(0, TAU), d = R.range(0, 6);
    steam(HIT, Math.cos(a) * d, Math.sin(a) * d, true);
  }
  for (let tt = HIT + 0.12; tt < GONE; tt += R.range(0.1, 0.22)) {
    const w2 = Math.max(2, width(tt) * 0.9), a = R.range(0, TAU), d = Math.sqrt(R.next()) * w2;
    steam(tt, Math.cos(a) * d, Math.sin(a) * d, R.chance(0.25));
  }
  for (let tt = GONE - 0.1; tt < meta.duration - 0.55; tt += R.range(0.12, 0.2)) {
    const a = R.range(0, TAU), d = Math.sqrt(R.next()) * pw(tt) * 0.7;
    steam(tt, Math.cos(a) * d, Math.sin(a) * d, false);
  }
  // ---- spatter spots: each drop that lands outside the pit etches a little 2:1 patch on the floor
  const stains = [];
  for (const q of bodies) {
    if (q.spark) continue;
    const b = ball(q, 1e3), tl = q.t0 + b.tl;
    if (Math.hypot(b.x, b.z) <= pw(tl)) continue;
    stains.push({ x: b.x, z: b.z, tl, w: q.s * 0.9 + R.range(0.4, 1.4) });
  }

  // ---- the gob: a teardrop stretched by its fall, lit on its upper left, a trail of droplets above it
  const gob = (p) => {
    if (t >= HIT) return;
    const h = fall(t), y = -h, v = vfall(t), st = 1 + v * 0.0022, rx = 3 / Math.sqrt(st), ry = 3.2 * st;
    p.shade(-rx - 1, y - ry - 4, rx + 1, y + ry + 1, (x, yy, out) => {
      const dx = x / rx, dy = (yy - y) / ry, tail = dy < 0 && Math.abs(x) < rx * (1 + dy * 0.9) + 0.4 && dy > -1.7;
      const d = dx * dx + dy * dy;
      if (d > 1.25 && !tail) return;
      out.c = d > 1 && !tail ? C[2] : dx < -0.2 && dy < -0.1 ? C[7] : dy > 0.45 ? C[4] : C[5];
    });
    p.px(-1, y - ry * 0.3, WHITE);
    for (let i = 1; i <= 3; i++) p.dot(0, y - ry - 2 - i * 4, C[5], 1 - i * 0.25);
    p.glow(0, y, 10, C[5], 0.45);
    p.glow(0, y, 4, WHITE, 0.3);
    // its light on the floor, and its shadow tightening under it
    p.glow(0, 0, 12 + h * 0.3, C[4], 0.16 + 0.2 * smooth(0.04, HIT, t));
    blendShadow(p, 0, 0, 1.5 + (SKY - h) * 0.05, C[2], 0.3);
  };

  // ---- the crown, near half or far half: the rim a level 2:1 ring in the air, the wall a curtain of drops below it,
  // the spikes leaning out over the floor with beads on their tips
  const crown = (p, near) => {
    if (t < HIT || t > HIT + WIN) return;
    const r = crownR(t), h = crownH(t), dim = near ? 1 : 0.6;
    // the rim a solid 2-row ring round the open mouth of the spray
    for (const row of [0, 1]) ringSolid(p, 0, -h + row, r, [C[3], C[5], C[6], C[7]], (a) => Math.sin(a) < 0 !== near);
    // the wall a curtain of acid below the rim: solid colour steps, two px wide, thinning to spray at the top
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      if (sa < 0 === near) continue;
      const x = ca * r, yb = sa * r * FL;
      for (let yy = yb - h + 1; yy <= yb; yy += 1) {
        const v = (yy - (yb - h)) / Math.max(1, h);
        const cc = v < 0.3 ? C[4] : v < 0.62 ? C[5] : C[6];
        p.px(x, yy, cc);
        if (v < 0.72 || Math.abs(ca) > 0.35) p.px(x + (ca < 0 ? -1 : 1), yy, v < 0.62 ? C[3] : C[5]);
      }
    }
    for (const s of spikes) {
      if (Math.sin(s.a) < 0 !== near) continue;
      const q = spikeAt(s, t);
      p.line(q.bx, q.bz * FL - q.bh, q.tx, q.tz * FL - q.th, near ? C[6] : C[4]);
      p.line(q.bx + 1, q.bz * FL - q.bh, (q.bx + q.tx) / 2 + 0.5, (q.bz * FL - q.bh + q.tz * FL - q.th) / 2, near ? C[5] : C[3]);
      if (t < HIT + 0.09) {
        p.px(q.tx, q.tz * FL - q.th - 1, near ? C[7] : C[5]);
        p.px(q.tx + 1, q.tz * FL - q.th - 1, C[5]);
      }
    }
    p.glow(0, -h, r * 1.5 + 8, C[5], 0.3 * dim);
  };

  // ---- the pit: an irregular bowl of eaten floor with a sooty lip, the acid lying in it as a dark skin lit in veins
  // and along its ragged edge; the far half is dimmer, as a floor thing's is
  const pit = (p) => {
    if (t <= HIT + 0.08) return;   // while the white hero frame covers the point, so the pit never peeks round it
    const w = pw(t);
    if (w < 1) return;
    const fade = 1 - smooth(meta.duration - 0.6, meta.duration - 0.08, t), hk = heat(t);
    if (fade <= 0.12) return;
    const sc = 0.12 + 0.88 * fade, rx = w * 1.06 * sc, ry = rx * FL;   // the patch shrinks as it cools away
    const rag = (ang) => 1 + 0.1 * ringNoise(ang, 2.2, S + 2) + 0.06 * ringNoise(ang, 6, S + 3);
    for (let y = -Math.ceil(ry * 1.15); y <= Math.ceil(ry * 1.15); y++)
      for (let x = -Math.ceil(rx * 1.15); x <= Math.ceil(rx * 1.15); x++) {
        const dx = (x + 0.5) / rx, dy = (y + 0.5) / ry, d = Math.sqrt(dx * dx + dy * dy) / rag(Math.atan2(dy, dx));
        if (d > 1.13) continue;
        const far = dy < 0;                       // the far half of the pit is one step lighter, never translucent
        if (far && d > 0.74) continue;            // and its thin far rim is not drawn: the lit far lip of the bowl is the acid skin's edge
        if (d > 1) { p.blend(x, y, BURNT, fade * 0.4); continue; }   // the sooty halo round the lip
        const deep = w > 12.5;                    // a small pit is not deep enough to read as black yet
        const cool = smooth(0.9, 0.45, fade);     // as the acid boils off the floor shows a burnt patch, not a void
        const c = d > 0.88 ? mix(BURNT, C[2], 0.55) : d > 0.66 || !deep ? mix(SCORCH, C[2], 0.66) : mix(DEEP, mix(BURNT, C[2], 0.4), cool);   // thin rings stay above near-black
        p.px(x, y, far ? mix(c, C[2], 0.72) : c);   // the far half is lighter still, so no near-black tone is left on it
      }
    // the acid: a dark skin in the bowl, chartreuse light in its veins and a hot edge where it still eats
    const aw = width(t);
    if (t < GONE && aw > 1.5) {
      const ax = aw * 0.97, ay = ax * FL;
      for (let y = -Math.ceil(ay); y <= Math.ceil(ay); y++)
        for (let x = -Math.floor(ax); x <= Math.floor(ax); x++) {
          const dx = (x + 0.5) / ax, dy = (y + 0.5) / ay, d = Math.sqrt(dx * dx + dy * dy) / rag(Math.atan2(dy, dx));
          if (d > 1) continue;
          const far = dy < -0.15, n = noise2(x * 0.35, y * 0.8 + t * 0.8, S + 6) + 0.5 * noise2(x * 0.14 - t * 1.4, y * 0.4, S + 7);
          const edge = d > 0.8, lip = 0.55 + 0.45 * ringNoise(Math.atan2(dy, dx), 4.5, S + 11);
          let c = n > 0.9 ? C[6] : n > 0.62 ? C[5] : n > 0.3 ? (far ? C[2] : C[4]) : far ? C[2] : C[3];
          if (edge) c = hk > 0.4 ? (lip > 0.72 ? C[7] : lip > 0.42 ? C[6] : C[5]) : hk > 0.12 ? C[5] : C[3];
          // crisp, opaque skin: no ordered-dither checkerboard inside the pool
          p.px(x, y, c);
        }
      // eating streaks: a few hairlines of burnt floor running out of the lip, so the outline is not a clean ellipse
      for (let i = 0; i < 16; i++) {
        const a = TAU * (i / 16) + 0.2, r0 = 1.02 + 0.06 * ringNoise(a, 3.5, S + 23), len = 2 + 5 * (0.5 + 0.5 * ringNoise(a, 7, S + 31));
        for (let r = 0; r < len; r += 1) {
          const rr = r0 * rx + r, th = mix(SCORCH, C[2], hk > 0.15 ? 0.72 : 0.78);   // burnt, but never a near-black hairline on lit ground
          p.blend(Math.cos(a) * rr, Math.sin(a) * rr * FL, th, fade * (0.7 - r / len) * (Math.sin(a) < 0 ? 0.6 : 1));
        }
      }
      // specular beads of light on the skin, moving with the churn
      for (let i = 0; i < 7; i++) {
        const a = TAU * (i / 7) + t * 1.1, r = 0.55 + 0.3 * Math.sin(t * 1.7 + i);
        p.px(Math.cos(a) * ax * r, Math.sin(a) * ay * r, C[7]);
      }
    }
    // light: the acid eating the floor, the hot lip at both ends of the ellipse, cooling at the end
    p.glow(0, 0, rx * 1.2 + 6, C[4], 0.18 * hk);
    p.glow(0, 0, rx * 0.6, C[6], 0.12 * hk);
    if (hk > 0.05) for (const sd of [-1, 1]) p.glow(0, sd * ry * 0.86, 8, C[6], 0.3 * hk);
  };

  // ---- a drop or a spark in flight, at its own depth; it lands and leaves a spot (drawn on the floor)
  const fly = (p, q, near) => {
    const b = ball(q, t);
    if (!b || !b.air) return;
    if (b.z < 0 === near) return;
    const x = b.x, y = b.z * FL - b.h;
    if (q.spark) {
      const sx = x - q.vx * 0.012, sy = y - (q.vz * FL - b.vh) * 0.012;
      p.px(x, y, q.h > 4 ? C[7] : C[6]);
      p.dot(sx, sy, C[5], 0.8);
      p.dot(x - q.vx * 0.024, y - (q.vz * FL - b.vh) * 0.024, C[4], 0.5);
      p.glow(x, y, 3, C[6], 0.3);
    } else {
      p.px(x, y, b.h > 3 ? C[7] : C[6]);
      const l = Math.hypot(q.vx, q.vz * FL - b.vh) || 1;
      p.dot(x - (q.vx / l) * 1.5, y - ((q.vz * FL - b.vh) / l) * 1.5, C[5], 0.7);
      p.dot(x - (q.vx / l) * 2.8, y - ((q.vz * FL - b.vh) / l) * 2.8, C[4], 0.45);
    }
  };
  // ---- the spatter spots: a bright bead cooling to burnt soot as the acid spends itself
  const spatter = (p) => {
    const fade = 1 - smooth(meta.duration - 0.6, meta.duration - 0.08, t);
    for (const s of stains) {
      const age = t - s.tl;
      if (age < 0) continue;
      const k = (1 - smooth(1, 1.8, age)) * fade;
      if (k <= 0.01) continue;
      const c = age < 0.15 ? C[7] : age < 0.5 ? C[6] : age < 0.9 ? C[4] : mix(BURNT, C[2], 0.5);
      const y = s.z * FL, ry = Math.max(0.5, s.w * FL);
      for (let yy = -Math.ceil(ry); yy <= Math.ceil(ry); yy++)
        for (let xx = -Math.ceil(s.w); xx <= Math.ceil(s.w); xx++) {
          const d = Math.hypot(xx / s.w, yy / ry);
          if (d >= 1) continue;
          p.blend(Math.round(s.x + xx), Math.round(y + yy), c, k * 0.8 * (1 - 0.3 * d));
        }
      if (age < 0.5) p.glow(s.x, y, 5, C[5], 0.3 * (1 - age / 0.5) * fade);
    }
  };
  // ---- steam wisps: thin, pale, curling up from the pit at their own depth
  const wisp = (p, q, near) => {
    const age = t - q.t0;
    if (age < 0 || age >= q.life) return;
    if (q.z < 0 === near) return;
    const u = age / q.life, head = q.rise * age, tail = Math.max(0, head - q.len);
    const fade = smooth(0, 0.15, u) * (1 - smooth(0.4, 1, u)), y0 = q.z * FL - 1;
    for (let hh = tail; hh <= head; hh += 0.5) {
      const s = (hh - tail) / Math.max(1, head - tail);
      const x = q.x + q.amp * Math.sin(hh * q.k + q.ph) * (0.2 + s) + q.drift * age;
      p.blend(x, y0 - hh, STEAM, fade * Math.sin(Math.PI * s) * 0.55);
    }
  };
  const sizzle = (p, near) => {
    for (const q of pops) {
      const age = t - q.t0;
      if (age < 0 || age > 0.1) continue;
      if (q.z < 0 === near) continue;
      const k = age / 0.1, y = q.z * FL, s = q.s;
      p.px(q.x, y, WHITE);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1]]) p.dot(q.x + dx * (1 + k * 2) * s, y + dy * (1 + k * 2) * s * 0.6, C[7], 1 - k);
      p.glow(q.x, y, 4, C[6], 0.4 * (1 - k));
    }
  };

  return {
    update(dt) { t += dt; },
    drawBack(p) {
      pit(p);
      spatter(p);
      crown(p, false);
      for (const q of bodies) fly(p, q, false);
      for (const q of wisps) wisp(p, q, false);
      sizzle(p, false);
    },
    draw(p) {
      gob(p);
      crown(p, true);
      // the hero frame: a flat white burst where it lands
      const e = t - HIT;
      if (e >= 0 && e < 0.07) {
        const k = 1 - e / 0.07, rr = 6 + 6 * (1 - k);
        p.ellipse(0, 0, rr, rr * FL, k > 0.5 ? WHITE : C[7]);
        sparkle(p, 0, -4, 8 * k, C[7], C[6], 0.6);
      }
      const hk = heat(t);
      if (hk > 0.05) p.glow(0, -3, 16, C[5], 0.2 * hk);
      for (const q of bodies) fly(p, q, true);
      for (const q of wisps) wisp(p, q, true);
      sizzle(p, true);
    },
  };
}
