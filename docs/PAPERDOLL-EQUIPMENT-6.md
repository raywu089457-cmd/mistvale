# 6 部位裝備（B+D）— 設計與施工單

狀態：規格。美術包由 `task-9` 產生（`assets/paperdoll-classes/`）；引擎與玩法接線見 §4/§5。
權威格式：[`docs/PAPERDOLL.md`](PAPERDOLL.md)（分層紙娃娃引擎）、[`docs/PIXELFX-PRESENTATION.md`](PIXELFX-PRESENTATION.md)（角色／特效已上線狀態）。

## 1. 兩件事

- **B. 真的 6 部位可混搭**：`helm` / `chest` / `belt` / `legs` / `boots` / `gloves` 各自獨立穿脫，外觀各自一層，數值各自加成。不是「一件護甲換一張全身圖」。
- **D. 每武器動畫層**：`attack.bow` / `attack.staff` / `attack.greatsword` / `attack.sword` / `attack.dagger` 各自一套動作，矛是刺不是揮。

## 2. 現況（改動前）

| 東西 | 現在 | 位置 |
| --- | --- | --- |
| 存檔欄位 | `h.equipment = { weapon: bool, armor: bool }` | `src/pixel-game.js:453`（建角）、`:524`（訪客）、`:1472`（讀檔）、`:1572`（比試假獵人） |
| 數值 | weapon `+7 atk`；armor `+28 maxHp +4 def`；`weaponLevel` 每級 `+7% atk` | `src/pixel-game.js:350-352` |
| 經濟 | `RECIPES` 只有 weapon / armor 兩種；`state.gearStock = {weapon, armor}`；鐵匠鋪製造 → 獵人回村自動買 | `src/pixel-data.js`（RECIPES）、`src/pixel-game.js:544,612-613,1647` |
| 商店／製作 UI | `RECIPES.map(...)`、`state.gearStock[r.type]` | `src/pixel-ui.js:318, 570` |
| 獵人面板 | 兩列（武器強化 + 皮革護甲） | `src/z2a-hunter.js:15-64` |
| 外觀 | `<class>-armor` 全身重繪 + `-weapon-fine` 零件 | `src/pixel-world.js` `heroLook()`；`assets/heroes/*.json` |

## 3. 資料模型（存檔 v3）

```js
h.equipment = { weapon:false, helm:false, chest:false, belt:false, legs:false, boots:false, gloves:false }
h.weaponLevel = 0..10            // 不變
state.gearStock = { weapon:0, helm:0, chest:0, belt:0, legs:0, boots:0, gloves:0 }
```

讀檔遷移（`pixel-game.js:1472`）：`weapon` 照舊；`armor:true` 的舊檔 → 六件全 true（玩家已經付過「護甲」的錢，不能因為改版變弱）；新檔缺欄位一律 false。
存檔版本 `version` 由 2 → 3，`SAVE_KEY` 不變（`mistvale-pixel-v2`，靠欄位遷移不用換 key）。

## 4. 數值（建議）

| 部位 | 生命 | 防禦 | 售價（金） | 材料 | 備註 |
| --- | --- | --- | --- | --- | --- |
| helmet 頭盔 | +6 | +2 | 90 | cloth 4 · ore 6 | 唯一會蓋住頭髮的一層 |
| chest 胸甲 | +22 | +3 | 140 | ore 10 · leather 6 | 舊 `armor` 的主要數值來源 |
| belt 腰帶 | +4 | +1 | 70 | leather 4 | |
| legs 腿甲 | +10 | +2 | 110 | ore 6 · cloth 4 | |
| boots 靴子 | +4 | +1 | 70 | leather 4 | |
| gloves 手套 | +4 | +1 | 60 | cloth 3 · leather 2 | |
| **六件全穿** | **+50** | **+10** | 540 | | 對比舊版 `+28/+4`：這是「全套更貴但更強」，單件則更便宜 |

武器維持 `+7 atk` + `weaponLevel`；`RECIPES` 改成 7 筆（weapon + 六件），`r.type` 直接當 slot 名。
自動購買（`:612-613`）與 `gearAvailable`（`:544`）改成逐 slot 判斷即可，邏輯不用重寫。
製作 UI（`pixel-ui.js:318, 570`）與獵人面板（`z2a-hunter.js:57-64`）改成迴圈列六件。

## 5. 外觀接線（引擎端，屬紙娃娃引擎擁有者）

紙娃娃引擎（`src/paperdoll.js` / `src/paperdoll-hero.js`）已經支援任意具名圖層，**不要新增第二套系統**：

