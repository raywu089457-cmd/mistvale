from pathlib import Path
p=Path('src/pixel-world.js');s=p.read_text(encoding='utf-8')
s=s.replace('BRIDGES,riverX,biomeAt','BRIDGES,VILLAGE_BRIDGES,creekX,riverX,biomeAt')
s=s.replace('makeCanvas(160,Math.round(160*(y1-y0+1)/(x1-x0+1)))','makeCanvas(320,Math.round(320*(y1-y0+1)/(x1-x0+1)))')
s=s.replace('makeCanvas(144,Math.round(144*(y1-y0+1)/(x1-x0+1)))','makeCanvas(384,Math.round(384*(y1-y0+1)/(x1-x0+1)))')
s=s.replace('for(const b of BUILDINGS){const src=assets[b.id];','for(const b of [...BUILDINGS,{id:\'monument\'}]){const src=assets[b.id];')
# Keep the same geometric projection, but stop destroying half the sprite detail.
s=s.replace('let cam={x:-8,y:8},target={x:-8,y:8}', 'let cam={x:-105,y:-8},target={x:-105,y:-8}')
s=s.replace('width=Math.ceil(actualWidth/2);height=Math.ceil(actualHeight/2);','width=actualWidth;height=actualHeight;')
s=s.replace('const n=Math.max(.62,Math.min(1.18,width/570,(height-56)/300))','const n=2*Math.max(.62,Math.min(1.18,width/1140,(height/2-56)/300))')
s=s.replace('height/2+25','height/2+50').replace('sy-height/2-25','sy-height/2-50')
s=s.replace("target={x:-8,y:8};scale=baseScale;", "target={x:-105,y:-8};scale=baseScale;")
s=s.replace('Math.min(1.55,baseScale*1.28)','Math.min(3.1,baseScale*1.28)')
s=s.replace('Math.max(.24,Math.min(2.7,scale*factor))','Math.max(.48,Math.min(5.4,scale*factor))')
s=s.replace('target.x-=dx/2/scale;target.y-=dy/2/scale;','target.x-=dx/scale;target.y-=dy/scale;')
s=s.replace('p.y>height+110','p.y>height+260').replace('p.y<height+130','p.y<height+260')
s=s.replace('if(scale<.6)', 'if(scale<1.2)')
s=s.replace('if(scale>.56||s)', 'if(scale>1.12||s)')
s=s.replace('if(scale>.65)', 'if(scale>1.3)')
# Labels and health bars remain readable in screen pixels.
s=s.replace('g.font=`bold ${size}px', 'g.font=`bold ${size*2}px')
s=s.replace("y-5,tw+8,10,'#333a2dde'", "y-9,tw+8,19,'#333a2dde'").replace("y+4,tw+6,1,'#a6a07988'", "y+9,tw+6,1,'#a6a07988'")
s=s.replace("w+2,4,'#262e2ddd'", "w+2,6,'#262e2ddd'").replace("w,2,'#644943'", "w,4,'#644943'").replace('w*Math.min(1,frac)),2,color','w*Math.min(1,frac)),4,color').replace('w*Math.min(1,frac)),1,shade','w*Math.min(1,frac)),2,shade')
# The reference uses small chibi residents, not house-sized figures.
s=s.replace('shadow(p,8,3);','shadow(p,6,2.4);')
s=s.replace('p,23.5,29.4,2','p,16.5,21,2')
s=s.replace('p.y-30*scale','p.y-22*scale').replace('p.y-37*scale','p.y-30*scale').replace('p.y-29*scale','p.y-23*scale')
s=s.replace('-12*scale,-17*scale,24*scale,30*scale','-8*scale,-12*scale,16*scale,21*scale')
# Stone plaza drawn as a deliberately shaped space around the hero monument.
a=s.index('    // An irregular paved square,');b=s.index('    for(const b of BUILDINGS.filter',a)
s=s[:a]+'''    // Central monument plaza and aprons, based on the original concept composition.
    for(let z=-3.5;z<8;z+=.5)for(let x=-14;x<-2;x+=.5){if(((x+8)/5.7)**2+((z-2)/5.2)**2>1)continue;const p=worldPos(x,z),v=Math.floor(rand()*24);diamond(gc,x,z,.28,.28,`rgb(${186+v},${182+v},${161+v})`);pixel(gc,p.x-3,p.y+2,5,1,'#929c8a');}
''' +s[b:]
s=s.replace("diamond(gc,-18,9,2.8,5.6,'#745536');for(let z=4.2;z<14.5;z+=.6)for(let x=-20;x<-16;x+=.6)","diamond(gc,-25,14,2.2,4.5,'#745536');for(let z=10;z<18;z+=.6)for(let x=-27;x<-23;x+=.6)")
s=s.replace("{type:'fountain',x:-1.9,z:3.2,size:.6}","{type:'monument',x:-8,z:2,size:1}")
s=s.replace("for(let z=-17;z<19;z+=.85){if(z>-1&&z<5)continue;", "for(let z=-23;z<25;z+=.85){if((z>-1&&z<5)||(z>16&&z<20))continue;")
s=s.replace("for(const z of[-1,5])", "for(const z of[-1,5,16,20])")
s=s.replace("for(const z of BRIDGES)for(let i=-4;i<=4;i++){", "for(const z of VILLAGE_BRIDGES)for(let i=-3;i<=3;i++){decorations.push({type:'bridgeRail',x:creekX(z)+i,z:z-1.5,size:1},{type:'bridgeRail',x:creekX(z)+i,z:z+1.5,size:1});}\n    for(const z of BRIDGES)for(let i=-4;i<=4;i++){")
# Low flower beds and lamps add detail without putting new obstructions on routes.
s=s.replace("decorations.sort((a,b)=>a.x+a.z-b.x-b.z);", "for(let i=0;i<10;i++){const t=i*Math.PI/5,x=-8+Math.cos(t)*4.9,z=2+Math.sin(t)*4.5;if(!onRoad(x,z,roads,.7))decorations.push({type:'garden',x,z,size:1});}\n    for(const[x,z]of[[-11.5,-1],[-4.5,-1],[-12,5.5],[-4.5,6.5],[-18,1],[-6,-9],[3,11]])if(!onRoad(x,z,roads,.15))decorations.push({type:'lamp',x,z,size:1});\n    decorations.sort((a,b)=>a.x+a.z-b.x-b.z);")
needle="    if(d.type==='tree')"
insert="""    if(d.type==='monument'){const sp=atlasCell('monument')||buildingSprite('fountain');drawSprite(sp,p,54,54*sp.height/sp.width,6);return;}
    if(d.type==='garden'){const s=scale;pixel(g,p.x-7*s,p.y-2*s,15*s,5*s,'#706448');pixel(g,p.x-6*s,p.y-3*s,13*s,4*s,'#405a30');for(let i=0;i<6;i++){const xx=p.x+(i*2-5)*s,yy=p.y-(3+i%2)*s;pixel(g,xx,yy,2*s,2*s,i%3?'#b5bc64':'#e4b277');pixel(g,xx,yy-s,s,s,i%3?'#f0e2bb':'#e7998b');}return;}
"""
assert needle in s;s=s.replace(needle,insert+needle)
p.write_text(s,encoding='utf-8')
p=Path('build.mjs');s=p.read_text(encoding='utf-8').replace("'buildings14']","'buildings14','monument']");p.write_text(s,encoding='utf-8')
print('Native-resolution sprites, monument plaza, concept-proportioned residents and riverbank detail are integrated; original title.png retained unchanged.')
