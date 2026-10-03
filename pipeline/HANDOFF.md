# 交接：概念圖對齊（2026-10-03）

接手先讀這頁，細節在 [`align.md`](align.md)（量測與做法）、[`l0veyou.md`](l0veyou.md)（生圖管線）。

## 目前狀態

- 分支 `main`，本機比 `origin/main` 多 **7 個 commit，還沒 push**（push 到 main = 自動部署 GitHub Pages，要先問使用者）：
  `c0017bd` 構圖/地面/樹/道具/角色 → `9ee15f5` 六棟建築重生 → `20cb071` Q 版獵人 → `552b8e1` 紫屋頂/酒館/陰影
  → `312d0fd` 土路色調 → `03064c7` 文件 → 本頁與 generate.mjs。
- 線上版（Pages）還是 `7544514`（l0veyou 素材圖集）。
- 驗證全過：`npm test` 10/10、`check_atlases.py` 25/25、`check_embedded_assets.mjs` 13/13、
  8 區 × 3 縮放 `proc={}`、手機 390×844 無錯誤 30fps。建置 34.0 MB（原 31.1）。
- 未追蹤：`output/l0veyou/test-sheet-v1.jpg`、`v2.jpg`（被碰邊檢查擋下的測試圖），使用者還沒決定留或刪，**不要 commit**。

## 使用者的要求（不要改回去）

- 目標：全部美術以 `assets/title.png` 為基準對齊，目標 100%。**1.0 做不到**（概念圖是手繪構圖），要用數字回報、講清楚差在哪。
- **人物、怪物維持原本大小**（`CHAR_SCALE=1`：獵人 21、魔物 28–33、首領 50）。不要為了概念圖比例縮小。
- 從手機 App 遠端操作時不要用選擇題 UI，用純文字問。

## 數字（同構圖，`pipeline/scripts/align/capture.mjs` + `metrics.py`）

| | 開始前 | 現在 | 概念圖 |
|---|---|---|---|
| hist_bc | 0.836 | 0.920 | 1.0 |
| conform（48 色票） | 0.921 | 0.929 | 0.936（上限） |
| 色群差 group_l1 | 0.321 | 0.220 | 0 |
| 亮度 | 113.5 | 107.1 | 101.6 |
| 土色比例 / 暗部 | 33% / 10% | 39.7% / 14.7% | 30.3% / 18.5% |

`verify_all_regions`（1440×900，線上舊版 → 現在）：村莊 0.877/0.777/0.790 → 0.887/0.791/0.807，其他區持平或更好。

## 還沒對齊的（建議下一步，依效益排序）

1. **土色太多、暗部太少**：概念圖地面上壓滿角色、道具、陰影。可再加角色/道具密度，或在建築、道具腳下加概念圖那種貼地暗影。
   用 `metrics.py` 的色群比例與分塊差異圖（見 align.md 的做法）找位置。
2. **概念圖下方中央的石橋、右下瀑布、釣魚人**還沒做（概念圖 (690–860,1100–1254)、(1170,1060)、(1050,1180)）。
3. **獵人小屋**被村莊東邊界（x ≤ 8，柵欄 x=9）卡住，比概念圖偏左上；放大成畫寬 100 補償。要再對齊得動邊界／柵欄（會影響道路測試）。
4. 材質（`concept-*.png`）是 48px 樣本拼的，近看有規則感；可改大樣本或換合成方法（`concept_textures.py`）。
5. 村民（l0veyou villagers）與新獵人風格接近但不是同一批生的；需要的話用 `heroes-ref.png` 當參考重生村民。

## 環境與工具（不在 repo 的東西）

- **l0veyou 生圖**：專用瀏覽器設定檔 `work/.l0veyou-profile`（已登入，在 repo 外）。啟動：
  `"%LOCALAPPDATA%/ms-playwright/chromium-1217/chrome-win64/chrome.exe" --remote-debugging-port=9447 --user-data-dir="<work>/.l0veyou-profile" https://l0veyou.com/chat`
  （9333 被別的程式佔用。）登入失效就請使用者在那個視窗登入，不要要密碼。
- 生圖：`[REF=參考圖] node pipeline/scripts/l0veyou/generate.mjs prompt.txt output/l0veyou/<名>-v1.png "" 16:9`
- 處理：物件表 `sheet_to_atlas.py`（有碰邊檢查）、單棟建築 `align/make_building.py`、獵人 `align/make_heroes.py`。
  **紫色主體**一律 `NO_SHADOW=1 NO_HOLES=1 HUE_TOL=12`。
- Playwright：全域安裝（`npm root -g`），腳本會自動找。

## 踩過的坑

- 改建築預設位置要把舊預設加進 `ART_LAYOUT_HISTORY`（存檔遷移），並跑 `npm test`：酒館移到 (-3.5,20.4) 會讓 test-landscape 道路使用率不及格 → 改用 `SPRITE_SHIFT`（只移圖、不動佔地）。
- 新圖集 cell id 不能跟既有圖集撞名（icons 有 `anvil`，所以道具叫 `anvilStump`）——detailLod 共用。
- 上傳參考圖後，頁面上的參考圖縮圖會被誤認成結果；generate.mjs 已排除 `data:` 網址。
- 道具擺放要檢查「看得到」：x+z 小於後畫建築就會被蓋住、名牌畫在最上層（l0veyou.md 有說明）。
