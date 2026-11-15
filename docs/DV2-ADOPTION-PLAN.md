# DV2 系統全面套用：實作計畫

狀態：**已定案（2026-11-13）**，開放問題 1–4 已由使用者回答，見 §0。

**實作狀態（2026-11-13 晚，未提交）**：Phase 0–4 全部完成（含 2.8：monsters3 去掉斜向列，WebP 0.926→0.503 MB，保留格逐格位元相同）。

**Phase 5（2026-11-14，使用者核准後實作，未提交）**：5.1 騎乘、5.2 怪物紙娃娃都已做成引擎／資料／繪製能力＋遊戲介面，沒有新玩法。細節 `docs/PAPERDOLL.md` §20、§21，對照 `docs/DV2-PARITY.md` P16–P18、D18–D25。
- 5.1：DV2 騎乘五組（16/17/29/30/31，含 `spProc: 4` RIDECHARGE2）進 `actions.json`／資料包（49→84 個動作，舊的 49 個與圖集逐位元組不變）；坐騎 = monsters3 物種，鞍點表 `assets/mounts.json`（`gen_mounts.py` 量自我們的圖）；DV2 深度 ±1、單一影子；`h.mount` 存檔欄位（舊檔 → null，版本不變）、`game.setMount`、`MOUNT_SPEED_MULT = 1.3`、倒地自動下坐騎；實驗面板坐騎選單。
- 5.2：`build_monster_pack.py` 把 22 張 monsters3 轉成單層虛擬表包 `assets/monsterdoll/`（每物種 × 8 個 SEB_M × 4 方向）＋ `computeMonsterParts`；只在 `?mdoll=1` 時畫，預設仍是 monsters3；每一格與 monsters3 逐像素相同（node 測試 22 物種、實機 21 物種 1680 格 0 差異）。
- **延後／刻意不做**：坐姿專屬美術（借 kneel/stand0）；DV2 `rideOffset_`／`SEB_H_WALK_MONSTER_SPEED`／`chargeMiss_` 沒逆向（鞍點自量、走速 1.3 自定、RIDECHARGE2 只做「坐騎同步蓄力→出手」）；騎乘跳躍、`STATE_RIDE_MOVEAIR`、馬影、取得坐騎的玩法與 UI、立繪上的坐騎；`?doll=off` 的騎乘只是 sheet 英雄站在鞍點上；怪物臉部圖／光環／影子動畫；怪物包不當預設。
- **深度規則的方向對照（請確認）**：交辦寫「右/下 −1、左/上 +1」；DV2 規則是套在 DV2 的 direct 上，而我們的 left 借 d2（DV2 的 DOWN），所以實作是 **上 +1、右/下/左 −1**（左右鏡像一致）。要照字面改成左 +1，只要改 `src/paperdoll.js` 的 `RIDE_DEPTH` 一行與 fidelity P17。
- 騎乘者被坐騎蓋住只露頭的問題已修：鞍點改量「騎乘者那幾欄的背線」，`mounts.json` 加 `hip`；新測試「坐騎不會埋掉騎乘者」（全物種 × 4 方向，遮蓋 ≤40%、背線以上 ≤15%）。截圖 `output/dv2fmt/phase5/`。
- 可騎物種收斂成 6 種四足坐騎（boar/goat/mole/ram/scorpion/stag）：站騎（騎乘者站在狼人等雙足魔物頭頂、不拿武器）畫面不合理，改標不可騎（`RIDEABLE`、DV2-PARITY D26）。
**驗證（2026-11-14）**：`npm test` 通過（test-paperdoll 55 項）；`npm run verify` 22 項中 21 項 PASS，Z2B 那次失敗（「建造沒蓋出學院」）發生在另一個代理同時重 build 的時段，單獨重跑 `z2b-econ.mjs` 272 項全過；`check_anim` 60 秒 exit 0（閃格 12／5123，門檻 0.5%；畫面內受擊 139/141）；`check_facing` exit 0（英雄走路錯 0）。
先前 `verify` 的 5 項舊失敗（FIX-B／FIX-C／Z1／桌面＋手機按鈕爬行）已另外修好：部分是檢查過時（改對齊 Z2A／Z2C 設計），部分是真 bug（toast 勾號對比、橫向任務面板被藏、建築詳情 HUD 底距、出戰切換鈕被固定列蓋住、任務鈕 aria-label 被拿掉）。
⚠️ 另一個 session 在 2026-11-14 04:47 起改 `dv2fmt.py`（`WEAPON_COLS = 4`）等管線檔，武器來源圖還沒跟上，所以 `build_pack.py --check` 目前報 `axe_double size (80,40) != (160,40)`；已出貨的 `paperdoll.json` 不受影響、測試全過。
`check_anim` 已修正量測：只判 0.4 秒內有畫到的受擊實體，鏡頭外另列 `hitsOffscreen`。
§7 兩個殘留問題採建議案：盔甲用 `<set>.<class>` 字串鍵（缺就退回 `<set>`）；斜向輸入取主軸、相等（10% 內）維持上一方向。
刻意偏離：AI 瞄準的投射物（含疾風箭）仍直飛目標，不量化成 4 軸（量化會落空、削弱弓手）；路線行走維持原到達時間（斜段在畫面上最多快 √2 倍），近身移動維持原速。
3.2 不需試點：7 職業 body／hand／head 本來就各自一張（§1「同一張 AI 圖」的基線已過時）。細節見 `docs/PAPERDOLL.md` §19、`docs/DV2-PARITY.md`。
範圍：暮影村把 DV2 紙娃娃系統「吃得完整」的工程計畫（不含新玩法設計）。
依據：`docs/PAPERDOLL.md`（引擎與格式）、`sprites/DV2_FORMAT_SPEC.md`（美術格式）、
`pixelfx/tmp/dv2-port/AUDIT.md`（引擎位元級比對）、dv2-lab 逆向規格（`docs/00-REPORT-角色與裝備動畫系統.md`）。

