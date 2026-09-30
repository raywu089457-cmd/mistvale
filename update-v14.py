from pathlib import Path

p=Path('src/pixel-game.js');s=p.read_text(encoding='utf-8')
s="import {getRoads,roadNodes,onRoad,arenaAt,ARENAS,arenaContains} from './landscape-layout.js';\n"+s
s=s.replace('let rects = [], graphNodes = [], graphEdges = [];','let rects = [], graphNodes = [], graphEdges = [], roads = [];\n  const rw=WORLD.width*2+3,rh=WORLD.height*2+3;let roadMask=new Uint8Array(rw*rh);\n  const roadPoint=(x,z)=>roadMask[Math.round((z-WORLD.minZ)*2)*rw+Math.round((x-WORLD.minX)*2)]===1;\n  function routeCost(a,b){const len=distance(a,b),n=Math.max(1,Math.ceil(len));let off=0;for(let i=0;i<=n;i++){const u=i/n;if(!roadPoint(a.x+(b.x-a.x)*u,a.z+(b.z-a.z)*u))off++;}return len*(1+3.4*off/(n+1));}')
s=s.replace('    graphNodes = [];','    roads=getRoads(state.layout,state.buildings);roadMask.fill(0);\n    for(let zi=0;zi<rh;zi++)for(let xi=0;xi<rw;xi++)if(onRoad(WORLD.minX+xi/2,WORLD.minZ+zi/2,roads,.1))roadMask[zi*rw+xi]=1;\n    graphNodes = [];')
s=s.replace('    for(const z of BRIDGES)for(const x of [riverX(z)-4,riverX(z),riverX(z)+4,16,36])graphNodes.push({x,z});\n    for(const z of [-38,-12,15,36,54])for(const x of [16,36])graphNodes.push({x,z});','    graphNodes.push(...roadNodes(roads).filter(p=>!blocked(p)));\n    graphNodes=[...new Map(graphNodes.map(p=>[`${p.x.toFixed(3)},${p.z.toFixed(3)}`,p])).values()];')
s=s.replace("if (lineClear(graphNodes[i], graphNodes[j])) {\n      const length = distance(graphNodes[i], graphNodes[j]);", "if (distance(graphNodes[i],graphNodes[j])<28 && lineClear(graphNodes[i], graphNodes[j])) {\n      const length = routeCost(graphNodes[i], graphNodes[j]);")
s=s.replace("if (lineClear(from, to)) return [{ ...to }];", "const sameArena=arenaAt(from.x,from.z,1);\n    if ((distance(from,to)<2.5 || (sameArena&&arenaContains(sameArena.id,to.x,to.z,1))) && lineClear(from,to))return [{...to}];")
s=s.replace("const length = distance(nodes[i], nodes[end]);", "const length = routeCost(nodes[i], nodes[end]);")
# Include the direct route as a candidate, not an unconditional off-road shortcut.
s=s.replace("    const lengths = nodes.map(() => Infinity)", "    if(lineClear(from,to)){const cost=routeCost(from,to);edges[count].push([count+1,cost]);edges[count+1].push([count,cost]);}\n    const lengths = nodes.map(() => Infinity)")
# Arena home anchors prevent monsters from dragging a fight into a travel corridor.
s=s.replace("state.enemies.push(e); return e;", "const home=arenaAt(p.x,p.z,3)||ARENAS.find(a=>a.id===state.region)||ARENAS[0];e.regionId=home.id;e.homeX=home.x;e.homeZ=home.z;state.enemies.push(e); return e;")
needle="      if (!target || distance(enemy, target) > (enemy.type === 'boss' ? 18 : 10)) continue;"
replace="""      if(!target || !arenaContains(enemy.regionId||state.region,target.x,target.z,.8)){
        const home={x:enemy.homeX??enemy.x,z:enemy.homeZ??enemy.z},dd=distance(enemy,home);if(dd>.7){const step=Math.min(ENEMIES[enemy.type].speed*dt,dd),p={x:enemy.x+(home.x-enemy.x)/dd*step,z:enemy.z+(home.z-enemy.z)/dd*step};if(!blocked(p)&&lineClear(enemy,p))Object.assign(enemy,p);}continue;
      }
      if (distance(enemy, target) > (enemy.type === 'boss' ? 18 : 10)) continue;"""
assert needle in s;s=s.replace(needle,replace)
s=s.replace("if (!inVillage(p.x,p.z) && !blocked(p) && lineClear(enemy, p))", "if (arenaContains(enemy.regionId||state.region,p.x,p.z,.2) && !inVillage(p.x,p.z) && !blocked(p) && lineClear(enemy, p))")
s=s.replace("const boss = spawn('boss', { x: HUNT_ZONE.x + 5, z: HUNT_ZONE.z - 6 });", "const arena=ARENAS.find(a=>a.id===state.region)||ARENAS[0];const boss = spawn('boss', { x:arena.x+2,z:arena.z-2 });")
p.write_text(s,encoding='utf-8')

