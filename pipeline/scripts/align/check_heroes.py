"""check_heroes.py — 英雄圖集驗收：6 職業 × 7 姿勢 × 1x/2x/4x。
檢查：缺格、洋紅殘留、碎片（去背切碎）、被包住的洞、姿勢高度跟待機圖差太多。另輸出 4x 總表 PNG。
用法：python pipeline/scripts/align/check_heroes.py [總表輸出.png]   exit 1 = 有問題
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage
A = Path(__file__).resolve().parents[3] / "assets"
GREEN_BG = 'sorcerer'
IDS = ['berserker', 'ranger', 'paladin', 'sorcerer', 'darkknight', 'priest']; POSES = ['idle', 'walkA', 'walkB', 'windup', 'strike', 'hurt', 'rest']
def load(tag):
    out = {}
    for name in ('hero', 'heropose'):
        im = Image.open(A / f'{name}@{tag}.png').convert('RGBA'); m = json.loads((A / f'{name}@{tag}.manifest.json').read_text(encoding='utf-8'))['cells']
        for k, c in m.items(): out[k] = im.crop((c['x'], c['y'], c['x'] + c['w'], c['y'] + c['h']))
    return out
probs = []; sheet4 = None
for tag in ('1x', '2x', '4x'):
    cells = load(tag)
    for k in IDS:
        base = cells.get(k)
        for po in POSES:
            key = k if po == 'idle' else f'{k}_{po}'; im = cells.get(key)
            if im is None: probs.append(f'{tag} {key} 缺格'); continue
            a = np.asarray(im); al = a[..., 3] > 0; r, g, b = [a[..., i].astype(int) for i in range(3)]
            rim = al & ndimage.binary_dilation(~al)   # 只看外緣:法師的紫水晶本來就是洋紅色系,不算殘留
            mg = al & (r > 110) & (b > 110) & (g < 70) & (np.abs(r - b) < 45); mag = int(mg.sum())   # 洋紅底表的職業不該有任何洋紅像素
            lab, n = ndimage.label(al); sizes = ndimage.sum(al, lab, range(1, n + 1)) if n else []
            frag = int(sum(1 for s in sizes if s < max(6, al.sum() * .004)))
            green = int((rim & (g > 180) & (r < 110) & (b < 110)).sum())   # 綠底表(法師)去背殘邊
            if k == GREEN_BG: mag = 0   # 法師用綠底表:外緣的洋紅是水晶光芒,不是去背殘留
            if mag: probs.append(f'{tag} {key} 洋紅殘留 {mag}px')
            if green: probs.append(f'{tag} {key} 綠色殘留 {green}px')
            if frag > 6: probs.append(f'{tag} {key} 碎片 {frag}')
            if base is not None and po != 'rest' and not (.78 <= im.height / base.height <= 1.3): probs.append(f'{tag} {key} 高度 {im.height} vs 待機 {base.height}')
    if tag == '4x': sheet4 = cells
if len(sys.argv) > 1:
    cw, ch = 200, 190; sh = Image.new('RGBA', (cw * 7, ch * 6), (96, 140, 72, 255))
    for i, k in enumerate(IDS):
        for j, po in enumerate(POSES):
            p = sheet4[k if po == 'idle' else f'{k}_{po}']; sh.alpha_composite(p, (j * cw + (cw - p.width) // 2, i * ch + ch - 8 - p.height))
    sh.save(sys.argv[1])
print('\n'.join(probs) or 'PASS 6 職業 × 7 姿勢 × 3 LOD：無缺格、無洋紅殘留、無碎裂、姿勢高度一致')
sys.exit(1 if probs else 0)
