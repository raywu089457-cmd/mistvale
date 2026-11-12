# 暮影村 UI 主題原型比較（2026-11-10）

> 需求（使用者，2026-11-10）：「可以完全更換主題，只要適合遊戲場景美術風格」。
> 上一份素材調查是 [UIUX-FREE-ASSETS-2026-11-10.md](UIUX-FREE-ASSETS-2026-11-10.md)。
> 這份只回答一件事：**把整組 UI 換成免費素材做出來的主題，哪一套真的適合暮影村的場景美術。**

## 1. 結論

| 排名 | 主題 | 一句話 | 處置 |
| --- | --- | --- | --- |
| **1** | **B・Mana Soul（金箔細工版）** | 深墨底＋雙線金框＋四角捲草；像鑲嵌木件，和村莊的金線木作同一語言 | **建議當新預設主題** |
| 2 | A・Golden UI（暗版・雕木黃銅） | 實心木帶＋黃銅邊條、蠟封紅關閉鈕；更厚更「櫃體」，但裝飾密度低於 B | 可當季節／尊爵版備案 |
| 3 | 現在（深墨＋1px 金線） | 乾淨、好讀，但框體最薄，最不像場景裡的木作 | 維持現狀也是安全牌 |
| ✗ | C・Dragon Regalia | 雕花厚框＋斜角，密度爆掉：12px 中文被框吃掉、卡片出現接縫 | 淘汰（只適合當節慶皮膚） |

三套素材都是 **CC0**（可商用、可改、不用署名，但遊戲 credits 建議寫一下作者）。

## 2. 判斷標準

1. **場景自己的 UI 語言**：村莊名牌＝深色半透明板＋1px 金邊＋金字；底部列＝磚木牆上的深色方塊鈕＋金邊。所以主題要「深底、金線、木質」，不要亮色面板。
2. **材質密度要跟場景同級**：建築是 2–4px 細節的厚塗像素，UI 只有 1px 線會顯得「太文青」；但 12px 中文四周留白只有 ~10px，框太厚會壓字（C 的致命傷）。
3. **12px 中文字重排**：卡片內寬一縮就會出現「雪怪、冰甲／蟲」這種斷字，可接受但不能常態。
4. **在真遊戲 1x 看**：所有原型都用 Playwright 蓋在真 build 上截 1440×900，不是單獨看素材。

## 3. 三套原型怎麼做的

### 3.1 為什麼需要 bridge.css

現在的線上 build 已經不是 `--ui-px-*` 九宮格合約（那份是舊的 `src/pixel-style.css`）：

```
src/pixel-style.css → src/ui-kit.css        # 24×24 零件、slice 8、面板 3px／按鈕 2px
                    → src/ui-kit-extra.css
                    → src/ui-tone.css       # border-image:none !important、1px 金線、漸層
                    → src/ui-motion.css → src/ui-grain.css
```
`#game-ui` 還帶 `zoom:1.15`，所以 `getComputedStyle` 回的是未縮放長度。

實測：把每個 `--ui-px-*` 變數塗成品紅再截圖，畫面幾乎沒變 → **只改變數的 theme.css 在現在的 build 完全無效**。
因此每個原型都多一支 `bridge.css`：用 `html body …` 拉高 specificity ＋ `!important`，把面板／卡片／按鈕／提示板等真實選擇器重新指回主題零件，並壓掉 ui-tone 的漸層與 1px 邊。這是原型能看的前提，也是正式導入時要放進 build 的東西。

### 3.2 三套的零件與切片

| | A・Golden UI 暗版 | B・Mana Soul（調校後） | C・Dragon Regalia |
| --- | --- | --- | --- |
| 出處 | <https://opengameart.org/content/golden-ui>（Buch） | <https://tiopalada.itch.io/tiny-rpg-mana-soul-gui> | <https://opengameart.org/content/tiny-rpg-dragon-regalia-gui> |
| 授權 | CC0 | CC0（作者要求：不餵生成模型、不做幣圈用途） | CC0 |
| 視窗 slice／尺寸 | 14（40×40） | **22（46×46）** | 22（9SlicesB） |
| 卡片 | 10（28×28） | **12（26×26）** | 16（9SlicesC） |
| 按鈕 | 8（28×28） | 12（96×25） | 12 |
| 方塊／頁籤 | 10（28×28） | 18（38×38） | 18 |
| 提示板 | 10（28×28） | 14（70×30） | 14 |
| 凹槽 | 8（24×24） | 8（106×32） | 8 |
| 關閉鈕 | 22×22（畫成 2×） | 32×32 鑽石＋底板 | 34×33 金幣合成 |

