import { vdir4, dirSuffix, leftRow, rows4, fromScreen, toScreen, quantize4, quantize4Stable, facingOk, screenAngle, DIR4_CENTER_DEG, QUADRANT_OFFSET_DEG, FACING_HYSTERESIS_DEG } from './src/dir4.js';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createGame, OFFLINE, ENEMIES, MOUNT_SPEED_MULT, isRideable, hunterGender, GENDERS, nameGender, NAME_GENDER } from './src/pixel-game.js';
import { doorStand, buildingSolid } from './src/landscape-layout.js';
import { blockCenter } from './src/village-grid.js';
import { BUILDINGS, CLASSES, MATERIALS, MERCHANT, PROMOTE, PRODUCTS, RECIPES, RARITIES, PILOT_ATTACK, AI_ATTACK_LOCK, KITE, GEAR_TIER_MAX, gearAt, EQUIPMENT, CLASS_STARTER, EQUIP_SLOTS, GEAR_SLOTS, gearItemView, dungeonGearGrade, GEAR_DROP } from './src/pixel-data.js';
import { regionCenter, regionContains, walkable, RING_ROAD, onRingRoad, inVillage, randomRegionPoint } from './src/overworld.js';
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
const MATERIAL_KEYS_T = Object.keys(MATERIALS);
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
{ // 2026-11-17 持續收購:成交後收購量不扣(一直維持設定量);一般收購照舊買滿就停;金幣永遠不會變負
  const g = createGame(), h = isolate(g); g.state.time = 100; Object.assign(h, marketDoor); h.inventory.ore = 30;
  assert.deepEqual(Object.values(g.state.tradeStanding), MATERIAL_KEYS_T.map(() => false), 'new villages start with standing orders off');
  assert.equal(g.setTradeStanding('ore', 'yes').ok, false); assert.equal(g.setTradeStanding('__proto__', true).ok, false);
  assert.equal(g.setTradeRequest('ore', 10).ok, true); assert.equal(g.setTradeStanding('ore', true).ok, true); const money0 = totalMoney(g), ore0 = g.state.ore;
  // 背包 ≥14 份且收購還開著 → 獵人賣完一輪會再去交易所;持續收購每輪都補回 10 份,直到背包剩 10(<14)才停
  run(g, 6, true); assert.equal(h.inventory.ore, 10); assert.equal(g.state.ore, ore0 + 20); assert.equal(g.state.tradeRequests.ore, 10, 'standing order refills after each trade');
  assert.equal(g.state.counts.traded, 20); assert.equal(totalMoney(g), money0, 'trading only moves gold between village and hunter');
  assert.equal(g.setTradeStanding('ore', false).ok, true); h.inventory.ore = 30; run(g, 6, true);
  assert.equal(g.state.tradeRequests.ore, 0, 'turned off → runs down again'); assert.equal(h.inventory.ore, 20);
  // 金庫保留額:持續收購只花「金庫 − 保留額」。保留額 = 500 + 500×(大廳−1);金庫比保留額多 7 → 只買 2 份(單價 3),停在保留額＋1,不再往下買
  const p = createGame(), s = isolate(p); p.state.time = 100; const R = p.tradeReserve(); assert.equal(R, 500, 'hall Lv.1 keeps 500 gold');
  p.state.buildings.hall = 3; assert.equal(p.tradeReserve(), 1500); p.state.buildings.hall = 5; assert.equal(p.tradeReserve(), 2500); p.state.buildings.hall = 1;
  p.state.gold = R + 7; Object.assign(s, marketDoor); s.inventory.ore = 50;
  p.setTradeRequest('ore', 999); p.setTradeStanding('ore', true); run(p, 10, true, st => assert.ok(st.gold >= R, `standing never dips below the reserve (${st.gold})`));
  assert.equal(p.state.gold, R + 1); assert.equal(s.inventory.ore, 48); assert.equal(p.state.tradeRequests.ore, 999); assertFiniteEconomy(p.state);
  // 金庫剛好在保留額:持續收購完全不買,獵人也不會因為「可以交易」而跑去交易所(tradeAvailable 同一條規則)
  const q = createGame(), t = isolate(q); q.state.time = 100; q.state.gold = q.tradeReserve(); Object.assign(t, marketDoor); t.inventory.ore = 50;
  q.setTradeRequest('ore', 999); q.setTradeStanding('ore', true); run(q, 6, true);
  assert.equal(q.state.gold, q.tradeReserve()); assert.equal(t.inventory.ore, 50); assert.equal(q.state.counts.traded, 0);
  // 一般委託不受保留額影響:同樣只剩保留額的金庫,關掉持續收購 → 照舊買(可花到 0 以上,不會變負)
  const u = createGame(), v = isolate(u); u.state.time = 100; u.state.gold = u.tradeReserve(); Object.assign(v, marketDoor); v.inventory.ore = 50;
  u.setTradeRequest('ore', 200); run(u, 4, true, st => assert.ok(st.gold >= 0));
  assert.equal(u.state.counts.traded, 50, 'one-off orders still buy below the reserve'); assert.equal(u.state.gold, u.tradeReserve() - 150); assertFiniteEconomy(u.state);
  // 存檔:持續收購會存下來;舊存檔(沒有這個欄位)載入後全部關閉;亂值只認 true
  const saved = g.serialize(); saved.tradeStanding.wood = true; const re = createGame(saved); assert.equal(re.state.tradeStanding.wood, true); assert.equal(re.state.tradeStanding.ore, false);
  const old = g.serialize(); delete old.tradeStanding; old.tradeRequests.ore = 25; const legacy = createGame(old);
  assert.ok(MATERIAL_KEYS_T.every(k => legacy.state.tradeStanding[k] === false), 'old saves load with standing off'); assert.equal(legacy.state.tradeRequests.ore, 25);
  const junk = createGame({ ...g.serialize(), tradeStanding: { ore: 'true', wood: 1, herb: true, __proto__: { cloth: true } } });
  assert.equal(junk.state.tradeStanding.ore, false); assert.equal(junk.state.tradeStanding.wood, false); assert.equal(junk.state.tradeStanding.herb, true); assert.equal(junk.state.tradeStanding.cloth, false);
  assert.equal(createGame({ ...g.serialize(), tradeStanding: 'x' }).state.tradeStanding.ore, false);
}
{ // 離線外推 × 收購:一般委託買滿就停(不照速率無上限地乘);持續收購照速率外推,但以村莊金幣為上限,金幣不變負
  const g = createGame(), h = isolate(g); g.state.time = 100; g.state.wanderers = []; Object.assign(h, marketDoor); h.inventory.ore = 20;
  for (const k of MATERIAL_KEYS_T) g.state.tradeRequests[k] = 0; g.setTradeRequest('ore', 10);
  const snap = g.offlineSnapshot(); g.simulate(OFFLINE.sample); assert.equal(g.state.tradeRequests.ore, 0); assert.equal(g.state.counts.traded - snap.counts.traded, 10);
  g.offlineFinish(snap, 3 * 3600); assert.equal(g.state.counts.traded - snap.counts.traded, 10, 'finished one-shot order is not extrapolated');
  assert.equal(g.state.tradeRequests.ore, 0); assertFiniteEconomy(g.state);
  // 持續收購:取樣期買 200 份(600 金)後金庫還比保留額多 300 → 外推最多再花 300 金,停在保留額(不是 0)
  const s = createGame(), b = isolate(s); s.state.time = 100; s.state.wanderers = []; Object.assign(b, marketDoor); b.inventory.ore = 200; const R = s.tradeReserve(); s.state.gold = R + 900;
  for (const k of MATERIAL_KEYS_T) s.state.tradeRequests[k] = 0; s.setTradeRequest('ore', 200); s.setTradeStanding('ore', true);
  const sn = s.offlineSnapshot(); s.simulate(OFFLINE.sample); assert.equal(s.state.counts.traded - sn.counts.traded, 200);
  s.offlineFinish(sn, 3 * 3600); const extra = s.state.counts.traded - sn.counts.traded - 200;
  // (外推期間獵人付給村莊的服務費也進金庫,所以能多買的不只 300 金;重點是最後停在保留額)
  assert.ok(extra > 0, 'standing order keeps buying offline'); assert.ok(extra < 200 * (3 * 3600 / OFFLINE.sample - 1), `capped by village gold (${extra})`);
  assert.ok(s.state.gold >= R && s.state.gold < R + MATERIALS.ore.price, `village spends down to the reserve, not to 0 (${s.state.gold})`);
  assert.equal(s.state.tradeRequests.ore, 200); assertFiniteEconomy(s.state);
  // 一般委託離線不受保留額影響:取樣期買 20 份後金庫已低於保留額,外推照樣把剩下的 40 份買完,金幣不變負
  const o = createGame(), c = isolate(o); o.state.time = 100; o.state.wanderers = []; Object.assign(c, marketDoor); c.inventory.ore = 20; o.state.gold = 200;
  for (const k of MATERIAL_KEYS_T) o.state.tradeRequests[k] = 0; o.setTradeRequest('ore', 60);
  const on = o.offlineSnapshot(); o.simulate(OFFLINE.sample); assert.equal(o.state.counts.traded - on.counts.traded, 20); assert.ok(o.state.gold < o.tradeReserve());
  o.offlineFinish(on, 3 * 3600); assert.equal(o.state.counts.traded - on.counts.traded, 60, 'one-off order finishes offline below the reserve');
  assert.equal(o.state.tradeRequests.ore, 0); assertFiniteEconomy(o.state);
  // 一般＋持續同時開:離線先結一般委託(可花到保留額以下),持續收購只花保留額以上的部分 → 一般委託把金庫花到保留額以下後,持續收購外推 0 份
  const m = createGame(), d = isolate(m); m.state.time = 100; m.state.wanderers = []; Object.assign(d, marketDoor); d.inventory.ore = 40; d.inventory.wood = 40; m.state.gold = m.tradeReserve() + 300;
  for (const k of MATERIAL_KEYS_T) m.state.tradeRequests[k] = 0; m.setTradeRequest('ore', 999); m.setTradeRequest('wood', 200); m.setTradeStanding('ore', true);
  // 取樣期用安靜模式(不刷魔物 → 沒有野外收入),外推時金庫只受收購影響,結果可精確預期
  //   (2026-11-18 取樣拉長到 240 秒後獵人會在取樣期肚子餓去吃飯 → 商品庫存清空,只能用免費的基本服務,金庫才不會多出服務費)
  for (const k of Object.keys(m.state.stocks)) m.state.stocks[k] = 0;
  const mn = m.offlineSnapshot(), ore0 = m.state.ore; run(m, OFFLINE.sample, true); const oreS = m.state.ore - ore0, woodLeft = m.state.tradeRequests.wood, tradedS = m.state.counts.traded - mn.counts.traded;
  assert.equal(oreS, 40); assert.ok(woodLeft > 0 && woodLeft <= 160); assert.ok(m.state.gold >= m.tradeReserve() && m.state.gold < m.tradeReserve() + 2 * woodLeft, `sample leaves gold just above the reserve (${m.state.gold})`);
  m.offlineFinish(mn, 3 * 3600); assert.equal(m.state.tradeRequests.wood, 0, 'one-off wood order completes offline'); assert.equal(m.state.tradeRequests.ore, 999);
  assert.ok(m.state.gold >= 0 && m.state.gold < m.tradeReserve(), `one-off spent into the reserve, never negative (${m.state.gold})`);
  assert.equal(m.state.counts.traded - mn.counts.traded, tradedS + woodLeft, 'no standing ore extrapolated once gold is below the reserve'); assertFiniteEconomy(m.state);
}
{ // 2026-11-17 倒楣的取樣:大廳 5 級(保留額 2500)、金庫 1500 多 → 取樣期金庫一直低於保留額,持續收購 0 份成交;
  // 但外推期間的收入會把金庫推過保留額 → 照「取樣期撿到的材料」估收購量,花到保留額為止(以前整整 8 小時 0 份材料、金庫堆到 14 萬)
  // A/B/C 是同一個(確定性)村莊:B 外推前把收購量歸 0(不買),C 收購量改成每趟 1 份(每趟上限)
  // 2026-11-18:離線服務收入以庫存為上限 → 這裡備足庫存(玩家離線前做了大量商品),外推期間才有持續的服務收入;
  //   取樣拉長到 240 秒 → 金庫從 500 起算,取樣期才不會被服務費推過保留額
  const make = () => { const g = createGame(); g.state.buildings.hall = 5; for (const h of g.state.hunters) h.huntRegion = 'meadow'; for (const k of MATERIAL_KEYS_T) g.state.tradeStanding[k] = true; run(g, 20);
    for (const k of Object.keys(g.state.stocks)) g.state.stocks[k] = 1e5; g.state.gold = 500; const snap = g.offlineSnapshot(); g.simulate(OFFLINE.sample); return { g, snap }; };
  const money = g => g.state.gold + g.state.hunters.reduce((n, h) => n + h.gold, 0) + (g.state.wanderers || []).reduce((n, w) => n + w.gold, 0);
  const mats = g => MATERIAL_KEYS_T.reduce((n, k) => n + g.state[k], 0), traded = x => x.g.state.counts.traded - x.snap.counts.traded;
  const A = make(), B = make(), C = make();
  assert.equal(money(A.g), money(B.g), 'same deterministic sample'); assert.equal(mats(A.g), mats(B.g));
  assert.equal(traded(A), 0, 'unlucky sample: no standing trade at all'); assert.ok(A.g.state.gold < A.g.tradeReserve(), `sample stays below the reserve (${A.g.state.gold})`);
  for (const k of MATERIAL_KEYS_T) { B.g.state.tradeRequests[k] = 0; C.g.state.tradeRequests[k] = 1; }
  for (const x of [A, B, C]) x.g.offlineFinish(x.snap, OFFLINE.max);
  assert.equal(traded(B), 0); assert.ok(B.g.state.gold > 20 * B.g.tradeReserve(), `offline income lifts gold far above the reserve (${B.g.state.gold})`);
  const bought = traded(A), priceSum = MATERIAL_KEYS_T.reduce((n, k) => n + MATERIALS[k].price, 0);
  assert.ok(bought > 10000, `standing orders buy materials over 8 h offline (${bought})`);
  assert.equal(mats(A.g) - mats(B.g), bought, 'every bought unit lands in the village');
  assert.equal(money(A.g), money(B.g), 'buying only moves gold from the village to the sellers (no gold from nothing)');
  assert.ok(A.g.state.gold >= A.g.tradeReserve() && A.g.state.gold < A.g.tradeReserve() + priceSum, `spends down to the reserve, never below (${A.g.state.gold})`);
  assert.ok(traded(C) > 0 && traded(C) < bought, `request size caps what one return trip can sell (${traded(C)} < ${bought})`);
  assert.ok(C.g.state.gold > C.g.tradeReserve() + priceSum, 'a small request leaves gold unspent');
  for (const x of [A, B, C]) assertFiniteEconomy(x.g.state);
  // 沒有交易所:撿到再多也沒人收購
  const D = make(); D.g.state.buildings.trading = 0; D.g.offlineFinish(D.snap, OFFLINE.max); assert.equal(traded(D), 0, 'no trading post, no offline purchases');
}

