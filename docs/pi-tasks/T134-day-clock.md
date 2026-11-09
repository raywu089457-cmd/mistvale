# T134 頂部晝夜時鐘

Status: done
Type: ui
Accept: `node tools/checks/day-clock.mjs && npm run verify:quick`

## Goal

T131/T133 之後夜晚真的會暗、窗會亮，但玩家**不知道現在幾點、離天黑還有多久**——只能靠看天色猜。
在頂部加一個時鐘：第 N 天、白天／夜晚、這半天的進度條，滑過去顯示「再 1 分 30 秒後入夜」。

## Files

- `src/pixel-index.html`：`#topbar` 的 `.top-controls` 裡、設定齒輪前面插入
  `<div id="day-clock" class="day-clock" role="status"><i class="dc-dot"></i><span class="dc-tx"><b id="day-num">第 1 天</b><small id="day-phase">白天</small></span><span class="dc-bar"><i id="day-fill"></i></span></div>`。
- `src/pixel-ui.js`：`paintDayClock(s)`（插在 `function paint(force=false){` 之前），
  並在 `paint()` 尾端 `pilotStatus();paintBadges(s);paintDayClock(s);` 呼叫。
- `src/pixel-style.css`：檔尾 T134 區塊（燈號、文字、進度條、手機隱藏進度條）。
- `tools/checks/day-clock.mjs`（新）。

## Decisions

- **相位來源跟世界完全同一個**：`(state.time % 240) / 240`，`>= .5` 就是夜晚——
  這跟 `world.setTime()` 拿到的相位一致，所以時鐘寫「夜晚」時畫面一定也是夜晚。
  自己另外算時間一定會漂移。
- **第 N 天用 `time` 直接算**（`Math.floor(time/240)+1`）而不是讀 `state.day`：
  暫停中或測試直接改 `time` 時，`state.day` 不會更新，時鐘就會顯示錯的天數。
- **進度條是「這半天」的進度**（0–100%），不是整天的進度：整天的話一半時間在倒退，
  看起來像倒數條；分半天之後「快天黑了」很直覺。
- **燈號顏色換**：白天金色 `#f2c96a`、夜晚淡藍 `#93a9dd`，加上對應的微光暈。
- **只顯示、不可點**：它不是按鈕，`role="status"`；滑鼠停留看 title（再幾秒換時段），
  螢幕閱讀器讀 `aria-label`。做成按鈕會誘導玩家去點，但沒有對應的行動。
- **手機隱藏進度條**：402px 寬的 topbar 已經兩排，再塞 34px 的條會擠掉人口／難度。

## Notes

- 每 400ms 的 `paint()` 只比對 `day|白天夜晚|進度百分比` 這三個值，沒變就不碰 DOM。
- 檢查器驗四個時間點（白天 25%／75%、夜晚 25%／75%）的文字、`.night` 類別、進度百分比、
  aria-label；再驗燈號顏色晝夜不同、時鐘在 topbar 內且不與任何按鈕重疊、topbar 不橫向溢出、
  跑起來進度真的會前進（不是靜止假時鐘）、手機 402x712 不出界。
- 加了這個 chip 之後 **topbar 變高**（桌機 76、手機 88）：世界的可視範圍是照量測到的
  topbar 高度算的，所以不用另外調整；但之後若再往 topbar 塞東西，記得跑完整 verify
  （浮動元件容易互相蓋住）。
