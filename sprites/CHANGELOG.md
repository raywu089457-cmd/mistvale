# CHANGELOG — sprites

## 2026-10-28 — 環村道路（安全走廊）

- `src/overworld.js`：`RING_ROAD` ＝ 圍籬外 **3.4 格**的一圈封閉道路（矩形外擴＋四角半徑 3.4 的四分之一圓收邊，
  所以整圈每個點都離村界一樣遠；切角版本會在角落切進村莊，實測距離 0），半寬 1.05。
  另提供 `ringRoadDistance / nearestRingRoad / ringPointAt / ringRoadPath / onRingRoad`。
- `src/landscape-layout.js`：`getRoads()` 加入環的 60 段＋四個出村口的引道，kind 標成 `'ring'`
  （村莊鋪面與村內道路測試會排除它）。
- `src/pixel-game.js`：跨區移動一律 `ringWaypoints()` —— 先走到最近的環上點、沿環（取較短一側）走到最靠近目的地的位置、
  再切進地形；`depart / exploreRegion / dispatchHunters / 流浪英雄` 共 6 個呼叫點都改走環。
  **魔物索敵會跳過站在環上的獵物**（安全走廊），實測：把獵人釘在環上、魔物放在旁邊 2 格，120 幀內 engaged = 0、無傷害。
- `randomRegionPoint`：環村道路上不生怪（`onRingRoad(x,z,1.4)` 排除）。
- 渲染：環走「土路」材質（跟村內石板區隔）；一開始用石板會跟村莊鋪面糊在一起。
- `test-landscape.mjs`：新增環的驗收（存在、封閉、在世界內、離村界 0.7–6.0、四個出村口都有引道），
  村內道路連通性改成只算非 ring 段。`npm test` 11 PASS。


## 2026-10-27(深夜後 2) — 低模 3D 渲圖：管線通、模型不採用

- 新增 `pipeline/scripts/blender/render_kobold.py`：用基本幾何體照 sprite 造型拼低模地精
  （大頭／尖耳／礦工帽＋蠟燭／圍裙／小鎬，顏色取自 sprite 代表色），走 walk/attack → 8 方向正交渲圖。
- 用 `pixelize_renders.py` 壓成 79 px 後跟手繪 sprite 並排（`output/kobold3d/_compare_vs_sprite.png`）：
  明顯是「一堆方塊」，三輪調整（2.6 頭身比例、去掉重複 gamma、零件互相重疊補縫）都救不回來。
- 結論寫進 `pipeline/blender/README.md`：管線（骨架／8 方向一致／武器不換手／格子規格）沒問題，
  缺的是真正的低模建模。遊戲維持手繪 sprite + 程式化走路，**沒有動任何資源**。


## 2026-10-27(深夜後) — 紙偶走路退回程式化

- 使用者看過實機後判定紙偶效果不好 → **kobold / wolfman / moss / snowman / mummy 全部退回 `build_monster_8dir.py` 的程式化走路**
  （重跑 builder → to_webp → build，8 格不重複、無碰邊，實機 kobold/mummy 正常）。
- 21 隻現在統一用程式化走路（biped / quad / blob / sway 四種骨架）。
- `pipeline/blender/README.md` 加上「紙偶不採用」的結論與三條實測原因；程式留著當紀錄，不接進遊戲。


## 2026-10-27(深夜) — 紙偶走路接進 5 隻人形魔物

- `paper_doll_8dir.py` 補強：腿塊／頭塊往身體多留 5% 重疊＋左右各留 6%（兩腿擺開時中線不會露縫）、
  身體與頭用 `depth=-0.8` 畫在腿前面、擺幅 22°→28°、髖部上下顛 ×2.2。
  踩到的坑：腿塊如果剛好切在中線且沒有重疊，擺動時會露出一條直縫。
- `build_monster_8dir.py --walk-src`：整列改用**第 0 格的腳底**當基準（原本逐格各自貼地，
  會把紙偶的抬腳與身體起伏壓平）。
- 接上紙偶走路的：**kobold / wolfman / moss / snowman / mummy**（腿看得出來、切線不破壞剪影）。
  維持程式化走路的：**yeti / boulder / floraspirit**（蓬毛、岩塊、細莖＋大花冠，切線會在身體中間留缺口）。
- 實機 kobold / mummy / snowman：8 方向走路、攻擊、受擊、死亡都正常，無錯誤。`npm test` 11 PASS。


