// village-nav.js — 村內自由尋路:0.5 格解析度的可走格 + 8 方向 A*,再把路徑縮成「最少轉彎」的 8 方向折線。
// 可走格由呼叫者決定(isOpen):村內鋪面(街道＋拓寬鋪滿的街區)、扣掉建築。
// 路徑只會朝 8 個方向(東西南北＋四個斜向)走;起點/終點若不在格子中心,只多一小段接到最近的可走格。
import {VILLAGE_BOUNDS} from './village-grid.js';

export const CELL=.5;
const SQ2=Math.SQRT2,DI=[1,-1,0,0,1,1,-1,-1],DJ=[0,0,1,-1,1,-1,1,-1],sgn=Math.sign;

export function createVillageNav(isOpen){
  const B=VILLAGE_BOUNDS,W=Math.ceil((B.maxX-B.minX)/CELL),H=Math.ceil((B.maxZ-B.minZ)/CELL),open=new Uint8Array(W*H);
  const cx=i=>B.minX+(i+.5)*CELL,cz=j=>B.minZ+(j+.5)*CELL;
  for(let j=0;j<H;j++)for(let i=0;i<W;i++)open[j*W+i]=isOpen(cx(i),cz(j))?1:0;
  const ok=(i,j)=>i>=0&&j>=0&&i<W&&j<H&&open[j*W+i]===1;
  const cellOf=(x,z)=>[Math.max(0,Math.min(W-1,Math.floor((x-B.minX)/CELL))),Math.max(0,Math.min(H-1,Math.floor((z-B.minZ)/CELL)))];

  // 離 (x,z) 最近的可走格(由近到遠一圈圈找);找不到(超過 maxR 格)回 null。
  function nearestOpen(x,z,maxR=24){
    const [ci,cj]=cellOf(x,z);if(ok(ci,cj))return [ci,cj];
    let best=null,bd=Infinity;
    for(let r=1;r<=maxR;r++){
      for(let dj=-r;dj<=r;dj++)for(let di=-r;di<=r;di++){if(Math.max(Math.abs(di),Math.abs(dj))!==r)continue;const i=ci+di,j=cj+dj;if(!ok(i,j))continue;const d=Math.hypot(cx(i)-x,cz(j)-z);if(d<bd){bd=d;best=[i,j];}}
      if(best&&r*CELL>bd+CELL)break;}
    return best;}

  // 8 方向 A*(不切角:斜走時兩側的格子都要能走)。
  function astar(si,sj,ti,tj){
    const N=W*H,g=new Float32Array(N).fill(Infinity),par=new Int32Array(N).fill(-1),closed=new Uint8Array(N),heap=[];
    const push=(f,idx)=>{heap.push([f,idx]);let k=heap.length-1;while(k>0){const p=(k-1)>>1;if(heap[p][0]<=heap[k][0])break;[heap[p],heap[k]]=[heap[k],heap[p]];k=p;}};
    const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let k=0;for(;;){const l=2*k+1,r=l+1;let m=k;if(l<heap.length&&heap[l][0]<heap[m][0])m=l;if(r<heap.length&&heap[r][0]<heap[m][0])m=r;if(m===k)break;[heap[m],heap[k]]=[heap[k],heap[m]];k=m;}}return top;};
    const h=(i,j)=>{const dx=Math.abs(i-ti),dz=Math.abs(j-tj);return (dx+dz)+(SQ2-2)*Math.min(dx,dz);};
    const s=sj*W+si;g[s]=0;push(h(si,sj)*1.001,s);
    while(heap.length){
      const [,cur]=pop();if(closed[cur])continue;closed[cur]=1;const ci=cur%W,cj=(cur/W)|0;if(ci===ti&&cj===tj)break;
      for(let d=0;d<8;d++){const di=DI[d],dj=DJ[d],ni=ci+di,nj=cj+dj;if(!ok(ni,nj))continue;if(di&&dj&&(!ok(ci+di,cj)||!ok(ci,cj+dj)))continue;
        const n=nj*W+ni;if(closed[n])continue;const ng=g[cur]+(di&&dj?SQ2:1);if(ng<g[n]){g[n]=ng;par[n]=cur;push(ng+h(ni,nj)*1.001,n);}}}
    const t=tj*W+ti;if(!Number.isFinite(g[t]))return null;
    const cells=[];for(let n=t;n!==-1;n=par[n])cells.push([n%W,(n/W)|0]);return cells.reverse();}

  // 兩格之間「沿 8 方向直線」全是可走格(斜走不切角)。
  function lineClear(a,b){
    let i=a[0],j=a[1];const di=sgn(b[0]-i),dj=sgn(b[1]-j);
    while(i!==b[0]||j!==b[1]){const ni=i+di,nj=j+dj;if(!ok(ni,nj))return false;if(di&&dj&&(!ok(i+di,j)||!ok(i,j+dj)))return false;i=ni;j=nj;}
    return true;}
  // a→b 最多兩段 8 方向直線(先斜後直 / 先直後斜)。回傳:中間格;null = 單段直線可走;undefined = 走不通。
  function bridge(a,b){
    const dx=b[0]-a[0],dz=b[1]-a[1],ax=Math.abs(dx),az=Math.abs(dz);
    if(ax===0||az===0||ax===az)return lineClear(a,b)?null:undefined;
    const m=Math.min(ax,az),sx=sgn(dx),sz=sgn(dz),mid1=[a[0]+sx*m,a[1]+sz*m],mid2=[b[0]-sx*m,b[1]-sz*m];
    if(lineClear(a,mid1)&&lineClear(mid1,b))return mid1;
    if(lineClear(a,mid2)&&lineClear(mid2,b))return mid2;
    return undefined;}
  // A* 的格子路徑 → 最少轉彎的折線:從目前點找「最遠、且能用至多兩段 8 方向直線走到」的點,一路接下去。
  function simplify(cells){
    const out=[cells[0]];let i=0;
    while(i<cells.length-1){let j=cells.length-1,mid;
      for(;j>i+1;j--){mid=bridge(cells[i],cells[j]);if(mid!==undefined)break;}
      if(j===i+1)mid=null;
      if(mid)out.push(mid);out.push(cells[j]);i=j;}
    return out;}

  // a→b(世界座標)的路徑點(不含 a,最後一點就是確切的 b);走不通回 null。
  function path(a,b){
    const s=nearestOpen(a.x,a.z),t=nearestOpen(b.x,b.z);if(!s||!t)return null;
    const cells=astar(s[0],s[1],t[0],t[1]);if(!cells)return null;
    const pts=simplify(cells).map(([i,j])=>({x:cx(i),z:cz(j)}));
    if(pts.length&&Math.hypot(pts[0].x-a.x,pts[0].z-a.z)<.05)pts.shift();
    if(!pts.length||Math.hypot(pts.at(-1).x-b.x,pts.at(-1).z-b.z)>1e-4)pts.push({x:b.x,z:b.z});
    return pts;}
  const pathLength=(from,pts)=>pts.reduce((s,p,i)=>s+Math.hypot(p.x-(i?pts[i-1].x:from.x),p.z-(i?pts[i-1].z:from.z)),0);

  return {W,H,CELL,isOpenCell:ok,cellCenter:(i,j)=>({x:cx(i),z:cz(j)}),nearestOpen:(x,z)=>{const c=nearestOpen(x,z);return c?{x:cx(c[0]),z:cz(c[1])}:null;},path,pathLength};
}
