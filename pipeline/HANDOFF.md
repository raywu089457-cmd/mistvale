## 2026-10-27：世界繪製 WebGL2 階段 0+1（`?renderer=gl`，預設仍是 2D）

- `src/gl-renderer.js`：實例化四邊形批次器（矩陣/uv/預乘色/閃色，一次 16 張材質、依呼叫順序切批次；材質延遲上傳、預乘、NEAREST、
  超過 MAX_TEXTURE_SIZE 自動切塊、閒置 90 幀以上且總量超過預算才回收）＋「長得像 CanvasRenderingContext2D 的轉接物件」
  （drawImage 3/5/9、fillRect（純色/pattern）、路徑 fill/stroke/虛線近似、變形、save/restore；不支援的呼叫計數在 `__mistvaleGL().unsupported`）。
- `pixel-world.js`：網址 `?renderer=gl` 才開。原畫布底下墊 WebGL 畫布，原畫布照舊收事件、改透明只畫文字；GL 模式不走靜止快取/髒矩形/comp，
  每幀：地面（海＋ocean pattern、地面/村莊大畫布切塊）→ 影子 FBO ×.56 → 物件（同一個 `all` 順序、同一批 draw 函式）→ 殘影/覆蓋層/特效/粒子 → 文字。
  context 遺失自動退回 2D、恢復後接回。2D 路徑不變。
- 驗收：`node pipeline/scripts/check/gl_compare.mjs`（8 場景 2d/gl 截圖＋差異圖＋每幀時間，輸出 `output/gl-compare/`，不進 git）。
- check_facing / check_anim 啟動加 `--allow-file-access-from-files`（10-27 起大圖是 media/ 外部檔，file:// 開會污染畫布），`RENDERER=gl` 可指定繪製器。
- 已知：GL 材質約 250–400 MB（地面畫布整張上傳）；無頭 SwiftShader 下 GL 一幀 120–180 ms（JS 只 1–2 ms），真機要另量。

---

## 2026-10-22（二）：sprite-gen 的影片路徑 → PixelLab 動畫 API

sprite-gen 的動畫是「一張 still → Grok Imagine video → 逐格拆圖 → keying → rows」。PixelLab 沒有影片模型，
但**不需要**：`POST /v2/characters/animations`（mode `v3`）直接對帳號裡的角色生動畫，回傳的就是**每個方向的幀**。

新增 `sprite_gen/gen/pixellab_animation.py`（副本在 `pipeline/scripts/pixellab/sprite-gen/`），產出**與影片路徑相同形狀**的交付物，
所以後面的 curation / alpha / atlas 匯出不用改：

```
<out-dir>/<direction>/00.png … NN.png     每個方向一個資料夾
<out-dir>/pixellab-animation.json         方向、幀數、action、animation_type、角色 id、計費說明
```

- 計費：`ceil(size²·frames/65536)` **每方向**（128px·8f = 2、256px·8f = 8）；送出前在 stderr 印出總格數
- `--dry-run`：只印計畫與計費，完全不呼叫 API（已驗證：5 方向 × 8 幀 @128px = 10 格）
- 8 方向名稱驗證（`south`…`south-west`），左邊三個方向由遊戲/管線鏡像
- 動作白名單：walking / walk / attack / skill / idle / death / hurt / victory / run / jump
- 30 分鐘逾時、429 明確報錯（PixelLab 同帳號一次只能跑一個生成）

**還沒做**：真的生一次動畫（會花額度）。`--dry-run` 已驗證 wiring；要實跑就：
`python -m sprite_gen.gen.pixellab_animation --character <id> --action walking --out-dir runs/walk`

---

## 2026-10-22：sprite-gen（aldegad/sprite-gen）付費 provider → PixelLab adapter

使用者問「sprite-gen 的付費資源能不能用 PixelLab / l0veyou 取代」。查完的結論：

| sprite-gen 的付費來源 | 用途 | 替代 |
|---|---|---|
| `codex`（ChatGPT 訂閱 OAuth `image_gen`） | 生圖（原生 alpha） | ✅ PixelLab `create-character-v3`（原生 alpha） |
| `grok`（SuperGrok Imagine，JPEG 靠 chroma 去背） | 生圖 | ✅ PixelLab（更好，直接 alpha）；l0veyou（GPT Image 2）補單張 |
| `openai`（`OPENAI_API_KEY` 逐次計費） | 生圖 | ✅ PixelLab（按 generation 計費） |
| **Grok Imagine video**（影片→拆幀做走路/攻擊） | 動畫 | ⚠️ PixelLab 沒有影片模型，但不需要：`/v2/characters/animations`（mode v3）直接生 8 方向動畫 |
| `pixel-draw`（Claude Code 訂閱） | 像素級修圖 | ⚠️ 部分：PixelLab `inpaint`/`rotate`/`estimate-skeleton`；其餘是 sprite-gen 本機後處理 |
| `sound`（`ELEVENLABS_API_KEY`） | 音效 | ❌ 兩者都沒有 |

**已實作**：`sprite_gen/gen/pixellab_provider.py`（副本存在 `pipeline/scripts/pixellab/sprite-gen/`）
- 實作 sprite-gen 的 `Provider` 協定（`name` / `transparency` / `generate` / `inspect_facing` / `inspect_image`）
- `transparency = native`（PixelLab 直接回透明 PNG，不用 chroma key）
- 流程：`POST /v2/create-character-v3` → 等 `background_job_ids` → `GET /v2/characters/{id}` →
  下載 south 到 `request.raw`，其餘 7 個方向存成 `<stem>.<direction>.png` 並列在 `ProviderRun.extra["directions"]`
  （sprite-gen 的 row 管線要同一角色的所有視角，重生一次要再花一次額度）
- `--ref` → 第一個參考圖當 `reference_image`
- `--quality` 只接受 `auto|high`、`--resolution` 直接拒絕（**拒絕而不是默默降級**，符合它 repo 的 No Silent Fallback）
- 沒有 vision 模型 → `inspect_facing` / `inspect_image` 直接報錯並提示改用 codex/grok
- 已註冊：`PROVIDERS = ("codex","grok","openai","pixellab")` 與 `_make_provider()`

**還沒做**：① 端到端生圖測試（會花額度，且要先把 repo 裝起來跑 CLI）② l0veyou 沒有 API，
只能做成「瀏覽器 shuttle」而不是 `gen` provider ③ 影片管線沒有替代（改用 PixelLab 動畫 API）。

---

## 2026-10-21：建築碰撞縮到「地基邊緣」

`src/landscape-layout.js` 的 `SOLID`（建築實心範圍，導航與碰撞共用）從 **6.0 × 4.6** 改成 **4.6 × 3.8**
（`{x:2.3,z:1.9}`）：建築統一畫成 7.33 單位寬（含屋簷外伸），地基約 0.63 倍寬、0.52 倍深，所以碰撞框
現在剛好貼在石造地基邊緣，不再包含屋簷外伸的部分。

- 下限是建築自己的佔地（4.0 × 3.5）：第一次試 4.4 × 3.45（z 1.72）時 `test-pixel-game` 馬上抓到
  「獵人穿進酒館佔地」，所以 z 取 1.9 保留一點餘裕。
- 驗收：把碰撞框畫在畫面上（紅框）目視 → 全部貼在地基邊緣；`npm test` 全過（村內尋路、獵人不穿牆、
  門口連通、獵人 100% 踩鋪面）。

---

## 2026-10-22：聖騎士攻擊拆成「身體＋劍零件」— 東、西、上、下 4 列已完成（斜角 4 列仍舊圖）

**北向（`attackUp`）最新：新管線，只用北向待機當起始參考**（`paladin-anchor-lab/sg_run/integrate_pl_north.py --write`）：
l0veyou GPT Image 2（唯一參考＝PixelLab rotation-north，提示詞 `sg_run/north/run/prompts/attack.l0v.txt`，強調嚴格背面）6 格 3×2
→ sprite-gen cutout、分格 → 256 畫布（比例 2.417、腳點對待機）→ PixelLab estimate-skeleton → animate-with-skeleton-v3（第一格＝rotation-north）。
PixelLab 畫不出「背面、右手跨身往左劈」的下劈/命中兩格（試 3 輪 ~10 gen：轉側面、正面露臉、殘影、劍位錯；頭部關節照待機背面那組也沒用），
→ 這兩格改用 GPT 格、色盤鎖到 PixelLab 幀（`build_shared_palette`/`apply_palette` 96 色）。各格：`[待機, PL, PL, PL, GPT, GPT, GPT, PL, 待機]`。
劍畫在身上 → `paladin-sword` 拿掉 attackUp；`paladin-smear` attackUp＝l0veyou 刀光（劍尖 (177,148)→(95,290)、往左上外凸 50）。
北向共花約 14.6 gen（token2）。改前素材 `paladin-anchor-lab/backup/pre_north_sg/`。驗收：`npm test` 11 PASS、實機連拍 attackUp 3→8。
**PixelLab 骨架的弱點**：背面＋手臂被身體擋住的姿勢、估出的臉部關節（耳低於眼→判成正面）都會讓它轉身；正面/側面的大動作沒這問題。

**南向（`attackDown`）最新（2026-10-23）：改用使用者給的 3×3 套圖**（`paladin-anchor-lab/sg_run/integrate_user_south.py --write`）：
來源 `sg_run/user_south/input_grid.png`（768²＝9 格 PixelLab 256 畫布、真像素、透明底、刀光畫在第 5、6 格）。
sprite-gen 素材處理：`unpack-atlas --grid 3x3` → 每格用 `connected_components` 拿掉右上角多出來的盾牌圖示（每格同一塊 36×42、不相連）→ `compose-atlas`（`run/sprite-sheet-alpha.png`＋`manifest.json` frame_layout）→ 照 manifest 讀 9 格、等比縮放（身體高 125/63）、腳點貼齊。
劈下時劍尖往鏡頭方向伸到腳下約 50 px，全域 `footFromBottom` 16 會切掉 → **這列自帶 `footFromBottom`（@2x 55、1x 30）**，引擎 `sheetFrame` 改成 `a.footFromBottom ?? meta.footFromBottom`（其他列不受影響）。
刀光已在身上 → `paladin-smear` 拿掉 attackDown。改前素材 `sg_run/user_south/backup_before/`。驗收：`npm test` 11 PASS、實機連拍（`capture_seq.mjs` 加 `FAR=-1`＝魔物移到背後，不擋鏡頭）腳點/劍尖都正常。

**南向（上一版）：sprite-gen 設計動作 → PixelLab 成圖**（`paladin-anchor-lab/sg_run/integrate_pl_south.py --write`）：
分工＝GPT（l0veyou，經 sprite-gen 流程）負責動作設計；PixelLab 負責最後成圖（畫風/色盤/細節跟 PixelLab 做的待機、走路一致）。
做法：目前南向 8 格（sprite-gen 跳斬）放進 256 畫布、腳點對到 PixelLab 待機 → `estimate-skeleton`（8×0.1 gen）
→ `animate-with-skeleton-v3`（第一格＝`output/pixellab/paladin-rot-256/rotation-south.png`，動作詞 "jump slash with a longsword"、描述含長劍 → 劍由 PixelLab 畫）
兩個 seed（各 3 gen）逐格挑：`[待機, s21#1, s7#2, s21#3–7, 待機]`（s7 第 3 格有殘影、第 4 格劍淡掉）。整張 256 等比縮放（0.9766/0.4922）、腳點 (cell/2, cell−F−1)。
刀光沿用 `paladin-smear` attackDown。共花 6.8 gen（token2）。驗收：`npm test` 11 PASS、實機連拍 attackDown 2→8。
取捨：畫風一致度最好；但披風甩幅、劍長比 GPT 版保守。上一版（GPT 成圖）素材備份 `paladin-anchor-lab/backup/sg3/`。

**東向（`attack`）現行：sprite-gen 流程重新生成（不參考舊攻擊素材）**（`paladin-anchor-lab/sg_run/integrate_east_sg.py --write`）：
l0veyou GPT Image 2，單張參考＝東向待機圖（PixelLab rotation-east，洋紅底 2 倍），提示詞 `sg_run/east/run/prompts/attack.l0v2.txt`
（嚴格側面、6 格 3×2：待機→舉劍往後→劍水平拉到背後蓄力→弓步下劈→最深弓步劍前伸→收）。第一次生成第 2–5 格轉成 3/4 正面，
加「strict profile」重生後採用 v2。→ sprite-gen cutout → 連通塊分 6 格 → `grid_snap_downscale`（身體高 125/63、64 色）
→ 腳底（寬度≥5 的最下列）貼 y=303、後腳跟固定在待機位置（弓步身體真的往前）；6 對 9 `[0,1,2,2,3,4,4,5,0]`。
劍畫在身上 → `paladin-sword` 拿掉 `attack`（該列清空）；`paladin-smear` 的 `attack` 改放 l0veyou 像素刀光（兩端對劍尖 (88,212)→(262,303)、過頂外凸 80）。
`integrate_dirs.py --write` 已加保護（會把東/南蓋回舊版，要 `--force`）。改前素材備份 `paladin-anchor-lab/backup/pre_east_sg/`。驗收：`npm test` 11 PASS、實機連拍 attack 2→8。
西向（attackLeft）、北向（attackUp）仍是「模仿 AI＋劍零件」版。

**南向（`attackDown`）現行：動作照「原本 AI 南向跳斬」、sprite-gen 流程重畫**（`paladin-anchor-lab/sg_run/integrate_sg3.py --write`）：
l0veyou GPT Image 2，單張參考＝原本 AI 那排第 0–7 格（2 倍、4×2、洋紅底，`run3/motion_ref_4x2.png`），提示詞 `run3/prompts/attack.l0v1.txt`
（逐格照抄姿勢/跳高/劍角/披風，拿掉白色刀弧）→ sprite-gen cutout → 依連通塊分 8 格 → `grid_snap_downscale` 縮到身體高 125/63＋64 色調色盤
→ 每格對齊原本 AI 同一格（alpha 重疊最大，IoU 0.70–0.83），站著的第 0–3 格腳底貼 y=303、其餘套同一偏差（跳高保留）；8 格對 9 格 `[0..7,0]`。
刀光：l0veyou 像素刀光，兩端/外凸量自原本第 4 格的白色刀弧，放第 4/5/6 格（`paladin-smear` attackDown）。劍零件仍不畫南向。
上一版（sprite-gen 自創 6 格動作）素材備份 `backup/sg2/`。生圖用 `pl/gen_l0v2.mjs`（雷見 lab README）。驗收：`npm test` 11 PASS、實機連拍 3→8。

**南向上上版：sprite-gen 流程整隻角色（含劍、自創動作）**（`paladin-anchor-lab/sg_run/`）：
sprite-gen（`Desktop/Claude code/_ext/sprite-gen`）`prepare` 產生提示詞＋6 格版面 → 用 l0veyou GPT Image 2 生（`pl/gen_l0v.mjs`，自己開分頁、
開「多参考图」附 2 張參考：洋紅底的南向待機圖＋版面；sprite-gen 原版提示詞 6000 多字送不出去，用濃縮版 `run1/prompts/attack.short.txt`）
→ `sprite-gen extract`（512 格原尺寸、foot-centroid、腳底對齊）→ `sg_run/integrate_sg.py --write`：sprite-gen 的 `grid_snap_downscale`
一次縮到身體高 125/63＋64 色共用調色盤，6 格對 9 格 `[0,1,2,2,3,4,4,4,5]`。劍畫在身上 → `paladin-sword`/`paladin-smear` 拿掉 `attackDown`
（引擎零件層沒有該列就不畫）；`integrate_dirs.py` 已不再處理南向。刀光：`paladin-smear` 的 `attackDown` 改放 l0veyou 生的像素刀光（`sg_test/fx_slash1-3.png`，cutout＋還原真像素），新月兩尖端對到蓄力格/斜劈格的劍尖、外凸壓到 30px，放在第 4（整條）/5（裂開）/6（碎片）格。
3D 自己 K 版的素材備份在 `paladin-anchor-lab/backup/s3d/`。驗收：`npm test` 11 PASS、實機連拍 attackDown 3→8。

**南向上一版：不參考 AI，3D 骨架自己 K**（`paladin-anchor-lab/south3d.py`）：在 3D 擺 18 關節（X 右、Y 上、Z 往鏡頭），
用遊戲鏡頭（low top-down，仰角約 30°）投影成 skeleton-v3 的 2D 骨架，正面的扭腰、往鏡頭踏步、手臂前伸都會自然前縮，不會折膝。
揮法：右手斜劈——蓄力時重心移到後腳、扭腰把右肩往後拉、上身後仰、劍高舉在右肩上方、盾往前護身 → 放招時右腳往前踏、重心下沉、
腰先轉肩後到、手臂伸直，劍從頭側往前下劈到身體正前（命中＝右肩→手→劍尖一條對角線指向右下）→ 過衝帶到左腰 → 收。
劍的 3D 方向投影出螢幕角度＋前縮比例（`slash_grip.json` 的 `fore`，`swordfx.Sword.render(..., fore)`）；殘影照手＋劍在 3D 內插的實際軌跡畫
（`sweep`，`swordfx.smear_path`：新月形、前緣實、拖尾淡、刀口亮線）。身體 `sk/south/out_h1`（seed 7）→ `deplume.py` 擦掉模型多長的紅羽飾
（正面待機/走路沒有羽飾，攻擊格突然冒出會跳）→ `out_h1c`。花費 6 gen（兩個 seed 各 3，seed 21 會自己畫劍＋殘影不採用）。
只動 `attackDown` 列與兩張零件表的第 4 列（其他列逐像素比對沒變）；上一版（模仿 AI）的素材備份在 `paladin-anchor-lab/backup/r2/`。
驗收：`npm test` 全過；`capture_seq.mjs`（`PLACE=1` 把魔物擺到要測的方向——遊戲是斜角座標，正下＝(+0.8,+0.8)）實機連拍確認走 `attackDown` 2→8 格。

**上一版（動作＝模仿原本 AI 生成的攻擊；東、西、上仍是這版）**：4 列的身體動作是「參考動作重定向」——從改動前遊戲裡的 AI 攻擊列
（`paladin-anchor-lab/backup/paladin@2x`）每格 estimate 骨架（`ref_skel.py`）＋人工讀劍角（`ref_sword.py`，`sk/ref/<dir>/sword_fix.json`），
`ref_retarget.py <dir>` 做相對重定向（根位移／上身轉角／每根骨頭相對第 0 格的轉角，加到我們的待機骨架；肩寬髖寬保留＝面向不跟著參考轉；
參考離地時我們也離地），再 skeleton-v3 生空手身體（`sk/<dir>/out_r`）、`integrate_dirs.py --write` 掛劍＋掃掠殘影（`swordfx.smear_sweep`）。
西向參考本身壞（中途轉身往右刺）→ 用東向鏡像。遮擋：西 1–3、上 5–6。轉超過 180° 的劍角方向依參考刀光人工定（北越頂、南右側下劈）。
節奏：列上新增 `strikeDur`（出手後 5 格秒數 35/90/75/85/90 ms，總長不變）與 `windupPow 0.6`（早到最大蓄力並停住）；
`pixel-world.js` sheetPose 支援這兩個欄位，沒有的列行為不變。這輪花費 3.6（estimate 36 格）＋12（生成）gen。
**修正（同日）**：
- 重定向改成「末端對齊」（`ref_retarget.py` MODE='ik'）：手、腳位置照參考（相對髖/絕對的變化量），手肘膝蓋用 IK、往參考那側彎，
  肩/髖也帶入參考的扭轉。舊的「每根骨頭轉角」會丟掉軀幹扭轉，出劍手掉在髖後面（看起來像拖著劍）。北向腳與根位移只取 35%（背面踏步會被畫成蹲馬步）。
  身體在 `sk/<dir>/out_r2`。
- 引擎兩個 bug（`pixel-world.js`）：① `leftRow` 把「正上/正下 + 面向左」接成 `attackUpLeft/DownLeft`（斜角舊圖）→ 正上/正下改成鏡像；
  ② 新增列旗標 `bakedMotion`：素材已有真弓步的列不再疊 `MOTION` 的假前衝與切身體（原本會整個人衝進怪物裡）。
- 驗收：`capture_seq.mjs`（遊戲 0.15 倍速、只留聖騎士與一隻怪、連拍）＋ `npm test` 11 PASS。

（再上一版「依動畫原則手 K 的力量版」留在 `sk/<dir>/out_p`、骨架備份 `v3bak/`；更早的版本在 `v2bak/`。）

以下是更早的狀態：`attack`／`attackLeft`／`attackUp`／`attackDown` 都是「手 K 骨架 → skeleton-v3 空手身體＋劍零件＋殘影」。
一次重建 4 列：`paladin-anchor-lab/integrate_dirs.py --write`（取代 integrate_east.py）。零件表 `paladin-sword`／`paladin-smear` 改成 4 列
（y = 0/cell/2cell/3cell，依上面順序）。各方向骨架與握把：`sk/`（東）、`sk/west|north|south/`（`slash_pose.py <dir>` 產生）。
劍在身體後面的格（西全部、上 4–6、下 3）在零件表裡已用身體輪廓挖掉，引擎不用分前後。
西/上/下這輪花費：estimate 0.1×3 ＋ 生成 3×3 = 9.3 gen（token2）。驗收：`npm test` 11 PASS；實機抓到西向弓步突刺、動作實驗室確認上/下有劍與殘影。
**調整（同日）**：上/下改成「橫掃」——`sweep_pose.py south|north`，手臂用「手腕目標＋兩骨 IK」（不是直接給角度）；
正面：劍拉到右肩後上方 → 在身體前方由右髖掃過腹前到左側（劍尖朝鏡頭時直直往下）；背面：鏡像，劍越過頭頂（被頭擋住只露上段）掃到左。
遮擋改成：西只有第 3 格（劍在頭後）、上 4–5 格、下無（原本西「全部遮」會讓劍柄跟手分家）。重生上/下 6 gen。舊版留在 `sk/<dir>/*.v1.*`、`out.v1/`。
斜角 4 列（attackDownRight/UpRight/DownLeft/UpLeft）還是舊的整張圖（有角頭盔），零件表沒有這些列 → 引擎自動不畫劍零件。

（以下是過程紀錄）

