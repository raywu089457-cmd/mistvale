# T68: 鐵脊山麓右邊界:道路轉角拉直線到最右邊

Status: done
Accept: auto

## Goal
Change the right-hand boundary of the 鐵脊山麓 (`mountain`) hunting region in `src/overworld.js`, where it meets 向陽草原 (`meadow`). Today the boundary is a ray from the village centre. Make it a straight line that starts at the corner of the road on that side (where the ring road around the village turns) and runs straight to the right edge of the world. Mountain stays on one side and meadow on the other. Every other region boundary stays as it is.

Spawn areas, wander areas and the terrain painting must all use the new boundary, so the ground colours, the region labels, the world map and region-membership tests agree with each other.

Accept: a checker in `tools/checks/` that fails on today's code. It samples points along the new line and just above and below it, and checks that their region ids flip exactly at the line, from the road corner to the right world edge. Then `npm test` must pass, including test-overworld.

Last, write before and after screenshots of that corner of the world (the same camera framing for both, the ground layer visible, region labels on) to `output/foothills-edge/before.png` and `after.png`, plus a side-by-side `compare.png` (at most 2000 px wide).
