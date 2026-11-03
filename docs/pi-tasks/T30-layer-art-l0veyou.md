# T30: equipment layer art with l0veyou (free) for the layering demo

Status: done
Tier: pi
Context: `docs/ARCHITECTURE.md` (file map). Builds on T28 (`output/pi-results/T28.md`): T28 split existing hero sheets into frame-aligned layers. This card makes NEW, cleaner equipment art with the free l0veyou platform and places it with per-frame anchors derived from T28's split layers. Cost order (user rule): l0veyou first; PixelLab only in a later card if this result fails review. Read only the files listed.

> Task card for pi. Do the steps in order and do not widen the scope. Run every command in the foreground. When finished, write the result to `output/pi-results/T30.md` in English.
> The dispatcher is the only one that edits `Status:`. Never edit this card; all output goes to the result file.

## Goal
Two complete equipment sets (paladin-style 聖騎士 silver/gold, darkknight-style 黑騎士 dark iron/red) as separate item sprites — helmet, chest armour, cape, shield, weapon — drawn in the game's pixel style, placed on the hero per frame in `output/layer-demo/`, switchable against T28's split layers (source picker: 拆分 / l0veyou).

## Inputs (read only)
- `docs/pi-tasks/T03-banners.md` step 1 (how to open the l0veyou browser and the login check), `pipeline/scripts/l0veyou/generate.mjs` usage header, `pipeline/scripts/l0veyou/sheet_to_atlas.py` usage header.
- `sprites/SPRITE_VISUAL_BIBLE.md` (style rules; this is the art authority) and `output/l0veyou/prompts/acc-head.txt` (an existing item-sheet prompt to copy the style paragraph from).
- `output/layer-demo/assets/layers/*` and `<class>-layers.json` from T28; `assets/heroes/paladin.png/.json`, `darkknight.*`.

## Files you may change
- `output/l0veyou/prompts/layer-<set>.txt` (new), `output/l0veyou/layer-<set>-v<n>.png` (generated)
- `output/layer-demo/` (assets + page + check.mjs)
- `pipeline/scripts/place_layer_items.py` (new)

## Steps
1. Open the l0veyou browser exactly as T03 step 1 (skip if running). If the login check fails, stop and report BLOCKED.
2. Prompt per set: first paragraph = style paragraph copied from `acc-head.txt`; second = "a 5-column item sheet on a flat magenta (#ff00ff) background, one item per column, front/3-4 view matching a side-facing hero: helmet, chest armour, cape, kite shield, longsword", plus the set's palette and the hero's pixel density (state the target item heights in px from the hero sheet: measure helmet/shield/chest bounding-box heights from T28's split layers). Attach a paladin / darkknight frame as REF.
3. Generate with ratio 16:9 (`generate.mjs`), at most 3 tries per set (6 total). After each, cut with `sheet_to_atlas.py` (5 columns) and run its edge-touch check; reject sheets where items touch edges or the background is not removable.
4. Downscale each item with nearest-neighbour to the measured target height, quantise to ≤16 colours, remove magenta, add the 1px dark outline used by the hero sheet.
5. `place_layer_items.py`: for every frame of every action, compute an anchor per slot from T28's split layer for that slot (bbox centre + bbox height; for weapon use the principal axis angle of the split weapon pixels). Place the item at that anchor (rotate weapon by the angle, nearest-neighbour; flip by facing). Write `<set>-<slot>.png` sheets with the same grid as the body sheet, and log frames where the slot is empty in the split (item hidden there).
6. Demo: add per-layer source picker 拆分 / l0veyou; mixing works across classes for the compatible actions T28 found. Extend `check.mjs`: 0 console errors at 1280x800 and 402x712, screenshots `shot-l0veyou.png` (paladin body + l0veyou paladin set), `shot-l0veyou-dk.png`, `shot-compare.png` (split vs l0veyou side by side, 3 actions: idle, walk, attack).
7. Self-review in the result: for each set, does it read as the same character at game size (zoom 2)? Do items jitter between frames (measure anchor jitter in px over walk)? Verdict per set PASS / FAIL with the reason. FAIL is a valid outcome — do NOT fall back to PixelLab in this card.

## Acceptance (all must pass)
- ≤ 6 l0veyou generations; edge check passes for the sheets used.
- `node output/layer-demo/check.mjs` passes and writes the 3 screenshots.
- Nothing under `src/`, `assets/`, `sprites/` changed. Do NOT run npm test or npm run verify.

## Report (write to output/pi-results/T30.md, at most 15 lines)
- Verdict on line 1: `DONE` / `BLOCKED` / `FAILED`
- Generations used; per-set PASS/FAIL with reason; walk anchor jitter (px)
- Screenshot paths; problems hit, or "none"

## Do not
- Spend PixelLab credits or use any paid generator.
- Commit or push.
- Keep going after the same check fails twice: stop and report.
