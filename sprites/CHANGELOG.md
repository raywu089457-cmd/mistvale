# CHANGELOG — sprites

## 2026-10-08 — 獵魔人 witchhunter:QA 修正(idle 06/07、walkUp 地線)

- **idle 06/07 失敗**:木製連弩的弩身飽和度 60–90,`sprite_qa.py` 的金屬偵測只認飽和 < 30,量不到(回傳 None)。
  - rig:新增 `weaponSatMax` 90(預設 30 不變,只有這隻角色用),`weaponMetalMin` 100 → 40(弩身亮度約 60–85,100 會把它濾掉)。
  - 結果:8 格弩身偏移 (0,−2)、尺寸 15×10 完全一致 → 06/07 PASS。
- **walkUp 地線失敗**:背面弩在左側,bbox 置中把身體與兩腳推到軸線右側 → 左腳落在右半邊,walk 的左右分組失效,整對腳一起抬,地線掉到 90。
  - `make_dir.py` 新增 rig `dirFeetGapAxis`(背面):兩腳之間的縫對到軸線(dx = −6);來源圖左腳比右腳高 2 px,另以 `plant_feet` 把那側腿段拉長 2 列貼回地線。
  - 結果:四方向 idle/walk 腳底都在地線 92;walkUp PASS。
- **未修**:正面(Down)左靴仍比右靴高 2 px(來源圖),walk 抬右腳時右靴左側 3 px 會留在左組。人工項「四方向腳底貼地」記 FAIL;需要新的正面關鍵表,或另做分腳設計。
- 驗收:`sprite_qa.py idle` PASS;`sprite_qa_dyn.py walk attack hurt death` PASS;`make_dir.py` 四方向 PASS;`audit_hero_sheet.py witchhunter` PASS;`check_anim` 閃格 0、受擊 163/163。
  `check_facing` heroCombatBad 3 次(base 版本同樣出現 2 次,屬既有問題,未在本次修)。`npm test` 在 base 與本次都失敗(test-pixel-game 5≠6、test-landscape 交易所道路),非本次造成。

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
