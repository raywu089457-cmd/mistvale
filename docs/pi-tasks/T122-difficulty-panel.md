# T122 狩獵難度面板：寫出真正的倍率與「不能選的原因」

Status: done
Type: ui
Accept: `node tools/checks/difficulty-panel.mjs && npm run verify:quick`

## Goal

難度面板原本只有兩行小字（「魔物強度 ×N」「需要轉世 N 次」），看不出**解鎖到哪、還差幾次**，
而且沒解鎖的難度按鈕是可按的——按下去只換來一個紅色 toast。這輪把決策需要的資訊放到卡上：

1. 面板上方一條摘要：`目前 初級 · 累計轉世 0 次`。
2. 每張卡三列比較表：
   - 魔物生命 ×`d.mult`
   - 魔物攻擊 ×`d.mult`
   - 金幣・經驗 ×`sqrt(d.mult)`（遊戲真的是用 `Math.sqrt` 加成，不是線性）
3. 解鎖條件寫成進度：`需要累計轉世 3 次（目前 0）`，未達成標紅；達成後寫 `轉世 3 次解鎖`。
4. 未解鎖：卡片 `.locked`（淡化＋去飽和）、`aria-disabled="true"`、按鈕停用並寫「未解鎖」。
5. 目前難度：卡片金框＋`目前` 徽章、按鈕停用並寫「目前難度」。
6. 標題說明改成講清楚代價：難度會同時提高魔物生命與攻擊，金幣經驗只有小幅加成（開根號）。

## Files

- `src/pixel-ui.js`：`type==='difficulty'` 模板改寫（`rb`＝全體獵人轉世加總、`diff-summary`、卡片 `dl.diff-stats`、`diff-now` 徽章、`diff-gate`、鎖住時停用）。
- `src/pixel-style.css`：檔尾 T122 區塊（摘要條、倍率列、徽章、解鎖進度、鎖住淡化、手機單欄）。
- `tools/checks/difficulty-panel.mjs`（新）。

## Decisions

- **解鎖進度看「全體獵人轉世加總」**：`game.setDifficulty()` 就是這樣算的
  （`state.hunters.reduce((s,h)=>s+h.rebirths,0)`），不是村莊的 `counts.rebirths`。
  檢查器同時把兩者刻意設成不一致（獵人 3、counts 0）來證明 UI 跟規則一致。
- **金幣經驗寫 ×√mult 而不是照抄「增益」**：實測程式是 `Math.round(data.gold*Math.sqrt(multiplier))`，
  寫成 ×mult 會讓玩家以為報酬等高，是錯的資訊。
- **未解鎖的卡片留著不隱藏**：玩家需要看到「後面還有什麼、要幾次轉世」才有目標；只把它做成不可按。
- **切換成功仍然關窗**：維持既有行為（關窗＋toast），不改成原地重畫——避免和 liveModal 的節奏打架。

## Notes

- 卡片名稱在 DOM 裡含「目前」徽章，檢查器比對名稱時要把徽章文字剝掉（`h3.textContent.replace(nowTxt,'')`）。
- 切換難度成功後 `#modal` 的 `dataset.type` 仍是 `difficulty`（`closeModal()` 只隱藏 backdrop、不清 dataset），
  檢查器改看 `#modal-backdrop.hidden` 判斷是否關閉，再重新開啟驗「目前」標記。
- 手機上 5 張卡改成單欄（原本 2 欄會讓倍率列折行），卡高約 278px。
- 這輪只改 UI，沒有動 `setDifficulty()` 的規則與平衡。
