import { BUILDINGS, CLASSES, HUNT_ZONE, CAMP } from './data.js';

const CLASS = Object.assign(Object.create(null), Object.fromEntries(CLASSES.map(c => [c.id, c])));
const BUILDING = Object.assign(Object.create(null), Object.fromEntries(BUILDINGS.map(b => [b.id, b])));
const GATE = { x: 8, z: 0 };
const CLINIC = { x: -4, z: 2.4 };
const NAMES = ['阿爾登', '莉雅', '賽琳', '羅恩', '芙蕾雅', '伊諾', '艾莉', '卡爾', '瑪琳'];
const ENEMIES = {
  slime: { hp: 42, attack: 5, speed: 0.8, gold: 15, xp: 12 },
  wolf: { hp: 65, attack: 7, speed: 1.7, gold: 22, xp: 18 },
  golem: { hp: 105, attack: 9, speed: 0.65, gold: 32, xp: 25 },
  boss: { hp: 680, attack: 12, speed: 0.75, gold: 180, xp: 100 },
};
const QUESTS = [
  { title: '爐火旁的新同伴', description: '在橡木酒館招募 1 位獵人', target: 1, reward: { gold: 100, wood: 25 }, metric: s => s.recruited },
  { title: '林地的守望者', description: '累計擊退 8 隻魔物', target: 8, reward: { gold: 150, ore: 25 }, metric: s => s.totalKills },
  { title: '淬鍊第一道鋒芒', description: '將餘燼鐵匠鋪升至 2 級', target: 2, reward: { gold: 180, wood: 30, gems: 4 }, metric: s => s.buildings.forge },
  { title: '暮林深處的咆哮', description: '出征並擊敗 1 位森林領主', target: 1, reward: { gold: 250, ore: 40, gems: 8 }, metric: s => s.bossKills },
  { title: '讓村落再次繁盛', description: '累計擊退 40 隻魔物', target: 40, reward: { gold: 500, wood: 80, ore: 60, gems: 12 }, metric: s => s.totalKills },
];
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const number = (n, fallback, min = 0, max = 1e9) => typeof n === 'number' && Number.isFinite(n) ? clamp(n, min, max) : fallback;
const integer = (n, fallback, min = 0, max = 1e9) => Math.floor(number(n, fallback, min, max));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const rects = BUILDINGS.map(b => ({ minX: b.x - b.w / 2 - 0.42, maxX: b.x + b.w / 2 + 0.42, minZ: b.z - b.d / 2 - 0.42, maxZ: b.z + b.d / 2 + 0.42 }));
const blocked = p => rects.some(r => p.x > r.minX && p.x < r.maxX && p.z > r.minZ && p.z < r.maxZ);
const safePoint = p => blocked(p) ? { ...CAMP } : p;

// A tiny visibility graph keeps all walking routes outside the six building footprints.
function lineClear(a, b) {
  return !rects.some(r => {
    let near = 0, far = 1;
    for (const [key, low, high] of [['x', r.minX, r.maxX], ['z', r.minZ, r.maxZ]]) {
      const delta = b[key] - a[key];
      if (Math.abs(delta) < 1e-8) {
        if (a[key] <= low || a[key] >= high) return false;
      } else {
        let t0 = (low - a[key]) / delta, t1 = (high - a[key]) / delta;
        if (t0 > t1) [t0, t1] = [t1, t0];
        near = Math.max(near, t0); far = Math.min(far, t1);
        if (near >= far) return false;
      }
    }
    return far > 1e-7 && near < 1 - 1e-7;
  });
}

function pathBetween(from, to) {
  if (lineClear(from, to)) return [{ ...to }];
  const nodes = [{ x: from.x, z: from.z }, to];
  for (const r of rects) {
    for (const x of [r.minX - 0.08, r.maxX + 0.08]) {
      for (const z of [r.minZ - 0.08, r.maxZ + 0.08]) if (!blocked({ x, z })) nodes.push({ x, z });
    }
  }
  const lengths = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = new Set();
  lengths[0] = 0;
  for (let step = 0; step < nodes.length; step++) {
    let current = -1;
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (current < 0 || lengths[i] < lengths[current])) current = i;
    if (current < 0 || !Number.isFinite(lengths[current]) || current === 1) break;
    visited.add(current);
    for (let i = 0; i < nodes.length; i++) {
      if (visited.has(i) || !lineClear(nodes[current], nodes[i])) continue;
      const next = lengths[current] + distance(nodes[current], nodes[i]);
      if (next < lengths[i]) { lengths[i] = next; previous[i] = current; }
    }
  }
  if (previous[1] < 0) return [];
  const path = [];
  for (let i = 1; i !== 0; i = previous[i]) path.unshift({ ...nodes[i] });
  return path;
}

