# PixelLab 生的 UI 零件

## 2026-10-27 第一發：主按鈕（最小花費試作）

- 端點：`POST /v2/generate-ui-v2`（比 `create-ui-asset` 的 10–25 gen 便宜）
- 尺寸：128×64、`no_background: true`
- 參考圖：`concept_image` = 我們自己的 UI 風格稿按鈕截圖（424×102，Playwright 元素截圖）
- 色盤鎖定：`target_palette` = #2a1c10 #4a3320 #6b5236 #a8844e #c9a468 #e7be5e #f3d994 #f0e7c9（≤10 色）
- **花費：10 generations**（帳號 2：951.65 → 941.65），一次回 4 個變體
- 產出：`generated/btn-0..3.png`（128×64 RGBA，透明背景）
- 總覽：`generated/_4variants.png`（4 倍放大並排）、`generated/_in-context.png`（放進風格稿的樣子）

### 四款評語
| # | 外框 | 適合 |
|---|---|---|
| 0 | 圓角木框＋黃銅釘，最乾淨 | **主按鈕首選**（可切九宮格、放大不糊） |
| 1 | 四角黃銅支架、木紋橫條 | 面板外框感，適合當 modal 邊框 |
| 2 | 方角木框＋兩側直木條 | 次按鈕／工具列按鈕 |
| 3 | 四角捲草紋＋左右箭頭翼 | 太華麗，適合「首領挑戰」這種特殊 CTA |

### 已知問題
- 金色面板偏亮、偏平：當 CTA 的「按下去」重量感不夠 → 之後要加深主色（或程式加內陰影）
- 這是「靜止態」；hover／按下／停用三態還沒生（可以程式做，省 30 次生成）

## 2026-10-27 第二發：整組 UI 零件（一發 16 件）

- `POST /v2/generate-ui-v2`、**512×512**、一次產 4 個變體，其中第 0 張就是一整張 **4×4 UI kit**。
- 花費：**25 generations**（941.65 → 916.65）。平均 **1.6 次／零件**，比一個一個生便宜 6 倍。
- prompt 寫法：明確列出「4×4 格、每格一個零件、不要文字、不要編號」，並逐格描述內容；
  `target_palette` 鎖 12 色（木頭／黃銅／金／藍寶石）。
- 切圖：`ui-assets/parts/*.png`（16 件，自動去邊）
  `btn-primary` `btn-secondary` `btn-close` `chip`
  `panel-large` `panel-small` `bar-health` `bar-progress`
  `tab-idle` `tab-active` `slot` `tooltip`
  `icon-coin` `icon-gem` `icon-wood` `icon-ore`
- 預覽：`ui-assets/index.html`（零件總覽 ＋ 用這批零件排出來的視窗）

### 用起來的狀況
- 面板框可以當 **9-slice**（`border-image: url(panel-large.png) 14 fill stretch`），四角黃銅支架不會變形
- 按鈕／tab／chip／slot／icon 都可以直接用；按鈕目前只有「靜止態」
- 還缺：hover／按下／停用三態、稀有度徽章、小地圖框、下拉選單、勾選框、捲軸、貨幣增減數字

### 花費累計
| 項目 | generations |
|---|---|
| 主按鈕 4 變體（128×64） | 10 |
| 整組 16 件（512×512） | 25 |
| **合計** | **35**（剩 916.65） |

## 2026-10-28(3) — 「解析度要跟建築一樣細」：AI 做不到，改用程式畫

實測 PixelLab 的內部像素塊大小（用 unfake.detect_grid 量）：

| 產出 | 畫布 | 原生像素塊 | 一顆按鈕的邏輯像素 |
|---|---|---|---|
| 第一發 kit | 512×512 | 11.7 px | ~9 × 5 |
| 加大畫布重畫 | 688×344 | **7.0 px** | ~98 × 49 |
| 1:1 要求 | 256×96 | 9.7 px | ~26 × 10 |
| **建築本體** | 1120×1400 | **4.0 px** | **280 × 350** |

→ 模型的像素塊固定在 7–11 px，不管畫布多大或怎麼寫 prompt 都不會更細；
一顆按鈕最多 ~98 個邏輯像素，建築是 280。**密度差 3 倍以上，追不到**。

改用 `ui-assets/draw_parts.py`（純程式、0 成本）畫 1 px 細節的零件：
`fine/panel.9s.png`（48×48 九宮格）、`btn-primary/secondary`（96×40）、`chip`、`tab`／`tab-on`。
全部 1 px 描邊、1 px 高光、木頭 3 階、黃銅 2 階，跟建築同一個像素密度。

遊戲已換成這批（面板 9-slice slice 16、按鈕 slice 10、chip 6/12、tab 10）。
AI 生的零件保留在 `ui-assets/parts/`，小尺寸元素（稀有度徽章、圖示）還是用 AI 版 —— 那個尺寸看不出密度差。

## 2026-10-28(4) — 圖示：試過程式畫，**結果比原本的 AI 圖示差**，先不採用

