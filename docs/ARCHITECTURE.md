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
| `src/overworld.js` | 世界 94×89(2026-11-18 擴張,七區面積各 ×2,`worldRevision` 5)、七個狩獵區、生態域、區域立牌位置 `regionSignSpot`(2026-11-26 環村道路已拿掉;`PERIMETER` 只剩區域幾何、`VILLAGE_LOOP` 只是繞村導航線) |
| `src/concept-ground.js` / `concept-props.js` | 概念圖對齊的地面與道具 |
| `src/lore.js` / `hero-chatter.js` | 魔物名稱與設定、獵人對話 |
| `src/real-clock.js` | 2026-11-26 拿掉遊戲內白天黑夜後的真實時間小工具：`isRealNight`（本機 19:00–05:59，只給台詞／環境音／標題夜景）、`agoText`／`waitText`／`playTimeText`（畫面文字）。遊戲規則的真實時間在 `pixel-game.js`：`REALTIME`（pixel-data）、`createGame(save, { now })` 可注入時鐘、`game.realNow()`／`setClock`；`state.day` 已不存在 |
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
- 瀏覽器檢查（沒有 playwright 時）：`node tools/cdp-run.mjs <劇本.json>` 直接驅動本機 Chrome；範例 `tools/checks/building-upgrade.cdp.json`（建築面板 6 種情境）
- 平衡定案值與目標：[BALANCE.md](BALANCE.md)（改數值前後都要跑 10 個 seed）
- 平衡／節奏：`node tools/progression-sim.mjs [分鐘=80｜2h｜14d]` 用貪婪玩家策略無頭跑一局，每 4 分鐘（240 遊戲秒，舊的「一天」）一行（金幣、各材料、獵人等級、死亡、委託章節、建築等級、地下城層數），結尾列死因與各魔物擊倒數；`node tools/dungeon-balance.mjs` 看地下城層數
- 經濟（2026-11-16）：交易所行商 `merchantQuote/buyMaterials`（`MERCHANT` 在 pixel-data，收購價 6 倍、交易所 Lv.5 降到 4 倍；建設卡「補料升級」）；服務售價 `servicePrice` 隨設施等級 +25%/級；建築升級成本每級 ×`UPGRADE_GROWTH`（1.75）；委託 22 章（`QUEST_REVISION` 3，`migrateQuest` 轉版本 1／2 舊存檔；2026-11-18 在 Lv.65 與轉世之間補 4 章後期委託）；地下城自動續戰有體力/勝算檢查（`dgForecast`），出發層會降到打得過的層（`dgSafeStart`），已打過的樓層獎勵減少（`DG_REPEAT`）；裝備 Ⅰ–Ⅴ 階（`GEAR_TIERS`；2026-11-17 起是鐵匠鋪升級件物品實例上的 `grade`，數值/名稱/售價/分解一律經過 `gearItemView`；鐵匠鋪等級解鎖）；獵人照周圍威脅提早返村（`shouldRetreat`），返村與出征都走環形道路（`homeRoute`/`ringWaypoints`）
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
