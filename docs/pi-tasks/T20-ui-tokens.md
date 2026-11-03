# T20: UI tokens batch 1 (no pixel moves) + boss label 11px

Status: done
Tier: pi
Context: `docs/ARCHITECTURE.md` (file map) and `docs/TMW-STUDY-SYNTHESIS.md` (why). Source of the proposals: `output/tmw-ui-study.md` section "Proposed changes" items 1, 5, 6, 8. Read only the files listed; do not explore the repo.

> Task card for pi. Do the steps in order and do not widen the scope. Run every command in the foreground. When finished, write the result to `output/pi-results/T20.md` in English.
> The dispatcher is the only one that edits `Status:`. Never edit this card; all output goes to the result file.

## Goal
Add size, line-height, bar and rarity tokens to `src/pixel-style.css` without changing what renders, unify 9-slice slice numbers, and raise the one desktop label still at 10px.

## Files you may change
- `src/pixel-style.css`

## Steps
1. In the first `:root` add `--fs-tiny:10px;--fs-small:11px;--fs-body:12px;--fs-h3:13px;--fs-h2:15px;--fs-title:18px;--lh-body:1.6;--lh-tight:1.35`.
2. Add bar tokens with the CURRENT colours (`--bar-hp:#b85149;--bar-sat:#cba049;--bar-mp:#5b95af;--bar-mood:#af79b4;--bar-exp-a:#a9d178;--bar-exp-b:#6d9445`) and replace those literal hexes in the `.progress` / `.need-row` rules with `var(...)`. Same colours, nothing changes visually.
3. `.rarity` reads `--rarity` which is never defined. Grep `data-rarity` in `src/pixel-ui.js` (read only) to learn the values, then define one colour token per rarity in `:root` and add `[data-rarity="x"]{--rarity:var(--c-x)}` rules. Use colours already used for that rarity elsewhere in the CSS (grep); if none, keep the current fallback `#d6cda8` for all and say so.
4. Unify 9-slice numbers: every `border-image` using `var(--ui-panel)` uses slice 15; `.pixel-button` uses 12. Delete exact duplicate re-declarations only.
5. The boss button label (the `b` inside the bottom-bar boss button, text 召喚首領) is 10px on desktop 1440x900: set it to `var(--fs-small)` for desktop only. Leave `#bottom-bar kbd` at 10px.
6. `npm run verify`, then the small-text checks.

## Acceptance (all must pass)
- verify-summary first line says 全部通過.
- `node pipeline/scripts/ui-audit/small-text.mjs <device>` for iphone-402x712, iphone-land-812x360, android-360x640 (needs `node server.mjs` running in the background; stop it afterwards) each report 0 elements.
- `grep -c -- "--fs-" src/pixel-style.css` >= 6.

## Report (write to output/pi-results/T20.md, at most 15 lines)
- Verdict on line 1: `DONE` / `BLOCKED` / `FAILED`
- Files changed (names only)
- Rarity colours chosen (one line)
- First line of `output/ui-audit/verify-summary.md` if you ran verify
- Problems hit, or "none"

## Do not
- Commit or push.
- Touch hunter AI, combat, save code in `src/pixel-game.js`, or drawing logic in `src/pixel-world.js`.
- Spend PixelLab credits.
- Keep going after the same check fails twice: stop, write the error summary, hand back.
