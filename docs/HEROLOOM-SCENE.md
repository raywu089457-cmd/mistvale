# HeroLoom 場景美術：確定性重上色（task-7）

狀態：完成（2026-11-15）。交付檔案在 `assets/heroloom-scene/`，原始檔完全沒動。

## 1. 背景與目的

英雄換成 HeroLoom 之後（64×56 cell、暖色故事書粉彩、厚而柔的深色描邊），場景其餘素材還是舊的冷、暗像素風。這份工作**不重畫、不叫 Muse、不動版面**：把既有場景 PNG 用決定性（deterministic）的程式重新上色、加描邊、修接縫，讓它們跟 HeroLoom 的色溫與柔和度一致。atlas 的 cell 座標、manifest、尺寸、alpha 形狀全部保持不變。

## 2. 交付內容（`assets/heroloom-scene/`）

| 檔案 | 尺寸 | 說明 |
| --- | --- | --- |
| `plaza.png` | 256×256 | 村莊廣場／石板路，無縫 |
| `terrain-atlas.png` | 1024×768 | 12 個 256×256 地形 cell（manifest 未複製、未修改） |
| `woods@1x.png` / `@2x.png` | 322×72 / 636×144 | 倒木、蕨類、樹樁、苔石 |
| `flora@1x.png` / `@2x.png` | 236×44 / 460×88 | 花草 |
| `props@1x.png` / `@2x.png` | 496×338 / 982×674 | 攤位、木箱、木桶、麻袋、柵欄、井、路燈…… |
| `details@1x.png` / `@2x.png` | 462×1294 / 920×2580 | 樹木、巨石、洞穴、廢墟等大型裝飾 |
| `cold@1x.png` / `@2x.png` | 464×116 / 920×232 | 冰／雪場景裝飾（額外） |
| `villagers@1x.png` / `@2x.png` | 202×41 / 374×76 | 村民／貓狗（額外） |
| `xilurus/tex-{desert,dirt,forest,grass,ice,meadow,mountain,snow,soil,stone,taiga,water}.png` | 12 × 256×256 | 生物群系貼圖，全部無縫 |
| `palette.json` | — | HeroLoom 參考色階（96 色 ramp）+ 廣場暖石灰階，供文件／比對用 |
| `restyle-report.json` | — | 每個檔的尺寸、顏色數、接縫、色相、調色盤、來源 |

- 原始 `assets/*.png` 一個都沒有覆蓋，manifest 也沒有複製到輸出資料夾。
- `build.mjs` 端由 Lead 接好「有 `assets/heroloom-scene/<rel>` 就優先使用」（`sceneOrOrig()`），所以把檔案放好就會被吃到，`PIXEL_ASSETS` key 不變。`xilurus/tex-*.png` **目前 build 沒載入**，先交付備用。

## 3. 方法

腳本：`pipeline/scripts/heroloom/restyle-scene.mjs`（純 Node，只用 `node:zlib`，沒有 Pillow／ImageMagick／任何 npm 依賴）。

1. **PNG 編解碼**：`pipeline/scripts/heroloom/png.mjs` 自寫（inflate 後手動 unfilter、Paeth；8-bit、非 interlaced、color type 0/2/3/4/6、PLTE/tRNS）。輸出以索引色 PNG（PLTE + tRNS）為主，顏色超過 256 才退回 RGBA；filter 0、deflate level 9。
2. **色階取樣**：從 68 張 HeroLoom 參考圖（`assets/heroloom-buildings/**`、`assets/heroloom-outfits/*.png`、`assets/heroloom/parts/**`）取不透明像素，共 929 色；OKLab 加權 median cut 成 96 色核心 ramp，寫進 `palette.json`。這個 ramp **只做參考／距離量測，不是把內容硬吸過去的色盤**（第一版就是這樣做，結果草變黃、水變綠，已被打回）。
3. **保留色相的轉換**（每像素，OKLab）：
   - `L' = L + 0.06·(1−L) + 0.012`（暗部提升，亮部幾乎不動）
   - 彩色：`C' = min(C·0.90, 0.14)`，**色相不動**，然後量化 L 步長 0.04、C 步長 0.02、色相步長 15°（單像素最大色相位移 7.5°）
   - 近中性（C < 0.018）：往暖灰偏一點（a +0.002、b +0.010），避免灰石頭偏冷
