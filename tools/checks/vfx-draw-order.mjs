// vfx-draw-order.mjs — T61: every effect that appears on a monster must be drawn after
// every actor/prop sprite in the same frame, in both the 2D fallback and the WebGL path.
//
// Headless: stubs the small slice of DOM/Canvas the world renderer needs, imports the real
// src/pixel-world.js, simulates a sorcerer casting (spell-charge) at a hurt boar (tinted hit
// flash) with an arrow in flight, and records the draw-call order.
//   2D: every context.drawImage is recorded (tint scratch canvases are ignored; the tinted
//       canvas itself is tagged as an effect).
//   GL: gl-renderer queues quads and flushes them in present(); the fake WebGL2 context
//       replays bufferData + drawArraysInstanced so the queue order is what gets checked.
// The 2D run must also exercise the direct, full and region composite modes.
// Exit: 0 = all hold, 1 = draw order fails (FIX lines printed), 2 = coverage failed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
Error.stackTraceLimit = 40;

const CELL = 20; // floats per GL instance (see FL in gl-renderer.js)

// ── tiny helpers ──────────────────────────────────────────────────────────
const pngSize = file => {
  try {
    const b = fs.readFileSync(file);
    if (b.length < 24) return [512, 512];
    return [b.readUInt32BE(16), b.readUInt32BE(20)];
  } catch { return [512, 512]; }
};
const resolveAsset = src => path.isAbsolute(src) ? src : path.join(ROOT, src);

// ── scan state ────────────────────────────────────────────────────────────
let records = [];
let recOn = false;
const EFFECT_STACK = /drawVfxSheet|drawEffect|drawImpact|drawSlash|drawSkillFx|drawProjectile|drawShotArrows|flushTopVfx/;
const SPRITE_STACK = /drawEnemy|drawHunter|drawDecoration|drawBuilding|drawMonsterSheet|drawSheetHero|drawAtlasMonster|drawSprite/;
const SPRITE_URL = /\/monsters3\/|\/heroes\/|\/flora\/|\/xilurus\/|\/buildings\//;
const EFFECT_URL = /\/vfx-sheets\//;

function classify (src, stack) {
  const url = src && typeof src.src === 'string' ? src.src : '';
  if (src && src.__tint) return 'effect';
  if (EFFECT_URL.test(url)) return 'effect';
  if (EFFECT_STACK.test(stack || '')) return 'effect';
  if (SPRITE_URL.test(url)) return 'sprite';
  if (SPRITE_STACK.test(stack || '')) return 'sprite';
  return null;
}
function record (src, stack) {
  if (!recOn) return;
  const kind = classify(src, stack);
  if (!kind) return;
  records.push({
    kind,
    url: src && typeof src.src === 'string' ? src.src : '',
    tag: src && src.__tint ? 'tint' : '',
    stack: String(stack || ''),
  });
}
const stackNow = () => new Error().stack || '';

// ── DOMMatrix ─────────────────────────────────────────────────────────────
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

// ── Path2D ────────────────────────────────────────────────────────────────
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
    get globalCompositeOperation () { return s.op; },
    set globalCompositeOperation (v) {
      s.op = String(v);
      // tinted() paints a silhouette via source-in on a scratch canvas: tag it as an effect.
      if (s.op === 'source-in' || s.op === 'source-atop' || s.op === 'destination-in') canvas.__tint = true;
    },
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
    drawImage (img) { if (canvas.__tint) return; record(img, stackNow()); },
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

