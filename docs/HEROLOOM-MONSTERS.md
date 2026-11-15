# HeroLoom 風格魔物包（實驗）

`?lmob=1` 時，三隻魔物（`wolfman` 灰毛狼人、`mummy` 木乃伊、`moss` 苔蘚巨魔）改畫
`assets/heroloom-monsters/` 的 HeroLoom 風格 sheet；沒有這個參數、或包還沒出貨時，遊戲照舊畫
`assets/monsters3/`。模組是純 JS、不碰 DOM／檔案系統：`src/heroloom-monsters.js`；驗證器：
`tools/checks/heroloom-ext-assets.mjs`；測試：`test-heroloom-monsters.mjs`。

## 1. 出貨格式

```
assets/heroloom-monsters/<id>/sheet.png    1280 x 800 = 8 欄 x 5 列，每格 160 x 160
assets/heroloom-monsters/<id>/meta.json    動作表（見下）
```

未使用的格子留全透明。角色站在格子底部，`footFromBottom: 12`（腳底往上 12 px 是接地點），
`artSize: 100` 是繪製框大小（pixel-world 以 `k = 21/72*scale` 縮放）。

| 列 | 動作 | 格數 | 每格秒數 | 備註 |
| --- | --- | --- | --- | --- |
| 0 | idle | 4 | 0.25 | 循環 |
| 1 | walk | 8 | 0.125（= 8 fps） | 循環，`cycle: 85` 與 monsters3 相同 |
| 2 | attack | 6 | 0.09 | `release: 3`、`impact: 4` |
| 3 | hurt | 3 | 0.1 | 一次 |
| 4 | death | 5 | 0.14 | 一次 |

walk 的 8 fps 對齊 `pipeline/scripts/pixelfx/character/walk.js` 的 `meta.fps`，也讓 walk 填滿
8 欄（最長的一列）。

## 2. meta.json schema

```json
{
  "hero": "wolfman",
  "heroHeight": 72,
  "footFromBottom": 12,
  "artSize": 100,
  "actions": {
    "idle":   { "y": 0,   "cell": 160, "frames": 4, "frameTime": 0.25 },
    "walk":   { "y": 160, "cell": 160, "frames": 8, "frameTime": 0.125, "cycle": 85 },
    "attack": { "y": 320, "cell": 160, "frames": 6, "frameTime": 0.09, "release": 3, "impact": 4 },
    "hurt":   { "y": 480, "cell": 160, "frames": 3, "frameTime": 0.1 },
    "death":  { "y": 640, "cell": 160, "frames": 5, "frameTime": 0.14 }
  }
}
```

- 這是 `assets/monsters3/*.json` 的同一種形狀，所以 `pixel-world.js` 的
  `drawMonsterSheet`／`monsterSheetPose`／`monsterAttack` 不用改就能讀。
- 硬性規則：`cell` 必須 160、`y` 必須 `row * 160`、每列 `frames`/`frameTime` 如上表、
  attack 必須有 `release`/`impact`；`heroHeight` 72、`footFromBottom` 12、`artSize` 100。
  `artSize` 在舊的 monsters3 meta 常常沒有，這裡**必須有**，否則 pixel-world 算 hitbox 會 NaN。
- 可以只寫 `actions` 裡有把握的欄位：`loomMonsterMeta()` 會用表的預設值補齊。

## 3. 模組 API（`src/heroloom-monsters.js`）

| 匯出 | 行為 |
| --- | --- |
| `HEROLOOM_MONSTERS_BASE()` | `PIXEL_ASSETS.heroloomMonstersBase`，否則 `'media/heroloom-monsters/'` |
| `monsterSheetUrl(id)` | `<base><id>/sheet.png` |
| `LOOM_MONSTERS` | `{wolfman,mummy,moss}`，每項有 zh-TW `label`（同 `src/lore.js` 的 `MONSTER_NAME`） |
| `validateMonsterSheet(meta, pngHeader)` | 回 `{ok, errors}`；檢查幾何、動作表、fractions、PNG 簽章與 IHDR 1280x800 |
| `canonicalMonsterMeta(id)` | 不需要檔案就能拿到合法 meta（測試／預設值來源） |
| `loomMonsterMeta(id)` | 給 MON_SHEET 用的 meta（memoized）；有 `PIXEL_ASSETS.loomMonsters[id].meta` 時以包為準，並補 `idle/walk/attack` 的 `Down`/`Up` 別名。**刻意不補 `Left`**：`src/dir4.js` 的 `leftRow()` 只在沒有 `<act>Left` 時才 mirror，補了反而會讓側面圖面向錯。改 `PIXEL_ASSETS` 後呼叫 `clearLoomMonsterMetaCache()` |
| `monsterAf(id, action)` | tickRate 20 的累積結束 tick 表，例：`idle [5,10,15,20]`、`walk [2.5,…,20]`、`attack [1.8,…,10.8]`、`hurt [2,4,6]`、`death [2.8,…,14]`；依 meta 的 `frameTime` 算，保留小數 |
| `monsterFrameIndex(af, tick)` | 與 `heroloomFrameIndex` 完全相同的 floor／wrap／clamp 規則 |
| `monsterActionKey(dv2Key)` | 把 `attackDownLeft`、`walkUp`、`hurtDown`、`attack.bow`、`strike`… 對到 5 列之一；永不回 null（未知 → `idle`） |
| `pngHeaderInfo(bytesOrObj)` | 依序讀 PNG 簽章／IHDR（含 tRNS），回 `{ok,width,height,colorType,alpha}` |

