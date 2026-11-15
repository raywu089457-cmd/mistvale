# 紙娃娃引擎（分層角色 + 裝備動畫）

`src/paperdoll.js` 是暮影村的分層角色動畫引擎：角色 = 依序疊起來的圖層（身體、盔甲、頭、頭盔、武器、盾、特效…），
每個「動作 × 方向」一列資料，逐 slot 指定每層用哪個格、位移多少、畫的先後；武器繞握把旋轉。
系統（不是素材）移植自 DV2 紙娃娃（Kairosoft《冒險村物語 2》的反組譯規格），細節與差異見 §7。

- 第 1 期：引擎 + 資料格式 + 暮影村自己的佔位圖 + `?doll=1` 實驗面板。
- 第 2 期（2026-11-13）：接進遊戲英雄繪製（§13）＋ 8 方向列（§5）。
- **美術：2026-11-13 起遊戲用 DV2 格式的暮影村原創包 `assets/paperdoll-dv2/`（規格 [sprites/DV2_FORMAT_SPEC.md](../sprites/DV2_FORMAT_SPEC.md)，§16），不再讀 pixelfx 包 `assets/paperdoll-classes/`。**
- **現在（2026-11-13 起）紙娃娃是預設的英雄渲染器**（§14 真美術包、§15 全面覆蓋）。逃生口：`?doll=off`（也吃 `0/no/sheet/none`）回到烘好的 hero sheet。
  頭像（`drawPortrait`、UI 縮圖）、倒地/跪倒、`?poselab` 仍用 sheet。

## 0. 版權硬規則

DV2 kit（`C:\Users\ray\Desktop\Claude code\dv2-lab\kit\`）的 atlas PNG 與 `data.js` 是 Kairosoft 的版權素材；暮影村公開部署。

- **不准**把 kit 的任何 PNG / `data.js` 複製、轉檔後存檔、或用相對路徑引用到 repo、build、或任何會被送出去的地方。
- 唯一允許的用法：`test-paperdoll.mjs` 在測試時從**外部絕對路徑**把 kit 讀進記憶體做對照，kit 不在就印一行後跳過。
- `tools/paperdoll-dv2-adapter.mjs` 只轉換記憶體裡的物件，不讀不寫檔；不要拿它產生資料檔。
- `assets/paperdoll/` 的圖全部由 `pipeline/scripts/build_paperdoll_placeholder.py` 用 Pillow 畫出來，跟 kit 無關。

## 1. 檔案

| 檔案 | 內容 |
|---|---|
| `src/paperdoll.js` | 引擎。純邏輯（node 可測）：`getSlot`、`at`、`spriteOf`、`computeParts`、`effectiveOrder`、`resolveAction`、`actionTiming`、`setAction`、`advance`、`dir8to4`、`lookFromHunter`、`weaponCorner`、`partCorners`；騎乘 `rideActionFor`、`rideDepth`、`mountMotion`（§20）；怪物 `computeMonsterParts`（§21）；canvas：`drawParts` |
| `src/paperdoll-hero.js` | 遊戲接線（§13）：`parseDollSpec`、`dollDirName`、`dollActionTick`（遊戲時序 → 紙娃娃 tick）、`advanceNoSkip`、`createDollHero`（載資料、合成格子圖、LRU 快取） |
| `src/pixel-world.js` | `drawDollHero` 分支（在 `drawHunterSheet` 呼叫 `drawSheetHero` 的地方）、`globalThis.__mistvaleDoll` hook |
| `pipeline/scripts/check/check_facing.mjs` / `check_anim.mjs` | 環境變數 `DOLL=hero` 時用 hook 打開紙娃娃再量 |
| `src/paperdoll-lab.js` | `?doll=1` 實驗面板（`mountPaperdollLab`），由 `src/pixel-ui.js` 在 `?tmw` 掛勾旁邊呼叫 |
| `assets/paperdoll/paperdoll.json` + `*.png` | 佔位資料與圖（產生器輸出，不要手改） |
| `pipeline/scripts/build_paperdoll_placeholder.py` | 佔位圖產生器（`--check` = 重算後比對檔案是否一致） |
| `tools/paperdoll-dv2-adapter.mjs` | DV2 形狀物件 → 本格式（只給測試用） |
| `test-paperdoll.mjs` | 單元測試 + DV2 對照測試（在 `npm test` 裡） |
| `build.mjs` | 把 `assets/paperdoll/` 原樣複製到 `media/paperdoll/`，HTML 只多 `PIXEL_ASSETS.paperdollBase` 一個字串；只有實驗面板會去載 |

## 2. 資料格式（`paperdoll.json`，`format: "mistvale-paperdoll"`，`version: 1`）

```jsonc
{
  "format": "mistvale-paperdoll", "version": 1,
  "tickRate": 20,                              // tick / 秒
  "meta": { "heroHeight": 72, "heroHeights": { "archer": 76 /* … */ }, "footFromBottom": 8, "cell": 100,
            "effectDirs": 4, "defaultClass": "berserker", "placeholder": true },   // heroHeights：遊戲內縮放用的站高（§13）
  "weaponOrigin": { "dx": [0,0,0,0], "dy": 0 },// 武器/特效的原點修正（逐方向 dx、共用 dy）；省略 = DV2 的 {dx:[0,0,1,1],dy:3}
  "layers": {                                  // 圖層名 → 定義
    "body":   { "kind": "slot" },
    "armor":  { "kind": "slot", "follows": "body", "attach": { "after": "body" } },
    "helmet": { "kind": "dir",  "follows": "head", "attach": { "after": "head" } },
    "weapon": { "kind": "weapon" }, "effect": { "kind": "effect" } /* … */
  },
  "images":  { "<圖片鍵>": "檔名.png" },        // 相對於 json 所在資料夾
  "skins":   { "<圖層>": { "<外觀>": { "img": "<圖片鍵>", "x": 0, "y": 0 } } },  // 這個外觀的表在圖裡的原點
  "sebs":    { "<seb 鍵>": { "max": 4, "frames": { "0": [u,v,w,h,tx,ty,ru,rv] } } },
  "weapons": { "<武器 id>": { "skin": "<weapon 外觀>", "handle": [40,60], "type": "sword", "seb": null, "hidden": false } },
  "effects": { "<特效 type>": { "seb": "<seb 鍵>", "skin": "<effect 外觀>" } },
  "actions": {
    "<動作鍵>": {                              // 例：idle、walk、attack、attack.bow、skill、hurt
      "af": [3,6,9,15],                         // 累計結束 tick（不是每格長度）
      "loop": false, "impactSlot": 2, "releaseSlot": 1,
      "headMirror": false, "headSeb": null,     // DV2 的 SPPROCTYPE 頭部翻轉 / 強制表情
      "rows": [ <上>, <右>, <下>, <左>, <右上>, <右下>, <左下>, <左上> ]   // 後 4 項（斜向）可省略或 null → 退回
    }
  },
  "aliases": { "stand": "idle", "cast": "skill" }
}
```

**row**（一個動作 × 一個方向）：

```jsonc
{
  "parts": {
    "body":   { "seb": "pose/attack/right", "off": [[0,0]] },        // slot/dir 層：seb + 逐 slot 位移
    "head":   { "seb": "head/std",          "off": [[-2,0],[0,0],[2,2]] },
    "weapon": { "seb": ["weapon/std"], "sebF": [0,0,0,0], "deg": [-45,30,120,90],
                "inv": [0,0,0,0], "show": [1,1,1,1], "off": [[-6,-52],[6,-54],[18,-34],[16,-30]] },
    "effect": { "act": [0,0,1,1], "type": ["slash"], "sebF": [0,0,0,1], "off": [[28,-32]] }
  },
  "order": [ ["weapon","body","armor","shield","head","helmet","hand","effect"],   // slot 0
             ["body","armor","shield","head","helmet","weapon","hand","effect"] ]  // slot 1 以後（重複最後一個）
}
```

- 所有逐 slot 陣列都用 DV2 的 clamp 規則（`at`）：超出長度就重複最後一項，空陣列 = 預設值（位移 `[0,0]`、數字 0）。
- `order` 可以是一個陣列（整列共用）或陣列的陣列（逐 slot）。`null` = 這個位置不畫（DV2 的 `-1`）。
- row 沒列到的層沿 `follows` 往上找 seb 與位移（armor / hand / shield → body，helmet → head）。
- 穿了某層、但 order 沒列到它：圖層定義有 `attach` 就插在錨點的前/後；沒有 attach 就不畫。
- sprite `[u,v,w,h,tx,ty,ru,rv]`：`u,v` 相對於 skin 原點、`tx,ty` 相對於該層位置（腳底座標）、`ru/rv` 水平/垂直翻轉。
  圖集來源 = `(skin.x + u, skin.y + v)`。

## 3. 圖層

| 圖層 | kind | 幀 | 位置 | 對應 Layer（SPRITE_PRODUCTION_PIPELINE §4） | DV2 部件 |
|---|---|---|---|---|---|
| `cape` | slot | slot | 跟 body | 07 Cape / Accessories（第 1 期沒有圖） | — |
| `body` | slot | slot | `off[slot]` | 01 Base Body（腿、軀幹、不拿武器的手臂） | 0 BODY |
| `armor` | slot | slot | 跟 body | 03 Armor | —（DV2 不上身） |
| `shield` | slot | slot | 跟 body | 09 Shield | — |
| `hand` | slot | slot | 跟 body | 拿武器的手臂（蓋在盔甲與武器握把上；05 Gloves 之後疊這層） | 1 HAND |
| `head` | dir | 方向 | `off[slot]` | 02 Hair / Face | 3 HEAD |
| `helmet` | dir | 方向 | 跟 head | 04 Helmet | 2 HAT |
| `weapon` | weapon | `sebF*2+inv` | 武器原點 + `off[slot]`，繞握把旋轉 | 08 Weapon | 4 WEAPON |
| `effect` | effect | `sebF*4+dir` | 武器原點 + `off[slot]`，不旋轉 | 10 VFX | 5 EFFECT |

`kind` 決定行為，名稱只是鍵：要加新層（例如 05 Gloves）就在 `layers` 加一筆 `{kind:"slot", follows:"hand", attach:{after:"hand"}}`。

## 4. 時間

- 全域 tick 20 / 秒（`tickRate`）。`getSlot(af, tick)`：`rem = tick mod af[last]`（負數也正確），回第一個 `rem < af[i]` 的 `i`。
  `af = [4,8,12,16]` ⇒ tick 0..3 → slot 0、4..7 → slot 1…；`[2,4,6,12]` ⇒ 0,1 → 0、2,3 → 1、4,5 → 2、6..11 → 3。
- state 有兩個 tick：`tick` = 動作 tick（決定 slot，**換動作歸零**）；`globalTick` = 全域 tick（**不歸零**，只用在 `headMirror`）。
  `setAction(state, action)` 只在動作真的改變時把 `tick` 歸零（DV2 `ChangeSeb`：`sebCnt_ = 0`、`animeIndex_` 不動）；`advance(state, n)` 兩個一起加。
- 出招計時（對應 `sprites/ANIMATION_SPEC.md`「出招計時合約」）：每個動作可寫 `releaseSlot`（出手 slot）與 `impactSlot`（命中 slot）。
  `actionTiming(data, name, weaponType)` 回傳 `ticks / seconds`（總長）、`impactTick = af[impactSlot-1]`（該 slot 開始的 tick）、`impactSec`。
  沒寫 `impactSlot` 但有 `releaseSlot` → 命中 = `release + 1`（與現行 `impact` 預設一致）。
  **HIT_STOP（70 ms）照合約由執行期加在命中格開頭，不寫進 af**；要調手感改 `af` / `impactSlot`，不要在程式縮放時間。

## 5. 方向與動作名

**動畫只有 4 方向**（docs/DV2-ADOPTION-PLAN.md Phase 2，與 DV2 1:1）；**移動可以斜走**（2026-11-15 起，撤回 Phase 2 的 4 軸移動）。
動畫方向 = 畫面向量落在哪個 90° 象限（規則在 `src/dir4.js`，見 §19「移動與動畫方向」）。

- 方向索引：`0 上（背面）、1 右（側面）、2 下（正面）、3 左（側面鏡像）`（與 DV2 相同）。`DIR_NAMES = ['up','right','down','left']`、`MIRROR = [1,0,3,2]`。
- `rows` 是 4 項（DV2 包）；舊的 8 項包（`assets/paperdoll/` 佔位包）只用前 4 項。`computeParts` 的 `state.dir` 給 0..3、方向名稱
  （`up/right/down/left`、`side`（依 `facing` 分左右）、`sideLeft`），經 `dirIndex` 一律變成 0..3。
- **遷移**：舊存檔/舊呼叫端的 0..7 與舊斜向名經 `migrateDir`：`0→上、1→右、2→下、3→左、4→上、5→下、6→下、7→左`（`DIR_MIGRATE_8TO4`）。
  遊戲存檔目前沒有任何欄位存方向索引（獵人的 `facingX/Z` 是目標座標、`pilot.faceX/Z` 是向量），所以遷移掛在引擎入口 `dirIndex`。
- `pickRow(rows, d)`：這個方向有列就用；沒有（null）才退回右、再退回下。沒有斜向退回。回傳陣列帶 `.dir`（實際用的方向）與 `.wantDir`。
- dir 層（頭/頭盔）的幀 = 方向；特效幀 = `sebF * effectDirs + 方向`（DV2 包 `effectDirs = 4`）；`weaponOrigin.dx[方向]`。
- `dir8to4(d, facing)`：**deprecated**（舊 pixel-world DIR8 名稱/索引 → 4 方向，行為不變），新程式用 `dirIndex`。
- 動作名：`resolveAction(data, name, weaponType)` 依序試 完全同名 → 去掉方向字尾（`attackDownLeft → attack`）→
  `<動作>.<武器型別>`（`attack.bow`）→ `<動作>` → `aliases` → `idle` → 第一個動作。所以遊戲可以直接丟 `attackDown`、`walkUpRight`。
- 頭部翻轉（DV2 `SPPROCTYPE_HEAD_2F_INVERSION`）：動作 `headMirror: true` 且 `globalTick >= 1` 時，頭/頭盔的幀用 `MIRROR = [1,0,3,2]` 重映射。

## 6. 渲染數學

座標原點 = 腳底 `(0,0)`，單位 = 美術 px，整數、不插值（`imageSmoothingEnabled = false`）。

```
slot  = getSlot(action.af, tick)
slot/dir 層：pos = off[slot]；dest = pos + (tx,ty)
武器原點：(ox', oy') = (weaponOrigin.dx[dir], weaponOrigin.dy)
武器：  略過，若 沒有武器 / hideWeapon / weapon.hidden / show[slot] == 0
        seb   = weapon.seb ?? row.weapon.seb[slot]        （DV2 大型武器 = 固定 seb）
        frame = sebF[slot]*2 + (inv[slot] == 1)
        base  = (ox', oy') + off[slot]
        精靈自身左上角 = base + R(deg)·((tx,ty) − handle)    R = 順時針（canvas y 向下）：(x cos − y sin, x sin + y cos)
