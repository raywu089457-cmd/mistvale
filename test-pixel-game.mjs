import assert from 'node:assert/strict';
import { createGame } from './src/pixel-game.js';
import { doorStand, buildingSolid } from './src/landscape-layout.js';
import { blockCenter } from './src/village-grid.js';
import { BUILDINGS, CLASSES, MATERIALS, PRODUCTS, PILOT_ATTACK, AI_ATTACK_LOCK } from './src/pixel-data.js';

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
assert.equal(g.state.version, 2); assert.equal(g.state.hunters.length, 5); assert.equal(new Set(g.state.hunters.map(h => h.classId)).size, Math.min(5, CLASSES.length));   // 2026-10-24 遊俠併入弓箭手、移除獵魔人:剩 4 職業,開局 5 人每個職業都有
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
const mealDoor=doorStand(restaurant,restaurant);
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

const trading = createGame(), merchant = isolate(trading),market=BUILDINGS.find(b=>b.id==='trading'); const marketDoor=doorStand(market,market); trading.state.time = 100; Object.assign(merchant,marketDoor); merchant.inventory.ore = 20;
assert.equal(trading.setTradeRequest('ore', 10).ok, true); const tradeTotal = totalMoney(trading), townOre = trading.state.ore;
run(trading, 4, true); assert.equal(merchant.inventory.ore, 10); assert.equal(trading.state.ore, townOre + 10); assert.equal(trading.state.tradeRequests.ore, 0);
assert.equal(trading.state.gold, 1470); assert.equal(merchant.gold, 130); assert.equal(totalMoney(trading), tradeTotal); assert.equal(trading.state.counts.traded, 10);
const poorTown = createGame(), seller = isolate(poorTown); poorTown.state.time = 100; poorTown.state.gold = 4; Object.assign(seller,marketDoor); seller.inventory.ore = 20;
run(poorTown, 4, true); assert.equal(poorTown.state.gold, 1); assert.equal(seller.inventory.ore, 19); assert.equal(seller.gold, 103);

const gear = createGame(), buyer = isolate(gear),forge=BUILDINGS.find(b=>b.id==='forge'); gear.state.time = 100; Object.assign(buyer, doorStand(forge,forge)); buyer.gold = 300;
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
const marketBlock = blockCenter(-2, 0), plazaBlock = blockCenter(0, 0);
assert.equal(buildings.moveBuilding('bounty', marketBlock.x + 1, marketBlock.z - 1).ok, true); assert.equal(buildings.moveBuilding('hall', plazaBlock.x, plazaBlock.z).ok, false, 'plaza stays open'); assert.equal(buildings.moveBuilding('hall', -100, 0).ok, false); assert.equal(buildings.moveBuilding('dungeon', 0, 0).ok, false);
const movedSaved = createGame(buildings.serialize()); assert.deepEqual(movedSaved.state.layout.bounty, { x: marketBlock.x, z: marketBlock.z }, 'moves snap to the nearest block center');

// 新玩法:招募英雄不自己出村打怪,待機在村內等玩家派指令。
const idle = createGame(); run(idle, 60, false, assertFiniteEconomy);
assert.equal(idle.state.totalKills, 0, 'Recruited hunters idle in town and never hunt on their own');
assert.ok(idle.state.hunters.every(h => h.inTown || h.task), 'Recruited hunters wait in town for orders');
assert.ok(idle.state.counts.services > 0, 'Hunters visibly use town services within 60 seconds');
assert.ok(Array.isArray(idle.state.wanderers) && idle.state.wanderers.length >= 1, 'Wandering heroes roam the field');
assert.ok(idle.state.wanderKills > 0, 'Wandering heroes hunt monsters on their own');
// 流浪英雄:自己的錢包與需求、自己挑狩獵區、缺東西會自己回村買(跟獵人一樣的服務流程)。
assert.ok(idle.state.wanderers.every(w => Number.isFinite(w.gold) && w.gold >= 0 && Number.isFinite(w.satiety)), 'Wanderers keep their own wallet and needs');
assert.ok(idle.state.wanderers.every(w => w.huntRegion && w.huntRegion !== 'village'), 'Wanderers pick their own hunting region');
const roam = createGame();
run(roam, 300);
assert.ok(roam.state.wanderers.some(w => w.satiety < 100), 'Wanderer needs drain over time');
assert.ok(roam.state.wanderers.some(w => w.gold !== 80 || (w.inventory && Object.values(w.inventory).some(v => v > 0))), 'Wanderers earn their own gold and loot');
assert.ok(roam.state.counts.wandererPurchases > 0, 'Wanderers walk back to town and pay for what they need');
assert.ok(roam.state.wanderers.every(w => ['meadow', 'forest', 'taiga', 'snow', 'mountain', 'desert', 'birch'].includes(w.huntRegion)), 'Wanderer regions stay in the wild');

