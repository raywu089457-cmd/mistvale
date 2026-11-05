# 素材清單與來源（ASSETS.md）

`assets/` 底下每張圖從哪來、狀態、有沒有進遊戲。原始說明見
[`../assets/PROVENANCE.md`](../assets/PROVENANCE.md)（權威），這頁補狀態與缺口。

> 規則：**原始 PNG 原封保存**，遊戲載入時才色鍵去背＋縮放。別直接改 PNG 內容。

---

## 一、單圖素材

| 檔案 | 大小 | 來源 | 進遊戲 | 說明 |
|---|---|---|---|---|
| `title.png` | 3.3M | 內建 ImageGen | ✅ `title` | **登入概念圖＝整套美術的驗收基準** |
| `hall.png` | 1.9M | ImageGen（以 title 抽大廳） | ✅ `hall` | 也是 buildings14 的風格參考 |
| `inn.png` | 1.8M | ImageGen（單張編輯，洋紅底） | ✅ `inn` | prompt 見 PROVENANCE |
| `monument.png` | 1.4M | 程式／圖集 | ✅ `monument` | 英雄雕像 |
| `buildings14.png` | 2.5M | ImageGen（以 hall 為參考，4×3） | ❌ **不內嵌** | **風格基準＋img2img 底圖**，別刪 |
| `ui/fx-levelup.png` | 228K | pixelfx `ui/level-up` 純光柱匯出（MIT，Patch + Hugo Duprez；灰色假人與 `LEVEL UP!` 文字都拿掉） | ✅ `level` 升級特效 | 24 格 176×138／1.5 秒 15 fps，pivot [88,114]、世界寬 36；幀框見同名 `.json`（授權見 `THIRD-PARTY-LICENSES.txt`） |

## 二、圖集素材（sprite-gen manifest 契約，兩段 LOD）

| 圖集 | manifest | 來源 | 進遊戲 | key |
|---|---|---|---|---|
| `buildings@1x.png` / `@2x` | ✅ | sprite-gen（12 棟） | ✅ | `buildingsAtlas(+2x)` |
| `details@1x.png` / `@2x` | ✅ | sprite-gen（地圖細節） | ✅ | `detailsAtlas(+2x)` |
| `terrain-atlas.png` | ✅ | sprite-gen（無縫地面材質） | ✅ | `terrainAtlas` |
| `props@1x.png` / `@2x` | ✅ | **l0veyou**（羊／山羊、花圃、灌木、香菇、仙人掌、村旗、戰鬥旗、閘門、攤位、木桶） | ✅ | `propsAtlas(+2x)` |
| `plaza.png` | — | **l0veyou**（無縫石板，色調對齊 title 廣場） | ✅ | `plaza` |
| `road.png` | — | **l0veyou**（無縫土路，色調對齊 title 小路） | ✅ | `road` |
| `woodui.png` | — | **l0veyou**（UI 木板材質，色調對齊 title 木頭） | ✅ | `woodui`（CSS `--wood-tex`） |
| `icons@1x.png` / `@2x` | ✅ | **l0veyou**（29 個 UI 圖示：資源、物資、裝備、選單） | ✅ | `iconsAtlas(+2x)` |
| `vfx@1x.png` / `@2x` | ✅ | **l0veyou**（斬擊、法球、治療、升級星、命中、閃光、施工空地、獸皮圖示）；`arrowFx` 由 **pixelfx** 方法在 `pipeline/scripts/pixelfx/make_arrow.py` 以程式重繪（MIT） | ✅ | `vfxAtlas(+2x)`（arrowFx 維持 64×64 cell） |
| `flora@1x.png` / `@2x` | ✅ | **l0veyou**（四色小花、麥穗、高麗菜、等角橋欄長條、橋柱） | ✅ | `floraAtlas(+2x)` |
| `yard@1x.png` / `@2x` | ✅ | **l0veyou**（寶箱、木箱、草捆、柴堆、水槽、稻草人、燈籠、推車；純裝飾，16:9 生成） | ✅ | `yardAtlas(+2x)` |
| `town@1x.png` / `@2x` | ✅ | **l0veyou**（箭靶、木人、兵器架、鐵砧、桌椅、長凳、推車、花箱） | ✅ | `townAtlas(+2x)` |
| `town2@1x.png` / `@2x` | ✅ | **l0veyou**（紫旗、斜向木圍籬、水果攤、麻袋、木桶、水桶、花叢、河石） | ✅ | `town2Atlas(+2x)` |
| `concept-{stone,earth,grass}.png` | — | **概念圖像素**（image quilting 無縫材質） | ✅ | `conceptStone/Earth/Grass`（村莊高解析地面層） |
| `concept-clean/*-v3.png` | — | **l0veyou＋概念圖參考圖**（鐵匠鋪、學院、酒館、獵人小屋、餐廳、交易所） | ✅ | 取代 v2（build.mjs 優先） |

