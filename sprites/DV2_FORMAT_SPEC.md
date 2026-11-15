# DV2-format hero art spec (mistvale original art)

Status: **authoritative art spec for hero characters** (the earlier SPRITE_VISUAL_BIBLE is deprecated for heroes; `sprites/` docs are the art authority).
Engine and data schema: [docs/PAPERDOLL.md](../docs/PAPERDOLL.md). Layout source of truth in code: `pipeline/scripts/dv2fmt/dv2fmt.py` (change both together).

## 0. What this is, and the one hard rule

Mistvale heroes are drawn as **layered paperdolls in the sheet format of the DV2 paperdoll kit**: separate BODY, HAND, HEAD, HAT, WEAPON and EFFECT sheets on a fixed grid, combined at runtime. We copy that **format** (grid sizes, anchors, which layer draws what, how directions and weapons work). **We never copy its content**:

- No Kairosoft art, data files (images, `.seb`, TSV, `data.js`), palettes, characters, names or drawn poses enter the repo, the prompts, or the build. Do not reference Kairosoft games or their characters in AI prompts. Every design below is mistvale's own.
- The action table (`pipeline/scripts/dv2fmt/actions.json`): the **motion structure follows the DV2 kit** — slot count and timing (`af`), which of our body cells each slot shows, the on-screen weapon direction / flip / visibility, per-direction draw order, effect slots and their placement, head expression, loop flags. Those numbers are derived by `tools/dv2-motion-derive.mjs`, a dev-only tool that reads a local copy of the kit at run time and writes only the derived numbers into `output/dv2fmt/work/actions_base.json`. **Art and assets are original**, and so are the grips (`wh`/`oh`, measured on our art) and neck points (`head`).

## 1. Pipeline

```
python pipeline/scripts/dv2fmt/make_templates.py            # guides -> output/dv2fmt/templates/<sheet>_1x.png / _x8.png
# art: paint each sheet on its _x8 template (or draw 1x directly), one image per class sheet / item
python pipeline/scripts/dv2fmt/import_sheet.py body paladin my_paladin_body.png      # -> assets/paperdoll-dv2/src/paladin_body.png
python pipeline/scripts/dv2fmt/import_sheet.py weapon sword my_sword.png             # -> src/weapon_sword.png
python pipeline/scripts/dv2fmt/build_pack.py                 # -> assets/paperdoll-dv2/paperdoll.json + atlas_*.png
node test-paperdoll.mjs && npm run build                     # the game uses the pack by default
```

- `make_templates.py --placeholder` re-cuts the old procedural placeholder into this grid, pushes it through the importer and leaves a working pack, so the game runs before real art exists. `assets/paperdoll-dv2/src/sources.json` records where each source sheet came from; the pack's `meta.placeholder` lists sheets that are still placeholder.
- Templates: grey silhouettes = the placeholder pose (match its pose, not its look), red marks = foot anchor, blue = neck/head anchor, red circle = weapon grip. `_x8` versions carry cell labels.

## 2. Global art rules

| Rule | Value |
|---|---|
| Resolution | **1 sheet pixel = 1 art pixel**. Deliver either the exact 1x sheet or an 8x image laid out on the `_x8` template (the importer downsamples 8x8 blocks). No other scale. |
| Proportions | big-head chibi, about **2 heads tall**: head about 12–13 px, body (neck to sole) about 13–14 px, total about 26–27 px standing, inside a 30x30 cell. All classes the same height (hats may add up to 4 px). |
| Outline | 1 px, colour `#0e0c14`, around every separate part (head, torso, each limb, weapon). No outline inside a part. |
| Shading | 2–3 tones per material, light from top-left. No anti-aliasing, no gradients, no semi-transparent pixels (effects excepted). |
| Palette | the class palette in §8 (≤16 colours incl. outline). The importer snaps every pixel to it. Items use the shared item palette. |
| Background | transparent (1x) or one flat colour (8x AI output); nothing else outside the figure. |
| Facing | side-view art faces **screen right**; left-facing directions are produced by mirroring. Keep left/right-asymmetric details (belt buckles, a quiver) consistent with that. |
| Fit | nothing may touch a cell's top, left or right border (the importer rejects it); feet touch the bottom-centre anchor. |