特效：  略過，若 act[slot] == 0；frame = sebF[slot]*4 + dir；dest = (ox',oy') + off[slot] + (tx,ty)；不旋轉
```

`inv`（水平翻轉）發生在精靈自己的框裡，所以**握把 x 要在精靈正中間**（DV2 的 handle `(20,29)` 在 40 寬的中線；佔位武器 80 寬、握把 x = 40），
翻轉後握把才不會跑掉。`weaponCorner(rec)` / `partCorners(rec)` 用同一條公式算出角落（測試與除錯框線用）。

**可驗算例**（測試裡用合成資料重現）：handle `(20,29)`、trans `(0,0)`、DV2 原點修正。
- 「row 10」武器持ち歩き、朝下、slot 0：`off (-9,-7)`、deg 0 ⇒ 左上角相對腳底 **(−28,−33)**；相對 `(ox',oy') = (1,3)` 是 **(−29,−36)**。
  （SPEC §8.5 寫「相對腳底 (−29,−36)」，但同一段的算式與 CHECKLIST E2 都是 `(OX−28, OY−33)`；(−29,−36) 其實是相對 `(ox',oy')`。兩個都測。）
- 「row 80」剣_縦振り、朝上、slot 1：`off (1,−11)`、`sebF 2`、`inv 1` ⇒ frame 5、deg 90 ⇒ 左上角 **(30,−28)**。

## 7. 與 DV2 的差異（以及為什麼）

| 差異 | DV2 | 暮影村 | 原因 |
|---|---|---|---|
| 盔甲/頭盔上身 | §7.4 不上身 | `armor`（跟 body 格）、`helmet`（跟 head 格）都畫 | 暮影村裝備要看得到（EQUIPMENT_SPEC Layer 03/04） |
| 圖層 | 固定 6 個數字 id | 具名圖層 + `kind`，可加 cape / shield / gloves… | 對應 Layer 01–10；新層不必改程式 |
| `follows` / `attach` | 無 | 沒列到的層借用別層的 seb/位移；沒列在 order 的穿戴層自動插到錨點旁 | 加一件裝備不必改每一列資料 |
| 繪製順序 | 一列一個 `food_drawOrder_` | 一個陣列或逐 slot 陣列，`null` = 不畫 | 揮砍時武器要在某些 slot 換到身體後面 |
| seb / 外觀定址 | bundle + 數字 id、`imgIds`、`sheets` | 字串 seb 鍵；`skins[圖層][外觀] = {img,x,y}` | 一張圖可放多個外觀（佔位圖 6 張就夠）；DV2 的 sheet 原點 − trim 直接變成 skin 的 x,y |
| 武器原點修正 | 寫死 `ox+1`（下/左）、`oy+3` | `weaponOrigin` 資料化，省略時用 DV2 值 | 那是 DV2 美術的對齊常數；佔位圖握把直接畫在手上，用 0 |
| 大型武器 / 拳套 | `spProc & 4` → seb 9、`spProc & 2` → 不畫 | 武器的 `seb` 覆寫、`hidden` | 同一機制，不綁 DV2 的位元旗標 |
| 表情 | gameFlag 7 個位元 + set 12 固定笑臉 | `state.face`（seb 鍵）+ 動作的 `headSeb` | 同一機制，資料化 |
| 頭部翻轉條件 | 參考渲染器用 `s.tick >= 1` | `globalTick >= 1`（沒給就用 `tick`） | SPEC 寫條件是 `animeIndex >= 1`，而 §9 說 `animeIndex_` 是不歸零的全域計數；暮影村把兩個 tick 分開，所以用全域那個。對照測試把兩個 tick 設成一樣，結果與參考實作一致 |
| 動作 | 32 組日文名 set id | 暮影村動作名 + `<動作>.<武器型別>` 變體 + aliases + 方向字尾容錯 | 遊戲用 `attackDown` 這種名字；弓/杖的出招不是揮砍 |
| 出招計時 | 無 | `impactSlot` / `releaseSlot` + `actionTiming` | 暮影村的出招計時合約 |
| 方向 | 4 | 4（2026-11-13 起；曾經是 8 方向，已改回） | 與 DV2 1:1；完整對齊表見 [DV2-PARITY.md](DV2-PARITY.md) |
| 座標 | `origin` 在渲染器裡（遊戲像素） | `computeParts` 一律相對腳底；`drawParts(ctx, parts, images, origin, scale)` 才放大 | 純邏輯不碰 canvas，node 可測 |
| 怪物 | 單層紙娃娃（§M） | 沒移植 | 暮影村魔物用 `assets/monsters3` 的 sheet |

對照測試證明：用 adapter 把 DV2 資料轉成本格式後，`computeParts` 與 kit 的 `dv2-paperdoll.js` 逐筆相同（順序、frame、sprite、位置、角度、樞軸、圖集來源）。

## 8. 獵人 → 外觀（`lookFromHunter(h, data?)`）

| 職業 | 武器（型別） | 盔甲（`equipment.armor`） | 頭盔 | 盾 |
|---|---|---|---|---|
| archer | bow（bow） | leather | — | — |
| sorcerer | staff（staff） | mantle | — | — |
| priest | holystaff（staff） | mantle | — | — |
| paladin | sword（sword） | plate | helm（穿甲時） | round（一直有） |
| berserker | axe（axe） | leather | — | — |
| assassin | dagger（dagger） | leather | — | — |

- `equipment.weapon`（精良武器）→ `<武器>_fine`；沒有 → 基本武器（職業武器一直在手上）。
- `weaponLevel` 原樣帶出（只有精良武器時才非 0），第 1 期渲染不用。
- 給 `data` 時會檢查外觀存在，缺的層變 `null`（不畫），未知職業退回 `meta.defaultClass`。
- 這張表是佔位用的配對，不是角色設計；設計權威仍是 `sprites/SPRITE_VISUAL_BIBLE.md`。

## 9. 新增一件裝備

1. **決定圖層**：盔甲類放 `armor`、頭盔 `helmet`、盾 `shield`、披風 `cape`；新部位就在 `layers` 加一筆（`kind` + `follows` + `attach`）。
2. **畫表**：slot 層的表要和 body 同一個格子版面（同欄 = 同一個 (動作, slot)，同列 = 同一個視角，腳底在格內 (50,92)）；
   dir 層和 head 一樣 3 格（背/側/正）。武器：每欄一個 `sebF`，握把 x 在正中間。
3. **登記**：`images` 加圖、`skins[圖層][新外觀] = {img, x, y}`；武器再加 `weapons[id] = {skin, handle, type}`。
4. **接到獵人**：改 `CLASS_KIT`（或之後的裝備表）讓 `lookFromHunter` 回傳新外觀名。
5. **驗證**：`node test-paperdoll.mjs`（每職業 × 動作 × 方向 × tick 都要畫得出 body/head/hand/weapon、skin 都存在）、
   `?doll=1` 開 debug 看框線與樞軸、`npm run build`。
佔位圖改 `build_paperdoll_placeholder.py` 後重跑（`--check` 可確認檔案與產生器一致）。

## 10. 佔位圖與實驗面板

- 尺寸跟英雄 sheet 一致：格 100、腳底離格底 8、站高約 72（`meta.heroHeight`）。邏輯 50×50 畫完 ×2 最近鄰放大。
- 8 方向：`idle`、`walk` 有 8 列（3/4 視角 `frontQ`/`backQ`，左斜 = 右斜鏡像），其他動作只有 4 列 → 斜向走退回（兩條路都有測）。
- 站高：產生器用跟 sheet 一樣的量法（待機格不透明最高點 → 腳底線，含頭飾不含武器）量每職業站高寫進 `meta.heroHeights`
  （archer 76、sorcerer 90（尖帽）、priest 78、paladin 76、berserker 80、assassin 78），遊戲依此縮放到 sheet 英雄的同一螢幕高度。
- 動作：`idle`(2) `walk`(4) `attack`(4，揮砍：蓄力 −45° → 30° → 命中 120° → 收 90°，命中 slot 2 有斬擊特效)
  `attack.bow`(4，拉弓 sebF 1) `attack.staff`(4) `skill`(4，舉起 + 特效) `hurt`(2)。左 = 右的鏡像（`ru`、角度取負、`inv`）。
- `?doll=1`：浮動面板。上排 6 職業縮圖、大圖 3 倍、動作/職業/8 方向、精良武器/盔甲/隱藏武器/weaponLevel、播放/逐 tick、
  debug（每層外框 + 武器樞軸十字 + 腳底線 + 繪製順序）、下方「全部 slot × 4 方向」對照表。沒有這個參數時完全不掛、不載圖、不 fetch。

## 11. 測試

`node test-paperdoll.mjs`（`npm test` 的最後一段）：getSlot（累計、不等長、負數、超大、小數）、§8.5 兩個算例、
原點修正、逐 slot 順序與 `null`、attach / follows、`show`=0 / hideWeapon / hidden / 武器 seb 覆寫、頭 = 方向、頭部翻轉、表情、
dir8to4、resolveAction、actionTiming、setAction、lookFromHunter（含 CLASSES 全職業）、佔位資料完整性；
8 方向（`dirIndex`、`pickRow` 真列與退回、頭/特效/武器原點的斜向退回、佔位資料 idle/walk 8 列）、遊戲時序對照（`dollActionTick`：近戰命中 slot 恰在 hitAt、停 HIT_STOP、遠程出手 slot 在 atkAt、技能 release、走路格對 slot）、`advanceNoSkip`、`parseDollSpec`/`dollDirName`、每職業站高；
以及 DV2 對照（kit 在外部路徑才跑：32 組動作 × 4 方向 × 每個 slot 邊界 tick × 數把武器 + 表情 + 隱藏武器）。
kit 位置可用環境變數 `DV2_KIT_DIR` 改。

## 12. 第 2 期計畫與狀態

1. **（已完成，旗標後面；§13）接進英雄繪製**：pixel-world.js 現在的路徑是 `sheetPose()` 選 `(act, i)` → `sheetFrame(id, act, i, look)` 取格 → 畫一張烘好的 sheet；
   `heroLook()` 決定換表/調色。第 2 期在同一個位置加一條分支：職業有紙娃娃資料時改用
   `computeParts(data, {action, dir: vdir, facing, tick, globalTick, look: lookFromHunter(h, data)})` + `drawParts`，
   `tick` 由 `sheetPose` 現有的時間（`state.time`、出手時間、HIT_STOP）換算，`impactSlot` 取代 sheet JSON 的 `impact`。
   影子、LOD、cache（`spriteCache` / `variantCell`）要改成以「部件組合」為鍵；先單一職業開旗標試，`check_facing` / `check_anim` 要能讀新路徑。
2. **真正的美術**：走現有管線（`sprites/SPRITE_PRODUCTION_PIPELINE.md`，l0veyou 先、PixelLab 後），
   按 §3 的 Layer 分件出圖、照 §9 的格子版面對齊；`build_hero.py` 增加「輸出分層 sheet + paperdoll.json」的模式，取代佔位產生器。
3. **（已完成）8 方向列**：`rows` 第 5–8 項，`pickRow` 有就用、沒有才退回（§5）。佔位圖只有 idle/walk 畫了斜向。
4. **裝備資料**：`CLASS_KIT` 換成真正的裝備表（EQUIPMENT_SPEC 的 `equipment_*.json`），獵人存檔不必改（仍是 `equipment.weapon/armor` + `weaponLevel`）。

## 13. 遊戲內紙娃娃英雄（第 2 期）

**旗標**（2026-11-13 起**預設開**；見 §14。要關用 `?doll=0`）：
- 網址 `?doll=hero`（= 預設）：資料裡有身體的職業全部畫紙娃娃（CLASSES 6 職業全有；佔位包另有 darkknight）。
- `?doll=hero:paladin` / `?doll=hero:paladin,archer`：只換指定職業。`?doll=1` 仍是實驗面板，不影響英雄。
- `globalThis.__mistvaleDoll('hero' | 'hero:paladin' | null)`：執行中切換（null = 關）；`__mistvaleDoll()` 回目前狀態
  `{on, all, classes, ready, failed, cached}`。檢查腳本：`DOLL=hero node pipeline/scripts/check/check_facing.mjs 40`。
- 資料用 XHR 載（檢查腳本走 `file://`，fetch 不支援），圖片經 `trackImage`。關著時不載、不 fetch、不建快取。

**關著時跟原本一樣**：`drawHunterSheet` 只多 `dollHero.on&&…` 一個短路判斷，`drawSheetHero` 的參數不變；
`createDollHero` 在沒有旗標時不做任何載入。另有 `__mistvaleDoll` hook 與 `paperdoll-hero.js` 模組本身（無頂層副作用）。

**接在哪**：`drawHunterSheet` → `sheetPose()`（照舊決定動作/時間點/方向/朝向）→ `drawDollHero()`：
`dollActionTick` 換成紙娃娃 (動作, tick) → `advanceNoSkip` → `createDollHero().compose()` 合成 176×176 格子圖（腳底在 (88,136)，美術 1:1）
→ 跟 sheet 同一套方式畫：`cast` 影子、`globalAlpha`、受擊閃光 `tinted` + `deferTopVfx`、閃光抖動、點擊框 `{x,y,w,h}`（同公式）。
紙娃娃沒有的動作（倒地/跪倒）回 null → 照畫 sheet。

**時序對照**（不改 pixel-game.js 的戰鬥時序，改的是美術的對時；參考 `sprites/ANIMATION_SPEC.md` 出招計時合約）：

