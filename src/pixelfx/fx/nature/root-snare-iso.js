// Root snare for the game's 2:1 isometric camera: nature/root-snare rewritten for the floor the game sees, not its
// picture squashed, stretched or scaled. The recipe is the source's: the floor cracks, roots burst up out of it
// round the target and wind up their legs, cinch with a snap and hold while green light and small leaves open, then
// crack and crumble into bark, splinters and dust. What changed is the world it happens in:
//   - the cracks run out across the floor (jagged lines lying on the 2:1 ground round the feet), not along a line
//     on the screen, and the torn earth is a 2:1 patch that settles back flat at the end;
//   - every root stands on the floor at its own point round the feet and spirals up round them in 3D: the far
//     turns pass behind the character, the near turns in front, and it climbs as tall as the side view's;
//   - the bark is a tube lit on its upper side and dark beneath, ridges and rootlet hairs along it, the far turns a
//     step dimmer than the near ones;
//   - what breaks off (bark chunks, splinters, dust) flies in 3D (x, z, h) and lands at its own depth, kicking up
//     dust where it hits; the mossy light is thrown on the floor and up the legs, never a picture fading out.
// The target is the game's own character (at the origin): the effect draws no stand-in. 1 px = 1 sprite px.
// The hold-then-break (closes round the character, holds with glints, cracks, then bursts into tumbling pieces, mist
// and light) is adapted from Sprite Fusion's open-source ice freeze (https://www.spritefusion.com/pixel-art-vfx/ice),
// MIT License, Copyright (c) 2026 Hugo Duprez.
import { Lights, P, Rng, fit, sparkle, clamp, smooth, ease, lerp, TAU, WHITE } from "../../core/index.js";
import { Fly3, FLOOR, bandFloor } from "../_iso.js";
import { drawRock, stoneShape, drawLeaf } from "./_lib.js";

const FL = FLOOR, NP = 34, CINCH = 0.62, BREAK = 1.75, END = 2.7 - 1 / 40;
const GRAV = 950;

export const meta = {
  name: "Root snare (iso)",
  desc: "nature/root-snare on the 2:1 floor: the ground cracks, roots burst up round the target's feet and spiral up their legs, cinch with a snap, then crumble into bark and dust.",
  tags: ["nature", "roots", "plant", "snare", "root", "status", "actor", "one-shot", "iso", "top-down"],
  size: [128, 96],
  origin: [64, 78],
  duration: 2.7,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  pixels: 1,
  options: {
    // soil ramp lifted clear of L46 (the near-black tones broke into isolated pixels at crack tips and along the
  // root tubes); the moss glow still carries the contrast.
  palette: ["#3f2a19", "#4a321e", "#553a22", "#64462a", "#86623a", "#a8824e", "#ccaa70", "#ecd6a0"],
    glow: ["#123818", "#2f7a2a", "#6cb83a", "#c8f070"],
    seed: 7,
  },
};

