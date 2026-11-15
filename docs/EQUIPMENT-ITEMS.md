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

`node test-gear.mjs`(773 assertions):目錄完整性、每職業初始套裝七件與總和 7/28/4、新獵人自動穿滿、脫下/存倉/出售/分解/倉庫穿上、外觀重現與脫胸甲掉上衣、存讀檔 uid 唯一、舊存檔遷移、craft 升級換件進倉庫。

## 6. 還沒做(誠實清單)

- UI(裝備頁列表、倉庫裝備清單、每件按鈕)由 lab-ui 的 task-13 進行中。
- 道具目前沒有稀有度/耐久/附魔;數值就是 starter 或 craft 兩階。
- 商店(`shop()` AI 自動買)沿用舊價錢,沒有新增陳列/篩選 UI。
