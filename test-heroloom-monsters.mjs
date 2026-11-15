// test-heroloom-monsters.mjs — src/heroloom-monsters.js + src/heroloom-buildings.js.
//
// Plain node suite (same style as test-heroloom.mjs): no browser, no npm modules, no image
// libraries. It proves the reduced monster pack contract, the timing tables and the building /
// terrain validators before any build runs. Delivered art under assets/heroloom-* is checked by
// node tools/checks/heroloom-ext-assets.mjs instead; this suite stays green even when art-gen has
// not delivered yet (it synthesises PNG headers and RGBA fixtures).
import assert from 'node:assert/strict';
import {
  HEROLOOM_MONSTER_TICK_RATE, HEROLOOM_MONSTER_CELL, HEROLOOM_MONSTER_COLUMNS, HEROLOOM_MONSTER_ROWS,
  HEROLOOM_MONSTER_SHEET_WIDTH, HEROLOOM_MONSTER_SHEET_HEIGHT, HEROLOOM_MONSTER_META,
  HEROLOOM_MONSTER_ACTIONS, HEROLOOM_MONSTER_ACTION_NAMES, LOOM_MONSTERS,
  HEROLOOM_MONSTERS_BASE, monsterSheetUrl, canonicalMonsterMeta, loomMonsterMeta,
  clearLoomMonsterMetaCache, monsterActionKey, monsterAf, monsterFrameIndex,
  validateMonsterSheet, pngHeaderInfo,
} from './src/heroloom-monsters.js';
import {
  LOOM_BUILDINGS, LOOM_TERRAIN, HEROLOOM_BUILDING_IDS, HEROLOOM_TERRAIN_NAMES,
  HEROLOOM_BUILDING_ASPECT_BAND, HEROLOOM_BUILDING_HEIGHT, HEROLOOM_BUILDINGS_BASE,
  buildingUrl, terrainUrl, aspectRatio, buildingAspect, relativeAspect,
  validateBuildingPng, seamlessTileCheck,
} from './src/heroloom-buildings.js';
import { heroloomFrameIndex } from './src/heroloom.js';

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// 26-byte PNG header: signature + IHDR chunk type + width + height + bit depth + colour type.
const pngHeader = (width, height, colorType = 6) => {
  const b = Buffer.alloc(26);
  PNG_SIG.copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  b[24] = 8;
  b[25] = colorType;
  return b;
};

const clone = (v) => JSON.parse(JSON.stringify(v));
const withPixelAssets = (value, fn) => {
  const prev = globalThis.PIXEL_ASSETS;
  clearLoomMonsterMetaCache();
  try {
    if (value === undefined) delete globalThis.PIXEL_ASSETS; else globalThis.PIXEL_ASSETS = value;
    return fn();
  } finally {
    if (prev === undefined) delete globalThis.PIXEL_ASSETS; else globalThis.PIXEL_ASSETS = prev;
    clearLoomMonsterMetaCache();
  }
};

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; } catch (e) { console.error('FAIL', name); throw e; } };

/* ------------------------------------------------------------ 1. constants, registry, urls */
test('reduced monster geometry constants', () => {
  assert.equal(HEROLOOM_MONSTER_TICK_RATE, 20);
  assert.equal(HEROLOOM_MONSTER_CELL, 160);
  assert.equal(HEROLOOM_MONSTER_COLUMNS, 8);
  assert.equal(HEROLOOM_MONSTER_ROWS, 5);
  assert.equal(HEROLOOM_MONSTER_SHEET_WIDTH, 1280);
  assert.equal(HEROLOOM_MONSTER_SHEET_HEIGHT, 800);
  assert.deepEqual({ ...HEROLOOM_MONSTER_META }, { heroHeight: 72, footFromBottom: 12, artSize: 100 });
  assert.deepEqual([...HEROLOOM_MONSTER_ACTION_NAMES], ['idle', 'walk', 'attack', 'hurt', 'death']);
});

