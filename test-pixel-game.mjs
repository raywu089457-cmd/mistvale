import assert from 'node:assert/strict';
import { createGame } from './src/pixel-game.js';
import { BUILDINGS, CLASSES, MATERIALS, PRODUCTS } from './src/pixel-data.js';

function run(game, seconds, quiet = false, inspect = null) {
  for (let i = 0; i < Math.ceil(seconds * 10); i++) {
    if (quiet) { game.state.enemies = []; game.state.spawnTimer = 0; }
    game.tick(0.1); inspect?.(game.state);
  }
}
function isolate(game) {
  const h = game.state.hunters[0]; game.state.hunters = [h];
  h.hp = h.maxHp; h.satiety = h.mood = h.stamina = 100; h.task = null; h.route = []; h.rallying = false; h.lastTownVisit = 0;
  for (const key of Object.keys(h.inventory)) h.inventory[key] = 0;
  game.state.enemies = []; return h;
}
function totalMoney(g) { return g.state.gold + g.state.hunters.reduce((sum, h) => sum + h.gold, 0); }
function assertFiniteEconomy(s) {
  for (const key of ['gold', 'wood', 'ore', 'flour', 'cloth', 'leather', 'herb', 'gems']) assert.ok(Number.isFinite(s[key]) && s[key] >= 0, `${key} remains nonnegative`);
  for (const amount of Object.values(s.stocks)) assert.ok(Number.isFinite(amount) && amount >= 0);
  for (const h of s.hunters) {
    assert.ok(Number.isFinite(h.x) && Number.isFinite(h.z) && Number.isFinite(h.hp));
    assert.ok(h.hp >= 0 && h.hp <= h.maxHp + 1e-6);
    assert.ok(h.gold >= 0); assert.ok(Object.values(h.inventory).every(n => n >= 0));
    for (const key of ['satiety', 'mood', 'stamina']) assert.ok(h[key] >= 0 && h[key] <= 100, `${key} bounded`);
  }
}

const g = createGame();
assert.equal(g.state.version, 2); assert.equal(g.state.hunters.length, 5); assert.equal(new Set(g.state.hunters.map(h => h.classId)).size, CLASSES.length);
assert.equal(g.state.gold, 1500); assert.equal(g.state.capacity, 8); assert.equal(g.state.visitors.length, 3);
assert.ok(g.state.hunters.every(h => h.gold === 100 && h.level >= 3 && h.level <= 5));
assert.equal(g.recruit('__proto__').ok, false); assert.equal(g.recruit('missing').ok, false);
const visitor = { ...g.state.visitors[0] }, goldBeforeRecruit = g.state.gold;
assert.equal(g.recruit(visitor.id).ok, true); assert.equal(g.state.gold, goldBeforeRecruit - visitor.cost);
assert.equal(g.state.hunters.at(-1).rarity, visitor.rarity); assert.equal(g.state.hunters.at(-1).trait, visitor.trait); assert.equal(g.state.hunters.at(-1).classId, visitor.classId);
assert.notEqual(g.state.visitors[0].id, visitor.id); assert.equal(g.state.quest.complete, true);
assert.equal(g.claimQuest().ok, true); assert.equal(g.claimQuest().ok, false);
assert.equal(g.craft('food', 2).ok, true); assert.equal(g.state.stocks.food, 50); assert.equal(g.state.counts.foodCrafted, 20); assert.equal(g.claimQuest().ok, true);
assert.equal(g.craft('__proto__').ok, false); assert.equal(g.craft('food', -1).ok, false); assert.equal(g.craft('food', 0.5).ok, false);
assert.equal(g.setTradeRequest('ore', -1).ok, false); assert.equal(g.setTradeRequest('__proto__', 20).ok, false);