| 遊戲那一刻 | 紙娃娃 |
|---|---|
| 蓄力（`combatPose` windup，`wt / windupLen`） | `[0, releaseSlot)`；同一段蓄力只往前（遠程拉開時 `attackTimer` 會來回，避免 0→1→0 閃） |
| 出手 `atkAt`（近戰扣血、遠程生出箭/法術） | `releaseSlot` 開頭 |
| 近戰打中 = 目標 `hitAt`（`atkAt + ATTACK_FX_DELAY`；拿不到就用 sheet 列的命中時間 `Σ strikeDur[..impact]`） | `impactSlot` 開頭，停 `HIT_STOP` 0.07 s |
| 出手窗結束 `atkAt + Σ strikeDur + HIT_STOP`（= sheetPose 的出招長度） | 最後一個 slot 走完 |
| 技能：`skillAt + SKILLS[職業].release`（預設 0.25） | 技能 `releaseSlot` 開頭；之後到 sheet 技能長度走完 |
| 受擊 `hit / (hurt 格數 × frameTime)` | hurt 線性；**受擊連段**（`hurtChain`）：hurt 還沒播完又被打 → 接著原本那段播，播完後的新一擊才從頭（不然群毆時 2 格的 hurt 會 0→1→0→1 地閃）；閃光每一擊照亮 |
| 走路：sheet 走路格 `i / 8`（sheet 由實際位移推進） | 4 slot（不會滑步，跟 sheet 同步） |
| 待機/歡呼 | idle 連續播（歡呼沒有專屬動作） |

**實測**（`?preview=1&doll=hero` 45 秒，Playwright 逐次 update 取樣）：近戰 18 次有 hitAt 的出手，命中 slot 第一次畫出 = hitAt 之後 13–97 ms
（平均 35 ms；遊戲 update 間隔中位 83 ms、p95 100 ms），**沒有一次早於 hitAt、沒有一次晚超過一個 update**；遠程 29 次，出手 slot 都在 atkAt 那一次 update 畫出；
slot 倒退 0 次。加了受擊連段/蓄力單調後再量一次：近戰 15 次 13–63 ms、遠程 31 次全部在 atkAt、倒退 0。
同樣量法量 sheet 近戰：13–130 ms（有 2 次晚超過一個 update，因為 noSkip）。量測腳本在 session scratch，沒有進 repo。

**縮放與腳底**：`k = HERO_H / meta.heroHeights[職業] × scale`，格子圖腳底對到 sheet 的腳底點（同 `drawSheetHero` 的 `q`）。
佔位圖的描邊比 sheet 多往下 1 美術 px（邏輯 1 px ×2 的描邊），預設縮放下不到 1 螢幕 px。

**方向**：`dollDirName(vdir, facing)` = sheet 的規則（上下看 `vdir`、左右看 `facing`）→ 4 方向名稱（`up/side/down/sideLeft`）→ `pickRow`（§19）。
`__mistvaleFacing()` 的項目多 `doll: {act, slot, dir, want, phase}`，而且 `f` 改成紙娃娃實際畫的左右（上/下列沿用原 facing），
所以 check_facing 量的是紙娃娃畫出來的朝向；check_anim 在 `doll` 存在時用紙娃娃的 slot 當姿勢鍵（走路 `walk1..4`）。

**其他**：手動操控（pilot）的金圈、選取圈、名牌、血條都在 `drawHunterSheet` 外層，照舊。LOD：紙娃娃沒有 @2x，`heroLodUse['1x']` 照計，
`heroLodOn` 的 2x 切換不受影響（只對 sheet）。`partsVisible`（設定頁零件層開關）關 → 紙娃娃不畫武器。快取鍵 = 這一格實際畫到的部件組合
（圖層、外觀、sprite、位置、角度），LRU 上限 192 張（手機 64），淘汰時呼叫 `texRelease`。配件（`heroAcc`，目前不打包）沒有接。

**還沒做**：頭像/UI 縮圖（`drawPortrait`）、倒地動作、歡呼專屬動作、攻擊/技能/受擊的斜向列（目前退回上/下）、真正的美術（§12.2）、
魔物。佔位武器在 0/90° 以外的角度是最近鄰旋轉，邊緣會鋸齒。

## 14. 六部位真美術包與預設開啟（2026-11-13）

第 2 期從「佔位圖 + 旗標」推到「真美術 + 預設開」。這一節記的是實際落點與驗收，施工規格見 [PAPERDOLL-EQUIPMENT-6.md](PAPERDOLL-EQUIPMENT-6.md)。

**美術包（新的，裝在 `assets/paperdoll-classes/`）**
- 來源：pixelfx rig（`pipeline/scripts/pixelfx/character/doll-pack.mjs`），六職業各一張 atlas + 一份 `paperdoll.json`，全部 deterministic（連跑兩次 SHA-256 相同）。
- 圖層：`body / hand / head / weapon` + 六個 `kind:"slot"` 裝備層 `helm / chest / belt / legs / boots / gloves`；`meta.kits[職業]` 與 `meta.gearKits` 記每個職業每格的外觀與材質 ramp。
- 動作/時間點：`idle` 1.40 s、`walk` 1.00 s、`attack` 0.60 s（命中 0.40 s）、`attack.bow` 0.65、`attack.greatsword` 0.65、`attack.sword` 0.60、`attack.staff` 0.70、`attack.dagger` 0.55、`skill` 1.00（命中 0.75）、`hurt` 0.50；八方向都是真 yaw（不是鏡射）。
- 每職業有自己的頭盔輪廓與材質（狂戰士鐵帽+角、聖騎士大頭盔+羽飾、魔法師尖頂布帽、弓箭手皮兜帽、刺客兜帽+面罩、祭司頭紗+金冠圈），細節見 EQUIPMENT-6 §8。

**引擎**
- `src/paperdoll.js`：`export const GEAR_SLOTS`；`lookFromHunter()` 有 `meta.kits` 時走六格（`equipment[slot]`），沒有才退回舊 `CLASS_KIT` 的 weapon/armor 路徑（`test-paperdoll.mjs` 用的是舊 fixture，靠這條）。
- `src/paperdoll-hero.js`：`base()` 優先序 `opts.base → PIXEL_ASSETS.paperdollClassesBase → PIXEL_ASSETS.paperdollBase → media/paperdoll/`。
- `build.mjs`：`assets/paperdoll-classes/*.{png,json}` → `media/paperdoll-classes/`，並設 `window.PIXEL_ASSETS.paperdollClassesBase`。
- `src/pixel-world.js`：紙娃娃段落預設開（`?doll=0/off/no/sheet/none` 關、`?doll=hero[:cls,cls]` 指定）；沒有 `XMLHttpRequest` 的環境（Node 裡的檢查腳本直接 `createWorld`）自動維持 sheet，不丟錯。
- 舊的 `assets/heroes/<class>-armor / -weapon / -weapon-fine` 零件表只服務 `?doll=0` 的 sheet 路徑；`heroLook()` 改成「六格任一有穿就算有護甲」，`-armor` 全身表只在胸甲（或舊存檔 `armor:true`）時換。

**玩法（六格）**
- `src/pixel-data.js`：`GEAR_SLOTS` / `EQUIP_SLOTS`，`RECIPES` 七條（武器 + 六件防具，`type` = 格位名，`gearStock` 照舊）。
- `src/pixel-game.js`：`equipment` 七格、六件 hp/def 加總、存檔 version 2→3 且接受 2/3（舊存檔 `armor:true` → 六格全 true、強化等級不掉）、鐵匠鋪自動購買與鍛造都走同一份 `RECIPES`、強化仍只限武器。
- UI：`src/pixel-ui.js` 鍛造卡／製作頁七列，`src/z2a-hunter.js` 裝備環七格 + 裝備頁六件防具列，`src/ui-hv.css` 環的七格定位（含手機窄版）。

**實驗面板（`?doll=1`）**：現在打開的是六部位真美術包 —— 六個部位勾選框（頭/胸/腰/腿/靴/手）、每武器動作列、八方向、資訊面板（tick / af / release/impact slot / order / pivot）；標題會標「六部位裝備（六職業）」。

**驗收**
- `node pipeline/scripts/pixelfx/character/doll-pack-check.mjs` exit 0（六件 mask 獨立、union 相等、每格 ≤16 色、每職業材質互異、武器單一連通塊、八方向每一 tick）
- `node tools/checks/doll-classes.mjs` PASS（pack 結構、純合成、`?doll=hero` 遊戲內 12 位獵人走紙娃娃、快取隨穿脫成長）
- `node tools/checks/doll-default.mjs` PASS（不帶參數就是紙娃娃；`?doll=0` 回 sheet，兩種模式畫出的獵人人數一致）
- `node tools/checks/gear-economy.mjs` PASS（七條配方、v2→v3 遷移、自動買齊、製作頁/獵人卡七列）
- `npm test` exit 0（`test-paperdoll` 31 tests、paperdoll parity 10080 cases）

**還沒做**（寫這節時）：頭像/UI 縮圖仍是 sheet、倒地/歡呼沒有紙娃娃動作（回 sheet）、攻擊/技能/受擊沒有斜向列（退回上/下）、魔物還是 sheet。
→ 前三項已在 §15 補上；魔物刻意不轉（§15）。

## 15. 全面改用紙娃娃（預設渲染器，2026-11-13）

**開關**：不帶參數 = 紙娃娃；`?doll=off`（`0/no/sheet/none`）= 原本的 hero sheet（完整保留，當逃生口）；`?doll=hero:paladin,archer` = 只換指定職業；
`?doll=1` = 實驗面板（英雄照預設）。執行中：`__mistvaleDoll('off' | 'hero' | 'hero:paladin')`，`__mistvaleDoll()` 回
`{on, all, classes, ready, failed, cached, hits, misses, composeMs, base}`。檢查腳本：沒設 `DOLL` = 預設紙娃娃（等資料載好）、`DOLL=off` = sheet。

**資料包**：`createDollHero` 的 base 優先序 `opts.base → PIXEL_ASSETS.paperdollClassesBase（assets/paperdoll-classes，§14 真美術）→ PIXEL_ASSETS.paperdollBase（assets/paperdoll，佔位）`。
遊戲內用的是 §14 的真美術包；佔位包只在沒有真美術包時用，以及當引擎/測試的對照組。

**覆蓋表**（`test-paperdoll.mjs` 的 coverage 測試對兩個包都跑：CLASSES 每職業 × 下列姿勢 × 8 方向，都要畫出 body+head、而且用的是真列）

| 遊戲姿勢（sheetPose） | 真美術包（paperdoll-classes） | 佔位包（paperdoll） |
|---|---|---|
| idle / walk / windup / strike（各武器變體）/ skill / hurt | 自己的動作，8 方向真列 | 自己的動作，8 方向真列（3/4 視角 = 側面與正/背面的中間姿勢） |
| dead（倒下 + 躺著，跟 sheet 一樣 `8 − reviveTimer` 對 death 列長度） | **衍生**：hurt 最後一格以腳底為軸往後倒，0.45 秒倒成 90°、半透明一點、不畫站姿影子 | 自己的 `death` 動作（跪 → 倒 → 躺，停在最後一格） |
| victory（打倒目標後歡呼，`cheer − 0.9` 起算） | **衍生**：skill 的舉起段（release 之前）循環 | 自己的 `victory` 動作（舉武器跳兩下，循環） |
| 立繪 / UI 縮圖（`drawPortrait` → pixel-ui `portrait()` → 獵人卡 `C.portrait`） | 紙娃娃正面待機第 0 格，裁法同 sheet 立繪 | 同左 |
| 職業 darkknight（不在 CLASSES，存檔讀入時會被濾掉） | 沒有 → 退回 sheet 並警告一次 | 有（黑板甲＋劍盾） |

**退回 sheet 的時機**（紙娃娃開著時）：只有「資料讀取失敗」或「資料包沒有這個職業」——每種（職業, 動作）只 `console.warn` 一次。
資料還在讀的那幾幀**不畫英雄**（不會先閃一下 sheet）。資料讀好時發 `pixel-assets-ready`，UI 立繪快取清掉重畫成紙娃娃。

**仍然是 sheet 的東西**（刻意不動）：村裡的職業路人（`spawnClassVillagers`）與刺客技能殘影用 `heroSprite`、`?poselab`、`?doll=off` 整條路徑。
沒有 hero sheet 的職業（目前沒有）仍走舊的程序化 `heroSprite`，因為 `sheetPose` 的時序數字來自 sheet 的 meta。

**魔物**：不轉。DV2 的魔物模型（每隻一張圖、動畫腳本依尺寸共用，§M）本來就是暮影村 `assets/monsters3` 的做法，紙娃娃只對多層角色有意義。

**佔位包這次的變更**（`build_paperdoll_placeholder.py`）：所有動作 8 方向真列；新動作 `death`、`victory`；darkknight 職業；
特效 8 方向（`effectDirs: 8`）；slot 層格子裁成 64×72（腳底 (32,66)）；**圖片以 1/2 解析度存、skin 帶 `scale: 2`**（`drawParts` 支援 `skin.scale`），
解碼後像素 ~19M → ~3.5M（RGBA 約 77 MB → 14 MB）。

**合成快取**（`createDollHero.compose`）：鍵 = 決定長相的全部輸入（外觀簽章、解析後動作、方向、slot、隱藏武器、頭部翻轉），命中時不跑 computeParts；
格子圖裁到部件外框；LRU 上限桌機 512、手機（`lowMemDevice`）192，淘汰時呼叫 `texRelease`。

**效能**（Playwright headless、`?preview=1`、鏡頭擺到看得到最多英雄、量 `world.update()` 每幀 CPU 時間 20 秒，off/預設交替各兩次）：
| 情境 | `?doll=off` mean / p50 / p95 (ms) | 紙娃娃（預設） mean / p50 / p95 (ms) | 快取 |
|---|---|---|---|
| 桌機 1440×900、12/12 英雄在畫面、30 秒 ×2 | 6.84 / 4.9 / 10.4；7.94 / 5.6 / 14.1 | 6.68 / 4.6 / 11.2；7.28 / 4.9 / 11.1 | 命中 92.5–93.1%，合成總共 38–42 ms / 30 s |
| 桌機、20 秒 ×2（含暖機） | 7.02 / 5.5 / 12.8；7.66 / 5.9 / 14.9 | 8.31 / 5.3 / 20.3；9.03 / 6.0 / 25.6 | 命中 90–91% |
| 手機 390×844 DPR3 觸控、CPU 4× 降速、9–10 英雄在畫面、20 秒 ×2 | 22.3 / 16.9 / 45.4；27.0 / 17.1 / 73.8 | 30.1 / 18.7 / 93.8；25.4 / 17.3 / 69.7 | 命中 90.7–90.9%（上限 192） |

