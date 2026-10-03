import {getRoads,roadNodes,onRoad,arenaAt,ARENAS,arenaContains,SOLID_PROPS} from './landscape-layout.js';
import {WORLD,REGIONS,BRIDGES,riverX,walkable,inVillage,regionAt,isBridge} from './overworld.js';
import {VILLAGE_BOUNDS,STREET_X,EXIT_Z,blockAt,BUILDING_NUDGE} from './village-grid.js';
import { BUILDINGS, CLASSES, RARITIES, TRAITS, MATERIALS, PRODUCTS, RECIPES, DIFFICULTIES, CAMP, HUNT_ZONE, LEGACY_LAYOUT_V14, LEGACY_LAYOUT_V15, LEGACY_LAYOUT_V16, ART_LAYOUT_HISTORY } from './pixel-data.js';

const mapById = list => Object.assign(Object.create(null), Object.fromEntries(list.map(item => [item.id, item])));
const CLASS = mapById(CLASSES), BUILDING = mapById(BUILDINGS), RARITY = mapById(RARITIES), RECIPE = mapById(RECIPES);
const RESOURCE_KEYS = ['gold', 'wood', 'ore', 'herb', 'cloth', 'flour', 'leather', 'gems'];
const MATERIAL_KEYS = Object.keys(MATERIALS), PRODUCT_KEYS = Object.keys(PRODUCTS);
const UNBUILT = new Set(['academy', 'training', 'enhancement', 'dungeon']);
const GATE = { x: STREET_X.at(-1), z: EXIT_Z[1] };  // 正門(東側中間那條街)
const NAMES = ['艾登', '莉雅', '羅恩', '賽琳', '伊諾', '芙蕾雅', '瑪琳', '卡爾', '艾莉', '奧斯卡', '薇拉', '雷恩', '希露', '米洛', '露娜', '阿斯特'];
const ENEMIES = {
  slime: { hp: 66, attack: 10, speed: 0.85, gold: 18, xp: 22, drops: { flour: 3, herb: 2 } },
  wolf: { hp: 98, attack: 15, speed: 1.7, gold: 26, xp: 32, drops: { leather: 3, cloth: 2 } },
  golem: { hp: 165, attack: 19, speed: 0.68, gold: 38, xp: 44, drops: { ore: 4, wood: 3 } },
  boss: { hp: 1150, attack: 28, speed: 0.85, gold: 260, xp: 180, drops: { ore: 15, wood: 10, herb: 8, leather: 10, cloth: 8, flour: 10 } },
};
const QUESTS = [
  { title: '迎接第六位獵人', description: '讓村莊中至少有 6 位獵人', target: 6, reward: { gold: 150, flour: 30 }, metric: s => s.hunters.length },
  { title: '餐廳的第一爐麵包', description: '在餐廳累計製作 20 份餐點', target: 20, reward: { gold: 200, herb: 30, cloth: 30 }, metric: s => s.counts.foodCrafted },
  { title: '建立戰利品循環', description: '透過交易所向獵人收購 10 份材料', target: 10, reward: { gold: 250, ore: 25 }, metric: s => s.counts.traded },
  { title: '鐵匠爐火', description: '把鐵匠鋪升至 2 級', target: 2, reward: { gold: 300, ore: 40 }, metric: s => s.buildings.forge },
  { title: '獵人的新武器', description: '製造 1 件精鐵武器，等待獵人返村選購', target: 1, reward: { gold: 150, gems: 3 }, metric: s => s.counts.weaponsCrafted },
  { title: '暮林領主', description: '召集獵人，擊敗 1 位森林領主', target: 1, reward: { gold: 500, gems: 10 }, metric: s => s.bossKills },
  { title: '地下城的門後', description: '建造地下城入口，完成 1 層三人探險', target: 1, reward: { gold: 500, leather: 40, flour: 100 }, metric: s => s.counts.dungeonWins },
  { title: '下一段獵魔人生', description: '讓 1 位 Lv.100 獵人在復活聖所轉世', target: 1, reward: { gold: 800, gems: 20 }, metric: s => s.counts.rebirths },
];
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const number = (n, fallback, min = 0, max = 1e9) => typeof n === 'number' && Number.isFinite(n) ? clamp(n, min, max) : fallback;
const integer = (n, fallback, min = 0, max = 1e9) => Math.floor(number(n, fallback, min, max));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const result = (ok, message) => ({ ok, message });
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const xpNeeded = level => 30 + level * 8;

