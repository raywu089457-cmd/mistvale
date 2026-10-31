// Application controller: one render loop, one state object, every control wired to it.
import * as THREE from 'three';
import { buildModel } from '../model/index.js';
import { STAGES, TIMELINE_END, buildSchedule } from '../model/schedule.js';
import { standardsReport } from '../model/report.js';
import { GROUP_NAMES } from '../model/explode.js';
import { buildScene } from '../render/scene.js';
import { CameraRig, PRESETS } from './camera.js';
import { createPicker } from './picking.js';
import { COUPLER, BAR_SIZES, barUnitMass, RULE_TEXT, COVER, GEOM } from '../standards.js';

const $ = (id) => document.getElementById(id);
const canvas = $('view');

// ---------------------------------------------------------------- renderer & model
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.05, 700);
const model = buildModel();
const world = buildScene(model, { renderer });
model.schedule = { stages: STAGES, end: TIMELINE_END };
const rig = new CameraRig({ camera, canvas, collision: world.collision, floorAt: () => 0 });
const picker = createPicker(model);
const report = standardsReport(model);
rig.applyPreset('cinematic', 0);

// ---------------------------------------------------------------- state
const LAYERS = [
  ['column', 'Columns', '#7aa2f7'],
  ['beam', 'Beams', '#9ece6a'],
  ['slab', 'Slabs', '#e0af68'],
  ['gb', 'Ground beams', '#bb9af7'],
  ['joint', 'Joint hoops', '#f7768e'],
  ['coupler', 'Couplers', '#2ac3de'],
  ['spacer', 'Spacers', '#c0caf5'],
  ['formwork', 'Formwork', '#c8a46a'],
  ['concrete', 'Concrete', '#9aa0a6'],
  ['context', 'Site context', '#7f8c99'],
];
const STOREYS = [
  { id: 'all', label: 'All', bands: [true, true, true] },
  { id: 's1', label: 'GB + 1F', bands: [true, false, false] },
  { id: 's2', label: '2F frame', bands: [false, true, false] },
  { id: 'roof', label: 'Roof', bands: [false, false, true] },
];
const S = {
  t: 0,
  speed: 0.5,
  speedCur: 0.5,
  playing: true,
  explode: 0,
  explodeTarget: 0,
  explodeCur: 0,
  cutaway: false,
  layers: Object.fromEntries(LAYERS.map(([k]) => [k, true])),
  bands: [true, true, true],
  storey: 'all',
  sel: null,           // {kind:'bar'|'coupler'|'spacer'|'member', id, member}
};
S.layers.spacer = true;
playBtnInit();
function playBtnInit() {
  const b = document.getElementById('play');
  b.textContent = 'Pause';
  b.setAttribute('aria-pressed', 'true');
}

// ---------------------------------------------------------------- DOM: stages, layers, storeys, presets
const stagesEl = $('stages');
STAGES.forEach((st, i) => {
  const b = document.createElement('button');
  b.dataset.start = String(st.start);
  b.innerHTML = `<span class="n">${i + 1}</span>${st.label}`;
  b.title = `${st.label}: ${fmtTime(st.start)}–${fmtTime(st.start + st.dur)}`;
  b.addEventListener('click', () => { S.t = st.start; $('scrub').value = S.t; });
  stagesEl.appendChild(b);
});

const layersEl = $('layers');
for (const [key, label, colour] of LAYERS) {
  const lab = document.createElement('label');
  lab.innerHTML = `<input type="checkbox" data-layer="${key}" ${S.layers[key] ? 'checked' : ''}><span class="sw" style="background:${colour}"></span>${label}`;
  lab.querySelector('input').addEventListener('change', (e) => { S.layers[key] = e.target.checked; applyLayers(); });
  layersEl.appendChild(lab);
}

const storeysEl = $('storeys');
for (const s of STOREYS) {
  const b = document.createElement('button');
  b.textContent = s.label;
  b.dataset.storey = s.id;
  b.setAttribute('aria-pressed', s.id === S.storey ? 'true' : 'false');
  b.addEventListener('click', () => {
    S.storey = s.id; S.bands = s.bands.slice();
    for (const x of storeysEl.children) x.setAttribute('aria-pressed', x.dataset.storey === s.id ? 'true' : 'false');
    applyLayers();
  });
  storeysEl.appendChild(b);
}

