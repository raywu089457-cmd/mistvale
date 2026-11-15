# HeroLoom 風格建築與地形（實驗）

把五棟建築（`hall` 城鎮大廳、`inn` 旅館、`tavern` 酒館、`forge` 鐵匠鋪、`house` 獵人小屋）
與三種地面（`grass` 草地、`earth` 泥土、`stone` 石地）換成 HeroLoom 風格的圖。
這是**直接換圖**的 drop-in，不是新引擎：`src/pixel-world.js` 的建築／地面繪製完全不用改。
模組：`src/heroloom-buildings.js`；驗證器：`tools/checks/heroloom-ext-assets.mjs`；
測試：`test-heroloom-monsters.mjs`。

## 1. 出貨格式

```
assets/heroloom-buildings/<id>.png          單張建築，keyed alpha（透明底），1024 級寬度
                                             id = hall / inn / tavern / forge / house
assets/heroloom-buildings/terrain/<name>.png 無縫地面貼圖
                                             name = grass / earth / stone（建議 256x256）
```

模組路徑常數：

- `HEROLOOM_BUILDINGS_BASE()` = `PIXEL_ASSETS.heroloomBuildingsBase || 'media/heroloom-buildings/'`
- `buildingUrl(id)` → `<base><id>.png`
- `terrainUrl(name)` → `<base>terrain/<name>.png`
- `LOOM_BUILDINGS` / `LOOM_TERRAIN`：id + zh-TW label（label 同 `src/pixel-data.js`）

## 2. 建築 PNG 規則（`validateBuildingPng`）

| 規則 | 值 |
| --- | --- |
| 格式 | PNG，必須有 alpha（color type 4/6，或 palette/greyscale + tRNS） |
| 高度 | 700–1500 px |
| 比例 | `(w/h) / (xilurus 該 id 的 w/h)` 必須落在 **0.8–1.2** |

xilurus 參考值**在執行期**從 `assets/xilurus/<id>.png` 算，不寫死：hall 1120x1400=0.800、
inn 984x1144=0.860、tavern 984x1140=0.863、forge 984x1244=0.791、house 900x1036=0.869。
重畫的建築是**同一個 footprint 的替換品**，所以照原比例畫（relative ≈ 1.0）就是目標；
band ±20% 只留給「稍微寬一點／窄一點」的 HeroLoom 重新詮釋，不至於變成另一棟比例完全不同
的建築。Lead 2026-11-15 把原本的 0.55–0.95 改成 0.8–1.2，因為實際交付的 5 棟都在 0.98–1.00，
用 0.55–0.95 會把正確的 drop-in 判成 FAIL（`HEROLOOM_BUILDING_ASPECT_BAND` 一個常數，
測試與 checker 都吃這個值）。

回傳 `{ok, errors, width, height, ratio, refRatio, relative}`；`opts` 可帶
`{id, refWidth, refHeight | refAspect, aspectBand, minHeight, maxHeight, requireAlpha, skipAspect}`。
沒有參考圖時 checker 會 SKIP 該 id 的比例檢查、其餘照驗。

## 3. 地形無縫規則（`seamlessTileCheck`）

`seamlessTileCheck(rgba, width, height, {threshold=0.05})` 直接吃 raw RGBA bytes（checker 自己用
`node:zlib` 解 PNG，不裝任何套件）。它比較「右邊界 vs 左邊界」與「下邊界 vs 上邊界」逐像素、
逐通道的平均差（0..1）；超過 0.05 就回 error。回傳
`{ok, errors, leftRight, topBottom, maxScore, threshold, width, height}`。
貼圖會被重複鋪滿地面，所以左右／上下邊必須接得起來；有圖案但接縫明顯的地形會被抓出來。

## 4. art-gen 產物對應

`output/heroloom-ext/buildings/` 的參考圖（ref／4x 預覽）不是出貨格式。正式落地：

1. 建築：把每棟去背成透明底 PNG，高度落在 700–1500，比例符合上面的 band，存成
   `assets/heroloom-buildings/<id>.png`（檔名就是建築 id）。
2. 地形：輸出可無縫平鋪的 256×256 貼圖，存成
   `assets/heroloom-buildings/terrain/{concept-grass,concept-earth,concept-stone}.png`
   （也吃短名 `{grass,earth,stone}.png`）；道路 tile 是 `terrain/road.png`。
