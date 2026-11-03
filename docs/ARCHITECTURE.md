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

## 舊版（別改，除非使用者明說）
`src/game.js`、`world.js`、`main.js`、`data.js`、`gl-renderer.js`（原 Three.js 版）；`*.bak` 是備份。

## 建置、測試、部署
- `npm test`＝`test-pixel-game.mjs` + `test-overworld.mjs` + `test-landscape.mjs` + `test-village-nav.mjs`
- `npm run verify` / `verify:quick`（`tools/verify.mjs`）一鍵驗收，交給 pi 跑
- `npm run build`＝esbuild 打成單檔 `暮影村.html`；push main＝Pages 部署
- PWA：`pwa/sw.js`（網路優先、只存成功回應）；改快取要同步升版號
- 派工工具：`tools/classify.mjs`、`tools/pi-dispatch.mjs`；任務卡在 `docs/pi-tasks/`

## 常見改動從哪下手
- 改建築/資料 → `pixel-data.js`；改版面 → `village-grid.js`
- 改戰鬥/AI/存檔 → `pixel-game.js`（高風險，依 CLAUDE.md 派 `game-logic-opus`）
- 改畫面 → `pixel-world.js`（渲染）或 `pixel-ui.js`（介面）
- 改地圖/狩獵區 → `overworld.js`，改完要看存檔遷移（worldRevision）

每個匯出的用途與行號：[API-pi.md](API-pi.md)（`npm run`外的檢查：`node tools/check-api-doc.mjs docs/API-pi.md`、`node tools/check-api-lines.mjs docs/API-pi.md`）。

更詳細的踩雷記錄在 Claude memory 的 mistvale-* 各檔；README.md 有版本沿革。
