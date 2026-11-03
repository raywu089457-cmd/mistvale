# T19: live text-size census (phone + desktop), data only

Status: done
Tier: pi
Context: `docs/ARCHITECTURE.md` (file map). Do not read `src/` beyond what a step names. Data-collection card: run checkers, write numbers. Change no source file.

> Task card for pi. Do the steps in order and do not widen the scope. Run every command in the foreground. When finished, write the result to `output/pi-results/T19.md` in English.
> The dispatcher is the only one that edits `Status:`. Never edit this card; all output goes to the result file.

## Goal
Measured (browser, not static-cascade) facts about small text, to settle a conflict: report `output/tmw-ui-study.md` says 97 selectors are 10px on phones by static cascade, while earlier cards say the layout checker's phone READ (text < 11px) is 0. Produce `output/text-size-census.md` with the real numbers.

## Files you may change
- `output/text-size-census.md` (create)
- `output/pi-results/T19.md` (create)
- Files the checkers themselves write under `output/ui-audit/`

## Steps
1. `npm run verify` (full; 5–12 min). Record the first line of `output/ui-audit/verify-summary.md` and every line that mentions FIX or READ.
2. Start the server in the background for step 3 only: the checkers use `http://100.79.149.0:5024`. If `npm run verify` already left one running, reuse it; otherwise start `node server.mjs` as a background process and stop it at the end.
3. Run, one at a time:
   - `node pipeline/scripts/ui-audit/small-text.mjs iphone-402x712`
   - `node pipeline/scripts/ui-audit/small-text.mjs iphone-land-812x360`
   - `node pipeline/scripts/ui-audit/small-text.mjs android-360x640`
   Save each full output to `output/ui-audit/small-text-<device>.txt`.
4. Desktop: run a playwright one-off (same launch options as `small-text.mjs`, viewport 1440×900, deviceScaleFactor 1, not mobile) on the village screen + settings modal, listing every visible own-text element with computed font-size < 11px, grouped by selector (class list) with counts. Put the script in `output/text-size-desktop.mjs`.
5. Write `output/text-size-census.md` with sections `## Verify`, `## Phone (per device)`, `## Desktop 1440x900`, `## Conflict resolved`. In `Conflict resolved` say in 2–4 lines whether the static count (97 phone selectors at 10px) matches the live result, and why not if it does not (e.g. `--ui-scale`, later overrides, elements not shown).

## Acceptance (all must pass)
- `output/text-size-census.md` exists and contains the 4 section headings.
- The three `output/ui-audit/small-text-*.txt` files exist and are non-empty.
- `git status --short -- src assets sprites` unchanged by you.

## Report (write to output/pi-results/T19.md, at most 15 lines)
- Verdict on line 1: `DONE` / `BLOCKED` / `FAILED`
- Verify first line; phone READ counts per device; desktop count of <11px elements
- The `Conflict resolved` lines
- Problems hit, or "none"

## Do not
- Edit any file under `src/`, `assets/`, `sprites/`, `tools/`, `pipeline/`.
- Leave a server process running.
- Commit or push.
- Keep going after the same check fails twice: stop and report.
