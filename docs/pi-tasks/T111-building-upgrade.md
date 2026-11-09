# T111 建築面板的升級預覽

Status: done
Type: ui
Accept: `node tools/checks/building-upgrade.mjs && npm run verify:quick`

## Goal

點一棟建築時，右側面板只寫「建築 Lv.2」、作用一句話、需求幾個圖示加數字，然後一顆看起來永遠可按的升級鈕。
玩家不知道：升上去會變怎樣？我現在夠不夠？為什麼點了只跳紅字？

這一輪把面板變成「升級前就看得懂」：

1. 等級行 + 一句 **升級到 Lv.N**（或 `建造後 Lv.1`、`已達最高等級 Lv.5`）。
2. **作用**保留，但如果有真數字就寫差額（綠字）：小屋 `獵人名額 10 → 12`、大廳 `其他建築上限 Lv.2 → Lv.3`。
3. **需求**改成 `現有/需要` 的 chip（重用 T101 的 `needChips`）：不足的整塊標紅。
4. 一句**原因**：資源足夠 → 「資源足夠，按下去就會升級。」；不足 → 「金幣 還缺 461」；
   大廳等級不夠 → 「需要城鎮大廳 Lv.3（目前 Lv.1）」；滿級 → 「這棟建築已經滿級，不需要再升級。」
5. 升級鈕在不能升時**停用並換字**（`已達最高等級`／`先升級大廳`／`升級 Lv.N`），不要按下去才靠 toast。

## Files

- `src/pixel-ui.js`：`paintInspector()` 重寫，新增 `costName / costMissing / missText / upgradeView / upgradeDelta`；
  `needChips()` 的名稱補上 `金幣`／`寶石`（以前資源 key 會直接印英文 `gold`）。
- `src/pixel-style.css`：`/* ===== T111：建築面板的升級預覽` 區塊（`.inspect-next`、`.inspect-delta`、
  `.inspect-cost`、`.inspect-note`／`.short`、停用鈕可讀性、手機字級）。
- `tools/checks/building-upgrade.mjs`（新）。

## Decisions

- **只有小屋與大廳寫差額**：其他建築的等級目前不會改變任何數字（只受大廳上限限制、影響功能解鎖），
  硬寫一個「升級後 +X%」會是編的，跟程式對不上；寧可只寫「升級到 Lv.N」。
- **需求用 `現有/需要`**：跟 T101 交易所／製作一致，玩家不用再去左上角資源列心算。
- **原因寫在按鈕上方而不是 tooltip**：手機沒有 hover。
- **停用鈕保留金色外框但壓暗、字換掉**：純灰掉的按鈕看起來像壞掉，寫「已達最高等級」才說得清楚。
- **重用 `game.getUpgradeCost()`**：不要在 UI 重算 `1.6 ** (lv-1)`，兩邊遲早不同步。

## Notes

- **手機面板打架（按鈕巡檢抓到）**：面板多了「下一級／需求／原因」三行後變高，手機上從 310px 長到 375px 高，
  開始蓋住左側抽屜裡的「查看委託」。修法：手機上兩塊面板不能同時開——
  （a）開抽屜（`toggleLeft`）時收起建築面板；（b）選建築（`inspect`）時收起抽屜。
  教訓：**面板長高不是無害的改動**，改完一定要跑 `node pipeline/scripts/ui-audit/buttons.mjs phone`。
- 大廳上限規則是 `lv + 1 > hall + 1`（也就是其他建築最多可以到 `hall + 1`），驗收用這個規則設案例。
- 驗收用 `__mistvaleView.hitRects()` 找建築的可點矩形再換算畫面座標；不要自己用 `project()` 猜，
  建築的互動點在正面中央，跟 sprite 邊界不是同一件事。
- 面板每次 `paint()` 都重建 innerHTML（沿用原本寫法）；如果之後覺得 fps 掉，再改成簽章比對。
