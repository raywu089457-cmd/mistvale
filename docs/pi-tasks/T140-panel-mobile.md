# T140 手機面板版型一致性（觸控目標 44px＋固定上緣）

Status: done
Type: ui / design-system
Accept: `node tools/checks/panel-mobile.mjs && npm run verify:quick`

## Goal

把 T138 的稽核方法擴到手機：在 402×712 逐一開 16 個面板量版型。量完發現兩個真問題：

1. **主要按鈕高度 40 vs 44 混用**（craft／dispatch 的分頁鈕 40px、其餘 44px）——觸控目標不一致，
   而 44px 是行動裝置常用的最小可點尺寸。
2. **面板上緣不一致**：`#modal-backdrop` 是 `align-items:center`，內容短的面板（首領）會浮在
   畫面中間（top 192），其他面板貼在 top 104——切換面板時整個視窗跳位置。

## Files

- `src/pixel-style.css`：檔尾兩塊 T140
  - `@media(max-width:760px){ #modal-content .pixel-button{min-height:44px;padding-left:12px;padding-right:12px} … }`
    （只影響面板內的主要／次要動作鈕，小圖示鈕不動）
  - `#modal-backdrop{align-items:flex-start;padding:calc(72px + safe-area) 20px 16px}`、
    `#modal{max-height:calc(100vh - 72px - 32px - safe-area)}`，手機 96px 版本
- `tools/checks/panel-mobile.mjs`（新）——把這輪的不變量變成回歸守門。

## Decisions

- **44px 只給 `.pixel-button`**：分頁籤（生活物資／裝備製作）與列表列的 ± 鈕維持 40px，
  它們是密集列表的一部分，硬拉到 44px 會讓每列變高、可視內容變少。
- **上緣固定、高度自適應**：短面板（首領）維持內容高度，但不置中——不然開不同面板時視窗會跳。
  這裡的「一致」是指**上緣一致**，不是高度一致。
- **`max-height` 用 `calc(100vh - 上緣 - 下緣留白)`**：原本寫 `90vh`，在矮視窗會超出底部；
  改成算得出來的公式，桌機與手機各一組。

## Notes

- 稽核腳本 `output/audit-phone.mjs`：16 個面板量寬度／高／上下緣／內距／標題帶／按鈕高度分佈／
  小於 44px 的按鈕（含 class）／橫向溢出／可捲高度，印成表格。
- 檢查器 `tools/checks/panel-mobile.mjs`：16 個面板都要有標題帶、內距 14px、主要按鈕 ≥44px、
  沒有 <34px 的按鈕、沒有橫向溢出；另外驗「上緣都一樣」「下緣不超出畫面」。
- 實測（402×712）：面板 **382px 寬、上緣都是 104px**，15 個面板 540px 高填滿，
  首領面板 364px（內容短）；沒有一個按鈕小於 34px。
- 第一版檢查器有兩個誤判要記住：`Math.min(...[])` 對「沒有 .pixel-button 的面板」會得到 0
  （要先用 count 判斷）；把「下緣必須一致」當規則也是錯的——短面板本來就會比較矮。
