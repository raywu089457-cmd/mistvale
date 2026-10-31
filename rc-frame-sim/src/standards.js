// Single authority for every number the model uses.
// Nothing in src/model or src/render may hard-code a dimension, bar size, cover or rule;
// it must read it from here.
//
// Each parameter carries a `source`:
//   'brief'   - given in the project brief (drawing references RC01..RC10 as the brief states them)
//   'assumed' - not given in the brief; chosen here so the model is complete, and flagged in the inspector.
// No value is attributed to a clause number that is not in the brief.

// ---------------------------------------------------------------- materials
export const STEEL_DENSITY = 7850;   // kg/m3, assumed (typical deformed bar)
export const FC_MPA = 28;            // f'c, assumed
export const FY_MPA = 420;           // fy (SD420), assumed

// ---------------------------------------------------------------- rebar (CNS 560 nominal, brief)
// Diameters exactly as given in the brief. `metric` is the Taiwan D-designation the same bar
// is usually called by on site (nearest match, for reference only).
export const BAR_SIZES = {
  '#3':  { d: 0.00953, metric: 'D10' },
  '#4':  { d: 0.01270, metric: 'D13' },
  '#5':  { d: 0.01588, metric: 'D16' },
  '#6':  { d: 0.01905, metric: 'D19' },
  '#7':  { d: 0.02223, metric: 'D22' },
  '#8':  { d: 0.02540, metric: 'D25' },
  '#9':  { d: 0.02865, metric: 'D29' },
  '#10': { d: 0.03226, metric: 'D32' },
  '#11': { d: 0.03581, metric: 'D36' },
  '#14': { d: 0.04300, metric: 'D43' },
};

export function barDia(size) {
  const s = BAR_SIZES[size];
  if (!s) throw new Error(`unknown bar size ${size}`);
  return s.d;
}

// kg per metre of bar: pi/4 * d^2 * density
export function barUnitMass(size) {
  const d = barDia(size);
  return Math.PI / 4 * d * d * STEEL_DENSITY;
}

// Rib pitch (transverse rib spacing along the bar), brief: 1.5 cm.
export const RIB_PITCH = 0.015;

// ---------------------------------------------------------------- cover (RC01)
export const COVER = {
  column: { value: 0.040, source: 'brief', ref: 'RC01' },
  beam:   { value: 0.040, source: 'brief', ref: 'RC01' },
  slab:   { value: 0.020, source: 'brief', ref: 'RC01' },
  groundBeamEarth: { value: 0.075, source: 'assumed', ref: 'RC01', note: 'cast against earth' },
};

// ---------------------------------------------------------------- geometry
export const GEOM = {
  bayX: [6.0, 6.0, 6.0, 6.0],          // brief: 4 bays, 6.0 m
  bayY: [5.0, 5.0, 5.0],               // brief: 3 bays, 5.0 m
  floorToFloor: 3.60,                  // brief
  Hn: 3.00,                            // brief: clear column height
  col: 0.60,                           // brief: columns 60x60
  beamB: 0.40, beamH: 0.70,            // brief: beams 40x70
  beamUpstand: 0.10,                   // assumed: beam top 10 cm above slab top, so 3.60 FF with 3.00 clear and 0.70 beam holds
  slabT: 0.15,                         // brief
  gbB: 0.60, gbH: 0.70,                // assumed: ground beam 60x70 (width = column width)
  dowelEmbed: 0.60,                    // assumed: column dowel embedment into ground beam
  trenchHalfWidth: 0.60,               // assumed: trench 1.2 m wide around every ground-beam line
  trenchDepth: 0.70,                   // assumed: trench floor = ground-beam bottom
  penetrationD: 0.10,                  // assumed: one 100 mm sleeve through a beam at mid-span (RC05 demo)
  spacerSize: [0.05, 0.04, 0.05],      // brief: 5 x 4 x 5 cm (length, height, width)
  spacerInterval: 0.70,                // brief: 60-80 cm; 0.70 chosen
  slabSpacerHeight: 0.02,              // = slab cover (a 4 cm block would breach the 2 cm cover)
  storeyLevels: [0, 3.6, 7.2],         // derived from brief
};

