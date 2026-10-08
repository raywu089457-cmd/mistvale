# HERO_PALADIN_001 — character spec

| 項目 | 值 |
|---|---|
| 類型 | 英雄(paladin) |
| 邏輯格 / 母版 | 100 / 400(ground y=92,軸 x=50) |
| 待機身高 | 71 邏輯 px |
| 側面關鍵表 | `output/l0veyou/hv2/paladin-idle-v1.png`(4x1:待機、攻擊 wind-up / max / recovery) |
| 正面/背面關鍵表 | `output/l0veyou/hv4/paladin-dir.png`(2x1) |
| 取樣 | unfake 真像素 |
| 圖層 | crest, weapon;膝帶 62–65 |
| 色盤(16 色) | #050204 #1d1312 #3f353e #4a4e6d #5774d3 #5f657e #7d6856 #918f8a #ab7233 #b2a286 #cec5b2 #d5903c #ecac52 #f1e8d1 #f3d6b6 #fac76f |
| 程式化參數 | `{"walk": {"stride": 8}, "attack": {"keys": {"wind": ["attack", 1], "max": ["attack", 5], "rec": ["attack", 6]}}, "death": {"keys": {"hit": ["death", 1], "fall1": ["death", 2], "fall2": ["death", 3], "ground": ["death", 4], "collapse": ["death", 5], "final": ["death", 7]}}}` |

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
