# T105 程序化音效

Status: done
Type: ui
Accept: `node tools/checks/sfx.mjs && npm run verify:quick`

## Goal

整個遊戲目前**沒有任何聲音**（舊的 `src/main.js` 有一段 beep，但那個檔案不在 build 裡）。沒有音效素材，所以這一輪用 WebAudio **即時合成**一組短音效，接上介面與戰鬥，並在設定裡給一個總開關：

1. 介面：按鈕、面板開／關、錯誤提示。
2. 戰鬥：普通命中、暴擊、技能（範圍）、治療、金幣、升級、倒地。
3. 第一次使用者手勢後才建立 AudioContext（瀏覽器自動播放政策），沒有 AudioContext 的環境（node 測試）靜靜跳過。
4. 設定 ›「音效」開／關，偏好存 `localStorage['mistvale-sfx']`，重新載入仍然保留。

## Files

- `src/sfx.js`（新）：13 種音色的合成器。
  - `tone()`：振盪器＋指數包絡，`f0→f1` 滑音；`noise()`：白雜訊經過濾波器掃頻（撞擊、爆炸類的基礎）。
  - 音色表：`ui` 660→880／`tick` 520／`error` 200→120＋150→95／`coin` 1480+1980／`hit` 1500→320 帶通＋220→92／`crit` 2400→420＋300→110＋1560 金屬點／`aoe` 1300→110 低通 0.42s＋115→42／`heal` 620→940＋940→1320／`quest` 523-659-784-1046 琶音／`level` 659-784-988-1175-1568／`place` 700→90＋165→62／`open` 380→530／`close` 520→340。
  - 保護：同一個音 18ms 內重複丟掉；同時最多 10 個發聲源；每個音 ±3% 隨機微調避免機械感；任何例外都吞掉，不影響遊戲。
  - 除錯鉤子 `globalThis.__mistvaleSfx = {play, kinds, log, state, muted, volume, voices, reduced}`。
- `src/pixel-game.js`：`effect()` 裡接音效（跟 T95 的震動用同一張事件表）：技能 `aoe`、暴擊 `crit`、普通命中 `hit`（王打中獵人 gain 1.3）、治療 `heal`、金幣 `coin`、升級 `level`、倒地 `place`。
- `src/pixel-ui.js`：`[data-action]` 點擊 `ui`、錯誤 toast `error`、`openModal`/`closeModal` 的 `open`/`close`；設定新增「音效」列（`seg('sound', …)`）與 `setOpt` 的 `sound` 分支；`applySettings()` 開機讀回偏好；摘要列加上「音效 開／關」。
- `tools/checks/sfx.mjs`（新）：手勢前不播 UI 音、手勢後 AudioContext `running`、13 種音色逐一播得出、關閉後完全安靜、設定關掉後偏好寫入且重載仍靜音、`effect()` 確實接了 `hit/crit/aoe`。

## Decisions

- 全部合成、不引入音檔：repo 沒有音效素材，生成或下載都會卡在授權與體積；合成音檔在單檔 HTML 裡也是零成本。
- 併發上限 10 + 同音 18ms 節流：一群怪同時被打時不會變成機關槍，也不會有爆音。
- 音效偏好存 localStorage，不進存檔格式：音效是「這台裝置」的偏好，換裝置本來就該重設，也避免動到 `normalizeSettings`／存檔版本。
- `hit` 用帶通雜訊 + 低頻正弦而不是單純嗶聲：撞擊感來自瞬態，低頻給重量。

## Notes

- 修過一個真的 bug：`AudioContext.currentTime` 剛建立時是 `0`，原本拿 `guard()` 回傳 `0` 當「沒有 context」的哨兵，導致**第一個音永遠被吃掉**（檢查器抓到 `play('hit') === false`）。改成回傳 context 本身。
- headless Chrome 沒有音訊裝置也能建立 AudioContext，所以自動化可以驗證「有沒有播」但不能驗「好不好聽」；音色參數是照物理直覺調的（頻率、包絡、濾波），主觀部分留給使用者聽。
