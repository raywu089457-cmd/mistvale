# 交接文件 — 精靈圖集管線（2026-10-23）

> 這一輪的主題：**把外部專案的生成/對齊管線搬進 mistvale**，並測通 xAI 與 l0veyou 兩條生圖路。
> 所有改動**都沒有 commit**，留在工作區。

---

## 一、這輪做完的事

### 1. 弓手 east 攻擊動畫（用改過的管線生成）✅
| 項目 | 值 |
|---|---|
| 角色 | 弓手 `788cd873-13f0-4f73-ad2f-ad27374e2467`（PixelLab 帳號 1，128px） |
| 動作描述 | `drawing a bow, aiming, releasing an arrow, side view` |
| 結果 | **9 幀**、單格 180×180 |
| 檔案 | `output/pixellab-anim-test/archer-bow-east/east/00..08.png`（另有 `_strip.png`） |
| 花費 | **2 格**（`ceil(128²×8/65536)`） |
| group id | `07a3ce29-018a-4d18-a588-ee2df0848363` |

**踩過的兩個坑（已修）**：
1. PixelLab v3 的 schema 是 **`action_description`**（文字描述），**沒有** `action`／`image_size`（尺寸由角色決定）
2. 動畫比對原本用 `animation_type` 字串 → v3 的 type 就是那段描述文字，比不到就**默默退回最後一個動畫**（第一次把 walking 的幀當成 attack 下載）。改成用建立時回傳的 **`animation_group_id`** 精準對應，**對不到就報錯**（不再默默降級）

新增 `--description` 參數：同一句「attack」對劍士和弓手不該一樣，現在可以逐次覆寫。

### 2. 移植 perfectpixel 的對齊機制 ✅
新檔 **`pipeline/scripts/pixellab/align_frames.py`**（來源 `gykim80/perfectpixel-studio`，MIT）：

| 函式 | 做什麼 |
|---|---|
| `detect_pixel_scale()` | 同色連續長度的加權眾數 → 估出「假像素圖」真正的方塊邊長（unfake.js 技法） |
| `pixelize()` | 每 scale×scale 區塊取主色，區塊過半透明就留空 |
| `shared_palette()` / `apply_palette()` | 同動作**所有幀共用一組調色盤**（防顏色漂移）＋ alpha 二值化 |
| `align_frames()` | 每幀用「質心 X ＋ 最低不透明點（腳底）」當錨點平移對齊 |

實測（弓手 east 9 幀）：偵測方塊邊長 2、共用調色盤 24 色、質心 X 跨距 **4.79 → 0.51 px**、腳底 Y 跨距 **0 → 0**、畫布 184×184。

**重要結論**：PixelLab 的輸出**腳底本來就鎖住（跨距 0）**，而且那 4.79px 的質心變動是**拉弓動作本身**，不是抖動 → 對 PixelLab 的幀只需要「腳底基準線」；整套對齊是給 **AI 生的假像素圖**用的。

### 3. 接列流程加防回歸守門員 ✅
`pipeline/scripts/pixellab/add_attack_dirs.py` 新增 **`--align [容忍px]`**（預設 2）：
接列前量 9 格腳底跨距，在容忍值內就報「不動」，超過就自動吸附到共用基準線並警告。

```
python pipeline/scripts/pixellab/add_attack_dirs.py --hero archer --src <dir> --align
```

### 4. spriteforge 風格提示詞庫（移植）✅
新檔 **`pipeline/scripts/pixellab/styles.py`**（來源 `marcelontime/spriteforge`，MIT）：
- **9 種風格**：`original / pixelart(Stardew 32) / celshaded(BotW 256) / lowpoly(Genshin 192) / handdrawn(Hollow Knight 128) / cartoon(Fall Guys 160) / retro(8-bit 32) / fighter(CPS-2 120) / modern(Flat 96)`
- **8 種動作**逐幀描述：idle 4、walk 12、jump 4、air_attack 2、hurt 2、knock_out 6、punches 8、turn_around 3
- **NES 25 色 / CPS-2 13 色調色盤**、否定詞、系統開場詞
- `frame_prompt()`（gpt-image 逐幀格式，原樣保留）、**`pixellab_description()`**（轉成 PixelLab v3 的 `action_description`）

```
python pipeline/scripts/pixellab/styles.py --list
python pipeline/scripts/pixellab/styles.py --style fighter --action attack
python pipeline/scripts/pixellab/styles.py --style retro --action walk --frame 3
```
已把整理好的版本發到 TG：`output/spriteforge-prompts.md`

### 5. spriteforge 改用 l0veyou（免 API key）⚠️ 未驗證完成
新檔 **`pipeline/scripts/l0veyou/spriteforge-bridge/server.cjs`**（`.cjs` 因為 mistvale 的 `package.json` 是 `type:module`）

| 端點 | 作用 |
|---|---|
| `POST /api/edit` | 收 `{prompt, image}`（支援 multipart 上傳參考圖）→ 回 `{jobId}` |
| `GET /api/job/<id>` | 輪詢 `running` / `done`（回 data URL）/ `error` |
| `GET /api/health` | 檢查 CDP 9447 通不通 |

做的事：CDP 驅動已登入的 Chrome → 開新對話 → 上傳參考圖 → 選 GPT Image 2 → 1:1 → 貼提示詞（native setter）→ 送出 → 等成品圖 → 轉 data URL。
前端只要把 `js/api.js` 的 `callOpenAIEdit()` 換成「POST /api/edit + 輪詢」（檔案開頭有可直接貼的程式碼）。

**已驗證**：端點、CDP 連線、開新對話、貼字、送出、輪詢都通。
**未驗證**：真的生出一張圖。原因見「三、目前卡住的地方」。

啟動：
```
node pipeline/scripts/l0veyou/spriteforge-bridge/server.cjs   # PORT 3033（3000 被別的程式佔用）
```

### 6. xAI（grok）金鑰 ✅
- 存放：`C:\Users\ray\.xai-key` ＋ 使用者環境變數 **`XAI_API_KEY`**
- 測試：`GET /v1/models` ✅ 200（免費）；`grok-3-mini` `max_tokens:1` ✅ 200 → 花費 **≈ US$0.0026**
- 可用模型：文字 `grok-4.20-* / grok-4.3 / 4.5 / 4.6 / 4.7 / grok-build-0.1`；圖片 `grok-imagine-image / -2.0 / -quality`；影片 `grok-imagine-video / 1.5 / 1.5-lite`
- sprite-gen 的 `grok` provider 實測：`grok-imagine-image-2.0`、12.8 秒、1024×1024、`transparency=chroma`（無 alpha）

### 7. l0veyou 批次生成 ✅ 有結果
```
完成：成功 6 張、失敗 4 張 → output/l0veyou/batch
img-04/05/07/08/09/10.png（111–257 KB、1024×1024）
```
失敗原因：**網站中途把登入踢掉**（session 過期）。

### 8. GitHub 精靈圖集專案調查 ✅
- **`gykim80/perfectpixel-studio`**（606★、Go+Wails+React、MIT）：多供應商生圖（gemini / openai / openrouter / fal / byteplus），核心價值是**一致性機制**（去背 → 分割 → 質心對齊 → 像素化 → 共用調色盤），不是模型
- **`marcelontime/spriteforge`**（87★、JS、MIT）：只用 OpenAI `gpt-image-1` 的 `/v1/images/edits`，照片→6 種風格 sprite、8 種動作、可單幀重繪；價值在**風格提示詞庫**與編輯 UX
- 其他：`dreiachse-cyber/image-cockpit-for-codex-workflows`(294★)、`marcelontime/spriteforge`(87★)、`GAlbanese09/spritebrew`(68★)、`tomasburkett/banana-sprite`(8★)、`ianlintner/ai-pixel-art-image-generation`(22★)；純工具：aseprite(40k★)、piskel(12.8k★)、stitches(1k★)

