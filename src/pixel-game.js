import {getRoads,onPaved,doorStand,PALISADE,villagePonds,inPond,buildingSolid,statueSolid} from './landscape-layout.js';
import {createVillageNav} from './village-nav.js';
import {WORLD,REGIONS,walkable,inVillage,regionAt,regionContains,regionEdge,regionCenter,randomRegionPoint,wildAt,nearestRingRoad,ringRoadPath,ringPointAt,onRingRoad,ringRoadDistance} from './overworld.js';
import {VILLAGE_BOUNDS,EXITS,blockAt,BUILDING_NUDGE,BUILDING_SLOTS,blockCenter} from './village-grid.js';
import { SKILLS, BUILDINGS, CLASSES, RARITIES, TRAITS, MATERIALS, PRODUCTS, RECIPES, DIFFICULTIES, CAMP, HUNT_ZONE, PILOT_ATTACK, PILOT_ORB, AI_ATTACK_LOCK, KITE, PROVOKE, MONSTER_RANGED, LEGACY_LAYOUT_V14, LEGACY_LAYOUT_V15, LEGACY_LAYOUT_V16, ART_LAYOUT_HISTORY } from './pixel-data.js';

const mapById = list => Object.assign(Object.create(null), Object.fromEntries(list.map(item => [item.id, item])));
const CLASS = mapById(CLASSES), BUILDING = mapById(BUILDINGS), RARITY = mapById(RARITIES), RECIPE = mapById(RECIPES);
const RESOURCE_KEYS = ['gold', 'wood', 'ore', 'herb', 'cloth', 'flour', 'leather', 'gems'];
const MATERIAL_KEYS = Object.keys(MATERIALS), PRODUCT_KEYS = Object.keys(PRODUCTS);
const UNBUILT = new Set(['academy', 'training', 'enhancement', 'dungeon']);
const GATE = { ...EXITS[0].out };  // 東門外
const NAMES = ['艾登', '莉雅', '羅恩', '賽琳', '伊諾', '芙蕾雅', '瑪琳', '卡爾', '艾莉', '奧斯卡', '薇拉', '雷恩', '希露', '米洛', '露娜', '阿斯特'];
// 英雄與流浪英雄看得到魔物的距離(格):狩獵區很大,看不到的魔物要在區內搜尋才找得到。
const SIGHT = 12;
// 魔物的「主動攻擊範圍」(世界單位):超出這個距離的敵人不會被追、也不會被鎖定。
// 獵人的視野 SIGHT 比它大很多 → 獵人會主動找上門,魔物只在自己地盤上迎戰。
const AGGRO = { boss: 15,
  // 2026-10-26 新增 21 隻(8 方向素材):主動攻擊範圍照體型/速度給
  sprout: 5, ram: 6.5, mole: 4.5, shroom: 5, boar: 7.5, vine: 4.5, wolfman: 8.5, moss: 6, snowhare: 7,
  yeti: 7, snowman: 5, icebeetle: 4.5, kobold: 6, boulder: 4.5, goat: 7, mummy: 5.5, cactus: 4, scorpion: 6.5,
  floraspirit: 5.5, birchling: 5, stag: 8 };
