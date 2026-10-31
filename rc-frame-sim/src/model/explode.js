// Exploded-view offsets along authored axes, in engineering coords [E, N, U] (metres at full separation).
// Three stages: storeys (vertical), members (outward on each member's own axis), bar groups (within the member).
import { EX, NYp, HALF_COL } from './members.js';
import { GEOM } from '../standards.js';

export const GROUP_NAMES = [
  'main', 'tie', 'crosstie', 'beamTop', 'beamBot', 'stirrup', 'gbTop', 'gbBot',
  'slabB1', 'slabB2', 'slabT1', 'slabT2', 'corner', 'coupler', 'spacer',
];
const GI = Object.fromEntries(GROUP_NAMES.map((g, i) => [g, i]));
export const KIND_TO_GROUP = {
  dowel: 'main', main: 'main', tie: 'tie', crosstie: 'crosstie', beamTop: 'beamTop', beamBot: 'beamBot',
  stirrup: 'stirrup', gbStir: 'stirrup', trimmer: 'stirrup', gbTop: 'gbTop', gbBot: 'gbBot',
  slabB1: 'slabB1', slabB2: 'slabB2', slabT1: 'slabT1', slabT2: 'slabT2', slabCorner: 'corner',
  coupler: 'coupler', spacer: 'spacer',
};
export const groupIndex = (kind) => GI[KIND_TO_GROUP[kind]];

export const STOREY_GAP = 1.2;     // m between storey bands at full separation
const MEMBER_SEP = 0.9;            // m, member outward / downward travel

const sgn = (x) => (x > 1e-9 ? 1 : x < -1e-9 ? -1 : 0);

export function storeyOffset(m) {
  return [0, 0, m.band * STOREY_GAP];
}

export function memberOffset(m) {
  if (m.kind === 'GB') return [0, 0, -0.8];
  if (m.kind === 'COL') {
    const E = EX[m.i], N = NYp[m.j];
    const len = Math.hypot(E, N) || 1;
    return [(E / len) * MEMBER_SEP, (N / len) * MEMBER_SEP, 0];
  }
  if (m.kind === 'BEAM') {
    if (m.dir === 'X') return [0, sgn(NYp[m.j]) * 0.7, 0];
    return [sgn(EX[m.i]) * 0.7, 0, 0];
  }
  return [0, 0, 0.5];   // slab
}

// Group travel inside the member (authored per group)
export function groupOffset(m, group) {
  switch (group) {
    case 'main': {
      if (m.kind !== 'COL') return [0, 0, m.kind === 'GB' ? -0.12 : 0];
      // main bars move radially out from the column axis (perimeter position is in the bar label)
      return [0, 0, 0.2];
    }
    case 'tie': return [0, 0, 0.25];
    case 'crosstie': return [0, 0, 0.12];
    case 'beamTop': return [0, 0, 0.22];
    case 'beamBot': return [0, 0, -0.22];
    case 'stirrup': return [0, 0, 0.2];
    case 'gbTop': return [0, 0, 0.15];
    case 'gbBot': return [0, 0, -0.15];
    case 'slabB1': return [0, 0, -0.15];
    case 'slabB2': return [0, 0, -0.08];
    case 'slabT1': return [0, 0, 0.2];
    case 'slabT2': return [0, 0, 0.12];
    case 'corner': return [0, 0, 0.25];
    case 'coupler': return [0, 0, 0.3];
    case 'spacer': return [0, 0, -0.12];
    default: return [0, 0, 0];
  }
}

// Authored group offset for a specific bar (main bars: radial in plan, others from table)
export function barGroupOffset(m, group, bar) {
  if (group === 'main' && m.kind === 'COL' && bar && bar.perimeter !== undefined) {
    const k = bar.perimeter;
    const px = [0.2394, 0.2394, 0.2394, 0.2394, 0.0798, -0.0798, -0.2394, -0.2394, -0.2394, -0.2394, -0.0798, 0.0798][k];
    const py = [-0.2394, -0.0798, 0.0798, 0.2394, 0.2394, 0.2394, 0.2394, 0.0798, -0.0798, -0.2394, -0.2394, -0.2394][k];
    return [sgn(px) * 0.12, sgn(py) * 0.12, 0.2];
  }
  return groupOffset(m, group);
}

// Per-member table used by the GPU: [storey(3), member(3), pourK(=0), formK(=0)] etc. Values are filled at runtime.
export function explodeTables(members) {
  const nM = members.length;
  const nG = GROUP_NAMES.length;
  const memberVec = new Float32Array(nM * 3 * 2);    // [storey xyz, member xyz] per member
  const groupVec = new Float32Array(nM * nG * 3);    // per member x group xyz
  members.forEach((m, mi) => {
    const s = storeyOffset(m), mo = memberOffset(m);
    memberVec.set(s, mi * 6);
    memberVec.set(mo, mi * 6 + 3);
    for (let g = 0; g < nG; g++) groupVec.set(groupOffset(m, GROUP_NAMES[g]), (mi * nG + g) * 3);
  });
  return { nM, nG, memberVec, groupVec };
}
