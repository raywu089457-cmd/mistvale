# T118 像素字型（Ark Pixel）正式上線

Status: done
Type: ui / font
Accept: `node tools/checks/type-system.mjs && node tools/checks/roster-layout.mjs && node tools/checks/party-pick.mjs && npm run verify:quick`

## Goal

使用者 2026-11-09 選了「好用 ark pixel」（m03892）。上一輪（T114）只是把文字階層與稀有度色票整理好，
這一輪真的把字型換成 **Ark Pixel 12px（OFL 1.1，可自由散布）**，並處理換字型必然帶來的版面 fallout：

1. 只嵌入用得到的字：從 `src/`、`assets/`、`docs/` 收集 1916 個字，用 fontTools 子集化
   → `assets/fonts/ark-pixel-12-zh_tw.woff2`（55 KB）、`ark-pixel-12-mono-zh_tw.woff2`（55 KB）。
   授權原文放在 `assets/fonts/OFL.txt`。
2. `src/pixel-style.css` 開頭加兩個 `@font-face`（`'Ark Pixel 12'` / `'Ark Pixel Mono 12'`，
   `font-display:block` 避免載入時先閃一次平滑字），`--font-ui` / `--font-title` / `--font-num` 都改成
   以它們為首選，後面保留系統字做 fallback。
3. 字級全部收成 12 的倍數（像素字型在非整數倍尺寸會糊）：`--fs-tiny/small/body/h3` = 12px、
   `--fs-h2/title` = 24px；46 個 `font-size` 與 34 個 `font:` 簡寫統一改成 12px；標題類 17px→24px。
4. `build.mjs` 把 `assets/fonts/*.woff2` 複製到輸出 `media/fonts/`（跟圖一樣走外鏈，不塞進 HTML）。
5. 12px 比原本的 10～11.5px 寬 15～20 %，固定欄寬的卡片會被撐爆，補上「放寬容器」而非縮字的版面補償：
   名冊卡片改兩欄（≥761px 與手機）、派遣／地下城／競技場隊員卡桌機兩欄、≤460px 單欄、
   360px 名冊單欄；`hunters-fold` 的短螢幕規則同步。

## Files

- `src/pixel-style.css`：檔頭 `@font-face`、字級 token 改 12/24、46+34 處字級改寫、T118 版面補償區塊。
- `src/pixel-ui.js`：無功能改動（字型由 CSS 繼承）。
- `build.mjs`：`media/fonts/` 複製字型（缺檔會警告）。
- `assets/fonts/ark-pixel-12-zh_tw.woff2`、`ark-pixel-12-mono-zh_tw.woff2`、`OFL.txt`（新增）。
- `output/ark-chars.mjs`（字集收集腳本，未進版控的必要性低，留在 output）。

## Decisions

- **選 12px 而不是 10px**：Ark Pixel 10px 版也有，但遊戲目前的內文是 11px、標題 15～17px；
  10px 版等於把整體縮小，12px 版剛好落在「略大一點但仍在同一密度」，而且 12px 在 1080p 可讀性最好。
- **字級只收回 12 與 24**：像素字型是為整數像素設計的，13/15/17px 會被瀏覽器平滑成糊字。
  代價是一些原本 15～17px 的標題變大（24px），我另外把 `.rd-head h3`、`.quest-step h3` 收到 12px 避免過重。
- **版面用「放寬容器」補**：把 12px 縮回 11px 等於白換字型；改成兩欄／單欄讓每列有足夠寬度，
  資訊量不變、字也不用縮。
- **canvas 上的世界文字這一輪不動**：`src/pixel-world.js` 的建築標籤、`dgText`、小地圖區域名
  以及 `src/pixel-ui.js:749` 都還是硬寫系統字型。它們是 canvas 繪製、尺寸隨鏡頭連續變化
  （`Math.round(size*2*k)`），換成像素字型反而會在非整數倍尺寸下糊掉；要做得正確得先渲染成
  離屏 12px 再整數倍放大，屬於另一輪。**DOM 文字與 canvas 文字目前會有一點字型不一致**，這是已知取捨。

## Notes

- 檢查器 `tools/checks/type-system.mjs` 原本斷言 `.modal-title h2` 字級；24px 版面下仍通過。
- 換字型後的連帶修正（都是「檢查器抓到的真問題」）：
  - `party-pick`: 402px 兩欄隊員卡只剩 70px 給攻防射程 → ≤460px 改單欄；桌機 3 欄只剩 117px → 改 2 欄。
  - `unit-card`: 世界裡兩個單位重疊時，點 A 可能被後畫的 B 接到（既有行為），檢查器改成
    以「卡片上顯示的那位」對照 state，並記錄實際點到誰。
  - `hit-feel`: `step()` 原本同步跑 30 幀（牆鐘不到 600ms），抖動衰減看的是 `performance.now()`，
    機器快的時候「600ms 後歸零」會假失敗；改成每步之間等 16ms。
- 像素字型在 **dpr 1** 的 Windows 上仍有灰階反鋸齒（瀏覽器把 outline 字型點陣化），
  1:1 看是清楚的、放大才看得出來；dpr 2 會完全對齊像素格。
- 字型調校的地方只有兩處：`--fs-*` token 與 `@font-face`；要換 10px 版只需改 token 與字型檔。
