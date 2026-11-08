# T99: roster: desktop hunter cards use the empty right column for combat stats

Status: done
Accept: node tools/checks/roster-layout.mjs && npm run verify:quick

## Goal

桌機（>=761px）的獵人名冊卡片右側還有一大塊空白（約卡片寬度的 35–40%）：名字/等級/稀有度/狀況都擠在立繪旁邊的左欄，右邊什麼都沒有。把這一塊變成一小組戰鬥資料，讓玩家一眼比較六位獵人；手機版維持現在的樣子（窄卡不放）。

卡片結構 `.hunter-head`（名字＋職業徽章）、`.hunter-body`（立繪 + 資料 + 新的資料欄）、底部生命條都不動；只在 `.hunter-body` 裡多一欄 `.hunter-stats`。

`.hunter-stats` 內容（由上到下、右對齊、總寬約 74–86px）：

1. `攻擊` 圖示（`iconHTML('atk')`）＋數值 `h.attack`，10px 等寬數字，顏色 var(--text-dim)
2. `防禦` 圖示（`iconHTML('def')`）＋數值 `h.defense`，同上
3. 射程小標籤：`CLASSES.find(c=>c.id===h.classId).range >= 3 ? '遠程' : '近戰'`，用現有 `.trait` 風格的小 chip，10px
4. 性格：`TRAITS.find(t=>t.id===h.trait).name`，10px、var(--text-mute)，一行不換行（放不下就省略號）

規則：

- 只在 `@media(min-width:761px)` 顯示 `.hunter-stats`；<=760px 設 `display:none`（不要靠縮小字硬塞）。
- `.hunter-meta` 在寬卡上改成兩欄：`grid-template-columns:minmax(0,1fr) auto`，左欄原本三行不動，右欄就是 `.hunter-stats`。
- 資料欄右緣要和卡片內距（padding 13px）對齊，誤差 <=6px；四行之間 `gap:4px`，字不可小於 10px。
- 卡片高度可以增加，但同一列六張卡高度必須一致（grid 已 stretch，不要寫死高度）；`.hunter-stats` 不得溢出卡片、不得壓到生命條。
- 給資料欄加 `aria-label="攻擊 N 防禦 N 近戰/遠程 性格 X"`；圖示 `aria-hidden`。
- 不要動 `data-action="hunter"`、`data-id`、`miniRoster()`、左側迷你名冊，也不要改現有 `.tiny-health` 共用樣式。

## Files you may change

- `src/pixel-ui.js`（`type==='hunters'` 卡片模板裡 `.hunter-body` 那段 `listHTML`）
- `src/pixel-style.css`（`.hunter-stats` 與 `@media(min-width:761px)` 區塊，接在現有 T98 獵人卡片規則後面）
- `tools/checks/roster-layout.mjs`（擴充檢查）

## Steps

1. 先讀 `src/pixel-ui.js` 的 hunters 卡片模板與 `src/pixel-style.css` T98 那段，確認 `.hunter-body` 目前是兩欄 grid。
2. 模板加 `.hunter-stats`（四項），圖示沿用現有 `iconHTML`。
3. CSS 加寬卡兩欄與 `.hunter-stats` 樣式；手機 `display:none`。
4. 擴充 `tools/checks/roster-layout.mjs`：
   - 1440x900：六張 `.hunter-card` 都有 `.hunter-stats`，四個項目都在、文字沒被裁掉（`scrollWidth <= clientWidth+1`）、右緣與卡片內距對齊（誤差 <=6px）、沒有超出卡片。
   - 402x712 與 360x640：`.hunter-stats` computed `display === 'none'`，卡片版面與現在一致（chips 5/4、卡片不溢出）。
5. 跑 Accept；要拼圖就輸出 `output/roster/montage.png`。
