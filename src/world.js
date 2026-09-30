import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUILDINGS, HUNT_ZONE } from './data.js';

// All game actors and navigation live on y=0; the hills and creek are scenery.
export function createWorld(canvas, { onSelect = () => {} } = {}) {
  let seed = 73192;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const between = (a, b) => a + random() * (b - a);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xaebec0);
  scene.fog = new THREE.FogExp2(0xaebec0, 0.009);
  const camera = new THREE.OrthographicCamera(-29, 29, 21, -21, .1, 180);
  camera.position.set(34, 39, 44);
  camera.lookAt(-1, 0, 0);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(-1, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = .07;
  controls.minZoom = .62;
  controls.maxZoom = 2.55;
  controls.minPolarAngle = .3;
  controls.maxPolarAngle = 1.16;
  controls.enablePan = true;
  controls.panSpeed = .65;
  controls.rotateSpeed = .5;
  controls.maxTargetRadius = 30;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  const sun = new THREE.DirectionalLight(0xffd3a0, 3.0);
  sun.position.set(-24, 39, 19);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 32, bottom: -32, near: .5, far: 100 });
  sun.shadow.normalBias = .045;
  sun.shadow.bias = -.00015;
  sun.shadow.radius = 2;
  scene.add(sun);
  const sky = new THREE.HemisphereLight(0xc5d9e0, 0x48483f, 1.4);
  scene.add(sky);
  const fill = new THREE.DirectionalLight(0xacc6e7, .7);
  fill.position.set(26, 15, -30); scene.add(fill);
  const staticRoot = new THREE.Group(); scene.add(staticRoot);
  const dynamic = new THREE.Group(); scene.add(dynamic);
  const textures = [];
  const materials = [];
  const hitTargets = [];
  const buildingRoots = new Map();
  const smokeSources = [];
  const flames = [];
  const actorMap = new Map();
  const effectMap = new Map();
  const seenEffects = new Set();
  const lanternLights = [];
  let elapsed = 0;
  let selected = null;
  let focusTween = null;
  let disposed = false;

  function texture(size, draw, repeat = 1) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
    t.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    textures.push(t); return t;
  }
  function mat(color, opts = {}) { const m = new THREE.MeshStandardMaterial({ color, roughness: .86, ...opts }); materials.push(m); return m; }
  const woodMap = texture(256, (c, s) => {
    c.fillStyle = '#80654a'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 700; i++) { const x = random() * s; c.strokeStyle = `rgba(${random() > .5 ? '30,19,10' : '188,148,95'},${between(.08,.28)})`; c.lineWidth = between(.3,1.8); c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x+between(-9,9),90,x+between(-6,6),180,x+between(-4,4),s); c.stroke(); }
    for (let x = 0; x < s; x += 64) { c.fillStyle = '#3a2d2280'; c.fillRect(x,0,2,s); }
  });
  const plasterMap = texture(256, (c,s) => { c.fillStyle='#dbd4be';c.fillRect(0,0,s,s);for(let i=0;i<11000;i++){c.fillStyle=`rgba(92,82,62,${random()*.065})`;const r=between(.3,2);c.fillRect(random()*s,random()*s,r,r);} });
  const stoneMap = texture(512, (c,s) => {
    c.fillStyle='#53564e';c.fillRect(0,0,s,s);
    for(let row=0;row<9;row++)for(let col=-1;col<7;col++){let x=col*91+(row%2)*44,y=row*59; const v=between(95,148)|0;c.fillStyle=`rgb(${v+8},${v+9},${v})`;c.beginPath();c.roundRect(x+3,y+3,86,54,between(3,9));c.fill();c.strokeStyle='#333b322a';c.lineWidth=3;c.stroke();}
    for(let i=0;i<25000;i++){c.fillStyle=random()>.5?'#ffffff0c':'#00000010';c.fillRect(random()*s,random()*s,between(.5,3),between(.5,2));}
  });
  const roofMap = texture(512,(c,s)=>{c.fillStyle='#89918c';c.fillRect(0,0,s,s);for(let row=0;row<13;row++)for(let col=-1;col<9;col++){const x=col*64+(row%2)*32,y=row*42;const v=between(103,161)|0;c.fillStyle=`rgb(${v},${v+7},${v+11})`;c.beginPath();c.roundRect(x+1,y+1,62,47,[0,0,8,8]);c.fill();c.strokeStyle='#303c4659';c.lineWidth=2;c.stroke();c.fillStyle='#dae0d41f';c.fillRect(x+4,y+3,58,2);}for(let i=0;i<5000;i++){c.fillStyle='#21322118';c.fillRect(random()*s,random()*s,between(1,5),between(1,3));}});
  roofMap.repeat.set(2,1.1);
  const groundMap = texture(1024,(c,s)=>{c.fillStyle='#738565';c.fillRect(0,0,s,s);for(let i=0;i<90000;i++){c.fillStyle=random()>.5?`rgba(157,151,93,${between(.05,.22)})`:`rgba(39,65,37,${between(.06,.23)})`;const r=between(1,11);c.fillRect(random()*s,random()*s,r,r);}for(let i=0;i<60;i++){let g=c.createRadialGradient(random()*s,random()*s,0,random()*s,random()*s,between(30,180));g.addColorStop(0,'#b1a47412');g.addColorStop(1,'#b1a47400');c.fillStyle=g;c.fillRect(0,0,s,s);}}, 2);
  const dirtMap = texture(512,(c,s)=>{c.fillStyle='#b1a185';c.fillRect(0,0,s,s);for(let i=0;i<27000;i++){c.fillStyle=random()>.5?'#e1ccb244':'#3f3d292b';let r=between(.4,3);c.fillRect(random()*s,random()*s,r,r);}},3);
  const M = {
    grass: mat(0xffffff,{map:groundMap}), dirt:mat(0xd2c3a8,{map:dirtMap}),
    stone:mat(0xbac0ad,{map:stoneMap}), darkstone:mat(0x717a75,{map:stoneMap}),
    timber:mat(0x645540,{map:woodMap}), darkwood:mat(0x484637,{map:woodMap}), wood:mat(0xc2a87b,{map:woodMap}),
    plaster:mat(0xfff0d1,{map:plasterMap}), pale:mat(0xdfddd0,{map:plasterMap}),
    roof:mat(0x456571,{map:roofMap}), redroof:mat(0xaa5138,{map:roofMap}), greenroof:mat(0x5d7757,{map:roofMap}), purpleroof:mat(0x786481,{map:roofMap}),
    iron:mat(0x343d3c,{metalness:.55,roughness:.5}), metal:mat(0xaab6b1,{metalness:.7,roughness:.32}), gold:mat(0xc9aa67,{metalness:.5,roughness:.45}),
    glass:mat(0xffc875,{emissive:0xffa541,emissiveIntensity:.95,roughness:.4}), black:mat(0x222b28),
    leaf:mat(0x3c5e3d), leafLight:mat(0x6a8144), leafDark:mat(0x2f4d37), pine:mat(0x365747), pine2:mat(0x4b6645),
    grassBlade:mat(0x758c5c,{side:THREE.DoubleSide}), wheat:mat(0xc8ad62), wheatLight:mat(0xdfc478),
    red:mat(0xa25745), green:mat(0x658578), purple:mat(0x8b83ab), bark:mat(0x6e6451,{map:woodMap}),
    water:mat(0x668f91,{metalness:.18,roughness:.22,transparent:true,opacity:.84}), foam:mat(0xc0d4c5,{transparent:true,opacity:.37}),
    skin:mat(0xc9a48b), leather:mat(0x705644), armor:mat(0xbfc6bd,{metalness:.64,roughness:.4}), cloak:mat(0x9c4541),
    rune:mat(0x96c5ad,{emissive:0x73c4b0,emissiveIntensity:.6}), straw:mat(0xa99468),
    slime:mat(0x8cb191,{emissive:0x375643,emissiveIntensity:.2,transparent:true,opacity:.88,roughness:.16,metalness:.07}),
  };
  function mesh(geo, material, x=0,y=0,z=0,parent=staticRoot) { const o = new THREE.Mesh(geo,material);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o; }
  function box(w,h,d,m,x=0,y=0,z=0,p=staticRoot){return mesh(new THREE.BoxGeometry(w,h,d),m,x,y,z,p);}
  function sphere(r,m,x=0,y=0,z=0,p=staticRoot,detail=1){return mesh(new THREE.IcosahedronGeometry(r,detail),m,x,y,z,p);}
  function cylinder(rt,rb,h,m,x=0,y=0,z=0,p=staticRoot,n=10){return mesh(new THREE.CylinderGeometry(rt,rb,h,n),m,x,y,z,p);}
  function beam(a,b,width,m,p=staticRoot){const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b);const o=box(width,from.distanceTo(to),width,m,0,0,0,p);o.position.copy(from).add(to).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),to.sub(from).normalize());return o;}
  function ring(r,t,m,x,y,z,p=staticRoot){const o=mesh(new THREE.TorusGeometry(r,t,6,24),m,x,y,z,p);o.rotation.x=Math.PI/2;return o;}
  function group(x=0,y=0,z=0,p=staticRoot){const g=new THREE.Group();g.position.set(x,y,z);p.add(g);return g;}
  function rock(x,z,size=1,m=M.stone,p=staticRoot){const r=sphere(size,m,x,size*.35,z,p);r.scale.set(between(.8,1.4),between(.5,.85),between(.8,1.4));r.rotation.set(random(),random()*Math.PI,random());return r;}
  function roof(w,d,h,peak,m,p,x=0,z=0){
    const half=d/2+.32,angle=Math.atan2(peak,half),length=Math.hypot(half,peak);
    for(const s of [-1,1]){const r=box(w+.7,.13,length+.1,m,x,h+peak/2,z+s*half/2,p);r.rotation.x=s*angle;}
    beam([x-w/2-.4,h+peak+.06,z],[x+w/2+.4,h+peak+.06,z],.13,M.darkwood,p);
    for(const end of [-1,1])for(const s of [-1,1])beam([x+end*(w/2+.33),h,z+s*half],[x+end*(w/2+.33),h+peak,z],.13,M.darkwood,p);
  }
  function gable(w,d,h,peak,m,p){
    const shape=new THREE.Shape();shape.moveTo(-d/2,0);shape.lineTo(d/2,0);shape.lineTo(0,peak);shape.closePath();
    const geo=new THREE.ExtrudeGeometry(shape,{depth:.09,bevelEnabled:false});
    for(const s of [-1,1]){const o=mesh(geo,m,s*w/2,h,0,p);o.rotation.y=Math.PI/2;}
  }
  function windowPane(x,y,z,p,rotation=0,w=.7,h=.93){
    const g=group(x,y,z,p);g.rotation.y=rotation;
    box(w+.19,h+.19,.12,M.darkwood,0,0,0,g);box(w,h,.08,M.glass,0,0,.075,g);
    box(.055,h,.035,M.wood,0,0,.13,g);box(w,.05,.035,M.wood,0,0,.135,g);
    box(w+.29,.09,.27,M.wood,0,-h/2-.08,.08,g);
    for(const s of [-1,1]){const shutter=box(.23,h+.07,.07,M.wood,s*(w/2+.19),0,.025,g);shutter.rotation.y=s*.3;}
  }
  function door(x,z,p,width=.82,height=1.6){
    box(width+.25,height+.12,.15,M.darkwood,x,height/2,z,p);
    box(width,height,.11,M.wood,x,height/2,z+.09,p);
    for(const y of [.35,1.23])box(width,.085,.09,M.darkwood,x,y,z+.17,p);
    sphere(.055,M.gold,x+width*.29,.83,z+.2,p);
    box(width+.45,.12,.48,M.stone,x,.04,z+.21,p);
  }
  function barrel(x,z,p=staticRoot,scale=1){
    const g=group(x,0,z,p);g.scale.setScalar(scale);
    cylinder(.31,.34,.8,M.wood,0,.4,0,g,12);
    for(const y of [.13,.64])ring(.333,.035,M.iron,0,y,0,g);
    cylinder(.29,.29,.035,M.timber,0,.81,0,g,12);
  }
  function crate(x,z,p=staticRoot,scale=.7){const g=group(x,.04,z,p);box(scale,scale,scale,M.wood,0,scale/2,0,g);for(const y of [.09,scale-.05])box(scale+.025,.075,scale+.025,M.darkwood,0,y,0,g);beam([-scale*.4,.1,scale/2+.02],[scale*.4,scale-.06,scale/2+.02],.07,M.darkwood,g);}
  function lantern(x,y,z,p=staticRoot,addLight=false){
    const g=group(x,y,z,p);box(.2,.31,.2,M.glass,0,0,0,g);box(.3,.06,.3,M.iron,0,-.18,0,g);cylinder(.05,.23,.17,M.iron,0,.24,0,g,4);
    for(const a of [-1,1])for(const b of [-1,1])box(.026,.4,.026,M.iron,.105*a,0,.105*b,g);
    if(addLight){const l=new THREE.PointLight(0xffb761,1.1,4.5,2);l.position.set(x,y,z);p.add(l);lanternLights.push(l);}
  }
  function sign(text,x,y,z,p,color='#bda476'){
    const map=texture(256,(c,s)=>{c.fillStyle='#4b4031';c.fillRect(0,0,s,s);c.fillStyle=color;c.fillRect(6,6,s-12,s-12);c.strokeStyle='#584a33';c.lineWidth=6;c.strokeRect(15,15,s-30,s-30);c.fillStyle='#382f24';c.textAlign='center';c.textBaseline='middle';c.font='bold 110px serif';c.fillText(text,s/2,s/2);});
    const m=mat(0xffffff,{map});box(.65,.62,.09,m,x,y,z,p);for(const s of [-1,1])box(.025,.3,.025,M.iron,x+s*.21,y+.43,z,p);beam([x-.44,y+.6,z],[x+.44,y+.6,z],.075,M.darkwood,p);
  }
  function chimney(x,h,z,p,wide=false){
    box(wide?.84:.52,1.65,wide?.74:.55,M.stone,x,h+.7,z,p);box(wide?1:.72,.17,wide?.91:.71,M.darkstone,x,h+1.54,z,p);box(wide?.7:.42,.045,wide?.6:.42,M.black,x,h+1.64,z,p);
    const world=new THREE.Vector3(x,h+1.6,z);p.localToWorld(world);smokeSources.push(world);
  }
  function fenceLine(ax,az,bx,bz,p=staticRoot){const len=Math.hypot(bx-ax,bz-az),n=Math.ceil(len/1.6);for(let i=0;i<=n;i++){const t=i/n,x=ax+(bx-ax)*t,z=az+(bz-az)*t;box(.13,.95,.13,M.wood,x,.47,z,p);cylinder(0,.105,.18,M.wood,x,1.02,z,p,4);}for(const y of [.4,.76])beam([ax,y,az],[bx,y,bz],.09,M.timber,p);}

  // Rich, continuous meadow with worn routes joining every door.
  const ground=mesh(new THREE.PlaneGeometry(124,124),M.grass,0,-.06,0);ground.rotation.x=-Math.PI/2;ground.castShadow=false;
  const roadSegments=[];
  function road(points,width=2.1){const curve=new THREE.CatmullRomCurve3(points.map(([x,z])=>new THREE.Vector3(x,.012,z)));const ps=curve.getPoints(70),verts=[],uv=[],idx=[];for(let i=0;i<ps.length;i++){const tangent=curve.getTangent(i/(ps.length-1));const n=new THREE.Vector3(-tangent.z,0,tangent.x);const ragged=width*(.5+.045*Math.sin(i*1.43));for(const s of [-1,1]){const v=ps[i].clone().addScaledVector(n,s*ragged);verts.push(v.x,v.y,v.z);uv.push(s===-1?0:1,i/7);}if(i<ps.length-1){const k=i*2;idx.push(k,k+1,k+2,k+1,k+3,k+2);}}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();mesh(geo,M.dirt);roadSegments.push(ps);}
  road([[-3,24],[-1,14],[-.5,7],[0,0],[3,-2],[10,-4],[17,-5]],2.5);
  road([[-17,0],[-11,-.9],[-5,0],[0,0]],2);
  road([[-11,-.9],[-11,-2.6]],1.8);
  road([[-3,0],[-3,-3.9]],2.2);
  road([[-.5,7],[-4,7.2]],1.8);
  road([[-.5,7],[4,7.1]],1.7);
  road([[-12,6],[-8,7],[-.5,7]],1.9);
  road([[-12,6],[-10.3,9],[-11.8,12.6]],1.7);
  const plaza=cylinder(3.15,3.15,.045,M.dirt,0,.018,0,staticRoot,48);plaza.castShadow=false;
  for(let i=0;i<190;i++){const a=random()*Math.PI*2,r=Math.sqrt(random())*2.9;const p=box(between(.15,.34),.035,between(.2,.48),random()>.5?M.stone:M.darkstone,Math.cos(a)*r,.04,Math.sin(a)*r);p.rotation.y=random()*Math.PI;p.castShadow=false;}
  for(let i=0;i<150;i++){const path=roadSegments[(random()*roadSegments.length)|0];const q=path[(random()*path.length)|0];const p=rock(q.x+between(-1.4,1.4),q.z+between(-1.4,1.4),between(.035,.095),M.darkstone);p.castShadow=false;}

  function building(def){
    const {x,z,w,d,type}=def;const p=group(x,0,z);buildingRoots.set(def.id,p);
    const h=type==='hall'?3.65:type==='farm'?2.35:2.75;
    const peak=type==='hall'?2.1:1.65;
    const roofMat={tavern:M.redroof,clinic:M.greenroof,academy:M.purpleroof,farm:M.redroof}[type]||M.roof;
    box(w+.16,.45,d+.16,M.stone,0,.2,0,p);
    box(w,h-.2,d,type==='forge'?M.pale:M.plaster,0,h/2+.15,0,p);
    gable(w,d,h,peak,M.plaster,p);roof(w,d,h,peak,roofMat,p);
    for(const s of [-1,1]){
      box(w,.16,.17,M.darkwood,0,1.1,s*(d/2+.04),p);box(w,.17,.16,M.darkwood,0,h-.13,s*(d/2+.04),p);
      for(let i=0;i<5;i++){const bx=-w/2+i*w/4;box(.13,h,.16,M.darkwood,bx,h/2,s*(d/2+.04),p);}
      for(const xx of [-1,1]){beam([xx*w*.47,1.21,s*(d/2+.09)],[xx*w*.29,h-.24,s*(d/2+.09)],.085,M.timber,p);}
      box(.16,.16,d,M.darkwood,s*(w/2+.03),1.1,0,p);
      box(.16,h,.15,M.darkwood,s*(w/2+.03),h/2,0,p);
      beam([s*(w/2+.06),h,-d*.45],[s*(w/2+.06),h+peak-.15,0],.105,M.darkwood,p);
      beam([s*(w/2+.06),h,d*.45],[s*(w/2+.06),h+peak-.15,0],.105,M.darkwood,p);
      windowPane(s*(w/2+.12),1.85,.58,p,s*Math.PI/2,.62,.78);
    }
    door(0,d/2+.14,p,type==='hall'?1.02:.84,type==='hall'?1.9:1.65);
    for(const xx of [-w*.3,w*.3])windowPane(xx,1.91,d/2+.13,p,0,type==='hall'?.82:.67,type==='hall'?1.0:.84);
    for(const xx of [-w*.28,w*.28])windowPane(xx,1.94,-d/2-.12,p,Math.PI,.63,.86);
    if(type==='hall'){for(const xx of [-w*.3,w*.3])windowPane(xx,3.0,d/2+.13,p,0,.7,.67);box(1.5,.13,1.1,M.darkwood,0,2.37,d/2+.47,p);for(const s of [-1,1])beam([s*.61,.25,d/2+.92],[s*.61,2.38,d/2+.92],.11,M.darkwood,p);sign('鹿',0,3.5,d/2+.24,p);}
    else sign({tavern:'酒',forge:'鍛',clinic:'藥',academy:'弓',farm:'穗'}[type],w*.47,2.35,d/2+.45,p);
    chimney(-w*.32,h+peak*.4,-d*.14,p,type==='forge');
    lantern(-.76,1.95,d/2+.32,p);
    barrel(-w/2-.53,d/2-.3,p,.92);crate(w/2+.38,d/2-.4,p,.63);
    if(type==='tavern'){
      const awning=box(w*.79,.07,1.25,M.red,0,2.16,d/2+.66,p);awning.rotation.x=.17;
      for(let i=0;i<7;i++)box(.26,.08,1.28,i%2?M.pale:M.red,-w*.34+i*w*.113,2.13,d/2+.69,p).rotation.x=.17;
      for(const s of [-1,1])box(.09,2.13,.09,M.darkwood,s*w*.39,1.07,d/2+1.2,p);
      for(const xx of [-2.7,2.5]){const t=group(xx,0,d/2+1.95,p);cylinder(.52,.52,.12,M.wood,0,.69,0,t,12);box(.1,.65,.1,M.darkwood,0,.34,0,t);for(const zz of [-.59,.59]){box(.72,.08,.27,M.wood,0,.4,zz,t);for(const s of [-1,1])box(.06,.36,.06,M.darkwood,s*.26,.18,zz,t);}cylinder(.08,.07,.14,M.pale,.1,.82,0,t);}
    }
    if(type==='forge'){
      const ext=group(-w/2-1.28,0,.12,p);box(2.4,.13,2.7,M.roof,0,2.2,0,ext).rotation.z=.09;for(const s of [-1,1])for(const a of [-1,1])box(.15,2.2,.15,M.darkwood,s*1.05,1.1,a*1.18,ext);
      box(.95,.5,.85,M.stone,0,.25,0,ext);box(.65,.24,.36,M.iron,0,.62,0,ext);box(.95,.15,.43,M.iron,0,.8,0,ext);const horn=cylinder(.03,.18,.46,M.iron,.62,.82,0,ext,8);horn.rotation.z=-Math.PI/2;
      box(.88,1.1,.82,M.darkstone,1.7,.55,-1,p);box(.58,.56,.075,M.black,1.7,.47,-.55,p);const fire=box(.42,.19,.075,mat(0xff9f36,{emissive:0xff7b16,emissiveIntensity:2}),1.7,.3,-.49,p);flames.push(fire);
      const l=new THREE.PointLight(0xff873f,2.5,5,2);l.position.set(x+1.7,.55,z-.1);scene.add(l);lanternLights.push(l);
      for(let i=0;i<5;i++)cylinder(.1,.11,1.1,M.wood,-w/2-2+ i*.2,.17,1.8,p,8).rotation.z=Math.PI/2;
    }
    if(type==='clinic'){
      for(const xx of [-w*.34,w*.34]){box(1.15,.28,.43,M.wood,xx,1.12,d/2+.33,p);for(let j=0;j<7;j++){const f=sphere(.1,j%2?M.purple:M.pale,xx+between(-.48,.48),1.35+random()*.12,d/2+.3+between(-.13,.13),p);f.scale.y=.7;}}
      for(let j=0;j<18;j++){const fx=between(-1.9,1.9);beam([fx,0,-d/2-.7],[fx,.4+random()*.2,-d/2-.7],.025,M.green,p);sphere(.09,M.purple,fx,.47,-d/2-.7,p);}
    }
    if(type==='academy'){
      for(const xx of [-1.1,1.2]){const t=group(xx,0,d/2+2.35,p);box(.14,1.2,.14,M.wood,0,.6,0,t);const target=cylinder(.52,.52,.12,M.straw,0,1.3,0,t,24);target.rotation.x=Math.PI/2;for(const [r,ma] of [[.35,M.pale],[.2,M.red],[.065,M.pale]]){const disk=cylinder(r,r,.015,ma,0,1.3,.077,t,24);disk.rotation.x=Math.PI/2;}beam([-.44,0,-.15],[0,1.3,0],.07,M.darkwood,t);beam([.44,0,-.15],[0,1.3,0],.07,M.darkwood,t);}
      fenceLine(-2.7,d/2+1,-2.7,d/2+3.2,p);fenceLine(2.8,d/2+1,2.8,d/2+3.2,p);
    }
    if(type==='farm'){const stack=group(w/2+1.1,0,0,p);for(let i=0;i<3;i++){const hay=cylinder(.51,.51,.82,M.wheat,i*.12,.48+i*.54,0,stack,12);hay.rotation.z=Math.PI/2;}fenceLine(-3.0,2,-3,4,p);}
    const hit=box(w+1,h+peak,d+1,new THREE.MeshBasicMaterial({visible:false}),x,(h+peak)/2,z,dynamic);hit.userData.selectId=def.id;hitTargets.push(hit);
  }
  BUILDINGS.forEach(building);
  // Small supporting cottages give the settlement believable depth.
  for(const [x,z,w,d,r] of [[-15,-12,3.7,3.1,.1],[-7.7,-13,3.1,2.8,-.08],[1.9,-12.3,3.6,3,.12]]){
    const p=group(x,0,z);p.rotation.y=r;box(w,.35,d,M.stone,0,.15,0,p);box(w,2.1,d,M.pale,0,1.35,0,p);gable(w,d,2.5,1.4,M.pale,p);roof(w,d,2.5,1.4,M.greenroof,p);
    for(const s of [-1,1])box(.12,2.5,.13,M.darkwood,s*w/2,1.25,d/2+.04,p);box(w,.11,.13,M.darkwood,0,1,d/2+.06,p);windowPane(-.83,1.61,d/2+.12,p,0,.61,.76);door(.52,d/2+.1,p,.69,1.51);chimney(w*.28,3.4,-.45,p);barrel(-w/2-.4,.5,p,.7);
  }

  // Village well, with a shingled shelter and suspended bucket.
  const well=group(1.0,0,.6);cylinder(.86,.94,.52,M.stone,0,.26,0,well,20);cylinder(.65,.65,.04,M.water,0,.53,0,well,24);ring(.78,.14,M.stone,0,.57,0,well);
  for(const s of [-1,1])box(.15,2.5,.17,M.darkwood,s*.87,1.25,0,well);
  roof(2.2,1.5,2.5,.67,M.redroof,well);beam([-.87,1.96,0],[.87,1.96,0],.12,M.wood,well);box(.02,.77,.02,M.straw,0,1.58,0,well);cylinder(.16,.12,.26,M.wood,0,1.05,0,well,10);
  for(const [x,z] of [[-5.8,-.9],[5.8,-2.1],[-3,11.3],[8.5,-3.5]]){box(.13,2.8,.13,M.darkwood,x,1.4,z);beam([x,2.7,z],[x+.65,2.7,z],.09,M.darkwood);lantern(x+.54,2.32,z);}
  // Notice board and campfire mark the gathering place.
  const board=group(-3.2,0,1.9);for(const s of [-1,1])box(.13,1.9,.13,M.darkwood,s*.58,.95,0,board);box(1.48,1.1,.16,M.wood,0,1.35,0,board);roof(1.6,.42,1.96,.23,M.roof,board);for(let i=0;i<4;i++)box(.3,.4,.025,M.pale,-.47+(i%3)*.4,1.43-Math.floor(i/3)*.44,.11,board).rotation.z=between(-.16,.16);
  for(let i=0;i<9;i++){const a=i/9*Math.PI*2;rock(5+Math.cos(a)*.61,-.15+Math.sin(a)*.61,.18,M.darkstone);}
  for(const a of [0,1.1,2.2]){const l=cylinder(.12,.12,1.05,M.darkwood,5,.18,-.15);l.rotation.z=Math.PI/2;l.rotation.y=a;}
  const flameMat=mat(0xffb558,{emissive:0xff8f32,emissiveIntensity:2.1,transparent:true,opacity:.9});
  for(let i=0;i<3;i++){const f=mesh(new THREE.ConeGeometry(.19-i*.04,.65+i*.16,7),flameMat,5+between(-.17,.17),.48,-.15+between(-.14,.14),dynamic);flames.push(f);}
  const campLight=new THREE.PointLight(0xffa146,2.4,5,2);campLight.position.set(5,.6,-.15);scene.add(campLight);lanternLights.push(campLight);

  // Golden vegetable beds and grain fields on the sunny edge of town.
  for(let row=0;row<6;row++){const z=15+row*.53;box(6.4,.035,.37,M.dirt,-10.5,.005,z);for(let j=0;j<31;j++){const x=-13.5+j*.2+between(-.05,.05),h=between(.35,.72);beam([x,0,z],[x+.06,h,z],.02,M.wheat);const head=cylinder(.025,.07,.17,j%3?M.wheat:M.wheatLight,x+.06,h,z,staticRoot,5);head.rotation.z=-.15;}}
  fenceLine(-14.1,14.5,-14.1,18.3);fenceLine(-14.1,18.3,-7,18.3);fenceLine(-7,18.3,-7,15.2);
  for(let row=0;row<3;row++){const z=10+row*.48;box(3.1,.035,.31,M.dirt,-7,.01,z);for(let i=0;i<11;i++){const veg=sphere(.17,M.leafLight,-8.4+i*.28,.14,z);veg.scale.y=.65;}}

  // Ancient hunt gate and broken stones provide an obvious encounter landmark.
  for(const s of [-1,1]){const p=group(10.2,0,-4+s*2.05);box(.75,2.5,.7,M.darkstone,0,1.25,0,p);box(.93,.18,.88,M.stone,0,2.44,0,p);box(.95,.23,.87,M.stone,0,.14,0,p);for(let i=0;i<3;i++)box(.06,.25,.025,M.rune,.39,.65+i*.48,.1,p);sphere(.33,M.stone,0,2.72,0,p);}
  beam([10.2,2.72,-6.1],[10.2,2.72,-1.9],.32,M.darkwood);
  const huntCircle=mesh(new THREE.RingGeometry(5.6,5.64,72),mat(0x94aa87,{transparent:true,opacity:.18,side:THREE.DoubleSide}),HUNT_ZONE.x,.023,HUNT_ZONE.z,dynamic);huntCircle.rotation.x=-Math.PI/2;
  for(const [x,z,r] of [[23,-10,.8],[24,-5,1.2],[21,-12,1.1],[25,0,1.6],[16,-13,.9]])rock(x,z,r,M.darkstone);
  const altar=group(22,0,-10.3);cylinder(.8,1,.45,M.darkstone,0,.22,0,altar,7);const crystal=sphere(.55,M.rune,0,1,0,altar,0);crystal.scale.set(.55,1.8,.55);ring(.87,.045,M.rune,0,.05,0,altar);

  // A shallow, gently winding creek occupies only the decorative western bank.
  const riverCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(-26,0,-24),new THREE.Vector3(-22,0,-10),new THREE.Vector3(-21,0,1),new THREE.Vector3(-19,0,10),new THREE.Vector3(-20,0,20),new THREE.Vector3(-15,0,33)]);
  const riverPts=riverCurve.getPoints(90), rv=[],ru=[],ri=[];
  for(let i=0;i<riverPts.length;i++){const t=riverCurve.getTangent(i/90),n=new THREE.Vector3(-t.z,0,t.x);for(const s of [-1,1]){const p=riverPts[i].clone().addScaledVector(n,s*(1.45+.22*Math.sin(i*.29)));rv.push(p.x,.02,p.z);ru.push(s<0?0:1,i/12);}if(i<90){let k=i*2;ri.push(k,k+1,k+2,k+1,k+3,k+2);}}
  const riverGeo=new THREE.BufferGeometry();riverGeo.setAttribute('position',new THREE.Float32BufferAttribute(rv,3));riverGeo.setAttribute('uv',new THREE.Float32BufferAttribute(ru,2));riverGeo.setIndex(ri);riverGeo.computeVertexNormals();const water=mesh(riverGeo,M.water);water.castShadow=false;
  const bankGeo=riverGeo.clone(),bankPositions=bankGeo.getAttribute('position');for(let i=0;i<riverPts.length;i++){for(let side=0;side<2;side++){const idx=i*2+side;bankPositions.setXYZ(idx,riverPts[i].x+(bankPositions.getX(idx)-riverPts[i].x)*1.27,-.002,riverPts[i].z+(bankPositions.getZ(idx)-riverPts[i].z)*1.27);}}bankGeo.computeVertexNormals();const bank=mesh(bankGeo,M.dirt);bank.castShadow=false;
  for(let i=0;i<90;i++){const q=riverPts[i];for(const s of [-1,1])if(random()>.25)rock(q.x+s*between(1.5,2),q.z,between(.12,.45),random()>.6?M.darkstone:M.stone);if(i%3===0){const ripple=box(between(.12,.65),.006,.028,M.foam,q.x+between(-.8,.8),.035,q.z);ripple.rotation.y=between(-.3,.3);ripple.castShadow=false;}}

  function tree(x,z,size=1,pine=false){
    const p=group(x,0,z);p.rotation.y=random()*Math.PI*2;p.scale.setScalar(size);
    cylinder(.13,.24,3.7,M.bark,0,1.85,0,p,8);
    if(pine){for(let k=0;k<5;k++){const y=1.8+k*.64,r=1.45-k*.24;const c=cylinder(0,r,1.65,k%2?M.pine:M.pine2,0,y+.45,0,p,9);c.rotation.y=k*.67;} }
    else {for(let i=0;i<6;i++){const a=i/6*Math.PI*2,xx=Math.cos(a)*.72,zz=Math.sin(a)*.72;beam([0,1.65,0],[xx,3.1,zz],.12,M.bark,p);const l=sphere(between(.94,1.29),i%3===0?M.leafLight:i%3===1?M.leaf:M.leafDark,xx,between(2.9,3.7),zz,p,1);l.scale.y=between(.8,1.1);}sphere(1.2,M.leaf,0,4,0,p,1);}
    if(random()>.55)for(let i=0;i<3;i++)beam([0,.23,0],[between(-.5,.5),.03,between(-.5,.5)],.13,M.bark,p);
  }
  for(let i=0;i<155;i++){
    const a=random()*Math.PI*2,r=between(26,44),x=Math.cos(a)*r-2,z=Math.sin(a)*r-4;
    if(z>17&&x>-16&&x<10)continue;if(x>10&&x<27&&z>-13&&z<4)continue;
    tree(x,z,between(.8,1.55),random()>.4);
  }
  for(const [x,z,s,p] of [[-17,-7,1.12,false],[-15,1,1.2,false],[-6,-10,1,false],[3,-8,.85,false],[8,9,1.12,false],[-4,14,1.25,false],[7,-12,1.1,true],[11,-12,1.15,true],[7,-7,.9,true],[26,4,1.2,true],[20,7,1.12,false],[13,8,1.35,false],[-18,16,1,false]])tree(x,z,s,p);
  // Rounded, layered mountains remain outside the playable flat world.
  for(let i=0;i<24;i++){const a=Math.PI*.9+i/24*Math.PI*1.5,r=between(45,61),x=Math.cos(a)*r,z=Math.sin(a)*r;const h=between(8,18);const hill=sphere(1,i%2?M.darkstone:M.leafDark,x,h*.24,z,staticRoot,1);hill.scale.set(between(7,13),h*.65,between(6,11));hill.rotation.y=random()*Math.PI;}
  // Clustered meadow blades and wildflowers use one instanced draw each.
  const bladeGeo=new THREE.BufferGeometry();bladeGeo.setAttribute('position',new THREE.Float32BufferAttribute([-.07,0,0,.06,0,0,.025,.45,.015,0,0,-.065,0,0,.065,.015,.34,.025],3));bladeGeo.computeVertexNormals();
  const grass=new THREE.InstancedMesh(bladeGeo,M.grassBlade,2800);grass.receiveShadow=true;const dummy=new THREE.Object3D();let grassCount=0;
  for(let i=0;i<5400&&grassCount<2800;i++){const x=between(-30,30),z=between(-24,28);if(BUILDINGS.some(b=>Math.abs(x-b.x)<b.w/2+1&&Math.abs(z-b.z)<b.d/2+1))continue;if(roadSegments.some(ps=>ps.some((q,j)=>j%5===0&&Math.hypot(q.x-x,q.z-z)<1.35)))continue;if(x<-17&&x>-24)continue;if(Math.hypot(x,z)<3.8)continue;dummy.position.set(x,.01,z);dummy.rotation.y=random()*6.28;dummy.scale.setScalar(between(.55,1.3));dummy.updateMatrix();grass.setMatrixAt(grassCount++,dummy.matrix);}
  grass.count=grassCount;staticRoot.add(grass);
  const flowers=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.05,0),M.pale,230);let fc=0;
  for(let i=0;i<230;i++){const x=between(-28,24),z=between(-20,23);if(Math.abs(x)<7&&Math.abs(z)<10)continue;dummy.position.set(x,.13,z);dummy.scale.setScalar(between(.7,1.2));dummy.updateMatrix();flowers.setMatrixAt(fc++,dummy.matrix);}flowers.count=fc;staticRoot.add(flowers);
  for(let i=0;i<45;i++){const x=between(-29,29),z=between(-23,24);if(BUILDINGS.some(b=>Math.abs(x-b.x)<b.w/2+1&&Math.abs(z-b.z)<b.d/2+1)||Math.hypot(x,z)<5)continue;rock(x,z,between(.13,.5),M.darkstone);}

  // Merge immovable meshes by material while retaining tiny independent hit boxes.
  staticRoot.updateMatrixWorld(true);
  const batches=new Map(),remove=[];
  staticRoot.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh&&o.material.isMaterial){let geo=o.geometry.clone();geo.applyMatrix4(o.matrixWorld);if(geo.index)geo=geo.toNonIndexed();if(!geo.getAttribute('uv'))geo.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geo.getAttribute('position').count*2),2));const key=o.material.uuid;if(!batches.has(key))batches.set(key,{material:o.material,geos:[]});batches.get(key).geos.push(geo);remove.push(o);}});
  for(const o of remove){o.removeFromParent();o.geometry.dispose();}
  for(const {material,geos} of batches.values()){const merged=mergeGeometries(geos,false);if(merged){const m=new THREE.Mesh(merged,material);m.castShadow=material!==M.grass&&material!==M.water&&material!==M.foam&&material!==M.dirt;m.receiveShadow=true;scene.add(m);}for(const g of geos)g.dispose();}
  // Smoke: soft translucent canvas particles, lit by the afternoon sun.
  const smokeMap=texture(64,(c,s)=>{const g=c.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);g.addColorStop(0,'rgba(232,223,201,.55)');g.addColorStop(.45,'rgba(216,216,203,.28)');g.addColorStop(1,'rgba(216,216,203,0)');c.fillStyle=g;c.fillRect(0,0,s,s);});
  const smoke=[];
  for(const source of smokeSources)for(let i=0;i<6;i++){const m=new THREE.SpriteMaterial({map:smokeMap,transparent:true,opacity:.2,depthWrite:false,color:0xe5dfca});materials.push(m);const s=new THREE.Sprite(m);dynamic.add(s);smoke.push({s,source,phase:i/6+random()*.1});}
  // A handful of birds bring life to the distant canopy.
  const birds=[];for(let i=0;i<7;i++){const p=group(0,0,0,dynamic);const left=box(.38,.027,.08,M.darkwood,-.18,0,0,p),right=box(.38,.027,.08,M.darkwood,.18,0,0,p);birds.push({p,left,right,phase:random()*6.28,r:between(15,26),height:between(9,15)});}

  const selection=mesh(new THREE.RingGeometry(1,1.055,64),new THREE.MeshBasicMaterial({color:0xe8c581,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}),0,.065,0,dynamic);selection.rotation.x=-Math.PI/2;selection.visible=false;
  const hover=mesh(new THREE.RingGeometry(1,1.025,64),new THREE.MeshBasicMaterial({color:0xffe3aa,transparent:true,opacity:.45,side:THREE.DoubleSide,depthWrite:false}),0,.061,0,dynamic);hover.rotation.x=-Math.PI/2;hover.visible=false;
  const healthBack=new THREE.MeshBasicMaterial({color:0x1b2724,transparent:true,opacity:.8,depthTest:false});materials.push(healthBack);
  const healthGood=new THREE.MeshBasicMaterial({color:0xb3cf96,depthTest:false});materials.push(healthGood);
  const healthBad=new THREE.MeshBasicMaterial({color:0xc37a6a,depthTest:false});materials.push(healthBad);
  const healthGeometry=new THREE.PlaneGeometry(1,.075);
  const skinMaterials=[M.skin,mat(0xad8770),mat(0xd9b59a)];
  const classCloth={knight:M.cloak,ranger:M.green,mage:M.purple};

  function healthBar(p,height,enemy=false){const g=group(0,height,0,p);const back=new THREE.Mesh(healthGeometry,healthBack);back.scale.x=.75;g.add(back);const fill=new THREE.Mesh(healthGeometry,enemy?healthBad:healthGood);fill.position.z=.003;fill.scale.set(.72,.65,1);g.add(fill);g.renderOrder=20;back.renderOrder=20;fill.renderOrder=21;return{g,fill};}
  function hero(actor){
    const p=group(actor.x||0,0,actor.z||0,dynamic);const visual=group(0,0,0,p);const cls=actor.classId||'knight',cloth=classCloth[cls]||M.cloak;const skin=skinMaterials[Math.abs(String(actor.id).split('').reduce((s,c)=>s+c.charCodeAt(0),0))%3];
    const hip=group(0,.47,0,visual);box(.38,.18,.24,M.leather,0,0,0,hip);
    const torso=box(.44,.47,.27,cls==='knight'?M.armor:cloth,0,.77,0,visual);box(.45,.075,.29,M.leather,0,.55,0,visual);box(.065,.08,.31,M.gold,0,.55,0,visual);
    const head=sphere(.19,skin,0,1.17,0,visual,2);head.scale.set(.87,1,.88);
    if(cls==='knight'){const helm=sphere(.205,M.armor,0,1.23,-.015,visual,1);helm.scale.set(1,.81,1);box(.31,.08,.06,M.iron,0,1.2,.155,visual);box(.035,.31,.06,M.gold,0,1.25,.19,visual);const crest=box(.065,.18,.29,M.cloak,0,1.44,-.035,visual);crest.rotation.x=-.13;}
    if(cls==='ranger'){const hood=sphere(.22,cloth,0,1.21,-.06,visual,1);hood.scale.set(1,1.05,.9);box(.25,.18,.1,skin,0,1.18,.135,visual);cylinder(.14,.14,.52,M.leather,-.17,.92,-.21,visual,8).rotation.z=-.16;for(let i=0;i<4;i++){beam([-.24+i*.04,.83,-.24],[-.22+i*.04,1.36,-.23],.015,M.wood,visual);sphere(.035,M.pale,-.22+i*.04,1.37,-.23,visual,0);}}
    if(cls==='mage'){const hat=cylinder(0,.32,.55,cloth,0,1.56,-.05,visual,9);hat.rotation.z=-.08;cylinder(.33,.33,.035,M.darkwood,0,1.31,-.04,visual,12);box(.45,.52,.3,cloth,0,.47,0,visual);}
    const cape=box(.4,.64,.045,cloth,0,.76,-.19,visual);cape.rotation.x=-.13;
    const legs=[],arms=[];
    for(const s of [-1,1]){const leg=group(s*.12,.46,0,visual);box(.145,.3,.15,M.leather,0,-.15,0,leg);box(.16,.17,.23,cls==='knight'?M.armor:M.darkwood,0,-.34,.035,leg);legs.push(leg);const arm=group(s*.29,.95,0,visual);sphere(.125,cls==='knight'?M.armor:cloth,0,0,0,arm,1);box(.135,.29,.15,cloth,0,-.17,0,arm);sphere(.085,skin,0,-.33,.02,arm,1);arms.push(arm);}
    if(cls==='knight'){const shield=group(-.05,-.28,.09,arms[0]);box(.34,.4,.07,M.iron,0,0,0,shield);box(.27,.32,.085,M.cloak,0,0,.025,shield);box(.055,.34,.095,M.gold,0,0,.04,shield);box(.3,.06,.095,M.gold,0,.05,.04,shield);const sword=group(0,-.31,.05,arms[1]);box(.055,.6,.045,M.metal,0,-.26,0,sword);box(.22,.04,.07,M.gold,0,.02,0,sword);box(.05,.13,.06,M.leather,0,.12,0,sword);}
    if(cls==='ranger'){const bow=mesh(new THREE.TorusGeometry(.32,.025,5,16,Math.PI),M.wood,0,-.28,.04,arms[1]);bow.rotation.z=Math.PI/2;beam([0,-.6,.04],[0,.04,.04],.011,M.straw,arms[1]);}
    if(cls==='mage'){beam([0,-.55,0],[0,.47,0],.045,M.wood,arms[1]);const orb=sphere(.105,M.rune,0,.51,0,arms[1],1);}
    const bar=healthBar(p,1.79,false);
    const hit=box(.72,1.55,.65,new THREE.MeshBasicMaterial({visible:false}),0,.78,0,p);hit.userData.selectId='hunter:'+actor.id;hitTargets.push(hit);
    const halo=mesh(new THREE.RingGeometry(.3,.34,32),new THREE.MeshBasicMaterial({color:0xd9c094,transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false}),0,.025,0,p);halo.rotation.x=-Math.PI/2;
    return{p,visual,legs,arms,cape,bar,hit,halo,kind:'hero',id:actor.id,prevX:actor.x,prevZ:actor.z,phase:random()*6.28};
  }
  function monster(actor){
    const p=group(actor.x??16,0,actor.z??-5,dynamic),visual=group(0,0,0,p);const type=actor.type||'wolf';const boss=type==='boss'||type==='demon';const wolf=type==='wolf';const flesh=wolf?M.darkstone:boss?M.darkwood:M.leafDark;const limbs=[];
    if(type==='slime'){
      const jelly=sphere(.53,M.slime,0,.35,0,visual,3);jelly.scale.set(1,.69,.91);
      for(const s of [-1,1]){const eye=sphere(.052,M.black,s*.16,.45,.43,visual,2);eye.scale.y=1.4;sphere(.016,M.pale,s*.16-.008,.47,.475,visual,1);}
      sphere(.085,M.rune,-.15,.56,-.08,visual,1);sphere(.06,M.rune,.19,.31,.09,visual,1);
    }
    else if(type==='golem'){
      const torso=sphere(.59,M.darkstone,0,.91,0,visual,1);torso.scale.set(.88,1.1,.72);
      const head=sphere(.34,M.stone,0,1.68,.06,visual,0);head.scale.set(.9,.85,.85);
      for(const s of [-1,1]){box(.105,.055,.07,M.rune,s*.13,1.72,.35,visual);const leg=group(s*.25,.54,0,visual);const shin=sphere(.25,M.darkstone,0,-.22,0,leg,0);shin.scale.y=1.35;sphere(.29,M.stone,0,-.43,.07,leg,0);limbs.push(leg);const arm=group(s*.54,1.18,0,visual);sphere(.3,M.stone,0,0,0,arm,0);const forearm=sphere(.26,M.darkstone,s*.03,-.38,.08,arm,0);forearm.scale.y=1.35;sphere(.32,M.stone,s*.05,-.63,.13,arm,0);limbs.push(arm);sphere(.2,M.leafDark,s*.4,1.43,-.05,visual,0);}
      box(.055,.7,.055,M.rune,0,1.07,.43,visual);box(.39,.045,.07,M.rune,0,1.21,.44,visual);
    }
    else if(wolf){const body=sphere(.43,flesh,0,.54,0,visual,1);body.scale.set(.64,.72,1.27);const neck=sphere(.29,flesh,0,.66,.4,visual,1);const head=sphere(.24,flesh,0,.76,.59,visual,1);head.scale.set(.9,.84,1.2);box(.21,.16,.3,M.darkstone,0,.7,.77,visual);sphere(.07,M.black,0,.71,.94,visual,1);for(const s of [-1,1]){const ear=cylinder(0,.12,.26,flesh,s*.145,.99,.53,visual,4);ear.rotation.z=s*-.18;sphere(.032,M.glass,s*.14,.8,.76,visual,0);}for(const x of [-.2,.2])for(const z of [-.3,.3]){const limb=group(x,.49,z,visual);box(.095,.39,.12,flesh,0,-.19,0,limb);limbs.push(limb);}const tail=cylinder(.04,.1,.64,flesh,0,.68,-.71,visual,6);tail.rotation.x=-.75;}
    else {
      const scale=boss?1.85:1;visual.scale.setScalar(scale);box(.46,.51,.28,flesh,0,.7,0,visual);box(.5,.16,.32,M.leather,0,.43,0,visual);const head=sphere(.24,flesh,0,1.14,.035,visual,1);head.scale.y=1.05;
      for(const s of [-1,1]){sphere(.043,M.glass,s*.1,1.19,.25,visual,0);const ear=cylinder(0,.12,.38,flesh,s*.26,1.24,0,visual,4);ear.rotation.z=s*-.75;const leg=group(s*.13,.42,0,visual);box(.13,.39,.16,flesh,0,-.19,0,leg);limbs.push(leg);const arm=group(s*.31,.91,0,visual);box(.15,.4,.17,flesh,0,-.19,0,arm);limbs.push(arm);if(boss){const horn=cylinder(0,.12,.52,M.straw,s*.16,1.58,-.07,visual,7);horn.rotation.z=s*-.36;sphere(.25,M.darkstone,s*.36,.95,0,visual,0);}}
      const club=group(.37,.55,.06,visual);beam([0,-.4,0],[0,.3,0],.065,M.wood,club);sphere(boss?.22:.15,M.darkstone,0,-.32,0,club,0);
      if(boss){for(const s of [-1,1]){const wing=box(.7,.6,.05,M.red,s*.5,.9,-.22,visual);wing.rotation.z=s*.4;}}
    }
    const bar=healthBar(p,boss?2.9:type==='golem'?2.18:type==='slime'?.98:wolf?1.32:1.63,true);return{p,visual,legs:limbs,bar,kind:'enemy',type,id:actor.id,prevX:actor.x,prevZ:actor.z,phase:random()*6.28};
  }
  function disposeActor(a){a.p.removeFromParent();if(a.hit){const at=hitTargets.indexOf(a.hit);if(at>=0)hitTargets.splice(at,1);}a.p.traverse(o=>{if(o.isMesh&&o.geometry!==healthGeometry)o.geometry?.dispose();});}
  function updateActor(a,d,dt){
    const x=Number.isFinite(d.x)?d.x:a.p.position.x,z=Number.isFinite(d.z)?d.z:a.p.position.z;
    const dx=x-a.p.position.x,dz=z-a.p.position.z,move=Math.hypot(dx,dz);a.p.position.set(x,0,z);
    if(move>.005){const angle=Math.atan2(dx,dz),delta=Math.atan2(Math.sin(angle-a.visual.rotation.y),Math.cos(angle-a.visual.rotation.y));a.visual.rotation.y+=delta*Math.min(1,dt*12);}
    const walking=move>.002&&d.status!=='resting'&&d.status!=='recovering'&&d.status!=='休養中';const swing=walking?Math.sin(elapsed*(a.kind==='hero'?9:12)+a.phase)*.55:Math.sin(elapsed*1.8+a.phase)*.025;
    a.legs.forEach((l,i)=>{l.rotation.x=swing*(i%2?1:-1);});
    if(a.arms){a.arms.forEach((l,i)=>{l.rotation.x=-swing*(i%2?1:-1);});if(d.status==='fighting'||d.status==='attacking'||d.status==='hunting'||d.status==='戰鬥中'){const strike=Math.sin(elapsed*7.8+a.phase);a.arms[1].rotation.x=-1.05+strike*.73;}}
    a.visual.position.y=walking?Math.abs(Math.sin(elapsed*9+a.phase))*.045:0;
    if(a.type==='slime'){const bounce=Math.sin(elapsed*4+a.phase);a.visual.scale.set(1+bounce*.05,1-bounce*.08,1+bounce*.05);a.visual.position.y=Math.max(0,bounce)*.05;}
    if(a.cape)a.cape.rotation.x=-.13+Math.sin(elapsed*4+a.phase)*.05+(walking?.15:0);
    const ratio=Math.max(0,Math.min(1,(d.hp??100)/(d.maxHp||100)));a.bar.fill.scale.x=.72*ratio;a.bar.fill.position.x=-(.72-.72*ratio)/2;a.bar.g.quaternion.copy(camera.quaternion);a.bar.g.visible=ratio<.999||selected==='hunter:'+d.id||a.kind==='enemy';
    if(a.halo)a.halo.material.opacity=selected===('hunter:'+d.id)?.8:.2;
  }
  const combatGlowMap=texture(64,(c,s)=>{const glow=c.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);glow.addColorStop(0,'rgba(255,255,255,1)');glow.addColorStop(.18,'rgba(255,255,255,.8)');glow.addColorStop(.48,'rgba(255,255,255,.2)');glow.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=glow;c.fillRect(0,0,s,s);});
  function visualEffect(event){
    const p=group(0,0,0,dynamic),geometries=[],effectMaterials=[],effectTextures=[];
    const type=event.type,combat=['arrow','spell','slash','hit','magic'].includes(type);
    const targetActor=event.targetId?actorMap.get('enemy:'+event.targetId):null;
    const targetHeight=type==='hit'?.8:targetActor?.type==='boss'?1.35:targetActor?.type==='golem'?1:.65;
    const target=new THREE.Vector3(event.x||0,targetHeight,event.z||0);
    const source=new THREE.Vector3(Number.isFinite(event.sourceX)?event.sourceX:target.x,1.03,Number.isFinite(event.sourceZ)?event.sourceZ:target.z);
    const color=type==='heal'?0x9fcf9c:type==='hit'?0xff9987:type==='spell'||type==='magic'?0xa8dfff:type==='gold'||type==='loot'||type==='harvest'?0xe8c477:0xffe3ad;
    const duration=combat?.78:.75;
    const visual={p,life:0,duration,geometries,materials:effectMaterials,textures:effectTextures,animate:null};
    const animations=[];
    function fxMaterial(c,opacity=1){const m=new THREE.MeshBasicMaterial({color:c,transparent:true,opacity,side:THREE.DoubleSide,depthWrite:false});effectMaterials.push(m);return m;}
    function fxMesh(geometry,material,parent=p){geometries.push(geometry);const m=new THREE.Mesh(geometry,material);m.castShadow=false;m.receiveShadow=false;parent.add(m);return m;}
    function glowSprite(c,size,parent=p){const material=new THREE.SpriteMaterial({map:combatGlowMap,color:c,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});effectMaterials.push(material);const sprite=new THREE.Sprite(material);sprite.scale.setScalar(size);parent.add(sprite);return sprite;}
    let impactAt=0;
    if(type==='arrow'){
      impactAt=.23;
      const arrow=group(0,0,0,p),shaftMaterial=fxMaterial(0xe4bd80),tipMaterial=fxMaterial(0xf0f1d4),featherMaterial=fxMaterial(0xcbe1ba);
      const shaft=fxMesh(new THREE.CylinderGeometry(.022,.022,.73,5),shaftMaterial,arrow);shaft.rotation.x=Math.PI/2;
      const tip=fxMesh(new THREE.ConeGeometry(.079,.2,4),tipMaterial,arrow);tip.rotation.x=Math.PI/2;tip.position.z=.44;
      for(const angle of [0,Math.PI/2]){const fin=fxMesh(new THREE.PlaneGeometry(.13,.22),featherMaterial,arrow);fin.rotation.set(Math.PI/2,0,angle);fin.position.z=-.29;}
      const flightDirection=target.clone().sub(source).normalize();arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),flightDirection);
      const trail=fxMesh(new THREE.CylinderGeometry(.01,.035,.65,5),fxMaterial(0xe9d39b,.35),arrow);trail.rotation.x=Math.PI/2;trail.position.z=-.63;
      animations.push(t=>{const progress=Math.min(1,t/impactAt);arrow.position.lerpVectors(source,target,progress);arrow.position.y+=Math.sin(progress*Math.PI)*.14;arrow.visible=t<impactAt+.11;shaftMaterial.opacity=tipMaterial.opacity=featherMaterial.opacity=t<impactAt?1:Math.max(0,1-(t-impactAt)/.11);});
    }else if(type==='spell'||type==='magic'){
      impactAt=.3;
      const orb=group(0,0,0,p),core=fxMesh(new THREE.IcosahedronGeometry(.125,2),fxMaterial(0xe0fbff),orb);
      const aura=glowSprite(0x88d9ff,.8,orb);const orbit=fxMesh(new THREE.TorusGeometry(.23,.018,4,20),fxMaterial(0xc2a6ff),orb);orbit.rotation.x=1.05;
      const tail=[];for(let i=0;i<5;i++){const mote=glowSprite(i%2?0x98ccff:0xb99aff,.42-i*.055);tail.push(mote);}
      animations.push(t=>{const progress=Math.min(1,t/impactAt);orb.position.lerpVectors(source,target,progress);orb.position.y+=Math.sin(progress*Math.PI)*.32;orb.visible=t<impactAt+.08;core.rotation.y=t*16;orbit.rotation.z=t*12;aura.material.opacity=Math.max(0,Math.min(1,1-(t-impactAt)/.08));tail.forEach((mote,i)=>{const phase=Math.max(0,Math.min(1,(t-i*.032)/impactAt));mote.position.lerpVectors(source,target,phase);mote.position.y+=Math.sin(phase*Math.PI)*.32;mote.material.opacity=Math.max(0,.63-i*.08)*Math.max(0,Math.min(1,(impactAt+.12-t)/.12));mote.visible=t>i*.032;});});
    }else if(type==='slash'){
      const arc=fxMesh(new THREE.TorusGeometry(.63,.048,5,30,Math.PI*1.02),fxMaterial(0xffe3af));arc.position.copy(target);arc.position.y=.84;arc.rotation.set(-.42,Math.atan2(target.x-source.x,target.z-source.z),-.6);
      const innerArc=fxMesh(new THREE.TorusGeometry(.5,.018,4,25,Math.PI*.9),fxMaterial(0xffffff,.8));innerArc.position.copy(arc.position);innerArc.rotation.copy(arc.rotation);
      animations.push(t=>{const progress=Math.min(1,t/.32);arc.rotation.z=-.65+progress*1.15;innerArc.rotation.z=arc.rotation.z-.18;arc.scale.setScalar(.75+progress*.48);innerArc.scale.copy(arc.scale);arc.material.opacity=(1-progress)*.94;innerArc.material.opacity=(1-progress)*.65;});
    }else if(!combat){
      const pulse=fxMesh(new THREE.RingGeometry(.13,.21,28),fxMaterial(color,.7));pulse.position.set(target.x,.16,target.z);pulse.rotation.x=-Math.PI/2;
      const halo=glowSprite(color,.68);halo.position.set(target.x,.32,target.z);
      animations.push(t=>{pulse.scale.setScalar(1+t*5);pulse.position.y=.13+t*.18;pulse.material.opacity=Math.max(0,.7-t);halo.scale.setScalar(.6+t*.9);halo.material.opacity=Math.max(0,.6-t);halo.position.y=.32+t*.6;});
    }
    if(combat){
      const flash=glowSprite(color,.25);flash.position.copy(target);
      const particles=[];for(let i=0;i<5;i++){const spark=fxMesh(new THREE.IcosahedronGeometry(.045,0),fxMaterial(type==='spell'?i%2?0xbca3ff:0xa0edff:color));spark.position.copy(target);particles.push({spark,angle:i/5*Math.PI*2+random()*.4,speed:between(.6,1.3)});}
      animations.push(t=>{const age=t-impactAt,fade=Math.max(0,1-age/.27);flash.visible=age>=0;flash.scale.setScalar(.35+Math.max(0,age)*2.8);flash.material.opacity=fade*.95;particles.forEach(({spark,angle,speed})=>{spark.visible=age>=0;spark.position.set(target.x+Math.cos(angle)*Math.max(0,age)*speed,target.y+Math.max(0,age)*1.4-age*age*1.7,target.z+Math.sin(angle)*Math.max(0,age)*speed);spark.material.opacity=Math.max(0,1-age/.34);spark.rotation.set(age*7,age*3,0);});});
    }
    if(Number.isFinite(event.value)&&event.value>0){
      const label=document.createElement('canvas');label.width=128;label.height=64;const c=label.getContext('2d');c.font='bold 43px Georgia, serif';c.textAlign='center';c.textBaseline='middle';c.lineJoin='round';c.lineWidth=6;c.strokeStyle='rgba(22,29,32,.9)';c.strokeText('-'+Math.round(event.value),64,32);c.fillStyle=type==='hit'?'#ffc1ac':type==='spell'?'#caeaff':'#fff2c7';c.fillText('-'+Math.round(event.value),64,32);const map=new THREE.CanvasTexture(label);map.colorSpace=THREE.SRGBColorSpace;effectTextures.push(map);
      const material=new THREE.SpriteMaterial({map,transparent:true,depthTest:false,depthWrite:false});effectMaterials.push(material);const number=new THREE.Sprite(material);number.scale.set(1.44,.72,1);number.position.set(target.x,targetHeight+.9,target.z);number.renderOrder=40;p.add(number);
      animations.push(t=>{const age=t-impactAt;number.visible=age>=0;number.position.y=targetHeight+.9+Math.max(0,age)*1.1;number.position.x=target.x+Math.max(0,age)*.12;number.material.opacity=Math.max(0,Math.min(1,(duration-t)/.22));});
    }
    visual.animate=t=>animations.forEach(animate=>animate(t));visual.animate(0);return visual;
  }
  function disposeEffect(effect){effect.p.removeFromParent();effect.geometries.forEach(g=>g.dispose());effect.materials.forEach(m=>m.dispose());effect.textures.forEach(t=>t.dispose());}
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let pointerDown=null;let hoverThrottle=0;
  function pick(event){const r=canvas.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);return raycaster.intersectObjects(hitTargets,false)[0]?.object.userData.selectId;}
  function pointerStart(e){pointerDown={x:e.clientX,y:e.clientY,time:performance.now()};focusTween=null;}
  function pointerEnd(e){if(!pointerDown)return;const distance=Math.hypot(e.clientX-pointerDown.x,e.clientY-pointerDown.y);if(distance<6&&performance.now()-pointerDown.time<700){const id=pick(e);if(id){setSelected(id);onSelect(id);}}pointerDown=null;}
  function pointerMove(e){if(pointerDown)return;const now=performance.now();if(now-hoverThrottle<70)return;hoverThrottle=now;const id=pick(e);canvas.style.cursor=id?'pointer':'grab';const b=BUILDINGS.find(b=>b.id===id);hover.visible=!!b;if(b){hover.position.set(b.x,.061,b.z);hover.scale.setScalar(Math.max(b.w,b.d)*.64);}}
  canvas.addEventListener('pointerdown',pointerStart);canvas.addEventListener('pointerup',pointerEnd);canvas.addEventListener('pointermove',pointerMove);
  function setSelected(id){selected=id;const b=BUILDINGS.find(b=>b.id===id);selection.visible=!!b;if(b){selection.position.set(b.x,.064,b.z);selection.scale.setScalar(Math.max(b.w,b.d)*.65);}}
  function focus(id){const b=BUILDINGS.find(b=>b.id===id);const home=id==='village'||id==='home'||!id;let target;if(id==='hunt'||id==='forest')target=new THREE.Vector3(HUNT_ZONE.x,0,HUNT_ZONE.z);else if(home)target=new THREE.Vector3(-1,0,0);else if(b){target=new THREE.Vector3(b.x,0,b.z);setSelected(id);}else if(String(id).startsWith('hunter:')){const a=actorMap.get(id);if(a)target=a.p.position.clone();}if(target){const offset=camera.position.clone().sub(controls.target);focusTween={from:controls.target.clone(),to:target,t:0,fromZoom:camera.zoom,toZoom:home?1:b?1.55:1.2,fromOffset:offset,toOffset:home?new THREE.Vector3(35,39,44):offset.clone()};}}
  function resize(){const rect=canvas.getBoundingClientRect(),width=Math.max(1,rect.width||innerWidth),height=Math.max(1,rect.height||innerHeight);renderer.setSize(width,height,false);const aspect=width/height,halfHeight=aspect<1?26:20;camera.left=-halfHeight*aspect;camera.right=halfHeight*aspect;camera.top=halfHeight;camera.bottom=-halfHeight;camera.updateProjectionMatrix();}
  function project(x,y,z){const r=canvas.getBoundingClientRect(),v=new THREE.Vector3(x,y,z).project(camera);return{x:(v.x+1)*r.width/2,y:(1-v.y)*r.height/2,visible:v.z>-1&&v.z<1&&Math.abs(v.x)<1&&Math.abs(v.y)<1};}
  function setQuality(high){renderer.setPixelRatio(high?Math.min(devicePixelRatio||1,1.75):1);renderer.shadowMap.enabled=!!high;resize();}
  // UI phases: afternoon 0–.30, dusk .30–.60, night .60–.84, dawn .84–1.
  // Night retains moon and sky fill, so hunters remain legible while lamps glow.
  const dayKeys=[
    {at:0,sun:0xffd3a0,sky:0xc5d9e0,ground:0x48483f,bg:0xaebec0,direct:3,ambient:1.4,fill:.55,glow:.95,exposure:1.12},
    {at:.28,sun:0xffc18b,sky:0xc1d0db,ground:0x494139,bg:0xb6b5ac,direct:2.7,ambient:1.3,fill:.56,glow:1.1,exposure:1.12},
    {at:.45,sun:0xff965e,sky:0xa9b4d3,ground:0x403c45,bg:0xa89089,direct:2.1,ambient:1.17,fill:.6,glow:1.4,exposure:1.14},
    {at:.61,sun:0xa2bce5,sky:0x8a9dbd,ground:0x303544,bg:0x46546d,direct:.83,ambient:1.12,fill:.73,glow:2.2,exposure:1.2},
    {at:.82,sun:0xa2bce5,sky:0x8a9dbd,ground:0x303544,bg:0x46546d,direct:.83,ambient:1.12,fill:.73,glow:2.2,exposure:1.2},
    {at:.92,sun:0xffbf94,sky:0xb5c9d3,ground:0x424642,bg:0xb6b0a4,direct:1.9,ambient:1.32,fill:.58,glow:1.2,exposure:1.16},
    {at:1,sun:0xffd3a0,sky:0xc5d9e0,ground:0x48483f,bg:0xaebec0,direct:3,ambient:1.4,fill:.55,glow:.95,exposure:1.12},
  ].map(k=>({...k,sun:new THREE.Color(k.sun),sky:new THREE.Color(k.sky),ground:new THREE.Color(k.ground),bg:new THREE.Color(k.bg)}));
  const baseLampIntensities=lanternLights.map(l=>l.intensity);
  function setTime(phase){const t=typeof phase==='number'?((phase%1)+1)%1:0;let i=0;while(i<dayKeys.length-2&&dayKeys[i+1].at<t)i++;const a=dayKeys[i],b=dayKeys[i+1];let u=(t-a.at)/(b.at-a.at);u=u*u*(3-2*u);sun.color.lerpColors(a.sun,b.sun,u);sky.color.lerpColors(a.sky,b.sky,u);sky.groundColor.lerpColors(a.ground,b.ground,u);scene.background.lerpColors(a.bg,b.bg,u);scene.fog.color.copy(scene.background);sun.intensity=THREE.MathUtils.lerp(a.direct,b.direct,u);sky.intensity=THREE.MathUtils.lerp(a.ambient,b.ambient,u);fill.intensity=THREE.MathUtils.lerp(a.fill,b.fill,u);M.glass.emissiveIntensity=THREE.MathUtils.lerp(a.glow,b.glow,u);renderer.toneMappingExposure=THREE.MathUtils.lerp(a.exposure,b.exposure,u);lanternLights.forEach((l,j)=>{l.intensity=baseLampIntensities[j]*(M.glass.emissiveIntensity/.95);});}
  function update(dt,state){if(disposed)return;dt=Math.min(.05,Math.max(0,dt||.016));elapsed+=dt;
    if(focusTween){focusTween.t=Math.min(1,focusTween.t+dt*1.5);const t=1-Math.pow(1-focusTween.t,3);controls.target.lerpVectors(focusTween.from,focusTween.to,t);camera.position.copy(controls.target).add(new THREE.Vector3().lerpVectors(focusTween.fromOffset,focusTween.toOffset,t));camera.zoom=THREE.MathUtils.lerp(focusTween.fromZoom,focusTween.toZoom,t);camera.updateProjectionMatrix();if(focusTween.t>=1)focusTween=null;}
    controls.update();
    if(state){const live=new Set();for(const d of state.hunters||[]){const key='hunter:'+d.id;live.add(key);if(!actorMap.has(key))actorMap.set(key,hero(d));updateActor(actorMap.get(key),d,dt);}for(const d of state.enemies||[]){const key='enemy:'+d.id;live.add(key);if(!actorMap.has(key))actorMap.set(key,monster(d));updateActor(actorMap.get(key),d,dt);}for(const [key,a]of actorMap)if(!live.has(key)){disposeActor(a);actorMap.delete(key);}
      for(const d of state.hunters||[]){const a=actorMap.get('hunter:'+d.id),target=(state.enemies||[]).find(e=>e.id===d.targetId);if(a&&target&&d.status==='戰鬥中')a.visual.rotation.y=Math.atan2(target.x-d.x,target.z-d.z);}
      const currentEffects=new Set();for(const e of state.effects||[]){const key=e.id??`${e.type}:${e.x}:${e.z}`;currentEffects.add(key);if(!seenEffects.has(key)){seenEffects.add(key);if((e.age||0)<.75)effectMap.set(key,visualEffect(e));}}for(const key of seenEffects)if(!currentEffects.has(key))seenEffects.delete(key);
    }
    for(const [key,e]of effectMap){e.life+=dt;e.animate(e.life);if(e.life>=e.duration){disposeEffect(e);effectMap.delete(key);}}
    for(const o of smoke){const t=(elapsed*.065+o.phase)%1;o.s.position.copy(o.source).add(new THREE.Vector3(t*.8+Math.sin(elapsed*.22+o.phase)*.17,t*4.4,Math.sin(t*4+o.phase)*.22));o.s.scale.setScalar(.4+t*1.4);o.s.material.opacity=Math.sin(t*Math.PI)*.29;}
    flames.forEach((f,i)=>{f.scale.y=1+Math.sin(elapsed*8+i*2)*.19;});
    for(const b of birds){const angle=elapsed*.035+b.phase;b.p.position.set(Math.cos(angle)*b.r-3,b.height+Math.sin(angle*2)*.5,Math.sin(angle)*b.r-5);b.p.rotation.y=-angle;b.left.rotation.z=Math.sin(elapsed*6+b.phase)*.45;b.right.rotation.z=-b.left.rotation.z;}
    if(selection.visible)selection.material.opacity=.64+Math.sin(elapsed*2)*.13;
    M.water.color.setRGB(.28+Math.sin(elapsed*.25)*.015,.47,.49);
    renderer.render(scene,camera);
  }
  function dispose(){disposed=true;controls.dispose();canvas.removeEventListener('pointerdown',pointerStart);canvas.removeEventListener('pointerup',pointerEnd);canvas.removeEventListener('pointermove',pointerMove);for(const effect of effectMap.values())disposeEffect(effect);effectMap.clear();const geos=new Set(),mats=new Set(materials);scene.traverse(o=>{if(o.geometry)geos.add(o.geometry);if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>mats.add(m));else mats.add(o.material);}});geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());renderer.dispose();}
  resize();update(.016,null);
  return{update,resize,project,focus,setQuality,setTime,setSelected,camera,renderer,scene,dispose};
}
