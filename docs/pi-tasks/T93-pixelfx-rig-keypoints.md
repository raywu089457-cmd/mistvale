# T93: pixelfx rig skeleton per frame -> PixelLab 18-joint keypoints (AI body re-posed by the rig)

Status: cancelled
Accept: node tools/checks/pixelfx-rig-keypoints.mjs && git -C C:/Users/ray/pixelfx diff --quiet -- src/core

Gate: montage
Montage: output/pixelfx-character/rig-keypoints.png

## Goal
The outfit system stays pixelfx's own (rig fork `pipeline/scripts/pixelfx/character/core/rig.js`: `setMaterial` layers, `setGearPass`, `WEAPONS`, `gear/archer.js`); only the bare body's look will be AI-drawn. PixelLab `animate-with-skeleton-v3` re-poses one AI sprite into one skeleton per frame, so it needs the rig's skeleton of every frame. This card exports them; it makes no PixelLab call.

1. For the shared bare body's moves `walk-4dir.js` (directions down, up, right; 8 frames each, the same poses `export-4dir.mjs` renders) and `idle-4dir.js` (down, up, right), take `skeleton(pose)` of every frame (local space: x right, y down, feet at (0,0), z toward the viewer, already turned by the yaw) and write `pipeline/scripts/pixelfx/character/data/rig-keypoints.json`:
   `{ canvas: 152, cell: 76, pivot: [38, 62], scale: 2, directions: { down: { idle: [18 joints], walk: [[18 joints] x 8] }, up: {...}, right: {...} } }`, each joint `{ label, x, y, depth }` with x/y as fractions 0-1 of the 152 canvas (= the 76 export cell at 2x, the feet pivot (38,62) of that cell) and the 18 labels exactly PixelLab's enum: NOSE, NECK, RIGHT/LEFT SHOULDER, RIGHT/LEFT ELBOW, RIGHT/LEFT ARM (= the hand/wrist), RIGHT/LEFT HIP, RIGHT/LEFT KNEE, RIGHT/LEFT LEG (= the ankle), RIGHT/LEFT EYE, RIGHT/LEFT EAR.
2. Side convention: PixelLab labels are anatomical. Evidence in `output/pixellab-rigbody/first/estimated-keypoints.json` (PixelLab's own estimate on an AI body standing on the rig idle): facing the viewer (down) RIGHT SHOULDER is on the viewer's LEFT (x 65.7 vs LEFT 87.8 of 152); facing away (up) it is on the viewer's right. Map the rig's near/far joints (shoulderN/elbowN/handN/hipN/kneeN/ankleN vs ...F) to RIGHT/LEFT so that this holds; in the right-facing side view the near side is the character's LEFT. Write in the plan's Facts which rig side is which and how you checked it on a rendered frame.
3. Face points from the head joint and the facing: NOSE in front of the face (front view: on the head's centre line a little below its middle; side view: at the front edge of the face), EYES either side of it (front: about 2.5 px apart at 2x scale per side; side view: both near the front, the far one hidden behind is fine), EARS at the sides of the head (front: at the head's left/right edge; side: the near ear mid-head, the far ear behind it). Compare with the estimate file above; keep within a few px of it on the idle frames.
4. depth 0-255: about 128 at the body centre, higher = nearer the viewer, from the joint z (scale so the near and far shoulders in the side view differ by about 60).
5. Montage `output/pixelfx-character/rig-keypoints.png` at 4x on the 152 canvas: rows down/up/right, each row the idle + 8 walk frames of the rig's current render (`export-4dir.mjs` cells, doubled), with the keypoints drawn on top: RIGHT-side joints red, LEFT-side blue, centre joints white, and the bones as 1 px lines.
6. Checker `tools/checks/pixelfx-rig-keypoints.mjs`: 3 directions x (1 + 8) skeletons x 18 distinct labels, x/y within (0,1); every ankle and hand point lies within 3 px (2x scale) of an opaque pixel of the rig's own render of that frame; the down view keeps RIGHT SHOULDER/ARM/HIP/LEG left of LEFT ones in every frame and the up view the opposite; on the idle frames each joint lies within 10 px (2x scale) of the same label in the estimate file. Print the max distances.

NEVER edit `C:/Users/ray/pixelfx`. Do not change how the bare body or the archer gear render; this card only reads poses.

## Notes
- 2026-11-08: cancelled in the PLAN stage (no files changed); the user asked for this work to be done by a Sonnet subagent instead of the dispatcher. This card stays as the spec.
