"""render_8dir.py — Blender → 8 方向走路/攻擊 sprite 序列（免費用自己電腦跑，取代 AI 生動畫）。

    "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" -b -P pipeline/scripts/blender/render_8dir.py -- <out_dir>

做什麼：
  1. 用程式組一組低模骨架（root→hips→spine→head、大腿/小腿、上臂/前臂、右手武器插槽）。
  2. 兩段動作：walk（8 格循環）、attack（8 格：guard→蓄力→揮擊→收招回 guard）。
  3. 8 台正交相機，每 45° 一台，仰角 35°（跟遊戲的 3/4 俯視一致）。
  4. Workbench 引擎 + 關閉反鋸齒 + 透明背景 → 每格 256×256 PNG（硬邊、顏色少，之後再壓到專用色盤）。

為什麼走這條路（2026-10-27 評估 Sprixen 後）：AI 生 8 方向走路最常壞在「同一個角色每個方向長不一樣」與
「武器換手」；3D rig + 正交渲圖在數學上保證 8 個方向是同一個角色、同一副骨架，走路/攻擊/受擊/死亡
全部可以從同一組動作出來，而且我們的格子、腳底、色盤規格完全自己控（成本 0）。
"""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

# Blender 的相對路徑是相對「磁碟根」而不是 shell 的 cwd → 一律轉成絕對路徑
REPO = Path(__file__).resolve().parents[3]
OUT = Path(sys.argv[sys.argv.index("--") + 1]) if "--" in sys.argv else Path("output/blender8")
OUT = OUT if OUT.is_absolute() else (REPO / OUT)
SIZE = 256
DIRS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"]
# 每個方向相機的方位角（0° = 從 +X 看向原點 → 角色朝右，即 east）
DIR_ANGLE = {"east": 0, "south-east": 45, "south": 90, "south-west": 135,
             "west": 180, "north-west": 225, "north": 270, "north-east": 315}
ELEV = 35.0        # 仰角
CLEAR = (0.0, 0.0, 0.0, 0.0)


def clean():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, rgb):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1.0)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.9
    return m


def box(name, size, loc, material, rig=None, bone=None):
    """剛性蒙皮：整塊綁在一根骨頭上（weight 1 + Armature modifier）。
    不用 bone parenting —— 骨骼父物件是「掛在骨尾並套骨骼矩陣」,很容易整體位移到畫面外。"""
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.object
    o.name = name
    o.scale = Vector(size) / 2
    o.location = Vector(loc)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(material)
    if rig and bone:
        vg = o.vertex_groups.new(name=bone)
        vg.add(range(len(o.data.vertices)), 1.0, "REPLACE")
        mod = o.modifiers.new("arm", "ARMATURE")
        mod.object = rig
    return o