test('action table: row order, y = row * cell, walk is 8 frames (8 fps), attack release/impact', () => {
  HEROLOOM_MONSTER_ACTION_NAMES.forEach((name, row) => {
    const a = HEROLOOM_MONSTER_ACTIONS[name];
    assert.equal(a.row, row, name + ' row');
    assert.equal(a.cell, 160);
    assert.equal(a.y, row * 160);
    assert.equal(a.y, a.row * a.cell);
    assert.ok(a.frames > 0 && a.frames <= HEROLOOM_MONSTER_COLUMNS, name + ' frames <= columns');
    assert.ok(a.frameTime > 0, name + ' frameTime');
  });
  assert.deepEqual([...HEROLOOM_MONSTER_ACTION_NAMES].map((n) => HEROLOOM_MONSTER_ACTIONS[n].frames), [4, 8, 6, 3, 5]);
  assert.equal(HEROLOOM_MONSTER_ACTIONS.walk.frameTime, 0.125);
  assert.equal(HEROLOOM_MONSTER_ACTIONS.walk.cycle, 85);
  assert.equal(HEROLOOM_MONSTER_ACTIONS.attack.release, 3);
  assert.equal(HEROLOOM_MONSTER_ACTIONS.attack.impact, 4);
});

test('monster registry: the 3 taiga/desert game types with their lore labels', () => {
  assert.deepEqual(Object.keys(LOOM_MONSTERS), ['wolfman', 'mummy', 'moss']);
  assert.equal(LOOM_MONSTERS.wolfman.label, '灰毛狼人');
  assert.equal(LOOM_MONSTERS.mummy.label, '木乃伊');
  assert.equal(LOOM_MONSTERS.moss.label, '苔蘚巨魔');
});

test('HEROLOOM_MONSTERS_BASE defaults to media/heroloom-monsters/ and honours PIXEL_ASSETS', () => {
  withPixelAssets(undefined, () => assert.equal(HEROLOOM_MONSTERS_BASE(), 'media/heroloom-monsters/'));
  withPixelAssets({ heroloomMonstersBase: 'custom/monsters/' },
    () => assert.equal(HEROLOOM_MONSTERS_BASE(), 'custom/monsters/'));
});

test('monsterSheetUrl joins base without doubling slashes', () => {
  assert.equal(monsterSheetUrl('wolfman'), 'media/heroloom-monsters/wolfman/sheet.png');
  withPixelAssets({ heroloomMonstersBase: 'custom/monsters' },
    () => assert.equal(monsterSheetUrl('wolfman'), 'custom/monsters/wolfman/sheet.png'));
  withPixelAssets({ heroloomMonstersBase: 'custom/monsters/' },
    () => assert.equal(monsterSheetUrl('moss'), 'custom/monsters/moss/sheet.png'));
});

/* ------------------------------------------------------------ 2. meta objects */
test('canonicalMonsterMeta mirrors HEROLOOM_MONSTER_ACTIONS exactly', () => {
  const meta = canonicalMonsterMeta('wolfman');
  assert.equal(meta.hero, 'wolfman');
  assert.deepEqual({ ...HEROLOOM_MONSTER_META }, { heroHeight: meta.heroHeight, footFromBottom: meta.footFromBottom, artSize: meta.artSize });
  assert.deepEqual(Object.keys(meta.actions), [...HEROLOOM_MONSTER_ACTION_NAMES]);
  for (const name of HEROLOOM_MONSTER_ACTION_NAMES) {
    const spec = HEROLOOM_MONSTER_ACTIONS[name];
    const a = meta.actions[name];
    assert.equal(a.cell, 160);
    assert.equal(a.y, spec.row * 160);
    assert.equal(a.y, spec.y);
    assert.equal(a.frames, spec.frames);
    assert.equal(a.frameTime, spec.frameTime);
    if (spec.cycle != null) assert.equal(a.cycle, spec.cycle); else assert.equal(a.cycle, undefined);
    if (spec.release != null) assert.equal(a.release, spec.release); else assert.equal(a.release, undefined);
    if (spec.impact != null) assert.equal(a.impact, spec.impact); else assert.equal(a.impact, undefined);
  }
});

test('loomMonsterMeta adds Down/Up aliases (same row) but never Left aliases', () => {
  const meta = loomMonsterMeta('mummy');
  for (const dir of ['Down', 'Up']) {
    for (const name of ['idle', 'walk', 'attack']) assert.equal(meta.actions[name + dir], meta.actions[name], name + dir);
  }
  for (const name of ['idle', 'walk', 'attack', 'hurt', 'death']) assert.equal(meta.actions[name + 'Left'], undefined, name + 'Left must stay absent');
  assert.equal(meta.actions.hurtDown, undefined);
  assert.equal(meta.actions.deathDown, undefined);
});

