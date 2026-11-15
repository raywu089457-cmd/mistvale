# PIXELFX → MISTVALE: character / monster / equipment presentation + iso effects

Agent-facing spec (English). User-facing summary in Traditional Chinese at the end.
Lead owns this file; teammates must not edit it — ask the Lead instead.

## 0. Why

User request (2026-11-12): read the production techniques in
`C:\Users\ray\Desktop\Claude code\pixelfx`, use them to replace how Mistvale presents
**characters, monsters and equipment animation**, and wire the **already-authored iso effects**
into gameplay at moments the Lead chooses. Use the **iso rewrites**, not the upstream
side-view originals — except for effects that have no iso-perspective problem (projectiles in
flight, pure screen-space flashes).

Two donor techniques are in scope:

1. **Rig characters** (`pixelfx` `src/core/rig.js` + `tools/character-*.mjs`): a real 3-D
   skeleton rasterised to pixel spans, with material layers (skin / hair / garment / boots /
   cloak / weapon), per-part capture, whole-figure `yaw`, and pose keyframes authored as
   *state deltas* (`feet/hands/fx/fy/fbx/fby/crouch/lean/turn/yaw/two`). One pose set works for
   every direction, so 8 directions cost no extra authoring.
2. **Acting** (`pixelfx` `src/core/act.js` + `docs/AUTHORING.md`): poses keyed on a timeline with
   anticipation → snap → contact → recovery, `"snap"`/`"out"`/`"in"` interpolation tags, limb
   stepping at 12 fps while the feet stay smooth, and hit records
   (`{t, stop, shake, amp, push, flash, skin, shiver}`) that freeze everything, shake the camera,
   push the target, flash it or tint it.

## 1. Division of labour / write scopes

| Owner | Writes |
| --- | --- |
| `rig-heroes` | `pipeline/scripts/pixelfx/character/**` except `gear/*.js`, `assets/heroes/**`, `output/pixelfx-character/**`, `tools/checks/pixelfx-hero-*.mjs`, `pipeline/scripts/check/audit_hero_sheet.py` |
| `gear-classes` | `pipeline/scripts/pixelfx/character/gear/*.js` (does **not** edit `core/**` or `export-*.mjs`) |
| `iso-vfx` | `assets/vfx-sheets/**`, `pipeline/scripts/pixelfx/vendor/**`, `src/pixel-world.js` (VFX region only), `src/pixel-game.js` (effect durations only), `tools/checks/vfx-*.mjs`, `tools/checks/*-iso.mjs`, `output/*/` montages |
| Lead | `docs/PIXELFX-PRESENTATION.md`, `build.mjs`, final integration + verification |

Rules that apply to everyone:

- **Never `git add -A` / `git add .`.** Stage nothing; the Lead commits if the user asks. Do not
  push.
- Two agents must never edit the same file at the same time. If you need a change outside your
  scope, message the Lead.
- JSON/JS files you write must be **UTF-8 without BOM**; run `node --check` (CommonJS) or
  `node --input-type=module --check` on files you edit.
- Verify with the commands in §6; `npm run verify:quick` takes ~2 min and is the Lead's job at
  integration points (message the Lead when your slice is ready for it).
- Keep old art: when swapping a shipped asset, move the previous files to
  `assets/heroes/legacy/` (do not delete).

## 2. Hero sheet contract (renderer is already built — art drops in)

`build.mjs` inlines every `assets/heroes/*.json` (not `-fx`, not `@`) as
`PIXEL_ASSETS.heroSheets[id] = {img, meta}`, optionally `<id>-fx.*` and `<id>@2x.*`.
`ensureHeroSheets()` preloads all of them at boot, so **a new sheet is a drop-in**: no code edit.

Hard numbers the renderer assumes (`src/pixel-world.js`):

- `cell: 100`, `footFromBottom: 8` (feet row = `cell - footFromBottom`), `heroHeight` = standing
  art height in px (current heroes 64–90; archer 67). Scale is `k = 21 / heroHeight * scale`
  (`HERO_H = 21` world units), so **a 100 px cell art with heroHeight 67 is ~21 world units tall,
  the same as today's heroes**: author the rig at the size the existing sheet uses.
