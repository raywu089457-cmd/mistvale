# T32: scout — cheapest PixelLab method for frame-aligned equipment layers (no spending)

Status: done
Tier: pi
Type: scout
Context: `docs/ARCHITECTURE.md`. l0veyou was tried twice for equipment layers (T30, T31) and failed review: a single still item image cannot follow the body's animation (shield flattens, items detach in attack). User rule: when l0veyou fails, use PixelLab with the minimum-spend method. This card only RESEARCHES and ESTIMATES — it spends nothing.

> Task card for pi. Do the steps in order and do not widen the scope. Run every command in the foreground. When finished, write the result to `output/pi-results/T32.md` in English.
> The dispatcher is the only one that edits `Status:`. Never edit this card; all output goes to the result file.

## Goal
`output/pixellab-layer-plan.md`: 2–3 candidate PixelLab methods to get frame-aligned equipment layers for the paladin (demo scope: idle, walk, attack of one facing), each with exact call count, credit/cost estimate, expected quality risk, and a recommendation of the cheapest one likely to pass.

## Read (only)
- `C:\Users\ray\.claude\skills\pixellab-assets\SKILL.md` and the scripts it names (headers only)
- `pipeline/scripts/pixellab/` file list + headers of the 3 most relevant scripts
- `sprites/CHANGELOG.md`, `docs/HANDOFF-2026-10-30.md` — grep `pixellab|PixelLab|credit|額度|USD|\$` for past costs per call
- `assets/heroes/paladin.json` (UTF-8): frame counts for idle / walk / attack
- `output/layer-demo/assets/layers/paladin-layers.json` (T28)

## Steps
1. Find the current balance with a read-only call if the skill has one (balance/account endpoint). If not possible without spending, say so.
2. List the available operations (e.g. generate, inpaint/edit, animate with reference, rotate) and their per-call cost from docs or past logs.
3. Candidate methods to evaluate, at minimum:
   A. Inpaint each needed body frame to remove armour → unarmoured base; layer = original minus base (difference mask). Calls = frame count.
   B. Generate ONE side-view item per slot with PixelLab, then animate it with the body frames as reference / skeleton, if the API supports reference-guided animation.
   C. Any cheaper option you find (e.g. edit only key frames and interpolate offsets, or reduce to walk-only).
4. For each: calls, estimated credits and USD, frames covered, risk, and what Claude must judge visually.

## Acceptance
- `output/pixellab-layer-plan.md` exists with sections `## Balance`, `## Operations and cost`, `## Candidates`, `## Recommendation`.
- ZERO generation/edit/animate calls made (only docs, logs, and at most one read-only balance call).
- Nothing under `src/`, `assets/`, `sprites/` changed. No npm test / verify.

## Report (write to output/pi-results/T32.md, at most 15 lines)
- Verdict line 1; balance (or unknown); one line per candidate with calls + cost; recommendation.

## Do not
- Spend any PixelLab credits. Commit or push.
