# T17: study The Mana World character + equipment animation design (read-only report)

Status: done
Tier: pi
Context: `docs/ARCHITECTURE.md` (file map). Read only the files listed below; do not explore the mistvale repo. This is a read-only research card: you write one report file and change nothing else.

> Task card for pi. Do the steps in order and do not widen the scope. Run every command in the foreground. When finished, write the result to `output/pi-results/T17.md` in English.
> The dispatcher is the only one that edits `Status:`. Never edit this card; all output goes to the result file.

## Goal
A report `output/tmw-anim-study.md` that explains how The Mana World (TMW, open-source MMO) builds layered character + equipment animation from sprite sheets and XML, and lists concrete ideas mistvale could adopt, each tied to a mistvale spec file.

## Source (read-only, outside this repo)
TMW client data root: `C:\Users\ray\open-mmo\tmw\tmwa-client-data`
- `graphics/sprites/model/male.xml`, `female.xml`, `base.xml`, `base2.xml` — the shared action/direction/frame model that body and equipment sheets include
- `graphics/sprites/races/human-male.xml` + `.png`
- `graphics/sprites/equipment/` — sample 2 files per sub-folder (chest, head, legs, feet, hands, weapons, shields, amulets); read the XML and check PNG width/height with a node or python one-liner
- `graphics/sprites/hairstyles/` — 2 samples
- `equipmentslots.xml`, `equipmentwindow.xml`, `weapons.xml`, `itemcolors.xml`, `paths.xml`; `items/` — grep 3 item entries that reference equipment sprites
- `graphics/sprites/monsters/` — 2 sample XMLs

## mistvale files to compare against (read only)
`sprites/ANIMATION_SPEC.md`, `sprites/EQUIPMENT_SPEC.md`, `sprites/WEAPON_SPEC.md`, `sprites/BASE_BODY_SPEC.md`

## Files you may change
- `output/tmw-anim-study.md` (create)
- `output/pi-results/T17.md` (create)

## Steps
1. Read the TMW files above. Record: frame size, directions (count + order), action list (stand/walk/attack/dead/sit...), frames per action, per-frame delay (ms), offsets / `variants` / `variant_offset`, how `<include>` shares one model across body + every equipment layer, draw/layer order by slot, recolor/dye system (itemcolors, `|` dye strings), how weapon type picks the attack action (weapons.xml), hair/race handling.
2. Count XML and PNG files per sub-folder of `graphics/sprites/equipment`.
3. Read the 4 mistvale spec files.
4. Write `output/tmw-anim-study.md` with exactly these `##` sections: `Sheet format`, `Action and direction model`, `Timing`, `Layering and slots`, `Recolor and variants`, `Weapon-driven actions`, `Monsters`, `Comparison with mistvale`, `Recommendations`. Quote real numbers and file paths for every claim. `Recommendations` = 5–10 numbered items, each naming which mistvale spec file it would change and an effort guess (S/M/L).

## Acceptance (all must pass)
- `node -e "const t=require('fs').readFileSync('output/tmw-anim-study.md','utf8');const s=['Sheet format','Action and direction model','Timing','Layering and slots','Recolor and variants','Weapon-driven actions','Monsters','Comparison with mistvale','Recommendations'];const m=s.filter(x=>!t.includes('## '+x));if(m.length){console.error('missing',m);process.exit(1)}console.log('ok')"`
- You changed nothing under `src/`, `sprites/`, `assets/`.

## Report (write to output/pi-results/T17.md, at most 15 lines)
- Verdict on line 1: `DONE` / `BLOCKED` / `FAILED`
- Files created
- The 3 most important recommendations, one line each
- Problems hit, or "none"

## Do not
- Change anything under `src/`, `sprites/`, `assets/`, or the TMW folder.
- Copy TMW art into mistvale (license differs). Describe, do not copy.
- Commit or push.
- Keep going after the same check fails twice: stop and report.
