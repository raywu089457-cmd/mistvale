# T97: phone: one panel at a time in move mode

Status: done
Accept: node tools/checks/mobile-mode-bar.mjs && npm run verify:quick
Montage: output/pi-results/T97-montage.png

## Goal
On phones, entering move-building mode must leave only one panel on screen. Right now `#placement` is docked above the bottom bar (T96) but the building inspector stays open, so its action row (升級 Lv.2 / 移動位置) sits half-covered under the bar and the two panels read as one stacked mess. While `placing` is active on a phone the inspector must be out of the way — closed, the same way `[data-action=closeInspector]` closes it, so `selected` and the HUD state stay consistent — and the phone button crawl must still report 0 problems. Desktop must keep its current behaviour and its `#placement` rect guard.

## Notes
- Where the mode starts: `src/pixel-ui.js`, the `doAction` branch `if(a==='moveBuilding'){closeModal();placing=id;$('#placement').classList.remove('hidden');world?.placeMode(id);paint();return;}`. It closes the modal but never the inspector.
- Find the inspector's own close path (grep `closeInspector` in `src/pixel-ui.js`) and reuse exactly that, so `selected`, `#inspector.classList` and the HUD reflow follow the normal close. Decide whether to hide only when the viewport is phone-wide (the desktop bar at `top:93px` does not overlap the inspector, so desktop can keep it) and say which you picked in the result file.
- Restoring the inspector after cancel or placement is not required: tapping the building again reopens it. Do not add persistence or save fields.
- Extend `tools/checks/mobile-mode-bar.mjs`: after entering move mode on the phone context also assert the inspector panel is not visible (hidden class, `display:none`, or a zero rect) and that the bar's band contains no inspector action button that is hit-testable; keep the existing three top-control assertions plus the desktop guard. The checker must still fail when the mode bar is put back on top of the top controls.
- Run `node pipeline/scripts/ui-audit/buttons.mjs phone` after the fix; it must print `--- 有問題的按鈕(0)`. `gone-after-reopen` rows are acceptable, `NO REACTION` / `click-failed` / `COVERED` are not. Do not edit the crawl script. If hiding the inspector makes the crawl worse, say so in the result file instead of loosening the crawl.

## Files you may change
- src/pixel-ui.js
- src/pixel-style.css
- tools/checks/mobile-mode-bar.mjs
