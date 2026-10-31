// Rebar, couplers and spacers, generated from parameters in standards.js.
import {
  BAR_SIZES, barDia, barUnitMass, COVER, GEOM, COLUMN, BEAM, SLAB, COUPLER, SPACER,
  columnConfinementLength, beamS1, beamS2, hookExt, RULE_TEXT, LEVELS, developmentLength, RIB_PITCH,
} from '../standards.js';
import { add, sub, mul, pathLength, cleanPath, frameMap, hookedLoopPath, crossTieWire, roundedRectLoop } from './geom.js';
import { EX, NYp, NX, NY, HALF_COL, HALF_BEAM } from './members.js';

const r6 = (x) => Math.round(x * 1e6) / 1e6;

// ------------------------------------------------------------------ constants (all from standards)
const dsTie = barDia(COLUMN.tieSize);       // #3
const dbCol = barDia(COLUMN.mainSize);      // #7
const dsSt = barDia(BEAM.stirrupSize);      // #4
const dbBeam = barDia(BEAM.topSize);        // #7
const dsSlab = barDia(SLAB.botSize);        // #4
const dsSlabTop = barDia(SLAB.topSize);
const dsCorner = barDia(SLAB.cornerSize);   // #3
const dsGB = dsSt;
const COVc = COVER.column.value, COVb = COVER.beam.value, COVs = COVER.slab.value, COVgb = COVER.groundBeamEarth.value;

// Column perimeter bar positions (relative to column centre), 12 bars CCW from the BR corner.
// beta = 0.30 - cover - ds - db/2 (corner bars), mid = beta/3 (4 bars per face incl. corners).
const BETA_C = HALF_COL - COVc - dsTie - dbCol / 2;
const MID_C = BETA_C / 3;
export const COLUMN_BAR_POS = [
  [BETA_C, -BETA_C], [BETA_C, -MID_C], [BETA_C, MID_C], [BETA_C, BETA_C],
  [MID_C, BETA_C], [-MID_C, BETA_C], [-BETA_C, BETA_C], [-BETA_C, MID_C],
  [-BETA_C, -MID_C], [-BETA_C, -BETA_C], [-MID_C, -BETA_C], [MID_C, -BETA_C],
];

// Tie half-size and wrap radius (ties wrap the corner bars: R = ds/2 + db/2 and hx - R = beta)
const TIE_HX = HALF_COL - COVc - dsTie / 2;
const TIE_R = dsTie / 2 + dbCol / 2;

// Splice heights: mid-gap between centre ties (tie grid is 0.70 + 0.15k in the 1F centre).
// Even perimeter index -> low splice, odd -> +0.75 m (>= 0.60 stagger).
export const SPLICE_1F = [1.225, 1.975];
export const SPLICE_2F = [4.825, 5.575];
export const COUPLER_STAGGER_CHECK = 0.75;

// ------------------------------------------------------------------ tie heights
export function tieHeights(U0, U1) {
  const lo = columnConfinementLength(GEOM.Hn, GEOM.col, GEOM.col, GEOM.floorToFloor);
  const zb = [], zt = [];
  for (let z = U0 + COLUMN.firstTie; z <= U0 + lo + 1e-9; z += COLUMN.tieZoneS) zb.push(r6(z));
  for (let z = U1 - COLUMN.firstTie; z >= U1 - lo - 1e-9; z -= COLUMN.tieZoneS) zt.push(r6(z));
  zt.reverse();
  const c0 = zb[zb.length - 1], c1 = zt[0];
  const K = Math.ceil((c1 - c0) / COLUMN.tieCentreS - 1e-9) - 1;
  const centre = [];
  for (let k = 1; k <= K; k++) centre.push(r6(c0 + k * COLUMN.tieCentreS));
  return { zs: [...zb, ...centre, ...zt], lo, zb, zt, centre };
}

// Beam/GB stirrup stations, distance from the column face.
export function stationList(Lc, h, S1, S2, first = BEAM.firstStirrup) {
  const left = [];
  for (let s = first; s <= 2 * h + 1e-9; s += S1) left.push(r6(s));
  const mid = Lc / 2;
  const centre = [];
  for (let k = -60; k <= 60; k++) {
    const s = mid + k * S2;
    if (s >= 2 * h - 1e-9 && s <= Lc - 2 * h + 1e-9) centre.push(r6(s));
  }
  const right = left.map((s) => r6(Lc - s)).reverse();
  return [...left, ...centre, ...right];
}

// ------------------------------------------------------------------ builder context
function makeCtx() {
  return { bars: [], couplers: [], spacers: [], ringZs: [], penetrations: [] };
}