const service = createGame(), hungry = isolate(service);
const restaurant=BUILDINGS.find(b=>b.id==='restaurant');
const mealDoor={x:restaurant.x,z:restaurant.z+restaurant.d/2+.6};
Object.assign(hungry,mealDoor); hungry.satiety = 5;
const serviceTotal = totalMoney(service), serviceGold = service.state.gold, mealStock = service.state.stocks.food;
run(service, 8, true);
assert.equal(service.state.stocks.food, mealStock - 1); assert.equal(service.state.gold, serviceGold + PRODUCTS.food.price); assert.equal(totalMoney(service), serviceTotal);
assert.ok(hungry.satiety > 65); assert.equal(service.state.counts.services, 1);
const serviceSave = createGame(), diner = isolate(serviceSave); Object.assign(diner,mealDoor); diner.satiety = 5; run(serviceSave, 1, true);
assert.equal(diner.serviceStarted, true); const paidGold = serviceSave.state.gold, paidStock = serviceSave.state.stocks.food;
const resumedService = createGame(serviceSave.serialize()); run(resumedService, 4, true);
assert.equal(resumedService.state.gold, paidGold, 'Reload does not double-charge an in-progress meal'); assert.equal(resumedService.state.stocks.food, paidStock); assert.ok(resumedService.state.hunters[0].satiety > 65);
const basics = createGame(), broke = isolate(basics); Object.assign(broke,mealDoor); broke.satiety = 0; broke.gold = 0;
const basicGold = basics.state.gold, basicStock = basics.state.stocks.food; run(basics, 9, true);
assert.equal(basics.state.gold, basicGold); assert.equal(basics.state.stocks.food, basicStock); assert.ok(broke.satiety > 55); assert.equal(basics.state.counts.basicServices, 1);
const noStock = createGame(), stranded = isolate(noStock); Object.assign(stranded,mealDoor); stranded.satiety = 0; noStock.state.stocks.food = 0; run(noStock, 9, true);
assert.ok(stranded.satiety > 55, 'Emergency basics avoid empty-stock deadlock'); assert.equal(noStock.state.stocks.food, 0); assert.equal(noStock.state.gold, 1500);

const trading = createGame(), merchant = isolate(trading),market=BUILDINGS.find(b=>b.id==='trading'); const marketDoor={x:market.x,z:market.z+market.d/2+.6}; trading.state.time = 100; Object.assign(merchant,marketDoor); merchant.inventory.ore = 20;
assert.equal(trading.setTradeRequest('ore', 10).ok, true); const tradeTotal = totalMoney(trading), townOre = trading.state.ore;
run(trading, 4, true); assert.equal(merchant.inventory.ore, 10); assert.equal(trading.state.ore, townOre + 10); assert.equal(trading.state.tradeRequests.ore, 0);
assert.equal(trading.state.gold, 1470); assert.equal(merchant.gold, 130); assert.equal(totalMoney(trading), tradeTotal); assert.equal(trading.state.counts.traded, 10);
const poorTown = createGame(), seller = isolate(poorTown); poorTown.state.time = 100; poorTown.state.gold = 4; Object.assign(seller,marketDoor); seller.inventory.ore = 20;
run(poorTown, 4, true); assert.equal(poorTown.state.gold, 1); assert.equal(seller.inventory.ore, 19); assert.equal(seller.gold, 103);

