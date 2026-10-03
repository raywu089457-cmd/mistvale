const cache=new Map();
// l0veyou 生的圖示圖集(icons@2x,48px 一格)。載入是非同步的:先回傳程序版,圖集好了再把
// 所有已建立的圖示 canvas 重畫一次,所以 UI 不用等圖集也不會留下程序版。
const ICON_ALIAS={weapon:'swords',bandage:'heal',flour:'bag',dungeon:'skull',settings:'gear'};
const made=[];let iconAtlas=null,iconFrames=null;
function paintAtlas(c,name){const ex=extra[name],f=ex?ex.f:iconFrames?.[ICON_ALIAS[name]||name];if(!f)return false;const g=c.getContext('2d');
 c.width=c.height=48;g.imageSmoothingEnabled=false;const k=Math.min(46/f.w,46/f.h),w=Math.round(f.w*k),h=Math.round(f.h*k);
 g.drawImage(ex?ex.img:iconAtlas,f.x,f.y,f.w,f.h,Math.round((48-w)/2),Math.round((48-h)/2),w,h);return true;}
// 獸皮圖示在 vfx 圖集(iconLeather),其餘在 icons 圖集;兩張都載完才重畫。
const extra={};
(()=>{const a=globalThis.PIXEL_ASSETS||{};if(!a.iconsAtlas2x||!a.iconsManifest2x||typeof Image==='undefined')return;
 const parse=m=>typeof m==='string'?JSON.parse(m):m,m=parse(a.iconsManifest2x),im=new Image();let pending=1;
 const done=()=>{if(--pending)return;iconAtlas=im;iconFrames=m.cells;for(const r of made.splice(0)){const c=r.c.deref();if(c)paintAtlas(c,r.name);}};
 if(a.vfxAtlas2x&&a.vfxManifest2x){pending++;const v=new Image(),vm=parse(a.vfxManifest2x);v.onload=()=>{if(vm.cells.iconLeather)extra.leather={img:v,f:vm.cells.iconLeather};done();};v.onerror=done;v.src=a.vfxAtlas2x;}
 im.onload=done;im.src=a.iconsAtlas2x;})();
