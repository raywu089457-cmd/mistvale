"""write_char_docs.py [ID…] — 依 rig.json、palette.json、qa/*.json 產生每個角色的 character_spec.md 與 SPRITE_QA_REPORT.md(預設全部角色)。"""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]; C = ROOT / "sprites/characters"
ANIMS = ["idle", "walk", "attack", "hurt", "death"]; DIRS = ["idleDown", "walkDown", "idleUp", "walkUp"]
def manual(d):
    f = d / "qa" / "manual_review.json"
    if not f.exists(): return "人工項(SPRITE_QA_CHECKLIST 13–17、H、V):未審。"
    r = json.loads(f.read_text(encoding="utf-8"))
    NL = chr(10)
    rows = NL.join(f"| {k} | {'PASS' if v[0] else 'FAIL'} | {v[1]} |" for k, v in r["items"].items())
    head = f"人工檢查({r['date']},{r['by']};看遊戲 sheet 全部動作列,2× 放大):" + NL + NL + "| 項目 | 結果 | 說明 |" + NL + "|---|---|---|" + NL
    return head + rows + NL + (NL + f"修正紀錄:{r['fixes']}" + NL if r.get("fixes") else "")


for d in [C / i for i in sys.argv[1:]] or sorted(p for p in C.iterdir() if p.is_dir()):
    rig = json.loads((d / "rig.json").read_text(encoding="utf-8")); mon = rig.get("monster", False)
    pal = ["#%02x%02x%02x" % tuple(c[:3]) for c in json.loads((d / "palette.json").read_text())]
    name = d.name.split("_")[1].lower(); src = rig["source"]
    exp = {a: json.loads(f.read_text(encoding="utf-8")) for a in ANIMS + DIRS for f in sorted((d / "export").glob(f"*_{a}_v*.json"))[-1:]}
    h = exp["idle"]["characterHeight"] // exp["idle"]["logicalScale"]
    rows = "\n".join(f"| {a} | {e['frames']} | {e['frameTime']} | {'是' if e.get('loop') else '否'} |" for a, e in exp.items())
    spec = f"""# {rig['id']} — character spec

| 項目 | 值 |
|---|---|
| 類型 | {'魔物' if mon else '英雄'}({name}) |
| 邏輯格 / 母版 | {rig.get('cell', 100)} / {rig.get('cell', 100) * 4}(ground y={rig.get('cell', 100) - 8},軸 x={rig.get('cell', 100) // 2}) |
| 待機身高 | {h} 邏輯 px{f",美術最長邊目標 {rig['artSize']}(遊戲尺寸 {rig['gameSize']} ×72/21)" if mon else ''} |
| 側面關鍵表 | `{src['sheet']}`(4x1:待機、攻擊 wind-up / max / recovery) |
| 正面/背面關鍵表 | `output/l0veyou/hv4/{name}-dir.png`(2x1) |
| 取樣 | {'pixelize 到高 ' + str(src['pixelize']) if src.get('pixelize') else 'unfake 真像素'} |
| 圖層 | {', '.join(rig['layers']) or '無(魔物沒有武器層)'};膝帶 {rig['knee']}–{rig['foot']} |
| 色盤({len(pal)} 色) | {' '.join(pal)} |
| 程式化參數 | `{json.dumps(rig.get('rigged', {}), ensure_ascii=False)}` |

## 動畫

| 動作 | 格數 | 每格秒數 | 循環 |
|---|---|---|---|
{rows}

左向 idleLeft / walkLeft = 側面鏡像(`export_game.py`)。
"""
    (d / "character_spec.md").write_text(spec, encoding="utf-8")
    lines = []
    for a in ANIMS + DIRS:
        q = d / "qa" / f"{a}_qa.json"
        if not q.exists(): lines.append(f"| {a} | — | 未跑 |"); continue
        r = json.loads(q.read_text(encoding="utf-8"))
        lines.append(f"| {a} | {r['result']} | {'make_dir 8 項' if a in DIRS else str(len(r['checks'])) + ' 項'}{(',失敗:' + ', '.join(r['failed'])) if r['failed'] else ''} |")
    rep = f"""# {rig['id']} — SPRITE QA REPORT

自動 QA(`sprite_qa.py` idle、`sprite_qa_dyn.py` 動態、`make_dir.py` 正/背面):

| 動作 | 結果 | 備註 |
|---|---|---|
{chr(10).join(lines)}

{manual(d)}
"""
    (d / "SPRITE_QA_REPORT.md").write_text(rep, encoding="utf-8")
    print(d.name, "ok")
