import assert from 'node:assert/strict';
import { createGame, OFFLINE } from './src/pixel-game.js';
import { doorStand, buildingSolid } from './src/landscape-layout.js';
import { blockCenter } from './src/village-grid.js';
import { BUILDINGS, CLASSES, MATERIALS, PRODUCTS, PILOT_ATTACK, AI_ATTACK_LOCK, KITE } from './src/pixel-data.js';
import { regionCenter, regionContains, walkable, RING_ROAD, onRingRoad } from './src/overworld.js';
import { MONSTER_RANGED } from './src/pixel-data.js';
import { pickHeroLine, CHATTER_LINES } from './src/hero-chatter.js';
import { REGION_MONSTERS, MONSTER_NAME, MONSTER_LORE } from './src/lore.js';

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
assert.equal(g.state.version, 2); assert.equal(g.state.hunters.length, CLASSES.length); assert.equal(new Set(g.state.hunters.map(h => h.classId)).size, CLASSES.length);   // 2026-10-28 使用者:開局預設各職業一隻
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

// ── 祭司(priest)是正式可招募職業(2026-10-27,原本只當流浪英雄):不在開局 5 人裡,但招募欄第一位保證是稀有祭司;
// 遠程施法(白袍金杖發聖光球,跟 pixel-world.js 的遠程後座/蓄力光一致);可存讀檔;舊存檔沒有祭司訪客會補上,舊的固定流浪祭司射程跟著更新。
{
  const PRIEST = CLASSES.find(c => c.id === 'priest');
  assert.ok(PRIEST && PRIEST.range > 3, 'priest is a ranged recruitable class');
  const pg = createGame();
  // 2026-10-28 使用者改規則:開局每個職業各一隻(祭司也在裡面)、流浪英雄也各一隻
  assert.equal(pg.state.hunters.length, CLASSES.length, 'the opening party has one hero per class');
  assert.deepEqual(pg.state.hunters.map(h => h.classId), CLASSES.map(c => c.id), 'opening party follows the class list order');
  assert.deepEqual(pg.state.wanderers.map(w => w.classId), CLASSES.map(c => c.id), 'wanderers cover every class too');
  assert.ok(!pg.state.visitors.some(v => v.classId === 'priest' && v.rarity === 'rare' && v.trait === 'brave' && v.cost === Math.round(PRIEST.cost * RARITY.rare.mult)), 'a class you already own is not force-offered');
  const pv = { ...pg.state.visitors[0] }; assert.equal(pg.recruit(pv.id).ok, true);
  const ph = pg.state.hunters.at(-1); assert.equal(ph.classId, pv.classId, 'the recruited visitor joins with its own class');
  assert.ok(!pg.state.visitors.some(v => v.id === pv.id), 'the recruited visitor leaves the board');
  assert.equal(pg.recruit('priest').ok, true, 'priest can also be hired by class id'); assert.equal(pg.state.hunters.at(-1).classId, 'priest');
  const ph2 = pg.state.hunters.at(-1); ph2.level = 12;
  const pgLoad = createGame(pg.serialize()), lp = pgLoad.state.hunters.find(h => h.id === ph2.id);
  assert.ok(lp && lp.classId === 'priest' && lp.level === 12 && lp.range === PRIEST.range, 'a recruited priest survives save/load');
  assert.equal(pgLoad.state.hunters.length, CLASSES.length + 2);
  assert.deepEqual(pgLoad.state.visitors.map(v => v.classId), pg.state.visitors.map(v => v.classId), 'owning a priest stops the forced offer');
  // 舊存檔:訪客裡沒有祭司、流浪英雄裡有一位舊版近戰射程(1.75)的固定流浪祭司
  const old = createGame().serialize();
  // 模擬「改版前」的存檔:隊伍裡還沒有祭司(新版開局已經每個職業一隻)
  old.hunters = old.hunters.filter(h => h.classId !== 'priest');
  old.visitors = old.visitors.map(v => ({ ...v, classId: 'berserker' })); old.wanderers[0] = { ...old.wanderers[0], classId: 'priest', range: 1.75 };
  const migrated = createGame(old);
  assert.equal(migrated.state.visitors[0].classId, 'priest', 'old saves get the priest offered on load');
  assert.equal(migrated.state.wanderers[0].classId, 'priest'); assert.equal(migrated.state.wanderers[0].range, PRIEST.range, 'the old melee wandering priest becomes ranged');
  // 野外 AI:祭司站在射程內遠遠出手(聖光球),不會走到近戰距離才打;普攻間隔 1.4 秒(快手 ×0.9)
  const pc = createGame(); pc.recruit('priest'); const pr = pc.state.hunters.at(-1); pc.state.hunters = [pr];   // 直接指定職業招募（開局已經有祭司，訪客第一位不再是祭司）
  pr.satiety = pr.mood = pr.stamina = 100; pr.hp = pr.maxHp;
  assert.equal(pc.exploreRegion('meadow').ok, true);
  const shots = [], timers = []; let lastAt = null;
  run(pc, 90, false, state => {
    pr.satiety = pr.mood = pr.stamina = 100; pr.hp = pr.maxHp;
    if (pr.atkAt != null && pr.atkAt !== lastAt) { lastAt = pr.atkAt; shots.push(Math.hypot(pr.atkX - pr.x, pr.atkZ - pr.z)); timers.push(pr.attackTimer); }
  });
  assert.ok(shots.length >= 3, `the priest attacks in the field (${shots.length})`);
  assert.ok(shots.some(d => d > 2.2), `the priest attacks from range (max ${Math.max(...shots).toFixed(2)})`);
  const interval = 1.4 * (pr.trait === 'swift' ? 0.9 : 1);
  assert.ok(timers.every(t => t <= interval + 1e-9) && timers.some(t => t > interval - 0.11), `priest attack interval is ${interval} (${timers.map(t => t.toFixed(2)).join('/')})`);
}

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
// ── 地圖詳細資訊(2026-10-30):派遣出征的區域卡捲軸鈕。數值要跟實際出怪/數值表一致,不能另外抄一份 ──
{
  const info = createGame(), ri = info.regionInfo('snow');
  assert.ok(ri, 'regionInfo returns data for a hunting region');
  assert.equal(ri.monsters.length, 3, 'Every region lists its three monsters');
  assert.ok(ri.monsters.every(m => m.hp > 0 && m.attack > 0 && m.gold > 0 && m.xp > 0), 'Monster stats come from the real enemy table');
  assert.ok(ri.riskStars >= 1 && ri.riskStars <= 5, 'Risk stars stay in 1-5');
  assert.ok(Object.keys(ri.loot).length > 0 && Object.values(ri.loot).every(v => v > 0), 'Average loot per kill is listed');
  assert.equal(info.regionInfo('village'), null, 'The village is not a hunting region');
  const fit = ri.fit([]);
  assert.ok(fit && ['easy', 'ok', 'hard'].includes(fit.verdict) && fit.threat > 0 && fit.comfort > 0, 'Squad fit compares comfort against regional threat');
  const weakest = info.regionInfo('meadow'), strongest = info.regionInfo('mountain');
  assert.ok(Math.max(...strongest.monsters.map(m => m.attack)) > Math.max(...weakest.monsters.map(m => m.attack)), 'Mountain hits harder than the meadow');
  assert.ok(strongest.riskStars > weakest.riskStars, 'Danger stars follow region risk');
  assert.equal(fit.threat, Math.round(Math.max(...ri.monsters.map(m => m.attack)) * ri.risk), 'Threat is the hardest monster times the regional multiplier');
}
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
const sameObject = loaded.state; loaded.reset(); assert.equal(loaded.state, sameObject); assert.equal(loaded.state.gold, 1500); assert.equal(loaded.state.hunters.length, CLASSES.length);

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
  for (let i = 0; i < 14; i++) { pin(); orb.tick(0.05); }   // 0.7 秒 × 12 格/秒 = 8.4 格 > 射程 7.5(2026-10-30 遠程統一 7.5)
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
// ── 遠程射程拉遠＋風箏(2026-10-27):遠程被近身會自己往外拉開距離,拉開後照樣出手;近戰、手動操控完全不受影響;
// 走投無路(四面被包)就原地開打、不抖動;只在自己的狩獵區裡走;出手後的收招(KITE.afterShot ≥ AI_ATTACK_LOCK)不走。
{
  const RANGE = Object.fromEntries(CLASSES.map(c => [c.id, c.range]));
  assert.deepEqual([RANGE.archer, RANGE.sorcerer, RANGE.priest], [7.5, 7.5, 7.5], 'all ranged classes share one basic-attack range (2026-10-30: 7.5)');
  assert.equal(new Set(CLASSES.map(c => c.speed)).size, 1, 'every class walks at the same speed (2026-10-30)');
  assert.ok(['berserker', 'paladin', 'assassin'].every(id => RANGE[id] < 3), 'melee ranges are unchanged');
  assert.ok(KITE.enter < KITE.exit && KITE.afterShot >= AI_ATTACK_LOCK && KITE.cooldown > 0, 'kite thresholds have hysteresis and respect the attack lock');
  // 每個遠程職業「出手 → 收招」後,離下一次蓄力還有空檔可以起步後撤(快手 ×0.9 也一樣)
  for (const [cls, iv] of [['archer', 1.2], ['sorcerer', 1.65], ['priest', 1.4]]) assert.ok(iv * 0.9 - KITE.afterShot > KITE.windup, `${cls} has a window to start retreating between shots`);
  const C = regionCenter('meadow');
  // 一位獵人站在草原中央、只有一隻(打不死的)魔物;needs 每 tick 補滿,不會回村
  const setup = (classId, foeOffsets = [[1.4, 0]]) => {
    const g = createGame(); g.state.gold = 99999; assert.equal(g.recruit(classId).ok, true);
    const h = g.state.hunters.at(-1); g.state.hunters = [h]; g.state.wanderers = [];
    Object.assign(h, { x: C.x, z: C.z, huntRegion: 'meadow', inTown: false, rallying: false, route: [], task: null, targetId: null, attackTimer: 0.5 });
    const proto = g.state.enemies.find(e => e.regionId === 'meadow');
    g.state.enemies = foeOffsets.map(([dx, dz], i) => ({ ...proto, id: `kite${i}`, x: C.x + dx, z: C.z + dz, hp: 99999, maxHp: 99999, rewarded: false, attackTimer: 9 }));
    return { g, h };
  };
  const tickKeep = (g, h, n, each) => { for (let i = 0; i < n; i++) { g.state.spawnTimer = 0; g.state.regionSpawn = {}; h.hp = h.maxHp; h.satiety = h.mood = h.stamina = 100; g.tick(0.1); each?.(i); } };
  const nearest = (g, h) => Math.min(...g.state.enemies.map(e => Math.hypot(e.x - h.x, e.z - h.z)));

  // 1) 每個遠程職業被近身(1.4 格)都會拉開距離,走的是自己的速度,不離開狩獵區、不踩到不能走的地
  for (const cls of ['archer', 'sorcerer', 'priest']) {
    const { g, h } = setup(cls), d0 = nearest(g, h); let maxD = d0, retreating = 0, maxStep = 0, px = h.x, pz = h.z;
    tickKeep(g, h, 25, () => {
      maxD = Math.max(maxD, nearest(g, h)); if (h.status === '後撤中') retreating++;
      maxStep = Math.max(maxStep, Math.hypot(h.x - px, h.z - pz)); px = h.x; pz = h.z;
      assert.ok(walkable(h.x, h.z) && regionContains('meadow', h.x, h.z), `${cls} kites inside its hunt region`);
    });
    assert.ok(retreating > 0, `${cls} switches to retreating when a monster is close`);
    assert.ok(maxD > d0 + 1 && maxD > h.range * KITE.enter, `${cls} opens the distance past its retreat threshold (${d0.toFixed(2)} → ${maxD.toFixed(2)})`);
    assert.ok(maxStep <= h.speed * 0.1 + 1e-6, `${cls} retreats at its own walking speed (${maxStep.toFixed(3)} per 0.1 s)`);
  }

  // 2) 拉開之後照樣出手(而且是在拉開的距離出手);出手後的收招期間不移動;後撤次數受冷卻限制(不在門檻上抖)
  {
    const { g, h } = setup('archer'); const shots = []; let last = null, kites = 0, prevKiting = false, lockedMoves = 0, px = h.x, pz = h.z;
    tickKeep(g, h, 120, () => {
      const t = g.state.time;
      if (h.atkAt != null && h.atkAt !== last) { last = h.atkAt; shots.push(Math.hypot(h.atkX - h.x, h.atkZ - h.z)); }
      if (h.kiting && !prevKiting) kites++; prevKiting = !!h.kiting;
      // 這一 tick 的模擬時間還在收招(出手後 afterShot 秒內,含 AI_ATTACK_LOCK)→ 位置不能變。spread 只推「戰鬥中」的獵人,這裡只有一位獵人。
      const a = h.atkAt ?? -99;
      if (t > a + 1e-9 && t < a + KITE.afterShot - 1e-9 && Math.hypot(h.x - px, h.z - pz) > 1e-9) lockedMoves++;
      px = h.x; pz = h.z;
    });
    assert.ok(kites >= 1, 'the archer kited at least once in 12 s');
    assert.ok(shots.length >= 5, `the archer keeps shooting after opening the distance (${shots.length} shots)`);
    assert.ok(shots.some(d => d > h.range * KITE.enter), `and shoots from the opened distance (max ${Math.max(...shots).toFixed(2)})`);
    assert.equal(lockedMoves, 0, 'no kiting movement during the post-attack recovery');
    assert.ok(kites <= Math.ceil(12 / (KITE.cooldown + KITE.minTime)) + 1, `kite episodes are rate limited by the cooldown (${kites} in 12 s)`);
  }

  // 2b) 剛出手(收招中)被近身:afterShot 秒內站著不動(AI_ATTACK_LOCK 也包含在內),之後才開始拉開
  {
    const { g, h } = setup('archer'); h.atkAt = g.state.time; h.atkX = h.x + 1.4; h.atkZ = h.z; h.lockUntil = g.state.time + AI_ATTACK_LOCK; h.attackTimer = 1.2;
    const x0 = h.x, z0 = h.z, t0 = g.state.time; let movedEarly = 0, movedLater = false;
    tickKeep(g, h, 12, () => { const d = Math.hypot(h.x - x0, h.z - z0); if (g.state.time < t0 + KITE.afterShot - 1e-9) movedEarly = Math.max(movedEarly, d); else if (d > 0.2) movedLater = true; });
    assert.equal(movedEarly, 0, 'no retreat step while the attack animation / lock is still playing');
    assert.ok(movedLater, 'the archer retreats once the recovery is over');
  }

  // 2c) 快要出手(蓄力中)時魔物近身:先把這一下打出去,不會帶著蓄力動作開始後撤
  {
    const { g, h } = setup('archer'); h.attackTimer = 0.3; let firstMoveAt = null, shotAt = null; const x0 = h.x, z0 = h.z;
    tickKeep(g, h, 15, () => { if (shotAt == null && h.atkAt != null) shotAt = h.atkAt; if (firstMoveAt == null && Math.hypot(h.x - x0, h.z - z0) > 1e-9) firstMoveAt = g.state.time; });
    assert.ok(shotAt != null && firstMoveAt != null && firstMoveAt >= shotAt + KITE.afterShot - 1e-9, `fires the pending shot before retreating (shot ${shotAt?.toFixed(2)}, first step ${firstMoveAt?.toFixed(2)})`);
  }

  // 3) 近戰職業完全不後撤:站著打,狀態一直是「戰鬥中」,不寫 kiting 欄位
  for (const cls of ['berserker', 'paladin', 'assassin']) {
    const { g, h } = setup(cls, [[0.5, 0]]); const x0 = h.x, z0 = h.z; let moved = 0;   // 魔物貼在 0.5 格:遠程早就後撤了
    tickKeep(g, h, 30, () => { assert.notEqual(h.status, '後撤中', `${cls} never retreats`); moved = Math.max(moved, Math.hypot(h.x - x0, h.z - z0)); });
    assert.ok(moved < 0.05, `${cls} holds its ground (${moved.toFixed(3)})`);
    assert.equal(h.kiting, undefined, `${cls} carries no kite state`);
    assert.ok(h.atkAt != null, `${cls} still attacks`);
  }

  // 4) 四面被包(走哪個方向都更靠近某隻魔物)= 走投無路:原地開打,位置完全不動、狀態不在戰鬥中/後撤中之間來回跳
  {
    // 五隻魔物圍成缺一角的圈(0°~240°):往缺口(300°)走也會更靠近 240° 與 0° 那兩隻 → 每個方向都不行
    const ring = Array.from({ length: 5 }, (_, i) => [Math.cos(i * Math.PI / 3) * 1.5, Math.sin(i * Math.PI / 3) * 1.5]);
    const { g, h } = setup('archer', ring); const pins = g.state.enemies.map(e => ({ x: e.x, z: e.z }));
    const x0 = h.x, z0 = h.z; let flips = 0, prev = null, last = null, shots = 0;
    tickKeep(g, h, 60, () => {
      g.state.enemies.forEach((e, i) => Object.assign(e, pins[i]));   // 包圍網不散
      if (prev && prev !== h.status) flips++; prev = h.status;
      if (h.atkAt != null && h.atkAt !== last) { last = h.atkAt; shots++; }
    });
    assert.ok(Math.hypot(h.x - x0, h.z - z0) < 1e-9, 'a surrounded archer does not move at all');
    assert.equal(flips, 0, `a surrounded archer does not flip between fighting and retreating (${flips})`);
    assert.equal(h.status, '戰鬥中'); assert.ok(shots >= 3, `a surrounded archer fights in place (${shots} shots)`);
  }

  // 5) 背對區界:往村莊那側(草原中央往 +z 是村界)、海岸(−z)、隔壁的白樺花原(−x)各試一次。只沿著區內可走的地面撤,不進村、不下海、不跑進別區;
  //    卡住就原地打,同一次後撤裡不會一前一後地來回抖動
  for (const [bdx, bdz, label] of [[0, 1, 'village side'], [0, -1, 'coast'], [-1, 0, 'neighbour region']]) {
    const { g, h } = setup('archer');
    // 從草原中央往外找到「再走 0.6 格就出區」的位置,魔物放在內側 → 撤退方向正對區界
    let t = 0; while (t < 40 && regionContains('meadow', C.x + bdx * (t + .6), C.z + bdz * (t + .6))) t += .1;
    const ex = C.x + bdx * t, ez = C.z + bdz * t; Object.assign(h, { x: ex, z: ez });
    Object.assign(g.state.enemies[0], { x: ex - bdx * 1.4, z: ez - bdz * 1.4 });
    let reversals = 0, lastDir = null;
    tickKeep(g, h, 50, () => {
      assert.ok(walkable(h.x, h.z) && regionContains('meadow', h.x, h.z), `kiting never leaves the region at its border (${label})`);
      if (h.kiteDir) { if (lastDir && lastDir.x * h.kiteDir.x + lastDir.z * h.kiteDir.z < -0.5) reversals++; lastDir = h.kiteDir; } else lastDir = null;   // 同一次後撤內不得急轉回頭
    });
    assert.equal(reversals, 0, `retreat direction never snaps back and forth (${label})`);
  }

  // 6) 手動操控的遠程不會被 AI 拉走:魔物貼身、搖桿不動 → 位置不變、不會進入後撤
  {
    const { g, h } = setup('archer'); assert.equal(g.pilotStart(h.id).ok, true); g.pilotInput(0, 0);
    const x0 = h.x, z0 = h.z;
    tickKeep(g, h, 20, () => { assert.equal(h.status, '手動操控'); assert.ok(!h.kiting, 'pilot never kites'); });
    assert.ok(Math.hypot(h.x - x0, h.z - z0) < 1e-9, 'a piloted ranged hunter is not moved by the kite AI');
    g.pilotStop();
  }

  // 7) 流浪英雄(遠程)也會拉開距離;存讀檔後的暫態後撤狀態不會殘留
  {
    const g = createGame(); g.state.hunters = []; const w = g.state.wanderers[0]; g.state.wanderers = [w];
    Object.assign(w, { classId: 'archer', range: RANGE.archer, speed: CLASSES.find(c => c.id === 'archer').speed, huntRegion: 'meadow', regionId: 'meadow', x: C.x, z: C.z, task: null, route: [], regionCheckAt: 1e9, attackTimer: 0.5, satiety: 100, stamina: 100, mood: 100 });
    const proto = g.state.enemies.find(e => e.regionId === 'meadow');
    g.state.enemies = [{ ...proto, id: 'wkite', x: C.x + 1.4, z: C.z, hp: 99999, maxHp: 99999, rewarded: false, attackTimer: 9 }];
    const d0 = nearest(g, w); let maxD = d0, saw = false;
    for (let i = 0; i < 25; i++) { g.state.spawnTimer = 0; g.state.regionSpawn = {}; w.hp = w.maxHp; w.satiety = w.stamina = w.mood = 100; g.tick(0.1); maxD = Math.max(maxD, nearest(g, w)); if (w.status === '後撤中') saw = true;
      assert.ok(regionContains('meadow', w.x, w.z), 'wandering archer kites inside its region'); }
    assert.ok(saw && maxD > d0 + 1, `a ranged wanderer opens the distance too (${d0.toFixed(2)} → ${maxD.toFixed(2)})`);
    w.kiting = true; w.kiteDir = { x: 1, z: 0 };
    const back = createGame(g.serialize()).state.wanderers.find(q => q.id === w.id);
    assert.ok(back && back.kiting === false && back.kiteDir === null && back.range === RANGE.archer, 'a reloaded wanderer starts without a stale retreat');
  }

  // 8) 舊存檔(射程還是舊值、沒有任何 kite 欄位)讀進來:射程跟著職業表更新
  {
    const old = createGame(); old.state.gold = 99999; old.recruit('sorcerer'); const raw = old.serialize();
    const sh = raw.hunters.find(h => h.classId === 'sorcerer'); sh.range = 4.5; delete sh.kiting;
    const ow = raw.wanderers[0]; ow.classId = 'archer'; ow.range = 5.5; for (const k of ['kiting', 'kiteDir', 'kiteStart', 'kiteSeen', 'kiteReadyAt']) delete ow[k];
    const loaded = createGame(raw);
    assert.equal(loaded.state.hunters.find(h => h.id === sh.id).range, RANGE.sorcerer, 'old saves pick up the new sorcerer range');
    assert.equal(loaded.state.wanderers.find(q => q.id === ow.id).range, RANGE.archer, 'old saves pick up the new archer range for wanderers');
  }

  // 9) 挨打的魔物會反擊遠遠放箭的遠程(PROVOKE):原本在主動攻擊範圍外,挨打後會追過來
  {
    const { g, h } = setup('archer', [[6.8, 0]]); const e = g.state.enemies[0]; e.type = 'cactus'; e.attackTimer = 9;   // 仙人掌主動範圍 4 格
    h.attackTimer = 9; tickKeep(g, h, 10); const idleD = nearest(g, h);
    e.hitAt = g.state.time; const before = nearest(g, h); tickKeep(g, h, 10, () => { h.attackTimer = 9; });
    assert.ok(idleD > 4, 'an unprovoked cactus ignores the far archer');
    assert.ok(nearest(g, h) < before - 0.2, `a provoked monster chases the ranged attacker (${before.toFixed(2)} → ${nearest(g, h).toFixed(2)})`);
  }
}
run(manual, 30, false, assertFiniteEconomy);

