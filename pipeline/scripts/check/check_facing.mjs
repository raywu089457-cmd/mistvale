// check_facing.mjs — 實機每一幀比對「畫出來的動畫方向」與「實際移動方向/攻擊目標」(用 __mistvaleFacing() hook)。
// 用法:npm run build 後 node pipeline/scripts/check/check_facing.mjs [秒數=60] [鏡頭 world | look:x,z,縮放] [截圖前綴]
//
// 2026-11-15 規則(使用者:「允許斜走，90度分界分四個象限，每個象限一個動畫方向」;src/dir4.js):
//   人物可以斜走;動畫方向 = 「畫面上」的向量(等角投影 x 9、y 4.5,不是世界 dx/dz)落在哪個 90° 象限。
//   象限中心 = 畫面右/下/左/上(QUADRANT_OFFSET_DEG = 0,邊界在畫面對角線)。走路有 FACING_HYSTERESIS_DEG(10°)遲滯。
// 畫出來的方向(drawn):紙娃娃 = 實際合成的方向(doll.dir:0 上 1 右 2 下 3 左);sheet = 列名結尾 Up/Down/Left,沒有就看鏡像 f。
// 判準 facingOk(角度, drawn):drawn 的象限中心離向量角度 ≤ 45° + 遲滯 → 對(= 象限本身,或剛過邊界還在遲滯帶內);否則算錯。
// 項目:
//   heroWalk*   英雄走路格:drawn vs 這一幀螢幕上的移動方向
//   heroCombat* 英雄蓄力/出手/受擊/技能:drawn vs 目標(蓄力 = 鎖定的目標、出手/技能 = atkX/Z、受擊 = 打來的人)
//   enemyWalk*  魔物(未交戰)走路格;enemyCombat* 同上(魔物蓄力/出手/受擊)
//   *Strict     drawn ≠ 嚴格象限(不含遲滯帶)的次數,只供參考
//   *Fallback   素材沒有那個方向的列(例:受擊只有側面、紙娃娃 want≠dir),只比左右(目標在畫面上明顯偏一側、|x| > 0.15 才比,同 combatPose)
//   heroAnimBad / enemyAnimBad 走路/待機格與「有沒有在動」不一致(參考,不擋)
// 結束碼:heroWalkBad、enemyWalkBad 各 ≤ max(2, 0.5%),heroCombatBad、enemyCombatBad 各 ≤ max(3, 2%),而且頁面沒有錯誤 → 0;否則 1。
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';import {execSync} from 'node:child_process';
const pw=await import(pathToFileURL(path.join(execSync('npm root -g').toString().trim(),'playwright','index.js')).href);
const {chromium}=pw.default||pw;
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const {QUADRANT_OFFSET_DEG,FACING_HYSTERESIS_DEG}=await import(pathToFileURL(path.join(root,'src/dir4.js')).href);
const html=process.env.HTML||path.resolve(root,'../../outputs/暮影村.html');
const secs=+(process.argv[2]||60),view=process.argv[3]||'world',shots=process.argv[4];
// 2026-10-27 起大圖是 media/ 外部檔:file:// 開要允許同資料夾存取,不然畫布被污染(getImageData 失敗、角色與影子畫不出來)
const b=await chromium.launch({args:['--allow-file-access-from-files']});const p=await b.newPage({viewport:{width:1440,height:900}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(pathToFileURL(html).href+'?preview=1'+(process.env.RENDERER?'&renderer='+process.env.RENDERER:'')+(process.env.DOLL_QS?'&'+process.env.DOLL_QS:''),{waitUntil:'load',timeout:180000});
await p.waitForTimeout(1500);
// 開場畫面已經拿掉了(載入完成直接進村):有 #start-button 才按,沒有就等遊戲自己起來。
if(await p.$('#start-button'))await p.waitForFunction(()=>globalThis.__mistvaleGame&&document.body.dataset.fps!==undefined,null,{timeout:120000});
await p.waitForFunction(()=>globalThis.__mistvaleFacing&&globalThis.__mistvaleGame&&document.body.dataset.fps,null,{timeout:120000});
// 紙娃娃英雄是預設(docs/PAPERDOLL.md §13)。DOLL=off → 用 __mistvaleDoll hook 切回 sheet 英雄;DOLL=hero:paladin → 只換一職業;
// 沒設 DOLL = 預設(紙娃娃),等它的資料載好再量。
if(process.env.DOLL)await p.evaluate(s=>globalThis.__mistvaleDoll(s),process.env.DOLL);
if(await p.evaluate(()=>!!globalThis.__mistvaleDoll?.().on)){
 await p.waitForFunction(()=>{const s=globalThis.__mistvaleDoll();return s.ready||s.failed;},null,{timeout:60000});
 const ds=await p.evaluate(()=>globalThis.__mistvaleDoll());console.log('doll',JSON.stringify({on:ds.on,all:ds.all,ready:ds.ready,failed:ds.failed,base:ds.base}));if(!ds.ready){console.log('doll data failed to load');process.exit(2);}}
else console.log('doll off (hero sheets)');
console.log('rule',JSON.stringify({QUADRANT_OFFSET_DEG,FACING_HYSTERESIS_DEG}));
await p.evaluate(([v,OFF,HY])=>{
 const V=__mistvaleView;if(v.startsWith('look:')){const [x,z,s]=v.slice(5).split(',').map(Number);V.lookAt(x,z,s);}else V.focus(v);
 const prev=new Map(),lastMoved=new Map(),R=globalThis.__fc={n:0,heroWalk:0,heroWalkBad:0,heroWalkStrict:0,heroWalkFallback:0,heroAnimBad:0,heroCombat:0,heroCombatBad:0,heroCombatStrict:0,heroCombatFallback:0,
  enemyWalk:0,enemyWalkBad:0,enemyWalkStrict:0,enemyWalkFallback:0,enemyCombat:0,enemyCombatBad:0,enemyCombatStrict:0,enemyCombatFallback:0,enemyAnimBad:0,dollHero:0,
  walkDirs:{},examples:[],poses:{}};
 // ── 象限數學(同 src/dir4.js,頁面裡沒有 import 就照抄)──
 const NAMES=['right','down','left','up'],wrap=a=>((a%360)+360)%360,diff=(a,c)=>Math.abs(wrap(a-c+180)-180),center=n=>wrap(OFF+90*NAMES.indexOf(n));
 const ang=(dx,dz)=>{const sx=(dx-dz)*9,sy=(dx+dz)*4.5;return Math.hypot(sx,sy)>1e-9?wrap(Math.atan2(sy,sx)*180/Math.PI):null;};
 const quad=a=>NAMES[((Math.round((a-OFF)/90)%4)+4)%4];
 const ok=(a,n)=>NAMES.includes(n)&&diff(a,center(n))<=45+HY+1e-6;
 const side=n=>n==='right'||n==='left';
 const DOLL4=['up','right','down','left'];
 const heroDrawn=d=>{if(d.doll)return DOLL4[d.doll.dir]??null;const a=d.act||'';if(/Up$/.test(a))return 'up';if(/Down$/.test(a))return 'down';if(/Left$/.test(a))return 'left';return d.f<0?'left':'right';};
 const monDrawn=d=>{const a=d.act||'';if(/Up$/.test(a))return 'up';if(/Down$/.test(a))return 'down';if(/Left$/.test(a))return 'left';return d.f<0?'left':'right';};
 const exN={},bad=(k,o)=>{R[k]++;exN[k]=(exN[k]||0)+1;if(exN[k]<=8)R.examples.push({k,...o});};   // 每一類最多 8 個例子
 // 走路的「螢幕上的移動方向」= 這一幀的位移,或最近 WIN 秒(遊戲時間)的位移 —— 兩個任一個落在畫出來的方向(含遲滯帶)就算對。
 // 魔物 AI 在追擊/閒晃/交戰邊界上會一個 tick 換一次目的地(鋸齒路徑),畫面端用 0.1 秒速度平滑決定方向(眼睛看到的平均走向),
 // 所以只拿單幀位移比會把「平均走向正確、單幀鋸齒」算成錯。WIN 也是轉彎時允許的最大落後。
 const WIN=.15,track=new Map();
 const winVec=(id,x,z,t)=>{let H=track.get(id);if(!H)track.set(id,H=[]);H.push({t,x,z});while(H.length>2&&H[1].t<=t-WIN)H.shift();const o=H[0];return o.t<t?{dx:x-o.x,dz:z-o.z}:null;};
 // 比一次:a = 期望向量的畫面角度;drawn = 畫出來的方向;fallback = 素材沒有上/下列(只比左右)
 // a2 = 第二個可接受的角度(走路:WIN 秒窗口的位移);沒有就只看 a
 const judge=(pre,a,drawn,fallback,o,a2=null)=>{R[pre]++;const q=quad(a);if(drawn!==q)R[pre+'Strict']++;
  if(fallback&&!side(q)&&side(drawn)){R[pre+'Fallback']++;const sx=Math.cos(a*Math.PI/180);if(Math.abs(sx)>.15&&(sx>0)!==(drawn==='right'))bad(pre+'Bad',{...o,a:+a.toFixed(1),drawn,want:q,fb:1});return;}
  if(!ok(a,drawn)){if(a2!=null&&ok(a2,drawn)){R[pre+'Window']=(R[pre+'Window']||0)+1;return;}bad(pre+'Bad',{...o,a:+a.toFixed(1),aw:a2==null?null:+a2.toFixed(1),drawn,want:q});}};
 const orig=V.update.bind(V);V.update=(dt,state)=>{const r=orig(dt,state),F=__mistvaleFacing(),t=state.time;
  for(const h of [...state.hunters,...(state.wanderers||[])]){const d=F[h.id];if(!d||d.t!==t||h.hp<=0)continue;if(d.doll)R.dollHero++;const o=prev.get(h.id);prev.set(h.id,{x:h.x,z:h.z});if(!o)continue;
   const moved=Math.hypot(h.x-o.x,h.z-o.z),drawn=heroDrawn(d);const wv=winVec(h.id,h.x,h.z,t),aw=wv?ang(wv.dx,wv.dz):null;
   if(moved>.001)lastMoved.set(h.id,t);
   const fb=d.doll?d.doll.want!==d.doll.dir:false;
   if(d.pose.startsWith('walk')){if(moved<.001){if(t-(lastMoved.get(h.id)??-9)>.25)bad('heroAnimBad',{id:h.id,why:'walk pose but standing',st:h.status});}
    else{const a=ang(h.x-o.x,h.z-o.z);if(a!=null&&moved>.003){R.walkDirs[drawn]=(R.walkDirs[drawn]||0)+1;judge('heroWalk',a,drawn,fb,{id:h.id,st:h.status},aw);}}}
   else if(['idle','idle2','blink','rest','eat','drink','sleep','bandaged','trade','train','victory','dead','falling','getup'].includes(d.pose)){if(moved>.02&&h.status!=='戰鬥中')bad('heroAnimBad',{id:h.id,why:'idle pose while walking',moved:+moved.toFixed(3),st:h.status});}
   else{const tgt=(d.pose==='hurt'||d.pose==='hurt2')?{x:h.hitFromX,z:h.hitFromZ}:(d.pose==='strike'||d.pose==='strike2'||d.pose==='skill')?{x:h.atkX,z:h.atkZ}:state.enemies.find(e=>e.id===h.targetId);
    if(tgt&&tgt.x!=null&&Math.hypot(tgt.x-h.x,tgt.z-h.z)>.4){const a=ang(tgt.x-h.x,tgt.z-h.z);
     // 受擊/技能在 sheet 上只有側面列 → fallback;紙娃娃看 want≠dir
     const sheetSideOnly=!d.doll&&/^(hurt|skill)/.test(d.act||'');
     if(a!=null)judge('heroCombat',a,drawn,fb||sheetSideOnly,{id:h.id,pose:d.pose,act:d.doll?d.doll.act:d.act});}}}
  for(const e of state.enemies){const d=F['enemy:'+e.id];if(!d||d.t!==t)continue;const o=prev.get(e.id);prev.set(e.id,{x:e.x,z:e.z});if(!o)continue;
   const moved=Math.hypot(e.x-o.x,e.z-o.z),drawn=monDrawn(d);const wv=winVec('enemy:'+e.id,e.x,e.z,t),aw=wv?ang(wv.dx,wv.dz):null;
   // 想要上/下列但素材沒有(列名沒有 Up/Down 後綴)= fallback
   const wantUD=d.vd==='up'||d.vd==='down',fbWalk=wantUD&&!/(Up|Down)$/.test(d.act||'');
   if(!e.engaged&&([3,6,10,11].includes(d.frame)||(e.type==='slime'&&d.frame===0&&moved>.003))){const a=ang(e.x-o.x,e.z-o.z);if(a!=null&&moved>.003)judge('enemyWalk',a,drawn,fbWalk,{id:e.id,type:e.type,act:d.act},aw);}
   else if(!e.engaged&&(d.frame===0||d.frame===5)&&e.type!=='slime'&&moved>.01)bad('enemyAnimBad',{id:e.id,type:e.type,why:'idle frame while moving',moved:+moved.toFixed(3)});
   else if([1,2,4,7,8].includes(d.frame)){const tgt=(d.frame===4||d.frame===8)?{x:e.hitFromX,z:e.hitFromZ}:(d.frame===2||d.frame===7)?{x:e.atkX,z:e.atkZ}:{x:e.facingX,z:e.facingZ};
    if(tgt.x!=null&&Math.hypot(tgt.x-e.x,tgt.z-e.z)>.4){const a=ang(tgt.x-e.x,tgt.z-e.z);const hurt=d.frame===4||d.frame===8;
     const fbC=hurt||((d.dir==='up'||d.dir==='down')&&!/(Up|Down)$/.test(d.act||''));
     if(a!=null)judge('enemyCombat',a,drawn,fbC,{id:e.id,type:e.type,frame:d.frame,act:d.act});}}}
  for(const v of Object.values(F)){const k=v.pose??('m'+v.frame);R.poses[k]=(R.poses[k]||0)+1;}R.n++;return r;};
},[view,QUADRANT_OFFSET_DEG,FACING_HYSTERESIS_DEG]);
if(shots){for(let i=0;i<6;i++){await p.waitForTimeout(secs*1000/6);await p.screenshot({path:`${shots}-${i}.png`});}}
else await p.waitForTimeout(secs*1000);
const r=await p.evaluate(()=>globalThis.__fc);console.log(JSON.stringify({...r,examples:r.examples.slice(0,64),poses:r.poses},null,0));console.log('errors',errs);
await b.close();
const lim=(n,pct,min)=>Math.max(min,n*pct);
const fails=[];
if(r.heroWalkBad>lim(r.heroWalk,.005,2))fails.push(`heroWalkBad ${r.heroWalkBad}/${r.heroWalk}`);
if(r.enemyWalkBad>lim(r.enemyWalk,.005,2))fails.push(`enemyWalkBad ${r.enemyWalkBad}/${r.enemyWalk}`);
if(r.heroCombatBad>lim(r.heroCombat,.02,3))fails.push(`heroCombatBad ${r.heroCombatBad}/${r.heroCombat}`);
if(r.enemyCombatBad>lim(r.enemyCombat,.02,3))fails.push(`enemyCombatBad ${r.enemyCombatBad}/${r.enemyCombat}`);
if(errs.length)fails.push(`page errors ${errs.length}`);
if(!r.heroWalk||!r.enemyWalk)fails.push('no walk samples (camera/view?)');
console.log(fails.length?'FAIL '+fails.join('; '):`OK heroWalk ${r.heroWalkBad}/${r.heroWalk} bad (${r.heroWalkStrict} strict), enemyWalk ${r.enemyWalkBad}/${r.enemyWalk} bad (${r.enemyWalkStrict} strict), heroCombat ${r.heroCombatBad}/${r.heroCombat}, enemyCombat ${r.enemyCombatBad}/${r.enemyCombat}`);
process.exit(fails.length?1:0);
