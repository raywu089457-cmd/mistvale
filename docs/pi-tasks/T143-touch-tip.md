# T143 手機手勢提示（只提示一次）

Status: done
Type: ui
Accept: `node tools/checks/touch-tip.mjs && npm run verify`

## Goal

T141 加了雙擊縮放、雙指縮放釘住指間、拖曳甩動慣性，但**沒有任何地方告訴手機玩家這些手勢存在**。
這輪在手機第一次進來時提示一次，之後不再出現。

## Files

- `src/pixel-ui.js`
  - `logToast(msg, ok = true, kind, ms = 3000)` 多一個停留時間參數（一般訊息仍是 3 秒）
  - `start()` 內、入門嚮導之前：`if (!firstRun && matchMedia('(pointer:coarse)').matches && !localStorage.getItem('mistvale-touch-tip'))`
    → 設 `mistvale-touch-tip=1`，1.5 秒後用 toast 顯示
    「雙指縮放、雙擊放大、拖曳可以甩動畫面」，停留 7 秒
- `tools/checks/touch-tip.mjs`（新）：手機首次（清 storage）→ 出現提示＋旗標寫入＋停留超過一般 3 秒；
  帶同一份 storage 再進場 → 不再提示；桌機 context → 不出現。

## Decisions

- **第一次開局不提示**：全新玩家會先看到三步驟入門嚮導，兩張東西同時出現太吵；等第二次進場
  （已有存檔）再提示手勢。因此旗標「有顯示才寫入」，第一次開局不會消耗掉這個提示。
- **用手勢 brush 的時機而不是開場**：玩家第一次開遊戲時還在讀嚮導，真正會去拖畫面的時刻是之後。
- **只對 `pointer:coarse`**：滑鼠玩家有滾輪與右鍵，不需要這則提示。

## Notes

- 檢查器第一版踩到兩個坑：一是「同一個測試裡再開一個 context」等於全新 storage，旗標當然不見
  （改成把第一個 context 的 `storageState` 帶給第二個）；二是「等 4.2 秒後還在」用錯了基準時間，
  提示實際是「start 後 1.5 秒出現、存在 7 秒」，改成偵測到之後再等 3 秒判斷。
