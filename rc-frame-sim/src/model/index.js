// Assemble the complete model: members, rebar, couplers, spacers, timeline, quantities.
import { buildMembers, BAND_NAMES } from './members.js';
import { buildRebar } from './rebar.js';
import { buildSchedule } from './schedule.js';
import { barUnitMass, BAR_SIZES, GEOM } from '../standards.js';

export function buildModel() {
  const members = buildMembers();
  const ctx = buildRebar(members);
  const model = {
    members,
    bars: ctx.bars,
    couplers: ctx.couplers,
    spacers: ctx.spacers,
    penetrations: ctx.penetrations,
    ringZs: ctx.ringZs,
    bandNames: BAND_NAMES,
  };
  buildSchedule(model);
  model.totals = totals(model);
  return model;
}

// Quantity schedule: per bar size, count, total length, mass. Also per mark.
export function totals(model) {
  const bySize = {};
  let kg = 0, count = 0, length = 0;
  for (const b of model.bars) {
    const row = (bySize[b.size] ||= { size: b.size, dia: BAR_SIZES[b.size].d, count: 0, length: 0, kg: 0, unitMass: barUnitMass(b.size) });
    row.count += 1;
    row.length += b.length;
    row.kg += b.weight;
    kg += b.weight; count += 1; length += b.length;
  }
  const byKind = {};
  for (const b of model.bars) {
    const r = (byKind[b.kind] ||= { kind: b.kind, count: 0, kg: 0 });
    r.count += 1; r.kg += b.weight;
  }
  const concreteM3 = model.members.reduce((a, m) => {
    const { min, max } = m.box;
    return a + (max[0] - min[0]) * (max[1] - min[1]) * (max[2] - min[2]);
  }, 0);
  return {
    bars: count, rebarKg: kg, rebarLength: length, bySize: Object.values(bySize).sort((a, b) => a.dia - b.dia),
    byKind: Object.values(byKind), couplers: model.couplers.length, spacers: model.spacers.length,
    members: model.members.length, concreteGrossM3: concreteM3, kgPerM3: kg / concreteM3,
    timelineEnd: model.schedule?.end,
  };
}

export { GEOM };