const gear = createGame(), buyer = isolate(gear),forge=BUILDINGS.find(b=>b.id==='forge'); gear.state.autoJunk = 'off'; gear.state.time = 100; Object.assign(buyer, doorStand(forge,forge)); buyer.gold = 1000;   // 金幣守恆測試:autoJunk off → 換下的舊件進倉庫(自動賣出會另外多出售價)
const gearIds = RECIPES.map(r => r.id);
for (const id of gearIds) assert.equal(gear.craftEquipment(id).ok, true, `craft ${id}`);
const gearMoney = totalMoney(gear), attackBefore = buyer.attack, hpBefore = buyer.maxHp; run(gear, 5, true);
assert.ok(gearIds.every(id => buyer.equipment[id] === true), 'auto-buy buys every missing slot'); assert.ok(gearIds.every(id => gear.state.gearStock[id][1] === 0));
assert.ok(gearIds.every(id => gear.gearTierOf(buyer, id) === 1), 'forge Lv.1 gear is tier Ⅰ');
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
  const restocked = createGame(stock); assert.equal(restocked.state.gearStock.chest[1], 2); assert.equal(restocked.state.gearStock.weapon[1], 0); assert.equal(restocked.state.gearStock.armor, undefined);
  assert.ok(restocked.state.gearStock.chest[2] === 0 && restocked.gearStockOf('chest') === 2);
  assert.ok(EQUIP_SLOTS.every(s => re.gearTierOf(rh, s) === 1), 'v2 armor:true → all six armour slots + weapon at tier Ⅰ');
}
// 測試用:把一件鐵匠鋪升級件(指定階級)放進倉庫再穿上(走正式的 equipFromStorage,身上原本那件會進倉庫)
let wearSeq = 0;
function wear(g, h, slot, grade = 1) {
  const uid = 'gt' + (++wearSeq); g.state.gearStorage.push({ uid, itemId: 'craft_' + slot, ...(grade > 1 ? { grade } : {}) });
  assert.equal(g.equipFromStorage(h.id, uid).ok, true, `wear craft_${slot} ${grade}`);
}
{ // 2026-11-16 裝備階級:舊 v3 存檔(布林裝備、數字庫存、沒有 gearTier)載入不掉裝備也不變強;新格式來回存讀不變
  const asOld = (s, v) => { s.version = v; for (const x of [...s.hunters, ...(s.wanderers || [])]) delete x.gear; delete s.gearStorage; delete s.gearSeq; return s; };
  const old = asOld(createGame().serialize(), 3), none = Object.fromEntries(EQUIP_SLOTS.map(s => [s, false]));
  old.hunters[0].equipment = { ...none, weapon: true, chest: true, boots: true };
  old.gearStock = { weapon: 3, helm: 0, chest: 1, belt: 0, legs: 0, boots: 0, gloves: 2 };
  // 「改版前」的數值:同一位獵人,裝備只有布林、舊公式(武器 +7、防具 RECIPES 第 1 階)
  const re = createGame(old), rh = re.state.hunters[0], c = CLASSES.find(k => k.id === rh.classId);
  const legacyHp = c.hp + RECIPES.find(r => r.id === 'chest').hp + RECIPES.find(r => r.id === 'boots').hp;
  assert.deepEqual(rh.equipment, { weapon: true, helm: false, chest: true, belt: false, legs: false, boots: true, gloves: false }, 'boolean equipment survives');
  assert.deepEqual(EQUIP_SLOTS.map(s => re.gearTierOf(rh, s)), [1, 0, 1, 0, 0, 1, 0], 'owned slots load as tier Ⅰ, empty (starter) as 0');
  assert.ok(EQUIP_SLOTS.every(s => !('grade' in rh.gear[s])), 'tier Ⅰ / starter instances keep the plain v4 shape {uid,itemId}');
  assert.equal(re.state.gearStock.weapon[1], 3); assert.equal(re.state.gearStock.gloves[1], 2); assert.equal(re.state.gearStock.chest[1], 1);
  assert.ok(Object.values(re.state.gearStock).every(st => [2, 3, 4, 5].every(t => st[t] === 0)), 'legacy numeric stock is tier Ⅰ only');
  const rar = RARITIES.find(x => x.id === rh.rarity).mult; assert.equal(rh.rebirths + rh.skillLevel + rh.weaponLevel, 0);
  assert.equal(rh.attack, Math.round((c.attack + 7) * (1 + (rh.level - 1) * 0.065) * rar * (rh.trait === 'brave' ? 1.1 : 1)), 'tier Ⅰ weapon = the old +7');
  assert.equal(rh.maxHp, Math.round(legacyHp * (1 + (rh.level - 1) * 0.075) * rar * (rh.trait === 'stout' ? 1.15 : 1)), 'tier Ⅰ armour = old hp formula');
  // 2026-11-16 階級版 v3 存檔(equipment 布林 + h.gearTier):升級件照存的階級發
  const tiered = JSON.parse(JSON.stringify(old)); tiered.hunters[0].gearTier = { weapon: 3, helm: 0, chest: 2, belt: 0, legs: 0, boots: 5, gloves: 0 };
  const gt = createGame(tiered), th = gt.state.hunters[0];
  assert.deepEqual(EQUIP_SLOTS.map(s => gt.gearTierOf(th, s)), [3, 0, 2, 0, 0, 5, 0], 'v3 gearTier → craft item grades');
  assert.equal(th.gear.chest.grade, 2); assert.ok(th.maxHp > rh.maxHp && th.attack > rh.attack);
  // 數字階級的防呆(若別的分支把 equipment 存成數字):3 → 擁有、第 3 階,而 equipment 仍是布林
  const num = JSON.parse(JSON.stringify(old)); num.hunters[0].equipment = { weapon: 3, chest: 0, helm: true };
  const gn = createGame(num), rn = gn.state.hunters[0]; assert.equal(rn.equipment.weapon, true); assert.equal(gn.gearTierOf(rn, 'weapon'), 3); assert.equal(rn.equipment.chest, false); assert.equal(gn.gearTierOf(rn, 'helm'), 1);
  // 新格式來回:階級、各階庫存、倉庫裡升級件的階級都保留
  rh.gear.chest.grade = 4; re.state.gearStock.legs[3] = 2; re.state.gearStorage.push({ uid: 'gx9', itemId: 'craft_helm', grade: 5 }, { uid: 'gx10', itemId: 'archer_bow', grade: 3 });
  const round = createGame(re.serialize()), rr = round.state.hunters[0];
  assert.equal(round.gearTierOf(rr, 'chest'), 4); assert.equal(round.state.gearStock.legs[3], 2);
  assert.ok(rr.maxHp > rh.maxHp, 'tier Ⅳ chest reloads with its bonus');
  assert.equal(round.state.gearStorage.find(x => x.itemId === 'craft_helm').grade, 5, 'stored craft grade survives reload');
  assert.ok(!('grade' in round.state.gearStorage.find(x => x.itemId === 'archer_bow')), 'starter items never carry a grade');
  // 壞資料:階級超界夾到 1..5、庫存負數/非數字歸零
  const bad = JSON.parse(JSON.stringify(old)); bad.hunters[0].gearTier = { weapon: 99, chest: -4 }; bad.gearStock = { weapon: { 1: -3, 2: 'x', 5: 7 }, chest: 'zz' };
  const rb = createGame(bad), bh = rb.state.hunters[0]; assert.equal(rb.gearTierOf(bh, 'weapon'), GEAR_TIER_MAX); assert.equal(rb.gearTierOf(bh, 'chest'), 1);
  assert.deepEqual(rb.state.gearStock.weapon, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 7 }); assert.equal(rb.gearStockOf('chest'), 0);
  const badV4 = re.serialize(); badV4.hunters[0].gear.chest.grade = 99; badV4.hunters[0].gear.helm = { uid: 'g1', itemId: 'craft_helm', grade: 'x' };
  const rv = createGame(badV4), vh = rv.state.hunters[0]; assert.equal(rv.gearTierOf(vh, 'chest'), GEAR_TIER_MAX); assert.equal(rv.gearTierOf(vh, 'helm'), 1);
}
{ // 階級物品資料(gearItemView):第 1 階 = EQUIPMENT 原值;高階照 gearAt;售價/分解照 craft 公式(材料價值 × 0.8、材料一半進位)
  for (const r of RECIPES) {
    const base = EQUIPMENT['craft_' + r.id], v1 = gearItemView({ itemId: base.id });
    assert.deepEqual([v1.stats, v1.sell, v1.salvage, v1.name, v1.grade], [base.stats, base.sell, base.salvage, base.name, 1], `${base.id} tier Ⅰ unchanged`);
    for (let t = 2; t <= GEAR_TIER_MAX; t++) {
      const v = gearItemView({ itemId: base.id, grade: t }), a = gearAt(r.id, t), value = Object.entries(a.cost).reduce((n, [k, q]) => n + q * MATERIALS[k].price, 0);
      assert.deepEqual(v.stats, r.type === 'weapon' ? { atk: a.bonus, hp: 0, def: 0 } : { atk: 0, hp: a.hp, def: a.def }, `${base.id} tier ${t} stats`);
      assert.equal(v.sell, Math.round(value * 0.8)); assert.deepEqual(v.salvage, Object.fromEntries(Object.entries(a.cost).map(([k, q]) => [k, Math.ceil(q / 2)])));
      assert.ok(v.sell < a.price, 'selling never beats the forge price'); assert.equal(v.name, `${base.name} ${a.numeral}`);
    }
  }
  assert.equal(gearItemView({ itemId: 'archer_bow', grade: 4 }), EQUIPMENT.archer_bow, 'starter items ignore grade');
  assert.deepEqual([1, 10, 11, 20, 21, 41, 99].map(dungeonGearGrade), [1, 1, 2, 2, 3, 5, 5]);
  // 倉庫裡的高階件出售 = 該階售價
  const g = createGame(); g.state.gearStorage.push({ uid: 'gs1', itemId: 'craft_chest', grade: 3 }); const v0 = g.state.gold;
  assert.equal(g.sellStoredGear('gs1').ok, true); assert.equal(g.state.gold - v0, gearItemView({ itemId: 'craft_chest', grade: 3 }).sell);
}
{ // 鍛造階級跟著鐵匠鋪等級:Lv.N 最多第 N 階;不給 tier = 最高階;材料照階級倍率
  const g = createGame(); Object.assign(g.state, { ore: 9999, wood: 9999, leather: 9999, cloth: 9999 });
  assert.equal(g.forgeTier(), 1); assert.equal(g.craftEquipment('chest', 2).ok, false, 'forge Lv.1 cannot make tier Ⅱ');
  assert.equal(g.craftEquipment('chest', 0).ok, false); assert.equal(g.craftEquipment('chest', 1.5).ok, false);
  g.state.buildings.forge = 3; assert.equal(g.forgeTier(), 3);
  const ore0 = g.state.ore; assert.equal(g.craftEquipment('chest').ok, true); assert.equal(g.state.gearStock.chest[3], 1, 'default craft = best tier');
  assert.equal(ore0 - g.state.ore, gearAt('chest', 3).cost.ore); assert.ok(gearAt('chest', 3).cost.ore > RECIPES.find(r => r.id === 'chest').cost.ore);
  assert.equal(g.craftEquipment('chest', 4).ok, false, 'forge Lv.3 cannot make tier Ⅳ'); assert.equal(g.craftEquipment('helm', 1).ok, true); assert.equal(g.state.gearStock.helm[1], 1);
  g.state.buildings.forge = 5; assert.equal(g.forgeTier(), GEAR_TIER_MAX); assert.equal(g.craftEquipment('weapon', 6).ok, false);
  for (let t = 2; t <= GEAR_TIER_MAX; t++) { const a = gearAt('chest', t - 1), b = gearAt('chest', t); assert.ok(b.price > a.price && b.hp > a.hp && b.def >= a.def, `tier ${t} beats tier ${t - 1}`); }
  assert.equal(gearAt('weapon', 1).bonus, 7); assert.equal(gearAt('chest', 1).price, 140); assert.equal(gearAt('chest', 2).name, '胸甲 Ⅱ');
}
{ // 換更高階:獵人付錢給村莊(總金幣守恆)、身上換成高階(舊件進倉庫)、低階不重買;留 40 金付吃住;沒有更高階就不買
  const g = createGame(), h = isolate(g), forge = BUILDINGS.find(b => b.id === 'forge'); g.state.time = 100; g.state.buildings.forge = 3; g.state.autoJunk = 'off';
  Object.assign(g.state, { ore: 9999, wood: 9999, leather: 9999, cloth: 9999 });
  wear(g, h, 'chest', 1); wear(g, h, 'weapon', 3); const oldChest = h.gear.chest.uid;
  assert.equal(g.craftEquipment('chest', 1).ok, true); assert.equal(g.craftEquipment('chest', 3).ok, true); assert.equal(g.craftEquipment('weapon', 2).ok, true);
  const price = gearAt('chest', 3).price; h.gold = price + 40 + 5; Object.assign(h, doorStand(forge, forge));
  const money = totalMoney(g), village = g.state.gold, hp0 = h.maxHp, def0 = h.defense, sold0 = g.state.counts.gearSold;
  run(g, 5, true);
  assert.equal(g.gearTierOf(h, 'chest'), 3, 'hunter upgrades chest Ⅰ → Ⅲ'); assert.equal(h.gold, 45); assert.equal(g.state.gold, village + price, 'village receives the upgrade price');
  assert.equal(totalMoney(g), money); assert.equal(g.state.counts.gearUpgrades, 1); assert.equal(g.state.counts.gearIncome, price); assert.equal(g.state.counts.gearSold, sold0 + 1);
  assert.ok(h.maxHp > hp0 && h.defense > def0, 'stats rise with the tier');
  assert.ok(g.state.gearStorage.some(x => x.uid === oldChest), 'the replaced tier Ⅰ chest goes to the warehouse');
  assert.equal(g.state.gearStock.chest[3], 0); assert.equal(g.state.gearStock.chest[1], 1, 'lower tier is not bought when already owned');
  assert.equal(g.state.gearStock.weapon[2], 1, 'tier Ⅱ weapon is not a downgrade for a tier Ⅲ owner'); assert.equal(g.gearTierOf(h, 'weapon'), 3);
  // 留錢:剛好付得起但會吃光生活費 → 不換
  const g2 = createGame(), h2 = isolate(g2); g2.state.time = 100; g2.state.buildings.forge = 2; Object.assign(g2.state, { ore: 999, leather: 999 });
  wear(g2, h2, 'chest', 1); assert.equal(g2.craftEquipment('chest').ok, true);
  h2.gold = gearAt('chest', 2).price + 39; Object.assign(h2, doorStand(forge, forge)); const v2 = g2.state.gold; run(g2, 5, true);
  assert.equal(g2.gearTierOf(h2, 'chest'), 1, 'upgrade keeps a 40-gold reserve'); assert.equal(g2.state.gold, v2);
}
{ // 2026-11-17 自動整理:換下的舊階裝備直接賣出/分解,不進倉庫;目前最高階不會被自動處理;存檔只認 sell/salvage
  const forge = BUILDINGS.find(b => b.id === 'forge');
  const setup = mode => { const g = createGame(), h = isolate(g); g.state.time = 100; g.state.buildings.forge = 3; Object.assign(g.state, { ore: 9999, wood: 9999, leather: 9999, cloth: 9999 });
    wear(g, h, 'chest', 1); assert.equal(g.craftEquipment('chest', 3).ok, true); h.gold = gearAt('chest', 3).price + 45; Object.assign(h, doorStand(forge, forge));
    assert.equal(g.setAutoJunk(mode).ok, true); return { g, h, old: h.gear.chest.uid }; };
  assert.equal(createGame().state.autoJunk, 'sell', 'new game: sell (2026-11-18: 30 天倉庫約 400 件 → 約 100 件)'); { const old = createGame().serialize(); delete old.autoJunk; assert.equal(createGame(old).state.autoJunk, 'off', 'old save without the field keeps off'); } assert.equal(createGame().setAutoJunk('burn').ok, false);
  { const { g, h, old } = setup('sell'), v = g.state.gold; run(g, 5, true);
    assert.equal(g.gearTierOf(h, 'chest'), 3, 'auto-sell: hunter still upgrades');
    assert.ok(!g.state.gearStorage.some(x => x.uid === old), 'auto-sell: replaced chest skips the warehouse');
    assert.equal(g.state.gold, v + gearAt('chest', 3).price + gearItemView({ itemId: 'craft_chest', grade: 1 }).sell, 'village gets price + sell value'); assert.equal(g.state.counts.autoJunk, 1); }
  { const { g, old } = setup('salvage'), leather = g.state.leather; run(g, 5, true);
    assert.ok(!g.state.gearStorage.some(x => x.uid === old)); assert.ok(g.state.leather > leather || Object.keys(gearItemView({ itemId: 'craft_chest', grade: 1 }).salvage || {}).length === 0, 'auto-salvage returns materials'); }
  { const { g, old } = setup('off'); run(g, 5, true); assert.ok(g.state.gearStorage.some(x => x.uid === old), 'off: warehouse as before'); }
  const sv = createGame().serialize(); sv.autoJunk = 'salvage'; assert.equal(createGame(sv).state.autoJunk, 'salvage', 'save keeps salvage');
  sv.autoJunk = 'nuke'; assert.equal(createGame(sv).state.autoJunk, 'off', 'unknown value → off');
}
{ // 離線外推:取樣期買的裝備是一次性的(庫存離線不補),不乘倍率;村莊＋獵人金幣仍守恆
  const g = createGame(), h = isolate(g), forge = BUILDINGS.find(b => b.id === 'forge'); g.state.time = 100; g.state.buildings.forge = 2;
  Object.assign(g.state, { ore: 999, leather: 999 }); wear(g, h, 'chest', 1); assert.equal(g.craftEquipment('chest').ok, true);
  // 賣礦 → 取樣期非裝備的錢包流量為正。2026-11-17 起收購另外外推(一般委託買滿就停)→ 這裡用持續收購＋村莊金幣充足,讓收購照速率外推
  h.gold = 2000; h.inventory.ore = 200; g.state.tradeRequests.ore = 200; g.state.tradeStanding.ore = true; g.state.gold = 1e6; Object.assign(h, doorStand(forge, forge)); g.state.wanderers = [];
  // 2026-11-18:商品庫存清空 → 獵人只用免費的基本服務,錢包的外推只剩打怪收入＋收購款,下面可以精確對帳
  for (const key of Object.keys(g.state.stocks)) g.state.stocks[key] = 0;
  const snap = g.offlineSnapshot(), v0 = g.state.gold; g.simulate(OFFLINE.sample);
  assert.equal(g.gearTierOf(h, 'chest'), 2, 'bought the upgrade during the sample'); const price = gearAt('chest', 2).price;
  assert.equal(h.inventory.ore, 0, 'sold all ore in the sample'); const tradeIn = 200 * MATERIALS.ore.price;
  const flowHunter = h.gold - 2000 + price; assert.ok(flowHunter >= tradeIn);   // 錢包在取樣期「除了裝備以外」的變化(收購款＋打怪)
  const w1 = h.gold, hg1 = g.state.counts.hunterGold || 0, tg1 = g.state.counts.tradeGold || 0;
  g.offlineFinish(snap, 3 * 3600); const k = 3 * 3600 / OFFLINE.sample - 1;
  // 外推期錢包只多「打怪金幣(hunterGold)＋收購款(tradeGold)」;要是裝備價格也照倍率扣,錢包會少 price × k
  const want = w1 + ((g.state.counts.hunterGold || 0) - hg1) + ((g.state.counts.tradeGold || 0) - tg1);
  assert.ok(Math.abs(h.gold - want) <= 2, `gear purchase is not extrapolated (wallet ${h.gold}, want ${want})`); assert.ok(h.gold > w1 + tradeIn, 'standing order keeps paying the seller');
  assert.equal(g.state.counts.gearSold, snap.counts.gearSold + 1); assert.equal(g.state.counts.gearIncome, snap.counts.gearIncome + price);
  assert.ok(g.state.gold >= 0 && Number.isFinite(g.state.gold)); assert.ok(g.state.gold < v0 + price * (k + 1), 'village does not collect the gear price for every extrapolated slice');
}
assert.equal(gear.enhance(buyer.id).ok, false); assert.equal(gear.construct('enhancement').ok, true); assert.equal(gear.enhance(buyer.id).ok, true); assert.equal(buyer.weaponLevel, 1);
assert.equal(gear.learnSkill(buyer.id).ok, false); gear.state.ore += 100; assert.equal(gear.construct('academy').ok, true); assert.equal(gear.learnSkill(buyer.id).ok, true);
assert.equal(gear.train(buyer.id).ok, false); gear.state.gold += 1000; assert.equal(gear.construct('training').ok, true);
// 2026-11-17 修煉重訂:學費 20＋等級×10(個人金幣→村莊,總金幣守恆)、1 級份經驗、冷卻 30 秒;修煉地 Lv.5 = 2 級份;錢不夠就不能練
buyer.gold = 0; assert.equal(gear.train(buyer.id).ok, false, 'cannot train without the fee');
const tq = gear.trainQuote(buyer.id); assert.equal(tq.cost, 20 + buyer.level * 10); buyer.gold = tq.cost + 5;
const trainLevel = buyer.level, trainingMoney = totalMoney(gear), village0 = gear.state.gold; assert.equal(gear.train(buyer.id).ok, true); assert.equal(buyer.level, trainLevel + 1, 'one level per session');
assert.equal(buyer.gold, 5); assert.equal(gear.state.gold, village0 + tq.cost, 'fee goes to the village'); assert.equal(totalMoney(gear), trainingMoney); buyer.gold = 9999; assert.equal(gear.train(buyer.id).ok, false, 'cooldown');
run(gear, 10.2, true); assert.equal(gear.train(buyer.id).ok, false, 'still cooling down after 10 s'); run(gear, 20.2, true);
gear.state.buildings.training = 5; const lv5 = buyer.level; assert.equal(gear.train(buyer.id).ok, true); assert.equal(buyer.level, lv5 + 2, 'training ground Lv.5 gives two levels');
assert.equal(gear.reincarnate(buyer.id).ok, false); buyer.level = 100; const originalRebirth = buyer.rebirths; assert.equal(gear.reincarnate(buyer.id).ok, true); assert.equal(buyer.level, 1); assert.equal(buyer.rebirths, originalRebirth + 1);
assert.equal(gear.setDifficulty(1).ok, true); assert.equal(gear.setDifficulty(4).ok, false); assert.equal(gear.setDifficulty('1').ok, false);

