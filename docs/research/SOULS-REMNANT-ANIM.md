# Soul's Remnant:角色動作與裝備動畫拆解(唯讀研究)

> 對象:`C:\Program Files (x86)\Steam\steamapps\common\Soul's Remnant\`(2025-09/10 版)。
> 全程唯讀:沒有解包、沒有安裝工具、沒有執行遊戲,也沒有把任何遊戲素材複製進本專案。
> 內文標記 **【實證】** = 直接讀到的事實(路徑、檔名、位元組);**【推論】** = 由命名/程式邏輯推出來、沒有 100% 確認的部分。

---

## 0. 摘要(給排規格的人)

1. 引擎是 **Godot 4**,素材全部封在 `Soul's Remnant.pck`(186 MB);`.pck` 的目錄索引是**明文路徑**,所以檔名清單可以完整讀,但圖檔本身是 `CompressedTexture2D`(`GST2` 標頭可讀,含寬高)。
2. 角色是 **紙娃娃分層**,但分層方式和暮影村現在的方向不同:本體是「動作 = 一條橫向 strip」的**單一朝向**(64×64/格),左右靠 `scale.x` 鏡像,**沒有 8 向、沒有烘好的鏡像列**。
3. **裝備層幾乎不逐幀對齊**:每件裝備只有一張 **64×64 靜態圖**,SpriteFrames 裡只有一個 `default` 動畫。會動的部分靠( a )身體 sheet 本身、( b )程序化的布料/頭髮骨鏈(FABRIK「Spine」)。
4. 武器是**獨立 sprite 節點**,用「每種武器類型一組 offset/旋轉 profile」貼到手部點上,而不是把武器畫進身體 sheet。
5. 待機只有 **1 格**(呼吸起伏交給程式),`run` / `attack` / `roll` / `throw` 才有多格 strip。

---

## 1. 安裝目錄盤點【實證】

| 檔案 | 大小 | 說明 |
|---|---|---|
| `Soul's Remnant.exe` | 104 MB | Godot 4 匯出執行檔(非 .NET) |
| `Soul's Remnant.pck` | 186 MB | 全部遊戲資源 |
| `discord_game_sdk.dll` / `discord_game_sdk_binding.dll` | 3.4 MB / 432 KB | Discord Rich Presence |
| `libgodotsteam.windows.template_release.x86_64.dll` | 2.4 MB | GodotSteam(Steam 版) |
| `steam_api64.dll` | 316 KB | Steamworks |
| `options.txt` | 8 KB | 使用者設定,**JSON 明文** |
| `CustomSounds/README.txt` | 524 B | 玩家自訂掉落音效資料夾(上限 5 MB / 30 秒) |

- 總計 296 MB。**沒有任何 `data/` 資料夾、沒有 `www/`、沒有散落素材檔**;全部在 `.pck` 內。
- `.pck` 檔頭:magic `GDPC`,其後版本欄位為 `4` / `4.7` / `0`,`pack_flags = 2`;封包內含一個 GDExtension 描述,`compatibility_minimum = 4.1`。**【實證】**
- `options.txt` 是本作**唯一**明文設計線索,直接暴露了幾個系統:`max_animated_characters`(預設 20)、`max_fps` 60、`atmospheric_effects`、`other_player_skills_visibility`、`weapon_element_effects`、`skill_effect_outline`、`combat skill / gathering skill` 分頁、`build_tool_*`(有建造模式)、`control_mode`、`damage_number_style`。`language` 目前是 `zh-Hant`。**【實證】**

---

## 2. 素材取得方式與打包格式【實證 / 推論】

