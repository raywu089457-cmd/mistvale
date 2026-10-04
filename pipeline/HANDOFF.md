## 2026-10-05:商業像素遊戲標準視覺體檢(最新)

每條都有可重現的量測工具(`pipeline/scripts/check/`),修完全部 0:
| 檢查 | 工具 | 修前 | 修後 |
|---|---|---|---|
| 破圖:去背殘色/半透明光暈/描邊一致(暗描邊 ≥55%) | `audit_art.py` | 描邊/尺寸不合 3 | 0 |
| 換姿勢身體左右跳(軀幹中心 ≤12% 寬) | `audit_pose_jump.py` | 18 個姿勢 | 0 |
| 魔物各格身體前後跳 | 同上量法(ax 錨點) | 狼受擊 −14%、魔像出手 −16%、領主 +12–17% | 錨點對齊 |
| 單位/擺設 vs 建築畫的先後(穿模) | `check_zorder.mjs` | 77/5271 錯 | 0/4000+ |
| 像素密度一致(mixel,各類 vs 英雄 0.67–1.5) | `audit_density.py` | 道具 0.57、樹 2.2、建築 2.9 | 0.81–1.01 |
| 動畫閃格/走路跳格/受擊回饋 | `check_anim.mjs` | — | 0/0、132/132 有受擊格 |
| 擺放、出入口、朝向 | `check_placement`/`check_gates`/`check_facing` | — | 0 |

主要修正:
- **英雄**:錨點改「軀幹中心」(腳底會被落地的斧頭/盾/法杖拉偏);待機也走同一條繪製路(以前待機被塞進 40 寬畫布,寬武器職業待機變小);
  第二張表站姿(idle2/drink/trade)逐格校正身高(黑騎士/法師小了 13–18%)。
- **穿模**:會動的單位與擺設跟建築的前後改用「往鏡頭方向射線是否穿過佔地」判定(`depth()`),單一 x+z 排序對點 vs 長方形會錯。
- **像素密度**:全部美術統一 ≈0.62 邏輯單位/美術像素 —— 英雄縮成 34px 高真像素畫(職業色盤、深色描邊)、2x/4x 為整數倍放大;
  道具/魔物/樹/特效依遊戲畫的外框像素化(`assemble.py` `pixelize_prop`,同一魔物所有格同倍率);UI 圖示 24px 像素畫;
  地面材質 256 格、TERRAIN_TEX_SCALE .25→.5;建築第六批單張高細節重繪(以原圖當 REF,約 170 美術像素寬)再像素化。建置 34→7.4 MB。
- prompt 全部寫進 `assets/PROVENANCE.md`(第二~六批 75 條)。
- 光源:場景素材右半−左半亮度中位數 −2(左亮 90 / 右亮 70)— 沒有系統性跟「光從右上、影子往左下」矛盾,未改。
- FPS:GPU 桌機/手機 30/30;軟體算繪桌機跟改前同一時段交錯量 19–22 vs 16–21(機器負載波動大),手機 30。
- 量測注意:生圖原表的美術像素格距用 FFT 量(合成驗證 3/5/8 → 2.98/4.98/7.98),建築表有茅草紋週期會量錯,所以未像素化的資產一律用實測的 4。

## 2026-10-05:素材擺放檢查、地面高細節、英雄/魔物更多狀態、特效方向(branch art-polish,最新)

- **英雄每職業 +10 個狀態**(第四批,第一張待機圖當 REF 生,依 idle2 高度縮成同尺寸):`idle2` 呼吸、`strike2` 收招、`dead` 倒地、`victory` 歡呼、`eat` 用餐、`drink` 飲用、`sleep` 睡覺、`bandaged` 包紮、`trade` 交易、`train` 訓練。
  畫面:待機 idle↔idle2 交替;近戰出手 0.2 秒後換 strike2;狀態文字 → 用餐/飲用/休息/休養/交易/訓練圖;打倒目標歡呼 0.9 秒;倒下用 dead 圖(原本是待機圖轉 90°)。
