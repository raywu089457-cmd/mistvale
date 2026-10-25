#!/usr/bin/env python3
"""styles.py — spriteforge 的風格提示詞庫（移植）+ 轉成 PixelLab 用的動作描述。

來源：marcelontime/spriteforge `js/prompts.js`（MIT）。
原本是給 OpenAI gpt-image-1 用的「一幀一張」提示詞；這裡保留原資料結構，
多一個 `pixellab_description()` 把風格 + 動作 + 幀序轉成 PixelLab v3 的
`action_description`（v3 收的是文字描述，不是動作代號）。

用法:
    python styles.py --list
    python styles.py --style pixelart --action attack --frames 8
    python styles.py --style fighter --action walk --frame 3      # 看單一幀的提示詞
"""
from __future__ import annotations

import argparse
import json

# ---------------------------------------------------------------- 共用否定詞
NEGATIVE_ITEMS = ", ".join([
    "text", "logos", "watermarks", "UI", "grids", "props", "backgrounds",
    "non-transparent background", "white background", "solid background",
])

SPRITE_SYSTEM_PRIMER = (
    "Generate sprite with FULLY TRANSPARENT BACKGROUND (alpha channel transparency). "
    "No solid backgrounds or backdrops of any kind. Maintain character consistency and smooth motion."
)

# ---------------------------------------------------------------- 調色盤
PALETTES = {
    "NES": [
        "#7C7C7C", "#0000FC", "#0000BC", "#4428BC", "#940084", "#A80020", "#A81000", "#881400",
        "#503000", "#007800", "#006800", "#005800", "#004058", "#000000", "#BCBCBC", "#0078F8",
        "#0058F8", "#6844FC", "#D800CC", "#E40058", "#F83800", "#E45C10", "#AC7C00", "#00B800",
        "#00A800",
    ],
    "CPS2": [
        "#000000", "#1F0745", "#510B7C", "#772082", "#8A2387", "#9B3C8C", "#AC5591", "#BD6E96",
        "#CE879B", "#DFA0A0", "#F0B9A5", "#FFD2AA", "#FFFFFF",
    ],
}

# ---------------------------------------------------------------- 風格定義
STYLE_DEFINITIONS = {
    "original": dict(
        name="Original Style", description="Uses the reference image directly", base=512,
        is_reference_only=True, technical_specs=["Direct use of reference image", "No style modification",
                                                 "Maintains original proportions"],
        special_features=["Exact reference matching", "Original art style"], restrictions=[]),
    "pixelart": dict(
        name="Stardew Valley", description="32×32 cozy farming RPG style", base=32, gutter=1,
        style_anchor="Stardew Valley character sprite",
        technical_specs=["Limited 32-color palette", "Soft pastel shading", "Clean pixel edges",
                         "1px black outline"],
        special_features=["Charming facial features", "Slightly oversized head", "Warm color grading"],
        restrictions=["harsh shadows", "complex gradients", "realistic proportions", "aggressive poses"]),
    "celshaded": dict(
        name="Breath of the Wild", description="256×256 cel-shaded adventure style", base=256, gutter=2,
        style_anchor="Legend of Zelda: Breath of the Wild character",
        technical_specs=["Cel-shaded rendering", "Soft rim lighting", "Muted color palette",
                         "Subtle material variation"],
        special_features=["Environmental color bounce", "Cloth material definition", "Dynamic wind effects"],
        restrictions=["full black outlines", "flat shading", "oversaturated colors", "rigid poses"]),
    "lowpoly": dict(
        name="Genshin Impact", description="192×192 anime-styled cel-shading", base=192, gutter=2,
        style_anchor="Genshin Impact character render",
        technical_specs=["Anime cel-shading", "Vibrant color palette", "Gradient hair shading",
                         "Subtle ambient occlusion"],
        special_features=["Dynamic hair physics", "Glossy material highlights", "Elemental effects integration"],
        restrictions=["realistic textures", "dark color schemes", "rigid animation", "western art style"]),
    "handdrawn": dict(
        name="Hollow Knight", description="128×128 hand-drawn gothic style", base=128, gutter=2,
        style_anchor="Hollow Knight character art",
        technical_specs=["Hand-drawn line art", "Ink wash shading", "Limited color palette",
                         "Atmospheric effects"],
        special_features=["Ethereal particle effects", "Dramatic pose silhouettes", "Flowing cape physics"],
        restrictions=["bright colors", "rigid geometry", "clean edges", "realistic proportions"]),
    "cartoon": dict(
        name="Fall Guys", description="160×160 bouncy cartoon style", base=160, gutter=2,
        style_anchor="Fall Guys character model",
        technical_specs=["Soft rubber shading", "Pastel color palette", "Subsurface scattering",
                         "Smooth deformation"],
        special_features=["Jelly physics hints", "Cute face patterns", "Costume integration"],
        restrictions=["sharp edges", "realistic materials", "complex geometry", "serious expressions"]),
    "retro": dict(
        name="8-bit Retro", description="32×32 EXTREME pixel-crawl, NES constraints", base=32, gutter=1,
        style_anchor="1986 Famicom sprite",
        technical_specs=["Use exact 25-color NES palette", "Max 3 shades per material",
                         "Perfect square pixels only", "1px black outline"],
        special_features=["Micro '+' dithering on mid-tones", "Checker shadow under feet"],
        restrictions=["anti-aliasing", "gradients", "smooth edges", "modern anatomy"]),
    "fighter": dict(
        name="Arcade Fighter", description="120×120 Hi-Res CPS-2 sprite, Street-Fighter-III era",
        base=120, gutter=4, style_anchor="CPS-2 ROM sprite (SF III style)",
        technical_specs=["Use CPS-2 palette, max 64 colors", "4-6 shade banding with AA",
                         "2px warm-grey outline (#444)"],
        special_features=["Sub-pixel beard highlights", "Strong dynamic posing"],
        restrictions=["black outline", "flat fills", "pixel dithering", "stiff poses"]),
    "modern": dict(
        name="Flat Cartoon", description="Adobe-Animate-style vector graphic, 96×96", base=96, gutter=2,
        style_anchor="Modern indie game sprite (Cult of the Lamb style)",
        technical_specs=["Flat fills with 3-step shading", "Thick 3px outline (#1A1A1A)",
                         "Subtle metal gradients"],
        special_features=["Rounded corners", "Chibi proportions"],
        restrictions=["pixel art", "heavy shading", "realistic anatomy", "complex textures"]),
}

