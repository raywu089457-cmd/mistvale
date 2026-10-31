// Grid, members (ground beams, columns, beams, slabs), concrete volumes and formwork pieces.
// Engineering coordinates: E east, N north, U up. Frame centre at origin.
import { GEOM, COVER, LEVELS } from '../standards.js';

export const NX = 5;                       // X grid lines (4 bays)
export const NY = 4;                       // Y grid lines (3 bays)
export const EX = [];                      // E of X lines
export const NYp = [];                     // N of Y lines
{
  let e = -GEOM.bayX.reduce((a, b) => a + b, 0) / 2;
  EX.push(e);
  for (const b of GEOM.bayX) { e += b; EX.push(e); }
  let n = -GEOM.bayY.reduce((a, b) => a + b, 0) / 2;
  NYp.push(n);
  for (const b of GEOM.bayY) { n += b; NYp.push(n); }
}
export const X_NAMES = ['1', '2', '3', '4', '5'];
export const Y_NAMES = ['A', 'B', 'C', 'D'];

export const HALF_COL = GEOM.col / 2;      // 0.30
export const HALF_BEAM = GEOM.beamB / 2;   // 0.20
export const PLY_T = 0.018;                // plywood thickness (assumed, typical 18 mm)
export const BAND_NAMES = ['GB + 1F columns', 'F2 frame + 2F columns', 'Roof frame'];

// Level (floor) elevation for beam/slab frames.
const F2 = LEVELS.F2, RF = LEVELS.R;

// --------------------------------------------------------------- formwork helpers
function box(min, max, mat = 'ply') {
  return { type: 'box', min, max, mat };
}
function prop(x, y, z0, z1, r = 0.024) {
  return { type: 'prop', x, y, z0, z1, r };
}

