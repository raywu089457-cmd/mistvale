// test-paperdoll.mjs — src/paperdoll.js 的單元測試 + 與 DV2 kit 參考渲染器的對照測試。
//
// 對照測試只在本機有外部 kit 時跑（絕對路徑，在 repo 外）；沒有就印一行說明後跳過。
// kit 的資料與圖是 Kairosoft 版權素材：這裡只在測試時從外部路徑讀進記憶體，不複製、不寫檔。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { inflateSync as zlibInflate } from 'node:zlib';
import {
  getSlot, at, spriteOf, computeParts, effectiveOrder, dir8to4, lookFromHunter, resolveAction,
  actionTiming, setAction, advance, weaponCorner, partCorners, DIR, MIRROR, CLASS_KIT,
  dirIndex, pickRow, migrateDir, DIR_MIGRATE_8TO4, DIR_NAMES, armorSkin,
  rideActionFor, rideDepth, RIDE_DEPTH, DV2_DIR4, mountMotion, SEB_M, computeMonsterParts, monsterFrameTick,
  DV2_PARTS_ONLY, attackVariant, comboCount,
  weaponFor, helmetSkin, tintPixels, TINTS, RIG2X_SUFFIX,
} from './src/paperdoll.js';
import { ENEMIES, isRideable } from './src/pixel-game.js';
import { quantize4, quantize4Stable, vdir4, toScreen, fromScreen, AXIS_VEC, stairStep, rows4, dirSuffix, leftRow } from './src/dir4.js';

import { dv2ToMistvale, dv2State } from './tools/paperdoll-dv2-adapter.mjs';
import { CLASSES, SKILLS, EQUIP_SLOTS, GEAR_SLOTS as GAME_GEAR_SLOTS } from './src/pixel-data.js';
import { parseDollSpec, dollDirName, dollActionTick, advanceNoSkip, hurtChain, createDollHero, trackAttackStamp, dollAttackVariant, dollVictoryAction, dollLifeAction, JUMP_VICTORY_RATE } from './src/paperdoll-hero.js';

/**
 * 2026-11-14（exp/lpc-hero）：不是每個 CLASSES 職業都有 DV2 紙娃娃 rig。旅人的美術是 LPC 13 列 sheet
 * （assets/heroes/traveler.*），資料包沒有它的 body skin，執行時 pixel-world.js 的 covers() 就直接畫 sheet
 * （lookFromHunter 會退回 meta.defaultClass）。所以每個「資料包」測試只跑該包真的有 body skin 的職業；
 * 沒有 rig 的職業由檔尾的 traveler sheet 測試驗。
 */
const classesWithDollRig = (D) => CLASSES.filter(c => !!(D && D.skins && D.skins.body && D.skins.body[c.id]));

let passed = 0;
// PD_KEEP_GOING=1：失敗不中斷，跑完全部再列出（開發用；預設照舊第一個失敗就停）
const failed = [];
const test = (name, fn) => { try { fn(); passed++; } catch (e) { console.error('FAIL', name); if (!process.env.PD_KEEP_GOING) throw e; console.error(String(e.message).split(String.fromCharCode(10)).slice(0, 6).join(String.fromCharCode(10))); failed.push(name); } };

/* ------------------------------------------------------------ getSlot */
test('getSlot cumulative end times', () => {
  const af = [4, 8, 12, 16];
  const want = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 0];
  want.forEach((s, t) => assert.equal(getSlot(af, t), s, `tick ${t}`));
  // 不等長 slot（CHECKLIST C3：[2,4,6,12]）
  const af2 = [2, 4, 6, 12];
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 11, 12].map(t => getSlot(af2, t)), [0, 0, 1, 1, 2, 2, 3, 3, 0]);
});
test('getSlot negative and huge ticks wrap', () => {
  const af = [4, 8, 12, 16];
  assert.equal(getSlot(af, -1), 3);
  assert.equal(getSlot(af, -16), 0);
  assert.equal(getSlot(af, -5), 2);
  assert.equal(getSlot(af, 16 * 1e9 + 5), 1);
  assert.equal(getSlot(af, Number.MAX_SAFE_INTEGER), getSlot(af, Number.MAX_SAFE_INTEGER % 16));
  assert.equal(getSlot([6], 123), 0);
  assert.equal(getSlot([], 5), 0);
  assert.equal(getSlot(af, NaN), 0);
  assert.equal(getSlot(af, 5.9), 1, 'fractional tick floors');
});
test('at clamps to last, empty → default', () => {
  assert.equal(at([1, 2, 3], 7, 0), 3);
  assert.equal(at([], 2, 9), 9);
  assert.equal(at(undefined, 0, 'd'), 'd');
});

/* ------------------------------------------------------------ 合成資料 */
// 與 DV2 同構的小資料：武器 40×40、handle (20,29)、DV2 的 ox'/oy' 修正
function synth() {
  const W = (n) => Object.fromEntries(Array.from({ length: n }, (_, f) => [f, [Math.floor(f / 2) * 40, 0, 40, 40, 0, 0, f & 1, 0]]));
  return {
    format: 'mistvale-paperdoll', version: 1, tickRate: 20,
    weaponOrigin: { dx: [0, 0, 1, 1], dy: 3 },
    layers: {
      body: { kind: 'slot' }, armor: { kind: 'slot', follows: 'body', attach: { after: 'body' } },
      hand: { kind: 'slot', follows: 'body' }, head: { kind: 'dir' },
      helmet: { kind: 'dir', follows: 'head', attach: { after: 'head' } },
      weapon: { kind: 'weapon' }, effect: { kind: 'effect' },
    },
    images: { a: 'a.png' },
    skins: {
      body: { b: { img: 'a', x: 0, y: 0 } }, armor: { plate: { img: 'a', x: 500, y: 0 } },
      hand: { b: { img: 'a', x: 0, y: 0 } }, head: { h: { img: 'a', x: 0, y: 300 } },
      helmet: { cap: { img: 'a', x: 100, y: 300 } }, weapon: { sw: { img: 'a', x: 0, y: 400 } },
      effect: { fx: { img: 'a', x: 0, y: 500 } },
    },
    sebs: {
      'body/walk': { max: 4, frames: Object.fromEntries([0, 1, 2, 3].map(f => [f, [f * 30, 0, 30, 30, -15, -30, 0, 0]])) },
      'head/normal': { max: 4, frames: { 0: [0, 0, 20, 20, -10, -20, 0, 0], 1: [0, 20, 20, 20, -10, -20, 1, 0], 2: [0, 20, 20, 20, -10, -20, 0, 0], 3: [0, 0, 20, 20, -10, -20, 1, 0] } },
      'head/smile': { max: 4, frames: { 0: [40, 0, 20, 20, -10, -20, 0, 0], 1: [40, 20, 20, 20, -10, -20, 1, 0], 2: [40, 20, 20, 20, -10, -20, 0, 0], 3: [40, 0, 20, 20, -10, -20, 1, 0] } },
      'weapon/sword': { max: 8, frames: W(8) },
      'fx/slash': { max: 8, frames: Object.fromEntries(Array.from({ length: 8 }, (_, f) => [f, [Math.floor(f / 4) * 30, 0, 30, 30, -15, -15, 0, 0]])) },
    },
    weapons: { sw: { skin: 'sw', handle: [20, 29], type: 'sword' }, fist: { skin: 'sw', handle: [20, 29], hidden: true }, big: { skin: 'sw', handle: [20, 29], seb: 'weapon/sword' } },
    effects: { slash: { seb: 'fx/slash', skin: 'fx' } },
    actions: {
      // 「row 10」：武器持ち歩き、朝下
      walk: {
        af: [4, 8, 12, 16], loop: true,
        rows: [0, 1, 2, 3].map(d => ({
          parts: {
            body: { seb: 'body/walk', off: [] },
            head: { seb: 'head/normal', off: [[0, -8], [0, -7], [0, -8], [0, -7]] },
            weapon: { seb: ['weapon/sword'], sebF: [0], deg: [0], inv: [0], show: [1, 1, 1, 1], off: [[-9, -7], [-9, -6], [-9, -7], [-9, -6]] },
          },
          order: ['body', 'head', 'weapon', 'hand'],
        })),
      },
      // 「row 80」：剣_縦振り、朝上
      attack: {
        af: [2, 4, 6, 12], impactSlot: 2, releaseSlot: 1,
        rows: [0, 1, 2, 3].map(d => ({
          parts: {
            body: { seb: 'body/walk', off: [] },
            head: { seb: 'head/normal', off: [[-2, -8]] },
            weapon: { seb: ['weapon/sword'], sebF: [2, 2, 1, 1], deg: [0, 90, 90, 90], inv: [1, 1, 1, 1], show: [1, 1, 1, 1], off: [[7, -10], [1, -11], [4, -5], [4, -5]] },
            effect: { act: [0, 1, 1, 0], type: ['slash'], sebF: [0, 0, 1, 0], off: [[0, 0], [12, -17], [5, -19], [0, 0]] },
          },
          order: [['weapon', 'body', 'head', 'effect'], ['body', null, 'head', 'weapon', 'effect']],
        })),
      },
      'attack.bow': { af: [5, 10], rows: [0, 1, 2, 3].map(() => ({ parts: { body: { seb: 'body/walk' } }, order: ['body'] })) },
      idle: { af: [6, 12], headMirror: true, rows: [0, 1, 2, 3].map(() => ({ parts: { body: { seb: 'body/walk' }, head: { seb: 'head/normal' } }, order: ['body', 'head'] })) },
      cheer: { af: [24], headSeb: 'head/smile', rows: [0, 1, 2, 3].map(() => ({ parts: { head: { seb: 'head/normal' } }, order: ['head'] })) },
    },
    aliases: { stand: 'idle' },
  };
}
const LOOK = { body: 'b', hand: 'b', head: 'h', weapon: 'sw', weaponType: 'sword' };
const byLayer = (parts, l) => parts.find(p => p.layer === l);

/* ------------------------------------------------------------ SPEC §8.5 可驗算例 */
test('§8.5 row 10 (walk, DOWN, frame 0): weapon top-left', () => {
  const D = synth();
  const w = byLayer(computeParts(D, { action: 'walk', dir: DIR.DOWN, tick: 0, look: LOOK }), 'weapon');
  assert.equal(w.frame, 0); assert.equal(w.deg, 0);
  assert.deepEqual([w.x, w.y], [1 - 9, 3 - 7], 'base = (ox\'+off, oy\'+off)');
  const [x, y] = weaponCorner(w);
  // SPEC §8.5 寫的 (-29,-36) 是相對 (ox',oy') = (ox+1, oy+3)；相對腳底就是 CHECKLIST E2 的 (−28,−33)
  assert.deepEqual([x - 1, y - 3], [-29, -36]);
  assert.deepEqual([x, y], [-28, -33]);
});
test('§8.5 row 80 (sword swing, UP, slot 1): frame 5, deg 90, top-left (30,-28)', () => {
  const D = synth();
  const w = byLayer(computeParts(D, { action: 'attack', dir: DIR.UP, tick: 2, look: LOOK }), 'weapon');
  assert.equal(w.slot, 1);
  assert.equal(w.frame, 5, 'sebF 2 * 2 + inv 1');
  assert.equal(w.deg, 90);
  assert.deepEqual(w.sprite, [80, 0, 40, 40, 0, 0, 1, 0]);
  assert.deepEqual(weaponCorner(w), [30, -28]);
  // 旋轉 90° 後的外框：左上 (30,-28)、右上 (30,12)…（x 不變、y 往下長）
  const c = partCorners(w);
  assert.deepEqual(c[0], [30, -28]); assert.deepEqual(c[1], [30, 12]); assert.deepEqual(c[3], [-10, -28]);
});
test('non-weapon layers use raw origin; weapon/effect use ox\'/oy\'', () => {
  const D = synth();
  const ps = computeParts(D, { action: 'attack', dir: DIR.LEFT, tick: 2, look: LOOK });
  const head = byLayer(ps, 'head'), fx = byLayer(ps, 'effect');
  assert.deepEqual([head.x, head.y], [-2, -8]);
  assert.deepEqual([fx.x, fx.y], [1 + 12, 3 - 17]);
  assert.equal(fx.frame, 0 * 4 + DIR.LEFT, 'effect frame = sebF*4 + dir');
  const fx2 = byLayer(computeParts(D, { action: 'attack', dir: DIR.RIGHT, tick: 4, look: LOOK }), 'effect');
  assert.equal(fx2.frame, 1 * 4 + DIR.RIGHT);
  assert.equal(fx2.deg, 0, 'effect never rotates');
});

/* ------------------------------------------------------------ 繪製順序 */
test('per-slot order; null (-1) entries skipped', () => {
  const D = synth();
  const s0 = computeParts(D, { action: 'attack', dir: 0, tick: 0, look: LOOK }).map(p => p.layer);
  assert.deepEqual(s0, ['weapon', 'body', 'head'], 'slot 0: weapon behind body, effect act=0');
  const s1 = computeParts(D, { action: 'attack', dir: 0, tick: 3, look: LOOK }).map(p => p.layer);
  assert.deepEqual(s1, ['body', 'head', 'weapon', 'effect']);
  // 超過逐 slot 陣列長度 → 重複最後一個
  const s3 = computeParts(D, { action: 'attack', dir: 0, tick: 7, look: LOOK }).map(p => p.layer);
  assert.deepEqual(s3, ['body', 'head', 'weapon']);
});
test('attach inserts worn layers that the row order does not list', () => {
  const D = synth();
  const look = { ...LOOK, armor: 'plate', helmet: 'cap' };
  const order = computeParts(D, { action: 'walk', dir: 2, tick: 0, look }).map(p => p.layer);
  assert.deepEqual(order, ['body', 'armor', 'head', 'helmet', 'weapon', 'hand']);
  const armor = byLayer(computeParts(D, { action: 'walk', dir: 2, tick: 5, look }), 'armor');
  assert.equal(armor.seb, 'body/walk', 'armor follows body seb');
  assert.equal(armor.frame, 1, 'armor frame = slot');
  assert.deepEqual(armor.skin, { img: 'a', x: 500, y: 0 });
  const helm = byLayer(computeParts(D, { action: 'walk', dir: 2, tick: 5, look }), 'helmet');
  assert.equal(helm.seb, 'head/normal'); assert.equal(helm.frame, 2); assert.deepEqual([helm.x, helm.y], [0, -7], 'helmet follows head offsets');
  assert.deepEqual(effectiveOrder(D, D.actions.walk.rows[2], 0, LOOK), ['body', 'head', 'weapon', 'hand'], 'not worn → not inserted');
});

/* ------------------------------------------------------------ 武器隱藏 */
test('ball/show = 0 hides weapon; hideWeapon; hidden (fist) weapon; big weapon seb override', () => {
  const D = synth();
  D.actions.walk.rows[2].parts.weapon.show = [1, 0, 1, 1];
  const has = (tick, look = LOOK, extra = {}) => !!byLayer(computeParts(D, { action: 'walk', dir: 2, tick, look, ...extra }), 'weapon');
  assert.equal(has(0), true); assert.equal(has(4), false, 'slot 1 ball=0'); assert.equal(has(8), true);
  assert.equal(has(0, LOOK, { hideWeapon: true }), false);
  assert.equal(has(0, { ...LOOK, weapon: 'fist' }), false);
  assert.equal(has(0, { ...LOOK, weapon: null }), false);
  assert.equal(has(0, { ...LOOK, weapon: 'nope' }), false);
  D.actions.walk.rows[2].parts.weapon.show = [];
  assert.equal(has(0), false, 'empty ball → 0 → hidden');
  const big = byLayer(computeParts(D, { action: 'attack', dir: 0, tick: 0, look: { ...LOOK, weapon: 'big' } }), 'weapon');
  assert.equal(big.seb, 'weapon/sword');
});

/* ------------------------------------------------------------ 頭 */
test('head frame = direction, not slot', () => {
  const D = synth();
  for (let d = 0; d < 4; d++) for (const tick of [0, 5, 9, 13]) {
    assert.equal(byLayer(computeParts(D, { action: 'walk', dir: d, tick, look: LOOK }), 'head').frame, d);
  }
});
test('head mirror rule (headMirror && globalTick >= 1)', () => {
  const D = synth();
  const f = (dir, tick, globalTick) => byLayer(computeParts(D, { action: 'idle', dir, tick, globalTick, look: LOOK }), 'head').frame;
  for (let d = 0; d < 4; d++) {
    assert.equal(f(d, 0, 0), d, 'globalTick 0 → no mirror');
    assert.equal(f(d, 1, 1), MIRROR[d]);
    assert.equal(f(d, 0, 50), MIRROR[d], 'action tick reset but global tick running → mirror');
  }
  assert.deepEqual([...MIRROR], [1, 0, 3, 2], 'DV2 mirror table, 4 directions only');
  // 沒有 headMirror 的動作不鏡像
  assert.equal(byLayer(computeParts(D, { action: 'walk', dir: 1, tick: 5, look: LOOK }), 'head').frame, 1);
});
test('face override and per-action headSeb', () => {
  const D = synth();
  assert.equal(byLayer(computeParts(D, { action: 'cheer', dir: 2, tick: 0, look: LOOK }), 'head').seb, 'head/smile');
  assert.equal(byLayer(computeParts(D, { action: 'walk', dir: 2, tick: 0, look: LOOK, face: 'head/smile' }), 'head').seb, 'head/smile');
  assert.equal(byLayer(computeParts(D, { action: 'cheer', dir: 2, tick: 0, look: LOOK, face: 'head/normal' }), 'head').seb, 'head/normal');
});

