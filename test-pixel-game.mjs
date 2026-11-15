import { vdir4, dirSuffix, leftRow, rows4, fromScreen, toScreen, quantize4, quantize4Stable, facingOk, screenAngle, DIR4_CENTER_DEG, QUADRANT_OFFSET_DEG, FACING_HYSTERESIS_DEG } from './src/dir4.js';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createGame, OFFLINE, ENEMIES, MOUNT_SPEED_MULT, isRideable, hunterGender, GENDERS, nameGender, NAME_GENDER } from './src/pixel-game.js';
import { doorStand, buildingSolid } from './src/landscape-layout.js';
import { blockCenter } from './src/village-grid.js';
import { BUILDINGS, CLASSES, MATERIALS, PRODUCTS, RECIPES, PILOT_ATTACK, AI_ATTACK_LOCK, KITE, EQUIPMENT, CLASS_STARTER, EQUIP_SLOTS, GEAR_SLOTS, RARITIES } from './src/pixel-data.js';
import { regionCenter, regionContains, walkable, RING_ROAD, onRingRoad } from './src/overworld.js';
import { MONSTER_RANGED, MONSTER_SPEED_MULT, MONSTER_ATTACK_RATE, REGION_DENSITY } from './src/pixel-data.js';
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
assert.equal(g.state.version, 4); assert.equal(g.state.hunters.length, CLASSES.length); assert.equal(new Set(g.state.hunters.map(h => h.classId)).size, CLASSES.length);   // 2026-10-28 使用者:開局預設各職業一隻
assert.equal(g.state.gold, 1500); assert.equal(g.state.capacity, Math.max(8, CLASSES.length + 2)); assert.equal(g.state.visitors.length, 3);
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

const gear = createGame(), buyer = isolate(gear),forge=BUILDINGS.find(b=>b.id==='forge'); gear.state.time = 100; Object.assign(buyer, doorStand(forge,forge)); buyer.gold = 1000;
const gearIds = RECIPES.map(r => r.id);
for (const id of gearIds) assert.equal(gear.craftEquipment(id).ok, true, `craft ${id}`);
const gearMoney = totalMoney(gear), attackBefore = buyer.attack, hpBefore = buyer.maxHp; run(gear, 5, true);
assert.ok(gearIds.every(id => buyer.equipment[id] === true), 'auto-buy buys every missing slot'); assert.ok(gearIds.every(id => gear.state.gearStock[id] === 0));
assert.equal(gear.state.counts.gearSold, gearIds.length); assert.equal(totalMoney(gear), gearMoney); assert.ok(buyer.attack > attackBefore && buyer.maxHp > hpBefore);
{ // 舊存檔(v2)只有 {weapon,armor}:armor 視為六件全穿(舊玩家不掉戰力),沒賣掉的 armor 庫存併到胸甲
  // 真正的 v2/v3 存檔沒有物品欄位(h.gear / gearStorage / gearSeq):從 v4 存檔模擬舊檔時要拿掉
  const asOld = (s, v) => { s.version = v; for (const x of [...s.hunters, ...(s.wanderers || [])]) delete x.gear; delete s.gearStorage; delete s.gearSeq; return s; };
  const old = asOld(createGame().serialize(), 2);
  Object.assign(old.hunters[0], { equipment: { weapon: true, armor: true }, weaponLevel: 3 });
  const re = createGame(old), rh = re.state.hunters[0];
  assert.deepEqual(rh.equipment, { weapon: true, helm: true, chest: true, belt: true, legs: true, boots: true, gloves: true });
  assert.equal(rh.weaponLevel, 3); assert.ok(re.state.hunters.slice(1).every(h => Object.values(h.equipment).every(v => v === false)));
  const bare = asOld(createGame().serialize(), 2); bare.hunters[0].equipment = { weapon: false, armor: false };
  assert.ok(Object.values(createGame(bare).state.hunters[0].equipment).every(v => v === false));
  const stock = asOld(createGame().serialize(), 2); stock.gearStock = { weapon: 0, armor: 2 };
  const restocked = createGame(stock); assert.equal(restocked.state.gearStock.chest, 2); assert.equal(restocked.state.gearStock.weapon, 0); assert.equal(restocked.state.gearStock.armor, undefined);
}
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
assert.equal(buildings.upgrade('house').ok, true); assert.equal(buildings.state.capacity, Math.max(8, CLASSES.length + 2) + 2); assert.equal(buildings.upgrade('academy').ok, false);
assert.equal(buildings.construct('academy').ok, true); assert.equal(buildings.construct('academy').ok, false);
const marketBlock = blockCenter(-2, 0), plazaBlock = blockCenter(0, 0);
assert.equal(buildings.moveBuilding('bounty', marketBlock.x + 1, marketBlock.z - 1).ok, true); assert.equal(buildings.moveBuilding('hall', plazaBlock.x, plazaBlock.z).ok, false, 'plaza stays open'); assert.equal(buildings.moveBuilding('hall', -100, 0).ok, false); assert.equal(buildings.moveBuilding('dungeon', 0, 0).ok, false);
const movedSaved = createGame(buildings.serialize()); assert.deepEqual(movedSaved.state.layout.bounty, { x: marketBlock.x, z: marketBlock.z }, 'moves snap to the nearest block center');