做法（「標記色劍」）：在 256 待機圖把劍塗成洋紅劍身／青護手 → PixelLab 匯入新角色
`443a1503-e208-455d-89f0-5e9a35049061`（token2，0.25 gen）→ v3 生成東向 6 格（6 gen）→
從標記色抽握把/角度、挖掉得到空手身體（補洞、去殘影），再把原本的劍按握把逐格旋轉成零件。
工具與中間檔在 `Desktop/Claude code/paladin-anchor-lab/`（`marker_extract.py`、`integrate_east.py`，README 有說明）。

**改了什麼**
- `assets/heroes/paladin(.png/@2x)`：`attack` 列（東向）換成空手身體，7 張生成格 → 9 格 `[0,1,2,2,3,4,4,5,6]`
  （release 4 = 往前揮、impact 5 = 劍到最低）；身體高 63 / 125、腳點 (cell/2, cell−footFromBottom−1)；`head` 重算。
  `meta.parts = [{id:'sword', sheet:'paladin-sword'}]`。
- 新增 `assets/heroes/paladin-sword(.png/@2x)`（`kind:'part'`，只有 `attack` 一列、offset 全 0，跟身體同格位）。
- `src/pixel-world.js` 零件層：身體用 @2x 時零件也用 @2x；零件跟著 `MOTION` 的上半身 ux/uy 位移（不然劍會離手）；
  動作實驗室預覽也畫零件。

**揮砍改成手 K 劍（同日稍後）**：生成的身體動作太小，劍只是晃一下。改成業界做法——劍是手的子物件，
握把位置用標記色量到的真實手位，角度逐格手 K：`KEY_ANGLES = [32.6,-60,-110,-165,-70,0,50,75,32.6]`
（守勢→舉起→拉到頭後→越頂→命中水平前指→下切→收），`integrate_east.py --keyed --write` 產生；第 1 格模型多畫的棕色劍柄已擦掉。
試過用「弓步＋大弧」重新生成（8 gen）失敗：角色轉向、劍往後揮、洋紅劍身幾乎消失、青色跑到盾牌上 → 動作大時標記色撐不住，不採用。

**揮砍打磨（同日再稍後）**：劍改用 RotSprite（Scale2x×3 → 旋轉 → 取樣，`paladin-anchor-lab/swordfx.py`），1x 直接在 1x 尺寸旋轉；
新增零件 `paladin-smear(@2x)`（揮砍殘影新月，格 4/5/6，`shadow:false`），`meta.parts = [smear, sword]`；
`pixel-world.js` 零件層加投影（`part.shadow!==false` 才 `cast`）。`npm test` 11 PASS；實機 1x/@2x 截圖確認殘影、劍、影子。

**全身揮砍（目前版本）**：身體改用「手 K 骨架 → PixelLab `animate-with-skeleton-v3`」生成 9 格空手揮砍
（`paladin-anchor-lab/slash_pose.py` 定 18 關節姿勢：舉起→過頭→拉後→踏步越頂→弓步前伸→下切→收；`skel.py animate`）。
3 gen/9 格，面向全程不漂、空手、拳頭剛好在骨架手腕上 → 劍直接掛在手腕（`sk/slash_grip.json`），角度＝同一份手 K。
`integrate_east.py --keyed --skel --write`。注意：action 寫 "sword slash" 時模型會自己畫一把劍 → 改成 "lunge attack with an empty fist"。

**已知**
- 其他 7 個攻擊方向仍是舊的整張圖（有角頭盔）；東向這列是紅羽頭盔（跟待機/走路一致）。補齊要約 42 gen。
- 劍零件沒有投影（`cast` 只畫身體）。
- 換武器＝換 `paladin-sword` 表，錨點不用動。

**驗收**：`npm test` 全過；實機抓 h3 出手 1x/@2x 各 4 格，劍都在手上；`check_facing` 40 秒 heroWalkBad 0、heroAnimBad 0；
heroCombatBad 16 是訪客 w10–w13 的既有問題（改動前同條件 14）。

---

## 2026-10-21：角色與建築的互動點改到「門口正前方」（含補血等服務）

問題：`door(buildingId, from)` 會從 **4 個候選點**（門口 `doorStand`、+x、−x、**−z 建築背面**）裡挑「走路最短」的，
所以獵人常常從後面繞到屋子背面就開始用設施（補血、吃東西、住宿都在背面）。

修正（`src/pixel-game.js` 的 `door()`）：
- **候選點只剩 3 個**：門口正前方（`doorStand` = 正面 +z 面台階外緣）、+x 側、−x 側；**背面 -z 整個移除**。
- 側面兩點加 **9 單位懲罰**，所以只有在門口被擋住、或要多繞很遠時才會退到側面。
- 沒有任何可用點時才退回 `safePoint`。

實測「診所門口」：獵人站在正面台階前（截圖確認，紅十字招牌左側的雙開門 + 階梯前）。

---

## 2026-10-22：AI 獵人／流浪英雄也加「出手後短僵直」

背景：手動操控的「攻擊 CD 0.5 秒 + 出手後 0.65 秒不能走」只作用在玩家那一隻；AI（自動狩獵的獵人與野外流浪英雄）
本來就進到攻擊距離後站著打，但打完的下一幀就可能立刻走開（目標死掉或跑掉時），看起來像「收招沒收完就走了」。

**做法**
- `src/pixel-data.js`：新增 `AI_ATTACK_LOCK = 0.15`（秒）。
- `src/pixel-game.js`
  - 獵人出手（`attackTimer === 0` 那一段）與流浪英雄出手都加 `h.lockUntil = state.time + AI_ATTACK_LOCK`。
  - `walk(h, dt)` 最前面加 `if (state.time < (h.lockUntil ?? 0)) return;` → 僵直期間站著收招不移動。
  - **沒有加攻擊 CD**：下一擊仍然照原本的 `attackTimer`（1.1～1.65 秒）走，DPS 不變。
- 手動操控不受影響：被操控的獵人跳過 AI（`task === 'pilot'` 直接 continue），僵直用的是 `pilot.lockUntil`。

**驗收**
- node：拉遠離狩獵區的 AI 獵人會往前走 → 手動把 `lockUntil` 設成 +5 秒後 0.6 秒內位置完全不動 → 解鎖後繼續走 ✓
- 60 秒自然模擬擊殺數不變（77，與改動前一致 → 確認沒有誤加 CD）；`npm test` 11 項全過
- `check_anim` 40 秒：閃格 0、走路跳格 0；`check_facing` 40 秒：走路 5404、`heroWalkBad 0`、`heroAnimBad 0`、敵人全 0、隊伍戰鬥 0 錯

---

## 2026-10-22：手動操控的面向 —— 只在「真的走動」時轉，攻擊後的僵直維持原面向

需求：攻擊完後的站立面向要維持攻擊前的面向（僵直），之後要轉向、走路才轉。

**舊行為的問題**：`pilotStep` 每一幀都拿搖桿當面向（`faceX/faceZ = dx,dz`），所以只要手指推著另一個方向，
下一次空揮就瞬间轉過去 —— 人根本沒走、卻已經面朝那邊，攻擊後的站立也停在那個方向。

**做法**（`src/pixel-game.js`）
- `pilot.faceX/faceZ` 改成「**最後一次真的走動**的方向」：只在移動區塊真的移位後才更新（擠牆完全走不動就不轉）。
- 空揮的朝向用這個面向（`h.atkX = h.x + faceX`）；3.2 格內有魔物時仍然朝魔物（打得到才重要）。
- 僵直期間本来就 `return` 跳過位移，現在連面向也不會被摇桿拖走；鏡頭那側的 `vdir` 只在真的位移時重算，
  所以僵直中一律畫 `idle` + 攻擊方向的列（不會偷轉）。
- `pilotState()` 多回 `faceX/faceZ/atkAt/atkX/atkZ`（驗收用）。
- UI 提示改成「出手後僵直不能走，面向維持到走動才轉」。

**驗收（node）**：往東走 → 把摇桿推到西邊再出手 → `atkX > x`（空揮朝東）、僵直中 `faceX` 維持 > 0.9、
位置完全不動、僵直結束後 `faceX < -0.5` 且真的往西走。

**驗收（headless 實機）**：走右 → 瞬間把摇桿推左並出手，60fps 連採：
`aim = (0.71,-0.71)`（= 攻擊前的面向）、`act: attack → idle` 全程 `vdir: side, f: 1`、位置 (6.67,29.33) 不動；
僵直結束後（~0.69 s）才變成 `walkDown` 並真的位移。

`npm test` 11 項全過；`check_facing` 40 秒：走路 4762、`heroWalkBad 0`、`heroAnimBad 0`、敵人全 0、隊伍戰鬥 0 錯。

---

## 2026-10-22：聖騎士「每個動作身體大小要統一」

問題：同一位英雄的 8 個攻擊方向是 PixelLab 各自生成的，角色在來源圖裡大小不一 —— 舊的 5 列就已經差 ±12%，
上一輪新增的三個左向列又用錯縮放（把 `cell/256`=0.625 當成藝術倍率，實際表是 0.5），所以左向比 idle **大 24%**（78 px vs 63 px）。

**做法**（`pipeline/scripts/pixellab/add_attack_dirs8.py --rebuild --write`）
- 量「身體高」：腳底最低點 → 以腳為中線 ±14% 欄位裡最上面的像素（避開劍光弧、披風，所以不同姿勢比得上）。
- 以 `idle` 的身體高為基準（1x 63 px、@2x 125 px），逐列迭代回推縮放（`s ← s × 目標/量到`，最多 5 次，取最接近的一次）。
- **位置不動、只改大小**：每格的地面接觸點（腳底 6 列的重心 x）與地面線都沿用現在的值；只有太大/太小才重貼。
- 大劍光弧的第 4、5 格會貼到 cell 邊界 → 在錨點 ±8 px 內往格內微調，不要切弧光（重貼後 `audit_hero_sheet` 已無 attack 列的 edge 警告）。
- `meta.actions[act].artScale` 現在記的是**絕對倍率**（來源 256 格 → 表上幾個像素：1x 0.441～0.539、@2x 0.881～1.070）。

**結果（1x / @2x 身體高）**

| 列 | 修正前 | 修正後 |
|---|---|---|
| attack | 65 / 130 | **63 / 125** |
| attackDownRight | 56 / 114 | **63 / 125** |
| attackDown | 71 / 142 | **63 / 124** |
| attackDownLeft | 78 / 157 | **63 / 125** |
| attackLeft | 78 / 158 | **63 / 125** |
| attackUpLeft | 76 / 152 | **64 / 125** |
| attackUp | 66 / 133 | **63 / 126** |
| attackUpRight | 67 / 133 | **63 / 126** |

剩下不在攻擊列的部分:同一輪也把 `walk`、`walkDown`、`walkUp`、`skill`、`idleDown`、`idleUp` 拉到同一個身體高
（1x 以原地縮放 x0.984～1.033 重採樣、@2x 同理拉到 125；聖騎士沒有烘好的 `walkLeft`，左向是執時镜射，所以自動跟著）。
最終：**除了 `death`（倒地）以外，所有動作列身體高 = 63 ± 0.6 px（@2x 125 ± 1）**。

⚠ 這幾列的縮放是在烘焙後的表上做的（走路的上下方向來自另一條管線，沒有可直接重貼的來源 → 會多一次重採樣）；
已在 3× 放大下目視確認盔甲邊線沒有碎掉，實機截圖正常。若以後要從來源重生，走 `build_hero.py` 加 per-row 縮放最乾淨。

**驗收**：`npm test` 11 項全過；`check_facing` 45 秒 → 走路 5852、`heroWalkBad 0`、`heroAnimBad 0`、`enemy*` 全 0，隊伍戰鬥 0 錯；
`audit_hero_sheet paladin` 的 `idle height 63`、無新增 edge 警告；HTML 15.62 MB。

---

## 2026-10-22：攻擊改成真正的 8 方向素材（不再用程式鏡像）

需求：「不要鏡像，直接套用八方素材」。原本只烘 5 列（東、東南、南、東北、北），左邊三向靠執行時翻轉；
但 PixelLab 的來源本來就 8 個方向都有，白白丟了三張。

**素材**
- 新腳本 `pipeline/scripts/pixellab/add_attack_dirs8.py`（`add_attack_dirs.py` 的延伸，只新增不覆蓋既有列）：
  把 `output/pixellab-incoming/<hero>-attack-8dir/attack-<方向>.png` 接成 8 列，新增
  `attackLeft`（west）、`attackDownLeft`（south-west）、`attackUpLeft`（north-west）。
- 對齊（都用「東向列回歸校準」實測，不是猜的）：腳底最低點 → `cell − footFromBottom − 1`；
  縮放 1x/@2x 固定（paladin 0.625/1.25、berserker 0.5/1.0）；水平兩種模式
  —— berserker 用整列同一個 dx（回歸相符度 1.000），paladin 逐格用「底部 6 列重心」對齊到
  **對側列的鏡像重心**（paladin 用固定 dx 只有 0.887，轉向時身體會跳一下）。
- 新增的 3 列沒有任何一格碰到 cell 邊界（`audit_hero_sheet.py` 對新列 0 個 edge 警告）。
- 檔案變大：`paladin.png` 1440×2580、`paladin@2x` 2880×4960、`berserker.png` 1152×2352、
  `berserker@2x` 2304×4448；內嵌 HTML 14.76 → 15.75 MB。

**遊戲**
- `src/pixel-world.js`
  - 新增 `ATTACK_ACT` / `ATTACK_FALLBACK`：攻擊/技能用 8 方向列名（`downLeft→DownLeft` 等）；
    缺列才依序退回右向對角 → 上下 → 側面（那時才鏡像）。走路/待機與魔物仍用舊的 `DIR_ACT`（行為不變）。
  - `leftRow()`：列名以 `Left` 結尾就直接回傳 `baked`（不再翻）。
  - `drawSheetHero()`：`act` 已是烘好的左向列時 `facing=1` 且 `baked=true`（不然會翻兩次→面朝反方向，
    身體位移方向也會相反；配件錨點要用列自己的）。

**驗收**
- 空揮八向（把一位獵人換成該職業，讀 `__mistvaleFacing()`）：paladin 現在
  `attack / attackDownRight / attackDown / attackDownLeft / attackLeft / attackUpLeft / attackUp / attackUpRight`
  八列全中；berserker 左向 = `attackLeft`；ranger（只有一列）仍退回 `attack` + 鏡像（舊行為保留）。
- 目視：paladin 左向＝來源 `west` 原圖（盾在畫面右、朝左），**不是**右向的鏡像；右向右一樣。
- `npm test` 11 項全過；`check_facing` 45 秒：走路 6196、heroWalkBad 0、heroAnimBad 0、enemy 0 錯，
  隊伍戰鬥 0 錯（14 筆全是 `w*` 流浪英雄，舊問題）；`check_anim`：flicker 0、walkSkip 1。

---

## 2026-10-22：手動操控的攻擊節奏——隨時可出手、CD 0.5 秒、動作後僵直

需求：不要「附近有魔物才能攻擊」；攻擊動畫結束後不能馬上走路（要等 0.x 秒）；攻擊要 CD，先統一 0.5 秒。

**做法**
- `src/pixel-data.js`：新增 `PILOT_ATTACK={cd:0.5,anim:0.45,recover:0.2}`（秒）。`anim` 是攻擊動作長度：
  攻擊列 `(格數 − release) × frameTime`，8 格職業 0.30 秒、9 格職業 0.375 秒，再加上命中停頓 0.07 秒，
  取 0.45 當上限；之後再加 0.2 秒收招僵直 → 出手後 0.65 秒內不能走。
- `src/pixel-game.js`（`pilotStep`）
  - `pilot` 多了 `readyAt`（CD）、`lockUntil`（僵直）、`faceX/faceZ`（最後走向）。
  - 出手：只要 `state.time >= readyAt` 就一定播放——`h.atkAt/atkX/atkZ` 都會設。
    3.2 格內有魔物就朝它並結算傷害（與 AI 相同的傷害／特效／`rewardEnemy`）；沒有魔物就朝最後走的方向空揮，不算傷害。
  - 僵直：`state.time < lockUntil` 時直接 `return`，跳過位移（搖桿可以一直按著，時間到自動續走）。
  - 新 API：`pilotCooldown()`（還幾秒能再打）、`pilotLockLeft()`（還幾秒不能走）。
- `src/pixel-ui.js`：攻擊鈕不再自己用固定 620ms 連打，改成每 90ms 問一次 `pilotCooldown()`（CD 由遊戲邏輯管，不白按）；
  按鈕内新增 `.ph-cd` 遮罩（從下往上收，剩越多遮越高）＋冷卻時降飽和，看得出來什麼時候能再打。
- `src/pixel-style.css`：`.ph-cd` 遮罩與 `.ph-btn.cool`。
- `test-pixel-game.mjs`：新增斷書——空揮也會設 `atkAt/atkX/atkZ`、CD 中的第二下被丟掉、
  僵直期間推方向不會位移、僵直結束自己續走、CD 到又能出手、`PILOT_ATTACK.cd === 0.5`。

**驗收（headless Chrome + node）**
- 場上 0 隻魔物：按攻擊 → `atkAt` 1.847（有值）、`atkX` = 角色 x+1（朝最後走向）、`cd` 0.361 ✓；
  中央放大連拍確認真的在播攻擊動作（待機→揮擊→收招）✓
- 打完後立刻把搖桿推到極右 0.25 秒：坐標完全不動 ✓；再等 0.9 秒自己繼續走（x 由 -7.75 → -7.03）✓
- 連按兩下：第二下被 CD 吃掉（`atkAt` 不變）✓；等 0.6 秒再按 → 又能出手 ✓
- console 例外 0 筆 ✓；`npm test` 全過 ✓

---

## 2026-10-22：手動操控改成手機遊戲式（左下虛擬搖桿 + 右下動作鈕），鏡頭釘住角色本體

需求：操控方式要像手機遊戲——搖桿走路、按鈕出手；而且鏡頭必須把「角色本體」追在畫面正中央。

**做法**
- `src/pixel-ui.js`（整段 `// ── 手動操控` 重寫）
  - 新增 `#pilot-hud`：左下圓形搖桿（`pointerdown/move/up` + `setPointerCapture`，多點觸控不互搶）、右下大顆「⚔ 攻擊」與小顆「✕ 離開」。
    手指在搖桿盤上的位移交給 `world.dirFromScreen()` 換成世界方向 → `game.pilotInput(dx,dz)`；鬆手歸零。
  - 攻擊鈕：`pointerdown` 立刻出手，按住每 620ms 再出手一次（與 AI 約每秒一次的節奏接近）。
  - `#pilotlab` 改成畫面頂端的細狀態列（名字／Lv／血條／狀態／換角色／離開）＋「選擇角色」清單；
    進操控時 `body.piloting` 會把一般 HUD（topbar、底部選單、技能鈕、縮放鈕、任務面板…）收起來，
    提示訊息 `#toasts` 改貼在狀態列下方，不蓋住畫面中央。
  - 操控中每 400ms 只更新文字（`pilotStatus()`），不重畫整塊，避免打斷按住螢幕的手指。
- `src/pixel-world.js`
  - `setFollow(fn, opts)`：`opts.centerBody` 把**本體中心**（身高 21 邏輯單位的一半）對到畫面正中央，
    公式 `cam.y = iso.y − h/2 + 50/scale`（`+50` 是 `camPxY` 既有的垂直偏移）；`opts.snap` 每幀直接貼齊，
    角色不會因為鏡頭 lerp 在走動時漂開。
  - 新增 `dirFromScreen(dx,dy)`、`followInfo()`；跟隨中拖曳畫布不再改 `target`（避免和跟隨互拉）。
  - 被操控的獵人腳下多一圈金環（`state.pilot.id`），一眼看得出「中央那一位就是我」。
- `src/pixel-game.js`
  - 修一個舊 bug：`step()` 的獵人迴圈沒有跳過 `task==='pilot'` 的獵人，AI 會照自己的路線／狩獵區把人拉走，
    變成搖桿在和 AI 搶方向。現在需求消耗照算，只跳過決策與走動（狀態固定為「手動操控」）。
  - `pilotStart()` 訊息改成搖桿版說明。
- `src/pixel-style.css`：新增 `body.piloting` 與 `#pilot-hud`／`#pilotlab` 樣式（safe-area 內縮、圓形像素按鈕）。
- `test-pixel-game.mjs`：新增手動操控測試（輸入會推動角色、出手打到最近的魔物、離開後回到 AI、AI 不再移動被操控者）。

**驗收（headless Chrome，430×900 與 1280×800）**
- 角色投影點：手機 `(252,422)`，期望 `(252,421.95)`；桌機 `(640,436)`，期望 `(640,436.13)` → 本體正中 ✓（`project(h.x,0,h.z)` 對照 `innerHeight/2+10.5×scale`）
- 拖搖桿往右上 1.4 秒：獵人世界座標由 `(-7.75,5.75)` → `(-9.23,1.31)`，螢幕上仍停在正中 ✓
- 按攻擊鈕 `pilot.atk` 被消費、遊戲沒被暫停 ✓；鍵盤 ↑ 仍可移動、放開歸零 ✓
- 「離開」後：`pilot=null`、`body.piloting` 移除、底部選單回來、`followInfo()` 為 null ✓
- console 例外／錯誤 0 筆 ✓；`npm test` 全過 ✓

---

## 2026-10-21：手動操控時鏡頭置中並跟隨角色

- `src/pixel-world.js`：新增 `world.setFollow(fn)`；`update()` 每幀若有跟隨點就把 `target = iso(x,z)`
  （沿用原本的鏡頭平滑 lerp），並關掉 `homeFraming`。
- `src/pixel-ui.js`：手動操控選好角色後 → `lookAt(h.x,h.z,2.1)` + `setFollow(() => 被操控獵人的位置)`；
  按「結束操控」時 `setFollow(null)`。
- 驗收：開始操控時角色在畫面 (500,450)（畫布 1000×800 的中心，等角投影固定 +50 垂直偏移），
  走動 3.5 格後仍在 (500,451) → 鏡頭確實跟著；停止後 `pilotState()` 為 null、0 例外。

---

## 2026-10-21：手動操控獵人（設定 → 手動操控）

需求：直接控制角色在地圖上走動打怪。