/* ------------------------------------------------------------ 方向（4 方向，2026-11-13；docs/DV2-ADOPTION-PLAN.md Phase 2） */
test('dir8to4 (deprecated, behaviour kept for old callers)', () => {
  assert.equal(dir8to4('up'), DIR.UP); assert.equal(dir8to4('upLeft'), DIR.UP); assert.equal(dir8to4('upRight'), DIR.UP);
  assert.equal(dir8to4('down'), DIR.DOWN); assert.equal(dir8to4('downLeft'), DIR.DOWN); assert.equal(dir8to4('downRight'), DIR.DOWN);
  assert.equal(dir8to4('side'), DIR.RIGHT); assert.equal(dir8to4('side', -1), DIR.LEFT);
  assert.equal(dir8to4('sideLeft'), DIR.LEFT); assert.equal(dir8to4('left'), DIR.LEFT); assert.equal(dir8to4('right'), DIR.RIGHT);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(i => dir8to4(i)), [1, 2, 2, 2, 3, 0, 0, 0]);
  assert.equal(dir8to4(undefined), DIR.RIGHT);
});
test('engine is 4-directional: DIR, DIR_NAMES, MIRROR, effect frame, weapon origin', () => {
  assert.deepEqual(DIR, { UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3 });
  assert.deepEqual([...DIR_NAMES], ['up', 'right', 'down', 'left']);
  const D = synth();
  for (let d = 0; d < 4; d++) {
    const ps = computeParts(D, { action: 'attack', dir: d, tick: 3, look: LOOK });
    assert.equal(ps.dir, d); assert.equal(byLayer(ps, 'head').frame, d);
    assert.equal(byLayer(ps, 'effect').frame, 0 * 4 + d, 'effect frame = sebF * 4 + dir');
  }
});
test('migration: saved direction fields 0..7 → 4 directions (0→up 1→right 2→down 3→left 4→up 5→down 6→down 7→left)', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(migrateDir), [0, 1, 2, 3, 0, 2, 2, 3]);
  assert.deepEqual([...DIR_MIGRATE_8TO4], [DIR.UP, DIR.RIGHT, DIR.DOWN, DIR.LEFT, DIR.UP, DIR.DOWN, DIR.DOWN, DIR.LEFT]);
  assert.equal(migrateDir(12), migrateDir(4), 'other integers wrap mod 8'); assert.equal(migrateDir(-1), migrateDir(7));
  assert.equal(migrateDir('x'), null); assert.equal(migrateDir(NaN), null);
  // the engine applies the same table to any integer or legacy name it receives (no save field stores a direction today; see report)
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(d => dirIndex(d)), [0, 1, 2, 3, 0, 2, 2, 3]);
  assert.deepEqual(['upRight', 'downRight', 'downLeft', 'upLeft'].map(n => dirIndex(n)), [0, 2, 2, 3]);
  // and an old 8-row pack (assets/paperdoll/ placeholder) or an old state with dir 4..7 still renders: the migrated row is drawn
  const D = synth();
  for (let d = 0; d < 8; d++) {
    const ps = computeParts(D, { action: 'walk', dir: d, tick: 0, look: LOOK });
    assert.equal(ps.dir, migrateDir(d)); assert.equal(byLayer(ps, 'head').frame, migrateDir(d));
  }
});
test('dirIndex: names, facing, integers → 0..3', () => {
  assert.deepEqual(['up', 'side', 'down', 'sideLeft', 'right', 'left'].map(n => dirIndex(n)), [0, 1, 2, 3, 1, 3]);
  assert.equal(dirIndex('side', -1), 3); assert.equal(dirIndex('???', -1), 3); assert.equal(dirIndex('???'), 1);
  for (const v of [-9, -1, 0, 3, 4, 7, 8, 99, 'up', 'upLeft', null, undefined]) assert.ok([0, 1, 2, 3].includes(dirIndex(v)), `dirIndex(${v}) is 0..3`);
});
test('pickRow: 4 rows only, no diagonal fallback; missing row → right → down', () => {
  const r = i => ({ i });
  const eight = [r(0), r(1), r(2), r(3), r(4), r(5), r(6), r(7)];
  for (let d = 0; d < 4; d++) assert.equal(pickRow(eight, d).dir, d, 'an old 8-row table: only rows 0..3 are used');
  for (const d of [4, 5, 6, 7]) assert.equal(pickRow(eight, d).row.i < 4, true, 'a diagonal index never picks a diagonal row');
  assert.deepEqual([0, 2, 3].map(d => pickRow([null, r(1), null, null], d).dir), [1, 1, 1]);
  assert.deepEqual([0, 3].map(d => pickRow([null, null, r(2), null], d).dir), [2, 2]);
  assert.equal(pickRow([null, null, null, null], 0).row, null);
});
test('4-direction quantization (src/dir4.js): major screen axis wins, tie keeps the previous direction', () => {
  const S = (sx, sy) => fromScreen(sx, sy);
  const q = (sx, sy, prev) => { const v = S(sx, sy); return quantize4(v.x, v.z, prev); };
  assert.deepEqual([q(1, 0), q(0, 1), q(-1, 0), q(0, -1)], ['right', 'down', 'left', 'up']);
  assert.deepEqual([q(3, 1), q(1, 3), q(-3, -1), q(-1, -3)], ['right', 'down', 'left', 'up'], 'major axis wins');
  for (const [sx, sy, a, b] of [[1, 1, 'right', 'down'], [-1, 1, 'left', 'down'], [-1, -1, 'left', 'up'], [1, -1, 'right', 'up']]) {
    assert.equal(q(sx, sy, a), a); assert.equal(q(sx, sy, b), b, 'exact diagonal: keep the previous direction');
    assert.equal(q(sx, sy, null), a, 'no usable previous: the horizontal axis');
    assert.equal(q(sx * 1.05, sy, b), b, 'inside the 10% tie band: still the previous direction (no jitter)');
  }
  assert.equal(q(0, 0, 'up'), 'up', 'no movement keeps the previous direction');
  // a full sweep only ever yields the 4 names, and world axis vectors map back to themselves
  const seen = new Set(); for (let a = 0; a < 360; a += 0.5) { const v = S(Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180)); seen.add(quantize4(v.x, v.z, 'right')); seen.add(quantize4Stable(v.x, v.z, 'up')); }
  assert.deepEqual([...seen].sort(), ['down', 'left', 'right', 'up']);
  for (const [k, v] of Object.entries(AXIS_VEC)) { assert.equal(quantize4(v.x, v.z), k); const sc = toScreen(v.x, v.z); assert.ok(Math.abs(k === 'up' || k === 'down' ? sc.sx : sc.sy) < 1e-9, `${k} is a pure screen axis`); }
  // pixel-world names
  assert.deepEqual(['right', 'down', 'left', 'up'].map(k => vdir4(AXIS_VEC[k].x, AXIS_VEC[k].z)), ['side', 'down', 'sideLeft', 'up']);
});
test('stairStep: every sub-move is along one screen axis, stays within delta of the segment, arrives exactly', () => {
  for (const [tx, tz] of [[5, 0], [0, 5], [3, 4], [-6, 1], [2, -7], [0.3, 0.2]]) {
    const mem = {}; let p = { x: 0, z: 0 }, guard = 0, total = 0;
    const L = Math.hypot(tx, tz), lat = (x, z) => Math.abs(tx * z - tz * x) / L;
    for (;;) {
      const r = stairStep(mem, p, { x: tx, z: tz }, 0.07, { delta: 0.35, euclid: false });
      const du = ((r.x - p.x) - (r.z - p.z)) / Math.SQRT2, dv = ((r.x - p.x) + (r.z - p.z)) / Math.SQRT2;
      total += Math.abs(du) + Math.abs(dv);
      assert.ok(lat(r.x, r.z) <= 0.35 + 1e-9, `stays within delta of the straight segment (${lat(r.x, r.z).toFixed(3)})`);
      p = { x: r.x, z: r.z };
      if (r.arrived) break;
      assert.ok(++guard < 2000, 'terminates');
    }
    assert.deepEqual([p.x, p.z], [tx, tz], 'arrives exactly');
    const u = Math.abs(tx - tz) / Math.SQRT2, v = Math.abs(tx + tz) / Math.SQRT2;
    assert.ok(Math.abs(total - (u + v)) < 1e-6, 'path length = |du| + |dv| (a monotone staircase, no back-tracking)');
  }
  // euclid budget: a staircase over a diagonal segment takes exactly as many steps as the straight walk did
  const mem = {}; let p = { x: 0, z: 0 }, n = 0; for (;;) { const r = stairStep(mem, p, { x: 5, z: 0 }, 0.1, { delta: 0.35 }); p = r; n++; if (r.arrived) break; }
  assert.equal(n, 50, '5 units at 0.1 per step = 50 steps, staircase or not');
  // a blocked axis switches to the other one; both blocked = stuck, no movement
  const r1 = stairStep({}, { x: 0, z: 0 }, { x: 2, z: 0 }, 0.1, { ok: q => (q.x - q.z) <= 1e-9 });   // only "down" moves allowed
  assert.ok(r1.dir === 'down' && !r1.stuck);
  const r2 = stairStep({}, { x: 0, z: 0 }, { x: 2, z: 0 }, 0.1, { ok: () => false });
  assert.ok(r2.stuck && r2.x === 0 && r2.z === 0);
});

/* ------------------------------------------------------------ 動作名與計時 */
test('resolveAction: weapon-type variants, direction suffixes, aliases', () => {
  const D = synth();
  assert.equal(resolveAction(D, 'attack', 'bow'), 'attack.bow');
  assert.equal(resolveAction(D, 'attackDownLeft', 'bow'), 'attack.bow');
  assert.equal(resolveAction(D, 'attackUp', 'sword'), 'attack');
  assert.equal(resolveAction(D, 'stand'), 'idle');
  assert.equal(resolveAction(D, 'walkDownRight'), 'walk');
  assert.equal(resolveAction(D, 'nonsense'), 'idle');
});
test('actionTiming: impact/release ticks and seconds', () => {
  const D = synth();
  const t = actionTiming(D, 'attackDown', 'sword');
  assert.equal(t.key, 'attack'); assert.equal(t.ticks, 12); assert.equal(t.seconds, 0.6);
  assert.equal(t.impactSlot, 2); assert.equal(t.impactTick, 4); assert.equal(t.impactSec, 0.2);
  assert.equal(t.releaseSlot, 1); assert.equal(t.releaseTick, 2);
  delete D.actions.attack.impactSlot;
  assert.equal(actionTiming(D, 'attack').impactSlot, 2, 'impact defaults to release + 1');
  assert.equal(actionTiming(D, 'walk').impactSlot, null);
});
test('setAction resets action tick, not global tick', () => {
  let s = { action: 'walk', tick: 7, globalTick: 120 };
  assert.equal(setAction(s, 'walk'), s);
  s = setAction(s, 'attack');
  assert.deepEqual([s.action, s.tick, s.globalTick], ['attack', 0, 120]);
  s = advance(s, 3);
  assert.deepEqual([s.tick, s.globalTick], [3, 123]);
});

/* ------------------------------------------------------------ 獵人 → 外觀 */
/* ------------------------------------------------------------ 騎乘（§20）與怪物紙娃娃（§21）的純邏輯 */
test('riding: game pose -> DV2 ride action; depth rule; mount motion follows the rider release', () => {
  for (const seat of ['sit', 'stand']) {
    assert.equal(rideActionFor('idle', seat), `ride_${seat}`); assert.equal(rideActionFor('walk3', seat), `ride_${seat}`);
    assert.equal(rideActionFor('hurt', seat), `ride_${seat}`); assert.equal(rideActionFor('victory', seat), `ride_${seat}`);
    assert.equal(rideActionFor('skill', seat), `ride_charge_${seat}`);
    assert.equal(rideActionFor('windup', seat), 'ride_charge2'); assert.equal(rideActionFor('strike', seat), 'ride_charge2');
  }
  assert.equal(rideActionFor('idle', 'bogus'), 'ride_sit', 'unknown seat -> sit');
  const D = { actions: { ride_sit: { af: [6, 12], loop: true }, ride_charge2: { af: [6, 12, 18, 24], loop: false, releaseSlot: 1, spProc: 4 },
    ride_charge_sit: { af: [6, 12], loop: true, releaseSlot: 1 } } };
  assert.deepEqual(mountMotion(D, 'ride_sit', 3, true), { seb: 'walk', k: null });
  assert.deepEqual(mountMotion(D, 'ride_sit', 3, false), { seb: 'stand', k: null });
  assert.deepEqual([0, 3, 5].map(t => mountMotion(D, 'ride_charge2', t, true).seb), ['charge', 'charge', 'charge'], 'before the rider release: mount winds up');
  assert.deepEqual([6, 12, 23, 99].map(t => mountMotion(D, 'ride_charge2', t, true).seb), ['charge2', 'charge2', 'charge2', 'charge2'], 'from the release on: mount strikes (non-loop clamps)');
  assert.equal(mountMotion(D, 'ride_charge2', 6, false).k, 0); assert.ok(mountMotion(D, 'ride_charge2', 23, false).k > 0.9);
  assert.equal(mountMotion(D, 'ride_charge_sit', 13, false).seb, 'charge', 'loop wraps (13 -> 1)');
});
test('computeMonsterParts: strict species/action lookup, single body layer, frame = slot, 4 directions', () => {
  const fr = (u) => ({ max: 2, frames: { 0: [u, 0, 4, 4, -2, -4, 0, 0], 1: [u + 4, 0, 4, 4, -2, -4, 0, 0] } });
  const M = { tickRate: 200, layers: { body: { kind: 'slot' } }, skins: { body: { imp: { img: 'imp', x: 0, y: 0 } } }, images: { imp: 'imp.png' },
    sebs: { 'm/imp/walk/up': fr(0), 'm/imp/walk/right': fr(8), 'm/imp/walk/down': fr(16), 'm/imp/walk/left': { max: 2, frames: { 0: [8, 0, 4, 4, -2, -4, 1, 0], 1: [12, 0, 4, 4, -2, -4, 1, 0] } } },
    actions: { 'imp/walk': { af: [20, 40], loop: true, rows: ['up', 'right', 'down', 'left'].map(d => ({ parts: { body: { seb: `m/imp/walk/${d}`, off: [[0, 0]] } }, order: ['body'] })) } } };
  for (let d = 0; d < 4; d++) for (const [tick, slot] of [[0, 0], [19, 0], [20, 1], [40, 0]]) {
    const ps = computeMonsterParts(M, 'imp', { action: 'walk', dir: d, tick });
    assert.equal(ps.length, 1); assert.equal(ps[0].layer, 'body'); assert.equal(ps.dir, d); assert.equal(ps.slot, slot);
    assert.equal(ps[0].sprite[6], d === 3 ? 1 : 0, 'left mirrors');
  }
  assert.equal(computeMonsterParts(M, 'imp', { action: 0, dir: 1, tick: 0 }).length, 1, 'SEB_M index works');
  assert.equal(computeMonsterParts(M, 'ghost', { action: 'walk', dir: 1 }).length, 0, 'unknown species -> nothing (never another species)');
  assert.equal(computeMonsterParts(M, 'imp', { action: 'die', dir: 1 }).length, 0, 'missing action -> nothing');
  assert.equal(monsterFrameTick(M, 'imp', 'walk', 1), 20); assert.equal(monsterFrameTick(M, 'imp', 'walk', 0), 0);
});

test('lookFromHunter covers every class in CLASSES', () => {
  for (const c of CLASSES) assert.ok(CLASS_KIT[c.id], `CLASS_KIT has ${c.id}`);
  const want = { archer: 'bow', sorcerer: 'staff', priest: 'holystaff', paladin: 'sword', berserker: 'axe', assassin: 'dagger' };
  for (const [id, type] of Object.entries(want)) {
    const l = lookFromHunter({ classId: id, equipment: { weapon: false, armor: false }, weaponLevel: 0 });
    assert.equal(l.weaponType, type, id);
    assert.equal(l.armor, null); assert.equal(l.helmet, null);
    assert.equal(l.weapon, CLASS_KIT[id].weapon);
  }
  const p = lookFromHunter({ classId: 'paladin', equipment: { weapon: true, armor: true }, weaponLevel: 4 });
  assert.equal(p.weapon, 'sword_fine'); assert.equal(p.armor, 'plate'); assert.equal(p.helmet, 'helm'); assert.equal(p.shield, 'round');
  assert.equal(p.weaponLevel, 4);
  assert.equal(lookFromHunter({ classId: 'archer', equipment: { weapon: false }, weaponLevel: 7 }).weaponLevel, 0, 'no fine weapon → level not shown');
  assert.equal(lookFromHunter({ classId: '???' }).classId, 'berserker');
  assert.equal(lookFromHunter(null).weapon, 'axe');
});
test('lookFromHunter reads the current save shape (EQUIP_SLOTS: weapon + 6 gear slots, no armor key)', () => {
  // pixel-game.js 載入存檔時 h.equipment = EQUIP_SLOTS 每格一個布林（沒有 armor 這個 key）
  const eqOf = on => Object.fromEntries(EQUIP_SLOTS.map(s => [s, on.includes(s)]));
  assert.ok(!EQUIP_SLOTS.includes('armor'), 'current saves have no armor key');
  const none = lookFromHunter({ classId: 'paladin', equipment: eqOf([]) });
  assert.equal(none.armor, null); assert.equal(none.helmet, null); assert.equal(none.shield, 'round', 'shield is not gear');
  const helm = lookFromHunter({ classId: 'paladin', equipment: eqOf(['helm']) });
  assert.equal(helm.helmet, 'helm', 'helm slot → helmet'); assert.equal(helm.armor, 'plate', 'any gear slot → armor worn (= gearWorn)');
  for (const s of GAME_GEAR_SLOTS.filter(s => s !== 'helm')) {
    const l = lookFromHunter({ classId: 'paladin', equipment: eqOf([s]) });
    assert.equal(l.armor, 'plate', `${s} → armor`); assert.equal(l.helmet, null, `${s} alone → no helmet`);
  }
  const all = lookFromHunter({ classId: 'paladin', equipment: eqOf(EQUIP_SLOTS), weaponLevel: 4 });
  assert.deepEqual([all.armor, all.helmet, all.weapon, all.weaponLevel], ['plate', 'helm', 'sword_fine', 4]);
  assert.equal(lookFromHunter({ classId: 'archer', equipment: eqOf(['helm']) }).helmet, null, 'classes without a helmet kit stay bare');
  // 舊存檔（v2）：armor:true = 六件全穿（含頭盔）
  const legacy = lookFromHunter({ classId: 'paladin', equipment: { weapon: false, armor: true } });
  assert.deepEqual([legacy.armor, legacy.helmet], ['plate', 'helm']);
});

