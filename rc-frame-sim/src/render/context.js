// Site context: trench and yard (cell terrain), scaffold along one elevation, stored plywood and rebar,
// tower-crane footing outside the working area, and a 1.75 m operator for scale.
import * as THREE from 'three';
import { GEOM, TRENCH } from '../standards.js';
import { GeomBuilder, W, hash01 } from './geomBuilder.js';
import { EX, NYp } from '../model/members.js';


// Engineering box -> world min/max (N maps to -z, so the z pair is re-sorted)
export function boxW(e0, e1, n0, n1, u0, u1) {
  return [[Math.min(e0, e1), Math.min(u0, u1), -Math.max(n0, n1)], [Math.max(e0, e1), Math.max(u0, u1), -Math.min(n0, n1)]];
}

const TH = TRENCH.halfWidth;     // 0.60 m either side of every ground-beam line
const TD = TRENCH.depth;         // 0.70 m

// Cell breaks: every column line +-0.6 plus site edge
function breaks(lines, lo, hi) {
  const s = new Set([lo, hi]);
  for (const v of lines) { s.add(v - TH); s.add(v + TH); }
  return [...s].sort((a, b) => a - b);
}

// Ground-beam trench rectangles (all X spans and Y spans)
function trenchRects() {
  const R = [];
  for (let j = 0; j < NYp.length; j++) for (let i = 0; i < EX.length - 1; i++) {
    R.push([EX[i] - TH, EX[i + 1] + TH, NYp[j] - TH, NYp[j] + TH]);
  }
  for (let i = 0; i < EX.length; i++) for (let j = 0; j < NYp.length - 1; j++) {
    R.push([EX[i] - TH, EX[i] + TH, NYp[j] - TH, NYp[j + 1] + TH]);
  }
  return R;
}

export function buildTerrain() {
  const E = breaks(EX, -26, 26), N = breaks(NYp, -18, 18);
  const rects = trenchRects();
  const inTrench = (e, n) => rects.some((r) => e > r[0] && e < r[1] && n > r[2] && n < r[3]);
  const cells = [];
  for (let a = 0; a < E.length - 1; a++) {
    cells.push([]);
    for (let b = 0; b < N.length - 1; b++) {
      const ce = (E[a] + E[a + 1]) / 2, cn = (N[b] + N[b + 1]) / 2;
      cells[a].push(inTrench(ce, cn));
    }
  }
  const yard = new GeomBuilder(), soil = new GeomBuilder();
  const walkBlocks = [];
  for (let a = 0; a < E.length - 1; a++) for (let b = 0; b < N.length - 1; b++) {
    const e0 = E[a], e1 = E[a + 1], n0 = N[b], n1 = N[b + 1];
    if (cells[a][b]) {
      // trench floor (top of blinding under the ground beam)
      { const [a, b] = boxW(e0, e1, n0, n1, -TD, -TD + 0.02); soil.addBox(a, b, { color: [0.36, 0.30, 0.23] }); }
      walkBlocks.push({ min: [e0, n0], max: [e1, n1], trench: true });
    } else {
      { const [a, b] = boxW(e0, e1, n0, n1, -0.02, 0); yard.addBox(a, b, { color: [0.55, 0.54, 0.5] }); }
    }
  }
  // trench walls on every boundary between trench and yard
  const wall = 0.06;
  for (let a = 0; a < E.length - 1; a++) for (let b = 0; b < N.length - 1; b++) {
    const t = cells[a][b];
    if (a + 1 < E.length - 1 && cells[a + 1][b] !== t) {
      const e = E[a + 1];
      const [minn, maxn] = [N[b], N[b + 1]];
      const inside = t ? [e - wall, e] : [e, e + wall];
      { const [a, b] = boxW(inside[0], inside[1], minn, maxn, -TD, 0); soil.addBox(a, b, { color: [0.42, 0.34, 0.25] }); }
    }
    if (b + 1 < N.length - 1 && cells[a][b + 1] !== t) {
      const n = N[b + 1];
      const [mine, maxe] = [E[a], E[a + 1]];
      const inside = t ? [n - wall, n] : [n, n + wall];
      { const [a, b] = boxW(mine, maxe, inside[0], inside[1], -TD, 0); soil.addBox(a, b, { color: [0.42, 0.34, 0.25] }); }
    }
  }
  // outside the cell grid: flat yard
  for (const [e0, e1, n0, n1] of [[-60, 60, -60, -18], [-60, 60, 18, 60], [-60, -26, -18, 18], [26, 60, -18, 18]]) {
    const [a, b] = boxW(e0, e1, n0, n1, -0.02, 0);
    yard.addBox(a, b, { color: [0.52, 0.51, 0.48] });
  }
  return { yard: yard.build(), soil: soil.build(), walkBlocks, cells, E, N };
}