- `.pck` 目錄索引含**明文相對路徑**(例如 `Sprites/Player/player_roll_strip6.png.import`),所以檔名、資料夾結構可全盤讀出;`.import` 檔本身也被包進去,裡面是 `importer="texture" / type="CompressedTexture2D"` 的 remap 記錄。**【實證】**
- 貼圖是 Godot 4 的 `.ctex`(`GST2` 標頭:`magic + version + width(u32) + height(u32)`),因此**寬高可以直接讀**,不用解圖。**【實證】**
- 腳本(`.gd`)在 pcK 內是**明文 GDScript**,可直接讀;但**識別字被混淆**(`rVu2klP`、`CaEM9kI`、`z_jole9` 這種),`class_name` 與 `@export` 名稱則保留。`Scripts/` 內的類別更像「有語意」的命名,`Scenes/` 內的邏輯幾乎全混淆。**【實證】**
- 場景/資源是二進位 `PackedScene`/`Resource`,屬性名與外掛資源路徑是**明文**,但數值(每秒格數、track 時間)在二元段裡。**【實證】**
- 我**沒有**可靠的「pck 目錄 offset → 檔案」對映(索引欄位對齊對不上:伺服的 2651 筆 md5 全部驗不過,某些 offset 會落到檔案中段)。所以本報告的尺寸**一律改用另一種可自檢的方法**:在封包裡找該貼圖自己的 remap 字串 `path="res://.godot/imported/<name>.png-<md5>.ctex"`,再取**它前面最近一個 `GST2`**,並要求兩者之間**沒有别的 `res://.godot/imported/` 字串、也沒有第二個 `RSRC`**(代表那個標頭是這個檔自己的 payload,不是鄰居的)。這方法用 8 個檔逐一驗過、能自我印證。**【實證:方法】** 
- 推論:專案內部路徑是 `res://Sprites/...`、`res://Resources/...`,`Sprites/Items/Database` 這種分法說明**資料驅動**(物品/裝備/外觀都是 `.tres` 定義)。

素材數量(索引可讀到的下限):`.ctex` 851、`.scn` 174、`.res` 546、`.import` 895、`.gd` 174 以上、`.gdshader` 10。

---

## 3. 命名慣例與單格尺寸(最重要的一節)【實證】

命名只有三種型態:

| 型態 | 例子 | 意思 |
|---|---|---|
| `<name>_<action>_stripN.png` | `player_roll_strip6.png`、`player_throw_strip3.png`、`player_attack_upward_strike_strip5.png` | 橫向連續 N 格 |
| `<name>-Sheet.png` | `Acceptance_Idle-Sheet.png`、`player_heavy_strike-Sheet.png` | 網格/舊版 sheet(命名不一致,有些其實還是 strip) |
| `<name>-icon.png` | `shoe_iron_armored_boots-icon.png` | **16×16** UI 圖示 |

尺寸量測結果(讀 `GST2` 標頭):

- **角色單格固定 64×64**,同一動作橫向排列,**沒有留 gap、沒有 padding**。**【實證】** 以下數字全部用 §2 的自檢法量到,自檢法條件不成立的不列或標「待驗」。
- 交叉驗證:檔名裡的 `stripN` 是繪圖者寫的、寬度是我量的,兩者獨立;四組全對上(順帶確認單格真的是 64):

| 檔案 | 寬×高 | 幀數 | 檔名說的 |
|---|---|---|---|
| `player_roll_strip6.png` | 384×64 | **6** | 6 ✔ |
| `player_throw_strip3.png` | 192×64 | **3** | 3 ✔ |
| `player_attack_heavy_air_strip5.png` | 320×64 | **5** | 5 ✔ |
| `player_attack_upward_strike_strip5.png` | 320×64 | **5** | 5 ✔ |
| `player_attack_air.png` | 320×64 | **5** | — |
| `player_attack_1.png` / `_2.png` | 448×64 | 7 | — |
| `player_attack_3.png` | 320×64 | 5 | — |
| `player_run.png` | 384×64 | 6 | — |
| `player_idle.png` | 64×64 | 1 | — |
| `player_attack_heavy_strip6.png` | **768×64** | 12 格? | **6(不一致)** |