/* ------------------------------------------------------------ 佔位素材資料 */
const root = path.dirname(fileURLToPath(import.meta.url));
const placeholderJson = path.join(root, 'assets/paperdoll/paperdoll.json');
if (fs.existsSync(placeholderJson)) {
  const P = JSON.parse(fs.readFileSync(placeholderJson, 'utf8'));
  test('placeholder data: every image exists; every class/action/dir renders body+head(+weapon)', () => {
    for (const f of Object.values(P.images)) assert.ok(fs.existsSync(path.join(root, 'assets/paperdoll', f)), `missing ${f}`);
    for (const c of classesWithDollRig(P)) for (const eq of [{ weapon: false, armor: false }, { weapon: true, armor: true }]) {
      const look = lookFromHunter({ classId: c.id, equipment: eq, weaponLevel: 3 }, P);
      assert.ok(look.weapon && P.weapons[look.weapon], `${c.id} weapon ${look.weapon}`);
      if (eq.armor && !DV2_PARTS_ONLY.has(c.id)) assert.ok(look.armor, `${c.id} armor`);
      for (const action of ['idle', 'walk', 'attack', 'skill', 'hurt', 'death', 'victory']) {
        const tm = actionTiming(P, action, look.weaponType);
        assert.ok(tm && tm.slots >= 2, `${c.id} ${action} has ≥2 slots`);
        for (let d = 0; d < 8; d++) for (let tick = 0; tick < tm.ticks; tick++) {
          const ps = computeParts(P, { action, dir: d, tick, look });
          // legacy 8-row placeholder pack through the 4-direction engine: dir 4..7 (old diagonals) migrate, diagonal rows are never used
          assert.equal(ps.dir, migrateDir(d), `${c.id} ${tm.key} d${d} → 4-direction row ${migrateDir(d)}`);
          const L = ps.map(p => p.layer);
          for (const need of ['body', 'head', 'hand']) assert.ok(L.includes(need), `${c.id} ${action} d${d} t${tick} has ${need}`);
          if (eq.armor && !DV2_PARTS_ONLY.has(c.id)) assert.ok(L.includes('armor'), `${c.id} armor drawn`);
          assert.ok(L.includes('weapon'), `${c.id} ${action} d${d} t${tick} weapon drawn`);
          for (const p of ps) assert.ok(p.skin && P.images[p.skin.img], `${p.layer} skin`);
        }
      }
    }
  });
  test('placeholder data: per-class standing height recorded for in-game scaling (foot at cell y 92)', () => {
    for (const c of classesWithDollRig(P)) {
      const hh = P.meta.heroHeights[c.id];
      assert.ok(Number.isInteger(hh) && hh >= 60 && hh <= 96, `${c.id} heroHeight ${hh}`);
    }
    // 每一格的錨點都是腳底：slot 層裁成 64×72（腳底在 (32,66)），頭在 100 格（腳底 (50,92)）
    for (const f of Object.values(P.sebs['pose/idle/right'].frames)) assert.deepEqual(f.slice(4, 6), [-32, -66]);
    for (const f of Object.values(P.sebs['head/std'].frames)) assert.deepEqual(f.slice(4, 6), [-50, -92]);
    // 圖片以 1/2 解析度存，skin.scale = 2，所有 uv/offset 都是 2 的倍數
    for (const layer of Object.values(P.skins)) for (const sk of Object.values(layer)) { assert.equal(sk.scale, 2); assert.equal(sk.y % 2, 0); }
    for (const seb of Object.values(P.sebs)) for (const f of Object.values(seb.frames)) assert.ok(f.slice(0, 4).every(v => v % 2 === 0));
  });
  test('placeholder data (legacy pack): still ships 8 rows; the engine only reads rows 0..3', () => {
    for (const k of ['idle', 'walk', 'attack', 'attack.bow', 'attack.staff', 'skill', 'hurt', 'death', 'victory']) assert.equal(P.actions[k].rows.filter(Boolean).length, 8, k);
    assert.equal(P.sebs['head/std'].max, 8);
    assert.equal(P.meta.effectDirs, 8); assert.equal(P.sebs['fx/slash'].max, 16);
  });
  /* ---------------------------------------------------------- 遊戲時序 → 紙娃娃 tick（paperdoll-hero.js） */
  const slotAt = (r) => getSlot(P.actions[r.action].af, r.tick);
  const strike = (wt, atk, extra = {}) => dollActionTick({ pose: 'strike', t: 10 + atk, atkAt: 10, hitDelay: 0.07, hitStop: 0.07, strikeEnd: 0.345, data: P, weaponType: wt, ...extra });
  test('timing: melee impactSlot starts exactly when the game hit lands, holds HIT_STOP', () => {
    const a = P.actions.attack;
    for (let ms = 0; ms <= 344; ms++) {
      const r = strike('sword', ms / 1000);
      assert.equal(r.action, 'attack');
      const s = slotAt(r);
      if (ms < 70) assert.equal(s, a.releaseSlot, `${ms}ms before the hit = release slot`);
      else if (ms < 140) { assert.equal(s, a.impactSlot, `${ms}ms impact (incl. hit stop)`); }
      else assert.ok(s >= a.impactSlot, `${ms}ms after = impact or recover`);
    }
    assert.equal(slotAt(strike('sword', 0.344)), 3, 'recover slot reached before the strike window closes');
    // 目標的 hitAt 不同時（例如別的延遲）照它對時
    assert.equal(slotAt(strike('axe', 0.12, { hitDelay: 0.12 })), a.impactSlot);
    assert.equal(slotAt(strike('axe', 0.119, { hitDelay: 0.12 })), a.releaseSlot);
  });
  test('timing: ranged release slot starts at atkAt (projectile spawns), windup stays before release', () => {
    for (const wt of ['bow', 'staff']) {
      const key = wt === 'bow' ? 'attack.bow' : 'attack.staff', rel = P.actions[key].releaseSlot;
      assert.equal(strike(wt, 0).action, key);
      assert.equal(slotAt(strike(wt, 0)), rel);
      for (let ms = 0; ms < 345; ms += 5) assert.ok(slotAt(strike(wt, ms / 1000)) >= rel);
      for (let k = 0; k <= 1; k += 0.05) {
        const r = dollActionTick({ pose: 'windup', windupT: k * 0.45, windupLen: 0.45, data: P, weaponType: wt });
        assert.ok(slotAt(r) < rel, `windup ${k} before release`);
      }
    }
    const w = dollActionTick({ pose: 'windup', windupT: 0.44, windupLen: 0.45, data: P, weaponType: 'sword' });
    assert.ok(slotAt(w) < P.actions.attack.releaseSlot);
  });
  test('timing: skill release at SKILLS[].release; hurt/walk/idle; dead → sheet', () => {
    const rel = SKILLS.sorcerer.release;
    const sk = x => slotAt(dollActionTick({ pose: 'skill', t: 5 + x, skillAt: 5, skillRelease: rel, skillLen: 0.675, data: P, weaponType: 'staff' }));
    assert.ok(sk(rel - 0.001) < P.actions.skill.releaseSlot); assert.equal(sk(rel), P.actions.skill.releaseSlot);
    const hurt = x => slotAt(dollActionTick({ pose: 'hurt', hit: x, hurtLen: 0.4, data: P }));
    assert.equal(hurt(0), 0); assert.equal(hurt(0.39), P.actions.hurt.af.length - 1);
    const walk = i => slotAt(dollActionTick({ pose: 'walk' + (i + 1), i, walkFrames: 8, data: P }));
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(walk), [0, 0, 1, 1, 2, 2, 3, 3], '8 sheet walk frames → 4 doll slots in order');
    // death / victory：資料有就用自己的動作
    const d0 = dollActionTick({ pose: 'dead', deathT: 0, deathLen: 0.96, data: P });
    assert.equal(d0.action, 'death'); assert.equal(slotAt(d0), 0);
    const d1 = dollActionTick({ pose: 'dead', deathT: 5, deathLen: 0.96, data: P });
    assert.equal(slotAt(d1), P.actions.death.af.length - 1, 'lying held after the fall');
    const v = dollActionTick({ pose: 'victory', cheerT: 0.3, data: P });
    assert.equal(v.action, 'victory');
    // 沒有 death / victory 的資料包：衍生（hurt 末格 + 倒下旋轉；skill 舉起段循環），不回 null
    const Q = { ...P, actions: Object.fromEntries(Object.entries(P.actions).filter(([k]) => k !== 'death' && k !== 'victory')) };
    const dq = dollActionTick({ pose: 'dead', deathT: 0.2, data: Q });
    assert.equal(dq.action, 'hurt'); assert.equal(dq.derived, 'death'); assert.ok(dq.lie > 0.4 && dq.lie < 0.5);
    assert.equal(dollActionTick({ pose: 'dead', deathT: 3, data: Q }).lie, 1);
    const vq = dollActionTick({ pose: 'victory', cheerT: 0.4, data: Q, weaponType: 'sword' });
    assert.equal(vq.action, 'skill'); assert.ok(slotAt(vq) < P.actions.skill.releaseSlot);
  });
  test('advanceNoSkip: one slot per drawn frame within an attack; same game time redraw holds', () => {
    const af = P.actions.attack.af;
    const prev = { stamp: 1, key: 'attack', slot: 1, tick: 3, t: 10 };
    assert.equal(advanceNoSkip(prev, { action: 'attack', tick: 12 }, 1, 10.1, af), 6, 'skip 1→3 becomes 1→2');
    assert.equal(advanceNoSkip(prev, { action: 'attack', tick: 12 }, 1, 10, af), 3, 'same t → same tick');
    assert.equal(advanceNoSkip(prev, { action: 'attack', tick: 12 }, 2, 10.1, af), 12, 'new attack → no carry');
    assert.equal(advanceNoSkip(null, { action: 'attack', tick: 12 }, 1, 10.1, af), 12);
  });
  test('hurtChain: re-hits during a hurt continue it; a hit after it ends restarts', () => {
    let c = hurtChain(null, 5, 5, 0.4);
    assert.deepEqual(c, { start: 5 });
    c = hurtChain(c, 5.2, 5.2, 0.4); assert.equal(c.start, 5, 'second hit 0.2 s later continues');
    c = hurtChain(c, 5.35, 5.39, 0.4); assert.equal(c.start, 5);
    c = hurtChain(c, 5.6, 5.6, 0.4); assert.equal(c.start, 5.6, 'after the hurt finished → new hurt');
    // 每 0.2 秒被打一次：slot 只往前，不再 0→1→0→1
    let prev = null, last = -1, ch = null, restarts = 0;
    for (let t = 10; t < 11.2; t += 0.1) {
      const hitAt = 10 + Math.floor((t - 10 + 1e-9) / 0.2) * 0.2;
      ch = hurtChain(ch, hitAt, t, 0.4);
      const s = slotAt(dollActionTick({ pose: 'hurt', hit: t - ch.start, hurtLen: 0.4, data: P }));
      if (prev === ch.start) assert.ok(s >= last, `slot does not go back within a chain (t ${t.toFixed(1)})`);
      else restarts++;
      prev = ch.start; last = s;
    }
    assert.ok(restarts >= 2 && restarts <= 4, `a new hurt starts only after the previous one finished (${restarts})`);
  });
  test('doll facing proof: the drawn left/right always equals the sheet facing (or is neutral up/down)', () => {
    const HOR = [0, 1, 0, -1];   // 4 directions: up/down are neutral, right = +1, left = -1
    for (const action of ['idle', 'walk', 'attack', 'skill', 'hurt']) for (const vdir of ['side', 'down', 'sideLeft', 'up', 'downRight', 'downLeft', 'upLeft', 'upRight'])
      for (const facing of [1, -1]) {
        const ps = computeParts(P, { action, dir: dollDirName(vdir, facing), tick: 0, look: lookFromHunter({ classId: 'paladin' }, P) });
        const hor = HOR[ps.dir];
        assert.ok(hor === 0 || hor === facing, `${action} ${vdir} facing ${facing} → dir ${ps.dir}`);
      }
  });
  test('coverage: every class × every game pose × 4 directions renders from the paperdoll (no sheet fallback)', () => {
    const packs = [['placeholder', P]];
    // 遊戲用的包：DV2 格式原創包（assets/paperdoll-dv2）。pixelfx 包（paperdoll-classes）遊戲不再讀，這裡也不測。
    const dv2Json = path.join(root, 'assets/paperdoll-dv2/paperdoll.json');
    if (fs.existsSync(dv2Json)) packs.push(['paperdoll-dv2', JSON.parse(fs.readFileSync(dv2Json, 'utf8'))]);
    for (const [name, D] of packs) {
      for (const c of classesWithDollRig(D)) {
        assert.ok(D.skins.body[c.id], `${name}: body skin for ${c.id}`);
        for (const eq of [{ weapon: false }, { weapon: true, armor: true }]) {
          const look = lookFromHunter({ classId: c.id, equipment: eq, weaponLevel: 2 }, D);
          assert.equal(look.classId, c.id, `${name}: ${c.id} keeps its own look`);
          for (const pose of ['idle', 'walk3', 'windup', 'strike', 'skill', 'hurt', 'dead', 'victory']) {
            const r = dollActionTick({ pose, i: 2, t: 10.1, atkAt: 10, skillAt: 10, hit: 0.1, windupT: 0.2, windupLen: 0.45, hitDelay: 0.07,
              strikeEnd: 0.345, hitStop: 0.07, skillRelease: 0.25, skillLen: 0.675, hurtLen: 0.4, walkFrames: 8, elapsed: 3, seed: 0.3,
              deathT: 0.3, deathLen: 0.96, cheerT: 0.5, data: D, weaponType: look.weaponType });
            assert.ok(r, `${name}: ${c.id} ${pose} maps to a doll action`);
            for (let d = 0; d < 4; d++) {
              const ps = computeParts(D, { action: r.action, dir: d, tick: r.tick, look });
              const L = ps.map(p => p.layer);
              assert.ok(L.includes('body') && (L.includes('head') || (name === 'paperdoll-dv2' && pose === 'dead')), `${name}: ${c.id} ${pose} d${d} draws body+head`); // dv2: the lying body cell (DV2 down pose) carries its own head
              assert.equal(ps.dir, d, `${name}: ${c.id} ${pose} d${d} uses a real row`);
            }
          }
        }
      }
    }
  });
  {
    const dv2Dir = path.join(root, 'assets/paperdoll-dv2');
    if (fs.existsSync(path.join(dv2Dir, 'paperdoll.json'))) {
      const DV = JSON.parse(fs.readFileSync(path.join(dv2Dir, 'paperdoll.json'), 'utf8'));
      test('DV2-format pack: schema, files, DV2 grid geometry, every frame inside its sheet', () => {
        assert.equal(DV.format, 'mistvale-paperdoll'); assert.equal(DV.version, 1);
        assert.match(DV.meta.layout, /^dv2fmt v1/);
        for (const l of ['body', 'hand', 'armor', 'head', 'helmet', 'weapon', 'shield', 'effect']) assert.ok(DV.layers[l], `layer ${l}`);
        assert.equal(DV.layers.shield.kind, 'weapon', 'shield is a weapon-format sprite on the off hand');
        for (const f of Object.values(DV.images)) assert.ok(fs.existsSync(path.join(dv2Dir, f)), f);
        // DV2 geometry: body cells 30x30 anchored at the foot (-15,-30); heads/hats 20x20 at (-10,-20); weapons 40x40 with grip x = 20
        // 圖集尺寸從 PNG 檔頭讀，不要寫死：武器表從 2 欄（80x40）長到 4 欄（160x40）過一次，
        // 寫死會讓「每一幀都在自己的表內」這條檢查變成假失敗。
        const pngSize = (file) => {
          const b = fs.readFileSync(path.join(dv2Dir, file));
          assert.equal(b.toString('ascii', 1, 4), 'PNG', `${file} is a PNG`);
          return [b.readUInt32BE(16), b.readUInt32BE(20)];
        };
        const SHEET = {
          body: pngSize(DV.images.body), hand: pngSize(DV.images.hand), armor: pngSize(DV.images.armor),
          head: pngSize(DV.images.head), helmet: pngSize(DV.images.hat),
          weapon: pngSize(DV.images.weapon), shield: pngSize(DV.images.weapon), effect: pngSize(DV.images.fx),
        };
        // DV2 rig at 2x (docs/PAPERDOLL.md §22.6, pipeline/scripts/dv2fmt/rig2x.py): the same geometry doubled, in its own *_x2 atlases
        if (DV.images.body2x) Object.assign(SHEET, { body2x: pngSize(DV.images.body2x), hand2x: pngSize(DV.images.hand2x), head2x: pngSize(DV.images.head2x),
          weapon2x: pngSize(DV.images.weapon2x), effect2x: pngSize(DV.images.fx2x), hat2x: pngSize(DV.images.hat2x) });
        for (const [k, seb] of Object.entries(DV.sebs)) for (const fr of Object.values(seb.frames)) {
          const [u, v, w, h, tx, ty] = fr;
          const kind = k.startsWith('body/') ? 'body' : k.startsWith('head/') ? 'head' : k === 'hat/std' ? 'helmet' : k === 'weapon/std' ? 'weapon'
            : k.startsWith('body2x/') ? 'body2x' : k.startsWith('hand2x/') ? 'hand2x' : k.startsWith('head2x/') ? 'head2x' : k === 'weapon2x/std' ? 'weapon2x'
            : k.startsWith('fx2x/') ? 'effect2x' : k === 'hat2x/std' ? 'hat2x' : 'effect';
          const [W, H] = SHEET[kind];
          assert.ok(u >= 0 && v >= 0 && u + w <= W && v + h <= H, `${k} frame inside a ${W}x${H} sheet`);
          if (kind === 'body') assert.deepEqual([w, h, tx, ty], [30, 30, -15, -30]);
          if (kind === 'head' || kind === 'helmet') assert.deepEqual([w, h, tx, ty], [20, 20, -10, -20]);
          if (kind === 'weapon') assert.deepEqual([w, h], [40, 40]);
          if (kind === 'effect') assert.deepEqual([w, h], [30, 30]);
          if (kind === 'hand2x') assert.deepEqual([w, h, tx, ty], [60, 60, -30, -60], k);
          // body2x (Phase 6, class-agnostic 2x rows): the per-class collar-to-neck shift is folded into the frame's tx/ty -> a few px off the anchor
          if (kind === 'body2x') { assert.deepEqual([w, h], [60, 60], k); assert.ok(Math.abs(tx + 30) <= 16 && Math.abs(ty + 60) <= 16, `${k} shift ${tx + 30},${ty + 60}`); }
          if (kind === 'hat2x') assert.deepEqual([w, h, tx, ty], [40, 40, -20, -40], k);
          if (kind === 'head2x') assert.deepEqual([w, h, tx, ty], [40, 40, -20, -40], k);
          if (kind === 'weapon2x') assert.deepEqual([w, h], [80, 80]);
          if (kind === 'effect2x') assert.deepEqual([w, h], [60, 60]);
        }
        for (const [n, wp] of Object.entries(DV.weapons)) assert.equal(wp.handle[0], wp.seb === 'weapon2x/std' ? 40 : 20, `${n} grip x at the cell centre (mirror-safe)`);
        for (const { id: c } of classesWithDollRig(DV)) {
          assert.ok(DV.skins.body[c] && DV.skins.head[c] && DV.skins.hand[c], `${c} has body/head/hand sheets`);
          const sc = (DV.meta.rig2x && DV.meta.rig2x[c]) || 1;   // a 2x-rig class measures in 2x pixels; DV2's own chibi is ~18 px at 1x
          assert.ok(DV.meta.heroHeights[c] / sc >= 16 && DV.meta.heroHeights[c] / sc <= 34, `${c} chibi height ${DV.meta.heroHeights[c]} (rig scale ${sc})`);
        }
        for (const [a, act] of Object.entries(DV.actions)) assert.equal(act.rows.length, 4, `${a}: exactly 4 rows (up, right, down, left)`);
        for (const [a, act] of Object.entries(DV.actions)) assert.equal(act.rows.filter(Boolean).length, 4, `${a}: 4 real rows`);
        assert.equal(DV.meta.effectDirs, 4); assert.deepEqual(DV.meta.dirs, ['up', 'right', 'down', 'left']);
        for (const [k, seb] of Object.entries(DV.sebs)) if (k.startsWith('head/') || k === 'hat/std') assert.equal(seb.max, 4, `${k}: 4 direction frames`);
        assert.ok(Array.isArray(DV.meta.placeholder), 'meta.placeholder lists sheets still from the placeholder re-cut');
      });
      // DV2 rig at 2x (rig2x.py): a 2x class plays only the actions marked rig 2 (its weapon type's), a 1x class never does
      const rigOfAct = (D, key) => (D.actions[key] && D.actions[key].rig) || 1;
      const rigOfCls = (D, c) => (D.meta.rig2x && D.meta.rig2x[c]) || 1;
      const baseOf = k => k.replace(/@2x$/, '').split('.')[0];   // 'death.sword@2x' -> 'death'
      test('DV2-format pack: every class x action x 4 dirs draws body+head+hand+weapon (+shield for paladin), mirrored rows mirror', () => {
        for (const c of classesWithDollRig(DV)) for (const eq of [{ weapon: false, armor: false }, { weapon: true, armor: true }]) {
          const look = lookFromHunter({ classId: c.id, equipment: eq }, DV);
          assert.equal(look.classId, c.id);
          for (const action of Object.keys(DV.actions)) {
            // Phase 6: the key itself says its rig ('<key>@2x' rows are class-agnostic and only played by a 2x class)
            if (rigOfAct(DV, action) !== rigOfCls(DV, c.id)) continue;
            const tm = actionTiming(DV, action, look.weaponType, look.rig);
            for (let d = 0; d < 4; d++) for (let tick = 0; tick < tm.ticks; tick += 2) {
              const ps = computeParts(DV, { action, dir: d, tick, look });
              const L = ps.map(p => p.layer);
              assert.equal(ps.dir, d, `${c.id} ${action} d${d} real row`);
              const dead = baseOf(action) === 'death';   // DV2 down pose: the lying cell carries its own head and the weapon is not drawn (ballHaveInfo 0)
              // riding (§20) and the Phase 6 life sets (徒手/物持ち/泣く/拍手/物渡し/握手/ﾊﾟﾝﾁ/石化): DV2 ball 0 = no weapon — follow the row's show flag exactly
              const rideHidden = at(DV.actions[tm.key].rows[d].parts.weapon.show, getSlot(DV.actions[tm.key].af, tick), 1) === 0;
              if (rideHidden) assert.ok(!L.includes('weapon'), `${c.id} ${action} d${d} t${tick}: no weapon (DV2 ball 0)`);
              for (const need of ['body', 'head', 'hand', 'weapon']) if (!(dead && (need === 'head' || need === 'weapon')) && !(rideHidden && need === 'weapon')) assert.ok(L.includes(need), `${c.id} ${action} d${d} t${tick} ${need}`);
              if (look.armor) assert.ok(L.includes('armor'), `${c.id} armor`); else assert.ok(!L.includes('armor'), `${c.id} no armor when not worn`);
              if (look.helmet && !dead) assert.ok(L.includes('helmet'), `${c.id} helmet drawn`);
              if (c.id === 'paladin' && !dead) assert.ok(L.includes('shield'), `paladin ${action} d${d} shield`);
              const body = ps.find(p => p.layer === 'body');
              assert.equal(body.sprite[6], d === 3 ? 1 : 0, 'left mirrors the body cell');
            }
          }
        }
      });
      test('DV2-format pack: class-aware armour (<set>.<class> + shared <set> fallback) + one cloak; paladin helm; holystaff type', () => {
        const AK = Object.keys(DV.skins.armor || {});
        for (const set of ['leather', 'mantle', 'plate']) assert.ok(AK.includes(set), `shared ${set} sheet ships (lookFromHunter fallback)`);
        assert.ok(AK.every(k => /^(leather|mantle|plate)(\.[a-z]+)?$/.test(k)), `armour keys are <set> or <set>.<class>: ${AK.join(',')}`);
        // per-class sheets present in src/ -> keys present (works whether or not the art agent has delivered them yet)
        const SRC = path.join(dv2Dir, 'src');
        for (const set of ['leather', 'mantle', 'plate']) for (const c of DV.meta.classes)
          assert.equal(AK.includes(`${set}.${c}`), fs.existsSync(path.join(SRC, `armor_${set}_${c}.png`)), `skins.armor["${set}.${c}"] <-> src/armor_${set}_${c}.png`);
        for (const c of classesWithDollRig(DV)) {
          const lk = lookFromHunter({ classId: c.id, equipment: { chest: true } }, DV), set = CLASS_KIT[c.id].armor;
          // DV2_PARTS_ONLY and 2x-rig classes (Phase 6 G9: the 1x armour cannot sit on a 2x body) wear none
          assert.equal(lk.armor, DV2_PARTS_ONLY.has(c.id) || rigOfCls(DV, c.id) === 2 ? null : AK.includes(`${set}.${c.id}`) ? `${set}.${c.id}` : set, `${c.id}: class sheet if shipped, else the shared ${set} (DV2_PARTS_ONLY / 2x rig: none)`);
        }
        const noCls = { ...DV, skins: { ...DV.skins, armor: { plate: DV.skins.armor.plate } } };
        assert.equal(lookFromHunter({ classId: 'darkknight', equipment: { chest: true } }, noCls).armor, 'plate', 'missing class sheet -> plain <set>');   // darkknight: plate + helm + shield, always 1x
        assert.equal(armorSkin(null, 'plate', 'paladin'), 'plate', 'no data -> plain <set>');
        assert.ok(DV.images.armor && fs.existsSync(path.join(dv2Dir, 'atlas_armor.png')), 'armor atlas ships');
        assert.deepEqual(Object.keys(DV.skins.cape || {}), ['cloak'], 'one cloak, drawn by gen_cape.py');
        assert.ok(DV.images.cape && fs.existsSync(path.join(dv2Dir, 'atlas_cape.png')), 'cape atlas ships');
        assert.ok(!DV.meta.placeholder.some(n => n.startsWith('armor_') || n.startsWith('cape_')), 'no placeholder armour/cloak');
        const eq = Object.fromEntries(EQUIP_SLOTS.map(s => [s, true]));
        const look = lookFromHunter({ classId: 'darkknight', equipment: eq }, DV);
        assert.deepEqual([look.armor.split('.')[0], look.helmet, look.shield], ['plate', 'helm', 'round']);
        if (rigOfCls(DV, 'paladin') === 2) {   // the same gear on a 2x paladin: DV2 parts + 2x shield + 2x helm, no armour / cape
          const p2 = lookFromHunter({ classId: 'paladin', equipment: { ...eq, cape: true } }, DV);
          assert.deepEqual([p2.armor, p2.cape, p2.shield, p2.rig], [null, null, 'round@2x', 2]); assert.match(p2.helmet, /^(iron_helm|helm)@2x/);
        }
        const L = computeParts(DV, { action: 'idle', dir: 2, tick: 0, look }).map(p => p.layer);
        assert.ok(L.includes('armor') && L.includes('helmet') && L.includes('shield'), L.join(','));
        assert.ok(L.indexOf('armor') > L.indexOf('body'), 'armor is worn over the body');
        // 披風是迷霧村自加的背影層（DV2 沒有）：equipment.cape 才穿，且一定畫在 body 之前
        const caped = lookFromHunter({ classId: 'darkknight', equipment: { cape: true } }, DV);
        assert.equal(caped.cape, 'cloak');
        for (const action of Object.keys(DV.actions)) for (let d = 0; d < 4; d++) {
          if (rigOfAct(DV, action) === 2) continue;   // 2x rows: no cape layer (a 2x class wears none)
          const L2 = computeParts(DV, { action, dir: d, tick: 0, look: caped }).map(p => p.layer);
          assert.ok(L2.includes('cape') && L2.indexOf('cape') < L2.indexOf('body'), `cape is drawn behind the body (${action} d${d})`);
        }
        assert.equal(DV.weapons.holystaff.type, 'holystaff'); assert.equal(DV.weapons.holystaff_fine.type, 'holystaff');
        assert.equal(DV.weapons.holystaff.type, CLASS_KIT.priest.type, 'pack weapon type = CLASS_KIT');
      });
      test('DV2-format pack: game timing contract on the DV2-derived tables (melee impact, ranged release, skill release)', () => {
        const slotOf = r => getSlot(DV.actions[r.action].af, r.tick);
        for (const wt of ['sword', 'axe', 'dagger']) {
          const key = `attack.${wt}`, A = DV.actions[key];
          assert.ok(A.releaseSlot >= 1 && A.impactSlot > A.releaseSlot, `${key} has windup < release < impact`);
          for (let ms = 0; ms <= 344; ms++) {
            const r = dollActionTick({ pose: 'strike', t: 10 + ms / 1000, atkAt: 10, hitDelay: 0.07, hitStop: 0.07, strikeEnd: 0.345, data: DV, weaponType: wt });
            assert.equal(r.action, key);
            const sl = slotOf(r);
            if (ms < 70) assert.ok(sl >= A.releaseSlot && sl < A.impactSlot, `${key} ${ms}ms: release, never the impact before the hit`);
            else if (ms < 140) assert.equal(sl, A.impactSlot, `${key} ${ms}ms: impact (+ hit stop)`);
            else assert.ok(sl >= A.impactSlot);
          }
          for (let k = 0; k < 1; k += 0.05) assert.ok(slotOf(dollActionTick({ pose: 'windup', windupT: k * 0.45, windupLen: 0.45, data: DV, weaponType: wt })) < A.releaseSlot);
        }
        for (const wt of ['bow', 'staff', 'holystaff']) {
          const key = `attack.${wt}`, A = DV.actions[key];
          const r0 = dollActionTick({ pose: 'strike', t: 10, atkAt: 10, data: DV, weaponType: wt, strikeEnd: 0.345 });
          assert.equal(r0.action, key); assert.equal(slotOf(r0), A.releaseSlot, `${key}: release slot at atkAt`);
          for (let k = 0; k < 1; k += 0.05) assert.ok(slotOf(dollActionTick({ pose: 'windup', windupT: k * 0.45, windupLen: 0.45, data: DV, weaponType: wt })) < A.releaseSlot);
        }
        for (const [wt, rel] of [['staff', SKILLS.sorcerer.release], ['bow', SKILLS.archer.release], ['sword', 0.25], ['axe', 0.25], ['dagger', 0.25], ['holystaff', 0.25]]) {
          const sk = x => dollActionTick({ pose: 'skill', t: 5 + x, skillAt: 5, skillRelease: rel, skillLen: 0.675, data: DV, weaponType: wt });
          const A = DV.actions[sk(0).action];
          assert.ok(slotOf(sk(rel - 0.001)) < A.releaseSlot, `skill.${wt} before release`); assert.equal(slotOf(sk(rel)), A.releaseSlot, `skill.${wt} release lines up`);
        }
        const d = dollActionTick({ pose: 'dead', deathT: 5, deathLen: 0.96, data: DV, weaponType: 'sword' });
        assert.equal(slotOf(d), DV.actions.death.af.length - 1, 'death holds its (only) lying slot');
      });
      {
        // The motion structure equals the DV2 kit's (runs only where the kit exists locally; read in memory, nothing written). Mapping: tools/dv2-motion-derive.mjs
        const KITD = process.env.DV2_KIT_DIR || 'C:/Users/ray/Desktop/Claude code/dv2-lab/kit';
        if (fs.existsSync(path.join(KITD, 'data/data.js'))) test('DV2-format pack: motion structure matches the DV2 kit (af, loop, weapon direction/inv/show, draw order, effect slots)', () => {
          const box = { window: {} }; vm.createContext(box); vm.runInContext(fs.readFileSync(path.join(KITD, 'data/data.js'), 'utf8'), box);
          const K = box.window.DV2, DV2_DIR = [0, 1, 2, 3], THETA = [0, 22, 36, -20];   // our up/right/down/left <- DV2 d0/d1/d2/d3, 1:1 (d3 = side + ru mirror; 2026-11-14 fix)
          const BOW_RELEASE = !!JSON.parse(fs.readFileSync('assets/paperdoll-dv2/src/sources.json', 'utf8'))['weapon_bow.png']?.releaseCol;
          const norm = x => { let v = ((Math.round(x) % 360) + 360) % 360; if (v > 180) v -= 360; return v === -180 ? 180 : v; };
          let n = 0;
          for (const [k, A] of Object.entries(DV.actions)) {
            if (!A.dv2) continue;
            const S = K.sets.find(x => x.id === A.dv2.set);
            assert.deepEqual(A.af, [...S.af], `${k}: af = DV2 set ${S.id}`); assert.equal(!!A.loop, !!(S.fl & 1), `${k}: loop`);
            assert.equal(A.rows.length, 4, `${k}: 4 rows`);
            for (let d = 0; d < 4; d++) {
              // 揮擊類（非弓）的左向 = 右向的鏡像（tools/dv2-motion-derive.mjs SWING_SETS，2026-11-14 逐動作稽核）：
              // DV2 左向的持武器手在遠側，我們的左向是側面圖翻轉、手在近側，所以拿 kit 的右向比、翻面相反、角度變號。
              const mir = d === 3 && [18, 19, 20, 21, 22, 23, 24, 25, 31].includes(S.id) && S.id !== 24 && A.dv2.bowArt !== true;   // Phase 6: 18/19 punch, 25 gun
              const r = K.rows.find(x => x.set === S.id && x.direct === (mir ? 1 : DV2_DIR[d])), row = A.rows[d], w = row.parts.weapon;
              const ko = r.order.filter(x => x >= 0), oo = row.order;
              assert.equal(ko.indexOf(4) < ko.indexOf(0), oo.indexOf('weapon') < oo.indexOf('body'), `${k} d${d}: weapon behind/in front of the body like DV2`);
              if (ko.includes(5)) assert.equal(ko.indexOf(5) < ko.indexOf(0), oo.indexOf('effect') < oo.indexOf('body'), `${k} d${d}: effect order like DV2`);
              S.af.forEach((_, i) => {
                const at = (a, dflt) => (a && a.length ? a[Math.min(i, a.length - 1)] : dflt);
                // DV2-PARITY D36 (2026-11-15): 銃 is a gun pose; a 2x non-gun shoot row plays it empty-handed (no weapon, no muzzle flash)
                if (/^shoot\.(?!gun)/.test(k) && k.endsWith('@2x')) {
                  assert.equal(at(w.show, 1), 0, `${k} d${d} slot${i}: no weapon (D36)`);
                  assert.ok(!(row.parts.effect && at(row.parts.effect.act, 0)), `${k} d${d} slot${i}: no muzzle flash (D36)`); n++; return;
                }
                assert.equal(at(w.show, 1), at(r.ball, 1) ? 1 : 0, `${k} d${d} slot${i}: weapon shown like DV2`);
                const bow = A.dv2.set === 24 || A.dv2.bowArt === true, col = at(r.wsebF, 0), inv = at(r.winv, 0);   // bowArt: a bow variant of a non-bow set (乗る_攻撃2 .bow)
                // 四欄美術（2026-11-14）：傾角已烘在 weapon sheet 的四個欄位裡（gen_weapon_dirs.py 的 THETA），
                // 所以執行期只做 DV2 的直角旋轉（0/90/180），不再加 THETA。翻面（inv）由鏡像自動把傾角反過來。
                const want = norm((mir ? -1 : 1) * at(r.wdeg, 0));
                // weapon.carry (2026-11-14): generated bodies hold the weapon low at the real fist in carry poses on purpose (pixellab_body.py)
                const carry = !!at(w.carry, 0);
                if (!carry) assert.equal(norm(at(w.deg, 0)), want, `${k} d${d} slot${i}: on-screen weapon direction`);
                assert.equal(at(w.inv, 0), (bow ? 1 - inv : inv) ^ (mir ? 1 : 0), `${k} d${d} slot${i}: weapon flip`);
                // bow sheet columns: 0 rest / 1 drawn / 2 release (gen_bow_release.py, only the 弓 set 24 uses the release column)
                if (bow) assert.equal(at(w.sebF, 0), col === 1 ? 1 : col === 2 && A.dv2.set === 24 && BOW_RELEASE ? 2 : 0, `${k} d${d} slot${i}: drawn bow frame`);
                else if (!carry) assert.equal(at(w.sebF, 0), col, `${k} d${d} slot${i}: baked tilt column`);
                // DV2 effect type -> ours (0 slash, 1 hslash, 2 thrust, 3 punch, 4 gunfire); a type whose art is not in the pack is not drawn
                const kAct = !!at(r.wact, 0) && !!DV.effects[['slash', 'hslash', 'thrust', 'punch', 'gunfire'][at(r.wtype, 0)]];
                const fx = row.parts.effect, ourAct = !!(fx && at(fx.act, 0)) && at(fx.type, '').replace(/@2x$/, '') !== 'burst';   // burst = our own staff effect (2x: burst@2x)
                assert.equal(ourAct, kAct, `${k} d${d} slot${i}: effect slot like DV2`);
                if (kAct) assert.equal(at(fx.sebF, 0), at(r.weffSebF, 0), `${k} d${d} slot${i}: effect sebF`);
                n++;
              });
            }
          }
          assert.ok(n > 300, `checked ${n} slots`);
        });
      }
    }
  }
  test('parseDollSpec / dollDirName', () => {
    assert.deepEqual(parseDollSpec('hero'), { all: true, classes: null });
    assert.deepEqual([...parseDollSpec('hero:paladin,archer').classes], ['paladin', 'archer']);
    assert.equal(parseDollSpec('1'), null); assert.equal(parseDollSpec(null), null); assert.equal(parseDollSpec('hero:'), null);
    // sheet：上下看 vdir、左右看 facing
    assert.equal(dollDirName('side', 1), 'side'); assert.equal(dollDirName('sideLeft', -1), 'sideLeft'); assert.equal(dollDirName('side', -1), 'sideLeft');
    assert.equal(dollDirName('down', -1), 'down'); assert.equal(dollDirName('up', 1), 'up');
    assert.equal(dollDirName('sideLeft', 1), 'side', 'side directions: facing decides left/right like the sheet mirror');
    // 4 directions only: legacy diagonal names migrate (upRight -> up, downRight/downLeft -> down, upLeft -> side, facing decides)
    assert.deepEqual(['upRight', 'downRight', 'downLeft'].map(v => dollDirName(v, -1)), ['up', 'down', 'down']);
    assert.equal(dollDirName('upLeft', -1), 'sideLeft');
    for (const v of ['side', 'downRight', 'down', 'downLeft', 'sideLeft', 'upLeft', 'up', 'upRight', undefined]) for (const f of [1, -1])
      assert.ok(['up', 'side', 'down', 'sideLeft'].includes(dollDirName(v, f)), `${v}/${f} -> one of the 4 names`);
  });
  test('placeholder data: melee attack has impact slot and a real swing (deg changes)', () => {
    for (const key of ['attack', 'skill']) {
      const a = P.actions[key];
      assert.ok(Number.isInteger(a.impactSlot) || Number.isInteger(a.releaseSlot), key);
    }
    const degs = new Set(P.actions.attack.rows[1].parts.weapon.deg);
    assert.ok(degs.size >= 3, 'side attack rotates through ≥3 angles');
    const l = P.actions.attack.rows[3].parts.weapon, r = P.actions.attack.rows[1].parts.weapon;
    assert.deepEqual(l.deg, r.deg.map(d => -d || 0), 'left swing mirrors right');
    assert.ok(l.inv.every(v => v === 1), 'left uses inverted weapon frames');
  });
}

