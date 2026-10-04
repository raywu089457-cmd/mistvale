# make_batch2.py — Xilurus 風格第二批 prompt(遊戲 14 棟建築+廣場雕像+村門、四種魔物 5 格動作、區域地形、村莊道具、區域植物岩石)。
# 規則照 HANDOFF「Xilurus 風格批次生圖」:固定開頭、逐格描述、寫死色票、洋紅底結尾。
HEAD = "Pixel art sprite sheet, 2:1 isometric view, 16-bit retro JRPG style like a high-quality isometric village tileset."
RULES_B = ("Art rules: warm saturated colors, dark brown outlines around every object, chunky hard pixels with no anti-aliasing, "
           "soft lighting from the upper right, subtle pixel shading using dithering, straw texture strokes on thatched roofs, "
           "stone texture on chimneys and foundations, every building seen from the same 2:1 isometric camera with its front door facing the lower-left. "
           "Palette: salmon pink #d29c8a, dark red-brown #642726, golden straw #c49459 and #bb863d, dark brown outline #0a0706, blue-gray stone #5b5e6e.")
TAIL = ("Background: perfectly flat solid pure magenta #FF00FF everywhere, no ground plane, no cast shadows on the background, "
        "no text, no numbers, no letters, no labels, no grid lines. One sprite sheet image only.")


def listing(items, start=1):
    return "; ".join(f"({i + start}) {t}" for i, t in enumerate(items))


def write(name, text):
    with open(name + ".txt", "w", encoding="utf-8") as f:
        f.write(text + "\n")


def bld(name, items):
    write(name, f"{HEAD} Exactly 4 separate medieval fantasy village buildings arranged in a clean 4 columns x 1 row grid, each building fully visible "
                f"and centered in its cell, all four at a similar scale, wide empty gaps between them, none touching each other or the canvas edge, no overlap.\n\n"
                f"Row 1: {listing(items)}.\n\n{RULES_B}\n\n{TAIL}")


bld("bld-iso-game-a", [
    "town hall: the largest building, two-story timber-framed hall with a golden thatched roof, a small square clock tower in the middle of the roof and two hanging blue banners beside the double door",
    "trading post: wide wooden warehouse with a golden thatched roof, open front counter, stacked crates and sacks by the wall and a hanging sign showing a balance scale icon",
    "restaurant: cozy salmon-plaster house with a golden thatched roof, a round bread-loaf sign over the door, a stone chimney with a wisp of smoke and a small outdoor table with two stools",
    "inn: two-story salmon-plaster inn with a golden thatched roof, a hanging sign with a bed icon, a lantern by the door and flower boxes under the upper windows"])
bld("bld-iso-game-b", [
    "tavern: timber-framed tavern with a golden thatched roof, a hanging sign with a foaming beer mug icon, wooden barrels stacked by the door and warm yellow lit windows",
    "clinic: tidy white-and-salmon plaster house with a golden thatched roof, a hanging sign with a red cross icon, potted green herbs and a bench by the door",
    "blacksmith forge: blue-gray stone workshop with a golden thatched roof, a big stone chimney, a glowing orange furnace opening, an anvil and a weapon rack outside",
    "academy: blue-gray stone school building with a golden thatched roof and a small pointed bell spire, a hanging sign with an open book icon and arched windows"])
bld("bld-iso-game-c", [
    "training ground hall: open-sided wooden pavilion with a golden thatched roof on thick posts, a sand floor, a straw training dummy and a rack of wooden practice swords",
    "resurrection sanctuary: small pale stone chapel with a golden thatched roof, an arched doorway, a glowing pale-blue crystal on a pedestal in front and two candle lanterns",
    "hunter lodge: rustic log cabin with a golden thatched roof, deer antlers mounted over the door, a pile of firewood and a hanging hide drying by the wall",
    "quest board shelter: small open wooden shelter with a golden thatched canopy roof over a big notice board covered with pinned paper notices, a lantern on one post"])
bld("bld-iso-game-d", [
    "weapon enhancement workshop: blue-gray stone workshop with a golden thatched roof, a large grindstone wheel outside, glowing blue rune stones on the wall and a stone chimney",
    "dungeon entrance: dark rocky cave mouth built into a mossy stone mound, stone steps going down into darkness, two burning torches on wooden posts at the sides",
    "village plaza monument: a gray stone statue of an armored knight raising a sword on a tall square stone pedestal with two small blue banners, a ring of flowers around the base",
    "village gate: a wooden gate arch over a dirt path made of two thick log posts and a crossbeam with a small golden thatched roof, a hanging blue banner and short wooden palisade stubs on both sides"])