4. **描邊**：只把 alpha 邊緣「以內」的可見像素往 HeroLoom 深色輪廓 `#150d1b` 混合（@1x 1px ×0.35；@2x 距離 1 ×0.30、距離 2 ×0.13），**不擴張輪廓**，alpha mask 一個 byte 都不變。
5. **無縫修復**：對重複使用的貼圖（廣場、12 個 biome、terrain-atlas 的 12 個 cell）把對邊像素設成精確相等，再往內 10px 線性過渡（band=10），所以修完的邊界差是 0。做法與 `src/heroloom-buildings.js` 的 `edgeMismatch()` 同一條公式（4 通道差總和 ÷ (255×n)），`seamlessTileCheck()` 門檻 0.05，本檢查器收緊到 0.02。
6. **廣場特別處理**：舊 `assets/plaza.png` 與 `assets/xilurus/tex-stone.png` 是同一個檔（sha256 相同），有 1px 亮／暗邊框，實測 lr/tb 接縫 ≈0.40（遠超 0.05），內部 16px 磚格又不是精確週期，無法靠修補變無縫。改以 HeroLoom 已重繪的 `assets/heroloom-buildings/terrain/stone.png`（同一石頭來源、原生 lr/tb = 0.00）為幾何底，套 10 階暖石灰階輸出 —— 所以廣場是「重建石板」而不是逐像素重上色（誠實說明見 §7）。
7. **品質閘門**：`tools/checks/heroloom-scene-assets.mjs`（見 §5）。

### 色相政策（材質不得漂移）

| 材質 | 允許色相帶（OKLab hue°） | 其他 |
| --- | --- | --- |
| village / meadow / birch / grass | 80..160 | — |
| taiga | 120..180 | — |
| forest | 20..120 | — |
| desert | 50..110 | — |
| dirt / soil / bridge | 30..100 | — |
| river / ocean / water | −180..−120 | — |
| ice | −150..−90 | L* ≥ 0.80 |
| cold | −180..−90 | — |
| snow | 不限 | L* ≥ 0.85 |
| mountain / stone | 不限 | C ≤ 0.05（保持灰） |

檢查器另外要求：每檔平均逐像素色相位移 ≤12°、每個材質平均色相位移 ≤10°、atlas 顏色數 ≥12（terrain cell ≥8、plaza ≥8）。

## 4. 量測結果（節錄；完整在 `restyle-report.json`）

- **廣場**：256×256，10→10 色，接縫 lr/tb = **0/0**，平均 L\* 0.6132 → 0.6561。
- **terrain-atlas**：1024×768，528 → 890 色（RGBA），12 個 cell 接縫全部 **0/0**，cell 色相位移 0.2–5.4°，亮度 +0.02..0.05：

| cell | 色相 before → after（位移） | colours |
| --- | --- | --- |
| village | 128.4 → 132.0（3.6°） | 49 |
| meadow | 115.0 → 115.4（0.4°） | 60 |
| birch | 112.5 → 112.3（0.2°） | 45 |
| forest | 78.0 → 78.8（0.8°） | 169 |
| taiga | 149.6 → 149.3（0.3°） | 261 |
| snow | −102.3 → −105.5（3.2°） | 164 |
| mountain | 54.3 → 48.9（5.4°） | 92 |
| desert | 77.1 → 78.0（0.9°） | 34 |
| river / ocean | −145.8 → −145.6（0.2°） | 40 |
| ice | −115.4 → −120.4（5.0°） | 68 |
| bridge | 64.1 → 61.8（2.3°） | 48 |

- **biome 貼圖**：12 個全部 lr/tb = **0/0**（原始是 7.4–17.1 的明顯接縫）；平均逐像素色相位移 2.4–5.4°。
- **alpha atlases**（alpha mask 全部 byte-exact、覆蓋率誤差 0%）：

| 檔 | 顏色 before → after | 平均色相位移 |
| --- | --- | --- |
| woods@1x / @2x | 124 → 162 / 186 | 4.43° / 4.20° |
| flora@1x / @2x | 136 → 157 / 192 | 4.38° / 3.86° |
| props@1x / @2x | 330 → 290 / 327 | 3.89° / 3.79° |
| details@1x / @2x | 407 → 330 / 376 | 3.97° / 3.92° |
| cold@1x / @2x | 123 → 121 / 150 | 3.45° / 3.17° |
| villagers@1x / @2x | 3332 → 439 / 670 | 5.69° / 4.38° |