// ── fake WebGL2 (records the present() queue) ─────────────────────────────
function makeGL (canvas) {
  const K = {};
  let n = 1;
  for (const name of ['RGBA', 'UNSIGNED_BYTE', 'TEXTURE_2D', 'TEXTURE_MIN_FILTER', 'TEXTURE_MAG_FILTER', 'TEXTURE_WRAP_S', 'TEXTURE_WRAP_T',
    'REPEAT', 'CLAMP_TO_EDGE', 'NEAREST', 'TEXTURE0', 'TRIANGLE_STRIP', 'ARRAY_BUFFER', 'STREAM_DRAW', 'FLOAT',
    'VERTEX_SHADER', 'FRAGMENT_SHADER', 'COMPILE_STATUS', 'LINK_STATUS', 'MAX_TEXTURE_IMAGE_UNITS', 'MAX_TEXTURE_SIZE',
    'ONE', 'ONE_MINUS_SRC_ALPHA', 'BLEND', 'DEPTH_TEST', 'CULL_FACE', 'FRAMEBUFFER', 'COLOR_ATTACHMENT0', 'COLOR_BUFFER_BIT',
    'NO_ERROR', 'UNPACK_PREMULTIPLY_ALPHA_WEBGL', 'UNPACK_FLIP_Y_WEBGL', 'UNPACK_SKIP_PIXELS', 'UNPACK_SKIP_ROWS', 'RENDERER']) K[name] = n++;
  const texSource = new Map();
  const texStack = new Map();
  const bound = [];
  let active = 0;
  let lastBuffer = null;
  let lastBase = 0;
  const gl = {
    ...K,
    canvas,
    createShader: () => ({}),
    shaderSource () {}, compileShader () {},
    getShaderParameter: () => true, getShaderInfoLog: () => '',
    createProgram: () => ({}), attachShader () {}, linkProgram () {},
    getProgramParameter: () => true, getProgramInfoLog: () => '',
    useProgram () {}, getUniformLocation: () => ({}), uniform1iv () {}, uniform2f () {}, uniform1f () {}, uniform1i () {},
    createVertexArray: () => ({}), bindVertexArray () {}, createBuffer: () => ({}),
    bindBuffer () {}, enableVertexAttribArray () {}, vertexAttribDivisor () {},
    vertexAttribPointer (attr, size, type, normalized, stride, offset) {
      // attribute 0 starts at the batch's first instance (see drawList in gl-renderer.js).
      if (attr === 0 && stride === CELL * 4) lastBase = Math.round((offset || 0) / (CELL * 4));
    },
    enable () {}, disable () {}, blendFunc () {}, depthFunc () {},
    createTexture: () => ({}),
    deleteTexture (t) { texSource.delete(t); texStack.delete(t); },
    bindTexture (target, tex) { bound[active] = tex; },
    activeTexture (unit) { active = unit - K.TEXTURE0; },
    texParameteri () {}, pixelStorei () {},
    texImage2D () {
      const args = [...arguments];
      const src = args[args.length - 1];
      if (!src || typeof src === 'number') return;
      if (typeof src === 'object' && (typeof src.byteLength === 'number' || ArrayBuffer.isView(src))) return;
      const tex = bound[active];
      if (!tex) return;
      texSource.set(tex, src);
      texStack.set(tex, stackNow());
    },
    getError: () => K.NO_ERROR, isContextLost: () => false,
    createFramebuffer: () => ({}), framebufferTexture2D () {}, bindFramebuffer () {},
    viewport () {}, clearColor () {}, clear () {},
    bufferData (target, data) { lastBuffer = data && data.length ? Float32Array.from(data) : null; },
    drawArraysInstanced (mode, first, count, instances) {
      if (!lastBuffer) return;
      for (let i = 0; i < instances; i++) {
        const idx = lastBase + i;
        const off = idx * CELL;
        if (off + 7 >= lastBuffer.length) break;
        const unit = lastBuffer[off + 7] | 0;
        const tex = bound[unit];
        const src = texSource.get(tex) || null;
        record(src, texStack.get(tex));
      }
    },
    getParameter (p) {
      if (p === K.MAX_TEXTURE_IMAGE_UNITS) return 16;
      if (p === K.MAX_TEXTURE_SIZE) return 4096;
      if (p === K.RENDERER) return 'fake';
      return 0;
    },
  };
  return gl;
}

