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
