# Mistvale 檔案地圖（給新 session 先讀，省去重新探索）

規則：`pixel-game.js`（1746 行）和 `pixel-world.js`（2183 行）很大，**不要整檔 Read**，先 Grep 函式名再用 offset/limit 讀。

## 目前使用的遊戲（pixel-*）
| 檔案 | 角色 |
|---|---|
| `src/pixel-data.js` (144) | 資料：BUILDINGS、CLASSES、RARITIES、TRAITS、RECIPES、DIFFICULTIES、HUNT_ZONE、SAVE_KEY |
| `src/pixel-game.js` | 模擬核心：`createGame`、獵人 AI、戰鬥、委託、存檔、離線結算 |
| `src/pixel-world.js` | 像素渲染：`createPixelWorld`、地面/建築/角色繪製、`drawPortrait`、地圖 |
| `src/pixel-ui.js` (443) | 介面與 HUD、讀取畫面 |
| `src/pixel-index.html` / `pixel-style.css` | 介面結構與樣式 |
| `src/pixel-icons.js` | 圖示 canvas（`iconsReady`） |

## 地圖與尋路（單一來源）
| 檔案 | 角色 |
|---|---|
| `src/village-grid.js` | 村莊 4×4 棋盤：建築位置、街道、村界、出入口（改版面只改這裡） |
| `src/landscape-layout.js` | 道路、柵欄、池塘、碰撞（`buildingSolid`、`onPaved`、`doorStand`） |
| `src/village-nav.js` | 村內 8 方向 A*，0.5 格解析度 |
| `src/overworld.js` | 世界 74×69、七個狩獵區、生態域、環形道路 |
| `src/concept-ground.js` / `concept-props.js` | 概念圖對齊的地面與道具 |
| `src/lore.js` / `hero-chatter.js` | 魔物名稱與設定、獵人對話 |
| `src/asset-loading.js` | `trackImage`：**新增任何 `new Image` 都要包它**，否則讀取畫面閘門失效 |
| `src/dir4.js` | 動畫 4 方向規則（2026-11-15：可斜走，動畫方向 = 畫面向量的 90° 象限）：`quantize4`（一次性）/`quantize4Stable`（走路，10° 遲滯）、`facingOk`（check_facing 判準）、常數 `QUADRANT_OFFSET_DEG`/`FACING_HYSTERESIS_DEG`、sheet 選列 `dirSuffix`/`leftRow`；`pixel-world.js`（朝向/選列）用。`stairStep`（舊 4 軸階梯）遊戲已不用 |
| `assets/mounts.json` | 騎乘坐騎表（物種 → 坐/站、四方向鞍點；`pipeline/scripts/dv2fmt/gen_mounts.py` 產生，build 內嵌成 `PIXEL_ASSETS.mounts`）。遊戲欄位 `h.mount`、`game.setMount`、`MOUNT_SPEED_MULT` 在 `pixel-game.js`；規格 [PAPERDOLL.md](PAPERDOLL.md) §20 |
| `assets/monsterdoll/` | 單層怪物紙娃娃包（DV2 C2，`pipeline/scripts/dv2fmt/build_monster_pack.py` 從 monsters3 轉出，逐像素相同）。**只在 `?mdoll=1` 畫**；規格 PAPERDOLL.md §21 |
| `src/heroloom.js` / `heroloom-hero.js` / `heroloom-lab.js` | **預設英雄渲染器**（2026-11-15 定案：HeroLoom = experiment/heroloom 分支版本，HeroCreator 草稿捨棄）：`assets/heroloom/` 分層紙娃娃；`?doll=0` 回烘好的 sheet、`?doll=dv2` 才用 DV2 包；`?loom=1` 實驗面板；規格 [HEROLOOM.md](HEROLOOM.md)，測試 `test-heroloom.mjs`、`tools/checks/heroloom-assets.mjs`。擴充包：弓手換裝 `?outfit=a|b|c`（`heroloom-outfits.js`，[HEROLOOM-OUTFITS.md](HEROLOOM-OUTFITS.md)）、HeroLoom 風格魔物 `?lmob=1`（`heroloom-monsters.js`，[HEROLOOM-MONSTERS.md](HEROLOOM-MONSTERS.md)）、建築／地面／場景圖（`assets/heroloom-buildings`、`assets/heroloom-scene`，build 有檔就優先用；[HEROLOOM-BUILDINGS.md](HEROLOOM-BUILDINGS.md)、[HEROLOOM-SCENE.md](HEROLOOM-SCENE.md)）、特效重上色（[HEROLOOM-PIXELFX.md](HEROLOOM-PIXELFX.md)）；測試 `test-heroloom-outfits.mjs`、`test-heroloom-monsters.mjs`，檢查 `tools/checks/heroloom-ext-assets.mjs`、`heroloom-scene-assets.mjs` |
| `src/paperdoll.js` / `paperdoll-hero.js` / `paperdoll-lab.js` | 分層角色＋裝備動畫引擎（DV2 系統移植）。**2026-11-13 起英雄預設用紙娃娃繪製**（`?doll=0/off/no/sheet/none` 回烘好的 sheet，`?doll=hero[:cls]` 指定職業，`?doll=1` 實驗面板）；真美術包 `assets/paperdoll-classes/`（六職業 × 身體/頭/武器 + 六格裝備 helm/chest/belt/legs/boots/gloves，由 `pipeline/scripts/pixelfx/character/doll-pack.mjs` 從 pixelfx rig 產生）；規格 [PAPERDOLL.md](PAPERDOLL.md) + [PAPERDOLL-EQUIPMENT-6.md](PAPERDOLL-EQUIPMENT-6.md)，測試 `test-paperdoll.mjs`（在 `npm test`）與 `tools/checks/doll-classes.mjs`、`doll-default.mjs`、`gear-economy.mjs` |

