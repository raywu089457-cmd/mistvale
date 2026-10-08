# l0veyou 管線（第三套生圖來源）

Codex ImageGen 額度用完時的替代：<https://l0veyou.com/chat>（需登入），模型選 **GPT Image 2**。
完整 prompt 與每張圖的用途記在 [`../assets/PROVENANCE.md`](../assets/PROVENANCE.md) 的 v1.6 段落。

## 服務狀態實測（2026-10-05）

網頁介面已上線，`/chat` 可用，右側有「AI 生圖」模式。**模型下拉選單共 3 個：**

| 模型 | 備註 |
|---|---|
| **GPT Image 2** | 平台自己建議用這個 |
| GPT Image 2.5 极速版 | 頁面紅字：**「2.5模型不稳定，请用2.0模型」** |
| GPT Image 2.5 满血版 | 同上，不穩定 |

比例選項：`1:1` / `16:9` / `9:16` / `4:3` / `3:4`。

### API 端目前不能生圖（重要）

用 API Key 打 `POST /v1/images/generations` 實測：

```
gpt-image-2 / gpt-image-2.5 / gpt-image-2.5-fast / gpt-image-1
  → 403 {"error":{"message":"Image generation is not enabled for this group","type":"permission_error"}}
dall-e-3 / muse-spark-1.3
  → 400 images endpoint requires an image model
```

`/v1/models` 只回 **1 個文字模型** `muse-spark-1.3`，而且實測是**空殼**——
只會把你的指令改寫成第三人稱短句（問 `17*23` 回 `17*23 multiplication result`，不給 391），
每次還燒 2000–3800 tokens。**不要拿它做批次生成。**

**結論：生圖目前只能走網頁介面，不能走 API。** 權限是按「group」分級開通的，
要開 API 生圖需另外向服務方申請。

### 登入是 Cloudflare Turnstile，自動化過不了

嘗試用瀏覽器自動化登入，網路請求顯示 Cloudflare 回 `.../auto/fbE/failure_retry/...`
→ **被判定為自動化並拒絕**。登入必須真人手動完成。
另外頁面要求「登录 / 注册后即可开始对话」＋「请先完成人机验证」兩個條件。

（2026-10-05 實測，非持久設定，之後可能改變。）

## 實測特性

| 項目 | 結果 |
|---|---|
| 出圖時間 | 約 30 秒 |
| 尺寸／格式 | 1:1 → 1024² 或 1254²，**JPEG**；16:9 → 1536×864，**PNG**（洋紅底乾淨，實測 248,7,248） |
| 比例與切邊 | 1:1 排 4 欄時每格只有 256×512，寶箱／水槽／推車這種寬物件會畫出畫布、被切平（2026-10-03 連兩張都 4 個被切）；prompt 寫「離邊 80px」沒用，物件還變小。**4 欄的表用 16:9**（格子近正方，同 prompt 一次就全在畫面內） |
| 洋紅底 | 不是純 `#FF00FF`（實測約 247,12,227），還會畫淡淡的影子 → 去背要用容差＋色相 |
| 格線 | 聽得懂「4 columns x 3 rows」，但不會排滿整張（下方常留白）→ 用內容外框切格 |
| 兩格動畫 | 同一張圖裡要求「row 2 is the SAME creatures in attack frame」一致性很好 |
| 參考圖 | 站上可上傳，但瀏覽器自動化不方便；純文字 prompt 寫明風格就夠接近 title.png |
| 隱私 | 圖放在公開 CloudFront 網址 |

**每張新圖都開新對話**（右上 +）：「多參考圖」開關會把同對話前面的圖當參考，會污染風格。

## 流程

