// hit-feel.mjs — T95: screen shake on heavy hits.
//
// Headless: stubs the small slice of DOM/Canvas the world renderer needs, imports the real
// src/pixel-world.js + src/pixel-game.js, drives the world frame by frame and reads the
// __mistvaleShake() debug hook. Proves:
//   1. a skill hit starts a shake: |amp| > 0.5 px within 100 ms, < 0.05 px by 600 ms;
//   2. the 鏡頭震動 setting off keeps it at 0 the whole time (even though the hit still asks);
//   3. prefers-reduced-motion: reduce forces it off too;
//   4. unproject() returns the same world point (0.01) while the screen is shaking, and the
//      shake really reaches the projection (project() moves).
// Exit: 0 = all rules hold, 1 = FIX lines printed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJSON = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const resolveAsset = src => path.isAbsolute(src) ? src : path.join(ROOT, src);
const pngSize = file => {
  try {
    const b = fs.readFileSync(file);
    if (b.length < 24) return [512, 512];
    return [b.readUInt32BE(16), b.readUInt32BE(20)];
  } catch { return [512, 512]; }
};

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

// ── 2D context ────────────────────────────────────────────────────────────
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
    drawImage () {}, fillRect () {}, clearRect () {}, strokeRect () {},
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
    getBoundingClientRect () { return { left: 0, top: 0, width: 1440, height: 900, right: 1440, bottom: 900 }; },
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
// prefers-reduced-motion 可以在測試中切換(media.reduce)並通知已註冊的 listener。
const media = { reduce: false, listeners: [] };
globalThis.matchMedia = q => {
  const motion = /prefers-reduced-motion/.test(String(q));
  return {
    get matches () { return motion && media.reduce; },
    addEventListener (type, fn) { if (motion) media.listeners.push(fn); },
    removeEventListener () {},
  };
};
globalThis.location = { search: '?renderer=2d' };
globalThis.innerWidth = 1440;
globalThis.innerHeight = 900;
globalThis.devicePixelRatio = 1;
globalThis.screen = { width: 1440, height: 900 };

// ── assets ────────────────────────────────────────────────────────────────
globalThis.PIXEL_ASSETS = {
  vfxSheets: {},
  heroSheets: { berserker: { img: 'assets/heroes/berserker.png', meta: readJSON('assets/heroes/berserker.json') } },
  monsterSheets: {},
  ui: {},
};

const { createWorld } = await import(pathToFileURL(path.join(ROOT, 'src/pixel-world.js')).href);
const { createGame } = await import(pathToFileURL(path.join(ROOT, 'src/pixel-game.js')).href);

// ── world + game ──────────────────────────────────────────────────────────
const canvas = documentStub.createElement('canvas');
canvas.width = 1440; canvas.height = 900;
const world = createWorld(canvas);
const game = createGame(null);
const S = game.state;
// 1440x900 DPR1 基準:createWorld 的 resize() 讓 scale === baseScale,所以放大倍率剛好是 1。
// createGame(null) 已經有預設獵人/魔物,清空後只留這一組(固定 id、固定站位,結果才可重現)。
S.hunters.length = 0;
S.enemies.length = 0;
S.hunters.push({ id: 'h1', classId: 'berserker', name: 'P', x: 30, z: 30, hp: 100, maxHp: 100, attack: 20, defense: 0, level: 1, rarity: 'normal', trait: 'brave', satiety: 100, stamina: 100, mood: 100, range: 1.2, status: '待命', task: null, route: [], inventory: {}, skillCd: 0, attackTimer: 0, lockUntil: 0, atkAt: -99, hitAt: -99 });
S.enemies.push({ id: 'e1', type: 'sprout', x: 32, z: 30, hp: 500, maxHp: 500, attack: 5, defense: 0, speed: 1, regionId: 'meadow', rewarded: false });

const shakeNow = () => globalThis.__mistvaleShake();
const step = n => {
  const out = [];
  for (let i = 0; i < n; i++) { world.update(1 / 60, S); const s = shakeNow(); s.project = world.project(30, 0, 30); out.push(s); }
  return out;
};
const finite = s => Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.amp);

// ── probes ────────────────────────────────────────────────────────────────
let failures = 0;
function fix (rule, detail) {
  failures++;
  console.log(`FIX hit-feel ${rule} — ${detail}`);
}

const beforeUnproject = world.unproject(720, 450);
const beforeProject = world.project(30, 0, 30);

// Warm up one frame with the live state first: this seeds lastShakeSeq (a loaded save must not shake).
world.update(1 / 60, S);
if (S.shake) fix('warmup', `a shake request already exists before any hit: ${JSON.stringify(S.shake)}`);

