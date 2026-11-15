# pixelfx character + equipment systems — inventory and gap map

Read-only survey of the pixelfx library (`C:\Users\ray\Desktop\Claude code\pixelfx`) against what mistvale has
already vendored under `pipeline/scripts/pixelfx/character/`. Every claim below carries the file and line it came
from; paths are relative to each repo root (`pixelfx/…`, `mistvale/…`) unless absolute.

Line counts read in this pass: `pixelfx/src/core/rig.js` 559, `act.js` 486, `poses.js` 24, `actor.js` 117,
`pixelfx/tools/character-4dir.mjs` 139, `character-classes.mjs` 165, `character-anim.mjs` 408,
`character-equipment.mjs` 448, `character-death.mjs` 103, `character-ai-body.mjs` 719, `characters.mjs` 165,
`tools/lib/classes.mjs` 192, `anim.mjs` 163, `gear.mjs` 448, `motion.mjs` 86.

Verdict in one sentence: pixelfx models a character as **a pose object rendered by a 3D rig**, and models
equipment as **two different things** — a weapon is a pose field pointing into a `WEAPONS` geometry table, while
armour is a **per-body-part colour ramp re-emitted as six mask sheets**; there is no slot system, no rarity, no
inventory. Everything mistvale needs already exists as code here, and the gallery's `sprites.html` is the working
reference implementation of the layer stack.

---

## §1 Renderer core

### 1.1 Module map

| file | exports | role |
| --- | --- | --- |
| `pixelfx/src/core/rig.js` | `STAND` (:42), `WEAPONS` (:266-371), `shortfall` (:512), `posed` (:517), `skeleton` (:532), `posedParts` (:547) | 3D skeleton + depth-buffered pixel rasteriser for the stock humanoid. No default export. |
| `pixelfx/src/core/act.js` | `STAND`/`posed` re-export (:12), `lerpPose` (:17), `poseAt` (:36), `SKINS` (:107), `class Target` (:111), `actSpan` (:198), `createAct` (:208), `actTiming` (:454), `actBounds` (:469) | pose tracks, hit/freeze choreography, straw dummy, timing extraction |
| `pixelfx/src/core/poses.js` | `READY` (:24) | the pose-field documentation (:3-13) + one ready stance |
| `pixelfx/src/core/actor.js` | `stockActor` (:104), `drawActor` (:111), `actorAlphaOf` (:115), `{HERO, HERO2, HERO_PAL, DUMMY_PAL}` (:117) | the stand-in character the effect gallery puts next to an act |
| `pixelfx/src/core/painter.js` | `class Painter` | effect-side drawing into `frame.color` / `frame.light` with ordered dither. **Not used by any `tools/character-*.mjs`** (only `tools/check.mjs:163-172` monkey-patches `Painter.prototype.put`). |
| `pixelfx/src/core/iso.js` | `TILE = [32,16]`, `enterStyle`, `projectLayer`, `projectEffect` | 2:1 iso projection for effects. No character tool imports it; `gallery/sprites.html` re-implements `iso()` inline (:395). |

There is no `character.js`, no `outfit.js`, no `equipment.js` in `src/`. The character *is* `rig.js` plus the
recolour + gear passes in `tools/lib/`.

### 1.2 The pose object is the whole API

`rig.js` renders a plain object. `solve(pose)` (`pixelfx/src/core/rig.js:67`) starts from `{...STAND, ...pose}`
and every field is a delta from the rest pose. The authoritative field list is the comment block in
`pixelfx/src/core/poses.js:4-13`; the set actually consumed by `solve`/`render`:

| field | meaning |
| --- | --- |
| `x, y` | feet position (the pivot is the feet, bottom-centre) |
| `crouch, lean` | pelvis drop (px) and torso lean (rad) |
| `hx, hy` | head roll / nod |
| `fx, fy, fz` | near (right) hand target in body space |
| `bx, by, bz` | far hand target |
| `ffx, ffy, fbx, fby` | near / far foot target |
| `fzz, bzz` | near / far foot depth |
| `turn, twist` | chest yaw override / extra twist |
| `yaw` | whole-body yaw about the feet (this is how directions are made) |
| `armsFront` | swap arm draw order in front of the chest |
| `weapon, sa` | near-hand weapon **name** and its screen angle (0 = forward, `-PI/2` = up) |
| `two` | the second hand grabs the weapon at the weapon's own `two` point |
| `wl, wz` | weapon on-screen length (1 = full, shrinks with foreshortening) and depth sign |
| `pull, nocked` | bow draw amount and arrow presence |
| `offWeapon, sb` | far-hand weapon + angle |
| `toeF, toeB` | toe roll |
| `ghost` | draw motion after-images |
| `fall` | tip-over angle (used by death) |
| `face: -1` | mirror the whole render |
| `y` | airborne offset |

Skeleton metrics are constants: `const DEG = Math.PI/180, W0 = 24, H0 = 38;`
(`pixelfx/src/core/rig.js:19`) — the native cell is **24×38** — and

```
const M = { pelvis: 19.7, spine1: 2.8, spine2: 4.6, shoulderUp: 2.5, shoulderOut: 5.9,
            neckUp: 4.0, headUp: 3.1, hipDown: 1.1, hipOut: 2.8, thigh: 8.6, shin: 8.3,
            upper: 7.6, fore: 7.4, turn: 36*DEG }        // rig.js:37-40
```

Arm reach ≈ 15 px, leg 17 px (`poses.js:15-22`). `STAND` (`rig.js:42`) is
`{lean:0, crouch:0, yaw:0, fx:-3, fy:-15, bx:5, by:-15, ffx:-2, ffy:-4, fbx:3, fby:-4}`. `poses.js:24` adds
`READY = {crouch:3, fx:11, fy:-21, bx:9, by:-21, ffx:7, fbx:-7}`.

A caller must supply: nothing but a pose object. No context, no atlas, no asset. `posed(pose)` returns the
finished pixel record.

What `solve` does: `ik(a, target, L1, L2, pole)` (`rig.js:45`) is 2-bone IK; the chest turn is derived from the
two hand positions; the pelvis sinks until both legs reach their ankle targets; when a weapon is held, the free
arm picks its elbow with a 16-sample `pole()` search. Returns `{B, W, OW, q, axis, side, armN, armF, legN, legF,
sN, sF, hipN, hipF, turn}`.

### 1.3 Parts, buffers, back-map

The rasteriser works in a fixed scratch grid `const BW = 300, BH = 240, OX = 150, OY = 180`
(`rig.js:140`) with depth, tone, part-id, material, frame, light and colour buffers (:141) and a single light
`LIGHT = unit([-0.55, 0.72, 0.5])` (:143).

