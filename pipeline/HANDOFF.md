# 交接：概念圖對齊（2026-10-03）

## 2026-10-04 夜:拿掉河流橋梁、木柵欄兩出口、村內嚴格走路、朝向檢查(最新)

- 狀態:main 本機 commit,**未 push**(push = 部署 Pages,先問使用者)。
- 地形:`overworld.js` 拿掉河流/小溪/所有橋(`BRIDGES`、`riverX`、`creekX`、`isBridge`、`isWater` 都刪了),`walkable = inWorld`;世界內全是實地。
  畫面上的河面、橋欄、石墩木橋、瀑布、溪邊苔石、河面閃光也一起拿掉(`stream` 圖集還嵌在建置裡但沒用到)。公園池塘(街區裝飾)保留。
- 村莊:`village-grid.js` 的 `FENCE`(四邊,離街緣 0.45)+ `EXITS` 兩個出村口:東門＝畫面右下(z=7.25 那條街)、南門＝畫面左下(x=-13.25 那條街),到村子最下角距離相同。
  `landscape-layout.js` 的 `PALISADE` 依 FENCE/EXITS 切段(實心碰撞),畫面用等角 `fenceRail`(南北邊翻面),門口兩側 `gate` 旗柱。
- 道路:只有村內石板街 + 兩條街穿過門口鋪到門外 1.2 格(`EXITS[].out`);村外沒有路(地下城入口也沒有路)。
- 導航(`pixel-game.js`):村內 = `roadGraph(roads)`(路段在交叉點切開)只沿路中心線走,村裡的起終點投影到最近路段;
  村外 = 可視圖(門外點、村莊四角外 0.9、村外建築四角),直線自由走,不能穿過村莊範圍。新獵人出生點投影到路上。
- 動作方向:
  - 戰鬥中被「分散站位」推開時不播走路圖(原本面向目標+走路圖＝倒退走,推力也比走路快),推力 2.4→1.2。
  - 魔物倒下:沿用受擊圖與朝向(面向打倒牠的獵人);原本 flipHint 反了,死亡瞬間會翻面。
  - 停著等空位的魔物面向牠盯著的獵人(sim 記 `facingAt`)。
  - 新 hook `__mistvaleFacing()`:每隻最後畫出的朝向/姿勢。
- 驗收:`npm test` 全過(含柵欄只有東/南兩口、路只到門口、村內 100% 在路中心線);
  `node pipeline/scripts/check/check_gates.mjs`(7 區 × 600 秒:東門 375、南門 83 次進出、穿柵欄 0、村內離路 0/115588);
  `node pipeline/scripts/check/check_facing.mjs 60 look:19,3,2.6`(實機每幀:英雄走路 0/5914、英雄戰鬥 0/685、魔物走路 0/27152、魔物戰鬥 0/247 錯誤);
  各視角 `proc={}`、無 pageerror。
- 對概念圖:概念圖有溪與石橋,拿掉後 hist_bc/conform 沒重量(使用者要求優先)。

## 2026-10-05 晚：動作方向、走路循環、戰鬥站位（最新）

- 狀態：main 比 origin 多 1 commit（1eb51de 戰鬥站位，未 push）；之前全部已上 Pages（f08a3f6）。
- 英雄走路：4 格循環 walk1–4（`walk4-<職業>-v1.png` 綠底，以各職業待機圖為參考），`walkFrame()` 每秒 8 格；舊 walkA/B 保留未用。
- 方向規則：所有圖朝右、往左走/打就鏡像；受擊一律面向打來的一側（受擊圖＝被右邊打往左退）。魔物走路用第 3 格（側面），史萊姆著地壓扁/騰空圓。
- 戰鬥站位：草原空地 x19 半徑 5.8（landscape-layout ARENAS）；魔物只在空地內 1.2 格追；等空位的魔物站到戰鬥另一側；目前狩獵區上限 5。
- 驗收工具（scratchpad，不在 repo）：擺拍方向／特效時間軸、四方向走路連拍、魔物走路連拍；repo 內 `check_heroes.py`（6×10 姿勢×3 LOD）。
- 已知未完：戰鬥正下方等待的魔物仍可能半擋英雄（有半透明重畫與最上層血條）；與獵魔村物語的相似度是目測，沒有實機截圖比對。
- l0veyou：登入存在 `work/.l0veyou-profile`；用前啟動 chrome 9447，用完關。

## 2026-10-05：建築等角幾何、英雄 Q 版無破圖

- 建築：委託所原本是正面平板（不符 2:1 等角）→ 重生等角涼亭 `bounty-concept-v3.png`；`fitScaleFor` 另算「貼地輪廓外框中心」把佔地置中到街區（原本都偏後半）。
- 英雄：`make_sd_heroes.py`（Q 版 2 頭身，1x/2x/4x）。法師的紫水晶跟洋紅底同色 → 法師改用綠底單獨表 `sd-sorcerer-v1.png`（`solo=sorcerer:…`，出手格左右翻轉）。
  其他職業：`regreen()` 用「跟圖邊連通」找背景＋被包住的純底色洞，`clean()` 清外緣洋紅、縫裡殘色改描邊色。
