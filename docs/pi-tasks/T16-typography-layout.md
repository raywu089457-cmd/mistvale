# T16: typography + spacing pass on src/pixel-style.css (CSS only)

Status: failed
Tier: pi
Context: `docs/ARCHITECTURE.md`. T15 already replaced hard-coded font families with `--font-ui` / `--font-num` and raised everything to >= 10px. This card fixes the remaining typography/spacing defects. CSS only: do not touch JS or HTML.

> Task card for pi. Work through the list in order. After EACH numbered change run `node -e "1"`-free checks listed; stop and report after two failures of the same check.

## Goal
The desktop UI reads as one system: one type scale, one line-height rhythm, no 10px body text in modals, and consistent padding between the banner, toolbar and list rows.

## Files you may change
- `src/pixel-style.css` only.
- `output/pi-results/T16.md`

## Steps
1. **Add the type scale tokens** at the end of line 1 (the `:root{...}` block), before the closing `}`:
   `--fs-body:12px;--fs-small:11px;--fs-tiny:10px;--fs-h3:13px;--fs-h2:15px;--fs-title:18px;--lh-body:1.6;--lh-tight:1.35;`
2. **Body text in modals: no 10px.** Every rule whose selector list includes any of `.modal-intro`, `.modal-note`, `.quest-list-row p`, `.help-card p`, `.craft-card p`, `.difficulty-card small`, `.region-card small` must end up at `font-size:var(--fs-small)` or larger (11px). Do it by editing those rules, not by adding a new override block, where the rule already sets `font-size:10px`.
3. **Line-height rhythm.** In those same body-text rules use `line-height:var(--lh-body)`. Headings (`h1`–`h4`, `.modal-title`, `h3` inside cards) use `line-height:var(--lh-tight)`.
4. **Spacing between banner and content.** The rule `.encounter-banner` (and the `.encounter-banner.mb.*` block appended in 2026-11-01) must have `margin-bottom:14px`. The rule `.modal-toolbar` must have `margin-bottom:12px` if it does not already have a margin.
5. **List rhythm.** `.quest-list-row` padding stays 14px but gets `margin-bottom:10px` (from 12px). `.hunter-card` and `.building-card` get `padding:10px` if unset.
6. **Slider hit target** (the only layout `FIX` left, on all three devices): change `.ui-scale input[type=range]{width:150px;...}` so the control is at least 24px tall: add `height:24px` and `.ui-scale{padding:2px 0}`. The phone override keeps `width:120px`.
7. Run `npm run build`, then `npm run verify:quick` in the foreground (about 2 min). First line must say 全部通過.
8. Run `node pipeline/scripts/ui-audit/layout.mjs` and confirm `FIX`/`READ` counts are 0 on all three devices (it prints per device).
9. Run `node pipeline/scripts/ui-audit/shots-all.mjs desktop` and `... phone`.
10. Sanity check: `grep -c "font-size:10px" src/pixel-style.css` must be lower than the starting value (50); report both numbers.

## Acceptance
- `verify:quick` first line 全部通過.
- Layout checker: 0 `FIX` and 0 `READ` on android-360x640, iphone-402x712, desktop-1440x900.
- `font-size:10px` count reduced; no body-text rule in the list from step 2 left at 10px.
- `git diff --stat src` shows only `src/pixel-style.css`.

## Report (output/pi-results/T16.md, at most 15 lines)
- Verdict on line 1: `DONE` / `BLOCKED` / `FAILED`
- `font-size:10px` before/after counts
- Layout checker lines for the three devices
- First line of verify-summary
- Problems hit, or "none"

## Do not
- Touch any `.js`, `.html`, or `server.mjs`. Do not commit or push. Do not create new task cards.
- Retry a failing check more than once; report instead.
