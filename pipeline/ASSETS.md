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

## 二、圖集素材（sprite-gen manifest 契約，兩段 LOD）

| 圖集 | manifest | 來源 | 進遊戲 | key |
|---|---|---|---|---|
| `buildings@1x.png` / `@2x` | ✅ | sprite-gen（12 棟） | ✅ | `buildingsAtlas(+2x)` |
| `details@1x.png` / `@2x` | ✅ | sprite-gen（地圖細節） | ✅ | `detailsAtlas(+2x)` |
| `terrain-atlas.png` | ✅ | sprite-gen（無縫地面材質） | ✅ | `terrainAtlas` |
| `hero@1x.png` / `@2x` | ✅ | sprite-gen（獵人六職業） | ✅ | `heroAtlas(+2x)` |
| `props@1x.png` / `@2x` | ✅ | **l0veyou**（羊／山羊、花圃、灌木、香菇、仙人掌、村旗、戰鬥旗、閘門、攤位、木桶） | ✅ | `propsAtlas(+2x)` |
| `monsters@1x.png` / `@2x` | ✅ | **l0veyou**（史萊姆／狼／石巨人／森林領主，各 2 格動畫） | ✅ | `monstersAtlas(+2x)` |
| `plaza.png` | — | **l0veyou**（無縫石板，色調對齊 title 廣場） | ✅ | `plaza` |
| `road.png` | — | **l0veyou**（無縫土路，色調對齊 title 小路） | ✅ | `road` |
| `woodui.png` | — | **l0veyou**（UI 木板材質，色調對齊 title 木頭） | ✅ | `woodui`（CSS `--wood-tex`） |
| `icons@1x.png` / `@2x` | ✅ | **l0veyou**（29 個 UI 圖示：資源、物資、裝備、選單） | ✅ | `iconsAtlas(+2x)` |
| `vfx@1x.png` / `@2x` | ✅ | **l0veyou**（斬擊、法球、治療、升級星、命中、閃光、施工空地、獸皮圖示） | ✅ | `vfxAtlas(+2x)` |
| `flora@1x.png` / `@2x` | ✅ | **l0veyou**（四色小花、麥穗、高麗菜、等角橋欄長條、橋柱） | ✅ | `floraAtlas(+2x)` |
| `villagers@1x.png` / `@2x` | ✅ | **l0veyou**（商人、農婦、小孩、長老、鐵匠學徒、酒館女侍、貓、狗；純裝飾） | ✅ | `villagersAtlas(+2x)` |

每個圖集都配一個 `*.manifest.json`（`frame_layout`，每格座標）。build.mjs 把 PNG＋manifest
一起 base64 內嵌。**改 manifest 記得 `npm run build`**。

### 角色職業 id（很重要，對不上會靜默退回程序繪製）
圖集 key：`berserker`（狂戰士）／`ranger`（遊俠）／`paladin`（聖騎士）／
`sorcerer`（魔法師）／`darkknight`（黑暗騎士）／`priest`（牧師）。
遊戲 `pixel-data.js` 的職業 id 現在跟這套一致。

---

## 三、程式繪製素材（不是圖檔，是 `pixel-world.js` 畫的）

以下依目前 `pixel-world.js` 的實際分支盤點。程序繪製不是美術完成的證明，仍須和概念圖比對。

| 程序繪製 | 備註 |
|---|---|

所有地圖裝飾、魔物、戰鬥特效、空地標記與 UI 圖示都已改走圖集：建築／樹／岩石／圍欄（sprite-gen）、道具／魔物／花草／作物／橋欄（l0veyou）、
廣場石板（l0veyou）、草地（terrain-atlas，色調對齊概念圖草地）。驗收：`__mistvaleDetails().proc` 必須是 `{}`。
圖集沒載到時仍退回原本的程序繪製。

樹木、岩石、洞穴、廢墟、圍欄、水井、燈柱與路標優先使用 `details@1x/@2x`。
獵人使用六職業角色圖集；`hero@2x` 已由現成來源恢復成 184×148。
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

- 四階段（建築 → 細節 → 地形 → 角色）**全部完成、已推進正式專案**。
- 驗證：`atlasUse` 計數 `atlas=全走圖集、proc=0`、0 console 錯誤、`npm test` PASS。
- 備份：`work\mistvale-backup-*`（推版前有備份，可回復）。
