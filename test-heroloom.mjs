// test-heroloom.mjs — src/heroloom.js（HeroLoom → Mistvale 英雄紙娃娃的純對照層）+ 資料包一致性。
//
// 這個測試不碰瀏覽器：只驗證 assets/heroloom/character.json 與程式碼裡的常數/對照表一致、8 個職業的
// 配方合法、以及 HeroLoom 偽裝成 DV2 資料包後，遊戲原本的出招對時助手（resolveAction/actionTiming/
// dollActionTick）拿到的動作/時間點是對的。合成/上色的瀏覽器端由 npm run verify 的實際渲染驗收。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSlot, resolveAction, actionTiming } from './src/paperdoll.js';
import { dollActionTick, dollDirName } from './src/paperdoll-hero.js';
import { CLASSES } from './src/pixel-data.js';
import {
  HEROLOOM_CELL, HEROLOOM_COLUMNS, HEROLOOM_ROWS, HEROLOOM_FOOT, HEROLOOM_HERO_HEIGHT,
  HEROLOOM_TICK_RATE, HEROLOOM_ACTIONS, HEROLOOM_LAYERS, HEROLOOM_SLOTS, HEROLOOM_PALETTES,
  HEROLOOM_CLASSES, CLASS_LOOK, HEROLOOM_BASE, heroloomLook, heroloomRecipe, heroloomRecipeSig,
  heroloomActionKey, heroloomFrameIndex, heroloomAf, heroloomData, heroloomClass,
} from './src/heroloom.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const packDir = path.join(root, 'assets', 'heroloom');
const spec = JSON.parse(fs.readFileSync(path.join(packDir, 'character.json'), 'utf8'));

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; } catch (e) { console.error('FAIL', name); throw e; } };

/* ------------------------------------------------------------ 1. 資料包 vs 程式碼常數 */
test('pack geometry constants match character.json', () => {
  assert.deepEqual(spec.cell, HEROLOOM_CELL);
  assert.equal(spec.columns, HEROLOOM_COLUMNS);
  assert.equal(Object.keys(spec.actions).length, HEROLOOM_ROWS);
  assert.deepEqual(spec.foot, HEROLOOM_FOOT);
  assert.equal(spec.faces, 'right');
});

test('8 heroloom actions: rows, frames, ms, loop', () => {
  const names = Object.keys(spec.actions);
  assert.deepEqual(names, Object.keys(HEROLOOM_ACTIONS));
  for (const [name, a] of Object.entries(spec.actions)) {
    const mirrored = HEROLOOM_ACTIONS[name];
    assert.deepEqual([mirrored.row, mirrored.frames, mirrored.ms, !!mirrored.loop], [a.row, a.frames, a.ms, !!a.loop], name);
    assert.ok(a.row >= 0 && a.row < HEROLOOM_ROWS, name + ' row');
    assert.ok(a.frames > 0 && a.frames <= HEROLOOM_COLUMNS, name + ' frames');
  }
  // 39 格有畫東西：8 動作的 frames 總和（文件說 only 39 cells used）
  assert.equal(Object.values(spec.actions).reduce((s, a) => s + a.frames, 0), 39);
});

test('22 layers, 12 slots, order and part layers match character.json', () => {
  assert.equal(spec.layers.length, HEROLOOM_LAYERS.length);
  assert.deepEqual(spec.layers, HEROLOOM_LAYERS.map(({ slot, layer }) => ({ slot, layer })));
  const slots = Object.keys(spec.slots);
  assert.equal(slots.length, 12);
  assert.deepEqual(slots.sort(), Object.keys(HEROLOOM_SLOTS).sort());
  for (const slot of slots) {
    const def = spec.slots[slot];
    const mirrored = HEROLOOM_SLOTS[slot];
    assert.equal(mirrored.color, def.color ?? null, slot + ' color');
    assert.equal(!!mirrored.required, !!def.required, slot + ' required');
    assert.deepEqual(Object.keys(def.parts).sort(), Object.keys(mirrored.parts).sort(), slot + ' part ids');
    for (const id of Object.keys(def.parts)) {
      assert.deepEqual(Object.keys(def.parts[id].layers).sort(), mirrored.parts[id].slice().sort(), `${slot}/${id} layers`);
    }
  }
  assert.ok(spec.slots.body.required && spec.slots.face.required);
});