3. 跑 `node tools/checks/heroloom-ext-assets.mjs`：解 PNG、算比例、算接縫；建築缺檔、
   沒 alpha、比例出界或地形接縫太大都會 FAIL。

## 5. 引擎整合契約（Lead 在 build.mjs 套用）

建築圖只透過兩個既有入口進遊戲，所以**不用改 pixel-world.js**：

- `PIXEL_ASSETS.<id>`：`src/pixel-world.js:671` 起把圖載進 `sharedAtlas`，裁掉透明邊；
- `PIXEL_ASSETS.alphaAssets.<id> = true`：表示圖已去背，不要再做洋紅去背、且保留原始尺寸
  （寬度由 `uniformBuildingWidth()` 統一，所以來源 px 寬度不影響畫面大小，只影響比例）。

建議的 **prefer-if-present** build 步驟（保留原始 xilurus 檔可回退）：

```js
const loomB = path.join(root, 'assets/heroloom-buildings');
for (const name of ['hall','inn','tavern','forge','house']) {
  const loomFile = path.join(loomB, name + '.png');
  const src = fs.existsSync(loomFile) ? loomFile : path.join(root, `assets/xilurus/${name}.png`);
  put(name, JSON.stringify(await media(src, `heroloom-buildings/${name}.png`)));
  assetScript += `window.PIXEL_ASSETS.alphaAssets=window.PIXEL_ASSETS.alphaAssets||{};`
    + `window.PIXEL_ASSETS.alphaAssets.${name}=true;`;
}
```

地形同理，換的是 `conceptStone` / `conceptEarth` / `conceptGrass` 三個 key
（`src/pixel-world.js:353` 的 `ensureConceptTextures()` 只認這三個名稱，不用改）：

```js
const conceptFile = { grass: 'concept-grass.png', earth: 'concept-earth.png', stone: 'concept-stone.png' };
for (const [tag, name] of [['conceptGrass','grass'],['conceptEarth','earth'],['conceptStone','stone']]) {
  const loomFile = path.join(loomB, 'terrain', name + '.png');
  const src = fs.existsSync(loomFile) ? loomFile : path.join(root, 'assets', conceptFile[name]);
  put(tag, JSON.stringify(await media(src, `concept/${conceptFile[name]}`)));
}
```

另一條目前 build.mjs 註解（`:159-160`）寫的路是**直接覆蓋** `assets/xilurus/<id>.png` 與
`assets/concept-*.png` 原檔，出貨 HTML 的路徑完全不變、build.mjs 零修改，但原始圖會被蓋掉、
不能 A/B。兩條路都可以，建議 prefer-if-present（原檔留著，隨時能退回舊風格）。
不論哪條路，`alphaAssets.<id> = true` 都要保留。

## 6. 驗證

```bash
node --check src/heroloom-buildings.js
node test-heroloom-monsters.mjs
node tools/checks/heroloom-ext-assets.mjs            # 預設 worktree 根目錄
node tools/checks/heroloom-ext-assets.mjs <project-root>
node tools/checks/heroloom-ext-assets.mjs <dir>/heroloom-buildings
```

`assets/heroloom-buildings/` 不存在時印 SKIP、仍驗模組契約；存在時五棟建築 + 三張地形缺一就
FAIL（地形目錄不存在時只 SKIP 地形那幾行，方便建築先到）。

## 7. 已知限制

- **地形只有 3 種**（grass/earth/stone），對應目前村莊地面層實際用到的三張概念貼圖；其他 biome
  的色調是程式調色，不吃這裡的圖。
- **建築只有正面單張**：沒有多角度、沒有損壞／施工中狀態、沒有動畫；換圖不影響互動邏輯。
- 比例 gate 是「相對 xilurus」，不是絕對；高度 700–1500 是配合現有 384 繪製寬度調的。
- 圖內不要自帶大面積地面／陰影，pixel-world 會畫接地陰影與地面；透明邊會被自動裁掉。
- 沒有九宮格／切片資料：建築是整張縮放（`imageSmoothingEnabled=false`），細節請用整數比例。