/* ------------------------------------------------------------ DV2 kit 對照 */
const KIT = process.env.DV2_KIT_DIR || 'C:/Users/ray/Desktop/Claude code/dv2-lab/kit';
const kitData = path.join(KIT, 'data/data.js'), kitJs = path.join(KIT, 'js/dv2-paperdoll.js');
if (!fs.existsSync(kitData) || !fs.existsSync(kitJs)) {
  console.log(`paperdoll parity: SKIPPED (DV2 kit not found at ${KIT})`);
} else {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(kitData, 'utf8'), sandbox, { filename: kitData });
  const DV2 = sandbox.window.DV2;
  let ref;
  try { ref = await import(pathToFileURL(kitJs).href); }
  catch {
    // kit 目錄沒有 package.json type:module 時，用同一份原始碼的 data: URL 載入（只在記憶體）
    ref = await import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(kitJs, 'utf8')).toString('base64'));
  }
  const stubCanvas = { width: 420, height: 420, getContext: () => ({}) };
  const doll = ref.createPaperdoll({ canvas: stubCanvas, data: DV2, atlas: {}, origin: { x: 0, y: 0 } });
  const M = dv2ToMistvale(DV2);

  // 武器：每種 spProc 各一把 + 弓 + 銃 + 空手
  const pick = new Map();
  for (const w of DV2.weapons) if (!pick.has('sp' + w.spProc)) pick.set('sp' + w.spProc, w.id);
  for (const w of DV2.weapons) if (!pick.has('wt' + w.wtype)) pick.set('wt' + w.wtype, w.id);
  const weaponIds = [...new Set([...pick.values(), -1])];

  let cases = 0, recs = 0;
  for (const set of DV2.sets) for (let direct = 0; direct < 4; direct++) {
    const ticks = new Set([0]);
    set.af.forEach((e, i) => { ticks.add(i ? set.af[i - 1] : 0); ticks.add(e - 1); });
    ticks.add(set.af[set.af.length - 1] + 1);
    for (const tick of ticks) for (const weaponId of weaponIds) for (const variant of [{}, { face: 4 }, { hideWeapon: true }]) {
      if ((variant.face || variant.hideWeapon) && weaponId !== weaponIds[0]) continue;
      const s = { setId: set.id, direct, tick, body: 0, hand: 0, head: 1, hat: 3, weaponId, face: -1, hideWeapon: false, ...variant };
      const a = doll.computeParts(s);
      const b = computeParts(M, dv2State(s));
      const where = `set ${set.id} dir ${direct} tick ${tick} weapon ${weaponId} ${JSON.stringify(variant)}`;
      assert.equal(b.length, a.length, `record count ${where}`);
      for (let i = 0; i < a.length; i++) {
        const ra = a[i], rb = b[i];
        const ctx = `${where} #${i} ${rb.layer}`;
        assert.equal(rb.layer, ['body', 'hand', 'helmet', 'head', 'weapon', 'effect'][ra.part], `order ${ctx}`);
        assert.equal(rb.frame, ra.frame, `frame ${ctx}`);
        assert.deepEqual(rb.sprite, ra.sprite.slice(0, 8), `sprite ${ctx}`);
        assert.deepEqual([rb.x, rb.y], [ra.x, ra.y], `position ${ctx}`);
        assert.equal(rb.deg, ra.deg, `deg ${ctx}`);
        assert.deepEqual(rb.pivot, ra.pivot ? ra.pivot.slice(0, 2) : null, `pivot ${ctx}`);
        // 圖集來源座標 sx = sheet.x + u - trim
        const meta = ra.img ? DV2.sheets[ra.bundle][ra.img] : null;
        if (meta) assert.deepEqual([rb.skin.x + rb.sprite[0], rb.skin.y + rb.sprite[1]], [meta[0] + ra.sprite[0] - meta[4], meta[1] + ra.sprite[1] - meta[5]], `source ${ctx}`);
        else assert.equal(rb.skin, null, `missing image ${ctx}`);
        recs++;
      }
      cases++;
    }
  }
  console.log(`paperdoll parity: RAN — ${cases} cases matched (${recs} draw records; ${DV2.sets.length} sets × 4 dirs × slot ticks × weapons ${weaponIds.join(',')})`);
}