// ── 2026-10-30 ─────────────────────────────────────────────────────────────
{
  const C = regionCenter('meadow');
  // 祭司:冷卻好就自動補「射程內生命比例最低」的隊友;招募的獵人優先,流浪英雄要等沒有招募的獵人需要補才輪到
  const g = createGame(); const pr = g.state.hunters.find(h => h.classId === 'priest'); assert.ok(pr, 'the start roster has a priest');
  const [a, b] = g.state.hunters.filter(h => h !== pr), w = g.state.wanderers[0];
  g.state.hunters = [pr, a, b]; g.state.wanderers = [w]; g.state.enemies = []; g.state.spawnTimer = -99; g.state.regionSpawn = {};
  for (const [u, dx, frac] of [[pr, 0, 1], [a, 2, 0.5], [b, -2, 0.3], [w, 1, 0.1]]) Object.assign(u, { x: C.x + dx, z: C.z, task: 'pilot', route: [], hp: Math.round(u.maxHp * frac) });
  pr.task = null; pr.huntRegion = null; pr.inTown = false; pr.skillCd = 0; pr.attackTimer = 0; pr.lockUntil = 0; pr.satiety = pr.stamina = pr.mood = 100;
  const hpB = b.hp, hpA = a.hp, hpW = w.hp; g.tick(0.1);
  assert.ok(b.hp > hpB && a.hp === hpA, `the priest heals the recruited hunter with the lowest HP ratio (${hpB} → ${b.hp})`);
  assert.equal(w.hp, hpW, 'a wanderer waits while a recruited hunter needs healing');
  assert.ok(pr.skillCd > 0, 'the heal goes on cooldown');
  pr.skillCd = 0; pr.attackTimer = 0; pr.lockUntil = 0; a.hp = a.maxHp; b.hp = b.maxHp; g.tick(0.1);
  assert.ok(w.hp > hpW, 'with every recruited hunter healthy, the priest heals the wanderer');
  pr.skillCd = 0; pr.attackTimer = 0; pr.lockUntil = 0; w.hp = w.maxHp; const cd0 = pr.skillCd; g.tick(0.1);
  assert.equal(pr.skillCd, 0, 'nobody hurt → no heal is wasted'); void cd0;
}
{
  // 遠程魔物:每區一隻;飛行物打到才扣血;站在環村道路上的獵人不會被瞄準
  const RANGED = Object.keys(MONSTER_RANGED); assert.equal(RANGED.length, 7, 'one ranged monster per hunting region');
  const g = createGame(); const C = regionCenter('meadow'), h = g.state.hunters[0];
  g.state.hunters = [h]; g.state.wanderers = []; g.state.spawnTimer = -999; g.state.regionSpawn = Object.fromEntries(['meadow', 'birch', 'forest', 'taiga', 'desert', 'snow', 'mountain'].map(k => [k, -999]));
  const proto = g.state.enemies.find(e => e.regionId === 'meadow');
  Object.assign(h, { x: C.x, z: C.z, task: 'pilot', route: [], hp: h.maxHp });
  g.state.enemies = [{ ...proto, id: 'rng', type: 'sprout', x: C.x + 4, z: C.z, hp: 999, maxHp: 999, attack: 30, attackTimer: 0, rewarded: false }];
  const keep = () => { g.state.spawnTimer = -999; for (const k in g.state.regionSpawn) g.state.regionSpawn[k] = -999; g.state.enemies = g.state.enemies.filter(e => e.id === 'rng'); };
  keep(); g.tick(0.1);
  const shot = g.state.effects.find(e => e.type === 'mshot'); assert.ok(shot && shot.by === 'sprout', 'the ranged monster throws from 4 cells away');
  assert.equal(h.hp, h.maxHp, 'no damage before the projectile lands');
  for (let i = 0; i < 12; i++) { keep(); g.tick(0.1); }
  assert.ok(h.hp < h.maxHp, `damage lands with the projectile (${h.hp}/${h.maxHp})`);
  // 環村道路上:同一隻魔物就在 4 格外,也不出手
  const road = RING_ROAD.find(p => regionContains('meadow', p.x, p.z) && regionContains('meadow', p.x + 0.1, p.z + 3.5) && !onRingRoad(p.x + 0.1, p.z + 3.5, 0.6));
  assert.ok(road, 'found a ring-road point in the meadow');
  Object.assign(h, { x: road.x, z: road.z, hp: h.maxHp }); g.state.effects = [];
  Object.assign(g.state.enemies[0], { x: road.x + 0.1, z: road.z + 3.5, attackTimer: 0 });
  for (let i = 0; i < 30; i++) { keep(); g.tick(0.1); }
  assert.equal(h.hp, h.maxHp, 'a hunter walking on the ring road is never attacked');
  assert.ok(!g.state.effects.some(e => e.type === 'mshot' || e.type === 'hit'), 'no monster attack is aimed at the road');
  // 自然遊玩 40 秒:魔物不在路上(生怪避開、走路與推擠都不上路)
  const n = createGame(); for (const u of n.state.hunters) u.huntRegion = 'meadow'; run(n, 40);
  assert.ok(n.state.enemies.every(e => !onRingRoad(e.x, e.z, 0.3)), 'monsters stay off the ring road');
}
{
  // 地下城:自動續戰一層接一層、可以選起始層、魔物先打前排
  const g = createGame(); assert.equal(g.construct('dungeon').ok, true);
  const party = ['paladin', 'archer', 'priest'].map(c => g.state.hunters.find(h => h.classId === c));
  for (const h of party) { h.attack = 400; h.maxHp = h.hp = 5000; }
  assert.equal(g.setDungeonAuto(true).ok, true);
  assert.equal(g.startDungeon(party.map(h => h.id)).ok, true); assert.equal(g.state.dungeon.floor, 1);
  assert.ok(g.state.dungeon.foes.length >= 1 && g.state.dungeon.foes.every(f => f.hp > 0), 'a wave of real monsters is lined up');
  const hurtTargets = new Set();
  run(g, 90, false, s => { for (const e of s.dungeon.events || []) if (e.k === 'hurt') hurtTargets.add(e.b); });
  assert.ok(g.state.dungeon.bestFloor >= 2 && g.state.dungeon.active, `auto-continue keeps clearing floors (best ${g.state.dungeon.bestFloor})`);
  assert.deepEqual([...hurtTargets], [party[0].id], 'monsters only hit the front row while the melee hunter stands');
  g.setDungeonAuto(false); run(g, 90);
  assert.equal(g.state.dungeon.active, false, 'turning auto off ends the run after the current floor');
  const best = g.state.dungeon.bestFloor; g.state.dungeon.cooldown = 0;
  assert.equal(g.setDungeonStart(1).ok, true); assert.equal(g.state.dungeon.startFloor, 1);
  g.setDungeonStart(999); assert.equal(g.state.dungeon.startFloor, 0, 'past the newest floor clamps to "newest"');
  for (const h of party) { h.hp = h.maxHp; h.task = null; }
  assert.equal(g.startDungeon(party.map(h => h.id), 2).ok, true); assert.equal(g.state.dungeon.floor, 2, 'the run starts from the chosen floor');
  const saved = createGame(g.serialize()); assert.equal(saved.state.dungeon.floor, 2); assert.equal(saved.state.dungeon.events.length, 0); assert.ok(saved.state.dungeon.foes.length >= 1, 'the current wave survives save/load');
  assert.ok(best >= 2);
}
{
  // 英雄對話框:每句都短;需求優先;倒下說倒下的話
  const all = Object.values(CHATTER_LINES).flatMap(v => Array.isArray(v) ? v : Object.values(v).flat());
  assert.ok(all.every(l => l.replace('{region}', '向陽草原').length <= 12), 'every chatter line is short (≤ 12 characters)');
  let i = 0; const rnd = () => [0.1, 0.0, 0.5][i++ % 3];
  const hungry = { hp: 100, maxHp: 100, satiety: 5, stamina: 90, mood: 90, status: '待機' };
  assert.ok(CHATTER_LINES.NEED.hungry.includes(pickHeroLine(hungry, { rnd })), 'a starving hunter talks about food');
  assert.ok(CHATTER_LINES.STATUS.revive.includes(pickHeroLine({ hp: 0, maxHp: 100, status: '復活中' }, { rnd: () => 0.3 })), 'a fallen hunter says a fallen line');
  assert.ok(pickHeroLine({ hp: 100, maxHp: 100, status: '前往白霜雪原' }, { rnd: () => 0.45 }).length > 0);
}
{
  // 離線掛機:前 OFFLINE.sample 秒真的模擬,其餘外推;最多 8 小時;金幣守恆(獵人錢包花光就沒了)
  const g = createGame(); for (const h of g.state.hunters) h.huntRegion = 'meadow'; run(g, 20);
  const day0 = g.state.day, k0 = g.state.totalKills, snap = g.offlineSnapshot(); g.simulate(OFFLINE.sample);
  const sum = g.offlineFinish(snap, 10 * 3600);
  assert.equal(sum.seconds, OFFLINE.max, 'offline progress is capped at 8 hours'); assert.equal(sum.capped, true);
  assert.ok(g.state.day > day0 + 100 && g.state.totalKills > k0 + 1000, `8 hours of hunting happened (day ${g.state.day}, kills ${g.state.totalKills})`);
  assertFiniteEconomy(g.state); assert.ok(sum.levels.length > 0, 'hunters level up while offline');
  const idle = createGame(); run(idle, 5); const W = () => idle.state.hunters.reduce((n, h) => n + h.gold, 0);
  const s2 = idle.offlineSnapshot(), v0 = idle.state.gold, w0 = W(); idle.simulate(OFFLINE.sample);
  const flow = (idle.state.gold - v0) + (W() - w0); idle.offlineFinish(s2, 3 * 3600);
  assert.ok(Math.abs((idle.state.gold + W()) - (v0 + w0 + flow * (3 * 3600 / OFFLINE.sample))) <= idle.state.hunters.length + 2, 'village + hunter gold is extrapolated together (no gold from nothing)');
  assert.ok(idle.state.hunters.every(h => h.gold >= 0)); assertFiniteEconomy(idle.state);
}
{
  // 地下城撤退;離線時自動續戰的小隊照實繼續打(不靠外推),摘要記樓層與流浪英雄擊倒
  const g = createGame(); g.construct('dungeon');
  const party = ['paladin', 'archer', 'priest'].map(c => g.state.hunters.find(h => h.classId === c));
  assert.equal(g.retreatDungeon().ok, false, 'nothing to retreat from');
  g.startDungeon(party.map(h => h.id)); run(g, 15);
  assert.equal(g.retreatDungeon().ok, true); assert.equal(g.state.dungeon.active, false); assert.equal(g.state.dungeon.phase, '撤退');
  assert.ok(party.every(h => h.task !== 'dungeon'), 'the party leaves the dungeon'); assert.equal(g.state.dungeon.cooldown, 10);
  const o = createGame(); o.construct('dungeon'); o.setDungeonAuto(true);
  const p2 = ['paladin', 'archer', 'priest'].map(c => o.state.hunters.find(h => h.classId === c));
  for (const h of p2) { h.attack = 300; h.maxHp = h.hp = 20000; }
  o.startDungeon(p2.map(h => h.id)); run(o, 10);
  const best0 = o.state.dungeon.bestFloor, snap = o.offlineSnapshot(); o.simulate(OFFLINE.sample); const sampledBest = o.state.dungeon.bestFloor;
  const sum = o.offlineFinish(snap, 3600);
  assert.ok(o.state.dungeon.bestFloor > sampledBest + 3, `the auto-continue party keeps climbing while offline (${sampledBest} → ${o.state.dungeon.bestFloor})`);
  assert.ok(sum.dungeon && sum.dungeon.to === o.state.dungeon.bestFloor && sum.dungeon.from === best0, 'the summary reports the floors climbed');
  assert.ok(Number.isInteger(sum.wanderKills) && sum.wanderKills >= 0); assertFiniteEconomy(o.state);
}
{
  // 魔物圖鑑:每區 3 隻都有名字;介紹最多 26 字、只寫存在的魔物
  for (const [rid, list] of Object.entries(REGION_MONSTERS)) { assert.equal(list.length, 3, `${rid} lists 3 monsters`); for (const m of list) assert.ok(MONSTER_NAME[m], `${m} has a name`); }
  const all = Object.values(REGION_MONSTERS).flat();
  for (const [m, line] of Object.entries(MONSTER_LORE)) { assert.ok(all.includes(m), `lore for a real monster (${m})`); assert.ok(typeof line === 'string' && line.length >= 6 && line.length <= 26, `lore line length 6-26 (${m}: ${line.length})`); }
}
console.log(`PASS: ${CLASSES.length} hunters / ${CLASSES.length} classes, seeded visitors, conservation of personal and village gold, paid and emergency services, bounded trading, crafting and gear purchases, upgrades, training, skills, rebirth, difficulty gates, hunting, field boss, death/revival, dungeon combat and save continuation, NPC arena, navigation, malformed saves, pause, deterministic simulation, all 8 quests. Natural 60s: ${combat.state.totalKills} total kills; ${combat.state.counts.services} services.`);

