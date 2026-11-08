# T98: roster: readable hunter cards, filter row that never clips

Status: done
Accept: node tools/checks/roster-layout.mjs && npm run verify:quick

## Goal
Make the 獵人 (hunter) roster screen read cleanly on both desktop and phone, and stop the filter row from being cut off.

(a) The 篩選 row clips its last chip today: at 402 px the 倒下 chip runs past the modal edge, and the 2026-11-05 audit recorded `05-hunter hscroll modal-content sw=318 cw=314` at 360x640. After the change, at 1440x900, 402x712 and 360x640 every one of the five filter chips (全部 / 近戰 / 遠程 / 需要照顧 / 倒下) and the four sort chips (等級 / 稀有度 / 職業 / 生命) must be fully inside `#modal-content`, and `#modal-content` must not scroll horizontally (`scrollWidth <= clientWidth + 1`). Let the chips wrap instead of clipping; keep 篩選 and 排序 as two labelled rows.

(b) The hunter card (`.hunter-card`, built in the `type==='hunters'` template in `src/pixel-ui.js`) should read top-down instead of as a floating portrait with centred text: a header row with the name and the class emblem, then the portrait on the left with level · class, the rarity chip and the status next to it, and the health bar along the bottom of the card. Give the bar a state by ratio — healthy, hurt (25–60%), critical (<25%) — with distinct fill colours, an `aria-label` carrying `生命 hp/maxHp`, and keep it inside the card's padding. A downed hunter (hp 0) shows the critical state.

(c) Nothing inside a card may overflow it horizontally at 402 and 360 px wide, and the card button must keep `data-action="hunter"` + `data-id` so the crawl and the hunter detail screen still work. `miniRoster()` in the left panel keeps working.

Write the new checker `tools/checks/roster-layout.mjs` (Playwright, same launch pattern as `tools/checks/mobile-mode-bar.mjs`) that asserts (a) and (c) at all three widths plus the presence of the three health states, and prints one PASS line. Open the screen the same way the other checkers do (`?preview=1`, `selectBuilding` is not needed — use the `hunters` action button, and set one hunter to 50% hp and one to 0 hp through `globalThis.__mistvaleGame.state` before measuring).

Then take a montage for review: desktop 1440x900, phone 402x712 and phone 360x640 of the roster screen after the change, stacked with labels, at `output/roster/montage.png`. Use `Montage: output/roster/montage.png` in your result file.

## Files you may change
- src/pixel-ui.js
- src/pixel-style.css
- tools/checks/roster-layout.mjs (new)