讀法：中位數持平；30 秒的長跑 p95 也持平，短跑（含快取暖機）的 p95 紙娃娃比較高——有快取未命中的那幀 p95 約多 1 ms。
手機兩次 off 之間 p95 就差 45→74 ms，紙娃娃落在同一個範圍，差異在雜訊內。
改進前（固定 176×176 格子圖、鍵要先跑 computeParts、上限 192/64）桌機 p95 是 28.6/40.3 vs 21.2/15.2，手機平均多 12–20%，所以做了：
格子圖裁到外框、以輸入當鍵、上限 512/192、影子同一個（外觀,動作,方向）共用一張。量測腳本在 session scratch，沒進 repo。

**check_anim 命中顯示掉到 62/118 的調查 → 檢查腳本的假象，不是紙娃娃的 bug**：
用 scratch 探針（同 check_anim 的固定鏡頭 `look:19,3,2.6` 與取樣，另記每一擊的受擊者在不在畫面內、有沒有被畫、走路跳格前漏畫幾幀）。
`?doll=off`（sheet）連跑四次：命中顯示 88/192、60/139、169/170、66/159——**掉下去的那三次，沒顯示的分別有 103/104、78/79、93/93 擊受擊者在畫面外**；
走路跳格 7、8、5 次，**每一次跳格前那隻都有 8–398 幀沒被畫**（走出鏡頭又走回來）。也就是 check_anim 把固定鏡頭外的命中與走路也算進分母，
哪一次比較差只看那一局戰鬥打在哪裡。紙娃娃開/關一樣會掉（下表第二組 off 48/100、預設 46/97）。出招 slot 往回跳全部是新的一次出手（`atkAt` 不同、間隔 0.85–1.35 秒）。
要讓 check_anim 不受影響，分母應只算畫面內的實體（沒有改，檢查腳本的門檻由原作者決定）。

**最後一輪 check（同一份建置，`DOLL=off` 與預設交替，各 40 秒）**

| | heroCombatBad | heroWalkBad / heroAnimBad | flicker | walkSkip | 命中顯示 |
|---|---|---|---|---|---|
| off 1 | 19/896 | 0/0 | 3 | 0 | 86/86 |
| 預設 1 | 20/798 | 0/0 | 9 | 0 | 100% |
| off 2 | 19/1029 | 0/0 | 5 | 7 | 48/100（畫面外，見上） |
| 預設 2 | 18/1038 | 0/0 | 15 | 5 | 46/97（畫面外，見上） |

預設的 flicker 多出來的是 `hurt 1→0→1`（受擊連段結束後又被打，新的受擊 slot 0 只被取樣到一幀）與魔物 `m1`；用同一把「逐格」尺量 sheet 也有一樣的型態（§13）。

## 16. DV2 格式原創美術包（2026-11-13，取代遊戲內的 pixelfx 包）

- **規格**：[sprites/DV2_FORMAT_SPEC.md](../sprites/DV2_FORMAT_SPEC.md)（給畫師/美術代理，自足）。格式抄 DV2 套件（BODY/HAND 300×300 = 10×10 格 30×30、腳底 (15,30)；HEAD 140×40 = 7×2 格 20×20；HAT 20×60；武器 40×40 兩格、握把 x=20；特效 30×30 四方向），**內容全部原創**，Kairosoft 的圖/資料/角色不進 repo、不進提示詞。
- **方向**：只畫 3 個視角（背/側/正），左 = 側面鏡像。2026-11-13 起每個動作 4 列（上/右/下/左，§19）；BODY 第 7–9 列保留、不使用。
- **工具**（`pipeline/scripts/dv2fmt/`）：`dv2fmt.py`（版面唯一來源）、`make_templates.py`（範本 1x/8x → `output/dv2fmt/templates/`；`--placeholder` 把舊佔位圖重切成這個格式、走匯入器、讓遊戲先能跑）、`import_sheet.py`（8x AI 圖 → 降採樣 8×8 區塊眾數、去背、量化到職業色盤、逐格碰邊/空格/保留格/浮空檢查、寫 `assets/paperdoll-dv2/src/` + `output/dv2fmt/reports/`、記 `src/sources.json` 來源）、`build_pack.py`（src + `actions.json` → `assets/paperdoll-dv2/paperdoll.json` + 7 張圖集；`--check` 比對）。
- **動作表** `pipeline/scripts/dv2fmt/actions.json`：我們自己的數字（從我們的佔位姿勢縮放而來，可直接改）——每動作 af、release/impact slot、每 slot 的格子、脖子位移、武器握點/角度/sebF、盾的位置、特效。
- **引擎差異**：盾牌是 `kind:"weapon"` 的 `shield` 層（DV2 武器格式，握在副手）；頭部表情 = 每個動作選一欄（`head/<表情>` seb）；`meta.heroHeights` 是各職業 1x 站高（≈27 px），遊戲以 `HERO_H / 站高` 放大到跟以前同高、同腳底線。
- **選包**：`createDollHero` / 實驗面板的 base = `opts.base → PIXEL_ASSETS.paperdollDv2Base → PIXEL_ASSETS.paperdollBase`；**永遠不選** `paperdoll-classes`。`build.mjs` 複製 `assets/paperdoll-dv2/*.{png,json}`（不含 `src/`）到 `media/paperdoll-dv2/`；pixelfx 包只在 `DOLL_CLASSES_PACK=1` 時才複製（給該包自己的工具），遊戲不讀。
- **目前內容**：body/hand/head 六個可招募職業 + 頭盔/6 類武器（含 `_fine`）/圓盾/3 種特效都是真美術；`meta.placeholder` 現在是**空陣列**（darkknight 也在 2026-11-13 換成真美術）。護甲與披風見 §18。

## 17. 2026-11-13 整合稽核後的行為變更

全量掃過 6 職業 × 7 動作 × 8 方向 × 每一格（672 段），加上程式碼稽核。修正後的規則：

- **裝備外觀**：`lookFromHunter` 的 CLASS_KIT 分支跟 `gearWorn` 同一條規則（六部位任一件或舊存檔 `armor:true` = 有穿；`helm` 或舊 `armor:true` = 戴頭盔）。佔位 `armor_*` 不再打包，護甲層在有正式美術前一律不畫；騎士頭盔（`hat_helm`）是正式美術，戴 `helm` 就畫。倒地格的頭是畫在身體圖裡的，倒地時頭盔不畫（已知限制）。
- **命中格時序**：近戰命中格看攻擊者自己的 `h.atkHitAt`（pixel-game.js 三處命中寫入），不再看會被別人覆寫的 `target.hitAt`。
- **載入逾時**：資料包 8 秒沒載完 → `failed='timeout'`，退回 sheet 英雄；之後載完會自動切回紙娃娃。`images` 為空也算失敗。
- **特效**：遊戲內隱藏弓的 `arrow` 特效（遊戲本身的箭已在飛；實驗面板照畫）。近戰斬擊弧（揮砍軌跡）與法杖光爆（施法者手上，遊戲沒有對應特效）保留。法杖技能只在第 1、2 格有光爆，收招格沒有斬擊弧。
- **繪製順序**：所有 `attack.*` 的蓄力格用蓄力順序（武器在身體後）；`attack.bow` 例外（第一格是 aim0）。朝上三向（上、右上、左上）特效畫在最底層（揮砍在角色遠側）。
- **影子**：死亡動作每格各自的影子（跪 vs 躺）。
- **快取鍵**：不含 `weaponLevel`（畫面不依賴）。立繪快取鍵帶精良武器/頭盔/護甲。
- **位移**：sheet 路徑的出招前衝與受擊後退也套在紙娃娃與影子上（上半身晃動不套，紙娃娃是一張合成圖）。
- **資料**：側面勝利格腳貼地（compose_class.py `GROUND_SNAP`，頭位移由 apply_actions_class.py 跟著補）；倒地武器放在地面線（斧 −5、其他 −2）；跪倒兩格武器往前下傾（125°/150°），不再水平舉著；斧/劍低持角度往外收，不再插進地面；牧師用自己的 `*.holystaff` 握點表。

## 17. 動作結構跟 DV2 kit 一樣（2026-11-13）

- **原則**：每個英雄每個動作的「動作結構」照 DV2 kit（slot 數與 af、每格身體姿勢、武器畫面方向/翻面/顯示、每方向繪製順序、特效 slot 與位置、頭部表情、loop）；美術、握點（`wh`/`oh`，量自我們的圖）、脖子位置是我們的。
- **工具**：`tools/dv2-motion-derive.mjs`（開發用，執行時讀本機 kit 的 `data/data.js`，只寫衍生數字到 `output/dv2fmt/work/actions_base.json`）→ `output/dv2fmt/work/apply_actions_class.py`（握點、勝利貼地、法杖技能 burst、牧師 holystaff 表）→ `pipeline/scripts/dv2fmt/build_pack.py`。
- **對照**：idle←3 武器持ち立ち、walk←2 武器持ち歩き、attack（劍/斧/杖/短刀＝DV2 的 SLASH chargeType）←20 剣_縦振り、attack.bow←24 弓、skill（杖）←28 魔法演唱、skill（劍/斧/短刀）←22 剣_横振り、skill.bow←24、hurt←15、death←14 ダウン（倒地、不畫武器）、victory←11 万歳。
- **方向**：DV2 只有四個 3/4 斜向（d0 背面右上、d1 正面右下、d2 正面左下、d3 背面左上）。我們的背面格＝d0、正面格（臉朝畫面右）＝d1、鏡像的左側方向＝d2/d3；純上/下/右/左取同一張美術朝向的斜向（上←d0、右/下←d1、左←d2）。
- **武器方向**：DV2 每格的武器 = 第 sebF 欄（欄本身的傾角 0/22/36/−20°）＋ deg ＋ inv；我們只有一張直立圖，所以 deg = DV2 deg ± 欄傾角（翻面時取負）。弓：DV2 弓圖朝左、我們的朝右，inv 相反；拉滿的弓用 sebF 1。
- **特效**：`meta.effectDirs = 8`；縱斬（slash）每個方向用側面弧（右側方向用 `)`、左側用 `(`），橫斬（hslash，同一張 slash 圖）背面用上弧；DV2 特效位置加上 §8.1 的 ox'/oy'。法杖技能的 burst 是我們自己加的（DV2 魔法演唱沒有特效）。
- **測試**：`test-paperdoll.mjs` 的「motion structure matches the DV2 kit」（kit 在本機才跑）逐 action×8 方向×slot 比 af/loop/武器方向/翻面/顯示/前後順序/特效；「game timing contract」在 DV2 包上驗命中格不早於命中、遠程在 atkAt 出手、技能 release 對齊。

## 18. 護甲、披風與 darkknight 真美術（2026-11-13）

DV2 包上線後仍缺三種素材：護甲（`skins.armor` 空）、披風（`skins.cape` 空）、darkknight（佔位重切）。三者都用「**程序化畫在共用 body 剪影上**」補齊 —— 不走 AI 生圖也不用舊佔位圖，因為六個可招募職業的 body/hand/head 全部來自同一張 AI 圖（只有調色盤不同，剪影完全一樣），所以一張護甲/披風 sheet 對所有職業都對得上。

- **護甲** `pipeline/scripts/dv2fmt/gen_armor.py`：讀 `assets/paperdoll-dv2/src/paladin_body.png` 取每格剪影、從 `paperdoll.json` 的 head `off` 反推脖子位置（腳錨點 → cell 座標 = `off + (15,30)`），再從 SPEC 錨點表取同一份資料交叉驗證。畫法：只塗剪影內、離輪廓 1px 的「胸帶」（plate 寬 9、leather 8、mantle 12），保留 body 自己的近黑外框（所以護甲永遠不會比身體寬，符合 SPEC「inside the body silhouette ±1 px」）。
  - `plate`：頂列 `#f2ece0`、第二列 `#cfd8e2`/`#8e9aa8`、其餘銀灰（右緣深一階）、中線接縫、底列金邊交替 + 左右收邊、第 0–1 列肩甲各外擴 1px。
  - `leather`：V 領（第 0 列中間 3px 挖空露內襯）、棕皮革主體、每 3 列中間黃銅綁帶、底列皮帶扣、肩墊。
  - `mantle`：只蓋肩/上胸 4 列、愈往下愈內縮、暗紅漸層、底列金屬流蘇、後頸兜帽。
  - 倒地格（`(0,6)`，脖子在 cell 之外）特判成「地上攤平的胸甲」，否則 import 會報 `side:lying EMPTY`。
- **披風** `pipeline/scripts/dv2fmt/gen_cape.py`：DV2 沒有這一層（我們的 `layers` 表一直有 `cape`，`attach.before = body`），所以它是**迷霧村自加**的背影層。同 body 的 55 格、同 anchor，畫成上窄下寬、左右擺動（`sway`）、有摺痕與金邊扇貝下擺的深藍紫斗篷；因為畫在 body 之前，只有超出剪影的部分會露出來（左右各 1–2px、肩線、拖過靴子的下擺）。倒地格鋪成地上一攤。
- **darkknight** `pipeline/scripts/dv2fmt/gen_darkknight.py`：paladin 的 body/hand/head 先 `darken(shade=0.62)`（逐像素乘亮度、alpha 不動）→ NEAREST ×8 放大 → `import_sheet.import_one()` 由匯入器壓回 1× 並 snap 到 darkknight 調色盤。第一次膚色變粉紅，在 `palettes.json` 的 darkknight 補 `#f0c8a0 #d8a070 #a86a48` 三色後重跑才對。
- **工具鏈改動**：`dv2fmt.py` 加 `CAPES`/`cape` 的 `sheet_size`/`cells_of`；`import_sheet.py` 的 `reserved_boxes`/`choices`/`palette_for` 支援 `cape`（用新加的 `palettes.json -> cape` 色盤）；`build_pack.py` 加 `atlas_cape.png` 與每 row 的 `parts.cape` —— **cape 直接重用 `body/<action>/<dir>` 的 seb**，不複製 392 個 cape seb（複製會讓 paperdoll.json 從 255KB 漲到 315KB）。
- **引擎**：`lookFromHunter` 兩個分支都加 `cape: eq.cape === true ? 'cloak' : null`（有 `meta.kits` 時優先該職業 `kit.cape`）；`hasSkin` 仍會把資料包沒有的層清成 null，所以舊包不會壞。
- **結果**：`paperdoll.json` 270.0 KB、`atlas_armor.png` 300×900（9.0 KB）、`atlas_cape.png` 300×300（3.8 KB）、`meta.placeholder = []`、darkknight 站高 27→29、`npm test` 41 項全過（含 DV2 kit 10080 case parity）、`npm run build` 正常。
- **怎麼重跑**：`python pipeline/scripts/dv2fmt/gen_armor.py`（三套 + 檢視圖）、`gen_cape.py`、`gen_darkknight.py` → 各自 `import_sheet.py <kind> <name> <png>` → `build_pack.py`。三者都只依賴 body 剪影與 SPEC/pack 的錨點，body 美術換了要重跑。

