// check_embedded_assets.mjs — 建置檔裡嵌的美術＝目前資產來源檔,而且遊戲要畫的每一個 id 都找得到。
// 用法:npm run build 後 node pipeline/scripts/check_embedded_assets.mjs
// 2026-10-08 改版:角色改新規格(assets/heroes/<id>.png+json → PIXEL_ASSETS.heroSheets、
// assets/monsters3/<id>.png+json → monsterSheets),舊 hero@/heropose@/monsters@ 圖集已移除。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const html=await fs.readFile(process.env.HTML||path.resolve(root,'../../outputs/暮影村.html'),'utf8');
const sandbox={window:{}};
const block=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(b=>b[1].includes('window.PIXEL_ASSETS.title='));
assert.ok(block,'asset injection script exists');
vm.runInNewContext(block[1],sandbox);
const A=sandbox.window.PIXEL_ASSETS;
// 幾 MB 的 Buffer 直接 deepEqual,不一致時 Node 會想生 diff → 記憶體爆掉(RangeError)。
// 一律比 SHA-256,出錯訊息也短。
const h=buf=>crypto.createHash('sha256').update(buf).digest('hex').slice(0,16);
const bytes=v=>{assert.equal(typeof v,'string','embedded value is a data URL string');return Buffer.from(v.split(',')[1],'base64');};
const same=async(v,file,label)=>{const a=h(bytes(v)),b=h(await fs.readFile(file));assert.equal(a,b,`${label}: embedded ${a} != file ${b}`);};
let n=0;
// 1. 建築與廣場雕像:assets/xilurus/<id>.png(去背)
for(const id of ['hall','inn','trading','restaurant','tavern','forge','clinic','academy','training','sanctuary','house','bounty','enhancement','dungeon','monument']){
  await same(A[id],path.join(root,`assets/xilurus/${id}.png`),`${id} embedded = assets/xilurus/${id}.png`);
  assert.equal(A.alphaAssets?.[id],true,`${id} is an alpha asset`);n++;
}
// 2. 單張圖:標題、廣場石板、土路、UI 木紋、村莊地面材質、生態域地面圖集
for(const [key,file] of [['title','title.png'],['plaza','plaza.png'],['road','road.png'],['woodui','woodui.png'],['conceptStone','concept-stone.png'],['conceptEarth','concept-earth.png'],['conceptGrass','concept-grass.png'],['terrainAtlas','terrain-atlas.png']]){
  await same(A[key],path.join(root,'assets',file),`${key} embedded = assets/${file}`);n++;
}
// 3. 場景圖集:每張都要是 Xilurus 管線產生的(manifest generator),內容＝檔案
const atlases=['details','props','cold','woods','flora','villagers','icons','vfx','yard','town','town2'];
const cells=new Set();
for(const key of atlases)for(const [suf,lod] of [['','1x'],['2x','2x']]){
  const man=A[`${key}Manifest${suf}`];assert.ok(man,`${key}Manifest${suf} embedded`);
  const m=typeof man==='string'?JSON.parse(man):JSON.parse(JSON.stringify(man));
  assert.match(m.generator||'',/Xilurus|l0veyou/,`${key}@${lod} comes from the art pipeline (generator: ${m.generator})`);
  await same(A[`${key}Atlas${suf}`],path.join(root,`assets/${key}@${lod}.png`),`${key}@${lod} embedded = file`);
  for(const id of Object.keys(m.cells))cells.add(id);n++;
}
// 3b. 新規格角色:heroSheets / monsterSheets 的圖與 json 都要等於 assets/ 裡的檔案
for(const [key,dir] of [['heroSheets','heroes'],['monsterSheets','monsters3']]){
  const sheets=A[key];assert.ok(sheets&&Object.keys(sheets).length,`${key} embedded`);
  for(const [id,entry] of Object.entries(sheets)){
    await same(entry.img,path.join(root,`assets/${dir}/${id}.png`),`${key}.${id} image = file`);
    const meta=JSON.parse(await fs.readFile(path.join(root,`assets/${dir}/${id}.json`),'utf8'));
    // vm 沙箱的物件是另一個 realm,deepStrictEqual 會比 prototype → 先複製回本 realm
    assert.deepEqual(JSON.parse(JSON.stringify(entry.meta)),meta,`${key}.${id} meta = json`);
    cells.add(`${key}:${id}`);n++;
  }
}
// 4. 舊美術不再嵌入
for(const key of ['heroAtlas','heroAtlas2x','heroAtlas4x','heroposeAtlas','heroposeAtlas2x','heroposeAtlas4x',
                  'monstersAtlas','monstersAtlas2x','monsteratkAtlas','streamAtlas','buildingsAtlas','buildingsAtlas2x',
                  'monsteratkAtlas2x','streamAtlas2x','villagersAtlas2x_'])assert.equal(A[key],undefined,`old art ${key} is not embedded`);
// 5. 遊戲會畫的每一個 id 都在圖集裡(pixel-world.js 的 PROP_ATLAS / TREE_ATLAS / FLOWER_ATLAS / 特效 / 魔物 / 英雄 / 圖示)
const REQUIRED=['pine','oak','birch','snowpine','boulders','outcrop','cave','ruin','signpost','well','lamppost','fenceRail',
 'sheep','goat','garden','bush','mushroom','cactus','villageBanner','arenaFlag','gate','stall','barrels',
 'snowDrift','frozenPond','iceRocks','cliffLedge','fallenLog','stump','mossRock','ferns',
 'flowerYellow','flowerPink','flowerBlue','flowerWhite','wheat','cabbage',
 'chest','crates','hayBale','firewood','trough','scarecrow','lantern','wheelbarrow',
 'archeryTarget','dummy','weaponRack','anvilStump','tableSet','bench','handCart','flowerBox',
 'purpleBanner','fruitStand','sacks','barrel','bucket','flowerBush',
 'fxSlash','fxOrb','fxHeal','fxStar','fxHit','fxSparkle','iconLeather','arrowFx','plot',
 'gold','gems','wood','ore','herb','drink','bed','heal','cloth','food','armor','swords','hammer','anvil','bag','skull','hunter','hall','scroll','map','up','boss','trade','horn','gear','arrow','star','heart','shield'];
const missing=REQUIRED.filter(id=>!cells.has(id));
assert.deepEqual(missing,[],'every id the renderer draws exists in the embedded atlases');
// 5b. 每個角色(英雄/魔物)都要有遊戲會播的動作列
const ACTS={hero:['idle','walk','attack','hurt','death'],monster:['idle','walk','attack','hurt','death']};
for(const [key,acts] of [['heroSheets',ACTS.hero],['monsterSheets',ACTS.monster]]){
  for(const [id,entry] of Object.entries(A[key]||{})){
    for(const a of acts)assert.ok(entry.meta.actions?.[a],`${key}.${id} has action ${a}`);
    assert.ok(Object.keys(entry.meta.actions).length>=acts.length,`${key}.${id} actions`);
  }
}
console.log(`PASS: ${n} embedded assets match their sources; ${REQUIRED.length} required ids present; hero/monster sheets = assets/heroes, assets/monsters3; old atlases not embedded.`);
