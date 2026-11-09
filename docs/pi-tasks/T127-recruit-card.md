# T127 招募卡：加入後的體質與金幣不足的狀態

Status: done
Type: ui + game-api
Accept: `node tools/checks/recruit-card.mjs && npm run verify:quick`

## Goal

招募訪客的卡片只有「職業名稱、稀有度、性格、費用」，玩家看不到**請進來會是什麼體質**，
也不知道自己的金幣夠不夠——按下去才被紅色 toast 打回來。這一輪：

1. 卡片多一列體質預覽：**攻擊／防禦／生命**＋`近戰`／`遠程` 標籤（都是 Lv.1、無裝備、無轉世的起始值）。
2. 金幣不足：整張卡淡化（`.broke`）、按鈕停用並改寫「還缺 N 金幣」。
3. 稀有度色條（T114 的 `--rarity`）本來就有，維持不變。
4. 卡片上的數字**必須等於真的招募進來的那位獵人**——所以預覽直接呼叫遊戲自己的 `updateStats`。

## Files

- `src/pixel-game.js`：新增 `visitorPreview(v)` 到 createGame 的 API：
  用 `updateStats` 算一個「等級 1、無裝備、無轉世」的暫時物件（跟 `newHunter()` 剛建立的狀態一致），
  回傳 `{attack, defense, maxHp, range}`。**不複製公式**，之後調整平衡時卡片會自動跟著變。
- `src/pixel-ui.js`：`type==='recruit'` 的卡片模板改寫（`.visitor-stats` 三項、`.broke`、按鈕文案）。
- `src/pixel-style.css`：檔尾 T127 區塊（體質列、近戰／遠程小標、金幣不足的淡化與按鈕配色）。
- `tools/checks/recruit-card.mjs`（新）。

## Decisions

- **預覽走遊戲層而不是 UI 自己算**：`updateStats` 有等級、稀有度、轉世、技能、武器、性格五種加成，
  在 UI 重寫一次一定漂移。檢查器也是拿 `game.visitorPreview()` 當期望值，並在真的招募後
  比對新獵人的實際體質——這條才真的證明「卡片沒說謊」。
- **金幣不足時卡片淡化但仍顯示完整資訊**：直接隱藏卡片會讓玩家不知道「再存幾金幣就能請到誰」。
- **按鈕文案改成缺口**（`還缺 250 金幣`）而不是只停用：停用但寫「邀請加入 300 金幣」看不出差多少。
- **近戰／遠程用 `range >= 5` 判斷**：跟隊員卡（T100）同一套規則。

## Notes

- 檢查器注入三個固定訪客（傳說法師 300／普通弓箭手 90／優良祭司 160），先給 1000 金幣驗可按，
  再給 50 金幣驗 `.broke`＋「還缺 N」；另外按下其中一位並比對新獵人體質與扣款。
- 重新給金幣後必須**先關掉彈窗再開**（`Escape` → 再開）才會重畫，直接改 state 不會觸發 paint。
- 卡片標籤的解析要注意：生命那一項的 `textContent` 前面還有「近戰／遠程」小標，所以檢查器用
  `includes('生命')` 而不是 `startsWith`。
- 如果 `visitorPreview` 之後被拿去做別的用途（例如顯示「比村裡最強獵人高一階」），記住它是
  「起始體質」不是「滿等潛力」。