// Derived clear heights and levels used everywhere.
export const LEVELS = {
  GB: 0.0,                             // top of ground beams = 1F floor
  F2: GEOM.floorToFloor,               // 2F floor (3.60)
  R: 2 * GEOM.floorToFloor,            // roof floor (7.20)
};

// ---------------------------------------------------------------- hooks
// Brief: hook extension = max(6*db, 7.5 cm)
export function hookExt(db) {
  return Math.max(6 * db, 0.075);
}

// ---------------------------------------------------------------- column (RC06)
export const COLUMN = {
  mainSize: '#7',                      // 12-#7 (brief example)
  mainCount: 12,
  tieSize: '#3',                       // #3@10/15 (brief example mark)
  crossTieSize: '#3',
  firstTie: 0.05,                      // brief: first tie 5 cm from floor line
  tieZoneS: 0.10,                      // brief: 10 cm inside confinement zone
  tieCentreS: 0.15,                    // brief: 15 cm in centre
  maxCentreSpacing: 0.35,              // brief: lateral support tie centre spacing <= 35 cm
  maxClearSpacing: 0.15,               // brief: clear spacing <= 15 cm
  lateralSupportHx: 0.20,              // brief: lateral support required where hx > 20 cm
};

// confinement zone length (brief formula), capped at H/2, measured at both column ends
export function columnConfinementLength(Hn, b, h, H) {
  return Math.min(Math.max(Hn / 6, Math.max(b, h), 0.45), H / 2);
}

// ---------------------------------------------------------------- beam (RC04)
export const BEAM = {
  topSize: '#7',
  topCount: 3,                         // brief: >= 2 top bars continuous and anchored 90 deg
  topMin: 2,
  botSize: '#7',
  botCount: 3,
  stirrupSize: '#4',
  firstStirrup: 0.05,                  // brief: from column face
  zoneFactor: 2.0,                     // brief: end zone 2h
  S1Max: 0.15,                         // brief: never > 15 cm
  webThresholdD: 0.90,                 // brief: web bars when d > 90 cm
  webMin: { count: 2, size: '#4' },    // brief: >= 2-#4
};

export function beamS1(h, dbLong, ds) {
  return Math.min(h / 4, 8 * dbLong, 24 * ds, 0.30, BEAM.S1Max);
}
export function beamS2(h) {
  return Math.min(h / 2, 0.30);
}
// d = h - cover - db/2 (brief)
export function beamEffectiveDepth(h, cover, db) {
  return h - cover - db / 2;
}

// ---------------------------------------------------------------- slab (RC07 / RC08)
export const SLAB = {
  botSize: '#4',
  botSpacing: 0.20,                    // assumed: #4@200 both directions, two layers
  topSize: '#4',
  topSpacing: 0.20,                    // assumed
  topExtFactor: 0.25,                  // brief: top mat extends 0.25 L past support
  bearing: 0.15,                       // brief: minimum bearing 15 cm
  cornerSize: '#3',
  cornerLen: 1.2,                      // assumed corner L-bar leg length
};

// Development / anchorage length. Brief asks for Ld without a formula; simplified rule kept here.
export function developmentLength(db) {
  return Math.max(0.30, 40 * db);      // assumed simplified rule; verify against the adopted code
}

// ---------------------------------------------------------------- penetrations (RC05)
export function penetrationReinforcement(D, h) {
  if (D <= h / 10) return { none: true, rule: 'D <= h/10: no reinforcement' };
  if (D <= 0.10) return { mark: '2-D10', size: '#3', rule: 'D <= 10 cm: 2-D10' };
  if (D <= 0.20) return { mark: '2-D13', size: '#4', rule: 'D <= 20 cm: 2-D13' };
  if (D <= h / 3) return { mark: '2-D16', size: '#5', rule: 'D <= h/3: 2-D16' };
  return { error: true, rule: 'D > h/3: not permitted by this table' };
}
export const PENETRATION_MIN_FROM_COLUMN = 1.0; // x h (brief: no penetration within 1h of column face)

