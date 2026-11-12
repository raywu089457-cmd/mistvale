# T91: pixelfx barebody fixes

Status: done
Accept: node tools/checks/pixelfx-barebody.mjs && node tools/checks/pixelfx-barebody-natural.mjs && node tools/checks/pixelfx-barebody-idle4.mjs && git -C C:/Users/ray/pixelfx diff --quiet -- src/core

## Goal
Fix two bugs that T90 review found, without changing the T90 front/back walk look (fabric regions, arm swing, two-tone legs stay as they are):

1. `pipeline/scripts/pixelfx/character/core/rig.js` `finish` pinhole fill: `fills.push(k)` records the counter after `push()` already advanced it, so the 4-neighbour recolour writes the next output pixel instead of the sealed hole. Record the index of the hole itself. Re-export the 4-direction walk/idle sheets and `output/pixelfx-character/barebody/walk-natural.png` afterwards; no stray single pixels sticking out of hands or knees.
2. `tools/checks/pixelfx-barebody.mjs` mask test compares the sheet with the fork's own `posed` output, so it can never fail. Restore the comparison against the stock pixelfx checkout (`PIXELFX_DIR`, default C:/Users/ray/pixelfx, read only) for the right walk: the bare body's right-walk silhouette must match the stock grey right walk per frame (report missing/extra pixel counts; allow at most the outline differences T86 accepted, and print the numbers). If the fork really differs from stock, fix the fork, never loosen the checker.

Prove bug 1 with a small unit check inside `tools/checks/pixelfx-barebody-natural.mjs`: a synthetic sealed hole gets recoloured at its own index.
Do not edit C:/Users/ray/pixelfx.
