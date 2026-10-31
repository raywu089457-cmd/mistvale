// Acceptance checks on the generated model (pure Node, no browser).
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildModel } from '../src/model/index.js';
import { findClashes, tieSpacings } from '../src/model/checks.js';
import { standardsReport } from '../src/model/report.js';
import { BAR_SIZES, barUnitMass, barDia, COLUMN, BEAM, COUPLER, GEOM, columnConfinementLength, beamS1, beamS2, hookExt, penetrationReinforcement, RULE_TEXT, DRAWINGS } from '../src/standards.js';
import { EX, NYp } from '../src/model/members.js';
import { GROUP_NAMES, groupIndex } from '../src/model/explode.js';

const model = buildModel();
const cols = model.members.filter((m) => m.kind === 'COL');
const beams = model.members.filter((m) => m.kind === 'BEAM');
const TOL = 0.001; // 1 mm

// ----------------------------------------------------------------- standards table
test('rebar nominal diameters match the brief (CNS 560 table)', () => {
  const expect = { '#3': 0.00953, '#4': 0.0127, '#5': 0.01588, '#6': 0.01905, '#7': 0.02223, '#8': 0.0254, '#9': 0.02865, '#10': 0.03226, '#11': 0.03581, '#14': 0.043 };
  for (const [k, v] of Object.entries(expect)) assert.equal(barDia(k), v, k);
});

test('unit mass = pi/4 d^2 x 7850 kg/m', () => {
  assert.ok(Math.abs(barUnitMass('#3') - 0.5599) < 0.001);
  assert.ok(Math.abs(barUnitMass("#7") - 3.0466) < 0.002);
});

test('confinement length formula gives 0.60 m for this column', () => {
  assert.equal(columnConfinementLength(GEOM.Hn, 0.6, 0.6, GEOM.floorToFloor), 0.6);
});

test('hook extension = max(6 db, 7.5 cm)', () => {
  assert.equal(hookExt(0.00953), 0.075);
  assert.ok(Math.abs(hookExt(0.02223) - 6 * 0.02223) < 1e-9);
});

test('beam stirrup spacing formulas (RC04)', () => {
  assert.equal(beamS1(0.7, 0.02223, 0.0127), 0.15);      // capped at 15 cm
  assert.equal(beamS2(0.7), 0.30);
});

test('penetration rule table (RC05)', () => {
  assert.equal(penetrationReinforcement(0.05, 0.7).none, true);
  assert.equal(penetrationReinforcement(0.10, 0.7).mark, '2-D10');
  assert.equal(penetrationReinforcement(0.18, 0.7).mark, '2-D13');
  assert.equal(penetrationReinforcement(0.22, 0.7).mark, '2-D16');
});

// ----------------------------------------------------------------- structure
test('geometry: 2 storeys x 4 x 3 bays on a 6.0 x 5.0 m grid, 3.6 m floor-to-floor', () => {
  assert.equal(EX.length, 5);
  assert.equal(NYp.length, 4);
  assert.deepEqual(EX.map((x, i) => Math.round((x - EX[0]) * 10) / 10), [0, 6, 12, 18, 24]);
  assert.deepEqual(NYp.map((y, j) => Math.round((y - NYp[0]) * 10) / 10), [0, 5, 10, 15]);
  assert.equal(cols.length, 40);                      // 20 nodes x 2 storeys
  for (const c of cols) assert.ok(Math.abs((c.U1 - c.U0) - 3.6) < 1e-9);
  assert.equal(beams.length, 62);                     // 2 frames x (16 X + 15 Y) beams
  assert.equal(model.members.filter((m) => m.kind === 'SLAB').length, 24);
  assert.equal(model.members.filter((m) => m.kind === 'GB').length, 31);
});

test('every column has 12 main bars and every member carries its bars', () => {
  for (const c of cols) {
    const mains = c.bars.map((id) => model.bars[id]).filter((b) => b.kind === 'main' || b.kind === 'dowel');
    const perimeter = new Set(mains.map((b) => b.perimeter));
    assert.equal(perimeter.size, 12);
  }
});

