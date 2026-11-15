# DV2 Phase 6 — 補齊完整 DV2 系統與素材（2026-11-14，/goal）

使用者目標：「http://127.0.0.1:8731/chara.html 是完整 DV2 系統，把暮影村缺少的部分補足，缺少的素材也補齊，可以用 PixelLab 和 Muse」。
這推翻 `DV2-ADOPTION-PLAN.md` 決策 A3（「DV2 生活動作不做」）：這一輪要做。

版權規則不變（`PAPERDOLL.md` §0）：DV2 只拿**系統與數字**（動作組結構、af、slot、武器角度/翻轉/顯示、繪製順序、錨點位移），
**美術全部原創**（PixelLab / Muse 從文字生，不拿 DV2/開羅的圖當參考、init image 或調色盤）。kit 的檔案不進 repo。

## 1. 差距清單（以 8731 的 DV2 kit 為準，2026-11-14 量）

| # | DV2 有 | 暮影村現況 | Phase 6 處理 |
|---|---|---|---|
| G1 | 32 個動作組 | 有 15 組（2,3,11,14,15,16,17,20,22,23,24,28,29,30,31） | 補 17 組：0 歩き、1 立ち、4 物持ち歩き、5 物持ち立ち、6 ｷﾒﾎﾟｰｽﾞ、7 泣く1、8 泣く2、9 拍手、10 物渡し、12 ｼﾞｬﾝﾌﾟ万歳、13 握手、18 ﾊﾟﾝﾁ、19 ﾊﾟﾝﾁ2、21 剣_縦振り2、25 銃、26 ガード、27 石化 |
| G2 | 8 種武器型別 SORD/WAND/BOW/AX/RAPIR/GUN/PUNCH/SPEAR | sword/dagger/axe/staff/holystaff/bow(+shield) | 加 rapier（RAPIR）、spear（SPEAR）、gun（GUN）、fist（PUNCH，不畫武器）；動作變體 `<base>.<type>`、連擊表照 DV2 weapon 資料 |
| G3 | 5 種武器特效（縱、橫、突、拳 3、槍火 4） | slash/hslash/thrust(未接)/burst/arrow | 接上 thrust（N8）；加 punch、gunfire |
| G4 | 8 個頭 seb（normal talk smile sleep sleepMouth surprise stone cry2） | normal blink hurt shout happy ko | 加 `cry`（泣く1/2 用）；stone = 石化色調（G5） |
| G5 | 石化：專用身體格 + stone 頭 | 無 | 引擎層「石化」灰階色調（所有圖層、所有職業、所有裝備都適用），身體用 stand |
| G6 | 男/女外觀（imgId、faceId） | 無性別 | `h.gender`（'m' 預設 / 'f'）＋外觀解析：女性頭部件 `head_f_*`，缺就退回男性；身體共用（刻意不同，省素材） |
| G7 | 53 職業 | 6 職業（+ 舊 id darkknight/warrior） | **不加職業**（職業是暮影村玩法設計）；記成刻意不同 |
| G8 | 帽子 71 頂、頭 120、身體 89、武器 91 | 帽 4（1x）、每職業一套頭身、武器 18 | 每職業一套頭身（2x 全職業）、新武器型別各一把普通 + 精良、帽子補一組（2x，所有職業可戴） |
| G9 | 全部職業同一套 rig 尺寸 | 只有狂戰士在 2x rig，其他 5 職業還是 1x（AI 圖逐格生，軀幹會扭） | 5 職業全部改 2x rig + PixelLab 部件（`DV2-RIG-PROMPTS.md`） |

## 2. 介面合約（系統代理與美術代理都照這個）

### 2.1 新身體姿勢部件（2x，`assets/paperdoll-dv2/src/x2/<職業>/body_<姿勢>_<view>.png`，view = back/side/front）