`PART` (`rig.js:196`) is the 24-entry part table that *everything downstream keys on*:
`pelvis 1, waist 2, chest 3, neck 4, head 5, face 6, upperN 7, elbowN 8, foreN 9, handN 10, upperF 11, elbowF 12,
foreF 13, handF 14, thighN 15, kneeN 16, shinN 17, footN 18, thighF 19, kneeF 20, shinF 21, footF 22,
weapon 23, offWeapon 24`. `FRAME_IDS` (:145) is the 15-bone frame list used by `src`.

`finish(S, restFrames)` (`rig.js:374`) quantises lighting to 4 tones, de-speckles, writes seams (`SEAM`) where
the depth delta across a neighbour is > 2.2 and ink (`INK`) elsewhere, adds the chest mark and a 1 px outline, and
emits `{n, xs, ys, color, src, ink, x0, y0, x1, y1, z}`. **`src` is a back-map**: the index (0..911) of the 24×38
standing-sprite cell each pixel came from. That back-map is the hinge of the entire equipment system — it is how
`paint()` and `paintGear()` know which body part a rendered pixel is.

`render(pose, opts)` (`rig.js:480`) order: `yaw` and `face === -1` → `turnAll` (:471); `fall` → `fallAll` (:452,
rotates about the feet then lifts so nothing goes under the floor); clip body below `y < 1.5` unless airborne; draw
body, then near weapon, then far weapon; `finish()`.

`posed(pose, opts)` (`rig.js:517`) memoises on `keyOf(pose)` (:502) in a Map capped at 6000 entries (:520-522),
ignoring `x`, `y`, `ghost`. Supports `opts.noWeapon`.

`skeleton(pose)` (`rig.js:532`) returns `{joints: {pelvis, waist, chest, neck, head, crown, shoulderN, elbowN,
handN, shoulderF, elbowF, handF, hipN, kneeN, ankleN, toeN, hipF, kneeF, ankleF, toeF}, bones: [[from,to] …19],
handles: ["handN","handF","ankleN","ankleF"]}` in y-down local space — this is what mistvale's keypoint exporter
uses.

`posedParts(pose, opts)` (`rig.js:547`) renders each part in isolation (`onlyPart`) and returns
`[{name, part, n, xs, ys, color, cx, cy, z}]`. Every class/gear/death tool uses it to lift the weapon out of the
body (`character-equipment.mjs:60-69`, `character-anim.mjs:118-128`, `character-death.mjs:57-66`).

### 1.4 Materials

There is exactly **one** material: `DUMMY_PAL` (`pixelfx/src/core/actor.js:35-37`) with keys
`k` (ink), `A B C D` (shell shades), `E F G` (core shades), `J` (seam), `m` (mark, `#f53cd1`). `rig.js:12-13`
imports it and derives `SHELL = [A,B,C,D]`, `CORE = [E,F,G,G]` at module load. There is **no per-class material in
the donor** — recolouring happens after rendering, in `tools/lib/classes.mjs:156` `paint()`.

`actor.js` supplies the two stock bodies: `HERO` 12×19 ASCII (:5-25) and `HERO2`, a baked 24×38 rendering of
`STAND` (:39-78). `HERO2` is the figure the class palettes recolour.

> The mistvale fork is what added material *as a concept*: `setMaterial(m)` and a second `posed(pose, material)`
> argument (see §6).

---

## §2 Animation / choreography

### 2.1 The act system (`act.js`)

A track is a list of `[t, pose, how]` keys (`act.js:17-53`). `how` is one of `smooth` (default, smoothstep),
`"out"` (`u => 1-(1-u)^2`), `"in"` (`u => u*u`), `"line"` (identity) — table at :30 — plus `"snap"`, which holds
the **previous** pose until the key lands.

The one rule that gives the library its feel is the **12 fps limb stepping** (`act.js:43-48`):

```js
const stepped = t0 + Math.floor((t - t0) * 12 + 1e-6) / 12;
```

Limbs are evaluated on whole 1/12 s steps counted from each key (held-drawing look), while `out.x` / `out.y` — the
feet over the floor — are lerped with the un-stepped `u`. Frames are per-frame unique but limbs are quantised; that
is the difference between "hand-drawn" and "tweened".

`lerpPose` (:17) only lerps numeric keys; a later pose that omits `hx/hy/lean/crouch` eases them back to 0, and
`wl` eases to 1 (:26-27).

Idle breathing is procedural: `isHeld(track, t)` (:54) is true between keys that barely differ (> 0.4 s apart and
< 1.5 px on `fx,fy,bx,by,crouch,lean,x,y`) or past the end, and `createAct` then adds a two-step bob —
`crouch + (floor(tt*3)&1)`, likewise `fy`/`by` (:223-226).

`createAct(mod, o = {})` (:208) returns `{fx, meta, act, targets, t, shake, frozen, pose, update(dt),
draw(frame, {body, target}), stop(), done(), onHit?}`. It reads `act.poses`, `act.hits[{t, stop, shake, amp,
target, push, skin, at}]`, `act.dust[{t, n, x, dir, c}]`, `act.targets|act.target`, `act.onBody`, `act.follow`,
`act.ghost`, and `meta.duration`, `meta.loop`, `meta.options?.seed/.palette`.

- **Freeze**: `hits[].stop` seconds during which `update` returns early (:249-252) — hitstop.
- **Ghost**: one after-image every 1/30 s while `q.ghost`, max 7, life `GHOST_LIFE = 0.16` (:166, :294-300), drawn
  **additively into `frame.light`** (:334-346) so trails brighten instead of painting over.
- **Target**: a 38×52 straw dummy (`TW = 38, TH = 52`, :65) baked pixel by pixel (:69-105) with a spring
  `omega += (-60*theta - 3.4*omega)*dt`, clamped ±0.4/0.42; `hit({push=1.2, straw=8, flash=0.05, skin,
  shiver=0, y=-26})`. `SKINS` (:107) = flash/char/ice/shadow/holy/red/shock/poison.

`actSpan(mod)` (:198) → `{from: min(0, first pose t), to: meta.loop ? Infinity : max(duration, last pose t)}`.
`actBounds(mod)` (:469) samples at 1/12 s and at every key, pads by targets (x±30/36, y ≤ -56).

**`actTiming(mod)` (`act.js:454-466`) is the game-facing timing contract** and is the direct ancestor of mistvale's
`release`/`impact`/`strikeDur` trio:

```
{ windup: -from,
  recovery: max(0, to - D),
  onBody, targets: [x…],
  hits: [{ t, freeze: h.stop ?? 0, shake, amp, push, skin, at }],
  poses: [{ t, how, pose }] }
```

`hits[].t` is the impact instant, `hits[].freeze` the hitstop length, `windup`/`recovery` bookend the clip.

**The act system does not drive characters.** In the library, `createAct` is used by the *effect* pipeline:
`gallery/app.js:99` draws `drawActor(painterFor(f).place(…), stockActor(), actorAlphaOf(…))` beside the act, and
`tools/act.mjs` renders "the character, the target, the freeze on contact" strips (`tools/act.mjs:2-8`, flags
`--mp4 --sheet --no-target --from --to --step --cols --zoom --bg --out --seconds`). Character animation in the
tools is baked pose tables, not acts (§2.2).

### 2.2 How character motion is actually authored

Hand-authored pose tables, one per cycle. No procedural locomotion anywhere.

- **Walk** — `pixelfx/tools/lib/anim.mjs:19` `walk(hold, sa)`: 8 frames; hands answer the feet
  (`hand(dx) = {fx: hold.fx+dx, fy: hold.fy-1, fz: hold.fz}`, `free(bx,by,bz)` for the free arm); foot sequence
  contact → roll → push → pass, then mirrored on the far foot for frames 5-8; `fzz/bzz` ±3.2→±1.8 track step
  depth; `const flat = -4; const lift = (v) => flat - v;` (:11-12) converts a lift height to the rig's `ffy`.
  8 frames × 1/12 s = 0.667 s per cycle.
- **Archer walk** — `anim.mjs:40` `archerWalk`: upright, short steps (ffx ±3), bow hand pinned at `hold`.
- `WALK = { mage: walk, ranger: archerWalk, knight: walk }` (`anim.mjs:56`).
- **Attack** — `ATTACK` (`anim.mjs:64-163`) keyed `"<class>"` or `"<class>:<weapon>"`; each entry is 5 poses plus a
  trailing `null` (the class's carried pose, closing the cycle). Extra fields used only by attacks: `az`/`pit`
  (weapon azimuth on the floor + pitch), `faz`/`fpit` (same, for the front view), `baz`/`bpit` (back view),
  `flat: true` (derive `sa/wl/wz` from `az/pit`), plus `nocked`/`pull` for the bow. Entries: `mage` (cast),
  `ranger` (raise/draw/loose), `knight` (level cut), `knight:greatsword`, `knight:spear` (thrust — point stays
  dead ahead), `knight:dagger` (two stabs), `knight:hammer` (overhead drop), `knight:scythe` (knee-height reap),
  `knight:claw` (rake). Lookup in the tool: `ATTACK[cls.id+":"+weapon] ?? ATTACK[cls.id] ?? []`. Comment at
  `anim.mjs:89-91`: "Frame 3 is the strike — the page lands the hit at floor(n / 2)".
- **Death** — `pixelfx/tools/character-death.mjs:34-45` `DEATH`: 10 pose deltas `{lean, crouch, hy, dfx, dfy, dbx,
  dby, ffx, fall}` with `fall` 0.22 → 0.6 → 1.0 → 1.4 → 1.62 → 1.5 → 1.57 rad; `poseOf(f, yaw)` (:49-56) layers
  them over `cls.hold` + `cls.weapon.hold`. Played backwards it is a resurrection (:2-14).
- **Idle** — a single `STAND` (or `cls.hold`) pose per direction; there is no idle animation in the sheets
  (`character-4dir.mjs:49-57`, `character-classes.mjs:48-88`).

### 2.3 Directions

Four baked directions, produced by yaw — **not** by mirrored rows for left/right in the runtime sense:

```
character-anim.mjs:45-50   DIRS = [{down, yaw: PI/2, row:0}, {left, yaw:0, row:1, mirrorOf:"right"},
                                   {right, yaw:0, row:2}, {up, yaw:-PI/2, row:3}]
character-4dir.mjs:49-57   down = yaw PI/2, right = yaw 0, up = yaw -PI/2, left = mirrored right
character-death.mjs:26-31  same four, left mirrorOf "right"
```

So: front/back are real re-renders at ±90° yaw; the side view is one run at yaw 0, and **left is that run mirrored
at the pixel level** (`character-anim.mjs:159-165` mirrors `r.body` and negates the weapon `xs`). Because of this,
the weapon frame grid is made symmetric about x = 0 (`character-anim.mjs:211-219`: `half = max(-x0, x1) + pad`,
`wfW = half*2 + 1`, pivot at `half`) so the mirrored row lands on the same pivot.

Eight directions are *not* baked here. The library's 4 rows map onto a game's 8 by mirroring diagonals at draw
time — which is what mistvale's exporter does instead (28 rows, incl. `walkDownRight`, `attackUpLeft`, with
`MIRRORED_FROM` at `mistvale/pipeline/scripts/pixelfx/character/export-heroes.mjs:85-98`).

### 2.4 Where the timing contract lives (donor vs mistvale)

| concern | pixelfx | mistvale |
| --- | --- | --- |
| clip length | `meta.duration` in the act, else `frames/fps` | `frames`, `frameTime` per row (`export-heroes.mjs:341-347`) |
| impact | `hits[].t` (`act.js:454-466`) | `release`, `impact` row fields (`export-heroes.mjs:1103-1105`) |
| hitstop | `hits[].freeze` (= `stop`) | `strikeDur[]` + runtime `HIT_STOP` (`docs/PIXELFX-PRESENTATION.md` §2.1) |
| windup | `windup = -from` | `windupFrame`, `windupFrameTime`, `windupPow` |
| limb stepping | 12 fps stepping inside `poseAt` (`act.js:43-48`) | baked by sampling acts at 1/12 s |
| per-sheet fps | `fps: 12` in walk/attack/death meta | `frameTime` per row |

The donor sheet JSON carries **only** `fps` — there is no `release`/`impact`/`strikeDur` in any
`records/characters/**` meta. The strike frame is instead implicit at `floor(frames/2)` (`anim.mjs:89-91`) and
hardcoded in `gallery/sprites.html` (`hitStop`, :1792-1795; `MELEE[weapon].reach`, :1763-1772). Mistvale's row
schema is richer than the donor's; the donor's value is *how the poses are authored*, not its meta keys.

---

## §3 Equipment

### 3.1 A weapon is a pose field, not an object

