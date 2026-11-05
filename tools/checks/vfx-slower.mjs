// vfx-slower.mjs — T65: every pixelfx sprite-sheet effect (everything drawn through
// drawVfxSheet in src/pixel-world.js) must play at 0.6x while the hit frame stays put.
//
// Headless: stubs the small slice of DOM/Canvas the world renderer needs, imports the real
// src/pixel-world.js, and records every drawImage that comes from assets/vfx-sheets/*. The
// recorded source cell is turned into a sheet frame index, so the checker measures the real
// runtime animation instead of trusting the source text.
//
// For each sheet effect it computes:
//   * anchor — the sheet frame at the hit moment must equal the old frame within 1 frame;
//   * rate   — 0.5 s of sheet advance must be 0.6x the old advance within 1 frame;
//   * end    — the age at which the effect fades to 0 / is removed must be at least the
//              stretched old cut-off (or the slowed sheet duration for effects that run out);
//   * lifetime — src/pixel-game.js must keep the effect alive to that age (createGame().tick()).
// Exit: 0 = all hold, 1 = FIX lines printed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPEED = 0.6;            // the one constant the game must use (card Goal)
const EPS = 0.02;

// ── tiny helpers ──────────────────────────────────────────────────────────
const pngSize = file => {
  try {
    const b = fs.readFileSync(file);
    if (b.length < 24) return [512, 512];
    return [b.readUInt32BE(16), b.readUInt32BE(20)];
  } catch { return [512, 512]; }
};
const resolveAsset = src => path.isAbsolute(src) ? src : path.join(ROOT, src);
const readJSON = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

// ── vfx sheet metadata ────────────────────────────────────────────────────
const VFX_DIR = path.join(ROOT, 'assets/vfx-sheets');
const sheets = {};
for (const file of fs.readdirSync(VFX_DIR).filter(f => f.endsWith('.json'))) {
  const id = file.replace(/\.json$/, '');
  const px = readJSON(`assets/vfx-sheets/${file}`).meta.pixelfx;
  sheets[id] = {
    id, meta: px, frames: px.frames, fps: px.fps, loop: !!px.loop,
    cw: px.frameSize[0], ch: px.frameSize[1], cols: px.columns,
    dur: px.frames / px.fps,
  };
}
const sheetIds = Object.keys(sheets).sort();

// ── record state ──────────────────────────────────────────────────────────
let records = [];
let recOn = false;
const sheetFromSrc = src => {
  const m = String(src || '').match(/vfx-sheets[\\/]([^\\/]+)\.png$/);
  return m ? m[1] : null;
};
function record (img, sx, sy, alpha) {
  if (!recOn || !img) return;
  const id = sheetFromSrc(img.src);
  if (!id || !sheets[id]) return;
  records.push({ id, sx: +sx, sy: +sy, alpha });
}
function frameOf (rec) {
  const s = sheets[rec.id];
  const col = Math.round(rec.sx / s.cw), row = Math.round(rec.sy / s.ch);
  return row * s.cols + col;
}

// ── DOMMatrix / Path2D ────────────────────────────────────────────────────
class FakeDOMMatrix {
  constructor (init) {
    let [a, b, c, d, e, f] = [1, 0, 0, 1, 0, 0];
    if (Array.isArray(init) || (init && typeof init === 'object' && !Array.isArray(init))) {
      if (Array.isArray(init)) [a, b, c, d, e, f] = init;
      else if (typeof init.a === 'number') ({ a, b, c, d, e, f } = init);
    }
    Object.assign(this, { a, b, c, d, e, f });
  }
}
globalThis.DOMMatrix = FakeDOMMatrix;

class FakePath2D {
  constructor () { this.parts = []; }
  moveTo () {} lineTo () {} closePath () {} rect () {} ellipse () {} arc () {} addPath () {} bezierCurveTo () {} quadraticCurveTo () {}
}
globalThis.Path2D = FakePath2D;

