# T145 操作模式的狀態列收斂

Status: done
Type: ui
Accept: `node tools/checks/pilot-hud.mjs && npm run verify`

## Goal

T144 修掉「✕ 壓在搖桿上」之後，再看操作模式的狀態列本身：402 寬時「換角色／離開」只有 **40px 高**
（不到觸控尺寸），360 寬時兩行操作提示佔掉 32px，狀態列總高 129px，把世界畫面往下壓。

## Files

- `src/pixel-style.css` 檔尾 T145 區塊：
  - `@media(pointer:coarse){body.piloting #pilotlab .pl-head .pixel-button{min-height:44px;min-width:52px}}`
    → 觸控裝置上兩顆按鈕一律 44px 高
  - `@media(max-width:400px){body.piloting #pilotlab .pl-tip{display:none}; body.piloting #pilotlab{padding-top:8px;padding-bottom:8px}}`
    → 小螢幕收起長提示、內距收緊
- `tools/checks/pilot-hud.mjs` 擴充：狀態列按鈕 ≥44×44；≤400 寬時 `.pl-tip` 必須隱藏、
  狀態列高度 ≤100px；>400 寬時提示仍要存在（不能為了收斂把資訊全砍掉）。

## 結果

| 寬度 | 之前 | 之後 |
| --- | --- | --- |
| 402 | 按鈕 68×40 / 55×40，狀態列 116px | 按鈕 68×44 / 55×44，狀態列 120px（提示保留） |
| 360 | 按鈕 66×53 / 54×53，狀態列 **129px** | 同按鈕尺寸，狀態列 **93px**（收起兩行提示） |

## Decisions

- **只在 ≤400px 收提示**：提示對第一次玩的玩家有用，大螢幕留著；小螢幕的按鈕與搖桿本身已經
  說明操作方式，兩行字換 36px 世界畫面是划算的。
- 按鈕高度用 `pointer:coarse` 判斷而不是寬度：桌機即使視窗窄也還是滑鼠。