export function createGame(saved = null) {
  const state = {};
  const id = prefix => `${prefix}${++state.nextId}`;
  const random = () => {
    state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
    return state.seed / 4294967296;
  };
  const log = (text, tone = 'info') => {
    state.log.unshift({ id: id('log'), text, tone });
    state.log.length = Math.min(24, state.log.length);
  };
  const effect = (type, p, extra = {}) => {
    state.effects.push({ id: id('fx'), type, x: p.x, z: p.z, age: 0, ...extra });
    if (state.effects.length > 80) state.effects.splice(0, state.effects.length - 80);
  };
  function updateStats(h, preserveRatio = false) {
    const ratio = h.maxHp > 0 ? h.hp / h.maxHp : 1;
    const c = CLASS[h.classId];
    h.maxHp = Math.round(c.hp * (1 + (h.level - 1) * 0.09) * (1 + (state.buildings.academy - 1) * 0.15));
    h.attack = Math.round(c.attack * (1 + (h.level - 1) * 0.12) * (1 + (state.buildings.forge - 1) * 0.2));
    h.range = h.classId === 'knight' ? 1.6 : h.classId === 'ranger' ? 5 : 4.2;
    h.hp = preserveRatio ? Math.max(1, Math.round(h.maxHp * ratio)) : clamp(h.hp ?? h.maxHp, 1, h.maxHp);
  }
  function route(h, points) {
    h.route = [];
    let start = { x: h.x, z: h.z };
    for (const point of points) {
      const leg = pathBetween(start, point);
      h.route.push(...leg); start = point;
    }
  }
  function depart(h) {
    h.status = '出征中'; h.targetId = null; h.rallying = false;
    const target = state.rally ?? { x: 13 + random() * 3, z: -2 - random() * 3 };
    route(h, h.x < 8 ? [CAMP, GATE, target] : [target]);
  }
  function retreat(h) {
    h.status = '返村中'; h.targetId = null; h.rallying = false;
    route(h, h.x > 8 ? [GATE, CAMP, CLINIC] : [CAMP, CLINIC]);
    effect('warning', h);
  }
  function newHunter(classId, position = CAMP) {
    const h = { id: id('h'), name: NAMES[state.hunters.length % NAMES.length], classId, level: 1, x: position.x, z: position.z, hp: CLASS[classId].hp, maxHp: CLASS[classId].hp, status: '出征中', targetId: null, attackTimer: random() * 0.5, xp: 0, route: [] };
    updateStats(h); h.hp = h.maxHp; state.hunters.push(h); depart(h);
    return h;
  }
  function spawn(type, position) {
    const difficulty = 1 + Math.min(1, (state.day - 1) * 0.04);
    const e = { id: id('e'), type, x: position?.x ?? 13 + random() * 9, z: position?.z ?? -9 + random() * 11, hp: Math.round(ENEMIES[type].hp * difficulty), maxHp: Math.round(ENEMIES[type].hp * difficulty), attackTimer: 0.8 + random(), age: 0 };
    state.enemies.push(e);
    return e;
  }
  function refreshQuest() {
    const q = QUESTS[state.quest.index];
    Object.assign(state.quest, { title: q.title, description: q.description, target: q.target, reward: { ...q.reward }, progress: Math.min(q.target, q.metric(state)) });
    state.quest.complete = state.quest.progress >= state.quest.target;
  }
  function fresh() {
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, { version: 1, gold: 480, wood: 140, ore: 80, gems: 12, day: 1, time: 0, paused: false, speed: 1, kills: 0, totalKills: 0, bossKills: 0, recruited: 0, hunters: [], enemies: [], buildings: Object.fromEntries(BUILDINGS.map(b => [b.id, 1])), effects: [], log: [], quest: { index: 0, claimed: false }, expedition: { active: false, bossHp: 0, bossMaxHp: 680, cooldown: 0, elapsed: 0 }, healCooldown: 0, capacity: 5, farmTimer: 0, spawnTimer: 0, seed: 918273, nextId: 0, rally: null });
    for (let i = 0; i < CLASSES.length; i++) newHunter(CLASSES[i].id, { x: i * 0.9 - 0.9, z: i * 0.4 });
    spawn('slime', { x: 12, z: -2 }); spawn('slime', { x: 15, z: -4 });
    spawn('wolf', { x: 19, z: -7 }); spawn('slime', { x: 18, z: 1 }); spawn('golem', { x: 22, z: -3 });
    log('爐火已點亮，三位獵人正前往暮林。', 'success'); refreshQuest();
  }
  function restore(input) {
    let source = input;
    if (typeof source === 'string') { try { source = JSON.parse(source); } catch { return; } }
    if (!source || typeof source !== 'object' || Array.isArray(source) || source.version !== 1) return;
    for (const resource of ['gold', 'wood', 'ore', 'gems']) state[resource] = integer(source[resource], state[resource], 0, 1e7);
    state.time = number(source.time, 0, 0, 240 * 9999); state.day = Math.floor(state.time / 240) + 1;
    for (const metric of ['totalKills', 'bossKills', 'recruited']) state[metric] = integer(source[metric], 0, 0, 1e7);
    state.kills = state.totalKills; state.paused = source.paused === true; state.speed = integer(source.speed, 1, 1, 3);
    state.seed = integer(source.seed, 918273, 0, 4294967295); state.nextId = integer(source.nextId, state.nextId, 0, 1e9);
    if (source.rally && Number.isFinite(source.rally.x) && Number.isFinite(source.rally.z)) state.rally = { x: clamp(source.rally.x, 8.5, 26), z: clamp(source.rally.z, -15, 12) };
    for (const b of BUILDINGS) state.buildings[b.id] = integer(source.buildings?.[b.id], 1, 1, 5);
    state.capacity = 4 + state.buildings.tavern;
    state.healCooldown = number(source.healCooldown, 0, 0, 40);
    state.farmTimer = number(source.farmTimer, 0, 0, 12); state.spawnTimer = number(source.spawnTimer, 0, 0, 5);
    if (Array.isArray(source.hunters) && source.hunters.some(h => h && CLASS[h.classId])) {
      state.hunters = [];
      for (const raw of source.hunters.filter(h => h && CLASS[h.classId]).slice(0, state.capacity)) {
        const p = safePoint({ x: number(raw.x, 0, -18, 26), z: number(raw.z, 0, -15, 16) });
        const h = newHunter(raw.classId, p);
        h.name = typeof raw.name === 'string' ? raw.name.slice(0, 16) : h.name;
        h.level = integer(raw.level, 1, 1, 50); h.xp = number(raw.xp, 0, 0, h.level * 40 - 0.001);
        updateStats(h); h.hp = number(raw.hp, h.maxHp, 1, h.maxHp); h.attackTimer = number(raw.attackTimer, 0, 0, 2);
        if (raw.status === '休養中') { h.x = CLINIC.x; h.z = CLINIC.z; h.status = '休養中'; h.route = []; }
        else if (raw.status === '返村中' || h.hp < h.maxHp * 0.27) retreat(h);
        else depart(h);
      }
    }
    state.quest = { index: integer(source.quest?.index, 0, 0, QUESTS.length - 1), claimed: source.quest?.claimed === true && source.quest?.index === QUESTS.length - 1 };
    state.expedition.cooldown = number(source.expedition?.cooldown, 0, 0, 60);
    // Battle positions restart safely; persistent progress, wounds and ability timers survive reloads.
    if (source.expedition?.active === true) {
      const boss = spawn('boss', { x: 21, z: -8 });
      boss.hp = number(source.expedition.bossHp, boss.maxHp, 1, boss.maxHp);
      Object.assign(state.expedition, { active: true, bossHp: boss.hp, bossMaxHp: boss.maxHp, elapsed: number(source.expedition.elapsed, 0, 0, 210) });
    }
    state.effects = []; state.log = [];
    log('歡迎回到暮影村。獵人已整理行裝，繼續守望。', 'success'); refreshQuest();
  }
  function walk(h, dt) {
    let available = CLASS[h.classId].speed * dt * (h.status === '返村中' ? 1.18 : 1);
    while (available > 0 && h.route.length) {
      const target = h.route[0], remaining = distance(h, target);
      if (remaining <= available) { h.x = target.x; h.z = target.z; h.route.shift(); available -= remaining; }
      else { h.x += (target.x - h.x) / remaining * available; h.z += (target.z - h.z) / remaining * available; available = 0; }
    }
  }
  function rewardEnemy(enemy, hunter) {
    enemy.hp = 0; state.totalKills++; state.kills = state.totalKills;
    const data = ENEMIES[enemy.type], gold = Math.round(data.gold * (1 + (state.buildings.hall - 1) * 0.15));
    state.gold += gold; state.wood += enemy.type === 'slime' ? 3 : 1; state.ore += enemy.type === 'golem' ? 5 : 2;
    effect('loot', enemy, { text: `+${gold}`, color: '#efcd82' });
    for (const h of state.hunters) {
      if (distance(h, enemy) > 12 && h !== hunter) continue;
      h.xp += data.xp;
      while (h.xp >= h.level * 40 && h.level < 50) {
        h.xp -= h.level * 40; h.level++; updateStats(h, true); h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.25);
        effect('level', h); log(`${h.name} 成長至 Lv.${h.level}。`, 'success');
      }
    }
    if (enemy.type === 'boss') {
      state.bossKills++; state.gems += 5; state.gold += 120;
      Object.assign(state.expedition, { active: false, bossHp: 0, cooldown: 55, elapsed: 0 });
      log('森林領主倒下了！獲得額外 120 金幣與 5 顆晶石。', 'success'); effect('victory', enemy);
    } else if (state.totalKills % 4 === 0) log(`獵人帶回戰利品，已擊退 ${state.totalKills} 隻魔物。`, 'loot');
  }
  function step(dt) {
    state.time += dt; state.day = Math.floor(state.time / 240) + 1;
    state.healCooldown = Math.max(0, state.healCooldown - dt);
    state.expedition.cooldown = Math.max(0, state.expedition.cooldown - dt);
    state.farmTimer += dt; state.spawnTimer += dt;
    if (state.farmTimer >= 12) {
      state.farmTimer -= 12; state.gold += 8 * state.buildings.farm; state.wood += 3 * state.buildings.farm;
      effect('harvest', BUILDING.farm);
    }
    if (state.spawnTimer >= 4.5) {
      state.spawnTimer -= 4.5;
      if (state.enemies.filter(e => e.hp > 0 && e.type !== 'boss').length < 5) spawn(random() < 0.55 ? 'slime' : random() < 0.7 ? 'wolf' : 'golem');
    }
    for (const h of state.hunters) {
      h.attackTimer = Math.max(0, h.attackTimer - dt);
      if (h.status === '休養中') {
        h.hp = Math.min(h.maxHp, h.hp + 12 * (1 + (state.buildings.clinic - 1) * 0.3) * dt);
        if (h.hp >= h.maxHp) { effect('heal', h); depart(h); }
        continue;
      }
      if (h.status === '返村中') {
        walk(h, dt);
        if (!h.route.length) { h.status = '休養中'; effect('heal', h); }
        continue;
      }
      if (h.hp <= h.maxHp * 0.24) { retreat(h); continue; }
      if (h.rallying) {
        walk(h, dt);
        if (!h.route.length) h.rallying = false;
        continue;
      }
      const available = state.enemies.filter(e => e.hp > 0);
      let target = available.find(e => e.id === h.targetId);
      if (!target || (state.expedition.active && target.type !== 'boss')) {
        target = state.expedition.active ? available.find(e => e.type === 'boss') : null;
        target ??= available.sort((a, b) => distance(h, a) - distance(h, b))[0];
        h.targetId = target?.id ?? null;
      }
      if (target && h.x >= GATE.x - 0.2 && distance(h, target) <= h.range) {
        h.status = '戰鬥中'; h.route = [];
        if (h.attackTimer === 0) {
          h.attackTimer = h.classId === 'mage' ? 1.65 : h.classId === 'ranger' ? 1.25 : 1.15;
          target.hp -= h.attack;
          effect(h.classId === 'mage' ? 'spell' : h.classId === 'ranger' ? 'arrow' : 'slash', target, { sourceX: h.x, sourceZ: h.z, value: h.attack, targetId: target.id });
          if (target.hp <= 0) rewardEnemy(target, h);
        }
      } else {
        if (h.status !== '出征中') h.status = '出征中';
        if (h.x < GATE.x - 0.2) { if (!h.route.length) depart(h); }
        else if (target) {
          const aim = { x: target.x, z: target.z };
          const tail = h.route[h.route.length - 1];
          if (!tail || distance(tail, aim) > 0.7) route(h, [aim]);
        } else if (!h.route.length && state.rally && distance(h, state.rally) > 1) route(h, [state.rally]);
        walk(h, dt);
        if (!target && !h.route.length) h.status = '待命';
      }
    }
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) continue;
      enemy.age += dt; enemy.attackTimer = Math.max(0, enemy.attackTimer - dt);
      const target = state.hunters.filter(h => h.x >= 8 && h.status !== '返村中' && h.status !== '休養中').sort((a, b) => distance(enemy, a) - distance(enemy, b))[0];
      if (!target || distance(enemy, target) > (enemy.type === 'boss' ? 15 : 10)) continue;
      const reach = enemy.type === 'boss' ? 2.4 : 1.3;
      if (distance(enemy, target) > reach) {
        const delta = Math.min(ENEMIES[enemy.type].speed * dt, Math.max(0, distance(enemy, target) - reach * 0.8));
        const d = distance(enemy, target);
        enemy.x = Math.max(9, enemy.x + (target.x - enemy.x) / d * delta); enemy.z += (target.z - enemy.z) / d * delta;
      } else if (enemy.attackTimer === 0) {
        enemy.attackTimer = enemy.type === 'boss' ? 1.5 : 1.7;
        const damage = Math.round(ENEMIES[enemy.type].attack * (target.classId === 'knight' ? 0.75 : 1));
        target.hp = Math.max(1, target.hp - damage); effect('hit', target, { value: damage });
        if (target.hp <= target.maxHp * 0.24) retreat(target);
      }
    }
    state.enemies = state.enemies.filter(e => e.hp > 0);
    if (state.expedition.active) {
      state.expedition.elapsed += dt;
      const boss = state.enemies.find(e => e.type === 'boss');
      state.expedition.bossHp = boss?.hp ?? 0; state.expedition.bossMaxHp = boss?.maxHp ?? 680;
      if (state.expedition.elapsed >= 210) {
        state.enemies = state.enemies.filter(e => e.type !== 'boss');
        Object.assign(state.expedition, { active: false, bossHp: 0, cooldown: 35, elapsed: 0 });
        log('暮霧遮蔽了領主的蹤跡。整頓隊伍後，可以再次出征。', 'warning');
      }
    }
    for (const e of state.effects) e.age += dt;
    state.effects = state.effects.filter(e => e.age < (e.type === 'victory' ? 3 : 1.6));
    refreshQuest();
  }
  const result = (ok, message) => ({ ok, message });
  const canPay = cost => Object.entries(cost).every(([k, n]) => state[k] >= n);
  const pay = cost => { for (const [key, amount] of Object.entries(cost)) state[key] -= amount; };
  function getUpgradeCost(buildingId) {
    const building = BUILDING[buildingId];
    return building ? Object.fromEntries(Object.entries(building.cost).map(([key, amount]) => [key, Math.round(amount * 1.6 ** (state.buildings[buildingId] - 1))])) : null;
  }
  fresh(); restore(saved);
  return {
    state,
    tick(dt) {
      if (state.paused || !Number.isFinite(dt) || dt <= 0) return;
      let remaining = Math.min(dt, 30) * number(state.speed, 1, 1, 3);
      while (remaining > 1e-7) { const stepSize = Math.min(0.1, remaining); step(stepSize); remaining -= stepSize; }
    },
    recruit(classId) {
      const c = CLASS[classId];
      if (!c) return result(false, '找不到這位獵人的職業。');
      if (state.hunters.length >= state.capacity) return result(false, '獵人名額已滿，升級酒館可增加名額。');
      if (state.gold < c.cost) return result(false, `招募需要 ${c.cost} 金幣。`);
      state.gold -= c.cost; const h = newHunter(classId, { x: -7.7, z: -1.8 }); state.recruited++;
      log(`${h.name}，${c.name}，加入了暮影村。`, 'success'); refreshQuest();
      return result(true, `${h.name} 已加入隊伍，正前往暮林。`);
    },
    getUpgradeCost,
    upgrade(buildingId) {
      const building = BUILDING[buildingId];
      if (!building) return result(false, '找不到這棟建築。');
      if (state.buildings[buildingId] >= 5) return result(false, '這棟建築已達最高等級。');
      const cost = getUpgradeCost(buildingId);
      if (!canPay(cost)) return result(false, '資源不足，讓獵人繼續狩獵吧。');
      pay(cost); state.buildings[buildingId]++; state.capacity = 4 + state.buildings.tavern;
      for (const h of state.hunters) updateStats(h, true);
      effect('upgrade', building); log(`${building.name} 升至 Lv.${state.buildings[buildingId]}。`, 'success'); refreshQuest();
      return result(true, `${building.name} 升級完成。${building.effect}`);
    },
    heal() {
      if (state.healCooldown > 0) return result(false, `月草祝福還需 ${Math.ceil(state.healCooldown)} 秒。`);
      for (const h of state.hunters) { h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.45); effect('heal', h); }
      state.healCooldown = 40; log('月草祝福降臨，全體獵人恢復 45% 生命。', 'success');
      return result(true, '全體獵人恢復 45% 生命。');
    },
    expedition() {
      if (state.expedition.active) return result(false, '獵人正與森林領主交戰。');
      if (state.expedition.cooldown > 0) return result(false, `整備中，${Math.ceil(state.expedition.cooldown)} 秒後可再次出征。`);
      const boss = spawn('boss', { x: HUNT_ZONE.x + 5, z: HUNT_ZONE.z - 3 });
      Object.assign(state.expedition, { active: true, bossHp: boss.hp, bossMaxHp: boss.maxHp, elapsed: 0 });
      for (const h of state.hunters) if (h.status !== '返村中' && h.status !== '休養中') h.targetId = boss.id;
      log('暮林領主已現身！獵人正集結前往討伐。', 'warning'); effect('boss', boss);
      return result(true, '森林領主現身，全隊開始出征！');
    },
    claimQuest() {
      refreshQuest();
      if (!state.quest.complete) return result(false, '委託尚未完成。');
      if (state.quest.claimed) return result(false, '所有委託都已完成，繼續守護暮影村吧。');
      const reward = state.quest.reward;
      for (const [key, value] of Object.entries(reward)) state[key] += value;
      log(`委託「${state.quest.title}」完成，獎勵已入庫。`, 'success');
      if (state.quest.index < QUESTS.length - 1) state.quest = { index: state.quest.index + 1, claimed: false };
      else state.quest.claimed = true;
      refreshQuest(); return result(true, '委託獎勵已領取。');
    },
    setRally(x, z) {
      if (!Number.isFinite(x) || !Number.isFinite(z) || x < 8.5 || x > 26 || z < -15 || z > 12) return result(false, '請在村外的林地設定集結點。');
      state.rally = { x, z }; effect('rally', state.rally);
      for (const h of state.hunters) if (h.status !== '返村中' && h.status !== '休養中') {
        h.targetId = null; h.status = '出征中'; h.rallying = true; route(h, h.x < 8 ? [CAMP, GATE, state.rally] : [state.rally]);
      }
      return result(true, '已設置獵人集結點。');
    },
    serialize() {
      return JSON.parse(JSON.stringify({ ...state, effects: [], log: [], hunters: state.hunters.map(({ route, ...h }) => h) }));
    },
    reset() { fresh(); return result(true, '新的一天，從暮影村開始。'); },
  };
}