- `player_attack_heavy_strip6.png`:寬度 768 是量到的(兩種掃法一致),但 **12 格 還是 6 格×2 列無法判定** —— 格數存在 `SpriteFrames` 裡,不在圖上。**【實證:寬度 / 推論:格數】**
- **裝備、頭髮、臉、眼、嘴:幾乎全部是 64×64 單張**。用自檢法量 612 張非 icon 的裝備/髮/臉貼圖:**565 張 = 64×64**,其餘 47 張是 16×16 或寬 192–3328 的特例 strip。**【實證】**
- ⚠️ **`Sprites/Player/New/` 那批寬度只有 10–21 px**(`player_idle-sheet.png` 10×20、`player_running-Sheet-3.png` 85×21、`player_attack_1-Sheet.png` 162×20)。`character.scn` 雖然引用它們,但尺寸和 64 px 裝備層對不上;我判斷是**舊/廢棄素材或小尺寸預覽,不是實際身體 sheet**,真正的身體是 `Sprites/Player/player_*.png`(64 px 高)。此條是推論,見 §11-2。**【推論】**
  (`player_jump.png` 另有一份 16×20 的同名檔,但 basename 撞名,分不出是不是 `New/` 那份,見 §4.2。)
- 也就是說:**Soul's Remnant 的「動畫」只存在於身體與少數 BOSS/魔物 sheet,裝備層是靜態貼紙。** 這是它和暮影村「每件裝備每格都對齊」的根本差異。

---

## 4. 角色動作

### 4.1 動作清單【實證】

從 `Scenes/Player/character.gd` 的字串與 `character.scn` 的貼圖引用可讀出下列動作名(節錄):

`idle`、`run`、`jump`、`double_jump`、`wall_slide`、`roll`、`throw_1/2/3`、`triple_throw`、`attack_melee_1/2/3`、`attack_air`、`attack_heavy_strike`、`attack_heavy_strike_air`、`attack_upward_strike`、`cross_strike`、`shield_bash`、`dash_strike_loop`、`flash_strike`、`attack_shoot_1`、`attack_flame_barrage`、`attack_gravity_well`、`attack_magic_burst`、`attack_arrow_storm_shoot`、`herbalism_start/loop/end`、`play_instrument`、`player_death`。

對應貼圖(場景內引用,`res://` 路徑):`New/player_idle-sheet.png`、`New/player_running-Sheet-3.png`、`New/player_running_start-Sheet.png`、`New/player_attack_1-Sheet.png`、`New/player_attack_2-Sheet.png`、`New/player_heavy_strike-Sheet.png`、`player_attack_air.png`、`player_attack_heavy_air_strip5.png`、`player_attack_upward_strike_strip5.png`、`player_roll_strip6.png`、`player_throw_strip3.png`、`player_wall_slide.png`、`New/player_jump.png`。

### 4.2 幀數與節奏【實證 + 推論】

- **`idle` 只有 1 格**(`player_idle.png` 64×64)。**【實證】**
- `jump` / `wall_slide` 的貼圖很小:`player_jump.png` 有兩份同名檔(64×64 與 16×20)、`player_wall_slide.png` 量到 10×20 —— 進口檔名只留 basename,`New/` 與根目錄同名檔在封包裡靠 md5 區分,我**無法斷定哪一份是實際播放的**,所以不給這兩項幀數。**【實證:尺寸 / 待驗:哪一份】**
- 呼吸/漂浮不是畫出來的:程式端有 `animated_sprite_2d.offset` 的**整數 2 px 位移**(`const HOVI6y3 := Vector2(0, 2)`),而且**跑動時 offset 歸零**、其他動作才 +2 px(`oACqs99()`:動畫名不等於 `"run"` 就設 offset)。**【實證】** → **推論:** 待機的「上下呼吸」是 1 格 + 節點位移,和暮影村 `MOTION` 的想法一致,但暮影村是「只動膝蓋以上」的切片位移,本作是整個 sprite 位移。
- 播放速率由 `added_animation_speed × YSFREj7 × 播放器 speed_scale` 合成(`CaEM9kI.speed_scale = (added_animation_speed * YSFREj7) * upy989K`)。**【實證】** 每一格的 fps 值存在 `SpriteFrames` 二元段裡,**我沒讀出來**;檔案裡也找不到 `frameTime` 這種資料驅動欄位 → **沒有「節奏寫在資料裡」的機制,節奏寫在引擎資源裡**。**【推論,合理度高】**
- 移動基準:`var speed = 80`(px/s)、`friction = 700`。以 64 px 角色而言,跑速約 1.25 身長/秒,偏慢、偏「重」。**【實證】**