# ---------------------------------------------------------------- 動作庫
ACTION_PROMPTS = {
    "idle": dict(name="Idle Animation", frames=4,
                 base="Character in neutral standing pose, slight breathing motion, maintaining balance with subtle movement. Arms relaxed at sides, head straight, alert expression.",
                 frame_prompts=["Initial neutral stance, weight evenly distributed",
                                "Subtle chest rise during inhale, shoulders lifting slightly",
                                "Peak of breathing motion, maximum height",
                                "Returning to neutral stance, shoulders lowering"]),
    "walk": dict(name="Walking Animation", frames=12,
                 base="Character walking cycle with smooth, natural movement. Arms swinging naturally opposite to legs.",
                 frame_prompts=["Starting walk pose, right foot forward", "Right foot plant, left foot lifting",
                                "Mid-step, left foot passing right", "Left foot extending forward",
                                "Left foot about to plant", "Left foot planted, right lifting",
                                "Mid-step, right foot passing left", "Right foot extending forward",
                                "Right foot about to plant", "Full stride, weight shifting",
                                "Recovery phase, preparing next step", "Completing cycle, returning to start"]),
    "jump": dict(name="Jump Animation", frames=4,
                 base="Character performing a vertical jump with dynamic motion. Arms assist the jumping motion.",
                 frame_prompts=["Crouch preparation, knees bent, arms back",
                                "Launch phase, legs extending, arms swinging up",
                                "Peak of jump, fully extended, arms raised",
                                "Landing preparation, legs bent for impact"]),
    "air_attack": dict(name="Air Attack", frames=2,
                       base="Character executing an aerial attack with powerful striking motion while airborne.",
                       frame_prompts=["Wind-up pose in air, preparing strike",
                                      "Full extension of aerial attack, maximum reach"]),
    "hurt": dict(name="Hurt Animation", frames=2,
                 base="Character reacting to taking damage, showing pain and recoil motion.",
                 frame_prompts=["Initial impact reaction, body tensing, face grimacing",
                                "Recoil position, defensive stance, showing pain"]),
    "knock_out": dict(name="Knockout Animation", frames=6,
                      base="Character being defeated and falling to the ground, dramatic motion.",
                      frame_prompts=["Initial impact reaction, losing balance", "Beginning to fall backward",
                                     "Mid-fall, limbs starting to go limp", "Near ground, body horizontal",
                                     "Impact with ground, slight bounce", "Final resting position, defeated"]),
    "punches": dict(name="Punch Combinations", frames=8,
                    base="Character executing various punch attacks with proper fighting stance and form.",
                    frame_prompts=["Ready stance, guard up", "Right jab initiation", "Right jab extension",
                                   "Recovery and left hook wind-up", "Left hook execution", "Hook follow-through",
                                   "Uppercut preparation", "Uppercut connection"]),
    "turn_around": dict(name="Turn Around Animation", frames=3,
                        base="Character smoothly changing direction with a 180-degree turn.",
                        frame_prompts=["Beginning turn, weight shift initiation",
                                       "Mid-turn, profile view, arms following motion",
                                       "Completing turn, settling into new direction"]),
}

# 我們遊戲自己的動作 → spriteforge 動作庫的對應（給 PixelLab 管線用）
OUR_ACTION_ALIASES = {
    "attack": "punches", "walk": "walk", "idle": "idle", "hurt": "hurt", "death": "knock_out",
    "jump": "jump", "airAttack": "air_attack", "turnAround": "turn_around",
}


