# PixelLab UI 零件：要生什麼、用什麼參考圖、prompt

> **先講現況**：PixelLab 帳號餘額 `generations 0 / 2000`、`credits.usd -0.0148`，
> 呼叫 `POST /v2/generate-ui-v2` 直接回 **402 Insufficient resources. Remaining: 0**。
> 所以**現在生不了**，要等月度重置或加值。下面是等額度回來就能照著跑的完整設計。

## 0. 生 UI 的兩個端點與花費

| 端點 | 用途 | 尺寸 | 花費 |
|---|---|---|---|
| `POST /v2/generate-ui-v2` | 文字 → 單一 UI 元件（按鈕、血條、對話框…），可吃 `concept_image`／色盤 | 16–512（方形） | 未標示，屬 Pro 級 |
| `POST /v2/create-ui-asset` | 形狀模板 → 整塊面板（可帶 `pieces`／`elements` 切出按鈕、tab、血條），可吃 `style_image` | 192–688 | **10–25 generations**（官方標示） |

**最省的第一發**：`generate-ui-v2`，`image_size 96×96`，只生一個**主按鈕**。
理由：單一元件、尺寸最小、我們 UI 最常重複使用的就是按鈕（狀態：一般／hover／按下／停用）。

## 1. 要生的零件（依效益排序）

### 第一批：骨架（先這 3–4 個就能組出整個介面）
| # | 零件 | 建議尺寸 | 為什麼先做 |
|---|---|---|---|
| 1 | **主按鈕（金色 CTA）** | 96×48 / 192×64 | 玩家最常點、決定「想不想按」 |
| 2 | **次按鈕（木質）** | 96×48 | 一般動作鍵，跟 CTA 成對 |
| 3 | **面板框（九宮格木牌）** | 192×192（可切 9-slice） | 所有視窗／卡片的外框 |
| 4 | **資源條底（chip）** | 192×48 | 上方金庫／星晶／木材／鐵礦 |

### 第二批：圖示（16–24 px，可一張圖集）
金幣、星晶、木材、鐵礦、獵人、鎚（建設）、劍（狩獵/競技）、捲軸（委託）、鐵砧（製作）、地下城門、暫停、倍速、
稀有度徽章（rare/superior/heroic/legendary 四級）。

### 第三批：狀態與質感
血條／經驗條（底＋填色＋描邊）、Tab 選中態、Tooltip 尖角框（九宮格）、對話框、Loading 進度條、
Toast 底板、選取光環（單位／建築）。

## 2. 參考圖（哪個檔案餵哪個欄位）

| 目的 | 檔案 | 餵哪個欄位 |
|---|---|---|
| 對齊遊戲的像素密度／描邊／明暗 | 實機截圖 `ui-mockups/world.jpg`（1440×900） | `style_image`（create-ui-asset）／`concept_image`（generate-ui-v2） |
| 對齊「我們想要的 UI 外觀」 | 風格稿截圖 `ui-mockups/_preview/ui-v1-木牌金箔.png` | 同上（**更推薦**：直接告訴它我要長這樣） |
| 色盤 | `#2a1c10 #4a3320 #6b5236 #a8844e #c9a468 #e7be5e #f3d994 #f0e7c9` | `target_palette.colors` |

⚠️ 參考圖**只給風格**（palette／像素比例／描邊／明暗），不要讓它抄構圖 —— prompt 裡要寫明 `copy ONLY the palette, pixel scale, outline weight and shading; do NOT copy its layout or any icons`。

## 3. Prompt（英文，可直接貼）

### 3.1 主按鈕（第一發，最小成本）
```
Pixel art UI button for a cozy pixel-art village-building RPG, front view, flat and readable.
Shape: one horizontal rounded-rectangle button, wide 2:1, with a 3 px dark-brown near-black outline,
a carved wooden body (#4a3320 to #6b5236), a thin brass inner line (#c9a468) and two small brass rivets
in the left and right corners. The face is a warm golden plate (#e7be5e with a #f3d994 highlight on the top
edge and #a8844e shadow on the bottom edge), so it reads as the primary call-to-action. Slight 2 px bevel,
hard pixel edges, no gradients, no dithering noise, no texture beyond 3 flat shades.
Transparent background, no text, no icon, no drop shadow, nothing touching the canvas edge, centered with
4 px empty margin. Palette of at most 10 colours. Style reference: copy ONLY the palette, pixel scale,
outline weight and shading of the reference image; do NOT copy its layout or any icons.
```
再各生一次，把最後兩句換成狀態（同一顆按鈕的三態）：
- hover：`brighter face (#f6d27a) and a 1 px inner glow line`
- pressed：`face sunk by 2 px, bottom bevel removed, top inner shadow #7a5c2c`
- disabled：`desaturated grey-brown face (#5f5b4c), no highlight`

### 3.2 面板框（九宮格）
```
Pixel art UI panel frame for a pixel-art village RPG, front view, made to be cut into a 9-slice.
Shape: a rectangular wooden signboard panel with a 4 px near-black outline, a carved plank body
(#3a2816 with 3 flat shades and faint vertical grain), a brass border line (#c9a468) inset 2 px,
and 4 brass corner brackets. The centre area must be a clean flat dark wood colour (#2c1e0f) with NO
ornament, so text can be drawn on it. Corners are square with a 2 px chamfer, edges are perfectly straight
and tileable. Hard pixel edges, no gradients, no blur, no dithering, at most 12 colours.
Transparent background outside the frame, no text, no icons, nothing touching the canvas edge.
Style reference: copy ONLY palette, pixel scale, outline weight and shading; do NOT copy layout.
```

### 3.3 資源條 chip
```
Pixel art UI resource chip for a pixel-art village RPG: a small horizontal pill-less bar, 4:1, with a
2 px dark outline, a recessed dark slot (#241a10) and a thin brass rim (#a8844e), sized to hold one 16 px
resource icon on the left and a number on the right. Hard pixel edges, 3 flat shades, at most 8 colours,
transparent background, no text, no icon, nothing touching the canvas edge.
```

### 3.4 圖示（一次一張，16×16 或 24×24）
```
Pixel art game icon of a {GOLD COIN | BLUE GEM | WOOD LOG | IRON ORE | HOODED HUNTER | WAR HAMMER |
CROSSED SWORDS | SCROLL | ANVIL | DUNGEON GATE}, 16x16, single object, centred, thick near-black outline,
3 flat shades, warm slightly muted palette, no text, transparent background, nothing touching the edge.
Style reference: copy ONLY palette, pixel scale, outline weight and shading from the reference image.
```

## 4. 建議流程（省錢）

1. `generate-ui-v2` 96×96 生**主按鈕**（1 發）→ 我驗收：像素密度、描邊、色盤、能不能 9-slice。
2. 過了再把它當 `style_image`，生面板框與資源條（各 1 發）。
3. 三件都對，才用 `create-ui-asset`（10–25 gen）生**整組帶切件的面板**，一次拿到 button／tab／health bar／avatar。
4. 圖示最後做，一張 16×16 一張，或用「16×16 圖集」一次生 8 個再切。

## 5. 驗收標準（我這邊會檢查）

- 色盤 ≤12 色且不超出上面那組（餵 `target_palette` 強制）
- 描邊 1–2 px、深棕近黑，不是純黑
- 邊緣乾淨、可切九宮格（四邊像素整齊、四角對稱）
- 放大 4× 不出現半透明／模糊／雜點
- 放進 1440×900 的實機截圖上，跟木造建築擺一起不突兀
