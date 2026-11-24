#!/usr/bin/env node
// progression-sim.mjs — headless "reasonable player" playthrough for pacing/balance audits.
// Plays a fresh game with a simple greedy policy and prints one line per in-game day:
// village gold, materials, hunter levels, deaths, quest chapter, buildings, dungeon best floor.
// Usage: node tools/progression-sim.mjs [days=20] [--seed N] [--summary] [--json out.json]
//   --seed N   start the game's RNG at N (default: the game's own fixed seed) — run several seeds before trusting a number
//   --summary  print only one compact line for the final day (for multi-seed tables)
// Nothing under src/ is touched; this only drives the public game API.
import { createGame } from '../src/pixel-game.js';
import { BUILDINGS, PRODUCTS, MATERIALS, DIFFICULTIES, EQUIPMENT, MERCHANT, RECIPES, craftWeaponFor } from '../src/pixel-data.js';
import { writeFileSync } from 'node:fs';

const DAYS = Number(process.argv[2]) || 20;
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const arg = k => process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null;
const SEED = arg('--seed'), SUMMARY = process.argv.includes('--summary'), SAFE_DIFF = process.argv.includes('--stay-easy');   // --train: tap 修煉 for every hunter whenever it is ready (upper bound for an active player)
const TRAIN = process.argv.includes('--train');   // --arena: start the arena ladder whenever it is ready (recommended party)
const ARENA = process.argv.includes('--arena');   // --save FILE: write the final save (open it in the browser to review mid-game screens)
const saveOut = arg('--save');   // --sell: sell surplus materials to the merchant (50 at a time while stock ≥ 150)
const SELL = process.argv.includes('--sell');   // --promote: once every building is Lv.5, spend gold above 2,000 on 晉升 (highest-level hunter first, cheapest step)
const PROMOTE_ON = process.argv.includes('--promote');   // --stay-easy: never raise difficulty
const g = createGame(null);
const s = g.state;
if (SEED != null) s.seed = (Number(SEED) >>> 0) || 1;
// --junk off|sell|salvage: 換下來的舊裝備自動整理設定(預設照遊戲)
if (arg('--junk')) { const r = g.setAutoJunk(arg('--junk')); if (!r.ok) throw new Error(r.message); }
s.paused = false; s.speed = 1;
const DAY = 240, POLICY_EVERY = 5;
const rows = [], events = [];
let deaths = 0, lastDead = new Set();
const deathWhere = {}, deathLog = [], prevOf = new Map();
const ev = (t) => events.push(`d${s.day} ${t}`);
const claimDay = {};   // 章節(1 起算)→ 領取那天;--summary 印第 15 章起(後期節奏,見 docs/BALANCE.md「後期委託」)

