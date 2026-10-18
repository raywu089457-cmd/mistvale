// test-village-nav.mjs — 村內尋路的連通性:可走格只有一塊主區(沒有被圍死的口袋),每棟蓋了的建築門口都在主區、彼此都走得到。
import assert from 'node:assert/strict';
import {createGame} from './src/pixel-game.js';
import {BUILDINGS} from './src/pixel-data.js';
import {doorStand} from './src/landscape-layout.js';

const game=createGame();
const nav=game.villageNav();
assert.ok(nav, 'village navigation grid is built');
const {W,H,isOpenCell,cellCenter,nearestOpen,path}=nav;

// 8 方向連通(斜走時兩側格子都要可走,與 village-nav 的規則一致)
const comp=new Int32Array(W*H).fill(-1),sizes=[];
const DI=[1,-1,0,0,1,1,-1,-1],DJ=[0,0,1,-1,1,-1,1,-1];
for(let j=0;j<H;j++)for(let i=0;i<W;i++){
  if(!isOpenCell(i,j)||comp[j*W+i]>=0)continue;
  const id=sizes.length;sizes.push(0);const stack=[[i,j]];comp[j*W+i]=id;
  while(stack.length){const [ci,cj]=stack.pop();sizes[id]++;
    for(let d=0;d<8;d++){const ni=ci+DI[d],nj=cj+DJ[d];
      if(!isOpenCell(ni,nj)||comp[nj*W+ni]>=0)continue;
      if(DI[d]&&DJ[d]&&(!isOpenCell(ci+DI[d],cj)||!isOpenCell(ci,cj+DJ[d])))continue;
      comp[nj*W+ni]=id;stack.push([ni,nj]);}}}
assert.equal(sizes.length,1,`walkable village is one connected area, not ${sizes.length} (sizes ${sizes.join(',')})`);

const built=BUILDINGS.filter(b=>b.id!=='dungeon'&&game.state.buildings[b.id]>0);
const doors=built.map(b=>({id:b.id,d:doorStand(b,game.state.layout[b.id]||b)}));
for(const {id,d} of doors){
  const c=nearestOpen(d.x,d.z);
  assert.ok(c, `${id}: a walkable cell is next to the door`);
  const ci=Math.round((c.x-cellCenter(0,0).x)/.5),cj=Math.round((c.z-cellCenter(0,0).z)/.5);
  assert.ok(comp[cj*W+ci]>=0, `${id}: the door is reachable on foot`);
}
let pairs=0;
for(let a=0;a<doors.length;a++)for(let b=a+1;b<doors.length;b++){
  pairs++;
  assert.ok(path(doors[a].d,doors[b].d), `${doors[a].id} to ${doors[b].id} has a walking route`);
}
console.log(`PASS: village walkable area is one connected region (${W*H} grid, ${doors.length} doors, ${pairs} door-to-door routes).`);