def build_rig():
    """低模人形 + 右手武器（鎬）。比例故意做成 2.5 頭身,跟遊戲的魔物一致。"""
    skin = mat("skin", (0.42, 0.55, 0.35))
    cloth = mat("cloth", (0.36, 0.28, 0.20))
    metal = mat("metal", (0.55, 0.58, 0.62))
    wood = mat("wood", (0.40, 0.30, 0.18))
    cut_wood = mat("cutwood", (0.30, 0.22, 0.14))

    # ---- 骨架（2.8 頭身、粗短:跟遊戲魔物的比例一致）----
    arm = bpy.data.armatures.new("rig")
    rig = bpy.data.objects.new("rig", arm)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.edit_bones
    root = eb.new("root"); root.head = (0, 0, 0); root.tail = (0, 0, .1)
    hips = eb.new("hips"); hips.head = (0, 0, .52); hips.tail = (0, 0, .72); hips.parent = root
    spine = eb.new("spine"); spine.head = (0, 0, .72); spine.tail = (0, 0, 1.00); spine.parent = hips
    head = eb.new("head"); head.head = (0, 0, 1.00); head.tail = (0, 0, 1.44); head.parent = spine
    for side, sx in (("L", -1), ("R", 1)):
        th = eb.new(f"thigh.{side}"); th.head = (sx * .15, 0, .52); th.tail = (sx * .15, 0, .28); th.parent = hips
        sh = eb.new(f"shin.{side}"); sh.head = (sx * .15, 0, .28); sh.tail = (sx * .15, 0, .04); sh.parent = th
        ua = eb.new(f"arm.{side}"); ua.head = (sx * .28, 0, .98); ua.tail = (sx * .34, 0, .76); ua.parent = spine
        fa = eb.new(f"fore.{side}"); fa.head = (sx * .34, 0, .76); fa.tail = (sx * .36, 0, .56); fa.parent = ua
    wp = eb.new("weapon"); wp.head = (.36, -.12, .56); wp.tail = (.36, -.12, .92); wp.parent = eb["fore.R"]
    bpy.ops.object.mode_set(mode="OBJECT")

    # ---- 身體（每個部位剛性綁在一根骨頭上）----
    box("head", (.46, .44, .44), (0, -.02, 1.22), skin, rig, "head")
    box("snout", (.24, .16, .16), (0, -.28, 1.14), skin, rig, "head")
    box("ear.L", (.07, .12, .18), (-.24, -.02, 1.36), skin, rig, "head")
    box("ear.R", (.07, .12, .18), (.24, -.02, 1.36), skin, rig, "head")
    box("torso", (.50, .36, .30), (0, 0, .87), cloth, rig, "spine")
    box("belt", (.48, .36, .07), (0, 0, .70), cut_wood, rig, "hips")
    box("hips", (.44, .34, .16), (0, 0, .60), cloth, rig, "hips")
    for side, sx in (("L", -1), ("R", 1)):
        box(f"thigh.{side}", (.20, .24, .26), (sx * .15, 0, .40), cloth, rig, f"thigh.{side}")
        box(f"shin.{side}", (.17, .20, .26), (sx * .15, 0, .16), skin, rig, f"shin.{side}")
        box(f"foot.{side}", (.18, .30, .10), (sx * .15, -.06, .05), cloth, rig, f"shin.{side}")
        box(f"arm.{side}", (.14, .16, .22), (sx * .31, -.02, .87), cloth, rig, f"arm.{side}")
        box(f"fore.{side}", (.12, .14, .22), (sx * .34, -.03, .66), skin, rig, f"fore.{side}")
        box(f"hand.{side}", (.13, .15, .12), (sx * .35, -.03, .55), skin, rig, f"fore.{side}")
    # 武器（鎬）：握在右手、位置往前(−y),側面一定看得到
    box("haft", (.07, .07, .58), (.36, -.14, .70), wood, rig, "weapon")
    box("blade", (.34, .08, .09), (.36, -.14, .98), metal, rig, "weapon")
    box("blade2", (.08, .08, .18), (.36, -.14, .87), metal, rig, "weapon")
    return rig


def key_pose(rig, frame, pose):
    """pose: {bone: (rx,ry,rz)} 度；沒給的骨頭回 0。"""
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
    for f, p in pose.items():
        rig.pose.bones[f].rotation_euler = (
            math.radians(p[0]), math.radians(p[1]), math.radians(p[2]))
        rig.pose.bones[f].keyframe_insert("rotation_euler", frame=frame)
    for pb in rig.pose.bones:
        if pb.name not in pose:
            pb.rotation_euler = (0, 0, 0)
            pb.keyframe_insert("rotation_euler", frame=frame)