1. 美術包：`assets/paperdoll-classes/`（`paperdoll.json` + 每職業一張 atlas）由 `pipeline/scripts/pixelfx/character/doll-pack.mjs` 產生。
2. `build.mjs`：比照 `assets/paperdoll/` 那段（`build.mjs:111-117`），把新目錄原樣複製到 `media/paperdoll-classes/`，只多一行路徑字串 `PIXEL_ASSETS.paperdollClassesBase = "media/paperdoll-classes/"`。不合併、不內嵌。
3. 載入：`createDollHero({ base })` 本來就吃 `opts.base`（`src/paperdoll-hero.js:144`），所以載入端不必改；`?doll=hero` 那條路徑把 base 換成新 pack。
4. `lookFromHunter()`（`src/paperdoll.js:196-220`）現在吃 `equipment.weapon` / `equipment.armor`。改成逐 slot：
   ```js
   const kit = CLASS_KIT[classId];                 // 職業 → 每槽外觀
   for (const slot of GEAR_SLOTS)                  // ['helm','chest','belt','legs','boots','gloves']
     look[slot] = h.equipment?.[slot] === true ? kit[slot] : null;
   ```
   `null` = 不畫；沒有定義外觀的職業退回 `meta.defaultClass`。
5. 出招計時：武器型別（`bow`/`staff`/`greatsword`/`sword`/`dagger`）決定 `resolveAction` 挑哪一列 `attack.<type>`；`impactSlot` 一定要對到遊戲實際扣血的時間（目前 `attack` ≈ 0.45 s、命中 ≈ 0.38 s）。
6. 落地開關：`?doll=hero`（全部職業）→ 驗收後才把預設從 sheet 換成紙娃娃。切換前後 `check_facing` / `check_anim` 都要跑（`DOLL=hero` 有支援）。

## 6. 施工順序

| 階段 | 內容 | 驗收 |
| --- | --- | --- |
| A（已完成 2026-11-13） | 美術包：六職業 × 身體／頭／武器／六件裝備、八方向、`attack.<武器>` 動作列 | `doll-pack-check.mjs` exit 0；`output/doll-pack/montage.png` + `gear-identity.png`（每職業自己的頭盔輪廓與材質，見 §8） |
| B（已完成 2026-11-13） | 引擎接線：`build.mjs` 打包、預設走新 pack、`lookFromHunter` 六槽 | `tools/checks/doll-classes.mjs` PASS、`tools/checks/doll-default.mjs` PASS（預設 12 位獵人走紙娃娃、`?doll=0` 回 sheet）；`?doll=hero` 遊戲內看得到六件混搭 |
| C | 玩法：存檔 v3 + 遷移、七筆 `RECIPES`、鐵匠鋪自動購買、六件數值 | `npm test`（conservation 測試要同步改）、`verify:quick` |
| D | UI：製作面板六列、獵人面板六列（穿／未穿） | 截圖 + `verify:quick` |

A、B 可以平行；C、D 依賴 B。

### 已完成的部分（含實際落點）

- 美術包：`assets/paperdoll-classes/paperdoll.json` + 六張 atlas（`pipeline/scripts/pixelfx/character/doll-pack.mjs` 產生，deterministic）。
- 引擎：`src/paperdoll.js` 的 `GEAR_SLOTS` 與六槽 `lookFromHunter()`；`src/paperdoll-hero.js:144` 的 base 優先序（六部位包 → 第一期佔位包）；`build.mjs` 複製到 `media/paperdoll-classes/` 並設 `PIXEL_ASSETS.paperdollClassesBase`。
- 預設開啟：`src/pixel-world.js` 的紙娃娃段落（`?doll=0/off/no/sheet/none` 關閉，`?doll=hero[:cls]` 指定），2026-11-13 起遊戲內英雄預設就是紙娃娃。
- 實驗面板：`?doll=1` 現在打開的是六部位真美術包（六個部位勾選框、每武器動作列、八方向、資訊面板）。
- `assets/heroes/*-armor`、`*-weapon`、`*-weapon-fine` 舊零件表只給 `?doll=0` 的 sheet 路徑用，不再是預設呈現。


## 7. 不能做的事

