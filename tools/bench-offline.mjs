#!/usr/bin/env node
// Mistvale offline-progression benchmark harness.
//
// Measures the cost of the offline simulation (`game.simulate(seconds)`, 0.1 s steps)
// and the accuracy of the linear extrapolation in `offlineFinish()` for shorter samples.
//
// Usage:
//   node tools/bench-offline.mjs                 # timing table (default)
//   node tools/bench-offline.mjs --json          # timing, machine-readable JSON only
//   node tools/bench-offline.mjs --accuracy      # sample-length accuracy study (slow: ~2 min)
//   node tools/bench-offline.mjs --accuracy --json
//   node tools/bench-offline.mjs --total 3600 --samples 30,60,90,120,180
//
// Scenario is fixed so numbers stay comparable with the baseline the Lead measured:
//   fresh createGame() (seed 918273, deterministic) → every hunter huntRegion='meadow'
//   → 20 s warmup in 0.1 s ticks → time game.simulate(sec) on a fresh instance per length.
// The game RNG is deterministic (state.seed), so the same scenario always produces the
// same kills/gold — `digest` is a sha1 of the serialized state for patch-to-patch checks.
//
// Accuracy study: from one save (fresh game + 20 s warmup, serialized), compare
// offlineSnapshot()+simulate(S)+offlineFinish(snap, total) against a real, full
// simulate(total) on a separate instance. S ∈ {30,60,90,120,180} s by default, total = 3600 s.
//
// No dependencies; plain ESM; writes nothing.

import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// --module <path>: benchmark another copy of pixel-game.js (e.g. `git show HEAD:src/pixel-game.js`
// into a scratch tree) so pre-patch and post-patch numbers can be measured with the same harness.
const argv = process.argv.slice(2);
const optRaw = (name, fallback) => {
  const i = argv.indexOf(name);
  if (i < 0) return fallback;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? v : fallback;
};
const moduleArg = optRaw('--module', '');
const { createGame, OFFLINE } = await import(moduleArg
  ? pathToFileURL(path.resolve(moduleArg)).href
  : new URL('../src/pixel-game.js', import.meta.url).href);

const RESOURCE_KEYS = ['gold', 'wood', 'ore', 'herb', 'cloth', 'flour', 'leather', 'gems'];
const DEFAULT_LENGTHS = [10, 30, 60, 120, 300, 600];
const DEFAULT_SAMPLES = [30, 60, 90, 120, 180];
const WARMUP_SECONDS = 20;
const TICK = 0.1;

const has = name => argv.includes(name);
const opt = optRaw;

function prepare(saved = null) {
  const game = createGame(saved);
  game.state.paused = false;
  // Fresh game: send every hunter to the meadow (same scenario as the Lead's baseline).
  if (!saved) for (const h of game.state.hunters) h.huntRegion = 'meadow';
  // Warm up so hunters have left the village and monsters are engaged.
  for (let t = 0; t < WARMUP_SECONDS - 1e-9; t += TICK) game.tick(TICK);
  return game;
}

const digest = game => createHash('sha1').update(JSON.stringify(game.serialize())).digest('hex').slice(0, 16);
const msPerStep = (ms, seconds) => ms / (seconds / TICK);

function runTiming(lengths, repeat) {
  // JIT warm-up: one throwaway scenario, so the first timed length does not pay V8 tier-up
  // costs that the real game pays only once per page load. Every timed run below starts from
  // a brand-new instance prepared exactly like the Lead's baseline.
  prepare().simulate(30);
  const rows = [];
  for (const seconds of lengths) {
    const runs = [];
    for (let r = 0; r < repeat; r++) {
      const game = prepare();
      const kills0 = game.state.totalKills, gold0 = game.state.gold;
      const t0 = performance.now();
      game.simulate(seconds);
      const ms = performance.now() - t0;
      runs.push({ ms: +ms.toFixed(1), kills: game.state.totalKills - kills0, goldDelta: game.state.gold - gold0, wanderKills: game.state.wanderKills || 0, digest: digest(game) });
    }
    const sorted = runs.map(r => r.ms).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    rows.push({
      seconds, steps: Math.round(seconds / TICK), repeat,
      ms: median, minMs: sorted[0], maxMs: sorted[sorted.length - 1],
      msPerStep: +msPerStep(median, seconds).toFixed(4),
      kills: runs[0].kills, goldDelta: runs[0].goldDelta, wanderKills: runs[0].wanderKills,
      digest: runs[0].digest, runs,
    });
  }
  const from = rows.find(r => r.seconds === 120) || rows[rows.length - 1];
  const estimate8hMs = from.msPerStep * (OFFLINE.max / TICK);
  return { rows, from, estimate8hMs, repeat };
}

function metrics(game) {
  const s = game.state, out = {};
  for (const k of RESOURCE_KEYS) out[k] = s[k];
  out.totalKills = s.totalKills;
  out.wanderKills = s.wanderKills || 0;
  out.levelSum = s.hunters.reduce((n, h) => n + h.level, 0);
  out.maxLevel = s.hunters.reduce((n, h) => Math.max(n, h.level), 0);
  out.dungeonFloor = s.dungeon.bestFloor;
  return out;
}

