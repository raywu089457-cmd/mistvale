// The priest's basic attack: upstream holy/smite cut to what one hit needs. The glint marks the spot at 0.42 s,
// the hammer of light lands at 0.54 s (the game lines that frame up with the hit), then the flash, shockwave,
// chips and glowing cracks. Smite keeps 2.8 s of cooling cracks; the priest attacks again well before that,
// so this stops at 1.3 s and the game fades the last stretch.
import { chain } from "../../core/index.js";
import * as smite from "../holy/smite.js";

export const meta = {
  name: "Holy hit",
  desc: "A priest's smite as a hit: a glint on the target, a hammer of light dropping onto it, a white flash and a shockwave of chips and glowing cracks — the first 1.3 s of holy/smite.",
  tags: ["impact", "holy", "smite", "light", "hit", "one-shot"],
  size: [224, 176],
  origin: [112, 148],
  duration: 1.3,
  loop: false,
  fps: 30,
  bg: "ground",
  options: { seed: 9 },
};

export const create = chain([{ fx: smite, t: 0, until: 1.3 }]);