## 19. 4 方向化與每職業盔甲（2026-11-13，docs/DV2-ADOPTION-PLAN.md Phase 0.3 / 1 / 2）

**資料**：`tools/dv2-motion-derive.mjs` 的 `DIRS = ['up','right','down','left']`、`DV2_DIR = [0,1,1,2]`（left 借 d2 的數字）、`BACK = {0}`；
`dv2fmt.py` 的 `DIRS`/`DIR_VIEW`/`DIR_MIRROR` 也改成 4 項。重推 → `apply_actions_class.py` → `build_pack.py` 後，每個動作 4 列，
**前 4 列跟 8 方向時代逐位元相同**（純截斷），`paperdoll.json` 276 KB → 140 KB；頭/帽 seb 4 格、特效 `sebF*4+dir`（`effectDirs: 4`）。
`hslash` 改用自己的 `effect_hslash.png`（自然欄，不再借 slash 圖）；`effect_thrust.png` 進包但動作表沒用到。

**引擎**（`src/paperdoll.js`）：`DIR`/`DIR_NAMES`/`MIRROR` 4 項；`pickRow` 沒有斜向退回；`migrateDir`/`DIR_MIGRATE_8TO4`；`dir8to4` deprecated；
`armorSkin(data, set, cls)`：`lookFromHunter` 先找 `skins.armor["<套>.<職業>"]`，沒有才用 `<套>`。

**盔甲**：`build_pack.py` 不再把 armor 當佔位略過；`src/armor_<套>_<職業>.png` → `skins.armor["<套>.<職業>"]`，共用 `armor_<套>.png` 留作 `<套>` 退回。
現在 21 張（3 套 × 7 職業）+ 3 張共用都在包裡，`atlas_armor.png` 300×7200（86 KB，解碼後約 8.6 MB，是包裡最大的一張）。

**移動與動畫方向（2026-11-15 改版；使用者：「允許斜走，90度分界分四個象限，每個象限一個動畫方向」）**
- 移動（`src/pixel-game.js`）：回到直線，可以斜走。路線（`walk`）、魔物追擊/閒晃（`moveEnemy` → `stepAxis`：整步被擋就只走 x 或只走 z 貼邊滑）、
  流浪英雄追擊、遠程後撤（候選方向 = 正後方往兩側每 25°）、戰鬥分散推開、手動操控（搖桿方向就是移動方向，撞牆沿世界軸滑）都是直線。
  投射物（手動法球/箭、AI 箭）直飛目標。2026-11-13 的 4 軸階梯（`stairStep`）遊戲已不呼叫，`src/dir4.js` 留著給 `test-paperdoll.mjs`。
  路線到達時間與 Phase 2 前相同（階梯本來就調成直線的時間）；近身移動在斜向上比 4 軸時快（回到 Phase 2 前的手感）。
- 動畫方向（`src/dir4.js`，`pixel-world.js` 用）：取**畫面上**的向量（等角 x 9、y 4.5，不是世界 dx/dz）的角度，90° 一個象限，
  象限中心 = 畫面右/下/左/上，邊界在畫面對角線（`QUADRANT_OFFSET_DEG = 0`；改成 45 = 邊界在畫面軸上的 DV2 式斜象限，只改這個常數）。
  - 一次性的方向（出手、受擊、技能；事件開始時鎖一次）：`quantize4`，邊界 ±3°（`TIE` 10%）內維持上一個方向。蓄力中目標走開會跟著換（10° 遲滯），出手後不再改。
  - 連續的方向（走路）：`quantize4Stable`，超過邊界 `FACING_HYSTERESIS_DEG = 10`° 才換 → 幾乎正斜走不會一幀一換。
  - 英雄：走路用單幀位移；出手方向只給攻擊列（攻擊列播完就用移動方向，不會「橫著走」）；受擊朝打來的人、技能朝目標；待機沿用最後的方向。
    側面（side/sideLeft）時左右鏡像 = 方向（`mirrorOf`）；上/下時鏡像只是外觀（紙娃娃 `dollDirName` 不看）。
  - 魔物：走路方向用最近 0.15 秒（遊戲時間）的位移（`ENEMY_DIR_WIN`；魔物 AI 在追擊/閒晃/交戰邊界上會一個 tick 換一次目的地，單幀位移是鋸齒），
    急轉時窗口落在第三象限就改用單幀位移；站著等空位時朝盯著的獵人（4 象限）。
  - 存的方向值不變（`side/down/sideLeft/up`），舊存檔不用遷移（方向不進存檔）。
- 驗證：`pipeline/scripts/check/check_facing.mjs` 逐幀比「畫出來的方向」與「畫面移動方向的象限」（單幀或 0.15 秒窗口任一在 45°+10° 內），有門檻、會回非 0。

**畫面（`src/pixel-world.js`）**：`moveDir`/`moveDirStable` 只回 `side/down/sideLeft/up`；`dirSuffix`/`leftRow` 移到 `src/dir4.js`。
英雄（紙娃娃與 sheet）、魔物都只有 4 個方向。`assets/monsters3` 的 4 組斜向列已修剪（計畫 2.8）：22 張 sheet 只剩 原列/Down/Up/Left + hurt/death，
出貨 WebP 0.926 → 0.503 MB、解碼後（22 張全載）249.7 → 142.6 MB；保留的 1764 格與修剪前逐像素相同、head/錨點/節奏欄位不變（只改 `y`）。

**測試**：`test-paperdoll.mjs`（4 方向引擎、遷移、量化、階梯、DV2 fidelity ↔ [DV2-PARITY.md](DV2-PARITY.md)、
每職業 × 49 動作 × 4 方向 × 每 slot 每層像素非空、披風在 body 前且露出、class-aware 盔甲）；`test-pixel-game.mjs`（斜走：手動輸入直走、AI/魔物有斜向位移；4 象限規則與遲滯；魔物 4 方向選列）。


## 20. 騎乘（DV2 C1，2026-11-14，docs/DV2-ADOPTION-PLAN.md Phase 5.1）

範圍：引擎／資料／繪製能力＋遊戲介面（`game.setMount`）。**沒有**取得坐騎的玩法（計畫「不含新玩法設計」）。對照表 [DV2-PARITY.md](DV2-PARITY.md) P16、P17、D18–D23。

**動作**（`tools/dv2-motion-derive.mjs` 從 kit 推出動作結構，跟其他動作同一條路；`apply_actions_class.py` 的 `NAMES` 加上這五個，所以每種武器都有自己的握點變體）：

| 動作鍵 | DV2 動作組 | af | 武器 | release / impact | 我們的身體格 |
|---|---|---|---|---|---|
| `ride_sit` | 16 乗る_座る | [6,12] 循環 | 不畫（ball 0） | – | kneel ×2 |
| `ride_stand` | 17 乗る_立つ | [6,12] 循環 | 不畫 | – | stand0 ×2 |
| `ride_charge_sit` | 29 乗る_攻撃_座る | [6,12] 循環 | 不畫 | 1 / – | kneel ×2 |
| `ride_charge_stand` | 30 乗る_攻撃_立つ | [6,12] 循環 | 不畫 | 1 / – | stand0 ×2 |
| `ride_charge2`（+ `.sword/.axe/.dagger`） | 31 乗る_攻撃2，`spProc: 4`（RIDECHARGE2） | [6,12,18,24] 不循環 | 第 0 格不畫、1–3 格畫（DV2 ball [0,1,1,1]） | 1 / 2 | kneel ×4 |
| `ride_charge2.bow/.staff/.holystaff` | 同上 | 同上 | 同上 | 1 / –（遠程：箭/法術在 atkAt 出手） | kneel ×4 |

- 我們沒有坐姿美術：「坐」用 `kneel`（DV2_FORMAT_SPEC §5 的單膝格，身體低、腿被坐騎蓋住）、「站」用 `stand0`。kneel 現在沒有別的動作用，脖子位置取 SPEC §5 錨點表（`NECK_SPEC`：背 [0,−14]、側 [1,−14]、正 [0,−14]）。
- 弓的翻面規則（DV2 弓圖朝左、我們的朝右）跟著「武器是弓」走：`ride_charge2.bow` 帶 `dv2.bowArt: true`，kit 對照測試也照這個比。
- 資料包：`paperdoll.json` 49 → 84 個動作、140 → 234 KB；原本的 49 個動作、全部 seb、8 張圖集逐位元組不變（純加法）。

**遊戲動作 → 騎乘動作**（`rideActionFor`，`dollActionTick` 收到 `ride: 'sit'|'stand'` 時）：普攻（蓄力/出手）→ `ride_charge2`；技能 → `ride_charge_<坐|站>`；待機/走路/受擊/歡呼 → `ride_<坐|站>` 連續播（走路動畫由坐騎播；受擊閃光照舊）。出招計時合約不變：近戰命中格 = `h.atkHitAt`（不會早畫），遠程在 `atkAt` 的那一格出手，技能 release 對齊 `SKILLS[].release`（`test-paperdoll` 有 0–344 ms 逐 ms 檢查）。倒地不會騎。

**坐騎**：`assets/mounts.json`（`pipeline/scripts/dv2fmt/gen_mounts.py` 產生，`--check` 比對；`build.mjs` 內嵌成 `PIXEL_ASSETS.mounts`，約 4 KB）。每物種：`seat`（四足 `archetype: quad` 坐、其他站；`SEAT` 可覆寫）、`saddle[上,右,下,左]` = **坐騎在騎乘者那幾欄的背線**（monsters3 美術 px、相對坐騎腳底，乘坐騎的縮放 km）；頂層 `hip = {sit: 5, stand: 1}` = 騎乘者腳底在背線下幾個**騎乘者**美術 px（乘騎乘者自己的縮放 k）。DV2 的 `rideOffset_` 沒有逆向出來，所以在我們的 monsters3 idle 第 0 格量：騎乘者 x = 重心（坐姿的側面改成「屁股端與重心的中點」，不然會坐到脖子/角上）；背線 = 騎乘者 x ±12 px 各欄最上面不透明列的第 25 百分位（零星的角/鹿角欄不算，正面圖擋在騎乘者前面的頭算）。`OVERRIDES` 目前是空的。
- **2026-11-14 修正**（協調者看截圖發現右/下/左只露出頭）：原本「坐 = 往下到頂→腳底線的 40%」把 kneel（全身約 15 px、脖子 −14）埋了約 34 坐騎 px，只剩約 6 px 身體在背線上；而且騎乘者的深度用了坐騎的縮放。現在背線（坐騎空間）與 hip（騎乘者空間）分開算。回歸測試 `riding: the mount never buries the rider`：每個可騎物種 × 4 方向 × 最矮/最高的騎乘者（paladin 29、sorcerer 33），坐騎蓋在騎乘者上的方向（深度 −1）被蓋住的像素 ≤ 40%、背線以上（軀幹/手/頭）≤ 15%；目前最差 stag 朝下 29% / 9%。把 hip.sit 改回舊深度（14）會失敗（ram 朝右 51%）。treant（首領圖）標 `rideable: false`。
- **2026-11-14 收斂可騎清單**：seat=stand 的物種（狼人、雪人、仙人掌、冰甲蟲…）騎上去是騎乘者站在牠頭頂、不拿武器（DV2 乗る_立つ），畫面怪；改成**只有 seat=sit 的四足物種可騎**：`src/pixel-game.js` `RIDEABLE = [boar, goat, mole, ram, scorpion, stag]`（`isRideable`），`gen_mounts.py` 把 stand 物種標 `rideable: false`（鞍點照量，留著以後要開），測試要求兩邊一致。`ride_stand`／`ride_charge_stand` 仍在資料包與面板動作清單。

**引擎**（`src/paperdoll.js`）：`DV2_DIR4 = [0,1,1,2]`；`RIDE_DEPTH`／`rideDepth(dir)` = DV2 `Proc_updateDrawDepth`（direct 為 RIGHT/DOWN → −1 騎乘者在坐騎後，其他 +1），套在每個方向借用的 DV2 direct 上 ⇒ **上 +1、右/下/左 −1**；`mountMotion(data, 騎乘動作, tick, 移動中)` → 坐騎要播的 SEB_M（`ride_charge*`：騎乘者 release 之前 `charge` = 坐騎攻擊列的蓄力格、之後 `charge2` = 出手格；其他：`walk` / `stand`）。

**遊戲**（`src/pixel-game.js`）：
- 欄位 `h.mount`：物種 id 或 `null`。新獵人 `null`；存檔照存（`serialize` 本來就整隻存）；讀檔：沒有欄位（舊存檔）、不認得的物種、`boss`、倒地 → `null`。**存檔版本不變（3）**，欄位是加法、舊檔可載（`test-pixel-game` 有 v2/v3/缺欄位/壞值/倒地的遷移測試）。
- `game.setMount(hunterId, species | null)` → `{ok, message, mount}`；倒地中不能騎。
- 走速：`MOUNT_SPEED_MULT = 1.3`（匯出常數）。路線行走、遠程後撤、手動操控都乘；攻擊間隔、射程、出招時序不變。DV2 的 `SEB_H_WALK_MONSTER_SPEED` 數值沒有逆向，1.3 是我們定的。
- 倒地（野外 `died()`、地下城/競技場的 `hp <= 0` 分支）一律 `h.mount = null`。

**畫面**（`src/pixel-world.js`）：
- 紙娃娃路徑（預設）：`drawDollHero` 在「有坐騎、資料包有 `ride_sit`、坐騎 sheet 已載入」時走騎乘：`mountPlan()` 決定坐騎的列（idle/walk/attack + 方向字尾，左邊用烘好的 Left 列）與格（走路照實際位移 `gaitFrame`、攻擊照 `mountMotion` 對齊騎乘者的 release），騎乘者的腳移到 `saddle × 21/72 × scale`（加上坐騎 `head` 欄的上下起伏）。深度 +1 先畫坐騎、−1 後畫坐騎；**只有坐騎投影**（畫騎乘者時暫停 `casting`）。點擊框 = 騎乘者與坐騎的聯集。`__mistvaleFacing()[id].mount = {type, act, f, depth, ox, oy}`。坐騎 sheet 還在載的那幾幀照一般姿勢畫（不閃空）。
- `?doll=off`（sheet 英雄）：刻意簡化 —— 坐騎照畫、sheet 英雄用原本的姿勢站在鞍點上（sheet 沒有騎乘列），深度與單一影子規則相同。
- 頭像/立繪不畫坐騎。

