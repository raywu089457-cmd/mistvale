// Healing bloom for the game's 2:1 isometric camera: nature/healing-bloom rewritten for the floor the game sees,
// not its picture squashed, stretched or scaled. The recipe is the source's — a shoot pushes up out of the ground,
// leaves unfurl, a bud swells drawing light in, it opens round a glowing golden heart in a flare, petals and bevelled
// crosses of light drift up, then the petals let go one by one and the light shuts down. What changed:
//   - the shoot grows where the character stands (their feet are the effect's origin) and its blossom opens round
//     them: the petals splay outward on the 2:1 floor plane at the height of the heart, the far ones behind the
//     character and the near ones in front, so an open flower reads the way the camera sees it — a rosette round
//     the character rather than a flat star on the screen;
//   - the lit ring blooms out across the floor as a 2:1 ellipse, its far half dimmer, and the light it throws
//     washes the floor and lights the character all round;
//   - the petals that let go are thrown in 3-D, turning and drifting, and go out as they rise; the shoot withers
//     back into the ground at the end instead of fading.
// The character is the game's own: pass it as `actor` and the bloom lights it. 1 px = 1 character sprite px.
// The healing light (soft column, lit floor ring, motes and bevelled crosses drifting up) is adapted from Sprite
// Fusion's open-source heal (https://www.spritefusion.com/pixel-art-vfx/heal), MIT License, (c) 2026 Hugo Duprez.
import { Lights, P, Rng, fit, sparkle, clamp, smooth, ease, lerp, TAU, WHITE } from "../../core/index.js";
import { Fly3, FLOOR } from "../_iso.js";
import { drawLeaf } from "./_lib.js";

const FL = FLOOR, STEM = 0.42, BUD = 0.75, OPEN = 1.05, LIFT = 1.7, WILT = 2.4, H = 12, NPET = 6;
const END = 3.3 - 1 / 40;

export const meta = {
  name: "Healing bloom (iso)",
  desc: "nature/healing-bloom on the 2:1 floor: a shoot pushes up at the character's feet, a bud opens into a golden heart and petals of light bloom round them, then lift away.",
  tags: ["nature", "heal", "flower", "bloom", "aura", "buff", "character", "one-shot", "iso", "top-down"],
  size: [124, 120],
  origin: [62, 108],
  duration: 3.3,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  pixels: 1,
  options: {
    palette: ["#1c3222", "#2c5230", "#3a6b38", "#498540", "#5fa244", "#86c84e", "#c4ec7a", "#f4ffd0"],
    petal: ["#6b2a50", "#b4487a", "#ec8ab0", "#ffd8e8"],
    heart: ["#a8641a", "#f0b42e", "#ffe680", "#fffbe0"],
    seed: 4,
  },
};

// a bevelled cross of light, drawn solid (it thins out by going to a darker step, never by stippling)
function cross(p, x, y, L, C, k, glint) {
  const X = Math.round(x), Y = Math.round(y), arm = k < 0.3 ? C[3] : k < 0.62 ? C[5] : C[6], hi = k < 0.5 ? C[6] : WHITE;
  for (let i = -L; i <= L; i++) {
    p.px(X + i, Y, i < 0 ? hi : arm);
    p.px(X, Y + i, i < 0 ? hi : arm);
  }
  p.px(X, Y, glint ? WHITE : hi);
  for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) p.px(X + Math.round(dx * (L + 1) * 0.7), Y + Math.round(dy * (L + 1) * 0.7), C[2]);
  p.glow(x, y, 4 + L * 2, C[5], 0.26 * k);
}

