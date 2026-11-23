// Force field for the game's 2:1 isometric camera: scifi/force-field rewritten for the floor the game sees, not its
// picture squashed, stretched or scaled. The recipe is the source's: a glassy dome of hex plates over the hero,
// plates glinting, tracers slamming into it, a ripple and cracks of light racing over it, sparks glancing off. What
// changed is the world it happens in:
//   - the dome is a hemisphere standing on the floor round the caster, worked out per pixel in 3D (x across, z into
//     the floor toward us, h up; on screen x, z / 2 - h): its foot is a 2:1 ring of emitters on the floor, its far
//     half behind him, its near half (glass he shows through) in front;
//   - it is a one-shot with a life: the emitter ring draws itself round the floor, the plates switch on row by row
//     from the floor up, it holds while shots hit it, then the plates switch off from the top down, flickering, and
//     the emitters go out one by one: no fade of the picture;
//   - the shots come from wherever the enemies are (`from`: angles round him on the floor, 0 = right, + toward us),
//     the ripples run over the sphere from where they hit, and the sparks glance off its curve in 3D and fall to the
//     floor at their own depth.
// The caster is the game's own character (it stands at the origin): the effect draws no stand-in.
// 1 px = 1 character sprite px (32 x 16 px tiles).
import { Lights, P, Rng, fit, sparkle, bolt, forks, clamp, smooth, rand, hex, TAU, WHITE } from "../../core/index.js";
import { floorLight } from "../fire/_lib.js";
import { Fly3 } from "../_iso.js";

export const meta = {
  name: "Force field (iso)",
  desc: "scifi/force-field on the 2:1 floor: a dome of hex plates builds up from a ring of emitters round the hero, shrugs off shots from all round, then switches off plate by plate.",
  tags: ["scifi", "shield", "barrier", "dome", "hex", "hit", "defense", "one-shot", "iso", "top-down"],
  size: [300, 236],
  origin: [150, 152],
  duration: 3.8,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: {
    palette: ["#0b1030", "#152a63", "#1d4f9e", "#2582d2", "#36b9ee", "#8ae8ff", "#d4fbff", "#ffffff"],
    sparks: ["#fff3a6", "#ffe26b", "#ff8a2a", "#f2561d"],
    radius: 44,
    from: [-0.25, 2.55, 0.85],
    seed: 5,
  },
};

const FL = 0.5, S3 = Math.sqrt(3), HALF = Math.PI / 2;
const G = 6.3, KY = 1.12;   // hex plates per radian of longitude, and their stretch in latitude
const RING0 = 0, RING1 = 0.28, UP0 = 0.24, UP1 = 0.78, DOWN0 = 3.0, DOWN1 = 3.5, END = 3.8;
// the camera looks along (0, 2, 1) in (x, z, h): a surface faces us when 2 nz + nh > 0
const V = [0, 2 / Math.sqrt(5), 1 / Math.sqrt(5)];

/**
 * A ring lying level (2:1) drawn solid: colour steps across its thickness, no ordered-dither alpha. cols runs dark
 * inner .. bright outer lip.
 */
function ringBand(p, cx, cy, r, thickness, cols, keep) {
  const th = Math.max(2, thickness);
  if (r < 1) return;
  const n = Math.ceil(r * TAU * 1.4);
  for (let j = 0; j < n; j++) {
    const g = (j / n) * TAU;
    if (keep && !keep(g)) continue;
    const ca = Math.cos(g), sa = Math.sin(g) * FL;
    for (let o = 0; o < th; o += 0.5) {
      const u = o / th, c = u < 0.2 ? cols[3] : u < 0.45 ? cols[2] : u < 0.75 ? cols[1] : cols[0];
      if (c) p.px(cx + ca * (r - o), cy + sa * (r - o), c);
    }
  }
}