- Row names, resolved by `actRow` / `dirSuffix` / `leftRow`:
  - `idle`, `walk` (+ `Down/Up/DownRight/UpRight`; down-left / side-left / up-left reuse the
    right-hand rows at runtime — do **not** bake `walkDownLeft`/`walkUpLeft`; they are never
    requested),
  - `attack` + `Down/DownRight/DownLeft/Left/UpLeft/Up/UpRight` (8 rows; missing rows fall back),
  - `skill` (same suffix set; optional — skills may reuse `attack`),
  - `hurt` (4 frames), `death` (8), `victory` (8; optional).
- Row fields: `y`, `cell`, `frames`, `frameTime`, `head`, `release`, `impact`, optional
  `strikeDur[]` (per-frame seconds — this is how act timing is expressed), `windupFrame`,
  `windupFrameTime`, `windupPow`, `noSkip`, `bakedMotion`, `cycle` (walk only; the runtime
  overwrites walk `frameTime` to .125 and deletes `cycle` — do not fight it).
- Timing budget per action (what the runtime already expects): idle 8 × .16, walk 8 × .125,
  attack 8 × .075 with `release` 4 / `impact` 5, hurt 4 × .1, death 8 × .1 (runtime forces .1).
  `strikeDur` must sum to the same total as `frames * frameTime` (it replaces the uniform step).
- Top level: `hero`, `heroHeight`, `footFromBottom`, `cell`, `palette` (every colour used),
  `groups{outfit:[…],metal:[…]}` (palette indices recoloured by the armor/weapon booleans),
  `actions{}`, optional `parts[]`, `source` (e.g. `pixelfx rig 2026-11-12`).

### 2.1 Act timing authored into the sheet (the point of the whole exercise)

Do **not** emit 8 evenly spaced poses. Author the attack as a pixelfx act and bake it:

- 2–3 frames of anticipation (weight back, weapon cocked, `crouch` up, `lean` back),
- 1 frame of the strike itself (weapon at the contact point, body committed),
- 1–2 frames of contact hold/recoil (the hit frame — this is `impact`),
- the rest as follow-through + return to stand.
Put the per-frame seconds in `strikeDur` so the strike frame lasts one tick and the anticipation
and recovery last longer. `impact` must be the frame where the weapon reaches the target, and
`release` the frame the swing starts. The runtime inserts `HIT_STOP` (.07 s) at
`impact - release` frames and freezes on the contact frame, so the snap reads.

## 3. Equipment: weapon + armor as part sheets

`meta.parts = [{id, sheet, shadow:false} …]` is already implemented (see the paladin and
basebody sheets). Contract that matters:

- Parts are drawn **after** the body, in **array order**, using the **body's** action key
  (`attackDown` etc.), so every part sheet must carry **every row the body carries**, with the
  same `frames`, `cell: 100`, `y` and `heroHeight`.
- The part cell is squeezed into the body's `dw × dh` box, so the part must be drawn in the same
  100 px cell with the same pivot. Then `offset` is simply `[0,0]` for every frame (the rig
  already places the weapon exactly where it belongs).
- `offset` is in the part's own art px, y downward, measured from the cell's top-left.
- LOD: `<id>@2x.png|.json` is used when the body uses its `@2x`; both LODs must exist or neither.

Per class, ship:

| sheet | content | when drawn |
| --- | --- | --- |
| `<class>.png/.json` | body + garment + hair (no weapon) | always |
| `<class>-weapon.png/.json` | weapon only, in hand | always (class default weapon) |
| `<class>-weapon-fine.png/.json` | same pose, fine/steel/gold palette | `h.equipment.weapon` |
| `<class>-armor.png/.json` | pauldrons / chest plate / greaves / helmet overlay | `h.equipment.armor` |

The runtime swap needs one small hook (Lead or the pixel-world owner adds it):
`heroLook()` gains `weapon: h.equipment?.weapon ? 'fine' : ''`, `armor: !!h.equipment?.armor`,
and the parts loop picks `part.sheet + suffix` when that sheet exists.

`groups.outfit` / `groups.metal` keep working on the body palette for the existing rarity
recolours; keep the body's metal tones in `groups.metal`.