RULES_M = ("Art rules: warm saturated colors, dark brown outlines around every creature, chunky hard pixels with no anti-aliasing, lighting from the upper right, "
           "subtle pixel shading using dithering, expressive silhouettes that read clearly at small size. Every frame shows the SAME creature with the same colors, "
           "same size and same 2:1 isometric camera angle, facing to the RIGHT in every frame.")


def mon(name, who, frames, pal):
    write(name, f"{HEAD} Exactly 5 animation frames of ONE monster arranged in a clean 5 columns x 1 row grid, each frame fully visible and centered in its cell, "
                f"wide empty gaps between them, none touching each other or the canvas edge, no overlap. The monster is: {who}.\n\n"
                f"Frames left to right: {listing(frames)}.\n\n{RULES_M} Palette: {pal}, dark brown outline #0a0706.\n\n{TAIL}")


mon("mon-slime-iso-v2", "a round green slime with a glossy highlight and two small eyes (match the slime in the reference image)",
    ["idle: round and relaxed", "windup: squashed low and wide, about to spring", "attack: lunging forward to the right, body stretched long",
     "walk: mid-hop, slightly stretched upward with a small gap under it", "hurt: flinching backward to the left, eyes squeezed shut, body dented"],
    "slime green #6b8c3a and #9bbf55")
mon("mon-wolf-iso-v2", "a gray-brown wolf (match the wolf in the reference image)",
    ["idle: standing on four legs, alert", "windup: crouched low with head down and hackles raised, growling",
     "attack: leaping forward to the right with jaws open and claws out", "walk: trotting side view with one front leg and the opposite hind leg forward",
     "hurt: recoiling backward to the left with eyes squeezed shut and ears flat"],
    "wolf gray-brown #985750 and #b9a493")
mon("mon-golem-iso-v2", "a mossy stone golem with blocky limbs (match the golem in the reference image)",
    ["idle: standing heavy with arms hanging", "windup: rearing back with one fist raised behind its head", "attack: punching forward to the right with a huge stone fist",
     "walk: mid-stride side view with one heavy leg forward", "hurt: staggering backward to the left with cracks and small flying stone chips"],
    "golem stone #8d969c, moss green #6b8c3a")
mon("mon-treant-iso-v2", "the forest lord, a huge ancient treant boss with a bark body, glowing red eyes, a wide fanged mouth and large branching antler-like branches with green leaves on its head",
    ["idle: towering with long clawed root-arms hanging", "windup: roaring with both branch-arms raised", "attack: swinging a massive branch-arm forward to the right",
     "walk: mid-stride side view with one root-leg forward", "hurt: reeling backward to the left with bark splinters and falling leaves"],
    "bark brown #6a3f26 and #8e5a35, leaf green #5f8a35, glowing red #e04a2a")

ENV = ("Art rules: warm saturated colors, dark brown outlines, chunky hard pixels with no anti-aliasing, lighting from the upper right, subtle pixel shading using dithering. "
       "Palette anchors: tan #c49459, dark brown outline #0a0706, green #4a6e2a, cobble gray #8d969c, sand #d4a690, snow #e2e9e9.")


def env(name, kind, items, extra=""):
    write(name, f"{HEAD} Exactly 8 separate {kind} arranged in a clean 4 columns x 2 rows grid, each fully visible and centered in its cell, wide empty gaps between them, "
                f"none touching each other or the canvas edge, no overlap.{extra}\n\nRow 1: {listing(items[:4])}.\nRow 2: {listing(items[4:], 5)}.\n\n{ENV}\n\n{TAIL}")


env("terrain-iso-v2", "isometric ground tiles",
    ["dark green forest floor with fallen leaves and small ferns", "cool blue-green taiga moss ground with pine needles", "gray mountain rock ground with cracks and small stones",
     "warm desert sand with wind ripples", "light green meadow with tiny white and yellow flowers", "packed brown dirt road with wheel ruts",
     "light gray cut-stone plaza paving in a neat pattern", "pale blue cracked ice"],
    " Each tile is a flat 2:1 diamond-shaped isometric ground patch viewed from above at 30 degrees, seamless organic texture inside each tile, dark brown outline.")
env("props-iso-v2", "village props",
    ["market stall with a striped red-and-cream cloth awning and goods on the counter", "fruit stand cart with baskets of apples and oranges",
     "wooden hand cart with two wheels loaded with sacks", "wooden park bench", "tree stump with an iron anvil on top and a hammer",
     "wooden weapon rack holding a sword, an axe and a spear", "straw training dummy on a wooden post", "round straw archery target on a wooden easel with two arrows"])
env("nature-iso-v2", "nature sprites",
    ["snow-covered pine tree", "white birch tree with light green leaves", "green desert cactus with two arms", "large gray boulder",
     "mossy rock with small ferns", "pale blue ice crystal rocks", "tall layered gray cliff rock outcrop", "small cluster of colorful wildflowers"])
