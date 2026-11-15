# Heroloom 弓手服裝變體（outfit variants）

暮影村的 HeroLoom 英雄渲染器本來只有「分層紙娃娃」（`docs/HEROLOOM.md`）：22 層部位圖疊出角色，
idle 4 幀 / walk 6 幀。這份文件記的是**第二條路徑**：弓手（archer）的三套預生裝備圖，
用「整張角色 sheet」直接取代分層 compose，並把 idle / walk 拉高到 **8 幀 @ 8 fps（125 ms/幀）**。

| 檔案 | 角色 |
| --- | --- |
| [`src/heroloom-outfits.js`](../src/heroloom-outfits.js) | 純資料/工具：registry、8 fps 幀表、PNG 驗證器、單格裁切 compose、outfit vs 分層決策。node 可測、無瀏覽器依賴。 |
| [`src/heroloom-hero.js`](../src/heroloom-hero.js) | provider 鉤子：`setOutfit()` / `reloadOutfits()`、sheet 載入與驗證、compose 走 outfit、`status().outfit`。 |
| [`src/heroloom-lab.js`](../src/heroloom-lab.js) | `?loom=1` 面板的 outfit 下拉（預設 / A / B / C）、8 fps 讀數、sheet 驗證狀態。 |
| [`test-heroloom-outfits.mjs`](../test-heroloom-outfits.mjs) | 18 個 node 測試；`npm test` 的一部分（排在 `test-heroloom.mjs` 之後）。 |

> 這條路徑**只影響弓手**。其他職業、以及弓手在 sheet 缺失/壞掉/某一列空白時，都照舊走分層 compose，
> 所以舊行為與 pixel-world 的 compose contract 完全不變（`req` 沒有 `outfit` 時結果與以前一樣）。

## 1. Sheet 規格

三套服裝都是「整張角色」sheet，格式跟 HeroLoom 的分層 sheet 相同，但內容是**已合成好的角色**：

| 項目 | 值 |
| --- | --- |
| 檔案 | `archer-a.png` / `archer-b.png` / `archer-c.png`（PNG） |
| 尺寸 | 512 × 448（固定；4x 預覽圖不能直接當素材） |
| 格數 | 8 欄 × 8 列，每格 64 × 56 |
| 錨點 | 腳底 `[26, 51]`（格內像素座標，y 往下） |
| 朝向右；左向由引擎整格鏡像 | 鏡像後腳底 x = `64-1-26 = 37` |
| 背景 | 透明（8-bit RGBA；非交錯 Adam7 不支援；bit depth 必須 8） |
| 每格內容 | 單一角色影像，含 alpha；透明格視為該幀不可用 |

列與動作（`OUTFIT_ACTIONS`）：

| row | action | 幀數 | ms/幀 | 迴圈 | 備註 |
| --- | --- | --- | --- | --- | --- |
| 0 | idle | 8 | 125 | ✔ | 本變體的重點：8 fps |
| 1 | walk | 8 | 125 | ✔ | 同上 |
| 2 | attack | 6 | 70 | ✘ | 跟 HeroLoom 包一致 |
| 3 | hurt | 3 | 100 | ✘ | 同上 |
| 4 | jump | 5 | 90 | ✘ | 同上 |
| 5 | cast | 5 | 110 | ✘ | 同上 |
| 6 | thrust | 5 | 70 | ✘ | 同上 |
| 7 | shoot | 5 | 100 | ✘ | 弓手射擊就是這一列（弓已畫進圖裡） |

裁切方式跟分層引擎一樣：整格（必要時先鏡像）掃 alpha 邊界框、外擴 1 px（夾在格內），
然後只把這塊貼到小 canvas；`footX/footY` 由 `outfitAnchor()` 算：
`footX = (mirror ? 37 : 26) - x0`、`footY = 51 - y0`。

## 2. Outfit ids / 外觀

`OUTFITS`（`OUTFIT_IDS = ['a','b','c']`）：

| id | 名稱 | English | 檔案 | 配色提示（僅文件用，引擎不上色） |
| --- | --- | --- | --- | --- |
| `a` | 森林遊俠 | Forest Ranger | `archer-a.png` | cloth green / leather brown / hair brown |
| `b` | 皇家藍銀 | Royal Blue-Silver | `archer-b.png` | cloth blue / leather silver / hair blond |
| `c` | 沙丘獵人 | Desert Hunter | `archer-c.png` | cloth sand / leather bronze / hair brown |

id 正規化很寬鬆：`'A'`、`' archer-a.png '`、`'archer_a'` 都會變成 `'a'`；`off / none / default / base /
layered / 0 / false / null / 空字串` 都代表「不要 outfit、走分層」。`outfitLabel('c')` → `'C 沙丘獵人'`。
`palette` 只是給人看的說明：**outfit cell 是烤好的圖，引擎不會套 palette、也不會隱藏武器**。

## 3. 8 fps 幀表（對 pixelfx 的 8 幀）

