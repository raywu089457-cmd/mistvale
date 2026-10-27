# 魔物 8 向走路 — 共用的那一份 prompt

21 隻魔物**全部貼同一段**（不要改字，改字每個方向的步態就會不一致）。
Same creature, same colours, same pixel size, same low top-down 3/4 view; it never turns toward the viewer. Animate ONE 8-frame walk cycle on the spot: no travel, no camera move.
f1 standing; f2 weight down, front foot planted; f3 passing, back foot lifted; f4 weight up; f5 opposite contact; f6 weight down; f7 passing, other foot lifted; f8 weight up back to f1.
With legs: alternate left and right clearly, small knee bends, body bobs 1-2 px, arms swing a little. Without legs (blob, bug, tree, snowman, spirit): keep the body rigid and bounce instead - squash 1 px on the contact frames, lift 2 px on the passing frames.
A weapon or prop stays gripped in the same hand and only swings with the arm. No new effects, dust, cast shadow, text, outline change or new colours; keep the outline weight and the shading identical. Background perfectly flat magenta #FF00FF, nothing touching the canvas edge.

---

## 怎麼用（PixelLab 網站）

1. 先把「8 方向旋轉圖」匯入成一個角色：Create → Import（8 方向各一張，建議先縮成 128×128）。
   Rotate 產生的圖**不是角色**，不能直接 animate。
2. Animate → Animate with text（v3）：
   - directions：**8 個方向全選**
   - frames：**8**
   - **keep first frame**：開（第 1 格 = 原本站姿，接待機不會跳）
   - 動作描述：貼上面那一段
3. 生完下載 8 個方向的條圖（每向 8 格、256×256 或 128×128，跟匯入尺寸一致）。

## 花費（每隻）

| 做法 | 次數／隻 | 21 隻 | 動作 |
|---|---|---|---|
| 内建模板 `walking-8-frames` | 8（1／方向） | 168 | 步幅很小，適合長袍角色 |
| **這份 prompt（v3、128 畫布 8 格）** | 16（2／方向） | 336 | 自然、有膝蓋彎與身體起伏 |
| 這份 prompt（v3、256 畫布 8 格） | 64（8／方向） | 1344 | 不必要，畫布大一倍成本四倍 |

→ 建議 **128 畫布＋這份 prompt**。匯入時把 256 的旋轉圖每 2 px 取 1 就是原生的 128。

## 為什麼這樣寫

- **「Same creature / same colours / same pixel size / never turns toward the viewer」**：PixelLab 生動畫時很容易把角色重畫成別的角度或改比例，先鎖死。
- **逐格寫動作（f1…f8）**：一份總結式的描述會生出「大致在走」的動畫；逐格寫接觸／下沉／通過／抬升，8 格才會真的交替。
- **「沒有腳的身體用彈跳」**：21 隻裡面有 7 隻沒有明顯的腿（蕈菇、仙人掌、冰甲蟲、雪人、花妖精、白樺樹精、雪兔偏跳躍），同一個 prompt 要能同時處理，所以才寫成條件句。
- **「武器留在同一隻手」**：狼人的斧、地精的鎬、木乃伊的彎刀、巨魔的木棒，晃動時很容易換手或變形。
- **「no cast shadow / no dust」**：遊戲自己會投影、自己畫揚塵，圖上再畫一份會變兩層。
- **洋紅底**：跟其他素材一致的色鍵，去背用得上。

## 已經有的（不用重生）

牧師的走路是用内建模板生的：`output/pixellab-incoming/priest-walk/dl/walking-8-frames-<方向>/`（5 向 × 8 格），
方向東／東南／南／東北／北，左邊三向用鏡像（走路時兩手空著，不會有換手問題）。
