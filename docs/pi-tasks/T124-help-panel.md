# T124 說明面板：核心循環＋分段卡片

Status: done
Type: ui
Accept: `node tools/checks/help-panel.mjs && npm run verify:quick`

## Goal

說明面板原本是五張並排的文字卡（操作／村長／獵人／變強／村外），每張都是一整段散文，
看不出「先做什麼、再做什麼」，也沒有提鍵盤快捷鍵。這輪改成有先後順序的五段：

1. **核心循環**（四步橫條＋箭頭）：選人出征 → 收成回村 → 交易與花費 → 建設再變強。
2. **基本操作**：三條重點＋鍵盤快捷鍵表（Space／M／1–7／Q·E／Esc）。
   手勢說明依裝置切換：滑鼠是「拖曳平移、滾輪縮放」，觸控是「單指拖曳、雙指縮放」。
3. **獵人的一天**：三條（有自己的錢與需求／外出狩獵帶回材料金幣經驗／需求太低會拖慢成長）。
4. **村莊設施與用途**：**直接從 `BUILDINGS` 推導**（13 項：名稱＋`effect`），
   等於一份「哪棟建築能幹嘛」的對照表。
5. **村外內容**：委託所、地下城三人遠征、競技場、地圖首領。
6. 頁尾：「重看開場」按鈕 → 叫回 T121 的三步入門嚮導（`welcomeReplay`）。

## Files

- `src/pixel-ui.js`：`type==='help'` 模板整段改寫（`loop`／`keys`／`facilities`／`bullets` 輔助），
  `doAction` 新增 `welcomeReplay`。
- `src/pixel-style.css`：檔尾 T124 區塊（`.help-sec`／`.help-h`／`.hl-*` 循環橫條、`.help-keys` 快捷鍵表、
  `.hf-grid` 設施表、`.help-foot`；手機循環改直向、箭頭轉 135°）。
- `tools/checks/help-panel.mjs`（新）。

## Decisions

- **設施表由資料推導**：跟 T123 倉庫一樣，說明不要維護第二份文案；改建築的 `effect` 時說明自動同步。
  檢查器直接 `import {BUILDINGS} from '../../src/pixel-data.js'` 逐項比對 id／名稱／effect 文字。
- **快捷鍵表放進「基本操作」而不是另開一段**：玩家找「怎麼按」時不會往下翻第二段。
- **核心循環用箭頭而不是編號清單**：四個階段的關係是「然後」，不是「項目 1~4」；箭頭在手機轉成向下。
- **「重看開場」放在頁尾**：它是補充功能，不該跟主要內容搶位置；同時讓 T121 的入門嚮導可重播。

## Notes

- 循環橫條在桌機是 `flex` 四欄等寬＋3 個箭頭；手機 `flex-direction:column`、箭頭轉向下，
  檢查器驗「四個步驟左緣只有一個 x」。
- 快捷鍵表用 `<dl>`（`dt` 鍵名／`dd` 說明），桌機兩欄、手機單欄。
- 設施表 `grid-template-columns:repeat(2,minmax(0,1fr))`，每列「名稱（nowrap）＋作用（可換行）」，
  手機單欄。
- 原本的 `.help-grid`／`.help-card` 樣式還在檔案裡但已無人使用（沒有清掉，避免誤刪其他面板共用的 class）。