| 姿勢檔名 | DV2 格 | 用在 | 部件描述（給 prompt） | 系統缺圖時退回 |
|---|---|---|---|---|
| `carry` | 0..3,4/5（站） | 物持ち立ち | 雙手舉過頭頂、像頂著一個箱子，雙腳併攏 | `cheer` |
| `carry_walk_l` / `carry_walk_r` | 物持ち歩き | 物持ち歩き 第 1/3 格 | 同 carry，左/右腳在前 | `carry` → `cheer` |
| `pose` | 4,0 | ｷﾒﾎﾟｰｽﾞ | 帥氣定格：一手插腰、一手握武器往前斜舉，重心在後腳 | `swing` |
| `cry` | 4,2 / 5,2 | 泣く1（兩格，第二格同圖下沉 1px 由 rig 做） | 站著、雙手腕舉到臉前（擦眼淚），肩膀縮起 | `hurt` |
| `cry_sit` | 5,0 | 泣く2 | 坐在地上、雙腿往前伸、雙手腕在臉前 | `crouch` |
| `clap0` / `clap1` | 4,1 / 5,1 | 拍手 | 雙手腕在胸前分開 / 合在一起 | `windup` |
| `give0` / `give1` | 4,3 / 5,3 | 物渡し | 雙手腕捧在胸前 / 雙手往前伸出遞東西 | `windup` / `swing` |
| `punch0` / `punch1` / `punch2` | 4,4 / 5,4 / 6,4 | ﾊﾟﾝﾁ、ﾊﾟﾝﾁ2 | 拳擊架式（雙手腕在下巴前）/ 前手直拳伸直到肩高 / 後手勾拳、身體扭轉 | `windup` / `swing` / `swing` |
| `guard` | 7,4 | ガード | 身體壓低、雙手腕交叉擋在臉前 | `windup` |

不用新圖的組：0/1（徒手走/站 = walk/stand、不畫武器）、12 ｼﾞｬﾝﾌﾟ万歳（cheer + DV2 的跳躍位移）、13 握手（`aim`，沒有就 `swing`）、
21（= 20）、25 銃（`swing` 前手伸直肩高；後座力那格同圖）、27 石化（stand + 灰階色調 G5）。

### 2.2 頭

- 新表情 `cry`：`head_cry_side.png`、`head_cry_front.png`（淚珠從眼角流下、嘴角往下、眉毛八字）。缺圖退回 `hurt`。
- 女性頭（G6）：`head_f_<表情>_<view>.png`、`head_f_back.png`，表情跟男性同一組（normal blink hurt shout happy ko cry）。缺圖退回男性。

### 2.3 武器（2x，`assets/paperdoll-dv2/src/x2/weapon_<名>.png`，跟 `weapon_axe.png` 同規格：48px 畫布、直立、柄朝下，`pixellab_weapon.py --x2` 烘欄）

新：`rapier`、`rapier_fine`、`spear`、`spear_fine`、`gun`、`gun_fine`。拳（fist）不畫武器。
各職業自己的武器（2x 版）：`sword(_fine)`（聖騎士）、`dagger(_fine)`（刺客）、`staff(_fine)`（法師）、`holystaff(_fine)`（祭司）、`bow(_fine)`（弓手；休息/拉滿/放箭三欄）。

### 2.4 特效（1x DV2 格式 120×60：4 欄方向 × 2 列 sebF，30×30 格；rig2x 會自動做 @2x）

新：`assets/paperdoll-dv2/src/effect_punch.png`（拳的衝擊星芒）、`effect_gunfire.png`（槍口火光 + 煙）。

### 2.5 帽子（2x，`assets/paperdoll-dv2/src/x2/hat_<名>_<view>.png`，view = back/side/front，內容約 22×12–16，帽底對齊頭頂）

一組 6 頂：`leather_cap`、`iron_helm`、`feather_hat`、`straw_hat`、`bandana`、`crown`。

### 2.6 檔案歸屬（兩個代理不要碰對方的檔）

- **美術代理**：`output/phase6/**`（工作區、審圖）、`pipeline/scripts/dv2fmt/parts2x/**`、`assets/paperdoll-dv2/src/x2/**`（**每個職業整套通過自審後才一次複製進去**）、
  `assets/paperdoll-dv2/src/effect_punch.png`、`effect_gunfire.png`、各 `SOURCE.md`、本文件 §4 美術紀錄。不跑 `npm run build`。
- **系統代理**：`src/**`、`tools/**`、`pipeline/scripts/dv2fmt/*.py|json`（rig2x、build_pack、dv2fmt、actions.json、dv2_rig.json…）、`test-*.mjs`、
  `assets/paperdoll-dv2/paperdoll.json` 與圖集（build_pack 產出）、`docs/PAPERDOLL.md`、`docs/DV2-PARITY.md`、本文件 §3 系統紀錄。

## 3. 系統紀錄（系統代理寫）

2026-11-14（系統代理，未提交）。細節 `PAPERDOLL.md` §23，對照 `DV2-PARITY.md` P19–P22、D27–D33。