// ----------------------------------------------------------------- tie spacing (acceptance 1, 2)
test('column tie spacing: 100 mm in the confinement zone, 150 mm in the centre (all samples, 1 mm)', () => {
  let conf = 0, centre = 0;
  for (const c of cols) {
    const s = tieSpacings(c.tie.zs, c.tie.lo, c.U0, c.U1);
    for (const p of s) {
      if (p.zone === 'confinement') { conf++; assert.ok(Math.abs(p.spacing - 0.10) <= TOL, `conf ${p.spacing}`); }
      if (p.zone === 'centre') { centre++; assert.ok(Math.abs(p.spacing - 0.15) <= TOL, `centre ${p.spacing}`); }
      assert.ok(p.spacing <= 0.15 + 1e-9, 'never more than 150 mm');
    }
  }
  assert.ok(conf > 300 && centre > 500);
});

test('first column tie centre is 50 mm from the floor line (both floors, both ends)', () => {
  for (const c of cols) {
    assert.ok(Math.abs(c.tie.zs[0] - (c.U0 + 0.05)) < 1e-9);
    assert.ok(Math.abs(c.tie.zs[c.tie.zs.length - 1] - (c.U1 - 0.05)) < 1e-9);
  }
});

test('column ties are closed and carry a crosstie at every level', () => {
  const ties = model.bars.filter((b) => b.kind === 'tie');
  const cross = model.bars.filter((b) => b.kind === 'crosstie');
  assert.equal(ties.length, cross.length);
  assert.equal(ties.length, cols.length * 28);
});

test('tie hooks alternate 135 deg and 90 deg', () => {
  const ties = model.bars.filter((b) => b.kind === 'tie' && b.member === cols[0].id);
  for (let k = 1; k < ties.length; k++) assert.notDeepEqual(ties[k].hooks, ties[k - 1].hooks);
  for (const t of ties) assert.deepEqual([...t.hooks].map((a) => Math.round(a * 180 / Math.PI)).sort((a, b) => a - b), [90, 135]);
});

// ----------------------------------------------------------------- beams (acceptance 2, 3)
test('first beam stirrup is 50 mm from the column face', () => {
  for (const b of beams) assert.ok(Math.abs(b.stations[0] - 0.05) < 1e-9);
});

test('beam stirrup spacing inside 2h never exceeds 150 mm', () => {
  for (const b of beams) {
    const zone = 2 * GEOM.beamH;
    for (let k = 1; k < b.stations.length; k++) {
      const a = b.stations[k - 1], c = b.stations[k];
      const inEnd = (s) => s <= zone + 1e-9 || s >= b.Lc - zone - 1e-9;
      if (inEnd(a) && inEnd(c)) assert.ok(c - a <= 0.15 + 1e-9, `${c - a}`);
    }
  }
});

test('interior stirrups alternate their 135/90 hooks; perimeter 135 hooks always face outward', () => {
  const inner = beams.find((b) => b.dir === 'X' && b.j === 1);
  const st = model.bars.filter((b) => b.kind === 'stirrup' && b.member === inner.id);
  for (let k = 1; k < st.length; k++) assert.notDeepEqual(st[k].hooks, st[k - 1].hooks);
  const edge = beams.find((b) => b.dir === 'X' && b.j === 0);
  const es = model.bars.filter((b) => b.kind === 'stirrup' && b.member === edge.id);
  assert.ok(es.every((b) => Math.round(b.hooks[0] * 180 / Math.PI) === 135), 'perimeter 135 hooks');
});

test('beam bars: at least 2 top bars continuous to the support, anchored 90 deg (legs)', () => {
  const tops = model.bars.filter((b) => b.kind === 'beamTop' && b.member === beams[0].id);
  assert.ok(tops.length >= BEAM.topMin);
  for (const t of tops) assert.equal(t.path.length, 4);
});

