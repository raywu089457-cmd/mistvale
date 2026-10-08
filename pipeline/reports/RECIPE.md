# Mistvale 像素素材生成配方（實測驗證過）

環境：`D:\AI\ComfyUI`，RTX 3070 Ti 8GB

## 環境設定（重要，8GB 一定要這樣開）

```bat
cd /d D:\AI\ComfyUI
venv\Scripts\python.exe main.py --port 8188 ^
  --fp8_e4m3fn-unet --fp8_e4m3fn-text-enc ^
  --disable-dynamic-vram --reserve-vram 0.5
```

| 參數 | 為什麼要 |
|---|---|
| `--fp8_e4m3fn-unet` | SDXL UNet 從 4896MB 降到 2448MB，8GB 才塞得下 |
| `--fp8_e4m3fn-text-enc` | 兩個文字編碼器再省一半 |
| `--disable-dynamic-vram` | **關鍵**。開著的話第 3 張之後會開始瘋狂搬頁，實測每步從 1.2 秒變 **1647 秒** |
| `--reserve-vram 0.5` | 留給桌面，不然會爆 |

實測速度：冷啟動第一張 ~490s，之後每張 **42-52s**（1024×1024 / 30 步）。

## 模型

| 檔案 | 位置 |
|---|---|
| `sd_xl_base_1.0.safetensors` | `models/checkpoints/` |
| `pixel-art-xl.safetensors` | `models/loras/` |
| `ip-adapter-plus_sdxl_vit-h.safetensors` | `models/ipadapter/` |
| `CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors` | `models/clip_vision/` |

節點：`custom_nodes/ComfyUI_IPAdapter_plus`

## 風格參考圖（`input/`）

| 檔案 | 內容 | 用途 |
|---|---|---|
| `mistvale_ref_iso.png` | 12 格去背建築拼貼 | IPAdapter 風格參考（建議） |
| `mistvale_ref_one.png` | 單棟建築 | 想要更集中的風格 |
| `mistvale_style_ref.png` | `title.png`（有天空草地） | **不建議**，會把整個場景構圖搬進來 |
| `mistvale_init_{tavern,forge,academy,dungeon}.png` | 從 `buildings14.png` 切出的單格，放大到 1024 | img2img 底圖 |

## 兩種模式

### 模式 A：img2img（**推薦**，角度一定對）

用真的 3/4 建築當底圖，只改材質與配色。實測 denoise 0.5 ~ 0.62 都能保住俯視角度。

```bat
venv\Scripts\python.exe run_mistvale.py ^
  --name tavern_v2 ^
  --prompt "pixel art sprite of one single medieval tavern with a purple roof, barrels and hanging lanterns, isolated cutout on a flat plain magenta background. Fine detailed 16-bit pixel art, purple roof, green shutters, blue hanging sign, brown timber, grey stone foundation, warm amber lantern light. Thick dark outlines, crisp pixels. No text, no people, no border." ^
  --init mistvale_init_tavern.png --denoise 0.62 ^
  --ref mistvale_ref_iso.png --ip 0.35 ^
  --seed 5001 --steps 30
```

### 模式 B：純文字生圖（角度**不可控**）

只能生正面平視，不是 Mistvale 的 3/4 俯視。除非你就是要正面圖，否則別用。

```bat
venv\Scripts\python.exe run_mistvale.py --name new_thing --subject "..." --ref mistvale_ref_iso.png --ip 0.5
```

## 量化驗證（`mistvale_compare.py`）

| 指標 | `buildings14.png` | img2img d0.62 | 判定 |
|---|---|---|---|
| 飽和 | 0.66 | 0.57 | 略低 |
| 明度 | 0.46 | 0.40 | 略暗 |
| 色相 | 32° | 34° | ✅ |
| 色相多樣性 (IQR) | 201 | 262 | ✅ |
| 描邊比例 | 8.5% | 7.2% | ✅ |
| 暖色佔比 | 72% | 73% | ✅ |
| 冷色佔比 | 14% | 16% | ✅ |

## 已知限制