1. 生圖 → 從頁面取得 CloudFront 網址 → `curl` 存到 `output/l0veyou/<name>-vN.jpg`（原圖原封保存）。
2. 物件表 → 圖集：

   ```sh
   python pipeline/scripts/l0veyou/sheet_to_atlas.py output/l0veyou/props-sheet-v1.jpg props 4x3 sheep,goat,garden,bush,mushroom,cactus,villageBanner,arenaFlag,gate,bridgeRail,stall,barrels
   HUE_TOL=12 python pipeline/scripts/l0veyou/sheet_to_atlas.py output/l0veyou/icons-sheet-v1.jpg icons 5x6 gold,gems,wood,ore,herb,drink,bed,heal,cloth,food,armor,swords,hammer,anvil,bag,skull,hunter,hall,scroll,map,up,boss,trade,horn,gear,-,arrow,star,heart,shield
   NO_HOLES=1 NO_SHADOW=1 HUE_TOL=12 python pipeline/scripts/l0veyou/sheet_to_atlas.py output/l0veyou/vfx-sheet-v1.jpg vfx 4x2 fxSlash,fxOrb,fxHeal,fxStar,fxHit,plot,iconLeather,fxSparkle
   HUE_TOL=12 STRIP_IDS=railing:4 python pipeline/scripts/l0veyou/sheet_to_atlas.py output/l0veyou/flora-sheet-v1.jpg flora 4x2 flowerYellow,flowerPink,flowerBlue,flowerWhite,wheat,cabbage,railing,bridgePost
   python pipeline/scripts/l0veyou/sheet_to_atlas.py output/l0veyou/yard-sheet-v1.png yard 4x2 chest,crates,hayBale,firewood,trough,scarecrow,lantern,wheelbarrow
   ```

   - **碰邊檢查**：任何物件距圖邊 ≤1px（＝被模型畫出畫布、切掉了）就印 `FAIL 物件碰到圖邊（被切掉）：<id>` 並 exit 3，
     **不寫任何檔案** → 重生那張表。`ALLOW_EDGE=1` 可略過。前 6 行（既有圖集）重跑都通過檢查，產出跟 repo 裡的圖集逐像素相同。
   - vfx 那行會印 `magenta殘留=1097`：幾乎全在 fxOrb（紫色法球本體），不是去背殘留。

   - `HUE_TOL`：表裡有粉紅色時調窄（12），不然粉花瓣會被當成洋紅底吃掉。
   - `STRIP_IDS=name:N`：正面、可水平拼接的欄杆段 → 接 N 段 → 剪切成等角斜向長條（manifest 記 frontH／tileW／postW）。
   - 圖集用書架式排版（每塊只佔自己的寬），長條欄杆不會把每一格撐大。

   產出 `assets/<prefix>@1x/@2x.png` + manifest（跟 details 同契約）。`MIN_PX` 濾掉飄葉／泡泡等小碎塊，
   不然它們會被分到隔壁格、把外框撐大。輸出最後一行 `magenta殘留=0` 才算過。
3. 材質 → `python pipeline/scripts/l0veyou/make_plaza_tile.py output/l0veyou/cobble-v1.jpg`（色調對齊概念圖廣場、做無縫、縮 256）。
4. `npm run build && npm test`。

## 接進遊戲

- `build.mjs`：`props` / `flora` 兩組圖集照 details 的方式內嵌；`plaza` 走單圖清單。
- `pixel-world.js`：
  - `ensureDetailAtlas()` 一起載 props / flora（cell id 不重複，共用 `detailLod`）。
  - `PROP_ATLAS` 表：裝飾型別 → [cell, 外框寬, 外框高, 偏移]；外框沿用舊程序版尺寸，版面不跑。
  - `drawAtlasMonster()`：兩格動畫一律以第 0 格算倍率，動畫不會忽大忽小；依移動方向左右翻。
  - 廣場：`plazaCells` 收集格子 → 一次 clip 整片填 `plazaPattern`（不逐格貼，石塊才不會被切碎）。
  - 新增概念圖元素：交易所旁攤位、酒館／鐵匠／旅館／餐廳旁木桶、南街入口村旗。
  - flora：`FLOWER_ATLAS` 四色小花；田改成 wheat／cabbage 裝飾；`drawRailSlice()` 每個橋欄只畫長條上自己那一格，最後一根只畫柱子。
  - 草地：`GRASS_TONE` 把 village／meadow／birch 材質與底色的平均／標準差配到概念圖草地取樣。
  - 驗收鉤子：`__mistvaleDetails().proc`（退回程序繪製的計數）、`__mistvaleResetProc()`。
  - yard（2026-10-03）：`build.mjs` 前綴清單加 `yard`、`ensureDetailAtlas()` 加 `yardAtlas(+2x)`、`PROP_ATLAS` 加 8 個型別，
    村莊裝飾區塊放 8 個位置。`__mistvaleView.landscapeStats().decor` 列出所有裝飾的型別與座標（驗收用）。
