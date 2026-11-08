# T100 — 隊員卡（派遣／地下城／競技場）

Status: done
Type: ui

## Goal

派遣出征、地下城、競技場三個「挑隊員」畫面的卡片只有頭像＋名字＋等級，看不到攻擊、防禦、射程與生命數字，選人時得靠記憶。改成跟獵人名冊同一套語言：頭像、名字、`Lv.N · 職業`、⚔ 攻擊／🛡 防禦／近戰·遠程章、生命條＋`目前/上限` 數字；選中要有明顯的圓形 ✓ 徽章與金光，倒下要壓暗並顯示 ✝。

## Files

- `src/pixel-ui.js` — 新增 `partyPick(h,action,sel,note)`,三個模板（`toggleDispatchHunter` / `toggleDungeonHunter` / `toggleArenaHunter`）改用它
- `src/pixel-style.css` — T100 區塊（grid 三段、`.pp-*` 文字與生命條、狀態徽章、未入隊壓暗、手機與窄桌機斷點）
- `tools/checks/party-pick.mjs` — 新檢查器

## Decisions

- 手機（≤430px）縮圖與攻防字級，360px 時 `.party-grid` 改單欄，否則兩欄只剩 ~49px 給文字。
- 「在別的隊伍」這種次要註記只在 >980px 顯示；手機與窄桌機收起來，避免擠掉 `Lv.N · 職業`。
- 原本 `#modal[data-type=...]` 的 `#placement` 等版面規則不動；`.dispatch-party .party-pick .pp-hp` 的 90px 限寬改成跟著卡片伸縮。
- 選中／倒下狀態沿用 `aria-pressed` + `.selected` / `.down`，同時把 ✓ / ✝ 放進圓形徽章。

## Accept

`node tools/checks/party-pick.mjs && npm run verify:quick`（另跑過完整 `npm run verify`）

## Notes

卡片是三個畫面共用的元件，之後改一處三個地方一起變。找 `partyPick(` 就知道三個呼叫點。