- **img2img 只能生「現有 12 棟的變體」**。要憑空生全新的建築類型，角度還是會跑掉，得上 ControlNet。
- **純文字生圖控制不住攝影機角度**。提示詞寫滿「isometric / three-quarter / tilted down 45 degrees」、IPAdapter 拉到 0.75 都一樣。拉到 0.75 用 `style and composition` 角度會接近，但會把參考圖的多棟構圖一起抄進來。
- 輸出像素塊比原圖略粗。原圖是 1254px 裡 313px/棟；我們生 1024 再降。要更細得先生更高解析度再降採樣。
- 主體殘留洋紅 0.01-0.3%，肉眼看不到，但存在。

---

# ControlNet（實測結果：角度成功、風格失敗）

## 檔案

| 檔案 | 位置 | 大小 |
|---|---|---|
| `controlnet-depth-sdxl-xinsir.safetensors` | `models/controlnet/` | 2.33 GB |
| `controlnet-canny-sdxl-xinsir-v2.safetensors` | `models/controlnet/` | 2.33 GB |
| `aux_models/depth-anything-v2-small/` | Depth Anything V2 Small（transformers 版） | ~100 MB |

`make_depth.py` 負責產生深度圖。**注意它會把洋紅背景遮成黑色** —— 因為 Depth Anything
沒有「背景」這個概念，不遮的話洋紅底會被估成一片中灰，ControlNet 會把它當真的幾何去生東西。

```bat
venv\Scripts\python.exe make_depth.py input/mistvale_init_tavern.png -o projects/mistvale/depth
```

## 結果

```bat
venv\Scripts\python.exe run_mistvale.py --name new_thing ^
  --prompt "..." --controlnet controlnet-depth-sdxl-xinsir.safetensors ^
  --cn-image mistvale_depth_tavern.png --cn-strength 0.5 --cn-end 0.6 ^
  --ref mistvale_ref_iso.png --ip 0.5
```

**✅ 角度完全正確。** ControlNet-depth 真的把 3/4 俯視鎖死了 —— 屋頂面、牆面斜角、
地基、門洞內凹全部跟參考圖一致，而建築造型可以是全新的。測過兩次都成功。

**❌ 但風格被压壞了：**

| 指標 | 基準 `buildings14` | img2img d0.62 | ControlNet depth |
|---|---|---|---|
| 飽和 | 0.66 | 0.57 | **0.41** ✗ |
| 色相 | 32° | 34° | 18° |
| 色相 IQR | 201 | 262 | **336** ✗（色太雜） |
| 描邊 | 8.5% | 7.2% | 9.7% |
| 暖色 | 72% | 73% | 88% |

整體洗白、像蒙一層灰、出現細網點（LoRA 的硬邊風格被 ControlNet 壓下去）。

**❌ 速度极不穩定：** ControlNet 多佔 2.33GB，在 8GB 上觸發大量 lowvram patching，
同一組參數從 29 秒到 480 秒都出現過。

**❌ 洋紅底更淡：** 變成暗紫紅 `(162,93,139)`。還是均勻的所以去背能用，但不是電光洋紅。

## 結論

要**全新建築類型**才需要 ControlNet，但要接受風格損失再調。
要**現有建築的變體**，img2img d0.62 明顯更好（量化指標全部達標）。

---

# 環境地雷（實測踩過）

1. **`--disable-dynamic-vram` 是必須的。** 開著的話第 3 張之後每步從 1.2 秒變 **1647 秒**。
2. **server 會累積 VRAM。** 跑一輪之後閒置也佔 3.8GB，後續品質與速度都會退化。
   不同任務之間直接重啟 server，別硬撑。
3. **`--no-ref` 會失去洋紅底。** 純提示詞壓不出乾淨洋紅 —— 洋紅底是 IPAdapter 從參考圖帶進來的。
4. **參考圖如果是 4×3 拼貼，主詞容易被帶成圖案。** 主詞太抽象（例：溫室+盆栽）時，
   模型會生出「磁磚拼貼」而不是一棟建築。對策：用主詞明確的敘述，或改用 `mistvale_ref_one.png` 單棟參考。
5. 8GB 同時掛 SDXL + ControlNet + IPAdapter 太擠。要 ControlNet 就把 IPAdapter 關掉（省 1.2GB CLIP-Vision）。