const gear = createGame(), buyer = isolate(gear),forge=BUILDINGS.find(b=>b.id==='forge'); gear.state.time = 100; buyer.x = forge.x; buyer.z = forge.z+forge.d/2+.6; buyer.gold = 300;
assert.equal(gear.craftEquipment('weapon').ok, true); assert.equal(gear.craftEquipment('armor').ok, true);
const gearMoney = totalMoney(gear), attackBefore = buyer.attack, hpBefore = buyer.maxHp; run(gear, 5, true);
assert.ok(buyer.equipment.weapon && buyer.equipment.armor); assert.equal(gear.state.gearStock.weapon, 0); assert.equal(gear.state.gearStock.armor, 0);
assert.equal(gear.state.counts.gearSold, 2); assert.equal(totalMoney(gear), gearMoney); assert.ok(buyer.attack > attackBefore && buyer.maxHp > hpBefore);
assert.equal(gear.enhance(buyer.id).ok, false); assert.equal(gear.construct('enhancement').ok, true); assert.equal(gear.enhance(buyer.id).ok, true); assert.equal(buyer.weaponLevel, 1);
assert.equal(gear.learnSkill(buyer.id).ok, false); gear.state.ore += 100; assert.equal(gear.construct('academy').ok, true); assert.equal(gear.learnSkill(buyer.id).ok, true);
assert.equal(gear.train(buyer.id).ok, false); gear.state.gold += 1000; assert.equal(gear.construct('training').ok, true);
const trainLevel = buyer.level, trainingMoney = totalMoney(gear); assert.equal(gear.train(buyer.id).ok, true); assert.equal(buyer.level, trainLevel + 5); assert.equal(totalMoney(gear), trainingMoney); assert.equal(gear.train(buyer.id).ok, false);
run(gear, 10.2, true); assert.equal(gear.train(buyer.id).ok, true);
assert.equal(gear.reincarnate(buyer.id).ok, false); buyer.level = 100; const originalRebirth = buyer.rebirths; assert.equal(gear.reincarnate(buyer.id).ok, true); assert.equal(buyer.level, 1); assert.equal(buyer.rebirths, originalRebirth + 1);
assert.equal(gear.setDifficulty(1).ok, true); assert.equal(gear.setDifficulty(4).ok, false); assert.equal(gear.setDifficulty('1').ok, false);

const buildings = createGame(); buildings.state.gold = buildings.state.wood = buildings.state.ore = 100000;
assert.equal(buildings.upgrade('forge').ok, true); assert.deepEqual(buildings.getUpgradeCost('forge'), { gold: 352, wood: 40, ore: 48 });
assert.equal(buildings.upgrade('forge').ok, false, 'Hall gates higher building levels'); assert.equal(buildings.upgrade('hall').ok, true); assert.equal(buildings.upgrade('forge').ok, true);
assert.equal(buildings.upgrade('house').ok, true); assert.equal(buildings.state.capacity, 10); assert.equal(buildings.upgrade('academy').ok, false);
assert.equal(buildings.construct('academy').ok, true); assert.equal(buildings.construct('academy').ok, false);
assert.equal(buildings.moveBuilding('bounty', 5, 17).ok, true); assert.equal(buildings.moveBuilding('hall', -8, 2).ok, false, 'plaza stays open'); assert.equal(buildings.moveBuilding('hall', -100, 0).ok, false); assert.equal(buildings.moveBuilding('dungeon', 0, 0).ok, false);
const movedSaved = createGame(buildings.serialize()); assert.deepEqual(movedSaved.state.layout.bounty, { x: 2.5, z: 13.1 }, 'moves snap to the nearest block (bounty keeps its street-side nudge)');

const combat = createGame(); run(combat, 60, false, assertFiniteEconomy);
assert.ok(combat.state.totalKills >= 5, 'The five starter hunters autonomously hunt'); assert.ok(combat.state.counts.services > 0, 'Hunters visibly use town services within 60 seconds'); assert.ok(combat.state.counts.traded > 0);
assert.ok(combat.state.hunters.some(h => h.gold > 100), 'Monster gold belongs to hunters');
assert.equal(combat.expedition().ok, true); assert.equal(combat.expedition().ok, false); run(combat, 200, false, assertFiniteEconomy); assert.ok(combat.state.bossKills >= 1, 'Starter hunters can defeat the field boss');
const healer = combat.state.hunters.find(h => h.hp > 0); healer.hp = healer.maxHp * 0.1; assert.equal(combat.heal().ok, true); assert.ok(healer.hp >= healer.maxHp * 0.54); assert.equal(combat.heal().ok, false);
const dead = createGame(), fallen = isolate(dead); fallen.hp = 0; run(dead, 0.2, true); assert.equal(fallen.status, '復活中'); assert.equal(dead.state.counts.deaths, 1); run(dead, 10, true); assert.ok(fallen.hp > 0 && fallen.reviveTimer === 0);

