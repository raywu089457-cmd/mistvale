// Leaf storm round the character for the game's 2:1 isometric camera: nature/leaf-storm rewritten for the floor the
// game sees, not its picture squashed, stretched or scaled. The recipe is the source's: leaves tumble up a rising
// spiral round the character, passing behind and in front, turning and flipping through edge-on, wrapped in bright
// bands of wind, with litter and dust swirling at their feet. What changed is the world:
//   - the spiral is a helix in the game's space, not a picture: each leaf rides a circle at its own height (x across,
//     z into the floor, screen y = z / 2 - h), so the turns open out into 2:1 ellipses round the character and the
//     far half of every turn is the far half of a real circle;
//   - the wind bands are rings round the body in 3-D: far halves behind and dim, heads flaring as they sweep past;
//   - the litter at the feet is swept round on the floor as 2:1 arcs and low dust, and the character is rim-lit by
//     the storm it stands in (its own silhouette, lit from the leaves).
// 1 px = 1 character sprite px (the floor is 32 x 16 px tiles).
import { cycle, fit, rng, smooth, clamp, lerp, TAU, WHITE } from "../../core/index.js";
import { FLOOR } from "../_iso.js";

export const meta = {
  name: "Leaf storm (iso)",
  desc: "nature/leaf-storm round the character on the 2:1 floor: leaves spiral up a real helix, pass behind and in front, wind bands ring the body and litter sweeps the feet.",
  tags: ["nature", "wind", "leaves", "buff", "aura", "actor", "loop", "iso", "top-down"],
  size: [124, 140],
  origin: [62, 108],
  duration: 2.4,
  loop: true,
  fps: 30,
  bg: "ground",
  actor: 2,
  pixels: 1,
  options: {
    palette: ["#1a2420", "#2e4038", "#4a6656", "#7a9a84", "#b4d0b8", "#eef8e8"],
    // the source's leaf ramp with its three near-black outline tones lifted to L >= 46: a leaf is 7-9 px, so its
    // 1 px outline was an island of near-black on the lit ground (the audit counted it as a speck). Same hues, a
    // shade lighter, so the outline still reads as the leaf's shadow side but not as grit.
    leaves: ["#1e4c22", "#2f7a2a", "#6cb83a", "#c8f070", "#5e3a14", "#a8701c", "#e8b42e", "#fff09a", "#663026", "#9a2e1c", "#e0642a", "#ffb070"],
    seed: 5,
  },
};

const TOP = 64;
// the spiral's radius at a height: tight at the feet, opening as the leaves climb
const ringR = (h) => 15 + 9 * clamp(h / TOP);

// a leaf tumbling: the source's own leaf (nature/_lib drawLeaf), inline because a rewrite imports only the core and
// the floor helpers. The camera sees the leaf's plane as it turns; it stays a billboard, upright in the air.
function drawLeaf(p, x, y, len, wid, ang, fl, pal, alpha) {
  const ca = Math.cos(ang), sa = Math.sin(ang), sq = Math.cos(fl), w = Math.max(0.55, Math.abs(sq) * wid), under = sq < 0;
  const R = Math.ceil(len / 2 + 2), X = Math.round(x), Y = Math.round(y);
  const inside = (i, j) => {
    const u = (i + 0.5) * ca + (j + 0.5) * sa + len / 2, v = -(i + 0.5) * sa + (j + 0.5) * ca;
    if (u < 0 || u > len) return 0;
    const half = w * Math.pow(Math.sin((Math.PI * u) / len), 0.75);
    return Math.abs(v) <= half ? (v < 0 ? 1 : 2) : 0;
  };
  for (let j = -R; j <= R; j++)
    for (let i = -R; i <= R; i++) {
      const s = inside(i, j);
      if (!s) {
        if (inside(i - 1, j) || inside(i + 1, j) || inside(i, j - 1) || inside(i, j + 1)) p.dot(X + i, Y + j, pal[0], alpha);
        continue;
      }
      const u = (i + 0.5) * ca + (j + 0.5) * sa + len / 2, v = -(i + 0.5) * sa + (j + 0.5) * ca;
      const rib = Math.abs(v) < 0.5 && u > len * 0.12 && u < len * 0.88 && w > 1.2;
      p.dot(X + i, Y + j, rib ? pal[1] : (s === 1) !== under ? pal[3] : pal[2], alpha);
    }
  p.dot(X - ca * (len / 2 + 1), Y - sa * (len / 2 + 1), pal[1], alpha);
}

// the character's own silhouette, so the storm can light it: the 1 px ring just outside the mask, and its rim
function rimOf(A) {
  const m = A.mask, inside = (i, j) => i >= 0 && j >= 0 && i < m.w && j < m.h && m.data[j * m.w + i] > 0;
  const edge = [], out = [];
  for (let j = -1; j <= m.h; j++)
    for (let i = -1; i <= m.w; i++) {
      const nb = inside(i - 1, j) + inside(i + 1, j) + inside(i, j - 1) + inside(i, j + 1);
      if (inside(i, j)) {
        if (nb < 4) edge.push([A.x + i, A.y + j]);
      } else if (nb) out.push([A.x + i, A.y + j]);
    }
  return { edge, out };
}

