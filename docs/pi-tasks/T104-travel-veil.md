# T104 生態區切換過場

Status: done
Type: ui
Accept: `node tools/checks/travel-veil.mjs && npm run verify:quick`

## Goal

在世界地圖按「前往」切換生態區時，畫面是直接硬切：世界整塊重建（換地形、換魔物、換天氣），中間會有一段明顯的跳動，而且沒有任何「我正在出發」的訊號。這一輪補一層過場：

1. 按下前往後立刻蓋一層全螢幕霧面遮罩，寫出**目的地名稱**（例：向陽草原）與「整裝出發，隊伍正在穿越邊界」。
2. 遮罩在 **200ms 後**才執行真正的換區（世界重建發生在遮罩底下），再停 220ms 淡出，總長約 0.6–0.7 秒。
3. 遮罩 `pointer-events:none`：不擋任何按鈕，避免巡檢與玩家被卡住。
4. `prefers-reduced-motion: reduce` 時**不播遮罩**，直接切換。

## Files

- `src/pixel-ui.js`：新增 `travelVeil(label, run)`（`travelReduced()` 判斷減少動態；`#travel-veil` 元素重用、`.on` 淡入、200ms 後跑 `run()`、220ms 後淡出）與 `regionTravel` 動作改走它（目的地名稱從 `REGIONS` 取）。
- `src/pixel-style.css`：`#travel-veil`（固定全螢幕、z-index 90、徑向暗色漸層、`transition:opacity .2s`）、`.tv-inner` 卡片（金框、金色細線、標題用 `--font-title`）、文字後面的呼吸省略號 `@keyframes tvBreathe`、手機降字級、reduced-motion 關動畫。
- `tools/checks/travel-veil.mjs`：點 `regionTravel` 後 80ms 檢查遮罩（存在、可見、蓋滿 1440x900、`pointer-events:none`、z-index ≥ 60、含目的地與「整裝出發」），900ms 後檢查遮罩收起且 `state.region` 已切換；連續切兩個區域；再用 `reducedMotion:'reduce'` 的 context 確認 120ms 內直接切完、不播遮罩。

## Decisions

- 遮罩不吃點擊：過場只有 0.6 秒，攔截點擊只會讓「按了沒反應」變多，也避免按鈕巡檢誤報 COVERED（T101 的教訓）。
- 換區動作放在遮罩底下執行，而不是先換再遮：世界重建是同步的，先遮才能蓋住重建那一下。
- 不繡「載入百分比」：換區是瞬間完成，假進度條反而更假，只留呼吸省略號表示「正在進行」。

## Notes

- 只在 `regionTravel`（世界地圖「前往」）加過場；`dispatchHunters` 與區域內移動不動。
- 元素全螢幕 `position:fixed`，遊戲的 UI 都在 z-index 40 以下，90 足夠蓋住面板與 HUD。