// --------------------------------------------------------------- member factory
export function buildMembers() {
  const M = [];
  const add = (m) => { m.id = M.length; M.push(m); return m; };

  // Ground beams (band 0): X-spans at each Y line, Y-spans at each X line.
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX - 1; i++) {
    const x0 = EX[i], x1 = EX[i + 1], y = NYp[j];
    add({
      kind: 'GB', dir: 'X', i, j, band: 0, level: 0, bay: Math.min(i, 3),
      name: `GB ${X_NAMES[i]}–${X_NAMES[i + 1]} · ${Y_NAMES[j]}`,
      box: { min: [x0, y - 0.30, -GEOM.gbH], max: [x1, y + 0.30, 0] },
      formwork: [],
    });
  }
  for (let i = 0; i < NX; i++) for (let j = 0; j < NY - 1; j++) {
    const x = EX[i], y0 = NYp[j], y1 = NYp[j + 1];
    add({
      kind: 'GB', dir: 'Y', i, j, band: 0, level: 0, bay: Math.min(i, 3),
      name: `GB ${X_NAMES[i]} · ${Y_NAMES[j]}–${Y_NAMES[j + 1]}`,
      box: { min: [x - 0.30, y0, -GEOM.gbH], max: [x + 0.30, y1, 0] },
      formwork: [],
    });
  }

  // Columns: storey 1 (band 0, U 0..3.6) and storey 2 (band 1, U 3.6..7.2).
  for (const st of [0, 1]) {
    const U0 = st * GEOM.floorToFloor, U1 = U0 + GEOM.floorToFloor;
    const band = st === 0 ? 0 : 1;
    for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) {
      const E = EX[i], N = NYp[j];
      const hc = HALF_COL, fw = hc + PLY_T;
      const Ht = GEOM.Hn;
      const fwl = [
        box([E + hc, N - hc, U0], [E + fw, N + hc, U0 + Ht]),
        box([E - fw, N - hc, U0], [E - hc, N + hc, U0 + Ht]),
        box([E - fw, N + hc, U0], [E + fw, N + fw, U0 + Ht]),
        box([E - fw, N - fw, U0], [E + fw, N - hc, U0 + Ht]),
      ];
      add({
        kind: 'COL', dir: 'Z', i, j, band, level: st, bay: Math.min(i, 3), storey: st + 1,
        name: `COL ${X_NAMES[i]}${Y_NAMES[j]} · ${st === 0 ? '1F' : '2F'}`,
        U0, U1,
        box: { min: [E - hc, N - hc, U0], max: [E + hc, N + hc, U1] },
        formwork: fwl,
      });
    }
  }

  // Beam/slab frames at F2 (band 1) and roof (band 2).
  for (const [lvl, F, band, props] of [['F2', F2, 1, 'F2'], ['R', RF, 2, 'R']]) {
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX - 1; i++) {
      const x0 = EX[i], x1 = EX[i + 1], y = NYp[j];
      const hb = HALF_BEAM, cf = HALF_COL + PLY_T;
      const top = F + GEOM.beamUpstand, bottom = top - GEOM.beamH;   // beam 0.70 deep, 0.10 proud of slab top
      const soffitZ = bottom - PLY_T;
      const fw = [
        box([x0 + cf, y + hb, bottom], [x1 - cf, y + hb + PLY_T, top]),
        box([x0 + cf, y - hb - PLY_T, bottom], [x1 - cf, y - hb, top]),
        box([x0 + cf, y - hb, soffitZ], [x1 - cf, y + hb, bottom]),
      ];
      const base = props === 'F2' ? 0 : LEVELS.F2 + GEOM.beamUpstand;
      for (let k = 1; k <= 3; k++) {
        const x = x0 + (x1 - x0) * (k / 4);
        fw.push(prop(x, y, base, soffitZ));
      }
      add({
        kind: 'BEAM', dir: 'X', i, j, band, level: lvl === 'F2' ? 1 : 2, bay: Math.min(i, 3), lvl, F,
        name: `BEAM ${X_NAMES[i]}–${X_NAMES[i + 1]} · ${Y_NAMES[j]} · ${lvl}`,
        box: { min: [x0 + HALF_COL, y - hb, bottom], max: [x1 - HALF_COL, y + hb, top] },
        formwork: fw,
      });
    }
    for (let i = 0; i < NX; i++) for (let j = 0; j < NY - 1; j++) {
      const x = EX[i], y0 = NYp[j], y1 = NYp[j + 1];
      const hb = HALF_BEAM, cf = HALF_COL + PLY_T;
      const top = F + GEOM.beamUpstand, bottom = top - GEOM.beamH;
      const soffitZ = bottom - PLY_T;
      const fw = [
        box([x + hb, y0 + cf, bottom], [x + hb + PLY_T, y1 - cf, top]),
        box([x - hb - PLY_T, y0 + cf, bottom], [x - hb, y1 - cf, top]),
        box([x - hb, y0 + cf, soffitZ], [x + hb, y1 - cf, bottom]),
      ];
      const base = props === 'F2' ? 0 : LEVELS.F2 + GEOM.beamUpstand;
      for (let k = 1; k <= 3; k++) {
        const y = y0 + (y1 - y0) * (k / 4);
        fw.push(prop(x, y, base, soffitZ));
      }
      add({
        kind: 'BEAM', dir: 'Y', i, j, band, level: lvl === 'F2' ? 1 : 2, bay: Math.min(i, 3), lvl, F,
        name: `BEAM ${X_NAMES[i]} · ${Y_NAMES[j]}–${Y_NAMES[j + 1]} · ${lvl}`,
        box: { min: [x - hb, y0 + HALF_COL, bottom], max: [x + hb, y1 - HALF_COL, top] },
        formwork: fw,
      });
    }
    for (let i = 0; i < NX - 1; i++) for (let j = 0; j < NY - 1; j++) {
      const x0 = EX[i], x1 = EX[i + 1], y0 = NYp[j], y1 = NYp[j + 1];
      const hb = HALF_BEAM, inner = HALF_BEAM + PLY_T;   // deck sits between the beam side forms
      const deckZ0 = F - GEOM.slabT - PLY_T, deckZ1 = F - GEOM.slabT;
      const fw = [box([x0 + inner, y0 + inner, deckZ0], [x1 - inner, y1 - inner, deckZ1])];
      const base = props === 'F2' ? 0 : LEVELS.F2;
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
        const x = x0 + inner + (x1 - x0 - 2 * inner) * ((a + 0.5) / 3);
        const y = y0 + inner + (y1 - y0 - 2 * inner) * ((b + 0.5) / 3);
        fw.push(prop(x, y, base, deckZ0));
      }
      add({
        kind: 'SLAB', dir: 'XY', i, j, band, level: lvl === 'F2' ? 1 : 2, bay: Math.min(i, 3), lvl, F,
        name: `SLAB ${X_NAMES[i]}–${X_NAMES[i + 1]} × ${Y_NAMES[j]}–${Y_NAMES[j + 1]} · ${lvl}`,
        box: { min: [x0 + hb, y0 + hb, F - GEOM.slabT], max: [x1 - hb, y1 - hb, F] },
        formwork: fw,
      });
    }
  }
  return M;
}

// Human-readable cover statement for a member kind (used in inspector).
export function coverFor(kind) {
  if (kind === 'GB') return COVER.groundBeamEarth.value;
  if (kind === 'SLAB') return COVER.slab.value;
  return COVER.column.value;
}

// Bay index (cell) for band & level labels.
export function cellLabel(m) {
  const lvl = m.kind === 'COL' ? (m.storey === 1 ? '1F' : '2F') : m.kind === 'GB' ? 'GB' : m.lvl;
  return `${lvl} · bay ${m.bay + 1}`;
}
