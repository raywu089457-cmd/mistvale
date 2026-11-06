// mage-attack-fx.mjs — T67: the sorcerer's basic attack must show the spell-charge sheet
// during every windup (any quality, both renderers), and the fireball-blast must be drawn
// after the target's sprite, anchored at the monster's body centre and at least as wide as it.
//
// Headless: same DOM/Canvas/WebGL2 stubs as tools/checks/vfx-draw-order.mjs. Imports the real
// src/pixel-world.js and records every drawImage (2D) / queued quad (GL) of one frame.
// Exit: 0 = all hold, 1 = a case fails (FIX lines printed).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
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

// Decode an 8-bit PNG (no interlace) so the size check can measure the monster's real opaque
// width instead of the atlas cell / max opaque dimension in the JSON.
const pngCache = new Map();
function readPNG (file) {
  const key = resolveAsset(file);
  if (pngCache.has(key)) return pngCache.get(key);
  let out = null;
  try {
    const b = fs.readFileSync(key);
    if (b.length > 8 && b.toString('ascii', 1, 4) === 'PNG') {
      let p = 8, w = 0, h = 0, depth = 0, colorType = 0, interlace = 0;
      const idat = [];
      while (p + 8 <= b.length) {
        const len = b.readUInt32BE(p), type = b.toString('ascii', p + 4, p + 8);
        const data = b.subarray(p + 8, p + 8 + len);
        if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; colorType = data[9]; interlace = data[12]; }
        else if (type === 'IDAT') idat.push(data);
        p += 12 + len;
        if (type === 'IEND') break;
      }
      const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 0 ? 1 : 0;
      if (w && h && depth === 8 && !interlace && ch) {
        const raw = zlib.inflateSync(Buffer.concat(idat));
        const stride = w * ch, pixels = Buffer.alloc(h * stride);
        let prev = Buffer.alloc(stride), off = 0;
        for (let y = 0; y < h; y++) {
          const filter = raw[off++], row = raw.subarray(off, off + stride); off += stride;
          const cur = Buffer.alloc(stride);
          for (let x = 0; x < stride; x++) {
            const a = x >= ch ? cur[x - ch] : 0, up = prev[x], c = x >= ch ? prev[x - ch] : 0;
            let v = row[x];
            if (filter === 1) v = (v + a) & 255;
            else if (filter === 2) v = (v + up) & 255;
            else if (filter === 3) v = (v + ((a + up) >> 1)) & 255;
            else if (filter === 4) {
              const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c);
              v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c)) & 255;
            }
            cur[x] = v;
          }
          cur.copy(pixels, y * stride); prev = cur;
        }
        out = { w, h, ch, pixels };
      }
    }
  } catch { out = null; }
  pngCache.set(key, out);
  return out;
}

// Opaque width (source px) inside a drawImage source rectangle.
function opaqueWidth (file, sx, sy, sw, sh) {
  const im = readPNG(file);
  if (!im) return 0;
  const x0 = Math.max(0, sx | 0), x1 = Math.min(im.w, (sx | 0) + (sw | 0));
  const y0 = Math.max(0, sy | 0), y1 = Math.min(im.h, (sy | 0) + (sh | 0));
  let min = Infinity, max = -1;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const a = im.ch === 4 ? im.pixels[(y * im.w + x) * im.ch + 3]
      : im.ch === 2 ? im.pixels[(y * im.w + x) * im.ch + 1] : 255;
    if (a > 8) { if (x < min) min = x; if (x > max) max = x; }
  }
  return max >= min ? max - min + 1 : 0;
}

// ── scan state ────────────────────────────────────────────────────────────
let records = [];
let recOn = false;

function record (src, args, tf, stack) {
  if (!recOn) return;
  const url = src && typeof src.src === 'string' ? src.src : '';
  const tag = src && src.__tint ? 'tint' : '';
  if (!url && !tag) return;
  records.push({ url, tag, args: args || [], tf: tf || null, stack: String(stack || '') });
}
const stackNow = () => new Error().stack || '';