- **新道具的擺放：要「看得到」，不是「不在路上」就好。** 畫面依 x+z 排序繪製（建築 +0.2）：x+z 比建築小、
  又落在建築精靈的螢幕範圍內，就會被整棟蓋住（第一版稻草人在治療所後面、木箱在交易所側牆後、柴堆在鐵匠鋪側牆後，全看不到）；
  建築名牌畫在最上層，貼著門口放也會被蓋（寶箱）。預設布局下田地大半、交易所四周都被前面的建築擋住。
  做法：用 `getRoads()`／建築外框／建築精靈尺寸（concept-clean 的寬高比）／名牌（縮放 1.25／1.6／2.6）／樹冠／其他裝飾
  算出可見的候選點，再截圖確認。

## 對齊驗收（量測，不靠目測）

在遊戲頁按「村莊」再按 3 次「+」，console 貼上 [`scripts/l0veyou/measure_alignment.js`](scripts/l0veyou/measure_alignment.js)：

| 版本 | Bhattacharyya | 直方圖交集 | 亮度 | 飽和度 |
|---|---|---|---|---|
| 概念圖 title.png | 1 | 1 | 101.5 | 0.591 |
| 改動前（git HEAD） | 0.753 | 0.482 | 127.4 | 0.463 |
| l0veyou 素材 + 石板廣場 | 0.794 | 0.541 | 121.8 | 0.480 |
| ＋花草／橋欄／草地色調對齊 | **0.823–0.833** | **0.560–0.597** | 110–116 | 0.47–0.51 |
| ＋土路改概念圖土色、建築接地陰影 | 0.825–0.826 | 0.565 | — | — |
| ＋比例對齊、樹冠色調、鋪面透視、地面殘留平塗清除、生態域交界、海岸、木頭 UI | **0.870–0.871** | **0.614** | — | — |

（範圍是不同幀：角色在走動。）

（上表最後一列：比例對齊後構圖更接近概念圖，分數才突破原本 0.83 的平台。）

2026-10-03 重量（Playwright Chromium、視窗 1440×900、按「村莊」再按 3 次「＋」→ 縮放 3.11，各取 3 幀）：
線上版（commit 7544514）Bhattacharyya 0.777／交集 0.486；加入 yard 道具後 0.778／0.486，`proc` 都是 `{}`。
上表的 0.87 在這個條件下沒有重現——量的是畫布中央區，數字跟視窗大小有關，**前後比較要用同一個條件**。

**天花板在構圖，不在顏色。** 同構圖下分色群比例已接近概念圖（綠 26% vs 19%、米色 37% vs 31%、藍 7% vs 11%），
剩下的差距來自概念圖是一張手繪構圖（建築更密、角色更多、沒有 UI 與小地圖），遊戲是可操作的地圖。
直方圖相似度要到 1.0 只能把概念圖本身貼上畫面，那就不是遊戲了。試過整張畫面加 saturate／brightness 濾鏡，相似度反而降到 0.75–0.80，所以不做全域調色。
另一條硬指標：`__mistvaleDetails().proc` 在全景視角（全世界）是 `{}` —— 沒有任何裝飾退回程序繪製。

## 村莊外的延伸（以概念圖為基準）

概念圖只畫了村莊；村莊外的區域沿用同一套色調與素材延伸：