### 9. 生成方法比較結論
| | perfectpixel（通用模型＋自家管線） | PixelLab（專門像素模型） |
|---|---|---|
| 產出本質 | 假像素圖（AA、顏色上千、格線未對齊） | 真像素圖（原生格線、原生 alpha） |
| 8 方向 | 每方向各生一次 → 方向間容易不像 | 內建骨架，同一角色 |
| 幀數 | 事後修 | 指定 8 幀就是 8 幀 |
| 後處理 | **必須**（去背/分割/對齊/像素化/調色盤） | 幾乎不用（只做腳底對齊、接列） |
| 風格 | **任何風格** | 只有像素風 |
| 費用 | 每幀一次 API 生圖 | 訂閱額度（128px·8 幀·單方向 = 2 格） |

**像素＋8 方向＋一致性 → PixelLab 完勝；非像素風格或照片轉素材 → perfectpixel 那條路。**

---

## 二、關鍵檔案與常數

| 檔案 | 內容 |
|---|---|
| `pipeline/scripts/pixellab/align_frames.py` | 對齊／像素化／共用調色盤（新） |
| `pipeline/scripts/pixellab/styles.py` | 9 風格 + 8 動作提示詞庫（新） |
| `pipeline/scripts/pixellab/add_attack_dirs.py` | 攻擊列接圖；新增 `--align` |
| `pipeline/scripts/pixellab/sprite-gen/pixellab_animation.py` | PixelLab v3 動畫 adapter（已修 group_id 比對 + `--description`） |
| `pipeline/scripts/pixellab/sprite-gen/pixellab_provider.py` | PixelLab 生圖 provider（native alpha） |
| `pipeline/scripts/l0veyou/spriteforge-bridge/server.cjs` | spriteforge ↔ l0veyou 橋接（新） |
| `pipeline/scripts/l0veyou/batch_gen.mjs` | l0veyou 批次生圖（原本就有） |
| `output/l0veyou/batch/` | 批次成品（6 張） |
| `output/pixellab-anim-test/archer-bow-east/` | 弓手 east 攻擊 9 幀 |
| `output/spriteforge-prompts.md` | 提示詞庫整理版（已發 TG） |

**PixelLab**：token `~/.pixellab-token`（帳號1，餘 27）/ `~/.pixellab-token2`（帳號2，餘 1158.9）
**xAI**：`XAI_API_KEY` / `C:\Users\ray\.xai-key`
**l0veyou**：正式站 **`https://l0veyou.com/chat`**、profile `work/.l0veyou-profile`、CDP **9447**

---

## 三、目前卡住的地方

### ⚠️ 1. l0veyou 橋接：生圖未驗證
- **已修**：橋接原本把 Chrome 開到 `wac.wuaicha.cc`（**海外客，錯的站**，看到的是「請輸入激活碼」登入頁）→ 已全部改成 **`l0veyou.com/chat`**
- **已修**：偵測「成品圖」原本只抓最後一張 `<img>` → 會抓到頁面上的促銷圖（曾回報「5 秒完成 984×972」的**假成功**）。現在改成**只認送出後才新出現的圖**（`window.__sfBefore`）
- **未完成**：Chrome 已開在正確的站，但**無法確認登入狀態**（用 CDP 讀選擇器的檢查腳本靜默失敗，沒輸出）
- **需要你**：看一眼那個 Chrome 分頁 —— 有對話框＝已登入；是登入頁＝請登入

### ⚠️ 2. 其他職業沒有 8 方向攻擊美術
目前只有**狂戰士**（舊）與**聖騎士**（本輪前）有 8 方向攻擊；弓手只有 east。其他職業是素材缺口。

### ⚠️ 3. `attackDown` 第 5、6 格劍光弧尾端碰 cell 底邊
`audit_hero_sheet` 會報，目前選擇保留位置一致。

### ℹ️ 4. sprite-gen 的 `sound`（ElevenLabs）沒有替代方案
其餘付費資源（codex / grok / openai / 影片）都能用 PixelLab 或 grok 取代。

---

## 四、下一步

1. **確認 l0veyou 登入** → 跑一次橋接真生圖測試（5–12 分鐘），確認抓到的是新成品圖
2. **弓手補齊 4 方向**：`south-east / south / north-east / north`（左邊 3 方向用鏡像），每方向 2 格 → 共 8 格；再用 `add_attack_dirs.py` 接成 5 列
3. **（可選）修 PixelLab token 401**：`berserker-wide` 的 `v3:walking`（8 方向 × 8 幀 @256px）64 幀尚未下載
4. **（可選）其他職業 8 方向攻擊**：每個方向 2 格 × 4 方向 ≈ 8 格／職業
5. **（可選）微調 `attackDown` 光弧碰邊**

---

## 五、常用指令

```bash
# PixelLab 生動畫（先 --dry-run 看計費！參數錯誤不保證免費）
python -m sprite_gen.gen.pixellab_animation --character <id> --action attack \
  --directions east --frames 8 --size 128 \
  --description "drawing a bow, aiming, releasing an arrow, side view" --out-dir <dir>

# 幀對齊（質心 + 腳底；可選像素化/共用調色盤）
python pipeline/scripts/pixellab/align_frames.py --dir <frames> --out <dir> \
  --pixelize auto --palette 24 --anchor centroid

# 攻擊列接圖（含腳底基準線守門員）
python pipeline/scripts/pixellab/add_attack_dirs.py --hero archer --src <dir> --align

# 風格提示詞庫
python pipeline/scripts/pixellab/styles.py --list
python pipeline/scripts/pixellab/styles.py --style fighter --action attack

# spriteforge + l0veyou 橋接
node pipeline/scripts/l0veyou/spriteforge-bridge/server.cjs        # PORT 3033
curl http://127.0.0.1:3033/api/health
curl -X POST http://127.0.0.1:3033/api/edit -H 'Content-Type: application/json' \
  -d '{"prompt":"pixel art wooden barrel, game asset, transparent background"}'

# 遊戲本體驗證（改到 src/ 就要跑）
npm test
```

**Chrome（l0veyou）**：
```bash
"C:/Program Files/Google/Chrome/Application/chrome.exe" \
  --remote-debugging-port=9447 \
  --user-data-dir="C:/Users/ray/Documents/Codex/2026-09-29/new-chat/work/.l0veyou-profile" \
  "https://l0veyou.com/chat"
```

---

## 六、計費提醒

| 路 | 模式 | 這輪花費 |
|---|---|---|
| PixelLab | 訂閱額度 | 弓手 east 攻擊 **2 格**（帳號2 剩 1158.9；帳號1 剩 27） |
| xAI / grok | 逐次 API | 測試 **≈ US$0.0026** |
| l0veyou | 網站訂閱 | 0（瀏覽器自動化） |

⚠️ **PixelLab 的參數驗證錯誤不保證免費** —— 一律先 `--dry-run` 或 `GET` 驗 schema。

---

## 七、續（接手後，2026-10-23 下午）

