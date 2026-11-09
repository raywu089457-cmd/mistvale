# T130 鐵匠鋪煙囪冒煙

Status: done
Type: ui / world-render
Accept: `node tools/checks/chimney-smoke.mjs && npm run verify:quick`

## Goal

村莊是靜止的：有蓋好的鐵匠鋪、有火光、有聲音（T113 的打鐵聲），但畫面上看不到任何「有人在用」
的痕跡。這輪讓**鐵匠鋪的煙囪冒煙**——一整列小煙球從煙囪口往上飄、邊飄邊變大變淡。

## 問題（順手發現的既有 bug）

`src/pixel-world.js` 原本就有一段冒煙程式，但它只畫在「程序繪製的備援圖」分支：

```js
if(!conceptSprite && ['forge','enhancement','restaurant','inn','hall'].includes(b.id)){ … }
```

而所有建築現在都有 atlas 圖（`conceptSprite` 永遠存在），所以那段程式從加入圖集之後就再也沒跑過——
整座村莊一直沒有煙。這輪把它改成畫在**最後的動態層**（建築層會被凍結成靜態快取，畫進去煙會凍住）。

## Files

- `src/pixel-world.js`：
  - `let smokeSpot=null;`：建築繪製時記下鐵匠鋪煙囪口的螢幕座標
    （`smokeSpot={x:rect.x+rect.w*.855,y:rect.y+rect.h*.02}`）。
  - 動態層的煙：`(state.buildings.forge||0)>0` 且非 `prefers-reduced-motion` 時畫 12 顆煙球，
    位置由 `elapsed` 決定（不存粒子陣列，避免存檔／回溯問題）：
    `t=((elapsed*rate+i/12+.03*lv)%1+1)%1`、`rise=(2+t*42)*k`、`sway=(sin(t*2.7+i*1.9)*1.2+sin(t*7.3+i*.7)*.6+(t-.5)*5)*k`、
    尺寸 `(2.4+t*6.6)*k`、透明度 `pow(1-t,1.15)*.7`，靠近煙囪口偏灰、上面偏白。
  - 每顆煙用三個 `fillRect` 疊（切四角＋亮面），避免看起來是一串方塊。
  - 除錯鉤子 `globalThis.__mistvaleSmoke={count,minY,spot,last}`。
- `tools/checks/chimney-smoke.mjs`（新）。

## Decisions

- **畫在動態層而不是建築層**：建築會被凍結成靜態快取（`bgCache`），畫進去的煙會定格。
- **用時間算位置，不維護粒子陣列**：不需要每幀 push/shift、不用存檔、暫停/換區域也不會漏粒子。
- **12 顆互相重疊**：第一版只畫 4 顆、間距 25px，看起來像一串點；12 顆重疊才是一縷連續的煙。
- **靠近煙囪口是灰煙、越上面越白越淡**：真實煙囪口是濃煙，遠處才變淡。
- **`prefers-reduced-motion` 時完全不畫**：這是持續的環境動畫，屬於該被關掉的類型。
- **只有鐵匠鋪**：atlas 圖裡只有它有明確的煙囪；其他建築強加煙會沒有來源。

## Notes

- 檢查器用三種方式驗「真的有煙」，不只驗計數器：
  1. 幾何：12 顆都在煙囪口上方 120px 內、y 隨生命週期遞減、alpha 遞減；
  2. 動態：最高點隨時間改變；
  3. **像素**：同一個框（60×110）比較「有煙／沒煙」兩張截圖，改變的像素比例不得低於 2%
     （實測 25.8%）。
- 除錯過程：煙一開始完全看不見。先用洋紅色 8×8 方塊畫在同一個座標，確認「畫布與座標沒問題、
  只是煙太小太淡」（2–4px、alpha 0.02–0.39），再放大到 6–18px、alpha 0.7。
- PowerShell 對 `node -e` 的巢狀引號/反引號/`||` 很不友善，一律寫成 `output/*.mjs` 再跑；
  python 的 `Image.NEAREST` 單行寫法也一樣，改成腳本檔。
