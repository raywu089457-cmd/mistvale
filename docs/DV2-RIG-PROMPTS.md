# DV2 rig 素材生成 prompt 套組（PixelLab）

給 DV2 rig 2× 系統（`pipeline/scripts/dv2fmt/rig2x.py`，docs/PAPERDOLL.md §22.6）用的部件。
「完美貼合」的意思：**尺寸、錨點、脖子高度、每個姿勢武器手伸到哪裡**都跟 DV2 rig 的數字一致（數字取自 `pipeline/scripts/dv2fmt/dv2_rig.json`），
所以部件放上 rig 不用再調；**角色設計是原創的**（不要拿 DV2／開羅的圖當參考或 init image）。

---

## 0. 共用規則（每個部件都照做）

### 0.1 風格句（貼在每條 prompt 最後）
```
pixel art chibi RPG character part, 1-pixel dark outline around every shape, flat colours with 2-3 tones per material, light from top-left, no anti-aliasing, no dithering, transparent background
```

### 0.2 PixelLab 設定
| 部件 | 工具 | 設定 |
|---|---|---|
| 頭、身體、帽子 | Create character（4 directions） | size 32、view `low top-down`、outline `single color black outline`、shading `basic shading`、detail `medium detail` |
| 表情、姿勢 | Create character state（在上面那個角色上） | `use color palette from reference` 打勾 |
| 拳頭、武器 | Create image (pixflux) | 拳頭 32×32、武器 48×48，`remove background` 打勾，view `side` |
| 縮小 | Resize | **一次縮完、不要連縮好幾次**；同一職業同一種部件**全部用同一個倍率**（看下面 0.3 決定） |

### 0.3 目標尺寸（2× 像素，縮完要量）
| 部件 | 目標 | 怎麼決定縮放倍率 |
|---|---|---|
| 頭 | 內容 **20×20**（含頭髮），下巴在最下面一列 | 用正面 normal 頭量出倍率，所有表情、方向用同一倍率 |
| 身體 | 站姿內容 **26 寬 × 16–18 高**（**含手臂**，比高還寬） | 用正面站姿量出倍率，所有姿勢、方向用同一倍率 |
| 拳頭 | **8×8** 左右 | 兩張用同一倍率 |
| 武器 | 長邊 **40–46**，直立、柄朝下 | 每把各自 |

### 0.4 每個身體姿勢的目標框（2×，縮完量；寬含手臂）
DV2 的身體框與武器手位置（相對腳底中心，x 往角色前方為正、y 往上為負；側面與正面 DV2 用同一組數字）：

| 檔名姿勢 | 用在 | 身體框 寬×高 | 武器手在哪（給 prompt 用的描述） |
|---|---|---|---|
| `stand` | 待機、走路第 0/2 格、勝利第 0 格 | 26×16 | 手垂在身側、稍微往外，拳頭在**膝蓋高度**、離身體中心約 14 px |
| `walk_l` / `walk_r` | 走路第 1/3 格 | 26–30×16 | 同站姿，前後擺一點 |
| `windup` | 揮砍預備 | 22×18 | 雙拳在**胸前中央、肩膀高度**（武器由 rig 往後舉） |
| `chop` | 縱砍收尾 | 30×18 | 拳頭在**身體前方、腳踝高度**、前腳弓步 |
| `swing` | 橫掃 | 32×28 | 拳頭在**身體前方、肩膀高度**、手臂往前伸直 |
| `thrust` | 突刺（劍、短刀） | 34×20 | 拳頭在**前方、膝蓋高度**、往前刺、前腳弓步 |
| `hurt` | 受傷 | 32×20 | 拳頭在**身側、腰部高度**、身體往後仰 |
| `crouch` | 騎乘坐姿 | 28×16 | 拳頭在**前方、腰部高度**、膝蓋彎 |
| `cheer` | 勝利 | 36×30 | 拳頭**高舉過頭、偏前方** |
| `aim` / `aim_full` | 弓（拉弓前/拉滿） | 36×22 / 30×20 | 握弓的手**往前伸直、腰部高度**；拉弦的手在胸前（拉滿時到臉頰） |
| `cast` / `cast_high` | 法杖施法 | 36×30 | 握杖的手**高舉過肩、偏前方** |
| `lying` | 倒地（只要側面） | 36×22 | 平躺、手腳放鬆（頭由 rig 另外畫在旁邊） |

頭：rig 會把頭放在身體頂端往下蓋 3 列（脖子），所以**身體頂端是毛領／衣領，不要畫脖子以上**。