### 4.3 方向數【實證】

- **只有一個朝向(朝右),左右靠 `animated_sprite_2d.scale.x = ±1`**(`character.gd` 多處 `animated_sprite_2d.scale.x = sign(...)`、`= -animated_sprite_2d.scale.x`)。
- 跟隨節點會同步鏡像:`I5AWhHy.scale.x = -animated_sprite_2d.scale.x`。
- **沒有 `_left` / `_down` / `_up` 這類檔名,也沒有烘好的鏡像列。** 相對地,暮影村是 8 向 + 烘好的左向列(`ANIMATION_SPEC.md` 的格號表),成本更高但表現更豐富。

---

## 5. 裝備動畫(紙娃娃)

### 5.1 分層結構【實證,來自 `player.scn` 的節點名】

```
Player(Character)
└ SubViewportContainer ─ SubViewport      ← 每一層各自一個 SubViewport(材質/描邊)
   ├ BackSpineRenderer / hoodSpine / CapeRenderer / CapeSpine / CapeSpine2   ← 程序化布料
   ├ CapeSprite
   ├ HatBackSprite
   ├ (cape/hat-back 圖層)
   ├ BottomWearSprite / TopwearSprite / HatSprite / FaceAccessorySprite
   ├ HairSprite / FrontHairSprite / BackHairSprite
   ├ FaceSprite / EyeSprite / MouthSprite
   └ WeaponSprite (AnimatedSprite2D)
   + FrontSpineRenderer / RobeSpine1..4        ← 前襬/長袍骨鏈
   + PlayerHood / HoodPos / HoodPos_custom1..2 / RobePos1..4 / CapePos1..2  ← 掛點
```

- 排序**不是**固定 layer index,而是每個裝備資源自己帶旗標:`render_behind`(→ `show_behind_parent` + `process_priority = -1`)、`front_hair_only`、`no_top_hair`。**【實證:EquipmentData.gd + character.gd】**

### 5.2 每件裝備的資料模型【實證】

`res://Resources/Equipment/EquipmentData.gd`(716 B,明碼):

```gdscript
enum { j7E_bpx = 1, tuN70wY = 2, MPhYqvB = 3, j1GqQGg = 4, WEAPON = 5,
       Hd9txWH = 6, KDee1Xz = 7, L0zZQGF = 8, dfX6NO5 = 9, SW8fl1T = 10, zaaoSbN = 11 }
@export var item_data : ItemData
@export var name : String
@export var equipment_type : <enum>
@export var sprite_frames : SpriteFrames          # 正面/主層
@export var sprite_frames_back : SpriteFrames     # 背面
@export var sprite_frames_behind_hair : SpriteFrames
@export var render_behind : bool
@export var front_hair_only : bool
@export var no_top_hair : bool
```

- 實際資源(例:`coconut_priest_robe.res`)只引用**一張** `res://Sprites/Equipment/Topwear/Priest/top_wear_coconut_priest_robe.png`,內嵌 `SpriteFrames` 只有一個動畫 **`default`**,裡面 1 格。**【實證】**
- 外觀(髮/眼/嘴/臉)走另一套 `AppearanceData.gd`:`appearance_id`、`type`(0–3 + `BODY = 4`)、`sprite_frames` / `_front` / `_back`,同樣是 `default` 單格。**【實證】**
- 髮型有 **3 層**(`sprite_frames` 前上、`_front`、`_back`)+ 另一組 `hair_no_top_*` 變體;戴帽子時程式會把動畫名改成 `"<anim>_no_top"`(`dtQONda.play(dtQONda.animation + "_no_top")`)。**【實證】**

### 5.3 所以「換裝會改剪影嗎?」

