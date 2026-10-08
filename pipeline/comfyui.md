# 旁支管線：ComfyUI（本機 SD 生變體／實驗）

Mistvale 素材的**次要／備援管線**。用本機 SDXL（`D:\AI\ComfyUI`，RTX 3070 Ti 8GB）
生素材，**離線、免費、無限**，但能力比不上 Codex ImageGen。

**什麼時候用**：生「現有 12 棟建築的變體」（配色／材質／等級外觀），或 Codex 額度用完時。
**別用它**：生全新建築類型、或 28×35 以下的小圖（會糊）。

完整配方（含啟動參數、模型清單、提示詞模板、量化表、ControlNet 實測）已複製到
**[`reports/RECIPE.md`](reports/RECIPE.md)**，那頁是權威，這裡只摘重點與判斷。

---

## 一句話結論

> **img2img 為主，控制不了的交給 ImageGen，ControlNet 先擱著。**

三種方法實測（基準＝`buildings14.png`）：

| 方法 | 角度 | 風格達標 | 速度 | 結論 |
|---|---|---|---|---|
| **img2img denoise 0.62** | ✅ 保住 | ✅ 全達標 | 42s 穩定 | **推薦** |
| ControlNet depth | ✅ 鎖死 | ❌ 飽和 0.66→0.41 | 29~480s 不穩 | 角度對但風格崩 |
| 純文字生圖 | ❌ 只有正面 | — | — | 不可用 |

## 穩定配方（量化全達標）

```
img2img denoise 0.62  +  pixel-art-xl LoRA 0.8  +  IPAdapter 0.35
參考圖 = 去背建築 mistvale_ref_iso.png
底圖   = 從 buildings14.png 切出單格、放大到 1024
```

產出對照 `buildings14` 基準：色相 34°（基準 32°）、色相 IQR 262（201）、暖色 73%（72%）、
描邊 7.2%（8.5%）——全部達標。

## 啟動（8GB 必須這樣開，不然假死）

```bat
cd /d D:\AI\ComfyUI
venv\Scripts\python.exe main.py --port 8188 ^
  --fp8_e4m3fn-unet --fp8_e4m3fn-text-enc ^
  --disable-dynamic-vram --reserve-vram 0.5
```

> `--disable-dynamic-vram` **是關鍵**。不加的話第 3 張之後每步從 1.2s 變 **1647s**。

## 跑一張

```bat
venv\Scripts\python.exe run_mistvale.py ^
  --name tavern_v2 --prompt "pixel art sprite of one single medieval tavern with a purple roof, ... isolated cutout on a flat plain magenta background. Thick dark outlines, crisp pixels. No text, no people, no border." ^
  --init mistvale_init_tavern.png --denoise 0.62 ^
  --ref mistvale_ref_iso.png --ip 0.35 --seed 5001 --steps 30
```

## 量化驗證

```bat
venv\Scripts\python.exe mistvale_compare.py   # 跟基準並排＋出色相/飽和/暖色等數字
```

目標值（對齊 `buildings14.png`）：飽和 ~0.66、色相 ~32°、色相 IQR ~200、描邊 4-9%、暖色 70-93%。

---

## 腳本（`scripts/comfyui/`，已複製）

| 腳本 | 用途 |
|---|---|
| `run_mistvale.py` | Mistvale 風格生成（SDXL+LoRA+IPAdapter+ControlNet+img2img） |
| `mistvale_compare.py` | 量化風格差距＋並排圖 |
| `make_depth.py` | ControlNet 深度圖（洋紅背景遮黑） |
| `pixelize.py` | 去背／量化核心，可獨立 CLI |
| `run_gen.py` | 生圖＋自動後處理 |
| `sprite_out.py` | 批次去背轉檔 |
| `selftest.py` | 一鍵環境自檢 |

## 環境地雷（踩過）

1. `--disable-dynamic-vram` 必加（見上）。
2. server 會累積 VRAM，跑一輪閒置仍佔 3.8GB → **不同任務間重啟 server**。
3. `--no-ref` 會失去洋紅底（洋紅是 IPAdapter 從參考圖帶來的，純提示詞壓不出）。
4. 參考圖是 4×3 拼貼時，主詞太抽象會被帶成「磁磚拼貼」→ 用明確主詞或單棟參考。
5. 8GB 同掛 SDXL+ControlNet+IPAdapter 太擠 → 要 ControlNet 就關 IPAdapter。

## 早期修過的環境 bug（`selftest.py` 現在全綠）

Sprite 尺寸亂跳（→固定整數倍率）、小圖 `NaN` 崩潰（→空峰值防護）、假的「像素格對齊」
（→繞掉改本機後處理）、說 32 色給 12 色（→調色盤只花在主體）、去背殘塊（→色相法＋連通＋despill）、
torch cu128→cu130（快 30%）、補 triton-windows。

## 參考圖（`D:\AI\ComfyUI\input\`）

| 檔案 | 用途 |
|---|---|
| `mistvale_ref_iso.png` | 12 格去背建築拼貼 —— **建議的風格參考** |
| `mistvale_ref_one.png` | 單棟 —— 想要更集中的風格 |
| `mistvale_style_ref.png` | `title.png`（有天空草地）—— **不建議**，會搬進整個場景構圖 |
| `mistvale_init_*.png` | 從 buildings14 切出的單格（img2img 底圖） |