- **魔物每種 +5 格**(monsters 圖集 5–9):5 呼吸待機、6 第二走路格(史萊姆著地壓扁)、7 出手收招、8 第二受擊格、9 倒下屍體(死亡特效 8→9 躺 1.1 秒再淡出)。
- **地面高細節**:`tex2-*` 生圖要求小像素(1254² 約 5px 一格)→ 縮到 256 原生 → 色調逐通道配回第一版(已確認的 Xilurus 色票)→ 無縫化 → 512 大格(第二層旋轉/位移、週期雜訊遮罩切換,不混色)。
  1 原生像素＝0.25 畫面單位,跟建築 2x 圖集同密度(原本村莊地面 1 原生像素＝1.4 單位,粗 5 倍)。手機地面 2px/單位時開平滑避免摩爾紋。建置 20→34 MB。
- **特效方向**:fxSlash 原圖是「由右往左揮」,原本翻面反了 → 攻擊者在左才翻面。擺拍 `stage.mjs`(scratchpad)驗:斬擊、箭、法球、聖光、受擊爪痕左右兩側都對。
- **擺放**:新 `pipeline/scripts/check/check_placement.mjs`(實心擺設不壓建築/路/柵欄/出村口、不在空地、彼此不疊)→ 只抓到霜杉林地空地旗插在村裡街上 → 改插空地四側第一個不在村內、不在路上的位置。
  建築名牌改放在自己屋頂上(原本放地基前緣,被前排建築蓋住,看起來像別棟的名字)。
- **全畫面掃描**:8 區 × 3 縮放 + 世界圖 `proc={}`、英雄無程序圖;所有 UI 面板(建設、獵人、交易、製作、地下城、競技場、委託、倉庫、世界圖、說明、設定、建築面板)圖示/立繪/縮圖都是新圖。
- 驗收:npm test 全過、check_embedded_assets 251 個 id、check_atlases 全過、check_placement 0、check_gates 東 375/南 83/穿 0、check_facing 全 0;FPS GPU 30/30、軟體算繪桌機 24 手機 30。
- `HTML=<建置檔>` 環境變數可讓 check_embedded_assets / check_placement / check_facing 指定建置檔。

## 2026-10-04 晚:全部美術換成 Xilurus 風格(commit d7d8e24、5e5e90a,最新)

**遊戲原本的美術已全部取代**:`assets/` 裡每個檔案都是 Xilurus 風格新圖(舊 concept-clean、buildings/stream/villagers/monsteratk 圖集、hall/inn/monument.png 已刪,git 歷史裡有)。
- 一鍵重組:`python pipeline/scripts/xilurus/assemble.py [atlases|heroes|buildings|textures|tones|title|all]`
  來源是 `output/l0veyou/<表>-v1.(png|jpg)`(prompt 在 `output/l0veyou/prompts/`,`make_batch2.py`/`make_batch3.py` 產 prompt,`run_batch*.sh` 依序生圖)。
  **檔名與 cell id 跟舊版一樣**(details/props/cold/woods/flora/yard/town/town2/vfx/icons/monsters + hero/heropose + terrain-atlas/plaza/road/concept-*/woodui/title),所以 pixel-world.js 幾乎不用改。
- 第三批生圖(27 張):地貌/農作/庭院道具/特效/UI 圖示 2 張/六職業英雄(每職業一張 5x2:待機、走路 1–4、蓄力、出手、受擊、休息、勝利)/標題圖/12 種地面材質/UI 木紋。
  英雄全部朝右;法師用綠底(紫水晶)。黑騎士 walk4 沒拿劍 → `POSE_FIX` 用 walk2 代。狼表整張朝左 → 鏡像再切。柵欄段生成方向相反 → `MIRROR_CELLS` 鏡像。
- 地面材質:1024² 生圖 → 去外圈 5% → BOX 縮到 64² 原生像素 → 無縫化(半格位移 + 有機抖動遮罩,不混色) → 最近鄰放大 256。海往青藍拉;土路重生成「無車轍」版(車轍在空地上變條紋)。
  生態域底色/小地圖色由 `tones` 步驟從新材質量測寫進 `GRASS_TONE`/`MAP_ACCENT`(不再對齊舊概念圖)。
- 程式改動:build.mjs 改嵌 `assets/xilurus/<建築>.png`(去背)、不嵌舊圖集;pixel-world.js:新建築畫寬、出村口改一座村門(南門翻面)、柵欄段尺寸 22.6×22、投射物改 `arrowFx`、標題圖 16:9;
  影子改用最長邊 ≤128px 的縮小版計算(新圖一格 250–350px,原尺寸影子讓軟體算繪 30→23fps)。