**做法（重用現有獵人，不新增單位型別）**
- `src/pixel-game.js`
  - `state.pilot = {id, dx, dz, atk}`；`step()` 最前面先跑 `pilotStep(dt)`
  - 被操控的獵人：`task='pilot'`（跳過 AI）、依輸入速度移動（`walkable` + `blocked` 檢查，卡住時沿單軸滑）、
    進入野外時同步 `state.region`；按一下出手 → 自動挑 3.2 格內最近的魔物、套用與 AI 相同的傷害/特效/`rewardEnemy`
  - API：`pilotStart(hunterId)` / `pilotInput(dx,dz)` / `pilotAttack()` / `pilotStop()` / `pilotState()`
- `src/pixel-ui.js`
  - 設定面板多一列「手動操控 → 選擇角色」；浮動面板 `#pilotlab`：獵人清單、▲◀▶▼ 方向鈕、出手、結束操控
  - 鍵盤：WASD／方向鍵移動、空白鍵或 J 出手（原本空白鍵＝暫停，手動操控時改成出手）、放開鍵歸零
- `src/pixel-style.css`：`#pilotlab` 沿用 `#poselab` 的面板樣式，方向鈕加大。

**驗收（headless）**：面板列出存活獵人 ✓；開始操控後 1.2 秒移動 2.8 格 ✓；對 1.34 格外的魔物出手 → 血量 66→45 ✓；
結束操控後 `pilotState()` 為 null ✓；console 0 例外 ✓；`npm test` 全過。

---

## 2026-10-21：新增「動作實驗室」（設定 → 動作實驗室）

需求：可以選擇直接控制哪個職業、做遊戲裡有的各種動作；功能放在設定裡。

**做法**
- `src/pixel-world.js`：新增 `__mistvalePoseLab` API（`info(cls)` / `set(cfg)` / `current()`）與 `posePreview` 狀態；
  `render()` 在特效之後、夜晚遮罩之前，把選到的那一格**直接畫在畫面中央**（純預覽，不動模擬、不進圖層快取）。
- `src/pixel-ui.js`：設定面板多一列「動作實驗室 → 打開」；打開後是**浮動面板**（不是 modal，才看得到後面的角色）：
  - 職業：六個職業按鈕（只有圖已載入的才會列）
  - 動作：該職業表裡**所有**動作列（待機/待機上下/走 5 方向/攻擊 5 方向/技能/受傷/倒地/勝利…，共 18 列）
  - 影格滑桿（逐格看）、▶ 播放 / ⏸ 暫停（12 fps 迴圈）、關閉（關閉時清掉預覽）
- `src/pixel-style.css`：`#poselab` 浮動面板樣式（桌機 bottom 104px、手機 150px）。

**驗收（headless）**：設定裡有入口 ✓、面板 6 職業 / 18 動作 ✓、切 paladin + attackDown + 第 6 格 ✓、
播放會推進影格 ✓、關閉後面板消失且預覽清空 ✓、console 0 例外 ✓、畫面截圖確認角色出現在中央 ✓、`npm test` 全過。

---

## 2026-10-21：聖騎士 8 方向攻擊動畫接進遊戲（素材來自 PixelLab → Telegram → API 下載）

使用者把 PixelLab「Create」生的 8 張 768×768（3×3、9 幀）聖騎士重劍攻擊傳到 `@Piassisant_bot`，
本輪用 Bot API 抓下來並接進角色表。

**取圖方法（可重用）**
- `getUpdates` → `photo`/`document` 的 `file_id` → `getFile` → `https://api.telegram.org/file/bot<token>/<path>`
- token 在 `~/.pi/telegram-bots.json`（`bots.personal`），下載目錄 `output/tg-incoming/`
- 像素圖請使用者用「以檔案傳送」，`photo` 會被 Telegram 壓縮

**素材瑕疵與處理**
- 每格右上角（部分方向在別處）多畫了一個浮空小盾牌 → 用「連通元件 + 只保留最大元件」把孤立小塊（面積 < 主體 30%、
  位置在主體上緣以上）清掉，共 41 個元件；輸出在 `output/pixellab-incoming/paladin-attack-8dir/attack-<dir>.png`

**接法（每棟都適用的重點）**
- 遊戲只需要 5 列（east / south-east / south / north-east / north），左邊三格用鏡像 → 8 方向都齊
- 每格用「腳底最低點 + 底部 6 列的重心」對齊，套同一個縮放（1x 0.5、@2x 1.0），腳底固定在 `cell-1-footFromBottom`
- **第一次接完出現「sheet 邊框剪切畫面」**：劍光弧比格子大，R/L/T 邊被切掉。改成**攻擊列用比較大的格子**
  （1x cell 160、@2x cell 320，表寬跟著加寬到 1440 / 2880），角色大小不變、弧光完整；
  只有 `attackDownRight` 第 5 幀仍溢出左邊 5px，那一列改用 0.47 / 0.94 的縮放
- 驗證：45 格**沒有任何一格碰到 cell 邊界**；放鬆幀身高 65–67 px（原本 idle 63 px）

**檔案**：`assets/heroes/paladin.{png,json}`（371 KB）、`paladin@2x.{png,json}`（956 KB）；
`attack/attackDownRight/attackDown/attackUpRight/attackUp` 各 9 幀、`frameTime .075 / release 4 / impact 5`。
`npm test`、`check_facing`（走路 4761 次 0 錯）全過，HTML 重建 14.74 MB。

---

## 2026-10-20（十二）：「角色跟建築互動的位置」改到每棟的門口正前方

使用者第三次說明需求：*「是角色跟建築做功能互動的地方，要在建築門口前」* —— 指的是**獵人走到建築前面使用它的那個點**
（`doorFoot` / `doorStand`），不是我前幾輪一直在調的滑鼠點擊框。

**原本的問題**：`DOOR_OFFSET` 是每棟手調的一組偏移，很多棟偏到建築**側面甚至隔壁棟前面**
（實測把 14 個點畫在地圖上就看得出來：clinic 偏左 2.7、academy 偏左 3.0、forge 偏左 1.3…）。

**改成同一個規則**（`src/landscape-layout.js`）：
```js
export function doorFoot(b,p){return {x:p.x, z:p.z+(b.d||3.6)/2+.55};}   // 正面(+z 面)正中央、台階外緣
```
畫面上的門就畫在建築正面中央，所以獵人走到這裡看起來就是「站在門口」。
`doorStand` 沿用（同一點，本來就有夾在地基外緣的保護）。

**驗收**
| 檢查 | 結果 |
|---|---|
| 14 棟的門口點都在鋪面上（`onPaved`） | 14 / 14 ✅ |
| 門口點沒有落在其他建築的佔地裡 | 14 / 14 ✅ |
| 把 14 個點畫在地圖上目視 | 都在各棟正面中央、台階前 ✅ |
| `npm test`（村內尋路、門口連通、獵人踩鋪面 100%） | 全過 ✅ |

（另外前幾輪的滑鼠互動框仍是「建築最下面那一排 + 門口前地面」，選取圈也畫在門口前地面。）

---

## 2026-10-20（十一）：互動點/選取圈總算落在門口前（第三次修）

使用者第二次回報「還是沒有在建築門口前」。回頭看，前兩版**選取圈仍畫在建築中心**
（`ring(p,31)`，p = 佈局中心），所以就算點得到，畫面上看到的圈也在屋頂/屋身中間 —— 這才是「看起來不在門口」的主因。

**現在的做法**
1. 互動範圍 = 建築**可見像素最下面那一排**（`spriteBounds(id)` 讀圖集 alpha 算出的外框，取底部 34% 高、
   近全寬）+ 門口前地面一小塊（從同一條的中線往下延伸）。所以門偏左、偏右、在中間都點得到，屋頂點不到。
2. **選取圈改畫在門口前的地面**：位置 = 那一條的中線、圖片底端再往下一點（`ring(selRing,17)`），
   也就是建築正面台階前面。實測大廳的圈正好在雙開門+台階前面。
3. 試過但**不採用**的兩個來源：`DOOR_OFFSET`（導航站位，很多棟落在隔壁棟前面）、圖片中心（門偏一側就歪）。

**驗收**：14 棟逐一點互動框中心 → **14/14 開到正確建築**；點屋頂（框上方 2 個框高）→ 幾乎都不開；
選取圈在大廳/鐵匠鋪/治療所都在門口台階前；console 0 例外；`npm test` 全過。

---

## 2026-10-20（十）：建築互動點真的貼到門口（第二次修）

使用者回報「還是有建築互動點沒有在門口」。第一次我用「建築圖中心 + 固定高度」推算，實測有幾棟（大廳、
學院、治療所、地下城…）的門偏在左邊或右邊，框就落在牆或屋頂上。第二次改用 `DOOR_OFFSET`（導航用）也不行
——那是獵人站的位置，不是畫面上的門。

**最後做法（用圖自己算,不猜）**：`spriteBounds(id)` 從建築圖集讀每個 cell 的**不透明像素範圍**
（`getImageData` 找 alpha>40 的外框，算成 0..1 的比例並快取），互動框就取
「可見範圍的**最下面一排**、橫跨整個可見寬度、高度約 30%（夾在 34·scale～60·scale）」。
門與台階都在建築最下面那一排，所以哪一棟的門偏左、偏右都涵蓋得到，屋頂永遠不會被點到。
圖集還沒載好時先回整張矩形且**不快取**，下一幀會重算。

**驗收（14 棟全部,一次腳本跑完）**
| 檢查 | 結果 |
|---|---|
| 依互動框中心點擊 → 開到正確建築 | **14 / 14** ✅ |
| 點同一棟的屋頂（框上方約 2 個框高處） | **0 / 14** 會開（都不會誤選）✅ |
| console 例外 | 0 ✅ |

`npm test` 全過。

---

## 2026-10-20（九）：建築互動點改到「門口」

使用者：重新調整每個建築的互動點，要在建築門口。

`drawBuilding()` 原本把**整張建築圖**當點擊框（`hits.push({...rect})`），所以點屋頂、側牆都會選到那一棟，
而且相鄰建築的圖片框會互相重疊、容易點錯。改成：

- **已建好的建築**：門口框 = 正面中央、貼著地面往上一個門的高度
  `w = max(34·scale, min(rect.w·0.34, 86·scale))`、`h = max(32·scale, min(rect.h·0.26, 54·scale))`，
  下緣落在 `p.y + 9·scale`（圖片底端），往下一點點蓋到門前地面，好點。
- **未建造的工地**：同樣改成正面中央的小框（圖集版與程序版都改）。

驗收：
| 檢查 | 結果 |
|---|---|
| 依 `__mistvaleHits()` 的框中心點擊 hall / trading / restaurant / inn | 都開到正確的建築（城鎮大廳/交易所/餐廳/旅館）✅ |
| 點畫面中央偏上（舊的整張圖範圍、屋頂位置） | **不會**開檢視面板 ✅ |
| 框位置目視（把框畫在截圖上） | 都在各棟正面下緣、門與門前地面 ✅ |

**順手修好兩個壞掉的檢查腳本**：`check_zorder.mjs`、`check_anim.mjs` 還在點 2026-10-19 就移除的
`#start-button`，一路 Timeout。改成等 `__mistvaleGame` 出現（其他六支同病灶的腳本一起改）。
修好後 `check_zorder` 8 秒 840 對 0 錯、`check_anim` 1801 幀 flicker 0 / walkSkip 3。

---

## 2026-10-20（八）：地下城入口搬進村內公園街區、拿掉四座出村牌樓、補齊所有「按了沒反應」的按鈕

使用者：①地下城入口改在村內湖的位置、取代湖 ②拿掉四個出入口的小牌樓 ③重新檢查每個建築相關按鈕是否正常。

**① 地下城入口 → 公園街區（原池塘位置）**
- `pixel-data` 的 `DUNGEON_SPOT = blockCenter(1,1)`（= 0.4, 11.1），地下城從 (19,−9.5) 搬進來。
- `landscape-layout.villagePonds()` 的 `taken()` 把地下城算進去（未建造時也算，因為工地在那裡），
  所以那個街區不再長池塘；其他公園街區若空著仍會長池塘（機制保留）。
- 舊存檔：地下城位置本來就是強制回預設值，所以讀舊檔也會在新位置。

**② 出村口不再有小牌樓**：`decorations` 不再推 `{type:'gate'}`；`check_placement.mjs` 改成
「四邊柵欄 + 四個缺口、**0 座門**」，並保留一段防止牌樓長回來的斷言。

**③ 按鈕全面檢查 —— 抓到 16 個「有按鈕、沒有處理函式」的動作**
用靜態比對（HTML 裡的 `data-action` vs `doAction` 的分支）找出：
`selectBuilding, construct, upgrade, moveBuilding, hunter, learnSkill, train, enhanceHunter, reincarnate,
recruitVisitor, quest, startBoss, setTrade, collectTrade, craftProduct, craftGear`。
這些是像素版 UI 的按鈕，處理函式只存在舊的 `src/main.js`（非像素版）裡 → 按了完全沒反應。
已在 `pixel-ui.js` 的 `doAction` 補齊（接到 `game.construct/upgrade/moveBuilding/learnSkill/train/enhance/
reincarnate/recruit/claimQuest/expedition/setTradeRequest/craft/craftEquipment`）。

**功能驗證（用玩家動線：建造面板 → 選建築 → 建造/升級）**
| 操作 | 結果 |
|---|---|
| 14 棟建築的建造/升級 | 全部成功（等級 +1、訊息正確）✅ |
| 移動位置 | 進放置模式 → 點地面 → 位置改變 ✅ |
| 獵人 學技能/修煉/強化/轉世 | 數值都改變 ✅ |
| 交易所 發布收購 / 查看 | 數量與提示正確 ✅ |
| 製作 生活物資 / 裝備 | 庫存 +10 / +1 ✅ |
| 招募 / 委託 / 首領 / 地下城 / 競技場 | 都成功觸發（失敗時也給正確原因）✅ |
| console 例外 | 0 ✅ |

`npm test` 全過；`check_placement`：擺設 0 件、柵欄 52 段、門 0 座、雕像 1 座。

---

## 2026-10-20（七）：野怪區與村莊等距、鏡頭最遠限制、Minecraft 式地形交界與不規則海岸

使用者：①怪物生成點不要離村界太近 ②每個地形均勻分佈圍繞村莊、各地形交界像 Minecraft 那樣不規則
③整張地圖邊界是不規則海岸線 ④四周野怪區跟村界距離都要相同 ⑤鏡頭最大不要放太遠。

**改了什麼**
1. **世界以村莊中心為中心**：`WORLD` 改成由 `VILLAGE_BOUNDS` 中心推導（74 × 69），村界到四邊
   22.0 / 21.9 / 21.0 / 21.1（改前是 13 / 31 / 20.5 / 21.6）。七個野怪區的縱深因此一致
   （村界到海岸 15.7～20.7，差距只剩海岸線本身的起伏）。
2. **不規則海岸線**：`inWorld()` 不再用矩形，而是「離四邊的距離 > 海岸內縮量」；內縮量是四個頻率
   的正弦（各自轉成 0..1 再加權）映射到 1.6～6.4 格 → 一定有海灣與岬角、又不會有陸地貼在邊界上。
   世界矩形以外的裝飾陸地（舊的 `coastOut` 與西側深密林長方形）全部移除，外面就是海。
3. **地形交界不規則**：`ringPhi()` 加上三層正弦擾動（振幅合計約 0.16 rad ≈ 9°，遠小於區間隔 32°以上），
   邊界不再是從村莊射出的直線。
4. **每區面積仍相等**：`RING_START` 改成「掃描整片陸地、取 `ringPhi` 的等分位數」→ 七區陸地格數
   1943–1944（偏差 <0.1%）。
5. **生怪均勻**：`randomRegionPoint` 離村界至少 3.4 格；`spawn()` 改成抽 6 個候選點、選離其他魔物最遠的
   那個（藍雜訊式分散，不會兩三隻擠一角）。
6. **鏡頭最遠 0.75 倍**：`ZOOM_MIN`；下限用 `min(0.75, 目前比例)`，所以手機首頁的 0.65 不會因為
   按縮小反而放大。`focus('world')`（主世界地圖→全景查看）也一起夾住。
7. **地下城入口搬到 (19, −9.5)**：原本 (24, −11) 在新海岸線下會泡在海裡（4 × 3.5 的佔地要全在陸地上）。
   `pixel-data` 的預設與三個 LEGACY 版面一起改，`test-landscape` 的期望值同步更新。

**驗收**：`npm test` 全過（新增「村莊在世界正中央」「地形交界不規則」「北海岸起伏 > 2 格」
「生怪離村界 > 3」等斷言）；桌機首頁 1.70、最遠 0.75；手機首頁 0.65、最遠 0.65；console 0 錯誤。
（註：畫面上偶爾看到魔物離村界 < 3 是**追擊移動**造成的，出生點本身仍 ≥ 3.4。）

---

## 2026-10-20（六）：畫質設定收成一條，需要再展開

使用者：「畫質設定收成一條 需要才點開」。

「遊戲設定」現在預設只有三列：
1. **畫質與效能** —— 一行摘要（`畫質 高 · 解析度 自動 · 幀率 30 · 影子 開 · 夜晚 開`）+「調整」按鈕
2. 匯出存檔
3. 重新開始

按「調整」才展開五個選項（畫質 / 解析度 / 幀率 / 動態影子 / 夜晚變暗），按「收起」收回；
展開狀態存在 `settingsOpen`（不寫進存檔）。改完任何一個選項面板會重繪，摘要立刻更新。
手機寬度下四顆解析度按鈕在同一行（`@media(max-width:760px)` 的 `.seg` 改成不換行）。

驗收（手機 390×844 模擬）：收起時 3 列、展開時 8 列、改影子後摘要變「影子 關」、再收起仍在、console 0 錯誤。

---

## 2026-10-20（五）：設定面板改成「畫質與效能」選項區

使用者：設定選項刪除前四個(裝備零件層 / 整理村莊 / 派遣獵人出征 / 流浪英雄)，加上可調畫質效能的選項區。

**現在「遊戲設定」的內容**
| 選項 | 值 | 作用(實作) |
|---|---|---|
| 畫質 | 高 / 低 | `world.setQuality()`：粒子、光暈、雪 |
| 解析度 | 自動 / 1x / 1.5x / 2x | `world.setDpr()`：`renderDprMax` + `resize()` + 整張重畫（自動 = 手機 1.5 / 其他 2） |
| 幀率 | 30 / 60 | `pixel-ui` 的 `fpsTarget`（暫停時仍降到 10） |
| 動態影子 | 開 / 關 | `world.setShadows()`：少一層滿版影子貼圖；關掉時 `cast()` 直接跳過 |
| 夜晚變暗 | 開 / 關 | `world.setNight()`：DOM 覆蓋層不再變暗 |
| 匯出存檔 / 重新開始 | — | 原樣保留 |

**存檔**：`state.settings = {quality,dpr,fps,shadows,night}`，`pixel-game.js` 的 `normalizeSettings()` 會過濾非法值、
舊存檔缺欄位就補預設；載入後 `applySettings()` 一次套到世界與幀率。重置村莊也會重新套用。

**驗收**（手機 390×844 DPR3 模擬）：面板只剩上表 7 列、分區標題「畫質與效能」；切 1x → 畫布 390×844、
2x → 780×1688、自動 → 585×1266；幀率 60 生效；夜晚關 → 覆蓋層 opacity 0；
影子關 → 地面投影消失（同一畫面差異 29,692 px，其他內容不變）；**重新載入頁面後設定仍在**；console 0 錯誤；
`npm test` 全過。

---

## 2026-10-20（四）：把渲染路徑「整段還原成原版」來收掉殘影

使用者指示「改回原本不會殘影的時候」。做法：把 `render()` 的合成段**逐字還原成 HEAD 的版本**，
只留下與畫面正確性無關的最佳化。

**現在的合成（= 原版）**：
- `paintComp(rects)`：只把動過的範圍重算進 `comp`（地面＋影子＋精靈）
- 之後 **`comp` 整張貼到螢幕**（一次滿版貼圖）
- `compValid`：中間只要有一幀走 direct（覆蓋率 >40%）就標記失效，下一幀重做整張
- 我上一輪加的「合併矩形 (`mergeRects`)」整段刪掉，`paintComp` 直接吃原始的 `compRects`

**保留的最佳化（不影響畫面正確性）**：手機畫布 DPR 上限 1.5、夜晚用 DOM 覆蓋層、
`ensureAtlas()` 每 10 幀、DOM 面板 400 ms、暫停 10fps、`resize()` 大小沒變就跳過。

**驗收**（`__mistvaleForceFull()` = 逼下一幀整張重畫所有物件，鏡頭不動）：
| 測試 | 結果 |
|---|---|
| region 模式：暫停畫面 vs 整張重畫 | **0 px** |
| direct 模式：同上 | **0 px** |
| 注入傷害數字＋治療、等它過期後再比 | **0 px** |
| 連續 8 張（4 秒）互相關比較 | **全 0** |
| fps / console 錯誤 | 30 / 0 |

貼圖量 **158 Mpx/s**（原版在 DPR 2 是 279；差異來自手機 DPR 1.5 的上限）。

---

## 2026-10-20（三）：修掉殘影（上一輪省效能的副作用）

使用者回報「會有殘影」。根因是我上一輪把「三層先合成到 comp、再整張貼到螢幕」改成
「三層直接貼到螢幕、只貼動過的範圍」——**只畫在螢幕上的東西沒有人清**：

- `state.effects`（傷害數字、斬擊、死亡煙、治療、投射物、升級字）
- `ghostHunter`（被擋住的獵人半透明殘影）
- 花粉/雪花（每幀都換位置）
- `uiLabels` / `screenTexts`（建築名牌、地名）

它們畫在**螢幕**上，區域合成只重貼「有單位在動」的矩形，所以舊的像素永遠留在畫面上，
一路疊上去就是殘影（花粉/特效過期後留下的小點與數字最明顯）。

**修正**：把 `comp` 圖層加回來——
- 每一幀只把**動過的範圍**重算進 `comp`（三層合成，範圍小 → 便宜）
- 但 `comp` **整張貼到螢幕**（一次滿版貼圖）→ 螢幕上所有舊像素都會被覆蓋
- `compValid` 記錄 comp 是否等於「完整的三層合成」；中途只要有一幀走 direct（覆蓋率 >40%）
  就標記失效，下一幀重做整張，避免貼到不完整的 comp
- 新增驗收用 hook `__mistvaleForceFull()`：讓下一幀走「整張重畫所有物件」的路徑（不動鏡頭）

