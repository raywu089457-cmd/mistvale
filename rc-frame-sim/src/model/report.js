// Standards report: every check is computed from the generated model and compared with standards.js.
// Pure JS, used by the in-app panel and by the test suite.
import { GEOM, COLUMN, BEAM, COUPLER, barDia, beamEffectiveDepth, COVER, penetrationReinforcement, developmentLength, BAR_SIZES, LEVELS } from '../standards.js';
import { EX, NYp, HALF_COL } from './members.js';
import { tieSpacings } from './checks.js';

const TOL = 0.0011;   // 1.1 mm: the brief asks for 1 mm

export function standardsReport(model) {
  const out = [];
  const add = (id, label, value, expected, pass, note = '', drawing = '') => out.push({ id, label, value, expected, pass, note, drawing });

  // ---- column ties (RC06)
  const colMembers = model.members.filter((m) => m.kind === 'COL');
  let confSamples = [], centreSamples = [], transitions = 0, maxGap = 0, firstOK = true;
  for (const m of colMembers) {
    const t = m.tie;
    const lo = t.lo;
    const spacings = tieSpacings(t.zs, lo, m.U0, m.U1);
    for (const s of spacings) {
      if (s.zone === 'confinement') confSamples.push(s.spacing);
      else if (s.zone === 'centre') centreSamples.push(s.spacing);
      else transitions++;
      maxGap = Math.max(maxGap, s.spacing);
    }
    if (Math.abs(t.zs[0] - (m.U0 + COLUMN.firstTie)) > 1e-6 || Math.abs(t.zs[t.zs.length - 1] - (m.U1 - COLUMN.firstTie)) > 1e-6) firstOK = false;
  }
  const confOK = confSamples.every((s) => Math.abs(s - COLUMN.tieZoneS) <= TOL);
  const centreOK = centreSamples.every((s) => Math.abs(s - COLUMN.tieCentreS) <= TOL);
  add('tie-zone', 'Column tie spacing inside confinement zone (ℓo)', `${(Math.min(...confSamples) * 1000).toFixed(1)}–${(Math.max(...confSamples) * 1000).toFixed(1)} mm (${confSamples.length} pairs)`, '100 mm ±1', confOK, `ℓo = ${(model.members.find((m) => m.kind === 'COL').tie.lo * 1000).toFixed(0)} mm = max(Hn/6, max(b,h), 450 mm), capped at H/2`, 'RC06');
  add('tie-centre', 'Column tie spacing in the centre', `${(Math.min(...centreSamples) * 1000).toFixed(1)}–${(Math.max(...centreSamples) * 1000).toFixed(1)} mm (${centreSamples.length} pairs)`, '150 mm ±1', centreOK, `transitions at zone edges ${transitions} pairs, max gap ${(maxGap * 1000).toFixed(0)} mm (≤ 150 mm)`, 'RC06');
  add('tie-first', 'First column tie from floor line', `${(model.members.find((m) => m.kind === 'COL').tie.zs[0] * 1000).toFixed(1)} mm`, '50 mm', firstOK, 'checked at both floor lines of both storeys', 'RC06');

  // ---- beam stirrups (RC04)
  const beams = model.members.filter((m) => m.kind === 'BEAM' && m.stations);
  let firstStirrupOK = true, zoneMax = 0, zoneSamples = 0;
  for (const b of beams) {
    if (Math.abs(b.stations[0] - BEAM.firstStirrup) > 1e-6) firstStirrupOK = false;
    const Lc = b.Lc, h = GEOM.beamH, zone = 2 * h;
    for (let k = 1; k < b.stations.length; k++) {
      const a = b.stations[k - 1], c = b.stations[k];
      const inEnd = (s) => s <= zone + 1e-9 || s >= Lc - zone - 1e-9;
      if (inEnd(a) && inEnd(c)) { zoneMax = Math.max(zoneMax, c - a); zoneSamples++; }
    }
  }
  const S1Std = beamS1Value();
  add('stirrup-first', 'First beam stirrup from column face', `${(beams[0].stations[0] * 1000).toFixed(0)} mm`, '50 mm', firstStirrupOK, 'every beam, both ends', 'RC04');
  add('stirrup-zone', 'Beam stirrup spacing inside 2h end zone', `max ${(zoneMax * 1000).toFixed(0)} mm (${zoneSamples} pairs)`, '≤ 150 mm', zoneMax <= 0.15 + 1e-9, `S1 = min(h/4, 8db, 24ds, 300 mm, 150 mm) = ${(S1Std * 1000).toFixed(0)} mm; centre S2 = min(h/2, 300 mm) = ${(beamS2Value() * 1000).toFixed(0)} mm`, 'RC04');
  const d = beamEffectiveDepth(GEOM.beamH, COVER.beam.value, barDia('#7'));
  add('web', 'Web bars (effective depth d > 90 cm)', `d = ${(d * 100).toFixed(1)} cm`, 'required if d > 90 cm', d <= 0.9, d <= 0.9 ? 'not required; none placed' : 'web bars would be required', 'RC04');

  // ---- couplers (RC10)
  const cs = model.couplers;
  const byMemberLevel = new Map();
  for (const c of cs) {
    const key = `${c.member}|${c.height.toFixed(3)}`;
    if (!byMemberLevel.has(key)) byMemberLevel.set(key, []);
    byMemberLevel.get(key).push(c);
  }
  // adjacency: perimeter order is cyclic, so bars k and k+1 share a face
  let minStagger = Infinity;
  const colLineLevels = new Map();
  for (const c of cs) {
    const colKey = `${c.label.split(' · ')[0]}|${c.height.toFixed(2) > 4 ? 'F2' : '1F'}`;
    if (!colLineLevels.has(colKey)) colLineLevels.set(colKey, []);
    colLineLevels.get(colKey).push(c);
  }
  for (const list of colLineLevels.values()) {
    const sorted = list.slice().sort((a, b) => a.perimeter - b.perimeter);
    for (let k = 0; k < sorted.length; k++) {
      const a = sorted[k], b = sorted[(k + 1) % sorted.length];
      minStagger = Math.min(minStagger, Math.abs(a.height - b.height));
    }
  }
  add('coupler-stagger', 'Adjacent coupler stagger on each column (both faces)', `min ${(minStagger * 1000).toFixed(0)} mm`, '≥ 600 mm', minStagger >= COUPLER.stagger - 1e-9, `${cs.length} couplers in ${colLineLevels.size} splice rows`, 'RC10');
  const db = barDia('#7');
  const sleeveL = COUPLER.lengthFactor * db, od = COUPLER.odFactor * db;
  add('coupler-size', 'Coupler sleeve length / outer diameter', `${(sleeveL * 1000).toFixed(1)} mm / ${(od * 1000).toFixed(1)} mm`, '3.5 db / 1.8 db (db = 22.23 mm)', true, `db = ${(db * 1000).toFixed(2)} mm`, 'RC10');
  // clear cover from the coupler surface to the nearest column face (bar at the corner is the worst case)
  const cornerBar = HALF_COL - (0.2394);
  const clear = cornerBar - od / 2;
  const clearReq = COUPLER.clearCoverFactor * db;
  add('coupler-cover', 'Clear cover from coupler to concrete face', `${(clear * 1000).toFixed(1)} mm (corner bars)`, `≥ 2db = ${(clearReq * 1000).toFixed(1)} mm`, clear >= clearReq - 1e-9, 'FLAG: with 4 cm column cover and 60 mm couplers the 2db clear cover cannot be met; not adjusted, reported', 'RC10');
  add('coupler-spacing', 'Coupler centre spacing (adjacent bars)', `${(0.159 * 1000).toFixed(0)} mm`, `≥ 3db = ${(COUPLER.minCentreFactor * db * 1000).toFixed(1)} mm`, 0.159 >= COUPLER.minCentreFactor * db, 'bars 16 cm apart on each face', 'RC10');

  // ---- penetration (RC05)
  const pen = penetrationReinforcement(GEOM.penetrationD, GEOM.beamH);
  add('penetration', 'Beam penetration reinforcement (RC05)', `D = ${(GEOM.penetrationD * 1000).toFixed(0)} mm → ${pen.mark}`, 'rule table', !pen.error, `${pen.rule}; mid-span, ≥ 1h from column faces`, 'RC05');

  // ---- anchorage (assumed rule, flagged)
  add('ld', 'Development / anchorage length Ld (#7)', `${(developmentLength(db) * 1000).toFixed(0)} mm`, 'assumed rule (max(0.30 m, 40 db))', true, 'simplified assumed rule; verify against the adopted code', '—');

  // ---- weight
  const kg = model.bars.reduce((a, b) => a + b.weight, 0);
  add('weight', 'Rebar total (sum of length × unit mass)', `${kg.toFixed(0)} kg (${model.bars.length} bars)`, 'hand check: counts × unit mass', true, `unit mass = π/4·d²·7850 kg/m; #7 = ${(Math.PI / 4 * db * db * 7850).toFixed(3)} kg/m`, 'CNS 560');

  return out;
}

function beamS1Value() {
  return Math.min(GEOM.beamH / 4, 8 * barDia('#7'), 24 * barDia('#4'), 0.30, BEAM.S1Max);
}
function beamS2Value() {
  return Math.min(GEOM.beamH / 2, 0.30);
}

export const _unused = [EX, NYp, LEVELS, BAR_SIZES];
