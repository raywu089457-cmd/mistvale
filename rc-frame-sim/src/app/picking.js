// Click picking that follows the displaced geometry. Bars, couplers, spacers and member volumes are tested on the CPU
// with the same offsets the GPU applies, so every visible part resolves while exploded, cut away or mid-pour.
import { segSegDistance } from '../model/checks.js';
import { storeyOffset, memberOffset, groupOffset, groupIndex, GROUP_NAMES } from '../model/explode.js';
import { memberProgress } from '../model/schedule.js';

const W3 = (v) => [v[0], v[2], -v[1]];     // engineering vector -> world vector

export function createPicker(model) {
  // precompute per-bar world paths and bounding spheres (engineering space)
  const bars = model.bars.map((b) => {
    const pts = b.path.map(W3);
    let cx = 0, cy = 0, cz = 0;
    for (const p of pts) { cx += p[0]; cy += p[1]; cz += p[2]; }
    cx /= pts.length; cy /= pts.length; cz /= pts.length;
    let R = 0;
    for (const p of pts) R = Math.max(R, Math.hypot(p[0] - cx, p[1] - cy, p[2] - cz));
    return { id: b.id, pts, r: b.dia / 2, t0: b.t0, layer: b.layer, band: b.band, member: b.member, kind: b.kind, centre: [cx, cy, cz], R, group: groupIndex(b.kind), src: b };
  });
  const couplers = model.couplers.map((c) => {
    const [E, N, U] = c.pos;
    const L = c.size;
    return { id: c.id, a: W3([E, N, U - L / 2]), b: W3([E, N, U + L / 2]), r: c.od / 2, t0: c.t0, band: c.band, member: c.member, src: c, layer: 'coupler' };
  });
  const spacers = model.spacers.map((s) => ({ id: s.id, c: W3(s.centre), r: 0.045, t0: s.t0, band: s.band, member: s.member, src: s, layer: 'spacer' }));

  // Ray vs segment via segment-segment distance against a long segment for the ray
  const LONG = 400;
  function hitSeg(o, d, a, b, r, tol) {
    const q = [o[0] + d[0] * LONG, o[1] + d[1] * LONG, o[2] + d[2] * LONG];
    const sd = segSegDistance(o, q, a, b);
    if (sd.d > r + tol) return null;
    const t = Math.hypot(sd.c1[0] - o[0], sd.c1[1] - o[1], sd.c1[2] - o[2]);
    return { t, d: sd.d };
  }

  function rayBox(o, d, min, max) {
    let tmin = -Infinity, tmax = Infinity;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) {
        if (o[i] < min[i] || o[i] > max[i]) return null;
      } else {
        let t1 = (min[i] - o[i]) / d[i], t2 = (max[i] - o[i]) / d[i];
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
      }
    }
    return tmin >= 0 ? tmin : (tmax >= 0 ? 0 : null);
  }

  // Displacement of a member at the current explode stage (engineering -> world vector)
  const sceneTables = new Map();
  function memberDisp(m, stage) {
    if (!sceneTables.has(m.id)) {
      sceneTables.set(m.id, { s: W3(storeyOffset(m)), o: W3(memberOffset(m)), g: GROUP_NAMES.map((g) => W3(groupOffset(m, g))) });
    }
    const T = sceneTables.get(m.id);
    return { s: T.s, o: T.o, g: T.g, stage };
  }
  const disp = (T, stage, gi) => {
    const sA = clamp(stage, 0, 1), sB = clamp(stage - 1, 0, 1), sC = clamp(stage - 2, 0, 1);
    const v = [0, 0, 0];
    for (let k = 0; k < 3; k++) v[k] = sA * T.s[k] + sB * T.o[k] + (gi >= 0 ? sC * T.g[gi][k] : 0);
    return v;
  };

  // Public: pick at ray (origin, direction) in world space.
  // ctx: { t, explode, layers, bands, cutaway }
  function pick(origin, dir, ctx) {
    const { t, explode, layers, bands } = ctx;
    const d = normalise(dir);
    let best = null;
    const consider = (hit) => { if (hit && (!best || hit.t < best.t)) best = hit; };

    // bars (rebar tubes)
    for (const b of bars) {
      if (b.t0 > t) continue;
      if (!bands[b.band] || !layers[b.layer]) continue;
      const T = memberDisp(model.members[b.member], explode);
      const dv = disp(T, explode, b.group);
      // quick reject by bounding sphere (generous margin for displacement)
      const c = [b.centre[0] + dv[0], b.centre[1] + dv[1], b.centre[2] + dv[2]];
      const tc = dot(sub(c, origin), d);
      if (tc < -b.R - 1 || distPointRay(c, origin, d) > b.R + b.r + 1.0 + 0.2) continue;
      const tol = 0.012;
      for (let i = 1; i < b.pts.length; i++) {
        const a = add3(b.pts[i - 1], dv), q = add3(b.pts[i], dv);
        const h = hitSeg(origin, d, a, q, b.r, tol);
        if (h) consider({ kind: 'bar', id: b.id, t: h.t, member: b.member });
      }
    }
    // couplers
    for (const c of couplers) {
      if (c.t0 > t) continue;
      if (!bands[c.band] || !layers.coupler) continue;
      const T = memberDisp(model.members[c.member], explode);
      const dv = disp(T, explode, groupIndex('coupler'));
      const h = hitSeg(origin, d, add3(c.a, dv), add3(c.b, dv), c.r, 0.01);
      if (h) consider({ kind: 'coupler', id: c.id, t: h.t, member: c.member });
    }
    // spacers
    for (const s of spacers) {
      if (s.t0 > t) continue;
      if (!bands[s.band] || !layers.spacer) continue;
      const T = memberDisp(model.members[s.member], explode);
      const dv = disp(T, explode, groupIndex('spacer'));
      const p = add3(s.c, dv);
      if (distPointRay(p, origin, d) < s.r) consider({ kind: 'spacer', id: s.id, t: dot(sub(p, origin), d), member: s.member });
    }
    // member volumes (concrete / formwork), displaced and pour-scaled; transparent when cut away, so skipped
    if (!ctx.cutaway) for (const m of model.members) {
      const key = KIND_LAYER[m.kind];
      if (!bands[m.band] || !layers[key]) continue;
      const p = memberProgress(m, t);
      if (p.pour <= 0 && p.form <= 0) continue;
      const T = memberDisp(m, explode);
      const dv = disp(T, explode, -1);
      const { min, max } = m.box;
      const b0 = W3([min[0], min[1], min[2]]), b1 = W3([max[0], max[1], max[2]]);
      const lo = [Math.min(b0[0], b1[0]), Math.min(b0[1], b1[1]), Math.min(b0[2], b1[2])];
      const hi = [Math.max(b0[0], b1[0]), Math.max(b0[1], b1[1]), Math.max(b0[2], b1[2])];
      const base = lo[1];
      hi[1] = base + (hi[1] - base) * Math.max(p.pour, 0.001);
      const mn = add3(lo, dv), mx = add3(hi, dv);
      const th = rayBox(origin, d, mn, mx);
      if (th !== null) consider({ kind: 'member', id: m.id, t: th, member: m.id });
    }
    return best;
  }

  // displaced midpoint of a bar in world coordinates (used to project a bar to the screen)
  function barAnchor(id, explode) {
    const b = bars[id];
    const pts = b.pts;
    const mid = pts[Math.floor(pts.length / 2)];
    const T = memberDisp(model.members[b.member], explode);
    const dv = disp(T, explode, b.group);
    return [mid[0] + dv[0], mid[1] + dv[1], mid[2] + dv[2]];
  }

  return { pick, barAnchor, bars, couplers, spacers };
}

const KIND_LAYER = { COL: 'column', BEAM: 'beam', SLAB: 'slab', GB: 'gb' };

function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function add3(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function normalise(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function distPointRay(p, o, d) {
  const w = sub(p, o);
  const t = Math.max(0, dot(w, d));
  const c = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
  return Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
}
export { W3 };