const buildings = createGame(); buildings.state.gold = buildings.state.wood = buildings.state.ore = 100000;
assert.equal(buildings.upgrade('forge').ok, true); assert.deepEqual(buildings.getUpgradeCost('forge'), { gold: 462, wood: 53, ore: 63 });
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
{ // 2026-11-18 生態區特產 + 村莊缺料偏好:缺木材時,有些獵人改去「輕鬆」的木材區;絕不為了缺料去可行/危險的區;去的人多了加分就消失
  const g = createGame(), s = g.state;
  // 生態區特產:橡木密林每隻魔物平均掉的木材明顯比鐵脊山麓多,山麓還是鐵礦最多的區(地圖詳情的 loot 直接從 ENEMIES 算)
  const loot = id => g.regionInfo(id).loot;
  assert.ok(loot('forest').wood >= 2 * loot('mountain').wood, `forest out-produces mountain on wood (${loot('forest').wood} vs ${loot('mountain').wood})`);
  assert.ok(loot('birch').wood > loot('mountain').wood, 'birch out-produces mountain on wood too');
  assert.ok(['meadow', 'forest', 'taiga', 'snow', 'desert', 'birch'].every(id => (loot(id).ore || 0) < loot('mountain').ore), 'mountain stays the ore region');
  const [h, ...others] = s.hunters;
  for (const o of others) { o.huntRegion = null; o.autoHunt = false; }
  for (const w of s.wanderers) w.huntRegion = null;   // 開局流浪英雄有 4 位在森林(容量 2.5);這段只測缺料偏好,先拿掉狩獵區容量的影響(容量另測,見下一段)
  const fill = () => { for (const k of Object.keys(s.tradeRequests)) { s.tradeRequests[k] = 60; s[k] = 500; } };
  Object.assign(h, { level: 60, attack: 100, defense: 50 });   // 每一區都「輕鬆」
  fill(); assert.deepEqual(g.villageNeed(), {}, 'no shortage while every stock is above its trade request');
  assert.equal(g.autoHuntPick(h.id), 'mountain', 'without a shortage a strong hunter still takes the riskiest easy region');
  s.wood = 0; assert.equal(g.villageNeed().wood, 1, 'wood at 0 against a request of 60 = full need');
  const seed = s.seed; assert.equal(g.autoHuntPick(h.id), 'forest', 'wood shortage sends a hunter to the wood region when it is easy for him');
  assert.equal(s.seed, seed, 'picking a region rolls no dice (deterministic, RNG untouched)');
  assert.equal(g.regionInfo('forest').fit([h.id]).verdict, 'easy');
  others[0].huntRegion = 'forest';   // 已經有人在森林了 → 加分變小,下一位照常去山麓
  assert.equal(g.autoHuntPick(h.id), 'mountain', 'the bonus falls off once another hunter already covers the wood region');
  others[0].huntRegion = null;
  s.tradeRequests.wood = 0; assert.equal(g.autoHuntPick(h.id), 'mountain', 'no trade request for wood = the village is not asking for it');
  s.tradeRequests.wood = 60; s.buildings.trading = 0; assert.deepEqual(g.villageNeed(), {}, 'no trading post = no shortage signal'); s.buildings.trading = 1;
  // 森林只是「可行」、草原才「輕鬆」:缺木材也不能去森林
  Object.assign(h, { level: 4, attack: 10, defense: 4 });
  assert.equal(g.regionInfo('forest').fit([h.id]).verdict, 'ok'); assert.equal(g.regionInfo('meadow').fit([h.id]).verdict, 'easy');
  assert.equal(g.autoHuntPick(h.id), 'meadow', 'a shortage never sends a hunter to a non-easy region while an easy one exists');
  // 掃一遍各種強度:有輕鬆的區就一定挑輕鬆的(缺什麼都一樣)
  for (const k of Object.keys(s.tradeRequests)) s[k] = 0;
  for (let lv = 1; lv <= 100; lv += 3) for (const def of [0, 2, 4, 6, 9, 14, 20, 30]) {
    Object.assign(h, { level: lv, attack: 8 + lv, defense: def });
    const anyEasy = ['meadow', 'forest', 'taiga', 'snow', 'mountain', 'desert', 'birch'].some(id => g.regionInfo(id).fit([h.id]).verdict === 'easy');
    const pick = g.autoHuntPick(h.id);
    if (anyEasy) assert.equal(g.regionInfo(pick).fit([h.id]).verdict, 'easy', `lv${lv} def${def} picked ${pick}`);
  }
}
{ // 2026-11-18 狩獵區容量(HUNT_ROOM):很多強獵人一個接一個出門 → 分散到各「輕鬆」區,不會一區擠爆而另一個輕鬆區空著;
  // 擠也不去非輕鬆的區;流浪英雄算人數、地下城裡的不算;不擲骰、同樣的局面挑出同樣的區
  const REG = ['meadow', 'forest', 'taiga', 'snow', 'mountain', 'desert', 'birch'];
  const setup = (n = 24) => {
    const g = createGame(), s = g.state;
    for (const w of s.wanderers) w.huntRegion = null;
    for (const k of Object.keys(s.tradeRequests)) s.tradeRequests[k] = 0;   // 沒有缺料偏好,只看容量
    const base = s.hunters[0];
    for (let i = s.hunters.length; i < n; i++) s.hunters.push({ ...structuredClone(base), id: 'h-room-' + i });
    for (const h of s.hunters) Object.assign(h, { level: 60, attack: 100, defense: 50, hp: h.maxHp, huntRegion: null, autoHunt: false, task: null });
    return g;
  };
  const departAll = g => g.state.hunters.map(h => { const r = g.autoHuntPick(h.id); h.huntRegion = r; h.autoHunt = true; return r; });
  { const g = setup();
    assert.equal(g.huntRoom('meadow'), 8, 'home region (2.5 s per spawn) feeds 8 hunters'); assert.equal(g.huntRoom('mountain'), 2.5, 'other regions (8 s per spawn) feed 2.5');
    assert.equal(g.huntRoom('village'), 0);
    assert.equal(g.setRegionDensity('mountain', 3).ok, true); assert.equal(g.huntRoom('mountain'), 20 / 6, 'denser sign = more room'); g.setRegionDensity('mountain', 2);
    assert.ok(g.state.hunters.every(h => REG.every(id => g.regionInfo(id).fit([h.id]).verdict === 'easy')), 'setup: every region is easy for everyone');
    const seed = g.state.seed, picks = departAll(g);
    assert.equal(g.state.seed, seed, 'picking regions rolls no dice');
    assert.equal(picks[0], 'mountain', 'the first hunter still takes the riskiest easy region');
    const count = Object.fromEntries(REG.map(id => [id, picks.filter(p => p === id).length]));
    assert.ok(REG.every(id => count[id] >= 1), `24 strong hunters cover every easy region ${JSON.stringify(count)}`);
    for (const id of REG) assert.ok(count[id] <= Math.ceil(g.huntRoom(id)) + 1, `${id}: ${count[id]} hunters vs room ${g.huntRoom(id)}`);
    assert.ok(count.mountain < 6, `mountain no longer takes everyone (${count.mountain}/24)`);
    // 有空位時仍照危險度:前 6 位各去一個非主狩獵區,由危險往安全排
    assert.deepEqual(picks.slice(0, 3), ['mountain', 'mountain', 'snow'], 'room left in the riskiest region is used before moving down');
    // 決定性:同樣的局面再跑一次,挑法完全一樣
    assert.deepEqual(departAll(setup()), picks, 'same situation → same picks');
  }
  { // 擠滿也只在輕鬆的區之間換:弱獵人只有草原輕鬆,草原已擠到 3 倍容量也照去
    const g = setup(), s = g.state, [weak, ...rest] = s.hunters;
    for (const o of rest) o.huntRegion = 'meadow';
    Object.assign(weak, { level: 4, attack: 10, defense: 4 });
    assert.equal(g.regionInfo('meadow').fit([weak.id]).verdict, 'easy'); assert.notEqual(g.regionInfo('forest').fit([weak.id]).verdict, 'easy');
    assert.equal(g.autoHuntPick(weak.id), 'meadow', 'a crowded easy region still beats an empty non-easy one');
    // 掃一遍各種強度:每區都塞滿人,挑出來的一定是輕鬆的區
    for (const [i, o] of rest.entries()) o.huntRegion = REG[i % REG.length];
    for (let lv = 1; lv <= 100; lv += 3) for (const def of [0, 2, 4, 6, 9, 14, 20, 30]) {
      Object.assign(weak, { level: lv, attack: 8 + lv, defense: def });
      const anyEasy = REG.some(id => g.regionInfo(id).fit([weak.id]).verdict === 'easy'), pick = g.autoHuntPick(weak.id);
      if (anyEasy) assert.equal(g.regionInfo(pick).fit([weak.id]).verdict, 'easy', `crowded lv${lv} def${def} picked ${pick}`);
    }
  }
  { // 誰算「已在區內」:流浪英雄算(也在吃那區的魔物),地下城裡的獵人不算
    const g = setup(8), s = g.state, [h, ...rest] = s.hunters;
    assert.equal(g.autoHuntPick(h.id), 'mountain');
    for (const w of s.wanderers.slice(0, 3)) w.huntRegion = 'mountain';
    assert.notEqual(g.autoHuntPick(h.id), 'mountain', '3 wanderers already fill the mountain (room 2.5)');
    for (const w of s.wanderers) w.huntRegion = null;
    for (const o of rest.slice(0, 4)) Object.assign(o, { huntRegion: 'mountain', task: 'dungeon' });
    assert.equal(g.autoHuntPick(h.id), 'mountain', 'hunters away in the dungeon do not crowd a field region');
  }
}
{ // 2026-11-17 野外存活:看情勢撤退、返村走環路、趕路時不離開環路去追自己區的魔物
  const foe = (type, x, z, attack, regionId) => ({ id: 'e-t-' + type + x.toFixed(2), type, x, z, hp: 999, maxHp: 999, attack, attackTimer: 9, age: 0, regionId, homeX: x, homeZ: z });
  const field = (hpFrac, foes) => {
    const g = createGame(), h = isolate(g), c = regionCenter('meadow');
    g.state.spawnTimer = 0; g.state.regionSpawn = {};
    Object.assign(h, { x: c.x, z: c.z, inTown: false, huntRegion: 'meadow', autoHunt: false, status: '出征中', targetId: null, lastTownVisit: 0 });
    h.hp = Math.round(h.maxHp * hpFrac); g.state.enemies = foes(c); g.tick(0.1); return { g, h };
  };
  const pack = c => [foe('boulder', c.x + 1.2, c.z, 80, 'meadow'), foe('goat', c.x - 1.2, c.z, 80, 'meadow')];
  { const { h } = field(0.6, pack); assert.equal(h.task, 'service', 'a hurt hunter (60%, above the old 28% line) surrounded by a deadly pack heads home'); assert.equal(h.status, '返村中'); }
  { const { h } = field(0.9, pack); assert.equal(h.task, null, 'a healthy hunter (above the town-heal line) stays to fight'); }
  { const { h } = field(0.6, c => [foe('mole', c.x + 1.2, c.z, 3, 'meadow')]); assert.equal(h.task, null, 'a weak monster does not scare a 60% hunter home'); }
  { const { h } = field(0.6, () => []); assert.equal(h.task, null, 'no monsters around → keeps hunting'); }
  // 返村路線:從各區隨機位置回村,離開出發區之後走環村道路(或村裡/村口那一小段),不直線穿過別的狩獵區。
  // 舊版(直線走向門口)在草原/霜杉/雪原邊上會切過隔壁區 10+ 格(平均 2.2 格/趟,最多 14.5 格)。
  let seed = 7, offSum = 0, offMax = 0, trips = 0; const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
  for (const rid of ['meadow', 'forest', 'taiga', 'snow', 'mountain', 'desert', 'birch']) for (let k = 0; k < 12; k++) {
    const g = createGame(), h = isolate(g), c = randomRegionPoint(rid, rnd);
    Object.assign(h, { x: c.x, z: c.z, inTown: false, huntRegion: rid, status: '出征中' }); h.hp = Math.round(h.maxHp * 0.2); g.state.enemies = [];
    g.tick(0.1); assert.equal(h.status, '返村中', `${rid}: badly hurt hunter returns`); assert.ok(h.route.length > 0, `${rid}: has a route home`);
    let off = 0, prev = { x: h.x, z: h.z };
    for (const p of h.route) { const n = Math.ceil(Math.hypot(p.x - prev.x, p.z - prev.z) / 0.25); for (let i = 1; i <= n; i++) { const x = prev.x + (p.x - prev.x) * i / n, z = prev.z + (p.z - prev.z) * i / n; if (!inVillage(x, z) && !regionContains(rid, x, z) && !onRingRoad(x, z, 0.5)) off += Math.hypot(p.x - prev.x, p.z - prev.z) / n; } prev = p; }
    offSum += off; offMax = Math.max(offMax, off); trips++;
  }
  // 出征路線(ringWaypoints):以前把環路「截斷」在 12 點,往草原/白樺花原會在半路離開環路、直線切過鐵脊山麓等別區 27–29 格
  for (const rid of ['meadow', 'forest', 'taiga', 'snow', 'mountain', 'desert', 'birch']) {
    const g = createGame(), h = g.state.hunters[0]; assert.equal(g.dispatchHunters(rid, [h.id]).ok, true);
    let off = 0, prev = { x: h.x, z: h.z };
    for (const p of h.route) { const n = Math.ceil(Math.hypot(p.x - prev.x, p.z - prev.z) / 0.25); for (let i = 1; i <= n; i++) { const x = prev.x + (p.x - prev.x) * i / n, z = prev.z + (p.z - prev.z) * i / n; if (!inVillage(x, z) && !regionContains(rid, x, z) && !onRingRoad(x, z, 0.5)) off += Math.hypot(p.x - prev.x, p.z - prev.z) / n; } prev = p; }
    assert.ok(off < 4, `departing to ${rid} follows the ring road instead of cutting across other regions (${off.toFixed(1)} tiles off-road)`);
  }
  assert.ok(offSum / trips < 1.5 && offMax < 8,`the way home stays on the ring road outside the start region (avg ${(offSum / trips).toFixed(2)}, max ${offMax.toFixed(1)} tiles off-road)`);
  // 趕路經過別區(站在環路上)時,不離開環路去追 SIGHT 內自己區的魔物;進了自己的區才開打
  let spot = null;
  for (const p of RING_ROAD) {
    if (!regionContains('mountain', p.x, p.z)) continue;
    for (let a = 0; a < 24 && !spot; a++) for (const r of [6, 8, 10]) { const q = { x: p.x + Math.cos(a * Math.PI / 12) * r, z: p.z + Math.sin(a * Math.PI / 12) * r }; if (regionContains('meadow', q.x, q.z) && !onRingRoad(q.x, q.z, 1) && walkable(q.x, q.z)) { spot = { p, q }; break; } }
    if (spot) break;
  }
  assert.ok(spot, 'found a ring-road spot in the mountain sector with meadow ground in sight');
  { const g = createGame(), h = isolate(g); g.state.spawnTimer = 0; g.state.regionSpawn = {};
    Object.assign(h, { x: spot.p.x, z: spot.p.z, inTown: false, huntRegion: 'meadow', status: '前往向陽草原', targetId: null });
    g.state.enemies = [foe('mole', spot.q.x, spot.q.z, 3, 'meadow')]; g.tick(0.1);
    assert.equal(h.targetId, null, 'a hunter passing another region on the ring road does not cut across it to chase a meadow monster'); }
  { const g = createGame(), h = isolate(g), c = regionCenter('meadow'); g.state.spawnTimer = 0; g.state.regionSpawn = {};
    Object.assign(h, { x: c.x, z: c.z, inTown: false, huntRegion: 'meadow', status: '搜尋中', targetId: null });
    g.state.enemies = [foe('mole', c.x + 7, c.z, 3, 'meadow')]; g.tick(0.1);
    assert.equal(h.targetId, g.state.enemies[0]?.id ?? 'gone', 'inside its own region the hunter still goes after monsters it sees'); }
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
  assert.equal(ri.room, Math.round(info.huntRoom('snow') * 10) / 10, 'Region detail shows hunting capacity'); assert.ok(ri.room > 0 && Number.isInteger(ri.wanderersHere));
  const fit = ri.fit([]);
  assert.ok(fit && ['easy', 'ok', 'hard'].includes(fit.verdict) && fit.threat > 0 && fit.comfort > 0, 'Squad fit compares comfort against regional threat');
  const weakest = info.regionInfo('meadow'), strongest = info.regionInfo('mountain');
  assert.ok(Math.max(...strongest.monsters.map(m => m.attack)) > Math.max(...weakest.monsters.map(m => m.attack)), 'Mountain hits harder than the meadow');
  assert.ok(strongest.riskStars > weakest.riskStars, 'Danger stars follow region risk');
  for (const [x, w] of [[strongest, strongest.risk], [weakest, 1]]) for (const mo of x.monsters) assert.equal(mo.goldNow, Math.round(mo.gold * w), x.id + ' shown gold/xp include region risk (difficulty 0)');
  assert.equal(fit.threat, Math.round(Math.max(...ri.monsters.map(m => m.attack)) * ri.risk), 'Threat is the hardest monster times the regional multiplier');
}
const dead = createGame(), fallen = isolate(dead); fallen.hp = 0; run(dead, 0.2, true); assert.equal(fallen.status, '復活中'); assert.equal(dead.state.counts.deaths, 1); run(dead, 10, true); assert.ok(fallen.hp > 0 && fallen.reviveTimer === 0);