/* ------------------------------------------------------------ createDollHero（瀏覽器端，用假的 XHR/Image/canvas 跑） */
{
  const dv2Json = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets/paperdoll-dv2/paperdoll.json');
  if (fs.existsSync(dv2Json)) {
    const realJson = fs.readFileSync(dv2Json, 'utf8');
    const saved = { X: globalThis.XMLHttpRequest, I: globalThis.Image };
    const wait = ms => new Promise(r => setTimeout(r, ms));
    // json: 回應內容；stall: 這個檔名的圖永遠不回（沒有 onload 也沒有 onerror）
    const stubs = ({ json = realJson, stall = null } = {}) => {
      globalThis.XMLHttpRequest = class { open() {} send() { setTimeout(() => { this.status = 200; this.responseText = json; this.onload(); }, 0); } };
      globalThis.Image = class { set src(v) { setTimeout(() => { if (!(stall && v.endsWith(stall))) this.onload?.(); }, 0); } };
    };
    const ctx = { save() {}, restore() {}, translate() {}, scale() {}, rotate() {}, drawImage() {} };
    let made = 0;
    const makeCanvas = (w, h) => ({ id: ++made, width: w, height: h, getContext: () => ctx });
    const asyncTests = [];
    const testAsync = (name, fn) => asyncTests.push([name, fn]);
    testAsync('createDollHero: a stalled image times out → failed (game falls back to sheet heroes)', async () => {
      stubs({ stall: 'atlas_fx.png' });
      const dh = createDollHero({ base: 'x/', makeCanvas, loadTimeoutMs: 30 });
      dh.setSpec('hero'); await wait(10);
      assert.deepEqual([dh.status().ready, dh.status().failed], [false, null], 'still loading');
      await wait(60);
      assert.deepEqual([dh.status().ready, dh.status().failed], [false, 'timeout']);
      assert.equal(dh.covers('paladin'), false);
    });
    testAsync('createDollHero: empty images map → failed (not "loading forever")', async () => {
      stubs({ json: JSON.stringify({ ...JSON.parse(realJson), images: {} }) });
      const dh = createDollHero({ base: 'x/', makeCanvas, loadTimeoutMs: 5000 });
      dh.setSpec('hero'); await wait(20);
      assert.match(String(dh.status().failed), /no images/);
    });
    testAsync('createDollHero: hideEffects filters by type, death shadow per slot, weaponLevel not in the cache key', async () => {
      stubs();
      const keep = createDollHero({ base: 'x/', makeCanvas, hideEffects: ['arrow'] });
      const hide = createDollHero({ base: 'x/', makeCanvas, hideEffects: ['slash'] });
      keep.setSpec('hero'); hide.setSpec('hero');
      // the pack is ~570 KB since Phase 6: two JSON parses can take longer than a fixed 30 ms on a busy machine -> poll (max 3 s)
      for (let i = 0; i < 300 && !(keep.status().ready && hide.status().ready); i++) await wait(10);
      assert.equal(keep.status().ready, true);
      const pal = { classId: 'paladin', equipment: { weapon: true }, weaponLevel: 3 };
      const swing = keep.compose(pal, { action: 'attack', tick: 3, dir: 'side' });   // attack.sword slot 1 = swing + slash trail
      assert.equal(swing.parts.slot, 1); assert.ok(swing.parts.some(p => p.kind === 'effect'), 'melee slash trail kept');
      const hidden = hide.compose(pal, { action: 'attack', tick: 3, dir: 'side' });
      assert.ok(!hidden.parts.some(p => p.kind === 'effect'), 'a hidden effect type is filtered out');
      assert.deepEqual([hidden.parts.dir, hidden.parts.slot, hidden.parts.action], [1, 1, resolveAction(JSON.parse(realJson), 'attack', 'sword', hidden.look.rig)], 'parts keep .dir/.slot/.action after filtering');   // 2x paladin: attack@2x
      const s0 = keep.compose(pal, { action: 'attack', tick: 0, dir: 'side' }), s2 = keep.compose(pal, { action: 'attack', tick: 5, dir: 'side' });
      assert.equal(s2.shadow.cv, s0.shadow.cv, 'non-death actions share one shadow per (look, action, dir)'); assert.equal(s0.shadow.cv, swing.cv, 'the first composed slot');
      const lying = keep.compose(pal, { action: 'death', tick: 0, dir: 'side' });
      assert.equal(lying.shadow.cv, lying.cv, 'death casts the shadow of its own slot');
      const w1 = keep.compose(pal, { action: 'idle', tick: 0, dir: 'side' }), w2 = keep.compose({ ...pal, weaponLevel: 7 }, { action: 'idle', tick: 0, dir: 'side' });
      assert.equal(w1.key, w2.key); assert.equal(w1.cv, w2.cv, 'same picture, one cache entry');
    });
    const warn = console.warn; console.warn = () => {};   // 失敗路徑本來就會警告；測試輸出保持乾淨
    try { for (const [name, fn] of asyncTests) { try { await fn(); passed++; } catch (e) { console.error('FAIL', name); throw e; } } }
    finally { globalThis.XMLHttpRequest = saved.X; globalThis.Image = saved.I; console.warn = warn; }
  }
}