`pixelfx/tools/character-equipment.mjs:402-447` writes this into the shipped README verbatim: "The library has no
equipment system to copy: a weapon is a **pose field**, not an object with a slot", and "Armor does not exist as a
layer either: `paint()` recolors the body one body-part at a time".

Concretely: `pose.weapon = "sword"` + `pose.sa = -1.32` + hand position `fx/fy/fz`. `rig.js:480-500` draws the
near weapon between the body's near side and the far side; the hand then covers the grip because the weapon is
drawn *before* the fist pixel. `pose.two` moves the far hand onto the weapon's `two` point; `pose.sb` does the
same for a far-hand weapon (`offWeapon`).

### 3.2 The `WEAPONS` geometry table

`export const WEAPONS` (`pixelfx/src/core/rig.js:266-371`). Each entry is authored in the **fist-local basis**
`i` = along the handle, `k` = across, built by `along(H, axis, side, part)` (:241) into a stamp `T(i, k, c, lift)`,
with helpers `blade(T, from, length, w)` (:257) and `haft(T, from, to, a, d, r = 0.8)` (:263) and the `STEEL`
palette (:256: `hi,a,b,d,gold,goldD,grip,gripD,wood,woodD,dark,darkD,olive,oliveA,oliveD`).

| weapon | fields | geometry |
| --- | --- | --- |
| `sword` | `{two: -4.4}` | blade 25 long × 2.2 wide from i = 3.2 |
| `greatsword` | `{two: -4.8}` | blade 31 × 3 |
| `dagger` | — | blade 10 × 1.3 |
| `spear` | `{two: -12}` | haft -18..36, blade 11 × 2 |
| `hammer` | `{two: -7}` | shaft -10..18, head block 18..28, lift ±4.5 |
| `scythe` | `{two: -11}` | haft -16..31, curved blade, radius 3.2 taper |
| `claw` | — | three 7.5 px tines at k = -2.4 / 0 / +2.4 |
| `staff` | `{two: -9}` | haft -14..12, grip -4..4, gold collars, crystal 15..24 |
| `bow` | `{across: true}` | 34 px span; `q.pull` / `q.nocked` read inside `draw` |
| `pistol` | `{across: true}` | compact |
| `launcher` | `{two: -9}` | tube + grip |
| `handle` | — | bare grip (the fallback when only the hand matters) |

