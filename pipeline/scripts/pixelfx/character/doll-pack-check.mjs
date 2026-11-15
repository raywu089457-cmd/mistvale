#!/usr/bin/env node
// doll-pack-check.mjs -- verifier for assets/paperdoll-classes/.
//
// It loads the generated pack and drives the REAL engine pure functions from src/paperdoll.js
// (the same ones the runtime and test-paperdoll.mjs use), then asserts that every class composes
// for every action / variant / direction / tick without a missing sprite or skin, that each sprite
// rectangle lies inside its atlas, that the weapon's rotation/handle math lands where the pack
// baked it, that actionTiming lands the impact where the game needs it, and that HIT_STOP is not
// baked into any af[] array.
//
// usage: node pipeline/scripts/pixelfx/character/doll-pack-check.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readPNG } from './png-io.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const PACK = path.join(ROOT, 'assets', 'paperdoll-classes');
const JSON_FILE = path.join(PACK, 'paperdoll.json');

const ENGINE = await import(pathToFileURL(path.join(ROOT, 'src', 'paperdoll.js')).href);

const GEAR_SLOTS = ['helm', 'chest', 'belt', 'legs', 'boots', 'gloves'];
const DIR_COUNT = 8;
const TICK_RATE = 20;
const GAME_ATTACK_SEC = 0.45; // current in-game attack animation length
const IMPACT_WANT = 0.4; // where the hit must land inside it

let failures = 0;
const fail = (msg) => {
  failures++;
  if (failures <= 40) console.error('FAIL ' + msg);
};
const ok = (cond, msg) => {
  if (!cond) fail(msg);
  return cond;
};

// ---------------------------------------------------------------------------------------------

const raw = fs.readFileSync(JSON_FILE, 'utf8');
let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  console.error('FAIL pack json does not parse: ' + e.message);
  process.exit(1);
}

ok(data.format === 'mistvale-paperdoll', 'format must be "mistvale-paperdoll"');
ok(data.version === 1, 'version must be 1');
ok(data.tickRate === TICK_RATE, 'tickRate must be 20');
ok(data.meta && data.meta.cell === 100, 'meta.cell must be 100');
ok(data.meta && data.meta.footFromBottom === 8, 'meta.footFromBottom must be 8');
ok(!/20\d\d-\d\d-\d\dT/.test(raw), 'json must not contain timestamps');
ok(raw.length <= 300 * 1024, `json must stay <= 300 KB (is ${(raw.length / 1024).toFixed(1)} KB)`);

const classes = (data.meta && data.meta.classes) || [];
ok(classes.length === 6, 'pack must cover six classes');
const kits = (data.meta && data.meta.kits) || {};

// ---------------------------------------------------------------------------------------------
// layers / skins / weapons
// ---------------------------------------------------------------------------------------------

for (const slot of GEAR_SLOTS) {
  const def = data.layers && data.layers[slot];
  ok(!!def, `layer ${slot} missing`);
  if (!def) continue;
  ok(def.kind === 'slot', `layer ${slot} must be kind "slot"`);
  ok(def.follows === (slot === 'helm' ? 'head' : 'body'), `layer ${slot} must follow ${slot === 'helm' ? 'the head' : 'the body'}`);
  ok(!!def.attach && (def.attach.after || def.attach.before), `layer ${slot} needs an attach anchor`);
}
ok(data.layers && data.layers.body && data.layers.body.kind === 'slot', 'body layer must be kind "slot"');
ok(data.layers && data.layers.head, 'head layer missing');
ok(data.layers && data.layers.weapon && data.layers.weapon.kind === 'weapon', 'weapon layer must be kind "weapon"');
for (const dead of ['armor', 'helmet', 'shield', 'cape']) {
  ok(!(data.layers && data.layers[dead]), `layer "${dead}" must not exist in the six-slot pack`);
}

const images = {};
for (const [name, file] of Object.entries(data.images || {})) {
  const p = path.join(PACK, file);
  if (!ok(fs.existsSync(p), `image ${file} missing`)) continue;
  const png = readPNG(p);
  images[name] = png;
  ok(png.w > 0 && png.h > 0, `image ${file} has empty size`);
}