export function create(o) {
  const C = fit(o.palette, 8), Pt = fit(o.petal, 4), Ht = fit(o.heart, 4), R = new Rng(o.seed), A = o.actor;
  const fly = new Fly3({ rng: R, sparks: [Ht[3], Ht[2], Ht[1], Ht[0]] }), lights = new Lights();
  const glyphs = [], flying = [];
  const petals = Array.from({ length: NPET }, (_, i) => ({ az: (i / NPET) * TAU + 0.3, at: LIFT + ((i * 0.37) % 1) * 0.55, gone: false }));
  let t = 0, sprouted = false, popped = false;
  const grow = () => ease.outCubic(clamp(t / STEM)) * (1 - ease.inCubic(clamp((t - WILT) / 0.6)));
  const sway = () => Math.sin(t * 2.6) * 0.8 * smooth(0.2, 0.6, t);
  const open = () => ease.outBack(clamp((t - BUD) / (OPEN - BUD)), 1.4);
  // the shoot's points from the ground to its tip: a gentle S that sways
  const stem = () => {
    const g = grow(), pts = [];
    for (let i = 0; i <= 8; i++) {
      const s = i / 8, h = g * H * s;
      pts.push({ x: Math.sin(s * 3.2) * 0.9 * s + sway() * s * s, y: -h, h });
    }
    return pts;
  };
  const heart = () => -H - 2;

  return {
    update(dt) {
      t += dt;
      const f = Math.min(1, dt * 120);
      // the ground breaks as the shoot pushes through: grit thrown up and a puff of dust
      if (!sprouted) {
        sprouted = true;
        for (let i = 0; i < 8; i++)
          fly.spawn(P.GRIT, R.range(-3, 3), R.range(-2, 2), 1, R.range(-25, 25), R.range(-15, 15), R.range(45, 95), R.range(0.4, 0.8), R.pick([C[2], C[3]]), 1);
        for (let i = 0; i < 3; i++)
          fly.spawn(P.DUST, R.range(-3, 3), R.range(-2, 2), R.range(1, 3), R.sign() * R.range(8, 26), R.range(-6, 6), R.range(4, 14), R.range(0.35, 0.6), C[3], R.range(1.6, 2.6));
      }
      // the bud draws light in while it swells
      if (t > STEM && t < BUD && R.chance(0.3 * f)) {
        const a = R.range(0, TAU), d = R.range(12, 24);
        fly.spawn(P.STREAK, Math.cos(a) * d, Math.sin(a) * d, H + R.range(-2, 7), -Math.cos(a) * d * 3.4, -Math.sin(a) * d * 3.4, 0, R.range(0.16, 0.24), R.chance(0.5) ? Ht[2] : C[6], 1);
      }
      // the flare as it opens
      if (!popped && t >= OPEN - 0.12) {
        popped = true;
        lights.add(0, heart(), 14, WHITE, 0.18, 0.08);
        lights.add(0, heart(), 48, Ht[2], 0.26, 0.5);
        for (let i = 0; i < 16; i++) {
          const a = R.range(0, TAU), sp = R.range(35, 95);
          fly.spawn(P.MOTE, Math.cos(a) * 3, Math.sin(a) * 3, H + R.range(-1, 4), Math.cos(a) * sp, Math.sin(a) * sp, R.range(20, 55), R.range(0.5, 0.9), R.chance(0.5) ? Ht[3] : C[7], 0.7);
        }
        for (let i = 0; i < 5; i++)
          fly.spawn(P.STAR, R.range(-8, 8), R.range(-4, 4), H + R.range(-4, 8), 0, 0, R.range(10, 30), R.range(0.3, 0.6), Ht[3], R.range(1, 2.2), { delay: R.range(0, 0.25) });
      }
      // while it blooms: crosses of light drift up round it, and warm embers
      if (t > OPEN && t < WILT && R.chance(0.07 * f))
        glyphs.push({ x: R.range(-24, 24), z: R.range(-8, 8), h: H + R.range(-2, 14), t0: t, life: Math.min(R.range(0.7, 1.1), END - 0.05 - t), L: R.chance(0.25) ? 2 : 1, seed: R.next() * 9 });
      if (t > OPEN - 0.1 && t < WILT && R.chance(0.18 * f))
        fly.spawn(P.EMBER, R.range(-20, 20), R.range(-8, 8), R.range(0, 10), R.range(-6, 6), R.range(-6, 6), R.range(24, 50), Math.min(R.range(0.6, 1.1), END - 0.05 - t), R.chance(0.6) ? C[6] : Ht[2], R.chance(0.3) ? 2 : 1);
      for (let i = glyphs.length - 1; i >= 0; i--) if (t - glyphs[i].t0 > glyphs[i].life) glyphs.splice(i, 1);
      // the petals let go one by one, thrown up and away, turning, until they twinkle out
      for (const q of petals)
        if (!q.gone && t >= q.at) {
          q.gone = true;
          const e = Math.PI / 2 - 0.2, dx = Math.sin(e) * Math.cos(q.az), dz = Math.sin(e) * Math.sin(q.az), L = 12;
          flying.push({ x: dx * L * 0.6, z: dz * L * 0.6, h: H + Math.cos(e) * L * 0.6, vx: dx * 26 + R.range(-8, 8), vz: dz * 18 + R.range(-6, 6), vh: R.range(22, 42), a: Math.atan2(dz * FL - Math.cos(e), dx), va: R.range(-4, 4), fl: 0, vf: R.range(5, 9), life: Math.min(R.range(0.75, 1.0), END - 0.1 - t) });
          flying[flying.length - 1].max = flying[flying.length - 1].life;
        }
      for (let i = flying.length - 1; i >= 0; i--) {
        const q = flying[i];
        if ((q.life -= dt) <= 0) {
          fly.spawn(P.STAR, q.x, q.z, q.h, 0, 0, R.range(4, 12), Math.min(0.3, END - 0.05 - t), Pt[3], 1.6);
          flying.splice(i, 1);
          continue;
        }
        q.vx -= q.vx * 1.5 * dt;
        q.vz -= q.vz * 1.5 * dt;
        q.vh -= q.vh * 0.9 * dt;
        q.x += q.vx * dt + Math.sin(q.fl) * 8 * dt;
        q.z += q.vz * dt;
        q.h += q.vh * dt;
        q.a += q.va * dt;
        q.fl += q.vf * dt;
      }
      fly.update(dt);
      lights.update(dt);
      fly.cap(Math.max(0.001, END - 0.05 - t));
    },

    drawBack(p) {
      if (t >= END) return;
      floorLight(p);
      // the far petals sit behind the character
      if (t > BUD - 0.05) for (const q of petals) if (Math.sin(q.az) < 0 && !q.gone) petal(p, q);
      for (const q of flying) if (q.z < 0) petalInFlight(p, q);
      fly.draw(p, (q) => q.z < 0);
    },

    draw(p) {
      if (t >= END) return;
      const top = stem()[8], g = grow(), op = open();
      // the light it throws lights the character all round while it stands
      const bloom = smooth(OPEN - 0.15, OPEN + 0.2, t) * (1 - smooth(WILT, WILT + 0.5, t));
      if (A?.mask && bloom > 0) {
        for (let row = 0; row < A.mask.h; row++)
          for (let col = 0; col < A.mask.w; col++) if (A.mask.data[row * A.mask.w + col]) p.light(A.x + col, A.y + row, C[5], 0.16 * bloom);
      }
      if (g > 0.02) {
        // the shoot: a 2 px stem, lit down one side
        for (let i = 1; i < 9; i++) {
          const a = stem()[i - 1], b = stem()[i];
          if (b.y > 0) continue;
          p.line(a.x, a.y, b.x, b.y, C[6]);
          p.line(a.x + 1, a.y, b.x + 1, b.y, C[3]);
        }
        // leaves unfurl off it
        for (const [i, sd, d] of [[3, -1, 0.1], [6, 1, 0.22]]) {
          const lk = ease.outBack(clamp((t - d - 0.12) / 0.3), 1.6) * (1 - smooth(WILT, WILT + 0.5, t) * 0.5), q = stem()[i];
          if (lk <= 0 || q.y > -1) continue;
          const la = sd < 0 ? -2.7 + 0.5 * (1 - lk) : -0.5 - 0.5 * (1 - lk);
          drawLeaf(p, q.x + Math.cos(la) * 5 * lk, q.y + Math.sin(la) * 5 * lk, 10 * lk, 3, la, 0.25, [C[1], C[3], C[5], C[6]]);
        }
        // the bud, then the heart once it opens
        if (t > STEM - 0.1 && t < OPEN - 0.1) {
          const b = clamp((t - STEM + 0.1) / (BUD - STEM)), w = 2 + 2.2 * b, h = 3.5 + 4.6 * b;
          p.ellipse(top.x, top.y - h * 0.5, w, h, (d, a) => (Math.cos(a) < -0.2 ? Pt[2] : d > 0.7 ? Pt[0] : Pt[1]), 1);
          p.glow(top.x, top.y - h * 0.5, 8 + 8 * b, Ht[2], 0.24 * b);
        }
      }
      // the near petals splay round the character
      if (t > BUD - 0.05) for (const q of petals) if (Math.sin(q.az) >= 0 && !q.gone) petal(p, q);
      // the heart at the centre of them
      if (t > OPEN - 0.12 && t < WILT + 0.3) {
        const pulse = 0.85 + 0.15 * Math.sin(t * 9), k = 1 - smooth(WILT - 0.3, WILT + 0.3, t), cy = heart();
        p.circle(0, cy, 3.3 * k, Ht[1]);
        p.circle(-0.5, cy - 0.5, 2.2 * k, Ht[2]);
        p.px(-1, cy - 1, Ht[3]);
        p.glow(0, cy, 12 * pulse, Ht[2], 0.26 * k);
        p.glow(0, cy, 26, C[5], 0.1 * k);
      }
      const e = t - OPEN + 0.12;
      if (e > 0 && e < 0.16) sparkle(p, 0, heart(), 9 * (1 - e / 0.16), Ht[3], Ht[2], 0.5);
      for (const q of flying) if (q.z >= 0) petalInFlight(p, q);
      for (const q of glyphs) {
        const k = (t - q.t0) / q.life;
        cross(p, q.x + Math.sin(k * 5 + q.seed) * 2, q.z * FL - q.h - k * 20, q.L, C, Math.sin(Math.PI * k), Math.sin(k * 14 + q.seed) > 0.8);
      }
      fly.draw(p, (q) => q.z >= 0);
      lights.draw(p);
    },
  };

  // the light on the floor: a soft wash round the feet and the lit ring blooming out across it (2:1, far half dim)
  function floorLight(p) {
    const wash = smooth(0, 0.4, t) * (1 - smooth(WILT, WILT + 0.7, t));
    const rx = 14 + 6 * smooth(0, 0.8, t), ry = rx * FL;
    for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++)
      for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++) {
        const d = Math.hypot(x / rx, y / ry);
        if (d > 1) continue;
        p.blend(x, y, d < 0.45 ? C[5] : C[4], 0.12 * (1 - d) * wash);
      }
    const k = clamp((t - OPEN + 0.12) / 0.6), out = 1 - smooth(1.9, 2.35, t);
    if (k > 0 && k < 1 && out > 0) {
      const r = (7 + 13 * ease.outCubic(k)) * out, n = Math.ceil(r * TAU * 1.3);
      for (let j = 0; j < n; j++) {
        const g = (j / n) * TAU, ca = Math.cos(g), sa = Math.sin(g);
        if (sa < 0) continue;   // the far half is drawn behind the character, in drawBack's floor pass
        p.px(ca * r, sa * r * FL, sa > 0.75 ? Ht[3] : C[7]);
        p.px(ca * (r - 1), sa * (r - 1) * FL, Ht[2]);
      }
    }
    // the far half of the ring, a step dimmer, behind the character
    if (k > 0 && k < 1 && out > 0) {
      const r = (7 + 15 * ease.outCubic(k)) * out, n = Math.ceil(r * TAU * 1.3);
      for (let j = 0; j < n; j++) {
        const g = (j / n) * TAU, ca = Math.cos(g), sa = Math.sin(g);
        if (sa >= 0) continue;
        p.px(ca * r, sa * r * FL, C[6]);
        p.px(ca * (r - 1), sa * (r - 1) * FL, C[5]);
      }
      p.glow(0, 0, r * 1.3, C[4], 0.1 * out);
    }
  }

  // a petal: from closed round the bud to splayed open in the floor plane round the heart, foreshortened by depth
  function petal(p, q) {
    const op = open(), e = lerp(0.15, Math.PI / 2 - 0.2, op), dx = Math.sin(e) * Math.cos(q.az), dz = Math.sin(e) * Math.sin(q.az), up = Math.cos(e);
    const L = lerp(9, 13, op), sx = dx, sy = dz * FL - up, len = L * Math.hypot(sx, sy), back = dz < 0;
    if (len < 1.5) return;
    const ang = Math.atan2(sy, sx), cy = heart();
    drawLeaf(p, sx * L * 0.5, cy + sy * L * 0.5, len + 1, 3 + (1 - Math.abs(dz)) * 0.8, ang, back ? 0.9 : 0.2, back ? [Pt[0], Pt[0], Pt[1], Pt[2]] : [Pt[0], Pt[1], Pt[2], Pt[3]]);
  }

  // a petal that has let go, tumbling and turning until it goes out
  function petalInFlight(p, q) {
    drawLeaf(p, q.x, q.z * FL - q.h, 6, 2.2, q.a, q.fl, [Pt[0], Pt[1], Pt[2], Pt[3]]);
  }
}