**驗收方法（可重複跑）**：暫停 → 等鏡頭收斂 → 截圖 A → 再截 A2（應該與 A 完全相同，證明鏡頭真的停了）
→ `__mistvaleForceFull()` → 截圖 B → 比對 A2/B。修好後 region 模式與整張重畫 **0 px 差異**；
另外注入傷害數字/治療特效、等它過期後再比，也是 **0 px**；連續 8 張（4 秒）彼此完全相同 → 沒有東西會累積。

**代價**：每幀多一次滿版貼圖，貼圖量 136 → **158 Mpx/s**（原始未最佳化是 279，仍 −43%）。
`npm test`、`check_facing`（走路 5076 次 0 錯）全過。

---

## 2026-10-20（續）：顯示總檢查（桌機/手機、白天/夜晚、放大、面板、戰鬥）

使用者要求「測試是否顯示都正常」，所以做了一輪逐項截圖＋量化檢查（headless Chrome，桌機 1440×900 DPR2 與手機 390×844 DPR3）：

| 檢查 | 結果 |
|---|---|
| 畫布解析度 | 桌機 2880×1800（DPR 2）、手機 585×1266（DPR 1.5）✅ |
| 村莊白天 / 近照 / 東門近照 / 最大縮放 | 顏色數 1150–1220、全黑像素 <2.5%、畫面持續在動 ✅ |
| 夜晚（time=180） | 遮罩 opacity 0.15 → 整張亮度 −13%、藍通道掉得最少（確實是藍色調暗）✅ |
| 獵人面板 | 名冊 / 頭像 / 數值條正常 ✅ |
| 野外戰鬥 | 傷害數字、血條、8 方向攻擊、狼與史萊姆 ✅ |
| 暫停 | 30fps → 10–11fps，恢復後回 24–29fps ✅ |
| console 錯誤 | 0（40 張連續截圖 + 全程）✅ |
| 圖層殘影 | 暫停後兩張間隔 1.2 秒 **完全相同（0 px）**；動一下鏡頭逼整張重畫後仍然 **0 px 差異** → 合成/擦除是正確的 ✅ |
| 1x/2x 英雄表切換 | 在縮放門檻來回掃 16 張，沒有糊掉或拉伸 ✅ |

**這輪檢查順手修掉的顯示 bug**：村莊四座門的 `PROP_ATLAS.gate` 尺寸還是太小（4.6×6.1），
在 4x 縮放下只有柵欄柱的 1/4 高，看起來像一個玩具小門。改成 **11.5×15.3**（≈3 世界單位寬、比柵欄柱略高），
現在是橫跨柵欄缺口的正常村門（`npm test`、`check_gates` 仍全過）。

**看到一次、沒能重現的現象**：手機 4x 近照有 1 張截圖出現「斜向糊掉的一條」，之後連續 66 張
（40 張 soak + 16 張縮放掃描 + 10 張同鏡頭）都沒有再現，且暫停後畫面與整張重畫 0 px 差異，
判斷是截圖擷取當下的合成時序（或單一特效幀），不是圖層殘影。若之後又看到，先確認是不是只有截圖才有。

---

## 2026-10-20：手機發燙 → 砍掉一半以上的貼圖量

使用者指示：「效能吃緊 手機發燙 找出原因讓手機不發燙」。

**量測方法**（390×844 CSS、DPR 3 手機模擬，抓 canvas API 呼叫量與「被貼上的像素總量」）：
- 改前：**279 Mpx/s** 的 `drawImage`（每幀約 9.3 Mpx ≈ 7 個滿畫面），其中 240 Mpx/s 是離屏圖層之間的合成；
  滿版貼圖（≥ 半個畫面）**2029 次/秒**；畫布 780×1688（DPR 2）。
- 每幀 JS（tick + update + paint）只有 **2.6 ms**、GC 幾乎沒有 → 發燙來源是**貼圖/填充的像素量（GPU 記憶體頻寬）**，不是 JS。

**做了什麼**：
1. **合成少一層**：以前「三層（地面＋影子＋精靈）先在 comp 合成，再整張複製到螢幕」，等於每幀多一張滿版貼圖。
   現在直接把三層貼到螢幕（region 模式只裁剪到動過的範圍），`comp` 圖層整張移除（順便少 3 MB 畫布記憶體）。
2. **手機/觸控裝置畫布解析度上限 2 → 1.5**（`pointer:coarse` 或 `maxTouchPoints>0` 判定）：
   像素量 4 → 2.25（−44%），最近鄰放大的像素圖看起來幾乎一樣。
3. **夜晚變暗改成 DOM 覆蓋層**（CSS opacity 交給合成器）：以前每幀對整張畫布 `fillRect` 一次。
4. **合成矩形合併**：一幀原本有 ~100 個 clip 矩形（每隻會動的東西 × 影子 × 上一幀），合併成 ≤12 個外接矩形。
5. **`ensureAtlas()` 每 10 幀才檢查一次**（素材只在前幾秒載入），**DOM 面板更新 250 → 400 ms**，
   **暫停（看選單）時幀率 30 → 10**。
6. 新增兩個觀察用 hook：`__mistvalePerf()`（合成模式/畫布解析度/夜間值）與 `__mistvaleFrameStats()`（每幀 JS 時間）。

**結果**（同一支手機模擬）：貼圖量 **279 → 136 Mpx/s（−51%）**、畫布 780×1688 → 585×1266（−44% 像素）、
每幀 JS 2.6–2.8 ms、fps 仍 30。`npm test`、`check_gates`（四門 crossings other 0、off-paved 0）、
`check_facing`（走路朝向 5076 次 0 錯）全過。

**踩到的坑（留紀錄）**：把 `mergeRects/rectPathMerged` 誤放進 `if(staticKey===vk){…}` 區塊裡、
外面的合成程式卻用到它 → 每幀丟 `ReferenceError`，而 `requestAnimationFrame(frame)` 排在最前面，
所以**畫面卡住但看起來不會當**（只有 `__mistvalePerf` 之類的計數在動）。之後改這區塊要記得先看 console 有沒有錯。

---

## 2026-10-20：生怪均勻、到邊界就開打、魔物只守自己的攻擊範圍

使用者指示：「改成怪物生成點均勻分佈在該區域內，並且英雄只要到區域邊界就等於到了，馬上開始尋找怪物攻擊，
而怪物只會攻擊自己主動攻擊範圍內的敵人」。

- **生怪**（`spawn()`）：以前是「取 6 個候選、挑離其他魔物最遠的那個」——等於一直在挑邊緣點。
  改成**整區均勻取樣**（`randomRegionPoint()` 本來就是區內 area-uniform 的拒絕取樣），
  只有跟其他魔物疊在一起（< 1.8 格）才重抽（最多 10 次）。魔物會散在整區，不會擠在一側或繞著中心。
- **英雄到邊界就算到達**（`step()` 的 `h.rallying` 分支）：以前一定要走到 `regionEdge` 那個**點**，
  到了才開始 `searchStep()` 隨機晃、還要等魔物進到視野 `SIGHT=12` 才會鎖定。現在：
  1. 一踩進自己狩獵區（`regionContains`）就結束集結（`rallying=false`、清掉路線）；
  2. 目標選擇改成「在自己的狩獵區內 → **直接挑最近的魔物**，不受視野 12 限制」。
  實測（派遣到鐵脊山麓）：踩進區域後 **50 毫秒**就鎖定目標、並直接走過去打。
- **魔物只打主動攻擊範圍內的敵人**：新增 `AGGRO = {slime 5.5, wolf 8, golem 5, ogre 6.5, boss 15}`。
  以前是整區找最近的敵人、10 格（首領 18）內就會追過來；現在**超出 AGGRO 一律不鎖定、不追**，
  沒目標就照原本的巡邏/閒晃。實測（野狼 AGGRO 8）：距離 12／9 完全不出手、距離 6／4 正常開打。
- **驗收**：`npm test` 全過；`check_gates`（四門 crossings 東 150／西 100／北 73／南 118、other 0、off-paved 0）；
  `check_facing`（走路朝向 5263 次 0 錯、待機/走路一致 0 錯、戰鬥朝向 548 次 8 次誤差＝流浪英雄被怪物打時的受擊翻面）；
  `diag/check-hunt3.mjs` 三項全過（生怪點全部在區內、平均半徑與均勻理論值差 12%、
  49 毫秒鎖定目標、AGGRO 兩側行為正確）。

---

## 2026-10-20：攻擊前後方向一致 ＋ 魔物會打流浪英雄

使用者指示：「攻擊前後的面向姿勢要一樣，開始下一次動作前才換方向」「怪物也要會攻擊流浪英雄」。

- **攻擊後方向會自己跳回側面**（已修）：出手方向本來就鎖在 `atkDirs`（每次攻擊算一次），但攻擊一結束
  `drawHunterSheet()` 會把 `vdir` 打回 `'side'`，而且 `sheetPose()` 的待機列在戰鬥中強制用側面 `idle`
  → 打上/打下之後立刻轉回側面，看起來「都只有左右」。
  現在：攻擊結束後**保留**上一次鎖定的方向（`else ad.mode=''` 不再改 `vdir`），待機列也用
  `dirSuffix(m,'idle',vdir)`（斜角沒有待機圖 → 退回上/下，預期行為）。方向只在下一個動作
  （起步走路或下一次出手）才重算。
  驗收：八個方向逐一「蓄力 → 出手 → 攻擊後 → 待機」採樣，方向家族全部一致（`OK × 8`）。
- **魔物只打獵人，從來不打流浪英雄**（已修）：魔物的目標清單原本只有 `state.hunters`，而流浪英雄會自己
  去打魔物 → 看起來像無敵。現在目標 = 獵人 + 流浪英雄（都要求 hp>0 且不在村裡），被打倒時走
  `downWanderer()`（倒在野外 9 秒自己站起來、`state.wanderDowns` 記數），不會誤用獵人的復活聖所流程。
  實測 200 秒：流浪英雄被打 **112 次**（4 隻都中過；改前是 0）。
- **順帶讓八方向攻擊真的看得到**：等空位的魔物以前全部擠在「獵人背對空地中心」同一條線上，
  打起來刀永遠只有左右。改成在同一個半圈上每隻魔物分到不同方位（±72°，用 id 決定），
  實測英雄出手的方位分布變成八個扇區都有（左上 16／左 17／右下 20／右 33／上 8／左下 14／右上 7／下 4）。
- **驗收**：`npm test` 全過；`check_facing`（英雄走路朝向 7442 次 0 錯、走路/待機一致 0 錯、
  戰鬥朝向 955 次只有 10 次誤差，全是流浪英雄被打時的受擊翻面）；`check-atk8-full` 八方向蓄力 0–3 +
  出手 4–8 仍全對；`diag-osc` 抖動 40/271394（跟改前同級）。

---

## 2026-10-20：四個方向都有出入口 ＋ 村中央雕像放回來

使用者指示：「改四個方向都要有出入口」「把原本村中央雕像做回來」。

- **原因**：這兩件事都是 `6fd9dad`（村莊收攏成 4×4 棋盤）時拿掉的 ——
  `EXITS` 只剩東、南兩個出口，`decorations.push({type:'monument',…})` 與 `{type:'gate',…}` 兩行被刪。
- **四個出口**（`src/village-grid.js`）：`EXITS` 改成北、東、南、西四個，位置在該側柵欄的**正中央**
  （`MID_X`/`MID_Z`，剛好等於中央那條街 `STREET_X[2]`/`STREET_Z[2]` 的延伸線，所以四個門都接得到街）。
  柵欄缺口（`PALISADE`）、碰撞、村內外導航、道路（`getRoads` 每個出口一段）都吃同一份 `EXITS`，不用另外改。
  `pixel-game.js` 的「兩口之間穿村路徑」只在 `GATES.length===2` 時啟用，四個門時自動停用，改走村外節點環。
- **四座門**（`src/pixel-world.js`）：`PROP_ATLAS.gate` 原本是 `['gate',56,56,4]` —— 圖集門（210×280）被 contain 進
  56×56 個單位 → 比房子還高的巨門（實測截圖確認）。改成 `['gate',4.6,6.1,0]`（4.6 個單位寬＝門口 3 公尺再外擴一點，
  底部貼地），並在每個出口放一座（`size` 不指定，交給圖集尺寸）。程序繪製的 `gate` 分支保留當 fallback，
  改成「兩根門柱在缺口兩端 + 橫樑 + 門牌」，寬度用 `EXIT_GAP`。
- **中央雕像**：`decorations.push({type:'monument', x:blockCenter(0,0).x, z:blockCenter(0,0).z})` 放回廣場正中；
  畫法從 `68` 個單位寬（15 倍廣場）改成 **20**（實測約 1.6 個英雄高，塞得進 4.4×3.6 的廣場，底部貼地 .6）。
  （`__monumentW` 是調校時用的暫時 hook，已移除。）
### 2026-10-20 追加：雕像與建築全部改成實心

使用者指示：「好改實心 所有建築都要是實心」。

- **問題**：建築的碰撞盒一直是 `b.w × b.d`（3.5–4.4），但畫面把所有建築都畫成 **7.33 個世界單位寬**
  （`uniformBuildingWidth()` = 最大概念寬 × 0.5），所以角色會走進「看得見的牆」裡；雕像則完全沒有碰撞。
- **做法**：`landscape-layout.js` 新增單一來源
  `SOLID={x:3.0,z:2.3}`（實心半寬/半深 → 6.0×4.6）與 `STATUE={x:.95,z:.7}`，
  以及 `buildingSolid()` / `statueSolid()`。`pixel-game.js` 的 `rects`（`blocked()`、`walkable()`、
  村內尋路、怪物與流浪英雄移動全部吃這一份）改成用它們，並把廣場中央的雕像加進去。
  - 街區間距 6.9×6.1、街道 0.8 寬 → 實心 6.0×4.6 之後，兩棟之間還留 0.9（x）/1.5（z）的走道，街道沒有被吃掉。
  - 建築大小是統一的（`BUILDING_UNIFORM_RATIO`），所以實心佔地也統一，不用逐棟量。
- **驗收**：
  - `npm test` 全過。`test-landscape.mjs` 的「實心佔地」改成直接引用 `buildingSolid()/statueSolid()`
    （以前是自己用 b.w/b.d 重算，改大之後會不一致）。
  - `check_gates.mjs`：四門 crossings 東 138／西 98／北 69／南 97、**other 0**、off-paved 0
    → 走道變窄之後仍然走得通。
  - `check_placement.mjs` exit 0（柵欄 52 段、門 4、雕像 1、其他擺設 0）。
  - 實機檢查：雕像中心格 `isOpenCell=false`、周圍 1.4 單位處仍可走；英雄在街上的路線段 3150 段全在鋪面上。
  - `test-landscape.mjs/journal` 更新：柵欄段數 `EXITS.length+4`、缺口量測改成看柵欄走向（東西沿 z）、
    四個門在畫面四個對角邊上、都在該側正中央。
  - `check_gates.mjs`：7 個狩獵區各 600 秒，跨村界 **bad 0 / off-paved 0**，
    四個門都真的被用到（東 159、西 83、北 60、南 120）。
  - `check_placement.mjs`：柵欄 52 段、門 4 座（各在缺口正中）、雕像 1 座（廣場正中）、其他擺設 0 件 → exit 0。
  - 截圖確認：雕像站在廣場中央、大小約 1.6 個英雄高；門立在柵欄缺口上（`__mistvaleDetails().proc` 沒有 `gate`，
    代表用的是圖集素材，不是程序 fallback）。

---

## 2026-10-20：狂戰士攻擊套用到 8 個方向

使用者指示：「狂戰士攻擊八個方向都要應用到」。

- **素材本來就有、只是沒接**：PixelLab 當時生的「Horizontal-greatsword-slash」其實是 8 個方向各一段，
  只接了 `east` 那一列當 `attack`（對照表在 `output/pixellab-incoming/_atk-map.txt`）。8 個檔案都在
  桌面 `狂戰-8方向-256/attack/`，這次複製到 `output/pixellab-incoming/berserker-attack-8dir/`
  （`output/` 不進版控，跟其他生成物一樣）。規格：768×768＝3×3 共 9 格、每格 256。
- **新腳本** `pipeline/scripts/pixellab/add_attack_dirs.py`：把條圖接成 **5 列**
  （`attack` 東、`attackDownRight` 東南、`attackDown` 南、`attackUpRight` 東北、`attackUp` 北；
  左邊三格由 `moveDir()` 對應到右邊的列再鏡像，所以不用另外烘三列）。
  - 接法沿用原本 `attack` 列的實測值，腳本會先驗證再寫：**用同一套接法重做 east**，
    跟現有列比對 1x 93.5%、@2x 89.2%（≥85% 才寫檔）。1x＝每格 NEAREST 縮一半貼在 cell 128 的 (2,25)。
  - **@2x 的位移改成 (4,50)**（原 (4,58)）：50 剛好是 1x 的兩倍，縮放到 2x 門檻換表時角色不會跳 8 px。
  - 一律原地換掉同格數的列，不留重複列；`head` 配件錨點用 `add_battle_rows.py` 同一套算法重算。
  - 時間軸不變：`frameTime .075、release 4、impact 5`（9 格）。
- **程式**（`src/pixel-world.js`）：
  - `combatPose()` 出手/蓄力時多帶 `vdir=moveDir(目標-自己)`（螢幕空間切 8 個 45° 扇區）。
  - `sheetPose()` 用 `'attack'+dirSuffix(m,'attack',vdir)` 挑列 —— 素材沒有的方向會自動退回
    （斜角→上下→側面），所以**其他職業完全沒變**。
  - `drawHunterSheet()` 出手/蓄力時用攻擊方向挑列（其他戰鬥姿勢仍走側面），朝向判斷改成
    `sp.act.startsWith('attack')`；`motionOf()` 的後綴拆解支援 `DownRight/UpRight`（上下/斜角不做水平位移）。
- **修掉一個「只有前段對、尾巴跳回側面」的 bug**：`combatPose()` 的 `pose` 只維持到 0.36 s，
  但 `sheetPose()` 的出手列會播到 0.445 s（含命中停頓）→ 最後 1–2 格 `vdir` 已經退回 `side`，
  八方向攻擊的結尾會突然跳成側面那一列。改成 `drawHunterSheet()` 直接用 `h.atkX/atkZ` 算方向，
  窗期 = 出手動畫全長 0.46 s，不再看 `pose==='strike'`。
- **驗收（三層）**：
  1. **方向對應**：八個方向逐一出手，`__mistvaleFacing()` 讀回的列全部正確
     （東→attack、東南→attackDownRight、南→attackDown、西南→attackDownRight(鏡像)、西→attack(鏡像)、
     西北→attackUpRight(鏡像)、北→attackUp、東北→attackUpRight）。
  2. **整段動畫每一格**：把蓄力（`attackTimer` 0.29→0）與出手（`atkAt` 0→0.42 s）兩段都掃過，
     八個方向都是 **蓄力 0–3 格 + 出手 4–8 格，全部落在同一個方向列**（沒有跳列、沒有缺格）。
  3. **真實戰鬥**：`game.tick` + `world.update` 快轉 120 秒（先派 5 位獵人去向陽草原），
     5/5 獵人都出手過；`h:windup`/`h:strike` 姿勢都出現；自然戰鬥中 `attack`、`attackDownRight`、
     `attackUp` 都完整播過 0–8 格（方向是隨機的，`attackDown` 那次剛好沒發生，由第 2 層補足）。
  4. `npm test` 全過、無 JS 錯誤。
### 2026-10-20 追加：方向抖動 / 邊打邊跳的問題

使用者回報：「戰鬥方向還是常常用左右，或不同方向抖動；怪物移動時邊攻擊邊打，動畫會快速跳動」。
實測（`game.tick`+`world.update` 快轉 120 秒、5 位獵人派去狩獵區）找到三個原因，逐一根治：

1. **只有狂戰士有 8 方向攻擊美術**。`assets/heroes/*.json` 檢查：archer／assassin／darkknight／
   paladin／priest／ranger／sorcerer／witchhunter 都只有一列側面 `attack`（`dirSuffix` 會自動退回側面，
   所以它們**一定會用左右**）。這是素材缺口，不是程式問題 —— 要的話得對其他職業跑 PixelLab 8 方向攻擊動畫。
2. **攻擊方向每幀重算 → 亂跳**（已修）。以前出手方向用「目標當下位置」每幀算一次，魔物一移動就越過
   45° 扇區邊界，攻擊列每幀換一次；蓄力（0.3 s）與出手（0.445 s）也可能選到不同方向。
   改成每次攻擊**只在開始時鎖定一次**（`atkDirs` Map，key = 獵人 id）：進入蓄力時算一次、之後不動，
   出手沿用蓄力鎖定的方向 → 一整段攻擊永遠同一列。實測：相鄰兩幀攻擊列互換 **0 次**（改前有零星）。
3. **走路/待機每幀互換 → 原地抖**（已修）。兩個來源：
   - `moveDir()` 對相鄰扇區邊界沒有容錯：角色沿著邊界走、繞障礙左右微調時 `walkDown↔walkDownRight`
     每幀跳。新增 `moveDirStable()`（離開原方向中心 >30.5° 才換，也就是邊界再多 8°），走路／魔物移動都改用它；
     攻擊仍用精確的 `moveDir()`（只算一次，不需要容錯）。
   - 模擬的 `status` 在同一場戰鬥裡會 `戰鬥中 ↔ 追擊中` 每幾幀跳一次，位移也常「一幀有一幀沒有」。
     新增兩個保持時間：走路 0.18 s（`walkUntil`）、戰鬥 0.3 s（`fightUntil`/`engageUntil`，含待機要用
     側面還是上下列、目標查找）；`sheetPose()` 多一個 `inFight` 參數吃保持後的狀態。
   實測 A→B→A（0.15 s 內）抖動次數：**237 → 18**（120 秒、全部角色），剩下的是正常的
   idle→attack→idle 之類切換。

- **已知小瑕疵**：`attackDown` 第 5、6 格的大劍光弧尾端會碰到 cell 底邊（1x 約 2 px、@2x 約 4 px），
  `audit_hero_sheet` 會報 `attackDown5/6: touches cell edge`。那是條圖本身的弧線掉到腳下造成的，
  要完全避開得把整列往上移 3 px（角色會比其他方向高 1 世界單位）—— 目前選擇保留位置一致、接受弧尾被切。
  （`berserker` 這張表本來就 FAIL 其他項目：idle 1 格、height 63、death 碰邊、色數，都是既有狀態。）

---

## 2026-10-13：使用者的新「狂戰」（`e88f7207`）8 方向走路動畫