| # | 狀態 | 做了什麼 |
|---|---|---|
| G1 | 完成 | 17 組進 derive（`MAP/CELLS/TIMING`，`'<1x 格>:<2x 姿勢>'`）→ actions.json 142 個動作；資料包 32/32 組；2x 姿勢退回鏈照 §2.1（`POSE_PART`，最後一定 stand）；`dv2_rig.json` 本來就量了 32 組 128 列，不用補 |
| G2 | 完成 | rapier/spear/gun/fist：連擊表照 DV2 武器表、`typeAlias`、沒圖的退回（rapier→sword 圖、spear→staff 圖、gun 隱藏、fist 永遠隱藏）、2x 圖自動縮 1x；`h.weaponKind` |
| G3 | 完成（等圖） | thrust 已接（突き）；punch/gunfire 接在 ﾊﾟﾝﾁ/銃 的 DV2 特效 slot，`effect_punch.png` / `effect_gunfire.png` 一進 src 重建就畫 |
| G4 | 完成 | 表情 `cry`（1x = hurt 欄；2x `head_cry_*` 沒有就 hurt） |
| G5 | 完成 | `tint: 'stone'` + `tintPixels`，所有圖層、所有職業 |
| G6 | 完成 | `h.gender`（存檔加法欄位、舊檔 'm'、新獵人 id 雜湊不擲骰）、`head_f_*` → `<職業>.f`、面板切換；身體共用 |
| G7 | 刻意不做 | D29 |
| G9 | 完成（系統） | 六職業都會在部件裝好時切 2x；2x 列跟職業無關（`{v}` seb）；2x 武器/帽/盾；目前 berserker、paladin 是 2x |

**2026-11-15 第二輪（美術代理裝好五職業 2x 套組、2x 武器、6 頂帽子、effect_punch/gunfire 之後）**：
- 重建：六職業全部在 2x rig（`meta.rig2x` 六個）；heroHeights archer 34 / sorcerer 35 / priest 35 / paladin 35 / berserker 36 / assassin 37（2x px）；帽子 40 個 2x skin（6 美術帽 × 6 職業 + 4 頂 1x 帽 ×2）；武器 23 把 2x；資料包 737 KB。
- 修：**2x 弓畫在腳邊**——DV2 弓的 handle (20,33) 不是握點，是在弓中段下方約 13.5 px；美術的 2x 弓握點在 (40,58)。`rig2x.py` 的 `BOW_LIFT = 27`：2x 美術弓 handle = 弓中段 + 27，弓的列（`<a>.bow@2x`）拳頭放在弓中段（handle 往上 27，跟著弓轉）。
- 修：**法杖技能的 burst 在 2x 飄在頭上**——我們自加的特效（burst/arrow，DV2 沒有）在 2x 改成「1x 時相對握點的位置 ×2，放在 2x 握點上」。
- 看過（node 算部件 + Python 合成的審圖，`computeParts` 同一份資料）：弓 待機/拉滿/放箭欄與 aim/aim_full、法師/祭司 cast/cast_high + burst、聖騎士劍 + 盾（背/正面可見、側面是側邊）+ 鐵盔、刺客短刀 突き、六頂帽子戴在各職業頭上。已知：DV2 的握點離我們身體的手臂末端幾 px（§22.6 的已知限制，弓手拉弓、待機持劍最明顯）。
- **遊戲內英雄現在不是畫這個包**：另一個 session（約 22:28）把 `src/pixel-world.js` 的英雄渲染換成 HeroLoom（`src/heroloom-hero.js`、`assets/heroloom`，docs/HEROLOOM.md）。DV2 包只在 `?doll=1` 實驗面板與 node 測試裡用；`check_anim`/`check_facing` 量到的是 HeroLoom（`base: media/heroloom/`）。這一輪的 check_anim 失敗（walkSkip 28、flicker 17）與 check_facing 的 heroWalkBad 27–40（`DOLL=off` 是 0）都來自那條路徑，不是 Phase 6 的改動。要讓 Phase 6 的成果出現在遊戲裡，需要協調者決定用哪個渲染器。

