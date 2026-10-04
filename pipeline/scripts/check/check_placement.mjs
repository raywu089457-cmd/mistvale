// check_placement.mjs — 擺設合理性:實心物件不壓建築佔地/道路/柵欄/出村口、彼此不疊、村外不在戰鬥空地裡、都在陸地上。
// 用法:npm run build 後 node pipeline/scripts/check/check_placement.mjs
import path from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';import {execSync} from 'node:child_process';
const pw=await import(pathToFileURL(path.join(execSync('npm root -g').toString().trim(),'playwright','index.js')).href);const {chromium}=pw.default||pw;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const html=process.env.HTML||path.resolve(root,'../../outputs/暮影村.html');
const {getRoads,distanceSegment,arenaAt,PALISADE}=await import(pathToFileURL(path.join(root,'src/landscape-layout.js')).href);
const {BUILDINGS}=await import(pathToFileURL(path.join(root,'src/pixel-data.js')).href);
const {walkable,inVillage}=await import(pathToFileURL(path.join(root,'src/overworld.js')).href);
const {EXITS}=await import(pathToFileURL(path.join(root,'src/village-grid.js')).href);
const b=await chromium.launch();const p=await b.newPage();
await p.goto(pathToFileURL(html).href+'?preview=1',{waitUntil:'load',timeout:180000});await p.waitForTimeout(1500);await p.click('#start-button');
await p.waitForFunction(()=>globalThis.__mistvaleDecor&&globalThis.__mistvaleDecor().length>500,null,{timeout:60000});await p.waitForTimeout(1500);
const [dec,st]=await p.evaluate(()=>[__mistvaleDecor(),{layout:__mistvaleGame.state.layout,buildings:__mistvaleGame.state.buildings}]);await b.close();
const roads=getRoads(st.layout,st.buildings);
const FLAT=new Set(['flowers','wheat','cabbage','garden','frozenPond','plot','fenceRail','fence','gate','lamp','npc','animal','villager','rock','monument','bridgeRail']);
const SOLID=d=>!FLAT.has(d.type);
const R={tree:.6,cactus:.4,outcrop:1.1,cave:1.4,ruins:1.2,stall:.8,fruitStand:.7,tableSet:.6,handCart:.6,well:1,cliffLedge:1.3,snowDrift:.8,fallenLog:.7};
const rad=d=>(R[d.type]??.45)*(d.size||1);
const bad=[];const add=(why,d)=>{bad.push(`${why}: ${d.type}@${d.x.toFixed(1)},${d.z.toFixed(1)}`);};
const foot=BUILDINGS.filter(q=>st.buildings[q.id]!==0).map(q=>{const l=st.layout[q.id]||q;return{id:q.id,minX:l.x-q.w/2,maxX:l.x+q.w/2,minZ:l.z-q.d/2,maxZ:l.z+q.d/2};});
for(const d of dec){if(d.walk)continue;
 if(!walkable(d.x,d.z)&&inVillage(d.x,d.z))add('off-land',d);
 if(!SOLID(d))continue;
 if(foot.some(f=>d.x>f.minX-.1&&d.x<f.maxX+.1&&d.z>f.minZ-.1&&d.z<f.maxZ+.1))add('in building footprint',d);
 if(roads.some(r=>distanceSegment(d.x,d.z,r.a,r.b)<r.width*.85))add('on road',d);
 if(PALISADE.some(f=>d.x>f.minX-.25&&d.x<f.maxX+.25&&d.z>f.minZ-.25&&d.z<f.maxZ+.25))add('on fence',d);
 if(EXITS.some(e=>Math.hypot(d.x-e.out.x,d.z-e.out.z)<1.6||Math.hypot(d.x-e.x,d.z-e.z)<1.6))add('blocks gate',d);
 if(!inVillage(d.x,d.z)&&['tree','cactus','outcrop','cave','ruins','cliffLedge','boulders'].includes(d.type)&&arenaAt(d.x,d.z,0))add('inside arena',d);}
// 彼此疊在一起(只看村內實心道具,村外樹林本來就密)
const vs=dec.filter(d=>!d.walk&&SOLID(d)&&inVillage(d.x,d.z)&&d.type!=='tree');
for(let i=0;i<vs.length;i++)for(let j=i+1;j<vs.length;j++){const a=vs[i],c=vs[j];if(Math.hypot(a.x-c.x,a.z-c.z)<(rad(a)+rad(c))*.6)bad.push(`overlap: ${a.type}@${a.x.toFixed(1)},${a.z.toFixed(1)} × ${c.type}@${c.x.toFixed(1)},${c.z.toFixed(1)}`);}
const counts={};for(const x of bad){const k=x.split(':')[0];counts[k]=(counts[k]||0)+1;}
console.log(`decorations ${dec.length}, issues ${bad.length}`,counts);console.log(bad.slice(0,40).join('\n'));
process.exit(bad.length?1:0);