### 0.5 輸出檔名（放進 `assets/paperdoll-dv2/src/x2/<職業>/`）
```
body_<姿勢>_<view>.png      view = back / side / front（north / east / south），lying 只要 side
head_<表情>_<view>.png      表情 = normal blink hurt shout happy ko；view = side / front
head_back.png               後腦（不分表情）
fist_side.png  fist_front.png
../weapon_<武器>.png  ../weapon_<武器>_fine.png   （武器我來烘成 4 個傾角欄）
```

---

## 1. 每個職業都一樣的 prompt（把 `{HEAD}`、`{BODY}`、`{FIST}` 換成第 2 節該職業的描述）

### 1.1 頭（Create character）
```
a big round chibi head only, no neck, no body, {HEAD}, the chin is the lowest point, pixel art chibi RPG character part, 1-pixel dark outline around every shape, flat colours with 2-3 tones per material, light from top-left, no anti-aliasing, no dithering, transparent background
```

### 1.2 表情（Create character state，在 1.1 上）
```
same head, both eyes closed as if blinking, everything else exactly unchanged
```
```
same head, pained expression with eyes squeezed shut and gritted teeth, everything else exactly unchanged
```
```
same head, shouting fiercely with the mouth wide open and angry eyebrows, everything else exactly unchanged
```
```
same head, big happy grin with the eyes closed in joy, everything else exactly unchanged
```
```
same head, knocked out with eyes drawn as small x marks and a slack mouth, everything else exactly unchanged
```

### 1.3 後腦（north 方向如果畫成臉，用 Edit image 在 north 那張上改）
```
the same chibi head seen from directly behind: the back of the head fully covered by the same hair (or hood/hat), no face, no eyes, no mouth, same size and position
```

### 1.4 身體基底（Create character）
```
a short squat chibi body that is wider than it is tall, with no head and no hands, {BODY}, the top of the body is a collar at shoulder level with nothing above it, both arms end in round wrist stumps, very short thick legs, broad shoulders, standing with feet slightly apart and the arms hanging a little out from the sides, pixel art chibi RPG character part, 1-pixel dark outline around every shape, flat colours with 2-3 tones per material, light from top-left, no anti-aliasing, no dithering, transparent background
```

### 1.5 姿勢（Create character state，在 1.4 上；每條一個 state）
```
same headless handless body, mid-step walking pose with the left foot forward and the right foot back, arms swinging slightly opposite to the legs, everything else exactly unchanged
```
```
same headless handless body, mid-step walking pose with the right foot forward and the left foot back, arms swinging slightly opposite to the legs, everything else exactly unchanged
```
```
same headless handless body, getting ready to swing: both wrist stumps together in front of the chest at shoulder height, torso leaning slightly back, feet apart, everything else exactly unchanged
```
```
same headless handless body, finishing a heavy downward chop: lunging forward with the front knee bent, both arms reaching forward and down so the wrist stumps are in front of the body near the ankles, everything else exactly unchanged
```
```
same headless handless body, mid horizontal swing: the front arm stretched straight forward at shoulder height, shoulders twisted, feet apart in a wide stance, everything else exactly unchanged
```
```
same headless handless body, recoiling from a hit: torso leaning back, arms flung out to the sides at waist height, one foot stepping back, everything else exactly unchanged
```
```
same headless handless body, crouching low with both knees bent and both arms held forward at waist height, everything else exactly unchanged
```
```
same headless handless body, cheering in triumph with both arms raised high above the shoulders and slightly forward, feet apart, everything else exactly unchanged
```
```
same headless handless body, collapsed and lying flat on its back on the ground, arms and legs relaxed, everything else exactly unchanged
```
劍、短刀職業另加：
```
same headless handless body, thrusting forward: lunging with the front knee bent, the front arm stretched straight forward at knee height, everything else exactly unchanged
```
弓職業另加（兩條）：
```
same headless handless body, aiming a bow: the front arm stretched straight forward at waist height, the back arm bent with its wrist in front of the chest, feet apart sideways, everything else exactly unchanged
```
```
same headless handless body, bow at full draw: the front arm stretched straight forward at waist height, the back arm pulled all the way back so its wrist is at the cheek, everything else exactly unchanged
```
法杖職業另加（兩條）：
```
same headless handless body, casting a spell: the front arm raised forward above the shoulder, the other arm held out to the side, feet apart, everything else exactly unchanged
```
```
same headless handless body, casting a big spell: both arms raised high above the head and slightly forward, everything else exactly unchanged
```

### 1.6 拳頭（Create image pixflux，32×32）
```
pixel art game sprite of one tiny closed fist only, no arm, {FIST}, seen from the side with the knuckles pointing to the right, 1-pixel dark outline, flat colours with 2-3 tones, light from top-left, no anti-aliasing, centered, transparent background, nothing else
```
```
pixel art game sprite of one tiny closed fist only, no arm, {FIST}, seen from the front with the knuckles facing the viewer, 1-pixel dark outline, flat colours with 2-3 tones, light from top-left, no anti-aliasing, centered, transparent background, nothing else
```