// ── fake canvas / document / window-ish globals ───────────────────────────
function makeCanvas (w = 0, h = 0) {
  const c = {
    width: w, height: h, style: {}, dataset: {},
    parentNode: null,
    setAttribute () {}, removeAttribute () {}, addEventListener () {}, removeEventListener () {}, remove () {},
    getBoundingClientRect () { return { left: 0, top: 0, width: 1280, height: 720, right: 1280, bottom: 720 }; },
  };
  let ctx2d = null, gl = null;
  c.getContext = type => {
    if (type === 'webgl2') return (gl ||= makeGL(c));
    return (ctx2d ||= makeCtx2D(c));
  };
  c.toDataURL = () => 'data:image/png;base64,';
  return c;
}
const body = {
  dataset: {}, style: {}, children: [],
  appendChild (el) { el.parentNode = body; body.children.push(el); return el; },
  insertBefore (el, ref) { el.parentNode = body; body.children.push(el); return el; },
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
globalThis.location = { search: '' };
globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;
globalThis.devicePixelRatio = 1;
globalThis.screen = { width: 1280, height: 720 };

// ── assets (real metadata from disk) ──────────────────────────────────────
const readJSON = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
globalThis.PIXEL_ASSETS = {
  heroSheets: { sorcerer: { img: 'assets/heroes/sorcerer.png', meta: readJSON('assets/heroes/sorcerer.json') } },
  monsterSheets: { boar: { img: 'assets/monsters3/boar.png', meta: readJSON('assets/monsters3/boar.json') } },
  vfxSheets: {
    'spell-charge': { img: 'assets/vfx-sheets/spell-charge.png', meta: readJSON('assets/vfx-sheets/spell-charge.json') },
    arrow: { img: 'assets/vfx-sheets/arrow.png', meta: readJSON('assets/vfx-sheets/arrow.json') },
    'hit-spark': { img: 'assets/vfx-sheets/hit-spark.png', meta: readJSON('assets/vfx-sheets/hit-spark.json') },
  },
  ui: {},
};

const worldModule = await import(pathToFileURL(path.join(ROOT, 'src/pixel-world.js')).href);
const { createWorld } = worldModule;

const STATE = () => ({
  time: 1,
  buildings: {},
  hunters: [{ id: 's1', classId: 'sorcerer', name: 'S1', x: 28, z: 28, status: '戰鬥中', targetId: 'm1', attackTimer: 0.1, hp: 10, maxHp: 10 }],
  enemies: [
    { id: 'm1', type: 'boar', x: 30, z: 30, hp: 10, maxHp: 10, hitAt: 0.98, hitFromX: 29, hitFromZ: 30 },
    { id: 'm2', type: 'boar', x: 34, z: 34, hp: 10, maxHp: 10 },
  ],
  effects: [{ id: 'fx1', type: 'arrow', x: 34, z: 34, sourceX: 30, sourceZ: 30, age: 0.05, delay: 0.1 }],
  shots: [],
  wanderers: [],
  layout: {},
});

const FRAMES = 8;
const results = [];
let coverageFail = false;

async function runWorld (use2d) {
  globalThis.location.search = use2d ? '?renderer=2d' : '';
  const canvas = documentStub.createElement('canvas');
  canvas.width = 1280; canvas.height = 720;
  const world = createWorld(canvas);
  world.lookAt(32, 32, 1.2);
  const state = STATE();
  const modes = new Set();
  const frames = [];
  for (let i = 0; i < FRAMES; i++) {
    records = [];
    recOn = true;
    world.update(0.016, state);
    recOn = false;
    const perf = globalThis.__mistvalePerf?.() || {};
    modes.add(perf.mode);
    frames.push({ mode: perf.mode || '-', records: records.slice() });
  }
  world.dispose?.();
  results.push({ label: use2d ? '2d' : 'gl', modes, frames });
}

await runWorld(true);
await runWorld(false);

// ── assertions ────────────────────────────────────────────────────────────
const short = r => {
  if (r.tag === 'tint') return 'tinted hit-flash';
  const m = r.url.match(/([^/\\]+)$/);
  return m ? m[1] : 'canvas';
};
const effectShort = r => {
  if (r.tag === 'tint') return 'hit-flash';
  if (/spell-charge/.test(r.url)) return 'spell-charge';
  if (/arrow\.png/.test(r.url)) return 'arrow';
  return short(r);
};
const stackTop = r => {
  const hits = [];
  for (const line of r.stack.split('\n')) {
    const m = line.match(/at ([A-Za-z0-9_$]+) /);
    if (m && /draw|flush/.test(m[1]) && !hits.includes(m[1])) hits.push(m[1]);
    if (hits.length >= 3) break;
  }
  return hits.join('<');
};

let failed = 0;
for (const res of results) {
  const need = res.label === '2d' ? ['direct', 'full', 'region'] : ['gl'];
  const missingModes = need.filter(m => !res.modes.has(m));
  if (missingModes.length) {
    coverageFail = true;
    console.log(`FAIL ${res.label}: composite modes not covered (missing ${missingModes.join(', ')}; saw ${[...res.modes].join(', ')})`);
  }
  for (let f = 0; f < res.frames.length; f++) {
    const { mode, records: recs } = res.frames[f];
    if (process.env.VFX_DEBUG && res.label === 'gl' && f === 0) {
      recs.forEach((r, i) => console.error(i, r.kind, r.tag || r.url || '(canvas)', (r.stack.split('\n').find(l => /at [A-Za-z0-9_$]+ /.test(l)) || '').trim()));
    }
    const hasMonster = recs.some(r => r.kind === 'sprite' && /monsters3/.test(r.url));
    const hasFlash = recs.some(r => r.kind === 'effect' && r.tag === 'tint');
    const hasCharge = recs.some(r => r.kind === 'effect' && /spell-charge/.test(r.url));
    const hasArrow = recs.some(r => r.kind === 'effect' && /\/arrow\.png/.test(r.url));
    const missing = [];
    if (!hasMonster) missing.push('monster sprite');
    if (!hasFlash) missing.push('tinted hit-flash');
    if (!hasCharge) missing.push('spell-charge');
    if (!hasArrow) missing.push('arrow');
    if (missing.length) {
      failed++;
      console.log(`FIX ${res.label}/${mode} frame ${f + 1}: missing ${missing.join(', ')}`);
      continue;
    }
    const firstEffect = recs.findIndex(r => r.kind === 'effect');
    const offenders = [];
    for (let i = firstEffect + 1; i < recs.length; i++) {
      if (recs[i].kind === 'sprite') offenders.push({ sprite: recs[i], effect: recs[firstEffect], i });
    }
    if (offenders.length) {
      failed++;
      const o = offenders[0];
      console.log(`FIX ${res.label}/${mode} ${short(o.sprite)} after ${effectShort(o.effect)} (sprite #${o.i}, ${offenders.length} sprite(s) after first effect; stack ${stackTop(o.sprite) || 'n/a'})`);
    } else {
      console.log(`OK  ${res.label}/${mode} frame ${f + 1}: sprites ${recs.filter(r => r.kind === 'sprite').length}, effects ${recs.filter(r => r.kind === 'effect').length}`);
    }
  }
}
if (failed) {
  console.log(`\n${failed} frame(s) draw an actor/prop sprite after an effect`);
  process.exit(1);
}
if (coverageFail) {
  console.log('\ncomposite-mode coverage is incomplete');
  process.exit(2);
}
console.log('\nvfx draw order holds in every 2D composite mode and in GL');