// ── Image ─────────────────────────────────────────────────────────────────
class FakeImage {
  constructor () {
    this._src = '';
    this.complete = false;
    this.naturalWidth = 0;
    this.naturalHeight = 0;
    this.width = 0;
    this.height = 0;
    this.onload = null;
    this.onerror = null;
    this._listeners = { load: [], error: [] };
  }
  addEventListener (type, fn) { (this._listeners[type] ||= []).push(fn); }
  removeEventListener (type, fn) { const a = this._listeners[type] || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
  get src () { return this._src; }
  set src (v) {
    this._src = String(v);
    const [w, h] = pngSize(resolveAsset(this._src));
    this.naturalWidth = this.width = w;
    this.naturalHeight = this.height = h;
    this.complete = true;
    const ev = { type: 'load', target: this };
    for (const fn of this._listeners.load || []) { try { fn(ev); } catch (e) { console.error(e); } }
    if (typeof this.onload === 'function') { try { this.onload(ev); } catch (e) { console.error(e); } }
  }
}
globalThis.Image = FakeImage;

// ── 2D context (records sheet draws) ──────────────────────────────────────
function makeCtx2D (canvas) {
  let s = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, alpha: 1, fill: '#000', stroke: '#000', lw: 1, op: 'source-over' };
  const stack = [];
  const base = {
    canvas,
    get globalAlpha () { return s.alpha; }, set globalAlpha (v) { if (Number.isFinite(+v)) s.alpha = Math.max(0, Math.min(1, +v)); },
    get globalCompositeOperation () { return s.op; }, set globalCompositeOperation (v) { s.op = String(v); },
    get fillStyle () { return s.fill; }, set fillStyle (v) { s.fill = v; },
    get strokeStyle () { return s.stroke; }, set strokeStyle (v) { s.stroke = v; },
    get lineWidth () { return s.lw; }, set lineWidth (v) { s.lw = +v; },
    imageSmoothingEnabled: true, imageSmoothingQuality: 'low', font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic',
    lineCap: 'butt', lineJoin: 'miter', miterLimit: 10, filter: 'none', lineDashOffset: 0, shadowColor: '#000', shadowBlur: 0,
    save () { stack.push({ ...s }); },
    restore () { if (stack.length) s = stack.pop(); },
    setTransform (a, b, c, d, e, f) {
      if (a && typeof a === 'object') ({ a, b, c, d, e, f } = a);
      else if (a === undefined) { a = d = 1; b = c = e = f = 0; }
      if ([a, b, c, d, e, f].every(Number.isFinite)) Object.assign(s, { a, b, c, d, e, f });
    },
    resetTransform () { Object.assign(s, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }); },
    getTransform () { return new FakeDOMMatrix([s.a, s.b, s.c, s.d, s.e, s.f]); },
    translate (x, y) { if (Number.isFinite(x) && Number.isFinite(y)) { s.e += s.a * x + s.c * y; s.f += s.b * x + s.d * y; } },
    scale (x, y) { if (Number.isFinite(x) && Number.isFinite(y)) { s.a *= x; s.b *= x; s.c *= y; s.d *= y; } },
    rotate (r) {
      if (!Number.isFinite(r)) return;
      const co = Math.cos(r), si = Math.sin(r), { a, b, c, d } = s;
      s.a = a * co + c * si; s.b = b * co + d * si; s.c = c * co - a * si; s.d = d * co - b * si;
    },
    transform (A, B, C, D, E, F) {
      if (![A, B, C, D, E, F].every(Number.isFinite)) return;
      const { a, b, c, d, e, f } = s;
      s.a = a * A + c * B; s.b = b * A + d * B; s.c = a * C + c * D; s.d = b * C + d * D;
      s.e = a * E + c * F + e; s.f = b * E + d * F + f;
    },
    drawImage (img, sx, sy) { record(img, sx, sy, s.alpha); },
    fillRect () {}, clearRect () {}, strokeRect () {},
    beginPath () {}, closePath () {}, moveTo () {}, lineTo () {}, rect () {}, ellipse () {}, arc () {}, fill () {}, stroke () {},
    clip () {}, setLineDash () {}, getLineDash () { return []; },
    createPattern () { return { setTransform () {} }; },
    createImageData (w, h) { return { data: new Uint8ClampedArray(Math.max(0, (w | 0) * (h | 0) * 4)), width: w, height: h }; },
    getImageData (x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(0, (w | 0) * (h | 0) * 4)), width: w, height: h }; },
    putImageData () {},
    measureText (t) { return { width: String(t ?? '').length * 6 }; },
    fillText () {}, strokeText () {},
    createLinearGradient () { return { addColorStop () {} }; },
    createRadialGradient () { return { addColorStop () {} }; },
    roundRect () {},
  };
  return new Proxy(base, {
    get (t, p) { if (p in t) return t[p]; return () => {}; },
    set (t, p, v) { t[p] = v; return true; },
  });
}

