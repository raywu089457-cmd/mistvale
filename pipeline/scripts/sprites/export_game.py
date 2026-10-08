"""export_game.py — 新管線角色(sprites/characters/HERO_* / MONSTER_*)→ 遊戲格式(邏輯 1:1 像素,每列一個動作)。
用法:python pipeline/scripts/sprites/export_game.py paladin darkknight … slime wolf golem treant
  英雄 → assets/heroes/<cls>.png/.json(格 100);魔物 → assets/monsters3/<type>.png/.json(格 = rig.json 的 cell)。
舊檔先備份到 <資料夾>/_pre_newpipe/。英雄 skill 重用 attack、victory 重用 idle(新管線尚未有這兩個動作);fx 檔不動。
四方向(Visual Bible 4.3):idleDown/walkDown/idleUp/walkUp 來自 make_dir.py;idleLeft/walkLeft = 側面逐像素水平鏡像烘入。"""
import colorsys, json, shutil, sys
import numpy as np
from pathlib import Path
from PIL import Image, ImageOps
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "pipeline/scripts/sprites"))
import unfake  # noqa: E402  組完映射回角色色盤(Bible:每角色 ≤16 色)
sys.path.insert(0, str(ROOT / "pipeline/scripts/heroes"))
import build_hero as BH  # noqa: E402
# 新管線色盤的換色色相:祭司只換高飽和金飾(皮膚也是暖色,舊值會把皮膚一起換色);弓手綠衣飽和度較低
BH.SWAP.update(priest=(45, 12, .8), archer=(115, 30, .18), witchhunter=(180, 12, .15))   # 魔獵人外套是低飽和青(sat .20–.23),門檻 .3 會一個色都抓不到
HERO_ROWS = ["idle", "walk", "attack", "skill", "hurt", "death", "victory"]
MON_ROWS = ["idle", "walk", "attack", "hurt", "death"]
DIRS = ["idleDown", "walkDown", "idleUp", "walkUp"]
SRC = {"skill": "attack", "victory": "idle", "idleLeft": "idle", "walkLeft": "walk"}
MON = {"slime", "wolf", "golem", "treant", "ogre"}

for cls in sys.argv[1:]:
    mon = cls in MON
    d = ROOT / f"sprites/characters/{'MONSTER' if mon else 'HERO'}_{cls.upper()}_001"; pre = d.name.split("_")[0].lower()
    A = ROOT / ("assets/monsters3" if mon else "assets/heroes"); bak = A / "_pre_newpipe"; bak.mkdir(exist_ok=True)
    for ext in ("png", "json"):
        if (A / f"{cls}.{ext}").exists() and not (bak / f"{cls}.{ext}").exists(): shutil.copy(A / f"{cls}.{ext}", bak / f"{cls}.{ext}")
    rig = json.loads((d / "rig.json").read_text(encoding="utf-8")); CELL = rig.get("cell", 100); FOOT = 8
    rows = (MON_ROWS if mon else HERO_ROWS) + [a for a in DIRS if (d / f"export/{pre}_{cls}_001_{a}_v01.json").exists()] + ["idleLeft", "walkLeft"]
    metas, imgs = {}, {}
    for a in {SRC.get(r, r) for r in rows}:
        metas[a] = json.loads((d / f"export/{pre}_{cls}_001_{a}_v01.json").read_text(encoding="utf-8"))
        imgs[a] = Image.open(d / f"export/game/{pre}_{cls}_001_{a}_v01_1x.png").convert("RGBA")
    sheet = Image.new("RGBA", (CELL * 8, CELL * len(rows)), (0, 0, 0, 0)); acts = {}
    for r, a in enumerate(rows):
        s = SRC.get(a, a); m, im = metas[s], imgs[s]; n = m["frames"]; mirror = a.endswith("Left")
        for k in range(n):
            c = im.crop(((k % 4) * CELL, (k // 4) * CELL, (k % 4 + 1) * CELL, (k // 4 + 1) * CELL))
            sheet.alpha_composite(ImageOps.mirror(c) if mirror else c, (k * CELL, r * CELL))
        head = [[(CELL - 1 - m["anchors"][k]["HEAD"][0] / 4) if mirror else m["anchors"][k]["HEAD"][0] / 4, m["anchors"][k]["HEAD"][1] / 4] for k in range(n)]
        e = {"y": r * CELL, "cell": CELL, "frames": n, "frameTime": m["frameTime"], "head": head}
        if a.startswith("walk"): e["cycle"] = 85
        if "release" in m: e["release"] = m["release"] - 1; e["impact"] = m["impact"] - 1
        if a == "skill": e["release"] = metas["attack"]["release"] - 1
        if a.startswith("idle"): e["frameTime"] = 0.2 if mon else 0.16
        acts[a] = e
    pal = json.loads((d / "palette.json").read_text()); hexs = ["#%02x%02x%02x" % tuple(c[:3]) for c in pal]
    # Bible 第1節:每角色 ≤16 色(含描邊)、所有動畫共用一份。各格/各表的近似色不映射回色盤會累積到 30+ 色。
    sheet = unfake.apply_palette(sheet, np.asarray([c[:3] for c in pal], "uint8"))
    if mon:
        meta = {"hero": cls, "heroHeight": 72, "footFromBottom": FOOT, "actions": acts, "palette": hexs, "monster": True, "size": rig["gameSize"], "artSize": rig["artSize"]}
    else:
        # 換色組沿用 build_hero.material_groups(職業代表色相 ± 容差):皮膚/頭髮/皮革不能進 outfit,不然換色會把皮膚染綠
        meta = {"hero": cls, "heroHeight": metas["idle"]["characterHeight"] // 4, "footFromBottom": FOOT, "actions": acts, "palette": hexs, "groups": {**BH.material_groups(cls, [c[:3] for c in pal]), **({"metal": []} if cls == "sorcerer" else {})}}   # 法師沒有金屬裝備(灰髮不能被換成金色)
    sheet.save(A / f"{cls}.png"); (A / f"{cls}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(cls, sheet.size, "rows", rows)
