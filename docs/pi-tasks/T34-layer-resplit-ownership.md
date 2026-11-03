# T34: Re-split PixelLab dressed frames by pixel ownership

Status: done
Accept: node output/layer-demo/check.mjs

Context: follow-up to T33 (`output/pi-results/T33.md`, `output/layer-demo/shot-pixellab-compare.png`). The PixelLab dressed frames passed Claude's review; the split into layers did not. **No PixelLab or other paid calls in this card** — re-split the existing outputs in `output/pixellab/layers/` only.

## Goal
`pixellab-<slot>.png` layers that, stacked on the body, look the same as `pixellab-dressed.png` in every frame of idle / walk / attack, with a real weapon layer and the walk shield present.

## Files you may change
- `pipeline/scripts/split_dressed_layers.py`
- `output/pixellab/layers/` (split outputs only; never the raw PixelLab outputs or job JSONs)
- `output/layer-demo/` (assets, page, check.mjs)

## Steps
1. Diagnose in the result, briefly: why walk loses the shield (is T28's walk shield mask empty or in the wrong place vs the dressed shield?) and why weapon is empty (the sword is unchanged between input and dressed, so a diff gives nothing).
2. Change the split from "pixels that differ" to "ownership": every opaque dressed pixel goes to exactly one of body / helmet / chest / cape / shield / weapon.
   - a. Pixels inside a slot's T28 mask (dilated 2 px) belong to that slot, unchanged or not. Where dilated masks overlap, the undilated mask wins, then the order weapon > shield > helmet > cape > chest.
   - b. Changed pixels that are in no mask: assign them to the nearest slot whose colours match. Build each slot's palette from the frames where that slot is well-formed (for the shield, use the idle and attack dressed shield). Assign only within 6 px of that slot's bbox in the same frame. Anything still unowned goes to body.
   - c. If a walk frame has no shield mask, or a tiny one (< 30 px), build it from the colour palette in b: the connected component of shield-palette pixels.
3. Self-check per frame: body plus all layers must equal the dressed frame, with 0 differing pixels. Measure px per slot per frame. weapon > 0 in every frame where T28's weapon layer is non-empty. walk shield px within 50–150 % of the idle shield px.
4. Regenerate the layers and `shot-pixellab-compare.png`. Also write `shot-pixellab-slots.png`: walk frame 0 and attack frame 4, each slot drawn alone on a grey background, zoom 3.

## Accept
- `node output/layer-demo/check.mjs` passes. Step 3 checks pass and are listed in the result.

## Do not
- Call PixelLab or any paid API. Change `src/`, `assets/`, `sprites/`. Run npm test or verify. Commit or push.