test('loomMonsterMeta is memoized and reuses PIXEL_ASSETS.loomMonsters meta overrides', () => {
  const first = loomMonsterMeta('moss');
  assert.equal(loomMonsterMeta('moss'), first);
  withPixelAssets({
    loomMonsters: {
      moss: {
        img: 'media/heroloom-monsters/moss/sheet.png',
        meta: { hero: 'moss', heroHeight: 72, footFromBottom: 12, artSize: 100, actions: { idle: { y: 0, cell: 160, frames: 4, frameTime: 0.3 } } },
      },
    },
  }, () => {
    const m = loomMonsterMeta('moss');
    assert.equal(m.actions.idle.frameTime, 0.3, 'pack override wins');
    assert.equal(m.actions.walk.frames, 8, 'canonical fills omitted actions');
    assert.equal(m.actions.attack.release, 3);
  });
  // after restoring PIXEL_ASSETS the memo was cleared, canonical value is back
  assert.equal(loomMonsterMeta('moss').actions.idle.frameTime, 0.25);
});

test('loomMonsterMeta tolerates a JSON-string meta (build.mjs may emit either)', () => {
  const meta = { hero: 'wolfman', heroHeight: 72, footFromBottom: 12, artSize: 100, actions: {} };
  withPixelAssets({ loomMonsters: { wolfman: { img: 'x.png', meta: JSON.stringify(meta) } } }, () => {
    assert.equal(loomMonsterMeta('wolfman').hero, 'wolfman');
    assert.equal(loomMonsterMeta('wolfman').actions.death.frames, 5);
  });
});

/* ------------------------------------------------------------ 3. validateMonsterSheet */
test('validateMonsterSheet accepts canonical meta + 1280x800 RGBA header', () => {
  const r = validateMonsterSheet(canonicalMonsterMeta('wolfman'), pngHeader(1280, 800, 6));
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.deepEqual(r.errors, []);
  // a {width,height} object is accepted too (the checker may pass a parsed header)
  assert.equal(validateMonsterSheet(canonicalMonsterMeta('mummy'), { width: 1280, height: 800 }).ok, true);
});

test('validateMonsterSheet rejects wrong sheet geometry and signature', () => {
  const meta = canonicalMonsterMeta('wolfman');
  const badW = validateMonsterSheet(meta, pngHeader(1024, 800, 6));
  assert.equal(badW.ok, false);
  assert.ok(badW.errors.join(' ').includes('width must be 1280'), badW.errors.join('; '));
  const badH = validateMonsterSheet(meta, pngHeader(1280, 768, 6));
  assert.equal(badH.ok, false);
  assert.ok(badH.errors.join(' ').includes('height must be 800'));
  assert.equal(validateMonsterSheet(meta, null).ok, false);
  assert.equal(validateMonsterSheet(meta, Buffer.alloc(10)).ok, false);
  const wrongSig = pngHeader(1280, 800, 6); wrongSig[0] = 0;
  const badSig = validateMonsterSheet(meta, wrongSig);
  assert.equal(badSig.ok, false);
  assert.ok(badSig.errors.join(' ').includes('signature'));
});

test('validateMonsterSheet rejects wrong meta geometry/timing/art constants', () => {
  const cases = [
    [(m) => { m.hero = ''; }, 'hero'],
    [(m) => { m.heroHeight = 72.5; }, 'heroHeight'],
    [(m) => { delete m.footFromBottom; }, 'footFromBottom'],
    [(m) => { m.artSize = undefined; }, 'artSize'],
    [(m) => { m.actions.walk.cell = 128; }, 'walk.cell'],
    [(m) => { m.actions.attack.y = 300; }, 'attack.y'],
    [(m) => { m.actions.idle.frames = 5; }, 'idle.frames'],
    [(m) => { m.actions.walk.frameTime = 0.1; }, 'walk.frameTime'],
    [(m) => { delete m.actions.walk.cycle; }, 'walk.cycle'],
    [(m) => { m.actions.attack.release = 2; }, 'attack.release'],
    [(m) => { m.actions.attack.impact = 5; }, 'attack.impact'],
    [(m) => { delete m.actions.death; }, 'death'],
    [(m) => { delete m.actions.hurt.frameTime; }, 'hurt.frameTime'],
  ];
  for (const [mutate, needle] of cases) {
    const meta = canonicalMonsterMeta('wolfman');
    mutate(meta);
    const r = validateMonsterSheet(meta, pngHeader(1280, 800, 6));
    assert.equal(r.ok, false, 'expected failure for ' + needle);
    assert.ok(r.errors.join(' ').includes(needle), 'error should mention ' + needle + ': ' + r.errors.join('; '));
  }
  assert.equal(validateMonsterSheet(null, pngHeader(1280, 800)).ok, false);
  assert.equal(validateMonsterSheet({}, pngHeader(1280, 800)).ok, false);
});

