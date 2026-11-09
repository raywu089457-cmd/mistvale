# T115 設定面板分區 + 稀有度色條延伸到隊員卡

Status: done
Type: ui
Accept: `node tools/checks/settings-groups.mjs && npm run verify:quick`

## Goal

延續 T114 開放的「顏色／介面」範圍，這輪做兩件事：

1. **設定面板分區**：原本是 13 列一路排下去（畫質→影子→夜晚→震動→音效→手動操控→開發者→匯出→重置），
   沒有資訊架構。改成四個區塊，每區一個標題＋細線＋該區目前狀態摘要：
   - 畫面與效能（畫質／解析度／幀率／影子／夜晚／介面大小）
   - 手感與聲音（鏡頭震動／音效）
   - 操控與教學（手動操控）
   - 存檔與資料（開發者作弊／匯出存檔／重新開始）
2. **稀有度色條延伸到隊員卡**：派遣／地下城／競技場的隊員卡（T100）只寫名字與數值，
   選人時看不出稀有度。卡片左緣加 3px 色條（跟名冊卡片同一套 `--rarity`），
   倒下的隊員色條壓暗。

## Files

- `src/pixel-ui.js`：
  - `type==='settings'` 模板改成 `<section class="set-sec" data-sec="perf|feel|control|data">` ＋
    `<h4 class="set-sec-h"><span>區名</span><small>摘要</small></h4>`；摘要拆成 `summary`（畫面）與
    `feelSummary`（震動／音效），避免「畫面與效能」的摘要混進音效。
  - `partyPick()` 加 `data-rarity` 與 `style="--rarity:…"`（顏色彩 `RARITIES`）。
- `src/pixel-style.css`：T115 區塊（`.set-sec` / `.set-sec-h` / `.party-pick::before`，手機縮小與摘要換行）。
- `tools/checks/settings-groups.mjs`（新）。

## Decisions

- **區塊標題不用圖示**：四個區名都很抽象（手感、存檔），硬配圖示反而干擾；改用金色短豎條＋細線，
  跟既有的 `.qs-banner`／`.party-summary` 語言一致。
- **摘要寫在區塊標題列**：13 列各自都有一句說明，但「現在是什麼狀態」只有摘要講得清楚；
  捲到中間時標題列就是當前狀態。
- **隊員卡色條 3px**：卡片本身只有 242px 寬，再寬會壓縮名字與數值；3px 跟名冊卡一致。
- **倒下的隊員色條 opacity .35**：倒下已經有灰階濾鏡，色條跟著壓暗才不會像還活著。

## Notes

- 設定列現在全部包在 `<section>` 裡：改行時如果漏了結尾，會出現「列落在分區外」的症狀，
  檢查器直接數 `content.querySelectorAll('.setting-row')` 與 `closest('.set-sec')` 的差。
- 分區摘要會變（震動 開→關），檢查器會切換一次設定再驗，避免摘要寫死。
- `partyPick` 用 `::before` 畫色條，卡片本身要 `position:relative`（T115 區塊補上）；
  倒下狀態的 `filter:grayscale()` 會連 `::before` 一起灰掉，所以另外降低 opacity。
- 派遣面板要先給 `state.buildings.dungeon=3` 才進得去（跟 T100 檢查器同一個前置）。