**美術端還要給的**：archer/sorcerer/priest/assassin 的 `src/x2/<職業>/`（至少 `body_stand_front` + `head_normal_front`，完整清單 §2.1 + `DV2-RIG-PROMPTS.md`）；各職業 2x 武器（沒有時用 1x ×2，粗）；`weapon_rapier/spear/gun(_fine).png`；`effect_punch.png`、`effect_gunfire.png`；帽子 `hat_<名>_<view>.png`；`head_cry_*`、`head_f_*`；Phase 6 姿勢部件（carry/pose/cry/cry_sit/clap/give/punch/guard，缺的現在走退回）。
**請美術端看一下**：目前裝進去的 `src/x2/paladin/` 有幾張看起來不對——`body_windup_side.png`、`body_stand_side.png` 是兩個分開的人形，`body_hurt_side.png` 兩側有像翅膀/劍的大塊；因為 paladin 已經自動切到 2x，遊戲裡會直接看到。

## 4. 美術紀錄（美術代理寫）

### 4.1 美術代理紀錄（2026-11-14/15）

**方法（最後定案）**：`pipeline/scripts/dv2fmt/parts2x/phase6.py`（職業描述表＋prompt＋finish/QA/sheet/install）、`weapons2x.py`、`extras2x.py`（帽、特效）。全部只用文字 prompt，沒有 DV2/開羅圖當參考。
1. 每個職業每個視角先用 pixflux 32×32 從文字生 **一張基底**：`body_stand`（south/east/north）、`head_normal`（south/east）、`head_back`、拳頭。
2. 其他姿勢、表情、女性頭、`cry` 頭**全部用 PixelLab edit-image 從同視角的基底改**（"same headless chibi body, now <pose>, same outfit and colours …"）→ 衣服/配色/無頭都跟基底一致。第一輪「每個姿勢各自從文字生」會漂成不同角色（聖騎士板甲、弓手），已全部丟棄（`output/phase6/<職業>/raw_old*`）。
3. **無頭身體**：文字生無頭身體只在「最上面有一個蓬鬆毛領」時穩定（狂戰士的奶油毛領就是這個）。所以聖騎士＝深棕毛領、弓手＝奶油羊毛領（去掉箭袋的箭，有箭一定畫出頭）、法師＝奶油毛領、祭司＝白毛領金邊、刺客＝淺灰毛領；原設計的其餘衣服顏色照 DV2-RIG-PROMPTS §2。
4. 縮小：**不用 PixelLab /resize**（1 generation/張、會加色雜訊），改用本機「面積眾數＋外框優先」縮放（`downscale()`），一個職業同一種部件用同一個倍率（頭 ≈0.80–0.83、身體 ≈0.68–0.72，和狂戰士的 x2 同尺寸：頭內容 ≈22×21、站姿身體 ≈13×20）。頭另外 `trim_chin()` 去掉下巴下的小碎肉。
5. **自動 QA**（`phase6.py qa|qaheads`，裝之前必過）：每個姿勢對同職業同視角的 stand：恰好 1 個連通塊（忽略 <6 px）、bbox 高 ±30%（lying/crouch/cry_sit/guard/cheer/carry 放寬到 ±45%）、色盤 ≥72% 的像素在 stand 色盤 36 內、頭頂沒有膚色塊（毛領本身是奶油色的職業 archer/sorcerer/berserker 略過這項，改用目視）。頭：1 個連通塊、bbox ±25%、色盤 ≥70%。再看接觸表。
6. lying 側視：自動翻轉成頸端在左（`rig2x.LYING_NECK = left`，所有職業一致）。弓手 walk_l/walk_r 用 stand 程式化做（stepping 腿抬 1 px、側面再移 1 px），因為 edit 版本一直變成別的角色。

**單次呼叫成本（量測）**：pixflux 32×32 = 1 generation；edit-image（pixen，約 20–60 秒）= 1；pixflux＋init_image 也是 1 但只會複製基底（strength 600），不能用；/resize = 1；edit-image 完全保留設計、姿勢真的會變，所以選它。pixflux 48×48 武器 = 1。

**裝進 `assets/paperdoll-dv2/src/x2/<職業>/`（每職業 body×3 視角、head×(7 表情×2)、head_f×(7×2)、head_back、head_f_back、fist×2；SOURCE.md 已寫）**