// ---------------------------------------------------------------- couplers (RC10)
export const COUPLER = {
  lengthFactor: 3.5,                   // sleeve length = 3.5 db
  odFactor: 1.8,                       // outer diameter = 1.8 db
  minCentreFactor: 3.0,                // centre spacing >= 3 db
  stagger: 0.60,                       // splice stagger >= 60 cm
  clearCoverFactor: 2.0,               // clear cover >= 2 db
  grades: {
    SA: { color: 0x3fb950, label: 'SA' },
    A:  { color: 0x58a6ff, label: 'A' },
    B:  { color: 0xd29922, label: 'B' },
  },
};

// ---------------------------------------------------------------- spacers
export const SPACER = {
  rule: 'brief: 5x4x5 cm concrete block every 60-80 cm under bottom bars',
  ref: 'RC01',
};

// ---------------------------------------------------------------- drawing references
// Rule text is the governing statement shown in the inspector. Keep it terse and traceable.
export const DRAWINGS = {
  RC01: { title: 'Cover and spacers', ref: 'RC01' },
  RC04: { title: 'Beam (and ground beam)', ref: 'RC04' },
  RC05: { title: 'Beam penetrations', ref: 'RC05' },
  RC06: { title: 'Column', ref: 'RC06' },
  RC07: { title: 'Slab corner and opening', ref: 'RC07' },
  RC08: { title: 'Slab mat', ref: 'RC08' },
  RC10: { title: 'Mechanical coupler', ref: 'RC10' },
};

// Fixed rule texts (formula-bearing ones are built in model/rules.js from the functions above).
export const RULE_TEXT = {
  colMain: 'Column: 12 main bars, continuous through the floor line; splices by coupler at mid-gap between centre ties, stagger >= 60 cm (RC06, RC10)',
  colTieLo: 'Column tie: 10 cm inside confinement zone (RC06)',
  colTieC:  'Column tie: 15 cm in centre (RC06)',
  colTieFirst: 'First tie 5 cm from floor line (RC06)',
  colCross: 'Crosstie at every tie, hooked to interior bars, 135 and 90 deg alternating (RC06)',
  colStarter: 'Starter bar: dowel embedded into ground beam, lap via coupler above (RC06)',
  beamTop: 'Beam top bars continuous to support, anchored 90 deg into column (RC04)',
  beamBot: 'Beam bottom bars anchored into column with 90 deg hooks (RC04)',
  beamStir: 'Closed stirrup, one 135 and one 90 hook, alternating; perimeter beams: 135 hooks face outward (RC04)',
  beamFirst: 'First stirrup 5 cm from column face (RC04)',
  beamZone: 'End zone 2h: S1 <= 15 cm; centre: S2 = min(h/2, 30 cm) (RC04)',
  webNone: 'Web bars not required: effective depth d <= 90 cm (RC04)',
  joint: 'Joint hoop at 10 cm within beam depth (RC06); beam bars pass the column cage between column bars (RC04)',
  slabBot: 'Slab bottom mat both directions, cover 2 cm, Ld anchorage, bearing >= 15 cm (RC08)',
  slabTop: 'Slab top mat over supports, extends 0.25 L into span, bearing >= 15 cm (RC08)',
  slabCorner: 'Corner reinforcement at slab-column corners (RC07)',
  penetration: 'Beam penetration: D = 100 mm, reinforcement 2-D10 (RC05)',
  coupler: 'Mechanical coupler: sleeve 3.5 db, OD 1.8 db, grade SA/A/B (RC10)',
  spacer: 'Spacer block 5x4x5 cm, 60-80 cm spacing under bottom bars (RC01)',
  gbMain: 'Ground beam main bars (RC04 rules), earth cover 7.5 cm (assumed)',
  gbStir: 'Ground beam stirrup, beam rules (RC04)',
};

export const TRENCH = { halfWidth: GEOM.trenchHalfWidth, depth: GEOM.trenchDepth };