def make_walk(rig):
    """8 格走路：左右腿交替（前後擺 + 膝蓋彎），手臂反向擺，身體上下顛。"""
    walk = [
        # frame: thigh.L, shin.L, thigh.R, shin.R, arm.L, arm.R
        (1, [(-24, 0, 0), (6, 0, 0), (24, 0, 0), (-30, 0, 0), (18, 0, 0), (-18, 0, 0)]),
        (2, [(-12, 0, 0), (14, 0, 0), (12, 0, 0), (-14, 0, 0), (9, 0, 0), (-9, 0, 0)]),
        (3, [(2, 0, 0), (10, 0, 0), (-2, 0, 0), (-4, 0, 0), (0, 0, 0), (0, 0, 0)]),
        (4, [(16, 0, 0), (4, 0, 0), (-16, 0, 0), (-10, 0, 0), (-10, 0, 0), (10, 0, 0)]),
        (5, [(24, 0, 0), (-30, 0, 0), (-24, 0, 0), (6, 0, 0), (-18, 0, 0), (18, 0, 0)]),
        (6, [(12, 0, 0), (-14, 0, 0), (-12, 0, 0), (14, 0, 0), (-9, 0, 0), (9, 0, 0)]),
        (7, [(-2, 0, 0), (-4, 0, 0), (2, 0, 0), (10, 0, 0), (0, 0, 0), (0, 0, 0)]),
        (8, [(-16, 0, 0), (-10, 0, 0), (16, 0, 0), (4, 0, 0), (10, 0, 0), (-10, 0, 0)]),
    ]
    for frame, (tl, sl, tr, sr, al, ar) in walk:
        key_pose(rig, frame, {"thigh.L": tl, "shin.L": sl, "thigh.R": tr, "shin.R": sr,
                              "arm.L": al, "arm.R": ar,
                              "hips": (0, 0, 0), "spine": (2, 0, 0)})
    return 8


def make_attack(rig):
    """8 格攻擊：guard → 抬手蓄力 → 揮下 → 收招回 guard（首尾都回 guard 才能串連）。"""
    atk = [
        (1, 0), (2, -18), (3, -34), (4, 8), (5, 52), (6, 40), (7, 14), (8, 0),
    ]
    for frame, swing in atk:
        key_pose(rig, frame, {
            "arm.R": (-swing, 0, 0), "fore.R": (-swing * .35, 0, 0),
            "arm.L": (swing * .3, 0, 0),
            "spine": (swing * .18, 0, 0), "head": (-swing * .12, 0, 0),
            "hips": (0, 0, swing * .06),
        })
    return 8


def setup_scene():
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.render_aa = "OFF"
    sc.display.shading.light = "STUDIO"       # 平面光會讓所有面同色,完全看不出立體
    sc.display.shading.show_shadows = True
    sc.display.shading.show_cavity = True
    sc.display.shading.color_type = "MATERIAL"
    sc.render.film_transparent = True
    sc.render.resolution_x = SIZE
    sc.render.resolution_y = SIZE
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "Standard"
    sc.render.fps = 12
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 1.72
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.collection.objects.link(cam)
    sc.camera = cam
    return cam


def place_cam(cam, angle_deg, elev=ELEV, target=(0, 0, .74), dist=6.0):
    a, e = math.radians(angle_deg), math.radians(elev)
    cam.location = (target[0] + dist * math.cos(a) * math.cos(e),
                    target[1] + dist * math.sin(a) * math.cos(e),
                    target[2] + dist * math.sin(e))
    d = Vector(target) - cam.location
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def render_action(rig, cam, name, frames, out_dir):
    for d in DIRS:
        place_cam(cam, DIR_ANGLE[d])
        ddir = out_dir / name / d
        ddir.mkdir(parents=True, exist_ok=True)
        for f in range(1, frames + 1):
            bpy.context.scene.frame_set(f)
            bpy.context.scene.render.filepath = str(ddir / f"frame-{f - 1:02d}.png")
            bpy.ops.render.render(write_still=True)
        print(f"  {name}/{d} {frames} frames")


def main():
    clean()
    cam = setup_scene()
    rig = build_rig()
    OUT.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.frame_start = 1

    rig.animation_data_create()
    walk = bpy.data.actions.new("walk")
    rig.animation_data.action = walk
    n = make_walk(rig)
    bpy.context.scene.frame_end = n
    render_action(rig, cam, "walk", n, OUT)

    atk = bpy.data.actions.new("attack")
    rig.animation_data.action = atk
    n = make_attack(rig)
    bpy.context.scene.frame_end = n
    render_action(rig, cam, "attack", n, OUT)
    print("done ->", OUT)


if __name__ == "__main__":
    main()
