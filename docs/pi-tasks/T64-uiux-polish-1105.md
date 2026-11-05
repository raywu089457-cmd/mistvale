# T64: UI/UX 修正:重複標題、派遣鈕遮擋、360 橫捲、名牌壓面板

Status: failed
Accept: auto

## Goal
Fix four UI/UX problems that Claude found in the T63 montages (`output/ui-audit/uiux-1105/`). Only change the UI layer: `src/pixel-ui.js`, `src/pixel-style.css`, and the DOM label code if U4 needs it. Game logic, rendering and timing stay as they are.

| # | Problem (seen in) | Wanted result |
|---|---|---|
| U1 | Every modal with an illustrated banner shows its title twice: once in the modal header and again as the banner's heading (村莊建設 / 村莊建設, 獵人名冊 / 獵人名冊, 交易所, 製作與庫存, 地下城遠征, 競技場, 村長委託, 村莊倉庫, 狩獵難度, 設定, 派遣隊伍 and so on). Phone and desktop. | Drop the banner heading when it repeats the header title. Keep the banner image and its intro sentence. On phone (width ≤ 480), cap the banner block at 96 px tall, so the first row of real content moves up. |
| U2 | Dispatch team (派遣出征): the sticky gold dispatch button (派遣 N 位前往…) covers the last row of hunter cards on phone and the region list on desktop. On phone the team tabs wrap, with 隊伍4 alone on a second row. | The scroll content gets bottom padding equal to the sticky button's height plus 12 px, so you can scroll the last row fully above the button. On phone the four team tabs fit on one row (equal widths, text not cut). |
| U3 | android-360x640: the hunter detail modal scrolls horizontally (layout.mjs FIX: modal-content scrollWidth 318 > clientWidth 314). | No horizontal overflow in any modal at 360x640. |
| U4 | Phone building inspector (forge): a region name label on the map (向陽…) is drawn over the inspector panel's top-right corner. | Map and region labels never draw over the inspector or any modal. The panel sits above them. |

Accept: a checker in `tools/checks/` that fails on today's code. It checks:
- no modal title appears twice;
- the last dispatch card's bottom edge can scroll above the sticky button's top edge;
- the four team tabs share one top coordinate at 390x844;
- no horizontal overflow at 360x640;
- the inspector rect is not covered by a map label (use elementFromPoint at the corners).

Then run `npm run verify:quick`. Last, re-run the T63 shots and `pipeline/scripts/ui-audit/montage.mjs` into `output/ui-audit/uiux-1105-after/`, so Claude can compare with one look.
