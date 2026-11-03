# T22: Text-size census on remaining desktop screens (data only)

Status: done
Tier: pi
Context: `docs/ARCHITECTURE.md` (file map) and `docs/TMW-STUDY-SYNTHESIS.md` (why). Previous census `output/text-size-census.md` covered only village + settings on desktop. Read only the files listed; do not explore the repo.

> Task card for pi. Do the steps in order and do not widen the scope. Run every command in the foreground. When finished, write the result to `output/pi-results/T22.md` in English.
> The dispatcher is the only one that edits `Status:`. Never edit this card; all output goes to the result file.

## Goal
List every visible text element under 11px at desktop 1440x900 on all other screens, so Claude knows which 10px body texts are real.

## Files you may change
- `output/text-size-desktop.mjs` (extend), `output/text-size-census-2.md` (create), `output/ui-audit/*`

## Steps
1. Start `node server.mjs` in the background (stop it at the end).
2. Extend `output/text-size-desktop.mjs` to take a screen list like `small-text.mjs` does (copy its screen-opening code) and run it for: world map (region cards), hunters, hunter, recruit, visitors, trade, craft, craft:gear, build, inspector, quests/dispatch if they exist. Use screen names `small-text.mjs` / `layout.mjs` understand; list what you could not open.
3. Write `output/text-size-census-2.md`: table screen -> count <11px -> selector groups with sizes and sample text.

## Acceptance
- `output/text-size-census-2.md` exists with one row per screen attempted.
- No file under `src/` changed.

## Report (write to output/pi-results/T22.md, at most 15 lines)
- Verdict on line 1: `DONE` / `BLOCKED` / `FAILED`
- Files changed (names only)
- First line of `output/ui-audit/verify-summary.md` if you ran verify
- Problems hit, or "none"

## Do not
- Commit or push.
- Touch hunter AI, combat, save code in `src/pixel-game.js`, or drawing logic in `src/pixel-world.js`.
- Spend PixelLab credits.
- Keep going after the same check fails twice: stop, write the error summary, hand back.
