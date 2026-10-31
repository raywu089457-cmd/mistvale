// Deterministic construction timeline. Every time is a pure function of the model; nothing reads the clock.
// Seconds at 1x playback. Stages run in the brief's order: ground beams -> 1F columns -> 2F beam/slab frame
// -> 2F columns -> roof beam/slab frame. Inside a member: rebar in tying order, then formwork, then pour.

export const STAGES = [
  { id: 'GB', label: 'Ground beams', start: 0, dur: 40 },
  { id: 'C1', label: '1F columns', start: 40, dur: 60 },
  { id: 'F2', label: '2F beam/slab frame', start: 100, dur: 80 },
  { id: 'C2', label: '2F columns', start: 180, dur: 60 },
  { id: 'R', label: 'Roof beam/slab frame', start: 240, dur: 80 },
];
export const TIMELINE_END = STAGES[STAGES.length - 1].start + STAGES[STAGES.length - 1].dur;

// Fraction of a member's window used by each phase.
const PH = { rebarEnd: 0.50, spacerStart: 0.40, formStart: 0.50, formEnd: 0.70, pourStart: 0.70, pourEnd: 1.00 };
const STAGGER = 0.55;   // members in a stage start across the first 55% of the stage window

// Tying order rank: main bars, bottom then top, stirrups/ties, crossties, slab mats, couplers and spacers last.
const RANK = {
  dowel: 0, main: 0,
  gbBot: 1, beamBot: 1,
  gbTop: 2, beamTop: 2,
  slabB1: 3, slabB2: 4, slabT1: 5, slabT2: 6, slabCorner: 7,
  gbStir: 8, stirrup: 8, tie: 8,
  crosstie: 9,
  trimmer: 10,
};

export function stageOf(member) {
  if (member.kind === 'GB') return 'GB';
  if (member.kind === 'COL') return member.storey === 1 ? 'C1' : 'C2';
  if (member.lvl === 'F2') return 'F2';
  return 'R';
}

export function buildSchedule(model) {
  const { members, bars, couplers, spacers } = model;
  // group members per stage, sorted west->east then south->north
  const groups = Object.fromEntries(STAGES.map((s) => [s.id, []]));
  for (const m of members) groups[stageOf(m)].push(m);
  for (const k of Object.keys(groups)) groups[k].sort((a, b) => (a.i - b.i) || (a.j - b.j) || (a.id - b.id));

  for (const st of STAGES) {
    const list = groups[st.id];
    const n = list.length;
    list.forEach((m, q) => {
      const tS = st.start + (q / n) * st.dur * STAGGER;
      const D = st.dur * (1 - STAGGER);
      m.sched = {
        stage: st.id, tS, D,
        rebarEnd: tS + PH.rebarEnd * D,
        formStart: tS + PH.formStart * D, formEnd: tS + PH.formEnd * D,
        pourStart: tS + PH.pourStart * D, pourEnd: tS + PH.pourEnd * D,
      };
      // ---- bars in tying order
      const ids = (m.bars || []).map((id) => bars[id]);
      const ordered = ids.slice().sort((a, b) => {
        const ra = RANK[a.kind] ?? 9, rb = RANK[b.kind] ?? 9;
        return ra - rb || (a.priority ?? 0) - (b.priority ?? 0) || a.id - b.id;
      });
      const N = Math.max(1, ordered.length);
      ordered.forEach((b, k) => {
        b.t0 = r(m.sched.tS + (k / N) * PH.rebarEnd * D);
        b.order = k;
      });
      // ---- couplers: appear as the mains are tied (first 40% of the rebar phase)
      for (const cid of m.couplers || []) {
        const c = couplers[cid];
        c.t0 = r(m.sched.tS + (c.perimeter / 12) * PH.spacerStart * D);
      }
      // ---- spacers: placed at the end of the rebar phase, in order
      const sp = (m.spacers || []).map((id) => spacers[id]);
      sp.forEach((s, k) => {
        s.t0 = r(m.sched.tS + (PH.spacerStart + (k / Math.max(1, sp.length)) * (PH.rebarEnd - PH.spacerStart)) * D);
      });
    });
  }
  return { stages: STAGES, end: TIMELINE_END };
}

const r = (x) => Math.round(x * 1e4) / 1e4;

// Per-member state at time t: formwork erection and pour fractions (0..1), smooth-free (linear, deterministic).
export function memberProgress(m, t) {
  const s = m.sched;
  const f = clamp01((t - s.formStart) / (s.formEnd - s.formStart));
  const p = clamp01((t - s.pourStart) / (s.pourEnd - s.pourStart));
  return { form: f, pour: p };
}

export function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