- **會,但只透過「有沒有那張靜態圖 + render_behind/front_hair_only/no_top_hair」**,不是透過逐幀美術。
- **推論(未目視驗證):不會**有「褲子在跑動時跟著腿擺」這件事;褲子/鞋子就是固定在 64×64 的同一位置。依據是「裝備只有一張 64×64 靜態圖 + 只有 `default` 動畫」,但實際看起來是否穿幫要開遊戲才知道(§11-3)。
- 代價與收穫:換裝成本極低(一件 = 1 張 64×64 + 1 個 `.res`),代價是四肢擺動時裝備不會變形,靠帽/披風/長袍的骨鏈遮掩。**【推論,合理度高】**

---

## 6. 武器與手部對位

`Scenes/Player/weapon_follower.gd`(3.2 KB,類別 `X8jBA5x`)+ `Resources/Equipment/WeaponDisplayProfile.gd`。**【實證】**

```gdscript
@export var following_node_2d : Node2D         # 手部掛點
@export var follow_offset : Vector2
@export var follow_offset_anim : Vector2       # 逐動作追加
@export var flip_vertical : bool
@export var flip_horizontal : bool
@export_range(-180,180,0.5) var rotation_degrees_offset : float
@export_range(-180,180,0.5) var rotation_degrees_offset_anim : float
```

- 實際公式(去混淆後):`pos = hand.global_position + ((follow_offset + anim_offset) * Vector2(-sprite.scale.x, 1))` → **x 隨鏡像反向、y 不變**;旋轉 = `(rotation + anim_rot) × sign(scale.x) × sign(scale.y)`。**【實證】**
- `WeaponDisplayProfile` 的預設值:`follow_offset = (-1.5, 10.5)`、`rotation_degrees_offset = 25.0`、`flip_vertical = true`。也就是**握把點在角色原點左上一點、武器預設上翹 25°**。**【實證】**
- `character.gd` 匯出了 **19 個武器 profile**:sword / magic_wand / kunai / cross / orb / spellblade / javelin / shield / bow / focus / holy_arrow / judgement / special / gun / hellish_sickle / halo_of_faith / light_bringer / old_sickle / minigun。→ 一次調一個武器類別的姿勢,不是一把一把調。**【實證】**
- 另有「瞄準」分支:給定角度時 `follow_offset_anim = Vector2(-1,-3).rotated(angle)`、`rotation_degrees_offset_anim = angle`(`zDJmCxX()`),即**遠程武器用同一個公式吃滑鼠角度**。**【實證】**
- `WeaponSprite` 本身是 `AnimatedSprite2D`,可播自己的動畫(程式會把 `animation`/`frame` 複製到臨時 sprite 做殘影),但**武器美術是整張(或整條)獨立貼圖,不在身體 sheet 內**。**【實證】**

---

## 7. 布料與頭髮的程序化(FABRIK「Spine」)

`Scenes/Player/spine_animation.gd`(20 KB,`class_name Spine`)。**【實證】**

- 這不是骨骼動畫(Spine 2D),是**自己寫的 FABRIK 多節骨鏈**:`n_point = 3`、`n_head_point = 3`、`max_distance = 50`、`angle_limit ±30°`、`gravity = 5`、`drag_inertia`、`drag_max_step = 15`、`clamp_rotation_angles`、`conjoint_spine`(子鏈接父鏈)、`orientation_right` / `flip_clamp_on_flip`(鏡像時反向)。
- 角色上有 **1 條 back + 1 條 hood + 2 條 cape + 1 條 front + 4 條 robe** 共 9 條鏈,每條對應一個 `*Renderer` 節點,**只在 frame 變動時重畫**(`frame_changed` → 設 dirty flag → 重畫 + `queue_redraw`)。
- 頭髮**沒有**鏈,但髮片分前/上/後三層,靠 `RobeSpine`/`CapeSpine` 的擺動與整體鏡像撐場面。

