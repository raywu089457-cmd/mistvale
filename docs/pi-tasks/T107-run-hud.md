# T107 外出小隊 HUD

Status: done
Type: ui
Accept: `node tools/checks/run-hud.mjs && npm run verify:quick`

## Goal

地下城與競技場的戰鬥畫面只畫在**面板裡的橫條 canvas**（`world.drawDungeonStrip`，只有面板開著時才更新）。面板一關，小隊打到第幾層、三個人剩多少血、對手還剩多少，畫面上完全看不到——玩家只能一直開著面板，或盲等。這一輪在主畫面補一條常駐的**小隊 HUD**：

1. 地下城進行中、面板關著時，畫面頂端顯示：`地下城`、`第 N 層 · 第 M/3 波`、階段（集結中／戰鬥中／前進中／休整中）、三位獵人的職業＋名字＋生命條＋`hp/maxHp`。
2. 競技場進行中顯示：`競技場`、`vs 對手名`、同上三人，外加一行**對手生命條**與數字。
3. 生命低於 35% 轉紅、倒地變灰；樓層／波數／階段一變就重畫，血量只改寬度與數字（不重建 DOM）。
4. 面板開著時收起（戰鬥畫面就在面板裡），關掉面板再出現。
5. 附兩個按鈕：`自動續戰 開/關`、`撤退`——不用開面板就能操作。
6. 只有按鈕吃點擊（本體 `pointer-events:none`），不會擋世界點擊；手機上不能蓋住 地圖／暫停／速度 三顆浮動鈕。

## Files

- `src/pixel-ui.js`：`runHudPaint()`（每幀由 `frame()` 呼叫）、`#run-hud` 動態建立與簽章比對（`on|floor|wave|phase|auto|party` 變了才重建 DOM）、血量更新用快取的 span/數字節點；`doAction` 新增 `runRetreat`（`game.retreatDungeon()`，不開面板）與 `runAuto`（`game.setDungeonAuto`）。
- `src/pixel-style.css`：T107 區塊（木框＋金線面板、`rh-head`／`rh-phase`／`rh-party`／`rh-unit`／`rh-bar`／`rh-num`／`rh-foe`／`rh-x`），手機（≤760px）改成由左到右滿寬、`top:142px` 讓開頂欄與浮動鈕。
- `tools/checks/run-hud.mjs`（新）：地城／競技場／手機三段；驗證樓層波數階段、三人名字與生命數字、血條寬度比例（±3%）、重傷轉紅、自動續戰切換與 `aria-pressed`、面板開關時 HUD 收合、撤退後 HUD 消失、HUD 本體不攔點擊、三顆浮動鈕沒被蓋住、手機不超出畫面也不造成水平捲動。

## Decisions

- 放在主畫面而不是加在面板裡：面板已經有橫條戰鬥畫面，缺的正是「關掉面板也能掌握戰況」。
- 面板開著時不顯示：同一份資訊畫兩次只是干擾，而且面板會蓋住頂端。
- 只重建 DOM 於「形狀」改變時：血量每次命中都會變，重建整塊會讓 CSS transition 一直被重置、也浪費效能。
- 兩個按鈕直接做動作、不開面板（`runRetreat`／`runAuto`）：玩家關掉面板就是為了看村莊，按一下又跳回面板會很突兀。
- 手機放 `top:142px`、左右各 8px 滿寬：貼著頂欄下面會蓋住 地圖／暫停／速度（T96 同一個坑），往下移到浮動鈕下方、滿寬反而更好讀。

## Notes

- 名次上的第一個版本把 HUD 放在 `top:112px`（手機），實測 `elementFromPoint` 三顆浮動鈕全部被蓋；改成 142px 並在檢查器加斷言。
- 檢查器第一次跑死在 `page.click('#run-hud [data-action="runRetreat"]')`：關面板用的是 `[data-action="close"]`，腳本裡寫成 `closeModal`，面板沒關 → HUD 不會出現。改用 `Escape` 關面板。
- 地下城／競技場的階段字（集結中…）是遊戲原本就有的欄位，HUD 只是照抄，不另外造詞。