`ui-assets/draw_icons.py` 畫了 30 個 16×16 圖示（金幣、星晶、木材、鐵礦、獵人、鎚、鐵砧、捲軸、骷髏、
雙劍、地下城、地圖、齒輪、治療、號角…），全部 1 px 描邊、同一組色盤。接進遊戲後實測：
**在 26 px 顯示尺寸下，程式畫的形狀（鎚＝方塊＋木棍、地下城＝方框）明顯比原本 AI 圖集差**。

→ 圖示維持原本的 AI 圖集（`assets/icons@1x.png`），程式畫的 30 個留在 `ui-assets/fine-icons/`
（`draw_icons.py` 可再改形狀後重生）。介面外框（面板／按鈕／chip/tab）維持 1 px 細像素版本。

結論：**大面積的外框值得自己畫（密度差 3 倍會看出來）；16–26 px 的圖示看不出密度差，形狀好不好看更重要。**

## 2026-10-28(5-6) — 圖示 v2（三階立體）＋ 第三發零件（Toast／載入條／危險按鈕）

- `draw_icons2.py`：31 個圖示重畫成「上緣亮／本體／下緣暗」三階，形狀重排（鎚子真的像鎚子、鐵砧有砧面、
  地下城是拱門、捲軸有軸心、金幣有內圈）。已接進遊戲（`[data-icon]` 用 background-image，隱藏 AI 圖集畫布）。
- 第三發 `generate-ui-v2`（512×256、**25 generations**）：Toast 底板×3（黃銅/紅/琥珀）、緞帶標題、
  載入條空槽＋金填充、危險按鈕、清單框。已接：Toast（成功／錯誤）、載入條、`.pixel-button.danger`。
- 累計花費：**145 generations**（剩 806.65）。

## 2026-10-29 — Pixen 文字生圖：便宜又是 1 px 細節，外框全面換新

- 走 PixelLab **MCP**（`https://api.pixellab.ai/mcp`，`ui-assets/pixen/mcp.py` 直接講 JSON-RPC）的 `create_image_pixen`：
  **1 generation／張**，256×256＋`no_background` 一張出 2×2 四個零件（`sheets.py` 有 prompt 與 seed）。
- 關鍵發現：Pixen 出圖是**原生 1 px 像素**（色塊長度中位數 2 px、46% 是單一像素），不是 `generate-ui-v2` 的 7–11 px 大塊
  → 上面 (3) 說「AI 做不到建築密度」那個問題，換 Pixen 就解了，外框不必再用程式畫。
- 生了 4 張（`pixen/kit1.png`、`buttons.png`、`frames.png`、`bars.png`），共 **4 generations**＋試 Pixflux 1 次（帳號 1 的每日紅利，沒花錢）。
  Pixflux（加 `color_image` 鎖色）顏色很搭但形狀全變方框、背景沒去 → 不用。
- 切出來的零件 `assets/ui/px-*.png`（舊零件都留著）；`prep_parts.py` 另外用本機調色做兩個變體（不花錢）：
  `px-tile-on`（木方塊→金，亮度對應金按鈕自己的顏色）、`px-toast-err`（黃銅邊→紅）。
- 九宮格切角（零件原尺寸）：視窗 22、卡片 16、按鈕 12、木方塊 18、提示板 14、凹槽 8。
  桌機 border 寬＝切角（1:1，像素不變形）；手機沿用原本的 border 寬（縮小顯示，版面不動）。

| 零件 | 用在 |
|---|---|
| `px-window` | 視窗、建築資訊、委託面板（內側改深色 #2a1c12，卡片才浮得出來） |
| `px-card` | 獵人／建築／製作／訪客卡、材料、隊伍選擇（選取＝金色外光） |
| `px-btn-wood` / `gold` / `red` | 次要／主要／危險按鈕（滑過變亮、按下變暗、停用變灰；不再「滑過就變金色」） |
| `px-btn-x` | 視窗與建築資訊的關閉鍵 |
| `px-trough` | 上方資源欄、難度、人口、區域徽章（原本唯一的藍色）、進度條底 |
| `px-tile` / `px-tile-on` | 下方選單（目前這頁＝金）、技能鍵、小方鍵（設定、縮放、說明、暫停、速度） |
| `px-toast` / `px-toast-err` | 提示 |
| （同上零件） | 分頁（未選＝木按鈕、選中＝金按鈕，原本選中是藍色）、獵人詳情數值格（卡片框）、交易數量欄（凹槽） |

- 舊主題剩下的藍色一併拿掉：區域徽章、分頁、獵人詳情頭像底（改暖色光暈）。

- 同一批也做了可讀性：桌機量到一百多處 8–10px 的字 → 最小 11px（toast 12px），只挑量到的元素（`#modal small` 這種大範圍會把 17px 的數值也縮小，別用）；「村莊金庫」小字桌機也拿掉。
- 驗收：`Claude code/mistvale-ui-audit/audit.mjs`（加了 desktop-1440x900／1280x720），跟換之前比沒有新的蓋住／超出／截斷。
