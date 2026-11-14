// heroloom-lab.js — experimental inspector panel for the HeroLoom paper-doll engine.
// Mounted only with ?loom=1 (see src/pixel-ui.js); no top-level side effects — nothing is fetched
// or drawn unless mountHeroLoomLab() is called.
//
// Assets: assets/heroloom/ (copied to media/heroloom/ by build.mjs). The panel fetches character.json
// itself for the slot/part/palette inspector (falling back to the static tables in src/heroloom.js)
// and draws two ways:
//   * compose    — createDollHero().compose(), i.e. exactly the cell the game draws (default)
//   * bakeRecipe — an explicit {parts, colors} recipe through doll.bakeRecipe(), used when the
//                  inspector overrides a slot or a palette (gear toggles stay on the compose path)
//
// NOTE for the engine owner: heroloomLook()/heroloomRecipe() return colours keyed by palette RAMP
// (skin/hair/cloth/leather/eye); src/heroloom-hero.js accepts both conventions (slot key first, then
// ramp key), so either shape bakes correctly. This lab still sends slot keys because character.json's
// inspector is slot-oriented; the compose path is the authoritative "what the game draws" view.
import { trackImage } from './asset-loading.js';
import { createDollHero } from './heroloom-hero.js';
import {
  HEROLOOM_ACTIONS, HEROLOOM_ACTION_NAMES, HEROLOOM_BASE, HEROLOOM_CELL, HEROLOOM_CLASSES,
  HEROLOOM_COLUMNS, HEROLOOM_FOOT, HEROLOOM_LAYERS, HEROLOOM_PALETTES, HEROLOOM_SLOTS,
  heroloomActionKey, heroloomAf, heroloomFrameIndex, heroloomLook,
} from './heroloom.js';

// The 7 playable game classes first, then the pack-only extras (darkknight / warrior). The picker
// shows every class the pack can actually draw; default selection is a game class (paladin).
const GAME_CLASSES = ['archer', 'sorcerer', 'priest', 'paladin', 'berserker', 'assassin', 'traveler'];
const CLASS_IDS = [...GAME_CLASSES, ...(HEROLOOM_CLASSES || []).filter((c) => !GAME_CLASSES.includes(c))];
const CLASS_LABEL = { traveler: '旅人' };
const ACTION_NAMES = Array.isArray(HEROLOOM_ACTION_NAMES) && HEROLOOM_ACTION_NAMES.length
  ? HEROLOOM_ACTION_NAMES.slice()
  : ['idle', 'walk', 'attack', 'hurt', 'jump', 'cast', 'thrust', 'shoot'];
// Lab action buttons are ROW inspectors: each one forces a heroloom row through the DV2 facade, so
// all 8 pack rows are reachable whatever the class weapon is (the facade otherwise only exposes
// idle/walk/hurt/attack*/skill*/victory). `compose` is the DV2 action key that lands on that row.
const ROWS = {
  idle: { compose: 'idle', row: 0 },
  walk: { compose: 'walk', row: 1 },
  attack: { compose: 'attack.sword', row: 2 },
  hurt: { compose: 'hurt', row: 3 },
  jump: { compose: 'victory', row: 4 },
  cast: { compose: 'skill.staff', row: 5 },
  thrust: { compose: 'skill.dagger', row: 6 },
  shoot: { compose: 'skill.bow', row: 7 },
};
const DIRS = [['side', 'side →'], ['left', 'left ← mirror'], ['up', 'up ↑'], ['down', 'down ↓']];
const TICK_MS = 50;                              // engine tickRate 20 → one tick = 50 ms
const BIG = { w: 360, h: 300, k: 4.7, gx: 180, gy: 284 };
const THUMB = { w: 80, h: 70, k: 1.15, gy: 62 };
const CELL = Array.isArray(HEROLOOM_CELL) ? HEROLOOM_CELL : [64, 56];
const FOOT = Array.isArray(HEROLOOM_FOOT) ? { x: HEROLOOM_FOOT[0], y: HEROLOOM_FOOT[1] } : { x: 26, y: 51 };
const COLS = Number.isFinite(HEROLOOM_COLUMNS) ? HEROLOOM_COLUMNS : 8;
const GEAR = [
  ['helm', 'helm 頭盔'], ['armor', 'armor 護甲'], ['cape', 'cape 披風'], ['shield', 'shield 盾'],
  ['fine', 'weapon fine 精良'], ['gender', 'gender f 女性'], ['hideWeapon', 'hide weapon 收武器'],
];

