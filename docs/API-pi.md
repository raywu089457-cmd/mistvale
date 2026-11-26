# Mistvale `src/` API reference

Look up an export without opening the source file. `(line N)` is the line where the name is defined in `src/<file>`.
Order: current pixel game, maps and navigation, then the old Three.js version. This file is documentation only.

## src/pixel-data.js

Data tables for the current pixel game: buildings, hunter classes, items, monsters and tuning constants.

- `BUILDINGS` (line 4): array of building defs {id,name,x,z,w,d,type,roof,cost,desc,effect,product?}.
- `HERO_SPEED`, `RANGED_RANGE` (line 24): hunter walk speed 2.7 and shared ranged attack range 7.5.
- `CLASSES` (line 25): array of 6 hunter classes {id,name,tag,color,hp,attack,defense,speed,range,cost,desc}.
- `SKILLS` (line 44): map classId → signature skill {name,kind,cd,mult|heal,radius|targets,lock,fx}.
- `RARITIES` (line 52): array of 5 rarity defs {id,name,color,mult}.
- `TRAITS` (line 53): array of 5 trait defs {id,name,desc}.
- `MATERIALS` (line 54): map materialId → {name,price} for the traded loot materials.
- `PRODUCTS` (line 55): map productId → {name,building,need,restore,price,cost,amount}.
- `RECIPES` (line 56): array of 2 equipment recipes {id,name,type,price,cost,bonus}.
- `DIFFICULTIES` (line 57): array of 5 hunt difficulties {id,name,mult,rebirths}.
- `REGION_DENSITY` (line 60): three monster-density levels {level,numeral,name,cap,other,every,otherEvery}.
- `MONSTER_SPEED_MULT` (line 68): global monster walk-speed multiplier (1.5).
- `MONSTER_ATTACK_RATE` (line 69): global monster attack-rate multiplier, interval divided by it (1.3).
- `DEFAULT_REGION_DENSITY` (line 70): density level used by saves without one (2).
- `HUNT_ZONE` (line 71): {x,z,radius} of the default hunting circle.
- `PILOT_ATTACK` (line 75): manual-pilot attack timing {cd,anim,recover} in seconds.
- `PILOT_ORB` (line 81): manual-pilot magic orb {speed,radius}.
- `AI_ATTACK_LOCK` (line 83): seconds an AI hunter stands still after attacking.
- `KITE` (line 95): ranged retreat tuning {enter,exit,minTime,maxTime,cooldown,stuckRest,afterShot,windup,look}.
- `PROVOKE` (line 98): provoked-monster aggro {time,aggro} seconds and cells.
- `MONSTER_RANGED` (line 104): map monsterId → ranged attack {range,every,speed,release,shot,lob,size,spin?}.
- `MSHOT_IMPACT` (line 113): atlas cell index of the ranged-shot impact effect (7).
- `CAMP` (line 114): {x,z} of the village-centre plaza camp.
- `SAVE_KEY` (line 115): localStorage key of the pixel save ('mistvale-pixel-v2').
- `LEGACY_LAYOUT_V15` (line 116): old default building layout, used for save migration.
- `LEGACY_LAYOUT_V16` (line 117): another old default layout, used for save migration.
- `ART_LAYOUT_HISTORY` (line 119): array of every past default layout, checked when loading a save.
- `LEGACY_LAYOUT_V17` (line 140): compact-grid v1 layout, also migrated on load.
- `LEGACY_LAYOUT_V14` (line 144): oldest known layout {buildingId:{x,z}}.

## src/pixel-game.js

Simulation core: world state, hunter AI, combat, dungeons, quests, offline progress and saves.

- `ENEMIES` (line 23): map monster id → {hp,attack,speed,gold,xp,drops}, including `boss`.
- `OFFLINE` (line 69): offline-progress limits {max: 8h in seconds, sample: 240 simulated seconds, warm: 60 of those excluded from the extrapolation rate} (2026-11-18, docs/BALANCE.md).
- `createGame(saved)` (line 90): builds the whole game state from a save (or fresh) and returns the API object below.

### `createGame()` return object

The public game API used by `pixel-ui.js` and the tests. Most mutators return `{ok, message}`.

