# PixelLab 生成的 UI 素材清單

生成方式：`POST https://api.pixellab.ai/v2/create-image-pixflux`（**依生成次數計費**，`/v1/balance` 顯示 0 或負數也能用）。
Token 由環境變數 `PIXELLAB_TOKEN` 提供，**不要寫進 repo**。

統一提示詞骨架（保證同一套視覺）：

> pixel art game <物件>, single object centered, transparent background, empty background,
> thick 1px black outline, readable at small size, dark fantasy palette of gold steel and dark leather,
> no frame, no border, no text, no shadow

## 已上線

| 類別 | 數量 | 檔案 | 接入方式 |
| --- | --- | --- | --- |
| UI 圖示 | 21 | `output/pixellab-ui/icons32/*.png` | `src/ui-icons.js`（base64 內嵌）→ `setIcons()` 有圖就用 `<img class="ui-ico">`，其餘維持 canvas |
| 職業徽章 | 6 | `output/pixellab-ui/emblems/*.png` | 同上，鍵名 `em-<classId>`，直接對上既有 `iconHTML('em-'+classId)` |
| 稀有度寶石 | 5 | `output/pixellab-ui/gems/*.png` | `src/ui-tone.css`：`.rarity::before` ＋ `[data-rarity="…"]` 選色，不改模板 |
| 開場插畫 | 2（晝／夜） | `output/pixellab-ui/title/title-a|b.png` | `src/ui-tone.css` `#title-screen`（`.ts-night` 切換） |
| 載入插畫 | 1 | `output/pixellab-ui/title/title-a.png` | `src/ui-tone.css` `#loading` 全幅背景 |

## 已入庫、尚未接入

| 類別 | 數量 | 檔案 | 建議用途 |
| --- | --- | --- | --- |
| 建築插圖 | 14 | `assets/ui-buildings/*.png`（等角 64×64 ＋ `manifest.json`） | **藍圖預覽**：點空地時顯示「蓋起來會長這樣」＋花費；或建築詳細頁插圖 |

注意：建設彈窗的卡片縮圖刻意**繼續用世界裡的同一張 sprite**，保持「卡片與畫面一致」；AI 插圖用在只有選取時才看到的場合。

## 已驗證但不可用的方向

- **AI 面板框 9-slice**：拉伸後雕花糊成水平線、生成物偏冷藍與暖金主題衝突 → 已回退（見 commit `417f4e1`）。結論：AI 素材適合固定尺寸物件與大面積氛圍圖，不適合需要伸縮的框。

## 回退方式

- 圖示／徽章：刪除 `src/ui-icons.js`
- 主題／插畫／寶石：刪除 `src/ui-tone.css` 對應的 `/* ===== ... ===== */` 區塊
- 建築插圖：`assets/ui-buildings/` 目前未被執行期引用，刪除不影響執行
