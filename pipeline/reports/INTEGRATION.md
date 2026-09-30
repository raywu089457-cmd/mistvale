# mistvale 建築圖集整合 — 完成報告

## 結論

**有成功產出並套用新素材。** 但成功的是「整合 + 重新包裝」,不是「新畫的圖」。

| 項目 | 狀態 |
|---|---|
| 把 `buildings14` 硬切格換成 manifest 驅動 | ✅ 已套用、已建置、已截圖驗證 |
| 離線 LANCZOS @1x + @2x 雙 LOD | ✅ 已套用、放大時自動切換 |
| 舊的色鍵 + bbox 掃描(瀏覽器端) | ✅ 已移除 |
| **AI 重新生成的建築圖** | ❌ **沒有採用**(見下方兩道關卡) |

## 一、改了什麼

```
src/pixel-world.js    +84 / -  行   (diff 84 行)
build.mjs             +9  / -  行
assets/buildings@1x.png / .manifest.json   新增
assets/buildings@2x.png / .manifest.json   新增
```

建置產物:`14.16 MB → 14.70 MB`(+0.53 MB,但遊戲內日常使用的是 @1x 677 KB,
比原本的 2530 KB 少 73%;@2x 只在放大時才用到)

### 舊做法移除的東西

```js
// 移除:猜出來的列切線 + 瀏覽器端色鍵 + bbox 掃描 + 縮到固定 320px
const rows=[0,.326,.66,1];                    // ← 猜的,實際該在 418/836
for(let y=0;y<h;y++)for(let x=0;x<w;x++){...} // ← 12 格 × 409×313 的逐像素迴圈
og.drawImage(cell,x0,y0,...,0,0,320,...)      // ← 多一次重取樣
```

### 新做法

```js
drawAtlasBuilding(id,p,9)   // manifest 的精確 rect → 來源矩形貼圖
```
- 矩陣 rect 直接來自 manifest,**不猜格線**
- 圖集本身已是 RGBA,**不在瀏覽器裡跑色鍵**
- 倍率 = `71 * (每來源像素世界單位)`,不把寬度硬塞成固定值

## 二、AI 生成的兩道驗收關卡(為什麼沒採用)

第一次重生成失敗(模型把「3/4 elevated」讀成正面視角)。為了不再靠肉眼,
寫了 `buildings-poc/verify_iso.py`,兩道客觀關卡:

| Gate | 判準 | 為什麼 |
|---|---|---|
| **1 單格包含** | 內容不能碰到格線 | 碰到就切不乾淨 |
| **2 等角底面** | 底部左右邊界的 \|dx/dy\| 要落在等角區間 | 等角 2:1 的理論斜率就是 2.0 |

斜率門檻 0.6~2.6 是用三張已知樣本校準的:

| 樣本 | 斜率範圍 | Gate 2 | Gate 1 |
|---|---|---|---|
| 原圖(基準) | 0.79 ~ 1.52 | 12/12 | 12/12 |
| attempt1 | 0.01 ~ 3.85 | 4/12 | — |
| **attempt2** | 1.38 ~ 2.27 | **12/12** | **2/12** |
| attempt3 | — | 額度用完(要等 10/4) | — |

`taper` 和 `fill_ratio` 兩個指標都試過,**無法分辨**(兩邊全過);斜率才可以。

**attempt2 的等角比原圖還純正**(斜率 1.9~2.3 vs 原圖 0.8~1.5),但模型把 12 棟
畫得太擠,11/12 格被格線切到 → 不採用。

> attempt3 的 prompt 已加上明確留白要求(每棟最多佔格寬 70%、相鄰之間至少 8% 純洋紅帶),
> 但 ChatGPT 週額度用完了(要等 10/4 06:08)。

## 三、驗證方式(可重跑)

```bash
# 建置
cd proj && node build.mjs

# 截圖(注入自動關閉開始畫面)
cd .. && ./shot.sh after.html after-village.png 1500 950 14000

# LOD 使用量測 —— 不靠「看起來比較清楚」猜
python probe.py "A 平常鏡頭"
python probe.py "B 放大" --wheel 9
python probe.py "C 建設面板" --click '[data-action="build"]'
```

### 實測結果(全部零 console 錯誤)

| 情境 | 鏡頭 scale | 繪製 1x | 繪製 2x | 縮圖 1x | 縮圖 2x |
|---|---|---|---|---|---|
| A 平常鏡頭 | 1.24 | 40 | 0 | 0 | 0 |
| B 放大 9 段 | 2.92 | 32 | **8** | 0 | 0 |
| C 建設面板 | 1.24 | 56 | 0 | 0 | **12** |

三條路徑都真的有走到,不是「載了沒用」。

### 全村畫素差異