function pushBar(ctx, props) {
  const path = cleanPath(props.path);
  const length = r6(pathLength(path));
  const bar = {
    id: ctx.bars.length,
    dia: barDia(props.size),
    size: props.size,
    mass: barUnitMass(props.size),
    length,
    weight: 0,
    path,
    ...props,
  };
  bar.weight = bar.length * bar.mass;
  bar.dia = barDia(props.size);
  ctx.bars.push(bar);
  return bar;
}

// ------------------------------------------------------------------ columns
// Pieces: P0 dowel (GB -> S1), P1 (S1 -> floor 3.6), P2 (floor -> S2), P3 (S2 -> top 7.3)
function genColumn(m, ctx) {
  const E = EX[m.i], N = NYp[m.j];
  const st = m.storey;        // 1 or 2
  const U0 = m.U0, U1 = m.U1;
  const tie = tieHeights(U0, U1);
  const mkMark = `12-${COLUMN.mainSize}`;
  const stir = `${COLUMN.tieSize}@10/15`;
  const crossMark = `${COLUMN.crossTieSize}`;
  const colLabel = m.name.replace(/\s·.*/, '');

  // vertical main bars
  COLUMN_BAR_POS.forEach(([px, py], k) => {
    const low = k % 2 === 0;
    const pts = [];
    if (st === 1) {
      const S1 = low ? SPLICE_1F[0] : SPLICE_1F[1];
      // dowel from embedment in ground beam to S1
      pushBar(ctx, {
        kind: 'dowel', layer: 'column', group: 'main', member: m.id, band: m.band,
        size: COLUMN.mainSize, mark: mkMark, drawing: 'RC06', rule: RULE_TEXT.colStarter,
        label: `${colLabel} · main ${k + 1} · dowel`, perimeter: k, priority: 0,
        path: [[E + px, N + py, -GEOM.dowelEmbed], [E + px, N + py, S1]],
      });
      pushBar(ctx, {
        kind: 'main', layer: 'column', group: 'main', member: m.id, band: m.band,
        size: COLUMN.mainSize, mark: mkMark, drawing: 'RC06', rule: RULE_TEXT.colMain,
        label: `${colLabel} · main ${k + 1} · piece 2`, perimeter: k, priority: 1,
        path: [[E + px, N + py, S1], [E + px, N + py, U1]],
      });
    } else {
      const S2 = low ? SPLICE_2F[0] : SPLICE_2F[1];
      pushBar(ctx, {
        kind: 'main', layer: 'column', group: 'main', member: m.id, band: m.band,
        size: COLUMN.mainSize, mark: mkMark, drawing: 'RC06', rule: RULE_TEXT.colMain,
        label: `${colLabel} · main ${k + 1} · piece 3`, perimeter: k, priority: 0,
        path: [[E + px, N + py, U0], [E + px, N + py, S2]],
      });
      pushBar(ctx, {
        kind: 'main', layer: 'column', group: 'main', member: m.id, band: m.band,
        size: COLUMN.mainSize, mark: mkMark, drawing: 'RC06', rule: RULE_TEXT.colMain,
        label: `${colLabel} · main ${k + 1} · piece 4`, perimeter: k, priority: 1,
        path: [[E + px, N + py, S2], [E + px, N + py, GEOM.floorToFloor * 2 + GEOM.beamUpstand]],
      });
    }
  });

  // couplers: one per perimeter bar per splice level
  const spl = st === 1 ? SPLICE_1F : SPLICE_2F;
  COLUMN_BAR_POS.forEach(([px, py], k) => {
    const S = k % 2 === 0 ? spl[0] : spl[1];
    const db = dbCol;
    ctx.couplers.push({
      id: ctx.couplers.length, kind: 'coupler', member: m.id, band: m.band, layer: 'coupler', group: 'coupler',
      pos: [E + px, N + py, S], size: COUPLER.lengthFactor * db, od: COUPLER.odFactor * db, db,
      grade: st === 1 ? 'SA' : 'A', drawing: 'RC10', rule: RULE_TEXT.coupler, mark: `CPL ${COUPLER.lengthFactor}db`,
      label: `${colLabel} · coupler bar ${k + 1} · grade ${st === 1 ? 'SA' : 'A'}`, perimeter: k, height: S,
      mass: 0.0,
    });
  });

  // ties
  tie.zs.forEach((z, n) => {
    const side = n % 4;                                 // lap side rotates through the four faces
    const cxT = TIE_HX - TIE_R;                          // face length between corner bars (half)
    const frac = 0.5 + (n % 2 === 0 ? 0.16 : -0.16) / (2 * cxT);   // lap 16 cm either side of face centre: clear of mid-face bars, corner bars, beam legs and the centre leg
    const alphaA = n % 2 === 0 ? (3 * Math.PI) / 4 : Math.PI / 2;   // 135 / 90 alternate
    const alphaB = n % 2 === 0 ? Math.PI / 2 : (3 * Math.PI) / 4;
    const frame = frameMap([E, N, z], [1, 0, 0], [0, 1, 0]);
    const h = hookedLoopPath(frame, TIE_HX, TIE_HX, TIE_R, side, frac, alphaA, alphaB, hookExt(dsTie));
    // joint = inside the depth of a beam at a floor level (beam spans [F + upstand - beamH, F + upstand])
    const inJoint = [LEVELS.F2, LEVELS.R].some((F) => z >= F + GEOM.beamUpstand - GEOM.beamH - 1e-9 && z <= F + GEOM.beamUpstand + 1e-9);
    const zone = z <= U0 + tie.lo + 1e-9 || z >= U1 - tie.lo - 1e-9 ? 'confinement' : 'centre';
    const layer = inJoint ? 'joint' : 'column';
    const spacing = zone === 'confinement' ? COLUMN.tieZoneS : COLUMN.tieCentreS;
    pushBar(ctx, {
      kind: 'tie', layer, group: 'tie', member: m.id, band: m.band, size: COLUMN.tieSize,
      mark: stir, drawing: 'RC06', rule: zone === 'confinement' ? RULE_TEXT.colTieLo : RULE_TEXT.colTieC,
      label: `${colLabel} · tie ${n + 1} · z ${z.toFixed(3)} m`, tieIndex: n, z, zone, spacing,
      hooks: [alphaA, alphaB], priority: 2 + n * 2,
      path: h.pts,
    });
    // crossties at every tie level
    const xDir = n % 2 === 0;
    const yc = n % 4 < 2 ? MID_C : -MID_C;
    const wire2 = crossTieWire(BETA_C, yc, TIE_R, n % 2 === 0 ? (3 * Math.PI) / 4 : Math.PI / 2, n % 2 === 0 ? Math.PI / 2 : (3 * Math.PI) / 4, hookExt(dsTie));
    // NB: crossTieWire returns the wire from tail to tail (tail_L, L0, R0, tail_R)
    const pts = wire2.map(([x, y]) => (xDir ? [E + x, N + y, z] : [E + y, N + x, z]));
    pushBar(ctx, {
      kind: 'crosstie', layer, group: 'crosstie', member: m.id, band: m.band, size: COLUMN.crossTieSize,
      mark: crossMark, drawing: 'RC06', rule: RULE_TEXT.colCross,
      label: `${colLabel} · crosstie ${n + 1} · ${xDir ? 'X' : 'Y'}`, tieIndex: n, z,
      hooks: [alphaA, alphaB], priority: 3 + n * 2,
      path: pts,
    });
  });
  m.tie = tie;
  return tie;
}

