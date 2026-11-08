# T96: phone: move-building bar covers the top controls

Status: done
Accept: node tools/checks/mobile-mode-bar.mjs && npm run verify:quick

## Goal
On phones the move-building bar must not cover the floating top controls 地圖 / 暫停 / 速度. While the player is moving a building, a tap on any of the three must reach the button, and the bar must stay inside the viewport, clear of `#topbar` and `#bottom-bar`. Desktop layout must not change.

## Notes
- Repro (phone viewport 402x712, deviceScaleFactor 2, isMobile, hasTouch): fire `selectBuilding` with `data-id=forge`, then click `#inspector [data-action=moveBuilding]`. `#placement` is then `position:fixed`, rect [10,117,382,84], `z-index:12`, and the topbar's 地圖/暫停/速度 buttons sit at y 104..148 while the topbar itself ends at y 98 — so the bar (above the topbar's z-index 10) swallows their taps. The phone button crawl reports exactly these three as `click-failed` on screen `inspector`.
- Suggested fix, decide yourself if something fits the panel style better: inside `@media(max-width:760px)` dock the bar near the bottom, above the bottom action bar, e.g. `#placement{top:auto;bottom:calc(78px + env(safe-area-inset-bottom,0px));left:10px;right:10px}`. It is thumb reachable there and leaves the top controls alone. Do not touch the desktop rule.
- New checker `tools/checks/mobile-mode-bar.mjs` (copy the browser launch and readiness waits from `pipeline/scripts/ui-audit/buttons.mjs`; the game server on port 5024 is already running, and if TARGET is unreachable exit nonzero with one clear line). It must fail before the fix and pass after, proving all of: in move mode `document.elementFromPoint` at the centre of `[data-action=worldmap]`, `[data-action=pause]` and `[data-action=speed]` resolves to that button or a descendant; `#placement`'s rect is fully inside the viewport and intersects neither `#topbar` nor `#bottom-bar`; `#placement [data-action=cancelMove]` is the topmost element at its own centre.
- Sanity: after the fix `node pipeline/scripts/ui-audit/buttons.mjs phone` must report 0 problems. Do not change the crawl script.

## Files you may change
- src/pixel-style.css
- tools/checks/mobile-mode-bar.mjs
