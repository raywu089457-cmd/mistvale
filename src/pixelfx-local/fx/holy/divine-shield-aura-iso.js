// Divine shield that follows its unit (Mistvale-local): holy/divine-shield-iso's bubble, held for exactly as long as
// the unit's shield buff lasts. The game (pixel-world syncLiveFx) keeps one on every unit whose `buffs.shield` is up,
// moves it with the unit every frame, re-strikes it (`pulse`) when the shield is cast again and bursts it
// (`release`) when the buff runs out or the unit falls. See ./_shield.js for the look.
import { GOLD } from "../../../pixelfx/fx/holy/_lib.js";
import { createShield, RELEASE_TIME } from "./_shield.js";

export const meta = {
  name: "Divine shield aura (iso, follows)",
  desc: "holy/divine-shield-iso's gold bubble on a unit for as long as its shield buff lasts: grows up out of a seal round the feet, turns like a slow globe while it holds, flares when re-cast, bursts from the top down when released.",
  tags: ["holy", "shield", "bubble", "barrier", "buff", "character", "loop", "follow", "iso", "top-down"],
  size: [96, 104],
  origin: [48, 76],
  duration: 2.4,
  loop: true,
  release: RELEASE_TIME,
  fps: 30,
  bg: "ground",
  actor: 2,
  pixels: 1,
  options: { palette: GOLD, radius: 29, delay: 0, seed: 8, release: false, pulse: 0 },
};

export function create(o) {
  const S = createShield(o);
  return {
    update(dt) { S.update(dt); },
    drawBack(p) { S.back(p); },
    draw(p) { S.front(p); },
  };
}