test('every layer file exists and is a 512×448 png', () => {
  const [cw, ch] = HEROLOOM_CELL;
  for (const { slot, layer } of HEROLOOM_LAYERS) {
    for (const part of Object.values(spec.slots[slot].parts)) {
      const rel = part.layers[layer];
      if (!rel) continue;
      const file = path.join(packDir, rel);
      assert.ok(fs.existsSync(file), rel + ' missing');
      const b = fs.readFileSync(file);
      assert.equal(b.readUInt32BE(16), HEROLOOM_COLUMNS * cw, rel + ' width');
      assert.equal(b.readUInt32BE(20), HEROLOOM_ROWS * ch, rel + ' height');
    }
  }
});

test('palettes: 6 base colours, variant names/counts', () => {
  const counts = { skin: 4, hair: 7, cloth: 7, leather: 3, eye: 5 };
  for (const [ramp, pal] of Object.entries(HEROLOOM_PALETTES)) {
    assert.equal(spec.palettes[ramp].base.length, 6, ramp + ' base');
    assert.deepEqual(spec.palettes[ramp].base, pal.base, ramp + ' base hex');
    assert.equal(Object.keys(spec.palettes[ramp].variants).length, counts[ramp], ramp + ' variants');
    assert.deepEqual(Object.keys(spec.palettes[ramp].variants), pal.variants, ramp + ' variant names');
  }
});

/* ------------------------------------------------------------ 2. 職業 → 配方 */
test('all 6 game classes have a heroloom look', () => {
  // 遊戲核心 6 職業是 berserker/paladin/sorcerer/archer/assassin/priest；darkknight/warrior/traveler 只是包裡的額外剪影。
  assert.equal(CLASSES.length, 6);
  const ids = CLASSES.map((c) => c.id);
  for (const c of ids) assert.ok(CLASS_LOOK[c], 'game class missing look: ' + c);
  for (const c of ids) assert.ok(HEROLOOM_CLASSES.includes(c), 'HEROLOOM_CLASSES missing ' + c);
  assert.deepEqual(ids.slice().sort(), ['archer', 'assassin', 'berserker', 'paladin', 'priest', 'sorcerer']);
});

test('every class recipe is valid: part ids exist, palette variants exist', () => {
  for (const classId of HEROLOOM_CLASSES) {
    const look = heroloomLook({ classId });
    assert.equal(look.classId, classId);
    for (const [slot, id] of Object.entries(look.parts)) {
      const def = spec.slots[slot];
      assert.ok(def, `${classId}: unknown slot ${slot}`);
      assert.ok(def.parts[id], `${classId}: slot ${slot} has no part ${id}`);
    }
    for (const [ramp, variant] of Object.entries(look.colors)) {
      assert.ok(HEROLOOM_PALETTES[ramp], `${classId}: unknown ramp ${ramp}`);
      assert.ok(spec.palettes[ramp].variants[variant], `${classId}: ramp ${ramp} has no variant ${variant}`);
    }
  }
});

test('weapon part matches the weapon type; the unarmed traveler has none', () => {
  const want = { bow: 'bow', staff: 'staff', holystaff: 'staff', sword: 'sword', axe: 'sword', dagger: 'dagger', hammer: 'hammer' };   // hammer: 2026-11-24 聖騎士戰錘
  for (const classId of HEROLOOM_CLASSES) {
    const look = heroloomLook({ classId });
    if (classId === 'traveler') {
      assert.equal(look.weaponType, null);
      assert.equal(look.parts.weapon, undefined);
      continue;
    }
    assert.ok(look.weaponType, classId + ' weaponType');
    assert.equal(look.parts.weapon, want[look.weaponType], `${classId} weapon part`);
  }
});

