# T116 訊息卡片化（toast）

Status: done
Type: ui
Accept: `node tools/checks/toasts.mjs && npm run verify:quick`

## Goal

遊戲裡的即時回饋（買東西、升級、委託完成、操作失敗…）全部走 `logToast()`，但以前只是
**一行置中純文字**：沒有種類、沒有圖示、看不出這則是好消息還是失敗，而且一次 4 則疊在同一柱
也很難掃。這一輪把訊息做成卡片：

1. 深色底金框卡片、左側 4px **語意色條**、左邊一顆 16px 圖示：
   - 一般 `#8ebc5e` ✓
   - 獎勵（金幣／獲得）`#e7be5e` 金幣圖示
   - 升級（升級／Lv.）`#f2c96a` 號角圖示
   - 委託（委託／章節／完成）`#cfae6a` 卷軸圖示
   - 失敗 `#e0705f` 骷髏圖示（框線也轉紅）
2. 進場 180ms 滑入、3 秒後 260ms 淡出；`prefers-reduced-motion` 時兩段動畫都關掉。
3. 同時最多 4 則（超過擠掉最舊的），角色 `role=status`，容器維持 `aria-live=polite`。
4. 沒指定種類時**從文字推斷**（`獲得`／`金幣` → 獎勵，`升級`／`Lv.N` → 升級，`委託`／`完成` → 委託，
   `ok=false` → 失敗），41 個呼叫點一個都不用改。
5. 手機：訊息靠左、右邊留 106px 給浮動的 地圖／暫停／速度 三顆鈕（前一版 94vw 會蓋住它們）。

## Files

- `src/pixel-ui.js`：`TOAST_KINDS`／`TOAST_RE`／`toastKindOf()`、`logToast(msg,ok,kind)` 改寫
  （多了種類、圖示、role、淡出；`setIcons(e)` 讓動態節點也畫得出圖示），除錯鉤子 `globalThis.__toast`。
- `src/pixel-style.css`：檔尾 T116 區塊（卡片外觀、`.toast-check`、`toastIn`／`toastOut`、
  減少動態、手機定位）。
- `tools/checks/toasts.mjs`（新）。

## Decisions

- **用文字推斷而不是改 41 個呼叫點**：呼叫端拿到的多半是 `r.message`（來自遊戲層），逐一改成帶種類
  會擴散到 pixel-game.js 幾十處；推斷只影響顏色與圖示，錯了也不影響行為。真要精準的地方
  （檢查器、未來的獎勵結算）可以傳第三個參數。
- **一般訊息不加圖示、只放一個圓形打勾**：所有訊息都配圖示會讓「一般」跟「獎勵」打對台。
- **卡片靠左對齊文字**：舊版置中在兩行訊息時很難讀；卡片內左對齊＋圖示定位更清楚。
- **手機不是縮小而是換位置**：402px 寬下置中的卡片一定會壓到右側浮動鈕，改靠左並限寬。
- **淡出用 `.out` class + 260ms 後移除**：直接 `remove()` 會硬切，加一段淡出比較不突兀；
  但 `setTimeout` 期間使用者可能已經清空容器，所以移除前不再查詢父節點。

## Notes

- `iconHTML()` 只吐 `<span data-icon>`，真正畫圖是 `setIcons(root)`；動態建立的節點一定要再呼叫一次，
  不然卡片上會是一個空格子。
- 檢查器用 `globalThis.__toast` 製造各種語意，並驗：色票、圖示、`role`、滑入動畫、四則上限、
  3 秒收起、減少動態、手機不超界也不蓋浮動鈕。
- 顏色與圖示的對照表在 `TOAST_KINDS`；要調整訊息語言只需改那一張表。
- 舊 CSS 的 `.toast{min-width:230px;text-align:center}` 仍在，但被 T116 區塊蓋掉（同檔案後面）。