`before-village.png` vs `after-village.png`(同視窗、同注入腳本):
世界區域平均差 **27.5 / 765**,差異 > 60 的像素佔 **12.8%** ——
集中在建築上,版面與位置完全一致。

截圖證據:
- `before-village.png` / `after-village.png` — 全村對照(版面一致)
- `ab-detail.png` — 同區域放大 A/B,**屋瓦從隨機斑點變成連續橫列**
- `after-zoomed.png` — 放大時 @2x 接手,細節清晰

## 三之二、被 watchdog 抓到的 bug(已修)

`buildingDataURL` 傳 `atlasFrameFor(id, 2)`,但函式是「`sc >= 2.2` 才偏好 2x」。
`2 < 2.2`,所以那個分支**永遠走不到** —— 縮圖的 2x 意圖從來沒生效過,而且是靜默的。

修法:把暗門檻換成明確的布林旗標 `prefer2x`,並加上使用計數。

```js
// 之前(死分支)
if(sc>=2.2) for(const lod of atlasLod) if(lod.scale===2 && lod.frames[id]) return lod;

// 之後(明確)
function atlasFrameFor(id, prefer2x){
  if(prefer2x) for(const lod of atlasLod) if(lod.scale===2 && lod.frames[id]) return lod;
  for(const lod of atlasLod) if(lod.frames[id]) return lod;
  return null;
}
```

教訓:**「傳一個數字進去比門檻」是易碎的介面** —— 呼叫端與被呼叫端的意圖
分歧時不會有任何錯誤,只會靜默走錯分支。布林旗標把意圖寫在名字上,
再加上 `atlasUse` 計數就能實測。

## 四、踩到的坑(給以後的人)

1. **`g` 和 `scale` 是 `createPixelWorld` 閉包內的變數** —— 把 `drawAtlasBuilding`
   放模組層會 `scale is not defined`。要放在 `drawSprite` 旁邊。
2. **`h` 被別的地方用** —— `drawBuilding` 的冒煙特效用 `-h+12` 算高度,
   換掉 sprite 計算時要補 `const h=rect.h/scale;`(世界單位,照舊版語意)。
3. **漏乘 `BUILDING_WORLD_WIDTH`** → 建築被畫成 1px 寬 = 隱形,但**沒有報錯**。
   圖看起來像「建築不見了」而不是「畫壞了」,容易誤判。
4. **Chrome `--screenshot` 要 Windows 絕對路徑**,相對路徑會「存取被拒」。
5. **遊戲把初始化包在 try/catch**,錯誤走 `console.error` 不是 `window.onerror`,
   而且攔截器要插在 `<head>` 之後(bundle 之前)才抓得到。
6. **「傳數字比門檻」的介面會靜默失效** —— 見第三之二節。

## 五、要推到正式專案

```bash
# 1. 備份
cp -r .../mistvale .../mistvale-backup-$(date +%s)

# 2. 複製改好的檔案
cp proj/src/pixel-world.js        .../mistvale/src/
cp proj/build.mjs                 .../mistvale/
cp proj/assets/buildings@*.png    .../mistvale/assets/
cp proj/assets/buildings@*.json   .../mistvale/assets/

# 3. 建置
cd .../mistvale && node build.mjs
```

**沒有動到的**:`src/pixel-ui.js`、`src/pixel-game.js`、`src/pixel-data.js`、
`src/overworld.js`、`title/hall/inn/monument` 四張單張 PNG 與其載入路徑。

## 六、還沒做

- **attempt3 的圖集** — 等 10/4 額度回來,`atlas-prompt-v2.txt` 已含留白要求
- **`hall` / `inn` / `monument` 還是走舊的單張路徑**(含那個危險的 inn 專屬去背 hack)
- **`drawPortrait` 縮圖**沒在真實瀏覽器逐一比對
- **主角與魔物還是程序繪製**,換成圖集需要另外處理「3 種膚色變體 + 左右翻轉」


---

# 第二階段:地圖細節圖集(LUNA MAX)

## 產出

用  +  生成,1 張 = 12 個物件,耗時 1 分 32 秒。

**A/B 兩版,選了 B:**

| | A 有烤死的草地 | B 只有物件 |
|---|---|---|
| 雪地/沙漠/針葉林 | ❌ 綠色草地穿幫 | ✅ |
| 格式 | RGB 洋紅底 | **真透明 RGBA** |
| 等角斜率 | 1.90~2.06(教科書級) | 不適用(刻意沒有地面) |
| @1x 大小 | — | **474 KB** |

A 版 9 格有地基的物件裡 8 格斜率 1.90~2.06(等角 2:1 的理論值就是 2.0),
只有橡樹底盤是圓的(0.18/0.40)。**LUNA MAX 一次就達到這個水準**,
之前掛 CheapRouter 的模型是 0.01~3.85 亂跳。

## 已整合(8 種)

