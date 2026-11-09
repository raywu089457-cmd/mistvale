# T120 畫面色調（暗角＋上方暖光）

Status: done
Type: ui / visual
Accept: `node tools/checks/screen-grade.mjs && npm run verify:quick`

## Goal

整張畫面目前亮度是均勻的：中央村莊與邊角的海／草地一樣亮，看起來「平」，視線也沒有落點。
加一層**純 CSS 的色調疊層**：

- 暗角：`radial-gradient` 邊緣壓到 50%（中央 38% 以內完全不變）。
- 上方暖光：頂端 `rgba(255,206,140,.07)`，底部略壓暗 26%，讓天／地有方向感。
- 只蓋世界層（z-index 1）：HUD、面板、卡片都在 3 以上，顏色完全不受影響。
- `pointer-events:none`：不吃任何點擊。
- `prefers-contrast:more` 時整層關閉；手機另給一組較輕的參數（小螢幕邊角面積大，壓太重會悶）。

## Files

- `src/pixel-index.html`：`<canvas id="world">` 後面加 `<div id="screen-grade" aria-hidden="true"></div>`。
- `src/pixel-style.css`：檔尾 T120 區塊（兩層漸層、手機參數、對比度偏好）。
- `tools/checks/screen-grade.mjs`（新）。

## Decisions

- **用 CSS 疊層而不是改 canvas 繪製**：canvas 每幀重畫（GL 與 2D 兩條路徑），
  在繪製流程裡加暗角會多一次全畫面合成；CSS 疊層由瀏覽器合成器處理，幾乎免費，
  而且完全不碰像素繪製程式碼（風險最低）。
- **只壓世界、不壓 HUD**：HUD 的文字與金色裝飾是刻意調過對比的；疊層壓上去會讓
  `type-system` 量到的對比失真。用 z-index 1 讓疊層落在 canvas(0) 與 HUD(≥3) 之間。
- **中央 38% 完全不變**：暗角只該「收邊」，不該讓玩家覺得畫面變暗。
- **不用 `mix-blend-mode:multiply`**：multiply 會連同底下的 canvas 一起變色，
  在不同顯示器上偏色明顯；直接在疊層裡用半透明黑比較可控。
- **對比度偏好直接關掉**：這是純裝飾層，使用者要求更高對比時應該移除。

## Notes

- 檢查器的像素比對方式：同一頁面截兩張（開／關疊層），把兩張 PNG 用 `data:image/png;base64`
  丟回頁面、畫進 canvas、`getImageData` 取樣 → 不需要任何影像套件。
  實測：`corner-tl 127.2 → 110.9`、`corner-bl` 比例 0.67、中央 Δ0、HUD Δ0。
- 必須先 `state.paused = true` 再截圖，不然兩張之間魔物會走動，邊角的差異會混進動畫雜訊
  （第一版就踩到：差異平均只有 1.85，其實是羊在走）。
- `elementFromPoint` 因為 `pointer-events:none` 不會回傳疊層，這正好用來驗「點擊穿透」；
  另外用 `view.hitRects()` 取一棟建築的畫面座標，確認那個點仍是 `world`。
- 顏色參數都集中在 T120 區塊；要調強弱只改那裡（手機在 media query 內另有一組）。