## 2026-10-27(晚) — 牧師 8 方向 + 紙偶骨架（立體骨架貼 2D 素材）

- **牧師**（`build_priest_8dir.py`）：桌面的 8 方向待機 + 模板生的 8 方向走路（5 向 + 3 向鏡像）＋下載區的 8 方向攻擊
  → `assets/heroes/priest.*`（28 列：idle 8 向、walk 8 向、attack 8 向、hurt/death/victory/skill）。
  沒有新素材的 hurt/death/victory 用 idle 做程式化位移（畫風不會變成兩個人）；skill 直接指向攻擊列。
  角色高 71 px 跟舊版一致；攻擊列 cell 128（法杖與法球會伸出身體）。JSON 補上 `palette`（variantMap 需要）。
- **紙偶管線**（`pipeline/scripts/blender/paper_doll_8dir.py`）：把 8 方向待機圖切成頭／身／左腿／右腿四塊，
  貼在 3D 骨架骨頭上（剛性權重），在螢幕平面內繞 Y 軸擺動，**正交相機**拍回 → 保留原畫但有真骨架帶動。
  8 方向共用一副骨架、只換貼圖。第一版踩到「透明像素變黑方塊」→ 材質要 Alpha→Mix(Transparent)。
  實測 kobold：腿真的前後擺，跟程式化位移並排差別很明顯（`output/paperdoll/_compare_kobold.gif`）。
  限制：長袍角色（牧師）看不到腿；髖部接縫在擺幅大時會露縫。尚未接進遊戲。
- `npm test` 11 PASS。線上首頁 0.73 MB。


## 2026-10-27 — 借用 Sprixen 的三個概念（archetype 走路 / 武器鎖手 / Blender 8 向）

- **archetype 走路**（`build_monster_8dir.py`）：原本只分 step / hop，改成跟 Sprixen 動畫 API 同一套分類
  `biped`（人形兩腿交替）／`quad`（四足、步幅大身體上下顛）／`blob`（無腳壓扁彈跳）／`sway`（藤蔓左右擺）。
  順手修掉一個真 bug：`Mon.foot` 原本設在地線以下 → 腳的左右位移對到空集合，走路其實只有「上下動」；
  改成腳踝分割列（內容裡）之後，biped/quad 每隻都有 8 個不重複的走路格。
  21 隻的分類：biped 7、quad 6、blob 6、sway 2。`assets/monsters3/*.json` 多了 `archetype`。
- **武器鎖在右手**：拿武器的角色（狼人斧、巨魔木棒、霜雪怪冰棍、雪人冰矛、地精鎬、木乃伊彎刀、花妖精樹枝）
  在 builder 裡斷言 8 個方向的 walk/attack 列都必須存在 —— 少一列引擎就會鏡像 → 武器換手。JSON 另存 `weapon`。
- **Blender → 8 方向渲圖**（`pipeline/blender/README.md`、`pipeline/scripts/blender/render_8dir.py`、
  `pixelize_renders.py`）：程式組 low-poly 骨架 → walk/attack 各 8 格 → 8 台正交相機 → Workbench 硬邊渲圖
  → 壓成我們的格子規格。動作品質比程式化位移好（膝蓋真的會彎、8 方向同一個角色），
  但方塊人的畫風跟手繪魔物不同，要正式用需要 low-poly 模型。
- 檢查腳本（`check_one_monster` / `check_sprites_ingame` / `check_death_ingame`）預設改走本機 server：
  大張圖改成 `media/` 外部檔後，`file://` 開會被 canvas 判成跨來源、`getImageData` 會壞。
- `npm test` 11 PASS；實機 ram / kobold / vine 三隻 8 方向走路、斜向待機、攻擊、受擊、死亡全播到，無錯誤。


## 2026-10-26(晚)— 野外只留新魔物、出怪數量加大

- 使用者：「舊怪物移除只留新的，還有增加各區怪物生成數量」。
- `pixel-game.js`：`ENEMIES`/`AGGRO`/`ENEMY_NAME` 拿掉 slime / wolf / golem / ogre（王還是 `boss`→treant）；
  `REGION_MIX` 每區只剩 3 種新魔物（小/中/大，權重 3:3:2）。存檔還原本來就有 `own(ENEMIES, type)` 過濾 → 舊存檔裡的舊魔物會自動消失。
