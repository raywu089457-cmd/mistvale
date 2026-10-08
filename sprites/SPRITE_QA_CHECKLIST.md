# SPRITE QA CHECKLIST

自動:`python pipeline/scripts/sprites/sprite_qa.py sprites/characters/<ID> <animation>`(idle)→ `qa/<anim>_qa.json`、剪影圖、縮圖。
魔物沒有武器層:6、7 不適用,改加 B3 美術尺寸。
任何一項 FAIL → 不准宣告完成,先修。標 (人工) 的項目自動化量不到,要看放大圖確認並寫進 QA report。

| # | 項目 | 自動檢查 | 門檻 |
|---|---|---|---|
| 0a | 硬像素邊 | 母版每個 4×4 區塊單色 | 全部 |
| 0b | Alpha | 只有 0 / 255 | — |
| 0c | 不超出 Cell | 剪影離格邊 | ≥ 8 母版 px |
| 1 | Character scale | 各格剪影高 | 差 ≤ 2 邏輯 px |
| 2 | Character position | 剪影 x 重心 | 漂移 ≤ 1 |
| 3 | Ground line | 各格最低列 = ground(92) | 全等 |
| 3b | 腳不漂移 | 兩腳 anchor 周圍 13×6 區塊逐像素 | 0 變化(待機) |
| 4 | Head position | 頭頂 y | 差 ≤ 2 |
| 4b | 頭不變形 | HEAD anchor 周圍 24×24 逐像素 | 完全相同 |
| 5 | Body proportion | 高/寬比 | 差 ≤ 0.05 |
| 6 | Weapon position | 刀身外框相對 WEAPON_GRIP | 完全相同 |
| 7 | Weapon size | 刀身外框寬高 | 差 ≤ 1 |
| 8 | Equipment consistency | 色彩直方圖 L1(對第 1 格) | ≤ 0.08 |
| 9 | Palette consistency | 色數、每格色集 | ≤16、每格相同 |
| 10 | Outline consistency | 剪影外圈暗色比例 | ≥ 0.55、差 ≤ 0.05 |
| 11 | Facing direction | 每格跟第 1 格同向(非鏡像)、json facing=right | — |
| 12 | Frame continuity | 相鄰格剪影變化(含 8→1) | ≤ 0.22 |
| 13/14 | 多/少肢體 | 代理:剪影連通塊數每格相同 (人工看放大圖) | — |
| 15–17 | 重複武器/浮空裝備/破剪影 | 代理:剪影 IoU 對第 1 格 (人工) | ≥ 0.85 |
| 18 | 背景污染 | 洋紅色殘留像素 | 0 |
| S | Silhouette test | 純黑剪影圖;32 px 剪影跟其他職業 IoU | < 0.8 |
| T | Thumbnail test | 縮到 64 / 32 px,孤立單像素比例 | ≤ 1% |
| H | 手部/武器連接 (人工) | 放大看手腕、握把每格連著 | — |
| V | VFX 不遮角色 (人工,攻擊/技能) | VFX 與角色剪影重疊 | ≤ 15% |

## 動態動作(walk / attack / hurt / death)— `sprite_qa_dyn.py sprites/characters/<ID>`

idle 的剛性檢查(腳、頭、武器逐像素不變)在姿勢會變的動作上沒有意義,改用下表;共通的 0a/0b/9/10/11/18/T 照上表。

| 項目 | 門檻 |
|---|---|
| A 格數 | walk 8、attack 8–10、hurt 4、death 8 |
| B 站姿身高(walk/hurt,英雄) | 對待機第 1 格 ±12%;魔物豁免,改量 B3 |
| B2 身高上限(英雄) | walk/hurt ≤ 80,attack/death ≤ 92 |
| B3 魔物美術尺寸 | 待機最長邊 = 遊戲尺寸 ×72/21 ±10%(`sprite_qa.py`);動作中 ≤ ×1.35,attack ≤ ×1.6 |
| 3 Ground line | 最低列 = ground;英雄 walk 其他格 ≥ ground−1、其餘全等;魔物 ±3;death 只看最後一格 |
| C release/impact | json 有 `release` < `impact` ≤ 格數 |
| D 受擊後退 | 剪影重心位移 ≤ 2.5 邏輯 px |
| E 腳步交替(walk) | 地面 3 列最左 x 至少 3 種;跳躍走路改看腳底高度至少 3 種 |
| 12 連續性 | 相鄰格剪影變化 walk ≤ .30、hurt ≤ .40、attack ≤ .65、death ≤ .66(rig `qaOverride.<anim>_continuity` 可個別放寬,要寫原因) |
| 13/14 連通塊 | 每格 ≤ 2 塊(8 連通) |
| 0c 不出格 | 離格邊 ≥ 2 邏輯 px |

## 正面 / 背面(idleDown / walkDown / idleUp / walkUp)— `make_dir.py` 結尾自動印

格數 8、alpha 0/255、地線(英雄 ±1、魔物 ±3)、色盤 ⊆ 角色共用色盤、英雄身高對側面待機 ±12%、描邊 ≥ 0.55、相鄰格變化 ≤ .30、離格邊 ≥ 2。

## 關鍵表驗收(生圖後、組裝前)

- `chk_keys.py`:4 格、各格格距差 ≤ 20%、待機原生高在範圍內、**2×2 重複像素檢測 dup < 0.25**(模型把像素畫成 2×2 時,偵測器會量成 2 倍高)。
- `chk_dir.py`:2 格、兩格高差 ≤ 12%、寬 < 2.2 × 高。

## rig.json 的修正旋鈕(用了要寫進 CHANGELOG)

`weaponMetalMin`(武器亮度門檻,暗色/木製武器調低)· `weaponSatMax`(武器飽和度上限,預設 30 = 金屬;木製武器放寬到 ~90)· `dirFeetGapAxis`(背面:兩腳之間的縫對到軸線,高的那隻腳貼回地線)· `outlineTarget`(關鍵格描邊比例下限)· `keyDespeck`(關鍵格小於 N px 的碎塊清掉)·
`keyBridge`(與主體距離 ≤ N 的分離塊用連線補成一體)· `rigged.despeck.<anim>`(動作格碎塊門檻)· `qaOverride`。

## 不可接受(任何一項 = FAIL)

每幀比例不同 · 頭忽大忽小 · 腳漂移 · 武器消失/換手 · 披風消失 · 裝備改變 · 顏色改變 · 面向改變/變正面 ·
(正面/背面列例外,但同一列內不可改變方向)
抗鋸齒/模糊/非像素邊 · 背景污染 · 多手多腳 · 武器穿過身體 · 超出 Cell · Frame 排列錯誤