// ── fake canvas / document / window globals ───────────────────────────────
function makeCanvas (w = 0, h = 0) {
  const c = {
    width: w, height: h, style: {}, dataset: {},
    parentNode: null,
    setAttribute () {}, removeAttribute () {}, addEventListener () {}, removeEventListener () {}, remove () {},
    getBoundingClientRect () { return { left: 0, top: 0, width: 1280, height: 720, right: 1280, bottom: 720 }; },
  };
  let ctx2d = null;
  c.getContext = () => (ctx2d ||= makeCtx2D(c));
  c.toDataURL = () => 'data:image/png;base64,';
  return c;
}
const body = {
  dataset: {}, style: {}, children: [],
  appendChild (el) { el.parentNode = body; body.children.push(el); return el; },
  insertBefore (el) { el.parentNode = body; body.children.push(el); return el; },
  removeChild () {}, addEventListener () {}, removeEventListener () {},
  classList: { contains: () => false, add () {}, remove () {}, toggle () {} },
};
const documentStub = {
  body,
  documentElement: { style: { setProperty () {} }, classList: { toggle () {}, contains: () => false } },
  createElement (tag) {
    if (String(tag).toLowerCase() === 'canvas') { const c = makeCanvas(); c.parentNode = body; return c; }
    return { style: {}, dataset: {}, appendChild () {}, setAttribute () {}, addEventListener () {}, classList: { add () {}, remove () {} } };
  },
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  addEventListener () {}, removeEventListener () {},
};
globalThis.document = documentStub;
globalThis.CustomEvent = class { constructor (type) { this.type = type; } };
globalThis.dispatchEvent = () => true;
globalThis.matchMedia = () => ({ matches: false, addEventListener () {}, removeEventListener () {} });
globalThis.location = { search: '?renderer=2d' };
globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;
globalThis.devicePixelRatio = 1;
globalThis.screen = { width: 1280, height: 720 };

// ── assets ────────────────────────────────────────────────────────────────
globalThis.PIXEL_ASSETS = {
  vfxSheets: Object.fromEntries(sheetIds.map(id => [id, { img: `assets/vfx-sheets/${id}.png`, meta: { meta: { pixelfx: sheets[id].meta } } }])),
  heroSheets: { sorcerer: { img: 'assets/heroes/sorcerer.png', meta: readJSON('assets/heroes/sorcerer.json') } },
  monsterSheets: {},
  ui: {},
};

const { createWorld } = await import(pathToFileURL(path.join(ROOT, 'src/pixel-world.js')).href);
const { createGame } = await import(pathToFileURL(path.join(ROOT, 'src/pixel-game.js')).href);

// ── world + shared state ──────────────────────────────────────────────────
const canvas = documentStub.createElement('canvas');
canvas.width = 1280; canvas.height = 720;
const world = createWorld(canvas);
world.lookAt(30, 30, 1.15);

