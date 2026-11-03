// dungeon-balance-opus.mjs — headless auto-continue dungeon runs: team level → best floor, gold/min.
// Usage: node tools/dungeon-balance-opus.mjs [level ...]   (default 5 15 30 50 75 100)
import fs from 'node:fs';
import { createGame } from '../src/pixel-game.js';

const levels = process.argv.slice(2).map(Number).filter(Boolean);
const LEVELS = levels.length ? levels : [5, 15, 30, 50, 75, 100], MAX_SEC = 3600;

function run(level) {
  const base = createGame(); base.construct('dungeon');
  const raw = base.serialize(), keep = ['paladin', 'archer', 'priest'];
  raw.hunters = raw.hunters.filter(h => keep.includes(h.classId)); raw.hunters.forEach(h => { h.level = level; h.xp = 0; });
  const g = createGame(raw), s = g.state;
  for (const h of s.hunters) { h.hp = h.maxHp; h.satiety = h.mood = h.stamina = 100; }
  g.setDungeonAuto(true);
  const ok = g.startDungeon(s.hunters.map(h => h.id), 1).ok; if (!ok) throw new Error('startDungeon failed');
  const money = () => s.gold + s.hunters.reduce((n, h) => n + h.gold, 0), m0 = money();
  let t = 0;
  while (t < MAX_SEC && s.dungeon.active) { s.enemies = []; s.spawnTimer = 0; g.tick(0.1); t += 0.1; }
  return { level, best: s.dungeon.bestFloor, gpm: Math.round((money() - m0) / (t / 60)), min: +(t / 60).toFixed(1) };
}

const rows = LEVELS.map(run);
const md = ['| level | best floor | gold/min | sim minutes |', '| --- | --- | --- | --- |', ...rows.map(r => `| ${r.level} | ${r.best} | ${r.gpm} | ${r.min} |`)].join('\n');
console.log(md); fs.mkdirSync('output', { recursive: true }); fs.writeFileSync('output/dungeon-balance-opus.md', md + '\n');
