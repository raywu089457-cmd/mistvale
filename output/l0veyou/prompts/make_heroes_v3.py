# make_heroes_v3.py — 新規格英雄(pipeline/ART_BIBLE.md)每個職業的 8 張 prompt:idle(設計表,以舊英雄圖當 REF 保留角色身分)、
# walk/attack/skill/hurt/death/victory(以新設計表第 1 格當 REF)、fx(技能特效,不帶 REF)。格線跟 build_hero.py 的 ACTIONS 一致。
# 用法:cd output/l0veyou/prompts && python make_heroes_v3.py   → <hero>-<action>.txt
STYLE = ("Cute modern pixel RPG for mobile idle games, retro 16-bit pixel art. Chibi proportions about 2.5 heads tall: big clear head, clear shoulders, simple body, clear legs, "
         "oversized readable weapon. STRONG CLEAR SILHOUETTE: weapon, gear and body never merge. Limited palette of about 14 colors, flat color blocking with exactly 3 shades per material "
         "(dark/mid/light), dark colored sel-out outline (dark brown, not pure black, not thick), crisp hard pixel edges, NO anti-aliasing, NO blur, NO gradients, NO dithering noise, "
         "no tiny unreadable details. 3/4 side view, the character FACES TO THE RIGHT in every frame.")
TAIL = ("Every frame is the SAME character with the same face, outfit, colors, weapon size and body proportions; only the pose changes. Frames are arranged in a strict grid of equal cells, "
        "read left to right, top to bottom, each character centered in its cell with plenty of empty space around it, nothing touching the cell borders or the canvas edge, no frame overlaps another. "
        "Background: perfectly flat solid pure {bg} everywhere, no ground, no cast shadow, no grid lines, no borders, no text, no numbers, no UI. One sprite sheet image only.")

