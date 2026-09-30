# 圖像素材來源

- title.png：本聊天先前使用內建 ImageGen 產生的原創像素村莊。
- hall.png：以 title.png 為參照，內建 ImageGen 單張編輯，抽出大廳置於洋紅背景。v1.3 接入真正場景與建築資訊。
- inn.png：2026-09-29 以 title.png 為參照，內建 ImageGen 單張編輯。Prompt: “Extract only one blue-roof medieval inn building from this image. One complete detailed pixel-art building, isolated on a pure magenta background. Preserve the same pixel-art style and three-quarter overhead view. No characters, text, ground or other buildings. Single image.”
- 其他建築、獵人、魔物、樹木、地表與物品圖示：本專案 Canvas 像素繪製。

原始 PNG 原封保存，遊戲載入時以色鍵移除洋紅背景並以近鄰縮放呈現。鐵匠鋪影像生成未成功，未加入任何不存在的素材；仍使用已細化的程式像素版本。


## v1.4 圖集

`buildings14.png`：內建 ImageGen 以 hall.png 作風格參考，一次產生一張 4×3 建築圖集。生成工作於中斷後完成，重新讀取並確認全部十二個格子可用後納入專案。原圖保存於 generated_images 的 exec-cdfd4f12-8ce5-4447-8a24-867ffbf86e5d.png，專案有獨立副本。

Prompt: Create ONE pixel-art sprite atlas image. Exactly 4 columns and 3 rows of equal square cells, pure solid magenta background. One entire isolated building centered in each cell, none crossing cell boundaries. Match the richly detailed 3/4 elevated medieval pixel art of the reference. Row 1: green-roof market with fruit stalls, orange-roof bakery with bread oven, purple-roof tavern with barrels, ivory-roof herbal clinic with herb gardens. Row 2: slate-roof blacksmith with glowing forge, violet-roof magic academy with small tower, wooden training courtyard with archery targets, pale stone resurrection shrine with blue crystal. Row 3: small teal-roof hunter cottage, gold-roof bounty office with noticeboards, red-roof equipment refinement workshop with tools, stone dungeon cave with purple entrance. Dense tile, timber, brick, lantern, window and prop details. No text, people, numbers, borders or ground beyond each building foundation. One atlas image only.
