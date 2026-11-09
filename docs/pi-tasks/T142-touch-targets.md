# T142 手機觸控目標 44×44

Status: done
Type: ui
Accept: `node tools/checks/mobile-touch-44.mjs && npm run verify`

## Goal

目標要求「手機版本操作順暢」。先量了實際渲染尺寸：底欄 9 顆、浮動的縮放／說明／齒輪、左上角的
家／交易／背包都是 **40px**，拇指按壓時常誤觸隔壁。這輪把可點控制項提高到 **44×44 CSS px**
（Apple HIG 與 Google Material 的共同建議值）。

## Files

- `src/pixel-style.css` 檔尾 T142 區塊（掛在 `@media(pointer:coarse) and (min-width:360px)`）：
  - `.view-tools .square`、`#reopen-left`、`.world-map-trigger`、`.skill-buttons .skill`、
    `#bottom-bar>button`、`#topbar button` 全部 ≥ 44px
  - **尺寸用 `calc(44px * var(--t52,1))`**：介面在小螢幕會整體 `zoom`（0.85～1），
    直接寫 44px 實際只畫出 37.4px；乘上 `--t52` 才是真正的 44
- `tools/checks/mobile-touch-44.mjs`（新）：402×712、360×640 兩台手機實際開瀏覽器量 24 個控制項的
  `getBoundingClientRect()`，驗證 ≥44×44、都在畫面內、互不重疊、沒有頁面錯誤。

## Decisions

- **限 360px 以上**：320 寬的舊機底欄 9 格每格只剩約 35px，硬塞 44px 會橫向溢出（按鈕跑出畫面），
  所以 320 維持原本 40px 級距，並在檢查器裡註明原因。
- **只動「按得到」的控制項**：`.res-item` 資源顯示、`#day-clock` 晝夜時鐘是資訊列，不算觸控目標，
  檢查器也會確認它們不是 `button`。
- 不改桌機尺寸：整段掛在 `pointer:coarse`，滑鼠環境完全不受影響。
- 專案既有的 T52 觸控閘門（`tools/checks/touch-targets.mjs`，門檻 40）沒有跟著提高到 44：
  那是靜態解析 CSS 的閘門、也不在 `npm run verify` 裡，這次以瀏覽器實測為準（避免兩套規則互相打架）。

## Notes

- 中途試過把 `.view-tools .square` 尺寸存進 `--t142` 再引用，但靜態 CssResolver 無法解析 var 間接引用，
  量到 0x0；直接寫 `calc(...)` 就好。
- 底欄高度一開始在 360 只有 41px：T52 的 `--t52` 補償讓高度跟著縮，這輪一併補上
  `#bottom-bar>button{min-height:calc(44px * var(--t52,1))}`。