export function create(o) {
  const C = fit(o.palette, 8), G = fit(o.glow, 4), R = new Rng(o.seed);
  const fly = new Fly3({ rng: R, sparks: [G[3], G[2], G[1], G[0]] }), lights = new Lights();
  const chunks = [];
  const roots = Array.from({ length: 5 }, (_, i) => ({
    th0: (i / 5) * TAU + R.range(-0.3, 0.3), dir: i % 2 ? 1 : -1, turns: R.range(1.1, 1.6), r0: R.range(14, 19),
    leg: R.range(9, 11), h: R.range(13, 24), at: 0.16 + i * 0.07 + R.range(0, 0.04), buds: [R.range(0.35, 0.55), R.range(0.6, 0.85)],
  }));
  // a jagged crack running out across the floor from under the feet, one under each root
  const cracks = roots.map((r) => {
    const pts = [], len = R.range(17, 26);
    let a = r.th0, d = 1.5;
    while (d < len) {
      pts.push({ x: Math.cos(a) * d, z: Math.sin(a) * d });
      d += R.range(2.5, 5);
      a += R.range(-0.17, 0.17);
    }
    return pts;
  });
  // the bark ramp the pieces are drawn with: the soil ramp one step up, because a 2-3 px chunk's dark outline was
  // an island of near-black on the lit floor (the audit counted it as grit). The darkest step stays for the thick
  // root tube, whose outline is a long connected contour and never a lone speck.
  const BARK = [C[2], C[2], C[3], C[3], C[4], C[4], C[5]];
  let t = 0, cinched = false, broken = false;
  const grow = (r) => ease.outCubic(clamp((t - r.at) / 0.32));
  const squeeze = () => smooth(CINCH - 0.03, CINCH + 0.05, t) * (1 - 0.4 * smooth(CINCH + 0.05, CINCH + 0.25, t));
  const settle = () => smooth(BREAK + 0.45, END - 0.02, t);   // the torn ground settling flat again

  // the root's spine: a 3D spiral round the target's legs, from its point on the floor up to its tip
  function path(r, cinch) {
    const pts = [];
    for (let i = 0; i <= NP; i++) {
      const s = i / NP, th = r.th0 + r.dir * TAU * r.turns * s;
      const rad = lerp(r.r0, r.leg - cinch * 1.6, ease.outCubic(Math.min(1, s * 3.5)));
      const h = r.h * Math.pow(s, 1.05);
      pts.push({ x: Math.cos(th) * rad, z: Math.sin(th) * rad, h, y: Math.sin(th) * rad * FL - h, s });
    }
    return pts;
  }

  // a tapered tube of bark along the spine, lit on its upper side, dark beneath; the far turns a step dimmer
  function root(p, pts, g, back) {
    const n = Math.floor(NP * g);
    for (let i = 0; i < n; i++) {
      const A = pts[i], B = pts[i + 1], zm = (A.z + B.z) * 0.5;
      if ((zm >= 0) !== back) continue;
      const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
      let nx = -dy / L, ny = dx / L;
      if (nx * -0.6 + ny * -0.8 < 0) (nx = -nx), (ny = -ny);   // the normal toward the light (up and left)
      const w = (1.2 + 3.0 * Math.pow(1 - A.s, 0.8)) / 2 + 0.3, n = Math.ceil(w);
      for (let k = -n; k <= n; k++) {
        const q = k / w;
        const col = back
          ? q < -0.4 ? 0 : q < 0.3 ? 1 : 2
          : k === -n ? 0 : q < -0.4 ? 1 : q < 0.2 ? 2 : q < 0.75 ? 3 : 4;
        p.line(A.x + nx * k, A.y + ny * k, B.x + nx * k, B.y + ny * k, C[col]);
      }
      if (!back && i % 8 === 2) p.px(A.x + nx * w, A.y + ny * w, C[5]);
      // a rootlet hair off the dark underside, now and then
      if (i % 7 === 3 && w > 1.2 && !back) p.px(A.x - nx * (w + 1), A.y - ny * (w + 1), C[2]);
    }
  }

  // a stone chunk of bark: born on a root, thrown, lands at its own depth, settles and crumbles to dust
  function chunk(x, z, h, vx, vz, vh, s, life) {
    chunks.push({ x, z, h, vx, vz, vh, a: R.range(0, TAU), va: R.range(-12, 12), s, pts: stoneShape(R), life, max: life, rest: false, dirt: false });
  }

  return {
    update(dt) {
      t += dt;
      const f = Math.min(1, dt * 120);
      // the ground splits: grit jumps out of the cracks, mossy light seeps up
      if (t < 0.4 && R.chance(0.3 * f)) {
        const c = R.pick(cracks), q = c[Math.min(c.length - 1, R.int(1, c.length - 1))];
        fly.spawn(P.GRIT, q.x, q.z, 1, R.range(-20, 20), R.range(-12, 12), R.range(30, 90), R.range(0.5, 0.9), R.pick([C[5], C[4]]), 1);
      }
      // each root bursts up where it stands: stones thrown, a puff of dust, a pop of moss light
      for (const r of roots)
        if (!r.burst && t >= r.at) {
          r.burst = true;
          const x = Math.cos(r.th0) * r.r0, z = Math.sin(r.th0) * r.r0;
          for (let i = 0; i < 3; i++) chunk(x + R.range(-2, 2), z + R.range(-2, 2), R.range(1, 5), Math.cos(r.th0) * R.range(10, 40) + R.range(-30, 30), Math.sin(r.th0) * R.range(10, 40) + R.range(-25, 25), R.range(60, 150), R.range(1.2, 2), R.range(0.6, 0.9));
          for (let i = 0; i < 3; i++) fly.spawn(P.DUST, x + R.range(-3, 3), z + R.range(-2, 2), R.range(1, 4), R.range(-18, 18), R.range(-10, 10), R.range(4, 18), R.range(0.4, 0.8), C[4], R.range(1.6, 2.6));
          lights.add(x, z * FL - 4, 12, G[2], 0.1, 0.25);
        }
      // the cinch: a snap of green light, dust thrown off the legs, quick stars
      if (!cinched && t >= CINCH) {
        cinched = true;
        lights.add(0, -10, 22, G[2], 0.11, 0.25);
        lights.add(0, -10, 12, WHITE, 0.1, 0.05);
        for (let i = 0; i < 8; i++) fly.spawn(P.DUST, R.range(-12, 12), R.range(-5, 5), R.range(1, 5), R.sign() * R.range(20, 60), R.range(-18, 18), R.range(6, 20), R.range(0.5, 0.9), C[4], R.range(1.6, 2.6));
        for (let i = 0; i < 6; i++) fly.spawn(P.STAR, R.range(-9, 9), R.range(-5, 5), R.range(4, 18), 0, 0, R.range(-8, 4), R.range(0.25, 0.5), G[3], R.range(0.8, 1.8), { delay: R.range(0, 0.1) });
        for (const r of roots) (r.snap = true);
      }
      // while it holds: motes of green light rise off the roots
      if (t > CINCH && t < BREAK && R.chance(0.06 * f)) {
        const r = R.pick(roots), th = r.th0 + r.dir * TAU * r.turns * R.range(0.3, 0.95);
        fly.spawn(P.MOTE, Math.cos(th) * r.leg, Math.sin(th) * r.leg, R.range(4, r.h * 0.9), R.range(-6, 6), R.range(-5, 5), R.range(10, 26), R.range(0.5, 0.9), G[3], 0.6);
      }
      // it breaks: every root crumbles into bark chunks and splinters along its length, smoke rises
      if (!broken && t >= BREAK) {
        broken = true;
        lights.add(0, -10, 20, G[2], 0.1, 0.2);
        for (const r of roots) {
          const pts = path(r, 1);
          for (let i = 2; i < NP; i += 5) {
            const q = pts[i], w = 1.4 + 3.6 * Math.pow(1 - q.s, 0.8);
            chunk(q.x, q.z, Math.max(q.h, 1), (Math.sign(q.x) || 1) * R.range(18, 55) + q.x * 2, (Math.sign(q.z) || 1) * R.range(6, 26) + q.z * 2, R.range(30, 110), clamp(w * 0.75, 1.4, 3), Math.min(R.range(0.5, 0.75), END - 0.03 - t));
            if (i % 10 === 2) fly.spawn(P.GRIT, q.x, q.z, q.h, R.range(-40, 40), R.range(-30, 30), R.range(-10, 70), Math.min(R.range(0.6, 0.9), END - 0.03 - t), R.pick([C[4], C[3], C[2]]), R.chance(0.3) ? 2 : 1);
          }
        }
        for (let i = 0; i < 10; i++) fly.spawn(P.SMOKE, R.range(-12, 12), R.range(-6, 6), R.range(2, 10), R.range(-15, 15), R.range(-10, 10), R.range(0, 5), Math.min(R.range(0.6, 0.9), END - 0.03 - t), C[5], R.range(3, 5));
      }
      // the bark pieces: thrown, they fall, bounce once at their own depth, then crumble where they lie
      for (let i = chunks.length - 1; i >= 0; i--) {
        const c = chunks[i];
        c.life -= dt;
        if (c.life <= 0) {
          fly.spawn(P.DUST, c.x, c.z, 1, R.range(-8, 8), R.range(-6, 6), R.range(2, 8), 0.3, C[4], R.range(1.4, 2.2));
          chunks.splice(i, 1);
          continue;
        }
        if (!c.rest) {
          c.vh -= GRAV * dt;
          c.vx *= Math.exp(-0.3 * dt); c.vz *= Math.exp(-0.3 * dt);
          c.x += c.vx * dt; c.z += c.vz * dt; c.h += c.vh * dt;
          c.x = clamp(c.x, -46, 46); c.z = clamp(c.z, -20, 30);
          c.a += c.va * dt;
          if (c.h <= 0) {
            c.h = 0;
            if (-c.vh > 110) {
              c.vh = -c.vh * 0.3; c.vx *= 0.6; c.vz *= 0.6;
              fly.spawn(P.DUST, c.x, c.z, 1, R.range(-8, 8), R.range(-6, 6), R.range(2, 8), 0.35, C[5], R.range(1.4, 2.4));
            } else { c.rest = true; c.vh = 0; c.vx = 0; c.vz = 0; }
          }
        }
      }
      fly.update(dt);
      lights.update(dt);
      fly.cap(Math.max(0.001, END - 0.03 - t));
    },

    drawBack(p) {
      if (t >= END) return;
      floorMark(p);
      // the mossy light sits on the floor and behind the roots, not over them
      const hold = smooth(0.3, CINCH, t) * (1 - smooth(BREAK, BREAK + 0.3, t)) * (0.8 + 0.2 * Math.sin(t * 8));
      if (hold > 0) p.glow(0, -12, 22, G[2], 0.1 * hold), p.glow(0, -1, 16, G[2], 0.05 * hold);
      // the roots that pass behind the target, their leaves, and the pieces behind them
      if (t < BREAK) for (const r of roots) if (t > r.at) root(p, path(r, squeeze()), grow(r), true);
      if (t >= CINCH + 0.1 && t < BREAK) for (const r of roots) leaves(p, r, path(r, squeeze()), true);
      debris(p, true);
      fly.draw(p, (q) => q.z < 0);
    },

    draw(p) {
      if (t >= END) return;
      if (t < BREAK) {
        for (const r of roots) {
          if (t <= r.at) continue;
          root(p, path(r, squeeze()), grow(r), false);
        }
        if (t >= CINCH + 0.1) for (const r of roots) leaves(p, r, path(r, squeeze()), false);
        // the snap as they cinch, and the white flash just before they go
        const e = t - CINCH;
        if (e > 0 && e < 0.12) for (const [x, y] of [[-8, -6], [8, -10], [-7, -15]]) sparkle(p, x, y, 5 * (1 - e / 0.12), C[7], G[3], 0.4);
        const w = BREAK - t;
        if (w > 0 && w < 0.05) for (const r of roots) for (const q of path(r, 1)) if (q.z >= 0) p.px(q.x, q.y, WHITE);
      }
      debris(p, false);
      fly.draw(p, (q) => q.z >= 0);
      lights.draw(p);
    },
  };

  // the torn ground: a 2:1 patch of broken earth under the feet, the jagged cracks, and a ring of mossy light that
  // blooms out at the cinch; all of it settles flat again as the dust does
  function floorMark(p) {
    const open = ease.outCubic(clamp(t / 0.25)), hot = smooth(0, 0.25, t) * (1 - smooth(0.35, 0.9, t)), fl = 1 - settle();
    const rr = (4 + 6 * open) * fl;
    if (rr > 0.6) p.ellipse(0, 0, rr, rr * FL, (d, ang) => (d > 0.86 ? (Math.cos(3 * ang + 0.7) > 0 ? C[2] : C[1]) : d > 0.4 ? C[1] : C[0]), 1);
    for (const c of cracks) {
      const m = Math.max(2, Math.ceil(c.length * open * (1 - settle() * 0.85)));
      for (let k = 1; k < m; k++) {
        const [x0, z0] = [c[k - 1].x, c[k - 1].z], [x1, z1] = [c[k].x, c[k].z];
        p.line(x0, z0 * FL + 1, x1, z1 * FL + 1, C[0]);
        p.line(x0, z0 * FL, x1, z1 * FL, hot > 0.5 ? G[2] : C[1]);
        if (k % 3 === 2) p.glow(x1, z1 * FL, 5, G[2], 0.14 * hot);
      }
    }
    // the ring of light the cinch throws out over the floor
    const kin = smooth(CINCH - 0.05, CINCH + 0.06, t) * (1 - smooth(CINCH + 0.34, CINCH + 0.62, t));
    if (kin > 0) {
      const kr = 11 + 13 * smooth(CINCH, CINCH + 0.32, t);
      bandFloor(p, 0, 0, kr, 1.2, 1, [C[1], C[2], C[3], G[1], G[2]], (g) => Math.sin(g) < -0.9 + 1.8 * kin);
      p.glow(0, 0, kr * 1.2, G[2], 0.06 * kin);
    }
    // the little cracks' mouths bulge as each root pushes through
    for (const r of roots) {
      const a = t - r.at;
      if (a < 0 || a > 0.34) continue;
      const x = Math.cos(r.th0) * r.r0, y = Math.sin(r.th0) * r.r0 * FL, k = a / 0.34;
      p.ellipse(x, y - 1, 2.4 + 4 * ease.outCubic(k), (2.4 + 4 * ease.outCubic(k)) * FL * 0.8, (d) => (d > 0.55 ? C[3] : d > 0.3 ? C[1] : 0), 1);
      p.glow(x, y - 1, 7, G[2], 0.12 * (1 - k));
    }
  }

  // small leaves unfolding off a root once the snare has hold of them, back ones a step dimmer
  function leaves(p, r, pts, back) {
    for (const b of r.buds) {
      const q = pts[Math.floor(b * NP)], lk = clamp((t - CINCH - 0.1 - b * 0.2) / 0.25);
      if (lk <= 0 || (q.z >= 0) !== back) continue;
      // the moss ramp one step up from the source's darkest green: a 4 px leaf's 1 px outline sat on the lit floor
      // as an island of dark green, which the audit counts as a speck (source tones, a shade lighter)
      drawLeaf(p, q.x, q.y - 1, 4 * lk, 1.2, -0.6 + Math.sin(t * 5 + b * 9) * 0.2, 0.3, back ? [G[1], G[1], G[1], G[2]] : [G[1], G[2], G[2], G[3]]);
    }
  }

  // the pieces of bark in the air, behind the target first and in front after
  function debris(p, back) {
    for (const c of chunks) {
      if ((c.z >= 0) !== back) continue;
      const k = clamp(c.life / 0.14), s = c.s * (0.4 + 0.6 * Math.min(1, k));
      if (s < 0.6) continue;
      drawRock(p, c.x, c.z * FL - c.h, s, c.a, c.pts, BARK, 1);
    }
  }
}
