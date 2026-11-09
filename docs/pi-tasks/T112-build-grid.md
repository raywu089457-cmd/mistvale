# T112 建設彈窗：庫存與缺口

Status: done
Type: ui
Accept: `node tools/checks/build-grid.mjs && npm run verify:quick`

## Goal

「建設」彈窗是玩家蓋東西的地方，但每張卡只有名字、等級、幾個需求圖示——看不出**現在夠不夠**、缺多少、是不是被大廳卡住。要點進右側面板（T111）才看得到原因，而這正是最需要一眼掃過去的畫面。

1. 彈窗頂端一條**村莊庫存**：金幣＋6 種材料（圖示＋數量），跟 state 即時一致。
2. 每張卡的需求改成 `現有/需要` 的 chip（不足那項整塊標紅）。
3. 不足或卡大廳時，卡片下方寫一句原因：`缺 金幣 300、木材 42`、`需要城鎮大廳 Lv.3`。
4. 滿級建築寫 `已達最高等級`，不再列需求。
5. 點卡片仍然是「選這棟建築」（關彈窗、開右側面板），不改原本操作。

## Files

- `src/pixel-ui.js`：新增 `buildTileState(b,l)`（回 `{done,short,chips,note,aria}`；`
  hallBlocked = b.id!=='hall' && (l+1) > hall+1`，需求用 `game.getUpgradeCost`／`b.cost`），
  `type==='build'` 模板改成「庫存列 + 卡片需求 chip + 缺口字樣 + aria-label 寫出可不可以蓋」。
- `src/pixel-style.css`：T112 區塊（`.build-stock/.bs-item`、卡片內 chip 縮小、`.build-note`、
  手機字級），大括號 1829/1829。
- `tools/checks/build-grid.mjs`（新）。

## Decisions

- **庫存列放最上面而不是底部**：跟 T101 交易所同一個結論（sticky/fixed 會蓋住可點元素；
  靜態放在最上面最安全，也剛好是掃視起點）。
- **不把不能蓋的卡片 disable**：卡片本身是「選這棟建築」的入口，停用等於把人擋在門外；
  改成標紅＋寫缺口，點進去右側面板仍有完整說明。
- **未建造與升級共用同一份 chip 邏輯**：兩者都只是「一組需求對上目前庫存」，分開寫會漂。

## Notes

- 缺口文字用 `costName()`（金幣／寶石有中文名，不印 `gold`／`gems` 這種 key）。
- 驗收的「資源充足」情境要同時把 6 種材料與金幣拉高，否則隨機一種材料不足就會誤判成缺口文字。
- 這張檢查器只能驗「跟 state 一致」與「有沒有標紅／寫原因」，好不好看還是得看拼圖
  （`output/build-grid/desktop-rich.png`、`desktop-short.png`、`phone.png`）。