test('pngHeaderInfo reads signature/IHDR and colour type', () => {
  const h = pngHeaderInfo(pngHeader(1280, 800, 6));
  assert.equal(h.ok, true);
  assert.equal(h.width, 1280);
  assert.equal(h.height, 800);
  assert.equal(h.colorType, 6);
  assert.equal(h.alpha, true);
  assert.equal(pngHeaderInfo(pngHeader(10, 10, 2)).alpha, false);
});

/* ------------------------------------------------------------ 4. timing tables */
test('monsterAf matches the reduced-format frame times at tickRate 20', () => {
  const want = {
    idle: [5, 10, 15, 20],
    walk: [2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20],
    attack: [1.8, 3.6, 5.4, 7.2, 9, 10.8],
    hurt: [2, 4, 6],
    death: [2.8, 5.6, 8.4, 11.2, 14],
  };
  for (const id of Object.keys(LOOM_MONSTERS)) {
    for (const action of Object.keys(want)) assert.deepEqual(monsterAf(id, action), want[action], id + '/' + action);
  }
});

test('monsterAf maps suffixed/alias action keys back onto the 5 rows', () => {
  const attack = monsterAf('wolfman', 'attack');
  assert.deepEqual(monsterAf('wolfman', 'attackDownLeft'), attack);
  assert.deepEqual(monsterAf('wolfman', 'attackLeft'), attack);
  assert.deepEqual(monsterAf('wolfman', 'attack.bow'), attack);
  assert.deepEqual(monsterAf('mummy', 'walkUp'), monsterAf('mummy', 'walk'));
  assert.deepEqual(monsterAf('moss', 'hurtDown'), monsterAf('moss', 'hurt'));
  assert.deepEqual(monsterAf('moss', 'sleep'), monsterAf('moss', 'idle'));
  assert.deepEqual(monsterAf('moss', null), monsterAf('moss', 'idle'));
});

test('monsterActionKey fallbacks never return null', () => {
  const table = {
    idle: 'idle', walk: 'walk', attack: 'attack', hurt: 'hurt', death: 'death',
    attackDownLeft: 'attack', attackDown: 'attack', attackUp: 'attack', attackLeft: 'attack',
    walkDownLeft: 'walk', walkUpRight: 'walk', idleDown: 'idle', idleLeft: 'idle',
    hurtDown: 'hurt', hurtLeft: 'hurt', death2: 'death', die: 'death', hit: 'hurt',
    run: 'walk', strike: 'attack', cast: 'attack', shoot: 'attack', thrust: 'attack',
    'attack.bow': 'attack', 'walk cycle': 'walk', '': 'idle', null: 'idle', undefined: 'idle',
    unknown: 'idle',
  };
  for (const [input, want] of Object.entries(table)) {
    assert.equal(monsterActionKey(input), want, 'key ' + String(input));
  }
  // every input lands on one of the 5 rows
  for (const input of ['', 'nope', 'sleep', 'attackDownLeft', 'some weird value']) {
    assert.ok(HEROLOOM_MONSTER_ACTION_NAMES.includes(monsterActionKey(input)));
  }
});

