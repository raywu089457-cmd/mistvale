# T60: 箭的飛行特效:疾風箭雨專用綠色箭表 + 殘影

Status: done
Accept: npm run verify:quick

## Goal
Make arrows in flight easier to see and make the 疾風箭雨 (gale) arrows read as a skill, using a pixelfx sheet plus afterimages. Visual parameters are already decided, implement them as given:

1. Export a new sheet (pixelfx checkout is at C:/Users/ray/pixelfx, the script already knows it):
   `node pipeline/scripts/pixelfx/export-sheet.mjs --opts '{"palette":["#1f5a2a","#3f9a3c","#c8f0a0","#ffffff"],"wind":"#f4ffd8"}' projectiles/arrow gale-arrow`
   → assets/vfx-sheets/gale-arrow.{png,json} (green fletching, cream wind streaks; same 112x32 frame and pivot as arrow).
2. src/pixel-world.js, function drawShotArrows (the loop over state.shots with kind 'arrow'):
   - shots with `fx === 'gale'` draw sheet 'gale-arrow' instead of 'arrow'; if drawVfxSheet returns false (sheet missing) fall back to 'arrow'. Same size (ARROW_VFX_K*2.7*s) and rotation as now.
   - afterimages: before drawing the arrow itself, draw the same sheet at earlier points along its path. Gale arrows: 3 ghosts, spacing 0.35 world units back along the shot's direction (-dx,-dz normalised), alpha 0.45 / 0.28 / 0.14. Other arrows: 2 ghosts, spacing 0.3, alpha 0.3 / 0.15. Each ghost uses the drop/height that the shot had at that earlier travel distance (same formula as the arrow, with travel reduced by the spacing; clamp travel at 0, and skip a ghost whose travel would be < 0 so ghosts never appear behind the bow).
3. src/pixel-world.js, function drawProjectile, the `e.type==='arrow'` branch that draws drawVfxSheet('arrow',...) along the curve `at(u)`: add 2 ghosts at `at(u-0.08)` and `at(u-0.16)` (skip if <0), alpha 0.3 / 0.15, same rotation, drawn before the arrow.
4. pipeline/ASSETS.md: add a `gale-arrow.png / .json` row to the pixelfx table (source: pixelfx projectiles/arrow upstream, recoloured; 112x32, pivot [92,16], 18 frames loop; used for 疾風箭雨 arrows in drawShotArrows with 3 afterimages) and the export command to the re-export block.

Do not change game logic (src/pixel-game.js), hit timing, arrow speed or sizes. Do not touch src/pixel-style.css or src/pixel-ui.js.