const dungeon = createGame(); assert.equal(dungeon.startDungeon().ok, false); assert.equal(dungeon.construct('dungeon').ok, true);
assert.equal(dungeon.startDungeon(['x', 'y', 'z']).ok, false); assert.equal(dungeon.startDungeon([dungeon.state.hunters[0].id, dungeon.state.hunters[0].id, dungeon.state.hunters[0].id]).ok, false);
assert.equal(dungeon.startDungeon().ok, true); assert.equal(dungeon.startDungeon().ok, false); const partyIds = [...dungeon.state.dungeon.hunterIds];
assert.equal(dungeon.startArena(partyIds).ok, false); run(dungeon, 60, false, assertFiniteEconomy);
assert.equal(dungeon.state.dungeon.active, false); assert.equal(dungeon.state.dungeon.bestFloor, 1); assert.equal(dungeon.state.dungeon.floor, 2); assert.equal(dungeon.state.counts.dungeonWins, 1);
assert.ok(dungeon.state.dungeon.reward.gold > 0); assert.ok(partyIds.every(hid => dungeon.state.hunters.find(h => h.id === hid).task !== 'dungeon'));
const dungeonSave = createGame(); dungeonSave.construct('dungeon'); dungeonSave.startDungeon(); run(dungeonSave, 8);
const resumedDungeon = createGame(dungeonSave.serialize()); assert.equal(resumedDungeon.state.dungeon.active, true); run(resumedDungeon, 65); assert.equal(resumedDungeon.state.dungeon.bestFloor, 1);
const losingDungeon = createGame(); losingDungeon.construct('dungeon'); losingDungeon.startDungeon();
for (const h of losingDungeon.state.hunters.filter(h => losingDungeon.state.dungeon.hunterIds.includes(h.id))) h.hp = 0;
run(losingDungeon, 0.2); assert.equal(losingDungeon.state.dungeon.active, false); assert.equal(losingDungeon.state.dungeon.bestFloor, 0); run(losingDungeon, 9); assert.ok(losingDungeon.state.hunters.every(h => h.hp > 0));

const arena = createGame(); assert.equal(arena.startArena().ok, false); assert.equal(arena.construct('training').ok, true); assert.equal(arena.startArena().ok, true);
assert.equal(arena.startDungeon(arena.state.arena.hunterIds).ok, false); run(arena, 45, false, assertFiniteEconomy); assert.equal(arena.state.arena.active, false); assert.equal(arena.state.arena.wins, 1); assert.equal(arena.state.arena.opponent, '暮林訓練隊');

const navigation = createGame(); navigation.moveBuilding('bounty', 5, 17);
let returning = false, serviceStatus = false;
run(navigation, 150, false, state => {
  assertFiniteEconomy(state);
  for (const h of state.hunters) {
    returning ||= h.status === '返村中'; serviceStatus ||= ['用餐中', '飲用中', '休息中', '休養中'].includes(h.status);
    for (const b of BUILDINGS.filter(b => state.buildings[b.id])) { const p = state.layout[b.id]; assert.ok(!(Math.abs(h.x - p.x) < b.w / 2 + 0.3 && Math.abs(h.z - p.z) < b.d / 2 + 0.3), `${h.name} penetrates ${b.id} at ${h.x},${h.z}`); }
  }
}); assert.ok(returning && serviceStatus);

