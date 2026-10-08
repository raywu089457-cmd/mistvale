# MONSTER_OGRE_001 — character spec

| 項目 | 值 |
|---|---|
| 類型 | 魔物(ogre) |
| 邏輯格 / 母版 | 144 / 576(ground y=136,軸 x=72) |
| 待機身高 | 96 邏輯 px,美術最長邊目標 96(遊戲尺寸 28 ×72/21) |
| 側面關鍵表 | `output/l0veyou/hv4/mon3-ogre-keysA.png`(4x1:待機、攻擊 wind-up / max / recovery) |
| 正面/背面關鍵表 | `output/l0veyou/hv4/ogre-dir.png`(2x1) |
| 取樣 | pixelize 到高 96 |
| 圖層 | 無(魔物沒有武器層);膝帶 82–92 |
| 色盤(15 色) | #030302 #1b1d17 #2e3228 #43403a #524f45 #588964 #5f5c4f #659a72 #6a6658 #7aab82 #887d66 #8cc094 #a0cca4 #ab9d81 #f8f6f7 |
| 程式化參數 | `{"walk": {"stride": 3}, "attack": {"keys": {"wind": ["attack", 1], "max": ["attack", 2], "rec": ["attack", 3]}, "stripFlash": true, "dx": {}}, "death": {"proc": true, "wk": 0}, "hurt": {"lean": [-2, -1, -1], "wdx": [0, 0, 0], "dx": [-1, -1, -1], "wdy": [0, 0, 0]}, "despeck": {"attack": 80}}` |

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