const ENEMIES = {
  // 2026-10-26:舊的 slime / wolf / golem / ogre 從出怪表移除,野外只留 8 方向新魔物(王還是 treant)。
  // 21 隻用 PixelLab 8 方向素材做的(每區 3 隻;數值從小型到大型排) ----
  sprout: { hp: 60, attack: 9, speed: 0.9, gold: 16, xp: 20, drops: { flour: 3, herb: 2 } },
  ram: { hp: 88, attack: 13, speed: 1.25, gold: 22, xp: 27, drops: { flour: 2, leather: 2 } },
  mole: { hp: 75, attack: 11, speed: 0.8, gold: 20, xp: 24, drops: { flour: 2, ore: 1 } },
  shroom: { hp: 70, attack: 12, speed: 0.7, gold: 20, xp: 25, drops: { herb: 3, flour: 1 } },
  boar: { hp: 105, attack: 16, speed: 1.5, gold: 26, xp: 31, drops: { leather: 3, wood: 1 } },
  vine: { hp: 95, attack: 14, speed: 0.62, gold: 24, xp: 29, drops: { wood: 3, herb: 2 } },
  wolfman: { hp: 120, attack: 17, speed: 1.55, gold: 30, xp: 36, drops: { leather: 3, cloth: 1 } },
  moss: { hp: 150, attack: 18, speed: 0.7, gold: 34, xp: 40, drops: { wood: 3, herb: 2, ore: 1 } },
  snowhare: { hp: 85, attack: 13, speed: 1.8, gold: 24, xp: 28, drops: { leather: 2, cloth: 2 } },
  yeti: { hp: 200, attack: 22, speed: 0.65, gold: 44, xp: 52, drops: { ore: 3, leather: 3, wood: 2 } },
  snowman: { hp: 140, attack: 15, speed: 0.75, gold: 32, xp: 37, drops: { ore: 2, cloth: 2 } },
  icebeetle: { hp: 160, attack: 16, speed: 0.6, gold: 34, xp: 39, drops: { ore: 3, herb: 1 } },
  kobold: { hp: 100, attack: 15, speed: 1.1, gold: 26, xp: 30, drops: { ore: 3, wood: 1 } },
  boulder: { hp: 210, attack: 23, speed: 0.5, gold: 46, xp: 54, drops: { ore: 5, wood: 1 } },
  goat: { hp: 130, attack: 18, speed: 1.4, gold: 30, xp: 35, drops: { leather: 2, ore: 2 } },
  mummy: { hp: 130, attack: 17, speed: 0.9, gold: 32, xp: 36, drops: { cloth: 3, herb: 1 } },
  cactus: { hp: 150, attack: 16, speed: 0.5, gold: 32, xp: 37, drops: { herb: 4, flour: 1 } },
  scorpion: { hp: 145, attack: 19, speed: 1.05, gold: 34, xp: 39, drops: { herb: 2, leather: 2 } },
  floraspirit: { hp: 70, attack: 11, speed: 1.3, gold: 22, xp: 26, drops: { herb: 4 } },
  birchling: { hp: 110, attack: 14, speed: 0.85, gold: 26, xp: 31, drops: { wood: 3, herb: 2 } },
  stag: { hp: 125, attack: 16, speed: 1.5, gold: 30, xp: 34, drops: { leather: 3, herb: 1 } },
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
// 這一世累積的經驗(Lv.1 起算):離線外推用
const lifetimeXp = h => { let n = h.xp || 0; for (let l = 1; l < h.level; l++) n += xpNeeded(l); return n; };
// 離線收益:最多算 8 小時;前 sample 秒真的模擬,其餘照這段的速率外推(見 offlineFinish)
export const OFFLINE = { max: 8 * 3600, sample: 120 };

const DEFAULT_SETTINGS = { quality: 'high', dpr: 'auto', fps: 30, shadows: true, night: true };
// 設定面板的畫質/效能選項:只接受合法值,舊存檔缺欄位就補預設
function normalizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === 'object') {
    if (raw.quality === 'low' || raw.quality === 'high') s.quality = raw.quality;
    if (['auto', '1', '1.5', '2'].includes(String(raw.dpr))) s.dpr = String(raw.dpr);
    if (raw.fps === 60 || raw.fps === 30) s.fps = raw.fps;
    if (typeof raw.shadows === 'boolean') s.shadows = raw.shadows;
    if (typeof raw.night === 'boolean') s.night = raw.night;
  }
  return s;
}
export function createGame(saved = null) {
  const state = {};
  let rects = [], roads = [], ponds = [], nav = { nodes: [], edges: [], thru: null }, vnav = null;
  const id = prefix => `${prefix}${++state.nextId}`;
  const random = () => { state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0; return state.seed / 4294967296; };
  const log = (text, tone = 'info') => { state.log.unshift({ id: id('log'), text, tone }); state.log.length = Math.min(32, state.log.length); };
  const effect = (type, p, extra = {}) => { state.effects.push({ id: id('fx'), type, x: p.x, z: p.z, age: 0, ...extra }); if (state.effects.length > 100) state.effects.splice(0, state.effects.length - 100); };
  const canPay = cost => Object.entries(cost).every(([key, amount]) => state[key] >= amount);
  const pay = cost => { for (const [key, amount] of Object.entries(cost)) state[key] -= amount; };
  const buildingPoint = buildingId => state.layout[buildingId];
  // 環村道路是魔物進不去的安全走廊(2026-10-30 使用者:「路上的怪不會主動攻擊路上走路的英雄,踏出道路邊界才會」):
  // 魔物不在路上生、不走上路(閒晃、追擊、等空位、被推開都一樣);已經在路上的(舊存檔)只准往離開道路的方向走。
  const ROAD_PAD = 0.35, roadOk = (from, p) => !onRingRoad(p.x, p.z, ROAD_PAD) || ringRoadDistance(p.x, p.z) > ringRoadDistance(from.x, from.z);
  const blocked = p => !walkable(p.x,p.z)||!walkable(p.x-.2,p.z)||!walkable(p.x+.2,p.z)||!walkable(p.x,p.z-.2)||!walkable(p.x,p.z+.2)||rects.some(r => p.x > r.minX && p.x < r.maxX && p.z > r.minZ && p.z < r.maxZ)||(ponds.length>0&&inVillage(p.x,p.z)&&inPond(ponds,p.x,p.z,.2));

  // 線段是否穿過長方形(slab 測試)。
  function crosses(a, b, r) {
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
  }
  function lineClear(a, b) {
    const steps=Math.ceil(distance(a,b)/.25);for(let i=0;i<=steps;i++){const u=steps?i/steps:0,x=a.x+(b.x-a.x)*u,z=a.z+(b.z-a.z)*u;if(!walkable(x,z))return false;}
    return !rects.some(r => crosses(a, b, r));
  }
  // 村外直線:不能穿過村莊(村界內),進出村一定走兩個出村口。
  const VILLAGE_RECT = { ...VILLAGE_BOUNDS };
  const outdoorClear = (a, b) => !crosses(a, b, VILLAGE_RECT) && lineClear(a, b);

  // 導航 = 村內:0.5 格可走格 + 8 方向 A*(鋪面上自由走,繞開建築;見 village-nav.js)
  //        + 村外可視圖(出村口外、村莊四角外、村外建築四角,直線自由走)。
  // 兩個出村口(村界上的缺口)把村內與村外接起來;穿過村子的兩口之間路徑也預先算好,當成村外圖上的一條邊。
  const GATES = EXITS.map(e => ({ id: e.id, gate: { x: e.x, z: e.z }, out: { ...e.out } }));
  function rebuildNavigation() {
    // 建築實心:用 landscape-layout.js 的 SOLID(蓋住看得見的牆,只讓屋簷探出去);
    // 村莊中央的雕像也是實心,角色要繞過去。下面所有「走不過去」的判斷(blocked/walkable/尋路)都吃這一份。
    rects = BUILDINGS.filter(b => state.buildings[b.id] > 0).map(b => buildingSolid(b, buildingPoint(b.id)));
    rects.push(statueSolid(blockCenter(0, 0)));
    rects.push(...PALISADE);   // 村界木柵欄:實心(出村口是缺口)
    ponds = villagePonds(state.layout, state.buildings);   // 公園池塘:整個村莊都是鋪面,池塘不能踩
    roads = getRoads(state.layout, state.buildings);
    const hit = (list, x, z) => list.some(r => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ);
    // 格子裡 5×5 個取樣點都要在鋪面內(只看四個角會漏掉夾在兩段石板之間、寬約半格的草縫),格子之間的直線才不會踩到草地。
    const pavedCell = (x, z) => { for (let a = -0.25; a <= 0.251; a += 0.125) for (let b = -0.25; b <= 0.251; b += 0.125) if (!onPaved(x + a, z + b, roads)) return false; return true; };
    vnav = createVillageNav((x, z) => inVillage(x, z) && pavedCell(x, z) && !hit(rects, x, z) && !inPond(ponds, x, z, 0.35));
    const nodes = GATES.map(g => ({ ...g.out })), extra = [];
    for (const x of [VILLAGE_RECT.minX - 0.9, VILLAGE_RECT.maxX + 0.9]) for (const z of [VILLAGE_RECT.minZ - 0.9, VILLAGE_RECT.maxZ + 0.9]) extra.push({ x, z });
    for (const r of rects) if (!inVillage((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2)) for (const x of [r.minX - 0.06, r.maxX + 0.06]) for (const z of [r.minZ - 0.06, r.maxZ + 0.06]) extra.push({ x, z });
    for (const p of extra) if (!blocked(p) && !inVillage(p.x, p.z)) nodes.push(p);
    const edges = nodes.map(() => []);
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      if (outdoorClear(nodes[i], nodes[j])) { const d = distance(nodes[i], nodes[j]); edges[i].push([j, d]); edges[j].push([i, d]); }
    }
    let thru = null;
    if (GATES.length === 2) {
      const leg = vnav.path(GATES[0].gate, GATES[1].gate);
      if (leg) { const poly = [GATES[0].out, GATES[0].gate, ...leg, GATES[1].out]; thru = { poly, length: vnav.pathLength(poly[0], poly.slice(1)) }; }
    }
    nav = { nodes, edges, thru };
  }

  function safePoint(point) {
    if (!blocked(point)) return { ...point };
    for (let radius = 0.7; radius < 40; radius += 0.7) for (let i = 0; i < 16; i++) {
      const candidate = { x: clamp(point.x + Math.cos(i * Math.PI / 8) * radius, WORLD.minX+1, WORLD.maxX-1), z: clamp(point.z + Math.sin(i * Math.PI / 8) * radius, WORLD.minZ+1, WORLD.maxZ-1) };
      if (!blocked(candidate)) return candidate;
    }
    return { x: GATE.x, z: GATE.z };
  }

  // 建築的進門點:四面候選點裡能走到的那些。有傳入角色位置時,選「路程最短」的那一面(找最近);沒有就取第一個能用的。
  function door(buildingId, from = null) {
    const b = BUILDING[buildingId], p = buildingPoint(buildingId);
    // 互動點一律以「門口正前方」為主;旁邊的兩個位置只是備案(門口被擋住時),而且要多繞路才會被選到。
    // 舊版還把「建築背面」(-z) 當候選,所以常常看到獵人跑到屋子後面補血、買東西。
    const spots = [[doorStand(b, p), 0], [{ x: p.x + b.w / 2 + 0.6, z: p.z }, 9], [{ x: p.x - b.w / 2 - 0.6, z: p.z }, 9]];
    const open = spots.filter(([q]) => !blocked(q));
    if (!from || !open.length) return (open[0] && open[0][0]) || safePoint(p);
    let best = open[0][0], bestCost = Infinity;
    for (const [q, penalty] of open) {
      const leg = pathBetween(from, q);
      if (!leg.length && distance(from, q) > 0.05) continue;
      let len = penalty, prev = from;
      for (const pt of leg) { len += distance(prev, pt); prev = pt; }
      if (len < bestCost) { bestCost = len; best = q; }
    }
    return best;
  }

  // 村內兩點:鋪面上 8 方向自由走(A*);村外兩點:能直線就直線;一內一外(或繞村/穿村):
  // 在「村外節點 + 兩個出村口 + 起終點」的小圖上跑 Dijkstra,村內那一段用 A*,穿村那條邊用預先算好的兩口路徑。
  function pathBetween(from, to) {
    if (blocked(from) || blocked(to)) return [];
    const fromIn = inVillage(from.x, from.z), toIn = inVillage(to.x, to.z);
    if (fromIn && toIn) return vnav.path(from, to) || [];
    if (!fromIn && !toIn && outdoorClear(from, to)) return [{ ...to }];
    const n0 = nav.nodes.length, pts = [...nav.nodes, from, to], S = n0, T = n0 + 1, adj = pts.map(() => []);   // adj: [到哪, 長度, 沿途點(含終點)]
    const link = (a, b, len, poly) => adj[a].push([b, len, poly]);
    nav.edges.forEach((list, i) => { for (const [j, d] of list) link(i, j, d, [pts[j]]); });
    if (nav.thru) { link(0, 1, nav.thru.length, nav.thru.poly.slice(1)); link(1, 0, nav.thru.length, [...nav.thru.poly].reverse().slice(1)); }
    if (!fromIn) { for (let i = 0; i < n0; i++) if (outdoorClear(from, pts[i])) link(S, i, distance(from, pts[i]), [pts[i]]); }
    else GATES.forEach((g, k) => { const leg = vnav.path(from, g.gate); if (leg) link(S, k, vnav.pathLength(from, leg) + distance(g.gate, g.out), [...leg, { ...g.out }]); });
    if (!toIn) { for (let i = 0; i < n0; i++) if (outdoorClear(pts[i], to)) link(i, T, distance(pts[i], to), [{ ...to }]); }
    else GATES.forEach((g, k) => { const leg = vnav.path(g.gate, to); if (leg) link(k, T, distance(g.out, g.gate) + vnav.pathLength(g.gate, leg), [{ ...g.gate }, ...leg]); });
    const cost = pts.map(() => Infinity), prev = pts.map(() => null), done = new Uint8Array(pts.length); cost[S] = 0;
    for (;;) {
      let c = -1;
      for (let i = 0; i < pts.length; i++) if (!done[i] && (c < 0 || cost[i] < cost[c])) c = i;
      if (c < 0 || !Number.isFinite(cost[c]) || c === T) break;
      done[c] = 1;
      for (const [j, len, poly] of adj[c]) if (cost[c] + len < cost[j]) { cost[j] = cost[c] + len; prev[j] = [c, poly]; }
    }
    if (!prev[T]) return [];
    const chain = [];
    for (let i = T; i !== S; i = prev[i][0]) chain.unshift(prev[i][1]);
    const path = chain.flat().map(p => ({ x: p.x, z: p.z }));
    return path.filter((p, i) => distance(p, i ? path[i - 1] : from) > 1e-4 || i === path.length - 1);
  }

  // 村裡的出生點放到最近的可走鋪面格上(獵人在村裡只會出現在鋪面上)。
  function onRoadPoint(p) {
    if (!inVillage(p.x, p.z) || !vnav) return p;
    return vnav.nearestOpen(p.x, p.z) ?? p;
  }

  // 2026-10-28:跨區移動一律先沿「環村道路」走,再從最靠近目的地的位置切進地形。
  // waypoints = 環上最近的點 → 沿環(走較短的一側) → 目的地。
  // 這條路同時是安全走廊:魔物索敵會跳過站在環上的獵物(pixel-game 的 onRingRoad 檢查)。
  function ringWaypoints(from, target) {
    if (!target) return [];
    const a = nearestRingRoad(from.x, from.z), b = nearestRingRoad(target.x, target.z);
    const ring = ringRoadPath(a.index, b.index);
    if (ring.length > 12) ring.length = 12;                 // 太遠就取樣,不要塞幾十個點
    return [ringPointAt(a.index), ...ring.filter((_, i) => i % 2 === 0), { x: target.x, z: target.z }];
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

  function idleInTown(h) {
    // 招募英雄待機:留在村內等玩家派指令,不自己出村打怪。
    h.task = null; h.serviceProduct = null; h.serviceStarted = false; h.destination = null; h.inTown = true;
    h.targetId = null; h.rallying = false; h.route = []; h.status = '待機';
  }

  // 找怪:還沒進狩獵區就先走到區的邊緣;進了區就在區內隨機挑一點走過去(走到或超過時間就換一點),路上看到的魔物由戰鬥邏輯接手。
  function searchStep(u, rid) {
    if (state.time < (u.routeRetryAt ?? 0)) return;   // 找不到路就隔幾秒再試,不要每一幀都重算
    if (!regionContains(rid, u.x, u.z)) {
      u.status = '前往' + (REGIONS.find(r => r.id === rid)?.name ?? '狩獵區');
      if (!u.route.length && !route(u, ringWaypoints({ x: u.x, z: u.z }, regionEdge(rid) ?? { x: u.x, z: u.z }))) u.routeRetryAt = state.time + 4;
      return;
    }
    u.status = '搜尋中';
    if (!u.route.length && (!u.searchTo || distance(u, u.searchTo) < 1.2 || state.time > (u.searchUntil ?? 0))) {
      u.searchTo = randomRegionPoint(rid, random);
      u.searchUntil = state.time + 30 + random() * 20;
      if (!route(u, [u.searchTo])) { u.searchTo = null; u.routeRetryAt = state.time + 4; }
    }
  }
  function depart(h) {
    // 只有玩家下過狩獵指令(h.huntRegion)才出村;否則留在村內待機。
    if (!h.huntRegion) { idleInTown(h); return; }
    h.task = null; h.serviceProduct = null; h.serviceStarted = false; h.destination = null; h.inTown = false; h.targetId = null; h.rallying = false; h.status = '出征中'; h.lastTownVisit = state.time;
    const region = REGIONS.find(r => r.id === h.huntRegion);
    // 集結點(玩家指定的)照原樣走;否則先沿環村道路走,再切進目的地
    if (state.rally) { route(h, [state.rally]); return; }
    route(h, ringWaypoints({ x: h.x, z: h.z }, region ? regionEdge(region.id) : regionEdge('meadow')));
  }

  // 普攻間隔(秒,未含快手特性):野外 AI 與地下城共用。遠程施法較慢;祭司介於弓箭手與法師之間。
  const attackInterval = h => (h.classId === 'sorcerer' ? 1.65 : h.classId === 'priest' ? 1.4 : h.classId === 'archer' ? 1.2 : 1.1) * (h.trait === 'swift' ? 0.9 : 1);
  // 普攻特效種類與命中延遲(遠程要等箭/法球飛到;只影響畫面):手動操控、獵人 AI、流浪英雄共用。
  // 刺客:刀光是攻擊列自己畫的(PixelLab X 字斬),遊戲只補命中火花。
  const ATTACK_FX_DELAY = { arrow: 0.2, spell: 0.25, holy: 0.16, hit: 0.07, slash: 0.07 };
  const attackFx = classId => { const kind = classId === 'sorcerer' ? 'spell' : classId === 'archer' ? 'arrow' : classId === 'priest' ? 'holy' : classId === 'assassin' ? 'hit' : 'slash'; return { kind, delay: ATTACK_FX_DELAY[kind] }; };
  function newHunter(classId, position = CAMP, initialIndex = -1) {
    const roll = random(), rarity = initialIndex >= 0 ? ['normal', 'rare', 'normal', 'superior', 'rare'][initialIndex % 5] : roll < 0.55 ? 'normal' : roll < 0.82 ? 'rare' : roll < 0.94 ? 'superior' : roll < 0.99 ? 'heroic' : 'legendary';
    const p = onRoadPoint(safePoint(position));
    const h = { id: id('h'), name: NAMES[state.hunters.length % NAMES.length], classId, rarity, trait: TRAITS[Math.floor(random() * TRAITS.length)].id, level: initialIndex >= 0 ? 3 + initialIndex % 3 : 1, xp: 0, rebirths: 0, skillLevel: 0, weaponLevel: 0, equipment: { weapon: false, armor: false }, gold: 100, inventory: Object.fromEntries(MATERIAL_KEYS.map(key => [key, 0])), satiety: initialIndex >= 0 ? 70 + initialIndex * 4 : 90, mood: initialIndex >= 0 ? 88 - initialIndex * 4 : 90, stamina: initialIndex >= 0 ? 78 + initialIndex * 2 : 90, x: p.x, z: p.z, hp: CLASS[classId].hp, maxHp: CLASS[classId].hp, status: '待機', targetId: null, attackTimer: random() * 0.5, route: [], task: null, serviceProduct: null, actionTimer: 0, trainCooldown: 0, reviveTimer: 0, lastTownVisit: state.time, tradedVisit: false, shoppedVisit: false, servedVisit: [], inTown: true, huntRegion: null };
    updateStats(h); h.hp = h.maxHp; state.hunters.push(h); idleInTown(h); return h;
  }

  // 新職業上架:名單裡還沒有這個職業的獵人(也沒有這個職業的訪客),就把招募欄第一位換成它(稀有;新舊存檔都適用)。
  // 2026-10-27 祭司(priest)從流浪限定改成可招募 → 這裡指向 priest;下次有新職業再換 id。
  function offerNewClass() {
    const c = CLASS.priest; if (!c || !state.visitors?.length) return;
    if (state.hunters.some(h => h.classId === c.id) || state.visitors.some(v => v.classId === c.id)) return;
    state.visitors[0] = { id: id('v'), classId: c.id, rarity: 'rare', trait: 'brave', cost: Math.round(c.cost * RARITY.rare.mult) };
  }
  function newVisitor() {
    const c = CLASSES[Math.floor(random() * CLASSES.length)], roll = random();
    const rarity = roll < 0.55 ? 'normal' : roll < 0.82 ? 'rare' : roll < 0.94 ? 'superior' : roll < 0.99 ? 'heroic' : 'legendary';
    return { id: id('v'), classId: c.id, rarity, trait: TRAITS[Math.floor(random() * TRAITS.length)].id, cost: Math.round(c.cost * RARITY[rarity].mult) };
  }

  // 流浪英雄:自己在野外打怪,不聽玩家指揮。招募後變成 hunters,才會等玩家派指令。
  // 他們跟獵人一樣有自己的錢包與生活需求,會自己挑「打得起」的狩獵區,缺東西就自己回村買。
  const WANDER_CONSUME = { satiety: 0.95, stamina: 0.76, mood: 0.55 };   // 跟獵人同一組消耗速率
  const WANDER_START_GOLD = 80;

  // 挑區域:怪物攻擊 × 區域風險 要在他「扛得住」的範圍內,能打的最高一階就去那裡。
  // 例:防禦 1 的魔法師只會在草原;防禦 8 的聖騎士會跑到霜杉林地。
  function bestRegionFor(w) {
    const comfort = w.defense * 2 + w.level * 0.5 + w.attack * 0.15 + 8;
    let best = REGIONS[1];
    for (const r of REGIONS) {
      if (r.id === 'village') continue;
      const threat = (ENEMIES[r.enemy]?.attack ?? 10) * r.risk;
      if (threat <= comfort && r.risk >= best.risk) best = r;
    }
    return best;
  }

  // 流浪英雄打倒魔物的戰利品:進自己的錢包與背包(可以拿去交易所賣、去鐵匠鋪買裝備)。
  // 刻意不走 rewardEnemy():那會計入村莊的 totalKills 與發經驗給獵人,村莊的討伐數字只算獵人打的。
  function wandererLoot(enemy, w) {
    if (enemy.rewarded) return;
    enemy.rewarded = true; enemy.hp = 0;
    const data = ENEMIES[enemy.type], multiplier = DIFFICULTIES[state.difficulty].mult;
    const gold = Math.round(data.gold * Math.sqrt(multiplier));
    w.gold += gold;
    for (const [key, amount] of Object.entries(data.drops)) w.inventory[key] += amount;
    effect('death', enemy, { enemyType: enemy.type, flipHint: (enemy.hitFromX ?? enemy.x) - (enemy.hitFromZ ?? enemy.z) < enemy.x - enemy.z });
    effect('loot', enemy, { text: `+${gold}`, color: '#efcd82', delay: 0.35 });
  }

  // 4 組派遣隊伍預設(存檔會記住):每組有自己的隊員名單與狩獵區。
  const DISPATCH_TEAMS = 4;
  const defaultDispatchTeams = () => Array.from({ length: DISPATCH_TEAMS }, (_, i) => ({ name: `隊伍 ${i + 1}`, ids: [], region: 'meadow' }));
  const normalizeTeams = source => {
    const teams = defaultDispatchTeams();
    const raw = Array.isArray(source) ? source : [];
    const taken = new Set();   // 同一位獵人只能在一組:前面的組先拿,後面的組不會重複收到同一人
    for (let i = 0; i < DISPATCH_TEAMS; i++) {
      const t = raw[i] || {};
      teams[i].ids = Array.isArray(t.ids) ? [...new Set(t.ids.filter(id => state.hunters.some(h => h.id === id) && !taken.has(id)))] : [];
      teams[i].ids.forEach(id => taken.add(id));
      teams[i].region = REGIONS.some(r => r.id === t.region && r.id !== 'village') ? t.region : 'meadow';
    }
    return teams;
  };
  function newWanderer(classId = null) {
    const c = CLASSES.find(v => v.id === classId) || CLASSES[Math.floor(random() * CLASSES.length)], roll = random();
    const rarity = roll < 0.6 ? 'normal' : roll < 0.9 ? 'rare' : 'superior';
    const region = REGIONS[1 + Math.floor(random() * Math.max(1, REGIONS.length - 1))] || REGIONS[1];
    const p = safePoint({ x: region.x - 4 + random() * 8, z: region.z - 4 + random() * 8 });
    const w = { id: id('w'), name: NAMES[Math.floor(random() * NAMES.length)], classId: c.id, rarity, trait: 'brave', level: 3 + Math.floor(random() * 6), xp: 0,
      rebirths: 0, skillLevel: 0, weaponLevel: 0, equipment: { weapon: false, armor: false }, inventory: Object.fromEntries(MATERIAL_KEYS.map(key => [key, 0])),
      gold: WANDER_START_GOLD, satiety: 100, stamina: 100, mood: 100,
      regionId: region.id, x: p.x, z: p.z, hp: c.hp, maxHp: c.hp, attack: c.attack, defense: c.defense, range: Math.max(c.range, 1.75),
      status: '遊蕩中', targetId: null, attackTimer: random() * 0.6, route: [], reviveTimer: 0, facingX: 0, facingZ: 0, facingAt: 0,
      task: null, destination: null, inTown: false, serviceProduct: null, actionTimer: 0, lastTownVisit: state.time,
      tradedVisit: false, shoppedVisit: false, servedVisit: [] };
    w.huntRegion = bestRegionFor(w).id;
    updateStats(w); w.hp = w.maxHp;      // 攻擊/防禦/速度跟招募進來的獵人同一套公式（速度也就一樣了）
    return w;
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
    route(h,[door(buildingId,h)]);
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

  // 村內辦事:吃飯/喝飲料/睡覺/療傷、賣材料、買裝備。獵人與流浪英雄共用,
  // 做完各自的下一步不同(獵人等玩家指令、流浪英雄自己回去打怪) → 由呼叫者傳 next 進來。
  function runTownTask(a, dt, next) {
    if (a.route.length) { walk(a, dt); return; }
    if (a.task === 'service') {
      if (!a.serviceStarted) beginService(a);
      const product = PRODUCTS[a.serviceProduct], gain = a.serviceGain * Math.min(dt, a.actionTimer);
      if (product.need === 'hp') a.hp = Math.min(a.maxHp, a.hp + gain / 100 * a.maxHp); else a[product.need] = Math.min(100, a[product.need] + gain);
      a.actionTimer = Math.max(0, a.actionTimer - dt);
      if (a.actionTimer === 0) { a.servedVisit.push(a.serviceProduct); a.serviceStarted = false; effect('heal', a); if (state.wanderers.includes(a)) state.counts.wandererPurchases = (state.counts.wandererPurchases || 0) + 1; next(a); }
    } else {
      a.status = a.task === 'trade' ? '交易中' : '購買裝備'; a.actionTimer += dt;
      if (a.actionTimer >= 1.3) { if (a.task === 'trade') trade(a); else shop(a); if (state.wanderers.includes(a)) state.counts.wandererPurchases = (state.counts.wandererPurchases || 0) + 1; next(a); }
    }
  }

  // 流浪英雄的村內行程:賣材料 → 吃飯/喝飲料/睡覺/療傷 → 買裝備 → 回狩獵區。
  function wandererNextTownTask(w) {
    if (!w.tradedVisit && tradeAvailable(w)) { goToBuilding(w, 'trading', 'trade'); return; }
    const product = needProduct(w, true);
    if (product && !w.servedVisit.includes(product)) { w.serviceProduct = product; w.serviceStarted = false; goToBuilding(w, PRODUCTS[product].building, 'service'); return; }
    if (!w.shoppedVisit && gearAvailable(w)) { goToBuilding(w, 'forge', 'shop'); return; }
    wandererDepart(w);
  }
  function wandererReturnToTown(w) {
    w.inTown = true; w.tradedVisit = false; w.shoppedVisit = false; w.servedVisit = []; w.targetId = null; w.status = '返村中';
    wandererNextTownTask(w);
  }
  function wandererDepart(w) {
    w.task = null; w.serviceProduct = null; w.serviceStarted = false; w.destination = null; w.inTown = false; w.targetId = null; w.status = '出征中'; w.lastTownVisit = state.time;
    route(w, ringWaypoints({ x: w.x, z: w.z }, regionEdge(w.huntRegion) ?? REGIONS[1]));
  }

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
    if (state.time < (h.lockUntil ?? 0)) return;   // 出手後的短僵直:站著收招,不移動(不影響攻擊節奏)
    let available = (h.speed ?? CLASS[h.classId].speed) * dt * (h.status === '返村中' ? 1.2 : 1);
    while (available > 1e-8 && h.route.length) {
      const target = h.route[0], remaining = distance(h, target);
      if (remaining <= available) { h.x = target.x; h.z = target.z; h.route.shift(); available -= remaining; }
      else { h.x += (target.x - h.x) / remaining * available; h.z += (target.z - h.z) / remaining * available; available = 0; }
    }
  }

  // ── 遠程風箏(KITE,pixel-data.js 有門檻說明):魔物近身就往遠離牠們的方向拉開距離,拉開後再出手。 ──
  // 只給 AI 控制的遠程職業(射程 ≥ 3)用;近戰職業直接返回 false(不寫任何欄位),手動操控在呼叫前就跳過了。
  // 回傳 true = 這一幀在後撤(呼叫者不要出手、狀態設成「後撤中」);false = 照常戰鬥。
  // 狀態欄位(都是暫態,不進存檔結構):kiting、kiteStart、kiteSeen、kiteDir、kiteReadyAt(下一次可以後撤的時間)。
  // 畫面:狀態不是「戰鬥中」→ 不播蓄力,照移動方向播 walk;停下來出手時攻擊方向由 atkX/atkZ 決定,會轉回目標。
  const isRanged = u => (CLASS[u.classId]?.range ?? 0) >= 3;
  const KITE_ANGLES = [0, 25, 50, 75, 100].map(a => a * Math.PI / 180);
  const kiteHeld = u => state.time < (u.lockUntil ?? 0) || state.time - (u.atkAt ?? -99) < KITE.afterShot || state.time - (u.skillAt ?? -99) < (SKILLS[u.classId]?.lock ?? 0);
  function endKite(u, rest) { u.kiting = false; u.kiteDir = null; u.kiteReadyAt = state.time + rest; return false; }
  function kiteStep(u, dt, regionId) {
    if (!isRanged(u)) return false;
    const t = state.time;
    if (u.kiting && t - (u.kiteSeen ?? -99) > 0.5) { u.kiting = false; u.kiteDir = null; }   // 中途去做別的事(換目標、回村)又回來:不接續舊的後撤
    if (!regionId) { if (u.kiting) endKite(u, 0); return false; }
    const exit = u.range * KITE.exit, threats = [];
    let near = Infinity, vx = 0, vz = 0;
    for (const e of state.enemies) {
      if (e.hp <= 0 || e.rewarded) continue;
      const d = distance(u, e); if (d >= exit) continue;
      threats.push(e); near = Math.min(near, d);
      const w = 1 / Math.max(0.25, d * d), l = Math.max(1e-6, d); vx += (u.x - e.x) / l * w; vz += (u.z - e.z) / l * w;   // 越近的魔物推得越用力
    }
    if (u.kiting) {
      const el = t - u.kiteStart;
      if ((near >= exit && el >= KITE.minTime) || el >= KITE.maxTime) return endKite(u, KITE.cooldown);
    } else {
      if (near >= u.range * KITE.enter || t < (u.kiteReadyAt ?? 0) || kiteHeld(u) || (u.attackTimer ?? 0) <= KITE.windup) return false;   // 蓄力中(快出手了)先打完這一下
      u.kiting = true; u.kiteStart = t; u.kiteDir = null;
    }
    u.kiteSeen = t;
    if (kiteHeld(u)) return true;   // 收招中:站著,不出手也不走
    const vl = Math.hypot(vx, vz);
    let bx, bz;
    if (vl > 1e-6) { bx = vx / vl; bz = vz / vl; } else if (u.kiteDir) { bx = u.kiteDir.x; bz = u.kiteDir.z; } else return endKite(u, KITE.cooldown);
    const step = (u.speed ?? CLASS[u.classId].speed) * dt, floor = Math.min(near, exit) - 1e-6;
    const minD = p => threats.reduce((m, e) => Math.min(m, distance(p, e)), Infinity);
    const ok = (dx, dz) => {
      const p = { x: u.x + dx * step, z: u.z + dz * step }, ahead = Math.max(step, KITE.look), q = { x: u.x + dx * ahead, z: u.z + dz * ahead };
      return regionContains(regionId, p.x, p.z) && regionContains(regionId, q.x, q.z) && !blocked(p) && !blocked(q) && lineClear(u, q) && minD(p) >= floor ? p : null;
    };
    // 方向:先沿用上一幀的方向(還大致朝外就不換,走路方向才穩定),不行再從「正後方」往兩側每 25° 找,先試上一次偏的那一側。
    const prev = u.kiteDir, cands = [];
    if (prev && prev.x * bx + prev.z * bz > 0.5) cands.push([prev.x, prev.z]);
    const side = prev && (bx * prev.z - bz * prev.x) > 0 ? -1 : 1;
    for (const a of KITE_ANGLES) for (const s of a ? [side, -side] : [1]) { const c = Math.cos(a * s), sn = Math.sin(a * s); cands.push([bx * c - bz * sn, bx * sn + bz * c]); }
    for (const [dx, dz] of cands) {
      if (prev && dx * prev.x + dz * prev.z < -0.5) continue;   // 同一次後撤不急轉回頭(走速統一 2.7 後在區界邊會左右來回);只剩回頭路就原地打
      const p = ok(dx, dz); if (!p) continue;
      u.x = p.x; u.z = p.z; u.kiteDir = { x: dx, z: dz }; return true;
    }
    return endKite(u, KITE.stuckRest);   // 走投無路(牆角、區界、前後都有魔物):原地開打,2.5 秒內不再試
  }

  // 祭司補血對象:射程內、生命低於 below 的隊友,挑生命比例最低的;招募的獵人(含自己)優先,一個都沒有才看流浪英雄。
  // 在地下城／競技場裡的人不算(那邊有自己的戰鬥),倒下的也不算(要等復活)。
  function healTarget(h, sk) {
    const want = u => u.hp > 0 && u.hp < u.maxHp * (sk.below ?? 1) && u.task !== 'dungeon' && u.task !== 'arena' && distance(h, u) <= h.range;
    const lowest = list => list.filter(want).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0] || null;
    return lowest(state.hunters) || lowest(state.wanderers || []);
  }
  // 招牌技能:結算當下扣血(跟普攻一樣),畫面用 skillAt / effect 延遲對到放出格。
  function castSkill(h, target, sk) {
    const t = state.time, release = sk.release ?? .25, base = Math.max(1, Math.round(h.attack * (h.satiety < 15 || h.stamina < 15 ? 0.6 : 1)));
    h.skillCd = sk.cd; h.attackTimer = sk.lock + .4; h.skillAt = t; h.skillName = sk.name; h.atkX = target.x; h.atkZ = target.z;
    state.counts.skills = (state.counts.skills || 0) + 1;
    effect('skillName', h, { text: sk.name, color: '#bdf4ff' });
    // 特效:skillSelf = 英雄身上(旋風、聖盾、蓄力),skillfx = 打到目標(飛行物 → 命中);畫面依職業 sprite 特效表,沒有就退回舊特效(sk.fx)。
    effect('skillSelf', h, { cls: h.classId, fx: sk.fx, delay: Math.max(0, release - .12), kind: sk.kind });
    if (sk.kind === 'allyHeal') {   // 補到隊友身上:聖光球飛過去(畫面延遲 release),結算當下回血
      const v = Math.round(target.maxHp * sk.heal); target.hp = Math.min(target.maxHp, target.hp + v); h.lockUntil = t + sk.lock;
      effect('skillfx', target, { cls: h.classId, fx: sk.fx, sourceX: h.x, sourceZ: h.z, delay: release, text: `+${v}`, color: '#9cf09a', self: target === h });
      effect('heal', target, { delay: release }); return;
    }
    if (sk.kind === 'heal') { const v = Math.round(h.maxHp * sk.heal); h.hp = Math.min(h.maxHp, h.hp + v); effect('skillfx', h, { cls: h.classId, fx: sk.fx, sourceX: h.x, sourceZ: h.z, delay: release, text: `+${v}`, color: '#9cf09a', self: true }); return; }
    const alive = state.enemies.filter(e => e.hp > 0 && !e.rewarded);
    const hitList = sk.kind === 'multi' ? alive.filter(e => distance(h, e) <= h.range + 1).sort((a, b) => distance(h, a) - distance(h, b)).slice(0, sk.targets)
      : sk.kind === 'aoe' ? alive.filter(e => distance(e, target) <= sk.radius) : [target];
    if (!hitList.includes(target)) hitList.unshift(target);
    hitList.forEach((e, i) => {
      const dmg = Math.max(1, Math.round(base * sk.mult)), delay = release + (sk.fx === 'gale' ? .18 + i * .05 : sk.fx === 'arrow' ? .2 : .1);
      e.hitAt = t + delay; e.hitFromX = h.x; e.hitFromZ = h.z; e.hp -= dmg;
      effect('skillfx', e, { sourceX: h.x, sourceZ: h.z, value: dmg, targetId: e.id, delay, cls: h.classId, fx: sk.fx, kind: sk.kind, crit: true, skill: true });
      if (h.classId === 'darkknight') h.hp = Math.min(h.maxHp, h.hp + dmg * 0.08);
      if (e.hp <= 0) rewardEnemy(e, h);
    });
  }

  const wandererOf = who => (state.wanderers || []).includes(who);
  // 流浪英雄被魔物打倒:沒有復活聖所接引,倒在野外喘一下,幾秒後自己站起來(身上的東西留著)。
  const ENEMY_NAME = { boss: '森林領主',
    sprout: '花芽妖', ram: '捲角羊', mole: '鼴鼠', shroom: '蕈菇怪', boar: '野豬', vine: '藤鞭怪',
    wolfman: '灰毛狼人', moss: '苔蘚巨魔', snowhare: '雪兔', yeti: '霜雪怪', snowman: '雪人哨兵', icebeetle: '冰甲蟲',
    kobold: '礦穴地精', boulder: '岩塊怪', goat: '鐵角羊', mummy: '木乃伊', cactus: '仙人掌怪', scorpion: '沙蠍',
    floraspirit: '花妖精', birchling: '白樺樹精', stag: '白樺雄鹿' };
  function downWanderer(w, by) {
    w.hp = 0; w.reviveTimer = 9; w.task = null; w.route = []; w.targetId = null; w.status = '倒下';
    w.mood = Math.max(0, w.mood - 10); state.wanderDowns = (state.wanderDowns || 0) + 1;
    effect('warning', w); log(`流浪英雄 ${w.name} 被${ENEMY_NAME[by?.type] || '魔物'}打倒，在野外倒地不起。`, 'warning');
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

  // 各生態區出怪:每區 3 隻新怪(小/中/大)＋ 1 隻舊怪保留(權重用重複項調整)。強度＝難度倍率 × 該區 risk。
  // 每區只有 3 種(小/中/大),權重 3:3:2 —— 舊的 slime/wolf/golem 不再出現。
  const REGION_MIX={meadow:['sprout','sprout','sprout','ram','ram','ram','mole','mole'],forest:['shroom','shroom','shroom','boar','boar','boar','vine','vine'],
    taiga:['snowhare','snowhare','snowhare','wolfman','wolfman','wolfman','moss','moss'],snow:['icebeetle','icebeetle','icebeetle','snowman','snowman','snowman','yeti','yeti'],
    mountain:['kobold','kobold','kobold','goat','goat','goat','boulder','boulder'],desert:['cactus','cactus','cactus','scorpion','scorpion','scorpion','mummy','mummy'],
    birch:['floraspirit','floraspirit','floraspirit','stag','stag','stag','birchling','birchling']};
  const mixOf = id => REGION_MIX[id] || REGION_MIX.meadow;
  // 進區前先把該區會出現的魔物 sheet 叫回來(像素世界是「用到才載」,26 種全載會吃掉 280 MB)。
  const preloadMix = mix => { try { globalThis.__mistvalePreloadMonsters?.(mix); } catch { } };
  function spawn(type, position = null, regionId = null) {
    const region = REGIONS.find(r => r.id === (regionId || (position && regionAt(position.x, position.z).id) || state.region)) || REGIONS[1];
    // 出生點在整個狩獵區裡「均勻」取(area-uniform 取樣),只有跟其他魔物疊在一起(<1.8)才重抽,
    // 所以魔物會散在整區,而不是全擠在某一側或繞著中心。
    let proposed = position;
    if (!proposed) {
      const alive = state.enemies.filter(e => e.hp > 0);
      // 抽幾個候選點,挑「離其他魔物最遠」的那一個:比純隨機更均勻(不會兩三隻擠在同一角),
      // 整個地形都分得到魔物。找到夠空的點就提早收工。
      let best = null, bestD = -1;
      for (let i = 0; i < 6; i++) {
        const c = randomRegionPoint(region.id, random);
        if (onRingRoad(c.x, c.z, ROAD_PAD + 0.5)) continue;   // 不在環村道路上生怪
        let d = 1e9;
        for (const e of alive) d = Math.min(d, Math.hypot(e.x - c.x, e.z - c.z));
        if (d > bestD) { bestD = d; best = c; }
        if (d > 7) break;
      }
      proposed = best;
    }
    const p = safePoint(proposed), data = ENEMIES[type], multiplier = DIFFICULTIES[state.difficulty].mult * (region.risk || 1);
    const e = { id: id('e'), type, x: p.x, z: p.z, hp: Math.round(data.hp * multiplier), maxHp: Math.round(data.hp * multiplier), attack: Math.round(data.attack * multiplier), attackTimer: 0.6 + random(), age: 0 };
    const center = regionCenter(region.id) || proposed;
    e.regionId = region.id; e.homeX = center.x; e.homeZ = center.z; state.enemies.push(e); return e;
  }

  function rewardEnemy(enemy, hunter) {
    if (enemy.rewarded) return;
    enemy.rewarded = true; enemy.hp = 0; state.totalKills++; state.kills = state.totalKills;
    const data = ENEMIES[enemy.type], multiplier = DIFFICULTIES[state.difficulty].mult;
    const gold = Math.round(data.gold * Math.sqrt(multiplier)); hunter.gold += gold;
    for (const [key, amount] of Object.entries(data.drops)) hunter.inventory[key] += amount;
    effect('death', enemy, { enemyType: enemy.type, flipHint: (enemy.hitFromX ?? enemy.x) - (enemy.hitFromZ ?? enemy.z) < enemy.x - enemy.z });  // 打的人在左邊 → 翻面朝左(面向打倒牠的人)
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

  // ── 地下城(2026-10-30 改版:橫條戰鬥畫面) ──
  // 每層 3 波,每波 1–3 隻真的魔物(總血量 = 舊版那一波的血量,難度不變),素材用野外同一套魔物表:每 3 層換一區(由易到難)。
  // 英雄近戰站前排、遠程站後排;魔物先打前排,前排都倒了才打後排。每隻魔物照「舊版一波 1.4 秒一擊 × 魔物數」出手(滿編時傷害節奏跟舊版一樣)。
  // 獵人照自己的攻擊間隔打最前面的魔物;招牌技能照冷卻放(群體 = 整波、連射 = 前幾隻、單體 = 最前面、補血 = 生命比例最低的)。
  // d.auto = 自動續戰:打完一層、三人都還站著 → 休整 3 秒(回 20% 生命)直接打下一層;關掉就打完這層回村。
  // d.startFloor = 下次出發從第幾層開始(0 = 最新一層 = 最高紀錄 +1)。d.events = 給畫面播動畫/數字的最近事件(不存檔)。
  const DG_TIERS = ['meadow', 'birch', 'forest', 'taiga', 'desert', 'snow', 'mountain'];
  function dgWave(floor, wave) {
    const mix = REGION_MIX[DG_TIERS[Math.floor((floor - 1) / 3) % DG_TIERS.length]], small = mix[0], mid = mix[3], big = mix[6];
    const types = wave === 1 ? [small, small] : wave === 2 ? (floor >= 5 ? [mid, small, small] : [mid, small]) : (floor >= 10 ? [big, mid] : [big]);
    const total = dungeonEnemyHp(floor, wave), sum = types.reduce((n, t) => n + ENEMIES[t].hp, 0);
    return types.map((type, i) => { const hp = Math.max(1, Math.round(total * ENEMIES[type].hp / sum));
      return { id: id('dg'), type, hp, maxHp: hp, attack: 13 + floor * 4 + wave * 2, timer: 1.5 + i * 0.6, every: 1.4 * types.length, ranged: !!MONSTER_RANGED[type], big: wave === 3 && i === 0 }; });
  }
  function dgEvent(k, a, b, v, shot = null) { const d = state.dungeon; (d.events ||= []).push({ t: state.time, k, a, b, v, shot }); if (d.events.length > 32) d.events.splice(0, d.events.length - 32); }
  function dgSync() { const d = state.dungeon, f = d.foes || []; d.enemyHp = f.reduce((n, x) => n + Math.max(0, x.hp), 0); d.enemyMaxHp = f.reduce((n, x) => n + x.maxHp, 0); }
  function endDungeon(won) {
    const d = state.dungeon, floor = d.floor;
    d.active = false; d.phase = won ? '勝利' : '撤退'; d.cooldown = won ? 15 : 20; d.foes = []; dgSync();
    if (won) d.floor = Math.min(100, d.bestFloor + 1);
    else { d.reward = {}; log(`地下城第 ${floor} 層探險失敗。獵人正撤回村莊休養。`, 'warning'); }
    for (const h of state.hunters.filter(h => d.hunterIds.includes(h.id))) {
      h.task = null;
      if (h.hp <= 0) { h.task = 'revive'; h.reviveTimer = Math.max(3, h.reviveTimer); h.status = '復活中'; }
      else returnToTown(h);
    }
  }
  function floorCleared() {
    const d = state.dungeon, floor = d.floor, party = state.hunters.filter(h => d.hunterIds.includes(h.id));
    d.bestFloor = Math.max(d.bestFloor, floor); state.counts.dungeonWins++;
    d.reward = { gold: 120 + floor * 40, ore: 10 + floor * 5, gems: 2 + Math.floor(floor / 2) };
    for (const [key, amount] of Object.entries(d.reward)) state[key] += amount;
    for (const h of party) if (h.hp > 0) { h.gold += 35 + floor * 10; gainXp(h, 140 + floor * 35); }
    log(`地下城第 ${floor} 層突破！村莊獲得 ${d.reward.gold} 金幣、${d.reward.ore} 鐵礦與 ${d.reward.gems} 晶石。`, 'success'); effect('victory', door('dungeon'));
    dgEvent('clear', null, null, floor);
    if (d.auto && floor < 100 && party.every(h => h.hp > 0)) {
      d.floor = floor + 1; d.wave = 1; d.foes = []; d.time = 0; d.phase = '休整中'; d.rest = 3;
      for (const h of party) h.hp = Math.min(h.maxHp, h.hp + Math.round(h.maxHp * 0.2));
      log(`小隊稍作休整，自動續戰第 ${d.floor} 層。`, 'info'); return;
    }
    endDungeon(true);
  }
  function dgSkill(h, sk, live, party) {
    if (sk.kind === 'allyHeal' || sk.kind === 'heal') {
      const pool = sk.kind === 'heal' ? [h] : party.filter(u => u.hp > 0);
      const tgt = pool.filter(u => u.hp < u.maxHp * (sk.below ?? 0.9)).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (!tgt) return false;
      const v = Math.round(tgt.maxHp * sk.heal); tgt.hp = Math.min(tgt.maxHp, tgt.hp + v);
      h.skillCd = sk.cd; h.attackTimer = sk.lock + .4; dgEvent('heal', h.id, tgt.id, v); return true;
    }
    const dmg = Math.max(1, Math.round(h.attack * (sk.mult || 1)));
    const hitList = sk.kind === 'aoe' ? live : sk.kind === 'multi' ? live.slice(0, sk.targets || 3) : [live[0]];
    for (const f of hitList) { f.hp = Math.max(0, f.hp - dmg); dgEvent('skill', h.id, f.id, dmg, h.classId); }
    h.skillCd = sk.cd; h.attackTimer = sk.lock + .4; state.counts.skills = (state.counts.skills || 0) + 1; return true;
  }
  function stepDungeon(dt) {
    const d = state.dungeon;
    if (!d.active) return;
    const party = state.hunters.filter(h => d.hunterIds.includes(h.id)), alive = party.filter(h => h.hp > 0);
    if (!alive.length) { endDungeon(false); return; }
    if (d.phase === '集結中') {
      if (alive.some(h => h.route.length)) return;
      d.phase = '戰鬥中'; d.time = 0; if (!d.foes?.length) d.foes = dgWave(d.floor, d.wave);
      for (const h of alive) h.status = '地下城戰鬥';
      dgSync(); return;
    }
    if (d.phase === '休整中' || d.phase === '前進中') {   // 波與波之間往前走一段、層與層之間休整:這段時間不打
      d.rest = Math.max(0, (d.rest ?? 0) - dt); if (d.rest > 0) return;
      d.phase = '戰鬥中'; if (!d.foes?.length) d.foes = dgWave(d.floor, d.wave); dgSync(); return;
    }
    d.time += dt;
    if (d.time >= 180) { endDungeon(false); return; }
    const live = () => d.foes.filter(f => f.hp > 0);
    for (const h of alive) {
      h.skillCd = Math.max(0, (h.skillCd ?? 3) - dt);
      if (h.attackTimer > 0) continue;
      const foes = live(); if (!foes.length) break;
      const sk = SKILLS[h.classId];
      if (sk && h.skillCd === 0 && dgSkill(h, sk, foes, alive)) continue;
      h.attackTimer = attackInterval(h);
      const f = foes[0], dmg = Math.max(1, Math.round(h.attack * (h.satiety < 15 || h.stamina < 15 ? 0.6 : 1)));
      f.hp = Math.max(0, f.hp - dmg); dgEvent('hit', h.id, f.id, dmg, isRanged(h) ? h.classId : null);
    }
    if (!live().length) {
      dgSync();
      if (d.wave >= 3) floorCleared();
      else { d.wave++; d.foes = []; d.phase = '前進中'; d.rest = 1.6; }
      return;
    }
    for (const f of live()) {
      f.timer = Math.max(0, f.timer - dt); if (f.timer > 0) continue; f.timer = f.every;
      const up = party.filter(h => h.hp > 0), front = up.filter(h => !isRanged(h)), pool = front.length ? front : up;
      const tg = pool[Math.floor(random() * pool.length)]; if (!tg) break;
      const dmg = Math.max(2, Math.round(f.attack - tg.defense * 0.6)); tg.hp = Math.max(0, tg.hp - dmg);
      dgEvent('hurt', f.id, tg.id, dmg, f.ranged ? f.type : null);
      if (tg.hp === 0) died(tg);
    }
    dgSync();
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
    for (const h of alive) if (h.attackTimer === 0) { h.attackTimer = (h.classId === 'sorcerer' ? 1.6 : h.classId === 'priest' ? 1.4 : 1.1) * (h.trait === 'swift' ? 0.9 : 1); a.enemyHp = Math.max(0, a.enemyHp - h.attack); effect('slash', door('training'), { value: h.attack }); if (a.enemyHp <= 0) { endArena(true); return; } }
    a.attackTimer = Math.max(0, a.attackTimer - dt);
    if (a.attackTimer === 0) {
      a.attackTimer = 1.1; const target = alive[Math.floor(random() * alive.length)];
      const damage = Math.max(3, 21 + Math.min(10, a.wins) * 3 - target.defense); target.hp = Math.max(0, target.hp - damage); effect('hit', target, { value: damage });
      if (target.hp === 0) { target.status = '模擬對戰倒下'; target.route = []; }
    }
  }

  // ── 手動操控(設定 → 手動操控):玩家直接操縱一位獵人在野外走動、打怪 ──
  // state.pilot = {id, dx, dz, atk, readyAt, lockUntil, faceX, faceZ}；被操控的獵人跳過 AI，移動與出手都由玩家決定。
  function pilotStep(dt) {
    const pilot = state.pilot; if (!pilot) return false;
    const h = state.hunters.find(q => q.id === pilot.id);
    if (!h || h.hp <= 0) { state.pilot = null; return false; }
    h.task = 'pilot'; h.status = '手動操控'; h.route = []; h.rallying = false; h.targetId = null;
    const len = Math.hypot(pilot.dx || 0, pilot.dz || 0);
    // 面向(faceX/faceZ)= 最後一次「真的走動」的方向,不是搖桿現在指的方向。
    // 所以:站着推搖桿不會轉向、攻擊僵直中也一直維持攻擊前的面向;要轉向就得真的走起來(見下面的移動區塊)。
    // 出手:隨時都能打(附近沒有魔物也照樣播攻擊動作,只是不算傷害)。
    // 節奏:PILOT_ATTACK.cd = 兩次出手最短間隔;出手後 lockUntil 之前(動作 + 收招僵直)不能走。
    if (pilot.atk) {
      pilot.atk = false;
      if (state.time >= (pilot.readyAt ?? 0)) {
        pilot.readyAt = state.time + PILOT_ATTACK.cd;
        pilot.lockUntil = state.time + PILOT_ATTACK.anim + PILOT_ATTACK.recover;
        h.attackTimer = Math.max(h.attackTimer || 0, 0);
        const foes = (state.enemies || []).filter(e => e.hp > 0 && e.type !== 'boss').sort((a, b) => distance(h, a) - distance(h, b));
        const target = foes[0], inRange = !!target && distance(h, target) <= 3.2;
        // 動作方向:有 3.2 格內的魔物就朝它,沒有就往最後走的方向揮(空揮也要有動作)。
        h.atkAt = state.time;
        h.atkX = inRange ? target.x : h.x + (pilot.faceX ?? 1);
        h.atkZ = inRange ? target.z : h.z + (pilot.faceZ ?? 0);
        if (h.classId === 'sorcerer') {   // 法師:發出真的會飛的魔法球(PILOT_ORB),路徑上碰到的魔物都打;沒有目標就朝目前面向的角度飛
          const l = Math.hypot(h.atkX - h.x, h.atkZ - h.z) || 1, dx = (h.atkX - h.x) / l, dz = (h.atkZ - h.z) / l, range = CLASS.sorcerer?.range || 4.5;
          const damage = Math.max(1, Math.round(h.attack));
          (state.shots ??= []).push({ x: h.x, z: h.z, dx, dz, left: range, ownerId: h.id, dmg: damage, crit: damage >= h.attack * 1.25, hit: [] });
          effect('spell', { x: h.x + dx * range, z: h.z + dz * range }, { sourceX: h.x, sourceZ: h.z, delay: range / PILOT_ORB.speed, cls: h.classId, value: 0, noImpact: true });   // 飛行畫面(同速度);命中由 stepShots 判定
        } else if (inRange) {
          const damage = Math.max(1, Math.round(h.attack));
          const { kind, delay } = attackFx(h.classId);
          target.hitAt = state.time + delay; target.hitFromX = h.x; target.hitFromZ = h.z;
          target.hp -= damage;
          effect(kind, target, { sourceX: h.x, sourceZ: h.z, value: damage, targetId: target.id, delay, cls: h.classId, crit: damage >= h.attack * 1.25 });
          if (target.hp <= 0) rewardEnemy(target, h);
        }
      }
    }
    // 僵直:攻擊動作 + 收招期間推搖桿也不走(走位要等僵直結束;輸入不用重按,時間到就繼續走)
    if (state.time < (pilot.lockUntil ?? 0)) return true;
    if (len > 0.01) {
      const sx = h.x, sz = h.z;
      const sp = (CLASS[h.classId]?.speed || 2.2) * 1.15, nx = pilot.dx / len * sp * dt, nz = pilot.dz / len * sp * dt;
      const ok = (x, z) => walkable(x, z) && !blocked({ x, z });
      if (ok(h.x + nx, h.z + nz)) { h.x += nx; h.z += nz; }
      else if (ok(h.x + nx, h.z)) h.x += nx;
      else if (ok(h.x, h.z + nz)) h.z += nz;
      // 只把「實際走的方向」記成面向(撞牆完全走不動就不轉向)
      const mx = h.x - sx, mz = h.z - sz, ml = Math.hypot(mx, mz);
      if (ml > 1e-6) { pilot.faceX = mx / ml; pilot.faceZ = mz / ml; }
      const region = regionAt(h.x, h.z); if (region && region.id !== 'village') state.region = region.id;
    }
    return true;
  }

  // 手動操控法師的魔法球:沿直線飛,每一步掃「魔物到這段路徑的距離 ≤ 作用半徑」,每隻只打一次(穿透),飛完射程就消失。
  // 命中時才扣血、才出命中特效與傷害數字(位置在魔物身上)。王不算(手動出手本來就不瞄準王)。
  // 遠程魔物的飛行物:丟出去時記下來,飛到的那一刻才扣血(不存檔;讀檔時還在飛的就算了)。
  // 目標已倒下、進了地下城／競技場就作廢;走上環村道路的不躲(已經丟出去了)。
  const pendingHits = [];
  function landHits() {
    for (let i = pendingHits.length - 1; i >= 0; i--) {
      const ph = pendingHits[i]; if (state.time < ph.at) continue; pendingHits.splice(i, 1);
      const t = state.hunters.find(h => h.id === ph.id) || (state.wanderers || []).find(w => w.id === ph.id);
      if (!t || t.hp <= 0 || t.task === 'dungeon' || t.task === 'arena') continue;
      t.hitAt = state.time; t.hitFromX = ph.fromX; t.hitFromZ = ph.fromZ; t.hp = Math.max(0, t.hp - ph.damage);
      if (t.hp === 0) { if (wandererOf(t)) downWanderer(t, { type: ph.by }); else died(t); }
    }
  }
  function stepShots(dt) {
    const shots = state.shots; if (!shots?.length) return;
    for (const s of shots) {
      const d = Math.min(s.left, PILOT_ORB.speed * dt);
      for (const e of state.enemies) {
        if (e.hp <= 0 || e.type === 'boss' || s.hit.includes(e.id)) continue;
        const t = Math.max(0, Math.min(d, (e.x - s.x) * s.dx + (e.z - s.z) * s.dz));
        if (Math.hypot(e.x - (s.x + s.dx * t), e.z - (s.z + s.dz * t)) > PILOT_ORB.radius) continue;
        s.hit.push(e.id); e.hp -= s.dmg; e.hitAt = state.time; e.hitFromX = s.x; e.hitFromZ = s.z;
        effect('spell', e, { sourceX: e.x, sourceZ: e.z, value: s.dmg, targetId: e.id, delay: 0, cls: 'sorcerer', crit: s.crit });
        const owner = state.hunters.find(q => q.id === s.ownerId);
        if (e.hp <= 0 && owner) rewardEnemy(e, owner);
      }
      s.x += s.dx * d; s.z += s.dz * d; s.left -= d;
    }
    state.shots = shots.filter(s => s.left > 1e-6);
  }

  function step(dt) {
    if (pilotStep(dt)) { /* 手動模式:只跑環境與其他單位 */ }
    stepShots(dt); landHits();
    state.time += dt; state.day = Math.floor(state.time / 240) + 1;
    state.healCooldown = Math.max(0, state.healCooldown - dt); state.expedition.cooldown = Math.max(0, state.expedition.cooldown - dt); state.dungeon.cooldown = Math.max(0, state.dungeon.cooldown - dt); state.arena.cooldown = Math.max(0, state.arena.cooldown - dt);
    // 定時生怪:每個狩獵區都有自己的族群。目前狩獵區 4.5 秒補一隻、上限 8;其他區 8 秒補一隻、上限 3(野外面積砍一半後,沒人在打的區魔物也跟著減半,畫面才不會擠成一團)。
    state.spawnTimer += dt;
    if (state.spawnTimer >= 2.5) { state.spawnTimer -= 2.5; const n = state.enemies.filter(e => e.hp > 0 && e.type !== 'boss' && e.regionId === state.region).length; if (n < 14) { const mix = REGION_MIX[state.region] || REGION_MIX.meadow; spawn(mix[Math.floor(random() * mix.length)], null, state.region); } }
    state.regionSpawn ??= {};
    for (const a of REGIONS) { if (a.id === 'village' || a.id === state.region) continue; state.regionSpawn[a.id] = (state.regionSpawn[a.id] || 0) + dt; if (state.regionSpawn[a.id] < 8) continue; state.regionSpawn[a.id] = 0;
      if (state.enemies.filter(e => e.hp > 0 && e.type !== 'boss' && e.regionId === a.id).length < 6) { const mix = REGION_MIX[a.id]; spawn(mix[Math.floor(random() * mix.length)], null, a.id); } }
    for (const h of state.hunters) {
      h.attackTimer = Math.max(0, h.attackTimer - dt); h.trainCooldown = Math.max(0, h.trainCooldown - dt);
      if (h.hp <= 0) { if (h.task !== 'dungeon' && h.task !== 'arena') { if (h.task !== 'revive') died(h); h.reviveTimer = Math.max(0, h.reviveTimer - dt); if (h.reviveTimer === 0) revive(h); } continue; }
      if (h.task === 'dungeon' || h.task === 'arena') { walk(h, dt); h.stamina = Math.max(0, h.stamina - dt * 0.2); continue; }
      const consumption = (h.task ? 0.3 : (h.huntRegion&&(h.status==='出征中'||h.status==='搜尋中'||(h.status||'').startsWith('前往'))) ? 0.42 : 1) * (h.trait === 'frugal' ? 0.85 : 1);
      h.satiety = Math.max(0, h.satiety - dt * 0.95 * consumption); h.stamina = Math.max(0, h.stamina - dt * 0.76 * consumption); h.mood = Math.max(0, h.mood - dt * 0.55 * consumption * (h.trait === 'cheerful' ? 0.5 : 1));
      // 手動操控:移動、出手都交給玩家(pilotStep),AI 不要再動這位獵人 —— 不然 AI 會照自己的路線／狩獵區
      // 把人拉走,搖桿推的方向就變成在和 AI 搶。需求消耗照常算,只跳過決策與走動。
      if (h.task === 'pilot') continue;
      // 祭司(allyHeal):不管在不在戰鬥,冷卻好、沒在出手就自動補血(戰鬥分支不再替它倒數冷卻)
      { const sk = SKILLS[h.classId]; if (sk?.kind === 'allyHeal') { h.skillCd = Math.max(0, (h.skillCd ?? 3) - dt);
        if (h.skillCd === 0 && h.attackTimer === 0 && state.time >= (h.lockUntil ?? 0)) { const ally = healTarget(h, sk); if (ally) { castSkill(h, ally, sk); continue; } } } }
      if (h.task === 'trade' || h.task === 'shop' || h.task === 'service') { runTownTask(h, dt, nextTownTask); continue; }
      const bagSize = MATERIAL_KEYS.reduce((sum, key) => sum + h.inventory[key], 0);
      if (needProduct(h) || (bagSize >= 14 && tradeAvailable(h) && state.time - h.lastTownVisit > 12) || (state.time - h.lastTownVisit > 60 && gearAvailable(h))) { returnToTown(h); continue; }
      // 沒有狩獵指令就待機在村內(只自衢打到眼前的魔物),不自己跑出去打怪。
      if (!h.huntRegion && !h.targetId) {
        const near = state.enemies.find(e => e.hp > 0 && distance(h, e) < 5);
        if (!near) {
          if (!h.inTown && !h.route.length) returnToTown(h);
          else { h.status = '待機'; if (h.inTown && !h.route.length && random() < 0.004) route(h, [onRoadPoint(safePoint({ x: VILLAGE_BOUNDS.minX + 3 + random() * (VILLAGE_BOUNDS.maxX - VILLAGE_BOUNDS.minX - 6), z: VILLAGE_BOUNDS.minZ + 3 + random() * (VILLAGE_BOUNDS.maxZ - VILLAGE_BOUNDS.minZ - 6) }))]); walk(h, dt); }
          continue;
        }
      }
      // 只要「踩進」自己的狩獵區就算到達(不用走到點上):立刻結束集結、馬上開始找魔物。
      if (h.rallying) {
        if (h.huntRegion && regionContains(h.huntRegion, h.x, h.z)) { h.rallying = false; h.route = []; }
        else { walk(h, dt); if (!h.route.length) h.rallying = false; continue; }
      }
      const onRoad = onRingRoad(h.x, h.z);   // 走在環村道路上:不攔路邊的怪(路上本來就不會被打),也不站在路上出手
      const available = state.enemies.filter(e => e.hp > 0 && (e.regionId === h.huntRegion || e.type === 'boss' || (distance(h, e) < 4 && !onRoad)));  // 只打自己狩獵區的魔物(路上被攔截也會還手);四組各去各的區域
      // 一到自己的狩獵區(踩到區域邊界就算到了)就直接挑「最近的魔物」去打,不受視野距離限制;
      // 以前要等魔物走到 SIGHT(12)以內,英雄會在邊界隨機晃來晃去,看起來像沒在打怪。
      const inHuntRegion = !!h.huntRegion && regionContains(h.huntRegion, h.x, h.z);
      let target = available.find(e => e.id === h.targetId && (state.expedition.active || inHuntRegion || distance(h, e) <= SIGHT * 1.6));
      if (!target || (state.expedition.active && target.type !== 'boss')) {
        target = state.expedition.active ? available.find(e => e.type === 'boss') : null;
        target ??= available.filter(e => inHuntRegion ? e.regionId === h.huntRegion : distance(h, e) <= SIGHT)
          .sort((a, b) => distance(h, a) - distance(h, b))[0];
        h.targetId = target?.id ?? null;
      }
      // 先走進戰鬥空地再開打(不在柵欄邊、出村口遠遠放箭),戰鬥才會在開闊處、看得清楚。
      if (target && !inVillage(h.x,h.z) && !onRoad && distance(h, target) <= h.range && (wildAt(h.x, h.z) || distance(h, target) <= 1.9)) {
        h.status = '戰鬥中'; h.route = [];
        if (SKILLS[h.classId]?.kind !== 'allyHeal') h.skillCd = Math.max(0, (h.skillCd ?? 3) - dt);
        // 遠程被近身 → 先拉開距離(只在目前所在的狩獵區裡走,不進村、不出區;近戰職業 kiteStep 直接 false)
        { const kr = inHuntRegion ? h.huntRegion : regionAt(h.x, h.z)?.id; if (kiteStep(h, dt, kr && kr !== 'village' ? kr : null)) { h.status = '後撤中'; continue; } }
        const sk = SKILLS[h.classId];
        if (sk && sk.kind !== 'allyHeal' && h.skillCd === 0 && h.attackTimer === 0) { castSkill(h, target, sk); continue; }
        if (h.attackTimer === 0) {
          h.attackTimer = attackInterval(h);
          const damage = Math.max(1, Math.round(h.attack * (h.satiety < 15 || h.stamina < 15 ? 0.6 : 1)));
          // 動畫用時間戳(只給畫面看,不影響結算):出手瞬間、命中時刻(遠程要等箭/法球飛到)、攻擊方向。
          const { kind, delay } = attackFx(h.classId);
          h.atkAt = state.time; h.atkX = target.x; h.atkZ = target.z; target.hitAt = state.time + delay; target.hitFromX = h.x; target.hitFromZ = h.z;
          h.lockUntil = state.time + AI_ATTACK_LOCK;   // 收招僵直:這段時間站著不動(沒有 CD,下一擊照原本的 attackTimer)
          target.hp -= damage; effect(kind, target, { sourceX: h.x, sourceZ: h.z, value: damage, targetId: target.id, delay, cls: h.classId, crit: damage >= h.attack * 1.25 });
          if (h.classId === 'darkknight') h.hp = Math.min(h.maxHp, h.hp + damage * 0.08);
          if (target.hp <= 0) rewardEnemy(target, h);
        }
      } else {
        h.status = '出征中';
        if (inVillage(h.x,h.z)) { if (!h.route.length) depart(h); }
        else if (target) { const tail = h.route.at(-1); if (!tail || distance(tail, target) > 0.7) route(h, [{ x: target.x, z: target.z }]); }
        else if (h.huntRegion && !state.rally && !state.expedition.active) searchStep(h, h.huntRegion);
        else if (!h.route.length && state.rally && distance(h, state.rally) > 1) route(h, [state.rally]);
        walk(h, dt); if (!target && !h.route.length && !h.huntRegion) h.status = '待命';
      }
    }
    // 每位獵人同時最多兩隻魔物近身(首領不佔名額),其他在 4 格外等空位:一對一、一對二,誰打誰看得清楚。
    const slots = new Map();
    for (const e of state.enemies) if (e.hp > 0 && e.engaged && e.slotFor) slots.set(e.slotFor, (slots.get(e.slotFor) || 0) + 1);
    const fieldOk = p => regionContains(p.regionId, p.x, p.z) && !blocked(p);
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) continue;
      enemy.age += dt; enemy.attackTimer = Math.max(0, enemy.attackTimer - dt);
      // 目標 = 自己「主動攻擊範圍」內的獵人 + 流浪英雄(以最近的為主)。
      // 超出範圍的敵人完全不追(以前是整區搜尋、看到 10 格外的敵人也會走過去),魔物只守在自己的地盤上。
      const prey = state.hunters.filter(h => h.hp > 0 && !inVillage(h.x,h.z) && h.task !== 'dungeon' && h.task !== 'arena');
      for (const w of state.wanderers || []) if (w.hp > 0) prey.push(w);
      const rng = MONSTER_RANGED[enemy.type], aggro = Math.max(AGGRO[enemy.type] ?? 6, rng ? rng.range + 1 : 0);
      // 挨打後(PROVOKE.time 秒內)對遠程獵物的範圍放大到 PROVOKE.aggro:遠遠放箭的人也會被追;近戰獵物照原本的範圍。
      const provoked = state.time - (enemy.hitAt ?? -99) < PROVOKE.time, reachOf = q => provoked && isRanged(q) ? Math.max(aggro, PROVOKE.aggro) : aggro;
      // 走在環村道路上的獵物不算目標:出村趕路時不會被路邊的怪追(安全走廊)
      const target = prey.filter(q => !onRingRoad(q.x, q.z) && distance(enemy, q) <= reachOf(q)).sort((a, b) => distance(enemy, a) - distance(enemy, b))[0];
      if(!target || !regionContains(enemy.regionId||state.region,target.x,target.z)){enemy.engaged=false;
        // 閒晃:沒有獵人時在自己的狩獵區裡慢慢走到隨機一點、停一下再換點(不會只站在原地)。
        const rid=enemy.regionId;
        if(rid&&(enemy.wanderX==null||state.time>enemy.wanderUntil)){const w=randomRegionPoint(rid,random);enemy.wanderX=w.x;enemy.wanderZ=w.z;enemy.wanderUntil=state.time+5+random()*6;}
        const home={x:enemy.wanderX??enemy.homeX??enemy.x,z:enemy.wanderZ??enemy.homeZ??enemy.z},dd=distance(enemy,home);if(dd>.3){const step=Math.min(ENEMIES[enemy.type].speed*dt*.45,dd),p={x:enemy.x+(home.x-enemy.x)/dd*step,z:enemy.z+(home.z-enemy.z)/dd*step};if(!blocked(p)&&lineClear(enemy,p)&&roadOk(enemy,p)&&(!rid||regionContains(rid,p.x,p.z)))Object.assign(enemy,p);else enemy.wanderUntil=0;}continue;
      }
      const reach = enemy.type === 'boss' ? 2.8 : 1.7, d = distance(enemy, target);
      enemy.facingX = target.x; enemy.facingZ = target.z; enemy.facingAt = state.time;
      if (rng) {   // 遠程魔物:不搶近身名額;射程外往前靠,進到射程就站定丟飛行物(打到才扣血,見 pendingHits)
        enemy.engaged = false;
        if (d > rng.range) {
          const delta = Math.min(ENEMIES[enemy.type].speed * dt, d - rng.range * 0.85), p = { x: clamp(enemy.x + (target.x - enemy.x) / d * delta, WORLD.minX + 1, WORLD.maxX - 1), z: enemy.z + (target.z - enemy.z) / d * delta };
          if (regionContains(enemy.regionId || state.region, p.x, p.z) && !blocked(p) && roadOk(enemy, p) && lineClear(enemy, p)) Object.assign(enemy, p);
        } else if (enemy.attackTimer === 0) {
          enemy.attackTimer = rng.every;
          const damage = Math.max(2, Math.round(enemy.attack - target.defense * 0.7)), land = rng.release + d / rng.speed;
          enemy.atkAt = state.time; enemy.atkX = target.x; enemy.atkZ = target.z;
          pendingHits.push({ id: target.id, damage, at: state.time + land, by: enemy.type, fromX: enemy.x, fromZ: enemy.z });
          effect('mshot', target, { sourceX: enemy.x, sourceZ: enemy.z, delay: land, release: rng.release, by: enemy.type, shot: rng.shot, value: damage, color: '#ff8a6e' });
        }
        continue;
      }
      const mine = enemy.engaged && enemy.slotFor === target.id, free = mine || enemy.type === 'boss' || (slots.get(target.id) || 0) < 2;
      if (!free) {
        // 等空位:站到「獵人往空地中心的方向」4 格外(戰鬥另一側、空地深處),不在獵人前面圍一圈擋住畫面。
        enemy.engaged = false; const ar = regionCenter(enemy.regionId || state.region) || target, vx = ar.x - target.x, vz = ar.z - target.z;
        // 等空位時站在「獵人背對空地中心」那半圈上,而且每隻魔物分到不同方位(±72°):
        // 以前一律擠在同一條線上,打起來永遠只有左右兩個方向的刀,八方向攻擊根本看不到。
        const base = Math.atan2(vz, vx), slot = ((enemy.id.charCodeAt(enemy.id.length - 1) + enemy.id.length) % 5) - 2;
        const ang = base + slot * (Math.PI / 5), wx = target.x + Math.cos(ang) * 4.2, wz = target.z + Math.sin(ang) * 4.2;
        const wd = Math.hypot(wx - enemy.x, wz - enemy.z);
        if (wd > .3) { const st = Math.min(ENEMIES[enemy.type].speed * .8 * dt, wd), p = { x: enemy.x + (wx - enemy.x) / wd * st, z: enemy.z + (wz - enemy.z) / wd * st, regionId: enemy.regionId || state.region }; if (fieldOk(p) && roadOk(enemy, p) && lineClear(enemy, p)) { enemy.x = p.x; enemy.z = p.z; } }
        continue;
      }
      enemy.engaged = d <= reach; if (enemy.engaged && !mine) { enemy.slotFor = target.id; if (enemy.type !== 'boss') slots.set(target.id, (slots.get(target.id) || 0) + 1); }
      if (d > reach) {
        const delta = Math.min(ENEMIES[enemy.type].speed * dt, d - reach * 0.8), p = { x: clamp(enemy.x + (target.x - enemy.x) / d * delta,WORLD.minX+1,WORLD.maxX-1), z: enemy.z + (target.z - enemy.z) / d * delta };
        if (regionContains(enemy.regionId||state.region,p.x,p.z) && !blocked(p) && roadOk(enemy, p) && lineClear(enemy, p)) Object.assign(enemy, p);  // 魔物只在自己的狩獵區內追,出了區就不跟;也不追上環村道路。
      } else if (enemy.attackTimer === 0) {
        enemy.attackTimer = enemy.type === 'boss' ? 1.5 : 1.8;
        const damage = Math.max(2, Math.round(enemy.attack - target.defense * 0.7));
        enemy.atkAt = state.time; enemy.atkX = target.x; enemy.atkZ = target.z; target.hitAt = state.time + 0.1; target.hitFromX = enemy.x; target.hitFromZ = enemy.z;
        target.hp = Math.max(0, target.hp - damage); effect('hit', target, { value: damage, sourceX: enemy.x, sourceZ: enemy.z, delay: 0.1, by: enemy.type });
        if (target.hp === 0) { if (wandererOf(target)) downWanderer(target, enemy); else died(target); }
      }
    }
    state.enemies = state.enemies.filter(e => e.hp > 0);
    // 分散站位:同一場戰鬥的魔物、獵人不疊在同一點(畫面才看得清誰在打誰)。只推開、不改目標。
    const spread = (list, minD, avoidRoad = false) => { for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz); if (d >= minD) continue;
      const ux = d > 1e-4 ? dx / d : Math.cos(i * 2.4 + j), uz = d > 1e-4 ? dz / d : Math.sin(i * 2.4 + j), push = Math.min(1.2 * dt, (minD - d) / 2);
      for (const [o, sign] of [[a, -1], [b, 1]]) { const q = { x: o.x + ux * push * sign, z: o.z + uz * push * sign };
        if (!blocked(q) && !inVillage(q.x, q.z) && (!avoidRoad || roadOk(o, q)) && (!o.regionId || regionContains(o.regionId, q.x, q.z))) Object.assign(o, q); } } };
    spread(state.enemies, 2.6, true);
    spread(state.hunters.filter(h => h.hp > 0 && h.status === '戰鬥中'), 2.0);
    // 流浪英雄:還沒加入村莊的英雄。有自己的錢包與生活需求,會自己挑「打得起」的狩獵區,
    // 缺東西會自己走回村莊買(吃飯/喝飲料/睡覺/療傷/賣材料/買裝備),買完再自己回去打怪。
    for (const w of state.wanderers) {
      if (w.hp <= 0) {
        w.reviveTimer = Math.max(0, w.reviveTimer - dt);
        if (w.reviveTimer === 0) { w.hp = w.maxHp; w.satiety = Math.max(w.satiety, 50); w.stamina = Math.max(w.stamina, 50); w.task = null; w.route = []; w.status = '遊蕩中'; }
        continue;
      }
      w.attackTimer = Math.max(0, w.attackTimer - dt);
      const consumption = (w.task ? 0.3 : 1) * (w.trait === 'frugal' ? 0.85 : 1);
      w.satiety = Math.max(0, w.satiety - dt * WANDER_CONSUME.satiety * consumption);
      w.stamina = Math.max(0, w.stamina - dt * WANDER_CONSUME.stamina * consumption);
      w.mood = Math.max(0, w.mood - dt * WANDER_CONSUME.mood * consumption);
      if (w.task === 'trade' || w.task === 'shop' || w.task === 'service') { runTownTask(w, dt, wandererNextTownTask); continue; }
      if (needProduct(w) || (state.time - w.lastTownVisit > 110 && gearAvailable(w))) { wandererReturnToTown(w); continue; }
      // 每隔一段時間重新評估:變強了就可以換到更硬的區域
      if (state.time > (w.regionCheckAt ?? 0)) { w.regionCheckAt = state.time + 45; const pick = bestRegionFor(w); if (pick.id !== w.huntRegion) { w.huntRegion = pick.id; w.route = []; } }
      const region = REGIONS.find(r => r.id === w.huntRegion) || REGIONS[1];
      if (!regionContains(region.id, w.x, w.z)) {      // 還沒進自己的狩獵區 → 先走到區的邊緣
        w.status = '前往' + region.name;
        if (!w.route.length) route(w, ringWaypoints({ x: w.x, z: w.z }, regionEdge(region.id)));
        walk(w, dt); continue;
      }
      w.regionId = region.id;
      const target = state.enemies.filter(e => e.hp > 0 && e.type !== 'boss' && (e.regionId || w.regionId) === region.id && distance(w, e) <= SIGHT).sort((a, b) => distance(w, a) - distance(w, b))[0];
      if (!target) {
        searchStep(w, region.id); walk(w, dt); continue;
      }
      const d = distance(w, target); w.facingX = target.x; w.facingZ = target.z; w.facingAt = state.time;
      if (d <= w.range && !onRingRoad(w.x, w.z)) {   // 站在環村道路上不出手(路上是安全走廊,要先踏出道路)
        w.route = [];
        if (kiteStep(w, dt, region.id)) { w.status = '後撤中'; continue; }   // 遠程流浪英雄被近身:先拉開距離(只在自己的狩獵區裡)
        w.status = '戰鬥中';
        if (w.attackTimer === 0) {
          w.attackTimer = 1.2 * (w.trait === 'swift' ? 0.9 : 1);
          const damage = Math.max(1, Math.round(w.attack * 0.9));
          w.atkAt = state.time; w.atkX = target.x; w.atkZ = target.z; w.lockUntil = state.time + AI_ATTACK_LOCK;
          const { kind, delay } = attackFx(w.classId);   // 跟獵人同一套特效:遠程職業(弓箭手/法師/祭司)畫飛行物,不再一律近戰刀光
          target.hitAt = state.time + delay; target.hitFromX = w.x; target.hitFromZ = w.z;
          target.hp -= damage; effect(kind, target, { sourceX: w.x, sourceZ: w.z, value: damage, targetId: target.id, delay, cls: w.classId });
          if (target.hp <= 0) {
            wandererLoot(target, w);
            w.xp += 12; state.wanderKills = (state.wanderKills || 0) + 1;
            while (w.xp >= 40 && w.level < 60) { w.xp -= 40; w.level++; updateStats(w, true); }
          }
        }
      } else {
        w.status = '追擊中';
        const delta = Math.min(w.speed * dt, Math.max(d - w.range * 0.8, Math.min(d - 0.5, w.speed * dt))), p = { x: w.x + (target.x - w.x) / d * delta, z: w.z + (target.z - w.z) / d * delta, regionId: target.regionId || w.regionId };
        if (!blocked(p) && lineClear(w, p)) Object.assign(w, p);
      }
    }
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
    state.effects = state.effects.filter(e => e.age < (e.type === 'victory' ? 3 : 1.6) + (e.type === 'mshot' ? e.delay || 0 : 0));   // 魔物飛行物:飛行時間另計,數字才播得完 refreshQuest();
  }

  function fresh() {

    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, { version: 2, layoutRevision: 3, worldRevision: 4, region: 'meadow', visitedRegions:['village','meadow'], gold: 1500, wood: 160, ore: 120, herb: 60, cloth: 60, flour: 80, leather: 50, gems: 20, day: 1, time: 0, paused: false, speed: 1, difficulty: 0, kills: 0, totalKills: 0, bossKills: 0, recruited: 0, hunters: [], enemies: [], buildings: Object.fromEntries(BUILDINGS.map(b => [b.id, UNBUILT.has(b.id) ? 0 : 1])), layout: Object.fromEntries(BUILDINGS.map(b => [b.id, { x: b.x, z: b.z }])), stocks: { food: 30, drink: 30, bed: 30, bandage: 30 }, gearStock: { weapon: 0, armor: 0 }, tradeRequests: { wood: 30, ore: 40, herb: 30, cloth: 30, flour: 40, leather: 30 }, counts: { crafted: 0, foodCrafted: 0, traded: 0, gearCrafted: 0, weaponsCrafted: 0, gearSold: 0, services: 0, basicServices: 0, serviceIncome: 0, dungeonWins: 0, rebirths: 0, deaths: 0, trained: 0 }, effects: [], log: [], quest: { index: 0, claimed: false }, expedition: { active: false, bossHp: 0, bossMaxHp: 1150, cooldown: 0, elapsed: 0 }, dungeon: { active: false, floor: 1, bestFloor: 0, wave: 0, enemyHp: 0, enemyMaxHp: 0, time: 0, hunterIds: [], reward: {}, cooldown: 0, phase: '待命', attackTimer: 1, foes: [], events: [], auto: false, startFloor: 0, rest: 0 }, healCooldown: 0, capacity: 8, spawnTimer: 0, seed: 918273, nextId: 0, rally: null, dispatchTeams: defaultDispatchTeams(), settings: { ...DEFAULT_SETTINGS } });
    rebuildNavigation();
    state.visitors = [];
    state.arena = { active: false, wins: 0, losses: 0, enemyHp: 0, enemyMaxHp: 0, time: 0, hunterIds: [], cooldown: 0, phase: '待命', attackTimer: 1, opponent: '暮林訓練隊', reward: 0 };
    // 2026-10-28:開局每個職業各一隻(職業數變動時自動跟著長)
    CLASSES.forEach((c, i) => newHunter(c.id, {x:CAMP.x+i*.55-1.6,z:CAMP.z+Math.sin(i)*.35}, i));
    for (let i = 0; i < 3; i++) state.visitors.push(newVisitor());
    offerNewClass();
    // 流浪英雄的職業由 newWanderer 從 CLASSES 擲骰(祭司已是正式職業,不再固定塞一位流浪祭司)。
    // 2026-10-28:流浪英雄也改成每個職業各一隻(沒指定職業時仍隨機)
    state.wanderers = []; for (const c of CLASSES) state.wanderers.push(newWanderer(c.id));
    state.wanderKills = 0;
    for (let i = 0; i < 10; i++) { const m = mixOf('meadow'); spawn(m[Math.floor(random() * m.length)], null, 'meadow'); }  // 開局草原就有 10 隻
    // 其他狩獵區各 5 隻;*不*預先下載牠們的 sheet(21 隻要 5.6 MB)——真的畫到或進區時才載。
    for (const a of REGIONS) if (a.id !== 'village' && a.id !== 'meadow') { const mix = mixOf(a.id); for (let i = 0; i < 5; i++) spawn(mix[Math.floor(random() * mix.length)], null, a.id); }
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
    // 2026-10-19 起地圖縮小、村莊重排(worldRevision 4):舊存檔裡的座標(英雄、流浪英雄、魔物、集結點)和自訂建築位置在新地圖上沒有意義,
    // 所以建築回到新預設、英雄回營地、魔物與流浪英雄的位置重新來;進度、資源、等級都保留。
    const oldMap = source.worldRevision !== 4;
    // 2026-10-24 遊俠併入弓箭手、移除獵魔人:舊存檔的 ranger／witchhunter 轉成 archer(等級、裝備、名字都保留),不然下面 own(CLASS) 會把他們整隻濾掉。
    for (const list of [source.hunters, source.visitors, source.wanderers]) if (Array.isArray(list)) for (const x of list) if (x && (x.classId === 'ranger' || x.classId === 'witchhunter')) x.classId = 'archer';
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
    const migrateDefault=oldMap||(source.layoutRevision!==2&&matchesLayout(LEGACY_LAYOUT_V14))||matchesLayout(LEGACY_LAYOUT_V15)||matchesLayout(LEGACY_LAYOUT_V16)||ART_LAYOUT_HISTORY.some(matchesLayout);
    const inputLayout=migrateDefault?Object.fromEntries(BUILDINGS.map(b=>[b.id,{x:b.x,z:b.z}])):source.layout;
    const layout = Object.fromEntries(BUILDINGS.map(b => { const sc = number(inputLayout?.[b.id]?.s, 1, .6, 1.6); const pinned = b.id === 'dungeon'; /* 地下城入口固定在野外;其餘建築一律在村界內 */ return [b.id, { x: pinned ? b.x : number(inputLayout?.[b.id]?.x, b.x, VILLAGE_BOUNDS.minX, VILLAGE_BOUNDS.maxX), z: pinned ? b.z : number(inputLayout?.[b.id]?.z, b.z, VILLAGE_BOUNDS.minZ, VILLAGE_BOUNDS.maxZ), ...(sc !== 1 ? { s: sc } : {}) }]; }));
    state.layout = layout;
    rebuildNavigation();
    for (const key of PRODUCT_KEYS) state.stocks[key] = integer(source.stocks?.[key], 30, 0, 1e5);
    for (const key of ['weapon', 'armor']) state.gearStock[key] = integer(source.gearStock?.[key], 0, 0, 1e4);
    for (const key of MATERIAL_KEYS) state.tradeRequests[key] = integer(source.tradeRequests?.[key], state.tradeRequests[key], 0, 999);
    for (const key of Object.keys(state.counts)) state.counts[key] = integer(source.counts?.[key], 0, 0, 1e7);
    state.healCooldown = number(source.healCooldown, 0, 0, 40); state.spawnTimer = number(source.spawnTimer, 0, 0, 4.5);
    if (!oldMap && source.rally && Number.isFinite(source.rally.x) && Number.isFinite(source.rally.z)) state.rally = safePoint({ x: clamp(source.rally.x,WORLD.minX+1,WORLD.maxX-1), z: clamp(source.rally.z,WORLD.minZ+1,WORLD.maxZ-1) });
    if (Array.isArray(source.hunters) && source.hunters.some(h => h && own(CLASS, h.classId))) {
      state.hunters = []; const usedIds = new Set();
      for (const raw of source.hunters.filter(h => h && own(CLASS, h.classId)).slice(0, state.capacity)) {
        const h = newHunter(raw.classId, safePoint(oldMap ? { x: CAMP.x, z: CAMP.z } : { x: number(raw.x,CAMP.x,WORLD.minX+1,WORLD.maxX-1), z: number(raw.z,CAMP.z,WORLD.minZ+1,WORLD.maxZ-1) }));
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
      while (visitors.length < 3) visitors.push(newVisitor()); state.visitors = visitors; offerNewClass();
    }
    // 4 組派遣隊伍:舊存檔沒有就補上;名單裡已不存在的獵人自動剔除。
    state.dispatchTeams = normalizeTeams(source.dispatchTeams);
    // 流浪英雄:舊存檔沒有這個欄位就補上(不影響既有獵人與進度)。
    state.wanderers = Array.isArray(source.wanderers) ? source.wanderers.filter(w => w && own(CLASS, w.classId)).map(w => {
      // 射程跟速度一樣以職業表為準:舊存檔的固定流浪祭司存的是近戰射程 1.75,祭司改遠程後要跟著更新。
      // kiting/kiteDir 是暫態(遠程後撤中),讀檔一律從「沒在後撤」開始。
      const base = { ...newWanderer(), ...w, speed: CLASS[w.classId].speed, range: Math.max(CLASS[w.classId].range, 1.75), route: [], kiting: false, kiteDir: null };
      if (oldMap) { const f = newWanderer(); Object.assign(base, { x: f.x, z: f.z, regionId: f.regionId, huntRegion: f.huntRegion, targetId: null, task: null, destination: null, inTown: false, serviceProduct: null, status: '遊蕩中' }); }
      return base;
    }) : [];
    while (state.wanderers.length < 4) state.wanderers.push(newWanderer());
    state.quest = { index: integer(source.quest?.index, 0, 0, QUESTS.length - 1), claimed: source.quest?.claimed === true && source.quest?.index === QUESTS.length - 1 };
    state.enemies = [];
    if (!oldMap && Array.isArray(source.enemies)) for (const raw of source.enemies.filter(e => e && own(ENEMIES, e.type) && e.type !== 'boss').slice(0, 40)) {
      const e = spawn(raw.type, { x: number(raw.x,16,WORLD.minX+1,WORLD.maxX-1), z: number(raw.z,-2,WORLD.minZ+1,WORLD.maxZ-1) }); e.hp = number(raw.hp, e.maxHp, 1, e.maxHp); e.attackTimer = number(raw.attackTimer, 1, 0, 2); e.age = number(raw.age, 0, 0, 1e7);
    }
    if (!state.enemies.length) { const m = mixOf('meadow'); for (let i = 0; i < 6; i++) spawn(m[Math.floor(random() * m.length)], null, 'meadow'); }
    state.expedition.cooldown = number(source.expedition?.cooldown, 0, 0, 60);
    if (source.expedition?.active === true) { const boss = spawn('boss', regionCenter(state.region) || REGIONS[1]); boss.hp = number(source.expedition.bossHp, boss.maxHp, 1, boss.maxHp); Object.assign(state.expedition, { active: true, bossHp: boss.hp, bossMaxHp: boss.maxHp, elapsed: number(source.expedition.elapsed, 0, 0, 210) }); }
    const rawDungeon = source.dungeon, d = state.dungeon;
    d.bestFloor = integer(rawDungeon?.bestFloor, 0, 0, 99); d.floor = d.bestFloor + 1; d.cooldown = number(rawDungeon?.cooldown, 0, 0, 20);
    d.auto = rawDungeon?.auto === true; d.startFloor = integer(rawDungeon?.startFloor, 0, 0, d.bestFloor + 1); d.events = [];
    const selected = Array.isArray(rawDungeon?.hunterIds) ? [...new Set(rawDungeon.hunterIds)].filter(hid => state.hunters.some(h => h.id === hid)).slice(0, 3) : [];
    if (rawDungeon?.active === true && state.buildings.dungeon && selected.length === 3) {
      d.active = true; d.hunterIds = selected; d.phase = '集結中'; d.floor = integer(rawDungeon.floor, d.bestFloor + 1, 1, d.bestFloor + 1); d.wave = integer(rawDungeon.wave, 1, 1, 3); d.time = number(rawDungeon.time, 0, 0, 180);
      // 存檔裡的這一波魔物(型別要存在、血量合理才收);舊存檔沒有 foes → 照目前這一波重新排
      const foes = Array.isArray(rawDungeon.foes) ? rawDungeon.foes.filter(f => f && own(ENEMIES, f.type) && f.type !== 'boss' && Number.isFinite(f.maxHp) && f.maxHp > 0) : [];
      d.foes = foes.slice(0, 3).map(f => ({ id: id('dg'), type: f.type, maxHp: Math.round(number(f.maxHp, 1, 1, 1e7)), hp: Math.round(number(f.hp, f.maxHp, 0, f.maxHp)), attack: number(f.attack, 13 + d.floor * 4, 1, 1e5), timer: number(f.timer, 1.5, 0, 10), every: number(f.every, 2.8, 0.5, 10), ranged: !!MONSTER_RANGED[f.type], big: !!f.big }));
      if (!d.foes.some(f => f.hp > 0)) d.foes = dgWave(d.floor, d.wave);
      dgSync();
      for (const h of state.hunters.filter(h => selected.includes(h.id))) { h.task = 'dungeon'; h.status = h.hp > 0 ? '地下城集結' : '復活中'; h.destination = 'dungeon'; route(h, [door('dungeon', h)]); }
    }
    const a = state.arena, rawArena = source.arena;
    a.wins = integer(rawArena?.wins, 0, 0, 1e6); a.losses = integer(rawArena?.losses, 0, 0, 1e6); a.cooldown = number(rawArena?.cooldown, 0, 0, 25);
    const arenaIds = Array.isArray(rawArena?.hunterIds) ? [...new Set(rawArena.hunterIds)].filter(hid => state.hunters.some(h => h.id === hid && h.task !== 'dungeon')).slice(0, 3) : [];
    if (rawArena?.active === true && state.buildings.training > 0 && arenaIds.length === 3) {
      Object.assign(a, { active: true, phase: '集結中', hunterIds: arenaIds, time: number(rawArena.time, 0, 0, 120), enemyMaxHp: 720 + Math.min(10, a.wins) * 130, attackTimer: number(rawArena.attackTimer, 1, 0, 2) }); a.enemyHp = number(rawArena.enemyHp, a.enemyMaxHp, 1, a.enemyMaxHp);
      for (const h of state.hunters.filter(h => arenaIds.includes(h.id))) { h.task = 'arena'; h.status = '競技場模擬集結'; h.destination = 'training'; route(h, [door('training', h)]); }
    }
    state.effects = []; state.shots = []; state.log = []; log('存檔已載入。獵人重新整隊，村莊繼續運作。', 'success'); refreshQuest();
  }

  function getUpgradeCost(buildingId) {
    const b = BUILDING[buildingId];
    return b ? Object.fromEntries(Object.entries(b.cost).map(([key, amount]) => [key, Math.round(amount * 1.6 ** Math.max(0, state.buildings[buildingId] - 1))])) : null;
  }

  function rerouteHunters() {
    for (const h of state.hunters) {
      if (h.hp <= 0 || (h.task === 'service' && h.serviceStarted)) continue;
      if (h.destination) route(h, [door(h.destination, h)]);
      else if (h.route.length) route(h, [h.route.at(-1)]);
    }
  }

  fresh(); restore(saved);
  state.settings = normalizeSettings(saved && saved.settings);   // 畫質/效能設定(舊存檔沒這個欄位就用預設)
  return {
    state,
    villageNav: () => vnav,   // 測試用:村內可走格與路徑(鋪面、建築與障礙算好的那一份)
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
    // 2026-10-15 使用者指定:「把建築放進各個街區,讓整個村莊看起來整齊」。
    // 這是**玩家按一下才做**的整理(存檔格式保證自訂位置會被保留,所以不能載入時自動改):
    // 每棟建築回到 village-grid.js 的 BLOCK_PLAN 指定的那一格(地下城在村外,不動)。
    tidyVillage() {
      let moved = 0;
      for (const b of BUILDINGS) {
        if (b.id === 'dungeon') continue;
        const slot = BUILDING_SLOTS[b.id]; if (!slot) continue;
        const here = state.layout[b.id]; if (!here) continue;
        if (Math.abs(here.x - slot.x) > .01 || Math.abs(here.z - slot.z) > .01) {
          state.layout[b.id] = { x: slot.x, z: slot.z }; moved++;
        }
      }
      rebuildNavigation(); rerouteHunters();
      log(moved ? `村莊整理完成:${moved} 棟建築回到自己的街區。` : '所有建築已經在自己的街區上。');
      return result(true, moved ? `村莊整理完成（歸位 ${moved} 棟）。` : '所有建築已經在自己的街區上。', moved);
    },
    moveBuilding(buildingId, x, z) {
      const b = BUILDING[buildingId]; if (!b) return result(false, '找不到這棟建築。');
      if (buildingId === 'dungeon') return result(false, '地下城入口的位置固定。');
      if (!Number.isFinite(x) || !Number.isFinite(z)) return result(false, '請選擇有效的位置。');
      // 棋盤格:建築一律落在最近的街區正中(四周都是石板街)。目標街區有別的建築就兩棟互換;中央廣場不能蓋。
      const block = blockAt(x, z);
      if (!block) return result(false, '請把建築放在村莊的街區裡。');
      if (block.use === 'plaza') return result(false, '中央廣場要保持開闊，不能蓋建築。');
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
      state.difficulty = difficulty.id; state.enemies = []; const dm = mixOf(state.region || 'meadow'); for (let i = 0; i < 8; i++) spawn(dm[Math.floor(random() * dm.length)], null, state.region && state.region !== 'village' ? state.region : 'meadow');
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
      const boss = spawn('boss', regionCenter(state.region) || REGIONS[1]); Object.assign(state.expedition, { active: true, bossHp: boss.hp, bossMaxHp: boss.maxHp, elapsed: 0 });
      for (const h of state.hunters) if (!h.task && h.hp > 0) h.targetId = boss.id;
      log('暮林領主現身！村外獵人開始集結討伐。', 'warning'); effect('boss', boss); return result(true, '暮林領主已出現，獵人正前往討伐！');
    },
    setDungeonAuto(on) { state.dungeon.auto = !!on; return result(true, on ? '自動續戰：打完一層會直接挑戰下一層。' : '自動續戰已關閉：打完這一層就回村。'); },
    setDungeonStart(floor) { const d = state.dungeon, f = clamp(Math.floor(number(floor, d.bestFloor + 1, 1, 100)), 1, d.bestFloor + 1); d.startFloor = f >= d.bestFloor + 1 ? 0 : f; return result(true, `下次從第 ${f} 層出發。`); },
    startDungeon(hunterIds = null, startFloor = null) {
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
      const floor = clamp(Math.floor(number(startFloor, d.startFloor || d.bestFloor + 1, 1, 100)), 1, d.bestFloor + 1);   // 從第幾層開始:1 ~ 最高紀錄 +1
      Object.assign(d, { active: true, floor, wave: 1, time: 0, hunterIds: selected.map(h => h.id), reward: {}, phase: '集結中', attackTimer: 1.5, foes: dgWave(floor, 1), events: [], rest: 0 }); dgSync();
      for (const h of selected) { h.task = 'dungeon'; h.destination = 'dungeon'; h.status = '地下城集結'; h.targetId = null; h.serviceProduct = null; h.serviceStarted = false; route(h, [door('dungeon', h)]); }
      log(`${selected.map(h => h.name).join('、')}前往地下城第 ${d.floor} 層${d.auto ? '（自動續戰）' : ''}。`, 'info'); return result(true, '三位獵人已組成小隊，正在前往地下城入口。');
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
      for (const h of selected) { h.task = 'arena'; h.destination = 'training'; h.status = '競技場模擬集結'; h.targetId = null; h.serviceProduct = null; h.serviceStarted = false; route(h, [door('training', h)]); }
      log('三人小隊開始與暮林訓練隊進行離線模擬對戰。', 'info'); return result(true, '競技場模擬對戰已開始，對手為 NPC 訓練隊。');
    },
    // ── 離線／背景掛機(2026-10-30 使用者:「離線後也等同掛機要持續計算各種數據,最大八小時」) ──
    // 8 小時照 0.1 秒一步完整模擬要好幾分鐘(桌機實測 600 秒 ≈ 7.7 秒)→ 先真的模擬前 OFFLINE.sample 秒(UI 分段呼叫 simulate,畫面不卡),
    // 其餘時間照這段的「每秒淨變化」外推:村莊資源、商品庫存、擊倒數、各項統計(只外推增加的)、每位獵人的經驗(會升級)與個人金幣;
    // 遊戲時間、天數、冷卻照實際經過。用完的東西(淨變化是負的)外推到 0 為止。地下城最高樓層不外推(只算真的模擬到的)。
    offlineSnapshot() {
      return { res: Object.fromEntries(RESOURCE_KEYS.map(k => [k, state[k]])), stocks: { ...state.stocks }, kills: state.totalKills, counts: { ...state.counts },
        hunters: Object.fromEntries(state.hunters.map(h => [h.id, { xp: lifetimeXp(h), gold: h.gold, level: h.level, rebirths: h.rebirths }])), time: state.time };
    },
    simulate(seconds) { let left = number(seconds, 0, 0, OFFLINE.max); while (left > 1e-7) { const d = Math.min(0.1, left); step(d); left -= d; } },
    offlineFinish(snap, totalSeconds) {
      const total = number(totalSeconds, 0, 0, OFFLINE.max), sampled = Math.max(0, state.time - snap.time), rest = Math.max(0, total - sampled), f = sampled >= 1 ? rest / sampled : 0;
      if (f > 0) {
        for (const k of RESOURCE_KEYS) if (k !== 'gold') state[k] = Math.max(0, Math.round(state[k] + (state[k] - snap.res[k]) * f));
        for (const k of Object.keys(state.stocks)) state.stocks[k] = Math.max(0, Math.round(state.stocks[k] + (state.stocks[k] - (snap.stocks[k] ?? 0)) * f));
        state.totalKills += Math.round(Math.max(0, state.totalKills - snap.kills) * f); state.kills = state.totalKills;
        for (const [k, v] of Object.entries(state.counts)) if (typeof v === 'number' && typeof snap.counts[k] === 'number' && v > snap.counts[k]) state.counts[k] = Math.round(v + (v - snap.counts[k]) * f);
        // 金幣要守恆:獵人花在村裡的錢 = 村莊收入,錢包花光就沒了 → 「村莊＋獵人」一起外推,每位獵人的錢包到 0 為止,剩下的算村莊的
        const both = state.hunters.filter(h => snap.hunters[h.id]), w0 = both.reduce((n, h) => n + snap.hunters[h.id].gold, 0), w1 = both.reduce((n, h) => n + h.gold, 0);
        const pooled = state.gold + w1 + ((state.gold - snap.res.gold) + (w1 - w0)) * f;
        let wallets = 0;
        for (const h of state.hunters) {
          const s0 = snap.hunters[h.id]; if (!s0) { wallets += h.gold; continue; }
          const xp = lifetimeXp(h) - s0.xp; if (xp > 0 && h.rebirths === s0.rebirths) gainXp(h, Math.round(xp * f));
          h.gold = Math.max(0, Math.round(h.gold + (h.gold - s0.gold) * f)); if (both.includes(h)) wallets += h.gold;
        }
        state.gold = Math.max(0, Math.round(pooled - wallets));
        state.time += rest; state.day = Math.floor(state.time / 240) + 1;
        state.healCooldown = Math.max(0, state.healCooldown - rest);
        for (const k of ['expedition', 'dungeon', 'arena']) state[k].cooldown = Math.max(0, state[k].cooldown - rest);
      }
      const sum = { seconds: Math.round(sampled + rest), capped: number(totalSeconds, 0) > OFFLINE.max, kills: state.totalKills - snap.kills, res: {}, levels: [] };
      for (const k of RESOURCE_KEYS) sum.res[k] = state[k] - snap.res[k];
      for (const h of state.hunters) { const s0 = snap.hunters[h.id]; if (s0 && h.level > s0.level && h.rebirths === s0.rebirths) sum.levels.push({ name: h.name, from: s0.level, to: h.level }); }
      refreshQuest();
      const hh = Math.floor(sum.seconds / 3600), mm = Math.floor(sum.seconds % 3600 / 60);
      log(`離線 ${hh ? hh + ' 小時 ' : ''}${mm} 分鐘：獵人擊倒 ${sum.kills} 隻魔物，村莊金幣 ${sum.res.gold >= 0 ? '+' : ''}${sum.res.gold}。`, 'success');
      return sum;
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
      for (const h of state.hunters) if (h.hp > 0) { h.huntRegion = h.huntRegion ?? state.region; h.targetId = null; if (!h.task) { h.status = '出征中'; h.rallying = true; route(h,[state.rally]); } }
      return result(true, '已設定獵人集結點。');
    },
    exploreRegion(regionId) {
      const region=REGIONS.find(r=>r.id===regionId&&r.id!=='village');if(!region)return result(false,'請選擇村外的生態區。');
      if(state.expedition.active)return result(false,'請先結束目前的首領討伐。');
      state.region=region.id;state.rally=null;if(!state.visitedRegions.includes(region.id))state.visitedRegions.push(region.id);
      state.enemies=state.enemies.filter(e=>e.type==='boss'||e.regionId!==region.id);const mix=mixOf(region.id);preloadMix(mix);for(let i=0;i<12;i++)spawn(mix[Math.floor(random()*mix.length)],null,region.id);
      // 給「所有」存活獵人下指令(正在村內辦事的也先記下,辦完就出發),不要漏掉。
      for(const h of state.hunters)if(h.hp>0){h.huntRegion=region.id;h.targetId=null;if(!h.task){h.rallying=true;h.status='出征中';route(h,ringWaypoints({x:h.x,z:h.z},regionEdge(region.id)));}}
      log(`已派遣獵人前往${region.name}。隊伍會經由橋樑穿越河流。`,'success');return result(true,`出發探索${region.name}！`);
    },
    dispatchHunters(regionId = null, hunterIds = null) {
      // 可以只派指定的獵人(自由組隊);不給名單 = 全部存活獵人。
      // 沒指定區域就用目前區域,在村裡就派去草原。
      const wanted = regionId || (state.region && state.region !== 'village' ? state.region : 'meadow');
      const region = REGIONS.find(r => r.id === wanted) || REGIONS[1];
      state.region = region.id;
      state.rally = null;   // 派遣不佔用玩家設的集結點:獵人走到區的邊緣,進區後自動搜尋
      if (!state.visitedRegions.includes(region.id)) state.visitedRegions.push(region.id);
      // 該區魔物不足就先補到 6 隻,才不會派出去沒東西打
      const alive = state.enemies.filter(e => e.hp > 0 && e.regionId === region.id).length;
      const mix = mixOf(region.id); preloadMix(mix);
      for (let i = alive; i < 12; i++) spawn(mix[Math.floor(random() * mix.length)], null, region.id);
      const chosen = Array.isArray(hunterIds) && hunterIds.length ? new Set(hunterIds) : null;
      let n = 0;
      for (const h of state.hunters) if (h.hp > 0 && (!chosen || chosen.has(h.id))) {
        h.huntRegion = region.id; h.targetId = null;
        if (!h.task) { h.rallying = true; h.status = '出征中'; route(h, ringWaypoints({ x: h.x, z: h.z }, regionEdge(region.id))); }
        n++;
      }
      if (!n) return result(false, chosen ? '選到的獵人目前都不能出征（可能已倒下）。' : '目前沒有可以出征的獵人。');
      log(`已派遣 ${n} 位獵人前往${region.name}狩獵。`, 'success');
      return result(true, `已派遣 ${n} 位獵人前往${region.name}。`);
    },
    setDispatchTeam(index, patch = {}) {
      if (!state.dispatchTeams) state.dispatchTeams = defaultDispatchTeams();
      const team = state.dispatchTeams[index];
      if (!team) return result(false, '沒有這一組隊伍。');
      if (Array.isArray(patch.ids)) {
        const ids = [...new Set(patch.ids.filter(id => state.hunters.some(h => h.id === id)))];
        // 同一位獵人只能在一組:加進這組就從其他組拿掉(四組的隊員可以任意搭配,但不重複)。
        for (const other of state.dispatchTeams) if (other !== team) other.ids = other.ids.filter(id => !ids.includes(id));
        team.ids = ids;
      }
      if (patch.region && REGIONS.some(r => r.id === patch.region && r.id !== 'village')) team.region = patch.region;
      return result(true, `${team.name}已更新。`);
    },
    dispatchTeam(index) {
      if (!state.dispatchTeams) state.dispatchTeams = defaultDispatchTeams();
      const team = state.dispatchTeams[index];
      if (!team) return result(false, '沒有這一組隊伍。');
      if (!team.ids.length) return result(false, `${team.name}還沒有選隊員。`);
      return this.dispatchHunters(team.region, team.ids);
    },
    recallHunters(regionId=null) {
      // 收回狩獵指令:沒有指令的獵人會回到村內待機,等下一次派令。
      let n=0;
      for(const h of state.hunters){ if(regionId&&h.huntRegion!==regionId)continue; if(h.huntRegion){h.huntRegion=null;h.targetId=null;h.rallying=false;if(!h.task)idleInTown(h);n++;} }
      if(!n)return result(false,'目前沒有正在出征的獵人。');
      log(`已召回 ${n} 位獵人回村待機。`,'success');return result(true,`${n} 位獵人回村待機。`);
    },
    serialize() { return JSON.parse(JSON.stringify({ ...state, effects: [], shots: [], log: [], dungeon: { ...state.dungeon, events: [] }, hunters: state.hunters.map(({ route, ...h }) => h) })); },
    pilotStart(hunterId) { const h = state.hunters.find(q => q.id === hunterId); if (!h) return result(false, '找不到這位獵人。'); if (h.hp <= 0) return result(false, '這位獵人倒下了。'); state.pilot = { id: h.id, dx: 0, dz: 0, atk: false, readyAt: 0, lockUntil: 0, faceX: 1, faceZ: 0 }; h.task = 'pilot'; h.status = '手動操控'; h.route = []; return result(true, `開始操控 ${h.name}。`); },
    pilotInput(dx, dz) { if (state.pilot) { state.pilot.dx = dx || 0; state.pilot.dz = dz || 0; } },
    pilotAttack() { if (state.pilot) state.pilot.atk = true; },
    pilotCooldown() { const p = state.pilot; return p ? Math.max(0, (p.readyAt ?? 0) - state.time) : 0; },   // 還有幾秒才能再出手(UI 的 CD 遮罩用)
    pilotLockLeft() { const p = state.pilot; return p ? Math.max(0, (p.lockUntil ?? 0) - state.time) : 0; },   // 僵直還剩幾秒(不能走)
    pilotStop() { const p = state.pilot; if (!p) return result(false, '目前沒有在操控角色。'); state.pilot = null; const h = state.hunters.find(q => q.id === p.id); if (h) { h.task = null; h.status = '待命'; idleInTown(h); } return result(true, '結束手動操控。'); },
    pilotState() { const p = state.pilot; if (!p) return null; const h = state.hunters.find(q => q.id === p.id); return h ? { id: h.id, x: h.x, z: h.z, hp: h.hp, faceX: p.faceX, faceZ: p.faceZ, atkAt: h.atkAt, atkX: h.atkX, atkZ: h.atkZ } : null; },
    setSetting(key, value) { state.settings = normalizeSettings({ ...state.settings, [key]: value }); return { ...state.settings }; },
    reset() { fresh(); return result(true, '新村莊已建立，各職業獵人準備出發。'); },
    // ── 開發者作弊（設定頁的「開發者作弊」區塊呼叫；只動玩家存檔，不影響模擬規則） ──
    cheat(name) {
      const s2 = state;
      switch (name) {
        case 'resources':
          s2.gold += 10000; s2.gems += 100;
          for (const k of Object.keys(s2.materials || {})) s2.materials[k] = (s2.materials[k] || 0) + 500;
          for (const k of Object.keys(s2.stocks || {})) s2.stocks[k] = (s2.stocks[k] || 0) + 50;
          Object.keys(MATERIAL_KEYS).forEach(k => { s2[k] = (s2[k] || 0) + 500; });
          return result(true, '金幣 +10,000、星晶 +100、素材／物資各 +500');
        case 'levels':
          for (const h of [...s2.hunters, ...(s2.wanderers || [])]) { h.level = Math.min(100, h.level + 10); h.xp = 0; updateStats(h); h.hp = h.maxHp; }
          return result(true, '所有獵人／流浪英雄 +10 級（上限 100）');
        case 'buildings':
          for (const b of BUILDINGS) s2.buildings[b.id] = Math.max(5, s2.buildings[b.id] || 0);
          return result(true, '所有建築解鎖並升到 Lv.5');
        case 'quest':
          if (!s2.quest) return result(false, '目前沒有委託');
          s2.quest.progress = s2.quest.target; s2.quest.complete = true;
          return result(true, '當前委託已完成，可以領取獎勵');
        case 'heal':
          for (const h of [...s2.hunters, ...(s2.wanderers || [])]) { h.hp = h.maxHp; h.reviveTimer = 0; if (h.status === '復活中' || h.status === '倒下') h.status = '待機'; }
          return result(true, '所有獵人／流浪英雄回滿血並復活');
        case 'clear':
          { const before = s2.enemies.filter(e => e.type !== 'boss').length;
            s2.enemies = s2.enemies.filter(e => e.type === 'boss');
            return result(true, `清空場上 ${before} 隻魔物`); }
        case 'wanderer':
          { const have = new Set((s2.wanderers || []).map(w => w.classId));
            const pick = CLASSES.find(c => !have.has(c.id)) || CLASSES[Math.floor(random() * CLASSES.length)];
            s2.wanderers.push(newWanderer(pick.id));
            return result(true, `多一位流浪英雄：${pick.name}`); }
        case 'all':
          { const out = ['resources', 'levels', 'buildings', 'quest', 'heal'].map(k => this.cheat(k).message);
            return result(true, '一次套用：' + out.join('／')); }
        default: return result(false, '未知的作弊指令');
      }
    },
  };
}
