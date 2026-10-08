# SPRITE VISUAL BIBLE — 暮影村

本檔只填暮影村的**專案參數**(畫風與尺寸)。製作方法(分層、動畫結構、驗收、命名、版控、AI 生圖規則、流程)一律照
[`SPRITE_PRODUCTION_PIPELINE.md`](SPRITE_PRODUCTION_PIPELINE.md),本檔不重寫。

## 0. 權威範圍

**權威(只有這些)**:
- 本資料夾 `sprites/` 的文件(製作方法 `SPRITE_PRODUCTION_PIPELINE.md`、本檔、ANIMATION / WEAPON / EQUIPMENT / QA / NAMING / FOLDER spec、`characters/`)。
- 獵魔村重製的產物 —— 也是本檔第 2、3 節的依據:
  - 風格提示詞:`output/l0veyou/prompts/make_hv_prompts.py`(`STYLE_H` / `STYLE_M` / `DESC`)→ `output/l0veyou/prompts_hv/*.txt`
  - 風格參考圖:`output/l0veyou/hv2/webref/`(真實截圖)、`hv2/styleref/`、`hv2/ref-*.png`
  - 上線 sheet:新管線 `sprites/characters/<ID>/export/` → `export_game.py` → `assets/heroes/`、`assets/monsters3/`(舊 hv2 版備份在各資料夾 `_pre_newpipe/`);村民 `assets/villagers@*` 仍是 hv2 版
  - 整理備份:`output/hv-restyle-2026-10-06/`

其他文件裡的角色描述都不是規格;衝突時以本檔為準。

成功標準:**CONSISTENCY > SCALABILITY > READABILITY > ANIMATION QUALITY > DETAIL**。

## 1. 專案參數表(對應製作方法第 2 節)

暮影村有兩套格式:**新管線**(照製作方法量產的新角色)與**上線格式**(目前遊戲裡的 11 個角色,第 4 節)。

| 類別 | 參數 | 新管線 | 上線格式 |
|---|---|---|---|
| Camera | 視角 | 3/4 側面(game-side view),所有角色同一角度 | 同左;另有正面/背面待機走路列 |
| Camera | 朝向 | 朝右;朝左 = 程式水平鏡像 | 朝右;Left 列是 Right 逐像素鏡像烘入 |
| Scale | 每格 Canvas | 邏輯 100×100,母版 400×400(邏輯 ×4,最近鄰);**魔物**用 rig.json `cell`(史萊姆 144、狼 160、石像 176、樹精 224),地線 = 格底上 8、軸 = 格中線 | 英雄 100、魔物同 rig `cell`(= 新管線 1x) |
| Scale | 角色高(頭頂→腳底,不含武器) | 邏輯 70–80 / 母版 280–320 | 英雄 64–90 px,以待機軀幹欄身高量(`audit_hero_sheet.py` 的 body_h):全英雄 72 ±2(`build_hero.py` 整體高 72;祭司、黑騎士整體高 80,軀幹欄約 69/73)。魔物不量身高,只量美術最長邊 |
| Scale | Ground line | 邏輯 y=92 / 母版 y=368 | 格底上 10 px(留影子/揚塵) |
| Scale | 身體軸 | 邏輯 x=50 / 母版 x=200 | 格中線 |
| Scale | 頭身比 | 英雄約 3 頭身;魔物約 2 頭身(樹精約 2.5) | 同左 |
| Scale | 遊戲內大小 | — | 待機身高 21 邏輯單位;魔物美術尺寸 = 遊戲尺寸 × 72/21 |
| Rendering | 渲染規則 | 像素畫:硬邊、無抗鋸齒、無模糊、alpha 只有 0/255;母版每 4×4 區塊單色 | 像素畫:硬邊、alpha 只有 0/255 |
| Rendering | 細節密度 | AI 圖先用 `unfake.py` 偵測原生像素格取樣成真像素,不做任意縮放。例外:模型照參考圖的像素大小作畫,原生高太矮/像素太粗時(弓手、遊俠、法師、全部魔物、全部正面/背面表),改用 **pixelize**:整張表同一縮放比 + 同一份 16 色重取樣到目標身高(rig `source.pixelize`),同一角色所有表的密度仍一致 | 每角色同一密度 |
| Outline | 輪廓 | 細的深棕近黑單線外框,非純黑粗線;剪影外圈暗色比例 ≥ 0.55 | 同左 |
| Palette | 色數 | 每角色 ≤16 色(含描邊),所有動畫共用一份 | 同左 |
| Palette | 色階 | 材質 3–4 階:Outline / Shadow / Base / Light / Highlight | 同左 |
| Background | 色鍵 | `#FF00FF`;紫色主體(法師)改 `#00FF00`,去背用 `NO_SHADOW=1 NO_HOLES=1 HUE_TOL=12` | 同左 |
| Animation | 格數 / Sheet / 秒數 | 見 `ANIMATION_SPEC.md`(Idle 8 / Walk 8 / Attack 8–10 / Hurt 4 / Death 8) | 見第 4.2 節 |
| QA | 剪影/縮圖 | 64 px 與 32 px;32 px 剪影跟其他職業 IoU < 0.8;孤立像素 ≤1% | 同左;**英雄**站姿動作(idle/walk/hurt 與各方向)各格軀幹欄身高 vs 待機第 1 格 ±12%;四邊留 ≥2 px 透明。**魔物豁免身高 ±12%**(史萊姆走路是跳躍、樹精走路有蹲伏起伏),改只量腳底貼地(±3 px)與美術最長邊 = 遊戲尺寸 ×72/21 ±10% |

