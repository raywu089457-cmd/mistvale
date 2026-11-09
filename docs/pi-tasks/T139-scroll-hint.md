# T139 面板捲動提示＋捲軸樣式

Status: done
Type: ui / design-system
Accept: `node tools/checks/scroll-hint.mjs && npm run verify:quick`

## Goal

很多面板的內容比視窗高（魔物圖鑑在 1440×900 下超出 1353px、手機超出 2229px），但畫面上
**完全看不出可以往下捲**：內容被面板下緣直接切掉，玩家以為就這樣了。
另外 Windows Chrome 的預設捲軸是寬大的淺灰色，跟像素風介面完全不搭。

這輪：

1. 面板可捲動時，下緣出現「▾ 還有內容」提示（上緣淡出漸層，不擋點擊），捲到底自動收起。
2. 捲軸樣式改成細的深色金屬：`scrollbar-width:thin`、`scrollbar-color:#8a6a36 #241a10`，
   `::-webkit-scrollbar` 另外指定 10px 寬、金色漸層 thumb（手機 6px）。
3. 捲到邊界時不要連鎖捲動到頁面（`overscroll-behavior:contain`）。

## Files

- `src/pixel-index.html`：`#modal-content` 後面加
  `<div id="scroll-hint" class="scroll-hint" aria-hidden="true"><b>▾</b><span>還有內容</span></div>`。
- `src/pixel-ui.js`：
  - `syncScrollHint()`：比較 `scrollHeight - clientHeight`，把 `#modal` 的 `data-scroll` 設成
    `"1"`（可捲）／`"end"`（捲到底）／空字串（放得下），並切換 `#scroll-hint` 的 `hidden`。
  - `openModal()` 尾端（`focusModalStart(prev)` 之後）呼叫一次；`window` 捕獲階段監聽 `scroll`
    （`e.target.id === 'modal-content'`）再同步——面板內容是每次重畫重建的，用事件委派最省。
- `src/pixel-style.css`：檔尾 T139 兩塊（捲軸、提示）。
- `tools/checks/scroll-hint.mjs`（新）。

## Decisions

- **提示而不是「內容一定塞得下」**：圖鑑、名冊、設定本來就長；硬縮字級會傷可讀性。
  給「還有內容」提示比改版面誠實。
- **提示用 `pointer-events:none`**：它壓在內容最後一列上，會擋到按鈕的話比沒有提示更糟
  （檢查器直接驗「提示蓋住的那點，關閉鈕仍點得到」）。
- **`data-scroll="end"` 而不是直接移除元素**：狀態留在 DOM 上，檢查器與之後的除錯都看得到
  現在是哪一種狀態。
- **捲軸同時寫 `scrollbar-width/color` 與 `::-webkit-scrollbar`**：前者是新 Chromium／Firefox
  的標準寫法，後者給舊版；headless 用覆蓋式捲軸，所以驗收改用 computed style 而不是截圖像素。

## Notes

- 檢查器驗（桌機＋手機）：圖鑑可捲動且有提示（文字、貼在面板下緣、不擋點擊）、
  捲軸 `scrollbar-width:thin` 與 `scrollbar-color:rgb(138, 106, 54) …`、捲到底 `data-scroll="end"`
  且提示收起、把內容換成短的一段後提示消失（`data-scroll` 清空）。
- **踩到的坑**：我一開始拿「設定面板」當「放得下」的例子，結果設定面板內容也超出 546px
  ——測試前提不成立。改成在頁面裡直接把 `#modal-content` 換成一小段內容、再丟一個 `scroll`
  事件觸發同步，才測到「放得下」那條分支。
- 提示的 `hidden` 是 JS 切的，CSS 另外寫 `.scroll-hint[hidden]{display:none}`，
  避免 `display:flex` 蓋掉 `hidden` 的預設行為。
