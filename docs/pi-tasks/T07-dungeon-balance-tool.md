# T07: repeatable dungeon balance tool (no game code changes)

Status: done
Tier: pi
Context: `docs/ARCHITECTURE.md` (file map). Read only the files listed below; do not explore the repo.

> Task card for pi. Phase 1 of 3 (T07 tool, then Claude tunes numbers, then T08 re-measures). Do not widen the scope.

## Goal
A standalone script `tools/dungeon-balance.mjs` that simulates auto-continue dungeon runs headlessly and prints a table: team level → best floor reached, gold per minute. The same table was measured by hand on 2026-10-30 (see `docs/HANDOFF-2026-10-30.md`, section "地下城平衡實測"); the tool must reproduce it roughly (best floor within ±3 of: Lv5→8, Lv15→13, Lv30→15, Lv50→18, Lv75→21, Lv100→22).

## Files you may change
- `tools/dungeon-balance.mjs` (new). Nothing else. Do not edit anything under `src/`.

## Steps
1. Read the handoff section named above, and the dungeon tests in `test-pixel-game.mjs` (search for `construct('dungeon')`, `setDungeonAuto`, `startDungeon`). They show how to build a game, build the dungeon, start a run, and tick it (`game.tick(0.1)`).
2. Party = one paladin + one archer + one priest (class ids are in `CLASSES` in `src/pixel-data.js`). Find how a hunter gets a given level (search `gainXp`, `level` in `src/pixel-game.js`; set level through the same path tests use, or set fields the game recomputes stats from). Keep the party alive and at full HP at the start of each run.
3. For each level in `5 15 30 50 75 100`: new game, build dungeon, enable auto-continue, start from floor 1, tick up to 3600 simulated seconds, stop early if the run ends. Record best floor (`state.dungeon.bestFloor`) and gold per minute (village gold gain + hunter gold gain, divided by minutes simulated).
4. Print a markdown table (`| level | best floor | gold/min | sim minutes |`) and also write it to `output/dungeon-balance.md`.
5. Allow `node tools/dungeon-balance.mjs 15 50` to run only the listed levels.
6. Run it for all six levels in the foreground. Run `npm test` once (all suites must still pass; you changed no game code, so a failure means a flake: re-run once).

## Acceptance
- `node tools/dungeon-balance.mjs` prints a 6-row table and finishes in under 10 minutes.
- Best floors are within ±3 of the reference numbers above. If not, do not tune; write the numbers you got and the likely reason in the result.
- `git status` shows only `tools/dungeon-balance.mjs` as your change (plus `output/` files, which are ignored).

## Report (write to output/pi-results/T07.md, at most 15 lines)
- Verdict on line 1: `DONE` / `BLOCKED` / `FAILED`
- The 6-row table
- How you set the hunter level (one line)
- Problems hit, or "none"

## Do not
- Edit anything under `src/`, commit, push, or spend PixelLab credits.
- Keep going after the same error appears twice: stop and report.
