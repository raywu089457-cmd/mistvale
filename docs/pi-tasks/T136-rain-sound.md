# T136 雨聲

Status: done
Type: audio
Accept: `node tools/checks/rain-sound.mjs && npm run verify:quick`

## Goal

T135 的陣雨只有畫面、沒有聲音——下雨天卻很安靜，很出戲。這輪補一層**雨聲**：

- **雨幕**：一段 loop 的雜訊過帶通（中心 2600Hz、Q 0.6），外加 0.09–0.14Hz 的慢 LFO
  讓中心頻率擺動（雨勢忽大忽小），增益 0.05（比風聲 0.052–0.064 略低，不搶區域底噪）
- **雨滴**：雨幕之上每 0.7–2.2 秒來一兩聲很輕的「滴」（1500–2400Hz 短正弦，峰值 0.007）
- 1.2 秒淡入、0.8 秒淡出；跟區域風聲是**兩層獨立的 bed**，可以同時存在
- 靜音、分頁切到背景、放晴都會收掉；解除靜音／回到前景且仍在下雨時會長回來

## Files

- `src/sfx.js`：`RAIN` 參數表、`makeRain/rainStop/scheduleDrips`、`export function ambientRain(on)`；
  `sfxMuted()` 靜音時一併 `rainStop()`、解除靜音時重播；`visibilitychange` 同步；
  `ambientState()` 多了 `rain / rainGain / rainTarget / rainBuilds / drips`；
  除錯鉤子 `__mistvaleAmbient.rain(on)`。
- `src/pixel-ui.js`：`frame()` 裡在 `ambientSet(...)` 之後加
  `ambientRain(!!globalThis.__mistvaleRain?.on)`——天氣由世界算好（T135），音效層只讀結果。
- `tools/checks/rain-sound.mjs`（新）。

## Decisions

- **雨聲跟天氣走、不跟區域走**：區域 bed 是「這個地方聽起來怎樣」，雨聲是「現在天氣怎樣」，
  兩者正交。所以是同一個 AudioContext 上的第二條 bed，而不是塞進 `BEDS` 表。
- **不新增第三個音量設定**：使用者只有「音效 開／關」；雨聲跟其他環境音一樣受它控制。
- **雨滴稀疏而不是固定節奏**：固定節奏聽兩分鐘就會被聽出是罐頭。
- **靜音 → 收掉、解除靜音 → 立刻重播**：跟 T108 的風聲同一個規則，不能「靜音後還聽得到雨」。

## Notes

- 檢查器流程：手勢上膛 → 把 `state.time` 調到雨天（10）→ 等 2.6 秒（淡入 1.2s 的兩倍）
  → 驗 `ambient.rain` 為真、`rainTarget>0`、且世界真的在下雨（`__mistvaleRain.on`）；
  → 再等 3.5 秒驗雨滴數增加；→ 調到乾天（60）驗雨聲收掉；
  → 靜音驗收掉、解除靜音驗回來；→ 靜態檢查 `src/pixel-ui.js` 與 `src/sfx.js` 真的有接線；
  → 驗區域風聲沒有被雨聲擠掉；手機 402x712 也驗一次。
- 實測（驗收時）：雨幕目標音量 **0.05**、雨滴 3.5 秒內響 5 次、區域底噪 `meadow` 同時存在。
- 自動化只能證明「該響的時候響、該收的時候收」，**音色好不好聽仍然要人耳判斷**；
  要調參數就改 `src/sfx.js` 的 `RAIN`（`cut/q/gain`）與 `scheduleDrips()` 的間隔／峰值。
