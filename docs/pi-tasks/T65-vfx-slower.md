# T65: 全部 pixelfx 特效放慢到 0.6 倍,命中瞬間仍對齊

Status: failed
Accept: auto

## Goal
Play every pixelfx sprite-sheet effect (everything drawn through drawVfxSheet in `src/pixel-world.js`) at 0.6x its current speed, so players can see it. Use one constant, e.g. `VFX_SPEED=0.6`, so it is easy to tune later.

Rules:
- **Hit timing stays.** Several effects line up a frame with the moment of the hit: HOLY_LAND (the holy hammer lands on the hit), the MELEE_FX t0 offsets (darkknight, assassin, paladin), the berserker hit, CINDER and spell sheets, and HEAL_LEAD. After the change, that sheet frame must still land on the same game time as before. Only the parts before and after it stretch by 1/0.6.
- **Endings don't get cut off.** Fades that end an effect (fadeAt / fadeLen, the `age<.5` style cut-offs, HEAL fade) stretch by the same ratio. The effect lifetime filter in `src/pixel-game.js` (about 1.6 s) must keep each effect alive long enough to finish its slowed animation. Change only that number, nothing else in pixel-game.js.
- **Arrows in flight:** gale-arrow and arrow sheets in drawProjectile / drawShotArrows, and their afterimages, keep the same flight speed, path and hit moment. Only the looping animation of the sheet slows down.
- No change to damage, game logic, positions, scale or draw order.

Accept: a checker in `tools/checks/` that fails on today's code. For each sheet effect it computes:
- the sheet time at the hit moment, which must equal the old value within 1 frame;
- the playback rate, which must be 0.6x the old one;
- the age at which the effect is removed or faded to 0, which must be at least the slowed sheet duration (or the old cut-off divided by 0.6).

Then `npm run verify:quick`.