let atlasW = null;
let atlasH = null;
for (const cls of classes) {
  const png = images[cls];
  if (!png) continue;
  if (atlasW == null) { atlasW = png.w; atlasH = png.h; }
  ok(png.w === atlasW && png.h === atlasH, `atlas ${cls}.png must share the pack frame layout`);
}
ok(atlasW > 0, 'no atlases found');

for (const [layer, table] of Object.entries(data.skins || {})) {
  for (const [variant, skin] of Object.entries(table)) {
    if (!ok(!!skin && Number.isInteger(skin.x) && Number.isInteger(skin.y), `skin ${layer}.${variant} malformed`)) continue;
    ok(!!images[skin.img], `skin ${layer}.${variant} points at unknown image "${skin.img}"`);
  }
}

// ≤16 colours per sprite cell: the costume palette and the installed hero sheets both hold 16, so a
// baked doll sprite must not smuggle extra ramp ranks in through the gear layers.
let colourWorst = 0;
let colourWorstKey = '-';
{
  const prefixOf = (layer) => (layer === 'body' ? 'b/' : layer === 'head' ? 'h/' : layer === 'weapon' ? 'w/' : `g/${layer}/`);
  const seenSprite = new Set();
  for (const [layer, table] of Object.entries(data.skins || {})) {
    const pre = prefixOf(layer);
    for (const [variant, skin] of Object.entries(table)) {
      const img = images[skin.img];
      if (!img) continue;
      for (const [sebk, seb] of Object.entries(data.sebs || {})) {
        if (!sebk.startsWith(pre)) continue;
        for (const [fi, fr] of Object.entries(seb.frames || {})) {
          const key = `${skin.img}/${skin.x},${skin.y}/${sebk}/${fi}`;
          if (seenSprite.has(key)) continue;
          seenSprite.add(key);
          const [u, v, w, h] = fr;
          const set = new Set();
          for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
            const X = skin.x + u + xx, Y = skin.y + v + yy;
            if (X < 0 || Y < 0 || X >= img.w || Y >= img.h) continue;
            const i = (Y * img.w + X) * 4;
            if (!img.data[i + 3]) continue;
            set.add((img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2]);
          }
          if (set.size > colourWorst) { colourWorst = set.size; colourWorstKey = `${layer}.${variant} ${sebk} f${fi}`; }
        }
      }
    }
  }
}
ok(colourWorst <= 16, `a sprite cell uses ${colourWorst} colours (max 16): ${colourWorstKey}`);

for (const cls of classes) {
  const kit = kits[cls];
  ok(!!kit, `meta.kits.${cls} missing`);
  if (!kit) continue;
  for (const key of ['body', 'head', 'hand', 'weapon', ...GEAR_SLOTS]) {
    ok(kit[key] != null, `kit ${cls}.${key} missing`);
    if (kit[key] == null) continue;
    const skin = data.skins[key] && data.skins[key][kit[key]];
    ok(!!skin, `kit ${cls}.${key}="${kit[key]}" has no skin in skins.${key}`);
  }
  ok(!!data.weapons[cls], `weapon ${cls} missing`);
  ok(!!data.weapons[`${cls}_fine`], `weapon ${cls}_fine missing`);
}

for (const [id, w] of Object.entries(data.weapons || {})) {
  ok(Array.isArray(w.handle) && w.handle.length === 2, `weapon ${id} handle malformed`);
  ok(typeof w.type === 'string' && w.type.length > 0, `weapon ${id} type missing`);
  ok(!!(data.skins.weapon && data.skins.weapon[w.skin]), `weapon ${id} skin "${w.skin}" missing`);
}

// ---------------------------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------------------------

const ACTION_KEYS = Object.keys(data.actions || {});
ok(ACTION_KEYS.length === 10, `expected 10 actions, found ${ACTION_KEYS.length}`);
for (const need of ['idle', 'walk', 'attack', 'attack.bow', 'attack.greatsword', 'attack.sword', 'attack.staff', 'attack.dagger', 'skill', 'hurt']) {
  ok(ACTION_KEYS.includes(need), `action ${need} missing`);
}

