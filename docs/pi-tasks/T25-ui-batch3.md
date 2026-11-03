# T25: UI batch 3: integer icon sizes + text colour tokens + stale-by-colour

Status: done
Tier: pi
Context: `docs/ARCHITECTURE.md` (file map) and `docs/TMW-STUDY-SYNTHESIS.md` (why). Source: `output/tmw-ui-study.md` items 7, 10, 12. Read only the files listed; do not explore the repo.

> Task card for pi. Do the steps in order and do not widen the scope. Run every command in the foreground. When finished, write the result to `output/pi-results/T25.md` in English.
> The dispatcher is the only one that edits `Status:`. Never edit this card; all output goes to the result file.

## Goal
Icon canvases use 16/24/32 px only; body text greys use tokens; the old notice line is dimmed by colour, not opacity. Before/after screenshots for human review.

## Files you may change
- `src/pixel-style.css`, `output/ui-audit/T25-*`

## Steps
1. Before any edit: start the server, screenshot desktop 1440x900 and phone 402x712 of village, hunters, trade, craft into `output/ui-audit/T25-before-*.png` (reuse the launch code of `small-text.mjs`).
2. Grep icon `canvas{` width/height rules in CSS; snap each size: <=18 -> 16, 19-27 -> 24, >=28 -> 32 (keep any already 16/24/32). Do not touch canvas sizes set from JS.
3. Add `--text-dim:#d2c2a2;--text-mute:#aebe96` (keep existing `--text`); replace body-text hexes `#c8cfb0 #c8d4ab #cbd4b7 #c3c8a7 #bacaad #c1c8aa` with `var(--text-dim)` and `#aebe96` with `var(--text-mute)`. Leave `#e8d3ad` alone.
4. `.notice-feed div:first-child`: replace `opacity:.7` with `color:var(--text-mute)`.
5. Same screenshots into `T25-after-*.png`, plus `output/ui-audit/T25-compare.png` (before | after side by side per screen).
6. `npm run verify`, small-text phone checks, layout.mjs 0 FIX.

## Acceptance
- verify 全部通過; `node pipeline/scripts/ui-audit/small-text.mjs <device>` for iphone-402x712, iphone-land-812x360, android-360x640 (needs `node server.mjs` running in the background; stop it afterwards) each report 0 elements; layout 0 FIX; compare png exists.

## Report (write to output/pi-results/T25.md, at most 15 lines)
- Verdict on line 1: `DONE` / `BLOCKED` / `FAILED`
- Files changed (names only)
- Icon sizes changed (from->to counts)
- First line of `output/ui-audit/verify-summary.md` if you ran verify
- Problems hit, or "none"

## Do not
- Commit or push.
- Touch hunter AI, combat, save code in `src/pixel-game.js`, or drawing logic in `src/pixel-world.js`.
- Spend PixelLab credits.
- Keep going after the same check fails twice: stop, write the error summary, hand back.