// the pointy-top hex (corner radius 1) under grid point (gx, gy): its axial coords and center, how near its edge
// (1 on it) and how near one of its corners (0 on it)
function cell(gx, gy) {
  const fq = (S3 / 3) * gx - gy / 3, fr = (2 / 3) * gy, fs = -fq - fr;
  let q = Math.round(fq), r = Math.round(fr);
  const s = Math.round(fs), dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  const hx = S3 * (q + r / 2), hy = 1.5 * r, dx = gx - hx, dy = gy - hy, ax = Math.abs(dx);
  const e = Math.max(ax, Math.abs(ax / 2 + (dy * S3) / 2), Math.abs(ax / 2 - (dy * S3) / 2)) / (S3 / 2);
  const k = Math.round((Math.atan2(dy, dx) - Math.PI / 6) / (Math.PI / 3)), ca = Math.PI / 6 + (k * Math.PI) / 3;
  return { q, r, hy, e, corner: Math.hypot(dx - Math.cos(ca), dy - Math.sin(ca)) };
}
// a point on the dome (unit normal n, radius R) on the screen
const scr = (R, n) => [R * n[0], R * n[1] * FL - R * n[2]];
const unit = (lon, lat) => [Math.cos(lat) * Math.sin(lon), Math.cos(lat) * Math.cos(lon), Math.sin(lat)];

// every pixel of the near and far shell, worked out once: where the view ray through it meets the hemisphere, its
// normal, longitude (0 toward us) and latitude, its plate, and whether it's a seam, a plate's lit edge or the outline
const shells = new Map();
function shell(R) {
  let g = shells.get(R);
  if (g) return g;
  const near = [], far = [], N = Math.ceil(R) + 1, Y0 = -Math.ceil(R * 1.12) - 1, Y1 = Math.ceil(R * FL) + 1, W = 2 * N + 1, ids = [new Map(), new Map()];
  for (let y = Y0; y <= Y1; y++)
    for (let x = -N; x <= N; x++) {
      const X = x + 0.5, Y = y + 0.5, disc = Y * Y - 5 * (X * X + Y * Y - R * R);
      if (disc < 0) continue;
      for (const s of [1, -1]) {
        const z = (Y + s * Math.sqrt(disc)) / 2.5, h = 0.5 * z - Y;
        if (h < 0) continue;
        const n = [X / R, z / R, h / R], lon = Math.atan2(n[0], n[1]), lat = Math.asin(clamp(n[2], -1, 1));
        const c = cell(lon * G, lat * G * KY), id = c.q * 1000 + c.r, facing = n[0] * V[0] + n[1] * V[1] + n[2] * V[2];
        (s > 0 ? near : far).push({ x, y, n, lon, lat, q: c.q, r: c.r, id, plat: clamp(c.hy / (G * KY), 0, HALF), e: c.e, corner: c.corner, rim: 1 - Math.abs(facing) });
        ids[s > 0 ? 0 : 1].set((y - Y0) * W + x + N, id);
      }
    }
  [near, far].forEach((list, i) => {
    const at = (x, y) => ids[i].get((y - Y0) * W + x + N);
    for (const q of list) {
      const r = at(q.x + 1, q.y), d = at(q.x, q.y + 1), l = at(q.x - 1, q.y), u = at(q.x, q.y - 1);
      q.seam = (r !== undefined && r !== q.id) || (d !== undefined && d !== q.id);
      q.bevel = !q.seam && ((l !== undefined && l !== q.id) || (u !== undefined && u !== q.id));
      // the outline: an edge of the near shell that isn't its foot on the floor
      q.edge = i === 0 && q.n[2] * R > 1.5 && (r === undefined || l === undefined || u === undefined || (d === undefined && q.n[1] < 0));
    }
  });
  shells.set(R, (g = { near, far }));
  return g;
}

