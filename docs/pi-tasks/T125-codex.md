# T125 魔物圖鑑

Status: done
Type: ui / content
Accept: `node tools/checks/codex.mjs && npm run verify:quick`

## Goal

遊戲完全沒有「圖鑑」概念：玩家打過去的魔物只能在野外看牠頭上的血條，不知道名字、掉落、棲息地，
也不知道還有幾種沒見過。這輪加一頁**魔物圖鑑**：

- 入口在世界地圖頁尾（`魔物圖鑑` 按鈕），不用新增底部按鈕。
- 上方摘要：`收錄 21 種野外魔物 · 7 個區域 · 首領 1`。
- 依 `REGION_MONSTERS` 分區（向陽草原／橡木密林／…），每區標題寫區域副標與「3 種」。
- 每張卡：魔物頭像（從 sheet 現場切）、名字、生命／攻擊／金幣／經驗、掉落材料（圖示＋名字＋數量）、
  一句 `MONSTER_LORE` 描述。
- 最後一區是「首領」。
- 手機單欄。

## Files

- `src/pixel-ui.js`：新增 `modalHTML('codex')` 分支、`doAction` 的 `codex`、`modalTitle` 名稱；
  世界地圖模板頁尾加 `.wm-foot` 按鈕；`paintPortraits()` 現在也補 `[data-mface]` 魔物頭像
  （sheet 是非同步載入，圖鑑開得比 sheet 快時會先空著，每 400ms 補一次）。
- `src/pixel-style.css`：檔尾 T125 區塊（摘要條、分區標題、卡片 grid、掉落 chips、首領卡配色、手機單欄）。
- `tools/checks/codex.mjs`（新）。

## Decisions

- **入口放在世界地圖**：底部已經有 7 顆按鈕，再加一顆會擠；圖鑑跟「看世界有什麼」是同一件事。
- **資料全部即時讀遊戲表**（`ENEMIES`／`REGION_MONSTERS`／`MONSTER_NAME`／`MONSTER_LORE`），
  不另外複製一份圖鑑資料；檢查器直接 import 這些模組逐項比對。
- **頭像即時切、不預先烘焙**：沿用 T110 的 `monsterPortrait()`；缺圖時卡片不會破版（只有空框）。
- **寫「基礎值」而不是實際值**：實際傷害/報酬受難度與獵人屬性影響，圖鑑寫基礎值才不會說謊；
  頁面上也有一句說明。
- **首領單獨一區**：牠不在 `REGION_MONSTERS` 裡（是地圖深處的固定存在），硬塞進某區會失真。

## Notes

- 檢查器驗：8 個分區、22 張卡、每區魔物順序等於 `REGION_MONSTERS`、每張卡的
  名稱／四項數值／掉落數量／短描述與資料逐項相同、22 張都有 data URL 頭像、Esc 可關、手機單欄不溢出。
- 標題在 `#modal-title`（不是面板內 banner），檢查器一開始抓錯位置。
- 首領沒有 `MONSTER_NAME`／`MONSTER_LORE` 時，卡片用「地圖首領」與自寫的一句描述；
  檢查器對首領放寬名稱比對（只用來避免整排失敗）。
