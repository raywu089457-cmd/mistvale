// monster-presentation.mjs — 魔物演出升級(pixelfx 技法)驗收。
//
// Headless:跟 tools/checks/hit-feel.mjs 同一套 DOM/Canvas stub,載入真的 src/pixel-world.js +
// src/pixel-game.js(以及真的 assets/monsters3/*.json meta),逐幀驅動 world.update()/game.tick()
// 並讀 __mistvaleFacing() / __mistvaleIso() 兩個 debug hook。證明:
//   1. 出手用「實際攻擊方向」那條攻擊列(8 方向),首領 treant 沒有方向列 → 退回側面 attack;
//   2. 打擊格的幀號 = meta.release + 經過的格數(0.075 秒/格),命中格凍結 1~2 幀(重擊怪更久);
//   3. 傷害/受擊閃光落在命中格(impact,≈0.075 秒),不再是寫死的 0.1 秒;出手節奏 attackTimer 不變;
//   4. 重擊怪 / 首領命中時真的播 ground-slam-iso,首領另外加大鏡頭震動;
//   5. 遠程魔物蓄力時腳下亮起 magic-circle-cast-iso(小尺度);蓄力長度:普通 0.3 s、重擊 0.42 s、首領 0.55 s。
// Exit: 0 = 全部成立,1 = 印出 FIX 行。
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
globalThis.matchMedia = () => ({ matches: false, addEventListener () {}, removeEventListener () {} });
globalThis.location = { search: '?renderer=2d' };
globalThis.innerWidth = 1440;
globalThis.innerHeight = 900;
globalThis.devicePixelRatio = 1;
globalThis.screen = { width: 1440, height: 900 };

// ── assets:真的 22 張魔物 sheet + 用到的 iso 特效表 ────────────────────────
const MON_DIR = path.join(ROOT, 'assets/monsters3');
const MON_IDS = fs.readdirSync(MON_DIR).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')).sort();
const ISO_SHEETS = ['ground-slam-iso', 'magic-circle-cast-iso', 'hit-spark-iso', 'soul-rise-iso', 'coin-drop-iso'];
globalThis.PIXEL_ASSETS = {
  vfxSheets: Object.fromEntries(ISO_SHEETS.map(id => [id, { img: `assets/vfx-sheets/${id}.png`, meta: readJSON(`assets/vfx-sheets/${id}.json`) }])),
  heroSheets: { berserker: { img: 'assets/heroes/berserker.png', meta: readJSON('assets/heroes/berserker.json') } },
  monsterSheets: Object.fromEntries(MON_IDS.map(id => [id, { img: `assets/monsters3/${id}.png`, meta: readJSON(`assets/monsters3/${id}.json`) }])),
  ui: {},
};

const { createWorld } = await import(pathToFileURL(path.join(ROOT, 'src/pixel-world.js')).href);
const { createGame } = await import(pathToFileURL(path.join(ROOT, 'src/pixel-game.js')).href);

const canvas = documentStub.createElement('canvas');
canvas.width = 1440; canvas.height = 900;
const world = createWorld(canvas);
const game = createGame(null);
const S = game.state;

let failures = 0;
const fix = (rule, detail) => { failures++; console.log(`FIX monster-presentation ${rule} — ${detail}`); };
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// meta 常數(22 張 sheet 都是這組;第二段會逐張驗)
const REL = 4, IMP = 5, FT = 0.075, CONTACT = (IMP - REL) * FT;
const HEAVY_SLAM = new Set(['boulder', 'yeti', 'moss', 'boss']);
const holdMs = type => HEAVY_SLAM.has(type) ? 0.07 * 1.7 : 0.07;
const expectFrame = (at, type) => {
  const hold = holdMs(type);
  let a = at;
  if (a >= CONTACT + hold) a -= hold; else if (a >= CONTACT) a = CONTACT;
  return Math.min(7, REL + Math.floor(a / FT));
};

