# make_mon_front_prompts.py — 為每個狩獵地形產生 3 隻新魔物的「單張正面概念圖」提示詞
# 畫風段固定（照 pipeline/HANDOFF 的 ogre 試作），只換怪物描述，確保 21 張密度/風格一致。
# 輸出：output/l0veyou/prompts_keys/mon-front-<id>.txt
import pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "prompts_keys"
OUT.mkdir(exist_ok=True)

STYLE = (
    "Style: the pixel art style of Evil Hunter Tycoon (獵魔村物語) field monsters exactly as in the "
    "reference screenshot: chunky chibi pixel-art creatures drawn at the same scale as the heroes, "
    "muted and slightly desaturated colors (gray, olive green, dusty brown), simple faces with small "
    "dark eyes, a thin dark near-black outline, 3-tone flat pixel shading with a few hand-placed "
    "highlights, clean readable silhouette, a little menacing but still cute. Palette of at most 16 "
    "colors, crisp hard pixel edges, NO anti-aliasing, NO blur, NO gradients, NO dithering noise."
)

REF = (
    "Pixel art game character concept, ONE SINGLE monster, FRONT VIEW only, standing idle, centered "
    "on the canvas. The attached reference image is a real screenshot of the mobile game Evil Hunter "
    "Tycoon (獵魔村物語) showing its field monsters (the green-skinned ogre, the gray upright "
    "wolf-men, the skeleton): copy ONLY their art style, proportions and pixel density; do NOT copy them."
)

TAIL = (
    "ONE character only, drawn LARGE and filling about 80% of the canvas height from the top of the "
    "head to the feet, with fine small pixels, centered with plenty of empty space around it, nothing "
    "touching the canvas edge. Background: perfectly flat solid pure magenta #FF00FF everywhere, no "
    "ground, no cast shadow, no frame, no grid, no borders, no text, no numbers, no UI, no sprite "
    "sheet, no multiple poses. One single image."
)