---

## 0. 決策紀錄

| 項 | 決策 | 理由／後果 |
|---|---|---|
| **A3** 補 DV2 專屬動作組（石化／握手／万歳／騎乘…） | **不做** | 暮影村動作分類是 ARPG；DV2 那 12 組是生活／坐騎動作，玩法用不到。 |
| **C3** 8 方向獨立美術 | **改成「遊戲改為 4 方向」** | 美術量不變（仍只需 back／side／front 三視圖 + 鏡像），但資料列 8→4、`pickRow` 斜向回退消失、與 DV2 1:1 對齊。 |
| **開放問題 1：怪物也改 4 方向** | **要** | 怪物朝向判定統一成 4 方向；`assets/monsters3` 的 8 方向 sheet 只使用其中 4 組（斜向 4 組變成未使用資產，可選修剪以省下載量）。 |
| **開放問題 2：left 借哪個 DV2 方向** | **借 d2（正面左下）的動作數字** | `DV2_DIR` 4 方向版 = `[0, 1, 1, 2]`（up→d0、right→d1、down→d1、left→d2）。left 的**美術**仍是 side 視圖鏡像，但**武器角度／翻轉／顯示**用 d2 的數字，不用 d1 鏡像。 |
| **開放問題 3：盔甲** | **每職業一套（後者）** | 3 套（leather／plate／mantle）× 7 職業 = **21 張 300×300**。⚠️ 這使盔甲必須等 Phase 3 職業分岔之後才有意義（共用輪廓時每職業一套是重複的），且需要「class-aware skin 解析」。 |
| **開放問題 4：4 方向範圍** | ~~連移動一起改~~ → **2026-11-15 改：只有動畫 4 方向，移動可斜走** | 原決定：輸入、移動向量、AI 朝向、碰撞、投射物全部 4 方向。2026-11-15 使用者：「允許斜走，90度分界分四個象限，每個象限一個動畫方向」→ 移動/輸入/投射物回到直線，動畫方向 = 畫面向量的 90° 象限（規則見 PAPERDOLL.md §19「移動與動畫方向」、DV2-PARITY.md D17）。 |
| A1／A2／A4／B1–B5／C1／C2 | 進入本計畫 | 見 §2；C2 仍建議不做。 |
| D1–D4 | 不做 | 見 §6。 |

### 決策帶來的三個連鎖效應（重要）

1. **盔甲工作從 Phase 1 移一部分到 Phase 3**：Phase 1 只做「管線與 class-aware 解析」，Phase 3 分岔後才重生 21 張。
2. **怪物 4 方向不是「重畫」而是「只採 4 組」**：sheet 已烘好，改的是朝向邏輯與選列；資產修剪是選配。
3. **移動改 4 方向會動到兩個 high-risk 檔案**（`pixel-world.js`、`pixel-game.js`），依 AGENTS.md 需走 MODEL-ROUTING tier C／Opus 級審查。

---

## 1. 現況基線（可驗證）