def style_block(style_id: str) -> str:
    """跟 spriteforge createStylePrompt().buildBlock() 同一個格式。"""
    s = STYLE_DEFINITIONS[style_id]
    if s.get("is_reference_only"):
        return f"Style: Reference\nSize: {s['base']}×{s['base']}"
    return "\n".join([
        f"Style: {s['style_anchor']}",
        f"Size: {s['base']}×{s['base']}",
        f"Tech: {'. '.join(s['technical_specs'][:2])}",
        f"Key: {s['special_features'][0]}",
        f"Avoid: {', '.join(s['restrictions'][:2])}",
    ])


def frame_prompt(style_id: str, action_id: str, frame_index: int = 0, reference: str = "REF_CHAR",
                 seed: int | None = None, continuation: bool = False) -> str:
    """單一幀的完整提示詞（spriteforge generateSpritePrompt 的移植，給 gpt-image 用）。"""
    action = ACTION_PROMPTS[action_id]
    if not 0 <= frame_index < action["frames"]:
        raise ValueError(f"frame_index {frame_index} 超出 {action_id}（共 {action['frames']} 幀）")
    style = STYLE_DEFINITIONS[style_id]
    parts = [SPRITE_SYSTEM_PRIMER, f"Character: {reference}"]
    if not style.get("is_reference_only"):
        parts.append(style_block(style_id))
    parts += [f"Frame: {frame_index + 1}/{action['frames']}", f"Action: {action['name']}",
              f"Base Description: {action['base']}",
              f"Frame Description: {action['frame_prompts'][frame_index]}"]
    if action["frames"] > 1:
        if frame_index == 0:
            parts.append(f"This is the FIRST frame of a {action['frames']}-frame animation sequence.")
        elif frame_index == action["frames"] - 1:
            parts.append(f"This is the FINAL frame ({frame_index + 1}/{action['frames']}) of the animation sequence.")
        else:
            parts.append(f"This is frame {frame_index + 1} in a {action['frames']}-frame animation sequence.")
        if frame_index > 0:
            parts.append(f"Previous frame showed: {action['frame_prompts'][frame_index - 1]}")
        if frame_index < action["frames"] - 1:
            parts.append(f"Next frame will show: {action['frame_prompts'][frame_index + 1]}")
    if continuation:
        parts.append("Continuity: DIRECTLY CONTINUE from previous frame. Maintain exact character design "
                     "consistency including colors, shading style, and outline thickness.")
    if seed is not None:
        parts.append(f"Seed: {seed}")
    parts += [f"Avoid: {NEGATIVE_ITEMS}",
              "IMPORTANT: Output image MUST have transparent background with NO solid color backdrop."]
    return "\n".join(parts)


def pixellab_description(style_id: str, our_action: str, frames: int = 8) -> str:
    """轉成 PixelLab v3 的 `action_description`（單句文字描述，風格寫進去）。"""
    action_id = OUR_ACTION_ALIASES.get(our_action, our_action)
    action = ACTION_PROMPTS[action_id]
    s = STYLE_DEFINITIONS[style_id]
    motion = " ".join(action["frame_prompts"][:3])
    if s.get("is_reference_only"):
        return f"{action['base']} {motion}"
    return (f"{action['base']} {motion} Art style: {s['style_anchor']} — "
            f"{'. '.join(s['technical_specs'][:2])}. Keep the palette consistent across all frames.")


def main() -> int:
    parser = argparse.ArgumentParser(description="spriteforge 風格提示詞庫 + PixelLab 動作描述轉換")
    parser.add_argument("--list", action="store_true", help="列出所有風格")
    parser.add_argument("--style", choices=sorted(STYLE_DEFINITIONS))
    parser.add_argument("--action", default="attack")
    parser.add_argument("--frame", type=int, default=None, help="只看某一幀（gpt-image 格式）")
    parser.add_argument("--frames", type=int, default=8)
    parser.add_argument("--json", action="store_true", help="輸出 JSON（給其他腳本吃）")
    args = parser.parse_args()

    if args.list:
        for sid, s in STYLE_DEFINITIONS.items():
            print(f"{sid:10} {s['name']:20} {s['description']}")
        print("\n動作:", ", ".join(f"{k}({v['frames']})" for k, v in ACTION_PROMPTS.items()))
        return 0
    if not args.style:
        parser.error("需要 --style（或 --list）")

    if args.json:
        print(json.dumps({"style": args.style, "block": style_block(args.style),
                          "pixellab_description": pixellab_description(args.style, args.action, args.frames),
                          "palette": PALETTES.get("NES") if args.style == "retro" else
                                     PALETTES.get("CPS2") if args.style == "fighter" else None},
                         ensure_ascii=False, indent=2))
    elif args.frame is not None:
        print(frame_prompt(args.style, OUR_ACTION_ALIASES.get(args.action, args.action), args.frame))
    else:
        print(style_block(args.style)); print()
        print("PixelLab action_description:")
        print(" ", pixellab_description(args.style, args.action, args.frames))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