// 玩家派指令去哪個區,英雄才會出村打怪。
const combat = createGame();
assert.equal(combat.exploreRegion('meadow').ok, true, 'Player dispatches hunters to a region');
run(combat, 120, false, assertFiniteEconomy);
assert.ok(combat.state.totalKills >= 5, 'Dispatched hunters hunt the ordered region');
assert.ok(combat.state.counts.traded > 0, 'Hunters trade the materials they gather');
assert.ok(combat.state.hunters.some(h => h.gold > 100), 'Monster gold belongs to hunters');
assert.equal(combat.expedition().ok, true); assert.equal(combat.expedition().ok, false); run(combat, 200, false, assertFiniteEconomy); assert.ok(combat.state.bossKills >= 1, 'Dispatched hunters can defeat the field boss');
// 召回:狩獵指令清掉,英雄回村待機等下一次派令。
assert.equal(combat.recallHunters().ok, true); assert.ok(combat.state.hunters.every(h => !h.huntRegion), 'Recalled hunters wait for the next order');
assert.equal(combat.recallHunters().ok, false);
const healer = combat.state.hunters.find(h => h.hp > 0); healer.hp = healer.maxHp * 0.1; assert.equal(combat.heal().ok, true); assert.ok(healer.hp >= healer.maxHp * 0.54); assert.equal(combat.heal().ok, false);
// 組隊派遣:四組各自的隊員與狩獵區;同一位獵人只能在一組;各組只打自己區域的魔物;舊存檔的重複名單讀檔時去重。
const squads = createGame(); const [s0, s1, s2, s3, s4] = squads.state.hunters;
assert.equal(squads.state.dispatchTeams.length, 4);
assert.equal(squads.setDispatchTeam(0, { ids: [s0.id, s1.id], region: 'meadow' }).ok, true);
assert.equal(squads.setDispatchTeam(1, { ids: [s1.id, s2.id], region: 'forest' }).ok, true);
assert.deepEqual(squads.state.dispatchTeams[0].ids, [s0.id], 'A hunter moves between squads instead of joining two');
assert.deepEqual(squads.state.dispatchTeams[1].ids, [s1.id, s2.id]);
assert.equal(squads.setDispatchTeam(2, { ids: [s3.id], region: 'taiga' }).ok, true);
assert.equal(squads.setDispatchTeam(3, { region: 'village' }).ok, true); assert.equal(squads.state.dispatchTeams[3].region, 'meadow', 'The village is not a hunting region');
assert.equal(squads.setDispatchTeam(4, { ids: [s4.id] }).ok, false, 'Only four squads exist');
squads.setDispatchTeam(0, { ids: ['missing'] }); assert.deepEqual(squads.state.dispatchTeams[0].ids, [], 'Unknown hunters are ignored'); squads.setDispatchTeam(0, { ids: [s0.id] });
assert.equal(squads.dispatchTeam(3).ok, false, 'An empty squad cannot leave town');
assert.equal(squads.dispatchTeam(0).ok, true); assert.equal(squads.dispatchTeam(1).ok, true); assert.equal(squads.dispatchTeam(2).ok, true);
assert.equal(s0.huntRegion, 'meadow'); assert.equal(s1.huntRegion, 'forest'); assert.equal(s2.huntRegion, 'forest'); assert.equal(s3.huntRegion, 'taiga'); assert.ok(!s4.huntRegion, 'Hunters outside every squad stay in town');
const squadTargets = [];
run(squads, 150, false, state => {
  assertFiniteEconomy(state);
  for (const h of state.hunters) {
    if (!h.huntRegion || !h.targetId) continue;
    const enemy = state.enemies.find(e => e.id === h.targetId);
    if (enemy && enemy.type !== 'boss') squadTargets.push(enemy.regionId === h.huntRegion || Math.hypot(h.x - enemy.x, h.z - enemy.z) < 4.6);  // 路上被攔截(4 格內)的別區魔物也會還手;再多留一個 tick 雙方移動的距離(區緊鄰時才看得到)
  }
});
assert.ok(squadTargets.length > 0, 'Dispatched squads pick targets'); assert.ok(squadTargets.every(Boolean), 'Each squad only fights monsters in its own region');
assert.ok(['meadow', 'forest', 'taiga'].every(r => squads.state.visitedRegions.includes(r)), 'Every dispatched squad reaches its region');
assert.ok(squads.state.totalKills > 0, 'Squads in several regions earn kills'); assert.ok(!s4.huntRegion, 'The unassigned hunter never leaves for a region');
const squadLoad = createGame(squads.serialize());
assert.deepEqual(squadLoad.state.dispatchTeams.map(t => t.ids), squads.state.dispatchTeams.map(t => t.ids)); assert.deepEqual(squadLoad.state.dispatchTeams.map(t => t.region), ['meadow', 'forest', 'taiga', 'meadow']);
const dupSave = squads.serialize(); dupSave.dispatchTeams[3] = { ids: [s0.id, s4.id], region: 'desert' };
const dupLoaded = createGame(dupSave);
assert.deepEqual(dupLoaded.state.dispatchTeams[0].ids, [s0.id], 'The first squad that lists a hunter keeps him'); assert.deepEqual(dupLoaded.state.dispatchTeams[3].ids, [s4.id]); assert.equal(dupLoaded.state.dispatchTeams[3].region, 'desert');
assert.equal(createGame().dispatchHunters().ok, true, 'The one-click dispatch still sends everyone');
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
    for (const b of BUILDINGS.filter(b => state.buildings[b.id])) { const p = state.layout[b.id]; const r = buildingSolid(b, p); assert.ok(!(h.x > r.minX && h.x < r.maxX && h.z > r.minZ && h.z < r.maxZ), `${h.name} penetrates ${b.id} at ${h.x},${h.z}`); }   // 2026-10-24 改用實心佔地(跟 test-landscape、導航、碰撞同一份 SOLID);原本 b.w/b.d+0.3 比導航設計的街區走道(0.45/0.75)還嚴,換了開局職業組合後獵魔人沿城鎮大廳旁走道(離地基 0.05)就被誤判
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

