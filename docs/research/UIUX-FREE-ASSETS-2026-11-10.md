# 免費 UI/UX 素材調查（2026-11-10）

使用者需求：「上網找免費UIUX素材適合我們遊戲」。
調查方式：4 個子代理分頭找（itch.io / CC0 素材庫 / 中日像素字型 / UI 裝飾與 VFX），另加本機實測：
下載候選素材、**用真實遊戲截圖在 1x 尺寸合成**、再判斷風格合不合。所有原檔、測試圖都在
`output/uiux-free-assets/`（output 不進版控）。

## 結論（先看這段）

暮影村的 UI 已經是一套自製的 1px 木質套件（木紋 9-slice + 黃銅角飾 + 暖秋色），
**免費素材包幾乎都是「整組換皮」的完成品**，直接搬進來只會變兩種美術打架。
實測下來值得動手的是 4 件事，其中 1 件是功能問題（缺字）：

| # | 做什麼 | 素材 | 授權 | 為什麼 |
| --- | --- | --- | --- | --- |
| 1 | **補字型缺字**（最優先） | Fusion Pixel 12 zh_hant | SIL OFL 1.1 | 現有 55 KB 子集**少 116 個遊戲實際用到的字**（莊、裝、號、錢、餐、舊、聖、邊、賽、術、窗、節…），這些目前掉到系統字型，12px 下看得到字重不一致 |
| 2 | **自繪滑鼠游標** | 無（用現有調色盤手繪 3 色） | 自有 | 測過 3 個免費游標包全部不合：Kenney 是扁平白色剪影、Gauntlet 太黑太雜、Dragon Regalia 是桃紅卡通色 |
| 3 | 分隔線／角飾「形狀參考」 | Kenney Fantasy UI Borders＋Tiny RPG Mana Soul GUI | **CC0** | Kenney 有 140 個 1px 線稿邊框／分隔線；Mana Soul 有 1px 金色卷草角飾與緞帶。兩者都是拿形狀重畫，不是直接貼 |
| 4 | 說明／筆記類 modal 的紙張內頁 | Kenney Cartography（parchment） | **CC0** | 5 張 1024×1024 羊皮紙紋理，做成木窗內的紙張內頁質感加分；要 9-slice＋撕邊才成立 |

其餘「知名免費 UI 包」實測全部**不建議直接用**，理由與測試圖見下表；可留下來當重畫參考。

## 缺口盤點（我們目前真的缺什麼）

- 沒有自訂游標（`src/*.css` 裡 `cursor:url` = 0 處）
- 沒有裝飾性分隔線／角落花紋
- 沒有紙張／羊皮紙紋理
- 沒有點擊／獎勵閃光 VFX
- 沒有額外的稀有度徽章框（現有 16 個 emblem 已覆蓋主要用途）
- 數字字型：其實已有 Ark Pixel Mono 12，不需要另找

## 實測結果（依「能不能直接用」排序）

### ✓ 可用（CC0，需少量重製）

