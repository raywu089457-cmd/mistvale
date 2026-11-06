# T69: 法師爆炸:擊殺時也在身體中心、蓋過死亡動畫、放大到蓋住怪物

Status: failed
Accept: auto

## Goal
Follow-up to T67 (sorcerer `fireball-blast` impact in `src/pixel-world.js` drawImpact). Visual only; no change to damage or game logic.

1. **Killing blow:** when the basic attack kills the target, the monster leaves `state.enemies` before the delayed impact is drawn. The blast then falls back to the feet with a default size. Fix this by caching the target's body anchor (body-centre offset and size, from its type and ENEMY_SIZE) on the effect when the effect starts or while it is in flight, and use the cache when the monster is gone.
2. **Above the death animation:** the blast must be drawn after the monster's death effect in the same frame, so the dying sprite never covers it.
3. **Bigger:** today the visible explosion covers only about half of a medium monster (the bear in `output/mage-attack/montage.png`). Size it from the art's visible extent, not the whole 300 px frame (about 174 px of it is opaque). The visible blast must be at least 1.2x the monster's sprite width, for small, medium and large monsters including the treant boss. Cap it at 2.2x the medium-monster size so large bosses don't fill the screen.

Accept: extend `tools/checks/mage-attack-fx.mjs` so it fails on today's code. It must check:
- a lethal-hit case where the target has already left state.enemies: the anchor is still in the body box, and the blast is drawn after the death effect;
- the visible blast width against monster width for a small monster, the bear and the treant boss.

Then `npm run verify:quick`. No montage needed.
