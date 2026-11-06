# T66: 火龍捲(cinder-cyclone)恢復原本播放速度

Status: done
Accept: auto

## Goal
The sorcerer's 火龍捲 skill (`cinder-cyclone` sheet in `src/pixel-world.js`) goes back to its original playback speed of 1.0x: same frame timing, fade and lifetime as before commit dd3d616. Every other pixelfx sheet stays at VFX_SPEED (0.6x). Handle it as a per-sheet exception, e.g. a small map of speed overrides next to VFX_SPEED, rather than reverting by hand.

Accept: update `tools/checks/vfx-slower.mjs` so it requires cinder-cyclone at 1.0x, with its original hit frame and ending, and every other sheet still at 0.6x. It must fail on today's code. Then `npm run verify:quick`.
