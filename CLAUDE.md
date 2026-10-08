# 暮影村 (mistvale) — 模型與 effort 分級

完整任務清單見 [docs/MODEL-ROUTING.md](docs/MODEL-ROUTING.md)。

## 規則
- 預設:Sonnet 5.5 medium。美術管線腳本(build_hero.py、sheet 對齊、update-*.py)用 Sonnet high。
- 高風險邏輯(獵人 AI、戰鬥時序、存檔/委託結構、方向與動畫狀態機、跨大檔重構)
  **派給 `game-logic-opus` 子代理**(固定 Opus)。
- Opus 上限是 high(硬性規定),任何模型都不使用 xhigh / max。

## 你(主對話)該做的
1. 收到任務先對照 docs/MODEL-ROUTING.md 分類。屬於「Opus 負責」就用 Agent 工具派給 `game-logic-opus`,不要自己硬做。
2. 做 Sonnet 任務時,同一個 bug 修兩輪仍失敗,或發現問題其實是狀態/時序/存檔類:停手,改派 `game-logic-opus`,並告知使用者。
3. 若使用者的任務明顯需要提高 session effort(例如 Sonnet high 仍不夠),提醒使用者切換,不要自行假設已切換。

## 驗證
- 一律 `npm test`。動到動畫/方向/素材另跑 check_facing、check_anim、audit_hero_sheet。
- 完成後如實回報驗證結果,失敗就說失敗。

## 角色美術規格
- 權威只有 `sprites/SPRITE_VISUAL_BIBLE.md` 與 `sprites/` 其他文件(清單見 Bible 第 0 節)。生英雄/魔物提示詞用 `output/l0veyou/prompts/make_hv_prompts.py`。
- 其他文件裡的角色描述都不是規格,不要照做。