test('monsterFrameIndex: same wrap/clamp semantics as heroloomFrameIndex', () => {
  const walk = monsterAf('wolfman', 'walk');
  assert.equal(walk[walk.length - 1], 20);
  assert.equal(monsterFrameIndex(walk, 0), 0);
  assert.equal(monsterFrameIndex(walk, 2.49), 0);
  // tick is floored to whole DV2 ticks before the cumulative table lookup (heroloomFrameIndex rule)
  assert.equal(monsterFrameIndex(walk, 2.5), 0);
  assert.equal(monsterFrameIndex(walk, 3), 1);
  assert.equal(monsterFrameIndex(walk, 7.5), 2);
  assert.equal(monsterFrameIndex(walk, 8), 3);
  assert.equal(monsterFrameIndex(walk, 19.99), 7);
  assert.equal(monsterFrameIndex(walk, 20), 0);
  assert.equal(monsterFrameIndex(walk, 21), 0);
  assert.equal(monsterFrameIndex(walk, -1), 7, 'negative tick wraps from the end');
  assert.equal(monsterFrameIndex(walk, -20), 0);
  assert.equal(monsterFrameIndex([], 5), 0);
  assert.equal(monsterFrameIndex([0], 5), 0);
  assert.equal(monsterFrameIndex(null, 5), 0);
  // DFS parity with the hero implementation for the generated tables
  for (const id of Object.keys(LOOM_MONSTERS)) {
    for (const action of HEROLOOM_MONSTER_ACTION_NAMES) {
      const af = monsterAf(id, action);
      for (let tick = -30; tick <= 40; tick++) {
        assert.equal(monsterFrameIndex(af, tick), heroloomFrameIndex(af, tick), id + '/' + action + ' tick ' + tick);
      }
      for (let tick = -2; tick <= 22; tick += 0.5) {
        assert.equal(monsterFrameIndex(af, tick), heroloomFrameIndex(af, tick), id + '/' + action + ' tick ' + tick);
      }
    }
  }
});

/* ------------------------------------------------------------ 5. buildings + terrain */
const PNG_SIG2 = PNG_SIG;   // keep one source for the header helper above

test('building/terrain registries and urls', () => {
  assert.deepEqual(Object.keys(LOOM_BUILDINGS).sort(), ['forge', 'hall', 'house', 'inn', 'tavern']);
  assert.equal(LOOM_BUILDINGS.hall.label, '城鎮大廳');
  assert.equal(LOOM_BUILDINGS.house.label, '獵人小屋');
  assert.deepEqual(Object.keys(LOOM_TERRAIN).sort(), ['earth', 'grass', 'stone']);
  assert.deepEqual([...HEROLOOM_BUILDING_IDS].sort(), ['forge', 'hall', 'house', 'inn', 'tavern']);
  assert.deepEqual([...HEROLOOM_TERRAIN_NAMES].sort(), ['earth', 'grass', 'stone']);
  assert.equal(HEROLOOM_BUILDINGS_BASE(), 'media/heroloom-buildings/');
  assert.equal(buildingUrl('hall'), 'media/heroloom-buildings/hall.png');
  assert.equal(terrainUrl('grass'), 'media/heroloom-buildings/terrain/grass.png');
  withPixelAssets({ heroloomBuildingsBase: 'custom/buildings' }, () => {
    assert.equal(HEROLOOM_BUILDINGS_BASE(), 'custom/buildings');
    assert.equal(buildingUrl('inn'), 'custom/buildings/inn.png');
    assert.equal(terrainUrl('stone'), 'custom/buildings/terrain/stone.png');
  });
});

test('aspect helpers', () => {
  assert.equal(aspectRatio(1120, 1400), 0.8);
  assert.equal(aspectRatio(0, 10), null);
  assert.equal(aspectRatio('x', 10), null);
  assert.deepEqual(buildingAspect({ width: 800, height: 1200 }), { width: 800, height: 1200, ratio: 800 / 1200 });
  assert.equal(buildingAspect({ width: 0, height: 1200 }), null);
  assert.equal(relativeAspect(pngHeader(800, 1200), 1120, 1400), (800 / 1200) / (1120 / 1400));
  assert.equal(relativeAspect(pngHeader(800, 1200), 0, 1400), null);
});

test('validateBuildingPng accepts an in-band alpha PNG for each building', () => {
  const refs = { hall: [1120, 1400], inn: [984, 1144], tavern: [984, 1140], forge: [984, 1244], house: [900, 1036] };
  for (const [id, [rw, rh]] of Object.entries(refs)) {
    // Drop-in art shares the reference footprint: drawing at refWidth x refHeight gives relative 1.0.
    const r = validateBuildingPng(pngHeader(rw, rh, 6), { id, refWidth: rw, refHeight: rh });
    assert.equal(r.ok, true, id + ': ' + r.errors.join('; '));
    assert.equal(r.relative, 1);
    assert.ok(r.ratio > 0 && r.refRatio > 0);
  }
  assert.deepEqual(HEROLOOM_BUILDING_ASPECT_BAND, { min: 0.8, max: 1.2 });
  assert.deepEqual(HEROLOOM_BUILDING_HEIGHT, { min: 700, max: 1500 });
});