pixelfx 的角色動作（`pipeline/scripts/pixelfx/character/idle.js`、`walk.js`）`meta` 是
`{ size: [64,64], origin: [32,56], duration: 1, loop: true, fps: 8 }`，8 個 pose 在 `t = i/8`。
也就是 **8 幀、8 fps、125 ms/幀**；HeroLoom 的格子是 64×56、腳底 `[26,51]`（origin 不同，其餘一致）。
這就是「把幀數拉高到 pixelfx」的目標，所以 outfit 的 idle/walk 改成 8 幀。

HeroLoom 的 tick rate 是 20（50 ms/tick），125 ms = **2.5 tick/幀**，累積表因此是小數：

```js
outfitAf('idle') // [2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20]
outfitAf('walk') // 同上
```

`heroloomFrameIndex(af, tick)` 拿 `tick+1` 跟累積表比，所以小數 tick 會在畫面上**交替 3/2 tick**：
幀邊界落在 tick `3, 5, 8, 10, 13, 15, 18, 20`，間隔 `3, 2, 3, 2, …` → 實際每幀 **150 / 100 ms 交替**，
平均正好 125 ms（8 fps）。這是刻意的：HeroLoom 只有 20 Hz 時間軸，8 fps 不可能每幀都剛好 2.5 tick。

其他動作**保留 HeroLoom 包的幀數與時間**（表見 §1），`outfitAf()` 給它們的累積表例如
attack `[1.4, 2.8, 4.2, 5.6, 7, 8.4]`、hurt `[2, 4, 6]`。

若之後交付的 sheet 只有 4 或 6 幀 idle/walk（像舊分層圖），`outfitPlayback(name, available)` 會
自適應：`frames = min(8, available)`、`short: true`，以同一個 125 ms 播放，lab 會標「幀數 4/8」。

## 4. 素材注入（build 接線）

- 預設 base：`media/heroloom-outfits/`；build 可注入 `window.PIXEL_ASSETS.heroloomOutfitsBase`
  （跟 `heroloomBase` 同一個模式）。`outfitBase()` 會補結尾斜線，`outfitSheetUrl('a')` →
  `media/heroloom-outfits/archer-a.png`。
- 三張 sheet 是**可選素材**：`createDollHero()` 在 `character.json` 與分層 parts 就緒、`onReady`
  之後才 fire-and-forget 載入它們；不 await、不阻擋開場。
- **絕對不能經過 `opts.trackImage`**：pixel-ui 只要看到任一追蹤圖片失敗就會顯示「素材載入失敗」並中止開場。
  provider 呼叫 `loadImageUrl(url, opts.loadImage, timeout, undefined)`（track 傳 undefined），所以
  sheet 缺失不會弄壞遊戲；`test-heroloom-outfits.mjs` 有測試釘住這點。
- build 要做的（Lead 負責，不在本模組）：把三張 PNG 複製到 `media/heroloom-outfits/`，並在
  `window.PIXEL_ASSETS` 設 `heroloomOutfitsBase`。沒接線時就是「沒有 outfit」，一切照舊。

## 5. 引擎契約（heroloom-hero.js）

```js
const doll = createDollHero({ /* 原本的 opts；outfits:false 可整條關掉 */ });

doll.setOutfit('a');     // 'a'|'b'|'c'（或 'archer-a.png'）→ 回 normalized id；null/off → 回 null
doll.reloadOutfits();    // 忘掉已載入/失敗狀態，重新載入+驗證；回 false 表示 outfits 已停用或 hero 已 dispose
doll.compose(h, { action:'idle', tick:12, dir:'side', outfit:'b' });
```

`compose()` 的 outfit 決策（`resolveOutfitUse()`）：

1. 只有 class 是 archer 才可能用 outfit（其他 class 一律分層，`reason:'class'`）。
2. 優先序：`req.outfit` → `look.outfit`（hunter 資料若有）→ `setOutfit()` 的預設。
3. 明確的 off 值 → 分層（`reason:'off'`）；不認識的 id → 分層（`reason:'unknown'`）。
4. 已載入且驗證通過、該動作至少有一幀可用 → 用 outfit；否則分層，`reason` 是
   `pending` / `invalid`（載入失敗或幾何/簽名錯） / `missing`（還沒載到）。

outfit compose 回傳的形狀跟分層 compose 相同（pixel-world 不用改）：

```js
{
  cv, footX, footY,                 // 已裁好、必要時鏡像的小 canvas；腳底錨點
  heroHeight: 30,
  parts: [],                        // 單張烤圖，沒有分層清單
  shadow: { cv, footX, footY },
  look: { ...look, outfit: 'a' },
  key: 'outfit|a|idle|0|0',         // id|action|frame|mirror
  outfit: 'a', action: 'idle', frame: 0, mirror: false,
}
```

- `parts` 是**帶額外屬性的空陣列**（`action` / `slot` / `dir` / `dirName` / `wantDir` / `outfit`），
  因為 pixel-world 的 `drawDollHero()` 會讀 `c.parts.dir/.action/.slot/.wantDir` 做陰影與特效掛點；
  沒有這些屬性會壞。outfit 路徑的 `slot` 就是幀 index。