## 4. Iso effects: what to wire and when (Lead's decisions)

The donor has 48 `*-iso.js` rewrites. Export them with `pipeline/scripts/pixelfx/export-sheet.mjs`
(`--dir "C:\Users\ray\Desktop\Claude code\pixelfx"`; the tool's default dir is stale) into
`assets/vfx-sheets/<name>.{png,json}`. Naming: keep the donor id (`blade-hit-iso`,
`hit-spark-iso`, …) so the provenance is obvious.

**All `*-iso` sheets play at 1.0× (`VFX_SPEED_BY_SHEET`), never the 0.6× legacy factor** — the
iso rewrites are authored at game speed, same as `cinder-cyclone-iso`. Their scale must be
judged in hero heights (`heroArt(class) * k`), tuned within ±15 %, and stated in the result.

### 4.1 Moment map (priority 1 = this pass)

| # | Moment (where) | Today | New iso sheet | Trigger / notes |
| --- | --- | --- | --- | --- |
| 1 | Hero melee basic hit lands (berserker / paladin / assassin) | `hit-spark`, `crit-hit` | `blade-hit-iso` | at the monster's feet/chest, rotated to the swing direction, k ≈ .5 hero |
| 2 | Crit (hit-feel crit path) | `crit-hit` + `crit-spray` | `blade-hit-iso` ×1.35 + white flash | heavier hit-stop (.10 not .07), shake 2.5 |
| 3 | Any ranged impact (arrow, fireball, monster shot landing) | `hit-spark` | `hit-spark-iso` | at impact point, k ≈ .4 hero |
| 4 | Berserker skill 旋風斬 (aoe) | `fx:'slash'` | `whirlwind-iso` | centred on the hero, k ≈ 1.6 hero, full duration |
| 5 | Paladin skill 聖盾祈禱 (heal) | `fx:'holy'` | `divine-shield-iso` | on each healed hunter |
| 6 | Skill cast wind-up (`lock`/`release` on the sorcerer skill) | `spell-charge` | `magic-circle-cast-iso` | under the caster from cast start for exactly the lock duration |
| 7 | Assassin skill 暗影衝刺 | `fx:'slash'` | `dagger-flurry-iso` at the target + `warp-iso` (shadow palette) at the dash origin | palette `['#2a1533','#5b2b6e','#9a6ec4']` |
| 8 | Priest skill 暗癒禱言 (ally heal) | `fx:'holy'` | `heal-aoe-iso` | on the healed hunter, replaces `priest-heal` |
| 9 | Monster melee hit on a hunter | `hit-spark` | `hit-spark-iso` (red palette) | victim's feet |
| 10 | Heavy monster slam (boss `treant`, `boulder`, `yeti`) | — | `ground-slam-iso` | at the monster's impact point, shake 3 |
| 11 | Monster death | — | `soul-rise-iso` | on the corpse, starts with the death row |
| 12 | Hunter death | — | `soul-rise-iso` | on the hunter |
| 13 | Loot drop / coin pile spawn | — | `coin-drop-iso` | at the corpse, magnet toward the hunter (donor feature) |
| 14 | Dungeon door enter / exit | — | `portal-iso` | on the door tile |

### 4.2 Moment map (priority 2 = if time allows)

| # | Moment | New iso sheet |
| --- | --- | --- |
| 15 | Ice-zone monsters (snowman / yeti / icebeetle) attack burst | `frost-nova-iso` |
| 16 | Ice-zone spawn / ambush | `ice-spikes-iso` |
| 17 | Fire-zone / sorcerer area attack | `fire-ring-iso` |
| 18 | Kobold / shaman cast telegraph before the hit lands | `lightning-strike-iso` |
| 19 | Enemy ranged shot in flight (symmetric projectiles) | `magic-missile-iso` |
| 20 | Enhance / forge success, level up | `rune-circle-iso` or `holy-pillar-iso` |
| 21 | Slow/freeze debuff on a hunter | `freeze-iso` |

Keep as-is (no iso rewrite needed, document why in the result):
arrows and gale arrows (projectiles seen from any angle), `fireball` (a sphere), screen-space
flashes, UI/screen effects. `thorns`/`root-snare`/`leaf-storm` have a mild ground-perspective
problem but the donor has no iso nature rewrite — keep them and note it.

### 4.3 Wiring rules

- Export with the donor's own opts (no palette) unless the moment asks for one; palette
  overrides use the effect's `o.palette`.
- `drawVfxSheet(id, age, x, y, k, {rot, alpha, rate, flip})` plays any sheet; effect lifetime
  must cover the full sheet (`frames / fps` seconds; see the cinder precedent: 157 frames @30 =
  5.23 s → 6.0 s lifetime).
- Add the id to `VFX_SPEED_BY_SHEET` at 1.0 and keep the 0.6 default for the legacy sheets.
- Where an effect needs to follow a moving target (heal on an ally), spawn it attached to the
  target's `hitAt`, not at the caster.
- Number the effects with the existing `e.type === 'vfxsheet'` path; do not invent a second
  playback system.
- Every new moment needs a checker under `tools/checks/` that fails if the sheet is not drawn at
  the moment, at the expected scale, and removed after its lifetime (see
  `tools/checks/cinder-full-speed.mjs` for the pattern), plus an in-game montage under
  `output/<topic>/`.

## 5. Monsters: what "technique" means for them

The rig cannot draw the 22 monster sheets (they are not humanoids), so the art stays; the
**presentation** is upgraded to the donor's acting rules:

- Read the attack as anticipation → contact → recovery: the wind-up frames compress/squash the
  body, the contact frame freezes (`HIT_STOP`, extended for the boss), the target reacts
  (push back 2–3 world px, white flash, shiver), the corpse sinks and a `soul-rise-iso` plays.
- The damage frame must be the sheet's contact frame: `pixel-world.js` hardcodes strike frame
  index 4 for monsters (`monsterSheetPose`); the monster json `release`/`impact` are decorative
  today. Keep the hardcoded index but make the timing table match it, or read `impact` if the
  Lead approves that edit.
- Monster ranged attack = telegraph (0.3–0.4 s) → projectile → `hit-spark-iso` on landing.
- Owned by the Lead / the pixel-world owner after `iso-vfx` lands its slice (same file).

## 6. Verification

- Pipeline/art: node exporters must print their output; visual checks via a montage PNG
  (`output/pixelfx-character/<class>/compare.png`, 6× zoom, labelled frames, and next to the
  current shipped sheet).
- Sheet validator: `python pipeline/scripts/check/audit_hero_sheet.py` (update its rules only
  where a rig sheet legitimately differs — e.g. palette size — and say so in the result).
- Game: `npm run build`, then `npm test`; Playwright checkers under `tools/checks/`;
  `npm run verify:quick` at integration; in-game screenshots (`node click`-driven montage like
  `pipeline/scripts/ui-audit/mage-attack-montage.mjs`).
- Report format (per agent, in the final message): files written, commands run + first failing
  line if any, numbers (scale k, frame counts, durations), and anything the Lead must decide.

## 7. 中文摘要（給使用者）

- 角色改用 pixelfx 原廠的骨架程式（`stockbody.mjs` 照搬原廠 `paint()`、分區色階表）產生，但外型是我們自己設計的職業造型（`costume.mjs`：分區表＋色階＋毛皮/盔脊/帽簷/面罩/箭袋/聖帶等自繪幾何層）：狂戰士裸上身手交叉皮帶＋毛皮披、聖騎士深鋼甲＋象牙罩袍＋金邊、魔法師寬簷尖帽＋紫長袍、弓箭手青綠兜帽＋箭袋、刺客面罩＋石板紫腰帶、祭司金冠＋深紅聖帶；同一套姿勢可以轉 8 個方向，攻擊有「預備→出手→命中停格→收回」的節奏，命中幀會觸發停格與震動；每格 100px、腳底對齊、28 列、@2x 高清層齊備。
- 裝備變成獨立圖層：武器、護甲各一張零件表，換裝備＝換那張表；+N 武器換成精製配色（普通木弓 → 精良鋼弓），穿鎧甲是同一剪影換鋼色，不是加幾何零件。
- 已做好的 iso 特效匯入 17 張（地面 2:1、立體拋物線、1 效果像素＝1 英雄像素），按表接在 18 個時機：近戰命中、爆擊、旋風斬、聖盾、施法法陣、暗影衝刺、治療、怪物重擊、死亡升魂、掉寶、傳送門等。
- 怪物不換美術（骨架畫不出非人形），但攻擊改用原本沒用到的 8 向攻擊列、命中幀由 sheet 的 `release/impact` 決定、加預備動作、被打的染色+後推+抖動、首領重擊畫面震動。

## 8. Shipped state (living section — update when a slice lands)

### 8.1 Iso effects — DONE (2026-11-12)
- 17 sheets exported into `assets/vfx-sheets/` from the Desktop donor checkout
  (`export-sheet.mjs --dir "C:/Users/ray/Desktop/Claude code/pixelfx" <cat>/<id>-iso <name>`,
  never `--actor`): blade-hit-heavy-iso, blade-hit-iso, hit-spark-iso, great-slash-iso,
  dagger-flurry-iso, whirlwind-iso, warp-iso, divine-shield-iso, heal-aoe-iso,
  magic-circle-cast-iso, smite-iso, ground-slam-iso, frost-nova-iso, soul-rise-iso,
  coin-drop-iso, portal-iso, cinder-cyclone-iso (re-exported at the current 272x320 / 157 f;
  2026-11-15 merge: replaced by the HeroLoom-restyled 240x400 / 157 f sheet from experiment/heroloom,
  see docs/HEROLOOM-PIXELFX.md — the sheet is meta-driven, so no code change).
- Wiring lives in `src/pixel-world.js` (`ISO_FX` table + `drawIso`, `VFX_SPEED_BY_SHEET` = 1.0 for
  every `*-iso`) and in `src/pixel-game.js` (`isoEffect()` helper + per-moment calls); combat maths
  untouched. 18 moments wired; table, anchors, k values and caveats are in
  `output/vfx-iso/README.md`; in-game evidence `output/vfx-iso/moments.png`; checker
  `tools/checks/vfx-iso.mjs`.
- Left on side-view art on purpose: arrows / gale-arrow (any-angle projectile), fireball +
  fireball-blast (sphere, keeps `frost-nova-iso` underneath), leaf-storm (no iso nature rewrite),
  priest basic heal, hero-atlas class fx cells, `spell-charge` (fallback), procedural/atlas
  effects and damage numbers.

### 8.2 Hero sheets — DONE (updated 2026-11-13: own costumes per user instruction m01049)
- Rendering is still the donor's OWN renderer (`stockbody.mjs` reproduces donor `paint()`:
  part→region→`P(shell4, core3)` ramp, ink outline, 100 px cell, 28 rows). What changed after the
  user's second directive — 「不要模仿原本像素風的裝飾，自己創一套符合該職業的樣子」 — is the
  OUTFIT layer: `costume.mjs` holds a per-class part→region table, per-class ramps and extra
  geometry layers drawn through the rig depth pass (fur mantle, helm ridge + visor, pauldrons,
  shield, hat brim/cone, hood point, cowl, chest strap, quiver + fletching, face mask, sash tail,
  circlet, stole, rope belt, sleeve rims). Geometry is emitted as tone codes resolved by the same
  ramps, so it costs no extra colours.
