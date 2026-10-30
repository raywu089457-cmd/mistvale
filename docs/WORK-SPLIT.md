# 分工架構：pi（預設模型）與 Claude

本文件規定暮影村的工作怎麼分給 pi（預設 DeepSeek v4.1 Flash）、Claude Sonnet 和 Claude Opus，目的是省下 Claude 的 token。寫於 2026-10-30。

模型分級細節見 [MODEL-ROUTING.md](MODEL-ROUTING.md)，pi 的專案規則見根目錄的 [AGENTS.md](../AGENTS.md)。

## 原則

- token 花在「讀懂程式、做判斷」。能寫成固定步驟、對錯由腳本判斷的工作，交給 pi。
- 下面這些留給 Claude：
  - 要讀懂好幾個大檔才能做的事
  - 改遊戲邏輯、時序或存檔
  - 用眼睛判斷畫面好不好看
  - 做設計決策
- 交接用**任務卡**：Claude 把工作寫成 `docs/pi-tasks/Txx-*.md`，pi 照卡執行，最後跑驗收、寫結果檔。Claude 下次只讀結果檔和 `output/ui-audit/verify-summary.md`（約 10 行），不讀原始輸出。
- 驗收一律跑 `npm run verify`（建置＋測試＋按鈕巡檢）或 `npm run verify:quick`（建置＋測試），只看摘要。

## 三層分工

| 層 | 模型 | 適合 | 不要給它 |
| --- | --- | --- | --- |
| pi | DeepSeek v4.1 Flash（預設） | 照指令執行與驗收；素材生成管線；照規格改文案與數值；照「舊字串 → 新字串」做機械式修改；文件；git 提交與推送；環境維運 | 遊戲邏輯；要看圖判斷的工作；要自己決定怎麼改的大型模板 |
| Claude Sonnet | Sonnet 5.5 | UI 版面實作（`pixel-ui.js` 模板、CSS）；素材接進遊戲；兩到四個檔的小功能 | MODEL-ROUTING 的 C 類 |
| Claude Opus | Opus 5.5（上限 high） | 獵人 AI、戰鬥時序、動畫狀態機、存檔與離線、平衡連鎖；跨檔設計；審截圖；寫任務卡 | 例行驗收、跑腳本、寫流水帳文件 |

## pi 可以接的工作

1. **例行驗收**：照 [T01-verify](pi-tasks/T01-verify.md) 跑 `npm run verify`，回報摘要原文。每次有人改完程式都可以叫 pi 跑。
2. **截圖給使用者看**：跑 `node pipeline/scripts/ui-audit/shots-all.mjs desktop|phone`，再用 send-to-telegram 把重點畫面傳給使用者。pi 不判斷好不好看，只負責截圖和傳送。
3. **l0veyou 生素材**：照任務卡的提示詞檔跑 `pipeline/scripts/l0veyou/generate.mjs`，再跑對應的 `prep_*.py`，回報檔案尺寸與大小（範例：[T03-banners](pi-tasks/T03-banners.md)）。
   - 額度用完就停下來回報，不自動換帳號（見記憶裡的素材花費規則）。
4. **PixelLab**：只有任務卡寫明預算時才用 `pixellab-assets` skill。
   - 先查 balance，生完記錄花了多少；超過預算就停。
5. **文案擴充**：例如英雄台詞（`src/hero-chatter.js`，測試會擋超過 12 字的句子，範例 [T02-chatter](pi-tasks/T02-chatter.md)）、委託說明、說明頁、物品描述。
   - 照既有格式加，不改程式邏輯。
6. **照規格改數值**：使用者講好的數字（價格、某職業攻擊等），改 `src/pixel-data.js` 對應欄位，再跑 `verify:quick`。
   - 數值會連動到別處、或測試失敗時，停下來交回 Claude。
7. **文件**：依 `git diff --stat` 和任務結果整理 HANDOFF、README 的變更紀錄。
8. **提交與推送**：使用者說「推」或「交接」時，照 [T04-push](pi-tasks/T04-push.md) 只 stage 交接文件列出的檔案，然後 commit、push，並用 `gh run watch` 看 Pages 部署結果。
9. **環境維運**：
   - 重啟 5024 遊戲伺服器（`Start-Process node server.mjs`，見 README）
   - 開 l0veyou 專用瀏覽器（CDP 9447）
   - 清 `output/ui-audit/`

## 不要交給 pi