使用者指示：「改用我做的版本 狂戰那個 生八個方向的走路動畫」。

- **他們的角色重新做過了**：舊的 `03523299` 已不在帳號裡；新的是 **`e88f7207`**（state `狂戰`，
  今天 08:34 建）——背後是**大劍**不是斧頭。另外牧師 `1fd30672`、以及新的 `1b587022`（右手法杖）也在。
- **做法**：`v2_client.py animate e88f7207-... --template walking-8-frames --directions（8 個）`，
  一次送 8 方向（約 10 分鐘）。下載時 `east` 第一輪是空的（伺服器還沒準備好），重跑 download 就補齊。
- **產物**：`output/pixellab-incoming/_user-berserker/walking-8-frames-<dir>/frame-00..07.png`、
  `berserker-user-walk-8dir.gif`（8 方向並排）、`-sheet.png`（8×8 總表）、`-south-x3.gif`。
  桌面 `pixellab-正面素材/狂戰-8方向走路-e88f7207/`（每方向一個資料夾）；已傳 TG。
- **⚠️ 重要計價修正**：這次 8 方向走路實收 **$0.573（$0.072／方向）**，
  不是我 10/12 量到的 $0.0678／8 方向 —— 那次是**餘額還沒入帳**造成的低估值。
  定價頁寫的 template 128×128 ≈ $0.0956／方向 才是對的量級。看完這條請忽略前面文件裡「$0.07」的說法。
  餘額 $2.956（本日累計從 $4.24 花到剩下這些）。
- **觀察**：內建模板的步幅一如既往偏小（為小尺寸角色調的）；動作、背上大劍位置都正確。

---

## 2026-10-13：狂戰士斧頭 v4 —— 用「原本那把斧頭的像素」重做（使用者指定，不換設計）

使用者指示：「不合格重來」→ 選項 1「斧頭造型跑掉了，我要用你原本那把斧頭的像素去做」。

- **關鍵**：v3 用物件管線生出來的是一把**別的**斧頭（雙刃、花俏）—— 使用者要的是**原本那把**
  （單片大彎刃＋頂尖＋深色木柄）。所以自己把原本的像素拼成一把「主斧頭」：
  1. 從 `03523299` 的**正面圖**用多邊形切出斧刃（那塊背景是透明的，切得乾淨；刃右側跟肩膀/頭髮重疊約 20% 用手工多邊形避開）。
  2. 木柄：用背面圖沿手中線取樣的同一組色（`#2b1525` / `#3f2331` / `#604c55`）程式繪製，柄尾加金屬蓋。
  3. 鏡射成背面視角朝向（刃在右上、柄往左下）→ `_axe-master-clean.png`（清掉小碎塊）。
- **逐視角變形**：橫向壓縮 cos(θ) —— 正面／背面 1.0、四個斜向 0.71、左右側 0.18（只留薄邊）。
  正面那五個方向：斧頭畫在**身體後面**（只露肩上那截）；背面三個方向：貼在**背上**。
  定位用「斧刃上半部質心」對到預定點（比 bbox 中心準）。
- **成果**：`output/pixellab-incoming/_bers-final8/`、GIF `berserker-v4-rotate.gif`；
  已匯入帳號 **`86bf4c33`（berserker-backaxe-v4）**；桌面 `pixellab-正面素材/狂戰士-8方向-v4-原設計斧頭-86bf4c33/`。已傳 TG。
- **成本**：這一輪自己合成（$0）；前面誤試的對象管線斧頭（不是同一把）共 $0.15（不要再用）。
- **限制**：主斧頭是「一張平面圖」的幾何變形（物理上正確——那真的是一塊平板），不是重新繪製；
  柄是程式畫的（顏色取自原圖），不是原本的像素。要連柄都像素級相同，得先把背面圖的柄連同斗篷一起乾淨抽出來。
- **還沒做**：這隻還沒有動畫（走路 8 方向約 $0.07）。

---

## 2026-10-13：狂戰士斧頭 v3 —— 改用 PixelLab 物件管線（真正的 3D 道具）

使用者指示：「不行不能接受，回去 pixelab，繼續優化」（否決前面的手動壓縮版）。

- **關鍵頓悟**：之前一直在「叫角色模型畫對斧頭的透視」—— 那本來就不是它擅長的。
  改用 `POST /v2/create-8-direction-object`（道具用的 Pro 管線）：斧頭當成**獨立物件**生，
  它天生就是同一個 3D 物體轉 8 個角度 —— 側面自然就變成薄的 edge-on ✓（這是前幾版做不到的）。
  - 參數：`description` ＋ `style_image`（拿正面那支斧頭的像素當風格參考，60×60）。
    注意：`size` 不能跟 `reference_image`／`style_image` 同時給（422），也喠 `no_background`（extra_forbidden）。
  - 產出 object_id `3c07d760`、68×68、8 方向、$0.075、約 2.5 分鐘。→ `output/pixellab-incoming/_axe-object/`。
- **合成**：斧頭旋轉 ±35°（背面視角頭朝右上、正面視角因左右鏡射而朝左上）→ 縮放 1.15～1.3 →
  用「**斧刃上半部質心**」當錨點定位（靠 bbox 比例會錯，要算實際質心）。
  圖層順序：正面那五個方向斧頭在**身體後面**（先貼斧頭再貼身體）、背面三個方向在**背上**（身體再貼斧頭）。
  需要 7 張乾淨底圖（沒有武器的身體）；north／north-west 這次用「只遮斧頭、避開頭部」的遮罩才乾淨（$0.018）。
- **成果**：`output/pixellab-incoming/_bers-final7/`；GIF `berserker-3d-v3-rotate.gif`；
  已匯入帳號 **`cf464531`（berserker-backaxe-3d-v3）**；桌面 `pixellab-正面素材/狂戰士-8方向-3D-v3-物件斧頭-cf464531/`。已傳 TG。
- **成本**：$0.075（物件）＋ $0.018（2 張乾淨底）＋ $0.009（匯入）≈ **$0.10**；餘額 $3.604。
- **教訓**：要「真實物體的視角變化」就找**專門生道具的那條管線**，不要用角色模型硬碰；
  多擠的細節（斧刀花紋、木柄）物件管線自己就處理得很好。
- **還沒做**：這隻還沒有動畫（走路 8 方向約 $0.07）。

---

## 2026-10-13：狂戰士斧頭 v2 —— 從「等比縮小」改成「橫向壓縮 cos(θ)」（使用者指定回 PixelLab）

使用者指示：「不行不能接受，回去 pixelab，繼續優化」（否決 l0veyou 版）。

- **診斷**：上一版四個斜向的斧頭是「同一張平面圖等比縮小貼上」—— 真實剛體轉動時斧面應該是**變薄**（沿著背平面的橫軸壓縮），不是整體變小。
- **做法**：θ 以「背面視角」為 0°，壓縮倍率＝|cos θ|：
  正面／背面 1.0、斜向 0.71、側面接近 0（留一點厚度）；cos θ < 0 的（正面那四個）要左右鏡射。
  模型在 3 個方向（右前／左前／右後）會把武器**整支刪掉**——連 partial mask（只遮斧刀外側）也一樣，
  所以這幾個改成「拿正面那支斧頭橫向壓縮 0.75 倍貼上」（像素仍是同一套畫風，只是幾何變形）。
  右後則用 inpaint 多跑 seed（101/202/303）挑到會畫窄斧頭的那版（seed 202）。
- **成果**：`output/pixellab-incoming/_bers-final2/`；旋轉 GIF `berserker-3d-v2-rotate.gif`；
  已匯入帳號 **`3259e515`（berserker-backaxe-3d-v2）**；桌面 `pixellab-正面素材/狂戰士-8方向-3D-v2-3259e515/`。已傳 TG。
- **成本**：這一輪約 **$0.128**（3 張乾淨底 $0.031、6 次多 seed inpaint $0.063、3 次 partial mask $0.024、匯入 $0.009）；
  餘額 $3.697。
- **經驗**：① 要量「真實物體的視角變化」就用 cos(θ) 壓縮，不是縮圖。
  ② inpaint 對「擬在肩上的武器」很敏感，多跑 seed 或只遮一部分都是可行的控制手段。
  ③ 想把斧頭單獨抽出來（diff / 多边形 / 顏色分割）都不幹淨 —— 它跟身體黏在一起；要真 3D 就得走 `create-8-direction-object`。
- **還沒做**：這隻還沒有動畫（走路 8 方向約 $0.07）。

---

## 2026-10-13：狂戰士 8 方向改用 l0veyou 整隻重畫（使用者指定）

使用者指示：「斧頭樣子不對，用 loveyou 試試，整隻重畫八方向」。

- **做法**：`REF=<正面圖> node pipeline/scripts/l0veyou/generate.mjs <prompt> <out> shots 1:1`，
  8 個方向各生一張（每次都吃同一張正面圖當參考保身分），prompt 逐方向寫死「從這個角度斧頭該長什麼樣」
  （側面＝edge-on 只剩一條、斜向＝縮短、正／背面＝最寬）。
  提示詞：`output/l0veyou/berserk8/prompt-<dir>.txt`；原圖（1024²／1254²，洋紅底）：`output/l0veyou/berserk8/`。
- **踩到的坑**：① `图片生成超时,请稍后重试`（舊文件講的 2/3 失敗率）—— west 第一次逾時，重跑就好。
  ② **模型會偷改尺度**：south-east 第一版整隻放大到滿格，prompt 加「keep exactly the same character size and framing
  as the attached reference」才拉回來。 ③ 加了「保持同套裝甲／配色／風格」之後仍然會漂（south-east 偏 Q 版粗線、
  south 偏瘦長）—— 要完全一致得逐張重跑到順為止。
- **後處理**（`output/l0veyou/berserk8/norm2/`）：洋紅去背（容差含 JPEG 邊）→ 取 bbox → 統一縮到角色高 136 px →
  置中貼在 160×160 畫布（腳底距底 8）。
- **成果**：斧頭在 8 個視角都有正確的形狀變化（比 PixelLab 那版更像同一件剛體）；
  但畫風比遊戲現有精靈細緻很多（約 1024² 級細節壓到 160），風格要不要採用要使用者決定。
  旋轉 GIF：`berserker-l0veyou-rotate.gif`；桌面 `pixellab-正面素材/狂戰士-8方向-l0veyou版/`。已傳 TG。
- **成本**：l0veyou 是網頁訂閱（不喫 PixelLab 餘額），只有時間成本（每張 35–120 秒）。

---

## 2026-10-13：狂戰士背上斧頭改成「真實物體的 3D 形狀」（逐方向 inpaint）

使用者指示：「武器方向對但樣子不對，要模擬真實物體不同視角看過去的形狀」（續：「也可以試試用 l0veyou…」）。

- **問題**：8 個方向的斧頭都畫成「斧面正對鏡頭」的平板 —— 側面看也是一大片，不像同一個剛體。
- **試過但不理想**：拿「背面圖（整支斧頭都看得到）」去跑 `POST /v2/generate-8-rotations-v3`
  （因為側面參考圖看不到斧頭的 3D 形狀，模型每個角度自己編）。回來的 8 張裡只有 2 張是側面
  （而且正好是對的——斧頭變成薄片），其他仍是背面翻來翻去 → 不成一套。
- **最後採用：逐方向 `POST /v2/inpaint`**（128×128 ＝ 1 次生成 ≈ $0.008／方向）：
  把斧頭那塊圈起來，提示詞寫「從這個角度看斧頭是什麼形狀」（例：側面 = edge-on 只剩一條薄片），
  並附 `color_image`＝原圖鎖色盤（不然模型會把金髮畫成飽和亮黃）。
  - 側面、斜向 5 個方向重畫成功；**正面與背面本來就對，不動**。
  - 模型在 3 個方向（右前／左前／右後）直接把斧頭**刪掉** → 改用「乾淨底 + 把隔壁方向的斧頭像素搬過來」
    （右後＝不鏡射 north-west 的斧頭；右前＝south 的斧頭縮 0.85；左前＝縮 0.5 貼遠側）。
  - 左後的斧頭（頭在畫面右）＝與 north 同一側 ✓，先前鏡射版是錯的。
- **成果**：側面 edge-on 薄片、斜向縮短、正／背面最寬、斧刃始終在右肩那一側。
  已用 `create-character-v3` 的 **匯入模式**（reference_image= south ＋ direction_images 7 個方向，
  「cover every one → import」）存成新角色 **`cff01fe8`（berserker-backaxe-3d）** ≈ $0.0097。
- **成本**：這一輪約 **$0.15**（rotation 試作 $0.035 ＋ 8 次 inpaint 約 $0.09 ＋ 零碎重試 ＋ 匯入 $0.0097）；
  餘額 $3.815。
- **檔案**：桌面 `pixellab-正面素材/狂戰士-8方向-3D修正-cff01fe8/`（8 張＋總表）、
  repo `output/pixellab-incoming/_bers-final/`、`_inpaint-test/`（每次的遮罩與成品）、
  `berserker-rotate8.gif`（轉一圈）、`_bers-3d-v3.png`（前後對照）。已傳 TG。
- **沒用 l0veyou 的原因**：l0veyou 是「整張重新生」，每換一個方向角色都會漂；inpaint 只動斧頭那塊，
  角色像素原封不動。若之後要「整隻重畫」再走 l0veyou。
- **還沒做**：這隻還沒有任何動畫（走路 8 方向約 $0.07）。

---

## 2026-10-13（凌晨）：狂戰士背上武器修正（重跑 8 方向）＋ 牧師／狂戰士正面抓下來

使用者指示：「把狂戰士生成八方向，要確保背上武器都在正確位置」。

- **使用者在 PixelLab 網站自己建的兩隻**（prompt 都是「八個方向都要維持原本參考圖模樣」、view=low top-down、128）：
  `1fd30672`（state「做牧師職業外型」）、`03523299`（state「做狂戰士職業外型」）。
  兩隻都只有 **8 方向站姿、沒有任何動畫**。正面（＝`rotation_south`）已抓到桌面 `pixellab-正面素材/`。
- **原狂戰士的問題**：`north-east` 跟 `west` 的斧頭**整支不見**，其他方向斧刀左右跳。
- **修法**：拿那張正確的正面當 `reference_image` 重跑 `create-character-v3`（8 方向、128、low top-down、
  mannequin、`direction_images` 沒用），提示詞把配件寫死：
  > a huge double-headed battle axe is strapped **diagonally across his BACK**: the axe head rises above his
  > **RIGHT** shoulder（正面看會落在畫面左邊）, the long handle runs down across his back towards his left hip.
  > The axe is **never held in his hands** and **never placed in front of his body**.
  → 新角色 `77939420`（`berserker-backaxe`）：**8 方向斧頭都在背上同一側、沒有消失的**。
- **成本**：重跑一組 8 方向 **$0.0285**（餘額 $3.9647）；原本那隻 `03523299` 沒動。
- **檔案**：桌面 `pixellab-正面素材/`（牧師正面、狂戰士正面新舊、狂戰士 8 方向新版資料夾＋總表）、
  repo `output/pixellab-incoming/_grab/`（舊）與 `_grab-fix/`（新）、對照圖 `_bers-old-vs-new.png`。已傳 TG。
- **教訓（寫進 pixellab.md）**：不對稱配件（背上的武器）是旋轉最容易跑掉的東西；
  與其重跑全部，可以先自己審一遍 8 方向、用 `direction_images` 把畫對的鎖住、只重生錯的那幾向（便宜很多）。
- **還沒做**：兩隻都還沒走路動畫（8 方向走路約 $0.07）。

---


使用者指示：「把遊戲內所有 pixelab 的素材 fps 調快讓他跟 pixelab 網站上看到的速度一樣」。

- **先量網站**：Character Creator 頁的動畫 canvas 每 8ms 抽一次 `toDataURL()` 比對 →
  **固定 8 fps（125ms／格）**。遊戲這邊原本是「看移動距離」（走路列帶 `cycle: 85`），
  所以慢的角色動畫跟著慢：街上 NPC（~0.8 單位/秒）只有 **2.6 格/秒**，獵人（2.4–3.0）剛好 7.8–9.7。
- **改法**：6 張 PixelLab 來源 sheet（ranger／sorcerer／paladin／assassin／basebody／basebody-armour）
  的 5 條走路列改成 `frameTime: 0.125` ＋ **拿掉 `cycle`**（引擎就會走時間驅動）；
  `build_class_sheet.py`／`add_battle_rows.py` 同步改，日後重生不會又長回 cycle。
  舊值備份 `output/pixellab-incoming/_backup-walkfps/*.json.bak`（要退就把 .bak 蓋回去＋`npm run build`）。
- **驗收**：`_walkfps3.mjs`（暫停遊戲、自己推角色、讀 `__mistvaleFacing()` 實際畫出的格）→
  0.8 與 2.4 單位/秒都是 **8 格/秒**（改前 0.8 只有 2.6）；`npm test` 全過；
  `check_anim` 閃格 0、走路跳格 0、受擊 127/127；`check_facing` heroWalkBad 0、heroAnimBad 0。
  對照 GIF `walkfps-compare-{slow,fast}.gif` 已傳 TG。
- **代價**：慢走時腿會比地面快一點（軽微滑步）——這正是網站預覽的樣子（不移動也在跑 8 fps）。
  原本的 `cycle` 就是為了不滑步才校准的，這次把「感覺」優先於「貼地」（使用者指定）。
- **還沒做**：非 PixelLab 的舊職業（archer／berserker／witchhunter／darkknight／priest）仍是距離驅動，
  要一致就同法处理（Pixellab.md 有步驟）；要退回就還原備份。

---

## 2026-10-12（下午）：狂戰士走路動畫實驗（PixelLab 内建模板模式）＋ 真實計價實測

使用者指示：「用便宜模式生成狂戰士走路動畫傳 tg 給我看成果」。

- **狂戰士在 PixelLab 帳號裡本來沒有角色**，所以流程是兩段：
  ① 拿遊戲現有的狂戰士 **正面圖**（`assets/heroes/berserker.png` 的 `idleDown` 第 1 格，100×100）
  置中貼進 128 畫布當參考圖 → `create-character-v3`（8 方向、low top-down、128）→
  character_id **`a994d80e-614e-45ba-8146-e9fc3fe9bafe`**（名字 `berserker-trial`，3 分 30 秒）。
  ② `animate-character --template walking-8-frames`（＝我上一則講的「便宜模式」：1 generation／方向），
  先單獨跑 south 驗貨，再一次送剩下 7 個方向（2 分 11 秒）。
- **真實花費（餘額差額實測）**：建角色 **$0.0365**、8 方向走路 **$0.0678**（≈$0.0085／方向）→ **合計 $0.104**。
  官方定價頁對 template 128×128 寫「$0.0956／方向」—— **實際約 1/11**。定價頁的 USD 數字只能當上限級估計。
- **量價格的坑**：`GET /v2/balance` 的美元餘額是**延遲入帳**。我第一次在呼叫後 25 秒去查，餘額完全沒動，
  就誤報了「8 方向走路 $0.0216 / 整批 $0.058」給使用者（已發更正）。**要量就等 1–2 分鐘再查。**
- **成品**：`output/pixellab-incoming/berserker-trial/`＋`berserker-walk-8dir.gif`（8 方向並排走）、
  `berserker-walk-8dir-sheet.png`、`berserker-walk-south-x3.gif`、`berserker-compare-now-vs-new.png`。
  已用 Bot API（`sendAnimation` 讓 GIF 在手機直接播）送到使用者的 TG。
- **品質觀察**：内建模板的**步幅偏小**（官方模板是為小尺寸角色調的），跟 10-10 戰士那次同一個結論；
  但角色身分（棕髮／皮甲／紅腰帶／大斧頭）在 8 方向都保住了，2:1 像素也乾淨。
  帳號餘額：$4.138（這次實驗前 $4.2425）。
- **還沒接進遊戲**：要接就把 `berserker-trial/` 丢 `build_class_sheet.py --name berserker`（
  attack／skill 目前只有舊 Q 版列）；要不要再用 v3 模式重跑一次做步幅對照，等使用者決定。

---

## 2026-10-12：弓手（ranger）補抓 PixelLab 缺的 north／east，走路 8 方向到齊

使用者指示：「找出已做好的角色 pixelab、找弓手、把上次抓取缺少的方向動畫下載補齊」。

- **弓手是哪一隻**：PixelLab 帳號 17 個角色裡跟「弓手」有關的只有 `788cd873`（斗篷弓手）→ 遊戲的 `ranger` 遊俠。
  `archer` 弓箭手沒有 PixelLab 版（維持原本 Q 版 sheet）；其他四隻（`3d3020ce` 刺客、`5955ea9f` 法師、
  `d06dcc3a` 聖騎士、`2b73579c`）**8 方向都齊**，只有弓手缺。
- **上次抓缺什麼**：10/11 抓的時候帳號裡只有 6 個走路方向 —— 缺 `north`（背面）跟 `east`（側面）。
  當時的補法是「east 用 west 鏡像、walkUp 用 l0veyou 生」。這次發現那兩支**後來已經生出來了**
  （north／east 的檔案時間戳比 west 晚約 20 小時），所以直接抓回來。
- **補了 32 張**（兩個抓取位置都補）：`output/pixellab-incoming/788cd873/animations/Walking/{north,east}/frame_000..007.png`
  與 `output/archer-demo/pixellab/pixelab-characters/八個方向都要維持原本參考圖模樣_788cd873/v3-walking-{north,east}/frame-00..07.png`。
  新素材 8 格／180×180／身高 121–128 px（其他方向 114–133）、色數 56–60，身分正確（north 是背面、
  east ≠ west 的鏡像，IoU 僅 0.57 → 真的是另一支生成，不是重複貼上）。
- **重跑 sheet**：`build_class_sheet.py --source output/pixellab-incoming/788cd873 --name ranger` →
  `add_battle_rows.py` 把 attack／skill 補回（l0veyou 原圖不變）。走路列的 8 方向全部來自 PixelLab。
  舊版備份：`output/archer-demo/pixellab/_backup/ranger-old.{png,json}`。
- **新舊逐列比對**：`idle`／`idleDown`／`idleUp`／`walkDown`／`walkDownRight`／`walkUpRight`／`hurt`／
  `victory`／`death` 位元完全相同；只有 `walk`（west 鏡像 → 真的 east）與 `walkUp`（l0veyou → 真的 north）換掉。
  `walk` 對舊列 IoU 0.69、對自己的鏡像 0.51 → 朝向沒被改到。attack／skill 遮罩相同（IoU 1.00），
  只是色盤由 162 色變 199 色而重新映射。heroHeight 67、footFromBottom 8、13 列——遊戲格式沒變。
