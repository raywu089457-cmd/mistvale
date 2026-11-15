# HeroLoom 魔物重繪（monsters3 確定性重上色）

把 `assets/monsters3/` 既有的 22 張魔物 sheet 重新上色成 HeroLoom 風格的 **確定性（deterministic）** 管線：
不呼叫任何圖像模型、不花錢、不連網，輸出 `assets/heroloom-monsters3/`。

- 產出：`assets/heroloom-monsters3/<id>.png` + `<id>.json`（22 組）
- 腳本：`pipeline/scripts/heroloom/restyle-monsters3.mjs`
- 檢查器：`tools/checks/heroloom-monsters3.mjs`（PASS/FAIL 每張，失敗 exit 1）
- 證明圖：`output/heroloom-ext/monsters3-proof/`（22 張 `compare-<id>.png` + `all-contact.png` + `restyle-report.json`）

## 1. 管線

```
assets/monsters3/<id>.png  --decodePng()-->  RGBA
        |                                      |
        |                                      +-- 材質重映射（OKLab 分類 -> HeroLoom ramp）
        |                                      +-- 描邊：alpha 邊緣像素往 #150d1b 拉 + 墨階梯
        |                                      +-- 上緣內側 1 px：同 ramp 再暗一階
        |                                      +-- 色盤上限：嚴格少於原圖色數
        v
assets/heroloom-monsters3/<id>.png（indexed PNG，binary alpha）
assets/heroloom-monsters3/<id>.json（原 meta 逐位元組複製）
```

重用既有依賴零負擔模組：

| 模組 | 用途 |
| --- | --- |
| `pipeline/scripts/heroloom/png.mjs` | `decodePng(buf)`、`encodeIndexed(...)`、`encodeRgba(...)`、`isBinaryAlpha` |
| `pipeline/scripts/heroloom/scene-color.mjs` | OKLab：`srgbToOklab`、`oklabToSrgb`、`packRgb`、`rgbHex`；色距定義 `sqrt(1.25·ΔL² + 0.85·(Δa²+Δb²))` |

## 2. 顏色規則

所有 base 色都是 `assets/heroloom-scene/palette.json`（96 色 HeroLoom coreRamp）的**實際條目**；
唯一例外是 `ice` 的淡青階梯，取自真實 HeroLoom 冷色稿 `assets/heroloom-scene/cold@1x.png`
（`#aee1f6` 等），以及 `accent` 的 `#d58a76`（palette 內的鮭紅，讓粉花保留色相而不是變橘）。

`OUTLINE = #150d1b`；墨階梯 = 把 ink 往 HeroLoom 中性灰 `#4a4a52` 混 15% / 30% / 45%（OKLab 內混）。

```js
const RAMPS = {
  shadow:  ['#19192d', '#3e2029'],
  grey:    ['#353a47', '#4a4a52', '#6b6b73', '#9a9aa0'],
  leather: ['#4a2f1c', '#79553a', '#8a613f', '#a67c44'],
  skin:    ['#8a5a33', '#a8753f', '#c8a05a', '#e0c080'],
  bone:    ['#ad8a63', '#d1aa7d', '#e1cbbc', '#ece8da'],
  green:   ['#435521', '#546a21', '#718e32', '#98aa44'],
  ice:     ['#457b9f', '#84c9e5', '#aee1f6', '#d7e8ef'],
  blue:    ['#1b2d4f', '#2d4b73', '#486495', '#4e7daa'],
  white:   ['#c8c8c8', '#e1cbbc', '#ece8da', '#f6faf3'],
  accent:  ['#6a2a17', '#be2d29', '#e69436', '#ecc35e', '#d58a76'],
};
```

分類（來源色 → 家族）只看 OKLab 的 L / chroma / hue：

1. `L < 0.22` → `shadow`（像素畫內部線條用，比輪廓 ink 亮一階，避免墨覆蓋率爆表）。
2. chroma `< 0.028` → `white`（`L > 0.72`）或 `grey`。
3. 暖色帶 hue 40–100°：chroma `> 0.11` → `accent`；`L ≥ 0.72` → `bone`；`L ≥ 0.55` → `skin`；其餘 `leather`。
4. 綠 95–150° → `green`；青綠 150–180° 依亮度走暖色家族。
5. 冷色帶 −180…−150°：chroma 足夠 → `ice`；否則 `grey`。
6. −150…−115°：亮 → `ice`、暗 → `blue`。
7. −115…−45° → `grey`；−45…−20° chroma `> 0.10` → `accent`，否則 `grey`；
   −20…40° chroma `> 0.06` → `accent`，否則 `grey`。

## 3. 描邊與立體感

