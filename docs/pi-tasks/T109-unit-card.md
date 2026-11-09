# T109 點選單位小卡

Status: done
Type: ui
Accept: `node tools/checks/unit-card.mjs && npm run verify:quick`

## Goal

在世界裡點一位獵人，現在會**整頁跳進獵人名冊**（`openHunter`）。玩家只是想看一眼這個人是誰、血量多少，卻被抽離世界、還要自己按回來——這是主畫面最突兀的一段互動。這一輪把它改成「點一下就開一張小卡」：

1. 小卡貼在畫面左下、底欄上方，內容：頭像、名字、`Lv.N`、狀態標籤（待機／狩獵中／戰鬥中…）、
   `職業 · 近戰/遠程 · 性格`、生命條＋`hp/maxHp` 數字、攻擊／防禦／轉世。
2. 生命條跟 `state` 同步：低於 35% 轉色、0 轉暗；每幀只更新寬度與數字，不重建 DOM。
3. 換點另一位獵人 → 同一張卡換內容；點空白處、按 ✕、按 Esc 都會收起來。
4. 想看完整資料（飽食／精力／心情、裝備、技能、修煉）按「詳細」，才會跳進原本的詳情面板。
5. 手機上小卡橫幅貼在底欄上方，不蓋住 地圖／暫停／速度 三顆浮動鈕（T96 的教訓）。

## Files

- `src/pixel-ui.js`：
  - `handleWorldSelect(id)`：`hunter:<id>` → `showUnitCard(id)`（不再 `openHunter`）；其他情況先 `hideUnitCard()`；
    點空白（`id === null`）也收起。
  - 新函式 `showUnitCard / unitCardPaint / hideUnitCard / unitCardHunter`：卡片是按需建立、關掉就整個移除
    （沒開卡片時 DOM 裡沒有 `#unit-card`，按鈕爬蟲不會多撿到兩顆按鈕）。
  - `doAction` 新增 `unitDetail`（收起小卡 → `openHunter`）與 `unitCardClose`。
  - `frame()` 每幀 `if(unitCardEl) unitCardPaint()` 更新生命條；Esc 先收小卡（面板開著時仍由面板處理）。
- `src/pixel-style.css`：`/* ===== T109：點選單位小卡` 區塊（`#unit-card` 與 `.uc-*`），
  手機一段（≤760px）改成兩列、按鈕列獨占一列、`≥26px` 觸控尺寸。
- `src/pixel-world.js`：新增驗收用匯出 `unitRects()`（回傳目前這一幀裡獵人的可點矩形），
  跟既有的 `hitRects()`／`signRects()` 同一個用途；檢查器用它換算畫面座標，才不會點到旁邊的建築。
- `tools/checks/unit-card.mjs`（新）。

## Decisions

- **不加「雙擊才開名冊」**：多一個手勢要學；「詳細」按鈕就在卡上，路徑單一。
- **卡片只用畫面左下**：那裡原本是 log（`#notice-feed`），小卡疊在上面一排 40px，不影響 log 位置；
  手機則整條橫幅，因為 402px 寬塞左半邊會擠成三行。
- **生命條每幀只改 `style.width` 與文字**：這張卡會跟著戰鬥一直更新，重建 innerHTML 會讓捲動與 hover 抖。
- **點空白一定收起**：世界點選本來就會送 `null`，不收起的話卡片會一直留著擋視線。
- **`unitRects()` 是為了驗收才加的**：沒有它只能自己重算投影，實測點下去常常選到獵人背後的建築（
  那其實是遊戲既有的行為：建築的可點矩形很大，會蓋住站在前面的獵人）。

## Notes

- 第一版 CSS 寫 `bottom:calc(var(--bb) + 40px)`，但 `--bb` 只在手機/矮螢幕的 media query 內定義，
  桌機是 undefined → `bottom` 整條失效、卡片跑到 static 位置（畫面外觀看等於沒有卡片）。
  改成 `var(--bb,100px)`，檢查器也補上「卡片底端必須貼在底欄上方 130px 內 + 左緣 8px」的斷言，
  否則這類「元素存在但位置錯」的 bug 檢查器會全過。
- 檢查生命條時要先 `state.paused = true`：獵人會回血，暫停前設 25% 等 260ms 已經回到 35% 以上，
  會誤判成「沒轉色」。
- 世界點選的 hit test 由後往前找第一個命中的矩形，建築與獵人都在同一份 `hits` 裡；
  驗收請用 `unitRects()`，不要用 `project()` 自己算。