- **驗收**：`npm test` 全過；`audit_hero_sheet.py ranger` 的 FAIL 項目與舊版**一字不差**（都是 PixelLab 系匯入
  職業共同的既有問題：色數 > 16、idle 只有 1 格、缺 idleLeft，不是這次造成的）；
  `check_facing`（60 s）heroWalk **6566 筆 0 誤**、heroAnimBad 0、heroCombatBad 2（舊版 3，持平）；
  `check_anim` 閃格 **0**、走路跳格 **0**、受擊回饋 126/126。
  實機 8 方向特寫對照表：`output/pixellab-incoming/ranger-8dir-ingame.png`（上面一排遊侠、下面一排魔法師
  —— 同一欄兩隻朝同一個方向）、側面放大 3 倍：`ranger-side-zoom.png`。
- **踩到的坑**：現在的 `src/pixel-index.html` 沒有 `#start-button`，`check_facing`／`check_anim` 直接跑會
  停在 `page.click: Timeout`。解法（與判讀注意事項）寫在 [`pixellab.md`](pixellab.md) 末節：複製建置檔、
  注入一個畫面內的隱形按鈕，再用 `HTML=` 指過去。

---

## 2026-10-11（凌晨）：四個 PixelLab 職業補完運動作（attack／skill／walkUp）＋ 畫質回恢

使用者指示：「四個職業套用 PixelLab 八方位走路圖，列出還缺哪些動作，用 l0veyou 生＋後製；
其他沒新素材的職業維持原樣；牧師改回原本樣子；**素材畫質不能降低，遊戲內要維持原畫質**」。

- **畫質回恢（重要）**：前一版我把 PixelLab 素材壓到 24 色（來源 ~35 色）—— 那是降級。
  `build_class_sheet.py` 現在預設 `--colors 0` = **不量化、原色全留**（360／226／162／198 色）。
  2:1 降採樣是**整數抽取**（不內插、不改顏色），那是把 2 倍放大圖取回**原生像素**，不是降級；
  保留 2 倍反而讓遊戲在高縮放下看不清楚（畫面比原像素小一半，最近鄰抽樣會掉像素）。
- **動作列補完**：新增 [`add_battle_rows.py`](../scripts/pixellab/add_battle_rows.py) —— 不重跑 `build_hero.py`
  （那會把 PixelLab 的原生像素換掉），只把新的一列接在 sheet 最下面。去背／切格沿用 `build_hero.cut`，
  縮到跟本體同高 → alpha 二值化 → **映射到這隻角色自己的色盤** → 中軸／地面線對齊。
- **補了什麼**（四個職業各缺 2–3 列，現都 13 列完整）：
  - `attack`／`skill`：sorcerer（杖砸、流星火球）、paladin（劍劈、聖光柱）、ranger（拉弓射、穿心箭）、
    assassin（匕首連刺、暗影衝刺）—— 8 格 4×2，l0veyou 生、`release 4 / impact 5 / frameTime 0.075` 沿用舊規格。
  - `walkUp`：ranger 的 PixelLab 滙出只有 6 方向（缺 east／north），east 用 west 鏡像補、
    north（背面）用 l0veyou 生（身分寫死＋逐格描述兩腳交替）。
- **踩到的坑**：
  1. **l0veyou 大約 2/3 機率回「图片生成失败，请稍后重试」**（連一顆蘋果都失敗）→ 重試迴圈（最多 5 次）就過得去。
  2. **參考圖只保住畫風、保不住細節**：第一版我寫「尖嬽巫師帽」，生成每格都戴帽，
     但 PixelLab 的魔法師是**金髮沒帽** → 待機與攻擊一換就不同人。改正提示詞重生才對。
  3. **背面走路最難生**：1×8 那版只給 6 格、角色還變成別人的白抜風；改 4×2＋身分寫死才對。
- **其他**：`priest` 依指示還原成原本的 sheet（`output/archer-demo/pixellab/priest-backup.*`）；
  `archer`／`berserker`／`witchhunter`／`darkknight` 不動。
- **驗收**：`npm test` 全過；`check_facing` 0 誤（heroWalk 1877、heroCombat 1121）；`check_anim` 閃格 0、
  走路跳格 0；實機打一场確認攻擊列真的在播（`output/pixellab-incoming/atk-*.png`、`combat-*.png`）。
  四張圖總覽：`output/pixellab-incoming/four-classes-sheets.png`。
- **還差**：這四隻的 attack／skill 是 l0veyou 生的，跟 PixelLab 的手感仍有差（輪廓、陰影習慣）；
  要更一致就是慢慢把 attack 也用 PixelLab 的動畫重生，或統一走 l0veyou。

## 2026-10-11（深夜）：PixelLab 角色取代職業（魔法師／聖騎士／遊俠）

使用者把 Downloads 裡 6 個 PixelLab 匯出 zip 丢進來，指示「都做進遊戲內取代各職業」。

- **新管線工具** `pipeline/scripts/pixellab/build_class_sheet.py`（說明寫在 [`pixellab.md`](pixellab.md) §5）：
  zip（`rotations/` 8 方向站姿 + `animations/Walking/<方向>/frame_*.png`）→ 遊戲英雄 sheet。
  一行：`python pipeline/scripts/pixellab/build_class_sheet.py --source output/pixellab-incoming/<id> --name <職業>`
- **職業對照**：`5955ea9f`→**sorcerer**、`d06dcc3a`→**paladin**、`788cd873`→**ranger**（滙入）；
  `3d3020ce` 是刺客（之前已進）；`witchhunter-east.zip` **未採用**（只有 4 方向待機、沒有走路）；
  `assets_2026-10-11.zip` 是同一隻弓手的走路條圖。**berserker／archer 沒有素材**，維持原樣。
- **關鍵決定**：
  - 24 色不是 16 —— 來源有 ~35 色，壓到 16 會把劍刃與金屬反光吃掉。
  - hurt／victory／death **確定性合成**（倒下＝以腳底為軸旋轉），不是假裝的生成動畫。
  - ranger 的匯出缺 east／north 兩個走路方向：east 用 west 鏡像補（遊戲左半邊本來就是鏡像），north 缺就缺。
- **重要修繕：動作列退回機制**。PixelLab 沒有 attack／skill 動畫，而 `sheetPose()`／`sheetFrame()`
  以前是直接取 `meta.actions[act]` —— 少一列不只該動作不播，是**整隻不畫**（`sheetFrame` 回 null）。
  新增 `actRow()`／`actOf()`：完全同名 → 去掉方向字尾 → 同方向待機 → 待機 → 走路 → 表上第一列，
  並在 `sheetPose`／`drawSheetHero`／配件錯點全部改用解析後的列名。以後任何「只有一部分動作」的素材都不會再讓人消失。
- **驗收**：`npm test` 全過；`check_facing` 0 錯（hero walk 1448、combat 460 誤）；`check_anim` 閃格 0、走路跳格 0；
  實機打一场 25 秒（5 位獵人出征、19 隻魔物存活）**0 個 pageerror**；各職業特寫 `output/pixellab-incoming/one-*.png`、
  並排 `one-strip.png`。`audit_hero_sheet` 對新三隻 FAIL——因為它拿舊規格比（16 色、高 72、要 attack／skill），
  高度 62–63、沒有攻擊列就是差在那裡，跟更早的 assassin／basebody 同一回事。
- **代價（照實記）**：這三職業目前**沒有攻擊／技能動畫**（打擊時站著，靠命中特效與白閃），
  也沒有 outfit 換色群組（paladin／ranger 的色相篩選篩不到布料色→ 稀有度不會換衣服顏色）。

## 2026-10-11（晚）：裝備零件層（開羅式 body + parts）實機落地

- **做了什麼**：照 [`kairo-reference.md`](kairo-reference.md) 的架構做第一組零件層 ——
  身體一張表、裝備一張表，**共用同一個座標系逐格疊起來**。換裝備＝只換零件表，身體完全不重生。
  - 產生器：`output/archer-demo/pixellab/build_parts_sheet.py`（PixelLab 身體模板 + transfer-outfit 穿上版 →
    逐格差異抽成裝備層 → 兩張 800×600／格 100 的表）
  - 產物：`assets/heroes/basebody.{png,json}`（kind:`body`，meta 帶 `parts:[{id:'armour',sheet:'basebody-armour',order:2}]`）
    與 `assets/heroes/basebody-armour.{png,json}`（kind:`part`）。來源 2 倍放大圖 → 整數 2:1 降採樣、16 色共用色盤。
  - 執行期：`pixel-world.js` `drawSheetHero()` 在畫完身體後，依 `meta.parts` 疊上零件；
    支援對稱鏡像與逐格 `offset[frame]`（現在全是 0，因為兩張表用同一個水平基準）。
  - 開關：設定頁「裝備零件層」按鈕（`toggleParts`）→ `setPartsVisible()`；`getPartsVisible()` 可查。
- **驗收（真的動過畫面，不是看圖說故事）**：`output/assassin-check/`
  - 擺 3 個 basebody 在廣場 → 匯出畫布比較：**ON vs OFF 差 7898 px**（騎士 vs 光身體），
    **ON vs ON2 只差 145 px**（切回來跟原本一模一樣 → 證明是「同一個身體、只有零件不同」，不是重生）。
  - 圖：`live-ON.png / live-OFF.png / live-ON2.png`、並排 `live-strip.png`；街上展示 NPC 的 `showcase-*.png`。
- **修掉的三個毛病**：
  1. **零件表 idle 只畫了第 0 格，卻宣告 8 格** → 待機動畫輪到 1–7 格時整個角色是**隱形的**（佔 7/8 的時間）。
     就是這個 bug 讓前一輪「擺好的角色怎麼拍都拍不到」。`build_parts_sheet.py` 改成 `frames: len(row)` 並重生表。
  2. 街上「戰士展示」NPC 的 `cls:'warrior'` **根本沒有這張表**（heroSheets 只有 archer/assassin/basebody/…）→ 它從來沒被畫出來。改指 `basebody`。
  3. `pixel-game.js` 的流浪英雄物件有**重複的 `speed` 鍵**（esbuild 會警告）。已移除前一個。
- **除錯工具（都是 opt-in，不影響正式執行）**：`globalThis.__mistvaleNpcLog=[…]` 可記錄每個 NPC 這格有沒有進繪製分支、畫在哪；
  `__mistvaleDecorations`（場景裝飾快照）、`spawnVillager(cls)`／`spawnClassVillagers()`／`setPartsVisible()`。
- ⚠️ **驗收腳本大坑**：用 Playwright `page.screenshot()` 拍**背景分頁**時，Chrome 常常回一張**舊的合成畫面**
  （canvas 已經重畫，截圖還是舊的；`toDataURL` 和 drawImage 讀 canvas 也一樣會讀到舊的）。
  症狀是「程式記錄明明有畫，圖上就是沒有」。可靠做法：截圖前 `bringToFront()` ＋在 DOM 動一下東西（或疊一層 canvas）強制重合成。
  這一坑花掉的時間比寫功能多，先記在這裡。
- **還不是完整角色**：basebody 目前只有 `idle`(1 格) ＋ 四方向走路(8 格)，沒有 attack／skill／hurt／death／victory 列，
  所以 `audit_hero_sheet.py` 對它（和更早的 assassin）判 FAIL —— 那是**規格表要求的完整動作集**，不是零件層壞掉；
  身高 61–63 px 也還不到舊規格的 72。下一步是補戰鬥列、做第二套裝備零件表（證明換裝真的只換那張表）。

## 2026-10-10：PixelLab v2（純文字建角色、v3 走路）＋ Retro Diffusion（新來源）

- **PixelLab v2 = MCP 背後那套**（官方 MCP server 打的就是 `api.pixellab.ai/v2`）。v1 沒有的東西都在 v2：
  `create-character-v3`（一張圖或**純文字** → 4/8 方向角色）、`animate-character`（内建動作模板／v3／pixminimax）、
  `animate-with-skeleton-v3`（一幀一骨架 ＋ `template_id` 内建骨架）。
- **純文字建角色實測**（`warrior-text-v1`）：只給文字描述、不給任何參考圖 → 8 方向一致、5–6 頭身（非 Q 版）、
  服裝細節到位。成本 3 次生成（1 Pixen ＋ 2 v3）。**沒給參考圖時 `n_directions` 必須 8**，給 4 會 422。
- **走路模式實測**：`mode=template`（内建 `walking-8-frames`）步幅很小、角色變小；
  **`mode=v3`（不給 template，用文字描述動作）明顯好得多** —— 獵魔人 8 格 256 px 腿真的在動。
- **Retro Diffusion 加入**：新帳號送 $0.50，`rd_advanced_animation__walking` 丟一張現成像素圖就生 8 格
  （$0.14/次、約 2 分鐘、**14 色原生色盤完整保留**、8 格高度只差 1 px）。官方三鐵則：送原生尺寸、四周留白、中性站姿。
  獵魔人的圖是 4 倍放大（400×400 → 原生 100×100、角色 72 px），降到原生再送。
- **文件**：[`pipeline/pixellab.md`](pixellab.md)、[`pipeline/retrodiffusion.md`](retrodiffusion.md)；
  客戶端 `pipeline/scripts/pixellab/{pl_client.py,v2_client.py}`、`pipeline/scripts/retrodiffusion/rd_client.py`。
  token 都放 repo 外（`.pixellab-token`、`.retrodiffusion-token`，已列 .gitignore）。

## 2026-10-11：遊戲端（刺客進村、8 方向、派遣出征）＋ 開羅動畫架構筆記

- **刺客進遊戲**：把 PixelLab 匯出的走路素材（`3d3020ce`，8 方向）轉成遊戲英雄 sheet。
  **關鍵教訓：來源圖是 2 倍放大**（連續同色長度最常見 = 2），所以要用**整數 2:1 降採樣**，
  不能用 LANCZOS —— 後者會產生中間色與柔邊（毛邊），量化救不回來。
  轉檔腳本 `output/archer-demo/pixellab/build_assassin_sheet.py`；輸出 `assets/heroes/assassin.{png,json}`。
- **牧師換素材**：牧師不是玩家職業（只是街上 NPC），但舊 sheet 有戰鬥列，所以做**合併**
  （走動列＝刺客素材、戰鬥列沿用舊牧師）→ `merge_priest_sheet.py`，原檔備份在 `output/archer-demo/pixellab/priest-backup.*`。
- **8 方向機制**：`moveDir()` 從三分法改成 8 個 45° 扇區；新增 `dirSuffix()`（對角 → 上下 → 側面的自動退回，
  舊素材不用改）。左半邊方向用**程式鏡像**，不用多存一倍的列。
- **遊戲設定頁新增按鈕**：`新增所有職業`（把各職業角色叫進村莊街道漫遊，實測 23→32 位）、
  `派遣出征`（不用開世界地圖就把全部獵人派去目前區域打怪）、`巡視流浪英雄`（鏡頭依序帶到每位流浪英雄）。
- **流浪英雄**：本來就會在野外自己打怪（實測 38 秒擊殺 7 隻），只是鏡頭看不到；
  另外把移動速度 ×1.8（`WANDER_SPEED`）—— 走路動畫是**依移動距離**推進，所以腿也會跟著變快。
  讀檔時要重算 speed，不然舊存檔會蓋掉新值。
- **開羅架構筆記**：讀完 `C:\Users\ray\pi-fleet\agent-01\work\kairo\` 的六份報告（開羅《冒險村物語2》逆向），
  寫成 [`pipeline/kairo-reference.md`](kairo-reference.md)：**6 零件（body/hand/hat/head/weapon/weaponeffect）
  各自播自己的動畫 + 逐格位移表 + 共用座標系**，所以新裝備只要做那個零件，不用整套重跑。
  並列出我們缺什麼（每個零件的逐格 offset、drawOrder）與建議路線。

## 2026-10-10：專案清理 —— 移除保底管線（forge ＋ sprite-gen）

使用者指示刪除（已執行）：

| 刪掉的 | 大小 | 能不能救回來 |
|---|---|---|
| `work/agent-sprite-forge/`（另一支 agent 的專案） | 177 MB | ✅ GitHub `0x0funky/agent-sprite-forge` 可重新 clone（刪前是乾淨的，0 個未 commit）|
| `pipeline/scripts/sprite-gen/`（4 支 integrate_*.py） | 44 KB | ✅ git 追蹤中，可從歷史拿回 |
| `pipeline/sprite-gen.md`（主管線文件） | 8 KB | ✅ git 追蹤中 |
| `output/warrior-l0veyou-forge/` | 140 MB | ❌ 未進 git |
| `output/warrior-forge-demo/` | 474 KB | ❌ 未進 git |
| `output/warrior-spritegen-row/` | 65 KB | ❌ 未進 git |

共釋出約 317 MB。**下面幾條早期紀錄裡提到的 `output/warrior-l0veyou-forge/` 路徑已經不存在了。**

- QC 用的 `sheet_qc.py` 還在（我們的脚本指的是 `C:\Users\ray\agent-sprite-forge\...`，那是另一份，沒刪）。
- `pipeline/README.md` 已更新（移除死連結、加上移除註記）。

## 2026-10-10：PixelLab 骨架動畫（戰士走路）—— 找到「不會換腳」的真正原因

- **路線**：使用者選了上網調查報告裡建議的 PixelLab skeleton animation（先 `estimate-skeleton` 抓骨架，再 `animate-with-skeleton` 照骨架生圖）。API 規格、成本、限制、腳本、重跑方式全部寫在 `output/archer-demo/pixellab/README.md`。
- **API 重點**：一次只吃**剛好 3 格**骨架（所以 8 格走路＝4 個重疊視窗接續）、圖只能 16/32/64/128/256 正方形、一次呼叫 1 generation（32–75 秒）、免費方案同時只能跑 1 個（429 要重試）、**免費總共只有 14 次**（不是定價頁寫的 40，用完回 402）、Tier 1 $12/月才在方案表裡列出 skeleton 動畫。
- **決定性發現**：**模型會照抄參考圖的姿勢，骨架只調幅度**。拿有跨步的 still 當參考時，送「遠腳誇張在前」的骨架它還是一樣畫近腳在前（量到近腳重心只差 0.6 px）；反過來送「雙腳併攏」的骨架，它給出乾淨的中性站姿。→ 流程必須兩段式：先請它做一張中性站姿當新參考圖，再用那張跑走路。
- **驗證換腳**：`pl-walk-02/`（中性參考）f4 的褲子明暗與 f0 相反（放大 9 倍的 `pants-zoom9.png`），代表遠腳真的跑到前面；`pl-walk-01/`（原參考）對照組則沒有。像素差的半週期比值：rig2 1.56、l0veyou AI 原始 0.62、PixelLab 原參考 0.51。
- **進度**：`pl-walk-01/`（原參考）8 格齊但不換腳；`pl-walk-02/`（中性參考，步幅 1.0）會換腳但動作太小；**`pl-walk-03/`（中性參考 + 骨架步幅 ×1.5）是收尾版** —— `final/` 已量化回 16 色、腳底對齊、去雜點。
- **收尾與驗收**：`finish_walk.py` 做 alpha 二值化 → 16 色盤 → 去雜點 → 對齊 → 跑 Forge `sheet_qc`。頭部比例、沒有重複格、相位覆蓋、地線全 pass；`leg_alternation` 仍 fail（Forge 用兩腳明暗推斷身分，這隻遠腳只暗一階 → 它判成多數格遠腳領先；目視 f2/f6 確實不同腳抬起）；`torso_drift` warn 5.3。
- **工具**：`pl_client.py`（token 放 repo 外 `C:\Users\ray\.pixellab-token`）、`walk_skeleton.py`（兩段式腿 IK，可調步幅/抬腳/複製某格）、`walk_cycle.py`（跳過已有視窗，可中斷續跑）、`finish_walk.py`、`review_frames.py`、`leg_analysis.py`／`which_leg.py`（**顏色分類不可靠，別當準則**）。
- **API 能生走路的功能全查完了**（含新測的三條）：`/animate-with-text` 只能 64×64、一次回 4 格且再叫一次回同一組；`/animate-with-skeleton` 就是這條線在用的；`/estimate-skeleton` 才是「內建骨架」—— 官方 doc 的 **Animation to Animation** 就是用它從既有動畫反推關節點。拿我們弓箭手（Q 版）當來源實測（`pl-walk-05/`）：**骨架會把來源角色的比例一起帶過來，戰士變 Q 版**，所以官方流程对不同身型反而多一個比例污染；自己按角色髖/膝/踝算的 `pl-walk-04/` 比例才是對的。對照圖 `transfer-compare-4.png`。
- **API v2 / MCP 全查完了**：官方 MCP server 就是打 `https://api.pixellab.ai/v2`（同一組 REST，用 REST 就好）。**内建走路模板在 v2**：`create-character-v3`（一張圖→4/8 方向）＋ `animate-character(template_animation_id='walking-8-frames')`＝**1 gen/方向**；模版有幾十種（walk/walking-2..10/running/cross-punch/backflip…）。另外 `animate-with-skeleton-v3` 有 `template_id`（mannequin/bear/cat/dog/horse/lion）＝真正的「内建骨架」。
- **v2 實測**（`v2/`）：側面 still → 4 方向都出來而且角色一致（但我們那張側面圖被當成 south，標籤偏 90°）；套內建走路模版會生，但**角色變小（109px）、筆觸變軟、步幅只有 34–39px（小碎步）** vs 我手算版本的 43–57px。工具 `v2_client.py`。
- **已收進 pipeline**：共用客戶端 `pipeline/scripts/pixellab/{pl_client.py,v2_client.py}`（v1／v2 兩套）＋完整說明 [`pipeline/pixellab.md`](pixellab.md)（五個介面的功能位置、端點表、成本、模板清單、七個踩過的坑、範例指令）。`output/archer-demo/pixellab/` 的實驗腳本改成從 pipeline 匯入；token 放 repo 外（`.pixellab-token` 已進 .gitignore）。
- **還沒做**：四方向、idle/attack 等其他動作、接進遊戲、換腳的自動驗收。

## 2026-10-09：戰士走路 v04

