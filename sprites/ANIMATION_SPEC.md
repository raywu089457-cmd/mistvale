# ANIMATION SPEC

所有動畫:每格 400×400(邏輯 100×100 ×4),透明底,ground line y=368,軀幹軸 x=200,朝右。
魔物格較大(rig.json `cell`,地線 = 格底上 8、軸 = 中線),其餘規則相同。
Sheet 預設 **4 欄 × 2 列 = 1600×800**;格數不是 8 的動畫,先在這裡定好 layout 再生產。

| 階段 | 動畫 | 格數 | Sheet | 每格秒數 | 循環 |
|---|---|---|---|---|---|
| 1 | IDLE | 8 | 4×2(1600×800) | 0.16 | 是 |
| 1 | WALK | 8 | 4×2 | 0.1(遊戲依移動距離推進,見 cycle) | 是 |
| 1 | ATTACK | 8(最多 10 → 5×2,2000×800) | 4×2 | 0.075 | 否 |
| 1 | HURT | 4 | 4×1(1600×400) | 0.1 | 否 |
| 1 | DEATH | 8 | 4×2 | 0.12,停在最後一格 | 否 |
| 1 | IDLE_DOWN / IDLE_UP | 8 | 4×2 | 同 IDLE | 是 |
| 1 | WALK_DOWN / WALK_UP | 8 | 4×2 | 同 WALK | 是 |
| 2 | RUN / SKILL / CAST / VICTORY / SPECIAL_ATTACK | 依動作定,先更新本表 | — | — | — |

## 製作方式

**關鍵姿勢 + 圖層位移(預設)**:AI 或美術只畫關鍵姿勢(待機 1 張;走路 contact/passing 2 張;攻擊 ready/wind-up/impact/recover 4 張);
其餘格由 `rig.json` 的曲線位移圖層產生。好處:每格同一份像素 → 不會變臉、不會換武器長度。

## IDLE(8 格)

| 格 | 身體(膝蓋以上下沉 px) | 武器 | 頭髮/披風(慢一格) |
|---|---|---|---|
| 1–2 | 0 | 0 | 0 |
| 3–6 | 1 | 1 | 第 4–7 格 1 |
| 7–8 | 0 | 0 | 0 |

- 身體下沉 = 膝蓋帶壓 1 列(膝蓋微彎),腳底列完全不動;頭、盾、盔甲剛性跟著走(不變形)。
- 第 8 格 → 第 1 格:兩格都是 0,接得起來(QA 12 含 wrap)。
- 幅度 1 邏輯 px = 母版 4 px(「微幅」)。

## WALK(8 格)

真的步行週期:1 contact(右腳前)· 2 down · 3 passing · 4 up · 5 contact(左腳前)· 6 down · 7 passing · 8 up。
身體高低:contact 0、down −1、passing 0、up +1(相對 ground,腳永遠貼地)。手臂與腳反向擺動;武器跟手;披風慢一格。
禁止:複製同一張只上下動、每格尺寸改變、腳在地上滑(遊戲端依移動距離推進格數,`cycle` = 一輪前進的 px)。

## ATTACK(8–10 格)

1 Ready · 2 Preparation · 3 Wind-up · 4 Attack begins · 5 Maximum(release)· 6 Impact · 7 Recovery · 8 Return。
export json 要標 `release`(出手格)與 `impact`(命中格)給遊戲對時。武器:手部連接正確、方向正確、清楚弧線;
Slash trail / Impact flash / Dust 放 Layer 10 VFX,不得蓋住角色本體(VFX 與角色剪影重疊 ≤ 15%)。

## HURT(4 格)

1 Normal · 2 Hit(後仰、頭偏)· 3 Knockback(最多後退 2 邏輯 px)· 4 Return。身份不變(QA 08/09)。

## DEATH(8 格)

1 Hit · 2 Stagger · 3 Fall · 4 Fall · 5 Ground · 6 Collapse · 7 Final · 8 Hold。倒地後腳底仍在 ground line(不沉進地面)。

## 各動作的實際產生方式(`pipeline/scripts/sprites/`)

