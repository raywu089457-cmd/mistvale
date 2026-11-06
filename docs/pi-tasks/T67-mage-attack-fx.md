# T67: 法師普攻:集氣特效 + 命中爆炸蓋住怪物

Status: failed
Accept: auto

## Goal
Two visual changes to the sorcerer's basic attack, in `src/pixel-world.js` only. No damage or timing logic changes.

1. **Charge before the cast:** every sorcerer basic attack shows the `spell-charge` sheet at the staff during the windup, before the `fireball` leaves. Today it is gated (the sorcerer windup branch, `quality`, `fxInSprite` in chargeGlow) and players don't see it on normal attacks. It must show on every basic attack, auto-hunt included, on both renderers. Skills that already have their own cast effect (火龍捲 / cinder-cyclone) stay as they are.
2. **Explosion covers the monster:** the `fireball-blast` impact on hit is drawn above the monster sprite and covers its body. Anchor it at the monster's body center (mid-height of that monster's sprite, scaled by its size), not at its feet. Scale it so the blast is at least as wide as the monster. Keep it in the top effect pass from T61, so the monster sprite never covers it.

Accept: a checker in `tools/checks/` that fails on today's code. It checks:
- the spell-charge sheet is drawn during a basic-attack windup;
- the fireball-blast is drawn after the target's sprite in the same frame;
- its anchor y is within the monster's body box, not at its feet.

Then `npm run verify:quick`. Last, write an in-game montage to `output/mage-attack/montage.png` (at most 2000 px on its long side, frames labeled with game time). It shows one basic attack from windup to the end of the blast on a medium monster, at least 8 frames, with the game paused and stepped with simulate(.07).
