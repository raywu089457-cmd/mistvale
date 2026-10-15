# 開羅《冒險村物語2》角色動畫系統 — 參考架構（逆向筆記）

來源：`C:\Users\ray\pi-fleet\agent-01\work\kairo\`（REPORT.md ～ REPORT-6-animation-system.md ＋ 4,189 個解出的素材 ＋ `il2cpp2\dump.cs`）。
逆向對象：`Dungeon Village 2 v1.41`（Unity 外殼 + IL2CPP 的 `GameAssembly.dll` + 自家素材容器）。

**為什麼要看這個**：它回答了我們做英雄 sprite 時最痛的問題 ——
**「做新裝備要不要整套重跑？」** 開羅的答案是**不用**：裝備是獨立零件，執行期用「逐格位移表」疊上去。

---

## 1. 一句話

```
一個角色不是「一張圖」，是 6 個零件各自播自己的動畫，
每個零件每一格用一張表算出「要貼哪一塊 + 貼在哪」，
全部丟進同一個座標系疊起來 = 畫面上一隻村民。
```

## 2. 五層架構

| 層 | 檔案 | 負責什麼 |
|---|---|---|
| 1 素材 | `*.png` | 打成一張的圖集（緊密打包，不是等格切） |
| 2 切圖 | `*.opt` | 每一筆 `(X, Y, U, V, W, H)`：貼哪、從圖集哪一塊裁 |
| 3 動畫 | `*.seb` | 一段動畫：幾格、每格要畫哪幾筆（**只存索引不存像素，平均 <200 bytes**） |
| 4 組裝 | `xls/charaSebData.txt`、`charaSebSetData.txt` | 哪 6 個零件、每一格的位移補正 |
| 5 執行 | `game.Character2` | 狀態機（走／站／攻擊…）＋ 等角投影 ＋ 影子 ＋ 前後遮擋 |

## 3. 關鍵資料結構

### 3.1 六個零件（`CharaSebData.PARTS_SEBID_*`）

```
0 BODY  1 HAND  2 HAT  3 HEAD  4 WEAPON  5 WEAPONEFFECT
```

每個零件有自己的**動畫索引**（`chara_body/seb.inf`：`walk00-03`／`stand00-03`／
`weapon_walk*`／`have_walk*`／`pose00-03`／`cry*`／`applause*`／`bow*`／`cheer*` …）。

| 零件 | 檔數 |
|---|---|
| `chara_body` | 89 PNG（同一個身體 × 不同配色盤）＋ 124 `.seb` |
| `chara_head` | 120 PNG ＋ 8 `.seb`（normal／talk／smile／sleep／surprise／stone／cry2）|
| `chara_hand` | 89 PNG（手提物：武器／鋤頭／空手）＋ 124 `.seb` |
| `chara_hat` | 71 PNG ＋ 3 `.seb` |
| `weapon` | 115 PNG ＋ 11 `.seb`（sword／bow／gun／ax／spear／wand／rapier）|

→ **41 個身體 × 54 個頭**就能生出上千種村民，每多一個部件只多一點容量。

### 3.2 共用座標系（`.opt`）

`.opt` 每筆 15 bytes（big-endian int16）：

```
01 ff ff | X | Y | U | V | W | H
  標記   ← 貼在角色座標系（原點＝腳底中心）
                    ← 從 PNG 哪一塊裁
