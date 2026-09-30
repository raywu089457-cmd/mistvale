import assert from 'node:assert/strict';
import { createGame } from './src/game.js';
import { BUILDINGS } from './src/data.js';

function run(game, seconds) { for (let t = 0; t < seconds; t += 0.1) game.tick(0.1); }
const g = createGame();
assert.equal(g.state.hunters.length, 3);
assert.equal(new Set(g.state.hunters.map(h => h.classId)).size, 3);
assert.equal(g.state.capacity, 5);
assert.equal(g.recruit('unknown').ok, false);
assert.equal(g.recruit('knight').ok, true);
assert.equal(g.state.gold, 360);
assert.equal(g.state.quest.complete, true);
assert.equal(g.claimQuest().ok, true);
const afterClaim = g.state.gold;
assert.equal(g.claimQuest().ok, false);
assert.equal(g.state.gold, afterClaim);
assert.equal(g.recruit('ranger').ok, true);
assert.equal(g.recruit('mage').ok, false);
const hpBefore = g.state.hunters[0].maxHp, attackBefore = g.state.hunters[0].attack;
g.state.gold = 10000; g.state.wood = 10000; g.state.ore = 10000;
assert.equal(g.upgrade('forge').ok, true);
assert.ok(g.state.hunters[0].attack > attackBefore);
assert.deepEqual(g.getUpgradeCost('forge'), { gold: 240, wood: 24, ore: 48 });
assert.equal(g.upgrade('academy').ok, true);
assert.ok(g.state.hunters[0].maxHp > hpBefore);
assert.equal(g.upgrade('tavern').ok, true);
assert.equal(g.state.capacity, 6);
assert.equal(g.recruit('mage').ok, true);
assert.equal(g.state.hunters.at(-1).hp, g.state.hunters.at(-1).maxHp, 'New recruits receive full upgraded maximum HP');
for (let i = 0; i < 4; i++) g.upgrade('forge');
assert.equal(g.state.buildings.forge, 5);
assert.equal(g.upgrade('forge').ok, false);
g.state.gold = 0; g.state.wood = 0; g.state.ore = 0;
assert.equal(g.upgrade('hall').ok, false);
assert.equal(g.state.gold, 0);

const combat = createGame();
run(combat, 15);
assert.ok(combat.state.totalKills >= 1, 'First kill within 15 seconds');
assert.ok(combat.state.gold > 480, 'Hunts and farm earn gold');
const healer = combat.state.hunters[0]; healer.hp = healer.maxHp * 0.1;
assert.equal(combat.heal().ok, true);
assert.ok(healer.hp >= healer.maxHp * 0.54);
assert.equal(combat.heal().ok, false);
run(combat, 41);
assert.equal(combat.heal().ok, true);
assert.equal(combat.expedition().ok, true);
assert.equal(combat.expedition().ok, false);
run(combat, 180);
assert.ok(combat.state.bossKills >= 1, 'Starter team can complete boss expedition');
assert.ok(combat.state.hunters.every(h => h.hp > 0));
assert.ok(combat.state.effects.length <= 80);
assert.ok(combat.state.log.length <= 24);

const routes = createGame();
routes.recruit('knight');
let sawReturn = false, sawRecovery = false;
for (let i = 0; i < 3000; i++) {
  if (i === 160) routes.state.hunters[0].hp = 1;
  routes.tick(0.1);
  for (const h of routes.state.hunters) {
    sawReturn ||= h.status === '返村中'; sawRecovery ||= h.status === '休養中';
    for (const b of BUILDINGS) assert.ok(!(Math.abs(h.x - b.x) < b.w / 2 + 0.3 && Math.abs(h.z - b.z) < b.d / 2 + 0.3), `${h.name} penetrated ${b.id} at ${h.x}, ${h.z}`);
  }
}
assert.ok(sawReturn && sawRecovery, 'Wounded hunters return to clinic and recover');

const serialized = combat.serialize();
const loaded = createGame(JSON.stringify(serialized));
assert.equal(loaded.state.totalKills, combat.state.totalKills);
assert.equal(loaded.state.gold, combat.state.gold);
assert.equal(loaded.state.buildings.forge, combat.state.buildings.forge);
assert.equal(loaded.state.hunters[0].level, combat.state.hunters[0].level);
assert.ok(Math.abs(loaded.state.hunters[0].hp - combat.state.hunters[0].hp) < 0.001);
assert.equal(loaded.state.healCooldown, combat.state.healCooldown);
const originalState = loaded.state;
loaded.reset();
assert.equal(loaded.state, originalState);
assert.equal(loaded.state.gold, 480);