// build order a sensible player follows (hint says dungeon first; quests want forge 2)
const BUILD_ORDER = ['dungeon', 'academy', 'training', 'enhancement'];
function policy() {
  // claim quests
  for (let i = 0; i < 3; i++) { const ch = s.quest.index + 1, r = g.claimQuest(); if (r.ok) { claimDay[ch] ??= s.day; ev(`quest claimed → ch${s.quest.index + 1}`); } else break; }
  // keep trade requests on for every material (players are told to do this)
  for (const k of Object.keys(MATERIALS)) if (!s.tradeRequests[k]) g.setTradeRequest(k, 60);
  // keep each service stocked
  for (const [pid, p] of Object.entries(PRODUCTS)) if (s.buildings[p.building] && s.stocks[pid] < 15) g.craft(pid, 1);
  // build missing buildings
  for (const id of BUILD_ORDER) if (!s.buildings[id]) { const r = g.construct(id); if (r.ok) ev(`built ${id}`); }
  // recruit up to capacity (cheapest visitor)
  if (s.hunters.length < s.capacity && s.visitors?.length) {
    const v = [...s.visitors].sort((a, b) => a.cost - b.cost)[0];
    if (s.gold > v.cost + 150) { const r = g.recruit(v.id); if (r.ok) ev(`recruit ${v.classId}`); }
  }
  // forge gear when ingredients allow
  // gear tiers (2026-11-16): keep 2 of the best tier the forge can make (older builds: flat numeric stock)
  if (s.buildings.forge) { const top = g.forgeTier ? g.forgeTier() : 1; // 2026-11-24 weapons come in five types: keep stock only of the types the roster can wield (older builds: one 'weapon' recipe)
    const wTypes = RECIPES && RECIPES.some(r => r.id === 'sword') ? [...new Set(s.hunters.map(h => RECIPES.find(r => r.item === craftWeaponFor(h.classId))?.id).filter(Boolean))] : ['weapon'];
    for (const t of [...wTypes, 'chest', 'helm', 'legs', 'boots', 'gloves', 'belt']) if ((g.gearStockOf ? g.gearStockOf(t, top) : (s.gearStock[t] || 0)) < 2) g.craftEquipment(t); }
  // upgrade: hall first when it gates, then cheapest
  const ups = BUILDINGS.map(b => b.id).filter(id => s.buildings[id] && s.buildings[id] < 5)
    .map(id => ({ id, cost: g.getUpgradeCost(id) })).sort((a, b) => (a.id === 'hall' ? -1 : 0) - (b.id === 'hall' ? -1 : 0) || (a.cost.gold || 0) - (b.cost.gold || 0));
  for (const u of ups) {
    if (s.gold < (u.cost.gold || 0) + 200) continue;
    let r = g.upgrade(u.id);
    // stuck only on materials and rich enough → top up at the trading-post merchant (if the build has it)
    if (!r.ok && g.merchantQuote && !/大廳/.test(r.message)) { const q = g.merchantQuote(u.cost); if (q.ok && Object.keys(q.short).length && s.gold > q.total + 800) { g.buyMaterials(u.cost); r = g.upgrade(u.id); if (r.ok) ev(`merchant ${q.gold}g → up ${u.id}`); } }
    if (r.ok) { ev(`up ${u.id}→${s.buildings[u.id]}`); break; }
  }
  // dungeon, boss when possible
  if (s.buildings.dungeon && !s.dungeon.active && s.dungeon.cooldown <= 0) { g.setDungeonAuto(true); const r = g.startDungeon(); if (r.ok) ev(`dungeon start f${s.dungeon.floor}`); }
  if (!s.expedition.active && s.expedition.cooldown <= 0 && s.day >= 2) { const r = g.expedition(); if (r.ok) ev('boss expedition'); }
  if (SELL && g.sellMaterial) for (const k of Object.keys(MATERIALS)) while ((s[k] || 0) >= 150) if (!g.sellMaterial(k, 50).ok) break;
  if (TRAIN) for (const h of s.hunters) for (let i = 0; i < 100 && g.train(h.id).ok; i++);   // 沒有冷卻:有錢就一直練(積極玩家的上限)
  if (PROMOTE_ON && g.promoteHunter && Object.values(s.buildings).every(v => v >= 5)) {
    const c = s.hunters.filter(h => h.hp > 0 && h.task !== 'dungeon' && h.task !== 'arena').map(h => ({ h, q: g.promoteQuote(h.id) })).filter(x => x.q && !x.q.max)
      .sort((a, b) => a.q.gold - b.q.gold || b.h.level - a.h.level)[0];
    if (c && s.gold >= c.q.gold + 2000 && s.gems >= c.q.gems) { const r = g.promoteHunter(c.h.id); if (r.ok) ev(`promote ${c.h.name} → ${c.q.next}`); }
    // 2026-11-18 星晶不夠、金幣卻夠「晉升費＋買差額＋留 2000」→ 向行商買星晶(一次一組)
    else if (c && g.buyGems && s.gems < c.q.gems && s.gold >= c.q.gold + 2000 + Math.ceil((c.q.gems - s.gems) / MERCHANT.gemLot) * MERCHANT.gemLot * MERCHANT.gemPrice) { const r = g.buyGems(1); if (r.ok) ev(`buy gems ${MERCHANT.gemLot}`); }
  }
  if (ARENA && s.buildings.training && !s.arena?.active && !(s.arena?.cooldown > 0)) { const p = g.recommendArenaParty(); const r = g.startArena(Array.isArray(p) ? p : p?.ids); if (r.ok) ev('arena'); }
  // a Lv.100 hunter stuck in an auto-continue dungeon party: retreat so it can rebirth (the advisor tells players to)
  if (s.dungeon.active && s.hunters.some(h => s.dungeon.hunterIds?.includes(h.id) && h.level >= 100 && (h.rebirths || 0) < 20)) { const r = g.retreatDungeon(); if (r.ok) ev('retreat for rebirth'); }
  // rebirth: a Lv.100 hunter reincarnates when free (final quest chapter; unlocks harder difficulties)
  for (const h of s.hunters) if (h.level >= 100 && h.hp > 0 && h.task !== 'dungeon' && h.task !== 'arena') { const r = g.reincarnate(h.id); if (r.ok) ev(`rebirth ${h.name} (#${h.rebirths})`); }
  // difficulty: switch to the highest unlocked difficulty (what the endgame tracker suggests); setDifficulty refuses while a run is active
  if (!SAFE_DIFF) { const R = s.hunters.reduce((n, h) => n + (h.rebirths || 0), 0), top = [...DIFFICULTIES].reverse().find(d => d.rebirths <= R); if (top && top.id > s.difficulty) { const r = g.setDifficulty(top.id); if (r.ok) ev(`difficulty → ${top.name}`); } }
  // academy/enhancement: a player spreads training over the active roster (lowest first), keeping a 400-gold reserve.
  // (Old policy only trained the top 3 above 600 gold, so the skill/weapon quest chapters lagged for the sim, not for players.)
  const roster = s.hunters.filter(h => h.hp > 0 && h.level >= 5).sort((a, b) => b.level - a.level).slice(0, 6);
  if (s.buildings.academy) for (const h of [...roster].sort((a, b) => (a.skillLevel || 0) - (b.skillLevel || 0)).slice(0, 2)) { const c = 80 + (h.skillLevel || 0) * 50; if (s.gold > c + 400) g.learnSkill(h.id); }
  if (s.buildings.enhancement) for (const h of [...roster].filter(h => h.equipment?.weapon).sort((a, b) => (a.weaponLevel || 0) - (b.weaponLevel || 0)).slice(0, 2)) { const c = 60 + (h.weaponLevel || 0) * 30; if (s.gold > c + 400) g.enhance(h.id); }
}