- 快取：`outfitCropCache`，key 是 `id|action|frame|mirror|sheet.info.at`（重新載入 sheet 會換 at，
  強制重裁）；容量規則跟原本 cropCache 共用 `opts.cap`。`outfitCropCache` 在 `dispose()` 清掉。
- `status().outfit` 快照：`{ enabled, skipped, base, active, loaded, pending, missing, failed, sheets,
  cached, composes, hits, misses, fallbacks }`；`sheets.a` 是
  `{ id,url,ok,width,height,errors,warnings,rows,used,playback,usable,missingRows,at }`，
  `used` / `playback` 是依實際掃到的幀數自適應。`counters()` 另加
  `outfitComposes / outfitHits / outfitMisses / outfitFallbacks / outfitLoaded`。
- `opts.outfits === false`：完全不請求、不使用，`status().outfit.skipped === true`。

## 6. Lab（`?loom=1`）

弓手被選中時才會出現 `outfit` 那一列（其他職業隱藏）：

- **下拉**：`預設` / `A 森林遊俠` / `B 皇家藍銀` / `C 沙丘獵人`；切換會 `doll.setOutfit()` 並把動畫 tick 歸零，
  讓眼睛馬上看到第一幀。`⟲ 重新檢查` 會 `reloadOutfits()`（素材剛複製進來時不用重新整理）。
- **驗證狀態**：載入成功顯示 `A 森林遊俠 ✓ 512×448 · idle 8/8 @125ms · walk 8/8 @125ms · 8 fps
  （125 ms/格, 2.5 tick/格 ≈ 100/150 ms 交替）`，缺列會列 `幀數 attack 4/6 …`；失敗顯示
  `驗證失敗（原因）`；沒交付就是 `尚未提供 → 分層 fallback`。
- **info/perf**：info 多一行 sheet/幀數/快取/fallback；perf 顯示 `outfit N/3 sheets·X cmp·Y fb`；
  path 標籤在 outfit 生效時顯示 `compose·outfit`。
- 沒有素材時整列照常可用（顯示 `尚未提供`），lab 其他功能不受影響。

## 7. 驗證

```bash
node test-heroloom-outfits.mjs   # 18 tests：幀表/驗證器/裁切/provider fallback/真素材報告
node test-heroloom.mjs           # 舊模組回歸（22 tests）
npm test                         # 已把 test-heroloom-outfits.mjs 插在 test-heroloom.mjs 之後
```

- 幾何/Png 驗證（node，不需解碼整張圖）：
  `validateOutfitSheet(fs.readFileSync('media/heroloom-outfits/archer-a.png'))`
  → `{ ok, errors, warnings, geometry, png }`。檢查：PNG 8-byte signature、IHDR（存在、13 bytes）、
  `512×448`、bit depth 8、非交織；RGB/gray 只給 warning（透明會被忽略）。
- 逐格可用性（需要解碼後 RGBA）：`outfitSheetFrames(rgba, 512, 448)` → 每列 `{used, empty, cells}`，
  透明（alpha ≤ 8）或少於 `minPixels`（預設 24 px）的格子算不可用。`test-heroloom-outfits.mjs`
  最後一個測試會掃 `media/heroloom-outfits/` 與 `output/heroloom-ext/archer/` 的真圖並印報告；
  沒圖就跳過，不會失敗。

## 8. 已知限制

- **outfit 是烤好的單張圖**：不套 palette、不套 `hideWeapon`、不能換部件；要改色只能重生圖。
  因此 lab 的 gear 勾選對 outfit 無效。
- **只有弓手**有 outfit 素材；其他職業仍走分層。
- 只有 `idle` / `walk` 是 8 幀；attack/hurt/jump/cast/thrust/shoot 仍是 HeroLoom 包的 5/6/3 幀，
  所以「全動作 8 fps」還沒做到（目前目標是 idle/walk 對齊 pixelfx）。
- 尺寸必須正好 512×448；art-gen 交付的 4x 預覽（2048×1792）會被驗證器擋掉，**要 1x 或先縮圖**。
- 驗證器只讀 PNG 標頭；真正「每格有沒有圖」要靠瀏覽器 canvas 掃 alpha（或 node 端自行解碼）。
  空白列/空幀不會讓整張 sheet 失敗，provider 會逐動作 fallback 到分層（畫風可能有接縫）。
- 分層 base 圖仍是 idle 4 幀 / walk 6 幀，所以沒 outfit 時動畫比較鈍——這是 HeroLoom 免費包的限制。
- 這三套圖是**本專案為弓手生成的原創裝備圖**，不是 Heroloom 包的內容；不要跟 `assets/heroloom/` 的
  授權條款混在一起（那包的條款見 `docs/HEROLOOM.md` §0）。
- build 接線（複製到 `media/heroloom-outfits/`、注入 `PIXEL_ASSETS.heroloomOutfitsBase`）由 Lead 負責；
  本模組不碰 `build.mjs` / `src/pixel-world.js`。
