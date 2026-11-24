# Heroloom 紙娃娃引擎（暮影村英雄渲染器）

Heroloom 是一套「分層角色 + 逐格動作」的像素紙娃娃素材包（作者 ljs0218，<https://ljs0218.itch.io/heroloom>）。
暮影村用的是免費樣本包 **Heroloom — Free**（`pack: core`，74 檔 / 494,899 B），放進遊戲當英雄渲染器的實驗，
目標是取代 DV2 紙娃娃（`docs/PAPERDOLL.md`）。這份文件記授權、素材格式，以及遊戲/build 怎麼接。

- 素材原封不動放在 [`assets/heroloom/`](../assets/heroloom/)（vendor 原文，不要手改；要改先看 §0）。
- 遊戲端程式由 Lead 負責：[`src/heroloom.js`](../src/heroloom.js)（純邏輯）、[`src/heroloom-hero.js`](../src/heroloom-hero.js)（瀏覽器 provider）、
  [`src/heroloom-lab.js`](../src/heroloom-lab.js)（`?loom=1` 實驗面板）、[`test-heroloom.mjs`](../test-heroloom.mjs)（`npm test` 的一部分）。
- 本文件 + build 接線 + 結構檢查：`build.mjs`、[`tools/checks/heroloom-assets.mjs`](../tools/checks/heroloom-assets.mjs)、`docs/HEROLOOM.md`。

## 0. 授權硬規則（先讀）

`assets/heroloom/LICENSE.txt`（Asset License v1.0.0）原文重點，**逐條照抄**（英文原文才有效力，下面是摘要）：