test('gear booleans change the look and the recipe signature', () => {
  const plain = heroloomLook({ classId: 'warrior' });
  const geared = heroloomLook({ classId: 'warrior', equipment: { helm: true, armor: true, cape: true, shield: true } });
  assert.equal(geared.parts.hat, 'helmet');
  assert.equal(geared.parts.top, 'armor');
  assert.equal(geared.parts.cape, 'cape');
  assert.equal(geared.parts.shield, 'buckler');
  assert.notEqual(heroloomRecipeSig(geared), heroloomRecipeSig(plain));
  // 武器 fine（DV2 equipment.weapon === true）不換武器圖，但會補披風
  const fine = heroloomLook({ classId: 'assassin', equipment: { weapon: true } });
  assert.equal(fine.parts.weapon, 'dagger');
  assert.equal(fine.parts.cape, 'cape');
});

test('gender f swaps short/spiky hair to the long silhouette', () => {
  assert.equal(heroloomLook({ classId: 'archer', gender: 'f' }).parts.hair, 'long');
  assert.equal(heroloomLook({ classId: 'archer', gender: 'm' }).parts.hair, 'short');
  assert.equal(heroloomLook({ classId: 'archer', gender: 'f' }).gender, 'f');
});

test('unknown class falls back safely, class ids with @ still resolve', () => {
  assert.equal(heroloomClass({ classId: 'nope' }).classId || heroloomClass({ classId: 'nope' }), 'warrior');
  assert.equal(heroloomClass({ classId: 'paladin@2x' }), 'paladin');
});

test('recipe hides the weapon and the sig is order independent', () => {
  const look = heroloomLook({ classId: 'paladin' });
  const full = heroloomRecipe(look);
  const bare = heroloomRecipe(look, { hideWeapon: true });
  assert.ok(full.parts.weapon);
  assert.equal(bare.parts.weapon, undefined);
  assert.notEqual(heroloomRecipeSig(full), heroloomRecipeSig(bare));
  assert.equal(heroloomRecipeSig({ parts: { top: 'robe', hair: 'long' }, colors: { cloth: 'white' } }),
    heroloomRecipeSig({ parts: { hair: 'long', top: 'robe' }, colors: { cloth: 'white' } }));
});

/* ------------------------------------------------------------ 3. DV2 偽裝資料包 */
test('facade shape: tickRate 20, heroHeight 30, skins for all 8 classes, no death/ride/give', () => {
  const d = heroloomData();
  assert.equal(d.tickRate, HEROLOOM_TICK_RATE);
  assert.equal(d.meta.heroHeight, HEROLOOM_HERO_HEIGHT);
  for (const c of HEROLOOM_CLASSES) {
    assert.ok(d.meta.heroHeights[c] > 0, c + ' heroHeight');
    assert.ok(d.skins.body[c], c + ' skins.body');
  }
  for (const k of ['death', 'ride_sit', 'ride_stand', 'give', 'jump_victory']) assert.equal(d.actions[k], undefined, k);
});

test('af tables are heroloom frame times in 50 ms ticks', () => {
  assert.deepEqual(heroloomAf('idle'), [4, 8, 12, 16]);
  assert.deepEqual(heroloomAf('walk'), [1.8, 3.6, 5.4, 7.2, 9, 10.8]);
  assert.deepEqual(heroloomAf('attack'), [1.4, 2.8, 4.2, 5.6, 7, 8.4]);
  assert.deepEqual(heroloomAf('hurt'), [2, 4, 6]);
  assert.deepEqual(heroloomAf('jump'), [1.8, 3.6, 5.4, 7.2, 9]);
  assert.deepEqual(heroloomAf('cast'), [2.2, 4.4, 6.6, 8.8, 11]);
  assert.deepEqual(heroloomAf('thrust'), [1.4, 2.8, 4.2, 5.6, 7]);
  assert.deepEqual(heroloomAf('shoot'), [2, 4, 6, 8, 10]);
});