## 舊版（別改，除非使用者明說）
`src/game.js`、`world.js`、`main.js`、`data.js`、`gl-renderer.js`（原 Three.js 版）；`*.bak` 是備份。

## 建置、測試、部署
- `npm test`＝`test-pixel-game.mjs` + `test-overworld.mjs` + `test-landscape.mjs` + `test-village-nav.mjs` + `test-paperdoll.mjs` + `test-heroloom.mjs` + `test-heroloom-outfits.mjs` + `test-heroloom-monsters.mjs`
- `npm run verify` / `verify:quick`（`tools/verify.mjs`）一鍵驗收
- `npm run build`＝esbuild 打成單檔 `暮影村.html`；push main＝Pages 部署
- PWA：`pwa/sw.js`（網路優先、只存成功回應）；改快取要同步升版號
- Pixel UI 在分支 `exp/pixel-ui`：`?ui=canvas`（預設）走 `src/pixel-ui-canvas/` 的 canvas 圖層，`?ui=dom` 回舊的 DOM 介面；驗收用 `npm run verify:canvas-ui`，規格見 `docs/pixel-ui/eht-style-spec.md`（main 還沒合併）

## 常見改動從哪下手
- 改建築/資料 → `pixel-data.js`；改版面 → `village-grid.js`
- 改戰鬥/AI/存檔 → `pixel-game.js`（高風險，依 CLAUDE.md 派 `game-logic-opus`）
- 改畫面 → `pixel-world.js`（渲染）或 `pixel-ui.js`（介面）
- 改地圖/狩獵區 → `overworld.js`，改完要看存檔遷移（worldRevision）

每個匯出的用途與行號：[API-pi.md](API-pi.md)（`npm run`外的檢查：`node tools/check-api-doc.mjs docs/API-pi.md`、`node tools/check-api-lines.mjs docs/API-pi.md`）。

更詳細的踩雷記錄在 Claude memory 的 mistvale-* 各檔；README.md 有版本沿革。
