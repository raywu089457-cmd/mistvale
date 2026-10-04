# make_batch4.py — Xilurus 風格第四批:英雄與魔物的更多狀態圖(以第一張表當 REF,外型一致)。
# 英雄每職業第二張 5x2 表:呼吸待機、出手收招、倒地、勝利、用餐、飲用、睡覺、包紮休養、交易、訓練揮擊。
# 魔物每種第二張 5x1 表:呼吸待機、第二走路格、出手收招、第二受擊格、倒下屍體。
TAIL = ("Background: perfectly flat solid pure magenta #FF00FF everywhere, no ground plane, no cast shadows on the background, "
        "no text, no numbers, no letters, no labels, no grid lines. One sprite sheet image only.")
TAIL_G = TAIL.replace("pure magenta #FF00FF", "pure bright green #00FF00")


def listing(items, start=1):
    return "; ".join(f"({i + start}) {t}" for i, t in enumerate(items))


def write(name, text):
    with open(name + ".txt", "w", encoding="utf-8") as f:
        f.write(text + "\n")


HERO = ("Pixel art character sprite sheet, 16-bit retro JRPG style matching a warm isometric village tileset. Use the attached reference image as the exact "
        "character design: SAME character, same face, hair, outfit, colors, weapon, proportions (cute chibi about 2.5 heads tall) and the same pixel size, dark brown "
        "outline #0a0706, chunky hard pixels with no anti-aliasing, light from the upper right. Exactly 10 NEW animation frames of this character arranged in a clean "
        "5 columns x 2 rows grid, each frame fully visible and centered in its cell, wide empty gaps between them, none touching each other or the canvas edge. "
        "3/4 side view, the character FACES TO THE RIGHT in every frame.")
POSES = ["idle breathing frame: same as the standing idle pose but shoulders slightly lowered and chest relaxed",
         "attack follow-through: just after striking to the right, weapon swung past the target, body leaning forward",
         "defeated: lying flat on the ground on their back, eyes closed (x x), weapon dropped beside them",
         "victory: cheering with the weapon raised high and a big smile",
         "eating: sitting on the ground eating a loaf of bread happily",
         "drinking: standing and drinking from a wooden mug of ale",
         "sleeping: curled up lying on the ground asleep with a small blanket",
         "resting injured: sitting on the ground with white bandages on the head and arm",
         "trading: standing and holding out a small brown coin pouch with both hands",
         "training: practicing a swing with the weapon toward the right, focused expression, a drop of sweat"]


def hero(name, who, bg=TAIL):
    write(name, f"{HERO}\n\nThe character: {who}.\n\nRow 1: {listing(POSES[:5])}.\nRow 2: {listing(POSES[5:], 6)}.\n\n{bg}")


hero("hero-berserker-iso-b", "berserker with spiky brown hair, fur-collared brown leather armor, red sash, wielding a huge double-bladed battle axe")
hero("hero-ranger-iso-b", "ranger in a forest-green hood and cloak with a brown leather vest, holding a wooden longbow with a quiver of arrows on the back")
hero("hero-paladin-iso-b", "paladin in a steel helmet and silver plate armor with a round blue shield bearing a golden cross and a straight sword")
hero("hero-sorcerer-iso-b", "sorcerer in a tall purple pointed hat and purple robe with gold trim, holding a wooden staff topped with a glowing purple crystal", TAIL_G)
hero("hero-darkknight-iso-b", "dark knight in black spiked horned full plate armor with glowing red eyes in the visor, a red cape and a huge black greatsword")
hero("hero-priest-iso-b", "priest in a white hooded robe with gold trim holding a golden cross-topped staff")

MON = ("Pixel art sprite sheet, 2:1 isometric view, 16-bit retro JRPG style matching a warm isometric village tileset. Use the attached reference image as the exact "
       "creature design: SAME monster, same colors, same size, same pixel size and same camera angle. Exactly 5 NEW animation frames of this ONE monster arranged in a "
       "clean 5 columns x 1 row grid, each frame fully visible and centered in its cell, wide empty gaps between them, none touching each other or the canvas edge. "
       "The monster FACES TO THE RIGHT in every frame. Dark brown outline #0a0706, chunky hard pixels with no anti-aliasing, lighting from the upper right.")


def mon(name, who, frames):
    write(name, f"{MON}\n\nThe monster: {who}.\n\nFrames left to right: {listing(frames)}.\n\n{TAIL}")


mon("mon-slime-iso-b", "round green slime with a glossy highlight and two small eyes",
    ["idle breathing: slightly taller and narrower than the round idle pose", "walk second frame: landing from a hop, squashed wide with a small splash",
     "attack recovery: pulling back after a lunge to the right, body wobbling", "hurt second frame: knocked back to the left, body flattened sideways with eyes as x x",
     "defeated: melted into a flat puddle of green goo with x x eyes"])
mon("mon-wolf-iso-b", "gray-brown wolf",
    ["idle breathing: standing alert on four legs with mouth slightly open, panting", "walk second frame: trotting side view with the opposite legs forward from a normal stride",
     "attack recovery: landing after a leap to the right, front paws on the ground, snarling", "hurt second frame: knocked back to the left, legs buckling, yelping",
     "defeated: lying on its side on the ground, eyes closed (x x)"])
mon("mon-golem-iso-b", "mossy stone golem with blocky limbs",
    ["idle breathing: standing heavy, chest slightly raised, glowing eyes", "walk second frame: mid-stride side view with the other heavy leg forward",
     "attack recovery: pulling the stone fist back after a punch to the right, dust puff", "hurt second frame: kneeling on one knee to the left, cracked stones chipping off",
     "defeated: collapsed into a pile of mossy stone blocks with dim eyes"])
mon("mon-treant-iso-b", "the forest lord, a huge ancient treant boss with a bark body, glowing red eyes, a wide fanged mouth and large antler-like branches with green leaves",
    ["idle breathing: towering, branches swaying slightly, mouth closed", "walk second frame: mid-stride side view with the other root-leg forward",
     "attack recovery: pulling the branch-arm back after a swing to the right, leaves falling", "hurt second frame: kneeling and recoiling to the left, bark splintering",
     "defeated: collapsed on the ground as a fallen dead tree trunk with withered leaves"])