- Each class now wears a bespoke costume (not a donor recolour): berserker bare chest + crossed
  harness + fur mantle + war paint + wrapped shins; paladin dark-steel plate + ivory surcoat panel +
  gold ridge/trim/cross + kite shield; sorcerer wide violet brim + short cone crown + trimmed robe
  + orb staff; archer dark leather-green tunic + teal hood point/cowl/bracers + visible quiver;
  assassin slate hood + lower-face mask with an eye band + slate-violet sash + light wraps +
  twin daggers; priest ivory hooded robe + gold circlet in front of the hood + crimson stole with a
  gold leaf + rope belt + halo staff.
- Runner `export-heroes.mjs` (COSTUME mode default; `--donor` renders the old stock look for
  comparison, `--fork` keeps the earlier hand-authored experiment).
- Installed per class in `assets/heroes/`: `<class>.{png,json}`, `<class>@2x.*`, `<class>-weapon`
  (+`@2x`), `<class>-weapon-fine` (+`@2x`), `<class>-armor` (+`@2x`) — 900x2800, cell 100,
  `footFromBottom` 8, `heroHeight` 71–72, 28 rows, `groups.outfit` non-empty,
  `meta.parts=[{id:'weapon',sheet:'<class>-weapon',shadow:false}]`; armour bodies are weaponless
  so the weapon part still draws with armour on.
