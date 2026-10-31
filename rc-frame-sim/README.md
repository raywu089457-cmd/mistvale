# RC frame construction simulation

Interactive Three.js / WebGL model of a two-storey reinforced-concrete frame under construction. Every rebar is generated from parameters in `src/standards.js` and the rules in `src/model/`; nothing is downloaded or hand-placed.

- Frame: 2 storeys × 4 × 3 bays, 6.0 m × 5.0 m spans, 3.6 m floor-to-floor, Hn 3.00 m
- Columns 60 × 60 cm, beams 40 × 70 cm, slabs 15 cm, ground beams with column dowels
- 157 members, 8,037 bars, 480 mechanical couplers, 5,436 spacer blocks

## Run it

```bash
npm start          # installs three.js 0.186.1 on first run, then serves http://127.0.0.1:5173/
```

Requires Node 18+ and a WebGL 2 browser. Open the printed address. `PORT` and `HOST` env vars change the bind address.

## Tests

```bash
npm test           # Node: standards, geometry, clash, weight, timeline and determinism checks (32 tests)
npm run test:e2e   # Chromium via Playwright (start the app first; set PLAYWRIGHT_MODULE if Playwright is not installed)
```

## Controls

| Area | Control | Action |
| --- | --- | --- |
| Sequence | Play / Pause (Space) | start or stop the construction timeline |
| | Speed slider | 0 to 1× of the authored pacing, eased (no snapping) |
| | Time slider | scrub the timeline; every frame is a pure function of time |
| | Stage buttons 1–5 | jump to ground beams, 1F columns, 2F frame, 2F columns, roof frame |
| | Joint slow-mo | 0.08× through the 2F frame with the camera on one joint |
| Erection | Cutaway | formwork and concrete become transparent (depth sorted), cage stays opaque |
| | Explode slider / Explode / Assemble | three eased stages: storeys → members → bar groups; Assemble reverses |
| Layers | Columns, Beams, Slabs, Ground beams, Joint hoops, Couplers, Spacers, Formwork, Concrete, Site context | independent toggles |
| Storey | All / GB + 1F / 2F frame / Roof | storey filter |
| Camera | presets (Cinematic, South elevation, Joint 3B · 2F, Under 2F slab, Aerial) | eased interpolation between viewpoints |
| | Reset camera (R) | returns to the cinematic framing |
| | Orbit | drag to orbit, wheel to zoom, right-drag to pan |
| | Walk (WASD) | first person; Shift sprints; Esc leaves; eye height 1.60 m is gravity-locked; collides with columns, props, stores, scaffold and trench walls |
| Inspector | click any bar, coupler, spacer or member | drawing reference, bar mark, size, length, mass, quantity, tying time, governing rule |

Press **C** for cutaway, **E** to toggle explode, **A** to assemble.

## Standards and where they live

All numbers are in `src/standards.js`. Each parameter records whether it came from the brief (`brief`) or was assumed (`assumed`).

| Rule | Value used | Drawing | Code |
| --- | --- | --- | --- |
| Rebar nominal diameters (CNS 560) | #3 Ø9.53 … #14 Ø43.0 mm | — | `BAR_SIZES` |
| Column confinement zone ℓo | max(Hn/6, max(b,h), 45 cm), capped at H/2 → 60 cm | RC06 | `columnConfinementLength` |
| Column ties | 10 cm in ℓo, 15 cm in centre, first tie 5 cm from floor line | RC06 | `tieHeights` (rebar.js) |
| Crossties | one per tie level, 135°/90° hooks alternate | RC06 | `crossTieWire` |
| Hook extension | max(6 db, 7.5 cm) | RC04/RC06 | `hookExt` |
| Beam stirrups | first at 5 cm; S1 = min(h/4, 8db, 24ds, 30 cm, 15 cm) in 2h; S2 = min(h/2, 30 cm) | RC04 | `beamS1`, `beamS2`, `stationList` |
| Beam top / bottom bars | 3-#7 each, top bars continuous to the column and anchored 90° | RC04 | `genBeam` |
| Web bars | required only when d > 90 cm (d = 64 cm here → none) | RC04 | `beamEffectiveDepth` |
| Slab mats | #4@200 bottom both ways (two layers); top over supports 0.25 L; bearing ≥ 15 cm | RC07/RC08 | `genSlab` |
| Penetration | 100 mm sleeve → 2-D10 trimmers, mid-span, ≥ 1h from column | RC05 | `penetrationReinforcement` |
| Couplers | sleeve 3.5 db, OD 1.8 db, stagger ≥ 60 cm, SA / A grades | RC10 | `COUPLER`, `genColumn` |
| Cover | 4 cm columns and beams, 2 cm slabs | RC01 | `COVER` |
| Spacers | 5 × 4 × 5 cm, every 0.70 m under bottom bars | RC01 | `GEOM.spacerInterval` |