每個圖集都配一個 `*.manifest.json`（`frame_layout`，每格座標）。build.mjs 把 PNG＋manifest
一起 base64 內嵌。**改 manifest 記得 `npm run build`**。

---

## 二之二、pixelfx 逐格動畫表（`assets/vfx-sheets/`）

每個 `<id>.png` ＋ `<id>.json`（Aseprite 幀框＋`meta.pixelfx`：frameSize／pivot／fps／columns）由
build.mjs 內嵌成 `PIXEL_ASSETS.vfxSheets`，`pixel-world.js` 的 `drawVfxSheet()` 逐格播放。
全部是 [patch-gg/pixelfx](https://github.com/patch-gg/pixelfx) 匯出（MIT，Patch + Hugo Duprez，授權見
`THIRD-PARTY-LICENSES.txt`）；匯出設定固定 `bg:"none", actor:false`（不烤角色）。

| 檔案 | 來源 | 備註 |
|---|---|---|
| `dash-strike.png` / `.json` | pixelfx `moves/dash-strike`，**chain 只留 `impacts/crit-hit`**（把 `melee/sword-slash` 那層藍色刀光拿掉） | 372×156、pivot [66,136]、70 幀 30 fps；第 7–29 幀有畫面，其餘全透明。狂戰士普攻命中（星爆） |
| `crit-spray.png` / `.json` | pixelfx `impacts/crit-spray`（本專案在該工作區新寫的效果） | 200×120、pivot [52,72]、19 幀 30 fps；原點＝打擊點，火花／碎片／火星**順著 +x 噴出去**，42 美術 px 處是腳下的地面。狂戰士命中後的噴濺，往左揮時整張水平翻面 |

重匯出（`--dir` 指到 pixelfx 工作區，預設 `C:/Users/ray/pixelfx`）：

```sh
node pipeline/scripts/pixelfx/export-sheet.mjs impacts/crit-spray crit-spray
```

本專案自己寫的效果原始檔放在 `pipeline/scripts/pixelfx/vendor/impacts/`（跟 pixelfx 的 `src/fx/impacts/` 同結構、
同樣 `../../core/index.js` 的相對 import）；匯出腳本會先把它複製進 pixelfx 工作區再匯出，所以乾淨的 checkout + 一份
pixelfx 就能重現同一張表（實測輸出 byte 相同）。上游就有的效果（例如 `dash-strike`）不用 vendor。

`dash-strike` 要先把該工作區 `src/fx/moves/dash-strike.js` 的 `create` 改成
`chain([{ fx: crit, t: 0.22, x: TX - 10, height: 28 }])`（meta 的 size／origin／duration 不動），再跑同一個腳本
`... moves/dash-strike dash-strike`。腳本固定用 `bg:"none", actor:false` 匯出，只留效果本身的像素。

---

## 三、程式繪製素材（不是圖檔，是 `pixel-world.js` 畫的）

以下依目前 `pixel-world.js` 的實際分支盤點。程序繪製不是美術完成的證明，仍須和概念圖比對。

| 程序繪製 | 備註 |
|---|---|

所有地圖裝飾、戰鬥特效、空地標記與 UI 圖示都已改走圖集：建築／樹／岩石／圍欄（sprite-gen）、道具／花草／作物／橋欄（l0veyou）、
廣場石板（l0veyou）、草地（terrain-atlas，色調對齊概念圖草地）。驗收：`__mistvaleDetails().proc` 必須是 `{}`。
圖集沒載到時仍退回原本的程序繪製。

樹木、岩石、洞穴、廢墟、圍欄、水井、燈柱與路標優先使用 `details@1x/@2x`。
村莊建築優先使用 `assets/concept-clean/`，地下城使用建築圖集；載入失敗時仍有程序 fallback。

現成素材的可重跑入口：`python pipeline/scripts/prepare_concept_assets.py`，完成後執行
`npm run build`。此入口處理清煙、屋瓦重著色、獨立餐廳擷取及圖集邊界檢查，不呼叫生圖服務。

---

## 四、缺口（下一步）

1. **小物件**：全部改走圖集（見 [`l0veyou.md`](l0veyou.md)）。
2. **變體**：現有 12 棟的配色／材質／等級外觀 → 走 ComfyUI img2img（離線免費）。
3. **不烤地面版細節圖集**（雪地／沙漠用）→ 等 Codex 額度回來生。
4. **全新建築類型** → ImageGen（ComfyUI 角度鎖不住風格，不划算）。

---

## 五、狀態速查

- 三階段（建築 → 細節 → 地形）**全部完成、已推進正式專案**。
- 驗證：`atlasUse` 計數 `atlas=全走圖集、proc=0`、0 console 錯誤、`npm test` PASS。
- 備份：`work\mistvale-backup-*`（推版前有備份，可回復）。