- `src/pixel-game.js` 的獵人 AI、戰鬥、地下城、離線、存檔讀寫；`src/pixel-world.js` 的繪製順序、動畫狀態機與鏡頭（MODEL-ROUTING 的 C 類）。
- 要用眼睛判斷的工作，例如「這張圖好不好看」「排版漂不漂亮」。預設模型不擅長看圖，交給 Claude 或直接請使用者看截圖。
- `src/pixel-ui.js` 那種一行上千字的模板改版。DeepSeek 容易把反引號或引號改壞。例外：任務卡已經寫好精確的「舊字串 → 新字串」，而且附驗收指令。

## Claude 接單、拆解、派工（2026-10-30 起的預設流程）

使用者只跟 Claude 交代工作，不用自己去 pi 下指令。Claude 照下面的步驟處理：

1. **拆解與分類**：Claude 把工作切成小塊，每塊用一句英文寫下來，交給分類模型決定由誰做：
   - 指令：`node tools/classify.mjs "item 1" "item 2" ...`
   - 模型：OpenRouter `typesafe/jev-router`，透過 pi 呼叫。規則在 `docs/pi-tasks/ROUTING-RULES.md`，結果寫在 `output/pi-results/classify.json`。
   - Claude 只在分類結果明顯不對時才改判。
2. **寫卡**：pi 的部分寫成任務卡 `docs/pi-tasks/Txx-*.md`。程式修改要給精確的「舊字串 → 新字串」。
3. **派工**：`node tools/pi-dispatch.mjs docs/pi-tasks/Txx-*.md [--note "補充"]`，在背景跑，同一時間只派一張。
4. **Claude 同時做自己那塊**，但不能跟 pi 動同一個檔案。
   - 兩邊都會建置的話不要同時跑，因為建置會清掉 `outputs/media`。
5. **收單**：pi 結束後，dispatch 只印結束碼、耗時、結果檔前 30 行和 pi 改了哪些檔。Claude 檢查 `git diff` 那幾個檔，再看驗收摘要。
   - 不合格就補一句 `--note` 重派一次。
   - 還是不行就 Claude 自己接手。
6. **回報使用者**：做了什麼、誰做的、驗收結果、花了多少（l0veyou／PixelLab）。

pi 的對話記錄在 `output/pi-sessions/`，完整輸出在 `output/pi-results/Txx.log`，都不進 git。只有查問題才需要打開來看。

**語言**：agent 之間的溝通一律用英文，比較省 token，也比較不會被誤解。包括任務卡、結果檔、派工提示詞、分類規則和 pi 的專案規則 `AGENTS.md`。給使用者看的東西用繁體中文，包括 Claude 的回覆、這份文件、遊戲裡的文字、commit 訊息。

## 任務卡流程

1. Claude 照 [TEMPLATE](pi-tasks/TEMPLATE.md) 寫卡，內容要有：目標、可以改的檔案、一步一步的指令、驗收指令與通過條件、回報格式、禁止事項。
2. Claude 用 `tools/pi-dispatch.mjs` 派給 pi。使用者也可以自己在 pi 說「做 T02」。
3. pi 照卡做完，最後跑卡上的驗收，把結果寫到 `output/pi-results/Txx.md`（不進 git）。內容只放：做了什麼、改了哪些檔、驗收摘要原文、遇到的問題。
4. **失敗兩次就停**：同一個驗收失敗兩次，pi 不要自己大改，把錯誤摘要寫進結果檔交回 Claude。
5. pi 不 commit、不推，除非任務卡就是 T04 而且使用者說了「推」。

## 省 token 的配套（已經做好）

| 東西 | 用途 |
| --- | --- |
| `npm run verify` / `verify:quick` | 一個指令跑完驗收，摘要約 10 行，細節在 `output/ui-audit/` |
| `pipeline/scripts/ui-audit/buttons.mjs` | 每個畫面的按鈕真的點一次，記錄沒反應、被蓋住、太小、錯誤 |
| `pipeline/scripts/ui-audit/shots-all.mjs` | 18 個畫面各截一張，桌機與手機都有 |
| `pipeline/scripts/l0veyou/prep_*.py` | 生圖之後的裁切與轉檔，能重現，不用每次重想 |
| rtk | pi 跑 CLI 時壓縮輸出（全域 AGENTS.md 已規定） |

## Claude 這邊怎麼省

- 改程式用 Python 腳本一次做多處「舊 → 新」精確取代，每段都要剛好比對到一次。腳本留在任務卡或 scratch 目錄，pi 可以照著重跑。
- 看畫面時把很多張截圖拼成一張總覽圖，一次看完。
- 驗收只讀 `verify-summary.md`；失敗才打開對應的 log。
