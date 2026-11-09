# T137 打雷（閃光＋悶雷）

Status: done
Type: weather / audio
Accept: `node tools/checks/storm.mjs && npm run verify:quick`

## Goal

T135/T136 有了雨絲與雨聲，但雨下再大都是「安靜的雨」。這輪加上**打雷**：

- 陣雨時偶爾一道**閃光**（整張畫面短暫泛白藍，約 230ms 衰減）
- 同時播一聲**悶雷**（低頻雜訊＋極低正弦，2.4 秒尾韻）
- 只有「正在下雨」時才會打雷；乾天不會

## Files

- `src/pixel-world.js`
  - `#lightning` 閃光層（`position:fixed;inset:0;pointer-events:none;z-index:3`，藍白 radial gradient）。
    **z-index 3 是刻意的**：夜色層是 `mix-blend-mode:multiply`（z-index 2），閃光若在夜色下面
    會被乘暗——夜晚打雷就看不到閃光。
  - 觸發：`const per=Math.floor(t/23)`，跨到新的一格時，如果 `per` 是偶數**而且現在下雨**就閃一次。
    用時間函數而不是隨機，所以可以重現、可以測。
  - `boltT` 每幀 −0.07（約 230ms 淡出），`opacity = boltT² * 0.58`（兩段式觀感，先亮再收）。
  - 除錯鉤子 `globalThis.__mistvaleStorm={raining,count,flash,opacity,peak}`；`peak` 是本次閃光的
    最高不透明度，因為檢查器取樣會錯過 230ms 的衰減窗口。
- `src/sfx.js`：新增 `thunder` 音色（lowpass 雜訊 1500→70Hz、2.4s、峰值 .10　＋　sine 62→33Hz 2.2s）。
- `src/pixel-ui.js`：`frame()` 比對 `__mistvaleStorm.count`，變了就 `sfx('thunder',{gain:.85})`。
  （世界決定「有沒有打雷」，音效層只負責發聲——跟 T136 的雨聲同一個原則。）
- `tools/checks/storm.mjs`（新）。

## Decisions

- **閃光層要在夜色之上**：夜色是正片疊底，閃光若在其下會被乘成灰暗，夜晚的雷就看不見。
  放在 z-index 3（與燈光同層、但比 HUD 4 低）→ 世界與燈光會被照亮，HUD 不受影響。
- **用「格」而不是機率**：`Math.floor(t/23)` 的奇偶決定，跨格才觸發一次；機率式的話
  同一秒可能連閃、也可能整場雨都不閃，無法驗收。
- **雷聲跟閃光次數連動**：避免「先聽到雷、畫面卻沒閃」的不一致。
- **不打雷的條件寫在世界裡**（`rainOn`）：乾天、雪地、減少動態都不會有雷。
- **peek hook 記峰值**：閃光只有 230ms，檢查器每次取樣都太慢；記 `peak` 才驗得到「真的有閃」。

## Notes

- 檢查器：把時間調到 `23*8-0.15 = 183.85`（下一格是第 8 格＝偶數、且那一刻在下雨
  `sin(184*.037+1.7)=0.79`），讓遊戲跑起來 → 驗打雷次數 +1、峰值 opacity 0.502、閃光層鋪滿畫面／
  pointer-events:none／z-index 3（在夜色之上）／點擊仍穿透到 world、`__mistvaleSfx.log()` 出現
  `thunder`、約半秒後 opacity 淡回 0；接著停在乾天 3 秒驗次數不變；手機同驗。
- 實測：閃光峰值 **0.502**、半秒內淡掉；乾天 3 秒內 0 次。
- 調參位置：`src/pixel-world.js` 的 `per%2` 與 `23`（頻率）、`-.07`／`.58`（速度與亮度）；
  `src/sfx.js` 的 `case 'thunder'`（音色）。