**實驗面板**（`?doll=1`）：`mount` 下拉（坐騎表裡可騎的物種，標坐/站）、`mount walks` 勾選、動作清單多五個騎乘動作；選了坐騎會自動換成該坐騎的 `ride_<坐|站>`；資訊列顯示坐騎列/格與深度。strip 每格也畫坐騎。

**驗收（2026-11-14）**：`npm test` 全過（test-paperdoll 54 項，含騎乘 4 項、P16/P17；test-pixel-game 加騎乘存檔/API/走速/倒地下坐騎）；`build_pack.py --check`、`gen_mounts.py --check` OK；實機（agent-browser，`?preview=1`，白天）四方向截圖 `output/dv2fmt/phase5/mounted_paladin_boar_{up,right,down,left}.png`（坐）、`mounted_berserker_wolfman_*.png`（站），各有 `_4dirs.png`；面板 `lab_ride_charge2_paladin_boar_strip.png`；六位獵人全騎 25 秒取樣，五個騎乘動作每個 slot 都畫到、坐騎 idle/walk/attack 都出現、0 個頁面錯誤。

**還沒做**：坐姿專屬美術（現在借 kneel）、騎乘跳躍拋物線（`rideMonsterJumpA/_Height`）、`STATE_RIDE_MOVEAIR`、馬影 `HORSESHADOW_OFFPOS`、坐騎取得/管理的玩法與 UI、立繪上的坐騎。

## 21. 單層怪物紙娃娃（DV2 C2，2026-11-14，Phase 5.2；**預設不開**）

DV2 的怪物 = 每隻一張「4×4 虛擬表」、單一圖層、`SEB_M_*` 動作腳本共用（dv2-lab `docs/04-monster-animation.md`）。這裡把同一套做成可選的渲染路徑，**預設仍畫 `assets/monsters3`**（計畫標 C2 不建議當預設）。對照表 P18、D24、D25。

- **轉換器** `pipeline/scripts/dv2fmt/build_monster_pack.py`（`--check` 比對）：從 monsters3 的 22 張 sheet 轉出 `assets/monsterdoll/monsterdoll.json` + 每物種一張 PNG（共 4.0 MB；不重複的格裁到外框後排進 512 寬的圖，沒有新美術）。
- **格式**：跟英雄同一個 `mistvale-paperdoll` 格式，`meta.kind = "monster"`、一個 `body` 圖層、動作鍵 `<物種>/<SEB_M>`（`walk stand charge charge2 damage ride down die`，DV2 順序），每動作 4 列（上/右/下/左 = 這隻的虛擬表）＋ `src[]`（每列重組的是 monsters3 哪一列哪幾格、是否鏡像）。
  - 對照：walk←walk、stand←idle、charge←attack 的 release 之前、charge2←attack 的 release 起、damage←hurt、ride←idle（monsters3 沒有被騎姿勢）、down←death 末格、die←death。方向規則同遊戲（`src/dir4.js`）：右 = 原列、下 = `<列>Down`、上 = `<列>Up`、左 = 烘好的 `<列>Left`，沒有才鏡像；hurt/death 只有側面，左邊鏡像。
  - 時間：`tickRate: 200`（5 ms tick），af 照 monsters3 的 75/100/120/200 ms 幀時，不差一格。
- **引擎**：`computeMonsterParts(pack, 物種, {action: SEB_M 名稱或索引, dir, tick})`（嚴格：物種/動作不存在回 `[]`，不會退回別的物種）＋ `monsterFrameTick`、`SEB_M`；內部就是 `computeParts`。
- **渲染**：`?mdoll=1`（或 `__mistvaleMonsterDoll(true)`）。`drawMonsterSheet` 把要畫的 (列, 格) 經 `src` 反查成 (SEB_M, 方向, 格) → `computeMonsterParts` → `drawParts` 畫進同尺寸格子圖（LRU 768 格，手機 256），其他（縮放、鏡像、切片位移、閃光、影子）走原本的程式；所以魔物與坐騎都會走這條。包/圖還沒載好的格照畫 sheet。`__mistvaleMonsterDoll()` 回狀態；`__mistvaleMonsterDollCompare(物種)` 在頁面裡逐格比對。頭像、魔物資訊卡仍直接讀 sheet。
- **驗收**：`test-paperdoll` 兩項 —— 22 物種 × 8 動作 × 4 方向 × 每格（2784 格）都有非空的圖；每一格重組後跟它對到的 monsters3 格逐像素相同（22 物種全部）。實機 `?mdoll=1`：21 物種 1680 格頁面內比對 0 差異（treant 沒在時限內載好，node 測試有涵蓋），25 秒遊玩 0 個頁面錯誤。
- **還沒做**：臉部大頭圖 `faceIconSeb_`、光環、影子動畫；DV2 的「依尺寸共用動作腳本」（我們每物種一份，因為 monsters3 每隻的格數/節奏不同）。

## 22. 武器攻擊變體與連擊表（DV2 weapon.txt，2026-11-14）

依據：dv2-lab `docs/05-weapon-attack-animation.md` 與它的匯出 `docs/dv2-weapon-animation-data.json`（repo 外；只在開發時讀，只寫衍生數字，§0 規則不變）。

- **變體動作**：每種近戰/法杖武器多兩個攻擊動作，結構照 DV2 kit 推（`tools/dv2-motion-derive.mjs`，跟其他動作同一條路）：
  - `attack.<型別>` = 剣_縦振り（set 20，af `[2,4,6,12]`，縱斬特效）—— 原本的普攻，不變；
  - `attack_h.<型別>` = 剣_横振り（set 22，af `[4,8,14]`，橫斬特效 `hslash`）；
  - `attack_t.<型別>` = 剣_突き（set 23，af `[4,8,14]`，突刺特效 `thrust` = `effect_thrust.png`，DV2 特效 type 2 以前沒畫，現在畫）。
  - 三個都是 release 1；近戰命中 slot 2，法杖（遠程）沒有命中格。只寫連擊表用得到的型別（斧沒有突刺、弓沒有變體）。
- **連擊表** `paperdoll.json` 的 `combos[型別] = {count, pool:[[動作, 權重], …]}`（DV2 `chargeNumMax_` / `chargeSelectRate_`；權重第 i 個 = set 20+i，21 與 20 逐欄相同、權重恆 0）：

  | 型別 | DV2 家族 | 段數 | 縱 / 橫 / 刺 |
  |---|---|---:|---|
  | sword、dagger（DV2 的 盗賊のﾅｲﾌ 是 SORD） | SORD | 5 | 100 / 50 / 50 |
  | axe | AX | 4 | 100 / 30 / — |
  | staff、holystaff | WAND | 4 | 100 / 10 / 10 |
  | bow | BOW | 3 | 只有 弓(24) |

- **引擎**：`attackVariant(data, 型別, roll)` 依權重回傳基底動作名（沒有表 / 舊包 → `'attack'`）；`comboCount(data, 型別)`。遊戲每一擊骰一次（同一擊的蓄力與出手用同一個變體），只換動畫：傷害、命中次數、出招時間都不變，`count` 不拿來改戰鬥。
- **遊戲接線**（`paperdoll-hero.js` `trackAttackStamp` / `dollAttackVariant`，`pixel-world.js` `drawDollHero`）：骰子 = FNV 雜湊（獵人 id + 鍵），render 裡不用 `Math.random`。
  鍵 = 「這一擊之前那一擊的 `atkAt`」：蓄力時 `h.atkAt` 還是上一擊（= 鍵），出手後 `h.atkAt` 換新，`trackAttackStamp` 記下換之前的值（`prev` = 鍵）→ 蓄力與出手同一個變體，release 不跳姿勢。
  `dollActionTick({…, attack})` 收基底名（預設 `'attack'`，資料包沒有就退回）；變體 af 不同但 release 1 / impact 2 相同，命中格照樣落在 `hitDelay`。騎乘（`ride_charge2`）、技能、弓不受影響。
  同一段蓄力 / 同一次出手鍵不變 → `req.action` 不變，`advanceNoSkip` / `dollWind` 的只往前照常；換下一擊時 stamp 本來就換了，不沿用上一擊的 slot。
- **弓的第三欄**：DV2 弓圖三欄 = 待機 / 拉滿 / 放箭。我們的弓原本只有前兩欄，放箭的兩格退回待機欄。現在 `weapon_bow(_fine).png` 有第 2 欄（放箭：弦彈回成 V 形、無箭；2026-11-14 08:07 由 import_sheet 匯入，報告 `output/dv2fmt/reports/weapon_bow.txt`），`sources.json` 的 `weapon_bow.png.releaseCol = true` 讓 derive 工具把 弓(24) 的 sebF 2 照搬（騎乘普攻 set 31 的第 2 欄是劍的傾角，不套）。最初的程序產生器已停用（`output/dv2fmt/work/parked/gen_bow_release.py.stale`）；之後重畫弓圖要保留第 2 欄，否則把 `releaseCol` 拿掉再重推。
- **重建順序**：`node tools/dv2-motion-derive.mjs`（環境變數 `DV2_WEAPON_DATA` 可改武器資料位置；檔案不在就沿用現有 combos）→ `python output/dv2fmt/work/apply_actions_class.py` → `python pipeline/scripts/dv2fmt/build_pack.py`。
- **沒做**：射程 `length_`（117–650，暮影村用自己的射程數值）、大型武器專用格（`spProc & 4`）、拳（18/19）與槍（25）—— 暮影村沒有素手/槍職業。

### 22.1 逐動作視覺稽核（2026-11-14）

每職業 × 每動作 × 4 方向逐格出圖（`output/dv2fmt/action-audit/<職業>.png`，前後對照 `before_after.png`），並和 DV2 kit 參考渲染器同格並排比對（kit 圖只在暫存區產生，不進 repo）。修掉的：

- **聖騎士的盾畫在腳底**：derive 工具把 DV2 `off[1]`（part 1 = 手）當盾握點，但它在全部 328 格都是 `[0,0]`。拿掉，盾改用我們量的 `oh`。
- **突刺的劍和手分家**（手在胸口、劍在膝蓋）：DV2 的武器握點 `off[4]` 是量在 DV2 自己的身體上的。`OWN_GRIP_SETS`（20/21 縱斬、23 突刺）改用我們量的拳頭（`fists.json`）；
  22 橫斬、24 弓、31 騎乘普攻、持握類（待機/走路/受傷/勝利/騎乘）維持 DV2 握點（橫斬用我們的會讓直立的劍蓋住臉；騎乘普攻是同一張跪姿，DV2 每格移動的握點才有揮擊感）。
  特效（斬擊弧、突刺光）跟著握點平移同樣距離（`build_pack.py` 的 `_fxo`，用 derive 留下的 `dv2off`）。
- **`measure_class.py` 量錯拳頭**：「貼到最近的手部顏色」半徑 16 px，伸直的手會被貼到同色的護脛上。改成 4 px（`SNAP_R`），重量六職業（舊值備份在 `output/dv2fmt/work/fists_bak_20261114/`）。
- **突刺光朝向**：朝上/朝下時劍是往右/往左伸（DV2 就是這樣），但光是畫成往上/往下。`gen_fx.py` 改成上 = 右向光、下 = 左向光。
- **左向的武器藏在身體後面**（橫斬左向看不到劍）：DV2 左向是另一套圖、持武器手在遠側；我們的左向是側面翻轉、手在近側。揮擊類（`SWING_SETS`，弓除外）左向一律由右向鏡像（欄同、翻面相反、角度變號、順序同、特效 x 變號），kit 對照測試也改成拿右向比。

**沒修、要決定的**：

- **武器圖本身**：`weapon_sword/axe/dagger/staff/holystaff(_fine).png`（05:11 由 `output/dv2fmt/work/missing/compose_weapons.py` 從 l0veyou 生圖縮成）縮壞了——劍、杖是木板狀、斧頭像拳頭，`_fine` 是金色木板。原始生圖（pixelfx `records/dv2/l0v-weapons/raw/`）是好的；只有 `sword_long`、`staff_crystal`（`gen_weapon_dirs.py`）正常。
- **正面的拳頭位置**：各職業正面攻擊格的手位置不一，`measure_class.py` 的啟發式在幾格量到膝蓋/肩膀（狂戰士正面 strike0/thrust、祭司正面 strike0…）。要逐格手標（`<職業>/overrides.json`），最好跟武器圖重做一起。

### 22.2 頭跟身體分開（2026-11-14）

- **原因**：頭畫在每個身體格的「脖子點」，脖子點取自 SPEC 錨點表——那是當初**要求** AI 生圖把軀幹放的位置，不是生圖實際放的位置。弓步、轉身、勝利、受傷格的軀幹落在別處，頭就浮在旁邊或上方。最明顯的是待機呼吸：stand1 的身體上移 1 px，表裡的頭卻下移 1 px，每次呼吸頭跟肩膀拉開 2 px（六個職業都是）。
- **修法**：`output/dv2fmt/work/measure_neck.py` 在每個職業的實際身體圖上量軀幹頂：x = rows 10–25 裡像素最多的那幾欄（軀幹高；伸出或舉起的手臂在這段很短），y = 該欄往上連續不透明的最頂端（x±1 三欄取中位數）。存成相對 stand0 的位移 `output/dv2fmt/work/<職業>/neck.json`；走路/站立格 x 固定 0（不然每步頭左右晃）。`apply_actions_class.py` 把它加到遊戲已經在用的 stand0 脖子上（六職業 stand0 的頭底列都剛好壓在身體頂列上），寫進每個武器型別的動作表。倒地格不量（自帶頭）。第一版用「最上面 ≥5 px 寬的列」量，會把舉起的手臂當肩膀（祭司側面受傷頭被推到身體外），已棄用。對照圖：`python output/dv2fmt/work/neck_sheet.py <職業> <out.png> [neck.json ...]`（第一欄 = 舊脖子）。
- **稽核**：`node tools/audit-neck.mjs` 用引擎把 6 職業 × 11 動作 × 4 方向 × 每個 slot（708 幀，不畫武器）逐幀畫出，量頭底列對軀幹頂（contact：-1 = 剛好貼著，≤ -2 = 中間有空隙，≥ 4 = 陷進胸口）與頭中心對軀幹中心（|dx| ≥ 4 = 在身體旁邊）。修前 86 幀有問題、修後 37 幀；剩下的逐張放大看都是貼著的（手臂、法袍讓量測偏掉），不是真的分開。`PACK_JSON=<assets/paperdoll-dv2 裡另一份 json>` 可以拿舊包比。
- **遊戲讀的是 build 出來的包**：`server.mjs` 送 `../../outputs/media/paperdoll-dv2/`、`check_anim` / `check_facing` 也讀 `../../outputs/暮影村.html`。改了 `assets/paperdoll-dv2/` 之後要 `npm run build`，不然手機上看到的、檢查跑的都是舊包（2026-11-14 就發生過：08:12 的 build 一直沒更新，下午的修正手機上都看不到）。
- **還在的問題**：身體圖本身（l0veyou 生圖縮成 30×30）在走路第 3 格、弓步、勝利、受傷格有扭曲、塊狀的剪影（祭司、法師的走路與攻擊最明顯）。脖子對齊只能讓頭跟著軀幹，治不了姿勢本身；要重畫身體。