const presetsEl = $('presets');
for (const [key, p] of Object.entries(PRESETS)) {
  const b = document.createElement('button');
  b.textContent = p.label;
  b.addEventListener('click', () => rig.applyPreset(key));
  presetsEl.appendChild(b);
}

function applyLayers() {
  world.setLayers(S.layers, S.bands);
}
applyLayers();

// ---------------------------------------------------------------- DOM: transport and sliders
const playBtn = $('play');
function setPlaying(on) {
  if (on && S.t >= TIMELINE_END - 1e-6) S.t = 0;
  S.playing = on;
  playBtn.textContent = on ? 'Pause' : 'Play';
  playBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
}
playBtn.addEventListener('click', () => setPlaying(!S.playing));
$('restart').addEventListener('click', () => { S.t = 0; $('scrub').value = 0; setPlaying(true); });
$('slowmo').addEventListener('click', () => {
  // inspect the tying order at one 2F joint: slow playback from the start of the 2F frame, camera on the joint
  S.speed = 0.08;
  $('speed').value = String(S.speed);
  S.t = STAGES[2].start;
  $('scrub').value = S.t;
  rig.applyPreset('joint');
  setPlaying(true);
});
$('speed').addEventListener('input', (e) => { S.speed = +e.target.value; });
$('scrub').addEventListener('input', (e) => { S.t = +e.target.value; });
$('explode').addEventListener('input', (e) => { S.explodeTarget = +e.target.value; S.explode = S.explodeTarget; S.explodeCur = S.explodeTarget; });
$('explodeBtn').addEventListener('click', () => { S.explodeTarget = 3; });
$('assembleBtn').addEventListener('click', () => { S.explodeTarget = 0; });
$('cutaway').addEventListener('change', (e) => { S.cutaway = e.target.checked; world.setCutaway(S.cutaway); });
$('resetCam').addEventListener('click', () => rig.applyPreset('cinematic'));
$('walk').addEventListener('click', () => toggleWalk());
$('clearSel').addEventListener('click', () => select(null));

function toggleWalk(force) {
  const on = force === undefined ? rig.mode !== 'walk' : force;
  rig.setMode(on ? 'walk' : 'orbit');
  $('walk').setAttribute('aria-pressed', on ? 'true' : 'false');
  if (on) rig.lockPointer();
}

// ---------------------------------------------------------------- standards panel
const checksEl = $('checks');
{
  const passN = report.filter((c) => c.pass).length;
  $('standardsSum').textContent = `${passN} / ${report.length} pass`;
}
for (const c of report) {
  const li = document.createElement('li');
  li.innerHTML = `<span class="${c.pass ? 'ok' : 'flag'}">${c.pass ? '✓' : '!'}</span><div><div class="k">${c.label}${c.drawing && c.drawing !== '—' ? ` · ${c.drawing}` : ''}</div><div class="v">${c.value}</div><div class="note">${c.note || ''}</div></div>`;
  checksEl.appendChild(li);
}

// ---------------------------------------------------------------- picking & inspector
const ray = new THREE.Vector2();
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  down = null;
  if (moved > 4) return;
  if (rig.mode === 'walk') {
    if (!rig.locked) { rig.lockPointer(); return; }
    ray.set(0, 0);
  } else {
    const r = canvas.getBoundingClientRect();
    ray.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  const v = new THREE.Vector3(ray.x, ray.y, 0.5).unproject(camera);
  const origin = camera.position.clone();
  const dir = v.sub(origin).normalize();
  const hit = picker.pick([origin.x, origin.y, origin.z], [dir.x, dir.y, dir.z], {
    t: S.t, explode: S.explodeCur, layers: S.layers, bands: S.bands, cutaway: S.cutaway,
  });
  select(hit);
});

