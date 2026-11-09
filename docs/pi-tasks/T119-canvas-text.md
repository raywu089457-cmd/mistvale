# T119 canvas 文字也換成像素字型

Status: done
Type: ui / font
Accept: `node tools/checks/canvas-text.mjs && npm run verify:quick`

## Goal

T118 只把 **DOM 文字** 換成 Ark Pixel，canvas 上畫的文字還是硬寫系統字型，於是畫面出現兩套字：
HUD 是像素字、村莊裡的建築標籤／小地圖區域名／傷害數字是平滑字。這一輪把 canvas 文字也接上：

1. `src/pixel-world.js` 新增 `textSize(n)`：把任意字級吸到 **12／24／36**（Ark Pixel 是 12px 設計，
   非整數倍會被瀏覽器平滑成糊字）。
2. 新增 `textFont(n, weight='bold')` 產生 `bold 12px "Ark Pixel 12", "Microsoft JhengHei", sans-serif`，
   系統字型只留作 fallback（字型沒載到時才用）。
3. 換掉 4 處 canvas 字型賦值：`drawScreenText`（建築標籤與世界文字，原 `size*2*k`）、
   `drawBubble`（英雄對話泡泡）、`dgText`（地下城結算文字）、`uiLabels`（區域名稱）；
   另外 `src/pixel-ui.js` 小地圖的區域名稱也一起換。
4. 把 `textFont` / `textSize` 匯出到 `createPixelWorld()` 的回傳物件，檢查器可以直接驗吸附規則。

## Files

- `src/pixel-world.js`：`TEXT_STEPS`／`textSize`／`textFont`，4 處字型賦值改用 `textFont(...)`，回傳物件匯出。
- `src/pixel-ui.js`：小地圖區域名 `g.font` 改指定像素字型。
- `tools/checks/canvas-text.mjs`（新）。

## Decisions

- **吸附而非等比縮放**：像素字型在 13px、17px 這種尺寸會被平滑；吸到 12/24/36 至少保證
  這三個尺寸是整齊的。代價是鏡頭放大時標籤字級會在 12↔24 之間跳，但比糊字好。
- **只留 3 個級距**：世界標籤在 1080p 大多落在 12～20px，再多級距會讓畫面裡同時出現很多尺寸。
- **不改 `textLabel` 的版面（背景框高度 21*k 等）**：先只換字型、量測用 `measureText`，
  版面不吃字型的固定值就不用動。實際看過村莊與對話泡泡，框還是貼的。
- **fallback 保留**：canvas 第一次畫可能比字型載入還早；保留系統字型 fallback 讓那一瞬間
  至少能顯示文字，下一幀就會換成像素字。

## Notes

- 瀏覽器只有在**第一次使用**某個 `@font-face` 時才會下載；DOM 端已經在用，所以 canvas 這裡
  不會多一次請求。
- 檢查器的做法：攔截 `CanvasRenderingContext2D.prototype.font` 的 setter，收集一幀內真正被設定的
  字型字串，斷言每個都含 `Ark Pixel 12`、字級只能是 12/24/36；另外掃原始碼，
  沒有指定像素字型的 `*.font=` 會直接失敗（`textFont(` 也算指定）。
- 世界文字的字型是每幀重設的，所以字型晚到也只是第一幀用 fallback。
- 這一步之後 canvas 與 DOM 的字型一致；剩下的字型問題只有 dpr 1 下的灰階反鋸齒（瀏覽器行為）。