- 驗收:`node pipeline/scripts/check_embedded_assets.mjs`(49 個嵌入檔＝Xilurus 來源、171 個遊戲用到的 id 都在、舊圖集沒嵌)、`check_atlases.py` 29/29、`npm test` 全過、
  `check_facing.mjs` 全 0 錯、`check_gates.mjs` 東 375/南 83/穿柵欄 0、各視角 `proc={}`、無 pageerror。
  FPS:GPU 算繪桌機/手機都 30(上限);純軟體(headless SwiftShader)桌機 30→24(影子層蓋的面積變大,新樹比較茂密),手機 30。
- 已知:標題圖左下角有一小段溪(只是插畫,地圖上沒有河);地形磚(isoterrain)沒用到,地面用的是無縫材質。
- 注意:同一時間有另一個代理在改 `src/pixel-game.js`/`pixel-ui.js`/`pixel-world.js`(流浪英雄、英雄待機等指令),那些改動不是這次美術工作的一部分。

# 交接：概念圖對齊（2026-10-03）

## 2026-10-04 15:30:Xilurus 風格第二批(46 件,補齊遊戲要用的整套)

接續上一節第一批(36 件風格樣品),這批照遊戲實際要用的東西一對一生:
- prompt 產生器 `output/l0veyou/prompts/make_batch2.py`(規則同第一批)、批次腳本 `run_batch2.sh`(已存在的圖會跳過)、總覽 `overview_batch2.py` → `output/l0veyou/batch2-overview.png`。
- 全部 `magenta殘留=0`。原圖 `output/l0veyou/<名>-v1.png`。

| prefix | 格 | 內容(id 跟遊戲一致) |
|---|---|---|
| `isobld-a` | 4x1 | hall／trading／restaurant／inn |
| `isobld-b` | 4x1 | tavern／clinic／forge／academy |
| `isobld-c` | 4x1 | training／sanctuary／house／bounty |
| `isobld-d` | 4x1 | enhancement／dungeon／monument(廣場騎士像)／gate(村門,配新的東南出村口) |
| `isomon-slime/-wolf/-golem/-boss` | 5x1 | `<type>0..4` ＝ 待機／蓄力／出手／走路／受擊,跟 `monsters`+`monsteratk` 的格號一樣,可直接換 |
| `isoterrain2` | 4x2 | forestFloor／taigaMoss／mountainRock／desertSand／meadowFlowers／dirtRoad／plazaStone／ice |
| `isoprops2` | 4x2 | stall／fruitStand／handCart／bench／anvilStump／weaponRack／dummy／archeryTarget(id 同現有道具) |
| `isonature` | 4x2 | snowPine／birch／cactus／boulder／mossRock／iceRocks／outcrop／wildflowers |

- 魔物 slime/wolf/golem 帶第一批待機圖當 REF(`output/l0veyou/ref-iso-*.png`),外型跟第一批一致。
- **首領改成暮林領主(樹人)**:第一批 `isomonsters` 的 boss 是紅色有翼惡魔,跟遊戲的「暮林領主」不符 → 以 `isomon-boss` 為準。
  第一批 `isomonsters` 的狼也是朝左。**第一批 `isomonsters` 整份作廢,用 `isomon-*`**。
- **朝向**:遊戲規則是「所有圖朝右、往左才鏡像;受擊＝被右邊打往左退」。prompt 寫了 facing RIGHT,狼還是整排朝左 →
  `mon-wolf-iso-v2-v1-mirror.png`(整張左右翻)再切,id 順序反過來(`wolf4,wolf3,wolf2,wolf1,wolf0`)。之後每張魔物表都要先看朝向再切。
  魔像走路格(golem3)前腳往左下踏,朝向有點曖昧,可接受;要更乾淨就重生那張。
- 小瑕疵:餐廳煙囪的煙帶一點淡紫(洋紅去背殘色,不算 magenta 殘留);地形磚是「有厚度的方塊」不是純平面菱形(第一批也是),接進遊戲要嘛裁掉側面、要嘛當高台用。
- 已接進遊戲(見上一節「全部美術換成 Xilurus 風格」);中間產物 isobld-*/isomon-* 等圖集已刪,由 assemble.py 直接從原圖重組。

