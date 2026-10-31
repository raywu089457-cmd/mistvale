// Pure geometry helpers (no three.js). Points are plain [E, N, U] arrays in metres.

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export function norm(a) {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
export function dist(a, b) {
  return len(sub(a, b));
}

export function pathLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  return L;
}

// Remove consecutive duplicates (within eps) so tubes never get zero-length segments.
export function cleanPath(pts, eps = 1e-6) {
  const out = [];
  for (const p of pts) {
    if (!out.length || dist(out[out.length - 1], p) > eps) out.push(p);
  }
  return out;
}

// A planar frame: origin O, in-plane axes u (local x) and v (local y). Local 2D (x,y) -> 3D.
export function frameMap(O, u, v) {
  return (x, y) => [O[0] + u[0] * x + v[0] * y, O[1] + u[1] * x + v[1] * y, O[2] + u[2] * x + v[2] * y];
}

// Closed rounded rectangle, centreline half sizes hx, hy, corner radius R.
// Corner arc centres sit at (+-(hx-R), +-(hy-R)); with R = ds/2 + db/2 these are the corner-bar centres,
// so the wire wraps the corner bar exactly (touching). Returns CCW 2D points and the side index of each
// straight side: side 0 = top (after TR arc), 1 = left, 2 = bottom, 3 = right.
export function roundedRectLoop(hx, hy, R, nArc = 6) {
  const cx = hx - R, cy = hy - R;
  const arcs = [
    { ox: cx, oy: cy, a0: 0 },
    { ox: -cx, oy: cy, a0: Math.PI / 2 },
    { ox: -cx, oy: -cy, a0: Math.PI },
    { ox: cx, oy: -cy, a0: 1.5 * Math.PI },
  ];
  const arcPts = arcs.map((A) => {
    const pts = [];
    for (let s = 0; s <= nArc; s++) {
      const a = A.a0 + (Math.PI / 2) * (s / nArc);
      pts.push([A.ox + R * Math.cos(a), A.oy + R * Math.sin(a)]);
    }
    return pts;
  });
  return { arcPts, cx, cy };
}

// Build a closed rounded loop (2D) with its lap point P on side `lapSide` at fraction `lapFrac` (0..1 of side length),
// returning the loop starting at P, CCW, together with the local tangent t and inward normal n at P.
export function lapLoop(hx, hy, R, lapSide, lapFrac, nArc = 6) {
  const { arcPts } = roundedRectLoop(hx, hy, R, nArc);
  // straight side k runs from the end of arc k to the start of arc k+1
  const sideStart = (k) => arcPts[k][nArc];
  const sideEnd = (k) => arcPts[(k + 1) % 4][0];
  const sideA = sideStart(lapSide), sideB = sideEnd(lapSide);
  const P = [sideA[0] + (sideB[0] - sideA[0]) * lapFrac, sideA[1] + (sideB[1] - sideA[1]) * lapFrac];
  // assemble full CCW list with P inserted on its side
  const list = [];
  for (let k = 0; k < 4; k++) {
    arcPts[k].forEach((p, idx) => {
      if (idx === 0 && k !== 0) {
        // side before this arc already handled below
      }
      list.push(p);
    });
    if (k === lapSide) list.push(P);
  }
  // list currently: arc0 pts, [P if lap side 0], arc1 pts, ... ; find P index
  let iP = list.findIndex((p) => p === P);
  // rotate so the loop starts at P
  const loop = [];
  for (let i = 0; i < list.length; i++) loop.push(list[(iP + i) % list.length]);
  // the loop is closed: loop[0] = P ... last point is adjacent to P from behind
  const next = loop[1], t0 = [next[0] - P[0], next[1] - P[1]];
  const tl = Math.hypot(t0[0], t0[1]) || 1;
  const t = [t0[0] / tl, t0[1] / tl];
  const n = [-t[1], t[0]]; // left of CCW travel = inside
  return { loop, P, t, n };
}

// Hook tails at P. alpha is the bend angle (rad) between the tail and the loop leg. Returns the two tail end points
// (2D) given ext length. Tail A leaves the start of the loop (behind P), tail B leaves the end (ahead of P).
export function hookTailPoints(P, t, n, alphaA, alphaB, ext) {
  const vA = [Math.cos(alphaA) * t[0] + Math.sin(alphaA) * n[0], Math.cos(alphaA) * t[1] + Math.sin(alphaA) * n[1]];
  const vB = [-Math.cos(alphaB) * t[0] + Math.sin(alphaB) * n[0], -Math.cos(alphaB) * t[1] + Math.sin(alphaB) * n[1]];
  return {
    TA: [P[0] + ext * vA[0], P[1] + ext * vA[1]],
    TB: [P[0] + ext * vB[0], P[1] + ext * vB[1]],
  };
}

// Full hooked closed stirrup/tie as a 3D polyline: TA -> P -> loop (CCW) -> P -> TB.
export function hookedLoopPath(frame, hx, hy, R, lapSide, lapFrac, alphaA, alphaB, ext, nArc = 6) {
  const { loop, P, t, n } = lapLoop(hx, hy, R, lapSide, lapFrac, nArc);
  const { TA, TB } = hookTailPoints(P, t, n, alphaA, alphaB, ext);
  const pts2 = [TA, P, ...loop.slice(1), P, TB];
  return { pts: pts2.map((p) => frame(p[0], p[1])), P: frame(P[0], P[1]), t, n };
}

// Crosstie spanning the column core between two perimeter (interior) bars at (-xb, yc) and (+xb, yc).
// The straight wire runs tangent to the core side of each bar (distance Rw = ds/2 + db/2) and each end turns
// into the core by a hook tail: a 90 deg hook leaves perpendicular to the wire, a 135 deg hook leaves 45 deg
// off the wire (bend angle alpha measured from the leg). Tails never cross the bars or the ties.
export function crossTieWire(xb, yc, Rw, alphaL, alphaR, ext) {
  const L0 = [-xb + Rw, yc], R0 = [xb - Rw, yc];
  const dl = Math.PI - alphaL, dr = Math.PI - alphaR;       // deviation from the wire direction
  const tl = [L0[0] + ext * Math.cos(dl), L0[1] + ext * Math.sin(dl)];
  const tr = [R0[0] - ext * Math.cos(dr), R0[1] + ext * Math.sin(dr)];
  return [tl, L0, R0, tr];
}

// Sample a circular arc (3D) with centre c, radius r, in a plane spanned by unit vectors u, v, from a0 to a1 (radians).
export function arcPts3(c, r, u, v, a0, a1, n) {
  const out = [];
  for (let s = 0; s <= n; s++) {
    const a = a0 + (a1 - a0) * (s / n);
    out.push([c[0] + r * (Math.cos(a) * u[0] + Math.sin(a) * v[0]), c[1] + r * (Math.cos(a) * u[1] + Math.sin(a) * v[1]), c[2] + r * (Math.cos(a) * u[2] + Math.sin(a) * v[2])]);
  }
  return out;
}

// Deterministic PRNG (mulberry32) so every generated detail is reproducible.
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