// ------------------------------------------------------------------ beams
function beamTopBottomZ(F, ctx, isX) {
  const topZ = F + GEOM.beamUpstand - COVb - dsSt - dbBeam / 2;
  const botZ = F + GEOM.beamUpstand - GEOM.beamH + COVb + dsSt + dbBeam / 2;
  // X beams use upper layer for top bars; Y beams lower top layer (and the reverse for bottoms)
  const layerStep = dbBeam + 0.004;     // one bar diameter plus 4 mm between the two directions
  return {
    topZ: isX ? topZ : topZ - layerStep,
    botZ: isX ? botZ : botZ + layerStep,
  };
}

function nudgeZ(z, rings, minClear) {
  const bad = (zz) => rings.some((r) => Math.abs(zz - r) < minClear);
  if (!bad(z)) return z;
  for (let k = 1; k <= 8; k++) {
    for (const s of [k * 0.0005, -k * 0.0005]) {
      if (!bad(z + s)) return r6(z + s);
    }
  }
  return z;
}

function genBeam(m, ctx) {
  const isX = m.dir === 'X';
  const F = m.F;
  const i = m.i, j = m.j;
  const ringZs = ctx.ringZs;
  const spanStart = isX ? EX[i] : NYp[j];
  const spanEnd = isX ? EX[i + 1] : NYp[j + 1];
  const lineC = isX ? NYp[j] : EX[i];     // the grid coordinate of the beam line
  const Lc = (spanEnd - spanStart) - 2 * HALF_COL;
  const zs = beamTopBottomZ(F, ctx, isX);
  const minClear = dsTie / 2 + dbBeam / 2 + 0.0005;      // tie wire radius + bar radius + 0.5 mm
  const topZ = nudgeZ(zs.topZ, ringZs, minClear);
  const botZ = nudgeZ(zs.botZ, ringZs, minClear);
  const hb = HALF_BEAM;
  const betaB = hb - COVb - dsSt - dbBeam / 2;
  const offs = [-betaB, 0, betaB];
  const legLen = 12 * dbBeam;                             // 90 deg anchorage leg into the column
  const beamLabel = m.name.replace(/\s·.*/, '');
  const at = (along, across, z) => (isX ? [along, lineC + across, z] : [lineC + across, along, z]);

  // Top bars: 90 deg anchorage legs down into each column. Legs sit 0.10 m inside each column centre line,
  // bottom-bar legs 0.20 m inside, so top and bottom legs never share a plan position.
  const a0 = spanStart + 0.10, a1 = spanEnd - 0.10;
  const b0 = spanStart + 0.20, b1 = spanEnd - 0.20;
  offs.forEach((o, idx) => {
    const path = [at(a0, o, topZ - legLen), at(a0, o, topZ), at(a1, o, topZ), at(a1, o, topZ - legLen)];
    pushBar(ctx, {
      kind: 'beamTop', layer: 'beam', group: 'main', member: m.id, band: m.band, size: BEAM.topSize,
      mark: `${BEAM.topCount}-${BEAM.topSize}`, drawing: 'RC04', rule: RULE_TEXT.beamTop,
      label: `${beamLabel} · top ${idx + 1}`, priority: idx, path,
    });
  });
  // Bottom bars: 90 deg hooks up into each column
  offs.forEach((o, idx) => {
    const path = [at(b0, o, botZ + legLen), at(b0, o, botZ), at(b1, o, botZ), at(b1, o, botZ + legLen)];
    pushBar(ctx, {
      kind: 'beamBot', layer: 'beam', group: 'main', member: m.id, band: m.band, size: BEAM.botSize,
      mark: `${BEAM.botCount}-${BEAM.botSize}`, drawing: 'RC04', rule: RULE_TEXT.beamBot,
      label: `${beamLabel} · bottom ${idx + 1}`, priority: 3 + idx, path,
    });
  });

  // Stirrups
  const Uc = F + GEOM.beamUpstand - GEOM.beamH / 2;          // beam centre elevation (middle of [F-0.60, F+0.10])
  const S1 = beamS1(GEOM.beamH, dbBeam, dsSt), S2 = beamS2(GEOM.beamH);
  const hxS = hb - COVb - dsSt / 2, hyS = GEOM.beamH / 2 - COVb - dsSt / 2;
  const RS = dsSt / 2 + dbBeam / 2;
  const stations = stationList(Lc, GEOM.beamH, S1, S2);
  const perimeter = isX ? (j === 0 || j === NY - 1) : (i === 0 || i === NX - 1);
  const exteriorDir = isX ? (j === 0 ? -1 : (j === NY - 1 ? 1 : 0)) : (i === 0 ? -1 : (i === NX - 1 ? 1 : 0));
  stations.forEach((s, n) => {
    const along = spanStart + HALF_COL + s;
    // frame: local x -> across beam (N for X beams / E for Y beams), local y -> up
    const frame = isX ? frameMap([along, lineC, Uc], [0, 1, 0], [0, 0, 1]) : frameMap([lineC, along, Uc], [1, 0, 0], [0, 0, 1]);
    let side, alphaA, alphaB;
    if (perimeter && exteriorDir !== 0) {
      // perimeter beams: 135 hooks face outward (on the exterior face), always
      side = exteriorDir < 0 ? 1 : 3;
      alphaA = (3 * Math.PI) / 4; alphaB = Math.PI / 2;
    } else {
      side = n % 2 === 0 ? 3 : 1;
      alphaA = n % 2 === 0 ? (3 * Math.PI) / 4 : Math.PI / 2;
      alphaB = n % 2 === 0 ? Math.PI / 2 : (3 * Math.PI) / 4;
    }
    const h = hookedLoopPath(frame, hxS, hyS, RS, side, 0.5, alphaA, alphaB, hookExt(dsSt));
    const zone = (s <= 2 * GEOM.beamH + 1e-9 || s >= Lc - 2 * GEOM.beamH - 1e-9) ? 'end' : 'centre';
    const spacing = zone === 'end' ? S1 : S2;
    pushBar(ctx, {
      kind: 'stirrup', layer: 'beam', group: 'stirrup', member: m.id, band: m.band, size: BEAM.stirrupSize,
      mark: `${BEAM.stirrupSize}@${Math.round(S1 * 100)}/${Math.round(S2 * 100)}`,
      drawing: 'RC04', rule: perimeter && exteriorDir !== 0 ? RULE_TEXT.beamStir : (n === 0 ? RULE_TEXT.beamFirst : RULE_TEXT.beamZone),
      label: `${beamLabel} · stirrup ${n + 1} @ ${s.toFixed(2)} m`, station: s, zone, spacing,
      hooks: [alphaA, alphaB], priority: 6 + n, path: h.pts,
    });
  });
  // web bars: not required (RC04, d <= 90 cm)
  m.stations = stations;
  m.S1 = S1; m.S2 = S2;
  m.Lc = Lc;
}