## 4. 引擎整合契約（Lead 已套用）

- `src/pixel-world.js:6` import 本模組；`:542-554`：`?lmob=1` 時 `MON_SHEET` 先查
  `LOOM_MONSTERS`，用 `ensureLoomMonsterSheet()` 從 `monsterSheetUrl(id)` 載圖，onload 後
  `{img, meta: loomMonsterMeta(id)}`；包沒載好時回 `undefined`，`pendingMon` 讓那一幀先不畫，
  載好後 `pixel-assets-ready` 重畫。`globalThis.__mistvaleLoomMonsters()` 可看開關與載入狀態。
- `build.mjs:155-175`：把整個 `assets/heroloom-monsters/` 複製到 `media/heroloom-monsters/`，
  再把每個 `<id>/meta.json` 內嵌成 `window.PIXEL_ASSETS.loomMonsters`，並設
  `heroloomMonstersBase="media/heroloom-monsters/"`；目錄不存在時完全不出 key，遊戲照舊。
- 替代接法（若之後想拿掉獨立 map）：在 `ensureMonsterSheet()` 先查
  `PIXEL_ASSETS.loomMonsters[id]`、meta 用 `loomMonsterMeta(id)`，`MON_SHEET` 本體不用動。
  目前採用的是前者（`?lmob=1` 開關，兩包可並存 A/B）。

## 5. art-gen 產物對應

`output/heroloom-ext/monsters/ref/<id>-ref-4x.png` 是參考圖（不是出貨格式）；正式 sheet 落地時：

1. 把每隻的 5 列 × 8 欄圖輸出成 `1280x800`、透明底、格線對齊的 PNG，放到
   `assets/heroloom-monsters/<id>/sheet.png`。
2. 寫 `<id>/meta.json`（可直接複製上面的 schema，只改 `hero`）。
3. 跑 `node tools/checks/heroloom-ext-assets.mjs`；它會解 PNG、逐格算動作列的可視像素，
   空幀／錯位／比例不符都會 FAIL。

## 6. 驗證

```bash
node --check src/heroloom-monsters.js
node test-heroloom-monsters.mjs
node tools/checks/heroloom-ext-assets.mjs            # 預設 worktree 根目錄
node tools/checks/heroloom-ext-assets.mjs <project-root>
node tools/checks/heroloom-ext-assets.mjs <dir>/heroloom-monsters
```

包目錄不存在時印 `SKIP` 但仍驗模組契約（所以 art 還沒到也能當早期檢查）；包目錄存在時，
`wolfman/mummy/moss` 三隻缺一就 FAIL。`npm test` 已包含 `node test-heroloom-monsters.mjs`。

## 7. 已知限制

- **沒有 8 方向列**：只有一張側面圖，所有面向重複使用；左右靠 mirror（`leftRow`），
  上下用同一列。`Down`/`Up` 別名存在只是為了讓 `DIR_ACT` 查得到 key，畫面不會真的多出方向。
- 動作固定 5 種、格子固定 160 px，不能和 `assets/monsters3/` 的 120 px 包混用。
- attack 的 `release`/`impact` 固定 3/4；要不同節奏得改 `HEROLOOM_MONSTER_ACTIONS`、本文件、
  checker 與測試四處。
- 圖裡不要自帶地面陰影／背景，pixel-world 會自己畫接觸陰影；角色請對齊 `footFromBottom`。
- 目前只有 3 隻魔物；`treant`（boss）仍走 monsters3。
