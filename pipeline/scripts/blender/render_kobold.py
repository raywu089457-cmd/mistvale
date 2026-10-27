"""render_kobold.py — 低模「礦穴地精」→ 8 方向走路/攻擊序列（3D 渲圖路線的第一步）。

    "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" -b -P pipeline/scripts/blender/render_kobold.py -- <out_dir>

跟 render_8dir.py 的差別：那支是通用的方塊人，這支是**照 sprite 造型**做的低模
（大頭＋尖耳＋礦工帽＋帽上蠟燭＋皮圍裙＋小鎬），顏色直接取自 sprite 的代表色，
所以「同一個角色」這件事是靠造型與配色，不是靠切圖。

流程照舊：低模 → 骨架（biped）→ walk / attack 各 8 格 → 8 台正交相機（仰角 35°）→ Workbench 硬邊渲圖。
渲完用 pixelize_renders.py 壓成遊戲格子規格，再跟現有 sprite 並排比較。
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

REPO = Path(__file__).resolve().parents[3]
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = Path(ARGS[0]) if ARGS else Path("output/kobold3d")
OUT = OUT if OUT.is_absolute() else (REPO / OUT)
SIZE = 256
DIRS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"]
DIR_ANGLE = {"east": 0, "south-east": 45, "south": 90, "south-west": 135,
             "west": 180, "north-west": 225, "north": 270, "north-east": 315}
ELEV = 35.0

# 從 sprite 取的代表色（sRGB 0–255）
C_SKIN = (0x8b, 0x95, 0x6a)
C_SKIN_D = (0x67, 0x70, 0x4d)
C_LEATHER = (0x7f, 0x59, 0x40)
C_LEATHER_D = (0x49, 0x36, 0x28)
C_CLOTH = (0x61, 0x5b, 0x4c)
C_METAL = (0xb8, 0xc2, 0xcc)
C_WOOD = (0x8a, 0x60, 0x41)
C_CANDLE = (0xf2, 0xe6, 0xc0)
C_FLAME = (0xff, 0xd0, 0x60)


def srgb(c):
    return tuple(v / 255 for v in c)   # Workbench 的 diffuse_color 已經是顯示色,不要再加 gamma(會變暗)


def mat(name, rgb, emit=0.0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*srgb(rgb), 1)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    if b:
        b.inputs["Base Color"].default_value = (*srgb(rgb), 1)
        b.inputs["Roughness"].default_value = .85
        if emit:
            b.inputs["Emission Color"].default_value = (*srgb(rgb), 1)
            b.inputs["Emission Strength"].default_value = emit
    return m


def box(name, size, loc, material, rig=None, bone=None, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.object
    o.name = name
    o.scale = Vector(size) / 2
    o.rotation_euler = tuple(math.radians(a) for a in rot)
    o.location = Vector(loc)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    o.data.materials.append(material)
    if rig and bone:
        vg = o.vertex_groups.new(name=bone)
        vg.add(range(len(o.data.vertices)), 1.0, "REPLACE")
        o.modifiers.new("arm", "ARMATURE").object = rig
    return o


def cone(name, r, depth, loc, material, rig=None, bone=None, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=r, radius2=0, depth=depth)
    o = bpy.context.object
    o.name = name
    o.rotation_euler = tuple(math.radians(a) for a in rot)
    o.location = Vector(loc)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    o.data.materials.append(material)
    if rig and bone:
        vg = o.vertex_groups.new(name=bone)
        vg.add(range(len(o.data.vertices)), 1.0, "REPLACE")
        o.modifiers.new("arm", "ARMATURE").object = rig
    return o


def build():
    skin, skin_d = mat("skin", C_SKIN), mat("skin_d", C_SKIN_D)
    leather, leather_d = mat("leather", C_LEATHER), mat("leather_d", C_LEATHER_D)
    cloth, metal, wood = mat("cloth", C_CLOTH), mat("metal", C_METAL), mat("wood", C_WOOD)
    candle, flame = mat("candle", C_CANDLE), mat("flame", C_FLAME, emit=3.0)

    arm = bpy.data.armatures.new("rig")
    rig = bpy.data.objects.new("rig", arm)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.edit_bones
    root = eb.new("root"); root.head = (0, 0, 0); root.tail = (0, 0, .08)
    hips = eb.new("hips"); hips.head = (0, 0, .40); hips.tail = (0, 0, .54); hips.parent = root
    spine = eb.new("spine"); spine.head = (0, 0, .54); spine.tail = (0, 0, .80); spine.parent = hips
    head = eb.new("head"); head.head = (0, 0, .80); head.tail = (0, 0, 1.24); head.parent = spine
    for side, sx in (("L", -1), ("R", 1)):
        th = eb.new(f"thigh.{side}"); th.head = (sx * .13, 0, .40); th.tail = (sx * .13, 0, .21); th.parent = hips
        sh = eb.new(f"shin.{side}"); sh.head = (sx * .13, 0, .21); sh.tail = (sx * .13, 0, .03); sh.parent = th
        ua = eb.new(f"arm.{side}"); ua.head = (sx * .24, 0, .74); ua.tail = (sx * .33, 0, .58); ua.parent = spine
        fa = eb.new(f"fore.{side}"); fa.head = (sx * .33, 0, .58); fa.tail = (sx * .35, 0, .44); fa.parent = ua
    wp = eb.new("weapon"); wp.head = (.35, -.10, .44); wp.tail = (.35, -.10, .78); wp.parent = eb["fore.R"]
    bpy.ops.object.mode_set(mode="OBJECT")

    # ---- 頭（大頭 2.6 頭身）：頭骨＋吻部＋兩片尖耳 ----
    # 頭：寬頭骨 + 吻部 + 兩片扁長尖耳（左右張開）
    box("skull", (.46, .42, .42), (0, -.01, .99), skin, rig, "head")     # 底部 0.78 → 吃進軀幹 0.03
    box("snout", (.26, .18, .16), (0, -.28, .93), skin_d, rig, "head")
    box("brow", (.44, .06, .07), (0, -.20, 1.12), skin_d, rig, "head")
    box("ear.L", (.22, .07, .13), (-.30, .03, 1.06), skin, rig, "head", rot=(0, -24, 12))
    box("ear.R", (.22, .07, .13), (.30, .03, 1.06), skin, rig, "head", rot=(0, 24, -12))
    # 礦工帽＋帽簷＋蠟燭
    box("cap", (.42, .40, .16), (0, -.01, 1.27), leather_d, rig, "head")
    box("brim", (.52, .48, .05), (0, -.05, 1.19), leather_d, rig, "head")
    box("candle", (.06, .06, .12), (.12, -.02, 1.40), candle, rig, "head")
    cone("flame", .045, .09, (.12, -.02, 1.51), flame, rig, "head")
    # ---- 身體：短袍＋皮圍裙＋腰帶 ----
    box("torso", (.42, .32, .30), (0, 0, .66), cloth, rig, "spine")     # 0.51..0.81
    box("apron", (.30, .06, .24), (0, -.18, .66), leather, rig, "spine")
    box("belt", (.42, .32, .07), (0, 0, .54), leather_d, rig, "hips")
    box("hip", (.40, .30, .14), (0, 0, .47), cloth, rig, "hips")       # 0.40..0.54
    # ---- 四肢（短粗）----
    for side, sx in (("L", -1), ("R", 1)):
        # 每個零件都往上多留 3–4 cm 蓋住關節（剛性零件轉動時才不會露縫）
        box(f"thigh.{side}", (.17, .19, .26), (sx * .13, 0, .30), cloth, rig, f"thigh.{side}")
        box(f"shin.{side}", (.14, .16, .21), (sx * .13, 0, .13), skin, rig, f"shin.{side}")
        box(f"foot.{side}", (.15, .23, .07), (sx * .13, -.05, .035), leather_d, rig, f"shin.{side}")
        box(f"upperarm.{side}", (.13, .14, .21), (sx * .245, 0, .66), cloth, rig, f"arm.{side}")
        box(f"forearm.{side}", (.12, .13, .18), (sx * .30, -.01, .50), skin, rig, f"fore.{side}")
        box(f"hand.{side}", (.12, .13, .10), (sx * .315, -.01, .42), skin_d, rig, f"fore.{side}")
    # 鎬（右手）
    box("haft", (.05, .05, .36), (.315, -.10, .57), wood, rig, "weapon")
    box("pick", (.26, .06, .06), (.315, -.10, .75), metal, rig, "weapon")
    box("pick2", (.06, .06, .11), (.315, -.10, .68), metal, rig, "weapon")
    return rig


def setup():
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.render_aa = "OFF"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "MATERIAL"
    sc.display.shading.show_shadows = True
    sc.display.shading.show_cavity = True
    sc.render.film_transparent = True
    sc.render.resolution_x = SIZE
    sc.render.resolution_y = SIZE
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "Standard"
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 1.62
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.collection.objects.link(cam)
    sc.camera = cam
    return cam


def place_cam(cam, angle):
    a, e = math.radians(angle), math.radians(ELEV)
    t = (0, 0, .70)
    d = 6.0
    cam.location = (t[0] + d * math.cos(a) * math.cos(e), t[1] + d * math.sin(a) * math.cos(e), t[2] + d * math.sin(e))
    cam.rotation_euler = (Vector(t) - cam.location).to_track_quat("-Z", "Y").to_euler()


def key(rig, frame, pose):
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
        r = pose.get(pb.name, (0, 0, 0))
        pb.rotation_euler = tuple(math.radians(v) for v in r)
        pb.keyframe_insert("rotation_euler", frame=frame)


def walk(rig):
    plan = [(28, -28), (15, -15), (0, 0), (-15, 15), (-28, 28), (-15, 15), (0, 0), (15, -15)]
    for i, (l, r) in enumerate(plan, 1):
        key(rig, i, {"thigh.L": (l, 0, 0), "thigh.R": (r, 0, 0),
                     "shin.L": (-abs(l) * .45, 0, 0), "shin.R": (-abs(r) * .45, 0, 0),
                     "arm.L": (-l * .5, 0, 0), "arm.R": (-r * .5, 0, 0),
                     "spine": (1.5 if i % 2 else -1.5, 0, 0)})
        hips = rig.pose.bones["hips"]
        hips.location = (0, 0, -.01 if i in (2, 3, 6, 7) else 0)
        hips.keyframe_insert("location", frame=i)
    return len(plan)


def attack(rig):
    swing = [0, -20, -35, 5, 55, 42, 15, 0]
    for i, s in enumerate(swing, 1):
        key(rig, i, {"arm.R": (-s, 0, 0), "fore.R": (-s * .4, 0, 0), "arm.L": (s * .3, 0, 0),
                     "spine": (s * .18, 0, 0), "head": (-s * .1, 0, 0)})
    return len(swing)


def render(rig, cam, name, n):
    for d in DIRS:
        place_cam(cam, DIR_ANGLE[d])
        folder = OUT / name / d
        folder.mkdir(parents=True, exist_ok=True)
        for f in range(1, n + 1):
            bpy.context.scene.frame_set(f)
            bpy.context.scene.render.filepath = str(folder / f"frame-{f - 1:02d}.png")
            bpy.ops.render.render(write_still=True)
        print(f"  {name}/{d} {n} frames")


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cam = setup()
    rig = build()
    OUT.mkdir(parents=True, exist_ok=True)
    sc = bpy.context.scene
    rig.animation_data_create()
    rig.animation_data.action = bpy.data.actions.new("walk")
    n = walk(rig); sc.frame_start, sc.frame_end = 1, n
    render(rig, cam, "walk", n)
    rig.animation_data.action = bpy.data.actions.new("attack")
    n = attack(rig); sc.frame_start, sc.frame_end = 1, n
    render(rig, cam, "attack", n)
    print("done ->", OUT)


if __name__ == "__main__":
    main()
