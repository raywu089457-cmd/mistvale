// cinder-full-speed.mjs — T66: the sorcerer's 火龍捲 (cinder-cyclone) sheet is the one
// per-sheet exception to VFX_SPEED. It must keep its original 1.0x playback: frame 0 at
// the hit moment, 15 frames over 0.5 s (30 fps), the last frame (102) still fully visible
// at 3.4 s / 3.9 s, and removal at the original 4.2 s lifetime. Every other pixelfx sheet
// still has to stay at 0.6x, which tools/checks/vfx-slower.mjs covers.
//
// Headless: stubs the small slice of DOM/Canvas the world renderer needs, imports the real
// src/pixel-world.js + src/pixel-game.js, and records every drawImage from
// assets/vfx-sheets/* so the probe measures the real runtime animation.
// Exit: 0 = all cinder rules hold, 1 = FIX lines printed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPEED = 1.0;                 // T66: cinder-cyclone's original playback speed
const LIFETIME = 4.2;              // pre-dd3d616 effect lifetime in src/pixel-game.js
const DELAY = 0.4;                 // probe-only skill delay (drawCinder uses age0-delay)

// ── vfx sheet metadata ────────────────────────────────────────────────────
const readJSON = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const px = readJSON('assets/vfx-sheets/cinder-cyclone.json').meta.pixelfx;
const sheet = {
  id: 'cinder-cyclone', meta: px, frames: px.frames, fps: px.fps, loop: !!px.loop,
  cw: px.frameSize[0], ch: px.frameSize[1], cols: px.columns, dur: px.frames / px.fps,
};

// ── tiny helpers ──────────────────────────────────────────────────────────
const pngSize = file => {
  try {
    const b = fs.readFileSync(file);
    if (b.length < 24) return [512, 512];
    return [b.readUInt32BE(16), b.readUInt32BE(20)];
  } catch { return [512, 512]; }
};
const resolveAsset = src => path.isAbsolute(src) ? src : path.join(ROOT, src);

// ── record state ──────────────────────────────────────────────────────────
let records = [];
let recOn = false;
function record (img, sx, sy, alpha) {
  if (!recOn || !img) return;
  if (!/vfx-sheets[\\/]cinder-cyclone\.png$/.test(String(img.src || ''))) return;
  records.push({ sx: +sx, sy: +sy, alpha });
}
function frameOf (rec) {
  const col = Math.round(rec.sx / sheet.cw), row = Math.round(rec.sy / sheet.ch);
  return row * sheet.cols + col;
}

// ── DOMMatrix / Path2D ────────────────────────────────────────────────────
class FakeDOMMatrix {
  constructor (init) {
    let [a, b, c, d, e, f] = [1, 0, 0, 1, 0, 0];
    if (Array.isArray(init)) [a, b, c, d, e, f] = init;
    else if (init && typeof init.a === 'number') ({ a, b, c, d, e, f } = init);
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
  vfxSheets: { 'cinder-cyclone': { img: 'assets/vfx-sheets/cinder-cyclone.png', meta: { meta: { pixelfx: sheet.meta } } } },
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
}
const cinderSetup = a => { state.effects.push({ id: 'e', type: 'skillfx', cls: 'sorcerer', fx: 'cinder', x: 30, z: 30, age: DELAY + a, delay: DELAY }); };
function sample (a) {
  reset();
  cinderSetup(a);
  render();
  const rec = records[records.length - 1];
  return rec ? { frame: frameOf(rec), alpha: rec.alpha } : null;
}

// Warm up the ground/atlas once so each probe only pays for the effect.
reset();
render();

// ── probes ────────────────────────────────────────────────────────────────
let failures = 0;
function fix (rule, detail) {
  failures++;
  console.log(`FIX cinder-cyclone ${rule} — ${detail}`);
}

// 1.0x rate: 0.5 s must advance 15 frames (30 fps); today's 0.6x only advances 9.
{
  const a = sample(0.1), b = sample(0.6);
  if (!a || !b) fix('rate', 'cinder-cyclone was not drawn');
  else {
    const delta = b.frame - a.frame;
    const want = SPEED * 0.5 * sheet.fps;
    if (Math.abs(delta - want) > 1) fix('rate', `advance ${delta} frames over 0.50s, want ${want.toFixed(0)} (${SPEED}x)`);
  }
}

// hit frame: the skill's damage moment (age 0) draws the sheet's first frame.
{
  const f = sample(0);
  if (!f) fix('hit-frame', 'cinder-cyclone was not drawn at age 0');
  else if (f.frame !== 0) fix('hit-frame', `frame ${f.frame} at the hit moment, want 0`);
}

// ending: the 103-frame sheet reaches and holds its last frame, at full alpha, until 4.2 s.
{
  const lastFrame = sheet.frames - 1;
  for (const a of [3.4, 3.9]) {
    const f = sample(a);
    if (!f) { fix('ending', `cinder-cyclone was not drawn at ${a}s`); continue; }
    if (f.frame !== lastFrame) fix('ending', `frame ${f.frame} at ${a}s, want last frame ${lastFrame} (1.0x)`);
    if (!(f.alpha > 0.98)) fix('ending', `alpha ${f.alpha} at ${a}s, want 1 until the 4.2 s cut-off`);
  }
}

// lifetime: src/pixel-game.js must remove it at the original 4.2 s, not 4.2/0.6 = 7.0 s.
{
  const g = createGame(null);
  g.state.hunters = []; g.state.wanderers = []; g.state.enemies = [];
  const id = 't66probe';
  g.state.effects.push({ id, type: 'skillfx', cls: 'sorcerer', fx: 'cinder', x: 30, z: 30, age: 0 });
  let age = 0, removed = Infinity;
  for (let i = 0; i < 250; i++) {
    g.tick(0.1); age += 0.1;
    if (!g.state.effects.some(e => e.id === id)) { removed = +age.toFixed(2); break; }
  }
  if (!(removed >= LIFETIME - 0.02 && removed <= LIFETIME + 0.2)) fix('lifetime', `removed at ${removed}s, want the original ${LIFETIME}s`);
}

// frame report: the cinder debug hook must report the 1.0x frame (30 at age 1.0).
{
  reset();
  cinderSetup(1.0);
  render();
  const last = globalThis.__mistvaleCinder?.();
  const want = Math.floor(SPEED * 1.0 * sheet.fps);
  if (!last || !last.last) fix('frame-report', 'cinder debug hook did not report a draw');
  else if (Math.abs(last.last.i - want) > 1) fix('frame-report', `reported frame ${last.last.i}, want ${want}`);
}

if (failures) {
  console.log(`\n${failures} cinder-full-speed rule(s) failed`);
  process.exit(1);
}
console.log(`OK  cinder-cyclone plays at ${SPEED}x, frame 0 at hit, last frame ${sheet.frames - 1} until ${LIFETIME}s`);
console.log('cinder-full-speed: PASS');
