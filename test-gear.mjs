// 2026-11-15 裝備物品化測試:目錄完整性、初始套裝、卸下/出售/分解/倉庫、外觀連動、存檔遷移。
import assert from 'node:assert/strict';
import { createGame } from './src/pixel-game.js';
import { EQUIPMENT, CLASS_STARTER, EQUIP_SLOTS, GEAR_SLOTS, CLASSES, MATERIALS } from './src/pixel-data.js';
import { heroloomLook, CLASS_LOOK } from './src/heroloom.js';

let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); passed++; };
const sumStats = (gear, slot) => {
  const item = gear[slot] && EQUIPMENT[gear[slot].itemId];
  return item ? item.stats : { atk: 0, hp: 0, def: 0 };
};

// ── 1. 物品目錄完整性 ──
for (const [id, item] of Object.entries(EQUIPMENT)) {
  eq(item.id, id, `${id} id matches`);
  ok(EQUIP_SLOTS.includes(item.slot), `${id} slot is a real equipment slot`);
  ok(item.stats && Number.isFinite(item.stats.atk) && Number.isFinite(item.stats.hp) && Number.isFinite(item.stats.def), `${id} stats are numbers`);
  ok(item.price > 0 && item.sell > 0 && item.sell < item.price, `${id} price/sell sane`);
  for (const key of Object.keys(item.salvage || {})) ok(!!MATERIALS[key], `${id} salvage material ${key} exists`);
  for (const key of ['hat', 'top', 'bottom', 'shoes', 'cape', 'weapon', 'shield']) {
    if (item.look && item.look[key] !== undefined) eq(typeof item.look[key], 'string', `${id} look.${key} is a part id`);
  }
}
ok(Object.keys(EQUIPMENT).length >= 49, 'at least 49 equipment items (7 classes × 7 starter + craft upgrades)');

// ── 2. 每職業初始七件套都存在、穿在招募進來的獵人身上 ──
const g = createGame();
ok(g.state.hunters.length === CLASSES.length, 'fresh game has one hunter per class');
ok(typeof g.state.gearSeq === 'number' && g.state.gearSeq > 0, 'gear instance counter exists');
ok(Array.isArray(g.state.gearStorage) && g.state.gearStorage.length === 0, 'warehouse starts empty');
for (const c of CLASSES) {
  const set = CLASS_STARTER[c.id];
  ok(!!set, `${c.id} has a starter set`);
  for (const slot of EQUIP_SLOTS) {
    ok(!!EQUIPMENT[set[slot]], `${c.id}.${slot} starter item exists`);
    eq(EQUIPMENT[set[slot]].slot, slot, `${c.id}.${slot} item is for that slot`);
    eq(EQUIPMENT[set[slot]].classId, c.id, `${c.id}.${slot} belongs to the class`);
  }
  let hp = 0, def = 0, atk = 0;
  for (const slot of EQUIP_SLOTS) { const s = EQUIPMENT[set[slot]].stats; hp += s.hp; def += s.def; atk += s.atk; }
  eq({ hp, def, atk }, { hp: 28, def: 4, atk: 7 }, `${c.id} starter totals equal the old single-armor bonus`);
}
for (const h of g.state.hunters) {
  const set = CLASS_STARTER[h.classId];
  for (const slot of EQUIP_SLOTS) {
    ok(!!(h.gear && h.gear[slot]), `${h.classId}.${slot} is equipped on the rolled hunter`);
    eq(h.gear[slot].itemId, set[slot], `${h.classId}.${slot} is the starter item`);
  }
  eq(h.equipment.weapon, true, `${h.classId} equipment.weapon mirrors gear`);
  eq(h.equipment.armor, true, `${h.classId} equipment.armor mirrors gear`);
  ok(h.maxHp > CLASSES.find(c => c.id === h.classId).hp, `${h.classId} starter armour raises maxHp`);
}

