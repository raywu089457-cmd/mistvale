# T117 讀取畫面

Status: done
Type: ui
Accept: `node tools/checks/loading-screen.mjs && npm run verify:quick`

## Goal

讀取畫面是玩家看到的第一個東西，但它原本是：

```
◆
Loading          ← 中文遊戲第一眼是英文詞
[==========]
100%
```

改成一個像樣的第一印象（村莊插畫本來就在背景）：

1. 標題 **暮影村**（用 `--font-title`，30px、字距 .18em、金色描邊陰影）＋副標 **獵魔物語**。
2. 進度條下方一列左右對齊：`載入素材 42%`（左）／`預熱角色素材`（右，`#loading-phase` 本來就有更新，只是 markup 裡沒有這個節點）。
3. 最底一行**輪播提示**，每 2 秒換一則，順便教一件遊戲的事（拖曳平移、點建築升級、三人地下城、交易所收購、建築等級、手機搖桿）。
4. `prefers-reduced-motion` 時提示只換字不做淡入；載入完成／失敗時停掉輪替計時器。
5. 手機：標題 24px、進度條 200px、提示最多 `100vw-64px`。

## Files

- `src/pixel-index.html`：`.loading-plate` 內容換成標題／副標／進度條／`.loading-meta`（label＋phase）／`#loading-tip`。
- `src/pixel-ui.js` `bootWhenReady()`：`label` 改寫成 `載入素材 NN%`；新增 `TIPS` 與 `tipNext/tipStop`（2 秒輪替，完成或失敗時停）。
- `src/pixel-style.css`：檔尾 T117 區塊（標題／副標／meta 列／提示、手機、減少動態）。
- `tools/checks/loading-screen.mjs`（新）。

## Decisions

- **中文標題而不是把 "Loading" 直譯「載入中」**：這是品牌畫面，寫村名比寫「載入中」有意義；進度資訊由下面那列負責。
- **提示用輪播而不是固定一句**：載入時間長短不定，一句話只講一件事；六則循環覆蓋最常被問的操作。
- **不去改 `MIN_SHOW_MS`**：快取命中時畫面只露 600ms 是刻意的（不要為了看動畫拖慢進場），提示輪播在這麼短的時間內至少會露出第一則。
- **階段文字放右邊**：`#loading-label` 已經是百分比，兩個數字並排會互搶；右邊放「預熱角色素材／角色／整理素材」這種進行式說明。

## Notes

- `#loading-phase` 在 `bootWhenReady()` 裡一直有 `set(phaseEl, p.phase||'整理素材')`，但 markup 從來沒有這個節點（`set()` 對 null 靜默跳過），所以階段文字以前根本沒顯示過。
- 提示輪替用 `setInterval`，一定要在 `start()`（以及失敗分支）清掉，不然進村後還會繼續換一句看不見的字。
- 檢查器靠 `page.route('**/media/**')` 把大圖延遲 1.2 秒，才留得住讀取畫面；不然本地載入太快（<1s）根本量不到。
- 量到的東西：標題文字與字體家族、副標、`載入素材 \d+%` 格式、階段非空、提示開頭是「提示：」且 2.3 秒後換過、進度條寬度介於 0 與軌道之間、面板水平/垂直置中、手機不溢出、載入完成 `#loading` 從 DOM 移除。
