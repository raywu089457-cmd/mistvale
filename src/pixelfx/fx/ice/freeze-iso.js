// Freeze for the game's 2:1 isometric camera: ice/freeze rewritten for the floor the game sees, not its picture
// squashed, stretched or scaled. The recipe is the source's: frost races in along the floor and climbs the character
// pixel by pixel, a faceted block crystallizes round it pane by pane from the floor up, light slides over its faces,
// it cracks, flashes white and bursts, and the character thaws free. What changed is the world it happens in:
//   - the frost is a 2:1 patch closing in on the feet from every side, rime standing up out of it, and it melts
//     away patch by patch;
//   - the block is a crystal in 3D: a seven-sided prism round the character crowned with three pointed crystals.
//     Its foot is a 2:1 outline on the floor; its faces turned away from us are seen through the ice, behind the
//     character, the ones turned to us in front of it, each lit by how it faces the light;
//   - it bursts in 3D: panes and shards fly out every way round, tumble, land at their own depth, shatter and skid,
//     and melt where they lie.
// The character is the game's: pass it as o.actor ({ x, y, w, h, mask, pixels }, its feet at the origin) and it turns
// to ice and thaws; without one only the ice is drawn. 1 px = 1 character sprite px (32 x 16 px tiles).
// The crack-and-burst recipe (cracks walking out from a point, a white frame, the ice flung apart as shards with ice
// dust and glints) is adapted from Sprite Fusion's open-source ice (https://www.spritefusion.com/pixel-art-vfx/ice),
// MIT License, Copyright (c) 2026 Hugo Duprez.
import { Particles, Lights, P, Rng, fit, flare, sparkle, clamp, smooth, seg, ease, rand, mix, noise2, TAU, WHITE, GRAVITY } from "../../core/index.js";
import { Panes, inPoly, splitPoly, iceOf, fractures, drawFractures } from "./_lib.js";
import { pixelSet, setPx, drawSet, ringNoise } from "../_iso.js";

export const meta = {
  name: "Freeze (iso)",
  desc: "ice/freeze on the 2:1 floor: frost closes in and climbs the character, a 3D crystal block sets pane by pane round it, cracks and bursts, and its shards land at their own depth.",
  tags: ["ice", "freeze", "frozen", "status", "crowd-control", "one-shot", "iso", "top-down"],
  size: [184, 136],
  origin: [92, 92],
  duration: 4,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  pixels: 1,
  options: { palette: ["#151a3d", "#212f6b", "#2c58aa", "#3a8bd8", "#62c8f4", "#a6ecff", "#dcfbff", "#ffffff"], seed: 5 },
};

const FL = 0.5;
const SNAP = 0.16; // frost races in along the floor to the feet
const CLIMB = [0.14, 0.62]; // and climbs the character
const SEAL = 0.6; // the block crystallizes, pane by pane from the floor up
const SWEEPS = [1.12, 1.82]; // light slides across the faces while it holds
const CRACK = 2.2, CRACK2 = 2.34, FLASH = 2.46, BURST = 2.52, THAW = 0.36;
const MELT = [2.95, 3.7]; // the floor frost melts
const REACH = 38, CORE = [0, -21];
const LIGHT = [-0.5, 0.32, 0.8]; // where the light comes from: the left, a little toward us, above (x, z, h)
const VIEW = [0, 1 / Math.hypot(1, FL), FL / Math.hypot(1, FL)]; // toward our camera

// the crystal, in 3D (x across, z toward us, h up): a seven-sided prism round the character, its sides standing to
// shoulders of different heights, and three pointed crystals on its top (the side view's crown of three points)
const BASE = [[10, 16, 1], [62, 12.4, 0.96], [112, 12.7, 1.02], [160, 15.5, 0.97], [210, 16, 1], [265, 11.4, 0.95], [318, 13, 1.03]].map(([deg, rz, s], k) => {
  const a = (deg * Math.PI) / 180;
  return [16 * s * Math.cos(a), rz * Math.sin(a) * (k === 1 || k === 2 ? 1 : 0.95), 0];
});
const SHOULDER = [31, 30, 33, 32, 36, 35, 30];
const WAIST = [14, 12, 15, 13, 16, 13, 15];   // a ring half a step round from the others, bulging a little: the sides cut into facets
const CROWN = [
  { c: [-9, -1], r: [6, 5], h: 29, apex: [-12.5, -3, 45] },
  { c: [0, 1], r: [7.5, 6], h: 31, apex: [0, 2, 53] },
  { c: [9.5, -2], r: [6, 5], h: 30, apex: [12.5, -2, 47] },
];

