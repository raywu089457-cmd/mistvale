// Thorn aegis (Mistvale-local): the paladin's 荊棘聖甲 drawn as holy/divine-shield's gold bubble with a briar grown
// over it. The bubble is the divine shield's own (../holy/_shield.js, same film, globe, rim and seal); on top of it:
//   - hooked thorns stand out of the bubble's surface along its normals, each a tapered horn in the game's 3-D
//     (its axis is the sphere's normal, its point curls down over the surface), brown wood lit from the upper left
//     with a green-tinged belly. Those on the far side of the sphere are drawn behind the character and seen through
//     the film, those on the near side in front of it;
//   - three vines climb the bubble from the seal in slow spirals, leaves along them, the same front/back split;
//   - it opens hard (the cast's burst): the vines race up as the bubble grows and every thorn punches out of the
//     film with a big overshoot, a flash of green light and a spray of grit and leaf motes off its base;
//   - while the buff holds, thorns glint now and then; a re-cast (`pulse`) jabs them out again; when the buff ends
//     (`release`) the thorns pull back into the film as the bubble bursts from the top down, taking the vines with it.
// The game keeps one on the paladin for as long as `buffs.thorns` lasts (pixel-world syncLiveFx), like the shield.
// 1 px = 1 character sprite px.
import { P, Rng, fit, clamp, smooth, ease, TAU, WHITE, cycle, sparkle } from "../../../pixelfx/core/index.js";
import { GOLD } from "../../../pixelfx/fx/holy/_lib.js";
import { drawLeaf } from "../../../pixelfx/fx/nature/_lib.js";
import { createShield, project, CY, RELEASE_TIME } from "../holy/_shield.js";

export const meta = {
  name: "Thorn aegis (iso, follows)",
  desc: "The divine shield's gold bubble with a briar on it: hooked thorns punch out of the film along its normals and vines spiral up from the seal; it holds while the thorns buff lasts and pulls its thorns in as the bubble bursts.",
  tags: ["nature", "holy", "thorns", "shield", "bubble", "buff", "character", "loop", "follow", "iso", "top-down"],
  size: [124, 112],
  origin: [62, 84],
  duration: 2.4,
  loop: true,
  release: RELEASE_TIME,
  fps: 30,
  bg: "ground",
  actor: 2,
  pixels: 1,
  options: {
    palette: GOLD,
    // thorn wood (dark to pale) and the briar's greens
    wood: ["#140d0a", "#2a1a12", "#43301c", "#5f4626", "#7f6232", "#a3884a", "#cdb878", "#f1e6b8"],
    leaf: ["#0c1a0e", "#1d3d1a", "#2f6a26", "#5aa23a", "#9ed45a", "#d6f598"],
    radius: 32,
    thorns: 13,
    delay: 0,
    seed: 11,
    release: false,
    pulse: 0,
  },
};

const SPROUT = 0.16;   // how long a thorn takes to punch out (with its overshoot)

