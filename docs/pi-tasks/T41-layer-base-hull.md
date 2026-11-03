# T41: Clean bare-body base: hull fill and redo attack frames

Status: done
Accept: node output/layer-demo/check.mjs

Context: follow-up to T36 (`output/pi-results/T36.md`, `output/layer-demo/shot-pixellab-base.png`). Claude's review: the bare body works (helmet and chest toggle cleanly over it), but "base only" still shows a ghost cape, plume, sword and shield edge, and attack f0-3,8 kept the dressed sword+shield. Claude's decisions:
- Fill rule = **hull** (`--fill-holes hull`): the base must show no ghost equipment. Where the base is empty, leave it transparent.
- **Authorized:** ONE more `transfer-outfit-v2` call on account 2 for attack f0-3,8 (the unique frames among them, max 3 per call; if they need 2 calls, do only the first 3 unique frames). Same ref `base/ref.png`, same guard and ledger (`output/pixellab/layers/base/spend.json`, cap $0.70, cumulative now $0.558). One call only, no retry.

## Goal
Base-only frames show a bare person with no cape, plume, sword or shield, in all 18 frames. Each of the 5 pieces toggles on cleanly over it, and all pieces together == dressed.

## Files you may change
- `pipeline/scripts/split_dressed_layers.py`, `pipeline/scripts/pixellab/transfer_outfit.py`
- `output/pixellab/layers/base/`, `output/layer-demo/` (assets, page, check.mjs)

## Steps
1. Make the one authorized call for the attack frames. Log it in the ledger and the result.
2. Re-split with fill = hull. Ghost check: every pixel whose colour matches the cape, shield, weapon or plume palette (from T34/T36) and that sits in that slot's mask goes to that slot, never to the base. Measure ghost px per frame in base only (target ≤ 20).
3. Keep the check: body + all layers == dressed, 0 differing px.
4. Regenerate `shot-pixellab-base.png` (same layout as T36), plus `shot-pixellab-base-walk.png`: all 8 walk frames base only, then all 8 with all pieces, zoom 3.

## Report extras
- Ledger total; ghost px per action (max); armour-colour % in base per action; 0-diff check.

## Do not
- Make any paid call beyond the one authorized. Change `src/`, `assets/`, `sprites/`. Run npm test or verify. Commit or push.
