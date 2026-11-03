# T26: Equipment layering demo page from existing assets (standalone, not in the game)

Status: done
Tier: pi
Context: `docs/ARCHITECTURE.md` (file map) and `docs/TMW-STUDY-SYNTHESIS.md` (why). Concept from TMW: a layer sheet shares the body frame index and adds offsets only; dye changes colour. Read `output/tmw-anim-study.md` sections "Layering and slots" and "Recolor and variants". Read only the files listed; do not explore the repo.

> Task card for pi. Do the steps in order and do not widen the scope. Run every command in the foreground. When finished, write the result to `output/pi-results/T26.md` in English.
> The dispatcher is the only one that edits `Status:`. Never edit this card; all output goes to the result file.

## Goal
A standalone page `output/layer-demo/index.html` showing a hero animation with equipment drawn as separate layers synced to the body frame, with toggles and recolour, using only existing repo assets. Nothing in `src/` changes.

## Inputs (read only)
- `assets/heroes/<class>.png/.json` (e.g. paladin, archer): actions, frames, frameTime, per-frame `head` anchors.
- `assets/heroes/accessories.png` + `accessories.meta` (cell 32; items crown, laurel, ...): head layer art.
- `sprites/equipment/` folders and `sprites/EQUIPMENT_SPEC.md`: use any ready PNGs there as extra layers; if none are usable, say so.

## Files you may change
- `output/layer-demo/` (create: index.html, demo.js, copied asset files)

## Steps
1. Copy the needed PNG/JSON into `output/layer-demo/assets/` so the page is self-contained.
2. Page: canvas (`image-rendering:pixelated`, integer zoom 2/3/4), class select, action select (from json), play/pause + frame step, speed from json `frameTime`.
3. Layers: body + head accessory placed by the current frame's `head` anchor (same frame index as body: the TMW include idea) + any equipment PNG layer. Each layer has show/hide and draw-order up/down.
4. Dye: per layer a hue-shift slider and 3 preset palettes, recolouring on an offscreen canvas (alpha preserved).
5. A small panel in Traditional Chinese explaining: 同格號共用、只記位移、染色 vs 重畫.
6. Verify with playwright (launch code like `small-text.mjs`): serve the folder with a local static server, wait 1s, assert no console errors, screenshot `output/layer-demo/shot.png` and one with all layers + a dye preset `shot-dyed.png`.

## Acceptance
- Page loads with 0 console errors; both screenshots exist; `git status --short -- src assets` unchanged by you.

## Report (write to output/pi-results/T26.md, at most 15 lines)
- Verdict on line 1: `DONE` / `BLOCKED` / `FAILED`
- Files changed (names only)
- How to open the demo (one line)
- First line of `output/ui-audit/verify-summary.md` if you ran verify
- Problems hit, or "none"

## Do not
- Commit or push.
- Touch hunter AI, combat, save code in `src/pixel-game.js`, or drawing logic in `src/pixel-world.js`.
- Spend PixelLab credits.
- Keep going after the same check fails twice: stop, write the error summary, hand back.