globalThis.__mistvaleIcons=()=>({ready:!!iconAtlas,cells:iconFrames?Object.keys(iconFrames).length:0});
export function iconCanvas(name){
 if(iconAtlas){const c=document.createElement('canvas');if(paintAtlas(c,name))return c;}
 const c0=proceduralIcon(name);if(!iconAtlas&&typeof WeakRef!=='undefined')made.push({c:new WeakRef(c0),name});return c0;
}
function proceduralIcon(name){
 if(cache.has(name)){const c=document.createElement('canvas');c.width=c.height=24;c.getContext('2d').drawImage(cache.get(name),0,0);return c;}
 const c=document.createElement('canvas');c.width=c.height=24;const g=c.getContext('2d');g.imageSmoothingEnabled=false;
 const r=(x,y,w,h,col)=>{g.fillStyle=col;g.fillRect(x,y,w,h);};
 const poly=(pts,col)=>{g.fillStyle=col;g.beginPath();pts.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();g.fill();};
 const o='#302c29',light='#fff0bf',gold='#e8b84e',shade='#8e602f',steel='#b6c6c7';
 if(name==='gold'){r(7,2,10,20,o);r(4,5,16,14,o);r(6,4,12,16,gold);r(5,7,14,10,gold);r(7,4,3,14,'#ffdc7e');r(10,6,6,2,shade);r(10,8,2,8,shade);r(10,16,6,2,shade);r(11,9,5,2,shade);r(15,10,2,6,shade);r(8,5,2,3,light);}
 else if(name==='gems'){poly([[12,1],[21,8],[18,18],[12,23],[5,18],[2,8]],o);poly([[12,3],[19,8],[16,17],[12,20],[7,17],[4,8]],'#7699d7');poly([[12,3],[12,20],[7,17],[4,8]],'#a6d4ec');poly([[12,3],[17,8],[12,10],[7,8]],'#e0f3e9');poly([[12,10],[17,8],[12,20]],'#526fba');}
 else if(name==='wood'){poly([[4,11],[14,2],[22,8],[11,21],[3,18]],o);poly([[6,11],[15,4],[20,8],[10,18]],'#9b633a');poly([[6,11],[15,4],[17,5],[8,14]],'#d7a56b');r(3,12,9,8,'#d8af75');r(5,14,5,4,'#855637');r(6,15,3,2,'#e8c98c');r(1,16,2,3,o);}
 else if(name==='ore'){poly([[2,18],[5,8],[13,2],[21,9],[23,17],[15,22],[6,21]],o);poly([[4,17],[7,9],[13,4],[19,10],[20,17],[15,20],[7,19]],'#82959c');poly([[7,9],[13,4],[16,10],[11,14],[4,17]],'#c4d0c8');poly([[11,14],[16,10],[20,17],[15,20]],'#637581');r(10,8,3,2,'#e5e2ce');}
 else if(name==='herb'){r(11,5,2,17,'#795432');poly([[11,16],[3,13],[2,8],[7,9],[11,13]],'#88b966');poly([[12,12],[16,6],[22,5],[21,11],[14,14]],'#5e984f');poly([[12,8],[8,4],[10,1],[15,2],[15,6]],'#bad57c');r(16,8,3,1,'#c4dc86');}
 else if(name==='food'){poly([[2,9],[6,4],[17,3],[22,8],[22,17],[17,21],[5,21],[1,17]],o);poly([[3,10],[7,6],[17,5],[20,9],[20,16],[16,19],[5,19],[3,16]],'#c99144');r(5,9,13,5,'#edc275');r(7,7,3,2,light);r(9,9,2,7,'#a77539');r(15,7,2,8,'#a77539');r(5,17,13,2,'#9d6d38');}
 else if(name==='drink'){r(6,5,12,17,o);r(8,7,8,12,'#cf9b55');r(9,7,2,10,'#f0cb84');r(17,8,5,10,o);r(18,10,2,5,'#d4b67d');r(5,2,12,5,'#f7e8bd');r(4,4,16,3,'#f2d99e');r(9,3,6,2,'#fff4d8');}
 else if(name==='bed'){r(2,7,3,15,'#6c4d33');r(3,6,18,13,o);r(5,8,6,5,'#eee5bf');r(11,8,9,8,'#668dba');r(11,8,8,2,'#a7c8dd');r(4,17,18,3,'#b99a64');r(19,10,3,12,'#7d603f');}
 else if(name==='heal'||name==='bandage'){r(3,4,17,17,o);r(5,6,13,13,'#e8e0be');r(10,7,3,10,'#c57169');r(7,10,9,3,'#c57169');r(5,6,13,2,'#fff0d0');}
 else if(name==='cloth'){poly([[5,2],[20,3],[21,19],[17,22],[3,20],[2,5]],o);poly([[6,4],[18,5],[19,19],[15,20],[4,18],[4,6]],'#d4ccae');r(7,5,2,12,'#f0e9cb');r(13,7,2,13,'#aeb2a5');r(16,8,2,9,'#e8e4c7');}
 else if(name==='leather'){poly([[6,2],[10,5],[15,4],[19,1],[21,6],[18,11],[21,19],[16,22],[11,18],[5,22],[2,17],[6,10],[3,5]],o);poly([[7,4],[11,7],[16,6],[18,3],[19,6],[16,11],[19,18],[16,20],[11,16],[6,20],[4,16],[8,10],[5,5]],'#ad7950');r(10,9,2,8,'#d1a575');r(14,8,2,8,'#8a5d40');}
 else if(name==='flour'||name==='bag'){r(7,1,10,5,'#ad8951');r(9,5,6,2,o);poly([[9,7],[16,7],[21,15],[19,22],[4,22],[2,15]],o);poly([[9,9],[15,9],[19,15],[18,20],[5,20],[4,15]],'#c8b485');r(7,12,2,7,'#e8d7a7');r(12,12,3,6,'#957947');}
 else if(name==='armor'){poly([[6,3],[10,5],[14,5],[18,3],[23,10],[19,13],[17,11],[18,22],[6,22],[7,11],[4,13],[1,10]],o);poly([[7,5],[10,7],[14,7],[17,5],[20,10],[18,11],[16,9],[16,20],[8,20],[8,9],[5,11],[3,10]],steel);r(9,8,6,8,'#7f97a8');r(9,17,6,2,gold);r(10,9,2,7,'#d8e0d6');}
 else if(['swords','weapon','hammer','anvil'].includes(name)){if(name==='anvil'){poly([[1,7],[22,7],[19,12],[14,14],[14,18],[19,20],[19,22],[4,22],[4,20],[9,18],[9,13],[5,13]],o);r(3,8,18,3,'#c3ceca');r(7,11,9,2,'#7e939b');r(10,13,3,7,'#91a4a5');r(5,20,13,1,'#c6c6b0');}else{for(let i=0;i<15;i++){r(17-i,2+i,4,3,o);r(18-i,2+i,2,2,steel);}r(2,17,5,5,'#936132');r(3,15,8,2,gold);if(name==='swords')for(let i=0;i<13;i++)r(3+i,3+i,2,2,'#ead9aa');if(name==='hammer'){r(10,1,11,7,o);r(12,2,7,4,'#a5b6b4');}}}
 else if(name==='scroll'){r(5,3,15,18,o);r(6,4,12,16,'#e6cf95');r(3,2,17,3,'#ba9557');r(6,19,16,3,'#b79454');r(9,7,7,1,'#9a794d');r(9,10,6,1,'#9a794d');r(9,13,7,1,'#9a794d');r(9,16,4,1,'#9a794d');}
 else if(name==='map'){poly([[1,5],[8,2],[16,6],[23,3],[22,20],[16,23],[8,19],[1,22]],o);poly([[3,6],[8,4],[15,8],[21,6],[20,18],[16,20],[8,17],[3,19]],'#d8cda3');r(7,6,1,10,'#b59869');r(15,8,1,11,'#aa9567');r(11,12,3,3,'#b77356');r(11,10,2,7,'#a77553');}
 else if(name==='dungeon'||name==='skull'){r(5,3,14,15,o);r(3,6,18,10,o);r(6,4,12,12,'#dad8bd');r(4,7,16,8,'#cccdbb');r(7,8,4,4,'#45444a');r(14,8,4,4,'#45444a');r(11,12,3,3,'#72716a');r(7,17,10,4,'#dad8bd');r(10,17,1,4,o);r(14,17,1,4,o);}
 else if(name==='hunter'){r(7,2,11,10,o);r(8,4,9,7,'#deb07e');r(8,2,10,3,'#77523c');r(10,7,1,2,o);r(15,7,1,2,o);r(7,12,12,7,'#749178');r(8,13,2,6,'#acbd8a');r(6,19,6,3,'#74573c');r(15,19,6,3,'#74573c');}
 else if(name==='hall'){poly([[1,11],[12,1],[23,11]],o);poly([[4,10],[12,3],[20,10]],'#65a0c2');r(5,11,15,11,o);r(7,12,11,8,'#e2c990');r(11,14,4,7,'#795332');r(7,13,3,3,'#f4e5b1');r(16,13,2,3,'#f4e5b1');}
 else if(name==='trade'){r(2,6,17,3,'#dfc674');poly([[16,3],[22,7],[16,12]],'#dfc674');r(5,15,17,3,'#94b879');poly([[8,12],[1,16],[8,22]],'#94b879');}
 else if(name==='horn'){poly([[3,3],[8,6],[10,13],[17,16],[22,15],[20,21],[10,20],[5,14]],o);poly([[4,4],[7,7],[9,15],[17,19],[20,18],[17,20],[11,18],[7,13]],'#d3b875');r(3,3,5,3,'#e8d598');r(13,17,3,3,'#aa7f44');}
 else{r(7,2,10,20,'#b6b99a');r(2,7,20,10,'#b6b99a');r(4,4,16,16,'#89977d');r(8,8,8,8,o);r(10,10,4,4,'#dad9b9');}
 cache.set(name,c);return proceduralIcon(name);
}