- 出怪量：進區 6→**12**、自然補充每 4.5 s／上限 8 → **每 2.5 s／上限 14**、非當前區維持 3→**6**、
  開局草原 6→**10**、其他區各 2→**5**；難度切換與空表回填也改成從各區 mix 抽。
- 舊素材移到 `output/removed-old-monsters/`（slime/wolf/golem/ogre 的 png+json，treant 保留給世界王）。
- `pixel-world.js`：`ENEMY_SIZE` 改成讀 sheet 的 `meta.size`（原本是 slime/wolf/golem 的硬編碼）。
- `test-overworld.mjs`：每區進場魔物數 6→12。`npm test` 11 PASS。
- 單檔 build 26.3 → **25.7 MB**（少了 4 隻舊魔物）；草原同時 11 隻在畫面、30 fps。


## 2026-10-26 — 21 隻新魔物(8 方向素材)上線

- **素材**：使用者在 PixelLab 網站用「Rotate」把 21 張怪物正面概念圖轉成 8 方向（768×768＝3×3、每格 256、8 格有內容）。
  每隻怪物切 8 張放桌面資料夾（`<中文>-<id>-8方向-256`），順序＝由正面起順時針（cell0 南、2 東、4 北、6 西），
  用「臉朝哪邊＋武器在哪隻手」在 5 隻怪物上驗證過。
- **新腳本 `pipeline/scripts/sprites/build_monster_8dir.py`**：8 方向站姿 → 遊戲用 sheet。
  來源只有每個方向一張站姿，所以 walk / attack / hurt / death **全部是同一份像素的整數位移**
  （膝蓋帶壓縮、腳左右平移、上半身整列傾斜、整體位移），沒有縮放與插值 → 不會糊、不會多出新顏色。
  - 8 個方向用同一個縮放比 s = artSize／最大內容邊長（體型一致）；透明處先填最近色再 LANCZOS，避免邊緣變黑；
    縮放後 median-cut 到 32 色、alpha 只留 0/255。
  - 格子 = 內容 + 14% 邊距後取偶數（比固定 144/176 省記憶體：sprout 98、yeti 146）。
  - 每列用腳底 6 列重心對到格中線、腳底對到 ground 線；位移超出邊距的格會整體推回（`clamp`）。
  - 走路：`step`（左右腳交替，四足/人形）或 `hop`（整體彈跳，史萊姆型/無腳）；攻擊 8 格 release 4 / impact 5。
  - 26 列／隻：idle×8 方向、walk×8、attack×8、hurt、death（死亡＝沉入地面，遊戲本來就會淡出）。
- **遊戲**：`pixel-game.js` 加 21 筆 `ENEMIES`／`AGGRO`／`ENEMY_NAME`；`REGION_MIX` 改成每個地形 3 隻新怪（小中大）＋ 1 隻舊怪；
  `exploreRegion`／`dispatchHunters` 改從 mix 抽（不再固定 `region.enemy`）；`overworld.js` 的地區說明與代表怪更新。
- **記憶體**：26 種魔物 sheet 解碼後約 280 MB → `pixel-world.js` 改成**用到才載**（`ensureMonsterSheet(id)`＋
  `__mistvalePreloadMonsters()` 讓進區前先叫齊），開場不再全部解碼。單檔 build 26.3 MB（新增素材 6.6 MB PNG）。
- **驗收**：`check_one_monster.mjs` 跑 kobold / yeti / cactus → 8 方向 walk、斜向 idle、attack、hurt、death 全播到，
  無缺動作／無越界／無 page error；21 隻 × 26 列全部沒有格子碰邊。`npm test` 11 PASS。


## 2026-10-07(夜)— 獵魔村物語怪物風格試作:食人魔 ogre

- 從實機截圖(`webref/s5.png`)整理野外怪物風格 → Visual Bible 2.2 節(直立人形、偏灰低飽和、小黑點眼、與英雄同尺度)。
- 試作 `MONSTER_OGRE_001`:REF = 截圖怪物群裁切(`hv4/ref-ogre-style.png`)→ 側面關鍵表 `hv4/mon3-ogre-keysA.png`(一次成功)
  → 正背面 `hv4/ogre-dir.png`(REF = 側面關鍵表)→ `mon_rig.py ogre 28 144` → 全部 QA PASS → `export_game.py ogre` → `assets/monsters3/ogre.*`。