// ------------------------------------------------------------------ ground beams (same rules, earth cover)
function genGB(m, ctx) {
  const isX = m.dir === 'X';
  const x0 = EX[m.i], x1 = EX[m.i + 1];
  const y0 = NYp[m.j], y1 = NYp[m.j + 1];
  const spanStart = isX ? x0 : y0, spanEnd = isX ? x1 : y1;
  const lineC = isX ? NYp[m.j] : EX[m.i];
  const Lc = (spanEnd - spanStart) - 2 * HALF_COL;
  const hbg = GEOM.gbB / 2;
  const betaG = hbg - COVgb - dsGB - dbBeam / 2;
  // X ground beams take the upper top layer / lower bottom layer; Y ground beams the reverse (no bar crossings at nodes)
  const layerStep = dbBeam + 0.004;
  const topZ = -COVgb - dsGB - dbBeam / 2 - (isX ? 0 : layerStep);
  const botZ = -GEOM.gbH + COVgb + dsGB + dbBeam / 2 + (isX ? 0 : layerStep);
  const Uc = -GEOM.gbH / 2;
  const at = (along, across, z) => (isX ? [along, lineC + across, z] : [lineC + across, along, z]);
  const a0 = spanStart + 0.10, a1 = spanEnd - 0.10;
  const b0 = spanStart + 0.25, b1 = spanEnd - 0.25;     // bottom legs clear the crossing bars at the node corner
  const legLen = 12 * dbBeam;
  const label = m.name;
  [-betaG, 0, betaG].forEach((o, idx) => {
    pushBar(ctx, { kind: 'gbTop', layer: 'gb', group: 'main', member: m.id, band: 0, size: BEAM.topSize,
      mark: `3-${BEAM.topSize}`, drawing: 'RC04', rule: RULE_TEXT.gbMain, label: `${label} · top ${idx + 1}`, priority: idx,
      path: [at(a0, o, topZ - legLen), at(a0, o, topZ), at(a1, o, topZ), at(a1, o, topZ - legLen)] });
    pushBar(ctx, { kind: 'gbBot', layer: 'gb', group: 'main', member: m.id, band: 0, size: BEAM.botSize,
      mark: `3-${BEAM.botSize}`, drawing: 'RC04', rule: RULE_TEXT.gbMain, label: `${label} · bottom ${idx + 1}`, priority: 3 + idx,
      path: [at(b0, o, botZ + legLen), at(b0, o, botZ), at(b1, o, botZ), at(b1, o, botZ + legLen)] });
  });
  const S1 = beamS1(GEOM.gbH, dbBeam, dsGB), S2 = beamS2(GEOM.gbH);
  const hxS = hbg - COVgb - dsGB / 2, hyS = GEOM.gbH / 2 - COVgb - dsGB / 2;
  const RS = dsGB / 2 + dbBeam / 2;
  const stations = stationList(Lc, GEOM.gbH, S1, S2);
  stations.forEach((s, n) => {
    const along = spanStart + HALF_COL + s;
    const frame = isX ? frameMap([along, lineC, Uc], [0, 1, 0], [0, 0, 1]) : frameMap([lineC, along, Uc], [1, 0, 0], [0, 0, 1]);
    const side = n % 2 === 0 ? 3 : 1;
    const alphaA = n % 2 === 0 ? (3 * Math.PI) / 4 : Math.PI / 2;
    const alphaB = n % 2 === 0 ? Math.PI / 2 : (3 * Math.PI) / 4;
    const h = hookedLoopPath(frame, hxS, hyS, RS, side, 0.5, alphaA, alphaB, hookExt(dsGB));
    pushBar(ctx, { kind: 'gbStir', layer: 'gb', group: 'stirrup', member: m.id, band: 0, size: BEAM.stirrupSize,
      mark: `${BEAM.stirrupSize}@${Math.round(S1 * 100)}/${Math.round(S2 * 100)}`, drawing: 'RC04', rule: RULE_TEXT.gbStir,
      label: `${label} · stirrup ${n + 1} @ ${s.toFixed(2)} m`, station: s, priority: 6 + n, hooks: [alphaA, alphaB], path: h.pts });
  });
  // spacers under bottom bars at 0.7 m (height = earth cover)
  for (let s = spanStart + HALF_COL + 0.36; s <= spanEnd - HALF_COL - 0.36 + 1e-9; s += GEOM.spacerInterval) {
    [-betaG, betaG].forEach((o) => {
      const c = at(s, o, -GEOM.gbH + COVgb / 2);
      addSpacer(ctx, m, c, isX, COVgb, 'GB');
    });
  }
  m.stations = stations; m.S1 = S1; m.S2 = S2; m.Lc = Lc;
}

