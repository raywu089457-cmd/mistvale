# T33: PixelLab transfer-outfit probe for paladin equipment layers

Status: done
Accept: node output/layer-demo/check.mjs

Context: `output/pixellab-layer-plan.md` (T32 plan, method B). The user APPROVED spending PixelLab credits on account 2 for this card, hard cap **$0.60 total**. l0veyou v1/v2 (T30/T31) failed review; this is the paid follow-up.

## Goal
Paladin side-facing idle (1) + walk (8) + attack (9) frames dressed in one armour design via `POST /v2/transfer-outfit-v2`, then mask-split into 5 frame-aligned layers (helmet, chest, cape, shield, weapon) usable in `output/layer-demo/` as a third source `PixelLab`. Spend as a probe: walk first, read the real price, then decide.

## Files you may change
- `output/pixellab/layers/` (new: inputs, job JSONs, raw outputs, split layers)
- `pipeline/scripts/pixellab/transfer_outfit.py` (new) and `pipeline/scripts/split_dressed_layers.py` (new)
- `output/layer-demo/` (assets, page source picker, check.mjs)

## Steps
1. Read `C:\Users\ray\.claude\skills\pixellab-assets\SKILL.md` and `docs/HANDOFF-2026-10-30.md` (grep `PIXELLAB_TOKEN|account|帳號`) to find how account 2's token is set. Set `PIXELLAB_TOKEN` to account 2 for every call in this card. Run `balance`; log it. If the balance is not clearly positive, or you cannot find account 2, STOP and report BLOCKED — never call on account 1.
2. Fetch the `transfer-outfit-v2` request schema from `https://api.pixellab.ai/v2/llms.txt` (or its linked doc). Write `transfer_outfit.py`: reference image + frames list → POST → poll `background-jobs/{id}` → save every output frame and the full job JSON (including `usage`) to `output/pixellab/layers/`.
3. Inputs: cut the paladin `walk` row (8 frames, side facing) from `assets/heroes/paladin.png` using `assets/heroes/paladin.json` cells, transparent background, exact cell size. Reference outfit = the paladin item sheet from T31 (`output/l0veyou/layer-paladin-v2*.png`, pick the best one) composited onto the paladin idle frame, or the idle frame itself if the API needs a character image — note which.
4. **Probe**: ONE call on the 8 walk frames. Read `usage`. Write the gens and USD to the result. Decision:
   - If the probe cost ≤ $0.20 AND outputs are 8 frames at the input size: do attack (9 frames; if the API caps below 9, split into 2 calls) and idle (frame duplicated ×2). Before each call, check that cumulative spend + the probe's cost stays ≤ $0.60; if not, skip that action.
   - Otherwise: stop spending, report the price, keep the walk output.
   - If any call errors twice, stop spending.
5. `split_dressed_layers.py`: for each dressed frame, align to its input frame (if size differs, nearest-neighbour resize back; if offset, find the best integer shift ≤ 2 px by min diff), then `layer = dressed pixels where dressed ≠ input`, restricted per slot to T28's slot masks in `output/layer-demo/assets/layers/paladin-<slot>.png` dilated by 2 px. Pixels that differ but fall in no slot mask → count them (outside-mask %), do not use. Write `pixellab-<slot>.png` sheets with the body sheet grid, plus `pixellab-dressed.png` (full dressed frames) for comparison.
6. Demo: add source `PixelLab` to the per-layer picker (actions without PixelLab output show 未生成). `check.mjs`: 0 console errors at 1280x800 and 402x712; write `shot-pixellab-compare.png` = rows idle / walk / attack × columns 拆分 / l0veyou v2 / PixelLab 分層 / PixelLab 原圖, paladin, zoom 2.
7. Measure per action: outside-mask diff %, per-frame shift used, and walk jitter of each layer's bbox centre (std px).

## Report extras
- Balance before/after, every call's gens + USD, cumulative total (must be ≤ $0.60).
- Per action: done/skipped; outside-mask %; shift; jitter. Self-verdict PASS/FAIL is optional — Claude reviews the screenshot.

## Do not
- Spend more than $0.60 total, use account 1, or call any endpoint other than balance / transfer-outfit-v2 / job polling.
- Change anything under `src/`, `assets/`, `sprites/`. Run npm test or verify. Commit or push.
