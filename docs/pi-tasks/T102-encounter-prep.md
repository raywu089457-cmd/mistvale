# T102 遠征準備面板：地下城／競技場看得出能不能出發

Status: done
Type: ui
Accept: `node tools/checks/encounter-prep.mjs && npm run verify:quick`

## Goal

地下城遠征與競技場模擬對戰以前只看得到「一排出征過的獵人卡」與一顆沒有狀態的主鈕：人不夠、小隊在整備、卡片上的人正在另一邊出征，全都要按下去才知道（跳出錯誤提示）。這一輪把出發前的資訊補齊：

1. **小隊總覽條**（列表上方）：`已選 N/3 · 總攻擊 X · 總生命 Y · 平均 Lv.Z`，每點一位就更新；未滿 3 人時在右側寫「再選 N 位才能出發」。
2. **選不到的人**：倒下／待復活的獵人卡 disabled 並在卡上寫「待復活」；正在另一邊出征的寫「競技場中」／「地下城出征中」。
3. **主鈕狀態**：人不夠時 disabled 並寫「還缺 N 位獵人」；整備中寫「小隊整備中 N 秒」；選滿 3 人才變回「派遣三人小隊 · 從第 N 層」／「開始模擬對戰」。
4. **地下城多寫戰況**：`每層 3 波魔物 · 通過後紀錄推進到第 N 層`。

## Files

- `src/pixel-ui.js`：`partyPick()` 加上 blocked 判斷（`partyBlock()` 依 `hp<=0`／`task==='revive'`／另一邊的 `task` 決定理由，並輸出 `disabled` + `aria-disabled` + `.pp-note`）；新增 `partyList()`、`partySummary(ids)`、`partyGate(n,cooldown,idleLabel)`；地下城／競技場模板改用這三個，主鈕文字與 disabled 由 `partyGate` 決定；地下城多一行 `.encounter-facts`。
- `src/pixel-style.css`：`.party-summary`、`.ps-hint`、`.pp-note` 顏色、`.party-pick.blocked`、`.encounter-facts`、`.encounter-actions .pixel-button[disabled]` 保留可讀文字，手機降字級。
- `tools/checks/encounter-prep.mjs`：以固定村莊狀態（#1 倒下、#2 待復活）在 1440x900 與 402x712 檢查總覽數字、理由、disable 狀態、主鈕文字、整備中秒數、橫向溢出。

## Decisions

- 理由文字用卡片上的 `.pp-note` 而不是 tooltip：手機沒有 hover。
- 主鈕 disabled 但保留金色框與可讀文字（比照 T101 製作鈕的處理），避免變成看不懂的灰條。
- 不做「預估勝率」：目前沒有可信的計算來源，寫上去就是編的；只呈現可由 `state` 直接算出的總攻擊／總生命／平均等級。
- 整理鈕不放 sticky 底部（T101 的教訓：釘住的條會蓋住可點的東西）。

## Notes

- `partyBlock()` 只依 `task`／`hp` 判斷，不改遊戲邏輯；實際能不能出發仍由 `game.startDungeon`／`game.startArena` 決定。
- 派遣出征的卡片沿用同一個 `partyPick()`（`toggleDispatchHunter` 不帶 kind，因此不會被 blocked 判斷影響），維持 T100 的「在別的隊伍」註記。