### 1. 「弓手」其實是遊戲的 **ranger 遊俠**（不是 `archer`）⚠️ 已更正
`788cd873`（斗篷弓手）在 `pipeline/pixellab.md` 的對照表是 **`ranger`**；`archer` 弓箭手是另一套 Q 版 sheet、沒有 PixelLab 版。
上面「四、下一步」第 2 點的 `add_attack_dirs.py --hero archer` 會寫錯職業，而且那支腳本是給 256 畫布＋已有 `attack` 列的狂戰士用的（遊俠是 180 畫布、cell 100/200）。

### 2. 遊俠 8 方向拉弓攻擊 ✅ 已接進遊戲（未 commit；全部生成、不鏡像）
| 方向 | 來源 | 結果 |
|---|---|---|
| east | `output/pixellab-anim-test/archer-bow-east/east`（上一輪） | 好 |
| south-east／south／north-east | `output/pixellab-anim-test/ranger-bow-4dir/`（描述 `drawing a bow, aiming, releasing an arrow`，8 格） | SE/NE 好；south 第一次往畫面右邊放箭 → 已改（見下） |
| south（改） | `output/pixellab-anim-test/ranger-bow-south2/`（`facing the viewer the whole time … aiming it straight toward the viewer … never turning sideways`，2 格） | 0–5 格面向鏡頭、弓舉胸前、朝南；最後 2 格又轉身箭頭朝左 → 只用 `[0,1,2,3,4,5,5,4,4]`（滿弓停在 5、放箭用鬆手的 4） |
| north（舊） | 第一次（同上那批）最後 2 格**轉成正面** → 重生 `ranger-bow-north2/`（`seen from behind the whole time … never turning around`，2 格） | 全程背面，但往畫面右邊射、弓看不到 → 已換掉 |
| north（現用） | **帳號 2** `b9c7cfde`，逐格描述（背面、從箭袋抽箭、弓立在身前弓臂從左肩露出、右手肘拉弓、往畫面上方射、不轉身），種子 7／21 各一次（8 格）→ `ranger-bow-north3-s7/` | s7：弓尖從頭頂露出、右手肘拉弓、披風擺動；s21 幾乎不動。實機箭直直往上飛 |
| north-west | `output/pixellab-anim-test/ranger-bow-west2/north-west`（同上描述） | 好；接成 `attackUpLeft` |
| west／south-west | **帳號 2**：把 `788cd873` 的 8 張站姿（`output/pixellab-incoming/788cd873/rotations`）匯入成 **`b9c7cfde-66c5-45aa-84df-110664b60e90`**（0.25 格，身形比例不變）→ `output/pixellab-anim-test/ranger-bow-acc2/`。west＝`…, side view`；south-west 重做（第一次弓舉在臉前、看不出往左下）＝逐格描述「朝左下瞄準、箭指左下」。各 4 格 | 都好；west 第 8 格手後方多畫一支往後的箭＋白色準星圈 → 腳本 `CLEAN` 擦掉 x≥119。接成 `attackLeft`／`attackDownLeft` |

**8 個方向全部生成、遊戲不鏡像**（有 `attackLeft`／`attackDownLeft`／`attackUpLeft` 列，`dirSuffix`／`leftRow` 直接用）。

- 新腳本 **`pipeline/scripts/pixellab/add_bow_attack_rows.py --hero ranger [--dry-run]`**：比例跟 `build_class_sheet.py` 的走路列同一套（@2x＝來源 1:1、1x＝每 2 px 取 1），每列用第 0 格算一次位移（中軸→格中線、腳底→cell−F−1）。
  1x：原本 l0veyou 的 `attack`（8 格）原地換成 9 格，新增 7 列，表 800×1300 → 900×2000；@2x：新增 8 列，1800×2400 → 1800×4000。
  節奏 `release 7 / impact 8`（0–6 拉弓瞄準＝蓄力格）。8 個方向都是生成的，遊戲不鏡像。改前備份 `output/pixellab-anim-test/_backup_before_bow/`。
- 驗收：`npm test` 11 PASS；實機連拍（`paladin-anchor-lab/capture_seq.mjs` 新增 `CLS=ranger`）東／南／北與 4 個斜向都會拉弓、箭往目標飛（`capture_seq.mjs` 的 PLACE 補了斜向擺位）。
- 小問題：攻擊後段頭部偏離格中線的幾格 `head` 錨點是 None → 頭飾那幾格不畫（跟其他職業的算法一樣，沒另外處理）。
- PixelLab 花費：帳號 1 **16 格**（8＋北向重生 2＋南向重生 2＋西南／西北 4），剩約 3.7；帳號 2 **16.25 格**（匯入 0.25＋west 4＋south-west 4＋north 兩個種子 8，128px 角色實際每方向扣 4 格），剩約 1094。

### 3. l0veyou 橋接 ✅ 生圖其實成功，是「偵測完成」壞掉 → 已修
- 登入沒問題（`/api/v1/auth/me` 200）。第一次測試（木桶）l0veyou **真的生出來了**（`output/l0veyou/bridge-test/barrel.jpg`，1254×1254 JPEG、黑底——JPEG 沒有透明），但 job 一直卡在 `running`。
- 原因：CDP 指令沒有超時、連線斷了也不會失敗（`send()` 永遠不回）；送出前的圖片清單放在 `window.__sfBefore`，頁面一換就不見；判斷「載完」用的是整頁最後一張 `<img>`。
- 修法（`server.cjs`）：每個 CDP 指令 30 秒超時、ws 斷線就把等待中的指令判失敗；直接連 l0veyou 分頁的 ws（不再 attachToTarget）；送出前的圖片清單記在 Node；成品圖**優先認 `alt === 提示詞`**（l0veyou 生好的圖 alt 就是提示詞）；輪詢失敗就重連再等；回傳的 data URL 用實際的 mime（JPEG）。
- 舊的 3033 行程（卡住的那個）已停掉、改跑修好的版本。
- **實測通過**：修好後第二次測試（`pixel art treasure chest, game asset, plain white background`）**9 分鐘自動回 `done`**，1254×1254、`data:image/jpeg`，存成 `output/l0veyou/bridge-test/chest.jpg`（已傳 TG）。要透明底請在提示詞寫純色背景（白／洋紅），再用 sprite-gen `cutout` 去背。

### 4. 「三、卡住 3：attackDown 劍光碰 cell 底邊」已不存在
聖騎士南向已換成使用者給的 3×3 套圖，這列自帶 `footFromBottom`（@2x 55／1x 30，引擎 `sheetFrame` 讀列上的值），預覽與實機都不碰邊。詳見 `HANDOFF.md` 聖騎士段。

