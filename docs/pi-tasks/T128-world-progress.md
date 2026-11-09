# T128 世界地圖：區域探索進度與首領狀態

Status: done
Type: ui
Accept: `node tools/checks/world-progress.mjs && npm run verify:quick`

## Goal

T126 讓圖鑑有了「打過才揭露」的紀錄，但只有打開圖鑑才看得到。世界地圖的區域卡片卻完全沒反映
探索程度——去過哪一區、那區還有幾種沒見過，玩家沒有地方看。這輪把同一份紀錄接到地圖上：

1. 每張區域卡片（村莊除外）多一列進度：**鑽石點 × N**（每個點＝一種魔物，打過就亮）＋
   `已記錄 2／3 種 · 擊殺 3 次`。
2. 頁尾加一行首領狀態：`首領尚未挑戰` / `首領已擊敗 N 次`。
3. 資料完全由 `state.codex`（T126 的擊殺紀錄）與 `state.bossKills` 推導，不另存一份進度。
4. 村莊沒有野外魔物 → 不顯示那一列（不硬塞一個空進度）。

## Files

- `src/pixel-ui.js`：新增 `regionProgress(rid,s)` 與 `regionBossLine(s)` 兩個小工具（放在 `modalHTML` 之前）；
  世界地圖模板在 `loreList(r.id)` 之後插入 `${regionProgress(r.id,s)}`；`.wm-foot` 加
  `<small class="wm-boss" data-boss-kills="${s.bossKills||0}">${regionBossLine(s)}</small>`。
- `src/pixel-style.css`：檔尾 T128 區塊（`.rg-exp` 條、`.rg-dot` 菱形點與亮起時的發光、
  `.wm-boss` 顏色、手機換行）。
- `tools/checks/world-progress.mjs`（新）。

## Decisions

- **用鑽石點而不是進度條**：一區只有 3 種魔物，三個點就能表達「哪一隻還沒見過」；
  進度條只能表達比例，看不出缺口在哪。
- **點的 tooltip 寫魔物名或「尚未記錄」**：滑鼠停在那裡就知道差哪一隻（不佔版面）。
- **首領狀態放頁尾而不是塞進某一區**：牠不屬於任何棲息地（T125 的圖鑑也是獨立一區）。
- **村莊卡片不加**：村莊沒有野外魔物，硬加一列「0／0」只會讓人以為漏了什麼。

## Notes

- 檢查器：全新存檔 → 7 個有魔物的區域都有進度列、點數等於 `REGION_MONSTERS` 長度、全暗、
  文字 `已記錄 0／N 種 · 擊殺 0 次`、村莊沒有那一列、頁尾「首領尚未挑戰」；
  指定 `state.codex` 只給草原前兩種 → 草原「亮亮暗」與 `已記錄 2／3 · 擊殺 3 次`，
  其他區域仍全暗（避免全部亮起來的假過關）；`bossKills=2` → 頁尾「首領已擊敗 2 次」。
- 改完 `state.codex` 要 `Escape` 關掉再開地圖，面板才會重畫。
- 檢查器直接 import `src/lore.js` 的 `REGION_MONSTERS` 當期望值，所以棲息地調整時會自動跟上。