- `output/warrior-l0veyou-forge/demo.html` 現在啟用 `release-v04`，預設走路。v03 的逐列腿平移改為 `walk_joints.py` 固定骨長的兩節腿 + 完整靴筒轉角；步幅 ±12→±6 px，通過格離地 5 px，支撐腳每格後移 3 px，沒有重新生圖。
- `refined-v04/qa/motion.json` 11 項 PASS：頭部固定、前後腳交替、接地、連續性、固定骨長、離地等；骨長最大误差 0.0005 px、腳底最大跳移 4.113 px。新舊對照 `refined-v04/walk-compare.png`。
- Forge 像素 QA 22 格 PASS；Aseprite/Godot export PASS。通用 sheet_qc 的 near_duplicates 和通過格亮度判腿警告保留，獨立腿層軌跡檢查通過。正式遊戲未改。Forge walk metadata 寫 cadence 800 ms、stride_px_per_frame 3。

## 2026-10-09：弓手 Kaya — 影片式提示詞 vs 規格式，生圖精準度實測

- **分工**：`output/warrior-l0veyou-forge/` 是另一位 agent 的（戰士）；**弓手是我這條線**。
- **路線決定**：不用 grok 鏡像，用 **l0veyou 的 GPT Image 2**（`pipeline/scripts/l0veyou/generate.mjs`，CDP 9447，`REF=<圖>` 環境變數附參考圖，一次只附一張）。16:9，約 25–30 秒一張。
- **實測結果（走路 8 格，同一張參考圖，只換提示詞）**：

| 指標 | A 影片式 | B 規格式 |
|---|---|---|
| 格數 4×2 | **8** | 10 塊（弓／箭袋斷開） |
| 每格在格子內 | **8/8** | 9/10 |
| 格內身高差 | **2.65 %** | 29.31 % |
| 地線差（同列） | **1 px** | 6 px |
| 格內寬度差 | **4.7 %** | 87.2 % |
| 頭部比例 | **全部 1.000** | 0.969–1.031 |
| 半週期重複 IoU | 0.86/0.76/0.87/0.97 | 算不出 |
| 左右腳交替 | FAIL（兩半同腳） | FAIL（兩半同腳） |
| 真像素 ≤32 色 | FAIL 126,440 色 | FAIL 129,204 色 |

- **結論**：影片式提示詞在幾何一致性上大勝；但**步態相位仍然重複**（8 格只有半個週期）、**產出不是真像素**（抗鋸齒柔邊），這兩項提示詞擋不住，必須走後處理（下半週期鏡像／圖層位移 + pixelize/unfake）。
- **新工具（`output/archer-demo/`）**：`measure_sheet.py`（成品 sheet 的精準度量測：連通塊格數、格內身高／寬度／地線一致、色數；地線要按列算，4×2 兩列絕對 y 差一格高）、`slice_sheet.py`（依格切幀 + 呼叫 Forge `sheet_qc frames --cycle walk`）。
- **順手修好**：`pipeline/scripts/grok/grok-gen.mjs` 抓圖 bug —— 它只收 `data:image/` 且長度 ≥40k 的字串，但那是版面用的**雜訊底圖**；真正成品在 CDN `assets-d-…/generated/<uuid>/image.jpg`。已改成收 CDN URL + `naturalWidth` 過濾縮圖，等待迴圈改成「數量不再長才收工」（原本看到第一張就走，一次只抓到 1 張）。新增 `probe-media.mjs` 列頁面媒體來源。
- **產物**：`output/archer-demo/{prompts/walk-video.txt,prompts/walk-sheet.txt,run-walk-video/,run-walk-sheet/,precision-compare.json,compare-prompts.png,REPORT-prompt-precision.md}`。
- **還沒做**：接進 Forge（pixelize → 8 格 → 相位修正 → demo）、補 idle／attack 動作表。
- **（同日稍晚）兩個版本都做成可播放的**：`output/archer-demo/demo.html`（離線播放器，兩組提示詞 × 修好的／原樣共 4 個 clip，可並排對照）。管線：`build_walk.py`＝去背 → `unfake` 還原真像素（實測格距 3.9–4.2 px）→ 8 格共用 16 色盤 → 統一畫布／地線／水平置中 → `walk_fix` → Forge QC。
  - QC 結果：**影片式·修好的 = pass（零警告）**；影片式·原樣 = warn；規格式·修好的 = warn；規格式·原樣 = **fail**。
  - `walk_fix.py` 新增 `--leg-window`：整條下半身鏡像會把側背的**弓**翻到另一側（比步態問題更明顯），改成只鏡像角色中軸附近 0.50 倍體寬的腿部視窗；再加上「按腰線以上質心把每格對回同一中軸」消掉 torso_drift。
  - 照實記的限制：原樣版本就是左右腳不交替（8 格只有半週期）；修好的版本是鏡像下半週期的權宜做法，鏡像出來的腳尖方向仍是原方向（細看像月球漫步）。只有走路一個動作。
  - 工具：`build_demo.py`（打包 4 clip 成 demo.html）、`audit_demo.py`（無頭瀏覽器實際操作，1120×900 / 380×820 都過、console error 0）。
  - ⚠️ **動到共用檔**：`pipeline/scripts/sprites/walk_fix.py`（新增 `--leg-window`，預設 0 = 舊行為）—— 該檔是弓手這條線建的（untracked）。
- **（同日再後）原樣版本重做素材，走路姿勢修到會換腳**：關鍵在**排版不是修辭**。4×2 不管怎麼寫，模型都把第二列照抄第一列；改成**一橫列 8 格**（沒第二列可抄）+ 把「前腳＝畫面右邊那隻、第 5 格必須換成另一隻」寫死 → `run-walk-video3` 的 `leg_alternation` 由 fail 變 **pass（alternates）**、`near_duplicates` 也 pass。
  - 代價：8 格一排每格只 192 px 寬，角色變小，原生像素只有 **30×38**（格距 5.96）。試過盒縮 76 px 拉回尺寸，16 色量化在柔邊上起雜點反而糊掉 → 最後用原生 30×38，播放器放到 6–10 倍。
  - `demo.html` 現在是 3 組提示詞 × 2 種顯示 = **6 個 clip**：影片式 v3（1×8，原樣就會換腳）、影片式 v1（4×2）、規格式（4×2），每組可切「原樣／修好的」並可並排對照。
  - `build_walk.py` 新增 `--cols/--rows`（單列時改用 x 排序分配格子）與 `--mode box --height N`；`build-video3-box/` 是試過但未採用的紀錄。
  - 未修的：v3 原生只有 30×38（比遊戲 72 px 小一半）；規格式那張連格數都不對。
- **（同日再後）再加試 4 支提示詞（含一支寫得很完整的「嚴格規格」）——全部沒有比較好**：新指標 **半週期重複 IoU**（第 i 格 vs 第 i+4 格腰線以下輪廓的交／聯集，越低越有換腳）:v3 **0.45/0.66/0.44/0.48（pass）**、v4 嚴格規格 0.76/0.66/0.65/0.79（fail）、v5 嚴格規格+螢幕錨點 0.82/0.60/0.78/0.83（fail）、v3 重跑 0.82/0.60/0.54/0.85（fail）、v4 重跑 0.76/0.93/0.90/0.94、v1 4×2 0.84/0.97/0.94/0.84、B 規格式 0.81/0.42/0.84/0.87。
  - **教訓 1：規格越長、越強調「八格完全一致」，模型越把每格畫成同一張**，反而把相位差吃掉。
  - **教訓 2：換腳不是提示詞能穩定解決的** —— 一列 8 格試 5 次只過 1 次（約 20%）；同一支 v3 重跑就 fail。要穩定出貨只能「生幾張、用客觀指標挑最好的」或走確定性後處理。
  - **教訓 3：提示詞越長，角色身分越容易漂**（v3 重跑變紅髮、v4 重跑換頭帶、v5 換綠衣），短版每次都是對的。
  - 報告：`output/archer-demo/REPORT-prompt-rounds.md`；七輪並排 `qa/rounds-compare.png`、第 1 格特寫 `qa/frame00-probe.png`。
- **（同日再後）「只留腿」也不行，結論是連生多張挑最好的**：
  - `prompts/walk-video6.txt`＝只留排版＋一句身分＋逐格腿部規格（砍掉裝備清單／風格長段／驗收優先序），生 3 次**全部畫成穿白襯衫牛仔褲的現代人物**，角色完全跑掉 —— 那些「囉唆」的裝備／畫風描述是在把模型釘在參考圖上，不是裝飾。
  - v3 短版連生 **6 次**：硬性 pass **1/6（17%）**、兩半明顯不同（IoU 平均<0.6）**4/6（67%）**。所以可靠做法是**生 5–6 張 → `pick_best.py` 挑第一**。
  - 新增 `output/archer-demo/pick_best.py`：掃 `run-walk-*/cells`，算半週期重複 IoU ＋ 讀 Forge `sheet_qc`，排序並印出建議採用哪一輪。
  - 目前總排名第一：`run-walk-video3`（IoU 0.508、leg_alternation pass）—— 已用在 demo 的「原樣」素材。
  - 報告：`output/archer-demo/REPORT-legs-only.md`；六輪並排 `qa/v3-six-runs.png`、v6 角色跑掉 `qa/v6-compare.png`。
- **（方向改變：【v6 非 Q 版畫風】＋ 角色改成戰士）**：使用者指定用 v6 #1（銀白短亂髮、米白厚布短上衣、棕色皮革護胸／皮帶／手套／長靴）那套服裝與畫風，**拋棄 Q 版（3 頭身）**，人物改成戰士（無弓、無箭袋、無兜帽）。參考圖從 `run-walk-video6/cells/frame-00.png` 做成 `ref/warrior-v6-01.png`（768²、洋紅底）。提示詞 `prompts/walk-warrior-v1.txt`（1×8、螢幕位置鎖定前腳、逐格相位、明確寫「非 Q 版、約 5–6 頭身」）。生 3 張：`run-warrior-v1-{1,2,3}/`。
  - **v1-3 最好**：原生像素高 **113 px**（比 Q 版弓手的 30×38 大很多）、身高差 1.21%、地線 5 px；v1-1 是 98 px；v1-2 模型把格距畫成 11.9 px，縮完只剩 36 px 不能用。
  - ⚠️ **Forge 的 `leg_alternation` 對這隻失效**：它靠「遠側腿暗一階」的亮度差分辨前後腳，而這角色兩腿顏色一樣。自算的半週期重複 IoU 是 **0.36/0.26/0.38/0.67**（比舊 Q 版能過的 0.45–0.66 還低），實際上兩半確實不同。要讓自動檢查也能過，下一版得在提示詞加「遠側腿暗一階」。
  - 產物：`output/archer-demo/{prompts/walk-warrior-v1.txt, ref/warrior-v6-01.png, run-warrior-v1-*/}`、`build-warrior-v1-*/`（unfake 真像素＋16 色盤＋對齊＋QC）、`warrior-review/`（3 張原圖＋4 支 GIF）。
- **（改用 sprite-gen 管線）**：`C:\Users\ray\tools\sprite-gen` v2.11.0。**它的生圖（codex image_gen）這個帳號沒有能力**（實測錯誤：the account … does not provide the built-in image_gen capability），grok 也未登入 → 所以生圖仍用 l0veyou，**但去背／色盤／對齊／atlas／QA 交給 sprite-gen**。
  - 新工具 `output/archer-demo/spritegen/make_row.py`：把 l0veyou 的 1×8 sheet 組成 sprite-gen 的 `raw/<state>.png`（照它的 cell 與 safe margin、色鍵用 run 指定的）。
  - 管線：`prepare` → `make_row` → `extract` → `compose-atlas` → `inspect` → `preview_animation.py`。**`inspect` 0 errors**；motion_presence 0.031（門檻 0.01）、histogram intersection 最低 0.907、dHash 最低 0.859、24 色共用色盤、二值 alpha、foot-centroid 對齊。半週期重複 IoU 0.64–0.73（有換腳但不完美）。
  - 踩到的坑（都記在 `spritegen/REPORT-spritegen.md`）：prepare 會**自己把色鍵改成 cyan**（量 base 底色再挑最遠色）；`fit.outline:"on"` 會踩它自己的 `float("on")` bug，要改 `true`；來源是 RGB（alpha 全 255）要先自己打透明否則底色整塊被貼進去；**逐格 unfake 會抓錯格距**（同一張圖出現 3.2 與 11.9），要整張量一次當 hint；**cell 太大會稀釋 QA**（512² 時 motion_presence 被壓到 0.0023 誤報，改 144² 才正常）。
  - sprite-gen 自己的文件就写明 `walk`/`run` 是 **experimental**，人形循環要靠「生幾條候選 row + `compose_selected_cycle.py` 挑格」，所以沒有假裝它自動解決換腳。
  - 產物：`output/archer-demo/spritegen/{sprite-request.json, make_row.py, run-144/, review/, REPORT-spritegen.md}`；`run-144/frames/walk/frame-0..7.png`（144²）是 deliverable 級輸出，`manifest.json` 有 `frame_layout`。
- **（照建議：生多條候選 → 挑格組循環）**：
  - ⚠️ **l0veyou 生圖目前失敗**：站方回「图片生成失败，请稍后重试」，連試 3 次各等 5 分鐘都 `NO_IMAGE`。不是登入問題（聊天頁還登著）。要生新候選得等它恢復。
  - 所以用**現有兩條候選**（v1-3、v1-1）做成 16 格 pool：`make_row.py` 現在接受多條 sheet，接成同一條 `raw/walk.png`（cell 144、16 格），extract → 16 格 frame，再用 `compose_selected_cycle.py --frames 9,10,11,12,13,14,15,16` 產出選定循環。
  - 評分（半週期重複 IoU，越低越好）：**B 全（v1-1）= 0.54、身高差 0.0%**；A 全（v1-3）= 0.69、身高差 7.1%；跨候選拼接 = 0.36（換腳最漂亮）**但兩條原生身高差 15%（114 vs 98 px），循環中段會跳大小 → 不採用**。
  - **採用 B 全（v1-1）**。品質換到的代價是原生 98 px（A 是 114 px）。
  - `compose-atlas` + `inspect`：**0 errors**（只剩無害的 pitch 警告）。`qa/walk-B.json` 是選定循環的 SSoT（1-based 選定格號、runtime 0-based 索引、每格 SHA-256）。
  - 產物：`output/archer-demo/spritegen/{run-pool/, review-pool/, REPORT-pool-pick.md}`；建議採用檔是 `review-pool/walk-B-contact.png` 與 `walk-B-x4.gif`。
- **（關鍵實驗：逐格條件生成）結論：【換腳是模型的限制】**
  - 新腳本 `pipeline/scripts/l0veyou/chain_gen.mjs`（單一 process、每步新對話、只附上一格當參考）。實測用 `output/archer-demo/chain/`（seed = 第1格，phases.json = 7 段「只描述下一格」的提示詞）。
  - 結果：**7/7 生成成功**（每次 29–41 秒），但**半週期重複 IoU 0.49（單發最好是 0.51），Forge `leg_alternation` 仍然 FAIL（same leg leads）**。再試「第 5 格時把第 1 格與第 4 格併成一張參考圖」要求換腳 → IoU 0.56，**更差**。
  - 直接量前腳那隻靴子的顏色身分：逐格版可量到的六格全是「跟第 1 格同一隻前腳」—— **從頭到尾沒換過**。單發 v1-1 反而會跳。
  - ⚠️ **我自己的 eye-check 錯過一次**：第一眼看 `chain-pairs.png` 以為第 5–8 格換腳了，其實只是**整體顏色變淡**（生圖鏈的光影漂移），幾何位置沒換。是數字糾正的。
  - 結論：換 7 支以上提示詞、兩種排版、兩個角色、十幾次生成 → 成功率約 17%；給它時間軸上下文與起始格參照也一樣不換 → **單張圖生成沒有「左/右腳」的身分概念**，是語意層盲點。目前唯一能讓 Forge QA 真的 pass 的仍是確定性鏡像（`walk_fix --leg-window`），代價是鏡像後腳尖方向不對。
  - 順手：**l0veyou 登入狀態直接重開瀏覽器就回來了**（chrome 用 `chromium-1243`；照 HANDOFF 的啟動指令）。
  - 產物：`output/archer-demo/chain/{seed.png, phases.json, out/, out2/, frames/, frames2/, chain-strip.png, chain-pairs.png, chain2-strip.png, chain.gif, REPORT-chain.md}`。
- **（其他生圖變體也不行）**：用「走路**精靈圖集**」的講法（4×2、明講上下列是不同姿勢）→ 上下列還是同一組；拆成**兩張圖**分開生（右腳在前 4 格 / 左腳在前 4 格）→ 兩張的前腳都是同一隻。量「前腳亮度−後腳亮度」兩張都是正的（都是近腳在前面）。報告 `output/archer-demo/atlas-test/REPORT-atlas.md`。
- **（照 sprite-gen 文件的正解也失敗）**：`directional-anchor-workflow.md` 寫得很明白 —— 「循環動作不要只餵單一接觸姿勢當參考，那會讓模型每一格重複同一隻腳的相位；動作參考應該**同時包含兩個相反的接觸相位**」。把「身分參考＋含兩個接觸相位的動作參考」併成一張圖餵進去（`output/archer-demo/motionref/`）→ **還是不換腳**（半週期 IoU 0.51、前腳身分序列全是同一隻）。
  - ⚠️ 這個 session 我對「1–3 px、同色系」的腿部差異**視覺判斷錯了三次**（每次都被量測糾正）。教訓：**先把圖裁到只剩腿、放大 7 倍再看**，而且要有校正組（同格 vs 同格應該全白）。相關圖：`qa/legs-zoom-chain.png`、`qa/overlay-calibrated.png`、`qa/halves-legs.png`、`qa/motionref-run1-legs.png`。
- **（結論：改用圖層位移，Forge 終於 PASS）**：新腳本 `output/archer-demo/rig_walk.py`。把一格關鍵姿勢拆成頭／身體／近腳／遠腳四層，兩條腿用**相反相位左右平移**（`±stride·cos(phase+偏移)`）、位移量從髖往下 ramp、擺動腿抬起、上半身只做微小起伏。**完全不鏡像 → 腳尖永遠朝前**（不是月球漫步）。
  - Forge `sheet_qc`：**`leg_alternation` PASS（alternates）**、identity_head_ratio 八格全 1.000、phase_coverage pass、torso_drift 0.04、row_baseline 0.0；只剩 near_duplicates 與 seam 兩個 warn（相鄰相位本來就相似、第 8 格接回第 1 格）。
  - **這是整個 session 唯一讓 `leg_alternation` 真的 pass 的做法**。
  - `--phase` 是關鍵參數：0.0→warn（passing 格兩腳正對稱，判讀不出前後）、**0.3→pass**、0.6→warn、0.9→pass。
  - 限制：素材只有一格姿勢，所以手臂不會另外擺、也沒有披風飄動；這不是 AI 生的自然步態，是確定位移。
  - 產物：`output/archer-demo/{rig_walk.py, rigwalk-final/}`（8 格 70x129、rigwalk.json 參數與每格位移量、qc/、review/ 動畫與 strip、REPORT-rigwalk.md）。

## 2026-10-09（續）：戰士 demo v03 — 頭部比例與步態精修，接進 demo 播放器

- 最新播放器補上 `active-release.json` 的 `footContactY: 91`，地線對齊實際鞋底，匯出錨點仍為 (58,92)。T3 原生 html_preview 桌面 1120／手機 380 px 重新檢查控制、鏡像、攻擊停止、像素非空、無水平溢出和 atlas 下載配對全 PASS，記錄 `release-v03/qa/t3-browser.json`。目前仍啟用 v03。

- **背景**：同一個 `output/warrior-l0veyou-forge/` 在 06:24–06:32 期間有**另一個 session/process 也在寫**（它產出了 `release-v02/`、`active-release.json`、改寫 `build_demo.py`、`package_demo.py`）。v03 沿用它的 release 架構（`active-release.json` → `build_demo.py` → `demo.html`），沒有重做。若另一邊再跑一次，`active-release.json` 可能被它指回 v02。
- **只做兩件事**：修頭部比例、修步態，維持 demo 身分，沒有進正式 `assets/heroes/`。
- 原表量到的問題（`qa/idle-frames/sheet-qc.json`、`qa/walk-frames/sheet-qc.json`）：`identity_head_ratio` **fail**（待機 0.938–1.104、走路 0.938/1.081）、走路的 `leg_alternation` **fail**（duplicated half-cycle，八格同一隻腳領先）、`torso_drift` warn 64.48、`row_baseline` warn 15.0。
- **修法**（`refine_motion.py` + `rig-v03.json`，確定性、無生成模型）：待機姿切出頭／身體／劍／前後腿四層，頭逐格複製對齊；走路用 `nearFootX/farFootX` 走 ±12 px 步幅與抬腳，上半身只呼吸起伏。修完 `refined-v03/qa/{walk,idle}-forge`：`identity_head_ratio` 八格全 1.000、`leg_alternation` alternates、`torso_drift` 0.47、`row_baseline` 0.0，四項全部 pass。
- **rig-v03 相對 v02 的三個實質修正**：(1) `sourceOffset` −11→0、`attackOffset` 新增 0,0 —— v02 的內容中心在 x=47 但錨點寫 58，demo 把角色畫歪 11 px；v03 實測 idle union bbox 中點 = 58.0，錨點誠實。(2) `attackOffset` 跟 `sourceOffset` 對齊，去掉頭層／攻擊原圖之間 1 px 的錯位。(3) 保留 `bridge(frame,4)`，`refined-v02` 唯一掛掉的 `connectedBody`（attack-03 頭浮起 1 px）現在 pass。`legSplit` 維持 64（內容相對切線不變，八格 lead 數列與 v02 完全相同）。
- **試過但撤回**：把 `farShade` 從兩階改一階會讓遠腳不再明顯較暗，`sheet_qc` 的 auto-luminance 就分不出前後腳（8 格變 7 格 unclear，`leg_alternation` 從 pass 掉成 needs-visual-review）。深度線索比「腿不要糊成一團」重要，改回原值。
- **交付**：`refined-v03/`（rig 圖層 + 22 格 + `qa/motion.json`）、`release-v03/`（`common/` 22 格 160×100、`clips.json` 錨點 58,92、bundle、engine Aseprite/Godot、`qa/final-pixel.json`、`qa/final-geometry.json`）、`active-release.json` 指向 v03、`demo.html` 已重建。
- **驗收**：`qa_refinement.py` 八項全 pass（二值 alpha、色盤、邊界、頭部逐格位元相同、前後交替、腳貼地、每格位移 ≤7 px、身體連通）；`pixel_qa.py` 22 格 PASS（partial alpha 0、off palette 0）；`engine-export` PASS；`audit_demo.py` 桌面 1120×900 與手機 380×820 全過、console error 0，截圖 `qa/demo-1120.png`、`qa/demo-380.png`。
- **還沒修好、照實記在 README**：走路讀起來仍偏「滑步」，`near_duplicates` 抓到 [1,5]、[1,7]、[2,6] 三組太像；待機只有 3 種姿勢（`idleSink` 0/0/1/1/1/1/0/0），bundle QA 的 `near_duplicate_holds` = 4（門檻 0）；攻擊第 1 格（舉劍）頭是用矩形去背框貼上去的，手／劍壓在頭上，邊緣仍有取捨。
- **工具參數坑**：`sheet_qc.py frames` 判前後腳要看**沒有劍的 `body-qa/walk/` 畫面**，不是 `walk/`（有劍會干擾）。`refine_motion.py` 現在支援 `--rig/--out`（也吃 `REFINE_RIG`/`REFINE_OUTPUT`），`package_demo.py --revision refined-v03` 會自動對應 `rig-v03.json` 與 `release-v03/`。

