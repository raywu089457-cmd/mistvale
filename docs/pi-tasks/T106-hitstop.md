# T106 命中停格與暴擊

Status: done
Type: ui
Accept: `node tools/checks/hitstop.mjs && npm run verify:quick`

## Goal

T95 加了鏡頭震動、T105 加了音效，但重擊在**畫面上**仍然沒有份量：命中瞬間世界照樣逐幀動。這一輪補上「停格（hitstop）」——技能命中與暴擊時，世界畫面停住 60–90ms，讓打擊感落地；並在追查「為什麼停格從來沒觸發」時，發現暴擊其實是死碼，一併修掉。

1. `src/pixel-game.js` 的 `effect()` 在 T95 震動表旁邊推停格事件：技能命中（amp ≥ 3.5）90ms、暴擊（amp 2）60ms、普通命中不停。
2. `src/pixel-world.js` 的 `update()` 收到新的停格事件時記下截止時間，期間跳過重畫（只停**畫面**，`game.tick` 照常跑，不影響戰鬥數值）；到期自動恢復。
3. 尊重「鏡頭震動」設定（關掉＝不停格）與 `prefers-reduced-motion`。
4. 停格事件不寫進存檔（`serialize()` 輸出 null）。

## Files

- `src/pixel-world.js`：`hitStopUntil/hitStopSeq/hitStopCount/hitStopSkipped` 狀態、`hitStopAllowed()`（跟 `shakeAllowed` 同一個開關）、`update()` 裡的停格判斷與恢復、`globalThis.__mistvaleHitstop()` 除錯鉤子、world 物件上的 `hitStop(ms)`。
- `src/pixel-game.js`：`effect()` 裡的停格表（技能／王擊 90ms、暴擊 60ms，同一 tick 只記一次）、`serialize()` 的 `hitstop: null`，以及**暴擊修正**：`CRIT_CHANCE = 0.15`、`CRIT_MULT = 1.5`、`rollCrit()`，四個攻擊點（法師普攻、弓箭手普攻、近戰普攻、獵人 AI 出手）與流浪英雄的出手都改成擲骰。
- `tools/checks/hitstop.mjs`（新）：注入停格事件量測、自動恢復、實戰觸發、存檔欄位、設定關閉、reduced-motion、事件表數值與原始碼正則。

## Decisions

- 只停畫面、不停模擬：停格若也停 `game.tick`，等於給玩家無敵幀，會動到戰鬥平衡；只凍結 `world.update()` 的重畫，數值照跑，純粹是視覺節奏。
- 停格比震動更長：震動 90–220ms 是「鏡頭」層級的餘震，停格是「時間」層級的頓點，60–90ms 剛好能感覺到但不會卡頓。
- 停格跟震動共用同一個開關（設定裡的「鏡頭震動」）：玩家要關掉動態效果時，兩者都該關。
- 暴擊機率 15%、倍率 1.5（平均 +7.5%）：不是為了平衡，是為了讓既有的暴擊管線（暴擊數字、crit-spray 粒子、`sfx('crit')`、震動的暴擊列）真的能用；原本的 `damage >= attack*1.25` 判定因為傷害是固定值，永遠不成立。
- 流浪英雄的出手也算暴擊：玩家在 `?preview=1`／正常畫面裡看到的戰鬥主要是流浪英雄打的，只讓獵人暴擊等於看得到的地方永遠沒有暴擊。

## Notes

- 原本的暴擊判定是死碼：`crit: damage >= h.attack * 1.25`，而 `damage = Math.max(1, Math.round(h.attack))`，兩個值永遠相等 → 暴擊、暴擊數字、crit 粒子、`sfx('crit')`、震動的暴擊列全部從上線以來沒觸發過。這是這輪最重要的發現。
- 檢查器第一次只過 7/8，卡在「30 秒內實戰沒有觸發停格（期間暴擊 0 次）」；追下去才知道 `?preview=1` 裡獵人都是待機，畫面上的戰鬥是流浪英雄打的。
- 一個 `__DBG_CRIT` 暫時標記一度留在原始碼裡，用來確認 build 真的有把原始碼打進 bundle（有打進去，之前那次「bundle 沒更新」是拿到舊的 build）。已移除。
- 停格期間 `hitStopSkipped` 會增加，檢查器就是看這個數字判斷「真的跳過重畫」。