- 驗收：`python pipeline/scripts/align/check_heroes.py 總表.png` → 6×7×3 無缺格／洋紅／綠色殘留／碎裂、姿勢高度一致。

## 2026-10-04 下午：建築不壓街、可搬可縮放、地面高解析、拿掉村民

- 建築畫的大小＝min(玩家設定 `layout[id].s`(0.6–1.6), 街區容得下的最大值)。`fitScaleFor()` 用圖的實際像素算：錨點以下的像素要落在街區內、左右不超過街區菱形角。`world.buildingScale(id)` 給 UI 顯示。
- 搬家吸附到最近街區正中；目標街區有建築就互換；廣場不能蓋。被佔用的田/公園等街區不再擺設（池塘也跟著消失）。建築面板有「縮小／放大」。
- 地面畫布改成只涵蓋陸地（2345×1180 邏輯單位）、桌機 4 px/單位、手機 2；`TERRAIN_TEX_SCALE` .5→.25，材質細緻度跟建築圖同級。
- 村民、貓狗、釣魚人拿掉，街上只剩英雄；廣場只留四角矮花圃。

## 2026-10-04：棋盤格村莊、各區生怪、走路/休息圖

- **`src/village-grid.js` 是村莊布局的單一來源**：5×5 街區（10.5 單位），建築預設位置、石板街、柵欄/出村口、街區用途（田、果園、市集、公園池塘、水井廣場、畜欄、牧草地、花園、柴場）都從這裡算。廣場固定 (-8,2)。
  概念圖的地面分類／道具／人物在村裡已不用（`concept-*.js` 還在，只剩匯入）；村莊地面層 `buildVillageLayer` 改用街區路徑畫。
- 世界 minX -30 → -54；`WORLD.threeXArea` 保留原 3 倍面積當下限。
- 生怪：`REGION_MIX` 每區組成、強度＝難度 × region.risk；目前狩獵區上限 7、其他區上限 4；獵人只打目前狩獵區。
- 姿勢圖：heropose（strike/windup/hurt/walkA/walkB/rest）、monsteratk（2 攻擊、3 走路、4 受擊）。`make_combat_art.py heropose pose=檔 …`、`monsteratk 2=檔 3=檔 4=檔`。

## 2026-10-03 深夜：地形、道路、文字

- 文字：畫布改裝置解析度（devicePixelRatio，上限 2.5），像素圖照舊最近鄰放大；`textLabel()` 只排隊，最後在 `drawScreenText()` 用高解析畫。
  戰鬥空地不再顯示地名／「戰鬥空地」／首領名／礦坑名；地名只在拉遠時畫在空地外緣。
- 海岸：`visBiome()`＝畫面地形（含世界外一圈不規則延伸陸地，EXT=11，只是風景、不能走）；沿岸圓斑＋白浪；沙灘只在草/林/沙漠，山地灰碎石岸，雪地直接接水。
- `biomeAt` 加中頻起伏（邊界不再是長直線）；雪地改冷白；山地空地不鋪土。
- 地貌圖集 `cold`（雪堆、冰湖、冰晶岩、山崖）、`woods`（倒木、樹樁、苔石、蕨叢），依地形散佈。
- 道路：在等角座標描線（圓頭、蜿蜒）＋遮罩填材質；行走用的 `getRoads` 不變。
- 數字：hist_bc 0.927、conform 0.933；npm test 10/10；proc={}；手機/桌機 30fps。

## 2026-10-03 晚：陰影、戰鬥動畫、村民風格（commit 4959b8d、f6ef8a3、6d7b91e 之後）

- **陰影**：光從右上（概念圖），`shadowFor()` 把每個圖的剪影往左下投影（人物/樹/旗＝整張一個地面；建築/圍籬＝每欄地面），
  全部畫進 `shadowLayer` 再一次壓上地面（重疊不疊黑），物件畫在 `spriteLayer`。g 是「目前那一層」。拿掉建築腳下大橢圓。
- **戰鬥**：模擬只記 `atkAt/hitAt/atkX/hitFromX`，`combatPose()` 算蓄力→出手→受擊；`heropose` 圖集（strike/windup/hurt，
  `make_combat_art.py heropose`）、`monsteratk`（slime2…boss2）。特效時間軸：effect.delay 秒後才命中（箭/法球在飛）。
  清晰度：目標紅圈、血條/名牌延後到最上層（`overlays`）、被擋住的戰鬥中英雄半透明重畫、每位獵人最多兩隻近身、魔物不上橋、站位分散。
- **村民**：`villagers-sheet-v2`（英雄表當參考圖重生），跟英雄同像素密度（`make_combat_art.py villagers`）。
- **地圖**：戰鬥空地 rz 6→7.5；`stream` 圖集（石墩木橋 z=18、瀑布、苔石岸、釣魚人）；草原補花叢/灌木；河岸平滑。
- 數字：hist_bc 0.920→0.927、conform 0.929→0.932（上限 0.936）；npm test 全過；`proc={}`；手機/桌機 30fps 無錯誤。
- 驗戰鬥：`globalThis.__mistvaleGame`（新 hook）＋鏡頭對準戰鬥者質心連拍。


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