## 2026-10-04 15:00：Xilurus 風格批次生圖（l0veyou 管線，一次 36 件）

目標：補一批「等角村莊素材」，風格對齊 Xilurus（16-bit 等角、乾燥暖色、厚實深棕描邊、茅草頂）。
做法是**生圖為主、程式管線負責後製**。純 PIL 程式畫的版本風格語彙正確但精緻度追不上手工像素（見下「結論」），生出來的品質跟目標同級。

### 流程（三步，可重複）

1. **寫 prompt** → `output/l0veyou/prompts/<名>.txt`。規則：
   - 開頭固定 `Pixel art sprite sheet, 2:1 isometric view, 16-bit retro JRPG style...`
   - 明講格數與排列：`Exactly N separate ... arranged in a clean 4 columns x R rows grid`，
     再**逐格描述**每一格要什麼，不然模型會自己亂排。
   - 結尾固定：純 magenta 背景、無地面、無投影、無文字、只出一張圖。
   - **寫死色票（hex）**才會貼近目標風格，這批用的是：
     `salmon pink #d29c8a / dark red-brown #642726 / golden straw #c49459 和 #bb863d / dark brown outline #0a0706 / blue-gray stone #5b5e6e`
   - **4 欄的表一律用 16:9**（格子近正方，物件才不會被切邊，詳見 l0veyou.md）。
   - 魔物動作格：同一張圖寫「row 2 is the SAME four monsters in their attack frame」，同一張出待機＋出手，一致性很好。
2. **生圖**：`node pipeline/scripts/l0veyou/generate.mjs <prompt> output/l0veyou/<名>.png "" 16:9`（約 25–30 秒）。
3. **切圖集**：`python pipeline/scripts/l0veyou/sheet_to_atlas.py <原圖> <prefix> 4x2 <id1,id2,...>`
   產出 `assets/<prefix>@1x/@2x.png` + manifest。**`magenta殘留=0` 才算過**。

### 這一輪產出（36 件，全部 magenta 殘留 0）

| prefix | 格數 | 內容 |
|---|---|---|
| `bldiso` | 4（4x1） | cottage／farmhouse／tower／well（茅草屋、二層農舍、石塔、水井） |
| `isoterrain` | 8（4x2） | dirt／grass／cobble／water／sand／snow／soil／gravel |
| `isotree` | 8（4x2） | autumnOak／greenOak／pine／deadTree／bush／stump／sapling／flowerBush |
| `isoprops` | 8（4x2） | crates／barrels／logs／fence／lantern／signpost／tent／hayBale |
| `isomonsters` | 8（4x2） | slime0/1、wolf0/1、golem0/1、boss0/1（0 待機、1 出手格） |

原圖在 `output/l0veyou/*-iso-v1.png`（+ `bld-iso-houses-v1.png`），prompt 在 `output/l0veyou/prompts/`。
**都還沒接進遊戲、也還沒 commit**（`git status` 顯示 `??`）。要接進遊戲時記得：
這批是等角村莊風，跟現有 `buildings@*`（3/4 俯視高解析）**不是同一套**，不要混在同一個場景；
要用就整套換（地形＋建築＋樹＋道具一起）。

### 啟動生圖瀏覽器的坑（照舊寫法會失敗）

- **要用 `chromium-1243/chrome-win64/chrome.exe`**（Playwright 新版目錄是 `chrome-win64`，不是 `chrome-win`）。
  舊的 `chromium-1181/chrome-win/` 起不來：profile 的 `FormFieldData pickle version 10` 比它新，
  症狀很詭異 —— log 寫了 `DevTools listening on ws://127.0.0.1:9447` 但**行程馬上死掉**、
  `/json/version` 不回應、`netstat` 看不到監聽。別在這種症狀上打轉，直接換新 chromium。
- **`curl 127.0.0.1:9447` 要加 `--noproxy '*'`**，不然被環境的 proxy 吃掉，會誤判成「瀏覽器沒開」。
- **分頁空白時 `generate.mjs` 會印 `NO_LOGGED_IN_TAB`，不代表真的沒登入**：
  先 `p.goto('https://l0veyou.com/chat')` 讓分頁載入完再跑就好。登入狀態存在 `work/.l0veyou-profile`，
  重開瀏覽器不會掉。判斷登入：頁面文字有「登录 / 注册」才是沒登入；有「最近对话」就是登入了。