| 項目 | 做法 | 依據 |
|---|---|---|
| 土路 | `road.png`（l0veyou 生 `dirt-v1.jpg` → `make_plaza_tile.py ... road 205,158,78 26,24,30`），整片 clip 填 | 概念圖小路取樣 (205,158,78) |
| 石板路 | 沿用 `plaza.png` | 概念圖廣場 |
| 戰鬥空地 | 土路材質 60% 疊在草地上（踩出來的草地）；雪原／霜杉林保留雪色 | 同上 |
| 河／海 | `GRASS_TONE.river/ocean` 把材質配到概念圖溪流 (31,140,201)；世界外圍的海改鋪 ocean 材質 | 概念圖右下溪流 |
| 森林地面 | `GRASS_TONE.forest` (52,90,40)、`taiga` (92,124,104) | 概念圖左下松林 |
| 林地密度 | 第二層密樹（獨立亂數 77031）：森林 70%、霜杉林 62%、樺林 38%、雪原 20% 雪松 | 概念圖四周的林地密到看不見地面 |
| 沙漠／山地 | 補仙人掌、碎石、岩峰；沙漠小花改碎石；岩峰／洞穴／遺跡外框放寬到 44–50（原本被壓成小石頭） | 延伸 |

`__mistvaleDetails().proc` 在全景（全世界）與村莊特寫都是 `{}`。

## UI 圖示、戰鬥特效、空地

- `pixel-icons.js`：`iconCanvas()` 先回傳程序版，icons@2x（＋vfx 裡的 iconLeather）載完後把所有已建立的圖示 canvas 重畫成圖集版（48px，CSS 顯示 24px）。`__mistvaleIcons()` 看狀態。
- `drawAtlasEffect()`：斬擊／命中／治療／升級星／閃光用 vfx 圖集原地放大淡出；箭（icons 的 arrow）與法球（fxOrb）沿彈道飛，箭依方向旋轉。
- 未建設的空地：`plot` 施工地基取代虛線菱形與「＋」。
- 退回程序繪製時都記進 `procUse`（`fx:<type>`、`plot`），驗收時 `__mistvaleDetails().proc` 仍必須是 `{}`。
- 小地圖／主世界地圖：`MAP_PALETTE`（從 `pixel-world.js` 匯出，= 畫面地面用的同一套概念圖對齊色）取代舊的 `BIOME_PALETTE`，外圍海用 `MAP_ACCENT.sea`。

## 比例、透視與全畫面一致（第三輪）

以概念圖的大廳當尺：概念圖大廳約 440px ＝ 遊戲 112 世界單位（1px ≈ 0.255 單位）。

| 項目 | 概念圖量測 | 舊 | 新 |
|---|---|---|---|
| 羊／山羊 | 約 30px → 8 單位 | 18 | 10 |
| 松樹 | 約 120px → 30 單位 | 村內 62、林地 45–65 | 村內 36、林地 30–45；密樹層密度加倍補回林冠 |
| 村旗／戰鬥旗／閘門 | 約 75px → 19 | 32 | 19–20 |
| 路燈 | 45–60px → 12–15 | 24 | 15 |
| 木桶堆 | 約 45px → 11 | 18 | 11 |

- **樹冠色調**：`FOLIAGE_TONE` 只改綠色葉子像素（樹幹、外框、雪不動），松樹配到概念圖松林葉 (46,115,47)，闊葉配到 (87,132,29)。
- **鋪面透視**：石板／土路垂直壓到 `PAVE_SQUASH=.36`（3/4 俯視的扁石塊）；壓扁在載入時用平滑縮放烘進材質，繪製 1:1，避免最近鄰小數縮放的摩爾紋。
- **地面殘留平塗**：西側林地、釣魚池（沙岸＋水材質）、建築地基（石板）、菜園翻土（壓暗土路）、空地外圈石頭（岩石圖集）、水面浪花色（概念圖溪流亮/暗藍）全部換掉。每格固定位置的小點綴在有材質時不畫（放大會排成斜格紋）。
- **生態域交界**：沿交界撒不規則鄰區材質斑塊，只撒在不同材質之間（草地對草地不撒），裁切在陸地格子內（不蓋到溪流）。河岸放岩石。
- **海岸**：陸地碰海的地方鋪沙岸（沙漠材質）＋礁石；地面畫布外的螢幕背景也鋪同一片海材質，拉遠不露平塗色帶。
- **戰鬥空地**：不規則橢圓、三圈淡入，不再是格子菱形的鋸齒邊。
- **地面解析度**：桌機 `GROUND_RES=2`（4800×2900），放大時地面細節跟 2x 精靈一致；觸控裝置維持 1 倍。
- **踩過的坑**：`Path2D.ellipse()` 會從上一個子路徑終點拉直線過來，大量橢圓放在同一個 Path2D 會連成巨大多邊形（整張地圖出現斜條紋）。一律用 `addEllipse()`（先 `moveTo` 起點）。