test('resolveAction finds a weapon-specific row for every class/kit', () => {
  const d = heroloomData();
  const kits = { archer: 'bow', sorcerer: 'staff', priest: 'holystaff', paladin: 'hammer', berserker: 'axe', assassin: 'dagger', traveler: null, darkknight: 'sword', warrior: 'sword' };
  for (const [classId, wt] of Object.entries(kits)) {
    for (const name of ['attack', 'skill', 'hurt', 'walk', 'idle']) {
      const key = resolveAction(d, name, wt);
      assert.ok(d.actions[key], `${classId}: ${name} → ${key}`);
      assert.equal(key.split('.')[0], name, `${classId}: ${name} resolved to ${key}`);
    }
  }
  // 旅人赤手空拳：沒有武器後綴也能解析到普通近戰
  assert.equal(resolveAction(d, 'attack', null), 'attack');
  assert.equal(d.actions.attack.releaseSlot, 1);
});

test('timings: release/impact slots land on the right frames', () => {
  const d = heroloomData();
  const melee = actionTiming(d, 'attack', 'sword');
  assert.equal(melee.releaseSlot, 1);
  assert.equal(melee.impactSlot, 2);
  assert.equal(melee.releaseTick, 1.4);
  assert.equal(melee.impactTick, 2.8);
  assert.equal(melee.ticks, 8.4);
  const bow = actionTiming(d, 'attack', 'bow');
  assert.equal(bow.key, 'attack.bow');
  assert.equal(bow.ticks, 10);
  assert.equal(bow.releaseTick, 4);
  assert.equal(bow.impactTick, 4);
  const dagger = actionTiming(d, 'attack', 'dagger');
  assert.equal(dagger.key, 'attack.dagger');
  assert.equal(dagger.ticks, 7);
  const cast = actionTiming(d, 'skill', 'staff');
  assert.equal(cast.key, 'skill.staff');
  assert.equal(cast.ticks, 11);
  assert.equal(cast.releaseTick, 4.4);
});

test('dollActionTick: strike/skill propagate the facade keys and ticks', () => {
  const d = heroloomData();
  const base = { pose: 'strike', i: 0, t: 10.07, atkAt: 10, atkHitAt: 10.2, hitDelay: 0.07, strikeEnd: 0.345,
    hitStop: 0.07, hurtLen: 0.3, walkFrames: 6, elapsed: 1, seed: 0, data: d };
  const bow = dollActionTick({ ...base, weaponType: 'bow' });
  assert.equal(bow.action, 'attack.bow');
  assert.ok(bow.tick >= 4 - 1e-6, 'bow release tick ' + bow.tick);
  const sword = dollActionTick({ ...base, weaponType: 'sword' });
  assert.equal(sword.action, 'attack.sword');
  const skill = dollActionTick({ pose: 'skill', i: 0, t: 10.3, skillAt: 10, skillRelease: 0.25, skillLen: 0.675,
    hurtLen: 0.3, walkFrames: 6, elapsed: 1, seed: 0, data: d, weaponType: 'staff' });
  assert.equal(skill.action, 'skill.staff');
  assert.ok(skill.tick >= 4.4 - 1e-6);
});