const state = { time: 10, buildings: {}, layout: {}, hunters: [], enemies: [], wanderers: [], effects: [], shots: [], pilot: null };
function reset () {
  state.effects.length = 0;
  state.shots.length = 0;
  state.hunters.length = 0;
  state.enemies.length = 0;
  state.time = 10;
}
function render () {
  records = [];
  recOn = true;
  try { world.update(1 / 60, state); } finally { recOn = false; }
  return records;
}
function lastDraw (id) {
  for (let i = records.length - 1; i >= 0; i--) if (records[i].id === id) return records[i];
  return null;
}

// Warm up the ground/atlas once so each probe only pays for the effect.
render();

// ── probes ────────────────────────────────────────────────────────────────
const results = [];
let failures = 0;
function fix (caseName, rule, detail) {
  failures++;
  console.log(`FIX ${caseName} ${rule}${detail ? ` — ${detail}` : ''}`);
}

function sample (caseName, setup, id, a, report = true) {
  reset();
  setup(a);
  render();
  const rec = lastDraw(id);
  if (!rec) {
    if (report) fix(caseName, 'coverage', `sheet ${id} was not drawn at age ${a}`);
    return null;
  }
  return { frame: frameOf(rec), alpha: rec.alpha };
}

function cyclicDelta (a, b, frames) {
  let d = b - a;
  if (frames) d = ((d % frames) + frames) % frames;
  return d;
}

// rate: 0.5 s of real time must advance the sheet by 0.6 x the old amount
function checkRate (caseName, setup, id, a1, a2, rate = 1) {
  const s = sheets[id];
  const f1 = sample(caseName, setup, id, a1), f2 = sample(caseName, setup, id, a2);
  if (!f1 || !f2) return;
  const delta = cyclicDelta(f1.frame, f2.frame, s.loop ? s.frames : 0);
  const expected = SPEED * (a2 - a1) * s.fps * rate;
  if (Math.abs(delta - expected) > 1) {
    fix(caseName, 'rate', `advance ${delta} frames over ${(a2 - a1).toFixed(2)}s, want ${expected.toFixed(2)} (0.6x of ${((a2 - a1) * s.fps * rate).toFixed(2)})`);
  }
  return { delta, expected };
}

// anchor: the sheet cell at the hit moment must still be the old cell (within 1 frame)
function checkAnchor (caseName, setup, id, a, oldSheetTime) {
  const s = sheets[id];
  const f = sample(caseName, setup, id, a);
  if (!f) return;
  const expected = Math.floor(oldSheetTime * s.fps);
  if (Math.abs(f.frame - expected) > 1) {
    fix(caseName, 'anchor', `hit frame ${f.frame}, want ${expected} (old sheet time ${oldSheetTime}s)`);
  }
}

// visible(age): the sheet is still drawn with a non-zero alpha
function visible (setup, id, a) {
  const f = sample('visibility', setup, id, a, false);
  return !!f && f.alpha > 0.02;
}
function checkFadeEnd (caseName, setup, id, target) {
  if (visible(setup, id, target - 0.1)) {
    if (visible(setup, id, target + 0.1)) fix(caseName, 'fade', `still visible at ${(target + 0.1).toFixed(2)}s, want fade at ${target.toFixed(2)}s`);
  } else {
    fix(caseName, 'fade', `already invisible at ${(target - 0.1).toFixed(2)}s, want ${target.toFixed(2)}s`);
  }
}

// removal: run the real game loop and watch the lifetime filter in src/pixel-game.js
function removalAge (cfg) {
  const g = createGame(null);
  g.state.hunters = []; g.state.wanderers = []; g.state.enemies = [];
  const id = 't65probe';
  g.state.effects.push({ id, type: cfg.type, x: 30, z: 30, age: 0, ...(cfg.extra || {}) });
  let age = 0;
  for (let i = 0; i < 250; i++) {
    g.tick(0.1); age += 0.1;
    if (!g.state.effects.some(e => e.id === id)) return +age.toFixed(2);
  }
  return Infinity;
}
function checkRemoval (caseName, cfg, target) {
  const got = removalAge(cfg);
  if (!(got >= target - EPS)) fix(caseName, 'lifetime', `removed at ${got}s, want >= ${target.toFixed(2)}s`);
  return got;
}