| 項目 | 現況 | 來源 |
|---|---|---|
| 引擎 | `src/paperdoll.js` 22,838 B，SHA-256 `F52305EC…`（與 pixelfx `gallery/dv2/paperdoll.js` 位元相同） | AUDIT.md A |
| 資料包 | `assets/paperdoll-dv2/paperdoll.json` 255,215 B；49 actions × **8** 方向列；405 sebs | pack 實測 |
| 外觀 | body／hand／head 各 **7** skin；helmet 1；weapon 12 + shield 1；effect 3；**armor 0、cape 0** | pack 實測 |
| 美術來源 | 7 職業的 body／hand／head 全部來自**同一張 AI 圖**，只靠調色盤分色 | AUDIT.md C |
| 未完成美術 | `darkknight` 三張仍 `placeholder: true` | `meta.placeholder` |
| 圖集 | `atlas_body/hand/head/hat/weapon/fx.png` 約 91 KB，**沒有** `atlas_armor` | 目錄實測 |
| 怪物 | `assets/monsters3` 22 種 × 26 actions × **8 方向**、cell 102、heroHeight 72 | `kobold.json` 等 |
| 8 方向依賴（引擎） | `paperdoll.js`：DIR8×12、pickRow×4、dir8to4×3、斜向名×7、dir/facing×29 | grep 實測 |
| 8 方向依賴（遊戲） | `pixel-world.js`：斜向名×12、dir/facing×84（**最重**）；`pixel-game.js`：斜向名 0、dir/facing 3（移動用向量，量化即可）；`paperdoll-hero.js`：DIR8×1、dir/facing×9 | grep 實測 |
| 8 方向依賴（測試／面板） | `test-paperdoll.mjs`：dir8to4×9、DIR8×10、pickRow×5；`paperdoll-lab.js`：dir8to4×2、DIR8×9 | grep 實測 |

**高風險檔案**（AGENTS.md 硬規則 6）：`src/pixel-game.js`、`src/pixel-world.js`。

---

## 2. 階段規劃

### Phase 0 — 4 方向轉換的設計凍結（1 天；本文件已完成大部分）

**0.1 方向對照表（已凍結）**

| 我們的 4 方向 | 繪製視圖 | 鏡像 | DV2 動作數字來源 | head/hat 幀 |
|---|---|---|---|---|
| up | back | 否 | d0（背面） | 0 back |
| right | side | 否 | d1（正面右側像） | 1 face |
| down | front | 否 | d1（正面） | 1 face |
| left | side | 是 | **d2（正面左下）** | 1 face（鏡像） |

⇒ `DV2_DIR = [0, 1, 1, 2]`；`DIRS = ['up','right','down','left']`；`BACK = {0}`；`MIRROR = [1,0,3,2]`。

**0.2 影響面盤點（已列於 §1 最後四列）**：`pixel-world.js` 是主戰場（84 處 dir/facing），`paperdoll.js` 次之，`pixel-game.js` 只需把移動向量量化成 4 軸。

**0.3 待辦**：把「8 方向存檔欄位 → 4 方向」的 migration 規則寫成測試（見 §4）。

**驗收**：本節表格 + §1 清單 + 一條 migration 測試。

### Phase 1 — 管線與便宜項（3–4 天，可與 Phase 0 並行）

| # | 工作 | 落點 | 驗收 |
|---|---|---|---|
| 1.1 | **A1 armor 管線（class-aware）**：`gen_armor.py` 支援 `--class`，產出 `armor_<set>_<class>.png`（先只用共用輪廓跑一輪驗證管線）；`build_pack.py` 從 `SKIP_PLACEHOLDER_KINDS` 移除 `"armor"`；`skins.armor` 用 `<set>.<class>` 鍵；`lookFromHunter` 組 key | `pipeline/scripts/dv2fmt/gen_armor.py`、`build_pack.py`、`src/paperdoll.js`（解析） | 穿甲可見；21 張的產線可一鍵重跑；`npm test`、`verify:quick` |
| 1.2 | **A2 cape 圖層**：`dv2fmt.py` kind 清單加 `cape`、`cape_<name>.png`（300×300 同 body 格）、`skins.cape`、atlas | `dv2fmt.py`、`build_pack.py` | 披風可見且繪在 body 之前 |
| 1.3 | **A4 對齊文件 + 保真度測試** | `docs/DV2-PARITY.md`、`test-paperdoll.mjs` | 測試綠燈；文件有「已對齊／刻意不同／未移植」三欄 |

⚠️ **1.1 的視覺結果在 Phase 3 之前是重複的**（七職業共用輪廓），所以 1.1 的驗收標準是「管線與解析正確」，不是「七職業各有不同盔甲」。

