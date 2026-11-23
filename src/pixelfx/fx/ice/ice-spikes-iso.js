// Ice spikes for the game's 2:1 isometric camera, cast any of eight ways: ice/ice-spikes rewritten for the floor the
// game sees, not its picture squashed, stretched, scaled or turned. The recipe is the source's: a frost line races out
// along the floor from the caster, clusters of jagged blades burst up behind it in a rising wave (each white for a
// moment, with a spray of shards, a puff and a glint), a glint runs down the line, they shiver, flash white together
// and shatter into toppling pieces, and the frost melts, oldest first. What changed is the world it happens in:
//   - it runs over the floor, not along a line on the screen: o.dir 0..7 is the eight ways a character faces on this
//     floor (0 east, along the screen to the right, then a quarter turn at a time toward us: 2 south, straight down the
//     screen; 4 west; 6 north, away from us), or o.aim any way at all (radians on the floor, the same sense; not
//     `angle`, which every effect takes as a turn of its whole picture, the very thing this camera must never do);
//   - the frost is a strip lying on the floor along its path, so it reads narrow running across the screen and wide
//     running toward or away from us, as anything lying on this floor does;
//   - each blade stands on the floor at its own depth and leans into the wave in 3D: running toward us its tip comes
//     down the screen, running away it goes up; a cluster's blades stand either side of the path, drawn far to near;
//     the ones behind the caster go behind him, the ones in front in front;
//   - what flies (shards, splinters, the toppling pieces) flies in 3D along the way it ran and lands at its own depth.
// The caster is the game's own character (at the origin): the effect draws no stand-in. 1 px = 1 sprite px.
// The eruption recipe (a frost line racing ahead, each spike punching up white with a spray of shards, a puff and a
// glint, the floor frosting behind) is adapted from Sprite Fusion's open-source ice
// (https://www.spritefusion.com/pixel-art-vfx/ice), MIT License, Copyright (c) 2026 Hugo Duprez.
import { Particles, Lights, P, Rng, fit, sparkle, clamp, smooth, seg, ease, rand, noise, noise2, TAU, WHITE, GRAVITY } from "../../core/index.js";
import { Panes, blade, splitPoly, SPIKE_KIND } from "./_lib.js";
import { pixelSet, setPx, drawSet } from "../_iso.js";

export const meta = {
  name: "Ice spikes (iso)",
  desc: "ice/ice-spikes on the 2:1 floor, cast any of eight ways (o.dir 0-7): a frost line races out, a dense rank of upright blades bursts up along it, flash white and shatter.",
  tags: ["ice", "spikes", "ground", "wave", "directional", "8-dir", "magic", "one-shot", "iso", "top-down"],
  size: [480, 300],
  origin: [240, 162],
  duration: 3,
  loop: false,
  fps: 30,
  bg: "ground",
  pixels: 1,
  options: { palette: ["#151a3d", "#212f6b", "#2c58aa", "#3a8bd8", "#62c8f4", "#a6ecff", "#dcfbff", "#ffffff"], reach: 172, height: 56, dir: 0, seed: 3, style: -1 },
};

const FL = 0.5;
const START = 0.04, RUN = 0.44; // the frost line runs out
const SHIMMER = 0.74; // a glint runs down the line
const TREMBLE = 1.2, FLASH = 1.36, SHATTER = 1.42; // they shiver, flash white together and break
const MELT = 1.75; // the frost goes, oldest first
const HALF = 7; // the frost strip's half width on the floor where it starts