const snapshot = combat.serialize(), loaded = createGame(JSON.stringify(snapshot));
for (const key of ['gold', 'ore', 'totalKills', 'bossKills', 'healCooldown']) assert.equal(loaded.state[key], combat.state[key]);
for (let i = 0; i < combat.state.hunters.length; i++) { const actual = loaded.state.hunters[i], expected = combat.state.hunters[i]; for (const key of ['id', 'gold', 'level', 'rarity', 'trait', 'hp']) assert.equal(actual[key], expected[key]); assert.deepEqual(actual.inventory, expected.inventory); }
assert.deepEqual(loaded.state.stocks, combat.state.stocks); assert.deepEqual(loaded.state.tradeRequests, combat.state.tradeRequests);
const bad = createGame({ version: 2, gold: -8, ore: 'x', gems: 1e100, speed: Infinity, time: NaN, buildings: { hall: -1, forge: 999, house: 999 }, hunters: [{ classId: '__proto__' }, { classId: CLASSES[0].id, name: '<script>', level: -1, hp: -2, x: Infinity, z: NaN, gold: -99, inventory: { ore: -10 }, rarity: '__proto__', trait: 'missing' }], stocks: { food: -9 }, tradeRequests: { ore: -8 }, dungeon: { active: true, hunterIds: ['x', 'x', 'x'] } });
assert.equal(bad.state.gold, 0); assert.equal(bad.state.ore, 120); assert.equal(bad.state.gems, 1e7); assert.equal(bad.state.buildings.forge, 2); assert.equal(bad.state.stocks.food, 0); assert.equal(bad.state.tradeRequests.ore, 0); assert.equal(bad.state.dungeon.active, false);
run(bad, 30, false, assertFiniteEconomy); assert.equal(createGame('{oops').state.gold, 1500); assert.equal(createGame({ version: 1 }).state.gold, 1500);
const paused = createGame(); paused.state.paused = true; const beforePause = JSON.stringify(paused.serialize()); paused.tick(10); assert.equal(JSON.stringify(paused.serialize()), beforePause);
paused.state.paused = false; paused.state.speed = 2; paused.tick(2); assert.ok(Math.abs(paused.state.time - 4) < 1e-8); paused.tick(NaN); paused.tick(-1); assert.ok(Math.abs(paused.state.time - 4) < 1e-8);
const deterministicA = createGame(), deterministicB = createGame(); run(deterministicA, 90); run(deterministicB, 90); assert.deepEqual(deterministicA.serialize(), deterministicB.serialize());
const sameObject = loaded.state; loaded.reset(); assert.equal(loaded.state, sameObject); assert.equal(loaded.state.gold, 1500); assert.equal(loaded.state.hunters.length, 5);

const quests = createGame(); quests.recruit(CLASSES[0].id); assert.equal(quests.claimQuest().ok, true); quests.craft('food', 2); assert.equal(quests.claimQuest().ok, true);
quests.state.counts.traded = 10; assert.equal(quests.claimQuest().ok, true); quests.upgrade('forge'); assert.equal(quests.claimQuest().ok, true); quests.craftEquipment('weapon'); assert.equal(quests.claimQuest().ok, true);
quests.state.bossKills = 1; assert.equal(quests.claimQuest().ok, true); quests.state.counts.dungeonWins = 1; assert.equal(quests.claimQuest().ok, true); quests.state.counts.rebirths = 1; assert.equal(quests.claimQuest().ok, true);
const questGold = quests.state.gold; assert.equal(quests.claimQuest().ok, false); assert.equal(quests.state.gold, questGold); assert.equal(createGame(quests.serialize()).claimQuest().ok, false);

console.log(`PASS: 5 hunters / ${CLASSES.length} classes, seeded visitors, conservation of personal and village gold, paid and emergency services, bounded trading, crafting and gear purchases, upgrades, training, skills, rebirth, difficulty gates, hunting, field boss, death/revival, dungeon combat and save continuation, NPC arena, navigation, malformed saves, pause, deterministic simulation, all 8 quests. Natural 60s: ${combat.state.totalKills} total kills; ${combat.state.counts.services} services.`);

