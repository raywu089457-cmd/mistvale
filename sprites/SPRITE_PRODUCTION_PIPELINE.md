# Sprite Production Pipeline — 通用製作方法規格

本檔只規定**製作方法**:怎麼建立規格、怎麼分層、怎麼生產動畫、怎麼驗收、怎麼命名與版控。
**不規定美術風格與尺寸**:畫風、視角、畫布大小、角色高度、色數、描邊、格數等,全部是「專案參數」,
由各遊戲自己的 `SPRITE_VISUAL_BIBLE.md` 填寫(見第 2 節)。同一份方法可套用到任何畫風的遊戲。

適用對象:英雄、怪物、NPC、武器、裝備、技能特效,以及各種動畫(Idle / Walk / Attack / Skill / Hurt / Death …)。

---

## 1. 核心原則

Sprite 不是單張圖片,而是:

Character Design + Base Body + Equipment + Weapon + Animation + Effect + Palette + Sprite Sheet + Game Import Specification

所有工作都必須以「可量產、可維護、可重複使用」為前提。

**禁止每次生成角色時重新隨機決定**下列項目,它們一律由專案參數(第 2 節)統一控制:

身體比例 · 頭部大小 · 腿長 · 手臂長度 · 武器比例 · Camera · 視角 · 像素/細節密度 · Palette · Ground position · Character scale

---

## 2. 專案參數(每個遊戲在 Visual Bible 裡填一次,之後不准隨意改)

開始任何量產前,先建立 `SPRITE_VISUAL_BIBLE.md`,至少把下表全部填好。
本規格的其他章節只引用這些參數,不寫死數值。

| 類別 | 參數 | 說明 |
|---|---|---|
| Camera | 視角、朝向 | 例:側面 / 3/4 / 俯視;預設朝向(另一側是否用鏡像) |
| Scale | 每格 Canvas 尺寸 | 所有動畫共用 |
| Scale | 角色高度範圍 | 頭頂→腳底(不含武器) |
| Scale | Ground line、身體軸 | 格內座標,所有格固定 |
| Scale | 頭身比(Head-to-Body Ratio) | 依職業/體型分類定義 |
| Rendering | 渲染規則 | 例:像素畫 → 硬邊、無抗鋸齒、alpha 只有 0/255;其他畫風寫各自的邊緣/透明規則 |
| Rendering | 細節密度 | 像素密度或筆觸密度,所有角色一致 |
| Outline | 輪廓規則 | 有無外框、顏色、粗細 |
| Palette | 每角色色數上限、色階結構 | 例:Outline / Deep Shadow / Shadow / Base / Light / Highlight |
| Background | 色鍵顏色或透明 | 色鍵色必須避開主體會用到的顏色 |
| Animation | 每種動畫的格數、Sheet 排列、每格秒數 | 見第 6 節 |
| QA | 縮圖測試尺寸 | 遊戲內實際顯示尺寸,以及再小一級 |
| Style | 畫風描述、參考圖、提示詞風格段 | 生圖時每張照抄 |

參數衝突或要修改時:先在 Visual Bible 改、寫進 CHANGELOG,再生產。不可在單次生產裡臨時改。

### 2.1 Visual Bible 必備章節

- **Camera**:固定視角與朝向。禁止某角色/某格突然改變視角、變成正面、鏡頭距離改變。
- **Character Scale**:所有角色在相同 Ground Line、保持相同視覺高度、相同頭身比、相同腳部位置;每一幀不准上下漂移。
- **Rendering**:邊緣、透明、材質的規則。不論哪種畫風,同一專案內不得混用(例如有的格抗鋸齒、有的沒有)。
- **Outline**:外輪廓清楚;重要輪廓優先於內部細節;縮到小尺寸仍能辨識職業;不用細碎雜點。
- **Palette**:限定色數與色階。不同角色可用不同 Palette,**同一角色所有動畫必須共用同一份**。

---

## 3. Character Construction System

所有角色建立在固定 Base Body 上。Base Body 至少定義:

HEAD · BODY · LEFT ARM · RIGHT ARM · LEFT LEG · RIGHT LEG · HANDS · FEET

建立 `BASE_BODY_SPEC.md`,記錄(數值由專案自訂,但必須是**量得到的數字**):

Head size · Shoulder width · Torso width · Arm length · Leg length · Foot size · Body height · Ground position

- 所有同體型角色都必須遵守這副比例。不同體型(人形、四足、巨型…)各自建立一份 Base Body。
- 裝備可以加厚輪廓,**不能改骨架**。

---

## 4. Character Layer System

角色設計在概念上拆成以下圖層(遊戲不需要的層可以空著,但編號不變):

| Layer | 內容 |
|---|---|
| 01 | Base Body |
| 02 | Hair / Face |
| 03 | Armor |
| 04 | Helmet |
| 05 | Gloves |
| 06 | Boots |
| 07 | Cape / Accessories |
| 08 | Weapon |
| 09 | Shield |
| 10 | VFX |