### 5. 使用者下載的兩段攻擊短片 → 遊俠東向／南向（測試中，未 commit）
- 來源：`Downloads/-.mp4`（正面＝南）、`Downloads/- (1).mp4`（側面向右＝東），480×480、24 fps、5.2 s、灰底 (208,208,208)，第 0 格是藍底參考圖（不用）。複製到 `paladin-anchor-lab/clips/{a,b}/clip.mp4` 再處理。
- 處理（全用現成工具，`paladin-anchor-lab/clips/process_clips.py`）：ffmpeg `colorkey=0xD0D0D0:0.07:0.04` 去灰底（sprite-gen `video-frames --key white` 只認近白 ~248，切不動）→ sprite-gen `connected_components` 只留身體那塊（飛出去的箭拿掉，箭矢由遊戲畫）→ `grid_snap_downscale`（身高對到 PixelLab 東向待機 125 px，pitch ≈1.89／1.93）→ `build_shared_palette`／`apply_palette` 鎖遊俠 PixelLab 色盤 → `output/pixellab-anim-test/ranger-bow-clips/{east,south}/00..08.png`（180 畫布，跟 PixelLab 幀同規格）。
- 挑格（0–6 拉弓、7 放箭、8 跟手）：東 `[1,16,22,28,34,46,88,90,94]`（90＝放箭、弦回直）；南 `[1,7,13,19,31,46,79,82,86]`（82＝放箭）。
- `add_bow_attack_rows.py` 的 `attack`／`attackDown` 改指向 `ranger-bow-clips/`；換回 PixelLab 版的寫法在 ROWS 註解裡。`npm test` 11 PASS、實機東／南都會拉弓、箭往目標飛。

### 6. 影片動作 → PixelLab 依骨架重畫（遊俠東／南，試做，**還沒接進遊戲**）
- 做法（跟聖騎士南向同一套，`paladin-anchor-lab/skel.py`，帳號 2 token）：起始格＝PixelLab 原版站姿（`archer-bow-east/east/00`、`ranger-bow-south2/south/00`）；
  `skel.py estimate` 反推起始格＋影片版 8 格（`ranger-bow-clips/{east,south}/01..08`）的骨架（18×0.1 格）→ `skel.py animate`（`animate-with-skeleton-v3`，描述＝遊俠外觀，每次 3 格）。
  中間檔在 `paladin-anchor-lab/clips/skel/`。
- 東向（種子 7）：8 格都照影片動作、畫風跟其他方向一致；放箭格箭還在弓上 → 那格改用最後一格（箭已射出），避免跟遊戲畫的箭重複。
- 南向：種子 7 弓畫成直的、人轉側面（失敗）；種子 21＋描述寫明「弓橫在腰前、面向鏡頭」→ 前 6 格成功，放箭 3 格又轉身 → 放箭停在滿弓那格。
- 成品：`output/pixellab-anim-test/ranger-bow-skel/{east,south}/00..08.png`（180 畫布，可直接給 `add_bow_attack_rows.py`）；對照圖 `tg/ranger_skel_compare.gif`／`_sheet.png`（已傳 TG）。
- 帳號 2 花費 10.8 格（骨架 1.8＋重畫 3×3），剩約 1083。遊戲裡目前仍是「影片直接轉」的版本，要換成重畫版只要把 ROWS 的 `ranger-bow-clips` 改成 `ranger-bow-skel`。

### 7. 決定：東西南北 4 個正方向用「影片直接轉」（2026-10-23，未 commit）
- 使用者決定用影片直接轉（不用骨架重畫）。新增兩段：`Downloads/- (2).mp4`＝北（背面、弓舉過頭往上射）、`Downloads/- (3).mp4`＝西（側面向左）→ `paladin-anchor-lab/clips/{c,d}/`。
- `process_clips.py` 改成 4 段一起跑，ffmpeg 去背寫進腳本：每段灰底不同（a/b 208、c 199、d 196）用實測值，容許值 **0.03**（0.07 會把淺米色披風一起去掉、透出破洞）；
  畫布改 240（多留 30 px，北向弓舉過頭不被切；遊戲位置照樣用第 0 格的腳底／中軸對齊）；南向起始格改用第 3 格（第 1 格背景還在從藍底淡入，去不乾淨）。
- 挑格：北 `[1,13,22,28,34,46,86,89,92]`（89 放箭）、西 `[1,16,22,25,31,46,84,88,92]`（88 放箭、箭已飛走）。
- `add_bow_attack_rows.py`：`attack`／`attackDown`／`attackUp`／`attackLeft` ＝ `ranger-bow-clips/{east,south,north,west}`；4 個斜向仍是 PixelLab（SE/NE `ranger-bow-4dir`、SW `ranger-bow-acc2`、NW `ranger-bow-west2`）。各方向的 PixelLab 舊版路徑寫在 ROWS 註解。
- 驗收：`npm test` 11 PASS；實機 4 個正方向都會拉弓、箭往目標飛。8 方向九宮格 GIF 與實拍已傳 TG。

### 8. 4 個影片方向完整性檢查（`paladin-anchor-lab/clips/qa_rows.py`，直接讀遊戲表）
- 量：格數／空格、碰邊、腳底與中軸跨距、身高、起始格對待機的重疊率、半透明、孤立雜點、殘留灰邊、封閉小破洞、相鄰格重疊率。
- **找到並修好的兩個問題**：
  1. **西向第 8 格右半身被切掉**（相鄰格重疊率 0.47）：`add_bow_attack_rows.py` 的 `CLEAN`（給 PixelLab 版西向第 8 格擦反向箭用的 x≥119）綁在 `attackLeft` 這列，換成影片版後誤套 → 改成綁來源資料夾（`ranger-bow-acc2/west`）。修後 0.96。
  2. **影片光暈白邊**：影片在角色外圍留一圈比灰底略亮、近中性（略帶藍）的像素（南、西約 45% 輪廓像素，東、北約 20%），colorkey 碰不到、鎖色後變成白邊 → `process_clips.py` 加 `dehalo()`：從外輪廓往內最多剝 3 層，只剝彩度 <22 且亮度 ≥ 灰底−12 的像素（頭髮、披風彩度高不受影響）。目視確認白邊消失。註：鎖色後的白邊會被換成淺膚／淺米色，用「低彩度亮邊」指標量不到，要目視。
- 其餘正常：4 方向 × 1x/@2x 都 9 格、時間 0.075／release 7／impact 8、head 錨點齊、不碰邊、無半透明、雜點 0–3；腳底 183（北向 2–8 格 187＝往鏡頭踏一步、整段一致；南向第 6 格 186 是箭尖 1 px）；起始格對待機重疊 0.79–0.92（西向待機是東向鏡像、拿弓的手相反，出招第一格會換手，屬既有限制）。
- 修正版 8 方向 GIF 與 4 方向逐格表已傳 TG。

### 9. 用 sprite-gen repo 本身處理這 4 段影片（給使用者看成果，**沒有接進遊戲**）
- 輸出：`paladin-anchor-lab/clips/sg/<a|b|c|d>/gloop/`（原解析度）、`gloop-125/`（`--body-height 125`）各有 strip.png／strip.json／GIF／WebP；4 方向合併 `clips/sg/sprite_gen_4dir.gif`（已傳 TG）。
- 踩到的 sprite-gen 限制：
  1. `video-frames --key white`（cutout 的白／灰底路線）取樣四角背景色有亮度門檻 `CORNER_MIN_BRIGHT=225`，這些灰底（196–208）與第一格藍綠參考圖（約 165）都低於門檻 → 退回米白預設值、找不到背景。用 `clips/sg_cli.py`（執行時調低門檻，不改 repo）才跑得動。
  2. 白／灰底路線是「從四角灌水」：**弓與弦之間、手臂與身體之間被圍住的背景留成整塊灰**（東、西最明顯）。→ 改走綠幕路線：先 ffmpeg 把灰底換成純綠（`clip_green.mp4`）再 `video-frames --key green`，乾淨。
  3. `video-loop --cycle auto` 只切到「瞄準停住」那段的 14 格循環；`--cycle once` 把停住當結尾，切不到放箭（西向只切 7 格）。→ 用 `--cycle fixed --start/--length`＋`--seam-max 99`（單次攻擊不會首尾相接）手動指定整段。
  4. 北向原影片第 91、93 格弓尖碰到上緣（構圖本身切到）→ `--allow-edge-contact`；西向第 89 格是箭飛出左緣，同樣放行。
