# DV2 對齊表（紙娃娃系統 vs DV2 參考規格）

狀態：2026-11-13，對應 `docs/DV2-ADOPTION-PLAN.md` Phase 1.3（A4）；2026-11-14 加上 Phase 5（騎乘 C1、單層怪物紙娃娃 C2：P16–P18、D18–D25、N6/N7 移出）；
2026-11-14 Phase 6（`docs/DV2-PHASE6.md`，補齊 DV2 系統：P19–P22、D27–D33，N1/N8 移出）。
範圍：`src/paperdoll.js` 引擎、`assets/paperdoll-dv2/` 資料包、`tools/dv2-motion-derive.mjs` 動作表，跟 DV2 紙娃娃（Kairosoft《冒險村物語 2》反組譯規格與 dv2-lab kit 參考渲染器）比。
規則：只對齊**系統與數字結構**，不搬素材（`docs/PAPERDOLL.md` §0 版權硬規則）。

**怎麼驗**：`node test-paperdoll.mjs`（在 `npm test` 裡）。

- 「已對齊」每一列的 ID（P1…）在 `test-paperdoll.mjs` 的 **`DV2 fidelity`** 測試裡都有一個同名檢查。測試會讀這份文件，**少一個檢查或多一個沒寫進文件的檢查都會失敗**。
- 有 kit 的機器另外跑兩個逐筆對照：
  - `paperdoll parity`：10080 case，computeParts 對 kit 的 `dv2-paperdoll.js`。
  - `motion structure matches the DV2 kit`：我們的 4 方向 × 每個動作 × 每 slot 對 kit 的動作組。

## 已對齊

