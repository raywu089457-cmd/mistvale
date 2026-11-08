# T101 — 交易所／製作：把「夠不夠」寫出來

Status: done
Type: ui

## Goal

交易所與製作面板原本只列出成本，沒說做不做得出來：材料不足的卡片照樣有可按的「製作 10 份」按鈕（按下去才跳錯誤訊息），交易所只看得到「最多支出 X 金」，看不到村莊金庫有多少、夠不夠付。這一輪把短缺與預算直接寫在畫面上。

## Files

- `src/pixel-ui.js` — `needChips()` 產生「現有/需要」材料 chip、`affordableBatches()` 算最多幾批；製作卡改成「最多可做 N 批（M 份）／材料不足」＋主鈕 disabled、「做滿」按鈕帶真正算出來的最大批數；交易所每列顯示這一列的花費（超額標紅）、頁尾加「預計支出 · 金庫 · 超出」。
- `src/pixel-style.css` — T101 區塊：`.cost-chip`（不足標紅）、`.craft-meta`、disabled 主鈕保持可讀、`.tr-cost.over`、釘在底部的 `.trade-footer`（材料變多也不用捲到底才看得到數字）、手機把說明文字收起。
- `tools/checks/trade-craft.mjs` — 新檢查器（桌機 1440x900 與手機 402x712）。

## Decisions

- 「最多可做 0 批」改成直接寫「材料不足」，按鈕文字也換成「材料不足」——只把原本的字變灰會變成一條看不懂的空按鈕（第一版就是這樣，截圖檢查才發現）。
- 交易所頁尾改成 `position:sticky`：材料列一多時，金庫與預計支出原本會落在捲動區外，最關鍵的數字反而看不到。
- 手機（≤760px）藏掉「從村莊金庫付款；獵人下次回村自動成交」這行說明，只留數字，避免頁尾吃掉半個畫面。
- `data-action="craftProduct"` 的批次仍然限制 1–100（沿用 `game.craft()` 的驗證），「做滿」按鈕送出的就是 `affordableBatches()` 算出的值。

## Accept

`node tools/checks/trade-craft.mjs && npm run verify:quick`（另跑過完整 `npm run verify`）

## Notes

檢查器會把村莊調成固定狀態（小麥粉 13、藥草 3、亞麻布 9、獸皮 8、鐵礦 20、木材 40、金庫 1,500），所以能看到 2 批 / 0 批 / 1 批三種情況；交易所再測「+10 後花費」「金庫只剩 10 金 → 超出 10」「收購 999 上限」。