// Scaffold on the south elevation: two standard rows, ledgers at 1.8 m, planks at each platform.
export function buildScaffold(builders) {
  const { steel, plank } = builders;
  const r = 0.024;
  const rowN = [-8.45, -9.55];
  const E0 = -14.4, E1 = 14.4, pitch = 1.8;
  const levels = [0, 1.8, 3.6, 5.4, 7.2, 8.4];
  const bays = Math.round((E1 - E0) / pitch);
  for (const n of rowN) {
    for (let k = 0; k <= bays; k++) {
      const e = E0 + k * pitch;
      steel.addCylinder(W([e, n, 0]), W([e, n, 8.4]), r, { seg: 6, color: [0.6, 0.64, 0.68] });
    }
    for (const u of levels) {
      steel.addCylinder(W([E0, n, u]), W([E1, n, u]), r, { seg: 6, color: [0.6, 0.64, 0.68] });
    }
  }
  for (let k = 0; k <= bays; k++) {
    const e = E0 + k * pitch;
    for (const u of levels) steel.addCylinder(W([e, rowN[0], u]), W([e, rowN[1], u]), r, { seg: 6, color: [0.6, 0.64, 0.68] });
    // base plates (bevelled cylinders)
    steel.addCylinder(W([e, rowN[0], -0.01]), W([e, rowN[0], 0.02]), 0.07, { seg: 10, color: [0.5, 0.5, 0.52] });
    steel.addCylinder(W([e, rowN[1], -0.01]), W([e, rowN[1], 0.02]), 0.07, { seg: 10, color: [0.5, 0.5, 0.52] });
  }
  // diagonal braces every second bay on the outer row
  for (let k = 0; k < bays; k += 2) {
    const e0 = E0 + k * pitch, e1 = e0 + pitch;
    steel.addCylinder(W([e0, rowN[1], 0]), W([e1, rowN[1], 3.6]), 0.02, { seg: 5, color: [0.55, 0.6, 0.66] });
  }
  // platforms (planks) and guard rails at 2 m platform levels
  for (const u of [1.8, 3.6, 5.4, 7.2]) {
    for (let k = 0; k < bays; k++) {
      const e0 = E0 + k * pitch + 0.02;
      { const [a, b] = boxW(e0, e0 + pitch - 0.04, -9.62, -8.25, u, u + 0.045); plank.addBox(a, b, { color: [0.72, 0.56, 0.35] }); }
    }
    steel.addCylinder(W([E0, -9.62, u + 1.0]), W([E1, -9.62, u + 1.0]), 0.02, { seg: 6, color: [0.8, 0.8, 0.75] });
    steel.addCylinder(W([E0, -8.25, u + 1.0]), W([E1, -8.25, u + 1.0]), 0.02, { seg: 6, color: [0.8, 0.8, 0.75] });
  }
  return { E0, E1, rowN, footprints: [] };
}

// Stored plywood (3 stacks) and rebar bundles on timber bearers, west of the frame.
export function buildStores(builders) {
  const { ply, timber, bars } = builders;
  const foot = [];
  for (let k = 0; k < 3; k++) {
    const n0 = -3.0 + k * 1.35;
    for (let s = 0; s < 3; s++) {
      const e0 = -19.6 + s * 0.02;
      { const [a, b] = boxW(e0, e0 + 2.44, n0 + 0.15 + s * 0.45, n0 + 0.25 + s * 0.45, 0, 0.1); timber.addBox(a, b, { color: [0.6, 0.45, 0.28] }); }
    }
    for (let sh = 0; sh < 14; sh++) {
      const off = (hash01(k * 100 + sh) - 0.5) * 0.02;
      { const [a, b] = boxW(-19.6 + off, -17.16 + off, n0 + off, n0 + 1.22 + off, 0.1 + sh * 0.018, 0.118 + sh * 0.018); ply.addBox(a, b, { color: [0.82, 0.66, 0.42] }); }
    }
    foot.push({ min: [-19.6, n0], max: [-17.16, n0 + 1.22] });
  }
  for (let k = 0; k < 2; k++) {
    const n0 = 5.0 + k * 1.6;
    for (let s = 0; s < 3; s++) { const [a, b] = boxW(-19.2, -16.4, n0 + 0.1 + s * 0.55, n0 + 0.2 + s * 0.55, 0, 0.1); timber.addBox(a, b, { color: [0.6, 0.45, 0.28] }); }
    for (let layer = 0; layer < 3; layer++) for (let b = 0; b < 6; b++) {
      const d = b % 2 ? 0.022 : 0.032;
      const e = -19.2 + 0.2;
      const nn = n0 + 0.3 + b * 0.18;
      bars.addCylinder(W([e, nn, 0.1 + d / 2 + layer * 0.03]), W([e + 2.8, nn, 0.1 + d / 2 + layer * 0.03]), d / 2, { seg: 8, color: [0.4, 0.36, 0.33] });
    }
    foot.push({ min: [-19.2, n0], max: [-16.4, n0 + 1.6] });
  }
  return { foot };
}