- sprite-gen 的輸出是平滑縮放的影片幀（沒有還原像素、沒有鎖色盤）、每方向 64 格；遊戲裡用的是 `process_clips.py` 那版（9 格、鎖遊俠色盤）。

### 10. 混合版：sprite-gen 綠幕去背＋我們的後處理（比較用，**沒有接進遊戲**）
- `process_clips.py --source sprite-gen`：讀 `clips/sg/<x>/gframes/keyed/frame-NNNN.png`（NNNN＝影片格號＋1）→ 剝光暈／去飛箭／還原像素／鎖色盤／同樣 9 格／腳點 → `output/pixellab-anim-test/ranger-bow-clips-sg/`。
- 跟現在遊戲版（`ranger-bow-clips`，ffmpeg 去背）比：輪廓與姿勢一樣、不透明像素總數差 <1%；外框淺色像素（亮度 >190）混合版少 9–27%（東 510→370、南 435→398、北 181→159、西 205→159），邊緣略乾淨；
  內部顏色有細微偏移（多一次轉綠底＋H.264 壓縮，鎖色時落到相鄰色），每格 1000–3000 px 顏色不同但肉眼幾乎看不出。對照 GIF／放大圖已傳 TG。
- 要換成混合版：`add_bow_attack_rows.py` ROWS 的 `ranger-bow-clips/` 改成 `ranger-bow-clips-sg/`。

### 11. 影片版白邊 vs PixelLab → 補外框（✅ 已接進遊戲，見 12）
- 量法：`paladin-anchor-lab/clips/rim_vs_pixellab.py`（9 格外輪廓像素亮度；圖 `output/pixellab-anim-test/rim_vs_pixellab.png`）。
  PixelLab 外圈淺色（亮度 ≥150）1–8%、深色描邊（<70）56–64%；影片 ffmpeg 版淺色 22–38%／深色 16–25%；sprite-gen 混合版 18–31%／19–29%。
  原因不是去背：**PixelLab 每個角色外圍有 1 px 深色描邊，影片沒有**，邊緣是跟灰底混出來的柔邊，縮圖鎖色後變淺米／淺膚色一圈。
- `process_clips.py --source sprite-gen --outline` → `ranger-bow-clips-sg-ol/`：鎖色後（像素尺寸）先去邊（外輪廓比 8 鄰內側像素平均亮 30 以上的拿掉，最多 2 層，落單雜點清掉），
  再把外輪廓改成 PixelLab 遊俠的外框色（43,18,29）／（60,31,39）／（93,52,57）（依原亮度暗→亮）；弓弦、箭桿等沒有內側像素的細線不動。
  結果：外圈淺色 0.3–1.8%、深色 90–94%（比 PixelLab 更一致地深）；面積少 5–8%（被剝掉的就是那圈混色）、腳底／頭頂差 ≤2 px、0 雜點、不碰邊。對照圖／GIF／6 倍局部已傳 TG。
- 要換成這版：`add_bow_attack_rows.py` ROWS 的 `ranger-bow-clips/` 改成 `ranger-bow-clips-sg-ol/`。

### 12. 定案：影片轉圖一律用「sprite-gen 綠幕去背＋補外框」✅ 已接進遊戲（未 commit）
- 使用者 2026-10-23：「以後用這個處理方式」。`paladin-anchor-lab/clips/process_clips.py` 預設就是這條（灰底換綠 → `sprite-gen video-frames --key green --allow-edge-contact` → 剝光暈／去飛箭／還原像素／鎖色盤 → 補外框），
  輸出 `ranger-bow-clips-sg-ol/`；舊路線要明講 `--source ffmpeg`／`--no-outline`。從 clip.mp4 全部重跑一次，輸出跟之前逐位元相同。
- `add_bow_attack_rows.py` 東南北西 4 列改讀 `ranger-bow-clips-sg-ol/`，已重建兩種尺寸的表（改前備份 `output/pixellab-anim-test/_backup_before_outline/`）。
  QA（`qa_rows.py`）：不碰邊、0 雜點、0 殘留灰邊，小破洞比舊版少；北向腳底跨距 5 px（@2x）是影片本身（舊版就有 4 px）。`npm test` 11 PASS；實機連拍 4 方向都正常（GIF 已傳 TG）。

### 13. 遊俠補畫好的西向待機（idleLeft）＋ 1x 西向走路（walkLeft）✅ 已接進遊戲（未 commit）
- 問題：8 方向攻擊都不鏡像，但西向待機是東向待機的鏡像 → 一出手弓跳到另一隻手。另外 1x 表沒有 walkLeft（只有 @2x 有），1x 往左走也是鏡像。
- 新腳本 **`pipeline/scripts/pixellab/add_left_rows.py --hero ranger --source output/pixellab-incoming/788cd873 [--dry-run]`**：PixelLab 匯出的 `rotations/west.png` → idleLeft、`animations/*/west/*.png` → walkLeft，
  接法跟 `build_class_sheet.py` 的 align_rows 一樣（先驗證：用同一套接法重做現有 idle／idleDown／walk／@2x walkLeft，逐像素相同）。已有的列不動，缺的接在最下面。
  1x：新增 idleLeft、walkLeft（900×2000 → 900×2200）；@2x：新增 idleLeft（1800×4000 → 1800×4200）。改前備份 `output/pixellab-anim-test/_backup_before_left/`。不花額度。
- 驗收：idleLeft 跟 attackLeft 第 0 格輪廓重疊 0.91（鏡像待機 0.78）；實機（`capture_seq.mjs` 新增 `TAIL=<格數>`：攻擊完再多拍幾格）放箭後的待機面向西、弓在同一隻手。`npm test` 11 PASS。
- 還是鏡像的：斜向的待機／走路（walkDownRight／walkUpRight 往左時鏡像；PixelLab 匯出其實有 south-west／north-west 走路，要的話可以照同樣方式補，但引擎的 DIR_ACT 目前不找 walkDownLeft／walkUpLeft，要一起改）。

### 14. 實機攻擊動畫逐格都畫到（遊俠）✅（未 commit；改到 `src/pixel-world.js`）
- 問題：使用者要「實機動畫每格都顯示」。量測（`paladin-anchor-lab/measure_frames.mjs`：每個畫面記錄畫了哪一格）：引擎把蓄力 7 格擠在 0.3 秒、用 ease 曲線挑格，第 0–4 格每格只有 22–36ms；
  遊戲預設 30fps（一幀 33ms）又有 2–3 倍速 → 1 倍速第 0 格 7/10 次沒畫到，2 倍速固定跳過第 0、2、4 格（16 次攻擊 0 次完整）。
- 修法（只對攻擊列有 `windupFrameTime` 的職業生效，目前只有遊俠；魔物與其他職業不變）：
  1. `windupLen()`：蓄力長度＝蓄力格數 × `windupFrameTime`（遊俠 7 × 0.075＝0.525 秒），`combatPose` 多給 `out.wt`（蓄力經過時間），`sheetPose` 蓄力格改成等速逐格。出手時間點不變（attackTimer 歸零那刻；遊俠攻擊間隔 1.2 秒放得下）。
  2. `noSkip()`：畫面一幀最多前進一格；出手時間結束還沒播到最後一格就先播完（受擊、技能、倒下不等）；同一遊戲時間重畫停在同一格。
  遊俠 8 列加 `windupFrameTime: 0.075`（`add_bow_attack_rows.py` 的 TIMING，重跑後圖片逐位元相同）。