## UI 皮膚（概念圖色票）

取樣 title.png：木頭 (87,42,14)/(131,72,34)/(185,107,69)、旗布藍 (6,37,81)/(16,60,127)/(50,91,157)、金 (218,178,71)、羊皮紙 (225,197,169)。

- 上下工具列、面板、開始畫面：`woodui.png`（l0veyou 生的木板材質 `wood-v1.jpg`，色調對齊概念圖木頭 131,72,34）＋漸層；`pixel-ui.js` 啟動時注入 CSS 變數 `--wood-tex`。
- 面板標題／對話框標題／區域徽章：概念圖村旗的寶藍布＋金邊。
- 按鈕：木頭；主要按鈕金色；藍色按鈕用旗布藍。卡片、分頁、表格、提示、地圖框：深木底＋黃銅邊。
- 畫面上的標籤（建築名、區域名、獵人名）：木牌底＋黃銅底線；血條底改深木色。

## 全地圖驗收（8 區域 × 3 縮放，量測）

腳本：[`scripts/l0veyou/verify_all_regions.js`](scripts/l0veyou/verify_all_regions.js)（進遊戲後貼進 console，約 80 秒；鏡頭每站等 2.5 秒，太早量會量到移動途中）。

- **conform**：像素落在概念圖 48 色 k-means 色票附近（RGB < 32）的比例。概念圖自己 = **0.91**（量化上限）。
- **gamut**：像素顏色（32 階、容許相鄰一階）在原尺寸概念圖裡出現過的比例。概念圖自己 = 0.999。
  k-means 會把概念圖裡少量的白（炊煙、羊毛、雛菊）吃掉，所以雪地、樺樹、白花在 conform 會被低估；gamut 不會。
- **proc**：該畫面退回程序繪製的物件，必須 `{}`。

| 區域 | far conform | mid conform | close conform | gamut（三種縮放） | proc |
|---|---|---|---|---|---|
| 暮影村 village | 0.908 | 0.924 | 0.929 | 0.995–0.999 | {} |
| 向陽草原 meadow | 0.819 | 0.873 | 0.839 | 0.995–0.997 | {} |
| 橡木密林 forest | 0.857 | 0.890 | 0.844 | 0.998–0.999 | {} |
| 霜杉林地 taiga | 0.836 | 0.704 | 0.753 | 0.995–0.996 | {} |
| 白霜雪原 snow | 0.846 | 0.672 | 0.439 | 0.994–0.999 | {} |
| 鐵脊山麓 mountain | 0.907 | 0.860 | 0.864 | 0.998–0.999 | {} |
| 赤金沙地 desert | 0.924 | 0.922 | 0.914 | 0.998–0.999 | {} |
| 白樺花原 birch | 0.916 | 0.879 | 0.743 | 0.996–0.999 | {} |
| （概念圖自身） | 0.910 | | | 0.999 | |

- 所有區域、所有縮放的 **gamut ≥ 0.994**：畫面上幾乎每一個像素的顏色都是概念圖裡出現過的顏色。
- conform 偏低的格子（雪地近景、霜杉林中景、樺林近景）都是白色主導（雪、樺樹皮、雛菊）——白色在概念圖裡是少量的暖白 (230,224,214)，
  雪地已經配到這個暖白；它在 gamut 裡全部算數。
- 手機尺寸（375×812、觸控）另外驗過：木頭 UI、地圖、圖示、`proc={}` 都正常（地面解析度 1 倍）。
- 量測期間順手修掉的：沙地戰鬥空地疊土會變髒（沙地不疊）、建築/區域名牌的灰綠底改木牌。