// ── effect cases ──────────────────────────────────────────────────────────
const CASES = [];

function addCase (name, id, opts) {
  const { setup, anchorAt = 0, anchorOld = 0, rate = [0, 0.5], rateMul = 1, fadeTarget = null, removalTarget = null, removalCfg = null, skipRate = false, skipAnchor = false, skipFade = false, skipRemoval = false } = opts;
  CASES.push({ name, id, setup, anchorAt, anchorOld, rate, rateMul, fadeTarget, removalTarget, removalCfg, skipRate, skipAnchor, skipFade, skipRemoval });
}

const holySetup = a => { state.effects.push({ id: 'e', type: 'holy', x: 30, z: 30, sourceX: 26, sourceZ: 30, age: 0.16 + a, delay: 0.16 }); };
addCase('holy-hit', 'holy-hit', {
  setup: holySetup, anchorOld: 0.54,
  fadeTarget: 0.76 / SPEED, removalTarget: Math.max(0.76 / SPEED, sheets['holy-hit'].dur / SPEED),
  removalCfg: { type: 'holy' },
});

const melee = (cls, sheet, t0) => {
  const setup = a => { state.effects.push({ id: 'e', type: 'slash', cls, x: 30, z: 30, sourceX: 26, sourceZ: 30, age: 0.12 + a, delay: 0.12 }); };
  const cut = { darkknight: [0.5, 0.25], assassin: [0.45, 0.15], paladin: [0.6, 0.35] }[cls];
  const end = cut[0] + cut[1];
  addCase(sheet, sheet, {
    setup, anchorOld: t0, fadeTarget: end / SPEED, removalTarget: end / SPEED,
    removalCfg: { type: 'slash', extra: { cls } },
  });
};
melee('darkknight', 'dark-cleave', 0.36);
melee('assassin', 'double-slash', 0.2);
melee('paladin', 'parry', 0.0);

const berserkSetup = a => { state.effects.push({ id: 'e', type: 'slash', cls: 'berserker', x: 30, z: 30, sourceX: 26, sourceZ: 30, age: 0.12 + a, delay: 0.12 }); };
addCase('berserk-hit', 'berserk-hit', {
  setup: berserkSetup, anchorOld: 0,
  fadeTarget: 1.05 / SPEED, removalTarget: 1.05 / SPEED,
  removalCfg: { type: 'slash', extra: { cls: 'berserker' } },
});

const FIRE_DELAY = 0.55;
const blastSetup = a => { state.effects.push({ id: 'e', type: 'spell', x: 30, z: 30, sourceX: 20, sourceZ: 30, age: FIRE_DELAY + a, delay: FIRE_DELAY }); };
addCase('fireball-blast', 'fireball-blast', {
  setup: blastSetup, anchorOld: 0,
  fadeTarget: 1.15 / SPEED, removalTarget: 1.15 / SPEED,
  removalCfg: { type: 'spell' },
});

const ARROW_DELAY = 0.55;
const sparkSetup = a => { state.effects.push({ id: 'e', type: 'arrow', x: 30, z: 30, sourceX: 20, sourceZ: 30, age: ARROW_DELAY + a, delay: ARROW_DELAY }); };
addCase('hit-spark', 'hit-spark', {
  setup: sparkSetup, anchorOld: 0, skipFade: true,
  removalTarget: sheets['hit-spark'].dur / SPEED, removalCfg: { type: 'arrow' },
});
const critSetup = a => { state.effects.push({ id: 'e', type: 'arrow', crit: true, x: 30, z: 30, sourceX: 20, sourceZ: 30, age: ARROW_DELAY + a, delay: ARROW_DELAY }); };
addCase('crit-hit', 'crit-hit', {
  setup: critSetup, anchorOld: 0, skipFade: true,
  removalTarget: sheets['crit-hit'].dur / SPEED, removalCfg: { type: 'arrow' },
});