// 2026-11-12(UX 稽核 round3 #5):沒有玩家指令的獵人會自己挑「輕鬆」的區出村打怪,缺東西回村辦事,再出發。
// (2026-10-04 f6a44fe 曾改成只等派令,全新存檔不下指令就永遠待在村裡。)
const idle = createGame(); const idleOut = new Set();
run(idle, 60, false, s => { assertFiniteEconomy(s); for (const h of s.hunters) if (h.autoHunt) idleOut.add(h.id); });
assert.ok(idle.state.totalKills > 0, 'Hunters without orders go hunting on their own');
assert.ok(idleOut.size >= 4, `most hunters head out by themselves (${idleOut.size})`);
assert.ok(idle.state.hunters.every(h => !h.huntRegion || h.autoHunt), 'Self-chosen hunts are marked autoHunt (no player order was given)');
assert.ok(idle.state.counts.services > 0, 'Hunters visibly use town services within 60 seconds');
{ // 自己挑的區一定是「輕鬆」的(跟地圖面板的 fit 同一條公式);玩家派令優先、召回後先待在村裡
  const g = createGame(); run(g, 30);
  for (const h of g.state.hunters) if (h.autoHunt) assert.equal(g.regionInfo(h.huntRegion).fit([h.id]).verdict, 'easy', `${h.classId} picked an easy region`);
  const a = g.state.hunters.find(h => h.autoHunt); assert.ok(a, 'someone is hunting on their own');
  assert.equal(g.dispatchHunters('forest', [a.id]).ok, true); assert.equal(a.huntRegion, 'forest'); assert.equal(a.autoHunt, false, 'a player order replaces the self-chosen hunt');
  assert.equal(g.recallHunters().ok, true); run(g, 60);
  assert.ok(g.state.hunters.every(h => !h.huntRegion), 'recalled hunters stay home for a while');
  const weak = createGame(); for (const h of weak.state.hunters) { h.attack = 1; h.defense = 0; h.level = 1; }
  run(weak, 30); assert.ok(weak.state.hunters.every(h => !h.huntRegion), 'hunters too weak for every region stay in town');
  // 存檔相容:舊存檔(沒有 autoHunt/autoReadyAt、counts 沒有收入分帳欄位)照常讀,讀完一樣會自己出門;出征中存檔讀回來也不會卡在野外
  const old = createGame().serialize(); for (const h of old.hunters) { delete h.autoHunt; delete h.autoReadyAt; }
  for (const k of ['hunterGold', 'hunterPay', 'wanderGold', 'wanderPay']) delete old.counts[k];
  const re = createGame(old); assert.ok(['hunterGold', 'hunterPay', 'wanderGold', 'wanderPay'].every(k => re.state.counts[k] === 0), 'old saves get zeroed income ledgers');
  run(re, 60); assert.ok(re.state.totalKills > 0 && re.state.counts.hunterGold > 0, 'hunters from an old save hunt on their own');
  const out = createGame(); run(out, 30); assert.ok(out.state.hunters.some(h => h.autoHunt && !h.inTown));
  const mid = createGame(out.serialize()); run(mid, 60, false, assertFiniteEconomy);
  assert.ok(mid.state.hunters.some(h => h.autoHunt), 'a save taken mid-hunt resumes hunting after load');
}
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
assert.ok(squads.state.totalKills > 0, 'Squads in several regions earn kills'); assert.ok(!s4.huntRegion || s4.autoHunt, 'The unassigned hunter never gets a squad order (he may hunt on his own)');
const squadLoad = createGame(squads.serialize());
assert.deepEqual(squadLoad.state.dispatchTeams.map(t => t.ids), squads.state.dispatchTeams.map(t => t.ids)); assert.deepEqual(squadLoad.state.dispatchTeams.map(t => t.region), ['meadow', 'forest', 'taiga', 'meadow']);
const dupSave = squads.serialize(); dupSave.dispatchTeams[3] = { ids: [s0.id, s4.id], region: 'desert' };
const dupLoaded = createGame(dupSave);
assert.deepEqual(dupLoaded.state.dispatchTeams[0].ids, [s0.id], 'The first squad that lists a hunter keeps him'); assert.deepEqual(dupLoaded.state.dispatchTeams[3].ids, [s4.id]); assert.equal(dupLoaded.state.dispatchTeams[3].region, 'desert');
assert.equal(createGame().dispatchHunters().ok, true, 'The one-click dispatch still sends everyone');
// ── 2026-10-31 使用者:怪物在可行走區域邊緣不能來回抖動 ──
{
  const g = createGame(null);
  g.setRegionDensity('meadow', 3);
  g.dispatchHunters('meadow');
  const hist = new Map();
  let osc = 0;
  for (let i = 0; i < 600; i++) {
    g.tick(0.1);
    for (const e of g.state.enemies) {
      if (e.hp <= 0) continue;
      const h = hist.get(e.id) || []; h.push({ x: e.x, z: e.z }); if (h.length > 5) h.shift(); hist.set(e.id, h);
      if (h.length < 5) continue;
      const a = h[0], b = h[2], c = h[4];
      const dAB = Math.hypot(b.x - a.x, b.z - a.z), dCA = Math.hypot(c.x - a.x, c.z - a.z);
      if (dAB > 0.02 && dCA < 0.05) osc++;   // 走了又回到原點 = 抖動
    }
  }
  // 修之前同一段模擬是 424 次(幾乎全是閒晃中的魔物被推開又走回去);現在只剩交戰中的零星幾次
  assert.ok(osc < 120, `Monsters do not jitter in place (${osc} wobbles in 60s)`);
}
// ── 祭司(priest):技能補血之外,普攻也會拿去補隊友(2026-10-31 使用者) ──
{
  const g = createGame(null);
  const pr = g.state.hunters.find(h => h.classId === 'priest');
  assert.ok(pr, 'The starting party includes a priest');
  const mate = g.state.hunters.find(h => h.classId !== 'priest' && h.hp > 0);
  // 兩個人站在草原空地,沒有魔物;隊友掉血 → 祭司的普攻應該拿來補血
  pr.x = -20; pr.z = -10; pr.task = null; pr.route = []; pr.attackTimer = 0; pr.skillCd = 5;   // 技能還在轉,只剩普攻
  mate.x = -19.4; mate.z = -10; mate.task = null; mate.route = []; mate.hp = Math.round(mate.maxHp * 0.4);
  const before = mate.hp, step = Math.round(mate.maxHp * 0.1);
  run(g, 5, true);
  assert.ok(mate.hp > before, `A wounded ally gets healed by the priest's basic attack (${before} -> ${Math.round(mate.hp)})`);
  assert.ok(mate.hp - before >= step * 2, 'Several basic-attack heals land in five seconds');
  assert.ok(mate.hp <= mate.maxHp, 'Healing never overshoots the max HP');
  // 隊友滿血時,祭司不會浪費普攻補血(會照常打怪)
  mate.hp = mate.maxHp;
  const healedAtFull = mate.hp;
  run(g, 2, true);
  assert.equal(mate.hp, healedAtFull, 'No healing when the ally is already at full HP');
  // 隊友在治療射程外受傷 → 祭司會主動靠過去
  const far = createGame(null);
  const p2 = far.state.hunters.find(h => h.classId === 'priest');
  const m2 = far.state.hunters.find(h => h.classId !== 'priest' && h.hp > 0);
  p2.x = -22; p2.z = -12; p2.task = null; p2.route = []; p2.attackTimer = 0; p2.huntRegion = 'meadow'; p2.inTown = false;   // 出村打獵的祭司才會去找隊友
  m2.x = -22; m2.z = 2; m2.task = null; m2.route = []; m2.hp = Math.round(m2.maxHp * 0.35);
  const d0 = Math.hypot(p2.x - m2.x, p2.z - m2.z);
  assert.ok(d0 > 9, 'The wounded ally starts outside healing range');
  run(far, 6, true);
  const d1 = Math.hypot(p2.x - m2.x, p2.z - m2.z);
  assert.ok(d1 < d0 - 1, `The priest walks toward a wounded ally (${d0.toFixed(1)} -> ${d1.toFixed(1)})`);
}
// ── 開發者作弊「資源滿載」:金幣/星晶之外,六種素材與四種物資都要真的加到(2026-10-31 修正) ──
{
  const g = createGame(null);
  const keys = Object.keys(MATERIALS);
  const before = Object.fromEntries(keys.map(k => [k, g.state[k]]));
  const foodBefore = g.state.stocks.food;
  const r = g.cheat('resources');
  assert.equal(r.ok, true);
  assert.ok(g.state.gold >= 10000 && g.state.gems >= 100, 'Gold and gems are added');
  for (const k of keys) assert.equal(g.state[k], before[k] + 500, `${k} gains 500`);
  assert.equal(g.state.stocks.food, foodBefore + 50, 'Stocks gain 50');
  assert.deepEqual(Object.keys(g.state).filter(k => /^\d+$/.test(k)), [], 'No stray numeric keys are written into the save');
}
// ── 2026-10-31 使用者:怪物移動速度 ×1.5、攻擊速度 ×1.3 ──
{
  assert.equal(MONSTER_SPEED_MULT, 1.5, 'Monsters move 1.5x faster');
  assert.equal(MONSTER_ATTACK_RATE, 1.3, 'Monsters attack 1.3x as often');
  const g = createGame(null); g.dispatchHunters('meadow');
  const prev = new Map(), resets = new Map();
  let biggest = 0, fastest = '';
  for (let i = 0; i < 400; i++) {
    g.tick(0.1);
    for (const e of g.state.enemies) {
      if (e.hp <= 0) continue;
      const p = prev.get(e.id);
      if (p) {
        const d = Math.hypot(e.x - p.x, e.z - p.z);
        if (d > biggest) { biggest = d; fastest = e.type; }
        if (e.attackTimer > p.at + 0.5) resets.set(e.type, +e.attackTimer.toFixed(3));
      }
      prev.set(e.id, { x: e.x, z: e.z, at: e.attackTimer });
    }
  }
  // 近戰間隔 = 1.8 / 1.3；遠程 = each / 1.3
  for (const [type, at] of resets) {
    const rng = MONSTER_RANGED[type], expect = rng ? rng.every / MONSTER_ATTACK_RATE : 1.8 / MONSTER_ATTACK_RATE;
    assert.ok(Math.abs(at - expect) < 0.02, `${type} attacks every ${expect.toFixed(3)}s (got ${at})`);
  }
  assert.ok(resets.size >= 3, 'Several monster types attacked during the run');
  // 每一步不會超過 速度×1.5×dt（再加上被推開的 1.2×dt 上限）
  const fastestSpeed = Math.max(...Object.values(ENEMIES).map(e => e.speed));
  assert.ok(biggest <= fastestSpeed * MONSTER_SPEED_MULT * 0.1 + 0.13, `No monster teleports (${biggest.toFixed(3)} by ${fastest})`);
}
// ── 地區立牌:怪物數量三級(I/II/III),只改同時出現的數量與補怪速度 ──
{
  const dg = createGame(null);
  assert.equal(dg.state.regionDensity.meadow, 2, 'Every region starts at level II');
  assert.equal(dg.regionDensity('meadow').numeral, 'II');
  assert.equal(dg.regionDensity('village'), null, 'The village has no sign');
  assert.equal(dg.setRegionDensity('meadow', 1).ok, true);
  assert.equal(dg.setRegionDensity('meadow', 1).ok, false, 'Setting the same level is a no-op');
  assert.equal(dg.regionDensity('meadow').cap, 8);
  assert.equal(dg.setRegionDensity('meadow', 4).ok, false, 'Only levels 1-3 are allowed');
  assert.equal(dg.setRegionDensity('meadow', 0).ok, false);
  const savedDensity = createGame(dg.serialize());
  assert.equal(savedDensity.state.regionDensity.meadow, 1, 'The level survives a save/load');
  assert.deepEqual(createGame({ ...dg.serialize(), regionDensity: { meadow: 9 } }).state.regionDensity.meadow, 2, 'Out-of-range saved values fall back to level II');
  assert.equal(createGame({ ...dg.serialize(), regionDensity: undefined }).state.regionDensity.forest, 2, 'Old saves without the field get level II');
  // 沒有獵人、沒有流浪英雄時,補怪只受上限限制:低密度停在 8、高密度可以超過 8。
  const capRun = (level, seconds) => {
    const g = createGame(null);
    g.state.hunters = []; g.state.wanderers = []; g.state.enemies = []; g.state.spawnTimer = 0;
    g.setRegionDensity('meadow', level);
    let peak = 0;
    run(g, seconds, false, st => { peak = Math.max(peak, st.enemies.filter(e => e.hp > 0 && e.type !== 'boss' && e.regionId === 'meadow').length); });
    return { peak, alive: g.state.enemies.filter(e => e.hp > 0 && e.regionId === 'meadow').length };
  };
  const low = capRun(1, 60), high = capRun(3, 60);
  assert.ok(low.peak <= dg.regionDensity('meadow').levels[0].cap, `Level I never exceeds its cap (peak ${low.peak})`);
  assert.ok(low.peak >= 6, `Level I still fills up (peak ${low.peak})`);
  assert.ok(high.peak > low.peak, `Level III allows more monsters (peak ${high.peak} vs ${low.peak})`);
  assert.ok(high.peak <= dg.regionDensity('meadow').levels[2].cap, 'Level III respects its cap');
  // 降級時,超過上限的魔物會被收掉(沒在交戰的)。
  const trim = createGame(null); trim.state.hunters = []; trim.state.wanderers = []; trim.state.enemies = []; trim.state.spawnTimer = 0;
  const meadowAlive = g => g.state.enemies.filter(e => e.hp > 0 && e.type !== 'boss' && e.regionId === 'meadow').length;
  trim.setRegionDensity('meadow', 3); run(trim, 50);
  assert.ok(meadowAlive(trim) > 8, 'Level III piles monsters up');
  trim.setRegionDensity('meadow', 1);
  run(trim, 0.3);
  assert.ok(meadowAlive(trim) <= 8, `Lowering the level trims the extra monsters (${meadowAlive(trim)} left)`);
}
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
// 2026-11-15 起可以斜走:搖桿方向就是移動方向(不量化成畫面軸);動畫方向的 4 象限在畫面端(src/dir4.js)。
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
// ── 斜走(2026-11-15 使用者:「允許斜走」):斜向輸入就斜著走,方向 = 輸入方向(不量化成畫面軸) ──
{
  const g4 = createGame(); const q = isolate(g4); assert.equal(g4.pilotStart(q.id).ok, true); q.x = 6; q.z = 30;
  const scr = (sx, sy) => fromScreen(sx, sy);
  const angleOf = (dx, dz) => { const s = toScreen(dx, dz); return Math.atan2(s.sy, s.sx) * 180 / Math.PI; };
  const go = (sx, sy, n = 3) => { q.x = 6; q.z = 30; const v = scr(sx, sy); g4.pilotInput(v.x, v.z); const out = []; for (let i = 0; i < n; i++) { const x0 = q.x, z0 = q.z; g4.tick(0.1); out.push(angleOf(q.x - x0, q.z - z0)); } return out; };
  for (const [sx, sy] of [[1, 0], [1, 1], [-1, 1], [-1, -1], [1, -1], [0.3, 0.9], [-2, 0.7], [5, -4.9]]) {
    const want = Math.atan2(sy, sx) * 180 / Math.PI;
    for (const a of go(sx, sy, 2)) assert.ok(Math.abs(((a - want + 540) % 360) - 180) < 1e-6, `input (${sx},${sy}) walks straight along the input (${a.toFixed(2)}° vs ${want.toFixed(2)}°)`);
  }
  g4.pilotStop();
}
// ── 斜走:AI 獵人、流浪英雄、魔物都走直線(斜的路線段就斜著走,不再走階梯) ──
{
  const g = createGame(); let n = 0, axisSteps = 0, diag = 0;
  const prev = new Map();
  for (let i = 0; i < 600; i++) {
    g.tick(0.1);
    for (const u of [...g.state.hunters, ...(g.state.wanderers || []), ...g.state.enemies]) {
      const o = prev.get(u); prev.set(u, { x: u.x, z: u.z }); if (!o || u.hp <= 0) continue;
      const dx = u.x - o.x, dz = u.z - o.z, l = Math.hypot(dx, dz); if (l < 1e-6 || l > 3) continue;   // 沒動 / 瞬移(進出地下城、復活回營地)不算
      n++;
      const s = toScreen(dx, dz), ax = Math.abs(s.sx), ay = Math.abs(s.sy);
      if (Math.min(ax, ay) < 1e-6 * Math.max(ax, ay)) axisSteps++;                  // 純畫面軸
      else if (Math.min(ax, ay) > 0.2 * Math.max(ax, ay)) diag++;                   // 明顯斜向(離畫面軸 > 11°)
    }
  }
  assert.ok(n > 2000, `units moved (${n} samples)`);
  assert.ok(diag / n > 0.3, `units walk diagonally again, not only along screen axes (${diag}/${n} diagonal, ${axisSteps} pure-axis)`);
}
// 手動操控法師:魔法球真的會飛(PILOT_ORB)——空打朝目前面向的角度(投射物直飛,不吸附方向)、路徑上碰到的魔物都打(穿透)、飛完射程就消失
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
  // T106:普攻有 15% 暴擊(1.5 倍),所以一次命中的扣血量是 attack 或 1.5 倍;兩者都只算「命中一次」。
  { const atk = orb.state.hunters[0].attack, drop = hp0.onPath - foes.onPath.hp;
    assert.ok(drop === atk || drop === Math.round(atk * 1.5), `each monster is hit once per orb (drop ${drop} vs atk ${atk})`); }
  assert.equal(orb.state.shots.length, 0, 'orb disappears after its range');
  // 3.2 格內有魔物:照舊自動瞄準牠(方向朝魔物,不是面向;直飛不量化)
  orb.tick(0.6); const nx0 = oh.x + 0.8, nz0 = oh.z - 1.8, near = { ...proto, id: 'orbtestNear', x: nx0, z: nz0, hp: 200, attackTimer: 9, rewarded: false };
  orb.state.enemies = [near]; orb.pilotAttack(); orb.tick(0.02);
  { const l = Math.hypot(nx0 - oh.x, nz0 - oh.z), s = orb.state.shots[0];
    assert.ok(orb.state.shots.length === 1 && Math.abs(s.dx - (nx0 - oh.x) / l) < 1e-6 && Math.abs(s.dz - (nz0 - oh.z) / l) < 1e-6, 'orb flies straight at the monster in range'); }
  for (let i = 0; i < 6; i++) { near.x = nx0; near.z = nz0; near.attackTimer = 9; orb.tick(0.05); }
  assert.ok(near.hp < 200, 'aimed orb hits the monster');
  orb.pilotStop();
}
// ── 疾風箭雨(2026-11-05):箭真的飛,飛行中碰到魔物才扣血;魔物在放箭後走開 = 落空、不扣血。AI 施放與離線 simulate 也一樣結算。
{
  const gen = createGame(); const gh = isolate(gen); gh.x = gh.z = 0; run(gen, 6); const proto = gen.state.enemies.find(e => e.hp > 0);
  assert.ok(proto, 'template enemy spawned for the gale test');
  const setup = () => {
    const g = createGame(); const a = g.state.hunters.find(h => h.classId === 'archer'); g.state.hunters = [a];
    Object.assign(a, { hp: a.maxHp, satiety: 100, mood: 100, stamina: 100, task: null, route: [], rallying: false, huntRegion: null, x: 6, z: 30, skillCd: 0, attackTimer: 0 });
    g.state.enemies = []; g.state.spawnTimer = 0; return { g, a };
  };
  const foe = (id, x, z) => ({ ...proto, id, x, z, hp: 5000, maxHp: 5000, attackTimer: 99, rewarded: false });
  const hold = (g, foes, spots) => { g.state.spawnTimer = 0; for (const e of foes) { const p = spots[e.id]; if (p) { e.x = p.x; e.z = p.z; } e.attackTimer = 99; } };
  const dmg = a => Math.max(1, Math.round(Math.max(1, Math.round(a.attack)) * 1.3));
  // 1) 手動放技能:扣血發生在箭到的時候,不是施放當下;一支箭只打一隻
  {
    const { g, a } = setup(); const m = foe('galeHit', a.x + 4, a.z); g.state.enemies = [m]; const spots = { galeHit: { x: m.x, z: m.z } };
    assert.equal(g.pilotStart(a.id).ok, true); a.skillCd = 0;
    assert.equal(g.pilotSkill().ok, true, 'pilot gale casts with a monster in reach');
    assert.equal(m.hp, 5000, 'gale deals no damage at cast time');
    assert.equal(g.state.shots.filter(s => s.fx === 'gale').length, 3, 'gale fires three real arrows (1 aimed + 2 side)');
    assert.ok(g.state.shots.every(s => s.big && s.wait > 0), 'gale arrows wait for the release frame');
    hold(g, [m], spots); g.tick(0.1); assert.equal(m.hp, 5000, 'still no damage before the arrow arrives');
    for (let i = 0; i < 16; i++) { hold(g, [m], spots); g.tick(0.05); }
    assert.equal(m.hp, 5000 - dmg(a), 'the aimed arrow hits once for base × mult; side arrows miss');
    assert.deepEqual([g.state.lastGale.hits, g.state.lastGale.misses], [1, 2], 'lastGale records 1 hit / 2 misses');
    assert.ok(g.state.effects.some(e => e.type === 'skillfx' && e.fx === 'gale' && e.targetId === m.id && e.value === dmg(a)), 'hit effect + damage number appear on impact');
    assert.equal(g.state.shots.length, 0, 'all gale arrows are gone after the volley');
    g.pilotStop();
  }
  // 2) 放箭後魔物瞬間走開(到箭的路徑外):全部落空,一滴血都不扣
  {
    const { g, a } = setup(); const m = foe('galeMiss', a.x + 4, a.z); g.state.enemies = [m];
    assert.equal(g.pilotStart(a.id).ok, true); a.skillCd = 0; assert.equal(g.pilotSkill().ok, true);
    let launched = false; const away = { galeMiss: { x: a.x + 4, z: a.z + 6 } }, stay = { galeMiss: { x: a.x + 4, z: a.z } };
    for (let i = 0; i < 20; i++) {
      // 先待在原地讓箭瞄準(放出那一刻),放出之後才閃開
      hold(g, [m], launched ? away : stay); g.tick(0.05);
      if (!launched && g.state.shots.some(s => s.fx === 'gale' && !(s.wait > 0))) launched = true;
    }
    assert.ok(launched, 'gale arrows were released');
    assert.equal(m.hp, 5000, 'a monster that dodges out of the arrow path takes no damage');
    assert.deepEqual([g.state.lastGale.hits, g.state.lastGale.misses], [0, 3], 'all three arrows miss');
    g.pilotStop();
  }
  // 3) AI 施放(三個目標各一支)+ 離線 simulate 也會結算;王也打得到
  {
    const { g, a } = setup(); a.huntRegion = g.state.region;
    const ms = [foe('galeA', a.x + 3, a.z), foe('galeB', a.x + 3, a.z + 3), { ...foe('galeC', a.x + 3, a.z - 3), type: 'boss' }];
    g.state.enemies = ms; const spots = Object.fromEntries(ms.map(e => [e.id, { x: e.x, z: e.z }]));
    a.task = null; a.status = '戰鬥中';
    let cast = false;
    for (let i = 0; i < 40 && !cast; i++) { hold(g, ms, spots); a.skillCd = 0; a.attackTimer = 0; g.tick(0.05); cast = g.state.lastGale?.arrows === 3 && g.state.lastGale.n === 3; }
    if (cast) {
      assert.ok(ms.every(e => e.hp >= 5000 - a.attack * 2), 'AI gale does not deal skill damage at cast time');
      const hp0 = ms.map(e => e.hp); const shotsAtCast = g.state.shots.filter(s => s.fx === 'gale').length;
      assert.equal(shotsAtCast, 3, 'AI gale fires one arrow per target');
      const id0 = g.state.lastGale.id;
      for (let i = 0; i < 10; i++) { hold(g, ms, spots); a.skillCd = 99; a.attackTimer = 99; g.simulate(0.1); }
      assert.equal(g.state.lastGale.id, id0);
      assert.equal(g.state.lastGale.hits, 3, `every target is hit by its own arrow via simulate (${g.state.lastGale.hits} hits / ${g.state.lastGale.misses} misses)`);
      ms.forEach((e, i) => assert.equal(hp0[i] - e.hp, dmg(a), `${e.id} takes exactly one gale arrow`));
    } else assert.fail('AI archer never cast gale in the test setup');
  }
  // 4) 存檔:飛行中的箭不存、讀檔後清空(serialize 本來就把 shots 清掉)
  {
    const { g, a } = setup(); g.state.enemies = [foe('galeSave', a.x + 4, a.z)];
    assert.equal(g.pilotStart(a.id).ok, true); a.skillCd = 0; g.pilotSkill();
    assert.ok(g.state.shots.length === 3); assert.deepEqual(g.serialize().shots, [], 'in-flight gale arrows are not saved');
    g.pilotStop();
  }
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
// ── 動畫方向 = 4 象限(2026-11-15 使用者:「90度分界分四個象限，每個象限一個動畫方向」;src/dir4.js) ──
{
  assert.equal(QUADRANT_OFFSET_DEG, 0, 'quadrants centred on screen right/down/left/up, boundaries on the screen diagonals');
  assert.deepEqual(DIR4_CENTER_DEG, { right: 0, down: 90, left: 180, up: 270 });
  const at = deg => fromScreen(Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180));
  // 每個象限內(離邊界 > 3.1°)一律是那個方向,跟上一個方向無關
  for (let a = 0; a < 360; a += 0.5) {
    const off = ((a + 45) % 90) - 45; if (Math.abs(Math.abs(off) - 45) <= 3.1) continue;
    const want = ['right', 'down', 'left', 'up'][Math.round(a / 90) % 4], v = at(a);
    for (const prev of [null, 'right', 'down', 'left', 'up']) assert.equal(quantize4(v.x, v.z, prev), want, `${a}° (prev ${prev}) -> ${want}`);
    assert.ok(Math.abs(screenAngle(v.x, v.z) - a) < 1e-6 || Math.abs(Math.abs(screenAngle(v.x, v.z) - a) - 360) < 1e-6, 'screenAngle is the screen angle, not the world angle');
  }
  // 走路的遲滯:正斜走(45°)時維持上一個方向;超過邊界 FACING_HYSTERESIS_DEG 才換
  const H = FACING_HYSTERESIS_DEG; assert.ok(H >= 8 && H <= 12, `hysteresis ≈10° (${H})`);
  for (const [a, prev, want] of [[45, 'right', 'right'], [45, 'down', 'down'], [45 + H - 0.5, 'right', 'right'], [45 + H + 0.5, 'right', 'down'], [135, 'down', 'down'], [135, 'left', 'left'],
    [225, 'left', 'left'], [225, 'up', 'up'], [315, 'up', 'up'], [315, 'right', 'right'], [315 - H - 0.5, 'right', 'up'], [10, 'up', 'right']]) {
    const v = at(a); assert.equal(quantize4Stable(v.x, v.z, prev), want, `stable ${a}° prev ${prev} -> ${want}`);
  }
  // 正斜走一整段(角度在邊界兩側 ±(H-1)° 來回抖):方向一次都不換
  { let d = 'right', changes = 0; for (let i = 0; i < 200; i++) { const v = at(45 + Math.sin(i * 1.7) * (H - 1)); const n = quantize4Stable(v.x, v.z, d); if (n !== d) changes++; d = n; } assert.equal(changes, 0, 'walking almost exactly diagonally never flickers'); }
  // facingOk = check_facing 的判準:象限本身 OK、鄰近象限只在遲滯帶內 OK、對面/遠離的一律不 OK
  { const v = at(30); assert.ok(facingOk(v.x, v.z, 'right') && !facingOk(v.x, v.z, 'down') && !facingOk(v.x, v.z, 'left') && !facingOk(v.x, v.z, 'up')); }
  { const v = at(50); assert.ok(facingOk(v.x, v.z, 'right') && facingOk(v.x, v.z, 'down') && !facingOk(v.x, v.z, 'up')); }
  // 等角投影:世界 (+1,0)(往東)在畫面上是右下 26.6° → 右;世界 (0,+1) 在畫面上是左下 153.4° → 左;世界 (1,1) = 畫面正下
  assert.equal(quantize4(1, 0), 'right'); assert.equal(quantize4(0, 1), 'left'); assert.equal(quantize4(1, 1), 'down'); assert.equal(quantize4(-1, -1), 'up');
  // 舊存檔/舊名稱:4 個 vdir 名稱照舊有效(存的 facing 值不用遷移)
  assert.deepEqual(['side', 'down', 'sideLeft', 'up'].map(n => vdir4(0, 0, n)), ['side', 'down', 'sideLeft', 'up']);
}
// ── 魔物 4 方向(docs/DV2-ADOPTION-PLAN.md Phase 2.4):assets/monsters3 的 8 方向 sheet 只用 4 組列(原列 / Down / Up / Left),斜向列一律不會被選到 ──
{
  const dir = new URL('./assets/monsters3/', import.meta.url);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  assert.ok(files.length >= 20, `monster sheets found (${files.length})`);
  const DIAG = /(UpRight|DownRight|UpLeft|DownLeft)$/;
  // 畫面上一整圈的移動方向 → 只會量化成 4 個 vdir
  const vdirs = new Set();
  for (let a = 0; a < 360; a += 1) { const v = fromScreen(Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180)); vdirs.add(vdir4(v.x, v.z, 'side')); vdirs.add(vdir4(v.x, v.z, 'up', true)); }
  assert.deepEqual([...vdirs].sort(), ['down', 'side', 'sideLeft', 'up'], 'facing quantizes to 4 directions only');
  let checked = 0;
  for (const f of files) {
    const m = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8')).actions;
    for (const kind of ['idle', 'walk', 'attack']) {
      const rows = rows4(m, kind);
      for (const r of rows) { assert.ok(!DIAG.test(r), `${f} ${kind}: diagonal row ${r} is never picked`); assert.ok(m[r], `${f} ${kind}: row ${r} exists`); }
      assert.ok(rows.size <= 4, `${f} ${kind}: at most 4 rows (${[...rows].join(',')})`);
      for (const vdir of vdirs) {
        const act = kind + dirSuffix(m, kind, vdir), [row] = leftRow({ actions: m }, act, vdir === 'sideLeft' ? -1 : 1);
        if (vdir === 'down' && m[kind + 'Down']) assert.equal(act, kind + 'Down', `${f} ${kind} down → ${kind}Down`);
        if (vdir === 'up' && m[kind + 'Up']) assert.equal(act, kind + 'Up', `${f} ${kind} up → ${kind}Up`);
        if (vdir === 'sideLeft' && m[kind + 'Left'] && kind === 'attack') assert.equal(row, 'attackLeft', `${f} attack left uses the baked left row`);
        assert.ok(!DIAG.test(row), `${f} ${kind} ${vdir} → ${row}`); checked++;
      }
    }
  }
  assert.ok(checked > 200, `checked ${checked} monster row picks`);
}
// ── 騎乘(docs/PAPERDOLL.md §20,DV2 C1):h.mount 欄位、存檔遷移、setMount、騎乘走速、倒地自動下坐騎 ──
{
  // 新獵人沒有坐騎;存檔照帶;舊存檔(沒有 mount 欄位)→ null;不認得的值/boss/倒地 → null;存檔版本不變
  const g = createGame(), h = g.state.hunters[0];
  assert.ok(g.state.hunters.every(x => x.mount === null), 'new hunters start unmounted');
  assert.equal(g.setMount('h-nope', 'boar').ok, false, 'unknown hunter');
  for (const bad of ['boss', 'dragon', 42, {}]) assert.equal(g.setMount(h.id, bad).ok, false, `not rideable: ${bad}`);
  assert.equal(h.mount, null, 'refused setMount leaves the hunter unmounted');
  const r = g.setMount(h.id, 'boar'); assert.ok(r.ok && r.mount === 'boar' && h.mount === 'boar', r.message);
  const save = g.serialize(); assert.equal(save.version, 4, 'save version is v4 (item gear); mount/gender stay additive');
  assert.equal(save.hunters.find(x => x.id === h.id).mount, 'boar', 'mount is saved');
  assert.equal(createGame(save).state.hunters.find(x => x.id === h.id).mount, 'boar', 'mount survives a reload');
  const old = JSON.parse(JSON.stringify(save)); for (const x of old.hunters) delete x.mount;
  assert.ok(createGame(old).state.hunters.every(x => x.mount === null), 'old save without mount → null');
  const v2 = JSON.parse(JSON.stringify(old)); v2.version = 2; for (const x of v2.hunters) { delete x.equipment.chest; x.equipment.armor = true; }
  assert.ok(createGame(v2).state.hunters.every(x => x.mount === null), 'v2 save → null');
  for (const bad of ['boss', 'dragon', 7, null, '']) { const b = JSON.parse(JSON.stringify(save)); b.hunters[0].mount = bad; assert.equal(createGame(b).state.hunters[0].mount, null, `bad saved mount ${JSON.stringify(bad)} → null`); }
  const ko = JSON.parse(JSON.stringify(save)), kh = ko.hunters.find(x => x.id === h.id); kh.hp = 0; kh.mount = 'boar';
  assert.equal(createGame(ko).state.hunters.find(x => x.id === h.id).mount, null, 'a knocked-out hunter loads unmounted');
  assert.ok(g.setMount(h.id, null).ok && h.mount === null, 'setMount(null) dismounts');
  // 倒地中不能騎;倒地(野外)一律下坐騎
  g.setMount(h.id, 'goat'); h.hp = 0; g.tick(0.1);
  assert.equal(h.mount, null, 'KO in the field dismounts'); assert.equal(g.setMount(h.id, 'goat').ok, false, 'cannot mount while down');
  // 地下城/競技場裡倒地也下坐騎
  const g2 = createGame(), d = g2.state.hunters[1]; g2.setMount(d.id, 'ram'); d.task = 'dungeon'; d.hp = 0; g2.tick(0.1);
  assert.equal(d.mount, null, 'KO in the dungeon dismounts');
}
// ── 性別(docs/DV2-PHASE6.md G6;2026-11-15 跟名字走):h.gender 欄位、存檔遷移(加法欄位,版本不變,同 h.mount);
//    名字在 NAME_GENDER 裡 → 名字決定(新獵人、流浪英雄、讀檔都一樣,名字優先);自訂名 → 新的用 id 雜湊、讀檔用存檔值。不擲骰。
{
  const all = Object.keys(NAME_GENDER);
  assert.equal(all.length, 32, 'every name in NAMES has a gender');
  assert.equal(all.filter(n => NAME_GENDER[n] === 'm').length, 16); assert.equal(all.filter(n => NAME_GENDER[n] === 'f').length, 16);
  for (const [n, g] of [['艾登', 'm'], ['莉雅', 'f'], ['伊諾', 'm'], ['阿斯特', 'm'], ['菲歐', 'f'], ['芙蕾雅', 'f'], ['亞倫', 'm'], ['索菲', 'f']]) assert.equal(nameGender(n), g, n);
  assert.equal(nameGender('某人'), null); assert.equal(nameGender(undefined), null); assert.equal(nameGender('toString'), null);
  const g = createGame();
  assert.ok(g.state.hunters.every(x => GENDERS.includes(x.gender)), 'new hunters have m/f');
  assert.ok(g.state.hunters.every(x => x.gender === nameGender(x.name)), 'new hunter gender follows the name');
  assert.ok(g.state.wanderers.length && g.state.wanderers.every(w => w.gender === (nameGender(w.name) ?? hunterGender(w.id))), 'wanderers too');
  assert.equal(hunterGender('h7'), hunterGender('h7')); assert.ok(GENDERS.includes(hunterGender(undefined)));
  const ids = Array.from({ length: 64 }, (_, i) => 'h' + i), fem = ids.filter(i => hunterGender(i) === 'f').length;
  assert.ok(fem > 16 && fem < 48, `id hash (custom names) is roughly half female (${fem}/64)`);
  // the RNG stream is untouched: two fresh games with the same seed stay identical after a run (gender adds no random() call)
  const a = createGame(), b = createGame(); for (let i = 0; i < 60; i++) { a.tick(0.25); b.tick(0.25); }
  assert.deepEqual(a.serialize().hunters.map(x => [x.x, x.z, x.hp]), b.serialize().hunters.map(x => [x.x, x.z, x.hp]));
  // custom name: the saved value survives
  const h = g.state.hunters[0]; h.name = '測試者'; h.gender = 'f';
  const save = g.serialize(); assert.equal(save.version, 4, 'save version is v4 (item gear); mount/gender stay additive');
  assert.equal(save.hunters[0].gender, 'f', 'gender is saved');
  assert.equal(createGame(save).state.hunters[0].gender, 'f', 'custom-name gender survives a reload');
  // known name: the name wins over a wrong saved value (old id-hash genders are corrected on load)
  const wrong = JSON.parse(JSON.stringify(save)); wrong.hunters[1].gender = NAME_GENDER[wrong.hunters[1].name] === 'f' ? 'm' : 'f';
  assert.equal(createGame(wrong).state.hunters[1].gender, nameGender(wrong.hunters[1].name), 'name wins on load');
  const old = JSON.parse(JSON.stringify(save)); for (const x of old.hunters) delete x.gender;
  const oldBack = createGame(old).state.hunters;
  assert.equal(oldBack[0].gender, 'm', 'old save, custom name, no gender → m');
  assert.ok(oldBack.slice(1).every(x => x.gender === nameGender(x.name)), 'old save without gender → gender from the name');
  const v2 = JSON.parse(JSON.stringify(old)); v2.version = 2; for (const x of v2.hunters) { delete x.equipment.chest; x.equipment.armor = true; }
  assert.ok(createGame(v2).state.hunters.every(x => x.gender === (nameGender(x.name) ?? 'm')), 'v2 save → name / m');
  for (const bad of ['F', 'x', 1, null, {}, '']) { const b2 = JSON.parse(JSON.stringify(save)); b2.hunters[0].gender = bad; assert.equal(createGame(b2).state.hunters[0].gender, 'm', `bad saved gender ${JSON.stringify(bad)} → m`); }
  // wanderers: saved without gender → name; custom name keeps its saved value
  const ws = g.serialize(); for (const w of ws.wanderers) delete w.gender; ws.wanderers[0].name = '旅途客'; ws.wanderers[0].gender = 'f';
  const wb = createGame(ws).state.wanderers;
  assert.equal(wb[0].gender, 'f', 'wanderer custom name keeps saved gender');
  assert.ok(wb.slice(1).every(w => w.gender === (nameGender(w.name) ?? hunterGender(w.id))), 'wanderer gender from name on load');
}
// 2026-11-14 修:trainCooldown / lastTownVisit 曾被寫進 h.mount 那行的註解裡,讀檔時沒還原(Phase 5.1 引入)。現在照存檔值還原(有夾範圍)。
{
  const g = createGame(); g.state.time = 500; const h = g.state.hunters[0]; h.trainCooldown = 7.5; h.lastTownVisit = 321;
  const back = createGame(g.serialize()).state.hunters[0];
  assert.equal(back.trainCooldown, 7.5, 'trainCooldown restored from the save'); assert.equal(back.lastTownVisit, 321, 'lastTownVisit restored from the save');
  const bad = g.serialize(); bad.hunters[0].trainCooldown = 99; bad.hunters[0].lastTownVisit = -5;
  const bb = createGame(bad).state.hunters[0]; assert.equal(bb.trainCooldown, 10, 'clamped'); assert.equal(bb.lastTownVisit, 0, 'clamped');
}
{
  // 騎乘走速 = 職業走速 × MOUNT_SPEED_MULT(手動操控:同一個種子、同一段輸入,騎著的走得遠 1.3 倍)
  const dist = mount => {
    const g = createGame(), h = isolate(g); if (mount) assert.ok(g.setMount(h.id, mount).ok);
    g.pilotStart(h.id); g.state.pilot.readyAt = 0; g.state.pilot.lockUntil = 0;
    const x0 = h.x, z0 = h.z; let best = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {   // 挑一個不撞牆的方向:第一個 0.3 秒內有前進的
      h.x = x0; h.z = z0; g.pilotInput(dx, dz); for (let i = 0; i < 3; i++) g.tick(0.1);
      const m = Math.hypot(h.x - x0, h.z - z0); if (m > best) best = m;
    }
    return best;
  };
  const base = dist(null), rode = dist('boar');
  assert.ok(base > 0.2, `pilot moves (${base.toFixed(3)})`);
  assert.ok(Math.abs(rode / base - MOUNT_SPEED_MULT) < 0.02, `mounted pilot speed ×${MOUNT_SPEED_MULT} (${(rode / base).toFixed(3)})`);
  assert.equal(MOUNT_SPEED_MULT, 1.3, 'documented constant (docs/PAPERDOLL.md §20)');
  assert.ok(isRideable('boar') && !isRideable('boss') && !isRideable('wolfman') && Object.keys(ENEMIES).filter(isRideable).length === 6);
}
// ── 裝備物品化併入 5024(2026-11-16,存檔 v4):鐵匠鋪七格 → 物品實例、v2/v3 遷移數值不變、初始套裝不灌水、存讀檔往返 ──
{
  // v3 公式(a8919b0 的 updateStats):六格布林值查 RECIPES、武器 +7,強化只在有武器時生效
  const R = Object.fromEntries(RECIPES.map(r => [r.id, r])), RAR = Object.fromEntries(RARITIES.map(r => [r.id, r.mult]));
  const v3Stats = (h, eqb) => {
    const c = CLASSES.find(x => x.id === h.classId), rar = RAR[h.rarity], reb = 1 + h.rebirths * 0.35;
    let hp = 0, def = 0; for (const s of GEAR_SLOTS) if (eqb[s]) { hp += R[s].hp; def += R[s].def; }
    const wl = eqb.weapon ? h.weaponLevel : 0;
    return { maxHp: Math.round((c.hp + hp) * (1 + (h.level - 1) * 0.075) * rar * reb * (h.trait === 'stout' ? 1.15 : 1)),
      attack: Math.round((c.attack + (eqb.weapon ? 7 : 0)) * (1 + (h.level - 1) * 0.065) * rar * reb * (1 + h.skillLevel * 0.1) * (1 + wl * 0.07) * (h.trait === 'brave' ? 1.1 : 1)),
      defense: c.defense + def + Math.floor(h.level / 8) + h.rebirths * 2 };
  };
  const pick = h => ({ maxHp: h.maxHp, attack: h.attack, defense: h.defense });
  const none = Object.fromEntries(EQUIP_SLOTS.map(s => [s, false]));
  // 鐵匠鋪升級件數值 = RECIPES(單一來源)
  for (const r of RECIPES) { const it = EQUIPMENT['craft_' + r.id]; assert.ok(it && it.slot === r.type && it.tier === 'craft', `craft_${r.id} exists`);
    assert.deepEqual(it.stats, r.type === 'weapon' ? { atk: r.bonus, hp: 0, def: 0 } : { atk: 0, hp: r.hp, def: r.def }, `craft_${r.id} stats = recipe`); }
  // 開局:每位獵人穿職業初始七件套,數值 = v3 沒裝備
  const g = createGame();
  for (const h of g.state.hunters) {
    assert.ok(EQUIP_SLOTS.every(s => h.gear[s] && h.gear[s].itemId === CLASS_STARTER[h.classId][s]), `${h.classId} wears its starter set`);
    assert.deepEqual(pick(h), v3Stats(h, none), `${h.classId} opening stats equal v3 no-gear stats`);
  }
  for (const w of g.state.wanderers) assert.deepEqual(pick(w), v3Stats(w, none), `wanderer ${w.classId} opening stats unchanged`);
  // 七份配方全做 → 獵人回村逐格買下 → 身上七件 craft_*,初始件進倉庫,庫存歸零,uid 不重複
  const f = createGame(), buyer = isolate(f), forge = BUILDINGS.find(b => b.id === 'forge'); f.state.time = 100; Object.assign(buyer, doorStand(forge, forge)); buyer.gold = 2000;
  for (const r of RECIPES) assert.equal(f.craftEquipment(r.id).ok, true, `craft ${r.id}`);
  assert.ok(EQUIP_SLOTS.every(s => f.state.gearStock[s] === 1));
  run(f, 5, true);
  for (const s of EQUIP_SLOTS) { assert.equal(buyer.gear[s].itemId, 'craft_' + s, `bought craft ${s}`); assert.equal(buyer.equipment[s], true); assert.equal(f.state.gearStock[s], 0); }
  assert.deepEqual(f.state.gearStorage.map(x => x.itemId).sort(), Object.values(CLASS_STARTER[buyer.classId]).sort(), 'replaced starter pieces go to the warehouse');
  assert.deepEqual(pick(buyer), v3Stats(buyer, Object.fromEntries(EQUIP_SLOTS.map(s => [s, true]))), 'full craft set = v3 full-gear stats');
  run(f, 5, true); assert.equal(f.state.counts.gearSold, EQUIP_SLOTS.length, 'no double purchase once every slot is craft');
  // 存讀檔往返:物品、倉庫、數值不變,沒有 NaN,uid 唯一
  buyer.weaponLevel = 4; f.unequipGear(buyer.id, 'gloves');
  const save1 = JSON.parse(JSON.stringify(f.serialize())); assert.equal(save1.version, 4);
  const f2 = createGame(save1), b2 = f2.state.hunters.find(h => h.id === buyer.id);
  assert.deepEqual(EQUIP_SLOTS.map(s => b2.gear[s]?.itemId ?? null), EQUIP_SLOTS.map(s => buyer.gear[s]?.itemId ?? null), 'gear survives reload');
  assert.deepEqual(f2.state.gearStorage.map(x => x.itemId), f.state.gearStorage.map(x => x.itemId), 'warehouse survives reload');
  assert.deepEqual(pick(b2), pick(buyer), 'stats survive reload'); assert.equal(b2.weaponLevel, 4);
  const save2 = f2.serialize();
  for (const a of [...save2.hunters, ...save2.wanderers]) for (const k of ['hp', 'maxHp', 'attack', 'defense', 'x', 'z', 'gold', 'weaponLevel']) assert.ok(Number.isFinite(a[k]), `${a.id}.${k} finite after round trip`);
  const uids = [...f2.state.hunters, ...f2.state.wanderers].flatMap(a => EQUIP_SLOTS.map(s => a.gear[s]?.uid).filter(Boolean)).concat(f2.state.gearStorage.map(x => x.uid));
  assert.equal(new Set(uids).size, uids.length, 'gear uids unique across hunters, wanderers and warehouse');
  assert.ok(f2.state.gearSeq >= uids.length);
  // 強化:初始武器不能強化;脫下精鐵武器後強化倍率不生效,穿回來恢復
  f2.state.buildings.enhancement = 1; f2.state.gold = 1e5; f2.state.ore = 1e4;
  g.state.buildings.enhancement = 1; g.state.gold = 1e5; g.state.ore = 1e4; assert.equal(g.enhance(g.state.hunters[0].id).ok, false, 'starter weapon cannot be enhanced');
  const atk4 = b2.attack; f2.unequipGear(b2.id, 'weapon'); assert.ok(b2.attack < atk4 && b2.weaponLevel === 4);
  assert.ok(f2.equipFromStorage(b2.id, f2.state.gearStorage.at(-1).uid).ok); assert.equal(b2.attack, atk4, 'enhancement returns with the craft weapon');
  // v2 存檔(weapon/armor 布林):armor → 六件防具 craft,weapon → craft_weapon;數值 = v3 遷移後的數值
  const asOld = (s, v) => { s.version = v; for (const x of [...s.hunters, ...(s.wanderers || [])]) delete x.gear; delete s.gearStorage; delete s.gearSeq; return s; };
  const v2 = asOld(createGame().serialize(), 2);
  v2.hunters.forEach((h, i) => { h.equipment = i === 0 ? { weapon: true, armor: true } : i === 1 ? { weapon: false, armor: true } : i === 2 ? { weapon: true, armor: false } : { weapon: false, armor: false }; h.weaponLevel = i === 0 ? 3 : 0; });
  v2.wanderers[0].equipment = { weapon: true, armor: true }; v2.gearStock = { weapon: 2, armor: 3 };
  const l2 = createGame(v2);
  l2.state.hunters.forEach((h, i) => {
    const eqb = Object.fromEntries(EQUIP_SLOTS.map(s => [s, s === 'weapon' ? i === 0 || i === 2 : i <= 1]));
    for (const s of EQUIP_SLOTS) assert.equal(h.gear[s].itemId, eqb[s] ? 'craft_' + s : CLASS_STARTER[h.classId][s], `v2 hunter ${i} ${s}`);
    assert.deepEqual(pick(h), v3Stats(h, eqb), `v2 hunter ${i} stats equal the v3 migration`);
  });
  assert.equal(l2.state.hunters[0].weaponLevel, 3);
  const w0 = l2.state.wanderers[0]; assert.ok(EQUIP_SLOTS.every(s => w0.gear[s].itemId === 'craft_' + s), 'v2 wanderer armor/weapon → craft items');
  assert.deepEqual(l2.state.gearStock, { weapon: 2, helm: 0, chest: 3, belt: 0, legs: 0, boots: 0, gloves: 0 }, 'v2 stock: armor → chest');
  assert.deepEqual(l2.state.gearStorage, [], 'v2 save starts with an empty warehouse');
  // v3 存檔(六格布林 + 每格庫存)
  const v3 = asOld(createGame().serialize(), 3);
  const mix = { weapon: true, helm: true, chest: false, belt: true, legs: false, boots: false, gloves: true };
  v3.hunters[0].equipment = { ...mix }; v3.hunters[0].weaponLevel = 2; v3.hunters[1].equipment = { ...none }; v3.hunters[1].weaponLevel = 5;
  v3.wanderers[1].equipment = { ...none, chest: true }; v3.gearStock = { weapon: 1, helm: 2, chest: 3, belt: 4, legs: 5, boots: 6, gloves: 7 };
  const l3 = createGame(v3), h30 = l3.state.hunters[0], h31 = l3.state.hunters[1];
  for (const s of EQUIP_SLOTS) assert.equal(h30.gear[s].itemId, mix[s] ? 'craft_' + s : CLASS_STARTER[h30.classId][s], `v3 ${s}`);
  assert.deepEqual(h30.equipment, mix); assert.deepEqual(pick(h30), v3Stats(h30, mix), 'v3 mixed slots: stats unchanged');
  assert.equal(h31.weaponLevel, 0, 'v3: no weapon → weaponLevel 0 (as before)'); assert.deepEqual(pick(h31), v3Stats(h31, none));
  assert.equal(l3.state.wanderers[1].gear.chest.itemId, 'craft_chest', 'v3 wanderer chest → craft_chest');
  assert.deepEqual(l3.state.gearStock, v3.gearStock, 'v3 per-slot stock kept');
  // v1 / 未知版本照舊拒絕
  for (const v of [1, 5, '4', undefined]) { const bad = createGame().serialize(); bad.version = v; bad.gold = 7; assert.equal(createGame(bad).state.gold, 1500, `version ${String(v)} rejected`); }
}
console.log(`PASS: ${CLASSES.length} hunters / ${CLASSES.length} classes, seeded visitors, conservation of personal and village gold, paid and emergency services, bounded trading, crafting and gear purchases, upgrades, training, skills, rebirth, difficulty gates, hunting, field boss, death/revival, dungeon combat and save continuation, NPC arena, navigation, malformed saves, pause, deterministic simulation, all 8 quests. Natural 60s: ${combat.state.totalKills} total kills; ${combat.state.counts.services} services.`);

