# MONSTER_WOLF_001 — character spec

| 項目 | 值 |
|---|---|
| 類型 | 魔物(wolf) |
| 邏輯格 / 母版 | 160 / 640(ground y=152,軸 x=80) |
| 待機身高 | 82 邏輯 px,美術最長邊目標 106(遊戲尺寸 31 ×72/21) |
| 側面關鍵表 | `output/l0veyou/hv4/mon3-wolf-keysA.png`(4x1:待機、攻擊 wind-up / max / recovery) |
| 正面/背面關鍵表 | `output/l0veyou/hv4/wolf-dir.png`(2x1) |
| 取樣 | pixelize 到高 82 |
| 圖層 | 無(魔物沒有武器層);膝帶 70–78 |
| 色盤(15 色) | #23110b #301811 #493027 #57514a #686660 #807d77 #8f8c87 #92714c #9b332d #b3aa98 #bf9b6c #dc5047 #e3c393 #fce1a9 #fcf8f3 |
| 程式化參數 | `{"walk": {"stride": 5}, "attack": {"keys": {"wind": ["attack", 1], "max": ["attack", 2], "rec": ["attack", 3]}, "stripFlash": true, "dx": {}}, "death": {"proc": true, "wk": 0, "fall": "flip"}, "hurt": {"lean": [-2, -1, -1], "wdx": [0, 0, 0], "dx": [-1, -1, -1], "wdy": [0, 0, 0]}, "despeck": {"attack": 80}}` |

## 動畫

| 動作 | 格數 | 每格秒數 | 循環 |
|---|---|---|---|
| idle | 8 | 0.16 | 是 |
| walk | 8 | 0.1 | 是 |
| attack | 8 | 0.075 | 否 |
| hurt | 4 | 0.1 | 否 |
| death | 8 | 0.12 | 否 |
| idleDown | 8 | 0.16 | 是 |
| walkDown | 8 | 0.1 | 是 |
| idleUp | 8 | 0.16 | 是 |
| walkUp | 8 | 0.1 | 是 |

左向 idleLeft / walkLeft = 側面鏡像(`export_game.py`)。