## 2. 畫風 — 獵魔村物語(Evil Hunter Tycoon)像素角色/怪物風格

REF = 真實《獵魔村物語》截圖(`output/l0veyou/hv2/webref/`、`styleref/`),只借**畫風、比例、像素明暗、描邊**,不准抄截圖裡的角色。
此畫風為使用者 2026-10-06 的決定,覆蓋原 MASTER SPEC 的「韓系暗黑奇幻」描述。

| 項目 | 規格 |
|---|---|
| 世界觀 | 溫暖明亮的奇幻獵人村莊;獵人出村狩獵魔物再回村。不是暗黑、不是恐怖、沒有血腥 |
| 英雄 | 約 3 頭身 Q 版:大頭、小身體,厚實(chunky)但有細節;武器放大到一眼可辨;**小而簡單的點點眼** |
| 魔物 | 約 2 頭身,圓潤、粗短、可愛;白眼球 + 深色瞳孔 + 一個小高光;嘴巴閉著,**不畫牙齒/尖牙**,威脅感靠眉毛與動作 |
| 上色 | 頭髮、布料用 3–4 階像素叢集明暗,手點高光與陰影;不漸層、不抖動雜點 |
| 色彩 | 暖色、略低飽和(rich warm slightly muted) |
| 色盤 token | 皮膚 `#f2c89b`、髮 棕`#6b4a2f` 赭`#8a4b2a`、布 藍`#4a7fbf` 綠`#3f8f5f` 紅`#b04038` 紫`#7a4fbf`、金屬 `#7f8fa6`、金 `#e2b84c`、聖光 `#ffe9a0`、魔法 `#6c5ce7`;魔物 史萊姆`#7fd66b`、狼毛`#8d8f98` 狼鬃`#d4544a`、樹皮`#7a5a38`、樹葉/青苔`#4e8f3f`、岩石`#8f8a80`。新色先在這裡增補再用 |
| 職業語言 | 靠剪影 + 武器 + 裝備辨識,不靠顏色;每職業 1–2 個招牌形狀(第 3 節) |
| 與場景同框 | 跟 Xilurus 村莊場景(鮭魚粉、稻草金、藍灰石、深棕描邊)站在一起不突兀 |

### 2.1 提示詞風格段(照抄 `make_hv_prompts.py`,後接視角句「3/4 side view, the character FACES TO THE RIGHT ...」)

英雄 `STYLE_H`:
> Style: the pixel art style of the mobile game Evil Hunter Tycoon (獵魔村物語), exactly as in the attached reference screenshots: chunky detailed chibi pixel-art characters about 3 heads tall with a big head, small simple dot eyes, small body, hair and cloth drawn with 3-4 tone pixel clusters, a thin dark-brown near-black outline, rich warm slightly muted fantasy colors, hand-placed pixel highlights and shadows, clean readable silhouette. Palette of at most 16 colors, crisp hard pixel edges, NO anti-aliasing, NO blur, NO gradients, NO dithering noise.