> YOU MAY
> - Use the assets in any number of your own games and interactive projects, commercial or non-commercial.
> - Modify the assets (recolour, edit, combine, add your own parts) for use in those projects.
> - Show the assets in screenshots, trailers and promotional material for those projects.
> - Ship the runtime code included in this pack inside your projects.
>
> YOU MAY NOT
> - Redistribute, resell, share or sublicense the assets or the pack's files as assets, whether original or modified,
>   alone or as part of another asset pack, template, engine plugin, character generator, clip-art or stock collection.
> - Offer a tool or service whose main purpose is to let others export images made from these assets
>   (the included Character Maker is for the licence holder's own use).
> - Use the assets to create NFTs or other blockchain tokens.
> - Use the assets as training data for machine-learning or generative AI systems.
> - Claim that you are the original creator of the assets.
>
> OTHER TERMS
> - One licence covers one person or one company/team working on its own projects.
> - Credit is appreciated but not required.
> - The assets are provided "as is", without warranty of any kind.

對暮影村的具體結論：

- 這包只給**本專案（暮影村）自己用**：可以進 repo、可以進 build 出貨的遊戲、可以改色/裁切給遊戲用。
- **不可以**把 `assets/heroloom/`（或 build 出來的 `media/heroloom/`）當成「素材包 / 角色產生器」另外公開、轉售、分享或提供下載。
  也就是說：不要把這個資料夾包成 zip 上架、不要做一個「用這些圖產生角色」的公開服務。
- **廠商的 `maker.html` 不進 build**（見 §5）：它會讓別人匯出這些素材的圖，授權只准授權持有人自己用。
  檔案留在 `assets/heroloom/` 供本機開發參考，不會被複製到 `media/heroloom/`，也不會出現在 `暮影村.html`。
- 註明作者（ljs0218 / Heroloom）是加分不是義務；不要宣稱素材是我們原創。授權是一人/一團隊一份，不要拆給其他專案用。

## 1. 檔案佈局

```
assets/heroloom/
├── character.json          # 規格：cell/columns/foot/actions/layers/slots/palettes/anchors/looks
├── LICENSE.txt             # Asset License v1.0.0（§0，必留）
├── README.md               # vendor 說明（免費樣本包；完整版 998 parts）
├── maker.html              # 廠商 Character Maker：只在 assets/ 留存，不進 build（§0）
├── parts/<slot>/<part>[.<layer>].png
│   └── 48 張分層圖（46 張 vendor + 自製 `weapon/hammer{,.back}`），每張都是整張 512×448 sheet（8 欄 × 8 列）
├── icons/<slot>/<part>.png # 23 張 32×32 選單小圖（body/face 沒有 icon）
└── runtime/js/paperdoll.js # vendor 執行期（可出貨，但遊戲用自己 src/heroloom*.js）
```

- 分層圖命名規則：`<part>.png` = `main` 層；`<part>.<layer>.png` = `back` / `front` / `head` / `under` 層。
  例：`parts/hair/long.png`、`parts/hair/long.back.png`、`parts/hair/long.under.png`。
- 23 個 icons = 25 個 part 扣掉 `body/base`（身體永遠在）和 `face/eyes`（臉永遠在）→ 23。

## 2. 資料模型（`character.json`）

```jsonc
{
  "version": "1.0.0",
  "cell": [64, 56],        // 單格像素；一格 = 一個 64×56 的角色畫面
  "columns": 8,            // 每列最多 8 格；sheet 寬 = 8 × 64 = 512
  "foot": [26, 51],        // 腳底在格內的像素位置 → 畫到世界座標 (x,y) 時偏移 (x-26, y-51)
  "faces": "right",        // 只畫右向；左向 = 整張 canvas 水平鏡像
  "ink": "#150d1b",        // 共用墨線色（不能用調色盤換掉）
  "actions": { ... },      // 8 個動作，一列一個（見 §2.1）
  "layers": [ ... ],       // 22 個繪製層，陣列順序就是疊圖順序（見 §2.2）
  "slots": { ... },        // 12 個部位（見 §2.3）
  "palettes": { ... },     // 5 條 6 色色階（見 §2.4）
  "anchors": { ... },      // 每個動作每格 anchor（見 §2.5）
  "looks": { ... }         // 4 組現成 recipe（knight/mage/rogue/villager）
}
```

### 2.1 動作（一列一動作）

| 動作 | row | frames | 每格 ms | loop | 備註 |
| --- | --- | --- | --- | --- | --- |
| `idle` | 0 | 4 | 200 | ✔ | 待機 |
| `walk` | 1 | 6 | 90 | ✔ | 走路 |
| `attack` | 2 | 6 | 70 | ✘ | 揮砍（smear 格：index 2、3） |
| `hurt` | 3 | 3 | 100 | ✘ | 受擊 |
| `jump` | 4 | 5 | 90 | ✘ | 跳躍 |
| `cast` | 5 | 5 | 110 | ✘ | 施法 |
| `thrust` | 6 | 5 | 70 | ✘ | 刺擊 |
| `shoot` | 7 | 5 | 100 | ✘ | 射擊 |

- `frames ≤ columns`（最多 6 格/列，8 欄有 2 欄空著）；sheet 高 = 8 列 × 56 = 448。
- 非 loop 動作播完最後一格就停（`frameAt` 會回 `done: true`）；loop 動作取模。
- 沒有「方向列」：只有右向。四方向 = 右 = 原圖、左 = 鏡像、上/下由遊戲自行選動作或用同一列。

### 2.2 繪製層（`layers`，22 層，順序即疊圖順序）

| # | slot | layer | 說明 |
| --- | --- | --- | --- |
| 1 | `back` | main | 背包等背在身後的東西（最底） |
| 2 | `cape` | main | 披風（後半） |
| 3 | `hair` | back | 長髮後層 |
| 4 | `hat` | back | 帽子後沿 |
| 5 | `body` | back | 身體後層 |
| 6 | `top` | back | 上衣後層 |
| 7 | `shield` | main | 盾 |
| 8 | `body` | main | 身體主層 |
| 9 | `bottom` | main | 下著 |
| 10 | `shoes` | main | 鞋 |
| 11 | `top` | main | 上衣主層 |
| 12 | `weapon` | back | 武器（握在身後的部分） |
| 13 | `body` | head | 頭 |
| 14 | `face` | main | 眼睛 |
| 15 | `acc` | main | 飾品主層（眼鏡、鬍子） |
| 16 | `hair` | main | 頭髮主層 |
| 17 | `hat` | main | 帽子主層 |
| 18 | `acc` | front | 飾品前層 |
| 19 | `weapon` | main | 武器主層（握在身前） |
| 20 | `body` | front | 身體前層（手） |
| 21 | `top` | front | 上衣前層（袖） |
| 22 | `cape` | front | 披風（前半，最上） |

疊圖時每個 `(slot, layer)` 只畫「這個 recipe 有選到該 slot」的那一張分層圖；
`hat` 的 part 若 `coversHair: true`，`hair/main` 改用 `hair/under`（見 §3 bake 規則）。

### 2.3 部位（`slots`：12 個）

| slot | required | 可換色（`color` ramp） | 零件（part ids） |
| --- | --- | --- | --- |
| `back` | ✘ | `cloth` | backpack |
| `cape` | ✘ | `cloth` | cape |
| `hair` | ✘ | `hair` | short / spiky / ponytail / long（ponytail、long 有 back+under 層） |
| `hat` | ✘ | `cloth` | wizard、helmet（`coversHair`）、band |
| `body` | ✔ | `skin` | base（main/back/front/head） |
| `top` | ✘ | `cloth` | tunic / robe / armor（各有 main/back/front） |
| `shield` | ✘ | `cloth` | buckler |
| `bottom` | ✘ | `cloth` | pants / skirt |
| `shoes` | ✘ | `leather` | boots / sandals |
| `weapon` | ✘ | —（`null` 不可換色） | sword / staff / dagger / bow（各有 main/back）／**hammer**（自製聖騎士戰錘，main/back，見 §4.1） |
| `face` | ✔ | `eye` | eyes |
| `acc` | ✘ | `cloth` | glasses、beard（`colorFrom: "hair"`：鬍子跟頭髮同色） |

- 26 個 part id（25 個 vendor + 自製 `weapon/hammer`）、48 張分層圖（差額就是 back/front/head/under 多層）。
- 必選 = `body` + `face`；`bake()` 沒給時自動補每個 required slot 的第一個 part。
- `colorFrom` 讓該 part 跟著別的 slot 的色階換色（目前只有 `acc/beard` → `hair`）。

### 2.4 調色盤（`palettes`：5 條 ramp × 6 色）

每條 ramp 有 `base`（原圖色）+ `variants`（換色目標），每列**固定 6 個 `#rrggbb`**，由深到亮：

| ramp | variants | 用途 |
| --- | --- | --- |
| `skin` | light / tan / dark / moss | 膚色（body） |
| `hair` | brown / black / blonde / red / blue / pink / silver | 髮色（hair、beard） |
| `cloth` | blue / red / green / purple / black / white / yellow | 布料：cape/top/bottom/hat/shield/acc/back |
| `leather` | brown / black / white | 鞋子 |
| `eye` | violet / red / green / blue / brown | 眼睛 |

- 每條 ramp 的 `base` 等於它的第一個 variant（例如 skin 的 base = light），選第一個 variant 時不做像素處理。
- **換色 = 精確 RGB 對調**（exact-colour swap）：對每個非透明像素，若 RGB 等於 `base[k]` 就換成 `variants[v][k]`。
  不做相似色/加權匹配 → 反鋸齒邊緣或不在色階裡的顏色（墨線 `ink`、武器金屬色等）維持原樣。
  這也是 build 不把分層圖轉 webp 的原因：有損壓縮會改動像素值，精確比對就失效（無損 webp 可以，但目前直接複製 PNG）。

### 2.5 錨點（`anchors`）

- 每個動作一個陣列，長度 == 該動作 `frames`；每格一個物件：
  `{ head: [x,y], hand: [x,y], weaponAngle: deg, smear: bool }`。
- 座標是**格內像素**（相對 cell 左上角，x 0–63 / y 0–55），不是世界座標。
- 用途：名字/血條/特效掛在頭上、武器特效從手部出發、`weaponAngle` 給武器轉向用（°）、`smear: true` 的格子有揮動殘影。
- 鏡像（左向）時 anchor 也要鏡像：`x' = cell.w - 1 - x`，`weaponAngle' = -weaponAngle`。

### 2.6 bake(recipe) 的語意

```js
const doll = new PaperDoll(spec, { base: "media/heroloom/" });
const sheet = await doll.bake({ parts: { hair: "long", top: "robe", hat: "wizard" },
                                colors: { hair: "silver", top: "purple" } });
// sheet = 一張 512×448 canvas，格線跟原分層圖一樣（cell 64×56、8 欄、一列一動作）
```

1. `recipe = { parts: { slot: partId }, colors: { slot: variantName } }`；required slot 沒給就補第一個 part。
2. 依 `spec.layers` 順序，對每一層找 `chosen[slot]` 的 part；沒有就跳過。
3. `coversHair` 的帽子上場時，`hair/main` 換成 `hair/under`（帽子把頭髮壓下去）。
4. 每張分層圖先依 `colorFrom || slot` 的 ramp + recipe 指定 variant 做精確換色（結果按 `url|ramp|variant` 快取），
   再 `drawImage` 整張 512×448 到輸出 canvas 的 (0,0)。
5. 回傳整張 canvas；之後用 `frame(action, i)` 取 `{x,y,w,h,ms}` 格子，`drawImage(sheet, x,y,w,h, px-foot[0], py-foot[1], w,h)` 畫到世界。
6. **左向**：把整張 canvas 水平鏡像（`ctx.scale(-1,1)` 或旋轉 180° 的寫法），不要另外鏡像每個 part。
7. 一張 bake 後的 sheet 是 512×448 RGBA ≈ 0.9 MB；每個 recipe 一份 → 快取要設上限（跟 `createDollHero` 的 `cap` 同一個道理），
   `bake()` 本身不便宜（最多 22 次 drawImage + 換色），同一 recipe 不要重覆 bake。

## 3. 遊戲怎麼用（接線）

> 這一節描述接線契約；實際匯出以 `src/heroloom*.js` 為準（見 §6 API stub）。

- [`src/heroloom.js`](../src/heroloom.js)：**純邏輯、node 可測**。把暮影村的獵人（職業、裝備、顏色）映射成 Heroloom recipe
  （`looks` + 自訂 parts/colors）、把遊戲狀態映射成動作（idle/walk/attack/hurt/jump/cast/thrust/shoot）、
  提供 frame 取樣（`frameAt` 等價邏輯）與鏡像/錨點換算。不碰 canvas、不碰 DOM，`test-heroloom.mjs` 直接 import。
- [`src/heroloom-hero.js`](../src/heroloom-hero.js)：瀏覽器端 provider，**與 `src/paperdoll-hero.js` 的 `createDollHero` 相容**：
  同樣吃 `opts = { trackImage, makeCanvas, base, cap, onEvict, onReady }`、同樣提供 `status()` / `setSpec()` / `compose()` 這一組介面，
  讓 `src/pixel-world.js` 的英雄繪製分支可以整組換掉而不動呼叫端。差別：Heroloom 的圖是 48 張整張 sheet + 執行期 bake，
  `base` 讀 `PIXEL_ASSETS.heroloomBase`（`media/heroloom/`），資料檔是 `character.json`（不是 `paperdoll.json`）。
- 逃生口：`?doll=0`（也吃 `off/no/sheet/none`）→ 完全回到原本烘好的 hero sheet；Heroloom 沒載到（404/逾時）也自動 fallback。
  遊戲預設走哪一條由 Lead 決定；實驗期間兩種都要能跑。
  **2026-11-15 定案**：HeroLoom（experiment/heroloom 分支版本）是唯一英雄系統、遊戲預設；HeroCreator 草稿捨棄。
  DV2 包只留可選開關 `?doll=dv2[:<職業>]` / `?dv2lab=1`（見 [`docs/DV2-PHASE6.md`](DV2-PHASE6.md) §5）。
- 實驗面板：`?loom=1` 掛 [`src/heroloom-lab.js`](../src/heroloom-lab.js)（由 `src/pixel-ui.js` 呼叫），
  用 `PIXEL_ASSETS.heroloomBase` 載 spec/圖，可即時換 part/color 看 bake 結果；平常遊戲完全不碰這條路徑。
- build 接線：`build.mjs` 把 `assets/heroloom/` 原樣複製到 `media/heroloom/`（排除 `maker.html`，理由見 §0），
  並注入 `window.PIXEL_ASSETS.heroloomBase = "media/heroloom/"`；沒這包時字串不出現，呼叫端 fallback。
  - 兩種輸出目錄都支援：repo 內的 `dist/`（一般 checkout）與 `../../outputs/`（`work/` 下的 worktree，寫 `outputs/暮影村.html`），
    跟 `paperdollBase` / `paperdollDv2Base` / `monsterDollBase` 用的是同一段 `mediaDir` 邏輯。
  - 出貨檔案清單：`media/heroloom/character.json` + `media/heroloom/parts/**`（48 張）+ `media/heroloom/icons/**`（23 張）
    + `runtime/js/paperdoll.js` + `LICENSE.txt` + `README.md` = 75 檔（76 扣掉 `maker.html`）。
  - 分層圖不內嵌、不轉 webp、不改檔名：換色靠精確 RGB 比對（§2.4），轉檔會破壞它。

## 4. 怎麼重建/更新素材

素材是 vendor 原文，不要手改。要重新從來源複製：

```powershell
# 來源（本機，Claude code 的 lab 資料夾；74 檔 / 494,899 B）
$src = 'C:\Users\ray\Desktop\Claude code\heroloom-lab\heroloom-free'
Copy-Item -Recurse -Force "$src\*" assets\heroloom\
```

複製完**一定要**跑結構檢查：

```bash
node tools/checks/heroloom-assets.mjs
```

它會逐項 PASS/FAIL（依賴 0 套件、不開圖檔，PNG 尺寸直接讀 IHDR）：

- 76 檔齊全（48 張 part sheet、23 張 icon、character.json/LICENSE/README/maker/runtime 五個核心檔、沒有多餘檔）
- 每張 part PNG 是 512×448（= `columns × cell` 與 `動作數 × cell` 推出來的），每張 icon 是 32×32
- `character.json`：cell [64,56]、columns 8、foot 在格內、faces right、8 個動作 row 0–7 不重複、frames/ms/loop 合理
- 22 層 / 12 slots / 每個 layer path 都存在、48 張圖全部被 spec 引用（沒有孤兒圖）
- anchors 陣列長度 == frames、head/hand 在格內、weaponAngle/smear 型別
- palettes 每列 6 個 hex、variant 數 skin4/hair7/cloth7/leather3/eye5、looks 的 part/顏色都存在
- LICENSE.txt 有 `YOU MAY NOT` 與「不得當素材包轉散布 / 不得 AI 訓練 / 不得 NFT」條文
- build.mjs 有複製 `assets/heroloom` 並設 `PIXEL_ASSETS.heroloomBase = "media/heroloom/"`

離開 `assets/heroloom/` 的部分（`src/heroloom*.js`、`test-heroloom.mjs`、package.json）由 Lead 負責，
檢查腳本刻意**不**加進 `package.json` 的 npm script（package.json 是 Lead 的 scope）；要跑就記這一行：`node tools/checks/heroloom-assets.mjs`。

build（整合完成後）：

```bash
node build.mjs
```

驗收：輸出目錄的 `media/heroloom/character.json` 在、`media/heroloom/parts/**` 48 張 PNG 在、HTML 裡有
`window.PIXEL_ASSETS.heroloomBase="media/heroloom/"`。build 與 `npm test` 跨 agent 序列化，跑之前先確認沒人正在 build
（build 會寫 `../../outputs/暮影村.html`）。

### 4.1 自製部件：聖騎士戰錘（`weapon/hammer`）

`assets/heroloom/parts/weapon/hammer.png`（main）+ `hammer.back.png`（back）不是 vendor 檔，是程式畫的（2026-11-24，授權 §0 允許修改/加自製部件給本專案用）。
要重生/改圖不要手改 PNG，改腳本再跑：

```bash
python pipeline/scripts/heroloom/make_hammer.py     # 重生 hammer.png / hammer.back.png（需 Pillow + numpy，會讀 sword 兩張 sheet 決定哪格放哪層）
python pipeline/scripts/heroloom/preview_hammer.py  # 聖騎士全套 × 劍/錘對照 → output/hammer-weapon/compare.png、grip-check.png
```

- 畫法：27×10 的小模板（約 16 px 長木柄 + 金色柄尾/護環 + 8×7 核心的鋼色錘頭，兩端打擊面較亮、中間小金十字；握點靠柄尾，手前露出約 14 px 木柄），調色盤只用 sword 圖已有的顏色（墨線 `#150d1b`、鋼 4 階、金 3 階、木 3 階）。
  每格用該格 anchor 的 `hand` 當握柄支點、`weaponAngle` 旋轉（最近鄰、無反鋸齒），錘頭朝 `weaponAngle` 方向。
- 層分配與 sword 一致：sword 在 main 的格放 main；`smear: true` 的格加揮擊殘影（attack 第 2 格在 back、第 3 格在 main，同 sword）；
  sword 空的格 hammer 也空（目前每個有效格都有武器）。
- 這是 vendor 包外的自製檔：`tools/checks/heroloom-assets.mjs` 的檔數/張數已計入（76 檔 / 48 張），從 vendor 重新複製 pack 時不要把它洗掉。
- 職業預設（聖騎士只拿錘、劍歸狂戰士）在 `src/heroloom.js` 的 `CLASS_LOOK`，不在這包素材裡。

## 5. 已知限制 / 風險

- **只有右向**：左向是整張鏡像；沒有真正的上/下動作列。要四方向得靠遊戲端挑動作/鏡像，細節由 `src/heroloom.js` 決定。
- **精確換色**：不在 6 色色階裡的顏色不會換（墨線、金屬、眼睛高光都是固定色）。要新增色階只能改 vendor 圖或另外做 tint。
- **品項少**：免費樣本包只有 25 個 vendor part id / 46 張分層圖（另加自製 hammer 2 張），裝備外觀變化有限；完整版（998 parts，九包）是另一份授權，不能直接混進來。
- **bake 成本 / 記憶體**：每個 recipe 一張 512×448 canvas；快取一定要有上限，避免每隻獵人每套裝備都留一張。
- **maker.html 不出貨**：`media/heroloom/` 不該出現它（授權 §0）；如果哪天要放出來給玩家玩，先確認授權（目前不行）。
- 授權是**一人/一團隊一份**：這個 repo 以外的專案不能直接引用 `assets/heroloom/`。

## 6. API

### src/heroloom.js（純資料/對照層，node 可測）
- 常數：`HEROLOOM_CELL [64,56]`、`HEROLOOM_COLUMNS 8`、`HEROLOOM_ROWS 8`、`HEROLOOM_FOOT [26,51]`、`HEROLOOM_HERO_HEIGHT 30`、`HEROLOOM_TICK_RATE 20`（DV2 的 tick = 50 ms，遊戲 HERO_H=21 → 世界縮放 k=21/30）
- `HEROLOOM_ACTIONS`：`{idle:{row:0,frames:4,ms:200,loop:true}, walk:{row:1,frames:6,ms:90,loop:true}, attack:{row:2,frames:6,ms:70}, hurt:{row:3,frames:3,ms:100}, jump:{row:4,frames:5,ms:90}, cast:{row:5,frames:5,ms:110}, thrust:{row:6,frames:5,ms:70}, shoot:{row:7,frames:5,ms:100}}`
- `HEROLOOM_LAYERS`（22 層 `{slot,layer}` 順序）、`HEROLOOM_SLOTS`（每 slot：色盤 ramp、parts→layers、required、coversHair、colorFrom）
- `HEROLOOM_PALETTES`（每 ramp 6 個 base hex + variants）、`HEROLOOM_CLASSES`（9 個 look）、`CLASS_LOOK`（每職業預設 parts+colors）
- `heroloomLook(h)` → `{classId, gender, weaponType, parts, colors}`；讀 `h.equipment.helm/shield/weapon/armor|chest|belt|legs|gloves|boots/cape`、`h.weaponKind`、`h.gender`；旅人 unarmed → `weaponType:null`、沒有 weapon part
- `heroloomRecipe(look,{hideWeapon})` → `{parts,colors}`；`heroloomRecipeSig(recipe)` 穩定 cache key
- `heroloomAf(name)`（frame 結束 tick）、`heroloomFrameIndex(af,tick)`（同 DV2 getSlot）、`heroloomActionKey(dv2Key,weaponType)`（attack.bow→shoot、attack.dagger→thrust、skill.staff→cast、victory→jump、death/ride→hurt/idle）
- `heroloomData()` → DV2 相容 facade：`tickRate 20`、`meta.heroHeight 30`、`skins.body`、`actions` 帶 af/releaseSlot/impactSlot；刻意**沒有** death / ride_sit / ride_stand / give，遊戲走既有的推導路徑（倒地＝hurt 最後一格＋lie 旋轉、騎乘＝walk/stand）
- `HEROLOOM_BASE()` → `window.PIXEL_ASSETS.heroloomBase`，預設 `"media/heroloom/"`

### src/heroloom-hero.js（瀏覽器 provider，pixel-world 用）
`createDollHero({trackImage,makeCanvas,cap,onEvict,onReady,loadTimeoutMs,base,loadImage})` →
- 生命週期/查詢：`setSpec('hero'|'hero:archer,priest'|'off' 等)`、`get on`、`get data`、`covers(classId)`、`status()`、`counters()`、`dispose()`
- `compose(h, req)`：`req={action,tick,dir,hideWeapon,globalTick,facing,tint}` → `{cv,footX,footY,heroHeight,parts,look,key,shadow}`，未載入回 `null`
  - `cv` 是**裁切後**的單格 canvas；`footX/footY` 以裁切像素計；世界座標換算 `k = HERO_H / heroHeight`
  - `parts[].dir` 是數字 0=up 1=side 2=down 3=left（mountPlan/DOLL_HOR 要吃數字），另有 `.dirName`
  - 左向已由引擎整張鏡射，呼叫端不要再翻一次
- `composeRecipe(recipe,{action,frame,tick,dir,mirror})` → 同上；lab/任意配方用，載入後同步
- `bakeRecipe(recipe)` → `Promise<512×448 canvas>`（lab 匯出用）
- `frame(action,i)` → `{x,y,w,h,ms,index}`；`look(h)`、`recipe(h,opts)`、`weaponTypeOf(h)`、`resolve()`
- 色票：`recipe.colors` 可用 ramp key（skin/hair/cloth/leather/eye）或 slot key（body/top/hat/shoes/face/cape/shield），兩種都接受。