- 不碰 `assets/paperdoll/`（引擎佔位包，`build_paperdoll_placeholder.py --check` 要保持綠）與 DV2 kit（Kairosoft 版權）。
- 不新增第二套裝備系統；`assets/heroes/*-armor` 舊零件表在 B 階段完成前繼續有效，完成後才退場。
- 數值表（§4）：使用者已選 B（真的 6 部位可混搭），Lead 決定先照 §4 的數字實作、實作完把數字列在使用者回報裡讓他調整（不再多卡一輪確認）。所有數字集中在 `src/pixel-data.js` 的 `RECIPES`，要調價／調加成只改那張表。

## 8. 每職業裝備外觀（task-10，2026-11-13）

六件裝備不是同一套鋼鐵換色，而是每個職業自己的輪廓與材質（`meta.gearKits` 記六件的 ramp base）：

| 職業 | 頭盔（輪廓，不是換色） | 胸甲 | 腰／腿／靴／手 | 主要色 |
| --- | --- | --- | --- | --- |
| 狂戰士 | 鐵帽 + 毛邊 + 兩支角 | 毛皮 + 皮帶交叉，露出胸口 | 鐵 + 黃銅 | 鐵灰／黃銅／棕 |
| 聖騎士 | 大頭盔 + 金邊 + 羽飾 + 面甲縫 | 唯一一件「整片板甲」 | 鋼 + 金 | 鋼藍／象牙／金 |
| 魔法師 | 尖頂布帽（沒有鋼盔） | 布面 + 金線 | 布 + 金線 | 紫 |
| 弓箭手 | 皮兜帽 | 皮甲片（頸部與上胸） | 綠皮 | 綠／皮棕 |
| 刺客 | 兜帽 + 下半臉面罩 | 近黑皮甲 | 深灰 | 石板黑 |
| 祭司 | 頭紗 + 金冠圈 | 象牙布甲 | 象牙 + 金 | 象牙／金／暗紅 |

- 胸甲覆蓋：非聖騎士只吃掉頸部與上胸 72%，腰帶仍露出最下緣；costume 的裝飾像素（腰帶垂飾、交叉皮帶、聖帶、箭袋）不屬於任何裝備圖層，所以穿著裝備時仍看得見。
- 材質階梯（亮→暗）：頭盔 > 胸甲 > 手套 > 腰帶 > 腿甲 > 靴子，讓六件在 1× 也分得出是不同的東西。
- 驗證：`doll-pack-check.mjs` 追加「每職業六件 base 色兩兩距離 ≥ 25」「渲染格真的帶到自己的 base（最近色 ≤ 12、≥ 5 px）」「每格 ≤ 16 色」；`output/doll-pack/gear-identity.png` 是 4× 對照圖（裸裝／六件單穿／全套 + 1× 條 + 混搭列）。
- 已知還弱的點：祭司的頭環與腰帶在 1× 只有 41/42 px 的變化（全白職業本來就吃虧）；非聖騎士的胸甲還是一大片面板，要真的「肩 + 腰」形狀得另外畫幾何；裝備表面只有 4 級 ramp，4× 看是平塗；狂戰士牛角與祭司頭環只有 1–2 px，2× 以上才清楚。

## 9. 驗收（2026-11-13 最終）

- `npm test` PASS（`test-paperdoll` 31 項、paperdoll parity 10080 組）。
- 專項檢查：`doll-classes.mjs`、`doll-default.mjs`、`gear-economy.mjs`、`gear-swap.mjs`、`z2a-hunter.mjs`（65 項）、`z2b-econ.mjs`（272 項）全 PASS；`doll-pack-check.mjs` exit 0。
- 裝備環：icon atlas 沒有頭盔／靴子／手套圖，六格原本都是同一顆盾牌圖示 → 改成單字標記（盔／甲／腰／腿／靴／手，空位淡、已穿亮，`src/z2a-hunter.js` `SLOT_GLYPH` ＋ `src/ui-hv.css` `.z2-glyph`），截圖 `output/doll-default/ring.png`。
- `npm run verify`（完整，含按鈕巡檢）：本批改動的 Z2B 由 FAIL 轉 PASS；剩下 4 項是外部 agent 的 Z1／FIX 外殼未完成（FIX-B 區域卡、FIX-C 缺 fixture、Z1 確認框橄欖綠變數、按鈕巡檢 dungeon/arena 選人列被 party-summary 蓋住），與角色／裝備／特效的檔案無關。按鈕巡檢同時修好兩個 harness 老問題：`buttons.mjs` 沒關 `#title-screen`、`closeAll()` 用 `offsetParent` 判斷 fixed 容器裡的關閉鈕（299 個 click-failed 的主因），修完 desktop 剩 8、phone 剩 16 個（全是 dungeon/arena 選人 toggle 的 state-change 誤報）。