function select(hit) {
  S.sel = hit;
  const body = $('inspectBody');
  if (!hit) {
    body.innerHTML = 'Click a bar, coupler, spacer or member to read its drawing reference, marks, quantity, weight and governing rule.';
    return;
  }
  if (hit.kind === 'bar') body.innerHTML = describeBar(model.bars[hit.id]);
  else if (hit.kind === 'coupler') body.innerHTML = describeCoupler(model.couplers[hit.id]);
  else if (hit.kind === 'spacer') body.innerHTML = describeSpacer(model.spacers[hit.id]);
  else body.innerHTML = describeMember(model.members[hit.id]);
}

function selectedMemberId() {
  return S.sel ? (S.sel.kind === 'member' ? S.sel.id : S.sel.member) : -1;
}

const KIND_LABEL = {
  main: 'Column main bar', dowel: 'Column dowel (starter into ground beam)', tie: 'Column closed tie', crosstie: 'Crosstie (繫筋)',
  beamTop: 'Beam top bar (90° anchorage)', beamBot: 'Beam bottom bar (90° anchorage)', stirrup: 'Closed stirrup', trimmer: 'Penetration trimmer',
  gbTop: 'Ground beam top bar', gbBot: 'Ground beam bottom bar', gbStir: 'Ground beam stirrup',
  slabB1: 'Slab bottom mat (lower)', slabB2: 'Slab bottom mat (upper)', slabT1: 'Slab top mat over support (E)', slabT2: 'Slab top mat over support (N)', slabCorner: 'Corner reinforcement',
};
const fmtKg = (x) => `${x.toFixed(2)} kg`;
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function describeBar(b) {
  const m = model.members[b.member];
  const metric = BAR_SIZES[b.size].metric;
  const sameMark = (m.bars || []).map((id) => model.bars[id]).filter((x) => x.mark === b.mark && x.kind === b.kind).length;
  const extra = [];
  if (b.kind === 'tie') extra.push(['Level', `z ${(b.z).toFixed(3)} m above datum`], ['Zone / spacing', `${b.zone} · ${(b.spacing * 1000).toFixed(0)} mm`], ['Hooks', `${(b.hooks[0] * 180 / Math.PI).toFixed(0)}° / ${(b.hooks[1] * 180 / Math.PI).toFixed(0)}°`]);
  if (b.kind === 'stirrup') extra.push(['Station', `${b.station.toFixed(2)} m from column face`], ['Zone / spacing', `${b.zone} · ${(b.spacing * 1000).toFixed(0)} mm`], ['Hooks', `${(b.hooks[0] * 180 / Math.PI).toFixed(0)}° / ${(b.hooks[1] * 180 / Math.PI).toFixed(0)}°`]);
  if (b.kind === 'crosstie') extra.push(['Level', `z ${(b.z).toFixed(3)} m`], ['Hooks', `${(b.hooks[0] * 180 / Math.PI).toFixed(0)}° / ${(b.hooks[1] * 180 / Math.PI).toFixed(0)}°`]);
  if (b.kind === 'main' || b.kind === 'dowel') extra.push(['Perimeter bar', `${b.perimeter + 1} of 12`]);
  return `
    <h3>${esc(b.label)}</h3>
    <div class="kv">
      <div>Part</div><div>${KIND_LABEL[b.kind] || esc(b.kind)}</div>
      <div>Drawing</div><div>${esc(b.drawing)}</div>
      <div>Bar mark</div><div>${esc(b.mark)}</div>
      <div>Bar size</div><div>${b.size} · Ø${(b.dia * 1000).toFixed(2)} mm (${metric})</div>
      <div>Length</div><div>${b.length.toFixed(3)} m</div>
      <div>Mass</div><div>${fmtKg(b.weight)} at ${barUnitMass(b.size).toFixed(3)} kg/m</div>
      <div>Quantity</div><div>${sameMark} pcs of this mark in ${esc(m.name)}</div>
      <div>Tied</div><div>${fmtTime(b.t0)} on the timeline</div>
      ${extra.map(([k, v]) => `<div>${k}</div><div>${v}</div>`).join('')}
    </div>
    <div class="rule"><b>Governing rule:</b> ${esc(b.rule)}</div>`;
}