魔物 `STYLE_M`:
> Style: the pixel art style of the mobile game Evil Hunter Tycoon (獵魔村物語) monsters, exactly as in the attached reference screenshots: chunky readable pixel-art fantasy creatures about 2 heads tall, simple expressive eyes (white eyeball, dark pupil, a tiny highlight), a thin dark-brown near-black outline, 3-4 tone pixel shading with hand-placed highlights, rich slightly muted colors, clean readable silhouette. Palette of at most 16 colors, crisp hard pixel edges, NO anti-aliasing, NO blur, NO gradients, NO dithering noise.

idle 表另加:「Use the attached reference image (real Evil Hunter Tycoon game screenshots showing its characters and monsters) ONLY for art style, proportions, pixel shading and outline; do NOT copy those characters; redraw it as a side-view pixel sprite sheet.」

另外每張提示詞都要加上製作方法第 17 節的必備字句(same character / same proportions / same equipment / same weapon / same camera / same scale / same pixel density / continuous animation)。

### 2.2 實機野外怪物的風格(2026-10-07 從 `webref/s5.png` 整理;試作 = ogre)

上表的「魔物 2 頭身圓潤可愛」是早期四隻(史萊姆/狼/石像/樹精)的方向。真正《獵魔村物語》野外的怪物另有一套,新增怪物優先照這套:

| 項目 | 實機觀察 |
|---|---|
| 造型 | 多為**直立人形怪**:綠皮食人魔、灰色貓耳狼人、骷髏、灰皮食屍鬼、白髮紫袍女巫;常拿簡單武器(木棍、斧) |
| 比例 | 與英雄同一套 Q 版像素尺度;普通怪 ≈ 英雄 1–1.3 倍高,大型怪更壯更寬 |
| 色彩 | 比英雄暗、偏灰:灰、橄欖/薄荷綠、灰紫、塵土棕;3 階平塗明暗 + 深色描邊 |
| 臉 | 小黑點眼(偶爾發光黃眼)、粗眉、閉嘴;陰鬱但仍 Q 版,不畫獠牙與血腥 |
| 群體 | 成群出現,3/4 側面站立;靠剪影與顏色區分種類 |

提示詞做法:REF 用實機截圖裁切(`output/l0veyou/hv4/ref-ogre-style.png` = s5.png 怪物群放大 4×),
句型「copy ONLY their art style, proportions and pixel density; do NOT copy them」,並寫明 muted / small dark eyes / upright humanoid。

## 3. 職業/魔物外型(`make_hv_prompts.py` 的 `DESC`)

| id | 外型 | 招牌形狀 |
|---|---|---|
| archer | 赭色亂短髮+白羽頭帶、綠短上衣+棕皮甲、芥末黃圍巾、背箭袋 | 比軀幹高的大木反曲弓 + 圍巾 |
| ranger | 森林綠兜帽長斗篷、棕皮背心、中型木長弓、綠羽箭袋 | 兜帽斗篷 |
| sorcerer | 紫色高尖帽+金帶、紫袍金邊、長木杖頂紫藍水晶球 | 高帽 + 長杖(綠底生圖) |
| berserker | 棕刺髮、皮毛領皮背心、紅腰帶、粗短裸臂、寬肩 | 雙手巨型雙刃戰斧 |
| paladin | 鋼盔金邊、銀板甲、右手直劍 | 左臂大圓藍盾 + 金十字 |
| priest | 白兜帽金邊、白長袍金腰帶、金聖徽 | 頂端發光金白光環的金色長杖 |
| darkknight | 黑角盔 + 紅色發光眼縫、黑板甲暗紅邊、短紅披風、圓黑盾紅徽、黑直劍 | 厚重暗色剪影 |
| slime | 淺綠疊球身、頂上小凸起、扁平深色水窪底、一個白色光澤 | 疊球 |
| wolf | 圓頭三角耳、灰色橢圓身+米白肚與頸圈毛、背上紅橙鬃紋、四條粗短方腿、蓬鬆圓尾 | 低長剪影 |
| golem | 方塊頭頂平坦青苔、兩顆發光青色圓眼、圓石肩、巨大圓拳、方塊短腿 | 厚寬剪影 |
| treant | 粗圓樹幹身+大圓臉、頂上圓葉冠+兩根小鹿角枝、短粗手臂末端葉球、短根腳 | 葉冠 + 樹幹 |
| ogre(試作,2.2 節風格) | 直立微駝綠皮食人魔:光頭粗眉、小黑點眼、寬扁鼻、閉嘴;薄荷綠皮 3 階、深灰棕皮背心+繩腰帶、破布腰布、粗手、綁腿短腳 | 右手大木棍 + 寬厚剪影 |

