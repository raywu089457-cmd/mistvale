// Steel arc (Mistvale-local): 弧光斬, the berserker's first move when his weapon is a sword (劍; 2026-11-24 it took
// over the 旋風斬 slot). The same cut as melee/holy-arc-iso (a 150-degree crescent at waist height, cut in 0.1 s,
// held at full light ~0.22 s, its floor streak and tip glint, back/front depth split) but forged rather than holy:
//   - the crescent is steel: a white-hot rim over a cold steel-white body, running into red-orange heat at its inner
//     edge and tail;
//   - the floor streak is a scorched red-orange line instead of gold;
//   - it throws hot sparks and embers as it fades instead of holy stars.
// `reach` is the skill radius in px (pixel-world turns the skill's 2.6 world units into it), `span` its arc in degrees.
import { create as holyArc, meta as holyMeta } from "./holy-arc-iso.js";

/** Steel and forge heat: soot, ember red, red-orange, orange, hot steel, steel white, cold white, white. */
export const STEEL_RED = ["#2a1416", "#5a1e1a", "#a8301e", "#e0482a", "#ff7a3c", "#e8ecf2", "#f6f8fc", "#ffffff"];
const STREAK = ["#4a1a16", "#a8301e", "#ff7a3c", "#ffd0a0"];

export const meta = {
  ...holyMeta,
  name: "Steel arc (iso)",
  desc: "A fast, wide steel sword arc at waist height: a white-hot rim over a steel-white crescent bleeding into red-orange heat, cut through 150 degrees in a tenth of a second, a scorched streak on the floor, throwing sparks as it fades.",
  tags: ["melee", "sword", "slash", "arc", "steel", "fire", "aoe", "directional", "one-shot", "iso", "top-down"],
  options: { ...holyMeta.options, palette: STEEL_RED, streak: STREAK, shed: "spark", seed: 11 },
};

export function create(o) { return holyArc({ ...meta.options, ...o }); }
