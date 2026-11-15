# 模型分級:哪些工作交給誰

原則:有自動驗收會立刻抓錯的,用 Sonnet;錯了不會馬上暴露、事後才炸的,用 Opus。

## A. Sonnet 5.5 medium(日常預設)
- UI 與文案:`pixel-ui.js`、`pixel-icons.js` 的版面、按鈕、提示文字、繁中措辭
- 資料與數值:`data.js`、`pixel-data.js` 的建築/道具/獵人屬性、價格、掉落、稀有度數值調整
- 新增內容:加一種建築、道具、委託文字、配件(沿用既有格式)
- 小 bug:單一函式、單一檔案內可定位的錯
- 測試:補寫 `test-*.mjs` 的案例
- 文件:README、HANDOFF、PROVENANCE 更新
- 建置與部署:`build.mjs`、`server.mjs`、PWA、OTA 設定的例行調整
- 機械式修改:改名、搬檔、格式、樣式

## B. Sonnet 5.5 high(美術管線與多檔案實作)
- `build_hero.py` 與 sprite sheet 組裝:格子對齊、鏡像、頭頂錨點、色數限制(≤16 色)
- `update-*.py`、`patch_art.py`、`align-concept.py`、`render-concept.py` 等腳本
- 魔物/英雄新素材接入:`drawMonsterSheet`、`monsterSheetPose` 沿用既有邏輯的擴充
- 需要先讀懂 2–4 個檔案才能做的新功能(例如新建築加上互動視窗與資料)
- 效能調校:像素渲染、繪製批次、資源載入
- 依賴 audit 腳本把關的工作(audit_hero_sheet、check_facing、check_anim)

判斷:出錯時腳本或測試會明確報紅,Sonnet 可自行迭代。

## C. Opus 5.5 high(派給 game-logic-opus)
1. **獵人自動狩獵 AI**:行為決策順序(狩獵/交易/吃飯/喝飲品/睡床/治療/買裝備)、優先級、金幣經濟與卡死/餓死/迴圈問題
2. **戰鬥時序**:蓄力 `attackTimer`、出手 `atkAt`、受擊 `hitAt`、死亡/倒下、技能與普攻的幀對應、傷害結算順序
3. **動畫與方向狀態機**:`moveDir` 軸判斷、停下沿用最後方向、左/右鏡像列、上/下/側面切換、閃格與 z-order
4. **存檔與委託結構**:存檔格式變更、舊存檔遷移、8 個委託章節的進度狀態、自動存檔與 JSON 匯出匯入相容性
5. **經濟與成長平衡的連鎖影響**:強化精煉、轉世、教技能、訓練對整體數值的連動(改一處會影響多處)
6. **跨大檔重構**:拆分 `pixel-world.js`(1500+ 行)、`pixel-game.js`,或更換渲染/更新迴圈架構
7. **難重現的 bug**:偶發、與時序/順序有關、只在長時間遊玩或特定存檔出現的問題
8. **新系統設計**:競技場 NPC、地下城、森林魔王等需要先設計規則、狀態與資料結構的新玩法

判斷:錯誤不會被 `npm test` 立刻抓到,需要推理整個系統的不變量。

## D. 升級與降級規則
- Sonnet medium 失敗 → 先升 Sonnet high 再試一次。
- Sonnet high 同一問題修兩輪仍失敗,或發現其實屬於 C 類 → 改派 game-logic-opus。
- 任務明顯屬 C 類 → 一開始就派 game-logic-opus,不先試 Sonnet。
- Opus 只用於 C 類;簡單任務不要用,浪費額度。
- Opus 上限是 high(硬性規定),不得使用 xhigh / max。同樣適用於 Sonnet。

## E. 交付要求(所有層級)
- `npm test` 必跑;動畫/方向/素材另跑 check_facing、check_anim、audit_hero_sheet。
- 存檔相關變更必須附舊存檔載入測試。
- 如實回報驗證結果與剩餘風險。