---

## 2. 各職業描述（原創設計，換進第 1 節）

| 職業 | `{HEAD}` | `{BODY}` | `{FIST}` | 武器 |
|---|---|---|---|---|
| 狂戰士 berserker（已完成） | spiky messy brown hair, fierce brown eyes, light stubble on the chin, tan skin | brown leather vest with a cream fur collar, heavy dark brown belt with a small iron buckle, brown trousers, dark brown boots, bare muscular arms | tan skin with a thin brown leather wrist wrap | 斧 |
| 聖騎士 paladin | short tousled blond hair, blue eyes, fair skin | slate-blue tunic under a silver plate chest piece with gold trim, brown belt, steel greaves and boots | a steel plate gauntlet with a gold rim | 劍 |
| 弓手 archer | short tousled brown hair under a teal cloth headband, green eyes, tan skin | sleeveless teal tunic, a brown leather quiver strap across the chest with arrows showing over the shoulder, a leather bracer on the left forearm, olive-green leggings, soft brown boots | tan skin with a brown leather bracer edge | 弓 |
| 法師 sorcerer | a tall pointed violet wizard hat with a gold band and a bent tip, pale face, brown eyes, a little brown hair under the brim | violet robe with wide sleeves and lavender trim, gold sash, the robe hem hides the feet | pale skin peeking from a wide violet sleeve cuff | 法杖 |
| 祭司 priest | a white hood with a gold edge framing a calm face, brown eyes, a few light brown hair locks | long white robe with wide sleeves, red sash, a gold medallion on the chest, white shoulder cowl | pale skin peeking from a wide white sleeve cuff | 聖杖 |
| 刺客 assassin | a near-black hood and a face mask covering nose and mouth, only the eyes visible, light grey scarf under the chin | close-fitting near-black clothes, a short dark cloak over the shoulders, light grey scarf, small belt pouches, dark boots | a dark leather glove | 短刀 |

法師的帽子、祭司與刺客的兜帽都畫在**頭**裡（不是帽子部件）。

---

## 3. 武器（Create image pixflux，48×48；普通與 `_fine` 各一把）

貼在每條最後：
```
standing perfectly upright and vertical, the handle pointing straight down, chibi RPG style, centered, nothing else
```

| 武器 | 普通 | `_fine`（升級） |
|---|---|---|
| 劍 sword | `pixel art game weapon icon: a single straight steel longsword with a simple brown leather grip and a plain crossguard,` | `pixel art game weapon icon: a single ornate steel longsword with a gold crossguard, a blue gem in the pommel and a gold-wrapped grip,` |
| 短刀 dagger | `pixel art game weapon icon: a single short steel dagger with a dark leather grip,` | `pixel art game weapon icon: a single curved ornate dagger with a gold guard and a purple gem in the pommel,` |
| 法杖 staff | `pixel art game weapon icon: a single wooden staff with a round lavender crystal orb held in a wooden claw at the top,` | `pixel art game weapon icon: a single dark wooden staff with a large glowing violet crystal held in gold prongs at the top,` |
| 聖杖 holystaff | `pixel art game weapon icon: a single gold staff with an open gold ring halo at the top,` | `pixel art game weapon icon: a single white-and-gold staff with a gold ring halo and a small sun emblem at the top,` |
| 斧 axe（已完成） | — | — |

**弓**（三張同一把：休息／拉滿／放箭；先生休息那張，再用 Edit image 改另外兩張）：
```
pixel art game weapon icon: a single wooden recurve bow standing upright with its string on the right side, relaxed string, no arrow, chibi RPG style, centered, nothing else
```
```
the same bow fully drawn: the string pulled far to the right into a sharp V with an arrow nocked, everything else exactly unchanged
```
```
the same bow just after release: the string snapping back almost straight with a slight vibration, no arrow, everything else exactly unchanged
```

---

## 4. 交件前自己檢查
1. 背面（north）的頭是後腦，不是臉。
2. 同一個姿勢的三個方向是同一個動作（不是一張揮、一張站）。
3. 身體沒有頭、沒有手；最上面是衣領；手臂停在手腕。
4. 縮完的尺寸大約符合 0.3、0.4（站姿身體比高還寬）。
5. 線條是 1 px 深色外框、沒有糊掉（縮太小會糊：寧可大一點，我這邊可以再調）。

交件後我會：量每個部件、放進 rig、補上 `rig2x.py` 的姿勢對照（thrust / aim / aim_full / cast / cast_high）、烘武器四個傾角欄、重建並送審圖。