p=Path('src/pixel-world.js');s=p.read_text(encoding='utf-8')
s="import {getRoads,roadStyle,onRoad,ARENAS,arenaAt,keepTallDecoration,canopyObscures} from './landscape-layout.js';\n"+s
# Generated sheet: every remaining facility receives its own detailed authored sprite.
needle="  const assets=globalThis.PIXEL_ASSETS||{};"
insert="""  const sheet=assets.buildings14;
  if(sheet&&!loadedAssetKeys.has('sheet14')){loadedAssetKeys.add('sheet14');const im=new Image();im.onload=()=>{
    const ids=['trading','restaurant','tavern','clinic','forge','academy','training','sanctuary','house','bounty','enhancement','dungeon'];
    const rows=[0,.326,.66,1];
    for(let i=0;i<ids.length;i++){const sx=Math.round((i%4)*im.width/4),ex=Math.round((i%4+1)*im.width/4),sy=Math.round(rows[Math.floor(i/4)]*im.height),ey=Math.round(rows[Math.floor(i/4)+1]*im.height),w=ex-sx,h=ey-sy;
      const cell=makeCanvas(w,h),cx=cell.getContext('2d');cx.drawImage(im,sx,sy,w,h,0,0,w,h);const data=cx.getImageData(0,0,w,h),d=data.data;let x0=w,y0=h,x1=0,y1=0;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){const j=(y*w+x)*4;if(d[j]>160&&d[j+2]>130&&d[j+1]<130&&d[j]>d[j+1]*1.5&&d[j+2]>d[j+1]*1.5)d[j+3]=0;if(d[j+3]>32){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}}
      cx.putImageData(data,0,0);if(x1>x0&&y1>y0){const out=makeCanvas(160,Math.round(160*(y1-y0+1)/(x1-x0+1))),og=out.getContext('2d');og.imageSmoothingEnabled=false;og.drawImage(cell,x0,y0,x1-x0+1,y1-y0+1,0,0,out.width,out.height);sharedAtlas||=new Map();sharedAtlas.set(ids[i],out);}
    }globalThis.dispatchEvent(new CustomEvent('pixel-assets-ready'));
  };im.onerror=()=>loadedAssetKeys.delete('sheet14');im.src=sheet;}
"""
assert needle in s;s=s.replace(needle,needle+'\n'+insert)
s=s.replace("const decorations=[],rand=rnd(349180);", "const decorations=[];let roads=getRoads(),landscapeKey='',terrainRevision=0;")
start=s.index('  const isRoad=');end=s.index('\n  function diamond',start);s=s[:start]+s[end:]
s=s.replace("  function generateGround(){\n", "  function generateGround(){\n    const rand=rnd(349180);decorations.length=0;roads=getRoads(state.layout||{},state.buildings||{});terrainRevision++;\n")
start=s.index('    const road=');end=s.index('\n    for(let z=WORLD',start);s=s[:start]+"    const road=(x,z)=>onRoad(x,z,roads);"+s[end:]
s=s.replace("if(road(x,z)&&biome!=='snow')", "const clearing=arenaAt(x,z);\n      if(clearing){const colors={meadow:'#aeb27d',forest:'#a4a77c',taiga:'#99aaa0',snow:'#e5eee7',mountain:'#b6b6a5',desert:'#e3c28a',birch:'#b9c18a'};diamond(gc,x,z,.51,.51,shade(colors[clearing.id]||'#b5b68a',n/2));if(rand()<.17)pixel(gc,p.x-2,p.y,3,1,shade(colors[clearing.id]||'#b5b68a',-13));continue;}\n      if(road(x,z))")
s=s.replace("inVillage(x,z)?'#aba994':'#b6a275'", "roadStyle(x,z,roads)==='stone'?'#aaa996':biome==='snow'?'#b8c5bf':'#b6a275'")
# Foundations follow saved placements, rather than painting obsolete default footprints.
s=s.replace("for(const b of BUILDINGS.filter(b=>b.id!=='dungeon')){diamond(gc,b.x,b.z,b.w*.67,b.d*.67,'#b3b09a');}", "for(const b of BUILDINGS.filter(b=>b.id!=='dungeon')){const p=state.layout?.[b.id]||b;diamond(gc,p.x,p.z,b.w*.6,b.d*.6,'#b3b09a');}")
s=s.replace("z+=2.45", "z+=3.6").replace("x+=2.65", "x+=3.9")
s=s.replace("if(REGIONS.some(a=>Math.hypot(xx-a.x,zz-a.z)<5)||BUILDINGS.some(b=>Math.abs(xx-b.x)<3.9&&Math.abs(zz-b.z)<4))continue;", "if(arenaAt(xx,zz,2)||BUILDINGS.some(b=>{const p=state.layout?.[b.id]||b;return Math.abs(xx-p.x)<4&&Math.abs(zz-p.z)<4.5;}))continue;")
s=s.replace("bio==='forest'?.78:bio==='taiga'?.72:bio==='birch'?.58:bio==='snow'?.42:bio==='meadow'?.16:.08", "bio==='forest'?.46:bio==='taiga'?.43:bio==='birch'?.34:bio==='snow'?.28:bio==='meadow'?.08:.04")
s=s.replace("size:.72+rand()*.33", "size:.62+rand()*.26")
# Clear the full projected silhouette: trunks outside a clearing must not overhang it.
needle="    decorations.sort((a,b)=>a.x+a.z-b.x-b.z);"
replacement="""    for(let i=decorations.length-1;i>=0;i--){const d=decorations[i];if(['tree','cactus','outcrop','ruins','cave'].includes(d.type)&&!keepTallDecoration(d,roads,state.layout||{}))decorations.splice(i,1);}
    for(const a of ARENAS){for(let i=0;i<16;i++){const t=i*Math.PI/8,p=worldPos(a.x+Math.cos(t)*a.rx,a.z+Math.sin(t)*a.rz);stone(gc,p.x-2,p.y-1,4,2);}decorations.push({type:'arenaFlag',x:a.x-a.rx-1,z:a.z,region:a,size:1});}
    decorations.sort((a,b)=>a.x+a.z-b.x-b.z);"""
