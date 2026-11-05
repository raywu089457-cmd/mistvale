# T61: 打在怪物身上的特效一律畫在角色之上

Status: done
Accept: auto

## Goal
Every effect shown on or at a monster must be drawn in the world's top layer, after every character, monster, tree and prop sprite in the same frame, so no sprite ever covers it. That includes hit sheets drawn through drawVfxSheet (holy-hit, dark-cleave, double-slash, parry, arrow impacts and others), the pre-impact phase of drawEffect, drawImpact, drawSlash, skill effects from drawSkillFx, and arrows in flight from drawProjectile and drawShotArrows. The HUD and UI stay above the world, as they are now. Do not change effect timing, positions, scale or game logic: only the draw order.

The Accept check must fail on today's code. Put a checker in tools/checks/ that renders frames headlessly with at least one monster under an active hit effect, records the order of canvas draw calls, and fails if any sprite of an actor or prop is drawn after an effect. Run it next to `npm run verify:quick`.

## Notes
- The game renders with WebGL by default (gl-renderer.js); `?renderer=2d` is the fallback. The fix and the checker must cover both paths. In GL mode draw calls are queued and sent in present(), so record the queue order, not only 2D drawImage calls.
- The world draws sprites through a cached static layer plus a "moving region" redraw (the `region`/`direct`/`full` composite modes in render()). Check that effects end up above sprites in every mode, including the cached-region one.
- Effects drawn from inside drawEnemy / drawHunter / drawDecoration (sheet calls, hit flashes, spell-charge) count as effects and must move to the top pass too.
- A previous run of this card was cut off after planning; its plan only tested the 2D path. Plan again.