| 圖集 key | 遊戲型別 | 世界外框(沿用原尺寸) |
|---|---|---|
| pine / oak / birch / snowpine | (依 ) | 50×72 × size |
| boulders |  | 13×10 |
| outcrop / cave / ruin |  /  /  | 38×17 / 38×38 / 38×28 |
| signpost |  | 17×21 |
| well |  | 90×91 |
| lamppost |  | 8×24 |

繪製方式:manifest rect → **contain** 進世界外框(等比,不拉伸)。
atlas 畫成功就跳過程序繪製;失敗自動退回舊路徑。

## 退回程序繪製(1 種)

**圍欄不能用。** 遊戲是「單柱 + 橫桿」反覆排列成連續柵欄,
但圖集給的是「兩柱一段」的完整護欄板 —— 排起來會變一段一段的鋸齒。
要用的話得另外生一張「單柱 + 左右短橫桿」的可拼接單位。

## 驗證

| 檢查 | 結果 |
|---|---|
| console 錯誤 | **0** |
| 細節圖集 ready | true |
| 細節繪製次數 | **170**(全部走 atlas) |
| 建築圖集 | 1x=40, 2x=0 |

截圖:(水井 + 燈柱,前後對照)、(圍欄為何退回)。

## 檔案



建置產物:(+2.76 MB,主要是 @2x 的 1.6 MB base64)

---

# 第二階段:地圖細節圖集(LUNA MAX)

## 產出

用 `gpt-5.6-luna` + `model_reasoning_effort=max` 生成,1 張 = 12 個物件,耗時 1 分 32 秒。

**A/B 兩版,選了 B:**

| | A 有烤死的草地 | B 只有物件 |
|---|---|---|
| 雪地/沙漠/針葉林 | ❌ 綠色草地穿幫 | ✅ |
| 格式 | RGB 洋紅底 | **真透明 RGBA** |
| 等角斜率 | 1.90~2.06(教科書級) | 不適用(刻意沒有地面) |
| @1x 大小 | — | **474 KB** |

A 版 9 格有地基的物件裡 8 格斜率 1.90~2.06 —— 等角 2:1 的理論值就是 2.0,
只有橡樹底盤是圓的(0.18/0.40)。**LUNA MAX 一次就達到這個水準**;
之前掛 CheapRouter 的模型是 0.01~3.85 亂跳。

## 已整合(8 種型別)

| 圖集 key | 遊戲型別 | 世界外框(沿用原尺寸) |
|---|---|---|
| pine / oak / birch / snowpine | `tree`(依 `variant % 4`) | 50x72 x size |
| boulders | `rock` | 13x10 |
| outcrop / cave / ruin | `outcrop` / `cave` / `ruins` | 38x17 / 38x38 / 38x28 |
| signpost | `signpost` | 17x21 |
| well | `well` | 90x91 |
| lamppost | `lamp` | 8x24 |

繪製方式:manifest 的精確 rect → **contain** 進世界外框(等比,不拉伸)。
atlas 畫成功就跳過程序繪製,失敗自動退回舊路徑。

## 退回程序繪製(1 種)

**圍欄不能用。** 遊戲是「單柱 + 橫桿」反覆排列成連續柵欄,
但圖集給的是「兩柱一段」的完整護欄板 —— 排起來會變一段一段的鋸齒。
要用的話得另外生一張「單柱 + 左右短橫桿」的可拼接單位。

**教訓:生成前要先問「這個物件在遊戲裡是獨立擺放,還是重複排列成線?」**
重複排列的單位必須是可拼接的片段,不能是完整的成品。

## 驗證

| 檢查 | 結果 |
|---|---|
| console 錯誤 | **0** |
| 細節圖集 ready | true |
| 細節繪製次數 | **170**(全部走 atlas,退回程序繪製後) |
| 建築圖集 | 1x=40, 2x=0 |

截圖:
- `detail-final-ab.png` — 水井 + 燈柱的前後對照(改善最明顯)
- `fence-zoom.png` — 圍欄為何退回(兩柱一段 vs 單柱排列)
- `detail-A-vs-B.png` — 有地面 vs 無地面
- `detail-view-b.png` — 最終採用的圖集

## 檔案

```
proj/assets/details@1x.png / .manifest.json     474 KB
proj/assets/details@2x.png / .manifest.json     1.6 MB
proj/src/pixel-world.js.pre-detail.bak          改前備份
build.mjs                                        多 8 行(detail 圖集注入)
```

建置產物:`14.70 MB → 17.46 MB`(+2.76 MB,主要是 @2x 的 base64)

## 貴在哪裡

@2x 佔了大部分體積,但只有放大到 2.2 倍以上才會用到。
若不需要放大細節,把 `build.mjs` 的 `detailsAtlas2x` / `detailsManifest2x` 兩行拿掉
就能省下約 2.2 MB。

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