（@2x 的颜色数比 @1x 多、因为 2px rim 与 1px 不同色；villagers 大幅下降是量化 + 描边把 shade steps 简化，不是 alpha 或格位改变。）

## 5. 重建與驗證指令

```pwsh
# 重建全部 26 個 PNG + palette.json + restyle-report.json
node pipeline/scripts/heroloom/restyle-scene.mjs

# 產生 A/B 對照片（4x 放大、棋盤背景、terrain-atlas 全尺寸）
node pipeline/scripts/heroloom/scene-proofs.mjs

# 檢查（dims / alpha mask / 覆蓋率 ±5% / 接縫 ≤0.02 / 顏色數 / 色相帶與位移 / 色盤紀錄）
node tools/checks/heroloom-scene-assets.mjs
```

檢查器 2026-11-15 結果：**222 checks，222 PASS，0 FAIL**（exit 0）。

A/B 對照片（`output/heroloom-ext/scene/`）：`proof-plaza.png`、`proof-terrain-atlas.png`、`proof-terrain-cells.png`、`proof-biomes.png`、`proof-woods.png`、`proof-flora.png`、`proof-props.png`、`proof-details.png`、`proof-cold.png`、`proof-villagers.png`、`proof-palette.png`。

遊戲內驗收：`output/heroloom-ext/scene/game-village-1440x900.png`（`node build.mjs` 後、desktop 1440×900、`http://100.79.149.0:5026/?preview=1`；地面石板、草地/森林/沙地/水、樹木與木製 props 都正常顯示，色調與 HeroLoom 建築一致）。

## 6. 已知限制（誠實說明）

- **廣場是重建，不是重上色**：舊 `plaza.png` 有硬 1px 邊框、且不是精確週期圖樣，無法在保留原像素的前提下做到無縫；因此用 HeroLoom 的 `terrain/stone.png`（同石頭來源、本身無縫）走暖石灰階，石板接縫靠 10 階明度表現。視覺上跟舊廣場的細 16px 冷色磚不同，是刻意的替換。
- **terrain-atlas 進遊戲後色調會被部分正規化**：`src/pixel-world.js` 的 `ensureTerrainAtlas()` 對 11 個 cell（village/meadow/birch/forest/taiga/snow/mountain/desert/river/ocean/ice，不含 bridge）做逐通道 mean/sd 正規化到固定值，所以引擎會把整體色調拉回設定值，重上色保留的主要是高頻細節（紋理、明暗步階）與 bridge 的色調。這是既有行為，本次沒有動 `pixel-world.js`。
- **修縫 band=10px**：貼圖／cell 邊緣 10px 內有輕微的線性過渡；整張 atlas 的最外緣不是重複貼圖，沒有修。
- **擴散/柔化程度有限**：為避免材質走鐘，色相完全不動、飽和度只 ×0.90，所以「變暖」主要來自暗部提升與中性色微暖偏；若覺得還不夠 HeroLoom，可以調 `restyle-scene.mjs` 的 `LIFT`／`CHROMA_GAIN`，但請先跑 checker 的色相閘門。
- **描邊**：1x 用 1px、@2x 用 2px（距離加權），所以 2x 版描邊相對看起來稍粗；描邊只在 alpha 內側，不會改變輪廓或覆蓋率。
- **props / details / villagers 是 RGBA**（重上色後顏色 >256，索引色會爆），檔案比索引色 PNG 大；`xilurus/tex-*` 目前沒有任何 build 或 runtime 路徑載入，只是先備好。
- **只有桌面 1440×900 的遊戲內截圖**，沒有另外做手機版截圖；A/B 對照片是最近鄰放大，不是平滑縮放。
- 重建依賴 Node（實測 v24.13.1，`node:zlib` 內建）；不需要網路、不需要 Pillow/ImageMagick、不需要任何 npm package。
---

# 第二輪（task-10）：地形材質與圍牆結構重繪

第二輪不是再上一次色，而是依 HeroLoom 風格**重畫結構**：12 個地形材質、12 個 xilurus biome 貼圖、廣場鋪面，以及村莊圍牆（fenceRail）。全部由純 Node、固定 hash 的程式產生，沒有用任何影像模型。

## 1. 這輪改了什麼