Every bar carries `drawing`, `rule`, `mark`, `dia`, `length`, `weight`, `t0` and `label`. The inspector shows them for any bar, including in exploded and cutaway views.

## Standards report (in the app, and tested)

| Check | Result |
| --- | --- |
| Column tie spacing in ℓo | 100.0 mm on all 400 pairs |
| Column tie spacing in centre | 150.0 mm on all 600 pairs |
| First column tie from floor line | 50.0 mm, both floors |
| First beam stirrup from column face | 50 mm |
| Beam stirrup spacing inside 2h | ≤ 150 mm on all pairs |
| Adjacent coupler stagger | ≥ 600 mm on every column face (0.75 m used) |
| Column cage alignment through the floor line | zero lateral offset, zero gap, all 20 positions |
| Bar-to-bar interpenetration | 0 clashes across 8,037 bars (0.5 mm tolerance) |
| Rebar mass | Σ(length × π/4·d²·7850) = 31.5 t, ≈ 105 kg/m³ gross concrete |
| Coupler clear cover | **flagged**: 40.6 mm against 2db = 44.5 mm (see below) |

## Assumptions and deviations (please review)

The brief leaves some things open, or its numbers conflict. These are the choices made, all recorded in `standards.js` and visible in the app:

1. **Beam top 10 cm above the slab top.** 3.6 m floor-to-floor, 3.0 m clear and a 0.70 m beam cannot all hold with a flush beam top (3.6 − 0.7 = 2.9 m), so the beam top is raised 10 cm.
2. **Ground beams 60 × 70 cm, earth cover 7.5 cm, dowel embedment 0.60 m.** The brief gives no ground-beam section.
3. **Anchorage Ld = max(0.30 m, 40 db).** The brief asks for Ld without a formula; this is a simplified, flagged rule.
4. **Couplers do not meet 2db clear cover.** With 4 cm column cover and #7 bars, the 40 mm sleeve leaves 40.6 mm to the face against 44.5 mm required. The model keeps 4 cm (RC01) and reports the conflict rather than adjusting either.
5. **Tie laps** sit 16 cm either side of each face centre, rotating through the four faces. The brief says "corners"; a corner lap would clash with the corner bar's hook geometry, and the face-centre lap is clash-free.
6. **Perimeter stirrups**: all 135° hooks face outward, as the brief says, so on perimeter beams the hooks do not alternate. Interior beams alternate.
7. **Beam bars hook into the columns** (90° legs at each face) and do not pass the core. Hook legs and tie rings are offset so no bar touches a tie.
8. **Opening reinforcement** is not modelled (the brief has no opening size). The beam penetration (RC05) is modelled as a 100 mm sleeve demonstration.
9. **Plywood and steel props** are simplified boxes and cylinders; plywood edges are square, not bevelled.
10. **Timeline** runs 320 s at 1×. It is a compressed sequence, not real calendar time. The 1× rate is the authored pacing.

## Not verified here

- **Frame rate ≥ 50 fps at 1920 × 1080** could not be measured. This sandbox renders WebGL in software, where a single frame takes seconds. The scene is about 1.7 M triangles in ~55 draw calls with one shadow map; it should be comfortably within budget on a desktop GPU, but that is a projection, not a measurement.
- Visual review was done from software-rendered screenshots, not a real GPU.

## Architecture

```
src/standards.js        the one authority for numbers and rule text
src/model/geom.js       pure geometry: rounded loops, hooks, crossties, paths
src/model/members.js    grid, members, concrete volumes, formwork pieces
src/model/rebar.js      every bar, coupler and spacer, with metadata
src/model/checks.js     segment clash search and tie-spacing sampling
src/model/schedule.js   deterministic timeline (tying order, formwork, pour)
src/model/explode.js    exploded-view offsets along authored axes
src/model/report.js     standards report shown in the app and tested
src/render/             merged geometry, GPU animation via data textures, site context
src/app/                controller, camera rig (orbit / walk / presets), CPU picking
tests/                  model.test.mjs (Node), e2e.mjs (browser)
```

Animation is driven entirely from data textures: explode offsets per member and bar group, pour and formwork fractions per member, and a time-sorted index so that each mesh's draw range is the set of bars tied by time `t`. Playback is deterministic: the same `t` and explode value always produce the same frame.
