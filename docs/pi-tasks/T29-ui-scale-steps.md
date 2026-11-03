# T29: Minecraft-style UI scale setting (Auto + fixed steps, shown as %)

Status: done
Tier: pi
Context: `docs/ARCHITECTURE.md` (file map). Current state: settings has a range slider 80–140% step 5 (`src/pixel-ui.js` ~line 162, handlers ~244 and ~368–371); `uiScale` is sanitised in `src/pixel-game.js` line 87 (`DEFAULT_SETTINGS` line 71); CSS applies `#game-ui{zoom:var(--ui-scale)}` (`src/pixel-style.css` ~line 1170). Read only these places; do not explore.

> Task card for pi. Do the steps in order and do not widen the scope. Run every command in the foreground. When finished, write the result to `output/pi-results/T29.md` in English.
> The dispatcher is the only one that edits `Status:`. Never edit this card; all output goes to the result file.

## Goal
Like Minecraft's "GUI Scale": the player picks 自動 or one fixed step; steps that would not fit the current screen are disabled; the chosen value is shown as a percentage. Old saves keep their value.

## Files you may change
- `src/pixel-ui.js` (settings row markup + its handlers + `applyUiScale` only)
- `src/pixel-game.js` (ONLY lines 71 and 87: default and sanitiser for `uiScale`)
- `src/pixel-style.css` (`.ui-scale` rules only)

## Steps
1. Values: `uiScale` is either the string `'auto'` or a number from the step list `[0.75, 0.85, 1, 1.15, 1.3, 1.5]`. Default `'auto'`. Sanitiser: `'auto'` kept; a finite number is snapped to the nearest step (so old saves like 0.95 or 1.4 still load); anything else → `'auto'`.
2. Auto rule (in `applyUiScale`): pick the largest step whose scaled UI still fits: `step <= min(innerWidth/1280, innerHeight/760)` on desktop (width > 760) and `step <= min(innerWidth/402, innerHeight/712)` on phones; never below 0.75, never above 1.3. Recompute on `resize` and `orientationchange` when the setting is auto.
3. "Fits" for manual steps: a step is disabled (greyed, `aria-disabled`, not clickable, tooltip 螢幕太小) when it is larger than the max allowed by the same formula with the 1.3 cap removed. If the saved step becomes too big after a resize, apply the largest fitting step but keep the saved choice.
4. UI: replace the range slider with a row of segmented buttons: `自動`, `75%`, `85%`, `100%`, `115%`, `130%`, `150%`, each ≥ 36 px tall on phones, wrapping to two rows if needed. Selected button uses the existing gold `.pixel-button` style. Under the row a line `目前：自動（實際 115%）` or `目前：130%`. Keep the 重設 button (resets to 自動). Keyboard: buttons are focusable; ←/→ move between enabled steps.
5. `npm run verify`; small-text for iphone-402x712, iphone-land-812x360, android-360x640 (0 each); `node pipeline/scripts/ui-audit/layout.mjs` 0 FIX. Then a playwright check: open settings at 1440x900 and 402x712, click each enabled step and 自動, read `--ui-scale` from `document.documentElement`, confirm it matches; reload and confirm the choice persisted. Screenshot the settings row at both sizes to `output/ui-audit/T29-*.png`.

## Acceptance (all must pass)
- verify 全部通過; small-text 0 on 3 phones; layout 0 FIX; the step/persist check passes.
- A save with `uiScale: 1.4` loads as 1.3 (or 1.5 by nearest rule — state which) and `uiScale: 'auto'` loads as auto (unit check in the playwright script).

## Report (write to output/pi-results/T29.md, at most 15 lines)
- Verdict on line 1: `DONE` / `BLOCKED` / `FAILED`
- Files changed; auto value chosen at 1440x900 and 402x712
- First line of `output/ui-audit/verify-summary.md`
- Problems hit, or "none"

## Do not
- Touch anything in `src/pixel-game.js` other than lines 71 and 87; hunter AI, combat, save structure otherwise unchanged.
- Commit or push.
- Keep going after the same check fails twice: stop and report.