| 檔案 | 改動 | 幾何 / 佈局 |
| --- | --- | --- |
| `assets/heroloom-scene/details@1x.png`、`@2x.png` | 只重畫 **fenceRail** cell：程式化木柵欄（兩根橫桿、立柱、柱帽、墨線描邊） | cell 矩形完全不動（1x `[154,1094,112,104]`、2x `[306,2180,224,208]`，讀 manifest）；其他所有 cell 與已驗收的第一輪版本**逐 byte 相同** |
| `assets/heroloom-scene/terrain-atlas.png` | 12 個 cell 依 biome 重繪結構（草葉叢、落葉層、沙紋、雪堆、冰裂板、水波紋、石版裂縫、泥土礫石、橋板） | 1024×768、4×3 格、每格 256×256 完全不動（manifest 未改） |
| `assets/heroloom-scene/plaza.png` | 重畫為 HeroLoom 藍灰石板鋪面（3px 灰縫、亮邊、少量暖高光） | 256×256；遊戲載入時照舊壓成 256×184（`PAVE_SQUASH=.36`） |
| `assets/heroloom-scene/xilurus/tex-*.png`（12 個） | 與 atlas 同一組生成器重畫 | 全部 256×256；build.mjs 目前沒有載入這批檔（照樣交付） |

沒有動 `assets/heroloom-buildings/terrain/*.png`（第三項選修）：現有 4 張本來就無縫、色調也已一致，這輪不冒險改。沒有動任何 manifest，也沒有改 `src/`、`build.mjs` 或 `package.json`。

## 2. 方法

- **`pipeline/scripts/heroloom/redraw-fence.mjs`**：用固定 hash 產生 fence cell，`splice()` 讀 `assets/details@{1x,2x}.png` → 只覆寫 fenceRail 矩形 → 檢查矩形外 0 byte 變動 → 寫回 `assets/heroloom-scene/details@{1x,2x}.png`，並輸出 `redraw-fence-report.json`。柵欄幾何：cell 112×104、柱寬 22、柱高 72、柱帽 6、兩條橫桿、地面斜率 0.35（引擎再 shear 0.125 補到 2:1 iso），墨線 `#150d1b`、柱面暖棕 `#b07c46/#8a5a33`、桿面 `#dfb98a..`。刻意不在 cell 左右邊緣畫垂直墨線（相鄰 panel 會重疊約 21%，否則會出現接縫黑線）。
- **`pipeline/scripts/heroloom/redraw-terrain.mjs`**：週期性 value-noise / fbm，所有 lattice 週期整除 256，座標一律 wrap，所以每個 tile 與每个 cell 天生無縫；最後再跑 `seamFix()` 把第 0 欄/列複製到最後一欄/列，讓 `edgeMismatch` **精確為 0**。每個 biome 的色階由**原始** `assets/terrain-atlas.png`、`assets/xilurus/tex-*.png` 的該格推導（不是從上一輪輸出推導，避免愈跑愈淡的非幂等問題），9 階色盤、保持明度間距；另外加一道 **hue lock**：把生成結果的 chroma 加權平均色相旋轉回原始格的值（在 OKLab 旋轉，保留明度與彩度），所以 checker 的「色相 ±12°」是結構性保證，不是碰運氣。
- **`pipeline/scripts/heroloom/scene2-proofs.mjs`**：純 Node 產生 A/B 對照片（見下）。

## 3. 檢查器（兩個都要綠）

```powershell
node tools/checks/heroloom-terrain-fence.mjs   # 這輪新增
node tools/checks/heroloom-scene-assets.mjs    # 第一輪的，已更新以容納這輪的刻意覆寫
```

`heroloom-terrain-fence.mjs` 會驗：details 尺寸不變、fenceRail manifest 矩形不變、矩形外像素與第一輪已驗收快照逐 byte 相同、柵欄 cell 真的有重畫且含墨線、橫桿斜率跨 cell 連續；terrain 尺寸/12 格矩形不變、每格 lr/tb 接縫 ≤0.001、色相漂移 ≤12°、明度差 ≤0.16、≥7 色；**每格低頻條紋（列均值/欄均值的亮度標準差：水/河/沙/雪/冰 <2.0、其他 <3.0，單位 /255）、單一方向連續同向偏離 ≤24px（以格位眾數亮度為基準、2.5/255 死區）、五個重畫材質的局部對比預算（沙 ±5、雪 ±6、水 +10/−8、冰 ±8）**；plaza 尺寸/接縫/顏色數/低彩度/明度；12 個 xilurus 貼圖 256×256 且無縫。

