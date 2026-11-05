# 暮影村 (mistvale) — 模型與 effort 分級

完整任務清單見 [docs/MODEL-ROUTING.md](docs/MODEL-ROUTING.md)。

## 規則
- 預設:Sonnet 5.5 medium。美術管線腳本(build_hero.py、sheet 對齊、update-*.py)用 Sonnet high。
- 高風險邏輯(獵人 AI、戰鬥時序、存檔/委託結構、方向與動畫狀態機、跨大檔重構)
  **派給 `game-logic-opus` 子代理**(固定 Opus)。
- Opus 上限是 high(硬性規定),任何模型都不使用 xhigh / max。

## 省 token:派工給 pi(主要做法)
- 能派就派:卡片只靠規則寫得出來(不必先讀程式)、對錯能用一條指令驗收 → 派給 pi。要先讀程式才寫得出卡:先派 `Type: scout` 偵察卡,只讀 pi 回的簡報再寫實作卡。
- 開卡:`node tools/pi-card.mjs <slug> --accept "npm run verify:quick" <<'EOF'`(內文只寫 Goal / Files / Steps,寫函式名不要寫行號;共同規則已在派工提示詞裡)。
- 派工:`node tools/pi-dispatch.mjs T30 T31 ...` 背景跑一次(`run_in_background`),只在完成通知時醒一次、只讀它最後的輸出——不要用會逾時的前景指令等、不要中途查看(每次醒來快取過期就重寫整段上下文,實驗 5 一張卡多花 ~335k);不要從子代理派工;它會自己跑 `Accept:`、失敗自動重派一次、記帳到 `docs/pi-tasks/cost-log.csv`。`accept PASS` 就是證據,不用自己重跑驗收。
- **預設寫「只有目標」的卡**:`node tools/pi-card.mjs <slug> --goal-only --accept "<cmd>"|auto`,內文只寫 `## Goal`。pi 自己規劃 → 實作 → 驗收 → 另一個 pi 審核(有 high 自動重做，最多 3 次)。每張卡只印一行;`DONE accept:PASS scope:ok review:OK` 就是證據。
- Opus 判斷只花在兩處、只讀 pi 的濃縮檔，不讀程式:有設計取捨的卡加 `Gate: plan`(停在規劃，讀 `Txx.plan.md` 後 `--approved --note "方向"`);結果行下面出現 `opus:<原因>` 時讀那份 diff,再 `node tools/pi-dispatch.mjs --opus-verdict Txx ok|missed|fixed "說明"` 記帳。
- 派工期間主對話不要改檔(範圍檢查會算到 pi 頭上)。
- 執行者:2026-11-05 起預設是 dsh(DeepSeek Harness,`tools/dsh-overlay.yml`,沙箱關閉;實驗 9、10 最便宜/最快)。下文的「pi」泛指派工執行者;要換回 pi 用 `DISPATCH_AGENT=pi`(也可 `opencode`)。
- 一批工作 = 一兩次寫卡 + 一次派工 + 一次讀總表;不要輪詢。批與批之間開新 session 或 /clear。
- 細節與實測:[docs/DISPATCH-PLAYBOOK.md](docs/DISPATCH-PLAYBOOK.md)(平常不必打開)。

## 你(主對話)該做的
1. 收到任務先分類(上方「規則」的高風險清單就夠,拿不準才查 docs/MODEL-ROUTING.md)。屬於「Opus 負責」就用 Agent 工具派給 `game-logic-opus`,不要自己硬做。
2. 做 Sonnet 任務時,同一個 bug 修兩輪仍失敗,或發現問題其實是狀態/時序/存檔類:停手,改派 `game-logic-opus`,並告知使用者。
3. 若使用者的任務明顯需要提高 session effort(例如 Sonnet high 仍不夠),提醒使用者切換,不要自行假設已切換。

## 驗證
- 一律 `npm test`。動到動畫/方向/素材另跑 check_facing、check_anim、audit_hero_sheet。
- 完成後如實回報驗證結果,失敗就說失敗。

## 角色美術規格
- 權威只有 `sprites/SPRITE_VISUAL_BIBLE.md` 與 `sprites/` 其他文件(清單見 Bible 第 0 節)。生英雄/魔物提示詞用 `output/l0veyou/prompts/make_hv_prompts.py`。
- 其他文件裡的角色描述都不是規格,不要照做。

## 檔案地圖
新 session 先讀 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，不要整檔讀 pixel-game.js / pixel-world.js。
查某個函式/匯出做什麼、在第幾行：用 Grep 在 [docs/API-pi.md](docs/API-pi.md) 找名字（不要整檔讀，18KB）（pi 產生，124 個匯出行號已用 `node tools/check-api-lines.mjs docs/API-pi.md` 驗證；改了 src 後行號會漂移，需要時重跑 T09 再產生）。