for (const [key, act] of Object.entries(data.actions || {})) {
  ok(Array.isArray(act.af) && act.af.length >= 2, `action ${key} needs an af array`);
  for (let i = 0; i < act.af.length; i++) {
    ok(Number.isInteger(act.af[i]), `action ${key} af[${i}] must be an integer tick`);
    if (i) ok(act.af[i] > act.af[i - 1], `action ${key} af must be strictly increasing`);
  }
  ok(Array.isArray(act.rows) && act.rows.length === DIR_COUNT, `action ${key} needs 8 rows`);
  if (key === 'idle' || key === 'walk') ok(act.loop === true, `action ${key} must loop`);
  else ok(!act.loop, `action ${key} must not loop`);
  for (const row of act.rows || []) {
    ok(!!row && !!row.parts && !!row.order, `action ${key} row malformed`);
    for (const layer of row.order || []) {
      ok(!!(data.layers || {})[layer], `action ${key} row order names unknown layer "${layer}"`);
    }
  }
}
// hit-stop (70 ms, added by the runtime) must NOT be baked into af: every strike action has to
// place its impact at tick 8 (0.400 s, the game's 0.375-0.45 s window). A baked 70 ms stop would
// push it to 9 or 10 ticks, because 70 ms is 1.4 ticks at tickRate 20.
for (const [key, act] of Object.entries(data.actions || {})) {
  if (!key.startsWith('attack')) continue;
  ok(act.impactSlot === 2, `action ${key} must keep impactSlot 2`);
  ok(act.af[1] === 8, `action ${key} must land the impact on tick 8 (0.400 s), found tick ${act.af[1]} -- hit-stop looks baked in`);
  ok(act.af[0] >= 2 && act.af[0] <= 5, `action ${key} release tick must stay in 2..5, found ${act.af[0]}`);
}

// ---------------------------------------------------------------------------------------------
// actionTiming: impact lands where the game needs it
// ---------------------------------------------------------------------------------------------

for (const cls of classes) {
  const wt = kits[cls].weaponType;
  const atk = ENGINE.actionTiming(data, 'attack', wt);
  ok(atk.key === `attack.${wt}`, `${cls}: attack should resolve to attack.${wt}, got ${atk.key}`);
  ok(atk.impactTick === 8, `${cls}: attack impact tick must be 8, got ${atk.impactTick}`);
  ok(Math.abs(atk.impactSec - IMPACT_WANT) < 1e-6, `${cls}: attack impact must be ${IMPACT_WANT}s, got ${atk.impactSec}`);
  const atkAct = data.actions[atk.key];
  ok(atk.releaseTick === atkAct.af[0], `${cls}: release tick must be af[0] (${atkAct.af[0]}), got ${atk.releaseTick}`);
  ok(atk.releaseSec > 0.05 && atk.releaseSec < 0.26, `${cls}: release must land in the wind-up window, got ${atk.releaseSec}s`);
  ok(atk.seconds <= GAME_ATTACK_SEC + 0.25, `${cls}: attack total ${atk.seconds}s must stay near ${GAME_ATTACK_SEC}s`);
  const idle = ENGINE.actionTiming(data, 'idle');
  ok(idle.loop === true, `${cls}: idle must loop`);
  ok(Math.abs(idle.seconds - 1.4) < 1e-6, `${cls}: idle cycle must be 1.4 s, got ${idle.seconds}`);
}
const unk = ENGINE.actionTiming(data, 'attack', 'crossbow');
ok(unk.key === 'attack', 'unknown weapon type must fall back to the plain attack row');

// ---------------------------------------------------------------------------------------------
// compose every class x look x action x dir x tick through the real engine
// ---------------------------------------------------------------------------------------------