2026-11-15 結果（含 2b 修正）：**136/136 PASS（exit 0）**；第一輪 checker 同步為 **209/209 PASS（exit 0）**。

## 4. 對照片與遊戲內截圖（`output/heroloom-ext/scene2/`）

- `terrain-12cells-contact.png`：12 格「原圖 | 重繪」2× 對照，附 biome 標籤。
- `plaza-2x2.png`：舊廣場 2×2 貼圖 | 新石板 2×2 貼圖。
- `fence-closeup-4x.png`：fenceRail sprite cell 4× | 遊戲內圍牆 4×。
- `fence-in-village-zoom.png`：同條件但 `lookAt(-16.5,-11.25,4.0)` 的 4× 拉近，北側 palisade 的立柱與橫桿清楚可見（截圖時遊戲內是第 8 天夜晚、細雨，光照偏暗，但柵欄結構可辨）。
- `fence-in-village.png`：`node build.mjs` 後、`http://100.79.149.0:5026/?preview=1`、desktop 1440×900，村莊東側圍牆與建築。
- `terrain-in-game-1440x900.png`：同條件的村莊全景，看得到草地/泥土路/石板/沙灘/水/雪地/森林底層同時出現。
- `ref-round1-details@1x.png`、`ref-round1-details@2x.png`：第一輪 details atlas 快照，供 checker 比對「fence cell 以外完全不變」。

## 5. 第二輪的已知限制（誠實說明）

- **fenceRail 的 alpha 遮罩是新的**：這是任務要求（結構重繪），所以 details atlas 只有該 cell 的輪廓改變；checker 改成「矩形外遮罩完全相同」。柵欄在遊戲內是重疊排列（segment 約 22.6 世界單位、panel 重疊 ~21%），看起來是連續木欄杆，但近看每段接點仍略有重複感。
- **新地形整體偏亮**：生成器的色階是從原圖推導後刻意「簡化＋提亮」，而 `ensureTerrainAtlas()` 進遊戲時會把 11/12 個 cell 的 mean/sd 正規化到固定值（bridge 除外），所以**遊戲內**的色調會被拉回設定值；A/B 對照片看到的是原始 atlas 檔，會比遊戲內亮。草地/雪地/沙漠的亮度差最明顯。
- **材質刻意做「低檔位」**：2b 修正後，terrain cell 在檔案層面幾乎是平的（亮度 sd ≈1.0–1.5 / 255，局部偏離受限：沙 ±5、雪 ±6、水 +10/−8），只帶 1–2px 各向同性顆粒與短虛線。原因是 `ensureTerrainAtlas()` 會把每格 mean/sd 正規化到固定目標值，檔案層的細顆粒會被放大成遊戲內的質感；若檔案層又畫大尺度結構（條紋/雲塊），放大後就會變成玩家看到的條紋與豹斑。所以 A/B 對照片的右欄看起來會比原圖「素」，這是刻意的，不是漏做。
- **每個 cell 只有 7–12 色**：這是刻意的簡化（原圖是幾百色的雜訊材質），符合「storybook pixel art」方向，但不會有原圖那種細碎顆粒感。
- **只有桌面 1440×900 截圖**，沒有手機版；A/B 圖是最近鄰放大。
- **xilurus/tex-* 仍未進 build**：這 12 張只是保持資料整齊，實際遊戲用的是 terrain-atlas；要接的話是 Lead 的 build.mjs wiring 決定。
- 重建指令：`node pipeline/scripts/heroloom/redraw-terrain.mjs`、`node pipeline/scripts/heroloom/redraw-fence.mjs`、`node pipeline/scripts/heroloom/scene2-proofs.mjs`、`node build.mjs`。全部純 Node（實測 v24.13.1），無網路、無 npm 套件。

## 6. 第二輪修正（2b）：材質條紋／斑塊修正（2026-11-15 晚）

回報反映「沙灘 tiling 出現黃橙橫向條紋、雪地出現藍灰豹斑、水面有跨 tile 的粉白浪線」。根因是舊生成器在**檔案層**畫了大尺度結構（完整正弦浪脊、大片雪堆），而 `src/pixel-world.js` 的 `ensureTerrainAtlas()` 進遊戲時會把每格逐通道 mean/sd 正規化到固定值，等於把檔案層的細微波紋再放大成明顯條紋／斑塊。

