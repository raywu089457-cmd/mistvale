# T90: pixelfx bare body: clean materials by bone + natural front/back walk like stock

Status: failed
Accept: node tools/checks/pixelfx-barebody-natural.mjs && node tools/checks/pixelfx-barebody-idle4.mjs && node tools/checks/pixelfx-barebody.mjs && git -C C:/Users/ray/pixelfx diff --quiet -- src/core

Gate: montage
Montage: output/pixelfx-character/barebody/walk-natural.png

## Goal
Shared bare body in `pipeline/scripts/pixelfx/character/` (vendored rig fork `core/`, `barebody.js`, `walk.js`, `export-actor.mjs`; T86/T88/T89; checkers `tools/checks/pixelfx-barebody*.mjs`; outputs `output/pixelfx-character/barebody/`). Two problems the user and Opus see; keep everything else (geometry, 4 directions, continuous arms from T89, palette). NEVER edit `C:/Users/ray/pixelfx`.

1. Blotchy body (Opus diagnosis from idle-4dir.png, verify it in the plan's Facts): `shortsLayer` / `wrapLayer` / `backWrapLayer` in `barebody.js` pick the shorts and chest-wrap colours by REST-SPACE ROW (`y` from `src`), and in turned views (down, up, the side's far parts) those rows scatter, so dark shorts/wrap patches land on the chest, belly and legs. Assign materials by BONE and bone-local position instead: shorts = pelvis + lower half of the waist + the top 40% of each thigh (by the thigh bone's own length); chest wrap = one band on the chest bone (its middle third); everything else skin; the eye(s) as now. Then each of shorts and wrap is ONE connected region per frame, and no shorts/wrap colour lands on the head, arms, shins or feet.

2. Front/back walk must move as naturally as pixelfx's stock side walk (the user asked: "正面反面動作要自然跟原廠一樣"). Down and up must use the SAME 8-frame step cycle as the stock walk (the same pose keys and timing that make the right walk), with the body turned toward/away from the camera, so:
 - body bob: the pelvis height per frame equals the right walk's pelvis height per frame (same down on contact, up on passing);
 - legs alternate as in the stock cycle: the stance leg straight on the ground, the swing leg with a visible knee bend, its foot lifted 1-3 px in the passing frames, both feet back on the ground line at contact;
 - arms swing opposite to the legs, in depth (fore/aft of the body), so in the image each hand stays beside its thigh (upper arm within 1 px of the torso, T88/T89 rule) and moves only 1-2 px up/down and at most 1 px in/out, opposite to its same-side leg;
 - shoulders and hips counter-twist slightly as the stock rig does in the side walk; the head stays steady (moves only with the bob).
 Right stays the stock right walk (same alpha mask as stock), left its mirror.

Outputs: re-export idle (T89) and the 4-direction walk sheets + gifs with the new materials; `walk-natural.png` = 4 rows x 8 frames at 6x with labels: stock grey side walk (pixelfx checkout, read-only) | bare body right | bare body down | bare body up. Write `tools/checks/pixelfx-barebody-natural.mjs` (must fail before the work): per frame in all 4 directions shorts and wrap each one 8-connected component, no shorts/wrap colour on head/arm/shin/foot parts; down/up pelvis-height sequence equals the right walk's; swing-foot lift 1-3 px in passing frames and both feet on the ground line at contacts; hands within the arm rules and moving opposite to the same-side leg. Update `output/pixelfx-character/index.html` if file names change.