// ── 0) sheet meta:22 張都有 idle/walk/attack/hurt/death,21 隻有 3 條方向攻擊列(Down/Left/Up;2026-11-13 4 方向後斜向列已修剪,計畫 2.8) ──
const DIR_ACTS = ['attackDown', 'attackLeft', 'attackUp'];
const DIAG_ROW = /(DownRight|DownLeft|UpLeft|UpRight)$/;
if (MON_IDS.length !== 22) fix('meta', `found ${MON_IDS.length} monster sheets, want 22 (${MON_IDS.join(',')})`);
for (const id of MON_IDS) {
  const a = readJSON(`assets/monsters3/${id}.json`).actions || {};
  for (const need of ['idle', 'walk', 'attack', 'hurt', 'death']) if (!a[need]) fix('meta', `${id} sheet has no ${need} action`);
  const atk = a.attack || {};
  if (atk.release !== REL || atk.impact !== IMP || !close(atk.frameTime, FT)) fix('meta', `${id} attack row release/impact/frameTime = ${atk.release}/${atk.impact}/${atk.frameTime}, want ${REL}/${IMP}/${FT}`);
  const dirs = DIR_ACTS.filter(d => a[d]).length;
  if (id === 'treant') { if (dirs !== 0) fix('meta', `treant has ${dirs} directional attack rows, want 0 (side row only)`); }
  else if (dirs !== 3) fix('meta', `${id} has ${dirs}/3 directional attack rows`);
  const diag = Object.keys(a).filter(k => DIAG_ROW.test(k));
  if (diag.length) fix('meta', `${id} still ships diagonal rows ${diag.join(',')} (trimmed in plan 2.8)`);
}

// ── world-level probe:一台固定的魔物,讀 drawnFacing 的 act/i ──────────────
const face = id => globalThis.__mistvaleFacing()['enemy:' + id] || null;
let probeSeq = 0;
function probe ({ type = 'boar', at = null, attackTimer = 5, dx = 1, dz = 0, hp = 100, extra = {} } = {}) {
  const id = 'p' + (++probeSeq);
  const e = {
    id, type, x: 30, z: 30, hp, maxHp: Math.max(hp, 100), attack: 5, defense: 0, speed: 1, regionId: 'meadow',
    engaged: true, facingX: 30 + dx, facingZ: 30 + dz, attackTimer, atkAt: -99, hitAt: -99, rewarded: false, ...extra,
  };
  if (at != null) { e.atkAt = S.time - at; e.atkX = 30 + dx; e.atkZ = 30 + dz; }
  S.enemies = [e]; S.hunters = []; S.effects = []; S.shake = null; S.hitstop = null;
  world.lookAt(30, 30);   // drawEnemy 先做畫面外剔除;把鏡頭放到魔物身上才畫得到
  world.update(1 / 60, S);
  return { e, face: face(id) };
}
// 每次探測前先跑一格 idle:drawEnemy 會把 avdir 清掉(出手方向在一擊內上鎖)。
const idleReset = () => probe({ at: null, attackTimer: 9 });

S.time = 500;

// ── 1) 4 方向攻擊列(2026-11-13 起遊戲是 4 方向,docs/DV2-ADOPTION-PLAN.md Phase 2.4):8 方向 sheet 只用 attack / attackDown / attackLeft / attackUp
// (dx,dz) → moveDir 的方位(iso 投影:Sx=(dx-dz)9, Sy=(dx+dz)4.5;主軸優先)。世界軸 (1,0)/(0,1)… 在畫面上是斜的 → 落到左右(橫軸 9 > 縱軸 4.5)
const DIRS = [
  ['right', 1, -1, 'attack'], ['world +x (screen down-right)', 1, 0, 'attack'], ['down', 1, 1, 'attackDown'],
  ['world +z (screen down-left)', 0, 1, 'attackLeft'], ['left', -1, 1, 'attackLeft'], ['world -x (screen up-left)', -1, 0, 'attackLeft'],
  ['up', -1, -1, 'attackUp'], ['world -z (screen up-right)', 0, -1, 'attack'],
];
for (const [name, dx, dz, want] of DIRS) {
  idleReset();
  const { face: f } = probe({ type: 'boar', at: 0.02, dx, dz });
  if (!f?.act) fix('dir-row', `${name}: the monster was not drawn (no drawnFacing entry)`);
  else if (f.act !== want) fix('dir-row', `${name}: attack used row ${f.act}, want ${want}`);
  else if (typeof f.i !== 'number' || !(f.i >= REL)) fix('dir-row', `${name}: frame ${f.i}, want >= release ${REL}`);
}
// 首領 treant 只有側面 attack 列 → 任何方向都退回 attack(不能變成 attackDown… 然後畫不出來)
for (const [name, dx, dz] of DIRS) {
  idleReset();
  const { face: f } = probe({ type: 'boss', at: 0.02, dx, dz });
  if (f?.act !== 'attack') fix('dir-row-boss', `${name}: treant used row ${f?.act}, want plain attack (no directional rows)`);
}