/* ------------------------------------------------------------ DV2 fidelity（docs/DV2-PARITY.md「已對齊」每一列一個檢查） */
{
  const root2 = path.dirname(fileURLToPath(import.meta.url));
  const parityDoc = fs.readFileSync(path.join(root2, 'docs/DV2-PARITY.md'), 'utf8');
  const alignedSec = parityDoc.split(/^## /m).find(t => t.startsWith('已對齊')) || '';
  const docIds = [...alignedSec.matchAll(/^\| (P\d+) \|/gm)].map(m => m[1]);
  const dvPath = path.join(root2, 'assets/paperdoll-dv2/paperdoll.json');
  const DVf = fs.existsSync(dvPath) ? JSON.parse(fs.readFileSync(dvPath, 'utf8')) : null;
  const CHECKS = {
    P1: () => { assert.deepEqual([0, 3, 4, 7, 8, 15, 16, -1].map(t => getSlot([4, 8, 12, 16], t)), [0, 0, 1, 1, 2, 3, 0, 3]); assert.deepEqual([0, 1, 2, 5, 6, 11].map(t => getSlot([2, 4, 6, 12], t)), [0, 0, 1, 2, 3, 3]); },
    P2: () => { assert.equal(at([1, 2, 3], 7, 0), 3); assert.equal(at([], 0, 'd'), 'd'); },
    P3: () => {
      assert.deepEqual([DIR.UP, DIR.RIGHT, DIR.DOWN, DIR.LEFT], [0, 1, 2, 3]);
      if (DVf) for (const [k, a] of Object.entries(DVf.actions)) assert.equal(a.rows.length, 4, `${k}: 4 rows`);
      if (DVf) for (const k of Object.keys(DVf.sebs).filter(k => k.startsWith('head/') || k === 'hat/std')) assert.equal(DVf.sebs[k].max, 4, `${k}: one frame per direction`);
    },
    P4: () => { assert.deepEqual([...MIRROR], [1, 0, 3, 2]); const D = synth(); assert.equal(byLayer(computeParts(D, { action: 'idle', dir: 1, tick: 1, globalTick: 1, look: LOOK }), 'head').frame, 0); },
    P5: () => { const D = synth(); const w = byLayer(computeParts(D, { action: 'attack', dir: DIR.UP, tick: 2, look: LOOK }), 'weapon'); assert.equal(w.frame, 2 * 2 + 1); },
    P6: () => {
      const D = synth();
      assert.deepEqual(weaponCorner(byLayer(computeParts(D, { action: 'walk', dir: DIR.DOWN, tick: 0, look: LOOK }), 'weapon')), [-28, -33]);
      assert.deepEqual(weaponCorner(byLayer(computeParts(D, { action: 'attack', dir: DIR.UP, tick: 2, look: LOOK }), 'weapon')), [30, -28]);
    },
    P7: () => {
      const D = synth(); for (let d = 0; d < 4; d++) { const fx = byLayer(computeParts(D, { action: 'attack', dir: d, tick: 4, look: LOOK }), 'effect'); assert.equal(fx.frame, 1 * 4 + d); assert.equal(fx.deg, 0); }
      if (DVf) assert.equal(DVf.meta.effectDirs, 4);
    },
    P8: () => { const D = synth(); delete D.weaponOrigin; const w = byLayer(computeParts(D, { action: 'walk', dir: DIR.LEFT, tick: 0, look: LOOK }), 'weapon'); assert.deepEqual([w.x, w.y], [1 - 9, 3 - 7]); },
    P9: () => { const D = synth(); D.actions.walk.rows[1].parts.weapon.show = [0]; assert.equal(byLayer(computeParts(D, { action: 'walk', dir: 1, tick: 0, look: LOOK }), 'weapon'), undefined); },
    P10: () => { const D = synth(); const L = computeParts(D, { action: 'attack', dir: 0, tick: 2, look: LOOK }).map(p => p.layer); assert.deepEqual(L, ['body', 'head', 'weapon', 'effect']); },
    P11: () => { const s0 = { action: 'idle', tick: 9, globalTick: 40 }; const s1 = setAction(s0, 'walk'); assert.deepEqual([s1.tick, s1.globalTick], [0, 40]); assert.equal(setAction(s1, 'walk'), s1); const s2 = advance(s1, 3); assert.deepEqual([s2.tick, s2.globalTick], [3, 43]); },
    P12: () => { const D = synth(); const h = byLayer(computeParts(D, { action: 'walk', dir: 1, tick: 0, look: LOOK }), 'head'); assert.deepEqual(h.sprite, [0, 20, 20, 20, -10, -20, 1, 0]); assert.deepEqual(partCorners(h)[0], [h.x - 10, h.y - 20]); },
    P13: () => {
      if (!DVf) return;
      for (const [k, seb] of Object.entries(DVf.sebs)) for (const fr of Object.values(seb.frames)) {
        if (k.startsWith('body/')) assert.deepEqual(fr.slice(2, 6), [30, 30, -15, -30]);
        else if (k.startsWith('head/') || k === 'hat/std') assert.deepEqual(fr.slice(2, 6), [20, 20, -10, -20]);
        else if (k === 'weapon/std') assert.deepEqual(fr.slice(2, 4), [40, 40]);
        else if (k.startsWith('fx/')) assert.deepEqual(fr.slice(2, 6), [30, 30, -15, -15]);
      }
      for (const w of Object.values(DVf.weapons)) assert.equal(w.handle[0], w.seb === 'weapon2x/std' ? 40 : 20);   // grip x = cell centre (80 px cells for the 2x rig, rig2x.py)
    },
    P14: () => { if (!DVf) return; for (const [k, a] of Object.entries(DVf.actions)) { assert.equal(a.rows.length, 4, k); if (/^(idle|walk|attack|skill|hurt|death|victory|ride_sit|ride_stand|ride_charge_sit|ride_charge_stand|ride_charge2|walk_unarmed|idle_unarmed|carry_walk|carry|pose|cry|cry_sit|clap|give|jump_victory|handshake|punch|punch2|attack_v2|shoot|guard|petrify)(\.|@|$)/.test(k)) assert.ok(a.dv2 && Number.isInteger(a.dv2.set), `${k}: motion structure derived from a DV2 set`); } },
    P15: () => {
      // left uses DV2 d2's weapon numbers, not d1 mirrored. For most sets d2 happens to equal d1 mirrored; ダメージ (set 15, hurt)
      // does not, so its left row must differ from the mirrored right row (the kit motion test checks every slot against d2 exactly)
      if (!DVf) return;
      const A = DVf.actions.hurt, R = A.rows[1].parts.weapon, L = A.rows[3].parts.weapon;
      const mirrored = JSON.stringify(R.deg.map(d => -d || 0)) === JSON.stringify(L.deg) && JSON.stringify(R.inv.map(v => 1 - v)) === JSON.stringify(L.inv);
      assert.ok(!mirrored, 'hurt: left row carries the d2 numbers, not the mirrored right row');
      const src = fs.readFileSync(path.join(root2, 'tools/dv2-motion-derive.mjs'), 'utf8');
      assert.match(src, /const DV2_DIR = \[0, 1, 2, 3\];/);
    },
    P16: () => {
      // riding action sets: 乗る_座る 16 / 乗る_立つ 17 / 乗る_攻撃_座る 29 / 乗る_攻撃_立つ 30 / 乗る_攻撃2 31 (spProcType RIDECHARGE2 = 4); af/loop/weapon numbers vs the kit: "motion structure" test
      if (!DVf) return;
      const want = { ride_sit: 16, ride_stand: 17, ride_charge_sit: 29, ride_charge_stand: 30, ride_charge2: 31 };
      for (const [k, set] of Object.entries(want)) {
        assert.equal(DVf.actions[k]?.dv2?.set, set, `${k} <- DV2 set ${set}`);
        for (const [kk, a] of Object.entries(DVf.actions)) if (kk.split('.')[0] === k) { assert.equal(a.dv2.set, set, kk); assert.equal(a.spProc ?? 0, set === 31 ? 4 : 0, `${kk}: spProc`); }
      }
      assert.deepEqual(DVf.actions.ride_sit.af, [6, 12]); assert.deepEqual(DVf.actions.ride_charge2.af, [6, 12, 18, 24]); assert.equal(DVf.actions.ride_charge2.loop, false);
    },
    P17: () => {
      // DV2 Proc_updateDrawDepth: rider depth = mount depth + (direct RIGHT(1) || DOWN(2) ? -1 : +1), applied to the DV2 direct each of our directions borrows
      assert.deepEqual([...DV2_DIR4], [0, 1, 1, 2]);
      assert.deepEqual([...RIDE_DEPTH], DV2_DIR4.map(d => (d === 1 || d === 2 ? -1 : 1)));
      assert.deepEqual([0, 1, 2, 3].map(d => rideDepth(d)), [1, -1, -1, -1]);
      assert.equal(rideDepth('side', -1), -1); assert.equal(rideDepth('up'), 1);
    },
    P19: () => {
      // all 32 DV2 action sets ship (Phase 6 G1); per-slot numbers vs the kit: the "motion structure" test
      if (!DVf) return;
      const sets = new Set(Object.values(DVf.actions).map(a => a.dv2?.set).filter(Number.isInteger));
      assert.equal(sets.size, 32, `sets: ${[...sets].sort((a, b) => a - b)}`);
      const want = { walk_unarmed: 0, idle_unarmed: 1, carry_walk: 4, carry: 5, pose: 6, cry: 7, cry_sit: 8, clap: 9, give: 10, jump_victory: 12, handshake: 13, punch: 18, punch2: 19, attack_v2: 21, shoot: 25, guard: 26, petrify: 27 };
      for (const [k, set] of Object.entries(want)) assert.equal(DVf.actions[k]?.dv2?.set, set, `${k} <- DV2 set ${set}`);
      assert.deepEqual(DVf.actions.punch.af, [4, 8, 14]); assert.equal(DVf.actions.give.loop, false); assert.equal(DVf.actions.punch2.headMirror, true);
    },
    P20: () => {
      // 8 DV2 weapon types: ours + rapier/spear/gun/fist with combos from the DV2 weapon table (chargeTypeSeb, rate1 = 20 / 19 for PUNCH)
      if (!DVf) return;
      for (const t of ['sword', 'dagger', 'axe', 'staff', 'holystaff', 'bow', 'rapier', 'spear', 'gun', 'fist']) assert.ok(DVf.combos[t], `combos.${t}`);
      assert.deepEqual(DVf.combos.rapier.pool[0], ['attack_t', 100], 'RAPIR chargeType SPEAR -> 突き(23) first');
      assert.deepEqual(DVf.combos.gun.pool, [['shoot', 100]]); assert.deepEqual(DVf.combos.fist.pool, [['punch', 100], ['punch2', 40]]);
      assert.equal(DVf.weapons.fist.hidden, true, 'PUNCH: no weapon layer');
    },
    P21: () => {
      // effect types 0..4 where DV2 uses them: 22 横振り hslash, 23 突き thrust, 18/19 ﾊﾟﾝﾁ punch, 25 銃 gunfire (drawn when the art ships)
      if (!DVf) return;
      const t = (k, slot) => { const e = DVf.actions[k].rows[1].parts.effect; return e && at(e.act, slot, 0) ? at(e.type, slot, null) : null; };
      assert.equal(t('attack_h', 1), 'hslash'); assert.equal(t('attack_t', 1), 'thrust');
      assert.equal(t('punch', 1), DVf.effects.punch ? 'punch' : null); assert.equal(t('shoot', 1), DVf.effects.gunfire ? 'gunfire' : null);
    },
    P22: () => {
      // head seb 7 cry2 -> our 'cry' face on 泣く1/2
      if (!DVf) return;
      for (const k of ['cry', 'cry_sit']) assert.equal(DVf.actions[k].rows[1].parts.head.seb, 'head/cry');
      assert.ok(DVf.sebs['head/cry']);
    },
    P18: () => {
      // single-layer monster: SEB_M_WALK..DIE order, one layer, 4 rows per action, frame = slot (same engine as the hero)
      assert.deepEqual([...SEB_M], ['walk', 'stand', 'charge', 'charge2', 'damage', 'ride', 'down', 'die']);
      const mp = path.join(root2, 'assets/monsterdoll/monsterdoll.json');
      if (!fs.existsSync(mp)) return;
      const M = JSON.parse(fs.readFileSync(mp, 'utf8'));
      assert.deepEqual(Object.keys(M.layers), ['body']); assert.equal(M.meta.kind, 'monster');
      for (const [k, a] of Object.entries(M.actions)) { assert.equal(a.rows.length, 4, k); assert.equal(a.dv2.sebM, SEB_M.indexOf(k.split('/')[1]), k); }
    },
  };
  test('DV2 fidelity: every "aligned" row of docs/DV2-PARITY.md has a check, and every check is documented', () => {
    assert.ok(docIds.length >= 10, `aligned rows found in the doc (${docIds.join(',')})`);
    assert.deepEqual([...docIds].sort(), Object.keys(CHECKS).sort(), 'doc IDs = test checks');
    for (const id of docIds) { try { CHECKS[id](); } catch (e) { e.message = `${id}: ${e.message}`; throw e; } }
  });

  // ---- pixel-level checks on the shipped DV2 pack (tiny PNG decoder: 8-bit RGBA / RGB, non-interlaced = what PIL writes)
  function readPng(file) {
    const buf = fs.readFileSync(file); let o = 8, w = 0, h = 0, ct = 0; const idat = [];
    while (o < buf.length) {
      const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), data = buf.subarray(o + 8, o + 8 + len);
      if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; if (data[8] !== 8 || data[12] !== 0 || (ct !== 6 && ct !== 2)) throw new Error(`${file}: unsupported PNG`); }
      else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break;
      o += 12 + len;
    }
    const bpp = ct === 6 ? 4 : 3, raw = zlibInflate(Buffer.concat(idat)), stride = w * bpp, out = new Uint8Array(w * h * 4);
    let prev = new Uint8Array(stride);
    for (let y = 0; y < h; y++) {
      const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), cur = new Uint8Array(stride);
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
        const pr = (() => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; })();
        cur[i] = (line[i] + (f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : pr)) & 255;
      }
      for (let x = 0; x < w; x++) { const k = (y * w + x) * 4; out[k] = cur[x * bpp]; out[k + 1] = cur[x * bpp + 1]; out[k + 2] = cur[x * bpp + 2]; out[k + 3] = bpp === 4 ? cur[x * bpp + 3] : 255; }
      prev = cur;
    }
    return { w, h, px: out, alpha: (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? out[(y * w + x) * 4 + 3] : 0) };
  }
  if (DVf) {
    const dvDir = path.join(root2, 'assets/paperdoll-dv2'), IMG = {};
    for (const [k, f] of Object.entries(DVf.images)) IMG[k] = readPng(path.join(dvDir, f));
    const opaqueMemo = new Map();
    const opaque = rec => {   // does this part draw at least one opaque pixel?
      const [u, v, w, h] = rec.sprite, x0 = rec.skin.x + u, y0 = rec.skin.y + v, key = `${rec.skin.img}:${x0},${y0},${w},${h}`;
      if (!opaqueMemo.has(key)) { const im = IMG[rec.skin.img]; let any = false; for (let y = y0; y < y0 + h && !any; y++) for (let x = x0; x < x0 + w; x++) if (im.alpha(x, y)) { any = true; break; } opaqueMemo.set(key, any); }
      return opaqueMemo.get(key);
    };
    test('DV2 pack pixels: 4 directions x every action x every slot x every worn layer draws real pixels (no empty cell)', () => {
      let n = 0;
      const full = { weapon: true, armor: true, cape: true, helm: true };
      for (const cls of DVf.meta.classes) {
        const look = lookFromHunter({ classId: cls, equipment: full }, DVf);
        if (CLASS_KIT[cls]?.helmet) assert.ok(look.helmet, `${cls} helmet`);
        if (DV2_PARTS_ONLY.has(cls)) assert.ok(!look.armor && !look.cape && !look.shield, `${cls}: DV2 parts only (no armor/cape/shield)`);
        else if (look.rig === 2) assert.ok(!look.armor && !look.cape && (!CLASS_KIT[cls]?.shield || look.shield === CLASS_KIT[cls].shield + RIG2X_SUFFIX), `${cls}: 2x rig = DV2 parts + 2x shield (no 1x armor/cape)`);
        else assert.ok(look.armor && look.cape, `${cls} armor + cape worn`);
        for (const [key, A] of Object.entries(DVf.actions)) for (let d = 0; d < 4; d++) for (let s = 0; s < A.af.length; s++) {
          if (((A.rig) || 1) !== ((DVf.meta.rig2x && DVf.meta.rig2x[cls]) || 1)) continue;   // 2x rows only with a 2x-rig class (rig2x.py)
          // every action key, including the base (no weapon type) tables: pin the weapon type so resolveAction lands on exactly this key
          // 基礎表（沒有 `.type` 的 key）是 DV2 的共用動作集（劍/通用）；要它跟弓的 skin 混搭會拿到弓表的空格
          // （弓圖只有 2 欄：直立/拉滿），所以基礎表一律配劍的圖，跟遊戲內「弓手走 attack.bow」一致。
          const k0 = key.replace(/@2x$/, ''), wtk = k0.includes('.') ? k0.split('.')[1] : null, wpn = wtk ? wtk + '_fine' : 'sword';
          const ps = computeParts(DVf, { action: key, dir: d, tick: s ? A.af[s - 1] : 0, look: { ...look, weaponType: wtk, weapon: weaponFor(DVf, wpn, look.rig) } });
          assert.equal(ps.action, key); assert.equal(ps.dir, d); assert.equal(ps.slot, s);
          // hand: the weapon-arm overlay is empty by design in most cells (the arm is part of the body art; the hand sheet only
          // carries the few cells where the fist must cover the grip), so it only has to resolve to a real skin
          for (const p of ps) { assert.ok(p.skin && IMG[p.skin.img], `${cls} ${key} d${d} s${s} ${p.layer}: skin image`); if (p.layer !== 'hand') assert.ok(opaque(p), `${cls} ${key} d${d} s${s} ${p.layer} (${p.seb} f${p.frame}) draws pixels`); n++; }
        }
      }
      assert.ok(n > 10000, `${n} drawn parts checked`);
    });
    // 2026-11-14 使用者：「只要跟 dv2 一樣的部位顯示」——DV2_PARTS_ONLY 的職業全穿也只畫 DV2 的六個部位（身體/手/帽子/頭/武器/特效）
    test('DV2 parts only: classes in DV2_PARTS_ONLY draw only body/hand/helmet/head/weapon/effect, every action x dir x slot, all gear worn', () => {
      const DV2_PARTS = new Set(['body', 'hand', 'helmet', 'head', 'weapon', 'effect']);
      const full = { weapon: true, armor: true, cape: true, helm: true, chest: true, belt: true, legs: true, boots: true, gloves: true };
      assert.ok(DV2_PARTS_ONLY.has('berserker'), 'warrior (berserker) first');
      let n = 0;
      for (const cls of DV2_PARTS_ONLY) {
        const look = lookFromHunter({ classId: cls, equipment: full, weaponLevel: 5 }, DVf);
        for (const [key, A] of Object.entries(DVf.actions)) for (let d = 0; d < 4; d++) for (let sl = 0; sl < A.af.length; sl++) {
          const ps = computeParts(DVf, { action: key, dir: d, tick: sl ? A.af[sl - 1] : 0, look });
          for (const p of ps) { assert.ok(DV2_PARTS.has(p.layer), `${cls} ${key} d${d} s${sl}: non-DV2 layer ${p.layer}`); n++; }
        }
      }
      assert.ok(n > 1000, `${n} parts checked`);
    });
    test('cape (Phase 1.2): drawn before the body in every direction and visible past the body silhouette', () => {
      const look = lookFromHunter({ classId: 'darkknight', equipment: { cape: true } }, DVf);   // a 1x class (a 2x-rig class wears no cape, Phase 6 G9)
      for (const action of ['idle', 'walk', 'attack.sword', 'hurt']) for (let d = 0; d < 4; d++) {
        const ps = computeParts(DVf, { action, dir: d, tick: 0, look }), L = ps.map(p => p.layer);
        assert.ok(L.indexOf('cape') >= 0 && L.indexOf('cape') < L.indexOf('body'), `${action} d${d}: cape before body (${L.join('>')})`);
        const cape = ps.find(p => p.layer === 'cape'), body = ps.find(p => p.layer === 'body');
        const at2 = (rec, X, Y) => { const [u, v, w, h, tx, ty, ru] = rec.sprite, i = X - rec.x - tx, j = Y - rec.y - ty; if (i < 0 || j < 0 || i >= w || j >= h) return 0; return IMG[rec.skin.img].alpha(rec.skin.x + u + (ru ? w - 1 - i : i), rec.skin.y + v + j); };
        let peek = 0; for (let Y = -32; Y <= 2; Y++) for (let X = -16; X <= 16; X++) if (at2(cape, X, Y) && !at2(body, X, Y)) peek++;
        assert.ok(peek >= 3, `${action} d${d}: cape shows outside the body (${peek} px)`);
      }
    });
    /* ---------------------------------------------------------- 騎乘（docs/PAPERDOLL.md §20） */
    test('riding: every class x ride action x 4 dirs draws body+head+armor+cape (+shield for paladin); weapon only where DV2 shows it', () => {
      for (const cls of DVf.meta.classes) {
        const look = lookFromHunter({ classId: cls, equipment: { weapon: true, chest: true, cape: true } }, DVf);
        for (const base of ['ride_sit', 'ride_stand', 'ride_charge_sit', 'ride_charge_stand', 'ride_charge2']) {
          const tm = actionTiming(DVf, base, look.weaponType);
          assert.equal(tm.key.split('.')[0], base, `${cls} ${base} resolves to its own table (${tm.key})`);
          for (let d = 0; d < 4; d++) for (let s2 = 0; s2 < tm.slots; s2++) {
            const ps = computeParts(DVf, { action: base, dir: d, tick: s2 ? DVf.actions[tm.key].af[s2 - 1] : 0, look });
            const L = ps.map(p => p.layer);
            const dv2Only = DV2_PARTS_ONLY.has(cls) || look.rig === 2;   // 2x-rig classes draw DV2's parts (+ shield), no 1x armour/cape
            assert.ok(L.includes('body') && L.includes('head') && (dv2Only ? !L.includes('armor') && !L.includes('cape') : L.includes('armor') && L.includes('cape')), `${cls} ${tm.key} d${d} s${s2}: ${L}`);
            if (cls === 'paladin' || cls === 'darkknight') assert.ok(L.includes('shield'), `${cls} ${tm.key} d${d}: shield`);
            const shown = at(DVf.actions[tm.key].rows[d].parts.weapon.show, s2, 1) !== 0;
            assert.equal(L.includes('weapon'), shown, `${cls} ${tm.key} d${d} s${s2}: weapon iff DV2 shows it`);
            for (const p of ps) if (p.layer !== 'hand') assert.ok(opaque(p), `${cls} ${tm.key} d${d} s${s2} ${p.layer} draws pixels`);
          }
        }
      }
      // 乗る_攻撃2: weapon hidden on slot 0, shown on 1..3 (DV2 ball [0,1,1,1])
      for (let d = 0; d < 4; d++) assert.deepEqual(DVf.actions['ride_charge2.sword'].rows[d].parts.weapon.show, [0, 1, 1, 1]);
    });
    test('riding: timing contract (melee impact never before the hit, ranged release at atkAt, skill release) on the ride tables', () => {
      const slotOf = r => getSlot(DVf.actions[r.action].af, r.tick);
      for (const seat of ['sit', 'stand']) {
        for (const wt of ['sword', 'axe', 'dagger']) {
          const A = DVf.actions[`ride_charge2.${wt}`];
          assert.ok(A.releaseSlot >= 1 && A.impactSlot > A.releaseSlot, `ride_charge2.${wt} windup < release < impact`);
          for (let ms = 0; ms <= 344; ms++) {
            const r = dollActionTick({ pose: 'strike', t: 10 + ms / 1000, atkAt: 10, hitDelay: 0.07, hitStop: 0.07, strikeEnd: 0.345, data: DVf, weaponType: wt, ride: seat });
            assert.equal(r.action, `ride_charge2.${wt}`);
            const sl = slotOf(r);
            if (ms < 70) assert.ok(sl >= A.releaseSlot && sl < A.impactSlot, `${seat} ${wt} ${ms}ms: release, never impact before the hit`);
            else if (ms < 140) assert.equal(sl, A.impactSlot, `${seat} ${wt} ${ms}ms: impact`);
            else assert.ok(sl >= A.impactSlot);
          }
          for (let k = 0; k < 1; k += 0.05) assert.ok(slotOf(dollActionTick({ pose: 'windup', windupT: k * 0.45, windupLen: 0.45, data: DVf, weaponType: wt, ride: seat })) < A.releaseSlot);
        }
        for (const wt of ['bow', 'staff', 'holystaff']) {
          const r0 = dollActionTick({ pose: 'strike', t: 10, atkAt: 10, data: DVf, weaponType: wt, strikeEnd: 0.345, ride: seat });
          assert.equal(r0.action, `ride_charge2.${wt}`); assert.equal(DVf.actions[r0.action].impactSlot ?? null, null, `${wt}: ranged, no impact slot`);
          assert.equal(slotOf(r0), DVf.actions[r0.action].releaseSlot, `${seat} ${wt}: release slot at atkAt`);
        }
        const sk = x => dollActionTick({ pose: 'skill', t: 5 + x, skillAt: 5, skillRelease: 0.25, skillLen: 0.675, data: DVf, weaponType: 'sword', ride: seat });
        assert.equal(sk(0).action, `ride_charge_${seat}.sword`);
        assert.ok(slotOf(sk(0.249)) < DVf.actions[sk(0).action].releaseSlot); assert.equal(slotOf(sk(0.25)), DVf.actions[sk(0).action].releaseSlot);
        for (const pose of ['idle', 'walk3', 'hurt', 'victory']) {
          const r = dollActionTick({ pose, i: 2, hit: 0.1, elapsed: 1.3, seed: 0.2, cheerT: 0.4, data: DVf, weaponType: 'bow', ride: seat });
          assert.equal(r.action, `ride_${seat}.bow`, `${seat} ${pose} -> ride loop`); assert.ok(r.loop);
        }
      }
      // not riding: unchanged
      assert.equal(dollActionTick({ pose: 'strike', t: 10, atkAt: 10, data: DVf, weaponType: 'sword' }).action, 'attack.sword');
    });
    {
      const MJ = path.join(root2, 'assets/mounts.json');
      const MT = fs.existsSync(MJ) ? JSON.parse(fs.readFileSync(MJ, 'utf8')) : null;
      test('mount table (assets/mounts.json): every rideable species has a seat + 4 saddle points on its own art', () => {
        assert.ok(MT, 'assets/mounts.json exists (pipeline/scripts/dv2fmt/gen_mounts.py)');
        assert.deepEqual(MT.dirs, ['up', 'right', 'down', 'left']);
        const rideable = Object.keys(ENEMIES).filter(isRideable);
        assert.deepEqual([...rideable].sort(), Object.keys(MT.mounts).filter(sp => MT.mounts[sp].rideable !== false && Object.hasOwn(ENEMIES, sp)).sort(), 'game RIDEABLE == mounts.json rideable (sit seats only)');
        assert.ok(rideable.length >= 4 && rideable.every(sp => MT.mounts[sp].seat === 'sit'), 'only sit-seat (four-legged) species are rideable');
        assert.ok(!isRideable('boss') && !isRideable('dragon') && !isRideable(null));
        for (const sp of rideable) {
          const m = MT.mounts[sp]; assert.ok(m, `${sp} in the mount table`);
          assert.ok(['sit', 'stand'].includes(m.seat), `${sp} seat`);
          assert.equal(m.saddle.length, 4);
          const meta = JSON.parse(fs.readFileSync(path.join(root2, `assets/monsters3/${sp}.json`), 'utf8')), im = readPng(path.join(root2, `assets/monsters3/${sp}.png`));
          ['idleUp', 'idle', 'idleDown', 'idleLeft'].forEach((rowName, d) => {
            const row = meta.actions[rowName], C = row.cell, fx = C / 2, fy = C - meta.footFromBottom, [sx, sy] = m.saddle[d];
            // the rider's foot sits on the mount: inside its opaque box (x within the box, y between its top and the foot line)
            let x0 = C, x1 = -1, y0 = C;
            for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) if (im.alpha(x, row.y + y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); }
            assert.ok(fx + sx >= x0 && fx + sx <= x1, `${sp} ${rowName}: saddle x inside the sprite (${fx + sx} in ${x0}..${x1})`);
            assert.ok(fy + sy >= y0 && fy + sy < fy, `${sp} ${rowName}: saddle y between the top (${y0}) and the foot (${fy}): ${fy + sy}`);
          });
        }
        assert.equal(MT.mounts.treant?.rideable, false, 'boss art is not rideable');
      });
      // 2026-11-14 regression (coordinator review of the Phase 5 screenshots): with the old saddle rule only the rider's head showed above the
      // mount in the right/down/left views. Same placement as src/pixel-world.js mountPlan: rider foot = saddle (monsters3 px, x km) +
      // hip[seat] rider px (x the rider's k); 1 rider px = 72 / heroHeight monsters3 px. Where the DV2 depth rule draws the mount OVER the
      // rider (rideDepth -1: right/down/left), at most 40% of the rider's pixels may be covered, and at most 15% of its pixels above the
      // hip line (torso, arms, head). Every rideable species x 4 directions x the smallest and the tallest rider (paladin 29, sorcerer 33).
      test('riding: the mount never buries the rider (<= 40% of rider pixels covered, torso/head above the back line) in every direction', () => {
        const coverOf = (sp, cls, d) => {
          const m = MT.mounts[sp], meta = JSON.parse(fs.readFileSync(path.join(root2, `assets/monsters3/${sp}.json`), 'utf8'));
          const mon = readPng(path.join(root2, `assets/monsters3/${sp}.png`)), row = meta.actions[['idleUp', 'idle', 'idleDown', 'idleLeft'][d]];
          const C = row.cell, fx = C / 2, fy = C - meta.footFromBottom, [sx, sy] = m.saddle[d], hip = MT.hip[m.seat], f = 72 / DVf.meta.heroHeights[cls];
          const look = lookFromHunter({ classId: cls, equipment: { weapon: true, chest: true, helm: true, cape: true } }, DVf);
          const px = new Set();
          for (const p of computeParts(DVf, { action: `ride_${m.seat}`, dir: d, tick: 0, look })) {
            if (p.kind === 'weapon' || p.kind === 'effect') continue;
            const [u, v, w, h, tx, ty, ru] = p.sprite, im = IMG[p.skin.img];
            for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (im.alpha(p.skin.x + u + (ru ? w - 1 - i : i), p.skin.y + v + j)) px.add(`${p.x + tx + i},${p.y + ty + j}`);
          }
          let all = 0, hit = 0, upper = 0, upperHit = 0;
          for (const k of px) {
            const [X, Y] = k.split(',').map(Number), mx = Math.floor(fx + sx + (X + 0.5) * f), my = Math.floor(fy + sy + (Y + hip + 0.5) * f);
            const covered = rideDepth(d) < 0 && mx >= 0 && my >= 0 && mx < C && my < C && mon.alpha(row.y === undefined ? 0 : mx, row.y + my) > 0;
            all++; if (covered) hit++;
            if (Y < -hip) { upper++; if (covered) upperHit++; }
          }
          return { all, cover: hit / all, upperCover: upperHit / Math.max(1, upper) };
        };
        const rideable = Object.keys(ENEMIES).filter(isRideable);
        assert.ok(rideable.includes('boar') && rideable.includes('stag'), 'covers boar and stag');
        let worst = { cover: 0 };
        for (const sp of rideable) for (const cls of ['paladin', 'sorcerer']) for (let d = 0; d < 4; d++) {
          const r = coverOf(sp, cls, d);
          assert.ok(r.all > 100, `${sp} ${cls} d${d}: rider has pixels (${r.all})`);
          assert.ok(r.cover <= 0.4, `${sp} ${cls} d${d}: ${(r.cover * 100).toFixed(0)}% of the rider is covered by the mount (max 40%)`);
          assert.ok(r.upperCover <= 0.15, `${sp} ${cls} d${d}: ${(r.upperCover * 100).toFixed(0)}% of the torso/head is covered (max 15%)`);
          if (r.cover > worst.cover) worst = { ...r, sp, cls, d };
        }
        if (process.env.RIDE_COVER_REPORT) console.log('worst rider coverage', JSON.stringify(worst));
      });
    }
    /* ---------------------------------------------------------- 單層怪物紙娃娃（docs/PAPERDOLL.md §21） */
    {
      const MDIR = path.join(root2, 'assets/monsterdoll'), MP = path.join(MDIR, 'monsterdoll.json');
      const M = fs.existsSync(MP) ? JSON.parse(fs.readFileSync(MP, 'utf8')) : null;
      const MON3 = fs.readdirSync(path.join(root2, 'assets/monsters3')).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort();
      test('monster paperdoll: every species x 8 SEB_M actions x 4 dirs x every frame resolves to a non-empty cell', () => {
        assert.ok(M, 'assets/monsterdoll/monsterdoll.json exists (pipeline/scripts/dv2fmt/build_monster_pack.py)');
        assert.deepEqual([...M.meta.species].sort(), MON3, 'one entry per assets/monsters3 species');
        let n = 0;
        for (const sp of MON3) {
          const im = readPng(path.join(MDIR, M.images[sp]));
          for (const seb of SEB_M) {
            const A = M.actions[`${sp}/${seb}`]; assert.ok(A, `${sp}/${seb}`);
            for (let d = 0; d < 4; d++) for (let f = 0; f < A.af.length; f++) {
              const ps = computeMonsterParts(M, sp, { action: seb, dir: d, tick: monsterFrameTick(M, sp, seb, f) });
              assert.equal(ps.length, 1, `${sp} ${seb} d${d} f${f}`); assert.equal(ps.dir, d); assert.equal(ps.slot, f);
              const [u, v, w, h] = ps[0].sprite; assert.ok(w > 0 && h > 0, `${sp} ${seb} d${d} f${f} has a sprite`);
              let any = false; for (let y = v; y < v + h && !any; y++) for (let x = u; x < u + w; x++) if (im.alpha(x, y)) { any = true; break; }
              assert.ok(any, `${sp} ${seb} d${d} f${f}: opaque pixels`); n++;
            }
          }
        }
        assert.ok(n > 2000, `${n} cells`);
      });
      test('monster paperdoll: re-assembled cells are pixel-identical to the assets/monsters3 cells they map to (every species)', () => {
        let n = 0;
        for (const sp of MON3) {
          const meta = JSON.parse(fs.readFileSync(path.join(root2, `assets/monsters3/${sp}.json`), 'utf8'));
          const sheet = readPng(path.join(root2, `assets/monsters3/${sp}.png`)), atl = readPng(path.join(MDIR, M.images[sp]));
          for (const seb of SEB_M) {
            const A = M.actions[`${sp}/${seb}`];
            for (let d = 0; d < 4; d++) {
              const src = A.src[d], row = meta.actions[src.row], C = row.cell, fx = C / 2, fy = C - meta.footFromBottom;
              for (let f = 0; f < src.n; f++) {
                const [p] = computeMonsterParts(M, sp, { action: seb, dir: d, tick: monsterFrameTick(M, sp, seb, f) });
                const [u, v, w, h, tx, ty, ru] = p.sprite, cell = new Uint8Array(C * C * 4);
                for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {   // drawParts semantics: dest (fx+tx, fy+ty), ru flips inside the sprite box
                  const sxx = u + (ru ? w - 1 - i : i), s0 = ((v + j) * atl.w + sxx) * 4, X = fx + tx + i, Y = fy + ty + j;
                  if (X < 0 || Y < 0 || X >= C || Y >= C) { assert.equal(atl.px[s0 + 3], 0, 'nothing drawn outside the cell'); continue; }
                  cell.set(atl.px.subarray(s0, s0 + 4), (Y * C + X) * 4);
                }
                const col = src.from + f;
                for (let Y = 0; Y < C; Y++) for (let X = 0; X < C; X++) {
                  const sx2 = col * C + (src.mirror ? C - 1 - X : X), k = ((row.y + Y) * sheet.w + sx2) * 4, q = (Y * C + X) * 4;
                  const a = sheet.px[k + 3], b = cell[q + 3];
                  if (a !== b || (a && (sheet.px[k] !== cell[q] || sheet.px[k + 1] !== cell[q + 1] || sheet.px[k + 2] !== cell[q + 2])))
                    assert.fail(`${sp} ${seb} d${d} f${f} (${src.row}[${col}]${src.mirror ? ' mirrored' : ''}) differs at ${X},${Y}`);
                }
                n++;
              }
            }
          }
        }
        assert.ok(n > 2000, `${n} cells compared`);
      });
    }
  }
}