function accuracy(total, samples) {
  // One shared starting save: fresh scenario right after warmup.
  const seedSave = JSON.parse(JSON.stringify(prepare().serialize()));
  // Reference: a full real simulation of the whole window on a separate instance.
  const ref = createGame(seedSave);
  ref.state.paused = false;
  const t0 = performance.now();
  ref.simulate(total);
  const refMs = performance.now() - t0;
  const refM = metrics(ref);

  const studied = Object.keys(refM).map(k => ({ key: k, ref: refM[k], value: 0, absErr: 0, relErr: 0 }));
  const byKey = Object.fromEntries(studied.map(e => [e.key, e]));
  const runs = [];
  for (const sample of samples) {
    const game = createGame(seedSave);
    game.state.paused = false;
    const snap = game.offlineSnapshot();
    game.simulate(sample);
    game.offlineFinish(snap, total);
    const got = metrics(game);
    const fields = {};
    for (const { key, ref: r } of studied) {
      const v = got[key], absErr = v - r;
      fields[key] = {
        ref: r, value: v, absErr,
        relErr: r === 0 ? (v === 0 ? 0 : null) : Math.abs(absErr / r),
      };
    }
    runs.push({ sample, fields });
  }
  return { total, samples, refMs: +refMs.toFixed(1), ref: refM, runs, note: 'relErr = |extrapolated - real| / |real|; null when the real value is 0' };
}

function pct(v) { return v === null ? 'n/a' : (v * 100).toFixed(2) + '%'; }
function num(v) { return v.toLocaleString('en-US'); }

function printTiming({ rows, from, estimate8hMs, repeat }) {
  console.log('Mistvale — offline simulation benchmark');
  console.log(`module: ${moduleArg || 'src/pixel-game.js'}`);
  console.log(`scenario: createGame() fresh (seed 918273) → hunters huntRegion='meadow' → ${WARMUP_SECONDS} s warmup (0.1 s ticks)`);
  console.log(`node ${process.version} · OFFLINE {max: ${OFFLINE.max}, sample: ${OFFLINE.sample}} · deterministic (state.seed)`);
  console.log(`each row: median of ${repeat} fresh runs (one JIT warm-up run first), min–max in brackets`);
  console.log('');
  console.log('  length(s)   steps   median ms    ms/step    kills   goldΔ  wanderKills  digest');
  for (const r of rows) {
    const range = `[${num(Math.round(r.minMs))}–${num(Math.round(r.maxMs))}]`;
    console.log(`  ${String(r.seconds).padStart(8)}  ${String(r.steps).padStart(7)}  ${String(num(Math.round(r.ms))).padStart(9)} ${range.padStart(12)}  ${String(r.msPerStep).padStart(9)}  ${String(r.kills).padStart(7)}  ${String(r.goldDelta).padStart(7)}  ${String(r.wanderKills).padStart(11)}  ${r.digest}`);
  }
  console.log('');
  const full = estimate8hMs / 1000;
  console.log(`8 h full sim estimate: ${num(Math.round(estimate8hMs))} ms ≈ ${(full / 60).toFixed(1)} min (${num(OFFLINE.max)} s in 0.1 s steps)`);
  console.log(`   → that is why the game only really simulates the first ${OFFLINE.sample} s and extrapolates the rest.`);
  console.log(`   based on simulate(120) median = ${num(Math.round(from.ms))} ms`);
  console.log('digest = sha1(serialize()) after the run; identical digests on different code = identical behaviour for this scenario.');
}

function printAccuracy(a) {
  console.log('Mistvale — offline extrapolation accuracy');
  console.log(`total window: ${a.total} s · starting save: fresh game + ${WARMUP_SECONDS} s warmup · reference: full real simulate(${a.total}) = ${num(Math.round(a.refMs))} ms`);
  console.log('extrapolated = offlineSnapshot() → simulate(sample) → offlineFinish(snap, total)');
  console.log('');
  const keys = Object.keys(a.ref);
  const head = `  sample   ${keys.map(k => k.padStart(11)).join('')}`;
  console.log('relative error (|extrapolated − real| / |real|):');
  console.log(head);
  for (const r of a.runs) {
    console.log(`  ${String(r.sample).padStart(6)}s  ${keys.map(k => pct(r.fields[k].relErr).padStart(11)).join('')}`);
  }
  console.log('');
  console.log('absolute values (real vs extrapolated):');
  for (const k of keys) {
    console.log(`  ${k}:`);
    console.log(`    real:      ${a.runs.map(() => num(a.ref[k]).padStart(10)).join('')}`);
    for (const r of a.runs) {
      const f = r.fields[k];
      const shown = `${num(f.value)}${f.absErr !== 0 ? ` (${f.absErr > 0 ? '+' : ''}${num(f.absErr)})` : ''}`;
      console.log(`    ${String(r.sample).padStart(4)}s:      ${shown.padStart(10)}`);
    }
  }
  console.log('');
  console.log('note: ratios use the value after offlineFinish mutates state (what the player keeps).');
}

const lengths = (opt('--lengths', DEFAULT_LENGTHS.join(','))).split(',').map(Number).filter(n => n > 0);
const samples = (opt('--samples', DEFAULT_SAMPLES.join(','))).split(',').map(Number).filter(n => n > 0);
const total = Number(opt('--total', 3600));
const repeat = Math.max(1, Number(opt('--repeat', 3)) || 3);

if (has('--accuracy')) {
  const result = accuracy(total, samples);
  if (has('--json')) console.log(JSON.stringify({ meta: { kind: 'accuracy', warmup: WARMUP_SECONDS, module: moduleArg || 'src/pixel-game.js' }, ...result }, null, 2));
  else printAccuracy(result);
} else {
  const result = runTiming(lengths, repeat);
  if (has('--json')) console.log(JSON.stringify({ meta: { kind: 'timing', warmup: WARMUP_SECONDS, offline: OFFLINE, node: process.version, module: moduleArg || 'src/pixel-game.js', repeat }, ...result }, null, 2));
  else printTiming(result);
}