const HEAL_DELAY = 0.4;
const healSetup = a => { state.effects.push({ id: 'e', type: 'skillfx', cls: 'priest', fx: 'holy', x: 30, z: 30, age: HEAL_DELAY + a, delay: HEAL_DELAY }); };
addCase('priest-heal', 'priest-heal', {
  setup: healSetup, anchorOld: 0.17,
  fadeTarget: (1.4 - 0.17) / SPEED, removalTarget: (1.4 - 0.17) / SPEED,
  removalCfg: { type: 'skillfx', extra: { fx: 'holy', cls: 'priest' } },
});

const cinderSetup = a => { state.effects.push({ id: 'e', type: 'skillfx', cls: 'sorcerer', fx: 'cinder', x: 30, z: 30, age: HEAL_DELAY + a, delay: HEAL_DELAY }); };
addCase('cinder-cyclone', 'cinder-cyclone', {
  setup: cinderSetup, anchorOld: 0, skipFade: true,
  removalTarget: 4.2 / SPEED, removalCfg: { type: 'skillfx', extra: { fx: 'cinder', cls: 'sorcerer' } },
});

// fireball in flight: the +0.22 phase must stay at 0.22 sheet-seconds (its start cell)
const fireballSetup = a => { state.effects.push({ id: 'e', type: 'spell', x: 30, z: 30, sourceX: 20, sourceZ: 30, age: a, delay: 1 }); };
addCase('fireball', 'fireball', {
  setup: fireballSetup, anchorOld: 0.22, rate: [0.1, 0.6], skipFade: true, skipRemoval: true,
});

// arrows in flight: only the looping animation slows; the flight code is untouched
const arrowSetup = a => { state.effects.push({ id: 'e', type: 'arrow', x: 30, z: 30, sourceX: 20, sourceZ: 30, age: a, delay: 1 }); };
addCase('arrow', 'arrow', {
  setup: arrowSetup, anchorOld: 0, anchorAt: 0, rate: [0.05, 0.55], skipFade: true, skipRemoval: true,
});

const galeSetup = a => {
  state.time = 10 + a;
  state.shots.push({ id: 'sh', kind: 'arrow', fx: 'gale', x: 30, z: 30, dx: 0.6, dz: 0.6, left: 5, range0: 10, span: 7, drop: 0, wait: 0 });
};
addCase('gale-arrow', 'gale-arrow', {
  setup: galeSetup, skipAnchor: true, rate: [0, 0.5], skipFade: true, skipRemoval: true,
});

const LEAF_DELAY = 0.32;
const leafSetup = a => { state.effects.push({ id: 'e', type: 'skillSelf', cls: 'archer', fx: 'gale', x: 30, z: 30, age: LEAF_DELAY + a, delay: LEAF_DELAY }); };
addCase('leaf-storm', 'leaf-storm', {
  setup: leafSetup, anchorOld: 0, rate: [0.5, 1.0],
  fadeTarget: 1.45 / SPEED, removalTarget: 1.45 / SPEED,
  removalCfg: { type: 'skillSelf', extra: { cls: 'archer', fx: 'gale' } },
});