// ── 2) 打擊格 = meta.release + floor(elapsed / frameTime),命中格凍結 ────────
for (const [type, ats] of [
  ['boar', [0.01, 0.05, 0.074, 0.08, 0.1, 0.13, 0.15, 0.2, 0.28, 0.34]],
  ['boulder', [0.08, 0.1, 0.15, 0.19, 0.2, 0.25, 0.34]],   // 重擊怪:凍結 1.7 倍長
]) {
  for (const at of ats) {
    idleReset();
    const { face: f } = probe({ type, at, dx: 1, dz: 0 });
    const want = expectFrame(at, type);
    if (f?.act !== 'attack') fix('strike-frame', `${type} @${at}s used row ${f?.act}, want attack (4 directions: world +x = screen right)`);
    else if (f.i !== want) fix('strike-frame', `${type} @${at}s frame ${f.i}, want ${want} (release ${REL}, contact ${CONTACT}s)`);
  }
}
// 出手動作在 0.36 s 後結束(動畫窗口沒變,只有命中格往前移)
{ idleReset(); const { face: f } = probe({ type: 'boar', at: 0.37 }); if (f?.act === 'attack') fix('strike-window', `still striking at 0.37s (${f?.act})`); }

// ── 3) 傷害/受擊落在命中格:真遊戲 tick,attackTimer 節奏不變 ────────────────
function combatGame (type, gap = 1.5) {
  const g = createGame();
  const st = g.state;
  const h = st.hunters[0];
  st.hunters = [h]; st.wanderers = []; st.spawnTimer = -999;
  for (const k in st.regionSpawn) st.regionSpawn[k] = -999;
  const proto = st.enemies.find(e => e.regionId === 'meadow') || st.enemies[0];
  Object.assign(h, { x: proto.x, z: proto.z, task: 'pilot', route: [], hp: h.maxHp, attack: 1, attackTimer: 999, lockUntil: 0 });
  const e = { ...proto, id: 'm1', type, x: proto.x + gap, z: proto.z, hp: 999, maxHp: 999, attack: 30, attackTimer: 0, rewarded: false };
  st.enemies = [e];
  const keep = () => { st.spawnTimer = -999; for (const k in st.regionSpawn) st.regionSpawn[k] = -999; st.enemies = [e]; };
  keep();
  return { g, st, h, e, keep };
}

for (const [type, wantTimer] of [['boar', 1.8 / 1.3], ['boss', 1.5 / 1.3]]) {
  const { g, st, h, e, keep } = combatGame(type, type === 'boss' ? 2 : 1.5);
  const hp0 = h.hp, time0 = st.time;
  keep(); g.tick(1 / 60);
  const hit = st.effects.find(f => f.type === 'hit' && f.by === type);
  if (!hit) fix('impact-delay', `${type}: no hit effect on the attack tick (probe is vacuous)`);
  else if (!close(hit.delay, CONTACT, 1e-9)) fix('impact-delay', `${type}: hit effect delay ${hit.delay}s, want ${CONTACT}s (impact frame)`);
  if (e.atkAt == null || !(e.atkAt >= time0)) fix('impact-delay', `${type}: attack start atkAt ${e.atkAt} was not stamped`);
  if (!close(e.attackTimer, wantTimer, 1e-9)) fix('cadence', `${type}: attackTimer ${e.attackTimer}, want ${wantTimer} (cadence must not change)`);
  if (h.hp !== hp0) fix('impact-delay', `${type}: damage landed ${((st.time - e.atkAt) * 1000).toFixed(0)}ms before the contact frame`);

  // 逐幀推進到命中:血量下降的那一刻就是命中格(hitAt 由 landHits 蓋在當下的 state.time)
  let landed = null;
  for (let i = 0; i < 30 && landed == null; i++) { keep(); g.tick(1 / 60); if (h.hp < hp0) landed = h.hitAt; }
  if (landed == null) fix('impact-delay', `${type}: damage never landed within 0.5s (probe is vacuous)`);
  else {
    const off = Math.abs((landed - e.atkAt) - CONTACT);
    if (off > 1 / 60 + 1e-6) fix('impact-delay', `${type}: damage landed ${(off * 1000).toFixed(1)}ms away from the contact frame, want within one 60Hz frame`);
    // 命中那一格畫的就是 impact 幀(=release+1,凍結中)
    world.lookAt(e.x, e.z);
    world.update(1 / 60, st);
    const f = face('m1');
    if (f?.i !== IMP) fix('impact-frame', `${type}: drawn frame ${f?.i} on the landing tick, want the impact frame ${IMP}`);
  }
  void g;
}