### Phase 2 — 4 方向落地（6–8 天；2.3／2.7 走 high-risk 審查）

| # | 工作 | 落點 | 風險 |
|---|---|---|---|
| 2.1 | 資料：`actions.json` 8→4 列；`dv2-motion-derive.mjs` 的 `DIRS`/`DV2_DIR`/`BACK` 改 4 方向並重推；`build_pack.py` 重生 pack | `pipeline/scripts/dv2fmt/actions.json`、`tools/dv2-motion-derive.mjs`、`assets/paperdoll-dv2/` | 低 |
| 2.2 | 引擎：`paperdoll.js` 4 方向化（`DIR4`、`pickRow` 去斜向、`MIRROR=[1,0,3,2]`、`dir8to4` 標 deprecated） | `src/paperdoll.js` | 中 |
| 2.3 | 移動：輸入 8 向 → 4 軸量化（規則見 §7 殘留問題 2）、移動向量、AI 朝向、碰撞、投射物 | **`src/pixel-game.js`**、**`src/pixel-world.js`** | **高（tier C）** |
| 2.4 | 怪物 4 方向：朝向判定、`walkUpRight/…` 等 12 處斜向名改 4 向、sheet 選列 | **`src/pixel-world.js`** | **高（tier C）** |
| 2.5 | UI／面板：lab 3×3 方向盤→十字、strips 8 向條→4 向條 | `src/paperdoll-lab.js`、gallery 頁 | 低 |
| 2.6 | 測試：392 組 computeParts 改 4 方向；新增「4 方向 × 49 動作 × 每 slot 每層都畫得出」＋怪物 4 方向選列測試 | `test-paperdoll.mjs`、`test-pixel-game.mjs` | 中 |
| 2.7 | 文件同步：`PAPERDOLL.md` §5/§7、`DV2_FORMAT_SPEC.md` §4、`ANIMATION_SPEC.md` | `docs/`、`sprites/` | 低 |
| 2.8 | **選配**：修剪 `monsters3` 未使用的 4 組斜向列（PNG 重切 + json y 位移重算），量測下載量節省 | `assets/monsters3/`、`pipeline/scripts/` | 中（要逐格驗證） |

**驗收**：`npm test`、`npm run verify:quick`、`npm run verify`（桌面＋手機按鈕爬行）；hero 與怪物都只朝 4 方向；斜向鍵不再產生斜向移動或斜向動畫。

### Phase 3 — 職業分岔 + 盔甲落地（4–7 天美術 + 2 天接線）

| # | 工作 | 落點 | 備註 |
|---|---|---|---|
| 3.1 | **B5** `darkknight` 去 placeholder（body／hand／head） | `assets/paperdoll-dv2/src/`、`sources.json` | 低風險，先做 |
| 3.2 | **B1** 每職業自己的 body／hand／head；先做 **2 個職業試點**（berserker + sorcerer） | `pipeline/scripts/dv2fmt/` 產線 | 每職業 3 張（body 300×300、hand 300×300、head 140×40） |
| 3.3 | **盔甲 21 張**：`gen_armor.py --class <c>` × 3 套 × 7 職業，逐職業驗證貼合（±1 px 輪廓內） | `gen_armor.py`、`assets/paperdoll-dv2/src/` | 依賴 3.2；每職業一套後盔甲才真正有意義 |
| 3.4 | class-aware skin 解析的資料模型定案（`<set>.<class>` 鍵 vs 引擎加 `classId`） | `src/paperdoll.js`、`paperdoll.json` | 見 §7 殘留問題 1 |

**為什麼這是真正的「完整套用」缺口**：DV2 是 89 種身體／120 種頭／71 種帽子；暮影村現在是「一張圖 × 7 個調色盤」。

### Phase 4 — 內容擴充（每項獨立，可隨時插入）

| # | 工作 | 量 | 驗收 |
|---|---|---|---|
| 4.1 | **B2** 帽子多樣化（現只有 `helm`） | 每頂 20×60（back／side／front 3 格），要能套所有職業頭 | lab 換帽截圖 |
| 4.2 | **B3** 武器多樣化（現 12 把；DV2 91 把、4 種握持 profile、大武器 50×60） | 每把 80×40（2 格 40×40，握把 x 在中線） | lab 攻擊幀截圖 + 握把樞軸落在 art 內 |
| 4.3 | **B4** 特效多樣化（現 3 種） | 每種 120×60（4×2 格 30×30，欄=方向、列=sebF） | lab 攻擊特效截圖 |

### Phase 5 — 需另行核准