- 每張新圖都開新對話（`generate.mjs` 自動按 `button.new-chat`），避免「多参考图」把前一張當參考、污染風格。
- 啟動：`powershell Start-Process -FilePath '<chromium-1243>/chrome-win64/chrome.exe' -ArgumentList '--remote-debugging-port=9447','--user-data-dir=C:\...\work\.l0veyou-profile','--no-first-run','--no-default-browser-check','https://l0veyou.com/chat'`。
  （git-bash 直接背景啟動會被鎖在前景，用 `Start-Process` 分離。）

### 結論：純程式畫 vs 生圖（兩邊都試過，省得重做）

- `output/xilurus-style-demo/remake.py` —— 純 PIL（value noise + fBm 有機紋理、葉團演算法、人字形茅草頂、
  4x4 Bayer 抖動、暖深棕描邊），**風格語彙對但精緻度明顯差一截**：地面太規則、樹太圓、建築太簡。
- 同風格的生圖素材**已經在目標等級**（茅草紋、木樑、石造煙囪都到位）。
- 所以這類美術一律：**生圖為主，`sheet_to_atlas.py` 負責去背／切格／圖集**。
  程式畫只留給「要無縫、要參數化、要能重生」的東西（例如地形材質 `concept_textures.py`）。
- 如果你還是想用程式畫：`remake.py` 已經把色盤（從 Xilurus 預覽圖量化）、fBm、葉團、等角磚都寫好了，
  可以直接當起點，但別期待一輪就追上手工像素。

## 2026-10-04 夜:拿掉河流橋梁、木柵欄兩出口、村內嚴格走路、朝向檢查(最新)

- 狀態:main 本機 commit,**未 push**(push = 部署 Pages,先問使用者)。
- 地形:`overworld.js` 拿掉河流/小溪/所有橋(`BRIDGES`、`riverX`、`creekX`、`isBridge`、`isWater` 都刪了),`walkable = inWorld`;世界內全是實地。
  畫面上的河面、橋欄、石墩木橋、瀑布、溪邊苔石、河面閃光也一起拿掉(`stream` 圖集還嵌在建置裡但沒用到)。公園池塘(街區裝飾)保留。
- 村莊:`village-grid.js` 的 `FENCE`(四邊,離街緣 0.45)+ `EXITS` 兩個出村口:東門＝畫面右下(z=7.25 那條街)、南門＝畫面左下(x=-13.25 那條街),到村子最下角距離相同。
  `landscape-layout.js` 的 `PALISADE` 依 FENCE/EXITS 切段(實心碰撞),畫面用等角 `fenceRail`(南北邊翻面),門口兩側 `gate` 旗柱。
- 道路:只有村內石板街 + 兩條街穿過門口鋪到門外 1.2 格(`EXITS[].out`);村外沒有路(地下城入口也沒有路)。
- 導航(`pixel-game.js`):村內 = `roadGraph(roads)`(路段在交叉點切開)只沿路中心線走,村裡的起終點投影到最近路段;
  村外 = 可視圖(門外點、村莊四角外 0.9、村外建築四角),直線自由走,不能穿過村莊範圍。新獵人出生點投影到路上。
- 動作方向:
  - 戰鬥中被「分散站位」推開時不播走路圖(原本面向目標+走路圖＝倒退走,推力也比走路快),推力 2.4→1.2。
  - 魔物倒下:沿用受擊圖與朝向(面向打倒牠的獵人);原本 flipHint 反了,死亡瞬間會翻面。
  - 停著等空位的魔物面向牠盯著的獵人(sim 記 `facingAt`)。
  - 新 hook `__mistvaleFacing()`:每隻最後畫出的朝向/姿勢。
- 驗收:`npm test` 全過(含柵欄只有東/南兩口、路只到門口、村內 100% 在路中心線);
  `node pipeline/scripts/check/check_gates.mjs`(7 區 × 600 秒:東門 375、南門 83 次進出、穿柵欄 0、村內離路 0/115588);
  `node pipeline/scripts/check/check_facing.mjs 60 look:19,3,2.6`(實機每幀:英雄走路 0/5914、英雄戰鬥 0/685、魔物走路 0/27152、魔物戰鬥 0/247 錯誤);
  各視角 `proc={}`、無 pageerror。
