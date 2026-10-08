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
