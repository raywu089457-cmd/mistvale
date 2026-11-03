# T40: Soul's Remnant 做法示範頁

Status: done
Accept: node output/sr-demo/check.mjs

Context: docs/research/SOULS-REMNANT-ANIM.md 第 10 節;素材已由 T39 做好在 `output/sr-demo/assets/`(讀 manifest.json)。參考 `output/layer-demo/serve.mjs`、`check.mjs` 的 headless 寫法(可複製改寫,不要改 layer-demo 本身)。完全不碰 src/、assets/、sprites/。

## Goal
一個獨立網頁 `output/sr-demo/index.html`,用新角色「灰燼旅人」展示暮影村採用 Soul's Remnant 方法後的效果,每個方法一個可操作的區塊,中文標示,手機寬度也能用。

## Files you may change
- `output/sr-demo/index.html`、`demo.js`、`style.css`、`serve.mjs`、`check.mjs`、`shot-*.png`

## Steps
1. 主舞台(canvas,最近鄰放大 4 倍、地線、可切 待機/跑步/攻擊、可左右移動):
   - **單向 + 鏡像**:只用朝右 strip,朝左 = 整個角色容器 `scale(-1,1)`;武器 offset 的 x 也跟著反向(公式照研究報告第 6 節)。
   - **呼吸**:idle 只有 1 格,非 run 動作整體 +2px 上下呼吸(週期約 1.2 秒),run 時 offset 歸零;開關可關掉做對比。
2. **裝備旗標**:每件裝備勾選開/關,依錨點 + offset 逐格貼在身體上(跟著 head/torso 錨點動)。繪製順序由旗標決定:`render_behind` 畫在身體後;戴帽時頭髮改用 `front_no_top`、不畫 `top`;旁邊即時列出目前的繪製順序清單。
3. **武器類別 profile**:切 劍/長槍;滑桿即時調 `follow_offset x/y`、`rotation`、`flip_vertical`,顯示目前 JSON;武器每格貼到 `hand` 錨點(以 `grip` 對齊)。
4. **斗篷骨鏈**:簡化 FABRIK/verlet 鏈(用 `capeChain` 參數),根部掛在 torso 錨點,`cape_tail.png` 沿鏈切段繪製;角色移動/轉身/攻擊時會甩。開關:骨鏈 vs 靜態,做對比。
5. **獨立特效**:攻擊到第 `floor(frames/2)` 格時在武器尖端位置播一次 fx strip,播完移除;可關。
6. **染色**:斗篷/背心色相滑桿(canvas 像素色相偏移,只動該件裝備)。
7. **檔名驗收表**:列出 manifest 每條 strip:檔名 N、實際寬/格寬、是否相符(綠/紅)。
8. `check.mjs`:起本機 server,1280×800 與 402×712 各載入一次,斷言 0 console error;自動操作:切三個動作、左右翻轉、戴帽/脫帽(斷言繪製順序清單變化:`top` 消失)、切武器、開關骨鏈;輸出 `shot-desktop.png`、`shot-phone.png`、`shot-equip.png`(同一格:光身 / +背心 / +斗篷 / +帽 / 全套+劍 / 全套+槍,放大 4 倍)、`shot-motion.png`(跑步 6 格 + 攻擊含特效)。

## Report extras
- 每個區塊是否可操作;check.mjs 斷言清單結果。
- 截圖肉眼看到的最大問題(例如裝備在跑步格對不上),一句話。