- 遊戲:`pixel-game.js` ENEMIES 加 `ogre`(hp 132 / atk 17 / speed .8)、橡木密林與霜杉林地出怪表各一格、開局草原多生一隻(測試用)。
- 實機測試 `pipeline/scripts/check/check_one_monster.mjs ogre`:8 種動作都播到、無越界、無錯誤、死亡倒地淡出;特寫在 `output/audit/ogre/`。

## 2026-10-07(晚)— 實機檢查

- 新增 `pipeline/scripts/check/check_sprites_ingame.mjs`(逐幀記錄每隻角色畫的 act/i:act 必須存在、i 在範圍內;每個「職業/魔物 × 動作」抓實機特寫到 `output/audit/sprites/`)
  與 `check_death_ingame.mjs`(英雄倒下、魔物被打倒後 0.15/0.5/1.0 秒特寫)。結果:無缺動作、無越界、無頁面錯誤;四方向、攻擊、受擊、技能、歡呼、死亡都正確播放。
- 修正:換色組(`meta.groups`)原本用飽和度自動挑,皮膚/頭髮進了 outfit → 遊戲裡出現綠皮膚狂戰士。`export_game.py` 改用 `build_hero.material_groups`
  (職業色相 ± 容差);祭司只換高飽和金飾、弓手放寬綠衣飽和度、法師不換金屬(灰髮)。
- 修正:`pixel-world.js` 魔物出手格數夾在 0..frames−1(繪製本來就有夾,記錄值會超出);`__mistvaleDecor()` 多回傳 `cls`/`vdir`(驗收用)。
- 備註:黑騎士、祭司不是可玩職業,只在村內街道當 NPC 出現(走路四方向、待機)。

## 2026-10-07 — 11 角色全部照新規格重作並上線

- 範圍:英雄 7(聖騎士、黑騎士、狂戰士、弓手、遊俠、法師、祭司)+ 魔物 4(史萊姆、狼、石像、樹精)。
  每個角色 idle 8 / walk 8 / attack 8 / hurt 4 / death 8 + 正面/背面 idle 8、walk 8 + 左向鏡像;`sprite_qa.py` + `sprite_qa_dyn.py` + `make_dir.py` QA 全 PASS。
- 上線:`export_game.py` → `assets/heroes/*`、`assets/monsters3/*`(舊 hv2 版在 `_pre_newpipe/`);遊戲端不用改(依 json 播放)。
- 方法:全部「關鍵姿勢 + 圖層位移」。側面一張 4 格關鍵表(待機 + 攻擊 3 格),正面/背面一張 2 格關鍵表;其餘格程式產生。
- **pixelize 模式**(rig `source.pixelize` / `anims.*.pixelize`):模型照參考圖的像素大小作畫,弓手(原生高 43)、遊俠、法師、魔物、正背面表都太矮,
  改成整張表同一縮放比 + 同一份 16 色重取樣到目標高(英雄 72;魔物 = 遊戲尺寸 ×72/21)。聖騎士、黑騎士、狂戰士、祭司仍是 unfake 真像素。
- 新工具:`make_prompts_dir.py`、`gen_dir.sh`、`chk_dir.py`、`make_dir.py`、`mon_rig.py`、`write_char_docs.py`(每角色 character_spec.md / SPRITE_QA_REPORT.md);`chk_keys.py` 加 2×2 重複像素檢測(dup)。
- `make_idle.py`:rig `cell` 決定邏輯格(魔物 144–224);`clean_key`(keyDespeck)/ `bridge`(keyBridge)。
- `make_rigged.py`:walk `mode: hop`;death `fall: rot / flip / sink`;拄地武器不沉到地線以下;`stripFlash` 只拿周圍沒有本體色的白塊
  (原本會把高光、眼白、祭司白袍一起挖掉)並清掉閃光描邊線、補回原描邊比例;動作格也套 keyBridge。
- `unfake.limit_palette`:`NO_SHADOW` 時不過濾紫色(法師紫袍原本被當洋紅污染)。法師全程 `NO_SHADOW=1 NO_HOLES=1 HUE_TOL=12`。
- QA:`sprite_qa_dyn.py` 讀 `logicalCell`;魔物豁免站姿 ±12%、改量美術尺寸(B3)、地線 ±3;跳躍走路改看腳底高度;`sprite_qa.py` 無武器層時略過 6/7。
- 祭司 `outlineTarget` 0.9 → 0.62(0.9 是補白袍被誤刪的舊權宜)。
- 人工檢查(13–17、H、V)完成,結果在各角色 `SPRITE_QA_REPORT.md`(`qa/manual_review.json`)。修正:聖騎士背面裝備換手 → `dirMirrorUp` 鏡像;
  狂戰士死亡被背上斧頭撐離地 → 新增 `death.fall: rotcw`(向前趴倒);狂戰士受擊武器層位移露縫 → 武器不另外位移。