test('validateBuildingPng rejects no alpha, wrong height, out-of-band aspect, bad signature, unknown id', () => {
  const ref = { id: 'hall', refWidth: 1120, refHeight: 1400 };
  const cases = [
    [pngHeader(800, 1200, 2), ref, 'alpha channel'],
    [pngHeader(800, 600, 6), ref, 'height'],
    [pngHeader(800, 1600, 6), ref, 'height'],
    [pngHeader(1400, 900, 6), ref, 'outside the accepted'],
    [pngHeader(500, 1200, 6), ref, 'outside the accepted'],   // 0.417 / 0.8 = 0.521 -> below the 0.8 band
  ];
  for (const [header, opts, needle] of cases) {
    const r = validateBuildingPng(header, opts);
    assert.equal(r.ok, false, 'expected failure: ' + needle);
    assert.ok(r.errors.join(' ').includes(needle), 'error should mention ' + needle + ': ' + r.errors.join('; '));
  }
  assert.ok(validateBuildingPng(pngHeader(800, 1200, 6), { ...ref, id: 'castle' }).errors.join(' ').includes('unknown building id'));
  assert.ok(validateBuildingPng(pngHeader(800, 1200, 6), { id: 'hall' }).errors.join(' ').includes('reference aspect missing'));
  const wrongSig = pngHeader(800, 1200, 6); wrongSig[1] = 0;
  assert.ok(validateBuildingPng(wrongSig, ref).errors.join(' ').includes('signature'));
  // {width,height} object without colour info cannot prove alpha
  assert.ok(validateBuildingPng({ width: 800, height: 1200 }, ref).errors.join(' ').includes('alpha'));
  // skipAspect allows a wire-format-only check
  assert.equal(validateBuildingPng({ width: 800, height: 1200, colorType: 6 }, { skipAspect: true }).ok, true);
  assert.equal(validateBuildingPng(pngHeader(800, 1200, 6), { refAspect: 1120 / 1400 }).ok, true);
});

const solidTile = (w, h, rgba) => {
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) out.set(rgba, i * 4);
  return out;
};

test('seamlessTileCheck passes a uniform / mirrored-edge tile', () => {
  const flat = solidTile(8, 8, [120, 160, 90, 255]);
  const r = seamlessTileCheck(flat, 8, 8);
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.equal(r.leftRight, 0);
  assert.equal(r.topBottom, 0);
  const mirrored = solidTile(8, 8, [120, 160, 90, 255]);
  for (let y = 0; y < 8; y++) { const o = (y * 8 + 7) * 4; mirrored[o] = 120; mirrored[o + 1] = 160; mirrored[o + 2] = 90; mirrored[o + 3] = 255; }
  assert.equal(seamlessTileCheck(mirrored, 8, 8).ok, true);
});

test('seamlessTileCheck catches a non-tiling terrain tile', () => {
  const w = 8, h = 8;
  const seam = solidTile(w, h, [128, 128, 128, 255]);
  for (let y = 0; y < h; y++) {
    const left = (y * w) * 4, right = (y * w + w - 1) * 4;
    seam.set([0, 0, 0, 255], left);
    seam.set([255, 255, 255, 255], right);
  }
  const lr = seamlessTileCheck(seam, w, h);
  assert.equal(lr.ok, false);
  assert.ok(lr.leftRight > 0.05, 'leftRight ' + lr.leftRight);
  assert.equal(lr.topBottom, 0);
  const tb = solidTile(w, h, [128, 128, 128, 255]);
  for (let x = 0; x < w; x++) {
    tb.set([255, 0, 0, 255], x * 4);
    tb.set([0, 0, 255, 255], ((h - 1) * w + x) * 4);
  }
  const r2 = seamlessTileCheck(tb, w, h);
  assert.equal(r2.ok, false);
  assert.ok(r2.topBottom > 0.05, 'topBottom ' + r2.topBottom);
});

test('seamlessTileCheck rejects malformed input instead of throwing', () => {
  assert.equal(seamlessTileCheck(new Uint8Array(10), 4, 4).ok, false);
  assert.equal(seamlessTileCheck(null, 4, 4).ok, false);
  assert.equal(seamlessTileCheck(new Uint8Array(0), 1, 1).ok, false);
  const r = seamlessTileCheck(solidTile(4, 4, [0, 0, 0, 255]), 4, 4, { threshold: 2 });
  assert.equal(r.ok, false);
});

test('PNG_SIG2 helper stays aligned with the header writer', () => {
  assert.deepEqual([...PNG_SIG2], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
});

console.log(`test-heroloom-monsters: ${passed} passed`);