| 素材 | 連結 | 授權 | 內容 | 實測結論 |
| --- | --- | --- | --- | --- |
| Kenney Fantasy UI Borders | https://kenney.nl/assets/fantasy-ui-borders | CC0 1.0 | 140 個 48/96px 白色線稿邊框、分隔線、面板＋SVG | 染成 `#a8844e` 後 9-slice 成 340×180 外框，讀起來像「黃銅嵌線」，可當次要容器／tooltip／分隔線；幾何扁平，不適合當主視窗 |
| Kenney Cartography（parchment） | https://opengameart.org/content/cartography-pack | CC0 1.0 | 175 PNG，含 5 張 1024×1024 羊皮紙（Basic/Ancient/Crinkled/Folded/FoldedCrinkled） | 做成木窗內的紙張內頁可行（見 `demo/parchment-insert-test.png`）；原生是向量平滑風，縮到 1x 要減色＋加撕邊 |
| Kenney Pixel UI Pack | https://kenney.nl/assets/pixel-ui-pack | CC0 1.0 | 36 PNG：48×48 Ancient（brown/tan/grey/white＋inlay＋pressed）、44×44 inlay、Colored/Outline 9-slice | 真正的像素 9-slice，但**扁平單色、無木紋無黃銅**；當主視窗是降級，只能當凹陷內框／進度條底 |
| Fusion Pixel 12 zh_hant | https://github.com/TakWolf/fusion-pixel-font | SIL OFL 1.1 | 38,213 glyphs，otf 5.16 MB（需自行子集化） | 與現有 Ark Pixel 同作者、同 12px 格線、字形幾乎一致 → 直接補齊缺字，見下面「字型」一節 |
| game-icons.net | https://game-icons.net/ | CC BY 3.0 | 4,180 個單色 SVG（bulk zip 可下載） | 形狀來源，做成 16–32px 圖示要自己點陣化＋配色；使用時必須加 credits |
| Tiny RPG – Mana Soul GUI | https://tiopalada.itch.io/tiny-rpg-mana-soul-gui | CC0 1.0（作者註明不要用於 LLM 訓練） | 可延展標題橫幅、6 個 9-slice 框、**1px 金色卷草角飾／緞帶**、小地圖／頭像／道具框、游標 | 全部候選裡「1px 金色花紋」最接近我們的線條語言；填色是紫／藍／米，需改成木棕＋黃銅。1x 預覽確認（`refs/mana-soul/preview1.png`），未下載原檔 |

### ✗ 測過但不能用（風格或授權不合）

| 素材 | 連結 | 授權 | 實測／原因 |
| --- | --- | --- | --- |
| Tiny RPG – Dragon Regalia GUI | https://opengameart.org/content/tiny-rpg-dragon-regalia-gui | CC0 | 69.5 KB、47 個 PNG，含可延展標題橫幅、2 組滑鼠游標×4 狀態、7 個裝備框。**實際是桃紅／青綠高飽和 JRPG 風**；把標題橫幅貼進我們標題列（`demo/style-fit-header-board.png` 第 2 列）直接打架。可用的只有「形狀」 |
| Golden UI | https://opengameart.org/content/golden-ui | CC0 | 606×414 的 `ui_split.png`，暖金＋深棕，是全部候選裡色調最接近的；但金邊是 3px 金色釘飾、內裡是冷灰藍，貼進我們的標題列（同圖第 3 列）看得到兩種框線語言。當重畫參考可以 |
| Golden UI – Bigger Than Ever | https://opengameart.org/content/golden-ui-bigger-than-ever-edition | **CC-BY-SA 3.0** | 大尺寸版本更好用，但 ShareAlike 會污染我們的封閉美術；有 CC0 原版可選時不要碰 |
| BDragon1727 Retro Pixel Ribbons / Custom Border and Panels / 750 FX | https://bdragon1727.itch.io/ | 免費僅非商業；商業需贊助作者；**禁止轉散布原始檔** | itch 免費層不是 CC0。我們的 build 會把原始 PNG 公開在網路上，這條「不得再散布素材原檔」是實際風險，商業化也要先付費 |
| Kenney Cursor Pixel Pack | https://opengameart.org/content/cursor-pixel-pack | CC0 1.0 | 182 個 16×16 游標；染成金／羊皮紙色後變成「金色色塊」，與 1px 三色調不合（測試圖 `demo/cursor-preview-board.png`） |
| Gauntlet Cursor | https://opengameart.org/content/gauntlet-cursor | CC0 | 32×32 中世紀鐵手套，亮度→調色盤重上色後在 1x 是一坨深色雜點（`demo/cursor-in-context-strip.png`） |
| Item Popup Starburst | https://opengameart.org/content/item-popup-starburst | CC0 | 60 格 160×160，是 AE 式柔和光暈不是 1px 像素；拆單顆閃光也拆不出來（射線連成一整片），要重畫 |
| Lifebar with gold ornaments | https://opengameart.org/content/lifebar-with-gold-ornaments | CC0 | 金絲緞帶 84×22；染色後平鋪成標題下分隔線，1x 下像一排柵欄（`demo/gapfill-divider.png`），需放大 2x＋抽稀 |
| Pixel Parchment UI Kit | https://opengameart.org/content/pixel-parchment-ui-kit | CC BY 4.0 | 78.4 MB，紙質 UI 整組（含 Ren'Py 專案），要 credits；我們只要紋理，用 Kenney Cartography 更輕 |
| CraftPix 免費包 | — | 條款禁止再散布原始 PNG | 同 BDragon 的風險，且帳號 gate＋HD 向量風 |
| gameuidatabase.com | https://gameuidatabase.com | — | 對 web_fetch 回 403（Cloudflare），只能人工參考，未驗證 |
| itch.io 搜尋頁 | https://itch.io | — | 列表頁對 web_fetch 一律 403；單一素材頁可抓 |