## 2026-10-06(凌晨後)— unfake 格距修正

- `unfake.py` 原本會挑到真格距的 2 倍(聖騎士 10 px,量成高 36);真格距 5 px、原生高約 70,**符合原本 70–80 的規格**。
- 曾短暫改成 64 格參數,已全部還原;Bible 參數維持 100×100 / 母版 400。改的是 `unfake.py`:優先選分數相近的最細格距。

## 2026-10-06(深夜)— 用新 Bible 重驗上線素材

- Bible:魔物豁免「站姿各格身高 ±12%」;英雄身高以軀幹欄量、全英雄 72 ±2;魔物待機 0.2 s。
- `build_hero.py`:黑騎士整體高 72→80(軀幹欄 65→73,對齊其他英雄),受擊倍率 .88→.94;已重組 `assets/heroes/darkknight.*`(舊檔備份在 work/_bak_darkknight)。
- `audit_hero_sheet.py` 改依新 Bible:格數/秒數精確值、色鍵殘留、孤立像素 ≤1%、英雄身高 72 ±2、32px 剪影只跟現有英雄比;新增 `villagers` 檢查;移除已不存在的 hero@4x 依賴。
- `audit_density.py`:英雄/魔物改讀 assets/heroes、assets/monsters3(移除 hero@4x、monsters@2x)。

## 2026-10-06(夜)— 製作方法與專案參數分離

- 新增 `SPRITE_PRODUCTION_PIPELINE.md`:從 MASTER SPEC 抽出的通用製作方法,畫風與尺寸改為專案參數。
- Visual Bible 改為只填暮影村參數(第 1 節參數表:新管線 / 上線格式)、畫風、職業外型、上線格式。
- 修正:上線 sheet 每格 128–256(不是固定 128)、attack 實為 8 格(不是 7)。

## 2026-10-06 — 獵魔村像素風上線

- 規格:SPRITE_VISUAL_BIBLE(第 0 節權威範圍、第 6 節畫風 = `make_hv_prompts.py` 的 `STYLE_H`/`STYLE_M`/`DESC`、第 9 節上線 sheet 格式)、
  BASE_BODY_SPEC、ANIMATION_SPEC、EQUIPMENT_SPEC、WEAPON_SPEC、SPRITE_QA_CHECKLIST、FOLDER_STRUCTURE、NAMING_CONVENTION。
- 上線:7 英雄 + 4 魔物 + 村民,sheet 來源 `output/l0veyou/hv2/`,audit 全 PASS。
- 新管線工具(`pipeline/scripts/sprites/`):`unfake.py`(偵測 AI 圖原生像素格取樣成真像素)、`make_idle.py`(rig.json → 分層 Idle 8 格,母版 = 邏輯 ×4)、
  `sprite_qa.py`(18 項一致性 + 硬邊/alpha/出格 + Silhouette / Thumbnail test)。

## 2026-10-06(之後)— 聖騎士 pilot:walk/attack/hurt/death 工具 make_anim.py
- 新增 `pipeline/scripts/sprites/make_anim.py`:AI 逐格動畫表 → unfake 真像素(每表單一格距,偵測到 2× 倍數就折半)→ 與 idle 共用 `palette.json`(≤16 色)→ 腳底對 y=92、軀幹對 x=50 → 400 母版 + export json。rig.json 新增 `anims`。
- 聖騎士結果:walk 72、hurt 70(跟 idle 71 一致);attack 49、death 47(AI 畫小了,像素密度跟 idle 不一致,須重生或接受)。
- sprite_qa.py 的剛性檢查目前只對 idle;非 idle 動畫尚未有 QA,遊戲端也還讀不到新格式(assets/ 未動)。
- 修正:attack/death 一張 4×2 會被 AI 畫小(48/49),改成兩張 4×1(各 4 格),rig.json 的 anims 支援 `sheets` 清單。結果 attack 64、death 71(walk 72、hurt 70、idle 71)。提示詞尺寸鎖定句無效,拆圖才有效。