const STATE_HINT = new Set();
function checkCompose(cls, label, look) {
  const kit = kits[cls];
  const wantGear = GEAR_SLOTS.filter((s) => look[s] != null);
  for (const [actionKey, act] of Object.entries(data.actions || {})) {
    const ticks = act.af[act.af.length - 1];
    for (let dir = 0; dir < DIR_COUNT; dir++) {
      for (let tick = 0; tick < ticks; tick++) {
        const parts = ENGINE.computeParts(data, { action: actionKey, dir, tick, globalTick: tick, look });
        const names = parts.map((p) => p.layer);
        const where = `${cls}/${label}/${actionKey}/dir${dir}/t${tick}`;
        if (!ok(names.includes('body'), `${where}: body did not compose`)) continue;
        if (!ok(names.includes('head'), `${where}: head did not compose`)) continue;
        if (!ok(names.includes('weapon'), `${where}: weapon did not compose`)) continue;
        for (const slot of wantGear) ok(names.includes(slot), `${where}: worn ${slot} did not compose`);
        for (const slot of GEAR_SLOTS) if (!wantGear.includes(slot)) ok(!names.includes(slot), `${where}: unworn ${slot} composed anyway`);
        ok(new Set(names).size === names.length, `${where}: duplicate layer in compose order`);

        for (const rec of parts) {
          STATE_HINT.add(rec.kind);
          if (!ok(!!rec.sprite, `${where}: ${rec.layer} has no sprite`)) continue;
          if (!ok(!!rec.skin, `${where}: ${rec.layer} has no skin`)) continue;
          const s = rec.sprite;
          if (!ok(s.length === 8, `${where}: ${rec.layer} sprite tuple malformed`)) continue;
          for (const v of s) if (!ok(Number.isFinite(v), `${where}: ${rec.layer} sprite has a non-number`)) break;
          const [u, v, w, h, tx, ty] = s;
          ok(w > 0 && h > 0, `${where}: ${rec.layer} sprite has empty size`);
          const img = images[rec.skin.img];
          if (!ok(!!img, `${where}: ${rec.layer} image missing`)) continue;
          ok(img.w >= 1 && img.h >= 1, `${where}: ${rec.layer} image empty`);
          ok(rec.skin.x + u >= 0 && rec.skin.x + u + w <= img.w, `${where}: ${rec.layer} rect outside image (x)`);
          ok(rec.skin.y + v >= 0 && rec.skin.y + v + h <= img.h, `${where}: ${rec.layer} rect outside image (y)`);
          ok(Number.isInteger(tx) && Number.isInteger(ty), `${where}: ${rec.layer} anchor must be integer pixels`);

          if (rec.kind === 'weapon') {
            ok(rec.deg === 0, `${where}: weapon must be baked with deg 0`);
            ok(Number.isInteger(rec.x) && Number.isInteger(rec.y), `${where}: weapon layer position must be integer`);
            const corner = ENGINE.weaponCorner(rec);
            ok(Number.isFinite(corner[0]) && Number.isFinite(corner[1]), `${where}: weapon corner non-finite`);
            ok(Math.abs(corner[0] - (rec.x + tx)) < 1e-6 && Math.abs(corner[1] - (rec.y + ty)) < 1e-6, `${where}: weapon rotation/handle math does not land`);
            ok(corner[0] >= -70 && corner[0] <= 70 && corner[1] >= -110 && corner[1] <= 30, `${where}: weapon corner ${corner} far from the hand`);
          } else {
            const corners = ENGINE.partCorners(rec);
            const xs = [], ys = [];
            for (let i = 0; i < corners.length; i++) {
              const pt = corners[i];
              xs.push(Array.isArray(pt) ? pt[0] : corners[i]);
              ys.push(Array.isArray(pt) ? pt[1] : corners[i + 1]);
              if (!Array.isArray(pt)) i++;
            }
            ok(Math.min(...xs) >= -90 && Math.max(...xs) <= 90, `${where}: ${rec.layer} corner x outside the body box`);
            ok(Math.min(...ys) >= -115 && Math.max(...ys) <= 30, `${where}: ${rec.layer} corner y outside the body box`);
          }
        }
      }
    }
  }
}

const ART = [];
const HUE = [];
const CHANGED = [];
const DIST = [];
const FRAG = [];

// a baked weapon sprite must be ONE solid silhouette at 1x: a two-handed shaft split into a grip
// blob and a head blob reads as two props. Count 4-connected opaque components inside the sprite.
function weaponComponents(rec) {
  const img = images[rec.skin.img];
  const [u, v, w, h] = rec.sprite;
  const seen = new Uint8Array(w * h);
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && img.data[((rec.skin.y + v + y) * img.w + (rec.skin.x + u + x)) * 4 + 3] > 0;
  let comps = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!on(x, y) || seen[y * w + x]) continue;
      comps++;
      const stack = [[x, y]];
      seen[y * w + x] = 1;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (!on(nx, ny) || seen[ny * w + nx]) continue;
          seen[ny * w + nx] = 1;
          stack.push([nx, ny]);
        }
      }
    }
  }
  return comps;
}