/* ------------------------------------------------------------ DV2 連擊變體（attack / attack_h / attack_t，§22） */
test('attackVariant: weighted pick by roll, fallbacks to attack', () => {
  const D = { actions: { idle: {}, attack: {}, attack_h: {}, attack_t: {}, 'attack.sword': {} },
    combos: { sword: { count: 5, pool: [['attack', 100], ['attack_h', 50], ['attack_t', 50]] }, bow: { count: 3, pool: [['attack', 100]] },
      zero: { pool: [['attack_h', 0]] }, ghost: { pool: [['attack', 100], ['attack_x', 100]] } } };
  // 權重 100:50:50 → [0,.5) attack、[.5,.75) attack_h、[.75,1) attack_t
  for (const [r, want] of [[0, 'attack'], [0.4999, 'attack'], [0.5, 'attack_h'], [0.7499, 'attack_h'], [0.75, 'attack_t'], [0.9999, 'attack_t'], [1, 'attack_t'], [7, 'attack_t'], [-3, 'attack'], [NaN, 'attack']])
    assert.equal(attackVariant(D, 'sword', r), want, `roll ${r}`);
  const n = { attack: 0, attack_h: 0, attack_t: 0 };
  for (let i = 0; i < 4000; i++) n[attackVariant(D, 'sword', (i + 0.5) / 4000)]++;
  assert.deepEqual(n, { attack: 2000, attack_h: 1000, attack_t: 1000 });
  assert.equal(attackVariant(D, 'bow', 0.9), 'attack', 'bow pool only has attack');
  assert.equal(attackVariant(D, 'axe', 0.9), 'attack', 'weapon without a combo table');
  assert.equal(attackVariant(D, null, 0.9), 'attack');
  assert.equal(attackVariant(D, 'zero', 0.9), 'attack', 'all-zero weights');
  assert.equal(attackVariant(D, 'ghost', 0.9), 'attack', 'variant missing from the pack is dropped from the pool');
  assert.equal(attackVariant({ actions: D.actions }, 'sword', 0.9), 'attack', 'old pack without combos');
  assert.equal(attackVariant(null, 'sword', 0.9), 'attack');
  assert.equal(comboCount(D, 'sword'), 5); assert.equal(comboCount(D, 'axe'), 1); assert.equal(comboCount(null, 'sword'), 1);
});
test('trackAttackStamp / dollAttackVariant: windup and the strike that follows share one key; deterministic', () => {
  const D = { actions: { idle: {}, attack: {}, attack_h: {}, attack_t: {} }, combos: { sword: { pool: [['attack', 100], ['attack_h', 50], ['attack_t', 50]] } } };
  let m = trackAttackStamp(null, undefined);
  assert.deepEqual(m, { stamp: null, prev: null });
  assert.equal(trackAttackStamp(m, null), m, 'same stamp → same memo object');
  const seen = new Set();
  let prevStamp;
  for (let k = 0; k < 300; k++) {
    // 蓄力（h.atkAt 還是上一擊）好幾幀 → 同一個變體
    const w = dollAttackVariant(D, 'sword', 'h7', 'windup', m);
    for (let j = 0; j < 5; j++) { m = trackAttackStamp(m, prevStamp); assert.equal(dollAttackVariant(D, 'sword', 'h7', 'windup', m), w); }
    // 出手：新的 atkAt 出現 → 用換之前的值當鍵 → 跟蓄力同一個
    const N = 10 + k * 0.85 + (k % 7) * 0.016;
    for (let j = 0; j < 5; j++) { m = trackAttackStamp(m, N); assert.equal(dollAttackVariant(D, 'sword', 'h7', 'strike', m), w, `attack ${k}: strike = windup variant`); }
    assert.equal(dollAttackVariant(D, 'sword', 'h7', 'walk', m), 'attack');
    seen.add(w); prevStamp = N;
  }
  assert.deepEqual([...seen].sort(), ['attack', 'attack_h', 'attack_t'], 'all three variants show up over many attacks');
  // 可重現：同樣輸入同樣結果（沒有 Math.random）
  const m2 = { stamp: 12.5, prev: 11.65 };
  assert.equal(dollAttackVariant(D, 'sword', 'h7', 'strike', m2), dollAttackVariant(D, 'sword', 'h7', 'strike', { ...m2 }));
  assert.equal(dollAttackVariant(D, 'sword', 'h7', 'windup', { stamp: 11.65, prev: 1 }), dollAttackVariant(D, 'sword', 'h7', 'strike', m2));
});
{
  const dvJ = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets/paperdoll-dv2/paperdoll.json');
  const DV = fs.existsSync(dvJ) ? JSON.parse(fs.readFileSync(dvJ, 'utf8')) : null;
  if (!DV || !DV.combos) console.log('skip: DV2 combo tests (assets/paperdoll-dv2/paperdoll.json without combos)');
  else {
    const slotOf = r => getSlot(DV.actions[r.action].af, r.tick);
    const base = { hitDelay: 0.07, hitStop: 0.07, strikeEnd: 0.345, data: DV };
    test('DV2 combos: dollActionTick with o.attack — windup stays in slot 0, release at atkAt, impact slot at hitDelay', () => {
      for (const wt of ['sword', 'dagger', 'axe', 'staff', 'holystaff']) for (const [v] of DV.combos[wt].pool) {
        const key = `${v}.${wt}`, A = DV.actions[key];
        assert.ok(A, key); assert.equal(A.releaseSlot, 1, `${key} release slot`);
        for (let k = 0; k < 1; k += 0.02) {
          const r = dollActionTick({ ...base, pose: 'windup', windupT: k * 0.45, windupLen: 0.45, weaponType: wt, attack: v });
          assert.equal(r.action, key); assert.equal(slotOf(r), 0, `${key} windup ${k.toFixed(2)} in slot 0`);
        }
        const melee = A.impactSlot != null;
        for (let ms = 0; ms <= 344; ms++) {
          const r = dollActionTick({ ...base, pose: 'strike', t: 10 + ms / 1000, atkAt: 10, weaponType: wt, attack: v });
          assert.equal(r.action, key);
          const sl = slotOf(r);
          if (!melee) { assert.ok(sl >= A.releaseSlot, `${key} ${ms}ms ranged ≥ release`); if (ms === 0) assert.equal(sl, A.releaseSlot); continue; }
          if (ms < 70) assert.equal(sl, A.releaseSlot, `${key} ${ms}ms: release, never impact before the hit`);
          else if (ms < 140) assert.equal(sl, A.impactSlot, `${key} ${ms}ms: impact (+ hit stop)`);
          else assert.ok(sl >= A.impactSlot, `${key} ${ms}ms: impact or recover`);
        }
        if (melee) {
          assert.equal(slotOf(dollActionTick({ ...base, pose: 'strike', t: 10.344, atkAt: 10, weaponType: wt, attack: v })), A.af.length - 1, `${key}: last slot reached`);
          // 別的命中延遲照樣對時
          assert.equal(slotOf(dollActionTick({ ...base, pose: 'strike', t: 10.12, atkAt: 10, hitDelay: 0.12, weaponType: wt, attack: v })), A.impactSlot);
          assert.equal(slotOf(dollActionTick({ ...base, pose: 'strike', t: 10.119, atkAt: 10, hitDelay: 0.12, weaponType: wt, attack: v })), A.releaseSlot);
        }
      }
    });
    test('DV2 combos: no o.attack = old behaviour; bad variant → attack; riding ignores the variant; bow stays attack.bow; skill ignores it', () => {
      for (const pose of ['windup', 'strike']) for (const wt of ['sword', 'axe', 'dagger', 'staff', 'holystaff', 'bow']) for (let x = 0; x <= 0.4; x += 0.01) {
        const o = { ...base, pose, t: 10 + x, atkAt: 10, windupT: x, windupLen: 0.45, weaponType: wt };
        const old = dollActionTick(o);
        assert.equal(old.action, `attack.${wt}`);
        assert.deepEqual(dollActionTick({ ...o, attack: 'attack' }), old);
        assert.deepEqual(dollActionTick({ ...o, attack: 'attack_zz' }), old, 'unknown variant falls back to attack');
        for (const seat of ['sit', 'stand']) assert.deepEqual(dollActionTick({ ...o, ride: seat, attack: 'attack_h' }), dollActionTick({ ...o, ride: seat }), 'riding: ride_charge2 unchanged');
      }
      for (let i = 0; i < 200; i++) for (const pose of ['windup', 'strike']) assert.equal(dollAttackVariant(DV, 'bow', 'b' + i, pose, { stamp: i * 0.7, prev: i * 0.7 - 0.7 }), 'attack');
      const o = { ...base, pose: 'skill', t: 5.3, skillAt: 5, skillRelease: 0.25, skillLen: 0.675, weaponType: 'sword' };
      assert.deepEqual(dollActionTick({ ...o, attack: 'attack_t' }), dollActionTick(o), 'skill ignores o.attack');
    });
    test('DV2 combos: drawDollHero-style loop (advanceNoSkip + windup hold) — one variant per windup→strike, slots never go back within an attack', () => {
      // 照 pixel-world drawDollHero 的流程：每幀 trackAttackStamp → dollAttackVariant → dollActionTick → strike 時 advanceNoSkip、windup 時同段只往前
      // （出手的第一幀沒有前一格可接，低幀率可能直接落在命中格 —— 這是 advanceNoSkip 原本的行為，只檢查出手第 2 幀起每幀最多前進一格）
      for (const wt of ['sword', 'dagger', 'axe', 'staff']) for (const fps of [60, 24, 9]) {
        let memo = null, seq = null, wind = null, atkAt, att = -1, cur = null;
        const per = [];
        const cycle = 0.45 + 0.345 + 0.1;   // 蓄力 → 出手 → 一點待機
        for (let f = 0; f < fps * cycle * 40; f++) {
          const t = f / fps, c = Math.floor(t / cycle), ph = t - c * cycle;
          let pose;
          if (ph < 0.45) pose = 'windup';
          else { atkAt = c * cycle + 0.45; pose = t - atkAt < 0.345 ? 'strike' : 'idle'; }
          memo = trackAttackStamp(memo, atkAt);
          const v = dollAttackVariant(DV, wt, 'hero1', pose, memo);
          const req = dollActionTick({ ...base, pose, t, atkAt: atkAt ?? -99, windupT: ph, windupLen: 0.45, weaponType: wt, attack: v, elapsed: t });
          const af = DV.actions[req.action].af;
          if (pose === 'strike') { req.tick = advanceNoSkip(seq, req, atkAt, t, af); seq = { stamp: atkAt, key: req.action, slot: getSlot(af, req.tick), tick: req.tick, t }; }
          if (pose === 'windup') { const w = wind; if (w && w.stamp === atkAt && w.key === req.action && t - w.t >= 0 && t - w.t < .25) req.tick = Math.max(w.tick, req.tick); wind = { stamp: atkAt, key: req.action, tick: req.tick, t }; }
          if (pose === 'windup' && (cur === null || cur.pose !== 'windup')) { att++; cur = { pose, action: req.action, slot: -1 }; per.push(req.action); }
          if (pose === 'windup' || pose === 'strike') {
            assert.equal(req.action, cur.action, `${wt}@${fps} attack ${att}: one variant from windup to the end of the strike (${pose})`);
            const sl = getSlot(af, req.tick);
            assert.ok(sl >= cur.slot, `${wt}@${fps} attack ${att}: slot ${cur.slot} → ${sl} never goes back`);
            if (pose === 'strike') assert.ok(cur.pose !== 'strike' || sl <= cur.slot + 1, `${wt}@${fps} attack ${att}: at most one slot per frame in the strike`);
            else assert.equal(sl, 0, `${wt}@${fps} attack ${att} windup t=${t.toFixed(3)} ph=${ph.toFixed(3)} ${req.action} tick ${req.tick}`);
            cur.slot = sl; cur.pose = pose;
          } else if (cur) cur.pose = pose;
        }
        if (wt !== 'axe') assert.ok(new Set(per).size >= 2, `${wt}: variants actually change between attacks (${[...new Set(per)]})`);
      }
    });
  }
}

