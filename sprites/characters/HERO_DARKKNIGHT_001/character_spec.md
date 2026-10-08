# HERO_DARKKNIGHT_001 — character spec

| 項目 | 值 |
|---|---|
| 類型 | 英雄(darkknight) |
| 邏輯格 / 母版 | 100 / 400(ground y=92,軸 x=50) |
| 待機身高 | 70 邏輯 px |
| 側面關鍵表 | `output/l0veyou/hv4/darkknight-keysA.png`(4x1:待機、攻擊 wind-up / max / recovery) |
| 正面/背面關鍵表 | `output/l0veyou/hv4/darkknight-dir.png`(2x1) |
| 取樣 | unfake 真像素 |
| 圖層 | weapon;膝帶 62–65 |
| 色盤(16 色) | #000000 #0f0606 #13110e #231311 #24231e #33312c #6c4744 #6f3634 #712625 #761314 #957b79 #ac4447 #bc1515 #d7696e #f53433 #f9f2f5 |
| 程式化參數 | `{"walk": {"stride": 6}, "attack": {"keys": {"wind": ["attack", 1], "max": ["attack", 2], "rec": ["attack", 3]}, "stripFlash": true, "dx": {"max": -9, "wind": -3, "rec": 0}, "beginDx": 2}, "death": {"proc": true}}` |

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