- 對概念圖:概念圖有溪與石橋,拿掉後 hist_bc/conform 沒重量(使用者要求優先)。

## 2026-10-05 晚：動作方向、走路循環、戰鬥站位（最新）

- 狀態：main 比 origin 多 1 commit（1eb51de 戰鬥站位，未 push）；之前全部已上 Pages（f08a3f6）。
- 英雄走路：4 格循環 walk1–4（`walk4-<職業>-v1.png` 綠底，以各職業待機圖為參考），`walkFrame()` 每秒 8 格；舊 walkA/B 保留未用。
- 方向規則：所有圖朝右、往左走/打就鏡像；受擊一律面向打來的一側（受擊圖＝被右邊打往左退）。魔物走路用第 3 格（側面），史萊姆著地壓扁/騰空圓。
- 戰鬥站位：草原空地 x19 半徑 5.8（landscape-layout ARENAS）；魔物只在空地內 1.2 格追；等空位的魔物站到戰鬥另一側；目前狩獵區上限 5。
- 驗收工具（scratchpad，不在 repo）：擺拍方向／特效時間軸、四方向走路連拍、魔物走路連拍；repo 內 `check_heroes.py`（6×10 姿勢×3 LOD）。
- 已知未完：戰鬥正下方等待的魔物仍可能半擋英雄（有半透明重畫與最上層血條）；與獵魔村物語的相似度是目測，沒有實機截圖比對。
- l0veyou：登入存在 `work/.l0veyou-profile`；用前啟動 chrome 9447，用完關。

## 2026-10-05：建築等角幾何、英雄 Q 版無破圖

- 建築：委託所原本是正面平板（不符 2:1 等角）→ 重生等角涼亭 `bounty-concept-v3.png`；`fitScaleFor` 另算「貼地輪廓外框中心」把佔地置中到街區（原本都偏後半）。
- 英雄：`make_sd_heroes.py`（Q 版 2 頭身，1x/2x/4x）。法師的紫水晶跟洋紅底同色 → 法師改用綠底單獨表 `sd-sorcerer-v1.png`（`solo=sorcerer:…`，出手格左右翻轉）。
  其他職業：`regreen()` 用「跟圖邊連通」找背景＋被包住的純底色洞，`clean()` 清外緣洋紅、縫裡殘色改描邊色。
- 驗收：`python pipeline/scripts/align/check_heroes.py 總表.png` → 6×7×3 無缺格／洋紅／綠色殘留／碎裂、姿勢高度一致。

## 2026-10-04 下午：建築不壓街、可搬可縮放、地面高解析、拿掉村民

- 建築畫的大小＝min(玩家設定 `layout[id].s`(0.6–1.6), 街區容得下的最大值)。`fitScaleFor()` 用圖的實際像素算：錨點以下的像素要落在街區內、左右不超過街區菱形角。`world.buildingScale(id)` 給 UI 顯示。
- 搬家吸附到最近街區正中；目標街區有建築就互換；廣場不能蓋。被佔用的田/公園等街區不再擺設（池塘也跟著消失）。建築面板有「縮小／放大」。
- 地面畫布改成只涵蓋陸地（2345×1180 邏輯單位）、桌機 4 px/單位、手機 2；`TERRAIN_TEX_SCALE` .5→.25，材質細緻度跟建築圖同級。
- 村民、貓狗、釣魚人拿掉，街上只剩英雄；廣場只留四角矮花圃。

## 2026-10-04：棋盤格村莊、各區生怪、走路/休息圖

- **`src/village-grid.js` 是村莊布局的單一來源**：5×5 街區（10.5 單位），建築預設位置、石板街、柵欄/出村口、街區用途（田、果園、市集、公園池塘、水井廣場、畜欄、牧草地、花園、柴場）都從這裡算。廣場固定 (-8,2)。
  概念圖的地面分類／道具／人物在村裡已不用（`concept-*.js` 還在，只剩匯入）；村莊地面層 `buildVillageLayer` 改用街區路徑畫。
- 世界 minX -30 → -54；`WORLD.threeXArea` 保留原 3 倍面積當下限。
- 生怪：`REGION_MIX` 每區組成、強度＝難度 × region.risk；目前狩獵區上限 7、其他區上限 4；獵人只打目前狩獵區。
- 姿勢圖：heropose（strike/windup/hurt/walkA/walkB/rest）、monsteratk（2 攻擊、3 走路、4 受擊）。`make_combat_art.py heropose pose=檔 …`、`monsteratk 2=檔 3=檔 4=檔`。