- `state` (line 1334): the plain game state object (resources, hunters, buildings, enemies, log).
- `villageNav()` (line 1335): returns the village walk-grid and path function, for tests.
- `tick(dt)` (line 1336): advances the simulation by dt seconds in 0.1 s steps.
- `recruit(id)` (line 1341, may have drifted): invites a wanderer by id (success chance from affinity, see `recruitQuote(id)` / `recruitChance` / `AFFINITY`); a class id is the dev/test direct-hire path.
- `getUpgradeCost(buildingId)` (line 1317): returns the cost object for that building's next level.
- `construct(buildingId)` (line 1351): builds an unbuilt building if the spot is valid and paid.
- `upgrade(buildingId)` (line 1358): raises a built building one level, capped by the hall level.
- `tidyVillage()` (line 1370): snaps every building back to its `BLOCK_PLAN` block slot.
- `moveBuilding(buildingId, x, z)` (line 1384): moves or swaps a building to the block at x,z.
- `scaleBuilding(buildingId, factor)` (line 1401): multiplies building visual size, clamped to 0.6–1.6.
- `craft(productId, batches)` (line 1409): converts materials into product stock for the given batches.
- `craftEquipment(recipeId)` (line 1417): forges one weapon or armor into the shop stock.
- `enhance(hunterId)` (line 1424): raises that hunter's weapon level up to +10.
- `train(hunterId)` (line 1432): spends 20 hunter gold for a burst of experience.
- `learnSkill(hunterId)` (line 1443): raises the hunter's combat skill level up to 5.
- `reincarnate(hunterId)` (line 1450): rebirths a Lv.100 hunter, resetting level and keeping bonuses.
- `setDifficulty(difficultyId)` (line 1458): switches hunt difficulty and respawns the field monsters.
- `setTradeRequest(materialId, amount)` (line 1465): sets how many of a material the village buys.
- `heal()` (line 1470): heals all living hunters 45%, with a 40 s cooldown.
- `expedition()` (line 1475): spawns the boss and sends idle hunters to fight it.
- `retreatDungeon()` (line 1483): pulls the dungeon party out and walks them home.
- `setDungeonAuto(on)` (line 1484): toggles whether the party continues to the next floor.
- `setDungeonStart(floor)` (line 1485): chooses the floor the next dungeon run starts on.
- `startDungeon(hunterIds, startFloor)` (line 1486): sends 3 living hunters into the dungeon.
- `startArena(hunterIds)` (line 1502): sends 3 hunters to the training-ground NPC arena match.
- `offlineSnapshot()` (line 1518): records the baseline values that `offlineFinish` compares against.
- `simulate(seconds)` (line 1523): runs real simulation steps for offline catch-up, capped at 8 h.
- `offlineFinish(snap, totalSeconds)` (line 1524): extrapolates the rest of the offline time, returns a summary.
- `questList()` (line 1563): returns the quest chain as read-only {title,description,target,reward}.
- `claimQuest()` (line 1564): pays the finished quest reward and advances to the next quest.
- `setRally(x, z)` (line 1570): sets an outdoor rally point and re-routes every living hunter there.
- `exploreRegion(regionId)` (line 1576): switches to a wild region, spawns its monsters, sends hunters.
- `dispatchHunters(regionId, hunterIds)` (line 1585): sends all or chosen hunters to a region to hunt.
- `setDispatchTeam(index, patch)` (line 1608): edits a saved dispatch team's member ids or region.
- `dispatchTeam(index)` (line 1621): dispatches the saved team's region and members.
- `regionDensity(id)` (line 1631): returns that sign's density level, cap and label options.
- `setRegionDensity(id, level)` (line 1638): sets level 1–3 and culls extra idle monsters.
- `regionInfo(id)` (line 1655): read-only region detail: monsters, loot, alive count, team fit verdict.
- `recallHunters(regionId)` (line 1686): cancels hunt orders and returns hunters to town.
- `serialize()` (line 1693): returns a JSON-safe save copy without effects, shots, log.
- `pilotStart(hunterId)` (line 1694): hands a hunter to manual control.
- `pilotInput(dx, dz)` (line 1695): sets the manual movement direction.
- `pilotAttack()` (line 1696): flags one manual attack request.
- `pilotCooldown()` (line 1697): seconds until the manual attacker may strike again.
- `pilotLockLeft()` (line 1698): seconds of post-attack lock where movement is blocked.
- `pilotStop()` (line 1699): ends manual control and sends the hunter back to idle.
- `pilotState()` (line 1700): manual-control readout {id,x,z,hp,faceX,faceZ,atkAt,atkX,atkZ}.
- `setSetting(key, value)` (line 1701): validates and stores one quality/performance setting.
- `reset()` (line 1702): wipes the save and starts a fresh village.
- `cheat(name)` (line 1704): developer cheats: resources, levels, buildings, quest, heal, clear, wanderer, all.

