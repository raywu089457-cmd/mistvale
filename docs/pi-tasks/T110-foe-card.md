# T110 魔物資訊卡

Status: done
Type: ui
Accept: `node tools/checks/foe-card.mjs && npm run verify:quick`

## Goal

T109 讓獵人可以點開小卡之後，魔物仍然是**完全不可點**的：牠們頭上只有一條沒有數字的血條，玩家不知道這隻是什麼、會掉什麼、打一隻值多少金幣經驗。這一輪把魔物接上同一張小卡：

1. 點畫面上的魔物 → 左下開卡：頭像（取該魔物 sheet 的 idle 第 0 格）、名字、
   `魔物`／`首領` 標籤、`區域 · 掉落 材料、材料`、生命條＋`hp/maxHp`、攻擊／金幣／經驗。
2. 生命條跟 `state` 同步（<35 % 轉色）；魔物倒下（hp 0）卡片自動收起。
3. 位置與 T109 相同：桌機貼左下、底欄上方；手機橫幅貼底欄上方，不蓋住地圖／暫停／速度。
4. 魔物沒有詳情面板，所以卡片上只有 ✕（不擺沒有作用的「詳細」）。

## Files

- `src/pixel-world.js`：
  - `drawEnemy()` 畫完 sheet 後把可點矩形推進 `hits`（`id:'foe:'+e.id`，`padHit(rect,14,18)`），
    這樣世界點選的 hit test 就會先接到魔物；以前只有獵人與建築會註冊。
  - 新匯出 `monsterPortrait(type,size)`：取 `MON_SHEET(type)` 的 idle 第 0 格、最近鄰放大成 `size×size`
    的 dataURL；sheet 還沒載好就回空字串（卡片改畫深色底）。
  - 新匯出 `foeRects()`（驗收用，跟 `unitRects()` 同一套做法）。
- `src/pixel-ui.js`：
  - `handleWorldSelect(id)`：`hunter:` 與 `foe:` 都走 `showUnitCard(id)`。
  - 小卡改成同時支援兩種目標：`unitCardTarget()`（回 `{kind,u}`）、`unitCardHTML(t)`、
    `unitCardSigOf(t)`、`unitCardPaint()`；`#unit-card` 加上 `data-kind` 讓 CSS 換框色。
  - 魔物卡的數值直接讀 `ENEMIES[e.type]`（gold / xp / drops），不另外抄一份表。
- `src/pixel-style.css`：T110 區塊（魔物卡框色、頭像底色、首領／魔物標籤色、血條改紅橘）。
- `tools/checks/foe-card.mjs`（新）。

## Decisions

- **魔物不給「詳細」**：沒有魔物詳情面板，擺一顆按了沒反應的按鈕比不擺更差。
- **頭像用 sheet 第 0 格而不是另外生圖**：素材本來就有，最近鄰放大到 96px 對像素遊戲是正確取樣；
  沒有 sheet（還沒載完）就回空字串、卡片照樣可用。
- **金幣／經驗顯示的是 `ENEMIES` 表的基礎值**，不是這一隻打完實際會拿到的值（首領與難度有加成）；
  卡片是「認識這隻魔物」用的，不是計算機，寫死加成反而容易跟戰鬥邏輯不同步。
- **魔物死掉就收起**：目標不存在時 `unitCardTarget()` 回 null，卡片自然關掉，不需要另外監聽死亡事件。

## Notes

- 點擊矩形要註冊在 `drawEnemy()` 的 `rect` 上（`drawMonsterSheet`／`drawAtlasMonster` 的回傳），
  不要自己用 `screenPoint` 加身材高度算，否則 sheet 動作自帶位移（strike 前傾）時會點不到。
- `MON_SHEET` 是「用到才載」的：區域剛切過去的前幾幀 `monsterPortrait` 會回空字串，這是預期行為。
- 驗收要先 `exploreRegion('meadow')` 等 2.6 秒：村莊裡沒有魔物，開場直接找 `foeRects()` 會是空的。
- 檢查器每一輪都重新讀 `foeRects()`（魔物在動），不要拿舊座標連點。
