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

每個圖集都配一個 `*.manifest.json`（`frame_layout`，每格座標）。build.mjs 把 PNG＋manifest
一起 base64 內嵌。**改 manifest 記得 `npm run build`**。

### 角色職業 id（很重要，對不上會靜默退回程序繪製）
圖集 key：`berserker`（狂戰士）／`ranger`（遊俠）／`paladin`（聖騎士）／
`sorcerer`（魔法師）／`darkknight`（黑暗騎士）／`priest`（牧師）。
遊戲 `pixel-data.js` 的職業 id 現在跟這套一致。

---

## 三、程式繪製素材（不是圖檔，是 `pixel-world.js` 畫的）

這些**沒有圖檔**，是即時畫的多邊形／像素。跟 AI 建築比有**風格斷層**：

| 程序繪製 | 備註 |
|---|---|
| 樹、岩石、洞穴、廢墟、仙人掌、香菇、花、草叢 | 地景裝飾 |
| 圍欄、閘門、燈柱、路標、花園、橋欄、競技場旗 | 人工設施 |
| 羊、山羊 | **明顯是長方形＋腿，最突兀** |
| 水井 | 藍屋頂＋4 柱＋灰菱形底座，扁平 |
| 世界內 28×35 角色 sprite、24×24 圖示 | 尺寸太小，維持程式畫（AI 會糊） |

---

## 四、缺口（下一步）

1. **小物件風格斷層**：羊／山羊、水井、圍欄、路標 → 建議用 sprite-gen 生圖集替換
   （照建築那套：生單格 → 洋紅底 → 切格 → manifest → integrate）。
2. **變體**：現有 12 棟的配色／材質／等級外觀 → 走 ComfyUI img2img（離線免費）。
3. **不烤地面版細節圖集**（雪地／沙漠用）→ 等 Codex 額度回來生。
4. **全新建築類型** → ImageGen（ComfyUI 角度鎖不住風格，不划算）。

---

## 五、狀態速查

- 四階段（建築 → 細節 → 地形 → 角色）**全部完成、已推進正式專案**。
- 驗證：`atlasUse` 計數 `atlas=全走圖集、proc=0`、0 console 錯誤、`npm test` PASS。
- 備份：`work\mistvale-backup-*`（推版前有備份，可回復）。
