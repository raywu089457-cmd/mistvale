# T131 夜晚：真的變暗＋門前暖光

Status: done
Type: ui / world-render
Accept: `node tools/checks/night-lights.mjs && npm run verify:quick`

## Goal

晚上的村莊原本幾乎跟白天一樣亮。原因是夜色只是「半透明藍色疊層」：

```js
background:#202b4f; opacity: 0 ~ 0.15
```

半透明藍**不會讓畫面變暗，只會把它洗淡**（深棕色的屋頂甚至被洗亮），所以夜裡看起來
反而比白天更灰、更亮。這輪：

1. 夜色改成 `mix-blend-mode: multiply` 的藍紫層（`#5a6aa8`），強度 0 → 0.85。
   正片疊底是真的把每個像素乘暗，夜晚才有夜晚的樣子。
2. 每棟**已建造**建築的門前地面加一圈暖光（radial gradient）。光亮會隨時間微微呼吸。

## Files

- `src/pixel-world.js`
  - 夜色覆蓋層 `nightLayer`：加 `mix-blend-mode:multiply`，顏色 `#5a6aa8`，強度 `Math.sin((phase-.5)*2π)*.85`。
  - 新增 **燈光層** `lightsCanvas`（`position:fixed; z-index:3; pointer-events:none`）：
    為什麼要獨立一層——夜色是正片疊底，畫在世界畫布上的暖光也會被乘成藍灰色
    （實測 `#fff4d6` 核心被壓成 rgb(106,111,133)），所以燈必須畫在夜色**上面**，
    再用 `globalCompositeOperation='lighter'`（加法混合）疊上去。
  - 燈的位置：建築繪製時把 sprite 矩形與**不透明範圍**（`spriteBounds`）記進 `glowSpots`，
    取 `x=(bb.x0+bb.x1)/2*w`、`y=bb.y1*h`——圖片底部常有透明留白，用 `rect.y+rect.h`
    會把光打在牆上（第一版就是這樣，光變成一片蓋在房子正面的霧）。
  - 除錯／驗收鉤子 `globalThis.__mistvaleNight={strength,pools,ids,pts}`。
- `tools/checks/night-lights.mjs`（新）。

## Decisions

- **正片疊底而不是加深 alpha 的藍色**：實測 0.15 → 0.26 的藍色層只是讓畫面更灰；
  換成 multiply 之後同一個 0.85 才真的把亮度壓到 0.52 倍。
- **燈另外一層 canvas**：夜色必須在世界之上（否則不會壓到世界），
  燈又必須在夜色之上（否則被乘藍）。用 z-index 2（夜色）／3（燈光），HUD 從 4 起，互不干擾。
- **燈只畫在「門前地面」**：用 sprite 不透明範圍的底緣定位，光落在地上才像燈光灑出來。
- **關掉「夜晚」設定時燈光層也要清乾淨**（`setNight(false)` → `nightLast=0` → 清空 overlay），
  否則關掉夜晚後地上還留著上一幀的燈。
- **手機也開**：10 個 radial gradient 的成本很低（單層 canvas、每幀一次清空）。

## Notes

- 檢查器驗四件事：
  1. 夜色層的 `mix-blend-mode` 必須是 `multiply`、z-index 2、`pointer-events:none`、鋪滿畫面；
  2. 6 個世界取樣點的亮度中位數比例 < 0.75（實測 0.52），HUD 那一排亮度不變（128 → 128）；
  3. 每盞燈的取樣點 R 明顯大於 B（實測 +31 / +66 / +25）；
  4. `view.setNight(false)` 之後 `strength=0`、`pools=0`。
- 除錯順序（記下來避免重蹈）：先看到「夜晚反而更亮」→ 判斷是半透明藍洗淡 → 改 multiply；
  接著燈不見了 → 用洋紅色測試確認座標對但顏色被乘掉 → 改成獨立 overlay canvas。
- 燈的位置第一版用互動矩形（`hits`）＝會偏上，光會壓在牆面；第二版用 sprite 矩形仍偏高，
  第三版改用不透明範圍 `bb.y1` 才落到地面。