// ------------------------------------------------------------------ spacers
function addSpacer(ctx, m, centre, alongX, heightBlock, tag) {
  const [L, , W] = GEOM.spacerSize;
  ctx.spacers.push({
    id: ctx.spacers.length, kind: 'spacer', layer: 'spacer', group: 'spacer', member: m.id, band: m.band,
    centre, size: [alongX ? L : W, heightBlock, alongX ? W : L], drawing: SPACER.ref, rule: RULE_TEXT.spacer,
    mark: `spacer ${tag}`, label: `${m.name} · spacer`,
  });
}

function genBeamSpacers(m, ctx) {
  const isX = m.dir === 'X';
  const spanStart = isX ? EX[m.i] : NYp[m.j];
  const spanEnd = isX ? EX[m.i + 1] : NYp[m.j + 1];
  const lineC = isX ? NYp[m.j] : EX[m.i];
  const beamBottom = m.F + GEOM.beamUpstand - GEOM.beamH;
  const betaB = HALF_BEAM - COVb - dsSt - dbBeam / 2;
  const h = COVb;   // spacer block height = cover; sits under the bottom stirrup leg, on the formwork
  for (let s = spanStart + HALF_COL + 0.36; s <= spanEnd - HALF_COL - 0.36 + 1e-9; s += GEOM.spacerInterval) {
    [-betaB, betaB].forEach((o) => {
      const c = isX ? [s, lineC + o, beamBottom + h / 2] : [lineC + o, s, beamBottom + h / 2];
      addSpacer(ctx, m, c, isX, h, 'beam');
    });
  }
}