Entry fields are exactly three: `two` (where the second hand goes, in weapon units), `across` (handle lies across
the weapon's length instead of along it), `draw(T, q, off)`.

### 3.3 How a class declares its gear

`pixelfx/tools/lib/classes.mjs:109-153`. Each entry is
`{id, name, palette, part, gearIds, weapon|weapons, hold, frontOrder?}`:

- `gearIds` — the armour declaration, **part id → rig part ids**:
  - mage (:110-117): `{helm:[5,6], chest:[3,4,7,9,11,13], belt:[1,2], legs:[15,16,17,19,20,21], boots:[18,22],
    gloves:[9,10,13,14]}`
  - knight (:118-142): same but `chest:[3,4,7,11]`
  - ranger (:143-152): same as knight's chest set
- knight declares **seven weapons** (`weapons:[…]`), each with its own `sa` and hand position, and optional
  `carry` for the angled back carry:
  `sword {sa:-1.32, hold:{fx:7,fy:-15,fz:6}}`, `greatsword {sa:-2.12, hold:{fx:4,fy:-22,fz:6}}`,
  `spear {sa:-1.42, hold:{fx:7,fy:-15,fz:5}}`, `dagger {sa:-1.02, hold:{fx:7,fy:-17,fz:5}}`,
  `hammer {sa:-2.12, hold:{fx:5,fy:-17,fz:5}, carry:{az:202,pit:-0.62}}`,
  `scythe {sa:-2.02, hold:{fx:5,fy:-17,fz:5}, carry:{az:196,pit:-0.45}}`,
  `claw {sa:-0.9, hold:{fx:7,fy:-17,fz:5}}`. `weaponsOf(cls)` (:93) normalises this.
- `hold` is the per-class hand pose when carrying: mage `{fx:7,fy:-15,fz:9}` with `weapon:{slot:"weapon",
  name:"staff", sa:-PI/2}`; ranger `{fx:7,fy:-16,fz:6}` with `bow`/`sa:-1.04`.
- `frontOrder: {attack:{down:"front"}}` (:141) — "a cut toward the camera draws the weapon over the body": a
  per-anim, per-direction draw-order override, written into the weapon sheet meta as `drawOrder`.
- `withGear(list)` (:99-107) expands a class into one entry per weapon with `{weapon:w, gear:w, gearFirst:i===0,
  gearCount:n}` so tools write shared layers once.
- `floorPose(az, pit)` (:87-91) converts a floor azimuth/pitch into the rig's `sa/wl/wz`
  (`x=cp*cos φ, y=-sp, z=cp*sin φ; sa=atan2(-y,x), wl=hypot(x,y), wz=z<0?-1:1`). This is how "carried at 202°"
  becomes a pose.

`paint(pose, C, partOf, cell = {W,H,OX,OY})` (:156-181) is the recolour: it renders with `posed(pose,
{noWeapon:true})`, maps each pixel back through `src` → `partMap` → the class's `part` table → a region name, then
picks `region.shell[si]` (4 steps) or `region.core[ci]` (3 steps). `partMap` (:15) is a 24×38 `Int8Array` filled by
walking `posedParts(STAND)` once.

### 3.4 Armour: the six-piece mask + ramp system (`tools/lib/gear.mjs`)

This is the real equipment system, and it is a *sheet* system, not a renderer feature.

- `GEAR_PARTS = ["legs","boots","chest","belt","helm","gloves"]` (`gear.mjs:18`) — six pieces, listed in draw
  order back-to-front. `GEAR_LABEL` (:19) gives display names.
- `rampOf(base)` (:33-41): one hex → `{shell:[+20% white, base, -34% black, -60% black], core:[base-16%,
  base-34%, base-60%]}`, memoised. This is how a single "armour colour" becomes a 4+3 shading ramp that matches the
  dummy's own shade ranks — the armour is generated in the *same* shading space as the body, so it never fights it.
- `GEAR` (:45-97): three sets per class, each `{id, name, chip, parts:{helm, chest, belt, legs, boots, gloves,
  cape}}`. A piece is either one hex or an object keyed by body region — knight `chest: {plate:"#d9b278",
  tabard:"#7a2a24"}`, ranger `{tunic:…}`, mage `{robe:…}`. Sets: knight `oath`/`iron`/`night`, ranger
  `trail`/`moss`/`ember`, mage `spark`/`night`/`dawn`.
- `ornate(partName, mask, cls, set, pose, data, cell)` (:149): **procedural detail derived from the piece's own
  pixel mask** — helm = brow band + temple rivets + visor slit + gorget + crest (`STYLE[cls].helm` ∈
  `great|coif|cowl`); chest = yoke band + centred emblem (`cross|leaf|star`, inked by the luminance of the pixel
  underneath) + hem band + pauldron cap; belt = buckle on the widest run; legs = knee cop; gloves = cuff +
  knuckle plate; boots = cuff + capped toe. `facingOf(pose)` (:144-147) reads `pose.yaw` to pick the side that gets
  the detail.
- `paintGear(pose, cls, partName, set, cell)` (:364-388): `ids = cls.gearIds[partName]`; render with
  `noWeapon`; keep only pixels whose `partMap[src]` is in `ids`; colour = `rampOf(colourOf(piece, cls, id))
  [shell|core][si|ci]`; record a `{x, y, id}` mask; then `ornate(...)`. Outlines are skipped so the body keeps its
  ink. `colourOf` (:102-106) resolves string vs `{region}` vs `{any}` pieces.
- `CAPE` (`gear.mjs:309`): its **own 40×48 cell** with the same feet pivot `[20,44]`, 6 frames, 8 fps.
  `paintCape(cls, set, view, frame, frames)` (:311-344): per row `t=(y-ATTACH)/(HEM-ATTACH)`, `half = 8+5t`,
  `sway = sin(phase + t*2.6)*(1.5+2.8t)`, `trail = side ? -6t : 0`, folds by `sin(u*PI*3 + phase*0.8 + y*0.22)`,
  deep edges, trim hem, collar lift, two gold clasps. The cell is wider than the body precisely so the cloth can
  flare (`capeMeta` `align`, :347-360).
- `gearCells(byDir, cls, set)` (:406-415): row-major output, **`row = direction*6 + part`**, column = frame.
  `gearMeta` (:418-433): `{class, anim, role:"gear", set:{id,name,chip}, cell:[24,38], frameSize:[24,38],
  columns, rows: dirs.length*6, fps:12, pivot:[12,38], parts:GEAR_PARTS, layout, directions:[{name,row}], align}`
  — note `rows` uses ×6 while the `layout` string still says "× 5" (stale literal; also stale at
  `gear.mjs:1`, `sprites.html:410,466,694`).
- `gearIndex(cls)` (:436-447): `{class, name, parts, cell:[24,38], pivot, sets:[{id,name,chip,colours}],
  sheets:{idle, walk, attack:"gear/<set>-parts.png"}}`.

### 3.5 No rarity, no fine, no variants

There is **no rarity, quality, tier, level, "fine", upgrade or loot concept** anywhere in pixelfx. A "set" is only
`{id, name, chip, colours}` (`gear.mjs:45-97`, `gearIndex` :436). The only two axes are **set × piece**, and the
gallery deliberately lets them be mixed piecewise ("the outfit is a mix, not a set", `sprites.html:1368`). The
`fine` strings in `sprites.html` are `(pointer: fine)` media queries and a grass hash — not equipment. Mistvale's
`-weapon-fine` sheet and its `groups.outfit`/`groups.metal` rarity recolours are **mistvale's own invention**, not
a donor capability.

### 3.6 The gallery swap path (`gallery/sprites.html`)

Not `gallery/app.js` — that drives the FX gallery (`index.html`, "N pixel art effects"), and its only character
involvement is `drawActor(…, stockActor(), actorAlphaOf(…))` at `app.js:99`, plus the `#d-actor` toggle
(`app.js:25, 210-211, 290-292`). The character/equipment playground is `gallery/sprites.html` (2278 lines,
self-contained), base `../records/characters/classes` (:391), camera `PX = 16, PY = 8` (:385), `iso(x,z)` (:395).

1. `layer(jsonPath, sheetPath)` (:402-407) — loads one sheet + its meta into
   `{im, fw, fh, pv, n, fps, dirs, order}`. `dirs[name] = d.row != null ? {row:d.row, x:0} : {row:0, x:d.x ?? 0}`
   — i.e. cycle sheets address by `row`, idle sheets by column `x`.
2. `loadClass(cls)` (:408-437) fetches `holding/idle-4dir.json` + `gear/index.json` and pairs
   `[idleW, idleB]`, `[walkW, walkB]`, `[attackW, attackB]` (fallback → idle), `[dieW, dieB]` (fallback → null).
   Layer order is **`[weapon, body]`**, weapon first, and the gear map is per weapon.
3. `gearLayer(cls, weapon, anim)` (:441-447) is the path rule: idle at `<cls>/<weapon>/idle-4dir.*`; cycles at
   `<cls>/walk|attack/<weapon>/*-4dir.*`; and `<cls>/attack/<weapon>/body-4dir.*` when the weapon has its **own**
   attack body ("a spear is thrust, not swung", :458-464).
4. `equip(cls, weapon)` (:535-542) = `ensureGear` + `C.worn = weapon` + `syncGear` + `warmArmour`; the UI is
   `#pg-gear` / `#hero-gear` (:329, :1346) wired to `cycleGear()` (:1360-1365) which steps
   `C.weapons[(i+1)%n]`. `warmArmour` (:528-532) prefetches every worn piece for idle/walk/attack + the cape.
5. Armour UI: `#pg-armour-btn` (:342) → dialog `#pg-armour-dlg` (:367), one row per piece, one chip per set
   (`buildArmour`, :1371-1390), `pickArmour(part, setId)` (:1392-1399) writes **one piece at a time** and persists
   the mix in `localStorage` under `pixelfx.playground.armour.<cls>` (:470, `wornGearOf` :476-486), defaulting each
   piece to `gi.sets[0].id`. `#hero-armour` (:330) shows the set name, or "mixed" (:1350-1356).
6. `drawAnim(layers, dir, f, x, y, cape, cf)` (:683-698): cape first (behind everything), then
   `if (layers[0]?.order?.[dir] === "front") layers = [layers[1], layers[0], ...]`, then per layer
   `sy = L.part == null ? d.row*L.fh : (d.row*GEAR_PARTS.length + L.part)*L.fh` (:695) — the armour row formula,
   `dirRow*6 + part`, matching `gearCells`.
7. Weapon → hit FX table `MELEE` (:1763-1772): `sword {id:"melee/sword-slash-iso", impact:"slash", reach:1.2,
   pow:1.5}`, `greatsword` heavy 1.65/2.6, `spear` pierce 1.5/1.9, `dagger` 1.35/1.1, `hammer` heavy 1.5/3,
   `scythe` slash 1.7/2.2, `claw` 1.35/1.3; `fire()` (:1773-1789) plays the effect at the feet aimed at `AIM[dir]`
   and schedules the hit at `m.reach`. Hit-stop: `if (hitStop > 0) { hitStop -= raw; dt = raw * 0.22; }`
   (:1792-1795). Bow and non-melee weapons instead push a travelling `shots` entry (speed 5.4/4.4).
8. `window.pixelfxPlay` (:2082) exposes `gear`, `armour`, `wornGearOf`, `gearLayersFor`, `warmArmour` for the
   acceptance check — a headless test hook we can reuse verbatim.

---

## §4 Tools and the sheet/meta format

All character tools live in `pixelfx/tools/`, import `{ STAND, posed | posedParts | skeleton }` from
`../src/core/index.js`, and write to `records/characters/…` by default. PNG writing is `tools/lib/png.mjs:24
encodePNG(w,h,rgba)`; canvas/upscale/save are `tools/lib/fxlib.mjs:146 upscale(rgba,w,h,k)`, `:158 canvas(w,h,
fill)`, `:264 save(file, buf)`.

| tool | what it renders | CLI | outputs (default dir) | cell / pivot | grid / fps | meta keys |
| --- | --- | --- | --- | --- | --- | --- |
| `character-4dir.mjs` (139) | the bare stock figure, 4 idle directions | `--out DIR --zoom N` | `records/characters/4dir/`: `down|left|right|up.png`, `idle-4dir.png`, `@8x`, `preview.png`, `idle-4dir.json`, `idle-4dir.aseprite.json` | 24×38, `[12,38]` | 4 cells one row, fps 1, `loop:false` | `frameSize, pivot, sheet, method, directions[{name,index,x,yaw,flip,file,note}]` (:90-103) |
| `character-classes.mjs` (165) | class **bodies only** — "No weapons, armor, quivers or other equipment" (:2-12) | `--out DIR --zoom N` | `records/characters/classes/<cls>/`: same 4 PNGs + `idle-4dir.{png,json,aseprite.json}`, `preview.png`; aggregate `preview.png`, `classes-4dir.png`, `classes-4dir.json` | 24×38, `[12,38]` | 4 cells, fps 1 | `class, name, frameSize, pivot, sheet, noWeapons:true, noEquipment:true, method, palette{region:{shell[4],core[3]}}, directions[{name,index,x,yaw,flip,file}]` (:74-87); atlas rows = classes, cols = dirs (:127-164) |
| `character-equipment.mjs` (448) | body in the **holding** pose, the weapon **alone**, and the armour sheets | `--out DIR --zoom N` | `<cls>/holding/…`, `<cls>/<weapon>/…` (4 PNGs + idle-4dir + json + aseprite + preview), `<cls>/gear/<set>-parts.{png,json}`, `<set>-cape.{png,json}`, `gear/index.json`, `preview-holding.png`, `equipment-preview.png`, `README.md` | body 24×38; weapon frame = union + 2 px pad, pivot `[-x0,-y0]` (:175-186); cape 40×48 `[20,44]` | idle only; gear rows = 4 dirs × 6 parts, one column; cape 6 cols × 4 rows, fps 8 | weapon: `class, weapon, frameSize, pivot, bodyFrame, bodyPivot, separateFromBody, align, source:"src/core/rig.js WEAPONS.<n>", directions[{name,x,yaw,flip,hand,grip,billboard,file}]` (:235-246); holding: `class, name, weapon, weaponSlot, weapons[], frameSize, pivot, sheet, noWeapons, method, directions[{name,index,x,yaw,flip,hand,file}]` (:282-297) |
| `character-anim.mjs` (408) | 4-dir **walk** and **attack**, body + per-weapon layers + armour per animation | `--out DIR --zoom N --only walk|attack` | `<cls>/<anim>/<anim>-4dir.{png,json,aseprite.json}`, `@8x`, `preview.png`; `<cls>/<anim>/<weapon>/<anim>-4dir.*`, `@8x`; `<cls>/<anim>/<weapon>/body-4dir.*` when that weapon has its own attack; `<cls>/<anim>/gear/<set>-parts.*`; `<cls>/gear/index.json`; `ANIMATION.md` | 24×38 `[12,38]`; weapon grid symmetric about x=0, `weaponFrame` from 33×44 up to 135×66 | walk 8 cols × 4 rows, attack 6 × 4, `fps: 12`, `loop:true` in aseprite | body: `class, anim, frameSize, columns, rows:4, fps:12, pivot, directions[{name,row,yaw,flip,frames}], sheet, weapon, weaponSheet, weaponFrame, weaponPivot, noWeapons, method, holds[{dir,row,frame,hand}]` (:281-294). weapon: `class, weapon, anim, frameSize, columns, rows, fps, pivot, directions, sheet, separateFromBody:true, drawOrder?, align, source, holds` (:295-307) |
| `character-death.mjs` (103) | 10-frame 4-dir death; the fall is `pose.fall` | `--out DIR` only | `<cls>/death/death-4dir.png|json`, `preview.png`; `<cls>/death/<weapon>/death-4dir.*` | **96×56**, `[48,52]` (`:25`) | 10 cols × 4 rows, fps 12, `loop:false`, `land:6` | `class, anim:"death", sheet, frameSize:[96,56], columns:10, rows:4, fps:12, pivot, land, loop, directions, method, weapon, weaponSheet` (:90-101) |
| `character-ai-body.mjs` (719) | recolours **mistvale's PixelLab AI bare body** frame by frame with the class palette + rig-rendered weapon | `--out DIR --montage FILE` | `<cls>/holding/`, `<cls>/<weapon>/`, `<cls>/walk/`, `<cls>/walk/<weapon>/`; montage default `<mistvale>/output/pixelfx-character/outfit/ai-classes.png` (:45) | AI cell, pivot `[PLACE.x0, 64]`, foot row 63 (:59-60) | idle 4 cells, walk 8 cols × 4 rows, `FPS = 8` (:61) | same family as the stock tools; carries `CARRY` (archer hand / mage back), `BETA` grip angle, `HAND_DRAW`/`BACK_DRAW` per direction (:97-130) |
| `characters.mjs` (165) | the stock sprites themselves | `--out DIR --zoom N --directions N` | `dummy.png` (`HERO2`), `hero.png` (`HERO`), `straw-target.png`, `@8x`, `preview.png`, `characters.json`, optional `directions/dir-NNN.png`, `turnaround.png`, `directions.json` | 24×38 / 12×19 / 38×52, pivot `[w/2, h]` | — | `generatedBy, source, note, sprites[{id,name,file,preview,w,h,pivot,source,usage,rows,palette}]` (:87-111) |
| `lib/classes.mjs` (192) | not a tool: palettes, `partMap`, `paint`, `mirror`, `floorPose`, `CLASSES` | — | — | — | — | — |
| `lib/anim.mjs` (163) | not a tool: `walk`, `archerWalk`, `WALK`, `ATTACK` tables | — | — | — | — | — |
| `lib/gear.mjs` (448) | not a tool: `GEAR_PARTS`, `GEAR`, `rampOf`, `paintGear`, `paintCape`, `gearCells`, `gearMeta`, `capeMeta`, `gearIndex` | — | — | 24×38 body / 40×48 cape | gear fps 12, cape fps 8 | see §3.4 |
| `lib/motion.mjs` (86) | **FX only** (`sampleMotion`, `describeMotion`) — no character tool imports it | — | — | — | — | — |

Aseprite siblings (`*-4dir.aseprite.json`) are built by `character-anim.mjs:322-336`: frames named
`"<name> <dir> <i>"`, `duration = round(1000/FPS)`, `meta.pixelfx = {id, name, fps, loop, frames, frameSize,
pivot, columns, directions}`. Death sheets have **no** aseprite sibling.

---

## §5 Shipped data tree

`pixelfx/records/characters/`:

```
4dir/               the bare stock figure, 4 directions (character-4dir.mjs)
dummy.png hero.png straw-target.png characters.json directions/ turnaround.png   (characters.mjs)
classes/            (character-classes.mjs + character-equipment.mjs + character-anim.mjs + character-death.mjs)
  ANIMATION.md  README.md  classes-4dir.{png,json}  preview.png  equipment-preview.png
  knight/  ranger/  mage/  ai-archer/  ai-mage/
```

There is **no `archer/`, `mage-old/` or `warrior/` directory**: `warrior` is only the `WARRIOR` palette constant
(`tools/lib/classes.mjs:62-73`) used by the class **knight**; `ARCHER` (:43-53) is used by **ranger**. Shipped
classes are knight / ranger / mage plus the two AI-body classes.

| class | contents |
| --- | --- |
| `knight/` | `down|left|right|up.png`, `idle-4dir.{png,json,aseprite.json}`, `@8x`, `preview.png`; `holding/`; `gear/{oath,iron,night}-parts.{png,json}` + `gear/index.json`; `<weapon>/` for **sword, greatsword, spear, dagger, hammer, scythe, claw** (4 PNGs + idle-4dir + json + aseprite + preview); `walk/`, `attack/`, `death/` each with the cycle sheet + `preview.png` + `gear/<set>-parts.*` + **one `<weapon>/` subfolder per weapon** (7 in each of walk, attack and death) |
| `ranger/` | same shape with one weapon (`bow`), plus `death/` and `death/bow/`, `gear/{trail,moss,ember}-parts.*` |
| `mage/` | `staff` + `spear` weapon folders, `death/` + `death/staff/`, `gear/{spark,night,dawn}-parts.*` |
| `ai-archer/` | `bow/`, `holding/`, `walk/`, `walk/bow/` — **no gear, no attack, no death** |
| `ai-mage/` | `staff/`, `holding/`, `walk/`, `walk/staff/` — **no gear, no attack, no death** |

Representative meta, verified in place (`pixelfx/records/characters/classes/knight/walk/walk-4dir.json`):
`class, anim:"walk", frameSize:[24,38], columns:8, rows:4, fps:12, pivot:[12,38], sheet:"walk-4dir.png",
directions:[{name,row,yaw,flip,frames}], weapon:"sword", weaponSheet:"sword/walk-4dir.png",
weaponFrame:[47,47], weaponPivot:[23,44], noWeapons:true, method, holds:[32]{dir,row,frame,hand:[x,y]}`.

`holds[]` is the important one: the exact hand pixel per frame per direction — this is what lets the weapon layer
be composited independently of the body, and what mistvale's `head[]` anchors do for heads.

Armour example (`…/knight/walk/gear/iron-parts.json`): `class, anim:"walk", role:"gear", set{id,name,chip},
cell:[24,38], frameSize:[24,38], columns:8, rows:24, fps:12, pivot:[12,38], parts:[legs,boots,chest,belt,helm,
gloves], layout, directions, align`. Cape (`…/mage/gear/dawn-cape.json`): `cell:[40,48], columns:6, rows:4,
fps:8, pivot:[20,44]`. Index (`…/mage/gear/index.json`): `class, name, parts, cell, pivot, sets[3]{id,name,chip,
colours}, sheets{idle, walk, attack}`.

---

## §6 Gap map

Mistvale's current model: 6 classes (~9 heroes), one 100 px-cell atlas per class per look, **one weapon slot and
one armour slot as booleans** (`mistvale/src/pixel-game.js:453, 524, 1472`; bonuses at :350-352; recipes at
:544-613), rendered through `meta.parts` (`mistvale/src/pixel-world.js:1681-1683`) with a `-weapon-fine` sheet swap
(:599, :1602, :1683). Animation rows are 28 baked rows (`export-heroes.mjs:85-98`) at 8 frames each.

| donor capability | where | mistvale today | adopt? |
| --- | --- | --- | --- |
| **Per-weapon animation layers** — knight ships a *separate walk and attack sheet per weapon* (7 weapons) and even a separate attack **body** when the motion differs ("a spear is thrust, not swung") | `pixelfx/tools/character-anim.mjs:295-307`; `gallery/sprites.html:441-447, 458-464`; data `records/characters/classes/knight/walk/<weapon>/` | none — one weapon per class, baked into the body sheet; `-weapon-fine` is a *tint* of the same rows | **yes**, high value / medium cost: emit `<class>-<weapon>` layer sheets keyed by `hero.weaponId`, and `attack/<weapon>/body-4dir` variants for spear/thrust classes. Runtime needs only a second `meta.parts`-style lookup, which already exists. |
| **Six-piece armour with piecewise mixing** (helm/chest/belt/legs/boots/gloves, each sheet a 24×38 mask layer, row = `dir*6 + part`) | `pixelfx/tools/lib/gear.mjs:18, 406-433`; formula also in `gallery/sprites.html:695` | **one** boolean `equipment.armor` → one `-armor` part sheet, no pieces, no mixing | **yes**, highest value / low-medium cost: mistvale already draws `meta.parts` in array order, so 6 more part entries need no renderer change. Port `gear.mjs` (448 lines) + emit in `export-heroes.mjs --parts`. |
| **`rampOf` ramp generation** — one armour colour → a 4-shell + 3-core ramp in the body's own shade ranks | `pixelfx/tools/lib/gear.mjs:33-41` | palette `groups.outfit`/`groups.metal` recolours, hand-listed per sheet | **yes**, low cost: it is 9 lines and removes per-sheet palette bookkeeping for every new armour set. |
| **Procedural ornament from the piece mask** (brow band, visor slit, emblem, pauldron cap, knee cop, buckle) | `pixelfx/tools/lib/gear.mjs:144-304` | none — ornament is baked into the art | **maybe**, medium cost: it is the only way to get N armour sets without N art passes, but it assumes a 24×38 rig silhouette, and mistvale's body is a 100 px AI/PixelLab sheet — would need a scale-correct port. |
| **Cape as its own larger cell** (40×48, 6 frames, 8 fps, behind everything, yaw-aware sway) | `pixelfx/tools/lib/gear.mjs:309-360` | none | **yes**, low cost and visible payoff: same layer mechanism as parts, one extra cell size to allow in the composer. |
| **Weapon geometry as data** (`WEAPONS`, 12 entries, `two`/`across`/`draw`) | `pixelfx/src/core/rig.js:266-371` | already forked and used: mistvale's `gear/*.js` `drawGear` writes into the rig depth buffer (`mistvale/pipeline/scripts/pixelfx/character/gear/archer.js:152`), driven by `setGearPass` (`export-heroes.mjs:905`) | **adopted**. Keep. |
| **Material system** (`setMaterial`, per-region part→region tables, packed `SHELL_CODE`/`CORE_CODE` shade ranks) | fork only: `mistvale/…/core/rig.js` `setMaterial`; `stockbody.mjs:41-42` | adopted (`export-heroes.mjs:904`) | **adopted**, and it is *better* than the donor: the donor has exactly one material (`DUMMY_PAL`). |
| **Costume tone-code authoring** (`CSHELL(region,tone)`, `R(ramp,shift)`) | fork: `costume.mjs:21-22, 28` | adopted — this is mistvale's per-class look language | **adopted**; no donor equivalent to import. |
| **act-driven choreography**: `createAct`, `hits[{t,stop,shake,amp}]`, ghost trails (`act.ghost`, additive into `frame.light`), straw `Target` with spring reaction | `pixelfx/src/core/act.js:208, 249-252, 166/294-300/334-346` | only `actTiming`/`actBounds` are imported (`export-actor.mjs:26,94,207`; `gear/sheet-idle.mjs:88`) — **no exporter runs `createAct`**, no hits, no ghosts | **yes**, medium cost: author attack rows *as acts* and bake them (`docs/PIXELFX-PRESENTATION.md` §2.1 already says this), and port ghost trails as a runtime smear (mistvale has none). |
| **12 fps limb stepping** inside interpolation | `pixelfx/src/core/act.js:43-48` | exporters space poses evenly and bake `bakedMotion:true` | **yes**, near-free: it is one `Math.floor((t-t0)*12)/12` and it is the single biggest reason the library's motion reads as hand-drawn rather than tweened. |
| **`pose.fall` + 10-frame death choreography** in a 96×56 cell | `pixelfx/tools/character-death.mjs:25, 34-45` | 8 rows × `.1 s` death, body-sized cells | **yes**, low cost: death is the cheapest row to improve and the fall is already a rig field. |
| **`holds[]` per-frame hand pixels in the meta** | `pixelfx/tools/character-equipment.mjs:235-246`; `character-anim.mjs:281-294` | `head[]` anchors per row (same idea, heads only) | **yes**, low cost: a `hand[]` anchor array would let a weapon be attached at runtime instead of baked. |
| **`character-ai-body.mjs`** — recolours an AI bare body per frame using rig part back-mapping and re-renders the weapon with the rig at that frame's skeleton | `pixelfx/tools/character-ai-body.mjs:1-36, 44-61` (imports mistvale's own `outfit-lib`, `png-io`, `outfit-pose`, `barebody.js` via `MISTVALE_DIR`) | unused — mistvale's own exporters do a similar job offline | **yes**, low cost: the tool *already points at mistvale* and the AI classes (`ai-archer`, `ai-mage`) are shipped data. It is the smoothest path for future PixelLab bodies. |
| **Rarity / fine / levels** | — does not exist in pixelfx (§3.5) | mistvale has rarity, `weaponLevel`, `-weapon-fine` | **no** — nothing to adopt; keep mistvale's own. |
| **`Painter` / `iso.js`** | `pixelfx/src/core/painter.js`, `iso.js` | unrelated (FX layer) | **no** for characters. |

