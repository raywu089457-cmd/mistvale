"""paper_doll_8dir.py — 「立體骨架 + 貼上 2D 素材 + 正交(2D)鏡頭」的紙偶動畫。

    "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" -b -P pipeline/scripts/blender/paper_doll_8dir.py -- <素材資料夾> <輸出資料夾>

為什麼這樣做（2026-10-27 使用者要求）：
  AI 生 8 方向走路最貴也最容易壞；純程式化位移又做不出膝蓋彎。
  **紙偶** 取中間：把我們「已經有的手繪 8 方向待機圖」切成幾塊（頭 / 身 / 左腿 / 右腿），
  貼在 3D 骨架的骨頭上（每個部位剛性綁一根骨），骨頭在 3D 空間裡轉（螢幕平面內 = 繞 Y 軸），
  再用**正交相機**拍回來 → 得到「真骨架帶動、但保留原畫」的平面動畫。素材風格 100% 不變，成本 0。

切法（不需要美術標註）：
  頸線 = 內容頂端往下 38%、髖線 = 往下 62%，腿在中線左右切開。
  頭 / 身（含手臂）/ 左腿 / 右腿 四塊，接縫剛好落在脖子與腰，不會有重疊像素。

輸出：<out>/walk/<方向>/frame-XX.png、<out>/attack/<方向>/frame-XX.png（每格與來源同尺寸、透明）。
再用 pipeline/scripts/blender/pixelize_renders.py 壓成遊戲格子規格。
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
import numpy as np

REPO = Path(__file__).resolve().parents[3]
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SRC = Path(ARGS[0]) if ARGS else Path("output/pixellab-incoming/priest-walk/rot256")
SRC = SRC if SRC.is_absolute() else (REPO / SRC)     # Blender 的相對路徑是相對磁碟根
OUT = Path(ARGS[1]) if len(ARGS) > 1 else REPO / "output/paperdoll"
OUT = OUT if OUT.is_absolute() else REPO / OUT
DIRS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"]
SIZE = 256
NECK = float(next((a.split("=")[1] for a in ARGS if a.startswith("--neck=")), .38))   # 頸線（內容高度比例）
HIP = float(next((a.split("=")[1] for a in ARGS if a.startswith("--hip=")), .62))     # 髖線
TEX = {}                  # 方向 → image datablock


def clean():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def src_image(d: str) -> Path:
    for p in (SRC / f"{d}.png", SRC / f"rotation-{d}.png"):
        if p.exists():
            return p
    for p in SRC.glob(f"*{d}.png"):
        return p
    raise SystemExit(f"找不到方向 {d} 的圖（{SRC}）")


def load_rgba(path: Path):
    """用 bpy 自己讀像素（Blender 內建的 Python 沒有 PIL）。回傳 (H, W, 4)，原點在左下。"""
    im = bpy.data.images.load(str(path))
    w, h = im.size
    a = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)
    bpy.data.images.remove(im)
    return a


def content_box_path(path: Path):
    """回傳內容邊界（圖片座標，原點左上，跟 PIL 一致）。"""
    a = load_rgba(path)
    h = a.shape[0]
    al = a[..., 3] > 0.02
    ys, xs = np.nonzero(al)
    y0, y1 = int(h - 1 - ys.max()), int(h - ys.min())      # 翻成由上往下
    return int(xs.min()), y0, int(xs.max()) + 1, y1


def make_material(img) -> bpy.types.Material:
    m = bpy.data.materials.new("doll")
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")      # 平面不受光:輸出的就是原畫的顏色
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Closest"                   # 像素畫不能被插值糊掉
    tex.extension = "CLIP"
    clear = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")       # alpha=0 的像素必須真的透明(不然會畫出黑框)
    nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
    nt.links.new(tex.outputs["Alpha"], mix.inputs["Fac"])
    nt.links.new(clear.outputs["BSDF"], mix.inputs[1])
    nt.links.new(emit.outputs["Emission"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    try:
        m.blend_method = "BLEND"
    except Exception:
        pass
    if hasattr(m, "use_backface_culling"):
        m.use_backface_culling = False
    return m


def quad(name, x0, y0, x1, y1, uv, material, depth=0.0):
    """一塊矩形平面：世界座標 (x0,y0)-(x1,y1)（y 由下往上）,UV 給 image 的子區。
    depth < 0 = 比較靠近相機（相機在 −Y 往 +Y 看）→ 用來讓身體蓋住腿塊的接縫。"""
    mesh = bpy.data.meshes.new(name)
    verts = [(x0, depth, y0), (x1, depth, y0), (x1, depth, y1), (x0, depth, y1)]
    faces = [(0, 1, 2, 3)]
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(material)
    uvl = mesh.uv_layers.new()
    u0, v0, u1, v1 = uv
    for loop, (u, v) in zip(mesh.loops, [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]):
        uvl.data[loop.index].uv = (u, v)
    return ob


def build_doll(img_path: Path):
    """4 片紙偶 + 骨架（同一份幾何,8 個方向只換貼圖）。"""
    W, H = [int(v) for v in load_rgba(img_path).shape[1::-1]]
    tex = bpy.data.images.load(str(img_path))
    tex.alpha_mode = "STRAIGHT"
    mat = make_material(tex)
    x0, y0, x1, y1 = content_box_path(img_path)
    ch = y1 - y0
    y_neck = y1 - ch * NECK
    y_hip = y1 - ch * HIP
    axis = (x0 + x1) / 2
    # 圖片座標 → 世界座標（翻 y：圖片 y 由上往下,世界 z 由下往上）
    wz = lambda py: (H - py)
    # 接縫：腿塊往上多留 OVER px、頭塊往下多留 OVER px，身體畫在最前面蓋住接縫
    OVER = max(2, round(ch * .05))                 # 上下重疊（蓋住腰與脖子接縫）
    OVERX = max(2, round((x1 - x0) * .06))         # 左右重疊（兩腿擺開時中線不會露縫）
    parts = {
        "legR":  (int(axis), int(y_hip) - OVER, x1, y1, 0.2),          # 後
        "legL":  (x0, int(y_hip) - OVER, int(axis) + OVERX, y1, -0.2),  # 前（往右多留一點蓋住中線）
        "head":  (x0, y0, x1, int(y_neck) + OVER, -0.8),
        "body":  (x0, int(y_neck), x1, int(y_hip) + OVER, -0.8),
    }
    obs = {}
    for name, (px0, py0, px1, py1, dep) in parts.items():
        uv = (px0 / W, (H - py1) / H, px1 / W, (H - py0) / H)
        obs[name] = quad(name, px0, wz(py1), px1, wz(py0), uv, mat, dep)

    # ---- 骨架：hips(根) → spine → head；hips → thighL / thighR ----
    arm = bpy.data.armatures.new("doll")
    rig = bpy.data.objects.new("rig", arm)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.edit_bones
    hips = eb.new("hips"); hips.head = (axis, 0, wz(y_hip)); hips.tail = (axis, 0, wz(y_hip) + 8); hips.use_connect = False
    spine = eb.new("spine"); spine.head = (axis, 0, wz(y_hip)); spine.tail = (axis, 0, wz(y_neck)); spine.parent = hips
    head = eb.new("head"); head.head = (axis, 0, wz(y_neck)); head.tail = (axis, 0, wz(y0)); head.parent = spine
    for side, sx, inner in (("L", x0, axis), ("R", x1, axis)):
        th = eb.new(f"thigh.{side}")
        # 髖關節 = 腿的中心往身體中線靠 40%（繞這裡擺動才像走路,繞腿的中心轉會變成原地轉）
        hipx = (sx + inner) / 2 * .6 + inner * .4
        th.head = (hipx, 0, wz(y_hip))
        th.tail = (hipx, 0, wz(y1)); th.parent = hips
    bpy.ops.object.mode_set(mode="OBJECT")

    bind = {"head": "head", "body": "spine", "legL": "thigh.L", "legR": "thigh.R"}
    for name, ob in obs.items():
        vg = ob.vertex_groups.new(name=bind[name])
        vg.add(range(len(ob.data.vertices)), 1.0, "REPLACE")
        mod = ob.modifiers.new("arm", "ARMATURE")
        mod.object = rig
        ob.parent = rig
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"

    # ---- 正交相機（2D 鏡頭:正對平面,不做透視）----
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = max(W, H)
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (W / 2, -400, H / 2)
    cam.rotation_euler = (math.radians(90), 0, 0)
    bpy.context.scene.camera = cam
    return rig, tex, (x0, y0, x1, y1, y_neck, y_hip, axis)


def setup_render():
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in dir(bpy.types) else "BLENDER_EEVEE"
    try:
        sc.eevee.taa_render_samples = 1
    except Exception:
        pass
    sc.render.film_transparent = True
    sc.render.resolution_x = SIZE
    sc.render.resolution_y = SIZE
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "Standard"
    sc.render.filter_size = 0.01
    try:
        sc.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        pass


def key(rig, frame, pose):
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
        rot = pose.get(pb.name, (0, 0, 0))
        pb.rotation_euler = (math.radians(rot[0]), math.radians(rot[1]), math.radians(rot[2]))
        pb.keyframe_insert("rotation_euler", frame=frame)


def walk_frames(rig):
    """8 格走路：腿在螢幕平面內前後擺（繞 Y 軸），髖部上下顛，身體微微前傾。"""
    plan = [(28, -28, 0), (15, -15, 1), (0, 0, 2), (-15, 15, 1),
            (-28, 28, 0), (-15, 15, 1), (0, 0, 2), (15, -15, 1)]   # 左腿, 右腿, 下沉
    for i, (l, r, sink) in enumerate(plan, start=1):
        key(rig, i, {"thigh.L": (0, l, 0), "thigh.R": (0, r, 0),
                     "spine": (0, 1.5 if i % 2 else -1.5, 0), "head": (0, -1 if i % 2 else 1, 0)})
        # 髖部上下顛（用骨頭位移,不動旋轉）
        hips = rig.pose.bones["hips"]
        hips.location = (0, -sink * 2.2, 0)
        hips.keyframe_insert("location", frame=i)
    return len(plan)


def attack_frames(rig):
    """8 格攻擊：身體後仰蓄力 → 前傾出手 → 回正。"""
    lean = [0, -6, -11, -4, 10, 14, 5, 0]
    for i, a in enumerate(lean, start=1):
        key(rig, i, {"spine": (0, a, 0), "head": (0, -a * .5, 0),
                     "thigh.L": (0, -a * .3, 0), "thigh.R": (0, -a * .3, 0)})
    return len(lean)


def main():
    clean()
    setup_render()
    first = src_image("east")
    rig, tex, geo = build_doll(first)
    sc = bpy.context.scene

    only = [a.split("=")[1] for a in ARGS if a.startswith("--only=")]
    todo = [(a, m) for a, m in (("walk", walk_frames), ("attack", attack_frames)) if not only or a in only]
    for act, maker in todo:
        rig.animation_data_create()
        rig.animation_data.action = bpy.data.actions.new(act)
        n = maker(rig)
        sc.frame_start, sc.frame_end = 1, n
        for d in DIRS:
            tex.filepath = str(src_image(d))       # 換貼圖（同一副骨架、同一份幾何）
            tex.reload()
            folder = OUT / act / d
            folder.mkdir(parents=True, exist_ok=True)
            for f in range(1, n + 1):
                sc.frame_set(f)
                sc.render.filepath = str(folder / f"frame-{f - 1:02d}.png")
                bpy.ops.render.render(write_still=True)
            print(f"  {act}/{d} {n} frames")
    print("done ->", OUT)


if __name__ == "__main__":
    main()
