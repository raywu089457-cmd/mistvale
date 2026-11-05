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
| `berserk-hit.png` / `.json` | pixelfx `impacts/berserk-hit`（本專案寫的，`chain` 串三個效果） | 260×180、pivot [105,105]、31 幀 30 fps。原點＝打擊點（胸口），地板在 +52 美術 px。狂戰士普攻命中：t 0 切痕噴濺（`crit-spray`）→ t 0.16 星爆（`crit-hit`）→ t 0.16 腳下塵環（`heavy-landing`，0.5 秒後收掉）。往左揮時整張水平翻面 |
| `spell-charge.png` / `.json` | pixelfx `arcane/spell-charge`（上游，`loop` 表），匯出時換成火色盤 | 120×86、pivot [44,80]、48 幀 30 fps、1.6 秒 loop。法師蓄力時畫在手上（遊戲用 2.4 倍速，0.6 秒的蓄力裡剛好長到滿）；表裡的球在 pivot 右上 (15,-22) |
| `fireball-blast.png` / `.json` | pixelfx `impacts/fireball-blast`（本專案寫的，`chain` 只放 `explosions/small-explosion` 前 1.2 秒） | 300×240、pivot [150,196]、37 幀 30 fps。原點＝地面，法師火球命中時起爆，最後 0.3 秒在遊戲端淡出（原廠是 5.4 秒，太長） |
| `holy-hit.png` / `.json` | pixelfx `impacts/holy-hit`（本專案寫的，`chain` 只放 `holy/smite` 前 1.3 秒） | 224×176、pivot [112,148]、40 幀 30 fps。原點＝地面。牧師普攻：表在 0.54 秒光錘落地，遊戲用 `0.54+age` 對齊，飛行段（0.16 秒）就開始畫目標上的光點和落下的光錘，命中瞬間砸到；最後 0.26 秒淡出 |
| `priest-heal.png` / `.json` | pixelfx `holy/priest-heal`（本專案寫的，`chain` 只放 `holy/heal` 前 1.4 秒，給一個沒有像素的替身輪廓） | 80×104、pivot [40,92]、43 幀 30 fps。原點＝隊友腳下。牧師補血（普攻補血與暗癒禱言）：花瓣綻開 → 光環沿身體升起 → 小愛心；提前 0.17 秒開始，最後 0.3 秒淡出。heal 原本會重新上色替身身體，傳 `pixels: null` 的替身就只留光 |
| `dark-cleave.png` / `.json` | pixelfx `melee/heavy-cleave`（上游），匯出時換成暗紫色盤 | 208×116、pivot [68,96]、58 幀 30 fps。原點＝表裡替身腳下，巨劍 0.335 秒砸在前方 +34 美術 px 的地上。黑騎士普攻：表往攻擊方退 34 px，打擊點落在目標腳下；遊戲用 `0.36+age`，命中前就畫得到刀弧；0.5 秒後 0.25 秒淡出（煙塵不拖） |
| `double-slash.png` / `.json` | pixelfx `melee/double-slash`（上游，原色） | 164×108、pivot [44,92]、25 幀 30 fps。兩刀交叉處在 (+36,-25)≈ 胸口，0.23 秒最亮。刺客普攻：表退 36 px，`0.2+age` |
| `parry.png` / `.json` | pixelfx `impacts/parry`（上游，原色） | 200×112、pivot [100,96]、31 幀 30 fps。原點正上方 30 px 爆金色環與碎光。聖騎士普攻命中，不用位移 |
| `crit-spray.png` / `.json` | pixelfx `impacts/crit-spray`（本專案寫的） | 200×120、pivot [52,72]、19 幀 30 fps；原點＝打擊點，火花／碎片／火星**順著 +x 噴出去**，42 美術 px 處是腳下的地面。單獨測試用；遊戲裡是 `berserk-hit` 的第一層 |

重匯出（`--dir` 指到 pixelfx 工作區，預設 `C:/Users/ray/pixelfx`）：

```sh
node pipeline/scripts/pixelfx/export-sheet.mjs impacts/berserk-hit berserk-hit
node pipeline/scripts/pixelfx/export-sheet.mjs impacts/crit-spray crit-spray
node pipeline/scripts/pixelfx/export-sheet.mjs impacts/fireball-blast fireball-blast
node pipeline/scripts/pixelfx/export-sheet.mjs impacts/holy-hit holy-hit
node pipeline/scripts/pixelfx/export-sheet.mjs holy/priest-heal priest-heal
node pipeline/scripts/pixelfx/export-sheet.mjs --opts '{"palette":["#120818","#2a1038","#4a1a66","#7a2fa0","#a95cd6","#d2a0f0","#f0e0ff","#ffffff"]}' melee/heavy-cleave dark-cleave
node pipeline/scripts/pixelfx/export-sheet.mjs melee/double-slash double-slash
node pipeline/scripts/pixelfx/export-sheet.mjs impacts/parry parry
node pipeline/scripts/pixelfx/export-sheet.mjs --opts '{"palette":["#1f0b10","#4a1118","#8c1d1c","#cc3a1a","#f2701f","#ffae35","#ffe27a","#fff8d6"]}' arcane/spell-charge spell-charge
```

本專案自己寫的效果原始檔放在 `pipeline/scripts/pixelfx/vendor/<分類>/`（`impacts/`、`holy/`，跟 pixelfx 的 `src/fx/<分類>/` 同結構、
同樣 `../../core/index.js` 的相對 import）；匯出腳本會先把它複製進 pixelfx 工作區再匯出，所以乾淨的 checkout + 一份
pixelfx 就能重現同一張表（實測輸出 byte 相同）。`berserk-hit` 串的另外兩個效果（`impacts/crit-hit`、`impacts/heavy-landing`）
是 pixelfx 上游就有的，不用 vendor。腳本固定用 `bg:"none", actor:false` 匯出，只留效果本身的像素。

（`dash-strike` 那張表在 2026-11 換成 `berserk-hit` 後就沒用到了，已從 `assets/vfx-sheets/` 刪掉，要回去看請找 git 歷史。）

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