function describeCoupler(c) {
  const m = model.members[c.member];
  const db = c.db;
  return `
    <h3>${esc(c.label)}</h3>
    <div class="kv">
      <div>Part</div><div>Mechanical coupler (sleeve + rubber end caps)</div>
      <div>Drawing</div><div>${esc(c.drawing)}</div>
      <div>Grade</div><div><span class="swatch" style="background:#${COUPLER.grades[c.grade].color.toString(16).padStart(6, '0')}"></span>${c.grade}</div>
      <div>Bar</div><div>#7 (Ø${(db * 1000).toFixed(2)} mm)</div>
      <div>Sleeve</div><div>${(c.size * 1000).toFixed(1)} mm long (3.5 db) · Ø${(c.od * 1000).toFixed(1)} mm (1.8 db)</div>
      <div>Splice height</div><div>${c.height.toFixed(3)} m above datum</div>
      <div>Stagger</div><div>≥ 600 mm to the neighbouring bar's coupler (perimeter-adjacent bars alternate 0.75 m)</div>
      <div>Member</div><div>${esc(m.name)}</div>
      <div>Tied</div><div>${fmtTime(c.t0)} on the timeline</div>
    </div>
    <div class="rule"><b>Governing rule:</b> ${esc(c.rule)}. Clear cover from the sleeve to the concrete face is 40.6 mm against 2db = 44.5 mm: flagged in Standards.</div>`;
}

function describeSpacer(s) {
  const m = model.members[s.member];
  return `
    <h3>Concrete spacer block</h3>
    <div class="kv">
      <div>Part</div><div>Spacer (墊塊), concrete</div>
      <div>Drawing</div><div>${esc(s.drawing)}</div>
      <div>Size (L × H × W)</div><div>${s.size.map((v) => (v * 100).toFixed(1)).join(' × ')} cm</div>
      <div>Member</div><div>${esc(m.name)}</div>
      <div>Tied</div><div>${fmtTime(s.t0)} on the timeline</div>
    </div>
    <div class="rule"><b>Governing rule:</b> ${esc(s.rule)}</div>`;
}

function describeMember(m) {
  const bars = (m.bars || []).map((id) => model.bars[id]);
  const kg = bars.reduce((a, b) => a + b.weight, 0);
  const byMark = new Map();
  for (const b of bars) {
    const k = `${b.mark}|${b.kind}`;
    const r = byMark.get(k) || { mark: b.mark, kind: b.kind, size: b.size, n: 0, len: 0, kg: 0 };
    r.n += 1; r.len += b.length; r.kg += b.weight;
    byMark.set(k, r);
  }
  const rows = [...byMark.values()].sort((a, b) => b.kg - a.kg);
  const rules = [...new Set(bars.map((b) => b.rule))];
  const vol = (m.box.max[0] - m.box.min[0]) * (m.box.max[1] - m.box.min[1]) * (m.box.max[2] - m.box.min[2]);
  const bandName = model.bandNames[m.band];
  const assumed = assumedNotes(m);
  const sch = m.sched;
  return `
    <h3>${esc(m.name)}</h3>
    <div class="kv">
      <div>Type</div><div>${m.kind === 'GB' ? 'Ground beam' : m.kind === 'COL' ? 'Column' : m.kind === 'BEAM' ? 'Beam' : 'Slab panel'}</div>
      <div>Storey band</div><div>${esc(bandName)}</div>
      <div>Structural cell</div><div>${esc(cellName(m))}</div>
      <div>Bars</div><div>${bars.length} pieces · ${kg.toFixed(1)} kg rebar</div>
      <div>Couplers / spacers</div><div>${(m.couplers || []).length} / ${(m.spacers || []).length}</div>
      <div>Concrete (gross)</div><div>${vol.toFixed(2)} m³</div>
      <div>Timeline</div><div>rebar ${fmtTime(sch.tS)}–${fmtTime(sch.rebarEnd)} · form to ${fmtTime(sch.formEnd)} · pour to ${fmtTime(sch.pourEnd)}</div>
    </div>
    <h3>Bar schedule</h3>
    <table><tr><th>Mark</th><th>Type</th><th>Pcs</th><th>Length</th><th>kg</th></tr>
      ${rows.map((r) => `<tr><td>${esc(r.mark)}</td><td>${esc(KIND_LABEL[r.kind] || r.kind)}</td><td>${r.n}</td><td>${(r.len / r.n).toFixed(2)} m avg</td><td>${r.kg.toFixed(1)}</td></tr>`).join('')}
    </table>
    <h3>Governing rules</h3>
    ${rules.slice(0, 8).map((r) => `<div class="rule">${esc(r)}</div>`).join('')}
    ${assumed.length ? `<h3>Assumptions (not in brief)</h3>${assumed.map((a) => `<div class="rule" style="border-color:#8795a6">${esc(a)}</div>`).join('')}` : ''}`;
}

