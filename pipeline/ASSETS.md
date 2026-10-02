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

以下依目前 `pixel-world.js` 的實際分支盤點。程序繪製不是美術完成的證明，仍須和概念圖比對。

| 程序繪製 | 備註 |
|---|---|
| 仙人掌、香菇、花草 | 尚無專用圖集 |
| 閘門、花園、橋欄、村莊旗與競技場旗 | 程序像素繪製，仍需風格驗收 |
| 羊、山羊 | 已增加輪廓與毛色層次，尚無獨立素材 |
| 史萊姆、狼、石巨人、首領 | 程序 sprite；史萊姆已增加明暗細節 |
| 圖示與戰鬥特效 | 程序繪製 |

樹木、岩石、洞穴、廢墟、圍欄、水井、燈柱與路標優先使用 `details@1x/@2x`。
獵人使用六職業角色圖集；`hero@2x` 已由現成來源恢復成 184×148。
村莊建築優先使用 `assets/concept-clean/`，地下城使用建築圖集；載入失敗時仍有程序 fallback。

現成素材的可重跑入口：`python pipeline/scripts/prepare_concept_assets.py`，完成後執行
`npm run build`。此入口處理清煙、屋瓦重著色、獨立餐廳擷取及圖集邊界檢查，不呼叫生圖服務。

---

## 四、缺口（下一步）

1. **小物件風格斷層**：羊／山羊、閘門、橋欄、花草與魔物 → 尚待素材或視覺細化
   （照建築那套：生單格 → 洋紅底 → 切格 → manifest → integrate）。
2. **變體**：現有 12 棟的配色／材質／等級外觀 → 走 ComfyUI img2img（離線免費）。
3. **不烤地面版細節圖集**（雪地／沙漠用）→ 等 Codex 額度回來生。
4. **全新建築類型** → ImageGen（ComfyUI 角度鎖不住風格，不划算）。

---

## 五、狀態速查

- 四階段（建築 → 細節 → 地形 → 角色）**全部完成、已推進正式專案**。
- 驗證：`atlasUse` 計數 `atlas=全走圖集、proc=0`、0 console 錯誤、`npm test` PASS。
- 備份：`work\mistvale-backup-*`（推版前有備份，可回復）。
