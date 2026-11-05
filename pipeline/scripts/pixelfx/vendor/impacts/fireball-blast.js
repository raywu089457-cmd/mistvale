// The blast the official `moves/fireball-throw` ends in (explosions/small-explosion), cut to the part a
// hit needs: the flash, the fire, and the first of the smoke. The move keeps 5.4 s of scorch and brands;
// a basic attack fires again in ~1.6 s, so this stops at 1.2 s and the game fades the last stretch.
import { chain } from "../../core/index.js";
import * as boom from "../explosions/small-explosion.js";

export const meta = {
  name: "Fireball blast",
  desc: "A fireball landing: a white flash, shock rings, fire that cools into a smoke column — the first 1.2 s of the fireball-throw blast.",
  tags: ["impact", "fire", "explosion", "projectile", "hit", "one-shot"],
  size: [300, 240],
  origin: [150, 196],
  duration: 1.2,
  loop: false,
  fps: 30,
  bg: "ground",
  options: { seed: 7 },
};

export const create = chain([{ fx: boom, t: 0, until: 1.2 }]);
