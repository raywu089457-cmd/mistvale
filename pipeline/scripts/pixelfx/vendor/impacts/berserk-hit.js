// One hit, composed the pixelfx way: three impacts chained so their timing, pivot and floor line up in a
// single sheet instead of being stacked by hand in the game.
//   t 0.00  crit-spray  the smear of the cut and the debris it throws on past the target
//   t 0.16  crit-hit    the star slams in (the game used to start this 0.16 s into the hit)
//   t 0.16  heavy-landing  dust rings rolling off the floor under the target's feet
// Origin is the impact point (chest height); the floor sits at +52 px. Aim is +x (a blow to the right),
// so the caller mirrors the whole sheet for a blow to the left.
import { chain } from "../../core/index.js";
import * as critHit from "./crit-hit.js";
import * as critSpray from "./crit-spray.js";
import * as heavyLanding from "./heavy-landing.js";

const HIT = 0.16, FLOOR = 52;

export const meta = {
  name: "Berserk hit",
  desc: "A berserker's cleave landing: a smear along the cut, sparks and chips thrown on past the target, the crit star slamming in, and dust rings rolling off the floor under it.",
  tags: ["impact", "hit", "crit", "berserk", "sparks", "dust", "directional", "one-shot"],
  size: [260, 180],
  origin: [105, 105],
  duration: 1.0,
  loop: false,
  fps: 30,
  bg: "ground",
  options: { seed: 4 },
};

export const create = chain([
  { fx: critSpray, t: 0 },
  { fx: critHit, t: HIT },
  { fx: heavyLanding, t: HIT, y: FLOOR, until: HIT + 0.5, seed: 9 },
]);
