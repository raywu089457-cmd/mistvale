# EQUIPMENT SPEC

資料夾:`sprites/equipment/{helmets,armor,gloves,boots,capes,shields,accessories}/`

## 每件裝備必須

- 遵守 BASE_BODY_SPEC 的骨架(肩線、腰線、腳底、頭高不變);只加厚輪廓,不改比例。
- 同一個視角(側面朝右)、同一個像素密度(邏輯格 ×4)、同一套描邊規則。
- 色盤:裝備用到的顏色必須在角色 16 色內;換色版只在「色相獨佔」的材質組換(見 build_hero.py `SWAP` 的做法)。
- 以**圖層**存在:對應 Layer 03 Armor / 04 Helmet / 05 Gloves / 06 Boots / 07 Cape / 09 Shield。

## 每件裝備的資料(`equipment_<type>_<name>_<nnn>_<ver>.json`)

| 欄位 | 說明 |
|---|---|
| id | `EQUIPMENT_HELMET_KNIGHT_001` |
| layer | 03–09 |
| fitsBody | 適用的 base body(`HUMANOID`) |
| anchor | 掛在哪個 anchor(HEAD / BODY / LEFT_HAND…)與偏移 |
| perAnimation | 每個動畫/每格相對 anchor 的位移(或 `follow: BODY`) |
| palette | 用到的色號 |

## 現況

尚未拆出獨立裝備檔:上線角色的盔甲/頭盔/盾都畫在 sheet 裡。真正可替換的裝備需要「同一底身 + 分件生成」(AI 逐格對不齊,必須走關鍵姿勢 + anchor 疊圖)。
