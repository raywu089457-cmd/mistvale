# T108 環境音層

Status: done
Type: ui/audio
Accept: `node tools/checks/ambient.mjs && npm run verify:quick`

## Goal

T105 只補了「事件音」（命中、暴擊、技能、金幣、升級…）。沒有事件的時候整個遊戲是**完全安靜**的，畫面上卻是風吹草動、鳥在飛、日夜在走——這種乾掉的空白很出戲。這一輪補一層**背景環境音**，全部即時合成（repo 裡沒有音檔，也不打算加）：

1. 每個區域有自己的底噪：`village` 村莊低頻風聲、`meadow` 草原風、`forest` 樹葉、`taiga`／`snow` 冷冽強風、`mountain` 山風、`desert` 乾風（低通濾波的白噪音＋慢速 LFO 掃頻，聽起來會「一陣一陣」）。
2. 稀疏點綴：白天鳥叫（1–3 聲短促上滑）、夜晚蟲鳴（3–5 個極短高頻咔）或森林的貓頭鷹（兩聲低鳴）。
3. 換區域／日夜切換時 0.9 秒淡入、舊的 0.7 秒淡出；音量夜間比白天低 15%。
4. 音量壓在 0.05–0.065（事件音是 0.045–0.13），只當背景，不搶命中聲。
5. 設定關掉「音效」就完全靜音（含環境音）；分頁切到背景就收掉，回來再長回來。
6. 使用者第一次手勢前不建立任何播放（自動播放政策）。

## Files

- `src/sfx.js`：`BEDS` 表（每區域的濾波頻率、Q、音量、鳥叫音高、夜晚點綴種類）、`makeBed/killBed`（交叉淡入淡出）、`chirp()`（鳥／蟲／貓頭鷹）、`scheduleSporadic()`（4.2–10 秒隨機間隔）、`ambientSet(regionId, phase)`（同區域／同時段重複呼叫會直接回來，不會每幀重建）、`ambientState()`（除錯／驗收用，含 `target` 目標音量、`chirps` 次數、`armed`）、`visibilitychange` 收合、`armed` 手勢上膛、`sfxMuted(true)` 同時收掉環境音。
- `src/pixel-ui.js`：`frame()` 裡跟 `world.setTime(...)` 一起呼叫 `ambientSet(game.state.region, (game.state.time%240)/240)`；設定面板「音效」說明補上「背景風聲與日夜蟲鳥會跟著區域換」。
- `tools/checks/ambient.mjs`（新）：驗證手勢前沒有底噪、手勢後長出來、換區域底噪跟著換、夜間音量降、靜音收掉與回復、稀疏點綴真的出現且同時發聲數不爆、底噪不會每幀重建、`pixel-ui.js` 真的有接上。

## Decisions

- 環境音跟「音效」共用同一個開關，不加第二個設定：玩家想安靜時不會想分兩次關。關掉的事件音與環境音一起消失，說明文字也寫清楚。
- 白天/夜晚用世界自己的相位（`state.time % 240 / 240`，跟 `world.setTime` 同一個來源），不另外算時間，避免畫面上是黑夜、聲音是白天。
- 稀疏點綴用 `setTimeout` 隨機間隔而不是排一串固定的音：固定節奏聽兩分鐘就會被聽出來是罐頭。
- 分頁在背景時收掉：WebAudio 在背景仍會吃 CPU，而且使用者看不到畫面時一直有風聲很怪。
- 沒有加「腳步聲」：村莊裡沒有可操控的角色在走路（視角是俯瞰整個村莊），硬加會變成沒有來源的聲音。

## Notes

- 第一版把 `ambientSet` 直接放在 `frame()` 就建了 AudioContext；改成 `armed`（pointerdown／keydown／touchstart／click 任一個先發生）之後才開始播。
- 檢查器一開始用 `element.click()` 觸發手勢，但程式化 click 不會產生 `pointerdown`，`armed` 一直是 false；把 `click` 也加進上膛事件清單。
- `gain.value` 在淡入過程中讀到的是插值中的值（0.005 之類），所以驗收改看 `ambientState().target`（設定目標音量），不要拿淡入中的瞬間值判斷。