## 2026-10-09:戰士 demo：l0veyou 生圖 + Forge，H3／LTX 影片入口

- 成果在 `output/warrior-l0veyou-forge/`，`demo.html` 可離線直接開。GPT Image 2 生母圖與三張動作表；Forge master approve → ownership slice / scale_frames → shared palette quantize → animation-clips v2 → Aseprite / Godot export。待機 8、行走 8、攻擊 6 格。
- 角色身高基準 72 px、最多 16 色、alpha 0/255、錨點 (50,92)。攻擊伸劍超出 100 格，Forge 拒絕裁切，右補 44 px；所有動作最終同畫布 144×100。是獨立 demo，未接正式遊戲 100×100 契約。
- l0veyou 選單確實有 `MiniMax H3 生成视频极速版` (`minimax-h3-turbo`) 和 `LTX 视频` (`ltx2-5-distilled`)。**上傳參考圖會切回 GPT Image 2**，影片入口要在上傳後重新選模型，再確認送出的 POST 模型。`l0veyou_video.py` 沿用登入的 CDP 9447，不存登入憑證；生成完成時從 task response 立即取得 MP4，曾遇到前端「完成但沒有連結」和舊檔案網址 404。
- LTX 當次帳號額度耗盡（頁面約 18 小時恢復）。H3 可生成／下載，但待機換彩色背景、轉身、行走新增第二個角色、攻擊變成文字 UI，連短中文修正版仍改背景。Forge triage / process 和原 MP4 全保留，拒絕拿這些影片出貨。最後 demo 使用 GPT Image 2 動作表。
- `qa/final-pixel.json` 22 格嚴格 PASS（partial alpha 0、off palette 0），`qa/final-geometry.json` 每格 ≥2 px 留白，engine export PASS。原表 head ratio、前後腿判讀仍有警告；素材只接受為 demo，頭部／步態待精修。完整限制與來源在該目錄 README / source-record.json。

## 2026-10-07:新英雄「獵魔人 witchhunter」+ agent-sprite-forge 試用

- **工具**:[0x0funky/agent-sprite-forge](https://github.com/0x0funky/agent-sprite-forge)(0.4,clone 在 `~/agent-sprite-forge`,`pip install -r requirements.txt`)。
  它的生圖路由(API key → Codex/Grok CLI)在本機都不能用:沒 API key、沒 Grok;Codex 走 CheapRouter 中轉,`image_gen` 回 `TOOL_UNAVAILABLE`。
  **使用者指示:只用 l0veyou 網頁生圖**,所以只拿它的「規劃 + 後製」腳本用,生圖改成手動驅動瀏覽器。
  - `master_still.py generate` 只拿來產 prompt(`master_run/prompt.txt`,洋紅底、72% 畫高、指定朝向);`master_still.py approve --still <png> --route "l0veyou…"` 去背、縮成 hero 框(1024² 上身高 788)→ `master/master.png`。
  - `plan_guide.py --frames 8 --cycle walk` 產走路姿勢表與 prompt;`sheet_qc.py spill` 抓到原表弩尖跨格(cross_cell FAIL)→ 改用連通塊歸屬切格;
    `scale_frames.py --sheet … --root-lock torso-x --row-baseline --emit-clips`、`build_animation_clips.py` 出 91×98 透明幀(試用成果,未進遊戲)。
  - 結論:規劃/QC 工具好用(跨格、安全框、腳底對齊都有數字);它的輸出格式跟本專案 `assets/heroes` 規格不同,進遊戲要自己轉。
- **l0veyou 生圖(這次用的方式)**:Chrome `--remote-debugging-port=9333 --user-data-dir=C:\Users\ray\.l0ve-chrome`(使用者自己登入),Playwright `connect_over_cdp`。
  腳本在 `~/sprite-hero/`:`send.py <prompt> <ref> [16:9]`(確認有發出 POST /api/v1/images/generate)、`grab.py <out>`(抓最新 cloudfront 結果)。
  **坑**:附 2 張參考圖時按送出會清空輸入框但不發請求(靜默失敗)→ 一次只附 1 張(角色主圖);`AI 生图` 側欄鈕是切換鈕,已啟用時再按會切回聊天模型;16:9 回 1536×864;每張 30–60 秒。
- **生成的素材**(全在 `~/sprite-hero/`):主圖 `take1.png`(以聖騎士表當風格 REF)、側走 `walk_sheet.png`、攻擊 `atk_sheet.png`、正面走 `down_sheet.png`、背面走 `up_sheet.png`(第一次上排變側面,改 prompt 強調「8 格全背面」重生)。prompt 在同資料夾 `*_prompt*.txt`。
- **進遊戲**:`~/sprite-hero/build_sheet.py hero_out` → `assets/heroes/witchhunter.png/.json`(800×1300、13 列 × 8 格 100px、身高 72、腳 y=91、16 色)。
  idle=站姿上下 1px、hurt=閃白/紅、death=旋轉倒地、victory=舉弩格、skill=攻擊重排、Left 列=鏡像 → 這幾列是程式湊的,之後可各自生圖重做。
  程式:`pixel-data.js` 職業(HP104/攻22/射程4.8/170 金)+ 技能「銀弩獵殺」(single ×2.6,cd 9);`pixel-game.js` 遠程攻速/箭矢、`offerNewClass()` 名單裡沒有獵魔人就讓招募欄第一位是他(新舊存檔都會);
  `pixel-world.js` ranged 判定、街上英雄、palettes;`test-pixel-game.mjs` 加斷言。
- **踩坑**:開局改成每職業一人(6 人)會讓 test-overworld「白樺花原 keeps spawning monsters」失敗(多一人清怪比補怪快)→ 開局維持 5 人,獵魔人走招募。
  `CLASSES` 新職業要放陣列最後,否則開局 5 人的 `CLASSES[i]` 會換人。
- 驗收:npm test 三套全過;無頭瀏覽器(5030)確認 heroSheets 有 witchhunter 13 動作、招募卡出現、雇用後在獵人小屋旁正常行走,0 pageerror。舊版備份 `outputs/暮影村.before-witchhunter.html`。
## 2026-10-06 晚:獵魔村風格重製(最新)
- **角色規格權威**:`sprites/SPRITE_VISUAL_BIBLE.md`(第 0 節權威清單、第 6 節 = 上線的 hv2 風格);其他文件裡的角色描述都不是規格。
- 道具視角修正:output/l0veyou/props-fix-v1.png(提示 prompts/props-fix-v1.txt)重生成 hayBale/archeryTarget/handCart/chest/fruitStand/barrel/bucket/snowDrift,2:1 等角 3/4 視角,assemble.py 新增 zx-fix;PROP_ATLAS 尺寸已調。assemble.py all 末尾 KeyError title 為既有問題(atlas 已寫出)。
- 2026-10-06 夜:全 7 英雄(新增祭司 priest、暗黑騎士 darkknight 走 heroes/ 圖集)+ 4 魔物改用「真實獵魔村截圖」當 REF 重生成(hv2/webref、hv2/styleref;`ship_hv.sh <name>` 出貨,build_hero.py 補空格、SWAP 調色、priest idle 高 80、darkknight hurt ×0.88)。村民 8 人 villagers@1x/2x 已重生成並接進 build.mjs,但遊戲目前沒有生成 type:'villager' 的程式碼。羊/山羊已改獵魔村風格(output/l0veyou/animals-hv-v1.png,提示 prompts_hv/animals.txt,assemble.py atlases 的 zx-animals);街上英雄加回暗黑騎士/祭司。舊圖集 hero@/heropose@/monsters@ 已移除(build.mjs 不再嵌入、assemble.py 不再產生、pixel-world.js 不再載入);新 sheet 解碼前 pendingHero/pendingMon 讓該幀不畫,不會閃出舊程序圖。舊檔與 output/l0veyou 舊版原圖/_old_style*/hv2/_mixed 移到 work/_archive_old_assets_2026-10-06/(專案外,可手動刪)。
- 教訓:l0veyou generate.mjs 一次只能跑一支(共用一個分頁會互相污染檔名);要先「清空」參考圖。Windows 無頭 chromium 載遊戲會 GPU 崩潰,檢查腳本要用 launch({channel:'chromium'})。

- 驗收:audit_hero_sheet 全 PASS(僅樹精 attack3/4 觸格邊),npm test、check_facing 0 錯、check_anim 閃格 0。
- 建築/地圖物品角度檢查:建築全 2:1 合格;弱項道具 hayBale、archeryTarget、handCart、chest、fruitStand、town2 barrel/bucket、snowDrift 待重畫(未動)。
- 5025 預覽(pilot-server.mjs)要重啟才會看到新版。

## 2026-10-06:動作自然度 — 待機不跳、正背面走路有起伏、腳不打滑、狼花紋一致(最新)

- **待機跳格**:模型常把待機某一格整隻畫大(史萊姆 +16、狼 +10、魔像 +18、樹精 +28 px)。build_hero.py 待機列每格各自縮到跟基準格同大;
  姿勢不同、縮完還差 >6% 的格(狼抬頭、史萊姆拉高)直接換成基準格。呼吸改由 `add_motion` 統一做:變形場 `warp`/`envelope`(參考 aldegad/sprite-gen breathe 的 envelope 做法重寫):頭部(`RIGID`)逐像素不動、
  軀幹吸氣時變高變窄(面積守恆,g=-6.5%×0/½/1/½)、腳底段降回 0 不離地。舊的「切一刀上移」會在切口複製出一條線(魔像腰間黑縫變粗帶),已淘汰。
  正/背面走路起伏也改成伸長量平均分散在小腿段。
- **正/背面走路像滑行**(前後格變化只有 6–9%):`add_motion` 依兩腳間距找出經過格,身體抬高 ~3%(膝蓋以上上移、腳貼地),跨步格貼地。
  正/背面列的倍率改用整列高度中位數(法師背面走路第 3 格帽尖彎下,當基準會把其他格放大 10 px)。
- **腳打滑**:走路格原本依時間推進(0.1 秒一格),魔像一輪只前進 14 美術 px 卻跨 ~50 px(比例 0.12,原地踏步滑行)。
  build 把 `cycle`(一輪走路該前進的美術 px = 跨步格兩腳外緣 × 1.7;史萊姆 0.6 個身長)寫進每個 walk* 動作;
  pixel-world.js `gaitFrame` 依畫面上實際走的距離推進走路格(英雄、魔物、街上英雄都是)。實測每換一格走 6–18 px,跟 cycle/6 一致。
- **狼花紋**:走路表模型漏畫背上紅鬃毛 → `MARKINGS`/`transfer_marking` 依待機格的花紋位置與深度補畫(依亮度對應花紋色)。
- 驗收:audit_hero_sheet 九隻全 PASS、npm test、check_anim 閃格 0 受擊 178/178、check_facing 0、zorder 0。量測腳本(待機身高跳動、前後格變化、腳底、花紋色)在當次 session scratchpad 的 motion.py。

## 2026-10-05:商業像素遊戲標準視覺體檢(最新)

每條都有可重現的量測工具(`pipeline/scripts/check/`),修完全部 0:
| 檢查 | 工具 | 修前 | 修後 |
|---|---|---|---|
| 破圖:去背殘色/半透明光暈/描邊一致(暗描邊 ≥55%) | `audit_art.py` | 描邊/尺寸不合 3 | 0 |
| 單位/擺設 vs 建築畫的先後(穿模) | `check_zorder.mjs` | 77/5271 錯 | 0/4000+ |
| 像素密度一致(mixel,各類 vs 英雄 0.67–1.5) | `audit_density.py` | 道具 0.57、樹 2.2、建築 2.9 | 0.81–1.01 |
| 動畫閃格/走路跳格/受擊回饋 | `check_anim.mjs` | — | 0/0、132/132 有受擊格 |
| 擺放、出入口、朝向 | `check_placement`/`check_gates`/`check_facing` | — | 0 |

主要修正:
- **穿模**:會動的單位與擺設跟建築的前後改用「往鏡頭方向射線是否穿過佔地」判定(`depth()`),單一 x+z 排序對點 vs 長方形會錯。
- **像素密度**:全部美術統一 ≈0.62 邏輯單位/美術像素 —— 道具/樹/特效依遊戲畫的外框像素化(`assemble.py` `pixelize_prop`);UI 圖示 24px 像素畫;
  地面材質 256 格、TERRAIN_TEX_SCALE .25→.5;建築第六批單張高細節重繪(以原圖當 REF,約 170 美術像素寬)再像素化。建置 34→7.4 MB。
- prompt 全部寫進 `assets/PROVENANCE.md`(第二~六批 75 條)。
- 光源:場景素材右半−左半亮度中位數 −2(左亮 90 / 右亮 70)— 沒有系統性跟「光從右上、影子往左下」矛盾,未改。
- FPS:GPU 桌機/手機 30/30;軟體算繪桌機跟改前同一時段交錯量 19–22 vs 16–21(機器負載波動大),手機 30。
- 量測注意:生圖原表的美術像素格距用 FFT 量(合成驗證 3/5/8 → 2.98/4.98/7.98),建築表有茅草紋週期會量錯,所以未像素化的資產一律用實測的 4。

## 2026-10-05:素材擺放檢查、地面高細節、特效方向(branch art-polish,最新)

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
  **檔名與 cell id 跟舊版一樣**(details/props/cold/woods/flora/yard/town/town2/vfx/icons + terrain-atlas/plaza/road/concept-*/woodui/title),所以 pixel-world.js 幾乎不用改。
- 第三批生圖(27 張):地貌/農作/庭院道具/特效/UI 圖示 2 張/標題圖/12 種地面材質/UI 木紋。
  柵欄段生成方向相反 → `MIRROR_CELLS` 鏡像。
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
| `isoterrain2` | 4x2 | forestFloor／taigaMoss／mountainRock／desertSand／meadowFlowers／dirtRoad／plazaStone／ice |
| `isoprops2` | 4x2 | stall／fruitStand／handCart／bench／anvilStump／weaponRack／dummy／archeryTarget(id 同現有道具) |
| `isonature` | 4x2 | snowPine／birch／cactus／boulder／mossRock／iceRocks／outcrop／wildflowers |

- 小瑕疵:餐廳煙囪的煙帶一點淡紫(洋紅去背殘色,不算 magenta 殘留);地形磚是「有厚度的方塊」不是純平面菱形(第一批也是),接進遊戲要嘛裁掉側面、要嘛當高台用。
- 已接進遊戲(見上一節「全部美術換成 Xilurus 風格」);中間產物 isobld-* 等圖集已刪,由 assemble.py 直接從原圖重組。

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
- 方向規則：所有圖朝右、往左走/打就鏡像；受擊一律面向打來的一側（受擊圖＝被右邊打往左退）。魔物走路用第 3 格（側面），史萊姆著地壓扁/騰空圓。
- 戰鬥站位：草原空地 x19 半徑 5.8（landscape-layout ARENAS）；魔物只在空地內 1.2 格追；等空位的魔物站到戰鬥另一側；目前狩獵區上限 5。
- 驗收工具（scratchpad，不在 repo）：擺拍方向／特效時間軸、四方向走路連拍、魔物走路連拍。
- 已知未完：戰鬥正下方等待的魔物仍可能半擋英雄（有半透明重畫與最上層血條）。
- l0veyou：登入存在 `work/.l0veyou-profile`；用前啟動 chrome 9447，用完關。

## 2026-10-05：建築等角幾何

- 建築：委託所原本是正面平板（不符 2:1 等角）→ 重生等角涼亭 `bounty-concept-v3.png`；`fitScaleFor` 另算「貼地輪廓外框中心」把佔地置中到街區（原本都偏後半）。

## 2026-10-04 下午：建築不壓街、可搬可縮放、地面高解析、拿掉村民

- 建築畫的大小＝min(玩家設定 `layout[id].s`(0.6–1.6), 街區容得下的最大值)。`fitScaleFor()` 用圖的實際像素算：錨點以下的像素要落在街區內、左右不超過街區菱形角。`world.buildingScale(id)` 給 UI 顯示。
- 搬家吸附到最近街區正中；目標街區有建築就互換；廣場不能蓋。被佔用的田/公園等街區不再擺設（池塘也跟著消失）。建築面板有「縮小／放大」。
- 地面畫布改成只涵蓋陸地（2345×1180 邏輯單位）、桌機 4 px/單位、手機 2；`TERRAIN_TEX_SCALE` .5→.25，材質細緻度跟建築圖同級。
- 村民、貓狗、釣魚人拿掉，街上只剩英雄；廣場只留四角矮花圃。

## 2026-10-04：棋盤格村莊、各區生怪

- **`src/village-grid.js` 是村莊布局的單一來源**：5×5 街區（10.5 單位），建築預設位置、石板街、柵欄/出村口、街區用途（田、果園、市集、公園池塘、水井廣場、畜欄、牧草地、花園、柴場）都從這裡算。廣場固定 (-8,2)。
  概念圖的地面分類／道具／人物在村裡已不用（`concept-*.js` 還在，只剩匯入）；村莊地面層 `buildVillageLayer` 改用街區路徑畫。
- 世界 minX -30 → -54；`WORLD.threeXArea` 保留原 3 倍面積當下限。
- 生怪：`REGION_MIX` 每區組成、強度＝難度 × region.risk；目前狩獵區上限 7、其他區上限 4；獵人只打目前狩獵區。

## 2026-10-03 深夜：地形、道路、文字

- 文字：畫布改裝置解析度（devicePixelRatio，上限 2.5），像素圖照舊最近鄰放大；`textLabel()` 只排隊，最後在 `drawScreenText()` 用高解析畫。
  戰鬥空地不再顯示地名／「戰鬥空地」／首領名／礦坑名；地名只在拉遠時畫在空地外緣。
- 海岸：`visBiome()`＝畫面地形（含世界外一圈不規則延伸陸地，EXT=11，只是風景、不能走）；沿岸圓斑＋白浪；沙灘只在草/林/沙漠，山地灰碎石岸，雪地直接接水。
- `biomeAt` 加中頻起伏（邊界不再是長直線）；雪地改冷白；山地空地不鋪土。
- 地貌圖集 `cold`（雪堆、冰湖、冰晶岩、山崖）、`woods`（倒木、樹樁、苔石、蕨叢），依地形散佈。
- 道路：在等角座標描線（圓頭、蜿蜒）＋遮罩填材質；行走用的 `getRoads` 不變。
- 數字：hist_bc 0.927、conform 0.933；npm test 10/10；proc={}；手機/桌機 30fps。

## 2026-10-03 晚：陰影、戰鬥動畫（commit 4959b8d、f6ef8a3、6d7b91e 之後）

- **陰影**：光從右上（概念圖），`shadowFor()` 把每個圖的剪影往左下投影（人物/樹/旗＝整張一個地面；建築/圍籬＝每欄地面），
  全部畫進 `shadowLayer` 再一次壓上地面（重疊不疊黑），物件畫在 `spriteLayer`。g 是「目前那一層」。拿掉建築腳下大橢圓。
- **戰鬥**：模擬只記 `atkAt/hitAt/atkX/hitFromX`，`combatPose()` 算蓄力→出手→受擊。特效時間軸：effect.delay 秒後才命中（箭/法球在飛）。
  清晰度：目標紅圈、血條/名牌延後到最上層（`overlays`）、被擋住的戰鬥中英雄半透明重畫、每位獵人最多兩隻近身、魔物不上橋、站位分散。
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

## 環境與工具（不在 repo 的東西）

- **l0veyou 生圖**：專用瀏覽器設定檔 `work/.l0veyou-profile`（已登入，在 repo 外）。啟動（**用 chromium-1243**，見上面「啟動生圖瀏覽器的坑」）：
  `"%LOCALAPPDATA%/ms-playwright/chromium-1243/chrome-win64/chrome.exe" --remote-debugging-port=9447 --user-data-dir="<work>/.l0veyou-profile" https://l0veyou.com/chat`
  （9333 被別的程式佔用；舊文件寫的 `chromium-1217` 未驗證，`chromium-1181` 確認會崩。）登入失效就請使用者在那個視窗登入，不要要密碼。
- 生圖：`[REF=參考圖] node pipeline/scripts/l0veyou/generate.mjs prompt.txt output/l0veyou/<名>-v1.png "" 16:9`
- 處理：物件表 `sheet_to_atlas.py`（有碰邊檢查）、單棟建築 `align/make_building.py`。
  **紫色主體**一律 `NO_SHADOW=1 NO_HOLES=1 HUE_TOL=12`。
- Playwright：全域安裝（`npm root -g`），腳本會自動找。

## 踩過的坑

- 改建築預設位置要把舊預設加進 `ART_LAYOUT_HISTORY`（存檔遷移），並跑 `npm test`：酒館移到 (-3.5,20.4) 會讓 test-landscape 道路使用率不及格 → 改用 `SPRITE_SHIFT`（只移圖、不動佔地）。
- 新圖集 cell id 不能跟既有圖集撞名（icons 有 `anvil`，所以道具叫 `anvilStump`）——detailLod 共用。
- 上傳參考圖後，頁面上的參考圖縮圖會被誤認成結果；generate.mjs 已排除 `data:` 網址。
- 道具擺放要檢查「看得到」：x+z 小於後畫建築就會被蓋住、名牌畫在最上層（l0veyou.md 有說明）。
