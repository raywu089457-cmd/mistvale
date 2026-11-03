# T23: UI batch 2: desktop small text to 11px + bar number outline

Status: done
Tier: pi
Context: `docs/ARCHITECTURE.md` (file map) and `docs/TMW-STUDY-SYNTHESIS.md` (why). Inputs: `output/text-size-census-2.md` (from T22) and `output/tmw-ui-study.md` items 2, 3, 9. Read only the files listed; do not explore the repo.

> Task card for pi. Do the steps in order and do not widen the scope. Run every command in the foreground. When finished, write the result to `output/pi-results/T23.md` in English.
> The dispatcher is the only one that edits `Status:`. Never edit this card; all output goes to the result file.

## Goal
Every desktop body text that T22 measured under 11px (except `#bottom-bar kbd` and decorative symbols) becomes `var(--fs-small)`; progress-bar numbers get a 1px dark outline; the UI-scale slider gets a 24px hit height.

## Files you may change
- `src/pixel-style.css`, `output/ui-audit/T23-*`

## Steps
1. Read `output/text-size-census-2.md`. For each selector group listed (desktop, not kbd, not pseudo-element), set `font-size:var(--fs-small)` inside the existing `@media(min-width:761px) and (min-height:521px)` desktop block (grep "桌機最小 11px").
2. `.progress b`: add `text-shadow:1px 0 #1a0f06,-1px 0 #1a0f06,0 1px #1a0f06,0 -1px #1a0f06`.
3. `.ui-scale input[type=range]`: add `height:24px`.
4. `npm run verify`; rerun T22's script on the same screens; run the small-text phone checks; run `node pipeline/scripts/ui-audit/layout.mjs` (read its usage header) and confirm 0 FIX.
5. Desktop screenshots of the 3 most changed screens into `output/ui-audit/T23-*.png`.

## Acceptance (all must pass)
- verify 全部通過; desktop rerun shows only `kbd` under 11px; `node pipeline/scripts/ui-audit/small-text.mjs <device>` for iphone-402x712, iphone-land-812x360, android-360x640 (needs `node server.mjs` running in the background; stop it afterwards) each report 0 elements; layout 0 FIX.

## Report (write to output/pi-results/T23.md, at most 15 lines)
- Verdict on line 1: `DONE` / `BLOCKED` / `FAILED`
- Files changed (names only)
- Screenshot paths
- First line of `output/ui-audit/verify-summary.md` if you ran verify
- Problems hit, or "none"

## Do not
- Commit or push.
- Touch hunter AI, combat, save code in `src/pixel-game.js`, or drawing logic in `src/pixel-world.js`.
- Spend PixelLab credits.
- Keep going after the same check fails twice: stop, write the error summary, hand back.