const bad = createGame({ version: 1, gold: -999, wood: Infinity, ore: 'bad', gems: 1e100, time: NaN, speed: Infinity, buildings: { forge: -3, tavern: 999, clinic: 'x' }, quest: { index: -7 }, hunters: [{ classId: 'evil' }, { classId: 'mage', level: -9, hp: -1, x: Infinity, z: NaN, xp: Infinity }], expedition: { active: true, bossHp: -1, elapsed: Infinity } });
assert.equal(bad.state.gold, 0);
assert.equal(bad.state.wood, 140);
assert.equal(bad.state.gems, 1e7);
assert.equal(bad.state.buildings.forge, 1);
assert.equal(bad.state.buildings.tavern, 5);
run(bad, 20);
for (const resource of ['gold', 'wood', 'ore', 'gems', 'time']) assert.ok(Number.isFinite(bad.state[resource]) && bad.state[resource] >= 0);
assert.ok(bad.state.hunters.every(h => Number.isFinite(h.x) && Number.isFinite(h.z) && h.hp > 0));
assert.equal(createGame('{oops').state.gold, 480);
assert.equal(createGame(null).state.gold, 480);
assert.equal(createGame({ version: 1, hunters: [{ classId: '__proto__' }] }).state.hunters.length, 3);
assert.equal(createGame({ ...serialized, speed: 1.5 }).state.speed, 1);
assert.equal(createGame({ ...serialized, speed: 999 }).state.speed, 3);

const assigned = createGame();
Object.assign(assigned.state, createGame(g.serialize()).state);
assigned.state.gold = 10000; assigned.state.wood = 10000; assigned.state.ore = 10000;
const assignedBefore = assigned.state.gold;
assert.equal(assigned.upgrade('hall').ok, true, 'Imported state is used by existing game action closures');
assert.equal(assigned.state.gold, assignedBefore - 180);

const deterministicA = createGame(), deterministicB = createGame();
run(deterministicA, 60); run(deterministicB, 60);
assert.deepEqual(deterministicA.serialize(), deterministicB.serialize());
const paused = createGame(); paused.state.paused = true; paused.tick(10); assert.equal(paused.state.time, 0);
paused.state.paused = false; paused.state.speed = 2; paused.tick(2); assert.ok(Math.abs(paused.state.time - 4) < 1e-8);
assert.equal(paused.setRally(18, -3).ok, true); assert.equal(paused.setRally(-4, 5).ok, false);
const rally = createGame(); rally.state.enemies = []; rally.setRally(23, 8);
for (let i = 0; i < 170; i++) { rally.state.enemies = []; rally.state.spawnTimer = 0; rally.tick(0.1); }
assert.ok(rally.state.hunters.every(h => Math.hypot(h.x - 23, h.z - 8) < 0.1), 'Rally commands reach selected point');
const retry = createGame(); retry.state.hunters = []; retry.expedition(); run(retry, 211);
assert.equal(retry.state.expedition.active, false); assert.equal(retry.expedition().ok, false);
run(retry, 36); assert.equal(retry.expedition().ok, true);

const quest = createGame();
quest.recruit('knight'); assert.equal(quest.claimQuest().ok, true);
quest.state.totalKills = 8; assert.equal(quest.claimQuest().ok, true);
quest.state.buildings.forge = 2; assert.equal(quest.claimQuest().ok, true);
quest.state.bossKills = 1; assert.equal(quest.claimQuest().ok, true);
quest.state.totalKills = 40; assert.equal(quest.claimQuest().ok, true);
const allRewards = quest.state.gold; assert.equal(quest.claimQuest().ok, false); assert.equal(quest.state.gold, allRewards);
const savedQuest = createGame(quest.serialize()); assert.equal(savedQuest.claimQuest().ok, false);
console.log(`PASS: spending, capacity, upgrades, early combat, healing, boss, collision routes, save validation, deterministic simulation, quest rewards. Boss kills: ${combat.state.bossKills}; total kills: ${combat.state.totalKills}.`);
