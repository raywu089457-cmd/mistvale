# T114 字體／顏色系統

Status: done
Type: ui
Accept: `node tools/checks/type-system.mjs && npm run verify:quick`

## Goal

使用者 2026-11-09 把目標擴成「顏色介面字體設計都能改」，這一輪把散落的字體／顏色規則整理成可檢查的系統，不動版面結構：

1. **標題字體**：`--font-title` 之前被 `#travel-veil` 引用卻從未定義（`font:700 20px/1.2 var(--font-title)` 整條簡寫失效、靜默退回繼承），補上語意別名並套到彈窗標題、面板標題、單位卡名字、獵人詳情名字。
2. **等寬數字**：`html{font-variant-numeric:tabular-nums}`——金幣／生命／材料在跳動時不會左右抖（金幣 1111/4444/7777 實測同寬 46.48px）。
3. **稀有度色票**：`RARITIES` 本來就有 5 個顏色，但只用在文字上；現在延伸到卡片左緣 3px 色條＋標籤底色／邊框，`data-rarity` 與 `--rarity` 寫在卡片根節點，一眼看得出稀有度。
4. **小字對比**：獎勵標籤 `.qs-reward>small` 9.5px 原本只有 4.56:1，改成 `#cbb894` 後 7.25:1。

## Files

- `src/pixel-style.css`：檔尾 T114 區塊（`--font-title`、`html{font-variant-numeric}`、標題字體群組、`.hunter-card::before` / `.visitor-card::before` 稀有度色條、`.rarity` 晶片、`.detail-avatar` 左緣、`.qs-reward>small` 顏色）。
- `src/pixel-ui.js`：`.hunter-card`、`.visitor-card`、`.detail-avatar` 三個節點加上 `data-rarity` 與 `style="--rarity:…"`。
- `tools/checks/type-system.mjs`（新）。

## Decisions

- **不在頁面裡 eval 一大段量測程式**：第一版把對比計算寫成字串丟進 `page.evaluate`，半透明合成那一段出了 NaN，而 `NaN < 4.5` 是 false → 檢查器靜默全過。現在頁面只回傳顏色字串鏈，對比在 Node 端算，並加上「算不出來就失敗」。
- **等寬數字用 `html` 一次套**：只對數字有影響（CJK 沒有 tabular 變體），比逐一列出 48 個用 `--font-num` 的地方可靠。
- **稀有度只加視覺，不改資料**：`RARITIES` 的顏色是規格，卡片直接吃，不再另外配一份色表。
- **獎勵標籤目標設 5.5:1 而不是 4.5:1**：9.5px 是很小的字，AA 的 4.5 對這種大小偏勉強。

## Notes

- 對比量測的有效底色＝沿祖先鏈取第一個「不透明」底色，沿途合成半透明層；`.toast` 那種 `rgba(...,.72)` 的浮層會繼續往上找，這是刻意的取捨（不做完整的 render-to-texture 取樣）。
- 檢查器在 1440x900 量：`--font-title` 解析、`.modal-title h2` 真的用它、金幣四種數字等寬、`tabular-nums` 生效、5 個稀有度色條互不相同且標籤 ≥4.5:1、六組小字對比全部量過。
- `.rarity` 晶片用 `color-mix()` 做底色；Chrome 111+ 支援，遊戲只跑 Chromium/WebView，可以接受。