### 22.3 狂戰士身體改用 PixelLab（2026-11-14）

- **為什麼**：舊身體是每一格各自用 AI 生圖再縮成 30×30，格與格之間軀幹的形狀、寬度、傾斜都不一樣，動起來就是「扭曲、跟頭分開」。使用者指定改用 PixelLab：PixelLab 的動畫是同一個角色逐幀畫出來的，軀幹一致。
- **角色**：`create-character-with-4-directions`，文字描述（原創：棕色刺蝟頭、皮背心＋米色毛領、裸臂護腕、空拳不拿武器）、`image_size` 26、自訂比例 `head 1.9 / legs 0.5 / arms 0.8 / shoulders 1.4 / hips 1.2`、`force_colors` 用舊狂戰士的 20 色調色盤（`output/dv2fmt/work/berserker/pixellab/palette.png`）。preset `chibi` 幾乎沒效果（試過，34 px 高的細長人），所以用自訂比例。試了 4 個角色，選 C（character `ffdc65a3-…`）。
- **動作**（v3 自訂動作，每方向約 1 generation）：walk、chop（雙拳舉過右肩再砸下）、hswing（右拳橫掃）、hurt、victory、kneel（騎乘蹲姿）各做 south/east/north，death 只做 east。**提示詞不能提到武器**（寫了 "as if swinging an axe" 它就真的畫出斧頭）；武器由我們的武器層畫。共 27 generations（4 個試作角色 + 23 個動作方向），帳號月額 2000。
- **API 坑**：同時最多 8 個背景工作，超過的方向會被**靜默丟掉**（回應的 `directions` 只列有接受的）→ 用 `animation_group_id` 補（要同一句 `action_description`）。
- **轉換** `pipeline/scripts/dv2fmt/pixellab_body.py berserker [--install]`，對照表 `output/dv2fmt/work/berserker/pixellab/map.json`（哪個動作的第幾幀 → 哪個姿勢格、每個視角；back=north、side=east、front=south）：
  - 地面：站姿 rotation 的腳底列與外框中心對到格子腳底 (15,30)，同方向所有幀共用 → 弓步、後退保留真的位移。
  - 頭：PixelLab 有畫頭，但遊戲用自己的頭層（有表情）。用站姿的頭（最窄那列以上）在每幀做色彩完全相同的樣板比對（分數 0.6–1.0），把頭擦掉（外擴 1 px，不擦脖子以下），頭底列 = 新的脖子點（頭最後一列蓋住身體第一列，跟 stand0 一樣）。剩下 < 4 px 的碎點清掉。
  - 走路（正/背面）：俯視角下跨出去的腳畫得比站姿腳底低 2–3 px，軀幹沒有動。格子放不下第 29 列以下 → 格內內容往上提 k、`body_off.json` 記 k，`build_pack.py` 讓 body（hand 跟著 body）畫低 k → 軀幹不跳、腳照樣踩過地線。
  - 拳頭：膚色像素中離軀幹中心最遠的點（正面取畫面左、背面取右、側面取最遠）；`map.json` 的 `fist_overrides` 可手改。hand 層 = 武器拳附近 5×5 的身體像素。
  - 倒地：death 最後一幀整個人（含 PixelLab 的頭）放在倒地格。
  - `--install` 寫 `assets/paperdoll-dv2/src/berserker_{body,hand}.png`、`output/dv2fmt/work/berserker/{neck,fists,body_off}.json` 與標記 `GENERATED.json`（不能叫 `PIXELLAB`：Windows 路徑不分大小寫，會撞到 `pixellab/` 資料夾）。
- **配套**：`apply_actions_class.py` 對有 `GENERATED.json`/`RIG` 標記的職業，**所有動作**都用我們的拳頭位置（DV2 的握點是量在 DV2 身體上的），DV2 的點留成 `dv2off` 只給特效位移用；`measure_neck.py` / `measure_class.py` 跳過有標記的職業（不然會用量測覆蓋掉）；`build_pack.py` 的 `BAKED_OUTFIT` 拿掉狂戰士（服裝已畫在身上）、`standing_height` 改用各職業自己的 `idle.<武器>`。舊美術備份在 `output/dv2fmt/work/berserker/pre-rig/`。
- **驗證**：`npm test`（61 + 10080 parity）、build 後 `check_anim` / `check_facing` 都過；`tools/audit-neck.mjs` 狂戰士 120 幀標 22 幀，逐張看都是 PixelLab 原本就前傾的頭（弓步、蹲），頭有貼在肩上。對照圖 `output/dv2fmt/action-audit/berserker_pixellab_review.png`（舊 / 新 / PixelLab 原圖）。
- **還沒做**：其他 5 個職業；頭要不要也換成 PixelLab 的（要另做表情、頭圖加正面列）；受傷格的武器拳選到舉高的那隻手（斧頭在頭旁）；武器圖本身（§22.1）。

### 22.4 狂戰士的頭也改用 PixelLab（2026-11-14）

- **表情**：在角色 C 上用 `create-character-state`（「同一角色，雙眼閉上」「咬牙忍痛」「張嘴怒吼」「開心笑、眼睛瞇起」「被打昏、眼睛是 x」），每個 state 10 generations，臉、頭髮、大小都跟原角色一樣，只換表情。`pipeline/scripts/dv2fmt/pixellab_head.py berserker [--install]` 依 `map.json` 的 `head_states` 把每個表情的頭放進 20×20 格；裁切窗跟 `pixellab_body.py` 的脖子點同一個（頭底列 = 最窄的脖子列），所以頭跟身體完全對齊。
- **頭圖改成 3 列（140×60）**：0 背面、1 側面（看畫面右）、2 正面。`dv2fmt.py` 的 `HEAD_ROWS = 3`、`DIR_HEAD_ROW = [back, face, front, face]`；`build_pack.py` 讀到舊的 140×40 頭圖時把 face 列複製到 front 列，所以其他職業看起來完全一樣（heroHeights 不變）。`standing_height` 改用 front 列。
- **試過「無頭身體」**：`create-character-state` 去掉頭的靜態圖很乾淨，但拿去做動畫時 PixelLab 失去方向感（側面揮砍轉成面向鏡頭、軀幹變一團）→ 不用。身體還是「完整角色做動畫 → 自動移除頭」（§22.3）。

### 22.5 斧頭改用 PixelLab（2026-11-14）

- `create-image-pixflux`（最小畫布 32×32，去背）生直立斧頭，挑 1 把普通、1 把 `_fine`；原尺寸約 28–30 px，跟 30 px 的角色一樣高、待機時斧頭蓋住臉 → 用 PixelLab 的 `/resize`（像素畫縮放，寬至少 16，所以先補成正方形）縮到約 22 px。
- `pipeline/scripts/dv2fmt/pixellab_weapon.py <武器> <直立圖> [--grip-from-bottom N] [--install]`：斧柄軸線對到握點 x、握點在柄底往上 N px，三個傾角欄用 `gen_weapon_dirs.py` 的超取樣旋轉烘出，顏色量化到這把武器自己的顏色。舊圖備份 `output/dv2fmt/work/weapons/pre-pixellab/`。
- **bug**：`gen_weapon_dirs.nearest_palette` 用 int16 算色差平方，亮色會溢位選錯色（`_fine` 斧頭整把變白）；`pixellab_weapon.py` 自己用 int32 版。舊的共用函式沒改（舊武器顏色剛好沒踩到）。
- **持武器姿勢**：DV2 的待機/走路是武器直立、握在 DV2 的握點（身體旁邊）；改用真正的拳頭位置（在身體前面）後直立的斧頭會橫過臉 → `apply_actions_class.py` 對有 `GENERATED.json` 的職業，站/走/受傷格改用 `LOW` 的低持角度並標 `carry`；`build_pack.py` 把它寫成 `weapon.carry`，`test-paperdoll.mjs` 的 DV2 kit 測試只在這些格跳過角度與傾角欄檢查。
- **花費**：頭 50 + 無頭測試 10 + 無頭動畫 6 + 斧頭 14 ≈ 80 generations（這次合計約 107，帳號月額 2000，剩約 1890）。
- **驗證**：`npm test`（61 + 10080 parity）、build 後 `check_anim`（flicker 8、walkSkip 0）、`check_facing`（walk/anim 0 錯）通過。對照圖 `output/dv2fmt/action-audit/berserker_pixellab_review2.png`。

### 22.6 DV2 rig at 2× with the user's PixelLab parts (2026-11-14, live for the berserker)

User decision: the rig must be DV2's exactly; the parts are separate PixelLab sprites (no cutting), sized to fit that rig. DV2's 1× parts are below PixelLab's minimum size, so the berserker runs the DV2 rig at **2×**: every DV2 offset doubled, cells doubled (body/hand 60×60 foot (30,60), head/hat 40×40 anchor (20,40), weapon 80×80). The game normalises each class to the same on-screen height (heroHeights), so 2× only means finer pixels.