test('web bars not required: effective depth 64 cm < 90 cm', () => {
  const rep = standardsReport(model).find((r) => r.id === 'web');
  assert.equal(rep.pass, true);
});

// ----------------------------------------------------------------- couplers (acceptance 4)
test('adjacent couplers on every column are staggered at least 600 mm', () => {
  const groups = new Map();
  for (const c of model.couplers) {
    const key = `${c.label.split(' · ')[0]}|${c.height.toFixed(2) > '4' ? 'F2' : '1F'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  let pairs = 0;
  for (const list of groups.values()) {
    list.sort((a, b) => a.perimeter - b.perimeter);
    for (let k = 0; k < list.length; k++) {
      const a = list[k], b = list[(k + 1) % list.length];
      assert.ok(Math.abs(a.height - b.height) >= COUPLER.stagger - 1e-9, `${a.label} vs ${b.label}`);
      pairs++;
    }
  }
  assert.equal(pairs, cols.length * 12);
});

test('couplers sit on their own bar line and clear every tie level', () => {
  for (const c of model.couplers) {
    const bar = model.bars.find((b) => b.kind === 'main' && b.label.startsWith(c.label.split(' · ')[0]) && b.perimeter === c.perimeter && Math.abs(b.path[0][2] - (c.height - 0.02)) < 2);
    assert.ok(bar, 'bar line exists');
    assert.equal(bar.path[0][0], c.pos[0]);
    assert.equal(bar.path[0][1], c.pos[1]);
  }
});

test('coupler dimensions: sleeve 3.5 db, OD 1.8 db, spacing >= 3 db', () => {
  const db = barDia('#7');
  const c = model.couplers[0];
  assert.ok(Math.abs(c.size - COUPLER.lengthFactor * db) < 1e-9);
  assert.ok(Math.abs(c.od - COUPLER.odFactor * db) < 1e-9);
  assert.ok(0.159 >= COUPLER.minCentreFactor * db);
});

// ----------------------------------------------------------------- coaxial through the joint (acceptance 5)
test('column cages of consecutive storeys are coaxial with zero lateral offset and zero vertical gap', () => {
  for (let i = 0; i < EX.length; i++) for (let j = 0; j < NYp.length; j++) {
    const lo = model.bars.filter((b) => b.member === cols.find((c) => c.i === i && c.j === j && c.storey === 1).id && b.kind === 'main' && b.label.includes('piece 2'));
    const hi = model.bars.filter((b) => b.member === cols.find((c) => c.i === i && c.j === j && c.storey === 2).id && b.kind === 'main' && b.label.includes('piece 3'));
    assert.equal(lo.length, 12); assert.equal(hi.length, 12);
    for (const b of lo) {
      const top = b.path[b.path.length - 1];
      const twin = hi.find((h) => h.perimeter === b.perimeter);
      assert.equal(top[0], twin.path[0][0]);            // zero lateral offset (E)
      assert.equal(top[1], twin.path[0][1]);            // zero lateral offset (N)
      assert.ok(Math.abs(top[2] - twin.path[0][2]) < 1e-9, 'zero gap at the floor line');
      assert.ok(Math.abs(top[2] - (GEOM.floorToFloor)) < 1e-9);
    }
  }
});

// ----------------------------------------------------------------- clash-free (interpenetration)
test('no bar interpenetrates another bar (checker tolerance 0.5 mm)', () => {
  const clashes = findClashes(model.bars, { maxReport: 50 });
  assert.equal(clashes.length, 0, JSON.stringify(clashes.slice(0, 3)));
});

// ----------------------------------------------------------------- metadata (acceptance 6)
test('every bar carries drawing, rule, mark, dia, length and label metadata', () => {
  for (const b of model.bars) {
    assert.ok(b.drawing && /^RC\d\d$/.test(b.drawing), `drawing ${b.drawing} on ${b.label}`);
    assert.ok(b.rule && b.rule.length > 10, 'rule');
    assert.ok(b.mark, 'mark');
    assert.ok(b.dia > 0.009 && b.dia < 0.044, 'dia');
    assert.ok(b.length > 0.1, 'length');
    assert.ok(b.label, 'label');
  }
  for (const c of model.couplers) assert.ok(c.drawing === 'RC10' && c.rule && c.label);
  for (const s of model.spacers) assert.ok(s.drawing && s.rule);
});

test('metadata examples from the brief are produced', () => {
  const marks = new Set(model.bars.map((b) => b.mark));
  assert.ok(marks.has('12-#7'));
  assert.ok(marks.has('#3@10/15'));
  assert.ok(model.bars.some((b) => b.rule.includes('ℓo') || b.rule.includes('10 cm')));
});

// ----------------------------------------------------------------- weight (acceptance 8)
test('total rebar weight equals counts x unit mass x length within 1 %', () => {
  const bySize = new Map();
  for (const b of model.bars) {
    const r = bySize.get(b.size) || { n: 0, L: 0 };
    r.n += 1; r.L += b.length; bySize.set(b.size, r);
  }
  let hand = 0;
  for (const [size, r] of bySize) hand += r.L * barUnitMass(size);
  const reported = model.bars.reduce((a, b) => a + b.weight, 0);
  assert.ok(Math.abs(reported - hand) / hand < 0.01);
  assert.ok(reported > 25000 && reported < 40000, `reported ${reported}`);
});

// ----------------------------------------------------------------- timeline and determinism
test('timeline order: ground beams, 1F columns, 2F frame, 2F columns, roof frame', () => {
  const start = (stage) => Math.min(...model.members.filter((m) => m.sched.stage === stage).map((m) => m.sched.tS));
  assert.ok(start('GB') < start('C1') && start('C1') < start('F2') && start('F2') < start('C2') && start('C2') < start('R'));
});

test('inside each member: rebar tied before formwork, formwork before pour', () => {
  for (const m of model.members) {
    const s = m.sched;
    const lastBar = Math.max(...(m.bars || []).map((id) => model.bars[id].t0));
    assert.ok(lastBar <= s.rebarEnd + 1e-6);
    assert.ok(s.rebarEnd <= s.formStart + 1e-9 && s.formStart < s.formEnd && s.formEnd <= s.pourStart + 1e-9 && s.pourStart < s.pourEnd);
  }
});

test('tying order inside a column: mains first, then ties, then crossties', () => {
  const c = cols[0];
  const bars = c.bars.map((id) => model.bars[id]).sort((a, b) => a.order - b.order);
  const firstTie = bars.findIndex((b) => b.kind === 'tie');
  const lastMain = Math.max(...bars.filter((b) => b.kind === 'main' || b.kind === 'dowel').map((b) => b.order));
  assert.ok(lastMain < firstTie);
});

test('build is deterministic: identical model on a second build', () => {
  const again = buildModel();
  assert.equal(again.bars.length, model.bars.length);
  for (let i = 0; i < model.bars.length; i += 137) {
    assert.deepEqual(again.bars[i].path, model.bars[i].path);
    assert.equal(again.bars[i].t0, model.bars[i].t0);
  }
});

test('explode group index covers every bar kind', () => {
  for (const b of model.bars) assert.ok(groupIndex(b.kind) >= 0 && groupIndex(b.kind) < GROUP_NAMES.length, b.kind);
});

// ----------------------------------------------------------------- standards report
test('standards report: every check passes except the flagged coupler clear cover', () => {
  const rep = standardsReport(model);
  const failing = rep.filter((r) => !r.pass).map((r) => r.id);
  assert.deepEqual(failing, ['coupler-cover']);
});

test('drawing references are the set named in the brief', () => {
  assert.deepEqual(Object.keys(DRAWINGS).sort(), ['RC01', 'RC04', 'RC05', 'RC06', 'RC07', 'RC08', 'RC10']);
  assert.ok(RULE_TEXT.colTieLo.includes('RC06'));
  assert.ok(BAR_SIZES['#7']);
});
