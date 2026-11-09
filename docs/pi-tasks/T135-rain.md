# T135 雨天（雨絲＋濕氣層）

Status: done
Type: world-render / weather
Accept: `node tools/checks/rain.mjs && npm run verify:quick`

## Goal

村莊已經有打鐵煙、夜晚變暗、窗光、門前燈，但天氣永遠是同一種。這輪加上**陣雨**：

- 溫帶地區（村莊／草原／森林／白樺花原／霜杉林地／山麓）在某段時間會下雨
- 雨絲：120–180 條斜落細線（近處較粗較長），地面偶爾有濺起的小水花
- 濕氣層：很淡的藍灰疊層，讓畫面讀起來是「陰雨天」而不是「晴天加線條」
- 雪地照舊下雪、不下雨；減少動態時不下雨

## Files

- `src/pixel-world.js`
  - 動態層（花粉／雪那一段的旁邊）新增雨塊：
    `const wetBe=['village','meadow','forest','birch','taiga','mountain'].includes(cb);`
    `const shower=Math.sin((state.time||0)*0.037+1.7)>.55;`（**用 state.time 決定，不是隨機**）
    `const rainOn=!!(quality&&wetBe&&shower&&!reducedMotion);`
    每條雨絲的 x/y 由 `elapsed` 與 `i` 決定，斜落；`i%9===0` 的當「近景」畫 2px 寬、22px 長、alpha .46。
  - 濕氣層：`#rain-tint`（`position:fixed;inset:0;pointer-events:none;z-index:1;opacity:0;transition:opacity 1.2s;
    background:linear-gradient(180deg,rgba(122,152,176,.10),rgba(78,100,122,.17))`），
    下雨時 opacity 切到 1（1.2s 淡入）、雨停淡出。
  - 除錯鉤子 `globalThis.__mistvaleRain={on,biome,shower,drops,tint}`。
- `tools/checks/rain.mjs`（新）。

## Decisions

- **天氣用時間函數而不是新存檔欄位**：`sin(t*0.037+1.7)` 週期約 170 秒，同一個時間一定是同樣天氣。
  這樣不用改存檔結構、不用處理舊檔遷移，也讓測試可以「把時間調到下雨」重現。
- **濕氣用 DOM 疊層而不是每幀 fillRect**：滿版填色在手機上很貴；DOM + `transition` 由合成器做，幾乎免費。
  z-index 1（世界 canvas 0、夜色 2、燈光 3、HUD 4 起），所以濕氣在夜色之下（夜晚下雨仍是暗的）、
  HUD 之上不受影響。`pointer-events:none` 不吃點擊。
- **雪地不下雨**：雪地本來就有雪粒子（`biomeAt(...)==='snow'` 那段），再加雨會變成「冷氣團暴雨」。
- **強度調了兩輪**：第一版 alpha .20、7px 長，截圖幾乎看不出來；改成近景 2px 寬／22px 長、
  alpha .30–.46 之後才讀得出是雨。判斷依據不是「我覺得」，而是雨天／乾天截圖的平均像素差（8.3）。
- **暫停時雨會停住**：雨絲位置用 `elapsed`（世界時間），暫停就凍結——這是刻意的，暫停畫面不該還在動。
  檢查器的「雨絲會動」因此要先恢復遊戲再取第二張。

## Notes

- 檢查器驗：雨天時 `__mistvaleRain.on` 為真且 drops ≥100、濕氣層 opacity ≥.9 / z-index 1 / pointer-events none；
  乾天沒有雨、濕氣層淡回 0；雨天與乾天截圖平均像素差 ≥2、兩張雨天截圖（恢復後隔 200ms）差 ≥0.4；
  雪地（把鏡頭 lookAt 到雪原中心）不下雨；減少動態不下雨；手機 402x712 也下雨。
- `lookAt(x,z)` 是既有 export，用來把鏡頭移到雪原測「雪地不下雨」——只改 `exploreRegion` 不會動鏡頭，
  `biomeAt` 是看鏡頭中心的。
- 手機雨絲數量第一版被 `scale` 扣到 92 條（手機縮放 <1），改成 `Math.max(0, …)` 夾住，現在固定 120 條。