**2b 做法**：12 格全部改成同一個 `genGranular()` 家族——先取**原始格平均色**當基底（因此色相/明度天然與原圖一致），加上 cell 8/20 的 wrapped 等向 noise 與 1px 顆粒（夾在某材質的局部偏離預算內），再加**短虛線**（3–16px、固定 hash、方向隨機、不會連成線）做材質暗示：
- sand：低對比短沙紋 ±3、2px 礫石 ±5；snow：短陰影虛線 −5、亮脊 +5、小斑 −6；water：短浪 +8（≤12px）、中段 +4、谷 −6、少數 +10 反光；ice：裂痕 −7、亮片 +4/+2。
- 同一家族也接管原本有結構問題的格：rock（山）、floor（森林/樺木落葉）、grass（村莊/草原/針葉林草——原本 8px lattice 草叢在遊戲內會變成迷彩塊）、bridge（短段錯位板縫，不再是貫穿整格的高對比長線）。

**量測（寫入 checker 閘門）**：每格低頻條紋 H/V ≤0.25（門檻 2.0／3.0）；最長同向連續偏離 6–18px（門檻 24）；局部偏離沙 +4.1/−4.9、雪 +5.0/−6.0、水 +9.9/−6.1、冰 +4.0/−7.0（皆在預算內）；12 格接縫仍為 0.00000；色相漂移最大 0.9°（taiga）；每格 8–12 色。

**遊戲內複驗**（`node build.mjs` → dist 2.56 MB，:5026）：`beach-sand-1440x900.png`（`lookAt(0,29,6.5)`）沙灘是細顆粒暖沙、無條紋；`snow-ground-1440x900.png`（`lookAt(13.2,20.2,6.0)`）雪地近白帶極淡冷陰影、無豹斑；`water-zoom-1440x900.png`（`lookAt(0,33,7.0)`）水面為平靜帶細顆粒的青藍，無跨 tile 浪線；`terrain-12cells-contact.png`、`cell-{ocean,river,desert,snow,ice}-2x2.png` 為新版 cell 對照。另有離線近似圖 `wip-groundsim.png` / `wip-groundsim-zoom.png`：把 cell 依 GRASS_TONE 正規化後以 0.29 縮放、α .6 疊底的預覽，與遊戲內結果一致。

**2b 後的已知限制**：材質在檔案層幾乎是平的（見 §5 第一點），近看 cell 會覺得「太素」，這是配合 runtime 正規化的刻意選擇；bridge 板縫改成短段錯位後，近看比較不像整片木板、而像風化橋面；水面偏「平靜」，沒有舊版那種浪線節奏。若之後要更有結構，正確做法是**改 runtime**（讓 GRASS_TONE 不要做全格標準化，或改用固定的材質對比曲線），而不是在檔案層加圖樣。

重建指令（2b 不變）：`node pipeline/scripts/heroloom/redraw-terrain.mjs` → `node pipeline/scripts/heroloom/scene2-proofs.mjs` → `node tools/checks/heroloom-terrain-fence.mjs` / `node tools/checks/heroloom-scene-assets.mjs` → `node build.mjs`。
---

# 第三輪（task-12）：村莊圍牆 fenceRail 重繪（粗木柱＋厚橫桿）

背景：使用者反映第二輪的柵欄還是「細、像繩子」。第三輪**只重畫** `assets/heroloom-scene/details@1x.png`、`details@2x.png` 裡的 **fenceRail** 這一個 cell；其他所有 cell、manifest、尺寸、alpha 語意都不變（矩形外逐 byte 相同）。

## 1. 這輪改了什麼

| 項目 | 內容 |
| --- | --- |
| cell 幾何 | 1x `[154,1094,112,104]`、2x `[306,2180,224,208]`；manifest 完全未改 |
| 柱 | 每個 bay 兩根立柱（x0=2/85）：`POST_W 26`、`POST_H 88`、`CAP_H 7`，柱帽左右各外伸 2 art px |
| 橫桿 | 兩條：`RAIL_HI 42–64`、`RAIL_LO 14–36`（各 22 art rows），斜率 0.35 已烘進圖（引擎再 shear 0.125 補到 2:1 iso） |
| 色盤 | 墨線 `#150d1b`、柱面暖棕 `#b07c46 / #916037 / #70482b`、桿面 `#dfb98a` 系、柱帽 `#e4c484`、苔點 `#5c7334`；整個 cell 26 色 |
| 質感 | 柱帽 2×2 墨釘＋1px 亮點、橫桿穿柱處 2px 軟影、柱腳 AO 與影子條、短木紋只在前立面（t .50–.66、hash>0.93、量化到 art grid） |