| 職業 | 已裝 | QA | 旗標 |
|---|---|---|---|
| paladin | P1 全姿勢＋thrust、P2 全 14 個（carry…guard）、cry 頭、女頭 | 身體 70/70、頭 1 例色盤 0.59（happy front，張嘴牙齒色） | head_hurt_front 因為連兩次畫出身體碎片，換 seed 後頭髮較亂；body 毛領是「大塊深棕」，直立時像一圈毛領，蹲/揮砍時像披肩 |
| archer | P1（無 lying 以外缺項）＋aim/aim_full、P2 全 14、cry、女頭 | 73/73；女頭側面高 25（馬尾，目視正常） | **aim/aim_full ≈ stand**（生成器畫不出前伸的手；弓由武器層表現）；chop_back 用 swing_back 代替（三次嘗試都畫成別的角色）；walk_l/r 是程式化；手臂膚色偏粉 |
| sorcerer | P1＋cast/cast_high、P2 全 14、cry、女頭 | 66/72，6 例色盤 0.60–0.71（淡紫陰影漂移，目視同一件長袍） | 帽子占頭很大，臉小，表情差異很小；cast ≈ stand |
| priest | P1＋cast/cast_high、P2 全 14、cry、女頭 | 68/73：色盤 4 例、guard_front 膚色塊 8 px | cast_high / cheer / cry 類編輯後長袍偏灰（不是白）；chop/swing/crouch 比 stand 胖 |
| assassin | P1＋thrust、P2 全 14、cry、女頭 | 58/70，皆為「舉起的手露膚色」誤判（目視是手套/手） | 男頭 happy/ko 面罩下露出嘴；女頭 edit 版帶紅色光暈，已用 `fix_red_outline()` 清掉；carry_walk_l 側面粉色手 |
| berserker | **只新增**（既有檔未動，md5 驗證）：P2 全 14（`body_carry…guard`）、cry 頭、女頭＋head_f_back | 42/42 | 側面/背面的底圖是原 hv-parts 的 stand，背面偏膚色；SOURCE.md 沒改 |

- 武器（`weapons2x.py` → `pixellab_weapon.py --x2 --install`）：sword/dagger/staff/holystaff/bow/rapier/spear/gun 各＋`_fine` 共 16 個已裝（`weapon_<name>.png`）。弓的 draw/release 版本（edit-image）在 `output/phase6/weapons/raw/bow*_draw|release.png`，**沒烘進去**（rig 沒有對應的欄）。旗標：`gun`/`gun_fine` 不是直立（槍管斜上，握把在下），握點由 `--grip-from-bottom 4`；普通劍與普通弓第一版太淡，已重生（sword 1、bow 1＋2 個 edit）。
- 特效：`assets/paperdoll-dv2/src/effect_punch.png`（星芒；4 欄方向相同，第二列縮小變暗）、`effect_gunfire.png`（槍口火光；PixelLab 連槍管一起畫了，已把槍管去掉；4 個方向由一張旋轉/翻轉）。旗標：gunfire 偏小、形狀不規則。
- 帽子 6 頂 × 3 視角（`hat_<name>_<view>.png`，22 寬、10–13 高）：PixelLab 畫帽子會連頭一起畫，所以只留上面一截（`CUT` 表）；`bandana_front` 底緣還有幾個膚色像素。
- **沒有安裝的備用**：無（P2 全部都裝了）。**沒有做**：頭戴帽子版本的各職業對位、`_fine` 弓的三欄。
- 用量：本工作共約 915 generations（起 1298 → 剩 383；最初的 900 預算上限由協調者放寬）。浪費最大的是第一輪逐姿勢文字生成（paladin 31＋重做 31、archer 34＋34）與無頭問題的試驗。
- 審圖：`output/phase6/<職業>/review_poses_1|2.png`（頭蓋在每個姿勢 × back/side/front 的身體上，×4）、`review_heads.png`、`raw_body*.png`（32 px 原圖）；全職業頭：`output/phase6/review_heads_all.png`；武器 `output/phase6/weapons/review_baked*.png`；帽 `output/phase6/hats/review.png`；特效 `output/phase6/fx/review*.png`。
- 先前被你搬走的 `src/x2/paladin`（19:31 前就存在，非本代理安裝，prompt 為板甲版）備份在 `output/phase6/_removed_from_src/paladin_pre_existing/`；現在的 paladin 是新方法的套組。

## 5. 主對話整合與驗證（2026-11-15）

