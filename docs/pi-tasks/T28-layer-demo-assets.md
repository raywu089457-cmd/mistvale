# T28: real equipment layer sheets for the layering demo (zero-credit, split from existing hero sheets)

Status: done
Tier: pi
Context: `docs/ARCHITECTURE.md` (file map). The demo `output/layer-demo/` (card T26, result `output/pi-results/T26.md`) has no real equipment layers: `sprites/equipment/*` only hold `.gitkeep`, and the crown accessory is drawn at 32 px on a ~67 px hero, so it looks oversized. Read only the files listed; do not explore the repo.

> Task card for pi. Do the steps in order and do not widen the scope. Run every command in the foreground. When finished, write the result to `output/pi-results/T28.md` in English.
> The dispatcher is the only one that edits `Status:`. Never edit this card; all output goes to the result file.

## Goal
The demo shows a hero built from separate, frame-aligned layers — base body, helmet, chest armour, cape, shield, weapon — that can be toggled, reordered, recoloured and swapped between classes, with no PixelLab credits spent. Layers are produced by splitting existing hero sheets, so every layer frame matches the body frame exactly (the TMW "same frame index" idea).

## Inputs (read only)
- `assets/heroes/paladin.png/.json`, `darkknight.*`, `archer.*`, `assassin.*` (open the JSON as UTF-8).
- `assets/heroes/paladin-sword.*`, `paladin-smear.*`, `accessories.png/.meta`.
- `output/layer-demo/index.html`, `demo.js`, `serve.mjs`, `check.mjs`.

## Files you may change
- `pipeline/scripts/split_hero_layers.py` (create)
- `output/layer-demo/` (assets + page)

## Steps
1. Write `split_hero_layers.py` (Pillow, numpy ok). For a hero sheet, classify each opaque pixel into a layer by colour clusters (k-means or hand-picked HSV ranges printed from a histogram first) plus position relative to that frame's `head` anchor: helmet = armour-coloured pixels above the head anchor's neck line; cape = the cape hue; shield = shield hue/region; weapon = blade/handle hue; chest = remaining armour-coloured pixels; body = everything else (skin, cloth, outline under removed parts). Every output sheet has the same size and grid as the source; the alpha union of all layers must equal the source alpha exactly, and layers must not overlap (each pixel in exactly one layer).
2. Run it for paladin and darkknight (the most armoured classes). Output `output/layer-demo/assets/layers/<class>-<layer>.png` + one `<class>-layers.json` listing layers and their default draw order.
3. Mix-and-match: since all classes share frame indices only when their action tables match, enable swapping a layer between two classes only for actions whose frame count and cell size match; show other actions as "不相容" in the UI.
4. Accessory scale: in the demo draw the head accessory at the hero's art scale (scale it so its width is about 0.45 × the head width implied by the sheet; nearest-neighbour, integer or 0.5 steps) and expose a size slider.
5. Update the demo: layer list = body/chest/helmet/cape/shield/weapon/fx/accessory, each with show/hide, ▲▼ order, hue slider, palette presets, and a class source picker per layer. Keep the existing explanation panel and add one line: 這些圖層是從原本整張英雄圖自動拆出來的（不花素材額度）。
6. Phone layout: at width ≤ 480 px the controls stack under the canvas, canvas fits the width, buttons ≥ 36 px tall.
7. Extend `check.mjs`: 0 console errors at 1280x800 and 402x712; screenshots `shot-layers.png` (all layers, paladin), `shot-mix.png` (paladin body + darkknight helmet/chest), `shot-phone.png`; and the script's self-check prints alpha-union OK and overlap 0 for every split sheet.

## Acceptance (all must pass)
- Split self-check: alpha union equals source, overlap 0, for both classes.
- `node output/layer-demo/check.mjs` passes and writes the 3 screenshots.
- Nothing under `src/`, `assets/`, `sprites/` changed. Do NOT run npm test or npm run verify (another card is running verify in parallel).

## Report (write to output/pi-results/T28.md, at most 15 lines)
- Verdict on line 1: `DONE` / `BLOCKED` / `FAILED`
- Layers produced per class; actions compatible for mixing
- Screenshot paths; problems hit (e.g. layers that split badly), or "none"

## Do not
- Spend PixelLab or any image-generation credits.
- Commit or push.
- Keep going after the same check fails twice: stop and report.