let t = 0, nextPolicy = 0, lastDay = 1;
const ARENA_TRACE = process.argv.includes('--arena-trace'); let arenaRun = null;   // --arena-trace: print each arena fight (wins before, result, fight seconds, lowest party HP%)
const t0 = Date.now();
const snap = () => {
  const lv = s.hunters.map(h => h.level).sort((a, b) => a - b);
  return {
    day: s.day, gold: Math.round(s.gold), wood: s.wood, ore: s.ore, herb: s.herb, cloth: s.cloth, flour: s.flour, leather: s.leather, gems: s.gems,
    hunters: s.hunters.length, cap: s.capacity, lvMin: lv[0], lvMed: lv[lv.length >> 1], lvMax: lv[lv.length - 1],
    hGold: Math.round(s.hunters.reduce((n, h) => n + h.gold, 0) / Math.max(1, s.hunters.length)),
    deaths, kills: s.totalKills, boss: s.bossKills, quest: s.quest.index + 1, questDone: !!s.quest.complete,
    gearInc: s.counts.gearIncome || 0, forge: s.buildings.forge, floor: s.dungeon.bestFloor, stocks: { ...s.stocks }, b: Object.values(s.buildings).reduce((n, v) => n + v, 0),
    mood: Math.round(s.hunters.reduce((n, h) => n + (h.mood ?? 0), 0) / Math.max(1, s.hunters.length)),
    sat: Math.round(s.hunters.reduce((n, h) => n + (h.satiety ?? 0), 0) / Math.max(1, s.hunters.length)),
    sta: Math.round(s.hunters.reduce((n, h) => n + (h.stamina ?? 0), 0) / Math.max(1, s.hunters.length)),
  };
};
rows.push(snap());
while (s.day <= DAYS) {
  if (t >= nextPolicy) { policy(); nextPolicy += POLICY_EVERY; }
  g.tick(1); t += 1;
  const deadNow = new Set(s.hunters.filter(h => h.hp <= 0 && h.task !== 'arena').map(h => h.id));   // 競技場是模擬戰:打倒會在賽後回到 35% 生命,不算死亡(遊戲的 counts.deaths 也不算)
  for (const id of deadNow) if (!lastDead.has(id)) {
    deaths++; const h = s.hunters.find(x => x.id === id), p = prevOf.get(id) || {};   // p = what the hunter was doing one second before dying
    const key = `${p.task || 'field'}:${p.region || '-'}:lv${Math.min(30, Math.floor((p.level ?? h.level) / 5) * 5)}+`;
    deathWhere[key] = (deathWhere[key] || 0) + 1;
    deathLog.push(`d${s.day} ${h.name} ${h.classId} lv${p.level ?? h.level} ${p.auto ? 'auto' : 'ordered'}:${p.region || '-'} status=${p.status || '?'} gear=${Object.values(h.equipment || {}).filter(Boolean).length}/7`);
  }
  lastDead = deadNow;
  if (ARENA_TRACE) { const A = s.arena; if (A.active && A.phase === '對戰中') { arenaRun ??= { w: A.wins, t: 0, min: 1, p: (() => { const P = s.hunters.filter(h => A.hunterIds.includes(h.id)); return ' dps ' + Math.round(P.reduce((n, h) => n + h.attack / ((h.classId === 'sorcerer' ? 1.6 : h.classId === 'priest' ? 1.4 : 1.1) * (h.trait === 'swift' ? 0.9 : 1)), 0)) + ' hp ' + P.map(h => h.maxHp).join('/') + ' def ' + P.map(h => h.defense).join('/') + ' foe ' + A.enemyMaxHp; })() }; arenaRun.t++; for (const h of s.hunters.filter(h => A.hunterIds.includes(h.id))) arenaRun.min = Math.min(arenaRun.min, h.hp / h.maxHp); } else if (arenaRun && !A.active) { console.log('arena d' + s.day + ' w' + arenaRun.w + ' ' + A.phase + ' t' + arenaRun.t + 's minHp ' + Math.round(arenaRun.min * 100) + '% lv ' + s.hunters.filter(h => A.hunterIds.includes(h.id)).map(h => h.level).join('/') + arenaRun.p); arenaRun = null; } }
  for (const h of s.hunters) if (h.hp > 0) prevOf.set(h.id, { task: h.task, region: h.huntRegion, level: h.level, auto: h.autoHunt, status: h.status });
  if (s.day !== lastDay) { lastDay = s.day; rows.push(snap()); }
}
const fmt = r => `d${String(r.day).padStart(2)} gold ${String(r.gold).padStart(6)} w${r.wood} o${r.ore} h${r.herb} c${r.cloth} f${r.flour} l${r.leather} gem${r.gems} | H ${r.hunters}/${r.cap} lv ${r.lvMin}/${r.lvMed}/${r.lvMax} hg${r.hGold} | sat${r.sat} sta${r.sta} mood${r.mood} | dead ${r.deaths} kills ${r.kills} boss ${r.boss} | forge${r.forge} gi${r.gearInc} | Q${r.quest}${r.questDone ? '✓' : ''} floor ${r.floor} bLv ${r.b} | stk ${Object.values(r.stocks).join('/')}`;
const writeSave = () => { if (saveOut) { const d = g.serialize(); d.paused = true; d.savedAt = Date.now(); writeFileSync(saveOut, JSON.stringify(d)); } };
if (SUMMARY) {
  writeSave();
  const r = rows.at(-1), dayOf = q => rows.find(x => x.quest >= q)?.day ?? '-';
  console.log(`seed ${SEED ?? 'default'} | d${r.day} gold ${r.gold} gems ${s.gems} promo ${s.counts.promoted || 0} gemBuy ${s.counts.gemsBought || 0} rar ${['normal','rare','superior','heroic','legendary'].map(k => s.hunters.filter(h => h.rarity === k).length).join('/')} wood ${r.wood} ore ${r.ore} | lv ${r.lvMin}/${r.lvMed}/${r.lvMax} hg ${r.hGold} | dead ${r.deaths} | Q${r.quest} (Q8@d${dayOf(8)} Q12@d${dayOf(12)} Q16@d${dayOf(16)}) done[${Object.entries(claimDay).filter(([c]) => c >= 15).map(([c, d]) => `${c}@${d}`).join(' ')}] floor ${r.floor} bLv ${r.b} | store ${(()=>{const by={};for(const it of s.gearStorage||[]){const k=EQUIPMENT[it.itemId]?.tier||"?";by[k]=(by[k]||0)+1;}return (s.gearStorage||[]).length+" "+JSON.stringify(by);})()} | rebirths ${s.counts.rebirths || 0} diff ${DIFFICULTIES[s.difficulty]?.name} | arena ${s.arena?.wins || 0}W/${s.arena?.losses || 0}L | merchant ${s.counts.merchantBuys || 0} svc ${s.counts.serviceIncome} gear ${s.counts.gearIncome ?? '-'} up ${s.counts.gearUpgrades ?? '-'} forge ${s.buildings.forge}`);
  process.exit(0);
}
for (const r of rows) console.log(fmt(r));
console.log('deaths by task:region:level:', JSON.stringify(deathWhere));
for (const l of deathLog) console.log('  death ' + l);
console.log('codex (kills by type):', JSON.stringify(s.codex));
console.log('counts:', JSON.stringify(s.counts));
console.log(`\nsim ${DAYS} days in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log('events (first 80):'); for (const e of events.slice(0, 80)) console.log('  ' + e);
writeSave();
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ rows, events }, null, 1));
