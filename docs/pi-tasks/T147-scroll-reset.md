# T147 面板重新打開要回到最上面

Status: done
Type: ui
Accept: `node tools/checks/scroll-reset.mjs && npm run verify`

## Goal

實測（402 手機）發現兩個捲動位置殘留：

1. 圖鑑捲到 1800px → 關掉 → 再打開，仍然停在 **1844px**（直接從半途開始，看不到標題帶）
2. 圖鑑關掉後開「獵人名冊」，內容被前一個面板的捲動帶著走（381px）

## Files

- `src/pixel-ui.js`：`openModal(type)` 開頭記下 `prevType=modal`，在 `focusModalStart(prev)` 之前補
  `if(!wasOpen||prevType!==type){$("#modal-content").scrollTop=0;}`（註解：換面板或重新打開時回到最上面）
- `tools/checks/scroll-reset.mjs`（新）：圖鑑捲到底 → 重開要在 0；接著開名冊也要在 0；
  另外驗「面板內操作不跳位」——交易所在 220px 處按 +10 數量重繪後仍在 220px。

## Decisions

- **條件是「不是同一個面板還開著」**：`!wasOpen || prevType !== type`。
  面板內的操作（例如交易所加數量）是 `openModal(同一個 type)` 重繪，不能把玩家正在看的位置拉回頂端。
- 只重設 `#modal-content`，不動 `#left-panel`、`#inspector`（側欄各自有狀態）。

## Notes

- 這個 bug 只有在「捲長面板 → 關 → 再開」或「長面板 → 短面板」時才會看到，滑鼠與手機都有，
  但手機上更容易遇到（面板幾乎都超過一屏）。