// Tower-crane footing (outside the working area), with base plate, anchor bolts and a mast stub.
export function buildCrane(builders) {
  const { concrete, steel } = builders;
  const e0 = 21, e1 = 27, n0 = -19, n1 = -13;
  { const [a, b] = boxW(e0, e1, n0, n1, -1.0, 0.5); concrete.addBox(a, b, { color: [0.63, 0.62, 0.6] }); }
  { const [a, b] = boxW(e0 + 1.6, e1 - 1.6, n0 + 1.6, n1 - 1.6, 0.5, 0.53); steel.addBox(a, b, { color: [0.5, 0.5, 0.52] }); }
  for (const [ex, nn] of [[e0 + 0.7, n0 + 0.7], [e1 - 0.7, n0 + 0.7], [e0 + 0.7, n1 - 0.7], [e1 - 0.7, n1 - 0.7]]) {
    steel.addCylinder(W([ex, nn, 0.53]), W([ex, nn, 0.75]), 0.02, { seg: 6, color: [0.7, 0.7, 0.7] });
  }
  const c = [(e0 + e1) / 2, (n0 + n1) / 2];
  const legs = [[-0.7, -0.7], [0.7, -0.7], [0.7, 0.7], [-0.7, 0.7]];
  for (const [dx, dy] of legs) steel.addCylinder(W([c[0] + dx, c[1] + dy, 0.53]), W([c[0] + dx, c[1] + dy, 9.0]), 0.05, { seg: 8, color: [0.9, 0.65, 0.1] });
  { const [a, b] = boxW(c[0] - 0.9, c[0] + 0.9, c[1] - 0.9, c[1] + 0.9, 9.0, 9.08); steel.addBox(a, b, { color: [0.9, 0.65, 0.1] }); }
  return { footprint: { min: [e0, n0], max: [e1, n1] }, mastCentre: c };
}

// Operator, 1.75 m, built from primitives (returns a Group with meshes for three.js).
export function buildOperator(M) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
    return m;
  };
  // legs 0..0.85, torso 0.85..1.45, arms, head 1.50..1.66, hard hat to 1.75
  add(new THREE.CylinderGeometry(0.075, 0.07, 0.85, 12), M.trousers, -0.11, 0.425, 0);
  add(new THREE.CylinderGeometry(0.075, 0.07, 0.85, 12), M.trousers, 0.11, 0.425, 0);
  add(new THREE.BoxGeometry(0.13, 0.06, 0.24), M.boot, -0.11, 0.03, 0.04);
  add(new THREE.BoxGeometry(0.13, 0.06, 0.24), M.boot, 0.11, 0.03, 0.04);
  add(new THREE.BoxGeometry(0.42, 0.62, 0.24), M.vest, 0, 1.16, 0);
  add(new THREE.BoxGeometry(0.44, 0.05, 0.25), M.reflect, 0, 1.0, 0);
  add(new THREE.BoxGeometry(0.44, 0.05, 0.25), M.reflect, 0, 1.3, 0);
  add(new THREE.CylinderGeometry(0.055, 0.05, 0.6, 10), M.vest, -0.27, 1.12, 0);
  add(new THREE.CylinderGeometry(0.055, 0.05, 0.6, 10), M.vest, 0.27, 1.12, 0);
  add(new THREE.SphereGeometry(0.105, 16, 12), M.skin, 0, 1.56, 0);
  add(new THREE.SphereGeometry(0.13, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.hat, 0, 1.6, 0);
  add(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 16), M.hat, 0, 1.6, 0);
  return g;
}

// Collision footprints (2D) for walking: columns, props, stores, scaffold, crane, bundles.
export function collisionFromModel(model) {
  const boxes = [];
  for (const m of model.members) {
    if (m.kind === 'COL') {
      const cx = m.box.min[0] + 0.3, cy = m.box.min[1] + 0.3;
      boxes.push({ min: [cx - 0.33, cy - 0.33], max: [cx + 0.33, cy + 0.33] });
    }
    for (const f of m.formwork) if (f.type === 'prop') boxes.push({ min: [f.x - 0.04, f.y - 0.04], max: [f.x + 0.04, f.y + 0.04] });
  }
  return boxes;
}