HEROES = {
    "berserker": dict(
        who="a fierce BERSERKER hero: spiky brown hair, fur-collared brown leather armor, bare muscular arms, red sash, and a HUGE double-bladed battle axe held in both hands (wide strong silhouette, broad shoulders)",
        idle_hold="axe resting on the right shoulder",
        attack=["anticipation: plant feet wide, grip the axe with both hands", "wind-up: swing the axe far back over the left shoulder", "coil: body twisted, axe raised high behind the head",
                "start of the swing: axe coming over the head toward the right", "IMPACT: huge downward chop to the right, axe blade at the lowest point, small white impact flash",
                "follow-through: axe buried low on the right, body leaning forward", "recovery: lifting the axe back up", "back to ready stance, axe on the shoulder"],
        skill_name="Whirlwind Slash", skill=["crouch, gripping the axe low, red energy at the feet", "begin spinning, axe swung out to the side", "spinning fast, red-orange wind circle around the body",
                "spinning, the axe a blurred red arc around the body", "PEAK: full spin with a big red-orange shockwave ring", "spin slowing, sparks flying outward", "stop, axe extended to the right",
                "plant the axe in the ground", "lift the axe", "battle-ready pose, a few red sparks fading"],
        victory=["raise the axe high overhead with both hands, roaring", "flex one arm, axe on the shoulder", "slam the axe head on the ground, grinning", "proud pose, axe resting on the shoulder"],
        death=["struck, body jolting back", "dropping to one knee, axe falling", "both knees down", "collapsing forward", "lying face down, axe beside him", "lying still, eyes closed (x x)"],
        fx="red-orange (#ff5a2a, #ffb347, white, dark red #8a1e12)", fx_frames=["a small red-orange swirl at the feet (charge)", "a bigger red-orange swirl", "a red-orange spinning slash arc (full circle)",
                "a brighter spinning slash arc", "a big red-orange shockwave ring", "impact: red-orange pixel starburst", "impact: bigger burst with sparks", "fading red sparks"],
        bg="magenta #FF00FF"),
    "ranger": dict(
        who="a calm RANGER hero: forest-green hood and long hooded cloak, brown leather vest, green trousers, a medium wooden longbow and a quiver of green-fletched arrows on the back (cloaked nature silhouette, the long cloak is the key shape)",
        idle_hold="bow held low in the left hand, cloak hanging",
        attack=["anticipation: step forward, raise the bow toward the right", "draw an arrow from the quiver", "nock and pull the string back, elbow high", "full draw aiming right, cloak flaring",
                "RELEASE: the arrow flies off to the right, string snapping forward, small green flash at the bow", "follow-through, bow arm extended", "lower the bow", "back to ready stance"],
        skill_name="Piercing Shot", skill=["kneel down, green leaves swirling at the feet", "raise the bow, one glowing green arrow appears", "draw slowly, green energy gathering on the arrowhead",
                "full draw, a bright green aura around the body and the cloak blowing back", "RELEASE: a big glowing green arrow shoots to the right with a long trail", "recoil, cloak whipping",
                "still kneeling, bow aimed right", "standing up", "lowering the bow", "calm ready pose, green leaves fading"],
        victory=["raise the bow high", "pull the hood back with a smile", "twirl an arrow in the fingers", "proud pose, bow on the back, arms crossed"],
        death=["struck, body jolting back", "stumbling, bow slipping", "falling to the knees", "collapsing forward, cloak spreading", "lying face down under the cloak", "lying still, eyes closed (x x)"],
        fx="green (#7cd957, #d8ff9a, white, dark green #1f5a2a)", fx_frames=["a glowing green arrow flying right with a short trail", "the same arrow with a long trail", "a huge green piercing arrow with a long trail",
                "impact: green pixel starburst", "impact: bigger green ring with leaf sparks", "fading green leaves and sparkles", "a small green leaf swirl (charge)", "a bigger green leaf swirl"],
        bg="magenta #FF00FF"),
    "paladin": dict(
        who="a brave PALADIN hero: steel helmet with gold trim, shiny silver plate armor, a LARGE round blue shield with a golden cross held on the left arm, and a straight longsword in the right hand (heavy armored silhouette, the big shield is the key shape)",
        idle_hold="shield forward on the left arm, sword pointed down",
        attack=["anticipation: raise the shield, sword arm pulled back", "wind-up: sword raised behind the head", "coil: step in, shield tucked", "start of the slash toward the right",
                "IMPACT: wide horizontal sword slash to the right, small white impact flash", "follow-through, sword extended, body leaning forward", "recovery, pulling the sword back", "back to ready stance behind the shield"],
        skill_name="Holy Aegis", skill=["kneel, sword planted in the ground, praying", "golden light gathering above the head", "a golden halo appears, rays of light", "stand up, shield raised high, golden glow",
                "PEAK: a big golden holy shield dome shines around the body", "golden sparkles spread outward", "dome fading, standing strong", "lower the shield", "sword up in salute", "ready pose, last golden sparkles"],
        victory=["raise the sword high", "hold the shield up proudly", "salute with the sword before the face", "proud stance, shield and sword at rest"],
        death=["struck, body jolting back", "dropping to one knee, shield down", "both knees down, sword planted", "collapsing forward onto the shield", "lying face down, shield beside him", "lying still, eyes closed (x x)"],
        fx="golden holy light (#ffe27a, #fff6c8, white, amber #c98a1a)", fx_frames=["a small golden halo ring", "a bigger golden halo with rays", "a golden holy shield dome", "a brighter shield dome with crosses",
                "golden light pillar", "golden sparkles burst", "a green-gold plus sign (heal)", "fading golden sparkles"],
        bg="magenta #FF00FF"),
    "sorcerer": dict(
        who="a clever SORCERER hero: tall purple pointed wizard hat, purple robe with gold trim, and a LONG wooden staff topped with a glowing purple crystal (tall hat and long staff are the key silhouette)",
        idle_hold="staff held upright in the right hand, crystal glowing",
        attack=["anticipation: raise the staff toward the right", "gather energy, purple glow at the crystal", "staff pulled back, a purple orb forming", "point the staff at the right, orb growing",
                "CAST: a purple magic orb shoots off to the right, bright flash at the crystal", "follow-through, staff extended", "lower the staff", "back to ready stance"],
        skill_name="Meteor Fireball", skill=["raise the staff high, orange magic circle at the feet", "fire gathering above the head", "a big fireball forming above the staff", "the fireball growing, robe and hat blown by heat",
                "LAUNCH: swing the staff forward, the big fireball flies to the right", "follow-through, staff pointed right, embers", "magic circle fading", "lower the staff", "tip the hat", "ready pose, last embers"],
        victory=["raise the staff high, crystal flashing", "tip the hat with a wink", "spin the staff, sparkles around", "proud pose, staff planted"],
        death=["struck, body jolting back", "hat falling off, staggering", "falling to the knees", "collapsing forward, staff dropping", "lying face down, hat beside", "lying still, eyes closed (x x)"],
        fx="orange fire and purple magic (#ff7b2e, #ffd36a, white, purple #8a4bd8)", fx_frames=["a purple magic orb", "a big orange fireball flying right with a flame trail", "a bigger fireball with a long trail",
                "impact: orange explosion burst", "impact: bigger explosion with smoke puffs", "fading embers and smoke", "an orange magic circle (charge)", "a brighter orange magic circle"],
        bg="bright green #00FF00"),
}
COMMON = {
    "idle": ("4x1", ["idle standing, {hold}, relaxed", "idle breathing in: chest slightly up", "idle: head tilted slightly, hair/cloth swaying", "idle breathing out: back to the first pose"]),
    "walk": ("6x1", ["walk: right foot forward contact", "walk: right foot down, body lowest", "walk: passing, body slightly higher", "walk: left foot forward contact", "walk: left foot down, body lowest", "walk: passing, body slightly higher"]),
    "hurt": ("3x1", ["hurt: hit from the right, body snapping back to the left, eyes squeezed shut", "hurt: staggering back", "hurt: recovering balance, still facing right"]),
}


