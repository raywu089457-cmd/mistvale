// check_placement.mjs — 擺設規則:野外只留地形、村內只留建築與地面。村界上是木柵欄(fenceRail,四個出村口是缺口),
// 出村口只有缺口、沒有門(2026-10-20 移除小牌樓),廣場正中有一座雕像(monument);設定頁「叫角色進村」的村民 NPC 不算擺設。
// 上面以外還有任何一件擺設、柵欄不在村界上/擋住出村口、門或雕像不在該在的位置,就失敗。
// 用法:npm run build 後 node pipeline/scripts/check/check_placement.mjs
import path from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';import {execSync} from 'node:child_process';
const pw=await import(pathToFileURL(path.join(execSync('npm root -g').toString().trim(),'playwright','index.js')).href);const {chromium}=pw.default||pw;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const {FENCE,EXITS,EXIT_GAP,blockCenter}=await import(pathToFileURL(path.join(root,'src/village-grid.js')).href);
const html=process.env.HTML||path.resolve(root,'../../outputs/暮影村.html');
const b=await chromium.launch({channel:'chromium',args:['--disable-gpu']});const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto(pathToFileURL(html).href,{waitUntil:'load',timeout:180000});
await p.waitForFunction(()=>document.body.dataset.fps!==undefined&&globalThis.__mistvaleDecor&&globalThis.__mistvaleGame,null,{timeout:120000,polling:200});
await p.waitForTimeout(1500);
const dec=await p.evaluate(()=>__mistvaleDecor());await b.close().catch(()=>{});
const rails=dec.filter(d=>d.type==='fenceRail'),gates=dec.filter(d=>d.type==='gate'),statues=dec.filter(d=>d.type==='monument');

const props=dec.filter(d=>!['npc','fenceRail','gate','monument'].includes(d.type));
const counts={};for(const d of props)counts[d.type]=(counts[d.type]||0)+1;
console.log(`柵欄以外的擺設 ${props.length} 件${props.length?' '+JSON.stringify(counts):''};柵欄 ${rails.length} 段;門 ${gates.length} 座;雕像 ${statues.length} 座;村民 NPC ${dec.filter(d=>d.type==='npc').length} 位`);
for(const d of props.slice(0,30))console.log(`  ${d.type} @ ${d.x.toFixed(1)},${d.z.toFixed(1)}`);
// 柵欄:每一段都在村界(FENCE 一圈)上,而且不在出村口的缺口裡。
let bad=0;
const sideOf=d=>Math.abs(d.z-FENCE.minZ)<.05?'north':Math.abs(d.z-FENCE.maxZ)<.05?'south':Math.abs(d.x-FENCE.minX)<.05?'west':Math.abs(d.x-FENCE.maxX)<.05?'east':null;
for(const d of rails){if(!sideOf(d)){bad++;if(bad<6)console.log(`  柵欄不在村界上 @ ${d.x.toFixed(2)},${d.z.toFixed(2)}`);}}
for(const e of EXITS)for(const d of rails){if(sideOf(d)!==e.side)continue;const gap=e.side==='east'||e.side==='west'?Math.abs(d.z-e.z):Math.abs(d.x-e.x);if(gap<EXIT_GAP){bad++;console.log(`  柵欄擋在 ${e.id} 出村口 @ ${d.x.toFixed(2)},${d.z.toFixed(2)}`);}}
for(const side of ['north','south','west','east']){const n=rails.filter(d=>sideOf(d)===side).length;console.log(`  ${side}:${n} 段`);if(!n){bad++;console.log(`  ${side} 邊沒有柵欄`);}}
// 門:已移除(出村口只有柵欄缺口)。留著這一條是防止之後又長出牌樓。
if(gates.length){bad++;console.log(`  出村口不該有門/牌樓,卻有 ${gates.length} 座`);}
// 雕像:廣場(0,0)正中一座
const plaza=blockCenter(0,0);
if(statues.length!==1||Math.hypot(statues[0].x-plaza.x,statues[0].z-plaza.z)>.05){bad++;console.log(`  中央雕像 ${statues.length} 座,位置 ${statues.map(d=>d.x.toFixed(1)+','+d.z.toFixed(1)).join(' / ')||'無'}(應該在廣場正中 ${plaza.x.toFixed(1)},${plaza.z.toFixed(1)})`);}
process.exit(props.length||bad?1:0);