/* ------------------------------------------------------------ Phase 6（docs/DV2-PHASE6.md，docs/PAPERDOLL.md §23）：補齊 DV2 系統 */
{
  const root6 = path.dirname(fileURLToPath(import.meta.url));
  const dvp = path.join(root6, 'assets/paperdoll-dv2/paperdoll.json');
  const D6 = fs.existsSync(dvp) ? JSON.parse(fs.readFileSync(dvp, 'utf8')) : null;
  const NEW_SETS = { walk_unarmed: 0, idle_unarmed: 1, carry_walk: 4, carry: 5, pose: 6, cry: 7, cry_sit: 8, clap: 9, give: 10,
    jump_victory: 12, handshake: 13, punch: 18, punch2: 19, attack_v2: 21, shoot: 25, guard: 26, petrify: 27 };
  // synthetic pack with a 2x row whose body seb is templated per class
  const synth2x = () => {
    const D = synth();
    D.skins.body.k1 = { img: 'a', x: 0, y: 0 }; D.skins.body.k2 = { img: 'a', x: 0, y: 100 };
    D.sebs['body2x/k1/b0'] = { max: 1, frames: { 0: [0, 0, 60, 60, -30, -60, 0, 0] } };
    D.sebs['body2x/k2/b0'] = { max: 1, frames: { 0: [60, 0, 60, 60, -28, -58, 0, 0] } };
    D.actions['walk@2x'] = { af: [4, 8, 12, 16], loop: true, rig: 2, rows: [0, 1, 2, 3].map(() => ({ parts: { body: { seb: 'body2x/{v}/b0', off: [[0, 0]] } }, order: ['body'] })) };
    D.meta = { rig2x: { k1: 2, k2: 2 } };
    return D;
  };

  test('Phase 6 engine: 2x rows resolve only for rig 2, {v} picks the class cells, typeAlias, missing 2x falls back to the base 2x row', () => {
    const D = synth2x();
    assert.equal(resolveAction(D, 'walk', 'sword'), 'walk', '1x class never lands on a 2x row');
    assert.equal(resolveAction(D, 'walk', 'sword', 2), 'walk@2x');
    assert.equal(resolveAction(D, 'walkDown', 'sword', 2), 'walk@2x', 'direction suffix still stripped');
    assert.equal(resolveAction(D, 'walk@2x', 'sword', 1), 'walk', 'a 2x key asked for by a 1x class -> its 1x row');
    assert.equal(resolveAction(D, 'attack', 'sword', 2), 'attack', 'no 2x row at all for this action -> the 1x one (old packs keep working)');
    const b1 = byLayer(computeParts(D, { action: 'walk', dir: 1, tick: 0, look: { body: 'k1', rig: 2 } }), 'body');
    const b2 = byLayer(computeParts(D, { action: 'walk', dir: 1, tick: 0, look: { body: 'k2', rig: 2 } }), 'body');
    assert.deepEqual([b1.seb, b2.seb], ['body2x/k1/b0', 'body2x/k2/b0'], 'one class-agnostic row, each class its own cells');
    assert.deepEqual(b2.sprite.slice(4, 6), [-28, -58], 'the per-class neck shift lives in the frame');
    assert.equal(byLayer(computeParts(D, { action: 'walk', dir: 1, tick: 0, look: { body: 'k3', rig: 2 } }), 'body'), undefined, 'a class without cells for the row: no body (never another class\'s cells)');
    D.typeAlias = { rapier: 'sword' }; D.actions['attack.sword'] = D.actions.attack;
    assert.equal(resolveAction(D, 'attack', 'rapier'), 'attack.sword', 'rapier borrows the sword tables');
    assert.equal(resolveAction(D, 'attack', 'gun'), 'attack', 'no alias -> the base table');
  });

  test('Phase 6 engine: weaponFor / helmetSkin (2x versions, null when missing, 1x untouched)', () => {
    const D = { weapons: { sword: {}, 'sword@2x': { seb: 'weapon2x/std' }, fist: { hidden: true }, odd: {} },
      skins: { helmet: { helm: {}, 'helm@2x': {}, 'iron_helm@2x.paladin': {}, 'crown@2x.paladin': {} } } };
    assert.equal(weaponFor(D, 'sword', 2), 'sword@2x'); assert.equal(weaponFor(D, 'sword', 1), 'sword');
    assert.equal(weaponFor(D, 'fist', 2), 'fist', 'hidden weapons need no 2x art'); assert.equal(weaponFor(D, 'odd', 2), null, 'no 2x version -> not drawn');
    assert.equal(helmetSkin(D, 'helm', 'paladin', 2), 'iron_helm@2x.paladin', "the knight's helm -> the 2x iron helm art on this class's head");
    assert.equal(helmetSkin(D, 'helm', 'berserker', 2), 'helm@2x', 'no art hat for this class -> the 1x helm x2');
    assert.equal(helmetSkin(D, 'crown', 'berserker', 2), null, 'art hat placed on another class only -> none');
    assert.equal(helmetSkin(D, 'helm', 'paladin', 1), 'helm');
  });

  test('Phase 6 G5 petrify: stone tint is an engine flag on the parts + a pure pixel pass (alpha kept, grey, unknown tint untouched)', () => {
    const D = synth();
    D.actions.petrify = { ...D.actions.walk, tint: 'stone' };
    assert.equal(computeParts(D, { action: 'petrify', dir: 1, tick: 0, look: LOOK }).tint, 'stone');
    assert.equal(computeParts(D, { action: 'walk', dir: 1, tick: 0, look: LOOK }).tint, null);
    assert.equal(computeParts(D, { action: 'walk', dir: 1, tick: 0, look: LOOK, tint: 'stone' }).tint, 'stone', 'state.tint forces it on any action');
    assert.deepEqual([...TINTS], ['stone']);
    const px = new Uint8ClampedArray([255, 40, 20, 255, 10, 200, 90, 128, 1, 2, 3, 0]);
    tintPixels(px, 'stone');
    for (const i of [0, 4]) { assert.ok(Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2]) <= 12, `pixel ${i / 4} is grey stone`); }
    assert.deepEqual([px[3], px[7], px[11]], [255, 128, 0], 'alpha untouched'); assert.deepEqual([...px.slice(8, 11)], [1, 2, 3], 'transparent pixels untouched');
    const keep = new Uint8ClampedArray([9, 8, 7, 255]); tintPixels(keep, 'gold'); assert.deepEqual([...keep], [9, 8, 7, 255]);
  });

  test('Phase 6 G6 gender: lookFromHunter -> female head skin when shipped, else male; gender m by default', () => {
    const D = synth(); D.meta = {}; D.skins.head['h.f'] = { img: 'a', x: 0, y: 340 };
    const kitless = { classId: 'berserker' };
    assert.equal(lookFromHunter(kitless).gender, 'm'); assert.equal(lookFromHunter({ ...kitless, gender: 'f' }).gender, 'f');
    assert.equal(lookFromHunter({ ...kitless, gender: 'x' }).gender, 'm', 'unknown -> m');
    if (D6) {
      const has = !!D6.skins.head['paladin.f'];
      assert.equal(lookFromHunter({ classId: 'paladin', gender: 'f' }, D6).head, has ? 'paladin.f' : 'paladin', 'female head only when the pack ships it');
      assert.equal(lookFromHunter({ classId: 'archer', gender: 'f' }, D6).head, D6.skins.head['archer.f'] ? 'archer.f' : 'archer');
      assert.equal(lookFromHunter({ classId: 'paladin', gender: 'f' }, D6).body, 'paladin', 'bodies are shared (deliberate difference)');
    }
  });

  if (D6) {
    test('Phase 6 G1: all 32 DV2 action sets are in the pack, with our names; every 2x-rig class draws every one of them', () => {
      const sets = new Set(Object.values(D6.actions).map(a => a.dv2?.set).filter(Number.isInteger));
      assert.deepEqual([...sets].sort((a, b) => a - b), Array.from({ length: 32 }, (_, i) => i), 'DV2 sets 0..31');
      for (const [name, set] of Object.entries(NEW_SETS)) {
        assert.equal(D6.actions[name]?.dv2?.set, set, `${name} <- DV2 set ${set}`);
        for (const [k, a] of Object.entries(D6.actions)) if (k.replace(/@2x$/, '').split('.')[0] === name) assert.equal(a.dv2.set, set, k);
      }
      // weapon shown exactly where DV2 shows it (ball): unarmed / life sets hide it, pose / jump / gun / guard / 縦振り2 draw it
      for (const name of ['walk_unarmed', 'idle_unarmed', 'carry', 'carry_walk', 'cry', 'cry_sit', 'clap', 'give', 'handshake', 'punch', 'punch2', 'petrify'])
        for (const r of D6.actions[name].rows) assert.ok(r.parts.weapon.show.every(v => v === 0), `${name}: no weapon (DV2 ball 0)`);
      for (const name of ['pose', 'jump_victory', 'shoot', 'guard', 'attack_v2']) for (const r of D6.actions[name].rows) assert.ok(r.parts.weapon.show.every(v => v === 1), `${name}: weapon drawn`);
      assert.deepEqual(D6.actions.cry.af, [6, 12]); assert.deepEqual(D6.actions.jump_victory.af, [24]); assert.deepEqual(D6.actions.punch.af, [4, 8, 14]);
      assert.equal(D6.actions.punch2.headMirror, true, 'ﾊﾟﾝﾁ2 spProcType 1 = head mirror');
      assert.deepEqual([D6.actions.punch.releaseSlot, D6.actions.punch.impactSlot], [1, 2], 'punch is melee (DV2 hitWindow)');
      assert.deepEqual([D6.actions.shoot.releaseSlot, D6.actions.shoot.impactSlot ?? null], [1, null], 'gun is a projectile (no hit window)');
      for (const cls of Object.keys(D6.meta.rig2x || {})) {
        const look = lookFromHunter({ classId: cls }, D6);
        for (const name of Object.keys(NEW_SETS)) for (let d = 0; d < 4; d++) {
          const ps = computeParts(D6, { action: name, dir: d, tick: 0, look });
          assert.ok(ps.action.endsWith('@2x'), `${cls} ${name}: a 2x row (${ps.action})`);
          for (const l of ['body', 'head', 'hand']) assert.ok(ps.some(p => p.layer === l), `${cls} ${name} d${d}: ${l}`);
        }
      }
    });

    test('Phase 6 G1: 2x pose fallback chains end at a part every class has (rig2x.py POSE_PART), every pose used by actions.json is mapped', () => {
      const src = fs.readFileSync(path.join(root6, 'pipeline/scripts/dv2fmt/rig2x.py'), 'utf8');
      const block = src.slice(src.indexOf('POSE_PART = {'), src.indexOf('POSE_DY'));
      const map = Object.fromEntries([...block.matchAll(/"([a-z0-9_]+)": \[([^\]]*)\]/g)].map(m => [m[1], [...m[2].matchAll(/"([a-z0-9_]+)"/g)].map(x => x[1])]));
      assert.match(src, /POSE_PART\.get\(pose, \[pose\]\) \+ \["stand"\]/, 'choose() always appends "stand"');
      const A = JSON.parse(fs.readFileSync(path.join(root6, 'pipeline/scripts/dv2fmt/actions.json'), 'utf8'));
      const used = new Set(Object.values(A.actions).flatMap(a => Object.values(a.views).flatMap(sl => sl.map(s => s.pose || s.cell))));
      for (const p of used) assert.ok(map[p], `pose ${p} has a POSE_PART chain`);
      const PH6 = { carry: 'cheer', carry_walk_l: 'cheer', carry_walk_r: 'cheer', pose: 'swing', cry: 'hurt', cry_sit: 'crouch', clap0: 'windup', clap1: 'windup',
        give0: 'windup', give1: 'swing', punch0: 'windup', punch1: 'swing', punch2: 'swing', guard: 'windup' };
      for (const [pose, fb] of Object.entries(PH6)) assert.equal(map[pose].at(-1), fb, `${pose} falls back to ${fb} (docs/DV2-PHASE6.md §2.1), then stand`);
    });

    test('Phase 6 G2: rapier / spear / gun / fist: combos from the DV2 weapon table, holdable by every class, fist and art-less gun hidden', () => {
      const C = D6.combos;
      assert.deepEqual(C.rapier, { count: 5, pool: [['attack_t', 100], ['attack', 30], ['attack_h', 40]] }, 'RAPIR: 突き first (chargeType SPEAR)');
      assert.deepEqual(C.spear, { count: 4, pool: [['attack_t', 100], ['attack', 30], ['attack_h', 40]] });
      assert.deepEqual(C.gun, { count: 3, pool: [['shoot', 100]] }); assert.deepEqual(C.fist, { count: 5, pool: [['punch', 100], ['punch2', 40]] });
      assert.equal(comboCount(D6, 'fist'), 5); assert.equal(attackVariant(D6, 'fist', 0.1), 'punch'); assert.equal(attackVariant(D6, 'fist', 0.9), 'punch2'); assert.equal(attackVariant(D6, 'gun', 0.5), 'shoot');
      assert.equal(D6.weapons.fist.hidden, true, 'DV2 PUNCH spProcType 2: no weapon layer');
      for (const t of ['rapier', 'spear', 'gun']) assert.equal(D6.weapons[t].type, t);
      if (!D6.weapons.gun.skin) assert.equal(D6.weapons.gun.hidden, true, 'gun without art: hidden, not a stand-in');
      for (const cls of ['archer', 'paladin', 'berserker', 'darkknight']) for (const kind of ['rapier', 'spear', 'gun', 'fist']) {
        const look = lookFromHunter({ classId: cls, weaponKind: kind, equipment: { weapon: true } }, D6);
        assert.equal(look.weaponType, kind, `${cls} ${kind}`);
        for (const pose of ['windup', 'strike']) {
          const att = dollAttackVariant(D6, kind, cls, pose, { stamp: 1, prev: 0 });
          const r = dollActionTick({ pose, t: 10.1, atkAt: 10, windupT: 0.2, windupLen: 0.45, hitDelay: 0.07, hitStop: 0.07, strikeEnd: 0.345, data: D6, weaponType: kind, attack: att });
          const ps = computeParts(D6, { action: r.action, dir: 1, tick: r.tick, look });
          assert.ok(ps.some(p => p.layer === 'body') && ps.some(p => p.layer === 'head'), `${cls} ${kind} ${pose} draws`);
          assert.equal(ps.some(p => p.layer === 'weapon'), !D6.weapons[look.weapon.replace(/@2x$/, '')]?.hidden && !!look.weapon && at(D6.actions[ps.action].rows[1].parts.weapon.show, ps.slot, 1) === 1, `${cls} ${kind} ${pose}: weapon iff not hidden and shown`);
        }
      }
      // the timing contract holds on the new melee variants (punch): impact slot exactly at the hit, never before
      const A = D6.actions.punch;
      for (let ms = 0; ms <= 344; ms += 2) {
        const r = dollActionTick({ pose: 'strike', t: 10 + ms / 1000, atkAt: 10, hitDelay: 0.07, hitStop: 0.07, strikeEnd: 0.345, data: D6, weaponType: 'fist', attack: 'punch' });
        assert.equal(r.action, 'punch'); const sl = getSlot(A.af, r.tick);
        if (ms < 70) assert.ok(sl >= A.releaseSlot && sl < A.impactSlot, `${ms}ms release`); else if (ms < 140) assert.equal(sl, A.impactSlot, `${ms}ms impact`);
      }
    });

/* ------------------------------------------- LPC 旅人（exp/lpc-hero）：自己一張 13 列 sheet，沒有 DV2 rig */
const pngWH = (file) => { const b = fs.readFileSync(file); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
test('traveler (LPC sheet): art + 13 rows cover every direction the game asks for, no DV2 rig needed', () => {
  const heroDir = path.join(root, 'assets/heroes');
  const meta = JSON.parse(fs.readFileSync(path.join(heroDir, 'traveler.json'), 'utf8'));
  const [w, h] = pngWH(path.join(heroDir, 'traveler.png'));
  assert.equal(meta.hero, 'traveler'); assert.equal(meta.cell, 64); assert.equal(meta.cols, 9);
  assert.equal(meta.heroHeight, 50, 'art height in px (drawSheetHero: 21 logical units)'); assert.equal(meta.footFromBottom, 1);
  assert.equal(w, meta.cols * meta.cell, 'sheet width = cols x cell'); assert.equal(h, 13 * meta.cell, 'sheet height = 13 rows x cell');
  assert.ok(Array.isArray(meta.palette) && meta.palette.length === 16 && meta.palette.every(c => /^#[0-9a-f]{6}$/i.test(c)),
    'palette: 16 hex colours (pixel-world.js variantMap does meta.palette.map and throws without it)');
  assert.ok(meta.groups && Array.isArray(meta.groups.outfit) && Array.isArray(meta.groups.metal), 'groups.outfit/metal');
  // dir4 asks for <act>, <act>Down, <act>Up (left is mirrored from the plain row) + hurt/death/victory/skill
  for (const k of ['idle', 'idleDown', 'idleUp', 'walk', 'walkDown', 'walkUp', 'attack', 'attackDown', 'attackUp', 'hurt', 'death', 'victory', 'skill'])
    assert.ok(meta.actions[k], `has ${k}`);
  for (const [k, a] of Object.entries(meta.actions)) {
    assert.equal(a.cell, meta.cell, `${k} cell`); assert.equal(a.cols, meta.cols, `${k} cols`);
    assert.ok(Number.isInteger(a.y) && a.y % meta.cell === 0 && a.y + meta.cell <= h, `${k} row inside the sheet`);
    assert.ok(a.frames >= 1 && a.frames <= meta.cols, `${k} frames fit one row (${a.frames})`);
    assert.ok(a.frameTime > 0, `${k} frameTime`);
  }
  assert.ok(!meta.parts, 'the weapon is baked into the sheet; no parts overlay');
  // traveler was removed from playable CLASSES on 2026-11-22 (migrates to berserker), while its LPC sheet asset remains intact.
  assert.equal(CLASSES.some(c => c.id === 'traveler'), false, 'traveler removed from playable CLASSES');
});

    test('Phase 6 G3/G4: effect types 2/3/4 wired where DV2 uses them (drawn only when the art ships); cry face (hurt fallback at 1x)', () => {
      const fxOf = (k, d, slot) => { const e = D6.actions[k].rows[d].parts.effect; return e && at(e.act, slot, 0) ? at(e.type, slot, null) : null; };
      assert.equal(fxOf('attack_t', 1, 1), 'thrust', 'N8: 突き uses effect_thrust');
      assert.equal(fxOf('punch', 1, 1), D6.effects.punch ? 'punch' : null, 'ﾊﾟﾝﾁ slot 1: punch effect iff effect_punch.png ships');
      assert.equal(fxOf('shoot', 1, 1), D6.effects.gunfire ? 'gunfire' : null, '銃 slot 1: gunfire iff effect_gunfire.png ships');
      for (const t of ['punch', 'gunfire']) assert.equal(!!D6.effects[t], fs.existsSync(path.join(root6, `assets/paperdoll-dv2/src/effect_${t}.png`)), `${t} effect <-> its src art`);
      for (const k of ['cry', 'cry_sit']) assert.ok(D6.actions[k].rows.every(r => r.parts.head.seb === 'head/cry'), `${k}: cry face`);
      assert.deepEqual(D6.sebs['head/cry'], D6.sebs['head/hurt'], '1x heads: cry = the hurt column');
      if (D6.sebs['head2x/cry']) assert.ok(D6.actions['cry@2x'].rows.every(r => r.parts.head.seb === 'head2x/cry'));
      assert.equal(D6.actions.petrify.tint, 'stone'); assert.ok(Object.entries(D6.actions).every(([k, a]) => !a.tint || k.startsWith('petrify')), 'only petrify is tinted');
      for (const cls of ['archer', 'paladin', 'berserker']) assert.equal(computeParts(D6, { action: 'petrify', dir: 2, tick: 0, look: lookFromHunter({ classId: cls, equipment: { weapon: true, chest: true, cape: true, helm: true } }, D6) }).tint, 'stone', `${cls}: petrify tints every layer`);
      // jump_victory hop: the whole figure rises mid-jump and lands at the start/end
      const look = lookFromHunter({ classId: 'archer' }, D6), y = t => byLayer(computeParts(D6, { action: 'jump_victory', dir: 1, tick: t, look }), 'body').y;
      assert.ok(y(12) < y(0) && y(0) === y(24), `hop: ${y(0)} -> ${y(12)}`);
    });

    test('Phase 6 G9: a class runs the 2x rig iff its parts are installed (body_stand_front + head_normal_front); otherwise 1x exactly as before', () => {
      const R = D6.meta.rig2x || {};
      for (const { id } of classesWithDollRig(D6)) {
        const dir = path.join(root6, 'assets/paperdoll-dv2/src/x2', id);
        const has = fs.existsSync(path.join(dir, 'body_stand_front.png')) && fs.existsSync(path.join(dir, 'head_normal_front.png'));
        assert.equal(R[id] === 2, has, `${id}: 2x rig <-> its parts`);
        const look = lookFromHunter({ classId: id, equipment: { weapon: true } }, D6);
        assert.equal(look.rig, has ? 2 : 1);
        const ps = computeParts(D6, { action: 'idle', dir: 2, tick: 0, look });
        assert.equal(ps.action.endsWith('@2x'), has, `${id} idle row scale`);
        const w = ps.find(p => p.layer === 'weapon');
        if (w) assert.equal(w.seb === 'weapon2x/std', has, `${id}: weapon cell scale matches the body`);
      }
      for (const k of ['darkknight', 'warrior']) assert.ok(!R[k], `${k} (legacy id) stays 1x`);
      // every 2x weapon / hat cell has its own art or an exact x2 copy; art hats exist per 2x class
      for (const [n, w] of Object.entries(D6.weapons)) if (n.endsWith('@2x')) { assert.equal(w.seb, 'weapon2x/std'); assert.deepEqual(w.handle.map(v => v % 2), [0, 0], `${n} grip on the 2x grid`); }
      const artHats = fs.readdirSync(path.join(root6, 'assets/paperdoll-dv2/src/x2')).filter(f => /^hat_.+_(back|side|front)\.png$/.test(f)).map(f => f.replace(/^hat_/, '').replace(/_(back|side|front)\.png$/, ''));
      for (const h of new Set(artHats)) for (const cls of Object.keys(R)) assert.ok(D6.skins.helmet[`${h}@2x.${cls}`], `art hat ${h} placed on ${cls}`);
    });

    test('Phase 6 game hooks: victory sometimes jump_victory (deterministic per cheer), trading -> give; everything else API-only', () => {
      let jumps = 0;
      for (let i = 0; i < 200; i++) { const v = dollVictoryAction(D6, 'h' + i, 12.5); assert.ok(v === 'victory' || v === 'jump_victory'); if (v === 'jump_victory') jumps++; assert.equal(dollVictoryAction(D6, 'h' + i, 12.5), v, 'same cheer, same pick'); }
      assert.ok(jumps > 30 && jumps < 100, `~${JUMP_VICTORY_RATE * 100}% jumps (${jumps}/200)`);
      assert.equal(dollVictoryAction({ actions: {} }, 'h1', 1), 'victory', 'old pack: plain victory');
      const r = dollActionTick({ pose: 'victory', cheerT: 0.6, data: D6, weaponType: 'sword', victory: 'jump_victory' });
      assert.equal(r.action, 'jump_victory.sword'); assert.equal(r.loop, true);
      assert.equal(dollActionTick({ pose: 'victory', cheerT: 0.6, data: D6, weaponType: 'sword', victory: 'victory' }).action, 'victory', 'plain victory = the old path, unchanged');
      assert.deepEqual(['交易中', '購買裝備', '待機', '戰鬥中', null].map(dollLifeAction), ['give', 'give', null, null, null]);
      const g = dollActionTick({ pose: 'idle', elapsed: 2, data: D6, weaponType: 'bow', life: 'give' });
      assert.equal(g.action, 'give'); assert.equal(g.life, 'give');
      assert.equal(dollActionTick({ pose: 'walk1', i: 1, walkFrames: 8, data: D6, weaponType: 'bow', life: 'give' }).action, 'walk.bow', 'life actions only while standing');
      assert.equal(dollActionTick({ pose: 'idle', elapsed: 2, data: D6, weaponType: 'bow', life: 'give', ride: 'sit' }).action.split('.')[0], 'ride_sit', 'riding wins');
    });
  }
}

if (failed.length) { console.error(`test-paperdoll: ${failed.length} FAILED: ${failed.join(' | ')}`); process.exit(1); }
console.log(`test-paperdoll: ${passed} tests passed`);