Done so far:
- **Parts** (user-generated with text prompts, no DV2 input; `output/hv-parts/`): `px/` = PixelLab originals (32 px canvases), `x2/` = one-step PixelLab `/resize` to the 2× sizes (head ≈ 22×21, body ≈ 17×20, hat, fists ≈ 11–13 px). Script: scratchpad `pl/rs2x.py` (copy into pipeline/ when finishing). `export/` (the 10 px / 6–8 px versions) are unusable: shrinking 32 → 10 px wiped the outlines.
- **Rig numbers** `output/dv2fmt/work/rig2x/dv2_rig.json` (measured from the kit in memory, numbers only): per set/direct/slot `head` (off[3]), `hat` (off[2]), `woff` (weapon grip), `fists` (centres of the separate hand-layer fists, relative to the foot; empty where DV2's fists are part of the body, e.g. stand/walk), `body_bbox` (DV2 body is 12 px tall, feet 4 px above the anchor).

To do:
1. Head back view: `px/head*/north.png` show a face → PixelLab edit to the back of the head (hair only).
2. Build: berserker uses 2× atlases (`atlas_body_x2` …) and its own sebs for the `.axe` variants (all actions incl. attack_t); offsets from dv2_rig.json ×2 (head, hat, weapon grip/deg/inv/sebF, effect); hand layer = separate fist sprites at DV2's fist positions ×2 (frames where DV2 has them); body cell per slot = the user's pose parts (stand, walk_l/walk_r with DV2's stand-step-stand-step walk, windup, chop, swing, hurt, crouch, cheer, lying), placed with feet 8 px above the anchor (2× DV2) and top-centre at DV2's neck; left = mirrored right. Weapon 80×80: axe regenerated/resized at 2× DV2 axe length; effects upscaled ×2.
3. heroHeights from the 2× sheets; riding offsets ×2 (check paperdoll.js riding before).
4. Tests, build, check_anim/check_facing, review sheet. The current in-game berserker (§22.3–22.5) stays until this replaces it.

**Status (2026-11-14, done for the berserker, in the phone build):**
- `pipeline/scripts/dv2fmt/rig2x.py` (called at the end of `build_pack.build()`): 2x atlases `atlas_{body,head,hand,weapon,fx}_x2.png`; the berserker's body/head/hand skins point at them; every `<base>.axe` action (created from the base when missing, incl. attack_t) is rewritten with DV2's numbers ×2 from `pipeline/scripts/dv2fmt/dv2_rig.json`: head offset (incl. DV2's 1 px bob), weapon grip, effect offset; weapon angle/flip/column/visibility, draw order and timing stay DV2's (the 1x PixelLab marker `GENERATED.json` was retired → no own-grip / low-carry overrides for the berserker). Actions carry `rig: 2`, `meta.rig2x = {berserker: 2}`.
- Body = the user's pose part for the slot (POSE_PART: walk = stand, walk_l, stand, walk_r like DV2), collar on x = 30, moved per cell so the collar meets DV2's neck (`NECK_OVERLAP` rows under the chin); the lying body is turned neck-toward-head and tucked under DV2's ground-level head (DV2 draws the upright head next to a downed body; order gets `head`).
- Hands = the user's PixelLab fists (shrunk to ~8–10 px): the weapon fist on DV2's grip while the weapon is shown, otherwise on the arm tip; the other fist on its arm tip. Composed into `atlas_hand_x2` cells (one per distinct fist layout).
- Weapons: `weapon_axe.png` / `weapon_axe_fine.png` in `src/x2/` (PixelLab, 48 px canvas, `pixellab_weapon.py --x2`: 80×80 cells, grip (40,58) = DV2 handle ×2); `data.weapons.axe*` carry `seb: weapon2x/std`. Effects: nearest ×2 copies (`<name>@2x`).
- Everything moves down `GROUND` = 6 px (DV2 feet stand 4 px above the anchor at 1x; ours stand on it). heroHeights.berserker = 36 (2x px) → same on-screen height as the others.
- Tests extended (not loosened): geometry checks the 2x cells (60/40/80/60) exactly; P13 grip at the cell centre of whichever cell; the class×action tests pair only same-scale classes/actions (`rig`). `npm test`, build, `check_anim`, `check_facing` pass. Lineup: `output/dv2fmt/action-audit/berserker_rig2x_lineup.png`.
- Known: a weapon held high (victory) sits at DV2's grip, beyond the user's cheer pose's arm reach → fist and arm apart by a few px (as on DV2's own chibi bodies). The user's hat part is unused (the berserker wears no helmet).


## 23. 補齊 DV2 系統（Phase 6，2026-11-14，[DV2-PHASE6.md](DV2-PHASE6.md)）

推翻 DV2-ADOPTION-PLAN 決策 A3：32 組動作全部移植。對照表 [DV2-PARITY.md](DV2-PARITY.md) P19–P22、D27–D33。

**動作（G1）**：`tools/dv2-motion-derive.mjs` 的 `MAP/CELLS/TIMING` 加 17 組，同一條路（derive → `output/dv2fmt/work/apply_actions_class.py` → `build_pack.py`）。

| 動作鍵 | DV2 | af | 武器 | 1x 身體格 → 2x 姿勢部件（缺圖退回） |
|---|---|---|---|---|
| `walk_unarmed` / `idle_unarmed` | 0 歩き / 1 立ち | [4,8,12,16] / [6,12] | 不畫 | walk / stand |
| `carry_walk` / `carry` | 4 物持ち歩き / 5 物持ち立ち | [4,8,12,16] / [6,12] | 不畫 | victory1 → `carry`、`carry_walk_l/_r`（→ carry → cheer） |
| `pose` | 6 ｷﾒﾎﾟｰｽﾞ | [6] | 畫（每型別一份） | strike0 → `pose`（→ swing） |
| `cry` / `cry_sit` | 7 泣く1 / 8 泣く2 | [6,12] / [6] | 不畫；頭 `cry` | hurt → `cry`（→ hurt，第二格下沉 1 DV2 px）/ kneel → `cry_sit`（→ crouch） |
| `clap` / `give` | 9 拍手 / 10 物渡し（不循環） | [3,6] / [6,12] | 不畫 | windup → `clap0/1`、`give0`（→ windup）/ thrust → `give1`（→ swing） |
| `jump_victory` | 12 ｼﾞｬﾝﾌﾟ万歳 | [24] | 畫 | victory1 → cheer；`hop` 拋物線 1x 4 px / 2x 8 px（D30） |
| `handshake` | 13 握手 | [6] | 不畫 | thrust → aim → swing |
| `punch` / `punch2` | 18 ﾊﾟﾝﾁ / 19 ﾊﾟﾝﾁ2（頭翻轉） | [4,8,14] | 不畫；特效 `punch` | windup/thrust/strike0 → `punch0/1/2`（→ windup/swing） |
| `attack_v2` | 21 剣_縦振り2（= 20） | [2,4,6,12] | 畫 | 同 attack |
| `shoot` | 25 銃 | [4,8,14] | 畫；特效 `gunfire` | thrust → swing |
| `guard` | 26 ガード | [6] | 畫 | windup → `guard`（→ windup） |
| `petrify` | 27 石化 | [6] | 不畫；`tint: 'stone'` | stand0 → stand |

`actions.json` 的 `views[].pose` = 2x 姿勢名（沒寫 = 跟 1x `cell` 同名）。rig2x 的 `POSE_PART` 每條退回鏈最後一定加 `stand`。1x 職業不加新美術，用冒號前的既有格。
出招計時：`punch/punch2/attack_v2` release 1 / impact 2（近戰）；`shoot` release 1、沒有命中格（飛行物）。其餘是循環的生活動作。
拿武器的組（6/12/21/25/26）在 `apply_actions_class.py` 的 `NAMES` 裡，每種武器一份握點變體；弓的變體帶 `bowArt`（弓圖只有三欄）。

**武器型別（G2）**：`rapier`（RAPIR）、`spear`（SPEAR）、`gun`（GUN）、`fist`（PUNCH）。
- 連擊表照 DV2 武器表（`deriveCombos`：權重 0 = `chargeTypeSeb[chargeType]`、1 = 20（拳 19）、2 = 22、3 = 23）：細劍 5 段 / 槍 4 段 = 突き 100、縦振り 30、横振り 40；銃 3 段 = `shoot`；拳 5 段 = `punch` 100、`punch2` 40。
- 動作表：`data.typeAlias = {rapier: sword, spear: sword}`（`resolveAction` 試 `<a>.<型別>` → `<a>.<別名>` → `<a>`），gun/fist 用基底表。
- 圖：美術代理的 `src/x2/weapon_<rapier|spear|gun>[_fine].png`（2x）→ `build_pack.py` 縮成 1x 給 1x 職業（2×2 取最不透明的像素）。沒有圖：rapier 借 sword、spear 借 staff（`fallbackArt`）、gun 隱藏；`fist` 永遠隱藏。
- 職業武器不變。`lookFromHunter` 讀 `h.weaponKind`（選用；面板、之後的裝備資料用）——資料包有這把武器才換。

**特效（G3）**：derive 一律寫 DV2 特效種類 0–4（slash/hslash/thrust/punch/gunfire）；`build_pack.py` 只留資料包有圖的種類（`src/effect_punch.png`、`effect_gunfire.png` 還沒到 → 那格不畫）。

**頭與石化（G4/G5）**：表情 `cry`（1x：`head/cry` = hurt 欄；2x：`head_cry_*`，沒有退回 hurt）。石化 = `act.tint = 'stone'`（或 `state.tint`）：`computeParts` 回傳 `.tint`，`drawParts` 把整個角色畫進暫存畫布、整張套 `tintPixels`（純邏輯，node 測）再貼回；沒辦法開暫存畫布時照原色畫。

**性別（G6）**：`h.gender` 'm' | 'f'（`src/pixel-game.js`）。新獵人 `hunterGender(id)`（FNV 雜湊，**不呼叫 random()**，招募/戰鬥的隨機數序列不變）；讀檔：沒有欄位或不認得 → 'm'；存檔版本仍是 3（同 `h.mount`）。`lookFromHunter` → `look.gender`；女性頭 skin `<職業>.f`（2x：`head_f_<表情>_<view>.png`、`head_f_back.png`），沒有就是男性頭。身體共用（D28）。
順手修掉：讀檔那行 `h.mount` 的註解把 `h.trainCooldown` / `h.lastTownVisit` 一起註解掉了（Phase 5.1 起讀檔沒還原這兩個欄位），現在獨立一行（`test-pixel-game` 有測）。

**2x rig 全職業（G9）**：`rig2x.py` 的 `CLASS_TYPES` = 六個遊戲職業；`src/x2/<職業>/` 有 `body_stand_front.png` + `head_normal_front.png` 才切 2x，否則照舊 1x。
- 動作鍵：每個 1x 鍵一份 `<鍵>@2x`（`rig: 2`），**跟職業無關**：身體/手 seb 名 `body2x/{v}/<id>`、`hand2x/{v}/<id>`，`computeParts` 把 `{v}` 換成該層外觀名（= 職業），每職業自己的格（脖子位移折進 frame 的 tx/ty）。跟基底 2x 列一模一樣的 `<base>.<型別>@2x` 不出（目前 51 個 2x 列，丟掉 91 個重複）。
- `resolveAction(data, name, wt, rig)`：rig 2 只在 `@2x` 列找，`look.rig` 由 `lookFromHunter` 從 `meta.rig2x` 帶出；`actionTiming` 同樣多一個 rig 參數。
- 武器 `<id>@2x`：美術代理的 2x 圖，沒有就 1x ×2（`upscaled: true`）；`weaponFor(data, id, rig)`。盾 `round@2x` 握點用聖騎士 1x 量的副手 ×2。
- 帽子：1x 帽 ×2 → `<名>@2x`；美術帽 `src/x2/hat_<名>_<view>.png` 依每個 2x 職業自己的頭頂放（帽底在頭頂下 `HAT_SINK` = 7 列）→ `<名>@2x.<職業>`；`helmetSkin` 先找美術帽（騎士 `helm` → `iron_helm`）再找 ×2 帽。
- 2x 職業不畫 1x 護甲/披風（D32）。`hideEffects` 也藏 `<種類>@2x`。
- 弓：DV2 的弓 handle (20,33) 在弓中段下方約 13.5 px，不是握點 → 2x 美術弓的 handle = 弓中段 + `BOW_LIFT`（27），弓的列拳頭畫在弓中段。我們自加的特效（burst/arrow）在 2x = 1x 相對握點的位置 ×2、放在 2x 握點上。
- 資料包 294 KB → 737 KB（1x 動作 49 → 142 個 + 2x 列 55 個；六職業都 2x 時）。

**實驗面板**：動作清單加全部新動作與 attack_h/attack_t；`gender` 下拉、`stone tint` 勾選（任何動作套石化）、武器/帽子清單只列基本名（2x 版自動換）、資訊列顯示 rig 與頭 skin。

**遊戲接線（只接本來就有的狀態，D33）**：歡呼 → `dollVictoryAction`（每次歡呼 30% `jump_victory`，鍵 = 歡呼開始時間）；交易中/購買裝備 → `dollLifeAction` → `give`。沒有對得上的狀態（石化、ガード、物持ち、泣く、拍手、握手、ｷﾒﾎﾟｰｽﾞ）只能從動作 API / 面板播。

**驗證**：`test-paperdoll` 71 項（新：Phase 6 引擎/石化/性別/32 組/退回鏈/新武器與連擊/特效與哭臉/G9 切換/遊戲接線；fidelity P19–P22；kit motion 也比新組）。`PD_KEEP_GOING=1 node test-paperdoll.mjs` 跑完全部再列失敗。

### 23.1 2x 協調稽核（2026-11-15，output/dv2fmt/audit/FINDINGS.md）

使用者：「仔細檢查各部位是否協調沒有怪異地方」。量測 `node output/dv2fmt/audit/measure.mjs`（6 職業 × 男女 × 31 動作 × 4 方向 × 每格 = 3432 格；
新增：腳離地/穿地、武器（含盾）穿地 > 6 px，攻擊收招除外——那是 DV2 自己的握點 y −1 與角度）。修正前 922 格有旗標，修正後 0。

| # | 問題 | 原因 | 修法（`pipeline/scripts/dv2fmt/rig2x.py` 等） |
|---|---|---|---|
| 1 | 拳頭/武器浮在身體外（872 + 50 格） | DV2 握點 ×2 是量在 DV2 約 28 px 寬的 2x 身體上，我們的身體約 13 px | `hand_target`：把 DV2 的握點從 DV2 的 body_bbox 線性映到這個職業這一格姿勢部件的 bbox，再拉到離最近身體像素 ≤ `HAND_REACH`（2）。武器握點 = 拳頭中心，寫在 `parts.weapon.offBy[職業]`；`off` 仍是 DV2 ×2（資料、kit 對照用）。DV2 的角度/翻轉/欄/顯示、繪製順序、時序不動 |
| 2 | 引擎 | 列跟職業無關 | `src/paperdoll.js` `offsOf(p, look)`：武器、特效、盾、頭、帽子層有 `offBy[look.classId]` 就用它 |
| 3 | 側面全部朝左 | 裝進去的 `*_side.png`（頭、女頭、身體、拳、美術帽）都是面向左畫的，但側面不鏡像時是「右」，DV2 的武器在 +x | `SIDE_ART_FACES_LEFT`：載入時把側面圖水平翻一次（躺姿除外，`LYING_NECK` 照舊） |
| 4 | 腳穿地 2–9 px（2166 格） | 身體掛在 DV2 的脖子下，我們的部件比 DV2 的 8 px 身體高；DV2 走路的上下是頭在動 | `layout`：腳踩地（y 0），只要下巴仍蓋住身體頂端 `NECK_MIN..NECK_MAX`（2..7）列；部件太高（坐姿哭、出拳）→ 腳仍踩地、這個職業的頭往上抬（`parts.head/helmet.offBy`）；太矮 → 照舊掛在脖子下 |
| 5 | 刺客短刀跟人一樣高 | 美術短刀約 40 px | `fix_weapons2x.py`：縮到 22 px 重烘（原圖備份 `output/dv2fmt/audit/art_backup/`） |
| 6 | 弓：太高、太大、拉弓欄是傾斜的弓 | 2x 弓圖烘的是傾角欄，DV2 弓的欄是 待機/拉滿/放箭；DV2 弓的 handle 在弓中段下方 | `fix_weapons2x.py`：弓 46 → 24 px、鏡像成弓背朝目標、握點在弓中段下 2 列、第 1 欄畫拉弦+箭；`BOW_LIFT` 不再用；弓的握手 = 這個姿勢伸出去的手臂末端（`side_tip`）；`aim0/aim1` 先用 `punch1`（前手伸直到肩高、後手在下巴 = 拉弓），弓手自己的 aim ≈ stand |
| 7 | `shoot` 拿弓/劍/杖橫在身前 | DV2 銃（25）只對槍合理 | 非 gun 型別的 `shoot.<型別>@2x`：不畫武器、不畫槍火 |
| 8 | 拳的星芒、法杖光球、箭、槍火太大 | 1x 特效 ×2 長得比 2x 英雄還大 | `FX_NATIVE`：這四種在 2x 用 1x 的原尺寸；DV2 的斬擊（slash/hslash/thrust）照 ×2 |
| 9 | 出拳星芒在腳邊 | DV2 的 punch fxOff y 是地面高度 | 沒拿武器的特效放在出拳手臂末端外 `FX_FIST_PUSH`（3） |
| 10 | 法杖光球飄在頭上/蓋臉 | 1x 相對握點 ×2 對不上 2x 杖長 | `FX_AT_TIP`：burst 放在武器圖的最遠端（杖頭），跟武器一起轉 |
| 11 | 法杖底端插進地 5–11 px | 2x 杖握點下方還有 12 px | `HOLD_LOWER`：staff/holystaff 握點下移 6 列 |
| 12 | 盾在劍那一側、側面盾像一根黑棍掉到腳下 | 盾用 1x 聖騎士副手數字 ×2 | 盾心 = 副手拳頭（`parts.shield.offBy`），盾緣不低於地面（`SHIELD_HALF`） |
| 13 | 拳頭像拳擊手套（8–12 px） | 部件縮放 | `fix_fists2x.py`：× 0.72（原圖備份 `art_backup/fists/`） |
| 14 | `lineup.mjs` 很多列畫成 idle | `resolveAction` 沒帶 `look.rig`，被當重複丟掉的 `<動作>.<型別>@2x` 退回 idle@2x | 帶 `look.rig`（舊的 lineup_*.png 那幾列不可信） |

留著（DV2 的設計或美術本身，見 FINDINGS.md）：攻擊收招時刀尖低於腳（DV2 握點 y −1、90°）；背面武器畫在身體前（DV2 繪製順序）；`punch2` 背面露臉（DV2 headMirror）；
`cry` 左方向身體畫在頭上（DV2 順序）；法師的帽子再戴美術帽會疊帽（遊戲內只有聖騎士戴盔）；弓手女頭背面看得到臉頰。