## src/pixel-world.js

Pixel-art renderer: atlas sprites, portraits, building images, the isometric village map and its camera.

- `spriteDataURL(classId, rarity)` (line 141): returns an 84×90 data URL portrait of that class sprite.
- `drawPortrait(canvas, hunter, options)` (line 147): draws a hunter's idle portrait into a canvas (paperdoll front idle frame when the paperdoll renderer is on, else the hero sheet).
- `buildingDataURL(id)` (line 238): returns a data URL of that building's sprite, cached in memory.
- `MAP_PALETTE` (line 310): map of biome → base ground colour string.
- `MAP_ACCENT` (line 311): accent colours per surface type {grass,snow,desert,mountain,road,sea}.
- `createWorld(canvas, {onSelect,onPlace,getState})` (line 694): builds the renderer; returns update/resize/project/dispose plus camera, fog, sign and villager helpers.
- `createPixelWorld` (line 2846): alias of `createWorld`, the name the UI imports.

## src/paperdoll.js

Layered character + equipment animation engine (DV2 system port, docs/PAPERDOLL.md). Pure logic except `drawParts`.

- `DIR` (line 18): direction indices 0 up, 1 right, 2 down, 3 left, 4 upRight, 5 downRight, 6 downLeft, 7 upLeft.
- `MIRROR` (line 25): head/helmet direction remap for `headMirror` actions (DV2 SPPROCTYPE), extended to diagonals.
- `getSlot(af, tick)` (line 43): cumulative end-time table → slot index; wraps, handles negative ticks.
- `dir8to4(d, facing)` (line 74): 8-direction name/index → 0..3 (diagonals → up/down).
- `dirIndex(d, facing)` (line 89): any direction input → 0..7.
- `pickRow(rows, d)` (line 101): row for direction d, else diagonal → up/down → side fallback; returns {row, dir}.
- `resolveAction(data, name, weaponType)` (line 123): game action name (with direction suffix) → data action key.
- `actionTiming(data, name, weaponType)` (line 146): ticks/seconds, release and impact slot/tick/seconds of an action.
- `lookFromHunter(h, data)` (line 208): hunter (classId, equipment, weaponLevel) → paperdoll look.
- `computeParts(data, state)` (line 290): ordered draw records for one frame (no canvas).
- `drawParts(ctx, parts, images, origin, scale)` (line 445): draws computeParts output on a canvas.

## src/paperdoll-hero.js

In-game hookup behind the `?doll=hero` flag: maps sheetPose timing to paperdoll ticks and composes cached frames.

- `parseDollSpec(v)` (line 13): `'hero'` / `'hero:paladin,archer'` → flag spec, anything else → null.
- `dollDirName(vdir, facing)` (line 28): sheet vdir + facing → paperdoll 8-direction name.
- `dollActionTick(o)` (line 58): game moment (pose, atkAt, hitAt delay, HIT_STOP, …) → {action, tick, phase}.
- `advanceNoSkip(prev, cur, stamp, t, af)` (line 141): at most one slot per drawn frame within an attack/skill.
- `hurtChain(prev, hitAt, t, hurtLen)` (line 156): re-hits during a playing hurt continue it instead of restarting.
- `createDollHero(opts)` (line 165): loads data/images, `covers(classId)`, `compose(h, req)` with an LRU frame cache.

## src/paperdoll-lab.js

- `mountPaperdollLab(opts)` (line 20): `?doll=1` floating lab panel (class/action/8 directions/gear/tick/debug).

## src/pixel-ui.js

Interface layer: HUD, panels, modals, toasts, save/load, boot screen and offline summary. No exports.

## src/pixel-icons.js

Canvas icons for resources and buttons, procedural first then redrawn from the l0veyou atlas.

- `iconsReady()` (line 21): true once the icon atlas is loaded, or when the build has none.
- `iconCanvas(name)` (line 22): returns a 48 px (or 24 px fallback) canvas for that icon name.

## src/village-grid.js

Single source of truth for the 4×4 village board: block slots, streets, fence, exits, bounds.

