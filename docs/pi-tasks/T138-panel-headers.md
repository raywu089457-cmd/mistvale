# T138 面板標題帶統一（設計系統稽核）

Status: done
Type: ui / design-system
Accept: `node tools/checks/panel-headers.mjs && npm run verify:quick`

## Goal

做到第 45 輪時面板已經很多，於是先做一次**版型稽核**（不是靠眼睛看拼圖，是把每張面板的
計算樣式量出來比對）。量完發現三種不一致：

| 指標 | 稽核結果 | 處置 |
| --- | --- | --- |
| 標題帶 `.encounter-banner` 存在 | 16 個面板有 2 個沒有（世界地圖、魔物圖鑑） | 補上 |
| 標題帶結構 | 只有 說明 段落；只有 說明／首領／入門 三處有 `h3` 標題 | 全部統一成 icon ＋ `h3` ＋ `p` |
| `h3` 字級 | 21px（跟 modal 標題 24px 太接近，層級不明） | 統一 15px（手機 14px） |

其他量到的都已經一致：`#modal-content` 內距 20px、modal 標題 24px Ark Pixel、
字距 1.44px、沒有橫向溢出、`.modal` 寬度 830px（獵人名冊 900px 是刻意加寬）。

## Files

- `src/pixel-ui.js`：11 個只有段落的標題帶補上 `h3`；世界地圖與魔物圖鑑各補一個完整標題帶
  （把世界地圖原本那段重複的 `modal-note` 移掉）。
- `src/pixel-style.css`：檔尾 T138 區塊
  `.encounter-banner{min-height:92px;align-items:center}`、
  `.encounter-banner h3{font:800 15px/1.35 var(--font-title);letter-spacing:.05em;color:var(--gold-bright);margin:0 0 3px}`、
  `.encounter-banner p{margin:0;max-width:64ch}`、手機 14px 與取消 min-height。
- `tools/checks/panel-headers.mjs`（新）。

## Decisions

- **每張面板都給一句「這頁在幹嘛」的標題**，而不是重複 modal 標題（modal 標題寫「村莊建設」，
  標題帶寫「先看庫存，再決定蓋什麼」）：重複資訊沒有價值，標題帶的用途是告訴你**為什麼要在這裡**。
  例：世界地圖「七個生態區，越遠越硬」、倉庫「每樣東西的用途與來源」、圖鑑「打過才會寫進來」、
  難度「怪物更硬，報酬更多」、競技場「練兵不折損」。
- **層級拉開**：modal 標題 24px → 標題帶 15px → 內文 12px。原本 21px 只比標題小 3px，看起來像兩個標題。
- **`min-height:92px`**：標題帶高度原本 92～132px 不一，短的面板（設定、建設）內容會往上跳；
  給最小高度後，多數面板的第一行區塊起點一致。
- **不動 900px 寬的獵人名冊**：那是刻意的（卡片兩欄剛好），不在這輪的統一範圍。

## Notes

- 稽核腳本 `output/audit-panels.mjs`：用瀏覽器逐一開 16 個面板，量寬度／內距／標題字級／字距／
  標題帶高度／按鈕最小高度／橫向溢出，印成表格。**這比看拼圖可靠**：拼圖看不出「21px vs 24px」。
- 檢查器 `tools/checks/panel-headers.mjs`：16 個面板都要有 `.encounter-banner`（≥84px）、
  icon、`h3`（14–16px、Ark Pixel）、說明 ≥8 字、modal 標題 24px、內距 20px、無橫向溢出；
  另外驗「banner h3 < modal h2」的層級關係；手機抽驗 4 個面板。
- 踩到的坑：委託面板的標題帶結構是 `</i><div class="qs-banner">`（沒有包一層 `<div>`），
  用 `indexOf('</i><div>')` 插入會跑到下一張卡，結果把「村長的章節委託」寫到倉庫的標題帶上。
  已修正，並在腳本裡改成「先確認結構再插入、插完再量一次」。