// leaves riding the helix: up from the floor, round two turns or so, flung out off the top
function leaves(p, L, t, seed, back) {
  cycle(t, meta.duration, 28, seed, (g) => g.range(1.5, 2.3), (age, life, R) => {
    const k = age / life, turns = R.range(1.4, 2.2), th = R.range(0, TAU) + turns * TAU * k;
    const cs = Math.cos(th), sn = Math.sin(th);
    if (sn < 0 !== back) return; // the far half of the circle is behind the character
    const h = lerp(1, TOP, Math.pow(k, 0.9)) + R.range(0, 6), fling = smooth(0.75, 1, k);
    const rr = ringR(h) * R.range(0.85, 1.15) + fling * 22;
    const x = cs * rr, y = sn * rr * FLOOR - h; // z into the floor, h up: the camera's own projection
    const a = Math.min(1, k * 7) * (1 - smooth(0.85, 1, k));
    const spin = R.range(-9, 9) * age + th, fl = age * R.range(5, 11), o = R.int(0, 2) * 4;
    const pal = back ? [L[o], L[o], L[o + 1], L[o + 2]] : [L[o], L[o + 1], L[o + 2], L[o + 3]];
    drawLeaf(p, x, y, R.range(6.5, 9), R.range(2.4, 3.3), spin, fl, pal, a);
    // a glint as it turns face on to the light
    if (!back && Math.abs(Math.cos(fl)) > 0.97) {
      p.px(x, y, WHITE);
      p.glow(x, y, 5, L[o + 3], 0.35 * a);
    }
  });
}

// wind bands: 1 px streaks on rings round the body in 3-D, climbing as they sweep so they read as wind spiralling
// up rather than hoops round a barrel; the far half is behind and dim, the head bright
function wind(p, C, t, seed, back) {
  for (let j = 0; j < 13; j++) {
    const R = rng(seed, j), h0 = R.range(3, TOP - 2), r = ringR(h0) * R.range(0.9, 1.3), K = R.int(2, 3), span = R.range(0.7, 1.7);
    const climb = R.range(2.4, 5.2) * (R.next() < 0.5 ? 1 : -1);
    const head = R.range(0, TAU) + (TAU * K * t) / meta.duration;
    for (let s = 0; s <= span; s += 0.5 / r) {
      const th = head - s, sn = Math.sin(th);
      if (sn < 0 !== back) continue;
      const k = s / span, x = Math.cos(th) * r, y = sn * r * FLOOR - (h0 + (head - th) * climb);
      const c = back ? (k < 0.25 ? C[3] : C[2]) : k < 0.09 ? C[5] : k < 0.32 ? C[4] : C[3];
      if (k < 0.5) p.dot(x, y, c);
      else p.blend(x, y, c, 1.5 * (1 - k));
    }
    if (!back && Math.sin(head) > 0) {
      const hx = Math.cos(head) * r, hy = Math.sin(head) * r * FLOOR - h0;
      p.px(hx, hy, WHITE);
      p.glow(hx, hy, 5, C[4], 0.16);
    }
  }
}

// at the feet: litter and dust swept round on the floor, and 2:1 arcs racing over it
function swirl(p, C, L, t, seed, back) {
  cycle(t, meta.duration, 14, seed, (g) => g.range(0.6, 1.1), (age, life, R) => {
    const k = age / life, th = R.range(0, TAU) + R.range(6, 9) * age, sn = Math.sin(th);
    if (sn < 0 !== back) return;
    const rr = R.range(10, 22) + k * 8, lift = 1 + k * R.range(2, 8), s = R.range(2, 3.5) * (0.6 + k);
    p.disc(Math.cos(th) * rr, sn * rr * FLOOR - lift, s, back ? C[2] : C[3], (1 - k) * Math.min(1, k * 6) * 0.3);
  });
  for (let j = 0; j < 6; j++) {
    const R = rng(seed + 9, j), rr = R.range(12, 24), th0 = R.range(0, TAU) + (TAU * 3 * t) / meta.duration, span = R.range(0.5, 1);
    for (let s = 0; s < span; s += 0.6 / rr) {
      const th = th0 - s, sn = Math.sin(th);
      if (sn < 0 !== back) continue;
      p.dot(Math.cos(th) * rr, sn * rr * FLOOR, s < span * 0.4 ? C[3] : C[2], 1 - s / span);
    }
  }
}

export function create(o) {
  const C = fit(o.palette, 6), L = fit(o.leaves, 12), A = o.actor, rim = A?.mask ? rimOf(A) : null;
  const D = meta.duration;

  return {
    update() {},
    drawBack(p, t) {
      if (!(t < D - 1e-6)) t = 0;
      // the storm's own light: a cool pool at the body, a green one on the floor round the feet
      p.glow(0, -26, 44, C[4], 0.12);
      p.glow(0, 2, 24, L[2], 0.11);
      if (rim) for (const [x, y] of rim.out) p.light(x, y, C[5], 0.24);
      swirl(p, C, L, t, o.seed * 3 + 1, true);
      wind(p, C, t, o.seed * 5 + 2, true);
      leaves(p, L, t, o.seed * 7 + 3, true);
    },
    draw(p, t) {
      if (!(t < D - 1e-6)) t = 0;
      if (rim) for (const [x, y] of rim.edge) p.light(x, y, C[4], 0.3);
      swirl(p, C, L, t, o.seed * 3 + 1, false);
      wind(p, C, t, o.seed * 5 + 2, false);
      leaves(p, L, t, o.seed * 7 + 3, false);
    },
  };
}
