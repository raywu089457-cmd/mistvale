# T133 夜晚窗光

Status: done
Type: world-render
Accept: `node tools/checks/night-windows.mjs && npm run verify:quick`

## Goal

T131 讓夜晚真的變暗，也讓每棟建築門前的地上有暖光；但房子本身還是暗的——看起來像
「地上有燈、屋裡沒人」。這輪補上**窗光**：夜裡每棟已建造建築的窗戶透出暖光，
像村裡真的有人住。

- 每棟 1–3 顆窗光（依建築種類，表驅動）
- 窗光有兩層：外圈淡淡的暈＋窗芯暖琥珀（`rgba(255,222,164,…)`）
- 亮度隨時間微微呼吸（`prefers-reduced-motion` 時固定不閃）
- 畫在 T131 的燈光層 canvas（z-index 3，加法混合），所以不會被夜色乘暗

## Files

- `src/pixel-world.js`
  - `const NIGHT_WINDOWS={…}`：每種建築的窗戶位置（0..1，相對於 sprite 的**不透明範圍**）。
    `hall / house / inn / tavern / restaurant / forge / enhancement / academy / clinic / dungeon / arena`
    各有 1–3 個座標；沒列到的建築用 `[[.42,.46]]` 置中一顆。
  - 在 T131 的地面光迴圈後面補窗光：位置 `wx=gs.x+(bb.x0+(bb.x1-bb.x0)*fx)*gs.w`、
    `wy=gs.y+(bb.y0+(bb.y1-bb.y0)*fy)*gs.h`，尺寸 `max(3,4.6*scale) × max(2,3.4*scale)`，
    先畫 2.8 倍外框當暈、再畫窗芯。
  - `__mistvaleNight` 多了 `windows`（顆數）與 `winPts`（每顆的螢幕座標＋所屬建築 id）。
  - `prefers-reduced-motion` 時 `wf` 固定 0.88（光留著、不閃）。
- `tools/checks/night-windows.mjs`（新）。

## Decisions

- **窗戶位置用「表」而不是圖分析**：建築 sprite 是整張點陣圖，沒有窗戶的圖層資訊。
  用比例表可以由截圖快速迭代（改一行、重畫、看差多少），也不必碰美術檔。
- **用不透明範圍（`spriteBounds`）當基準**：sprite 四周常有透明留白，直接用整張矩形定位，
  窗光會浮在房子外面。
- **窗芯改成暖琥珀**：第一版用近白色 `rgba(255,240,206)`，夜裡看像貼了一張白紙；
  壓成琥珀色之後才像「屋裡的燈」。
- **檢查器直接讀燈光層 canvas 的像素**：起初拿截圖比「夜晚 vs 白天哪個亮」，
  但白天屋頂本身就很亮（金棕色），窗光反而比較暗，會誤判。燈光層是獨立的 overlay，
  白天必須全透明、夜裡該亮的地方必須 `alpha>40 且 R>200 且 R−B>40`——這才是乾淨的判斷。

## Notes

- 實測（驗收時）：10 棟建築 / 15 顆窗光；窗芯像素例 `rgba(255,220,155,166)`，`R−B=100`。
- 白天燈光層 `maxAlpha` 取樣必須 ≤4（否則代表上一幀的燈沒清掉）。
- 減少動態偏好下窗光仍存在（15 顆），只是亮度固定。
- 表位置目前是「大概對」：若是之後換了建築美術（sprite 換圖），
  `NIGHT_WINDOWS` 的比例需要重調；改法就是調那張表再跑截圖。
