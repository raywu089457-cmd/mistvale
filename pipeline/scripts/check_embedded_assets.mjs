// check_embedded_assets.mjs — 建置檔裡嵌的美術＝目前 Xilurus 風格來源檔,而且遊戲要畫的每一個 id 都找得到。
// 用法:npm run build 後 node pipeline/scripts/check_embedded_assets.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const html=await fs.readFile(path.resolve(root,'../../outputs/暮影村.html'),'utf8');
const sandbox={window:{}};
const block=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(b=>b[1].includes('window.PIXEL_ASSETS.title='));
assert.ok(block,'asset injection script exists');
vm.runInNewContext(block[1],sandbox);
const A=sandbox.window.PIXEL_ASSETS;
const bytes=v=>Buffer.from(v.split(',')[1],'base64');
let n=0;
// 1. 建築與廣場雕像:assets/xilurus/<id>.png(去背)
for(const id of ['hall','inn','trading','restaurant','tavern','forge','clinic','academy','training','sanctuary','house','bounty','enhancement','dungeon','monument']){
 assert.deepEqual(bytes(A[id]),await fs.readFile(path.join(root,`assets/xilurus/${id}.png`)),`${id} embedded = assets/xilurus/${id}.png`);
 assert.equal(A.alphaAssets?.[id],true,`${id} is an alpha asset`);n++;
}
// 2. 單張圖:標題、廣場石板、土路、UI 木紋、村莊地面材質、生態域地面圖集
for(const [key,file] of [['title','title.png'],['plaza','plaza.png'],['road','road.png'],['woodui','woodui.png'],['conceptStone','concept-stone.png'],['conceptEarth','concept-earth.png'],['conceptGrass','concept-grass.png'],['terrainAtlas','terrain-atlas.png']]){
 assert.deepEqual(bytes(A[key]),await fs.readFile(path.join(root,'assets',file)),`${key} embedded = assets/${file}`);n++;
}
// 3. 圖集:每張都要是 Xilurus 管線產生的(manifest generator),內容＝檔案
const atlases=['details','props','monsters','cold','woods','flora','icons','vfx','yard','town','town2','hero','heropose'];
const cells=new Set();
for(const key of atlases)for(const [suf,lod] of [['','1x'],['2x','2x']]){
 const man=A[`${key}Manifest${suf}`];assert.ok(man,`${key}Manifest${suf} embedded`);
 const m=typeof man==='string'?JSON.parse(man):man;
 assert.match(m.generator||'',/Xilurus/,`${key}@${lod} comes from the Xilurus pipeline (generator: ${m.generator})`);
 assert.deepEqual(bytes(A[`${key}Atlas${suf}`]),await fs.readFile(path.join(root,`assets/${key}@${lod}.png`)),`${key}@${lod} embedded = file`);
 for(const id of Object.keys(m.cells))cells.add(id);n++;
}
// 4. 舊美術不再嵌入
for(const key of ['monsteratkAtlas','streamAtlas','villagersAtlas','buildingsAtlas','monsteratkAtlas2x','streamAtlas2x','villagersAtlas2x','buildingsAtlas2x'])assert.equal(A[key],undefined,`old art ${key} is not embedded`);
// 5. 遊戲會畫的每一個 id 都在圖集裡(pixel-world.js 的 PROP_ATLAS / TREE_ATLAS / FLOWER_ATLAS / 特效 / 魔物 / 英雄 / 圖示)
const REQUIRED=['pine','oak','birch','snowpine','boulders','outcrop','cave','ruin','signpost','well','lamppost','fenceRail',
 'sheep','goat','garden','bush','mushroom','cactus','villageBanner','arenaFlag','gate','stall','barrels',
 'snowDrift','frozenPond','iceRocks','cliffLedge','fallenLog','stump','mossRock','ferns',
 'flowerYellow','flowerPink','flowerBlue','flowerWhite','wheat','cabbage',
 'chest','crates','hayBale','firewood','trough','scarecrow','lantern','wheelbarrow',
 'archeryTarget','dummy','weaponRack','anvilStump','tableSet','bench','handCart','flowerBox',
 'purpleBanner','fruitStand','sacks','barrel','bucket','flowerBush',
 'fxSlash','fxOrb','fxHeal','fxStar','fxHit','fxSparkle','iconLeather','arrowFx','plot',
 ...['slime','wolf','golem','boss'].flatMap(t=>[0,1,2,3,4].map(i=>t+i)),
 ...['berserker','ranger','paladin','sorcerer','darkknight','priest'].flatMap(c=>[c,...['walk1','walk2','walk3','walk4','windup','strike','hurt','rest'].map(p=>`${c}_${p}`)]),
 'gold','gems','wood','ore','herb','drink','bed','heal','cloth','food','armor','swords','hammer','anvil','bag','skull','hunter','hall','scroll','map','up','boss','trade','horn','gear','arrow','star','heart','shield'];
const missing=REQUIRED.filter(id=>!cells.has(id));
assert.deepEqual(missing,[],'every id the renderer draws exists in the embedded atlases');
console.log(`PASS: ${n} embedded assets match their Xilurus sources; ${REQUIRED.length} required ids present; old atlases not embedded.`);