### itch.io 的其餘候選（授權多為「免費非商業／不可轉散布」）

| 素材 | 連結 | 授權 | 判斷 |
| --- | --- | --- | --- |
| UI: 02 Wood Theme（Admurin） | https://admurin.itch.io/ui-wood-theme | 免費含商業，但不可轉散布原始檔 | 材質最接近（木框＋淺色內面、含 bitmap 字母），但 32/40px 太小、1:1 用會糊；字型在 1.50 CAD 付費層 |
| Free Medieval Fantasy UI Pack（Kibyra） | https://kibyra.itch.io/free-medieval-fantasy-ui-pack | 免費含商業、標註非必要、不可轉散布 | 208 個暖木／羊皮紙圖示（地圖、卷軸、按鈕），當徽章／工具列裝飾可以；頁面自承「AI Assisted」，風格偏平滑 |
| Pocket Inventory #5 / Humble Gift Paper UI System（Humble Pixel） | https://humblepixel.itch.io/pocket-inventory-series-5-player-status | 可商用、不可轉散布 | 羊皮紙書頁＋緞帶標題＋分頁＋tooltip 框，1px 線條；紙張／分頁缺口的好參考 |
| Pixel RPG UI Pack（Immunity） | https://immunitys.itch.io/pixel-ui-pack | 免費含商業 | 米色書本風＋右側分頁欄，是一整組版面不是模組化 kit |
| Aspecs Pixel Art Cursors | https://aspecsgaming.itch.io/pixel-art-cursors | 可商用、標註非必要 | 游標缺口唯一沒被我們實測退掉的 itch 候選（未下載驗證） |
| Cainos 32×32 RPG Icons | https://cainos.itch.io/pixel-art-icon-pack-rpg | 免費含商業 | 稀有度徽章／道具圖示的替代來源 |
| Cup Nooble Sprout Lands／Butter Milk Tiny Wonder | — | 免費僅非商業 | 排除 |
| prinbles tiny-gui-pack | — | — | 404，不存在 |

## 字型：這次最大的實際收穫（順手抓到的 bug）

現況：`assets/fonts/ark-pixel-12-zh_tw.woff2`（55,352 B）與 `ark-pixel-12-mono-zh_tw.woff2`
（54,788 B）是**子集**，只有 1,796 個字形。比對 `src/**`（31 個檔）實際用到的字：

- 遊戲用到 1,639 個不同漢字，**其中 116 個不在現有字型裡**（例：莊、裝、號、錢、餐、舊、聖、
  聯、邊、賽、術、窗、節、房、堂、遇、警…），會落到 CSS fallback（`Microsoft JhengHei` /
  `PingFang TC` / `Noto Sans TC`），12px 下就是「兩種字型混在一句話裡」。
- **Ark Pixel 上游也不齊**：上游 zh_tw（26,178 glyphs）仍缺這 116 個中的 99 個。
  所以「重新子集化 Ark」只能補 17 個，救不完。
- **Fusion Pixel 12 zh_hant（同作者維護，OFL 1.1）缺 0 個**，且跟現有 Ark 同 12px 格線、
  字形幾乎相同 → 換過去畫面不會跳風格。