| ID | 項目 | DV2 | 暮影村 | 驗證 |
|---|---|---|---|---|
| P1 | 時間表 | `af` = 累計結束時間，超過總長循環 | `getSlot(af, tick)` 同語意，負數/小數/超大 tick 也對 | fidelity P1 + 單元測試 |
| P2 | 逐 slot 陣列 | 超出長度重複最後一項 | `at(arr, slot, dflt)` | fidelity P2 |
| P3 | 方向 | 4 方向（0 背、1 右、2 正、3 左），頭/帽每方向一格 | 4 方向，同索引；資料每動作 4 列 | fidelity P3 |
| P4 | 頭部翻轉 | `SPPROCTYPE_HEAD_2F_INVERSION`：方向重映射 `[1,0,3,2]` | `MIRROR = [1,0,3,2]`，`headMirror` 動作 | fidelity P4 + kit parity |
| P5 | 武器幀 | `sebF * 2 + inv` | 同 | fidelity P5 + kit parity |
| P6 | 武器旋轉 | 以握把為樞軸：左上角 = 原點 + R(deg)·(trans − handle)，順時針 | `weaponCorner` / `drawParts` 同公式 | fidelity P6（§8.5 兩個算例） |
| P7 | 特效 | `sebF * 方向數 + dir`，不旋轉 | 同（DV2 包 `effectDirs = 4`） | fidelity P7 + kit parity |
| P8 | 武器原點修正 | `ox + (下/左 ? 1 : 0)`、`oy + 3` | 預設 `DV2_WEAPON_ORIGIN = {dx:[0,0,1,1], dy:3}`（資料可覆寫，見 D6） | fidelity P8 |
| P9 | 武器顯示 | `ball` = 0 不畫武器 | `show[slot] = 0` | fidelity P9 + kit motion |
| P10 | 繪製順序 | 每列一個順序，`-1` 不畫 | `order`（可逐 slot），`null` 不畫 | fidelity P10 + kit motion |
| P11 | 換動作 | `ChangeSeb`：動作 tick 歸零、全域計數不動 | `setAction` / `advance` | fidelity P11 |
| P12 | sprite 定址 | `[u,v,w,h,tx,ty,ru,rv]`，trans 相對錨點、ru/rv 翻轉 | 同；圖集來源 = skin 原點 + (u,v) | fidelity P12 |
| P13 | 圖格規格 | BODY/HAND 30 格（腳底 15,30）、HEAD/HAT 20 格（錨點 10,20）、武器 40 格（握把 x = 20）、特效 30 格 4 欄 | `dv2fmt.py` 同尺寸；包內每格檢查 | fidelity P13 |
| P14 | 動作結構 | 每組動作的 slot 數、af、loop、每格武器角度/翻轉/顯示、前後順序、特效 slot | `tools/dv2-motion-derive.mjs` 從 kit 推出（只寫衍生數字） | kit motion 測試（kit 在本機才跑）；fidelity P14 檢查 4 列 + `dv2.set` 來源 |
| P15 | 左方向的數字 | DV2 的左側是 d3（側面 + `ru` 鏡像） | 我們的 left 用 d3 的武器角度/翻轉/顯示（`const DV2_DIR = [0, 1, 2, 3];` 1:1 對照；舊的 `[0, 1, 1, 2]` 是 8 向時代讓 down 借 d1 的權宜，會讓正面收招時劍垂到腳邊），美術是側面鏡像 | fidelity P15 + kit motion |
| P16 | 騎乘動作組 | 乗る_座る 16、乗る_立つ 17、乗る_攻撃_座る 29、乗る_攻撃_立つ 30、乗る_攻撃2 31（spProcType RIDECHARGE2 = 4） | `ride_sit` / `ride_stand` / `ride_charge_sit` / `ride_charge_stand` / `ride_charge2`（+ 每種武器變體）：slot 數、af、loop、武器方向/翻轉/顯示（16/17/29/30 不畫武器、31 第 0 格不畫）、繪製順序都從 kit 推；`spProc: 4` 記在資料 | fidelity P16 + kit motion |
| P17 | 騎乘深度 | `Proc_updateDrawDepth`：騎乘者深度 = 坐騎深度 + (direct 為 RIGHT/DOWN ? −1 : +1) | `RIDE_DEPTH`：同一條規則套在每個方向借用的 DV2 direct（`DV2_DIR4 = [0,1,1,2]`）⇒ 上 +1（騎乘者在前）、右/下/左 −1（在後）；只有坐騎投影 | fidelity P17 |
| P19 | 動作組 32/32 | 32 組（歩き…乗る_攻撃2） | 全部進包：Phase 6 補 0 `walk_unarmed`、1 `idle_unarmed`、4 `carry_walk`、5 `carry`、6 `pose`、7 `cry`、8 `cry_sit`、9 `clap`、10 `give`、12 `jump_victory`、13 `handshake`、18 `punch`、19 `punch2`、21 `attack_v2`、25 `shoot`、26 `guard`、27 `petrify`；af/loop/ball/順序/特效 slot/頭部翻轉照 kit（拿武器的組每種武器一份握點變體） | fidelity P19 + kit motion（新組也逐 slot 比）+ Phase 6 測試 |
| P20 | 武器型別 8 種 + 連擊 | SORD WAND BOW AX RAPIR GUN PUNCH SPEAR；`chargeType` → 基本攻擊組（chargeTypeSeb 20/24/23/20/25/18）、`chargeNumMax_`、`chargeSelectRate_`（第 1 個權重 = 20，拳 = 19）；PUNCH spProcType 2 = 不畫武器 | 型別 sword/dagger(SORD) axe staff/holystaff bow + **rapier spear gun fist**；`combos[型別]` 從 DV2 武器表推（細劍/槍：突き 100、縦振り 30、横振り 40；銃：銃 100；拳：ﾊﾟﾝﾁ 100、ﾊﾟﾝﾁ2 40）；`fist` 是 hidden 武器 | fidelity P20 + Phase 6 G2 測試 |
| P21 | 武器特效種類 | 0 縱、1 橫、2 突、3 拳、4 槍火 | `slash` `hslash` `thrust`（突き 23）`punch`（ﾊﾟﾝﾁ 18/19）`gunfire`（銃 25）都接在 DV2 用它的 slot；資料包沒有那張特效圖時那格不畫（不會壞） | fidelity P21 + kit motion（特效 slot） |
| P22 | 哭臉 | head seb 7 cry2（泣く1/2） | 表情 `cry`：`cry`/`cry_sit` 的頭用 `head/cry`；1x 頭沒有哭臉欄 → 同 hurt 欄；2x 頭有 `head_cry_*` 才用、沒有退回 hurt | fidelity P22 |
| P18 | 單層怪物 | 每隻一張「4×4 虛擬表」、單一圖層、`SEB_M_*`（WALK…DIE 8 個）動作、方向 = 選列 + 鏡像 | `assets/monsterdoll/`：一個 `body` 圖層、動作鍵 `<物種>/<SEB_M>`、每動作 4 列（上/右/下/左）；同一個 `computeParts`（`computeMonsterParts`） | fidelity P18 + 怪物包像素比對 |