- 驗收（同一份建置，另做一份拿掉 windupFrameTime 的當對照，各量 12 秒）：0–8 全畫到 1x 3/10→7/11、2x 0/16→11/16、3x 0/4→3/5；一次攻擊中間跳格 2x 30→0、3x 6→0。
  剩下不完整的是遊戲本身：技能插進來打斷蓄力、走到怪旁第一箭直接射（沒有蓄力）、量測窗口頭尾。`npm test` 11 PASS。
- 實機逐格圖：`capture_seq.mjs` 新增 `UNIQ=1`（每格只拍一張、從蓄力第 0 格開始）、`OUTER=<倍速>`（等蓄力時的遊戲速度）→ `output/pixellab-anim-test/tg/ranger_every_frame_sheet.png`／`.gif`（已傳 TG）。

### 15. 遊俠（ranger）併入弓箭手（archer）＋弓箭手斜向待機 ✅（2026-10-24，未 commit）
- 使用者：「移除 ranger 只留 archer 這個職業」（兩個是同一個角色 PixelLab 788cd873）。弓箭手保留自己的數值與技能（疾風箭雨）。
- 圖：`assets/heroes/archer(@2x)` ＝ 原 ranger 表（8 方向拉弓、補外框、西向待機／走路、windupFrameTime）＋弓箭手自己的 1x skill 列；`assets/heroes/ranger*` 移出（`output/pixellab-anim-test/_removed_ranger_assets/`）；
  合併前兩張表備份 `output/pixellab-anim-test/_backup_before_merge/`。之後重接攻擊列：`add_bow_attack_rows.py --hero archer`（預設已改 archer）。
- 程式：`pixel-data.js` CLASSES／SKILLS 拿掉 ranger；`pixel-game.js` restore 把舊存檔的 ranger（獵人、訪客、流浪英雄）轉成 archer（實測：Lv17「舊遊俠」→ archer Lv17、同名）；
  攻擊間隔／箭矢判斷的 ranger → archer；`pixel-world.js` 遠程後座（ranged）、蓄力光顏色、收招格例外、SKILL_FX 的 ranger → archer（弓箭手原本不在 ranged 名單，出手是近戰往前衝的位移，現在改成遠程後座）；`concept-props.js` 村莊擺設 4 個 ranger → archer。
- 測試：開局 5 人現在剛好一職一人（含獵魔人）→ test-pixel-game「訪客要有獵魔人」改成「訪客或隊伍有獵魔人」；導航穿牆檢查原本用 b.w/b.d+0.3，比導航設計的走道（實心 SOLID 外 0.45/0.75）還嚴，
  換了職業組合後獵魔人沿城鎮大廳旁走道（離地基 0.05）被誤判 → 改用 `buildingSolid`（跟 test-landscape 同一份）。`npm test` 11 PASS。
- 斜走停下轉正面：沒有斜向待機列 → dirSuffix 退回 idleDown／idleUp。`pipeline/scripts/pixellab/add_dir_rows.py`（原 add_left_rows.py，加 `--rows`、防呆：先重做現有 idle 要逐像素相同）
  `--hero archer --source output/pixellab-incoming/788cd873 --rows idleDownRight,idleUpRight` → 1x 900×2400、@2x 1800×4600。左下／左上＝鏡像（跟 walkDownRight／walkUpRight 一樣）。
  實機（`paladin-anchor-lab/diag_idle.mjs`）：修正前停下 idleDown／idleUp → 修正後 idleDownRight／idleUpRight（左邊翻轉）。其他職業沒動（使用者：只檢查弓手）。

### 16. 弓箭手左斜改用畫好的圖＋移除獵魔人 ✅（2026-10-24，未 commit）
- 使用者貼了左下／右下兩張參考圖（＝PixelLab 788cd873 的 south-west／south-east 原圖，逐像素相同）→ 左下不要用右下鏡像。
  `add_dir_rows.py --rows idleDownLeft,idleUpLeft,walkDownLeft,walkUpLeft`（south-west／north-west 旋轉＋走路）→ archer 1x 900×2800、@2x 1800×5400；
  引擎 `leftRow`：面向左的 idle／walk 斜向列（…DownRight／…UpRight），表上有 …DownLeft／…UpLeft 就直接用、不鏡像（其他職業沒有這些列 → 照舊鏡像）。
  注意：`__mistvaleFacing()` 記的是 leftRow 之前的列名（左斜仍顯示 walkDownRight＋翻），要看截圖；`paladin-anchor-lab/diag_idle.mjs` 前後對照截圖已傳 TG。
- 移除獵魔人（witchhunter）：CLASSES／SKILLS 拿掉；舊存檔的獵魔人跟遊俠一樣轉成弓箭手（實測 Lv9「舊獵魔」→ archer Lv9）；攻擊間隔／箭矢／遠程後座／蓄力光／收招格的 witchhunter 判斷拿掉；
  `offerNewClass()` 原本把獵魔人推成訪客，現在 CLASS.witchhunter 不存在 → 直接返回（留著給下次新職業）；`assets/heroes/witchhunter.*` 移到 `output/pixellab-anim-test/_removed_witchhunter_assets/`。
  剩 4 職業（狂戰士、聖騎士、魔法師、弓箭手），開局 5 人＝4 職各一＋1 位狂戰士；test-pixel-game 的「開局職業數」改成 min(5, 職業數)。`npm test` 11 PASS。

### 17. 刺客（assassin）加回成可招募職業 ✅（2026-10-24，未 commit）
- 使用者：「原本有刺客不見了做回來」。查證：刺客（PixelLab 3d3020ce，`assets/heroes/assassin`）從來不是 CLASSES 的職業，2026-10-11 只是「設定頁→新增所有職業」叫進村的街上角色（這個按鈕一直都能叫出來）。
  依前後文（使用者在整理職業名單）做成可招募職業。
- `pixel-data.js`：CLASSES 加 `{id:'assassin',name:'刺客',tag:'近戰 / 暗殺',hp:100,attack:23,defense:2,speed:3.1,range:1.2,cost:160,…}`；SKILLS 加 `assassin:{name:'暗影衝刺',kind:'single',cd:8,mult:2.4,lock:.6,fx:'slash'}`
  （數值與技能是新訂的：近戰、快、攻高血低，介於狂戰士與弓箭手之間；技能照 HANDOFF 2026-10-12 的「匕首連刺、暗影衝刺」設定）。攻擊間隔用近戰預設 1.1 秒。
- 職業回到 5 個（狂戰士、聖騎士、魔法師、弓箭手、刺客），開局 5 人一職一人。`npm test` 11 PASS。實機：普攻往前衝、匕首揮砍、命中都正常（`output/pixellab-anim-test/tg/assassin_attack.png`）。
- 刺客的攻擊列沒有 windupFrameTime（蓄力格仍可能被跳過，實測第 1 格沒畫到）；@2x 沒有攻擊／技能列（自動退回 1x）。