## 2026-10-03 深夜：地形、道路、文字

- 文字：畫布改裝置解析度（devicePixelRatio，上限 2.5），像素圖照舊最近鄰放大；`textLabel()` 只排隊，最後在 `drawScreenText()` 用高解析畫。
  戰鬥空地不再顯示地名／「戰鬥空地」／首領名／礦坑名；地名只在拉遠時畫在空地外緣。
- 海岸：`visBiome()`＝畫面地形（含世界外一圈不規則延伸陸地，EXT=11，只是風景、不能走）；沿岸圓斑＋白浪；沙灘只在草/林/沙漠，山地灰碎石岸，雪地直接接水。
- `biomeAt` 加中頻起伏（邊界不再是長直線）；雪地改冷白；山地空地不鋪土。
- 地貌圖集 `cold`（雪堆、冰湖、冰晶岩、山崖）、`woods`（倒木、樹樁、苔石、蕨叢），依地形散佈。
- 道路：在等角座標描線（圓頭、蜿蜒）＋遮罩填材質；行走用的 `getRoads` 不變。
- 數字：hist_bc 0.927、conform 0.933；npm test 10/10；proc={}；手機/桌機 30fps。

## 2026-10-03 晚：陰影、戰鬥動畫、村民風格（commit 4959b8d、f6ef8a3、6d7b91e 之後）

- **陰影**：光從右上（概念圖），`shadowFor()` 把每個圖的剪影往左下投影（人物/樹/旗＝整張一個地面；建築/圍籬＝每欄地面），
  全部畫進 `shadowLayer` 再一次壓上地面（重疊不疊黑），物件畫在 `spriteLayer`。g 是「目前那一層」。拿掉建築腳下大橢圓。
- **戰鬥**：模擬只記 `atkAt/hitAt/atkX/hitFromX`，`combatPose()` 算蓄力→出手→受擊；`heropose` 圖集（strike/windup/hurt，
  `make_combat_art.py heropose`）、`monsteratk`（slime2…boss2）。特效時間軸：effect.delay 秒後才命中（箭/法球在飛）。
  清晰度：目標紅圈、血條/名牌延後到最上層（`overlays`）、被擋住的戰鬥中英雄半透明重畫、每位獵人最多兩隻近身、魔物不上橋、站位分散。
- **村民**：`villagers-sheet-v2`（英雄表當參考圖重生），跟英雄同像素密度（`make_combat_art.py villagers`）。
- **地圖**：戰鬥空地 rz 6→7.5；`stream` 圖集（石墩木橋 z=18、瀑布、苔石岸、釣魚人）；草原補花叢/灌木；河岸平滑。
- 數字：hist_bc 0.920→0.927、conform 0.929→0.932（上限 0.936）；npm test 全過；`proc={}`；手機/桌機 30fps 無錯誤。
- 驗戰鬥：`globalThis.__mistvaleGame`（新 hook）＋鏡頭對準戰鬥者質心連拍。


接手先讀這頁，細節在 [`align.md`](align.md)（量測與做法）、[`l0veyou.md`](l0veyou.md)（生圖管線）。

## 目前狀態

- 分支 `main`，本機比 `origin/main` 多 **7 個 commit，還沒 push**（push 到 main = 自動部署 GitHub Pages，要先問使用者）：
  `c0017bd` 構圖/地面/樹/道具/角色 → `9ee15f5` 六棟建築重生 → `20cb071` Q 版獵人 → `552b8e1` 紫屋頂/酒館/陰影
  → `312d0fd` 土路色調 → `03064c7` 文件 → 本頁與 generate.mjs。
- 線上版（Pages）還是 `7544514`（l0veyou 素材圖集）。
- 驗證全過：`npm test` 10/10、`check_atlases.py` 25/25、`check_embedded_assets.mjs` 13/13、
  8 區 × 3 縮放 `proc={}`、手機 390×844 無錯誤 30fps。建置 34.0 MB（原 31.1）。
- 未追蹤：`output/l0veyou/test-sheet-v1.jpg`、`v2.jpg`（被碰邊檢查擋下的測試圖），使用者還沒決定留或刪，**不要 commit**。