**為什麼改成「每個 bay 兩根柱」**：引擎裝飾物的繪製順序不是離線模擬器的 ascending 順序；單柱版本實測在遊戲內會被鄰格橫桿蓋過柱面（看起來像柱子在橫桿後面斷掉）。改成每個 bay 兩根柱後，接縫落在兩根柱身重疊的區域，遊戲內每根複合柱就是一根粗柱。代價是複合柱其實是兩根柱重疊，比單柱寬、柱身有一道內縫（4x 看得到，1x 遊戲內大致融合）。

## 2. 方法與重建

- **`pipeline/scripts/heroloom/redraw-fence.mjs`**：固定 `hash2()` 程序化繪製 → `splice()` 只覆寫 fenceRail 矩形 → 檢查矩形外 0 byte 變動、alpha 只有 0/255 → 寫 `assets/heroloom-scene/details@{1x,2x}.png` 與 `redraw-fence-report.json`。@2x 用 2 倍座標獨立繪製（不是把 1x 放大），整數座標落在 2px 網格。
- 重建：`node pipeline/scripts/heroloom/redraw-fence.mjs`
- A/B 對照片（scratch 生成器）：`node output/tmp-fence-contact.mjs` → `output/heroloom-ext/scene3/fence-before-after-4x.png`
- 遊戲內截圖（scratch）：`node output/tmp-fence-shots.mjs`（Playwright，需先 `node build.mjs`）

## 3. 驗證（2026-11-15）

```powershell
node tools/checks/heroloom-scene-assets.mjs    # 209/209 PASS, exit 0
node tools/checks/heroloom-terrain-fence.mjs   # 136/136 PASS, exit 0
```

- 自檢 `output/tmp-fence-verify.mjs`：cell 矩形外 0 byte 變動；半透明像素 0（alpha 只有 0/255）；coverage 原 47.4% → 新 59.8%(1x) / 59.2%(2x)（柱與桿都變粗，這是設計結果；checker 的 ±5% 覆蓋率規則只適用非 fence 檔案，details 的閘門是「矩形外遮罩完全相同」）；顏色數 33 → 26。
- 遊戲內：`node build.mjs` → `dist/暮影村.html` 2.23 MB · media 191 files / 16.0 MB；`http://100.79.149.0:5026/?preview=1`。截圖在 `output/heroloom-ext/scene3/`：`fence-north-1440x900.png`（`lookAt(-16.5,-11.25,4.0)`）、`fence-run-1440x900.png`（-16.5,-13.5,2.6）、`fence-closeup-1440x900.png`（-16.5,-16,2.2）、`fence-north-402x712.png`、`fence-closeup-402x712.png`（手機 402×712、DPR2）；`shots-report.json` 0 console error / 0 failed request。
- A/B：`fence-before-after-4x.png`（2060×1000，上排舊 v1 cell 4x | 新 cell 4x；下排離線引擎數學 composite 舊 | 新）。

## 4. 第三輪的已知限制（誠實說明）

- **複合柱是兩根柱重疊**：遊戲內每根柱比單柱寬、柱身有一道內縫；1x 距離大致看不出，4x 明顯。
- **沒有對角斜撐**：任務標為 optional，這輪沒做。
- **覆蓋率 +12pt**：柱變粗、桿變厚造成，不是 alpha 錯誤；矩形外遮罩逐 byte 相同已驗。
- **建築院子外的低矮繩狀圍欄不在這輪範圍**：那些是烘在建築 sprite 裡（`assets/details@*.manifest.json` 只有 `fenceRail` 一個 cell），不是 fenceRail，需另開建築重繪任務。
- **離線 composite 模擬器用 ascending 繪製順序**，和引擎實際 decoration 順序不同；判斷以遊戲內截圖為準，模擬圖只做初篩。
- 沒有改 `src/`、`build.mjs`、任何 manifest；沒有 commit / push。build 接線不需要改：details atlas 已經走 Lead 的 `sceneOrOrig()` prefer-if-present 路徑。