即使最終輸出是單張 Sprite,也必須按這個結構設計。目的:同一角色 + 不同武器 + 不同裝備 + 不同顏色 = 新角色。

---

## 5. Character Identity System

每個角色有唯一 ID:

- 英雄:`HERO_[CLASS]_[NUMBER]`(例:HERO_KNIGHT_001、HERO_ARCHER_001)
- 怪物:`MONSTER_[TYPE]_[NUMBER]`(例:MONSTER_GOBLIN_001)
- NPC:`NPC_[ROLE]_[NUMBER]`

每個角色一個資料夾:

```
characters/
└── HERO_KNIGHT_001/
    ├── character_spec.md
    ├── sprite_checklist.md
    ├── visual_reference/
    ├── concept/
    ├── idle/
    ├── walk/
    ├── attack/
    ├── skill/
    ├── hurt/
    ├── death/
    ├── weapon/
    ├── equipment/
    └── export/
```

---

## 6. Animation Standard

所有動畫使用專案參數的固定 Canvas。動畫分兩階段:

- 第一階段:IDLE · WALK · ATTACK · HURT · DEATH
- 第二階段:RUN · SKILL · CAST · VICTORY · SPECIAL_ATTACK

每種動畫的**格數、Sheet 排列、每格秒數由專案定義**(寫進 Animation Spec);下面只規定每種動畫的**結構**。

### 6.1 Idle

- 連續循環,最後一格必須能自然接回第一格。
- 變化:身體微幅上下、手部微動、武器微動、披風微動、頭髮微動。
- 禁止每一格重新設計角色;幅度不能大到看起來像走路。

### 6.2 Walk

必須有真正的步行週期:左右腳交替、重心轉移、身體上下、手臂擺動、武器跟隨身體、披風跟隨動作。

- 禁止單純複製同一張圖只上下移動。
- 禁止每一幀角色尺寸改變。
- 禁止腳在地面漂移(遊戲端建議依移動距離推進格數)。

### 6.3 Attack

標準結構(格數不足時合併相鄰階段,但順序不變):

1. Idle / Ready
2. Preparation
3. Wind-up
4. Attack begins
5. Maximum attack
6. Impact
7. Recovery
8. Return

- 武器:手部連接正確、方向正確、攻擊軌跡清楚、Motion Arc 合理。
- 可加 Slash Trail / Impact Flash / Dust / Small Particles,但**不得遮住角色本體**。
- Export metadata 標出出手格與命中格,供遊戲對時。

### 6.4 Hurt

結構:1 Normal → 2 Hit → 3 Knockback → 4 Return。
可以後仰、頭偏、手臂反應、武器震動,但不能破壞角色身份。

### 6.5 Death

結構:Hit → Stagger → Fall → Ground → Collapse → Final → Hold。
禁止突然改變角色設計;倒地後仍在 Ground Line 上。

---

## 7. Sprite Sheet Rules

- Fixed Cell Size(專案參數);排列由左到右、由上到下。
- No padding(除非明確指定)· No grid lines · No labels · No frame numbers · No decorative borders · No shadows outside sprite · No accidental objects outside frame。
- 動畫格數改變時,**先在 Animation Spec 定好 Sheet Layout 再生產**,不可臨時排。

---

## 8. Background Rules

**色鍵背景**:
- 使用專案指定的單一色鍵色(常用 `#FF00FF`;主體含相近顏色時改用其他色鍵,並記錄在該角色的 character_spec)。
- 純色、無漸層、無陰影、無紋理、無背景物件。
- 角色邊緣不能混入背景色。

**透明背景**:
- 必須輸出真正的 Alpha Transparency,不可用接近背景色的假透明。

---

## 9. Animation Consistency Check

每次生成動畫後必須自動檢查(門檻由專案定義):

1. Character scale
2. Character position
3. Ground line
4. Head position
5. Body proportion
6. Weapon position
7. Weapon size
8. Equipment consistency
9. Palette consistency
10. Outline consistency
11. Facing direction
12. Frame continuity
13. No accidental extra limbs
14. No missing limbs
15. No duplicated weapons
16. No floating equipment
17. No broken silhouette
18. No background contamination

任何一項失敗:**不要宣告完成,先修正。**

## 10. Silhouette Test

每個角色完成後,把角色轉成純黑剪影,確認:

職業是否容易辨識 · 武器是否容易辨識 · 頭盔/頭部特徵是否容易辨識 · 身體姿勢是否自然 · 動畫幀是否仍然連續

黑色剪影都無法辨識 → 先修正輪廓,再加細節。

## 11. Thumbnail Test

把角色縮到專案定義的縮圖尺寸(遊戲內實際顯示尺寸,以及再小一級),檢查:

是否仍能辨識角色 · 武器 · 職業 · 是否出現雜訊

縮小後變成一團 → 減少細節、強化 silhouette。

---

## 12. Equipment System