for (const cls of classes) {
  const type = data.weapons[cls].type;
  // only the actions this class can actually reach (resolveAction falls back to `attack.<type>`)
  const weaponActions = ['idle', 'walk', 'attack', `attack.${type}`, 'skill', 'hurt'].filter((a) => data.actions[a]);
  for (const weapon of [cls, `${cls}_fine`]) {
    let worst = 0;
    for (const action of weaponActions) {
      const act = data.actions[action];
      for (let dir = 0; dir < 8; dir++) {
        for (const slot of act.af) {
          const parts = ENGINE.computeParts(data, { action, dir, tick: slot, globalTick: slot, look: { weapon } });
          const recs = parts.filter((p) => p.layer === 'weapon');
          if (!ok(recs.length <= 1, `${cls}/${weapon} ${action} dir${dir} slot${slot}: ${recs.length} weapon sprites`)) continue;
          for (const rec of recs) {
            const c = weaponComponents(rec);
            worst = Math.max(worst, c);
            ok(c === 1, `${cls}/${weapon} ${action} dir${dir} slot${slot}: weapon sprite splits into ${c} pieces`);
          }
        }
      }
    }
    FRAG.push(`${cls}/${weapon}=${worst}`);
  }
}

// rasterise one composed frame into cell space (feet at 50,92, cell 100) so the art assertions
// below can talk about actual pixels instead of rects
function composeCell(cls, look, action, dir, tick) {
  const parts = ENGINE.computeParts(data, { action, dir, tick, globalTick: tick, look });
  const map = new Map();
  for (const rec of parts) {
    if (!rec.sprite || !rec.skin) continue;
    if (rec.layer === 'weapon') continue;
    const img = images[rec.skin.img];
    const [u, v, w, h, tx, ty] = rec.sprite;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = ((rec.skin.y + v + y) * img.w + (rec.skin.x + u + x)) * 4;
        if (!img.data[si + 3]) continue;
        map.set((92 + rec.y + ty + y) * 100 + (50 + rec.x + tx + x), {
          r: img.data[si], g: img.data[si + 1], b: img.data[si + 2], layer: rec.layer,
        });
      }
    }
  }
  return map;
}

