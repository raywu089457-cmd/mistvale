# T39: 從頭生成示範新角色(Soul's Remnant 分層格式)

Status: done
Accept: python -I output/sr-demo/check_assets.py

Context: docs/research/SOULS-REMNANT-ANIM.md(先讀第 3–8、10 節)。這張卡只做素材;下一張 T40 做展示頁。完全不碰 src/、assets/、sprites/。

## Goal
用現有免費生圖工具,從頭做一個**全新角色「灰燼旅人」**:短髮、寬簷旅人帽、長斗篷、皮背心,兩種武器(單手劍、長槍)。按 Soul's Remnant 的格式出素材:光身身體動作 strip(單一朝右)+ 每件裝備一張靜態圖 + 頭髮三層 + 武器獨立圖 + 獨立特效 strip,全部寫進 `output/sr-demo/assets/manifest.json`,讓 `python -I output/sr-demo/check_assets.py` PASS(這支驗收檔已寫好,不要改它)。

## Files you may change
- `output/sr-demo/assets/**`(新)、`output/sr-demo/work/**`(中間檔、提示詞、生圖原圖)
- `output/sr-demo/tools/*.py|*.mjs`(這張卡需要的切圖/量錨點小腳本)

## Steps
1. 生圖只用 l0veyou(免費):`pipeline/scripts/l0veyou/generate.mjs`(CDP 9447 已登入瀏覽器,同時只跑一張)。**不准用 PixelLab 或任何付費服務。** 畫風:仙境傳說 RO 式 Q 版像素角色(見 `sprites/SPRITE_VISUAL_BIBLE.md` 開頭的作廢說明),3/4 側面朝右、細深棕描邊、≤16 色、硬邊、`#FF00FF` 背景。提示詞存 `output/sr-demo/work/prompts/`。
2. 身體(光身:素色內衣褲、無帽無髮飾、空手)。生 3 張:待機 1 格、跑步 6 格橫排、攻擊(揮砍)6 格橫排;同一張參考圖用 `REF=` 傳入讓後兩張比例一致。若 l0veyou 給的格子不均,自己量人物 bbox 重新排格。去背 → 用同一縮放比 + 同一份 16 色縮到**格 100×100、身高約 72、腳底 y=92、身體軸 x=50**,alpha 只有 0/255。輸出 `ashwalker_idle_strip1.png`、`ashwalker_run_strip6.png`、`ashwalker_attack_strip6.png`(格數若不是 6,檔名 N 跟著改)。
3. 錨點:每個動作每格量 `hand`(持武器的手握點)、`head`(頭頂中心)、`torso`(胸口中心),寫進 manifest `anchors.<action>[i]`。可半自動(膚色/輪廓)但要逐格目視檢查,存一張 `work/anchors-check.png`(每格疊三色點)。
4. 裝備與頭髮:用一張 16:9 4 欄物件表生(帽、斗篷、背心、短髮),每件**單獨一張靜態 PNG**,尺寸 ≤100×100,畫在跟身體同一縮放與同一色盤。頭髮切三層:`top`(頭頂髮)、`front`(瀏海/前髮)、`back`(後髮),再做 `front_no_top`(戴帽時用)。manifest `equipment[]` 每件:`id,type,file,anchor(head|torso),offset:[x,y](圖左上相對錨點),flags:{render_behind,front_hair_only,no_top_hair}`:帽 `no_top_hair:true`;斗篷 `render_behind:true`(斗篷圖要包含肩部固定段,尾巴部分另存 `cape_tail.png` 給骨鏈用)。
5. 武器:同一張或另一張物件表生劍、長槍,各一張 PNG,`grip:[x,y]` = 圖內握把點。manifest `weaponProfiles.{sword,spear}` = `{follow_offset:[x,y], rotation:度, flip_vertical:bool}`,先目測調出合理預設(劍上翹約 25°,長槍水平偏下)。
6. `capeChain`:`{points:4, segment:像素長, angle_limit:30, gravity:5, drag_max_step:15}`。
7. 特效:生一條揮砍刀光 one-shot strip(`fx_slash_strip5.png` 之類,格 `cell` 自訂,寫 `fx.cell/frames/file`),不畫進身體。
8. 跑 `python -I output/sr-demo/check_assets.py` 到 PASS。另存 `work/contact.png`:三條 strip + 全部裝備/武器/頭髮/特效的放大 3 倍總覽。

## Report extras
- l0veyou 生了幾張、失敗重生幾次;每條 strip 實際格數與身高(px);色數。
- 哪裡品質最差(例如跑步格間身形不一致),一句話。
