# HERO_ARCHER_001 — character spec

| 項目 | 值 |
|---|---|
| 類型 | 英雄(archer) |
| 邏輯格 / 母版 | 100 / 400(ground y=92,軸 x=50) |
| 待機身高 | 72 邏輯 px |
| 側面關鍵表 | `output/l0veyou/hv4/archer-keysD.png`(4x1:待機、攻擊 wind-up / max / recovery) |
| 正面/背面關鍵表 | `output/l0veyou/hv4/archer-dir.png`(2x1) |
| 取樣 | pixelize 到高 72 |
| 圖層 | weapon;膝帶 62–66 |
| 色盤(16 色) | #080304 #190a07 #30190d #3b5636 #4a2714 #597d51 #613319 #774120 #905027 #9f6e4b #ae6324 #c78d64 #e3aa7d #ef9b06 #f5efeb #f7c7a1 |
| 程式化參數 | `{"walk": {"stride": 6}, "attack": {"keys": {"wind": ["attack", 1], "max": ["attack", 2], "rec": ["attack", 3]}, "stripFlash": true, "dx": {}}, "death": {"proc": true}, "hurt": {"lean": [-2, -1, -1], "wdx": [-1, -1, 0], "dx": [-1, -1, -1], "wdy": [1, 1, 0]}}` |

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