- Scales / heroHeight from the scale solver: archer 1.894/72, berserker 1.947/71, paladin 1.913/71,
  sorcerer 1.884/72 (hat capped at the crown so the body stays in the same band — an earlier 6 px
  cone made the sorcerer body ~15 % smaller), assassin 2.028/72, priest 1.894/72.
- Audit `python pipeline/scripts/check/audit_hero_sheet.py archer berserker paladin sorcerer assassin priest`
  PASS (13–16 colours/cell, outline 1.0, isolated 0.0, height 71–72, feet row 92, four_dir mirrors);
  `--checkparts` 0 px offsets. The audit gained `WARN_VARIANTS = ('-weapon','-weapon-fine','-armor','-body')`
  so paperdoll layers are not audited as full heroes, skips `@`-named LOD twins in the default list,
  and skips same-source (rig) pairs in the silhouette-IoU rule while still comparing against the
  legacy AI sheets.
- Montages `output/pixelfx-heroes/{lineup.png, lineup-ingame.png}`, design sheet
  `output/pixelfx-heroes/costumes/{design-lineup.png, donor-vs-ours.png}`.
- Honest gap: the rig craft is the donor's flatter renderer. Six identities, faces and value
  contrast read at 1x/2x, but the replaced AI art was more detailed; per the user's directives no
  hand-authored detail was added outside the costume geometry. The AI originals live in
  `assets/heroes/legacy/` and can be restored by copying them back.

