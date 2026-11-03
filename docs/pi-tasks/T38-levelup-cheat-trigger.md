# T38: Developer +10 level cheat triggers the level-up effect

Status: done
Accept: npm test && npm run verify:quick

Context: T35 added the pixelfx level-up pillar for `effect('level', h)`. T35's result says the developer cheat 全員 +10 級 only sets `h.level` and never calls `effect('level', h)`, so the pillar does not play from the cheat menu.

## Goal
Pressing the developer cheat 全員 +10 級 plays the level-up effect on every hunter it levels, the same way `gainXp` does.

## Files you may change
- `src/pixel-game.js` (only the handler for the 全員 +10 級 cheat; find it by grepping `+10` / `全員`)

## Steps
1. In that handler, call `effect('level', h)` once per hunter it levels, using the same call shape as `gainXp`. Change no level, XP or stat logic.
2. Check with a real click: start `node server.mjs`, open the game at 1280x800, open the developer menu, click 全員 +10 級, and screenshot 0.7 s later to `output/pixelfx-preview/levelup-shots/cheat-click.png`. Stop the server. The pillar must be visible on the hunters without any harness-emitted effect.