## 刻意不同

| ID | 項目 | DV2 | 暮影村 | 為什麼 |
|---|---|---|---|---|
| D1 | 盔甲/頭盔 | 不上身 | `armor`、`helmet` 層都畫 | 裝備要看得到 |
| D2 | 圖層 | 固定 6 個數字 id | 具名圖層 + `kind` | 加新部位不改程式 |
| D3 | 沒列到的層 | 無 | `follows` 借 seb/位移、`attach` 自動插到錨點旁 | 加一件裝備不改每列資料 |
| D4 | 披風 | 無此層 | `cape`（`attach.before = body`），重用 body 的 seb | 迷霧村自加的背影層 |
| D5 | 盾 | 無 | `shield` 是 `kind:"weapon"`，握在副手 | 聖騎士 |
| D6 | 武器原點 | 寫死 +1/+3 | 資料化；DV2 包用 `{dx:[0,0,0,0], dy:0}` | 我們的握點直接量在自己的圖上 |
| D7 | 大武器/拳套 | `spProc` 位元 | 武器的 `seb` 覆寫、`hidden` | 同機制，不綁位元旗標 |
| D8 | 表情 | `gameFlag` 位元 | `state.face` + 動作的 `headSeb`（`head/<表情>` seb） | 資料化 |
| D9 | 頭部翻轉的條件 | 參考渲染器用 `s.tick >= 1` | `globalTick >= 1` | 我們把動作 tick 與全域 tick 分開；對照測試把兩個設成一樣時結果一致 |
| D10 | 動作名 | 日文 set id | 暮影村動作名 + `<動作>.<武器型別>` + aliases + 方向字尾容錯 | 遊戲直接丟 `attackDown` |
| D11 | 出招計時 | 無 | `releaseSlot` / `impactSlot` + `actionTiming` | 暮影村的出招計時合約 |
| D12 | 盔甲外觀 | — | 每職業一套：`skins.armor["<套>.<職業>"]`，沒有就退回 `<套>` | 決策（開放問題 3） |
| D13 | 美術 | DV2 原圖 | 暮影村原創圖、握點與脖子位置量自我們的圖 | 版權 |
| D14 | 下方向 | DV2 沒有純正面 | 2026-11-14 已改：down 直接用 d2 的數字（美術仍是正面格），`DV2_DIR = [0,1,2,3]` | kit motion（`idle d2 slot0: weapon flip` 就是這樣抓到的） |
| D15 | 特效種類 | 縱/橫/突/拳/槍火 | DV2 的五種見 P21；另外 `burst`（法杖施法，DV2 沒有）、`arrow`（遊戲內隱藏，遊戲自己畫箭） | 職業設計 |
| D16 | 座標 | `origin` 在渲染器裡 | `computeParts` 一律相對腳底，`drawParts` 才放大 | 純邏輯可在 node 測 |
| D17 | 移動 | 等角格 4 個斜向（世界軸） | 2026-11-15 起：移動是直線（可斜走）；**動畫**方向 = 畫面向量的 90° 象限（中心在畫面上下左右、邊界在畫面對角線，走路 10° 遲滯；`src/dir4.js` `QUADRANT_OFFSET_DEG`/`FACING_HYSTERESIS_DEG`）。（2026-11-13～15 曾是「畫面 4 軸移動、斜路線走階梯」，使用者要求允許斜走後撤回） | 我們的美術是背/側/正三視圖，畫面軸才對得上；使用者：「允許斜走，90度分界分四個象限，每個象限一個動畫方向」 |
| D18 | 騎乘身體格 | 騎乘有自己的身體格（坐姿、rideCharge_sit…） | 「坐」用我們的 `kneel`、「站」用 `stand0`；乗る_攻撃2 四格都是 `kneel`（DV2 也是同一格、只有武器動） | 我們沒有坐姿美術；不畫新圖（腿被坐騎蓋住，見 D19） |
| D19 | 鞍點 | `MonsterData.rideOffset_` + `Set_liftMoveInfo` | `assets/mounts.json`（`gen_mounts.py` 在我們的 monsters3 圖上量騎乘者那幾欄的背線；騎乘者腳在背線下 `hip`（坐 5、站 1）個騎乘者 px，背線乘坐騎縮放、hip 乘騎乘者縮放）；坐騎走路的上下起伏用 sheet 的 `head` 欄；測試保證坐騎蓋住騎乘者 ≤ 40%、軀幹/頭 ≤ 15% | `rideOffset_` 沒有逆向出來；量自我們自己的圖 |
| D20 | 坐/站的選擇 | 由資料決定（未逆向） | 四足（`archetype: quad`）坐、其他站，`gen_mounts.py` 的 `SEAT` 可覆寫 | 保守規則 |
| D21 | 騎乘走速 | `SEB_H_WALK_MONSTER_SPEED`（數值未逆向） | `MOUNT_SPEED_MULT = 1.3`（`src/pixel-game.js`），路線/後撤/手動操控都乘 | 數值是我們定的 |
| D22 | spProcType RIDECHARGE2 | 用 `data_rideChargeData` 覆蓋 seb、`chargeMiss_` 決定蓄力段 | 記成 `spProc: 4`；執行期意義 = 坐騎跟騎乘者同步：騎乘者 release 之前坐騎播 SEB_M charge（蓄力格）、之後播 charge2（出手格）（`mountMotion`） | `chargeMiss_` 分支沒有逆向，不移植 |
| D27 | 石化 | 專用身體格 + stone 頭 seb 6 + 帽 seb 2 | 身體 stand、頭 normal，`act.tint = 'stone'`：引擎把整個角色（所有圖層、任何裝備）畫進暫存畫布再整張套 `tintPixels` 灰石色調 | 不用新美術、所有職業與裝備都適用（G5） |
| D28 | 性別 | 每個角色自己的 imgId/faceId（男女各一套圖） | `h.gender`（'m' 預設 / 'f'，新獵人由 id 雜湊決定、不擲骰）；女性只換頭（`head_f_*` → skin `<職業>.f`，沒有就用男性頭），**身體共用** | 省素材；舊存檔一律 'm'，看起來跟以前一樣（G6） |
| D29 | 職業數 | 53 職業 | 6 職業（+ 舊 id darkknight/warrior）；**不加職業** | 職業是暮影村的玩法設計（G7） |
| D30 | ｼﾞｬﾝﾌﾟ万歳 的跳躍 | 程式做（set 12 只有 1 格、資料沒有位移） | `act.hop`：整段一個拋物線，1x 4 px、2x 8 px（我們的數字） | DV2 的跳躍沒有逆向 |
| D31 | 新武器型別的動作表 | 每把武器自己的 seb、角度表 | rapier/spear 借 sword 的握點表（`typeAlias`），gun/fist 用基底表；連擊與攻擊動作組照 DV2（P20） | 沒有用這些武器的職業可量握點；職業武器不變（不改玩法） |
| D32 | 2x rig 職業的部位 | 身體/手/帽子/頭/武器/特效 | 2x rig 的職業（部件裝好的）畫 DV2 部位 + 盾（1x 圓盾 ×2）；1x 護甲/披風不畫（對不上 2x 身體）；帽子 = 美術帽量在該職業頭上，或 1x 帽 ×2；2x 弓的 handle 在弓中段（2026-11-15 起，D34；原本 `BOW_LIFT`） | 同 D1 的例外：沒有 2x 護甲美術 |
| D33 | 生活動作的觸發 | 村裡各種事件 | 只接遊戲裡本來就有的狀態：交易中/購買裝備 → `give`、歡呼 → 30% `jump_victory`；`petrify` `guard` `carry*` `cry*` `clap` `handshake` `pose` `punch*` `shoot` 只能從紙娃娃動作 API 與實驗面板播 | 不發明新玩法 |
| D34 | 2x 握點與手（2026-11-15） | 握點 = DV2 身體上的手位置 | 每職業每格：DV2 握點從 DV2 body_bbox 映到我們這格部件的 bbox、拉到手臂上（`rig2x.hand_target`）；弓 = 伸出手臂的末端；`parts.<武器/特效/盾>.offBy[職業]`，`off` 保留 DV2 ×2 | 我們的 2x 身體寬約 13 px，DV2 約 28 px：照抄的手浮在身體外 3–12 px（PAPERDOLL §23.1） |
| D35 | 身體與地面、頭的位置（2026-11-15） | 身體格內含腳、頭位移 | 腳踩地、下巴蓋身體頂 2–7 列；部件太高時抬這個職業的頭（`parts.head/helmet.offBy`） | 我們的部件比 DV2 高，掛在 DV2 脖子下會穿地 2–9 px |
| D36 | 非槍的 銃（2026-11-15） | 銃 set 25 | `shoot.<非 gun>@2x` 不畫武器與槍火 | 弓/劍/杖橫舉在身前不合理 |
| D37 | 自加特效大小（2026-11-15） | — | punch/burst/arrow/gunfire 在 2x 用 1x 原尺寸；burst 放杖頭 | ×2 比 2x 英雄還大 |
| D38 | 側面美術方向（2026-11-15） | 側面朝右 | 裝好的 `*_side.png` 全朝左畫 → 載入時翻一次（`SIDE_ART_FACES_LEFT`） | 美術生成的方向跟 DV2 相反 |
| D26 | 可騎物種 | DV2 由 monster 表決定哪些能騎（含站騎） | 只開 6 種四足坐騎（boar/goat/mole/ram/scorpion/stag）；站騎物種標 `rideable: false` | 站在雙足/植物魔物頭頂又不拿武器，畫面不合理 |
| D23 | 騎乘時的其他姿勢 | — | 受擊/歡呼/走路 = `ride_<seat>` 循環（閃光照舊）；倒地一律自動下坐騎（`h.mount = null`） | DV2 沒有騎乘中的受擊/歡呼列 |
| D24 | 怪物包時間 | 20 tick/s，幀時 🟡 推論 | `tickRate: 200`（5 ms），af 照 monsters3 的 75/100/120/200 ms 幀時，一格不差 | 我們的魔物動畫節奏不能變 |
| D25 | 怪物虛擬表/實體圖 | 4×4 表 + `.opt` 打包；列 = {走背、走正、動作背、動作正} | 4 列 = 上/右/下/左（我們的 monsters3 每方向都有烘好的列，左邊有烘好的 Left 列就用、沒有才鏡像），欄 = 該動作的格；實體圖 = 不重複格裁到外框後排進一張圖；**只在 `?mdoll=1` 時畫**，預設仍是 monsters3 | 計畫標 C2「不建議當預設」；保留格與 monsters3 逐像素相同 |

