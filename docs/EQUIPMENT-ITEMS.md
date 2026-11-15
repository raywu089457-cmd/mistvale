# 裝備道具系統(EQUIPMENT items)

2026-11-15 使用者:「把每個職業目前穿的裝備設定新招募角色初始裝備穿上裝備欄位,可以被脫下出售或分解或存放倉庫」。
把「六格裝備 + 武器」從布林值(有/沒有)升級成**真正的道具**:每件有名字、數值、售價、分解材料與外觀。

## 1. 名詞

| 名詞 | 意思 |
| --- | --- |
| `EQUIP_SLOTS` | `['weapon','helm','chest','belt','legs','boots','gloves']`(武器 + 六格防具) |
| `EQUIPMENT` | 道具目錄(56 件):7 職業 × 7 件初始套裝 + 7 件鐵匠鋪升級品 |
| `CLASS_STARTER` | classId → 該職業初始七件套的 itemId |
| `h.gear` | 獵人身上的七格:每格 `{uid,itemId}` 或 `null` |
| `state.gearStorage` | 村莊倉庫裡的裝備:`[{uid,itemId}]` |
| `h.equipment` | 舊的布林值(weapon/helm/…),現在由 `h.gear` 同步回來,公式與舊 UI 照舊 |

## 2. 道具格式(`src/pixel-data.js`)

```js
{ id, name, slot, classId, tier:'starter'|'craft',
  price, sell, salvage:{wood|ore|cloth|leather:qty},
  stats:{atk,hp,def},
  look:{hat,top,bottom,shoes,cape,weapon,shield} }   // HeroLoom 紙娃娃用的部件
```

- 初始套裝數值總和固定:**武器 攻擊 +7;六件防具 生命 +28、防禦 +4** — 跟改版前「一件 armor = hp28/def4」完全一樣,平衡不動。
- 鐵匠鋪升級品(`craft_weapon`、`craft_chest`…)= 原本 `RECIPES` 的數值(例:craft_chest 生命+22 防禦+3),買了會替換同名初始件,舊件進倉庫。
- `look` 只描述「穿上這件會多/換哪個部件」;空的 key = 這件不影響該部位。`weapon:'none'` = 空手(旅人)。
- 初始外觀與原本各職業 preset 相同:弓手 tunic+bow、法師 wizard+robe、祭司 band、聖騎 helmet+armor+buckler、刺客 sandals+band、狂戰 tunic、旅人空手。

## 3. 遊戲邏輯(`src/pixel-game.js`)

- `newHunter` / `newWanderer`:建立時 `gear:null` → `giveStarterGear()` 直接穿上 `CLASS_STARTER` 七件(所以新招募角色一開始就有完整套裝)。
- `updateStats`:生命/攻擊/防禦改成由 `gearBonus(h)` 加總;沒有 `h.gear` 的舊物件仍 fallback 舊布林值。
- `syncGear(h)`:把 `h.gear` 重建成 `h.equipment` 布林並重算數值。
- 新 API(都回 `{ok,message}`):

| API | 行為 |
| --- | --- |
| `unequipGear(hunterId, slot)` | 脫下 → 進倉庫 |
| `storeGear(hunterId, slot)` | 同上(存倉;訊息不同) |
| `sellGear(hunterId, slot)` | 賣掉身上那件 → 獵人拿 `item.sell` 金幣 |
| `salvageGear(hunterId, slot)` | 分解身上那件 → 獵人拿 `item.salvage` 材料 |
| `equipFromStorage(hunterId, uid)` | 從倉庫穿上(原本那件回倉庫) |
| `sellStoredGear(uid)` / `salvageStoredGear(uid)` | 倉庫道具賣出/分解(村莊拿金幣/材料) |