function cellName(m) {
  const lvl = m.kind === 'COL' ? (m.storey === 1 ? '1F' : '2F') : m.kind === 'GB' ? 'GB' : m.lvl;
  return `${lvl} · bay ${m.bay + 1} (X ${m.i + 1})`;
}

function assumedNotes(m) {
  const out = [];
  if (m.kind === 'GB') out.push(`Ground beam 60 × 70 cm and earth cover ${(COVER.groundBeamEarth.value * 100).toFixed(1)} cm are assumed; brief gives 40 × 70 for beams only.`);
  if (m.kind === 'SLAB') out.push(`Slab bars #4@200 both ways, two layers; top mat extent 0.25 L; Ld = max(0.30 m, 40 db) is a simplified assumed rule.`);
  if (m.kind === 'BEAM') out.push(`Beam top is 10 cm above the slab top so that Hn = 3.00 m holds with a 0.70 m beam (brief numbers).`);
  if (m.kind === 'COL') out.push(`Coupler clear cover 40.6 mm is below 2db = 44.5 mm at 4 cm cover: reported, not adjusted.`);
  return out;
}

function fmtTime(s) {
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${String(m).padStart(2, '0')}:${r.toFixed(1).padStart(4, '0')}`;
}

// ---------------------------------------------------------------- HUD
const statusEl = $('status');
const stageEl = $('stageName');
const timeOut = $('timeOut');
const speedOut = $('speedOut');
const explodeOut = $('explodeOut');
const explodeHint = $('explodeHint');
let frames = 0, acc = 0, fps = 0, statsStr = '';
let lastStageText = '';

function updateHUD(dt) {
  frames++; acc += dt;
  if (acc >= 0.5) {
    fps = frames / acc; frames = 0; acc = 0;
    const st = world.stats();
    statsStr = `${st.visible} draw calls · ${(st.tris / 1e6).toFixed(2)} M tris`;
  }
  $('scrub').value = S.t.toFixed(2);
  timeOut.textContent = `${fmtTime(S.t)} / ${fmtTime(TIMELINE_END)}`;
  speedOut.textContent = `${S.speedCur.toFixed(2)}×`;
  const cur = STAGES.find((st) => S.t >= st.start && S.t < st.start + st.dur) || STAGES[STAGES.length - 1];
  const text = S.t >= TIMELINE_END ? 'Frame complete' : `${cur.label}`;
  if (text !== lastStageText) { stageEl.textContent = text; lastStageText = text; }
  const e = S.explodeCur;
  explodeOut.textContent = e < 0.005 ? 'Assembled' : `${e.toFixed(2)}`;
  explodeHint.textContent = e < 1 ? 'Stage 1 · storeys' : e < 2 ? 'Stage 2 · members' : e < 2.999 ? 'Stage 3 · bar groups' : 'Fully exploded';
  if (document.activeElement !== $('explode')) $('explode').value = String(S.explodeCur);
  if (document.activeElement !== $('speed')) $('speed').value = String(S.speed);
  statusEl.textContent = `${fps.toFixed(0)} fps · ${statsStr} · ${model.bars.length} bars · ${rig.mode === 'walk' ? 'walk' : 'orbit'}`;
}

// ---------------------------------------------------------------- keyboard
window.addEventListener('keydown', (e) => {
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' && e.target.type !== 'checkbox') return;
  if (e.code === 'Space') { e.preventDefault(); setPlaying(!S.playing); }
  else if (e.key === 'r' || e.key === 'R') rig.applyPreset('cinematic');
  else if (e.key === 'c' || e.key === 'C') { $('cutaway').click(); }
  else if (e.key === 'e' || e.key === 'E') { S.explodeTarget = S.explodeTarget > 1.5 ? 0 : 3; }
  else if (e.key === 'a' || e.key === 'A') { if (rig.mode !== 'walk') S.explodeTarget = 0; }
  else if (e.key === 'Escape') toggleWalk(false);
  else if (e.key === 'w' && rig.mode !== 'walk') toggleWalk(true);
});

// ---------------------------------------------------------------- loop
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
let raf = 0;
// ?still: no continuous loop; the page renders only when asked (used by automated screenshots on software GL)
const STILL = new URLSearchParams(window.location.search).has('still');
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  step(dt);
  if (!STILL) raf = requestAnimationFrame(frame);
}
function step(dt) {
  S.speedCur += (S.speed - S.speedCur) * (1 - Math.exp(-dt * 5));
  if (Math.abs(S.speed - S.speedCur) < 1e-4) S.speedCur = S.speed;
  if (S.playing) {
    S.t = Math.min(TIMELINE_END, S.t + dt * S.speedCur);
    if (S.t >= TIMELINE_END) setPlaying(false);
  }
  S.explodeCur += (S.explodeTarget - S.explodeCur) * (1 - Math.exp(-dt * 4));
  if (Math.abs(S.explodeTarget - S.explodeCur) < 1e-4) S.explodeCur = S.explodeTarget;
  rig.update(dt);
  world.update(S.t, S.explodeCur, selectedMemberId());
  renderer.render(world.scene, camera);
  updateHUD(dt);
}
if (!STILL) raf = requestAnimationFrame(frame);
else { step(0); }

// tidy up when the page is left (lifecycle: nothing is leaked on normal reuse either)
window.addEventListener('pagehide', () => {
  cancelAnimationFrame(raf);
  rig.dispose();
  world.dispose();
  renderer.dispose();
});

// expose a small read-only handle for automated checks
window.__rcsim = {
  get state() { return { t: S.t, speed: S.speed, playing: S.playing, explode: S.explodeCur, cutaway: S.cutaway, layers: { ...S.layers }, sel: S.sel }; },
  setTime(t) { S.t = Math.max(0, Math.min(TIMELINE_END, t)); },
  setExplode(e) { S.explodeTarget = e; S.explodeCur = e; },
  setCutaway(on) { S.cutaway = on; $('cutaway').checked = on; world.setCutaway(on); },
  setPlaying,
  setSpeed(v) { S.speed = v; S.speedCur = v; },
  select,
  pickAt(px, py) {
    // pixel coordinates in the page, converted exactly as the pointer handler does
    const rc = canvas.getBoundingClientRect();
    const x = ((px - rc.left) / rc.width) * 2 - 1, y = -((py - rc.top) / rc.height) * 2 + 1;
    const v = new THREE.Vector3(x, y, 0.5).unproject(camera);
    const origin = camera.position.clone();
    const dir = v.sub(origin).normalize();
    return picker.pick([origin.x, origin.y, origin.z], [dir.x, dir.y, dir.z], { t: S.t, explode: S.explodeCur, layers: S.layers, bands: S.bands, cutaway: S.cutaway });
  },
  projectBar(id) {
    const p = picker.barAnchor(id, S.explodeCur);
    const w = new THREE.Vector3(p[0], p[1], p[2]);
    w.project(camera);
    const r = canvas.getBoundingClientRect();
    return { x: (w.x + 1) / 2 * r.width + r.left, y: (1 - w.y) / 2 * r.height + r.top };
  },
  renderNow(dt = 0) { step(dt); },
  camera, renderer, model, world, rig,
  stats: () => world.stats(),
  report,
  groups: GROUP_NAMES,
  GEOM,
  RULE_TEXT,
};
