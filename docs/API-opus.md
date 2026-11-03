# API reference (Claude sample: 4 files)

## village-grid.js
Single source for the 4×4 village layout: block centers, streets, fence, exits, building slots.
- `TILE` (5): paving tile edge, 0.5 world units.
- `GAP` (6): 5 tiles of spacing between buildings and to the village edge.
- `CELL` (7): base building footprint {w:4.4,d:3.6} (the town hall, the largest).
- `GRID` (8): layout params {cx,cz,pitchX,pitchZ,street,cols,rows}; columns/rows -2..1.
- `blockCenter(i,j)` (9): world center of block column i, row j.
- `STREET_X` (11), `STREET_Z` (12): street center lines between blocks, plus both outer edges.
- `VILLAGE_BOUNDS` (16): village rectangle {minX,maxX,minZ,maxZ}: outer buildings plus GAP.
- `FENCE` (17): palisade rectangle, 0.25 inside the bounds.
- `EXIT_GAP` (18): half-width of a fence gap (1.5).
- `EXITS` (23): four exits (north/east/south/west) {id,side,x,z,out,street,edge}, at fence midpoints.
- `BLOCK_PLAN` (32): map "i,j" → block use (building id, plaza, market, park).
- `BUILDING_NUDGE` (39): per-use position offsets {x,z}; currently empty.
- `BUILDING_SLOTS` (40): use → default {x,z,i,j} for each planned building.
- `BLOCKS` (41): array of {i,j,use,x,z} for every planned block.
- `blockAt(x,z)` (42): block containing the point, or null.
- `inVillageBounds(x,z)` (43): true if strictly inside VILLAGE_BOUNDS.

## village-nav.js
Free-movement pathfinding inside the village: 0.5-unit open-cell grid, 8-direction A*, fewest-turns smoothing.
- `CELL` (6): nav cell size, 0.5.
- `createVillageNav(isOpen)` (9): builds the grid from `isOpen(x,z)`; returns {W,H,CELL,isOpenCell,cellCenter,nearestOpen,path,pathLength}.
  - `path(a,b)`: waypoints from a to b (excludes a, ends exactly at b), or null if unreachable.
  - `nearestOpen(x,z)`: closest open cell center (search radius 24 cells), or null.
  - `pathLength(from,pts)`: total length of a waypoint list.

## landscape-layout.js
Village roads, ponds, collision boxes and paving, derived from the layout.
- `distanceSegment(x,z,a,b)` (4): distance from a point to a segment.
- `doorFoot(b,p)` (10): point just below building b's door at position p.
- `pavedRings()` (12): paved area list; one rectangle covering the whole village.
- `doorStand(b,p)` (14): where a hero stands to use building b's door.
- `PALISADE` (21): fence geometry for drawing and collision.
- `SOLID` (29), `STATUE` (29): half-sizes of a building box and the plaza statue box.
- `buildingSolid(b,p)` (30): collision rectangle for building b at p.
- `statueSolid(plaza)` (31): collision rectangle for the plaza statue.
- `villagePonds(layout,levels)` (33): ponds in park blocks that no building (or the dungeon) occupies.
- `inPond(ponds,x,z,pad)` (37): true if the point is inside any pond ellipse (+pad).
- `getRoads(layout,levels)` (38): all roads: stone streets, exit spurs, the ring road; result has `.paved`.
- `roadGraph(roads)` (55): splits roads at crossings into {nodes,edges,links} for walking.
- `onRoad(x,z,roads,extra)` (70): true if within a road's width (+extra).
- `onPaved(x,z,roads,extra)` (72): onRoad or inside a paved rectangle.
- `roadStyle(x,z,roads)` (73): kind of the road under the point ('stone','ring',...) or null.
- `roadNodes(roads)` (74): unique road endpoints that are walkable.

## overworld.js
World size, the seven hunting regions around the village, biomes, and the ring road.
- `WORLD` (8): world bounds and size {minX..maxZ,width:74,height:69,seed}.
- `RING_ORDER` (12): region ids counterclockwise from the village's right.
- `inWorld(x,z)` (27): true if the point is on land (inside the irregular coast).
- `regionEdge(id)` (64), `regionCenter(id)` (65): the region's entry point on the village side / its center.
- `REGIONS` (77): list of region records (village first) with their centers.
- `inVillage(x,z)` (80): same as inVillageBounds.
- `walkable(x,z)` (81): same as inWorld.
- `wildAt(x,z)` (83): on land and outside the village.
- `biomeAt(x,z)` (84): 'ocean', 'village', or the region id.
- `regionAt(x,z)` (89): region record for the point (village inside the fence).
- `regionContains(id,x,z)` (91): wild point belongs to region id.
- `randomRegionPoint(id,rnd)` (93): random spawn point in the region, not near the village or on the ring road.
- `BIOME_PALETTE` (101): biome → ground color.
- `RING_ROAD_OFFSET` (107): ring road distance from the village edge (3.4).
- `RING_ROAD_HALF` (108): ring road half width (1.05).
- `RING_ROAD` (109): closed polyline of {x,z} points around the village.
- `ringRoadDistance(x,z)` (142): distance to the ring road.
- `nearestRingRoad(x,z)` (151): {index (fractional position on the ring), distance} of the nearest point.
- `onRingRoad(x,z,extra)` (163): within road half width (+extra).
- `ringPointAt(index)` (165): ring point at index (rounded, wraps).
- `ringRoadPath(a,b)` (167): waypoints along the shorter way around the ring from index a to b.