# (id, 地形, gameSize, 描述, 正面看得到的重點, 剪影關鍵)
M = [
 # 向陽草原 meadow ─────────────────────────────────────────────
 ("sprout", "meadow", 22,
  "a small cute FLOWER SPROUT imp: a chubby round body made of pale green leaves (#7fae5c with shade #5c8544), "
  "a big half-open flower bud on top of the head (dusty pink petals #d4778a with cream trim #efe6d2), two "
  "leaf-shaped arms, a simple face on the front of the head with two small dark eyes (a tiny white highlight), "
  "a closed mouth with NO teeth, two short root feet, and a small crooked twig held in the right hand",
  "the flower bud head, both leaf arms, the small twig on the left side of the image",
  "round leaf ball with a flower hat"),
 ("ram", "meadow", 24,
  "a chubby WOOLLY RAM monster: a big round barrel body covered in cream wool clusters (#efe4cc with shade "
  "#d6c6a4), a dark gray face (#8d8f98) with two big curled spiral horns (#c9b489), small dark eyes, a "
  "closed mouth with NO teeth, four short thick legs with dark hooves, and a round tufted wool tail; he "
  "carries NO weapon",
  "the face straight on with both curled horns, the wooly chest, all four hooves on the same ground line",
  "wide woolly barrel with two curled horns"),
 ("mole", "meadow", 24,
  "a MOLE DIGGER, clearly a MOLE and NOT a pig and NOT a boar: a short plump underground creature with neckless "
  "body and soft velvety charcoal-brown fur (#4a4038 with lighter tufts #6b5c4c), a short blunt hairless "
  "muzzle that points slightly down (#c0a292), two very tiny round bead eyes almost hidden in the fur, no "
  "visible ears (only two tiny holes), a round pink nose pad at the very tip of the muzzle, a closed mouth "
  "with NO teeth, and two ENORMOUS wide shovel-shaped front paws with four long pale digging claws "
  "(#e8e0c0) that are as big as his head, short stubby back legs, a small bare pink tail, a plain dark cloth "
  "wrap around the middle of the body with a small leather strap, and a short wooden digging stick in the "
  "right paw (NO straw hat, NO apron, NO pig snout, NO pig ears)",
  "the low blunt muzzle and both tiny eyes straight on, the two huge claw paws held out in front, the small pink tail",
  "low neckless fur mound with two huge claw paws"),

 # 橡木密林 forest ─────────────────────────────────────────────
 ("shroom", "forest", 22,
  "a chubby MUSHROOM imp: a fat cream stem body (#e8dcc2 with shade #c9b795), a big domed red cap (#b0453a) "
  "with cream spots, two small dark eyes under the cap rim, a closed mouth with NO teeth, two stubby arms, "
  "short root feet, small moss patches on the belly, and NO weapon (he fights by puffing spores)",
  "the red spotted cap straight on, both stubby arms, both root feet on the same ground line",
  "mushroom cap on a fat stem"),
 ("boar", "forest", 26,
  "a stocky FOREST BOAR monster: a dark brown round body (#5b4632 with shade #40301f), a stiff bristly mane "
  "standing along the back (#7d6a4f), a big blunt snout, small dark eyes, a closed mouth with NO teeth and "
  "NO tusks, four short thick legs with dark hooves, a little tufted tail, and NO weapon (he charges head-first)",
  "the blunt snout and the bristly mane straight on, the wide chest, all four hooves on the same ground line",
  "low heavy wedge with a spiky mane ridge"),
 ("vine", "forest", 28,
  "a VINE BRUTE: an upright bundle of thick green vines (#4e8f3f with shade #36662c) wrapped around a short "
  "dark wooden post (#5b4632), two rope-like vine arms, one long vine whip trailing from the left hand down "
  "to the ground, a small worried face in the middle of the tangle with two dark eyes, a closed mouth with "
  "NO teeth, and knotted root feet",
  "the tangled vine face straight on, both vine arms, the long whip trailing on the right side of the image",
  "tall thin tangle with a trailing whip"),

 # 霜杉林地 taiga ─────────────────────────────────────────────
 ("wolfman", "taiga", 29,
  "an upright GRAY WOLF-MAN: a tall lean humanoid about 1.2 times the height of the heroes, short thick furry "
  "legs, narrow hunched shoulders, a big wolf head with two triangular cat-like ears pointing up and a long "
  "muzzle, gray fur (#6f7378) in 3 flat shades with a lighter gray chest ruff (#9aa0a6) and a cream muzzle "
  "(#ddd6c4), small beady dark eyes with a tiny amber glint (#e2b84c), a dark nose, a closed grumpy mouth "
  "with NO teeth and NO fangs, a tattered dark leather harness (#43403a) across the chest with a fur trim, "
  "ragged cloth wraps on the forearms and shins, and a BIG crude iron war axe as tall as his torso (heavy "
  "grey iron head #7f8fa6 with a chipped edge, thick wooden handle #6b4a2f) held in his right hand",
  "his face straight on, both ears up, the harness and chest ruff, and the big axe head clearly visible on the left side of the image",
  "lean tall wolf with a big axe"),
 ("moss", "taiga", 31,
  "a MOSS TROLL: a broad hulking troll with gray-green mossy hide (#6f7f63 with pale lichen patches #9aa87f), "
  "a heavy brow ridge, two tiny dark eyes, a wide flat nose, a closed mouth with NO teeth, a ragged hide "
  "loincloth, thick long arms with big knuckles, short thick legs, a few tiny mushrooms growing on his "
  "shoulders, and a big gnarled wooden club in the right hand",
  "his heavy-browed face straight on, both long arms, the mushrooms on the shoulders, the club on the left side of the image",
  "broad hunched troll with a club"),
 ("snowhare", "taiga", 22,
  "a CUTE SNOW HARE monster: a round ball of white fur (#f2f5f4 with pale blue shade #bcd2da), two long "
  "upright ears with pale blue inner lining, tiny black dot eyes with a white highlight, a small pink nose, "
  "a closed mouth with NO teeth, two small front paws held up, two big back feet, a round puff tail, and NO weapon",
  "the face straight on between the two long ears, both raised front paws, both big feet on the same ground line",
  "round ball with two tall ears"),

 # 白霜雪原 snow ─────────────────────────────────────────────
 ("yeti", "snow", 33,
  "a hulking SHAGGY FROST YETI: an upright hunched beast about 1.4 times the height of the heroes, very broad "
  "chest and shoulders, a small head sunk between the shoulders with a heavy pale brow, two tiny round dark "
  "eyes, a wide flat nose, a closed grumpy mouth with NO teeth and NO tusks, long shaggy ice-blue-white FUR "
  "(#cfe0e6 with shade #93b7c4) covering the ENTIRE body in flat pointed tufts including the chest and belly "
  "(the belly is a slightly warmer cream fur patch #eef3f4, it is FUR, not bare skin, no muscles, no "
  "nipples, no abs), thick arms reaching down to the knees with big dark-gray wrapped fists (#525049), short "
  "thick legs with fur boots, a braided hide rope belt with two small bone charms, and a big chunk of pale "
  "blue ice (#a8dce8 with highlight #e8f7fb) carried in the right hand as a club",
  "his face straight on, the fully furred chest and belly, both huge shoulders, the bone charms, the ice chunk on the left side of the image",
  "huge shaggy mound with an ice club"),
 ("snowman", "snow", 26,
  "a SNOW SENTINEL: a chunky three-ball snowman (#e8f1f4 with shade #b8cdd6) with a lumpy hand-packed look, "
  "two small dark coal eyes, a short carrot nose (#d98a4a), a closed mouth made of three small dark pebbles "
  "with NO teeth, two bare twig arms, a short blue-gray scarf (#7d93a8) with small icicles hanging from its "
  "hem, stubby snow feet, and a short jagged icicle spear in the right twig hand",
  "the coal eyes and carrot nose straight on, the scarf, both twig arms, the icicle spear on the left side of the image",
  "three stacked balls with twig arms"),
 ("icebeetle", "snow", 23,
  "an ICE BEETLE: a wide low beetle with a thick pale-blue ice shell (#a8dce8 with highlight #eafaff) made of "
  "flat faceted plates, six short stubby legs, two small dark eyes under the shell rim, two short blunt ice "
  "mandibles (blunt, NOT sharp teeth), and a frosty white belly; NO weapon",
  "the flat ice shell and the two eyes straight on, all six short legs on the same ground line, the blunt mandibles",
  "wide flat faceted shell close to the ground"),

 # 鐵脊山麓 mountain ──────────────────────────────────────────
 ("kobold", "mountain", 23,
  "a MINER KOBOLD: a short upright goblin-like creature with dusty gray-green skin (#7d8a6f with shade "
  "#5d6a53), big pointed ears, small dark eyes, a wide flat nose, a closed mouth with NO teeth, a battered "
  "leather miner cap with a small candle stub on the front, a patched leather apron over a torn tunic, thick "
  "cloth-wrapped hands, and a small iron pickaxe in the right hand (head #7f8fa6, handle #6b4a2f)",
  "the pointed ears and candle cap straight on, the patched apron, the pickaxe on the left side of the image",
  "small squat miner with a candle hat"),
 ("boulder", "mountain", 31,
  "a BOULDER BRUTE: an upright mass of stacked gray-brown rock (#8f8a80 with shade #6c665e and flat mossy "
  "patches #4e8f3f), a wide flat rock head with two small glowing amber eyes in dark sockets, a closed crack "
  "of a mouth with NO teeth, huge rock arms ending in blocky fists, short stubby rock legs, small pebbles "
  "floating loosely around the shoulders, and NO weapon (it hurls a chunk of rock)",
  "the flat rock head and both glowing eyes straight on, the blocky fists, the moss patches",
  "wide blocky stack of rocks"),
 ("goat", "mountain", 26,
  "an IRON-HORN GOAT: a sturdy gray-white mountain goat (#d8d2c6 with shade #a8a193), two big ridged "
  "iron-gray horns (#8a8f98) curling backward, small dark eyes, a shaggy beard under the chin, a closed "
  "mouth with NO teeth, four short strong legs with dark hooves, and NO weapon (he headbutts)",
  "the face straight on framed by both horns, the shaggy beard, all four hooves on the same ground line",
  "compact goat with heavy curled horns"),

 # 赤金沙地 desert ────────────────────────────────────────────
 ("mummy", "desert", 28,
  "an upright DUSTY MUMMY: a bandaged humanoid about the height of the heroes, thin but rounded chibi "
  "proportions, a big wrapped head, ONE narrow horizontal eye slit showing a single small amber eye "
  "(#e2b84c) in shadow, an old gold ankh amulet (#e2b84c) on the chest, and BANDAGES drawn as many "
  "distinct overlapping strips wrapping diagonally around the head, arms, torso and legs (#d7c7a3 strips "
  "with darker seam shadow #a8946e, so every wrap reads as a separate band with a visible edge), loose "
  "bandage tails hanging from both forearms and the waist, a tattered dark cloth skirt (#5f5c4f) with a "
  "frayed hem, wrapped feet flat on the ground, and a SHORT WIDE curved khopesh sword (thick crescent "
  "blade, #9a8266 with a pale edge #c9c2b0, wrapped hilt #6b4a2f) in the right hand; no exposed flesh, "
  "no gore, no bones, cute grumpy face with NO teeth",
  "the wrapped face with the single amber eye slit straight on, the ankh amulet, several hanging bandage tails, the wide khopesh on the left side of the image",
  "thin wrapped figure with swooping bandage tails"),
 ("cactus", "desert", 24,
  "a CACTUS BRUTE: a chubby upright barrel cactus (#6f9e57 with shade #4e7a3c), a ridged body covered in "
  "small pale spine clusters (#e8e0c0), two short stubby arm-branches, three round pink blossoms (#d4778a) "
  "on top of the head, two small dark eyes, a closed mouth with NO teeth, and short root feet; NO weapon "
  "(he bashes with his spiny arms)",
  "the eyes and blossoms straight on, the spiny arms, the root feet on the same ground line",
  "ridged barrel with two stub arms and a flower crown"),
 ("scorpion", "desert", 26,
  "a SAND SCORPION with a clean readable silhouette: a compact sandy-tan body (#cfa96b with shade #a8834c) "
  "of big chunky armor plates, a rounded head plate with two small dark eyes and two tiny pale dots above them, "
  "TWO BLOCKY ROUNDED PINCERS like heavy mittens held forward at chest height (thick, short, chunky, not thin "
  "crab claws), four short thick legs visible, and ONE thick segmented tail rising straight up behind the "
  "shoulders then hooking forward over the head like a question mark, ending in a short blunt pale stinger "
  "(#e8e0c0) that clearly points at the viewer's left; NO weapon",
  "the head plate and both eyes straight on, both chunky pincers held forward, the tail hooking over the head, all legs on the same ground line",
  "compact armored body with two mitten pincers and a hooked tail"),

 # 白樺花原 birch ─────────────────────────────────────────────
 ("floraspirit", "birch", 22,
  "a FLOWER FAIRY: a small slender sprite standing on two tiny leaf-skirt legs, a body of pale green stems "
  "(#8fbc6f with shade #6a9550), a big flower crown head with dusty pink petals (#e8c3cf) around a gold "
  "center (#e2b84c), two folded leaf wings on the back, tiny dark eyes, a closed mouth with NO teeth, and a "
  "thin twig wand in the right hand",
  "the flower crown and both eyes straight on, the leaf wings peeking behind the shoulders, the twig wand on the left side of the image",
  "small flower crown on slender stems"),
 ("birchling", "birch", 27,
  "a BIRCH SAPLING TREANT: a slim upright white birch trunk body (#e8e4da with black eye-mark patches "
  "#43403a), a green leafy crown (#8fbc6f) on top, a small friendly face on the trunk with two dark eyes and "
  "a closed mouth with NO teeth, two thin branch arms ending in small leaf tufts, and short root feet",
  "the trunk face straight on, the leafy crown, both thin branch arms, both root feet on the same ground line",
  "slim white trunk with a leafy crown"),
 ("stag", "birch", 28,
  "a CHUNKY BIRCH STAG, drawn with the same chunky chibi proportions, thick short limbs and heavy dark "
  "outline as the reference monsters (NOT a realistic slender deer): a barrel-chested body with a big round "
  "chest and short thick legs, a pale tan coat (#c9ad86) with a cream chest patch (#efe6d2), a big round head "
  "with a broad muzzle, small dark eyes, a closed mouth with NO teeth, two big wide branching pale antlers "
  "(#d8cfbc) as thick as his own arm, short stubby tail, four short thick legs with big dark hooves, and NO "
  "weapon (he charges with his antlers)",
  "the broad muzzle and both eyes straight on, both thick antlers framing the head, the cream chest patch, all four thick hooves on the same ground line",
  "chunky barrel deer with big thick antlers"),
]

tpl = """{ref}

The monster: {desc}.

He faces DIRECTLY TOWARD THE CAMERA: we see {front}.

{style}

{tail}
"""

n = 0
for mid, region, size, desc, front, keyshape in M:
    p = OUT / f"mon-front-{mid}.txt"
    p.write_text(tpl.format(ref=REF, desc=desc, front=front, style=STYLE, tail=TAIL), encoding="utf-8")
    n += 1
print(n, "front prompts ->", OUT)
print("regions:", len({m[1] for m in M}), {r: sum(1 for m in M if m[1] == r) for r in dict.fromkeys(m[1] for m in M)})
