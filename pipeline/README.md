# Mistvale 素材生成管線（接手指南）

這裡是「暮影村 · 像素獵魔物語」美術素材的**生產管線整合**。目的：讓任何一個之後接手的
AI／工程師，光看這個資料夾就能**完整接手**——知道素材從哪來、怎麼生、怎麼接進遊戲、
現在做到哪、還缺什麼。

素材「怎麼來」的原始說明在 [`../assets/PROVENANCE.md`](../assets/PROVENANCE.md)（權威版）。
這個資料夾補上**可重跑的流程、腳本、現況**。

---

## 先看這三頁

| 檔案 | 內容 |
|---|---|
| [`ASSETS.md`](ASSETS.md) | 素材清單：每一張從哪來、狀態、缺口 |
| [`sprite-gen.md`](sprite-gen.md) | **主管線**：sprite-gen 生圖 → 切格 → 組圖集 → 進遊戲 |
| [`comfyui.md`](comfyui.md) | **旁支管線**：本機 SD（ComfyUI）生變體／實驗 |

報告原文在 [`reports/`](reports/)，可重跑腳本在 [`scripts/`](scripts/)。

---

## 兩套管線，一句話分清楚

| | sprite-gen（主管線） | ComfyUI（旁支） |
|---|---|---|
| 生圖引擎 | **Codex 內建 ImageGen**（ChatGPT／Grok） | 本機 SDXL（離線、免費無限） |
| 產出 | 建築／細節／地形／角色 **圖集 + manifest** | 現有建築的**變體**、風格實驗 |
| 額度 | 要 Codex 額度（10/4 前用光了） | 不要錢，只要顯卡（RTX 3070 Ti 8GB） |
| 現況 | **四階段全做完、已推進正式專案** | 環境修好、配方驗證達標，但沒量產 |
| 什麼時候用 | 生**全新**素材、重跑整條產線 | 生**現有 12 棟的變體**、或額度用完時 |

**要生新素材 → 走 sprite-gen（主管線）。ComfyUI 只在需要變體或離線時用。**

---

## 遊戲怎麼吃到這些素材（整合契約）

建置器 [`../build.mjs`](../build.mjs) 把圖集 **base64 內嵌**進單一 `暮影村.html`（約 20MB）。
所有圖集都走同一個 **sprite-gen manifest 契約**（`manifest.json` 的 `frame_layout`，每格座標算好）。

- **兩段 LOD**：每個圖集都有 `@1x`（日常）＋ `@2x`（放大）。放大約 >2.2 倍才切 2x，省記憶體。
- **載入流程**：洋紅底色鍵去背 → 裁切 → **離線 LANCZOS 先縮好** → 執行時 1:1 貼上。
  （鐵律：別在瀏覽器裡用最近鄰縮小，會糊。當初建築跟角色都踩過這坑。）
- **fallback**：圖集沒到位就退回 `pixel-world.js` 的程序繪製，遊戲不會開天窗。

build.mjs 目前內嵌的 key（對照它，才知道漏了什麼）：
`title / hall / inn / monument`（單圖）＋
`buildingsAtlas(+2x) / buildingsManifest(+2x)` ＋
`detailsAtlas(+2x) / detailsManifest(+2x)` ＋
`terrainAtlas / terrainManifest` ＋
`heroAtlas(+2x) / heroManifest(+2x)`。

> `buildings14.png` **已不再內嵌**（舊清單裡有，後來拿掉）。它留著當**風格基準 + img2img 底圖**，
> 不是 runtime 素材，別誤刪。

---

## 接手後的標準動作

```bash
cd work/mistvale
npm install          # 首次
npm run build        # 建置 → ../../outputs/暮影村.html
npm test             # test-pixel-game / test-overworld / test-landscape 全要 PASS
npm run serve        # 起本地埠 5024（綁 Tailscale 100.79.149.0）
```

改了素材或 manifest → 一律 `npm run build` → `npm test` → 截圖跟 `../assets/title.png`（概念圖）比對。
**驗收看數字**（飽和／色相／描邊／暖色佔比，見 comfyui.md 量化表），不是「看起來有」。

---

## 外部依賴地圖（這些**不在**專案裡，別找不到就以為沒了）

| 東西 | 位置 | 用途 |
|---|---|---|
| sprite-gen 工具 | `C:\Users\ray\tools\sprite-gen`（v2.11.0） | 主管線，見它的 `SKILL.md` |
| sprite-gen 工作現場 | `C:\Users\ray\sprite-demo\mistvale-work\` | 整合腳本＋報告＋對照圖原地 |
| buildings POC 圖集 | `C:\Users\ray\sprite-demo\buildings-poc\lod\` | 建築圖集生成結果 |
| ComfyUI | `D:\AI\ComfyUI`（venv） | 旁支管線 |
| ComfyUI 配方 | `D:\AI\ComfyUI\projects\mistvale\RECIPE.md` | 已複製到 `reports/RECIPE.md` |
| SDXL 模型／參考圖 | `D:\AI\ComfyUI\models\`、`input\` | 見 comfyui.md |

本專案已把**腳本**與**報告**複製進 `pipeline/`（自給自足可讀可跑）。
但**工具本體、模型、原始大圖**仍在上面這些位置——要重跑產線就得有它們。

---

## 紅旗／已知坑（接手前必讀）

1. **`scripts/sprite-gen/integrate_*.py` 是一次性搬移腳本**，路徑寫死打在
   `C:\Users\ray\sprite-demo\mistvale-work\proj`（工作副本），**不是**打在這個正式專案。
   正式專案已經整合完。這些腳本的價值是「記錄整合契約」，想重跑要先改路徑。
2. **角色職業 id 要對得上**：圖集 key = `berserker/ranger/paladin/sorcerer/darkknight/priest`。
   早前 bug 是遊戲用 `knight/ranger/mage`、圖集用另一套 → 全部退回程序繪製、不報錯。已修。
3. **快取不失效 = 白做**：`portraitCache` / `spriteCache` 在圖集載入前就烤好會永久佔住舊圖。
   圖集載入後要清快取、快取 key 要分 LOD。這類 bug **不報錯**，要用計數器實測（`atlasUse`）。
4. **額度**：Codex 額度 10/4 06:08 前用光。要用 sprite-gen 生新圖，先確認額度回來。
5. **21:30 有「別的管道」動過正式專案**（生態系調色 + UI 主題，查過純外觀）。
   如果之後另一個 AI 也動 `pixel-world.js`／`pixel-ui.js`，可能蓋掉素材整合，改前先 diff。

---

## 目前缺口（下一步可做）

- 羊／山羊、圍欄、水井、路標等小物件**還是程序繪製的簡單多邊形**，跟 AI 建築有風格斷層。
- 雪地／沙漠等「不烤地面」版細節圖集（等額度回來生）。
- 細節：見 [`ASSETS.md`](ASSETS.md) 的缺口段。