重上色全部照場景色票：木 `#2a1c10/#4a3320/#6b5236`、黃銅 `#a8844e`、金 `#c9a468`、亮金 `#e7be5e`、淡金 `#f3d994`、墨 `#22110a`、羊皮紙 `#f0e7c9`。A 另有「亮版」被否決（橘琥珀太飽和、字對比掉一級）。

### 3.3 各主題的實話

- **B・Mana Soul（推薦）**：第一版太「描邊」，22px 框帶只有兩條 1px 線，比場景木作輕一級。調校後框帶改成 3 階金色斜角（亮金→金→黃銅）＋內側墨溝，四角用素材原本的捲草，卡片加 1px 金色嵌線，關閉鈕加底板。現在讀起來像「鑲金木櫃」，和村莊的金線木作同一個語言；底部列方塊鈕、頂欄資源晶片是全場最強的部分。
  - 仍待處理：hover/pressed/disabled 目前用遊戲自己的 brightness 濾鏡（素材有 4 態圖，要拆成 4 條 CSS）；`.square` 37×37 只能整張貼 38×38 方塊；手機（`html.ui-m` 36px slice）未驗。
- **A・Golden UI 暗版**：形狀是「實心木帶＋黃銅邊條」，蠟封紅關閉鈕很好看；暗版把橘琥珀壓回場景木色後，文字對比問題解決，但失去一半「換了新主題」的訊號 → 結論是「deluxe／季節皮膚」，不是原生皮膚。
- **C・Dragon Regalia**：重上色成功（洋紅/青全部歸零），但素材密度轉不過來：12px 斜角＋22px 角花在 1440×900 像「手遊移植」，34px 晶片內寬只剩 ~10px；卡片的兩色內裡在 460×190 拉伸會出現橫向接縫。淘汰。
- **現在**：不是「不好」，是「最薄」。若不想冒險，維持現狀完全合理。

## 4. 建議與導入計畫

**建議：B 當新預設主題，A 暗版留下來當節慶／豪華皮膚。**

導入（低風險做法，只加不刪）：

1. 新增 `src/ui-theme.css`＝`output/uiux-free-assets/theme-mana/bridge.css` 的內容（零件已內嵌成 data URI），並用 `@media (min-width:761px) and (min-height:521px)` 包住 → **手機維持現在的零件不動**。
2. `build.mjs` 在 `ui-grain.css` 之後多讀一行 `ui-theme.css`，確保主題最後載入（打贏 ui-kit／ui-tone 的 `!important`）。
3. 卡片文字斷字：已從 16px 框帶改成 12px（素材重切 26×26 角花），重排回到可接受。
4. 驗證：`npm run verify`（UI 變更走完整 12 分鐘版）＋ `node pipeline/scripts/ui-audit/shots-all.mjs desktop`、`phone` 各截一輪，用 `output/ui-audit/verify-summary.md` 第一行當證據。
5. 之後再補：按鈕 4 態、`.square` 專用小板、手機 slice 組、把關閉鈕換成素材的紅蠟封（A 的優點）。

**風險**：`src/ui-tone.css` 今天 20:47 還被另一條工作在改；主題層放最後雖然能覆蓋，但兩邊同時動 CSS 會互相蓋掉驗證截圖。要動之前最好先確認那條線收工。

## 5. 檔案索引

| 檔案 | 內容 |
| --- | --- |
| `output/uiux-free-assets/demo/final-theme-stack.png` | 全螢幕三向比較（現在／A 暗版／B 調校後） |
| `output/uiux-free-assets/demo/final-elements-2x.png` | 2× 元件比較（標題帶／卡片／底部鈕／頂欄晶片） |
| `output/uiux-free-assets/demo/final-3way-modal.png` | 庫房彈窗特寫三向比較 |
| `output/uiux-free-assets/theme-mana/` | B 的 pieces、theme.css、bridge.css、shot.mjs、notes.md（含實測邊框寬） |
| `output/uiux-free-assets/theme-golden/` | A 的亮版／暗版兩種 pieces 與 shots |
| `output/uiux-free-assets/theme-dragon/` | C 的實作與淘汰理由 |
| `output/uiux-free-assets/theme-spec.md` | 11 個零件＋CSS 變數合約（原型共同規格） |