export function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed), REACH = o.reach, S0 = o.seed * 13;
  const th = o.aim ?? ((((Math.round(o.dir ?? 0) % 8) + 8) % 8) * Math.PI) / 4;
  const DX = Math.cos(th), DZ = Math.sin(th), AX = -DZ, AZ = DX;   // along its path over the floor, and across it
  const ps = new Particles({ rng: R, ground: () => Infinity, sparks: [C[7], C[6], C[5], C[4]], haze: C[5] }), lights = new Lights();
  const shards = [], panes = [], drawer = new Panes();
  // a floor point s along the path and u across it: where it is (x, z), and on screen at height h
  const wx = (s, u) => s * DX + u * AX, wz = (s, u) => s * DZ + u * AZ;
  const front = (t) => REACH * (1 - Math.pow(1 - seg(t, START, START + RUN), 1.7));
  const reachedAt = (s) => START + RUN * (1 - Math.pow(1 - clamp(s / REACH), 1 / 1.7));
  const shard = (b) => shards.push({ vx: 0, vz: 0, vh: 0, a: R.range(0, TAU), va: R.range(-20, 20), s: 2, rest: false, kind: 0, drag: 0.6, bounce: 0.3, ...b });
  // splinters skidding out over the floor from a point
  const splinter = (x, z, v, n) => {
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(v[1], v[0]) + R.range(-1.2, 1.2), sp = Math.hypot(v[0], v[1]) * 0.5 + R.range(10, 45);
      shard({ x: x + R.range(-2, 2), z: z + R.range(-2, 2), h: 1, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vh: R.range(30, 100), drag: 0.6, bounce: 0.35, life: R.range(0.4, 0.75), s: R.range(1.2, 2.4), c: C[R.int(4, 7)] });
    }
  };

  // clusters along the path: a main blade leaning into the wave, a smaller one beside it leaning further (on the
  // side away from us, a step dimmer), a stub at its foot on the near side; heights swelling to a crest past the
  // middle and falling off at the end. Each cluster is one of the six ice silhouettes (a needle, a broad shard, a
  // split point, a bowed fang, a tiered crystal, a blunt obelisk) and that shape sizes its blades, so a field of ice
  // is not one repeated cone
  const env = (q) => 0.28 + 0.72 * Math.exp(-(((q - 0.64) / 0.3) ** 2));
  const away = Math.abs(AZ) > 0.2 ? -Math.sign(AZ) : 1;   // which side of the path lies away from us
  const clusters = [];
  // blade widths and leans follow the stone wave: w = 0.36 h with no cap, and the slight lean a standing shard has,
  // so a cluster of ice reads the same way a cluster of rock does; the wave only tilts it a little forward
  for (let s = 6; s < REACH - 2; s += R.range(15, 20)) {
    const q = s / REACH, H0 = o.height * env(q) * R.range(0.88, 1.06), W0 = H0 * 0.36;
    const kind = o.style >= 0 ? o.style : R.int(0, SPIKE_KIND.length - 1), K = SPIKE_KIND[kind];
    const H = H0 * K.h, W = W0 * K.w, lean = H * R.range(0.08, 0.16) * (K.lean ?? 1);
    const list = [
      { ds: W * R.range(0.45, 0.7), du: away * W * 0.5, h: H * R.range(0.44, 0.62), w: W * 0.68, lean: H * R.range(0.14, 0.22), back: true, delay: R.range(0.02, 0.05), jag: R.chance(0.5) ? R.range(0.35, 0.6) : -1, style: R.chance(0.4) ? R.int(0, 5) : kind },
      { ds: 0, du: 0, h: H, w: W, lean, back: false, delay: 0, jag: R.chance(0.7) ? R.range(0.32, 0.58) : -1, main: true, style: kind },
      { ds: -W * R.range(0.42, 0.62), du: -away * W * 0.45, h: H * R.range(0.3, 0.48), w: W * 0.6, lean: H * R.range(0.04, 0.1), back: false, delay: R.range(0.03, 0.07), jag: R.chance(0.4) ? R.range(0.4, 0.65) : -1, style: R.chance(0.5) ? kind : R.int(0, 5) },
    ];
    if (H > 16) list.push({ ds: W * R.range(0.8, 1.1), du: -away * W * 0.2, h: H * R.range(0.16, 0.3), w: W * 0.44, lean: H * R.range(0.1, 0.2), back: false, delay: R.range(0.05, 0.09), jag: -1, style: R.int(0, 5) });
    if (H > 26) list.push({ ds: -W * R.range(0.78, 0.98), du: away * W * 0.55, h: H * R.range(0.14, 0.24), w: W * 0.4, lean: H * R.range(0.06, 0.14), back: true, delay: R.range(0.06, 0.1), jag: -1, style: R.int(0, 5) });
    const c = { s, q, H, W, blades: list, main: list[1], t0: reachedAt(s) + 0.012, up: false };
    for (const b of list) (b.c = c), (b.x = wx(s + b.ds, b.du)), (b.z = wz(s + b.ds, b.du));
    clusters.push(c);
  }
  const blades = clusters.flatMap((c) => c.blades).sort((a, b) => a.z - b.z || (a.back ? -1 : 1));   // far to near
  const crest = clusters.reduce((a, c) => (c.H > a.H ? c : a), clusters[0]);
  const ofCluster = (c) => [wx(c.s, 0), wz(c.s, 0)];

  // ---- the frost: a strip lying on the floor along the path, ragged at its sides and narrowing a little toward its
  // end; each pixel's place along it, across it, its glint and when it melts, worked out once for this way round
  const cornersS = [-6, REACH + 8], cornersU = [-HALF * 1.6, HALF * 1.6];
  let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
  for (const s of cornersS) for (const u of cornersU) {
    const x = wx(s, u), y = wz(s, u) * FL;
    bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y);
  }
  const F = { x: [], y: [], s: [], e: [], glint: [], gone: [] }, TICKS = [];
  for (let y = Math.floor(by0); y <= Math.ceil(by1); y++)
    for (let x = Math.floor(bx0); x <= Math.ceil(bx1); x++) {
      const fx = x + 0.5, fz = (y + 0.5) / FL, s = fx * DX + fz * DZ, u = fx * AX + fz * AZ;
      if (s < -4 || s > REACH + 6) continue;
      const q = clamp(s / REACH), hw = HALF * (1 - 0.35 * q) * (1 + 0.3 * noise(s * 0.09, S0)) + 1.2 * noise2(s * 0.3, u * 0.3, S0 + 1) + (s < 0 ? s : 0);
      if (Math.abs(u) > hw || hw <= 0) continue;
      F.x.push(x); F.y.push(y); F.s.push(s); F.e.push(Math.abs(u) / hw);
      F.glint.push(rand(x + 7, y + 31, S0 + 2) < 0.02);
      F.gone.push(0.9 * clamp(0.5 + 0.75 * noise2(fx * 0.12, fz * 0.12, S0 + 3)) + 0.1 * rand(x, y, S0 + 4));
      // rime: tufts standing up out of it here and there
      if (rand(x + 3, y + 5, S0 + 5) < 0.06) TICKS.push({ x, y, s, L: 1 + rand(x, y, S0 + 6) * 2.6, side: rand(y, x, S0 + 7) < 0.5 ? -1 : 1 });
    }
  const FSET = pixelSet(F.x.length, [Math.floor(bx0), Math.floor(by0), Math.ceil(bx1), Math.ceil(by1)]);
  const meltOf = (s) => smooth(MELT + clamp(s / REACH) * 0.35, MELT + clamp(s / REACH) * 0.35 + 0.6, t);

  let t = 0, broke = false, trembled = false;
  // a blade's foot and tip on screen right now, and whether it shows white
  const pose = (b) => {
    const c = b.c, g = ease.outBack(clamp((t - c.t0 - b.delay) / 0.09), 2.2), L = b.lean * g, h = b.h * g;
    return { g, x: b.x, y: b.z * FL, tx: b.x + DX * L, ty: (b.z + DZ * L) * FL - h, h, L, white: t - c.t0 - b.delay < 0.03 || (t >= FLASH && t < SHATTER) };
  };

  // every blade breaks into toppling pieces, along the way it ran, with splinters and chunks
  const breakBlade = (b) => {
    const s = pose(b), ax = s.tx - s.x, ay = s.ty - s.y, L = Math.hypot(ax, ay) || 1, nx = -ay / L, ny = ax / L, hw = b.w / 2;
    const tri = [[s.x - nx * hw, s.y - ny * hw], [s.tx, s.ty], [s.x + nx * hw, s.y + ny * hw]], ang = Math.atan2(ay, ax) + Math.PI / 2;
    let parts = [tri];
    if (b.h > 9) parts = parts.flatMap((poly) => splitPoly(poly, s.x + ax * 0.4, s.y + ay * 0.4, ang));
    if (b.h > 22) parts = parts.flatMap((poly) => (poly.some(([, y]) => y < s.y + ay * 0.5) ? splitPoly(poly, s.x + ax * 0.72, s.y + ay * 0.72, ang) : [poly]));
    for (const part of parts) {
      let mx = 0, my = 0;
      for (const [x, y] of part) (mx += x), (my += y);
      (mx /= part.length), (my /= part.length);
      // where this piece is along the blade, so its point in 3D: up the blade and leaned along the path
      const uu = clamp((my - s.y) / (ay || -1)), h = s.h * uu, z = b.z + DZ * s.L * uu, up = clamp(h / 40), v = R.range(-25, 60), side = R.range(-20, 20);
      panes.push({
        pts: part.map(([x, y]) => [x - mx, y - my]), wx: mx, wz: z, wh: Math.max(0.5, h), vx: DX * v + AX * side, vz: DZ * v + AZ * side, vh: R.range(40, 130) * (0.5 + up),
        a: 0, va: R.range(-8, 8), f: R.range(-0.7, 0.7), vf: R.range(-6, 6), lit: b.back ? 0.45 : 0.75, solid: true, ridge: Math.atan2(ay, ax), brittle: b.h > 30 ? 2 : 1, hits: 0,
        crumble: R.range(0.12, 0.4), life: 9,
      });
    }
    for (let i = 0; i < 2 + b.h / 7; i++) {
      const u = R.next(), v = R.range(-55, 70), side = R.range(-30, 30);
      shard({ kind: R.chance(0.15) ? 2 : 0, x: s.x + ax * u + R.range(-1.5, 1.5), z: b.z + DZ * s.L * u, h: s.h * u, vx: DX * v + AX * side, vz: DZ * v + AZ * side, vh: R.range(60, 230), drag: 0.6, bounce: 0.3, life: R.range(0.7, 1.3), s: R.range(1.2, 3.2), c: C[R.int(4, 7)] });
    }
  };

  return {
    update(dt) {
      t += dt;
      // the cast: a puff and a spray where the line starts, thrown along it
      if (t - dt <= START && t > START) {
        for (let i = 0; i < 4; i++) {
          const v = R.range(10, 60), side = R.range(-15, 15), x = wx(R.range(0, 6), 0), z = wz(R.range(0, 6), 0);
          ps.spawn(P.VAPOUR, x, z * FL - R.range(0, 3), DX * v + AX * side, (DZ * v + AZ * side) * FL - R.range(2, 12), R.range(0.4, 0.7), C[6], R.range(2, 3.2));
        }
        lights.add(wx(4, 0), wz(4, 0) * FL - 4, 26, C[5], 0.6, 0.25);
      }
      // the running head throws frost forward: streaks along the floor, motes, vapour
      const fr = front(t);
      if (t > START && fr < REACH - 1) {
        const hx = wx(fr, 0), hz = wz(fr, 0);
        if (R.chance(0.5)) {
          const back = R.range(4, 12), v = R.range(40, 80);
          ps.spawn(P.STREAK, wx(fr - back, R.range(-2, 2)), wz(fr - back, 0) * FL - R.range(1, 3), DX * v, DZ * v * FL - R.range(0, 6), R.range(0.08, 0.14), R.chance(0.5) ? C[6] : WHITE);
        }
        if (R.chance(0.3)) ps.spawn(P.FLAKE, hx, hz * FL - 1, DX * R.range(10, 50), DZ * R.range(10, 50) * FL - R.range(20, 70), R.range(0.5, 0.9), R.chance(0.5) ? WHITE : C[6], R.range(0.5, 1.2));
        if (R.chance(0.12)) ps.spawn(P.VAPOUR, hx, hz * FL - R.range(0, 3), DX * R.range(20, 60), DZ * R.range(20, 60) * FL - R.range(2, 10), R.range(0.4, 0.7), C[6], R.range(1.6, 2.8));
      }
      for (const c of clusters) {
        if (c.up || t < c.t0) continue;
        c.up = true;
        // each cluster bursts up: shards sprayed forward and up out of the floor, a puff, motes, a glint at its tip
        const big = c === crest, n = 3 + Math.round(c.H / 8), [cx, cz] = ofCluster(c);
        for (let i = 0; i < n; i++) {
          const up = R.range(0.42, 1), sp = R.range(60, 190) * (0.45 + c.H / 44), side = R.range(-0.5, 0.5), fwd = Math.sqrt(1 - up * up) * 0.78;
          shard({ x: cx + R.range(-3, 3), z: cz + R.range(-3, 3), h: 1, vx: (DX * fwd + AX * side) * sp + DX * 25, vz: (DZ * fwd + AZ * side) * sp + DZ * 25, vh: up * sp, drag: 0.6, bounce: 0.3, life: R.range(0.6, 1.1), s: R.range(1.2, 3), c: C[R.int(5, 7)] });
        }
        ps.spawn(P.VAPOUR, cx, cz * FL - 1, DX * R.range(-10, 40), DZ * R.range(-10, 40) * FL - R.range(2, 10), R.range(0.5, 0.9), C[6], R.range(2.2, 3.4) * (0.6 + c.H / 60));
        for (let i = 0; i < 2; i++) ps.spawn(P.FLAKE, cx + R.range(-4, 4), cz * FL - R.range(2, c.H * 0.5), DX * R.range(-20, 40), DZ * R.range(-20, 40) * FL - R.range(20, 60), R.range(0.6, 1.1), R.chance(0.5) ? WHITE : C[6], R.range(0.5, 1.3));
        const tip = pose(c.main);
        if (c.H > 16) ps.spawn(P.STAR, cx + DX * c.main.lean, (cz + DZ * c.main.lean) * FL - c.H * 0.96, 0, -4, R.range(0.3, 0.5), WHITE, R.range(1.4, 2.6), 0.08);
        lights.add(cx, cz * FL - c.H * 0.4, 16 + c.H * 0.6, C[5], 0.5, 0.18);
        if (big) {
          lights.add(cx, cz * FL - c.H * 0.5, 54, WHITE, 0.5, 0.14);
          for (let i = 0; i < 4; i++) {
            const a = R.range(0, TAU), v = R.range(10, 60);
            ps.spawn(P.VAPOUR, cx + R.range(-6, 6), cz * FL - R.range(0, 4), Math.cos(a) * v, Math.sin(a) * v * FL - R.range(4, 16), R.range(0.6, 1), C[6], R.range(3, 4.5));
          }
        }
        void tip;
      }
      // while they stand: glints wink on the blades
      if (t > START + RUN && t < TREMBLE && R.chance(0.09)) {
        const b = R.pick(blades), s = pose(b), u = R.range(0.3, 0.95);
        ps.spawn(P.STAR, s.x + (s.tx - s.x) * u, s.y + (s.ty - s.y) * u, 0, -3, R.range(0.25, 0.5), R.chance(0.6) ? WHITE : C[6], R.range(0.6, 2));
      }
      // they shiver: chips fall
      if (!trembled && t >= TREMBLE) {
        trembled = true;
        for (const c of clusters) {
          const [cx, cz] = ofCluster(c);
          for (let i = 0; i < 2; i++) shard({ x: cx + R.range(-4, 4), z: cz + R.range(-2, 2), h: R.range(4, c.H * 0.8), vx: R.range(-20, 20), vz: R.range(-20, 20), vh: R.range(0, 30), drag: 0.5, bounce: 0.3, life: R.range(0.3, 0.6), s: R.range(1, 1.8), c: C[R.int(5, 7)] });
        }
      }
      if (!broke && t >= SHATTER) {
        broke = true;
        // all at once: every blade breaks into toppling pieces, splinters and ice dust, light along the line
        for (const b of blades) breakBlade(b);
        for (const c of clusters) {
          const [cx, cz] = ofCluster(c);
          for (let i = 0; i < 2; i++) ps.spawn(P.VAPOUR, cx + R.range(-6, 6), cz * FL - R.range(1, 8), DX * R.range(-30, 50) + R.range(-10, 10), DZ * R.range(-30, 50) * FL - R.range(4, 18), R.range(0.6, 1.1), C[6], R.range(2.4, 4) * (0.7 + c.H / 60));
          if (R.chance(0.7)) ps.spawn(P.STAR, cx + R.range(-6, 6), cz * FL - R.range(4, c.H), R.range(-10, 10), -R.range(6, 20), R.range(0.4, 0.8), R.chance(0.5) ? WHITE : C[6], R.range(1, 2.2));
          for (let i = 0; i < 2; i++) ps.spawn(P.FLAKE, cx + R.range(-6, 6), cz * FL - R.range(4, c.H), DX * R.range(-30, 60), DZ * R.range(-30, 60) * FL - R.range(30, 90), R.range(0.9, 1.5), R.chance(0.6) ? WHITE : C[6], R.range(0.5, 1.5));
          lights.add(cx, cz * FL - c.H * 0.5, 22 + c.H, WHITE, 0.45, 0.12);
        }
        for (let i = 0; i < 5; i++) {
          const s = (REACH * (i + 0.5)) / 5;
          lights.add(wx(s, 0), wz(s, 0) * FL - 18, 40, C[4], 0.4, 0.5);
        }
      }
      // the shatter's dust settles; glints on the debris
      if (broke && t < SHATTER + 0.8 && R.chance(0.1) && shards.length) {
        const b = R.pick(shards);
        ps.spawn(P.STAR, b.x, b.z * FL - b.h - 1, 0, -3, R.range(0.2, 0.4), R.chance(0.5) ? WHITE : C[6], R.range(0.6, 1.5));
      }
      // the pieces: toppling through the air; a big one bounces once, then each breaks on the floor into splinters with
      // a puff of ice dust; one that comes to rest gently crumbles where it lies a moment later
      for (let i = panes.length - 1; i >= 0; i--) {
        const q = panes[i];
        if (q.rest) {
          if ((q.restT = (q.restT ?? 0) + dt) > q.crumble) {
            splinter(q.wx, q.wz, [0, 0], 3);
            ps.spawn(P.VAPOUR, q.wx, q.wz * FL - 1, R.range(-12, 12), -R.range(2, 8), R.range(0.4, 0.7), C[6], R.range(1.4, 2.2));
            panes.splice(i, 1);
          }
          continue;
        }
        const k = Math.exp(-0.6 * dt);
        q.vx *= k; q.vz *= k; q.vh = q.vh * k - GRAVITY * 0.9 * dt;
        q.wx += q.vx * dt; q.wz += q.vz * dt; q.wh += q.vh * dt; q.a += q.va * dt; q.f += q.vf * dt;
        if (q.wh > 0) continue;
        q.wh = 0;
        const v = -q.vh;
        if (v > 70) {
          q.hits++;
          if (v >= 110) {
            ps.spawn(P.VAPOUR, q.wx, q.wz * FL - 1, R.range(-20, 20), R.range(-8, 8) * FL - R.range(2, 8), R.range(0.4, 0.7), C[6], R.range(1.4, 2.4));
            if (R.chance(0.3)) ps.spawn(P.STAR, q.wx, q.wz * FL - 2, 0, -5, R.range(0.2, 0.4), WHITE, R.range(0.8, 1.6));
          }
          if (q.hits >= q.brittle) {
            splinter(q.wx, q.wz, [q.vx, q.vz], 3);
            panes.splice(i, 1);
            continue;
          }
          (q.vh = v * 0.3), (q.vx *= 0.75), (q.vz *= 0.75), (q.va *= 0.6), (q.vf *= 0.5);
        } else (q.rest = true), (q.vh = 0);
      }
      for (let i = shards.length - 1; i >= 0; i--) {
        const b = shards[i];
        if ((b.life -= dt) <= 0) { shards.splice(i, 1); continue; }
        if (b.rest) {
          const f = Math.exp(-7 * dt);
          b.x += b.vx * dt; b.z += b.vz * dt; b.vx *= f; b.vz *= f; b.va *= f; b.a += b.va * dt;
          continue;
        }
        const k = Math.exp(-b.drag * dt);
        b.vx *= k; b.vz *= k; b.vh = b.vh * k - GRAVITY * 0.8 * dt;
        b.x += b.vx * dt; b.z += b.vz * dt; b.h += b.vh * dt; b.a += b.va * dt;
        if (b.h > 0) continue;
        b.h = 0;
        if (b.bounce > 0 && -b.vh > 70) (b.vh = -b.vh * b.bounce), (b.vx *= 0.7), (b.vz *= 0.7), (b.va *= 0.6);
        else (b.rest = true), (b.vh = 0), (b.vx *= 0.6), (b.vz *= 0.6);
      }
      ps.update(dt);
      lights.update(dt);
      const left = Math.max(0.001, meta.duration - 0.05 - t);
      for (const q of ps.list) if (q.life > left) q.life = left;
      for (const b of shards) if (b.life > left) b.life = left;
      for (const q of panes) if (q.rest && q.crumble > (q.restT ?? 0) + left) q.crumble = (q.restT ?? 0) + left;
    },
    drawBack(p) {
      frost(p);
      ticks(p, false);
      drawBlades(p, false);
      flying(p, false);
      ps.draw(p, "back");
    },
    draw(p) {
      ticks(p, true);
      drawBlades(p, true);
      // the cold light the frosted floor gives off, along the path behind the head
      const k = (1 - smooth(MELT, MELT + 0.9, t)) * smooth(START, START + 0.3, t), fr = front(t);
      for (let i = 0; i < 6; i++) {
        const s = (fr * (i + 0.5)) / 6;
        p.glow(wx(s, 0), wz(s, 0) * FL - 3, 26, C[4], 0.15 * k);
      }
      if (fr < REACH && t > START) {
        const hx = wx(fr, 0), hy = wz(fr, 0) * FL;
        p.glow(hx, hy - 2, 16, C[6], 0.6);
        p.glow(hx, hy - 1, 7, WHITE, 0.6);
      }
      if (t >= FLASH && t < SHATTER + 0.1)
        for (const c of clusters) {
          const s = pose(c.main);
          sparkle(p, s.tx, s.ty, 6 * (1 - clamp((t - FLASH) / 0.16)), C[6], C[4], 0.4);
        }
      flying(p, true);
      ps.draw(p, "front");
      lights.draw(p);
    },
  };

  // the frost: it forms as the head passes (white at the head, white for a moment where it has just formed), a crust
  // down its middle and a bloom of rime fading out to its sides, a glint here and there; it melts, oldest first,
  // patch by patch
  function frost(p) {
    if (t <= START) return;
    const fr = front(t);
    FSET.n = 0;
    for (let i = 0; i < F.x.length; i++) {
      const s = F.s[i], age = t - reachedAt(Math.max(0, s));
      if (s > fr + 1 || age < 0 || F.gone[i] < meltOf(s)) continue;
      const e = F.e[i];
      if ((fr < REACH && fr - s < 3) || age < 0.06) setPx(FSET, F.x[i], F.y[i], WHITE, e < 0.5 ? 0.9 : 0.6);
      else if (F.glint[i]) setPx(FSET, F.x[i], F.y[i], WHITE, 0.85);
      else setPx(FSET, F.x[i], F.y[i], e < 0.3 ? C[6] : e < 0.6 ? C[5] : e < 0.85 ? C[4] : C[3], e < 0.3 ? 0.8 : e < 0.6 ? 0.6 : e < 0.85 ? 0.45 : 0.3);
    }
    drawSet(p, FSET);
  }

  // rime tufts standing up out of the frost once it has formed, a white tip; they melt down with it
  function ticks(p, near) {
    if (t <= START) return;
    for (const k of TICKS) {
      if (k.y >= 0 !== near) continue;
      const age = t - reachedAt(Math.max(0, k.s));
      if (age <= 0) continue;
      const L = Math.round(smooth(0, 0.3, age) * k.L * (1 - meltOf(k.s)));
      for (let j = 1; j <= L; j++) p.px(k.x, k.y - j, j === L ? WHITE : C[5]);
      if (L > 1) p.px(k.x + k.side, k.y - L + 1, C[6]);
    }
  }

  // the blades, far to near, each in the side view's blade shading: a lit facet, a ridge, a deep facet, a white tip;
  // the shiver jitters them, a glint runs down the line; light pops at the foot as each bursts, cold up its length
  function drawBlades(p, near) {
    if (t >= SHATTER) return;
    for (const b of blades) {
      const c = b.c;
      if (t < c.t0 || b.z >= 0 !== near) continue;
      const s = pose(b);
      if (s.g <= 0) continue;
      const jx = t >= TREMBLE && t < FLASH ? ((Math.floor(t * 40) + Math.round(c.s)) % 2 ? 1 : 0) : 0, gl = (t - SHIMMER - c.q * 0.34) / 0.2;
      blade(p, s.x + jx, s.y, s.tx + jx, s.ty, b.w, C, { white: s.white, jag: b.jag, style: b.style, dim: b.back ? 1 : 0, glint: gl >= 0 && gl <= 1 ? gl : -1 });
      if (b.main) {
        const pop = clamp(1 - (t - c.t0) / 0.15), wh = t >= FLASH;
        p.glow(s.x + (s.tx - s.x) * 0.4, s.y - c.H * 0.45, c.H * 0.9 + 10, C[4], (0.16 + 0.42 * pop + (wh ? 0.4 : 0)) * (0.85 + 0.15 * Math.sin(t * 3 + c.s)));
        if (pop > 0) p.glow(s.x, s.y - 2, 14, WHITE, 0.55 * pop);
      }
    }
  }

  // what flies: the toppling pieces (drawn as the side view draws them, placed at their 3D point), splinters (a sliver
  // turning, melting shorter where it lies) and chunks (a shaded lump); behind the caster first, in front after
  function flying(p, near) {
    const vis = panes.filter((q) => q.wz >= 0 === near);
    for (const q of vis) (q.x = q.wx), (q.y = q.wz * FL - q.wh);
    if (vis.length) {
      const all = drawer.list;
      drawer.list = vis;
      drawer.draw(p, C);
      drawer.list = all;
    }
    for (const b of shards) {
      if (b.z >= 0 !== near) continue;
      const x = b.x, y = b.z * FL - b.h, melt = Math.min(1, b.life / 0.4);
      if (b.kind === 2) {
        // a chunk: lit top left, dark bottom right, a dark rim; it melts smaller where it lies
        const ramp = [C[1], C[3], C[4], C[6], C[7]], ca = Math.cos(b.a), sa = Math.sin(b.a), sz = b.s * melt, r = Math.ceil(sz) + 1;
        if (sz < 0.5) continue;
        for (let py = -r; py <= r; py++)
          for (let px = -r; px <= r; px++) {
            const u = (px + 0.5) * ca + (py + 0.5) * sa, v = -(px + 0.5) * sa + (py + 0.5) * ca, d = Math.abs(u) / sz + Math.abs(v) / (sz * 0.62);
            if (d > 1.3) continue;
            p.px(Math.round(x) + px, Math.round(y) + py, d > 1 ? ramp[0] : v < 0 ? (u < 0 ? ramp[4] : ramp[3]) : u < 0 ? ramp[2] : ramp[1]);
          }
        continue;
      }
      const s = b.s * melt, ca = Math.cos(b.a), sa = Math.sin(b.a) * (b.rest ? FL : 1);
      if (s < 0.4) continue;
      for (let d = -s / 2; d <= s / 2; d += 0.5) p.px(x + ca * d, y + sa * d, d > s / 2 - 0.6 ? WHITE : b.c);
    }
  }
}