const dungeon = createGame(); assert.equal(dungeon.startDungeon().ok, false); assert.equal(dungeon.construct('dungeon').ok, true);
assert.equal(dungeon.startDungeon(['x', 'y', 'z']).ok, false); assert.equal(dungeon.startDungeon([dungeon.state.hunters[0].id, dungeon.state.hunters[0].id, dungeon.state.hunters[0].id]).ok, false);
assert.equal(dungeon.startDungeon().ok, true); assert.equal(dungeon.startDungeon().ok, false); const partyIds = [...dungeon.state.dungeon.hunterIds];
assert.equal(dungeon.startArena(partyIds).ok, false); run(dungeon, 60, false, assertFiniteEconomy);
assert.equal(dungeon.state.dungeon.active, false); assert.equal(dungeon.state.dungeon.bestFloor, 1); assert.equal(dungeon.state.dungeon.floor, 2); assert.equal(dungeon.state.counts.dungeonWins, 1);
assert.ok(dungeon.state.dungeon.reward.gold > 0); assert.ok(partyIds.every(hid => dungeon.state.hunters.find(h => h.id === hid).task !== 'dungeon'));
// 存讀檔測的是「打到一半存檔、讀回來接著打完」:小隊加厚血量,免得開局 Lv.1 前排挨到致命一擊 → 緊急撤退(2026-11-17)把這層打掉
const dungeonSave = createGame(); dungeonSave.construct('dungeon'); dungeonSave.startDungeon(); for (const h of dungeonSave.state.hunters.filter(h => dungeonSave.state.dungeon.hunterIds.includes(h.id))) { h.maxHp = h.hp = 2000; } run(dungeonSave, 8);
const resumedDungeon = createGame(dungeonSave.serialize()); assert.equal(resumedDungeon.state.dungeon.active, true); run(resumedDungeon, 65); assert.equal(resumedDungeon.state.dungeon.bestFloor, 1);
const losingDungeon = createGame(); losingDungeon.construct('dungeon'); losingDungeon.startDungeon();
for (const h of losingDungeon.state.hunters.filter(h => losingDungeon.state.dungeon.hunterIds.includes(h.id))) h.hp = 0;
run(losingDungeon, 0.2); assert.equal(losingDungeon.state.dungeon.active, false); assert.equal(losingDungeon.state.dungeon.bestFloor, 0); run(losingDungeon, 9); assert.ok(losingDungeon.state.hunters.every(h => h.hp > 0));

const arena = createGame(); assert.equal(arena.startArena().ok, false); assert.equal(arena.construct('training').ok, true); assert.equal(arena.startArena().ok, true);
assert.equal(arena.startDungeon(arena.state.arena.hunterIds).ok, false); run(arena, 45, false, assertFiniteEconomy); assert.equal(arena.state.arena.active, false); assert.equal(arena.state.arena.wins, 1); assert.equal(arena.state.arena.opponent, '暮林訓練隊');

