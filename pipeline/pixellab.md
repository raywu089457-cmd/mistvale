# PixelLab 管線（第四套生圖／動畫來源）

[PixelLab](https://www.pixellab.ai) 是專門做像素遊戲素材的 AI 服務 —— 角色、動畫、圖集、地圖。
我們的用途：**把角色的動作（尤其走路）做出來**，因為純提示詞生圖擋不住「左右腳要交替」。
2026-10-10 起付費 Tier 1（$12/月，2000 次生成），tokne 放 `C:\Users\ray\.pixellab-token`。

### 計價與餘額怎麼看（2026-10-12 實測）

- **API 跟你手動在網頁生是同一個錢包**：API token 就是帳號頁那串 Secret（同一支 UUID）。
  官方 MCP 文件也寫「API 生的角色會出現在網頁的 Character Creator 裡（同一個帳號）」。
  差別不在「用 API 還是用網頁」，在**選了哪個工具／模式**：
  `template` = 1 generation／方向、`v3` = `ceil(畫布²×格數/65536)`／方向、`pro` = 10–25／方向。
- **查餘額**：`GET https://api.pixellab.ai/v2/balance`
  ```json
  {"credits":{"type":"usd","usd":4.24},
   "subscription":{"type":"generations","status":"active","plan":"Tier 1: Pixel Apprentice",
                   "generations":0.0,"total":2000.0}}
  ```
  官方 schema 寫得很清楚：`subscription.generations` = **本期剩下的 generation**（不是已用）；
  `credits.usd` = 美元餘額（額度用完以後就從這裡扣）。
- **每一次生成的回應都有一行 `usage`** 告訴你這次扣了多少（`{"type":"generations","generations":1}`
  或額度用完後的 `{"type":"usd","usd":0.005}`）—— 要估成本就看這行，不要猜。
- **查角色／下載圖檔完全免費**（`GET /characters`、`/characters/{id}`、方向圖與動畫格的 URL）——
  只有「生成」才扣。補抓既有素材＝ 0 元。
- 實測（額度用完後、直接扣美元）：`POST /v1/estimate-skeleton` 被收 **$0.005072**，
  餘額 12 秒後從 4.247544 → 4.242472（= 餘額更新有幾秒延遲）。
- **「訂閱 vs 美元」到底差多少**：官方 API 定價頁 <https://www.pixellab.ai/pixellab-api> 右上有一个
  **「Credits／Generations」單位切換**，兩邊同時擷下來就能算單價（範本存下來了）：
  `output/pixellab-incoming/ref/{pixellab-api-pricing.md,pricing-body-usd.txt,pricing-body-generations.txt}`。

  | | 單價 |
  |---|---|
  | 訂閱內（$12 ÷ 2000 次）| **$0.006／generation**（固定）|
  | 扣美元餘額（官方定價頁換算）| **$0.003–0.02／generation**，看工具跟尺寸 |

  我們最常用的兩個：
  - `POST /v2/create-character-v3` 128×128 ＝ **$0.042 ＝ 3 generations → $0.014／次**（≈ 訂閱價 2.3 倍）
  - `POST /v2/animate-character` 128×128、template 模式 ＝ **$0.0145 ＝ 1 generation → 2.4 倍**
  - pro-flash 系列反而比訂閱便宜（例如 `create-object-pro-flash` 128×128 ＝ $0.029／6 generations ≈ $0.005／次）

  → **API 本身不比訂閱貴**（同一個端點、同一本帳，網頁生跟 API 生扣的次數一樣）；
  貴的是「額度用完、改成扣美元」那條路。以常用工具算約 **2–2.5 倍**。
  定價頁自己註明 “Example estimates, not fixed prices…pricing is provisional”，所以當量級參考。

> **一句話：要「內建骨架／動作模板」→ 走 v2（=`v2_client.py`）；要「自己控制每一格的關節點」→ 走 v1（=`pl_client.py`）。**

---

## 1. 服務的五個介面，功能各在哪

| 介面 | 位置 | 有什麼 |
|---|---|---|
| **Creator**（網頁） | `pixellab.ai/create` | Create（文字生圖／風格參考／圖轉像素／肖像↔角色）、Rotate（8 方向）、Animate（**Animate with text V3／PixMiniMax**、Interpolate、Animated object）、Edit（AI edit／Edit animation／Transfer outfit；**Inpaint 在 Creator 不能用**）、UI、Map、Cleanup（去背／減色／像素修正／Unzoom） |
| **Editor**（網頁，Pixelorama 的 Godot/WASM 版） | `pixellab.ai/editor` | 左側列：Create／UI／Edit／Rotate／Animate／Map／Inpaint／Cleanup。**Animate 裡才有 `Animate with Skeleton` 與 `Animation to Animation`**（＝模板骨架那套）。它是 canvas app，沒有 DOM，只能靠點座標自動化 |
| **Aseprite 外掛** | 桌面 Aseprite 1.3+ | 功能最完整，含 `Re-pose`（只有 Aseprite 有）；骨架存在「Pose - PixelLab」圖層。**Aseprite 試用版不支援外掛** |
| **MCP** | `https://api.pixellab.ai/mcp` | **不是獨立功能** —— 它就是 API v2 的 MCP 包裝。工具說明書：`/mcp/docs` |
| **REST API** | v1 `api.pixellab.ai/v1`、v2 `/v2` | v1 = 舊的單步生成；**v2 = 角色庫 ＋ 内建動作模板**（MCP 打的就是這套） |

---

## 2. 端點對照（我們實測過的）

### v1（`pl_client.py`）

| 端點 | 做什麼 | 限制 |
|---|---|---|
| `GET /balance` | 查餘額 | — |
| `POST /estimate-skeleton` | 從圖反推 18 個關節點 | **這就是 PixelLab 的「內建骨架」估計**，0.1 次額度 |
| `POST /animate-with-skeleton` | 照關節點生圖 | **剛好 3 格**／16,32,64,128,256 正方形／支援 init＋inpainting＋mask＋指定色盤 |
| `POST /animate-with-text` | 文字生動畫 | **只能 64×64**、一次回 4 格、`start_frame_index` 續生 |
| `POST /inpaint`、`POST /rotate` | 遮罩重畫、轉方向 | — |

### v2（`v2_client.py`）—— MCP 背後那套，100 個端點

| 端點 | 做什麼 | 成本 |
|---|---|---|
| `POST /v2/create-character-v3` | 一張圖 → 4／8 方向角色（也接受你已畫好的方向圖） | `ceil(w·h·方向數/65536)`；128×128 四方向＝**2** |
| `POST /v2/animate-character` | 對角色套**内建動作模板** | **1／方向**（template 模式） |
| `POST /v2/characters/animations` | 同上，可選 `mode`：template／skeleton-v3／v3／pixminimax | v3：4–16 格；pixminimax：4–40 格 |
| `POST /v2/animate-with-text-v3` | 文字生動畫，最大 256×256 | 128×128×8 格 ≈ 2／方向 |
| `POST /v2/animate-pixminimax` | MiniMax 模型，4–40 格 | beta，Tier 1+ |
| `POST /v2/animate-with-skeleton-v3` | **一幀一個骨架**（不是 v1 的 3 格）＋ `first_frame_keypoints` ＋ `template_id`（mannequin／bear／cat／dog／horse／lion） | beta |
| `GET /v2/characters/{id}/spritesheet`、`/zip` | 匯出 | 免費 |

**内建動作模板**（`template_animation_id`）走路相關：
`walk`、`walk-1`、`walk-2`、`walking`、`walking-2` … `walking-10`、`walking-4-frames`／`6`／`8-frames`、
`sad-walk`、`scary-walk`、`crouched-walking`、`running-4/6/8-frames`；
其他幾十種：`breathing-idle`、`cross-punch`、`high-kick`、`roundhouse-kick`、`leg-sweep`、`backflip`、
`front-flip`、`two-footed-jump`、`running-jump`、`taking-punch`、`falling-back-death`、`getting-up`、
`picking-up`、`fireball` …（完整清單見 MCP 說明書或 `get` 回傳的動畫資料）

### 實測對照（2026-10-10）

| 走路怎麼生 | 結果 | 成本 |
|---|---|---|
| `animate --template walking-8-frames`（内建模板）| 能生、角色一致，但**步幅很小**（腳部寬 34–39 px）、角色會變小（109 px）、筆觸變軟 | 1／方向 |
| `animate --action walking`（**v3 模式，不給 template**）| **好得多** —— 獵魔人 8 格 256 px、腿真的在動、大衣摆動；純文字戰士 8 格 172 px 也順 | 〜2／方向 |
| `animate --mode pixminimax --action ...` | 4–40 格，beta，Tier 1+ | 依尺寸 |

→ **要走路就用 v3（不給 `--template`）**；内建模板只在「要 1 次額度生一個方向」時才用。

### 純文字生單張圖（`image`）

```bash
python -X utf8 pipeline/scripts/pixellab/v2_client.py image <輸出目錄> --size 160 --model pixen   --view "high top-down" --direction south --detail "highly detailed" --outline "single color outline"   --desc "<英文描述>"
```

| 模型 | 端點 | 行為 | 尺寸 |
|---|---|---|---|
| `pixen` | `/v2/create-image-pixen` | **同步回傳**（`{"image": {...}}`，不是背景工作）| 16–512，邊長 4 的倍數，任一邊 <32 時要正方形 |
| `pixflux` | `/v2/create-image-pixflux` | 同步 | 32×32–400×400 |
| `pro` | `/v2/create-image-pro-flash` | 背景工作（要輪詢）| 可附 style_image |

- `view`：`side`／`low top-down`（約 20°）／`high top-down`（約 35°，RO 那種斜上方視角）
- `direction`：八方向；`south` = 正面朝鏡頭
- `outline`：`single color black outline`／`single color outline`／`selective outline`／`lineless`
- `detail`：`low detail`／`medium detail`／`highly detailed`
- **1 張 = 1 generation**

**實測（RO 風格戰士正面圖，2026-10-10）**：160 px、pixen、high top-down、south →
角色 109×143 px、88 色，大頭大眼＋飽和暖色＋柔順陰影，風格到位。
產物 `output/archer-demo/pixellab/warrior-ro/`（4 個 seed 並排 `variants.png`）。

### 純文字建角色（不需要任何參考圖）

```bash
python -X utf8 pipeline/scripts/pixellab/v2_client.py create \
  --desc "young warrior, short messy silver-white hair, cream cloth short tunic, brown leather chest harness, brown leather belt, brown leather gloves, cream trousers, brown leather boots, no helmet, no weapon, neutral standing pose" \
  --name warrior-text-v1 --directions 8 --view "low top-down" --size 128
```

- **`--directions` 必須 8**（沒給參考圖時只支援 8 方向，給 4 會回 422：
  「direction_images and n_directions=4 need reference_image」）
- 成本＝1（Pixen 生正面）＋ `ceil(size²·8/65536)`；128 px → **3 次**，約 3 分鐘
- 實測（`output/archer-demo/pixellab/warrior-text-v1/`）：8 方向一致、**5–6 頭身不是 Q 版**、
  服裝細節（米白短上衣、棕色皮綁帶、手套、靴）都出來；輸出 64 色，要自己量化
- `proportions` 只有 MCP 有，REST v2 不收（會 422 extra_forbidden）
- 生出角色後用同一個 character id 就能生動作：
  `python pipeline/scripts/pixellab/v2_client.py animate <id> --action walking --directions east`

---

## 3. 我們的流程

```
pipeline/scripts/pixellab/
  pl_client.py      v1：token 讀取、balance、estimate-skeleton、animate-with-skeleton、base64 進出
  v2_client.py      v2：create（建角色）/ animate（套内建模板）/ get / download / list / job

output/archer-demo/pixellab/     ← 這條線的實驗場（成品與中間產物）
  input/            參考圖（warrior-128.png，從 upload/warrior-still-1x.png 置中放進 128 畫布）
  ref/              中性站姿參考圖（ref-c-neutral.png）等
  walk_skeleton.py  依角色比例算 8 格走路骨架（兩段式腿 IK；--spread 放大步幅、--hold 複製某格）
  walk_cycle.py     4 個 3 格視窗串成 8 格（--no-inpaint 才是對的，見下）
  skeleton_anim.py  單一 3 格視窗
  shade_legs.py     用骨架把「遠腳」上陰影（顏色對應表從來源 still 量出來）
  finish_walk.py    量化回 16 色 ＋ 對齊 ＋ 去雜點 ＋ 跑 Forge sheet_qc
  readback.py       用 estimate-skeleton 反讀成品，量每格腳的位置（判斷有沒有換腳）
  v2/               v2 那條線的產物（4 方向角色、内建模板走路）
```

範例：

```bash
# v2：一張圖 → 4 方向角色（2 次額度，約 3 分鐘）
python -X utf8 pipeline/scripts/pixellab/v2_client.py create output/archer-demo/pixellab/input/warrior-128.png \
       --directions 4 --view side

# v2：套内建走路模板（1 次額度/方向）
python -X utf8 pipeline/scripts/pixellab/v2_client.py animate <character_id> --template walking-8-frames --directions south

# v2：抓下來
python -X utf8 pipeline/scripts/pixellab/v2_client.py download <character_id> output/pixellab/char

# v1：自己算骨架 → 生 8 格走路
cd output/archer-demo/pixellab
python -X utf8 walk_skeleton.py --spread 1.5          # 產生 frames.json ＋ 預覽
python -X utf8 walk_cycle.py pl-walk-04 --frames frames-sp15.json \
       --reference ref/ref-c-neutral.png --no-inpaint
python -X utf8 shade_legs.py pl-walk-04/cycle --frames-file frames-sp15.json
python -X utf8 finish_walk.py pl-walk-04/shaded
```

---

## 3.5 身體模板 + 可替換裝備（2026-10-10 起的新方向）

使用者決定：角色做成**模組化** —— 先生「**只有身體**」的模板（沒有任何裝備），
裝備／武器另外生成成透明分層圖，之後用 anchor 疊上去，遊戲裡就能換裝備不換身體。

### 畫風要照 Bible，不要照外面的 RO 風格

`sprites/SPRITE_VISUAL_BIBLE.md` 第 2 節寫的「獵魔村物語」= **Evil Hunter Tycoon**，就是本專案訂的畫風。
提示詞要**照抄 §2.1 的 `STYLE_H` 原文**（`output/l0veyou/prompts/make_hv_prompts.py` 裡的常數），
後面才接「3/4 側面 / 正面」的視角句與角色描述。重點規格：

| 項目 | 規格 |
|---|---|
| 頭身比 | 英雄約 **3 頭身**：大頭（約身高 1/3）、小身體、厚實 |
| 眼睛 | **小而簡單的點點眼**，不是大眼 |
| 描邊 | 細的**深棕近黑**單線外框（不是純黑粗線）；剪影外圈暗色 ≥ 0.55 |
| 上色 | 材質 3–4 階（Outline／Shadow／Base／Light／Highlight），手點高光；不漸層、不抖動 |
| 色彩 | 暖色、略低飽和；皮膚 `#f2c89b` |
| 色數 | 每角色 ≤16 色（含描邊） |
| 身高 | 上線英雄 64–90 px（`build_hero.py` 整體高 72）；母版 400×400（邏輯 100×100 ×4） |
| 對齊 | 上線：腳底 = 格底上 10 px、軀幹軸 = 格中線；母版：地線 y=368、軸 x=200 |

### 身體模板的提示詞骨架

```
<STYLE_H 原文>
The character: a GENERIC HUMANOID BASE BODY TEMPLATE for a game character, no equipment at all.
IMPORTANT PROPORTIONS: exactly 3 heads tall, a BIG round head that is about one third of the total height,
a short small chunky body, short stubby arms and legs, thick readable silhouette.
Bare head with short simple brown hair, light warm skin (#f2c89b), small simple dot eyes.
Wearing only a plain light-grey sleeveless under-shirt and plain short grey under-trousers,
bare arms, bare hands, bare lower legs and bare feet.
NO armour, NO helmet, NO hood, NO cape, NO belt, NO pouches, NO gloves, NO boots, NO shoes,
NO weapon, NO shield, NO accessories, NO equipment of any kind.
Full body, front view, the character FACES THE VIEWER, arms hanging straight down at the sides,
legs together, symmetrical, neutral standing pose, centred with a small transparent margin all around.
```

```bash
python -X utf8 pipeline/scripts/pixellab/v2_client.py image <輸出目錄> --size 100 --model pixen   --view "low top-down" --direction south --detail "highly detailed" --outline "single color outline"   --seed 31 --desc "$(cat output/archer-demo/pixellab/basebody/prompt-chibi.txt)"
```

**實測**：第一次沒把「3 頭身」寫死 → 出來變 4–5 頭身；把比例寫死＋尺寸改 100 之後就對了
（`output/archer-demo/pixellab/basebody/chibi-*`，chibi-31 最接近：58×94 px、60 色、3 頭身厚實）。

### 裝備分層怎麼接

1. 身體模板定案後，裝備各自生成**透明背景單張圖**：頭盔／胸甲／腰帶／手套／靴／披風／武器
2. 疊圖用專案 `rig.json` 已定義的 anchor：`HEAD · BODY · LEFT_HAND · RIGHT_HAND · LEFT_FOOT · RIGHT_FOOT · WEAPON_GRIP · GROUND`
3. 裝備**不能改骨架**（`BASE_BODY_SPEC.md`）：肩線、腰線、腳底、頭的高度不變，只能加厚輪廓
4. 遊戲端換色組 `meta.groups`：`outfit`（布料色相）、`metal`（鎧甲／刀刃）

## 3.6 裝備分層（`inpaint-v3` ＋ 遮罩 diff）

使用者要的模組化：**一個身體 + 可替換的裝備圖層**（武器／防具分開做，遊戲內換裝不用重生身體）。

### 做法

```
身體圖 ─┐
        ├─► POST /v2/inpaint-v3（inpainting_image + mask_image + 描述）
部位遮罩 ┘        ↓  模型只重畫遮罩區，其他像素不動
                穿上裝備的角色圖
                     ↓ 跟原身體 diff（RGB 差 > 40）
                純裝備圖層（透明背景、位置完全對齊）
                     ↓ 疊圖
                身體 + 任意裝備組合
```

- 實測 diff 只有 **5% 左右**（軀幹盔甲 902 px、頭盔 1959 px、靴 431 px、手套 288 px）
- **payload 格式**：`inpainting_image` / `mask_image` 都是 `{image: {type:"base64", base64}, size:{width,height}}`
  （只給 base64 字串會 422 missing field）
- **`/inpaint-v3` 回 202**（背景工作），不是 200 —— 客戶端的 `post()` 要接受 202
- 回傳欄位是單數 `image`（不是 `images`）
- 遮罩：白色＝要重畫、黑色＝保留；`crop_to_mask` 設 false 才會回整張

### 部位遮罩（128 畫布、角色站中央，`make_equipment.py` 內建）

| 部位 | 範圍 (l,t,r,b) | 用途 |
|---|---|---|
| `head` | 34, 6, 96, 50 | 頭盔／帽子／髮飾 |
| `torso` | 42, 50, 88, 96 | 胸甲／上衣／腰帶 |
| `hands` | 24, 60, 106, 100 | 手套 |
| `feet` | 36, 98, 94, 126 | 靴子 |
| `legs` | 36, 84, 94, 126 | 褲／裙 |
| `back` | 28, 40, 102, 110 | 披風 |
| `weapon` | 全畫布 | 武器（另外對 `WEAPON_GRIP` anchor）|

```bash
cd output/archer-demo/pixellab
python -X utf8 make_equipment.py basebody/ro-character/rotation-south.png head        "a steel knight helmet with a small crest covering the head" equip/front --seed 7
```

產出：`mask-<tag>.png`、`worn-<tag>.png`（模型輸出）、`layer-<tag>.png`（**裝備圖層**）、`composite-<tag>.png`（疊回驗證）。

### 武器

武器不是「穿在身上」，是**獨立道具圖**（`create-image-pixen` 生一把劍、透明背景），
再用 `rig.json` 的 `WEAPON_GRIP` anchor 對到手上（偏移量要手動調一次）。
`/v2/transfer-outfit-v2` 可以把一套裝備搬到整個動畫的所有格。

## 3.7 換裝到整段動畫 ＋ 武器對位

### A. 把裝備套到整段動畫：`/v2/transfer-outfit-v2`

```bash
python -X utf8 pipeline/scripts/pixellab/v2_client.py transfer-outfit <輸出目錄>   --dressed <穿好裝備的角色圖> --frames f1.png,f2.png,f3.png   --instructions "keep the exact same pose, motion, position and ground line of each frame; only change the clothes"
```

| 限制 | 內容 |
|---|---|
| 尺寸 vs 格數 | 32–64 px 最多 15 格／65–80 px 最多 8 格／**81–256 px 最多 3 格** |
| 併發 | **Tier 1 同時最多 8 個背景工作**，第 9 個回 429（客戶端已自動排隊重試）|
| 成本 | 實測 3 格 180 px ≈ **25 次生成** |

實測：8 方向 × 8 格 = **24 個批次 ≈ 600 次生成**（Tier 1 每月 2000）。
批次腳本：`output/archer-demo/pixellab/dress_walk.py`（自動排隊、可續跑）。
輸出 180 px，腳底地線與原動畫一致（只有裝備讓輪廓變寬）。

### B. 武器對到手上：`attach_weapon.py`

```bash
cd output/archer-demo/pixellab
python -X utf8 attach_weapon.py equip/items/image-0.png equip/walk-dressed/south equip/weapon-dressed/south        --hand "RIGHT ARM" --grip 0.20 --scale 0.68 --angle 180 --offset-x -6
```

1. 每格用 **`/estimate-skeleton`** 抓手（`RIGHT ARM`／`LEFT ARM`）座標（**0.1 次生成／格**）
2. 武器圖的「握把點」（高度 × `--grip`）對到手的座標
3. 疊在身體**前面**（照 `sprites/WEAPON_SPEC.md`：武器在身體前、握把永遠在手上、不同角色共用同一把武器）

**踩到的坑**：武器**直立**握著會穿過身體跟臉（角色手就在軀幹旁邊）。
→ 改成 **`--angle 180`（劍尖朝下）＋ `--offset-x` 往外推**，走路時自然垂在身側。

`WEAPON_SPEC.md` 的 `WEAPON_GRIP` anchor 範例（弓手 rig.json）：`[59, 50]`（100 px 格座標）。

## 3.8 換裝的三條路，成本差 20 倍

| 做法 | 每套裝備成本（8 方向 × 8 格）| 品質 | 什麼時候用 |
|---|---|---|---|
| **`/create-character-state` ＋ `animate-character`** | **~40 次生成**（state 10–25 ＋ 走路 16）| **最好**：裝備真的畫在身上、跟著姿勢；武器自然握在手上 | 主力裝備、整套換裝 |
| `/transfer-outfit-v2`（把外觀套到既有動畫）| ~600 次生成（24 批次 × 25）| 好，但只是把外觀重繪 | 已經有動畫、只想換皮 |
| 遊戲內錨點疊圖層（`meta.actions[act].head` 那套）| **0 次** | 中：剛體對位，手腳不會隨姿勢變形 | 飾品、換色、大量小裝備 |

### A. `create-character-state`（推薦）

```bash
python -X utf8 pipeline/scripts/pixellab/v2_client.py state <character_id>   --edit "wearing a steel plate chest armour with round pauldrons, brown leather gloves and boots, holding a longsword in the right hand, no helmet"   --name armoured
# → 回新的 character_id（同 group），8 方向全部改好
python -X utf8 pipeline/scripts/pixellab/v2_client.py animate <新的 character_id> --action walking --directions south,east,...
```

- **同一個編輯會一致套用到全部 4/8 方向**（官方說明）
- `use_color_palette_from_reference: true`（預設）會鎖住原角色色盤，不會換裝就變色
- `override_frame_size`：裝備會超出原畫布時（大劍、翅膀）要放大畫布
- 實測：128 px 身體 → 換裝 state **約 25 次生成**、2.5 分鐘；之後 8 方向走路約 16 次
- 小瑕疵：偶有雜訊（橘色細線、白色雜點）出現在個別方向，重跑該方向即可

### B. 遊戲內疊圖層（現成機制）

`src/pixel-world.js` 已經有配件槽：`meta.actions[act].head` 是**每格的頭頂錨點**，
配件圖 `assets/heroes/accessories.png` 依錨點畫上去（可鏡像、不旋轉）。
另外 `meta.groups = {outfit, metal}` 是**執行時改色盤**（買鎧甲→布料更飽和、買武器→金屬變金），完全不用新素材。
要擴充成多槽位（torso／hands／feet／weapon）就是：加每格錨點陣列 ＋ 繪圖順序；手腳會轉動的部位要再加角度值。

## 4. 踩過的坑（別重踩）

1. **`animate-with-skeleton` 的 inpainting 接續會鎖住相位** —— 把前一格凍住當續接，模型會順著同一相位滑下去，第二半不會換腳。**去掉 inpainting 才會真的換腳**（實測：f0 左腳 x=82 → f4 右腳 x=81）。
2. **模型會照抄參考圖的姿勢**。拿跨步中的圖當參考，不管骨架怎麼擺它都維持「原本那隻腳在前」。**解法：先用中性站姿（雙腳併攏）當參考**，姿勢才會由骨架驅動。
3. **位置是可信的、身分不是** —— 反讀證明腳會落在骨架指定的位置（±0.6 px），但模型不會自己把遠腳畫暗，所以眼睛看不出哪隻腳是哪隻。**陰影要自己上**（`shade_legs.py`）。
4. **内建動作模板的步幅是為小尺寸角色調的** —— 套到 128 px 角色上只有 34–39 px 步幅（自己算的是 43–57 px），會變小碎步。
5. **v2 的 `create-character-v3` 把側面圖當成 south** —— 側面參考進去，整套方向標籤會偏 90°，要自己重貼方向名。
6. **`animate-with-text`（v1）只能 64×64** —— 細節會被吃光；`start_frame_index` 續生會回同一組 4 格，只能 4 格循環。
7. 免費方案：**總共 14 次**生成（定價頁寫 40，實際不是）、同時只能跑 1 個（429 要重試）。

---

## 5. 現況（2026-10-11 更新）

### 匯出檔 → 遊戲職業 sheet：`pipeline/scripts/pixellab/build_class_sheet.py`

PixelLab 網站上按 Export 下載的 zip（`export_version 3.1`）內容長這樣：

```
<id>/rotations/{south,north,east,south-east,north-east,...}.png   8 方向站姿（128 或 256）
<id>/animations/{Walking,walking}/<方向>/frame_000..007.png        每方向 8 格走路（180）
```

一行指令變成遊戲要的格式（cell 100、腳底距底 8、palette、groups）：

```bash
python pipeline/scripts/pixellab/build_class_sheet.py \
  --source output/pixellab-incoming/5955ea9f --name sorcerer
```

它做的事（每一步都有理由，不是流水線）：

| 步驟 | 為什麼 |
|---|---|
| 整數 2:1 降採樣 | 匯出圖是 2 倍放大（一個美術像素佔 2×2）。用 LANCZOS 會產生中間色與柔邊，量化救不回來 |
| 每**列**同一個位移 | 走路的擺動腳本來就比支撐腳高，若每格都把最低點壓到地面線，身體會隨步伐上下抖 |
| 中軸用「不透明像素 x 的中位數」 | 比 bbox 中心穩：手／腳擺動不會拉著它跑 |
| 缺側面自動鏡像 | 遊戲左半邊本來就是「右邊的列 + 程式鏡像」，自己翻是等價的 |
| hurt／victory／death 確定性合成 | PixelLab 目前沒有這些動作；倒下是「以腳底為軸旋轉」，不是假裝的生成動畫 |
| 24 色（不是 16） | 這批來源有 ~35 色，壓到 16 會把劍刃／金屬反光吃掉 |
| `material_groups()`（沿用 `build_hero.py`） | 讓稀有度換色（outfit 色相偏移／武器變金）還能作用 |

**沒有的列**：attack／skill —— PixelLab 沒生。執行期 `actRow()` 會退回 idle
（以前 `sheetFrame()` 回 null 就是整隻不畫、人消失；已改成有退路）。

### 職業對照（2026-10-11 滙入；同日晚上補完動作列）

| 下載的 zip | 角色 | 進遊戲的職業 | 目前的列 | 走路方向 |
|---|---|---|---|---|
| `3d3020ce…` | 兕帽刺客 | `assassin`（街頭 NPC）| 13（完整）| 8 |
| `5955ea9f…` | 金髮紫袍法師 | `sorcerer` 魔法師 | 13（完整）| 8 |
| `d06dcc3a…` | 銀甲劍盾騎士 | `paladin` 聖騎士 | 13（完整）| 8 |
| `788cd873…` | 斗篷弓手 | `ranger` 遊俠 | 13（完整）| **8**（2026-10-12 補抓 north／east）|
| `witchhunter-east.zip` | 獵帽十字弩 | **未採用**：只有 4 方向待機、沒走路 | — | — |
| `assets_2026-10-11.zip` | 弓手走路條圖（跟 `788cd873` 同一隻）| 參考用 | — | — |

**沒有素材的職業**：`berserker` 狂戰士、`archer` 弓箭手、`witchhunter` 獵魔人（維持原本的 Q 版 sheet）。
祭司 `priest` 依指示回復成原本的樣子（之前是刺客走路＋舊牧師戰鬥列的合並版）。

### 補抓角色缺的方向（2026-10-12：ranger 的 north／east）

第一批滙出時 `788cd873`（斗篷弓手 → `ranger`）只生了 6 個方向的走路（缺 **north**、**east**），
當時的處理是「east 用 west 鏡像、 walkUp 用 l0veyou 生」。後來 PixelLab 帳號裡這兩支真的生出來了，
所以補抓回來、重跑一次 sheet——動作全部是同一套模型、同一隻角色，走路 8 方向終於一致。

```bash
# 1) 先看帳號裡現在有幾個方向（缺的會少在 directions 裡）
python -X utf8 -c "import sys;sys.path.insert(0,'pipeline/scripts/pixellab');from v2_client import get;\
d=get('/characters/788cd873-13f0-4f73-ad2f-ad27374e2467');print([x['direction'] for a in d['animations'] for x in a['directions']])"

# 2) 只抓缺的方向（腳本會跳過已存在的檔）→ output/pixellab-incoming/<id>/animations/Walking/<方向>/frame_000..007.png
#    （v2_client.py download <id> <目錄> 會把整個角色抓下來，方向名照 PixelLab 原樣）

# 3) 重跑 sheet → 再補回 attack／skill
python pipeline/scripts/pixellab/build_class_sheet.py --source output/pixellab-incoming/788cd873 --name ranger
python pipeline/scripts/pixellab/add_battle_rows.py --hero ranger --action attack --source output/l0veyou/gen-ranger-attack.png
python pipeline/scripts/pixellab/add_battle_rows.py --hero ranger --action skill  --source output/l0veyou/gen-ranger-skill.png
```

- 方向標籤跟遊戲的對應：`south`→walkDown、`north`→walkUp、`south-east`→walkDownRight、`north-east`→walkUpRight、
  `east`→walk（遊戲的側面列；左半邊一律用同一個列＋程式鏡像）。所以 `walk` 列的內容必須是**面向畫面右邊**。
- 驗收：舊列備份在 `output/archer-demo/pixellab/_backup/ranger-old.{png,json}`；新舊逐列比對的結果是
  「只有 `walk`／`walkUp` 換掉，其餘 9 列位元完全相同（attack／skill 遮罩相同、只是色盤從 162 色變 199 色）」、
  `walk` 列跟舊的（＝west 鏡像）IoU 0.69、跟自己的鏡像只有 0.51 → 朝向沒被改到。

### 缺的動作怎麼補：`add_battle_rows.py`

PixelLab 版只有待機＋走路，缺 **attack／skill**（遊戲戰鬥必定會用到）。
這些用 l0veyou（`pipeline/scripts/l0veyou/generate.mjs`，CDP 9447 已登入的分頁）生，再用
[`add_battle_rows.py`](../scripts/pixellab/add_battle_rows.py) **加一列**上去：

```bash
python pipeline/scripts/pixellab/add_battle_rows.py --hero sorcerer --action attack \
  --source output/l0veyou/gen-sorcerer-attack.png
```

- 不重跑 `build_hero.py`（那會把 PixelLab 的原生像素換掉）；只把新的一列接在 sheet 最下面。
- 去背／切格沿用 `build_hero.cut`（模型不會剛好畫在等分格上，它會找最小前景的切線）。
- 縮到「跟本體一樣高」→ alpha 二值化 → **顏色映射到這隻角色自己的色盤**（不是通用 16 色，所以金屬反光不會被吃掉）。
- 對齊：不透明像素 x 的中位數 → 格中心；腳底 → 地面線（跟其他列同一條）。
- attack／skill 的 `release`／`impact` 沿用舊規格（4／5、frameTime 0.075），才跟遊戲的命中時機一致。
- 走路列（walkUp）帶 `cycle:85`，跟 PixelLab 的走路列同一個步幅，兩種素材混著用不會打滑。

**品質決定（使用者指示：畫質不能降）**：`build_class_sheet.py` 預設**不量化**（`--colors 0`），
2:1 降採樣是**整數抽取**、不內插也不改顏色 —— 那是把 PixelLab 的 2 倍放大圖取回原生像素，不是降級。
（一時間我壓過 24 色，金屬反光被吃掉；已改回原色全留：360／226／162／198 色。）

### 踩到的坑

- **l0veyou 目前約 2/3 機率回「图片生成失败，请稍后重试」**（連一顆蘋果都會失敗）—— 它是間歇性的，
  寫個重試迴圈（最多 5 次）就過得去。HANDOFF 前一天記的也是同一件事。
- **參考圖只保住畫風、保不住所有細節**：第一版我把魔法師寫成「尖嬽巫師帽」，生成出來的每格都戴帽，
  但 PixelLab 那隻是**光頭金髮**（沒帽）→ 待機與攻擊一換就不同人。改正提示詞（明寫 no hat）重生才對。
- **背面走路很難生**：l0veyou 第一版只給 6 格、角色還變成別人的白抜風。改成 4×2、把身分（棕色皮甲、
  棕斗篷、金髮、長弓）寫死、逐格描述兩腳交替才對。

| 產物 | 狀態 |
|---|---|
| `output/archer-demo/pixellab/pl-walk-04/final/` | 自算骨架的 8 格走路（戰士實驗，未進遊戲）|
| `output/pixellab-incoming/` | 2026-10-11 從 Downloads 解的 6 個 zip、提示詞、參考圖、驗收截圖 |
| `assets/heroes/{sorcerer,paladin,ranger,assassin}.{png,json}` | **已在遊戲裡**（各 13 列，完整套）|
| `output/l0veyou/gen-<職業>-<動作>.png` | attack／skill 的生圖原檔（`gen-ranger-walkUp.png` 已用不到：北向改用 PixelLab 的 `north`）|

**還沒做**：獵魔人的走路、弓手與狂戰士的 PixelLab 版本、攻擊／技能列的風格再統一
（l0veyou 生的那幾列跟 PixelLab 的手感仍有差異）。

### 狂戰士走路實測（2026-10-12：内建模板模式、實測價格）

使用者指示：「用便宜模式生成狂戰士走路動畫」—— 狂戰士在 PixelLab 帳號裡本來沒有角色，
所以是「用遊戲現有的狂戰士（Q 版正面圖）建角色 → 再套内建走路模板」：

```bash
# 1) 參考圖：遊戲 sheet 的 idleDown 第 1 格（100×100）置中貼進 128 畫布
#    output/pixellab-incoming/ref/berserker-input-128.png
python -X utf8 pipeline/scripts/pixellab/v2_client.py create \
  output/pixellab-incoming/ref/berserker-input-128.png --directions 8 --view "low top-down" \
  --size 128 --name "berserker-trial" --desc "chibi berserker, spiky brown hair, ..."
#    → character_id a994d80e-614e-45ba-8146-e9fc3fe9bafe（3 分 30 秒）

# 2) 走路：内建模板（template 模式 = 1 generation／方向）
python -X utf8 pipeline/scripts/pixellab/v2_client.py animate <id> --template walking-8-frames --directions south
python -X utf8 pipeline/scripts/pixellab/v2_client.py animate <id> --template walking-8-frames \
  --directions south-east,east,north-east,north,north-west,west,south-west     # 一次送 7 個方向，2 分 11 秒
```

**實測花費（餘額差額，不是定價頁的估計值）**：

| 項目 | 實收 |
|---|---|
| `create-character-v3` 128×128、8 方向 | **$0.0365** |
| `animate-character` template 128×128 × 8 方向 | **$0.0678**（≈ $0.0085／方向）|
| 整個實驗合計 | **$0.104** |

→ 定價頁對 template 128×128 寫「$0.0956／方向」，**實際約 1/11**。定價頁的 USD 數字是上限級的估計，
當量級參考就好；真正的價格一定以每支回應的 `usage` 行＋餘額差額為準。

**踩到的坑（重要）**：`GET /v2/balance` 的美元餘額是**延遲入帳**的 ——
單筆呼叫完 25 秒去看可能**完全沒動**（我第一次就據此誤報了「$0.058」）。要量價格就**等 1–2 分鐘再查**，
或看同一批次後續補上的差額。

**成品**：`output/pixellab-incoming/berserker-trial/`（8 方向旋轉 ＋ 8 方向 × 8 格走路）、
`berserker-walk-8dir.gif`（8 方向並排走）、`berserker-walk-8dir-sheet.png`、
`berserker-walk-south-x3.gif`、`berserker-compare-now-vs-new.png`（跟現在遊戲版的對照）。
**觀察**：内建模板的步幅偏小（官方模板是為小尺寸角色調的）—— 跟之前戰士的實測同一個結論；
角色身分（棕髮／皮甲／紅腰帶／大斧頭）在 8 方向都保持住了。
**未接進遊戲**：要接就是把 `berserker-trial/` 丢給 `build_class_sheet.py --name berserker`
（走路是直出，attack／skill 目前只有舊 Q 版列的可用）。

### 走路動畫速度：從「看距離」改成固定 8 fps（2026-10-12）

使用者指示：「把遊戲內所有 pixelab 的素材 fps 調快讓他跟 pixelab 網站上看到的速度一樣」。

**先量網站實際播多快**（`output/pixellab-incoming/_pl-fps.mjs`）：開 PixelLab 的 Character Creator 頁，
對每張 128×128 動畫 canvas 每 8ms 取一次 `toDataURL()` 哈希，數變化間隔 →
**毎格 125ms ＝固定 8 fps**（站姿那張則幾乎不動）。

**遊戲這邋原本是「看移動距離」的**：走路列帶 `cycle: 85`（＝每走 85 美術像素跑完一輪 8 格），
所以愈慢的角色動畫愈慢：

| 角色 | 速度 | 舊：格／秒（＝ 3.25 × 速度）| 新：格／秒 |
|---|---|---|---|
| 獵人（ranger 等） | 2.4–3.0 單位/秒 | 7.8–9.7 | **8** |
| 街上 NPC（行人）| ~0.8 單位/秒 | **2.6**（很明顯卡）| **8** |

**做法**：把 6 張 PixelLab 來源 sheet（ranger／sorcerer／paladin／assassin／basebody／basebody-armour）
的 5 條走路列改成 `frameTime: 0.125` 並**移除 `cycle`** → 引擎改走時間驅動（`gaitFrame` 裡
沒 `cycle` 就看 `elapsed/frameTime`）；`build_class_sheet.py`、`add_battle_rows.py` 也同步改，
未來重生不會又長回 cycle。舊值備份：`output/pixellab-incoming/_backup-walkfps/<hero>.json.bak`。

**驗收**（`_walkfps3.mjs`：暫停遊戲、自己把角色往前推、讀 `__mistvaleFacing()` 實際畫出的格）：
速度 0.8 與 2.4 單位/秒都是 **8 格／秒**（舊版 0.8 只有 2.6）。
`npm test` 全過；`check_anim` 閃格 0／走路跳格 0／受擊 127/127；`check_facing` heroWalkBad 0。
對照 GIF：`walkfps-compare-{slow,fast}.gif`（左舊右新）。

**已知代價**：慢遠的角色變成「腿部動作比地面快」（輕微滑步）—— 但這正是網站的樣子
（預覽不移動也是 8 fps 在跑）。原本的 `cycle` 是為了不滑步才校准的，現在把「感覺」優先於「貼地」。
**其他列沒動**：attack／skill 0.075（約 13 fps）、hurt／victory／death 0.1（10 fps）已經比網站快；
idle 是單張静态圖，沒東西可調。
**還沒改**：非 PixelLab 的舊職業（archer／berserker／witchhunter／darkknight／priest）仍是
距離驅動 —— 要一致就照同一個方法把 `cycle` 拿掉、`frameTime` 設 0.125就好。

### 驗收腳本怎麼跑在 pixel 版（`#start-button` 陷阱）

`pipeline/scripts/check/check_facing.mjs`、`check_anim.mjs` 寫的時候是對「有開場按鈕」的建置，
現在的 `src/pixel-index.html` **沒有 `#start-button`**（載入完直接進村莊），所以直接跑會停在
`page.click: Timeout`。做法是複製一份建置檔、注入一個小小的隱形按鈕，再用 `HTML=` 指過去：

```bash
npm run build
python -X utf8 -c "s=open('C:/Users/ray/Documents/Codex/2026-09-29/new-chat/outputs/暮影村.html',encoding='utf-8').read();\
btn='<button id=\"start-button\" style=\"position:fixed;left:2px;top:2px;width:14px;height:14px;opacity:.02\"></button>';\
i=s.lower().find('<body');j=s.find('>',i)+1;open('output/pixellab-incoming/_verify.html','w',encoding='utf-8').write(s[:j]+btn+s[j:])"
HTML="C:/Users/ray/Documents/Codex/2026-09-29/new-chat/work/mistvale/output/pixellab-incoming/_verify.html" \
  node pipeline/scripts/check/check_facing.mjs 60 "look:0,0,2.4"
HTML=... node pipeline/scripts/check/check_anim.mjs 60 "look:0,0,2.4"
```

（按鈕要留在**畫面內**，Playwright 不接受畫面外的元素；`opacity` 不影響可見性判定。）
注意 `check_facing.mjs` 的預設路徑比其他支多一層 `../`，一定要用 `HTML=` 蓋掉。
`check_facing` / `check_anim` 裡有一部分是為舊的 3D 版本寫的（`rest`／`eat`／`bandaged` 那些姿勢名），
在 pixel 版只有 `walk*` / `idle` 那幾條判斷真的會跑到 —— 判讀時看 `heroWalkBad`／`heroAnimBad`／
`flicker`／`walkSkip` 就好。
