from pathlib import Path
p=Path('src/pixel-game.js');s=p.read_text(encoding='utf-8')
s="import {WORLD,REGIONS,BRIDGES,riverX,walkable,inVillage,regionAt} from './overworld.js';\n"+s
s=s.replace("const blocked = p => rects.some", "const blocked = p => !walkable(p.x,p.z) || rects.some")
s=s.replace("  function lineClear(a, b) {\n", "  function lineClear(a, b) {\n    const steps=Math.ceil(distance(a,b)/.5);for(let i=0;i<=steps;i++){const u=steps?i/steps:0;if(!walkable(a.x+(b.x-a.x)*u,a.z+(b.z-a.z)*u))return false;}\n")
s=s.replace("    // The village has at most 14 buildings.", "    for(const z of BRIDGES)for(const x of [riverX(z)-4,riverX(z),riverX(z)+4,16,36])graphNodes.push({x,z});\n    for(const z of [-38,-12,15,36,54])for(const x of [16,36])graphNodes.push({x,z});\n    // The village has at most 14 buildings.")
s=s.replace("clamp(point.x + Math.cos(i * Math.PI / 8) * radius, -19, 28)","clamp(point.x + Math.cos(i * Math.PI / 8) * radius, WORLD.minX+1, WORLD.maxX-1)").replace("clamp(point.z + Math.sin(i * Math.PI / 8) * radius, -19, 21)","clamp(point.z + Math.sin(i * Math.PI / 8) * radius, WORLD.minZ+1, WORLD.maxZ-1)")
s=s.replace("route(h, h.x < GATE.x ? [GATE, target] : [target]);", "route(h, inVillage(h.x,h.z) ? [GATE, target] : [target]);")
s=s.replace("route(h, h.x >= GATE.x && buildingId !== 'dungeon' ? [GATE, door(buildingId)] : [door(buildingId)]);", "route(h, !inVillage(h.x,h.z) && buildingId !== 'dungeon' ? [GATE, door(buildingId)] : [door(buildingId)]);")
s=s.replace("const p = safePoint(position ?? { x: 12 + random() * 13, z: -8 + random() * 14 }), data = ENEMIES[type], multiplier = DIFFICULTIES[state.difficulty].mult;", "const region=REGIONS.find(r=>r.id===state.region)||REGIONS[1];\n    const p = safePoint(position ?? { x: region.x-4+random()*8, z: region.z-4+random()*8 }), data = ENEMIES[type], multiplier = DIFFICULTIES[state.difficulty].mult*(position?1:region.risk);")
s=s.replace("const available = state.enemies.filter(e => e.hp > 0);", "const available = state.enemies.filter(e => e.hp > 0);")
s=s.replace("target && h.x >= GATE.x - 0.2 && distance(h, target) <= h.range", "target && !inVillage(h.x,h.z) && distance(h, target) <= h.range")
s=s.replace("if (h.x < GATE.x - 0.2) {", "if (inVillage(h.x,h.z)) {")
s=s.replace("h.hp > 0 && h.x >= GATE.x && h.task", "h.hp > 0 && !inVillage(h.x,h.z) && h.task")
s=s.replace("Math.max(9, enemy.x + (target.x - enemy.x) / d * delta)","clamp(enemy.x + (target.x - enemy.x) / d * delta,WORLD.minX+1,WORLD.maxX-1)")
s=s.replace("if (!blocked(p) && lineClear(enemy, p))", "if (!inVillage(p.x,p.z) && !blocked(p) && lineClear(enemy, p))")
s=s.replace("version: 2, gold:","version: 2, worldRevision: 3, region: 'meadow', visitedRegions:['village','meadow'], gold:")
s=s.replace("    for (const key of RESOURCE_KEYS) state[key]", "    state.region=REGIONS.some(r=>r.id===source.region&&r.id!=='village')?source.region:'meadow';\n    state.visitedRegions=[...new Set(['village','meadow',...(Array.isArray(source.visitedRegions)?source.visitedRegions.filter(id=>REGIONS.some(r=>r.id===id)):[])])];\n    for (const key of RESOURCE_KEYS) state[key]")
s=s.replace("clamp(source.rally.x, 9, 27)","clamp(source.rally.x,WORLD.minX+1,WORLD.maxX-1)").replace("clamp(source.rally.z, -14, 12)","clamp(source.rally.z,WORLD.minZ+1,WORLD.maxZ-1)")
s=s.replace("number(raw.x, CAMP.x, -19, 28)","number(raw.x,CAMP.x,WORLD.minX+1,WORLD.maxX-1)").replace("number(raw.z, CAMP.z, -19, 21)","number(raw.z,CAMP.z,WORLD.minZ+1,WORLD.maxZ-1)")
s=s.replace("number(raw.x, 16, 9, 28)","number(raw.x,16,WORLD.minX+1,WORLD.maxX-1)").replace("number(raw.z, -2, -14, 12)","number(raw.z,-2,WORLD.minZ+1,WORLD.maxZ-1)")
s=s.replace("if (!Number.isFinite(x) || !Number.isFinite(z) || x < 9 || x > 27 || z < -14 || z > 12 || blocked({ x, z }))", "if (!walkable(x,z) || inVillage(x,z) || blocked({ x, z }))")
s=s.replace("route(h, h.x < GATE.x ? [GATE, state.rally] : [state.rally]);", "route(h, inVillage(h.x,h.z) ? [GATE, state.rally] : [state.rally]);")
needle="    serialize() {"
insert='''    exploreRegion(regionId) {
      const region=REGIONS.find(r=>r.id===regionId&&r.id!=='village');if(!region)return result(false,'請選擇村外的生態區。');
      if(state.expedition.active)return result(false,'請先結束目前的首領討伐。');
      state.region=region.id;state.rally=safePoint(region);if(!state.visitedRegions.includes(region.id))state.visitedRegions.push(region.id);
      state.enemies=state.enemies.filter(e=>e.type==='boss');for(let i=0;i<6;i++)spawn(i<4?region.enemy:i===4?'slime':'wolf');
      for(const h of state.hunters)if(!h.task&&h.hp>0){h.targetId=null;h.rallying=true;h.status='出征中';route(h,inVillage(h.x,h.z)?[GATE,state.rally]:[state.rally]);}
      log(`已派遣獵人前往${region.name}。隊伍會經由橋樑穿越河流。`,'success');return result(true,`出發探索${region.name}！`);
    },
'''
assert needle in s;s=s.replace(needle,insert+needle)
p.write_text(s,encoding='utf-8')
print('Simulation uses expanded bounds, bridge-safe navigation and regional hunting.')