```
equipment/
├── helmets/
├── armor/
├── gloves/
├── boots/
├── capes/
├── shields/
└── accessories/
```

每件裝備必須遵守:角色比例 · 相同視角 · 相同渲染規則 · 相同 Palette 規則。裝備不能改變角色基本骨架。

## 13. Weapon System

```
weapons/
├── sword/
├── axe/
├── spear/
├── bow/
├── staff/
├── dagger/
└── shield/
```

每件武器記錄:Weapon ID · Size · Grip Point · Hand Anchor · Attack Arc · Idle Position · Walk Position · Attack Position。
武器必須在所有動畫中保持正確連接(不換手、不消失、不穿過身體)。

## 14. Anchor Point System

所有角色與武器建立 Anchor,至少:

HEAD · BODY · LEFT_HAND · RIGHT_HAND · LEFT_FOOT · RIGHT_FOOT · WEAPON_GRIP · GROUND

例:`WEAPON_GRIP = (x, y)`。目的:讓 Character + Weapon + Animation 能程式化組合。

---

## 15. Naming Convention

```
hero_knight_001_idle_v01.png
hero_knight_001_walk_v01.png
hero_knight_001_attack_v01.png
hero_knight_001_hurt_v01.png
hero_knight_001_death_v01.png
weapon_sword_001_v01.png
equipment_helmet_knight_001_v01.png
```

禁止:`final.png`、`final2.png`、`new.png`、`new_final.png`、`test.png`。所有檔案都要有明確版本。

## 16. Version Control

- 版本:v01、v02、v03 …
- 每次修改記錄在 `CHANGELOG.md`,例:

  ```
  v02:
  - 修正腳部漂移
  - 修正劍柄位置
  - 增加披風動畫
  - 統一頭部高度
  ```

- 不要覆蓋重要版本。

---

## 17. AI Generation Rules

使用 AI 生圖時,AI **不得自行決定**:Camera · Character scale · Frame size · Palette · Facing direction · Animation layout。以上都由專案參數決定。

Prompt 必須明確要求:

"same character" · "same proportions" · "same equipment" · "same weapon" · "same camera" · "same scale" · "same pixel density"(非像素畫則寫對應的細節密度) · "continuous animation"

- 禁止寫 "eight different poses"(通常會變成八個不同角色)。
- 改寫成 "eight consecutive animation frames of the same character"(格數照專案)。
- 畫風段落從 Visual Bible 照抄,不在單張 prompt 裡臨時改寫。

## 18. 不可接受的結果(任何一項 = FAIL)

- 角色每幀比例不同、頭部忽大忽小、腳部漂移
- 武器消失、武器突然換手、武器穿過身體
- 披風消失、裝備改變、顏色改變
- 角色面向改變、角色突然改變視角
- 違反專案渲染規則(例如像素畫出現抗鋸齒、模糊、非像素邊緣)
- 背景污染
- 多出手臂、多出腿
- Sprite 超出 Cell、Frame 排列錯誤

---

## 19. Production Workflow

每個新角色依序經過:

| Phase | 內容 |
|---|---|
| 01 | Character Concept |
| 02 | Base Body |
| 03 | Silhouette Approval |
| 04 | Palette |
| 05 | Equipment |
| 06 | Weapon |
| 07 | Idle |
| 08 | Walk |
| 09 | Attack |
| 10 | Skill |
| 11 | Hurt |
| 12 | Death |
| 13 | Quality Control |
| 14 | Export |

**不可跳過 Character Base 與 Silhouette 階段直接大量生成動畫。**

## 20. Agent 行為規則

Sprite Production Agent 的工作是:DESIGN + STANDARDIZATION + GENERATION + VALIDATION + REVISION + EXPORT,不只是生成圖片。

需求不完整時,不要自行破壞既有規格。優先順序:

1. Existing Visual Bible
2. Existing Character Spec
3. Existing Base Body
4. Existing Animation Spec
5. Existing Palette
6. Existing Naming Convention

新需求與既有規格衝突時:**先指出衝突,不要默默改變 Pipeline。**

---

## 21. 每次開始新角色前

建立 `character_spec.md`,至少包含:

```
Character ID:
Class:
Role:
Body Type:
Height:
Facing:
Weapon:
Armor:
Color Palette:
Animation List:
```

並建立 `sprite_checklist.md`(列出第 19 節 Phase 01–14,完成後逐項勾選)。

## 22. 最終輸出

每個完成的角色至少提供 `characters/<CHARACTER_ID>/` 資料夾,內含:

- `character_spec.md`
- `sprite_checklist.md`(全部勾選)
- 各動畫的 Sprite Sheet(依第 15 節命名)與對應 metadata(格數、每格秒數、anchor、出手/命中格)
- 第 9–11 節的驗收結果
- `export/`:遊戲匯入用的檔案

(原始 MASTER SPEC 第 27 節在提供的內容中被截斷;本節依原規格第 5、14、26 節補齊,若原文有其他項目再補上。)