### 8.3 Monsters — DONE (2026-11-12, presentation pass, no art change)
- `src/pixel-world.js`: `monsterAttack()` reads the sheet's `actions.attack` row through
  `dirSuffix`; strike frame = `release + floor(at/frameTime)` (was hardcoded 4); the 7 previously
  unused directional attack rows are now used (`drawEnemy` no longer forces `vdir='side'`);
  wind-up telegraph (lean, boss `.55` / heavy `.42` / normal `.3` s), contact-frame freeze, hit
  reaction (species tint + 2.5 px push-back + 3-frame shiver), boss screen shake `5.5/320 ms`,
  ranged monsters paint `magic-circle-cast-iso` during their wind-up (k `.45`).
- `src/pixel-game.js`: monster melee damage now deferred through `pendingHits` to the sheet's
  impact frame (`monsterHitDelay()` ≈ 0.075 s); attack cadence, ranges and damage maths unchanged.
- Checker `tools/checks/monster-presentation.mjs` PASS (22 sheets, 8-dir rows + treant fallback,
  strike maths, 1.7x heavy hold, impact-frame damage/flash, ground-slam-iso on boulder/boss,
  cast circle for all 7 ranged). Montage `output/monster-presentation/moments.png`,
  timing table in `output/monster-presentation/README.md`.
- `combatPose` now treats ranged monsters as "engaged for wind-up"
  (`rangedFoe = isEnemy && !!MONSTER_RANGED[type]`): before this fix they always ran with
  `engaged=false`, so their wind-up pose and the cast-circle telegraph never drew.
- 怪物不換美術（骨架畫不出非人形），改用同樣的節奏與特效呈現。

### 8.4 Equipment — DONE (2026-11-12, runtime swap)
- Body sheet without the baked weapon + `<class>-weapon` / `<class>-weapon-fine` part sheets +
  `<class>-armor` body variant. `heroLook()` now returns `{bodySheet, weapon}` from
  `equipment.armor` / `equipment.weapon` instead of the old palette tint; `sheetFor` /
  `sheetFrame` thread the look (LOD hysteresis + variant cache keyed by the resolved body id);
  the parts loop in `drawSheetHero` reads the resolved body's `meta.parts` and swaps
  `part.id==='weapon'` to the fine sheet; missing sheet → skip + one `console.warn`.
  Debug hook `window.__mistvaleGear()`. Checker `tools/checks/gear-swap.mjs` PASS.
  Montage `output/gear-swap/moments.png` (未裝備 / 武器(普通) / 武器(精良) / 鎧甲 /
  武器+鎧甲 / 戰鬥中揮擊); plan+status in `output/gear-swap/PLAN.md`.