export function createGame(saved = null) {
  const state = {};
  let rects = [], graphNodes = [], graphEdges = [], roads = [];
  const rw=WORLD.width*2+3,rh=WORLD.height*2+3;let roadMask=new Uint8Array(rw*rh);
  const roadPoint=(x,z)=>roadMask[Math.round((z-WORLD.minZ)*2)*rw+Math.round((x-WORLD.minX)*2)]===1;
  function routeCost(a,b){const len=distance(a,b),n=Math.max(1,Math.ceil(len));let off=0;for(let i=0;i<=n;i++){const u=i/n;if(!roadPoint(a.x+(b.x-a.x)*u,a.z+(b.z-a.z)*u))off++;}return len*(1+3.4*off/(n+1));}
  const id = prefix => `${prefix}${++state.nextId}`;
  const random = () => { state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0; return state.seed / 4294967296; };
  const log = (text, tone = 'info') => { state.log.unshift({ id: id('log'), text, tone }); state.log.length = Math.min(32, state.log.length); };
  const effect = (type, p, extra = {}) => { state.effects.push({ id: id('fx'), type, x: p.x, z: p.z, age: 0, ...extra }); if (state.effects.length > 100) state.effects.splice(0, state.effects.length - 100); };
  const canPay = cost => Object.entries(cost).every(([key, amount]) => state[key] >= amount);
  const pay = cost => { for (const [key, amount] of Object.entries(cost)) state[key] -= amount; };
  const buildingPoint = buildingId => state.layout[buildingId];
  const blocked = p => !walkable(p.x,p.z)||!walkable(p.x-.2,p.z)||!walkable(p.x+.2,p.z)||!walkable(p.x,p.z-.2)||!walkable(p.x,p.z+.2)||rects.some(r => p.x > r.minX && p.x < r.maxX && p.z > r.minZ && p.z < r.maxZ);

  function lineClear(a, b) {
    const steps=Math.ceil(distance(a,b)/.25);for(let i=0;i<=steps;i++){const u=steps?i/steps:0,x=a.x+(b.x-a.x)*u,z=a.z+(b.z-a.z)*u;if(!walkable(x,z)||!walkable(x-.2,z)||!walkable(x+.2,z)||!walkable(x,z-.2)||!walkable(x,z+.2))return false;}
    return !rects.some(r => {
      let near = 0, far = 1;
      for (const [key, low, high] of [['x', r.minX, r.maxX], ['z', r.minZ, r.maxZ]]) {
        const delta = b[key] - a[key];
        if (Math.abs(delta) < 1e-8) { if (a[key] <= low || a[key] >= high) return false; }
        else {
          let t0 = (low - a[key]) / delta, t1 = (high - a[key]) / delta;
          if (t0 > t1) [t0, t1] = [t1, t0];
          near = Math.max(near, t0); far = Math.min(far, t1);
          if (near >= far) return false;
        }
      }
      return far > 1e-7 && near < 1 - 1e-7;
    });
  }

  function rebuildNavigation() {
    rects = BUILDINGS.filter(b => state.buildings[b.id] > 0).map(b => {
      const p = buildingPoint(b.id);
      return { id: b.id, minX: p.x - b.w / 2 - 0.32, maxX: p.x + b.w / 2 + 0.32, minZ: p.z - b.d / 2 - 0.32, maxZ: p.z + b.d / 2 + 0.32 };
    });
    rects.push(...SOLID_PROPS);
    roads=getRoads(state.layout,state.buildings);roadMask.fill(0);
    for(let zi=0;zi<rh;zi++)for(let xi=0;xi<rw;xi++)if(onRoad(WORLD.minX+xi/2,WORLD.minZ+zi/2,roads,.1))roadMask[zi*rw+xi]=1;
    graphNodes = [];
    for (const r of rects) for (const x of [r.minX - 0.06, r.maxX + 0.06]) for (const z of [r.minZ - 0.06, r.maxZ + 0.06]) if (!blocked({ x, z })) graphNodes.push({ x, z });
    graphNodes.push(...roadNodes(roads).filter(p=>!blocked(p)));
    graphNodes=[...new Map(graphNodes.map(p=>[`${p.x.toFixed(3)},${p.z.toFixed(3)}`,p])).values()];
    // The village has at most 14 buildings. Reuse its visibility graph until a building moves.
    graphEdges = graphNodes.map(() => []);
    for (let i = 0; i < graphNodes.length; i++) for (let j = i + 1; j < graphNodes.length; j++) if (distance(graphNodes[i],graphNodes[j])<28 && lineClear(graphNodes[i], graphNodes[j])) {
      const length = routeCost(graphNodes[i], graphNodes[j]); graphEdges[i].push([j, length]); graphEdges[j].push([i, length]);
    }
  }

  function safePoint(point) {
    if (!blocked(point)) return { ...point };
    for (let radius = 0.7; radius < 40; radius += 0.7) for (let i = 0; i < 16; i++) {
      const candidate = { x: clamp(point.x + Math.cos(i * Math.PI / 8) * radius, WORLD.minX+1, WORLD.maxX-1), z: clamp(point.z + Math.sin(i * Math.PI / 8) * radius, WORLD.minZ+1, WORLD.maxZ-1) };
      if (!blocked(candidate)) return candidate;
    }
    return { x: GATE.x, z: GATE.z };
  }

  function door(buildingId) {
    const b = BUILDING[buildingId], p = buildingPoint(buildingId);
    return [{ x: p.x, z: p.z + b.d / 2 + 0.6 }, { x: p.x + b.w / 2 + 0.6, z: p.z }, { x: p.x - b.w / 2 - 0.6, z: p.z }, { x: p.x, z: p.z - b.d / 2 - 0.6 }].find(p => !blocked(p)) ?? safePoint(p);
  }

  function pathBetween(from, to) {
    if (blocked(from) || blocked(to)) return [];
    const sameArena=arenaAt(from.x,from.z,1);
    if ((distance(from,to)<2.5 || (sameArena&&arenaContains(sameArena.id,to.x,to.z,1))) && lineClear(from,to))return [{...to}];
    const count = graphNodes.length, nodes = [...graphNodes, from, to], edges = graphEdges.map(list => [...list]);
    edges.push([], []);
    for (let i = 0; i < count; i++) for (const end of [count, count + 1]) if (lineClear(nodes[i], nodes[end])) {
      const length = routeCost(nodes[i], nodes[end]); edges[i].push([end, length]); edges[end].push([i, length]);
    }
    if(lineClear(from,to)){const cost=routeCost(from,to);edges[count].push([count+1,cost]);edges[count+1].push([count,cost]);}
    const lengths = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = new Set(); lengths[count] = 0;
    for (let step = 0; step < nodes.length; step++) {
      let current = -1;
      for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (current < 0 || lengths[i] < lengths[current])) current = i;
      if (current < 0 || !Number.isFinite(lengths[current]) || current === count + 1) break;
      visited.add(current);
      for (const [next, length] of edges[current]) if (!visited.has(next) && lengths[current] + length < lengths[next]) { lengths[next] = lengths[current] + length; previous[next] = current; }
    }
    if (previous[count + 1] < 0) return [];
    const path = [];
    for (let i = count + 1; i !== count; i = previous[i]) path.unshift({ ...nodes[i] });
    return path;
  }

  function route(h, points) {
    h.route = []; let from = { x: h.x, z: h.z };
    for (const point of points) {
      const to = safePoint(point), leg = pathBetween(from, to);
      if (!leg.length && distance(from, to) > 0.05) { h.route = []; return false; }
      h.route.push(...leg); from = to;
    }
    return true;
  }

  function updateStats(h, preserveRatio = false) {
    const ratio = h.maxHp > 0 ? clamp(h.hp / h.maxHp, 0, 1) : 1;
    const c = CLASS[h.classId], rarity = RARITY[h.rarity].mult, rebirth = 1 + h.rebirths * 0.35;
    h.maxHp = Math.round((c.hp + (h.equipment.armor ? 28 : 0)) * (1 + (h.level - 1) * 0.075) * rarity * rebirth * (h.trait === 'stout' ? 1.15 : 1));
    h.attack = Math.round((c.attack + (h.equipment.weapon ? 7 : 0)) * (1 + (h.level - 1) * 0.065) * rarity * rebirth * (1 + h.skillLevel * 0.1) * (1 + h.weaponLevel * 0.07) * (h.trait === 'brave' ? 1.1 : 1));
    h.defense = c.defense + (h.equipment.armor ? 4 : 0) + Math.floor(h.level / 8) + h.rebirths * 2;
    h.range = Math.max(c.range, 1.75); h.speed = c.speed;  // 近戰距離配合角色圖寬(21/28–33 世界像素),不然兩邊疊成一團
    h.hp = preserveRatio ? Math.round(h.maxHp * ratio) : clamp(h.hp ?? h.maxHp, 0, h.maxHp);
  }

  function gainXp(h, amount) {
    if (h.level >= 100) { h.xp = 0; return; }
    const before = h.level; h.xp += amount;
    while (h.level < 100 && h.xp >= xpNeeded(h.level)) { h.xp -= xpNeeded(h.level); h.level++; }
    if (h.level === 100) h.xp = 0;
    if (h.level !== before) { updateStats(h, true); effect('level', h); if (h.level % 5 === 0 || h.level === 100) log(`${h.name} 成長至 Lv.${h.level}。`, 'success'); }
  }

  function depart(h) {
    h.task = null; h.serviceProduct = null; h.serviceStarted = false; h.destination = null; h.inTown = false; h.targetId = null; h.rallying = false; h.status = '出征中'; h.lastTownVisit = state.time;
    const target = state.rally ?? { x: 12 + random() * 6, z: -5 + random() * 8 };
    route(h,[target]);
  }

  function newHunter(classId, position = CAMP, initialIndex = -1) {
    const roll = random(), rarity = initialIndex >= 0 ? ['normal', 'rare', 'normal', 'superior', 'rare'][initialIndex] : roll < 0.55 ? 'normal' : roll < 0.82 ? 'rare' : roll < 0.94 ? 'superior' : roll < 0.99 ? 'heroic' : 'legendary';
    const p = safePoint(position);
    const h = { id: id('h'), name: NAMES[state.hunters.length % NAMES.length], classId, rarity, trait: TRAITS[Math.floor(random() * TRAITS.length)].id, level: initialIndex >= 0 ? 3 + initialIndex % 3 : 1, xp: 0, rebirths: 0, skillLevel: 0, weaponLevel: 0, equipment: { weapon: false, armor: false }, gold: 100, inventory: Object.fromEntries(MATERIAL_KEYS.map(key => [key, 0])), satiety: initialIndex >= 0 ? 70 + initialIndex * 4 : 90, mood: initialIndex >= 0 ? 88 - initialIndex * 4 : 90, stamina: initialIndex >= 0 ? 78 + initialIndex * 2 : 90, x: p.x, z: p.z, hp: CLASS[classId].hp, maxHp: CLASS[classId].hp, status: '出征中', targetId: null, attackTimer: random() * 0.5, route: [], task: null, serviceProduct: null, actionTimer: 0, trainCooldown: 0, reviveTimer: 0, lastTownVisit: state.time, tradedVisit: false, shoppedVisit: false, servedVisit: [], inTown: false };
    updateStats(h); h.hp = h.maxHp; state.hunters.push(h); depart(h); return h;
  }

  function newVisitor() {
    const c = CLASSES[Math.floor(random() * CLASSES.length)], roll = random();
    const rarity = roll < 0.55 ? 'normal' : roll < 0.82 ? 'rare' : roll < 0.94 ? 'superior' : roll < 0.99 ? 'heroic' : 'legendary';
    return { id: id('v'), classId: c.id, rarity, trait: TRAITS[Math.floor(random() * TRAITS.length)].id, cost: Math.round(c.cost * RARITY[rarity].mult) };
  }

  function needProduct(h, inTown = false) {
    if (h.hp < h.maxHp * (inTown ? 0.78 : 0.28)) return 'bandage';
    const threshold = inTown ? 62 : 36;
    if (h.satiety < threshold) return 'food';
    if (h.stamina < threshold) return 'bed';
    if (h.mood < threshold) return 'drink';
    return null;
  }
  function tradeAvailable(h) { return state.buildings.trading > 0 && MATERIAL_KEYS.some(key => h.inventory[key] > 0 && state.tradeRequests[key] > 0 && state.gold >= MATERIALS[key].price); }
  function gearAvailable(h) { return state.buildings.forge > 0 && RECIPES.some(r => !h.equipment[r.type] && state.gearStock[r.type] > 0 && h.gold >= r.price); }

  function goToBuilding(h, buildingId, task) {
    h.task = task; h.destination = buildingId; h.actionTimer = 0; h.targetId = null; h.status = '返村中'; h.rallying = false;
    route(h,[door(buildingId)]);
  }

  function nextTownTask(h) {
    if (!h.tradedVisit && tradeAvailable(h)) { goToBuilding(h, 'trading', 'trade'); return; }
    const product = needProduct(h, true);
    if (product && !h.servedVisit.includes(product)) {
      h.serviceProduct = product; h.serviceStarted = false; goToBuilding(h, PRODUCTS[product].building, 'service'); return;
    }
    if (!h.shoppedVisit && gearAvailable(h)) { goToBuilding(h, 'forge', 'shop'); return; }
    depart(h);
  }

  function returnToTown(h) { h.inTown = true; h.tradedVisit = false; h.shoppedVisit = false; h.servedVisit = []; h.targetId = null; nextTownTask(h); }

  function trade(h) {
    let quantity = 0, coins = 0;
    for (const key of MATERIAL_KEYS) {
      const amount = Math.min(h.inventory[key], state.tradeRequests[key], Math.floor(state.gold / MATERIALS[key].price));
      if (!amount) continue;
      const price = amount * MATERIALS[key].price;
      h.inventory[key] -= amount; state.tradeRequests[key] -= amount; state[key] += amount; state.gold -= price; h.gold += price; quantity += amount; coins += price;
    }
    if (quantity) { state.counts.traded += quantity; effect('loot', h, { text: `收購 ${quantity}`, color: '#e4c97b' }); log(`交易所收購 ${h.name} 的 ${quantity} 份材料，支付 ${coins} 金幣。`, 'loot'); }
    h.tradedVisit = true;
  }

  function shop(h) {
    for (const recipe of RECIPES) if (!h.equipment[recipe.type] && state.gearStock[recipe.type] > 0 && h.gold >= recipe.price) {
      h.gold -= recipe.price; state.gold += recipe.price; state.gearStock[recipe.type]--; h.equipment[recipe.type] = true; state.counts.gearSold++; updateStats(h, true);
      log(`${h.name} 花費 ${recipe.price} 金幣購買${recipe.name}。`, 'success'); effect('upgrade', h);
    }
    h.shoppedVisit = true;
  }

  function beginService(h) {
    const p = PRODUCTS[h.serviceProduct], paid = state.stocks[h.serviceProduct] > 0 && h.gold >= p.price;
    h.serviceStarted = true; h.actionTimer = paid ? 3.2 : 5.2; h.serviceDuration = h.actionTimer;
    h.status = ({ food: '用餐中', drink: '飲用中', bed: '休息中', bandage: '休養中' })[h.serviceProduct];
    if (paid) { h.gold -= p.price; state.gold += p.price; state.stocks[h.serviceProduct]--; state.counts.services++; state.counts.serviceIncome += p.price; }
    else state.counts.basicServices++;
    const current = p.need === 'hp' ? h.hp / h.maxHp * 100 : h[p.need];
    const restore = paid ? p.restore * (1 + (state.buildings[p.building] - 1) * 0.05) : 65;
    h.serviceGain = Math.max(0, Math.min(100, current + restore) - current) / h.serviceDuration;
    h.servicePaid = paid;
    effect('heal', h);
  }

  function walk(h, dt) {
    let available = CLASS[h.classId].speed * dt * (h.status === '返村中' ? 1.2 : 1);
    while (available > 1e-8 && h.route.length) {
      const target = h.route[0], remaining = distance(h, target);
      if (remaining <= available) { h.x = target.x; h.z = target.z; h.route.shift(); available -= remaining; }
      else { h.x += (target.x - h.x) / remaining * available; h.z += (target.z - h.z) / remaining * available; available = 0; }
    }
  }

  function died(h) {
    h.hp = 0; h.reviveTimer = 8; h.status = '復活中'; h.targetId = null; h.route = [];
    if (h.task !== 'dungeon' && h.task !== 'arena') h.task = 'revive';
    h.mood = Math.max(0, h.mood - 12); effect('warning', h); state.counts.deaths++; log(`${h.name} 倒下了，復活聖所正在接引他的靈魂。`, 'warning');
  }

  function revive(h) {
    Object.assign(h, door('sanctuary')); h.hp = Math.round(h.maxHp * 0.65); h.reviveTimer = 0; h.task = null; h.satiety = Math.max(h.satiety, 45); h.stamina = Math.max(h.stamina, 45);
    effect('heal', h); returnToTown(h);
  }

  // 各生態區照原關卡設計出怪:主要魔物＝region.enemy,另有少量次要魔物;強度＝難度倍率 × 該區 risk。
  const REGION_MIX={meadow:['slime','slime','slime','wolf'],forest:['wolf','wolf','slime','wolf'],taiga:['wolf','wolf','golem','wolf'],snow:['golem','golem','wolf','golem'],
    mountain:['golem','golem','golem','wolf'],desert:['golem','wolf','golem','golem'],birch:['slime','slime','wolf','slime']};
  function spawn(type, position = null, regionId = null) {
    const region=REGIONS.find(r=>r.id===(regionId||(position&&regionAt(position.x,position.z).id)||state.region))||REGIONS[1];
    // 出生點取 6 個候選裡離其他魔物最遠的:場上的魔物分散,戰鬥時才不會一出生就疊在一起。
    let proposed=position;
    if(!proposed){let best=-1;for(let i=0;i<6;i++){const c={x:region.x-5+random()*10,z:region.z-5.5+random()*11},gap=Math.min(99,...state.enemies.filter(e=>e.hp>0).map(e=>Math.hypot(e.x-c.x,e.z-c.z)));if(gap>best){best=gap;proposed=c;}}}
    const anchor=(regionId&&ARENAS.find(a=>a.id===regionId))||ARENAS.find(a=>a.id===regionAt(proposed.x,proposed.z).id)||ARENAS.find(a=>a.id===region.id)||ARENAS[0];
    const dx=proposed.x-anchor.x,dz=proposed.z-anchor.z,norm=Math.hypot(dx/anchor.rx,dz/anchor.rz),factor=norm>.82?.82/norm:1;
    const p=safePoint({x:anchor.x+dx*factor,z:anchor.z+dz*factor}),data=ENEMIES[type],multiplier=DIFFICULTIES[state.difficulty].mult*(region.risk||1);
    const e = { id: id('e'), type, x: p.x, z: p.z, hp: Math.round(data.hp * multiplier), maxHp: Math.round(data.hp * multiplier), attack: Math.round(data.attack * multiplier), attackTimer: 0.6 + random(), age: 0 };
    const home=ARENAS.find(a=>a.id===anchor.id)||arenaAt(p.x,p.z,3)||ARENAS[0];e.regionId=home.id;e.homeX=home.x;e.homeZ=home.z;state.enemies.push(e); return e;
  }

  function rewardEnemy(enemy, hunter) {
    if (enemy.rewarded) return;
    enemy.rewarded = true; enemy.hp = 0; state.totalKills++; state.kills = state.totalKills;
    const data = ENEMIES[enemy.type], multiplier = DIFFICULTIES[state.difficulty].mult;
    const gold = Math.round(data.gold * Math.sqrt(multiplier)); hunter.gold += gold;
    for (const [key, amount] of Object.entries(data.drops)) hunter.inventory[key] += amount;
    effect('death', enemy, { enemyType: enemy.type, flipHint: (enemy.hitFromX ?? enemy.x) - (enemy.hitFromZ ?? enemy.z) > enemy.x - enemy.z });
    effect('loot', enemy, { text: `+${gold}`, color: '#efcd82', delay: 0.35 });
    for (const h of state.hunters) if (h.hp > 0 && h.task !== 'dungeon' && h.task !== 'arena' && (distance(h, enemy) < 12 || h === hunter)) gainXp(h, Math.round(data.xp * Math.sqrt(multiplier)));
    if (enemy.type === 'boss') {
      state.bossKills++; state.gems += 5; Object.assign(state.expedition, { active: false, bossHp: 0, cooldown: 55, elapsed: 0 });
      log('暮林領主已被擊敗！村莊獲得 5 顆晶石，獵人帶回稀有戰利品。', 'success'); effect('victory', enemy);
    }
  }

  function refreshQuest() {
    const q = QUESTS[state.quest.index];
    Object.assign(state.quest, { title: q.title, description: q.description, target: q.target, reward: { ...q.reward }, progress: Math.min(q.target, q.metric(state)) });
    state.quest.complete = state.quest.progress >= state.quest.target;
  }

  function dungeonEnemyHp(floor, wave) { return Math.round((220 + floor * 80) * (1 + (wave - 1) * 0.25) * (1 + (floor - 1) * 0.2)); }

  function endDungeon(won) {
    const d = state.dungeon, floor = d.floor;
    d.active = false; d.phase = won ? '勝利' : '撤退'; d.cooldown = won ? 15 : 20;
    if (won) {
      d.bestFloor = Math.max(d.bestFloor, floor); state.counts.dungeonWins++;
      d.reward = { gold: 120 + floor * 40, ore: 10 + floor * 5, gems: 2 + Math.floor(floor / 2) };
      for (const [key, amount] of Object.entries(d.reward)) state[key] += amount;
      log(`地下城第 ${floor} 層突破！村莊獲得 ${d.reward.gold} 金幣、${d.reward.ore} 鐵礦與 ${d.reward.gems} 晶石。`, 'success');
      d.floor = Math.min(100, floor + 1); effect('victory', door('dungeon'));
    } else { d.reward = {}; log(`地下城第 ${floor} 層探險失敗。獵人正撤回村莊休養。`, 'warning'); }
    for (const h of state.hunters.filter(h => d.hunterIds.includes(h.id))) {
      h.task = null;
      if (won) { h.gold += 35 + floor * 10; gainXp(h, 140 + floor * 35); }
      if (h.hp <= 0) { h.task = 'revive'; h.reviveTimer = Math.max(3, h.reviveTimer); h.status = '復活中'; }
      else returnToTown(h);
    }
  }

  function stepDungeon(dt) {
    const d = state.dungeon;
    if (!d.active) return;
    d.time += dt;
    const party = state.hunters.filter(h => d.hunterIds.includes(h.id)), alive = party.filter(h => h.hp > 0);
    if (!alive.length || d.time >= 180) { endDungeon(false); return; }
    if (d.phase === '集結中') {
      if (alive.some(h => h.route.length)) return;
      d.phase = '戰鬥中';
      for (const h of alive) h.status = '地下城戰鬥';
    }
    for (const h of alive) if (h.attackTimer === 0) {
      h.attackTimer = (h.classId === 'sorcerer' ? 1.65 : h.classId === 'ranger' ? 1.2 : 1.1) * (h.trait === 'swift' ? 0.9 : 1);
      d.enemyHp = Math.max(0, d.enemyHp - h.attack); effect('slash', door('dungeon'), { value: h.attack });
      if (h.classId === 'darkknight') h.hp = Math.min(h.maxHp, h.hp + h.attack * 0.08);
      if (d.enemyHp <= 0) break;
    }
    if (d.enemyHp <= 0) {
      if (d.wave >= 3) endDungeon(true);
      else { d.wave++; d.enemyMaxHp = dungeonEnemyHp(d.floor, d.wave); d.enemyHp = d.enemyMaxHp; d.attackTimer = 1.8; }
      return;
    }
    d.attackTimer = Math.max(0, d.attackTimer - dt);
    if (d.attackTimer === 0) {
      d.attackTimer = 1.4;
      const target = alive[Math.floor(random() * alive.length)], damage = Math.max(2, Math.round(13 + d.floor * 4 + d.wave * 2 - target.defense * 0.6));
      target.hp = Math.max(0, target.hp - damage); effect('hit', target, { value: damage });
      if (target.hp === 0) died(target);
    }
  }

  function endArena(won) {
    const a = state.arena; a.active = false; a.cooldown = 25; a.phase = won ? '勝利' : '落敗'; a.reward = won ? 90 + Math.min(10, a.wins) * 15 : 0;
    if (won) { a.wins++; state.gold += a.reward; } else a.losses++;
    for (const h of state.hunters.filter(h => a.hunterIds.includes(h.id))) {
      h.task = null; h.hp = Math.max(h.hp, h.maxHp * 0.35); if (won) { h.gold += 25; gainXp(h, 80); } returnToTown(h);
    }
    log(`競技場模擬對戰${won ? `獲勝，村莊獲得 ${a.reward} 金幣` : '落敗，隊伍已安全撤回'}。`, won ? 'success' : 'warning');
  }

  function stepArena(dt) {
    const a = state.arena; if (!a.active) return;
    a.time += dt;
    const party = state.hunters.filter(h => a.hunterIds.includes(h.id)), alive = party.filter(h => h.hp > 0);
    if (!alive.length || a.time >= 120) { endArena(false); return; }
    if (a.phase === '集結中') { if (alive.some(h => h.route.length)) return; a.phase = '對戰中'; for (const h of alive) h.status = '競技場模擬對戰'; }
    for (const h of alive) if (h.attackTimer === 0) { h.attackTimer = (h.classId === 'sorcerer' ? 1.6 : 1.1) * (h.trait === 'swift' ? 0.9 : 1); a.enemyHp = Math.max(0, a.enemyHp - h.attack); effect('slash', door('training'), { value: h.attack }); if (a.enemyHp <= 0) { endArena(true); return; } }
    a.attackTimer = Math.max(0, a.attackTimer - dt);
    if (a.attackTimer === 0) {
      a.attackTimer = 1.1; const target = alive[Math.floor(random() * alive.length)];
      const damage = Math.max(3, 21 + Math.min(10, a.wins) * 3 - target.defense); target.hp = Math.max(0, target.hp - damage); effect('hit', target, { value: damage });
      if (target.hp === 0) { target.status = '模擬對戰倒下'; target.route = []; }
    }
  }

  function step(dt) {
    state.time += dt; state.day = Math.floor(state.time / 240) + 1;
    state.healCooldown = Math.max(0, state.healCooldown - dt); state.expedition.cooldown = Math.max(0, state.expedition.cooldown - dt); state.dungeon.cooldown = Math.max(0, state.dungeon.cooldown - dt); state.arena.cooldown = Math.max(0, state.arena.cooldown - dt);
    // 定時生怪:每個狩獵區都有自己的族群。目前狩獵區 4.5 秒補一隻、上限 7;其他區 8 秒補一隻、上限 4。
    state.spawnTimer += dt;
    if (state.spawnTimer >= 4.5) { state.spawnTimer -= 4.5; const n = state.enemies.filter(e => e.hp > 0 && e.type !== 'boss' && e.regionId === state.region).length; if (n < 7) { const mix = REGION_MIX[state.region] || REGION_MIX.meadow; spawn(mix[Math.floor(random() * mix.length)], null, state.region); } }
    state.regionSpawn ??= {};
    for (const a of ARENAS) { if (a.id === state.region) continue; state.regionSpawn[a.id] = (state.regionSpawn[a.id] || 0) + dt; if (state.regionSpawn[a.id] < 8) continue; state.regionSpawn[a.id] = 0;
      if (state.enemies.filter(e => e.hp > 0 && e.type !== 'boss' && e.regionId === a.id).length < 4) { const mix = REGION_MIX[a.id]; spawn(mix[Math.floor(random() * mix.length)], null, a.id); } }
    for (const h of state.hunters) {
      h.attackTimer = Math.max(0, h.attackTimer - dt); h.trainCooldown = Math.max(0, h.trainCooldown - dt);
      if (h.hp <= 0) { if (h.task !== 'dungeon' && h.task !== 'arena') { if (h.task !== 'revive') died(h); h.reviveTimer = Math.max(0, h.reviveTimer - dt); if (h.reviveTimer === 0) revive(h); } continue; }
      if (h.task === 'dungeon' || h.task === 'arena') { walk(h, dt); h.stamina = Math.max(0, h.stamina - dt * 0.2); continue; }
      const consumption = (h.task ? 0.3 : (state.rally&&h.status==='出征中') ? 0.42 : 1) * (h.trait === 'frugal' ? 0.85 : 1);
      h.satiety = Math.max(0, h.satiety - dt * 0.95 * consumption); h.stamina = Math.max(0, h.stamina - dt * 0.76 * consumption); h.mood = Math.max(0, h.mood - dt * 0.55 * consumption * (h.trait === 'cheerful' ? 0.5 : 1));
      if (h.task === 'trade' || h.task === 'shop' || h.task === 'service') {
        if (h.route.length) { walk(h, dt); continue; }
        if (h.task === 'service') {
          if (!h.serviceStarted) beginService(h);
          const product = PRODUCTS[h.serviceProduct], gain = h.serviceGain * Math.min(dt, h.actionTimer);
          if (product.need === 'hp') h.hp = Math.min(h.maxHp, h.hp + gain / 100 * h.maxHp); else h[product.need] = Math.min(100, h[product.need] + gain);
          h.actionTimer = Math.max(0, h.actionTimer - dt);
          if (h.actionTimer === 0) { h.servedVisit.push(h.serviceProduct); h.serviceStarted = false; effect('heal', h); nextTownTask(h); }
        } else {
          h.status = h.task === 'trade' ? '交易中' : '購買裝備'; h.actionTimer += dt;
          if (h.actionTimer >= 1.3) { if (h.task === 'trade') trade(h); else shop(h); nextTownTask(h); }
        }
        continue;
      }
      const bagSize = MATERIAL_KEYS.reduce((sum, key) => sum + h.inventory[key], 0);
      if (needProduct(h) || (bagSize >= 14 && tradeAvailable(h) && state.time - h.lastTownVisit > 12) || (state.time - h.lastTownVisit > 60 && gearAvailable(h))) { returnToTown(h); continue; }
      if (h.rallying) { walk(h, dt); if (!h.route.length) h.rallying = false; continue; }
      const available = state.enemies.filter(e => e.hp > 0 && (e.regionId === state.region || e.type === 'boss' || distance(h, e) < 4));  // 只打目前狩獵區的魔物(路上被攔截也會還手)
      let target = available.find(e => e.id === h.targetId);
      if (!target || (state.expedition.active && target.type !== 'boss')) {
        target = state.expedition.active ? available.find(e => e.type === 'boss') : null;
        target ??= available.sort((a, b) => distance(h, a) - distance(h, b))[0]; h.targetId = target?.id ?? null;
      }
      // 先走進戰鬥空地再開打(不在橋上、柵欄邊遠遠放箭),戰鬥才會在開闊處、看得清楚。
      if (target && !inVillage(h.x,h.z) && distance(h, target) <= h.range && ((arenaAt(h.x, h.z, -0.6) && !isBridge(h.x, h.z) && !isBridge(h.x - 1.2, h.z)) || distance(h, target) <= 1.9)) {
        h.status = '戰鬥中'; h.route = [];
        if (h.attackTimer === 0) {
          h.attackTimer = (h.classId === 'sorcerer' ? 1.65 : h.classId === 'ranger' ? 1.2 : 1.1) * (h.trait === 'swift' ? 0.9 : 1);
          const damage = Math.max(1, Math.round(h.attack * (h.satiety < 15 || h.stamina < 15 ? 0.6 : 1)));
          // 動畫用時間戳(只給畫面看,不影響結算):出手瞬間、命中時刻(遠程要等箭/法球飛到)、攻擊方向。
          const kind = h.classId === 'sorcerer' ? 'spell' : h.classId === 'ranger' ? 'arrow' : h.classId === 'priest' ? 'holy' : 'slash', delay = kind === 'arrow' ? 0.2 : kind === 'spell' ? 0.25 : kind === 'holy' ? 0.16 : 0.07;
          h.atkAt = state.time; h.atkX = target.x; h.atkZ = target.z; target.hitAt = state.time + delay; target.hitFromX = h.x; target.hitFromZ = h.z;
          target.hp -= damage; effect(kind, target, { sourceX: h.x, sourceZ: h.z, value: damage, targetId: target.id, delay, cls: h.classId, crit: damage >= h.attack * 1.25 });
          if (h.classId === 'darkknight') h.hp = Math.min(h.maxHp, h.hp + damage * 0.08);
          if (target.hp <= 0) rewardEnemy(target, h);
        }
      } else {
        h.status = '出征中';
        if (inVillage(h.x,h.z)) { if (!h.route.length) depart(h); }
        else if (target) { const tail = h.route.at(-1); if (!tail || distance(tail, target) > 0.7) route(h, [{ x: target.x, z: target.z }]); }
        else if (!h.route.length && state.rally && distance(h, state.rally) > 1) route(h, [state.rally]);
        walk(h, dt); if (!target && !h.route.length) h.status = '待命';
      }
    }
    // 每位獵人同時最多兩隻魔物近身(首領不佔名額),其他在 3.4 格外等空位:一對一、一對二,誰打誰看得清楚。
    const slots = new Map();
    for (const e of state.enemies) if (e.hp > 0 && e.engaged && e.slotFor) slots.set(e.slotFor, (slots.get(e.slotFor) || 0) + 1);
    const fieldOk = p => arenaContains(p.regionId, p.x, p.z, .2) && !inVillage(p.x, p.z) && !isBridge(p.x, p.z) && !isBridge(p.x + 1, p.z) && !blocked(p);
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) continue;
      enemy.age += dt; enemy.attackTimer = Math.max(0, enemy.attackTimer - dt);
      const target = state.hunters.filter(h => h.hp > 0 && !inVillage(h.x,h.z) && h.task !== 'dungeon' && h.task !== 'arena').sort((a, b) => distance(enemy, a) - distance(enemy, b))[0];
      if(!target || !arenaContains(enemy.regionId||state.region,target.x,target.z,.8)){enemy.engaged=false;
        // 閒晃:沒有獵人時在自己的狩獵區裡慢慢走到隨機一點、停一下再換點(不會只站在原地)。
        const ar=ARENAS.find(a=>a.id===enemy.regionId);
        if(ar&&(enemy.wanderX==null||state.time>enemy.wanderUntil)){const t=random()*Math.PI*2,r=Math.sqrt(random())*.6;enemy.wanderX=ar.x+Math.cos(t)*ar.rx*r;enemy.wanderZ=ar.z+Math.sin(t)*ar.rz*r;enemy.wanderUntil=state.time+5+random()*6;}
        const home={x:enemy.wanderX??enemy.homeX??enemy.x,z:enemy.wanderZ??enemy.homeZ??enemy.z},dd=distance(enemy,home);if(dd>.3){const step=Math.min(ENEMIES[enemy.type].speed*dt*.45,dd),p={x:enemy.x+(home.x-enemy.x)/dd*step,z:enemy.z+(home.z-enemy.z)/dd*step};if(!blocked(p)&&lineClear(enemy,p)&&(!ar||arenaContains(ar.id,p.x,p.z,.2)))Object.assign(enemy,p);else enemy.wanderUntil=0;}continue;
      }
      if (distance(enemy, target) > (enemy.type === 'boss' ? 18 : 10)) continue;
      const reach = enemy.type === 'boss' ? 2.8 : 1.7, d = distance(enemy, target);
      enemy.facingX = target.x; enemy.facingZ = target.z;
      const mine = enemy.engaged && enemy.slotFor === target.id, free = mine || enemy.type === 'boss' || (slots.get(target.id) || 0) < 2;
      if (!free) {
        enemy.engaged = false; const want = d > 3.7 ? Math.min(ENEMIES[enemy.type].speed * dt, d - 3.4) : d < 3.0 ? -Math.min(ENEMIES[enemy.type].speed * 0.5 * dt, 3.2 - d) : 0;
        if (want) { const p = { x: enemy.x + (target.x - enemy.x) / d * want, z: enemy.z + (target.z - enemy.z) / d * want, regionId: enemy.regionId || state.region }; if (fieldOk(p) && lineClear(enemy, p)) { enemy.x = p.x; enemy.z = p.z; } }
        continue;
      }
      enemy.engaged = d <= reach; if (enemy.engaged && !mine) { enemy.slotFor = target.id; if (enemy.type !== 'boss') slots.set(target.id, (slots.get(target.id) || 0) + 1); }
      if (d > reach) {
        const delta = Math.min(ENEMIES[enemy.type].speed * dt, d - reach * 0.8), p = { x: clamp(enemy.x + (target.x - enemy.x) / d * delta,WORLD.minX+1,WORLD.maxX-1), z: enemy.z + (target.z - enemy.z) / d * delta };
        if (arenaContains(enemy.regionId||state.region,p.x,p.z,.2) && !inVillage(p.x,p.z) && !isBridge(p.x,p.z) && !isBridge(p.x+1,p.z) && !blocked(p) && lineClear(enemy, p)) Object.assign(enemy, p);  // 魔物不上橋:戰鬥留在開闊的空地
      } else if (enemy.attackTimer === 0) {
        enemy.attackTimer = enemy.type === 'boss' ? 1.5 : 1.8;
        const damage = Math.max(2, Math.round(enemy.attack - target.defense * 0.7));
        enemy.atkAt = state.time; enemy.atkX = target.x; enemy.atkZ = target.z; target.hitAt = state.time + 0.1; target.hitFromX = enemy.x; target.hitFromZ = enemy.z;
        target.hp = Math.max(0, target.hp - damage); effect('hit', target, { value: damage, sourceX: enemy.x, sourceZ: enemy.z, delay: 0.1, by: enemy.type }); if (target.hp === 0) died(target);
      }
    }
    state.enemies = state.enemies.filter(e => e.hp > 0);
    // 分散站位:同一場戰鬥的魔物、獵人不疊在同一點(畫面才看得清誰在打誰)。只推開、不改目標。
    const spread = (list, minD) => { for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz); if (d >= minD) continue;
      const ux = d > 1e-4 ? dx / d : Math.cos(i * 2.4 + j), uz = d > 1e-4 ? dz / d : Math.sin(i * 2.4 + j), push = Math.min(2.4 * dt, (minD - d) / 2);
      for (const [o, sign] of [[a, -1], [b, 1]]) { const q = { x: o.x + ux * push * sign, z: o.z + uz * push * sign };
        if (!blocked(q) && !inVillage(q.x, q.z) && (!o.regionId || (arenaContains(o.regionId, q.x, q.z, .2) && !isBridge(q.x, q.z)))) Object.assign(o, q); } } };
    spread(state.enemies, 2.6);
    spread(state.hunters.filter(h => h.hp > 0 && h.status === '戰鬥中'), 2.0);
    if (state.expedition.active) {
      state.expedition.elapsed += dt; const boss = state.enemies.find(e => e.type === 'boss');
      state.expedition.bossHp = boss?.hp ?? 0; state.expedition.bossMaxHp = boss?.maxHp ?? 1150;
      if (!boss || state.expedition.elapsed >= 210) {
        state.enemies = state.enemies.filter(e => e.type !== 'boss'); Object.assign(state.expedition, { active: false, bossHp: 0, cooldown: 35, elapsed: 0 });
        log('領主退回暮霧深處。休整後可以再次討伐。', 'warning');
      }
    }
    stepDungeon(dt); stepArena(dt);
    for (const e of state.effects) e.age += dt;
    state.effects = state.effects.filter(e => e.age < (e.type === 'victory' ? 3 : 1.6)); refreshQuest();
  }

  function fresh() {
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, { version: 2, layoutRevision: 2, worldRevision: 3, region: 'meadow', visitedRegions:['village','meadow'], gold: 1500, wood: 160, ore: 120, herb: 60, cloth: 60, flour: 80, leather: 50, gems: 20, day: 1, time: 0, paused: false, speed: 1, difficulty: 0, kills: 0, totalKills: 0, bossKills: 0, recruited: 0, hunters: [], enemies: [], buildings: Object.fromEntries(BUILDINGS.map(b => [b.id, UNBUILT.has(b.id) ? 0 : 1])), layout: Object.fromEntries(BUILDINGS.map(b => [b.id, { x: b.x, z: b.z }])), stocks: { food: 30, drink: 30, bed: 30, bandage: 30 }, gearStock: { weapon: 0, armor: 0 }, tradeRequests: { wood: 30, ore: 40, herb: 30, cloth: 30, flour: 40, leather: 30 }, counts: { crafted: 0, foodCrafted: 0, traded: 0, gearCrafted: 0, weaponsCrafted: 0, gearSold: 0, services: 0, basicServices: 0, serviceIncome: 0, dungeonWins: 0, rebirths: 0, deaths: 0, trained: 0 }, effects: [], log: [], quest: { index: 0, claimed: false }, expedition: { active: false, bossHp: 0, bossMaxHp: 1150, cooldown: 0, elapsed: 0 }, dungeon: { active: false, floor: 1, bestFloor: 0, wave: 0, enemyHp: 0, enemyMaxHp: 0, time: 0, hunterIds: [], reward: {}, cooldown: 0, phase: '待命', attackTimer: 1 }, healCooldown: 0, capacity: 8, spawnTimer: 0, seed: 918273, nextId: 0, rally: null });
    rebuildNavigation();
    state.visitors = [];
    state.arena = { active: false, wins: 0, losses: 0, enemyHp: 0, enemyMaxHp: 0, time: 0, hunterIds: [], cooldown: 0, phase: '待命', attackTimer: 1, opponent: '暮林訓練隊', reward: 0 };
    for (let i = 0; i < 5; i++) newHunter(CLASSES[i % CLASSES.length].id, {x:CAMP.x+i*.6-1.2,z:CAMP.z+i*.2}, i);
    for (let i = 0; i < 3; i++) state.visitors.push(newVisitor());
    spawn('slime', { x: 12, z: -2 }); spawn('slime', { x: 15, z: -4 }); spawn('wolf', { x: 19, z: -6 }); spawn('slime', { x: 18, z: 3 }); spawn('golem', { x: 23, z: -3 });
    for (const a of ARENAS) if (a.id !== 'meadow') for (let i = 0; i < 3; i++) spawn(REGION_MIX[a.id][i], null, a.id);  // 每個狩獵區一開始就有魔物
    log('五位獵人抵達暮影村。準備餐點、收購戰利品，讓小鎮繁盛起來。', 'success'); refreshQuest();
  }

  function validPlacement(buildingId, x, z, layout = state.layout, checkActors = false) {
    const b = BUILDING[buildingId];
    if (!b || !Number.isFinite(x) || !Number.isFinite(z)) return '無效的建築位置。';
    if (buildingId === 'dungeon' && (x !== b.x || z !== b.z)) return '地下城入口的位置固定。';
    if (buildingId !== 'dungeon' && (x - b.w / 2 < VILLAGE_BOUNDS.minX + 1 || x + b.w / 2 > VILLAGE_BOUNDS.maxX - 1.4 || z - b.d / 2 < VILLAGE_BOUNDS.minZ + 1 || z + b.d / 2 > VILLAGE_BOUNDS.maxZ - 1)) return '請把建築完整放在村莊邊界內。';
    for (const other of BUILDINGS) if (other.id !== buildingId && (state.buildings[other.id] > 0 || other.id === 'dungeon')) {
      const p = layout[other.id];
      if (Math.abs(x - p.x) < (b.w + other.w) / 2 + 1.05 && Math.abs(z - p.z) < (b.d + other.d) / 2 + 1.05) return `請與${other.name}保持至少一格通道。`;
    }
    if (checkActors && [...state.hunters, ...state.enemies].some(h => Math.abs(h.x - x) < b.w / 2 + 0.45 && Math.abs(h.z - z) < b.d / 2 + 0.45)) return '這個位置有獵人或魔物經過，請稍後再放置。';
    return null;
  }

  function restore(input) {
    let source = input;
    if (typeof source === 'string') { try { source = JSON.parse(source); } catch { return; } }
    if (!source || typeof source !== 'object' || Array.isArray(source) || source.version !== 2) return;
    state.region=REGIONS.some(r=>r.id===source.region&&r.id!=='village')?source.region:'meadow';
    state.visitedRegions=[...new Set(['village','meadow',...(Array.isArray(source.visitedRegions)?source.visitedRegions.filter(id=>REGIONS.some(r=>r.id===id)):[])])];
    for (const key of RESOURCE_KEYS) state[key] = integer(source[key], state[key], 0, 1e7);
    state.time = number(source.time, 0, 0, 240 * 99999); state.day = Math.floor(state.time / 240) + 1;
    state.paused = source.paused === true; state.speed = integer(source.speed, 1, 1, 3); state.seed = integer(source.seed, 918273, 0, 4294967295); state.nextId = integer(source.nextId, state.nextId, state.nextId, 1e9);
    for (const key of ['totalKills', 'bossKills', 'recruited']) state[key] = integer(source[key], 0, 0, 1e7);
    state.kills = state.totalKills;
    state.buildings.hall = integer(source.buildings?.hall, 1, 1, 5);
    for (const b of BUILDINGS) if (b.id !== 'hall') state.buildings[b.id] = integer(source.buildings?.[b.id], UNBUILT.has(b.id) ? 0 : 1, UNBUILT.has(b.id) ? 0 : 1, Math.min(5, state.buildings.hall + 1));
    state.capacity = 8 + (state.buildings.house - 1) * 2;
    const matchesLayout=old=>BUILDINGS.every(b=>{const p=source.layout?.[b.id],previous=old[b.id];return !p||(p.x===previous.x&&p.z===previous.z);});
    const migrateDefault=(source.layoutRevision!==2&&matchesLayout(LEGACY_LAYOUT_V14))||matchesLayout(LEGACY_LAYOUT_V15)||matchesLayout(LEGACY_LAYOUT_V16)||ART_LAYOUT_HISTORY.some(matchesLayout);
    const inputLayout=migrateDefault?Object.fromEntries(BUILDINGS.map(b=>[b.id,{x:b.x,z:b.z}])):source.layout;
    const layout = Object.fromEntries(BUILDINGS.map(b => { const sc = number(inputLayout?.[b.id]?.s, 1, .6, 1.6); return [b.id, { x: number(inputLayout?.[b.id]?.x, b.x, WORLD.minX + 1, 28), z: number(inputLayout?.[b.id]?.z, b.z, VILLAGE_BOUNDS.minZ, VILLAGE_BOUNDS.maxZ), ...(sc !== 1 ? { s: sc } : {}) }]; }));
    state.layout = layout;
    rebuildNavigation();
    for (const key of PRODUCT_KEYS) state.stocks[key] = integer(source.stocks?.[key], 30, 0, 1e5);
    for (const key of ['weapon', 'armor']) state.gearStock[key] = integer(source.gearStock?.[key], 0, 0, 1e4);
    for (const key of MATERIAL_KEYS) state.tradeRequests[key] = integer(source.tradeRequests?.[key], state.tradeRequests[key], 0, 999);
    for (const key of Object.keys(state.counts)) state.counts[key] = integer(source.counts?.[key], 0, 0, 1e7);
    state.healCooldown = number(source.healCooldown, 0, 0, 40); state.spawnTimer = number(source.spawnTimer, 0, 0, 4.5);
    if (source.rally && Number.isFinite(source.rally.x) && Number.isFinite(source.rally.z)) state.rally = safePoint({ x: clamp(source.rally.x,WORLD.minX+1,WORLD.maxX-1), z: clamp(source.rally.z,WORLD.minZ+1,WORLD.maxZ-1) });
    if (Array.isArray(source.hunters) && source.hunters.some(h => h && own(CLASS, h.classId))) {
      state.hunters = []; const usedIds = new Set();
      for (const raw of source.hunters.filter(h => h && own(CLASS, h.classId)).slice(0, state.capacity)) {
        const h = newHunter(raw.classId, safePoint({ x: number(raw.x,CAMP.x,WORLD.minX+1,WORLD.maxX-1), z: number(raw.z,CAMP.z,WORLD.minZ+1,WORLD.maxZ-1) }));
        if (typeof raw.id === 'string' && /^h\d{1,10}$/.test(raw.id) && !usedIds.has(raw.id)) { h.id = raw.id; state.nextId = Math.max(state.nextId, Number(raw.id.slice(1))); }
        usedIds.add(h.id);
        h.name = typeof raw.name === 'string' ? raw.name.replace(/[<>&"'`\x00-\x1f]/g, '').slice(0, 16) || h.name : h.name;
        h.rarity = own(RARITY, raw.rarity) ? raw.rarity : 'normal'; h.trait = TRAITS.some(t => t.id === raw.trait) ? raw.trait : h.trait;
        h.level = integer(raw.level, 1, 1, 100); h.xp = h.level === 100 ? 0 : number(raw.xp, 0, 0, xpNeeded(h.level) - 0.001); h.rebirths = integer(raw.rebirths, 0, 0, 20); h.skillLevel = integer(raw.skillLevel, 0, 0, 5);
        h.equipment = { weapon: raw.equipment?.weapon === true, armor: raw.equipment?.armor === true }; h.weaponLevel = h.equipment.weapon ? integer(raw.weaponLevel, 0, 0, 10) : 0;
        h.gold = integer(raw.gold, 100, 0, 1e7); for (const key of MATERIAL_KEYS) h.inventory[key] = integer(raw.inventory?.[key], 0, 0, 1e5);
        for (const key of ['satiety', 'mood', 'stamina']) h[key] = number(raw[key], 80, 0, 100);
        updateStats(h); h.hp = number(raw.hp, h.maxHp, 0, h.maxHp); h.attackTimer = number(raw.attackTimer, 0, 0, 2); h.trainCooldown = number(raw.trainCooldown, 0, 0, 10); h.lastTownVisit = number(raw.lastTownVisit, state.time, 0, state.time);
        if (h.hp === 0) { h.task = 'revive'; h.reviveTimer = number(raw.reviveTimer, 5, 0.1, 8); h.status = '復活中'; h.route = []; }
        else if (raw.task === 'service' && raw.serviceStarted === true && own(PRODUCTS, raw.serviceProduct)) {
          // Continue an already-paid service instead of charging its fee again after reload.
          const product = PRODUCTS[raw.serviceProduct];
          Object.assign(h, door(product.building)); h.task = 'service'; h.inTown = true; h.destination = product.building; h.serviceProduct = raw.serviceProduct; h.serviceStarted = true; h.servicePaid = raw.servicePaid === true; h.route = [];
          h.serviceDuration = number(raw.serviceDuration, 3.2, 0.1, 8); h.actionTimer = number(raw.actionTimer, 0.1, 0, h.serviceDuration); h.serviceGain = number(raw.serviceGain, 0, 0, 100);
          h.status = ({ food: '用餐中', drink: '飲用中', bed: '休息中', bandage: '休養中' })[raw.serviceProduct]; h.tradedVisit = raw.tradedVisit === true; h.shoppedVisit = raw.shoppedVisit === true;
          h.servedVisit = Array.isArray(raw.servedVisit) ? [...new Set(raw.servedVisit.filter(key => own(PRODUCTS, key)))] : [];
        } else if (raw.inTown || needProduct(h)) returnToTown(h); else depart(h);
      }
    }
    const rebirths = state.hunters.reduce((n, h) => n + h.rebirths, 0);
    state.difficulty = integer(source.difficulty, 0, 0, DIFFICULTIES.length - 1); if (DIFFICULTIES[state.difficulty].rebirths > rebirths) state.difficulty = 0;
    state.counts.rebirths = Math.max(state.counts.rebirths, rebirths);
    if (Array.isArray(source.visitors)) {
      const visitors = source.visitors.filter(v => v && own(CLASS, v.classId) && own(RARITY, v.rarity)).slice(0, 3).map(v => ({ id: id('v'), classId: v.classId, rarity: v.rarity, trait: TRAITS.some(t => t.id === v.trait) ? v.trait : 'brave', cost: Math.round(CLASS[v.classId].cost * RARITY[v.rarity].mult) }));
      while (visitors.length < 3) visitors.push(newVisitor()); state.visitors = visitors;
    }
    state.quest = { index: integer(source.quest?.index, 0, 0, QUESTS.length - 1), claimed: source.quest?.claimed === true && source.quest?.index === QUESTS.length - 1 };
    state.enemies = [];
    if (Array.isArray(source.enemies)) for (const raw of source.enemies.filter(e => e && own(ENEMIES, e.type) && e.type !== 'boss').slice(0, 40)) {
      const e = spawn(raw.type, { x: number(raw.x,16,WORLD.minX+1,WORLD.maxX-1), z: number(raw.z,-2,WORLD.minZ+1,WORLD.maxZ-1) }); e.hp = number(raw.hp, e.maxHp, 1, e.maxHp); e.attackTimer = number(raw.attackTimer, 1, 0, 2); e.age = number(raw.age, 0, 0, 1e7);
    }
    if (!state.enemies.length) { spawn('slime', { x: 12, z: -2 }); spawn('wolf', { x: 19, z: -6 }); }
    state.expedition.cooldown = number(source.expedition?.cooldown, 0, 0, 60);
    if (source.expedition?.active === true) { const boss = spawn('boss', { x: 23, z: -7 }); boss.hp = number(source.expedition.bossHp, boss.maxHp, 1, boss.maxHp); Object.assign(state.expedition, { active: true, bossHp: boss.hp, bossMaxHp: boss.maxHp, elapsed: number(source.expedition.elapsed, 0, 0, 210) }); }
    const rawDungeon = source.dungeon, d = state.dungeon;
    d.bestFloor = integer(rawDungeon?.bestFloor, 0, 0, 99); d.floor = d.bestFloor + 1; d.cooldown = number(rawDungeon?.cooldown, 0, 0, 20);
    const selected = Array.isArray(rawDungeon?.hunterIds) ? [...new Set(rawDungeon.hunterIds)].filter(hid => state.hunters.some(h => h.id === hid)).slice(0, 3) : [];
    if (rawDungeon?.active === true && state.buildings.dungeon && selected.length === 3) {
      d.active = true; d.hunterIds = selected; d.phase = '集結中'; d.wave = integer(rawDungeon.wave, 1, 1, 3); d.time = number(rawDungeon.time, 0, 0, 180); d.enemyMaxHp = dungeonEnemyHp(d.floor, d.wave); d.enemyHp = number(rawDungeon.enemyHp, d.enemyMaxHp, 1, d.enemyMaxHp); d.attackTimer = number(rawDungeon.attackTimer, 1, 0, 2);
      for (const h of state.hunters.filter(h => selected.includes(h.id))) { h.task = 'dungeon'; h.status = h.hp > 0 ? '地下城集結' : '復活中'; h.destination = 'dungeon'; route(h, [door('dungeon')]); }
    }
    const a = state.arena, rawArena = source.arena;
    a.wins = integer(rawArena?.wins, 0, 0, 1e6); a.losses = integer(rawArena?.losses, 0, 0, 1e6); a.cooldown = number(rawArena?.cooldown, 0, 0, 25);
    const arenaIds = Array.isArray(rawArena?.hunterIds) ? [...new Set(rawArena.hunterIds)].filter(hid => state.hunters.some(h => h.id === hid && h.task !== 'dungeon')).slice(0, 3) : [];
    if (rawArena?.active === true && state.buildings.training > 0 && arenaIds.length === 3) {
      Object.assign(a, { active: true, phase: '集結中', hunterIds: arenaIds, time: number(rawArena.time, 0, 0, 120), enemyMaxHp: 720 + Math.min(10, a.wins) * 130, attackTimer: number(rawArena.attackTimer, 1, 0, 2) }); a.enemyHp = number(rawArena.enemyHp, a.enemyMaxHp, 1, a.enemyMaxHp);
      for (const h of state.hunters.filter(h => arenaIds.includes(h.id))) { h.task = 'arena'; h.status = '競技場模擬集結'; h.destination = 'training'; route(h, [door('training')]); }
    }
    state.effects = []; state.log = []; log('存檔已載入。獵人重新整隊，村莊繼續運作。', 'success'); refreshQuest();
  }

  function getUpgradeCost(buildingId) {
    const b = BUILDING[buildingId];
    return b ? Object.fromEntries(Object.entries(b.cost).map(([key, amount]) => [key, Math.round(amount * 1.6 ** Math.max(0, state.buildings[buildingId] - 1))])) : null;
  }

  function rerouteHunters() {
    for (const h of state.hunters) {
      if (h.hp <= 0 || (h.task === 'service' && h.serviceStarted)) continue;
      if (h.destination) route(h, [door(h.destination)]);
      else if (h.route.length) route(h, [h.route.at(-1)]);
    }
  }

  fresh(); restore(saved);
  return {
    state,
    tick(dt) {
      if (state.paused || !Number.isFinite(dt) || dt <= 0) return;
      let remaining = Math.min(dt, 30) * number(state.speed, 1, 1, 3);
      while (remaining > 1e-7) { const size = Math.min(0.1, remaining); step(size); remaining -= size; }
    },
    recruit(classId) {
      const visitorIndex = state.visitors.findIndex(v => v.id === classId), visitor = visitorIndex >= 0 ? state.visitors[visitorIndex] : null;
      const c = CLASS[visitor?.classId ?? classId]; if (!c) return result(false, '找不到這個獵人職業或訪客。');
      if (state.hunters.length >= state.capacity) return result(false, '獵人名額已滿，升級獵人小屋可以增加 2 個名額。');
      const cost = visitor?.cost ?? c.cost; if (state.gold < cost) return result(false, `招募需要 ${cost} 村莊金幣。`);
      state.gold -= cost; const h = newHunter(c.id, door('house')); state.recruited++;
      if (visitor) { h.rarity = visitor.rarity; h.trait = visitor.trait; updateStats(h); h.hp = h.maxHp; state.visitors[visitorIndex] = newVisitor(); }
      log(`${RARITY[h.rarity].name}${c.name} ${h.name} 加入村莊，帶著 100 枚個人金幣。`, 'success'); refreshQuest(); return result(true, `${h.name} 已加入隊伍。`);
    },
    getUpgradeCost,
    construct(buildingId) {
      const b = BUILDING[buildingId]; if (!b) return result(false, '找不到這棟建築。');
      if (state.buildings[buildingId]) return result(false, '這棟建築已經建好。');
      const p = buildingPoint(buildingId), error = validPlacement(buildingId, p.x, p.z, state.layout, true); if (error) return result(false, error);
      if (!canPay(b.cost)) return result(false, '建築資源不足，請先收購或累積所需材料。');
      pay(b.cost); state.buildings[buildingId] = 1; rebuildNavigation(); rerouteHunters(); effect('upgrade', p); log(`${b.name}建造完成。`, 'success'); return result(true, `${b.name}建造完成。`);
    },
    upgrade(buildingId) {
      const b = BUILDING[buildingId]; if (!b) return result(false, '找不到這棟建築。');
      if (!state.buildings[buildingId]) return result(false, '請先建造這棟設施。');
      if (state.buildings[buildingId] >= 5) return result(false, '這棟建築已達最高等級 Lv.5。');
      if (buildingId !== 'hall' && state.buildings[buildingId] + 1 > state.buildings.hall + 1) return result(false, `請先升級城鎮大廳。目前其他建築最高可達 Lv.${state.buildings.hall + 1}。`);
      const cost = getUpgradeCost(buildingId); if (!canPay(cost)) return result(false, '升級資源不足，請收購更多材料或提供獵人服務。');
      pay(cost); state.buildings[buildingId]++; state.capacity = 8 + (state.buildings.house - 1) * 2;
      effect('upgrade', buildingPoint(buildingId)); log(`${b.name} 升至 Lv.${state.buildings[buildingId]}。`, 'success'); refreshQuest(); return result(true, `${b.name}升級完成。${b.effect}`);
    },
    moveBuilding(buildingId, x, z) {
      const b = BUILDING[buildingId]; if (!b) return result(false, '找不到這棟建築。');
      if (buildingId === 'dungeon') return result(false, '地下城入口的位置固定。');
      if (!Number.isFinite(x) || !Number.isFinite(z)) return result(false, '請選擇有效的位置。');
      // 棋盤格:建築一律落在最近的街區正中(四周都是石板街)。目標街區有別的建築就兩棟互換;中央廣場不能蓋。
      const block = blockAt(x, z);
      if (!block) return result(false, '請把建築放在村莊的街區裡。');
      if (block.use === 'plaza') return result(false, '中央雕像廣場要保持開闊，不能蓋建築。');
      if (state.hunters.some(h => h.destination === buildingId && h.serviceStarted)) return result(false, '獵人正在使用這棟設施，請服務結束後再移動。');
      const slot = { x: block.x + (BUILDING_NUDGE[buildingId]?.x || 0), z: block.z + (BUILDING_NUDGE[buildingId]?.z || 0) }, here = state.layout[buildingId];
      const other = BUILDINGS.find(o => o.id !== buildingId && o.id !== 'dungeon' && blockAt(state.layout[o.id].x, state.layout[o.id].z) === block);
      if (other && state.hunters.some(h => h.destination === other.id && h.serviceStarted)) return result(false, `獵人正在使用${other.name}，請稍後再交換位置。`);
      if (other) { const ob = blockAt(here.x, here.z); state.layout[other.id] = { ...state.layout[other.id], x: ob ? ob.x + (BUILDING_NUDGE[other.id]?.x || 0) : here.x, z: ob ? ob.z + (BUILDING_NUDGE[other.id]?.z || 0) : here.z }; }
      state.layout[buildingId] = { ...here, x: slot.x, z: slot.z }; rebuildNavigation(); rerouteHunters();
      log(other ? `${b.name}和${other.name}交換了位置。` : `${b.name}已搬到新街區。`); return result(true, other ? `${b.name}與${other.name}互換位置。` : `${b.name}移動完成。`);
    },
    // 建築大小(只影響外觀):0.6～1.6 倍;畫面上還會再限制在街區能容納的最大尺寸(不壓到街道)。
    scaleBuilding(buildingId, factor) {
      const b = BUILDING[buildingId]; if (!b || buildingId === 'dungeon') return result(false, '這棟建築不能調整大小。');
      if (!Number.isFinite(factor) || factor <= 0) return result(false, '無效的倍率。');
      const cur = state.layout[buildingId].s ?? 1, next = Math.round(Math.max(.6, Math.min(1.6, cur * factor)) * 20) / 20;
      if (next === cur) return result(false, next >= 1.6 ? '已經是最大尺寸。' : '已經是最小尺寸。');
      if (next === 1) { const { s: _drop, ...rest } = state.layout[buildingId]; state.layout[buildingId] = rest; } else state.layout[buildingId] = { ...state.layout[buildingId], s: next };
      return result(true, `${b.name}大小 ${Math.round(next * 100)}%`);
    },
    craft(productId, batches = 1) {
      if (!own(PRODUCTS, productId)) return result(false, '找不到這項商品。');
      if (!Number.isInteger(batches) || batches < 1 || batches > 100) return result(false, '製作批次必須是 1 至 100 的整數。');
      const product = PRODUCTS[productId]; if (!state.buildings[product.building]) return result(false, '請先建造對應的生產設施。');
      const cost = Object.fromEntries(Object.entries(product.cost).map(([key, amount]) => [key, amount * batches])); if (!canPay(cost)) return result(false, '原料不足，請到交易所發布材料收購委託。');
      pay(cost); const amount = product.amount * batches; state.stocks[productId] += amount; state.counts.crafted += amount; if (productId === 'food') state.counts.foodCrafted += amount;
      effect('harvest', buildingPoint(product.building)); log(`${product.name} ${amount} 份已準備好。`, 'success'); refreshQuest(); return result(true, `已製作 ${amount} 份${product.name}。`);
    },
    craftEquipment(recipeId) {
      const recipe = RECIPE[recipeId]; if (!recipe) return result(false, '找不到這份裝備配方。');
      if (!state.buildings.forge) return result(false, '請先建造鐵匠鋪。');
      if (!canPay(recipe.cost)) return result(false, '裝備材料不足，請先收購所需戰利品。');
      pay(recipe.cost); state.gearStock[recipe.type]++; state.counts.gearCrafted++; if (recipe.type === 'weapon') state.counts.weaponsCrafted++;
      effect('upgrade', buildingPoint('forge')); log(`${recipe.name}已上架；獵人返村後會用個人金幣購買。`, 'success'); refreshQuest(); return result(true, `${recipe.name}已製作，售價 ${recipe.price} 金幣。`);
    },
    enhance(hunterId) {
      const h = state.hunters.find(h => h.id === hunterId); if (!h) return result(false, '找不到這位獵人。');
      if (!state.buildings.enhancement) return result(false, '請先建造強化精煉所。');
      if (!h.equipment.weapon) return result(false, '這位獵人還沒有購買武器。請先在鐵匠鋪製造武器。');
      if (h.weaponLevel >= 10) return result(false, '武器已達最高強化 +10。');
      const cost = { gold: 60 + h.weaponLevel * 30, ore: 6 + h.weaponLevel * 3 }; if (!canPay(cost)) return result(false, `強化需要 ${cost.gold} 村莊金幣與 ${cost.ore} 鐵礦。`);
      pay(cost); h.weaponLevel++; updateStats(h, true); effect('upgrade', h); return result(true, `${h.name}的武器強化為 +${h.weaponLevel}。`);
    },
    train(hunterId) {
      const h = state.hunters.find(h => h.id === hunterId); if (!h) return result(false, '找不到這位獵人。');
      if (!state.buildings.training) return result(false, '請先建造修煉地。');
      if (h.hp <= 0 || h.task === 'dungeon' || h.task === 'arena') return result(false, '這位獵人目前無法參加訓練。');
      if (h.level >= 100) return result(false, '獵人已達 Lv.100，可以前往復活聖所轉世。');
      if (h.trainCooldown > 0) return result(false, `還需要休息 ${Math.ceil(h.trainCooldown)} 秒才能再次訓練。`);
      if (h.gold < 20) return result(false, '獵人自己的金幣不足 20，狩獵或販售材料後才能訓練。');
      h.gold -= 20; state.gold += 20; h.trainCooldown = 10; let xp = 0;
      for (let level = h.level; level < Math.min(100, h.level + 5); level++) xp += xpNeeded(level);
      gainXp(h, xp); state.counts.trained++; effect('level', h); return result(true, `${h.name}支付 20 金幣接受訓練，成長至 Lv.${h.level}。`);
    },
    learnSkill(hunterId) {
      const h = state.hunters.find(h => h.id === hunterId); if (!h) return result(false, '找不到這位獵人。');
      if (!state.buildings.academy) return result(false, '請先建造學院。');
      if (h.skillLevel >= 5) return result(false, '戰鬥技能已達 Lv.5。');
      const cost = { gold: 80 + h.skillLevel * 50, ore: 8 + h.skillLevel * 4 }; if (!canPay(cost)) return result(false, `教學需要 ${cost.gold} 村莊金幣與 ${cost.ore} 鐵礦。`);
      pay(cost); h.skillLevel++; updateStats(h, true); effect('level', h); return result(true, `${h.name}的戰鬥技能提升至 Lv.${h.skillLevel}。`);
    },
    reincarnate(hunterId) {
      const h = state.hunters.find(h => h.id === hunterId); if (!h) return result(false, '找不到這位獵人。');
      if (h.level < 100) return result(false, `轉世需要 Lv.100，${h.name}目前為 Lv.${h.level}。`);
      if (h.hp <= 0 || h.task === 'dungeon' || h.task === 'arena') return result(false, '請等待獵人復活或結束探險與對戰。');
      if (h.rebirths >= 20) return result(false, '這位獵人已完成全部 20 次轉世。');
      h.rebirths++; state.counts.rebirths++; h.level = 1; h.xp = 0; updateStats(h); h.hp = h.maxHp; h.satiety = 100; h.stamina = 100; h.mood = 100; effect('level', h);
      log(`${h.name}完成第 ${h.rebirths} 次轉世！等級重置為 1，基礎能力永久提高。`, 'success'); refreshQuest(); return result(true, `${h.name}完成轉世；能力加成保留，可挑戰更高難度。`);
    },
    setDifficulty(difficultyId) {
      const difficulty = DIFFICULTIES.find(d => d.id === difficultyId); if (!difficulty) return result(false, '找不到這個狩獵難度。');
      if (state.expedition.active || state.dungeon.active || state.arena.active) return result(false, '討伐、地下城或對戰進行中，請結束後再切換難度。');
      const rebirths = state.hunters.reduce((sum, h) => sum + h.rebirths, 0); if (rebirths < difficulty.rebirths) return result(false, `${difficulty.name}難度需要全體獵人累計 ${difficulty.rebirths} 次轉世。`);
      state.difficulty = difficulty.id; state.enemies = []; for (let i = 0; i < 5; i++) spawn(i % 3 === 0 ? 'golem' : i % 3 === 1 ? 'slime' : 'wolf');
      for (const h of state.hunters) h.targetId = null; log(`狩獵難度切換為「${difficulty.name}」。`, 'warning'); return result(true, `已切換為${difficulty.name}難度。`);
    },
    setTradeRequest(materialId, amount) {
      if (!own(MATERIALS, materialId)) return result(false, '找不到這項材料。');
      if (!Number.isInteger(amount) || amount < 0 || amount > 999) return result(false, '收購數量必須是 0 至 999 的整數。');
      state.tradeRequests[materialId] = amount; return result(true, amount ? `已委託收購 ${amount} 份${MATERIALS[materialId].name}，單價 ${MATERIALS[materialId].price} 金幣。` : `已停止收購${MATERIALS[materialId].name}。`);
    },
    heal() {
      if (state.healCooldown > 0) return result(false, `治癒祝福還需 ${Math.ceil(state.healCooldown)} 秒。`);
      for (const h of state.hunters) if (h.hp > 0) { h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.45); effect('heal', h); }
      state.healCooldown = 40; return result(true, '所有存活獵人恢復 45% 生命。');
    },
    expedition() {
      if (state.expedition.active) return result(false, '獵人正在討伐暮林領主。');
      if (state.expedition.cooldown > 0) return result(false, `整備中，${Math.ceil(state.expedition.cooldown)} 秒後可再次討伐。`);
      if (!state.hunters.some(h => h.hp > 0 && h.task !== 'dungeon' && h.task !== 'arena')) return result(false, '目前沒有可出征的獵人。');
      const arena=ARENAS.find(a=>a.id===state.region)||ARENAS[0];const boss = spawn('boss', { x:arena.x+2,z:arena.z-2 }); Object.assign(state.expedition, { active: true, bossHp: boss.hp, bossMaxHp: boss.maxHp, elapsed: 0 });
      for (const h of state.hunters) if (!h.task && h.hp > 0) h.targetId = boss.id;
      log('暮林領主現身！村外獵人開始集結討伐。', 'warning'); effect('boss', boss); return result(true, '暮林領主已出現，獵人正前往討伐！');
    },
    startDungeon(hunterIds = null) {
      if (!state.buildings.dungeon) return result(false, '請先建造地下城入口。');
      const d = state.dungeon; if (d.active) return result(false, '地下城小隊正在探險。');
      if (d.cooldown > 0) return result(false, `小隊整備還需要 ${Math.ceil(d.cooldown)} 秒。`);
      let selected;
      if (hunterIds === null) selected = state.hunters.filter(h => h.hp > 0 && h.task !== 'revive' && h.task !== 'arena').sort((a, b) => b.hp / b.maxHp - a.hp / a.maxHp || b.attack - a.attack).slice(0, 3);
      else {
        if (!Array.isArray(hunterIds) || hunterIds.length !== 3 || new Set(hunterIds).size !== 3) return result(false, '請選擇 3 位不同的存活獵人。');
        selected = hunterIds.map(hid => state.hunters.find(h => h.id === hid)).filter(Boolean);
      }
      if (selected.length !== 3 || selected.some(h => h.hp <= 0 || h.task === 'revive' || h.task === 'arena')) return result(false, '地下城探險需要 3 位未參與競技場的存活獵人。');
      Object.assign(d, { active: true, floor: d.bestFloor + 1, wave: 1, time: 0, hunterIds: selected.map(h => h.id), reward: {}, phase: '集結中', attackTimer: 1.5 }); d.enemyMaxHp = dungeonEnemyHp(d.floor, 1); d.enemyHp = d.enemyMaxHp;
      for (const h of selected) { h.task = 'dungeon'; h.destination = 'dungeon'; h.status = '地下城集結'; h.targetId = null; h.serviceProduct = null; h.serviceStarted = false; route(h, [door('dungeon')]); }
      log(`${selected.map(h => h.name).join('、')}前往地下城第 ${d.floor} 層。`, 'info'); return result(true, '三位獵人已組成小隊，正在前往地下城入口。');
    },
    startArena(hunterIds = null) {
      if (!state.buildings.training) return result(false, '請先建造修煉地，開放競技場模擬對戰。');
      const a = state.arena; if (a.active) return result(false, '模擬對戰正在進行。');
      if (a.cooldown > 0) return result(false, `隊伍還需整備 ${Math.ceil(a.cooldown)} 秒。`);
      let selected;
      if (hunterIds === null) selected = state.hunters.filter(h => h.hp > 0 && h.task !== 'dungeon' && h.task !== 'revive').sort((a, b) => b.hp / b.maxHp - a.hp / a.maxHp || b.attack - a.attack).slice(0, 3);
      else { if (!Array.isArray(hunterIds) || hunterIds.length !== 3 || new Set(hunterIds).size !== 3) return result(false, '請選擇 3 位不同的存活獵人。'); selected = hunterIds.map(hid => state.hunters.find(h => h.id === hid)).filter(Boolean); }
      if (selected.length !== 3 || selected.some(h => h.hp <= 0 || h.task === 'dungeon' || h.task === 'revive')) return result(false, '請準備 3 位未參與地下城的存活獵人。');
      Object.assign(a, { active: true, phase: '集結中', time: 0, hunterIds: selected.map(h => h.id), enemyMaxHp: 720 + Math.min(10, a.wins) * 130, attackTimer: 1.5, reward: 0 }); a.enemyHp = a.enemyMaxHp;
      for (const h of selected) { h.task = 'arena'; h.destination = 'training'; h.status = '競技場模擬集結'; h.targetId = null; h.serviceProduct = null; h.serviceStarted = false; route(h, [door('training')]); }
      log('三人小隊開始與暮林訓練隊進行離線模擬對戰。', 'info'); return result(true, '競技場模擬對戰已開始，對手為 NPC 訓練隊。');
    },
    claimQuest() {
      refreshQuest(); if (!state.quest.complete) return result(false, '委託尚未完成。'); if (state.quest.claimed) return result(false, '全部章節委託已完成。');
      for (const [key, amount] of Object.entries(state.quest.reward)) state[key] += amount;
      log(`委託「${state.quest.title}」完成，獎勵已入庫。`, 'success'); if (state.quest.index < QUESTS.length - 1) state.quest = { index: state.quest.index + 1, claimed: false }; else state.quest.claimed = true;
      refreshQuest(); return result(true, '委託獎勵已領取。');
    },
    setRally(x, z) {
      if (!walkable(x,z) || inVillage(x,z) || blocked({ x, z })) return result(false, '請在村外空地設定集結點。');
      state.rally = { x, z }; effect('rally', state.rally);
      for (const h of state.hunters) if (!h.task && h.hp > 0) { h.targetId = null; h.status = '出征中'; h.rallying = true; route(h,[state.rally]); }
      return result(true, '已設定獵人集結點。');
    },
    exploreRegion(regionId) {
      const region=REGIONS.find(r=>r.id===regionId&&r.id!=='village');if(!region)return result(false,'請選擇村外的生態區。');
      if(state.expedition.active)return result(false,'請先結束目前的首領討伐。');
      state.region=region.id;state.rally=safePoint(region);if(!state.visitedRegions.includes(region.id))state.visitedRegions.push(region.id);
      state.enemies=state.enemies.filter(e=>e.type==='boss'||e.regionId!==region.id);for(let i=0;i<6;i++)spawn(i<4?region.enemy:i===4?'slime':'wolf',null,region.id);
      for(const h of state.hunters)if(!h.task&&h.hp>0){h.targetId=null;h.rallying=true;h.status='出征中';route(h,[state.rally]);}
      log(`已派遣獵人前往${region.name}。隊伍會經由橋樑穿越河流。`,'success');return result(true,`出發探索${region.name}！`);
    },
    serialize() { return JSON.parse(JSON.stringify({ ...state, effects: [], log: [], hunters: state.hunters.map(({ route, ...h }) => h) })); },
    reset() { fresh(); return result(true, '新村莊已建立，五位獵人準備出發。'); },
  };
}
