#!/usr/bin/env node
// T07: headless dungeon balance tool.
// Simulates an auto-continue dungeon run (paladin + archer + priest, floor 1 → up to 3600 sim seconds)
// for a set of team levels and prints `level → best floor, gold/min`.
// Reference numbers (docs/HANDOFF-2026-10-30.md, "地下城平衡實測"):
//   Lv5→8, Lv15→13, Lv30→15, Lv50→18, Lv75→21, Lv100→22
//
// IMPORTANT: `level` is the STARTING team level. Cleared floors grant XP (pixel-game.js
// floorCleared → gainXp), so a real run levels the party up hard (a Lv5 party ends around Lv28).
// The table reports the ending levels so the drift is visible. Use --pin for a controlled
// run where the party is held at the given level (its stats are re-derived through the game's
// own save/load path, never by re-implementing the formulas here).
//
// Usage:
//   node tools/dungeon-balance.mjs              # all six levels, real gameplay (levels grow)
//   node tools/dungeon-balance.mjs 15 50        # only the listed levels
//   node tools/dungeon-balance.mjs --pin        # hold the team level fixed for the whole run
//
// Nothing under src/ is touched; this only drives the public game API.

import { createGame } from '../src/pixel-game.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LEVELS = [5, 15, 30, 50, 75, 100];
const PARTY = ['paladin', 'archer', 'priest'];
const MAX_SECONDS = 3600;
const STEP = 0.1;
const REFERENCE = { 5: 8, 15: 13, 30: 15, 50: 18, 75: 21, 100: 22 };

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');

function totalGold(game) {
  return game.state.gold + game.state.hunters.reduce((sum, h) => sum + h.gold, 0);
}

// Party stats come from the game itself: write the level into a snapshot and reload through
// createGame(), whose load path calls updateStats() and recomputes maxHp/attack/defense.
function snapshotAtLevel(level) {
  const snapshot = createGame().serialize();
  for (const h of snapshot.hunters) if (PARTY.includes(h.classId)) h.level = level;
  return snapshot;
}

function buildGame(snapshot) {
  const game = createGame(snapshot);
  const built = game.construct('dungeon');
  if (!built.ok) throw new Error(`construct('dungeon') failed: ${built.message}`);
  const party = PARTY.map(c => game.state.hunters.find(h => h.classId === c));
  if (party.some(h => !h)) throw new Error('missing party member');
  for (const h of party) { h.hp = h.maxHp; h.satiety = h.mood = h.stamina = 100; h.task = null; h.route = []; }
  return { game, party };
}

function runLevel(level, pin) {
  const snapshot = snapshotAtLevel(level);
  const { game, party } = buildGame(snapshot);
  // Pinned stats: taken from the freshly loaded party at the target level (no duplicated formulas).
  const pinned = pin ? party.map(h => ({ maxHp: h.maxHp, attack: h.attack, defense: h.defense })) : null;
  game.setDungeonAuto(true);
  const gold0 = totalGold(game);
  const t0 = game.state.time;
  const start = game.startDungeon(party.map(h => h.id));
  if (!start.ok) throw new Error(`startDungeon failed at Lv${level}: ${start.message}`);

  while (game.state.dungeon.active && game.state.time - t0 < MAX_SECONDS) {
    game.tick(STEP);
    if (pinned) {
      // Undo dungeon XP and restore the target-level stats, keeping the current HP ratio.
      party.forEach((h, i) => {
        if (h.level === level && h.xp === 0) return;
        const ratio = h.maxHp > 0 ? h.hp / h.maxHp : 1;
        h.level = level; h.xp = 0; Object.assign(h, pinned[i]);
        h.hp = Math.round(h.maxHp * Math.min(1, Math.max(0, ratio)));
      });
    }
  }

  const seconds = game.state.time - t0;
  const minutes = seconds / 60;
  const gold = totalGold(game) - gold0;
  return {
    level,
    bestFloor: game.state.dungeon.bestFloor,
    goldPerMin: minutes > 0 ? Math.round(gold / minutes) : 0,
    minutes,
    ended: !game.state.dungeon.active,
    endLevels: party.map(h => h.level),
  };
}

function table(rows) {
  const lines = [
    '| level | best floor | gold/min | sim minutes |',
    '| --- | --- | --- | --- |',
    ...rows.map(r => `| ${r.level} | ${r.bestFloor} | ${r.goldPerMin} | ${r.minutes.toFixed(1)} |`),
  ];
  return lines.join('\n');
}

const argv = process.argv.slice(2);
const pin = argv.includes('--pin');
const args = argv.filter(a => a !== '--pin').map(Number).filter(n => Number.isFinite(n) && n >= 1 && n <= 100);
const levels = args.length ? [...new Set(args)] : LEVELS;

const rows = [];
for (const level of levels) {
  const row = runLevel(level, pin);
  rows.push(row);
  const ref = REFERENCE[level];
  const delta = ref === undefined ? '' : ` (reference ${ref}${Math.abs(row.bestFloor - ref) <= 3 ? ', ok' : ', OFF'})`;
  const drift = pin ? `; level pinned at ${level}` : `; party ${level} → ${[...new Set(row.endLevels)].join('/')}`;
  console.error(`Lv${level}: best floor ${row.bestFloor}${delta}, ${row.goldPerMin} gold/min, ${row.minutes.toFixed(1)} min, ${row.ended ? 'run ended' : 'time limit'}${drift}`);
}

const md = table(rows) + '\n';
console.log(md);

const driftLine = pin
  ? 'Team level is pinned for the whole run (dungeon XP is rolled back each tick).'
  : `Team level is the STARTING level; cleared floors grant XP, so the party ends at ${rows.map(r => `Lv${r.level}→${[...new Set(r.endLevels)].join('/')}`).join(', ')}.`;
const out = resolve(repo, 'output/dungeon-balance.md');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `# Dungeon balance${pin ? ' (pinned level)' : ''}\n\n${md}\n${driftLine}\n`);
console.error(`wrote ${out}`);
