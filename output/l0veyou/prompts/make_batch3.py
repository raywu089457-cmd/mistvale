# make_batch3.py — Xilurus 風格第三批:補齊遊戲其餘全部美術(地貌/農作/庭院道具/特效/UI 圖示/六職業英雄/標題圖/地面材質)。
# 用法:cd output/l0veyou/prompts && python make_batch3.py   → 每張一個 .txt;run_batch3.sh 依序生圖。
HEAD = "Pixel art sprite sheet, 2:1 isometric view, 16-bit retro JRPG style like a high-quality isometric village tileset."
RULES = ("Art rules: warm saturated colors, dark brown outlines around every object, chunky hard pixels with no anti-aliasing, lighting from the upper right, "
         "subtle pixel shading using dithering. Palette anchors: salmon pink #d29c8a, dark red-brown #642726, golden straw #c49459 and #bb863d, "
         "dark brown outline #0a0706, blue-gray stone #5b5e6e, grass green #4a6e2a, sand #d4a690, snow #e2e9e9.")
TAIL = ("Background: perfectly flat solid pure magenta #FF00FF everywhere, no ground plane, no cast shadows on the background, "
        "no text, no numbers, no letters, no labels, no grid lines. One sprite sheet image only.")
TAIL_G = TAIL.replace("pure magenta #FF00FF", "pure bright green #00FF00")


def listing(items, start=1):
    return "; ".join(f"({i + start}) {t}" for i, t in enumerate(items))


def write(name, text):
    with open(name + ".txt", "w", encoding="utf-8") as f:
        f.write(text + "\n")


def sheet8(name, kind, items, extra="", tail=TAIL):
    write(name, f"{HEAD} Exactly 8 separate {kind} arranged in a clean 4 columns x 2 rows grid, each fully visible and centered in its cell, wide empty gaps between them, "
                f"none touching each other or the canvas edge, no overlap.{extra}\n\nRow 1: {listing(items[:4])}.\nRow 2: {listing(items[4:], 5)}.\n\n{RULES}\n\n{tail}")


sheet8("misc-iso-v1", "map objects", [
    "dark mountain cave entrance in a rugged gray rock face with a black opening and a few stalactites",
    "crumbling ancient stone ruins: two broken pillars and a fallen arch with moss",
    "fluffy white sheep standing, facing right",
    "brown goat with small horns standing, facing right",
    "small rectangular raised flower bed with a wooden border full of colorful flowers",
    "cluster of three red-capped mushrooms with white spots",
    "tall wooden pole with a hanging blue village banner bearing a white crest",
    "short wooden pole with a small red triangular battle flag"])
sheet8("wild-iso-v1", "nature and terrain details", [
    "low white snow drift mound with soft blue shadows",
    "small frozen pond: flat pale-blue ice oval with a snowy rim",
    "wide layered gray rock cliff ledge with a flat top",
    "fallen mossy tree log lying on the ground",
    "clump of green ferns",
    "small cluster of yellow wildflowers",
    "small cluster of pink wildflowers",
    "small cluster of blue wildflowers"])
sheet8("farm-iso-v1", "farm and yard objects", [
    "small cluster of white daisy flowers",
    "small patch of ripe golden wheat stalks",
    "two green cabbages growing in soil",
    "wooden treasure chest with iron bands, closed",
    "long wooden water trough",
    "straw scarecrow with a hat on a wooden cross",
    "wooden wheelbarrow",
    "round wooden table with two stools and a mug on top"])
sheet8("yard-iso-v1", "village yard props", [
    "wooden window flower box full of red and yellow flowers",
    "tall wooden pole with a long hanging purple banner",
    "pile of three burlap grain sacks",
    "single upright wooden barrel with iron hoops",
    "small wooden water bucket",
    "tall iron street lamp post with a glowing glass lantern on top",
    "empty building plot: square patch of bare dirt marked with four wooden stakes and rope",
    "small stone campfire ring with burning logs"])
sheet8("vfx-iso-v1", "game effect sprites", [
    "white curved sword slash arc with an orange trail",
    "glowing purple magic orb with sparkles",
    "green healing plus sign with soft glow",
    "golden four-pointed star sparkle",
    "orange-white impact burst star",
    "small cluster of white and yellow twinkling sparkles",
    "folded brown leather hide material icon",
    "single wooden arrow with gray fletching pointing to the upper right"],
    " These are flat game effect and item sprites, not isometric objects.")
ICON = ("Pixel art game UI icon sheet, 16-bit retro JRPG style matching a warm isometric village tileset. Exactly 16 separate item icons arranged in a clean "
        "4 columns x 4 rows grid, each icon fully visible and centered in its cell, all icons the same size, wide empty gaps between them, none touching each other or the canvas edge.")


def icons(name, items):
    rows = [items[i:i + 4] for i in range(0, 16, 4)]
    body = "\n".join(f"Row {r + 1}: {listing(row, r * 4 + 1)}." for r, row in enumerate(rows))
    write(name, f"{ICON}\n\n{body}\n\nArt rules: bold readable silhouettes, dark brown outlines #0a0706, warm saturated colors, chunky hard pixels with no anti-aliasing, "
                f"light from the upper right.\n\n{TAIL}")