**借鏡點:** 暮影村目前把乾/披風位移寫在 `rig.json` 的曲線圖層;本作則完全交给執行期物理(可即時反應跳躍、轉身、風)。兩者互補,但**物理版不吃美術工**、也比較不會「每格對不齊」。

---

## 8. 技能特效

- 特效是**獨立場景 + 獨立 sheet**,不畫進角色 sheet:`Sprites/Player/New/Skill Effects/*-Sheet.png`(`effect_magic_burst`、`effect_magic_slash`、`effect_mana_shield`、`holy_explosion`、`effect_upward_strike_2`、`Effect_melee_1..3` 等)。
- 執行期用通用 `Scenes/Effect/one_shot_sprite_effect.scn` + `one_shot_animated_sprite_2d.gd` 播一次就回收。**【實證】**
- 命中判定是另一套:`Scenes/Player/Hitboxes/player_attack_hitbox.tscn` + `player_attack_hitbox.gd`(4.7 KB)+ `MeleeAttackNode2D`、`AttackChainTimer`。**【實證】** → **出招節奏寫在 `AnimationPlayer` 的 track 裡,不是寫在 sheet 的 metadata**(和暮影村 `strikeDur / release / impact` 相反)。

---

## 9. 其他可以直接抄的小設計【實證】

1. **每層一個 SubViewport,`render_target_update_mode = UPDATE_ONCE`**,只有 frame 變化/開關時才更新一次(`r1vkH5Q()`)。低階機能省很大。
2. **描邊/陰影/隱形都是 shader**,不是另一張圖:`outline_shader.tres`、`shadow_shader.tres`,`Utils.jq6O5zn()` 給每一層複製材質;`toggle_shadow` / `toggle_invisible` / `invisible_alpha` / `border_scale` 都是參數。
3. **染色靠 shader**:`dye_preview_fx.gd`、`color_swap_hue.res`、`BodyColorPaint.res`、`FaceColorPaint.res` → 一張 sheet + 色相偏移 = 多變體。(暮影村目前是建置期換色,見 `EQUIPMENT_SPEC.md`。)
4. **群眾 LOD**:`max_animated_characters`(預設 20)+ `_crowd_lod` + `GWstadF()` 直接把 `process_mode`、`set_process` 關掉,連動畫都不跑。**【實證:options.txt + character.gd】**
5. **16×16 icon 規範**:所有 `-icon.png` 都是 16×16,和 64×64 世界層分開,UI 完全不吃世界貼圖。
6. 背包/裝備/外觀的**資料全部是 `.tres`**,一個裝備 = 一個 `.res`(不到 1 KB)。

---

## 10. 對暮影村的借鑑(對照 `sprites/` 三份 SPEC)