證據圖：`demo/font-coverage-proof-x2.png`（三行：現用子集 / Ark 上游 / Fusion，逐字對照）、
`demo/font-ark-vs-fusion-crisp-x4.png`（字形比對）。腳本：`output/uiux-free-assets/_font_coverage2.py`。

建議做法（只動 2 個字型檔＋1 行 CSS，外加 canvas 端的 family 字串）：

1. 下載 Fusion Pixel 12px proportional zh_hant（v2026.11.10 otf 5.16 MB）。
2. 用 `pyftsubset` 只留遊戲用到的字（沿用 `output/ark-chars.mjs` 收集清單，補上現在漏的字），
   輸出 woff2（同尺寸約 55–70 KB，不會變胖）。
3. `@font-face` 改名成 `Fusion Pixel 12` / `Fusion Pixel Mono 12`，同步 `--font-ui`／`--font-num`
   與 `src/pixel-world.js:textFont()` 的字型字串，保留系統字型當 fallback。
4. 驗證：`npm run verify`（字級／行高不吃字型固定值，但 T118 有版面 fallout 的歷史）。

注意：Ark Pixel 16px 已被作者停更並在 README 指向 Fusion，10/12px 使用者也建議轉 Fusion，
所以這不是「叉出去」，是作者指定的路線。

## 游標（唯一沒有免費解的一項）

實測 3 個包都不合，結論是**自己畫**：24×24 或 32×32、只用 3 色（`#22110a` 深墨描邊、
`#f0e7c9` 羊皮紙填充、`#a8844e` 黃銅亮面），箭頭型或手套型都好，重點是跟 1px 三色調一致。
`assets/ui/px-ic-arrow.png` 可以直接當底改。

## 授權整理（要記住的差異）

- **CC0**（可任意用、不用標註）：Kenney 全系列、Golden UI、「Lifebar with gold ornaments」、
  Item Popup Starburst、Kenney Cartography、game-icons 之外的 OGA CC0 素材。
  禮貌上仍可在 credits 列一行。
- **CC BY 3.0/4.0**（要標註）：game-icons.net、Pixel Parchment UI Kit、Ardentryst 游標、
  qubodup 游標、Lamoot RPG GUI construction kit。
- **CC BY-SA**（會傳染、不要用）：Golden UI「Bigger Than Ever」、LPC Pennomi UI、varied-parchment。
- **itch.io 免費層**（不能直接商用、不能轉散布原始檔）：BDragon1727 全系列、Alkhemia 等。
  我們若上市（Steam／itch 付費頁／廣告）要先付費或換素材。
- **CraftPix**：條款禁止散布原始 PNG，與我們把素材檔公開在 web 的現況衝突。

## 如果要換整組皮（另一條路，這次不建議）

若哪天想把 UI 換成「更華麗的 JRPG 風」，最接近的完整包是 Golden UI（CC0，暖金＋深棕），
但那是**重做整套邊框語言**，不是挑素材補洞；需要先定案美術方向再動，不在這次範圍。

## 檔案與重現

- `output/uiux-free-assets/ui-decor-vfx.md`：UI 裝飾／VFX 候選（13 項）
- `output/uiux-free-assets/cc0-libraries.md`：CC0 素材庫（Top 5＋下載驗證紀錄）
- `output/uiux-free-assets/cjk-pixel-fonts.md`：中日像素字型（含 pyftsubset 配方、授權陷阱）
- `output/uiux-free-assets/itch-pixel-ui.md`：itch.io 像素 UI 包（12 組，含 21 條已驗證連結）
- 實測圖：`demo/style-fit-header-board.png`、`demo/gapfill-divider.png`、
  `demo/kenney-divider-in-context.png`、`demo/parchment-insert-test.png`、
  `demo/font-coverage-proof-x2.png`、`demo/cursor-preview-board.png`
- 下載原檔：`refs/kenney-borders/`、`refs/kenney-cursors/`、`refs/kenney-pixel-ui/`、
  `refs/kenney-cartography/`、`refs/dragon-regalia/`、`refs/golden-ui_split.png`、
  `refs/lifebar/`、`refs/starburst/`、`refs/fusion/`、`refs/gauntletCursor/`