// spell-charge: sorcerer wind-up, drawn at rate 2.4 by the hunter code
const attackRow = readJSON('assets/heroes/sorcerer.json').actions.attack;
const WINDUP_LEN = attackRow.windupFrameTime ? (attackRow.release ?? 1) * attackRow.windupFrameTime : 0.3;
const chargeSetup = a => {
  state.time = 10;
  state.enemies.push({ id: 'm1', type: 'boar', x: 31, z: 30, hp: 10, maxHp: 10 });
  state.hunters.push({
    id: 'h1', classId: 'sorcerer', name: 'S1', x: 30, z: 30, status: '戰鬥中', targetId: 'm1',
    attackTimer: WINDUP_LEN - a, atkAt: -99, hitAt: -99, hp: 10, maxHp: 10,
  });
};
addCase('spell-charge', 'spell-charge', {
  setup: chargeSetup, skipAnchor: true, rate: [0.02, WINDUP_LEN - 0.02], rateMul: 2.4, skipFade: true, skipRemoval: true,
});

// pilot / test-effect sheets: they go through the vfxsheet effect path
for (const id of ['root-snare', 'thorn-row', 'bird', 'haste', 'feather-burst', 'flare']) {
  const setup = a => { state.effects.push({ id: 'e', type: 'vfxsheet', sheet: id, x: 30, z: 30, age: a, dur: 100, k: 0.1 }); };
  addCase(`vfxsheet:${id}`, id, {
    setup, anchorOld: 0, rate: [0.1, 0.6], skipAnchor: true, rateMul: 1, skipFade: true, skipRemoval: true,
  });
}

// vfxsheet pilot/test effects above use dur:100 so their fade never interferes with the rate probe.
// This case exercises the real vfxsheet ending: dur-.35 fade on slowed sheet time plus the
// ((dur||2)+.3)/.6 lifetime in src/pixel-game.js.
const durSetup = a => { state.effects.push({ id: 'e', type: 'vfxsheet', sheet: 'flare', x: 30, z: 30, age: a, dur: 2, k: 0.1 }); };
addCase('vfxsheet:dur2', 'flare', {
  setup: durSetup, skipAnchor: true, skipRate: true,
  fadeTarget: 2 / SPEED, removalTarget: 2.3 / SPEED,
  removalCfg: { type: 'vfxsheet', extra: { dur: 2 } },
});

// ── per-sheet playback rate (the drawVfxSheet choke point) ────────────────
const rateOnly = [];
for (const id of sheetIds) {
  const setup = a => { state.effects.push({ id: 'e', type: 'vfxsheet', sheet: id, x: 30, z: 30, age: a, dur: 100, k: 0.1 }); };
  rateOnly.push({ id, setup });
}

// ── run ───────────────────────────────────────────────────────────────────
for (const c of CASES) {
  if (!c.skipAnchor) checkAnchor(c.name, c.setup, c.id, c.anchorAt, c.anchorOld);
  if (!c.skipRate) checkRate(c.name, c.setup, c.id, c.rate[0], c.rate[1], c.rateMul);
  if (!c.skipFade && c.fadeTarget != null) checkFadeEnd(c.name, c.setup, c.id, c.fadeTarget);
  if (!c.skipRemoval && c.removalTarget != null) checkRemoval(c.name, c.removalCfg || { type: c.id }, c.removalTarget);
}

for (const r of rateOnly) {
  const s = sheets[r.id];
  checkRate(`sheet:${r.id}`, r.setup, r.id, 0.1, 0.6, 1);
}

// cinder reports the frame it drew; that report has to follow the slowed sheet too
{
  reset();
  cinderSetup(1.0);
  render();
  const last = globalThis.__mistvaleCinder?.();
  const want = Math.floor(0.6 * 1.0 * sheets['cinder-cyclone'].fps);
  if (!last || !last.last) fix('cinder-cyclone', 'frame-report', 'cinder debug hook did not report a draw');
  else if (Math.abs(last.last.i - want) > 1) fix('cinder-cyclone', 'frame-report', `reported frame ${last.last.i}, want ${want}`);
}

if (failures) {
  console.log(`\n${failures} vfx-slower rule(s) failed`);
  process.exit(1);
}
console.log(`OK  ${sheetIds.length} sheets play at ${SPEED}x, ${CASES.length} effect cases keep their hit frame and ending`);
console.log('vfx-slower: PASS');