assert needle in s;s=s.replace(needle,replacement)
# Taller towers retain native proportions instead of being vertically squashed.
s=s.replace("h=Math.min(86,Math.max(48,h));if(b.id==='training')h=Math.min(h,64);", "if(h>110){w*=110/h;h=110;}h=Math.max(48,h);")
# Tree crowns dynamically fade if an off-road actor still passes behind one.
old="if(d.type==='tree'){drawSprite(treeCanvases[d.variant],p,50*d.size,72*d.size,4);return;}"
new="if(d.type==='tree'){const obscured=[...(state.hunters||[]),...(state.enemies||[])].some(a=>a.hp>0&&a.x+a.z<d.x+d.z+.2&&canopyObscures(d.x,d.z,d.size,a.x,a.z,4));drawSprite(treeCanvases[d.variant],p,50*d.size,72*d.size,4,obscured?.18:1);return;}"
assert old in s;s=s.replace(old,new)
needle="    if(d.type==='mushroom')"
insert="""    if(d.type==='arenaFlag'){const ss=scale;pixel(g,p.x,p.y-26*ss,2*ss,28*ss,'#664b31');pixel(g,p.x+2*ss,p.y-25*ss,12*ss,12*ss,'#954f45');pixel(g,p.x+4*ss,p.y-22*ss,7*ss,2*ss,'#ead08c');if(scale>.6)uiLabels.push({text:d.region.name+' · 戰鬥空地',x:p.x,y:p.y-35*ss,color:'#f1dd9e'});return;}
"""
assert needle in s;s=s.replace(needle,insert+needle)
# Regenerate roads/clearance when a building is built or moved.
old="if(nextState)state=nextState;elapsed+="
new="if(nextState){state=nextState;const key=BUILDINGS.map(b=>`${b.id}:${state.buildings?.[b.id]>0}:${state.layout?.[b.id]?.x??b.x}:${state.layout?.[b.id]?.z??b.z}`).join('|');if(key!==landscapeKey){landscapeKey=key;generateGround();}}elapsed+="
assert old in s;s=s.replace(old,new)
s=s.replace("resize();render();return{update,resize,project,focus,setSelected,zoomBy,placeMode,setTime,setQuality,dispose};", "resize();render();return{update,resize,project,focus,setSelected,zoomBy,placeMode,setTime,setQuality,dispose,landscapeStats:()=>({trees:decorations.filter(d=>d.type==='tree').length,arenas:ARENAS.length,roads:roads.length,terrainRevision})};")
p.write_text(s,encoding='utf-8')
p=Path('build.mjs');s=p.read_text(encoding='utf-8').replace("['title','hall','inn','forge','clinic','tavern']", "['title','hall','inn','forge','clinic','tavern','buildings14']");p.write_text(s,encoding='utf-8')
print('v1.4 integrated: authored buildings, shared roads, road-preferred routing, open arenas and visibility clearance.')