- `TILE` (line 5): world size of one paving tile (0.5).
- `GAP` (line 6): five tiles of spacing between blocks and from the edge (2.5).
- `CELL` (line 7): reference footprint {w:4.4,d:3.6}, the largest building.
- `GRID` (line 8): board origin, pitch, street width and the col/row indices.
- `blockCenter(i, j)` (line 9): returns {x,z} world centre of block (i,j).
- `STREET_X` (line 11): x coordinates of the vertical street centrelines.
- `STREET_Z` (line 12): z coordinates of the horizontal street centrelines.
- `VILLAGE_BOUNDS` (line 16): rectangle {minX,maxX,minZ,maxZ} of the village area including the outer gap.
- `FENCE` (line 17): rectangle of the palisade line, inset 0.25 from the bounds.
- `EXIT_GAP` (line 18): half width of each fence gap (1.5).
- `EXITS` (line 23): four gate defs {id,side,x,z,out,street,edge} for the fence openings.
- `BLOCK_PLAN` (line 32): map "i,j" → building id or land use (plaza, market, park).
- `BUILDING_NUDGE` (line 39): per-building offset map; now empty after board alignment.
- `BUILDING_SLOTS` (line 40): map building id → {x,z,i,j} default slot centre.
- `BLOCKS` (line 41): array of blocks {i,j,use,x,z}.
- `blockAt(x, z)` (line 42): returns the block containing x,z, or null outside the board.
- `inVillageBounds(x, z)` (line 43): true when x,z is strictly inside `VILLAGE_BOUNDS`.

## src/village-nav.js

Village pathfinding: 0.5-cell walkable grid plus 8-direction A* reduced to few-bend polylines.

- `CELL` (line 6): navigation cell size (0.5).
- `createVillageNav(isOpen)` (line 9): builds the grid from an `isOpen(x,z)` predicate; returns {W,H,CELL,isOpenCell,cellCenter,nearestOpen,path,pathLength}.

## src/landscape-layout.js

Village layout geometry: doors, paving, palisade, solid footprints, ponds and the road network.

- `distanceSegment(x, z, a, b)` (line 4): shortest distance from a point to the segment a→b.
- `doorFoot(b, p)` (line 10): {x,z} of the doorstep point in front of building b at p.
- `pavedRings()` (line 12): returns the paved rectangles — the whole village bounds.
- `doorStand(b, p)` (line 14): doorstep position pulled outside the solid footprint when needed.
- `PALISADE` (line 21): array of solid palisade segments {id,side,minX,maxX,minZ,maxZ} split at the gaps.
- `SOLID`, `STATUE` (line 29): half-extents of a building footprint {x:2.3,z:1.9} and the statue's {x:.95,z:.7}.
- `buildingSolid(b, p)` (line 30): solid rectangle of building b placed at p.
- `statueSolid(plaza)` (line 31): solid rectangle of the statue on the plaza.
- `villagePonds(layout, levels)` (line 33): ellipses {x,z,rx,rz} for park ponds not taken by a building.
- `inPond(ponds, x, z, pad)` (line 37): true when the point lies inside any pond (with padding).
- `getRoads(layout, levels)` (line 38): street, exit and ring road segments; result carries `.paved`.
- `roadGraph(roads)` (line 55): splits roads at crossings; returns {nodes,edges,links} graph.
- `onRoad(x, z, roads, extra)` (line 70): true when within any road's half width plus extra.
- `onPaved(x, z, roads, extra)` (line 72): on a road or inside the paved village area.
- `roadStyle(x, z, roads)` (line 73): kind string of the road under the point, or null.
- `roadNodes(roads)` (line 74): deduplicated road endpoints that are walkable in the world.

## src/overworld.js

The 74×69 island world: coastline, seven ring hunting regions, biomes and the ring road.

- `WORLD` (line 8): world rectangle and metadata {minX,maxX,minZ,maxZ,width,height,area,seed}.
- `RING_ORDER` (line 12): region ids in counter-clockwise risk order.
- `inWorld(x, z)` (line 27): true when the point is land inside the irregular coastline.
- `regionEdge(id)` (line 64): {x,z} just outside the village on that region's axis.
- `regionCenter(id)` (line 65): {x,z} middle of that region's land band.
- `REGIONS` (line 77): region descriptor array {id,name,subtitle,color,description,enemy,risk,x,z}.
- `inVillage(x, z)` (line 80): true when inside the village bounds.
- `walkable(x, z)` (line 81): true when the point is land (same as `inWorld`).
- `wildAt(x, z)` (line 83): land outside the village, where monsters live.
- `biomeAt(x, z)` (line 84): biome id at the point: ocean, village or a region id.
- `regionAt(x, z)` (line 89): region descriptor object containing the point.
- `regionContains(id, x, z)` (line 91): true when the wild point belongs to that region.
- `randomRegionPoint(id, rnd)` (line 93): random land point in the region, away from village and ring road.
- `BIOME_PALETTE` (line 101): map biome id → colour string.
- `RING_ROAD_OFFSET` (line 107): distance of the ring road outside the village bounds (3.4).
- `RING_ROAD_HALF` (line 108): ring road half width in cells (1.05).
- `RING_ROAD` (line 109): closed polyline of ring-road points {x,z}.
- `ringRoadDistance(x, z)` (line 142): distance in cells from the point to the ring road.
- `nearestRingRoad(x, z)` (line 151): {index,distance} of the closest ring point.
- `onRingRoad(x, z, extra)` (line 163): true when standing on the ring road within extra tolerance.
- `ringPointAt(index)` (line 165): ring point at that index, wrapped and rounded.
- `ringRoadPath(a, b)` (line 167): ring points from index a to b along the shorter side.