## 未移植

| ID | 項目 | 理由 |
|---|---|---|
| N1 | ~~DV2 的生活動作組~~ | 2026-11-14 Phase 6 推翻決策 A3、全部移植（P19、D27、D30、D33） |
| N2 | `.opt` 虛擬表壓實 + atlas hint | DV2 省 VRAM 用；我們的圖集很小 |
| N3 | `gameFlag` 表情位元、`spProc` 位元旗標 | 用資料欄位取代（D7、D8） |
| N4 | 固定 6 個數字部位 id | 具名圖層是超集（D2） |
| N5 | DV2 素材本身 | 版權 |
| N6 | ~~騎乘~~ | 2026-11-14 Phase 5.1 移植（P16、P17、D18–D23）。還沒移植：騎乘跳躍拋物線（`rideMonsterJumpA/_Height`）、`STATE_RIDE_MOVEAIR`、馬影 `HORSESHADOW_OFFPOS`、載具 `VEHICLE_DRAWDATA`、取得坐騎的玩法（範圍外） |
| N7 | ~~魔物紙娃娃（§M）~~ | 2026-11-14 Phase 5.2 移植成可選渲染（P18、D24、D25），預設仍是 monsters3 sheet。沒有：怪物臉部圖（`faceIconSeb_`）、光環 `auraSize_`、影子動畫 `shadowFrame_`（都未逆向） |
| N8 | ~~突刺特效（DV2 type 2）~~ | 2026-11-14 已接在 突き(23)（`attack_t`，§22）；Phase 6 連拳/槍火一起列成 P21 |
| N9 | 外觀數量（DV2 89 身體/120 頭/71 帽） | 內容量，見計畫 Phase 3/4 |