// ------------------------------------------------------------------ slabs
// Clash-avoidance: slab bars whose plan position falls within a stirrup plane of an adjacent beam are nudged.
function avoidStations(p, stations, clear) {
  const bad = (q) => stations.some((s) => Math.abs(q - s) < clear);
  if (!bad(p)) return p;
  for (let k = 1; k <= 12; k++) {
    for (const s of [k * 0.004, -k * 0.004]) if (!bad(p + s)) return r6(p + s);
  }
  return p;
}

function genSlab(m, ctx) {
  const i = m.i, j = m.j;
  const x0 = EX[i], x1 = EX[i + 1], y0 = NYp[j], y1 = NYp[j + 1];
  const F = m.F;
  const hb = HALF_BEAM;
  const zB1 = F - GEOM.slabT + COVs + dsSlab / 2;              // lower bottom layer (along E)
  const zB2 = zB1 + dsSlab;                                       // upper bottom layer (along N)
  const zT1 = F - COVs - dsSlabTop / 2;                           // upper top layer (along E)
  const zT2 = zT1 - dsSlabTop;                                    // lower top layer (along N)
  const zC = zT2 - (dsSlabTop / 2 + dsCorner / 2 + 0.0012);       // corner bars just below the top mat (no contact)
  const stationsX = m.adjStationsX || [];   // stirrup stations of X beams along this panel's N faces
  const stationsY = m.adjStationsY || [];
  const clearS = dsSt / 2 + dsSlab / 2 + 0.002;
  const spacing = SLAB.botSpacing;
  const label = m.name.replace(/\s·.*/, '');

  // B1: along E, positions across N
  const nB1 = [];
  for (let n = y0 + 0.36; n <= y1 - 0.36 + 1e-9; n += spacing) nB1.push(n);
  nB1.forEach((n0, k) => {
    const n = avoidStations(r6(n0), stationsY.concat(stationsX.filter(() => false)), clearS);
    pushBar(ctx, { kind: 'slabB1', layer: 'slab', group: 'slab', member: m.id, band: m.band, size: SLAB.botSize,
      mark: `${SLAB.botSize}@200 (bot E)`, drawing: 'RC08', rule: RULE_TEXT.slabBot, label: `${label} · bottom E ${k + 1}`, priority: k,
      path: [[x0 + hb - SLAB.bearing, n, zB1], [x1 - hb + SLAB.bearing, n, zB1]] });
    // spacer every 0.70 m under this bottom bar (brief: 60-80 cm under bottom bars)
    for (let e = x0 + 0.36; e <= x1 - 0.36 + 1e-9; e += GEOM.spacerInterval) {
      addSpacer(ctx, m, [e, n, F - GEOM.slabT + COVs / 2], true, COVs, 'slab');
    }
  });
  // B2: along N, positions across E
  const nB2 = [];
  for (let e = x0 + 0.36; e <= x1 - 0.36 + 1e-9; e += spacing) nB2.push(e);
  nB2.forEach((e0, k) => {
    const e = avoidStations(r6(e0), stationsX, clearS);
    pushBar(ctx, { kind: 'slabB2', layer: 'slab', group: 'slab', member: m.id, band: m.band, size: SLAB.botSize,
      mark: `${SLAB.botSize}@200 (bot N)`, drawing: 'RC08', rule: RULE_TEXT.slabBot, label: `${label} · bottom N ${k + 1}`, priority: 100 + k,
      path: [[e, y0 + hb - SLAB.bearing, zB2], [e, y1 - hb + SLAB.bearing, zB2]] });
  });
  // Top mat over X-beam supports (along E), extends 0.25 Ly from each support
  const Ly = (y1 - y0) - 2 * hb, Lx = (x1 - x0) - 2 * hb;
  const extY = SLAB.topExtFactor * Ly, extX = SLAB.topExtFactor * Lx;
  for (let n = y0 + hb + 0.16; n <= y0 + hb + extY + 1e-9; n += SLAB.topSpacing) {
    const nn = avoidStations(r6(n), stationsY, clearS);
    pushBar(ctx, { kind: 'slabT1', layer: 'slab', group: 'slab', member: m.id, band: m.band, size: SLAB.topSize,
      mark: `${SLAB.topSize}@200 (top E)`, drawing: 'RC08', rule: RULE_TEXT.slabTop, label: `${label} · top E @ S ${nn.toFixed(2)}`, priority: 200,
      path: [[x0 + hb - SLAB.bearing, nn, zT1], [x1 - hb + SLAB.bearing, nn, zT1]] });
  }
  for (let n = y1 - hb - 0.16; n >= y1 - hb - extY - 1e-9; n -= SLAB.topSpacing) {
    const nn = avoidStations(r6(n), stationsY, clearS);
    pushBar(ctx, { kind: 'slabT1', layer: 'slab', group: 'slab', member: m.id, band: m.band, size: SLAB.topSize,
      mark: `${SLAB.topSize}@200 (top E)`, drawing: 'RC08', rule: RULE_TEXT.slabTop, label: `${label} · top E @ N ${nn.toFixed(2)}`, priority: 201,
      path: [[x0 + hb - SLAB.bearing, nn, zT1], [x1 - hb + SLAB.bearing, nn, zT1]] });
  }
  // Top mat over Y-beam supports (along N)
  for (let e = x0 + hb + 0.16; e <= x0 + hb + extX + 1e-9; e += SLAB.topSpacing) {
    const ee = avoidStations(r6(e), stationsX, clearS);
    pushBar(ctx, { kind: 'slabT2', layer: 'slab', group: 'slab', member: m.id, band: m.band, size: SLAB.topSize,
      mark: `${SLAB.topSize}@200 (top N)`, drawing: 'RC08', rule: RULE_TEXT.slabTop, label: `${label} · top N @ E ${ee.toFixed(2)}`, priority: 202,
      path: [[ee, y0 + hb - SLAB.bearing, zT2], [ee, y1 - hb + SLAB.bearing, zT2]] });
  }
  for (let e = x1 - hb - 0.16; e >= x1 - hb - extX - 1e-9; e -= SLAB.topSpacing) {
    const ee = avoidStations(r6(e), stationsX, clearS);
    pushBar(ctx, { kind: 'slabT2', layer: 'slab', group: 'slab', member: m.id, band: m.band, size: SLAB.topSize,
      mark: `${SLAB.topSize}@200 (top N)`, drawing: 'RC08', rule: RULE_TEXT.slabTop, label: `${label} · top N @ E ${ee.toFixed(2)}`, priority: 203,
      path: [[ee, y0 + hb - SLAB.bearing, zT2], [ee, y1 - hb + SLAB.bearing, zT2]] });
  }
  // Corner reinforcement at exterior panel corners (diagonal bar in the plan)
  const exteriorCorner = (i === 0 || i === NX - 2) && (j === 0 || j === NY - 2);
  if (exteriorCorner) {
    const sx = i === 0 ? 1 : -1, sy = j === 0 ? 1 : -1;
    const cx = i === 0 ? x0 : x1, cy = j === 0 ? y0 : y1;
    const p1 = [cx + sx * 0.36, cy + sy * 0.36, zC];
    const p2 = [cx + sx * 1.36, cy + sy * 1.36, zC];
    pushBar(ctx, { kind: 'slabCorner', layer: 'slab', group: 'slab', member: m.id, band: m.band, size: SLAB.cornerSize,
      mark: `${SLAB.cornerSize} corner`, drawing: 'RC07', rule: RULE_TEXT.slabCorner, label: `${label} · corner bar`, priority: 210,
      path: [p1, p2] });
  }
  void extX; void extY;
}