## 4. 上線格式(遊戲讀的 sheet)

2026-10-07 起英雄 7 + 魔物 4 全部由新管線產生(`pipeline/scripts/sprites/export_game.py`),
`src/pixel-world.js` 依 json 的 `actions`(每列 y、cell、frames、frameTime、release/impact、cycle)播放,格數改了不用改程式。
舊 hv2 版(`build_hero.py` 組裝、idle 4 / walk 6 / death 6)備份在 `assets/heroes/_pre_newpipe/`、`assets/monsters3/_pre_newpipe/`。

### 4.1 生圖與出貨

- 生圖:l0veyou 網頁(GPT Image 2,CDP 9447 已登入的專用瀏覽器,`pipeline/scripts/l0veyou/generate.mjs`),同一時間只跑一張。
- 側面關鍵表:`make_prompts_keys.py` → `gen_keys.sh`(4x1:待機 + 攻擊 wind-up / max / recovery;`chk_keys.py` 驗收)。
- 正面/背面關鍵表:`make_prompts_dir.py` → `gen_dir.sh`(2x1:正面待機、背面待機;`chk_dir.py` 驗收)。
- 組裝:`make_idle.py` → `make_rigged.py`(walk / attack / hurt / death)→ `make_dir.py`(idleDown / walkDown / idleUp / walkUp)
  → `sprite_qa.py`、`sprite_qa_dyn.py` 全 PASS → `export_game.py <名稱…>` → `node build.mjs`。
  魔物 rig 由 `mon_rig.py <type> <遊戲尺寸> <cell>` 自動量腳/膝。法師(綠底)全程加 `NO_SHADOW=1 NO_HOLES=1 HUE_TOL=12`。

### 4.2 動畫格數與時序(`assets/heroes/*.json`、`assets/monsters3/*.json`)

| 動作 | 格數 | 每格秒數 | 備註 |
|---|---|---|---|
| idle | 8 | 0.16(魔物 0.2) | 循環 |
| walk | 8 | 依移動距離推進(`cycle` 85) | 循環;史萊姆 = 跳躍 |
| attack | 8 | 0.075 | `release` 4、`impact` 5(json 為 0 起算;= ANIMATION_SPEC 第 5、6 格) |
| skill | 8 | 0.075 | 英雄;暫用 attack |
| hurt | 4 | 0.1 | |
| death | 8 | 0.12 | 停在最後一格 |
| victory | 8 | 0.16 | 英雄;暫用 idle |
| idleDown / idleUp | 8 | 同 idle | 正面 / 背面 |
| walkDown / walkUp | 8 | 同 walk | 正面 / 背面 |
| idleLeft / walkLeft | 8 | 同側面 | 側面逐像素水平鏡像烘入 |

英雄格 100、`footFromBottom` 8、`heroHeight` = 待機身高;魔物格 = rig `cell`、`heroHeight` 72、`artSize` = 遊戲尺寸 ×72/21。
魔物只有 idle / walk / attack / hurt / death(+ 方向列)。

### 4.3 方向與模組化

- sheet 動作列:`idle walk … idleDown walkDown idleUp walkUp idleLeft walkLeft`;戰鬥維持側面左右。
- 換色組 `meta.groups`:`outfit`(職業布料色相)與 `metal`(鎧甲/刀刃)。遊戲依 id 從 5 個布料色相挑,買鎧甲→布料更飽和、買武器→金屬變金。
- 頭部配件槽 `assets/heroes/accessories.png`:依稀有度佩戴(稀有 緞帶/羽飾、超稀 花冠/銀冠、英雄 桂冠/小角、傳說 皇冠/光環),錨點=軀幹中線 ±12% 最上一列。
