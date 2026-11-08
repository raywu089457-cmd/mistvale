# T103 村長委託：章節鏈排版

Status: done
Type: ui
Accept: `node tools/checks/quest-chain.mjs && npm run verify:quick`

## Goal

委託面板是 8 章線性章節，但排起來像「一疊清單」：獎勵整排浮在中間、沒有跟標題對齊；狀態（已完成／未解鎖）擠在最右邊一欄、跟標題離很遠；章節之間沒有任何連接感；上方橫幅只寫「第 3 章／共 8 章」，看不出解鎖到哪。這一輪把它排成一條真正的時間軸：

1. **左側時間軸**：圓章（01/02/✓）固定在同一條垂直線上，章節之間用 2px 接線連起來；已完成綠線、目前金線、未解鎖褐線。
2. **標題與狀態同一列**：標題靠左、狀態做成膠囊貼齊標題列右緣（已完成 ✓／可領取／進行中／未解鎖＋鎖頭圖示）。
3. **獎勵靠左**：`獎勵` 小標＋材料晶片，對齊標題左緣，不再漂浮在中間；鎖住的章節也保留說明與獎勵可預覽。
4. **橫幅補資訊**：`第 3 章／共 8 章 · 已解鎖 4 章`，可領取時多一個「本章獎勵可領取」提示。
5. **進度條**：目前章節有 `role="progressbar"`、aria-valuenow/max、`1/3` 文字與實際寬度一致。

## Files

- `src/pixel-ui.js`：`type==='quests'` 模板重寫（`.qs-head`／`.qs-tag`／`.qs-reward`／`.qs-progress`／`.qs-banner`＋`.qs-meta`，`aria-current="step"`、`role="progressbar"`）。
- `src/pixel-style.css`：T103 區塊（時間軸接線、圓章對齊、狀態膠囊、獎勵列、橫幅 meta、手機 760px 以下縮排與換行）。
- `tools/checks/quest-chain.mjs`：3 種寬度（1440x900／402x712／360x640）檢查上面 5 點；`$env:SHOTS='1'` 另外輸出 `output/quests/montage.png`。

## Decisions

- 狀態做成標題右側的膠囊而不是最右欄：右欄只留下會動的「領取獎勵」按鈕，視線從標題往右就能看到章節狀態。
- 時間軸接線用 `.quest-step::after`（2px、`bottom:-20px` 跨越章節間距），不另外加 DOM 節點，避免 `listHTML()` 的資料結構被 UI 細節污染。
- 鎖住的章節仍然顯示說明與獎勵（可預覽），只是整體降低飽和度並標鎖頭；比照 T102「讓玩家在按之前就知道結果」的方向。

## Notes

- `已解鎖 N 章` = 已完成章數（`index + (可領取 ? 1 : 0)`）+ 1，夾在 `list.length` 以內。
- 手機（≤760px）標題允許換行（桌機單行省略），領取鈕獨占一列靠右。
