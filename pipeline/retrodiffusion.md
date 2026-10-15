# Retro Diffusion 管線（第五套生圖／動畫來源）

[retrodiffusion.ai](https://retrodiffusion.ai) —— 專門做**真像素**（不是「看起來像素化」）的 AI。
我們用它最多的功能是 **Advanced Animations**：丟一張現成的像素圖進去，直接生出走路／待機／攻擊等動作，
**角色不會被重畫**（原生色盤、尺寸都保留）。

> **一句話：要「一張圖直接變動作、保真度最高」→ 用 Retro Diffusion；要「自己控每一格關節點」→ PixelLab v1；要「便宜生方向」→ PixelLab v2。**

---

## 1. 帳號與額度

| 項目 | 內容 |
|---|---|
| 帳號 | 使用者自行註冊（登入支援 Google） |
| 免費額度 | 新帳號送 **$0.50 ≈ 50 credits**，不用信用卡 |
| token | <https://retrodiffusion.ai/app/devtools> →「API Keys [+]」→ **完整值只顯示一次**，之後只留前綴 |
| 存哪 | repo 外：`C:\Users\ray\.retrodiffusion-token`（已列 `.gitignore`）；或用環境變數 `RD_TOKEN` |

---

## 2. API 重點（跟 PixelLab 不一樣的地方）

```
POST https://api.retrodiffusion.ai/v2/inferences      標頭：X-RD-Token: <key>   ← 不是 Authorization: Bearer
→ 回 {"task_id": ...} → 輪詢 GET /v2/inferences/tasks/{task_id}
→ 成品在 result.base64_images（PNG／GIF 的 base64）
```

| 端點 | 用途 |
|---|---|
| `POST /v2/inferences` | 生圖／生動畫（同一個入口，靠 `prompt_style` 選模型） |
| `GET /v2/inferences/credits` | 查餘額 |
| `GET /v2/inferences/tasks/{id}` | 輪詢任務 |
| `GET /v2/styles/selector` | 列出所有可用的 `prompt_style` |
| `POST /v2/inferences` ＋ `check_cost: true` | **免費試算**成本 |

### Advanced Animations（我們主力）

```json
{
  "prompt_style": "rd_advanced_animation__walking",
  "input_image": "<base64>",      // 必填，32–256 px、8 的倍數
  "width": 128, "height": 128,
  "frames_duration": 8,           // 4/6/8/10/12/16
  "num_images": 1,
  "return_spritesheet": true      // 給 PNG 格狀圖，不然回 GIF
}
```

動作：`walking`、`idle`、`jump`、`crouch`、`attack`、`destroy`、`subtle_motion`、`custom_action`（自己描述）、
`rotate`（**不是動作**，是把一張圖轉出另外 7 個方向）。

### 所有「走路」相關樣式（87 個樣式裡挑出來的，2026-10-10 實測）

| `prompt_style` | 尺寸 | 內容 | 吃圖？ | 實測 |
|---|---|---|---|---|
| `rd_advanced_animation__walking` | 32–256 | 上傳一張現成圖 → 該角色走路（**單一方向**）| **要 input_image** | ✅ **最好用**：14 色、尺寸穩、$0.14/8 格 |
| `rd_advanced_animation__rotate` | 32–256 | 上傳一張圖 → 另外 7 個方向 | 要 input_image | 沒測（$0.10）|
| `rd_animation__battle_sprites` | 64 | 4 方向 ×（3 待機 + 6 走路 + 2 跳 + 3 攻擊）= 56 格 | 純文字 | ❌ **不能用**：角色只 13×32 px、服裝全沒出來（$0.07）|
| `rd_animation__large_walking_idle` | 64 | 4 方向走路 ＋ 待機 | 純文字 | ❌ 兩次都 502（官方說失敗會退費）|
| `rd_animation__four_angle_walking(_idle)` | 48 | 4 方向、4 格走路 | 純文字 | 沒測（48 px 更小）|
| `rd_animation__small_sprites` | 32 | 4 方向走路／攻擊／張望／驚訝／倒地 | 純文字 | 沒測（32 px 太小）|
| `rd_animation__8_dir_rotation` | 80 | 8 方向轉盤 | 可用參考圖 | — |

**結論**：那些「一次給你完整四方向走路」的樣式**全部是純文字、而且只到 48–64 px**
（`supports_reference_images: false`）—— 不能用我們的角色圖，畫布小到角色只剩 30 px 上下。
**要保住我們的角色，只能用 `rd_advanced_animation__walking`（單方向）跑四次。**
查全部樣式：`GET /v2/styles/selector`（免費）。

### 官方三條鐵則（我們實測也踩到同一件事）

1. **送原生像素尺寸** —— 4 倍放大的圖（我們的英雄圖是 400×400、原生其實只有 100×100）會被拒或變糊。
   我們遊戲的英雄：400×400 → 原生 100×100、角色 72 px（正好是遊戲內角色高）。
2. **四周要留白** —— 圖貼到畫布邊會生不好（建議內容約畫布的 1/1.3）。
3. **中性站姿效果最好** —— 跟 PixelLab「模型會抄參考圖姿勢」是同一個道理；拿跨步中的圖去生會卡住。
   失敗會自動退費，可以直接重試一次。

---

## 3. 我們的流程

```
pipeline/scripts/retrodiffusion/
  rd_client.py    credits / animate（走路等動作）/ rotate（8 方向）

output/archer-demo/pixellab/retrodiffusion/
  input-witchhunter-128.png   獵魔人降到原生 72 px、放進 128 畫布（送 RD 的輸入）
  rd-walk-01/                 原生 128 版（8 格）
  rd-walk-02/                 放大 2 倍 192 版（測動作幅度會不會跟著放大）
```

```bash
# 查餘額
python -X utf8 pipeline/scripts/retrodiffusion/rd_client.py credits

# 走路（先 --check 免費試算）
python -X utf8 pipeline/scripts/retrodiffusion/rd_client.py animate input-128.png out/walk --action walking --frames 8 --size 128 --check

# 真的生
python -X utf8 pipeline/scripts/retrodiffusion/rd_client.py animate input-128.png out/walk --action walking --frames 8 --size 128
```

輸出是 `512×256` 的 sprite sheet（4×2、每格 128），照格子切就有 8 格。

---

## 4. 實測結果（獵魔人走路，2026-10-10）

| 項目 | 數字 |
|---|---|
| 成本 | **$0.14**／次（8 格 128 px，≈1 credit）|
| 時間 | 約 100–150 秒 |
| 8 格高度 | 73–74 px（差 1 px）|
| 地線 | 差 1 px |
| 色數 | **14 色**（原生色盤完整保留，沒有被重畫）|
| 角色一致度 | 很好（帽子、紅羽、青綠大衣、十字弓、短刀都在）|
| 動作幅度 | 中等；角色是 Q 版＋長大衣，腿本來就露不多 |

放大 2 倍的輸入（192 px）也跑過：動作幅度按比例放大，品質沒有變差。

---

## 5. 跟其他幾條路的比較

| 路 | 保真度 | 動作幅度 | 成本 | 手感 |
|---|---|---|---|---|
| Retro Diffusion | **最高**（14 色、尺寸穩、不重畫） | 中 | $0.14／8 格 | 最省事，一張圖丟進去就好 |
| PixelLab v2（v3 模式） | 高（但會重畫、60 色左右） | **大** | 〜2 gen／方向 | 一次可以生多方向 |
| PixelLab v2（内建模板） | 中（角色變小、筆觸軟） | 小 | 1 gen／方向 | 最便宜 |
| PixelLab v1（自己算骨架） | 高（可自己上陰影） | 可調 | 〜0.3 gen／格 | 要自己算骨架、自己修 |
| l0veyou 生圖（舊） | 低（換腳要生很多張碰運氣） | — | — | 已淘汰 |

**還沒做**：接進遊戲（量化 + 對齊 + sprite sheet）、四方向走路、idle／attack。
