
---

# 第三階段:整片地面材質

## 問題

地面是 **9048 塊平塗菱形**,每塊只有 **9x5 螢幕像素**。
而且每塊用 `rand()*13-6` 隨機微調明度 —— 那就是畫面上看得見的**格紋**。

**關鍵限制:9x5 像素塞不進任何細節。** 所以逐格貼圖是死路。

## 做法

不是逐格貼圖,是**按生態域整片填 Canvas pattern**:

```js
for(const [biome, tiles] of byBiome){
  gc.beginPath();
  for(const t of tiles) { ...把每格菱形加進同一條 path... }
  gc.save(); gc.clip();                       // 一個生態域只 clip 一次
  gc.fillStyle = BIOME_PALETTE[biome];        // 先鋪底色(色調才準)
  gc.globalAlpha = TERRAIN_TEX_ALPHA;         // 材質 60% 疊上去
  gc.scale(s, s*SQUASH);                      // 縮放 + 等角壓扁
  gc.fillStyle = pattern; gc.fillRect(...);
  gc.restore();
}
```

12 個生態域各 clip 一次(每個 path 約 750 塊菱形),
比 9048 次 clip 快得多,而且是一次性的。

## 材質怎麼來

1. 生成一張 4x3 的**無縫地面材質圖集**(12 個生態域,對應 `BIOME_PALETTE` 的色碼)
2. 用 `sprite-gen background-tile` 沿 X 再沿 Y 各做一次無縫拼接(有 overlap 混色)
3. 最近鄰縮到 256px,打包成 1024x768 的 RGB 圖集(1427 KB)

| 檢查 | 結果 |
|---|---|
| 無縫拼接 | **11/12 pass**,`village` 標記 needs-review(保守誤報,2x2 攤開看不到縫) |
| 生成時間 | 1 分 40 秒 / 12 個材質 |

## 調校過程(三個參數,都是實測決定的)

| 參數 | 試過 | 結論 |
|---|---|---|
| `TERRAIN_TEX_SQUASH` | 0.5(等角理論值) vs 1.0 | **1.0** —— 0.5 會把草葉壓成橫向斑點,看起來像雜訊 |
| `TERRAIN_TEX_ALPHA` | 1.0 vs 0.6 | **0.6** —— 1.0 太吵;保留底色讓生態域色調準確 |
| `TERRAIN_TEX_SCALE` | 1.0 vs 0.5 | **0.5** —— 1.0 時草葉跟建築窗戶一樣大 |

三個都做成常數放在 `groundPatterns` 旁邊,要調很快。

## 驗證

| 檢查 | 結果 |
|---|---|
| console 錯誤 | **0** |
| 建築圖集 | 1x=40 2x=0 |
| 細節圖集 | ready=true, 170 次繪製 |
| 地面材質 | 12 個 pattern 全部建立 |

截圖:`terrain-alpha-ab.png`(三版對照)、`terrain-squash-ab.png`(壓扁 vs 不壓)、
`terrain-seam.png`(無縫檢查)。

## 保留為程序繪製

- **道路**:石板路與土路仍是平塗菱形 + 石塊細節。它們是「人造鋪面」,平一點反而對;
  要材質化的話得另外生兩張。
- **橋面**:木板紋理會透出來(有材質時跳過原本的平塗深棕)。
- **競技場空地**:有材質時改成**半透明覆蓋**(alpha 0.5),保留底下的草地紋理。

## 檔案

```
proj/assets/terrain-atlas.png / .manifest.json   1427 KB
proj/src/pixel-world.js.pre-terrain.bak          改前備份
```

建置產物:`17.46 MB → 19.32 MB`

> 註:材質圖集是 RGB(地面不透明),所以比 RGBA 省約 200 KB。
> 若要再省,192px 版本是 864 KB(@2x 1.13 MB base64),但重複週期會變短。