## 3. Sheets

| Sheet | File in `assets/paperdoll-dv2/src/` | Size | Cell | Anchor (seb trans) | Frame = |
|---|---|---|---|---|---|
| BODY | `<class>_body.png` | 300x300 | 10x10 cells of 30x30 | foot = cell (15,30) bottom-centre → (-15,-30) | action slot (pose cell from the action table) |
| HAND | `<class>_hand.png` | 300x300 | same grid as BODY | same | same cell as BODY |
| ARMOR | `armor_<leather/plate/mantle>.png` | 300x300 | same grid as BODY | same | same cell as BODY |
| CAPE | `cape_<name>.png` (e.g. `cape_cloak.png`) | 300x300 | same grid as BODY | same | same cell as BODY |
| HEAD | `<class>_head.png` | 140x40 | 7x2 cells of 20x20 | neck = cell (10,20) bottom-centre → (-10,-20) | direction (§4) × expression column |
| HAT | `hat_<name>.png` (e.g. `hat_helm.png`) | 20x60 | 1x3 cells of 20x20 | same as HEAD | direction (§4) |
| WEAPON | `weapon_<type>.png`, `weapon_<type>_fine.png` | 80x40 | 2 cells of 40x40 | the **grip pixel** (§6); rotates around it | column = sebF; mirrored for left |
| EFFECT | `effect_slash.png` | 120x60 | 4x2 cells of 30x30 | cell centre (15,15) | column = direction (up, right, down, left), row = sebF |

