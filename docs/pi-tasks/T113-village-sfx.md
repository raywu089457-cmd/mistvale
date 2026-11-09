# T113 村莊有來源的聲音

Status: done
Type: audio
Accept: `node tools/checks/village-sfx.mjs && npm run verify:quick`

## Goal

T108 的環境音是「一整片區域的底噪」——風聲、鳥叫。村莊卻聽起來一樣空：畫面上明明有一座亮著爐火的鐵匠鋪、一間酒館、一個市場，耳朵裡什麼都沒有。這一輪補上**有來源的聲音**，全部即時合成：

1. **鐵匠鋪**（Lv1+）：打鐵的金屬噪音爆＋鐵砧短音，三成機率連打兩下。間隔 `max(1400, 3600-400*(lv-1))` ms，Lv3 ≈ 2.8 秒一次。
2. **酒館**（Lv1+）：一小段低頻人聲嗡嗡＋杯碰一下。間隔 `max(3000, 9000-1000*(lv-1))`。
3. **交易所**（Lv1+）：零錢兩下（高頻短音）。間隔 `max(3000, 10000-1200*(lv-1))`。
4. **城鎮大廳**（Lv3+）：低頻鐘聲＋泛音，長尾 1.4 秒。間隔約 34–42 秒。
5. 只在**相機看得到村莊**時響（世界是一整張地圖，走到別的區域就該聽不到打鐵）。
6. 音量都很低（0.014–0.045，事件音是 0.045–0.13）：它們是背景，不搶命中聲。
7. 靜音同時收掉；分頁切到背景收掉；換建築等級即時重算間隔。

## Files

- `src/sfx.js`：
  - `VILLAGE` 表（每個來源的 `every(lv)` 間隔函式、`gain`、`minLv`）、`villagePlay(id,g)`（打鐵／人聲／零錢／鐘聲的合成配方）、
    `villageSchedule/villageStop/villageSet/villageSources/villageState`（每個來源一個自我重排的 `setTimeout`，
    觸發前再檢查 `armed && !muted && !document.hidden && 建築還在`）。
  - `ambientSet(region, phase, buildings, inVillage)`：新增建築等級表與「相機在不在村莊」兩個參數。
  - 靜音、visibilitychange、手勢上膛三條路徑都會同步收／開村莊音源。
- `src/pixel-world.js`：新增 `cameraXZ()`（相機中心的世界座標，`unproject` 畫面中心反推）。
- `src/pixel-ui.js`：`frame()` 每幀算 `Math.hypot(c.x+15,c.z-3) < 30`（村莊中心約 (-15, 3)、半徑 30）當 `inVillage`，
  連同 `state.buildings` 一起傳給 `ambientSet`；設定面板「音效」說明補上這四種村莊聲音。
- `tools/checks/village-sfx.mjs`（新）。

## Decisions

- **用相機而不是 `state.region` 判斷在不在村莊**：`state.region` 只在玩家把獵人開出村時更新，而且永遠不會自己變回 `'village'`；
  拿它當閘門會出現「站在村子裡聽不到打鐵、在草原卻聽得到」的錯亂。相機中心才是玩家實際看到的東西。
- **每個來源一個計時器，而不是一個總排程**：拆掉鐵匠鋪只要清掉那一個 timer，其他來源不受影響。
- **間隔是線性遞減而不是「密度分級」**：等級 1–5 差別用連續值比跳階自然，而且驗收可以直接比大小。
- **不做「隨機一段時間後停止」**：村莊是持續運作的地方，聲音該一直有，只是稀疏。

## Notes

- 驗收一定要先把 `state.paused = true` 再 `lookAt(...)`：否則跟隨邏輯會把鏡頭拉回獵人身上，看起來像「離開村莊也還在響」。
- `exploreRegion('village')` 會被拒絕（`REGIONS` 不含村莊，回「請選擇村外的生態區」），所以驗收不能靠它切回村莊。
- 檢查器第一次跑不起來的原因：來源算得對、但 `fired` 全是 0——因為當時相機在草原（開場 `state.region='meadow'`），
  村莊音源本來就不該響。這反而證明「相機閘門」是有效的，只是測試情境要先站回村莊。