test('dollActionTick: idle/walk/hurt/victory/dead/ride all find a heroloom row (derived paths)', () => {
  const d = heroloomData();
  const base = { i: 0, t: 0, atkAt: -99, skillAt: -99, hurtLen: 0.3, walkFrames: 6, elapsed: 2, seed: 0, data: d, weaponType: 'sword' };
  assert.equal(dollActionTick({ ...base, pose: 'idle' }).action, 'idle');
  assert.equal(dollActionTick({ ...base, pose: 'walk' }).action, 'walk');
  assert.equal(dollActionTick({ ...base, pose: 'walk', i: 3 }).action, 'walk');
  const hurt = dollActionTick({ ...base, pose: 'hurt', hit: 0.1 });
  assert.equal(hurt.action, 'hurt');
  const victory = dollActionTick({ ...base, pose: 'victory', cheerT: 0.5 });
  assert.equal(victory.action, 'victory');
  assert.equal(victory.loop, true);
  // 倒地：資料包沒有 death → hurt 最後一格 + lie 旋轉
  const dead = dollActionTick({ ...base, pose: 'dead', deathT: 1, deathLen: 0.96 });
  assert.equal(dead.action, 'hurt');
  assert.equal(dead.derived, 'death');
  assert.equal(dead.lie, 1);
  // 騎乘：資料包沒有 ride_* → 退回 idle，但不會 null（坐騎照常畫）
  const ride = dollActionTick({ ...base, pose: 'idle', ride: 'sit' });
  assert.ok(ride && ride.action, 'ride must not be null');
  assert.equal(ride.action, 'idle');
});

test('heroloomActionKey maps DV2 keys to the right row', () => {
  assert.equal(heroloomActionKey('idle'), 'idle');
  assert.equal(heroloomActionKey('walk'), 'walk');
  assert.equal(heroloomActionKey('hurt'), 'hurt');
  assert.equal(heroloomActionKey('victory'), 'jump');
  assert.equal(heroloomActionKey('death'), 'hurt');
  assert.equal(heroloomActionKey('attack', 'sword'), 'attack');
  assert.equal(heroloomActionKey('attack.bow', 'bow'), 'shoot');
  assert.equal(heroloomActionKey('attack.dagger', 'dagger'), 'thrust');
  assert.equal(heroloomActionKey('skill.staff', 'staff'), 'cast');
  assert.equal(heroloomActionKey('skill.holystaff', 'holystaff'), 'cast');
  assert.equal(heroloomActionKey('skill.bow', 'bow'), 'shoot');
  assert.equal(heroloomActionKey('skill.dagger', 'dagger'), 'thrust');
  assert.equal(heroloomActionKey('skill.axe', 'axe'), 'attack');
  assert.equal(heroloomActionKey('ride_sit'), 'idle');
});

test('heroloomFrameIndex == getSlot for all 39 frames', () => {
  for (const [name, a] of Object.entries(HEROLOOM_ACTIONS)) {
    const af = heroloomAf(name);
    assert.equal(af.length, a.frames, name);
    const total = af[af.length - 1];
    for (let tick = 0; tick < Math.ceil(total) + 2; tick++) {
      assert.equal(heroloomFrameIndex(af, tick), getSlot(af, tick), `${name} tick ${tick}`);
    }
    assert.equal(heroloomFrameIndex(af, -1), af.length - 1, name + ' negative wraps to last frame');
  }
});

/* ------------------------------------------------------------ 4. 方向與基底 */
test('HEROLOOM_BASE defaults to media/heroloom/ and honours PIXEL_ASSETS', () => {
  const prev = globalThis.PIXEL_ASSETS;
  try {
    delete globalThis.PIXEL_ASSETS;
    assert.equal(HEROLOOM_BASE(), 'media/heroloom/');
    globalThis.PIXEL_ASSETS = { heroloomBase: 'custom/loom/' };
    assert.equal(HEROLOOM_BASE(), 'custom/loom/');
  } finally {
    if (prev === undefined) delete globalThis.PIXEL_ASSETS; else globalThis.PIXEL_ASSETS = prev;
  }
});

test('dollDirName → left is the only mirrored side, up/down stay side view', () => {
  assert.equal(dollDirName('side', 1), 'side');
  assert.equal(dollDirName('side', -1), 'sideLeft');
  assert.equal(dollDirName('up', 1), 'up');
  assert.equal(dollDirName('down', 1), 'down');
  // compose() 只在 sideLeft 時整張鏡射；其餘方向都用同一組側面圖
  assert.equal(HEROLOOM_CELL[0] - 1 - HEROLOOM_FOOT[0], 37); // 鏡射後的腳底 x 錨點
});

console.log(`test-heroloom: ${passed} passed`);