| # | 工作 | 估時 | 建議 |
|---|---|---|---|
| 5.1 | **C1** 騎乘系統 | 1–2 週 | 有坐騎玩法才開 |
| 5.2 | **C2** 怪物紙娃娃（單層 4×4 虛擬表） | 2–3 週 | **不建議**（現有 monsters3 已是烘好 sheet；除非要怪物換色／換部件） |

---

## 3. 依賴與里程碑

```
Phase 0 (凍結對照表)
   ├─> Phase 1 (armor 管線 / cape / 對齊文件)   ← 可並行
   └─> Phase 2 (4 方向：資料→引擎→移動→怪物→測試)
          └─> Phase 3 (職業分岔 → 21 張盔甲)
                 └─> Phase 4 (帽子/武器/特效)
                        └─> Phase 5 (騎乘/怪物紙娃娃，需核准)
```

- **M1**（Phase 0+1）：盔甲管線可跑、披風可見、對齊文件可驗證。
- **M2**（Phase 2）：hero 與怪物都是 4 方向、移動 4 軸、測試全綠。
- **M3**（Phase 3 試點）：2 職業視覺分岔成功 → 決定是否全做 + 盔甲 21 張。
- **M4**（Phase 4 一批）：外觀選項增加。

---

## 4. 風險登錄

| 風險 | 影響 | 對策 |
|---|---|---|
| `pixel-world.js`（84 處 dir/facing）＋ `pixel-game.js` 是 high-risk | 動畫狀態機、AI、戰鬥、存檔回歸 | tier C／Opus 級審查；改前先寫「8→4 行為對照」測試；分小批提交 |
| 移動改 4 軸改變手感 | 玩家覺得卡 | 斜向鍵取主軸（規則待定，§7-2）；必要時先做「移動仍 8 向、只播 4 向動畫」的過渡版（與決策 4 不符，需你同意才用）。**2026-11-15 使用者同意並改成這個做法**（可斜走、動畫 4 象限） |
| 怪物 sheet 仍 8 方向 | 若修剪失敗會位移錯格 | 修剪前後逐格 diff（`head` 陣列與 y 位移一起驗） |
| 存檔方向欄位 0–7 | 舊檔朝向錯誤 | migration：0→up、1→right、2→down、3→left、4→up、5→down、6→down、7→left；寫成測試 |
| 盔甲 21 張依賴職業分岔 | 順序錯了會白做 | 3.1 → 3.2 → 3.3 嚴格照序 |
| 美術產能 | 卡住 | 先 2 職業試點；l0veyou 配額用完就停（AGENTS.md 硬規則 4） |
| 版權 | 不能用 DV2 素材 | 只套格式與動作數字；kit 只在測試時從外部絕對路徑讀（`PAPERDOLL.md` §0） |

---

## 5. 驗收指令（每個 Phase 都跑）

```powershell
npm test                                             # 5 個 suite（含 test-paperdoll）
npm run verify:quick                                 # ~2 分鐘
npm run verify                                       # ~5–8 分鐘；動到 UI／按鈕時必跑
npm run build                                        # 寫 ../../outputs/暮影村.html 與 media/
node pipeline/scripts/dv2fmt/build_pack.py --check    # pack 與產生器一致
```

只 stage 自己的檔案，不用 `git add -A`；沒有使用者說「推」就不要 push（AGENTS.md 硬規則 2、3）。

---

## 6. 明確不做

| 項 | 理由 |
|---|---|
| A3（DV2 12 組生活／坐騎動作） | 本輪決策不做；與 ARPG 動作分類不符 |
| D1 `.opt` 虛擬表壓實 + atlas hint | DV2 為省 VRAM；暮影村 6 張 atlas 才 91 KB |
| D2 `gameFlag` 位元表情／`spProc` 位元旗標 | 現有資料化欄位更好維護 |
| D3 固定 6 部位數字 id | 具名圖層是超集 |
| D4 直接搬 DV2 素材 | 版權硬規則（`PAPERDOLL.md` §0） |

---

## 7. 殘留問題（動工前只剩兩個）

1. **class-aware skin 的編碼方式**：`skins.armor` 用 `<set>.<class>` 字串鍵（不改格式、最省事，建議）還是引擎加 `state.classId` 讓 `computeParts` 解析（乾淨但要動引擎與格式）？
2. **斜向鍵的 4 軸量化規則**：`(1,1)` 這種輸入要算 up、right、還是「最後按下的軸優先」？（建議：主軸優先，相等時維持上一個方向，避免抖動。）
