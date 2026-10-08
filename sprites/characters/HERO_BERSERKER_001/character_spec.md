# HERO_BERSERKER_001 — character spec

| 項目 | 值 |
|---|---|
| 類型 | 英雄(berserker) |
| 邏輯格 / 母版 | 100 / 400(ground y=92,軸 x=50) |
| 待機身高 | 73 邏輯 px |
| 側面關鍵表 | `output/l0veyou/hv4/berserker-keysA.png`(4x1:待機、攻擊 wind-up / max / recovery) |
| 正面/背面關鍵表 | `output/l0veyou/hv4/berserker-dir.png`(2x1) |
| 取樣 | unfake 真像素 |
| 圖層 | weapon;膝帶 61–64 |
| 色盤(16 色) | #020101 #110806 #402416 #5b2c16 #643a22 #706b66 #84827e #8a4a26 #972b17 #a35b33 #c3aa99 #cc825b #d51a12 #ecd4bc #f2c69c #f6b180 |
| 程式化參數 | `{"walk": {"stride": 7}, "attack": {"keys": {"wind": ["attack", 1], "max": ["attack", 2], "rec": ["attack", 3]}, "stripFlash": true, "dx": {}}, "death": {"proc": true, "wk": 0, "lk": 0.45, "dk": 0, "fall": "rotcw"}, "hurt": {"lean": [-2, -1, -1], "wdx": [0, 0, 0], "dx": [-1, -1, -1], "wdy": [0, 0, 0]}}` |

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