- AI：`shop()` 只在「該格目前不是 craft 品」時買升級品;買到後把被替換的初始件丟進倉庫。
- 存檔:state 全量序列化,`h.gear`/`gearStorage`/`gearSeq` 自動保存。舊存檔(`equipment.weapon/armor === true` 但沒有 `gear`)在 `restore()` 遷移:給初始套裝、武器若是舊布林 true 則換成 `craft_weapon`(同 +7)、舊件進倉庫。

## 4. 紙娃娃(`src/heroloom.js`)

`heroloomLook(h)` 有 `h.gear` 時:保留職業 preset 的髮型/膚色/底色,帽子/上衣/褲子/鞋/披風/盾/武器全部改由「身上道具的 look」疊出來。所以:
- 脫掉胸甲 → 角色真的沒穿上衣(只剩身體底色);
- 脫掉頭盔 → 露出 preset 髮型;
- 換 craft_helm → 換部件/tint;
- 旅人武器 `weapon:'none'` → 空手。
沒有 `h.gear` 的假獵人(lab/test)照舊走舊布林規則。

## 5. 測試

`node test-gear.mjs`(1001 assertions):目錄完整性、每職業初始套裝七件與總和 7/28/4、新獵人自動穿滿、脫下/存倉/出售/分解/倉庫穿上、外觀重現與脫胸甲掉上衣、存讀檔 uid 唯一、舊存檔遷移、craft 升級換件進倉庫、每件裝備都有 32×32 縮圖 PNG。 

## 6. 還沒做(誠實清單)

- UI 已完成:task-13(裝備頁列、倉庫裝備清單、每件按鈕)、task-14(縮圖接進裝備頁/環形欄位/倉庫)。
- 道具目前沒有稀有度/耐久/附魔;數值就是 starter 或 craft 兩階。
- 商店(`shop()` AI 自動買)沿用舊價錢,沒有新增陳列/篩選 UI。

## 7. 裝備縮圖(`assets/gear-icons/`)

使用者要求(m03470)每件裝備都要有自己的縮圖,顯示在倉庫和角色身上。

- 產生器:`pipeline/scripts/heroloom/gear-icons.mjs`(純 Node,只用 `encodeRgba`,不呼叫任何美術 API)。每件 `EQUIPMENT` 產一張 `assets/gear-icons/<itemId>.png`,32×32 RGBA。
- 畫法:依 slot 決定輪廓——武器(弓弧+弦/法杖+寶石/劍+金護手/匕首/布條空手)、頭盔(尖帽+帽簷/鐵盔+面甲縫/頭帶/兜帽)、胸甲(長袍/短上衣/鎧甲)、腰帶(+小袋)、褲子、鞋(涼鞋 vs 長靴)、手套;顏色用 `CLASS_COLORS`(弓手綠/術士紫/牧師象牙白/聖騎藍/狂戰棕紅/刺客黑/旅人棕/craft 鋼)搭 LEATHER/STEEL/WOOD/GOLD,最後外框補 1px `#150d1b` 墨線,和 HeroLoom 角色一致。
- 驗證:`node pipeline/scripts/heroloom/gear-icons.mjs --check` → `gear-icons: 56/56 icons present` / `PASS`;`test-gear.mjs` §9 再驗每件都有真實 PNG、32×32、目錄沒有多餘檔。
- 出貨:`build.mjs` 讀整個 `assets/gear-icons/`,每張丟 `media()`(32×32 約 250 B,全部內嵌)後輸出 `window.PIXEL_ASSETS.gearIcons = { [itemId]: dataURI | 'media/gear-icons/<id>.png' }`;UI 用 `PIXEL_ASSETS.gearIcons[itemId]` 直接當 `<img src>`,沒有 key 就退回文字/空格圖示。
- UI 接線(task-14,已完成):獵人詳情「裝備」分頁的環形 7 格與 7 列、裝備倉庫列與「已穿 N／7」整組縮圖條;CSS class 前綴 `gico`。因為縮圖本身墨色重(平均亮度約 18/255),UI 加一圈 1px 淡光暈讓它在深色面板上看得到。