// the crystal's faces, part by part (each part convex): every face's corners in 3D. Its sides are two bands of
// triangles between the foot, a waist ring turned half a step and the shoulders, so they break into facets that
// each catch the light their own way, as a crystal's do
function buildCrystal() {
  const parts = [];
  const S = BASE.map(([x, z], k) => [x * 0.94, z * 0.94, SHOULDER[k]]);
  const n = BASE.length, prism = [];
  const M = BASE.map((b, k) => {
    const c = BASE[(k + 1) % n], a = Math.atan2(b[1] + c[1], b[0] + c[0]), r = (Math.hypot(b[0], b[1]) + Math.hypot(c[0], c[1])) / 2;
    return [r * 1.07 * Math.cos(a), r * 1.07 * Math.sin(a), WAIST[k]];
  });
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n, km = (k + n - 1) % n;
    prism.push([BASE[k], BASE[k1], M[k]], [M[km], BASE[k], M[k]]);
    prism.push([M[km], M[k], S[k]], [S[k], M[k], S[k1]]);
  }
  const top = [S.reduce((s, q) => s + q[0], 0) / n, S.reduce((s, q) => s + q[1], 0) / n, S.reduce((s, q) => s + q[2], 0) / n + 2];
  for (let k = 0; k < n; k++) prism.push([S[k], S[(k + 1) % n], top]);
  parts.push(prism);
  for (const cr of CROWN) {
    const [cx, cz] = cr.c, [hx, hz] = cr.r, q = [[cx + hx, cz, cr.h], [cx, cz + hz, cr.h], [cx - hx, cz, cr.h], [cx, cz - hz, cr.h]], faces = [];
    for (let k = 0; k < 4; k++) faces.push([q[k], q[(k + 1) % 4], cr.apex]);
    parts.push(faces);
  }
  return parts;
}

