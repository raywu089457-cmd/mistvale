# MONSTER_TREANT_001 — character spec

| 項目 | 值 |
|---|---|
| 類型 | 魔物(treant) |
| 邏輯格 / 母版 | 224 / 896(ground y=216,軸 x=112) |
| 待機身高 | 171 邏輯 px,美術最長邊目標 171(遊戲尺寸 50 ×72/21) |
| 側面關鍵表 | `output/l0veyou/hv4/mon3-treant-keysA.png`(4x1:待機、攻擊 wind-up / max / recovery) |
| 正面/背面關鍵表 | `output/l0veyou/hv4/treant-dir.png`(2x1) |
| 取樣 | pixelize 到高 171 |
| 圖層 | 無(魔物沒有武器層);膝帶 150–167 |
| 色盤(15 色) | #0a0503 #180c07 #2e250b #425e12 #4f3013 #557918 #633e18 #678e1e #716821 #764b1f #79a125 #865726 #94632e #b5824d #f3f0f0 |
| 程式化參數 | `{"walk": {"stride": 11}, "attack": {"keys": {"wind": ["attack", 1], "max": ["attack", 2], "rec": ["attack", 3]}, "stripFlash": true, "dx": {}}, "death": {"proc": true, "wk": 0}, "hurt": {"lean": [-2, -1, -1], "wdx": [0, 0, 0], "dx": [-1, -1, -1], "wdy": [0, 0, 0]}, "despeck": {"attack": 80}}` |

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