### 18. 刺客 8 方向攻擊（使用者在 PixelLab 網站生成）✅ 已接進遊戲（2026-10-24，未 commit）
- 來源：下載資料夾 8 個 GIF（`Idle_custom-*_<方向>.gif`）→ 複製到 `output/pixellab-incoming/assassin-attack-8dir/gif/<方向>.gif`。256×256、跟 PixelLab 旋轉圖同比例（＝@2x 1:1）。
  動作：雙手拔匕首 → 高舉 → X 字斬（白色刀光）→ 收招。prompt 演進見對話：拔刀後多出匕首 → 寫死「只有兩把、拔出後刀鞘是空的」；背面轉身 → 每格寫 from behind、不提面罩；網站 prompt 上限 1000 字。
- 新腳本 **`pipeline/scripts/pixellab/add_attack_rows_gif.py`**（通用：8 個 GIF → 8 個攻擊列；挑格另存 `output/pixellab-anim-test/<hero>-attack-8dir/<方向>/NN.png`）：
  `--hero assassin --src output/pixellab-incoming/assassin-attack-8dir/gif --pick south=0,3,5,8,11,12,14,17,36 --pick south-east=0,1,2,3,3,4,5,6,8 --pick south-west=0,1,2,3,3,4,5,6,8 --release 5 --impact 6 --foot2x 30`
  - 南向那次生成了 41 格 → 挑 9 格對齊其他方向的節奏；東南／西南的大刀光在第 4 格（其他在第 5 格）→ 第 3 格停一拍、少一格收招，讓 8 方向都在第 5 格出手。
  - 刀光會伸到腳下（東南往下 26 px）→ 攻擊列自帶 footFromBottom（@2x 30／1x 15，格子大小不變 200／100）；8 列都不碰邊、沒有被格子切掉的像素。
  - 節奏 frameTime .075、release 5、impact 6、windupFrameTime .075（每格都畫到；實測 1x／2x 一次攻擊中間跳格 0）。1x 原本 l0veyou 的 attack 列換掉，skill 列保留。備份 `output/pixellab-anim-test/_backup_before_attack8_assassin/`。
- `pixel-game.js`：刺客普攻的效果改成 `hit`（只有命中火花），遊戲自己的刀光弧不畫（刀光在攻擊列裡）。`npm test` 11 PASS。實機逐格圖 `output/pixellab-anim-test/tg/assassin_every_frame_sheet.png`（已傳 TG）。

### 19. 刺客南向試用原始 41 格（加速到原本攻擊時長）✅ 試看中（2026-10-24，未 commit）
- 使用者：「41 格都進去南向，加速播放到原本刺客攻擊時長讓我看」。`pipeline/scripts/pixellab/assassin_south41.py`（`--revert` 換回 9 格；9 格那列設定存在 attackDown9、圖不動）。
- 引擎（`pixel-world.js`）：
  - `sheetFrame`／動作實驗室預覽：列有 `cols` 就每 cols 格換行（41 格單行會讓 @2x 表寬 8200 px）。
  - `sheetPose`：方向列有 `ownTiming` 就用自己的 release／frameTime／windupFrameTime（原本 8 方向都用 attack 列的節奏）。
  - `noSkip`：列有 `noSkip:false` 就照時間挑格（不逐格拖長）。
- 南向列：41 格、每行 9 格；release 12（大 X 字）、impact 13；蓄力 12 格 × 0.03125＝0.375 秒、出手 29 格 × 0.010345＝0.3 秒（跟其他方向一樣長）。
- 實測（`measure_frames.mjs` 新增 `OFF=dx,dz` 把魔物擺到指定方向）：每次攻擊 0.73–0.77 秒（＝原本長度＋命中停頓）；遊戲 30fps 下 41 格約畫出 22 格（蓄力 12 格幾乎全畫、出手段大約每 3 格畫 1 格），2 倍速約 12 格。
  60fps 對照影片 `output/pixellab-anim-test/tg/assassin_south41_vs_9_60fps.mp4`（已傳 TG）。`npm test` 11 PASS。

### 20. 法師 8 方向攻擊（PixelLab 網站 spritesheet）✅（2026-10-25，未 commit）
- 使用者在網站用「手勢發射魔法球、球外型固定」的 prompt（`paladin-anchor-lab/pl/prompts_8dir.py`，md 在桌面 `法師-8方向-256/attack-prompt-v3-8dirs.md`）生成 8 方向，下載的是 spritesheet PNG（768×768＝3×3、9 格，不是 GIF）。
  複製到 `output/pixellab-incoming/sorcerer-attack-8dir/src/`；第 0 格跟桌面 `法師-8方向-256/idle` 旋轉圖逐像素相同，用這個對出方向 → `named/<方向>.png`。
- `add_attack_rows_gif.py` 新增：讀 spritesheet PNG（`--tile 256`）、`--cell2x`（攻擊列自己的格子大小）、`--flag`（列設定）。
  `--hero sorcerer --src output/pixellab-incoming/sorcerer-attack-8dir/named --release 5 --impact 6 --foot2x 64 --cell2x 256 --flag bakedMotion --flag fxInSprite`
  格子 @2x 256／1x 128、腳底 64／32＝256 原圖整格 1:1 放進去，飛出去的魔法球一個像素都沒被切（法球本來就碰到 256 邊的只有東北 5–6、西北 6–7、北 7）。1x 舊的 attack 列（cell 100）留在表上沒用到，skill 列不動。備份 `output/pixellab-anim-test/_backup_before_attack8_sorcerer/`。
- 引擎：`chargeGlow` 遇到攻擊列 `fxInSprite` 就不畫蓄力光點（魔法球已畫在手上）。`bakedMotion`＝不疊執行期假前衝／切身體。
- 實測（`measure_frames.mjs`，8 個方向）：每次攻擊 0–8 格全畫到、0.73–0.77 秒、中間跳格 0；每 7 秒有 1 次在蓄力第 4 格被技能（castSkill）接走＝原本的遊戲邏輯。`npm test` 11 PASS。
  實機逐格 `paladin-anchor-lab/seq_sorc_final/contact.png`、`all8.gif`（已傳 TG）。
- 已知：遊戲自己的飛行法球（`drawProjectile` spell＝fxOrb 深紫星光球）跟 PixelLab 畫的淡紫白心球長得不一樣；PixelLab 有幾個方向出手後自己畫了飛出去的球／光束（東南、西北、東北、北），出手時會看到兩顆球。待使用者決定要不要統一。

### 21. 每個職業斜向攻擊完不再轉向 ✅（2026-10-25，未 commit）
- 使用者：「修正每個職業，在原本面向斜向攻擊後會自己轉向到其他方向」。原因：攻擊列 8 方向都有，但只有弓箭手有斜向待機列；
  攻擊完方向（vdir）維持斜向，`dirSuffix` 找不到 idleDownRight／idleUpRight 就退回 idleDown／idleUp＝轉成正面／背面（斜走停下也是同一個原因）。
- 修法：`add_dir_rows.py`（新增 `--glob 列=來源`）幫刺客、法師、聖騎士、狂戰士補齊 idleLeft、idleDownRight、idleUpRight、idleDownLeft、idleUpLeft、walkDownLeft、walkUpLeft（1x 缺的 walkLeft 也補）。
  左斜／左向用畫好的圖（引擎 `leftRow` 有就用、不鏡像），武器不會換手。來源跟指令寫在 add_dir_rows.py 檔頭；四份都通過防呆（重做 idle 逐像素相同），右斜走路也重做比對過。
  刺客南西走路有兩次生成，用 ac3bf8ab（斗篷擺動跟東南一樣）。聖騎士 @2x walkUpRight 跟 d06dcc3a 來源不同（之前被改過），沒動它。備份 `output/pixellab-anim-test/_backup_before_dirrows_<職業>/`。