export function create(o) {
  const C = fit(o.palette, 8), SP = fit(o.sparks, 4), R = o.radius, S = o.seed, rn = new Rng(S);
  const fly = new Fly3({ rng: rn, sparks: SP }), lights = new Lights(), { near: NEAR, far: FAR } = shell(R);
  const SMOKE = hex("#5b5f78");
  // the shots: a heavy one that cracks the shell, then lighter ones it shrugs off, each from its own side
  const SHOTS = [0.95, 1.75, 2.35].map((t, i) => {
    const az = o.from[i % o.from.length] + rn.range(-0.12, 0.12), lat = [0.62, 0.3, 0.45][i], big = i === 0;
    const n = [Math.cos(lat) * Math.cos(az), Math.cos(lat) * Math.sin(az), Math.sin(lat)];
    // in from far out on that side, coming down a little
    const d = [Math.cos(az), Math.sin(az), 0.22], dl = Math.hypot(...d);
    const p0 = [n[0] * R + (d[0] / dl) * 92, n[1] * R + (d[1] / dl) * 92, n[2] * R + (d[2] / dl) * 92];
    return { t, n, big, p0, hit: [n[0] * R, n[1] * R, n[2] * R], vis: n[0] * V[0] + n[1] * V[1] + n[2] * V[2] > 0, fired: false };
  });
  // the fractures of the heavy hit: jagged forked paths out from it over the plates, laid out by longitude and
  // latitude so they bend with the dome; each point knows how far along it is, so they race out from the hit
  const cracks = [];
  {
    const s = SHOTS[0], lon0 = Math.atan2(s.n[0], s.n[1]), lat0 = Math.asin(s.n[2]), cr = new Rng(S * 13 + 5);
    const add = (path, u0, u1) => {
      const pts = [];
      for (let i = 0; i < path.length; i++) {
        const [lon, lat] = path[i];
        if (lat < 0.03 || lat > 1.52) break;
        const n = unit(lon, lat);
        pts.push([...scr(R, n), n[0] * V[0] + n[1] * V[1] + n[2] * V[2], u0 + ((u1 - u0) * i) / (path.length - 1)]);
      }
      cracks.push(pts);
    };
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + cr.range(-0.35, 0.35), L = cr.range(0.42, 0.8);
      const path = bolt(cr, lon0, lat0, lon0 + (Math.cos(a) * L) / Math.cos(lat0), lat0 + Math.sin(a) * L, { jag: 0.2, depth: 4 });
      add(path, 0, 1);
      for (const f of forks(cr, path, { count: cr.int(0, 2), len: L * 0.5, jag: 0.25, spread: 0.9 })) {
        const j = path.findIndex((q) => q[0] === f[0][0] && q[1] === f[0][1]), u0 = Math.max(0, j) / (path.length - 1);
        add(f, u0, u0 + 0.5);
      }
    }
  }
  // the emitters round the foot: each lights as the ring reaches it, and goes out last
  const EM = Array.from({ length: 10 }, (_, i) => {
    const g = (i / 10) * TAU + 0.31;
    return { g, x: Math.cos(g) * (R - 0.5), z: Math.sin(g) * (R - 0.5), on: RING0 + (RING1 - RING0) * (((g - HALF + TAU) % TAU) / TAU), off: DOWN1 + 0.02 + rand(S, i, 4) * 0.2, lit: false, out: false };
  });
  // a plate switches on as the build climbs past it, and off (top first) after a flicker
  const onAt = (q) => UP0 + (UP1 - UP0 - 0.08) * (q.plat / HALF) + rand(S, q.q, q.r, 1) * 0.06;
  const offAt = (q) => DOWN0 + (DOWN1 - DOWN0 - 0.15) * (1 - q.plat / HALF) + rand(S, q.q, q.r, 2) * 0.12;
  const glints = (q) => rand(S, q.q, q.r, 3) < 0.2, glintAt = (q) => UP1 + 0.2 + rand(S, q.q, q.r) * (DOWN0 - UP1 - 0.6);

  let t = 0;
  return {
    update(dt) {
      t += dt;
      // the emitters light with a spit of sparks off the floor, and go out with one
      for (const e of EM) {
        if (!e.lit && t >= e.on) {
          e.lit = true;
          for (let i = 0; i < 4; i++) fly.spawn(P.SPARK, e.x, e.z, 1, rn.range(-40, 40), rn.range(-30, 30), rn.range(40, 110), rn.range(0.2, 0.4));
          lights.add(e.x, e.z * FL, 12, C[5], 0.5, 0.2);
        }
        if (!e.out && t >= e.off) {
          e.out = true;
          fly.spawn(P.SMOKE, e.x, e.z, 1, rn.range(-3, 3), rn.range(-3, 3), rn.range(5, 10), rn.range(0.25, 0.4), SMOKE, rn.range(1.5, 2.2));
          for (let i = 0; i < 2; i++) fly.spawn(P.SPARK, e.x, e.z, 1, rn.range(-25, 25), rn.range(-20, 20), rn.range(30, 70), rn.range(0.15, 0.3));
        }
      }
      for (const s of SHOTS) {
        if (s.fired || t < s.t) continue;
        s.fired = true;
        const m = s.big ? 1 : 0.55, [hx, hy] = scr(R, s.n), k = s.vis ? 1 : 0.5;
        lights.add(hx, hy, 56 * m, C[4], 0.45 * k, 0.45);
        lights.add(hx, hy, 12, WHITE, 0.5 * m * k, 0.08);
        lights.add(hx, hy, 22, SP[1], 0.4 * m * k, 0.15);
        // glancing off the curve: the shot's way, turned by the shell, sprayed, then falling to the floor
        const din = [s.hit[0] - s.p0[0], s.hit[1] - s.p0[1], s.hit[2] - s.p0[2]], dl = Math.hypot(...din), u = din.map((v) => v / dl);
        const dn = u[0] * s.n[0] + u[1] * s.n[1] + u[2] * s.n[2], rf = u.map((v, i) => v - 2 * dn * s.n[i]);
        const at = s.hit.map((v, i) => v + s.n[i] * 1.5);
        for (let i = 0; i < 26 * m; i++) {
          const sp = rn.range(90, 200) * (0.7 + 0.3 * m), j = [rn.range(-0.6, 0.6), rn.range(-0.6, 0.6), rn.range(-0.3, 0.7)];
          fly.spawn(P.SPARK, at[0], at[1], at[2], (rf[0] + j[0]) * sp, (rf[1] + j[1]) * sp, (rf[2] + j[2]) * sp, rn.range(0.3, 0.8));
        }
        for (let i = 0; i < 7 * m; i++) {
          const sp = rn.range(30, 80);
          fly.spawn(P.MOTE, at[0], at[1], at[2], (rf[0] + rn.range(-1, 1)) * sp, (rf[1] + rn.range(-1, 1)) * sp, (rf[2] + rn.range(-0.5, 1)) * sp, rn.range(0.3, 0.6), rn.pick([C[5], C[6], C[4]]), 0.7);
        }
        for (let i = 0; i < 3 * m; i++) fly.spawn(P.STAR, at[0] + rn.range(-5, 5), at[1] + rn.range(-5, 5), at[2] + rn.range(-4, 4), 0, 0, 4, rn.range(0.3, 0.5), C[6], rn.range(1, 2), { delay: 0.04 + i * 0.07 });
        for (let i = 0; i < 3 * m; i++) fly.spawn(P.SMOKE, at[0] + s.n[0] * 2, at[1] + s.n[1] * 2, at[2], s.n[0] * rn.range(8, 20), s.n[1] * rn.range(8, 20), rn.range(4, 14), rn.range(0.9, 1.3), SMOKE, rn.range(2.2, 3.4), { delay: 0.03 + i * 0.04 });
      }
      // the plates glint as they switch off: a star off one here and there
      if (t > DOWN0 && t < DOWN1 && rn.chance(10 * dt)) {
        const q = NEAR[rn.int(0, NEAR.length - 1)];
        if (Math.abs(t - offAt(q)) < 0.1) fly.spawn(P.STAR, q.n[0] * R, q.n[1] * R, q.n[2] * R, 0, 0, 3, 0.3, C[6], 1.2);
      }
      fly.update(dt);
      lights.update(dt);
      fly.cap(Math.max(0.001, END - 0.05 - t));
    },
    drawBack(p) {
      // the floor inside the ring takes the dome's cold light while it stands
      const up = smooth(UP0, UP1, t) * (1 - smooth(DOWN0, DOWN1, t));
      floorLight(p, 0, 0, R, R * FL, C[3], 0.22 * up);
      foot(p, false);
      surface(p, FAR, false);
      tracers(p, false);
      fly.draw(p, (q) => q.z < 0);
    },
    draw(p) {
      surface(p, NEAR, true);
      foot(p, true);
      fractures(p);
      tracers(p, true);
      for (const s of SHOTS) {
        const age = t - s.t, [hx, hy] = scr(R, s.n), m = s.big ? 1 : 0.6;
        if (age >= 0 && age < 0.14 && s.vis) sparkle(p, hx, hy, (7 * (1 - age / 0.14) + 1) * m, C[6], C[5], 0.4);
      }
      const up = smooth(UP0, UP1, t) * (1 - smooth(DOWN0, DOWN1, t));
      if (up > 0) p.glow(0, -R * 0.5, R * 1.3, C[3], 0.1 * up + 0.1 * Math.max(0, 1 - (t - SHOTS[0].t) * 2) * (t > SHOTS[0].t ? 1 : 0));
      fly.draw(p, (q) => q.z >= 0);
      lights.draw(p);
    },
  };

  // the dome's foot: a 2:1 ring on the floor that draws itself round from the front, emitters on it chasing light
  function foot(p, near) {
    const keep = (g) => Math.sin(g) >= 0 === near;
    const drawn = clamp((t - RING0) / (RING1 - RING0)), gone = clamp((t - DOWN1 - 0.05) / 0.22);
    if (drawn > 0 && gone < 1)
      ringBand(p, 0, 0, R + 1, 2.5, [C[1], C[3], C[5], C[6]], (g) => keep(g) && within(g, drawn, gone));
    for (const [i, e] of EM.entries()) {
      if (!keep(e.g) || t < e.on || t >= e.off + 0.06) continue;
      const k = t >= e.off ? (Math.floor(t * 30) % 2 ? 0.2 : 0.8) : 0.5 + 0.5 * Math.cos(TAU * (2 * (t / 2.4) - i / 10)), y = e.z * FL;
      p.px(e.x - 1, y, C[2]);
      p.px(e.x + 1, y, C[2]);
      p.px(e.x, y, t - e.on < 0.06 || k > 0.6 ? WHITE : C[5]);
      p.px(e.x, y - 1, k > 0.6 ? C[6] : C[4]);
      p.glow(e.x, y - 1, 6 + 4 * k, C[4], (near ? 0.25 : 0.15) * (0.4 + k));
    }
  }
  // the ring is drawn from the front (g = pi/2) both ways round, and cleared the same way at the end
  function within(g, drawn, gone) {
    const d = Math.abs(((g - HALF + Math.PI * 3) % TAU) - Math.PI) / Math.PI;
    return d <= drawn && d >= gone;
  }

  // the shell, near or far: plates switching on from the floor up, ripples from the hits, glints, the scan, plates
  // switching off from the top down
  function surface(p, list, near) {
    if (t < UP0 || t > DOWN1 + 0.1) return;
    const ages = SHOTS.map((s) => t - s.t);
    const fr = clamp((t - UP0) / (UP1 - UP0 - 0.08)) * HALF;   // the latitude the build has climbed to
    const sk = clamp((t - 2.55) / 0.4), scanLat = -0.2 + sk * 2, scanK = Math.sin(Math.PI * sk);
    for (const q of list) {
      const on = onAt(q), off = offAt(q);
      if (t < on || t > off + 0.14) continue;
      // switching off: the plate flickers, then it's gone
      if (t > off && (Math.floor((t - off) * 30) + q.id) % 2) continue;
      const fresh = t - on < 0.07;   // just switched on: it comes up white
      const ff = q.rim * q.rim;
      let rp = 0, hot = 0;
      for (let i = 0; i < SHOTS.length; i++) {
        const s = SHOTS[i], age = ages[i] / 2.4;
        if (age < 0 || age >= 1) continue;
        const d = Math.acos(clamp(q.n[0] * s.n[0] + q.n[1] * s.n[1] + q.n[2] * s.n[2], -1, 1)), f = 0.06 + 3.1 * age, k = (1 - age) * (s.big ? 1 : 0.7);
        rp = Math.max(rp, Math.exp(-(((d - f) / 0.15) ** 2)) * k, d < f ? 0.22 * k * k * (1 - d / f) : 0);
        const hr = s.big ? 0.3 : 0.17;
        if (age < 0.55 && d < hr) hot = Math.max(hot, age < 0.07 && d < hr * 0.75 ? 2 : (1 - age / 0.55) ** 1.5 * (1.1 - (0.6 * d) / hr));
      }
      let gl = 0;
      if (glints(q)) {
        const a = t - glintAt(q);
        if (a > 0 && a < 0.45) gl = 1 - a / 0.45;
      }
      // the build front: a line of light at the latitude it has climbed to
      const front = t < UP1 ? Math.exp(-(((q.lat - fr) / 0.05) ** 2)) : 0;
      const sc = scanK * Math.exp(-(((q.lat - scanLat) / 0.09) ** 2)) + front;
      if (!near) {
        // the far side, seen through the glass: dim seams, a breath of tint
        if (q.seam) p.blend(q.x + 0.5, q.y + 0.5, rp > 0.3 || fresh ? C[5] : C[3], clamp(0.18 + 0.25 * ff + 0.6 * rp + 0.3 * sc));
        else p.blend(q.x + 0.5, q.y + 0.5, C[2], 0.04 + 0.06 * ff + 0.15 * rp);
        continue;
      }
      if (q.edge) {
        // the outline: a hard bright edge, whiter where the light catches it (from the top left)
        const lit = -q.n[0] * 0.55 + q.n[2] * 0.85;
        p.px(q.x, q.y, fresh || rp > 0.4 || lit > 0.8 ? WHITE : lit > 0.3 ? C[6] : C[5]);
        p.light(q.x, q.y, C[4], 0.3);
        continue;
      }
      if (hot >= 2 || (fresh && q.seam)) {
        p.px(q.x, q.y, q.seam ? C[6] : WHITE);
        continue;
      }
      if (q.seam) {
        const I = 0.12 + 0.5 * ff + 0.08 * Math.sin(q.lon * 2.3 + q.lat * 3 - t * 2.6) + (q.corner < 0.32 ? 0.18 : 0) + 0.9 * gl + 0.7 * sc + 1.3 * rp + hot;
        // a plate edge is a real line: inked solid in one colour step, never a half-lit dither
        if (I > 0.3) p.px(q.x, q.y, gl > 0.6 || rp > 0.55 || hot > 0.5 ? WHITE : I > 0.85 ? C[6] : I > 0.55 ? C[5] : C[4]);
        p.light(q.x, q.y, C[4], 0.04 + 0.08 * Math.min(1, I));
      } else {
        // the glass: thin face-on, thicker toward the outline, a lit top-left edge on every plate
        const a = 0.05 + 0.34 * ff * q.rim + 0.1 * q.e ** 4 + (q.bevel ? 0.12 + 0.2 * ff : 0) + 0.35 * gl + 0.1 * sc + 0.3 * rp + 0.6 * hot + (fresh ? 0.3 : 0);
        const c = hot > 0.6 || fresh ? WHITE : hot > 0.3 || gl > 0.5 ? C[6] : rp > 0.4 || q.bevel ? C[5] : ff > 0.5 ? C[4] : C[3];
        p.blend(q.x + 0.5, q.y + 0.5, c, clamp(a));
        if (rp > 0.1 || hot > 0 || gl > 0) p.light(q.x, q.y, C[4], 0.06 * (rp + hot + gl));
      }
    }
  }

  // the fractures of the heavy hit: race out white-hot, cool down the ramp and heal over; only where the shell
  // faces us (the rest are behind the glass, fainter)
  function fractures(p) {
    const age = t - SHOTS[0].t;
    if (age < 0 || age >= 0.9) return;
    const reach = clamp(age / 0.09);
    for (const pass of [0, 1])
      for (const c of cracks)
        for (let i = 1; i < c.length; i++) {
          const [x0, y0, f0] = c[i - 1], [x1, y1, f1, u] = c[i];
          if (u > reach || f0 < 0.05 || f1 < 0.05) continue;
          // the crack heals segment by segment as it cools: whole segments retire, nothing is dithered away
          if (age > 0.34 + 0.5 * ((i * 7 + c.length * 3) % 10) / 10) continue;
          if (pass === 0) {
            if (age < 0.3) {
              const hc = age < 0.12 ? C[6] : C[5];
              for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.line(x0 + ox, y0 + oy, x1 + ox, y1 + oy, hc);
            }
            continue;
          }
          p.line(x0, y0, x1, y1, age < 0.12 + u * 0.08 ? WHITE : age < 0.3 + u * 0.1 ? C[6] : C[5]);
          if (i % 3 === 0) p.glow(x1, y1, 6, C[4], 0.35 * (1 - smooth(0.35, 0.9, age)) * (1 - u * 0.5));
        }
  }

  // the tracers, in from where the shooters are: a streak racing in to the shell, behind him or in front
  function tracers(p, near) {
    for (const s of SHOTS) {
      const tk = (t - (s.t - 0.12)) / 0.12;
      if (tk < 0 || tk >= 1) continue;
      const at = (k) => {
        const w = clamp(k);
        return [s.p0[0] + (s.hit[0] - s.p0[0]) * w, s.p0[1] + (s.hit[1] - s.p0[1]) * w, s.p0[2] + (s.hit[2] - s.p0[2]) * w];
      };
      const head = at(tk);
      if (head[1] >= 0 !== near) continue;
      const L = 92, pt = (d) => {
        const q = at(tk - d / L);
        return [q[0], q[1] * FL - q[2]];
      };
      const [x, y] = pt(0), [x2, y2] = pt(2), [x7, y7] = pt(7), [x16, y16] = pt(16);
      p.line(x16, y16, x7, y7, SP[3]);
      p.line(x7, y7, x2, y2, SP[1]);
      p.line(x2, y2, x, y, SP[0]);
      p.px(x, y, WHITE);
      p.glow(x, y, 9, SP[1], 0.55);
    }
  }
}
