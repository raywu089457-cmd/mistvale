# T95: hit feel: screen shake on heavy hits

Status: done
Accept: node tools/checks/hit-feel.mjs && npm run verify:quick

## Goal
Heavy hits should feel like hits: add screen shake, triggered by skill hits, crits and boss attacks, with the strength/duration table below. It can be switched off in the settings panel and is forced off under `prefers-reduced-motion: reduce`. Shake is a view-only offset: it must not move `cam`/`target`, and `unproject` (click and drag world coordinates) must keep returning the same world point with shake active.

## Notes
- Implementation point: add a `shakeX/shakeY` screen-pixel offset to the screen projection in `src/pixel-world.js` (`camPxX`/`camPxY`); leave `unproject` alone. Expose `view.shake(amp, ms)` next to the other view methods and a debug hook `globalThis.__mistvaleShake = () => ({x, y, amp})`.
- Amplitude table, at a 1440x900 DPR1 baseline, multiplied by `scale/baseScale` so it reads the same at every zoom:
  - normal hit 1.0 px / 90 ms
  - crit 2.0 px / 140 ms
  - skill hit (any `skillfx` AoE: cinder, whirlwind slash, arrow rain) 3.5 px / 220 ms
  - boss attack landing on a hunter 4.5 px / 260 ms
- Decay `amp*(1-t)^2`. Drive the direction from fixed noise and change the phase every 40 ms (never per-frame random, it strobes). Two events at once take the larger amplitude, never add them.
- Settings panel (`src/pixel-ui.js`, the same block as the existing shadow/night toggles): add a 鏡頭震動 toggle, on by default, remembered in the save. Treat `matchMedia('(prefers-reduced-motion: reduce)')` as off.
- Trigger points are in the hit/damage flow of `src/pixel-game.js` (grep for the skill effect creation and the crit decision). Do not change damage numbers or combat timing.
- New checker `tools/checks/hit-feel.mjs`, modelled on the harness in `tools/checks/cinder-full-speed.mjs`. It must be able to fail and must prove: after a skill hit |amp| > 0.5 px within 100 ms and < 0.05 by 600 ms; with the setting off it stays 0 the whole time; `unproject` for one screen point returns the same world point (within 0.01) with the shake active.
- No montage: a still frame cannot show a shake, the checker is the evidence.

## Files you may change
- src/pixel-world.js
- src/pixel-game.js
- src/pixel-ui.js
- tools/checks/hit-feel.mjs