if (!game.pilotStart('h1').ok) fix('pilot', 'pilotStart failed for h1');
const cast = game.pilotSkill();
if (!cast.ok) fix('skill-hit', `pilotSkill failed: ${cast.message}`);
if (S.shake?.amp !== 3.5) fix('skill-hit', `skill hit requested amp ${S.shake?.amp}, want 3.5`);
if (S.shake?.ms !== 220) fix('skill-hit', `skill hit requested ${S.shake?.ms} ms, want 220`);

// 1) the hit really shakes the screen: > 0.5 px at 6 frames (100 ms), and the projection moves.
const early = step(6);
if (!early.every(finite)) fix('finite', 'shake x/y/amp must stay finite');
if (!(early[0].amp > 0.5)) fix('onset', `amp ${early[0].amp} one frame after the skill hit, want > 0.5`);
if (!(early[5].amp > 0.5)) fix('onset', `amp ${early[5].amp} at 100 ms, want > 0.5`);
const peak = Math.max(...early.map(s => Math.hypot(s.x, s.y)));
if (!(peak > 0.5)) fix('offset', `largest screen offset ${peak.toFixed(2)} px within 100 ms, want > 0.5`);
if (!early.some(s => s.project.x !== beforeProject.x || s.project.y !== beforeProject.y)) fix('project', 'project() never moved while shaking');

// 2) unproject must keep returning the same world point while the screen is shaking.
const duringUnproject = world.unproject(720, 450);
if (Math.abs(beforeUnproject.x - duringUnproject.x) > 0.01 || Math.abs(beforeUnproject.z - duringUnproject.z) > 0.01) {
  fix('unproject', `world point moved from (${beforeUnproject.x.toFixed(3)},${beforeUnproject.z.toFixed(3)}) to (${duringUnproject.x.toFixed(3)},${duringUnproject.z.toFixed(3)})`);
}
if (!(shakeNow().amp > 0.5)) fix('unproject', 'unproject was checked while the shake was already over');

// 3) decay: < 0.05 px by 600 ms (40 frames total).
const late = step(30);
const at600 = late[late.length - 1];
if (!(at600.amp < 0.05)) fix('decay', `amp ${at600.amp} at 600 ms, want < 0.05`);
if (!(at600.x === 0 && at600.y === 0)) fix('decay', `offset ${at600.x},${at600.y} at 600 ms, want 0,0`);

// 4) setting off: the same hit still asks for a shake, but the world must stay at 0 all the way.
const seqBeforeOff = S.shake?.seq;
S.time += 1;   // 真實遊戲的時鐘會前進;同一 tick 的同強度請求會取大的、不重發
game.setSetting('shake', false);
S.hunters[0].skillCd = 0;
S.hunters[0].attackTimer = 0;
game.pilotSkill();
if (!(S.shake?.seq > seqBeforeOff)) fix('setting-off', 'the second skill hit did not request a shake (probe is vacuous)');
const offSamples = step(42);
if (!offSamples.every(s => s.amp === 0 && s.x === 0 && s.y === 0)) {
  const bad = offSamples.find(s => s.amp !== 0 || s.x !== 0 || s.y !== 0);
  fix('setting-off', `settings.shake=false still shook: ${JSON.stringify(bad)}`);
}

// 5) prefers-reduced-motion: reduce forces it off even with the setting on.
media.reduce = true;
for (const fn of media.listeners) { try { fn({ matches: true }); } catch {} }
const seqBeforeMotion = S.shake?.seq;
S.time += 1;
game.setSetting('shake', true);
S.hunters[0].skillCd = 0;
game.pilotSkill();
if (!(S.shake?.seq > seqBeforeMotion)) fix('reduced-motion', 'the third skill hit did not request a shake (probe is vacuous)');
const rmSamples = step(20);
if (!rmSamples.every(s => s.amp === 0 && s.x === 0 && s.y === 0)) {
  const bad = rmSamples.find(s => s.amp !== 0 || s.x !== 0 || s.y !== 0);
  fix('reduced-motion', `prefers-reduced-motion: reduce still shook: ${JSON.stringify(bad)}`);
}
media.reduce = false;
for (const fn of media.listeners) { try { fn({ matches: false }); } catch {} }

// settings.serialize: the shake request is view-only state and must not be saved.
const saved = game.serialize();
if (saved.shake !== null) fix('serialize', `serialize().shake === ${JSON.stringify(saved.shake)}, want null`);
if (saved.settings?.shake !== true) fix('serialize', 'settings.shake must be remembered in the save');

if (failures) {
  console.log(`FAIL hit-feel: ${failures} rule(s) broken`);
  process.exit(1);
}
console.log(`PASS hit-feel: skill 3.5px/220ms (${peak.toFixed(2)}px peak), off=0, reduce-motion=0, unproject stable, <0.05 by 600ms`);