def write(hero, act, grid, frames, ref_note, bg):
    c, r = grid.split("x"); n = len(frames)
    body = "; ".join(f"({i + 1}) {t}" for i, t in enumerate(frames))
    open(f"{hero}-{act}.txt", "w", encoding="utf-8").write(
        f"Pixel art character sprite sheet. EXACTLY {n} frames in a {grid} grid ({c} columns x {r} rows).{ref_note} The character: {HEROES[hero]['who']}.\n\n"
        f"Style: {STYLE}\n\nFrames: {body}.\n\n{TAIL.format(bg=bg)}\n")


for h, d in HEROES.items():
    keep = (" Use the attached reference image as the character design (keep the same face, hair, colors, outfit and weapon) but redraw it in the style below.", " Use the attached reference image as the exact character design.")
    write(h, "idle", COMMON["idle"][0], [f.format(hold=d["idle_hold"]) for f in COMMON["idle"][1]], keep[0], d["bg"])
    write(h, "walk", *COMMON["walk"], keep[1], d["bg"])
    write(h, "hurt", *COMMON["hurt"], keep[1], d["bg"])
    write(h, "attack", "4x2", d["attack"], keep[1], d["bg"])
    write(h, "skill", "5x2", [f"signature skill '{d['skill_name']}': {f}" if i == 0 else f for i, f in enumerate(d["skill"])], keep[1], d["bg"])
    write(h, "death", "3x2", d["death"], keep[1], d["bg"])
    write(h, "victory", "4x1", [f"victory: {f}" for f in d["victory"]], keep[1], d["bg"])
    fx = d["fx"]
    open(f"{h}-fx.txt", "w", encoding="utf-8").write(
        f"Pixel art game visual effect sprite sheet, retro 16-bit pixel art for a cute mobile RPG, limited palette {fx}, crisp hard pixels, no anti-aliasing, no blur, no soft glow, no photorealism. "
        f"EXACTLY 8 frames in a 4x2 grid (4 columns x 2 rows), each effect centered in its cell with empty space around it, nothing touching cell borders. Frames: "
        + "; ".join(f"({i + 1}) {t}" for i, t in enumerate(d["fx_frames"]))
        + f". Background: perfectly flat solid pure {'bright green #00FF00' if h == 'sorcerer' else 'magenta #FF00FF'}, no text, no grid lines, no borders. One sprite sheet image only.\n")
print("ok")