{ // 2026-11-17 地下城結束方式(結算視窗用):撤退 ≠ 倒下
  const g = createGame(), st = g.state; g.construct('dungeon');
  for (const h of st.hunters) { h.hp = h.maxHp; h.satiety = h.mood = h.stamina = 100; }
  assert.equal(g.startDungeon().ok, true); assert.equal(g.retreatDungeon().ok, true);
  assert.equal(st.dungeon.endKind, 'retreat'); assert.equal(st.dungeon.active, false);
}
{ // 2026-11-17 多的材料半價賣給行商:單價 = 收購價 × 0.5,低於收購價(不會買賣套利)
  const g = createGame(), st = g.state; st.flour = 300; const gold0 = st.gold;
  const r = g.sellMaterial('flour', 50); assert.equal(r.ok, true);
  assert.equal(st.flour, 250); assert.equal(st.gold - gold0, Math.floor(50 * MATERIALS.flour.price * 0.5));
  assert.ok(MATERIALS.flour.price * 0.5 < MATERIALS.flour.price, 'sell below buy price');
  assert.equal(g.sellMaterial('flour', 999).ok, true); assert.equal(st.flour, 0, 'sells at most what is in stock');
  assert.equal(g.sellMaterial('flour', 10).ok, false, 'nothing left to sell');
  assert.equal(g.sellMaterial('nope', 10).ok, false);
  st.buildings.trading = 0; st.herb = 500; assert.equal(g.sellMaterial('herb', 50).ok, false, 'needs a trading post');
}
{ // 2026-11-18 每天換一位訪客(輪流換一格,其他兩格不動)
  const g = createGame(), st = g.state; st.enemies = []; const before = st.visitors.map(v => v.id), day0 = st.day;
  while (st.day === day0) { st.enemies = []; st.spawnTimer = 0; g.tick(0.1); }
  const after = st.visitors.map(v => v.id), changed = after.filter((id, i) => id !== before[i]).length;
  assert.equal(after.length, 3); assert.equal(changed, 1, 'exactly one visitor slot changes on a new day'); assert.notEqual(after[st.day % 3], before[st.day % 3]);
}
{ // 2026-11-18 晉升:村莊金幣＋星晶把稀有度升一階,能力跟著變,傳說就封頂
  const g = createGame(), st = g.state, h = st.hunters[0]; h.rarity = 'normal'; st.gold = 50000; st.gems = 300;
  const atk0 = h.attack, q = g.promoteQuote(h.id); assert.equal(q.next, 'rare');
  assert.equal(g.promoteHunter(h.id).ok, true); assert.equal(h.rarity, 'rare'); assert.equal(st.gold, 50000 - q.gold); assert.equal(st.gems, 300 - q.gems);
  assert.ok(h.attack >= atk0, 'stats go up');
  st.gems = 0; assert.equal(g.promoteHunter(h.id).ok, false, 'needs gems too'); assert.equal(h.rarity, 'rare');
  h.rarity = 'legendary'; assert.equal(g.promoteQuote(h.id).max, true); assert.equal(g.promoteHunter(h.id).ok, false, 'legendary is the top');
  const k = st.hunters[1]; k.rarity = 'normal'; st.gems = 300; k.hp = 0; assert.equal(g.promoteHunter(k.id).ok, false, 'not while down');
  const saved = createGame(g.serialize()); assert.equal(saved.state.hunters[0].rarity, 'legendary', 'rarity survives save');
}
{ // 2026-11-18 後期金幣出口:交易所 Lv.5 起向行商買星晶(10 顆一組),金幣不夠或交易所等級不夠都拒絕
  const g = createGame(), st = g.state, lot = MERCHANT.gemLot, cost = lot * MERCHANT.gemPrice; st.gold = cost * 2; const gems0 = st.gems;
  st.buildings.trading = MERCHANT.gemTrading - 1; assert.equal(g.buyGems().ok, false, 'needs trading Lv.5'); assert.equal(st.gems, gems0);
  st.buildings.trading = MERCHANT.gemTrading; assert.equal(g.buyGems().ok, true); assert.equal(st.gems, gems0 + lot); assert.equal(st.gold, cost);
  st.gold = cost - 1; assert.equal(g.buyGems().ok, false, 'not enough gold'); assert.equal(st.gold, cost - 1); assert.equal(st.gems, gems0 + lot);
  assert.ok(MERCHANT.gemPrice > PROMOTE.superior.gold / PROMOTE.superior.gems * 3, 'buying gems stays much pricier than earning them');
}
{ // 2026-11-17 地下城仇恨照最大生命加權:近戰輸出(刺客)跟聖騎士一起站前排時,不再一半打擊落在薄皮刺客身上而提早撤退
  const runDg = mid => { const base = createGame(); base.construct('dungeon'); const raw = base.serialize(), src = raw.hunters;
    raw.hunters = ['paladin', mid, 'priest'].map((c, i) => ({ ...JSON.parse(JSON.stringify(src.find(x => x.classId === c))), id: 'd' + i, level: 30, xp: 0 }));
    const g = createGame(raw), st = g.state; for (const h of st.hunters) { h.hp = h.maxHp; h.satiety = h.mood = h.stamina = 100; }
    g.setDungeonAuto(true); assert.equal(g.startDungeon(st.hunters.map(h => h.id), 1).ok, true);
    for (let t = 0; t < 3600 && st.dungeon.active; t += 0.1) { st.enemies = []; st.spawnTimer = 0; g.tick(0.1); }
    assert.equal(st.counts.deaths, 0, mid + ' team: nobody dies'); return st.dungeon.bestFloor; };
  const ranged = runDg('archer'), melee = runDg('assassin');
  assert.ok(melee >= ranged - 1, `melee DPS keeps up with ranged at Lv.30 (assassin ${melee} vs archer ${ranged})`);
}
{ // 2026-11-17 競技場天梯:前 40 勝對手公式不變;之後對手繼續變強(生命 ×1.08、攻擊 ×1.05 每勝),獎勵封頂 → 不會永遠穩贏最高獎勵
  const g = createGame(), a = g.state.arena, foe = w => { a.wins = w; return g.arenaFoe(); };
  assert.deepEqual(foe(0), { hp: 720, atk: 21 }); assert.deepEqual(foe(40), { hp: 720 + 40 * 130, atk: 21 + 40 * 3 }, 'first 40 wins unchanged');
  assert.equal(foe(41).hp, Math.round(5920 * 1.08)); assert.ok(foe(60).hp > foe(40).hp * 4 && foe(60).atk > foe(40).atk * 2.5, 'opponent keeps growing past 40 wins');
  assert.equal(g.construct('training').ok, true); a.wins = 50; assert.equal(g.startArena().ok, true); assert.equal(a.enemyMaxHp, g.arenaFoe().hp, 'match uses the same formula');
}
{ // 2026-11-18 競技場整備時間(docs/BALANCE.md「競技場整備時間」):整備 25 → 120 秒,首領討伐中不能開賽
  //   原本一有空就開賽 → 野外最強三人整天在競技場與村子之間來回,野外打不死首領,討伐一再逾時,全村第 7 天擊倒 88(不打 437)
  const g = createGame(), s = g.state, a = s.arena; g.construct('training');
  assert.equal(g.startArena().ok, true); const party = [...a.hunterIds];
  run(g, 45, false, assertFiniteEconomy); assert.equal(a.active, false); assert.equal(a.wins, 1);
  assert.ok(a.cooldown > 120 - 45 && a.cooldown <= 120, `cooldown after a match is 120 s (left ${a.cooldown})`);
  assert.ok(party.every(id => s.hunters.find(h => h.id === id).task !== 'arena'), 'the party is released after the match');
  { // 模擬戰的傷不帶出場:輸了(全員被打倒)也是回滿生命,不算死亡
    const L = createGame(), la = L.state.arena; L.construct('training'); assert.equal(L.startArena().ok, true);
    const lp = L.state.hunters.filter(h => la.hunterIds.includes(h.id)); for (const h of lp) h.hp = 1;
    la.wins = 39; la.enemyMaxHp = la.enemyHp = 1e9; const deaths0 = L.state.counts.deaths;   // 打不贏的對手
    for (let i = 0; i < 1300 && la.active; i++) L.tick(0.1);   // 停在剛打完那一刻(之後他們會出門打怪、可能又受傷)
    assert.equal(la.active, false); assert.equal(la.losses, 1);
    assert.ok(lp.every(h => h.hp === h.maxHp && h.task !== 'arena' && h.task !== 'revive'), 'arena losers come back at full HP'); assert.equal(L.state.counts.deaths, deaths0, 'arena knock-outs are not deaths');
  }
  const busy = g.startArena(); assert.equal(busy.ok, false); assert.match(busy.message, /整備/);
  // 存檔:整備時間照存、超過上限夾到 120;舊存檔(最多 25 秒)照原值
  assert.equal(createGame({ ...g.serialize(), arena: { ...g.serialize().arena, cooldown: 25 } }).state.arena.cooldown, 25, 'legacy 25 s cooldown loads as is');
  assert.equal(createGame({ ...g.serialize(), arena: { ...g.serialize().arena, cooldown: 9999 } }).state.arena.cooldown, 120, 'cooldown clamps to 120');
  assert.ok(Math.abs(createGame(g.serialize()).state.arena.cooldown - a.cooldown) < 1e-9, 'cooldown round-trips');
  a.cooldown = 0; s.expedition.cooldown = 0;
  assert.equal(g.expedition().ok, true); assert.equal(s.expedition.active, true);
  const blocked = g.startArena(); assert.equal(blocked.ok, false, 'no arena match during a boss expedition'); assert.match(blocked.message, /討伐/);
  assert.equal(a.active, false); assert.ok(s.hunters.every(h => h.task !== 'arena'), 'a refused start pulls nobody');
  s.enemies = s.enemies.filter(e => e.type !== 'boss'); run(g, 1);   // 首領消失 → 討伐結束(逾時同一條路)
  assert.equal(s.expedition.active, false); assert.equal(g.startArena().ok, true, 'arena opens again once the expedition ends');
  // 反過來:對戰進行中仍然可以召喚首領(場外的人去打,對戰完的三人回村後再加入)
  s.expedition.cooldown = 0; assert.equal(g.expedition().ok, true, 'boss can still be summoned while a match runs');
}

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
quests.state.bossKills = 1; assert.equal(quests.claimQuest().ok, true); quests.state.counts.dungeonWins = 1; assert.equal(quests.claimQuest().ok, true);
// ── 中期委託(2026-11-16):第 7 章之後插入 10 章;後期委託(2026-11-18)再插 4 章;最後一章仍是轉世 ──
const questChain = quests.questList(), LAST_Q = questChain.length - 1;
assert.equal(quests.specialtyRegion('wood')?.id, 'forest'); assert.equal(quests.specialtyRegion('ore')?.id, 'mountain'); assert.equal(quests.specialtyRegion('nope'), null);   // 交易所缺料提示用的特產區
{ const pq = createGame(); pq.state.hunters[0].level = 999; const pl = pq.questList(), i80 = pl.findIndex(q => q.title === '百戰的先鋒'); assert.equal(pl[i80].progress, 80, 'Later chapters report live progress capped at the target'); assert.ok(pl.every(q => q.progress >= 0 && q.progress <= q.target)); }
assert.equal(questChain.length, 22); assert.equal(LAST_Q, 21);
// 2026-11-18 後期委託(QUEST_REVISION 3):「傳奇的前夜」與轉世之間插入 4 章,轉世仍是最後一章
assert.deepEqual(questChain.slice(16).map(q => q.title), ['傳奇的前夜', '深淵之下', '百戰的先鋒', '無底的地城', '百級前的最後一哩', '下一段獵魔人生']);
assert.deepEqual(questChain.slice(17, LAST_Q).map(q => q.target), [32, 80, 38, 90]);
for (let i = 17; i < LAST_Q; i++) {   // 後期獎勵介於第 17 章與最終章之間
  for (const key of ['gold', 'wood', 'gems']) assert.ok(questChain[i].reward[key] >= questChain[16].reward[key] && questChain[i].reward[key] <= questChain[LAST_Q].reward[key], `late chapter ${i + 1} ${key}`);
  assert.ok(questChain[i].description.length > 0);
}
assert.equal(createGame().state.quest.complete, false);   // 第 1 章(招募 1 位旅人)開局不會直接完成
assert.deepEqual(questChain.slice(0, 7).map(q => q.title), ['迎接新的獵人', '餐廳的第一爐麵包', '建立戰利品循環', '鐵匠爐火', '獵人的新武器', '討伐森林領主', '地下城的門後']);
assert.equal(questChain[LAST_Q].title, '下一段獵魔人生'); assert.match(questChain[LAST_Q].description, /Lv\.100/);
assert.equal(new Set(questChain.map(q => q.title)).size, questChain.length);   // 章名不重複
assert.ok(questChain.slice(7, LAST_Q).filter(q => q.reward.wood > 0).length >= 5);   // 中期獎勵多給木材
for (let i = 8; i < LAST_Q; i++) assert.ok(questChain[i].reward.gold >= questChain[i - 1].reward.gold);   // 金幣獎勵逐章遞增
assert.ok(questChain[LAST_Q].reward.gold >= questChain[LAST_Q - 1].reward.gold);
// (c) 第一個中期委託(村莊有 12 位獵人:要先升級獵人小屋)真的會完成、領取時照表發獎
assert.equal(quests.state.quest.index, 7); assert.equal(quests.state.quest.title, questChain[7].title);
assert.equal(quests.claimQuest().ok, false); assert.equal(quests.state.quest.complete, false);
assert.equal(questChain[7].target, 12); quests.state.gold += 1e4;
while (quests.recruit(CLASSES[0].id).ok);   // 小屋 Lv.1 名額滿了還不夠 12 位
assert.ok(quests.state.hunters.length < 12); assert.equal(quests.claimQuest().ok, false);
quests.state.wood += 1e3; quests.state.ore += 1e3; quests.state.herb += 1e3; quests.state.cloth += 1e3; quests.state.leather += 1e3; quests.state.flour += 1e3;
while (quests.state.capacity < 12) { if (quests.state.buildings.house > quests.state.buildings.hall) assert.equal(quests.upgrade('hall').ok, true); assert.equal(quests.upgrade('house').ok, true); }   // 小屋 Lv.3 要先把大廳升到 2
while (quests.state.hunters.length < 12) assert.equal(quests.recruit(CLASSES[0].id).ok, true);
const midBefore = { gold: quests.state.gold, wood: quests.state.wood, flour: quests.state.flour };
assert.equal(quests.claimQuest().ok, true); assert.equal(quests.state.quest.index, 8);
for (const key of Object.keys(midBefore)) assert.equal(quests.state[key], midBefore[key] + (questChain[7].reward[key] || 0), `quest 8 reward ${key}`);
assert.ok(questChain[7].reward.wood > 0);
// 其餘中期指標一次推滿(不寫死門檻,改數值也不用改測試),逐章領到轉世章為止
function maxOutQuestMetrics(game) {
  const s = game.state; s.buildings.house = 5; s.buildings.hall = 5; s.capacity = Math.max(8, CLASSES.length + 2) + 8; s.gold += 1e5;
  while (s.hunters.length < s.capacity) assert.equal(game.recruit(CLASSES[0].id).ok, true);
  s.bossKills = Math.max(s.bossKills, 999); s.dungeon.bestFloor = 99; s.counts.dungeonWins = Math.max(1, s.counts.dungeonWins);
  for (const h of s.hunters) { h.skillLevel = 5; h.weaponLevel = 10; } s.hunters[0].level = 99;
}
maxOutQuestMetrics(quests);
for (let i = 8; i < LAST_Q; i++) { assert.equal(quests.state.quest.index, i); assert.equal(quests.claimQuest().ok, true, `claim chapter ${i + 1}`); }
assert.equal(quests.state.quest.index, LAST_Q); assert.equal(quests.claimQuest().ok, false);   // 轉世還沒達成 → 停在最終章
quests.state.counts.rebirths = 1; const finalGold = quests.state.gold; assert.equal(quests.claimQuest().ok, true); assert.equal(quests.state.gold, finalGold + questChain[LAST_Q].reward.gold);
const questGold = quests.state.gold; assert.equal(quests.claimQuest().ok, false); assert.equal(quests.state.gold, questGold); assert.equal(createGame(quests.serialize()).claimQuest().ok, false);
assert.equal(quests.serialize().questRevision, 3);
// (b) 舊存檔遷移:沒有 questRevision = 舊的 8 章版(index 7 = 轉世)
const legacyQuestSave = (index, claimed, patch = {}) => { const save = createGame().serialize(); delete save.questRevision; delete save.questFinalPaid; save.quest = { index, claimed }; return Object.assign(save, patch); };
for (let i = 0; i < 7; i++) { const g = createGame(legacyQuestSave(i, false)); assert.equal(g.state.quest.index, i); assert.equal(g.state.quest.title, questChain[i].title); }   // 0–6 不變
const oldAt7 = createGame(legacyQuestSave(7, false));   // 舊轉世章、還沒領 → 第一個中期委託
assert.equal(oldAt7.state.quest.index, 7); assert.equal(oldAt7.state.quest.claimed, false); assert.equal(oldAt7.state.quest.title, questChain[7].title); assert.equal(oldAt7.state.questFinalPaid, false);
assert.equal(oldAt7.state.questRevision, 3); assert.equal(createGame(oldAt7.serialize()).state.quest.index, 7);
const oldDone = createGame(legacyQuestSave(7, true, { counts: { ...createGame().serialize().counts, rebirths: 1 } }));   // 舊版已領完最終章
assert.equal(oldDone.state.quest.index, 7); assert.equal(oldDone.state.quest.claimed, false); assert.equal(oldDone.state.questFinalPaid, true);
assert.notEqual(oldDone.claimQuest().message, '全部章節委託已完成。');   // 不會卡在「全部完成」
assert.equal(createGame(legacyQuestSave(99, true)).state.quest.index, 7);   // 越界的舊 index 夾回舊版範圍,不會跳過中期委託
const oldDoneReload = createGame(oldDone.serialize()); assert.equal(oldDoneReload.state.quest.index, 7); assert.equal(oldDoneReload.state.questFinalPaid, true);   // 遷移後再存讀不會再遷移一次
maxOutQuestMetrics(oldDoneReload); oldDoneReload.state.counts.rebirths = 1; while (oldDoneReload.state.quest.index < LAST_Q) assert.equal(oldDoneReload.claimQuest().ok, true);
assert.deepEqual(oldDoneReload.state.quest.reward, {}); assert.deepEqual(oldDoneReload.questList()[LAST_Q].reward, {});   // 轉世獎勵舊版已領過 → 最終章不重複發
const legacyFinalGold = oldDoneReload.state.gold, legacyFinalGems = oldDoneReload.state.gems; assert.equal(oldDoneReload.claimQuest().ok, true);
assert.equal(oldDoneReload.state.gold, legacyFinalGold); assert.equal(oldDoneReload.state.gems, legacyFinalGems); assert.equal(oldDoneReload.state.quest.claimed, true);
// 新版存檔(有 questRevision)照原 index 讀回,包含中期章節與已完成的最終章
const midSave = createGame(); midSave.state.quest = { index: 12, claimed: false }; assert.equal(createGame(midSave.serialize()).state.quest.index, 12);
for (const i of [17, 18, 20]) { const late = createGame(); late.state.quest = { index: i, claimed: false }; assert.equal(createGame(late.serialize()).state.quest.index, i); }   // 版本 3 的後期章不會被當成舊轉世章再搬一次
// (d) 版本 2(18 章,index 17 = 轉世)→ 版本 3:0–16 不變;17 → 新的轉世章,claimed 照存檔;finalPaid 照存檔
const rev2QuestSave = (index, claimed, patch = {}) => { const save = createGame().serialize(); save.questRevision = 2; save.questFinalPaid = false; save.quest = { index, claimed }; return Object.assign(save, patch); };
for (const i of [0, 5, 12, 16]) for (const claimed of [false, true]) {
  const g = createGame(rev2QuestSave(i, claimed));
  assert.equal(g.state.quest.index, i, `rev2 index ${i}`); assert.equal(g.state.quest.claimed, false); assert.equal(g.state.quest.title, questChain[i].title);
  assert.equal(g.state.questRevision, 3); assert.equal(g.serialize().questRevision, 3); assert.equal(createGame(g.serialize()).state.quest.index, i);
}
const rev2At16 = createGame(rev2QuestSave(16, false)); rev2At16.state.hunters[0].level = 65; assert.equal(rev2At16.claimQuest().ok, true); assert.equal(rev2At16.state.quest.index, 17);   // 領完第 17 章接到新插入的第 18 章
assert.equal(rev2At16.state.quest.title, '深淵之下');
const rev2At17 = createGame(rev2QuestSave(17, false));   // 停在舊轉世章、還沒領 → 新插入的第一章(index 17),已達成的章可以連領
assert.equal(rev2At17.state.quest.index, 17); assert.equal(rev2At17.state.quest.claimed, false); assert.equal(rev2At17.state.quest.title, questChain[17].title);
assert.equal(rev2At17.state.questFinalPaid, false);
assert.equal(rev2At17.serialize().questRevision, 3); const rev2At17Reload = createGame(rev2At17.serialize()); assert.equal(rev2At17Reload.state.quest.index, 17); assert.equal(rev2At17Reload.state.quest.claimed, false);
rev2At17Reload.state.counts.rebirths = 1; rev2At17Reload.state.hunters[0].level = 100; rev2At17Reload.state.dungeon.bestFloor = 40; const rev2FinalGold = rev2At17Reload.state.gold;
for (let i = 17; i <= LAST_Q; i++) assert.equal(rev2At17Reload.claimQuest().ok, true, 'migrated save claims chapter ' + i);
assert.equal(rev2At17Reload.state.gold, rev2FinalGold + questChain.slice(17).reduce((n, q) => n + q.reward.gold, 0)); assert.equal(rev2At17Reload.state.quest.claimed, true);
const rev2Done = createGame(rev2QuestSave(17, true, { counts: { ...createGame().serialize().counts, rebirths: 1 } }));   // 版本 2 已全部完成 → 仍是全部完成,不重做、不重複發獎
assert.equal(rev2Done.state.quest.index, LAST_Q); assert.equal(rev2Done.state.quest.claimed, true);
const rev2DoneGold = rev2Done.state.gold; assert.equal(rev2Done.claimQuest().message, '全部章節委託已完成。'); assert.equal(rev2Done.state.gold, rev2DoneGold);
assert.equal(rev2Done.serialize().questRevision, 3); const rev2DoneReload = createGame(rev2Done.serialize()); assert.equal(rev2DoneReload.state.quest.index, LAST_Q); assert.equal(rev2DoneReload.state.quest.claimed, true);
const rev2Paid = createGame(rev2QuestSave(17, false, { questFinalPaid: true }));   // 版本 1 → 2 時已領過轉世獎勵的存檔:最終章仍不重複發
assert.equal(rev2Paid.state.quest.index, 17); assert.equal(rev2Paid.state.questFinalPaid, true);
assert.equal(createGame(rev2QuestSave(99, true)).state.quest.index, 17); assert.equal(createGame(rev2QuestSave(99, true)).state.quest.claimed, false);   // 越界夾回 17;index 不是 17 就不當成已領完
assert.equal(createGame(rev2QuestSave(-3, false)).state.quest.index, 0);

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
  // 地下城體檢(2026-11-16):打完一層殘血 → 帶戰利品回村(算勝利),不硬闖下一層;健康的小隊照常續戰;
  // 波與波之間估計前排撐不到這層打完 → 半途撤退,沒有本層獎勵
  const setup = (classes, prep) => {
    const g = createGame(); g.construct('dungeon'); g.setDungeonAuto(true);
    const party = classes.map(c => g.state.hunters.find(h => h.classId === c)); prep?.(party);
    assert.equal(g.startDungeon(party.map(h => h.id)).ok, true);
    for (const h of party) h.route = [];
    g.tick(0.1); assert.equal(g.state.dungeon.phase, '戰鬥中');
    return { g, party, d: g.state.dungeon };
  };
  const clearWave = (g, d, wave) => { d.wave = wave; for (const f of d.foes) f.hp = 0; g.tick(0.1); };
  // 殘血:每人 5% → 休整後也才 25%,回村
  { const { g, party, d } = setup(['paladin', 'archer', 'priest']);
    for (const h of party) h.hp = Math.max(1, Math.round(h.maxHp * 0.05));
    clearWave(g, d, 3);
    assert.equal(d.active, false, 'a worn-out party does not auto-continue'); assert.equal(d.phase, '勝利', 'coming home is a win');
    assert.equal(d.bestFloor, 1); assert.ok(d.reward.gold > 0, 'the floor reward is kept'); assert.equal(d.floor, 2, 'next run starts at the next floor');
    assert.ok(party.every(h => h.hp > 0 && h.task !== 'dungeon' && h.task !== 'revive'), 'nobody dies, everyone walks home');
    assert.ok(g.state.log.some(l => l.text.includes('小隊體力不足，帶著戰利品返村休整')), 'the log explains why the party came home'); }
  // 健康又夠強:續戰下一層
  { const { g, party, d } = setup(['paladin', 'archer', 'priest'], p => { for (const h of p) { h.attack = 400; h.maxHp = h.hp = 5000; } });
    clearWave(g, d, 3);
    assert.equal(d.active, true, 'a healthy party keeps going'); assert.equal(d.floor, 2); assert.equal(d.phase, '休整中');
    assert.ok(party.every(h => h.hp === h.maxHp)); }
  // 波間撤退:沒有祭司、前排只剩 1 點血 → 第 1 波打完就撤,沒有本層獎勵
  { const { g, party, d } = setup(['paladin', 'archer', 'sorcerer']);
    const gold0 = g.state.gold; party[0].hp = 1;
    clearWave(g, d, 1);
    assert.equal(d.active, false, 'a party about to lose its front line retreats between waves'); assert.equal(d.phase, '撤退');
    assert.equal(d.bestFloor, 0); assert.deepEqual(d.reward, {}, 'a mid-floor retreat gives no floor reward'); assert.ok(g.state.gold - gold0 < 100);
    assert.ok(party.every(h => h.hp > 0 && h.task !== 'revive'), 'nobody dies'); assert.equal(d.cooldown, 10, 'same cooldown as a manual retreat'); }
  // 離線:自動續戰的小隊中途自己回村 → 離線迴圈照常結束、時間照實經過、帳不爆
  { const { g, d } = setup(['paladin', 'archer', 'priest']);
    const snap = g.offlineSnapshot(), wins0 = g.state.counts.dungeonWins; g.simulate(OFFLINE.sample);
    const sum = g.offlineFinish(snap, 3 * 3600);
    assert.equal(d.active, false, 'an ordinary party comes home on its own during 3 offline hours');
    assert.ok(Math.abs(g.state.time - snap.time - 3 * 3600) < 1, 'offline time still passes in full after the run ends');
    assert.ok(g.state.counts.dungeonWins - wins0 <= d.bestFloor + 1, 'dungeon wins are not extrapolated on top of the real run');
    assert.ok(sum.seconds === 3 * 3600); assertFiniteEconomy(g.state); }
}
{
  // 樓層獎勵(2026-11-17):第一次通過全額;已打過的樓層(≤ 原本最高紀錄)獎勵減少;d.reward / 日誌 / UI 預估 / 離線帳本都照實際發的
  const life = h => { let n = h.xp || 0; for (let l = 1; l < h.level; l++) n += 30 + l * 8; return n; };
  const g = createGame(); g.construct('dungeon'); g.setDungeonAuto(false); const d = g.state.dungeon;
  const party = ['paladin', 'archer', 'priest'].map(c => g.state.hunters.find(h => h.classId === c));
  for (const h of party) { h.attack = 400; h.maxHp = h.hp = 5000; }
  const clearFloor = floor => {
    for (const h of party) { h.task = null; h.route = []; h.hp = h.maxHp; } d.cooldown = 0;
    const want = g.dungeonReward(floor), snap = g.offlineSnapshot();
    const before = party.map(h => ({ gold: h.gold, xp: life(h) })), res0 = { gold: g.state.gold, ore: g.state.ore, gems: g.state.gems };
    assert.equal(g.startDungeon(party.map(h => h.id), floor).ok, true); assert.equal(d.floor, floor);
    for (const h of party) h.route = [];
    g.tick(0.1); d.wave = 3; for (const f of d.foes) f.hp = 0; g.tick(0.1);
    assert.equal(d.active, false); assert.equal(d.phase, '勝利');
    assert.deepEqual(d.reward, want.village, 'd.reward is what dungeonReward (UI preview) promised');
    party.forEach((h, i) => { assert.equal(h.gold - before[i].gold, want.gold, 'each hunter gets the promised gold'); assert.equal(life(h) - before[i].xp, want.xp, 'each hunter gets the promised xp'); });
    assert.equal(g.state.gems - res0.gems, want.village.gems, 'village gems match the reward');
    // 帳本 = 實際發的:取樣期只有這一趟地下城 → 外推 3 倍時,地下城那份不會被當成「野外收入」再算一次
    const after = party.map(h => ({ gold: h.gold, xp: life(h), level: h.level })), gems1 = g.state.gems;
    g.state.time += 2;   // 取樣期要 ≥ 1 秒才會外推(offlineFinish 的 f);多出的 2 秒沒有任何進帳
    g.offlineFinish(snap, (g.state.time - snap.time) * 4);
    party.forEach((h, i) => { assert.equal(h.gold, after[i].gold, 'ledger cancels dungeon gold'); assert.equal(life(h), after[i].xp, 'ledger cancels dungeon xp'); });
    assert.equal(g.state.gems, gems1, 'ledger cancels dungeon gems');
    return want;
  };
  assert.equal(g.dungeonReward(1).first, true);
  const first = clearFloor(1);
  assert.equal(first.first, true); assert.deepEqual(first.village, { gold: 160, ore: 15, gems: 2 }); assert.equal(first.gold, 45); assert.equal(first.xp, 175);
  assert.equal(d.bestFloor, 1); assert.ok(g.state.log.some(l => l.text.includes('地下城第 1 層突破！村莊獲得 160 金幣、15 鐵礦與 2 星晶')));
  assert.equal(g.dungeonReward(1).first, false, 'floor 1 is now a repeat'); assert.equal(g.dungeonReward(2).first, true, 'the next floor is still a first clear');
  const again = clearFloor(1);
  assert.equal(again.first, false); assert.equal(d.bestFloor, 1);
  assert.ok(again.village.gold < first.village.gold * 0.5 && again.village.gold > 0, 'repeat village gold is reduced');
  assert.ok(again.village.ore < first.village.ore && again.village.gems < first.village.gems, 'repeat ore/gems are reduced');
  assert.ok(again.xp < first.xp && again.xp >= first.xp * 0.4, 'repeat xp is reduced but weak hunters can still farm');
  assert.ok(again.gold < first.gold && again.gold > 0);
  assert.ok(g.state.log.some(l => l.text.includes('地下城第 1 層再次通過') && l.text.includes('（已打過的樓層，獎勵減少）')), 'the log says the repeat reward is reduced');
  assert.equal(clearFloor(2).first, true, 'a new record floor pays in full again'); assert.equal(d.bestFloor, 2);
}
{
  // 出發體檢(2026-11-17):剛出發那層也要估 → 估不過最高紀錄 +1 層就往下找估得過的最深一層;強隊照常挑戰新層;第 1 層是底線
  const fresh = (prep, classes = ['paladin', 'archer', 'priest']) => { const g = createGame(); g.construct('dungeon');
    const party = classes.map(c => g.state.hunters.find(h => h.classId === c)); prep?.(party, g.state.dungeon); return { g, party, d: g.state.dungeon }; };
  // 剛起步的小隊、紀錄卻在第 30 層(例如強隊在復活中,只剩弱隊能派)→ 不去第 31 層送死
  { const { g, party, d } = fresh((p, d) => { d.bestFloor = 30; });
    assert.equal(g.startDungeon(party.map(h => h.id)).ok, true);
    assert.ok(d.floor >= 1 && d.floor < 31, `a weak party is not sent to floor 31 (went to ${d.floor})`);
    assert.ok(g.state.log.some(l => l.text.includes(`打不過第 31 層，改從第 ${d.floor} 層出發`)), 'the log says why the party starts lower');
    const deaths0 = g.state.counts.deaths; for (const h of party) h.route = [];
    run(g, 150, true); assert.equal(d.active, false);
    assert.equal(g.state.counts.deaths, deaths0, 'the stepped-down run costs no lives'); assert.equal(d.bestFloor, 30, 'clearing a lower floor does not move the record'); }
  // 指定起始層也一樣保護(UI 的起始層 −/+ 選到太深的層)
  { const { g, party, d } = fresh((p, d) => { d.bestFloor = 30; });
    assert.equal(g.startDungeon(party.map(h => h.id), 25).ok, true); assert.ok(d.floor < 25, 'an explicit start floor the party cannot survive is stepped down too'); }
  // 強隊:照常從最高紀錄 +1 出發,也不多一行訊息
  { const { g, party, d } = fresh((p, d) => { d.bestFloor = 5; for (const h of p) { h.attack = 400; h.maxHp = h.hp = 5000; } });
    assert.equal(g.startDungeon(party.map(h => h.id)).ok, true); assert.equal(d.floor, 6, 'a strong party still pushes the newest floor');
    assert.ok(!g.state.log.some(l => l.text.includes('改從第')), 'no step-down message when the floor is fine'); }
  // 估什麼都估不過(沒有補師、攻擊力 1 → 打不完)→ 還是第 1 層,不會變成第 0 層或出不了發
  { const { g, party, d } = fresh((p, d) => { d.bestFloor = 8; for (const h of p) h.attack = 1; }, ['paladin', 'archer', 'sorcerer']);
    assert.equal(g.startDungeon(party.map(h => h.id)).ok, true); assert.equal(d.floor, 1, 'floor 1 is the lowest start'); }
}
{
  // 地下城保命(2026-11-17):出發時每人至少 35% 生命;波中魔物這一擊會打倒人 → 緊急撤退(沒有本層獎勵、沒有人倒下、帳本不記)
  const fresh = (classes = ['paladin', 'archer', 'sorcerer']) => { const g = createGame(); g.construct('dungeon'); g.setDungeonAuto(true);
    const party = classes.map(c => g.state.hunters.find(h => h.classId === c)); return { g, party, d: g.state.dungeon }; };
  // 出發血量門檻:有祭司也一樣(祭司的補血在預估裡攤在整層,殘血的人會被估成撐得過)
  { const { g, party, d } = fresh(['paladin', 'archer', 'priest']); party[0].hp = Math.round(party[0].maxHp * 0.2);
    const r = g.startDungeon(party.map(h => h.id));
    assert.equal(r.ok, false, 'a hunter below 35% HP cannot enter the dungeon'); assert.ok(r.message.includes(party[0].name) && r.message.includes('35%'), r.message);
    assert.equal(d.active, false); assert.ok(party.every(h => h.task !== 'dungeon'));
    party[0].hp = Math.ceil(party[0].maxHp * 0.35); assert.equal(g.startDungeon(party.map(h => h.id)).ok, true, 'at 35% the party may go'); }
  // 自動挑隊:挑血量最高的;所有人都殘血 → 不出發
  { const { g, d } = fresh(); for (const h of g.state.hunters) h.hp = Math.max(1, Math.round(h.maxHp * 0.1));
    assert.equal(g.startDungeon().ok, false, 'nobody healthy enough → no auto run'); assert.equal(d.active, false);
    const ok3 = g.state.hunters.slice(0, 3); for (const h of ok3) h.hp = h.maxHp;
    assert.equal(g.startDungeon().ok, true); assert.deepEqual([...d.hunterIds].sort(), ok3.map(h => h.id).sort(), 'auto-select takes the healthy hunters'); }
  const fight = () => { const s = fresh(); assert.equal(s.g.startDungeon(s.party.map(h => h.id)).ok, true);
    for (const h of s.party) h.route = [];
    s.g.tick(0.1); assert.equal(s.d.phase, '戰鬥中');
    for (const h of s.party) { h.skillCd = 99; h.attackTimer = 99; }   // 這一跳不出手、不自補,只看魔物那一擊
    for (const f of s.d.foes) { f.hp = f.maxHp = 1e6; f.timer = 99; } s.d.foes[0].timer = 0.05;
    return s; };
  // 前排只剩一擊的血 → 魔物出手前撤退
  { const { g, party, d } = fight(), deaths0 = g.state.counts.deaths, wins0 = g.state.counts.dungeonWins;
    party[0].hp = 1; const snap = g.offlineSnapshot(), gold0 = g.state.gold;
    g.tick(0.1);
    assert.equal(d.active, false, 'the party pulls out before the killing blow'); assert.equal(d.phase, '撤退'); assert.deepEqual(d.reward, {}, 'no floor reward');
    assert.equal(d.cooldown, 10, 'same cooldown as a manual retreat'); assert.equal(d.bestFloor, 0);
    assert.equal(party[0].hp, 1, 'the killing blow never lands'); assert.equal(g.state.counts.deaths, deaths0);
    assert.ok(party.every(h => h.hp > 0 && h.task !== 'dungeon' && h.task !== 'revive'), 'everyone walks home');
    assert.equal(g.state.counts.dungeonWins, wins0, 'a retreat is not a win');
    assert.ok(g.state.log.some(l => l.text.includes(`${party[0].name}快撐不住了`) && l.text.includes('緊急撤退')), 'the log says why');
    g.state.time += 2; g.offlineFinish(snap, (g.state.time - snap.time) * 4); assert.equal(g.state.gold, gold0, 'nothing for the ledger to cancel or extrapolate'); assertFiniteEconomy(g.state); }
  // 撐得住的一擊照打、不撤
  { const { g, party, d } = fight(), hp0 = party[0].hp;
    g.tick(0.1);
    assert.equal(d.active, true, 'a survivable hit does not end the run'); assert.ok(party[0].hp < hp0, 'the front line takes the hit');
    assert.ok(d.events.some(e => e.k === 'hurt' && e.b === party[0].id)); }
}
{
  // 全祭司小隊(2026-11-17):祭司沒人要補時會普攻 → 預估不能把祭司輸出算 0(以前 dps = 0 → 第 1 波打完必定「體力不支」半途撤退,永遠過不了第 1 層)
  const sv = createGame().serialize(); sv.seed = 11; sv.buildings.dungeon = 1;
  sv.hunters = sv.hunters.slice(0, 3).map(h => ({ ...h, classId: 'priest', level: 20, xp: 0 }));
  const g = createGame(sv), party = g.state.hunters, d = g.state.dungeon; for (const h of party) h.hp = h.maxHp;
  g.state.paused = false; g.setDungeonAuto(true); const deaths0 = g.state.counts.deaths;
  assert.equal(g.dungeonStartFloor(party.map(h => h.id), 1), 1);
  assert.equal(g.startDungeon(party.map(h => h.id), 1).ok, true); assert.equal(d.floor, 1);
  run(g, 120, false, s => assert.ok(!s.log.some(l => l.text.includes('半途撤退')), 'no mid-floor retreat'));
  assert.ok(d.bestFloor >= 1, `an all-priest Lv.20 party clears at least floor 1 (best ${d.bestFloor})`);
  assert.equal(g.state.counts.deaths, deaths0, 'and nobody dies doing it');
}
{
  // 推薦隊伍(2026-11-17):用地下城預估挑職業組合 → 不會挑三個高攻低血的法師;純函式;自動挑隊也走它
  const sv = createGame().serialize(); sv.seed = 5; sv.buildings.dungeon = 1;
  const cls = ['sorcerer', 'sorcerer', 'sorcerer', 'paladin', 'archer', 'priest'];
  sv.hunters = cls.map((c, i) => { const b = sv.hunters[i % sv.hunters.length]; return { ...b, name: b.name + (i + 1), classId: c, level: 20, xp: 0 }; });
  const g = createGame(sv), d = g.state.dungeon, hs = g.state.hunters; for (const h of hs) h.hp = h.maxHp; d.bestFloor = 20;
  const glass = hs.filter(h => h.classId === 'sorcerer'), others = hs.filter(h => h.classId !== 'sorcerer'), ids = a => a.map(h => h.id).sort();
  assert.equal(new Set(hs.map(h => h.id)).size, 6);
  assert.ok(Math.min(...glass.map(h => h.attack)) > Math.max(...others.map(h => h.attack)) && Math.max(...glass.map(h => h.maxHp)) < Math.max(...others.map(h => h.maxHp)), 'premise: the sorcerers are the glass cannons');
  const snap = JSON.stringify(g.serialize()), rnd = Math.random; Math.random = () => { throw new Error('recommendDungeonParty must not roll'); };
  let rec; try { rec = g.recommendDungeonParty(); } finally { Math.random = rnd; }
  assert.equal(JSON.stringify(g.serialize()), snap, 'recommending changes nothing');
  assert.deepEqual(g.recommendDungeonParty(), rec, 'same roster → same answer');
  assert.equal(rec.ok, true); assert.equal(rec.ids.length, 3); assert.notDeepEqual([...rec.ids].sort(), ids(glass), 'not the three glass cannons');
  const team = rec.ids.map(id => hs.find(h => h.id === id));
  assert.ok(team.some(h => h.classId === 'priest') && team.some(h => h.classId === 'paladin'), `a healer and a front-liner (${team.map(h => h.classId)})`);
  assert.ok(rec.floor > 0 && rec.message.includes(`可安全推進到第 ${rec.floor} 層`) && team.every(h => rec.message.includes(h.name)), rec.message);
  // 只剩三個法師能出發 → 推薦就是他們,而且估得比平衡隊淺
  for (const h of others) h.hp = Math.floor(h.maxHp * 0.3);
  const glassRec = g.recommendDungeonParty(); assert.deepEqual([...glassRec.ids].sort(), ids(glass), 'below 35% HP is not eligible');
  assert.ok(glassRec.floor < rec.floor, `glass cannons reach ${glassRec.floor} < balanced ${rec.floor}`);
  glass[0].hp = 0; const none = g.recommendDungeonParty(); assert.equal(none.ok, false); assert.deepEqual(none.ids, []);
  glass[0].hp = glass[0].maxHp; for (const h of others) h.hp = h.maxHp;
  // 自動挑隊:舊規則(血量比例 → 攻擊)會挑三個法師;現在用推薦
  g.setDungeonAuto(true); assert.equal(g.startDungeon().ok, true);
  assert.deepEqual([...d.hunterIds].sort(), [...rec.ids].sort(), 'startDungeon(null) takes the recommended party');
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
  // 2026-11-17 起收購另外外推(一般委託買滿就停,賣給流浪英雄的錢不再無上限地流出)→ 這裡全部開持續收購
  // 2026-11-18:收購外推本來就不是「取樣期 × 倍率」:持續收購照「撿到的量」買(可多於取樣期剛好賣掉的量),付款照「誰撿的」分(不是取樣期誰剛好回村賣)
  //   → 流到流浪英雄(村莊＋獵人這池以外)的收購款跟線性外推不同。正確的守恆式:
  //   池子(村莊＋獵人)期末 = 線性外推「不含收購的淨流量」 − 外推期付給流浪英雄的收購款(實際從流浪英雄錢包量)
  //   twS = 取樣期流浪英雄收到的收購款 = 錢包變化 − 打怪收入(wanderGold) + 付給村莊的錢(wanderPay);offlineFinish 只會因收購付款動到流浪英雄錢包
  const idle = createGame(); for (const k of MATERIAL_KEYS_T) idle.state.tradeStanding[k] = true; run(idle, 5);
  const W = () => idle.state.hunters.reduce((n, h) => n + h.gold, 0), WW = () => idle.state.wanderers.reduce((n, w) => n + w.gold, 0), C = k => idle.state.counts[k] || 0;
  const wIds = () => idle.state.wanderers.map(w => w.id).join();
  const s2 = idle.offlineSnapshot(), v0 = idle.state.gold, w0 = W(), ww0 = WW(), wg0 = C('wanderGold'), wp0 = C('wanderPay'), ids0 = wIds(); idle.simulate(OFFLINE.sample);
  const twS = (WW() - ww0) - (C('wanderGold') - wg0) + (C('wanderPay') - wp0), ww1 = WW(), tg1 = C('tradeGold'), pool1 = idle.state.gold + W(), hg1 = C('hunterGold'), wp1 = C('wanderPay');
  idle.offlineFinish(s2, 3 * 3600);
  const twX = WW() - ww1, tgX = C('tradeGold') - tg1;
  assert.equal(wIds(), ids0, 'same wanderers throughout (the wallet accounting above assumes nobody joined or left)');
  assert.ok(twS >= 0 && twX >= 0 && twX <= tgX, `wanderers only get what the village paid for materials (sample ${twS}, extrapolated ${twX} of ${tgX})`);
  assert.ok(tgX > 0, 'standing orders keep buying during the extrapolated part');
  // 2026-11-18 守恆式改成「外推期的進出」:池子(村莊＋獵人)只多了獵人打怪的金幣(hunterGold)與流浪英雄付給村莊的錢(wanderPay,服務有庫存上限),
  //   只少了付給流浪英雄的收購款;服務費、裝備、賣材料給村莊都是池子內部轉手(獵人付多少、村莊收多少)
  assert.ok(Math.abs((idle.state.gold + W()) - (pool1 + (C('hunterGold') - hg1) + (C('wanderPay') - wp1) - twX)) <= idle.state.hunters.length + 2, 'village + hunter gold: only hunting income and wanderer payments come in, only material payments to wanderers go out (no gold from nothing)');
  assert.ok(idle.state.hunters.every(h => h.gold >= 0)); assertFiniteEconomy(idle.state);
}
{
  // 2026-11-18 離線服務收入以庫存為上限:線上庫存賣完、沒人補貨,村莊就沒有這筆收入(以前照取樣速率外推,離線 4 小時村莊金幣是線上的 19 倍)
  //   買不到的獵人錢留在錢包(改用免費的基本服務);金幣守恆
  const make = stock => { const g = createGame(); g.state.autoJunk = 'off'; for (const h of g.state.hunters) h.huntRegion = 'meadow'; run(g, 20);
    for (const k of MATERIAL_KEYS_T) g.state.tradeRequests[k] = 0; g.state.wanderers = [];
    for (const k of Object.keys(g.state.stocks)) g.state.stocks[k] = stock; return g; };
  const wallets = g => g.state.hunters.reduce((n, h) => n + h.gold, 0), C = (g, k) => g.state.counts[k] || 0;
  const offline = g => { const snap = g.offlineSnapshot(), c0 = { ...g.state.counts }, stock0 = Object.values(g.state.stocks).reduce((a, b) => a + b, 0), m0 = g.state.gold + wallets(g);
    g.simulate(OFFLINE.sample); g.offlineFinish(snap, 3 * 3600);
    return { g, stock0, m0, sold: C(g, 'services') - c0.services, income: C(g, 'serviceIncome') - c0.serviceIncome, hunterGold: C(g, 'hunterGold') - (c0.hunterGold || 0), wanderPay: C(g, 'wanderPay') - (c0.wanderPay || 0), basic: C(g, 'basicServices') - c0.basicServices }; };
  const lo = offline(make(5)), hi = offline(make(1e5)), maxPrice = 2 * Math.max(...Object.values(PRODUCTS).map(p => p.price));
  const left = lo.g.state.stocks;
  assert.ok(Object.values(left).every(n => Number.isInteger(n) && n >= 0), 'stocks never go negative');
  assert.equal(lo.sold, lo.stock0 - Object.values(left).reduce((a, b) => a + b, 0), 'every paid service came out of the stock');
  assert.ok(lo.sold <= lo.stock0 && lo.income <= lo.sold * maxPrice, `service income is capped by the stock (${lo.sold} sold of ${lo.stock0}, ${lo.income} gold)`);
  assert.ok(hi.sold > 5 * lo.sold && hi.income > 5 * lo.income, `a full stock keeps selling (${hi.sold} vs ${lo.sold})`);
  assert.ok(lo.basic > hi.basic, 'hunters who could not buy used the free basic service');
  assert.ok(wallets(lo.g) > wallets(hi.g), 'hunters keep the gold they could not spend');
  // 守恆:池子(村莊＋獵人)只多了打怪金幣與流浪英雄付的錢;服務費是池子內部轉手
  assert.ok(Math.abs(lo.g.state.gold + wallets(lo.g) - (lo.m0 + lo.hunterGold + lo.wanderPay)) <= lo.g.state.hunters.length + 2, 'no gold from nothing');
  for (const x of [lo, hi]) assertFiniteEconomy(x.g.state);
}
{
  // 2026-11-18 同一個存檔:離線 1 小時 vs 線上掛機 1 小時(玩家不操作)→ 村莊金幣、服務收入同一個量級(以前離線村莊金幣是線上的 5 倍)
  //   擊倒/經驗/錢包:剛開局的獵人一小時從 Lv.7 升到 Lv.57、一路換更難的區(前 10 分鐘經驗速率只有之後的 1/3,擊倒速率是之後的 2 倍),
  //   4 分鐘的取樣線性外推只抓得到量級 → 只擋「差好幾倍」;中後期存檔(第 6/16 天)實測在 ±20% 內(docs/BALANCE.md「離線收益」)
  const base = createGame(); for (const h of base.state.hunters) h.huntRegion = 'meadow'; run(base, 30);
  const save = base.serialize(); for (const k of Object.keys(save.tradeRequests)) save.tradeRequests[k] = 0;
  const life = h => { let n = h.xp || 0; for (let l = 1; l < h.level; l++) n += 30 + l * 8; return n; };
  const pick = g => ({ gold: g.state.gold, svc: g.state.counts.serviceIncome, kills: g.state.totalKills, xp: g.state.hunters.reduce((n, h) => n + life(h), 0), wallets: g.state.hunters.reduce((n, h) => n + h.gold, 0) });
  const delta = (a, b) => Object.fromEntries(Object.keys(a).map(k => [k, b[k] - a[k]]));
  const on = createGame(save), on0 = pick(on); for (let t = 0; t < 3600; t += 5) on.simulate(5); const dOn = delta(on0, pick(on));
  const off = createGame(save), off0 = pick(off), snap = off.offlineSnapshot(); off.simulate(OFFLINE.sample); off.offlineFinish(snap, 3600); const dOff = delta(off0, pick(off));
  const ratio = k => dOff[k] / dOn[k], msg = k => `${k}: offline ${dOff[k]} vs online ${dOn[k]}`;
  assert.ok(dOn.gold > 0 && dOn.svc > 0, 'the online hour earns village gold');
  assert.ok(ratio('gold') >= 0.75 && ratio('gold') <= 1.25, msg('gold'));
  assert.ok(ratio('svc') >= 0.75 && ratio('svc') <= 1.25, msg('svc'));
  assert.ok(ratio('wallets') >= 0.4 && ratio('wallets') <= 2, msg('wallets'));   // 2026-11-18 野外經驗 ×1.2 後剛開局升級更快、更早換到金幣多的區 → 開局取樣低估錢包(實測 0.46);第 6/16 天存檔 0.98–1.07
  assert.ok(ratio('xp') >= 1 / 3 && ratio('xp') <= 3, msg('xp'));
  assert.ok(ratio('kills') >= 1 / 3 && ratio('kills') <= 3, msg('kills'));
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
  const f = createGame(), buyer = isolate(f), forge = BUILDINGS.find(b => b.id === 'forge'); f.state.time = 100; f.state.autoJunk = 'off'; Object.assign(buyer, doorStand(forge, forge)); buyer.gold = 2000;
  for (const r of RECIPES) assert.equal(f.craftEquipment(r.id).ok, true, `craft ${r.id}`);
  assert.ok(EQUIP_SLOTS.every(s => f.state.gearStock[s][1] === 1));
  run(f, 5, true);
  for (const s of EQUIP_SLOTS) { assert.equal(buyer.gear[s].itemId, 'craft_' + s, `bought craft ${s}`); assert.equal(buyer.equipment[s], true); assert.equal(f.state.gearStock[s][1], 0); }
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
  assert.deepEqual(Object.fromEntries(EQUIP_SLOTS.map(s => [s, l2.state.gearStock[s][1]])), { weapon: 2, helm: 0, chest: 3, belt: 0, legs: 0, boots: 0, gloves: 0 }, 'v2 stock: armor → chest (tier Ⅰ)');
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
  assert.deepEqual(Object.fromEntries(EQUIP_SLOTS.map(s => [s, l3.state.gearStock[s][1]])), v3.gearStock, 'v3 per-slot stock kept (tier Ⅰ)');
  // v1 / 未知版本照舊拒絕
  for (const v of [1, 5, '4', undefined]) { const bad = createGame().serialize(); bad.version = v; bad.gold = 7; assert.equal(createGame(bad).state.gold, 1500, `version ${String(v)} rejected`); }
}
// 2026-11-16 倉庫一鍵整理:只賣／分解「鍛造裝備且階級低於鐵匠鋪目前最高階」,其他(目前最高階、非鍛造掉落)都保留
{
  const g = createGame(), s = g.state; s.buildings.forge = 3;
  s.gearStorage = [{ uid: 'b1', itemId: 'craft_chest', grade: 1 }, { uid: 'b2', itemId: 'craft_helm', grade: 2 }, { uid: 'b3', itemId: 'craft_weapon', grade: 3 }, { uid: 'b5', itemId: 'archer_bow' }];
  const pre = g.bulkStoredGear('sell', true);
  assert.equal(pre.count, 3, 'tier 1, tier 2 and the starter bow are old gear'); assert.ok(pre.gold > 0); assert.equal(s.gearStorage.length, 4, 'dry run changes nothing');
  const gold0 = s.gold, r = g.bulkStoredGear('sell');
  assert.equal(r.ok, true); assert.equal(s.gold, gold0 + pre.gold); assert.deepEqual(s.gearStorage.map(x => x.uid), ['b3'], 'current-tier gear is kept');
  assert.equal(g.bulkStoredGear('sell').ok, false, 'nothing left to sell');
  s.gearStorage = [{ uid: 'c1', itemId: 'craft_chest', grade: 2 }]; const pv = g.bulkStoredGear('salvage', true), before = { ...Object.fromEntries(Object.keys(pv.mats).map(k => [k, s[k]])) };
  assert.equal(g.bulkStoredGear('salvage').ok, true); for (const [k, n] of Object.entries(pv.mats)) assert.equal(s[k], before[k] + n); assert.equal(s.gearStorage.length, 0);
}
// 2026-11-16 定案:難度越高,野外材料掉落越多(初級不變);金幣本來就隨難度提高
{
  const g = createGame(), s = g.state;
  s.difficulty = 0; assert.equal(g.dropAmount(3), 3, 'easy difficulty keeps drops unchanged'); assert.equal(g.dropAmount(1), 1);
  s.difficulty = 2; assert.equal(g.dropAmount(3), Math.round(3 * 1.9), 'hard: x1.9');
  s.difficulty = 4; assert.equal(g.dropAmount(3), 12, 'nightmare: x4');
}
// 2026-11-16 競技場推薦隊伍:挑每秒傷害(攻擊 ÷ 出手間隔)最高、生命 ≥35% 的三人;唯讀
{
  const g = createGame(), s = g.state, hs = s.hunters;
  hs.forEach((h, i) => { h.attack = 10 + i * 5; h.hp = h.maxHp; });
  const weak = hs[hs.length - 1]; weak.hp = Math.floor(weak.maxHp * 0.2);   // 攻擊最高但生命 20%:不能上場
  const before = JSON.stringify(g.serialize()), r = g.recommendArenaParty();
  assert.equal(r.ok, true); assert.equal(r.ids.length, 3); assert.ok(!r.ids.includes(weak.id), 'low-HP hunter is skipped');
  const iv = h => (h.classId === 'sorcerer' ? 1.6 : h.classId === 'priest' ? 1.4 : 1.1) * (h.trait === 'swift' ? 0.9 : 1);
  const best = hs.filter(h => h !== weak).sort((a, b) => b.attack / iv(b) - a.attack / iv(a)).slice(0, 3).map(h => h.id).sort();
  assert.deepEqual([...r.ids].sort(), best, 'top 3 by damage per second');
  assert.equal(JSON.stringify(g.serialize()), before, 'recommendation is read-only');
}
// 2026-11-18 送別獵人:名額滿時騰出位置;裝備回倉庫;拒絕條件;清掉所有指向他的 id;存讀檔
{
  const g = createGame(), s = g.state;
  s.gold = 1e6; s.capacity = s.hunters.length;   // 名額已滿
  assert.equal(g.recruit(s.visitors[0].id).ok, false, 'full roster refuses recruit');
  const h = s.hunters[1], id = h.id, n0 = s.hunters.length;
  // 穿一件第 3 階鐵匠鋪胸甲(升級件帶 grade),確認物品實例原封不動回倉庫
  s.gearStorage.push({ uid: 'gX1', itemId: 'craft_chest', grade: 3 }); assert.equal(g.equipFromStorage(id, 'gX1').ok, true);
  const worn = EQUIP_SLOTS.map(slot => h.gear[slot]).filter(Boolean), storage0 = s.gearStorage.length;
  assert.ok(worn.length >= 1 && worn.some(i => i.uid === 'gX1'));
  // 把他塞進各種名單:地下城/競技場待選名單、派遣隊伍、手動操控、魔物近身名額、飛行中的箭
  s.dungeon.hunterIds = [id, s.hunters[2].id]; s.arena.hunterIds = [s.hunters[3].id, id];
  assert.equal(g.setDispatchTeam(0, { ids: [id, s.hunters[0].id] }).ok, true);
  s.pilot = { id, dx: 0, dz: 0, atk: false, readyAt: 0, lockUntil: 0, faceX: 1, faceZ: 0 };
  if (s.enemies[0]) { s.enemies[0].slotFor = id; s.enemies[0].engaged = true; }
  s.shots = [{ x: 0, z: 0, dx: 1, dz: 0, left: 3, ownerId: id, dmg: 5, hit: [] }, { x: 0, z: 0, dx: 1, dz: 0, left: 3, ownerId: s.hunters[0].id, dmg: 5, hit: [] }];
  const goldBefore = s.gold, r = g.dismissHunter(id);
  assert.equal(r.ok, true, r.message);
  assert.equal(s.hunters.length, n0 - 1); assert.ok(!s.hunters.some(x => x.id === id));
  assert.equal(s.gold, goldBefore, 'no village gold refund or cost');
  assert.equal(s.gearStorage.length, storage0 + worn.length, 'every equipped item goes back to storage');
  for (const inst of worn) assert.ok(s.gearStorage.includes(inst), `item ${inst.itemId} kept as the same instance`);
  assert.equal(s.gearStorage.find(i => i.uid === 'gX1')?.grade, 3, 'upgrade grade survives');
  assert.ok(!s.dungeon.hunterIds.includes(id) && s.dungeon.hunterIds.length === 1);
  assert.ok(!s.arena.hunterIds.includes(id) && s.arena.hunterIds.length === 1);
  assert.ok(s.dispatchTeams.every(t => !t.ids.includes(id)) && s.dispatchTeams[0].ids.length === 1);
  assert.equal(s.pilot, null); assert.ok(s.enemies.every(e => e.slotFor !== id));
  assert.ok(s.shots.every(x => x.ownerId !== id) && s.shots.length === 1);
  assert.ok(s.log[0].text.includes(`「${h.name}」離開了村莊`));
  // 騰出的名額可以招募
  assert.equal(g.recruit(s.visitors[0].id).ok, true, 'freed slot lets a visitor join');
  assert.equal(g.dismissHunter(id).ok, false, 'unknown id refused');
  run(g, 5, false, assertFiniteEconomy);   // 送別後繼續跑不會壞
  // 存讀檔:人數、倉庫物品(uid 會重新配號,所以比 itemId/grade)、隊伍名單都一致
  const save = g.serialize(), re = createGame(save), rs = re.state;
  assert.equal(rs.hunters.length, s.hunters.length); assert.ok(!rs.hunters.some(x => x.id === id));
  const key = list => list.map(i => `${i.itemId}:${i.grade || 1}`).sort();
  assert.deepEqual(key(rs.gearStorage), key(s.gearStorage), 'storage round-trips');
  assert.deepEqual(rs.dispatchTeams.map(t => t.ids), s.dispatchTeams.map(t => t.ids));
  run(re, 3, false, assertFiniteEconomy);
}
{
  // 拒絕:地下城小隊、倒下、少於 3 人、轉世數低於難度門檻
  const g = createGame(), s = g.state; s.buildings.dungeon = 1;
  for (const h of s.hunters) h.hp = h.maxHp;
  const party = s.hunters.slice(0, 3).map(h => h.id);
  assert.equal(g.startDungeon(party).ok, true);
  const n0 = s.hunters.length;
  assert.equal(g.dismissHunter(party[0]).ok, false, 'dungeon party member refused');
  assert.equal(g.dismissCheck(party[0]).ok, false);
  const down = s.hunters[4]; down.hp = 0; down.task = 'revive';
  assert.equal(g.dismissHunter(down.id).ok, false, 'downed hunter refused');
  assert.equal(s.hunters.length, n0, 'refusals change nothing');
  const g2 = createGame(), s2 = g2.state; s2.hunters = s2.hunters.slice(0, 3);
  assert.equal(g2.dismissHunter(s2.hunters[0].id).ok, false, 'never below 3 hunters');
  assert.equal(s2.hunters.length, 3);
  const g3 = createGame(), s3 = g3.state; s3.hunters[0].rebirths = 3; s3.difficulty = 2;   // 困難要 3 次轉世
  const c3 = g3.dismissCheck(s3.hunters[0].id); assert.equal(c3.ok, false); assert.match(c3.why, /難度/);
  assert.equal(g3.dismissCheck(s3.hunters[1].id).ok, true, 'other hunters still dismissable');
  assert.equal(g3.dismissHunter(s3.hunters[1].id).ok, true);
  assert.equal(createGame(g3.serialize()).state.difficulty, 2, 'difficulty survives save/load after dismissal');
}
// 2026-11-18 首領獎勵跟召喚地危險度走(生命本來就乘 region.risk)
{
  const g = createGame(); g.state.region = 'meadow'; const a = g.bossPreview(); g.state.region = 'mountain'; const b = g.bossPreview();
  assert.equal(a.risk, 1); assert.equal(a.gems, 5); assert.equal(a.hp, ENEMIES.boss.hp);
  assert.ok(b.risk > 1 && b.hp > a.hp && b.gold > a.gold && b.gems >= a.gems && b.drops.ore > a.drops.ore, 'riskier region → stronger boss and bigger reward');
  for (const h of g.state.hunters) { h.attack = 5000; h.maxHp = h.hp = 50000; }
  assert.equal(g.exploreRegion('mountain').ok, true); const gems0 = g.state.gems;
  assert.equal(g.expedition().ok, true); run(g, 200, false, () => {});
  assert.ok(g.state.bossKills >= 1, 'boss defeated in mountain'); assert.equal(g.state.gems - gems0, b.gems * g.state.bossKills, 'village gems match the preview');
}
console.log(`PASS: ${CLASSES.length} hunters / ${CLASSES.length} classes, seeded visitors, conservation of personal and village gold, paid and emergency services, bounded trading, crafting and gear purchases, upgrades, training, skills, rebirth, difficulty gates, hunting, field boss, death/revival, dungeon combat and save continuation, NPC arena, navigation, malformed saves, pause, deterministic simulation, all ${questChain.length} quests and legacy (rev 1, rev 2) quest-save migration. Natural 60s: ${combat.state.totalKills} total kills; ${combat.state.counts.services} services.`);

{ // 2026-11-18 野外掉落(初始件)與首領寶箱的舊件照「自動整理」處理:自動賣出時倉庫不會有初始裝備;放進倉庫時照舊收著
  const starters = g => g.state.gearStorage.filter(x => EQUIPMENT[x.itemId]?.tier === 'starter').length;
  const go = mode => { const g = createGame(); g.state.autoJunk = mode; g.state.paused = false; for (let t = 0; t < 2400; t += 5) g.simulate(5); return g; };
  const sell = go('sell'), off = go('off');
  assert.equal(starters(sell), 0, 'auto-sell: no starter junk piles up in storage');
  assert.ok(starters(off) > 0, `off: drops and replaced starters still go to storage (${starters(off)})`);
  assert.ok((sell.state.counts.autoJunk || 0) > 0, 'auto-sell counted');
}