- alpha 邊緣像素（四鄰有透明）往 `#150d1b` 混 55%，再吸附到墨階梯。
- 上緣（上方是透明）那條邊混 68%，讓輪廓更實。
- 上緣內側 1 px 的材質色換成同 ramp **暗一階**（假 2.5D 頂光/下緣陰影），不做其他光影重畫。
- alpha 完全不動：binary alpha 進、binary alpha 出，剪影逐位元組相同。

## 4. 色盤上限與輸出格式

- 合併最少的顏色到 OKLab 最近的鄰居，讓「使用中的不透色數」**嚴格少於**原圖（原圖 15–246 色 → 成品 11–26 色）。
- 成品色數 ≤ 256 時輸出 indexed PNG（`encodeIndexed`，透明索引），否則 RGBA；alpha 仍是 0/255。
- `<id>.json` 用 `fs.copyFileSync` 原樣複製，y/cell/frames/frameTime/release/impact/cycle/head/… 幾何逐位元組一致。

## 5. 驗收（checker）

```
node tools/checks/heroloom-monsters3.mjs
```

對每個 id 逐項檢查，全部成立才 PASS：

| # | 檢查 | 條件 |
| --- | --- | --- |
| 1 | 檔案配對 | `assets/heroloom-monsters3/<id>.png` + `.json` 存在 |
| 2 | sheet 尺寸 | 與 `assets/monsters3/<id>.png` 完全相同（寬高） |
| 3 | alpha 遮罩 | 逐像素相同（byte-identical），且輸出 alpha 只有 0/255 |
| 4 | meta 幾何 | 與原 json **deep-equal** |
| 5 | 色盤縮減 | 不透色數嚴格少於原圖 |
| 6 | 墨描邊覆蓋 | 落在不透像素的 **3%–18%** |
| 7 | ramp 距離 | **≥95%** 不透像素與宣告 ramp 集合的 OKLab 距離 **≤ 0.08** |

目前結果：`Summary: PASS -- 22/22`（墨覆蓋 4.18%–14.59%、ramp 100%，每張 edgeInk 100%）。
checker 內刻意**複製一份** ramps 表（不 import 產生器），避免產生器改壞時自我背書；改色階要兩邊同步。

```powershell
# 重跑全部
node pipeline/scripts/heroloom/restyle-monsters3.mjs

# 只跑幾隻、跳過證明圖
node pipeline/scripts/heroloom/restyle-monsters3.mjs --only=wolfman,moss --no-proofs

# 只看計畫不寫檔
node pipeline/scripts/heroloom/restyle-monsters3.mjs --dry-run

node tools/checks/heroloom-monsters3.mjs
```

## 6. 與遊戲整合

- `build.mjs:118-127` 已經實作 drop-in：逐 id 檢查 `assets/heroloom-monsters3/<id>.png` 是否存在，
  存在就用它（dest `heroloom-monsters3/<id>.png`），meta 以 JSON inline 進
  `window.PIXEL_ASSETS.monsterSheets = { <id>: { img, meta } }`。**本任務不需改 build.mjs。**
- 執行時 `?lmob=1` 會先吃 `PIXEL_ASSETS.loomMonsters`（`assets/heroloom-monsters/` 那三隻 HeroLoom 原生包），
  其餘魔物照舊走 `monsterSheets`；本 pack 是 `monsterSheets` 的換圖，不動程式碼、不動 meta 幾何。
- 產出的 sheet 尺寸與原圖一致、cell/row 配置不變（除了 treant 本來就是 224 cell / 11 row 的特例，已原樣支援），
  所以命中框、攻擊時序、8 方向查表全部沿用原本資料。

## 7. 證明圖

`output/heroloom-ext/monsters3-proof/`：

- `compare-<id>.png`：`BEFORE | AFTER`，取 idle 第一格放大 2×（棋盤格透明底）。
- `all-contact.png`：22 組的總覽（5 欄）。
- `restyle-report.json`：每張的色數、墨覆蓋、ramp 比例、色相位移、輸出位元組數。

## 8. 已知限制

- **只重上色，不重畫**：剪影與像素結構 100% 保留；因此不會長出新裝備、新姿勢或更 HeroLoom 的造型，
  「風格」來自色階、墨線與色盤紀律。
- **色相位移 5.6°–27.2°**（chroma 加權）：少數材質會被拉進 ramp，例如灰狼的暖灰偏冷、粉花偏鮭紅；
  若某隻 identity 跑掉，調整 `classify()` 對應色帶即可，不動幾何。