- 讀起來的差別：未裝備手上沒弓、普通是木弓、精良是鋼弓、鎧甲是同一套剪影換成鋼色（不是加肩甲），
  待機時弓在箭袋旁比較不明顯，攻擊/拉弓那一格最清楚。

### 8.5 Paperdoll six-slot equipment — DONE (2026-11-13, now the default hero renderer)

- The layered paperdoll engine that landed in this repo during the same session (`src/paperdoll.js`, `src/paperdoll-hero.js`, `docs/PAPERDOLL.md`) is now the DEFAULT way heroes are drawn; `?doll=0/off/no/sheet/none` goes back to the baked hero sheets (and to the 8.4 part-sheet equipment path).
- The art pack under `assets/paperdoll-classes/` is generated from the same pixelfx rig as 8.2 (`pipeline/scripts/pixelfx/character/doll-pack.mjs`): six classes x `body/hand/head/weapon` + six independently wearable gear layers `helm/chest/belt/legs/boots/gloves`, eight true yaw directions, per-weapon action rows (`attack.bow/greatsword/sword/staff/dagger`). Deterministic (identical SHA-256 on re-run).
- Per-class gear identity (task-10): each class has its own helm SILHOUETTE and ramp — berserker iron cap + horns + fur chest, paladin great helm + gold trim + plume and the only full plate, sorcerer pointed cloth hat, archer leather hood + green leather, assassin hood + lower-face mask, priest veil + gold circlet. Costume decoration pixels (sash, harness, stole, quiver) are excluded from every gear layer so the class look stays visible.
- Gameplay is six slots (task-11): `equipment = {weapon, helm, chest, belt, legs, boots, gloves}`, save version 3 accepting v2 (old `armor:true` -> all six true, power preserved), stats sum the pieces, forge auto-buy/craft loops the same RECIPES, UI shows seven rows in the forge card, craft tab and hunter dossier.
- Verification: `tools/checks/doll-classes.mjs`, `tools/checks/doll-default.mjs`, `tools/checks/gear-economy.mjs`, `z2a-hunter.mjs` (65), `z2b-econ.mjs` (272) all PASS; `doll-pack-check.mjs` exit 0; `npm test` exit 0 (`test-paperdoll` 31 tests, paperdoll parity 10080 cases). Full `npm run verify`: Z2B now PASS; the 4 remaining failures are the other agent's unfinished Z1/FIX UI shell (region cards, missing FIX-C fixture, olive confirm variable, crawl rows covered by party-summary), none in the character/equipment/VFX files. Also fixed two stale `buttons.mjs` harness bugs (title screen never dismissed; `offsetParent` null for close buttons inside fixed panels → 299 false click failures).
- Hunter-card ring: the icon atlas has no helm/boot/glove art, so the six armour slots show a one-character glyph (盔/甲/腰/腿/靴/手; dim when empty, bright when worn) instead of six identical shield icons — `src/z2a-hunter.js` `SLOT_GLYPH` + `.z2-glyph` in `src/ui-hv.css`.
- Showcases: `output/doll-classes/equipment.png` (pack-direct matrix: bare / all six / fine weapon / per-weapon attack mid-frame / paladin piece-by-piece / six mixed combos), `output/doll-pack/gear-identity.png` (per-class 4x bare vs six pieces + 1x strip + mixed row), `output/doll-default/lab.png` (the `?doll=1` lab on the real pack), `output/doll-default/default.png` (in-game default).
- Honest gaps: the paperdoll art is flat-shaded (4-rank ramps) so armour reads painted at 4x; the priest's circlet/belt barely change at 1x (41/42 changed px); non-paladin chests are still a broad panel; portraits/UI thumbnails, fall/cheer, diagonal attack/skill/hurt rows and monsters still use sheets.