icons("icons-iso-a", ["pile of gold coins", "blue gem crystals", "bundle of wood logs", "chunk of iron ore", "green herb leaves", "foaming mug of drink",
                      "bed with pillow", "red cross healing kit", "folded cloth fabric", "loaf of bread", "steel chest armor", "two crossed swords",
                      "blacksmith hammer", "iron anvil", "brown leather bag", "white skull"])
icons("icons-iso-b", ["hunter in green hood portrait", "town hall building", "rolled paper scroll", "folded treasure map", "green up arrow", "angry treant boss face with antler branches and red eyes",
                      "two hands shaking for trade", "curved war horn", "bronze gear cog", "wooden arrow", "golden star", "red heart",
                      "round blue shield with gold cross", "golden crown", "hourglass", "red potion bottle"])

HERO = ("Pixel art character sprite sheet, 16-bit retro JRPG style matching a warm isometric village tileset: a cute chibi hero about 2.5 heads tall, "
        "dark brown outline #0a0706, chunky hard pixels with no anti-aliasing, light from the upper right. Exactly 10 animation frames of the SAME character "
        "arranged in a clean 5 columns x 2 rows grid, each frame fully visible and centered in its cell, same size and same outfit in every frame, wide empty gaps "
        "between them, none touching each other or the canvas edge. The character is seen from a 3/4 side view and FACES TO THE RIGHT in every frame.")
POSES = ["idle standing pose", "walk frame 1: left foot forward on the ground", "walk frame 2: passing pose, feet together", "walk frame 3: right foot forward on the ground",
         "walk frame 4: passing pose, feet together, slightly raised", "attack windup: weapon pulled back, body coiled", "attack strike: weapon swung or fired forward to the right",
         "hurt: recoiling backward to the left with eyes squeezed shut, still facing right", "resting: sitting on the ground with the weapon beside them", "victory: weapon raised high"]


def hero(name, who, bg=TAIL):
    write(name, f"{HERO}\n\nThe character: {who}.\n\nRow 1: {listing(POSES[:5])}.\nRow 2: {listing(POSES[5:], 6)}.\n\n{bg}")


hero("hero-berserker-iso", "berserker with spiky brown hair, fur-collared brown leather armor, red sash, wielding a huge double-bladed battle axe")
hero("hero-ranger-iso", "ranger in a forest-green hood and cloak with a brown leather vest, holding a wooden longbow with a quiver of arrows on the back")
hero("hero-paladin-iso", "paladin in a steel helmet and silver plate armor with a round blue shield bearing a golden cross and a straight sword")
hero("hero-sorcerer-iso", "sorcerer in a tall purple pointed hat and purple robe with gold trim, holding a wooden staff topped with a glowing purple crystal", TAIL_G)
hero("hero-darkknight-iso", "dark knight in black spiked horned full plate armor with glowing red eyes in the visor, a red cape and a huge black greatsword")
hero("hero-priest-iso", "priest in a white hooded robe with gold trim holding a golden cross-topped staff")

write("title-iso", "Pixel art key art for a cozy fantasy hunter-village game, 16-bit retro JRPG style matching a warm isometric village tileset, 2:1 isometric view of a "
                   "small medieval village: golden thatched roofs, salmon-pink timber-framed houses, a stone knight statue in a cobblestone plaza, a wooden palisade "
                   "fence around the village with a gate, autumn and green trees, a few chibi adventurers (axe warrior, archer, knight with shield, purple-hat mage, "
                   "white-robed priest) walking out of the gate toward a meadow where green slimes wait, warm late-afternoon light from the upper right. "
                   "Dark brown pixel outlines, chunky hard pixels, rich detail. Leave the top quarter of the image as open sky with soft clouds for a title. No text, no letters, no logo.")
TEX = ("Seamless tileable pixel art ground texture, 16-bit retro JRPG style matching a warm isometric village tileset, viewed from directly above, "
       "the texture fills the entire square image edge to edge with an even uniform pattern, no objects, no border, no frame, no vignette, no lighting gradient, "
       "chunky hard pixels with no anti-aliasing, subtle dithering. The texture: ")
for name, what in [("tex-grass", "lush village grass, mid green #4a6e2a with lighter and darker blade clusters and a few tiny yellow flowers"),
                   ("tex-meadow", "bright sunny meadow grass, light green with small white and yellow flower dots"),
                   ("tex-forest", "dark green forest floor with fallen brown leaves, moss and small twigs"),
                   ("tex-taiga", "cool blue-green moss and pine needle ground"),
                   ("tex-snow", "clean white snow with faint pale blue shadows and sparkles"),
                   ("tex-mountain", "gray rocky gravel ground with cracks and pebbles"),
                   ("tex-desert", "warm golden desert sand with gentle wind ripples"),
                   ("tex-water", "deep blue sea water with light ripple highlights"),
                   ("tex-ice", "pale blue cracked ice surface"),
                   ("tex-dirt", "packed warm tan dirt ground #c49459 with small scattered pebbles and subtle irregular darker patches; no ruts, no tracks, no stripes, no straight lines, non-directional"),
                   ("tex-stone", "gray cobblestone plaza paving made of irregular rounded stones with dark mortar"),
                   ("tex-soil", "dark brown tilled farm soil with furrows")]:
    write(name, TEX + what + ".")