```

`chara_head_m_001.opt` 全部 `X=3, Y=6`（頭 13×11 貼在 (3,6)）；`chara_body_m_000.opt` `X=3..10, Y=12..22`。
**不同零件的 `.opt` 共用同一個座標系，所以疊圖不需要額外的錨點表。**

### 3.3 動畫（`.seb`）

```csharp
maxFrame_           這動畫有幾格
layerHeads_ / spriteFrames_   索引表（哪幾筆屬於第幾格）
spriteBuffer_       每筆 8 bytes 繪製指令：(TEX, X, Y, U, V, W, H, FLAG)
spritesBufferEx_    混色用的延伸指令
pixelBoundingRects_ 像素級碰撞框（檔尾 "RECT" + maxFrame × 4 short）
```

- 推進：`currentFrame_ = (currentFrame_ + 1) % maxFrame_`
- 面向左右**不是兩套圖**，是同一張圖水平鏡射（`SP_REVERS_U`）
- 換色走混色路徑（`SP_BLEND` / `SP_COLOR`，(alpha, blend, color) 打包）

### 3.4 組裝表（`charaSebData.txt`，127 筆）

| 欄 | 內容 |
|---|---|
| 2 | 屬於哪個動作組 |
| 4 | `sebId_`＝6 個零件各播哪一段（`0&0&0&0&0`）|
| 5-10 | 每個零件的**逐格位移**（`-1,-8&-1,-7&-1,-8&-1,-7` = 四格的頭部晃動）|

動作組（`charaSebSetData.txt`）：`0 歩き / 1 立ち / 2 武器持ち歩き / 3 武器持ち立ち / 4 物持ち歩き / 5 物持ち立ち / 6 ｷﾒﾎﾟｰｽﾞ / 7 泣く1 …`
- `sebDataId_[] = 0&1&2&3`：這組要用哪 4 筆
- `animeFrame_[] = 4&8&12&16`：**每一段的影格界線**（走路一輪 16 格，每 4 格換一次組裝）

### 3.5 執行期（`Character2`）

```
state_ 決定做什麼 → CharaSebSetData 選出本段用哪筆 CharaSebData
→ 該筆給 6 個零件的 sebId_ 與逐格 offset_ → 各零件 Seb.Frame() 自己推進
→ GetSprites() 展開成 (TEX,X,Y,U,V,W,H,FLAG) → 等角投影 → 依 depthInfo 排序 → 貼圖 + 影子
```

## 4. 對照我們 mistvale：我們缺什麼

| 能力 | 開羅 | 我們現在 |
|---|---|---|
| 角色組成 | 6 零件獨立動畫 | **一張烘好的 sheet**（每職業一列一動作）|
| 新裝備 | **只做那個零件**，執行期疊 | 整套重生（transfer-outfit 8 方向 × 8 格 ≈ 600 次生成）或靜態疊圖 |
| 逐格位移 | `offset_[part][frame][x,y]` | 只有頭飾的 `meta.actions[act].head[i]` |
| 畫圖指令 | 索引式（`.seb` <200 B）| 直接存整張 sheet（每職業 800×1300 PNG）|
| 換色 | `SP_BLEND/SP_COLOR` 執行期混色 | `meta.groups` 換色盤（**這點我們已經有了**）|
| 左右 | `SP_REVERS_U` 鏡射（**已做**）| facing 鏡射（**已做**）|
| 圖集打包 | 高度圖打包 + 去重 | 固定格（cell 100）|

**已經對上的**：左右鏡射、換色盤、`meta.actions[act].head[i]` 的逐格錨點（配件槽）。
**最缺的**：每個零件**自己一組逐格 offset** ＋ **畫圖順序**，以及讓身體可以「不烘裝備」。

## 5. 如果要採用（建議路線）

1. **先擴充 meta**：`actions[act].parts = {body:[…], head:[…], hand:[…], feet:[…], weapon:[…]}`，
   每個零件一組**每格 [x,y]**（跟現在的 `head` 同格式，只是多幾個槽）。
   - 錨點來源我們已經有：`estimate-skeleton` 抓每格的手／腳／頭座標（64 格約 6 次生成，一次算完所有裝備共用）。
2. **零件素材**：裝備抽成獨立 PNG（我們已經有 `layer-head/torso/hands/feet` ＋ 武器道具圖）。
3. **繪圖**：`drawSheetHero` 現在畫一格；改成「畫身體 → 逐一畫零件（依 drawOrder、用該零件該格的 offset）」。
   - 會轉動的部位（手、腳）除了 [x,y] 再加一個角度值。
4. **代價**：裝備是剛體疊圖，不會跟著姿勢變形（開羅也是這樣，靠**零件本身就畫成對應姿勢**解決：
   所以他們的 `chara_body` 有 89 個 PNG、`chara_hand` 也有 89 個 —— 每個姿勢一張）。

> 結論：**開羅的做法是「每個姿勢一張零件圖 + 逐格位移表」**，不是「一張圖變形」。
> 這對我們很關鍵：新裝備只要生「跟身體同姿勢的那幾張零件圖」，不用重跑整套動畫。

## 6. 原始證據

```
kairo\
  REPORT.md                    圖集與索引格式
  REPORT-2-decompiled.md       程式碼層：Seb / CharaSebData / Encrypter
  REPORT-3-decrypted.md        44-byte 金鑰、容器格式、4,189 檔
  REPORT-4-seb-format.md       .seb 二進位欄位
  REPORT-5-compose.md          .opt 格式與合成驗證
  REPORT-6-animation-system.md 完整原理（本文主要依據）
  unpacked\                    4,189 個素材（chara_body/head/hand/hat/weapon/monster/xls…）
  out2\                        合成 GIF
  il2cpp2\dump.cs              171,984 行：完整類別／方法／位移
```

金鑰（開發用）：`65b648ad7a082f13fdaa4be9c6fb7142b7491e48f1d73908aa32baca1b27f2b5b4c0adb69e7a5d2518906564`（44 bytes，重複金鑰 XOR）