// ── 手動操控(搖桿/動作鈕走的是同一條 API):輸入會推動角色、出手會打到最近的魔物、離開後回到 AI ──
const manual = createGame(); const mh = isolate(manual);
assert.equal(manual.pilotState(), null); assert.equal(manual.pilotInput(1, 0), undefined); manual.pilotAttack();
assert.equal(manual.pilotStart(mh.id).ok, true); assert.equal(manual.pilotInput(0, 0), undefined);
const startX = mh.x, startZ = mh.z; let moved = false;
for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
  manual.pilotInput(dx, dz); for (let i = 0; i < 5; i++) manual.tick(0.1); manual.pilotInput(0, 0);
  if (Math.hypot(mh.x - startX, mh.z - startZ) > 0.2) { moved = true; break; }
}
assert.ok(moved, 'pilot input moves the controlled hunter');
assert.equal(mh.task, 'pilot'); assert.deepEqual([manual.pilotState().id, manual.pilotState().x], [mh.id, mh.x]);
mh.x = mh.z = 0; manual.pilotInput(0, 0); run(manual, 6);   // 等野外生一隻魔物
assert.ok(manual.state.enemies.length > 0, 'field enemy spawned for the manual attack test');
const target = manual.state.enemies.find(e => e.hp > 0); mh.x = target.x - 1; mh.z = target.z; mh.hp = mh.maxHp; mh.attackTimer = 0;
const targetHp = target.hp; manual.pilotAttack(); manual.tick(0.05);
assert.ok(!manual.state.enemies.includes(target) || target.hp < targetHp, 'attack button damages the nearest enemy');
// 隨時都能出手:附近沒有魔物也照樣播攻擊動作(不算傷害),但兩次出手之間有 0.5 秒 CD
assert.equal(PILOT_ATTACK.cd, 0.5);
manual.state.enemies = []; manual.pilotInput(0, 0); manual.tick(0.6);
manual.pilotAttack(); manual.tick(0.1);
assert.ok(Number.isFinite(mh.atkAt), 'empty swing still plays the attack animation');
assert.ok(Number.isFinite(mh.atkX) && Number.isFinite(mh.atkZ), 'empty swing points at the last facing');
assert.ok(manual.pilotCooldown() > 0, 'attack starts the cooldown');
const firstAt = mh.atkAt;
manual.pilotAttack(); manual.tick(0.1);
assert.equal(mh.atkAt, firstAt, 'pressing again inside the cooldown is ignored');
// 動作 + 收招僵直期間不能走(CD 0.5 秒 < 僵直 0.65 秒)
const lockX = mh.x, lockZ = mh.z;
manual.pilotInput(1, 0); manual.tick(0.3);
assert.ok(Math.hypot(mh.x - lockX, mh.z - lockZ) < 1e-9, 'no walking while the attack animation and recovery run');
assert.ok(manual.pilotLockLeft() > 0);
manual.tick(0.4);
assert.ok(Math.hypot(mh.x - lockX, mh.z - lockZ) > 0.1, 'walking resumes by itself after the recovery window');
assert.equal(manual.pilotLockLeft(), 0);
manual.pilotInput(0, 0); manual.tick(0.2);
manual.pilotAttack(); manual.tick(0.1);
assert.ok(mh.atkAt > firstAt, 'attack is available again after the 0.5s cooldown');
assert.equal(manual.pilotStop().ok, true); assert.equal(manual.state.pilot, null); assert.equal(mh.task, null);
// 手動操控期間 AI 不能再動這位獵人(不然搖桿的方向會和 AI 的狩獵路線搶)
assert.equal(manual.pilotStart(mh.id).ok, true); mh.huntRegion = manual.state.region; mh.route = []; mh.targetId = null;
const holdX = mh.x, holdZ = mh.z; manual.pilotInput(0, 0); run(manual, 3);
assert.ok(Math.hypot(mh.x - holdX, mh.z - holdZ) < 0.001, 'pilot hunter is not moved by the AI while under manual control');
assert.equal(mh.status, '手動操控'); manual.pilotStop();
// 面向只在「真的走動」時更新:站著推搖桿不會轉、空揮維持攻擊前的面向、僵直結束走起來才轉
const turn = createGame(); const th = isolate(turn); assert.equal(turn.pilotStart(th.id).ok, true);
th.x = 6; th.z = 30; turn.pilotInput(1, 0); for (let i = 0; i < 6; i++) turn.tick(0.1); turn.pilotInput(0, 0); turn.tick(0.1);
assert.ok(turn.pilotState().faceX > 0.9, 'walking east sets the facing east');
const eastX = th.x;
turn.pilotAttack(); turn.tick(0.1);        // 空揮:朝「最後走的方向」(東)
let st = turn.pilotState();
assert.ok(st.atkX > st.x && Math.abs(st.atkZ - st.z) < 1e-6, 'empty swing aims at the pre-attack facing');
turn.pilotInput(-1, 0); turn.tick(0.2);     // 僵直中把搖桿推到西邊:不得轉向、不得移位
turn.tick(0.2);
st = turn.pilotState();
assert.ok(st.faceX > 0.9, 'facing stays at the pre-attack direction during the recovery');
assert.ok(Math.abs(st.x - eastX) < 1e-9, 'no movement during the recovery');
assert.ok(turn.pilotLockLeft() > 0, 'still locked while sampling');
turn.tick(0.6);                            // 僵直結束、真的走起來 → 轉向
assert.ok(turn.pilotState().faceX < -0.5, 'walking west after the recovery turns the character');
assert.ok(turn.pilotState().x < eastX, 'and it actually walks west');
turn.pilotStop();
// 手動操控法師:魔法球真的會飛(PILOT_ORB)——空打朝目前面向的角度(不吸附 8 方向)、路徑上碰到的魔物都打(穿透)、飛完射程就消失
{
  const orb = createGame(); const oh = isolate(orb); oh.classId = 'sorcerer'; oh.x = 6; oh.z = 30;
  oh.huntRegion = null; orb.state.spawnTimer = 0; run(orb, 0);
  // 借一隻真的魔物當範本(野外生怪),複製成三隻擺在固定位置
  const gen = createGame(); const gh = isolate(gen); gh.x = gh.z = 0; run(gen, 6); const proto = gen.state.enemies.find(e => e.hp > 0);
  assert.ok(proto, 'template enemy spawned for the orb test');
  assert.equal(orb.pilotStart(oh.id).ok, true);
  const ux = 2 / Math.sqrt(5), uz = 1 / Math.sqrt(5), px = -uz, pz = ux;   // 面向 26.6°(介於東與東南之間)
  orb.state.pilot.faceX = ux; orb.state.pilot.faceZ = uz;
  const at = (along, side) => ({ x: oh.x + ux * along + px * side, z: oh.z + uz * along + pz * side });
  const spots = { onPath: at(3.6, 0), nearPath: at(4.3, 0.5), offPath: at(3.8, 1.6) };   // 都在 3.2 格外(不會被自動瞄準)
  const foes = Object.fromEntries(Object.entries(spots).map(([k, p], i) => [k, { ...proto, id: `orbtest${i}`, ...p, hp: proto.maxHp ?? proto.hp, attackTimer: 9, rewarded: false }]));
  orb.state.enemies = Object.values(foes); const hp0 = Object.fromEntries(Object.entries(foes).map(([k, e]) => [k, e.hp]));
  const pin = () => { for (const [k, e] of Object.entries(foes)) { Object.assign(e, spots[k]); e.attackTimer = 9; } };
  orb.pilotAttack(); pin(); orb.tick(0.02);
  assert.equal(orb.state.shots.length, 1, 'the sorcerer fires one flying orb');
  assert.ok(Math.abs(Math.atan2(orb.state.shots[0].dz, orb.state.shots[0].dx) - Math.atan2(uz, ux)) < 1e-6, 'empty-air orb flies at the exact facing angle');
  for (let i = 0; i < 12; i++) { pin(); orb.tick(0.05); }
  assert.ok(foes.onPath.hp < hp0.onPath, 'orb hits the monster on its path');
  assert.ok(foes.nearPath.hp < hp0.nearPath, 'orb hits a monster within its radius of the path');
  assert.equal(foes.offPath.hp, hp0.offPath, 'orb misses a monster outside its radius');
  assert.equal(foes.onPath.hp, hp0.onPath - orb.state.hunters[0].attack, 'each monster is hit once per orb');
  assert.equal(orb.state.shots.length, 0, 'orb disappears after its range');
  // 3.2 格內有魔物:照舊自動瞄準牠(方向朝魔物,不是面向)
  orb.tick(0.6); const near = { ...proto, id: 'orbtestNear', x: oh.x, z: oh.z - 2, hp: 200, attackTimer: 9, rewarded: false };
  orb.state.enemies = [near]; orb.pilotAttack(); orb.tick(0.02);
  assert.ok(orb.state.shots.length === 1 && orb.state.shots[0].dz < -0.99, 'orb aims at the monster in range');
  for (let i = 0; i < 6; i++) { near.x = oh.x; near.z = oh.z - 2; near.attackTimer = 9; orb.tick(0.05); }
  assert.ok(near.hp < 200, 'aimed orb hits the monster');
  orb.pilotStop();
}
// AI 獵人出手後也有短僵直(站著收招不移動),但沒有額外的攻擊 CD
assert.equal(AI_ATTACK_LOCK, 0.15);
const ai = createGame(); const ah = isolate(ai); ah.huntRegion = ai.state.region; ah.route = []; ah.task = null;
const ax0 = ah.x, az0 = ah.z; run(ai, 1.2);
assert.ok(Math.hypot(ah.x - ax0, ah.z - az0) > 0.1, 'AI hunter walks toward its hunt region');
ah.lockUntil = ai.state.time + 5; const lx = ah.x, lz = ah.z; run(ai, 0.6);
assert.ok(Math.hypot(ah.x - lx, ah.z - lz) < 1e-9, 'AI hunter stands still during the post-attack lock');
ah.lockUntil = 0; run(ai, 0.6);
assert.ok(Math.hypot(ah.x - lx, ah.z - lz) > 0.1, 'AI hunter walks again once the lock expires');
run(manual, 30, false, assertFiniteEconomy);

console.log(`PASS: 5 hunters / ${CLASSES.length} classes, seeded visitors, conservation of personal and village gold, paid and emergency services, bounded trading, crafting and gear purchases, upgrades, training, skills, rebirth, difficulty gates, hunting, field boss, death/revival, dungeon combat and save continuation, NPC arena, navigation, malformed saves, pause, deterministic simulation, all 8 quests. Natural 60s: ${combat.state.totalKills} total kills; ${combat.state.counts.services} services.`);