- 驗證：`paladin-anchor-lab/dirfix/after_attack.mjs`（5 職業 × 4 斜向，魔物定住在斜對角，記錄兩次攻擊之間站著的畫面）：20 組全部 OK（右斜＝idle<斜向>、左斜＝同一列 f<0 → 畫好的左斜列）。
  `SHOTS=1` 截實機圖 → `dirfix/after_attack_sheet.png`（已傳 TG）。`npm test` 11 PASS。

### 22. 法師魔法球、弓箭手箭矢改用動畫裡擷取的圖 ✅（2026-10-25，未 commit）
- 使用者：「魔法師的魔法球丟出去的素材改用剛剛生成的素材內擷取，弓箭的箭矢也是一樣方法擷取」。
- `pipeline/scripts/pixellab/extract_projectiles.py`：
  - 球＝法師 south-west 第 6 格離手的球（跟身體分開的連通塊 26×26，原樣取出）。
  - 箭＝弓箭手 @2x attack 第 5 格，握弓手右邊的箭頭＋箭桿（原樣），後半段被手臂擋住 → 用同一格箭桿像素往左接長到 80 px；看不到羽毛就不加。
  - 放在職業表最下面一列，meta `projectile {x,y,w,h,from}`；1x 每 2 px 取 1，起點選留下最多深色外框的那組（箭桿深-淺-深，取錯只剩淺色一條）。
- 引擎 `classProjectile`（pixel-world.js，drawProjectile 前）：攻擊者職業有 `projectile` 就畫它，跟角色同一個像素密度、同一套 1x/2x；箭依飛行方向旋轉、球不轉；
  球不再疊程序光圈與拖尾；箭保留原本淡白色的飛行線。沒有 projectile 的職業照舊用 vfx 圖集。技能走同一個 drawProjectile 的也會用到。
- 驗證：`paladin-anchor-lab/projfx/proj_still.mjs`（定格：每 5 ms 把投射物放回 20%／45%／70% 進度），前後對照 `projfx/proj_compare.png`（已傳 TG）。`npm test` 11 PASS。
- 注意：球照「手上那顆」的大小畫，比原本的 fxOrb 光球小很多；要放大要另外決定倍數。

### 23. 撤回 22，改回原本的魔法球／箭，縮小到動畫裡的大小 ✅（2026-10-25，未 commit）
- 使用者：「取消改用原本的素材，縮小到跟攻擊動畫內的大小一樣」。
- 撤回：法師／弓箭手 4 張表與 json 從 `output/pixellab-anim-test/_backup_before_projectile_<職業>/` 還原（8 方向列都還在，只少了 projectile 那一列）；
  `extract_projectiles.py` 與引擎 `classProjectile` 刪掉。
- 縮小（pixel-world.js drawProjectile 上方 `ORB_SIZE`／`ARROW_SIZE`）：
  - 球：動畫裡手上的球直徑約 26 px（@2x，身高 132）＝4.1 單位；fxOrb 球本體約佔圖 80–90% → 畫 5（原本 11），程序光圈與拖尾同比例縮（×5/11）。
  - 箭：拉滿弓的箭（箭尖到拉弦手）約 80 px（@2x，身高 134）＝12.5 單位；arrowFx 箭沿對角線、長＝邊長×1.29 → 畫 9.7（原本 13）。
- 驗證：`projfx/proj_still.mjs` 三組對照 `projfx/size_compare.png`（原本／22 的擷取圖＝動畫大小／這次），大小跟動畫裡相符（已傳 TG）。`npm test` 11 PASS。

### 24. 法師：刪掉被圖框切掉的魔法球；手動操控的魔法球改成真的會飛、路徑上都打 ✅（2026-10-25，未 commit）
- 使用者：「法師攻擊動畫的魔法球刪除被圖框遮住的部分，然後空打時候要朝攻擊方向發射魔法球，朝攻擊時候當下的朝向角度發射，球體設定一個作用範圍，路徑上碰到的怪物要被攻擊到」。
- 動畫：`pipeline/scripts/pixellab/clean_edge_fx.py`（特效色＝色相 245–335° 且飽和度 ≥0.7，或近白；碰到 256 畫布邊的特效連通塊整塊刪，
  加上跟身體分開又碰邊的 <200 px 碎片）→ `named-clean/`；刪了西北 6（−2123 px）、西北 7、北 7、東北 5（−2540）、東北 6（−485）。
  用 `add_attack_rows_gif.py --src …/named-clean`（其他參數同 §20）原地重接 8 列；北 7 的頭飾錨點順便修好（原本被上緣碎片誤判）。備份 `_backup_before_edgeclean_sorcerer/`。
- 手動操控法師（`pixel-game.js` pilotStep／`stepShots`，常數 `PILOT_ORB` in pixel-data.js）：出手不再瞬間扣血，改成發一顆真的會飛的球
  （`state.shots`；存檔不存）。3.2 格內有魔物就朝牠，沒有就朝 `pilot.faceX/faceZ` 的角度（不吸附 8 方向）；速度 12 格/秒、飛法師射程 4.5 格；
  每一步掃「魔物到這段路徑距離 ≤ 0.7 格」，每隻打一次（穿透），王不算；命中才扣血＋命中特效＋傷害數字。飛行畫面是同速度的 spell 特效（`noImpact`，飛完不爆）。
  AI 控制的法師不變。
- 測試：test-pixel-game.mjs 新增一段（空打角度、路徑上兩隻都中、偏離 1.6 格不中、每隻只中一次、飛完消失、3.2 格內自動瞄準）。`npm test` 11 PASS。
  實機：`paladin-anchor-lab/projfx/pilot_orb_shots.mjs`（路徑上兩隻石魔像各 −34、偏離的史萊姆沒中），圖已傳 TG。

### 25. 手機卡頓：真機回報＋手機關 2x＋影子／換色記憶體上限 ✅（2026-10-26，未 commit）
- 真機量測：網址加 `?perf=1` → 左上綠字，每 3 秒 POST `/perf`（server.mjs 寫 `output/perf-log/perf-<UTC日期>.jsonl`）。
- 觸控裝置不用 2x 英雄表（`heroHiAllowed=!coarsePointer`）：iPhone 放大時掉到 6–16 fps 的主因。
- 影子快取改成有上限的 LRU（手機 600 萬像素、桌機 3200 萬；手機影子半解析度 64 px）。`__mistvaleShadows()` 看數量。
- 英雄換色（外觀 shift/rich/gold）改成「用到哪一格才換那一格」（`variantCell`，每幀最多新換 12 格，手機上限 400 萬像素、桌機 1600 萬），
  取代整張表換色（`variantImg`/`pumpVariants`）。`__mistvaleVariantCells()` 看數量。
- 驗證：`npm test` 11 PASS；桌機逐像素 S2/S5/S6/S7 相同，S1 差在舊版換色未完成時先畫原色、S3/S4 腳底邊緣 13 px；
  手機模擬記憶體：影子約 95 MB 還在長 → 約 24 MB 封頂，換色約 95 MB+ → 約 16 MB 封頂；封頂後重建量影子約 4.6 張/秒、換色約 2.3 格/秒。