| 項目 | Soul's Remnant | 暮影村現況(SPEC) | 建議 |
|---|---|---|---|
| 單格尺寸 | 64×64,無 padding,gap 0 | 400×400(邏輯 100×100 ×4),地線 y=368 | 不改;但可借「**動作 strip 檔名帶幀數**」——`<name>_<action>_stripN.png`,人眼一看就知道幾格,不必回頭查 JSON |
| 方向 | **1 向 + `scale.x` 鏡像** | 8 向,左向是烘好的鏡像列 | 不建議改成 1 向(暮影村的攻擊弧線需要多向);但**遠程/投擲類**可考慮只做單向+鏡像,省下大量格子 |
| 待機 | **1 格 + 程式 offset(2 px,整數)** | 1 格(黑騎士 8)+ 執行期 `MOTION` | 已經一致,**維持**;可以把「跑動時 offset 歸零、其他動作 +2 px」這種「一動作一偏移」寫進 meta,不必進 `pixel-world.js` |
| 裝備 | **1 張 64×64 靜態 + `default` 動畫 + `render_behind / front_hair_only / no_top_hair` 三個旗標** | 每件裝備要求 8 向 × 全動畫對齊(`EQUIPMENT_SPEC.md` 的 `perAnimation`) | **借旗標,不借靜態**:把 `render_behind`、`front_hair_only`、`no_top_hair` 三個欄位加進裝備 JSON,取代現在的 `layer` 硬排序;髮型改三層(上/前/後)+ `_no_top` 變體,戴帽規則就能資料化 |
| 武器 | 獨立 sprite + **每「類別」一組 offset/旋轉**(19 個 profile),預設 (-1.5, 10.5)、25°;瞄準角可吃進 offset | `WEAPON_SPEC.md` 每把武器寫 `Grip Point / Hand Anchor / Attack Position` 逐格 | **借「按類別調參」**:把 7 類武器(sword/axe/spear/bow/staff/dagger/shield)各一組 `follow_offset + rotation + flip_vertical`,個別武器只覆寫例外的值;可以砍掉大量 `Attack Position` 表 |
| 布料 | 執行期 FABRIK 骨鏈(9 條:帽兜/披風×2/前襬/長袍×4),只在 frame 變動時重畫 | `rig.json` 曲線位移圖層,外加 `drawBodySliced` 切片位移 | **兩者並存**:披風/長袍尾巴用簡化 FABRIK(3 節、±30°、gravity 5)取代「每格畫 8 張」,可省最多工;但**要保留**「關鍵姿勢」給靜態 QA |
| 特效 | 完全獨立場景/貼圖,一次性動畫 | 目前特效在 sheet 內 | **借分離**:攻擊特效不要畫進角色 sheet,否則換武器/換技能都要重生 sheet |
| 出招節奏 | 在 `AnimationPlayer` track(程式常數) | **寫在 JSON**(`strikeDur/release/impact`) | **暮影村的做法更好**,不要學;本作這種寫法無法做「同一張 sheet 不同手感」 |

**可採用的 5 條(優先序):**

1. 裝備 JSON 加 `render_behind / front_hair_only / no_top_hair` 三個旗標,取消硬編 layer 排序。
2. 武器改成「類別 profile(`follow_offset` + `rotation_degrees_offset` + `flip_vertical`)」,逐格 `Attack Position` 只留例外。
3. 披風/長袍尾端改用 3–4 節 FABRIK(參數照本作:`max_distance 50`、`angle_limit ±30°`、`gravity 5`、`drag_max_step 15`),只畫關鍵姿勢 + 1 格尾端。
4. 檔名規範加 `<action>_stripN`(N = 幀數),並在 QA 檢查「`width / cell == N`」(自動比對,不靠人眼)。本作至少有 4 個檔案靠這個關係互相印證(見 §3),同時也顯示本作自己就有檔名對不上的舊檔 —— **暮影村把這條做成建置期檢查**,不要像本作那樣留給人發現。
5. 「一動作一偏移」寫進 meta(例如 `offsetY: 2` 只給非跑動動作),不要寫進渲染程式。

---

## 11. 還沒確認的事(留給 Claude / 需要開遊戲才能答)

1. **每格 fps**:存在 `SpriteFrames` 二元段,沒解出來。要確認只能實際錄影數格數,或寫一個 Godot 資源解析器。
2. **`Sprites/Player/New/` 系列的尺寸與用途**:已用自檢法量到 10–21 px 高(`player_idle-sheet.png` 10×20、`player_running-Sheet-3.png` 85×21、`player_attack_1-Sheet.png` 162×20),但 `character.scn` 又引用它們;若它們才是實際身體,就和 64 px 裝備層對不上。要定案需在遊戲裡目視或解 `SpriteFrames`。
3. **褲子/鞋子在跑動時是否真的不跟腿擺**:靜態貼紙 + 64×64 的證據很強,但「看起來是否穿幫」需要開遊戲目視。
4. `player_attack_heavy_strip6.png`:寬度 **768×64 是自檢法量到的**(兩種掃法一致),但檔名說 6 格。768/64 = 12 格,也可能是 6 格但單格 128 寬(其他玩家動作都是 64)。**格數要解 `SpriteFrames` 才能定;寬度可以信。**
5. Godot 版本精確值(4.1–4.7 之間),以及是否用了 `Spine` 這個名字只是巧合(檔案內容是純 GDScript FABRIK,不是 Esoteric Spine 執行期)。
