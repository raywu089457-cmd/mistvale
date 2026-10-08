# HERO_PRIEST_001 — character spec

| 項目 | 值 |
|---|---|
| 類型 | 英雄(priest) |
| 邏輯格 / 母版 | 100 / 400(ground y=92,軸 x=50) |
| 待機身高 | 71 邏輯 px |
| 側面關鍵表 | `output/l0veyou/hv4/priest-keysA.png`(4x1:待機、攻擊 wind-up / max / recovery) |
| 正面/背面關鍵表 | `output/l0veyou/hv4/priest-dir.png`(2x1) |
| 取樣 | unfake 真像素 |
| 圖層 | weapon;膝帶 56–65 |
| 色盤(16 色) | #030102 #24140a #726b62 #915720 #a97939 #ae9f86 #c7c1b3 #dd8f3c #efd2b2 #f0ac4a #f6c45d #f6e4c6 #faf3d5 #fbf6e4 #fdcc6e #fde278 |
| 程式化參數 | `{"walk": {"stride": 7}, "attack": {"keys": {"wind": ["attack", 1], "max": ["attack", 2], "rec": ["attack", 3]}, "stripFlash": true, "dx": {}}, "death": {"proc": true, "wk": 0, "lk": 1, "dk": 0}, "hurt": {"lean": [-2, -1, -1], "wdx": [-1, -1, 0], "dx": [-1, -1, -1], "wdy": [1, 1, 0]}, "despeck": {"attack": 130}}` |

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