for (const cls of classes) {
  const kit = kits[cls];
  const full = { ...kit, weapon: kit.weapon };
  const bare = { ...kit };
  for (const s of GEAR_SLOTS) bare[s] = null;
  const fine = { ...kit, weapon: `${cls}_fine` };
  const oneByOne = GEAR_SLOTS.map((only) => {
    const look = { ...kit };
    for (const s of GEAR_SLOTS) look[s] = s === only ? kit[s] : null;
    return [only, look];
  });

  checkCompose(cls, 'fitted', full);
  checkCompose(cls, 'bare', bare);
  checkCompose(cls, 'fine', fine);
  for (const [only, look] of oneByOne) checkCompose(cls, `only-${only}`, look);

  // -------------------------------------------------------------------------------------------
  // art discipline: a piece may recolour the body parts it owns and ink them, but it must not
  // repaint the whole figure, erase the costume's sash/harness/stole, or bleed into another piece
  // -------------------------------------------------------------------------------------------
  const sig = (m) => m;
  const keysOf = (m) => new Set(m.keys());
  const bareCell = composeCell(cls, bare, 'idle', ENGINE.DIR.DOWN, 3);
  const fullCell = composeCell(cls, full, 'idle', ENGINE.DIR.DOWN, 3);
  const pieceCells = oneByOne.map(([only, look]) => [only, composeCell(cls, look, 'idle', ENGINE.DIR.DOWN, 3)]);

  for (const [only, cell] of pieceCells) {
    const where = `${cls}/${only}`;
    let grow = 0, lost = 0;
    for (const k of cell.keys()) if (!bareCell.has(k)) grow++;
    for (const k of bareCell.keys()) if (!cell.has(k)) lost++;
    ART.push(`${cls}/${only} grow=${grow} lost=${lost}`);
    ok(grow <= 8, `${where}: changes the silhouette by ${grow} px (limit 8)`);
    ok(lost === 0, `${where}: erases ${lost} body pixels`);
  }

  // union of the six isolated masks must equal the all-six mask: no piece overwrites another's pixels
  const union = new Set(bareCell.keys());
  for (const [, cell] of pieceCells) for (const k of cell.keys()) union.add(k);
  ok(union.size === fullCell.size && [...union].every((k) => fullCell.has(k)),
    `${cls}: six-piece mask (${fullCell.size}) != union of isolated masks (${union.size})`);

  // per-piece visibility: at 1x a worn piece must actually recolour a readable amount of its class,
  // otherwise the mixable-gear feature is invisible in play. And the six pieces must be six DIFFERENT
  // materials of that class's kit, or the mix reads as one recolour. Two assertions, together:
  //  (1) the authored kit (meta.gearKits[cls]) has six base colours that are pairwise distinct, and
  //  (2) the rendered cell of each piece actually contains its own base colour (proving the pack is
  //      painted with that material, not just declaring it in json).
  const HEXT = (s) => {
    const n = parseInt(String(s).slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const kitMeta = (data.meta.gearKits || {})[cls];
  const kitBases = {};
  if (kitMeta && kitMeta.base) for (const s of GEAR_SLOTS) kitBases[s] = HEXT(kitMeta.base[s]);
  for (let i = 0; i < GEAR_SLOTS.length; i++) {
    for (let j = i + 1; j < GEAR_SLOTS.length; j++) {
      const a = kitBases[GEAR_SLOTS[i]], b = kitBases[GEAR_SLOTS[j]];
      if (!a || !b) continue;
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      ok(d >= 25, `${cls}: ${GEAR_SLOTS[i]} and ${GEAR_SLOTS[j]} are the same material in the kit (base distance ${d.toFixed(0)})`);
    }
  }
  const modal = new Map();
  for (const [only, cell] of pieceCells) {
    let changed = 0;
    const counts = new Map();
    for (const [k, px] of cell) {
      const b = bareCell.get(k);
      if (!b || (b.r === px.r && b.g === px.g && b.b === px.b)) continue;
      changed++;
      const key = `${px.r},${px.g},${px.b}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    // the piece's rendered material = mean of its five most-used colours (the ramp it is painted
    // with; a single modal colour flips between ramp ranks and a plain mean is dominated by the 1 px
    // ornament rows). It is a report line, not the pass/fail metric.
    const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const mean = top.length ? [0, 1, 2].map((i) => Math.round(top.reduce((acc, t) => acc + Number(t[0].split(',')[i]), 0) / top.length)) : null;
    modal.set(only, mean);
    CHANGED.push(`${cls}/${only}=${changed}@${mean ? mean.join(',') : '-'}`);
    ok(changed >= 40, `${cls}/${only}: only ${changed} px differ from the bare body (min 40)`);
    const base = kitBases[only];
    if (base) {
      let near = 0, best = 1e9;
      for (const [col, n] of counts) {
        const [r, g, b] = col.split(',').map(Number);
        const d = Math.hypot(r - base[0], g - base[1], b - base[2]);
        if (d < best) best = d;
        if (d <= 16) near += n;
      }
      ok(best <= 12 && near >= 5, `${cls}/${only}: rendered cell does not carry its kit base colour (nearest ${best.toFixed(0)} / ${near} px within 16 of #${base.map((v) => v.toString(16).padStart(2, '0')).join('')})`);
      DIST.push(`${cls}/${only}=${best.toFixed(0)}`);
    }
  }

  // hue report (informational): armour is intentionally a different material family from the cloth,
  // so this is a diagnostic of how far each class's kit moves the body colour, not a pass/fail bound
  const hue = (c) => {
    const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx === mn) return null;
    let h;
    if (mx === r) h = ((g - b) / (mx - mn)) % 6;
    else if (mx === g) h = (b - r) / (mx - mn) + 2;
    else h = (r - g) / (mx - mn) + 4;
    return ((h * 60) % 360 + 360) % 360;
  };
  const hueOf = (px) => hue((px.r << 16) | (px.g << 8) | px.b);
  const ds = [];
  const owned = new Map(); // colour key -> set of pieces that recolour it
  for (const [only, cell] of pieceCells) {
    for (const [k, px] of cell) {
      const b = bareCell.get(k);
      if (!b || (b.r === px.r && b.g === px.g && b.b === px.b)) continue;
      if (!owned.has(k)) owned.set(k, new Map());
      owned.get(k).set(only, `${px.r},${px.g},${px.b}`);
      const h1 = hueOf(px), h2 = hueOf(b);
      if (h1 === null || h2 === null) continue;
      const d = Math.abs(h1 - h2);
      ds.push(Math.min(d, 360 - d));
    }
  }
  let overlaps = 0;
  for (const [k, by] of owned) {
    const cols = new Set(by.values());
    if (by.size > 1 && cols.size === 1) continue; // shared ink pixel on a piece boundary, same colour
    if (by.size > 1) overlaps++;
    ok(by.size === 1 || overlaps <= 2, `${cls}: body pixel ${k} repainted by ${[...by.keys()].join('+')} at once`);
  }
  if (overlaps) ART.push(`${cls} seamOverlap=${overlaps}`);
  ds.sort((a, b) => a - b);
  const med = ds.length ? ds[Math.floor(ds.length / 2)] : 0;
  const p90 = ds.length ? ds[Math.floor(ds.length * 0.9)] : 0;
  HUE.push(`${cls} n=${ds.length} median=${med.toFixed(1)} p90=${p90.toFixed(1)}`);
  // the armour is deliberately a different material family (steel / brass / leather) from the
  // class's cloth, so a large hue shift is expected and correct; what must hold is that the piece
  // is readable in VALUE, not that it stays in one hue family
  const lumOf = (px) => 0.3 * px.r + 0.59 * px.g + 0.11 * px.b;
  const lds = [];
  for (const [, cell] of pieceCells) {
    for (const [k, px] of cell) {
      const b = bareCell.get(k);
      if (!b || (b.r === px.r && b.g === px.g && b.b === px.b)) continue;
      lds.push(Math.abs(lumOf(px) - lumOf(b)));
    }
  }
  lds.sort((a, b) => a - b);
  const lmed = lds.length ? lds[Math.floor(lds.length / 2)] : 0;
  HUE.push(`${cls} dL=${lmed.toFixed(1)}`);
  ok(lmed >= 10, `${cls}: median gear value shift ${lmed.toFixed(1)} < 10 (piece is not readable as a separate material)`);
}

// ---------------------------------------------------------------------------------------------
// size budget + summary
// ---------------------------------------------------------------------------------------------

let pngBytes = 0;
let sheetCount = 0;
for (const cls of classes) {
  pngBytes += fs.statSync(path.join(PACK, `${cls}.png`)).size;
  sheetCount++;
}
ok(pngBytes <= 3 * 1024 * 1024, `PNG budget exceeded (${(pngBytes / 1024 / 1024).toFixed(2)} MB > 3 MB)`);

if (failures) {
  console.error('gear changed ' + CHANGED.join(' | '));
  if (DIST.length) console.error('gear kit     ' + DIST.join(' '));
  console.error(`\ndoll-pack-check: ${failures} failure(s)`);
  process.exit(1);
}

const lines = [];
lines.push(`doll-pack-check: OK`);
lines.push(`  classes        ${classes.join(', ')}`);
lines.push(`  atlases        ${sheetCount} sheets, ${(pngBytes / 1024).toFixed(1)} KB total`);
lines.push(`  cell colour    max ${colourWorst} (${colourWorstKey})`);
lines.push(`  json           ${(raw.length / 1024).toFixed(1)} KB`);
lines.push(`  atlas size     ${atlasW}x${atlasH}`);
lines.push(`  actions        ${ACTION_KEYS.length} (per class x 8 dirs x every tick composed)`);
for (const [key, act] of Object.entries(data.actions)) {
  const secs = act.af[act.af.length - 1] / TICK_RATE;
  const imp = act.impactSlot != null ? (act.af[act.impactSlot - 1] / TICK_RATE).toFixed(3) : '--';
  lines.push(`  ${key.padEnd(18)} ${String(act.af.length).padStart(2)} slots  ${secs.toFixed(2)} s  impact ${imp} s  af [${act.af.join(',')}]`);
}
lines.push(`  gear mask      ${ART.join(' | ')}`);
lines.push(`  gear changed   ${CHANGED.join(' | ')}`);
lines.push(`  gear kit       ${DIST.join(' ')}`);
lines.push(`  gear hue       ${HUE.join(' | ')}`);
lines.push(`  weapon frag    ${FRAG.join(' ')}`);
console.log(lines.join('\n'));

