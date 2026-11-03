# T31: l0veyou layer art v2 — side view, fitted per frame

Status: done
Tier: pi
Context: `docs/ARCHITECTURE.md`. Follow-up to T30 (`output/pi-results/T30.md`, `output/layer-demo/shot-compare.png`). Claude's review of T30: FAIL for both sets because (a) items were drawn front / 3-4 view while the hero is side-facing (shield shows its face, cross forward), (b) items are too big, (c) in attack the rigid helmet/sword detach from the lunging body. Read only the files named here and in T30's card.

> Task card for pi. Do the steps in order and do not widen the scope. Run every command in the foreground. When finished, write the result to `output/pi-results/T31.md` in English.
> The dispatcher is the only one that edits `Status:`. Never edit this card; all output goes to the result file.

## Goal
Paladin set (and darkknight set limited to its horned-knight actions) whose items read as worn by the side-facing hero in idle, walk and attack at zoom 2, using at most 4 more l0veyou generations and no paid tools.

## Files you may change
- `output/l0veyou/prompts/layer-<set>-v2.txt`, `output/l0veyou/layer-<set>-v2*.png`
- `pipeline/scripts/place_layer_items.py`
- `output/layer-demo/` (assets, page, check.mjs)

## Steps
1. New prompts (copy T30's style paragraph). Second paragraph: "strict SIDE PROFILE view facing right, as worn by a knight seen from the side": helmet in profile with visor slit, chest plate in profile, cape hanging behind, kite shield seen EDGE-ON / at a steep angle on the far arm (only rim and a sliver of face visible), sword held horizontally pointing right. Attach a side-facing paladin idle frame as REF. Magenta background, 5 columns, 16:9.
2. Generate paladin (≤2 tries). For darkknight (≤2 tries), use a horned-knight frame from its idle/attack rows as REF.
3. Fit per frame instead of median anchors: for every frame, scale the item non-uniformly (nearest-neighbour, clamp 0.8–1.2 of the median scale) so its bbox matches that frame's T28 split-layer bbox for the slot; position by bbox centre; weapon rotated by the split's principal axis; if the split slot is empty or noise (< 20 px) hide the item that frame. Clip helmet/chest to the union of the body silhouette dilated by 2 px, so nothing floats off the body.
4. Darkknight: enable the l0veyou set only on actions whose frames show the horned knight (T30 reports the walk row is a red-cloaked variant); mark the other actions 不相容 for that set.
5. `check.mjs`: 0 console errors at 1280x800 and 402x712; `shot-v2-compare.png` = rows idle / walk / attack × columns 拆分 / l0veyou v1 / l0veyou v2, paladin; `shot-v2-dk.png` same for darkknight on its allowed actions.
6. Measure: per slot, the share of opaque item pixels outside the dilated body silhouette (target < 5%) and walk anchor jitter std. Self-verdict per set PASS/FAIL; FAIL is fine — do not use PixelLab.

## Acceptance
- ≤ 4 l0veyou generations total; edge check clean on used sheets; `node output/layer-demo/check.mjs` passes with both new screenshots.
- Nothing under `src/`, `assets/`, `sprites/` changed. Do NOT run npm test or npm run verify.

## Report (write to output/pi-results/T31.md, at most 15 lines)
- Verdict on line 1; generations used; per set PASS/FAIL + outside-silhouette % per slot + jitter
- Screenshot paths; problems, or "none"

## Do not
- Spend PixelLab or other paid credits. Commit or push. Retry a failing check more than twice.
