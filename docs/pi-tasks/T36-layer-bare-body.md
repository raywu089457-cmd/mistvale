# T36: PixelLab bare-body base under the dressed paladin frames

Status: failed
Accept: node output/layer-demo/check.mjs

Context: follow-up to T33/T34 (`output/pi-results/T33.md`, `T34.md`). The PixelLab dressed paladin frames (18 frames: idle 1, walk 8, attack 9) are good, but there is no unarmoured body under them, so removing any equipment piece leaves a hole. The user APPROVED a new PixelLab spend on **account 2** for this card, hard cap **$0.70**. Known price: `transfer-outfit-v2` = $0.08 per call, max 3 frames per call at these sizes (T33).

## Goal
A bare-body base (same pose, same frames, plain dark linen undershirt and trousers, bare head with short hair, no helmet, no armour, no cape, empty hands) for the 18 dressed frames, aligned 1:1. Then the 5 equipment layers = dressed minus base, so each piece toggles off cleanly over the base.

## Files you may change
- `pipeline/scripts/pixellab/transfer_outfit.py`, `pipeline/scripts/split_dressed_layers.py`
- `output/pixellab/layers/` (new subfolder `base/`; never overwrite T33 raw outputs)
- `output/layer-demo/` (assets, page, check.mjs)

## Steps
1. Set `PIXELLAB_TOKEN` to account 2 exactly as T33 did. Run `balance` and log it. Add a spend guard IN CODE to `transfer_outfit.py`: a ledger file `output/pixellab/layers/base/spend.json`. Before every paid call it refuses if cumulative + $0.08 > $0.70. This guard is the rule; there is no judgement override, and no "gate exception" like T33.
2. Reference image (1 paid call at most): turn the dressed idle frame into the bare-body look with ONE call. Use `transfer-outfit-v2` with a text/plain-clothes reference if the schema allows it; otherwise use `edit-image-pixen` or `inpaint` on the idle frame with the description in Goal. Save it as `base/ref.png`. If the result still shows a helmet or plate armour, try once more (counts toward the cap). If it fails twice, STOP and report.
3. Base frames: `transfer-outfit-v2` with reference = `base/ref.png` and input = the **dressed** frames (so the pose matches the dressed set): walk (3 calls), attack (the 6 unique frames, 2 calls; reuse duplicates as T33 did), idle (1 call, frame duplicated). That is ≤ 6 calls. Order: walk first, then attack, then idle; the guard stops whatever does not fit.
4. Re-split: base = body layer, opaque everywhere the dressed frame is opaque (fill any base hole with the dressed pixel). Equipment = dressed pixels where |dressed − base| is noticeable. Assign them to slots with T34's ownership rules (undilated > dilated > palette, order weapon>shield>helmet>cape>chest). Unowned changed pixels go to chest, never to body. Check: body + all layers == dressed, 0 differing px, every frame.
5. Measure per frame: base pixels with plate-armour/helmet colours (use the chest/helmet palettes from T34) as a % of base pixels (target < 10%); per-slot px; walk bbox jitter per slot.
6. Demo: the PixelLab source uses the new base as the body. `check.mjs`: 0 console errors at 1280x800 and 402x712. Write `shot-pixellab-base.png`: rows walk f0 / attack f4 / idle × columns base only / base+helmet / base+chest / base+cape / base+shield / base+weapon / all, zoom 3.

## Report extras
- Balance before/after; every paid call with USD; total (guard log).
- Per action: done or skipped by the guard; armour-colour % left in base; the 0-diff check.

## Do not
- Spend over $0.70, use account 1, or call endpoints other than balance / transfer-outfit-v2 / edit-image-pixen / inpaint / job polling.
- Change `src/`, `assets/`, `sprites/`. Run npm test or verify. Commit or push.
