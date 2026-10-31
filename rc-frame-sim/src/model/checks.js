// Independent checks on the generated model (pure JS; used by tests and the in-app "checks" readout).
import { dist, sub, add, mul, dot, len } from './geom.js';

// Closest distance between segments p1-q1 and p2-q2 (standard clamped solution).
export function segSegDistance(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s, t;
  const EPS = 1e-12;
  if (a <= EPS && e <= EPS) { s = 0; t = 0; }
  else if (a <= EPS) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
  else {
    const c = dot(d1, r);
    if (e <= EPS) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
    else {
      const b = dot(d1, d2), denom = a * e - b * b;
      s = denom > EPS ? Math.min(1, Math.max(0, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
      else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  const c1 = add(p1, mul(d1, s)), c2 = add(p2, mul(d2, t));
  return { d: dist(c1, c2), c1, c2 };
}

// Split bar paths into short pieces (for spatial hashing). Returns array of {a, b, bar, r}.
export function pieces(bars, maxLen = 0.05) {
  const out = [];
  for (const bar of bars) {
    const r = bar.dia / 2;
    const P = bar.path;
    let s = 0;
    let barLen = 0;
    for (let i = 1; i < P.length; i++) barLen += dist(P[i - 1], P[i]);
    for (let i = 1; i < P.length; i++) {
      const p = P[i - 1], q = P[i];
      const L = dist(p, q);
      const n = Math.max(1, Math.ceil(L / maxLen));
      for (let k = 0; k < n; k++) {
        const a = add(p, mul(sub(q, p), k / n));
        const b = add(p, mul(sub(q, p), (k + 1) / n));
        out.push({ a, b, bar: bar.id, r, seg: i - 1, s: s + L * (k / n), joinKey: joinKeyOf(bar), L: barLen });
      }
      s += L;
    }
  }
  return out;
}

// Column main pieces that are butt-joined under a coupler (or at the floor line) share one joinKey.
export function joinKeyOf(bar) {
  if (bar.perimeter === undefined || !bar.label) return null;
  return `${bar.label.split(' · ')[0]}|${bar.perimeter}`;
}

// Pairwise clash search with a uniform hash. Overlap depth = (r1 + r2) - distance.
// Pieces of the same bar that are consecutive (sharing a vertex) are ignored.
export function findClashes(bars, { cell = 0.10, tol = 0.0005, maxReport = 500 } = {}) {
  const ps = pieces(bars);
  const map = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  ps.forEach((p, idx) => {
    const m = mul(add(p.a, p.b), 0.5);
    const k = key(Math.floor(m[0] / cell), Math.floor(m[1] / cell), Math.floor(m[2] / cell));
    let arr = map.get(k);
    if (!arr) map.set(k, (arr = []));
    arr.push(idx);
  });
  const clashes = [];
  const seen = new Set();
  for (const [k, arr] of map) {
    const [cx, cy, cz] = k.split(',').map(Number);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const nk = key(cx + dx, cy + dy, cz + dz);
      const arr2 = map.get(nk);
      if (!arr2) continue;
      for (const i of arr) for (const j of arr2) {
        if (j <= i) continue;
        const A = ps[i], B = ps[j];
        if (A.bar === B.bar && Math.abs(A.seg - B.seg) <= 1) continue;
        // same wire: ignore pairs closer than 0.12 m along the wire (sharp bends such as hook tails at a lap)
        if (A.bar === B.bar && Math.abs(A.s - B.s) < 0.12) continue;
        // the two hook tails of one closed bar meet at its lap by design (both leave the lap point)
        if (A.bar === B.bar && ((A.s < 0.15 && B.s > B.L - 0.15) || (B.s < 0.15 && A.s > A.L - 0.15))) continue;
        // butt-joined column pieces under a coupler are one bar line
        if (A.joinKey && A.joinKey === B.joinKey) continue;
        // bounding rejection
        const rr = A.r + B.r + 0.02;
        if (Math.min(A.a[0], A.b[0]) - Math.max(B.a[0], B.b[0]) > rr) continue;
        if (Math.min(B.a[0], B.b[0]) - Math.max(A.a[0], A.b[0]) > rr) continue;
        const sd = segSegDistance(A.a, A.b, B.a, B.b);
        const depth = A.r + B.r - sd.d;
        if (depth > tol) {
          const pairKey = A.bar < B.bar ? `${A.bar}|${B.bar}` : `${B.bar}|${A.bar}`;
          if (seen.has(pairKey + '|' + Math.round(sd.c1[0] * 100) + ',' + Math.round(sd.c1[2] * 100))) continue;
          seen.add(pairKey + '|' + Math.round(sd.c1[0] * 100) + ',' + Math.round(sd.c1[2] * 100));
          clashes.push({ barA: A.bar, barB: B.bar, depth, at: sd.c1 });
          if (clashes.length >= maxReport) return clashes;
        }
      }
    }
  }
  return clashes;
}

// Tie spacing samples: returns list of {zone, spacing} for consecutive ties of a column.
export function tieSpacings(tieZs, lo, U0, U1) {
  const out = [];
  for (let i = 1; i < tieZs.length; i++) {
    const a = tieZs[i - 1], b = tieZs[i];
    const inZone = (z) => z <= U0 + lo + 1e-9 || z >= U1 - lo - 1e-9;
    const zone = inZone(a) && inZone(b) ? 'confinement' : (!inZone(a) && !inZone(b) ? 'centre' : 'transition');
    out.push({ zone, spacing: Math.round((b - a) * 1e6) / 1e6, a, b });
  }
  return out;
}

export const _len = len;