**BODY** draws the whole figure except the head: legs, torso, both arms and both hands, in the pose of the cell. Hair that falls below the head (a ponytail, a cape collar) belongs here.
**HAND** is an overlay drawn *after* the weapon: only the fist that grips the weapon (about 3x3 px incl. outline) at the cell's weapon-hand point (table in §5), so the weapon handle sits *inside* the hand. Everything else in HAND is transparent; cells where the hand is empty may be left empty.
**ARMOR** is worn gear drawn over BODY on the same cells (chest piece, shoulder plates, mantle). It must cover only torso/shoulders and stay inside the body silhouette ±1 px.
**CAPE** is mistvale's own back layer — the DV2 kit has no cape, our `layers` table always had one. It is drawn *before* BODY on the same cells, so only what escapes the body silhouette is ever visible: a 1–2 px band down each side, the shoulder line and a hem trailing past the boots. Paint it as a cloak shape sitting behind the figure (inner shading is wasted, it will be covered), keep its own 1 px outline, and never widen the figure by more than 4 px per side.
**HEAD** row 0 = back of the head (for up / up-left / up-right), row 1 = face, a 3/4 front view looking toward screen-right (for right / down-right / down; mirrored for left / down-left). Columns = expressions: `0 normal`, `1 blink`, `2 hurt` (squint, gritted), `3 shout` (attack), `4 happy` (victory), `5 ko` (eyes shut, knocked down), `6 spare` (leave empty). Row 0 may repeat the same back-of-head in every column. Class headwear that is part of the class look (sorcerer's pointed hat, priest's hood, assassin's hood) is drawn **in the HEAD sheet**; only equipment helmets go in HAT.
**HAT** rows: 0 back, 1 side (facing right), 2 front; drawn over the head with the same neck anchor. It must fit over every class's head (cover hair, leave the face).

## 4. Directions (4 → 3 drawn views)

Since 2026-11-13 the game is **4-directional** (docs/DV2-ADOPTION-PLAN.md Phase 2): input, movement, AI facing and animation only use up / right / down / left (screen axes), 1:1 with DV2. This format draws **3 views** and mirrors one of them. There are no diagonal cells and none are planned (rows 7–9 of the BODY grid stay reserved and transparent).

| Direction | BODY/HAND/ARMOR band | mirrored | HEAD row | HAT row | DV2 motion numbers from |
|---|---|---|---|---|---|
| up | back (rows 0–1) | no | 0 back | 0 back | d0 (back, up-right) |
| right | side (rows 2–3) | no | 1 face | 1 side | d1 (front, down-right) |
| down | front (rows 4–5) | no | 1 face | 2 front | d1 (front, down-right) |
| left | side | yes | 1 face (mirrored) | 1 side (mirrored) | **d2** (front, down-left) |

Mirroring flips a cell around its vertical centre line, so anchors stay put. Weapon direction, flip, visibility and draw order are stored per direction in the action table (screen space, derived from the DV2 kit by `tools/dv2-motion-derive.mjs` with `DV2_DIR = [0, 1, 1, 2]`), not derived by mirroring: the left direction takes DV2 d2's numbers even though its art is the mirrored side view.

Old saves or callers that still pass a direction 0–7 are migrated by the engine (`src/paperdoll.js` `migrateDir`): 0→up, 1→right, 2→down, 3→left, 4→up, 5→down, 6→down, 7→left.

## 5. BODY grid: which cell is which pose

Each view has a 2-row band (back = rows 0–1, side = rows 2–3, front = rows 4–5). Column/row below are **within the band**; the table after it lists absolute cells with the anchor points the action table expects.

| col,row | pose | what to draw |
|---|---|---|
| 0–3,0 | `walk0..3` | walk cycle: contact (front foot forward), passing (body 1 px up), contact (other foot), passing |
| 4,0 / 5,0 | `stand0` / `stand1` | idle, weapon held low at the side; stand1 = breath (torso 1 px lower) |
| 6,0 | `windup` | weapon raised back/up, weight on the back foot (melee wind-up; staff raise) |
| 7,0 | `strike0` | mid-swing, arm forward-up |
| 8,0 | `strike1` | impact: arm extended forward-down, lunge (front foot forward) |
| 9,0 | `hurt` | recoil: torso leaning back, head tipped back |
| 0,1 / 1,1 | `cast0` / `cast1` | both arms raised overhead (cast0), weapon arm pushed higher (cast1 = release) |
| 2,1 / 3,1 | `aim0` / `aim1` | bow: weapon arm straight forward holding the bow; aim0 = nocking (other hand at the bow), aim1 = drawn (other hand pulled back to the chin) |
| 4,1 | `kneel` | knocked down: on one knee, head low |
| 5,1 / 6,1 | `victory0` / `victory1` | cheer: weapon raised overhead; victory1 = small hop (body 2 px up), arm a little lower |
| 7,1 | `thrust` | staff/dagger point: weapon arm straight forward at chest height |
| 8–9,0–1 | reserved | leave transparent |
| absolute 0,6 | `lying` | lying on the ground on its back, side view, head toward screen-left, feet right; used by every direction (mirrored for left-facing ones). **The BODY cell also contains the KO head** (about 13 px, the `ko` face kept upright so it stays readable, drawn at the left end) because the HEAD layer is not drawn in the lying slots (`build_pack.py` drops `head`/`helmet` from the draw order for `lying`). So no head/helmet is drawn while lying; like the DV2 down pose, no weapon is drawn while lying (show 0) |
| everything else in rows 6–9 | reserved | leave transparent (unused; the game is 4-directional) |

**Anchor points per cell** (pixel coordinates inside the 30x30 cell; foot = (15,30)). The BODY art must put the **neck** where the head will sit, the **weapon hand** where the weapon grip goes, and the **off hand** where a shield is held. These come from `actions.json` (regenerate this table if you edit it):

| view | cell (col,row) | pose | neck (head anchor) | weapon hand (grip) | off hand (shield) |
|---|---|---|---|---|---|
| back | (0,0) | walk0 | (15,14) | (20,20) | (10,21) |
| back | (1,0) | walk1 | (15,13) | (20,19) | (10,21) |
| back | (2,0) | walk2 | (15,14) | (20,20) | (10,21) |
| back | (3,0) | walk3 | (15,13) | (20,21) | (10,20) |
| back | (4,0) | stand0 | (15,14) | (20,20) | (10,21) |
| back | (5,0) | stand1 | (15,15) | (20,21) | (10,22) |
| back | (6,0) | windup | (15,14) | (21,12) | (10,20) |
| back | (7,0) | strike0 | (15,13) | (18,10) | (10,20) |
| back | (8,0) | strike1 | (15,15) | (16,13) | (10,20) |
| back | (9,0) | hurt | (15,15) | (20,20) | (10,20) |
| back | (0,1) | cast0 | (15,13) | (18,10) | (12,10) |
| back | (1,1) | cast1 | (15,13) | (18,9) | (12,10) |
| back | (2,1) | aim0 | (15,14) | (17,17) | (14,17) |
| back | (3,1) | aim1 | (15,14) | (17,17) | (14,18) |
| back | (4,1) | kneel | (15,16) | (20,23) | (10,24) |
| back | (5,1) | victory0 | (15,13) | (18,10) | (12,10) |
| back | (6,1) | victory1 | (15,13) | (19,12) | (11,12) |
| back | (7,1) | thrust | (15,15) | (18,13) | (10,20) |
| side | (0,2) | walk0 | (15,14) | (16,20) | (14,21) |
| side | (1,2) | walk1 | (15,13) | (18,20) | (14,20) |
| side | (2,2) | walk2 | (15,14) | (19,20) | (12,21) |
| side | (3,2) | walk3 | (15,13) | (18,20) | (14,20) |
| side | (4,2) | stand0 | (15,14) | (18,20) | (13,21) |
| side | (5,2) | stand1 | (15,15) | (18,21) | (13,22) |
| side | (6,2) | windup | (14,14) | (13,12) | (16,20) |
| side | (7,2) | strike0 | (15,14) | (17,12) | (16,20) |
| side | (8,2) | strike1 | (16,15) | (21,18) | (14,20) |
| side | (9,2) | hurt | (14,15) | (15,20) | (12,19) |
| side | (0,3) | cast0 | (15,13) | (16,10) | (16,12) |
| side | (1,3) | cast1 | (15,13) | (17,10) | (16,11) |
| side | (2,3) | aim0 | (15,14) | (20,17) | (18,17) |
| side | (3,3) | aim1 | (15,14) | (20,17) | (14,17) |
| side | (4,3) | kneel | (16,16) | (18,23) | (13,24) |
| side | (5,3) | victory0 | (15,13) | (16,10) | (16,11) |
| side | (6,3) | victory1 | (15,13) | (17,12) | (16,13) |
| side | (7,3) | thrust | (16,15) | (21,16) | (14,20) |
| front | (0,4) | walk0 | (15,14) | (10,20) | (20,21) |
| front | (1,4) | walk1 | (15,13) | (10,19) | (20,21) |
| front | (2,4) | walk2 | (15,14) | (10,20) | (20,21) |
| front | (3,4) | walk3 | (15,13) | (10,21) | (20,20) |
| front | (4,4) | stand0 | (15,14) | (10,20) | (20,21) |
| front | (5,4) | stand1 | (15,15) | (10,21) | (20,22) |
| front | (6,4) | windup | (15,14) | (9,12) | (20,20) |
| front | (7,4) | strike0 | (15,13) | (12,10) | (20,20) |
| front | (8,4) | strike1 | (15,15) | (14,19) | (20,20) |
| front | (9,4) | hurt | (15,15) | (10,20) | (20,20) |
| front | (0,5) | cast0 | (15,13) | (12,10) | (18,10) |
| front | (1,5) | cast1 | (15,13) | (12,9) | (18,10) |
| front | (2,5) | aim0 | (15,14) | (13,17) | (16,17) |
| front | (3,5) | aim1 | (15,14) | (13,17) | (16,18) |
| front | (4,5) | kneel | (15,16) | (10,23) | (20,24) |
| front | (5,5) | victory0 | (15,13) | (12,10) | (18,10) |
| front | (6,5) | victory1 | (15,13) | (11,12) | (19,12) |
| front | (7,5) | thrust | (15,15) | (12,13) | (20,20) |
| side (all) | (0,6) | lying | (5,31) | (20,28) | (11,29) |

(`neck` = where the bottom-centre of the HEAD cell is placed; the head is drawn there with its own 20x20 cell. Leave the neck/shoulders so a 12–13 px head sits naturally on top.)

## 6. WEAPON sprites

One sheet per weapon: 80x40 = 2 cells of 40x40. Draw the weapon **pointing straight up** (tip at the top) in column 0; the engine rotates it around the grip pixel. Column 1 is the alternate frame (`sebF 1`): only bow (drawn string + arrow) and shield (edge-on, for the side view) use it; for other weapons copy column 0 or leave it empty.

| Type | Grip pixel (x,y) in each 40x40 cell | Length | Design notes |
|---|---|---|---|
| sword (paladin) | (20,28) | blade tip at y≈6 | straight one-handed blade, cross-guard at the grip top, pommel 2 px below the grip |
| axe (berserker) | (20,28) | head at y≈4–14 | long haft, **double-bladed** head, the heaviest weapon (wider than the character's torso) |
| dagger (assassin) | (20,28) | tip at y≈16 | short blade, small guard; reads as small next to the body |
| staff (sorcerer) | (20,28) | top at y≈2 | wooden shaft, a round crystal orb on top (lavender) |
| holystaff (priest) | (20,28) | top at y≈2 | gold shaft, an open ring/halo on top |
| bow (archer) | (20,20) = middle of the grip | ±14 px tall | recurve bow, belly toward screen-right, string on the left; column 1 = string pulled to the left with a nocked arrow pointing right |
| shield (paladin off hand) | (20,20) = centre | ~12 px round | column 0 = face-on round shield (slate face, gold rim, gold cross); column 1 = edge-on (narrow ellipse) for the side view |

- The grip x **must be 20** (the cell centre) so the mirrored frame keeps the grip in place.
- `_fine` variants (`weapon_sword_fine.png` …) are the upgraded look: same silhouette, gold fittings / brighter blade.
- The fist that holds the grip is drawn in HAND, not on the weapon.

## 7. EFFECT, importer checks, provenance

- `effect_slash.png`: a crescent slash, 4 directions (columns up, right, down, left; the arc bulges toward the facing direction), row 0 bright (white core, gold rim), row 1 fading (thinner). Centred on the cell centre; the action table offsets it in front of the hero.
- `import_sheet.py` checks every used cell: **EDGE** (art touches the top/left/right border), **EMPTY** (a used cell has no art; HAND cells and the spare head column may be empty), **RESERVED** (art in a reserved cell), **FLOAT** (a standing BODY pose whose lowest pixel is > 1 px above the foot line). EDGE/EMPTY fail the import unless `--allow-edge`. Reports: `output/dv2fmt/reports/<file>.txt`.

## 8. Classes (original mistvale designs) and palettes

Palettes are in `pipeline/scripts/dv2fmt/palettes.json` (built from the current hero palettes, ≤16 colours incl. outline); the importer snaps to them. Each class reads instantly at 30 px by **silhouette + one signature colour**.

| Class | Look (all original) | Signature | Weapon / off hand | Palette (index 0 = outline) |
|---|---|---|---|---|
| archer | lean ranger, short tousled hair under a cloth headband, sleeveless tunic, leather bracer on the bow arm, a quiver strap across the chest, soft boots | teal tunic | bow | `#0e0c14` `#17494a` `#4fb3a9` `#7fd6cd` `#2b7d78` `#a8763e` `#83562a` `#5e3c1c` `#3e2610` `#5f6b3e` `#48512e` `#333a20` `#f2ecd8` `#f0c8a0` `#d8a070` `#a86a48` |
| sorcerer | small robed caster, tall pointed hat with a gold band (part of HEAD), long robe hiding the feet, wide sleeves | violet robe + hat | staff with crystal orb | `#0e0c14` `#3d2a68` `#b9a2ea` `#8f6fd0` `#6547a0` `#241634` `#efe6ff` `#d9ccff` `#b3a2e0` `#8a78b8` `#f0d68a` `#d8b85c` `#a88c38` `#f0c8a0` `#d8a070` `#a86a48` |
| priest | calm healer, white hood with a gold edge (HEAD), long white robe, red sash, gold medallion | white + red sash | holystaff (gold, halo ring) | `#0e0c14` `#8e8470` `#b3434a` `#f8f2e6` `#e0d8c8` `#bcb29e` `#37301f` `#d4676c` `#7c2b31` `#4e171c` `#f0d68a` `#d8b85c` `#a88c38` `#f0c8a0` `#d8a070` `#a86a48` |
| paladin | sturdy knight, short fair hair (helmet comes from armor = HAT `helm`), slate tunic under plate, gold trim | slate + gold | sword + round shield | `#0e0c14` `#2c3442` `#48525f` `#5f6d80` `#74839a` `#a3b0c2` `#cfd8e4` `#f2f6fb` `#e0c266` `#f6df9a` `#8a6f22` `#e8c49c` `#a97c54` `#6a4a2a` `#c9a24a` `#d8a888` (cool silver ramp `#74839a`..`#f2f6fb`, tunic ramp `#2c3442`..`#5f6d80`) |
| berserker | broad, bare-armed brawler, spiky brown hair, fur-trimmed vest, heavy belt | bare arms + fur collar | double-bladed axe | `#0e0c14` `#2e1a0e` `#b6bfcc` `#e8e0cc` `#b9ab8e` `#8a7a58` `#6d5334` `#4f341e` `#8a6440` `#6d4a2c` `#8b96a6` `#5f6a7c` `#f0c8a0` `#d8a070` `#a86a48` `#8a5a38` |
| assassin | slim, dark hooded cloak (HEAD), face mask, light grey scarf, close-fitting dark clothes | near-black + pale scarf | dagger | `#0e0c14` `#08090d` `#181c22` `#8a7aa8` `#a8b0c6` `#7a8298` `#525a72` `#333a4e` `#2f3543` `#5a6172` `#434a5a` `#4a505e` `#8a7a64` `#e8f0f8` `#f4d6ae` `#dcb184` |
| darkknight | (legacy id, not recruitable today) black plate with red trim, horned helm look | black + red | sword + round shield | `#0e0c14` `#000000` `#0f0606` `#13110e` `#231311` `#24231e` `#33312c` `#6c4744` `#6f3634` `#712625` `#761314` `#957b79` `#ac4447` `#bc1515` `#d7696e` `#f53433` |

Armor sheets (`armor_*`): `leather` (brown vest + shoulder pads; archer, berserker, assassin), `plate` (silver chest + pauldrons + gold trim; paladin), `mantle` (dark red shoulder mantle with gold edge; sorcerer, priest). Helmet: `hat_helm.png` (steel dome, gold rim, nose guard) — worn by paladin when armor is equipped. Which class gets which is `CLASS_KIT` in `src/paperdoll.js`.

## 9. Actions (how cells are used at runtime)

`pipeline/scripts/dv2fmt/actions.json` maps each mistvale action to per-slot cells and numbers (mistvale's own; the timing contract is `sprites/ANIMATION_SPEC.md` 出招計時合約 — the game maps its combat timing onto `releaseSlot` / `impactSlot`, never the other way round). `af` = cumulative end tick per slot, 20 ticks/s.

| action | af (ticks) | release / impact slot | cells per slot (side view; back/front use the same pose names) |
|---|---|---|---|
| idle | [12, 24] | None / None | stand0, stand1 |
| walk | [4, 8, 12, 16] | None / None | walk0, walk1, walk2, walk3 |
| attack | [3, 6, 9, 15] | 1 / 2 | windup, strike0, strike1, strike1 |
| attack.bow | [5, 10, 13, 18] | 2 / None | aim0, aim1, aim0, stand0 |
| attack.staff | [4, 8, 11, 16] | 2 / None | windup, thrust, thrust, stand0 |
| skill | [5, 10, 14, 20] | 2 / None | stand0, cast0, cast1, cast1 |
| hurt | [4, 10] | None / None | hurt, hurt |
| death | [3, 6, 9, 12, 20] | None / None | kneel, kneel, lying, lying, lying |
| victory | [5, 10, 15, 20] | None / None | victory0, victory1, victory0, victory1 |

Per slot the table also gives the neck offset, weapon grip (`wh`), off-hand (`oh`), weapon rotation (`deg`, clockwise), weapon column (`sebF`) and effect frame (`fx`). Head expression per action: idle/walk/bow normal, attack/staff/skill shout, hurt hurt, death ko, victory happy. Draw order per view: back = weapon, shield, body, armor, hand, head, helmet, effect; side/front = body, armor, shield, head, helmet, weapon, hand, effect (wind-up slot of a melee attack puts the weapon first, behind the body).

**Riding (2026-11-14, docs/PAPERDOLL.md §20):** `ride_sit`, `ride_stand`, `ride_charge_sit`, `ride_charge_stand`, `ride_charge2` reuse existing cells (sit = `kneel`, stand = `stand0`; the mount hides the legs). No riding cells need to be drawn; a future dedicated sitting pose would go in the reserved rows and only needs `tools/dv2-motion-derive.mjs` `CELLS` changed.

## 10. Delivery checklist for one class

1. `<class>_body.png` (55 cells: 18 poses × 3 views + `lying`), 2. `<class>_hand.png`, 3. `<class>_head.png` (2 rows × 6 expressions), then shared items once: `weapon_*.png` (+ `_fine`), `armor_*.png`, `hat_helm.png`, `effect_slash.png`.
Run the importer per file (fix every EDGE/EMPTY), then `build_pack.py`, `node test-paperdoll.mjs`, and look at it in `?doll=1` (lab) and the game.

## 11. Weapon-holding variants and measured hand points (added in the paladin/class roll-out)

- `actions.json` carries per-weapon-type variants (`idle.sword`, `walk.axe`, `attack.bow`, ...). `resolveAction` already prefers `<action>.<weaponType>`, so a class can be given its own `wh` (weapon grip) / `oh` (off hand) / `deg` without touching other weapons. The staff-type variants are shared by sorcerer and priest (both `type: staff`), their points are the average of the two classes.
- `wh`/`oh` are no longer the placeholder numbers: `output/dv2fmt/work/measure_class.py <class>` finds the fists in each BODY cell (arm end farthest from the shoulder; hand blob centroid) and `apply_actions_class.py` writes them (grip = fist - foot anchor). The HAND sheet stays empty.
- Low carry (stand, walk, hurt): sword and dagger point down and slightly forward (`deg` 155-190), axe leans up-outward, staffs and bow stay upright. Windup/strike/cast/victory keep their raised swings.
- Weapon sprite sizes: sword 7x14, dagger about 9 px above the grip, axe about 17, staffs about 22, bow 18 px tall (grip at its belly), shield 11 px round.

- Effects (all 120x60, 4 directions x 2 frames, shared palette `effects`): `effect_slash.png` (melee arc), `effect_burst.png` (staff cast, `fxType: burst`, placed above the staff tip by `fxOff`), `effect_arrow.png` (bow release, `fxType: arrow`). Per-slot `fxType` / `fxOff` in `actions.json` are optional; without them the slot uses `slash` at the per-direction `fxOffset`.
- Extra frames: each class has its own stand1 (breath), cast1, victory1 (hop) cells and, for the archer, real aim0 (draw) / aim1 (release) cells, drawn from the `fC/sC/bC` pose sheets.
- `_fine` weapons (`weapon_<type>_fine.png`) are derived in code from the base sprite (cooler greys brighter, browns to gold); no generation.
- Class accents applied at palette snapping: assassin scarf = crimson ramp (palette entries added), priest robe lifted 12 percent.