// Penetration reinforcement (RC05) for one demo beam: 2-D10 trimmers around a 100 mm sleeve
function genPenetration(m, ctx) {
  const r = { mark: '2-D10', size: '#3' };
  const F = m.F;
  const Uc = F + GEOM.beamUpstand - GEOM.beamH / 2;
  const off = GEOM.penetrationD / 2 + COVb + dsTie / 2;
  const x = EX[m.i], n0 = NYp[m.j], n1 = NYp[m.j + 1];
  const nMid = (n0 + n1) / 2;
  [Uc + off, Uc - off].forEach((z, k) => {
    pushBar(ctx, { kind: 'trimmer', layer: 'beam', group: 'stirrup', member: m.id, band: m.band, size: r.size,
      mark: r.mark, drawing: 'RC05', rule: RULE_TEXT.penetration, label: `${m.name} · trimmer ${k + 1}`, priority: 300 + k,
      path: [[x, nMid - 0.30, z], [x, nMid + 0.30, z]] });
  });
  ctx.penetrations.push({ member: m.id, D: GEOM.penetrationD, centre: [x, nMid, Uc] });
}

// ------------------------------------------------------------------ orchestrate
export function buildRebar(members) {
  const ctx = makeCtx();
  // 1. columns first (their tie heights define the joint rings the beam bars must clear)
  const colHeights = [];
  for (const m of members.filter((mm) => mm.kind === 'COL')) {
    const t = genColumn(m, ctx);
    colHeights.push(...t.zs);
  }
  const ringAll = [...new Set(colHeights.map((z) => r6(z)))];
  ctx.ringZs = ringAll;

  // 2. ground beams
  for (const m of members.filter((mm) => mm.kind === 'GB')) genGB(m, ctx);

  // 3. beams (their stations also drive slab-bar clash avoidance)
  for (const m of members.filter((mm) => mm.kind === 'BEAM')) genBeam(m, ctx);

  // 4. slabs (stations of adjacent beams)
  for (const m of members.filter((mm) => mm.kind === 'SLAB')) {
    const bx = members.find((b) => b.kind === 'BEAM' && b.dir === 'X' && b.lvl === m.lvl && b.i === m.i && b.j === m.j);
    const bx2 = members.find((b) => b.kind === 'BEAM' && b.dir === 'X' && b.lvl === m.lvl && b.i === m.i && b.j === m.j + 1);
    const by1 = members.find((b) => b.kind === 'BEAM' && b.dir === 'Y' && b.lvl === m.lvl && b.i === m.i && b.j === m.j);
    const by2 = members.find((b) => b.kind === 'BEAM' && b.dir === 'Y' && b.lvl === m.lvl && b.i === m.i + 1 && b.j === m.j);
    // stirrup stations as absolute coordinates
    const stX = [];
    const stY = [];
    for (const b of [bx, bx2]) if (b) stX.push(...b.stations.map((s) => EX[b.i] + HALF_COL + s));
    for (const b of [by1, by2]) if (b) stY.push(...b.stations.map((s) => NYp[b.j] + HALF_COL + s));
    m.adjStationsX = stX;   // used for B2/T2 (along N) clash with X-beam stations (E positions)
    m.adjStationsY = stY;   // used for B1/T1 (along E) clash with Y-beam stations (N positions)
    genSlab(m, ctx);
  }

  // 5. beam spacers (after beam stations are known)
  for (const m of members.filter((mm) => mm.kind === 'BEAM')) genBeamSpacers(m, ctx);

  // 6. penetration demo: one mid-span Y beam on the F2 frame
  const pen = members.find((m) => m.kind === 'BEAM' && m.dir === 'Y' && m.lvl === 'F2' && m.i === 2 && m.j === 1);
  if (pen) genPenetration(pen, ctx);

  // member <-> bar index
  for (const b of ctx.bars) {
    const m = members[b.member];
    (m.bars || (m.bars = [])).push(b.id);
  }
  for (const c of ctx.couplers) (members[c.member].couplers || (members[c.member].couplers = [])).push(c.id);
  for (const s of ctx.spacers) (members[s.member].spacers || (members[s.member].spacers = [])).push(s.id);
  return ctx;
}

export const JOINT_NOTE = 'Beam bars hook 90 deg into columns (no bar passes the column core); joint hoops at 10 cm are the column ties inside the beam depth.';
export { BAR_SIZES, LEVELS, RIB_PITCH, mul, sub, add, roundedRectLoop, developmentLength };
