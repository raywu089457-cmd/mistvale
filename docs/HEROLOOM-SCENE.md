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