- 4 階（部分 2 階）banding 是刻意的像素畫手感；解析度不變，只用更少顏色。
- 8 方向沿用原圖既有資料；本管線不生成方向列、不鏡射。
- 證明圖只取 idle 第一格，其餘 frame/row 由 checker 的整張 pixel 驗證背書（不是人眼看過每一格）。
- 未做人眼美術 review 的全部 22 隻逐格確認；如要更暖/更冷，調 `RAMPS` 與 `classify()` 後重跑即可。
- 改動只落在 `assets/heroloom-monsters3/`（新目錄），`assets/monsters3/` 原檔不動，隨時可回退。

## 9. PixelLab 全重繪（第二輪，2026-11-15）

使用者要求「用 PixelLab 重做」後，22 隻魔物全部改成 PixelLab `create-character-v3` + `characters/animations`（v3）產出，
不再沿用舊剪影。本節取代上面 §1–§4 的「只重上色」路線；`restyle-monsters3.mjs` 保留給 treant 的舊備援 /
其他 pack 的快速換色。

### 帳號與計費
- 備援帳號 `~/.pixellab-token-2`（同 `~/.pixellab-token2`）：Tier 1 Pixel Apprentice，額度是 **generations**
  不是 USD（`GET /v2/balance` → `subscription.generations` / `total`）。
- 本輪花費：**1938 → 1545 generations（共用 393）**，usd 仍 0。
  - 單隻成本：create 3 + idle 2 + walk 3 + attack 3 + hurt 2 + death 3 ≈ 16–17；treant 的 hurt/attack 較貴（共 ~25）。
- 規則：先扣 generation 額度，額度用完才扣 usd；不註冊、不切換其他帳號。

### Pipeline
`pipeline/scripts/heroloom/pixellab-monsters.mjs`
1. `POST /v2/create-character-v3`：`{description, image_size 128, view:'low top-down',
   outline:'single color black outline', n_directions:8, seed}`（v3 已移除 `shading` 欄位，帶了會 422）。
2. `GET /v2/characters/{cid}` 取 `rotation_urls.east`（面右，正是引擎要的方向）。
3. `POST /v2/characters/animations`：`{mode:'v3', action_description, frame_count, directions:['east'], seed}`；
   v3 的 `frame_count` 只能 4–16 的偶數，且回傳固定 **requested+1 張**（第 0 張是來源 rotation），
   所以請求數 = 需要張數，合成時丟掉第一張。
4. 合成 `sheet.png` 1280×800（8 欄 × 5 列、cell 160、腳底線 y=148、art 高 100，treant 140）：
   依 idle bbox 縮放、每格 bbox 底部對齊 baseline、置中 x=80、binary alpha，
   之後 `snapSheetToRamps()` 把顏色吸到 39 色 HeroLoom ramp（PixelLab 原始 shading 約 270 色，checker 上限 40），
   最後 `addInk()` 加 1px `#150d1b` 墨線。
5. `pipeline/scripts/heroloom/integrate-monsters-pl.mjs` 把完成的 `<id>/{sheet.png,meta.json}` 複製進
   `assets/heroloom-monsters3/`，並用 PIL 產生 lossless `.webp` 兄弟檔（`build.mjs` 的 `media()` 優先吃 webp）。
6. meta 一律 reduced 5-action（idle/walk/attack/hurt/death），heroHeight 72、footFromBottom 12、cell 160；
   `src/dir4.js` 的 dirSuffix/leftRow fallback 會把缺少的方向列退回側面列，所以 8 方向攻擊姿勢不存在但不崩。

### 驗收
- `node tools/checks/heroloom-monsters3.mjs` → **22/22 replacement 1280x800 5 actions**（色數 14–34、墨線覆蓋 4–32%）。
- `node test-heroloom.mjs` 22 passed；`node build.mjs` → dist 2.21 MB，22 張 sheet inline。
- 遊戲截圖（`output/heroloom-ext/final-pl/`）：18 隻在起始草原自然生成並拍到（mole/boar/snowhare/shroom/
  floraspirit/sprout/stag/kobold/ram/yeti/icebeetle/boulder/cactus/scorpion/vine/snowman/mummy/wolfman），
  goat/birchling/moss/treant 只在其他區域或 Boss 房生成，未在起始區出現，改以 `00-monsters-contact.png`
  （22 隻 idle 總覽）與 checker 背書。
- 誠實限制：treant 從 224 cell / 11 列縮成 160 cell / 5 列（動作變少但與其他魔物一致）；
  所有魔物都只剩側面 5 動作，8 方向攻擊姿勢不再存在（引擎 fallback 成側面）；idle 呼吸幅度小、walk 步幅小；
  PixelLab 造型風格與 HeroLoom 角色（512×448、64×56 cell）不同—魔物是 160 cell 的獨立比例，
  在遊戲內以 `heroHeight 72` 對齊，畫面協調但細節階調比角色粗。
