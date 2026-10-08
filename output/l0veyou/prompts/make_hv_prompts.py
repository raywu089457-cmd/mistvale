# make_hv_prompts.py — 獵魔村風格(SPRITE_VISUAL_BIBLE 第 6 節)重寫 berserker/paladin/wolf/golem/treant 的提示詞 → ../prompts_hv/
import re, pathlib
P = pathlib.Path(__file__).parent; OUT = P.parent / "prompts_hv"; OUT.mkdir(exist_ok=True)
STYLE_H = ("Style: the pixel art style of the mobile game Evil Hunter Tycoon (獵魔村物語), exactly as in the attached reference screenshots: chunky detailed chibi pixel-art characters about 3 heads tall with a big head, small simple dot eyes, small body, hair and cloth drawn with 3-4 tone pixel clusters, a thin dark-brown near-black outline, rich warm slightly muted fantasy colors, hand-placed pixel highlights and shadows, clean readable silhouette. "
           "Palette of at most 16 colors, crisp hard pixel edges, NO anti-aliasing, NO blur, NO gradients, NO dithering noise. ")
STYLE_M = ("Style: the pixel art style of the mobile game Evil Hunter Tycoon (獵魔村物語) monsters, exactly as in the attached reference screenshots: chunky readable pixel-art fantasy creatures about 2 heads tall, simple expressive eyes (white eyeball, dark pupil, a tiny highlight), a thin dark-brown near-black outline, 3-4 tone pixel shading with hand-placed highlights, rich slightly muted colors, clean readable silhouette. "
           "Palette of at most 16 colors, crisp hard pixel edges, NO anti-aliasing, NO blur, NO gradients, NO dithering noise. ")
DESC = {
 "priest": "a gentle PRIEST hero: big round head under a white hood with gold trim, skin #f2c89b, big round eyes, long white robe with a gold sash and a small golden holy-symbol pendant, a tall golden staff topped with a glowing golden-white ring (#ffe9a0) (white robe and golden staff are the key shapes)",
 "darkknight": "a menacing-but-cute DARK KNIGHT hero: big round head in a black horned helmet with a glowing red visor slit, black plate armor with dark crimson (#b04038) trim, a short crimson cape, a round black shield with a red emblem on the left arm, and a straight black longsword in the right hand (heavy dark silhouette)",
 "archer": "a cheerful young ARCHER hero: big round head with short messy auburn hair (#8a4b2a) and a small white feather headband, big round eyes, skin #f2c89b, teal-green (#3f8f5f) short tunic over tan leather, a mustard-yellow scarf, brown boots, a LARGE wooden recurve longbow taller than the torso, and a brown quiver of white-fletched arrows on the back (bow and scarf are the key shapes)",
 "ranger": "a calm RANGER hero: big round head under a forest-green (#3f8f5f) hood with a long hooded green cloak that is the key silhouette, brown leather vest, skin #f2c89b, small dark-green boots, a medium wooden longbow in the hand and a quiver of green-fletched arrows on the back",
 "sorcerer": "a clever SORCERER hero: big round head with a tall purple (#7a4fbf) pointed wizard hat with a gold band (#e2b84c), skin #f2c89b, big round eyes, purple robe with gold trim, a LONG wooden staff topped with a glowing purple-blue crystal ball (#6c5ce7) (tall hat and long staff are the key silhouette)",
 "slime": "a cute round green slime: a stacked-blob body in light green #7fd66b with 3 flat shades, a small round bump on top, big round glossy eyes (white eyeball, black pupil, white highlight dot), a tiny closed mouth, a flat darker puddle base, one white glossy highlight",
 "berserker": "a fierce-but-cute BERSERKER hero: big round head with spiky brown hair (#6b4a2f) and determined eyebrows, skin #f2c89b, fur-collared brown leather vest, red sash (#b04038), short thick bare arms, wide shoulders, and a HUGE oversized double-bladed battle axe (blade #7f8fa6, handle brown) held in both hands",
 "paladin": "a brave cute PALADIN hero: big round head in a steel helmet with gold trim (#e2b84c), shiny silver plate armor, a LARGE round blue shield (#4a7fbf) with a golden cross on the left arm, and a straight longsword in the right hand (the big shield is the key shape)",
 "wolf": "a cute chubby gray wolf monster: a big round head with two triangle ears, big round eyes, small dark nose, closed friendly-grumpy mouth with NO teeth, a chunky oval body in gray #8d8f98 with a cream belly and a cream neck ruff, a red-orange (#d4544a) mane stripe along the back, four short thick square legs, a fluffy round tail with a cream tip (low long silhouette)",
 "golem": "a cute chunky stone golem monster: a square block head with a flat mossy green top (#4e8f3f), two big round glowing cyan eyes, round rock shoulders, huge round stone fists, a round tummy, short square block legs; rock gray-beige #8f8a80 in 3 flat shades, a few flat moss green patches (heavy wide silhouette)",
 "treant": "a cute chubby treant forest-lord monster about 2.5 heads tall: a thick round trunk body in bark brown #7a5a38 with a big round face (two big round eyes, small angry eyebrows, a small closed mouth, NO teeth), a round leafy green crown (#4e8f3f) on top with two small antler-like branches, two short thick stub arms ending in round leaf balls, short root feet",
}
VIEW = re.compile(r"(3/4 side view[^\n]*|Side view with[^\n]*|FRONT VIEW:[^\n]*|BACK VIEW:[^\n]*)")
n = 0
for src in sorted(P.glob("*.txt")):
    nm = src.stem
    m = re.match(r"(?:mon3-|dir-)?(berserker|paladin|archer|ranger|sorcerer|priest|darkknight|slime|wolf|golem|treant)-", nm + "-")
    if not m or nm.endswith(("-fx", "-back")): continue
    who = m.group(1); t = src.read_text(encoding="utf-8")
    sm = re.search(r"Style: (.*?)\n\n", t, re.S)
    if not sm: continue
    view = VIEW.search(sm.group(1)).group(1)
    t = t[:sm.start()] + (STYLE_H if who in ("berserker", "paladin", "archer", "ranger", "sorcerer", "priest", "darkknight") else STYLE_M) + view + "\n\n" + t[sm.end():]
    t = re.sub(r"The (monster|character): .*?\n\n", lambda x: f"The {x.group(1)}: {DESC[who]}.\n\n", t, count=1, flags=re.S)
    if nm.endswith("-idle"):
        t = re.sub(r"Use the attached reference image as the (?:monster|character) design[^.]*?but redraw it in the style below\. ", "", t)
    if nm.endswith("-idle"):
        t = re.sub(r"(The (?:monster|character): )", "Use the attached reference image (real Evil Hunter Tycoon game screenshots showing its characters and monsters) ONLY for art style, proportions, pixel shading and outline; do NOT copy those characters; redraw it as a side-view pixel sprite sheet. " + r"\1", t, count=1)
    t = t.replace("fanged", "").replace("claw swipe", "paw swipe")
    (OUT / src.name).write_text(t, encoding="utf-8"); n += 1
print(n, "prompts ->", OUT)