## src/concept-ground.js

Generated ground classification sampled from the concept art into 0.5-cell rows. Do not hand edit.

- `CONCEPT_GROUND` (line 3): {x0,z0,step,w,h,rows} block with s/e/g/w/. row strings.
- `CONCEPT_TREES` (line 104): array of tree placements [x,z,variant,scale].
- `inConceptFrame(x, z)` (line 106): true when the world point falls inside the concept frame.
- `conceptGroundAt(x, z)` (line 107): ground letter at the point, '.' outside the block.

## src/concept-props.js

Prop, fence and character placements measured on the concept image, converted to world coordinates.

- `conceptToWorld(u, v)` (line 5): converts concept-image pixels to world {x,z}.
- `CONCEPT_PROPS` (line 8): array of [type,u,v,options] prop placements.
- `CONCEPT_FENCES` (line 32): array of [u1,v1,u2,v2] fence runs.
- `CONCEPT_PEOPLE` (line 38): array of decorative characters {cls|who,u,v,flip?}.

## src/lore.js

Monster codex: which monsters live in each region, their names and one-line descriptions.

- `REGION_MONSTERS` (line 4): map region id → three monster ids.
- `MONSTER_NAME` (line 5): map monster id → Chinese display name.
- `MONSTER_LORE` (line 6): map monster id → one short Chinese lore sentence.

## src/hero-chatter.js

Huntsman chatter: picks a short status, need or personality line for a hunter.

- `pickHeroLine(h, ctx)` (line 86): returns a line for hunter h using ctx {rnd,last,night}; null if none.
- `CHATTER_LINES` (line 108): the line pools {NEED,STATUS,CLASS_FIGHT,TRAIT,NIGHT,RICH} exposed for tests.

## src/asset-loading.js

Shared image-loading counter so the boot screen shows real progress and blocks on failures.

- `trackImage(im)` (line 8): registers an Image for progress counting; returns it.
- `deferSrc(im)` (line 15): holds an Image's src; returns a release function that starts the load.
- `markPhase(text)` (line 30): sets the current loading phase label.
- `assetProgress()` (line 31): returns {total,done,failed,phase,queued}.

## src/game.js

Old-version simulation core (pre-pixel), kept for reference only.

- `createGame(saved)` (line 75): builds the old village state and its API object.

## src/world.js

Old-version Three.js renderer with OrbitControls and merged geometry. Reference only.

- `createWorld(canvas, {onSelect})` (line 7): sets up the Three scene and returns its render API object.

## src/main.js

Old-version entry script wiring `game.js`, `world.js` and the SVG icon set. No exports.

## src/data.js

Old-version data tables: six buildings, three classes, hunt zone, camp and save key.

- `BUILDINGS` (line 1): array of old building defs {id,name,en,x,z,w,d,type,color,desc,cost,effect}.
- `CLASSES` (line 9): array of three old classes {id,name,tag,color,hp,attack,speed,cost}.
- `HUNT_ZONE` (line 14): {x,z,radius} of the old hunting circle.
- `CAMP` (line 15): {x,z} of the old village camp point.
- `SAVE_KEY` (line 16): old localStorage key ('mistvale-v1').

## src/gl-renderer.js

WebGL2 batch renderer that mimics a 2D context so the world drawing code can run on the GPU.

- `tagPattern(pat, img)` (line 12): remembers which image a CanvasPattern came from; returns the pattern.
- `createGLRenderer(canvas, {onLost,onRestored,budgetMB})` (line 40): returns null without WebGL2, else {gl,canvas,ctx,begin,composite,present,release,invalidate,lost,stats,resetStats}.