export function create(o) {
  const S = createShield(o, { tint: 0.85 });
  const W = fit(o.wood, 8), L = fit(o.leaf, 6), R = new Rng((o.seed | 0) + 101), r = S.r, T0 = S.T0;
  const leafPal = [L[0], L[1], L[2], L[3]];
  // ---- the thorns: points on the sphere (never on the floor, never straight up), their normals and their curl ----
  const n = Math.max(6, o.thorns | 0), THORNS = [];
  const latMin = Math.asin(clamp((3 - CY) / r, -1, 1));   // the lowest latitude still a few px over the floor
  for (let i = 0; i < n; i++) {
    const lon = (i / n) * TAU + R.range(-0.25, 0.25);
    const lat = clamp(latMin + 0.12 + ((i * 7) % n) / n * (1.05 - latMin) + R.range(-0.08, 0.08), latMin + 0.05, 1.15);
    const nx = Math.cos(lat) * Math.sin(lon), ny = Math.sin(lat), nz = Math.cos(lat) * Math.cos(lon);
    // "down over the surface": the part of straight down that is tangent to the sphere here
    let dx = ny * nx, dy = -1 + ny * ny, dz = ny * nz;
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    const big = R.range(0, 1);
    THORNS.push({
      nx, ny, nz, dx, dy, dz,
      len: 10 + 7 * big, w: 4.4 + 2.6 * big, hook: R.range(0.22, 0.4),
      at: T0 + 0.1 + (i / n) * 0.22 + R.range(0, 0.03), seed: R.int(1, 999), out: false,
      h0: CY + r * ny,
    });
  }
  // the far ones first, so a near thorn is always over a far one
  THORNS.sort((a, b) => a.nz - b.nz);
  // ---- the vines: spirals from the seal up over the bubble ----
  const VINES = [0.4, 2.5, 4.6].map((lon0, k) => ({ lon0: lon0 + R.range(-0.3, 0.3), turn: (k % 2 ? -1 : 1) * R.range(1.3, 1.9), top: R.range(0.95, 1.25), seed: R.int(1, 99) }));

  const thornLen = (s) => {
    const t = S.t;
    if (t < s.at) return 0;
    let k = ease.outBack(clamp((t - s.at) / SPROUT), 3.4);          // punch out past its length and settle back
    k *= 1 + 0.35 * S.pulseK();                                     // a re-cast jabs them out again
    if (S.T2 !== Infinity) k *= 1 - smooth(S.T2 - 0.02, S.T2 + 0.16, t);   // released: pulled back into the film
    return Math.max(0, k);
  };
  const vineGrow = () => clamp((S.t - T0 - 0.04) / 0.5);

  return {
    update(dt) {
      S.update(dt);
      for (const s of THORNS) {
        if (s.out || S.t < s.at) continue;
        s.out = true;
        // the punch: grit off the film and leaf motes thrown along the normal, a flash of green at the base
        const bx = s.nx * r, bh = s.h0, bz = s.nz * r;
        for (let i = 0; i < 4; i++)
          S.fly.spawn(P.GRIT, bx, bz, bh, s.nx * R.range(30, 80) + R.range(-15, 15), s.nz * R.range(30, 80) + R.range(-15, 15), s.ny * 50 + R.range(20, 70), R.range(0.3, 0.55), R.pick([W[4], W[3], W[5]]), R.chance(0.3) ? 2 : 1);
        for (let i = 0; i < 2; i++)
          S.fly.spawn(P.MOTE, bx, bz, bh, s.nx * 25, s.nz * 25, R.range(15, 45), R.range(0.35, 0.6), R.pick([L[4], L[5]]), 1);
        S.lights.add(bx, -bh + bz * 0.5, 10, L[4], 0.55, 0.18);
      }
    },
    drawBack(p) {
      S.back(p);
      if (S.t < T0) return;
      vines(p, false);
      for (const s of THORNS) if (s.nz < 0) thorn(p, s);
    },
    draw(p) {
      S.front(p);
      if (S.t < T0) return;
      vines(p, true);
      for (const s of THORNS) if (s.nz >= 0) thorn(p, s);
      // the odd glint running up a thorn while it stands
      if (S.t > T0 + 0.6 && S.T2 === Infinity)
        cycle(S.t - T0, 1.8, 4, (o.seed | 0) + 7, (g) => g.range(0.2, 0.35), (age, life, Rr) => {
          const s = THORNS[Math.floor(Rr.next() * THORNS.length)];
          if (s.nz < -0.2) return;
          const f = age / life, ln = thornLen(s) * s.len * (0.3 + 0.6 * f);
          const [x, y] = project(s.nx * (r + ln), s.h0 + s.ny * ln, s.nz * (r + ln));
          sparkle(p, x, y, 1.5 + 1.5 * Math.sin(f * Math.PI), WHITE, W[7], 0.5);
        });
    },
  };

  // One thorn: a tapered horn along the sphere's normal, its point curling down over the surface. Drawn as a stack
  // of discs from base to tip, each a run of pixels across, lit on its upper-left side.
  function thorn(p, s) {
    const k = thornLen(s), Lh = s.len * k;
    if (Lh < 0.8 || s.h0 > S.torn() + 2 || s.h0 > S.grown() + 1) return;
    const white = S.t - s.at < 0.035;
    const steps = Math.ceil(Lh * 2) + 2;
    let px0 = null;
    for (let i = 0; i <= steps; i++) {
      const f = i / steps, along = Lh * f, curl = s.hook * Lh * f * f * f;
      const X = s.nx * (r - 0.5 + along) + s.dx * curl, H = CY + s.ny * (r - 0.5 + along) + s.dy * curl, Z = s.nz * (r - 0.5 + along) + s.dz * curl;
      if (H < 0.5) continue;
      const [x, y] = project(X, H, Z);
      const hw = (s.w / 2) * Math.pow(1 - f, 1.15) + 0.35;
      for (let u = -hw; u <= hw; u += 1) {
        const q = (u + hw) / (2 * hw);
        let c;
        if (white) c = WHITE;
        else if (f > 0.86) c = q < 0.5 ? W[7] : W[5];
        else c = q < 0.12 ? W[6] : q < 0.3 ? W[5] : q < 0.62 ? W[4] : q < 0.82 ? W[3] : W[2];
        p.px(x + u, y, c);
        // a green tinge on its belly, where the briar's sap shows through the bark
        if (!white && q > 0.62 && f < 0.5 && ((s.seed + i) & 3) === 0) p.blend(x + u, y, L[2], 0.45);
      }
      // dark outline on the right and under it, so it holds against the bright film
      if (!white) { p.dot(x + hw + 1, y, W[0], 0.8); if (f < 0.9) p.dot(x, y + 1, W[1], 0.35); }
      px0 = [x, y];
    }
    // its punch: a flash of green at the base while it comes out
    const age = S.t - s.at;
    if (age < 0.25) {
      const [bx, by] = project(s.nx * r, s.h0, s.nz * r);
      p.glow(bx, by, 6 + s.w, L[4], 0.45 * (1 - age / 0.25));
    }
    if (px0 && S.pulseK() > 0.3) p.glow(px0[0], px0[1], 4, L[5], 0.35 * S.pulseK());
  }

  // Three vines, each a spiral on the sphere from the seal up toward the top, grown as the bubble grows and gone
  // where the bubble has burst; leaves every few px, alternating sides. near: draw the half facing the viewer.
  function vines(p, near) {
    const g = vineGrow();
    if (g <= 0) return;
    const tear = S.torn(), gr = S.grown(), rr = r + 0.6;
    for (const v of VINES) {
      const latA = Math.asin(clamp((1 - CY) / rr, -1, 1)), latB = v.top, m = 64, end = Math.floor(m * g);
      let prev = null, leafN = 0;
      for (let i = 0; i <= end; i++) {
        const u = i / m, lat = latA + (latB - latA) * u, lon = v.lon0 + v.turn * u;
        const X = rr * Math.cos(lat) * Math.sin(lon), Y = rr * Math.sin(lat), Z = rr * Math.cos(lat) * Math.cos(lon), H = CY + Y;
        const front = Z >= 0;
        if (H > tear || H > gr + 1) { prev = null; continue; }
        const [x, y] = project(X, H, Z);
        if (front === near) {
          const tip = i > end - 3;
          if (prev) p.line(prev[0], prev[1], x, y, tip ? L[4] : L[2]);
          p.dot(x + 1, y, L[1], 0.9);
          p.dot(x, y - 1, L[3], 0.7);
          if (i % 7 === 3 && !tip) {
            const side = (leafN++ % 2) ? 1 : -1, ang = Math.atan2(y - (prev ? prev[1] : y), x - (prev ? prev[0] : x)) + side * 1.1;
            drawLeaf(p, x + Math.cos(ang) * 2.5, y + Math.sin(ang) * 2.5, 5, 1.7, ang, 0.4 * side, leafPal, 1);
          }
        }
        prev = front === near ? [x, y] : null;
      }
    }
  }
}