- **渲染器衝突**：另一個代理（commit `ac6d722`，分支 `experiment/heroloom`）把遊戲預設英雄渲染器換成 HeroLoom，並拿掉 DV2 實驗面板。Phase 6 不改那個預設，只加**可選開關**：
  - `?doll=dv2`（或 `dv2:paladin,archer`）：遊戲英雄改用 DV2 包（`src/pixel-world.js` 依網址選 `paperdoll-hero.js` 的 provider；其他值照舊 HeroLoom）。
  - `?dv2lab=1`：DV2 實驗面板（`src/pixel-ui.js`）。
  - 檢查腳本：`DOLL_QS=doll=dv2 node pipeline/scripts/check/check_anim.mjs`（`check_facing.mjs` 同），網址多帶一個參數。
- **主對話補修**：archer 女性正面頭 4 張紅色描邊 → 改成該頭的外框色（備份 `output/phase6/_halo_fix_backup/`）；槍 `gun`/`gun_fine` 原圖斜 57°，旋轉成直立、縮到比劍短、重描 1px 外框後重烘（`output/phase6/weapons/upright_fix/`）；`effect_punch` 星芒 23×28 → 15×18（比法杖光小）。
- **Muse**：2x 頭試過（`output/muse-test/dv2test/x2/`），格式對但畫質明顯比 PixelLab 差，這輪素材全部用 PixelLab。
- **驗證（DV2 渲染器）**：`build_pack.py --check` OK；`npm test` 全過（test-paperdoll 72 項、kit 對照 10080 case / 32 組）；`npm run build` OK；
  `DOLL_QS=doll=dv2` 的 `check_facing` exit 0（heroWalkBad 0）、`check_anim` exit 0（walkSkip 0、flicker 7、命中 76/76）；
  實機（headless）`?doll=dv2` 村莊截圖 `output/dv2fmt/phase6-review/ingame_dv2.png`，六職業 2x 新美術、0 錯誤；`?dv2lab=1` 面板 31 動作 / 6 職業 / 12 帽 / 24 武器 / 性別。
- **未決（使用者決定）**：遊戲預設要用 DV2 包還是 HeroLoom。HeroLoom 預設下 `check_anim` 失敗（walkSkip 28、flicker 17，系統代理量）。
- PixelLab 餘額約 381 / 2000（本輪約 917 generations）。
- **全系統驗證（2026-11-15）**：`npm run verify` 22 項全部通過（`output/dv2fmt/phase6-review/verify_full2.log`）。前一輪的 Z2B 失敗是檢查腳本的競態：
  握著舊的 ElementHandle 去點「做滿」，面板每 400ms 重畫後元素已脫離 DOM；改成用選擇器點（`tools/checks/z2b-econ.mjs`），單跑兩次 272/272。
  `verify:quick` 先前的「出征 HUD」「Z2D」失敗單跑都過（當時美術代理與其他工作同時在跑，屬負載造成的偶發）。
- **預設渲染器（2026-11-15，使用者未回覆、未提交，可一行改回）**：工作區把遊戲預設改回 DV2 包（`src/pixel-world.js` 的 `dollDv2`）；HeroLoom 實驗改用 `?doll=loom`（或 `loom:<職業>`）。
  無參數下 `check_facing` exit 0（heroWalkBad 0）、`check_anim` exit 0（walkSkip 0、flicker 7）；headless 村莊截圖 `ingame_default.png`（DV2）、`ingame_loom.png`（HeroLoom 仍可用、0 錯誤）。
- **DV2 預設下全系統驗證**：`npm run verify` 22 項全部通過（`output/dv2fmt/phase6-review/verify_full3.log`，含 npm test 11 項）。

## 6. 2x 協調稽核（2026-11-15）

使用者：「仔細檢查各部位是否協調沒有怪異地方」。measure.mjs 3432 格：修正前 922 格有旗標 → 0（加了腳/武器穿地檢查後仍 0）。
修了：每職業握點（手在手臂上、武器在手上）、側面美術全朝左 → 載入時翻、腳穿地、短刀縮小、弓重做欄位與尺寸、非槍的 shoot、2x 自加特效尺寸與位置、盾、拳頭縮小、lineup.mjs 解析錯誤。
美術檔改動（PixelLab 0 次）：`src/x2/weapon_dagger(_fine)/bow(_fine).png`（`fix_weapons2x.py`）、`src/x2/<職業>/fist_*.png`（`fix_fists2x.py`），原圖在 `output/dv2fmt/audit/art_backup/`。
細節與留下的項目：`PAPERDOLL.md` §23.1、`DV2-PARITY.md` D34–D38、`output/dv2fmt/audit/FINDINGS.md`。
