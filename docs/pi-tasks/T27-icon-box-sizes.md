# T27: icon boxes 16/24/32 only ([data-icon])

Status: done
Tier: pi
Context: `docs/ARCHITECTURE.md` (file map). Follow-up to T25 (`output/pi-results/T25.md` Problem 1): live icons are `[data-icon]` boxes with a background image; `[data-icon] canvas` is hidden, so T25's canvas edits had no visible effect. Read only the files listed; do not explore the repo.

> Task card for pi. Do the steps in order and do not widen the scope. Run every command in the foreground. When finished, write the result to `output/pi-results/T27.md` in English.
> The dispatcher is the only one that edits `Status:`. Never edit this card; all output goes to the result file.

## Goal
Every visible `[data-icon]` box renders at 16, 24 or 32 px (32x32 source art at 0.5x / 0.75x / 1x), so icons are never resampled by odd factors. Before/after screenshots for review.

## Files you may change
- `src/pixel-style.css`, `output/ui-audit/T27-*`

## Steps
1. Reuse `output/ui-audit/T25-shots.mjs` to take before shots (`T27-before-*`), desktop 1440x900 + phone 402x712: village, hunters, trade, craft, worldmap, recruit.
2. With the server running, measure in the browser every visible `[data-icon]` element: rendered width/height and the CSS rule that sets it. Save the list to `output/ui-audit/T27-icon-sizes.md`.
3. Snap each size rule: <=18 -> 16, 19-27 -> 24, 28-36 -> 32. Leave boxes > 36 px (large emblems such as `.region-emblem` 46, `.difficulty-card i [data-icon]` 40) as they are and list them. Keep `background-size` consistent with the box (if a rule sets background-size, set it to the box size).
4. Remove the now-dead canvas size edits that T25 added ONLY if they are inside rules whose canvas is hidden by `[data-icon] canvas{display:none!important}`; otherwise leave them.
5. After shots (`T27-after-*`) and `output/ui-audit/T27-compare.png` with `T25-compare.mjs`.
6. `npm run verify`; small-text for iphone-402x712, iphone-land-812x360, android-360x640 (0 each); `node pipeline/scripts/ui-audit/layout.mjs` 0 FIX on all devices.

## Acceptance (all must pass)
- verify 全部通過; small-text 0 on 3 phones; layout 0 FIX.
- Re-measure: every visible `[data-icon]` <= 36 px is 16, 24 or 32 (print the histogram).

## Report (write to output/pi-results/T27.md, at most 15 lines)
- Verdict on line 1: `DONE` / `BLOCKED` / `FAILED`
- Size histogram before -> after; boxes left unchanged and why
- First line of `output/ui-audit/verify-summary.md`
- Problems hit, or "none"

## Do not
- Edit `src/pixel-ui.js`, `src/pixel-game.js`, `src/pixel-world.js`.
- Commit or push.
- Keep going after the same check fails twice: stop and report.
