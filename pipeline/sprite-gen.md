# 主管線：sprite-gen（生圖 → 切格 → 組圖集 → 進遊戲）

這是 Mistvale 素材的**主要生產管線**。生圖引擎是 **Codex 內建 ImageGen**（ChatGPT／Grok），
後處理工具是 **sprite-gen**（`C:\Users\ray\tools\sprite-gen`，v2.11.0，Python）。

一句話：**ImageGen 生出乾淨的圖 → sprite-gen 切格去背組圖集＋manifest → 整合進 `pixel-world.js`／`build.mjs`。**

---

## 0. 工具與前置

| 需要 | 位置／說明 |
|---|---|
| sprite-gen | `C:\Users\ray\tools\sprite-gen`（先讀它的 `SKILL.md`） |
| codex CLI | `gen --provider codex`（走 ChatGPT OAuth，要額度） |
| ffmpeg、img2webp | 影片／WebP 才要；純圖集可略 |
| 額度 | Codex 額度會用光（10/4 前就用光過）。跑前先確認 |

入口（sprite-gen 自己的引導，會檢查權限、組合預設、只問缺的選項）：

```bash
$SPRITE_GEN_ROOT/.venv/bin/sprite-gen workflow --kind sprite   # 做 sprite
$SPRITE_GEN_ROOT/.venv/bin/sprite-gen workflow --kind image    # 單純生圖
```

---

## 1. A 產線（生 sprite 圖集的標準流程）

實測跑通過的七步（以一隻角色、idle/attack/jump 三動作為例）：

| # | 步驟 | 做什麼 | 結果 |
|---|---|---|---|
| 1 | **生角色底圖** | 1 張，Codex 生圖（天生帶 alpha） | ~37s |
| 2 | **prepare** | 自動量底圖選色鍵色（綠／洋紅，避開角色本身顏色） | `#00FF00`／`#FF00FF` |
| 3 | **gen-set** | 生多條 sprite 橫列（每個動作一條，各 N 格） | ~82s/列 |
| 4 | **extract** | 切格 + 去背 | 全透明 |
| 5 | **compose-atlas** | 組圖集 + `manifest.json`（`frame_layout`） | e.g. 512×384 |
| 6 | **compose-gif** | 產透明預覽 GIF | QA 用 |
| 7 | **inspect + score** | QA 驗收（分數／錯誤／警告） | 目標 100、零錯誤 |

身份保持看 `inspect` 報告的**直方圖相似度**（>0.9 = 同一隻沒變形）。

> **色鍵顏色要看主體**：角色是綠的就**不能用綠幕**，改洋紅 `#FF00FF`。prepare 會自動量，
> 但要人工確認沒誤刪角色顏色。

## 2. 四階段（套到 Mistvale 的實際內容）

Mistvale 跑了四輪 A 產線，產出四種圖集，**都已推進正式專案**：

| 階段 | 圖集 | 內容 | 報告 |
|---|---|---|---|
| 1 | `buildings@1x/@2x` | 12 棟建築（4×3） | `reports/INTEGRATION.md` |
| 2 | `details@1x/@2x` | 地圖細節裝飾 | `reports/DETAILS.md` |
| 3 | `terrain-atlas` | 無縫地面材質 | `reports/TERRAIN.md` |
| 4 | `hero@1x/@2x` | 獵人六職業 | `reports/HERO.md` |

每階段都產 **1x（日常）＋ 2x（放大）** 兩套 LOD。

---

## 3. 整合進遊戲（integrate 腳本）

`scripts/sprite-gen/integrate_{atlas,details,terrain,hero}.py` 就是把圖集接進遊戲的腳本。
手法：**用唯一錨點定位 → 逐步 replace → 每步 assert**（避免靜默改錯地方）。

做的事：
1. 備份 `pixel-world.js` / `build.mjs`（`.pre-atlas.bak`）
2. 複製圖集＋manifest 進 `assets/`
3. `build.mjs`：換掉舊硬切格清單、注入 manifest 圖集的 base64＋載入
4. `pixel-world.js`：加 `atlasCell` / `drawAtlasBuilding`、掛 LOD、插除錯鉤子 `__mistvaleAtlas`
5. 自我檢查：確認舊的 `buildings14` 硬切格已移除

> ⚠️ **這四支是一次性腳本，路徑寫死打在工作副本**
> `C:\Users\ray\sprite-demo\mistvale-work\proj`（POC 圖集在 `...\buildings-poc\lod`）。
> **不是**打在正式專案。正式專案已整合完。要重跑先改 `PROJ`／`POC` 常數。

---

## 4. 驗收（看數字，不看感覺）

- **載入驗證**：`__mistvaleAtlas()` 除錯鉤子看 `ready`／`lods`（每段 LOD 的格數）。
- **使用驗證**：`atlasUse` 計數器——實測「圖集真的被畫到」，不是只看有載入。
  目標 `atlas=全走、proc=0`、0 console 錯誤。
- **畫質驗證**：圖格要**離線 LANCZOS 先縮好、執行時 1:1 貼上**。在瀏覽器裡最近鄰縮小會糊。
- **風格量化**：跟 `title.png`／`buildings14.png` 比 飽和／明度／色相／描邊／暖色（表見 comfyui.md）。
- **回歸**：`npm test` 全 PASS、`npm run build` 截圖正常。

## 5. 已知坑（都踩過、都修了，不報錯但白做）

| 坑 | 症狀 | 修法 |
|---|---|---|
| 職業 id 對不上 | 全退回程序繪製、無錯誤 | 圖集 key 對齊 `pixel-data.js` |
| 立繪快取不失效 | 新舊逐像素相同、圖集白做 | 圖集載入後清 `portraitCache` |
| sprite 載入前被快取 | 舊圖永久佔住 | 載入時清 `spriteCache` |
| 快取 key 不分 LOD | 放大也用不到 2x | key 加上 LOD |
| 瀏覽器內縮小 | 圖糊掉 | 離線先縮好再 1:1 貼 |
| manifest `image`/`scale` 錯 | LOD 判錯（歪打正著） | 修 manifest；`scale` 欄位要對 |