| 動作 | 關鍵姿勢(AI 畫) | 其餘格(程式) |
|---|---|---|
| IDLE | 側面關鍵表第 1 格 | `make_idle.py`:身體/武器層依上表曲線位移 |
| WALK | 同待機 | `make_rigged.py`:腳底帶以兩腳中點分左右,前後交替 + 身體 contact/down/passing/up;史萊姆 `walk.mode = hop`(蹲 → 跳起 ≤3 px → 落地) |
| ATTACK | 關鍵表第 2–4 格 = wind-up / max / recovery | 1 Ready、2 Prep、8 Return 由待機位移;4、6 = 關鍵格整數平移;`stripFlash` 拿掉白色閃光(只拿周圍沒有本體色的白塊,高光/眼白/白袍保留) |
| HURT | 同待機 | 後仰 lean + 武器層位移 + 整體後退 ≤2 px |
| DEATH | 同待機 | 程式化:受擊 → 踉蹌 → 後仰 ×2 → 倒地 → 落定 → 定格。`death.fall`:`rot` 向後倒(旋轉 90°,人形、石像、樹精)、`flip` 翻肚(狼)、`sink` 沉進地面(史萊姆,地線以下裁掉、切口補描邊) |
| IDLE/WALK DOWN·UP | 正面/背面關鍵表(一張 2 格) | `make_dir.py`:縮放到側面待機身高 + 共用色盤;idle 同上曲線;walk = 兩腳輪流抬起 1–2 px、落地格身體下沉 1(史萊姆同樣跳躍) |

全部是整數位移 / 90° 旋轉 / 上下翻 / 膝帶抽列,沒有縮放或內插。

## 執行期補動作(pixel-world.js `MOTION` / `drawBodySliced`)

不改 sheet 像素,遊戲畫圖時加:整體前衝 fx、只動膝蓋以上的 ux/uy(腳固定;呼吸、走路起伏、前傾、預備後仰、受擊後仰),
攻擊命中格多停 `HIT_STOP`=70ms(英雄與魔物)。全為整數螢幕像素位移,無縮放。

## 格號表 (Frame index map)

**這一節是格號的唯一來源。** 其他規格(`WEAPON_SPEC.md`、`EQUIPMENT_SPEC.md`、QA 清單、rig 說明)要講「第幾格」時,
一律引用這張表,不再各自抄數字(TMW 的 `model/neutral.xml` 也是同一個做法:方向 → 動作 → 格號寫死一次,別處只引用)。

下表是**實際出貨的 meta**,不是設計稿(逐一讀 `assets/heroes/*.json` 得來的,不是照抄設計稿)。
「格數」與「節奏」是 7 個英雄的實測範圍,最後兩欄是拿聖騎士當具體範例。

| 動作 (action) | 用途 | 格數 `frames` | 格號 (0 起算) | `frameTime` | 節奏欄位 | 例:paladin 的 `y` / `cell` |
|---|---|---|---|---|---|---|
| `idle` | 側面待機 | 1(黑騎士 8) | 0 | 0.16 | — | y 0 / cell 100 |
| `idleDown` / `idleUp` | 正面 / 背面待機 | 1 | 0 | 0.16 | — | y 100、200 / cell 100 |
| `walk` | 側面走路 | 8 | 0–7 | 0.125(牧師、黑騎士 0.1) | — | y 300 / cell 100 |
| `walkDown` / `walkUp` | 正面 / 背面走路 | 8 | 0–7 | 0.125 | — | y 400、500 / cell 100 |
| `walkDownRight` / `walkUpRight` | 斜向走路 | 8 | 0–7 | 0.125 | — | y 600、700 / cell 100 |
| `hurt` | 受擊 | 4 | 0–3 | 0.1 | — | y 800 / cell 100 |
| `victory` | 歡呼 | 5(黑騎士 8、牧師 1) | 0–4 | 0.1 | — | y 900 / cell 100 |
| `death` | 倒地 | 8 | 0–7 | 0.1 | — | y 1000 / cell 100 |
| `skill` | 技能 | 8–9 | 0–7 / 0–8 | 0.075 | release 4 | y 1200 / cell 100 |
| `attack` | 側面攻擊(預設) | 8–9 | 0–8 | 0.075 | release 4–7 · impact 5–8 · 只有聖騎士有 `strikeDur`(5 段) | y 1300 / cell 160 |
| `attackDownRight` / `attackDown` / `attackUpRight` / `attackUp` | 八向攻擊 | 8–9 | 0–8 | 0.075 | 同該職業 `attack` | y 1460、1620、1780、1940 / cell 160 |
| `attackLeft` / `attackDownLeft` / `attackUpLeft` | 左向(烘好的鏡像列) | 8–9 | 0–8 | 0.075 | 同該職業 `attack` | y 2100、2260、2420 / cell 160 |
| `idleLeft` / `walkLeft` | 左向待機 / 走路 | 1 / 8 | 0 / 0–7 | 0.16 / 0.125 | — | y 2580、2680 / cell 100 |
| `idleDownRight` / `idleUpRight` / `idleDownLeft` / `idleUpLeft` | 斜向待機 | 1 | 0 | 0.16 | — | y 2780、2880、2980、3080 / cell 100 |
| `walkDownLeft` / `walkUpLeft` | 斜向走路 | 8 | 0–7 | 0.125 | — | y 3180、3280 / cell 100 |