## 使用者的要求（不要改回去）

- 目標：全部美術以 `assets/title.png` 為基準對齊，目標 100%。**1.0 做不到**（概念圖是手繪構圖），要用數字回報、講清楚差在哪。
- **人物、怪物維持原本大小**（`CHAR_SCALE=1`：獵人 21、魔物 28–33、首領 50）。不要為了概念圖比例縮小。
- 從手機 App 遠端操作時不要用選擇題 UI，用純文字問。

## 數字（同構圖，`pipeline/scripts/align/capture.mjs` + `metrics.py`）

| | 開始前 | 現在 | 概念圖 |
|---|---|---|---|
| hist_bc | 0.836 | 0.920 | 1.0 |
| conform（48 色票） | 0.921 | 0.929 | 0.936（上限） |
| 色群差 group_l1 | 0.321 | 0.220 | 0 |
| 亮度 | 113.5 | 107.1 | 101.6 |
| 土色比例 / 暗部 | 33% / 10% | 39.7% / 14.7% | 30.3% / 18.5% |

`verify_all_regions`（1440×900，線上舊版 → 現在）：村莊 0.877/0.777/0.790 → 0.887/0.791/0.807，其他區持平或更好。

## 還沒對齊的（建議下一步，依效益排序）

1. **土色太多、暗部太少**：概念圖地面上壓滿角色、道具、陰影。可再加角色/道具密度，或在建築、道具腳下加概念圖那種貼地暗影。
   用 `metrics.py` 的色群比例與分塊差異圖（見 align.md 的做法）找位置。
2. **概念圖下方中央的石橋、右下瀑布、釣魚人**還沒做（概念圖 (690–860,1100–1254)、(1170,1060)、(1050,1180)）。
3. **獵人小屋**被村莊東邊界（x ≤ 8，柵欄 x=9）卡住，比概念圖偏左上；放大成畫寬 100 補償。要再對齊得動邊界／柵欄（會影響道路測試）。
4. 材質（`concept-*.png`）是 48px 樣本拼的，近看有規則感；可改大樣本或換合成方法（`concept_textures.py`）。
5. 村民（l0veyou villagers）與新獵人風格接近但不是同一批生的；需要的話用 `heroes-ref.png` 當參考重生村民。

## 環境與工具（不在 repo 的東西）

- **l0veyou 生圖**：專用瀏覽器設定檔 `work/.l0veyou-profile`（已登入，在 repo 外）。啟動（**用 chromium-1243**，見上面「啟動生圖瀏覽器的坑」）：
  `"%LOCALAPPDATA%/ms-playwright/chromium-1243/chrome-win64/chrome.exe" --remote-debugging-port=9447 --user-data-dir="<work>/.l0veyou-profile" https://l0veyou.com/chat`
  （9333 被別的程式佔用；舊文件寫的 `chromium-1217` 未驗證，`chromium-1181` 確認會崩。）登入失效就請使用者在那個視窗登入，不要要密碼。
- 生圖：`[REF=參考圖] node pipeline/scripts/l0veyou/generate.mjs prompt.txt output/l0veyou/<名>-v1.png "" 16:9`
- 處理：物件表 `sheet_to_atlas.py`（有碰邊檢查）、單棟建築 `align/make_building.py`、獵人 `align/make_heroes.py`。
  **紫色主體**一律 `NO_SHADOW=1 NO_HOLES=1 HUE_TOL=12`。
- Playwright：全域安裝（`npm root -g`），腳本會自動找。

## 踩過的坑

- 改建築預設位置要把舊預設加進 `ART_LAYOUT_HISTORY`（存檔遷移），並跑 `npm test`：酒館移到 (-3.5,20.4) 會讓 test-landscape 道路使用率不及格 → 改用 `SPRITE_SHIFT`（只移圖、不動佔地）。
- 新圖集 cell id 不能跟既有圖集撞名（icons 有 `anvil`，所以道具叫 `anvilStump`）——detailLod 共用。
- 上傳參考圖後，頁面上的參考圖縮圖會被誤認成結果；generate.mjs 已排除 `data:` 網址。
- 道具擺放要檢查「看得到」：x+z 小於後畫建築就會被蓋住、名牌畫在最上層（l0veyou.md 有說明）。
