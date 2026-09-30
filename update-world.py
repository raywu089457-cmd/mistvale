from pathlib import Path
p=Path('src/pixel-world.js')
s=p.read_text(encoding='utf-8')
s=s.replace("import { BUILDINGS, CLASSES, RARITIES } from './pixel-data.js';", "import { BUILDINGS, CLASSES, RARITIES } from './pixel-data.js';\nimport {WORLD,REGIONS,BRIDGES,riverX,biomeAt,BIOME_PALETTE,inVillage,isBridge} from './overworld.js';")
start=s.index('function ensureAtlas() {');end=s.index('\nfunction treeSprite',start)
s=s[:start]+'''const loadedAssetKeys=new Set();
function ensureAtlas() {
  const assets=globalThis.PIXEL_ASSETS||{};
  for(const b of BUILDINGS){const src=assets[b.id];if(!src||loadedAssetKeys.has(b.id))continue;loadedAssetKeys.add(b.id);
    const im=new Image();im.onload=()=>{const cell=makeCanvas(im.width,im.height),c=cell.getContext('2d');c.drawImage(im,0,0);const pixels=c.getImageData(0,0,im.width,im.height),d=pixels.data;let x0=im.width,y0=im.height,x1=0,y1=0;
      for(let y=0;y<im.height;y++)for(let x=0;x<im.width;x++){const j=(y*im.width+x)*4;if(d[j]>160&&d[j+2]>130&&d[j+1]<130&&d[j]>d[j+1]*1.5&&d[j+2]>d[j+1]*1.5)d[j+3]=0;if(d[j+3]>32){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}}
      c.putImageData(pixels,0,0);if(x1>x0&&y1>y0){const out=makeCanvas(144,Math.round(144*(y1-y0+1)/(x1-x0+1))),g=out.getContext('2d');g.imageSmoothingEnabled=false;g.drawImage(cell,x0,y0,x1-x0+1,y1-y0+1,0,0,out.width,out.height);sharedAtlas||=new Map();sharedAtlas.set(b.id,out);globalThis.dispatchEvent(new CustomEvent('pixel-assets-ready'));}
    };im.onerror=()=>loadedAssetKeys.delete(b.id);im.src=src;
  }
}
''' + s[end:]
start=s.index('function treeSprite(');end=s.index('\nconst enemyCache',start)
s=s[:start]+'''function treeSprite(seed=0,type=0) {
 const c=makeCanvas(58,84),g=c.getContext('2d'),r=rnd(seed),snow=type===3,birch=type===2,pine=type===0||snow;
 pixel(g,25,44,7,34,'#273d32');pixel(g,26,45,5,32,birch?'#e6e4c7':'#815c38');pixel(g,26,49,2,25,birch?'#ffffde':'#b58b54');pixel(g,21,77,18,3,'#49613d');
 if(birch)for(let i=0;i<6;i++)pixel(g,26+i%2,48+i*5,4-i%2,2,'#66685c');
 const pal=snow?['#304b50','#547571','#b4d8d3','#e8f3e5']:pine?['#243f37','#345e43','#538347','#7ca658']:birch?['#3b542d','#678641','#a1b85a','#d4d77d']:['#263f2d','#47733b','#78a24d','#a9c46b'];
 const blobs=pine?[[29,14,8,12],[29,28,15,12],[29,42,21,12],[29,56,26,12]]:[[29,15,14,12],[16,30,15,16],[40,28,16,15],[26,42,23,18],[42,48,12,13],[13,47,11,12]];
 const inside=(x,y)=>blobs.some(([cx,cy,rx,ry])=>((x-cx)/rx)**2+((y-cy)/ry)**2<1);
 for(let y=1;y<70;y++)for(let x=2;x<56;x++)if(inside(x,y)){
   const edge=!inside(x-1,y)||!inside(x+1,y)||!inside(x,y-1)||!inside(x,y+1),cluster=Math.sin(x*.53+y*.34)*Math.cos(y*.77-x*.21),light=(1-x/58)*.52+(1-y/80)*.4+cluster*.23;
   const k=edge?0:light>.66?3:light>.40?2:1;pixel(g,x,y,1,1,pal[k]);if(!edge&&r()<.07)pixel(g,x,y,2,1,pal[Math.max(1,k-1)]);
 }
 if(snow){for(let i=0;i<24;i++){const x=6+r()*45,y=12+r()*46;if(inside(x,y))pixel(g,x,y,3,1,'#f2f6df');}}
 return c;
}
''' + s[end:]
s=s.replace("const ground=makeCanvas(1700,1000)","const ground=makeCanvas(2400,1450)").replace("const groundOrigin={x:850,y:410}","const groundOrigin={x:1100,y:560}")
s=s.replace("treeCanvases=Array.from({length:8},(_,i)=>treeSprite(i*782+19,i%3===0?1:0))", "treeCanvases=Array.from({length:16},(_,i)=>treeSprite(i*782+19,i%4))")
start=s.index('  function generateGround(){');end=s.index('\n  generateGround();',start)
s=s[:start]+'''  function generateGround(){
    gc.fillStyle='#417d90';gc.fillRect(0,0,ground.width,ground.height);
    const road=(x,z)=>isRoad(x,z)||(x>6&&Math.abs(z-43)<.65)||(x>6&&Math.abs(z+23)<.65)||(x>34&&Math.abs(x-43)<.7)||(x<21&&Math.abs(x-15)<.7&&z<-14);
    for(let z=WORLD.minZ;z<WORLD.maxZ;z++)for(let x=WORLD.minX;x<WORLD.maxX;x++){
      const p=worldPos(x,z),biome=biomeAt(x,z),base=BIOME_PALETTE[biome],n=Math.floor(rand()*13)-6,col=shade(base,n);diamond(gc,x,z,1,.995,col);
      if(biome==='ocean'||biome==='river'||biome==='ice'){if(rand()<.4)pixel(gc,p.x-4,p.y,4+rand()*6,1,biome==='ice'?'#d1edeb':'#89c4c6');if(biome==='river')pixel(gc,p.x-2,p.y+2,4,1,'#347887');continue;}
      if(biome==='bridge'){diamond(gc,x,z,.98,.97,'#79583b');for(let i=-3;i<4;i+=2)pixel(gc,p.x-7,p.y+i,14,1,i%3?'#c3a16b':'#947245');continue;}
      if(road(x,z)&&biome!=='snow'){diamond(gc,x,z,1,.98,inVillage(x,z)?'#aba994':'#b6a275');for(let i=0;i<4;i++){const dx=(i%2)*7-6,dy=Math.floor(i/2)*3-2;pixel(gc,p.x+dx,p.y+dy,6,2,rand()>.5?'#c9c3a6':'#939a85');pixel(gc,p.x+dx,p.y+dy,5,1,'#dbd1b0');}continue;}
      if(biome==='desert'){pixel(gc,p.x-5+rand()*7,p.y-2,4,1,'#eed298');if(rand()<.24)pixel(gc,p.x,p.y+2,3,1,'#bb935e');}
      else if(biome==='mountain'){pixel(gc,p.x-5,p.y-2,5,2,'#bfc0b2');pixel(gc,p.x+2,p.y,4,1,'#777f7b');if(rand()<.12)pixel(gc,p.x,p.y,2,2,'#bf9974');}
      else if(biome==='snow'){if(rand()<.4)pixel(gc,p.x-4,p.y-1,6,1,'#f1f3df');if(rand()<.15)pixel(gc,p.x+1,p.y+1,3,1,'#a8c9cb');}
      else {if(rand()<.65){pixel(gc,p.x-3,p.y-2,2,3,shade(base,-20));pixel(gc,p.x,p.y-1,2,2,shade(base,24));}if(rand()<.15){pixel(gc,p.x+3,p.y-2,2,1,'#c2c982');pixel(gc,p.x+1,p.y,1,2,shade(base,-12));}}
    }
    // An irregular paved square, clipped stone edges and distinct village approaches.
    for(let z=-1.8;z<6.3;z+=.7)for(let x=-7;x<2.4;x+=.8){const p=worldPos(x,z);pixel(gc,p.x-3,p.y-1,7,3,'#879280');pixel(gc,p.x-2,p.y-1,5,2,rand()>.45?'#d1c5a7':'#b4b79e');}
    for(const b of BUILDINGS.filter(b=>b.id!=='dungeon')){diamond(gc,b.x,b.z,b.w*.67,b.d*.67,'#b3b09a');}
    diamond(gc,-18,9,2.8,5.6,'#745536');for(let z=4.2;z<14.5;z+=.6)for(let x=-20;x<-16;x+=.6){const p=worldPos(x,z);pixel(gc,p.x,p.y-4,1,5,'#ba973d');pixel(gc,p.x-1,p.y-3,3,1,'#eac665');pixel(gc,p.x,p.y-5,1,2,'#f1dc8e');}
    // Small decorative fishing pond; the main river is an actual navigation boundary.
    diamond(gc,-19,-23,3.4,2.7,'#bbbc8a');diamond(gc,-19,-23,2.9,2.2,'#609da2');
    for(let z=WORLD.minZ+3;z<WORLD.maxZ-2;z+=2.45)for(let x=WORLD.minX+3;x<WORLD.maxX-2;x+=2.65){
      const xx=x+rand()*.9,zz=z+rand()*.9,bio=biomeAt(xx,zz);if(['ocean','river','ice','bridge'].includes(bio)||road(xx,zz))continue;
      if(inVillage(xx,zz)&&rand()>.08)continue;
      if(REGIONS.some(a=>Math.hypot(xx-a.x,zz-a.z)<5)||BUILDINGS.some(b=>Math.abs(xx-b.x)<3.9&&Math.abs(zz-b.z)<4))continue;
      const chance=bio==='forest'?.78:bio==='taiga'?.72:bio==='birch'?.58:bio==='snow'?.42:bio==='meadow'?.16:.08;
      if(rand()<chance){const type=bio==='taiga'?0:bio==='snow'?3:bio==='birch'?2:1;decorations.push({type:'tree',x:xx,z:zz,variant:type+Math.floor(rand()*4)*4,size:.72+rand()*.33});}
      else if(bio==='desert'&&rand()<.23)decorations.push({type:'cactus',x:xx,z:zz,size:.8+rand()*.5});
      else if(bio==='mountain'&&rand()<.62)decorations.push({type:'outcrop',x:xx,z:zz,size:1+rand()*.7});
      else if(rand()<.22)decorations.push({type:bio==='snow'?'rock':'flowers',x:xx,z:zz,variant:Math.floor(rand()*5),size:1});
    }
    for(const [x,z,v]of[[-17,-9,1],[-17,0,5],[-15,19,1],[-6,20,2],[7,19,6],[10,-14,0],[12,11,1],[-21,13,2]])decorations.push({type:'tree',x,z,variant:v,size:.86});
    decorations.push({type:'fountain',x:-1.9,z:3.2,size:.6},{type:'well',x:-9.5,z:17.8,size:.56});
    for(let z=-17;z<19;z+=.85){if(z>-1&&z<5)continue;decorations.push({type:'fence',x:9,z,size:1});}
    for(const z of[-1,5])decorations.push({type:'gate',x:9.1,z,size:1});
    for(const[x,z]of[[-7,4],[-7,-5],[1,4],[1,11],[-7,12],[7,2],[13,2]])decorations.push({type:'lamp',x,z,size:1});
    for(const z of BRIDGES)for(let i=-4;i<=4;i++){decorations.push({type:'bridgeRail',x:riverX(z)+i,z:z-1.5,size:1},{type:'bridgeRail',x:riverX(z)+i,z:z+1.5,size:1});}
    for(const r of REGIONS.filter(r=>r.id!=='village')){decorations.push({type:'signpost',x:r.x-3,z:r.z+3,region:r,size:1});}
    decorations.push({type:'cave',x:48,z:-35,size:1.2},{type:'ruins',x:49,z:46,size:1},{type:'ruins',x:-17,z:39,size:1});
    for(let i=0;i<10;i++)decorations.push({type:'animal',x:13+rand()*8,z:12+rand()*7,variant:i%3,phase:rand()*6,size:1});
    decorations.sort((a,b)=>a.x+a.z-b.x-b.z);
  }
''' + s[end:]
# Native interface, correctly bound to original map coordinates.
s=s.replace("const n=Math.max(.5,Math.min(1.06,width/670,(height-68)/370))", "const n=Math.max(.62,Math.min(1.18,width/570,(height-56)/300))")
s=s.replace("if(id==='hunt')pos={x:20,z:0};", "if(id==='world'){target={x:45,y:75};scale=Math.min(width/1750,(height-55)/910);return;}if(id.startsWith?.('region:'))pos=REGIONS.find(r=>r.id===id.slice(7));else if(id==='hunt')pos={x:17,z:3};")
s=s.replace("scale=Math.max(baseScale*.7,Math.min(2.7,scale*factor))", "scale=Math.max(.24,Math.min(2.7,scale*factor))")
s=s.replace("target.x=Math.max(-420,Math.min(450,target.x));target.y=Math.max(-220,Math.min(250,target.y))", "target.x=Math.max(-800,Math.min(925,target.x));target.y=Math.max(-370,Math.min(560,target.y))")
s=s.replace("const w", "const w",1)
s=s.replace("for(const d of decorations)all.push({sort:d.x+d.z,type:'decor',data:d});", "for(const d of decorations){const p=screenPoint(d.x,d.z);if(p.x>-100&&p.x<width+100&&p.y>-40&&p.y<height+130)all.push({sort:d.x+d.z,type:'decor',data:d});}")
s=s.replace("if(scale<.72){const p=screenPoint(21,7);textLabel('暮林狩獵區',p.x,p.y+10,{color:'#f6df9b',size:8});}", "if(scale<.6){for(const r of REGIONS){const p=screenPoint(r.x,r.z);textLabel(r.name,p.x,p.y+14,{color:'#ffe6a6',size:8});}}")
# Distinct detailed vegetation, wildlife and exploration landmarks.
needle="    if(d.type==='tree'){drawSprite(treeCanvases[d.variant],p,50*d.size,72*d.size,4);return;}"
extra='''    if(d.type==='flowers'){const cols=['#f4e7ad','#e9b057','#d98691','#99b6e0','#eee8cd'];for(let i=0;i<4;i++){const x=p.x+(i*3-5)*scale,y=p.y-(2+i%2)*scale;pixel(g,x,y,1,4*scale,'#4d733d');pixel(g,x-scale,y-scale,3*scale,2*scale,cols[(d.variant+i)%5]);pixel(g,x,y-scale,scale,scale,'#e7c363');}return;}
    if(d.type==='cactus'){const s=scale*d.size;pixel(g,p.x-3*s,p.y-28*s,7*s,30*s,'#365d3a');pixel(g,p.x-2*s,p.y-27*s,4*s,27*s,'#76904c');pixel(g,p.x-1*s,p.y-25*s,s,25*s,'#a8ad65');pixel(g,p.x-9*s,p.y-18*s,6*s,5*s,'#4f773f');pixel(g,p.x-10*s,p.y-25*s,4*s,11*s,'#698948');pixel(g,p.x+4*s,p.y-14*s,6*s,4*s,'#4d713c');pixel(g,p.x+7*s,p.y-21*s,4*s,10*s,'#829b55');for(let k=0;k<5;k++)pixel(g,p.x+2*s,p.y-(5+k*4)*s,s,s,'#d6d29b');return;}
    if(d.type==='outcrop'||d.type==='cave'||d.type==='ruins'){const s=scale*d.size,hh=d.type==='cave'?38:d.type==='ruins'?28:17;polygon(g,[[p.x-19*s,p.y],[p.x-17*s,p.y-hh*s],[p.x+8*s,p.y-(hh+5)*s],[p.x+22*s,p.y-12*s],[p.x+20*s,p.y+7*s],[p.x-6*s,p.y+10*s]],'#565e5e');polygon(g,[[p.x-17*s,p.y-hh*s],[p.x+8*s,p.y-(hh+5)*s],[p.x+19*s,p.y-12*s],[p.x-5*s,p.y-4*s]],'#a5aba1');for(let i=0;i<5;i++)pixel(g,p.x-(12-i*5)*s,p.y-(hh-5-i%2*4)*s,4*s,2*s,i%2?'#c2bcb0':'#8f958c');if(d.type==='cave'){pixel(g,p.x-9*s,p.y-24*s,19*s,25*s,'#343e40');pixel(g,p.x-6*s,p.y-21*s,13*s,23*s,'#1d2930');pixel(g,p.x-15*s,p.y-16*s,3*s,5*s,'#e6a94c');pixel(g,p.x+15*s,p.y-15*s,3*s,5*s,'#ffd574');textLabel('鐵脊礦坑',p.x,p.y+16*s,{color:'#e3d5b0'});}else if(d.type==='ruins'){pixel(g,p.x-13*s,p.y-31*s,6*s,28*s,'#c3b489');pixel(g,p.x+8*s,p.y-26*s,6*s,29*s,'#a7a780');pixel(g,p.x-5*s,p.y-15*s,8*s,2*s,'#617b53');}else{pixel(g,p.x+4*s,p.y-11*s,3*s,3*s,'#ba8c66');pixel(g,p.x-8*s,p.y-9*s,3*s,2*s,'#d3a47a');}return;}
    if(d.type==='bridgeRail'){const s=scale;pixel(g,p.x,p.y-8*s,2*s,10*s,'#6c5034');line(g,p.x-5*s,p.y-6*s,p.x+5*s,p.y-2*s,'#bfa172',2*s);return;}
    if(d.type==='signpost'){const s=scale;pixel(g,p.x,p.y-18*s,2*s,19*s,'#624a31');pixel(g,p.x-7*s,p.y-21*s,17*s,8*s,'#48392b');pixel(g,p.x-6*s,p.y-20*s,15*s,6*s,'#c4a66c');pixel(g,p.x-3*s,p.y-18*s,9*s,s,'#79613c');if(scale>.65)textLabel(d.region.name,p.x,p.y-28*s,{color:'#f7e6b2',size:7});return;}
    if(d.type==='animal'){const s=scale,bob=Math.sin(elapsed*2+d.phase)>0?1:0;pixel(g,p.x-6*s,p.y-7*s,13*s,7*s,d.variant===1?'#a47d54':'#ebe7ce');pixel(g,p.x+5*s,p.y-9*s,5*s,6*s,d.variant===1?'#694b36':'#d4c9ad');pixel(g,p.x+8*s,p.y-8*s,s,s,'#383b2b');pixel(g,p.x-4*s,p.y,2*s,(3+bob)*s,'#514335');pixel(g,p.x+4*s,p.y,2*s,(4-bob)*s,'#514335');return;}
'''
assert needle in s;s=s.replace(needle,needle+'\n'+extra)
# Decorative detail on every building without changing hit boxes.
s=s.replace("buildingCache.set(id,c);return c;", "for(let i=0;i<14;i++){const x=18+r()*45,y=57+r()*9;pixel(g,x,y,2,1,'#b39a70');}buildingCache.set(id,c);return c;")
p.write_text(s,encoding='utf-8')
print('World renderer updated: coherent terrain, 3x land, biomes, assets and camera.')