/** Static stand-in for character.json (same content, validated by test-heroloom.mjs). */
function staticSpec() {
  return {
    cell: CELL, columns: COLS, actions: HEROLOOM_ACTIONS, layers: HEROLOOM_LAYERS,
    slots: Object.fromEntries(Object.entries(HEROLOOM_SLOTS).map(([s, d]) => [s, {
      color: d.color, required: !!d.required, coversHair: d.coversHair, colorFrom: d.colorFrom,
      parts: Object.fromEntries(Object.keys(d.parts || {}).map((id) => [id, { layers: {} }])),
    }])),
    palettes: Object.fromEntries(Object.entries(HEROLOOM_PALETTES).map(([r, p]) => [r, {
      base: p.base, variants: Object.fromEntries(p.variants.map((v) => [v, []])),
    }])),
  };
}

export function mountHeroLoomLab(opts = {}) {
  if (typeof document === 'undefined' || document.getElementById('heroloom-lab')) return null;
  const base = opts.base || (typeof HEROLOOM_BASE === 'function' ? HEROLOOM_BASE() : '')
    || globalThis.PIXEL_ASSETS?.heroloomBase || 'media/heroloom/';

  const st = {
    cls: 'paladin', action: ACTION_NAMES[0] || 'idle', dir: 'side', tick: 0, playing: true,
    helm: false, armor: false, cape: false, shield: false, fine: false, hideWeapon: false, gender: 'm',
    slot: '', parts: {}, colors: {},       // inspector overrides: slot → partId / slot → palette variant
    sheet: null, sheetOk: false, sheetErr: '',
  };
  let spec = staticSpec();
  let specFromFile = false;
  let specErr = '';
  let inspStamp = '';
  let thumbAt = -1e9;
  let raf = 0, last = 0, acc = 0, bakeToken = 0, prewarming = false, note = '';
  const bake = { calls: 0, lastMs: 0, totalMs: 0, err: '' };

  const doll = createDollHero({
    trackImage,
    base,
    onReady: () => { note = 'engine ready'; syncInspector(); },
    onEvict: () => {},
  });
  // String spec, same convention as the game: 'hero' = on for all classes; 'off' disables.
  try { doll.setSpec('hero'); } catch (e) { console.warn('[heroloom-lab] setSpec failed', e); }

  const root = document.createElement('div');
  root.id = 'heroloom-lab';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'HeroLoom lab');
  root.innerHTML = `
<style>
#heroloom-lab{position:fixed;left:8px;top:8px;z-index:2147483000;width:880px;max-width:calc(100vw - 16px);
  max-height:calc(100vh - 16px);overflow:auto;box-sizing:border-box;background:#15131cf2;color:#e8e4f0;
  font:12px/1.35 ui-monospace,Consolas,monospace;border:1px solid #4a4560;border-radius:6px;padding:8px;
  display:flex;flex-direction:column;gap:6px}
#heroloom-lab header{display:flex;align-items:center;gap:8px}
#heroloom-lab header b{font-size:13px;color:#e8c46a}
#heroloom-lab header .hl-status{color:#b8b2cc;margin-left:auto}
#heroloom-lab header .hl-path{color:#8fd3a0;border:1px solid #3d5b45;border-radius:3px;padding:0 4px;font-size:11px}
#heroloom-lab header .hl-path.rec{color:#e8c46a;border-color:#5b4a1e}
#heroloom-lab button,#heroloom-lab select{font:inherit;background:#2a2838;color:#e8e4f0;border:1px solid #4a4560;
  border-radius:4px;padding:2px 5px;min-height:26px;cursor:pointer}
#heroloom-lab button:hover{border-color:#8a7fb0}
#heroloom-lab button.on{background:#5b4a1e;border-color:#e8c46a;color:#ffe8b0}
#heroloom-lab select{min-height:24px}
#heroloom-lab canvas{image-rendering:pixelated;display:block}
#heroloom-lab .hl-main{display:flex;gap:8px}
#heroloom-lab .hl-stage{flex:0 0 360px;position:relative}
#heroloom-lab canvas.hl-big{width:360px;height:300px;background:#20242e;border:1px solid #2a2838}
#heroloom-lab .hl-side{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}
#heroloom-lab .hl-actions{display:grid;grid-template-columns:repeat(4,1fr);gap:3px}
#heroloom-lab .hl-actions button{min-height:26px;padding:2px;font-size:11px}
#heroloom-lab .hl-dirs,#heroloom-lab .hl-transport{display:grid;grid-template-columns:repeat(4,1fr);gap:3px}
#heroloom-lab .hl-dirs button{font-size:11px}
#heroloom-lab .hl-gear{display:grid;grid-template-columns:repeat(3,1fr);gap:2px 8px;font-size:11px;color:#c9c3d8}
#heroloom-lab .hl-gear label{display:flex;align-items:center;gap:4px}
#heroloom-lab .hl-gear input{margin:0}
#heroloom-lab .hl-info{white-space:pre-wrap;color:#b8b2cc;font-size:11px;line-height:1.32;overflow:auto;flex:1;min-height:76px}
#heroloom-lab .hl-thumbs{display:flex;gap:4px}
#heroloom-lab .hl-thumb{flex:1;background:none;border:1px solid transparent;border-radius:4px;padding:1px 0 0;
  display:flex;flex-direction:column;align-items:center;min-width:0;min-height:0}
#heroloom-lab .hl-thumb canvas{width:80px;height:70px;background:#20242e}
#heroloom-lab .hl-thumb span{font-size:10px;color:#c9c3d8;line-height:1.2;white-space:nowrap}
#heroloom-lab .hl-thumb.on{background:#5b4a1e;border-color:#e8c46a}
#heroloom-lab .hl-insp{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
#heroloom-lab .hl-insp label{display:inline-flex;gap:4px;align-items:center;color:#c9c3d8}
#heroloom-lab .hl-note{color:#8f89a6;font-size:11px;flex:1;min-width:120px}
#heroloom-lab .hl-perf{display:flex;align-items:center;gap:8px;color:#8f89a6;font-size:11px}
#heroloom-lab .hl-perf span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
</style>
<header><b>HeroLoom lab</b><span class="hl-path" data-x="path">compose</span>
  <span class="hl-status" data-x="status">loading…</span><button data-x="close" aria-label="close">✕</button></header>
<div class="hl-main">
  <div class="hl-stage"><canvas class="hl-big" data-x="big" width="${BIG.w}" height="${BIG.h}"></canvas></div>
  <div class="hl-side">
    <div class="hl-actions" data-x="actions"></div>
    <div class="hl-dirs" data-x="dirs"></div>
    <div class="hl-transport">
      <button data-x="play">⏸ pause</button><button data-x="prev" title="previous frame">◀ frame</button>
      <button data-x="next" title="next frame">frame ▶</button><button data-x="restart">⟲ 0</button>
    </div>
    <div class="hl-gear" data-x="gear"></div>
    <div class="hl-info" data-x="info">loading character.json…</div>
  </div>
</div>
<div class="hl-thumbs" data-x="thumbs"></div>
<div class="hl-insp">
  <label>slot <select data-x="slot"></select></label>
  <label>part <select data-x="part"></select></label>
  <label>palette <select data-x="color"></select></label>
  <button data-x="reset">game look</button>
  <span class="hl-note" data-x="inspnote"></span>
</div>
<div class="hl-perf"><span data-x="perf">perf…</span><button data-x="prewarm">prewarm all ${CLASS_IDS.length}</button></div>`;
  document.body.appendChild(root);
  const $ = (sel) => root.querySelector(`[data-x="${sel}"]`);
  const big = $('big');

  // ---- engine helpers ------------------------------------------------------
  const engineData = () => { try { return doll.data || null; } catch (e) { return null; } };
  const engineReady = () => !!engineData();
  function engineStatus() { try { return doll.status() || {}; } catch (e) { return {}; } }
  function counters() { try { return doll.counters() || {}; } catch (e) { return {}; } }
  function hunterFor(cls = st.cls) {
    return {
      classId: cls,
      gender: st.gender,
      equipment: { weapon: !!st.fine, helm: !!st.helm, armor: !!st.armor, cape: !!st.cape, shield: !!st.shield },
    };
  }
  function lookOf(cls = st.cls) {
    try { return heroloomLook(hunterFor(cls)); } catch (e) { return null; }
  }
  /** look.colors are ramp-keyed; bakeRecipe() wants slot-keyed (character.json convention). */
  function slotColors(colors, s = spec) {
    const out = {};
    for (const [slot, def] of Object.entries((s && s.slots) || {})) {
      const ramp = def && def.color;
      if (ramp && colors && colors[ramp]) out[slot] = colors[ramp];
    }
    return out;
  }
  function baseRecipe(cls = st.cls) {
    const look = lookOf(cls) || { parts: {}, colors: {} };
    return { parts: { ...(look.parts || {}) }, colors: slotColors(look.colors) };
  }
  function effectiveRecipe(cls = st.cls) {
    const r = baseRecipe(cls);
    const parts = { ...r.parts };
    const colors = { ...r.colors };
    for (const [slot, id] of Object.entries(st.parts)) { if (id) parts[slot] = id; else delete parts[slot]; }
    for (const [slot, v] of Object.entries(st.colors)) { if (v) colors[slot] = v; else delete colors[slot]; }
    return { parts, colors };
  }
  function hasOverride() {
    return Object.values(st.parts).some(Boolean) || Object.values(st.colors).some(Boolean);
  }
  function frameIndex(action, tick) {
    try { return heroloomFrameIndex(heroloomAf(action), Math.max(0, tick)); } catch (e) { return 0; }
  }
  const actionMeta = (action) => (spec && spec.actions && spec.actions[action]) || HEROLOOM_ACTIONS[action] || null;

  // ---- class picker / thumbs (all 8 classes side by side, idle) ------------
  const thumbs = CLASS_IDS.map((cls) => {
    const b = document.createElement('button');
    b.className = 'hl-thumb';
    b.title = cls + (CLASS_LABEL[cls] ? ` ${CLASS_LABEL[cls]}` : '');
    const cv = document.createElement('canvas');
    cv.width = THUMB.w; cv.height = THUMB.h;
    const span = document.createElement('span');
    span.textContent = CLASS_LABEL[cls] || cls;
    b.appendChild(cv); b.appendChild(span);
    b.addEventListener('click', () => { st.cls = cls; st.tick = 0; note = ''; refreshUi(); });
    $('thumbs').appendChild(b);
    return { cls, cv, btn: b };
  });

  // ---- action / dir / transport controls ----------------------------------
  const actionBtns = ACTION_NAMES.map((a) => {
    const b = document.createElement('button');
    b.textContent = a;
    b.title = `${a} (row ${ROWS[a] ? ROWS[a].row : '?'})`;
    b.addEventListener('click', () => { st.action = a; st.tick = 0; acc = 0; refreshUi(); });
    $('actions').appendChild(b);
    return b;
  });
  const dirBtns = DIRS.map(([d, label]) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.title = d === 'left' ? 'whole-canvas mirror of the right-facing art'
      : d === 'side' ? 'side view (pack faces right)' : `${d}: pack only has a side view — same pixels, different engine dir key`;
    b.addEventListener('click', () => { st.dir = d; refreshUi(); });
    $('dirs').appendChild(b);
    return b;
  });
  const gearCbs = [];
  GEAR.forEach(([key, label]) => {
    const l = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = key === 'gender' ? st.gender === 'f' : !!st[key];
    cb.addEventListener('change', () => {
      if (key === 'gender') st.gender = cb.checked ? 'f' : 'm';
      else st[key] = cb.checked;
      note = '';
      // src/heroloom.js::heroloomLook now maps equipment.shield → parts.shield, so no override is needed here.
      if (key === 'shield') delete st.parts.shield;
      rebake();
    });
    l.appendChild(cb); l.appendChild(document.createTextNode(label));
    $('gear').appendChild(l);
    gearCbs.push({ key, cb });
  });
  $('play').addEventListener('click', () => { st.playing = !st.playing; refreshUi(); });
  $('prev').addEventListener('click', () => stepFrame(-1));
  $('next').addEventListener('click', () => stepFrame(1));
  $('restart').addEventListener('click', () => { st.tick = 0; acc = 0; refreshUi(); });
  $('close').addEventListener('click', () => unmount());

  function stepFrame(delta) {
    st.playing = false;
    const meta = actionMeta(st.action);
    if (!meta) return;
    const af = heroloomAf(st.action);
    let i = heroloomFrameIndex(af, Math.max(0, st.tick));
    i = ((i + delta) % meta.frames + meta.frames) % meta.frames;
    st.tick = i === 0 ? 0 : Math.ceil(af[i - 1]);
    acc = 0;
    refreshUi();
  }

  // ---- inspector ----------------------------------------------------------
  function fillSlots() {
    const order = [];
    for (const l of (spec && spec.layers) || []) if (l && l.slot && !order.includes(l.slot)) order.push(l.slot);
    for (const s of Object.keys((spec && spec.slots) || {})) if (!order.includes(s)) order.push(s);
    const sel = $('slot');
    sel.innerHTML = '';
    for (const s of order) sel.add(new Option(s, s));
    st.slot = st.slot && order.includes(st.slot) ? st.slot : (order[0] || '');
    sel.value = st.slot;
    syncInspector();
  }
  function fillInspectorOptions() {
    const def = spec && spec.slots && spec.slots[st.slot];
    const partSel = $('part');
    partSel.innerHTML = '';
    partSel.add(new Option('(default)', ''));
    for (const id of Object.keys((def && def.parts) || {})) partSel.add(new Option(id, id));
    const ramp = def && def.color ? spec.palettes && spec.palettes[def.color] : null;
    const colorSel = $('color');
    colorSel.innerHTML = '';
    colorSel.add(new Option(def && def.color ? `(${def.color} default)` : '(no palette)', ''));
    for (const name of Object.keys((ramp && ramp.variants) || {})) colorSel.add(new Option(name, name));
    colorSel.disabled = !ramp;
  }
  function syncInspector() {
    if (!$('slot')) return;
    // Rebuild the <option> lists only when the slot or the spec source changes — rebuilding them on
    // every rAF frame would close an open dropdown and throw away the user's scroll position.
    const stamp = `${st.slot}|${specFromFile ? 'file' : 'static'}|${spec ? Object.keys(spec.slots || {}).length : 0}`;
    if (stamp !== inspStamp) { inspStamp = stamp; fillInspectorOptions(); }
    const r = effectiveRecipe();
    const partSel = $('part'), colorSel = $('color');
    const partVal = (r.parts && r.parts[st.slot]) || '';
    const colorVal = (r.colors && r.colors[st.slot]) || '';
    if (partSel.value !== partVal) partSel.value = partVal;
    if (colorSel.value !== colorVal) colorSel.value = colorVal;
    const bits = [`slot ${st.slot}`, `part ${partVal || '(default)'}`, `color ${colorVal || '-'}`];
    if (hasOverride()) bits.push('overrides ON → bakeRecipe path');
    if (!specFromFile) bits.push('static spec');
    $('inspnote').textContent = bits.join(' · ');
  }
  $('slot').addEventListener('change', (e) => { st.slot = e.target.value; syncInspector(); });
  $('part').addEventListener('change', (e) => { st.parts[st.slot] = e.target.value || ''; rebake(); });
  $('color').addEventListener('change', (e) => { st.colors[st.slot] = e.target.value || ''; rebake(); });
  $('reset').addEventListener('click', () => {
    st.parts = {}; st.colors = {}; st.sheet = null; st.sheetOk = false; st.sheetErr = '';
    bakeToken++;
    rebake();
  });

  // ---- explicit-recipe bake (inspector overrides) -------------------------
  async function rebake() {
    syncInspector();
    if (!hasOverride()) { st.sheet = null; st.sheetOk = false; st.sheetErr = ''; return; }
    const token = ++bakeToken;
    const recipe = effectiveRecipe();
    if (!engineReady()) return;
    try {
      const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
      const sheet = await doll.bakeRecipe(recipe);
      const ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
      if (token !== bakeToken) return;                 // a newer change is already pending
      st.sheet = sheet; st.sheetOk = !!sheet; st.sheetErr = '';
      bake.calls++; bake.lastMs = ms; bake.totalMs += ms; bake.err = '';
    } catch (e) {
      if (token !== bakeToken) return;
      st.sheet = null; st.sheetOk = false; st.sheetErr = String((e && e.message) || e);
      bake.err = st.sheetErr;
      console.warn('[heroloom-lab] bake failed', e);
    }
    syncInspector();
  }

  // ---- drawing ------------------------------------------------------------
  function drawBg(cv, groundY) {
    const g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    const ck = 10;
    for (let y = 0; y < cv.height; y += ck) {
      for (let x = 0; x < cv.width; x += ck) {
        g.fillStyle = ((x + y) / ck) & 1 ? '#262b36' : '#222732';
        g.fillRect(x, y, ck, ck);
      }
    }
    g.strokeStyle = '#3a4152';
    g.beginPath(); g.moveTo(0, groundY + 0.5); g.lineTo(cv.width, groundY + 0.5); g.stroke();
    return g;
  }
  function drawShadow(g, x, y, rx) {
    g.fillStyle = 'rgba(0,0,0,.38)';
    g.beginPath(); g.ellipse(x, y, rx, Math.max(3, rx * 0.22), 0, 0, Math.PI * 2); g.fill();
  }
  function drawLabel(g, x, y, text) {
    g.fillStyle = 'rgba(232,228,240,.78)';
    g.font = '11px ui-monospace,Consolas,monospace';
    g.fillText(text, x, y);
  }
  /** compose(): the exact game cell; the engine already mirrored it for dir 'left'. */
  function drawCompose(g, box, c) {
    const k = box.k;
    g.save();
    g.imageSmoothingEnabled = false;
    g.drawImage(c.cv, box.gx - c.footX * k, box.gy - c.footY * k, c.cv.width * k, c.cv.height * k);
    g.restore();
  }
  /** bakeRecipe sheet → one cell, cell foot anchor on (box.gx, box.gy); whole-canvas mirror for left. */
  function drawSheetCell(g, cv, sheet, action, tick, box) {
    if (!sheet) {
      drawLabel(g, 10, box.gy - 46, st.sheetErr ? `bake error: ${st.sheetErr}` : (engineReady() ? 'baking…' : 'loading…'));
      return;
    }
    const i = frameIndex(action, tick);
    let f = null;
    try { f = doll.frame(action, i); } catch (e) { f = null; }
    if (!f) f = { x: i * CELL[0], y: (ROWS[action] ? ROWS[action].row : 0) * CELL[1], w: CELL[0], h: CELL[1] };
    const k = box.k;
    const dx = box.gx - FOOT.x * k, dy = box.gy - FOOT.y * k;
    g.save();
    g.imageSmoothingEnabled = false;
    if (st.dir === 'left') {
      g.translate(cv.width, 0);
      g.scale(-1, 1);
      g.drawImage(sheet, f.x, f.y, f.w, f.h, cv.width - dx - f.w * k, dy, f.w * k, f.h * k);
    } else {
      g.drawImage(sheet, f.x, f.y, f.w, f.h, dx, dy, f.w * k, f.h * k);
    }
    g.restore();
  }
  function composeFor(cls, action, tick) {
    if (!engineReady()) return null;
    const row = ROWS[action] || ROWS.idle;
    try {
      return doll.compose(hunterFor(cls), {
        action: row.compose, tick, dir: st.dir, hideWeapon: !!st.hideWeapon, globalTick: tick,
      }) || null;
    } catch (e) { return null; }
  }
  function drawBig(c) {
    const g = drawBg(big, BIG.gy);
    drawShadow(g, BIG.gx, BIG.gy, 58);
    if (hasOverride()) {
      drawSheetCell(g, big, st.sheet, st.action, st.tick, BIG);
      return;
    }
    if (!engineReady()) { drawLabel(g, 10, BIG.gy - 46, 'loading character.json + bakes…'); return; }
    if (!c) { drawLabel(g, 10, BIG.gy - 46, `compose unavailable (${st.cls})`); return; }
    drawCompose(g, BIG, c);
    // foot cross: proves the engine's foot anchor lands on the ground line
    g.strokeStyle = 'rgba(0,255,160,.5)';
    g.beginPath(); g.moveTo(BIG.gx - 6, BIG.gy); g.lineTo(BIG.gx + 6, BIG.gy);
    g.moveTo(BIG.gx, BIG.gy - 6); g.lineTo(BIG.gx, BIG.gy + 6); g.stroke();
  }
  function drawThumbs() {
    for (const t of thumbs) {
      const g = drawBg(t.cv, THUMB.gy);
      g.imageSmoothingEnabled = false;
      if (!engineReady()) continue;
      drawShadow(g, THUMB.w / 2, THUMB.gy, 20);
      const c = composeFor(t.cls, 'idle', 0);
      if (!c) continue;
      const k = THUMB.k;
      g.drawImage(c.cv, THUMB.w / 2 - c.footX * k, THUMB.gy - c.footY * k, c.cv.width * k, c.cv.height * k);
    }
  }

  // ---- info / perf --------------------------------------------------------
  function kv(obj, max = 9) {
    const e = Object.entries(obj || {});
    if (!e.length) return '-';
    return e.slice(0, max).map(([k, v]) => `${k}=${v}`).join(' ') + (e.length > max ? ` +${e.length - max}` : '');
  }
  function infoText(c) {
    const meta = actionMeta(st.action);
    const idx = frameIndex(st.action, st.tick);
    const look = lookOf();
    const wt = (look && look.weaponType) || '';
    const recipe = hasOverride() ? effectiveRecipe() : null;
    let game = '';
    try {
      game = `game: strike→${heroloomActionKey('attack', wt)} · skill→${heroloomActionKey('skill', wt)}`;
    } catch (e) { game = ''; }
    return [
      `class ${st.cls} · dir ${st.dir} · ${st.action}`
        + (meta ? ` (row ${meta.row}, ${meta.frames}f @${meta.ms}ms ${meta.loop ? 'loop' : 'once'})` : '')
        + ` · frame ${idx + 1}/${meta ? meta.frames : '?'} · tick ${st.tick} · ${st.playing ? 'playing' : 'paused'}`,
      recipe ? `recipe parts  ${kv(recipe.parts)}` : `look parts  ${kv(look && look.parts)}`,
      recipe ? `recipe colors ${kv(recipe.colors)}`
        : `look colors ${kv(slotColors(look && look.colors))}${wt ? ` · weapon ${wt}` : ''}${game ? ` · ${game}` : ''}`,
      hasOverride()
        ? 'render: bakeRecipe (explicit recipe; cell drawn from the 512×448 sheet, left = mirror)'
        : `render: compose (what the game draws)${c && c.key ? ` · key ${String(c.key)}` : ''}`,
      `gear helm=${st.helm ? 1 : 0} armor=${st.armor ? 1 : 0} cape=${st.cape ? 1 : 0} shield=${st.shield ? 1 : 0}`
        + ` fine=${st.fine ? 1 : 0} gender=${st.gender} hideWeapon=${st.hideWeapon ? 1 : 0}`,
    ].join('\n');
  }
  function perfText() {
    const n = counters();
    const stt = engineStatus();
    return [
      `bake ${bake.lastMs.toFixed(1)}ms/${bake.calls}`,
      `engine bakes ${n.bakes ?? 0}`,
      `cached ${stt.cached ?? '?'} sheets`,
      `hits ${n.cacheHits ?? 0}`,
      `misses ${n.cacheMisses ?? 0}`,
      `compose ${n.composeCount ?? 0} (${n.composeMs ?? 0}ms)`,
      `tinted ${stt.tinted ?? '?'} imgs`,
      `cell ${CELL[0]}×${CELL[1]}·${COLS}cols`,
      `cell ms ${actionMeta(st.action)?.ms ?? '?'}`,
      stt.failed ? `FAILED ${stt.failed}` : (engineReady() ? 'ready' : 'loading'),
      specErr ? `specErr ${specErr}` : '',
      bake.err ? `bakeErr ${bake.err}` : '',
      note,
    ].filter(Boolean).join(' · ');
  }

  // ---- render loop --------------------------------------------------------
  function refreshUi() {
    actionBtns.forEach((b, i) => b.classList.toggle('on', ACTION_NAMES[i] === st.action));
    dirBtns.forEach((b, i) => b.classList.toggle('on', DIRS[i][0] === st.dir));
    for (const { key, cb } of gearCbs) cb.checked = key === 'gender' ? st.gender === 'f' : !!st[key];
    thumbs.forEach((t) => t.btn.classList.toggle('on', t.cls === st.cls));
    $('play').textContent = st.playing ? '⏸ pause' : '▶ play';
    const pathEl = $('path');
    pathEl.textContent = hasOverride() ? 'bakeRecipe' : 'compose';
    pathEl.classList.toggle('rec', hasOverride());
    syncInspector();
  }
  function render() {
    const stt = engineStatus();
    $('status').textContent = engineReady() ? 'ready' : (stt.failed ? `failed: ${stt.failed}` : 'loading…');
    refreshUi();
    const c = hasOverride() ? null : composeFor(st.cls, st.action, st.tick);
    drawBig(c);
    const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    if (now - thumbAt > 250) { thumbAt = now; drawThumbs(); }
    $('info').textContent = infoText(c);
    $('perf').textContent = perfText();
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!root.isConnected) { cancelAnimationFrame(raf); raf = 0; return; }
    const dt = last ? Math.min(0.25, (now - last) / 1000) : 0;
    last = now;
    if (st.playing && engineReady()) {
      acc += (dt * 1000) / TICK_MS;
      const n = Math.floor(acc);
      if (n) { st.tick += n; acc -= n; }
    }
    render();
  }

  // ---- prewarm ------------------------------------------------------------
  $('prewarm').addEventListener('click', async () => {
    if (prewarming || !engineReady()) return;
    prewarming = true;
    note = 'prewarming…';
    render();
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    let baked = 0;
    for (const cls of CLASS_IDS) {
      try { await doll.bakeRecipe(effectiveRecipe(cls)); baked++; } catch (e) { console.warn('[heroloom-lab] prewarm bake failed', cls, e); }
      for (const act of ['idle', 'walk', 'attack']) composeFor(cls, act, 0);
      render();
      await new Promise((r) => setTimeout(r, 0));
    }
    const ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
    note = `prewarmed ${baked}/${CLASS_IDS.length} sheets in ${ms.toFixed(0)}ms`;
    prewarming = false;
    render();
  });

  // ---- character.json (inspector ground truth, static table as fallback) --
  function loadSpec() {
    try {
      const x = new XMLHttpRequest();
      x.open('GET', base + 'character.json', true);
      x.responseType = 'text';
      x.onload = () => {
        if (!(x.status >= 200 && x.status < 300)) { specErr = `character.json ${x.status}`; return; }
        try {
          spec = JSON.parse(x.responseText);
          specFromFile = true;
          specErr = '';
          fillSlots();
          refreshUi();
        } catch (e) { specErr = String((e && e.message) || e); }
      };
      x.onerror = () => { specErr = 'character.json fetch failed (static spec in use)'; };
      x.send();
    } catch (e) { specErr = String((e && e.message) || e); }
  }

  function unmount() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    try { doll.dispose(); } catch (e) { /* engine teardown is best-effort */ }
    root.remove();
    if (globalThis.__mistvaleHeroLoomLab === api) delete globalThis.__mistvaleHeroLoomLab;
  }

  const api = {
    root, state: st, doll, unmount, render, rebake, base,
    actions: ACTION_NAMES.slice(), dirs: DIRS.map((d) => d[0]), classes: CLASS_IDS.slice(),
    rows: Object.fromEntries(Object.entries(ROWS).map(([k, v]) => [k, v.row])),
    get data() { return engineData(); },
    get spec() { return spec; },
  };
  globalThis.__mistvaleHeroLoomLab = api;
  fillSlots();
  loadSpec();
  refreshUi();
  last = 0;
  raf = requestAnimationFrame(frame);
  return api;
}