- 格號是**列上的欄位序號,0 起算**:像素位置 `x = 格號 × cell`、`y = 該列在該職業 atlas 上的起點`。
  只有 meta 帶 `cols` 的列才折行(`x = (格號 % cols) × cell`、`y = 列起點 + floor(格號 / cols) × cell`);例如刺客的 `attackDown` 就帶 `cols`。
- **每個職業的 `y`、`cell`、格數都不一樣,不可跨職業硬寫**:archer 的 `attack` 在 y=1100 / cell 100、sorcerer 與 berserker 與 priest 是 cell 128、
  聖騎士 cell 160(劍與殘影伸出身體)、priest 的 `idle` 在 y=200、黑騎士 `idle` 是 8 格。上表的 `y` 只是聖騎士的範例,要切圖一定讀該職業自己的 JSON。
- 所以描述「哪一格」時要寫完整三件事:**職業 + 動作名 + 格號**(例:paladin `attack` 第 5 格 = 命中)。
- 魔物是另一套(`assets/monsters3/*.json`,cell 由 `rig.json` / `build_monster_8dir.py` 決定),不套這張表。
- **實況跟上面「階段 1」那張排程表有出入,讀 atlas 時以 JSON 為準**:idle 實際只有 **1 格**(呼吸交給執行期 `MOTION`)、
  walk 每格 **0.125 s**(排程表寫 0.1)、attack 實際 **8–9 格**,另外多出 `victory`(5 格)與 `skill`(8–9 格)。
  上面那張是「生產目標 / 規格上限」,這張才是拿來對格的。
- 目前**沒有 `sit` 動作**;死亡是 8 格,不是單格 fallback 姿勢。

## 出招計時合約 (Strike timing contract)

出招節奏是 **authored 在 sheet JSON 裡的資料**,程式只負責照著播(`src/pixel-world.js` 的 `sheetPose` / `drawMonsterSheet`):

| JSON 欄位 | 意思 |
|---|---|
| `frameTime` | 這列預設的每格秒數 |
| `strikeDur` | 出手後**逐格**秒數陣列,從 `release` 格起算,長度要等於 `frames − release`(聖騎士 attack:9 格、release 4、5 段 → 第 4–8 格各一個值)。有 `strikeDur` 就用它逐格計時,沒有才用 `frameTime` |
| `release` | 出手格號(聖騎士 4) |
| `impact` | 命中格號(聖騎士 5);沒寫時視為 `release + 1` |
| `ownTiming` | 該列自帶節奏:方向列格數跟側面 `attack` 不同時用它(例:刺客南向 41 格,總長仍要跟其他方向一樣,`pixel-world.js`:1489–1492) |

- **執行期唯一允許的拉長是 `HIT_STOP` = 0.07 s(70 ms)**:命中格開頭多停一次,英雄(`pixel-world.js`:1469、1491)與魔物(:1662,魔物以自己的 `attack.frameTime` 為基準)都一樣。
- 其他任何地方都**不得再縮放 authored 時間**:不加乘、不補固定延遲、不在 UI / 存檔 / 離線結算另算一套節奏。
- 要調手感 → 改 JSON 的 `strikeDur / release / impact / frameTime / ownTiming`,不要改程式常數;
  `HIT_STOP` 是全域打擊感參數,不是拿來微調單一動作的旋鈕。
- 動作總長 = authored 長度 + 70 ms(命中停頓);算「這一招幾秒」時要用這個和,不要只看 `frames × frameTime`。

## 附屬層可重用單格 (Attachment layers)

頭髮、披風、腰帶、尾巴這類**附屬層**不必畫滿 8 個獨立格:可以只畫一格,用「同一姿勢 + 整數 ±1 px 位移 + 重新計時」假裝在動。
TMW `hairstyles/hairstyle01.xml` 的 walk 就是重複第 0 格、`delay` 給 75 / 150 ms、`offsetY` 在 −28 / −29 之間跳;
它的 attack 是 4 份同一格、offset 依序 −27 / −28 / −25 / −24。

- 允許:同一份像素重複使用、`offsetX / offsetY` 整數位移(±1 邏輯 px = 母版 4 px)、每格 `delay` 不同。
- 不允許:縮放、非整數位移、改像素內容(換色除外)、蓋掉本體剪影(身份不變,QA 08/09)。
- 附屬層的**節奏要對齊本體那一列**(總長一致):本體 8 格 0.125 s,附屬層可以只有 2 格,但合起來要 1.0 s,不能自己跑一套時間。
- 現況:英雄現在是每職業一張烘好的 sheet(10/31 `4d40754` 起沒有配件層),所以這條規則用在村民、未來恢復的可視裝備、以及魔物小配件上;
  要重新分層時照這條做,不要又長出「每個動畫每格位移」的位移總表。
