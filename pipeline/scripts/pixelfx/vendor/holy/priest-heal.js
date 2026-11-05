// The priest's heal on an ally: upstream holy/heal (petals under the feet, a hoop of light rising up the body,
// motes popping into hearts) cut at 1.4 s. The game keeps a heal effect for ~1.4 s after it lands, and the
// hearts are already up by then; the game fades the last stretch. heal paints the body itself (it recolours
// the actor's pixels), so the cue hands it the stock actor's outline with no pixels: the hoop still rides
// that outline, but no stand-in body lands in the sheet — the game's own hero sprite is underneath.
import { chain, stockActor } from "../../core/index.js";
import * as heal from "./heal.js";

export const meta = {
  name: "Priest heal",
  desc: "A heal landing on an ally: petals of light bloom under the feet, a hoop of light rises up the body and motes spiral up into tiny hearts — the first 1.4 s of holy/heal.",
  tags: ["holy", "heal", "restore", "buff", "petals", "hearts", "one-shot"],
  size: [80, 104],
  origin: [40, 92],
  duration: 1.4,
  loop: false,
  fps: 30,
  bg: "ground",
  options: { seed: 2 },
};

export const create = chain([{ fx: heal, t: 0, until: 1.4, actor: { ...stockActor(2), pixels: null } }]);
