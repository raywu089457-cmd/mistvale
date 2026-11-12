# T89: pixelfx bare body: complete arms in a 4-direction idle

Status: done
Accept: node tools/checks/pixelfx-barebody-idle4.mjs && node tools/checks/pixelfx-barebody.mjs && git -C C:/Users/ray/pixelfx diff --quiet -- src/core

Gate: montage
Montage: output/pixelfx-character/barebody/idle-4dir.png

## Goal
The shared bare body (`pipeline/scripts/pixelfx/character/`, vendored rig fork in `core/`, T86/T88; outputs in `output/pixelfx-character/barebody/`) has broken arms: the user sees both arms incomplete. In the T88 sheets each arm is drawn as separate blocks (upper arm, elbow, forearm, hand) with dark ink/seam lines cutting across the arm between its own segments, the hands are lumps, and in the side views the far arm is almost entirely hidden. Before any walk work, make a 4-direction IDLE (standing, the rig's STAND pose, no walking) where the whole body, especially both arms, is complete and reads normally. Walk sheets are not touched in this card. NEVER edit `C:/Users/ray/pixelfx`; the T86 right-walk sheet and its checker must keep passing.

Idle, four directions (down = front view facing the camera, up = back view, right = the current side view, left = right mirrored), one frame each (or a short 4-frame breathing loop if trivial), same cell 76x76 and pivot convention as T86:
- Each arm reads as ONE continuous limb from shoulder to hand: upper arm, elbow, forearm and hand connected with no ink (#1d1410) line and no background gap crossing the limb between its own segments; a joint may show at most a 1 px seam tone (#9a6440) step. Arm width stays 2-4 px along its length; the hand is at most 1 px wider than the forearm (no lump).
- Down/up: both arms fully visible beside the torso, hanging down, hands at mid-thigh, symmetric within 1 px.
- Right/left: the near arm fully visible from shoulder to hand; the far arm must still show at least its forearm and hand (>= 8 pixels) behind/beside the body, e.g. by placing it slightly back in the idle pose.
- Whole body otherwise as T88: head, torso, both legs, both feet; one closed outline; one connected body; palette = T86 bare-body palette.
Fix the cause in the fork (how `finish()` draws ink/seams between parts of the same limb, limb thickness, idle arm targets), not by editing pixels afterwards.

Outputs (all under `output/pixelfx-character/barebody/`): `barebody-idle-4dir.png/.json` (rows down, up, right, left) and `idle-4dir.png` = the montage: for each direction, the idle at 8x and next to it a DEBUG view of the same frame where every rig part is a flat distinct colour (upper arm, elbow, forearm, hand of each side clearly different, a legend row under it). Write `tools/checks/pixelfx-barebody-idle4.mjs` (must fail before the work) asserting the arm rules above per direction using the fork's per-pixel part info (each arm's part pixels form one 4-connected component; no ink pixel between two parts of the same arm; widths; far-arm >= 8 px in side views), plus complete body, single component, palette. Update `output/pixelfx-character/index.html`: add an idle row showing the 4 directions at 8x above the walk.
