# MONSTER_GOLEM_001 — character spec

| 項目 | 值 |
|---|---|
| 類型 | 魔物(golem) |
| 邏輯格 / 母版 | 176 / 704(ground y=168,軸 x=88) |
| 待機身高 | 107 邏輯 px,美術最長邊目標 113(遊戲尺寸 33 ×72/21) |
| 側面關鍵表 | `output/l0veyou/hv4/mon3-golem-keysA.png`(4x1:待機、攻擊 wind-up / max / recovery) |
| 正面/背面關鍵表 | `output/l0veyou/hv4/golem-dir.png`(2x1) |
| 取樣 | pixelize 到高 107 |
| 圖層 | 無(魔物沒有武器層);膝帶 92–103 |
| 色盤(15 色) | #080504 #0e4f5b #212213 #354222 #3bd8e2 #4b4a2e #5c4d3b #678b2e #695944 #76664e #847459 #928064 #9e8b70 #ae9c77 #f4f7fb |
| 程式化參數 | `{"walk": {"stride": 5}, "attack": {"keys": {"wind": ["attack", 1], "max": ["attack", 2], "rec": ["attack", 3]}, "stripFlash": true, "dx": {}}, "death": {"proc": true, "wk": 0}, "hurt": {"lean": [-2, -1, -1], "wdx": [0, 0, 0], "dx": [-1, -1, -1], "wdy": [0, 0, 0]}, "despeck": {"attack": 80}}` |

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
