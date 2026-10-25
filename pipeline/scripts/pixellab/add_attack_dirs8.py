"""add_attack_dirs8.py — 把 PixelLab 的 8 方向攻擊條圖接成「8 個方向的攻擊列」。

跟 `add_attack_dirs.py` 的差別:那支只接 5 列(東、東南、南、東北、北),左邊三格靠
遊戲執行時鏡像(`moveDir()` + `leftRow()`)。這支把來源就有的 **西、西南、西北** 三張
也接成真正獨立的列(`attackLeft` / `attackDownLeft` / `attackUpLeft`),遊戲直接播,
不再翻轉 → 盾牌不會換手、左右兩邊的手感一致。

用法:
    python add_attack_dirs8.py --hero paladin --dry-run        # 只驗證,不寫檔
    python add_attack_dirs8.py --hero paladin                  # 只補缺的左向 3 列
    python add_attack_dirs8.py --hero paladin --rebuild        # 只報告:重貼 8 列、把身體高校成跟 idle 一樣
    python add_attack_dirs8.py --hero paladin --rebuild --write # 真的重貼(位置不動,只改大小)

`--rebuild` 是「身體大小統一」用的:同一個英雄每個方向都是 PixelLab 各自生的,角色在來源圖裡
大小不一(實測聖騎士 8 列從 0.89× 到 1.24× idle),所以逐列量「身體高」再回推縮放,迭代到 ±0.5 px。
量法:腳底最低點 → 以腳為中線 ±14% 欄位裡最上面的像素(避開劍光/披風)。

接法(依實測校準,不是猜的):
- 腳底:每一格的最下面一個不透明像素,對到列高 − `footFromBottom` − 1
  (paladin 1x cell 160 → 151;berserker 1x cell 128 → 119)。
- 水平:兩種模式
  * `uniform`:整列同一個 dx(berserker 就是用這個;用東向列回歸校準,逐像素相符 1.000)。
  * `mirror-anchor`:每一格用「底部 6 列不透明像素的重心」對齊到**對側列的鏡像重心**
    (paladin 用這個)。沒有這條規則時整列會被劍光拉歪,轉向時身體會跳一下。
- 縮放:1x / @2x 各自固定(paladin 0.625 / 1.25,berserker 0.5 / 1.0);若某一列有任何
  一格碰到 cell 邊界(劍光弧溢出),那一列自動縮小 6% 重貼,並印出實際比例。
- 時間軸沿用既有攻擊列:`frameTime 0.075 / release 4 / impact 5`。
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

HEROES = Path('assets/heroes')

# 方向(來源檔後綴) → 動作列名稱
ROWS = [
    ('east', 'attack'),
    ('south-east', 'attackDownRight'),
    ('south', 'attackDown'),
    ('south-west', 'attackDownLeft'),
    ('west', 'attackLeft'),
    ('north-west', 'attackUpLeft'),
    ('north', 'attackUp'),
    ('north-east', 'attackUpRight'),
]
# 這次要新增的三列(左半邊)
NEW = ['attackLeft', 'attackDownLeft', 'attackUpLeft']
# 每一列的水平對齊要鏡像自哪一列(左半邊 ← 右半邊)
COUNTERPART = {'attackLeft': 'attack', 'attackDownLeft': 'attackDownRight', 'attackUpLeft': 'attackUpRight'}

# 每個英雄的接法實測值(用東向列回歸校準:s、dx、逐像素相符度)
HERO = {
    'berserker': {
        'lod': [{'suffix': '', 'cell': 128, 's': .5}, {'suffix': '@2x', 'cell': 256, 's': 1.0}],
        'mode': 'uniform', 'dx': 2,
    },
    'paladin': {
        'lod': [{'suffix': '', 'cell': 160, 's': .625}, {'suffix': '@2x', 'cell': 320, 's': 1.25}],
        'mode': 'mirror-anchor',
    },
}
TIMING = {'frameTime': .075, 'release': 4, 'impact': 5}


def frames_3x3(path: Path) -> list[Image.Image]:
    im = Image.open(path).convert('RGBA')
    if im.width != im.height or im.width % 3:
        raise SystemExit(f'{path.name}:預期 3×3 方格條圖,得到 {im.size}')
    c = im.width // 3
    return [im.crop(((i % 3) * c, (i // 3) * c, (i % 3) * c + c, (i // 3) * c + c)) for i in range(9)]


def bottom_cx(alpha: np.ndarray) -> tuple[int, float]:
    """最下面一個不透明像素 + 底部 6 列的重心 x(對齊用的腳點)。"""
    ys = np.nonzero(alpha.any(1))[0]
    if not len(ys):
        return -1, -1.0
    bottom = int(ys.max())
    band = alpha[max(0, bottom - 5):bottom + 1]
    xs = np.nonzero(band.any(0))[0]
    return bottom, float(xs.mean()) if len(xs) else -1.0


def place(im: Image.Image, s: float, dx: int, dy: int, cell: int) -> Image.Image:
    sized = im.resize((round(im.width * s),) * 2, Image.NEAREST)
    canvas = Image.new('RGBA', (cell, cell), (0, 0, 0, 0))
    canvas.alpha_composite(sized, (dx, dy))
    return canvas


def touches_border(im: Image.Image) -> bool:
    a = np.asarray(im)[..., 3] > 0
    return bool(a[0].any() or a[-1].any() or a[:, 0].any() or a[:, -1].any())


def body_h(placed: list[Image.Image], cell: int) -> float:
    """「身體高」量測(給統一大小的校正用):腳底最低點 → 以腳為中線 ±14% 欄位裡最上面的像素。
    不看劍光/披風在格子外側的部分,所以同一個角色在不同姿勢下量到的值才比得上。"""
    hs = []
    for im in placed:
        a = np.asarray(im)[..., 3] > 0
        ys, xs = np.nonzero(a)
        if not len(ys):
            continue
        fy = int(ys.max()); fx = int(np.median(xs[ys >= fy - 1]))
        lo, hi = max(0, fx - int(.14 * cell)), min(cell, fx + int(.14 * cell))
        col = np.nonzero(a[:, lo:hi].any(1))[0]
        hs.append(int(fy - col.min() + 1) if len(col) else 0)
    return float(np.median(hs)) if hs else 0.0


def row_body_h(meta: dict, sheet: np.ndarray, act: str) -> float:
    row = meta['actions'][act]; cell, y = row['cell'], row['y']
    cells = []
    for i in range(row['frames']):
        im = Image.fromarray(sheet[y:y + cell, i * cell:(i + 1) * cell].astype('uint8'))
        cells.append(im)
    return body_h(cells, cell)


def row_anchors(meta: dict, sheet: np.ndarray, act: str) -> list[float]:
    """每一格現在的地面接觸點 x:重貼時位置不動,只改大小。"""
    row = meta['actions'][act]; cell, y = row['cell'], row['y']
    out = []
    for i in range(row['frames']):
        alpha = sheet[y:y + cell, i * cell:(i + 1) * cell, 3] > 0
        ys, xs = np.nonzero(alpha)
        fy = int(ys.max())
        band = xs[ys >= fy - 5]
        out.append(float(band.mean()) if len(band) else cell / 2)
    return out


def place_on_anchor(srcs: list[Image.Image], s: float, cell: int, foot: int, anchors: list[float]) -> list[Image.Image]:
    """把來源每格縮到 s 倍、腳底對齊地面線、水平對齊給定的地面接觸點。
    劍光弧很大的格(攻擊第 4、5 格)會貼到格子邊 → 在錨點 ±8 px 內往格內微調,不要切到弧光。"""
    out = []
    for im, target in zip(srcs, anchors):
        sized = im.resize((round(im.width * s),) * 2, Image.NEAREST)
        a = np.asarray(sized)[..., 3] > 0
        bottom, _ = bottom_cx(a)
        _, src_cx = bottom_cx(np.asarray(im)[..., 3] > 0)
        dx = round(target - s * src_cx)
        if sized.width <= cell:
            dx = max(0, min(cell - sized.width, dx))
        cols = np.nonzero(a.any(0))[0]
        if len(cols):
            need_lo, need_hi = 1 - int(cols.min()), cell - 2 - int(cols.max())
            if dx < need_lo:
                dx = max(need_lo, dx, int(target) - 8)
            elif dx > need_hi:
                dx = min(need_hi, dx, int(target) + 8)
        dy = foot - bottom
        canvas = Image.new('RGBA', (cell, cell), (0, 0, 0, 0))
        canvas.alpha_composite(sized, (dx, dy))
        out.append(canvas)
    return out


def rebuild(hero: str, cfg: dict, sources: dict[str, list[Image.Image]], dry_run: bool) -> None:
    """把 8 個方向的攻擊列重貼一次:位置不變、只把「身體高」校到跟 idle 一樣。"""
    for lod in cfg['lod']:
        meta_path = HEROES / f"{hero}{lod['suffix']}.json"
        sheet_path = HEROES / f"{hero}{lod['suffix']}.png"
        meta = json.loads(meta_path.read_text(encoding='utf-8'))
        sheet_im = Image.open(sheet_path).convert('RGBA')
        sheet = np.asarray(sheet_im).astype(int)
        cell, foot = lod['cell'], lod['cell'] - meta['footFromBottom'] - 1
        target = row_body_h(meta, sheet, 'idle')
        print(f"{sheet_path.name}:idle 身體高 {target:.1f} px(cell {cell})——以此為基準統一")
        built = {}
        for direction, act in ROWS:
            if act not in meta['actions']:
                continue
            anchors = row_anchors(meta, sheet, act)
            now = row_body_h(meta, sheet, act)
            s, best = lod['s'], None
            for _ in range(5):
                placed = place_on_anchor(sources[direction], s, cell, foot, anchors)
                m = body_h(placed, cell)
                err = abs(m - target)
                if best is None or err < best[0]:
                    best = (err, s, placed, m)
                if err <= .5 or m <= 0:
                    break
                s *= target / m
            err, s, placed, m = best
            clipped = any(touches_border(p) for p in placed)
            built[act] = (placed, s)
            print(f'  {act:16} 身體高 {now:5.1f} → {m:5.1f}（x{now / target if target else 0:.3f} → x{m / target:.3f}）s={s:.3f}'
                  + ('  ⚠ 碰到 cell 邊界' if clipped else ''))
        if dry_run:
            continue
        out = sheet_im.copy()
        for act, (placed, s) in built.items():
            row = meta['actions'][act]; y = row['y']
            out.paste((0, 0, 0, 0), (0, y, out.width, y + cell))
            for i, p in enumerate(placed):
                out.alpha_composite(p, (i * cell, y))
            meta['actions'][act] = {**row, 'head': heads(placed, cell, meta['footFromBottom'], meta['heroHeight']),
                                    'artScale': round(s / (cell / 256), 4)}
        out.save(sheet_path)
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding='utf-8')
        print(f'  → 已重貼 {len(built)} 列（{sheet_path.name} {out.size}）')


def build_row(srcs: list[Image.Image], s: float, cell: int, foot: int, targets: list[float] | None, dx: int) -> list[Image.Image]:
    """targets 有值 → 逐格對齊重心(鏡像自對側列);None → 整列同一個 dx。
    腳底量的是**縮放後**圖片的底部(跟原圖尺寸無關),這樣 1x/@2x 才會對齊同一條地面線。"""
    out = []
    for im, target in zip(srcs, targets or [None] * len(srcs)):
        sized = im.resize((round(im.width * s),) * 2, Image.NEAREST)
        bottom, _ = bottom_cx(np.asarray(sized)[..., 3] > 0)
        _, src_cx = bottom_cx(np.asarray(im)[..., 3] > 0)
        step_dx = dx if target is None else round(target - s * src_cx)
        canvas = Image.new('RGBA', (cell, cell), (0, 0, 0, 0))
        canvas.alpha_composite(sized, (step_dx, foot - bottom))
        out.append(canvas)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--hero', required=True, choices=sorted(HERO))
    ap.add_argument('--src', default=None, help='條圖資料夾(預設 output/pixellab-incoming/<hero>-attack-8dir)')
    ap.add_argument('--rebuild', action='store_true', help='重貼 8 個方向,把身體高校到跟 idle 一樣(位置不動)')
    ap.add_argument('--write', action='store_true', help='配合 --rebuild:真的寫回 assets/heroes(沒給就只報告)')
    args = ap.parse_args()

    src = Path(args.src or f'output/pixellab-incoming/{args.hero}-attack-8dir')
    cfg = HERO[args.hero]
    sources = {}
    for direction, _ in ROWS:
        path = src / f'attack-{direction}.png'
        if not path.exists():
            raise SystemExit(f'缺少 {path}')
        sources[direction] = frames_3x3(path)
    name_of = dict((act, direction) for direction, act in ROWS)

    if args.rebuild:
        rebuild(args.hero, cfg, sources, not args.write)
        return

    for lod in cfg['lod']:
        meta_path = HEROES / f"{args.hero}{lod['suffix']}.json"
        sheet_path = HEROES / f"{args.hero}{lod['suffix']}.png"
        meta = json.loads(meta_path.read_text(encoding='utf-8'))
        sheet_im = Image.open(sheet_path).convert('RGBA')
        sheet = np.asarray(sheet_im).astype(int)
        cell, foot = lod['cell'], lod['cell'] - meta['footFromBottom'] - 1
        missing = [a for a in NEW if a in meta['actions']]
        print(f"{sheet_path.name}:cell {cell},腳底 y={foot},{'已存在(要重做請先手動刪列)' if missing else '要新增 3 列'}")
        if missing:
            print(f'  跳過 {missing}')
        todo = [a for a in NEW if a not in meta['actions']]
        if not todo:
            continue

        targets_for = {}
        if cfg['mode'] == 'mirror-anchor':
            # 對側列的腳點重心 → 鏡像到另一邊(cell − cx)
            targets_for = {a: [cell - cx for cx in row_anchors(meta, sheet, COUNTERPART[a])] for a in todo}
            print('  鏡像錨點:', {a: [round(v, 1) for v in targets_for[a]] for a in todo})
        rows_out = {}
        for act in todo:
            s = lod['s']
            for _ in range(6):
                placed = build_row(sources[name_of[act]], s, cell, foot, None if cfg['mode'] == 'uniform' else targets_for[act], cfg.get('dx', 0))
                if not any(touches_border(p) for p in placed):
                    break
                print(f'  {act}:有格子碰到 cell 邊界 → 縮小到 s={s * .94:.4f}')
                s *= .94
            rows_out[act] = (placed, s, any(touches_border(p) for p in placed))

        if args.dry_run:
            for act, (placed, s, clipped) in rows_out.items():
                print(f'  {act:<16} s={s:.4f} 邊界碰觸={clipped}')
            continue

        height = sheet_im.height
        out = Image.new('RGBA', (sheet_im.width, height + cell * len(rows_out)), (0, 0, 0, 0))
        out.alpha_composite(sheet_im, (0, 0))
        for act, (placed, s, clipped) in rows_out.items():
            for i, p in enumerate(placed):
                out.alpha_composite(p, (i * cell, height))
            meta['actions'][act] = {
                'y': height, 'cell': cell, 'frames': len(placed),
                'head': heads(placed, cell, meta['footFromBottom'], meta['heroHeight']),
                'artScale': round(s / (cell / 256), 4),
                **TIMING,
            }
            print(f'  + {act:<16} y={height} {len(placed)} 格 s={s:.4f}{"  (有碰邊界)" if clipped else ""}')
            height += cell
        out.save(sheet_path)
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding='utf-8')
        print(f'  → {sheet_path.name} {out.size},共 {len(meta["actions"])} 列')


def heads(placed: list[Image.Image], cell: int, foot_from_bottom: int, hero_height: float) -> list:
    """頭頂錨點:格中心 ±12% 欄位裡最上面一列不透明像素的中心(配件用),跟 add_attack_dirs.py 同一套。"""
    ground = cell - foot_from_bottom - 1
    result = []
    for im in placed:
        a = np.asarray(im)[..., 3] > 0
        lo, hi = int(cell / 2 - .12 * cell), int(cell / 2 + .12 * cell)
        ys = np.nonzero(a[:, lo:hi].any(1))[0]
        if not len(ys):
            result.append(None)
            continue
        top = int(ys.min())
        xs = np.nonzero(a[top:top + 4, lo:hi].any(0))[0] + lo
        result.append([round(float(xs.mean()), 1), top] if ground - top >= hero_height * .8 else None)
    return result


if __name__ == '__main__':
    main()