// ── 4) 重擊怪 / 首領:ground-slam-iso,首領加大鏡頭震動 ──────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (const type of ['boulder', 'boss']) {
  const { g, st, h, e, keep } = combatGame(type, type === 'boss' ? 2 : 1.5);
  const hp0 = h.hp;
  keep(); g.tick(1 / 60);
  if (e.atkAt == null) fix('slam', `${type}: never attacked (probe is vacuous)`);
  if (type === 'boss') {
    if (st.shake?.amp !== 5.5 || st.shake?.ms !== 320) fix('boss-shake', `boss attack requested shake ${JSON.stringify(st.shake)}, want amp 5.5 / 320ms`);
  }
  globalThis.__mistvaleIsoClear();
  let slam = false;
  for (let i = 0; i < 20 && !slam; i++) {
    keep(); g.tick(1 / 60);
    // 首領命中有 90ms 停格:等它過去才畫得到命中幀(停格期間 world.update 會整幀跳過)
    await sleep(30);
    world.lookAt(e.x, e.z);
    world.update(1 / 60, st);
    if (globalThis.__mistvaleIso().seen.includes('ground-slam-iso')) slam = true;
  }
  if (!slam) fix('slam', `${type}: ground-slam-iso never played around the landing frame (damage landed: ${h.hp < hp0})`);
  if (type === 'boss' && !st.effects.some(f => f.type === 'hit' && f.by === 'boss')) fix('slam', 'boss hit effect missing (probe is vacuous)');
  void g;
}

// ── 5) 遠程魔物:蓄力時腳下小魔法陣;蓄力長度 普通 .3 / 重擊 .42 / 首領 .55 ──
for (const type of ['sprout', 'shroom', 'moss', 'snowman', 'kobold', 'cactus', 'floraspirit']) {
  idleReset();
  globalThis.__mistvaleIsoClear();
  probe({ type, at: null, attackTimer: 0.2, dx: 1, dz: 0 });
  if (!globalThis.__mistvaleIso().seen.includes('magic-circle-cast-iso')) fix('ranged-telegraph', `${type}: no magic-circle-cast-iso under the monster while charging`);
  // 蓄力結束就不該再畫:普通魔物 0.3 秒、重擊怪 0.42 秒,所以門檻分開取
  const over = HEAVY_SLAM.has(type) ? 0.45 : 0.35;
  idleReset();
  globalThis.__mistvaleIsoClear();
  probe({ type, at: null, attackTimer: over, dx: 1, dz: 0 });
  if (globalThis.__mistvaleIso().seen.includes('magic-circle-cast-iso')) fix('ranged-telegraph', `${type}: cast circle still drawn at attackTimer ${over} (windup already over)`);
}
// 真遊戲裡也要看得到:遠程魔物的 engaged 永遠是 false(用 attackTimer 當冷卻),蓄力不能只活在探針裡
{
  const { g, st, h, e, keep } = combatGame('sprout', 3);
  e.attackTimer = 0.2; keep(); g.tick(1 / 60);
  globalThis.__mistvaleIsoClear();
  world.lookAt(e.x, e.z);
  world.update(1 / 60, st);
  const f = face('m1');
  if (!String(f?.act || '').startsWith('attack')) fix('ranged-live', `sprout in a real tick used row ${f?.act}, want a windup attack row (engaged=${e.engaged})`);
  if (!globalThis.__mistvaleIso().seen.includes('magic-circle-cast-iso')) fix('ranged-live', 'sprout cast circle never painted by a real game tick (windup only reachable from the probe)');
  e.attackTimer = 0.9; keep(); g.tick(1 / 60);
  globalThis.__mistvaleIsoClear();
  world.lookAt(e.x, e.z);
  world.update(1 / 60, st);
  if (globalThis.__mistvaleIso().seen.includes('magic-circle-cast-iso')) fix('ranged-live', `sprout cast circle painted with ${e.attackTimer.toFixed(2)}s of cooldown left (windup too long)`);
  void g; void h;
}


// 蓄力長度:普通魔物 0.35 秒前就結束;重擊怪 0.42、首領 0.55 還在蓄力(act 還停在攻擊列)
for (const [type, timer, wantWindup] of [['boar', 0.35, false], ['boulder', 0.4, true], ['boss', 0.5, true]]) {
  idleReset();
  const { face: f } = probe({ type, at: null, attackTimer: timer, dx: 1, dz: 0 });
  const winding = String(f?.act || '').startsWith('attack');
  if (winding !== wantWindup) fix('windup-len', `${type} @attackTimer ${timer}s ${winding ? 'is' : 'is not'} in windup, want ${wantWindup ? 'windup' : 'idle'}`);
}

// ── summary ───────────────────────────────────────────────────────────────
S.enemies = []; S.effects = [];
if (failures) {
  console.log(`FAIL monster-presentation: ${failures} rule(s) broken`);
  process.exit(1);
}
console.log(`PASS monster-presentation: ${MON_IDS.length} sheets, 8 probe directions → 4 attack rows (+treant side fallback), strike frame = release+elapsed with a 1.7x hold on heavy hitters, damage/flash on the impact frame (${CONTACT}s, 60Hz-accurate), ground-slam-iso on boulder/boss (boss shake 5.5/320ms), cast circle for all 7 ranged monsters, windup .3/.42/.55s`);