// ── 3. 卸下 / 存放 / 出售 / 分解 / 從倉庫穿上 ──
const hero = g.state.hunters.find(h => h.classId === 'archer');
const helmItem = EQUIPMENT[hero.gear.helm.itemId];
const hpWithHelm = hero.maxHp;
const r1 = g.unequipGear(hero.id, 'helm');
ok(r1.ok, 'unequip helm succeeds');
eq(hero.gear.helm, null, 'helm slot is empty after unequip');
eq(g.state.gearStorage.at(-1).itemId, helmItem.id, 'unequipped item went to the warehouse');
ok(hero.maxHp < hpWithHelm, 'unequipping armour lowers maxHp');
const storedUid = g.state.gearStorage.at(-1).uid;
const r2 = g.equipFromStorage(hero.id, storedUid);
ok(r2.ok, 'equip from warehouse succeeds');
eq(hero.gear.helm.itemId, helmItem.id, 'helm is worn again');
eq(g.state.gearStorage.length, 0, 'warehouse is empty again after equipping');
eq(hero.maxHp, hpWithHelm, 'stats return after re-equipping');

const chestItem = EQUIPMENT[hero.gear.chest.itemId];
const r3 = g.storeGear(hero.id, 'chest');
ok(r3.ok, 'store chest succeeds');
eq(hero.gear.chest, null, 'chest slot empty after storing');
eq(g.state.gearStorage.at(-1).itemId, chestItem.id, 'chest is in the warehouse');
const lookNoChest = heroloomLook(hero);
ok(!lookNoChest.parts.top, 'heroloom doll has no top part without a chest item');
const chestUid = g.state.gearStorage.at(-1).uid;
ok(g.equipFromStorage(hero.id, chestUid).ok, 'chest can be put back on');
eq(heroloomLook(hero).parts.top, 'tunic', 'heroloom doll wears the tunic again with the chest item');

const glovesItem = EQUIPMENT[hero.gear.gloves.itemId];
const goldBeforeSell = hero.gold;
ok(g.sellGear(hero.id, 'gloves').ok, 'sell equipped gloves succeeds');
eq(hero.gold, goldBeforeSell + glovesItem.sell, 'selling pays the item sell price to the hunter');
eq(hero.gear.gloves, null, 'sold slot is empty');
for (const [key, qty] of Object.entries(glovesItem.salvage)) hero.inventory[key] = 0;

const legsItem = EQUIPMENT[hero.gear.legs.itemId];
const invBeforeSalvage = { ...hero.inventory };
ok(g.salvageGear(hero.id, 'legs').ok, 'salvage equipped legs succeeds');
eq(hero.gear.legs, null, 'salvaged slot is empty');
for (const [key, qty] of Object.entries(legsItem.salvage)) eq(hero.inventory[key], (invBeforeSalvage[key] || 0) + qty, `salvage returns ${key}`);

// ── 4. 倉庫物品:出售 / 分解 ──
g.unequipGear(hero.id, 'boots');
const bootsUid = g.state.gearStorage.at(-1).uid;
const villageGold = g.state.gold;
ok(g.sellStoredGear(bootsUid).ok, 'sell from warehouse succeeds');
ok(g.state.gold > villageGold, 'selling stored gear pays the village');
g.unequipGear(hero.id, 'belt');
const beltUid = g.state.gearStorage.at(-1).uid;
const woodBefore = g.state.wood;
ok(g.salvageStoredGear(beltUid).ok, 'salvage from warehouse succeeds');
ok(g.state.wood >= woodBefore, 'salvaging stored gear refunds materials to the village');

// ── 5. 外觀:穿齊初始套裝 = 職業預設外觀 ──
const gFresh = createGame();
for (const h of gFresh.state.hunters) {
  const preset = CLASS_LOOK[h.classId];
  const look = heroloomLook(h);
  for (const slot of Object.keys(preset.parts)) eq(look.parts[slot], preset.parts[slot], `${h.classId} preset part ${slot} is reproduced by its starter gear`);
}
const traveler = gFresh.state.hunters.find(h => h.classId === 'traveler');
ok(!heroloomLook(traveler).parts.weapon, 'traveler starter kit is unarmed (no weapon part)');
const legacy = heroloomLook({ classId: 'archer', equipment: { weapon: true, armor: true } });
eq(legacy.parts.top, 'armor', 'hunters without h.gear still use the legacy equipment booleans');

