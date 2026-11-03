# T52: phone touch targets

Status: done
Accept: auto

## Goal
On phone viewports (pointer: coarse, width <= 430px), every visible tappable control in the HUD, bottom bar and all modals (buttons, chips, tabs, close buttons, list rows) has a hit area of at least 40x40 CSS px — by padding or an invisible hit-box, not by enlarging icons or text — and no two hit areas overlap. Desktop unchanged. Add a reusable check under `tools/checks/` that measures this in the browser and lists offenders. Before/after phone screenshots of the two most-changed screens for human review.