// ── DOMMatrix ─────────────────────────────────────────────────────────────
class FakeDOMMatrix {
  constructor (init) {
    let [a, b, c, d, e, f] = [1, 0, 0, 1, 0, 0];
    if (init) {
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

// ── 2D context (records drawImage and its transform) ──────────────────────
function makeCtx2D (canvas) {
  let s = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, alpha: 1, fill: '#000', stroke: '#000', lw: 1, op: 'source-over' };
  const stack = [];
  const base = {
    canvas,
    get globalAlpha () { return s.alpha; }, set globalAlpha (v) { if (Number.isFinite(+v)) s.alpha = Math.max(0, Math.min(1, +v)); },
    get globalCompositeOperation () { return s.op; },
    set globalCompositeOperation (v) {
      s.op = String(v);
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
    drawImage (img) {
      if (canvas.__tint) return;
      record(img, [...arguments], { a: s.a, b: s.b, c: s.c, d: s.d, e: s.e, f: s.f }, stackNow());
    },
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
        record(src, [], null, texStack.get(tex));
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
const BOAR_META = readJSON('assets/monsters3/boar.json');
const SPROUT_META = readJSON('assets/monsters3/sprout.json');
const TREANT_META = readJSON('assets/monsters3/treant.json');
globalThis.PIXEL_ASSETS = {
  heroSheets: { sorcerer: { img: 'assets/heroes/sorcerer.png', meta: readJSON('assets/heroes/sorcerer.json') } },
  monsterSheets: {
    boar: { img: 'assets/monsters3/boar.png', meta: BOAR_META },
    sprout: { img: 'assets/monsters3/sprout.png', meta: SPROUT_META },
    treant: { img: 'assets/monsters3/treant.png', meta: TREANT_META },
  },
  vfxSheets: {
    'spell-charge': { img: 'assets/vfx-sheets/spell-charge.png', meta: readJSON('assets/vfx-sheets/spell-charge.json') },
    'fireball-blast': { img: 'assets/vfx-sheets/fireball-blast.png', meta: readJSON('assets/vfx-sheets/fireball-blast.json') },
    'fireball': { img: 'assets/vfx-sheets/fireball.png', meta: readJSON('assets/vfx-sheets/fireball.json') },
  },
  ui: {},
};

const worldModule = await import(pathToFileURL(path.join(ROOT, 'src/pixel-world.js')).href);
const { createWorld } = worldModule;

const STATE = () => ({
  time: 1,
  buildings: {},
  hunters: [{ id: 's1', classId: 'sorcerer', name: 'S1', x: 28, z: 28, status: '戰鬥中', targetId: 'm1', attackTimer: 0.35, hp: 10, maxHp: 10 }],
  enemies: [{ id: 'm1', type: 'boar', x: 30, z: 30, hp: 10, maxHp: 10 }],
  // windup is still running while the projectile impact lands: one frame must show both.
  effects: [{ id: 'spell-fx', type: 'spell', x: 30, z: 30, sourceX: 28, sourceZ: 28, age: 0.7, delay: 0.55, targetId: 'm1', cls: 'sorcerer' }],
  shots: [],
  wanderers: [],
  layout: {},
});

const runs = [];

async function runWorld (use2d) {
  globalThis.location.search = use2d ? '?renderer=2d' : '';
  const canvas = documentStub.createElement('canvas');
  canvas.width = 1280; canvas.height = 720;
  const world = createWorld(canvas);
  world.setQuality(false);
  world.lookAt(32, 32, 1.2);
  const state = STATE();
  records = [];
  recOn = true;
  globalThis.__mistvaleForceFull();
  world.update(0.016, state);
  recOn = false;
  const facing = globalThis.__mistvaleFacing?.() || {};
  runs.push({ label: use2d ? '2d' : 'gl', records: records.slice(), facing: facing.s1 || null, world, canvas });
  world.dispose?.();
}

// A dedicated 2D world for the T69 anchor/order/size frames (createWorld also points
// globalThis.__mistvaleForceFull at the newest world, so the frames below hit this one).
async function make2dWorld () {
  globalThis.location.search = '?renderer=2d';
  const canvas = documentStub.createElement('canvas');
  canvas.width = 1280; canvas.height = 720;
  const world = createWorld(canvas);
  world.setQuality(false);
  world.lookAt(32, 32, 1.2);
  return { world, canvas, scale: world.getScale() };
}

// Render one frame of a harness world and return that frame's draw records.
function frame (world, state) {
  records = [];
  recOn = true;
  globalThis.__mistvaleForceFull();
  world.update(0.016, state);
  recOn = false;
  return records.slice();
}

const baseState = () => ({
  time: 2,
  buildings: {},
  hunters: [{ id: 's2', classId: 'sorcerer', name: 'S2', x: 26, z: 26, status: '待機中', hp: 10, maxHp: 10 }],
  enemies: [],
  effects: [],
  shots: [],
  wanderers: [],
  layout: {},
});

await runWorld(true);
await runWorld(false);

// ── assertions ────────────────────────────────────────────────────────────
const isCharge = r => /spell-charge\.png/.test(r.url);
const isBlast = r => /fireball-blast\.png/.test(r.url);
const isBoar = r => /\/monsters3\/boar\.png/.test(r.url);
let failed = 0;
const fix = (msg) => { failed++; console.log(`FIX ${msg}`); };

for (const run of runs) {
  const { label, records: recs } = run;
  // 1. spell-charge during a basic-attack windup, at low quality, on both renderers.
  const charge = recs.findIndex(isCharge);
  const pose = run.facing?.pose;
  if (charge < 0) fix(`${label}: no spell-charge draw during the sorcerer basic-attack windup (pose ${pose || 'n/a'})`);
  if (pose !== 'windup') fix(`${label}: sorcerer pose is ${pose || 'n/a'}, expected windup`);
  if (charge >= 0 && pose === 'windup') console.log(`OK  ${label}: spell-charge drawn in windup (#${charge}, ${recs.length} draws)`);
  // 2. fireball-blast after the last boar sprite draw in the same frame.
  let boarAt = -1;
  for (let i = 0; i < recs.length; i++) if (isBoar(recs[i])) boarAt = i;
  const blastAt = recs.findIndex(isBlast);
  if (blastAt < 0) fix(`${label}: no fireball-blast draw`);
  else if (boarAt < 0) fix(`${label}: no boar sprite draw`);
  else if (blastAt < boarAt) fix(`${label}: fireball-blast (#${blastAt}) drawn before the boar sprite (#${boarAt})`);
  else console.log(`OK  ${label}: fireball-blast after boar sprite (#${blastAt} > #${boarAt})`);
}

// 3. anchor y inside the monster's body box and blast width >= monster width (2D only).
{
  const run = runs.find(r => r.label === '2d');
  const recs = run.records;
  const boar = recs.filter(isBoar).at(-1);
  const blast = recs.filter(isBlast).at(-1);
  const kBoar = boar && boar.args.length >= 9 && boar.args[7]
    ? Math.abs(boar.args[7] * (boar.tf ? boar.tf.a : 1)) / BOAR_META.actions.idle.cell
    : 0;
  const artW = BOAR_META.artSize * kBoar;
  const feetY = run.world.project(30, 0, 30).y;
  const top = feetY - artW;
  const blastY = blast && blast.tf ? blast.tf.f : NaN;
  const blastW = blast && blast.args.length >= 9 ? Math.abs(blast.args[7] * (blast.tf ? blast.tf.a : 1)) : 0;
  if (!blast) fix('anchor: no fireball-blast draw to measure');
  else if (!kBoar) fix('anchor: could not derive the boar draw scale');
  else if (!(blastY >= top + artW * 0.25 && blastY <= top + artW * 0.75)) {
    fix(`anchor: blast y ${Math.round(blastY)} is outside the body box (top ${Math.round(top)}, h ${Math.round(artW)}; feet ${Math.round(feetY)})`);
  } else console.log(`OK  anchor: blast y ${Math.round(blastY)} in body box [${Math.round(top)}, ${Math.round(feetY)}], feet ${Math.round(feetY)}`);
  if (blast && kBoar && blastW < artW) fix(`anchor: blast width ${Math.round(blastW)} < monster width ${Math.round(artW)}`);
  if (blast && kBoar && blastW >= artW) console.log(`OK  scale: blast width ${Math.round(blastW)} >= monster width ${Math.round(artW)}`);
}

// ── T69: lethal hit with the target already gone, and blast size vs monster ──
const t69 = await make2dWorld();
const isTreant = r => /\/monsters3\/treant\.png/.test(r.url);

// 4. Lethal frame exactly as the killing tick leaves it: the spell effect already carries the
//    creation-time target type, the hp=0 boss has been filtered out of state.enemies before the
//    first draw, and the delayed impact lands with the death effect in the same frame.
{
  const world = t69.world, scale = t69.scale;
  const feet = world.project(30, 0, 30).y;
  const bossH = TREANT_META.size * scale; // ENEMY_SIZE('boss')
  const state = baseState();
  state.enemies = [];
  state.effects = [
    { id: 'spell-lethal', type: 'spell', x: 30, z: 30, sourceX: 28, sourceZ: 28, age: 0.6, delay: 0.55, targetId: 'm1', bodyType: 'boss', cls: 'sorcerer' },
    { id: 'death-lethal', type: 'death', enemyType: 'boss', x: 30, z: 30, age: 0.2 },
  ];
  const recs = frame(world, state);
  let blastAt = -1, treantAt = -1;
  for (let i = 0; i < recs.length; i++) {
    if (isBlast(recs[i])) blastAt = i;
    if (isTreant(recs[i])) treantAt = i;
  }
  const blast = blastAt >= 0 ? recs[blastAt] : null;
  if (!blast) fix('lethal: no fireball-blast draw after the killing blow (target already left state.enemies)');
  else {
    const y = blast.tf ? blast.tf.f : NaN;
    if (!(y >= feet - 0.7 * bossH && y <= feet - 0.3 * bossH)) {
      fix(`lethal: blast y ${Math.round(y)} outside the body box [${Math.round(feet - 0.7 * bossH)}, ${Math.round(feet - 0.3 * bossH)}] (feet ${Math.round(feet)})`);
    } else console.log(`OK  lethal: blast y ${Math.round(y)} still in the body box (feet ${Math.round(feet)})`);
  }
  if (treantAt < 0) fix('lethal: no treant death sprite drawn for the killing blow');
  else if (!blast) fix('lethal: cannot check draw order without a blast');
  else if (blastAt < treantAt) fix(`lethal: fireball-blast (#${blastAt}) drawn before the death sprite (#${treantAt})`);
  else console.log(`OK  lethal: fireball-blast after the death sprite (#${blastAt} > #${treantAt})`);
}

// 5. Size: the visible part of the sheet is 174 of its 300 px frame. The visible blast must
//    cover ≥1.2× the monster's *opaque* sprite width (not the atlas cell), capped at 2.2× the
//    medium monster's game size.
{
  const world = t69.world, scale = t69.scale;
  const cases = [
    { label: 'small sprout', type: 'sprout', re: /\/monsters3\/sprout\.png/ },
    { label: 'medium bear', type: 'boar', re: /\/monsters3\/boar\.png/ },
    { label: 'large treant', type: 'boss', re: /\/monsters3\/treant\.png/ },
  ];
  const cap = 2.2 * BOAR_META.size * scale;
  for (const c of cases) {
    const state = baseState();
    state.enemies = [{ id: 'm2', type: c.type, x: 30, z: 30, hp: 10, maxHp: 10 }];
    state.effects = [{ id: 'spell-size', type: 'spell', x: 30, z: 30, sourceX: 28, sourceZ: 28, age: 0.6, delay: 0.55, targetId: 'm2', cls: 'sorcerer' }];
    const recs = frame(world, state);
    const blast = recs.filter(isBlast).at(-1);
    const mon = recs.filter(r => c.re.test(r.url) && !r.tag).at(-1);
    const visW = blast && blast.args.length >= 9
      ? Math.abs(blast.args[7] * (blast.tf ? blast.tf.a : 1)) * 174 / 300
      : 0;
    let monW = 0;
    if (mon && mon.args.length >= 9) {
      const sx = mon.args[1], sy = mon.args[2], sw = mon.args[3], sh = mon.args[4];
      const dw = mon.args[7] * Math.abs(mon.tf ? mon.tf.a : 1);
      const op = opaqueWidth(mon.url, sx, sy, sw, sh);
      if (op && sw) monW = op * dw / sw;
    }
    if (!blast) fix(`${c.label}: no fireball-blast draw to measure`);
    else if (!monW) fix(`${c.label}: could not measure the opaque monster width`);
    else if (visW < 1.2 * monW) fix(`${c.label}: visible blast width ${Math.round(visW)} < 1.2× monster width ${Math.round(monW)} (need ${Math.round(1.2 * monW)})`);
    else if (visW > cap + 0.05) fix(`${c.label}: visible blast width ${Math.round(visW)} over the 2.2× medium cap ${Math.round(cap)}`);
    else console.log(`OK  size ${c.label}: visible blast ${Math.round(visW)} vs monster ${Math.round(monW)} (${(visW / monW).toFixed(2)}×, cap ${Math.round(cap)})`);
  }
}

if (failed) {
  console.log(`\n${failed} mage attack fx check(s) failed`);
  process.exit(1);
}
console.log('\nmage attack fx holds: charge in every windup, blast above and over the monster');
