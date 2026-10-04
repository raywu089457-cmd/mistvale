// check_zorder.mjs — 穿模檢查:獵人跟建築的畫面框重疊時,畫的先後要跟幾何一致。
// 正確:從獵人沿 (+1,+1)(往鏡頭)射出穿過佔地 → 獵人在後;沿 (−1,−1) 穿過 → 獵人在前;都沒穿過＝在旁邊,不會互相遮,不判。
// 遊戲實際順序用 __mistvaleOrder() 讀(畫的先後)。量 60 秒實機,每一幀每一對重疊都判一次。exit 1 = 有錯序。
import path from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';import {execSync} from 'node:child_process';
const pw=await import(pathToFileURL(path.join(execSync('npm root -g').toString().trim(),'playwright','index.js')).href);const {chromium}=pw.default||pw;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');const html=process.env.HTML||path.resolve(root,'../../outputs/暮影村.html');
const secs=+(process.argv[2]||60);
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto(pathToFileURL(html).href+'?preview=1',{waitUntil:'load',timeout:180000});await p.waitForTimeout(1500);await p.click('#start-button');
await p.waitForFunction(()=>globalThis.__mistvaleHits&&globalThis.__mistvaleDetails?.().ready,null,{timeout:60000});
const r=await p.evaluate(async secs=>{const V=__mistvaleView,G=__mistvaleGame;V.lookAt(-8,4,1.6);const {BUILDINGS}=globalThis.__mistvaleData||{};
 const R={pairs:0,wrong:0,ex:[]};const t0=performance.now();
 await new Promise(res=>{const step=()=>{const s=G.state,H=__mistvaleHits(),bh=new Map(H.filter(h=>!h.id.startsWith('hunter:')).map(h=>[h.id,h]));
  for(const hh of H.filter(h=>h.id.startsWith('hunter:'))){const h=s.hunters.find(q=>'hunter:'+q.id===hh.id);if(!h||h.hp<=0)continue;
   for(const [id,br] of bh){const L=s.layout[id],B=globalThis.__mistvaleBuildingSize?.(id);if(!L||!B)continue;
    if(hh.x+hh.w<=br.x||br.x+br.w<=hh.x||hh.y+hh.h<=br.y||br.y+br.h<=hh.y)continue;
    const lo=Math.max(L.x-B.w/2-h.x,L.z-B.d/2-h.z),hi=Math.min(L.x+B.w/2-h.x,L.z+B.d/2-h.z);if(lo>hi)continue;const front=hi<=0,O=__mistvaleOrder(),drawnFront=O.indexOf('hunter:'+h.id)>O.indexOf(id);R.pairs++;
    if(front!==drawnFront){R.wrong++;if(R.ex.length<12)R.ex.push({hero:h.id,b:id,x:+h.x.toFixed(2),z:+h.z.toFixed(2),bx:L.x,bz:L.z,front,drawnFront});}}}
  if(performance.now()-t0<secs*1000)requestAnimationFrame(step);else res();};step();});return R;},secs);
const d=await p.evaluate(()=>{const s=__mistvaleGame.state,O=__mistvaleOrder(),D=__mistvaleDecor();let bad=0,n=0;const ex=[];
 for(const b of Object.keys(s.layout)){const B=__mistvaleBuildingSize(b),L=s.layout[b];if(!B||!O.includes(b)||b==='dungeon')continue;
  for(const q of D){if(['flowers','wheat','cabbage','garden','frozenPond','plot','rock'].includes(q.type))continue;
   if(Math.abs((q.x-q.z)-(L.x-L.z))>8||Math.abs((q.x+q.z)-(L.x+L.z))>9)continue;n++;
   const lo=Math.max(L.x-B.w/2-q.x,L.z-B.d/2-q.z),hi=Math.min(L.x+B.w/2-q.x,L.z+B.d/2-q.z);if(lo>hi){n--;continue;}const front=hi<=0,key=__mistvaleDecorKey(q),bk=L.x+L.z+.2;
   if(front!==(key>bk)){bad++;if(ex.length<8)ex.push({t:q.type,x:+q.x.toFixed(1),z:+q.z.toFixed(1),b});}}}return{n,bad,ex};});
console.log('decor',JSON.stringify(d));r.wrong+=d.bad;
console.log(JSON.stringify(r));await b.close();process.exit(r.wrong?1:0);
