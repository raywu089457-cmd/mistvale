// Merged-geometry builder. Everything is generated from model parameters; buffers carry per-vertex member id,
// group id, appearance time (aT0) and a tint, so one draw call per (layer, storey band) suffices.
import * as THREE from 'three';
import { RIB_PITCH } from '../standards.js';

// Engineering [E, N, U] -> three.js world [x, y, z] = [E, U, -N]
export const W = (p) => [p[0], p[2], -p[1]];

// Tiny deterministic hash -> [0,1)
export function hash01(n) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

export class GeomBuilder {
  constructor() {
    this.pos = []; this.nor = []; this.uv = []; this.col = [];
    this.mem = []; this.grp = []; this.t0 = [];
    this.index = [];
    this.v = 0;
    this.ranges = [];     // per logical item: { t0, i0, i1 } index range (for draw-range prefix)
  }

  // push one vertex
  vtx(p, n, u, vv, c, mem, grp, t0) {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.uv.push(u, vv);
    this.col.push(c[0], c[1], c[2]);
    this.mem.push(mem); this.grp.push(grp); this.t0.push(t0);
    return this.v++;
  }

  // Tube along polyline (W coordinates). radial segments rs, cap ends.
  addTube(pts, radius, { mem = 0, grp = 0, t0 = 0, color = [0.42, 0.42, 0.43], rs = 6, caps = true, ribs = true, key = null } = {}) {
    const i0 = this.index.length;
    const P = pts;
    const n = P.length;
    if (n < 2) return;
    // cumulative length for v
    const cum = [0];
    for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1], P[i][2] - P[i - 1][2]));
    // tangents per point
    const T = [];
    for (let i = 0; i < n; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
      const t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const l = Math.hypot(t[0], t[1], t[2]) || 1;
      T.push([t[0] / l, t[1] / l, t[2] / l]);
    }
    // parallel transport frame
    let N0 = Math.abs(T[0][1]) < 0.9 ? cross(T[0], [0, 1, 0]) : cross(T[0], [1, 0, 0]);
    N0 = normalize(N0);
    const frames = [];
    let Nprev = N0;
    for (let i = 0; i < n; i++) {
      let N = Nprev;
      const d = dot(N, T[i]);
      N = normalize([N[0] - T[i][0] * d, N[1] - T[i][1] * d, N[2] - T[i][2] * d]);
      const B = cross(T[i], N);
      frames.push([N, B]);
      Nprev = N;
    }
    const base = this.v;
    const vScale = ribs ? 1 / RIB_PITCH : 1;
    for (let i = 0; i < n; i++) {
      const [N, B] = frames[i];
      const v = cum[i] * vScale;
      for (let j = 0; j <= rs; j++) {
        const th = (j / rs) * Math.PI * 2;
        const c = Math.cos(th), s = Math.sin(th);
        const nrm = [c * N[0] + s * B[0], c * N[1] + s * B[1], c * N[2] + s * B[2]];
        const p = [P[i][0] + radius * nrm[0], P[i][1] + radius * nrm[1], P[i][2] + radius * nrm[2]];
        const tint = tintFor(color, mem, grp, j, i);
        this.vtx(p, nrm, j / rs, v, tint, mem, grp, t0);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < rs; j++) {
        const a = base + i * (rs + 1) + j, b = a + 1, c = a + (rs + 1), d = c + 1;
        this.index.push(a, c, b, b, c, d);
      }
    }
    if (caps) {
      const addCap = (idx, dir) => {
        const [N, B] = frames[idx];
        const centre = P[idx];
        const cIdx = this.vtx(centre, dir, 0.5, 0, color, mem, grp, t0);
        const ringStart = this.v;
        for (let j = 0; j <= rs; j++) {
          const th = (j / rs) * Math.PI * 2;
          const c = Math.cos(th), s = Math.sin(th);
          const nrm = dir;
          const p = [centre[0] + radius * (c * N[0] + s * B[0]), centre[1] + radius * (c * N[1] + s * B[1]), centre[2] + radius * (c * N[2] + s * B[2])];
          this.vtx(p, nrm, j / rs, 0, color, mem, grp, t0);
        }
        for (let j = 0; j < rs; j++) {
          const a = cIdx, b = ringStart + j, c2 = ringStart + j + 1;
          this.index.push(a, b, c2);
        }
      };
      addCap(0, scale(T[0], -1));
      addCap(n - 1, T[n - 1]);
    }
    this.ranges.push({ t0, i0, i1: this.index.length, key });
  }

  // Axis-aligned box given two corners in W coordinates (min,max as arrays).
  addBox(min, max, { mem = 0, grp = 0, t0 = 0, color = [0.6, 0.6, 0.6], key = null } = {}) {
    const i0 = this.index.length;
    const [x0, y0, z0] = min, [x1, y1, z1] = max;
    const faces = [
      { n: [1, 0, 0], q: [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]] },
      { n: [-1, 0, 0], q: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]] },
      { n: [0, 1, 0], q: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]] },
      { n: [0, -1, 0], q: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]] },
      { n: [0, 0, 1], q: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]] },
      { n: [0, 0, -1], q: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]] },
    ];
    for (const f of faces) {
      const b = this.v;
      f.q.forEach((p, k) => this.vtx(p, f.n, k === 1 || k === 2 ? 1 : 0, k >= 2 ? 1 : 0, color, mem, grp, t0));
      this.index.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    this.ranges.push({ t0, i0, i1: this.index.length, key });
  }

  // Cylinder between two W points (for props, base plates, couplers, sleeves).
  addCylinder(p0, p1, radius, { seg = 8, mem = 0, grp = 0, t0 = 0, color = [0.6, 0.6, 0.6], key = null } = {}) {
    const i0 = this.index.length;
    const axis = norm3([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]);
    const u = Math.abs(axis[1]) < 0.9 ? normalize(cross(axis, [0, 1, 0])) : normalize(cross(axis, [1, 0, 0]));
    const w = cross(axis, u);
    const base = this.v;
    for (let k = 0; k <= 1; k++) {
      const p = k ? p1 : p0;
      for (let j = 0; j <= seg; j++) {
        const th = (j / seg) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
        const nrm = [c * u[0] + s * w[0], c * u[1] + s * w[1], c * u[2] + s * w[2]];
        this.vtx([p[0] + radius * nrm[0], p[1] + radius * nrm[1], p[2] + radius * nrm[2]], nrm, j / seg, k, color, mem, grp, t0);
      }
    }
    for (let j = 0; j < seg; j++) {
      const a = base + j, b = a + 1, c = a + seg + 1, d = c + 1;
      this.index.push(a, c, b, b, c, d);
    }
    this.ranges.push({ t0, i0, i1: this.index.length, key });
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aMember', new THREE.Float32BufferAttribute(this.mem, 1));
    g.setAttribute('aGroup', new THREE.Float32BufferAttribute(this.grp, 1));
    g.setAttribute('aT0', new THREE.Float32BufferAttribute(this.t0, 1));
    const useU32 = this.v > 65535;
    g.setIndex(useU32 ? new THREE.Uint32BufferAttribute(this.index, 1) : new THREE.Uint16BufferAttribute(this.index, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

function tintFor(base, mem, grp, j, i) {
  // subtle per-bar variation (mill scale / rust), deterministic
  const h = hash01(mem * 7919 + grp * 104729 + (j * 3 + i) * 0 + 17);
  const k = 0.9 + 0.2 * h;
  const warm = 0.03 * hash01(mem * 31 + grp * 17 + 5);
  return [base[0] * k + warm, base[1] * k, base[2] * k - warm * 0.5];
}

function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function normalize(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function norm3(v) { return normalize(v); }
function scale(v, s) { return [v[0] * s, v[1] * s, v[2] * s]; }