// ── 6. 存檔往返 ──
const snapshot = g.serialize();
const g2 = createGame(snapshot);
const h2 = g2.state.hunters.find(h => h.id === hero.id);
ok(!!h2, 'hunter survives save/load');
eq(h2.gear.chest.itemId, chestItem.id, 'equipped item survives save/load');
eq(g2.state.gearStorage.length, g.state.gearStorage.length, 'warehouse survives save/load');
eq(h2.maxHp, hero.maxHp, 'stats survive save/load');
const uids = new Set(g2.state.hunters.flatMap(h => Object.values(h.gear || {}).filter(Boolean).map(g => g.uid)).concat(g2.state.gearStorage.map(g => g.uid)));
eq(uids.size, g2.state.hunters.reduce((n, h) => n + Object.values(h.gear || {}).filter(Boolean).length, 0) + g2.state.gearStorage.length, 'gear uids are unique after reload');

// ── 7. 舊存檔遷移:沒有 gear 欄位 → 自動補初始套裝,舊 weapon=true 升級成精鐵武器 ──
const oldSave = JSON.parse(JSON.stringify(snapshot));
for (const h of oldSave.hunters) { delete h.gear; h.equipment = { weapon: true, armor: true }; }
const g3 = createGame(oldSave);
for (const h of g3.state.hunters) {
  ok(!!h.gear, `${h.classId} migrated hunter has gear`);
  for (const slot of EQUIP_SLOTS) ok(!!h.gear[slot], `${h.classId}.${slot} migrated starter gear exists`);
  eq(h.gear.weapon.itemId, 'craft_weapon', 'old equipment.weapon=true migrates to the crafted weapon item (same +7 atk)');
  eq(h.equipment.armor, true, 'migrated hunter counts as armoured');
}

// ── 8. 精鐵升級件可以穿上,替換下來的初始件會回倉庫,數值比初始件強 ──
const g4 = createGame();
const paladin = g4.state.hunters.find(h => h.classId === 'paladin');
const beforeHp = paladin.maxHp;
g4.state.gearStorage.push({ uid: 'gtest1', itemId: 'craft_chest' });
ok(g4.equipFromStorage(paladin.id, 'gtest1').ok, 'crafted chest equips from the warehouse');
eq(paladin.gear.chest.itemId, 'craft_chest', 'crafted chest occupies the chest slot');
ok(paladin.maxHp > beforeHp, 'crafted chest raises maxHp above the starter chest');
eq(g4.state.gearStorage.at(-1).itemId, 'paladin_plate', 'the replaced starter chest goes back to the warehouse');

// ── 9. 裝備縮圖(使用者 m03470):每個裝備都要有一張 32×32 PNG,而且 build.mjs 要把圖表塞進 PIXEL_ASSETS.gearIcons ──
{
  const fs = await import('node:fs');
  const path = await import('node:path');
  const iconDir = path.join(process.cwd(), 'assets/gear-icons');
  ok(fs.existsSync(iconDir), 'assets/gear-icons/ exists');
  const pngIds = new Set(fs.readdirSync(iconDir).filter(f => f.endsWith('.png')).map(f => f.replace(/\.png$/, '')));
  for (const id of Object.keys(EQUIPMENT)) {
    ok(pngIds.has(id), `${id} has a gear icon png`);
    const buf = fs.readFileSync(path.join(iconDir, `${id}.png`));
    ok(buf.length > 80 && buf[0] === 0x89 && buf[1] === 0x50, `${id} icon is a real png`);
    eq(buf.readUInt32BE(16), 32, `${id} icon width 32`);
    eq(buf.readUInt32BE(20), 32, `${id} icon height 32`);
  }
  eq(pngIds.size, Object.keys(EQUIPMENT).length, 'gear-icons dir has no stray/extra item pngs');
  const buildSrc = fs.readFileSync(path.join(process.cwd(), 'build.mjs'), 'utf8');
  ok(buildSrc.includes('assets/gear-icons') && buildSrc.includes('PIXEL_ASSETS.gearIcons'), 'build.mjs wires assets/gear-icons into PIXEL_ASSETS.gearIcons');
  const uiSrc = fs.readFileSync(path.join(process.cwd(), 'src/z2a-hunter.js'), 'utf8');
  const ui2 = fs.readFileSync(path.join(process.cwd(), 'src/pixel-ui.js'), 'utf8');
  ok(uiSrc.includes('gearIcons') && ui2.includes('gearIcons'), 'gear tab and warehouse read PIXEL_ASSETS.gearIcons');
}

console.log(`test-gear: ${passed} passed`);
