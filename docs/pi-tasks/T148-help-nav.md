# T148 說明面板的段落目錄

Status: done
Type: ui
Accept: `node tools/checks/help-nav.mjs && npm run verify`

## Goal

目標要求手機操作順暢。說明面板在 402 手機上內容高 1739px、可見區只有 464px——想找「村莊設施」那段
要盲捲四、五屏。這輪在面板頂端加一條**段落目錄**（黏在頂端、點了就跳到該段）。

## Files

- `src/pixel-ui.js`
  - 說明的五個 `<section class="help-sec">` 加上 id：`help-sec-loop / -keys / -day / -facilities / -outside`
  - 橫幅後面插入 `<nav class="help-nav" aria-label="說明段落">`，五顆 `<button data-action="helpNav" data-target="…">`
  - `doAction` 新增 `helpNav`：把目標段落捲到內容區頂端下方 56px（目錄的高度），
    `prefers-reduced-motion` 時直接跳、不做平滑捲動
- `src/pixel-style.css` 檔尾 T148 區塊：`.help-nav{position:sticky;top:-20px;…;overflow-x:auto}`、
  `.help-nav-chip{min-height:34px;…}`、`:hover`／`:focus-visible`、手機 `min-height:44px`（觸控尺寸）
- `tools/checks/help-nav.mjs`（新）：桌機與手機各開一次說明，驗目錄五顆、按鈕高度（手機 44／桌機 32
  以上）、每一顆點下去目標段落要落在內容區頂端 20–110px 之間（已捲到底的情況另計）、
  捲動後目錄仍在頂端（`position:sticky` 且偏移 ≤40px）、頁面沒有橫向溢出。

## Decisions

- **用黏在頂端的 chip 目錄，不用折疊（accordion）**：折疊會把內容藏起來，玩家還是得逐一展開；
  chip 目錄是「跳過去」而不是「藏起來」，對長說明比較合。
- 目錄自己可以橫向滑（手機五顆塞不進 402px），但頁面本身不能橫向溢出。
- 跳轉位置留 56px 給目錄本身，段落標題不會被蓋住。

## Notes

- 檢查器第一版把「跳到最後一段」寫成絕對位置斷言，結果內容已經捲到底時段落永遠到不了頂端 →
  改成「已到底（`scrollTop + clientHeight >= scrollHeight - 6`）就只驗有捲動」。