### The single most valuable thing to adopt next

1. Adopt **the six-piece armour stack** (`pixelfx/tools/lib/gear.mjs:18` `GEAR_PARTS`, `:406-415`
   `row = direction*6 + part`, `:418-433` `gearMeta`) as the shape of mistvale's armour.
2. It costs one port (448 lines, no runtime maths) and one flag in `export-heroes.mjs --parts`, because mistvale
   **already renders `meta.parts` after the body** (`mistvale/src/pixel-world.js:1681-1683`) and already recolours
   by `groups.outfit` / `groups.metal` — the composer needs no new code, only more part entries.
3. It replaces a boolean with a real loadout: helm / chest / belt / legs / boots / gloves can be mixed per piece
   exactly like `gallery/sprites.html:1392-1399` does, which is the mechanic the game currently lacks.
4. Take `rampOf` (`gear.mjs:33-41`) with it: one armour colour becomes a 4+3 ramp in the body's own shade ranks,
   so every new set is a colour, not an art pass.
5. Take `paintGear`'s mask discipline (`gear.mjs:364-388`): keep the body's ink, colour only pixels whose
   part-id is in `cls.gearIds[piece]` — that is what stops armour from looking pasted on.
6. Then add the cape as its own 40×48 cell (`gear.mjs:309-360`): same mechanism, one cell size to allow.
7. Only after that, move to per-weapon animation layers (`character-anim.mjs:295-307` +
   `sprites.html:458-464`): they are worth more visually but need one sheet per class × weapon, i.e. 7× the
   attack art for the knight-analogue.
8. Free wins to bundle in while in there: the 12 fps stepping rule (`act.js:43-48`), `holds[]` hand anchors
   (`character-equipment.mjs:235-246`), and ghost trails (`act.js:294-300`).