export function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed), A = o.actor ?? null, S0 = o.seed * 5;
  const ps = new Particles({ rng: R, ground: () => Infinity, sparks: [C[7], C[6], C[5], C[4]], haze: C[5] }), lights = new Lights();
  const panes = [], shards = [], drawer = new Panes();
  const sx = (q) => q[0], sy = (q) => q[1] * FL - q[2];

  // ---- the crystal's faces: their outlines on screen, how they face us and the light, which pixels they cover,
  // when they set (from the floor up) and where the light sweep finds them
  const FACES = [], EDGES = [];
  buildCrystal().forEach((faces, part) => {
    const all = faces.flat(), mid = [0, 1, 2].map((k) => all.reduce((s, q) => s + q[k], 0) / all.length);
    for (const pts of faces) {
      const c = [0, 1, 2].map((k) => pts.reduce((s, q) => s + q[k], 0) / pts.length);
      const u = [0, 1, 2].map((k) => pts[1][k] - pts[0][k]), v = [0, 1, 2].map((k) => pts[2][k] - pts[0][k]);
      let nrm = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const l = Math.hypot(...nrm) || 1;
      nrm = nrm.map((q) => q / l);
      if (nrm[0] * (c[0] - mid[0]) + nrm[1] * (c[1] - mid[1]) + nrm[2] * (c[2] - mid[2]) < 0) nrm = nrm.map((q) => -q);
      const front = nrm[0] * VIEW[0] + nrm[1] * VIEW[1] + nrm[2] * VIEW[2] > 0;
      const lit = clamp(0.5 + 0.62 * (nrm[0] * LIGHT[0] + nrm[1] * LIGHT[1] + nrm[2] * LIGHT[2]));
      const scr = pts.map((q) => [sx(q), sy(q)]), xs = scr.map((q) => q[0]), ys = scr.map((q) => q[1]);
      const pix = [];
      for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++)
        for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) if (inPoly(scr, x + 0.5, y + 0.5)) pix.push(x, y);
      const F = { part, pts, scr, c, front, lit, pix, depth: c[1] + FL * c[2], at: SEAL + 0.31 * clamp(c[2] / 50) + rand(FACES.length, S0) * 0.03 };
      F.tint = C[3 + Math.round(lit * 3)];
      F.alpha = (0.17 + 0.22 * lit) * (front ? 1 : 0.5);
      F.d = clamp((sx(c) + 0.55 * sy(c) + 36) / 46);
      F.len = scr.reduce((s, q, k) => s + Math.hypot(scr[(k + 1) % scr.length][0] - q[0], scr[(k + 1) % scr.length][1] - q[1]), 0);
      FACES.push(F);
    }
  });
  // every edge of each part once: the faces it joins; an edge between a face toward us and one away is the part's
  // outline; one on the floor is the crystal's foot
  for (const F of FACES)
    F.pts.forEach((a, k) => {
      const b = F.pts[(k + 1) % F.pts.length];
      let e = EDGES.find((e) => e.part === F.part && ((e.a === a && e.b === b) || (e.a === b && e.b === a)));
      if (!e) EDGES.push((e = { part: F.part, a, b, fs: [] }));
      e.fs.push(F);
    });
  for (const e of EDGES) {
    const fronts = e.fs.filter((F) => F.front).length;
    e.outer = fronts === 1 && e.fs.length === 2;
    e.front = fronts > 0;
    e.foot = e.a[2] === 0 && e.b[2] === 0;
    e.at = Math.min(...e.fs.map((F) => F.at));
    // lit where its outline faces up and left on screen
    const [x0, y0] = [sx(e.a), sy(e.a)], [x1, y1] = [sx(e.b), sy(e.b)], F = e.fs[0];
    const cx = F.scr.reduce((s, q) => s + q[0], 0) / F.scr.length, cy = F.scr.reduce((s, q) => s + q[1], 0) / F.scr.length;
    let nx = y1 - y0, ny = x0 - x1;
    if (nx * ((x0 + x1) / 2 - cx) + ny * ((y0 + y1) / 2 - cy) < 0) (nx = -nx), (ny = -ny);
    e.lit = (-nx * 0.55 - ny * 0.84) / (Math.hypot(nx, ny) || 1);
    e.s = [x0, y0, x1, y1];
  }
  const BACKF = FACES.filter((F) => !F.front).sort((a, b) => a.depth - b.depth), FRONTF = FACES.filter((F) => F.front).sort((a, b) => a.depth - b.depth);
  const inBlock = (x, y) => FRONTF.some((F) => inPoly(F.scr, x, y));
  const cracks = fractures(R, inBlock, CORE[0], CORE[1], 3, { len: 9, a0: -2.2, spread: 3.6 });
  const cracks2 = fractures(R, inBlock, CORE[0] + 1, CORE[1] - 2, 6, { len: 16, fork: 0.22 });
  const CORNERS = [...new Set(FRONTF.flatMap((F) => F.scr.map((q) => q.join(","))))].map((s) => s.split(",").map(Number));
  const lastSet = Math.max(...FACES.map((F) => F.at)), crownTip = [sx(CROWN[1].apex), sy(CROWN[1].apex)];

  // ---- the character: each pixel's frozen colour and when the frost reaches it, a randomized flood up from the feet,
  // quicker round the outline, so the front creeps up the edges first in ragged fingers (the source's, unchanged:
  // the character stands upright in both cameras)
  let W = 0, H = 0, order = [], reach = null, ice = null, feathers = [];
  if (A) {
    W = A.w;
    H = A.h;
    const N = W * H, on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && A.mask.data[y * W + x] > 0;
    const dist = new Float32Array(N).fill(Infinity), rim = new Uint8Array(N), open = [];
    ice = new Uint32Array(N);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!on(x, y)) continue;
        const i = y * W + x, up = !on(x - 1, y) || !on(x, y - 1);
        rim[i] = !on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) ? 1 : 0;
        ice[i] = mix(up ? C[Math.min(7, C.indexOf(iceOf(A.pixels[i], C)) + 1)] : iceOf(A.pixels[i], C), C[6], 0.2);
        if ((y === H - 1 || !on(x, y + 1)) && y >= H - 4) (dist[i] = R.range(0, 1.5)), open.push(i);
      }
    const done = new Uint8Array(N);
    while (open.length) {
      let bi = 0;
      for (let j = 1; j < open.length; j++) if (dist[open[j]] < dist[open[bi]]) bi = j;
      const i = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (done[i]) continue;
      done[i] = 1;
      const x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (!on(nx, ny)) continue;
        const j = ny * W + nx, w = (rim[j] ? 0.55 : 1) * (dy < 0 ? 1 : 1.3) + R.range(0, 1.5);
        if (dist[i] + w < dist[j]) (dist[j] = dist[i] + w), open.push(j);
      }
    }
    let maxD = 0;
    for (let i = 0; i < N; i++) if (dist[i] < Infinity) maxD = Math.max(maxD, dist[i]);
    reach = new Float32Array(N);
    for (let i = 0; i < N; i++)
      if (dist[i] < Infinity) {
        reach[i] = CLIMB[0] + (CLIMB[1] - CLIMB[0]) * Math.pow(dist[i] / (maxD || 1), 0.85);
        order.push(i);
      }
    order.sort((a, b) => reach[a] - reach[b]);
    // rime feathers: little ticks of frost standing out from the outline once the frost has passed
    for (const i of order) {
      const x = i % W, y = (i / W) | 0;
      if (!rim[i] || rand(i, o.seed, 3) > 0.42 || y > H - 3) continue;
      const dx = !on(x - 1, y) ? -1 : !on(x + 1, y) ? 1 : rand(i, 9) < 0.5 ? -1 : 1, dy = !on(x, y - 1) ? -1 : rand(i, 4) < 0.5 ? -1 : 0;
      feathers.push({ x: A.x + x + dx, y: A.y + y + dy, dx, dy, L: 1 + Math.floor(rand(i, 7) * 2.6), at: reach[i] + 0.04 });
    }
  }

  // ---- the floor frost: a 2:1 patch closing in on the feet from its ragged rim, its fixed fields worked out once;
  // gone and glints come from smooth fields, never from per-pixel randomness inside the patch
  const FR = Math.ceil(REACH * 1.2), FRY = Math.ceil(FR * FL), FROST = { x: [], y: [], v: [], gone: [] }, TICKS = [], GLINTS = [];
  for (let y = -FRY; y <= FRY; y++)
    for (let x = -FR; x <= FR; x++) {
      const fx = x + 0.5, fz = (y + 0.5) / FL, r = Math.hypot(fx, fz), th = Math.atan2(fz, fx);
      const v = r / (REACH * (1 + 0.14 * ringNoise(th, 1.7, S0 + 1) + 0.08 * ringNoise(th, 7, S0 + 2))) + 0.05 * noise2(fx * 0.15, fz * 0.15, S0 + 3);
      if (v >= 1) continue;
      FROST.x.push(x); FROST.y.push(y); FROST.v.push(v);
      FROST.gone.push(0.9 * clamp(0.5 + 0.75 * (0.6 * noise2(fx * 0.07, fz * 0.07, S0 + 4) + 0.4 * noise2(fx * 0.18, fz * 0.18, S0 + 5))) + 0.1 * clamp(0.5 + 0.5 * noise2(fx * 0.34, fz * 0.34, S0 + 6)));
      // a handful of discrete sparkles, spread evenly but not a stipple
      if (((x * 67 + y * 43 + S0) & 511) === 0) GLINTS.push({ x, y, v });
      // rime: solid crust plates standing out of the patch, grown in clumps, taller nearer the feet
      const clump = clamp(0.5 + 0.6 * noise2(fx * 0.11, fz * 0.11, S0 + 11));
      if (clump > 0.72 && ((x + y) & 1) === 0 && rand(x + 11, y + 23, S0 + 8) < 0.03) TICKS.push({ x, y, v, s: 2 + Math.round(rand(x, y, S0 + 9)), g: FROST.gone[FROST.gone.length - 1] });
    }
  const FSET = pixelSet(FROST.x.length, [-FR, -FRY, FR, FRY]);
  let fKey = "";

  let t = 0, formed = 0, sealed = false, struck = 0, burst = false, white = false;
  const jolt = () => (t >= CRACK && t < CRACK + 0.06 ? 1 : t >= CRACK2 && t < FLASH ? (Math.floor(t * 40) % 2 ? 1 : -1) : 0);
  const arrive = (v) => SNAP * (1 - v);   // the frost reaches a point v of the way out at this time: rim first
  // a shard in 3D (x, z, h): flung, tumbling, bouncing, skidding to rest, melting where it lies
  const shard = (b) => shards.push({ vx: 0, vz: 0, vh: 0, a: R.range(0, TAU), va: R.range(-20, 20), s: 2, rest: false, kind: 0, ...b, max: b.life });

  return {
    update(dt) {
      t += dt;
      // frost lines race in along the floor from every side, vapour riding them
      if (t < SNAP)
        for (let k = 0; k < 3; k++) {
          const a = R.range(0, TAU), c = Math.cos(a), s = Math.sin(a), d = REACH * (1 - t / SNAP);
          if (R.chance(0.1)) ps.spawn(P.VAPOUR, c * d, s * d * FL - R.range(0, 2), -c * R.range(40, 90), -s * R.range(40, 90) * FL - R.range(0, 5), R.range(0.3, 0.5), C[6], R.range(1.4, 2.4));
          if (R.chance(0.4)) {
            const e = d + R.range(0, 6), v = R.range(50, 90);
            ps.spawn(P.STREAK, c * e, s * e * FL - R.range(1, 3), -c * v, -s * v * FL, R.range(0.1, 0.16), R.chance(0.5) ? C[6] : C[5]);
          }
        }
      // stars and motes kicked off the climbing front
      if (A && t > CLIMB[0] && t < CLIMB[1] + 0.03) {
        let lo = 0;
        while (lo < order.length && reach[order[lo]] < t - 0.06) lo++;
        let hi = lo;
        while (hi < order.length && reach[order[hi]] <= t) hi++;
        if (hi > lo && R.chance(0.45)) {
          const i = order[R.int(lo, hi - 1)];
          ps.spawn(P.STAR, A.x + (i % W) + 0.5, A.y + ((i / W) | 0), R.range(-8, 8), -R.range(0, 18), R.range(0.2, 0.42), R.chance(0.5) ? C[6] : WHITE, R.range(0.6, 1.9));
        }
        if (hi > lo && R.chance(0.12)) {
          const i = order[R.int(lo, hi - 1)];
          ps.spawn(P.FLAKE, A.x + (i % W), A.y + ((i / W) | 0), R.range(-20, 20), -R.range(10, 30), R.range(0.5, 0.9), C[6], R.range(0.5, 1.2));
        }
      }
      // each pane snaps into place with a chip of shards flung off it, a puff at the foot and a glint
      const setOrder = [...FACES].sort((a, b) => a.at - b.at);
      while (formed < setOrder.length && t >= setOrder[formed].at) {
        const F = setOrder[formed++], [cx, cz, ch] = F.c;
        for (let i = 0; i < 2; i++) {
          const a = Math.atan2(cz, cx) + R.range(-0.7, 0.7), sp = R.range(40, 100);
          shard({ x: cx, z: cz, h: ch, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vh: R.range(20, 60), drag: 0.8, bounce: 0.3, life: R.range(0.35, 0.7), s: R.range(1, 2.2), c: C[R.int(5, 7)] });
        }
        if (ch < 14) ps.spawn(P.VAPOUR, cx * 1.15, cz * 1.15 * FL - 1, Math.sign(cx || 1) * R.range(10, 30), -R.range(2, 8), R.range(0.5, 0.8), C[6], R.range(2.2, 3.4));
        if (F.front) ps.spawn(P.STAR, sx(F.c) + R.range(-2, 2), sy(F.c) + R.range(-2, 2), 0, -4, R.range(0.25, 0.45), WHITE, R.range(1.2, 2.2));
        lights.add(sx(F.c), sy(F.c), 16, C[6], 0.4, 0.12);
      }
      if (!sealed && formed === FACES.length) {
        sealed = true;
        lights.add(0, -26, 70, C[5], 0.6, 0.4);
        for (let i = 0; i < 5; i++) ps.spawn(P.STAR, R.range(-15, 15), -R.range(6, 44), R.range(-6, 6), -R.range(0, 8), R.range(0.3, 0.6), R.chance(0.5) ? WHITE : C[6], R.range(1, 2.2));
      }
      // while it holds: glints wink on the corners, cold vapour rolls off its foot over the floor, a little snow
      if (sealed && t < CRACK2) {
        if (R.chance(0.035)) {
          const [x, y] = R.pick(CORNERS);
          ps.spawn(P.STAR, x + R.range(-1, 1), y + R.range(-1, 1), 0, -2, R.range(0.3, 0.6), R.chance(0.6) ? C[6] : WHITE, R.range(0.8, 2.2));
        }
        if (R.chance(0.03)) {
          const [bx, bz] = R.pick(BASE), d = Math.hypot(bx, bz) || 1, v = R.range(8, 24);
          ps.spawn(P.VAPOUR, bx, bz * FL - R.range(1, 3), (bx / d) * v, (bz / d) * v * FL - R.range(1, 5), R.range(0.7, 1.1), C[6], R.range(1.8, 3));
        }
        if (R.chance(0.012)) ps.spawn(P.FLAKE, R.range(-30, 30), -R.range(56, 76), R.range(-4, 4), R.range(4, 10), R.range(1.2, 1.8), R.chance(0.5) ? WHITE : C[6], R.range(0.5, 1.4));
      }
      // it cracks: a jolt, chips spall off, light leaks from the cracks
      if (struck === 0 && t >= CRACK) {
        struck = 1;
        lights.add(CORE[0], CORE[1], 26, WHITE, 0.4, 0.1);
        for (let i = 0; i < 4; i++) {
          const a = R.range(0, TAU);
          shard({ x: Math.cos(a) * 12, z: Math.sin(a) * 9, h: R.range(10, 40), vx: Math.cos(a) * R.range(10, 40), vz: Math.sin(a) * R.range(10, 40), vh: R.range(10, 60), drag: 0.6, bounce: 0.3, life: R.range(0.5, 0.9), s: R.range(1, 2), c: C[R.int(5, 7)] });
        }
      }
      if (struck === 1 && t >= CRACK2) {
        struck = 2;
        lights.add(CORE[0], CORE[1], 40, C[6], 0.35, 0.16);
        for (let i = 0; i < 3; i++) ps.spawn(P.STAR, R.range(-12, 12), -R.range(8, 40), 0, -3, R.range(0.15, 0.3), WHITE, R.range(1, 2));
      }
      if (!white && t >= FLASH) {
        white = true;
        lights.add(CORE[0], CORE[1], 60, WHITE, 0.9, 0.1);
      }
      // it bursts: every pane flies off tumbling, out every way round and up, with shards, ice dust, glints and a flurry
      if (!burst && t >= BURST) {
        burst = true;
        lights.add(CORE[0], CORE[1], 64, WHITE, 0.85, 0.14);
        lights.add(CORE[0], CORE[1] - 4, 72, C[4], 0.55, 0.6);
        const chop = (pts, depth) => {
          let ax = 0, ay = 0, area = 0;
          for (let i = 0; i < pts.length; i++) {
            const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length], c = x0 * y1 - x1 * y0;
            area += c; ax += (x0 + x1) * c; ay += (y0 + y1) * c;
          }
          area /= 2;
          const m = Math.abs(area) < 1e-6 ? { x: pts[0][0], y: pts[0][1] } : { x: ax / (6 * area), y: ay / (6 * area) };
          return Math.abs(area) < 22 || depth > 1 ? [[pts, m, Math.abs(area)]] : splitPoly(pts, m.x, m.y, R.range(0, Math.PI)).flatMap((q) => chop(q, depth + 1));
        };
        for (const F of FACES) {
          const [cx, cz, ch] = F.c, d = Math.hypot(cx, cz) || 1;
          for (const [part, m, area] of chop(F.scr, 0)) {
            // where on the face this piece is, in 3D: the face's centre moved by the piece's offset on screen
            const off = [m.x - sx(F.c), m.y - sy(F.c)], sp = R.range(40, 85) * (1.2 - Math.min(0.5, area / 120));
            panes.push({
              pts: part.map(([x, y]) => [x - m.x, y - m.y]), x: cx + off[0], z: cz, h: Math.max(1, ch - off[1]),
              vx: (cx / d) * sp + R.range(-15, 15), vz: (cz / d) * sp + R.range(-12, 12), vh: R.range(90, 190) * (0.6 + 0.4 * clamp(ch / 40)),
              a: 0, va: R.range(-9, 9), f: R.range(-0.8, 0.8), vf: R.sign() * R.range(5, 13), lit: F.lit, life: 9, front: F.front,
            });
          }
        }
        for (let i = 0; i < 50; i++) {
          const F = R.pick(FACES), u = R.next(), w = R.next() * (1 - u), [a, b, c] = F.pts;
          const x = a[0] + (b[0] - a[0]) * u + (c[0] - a[0]) * w, z = a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * w, h = a[2] + (b[2] - a[2]) * u + (c[2] - a[2]) * w;
          const dx = x, dz = z, d = Math.hypot(dx, dz) || 1, sp = R.range(50, 130);
          shard({ x, z, h, vx: (dx / d) * sp, vz: (dz / d) * sp, vh: R.range(60, 170), drag: 0.9, bounce: 0.3, life: R.range(0.8, 1.4), s: R.range(1.5, 3.2), c: C[R.int(4, 7)] });
        }
        for (const f of feathers)
          if (R.chance(0.5)) shard({ x: f.x, z: R.range(-2, 2), h: -f.y, vx: f.dx * R.range(20, 70), vz: R.range(-30, 30), vh: R.range(20, 90), drag: 0.8, bounce: 0.3, life: R.range(0.4, 0.8), s: R.range(1, 1.8), c: WHITE });
        // ice dust rolling out over the floor every way round, and a cloud in the air
        for (let i = 0; i < 16; i++) {
          const a = R.range(0, TAU), v = R.range(30, 90);
          ps.spawn(P.VAPOUR, Math.cos(a) * R.range(2, 14), Math.sin(a) * R.range(2, 14) * FL - R.range(1, 6), Math.cos(a) * v, Math.sin(a) * v * FL - R.range(4, 16), R.range(0.6, 1.1), C[6], R.range(2.2, 4));
        }
        for (let i = 0; i < 8; i++) ps.spawn(P.VAPOUR, R.range(-14, 14), -R.range(8, 40), R.range(-30, 30), -R.range(10, 30), R.range(0.6, 1), C[6], R.range(3, 5));
        for (let i = 0; i < 18; i++) {
          const a = R.range(-Math.PI, 0), sp = R.range(40, 130);
          ps.spawn(P.FLAKE, R.range(-10, 10), CORE[1] + R.range(-12, 12), Math.cos(a) * sp, Math.sin(a) * sp, R.range(1, 1.5), R.chance(0.6) ? WHITE : C[6], R.range(0.5, 1.6));
        }
        for (let i = 0; i < 7; i++) ps.spawn(P.STAR, R.range(-26, 26), -R.range(6, 52), R.range(-12, 12), -R.range(4, 16), R.range(0.4, 0.8), R.chance(0.5) ? WHITE : C[6], R.range(1, 2.4));
      }
      // glints wink on the debris as it settles
      if (burst && t < BURST + 0.9 && shards.length && R.chance(0.07)) {
        const b = R.pick(shards);
        ps.spawn(P.STAR, b.x, b.z * FL - b.h - 1, 0, -3, R.range(0.2, 0.4), R.chance(0.5) ? WHITE : C[6], R.range(0.6, 1.6));
      }
      // the last of the ice runs off the character and drips to the floor at its feet
      if (A && burst && t < BURST + THAW && R.chance(0.12)) {
        const h = H - ease.inQuad(seg(t, BURST, BURST + THAW)) * H;
        shard({ kind: 1, x: R.range(-9, 9), z: R.range(-2, 2), h, vh: -10, drag: 0, bounce: 0, life: 0.8, s: 1, c: C[5] });
      }
      // the panes: tumbling through the air in 3D; on the floor each shatters into splinters that skid out, with a puff
      // of ice dust and a glint
      for (let i = panes.length - 1; i >= 0; i--) {
        const q = panes[i], k = Math.exp(-0.7 * dt);
        q.vx *= k; q.vz *= k; q.vh = q.vh * k - GRAVITY * 0.85 * dt;
        q.x += q.vx * dt; q.z += q.vz * dt; q.h += q.vh * dt;
        q.a += q.va * dt; q.f += q.vf * dt;
        if (q.h > 0) continue;
        panes.splice(i, 1);
        for (let j = 0; j < 3; j++) {
          const a = Math.atan2(q.vz, q.vx) + R.range(-1, 1), v = Math.hypot(q.vx, q.vz) * 0.6 + R.range(10, 50);
          shard({ x: q.x, z: q.z, h: 0.5, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vh: R.range(30, 100), drag: 0.6, bounce: 0.35, life: R.range(0.4, 0.8), s: R.range(1.2, 2.4), c: C[R.int(5, 7)] });
        }
        ps.spawn(P.VAPOUR, q.x, q.z * FL - 1, R.range(-25, 25), R.range(-6, 6) * FL - R.range(2, 10), R.range(0.4, 0.7), C[6], R.range(1.4, 2.4));
        if (R.chance(0.4)) ps.spawn(P.STAR, q.x, q.z * FL - 2, 0, -6, R.range(0.2, 0.4), WHITE, R.range(0.8, 1.6));
      }
      for (let i = shards.length - 1; i >= 0; i--) {
        const b = shards[i];
        if ((b.life -= dt) <= 0) { shards.splice(i, 1); continue; }
        if (b.rest) {
          // skidding on the floor: friction slows it and its spin
          const f = Math.exp(-7 * dt);
          b.x += b.vx * dt; b.z += b.vz * dt;
          b.vx *= f; b.vz *= f; b.va *= f;
          b.a += b.va * dt;
          continue;
        }
        const k = Math.exp(-b.drag * dt);
        b.vx *= k; b.vz *= k; b.vh = b.vh * k - GRAVITY * (b.kind ? 0.5 : 0.85) * dt;
        b.x += b.vx * dt; b.z += b.vz * dt; b.h += b.vh * dt; b.a += b.va * dt;
        if (b.h > 0) continue;
        b.h = 0;
        if (b.kind) b.life = Math.min(b.life, 0.25);   // a drip soaks into the frost
        else if (b.bounce > 0 && -b.vh > 70) (b.vh = -b.vh * b.bounce), (b.vx *= 0.7), (b.vz *= 0.7), (b.va *= 0.6);
        else (b.rest = true), (b.vh = 0), (b.vx *= 0.6), (b.vz *= 0.6);
      }
      ps.update(dt);
      lights.update(dt);
      // nothing outlives the effect: the last of the dust and stars go before it ends
      const left = Math.max(0.001, meta.duration - 0.05 - t);
      for (const q of ps.list) if (q.life > left) q.life = left;
      for (const b of shards) if (b.life > left) b.life = left;
    },
    drawBack(p) {
      frost(p);
      ticks(p, false);
      faces(p, BACKF);
      flying(p, false);
      ps.draw(p, "back");
    },
    draw(p) {
      drawCharacter(p);
      ticks(p, true);
      faces(p, FRONTF);
      drawEdges(p);
      // the cold light: a pool on the floor under the ice, a glow in it that brightens as it cracks, the climbing front's
      const hold = smooth(CLIMB[0], SEAL, t) * (1 - smooth(BURST, BURST + 0.6, t)), crk = smooth(CRACK, FLASH, t);
      if (hold > 0) {
        p.glow(0, -2, 34, C[4], 0.22 * hold * (0.85 + 0.15 * Math.sin(t * 3)));
        p.glow(CORE[0], CORE[1] - 4, 40, C[3], (0.22 + 0.1 * crk) * hold);
      }
      if (A && t > CLIMB[0] && t < CLIMB[1]) p.glow(0, -38 * ease.outQuad(seg(t, CLIMB[0], CLIMB[1])), 18, C[5], 0.28);
      // the seal: a star at the crown as the last pane sets
      const g = t - lastSet;
      if (g > 0 && g < 0.3) sparkle(p, crownTip[0], crownTip[1], 8 * ease.outBack(Math.min(1, g / 0.06)) * (1 - g / 0.3), C[6], C[4], 0.6);
      if (t >= FLASH && t < BURST + 0.16) {
        const a = clamp((t - FLASH) / 0.22);
        flare(p, CORE[0], CORE[1], 34 * Math.pow(1 - a, 1.4), 1 - a, C);
      }
      flying(p, true);
      ps.draw(p, "front");
      lights.draw(p);
    },
  };

  // the frost on the floor: it closes in from its rim to the feet, a white crust at its running edge, rime inside
  // with a glint here and there; it melts away patch by patch, fraying grain by grain at the edges of each patch
  function frost(p) {
    if (t <= 0) return;
    const gone = smooth(MELT[0], MELT[1], t), key = t < SNAP + 0.06 ? String(t) : String(gone);
    if (key !== fKey) {
      fKey = key;
      FSET.n = 0;
      for (let i = 0; i < FROST.x.length; i++) {
        const v = FROST.v[i], age = t - arrive(v);
        if (age < 0 || FROST.gone[i] < gone) continue;
        // solid stepped crust, its rim flashing white as it arrives: no translucency over the stone, so no mottling
        if (age < 0.04) setPx(FSET, FROST.x[i], FROST.y[i], WHITE, 0.85);
        else setPx(FSET, FROST.x[i], FROST.y[i], v < 0.4 ? C[6] : v < 0.72 ? C[5] : C[4], v < 0.4 ? 0.82 : v < 0.72 ? 0.74 : 0.66);
      }
      for (const q of GLINTS) if (q.v > gone + 0.04 && t - arrive(q.v) > 0.06) setPx(FSET, q.x, q.y, WHITE, 0.9);
    }
    drawSet(p, FSET);
  }

  // rime standing up out of the frost: solid crust plates grown in clumps once the frost has passed, white-capped;
  // they melt down from the tip with the patch they stand in
  function ticks(p, front) {
    const gone = smooth(MELT[0], MELT[1], t);
    for (const k of TICKS) {
      if (k.y >= 0 !== front) continue;
      const age = t - arrive(k.v);
      if (age <= 0) continue;
      const melt = clamp((gone - (k.g - 0.3)) / 0.3), s = Math.round(k.s * smooth(0, 0.3, age) * (1 - melt) * (1 - k.v * 0.35));
      if (s < 1) continue;
      p.px(k.x - 1, k.y, C[4]); p.px(k.x, k.y, C[5]); p.px(k.x + 1, k.y, C[4]);
      if (s >= 2) { p.px(k.x - 1, k.y - 1, C[5]); p.px(k.x, k.y - 1, C[6]); p.px(k.x + 1, k.y - 1, C[5]); }
      if (s >= 3) p.px(k.x, k.y - 2, WHITE);
    }
  }

  // the crystal's faces, far ones first: each fills in as it sets (one flat tone per panel, never a per-pixel mosaic),
  // brighter as the light sweeps over it; all white for the frame before it bursts
  function faces(p, list) {
    if (t >= BURST || t < SEAL - 0.08) return;
    const jx = jolt(), wh = t >= FLASH;
    for (const F of list) {
      const age = t - F.at;
      if (age < 0) continue;
      const g = SWEEPS.reduce((m, s0) => Math.max(m, Math.sin(Math.PI * clamp((t - s0 - F.d * 0.32) / 0.13))), 0) * (0.35 + 0.65 * F.lit) * (F.front ? 1 : 0.5);
      const fresh = 1 - clamp((age - 0.03) / 0.1), pix = F.pix;
      const lit = clamp(F.lit * 0.8 + g * 0.7), step = lit > 0.66 ? 2 : lit > 0.33 ? 1 : 0;
      const tone = wh ? (F.front ? WHITE : C[6]) : F.front ? [C[4], C[5], C[6]][step] : [C[2], C[3], C[4]][step];
      const al = wh ? 1 : (F.front ? 0.62 : 0.4) + 0.18 * fresh;
      for (let i = 0; i < pix.length; i += 2) {
        const x = pix[i] + jx, y = pix[i + 1];
        if (wh || fresh > 0.55) p.px(x, y, C[7]);
        else p.blend(x, y, tone, al);
        if (g > 0.05) p.light(x, y, C[5], 0.4 * g);
      }
    }
  }

  // edges: the outline lit where it faces up and left, cool on its shadow side with a deep rim outside; inner edges
  // pale, the ones on the far side faint through the ice; the foot a cool line on the floor; a pane setting is traced
  // in white round its edge first, a bead of light at the head
  function drawEdges(p) {
    if (t >= BURST || t < SEAL - 0.08) return;
    const jx = jolt(), wh = t >= FLASH;
    for (const e of EDGES) {
      if (t < e.at) continue;
      const [x0, y0, x1, y1] = e.s, fresh = e.fs.some((F) => t - F.at < 0.1);
      if (e.foot) {
        if (e.front) p.line(x0 + jx, y0, x1 + jx, y1, C[5]);
        continue;
      }
      if (!e.front) {
        if (e.outer) p.line(x0 + jx, y0, x1 + jx, y1, wh ? C[6] : C[3]);
        continue;
      }
      if (e.outer && e.lit < 0 && !wh) p.line(x0 + jx + 1, y0, x1 + jx + 1, y1, C[1]);
      if (e.outer) p.glowLine(x0 + jx, y0, x1 + jx, y1, 5, C[4], 0.1);
      // the silhouette carries the light; the facets inside it stay a calm dim step, never a bright lattice
      p.line(x0 + jx, y0, x1 + jx, y1, wh ? C[6] : fresh ? WHITE : e.outer ? (e.lit > 0.3 ? WHITE : e.lit > -0.2 ? C[6] : C[4]) : (y0 + y1) / 2 < -30 ? C[5] : C[4]);
    }
    for (const F of FACES) {
      const age = t - F.at;
      if (age < -0.07 || age >= 0) continue;
      let left = ((age + 0.07) / 0.07) * F.len;
      for (let k = 0; k < F.scr.length && left > 0; k++) {
        const [x0, y0] = F.scr[k], [x1, y1] = F.scr[(k + 1) % F.scr.length], L = Math.hypot(x1 - x0, y1 - y0), v = Math.min(1, left / L);
        left -= L;
        p.line(x0 + jx, y0, x0 + jx + (x1 - x0) * v, y0 + (y1 - y0) * v, F.front ? WHITE : C[6]);
        if (v < 1) p.glow(x0 + jx + (x1 - x0) * v, y0 + (y1 - y0) * v, 6, C[6], F.front ? 0.6 : 0.3);
      }
    }
    if (t >= CRACK && !wh) drawFractures(p, cracks, (t - CRACK) * 150, C, { ox: jx });
    if (t >= CRACK2 && !wh) drawFractures(p, cracks2, (t - CRACK2) * 190, C, { ox: jx });
  }

  // the frozen character: each pixel turns as the frost reaches it, white at the front; after the burst the ice runs
  // off it from the top down
  function drawCharacter(p) {
    if (!A) return;
    const thaw = t >= BURST ? ease.inQuad(seg(t, BURST, BURST + THAW)) * (H + 2) - 2 : -1;
    for (const i of order) {
      const age = t - reach[i];
      if (age < 0) break;
      const x = i % W, y = (i / W) | 0;
      if (y < thaw) continue;
      p.px(A.x + x, A.y + y, y < thaw + 1.2 && t >= BURST ? C[7] : age < 0.016 ? WHITE : age < 0.045 ? C[6] : ice[i]);
      if (age < 0.03) p.light(A.x + x, A.y + y, C[6], 0.3);
    }
    if (t >= BURST) return;
    for (const f of feathers) {
      const g = clamp((t - f.at) / 0.08);
      if (g <= 0) continue;
      const L = Math.round(f.L * g);
      for (let j = 0; j < L; j++) p.px(f.x + f.dx * j, f.y + f.dy * j, j === L - 1 ? WHITE : C[6]);
    }
  }

  // what flies: the panes (tumbling glass, drawn as the source draws them, placed at their 3D point) and the shards
  // (a sliver turning, a drip falling); behind the crystal's middle (z < 0) before the character, in front after
  function flying(p, front) {
    const vis = panes.filter((q) => q.z >= 0 === front);
    for (const q of vis) {
      q.y = q.z * FL - q.h;   // where the side view's pane drawer looks for it
      q.rest = false;
    }
    if (vis.length) {
      const all = drawer.list;
      drawer.list = vis;
      drawer.draw(p, C);
      drawer.list = all;
    }
    for (const b of shards) {
      if (b.z >= 0 !== front) continue;
      const x = b.x, y = b.z * FL - b.h, melt = Math.min(1, b.life / 0.4);
      if (b.kind) {
        p.px(x, y, b.c);
        p.px(x, y - 1, C[5]);
        continue;
      }
      // it melts where it lies: shorter and shorter, never a fade
      const s = b.s * melt, ca = Math.cos(b.a), sa = Math.sin(b.a) * (b.rest ? FL : 1);
      if (s < 0.4) continue;
      for (let d = -s / 2; d <= s / 2; d += 0.5) p.px(x + ca * d, y + sa * d, d > s / 2 - 0.6 ? WHITE : b.c);
    }
  }
}
