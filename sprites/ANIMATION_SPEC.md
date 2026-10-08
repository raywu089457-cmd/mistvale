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
