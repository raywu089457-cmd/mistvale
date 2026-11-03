# WEAPON SPEC

資料夾:`sprites/weapons/{sword,axe,spear,bow,staff,dagger,shield}/`

## 每件武器的資料(`weapon_<type>_<nnn>_<ver>.json`)

| 欄位 | 說明 |
|---|---|
| Weapon ID | `WEAPON_<TYPE>_<NNN>` |
| Size | 邏輯 px(寬×高,關鍵姿勢角度) |
| Grip Point | 武器圖內握把座標 |
| Hand Anchor | 角色哪隻手 |
| Attack Arc | 攻擊時刀尖軌跡(起始角→結束角,順/逆時針) |
| Idle Position | 待機時相對 WEAPON_GRIP 的位移 |
| Walk Position | 走路時 |
| Attack Position | 攻擊各格 |

## 規則

- 武器尺寸全動畫固定(QA 07:刀身外框變化 ≤1 邏輯 px)。
- 武器相對握把的位置固定(QA 06),握把永遠在手上:武器層 = 武器 + 握它的手,一起位移,手腕不脫節。
- 不准換手、不准消失、不准穿過身體(圖層順序:武器在身體前;盾在身體前、遠側)。
- 不同角色可共用同一把武器:只要 base body 相同,用 WEAPON_GRIP anchor 疊上去。

## attackAction

`attackAction` 是「這把武器(或這個職業)出招時要播哪一個**身體攻擊列**」的欄位。用**動作名字**指定,
不要再用下面的 `Attack Position` 逐格填。值域就是該角色 sheet `meta.actions` 的鍵,目前實際存在的攻擊動作:

| `attackAction` 值 | 什麼時候用 |
|---|---|
| `attack` | 單手近戰側面(預設值;沒寫 `attackAction` 就等於這個) |
| `attackDown` / `attackUp` | 往南 / 往北的攻擊 |
| `attackDownRight` / `attackUpRight` / `attackDownLeft` / `attackUpLeft` | 四個斜向 |
| `attackLeft` | 往左的攻擊(烘好的鏡像列) |
| `skill` | 施法型武器(法杖、法球):8–9 格、`release` 4、沒有 `impact` |

- **沒有這個欄位 = 維持現狀**:現有 `weapon_*.json` 都還沒寫,所以一律當 `attack`,不會改變現在的行為。
- `attackAction` 只決定「用哪一列」,**方向仍由八向決定**;素材沒有的方向會自己退回(斜角 → 上下 → 側面),不要為了某個方向自己補假列。
- 沒有 `impact` 的列(如 `skill`)命中格預設是 `release + 1`(`pixel-world.js`:1489)。技能列走自己的時間軸(總長 = `frames × frameTime`),
  不套 `attack` 那套逐格 `strikeDur` + 命中停頓;要改技能節奏就改 `skill` 列的欄位,不要動 `attack`。出招計時見 `ANIMATION_SPEC.md`「出招計時合約」。
- 武器層本身照上面的規則不變:尺寸固定、握把在手上、不換手;`attackAction` 不會、也不可以造成武器換手。
- 新武器 / 新職業的流程:先在 JSON 寫 `attackAction` → 真的需要專屬刀尖弧線時才補 `Attack Arc`,真的要逐格微調才補 `Attack Position`。
