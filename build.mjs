import {build} from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
const root=path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const out=path.basename(path.dirname(root))==='work'?path.resolve(root,'../../outputs'):path.join(root,'dist');
await fs.mkdir(out,{recursive:true});
// 2026-10-27:大張圖不再全部塞進 HTML(base64 讓首頁 27 MB)。小於 INLINE_LIMIT 的圖仍內嵌(省一個請求),
// 其餘寫成 media/<類別>/<檔名>,執行時用相對路徑載入(Pages 子路徑、本機 http、offline SW 都快取得到)。
const INLINE_LIMIT=16*1024;
const mediaDir=path.join(out,'media');
await fs.rm(mediaDir,{recursive:true,force:true});
await fs.mkdir(mediaDir,{recursive:true});
// T118：像素字型（Ark Pixel 12px，OFL 1.1）複製到 media/fonts/，CSS 以相對路徑 media/fonts/… 載入
const fontDir=path.join(mediaDir,'fonts');
await fs.mkdir(fontDir,{recursive:true});
for(const f of ['ark-pixel-12-zh_tw.woff2','ark-pixel-12-mono-zh_tw.woff2']){
  try{await fs.copyFile(path.join(root,'assets/fonts',f),path.join(fontDir,f));}catch(e){console.warn('[fonts] 缺少字型檔',f,e.message);}
}
let inlined=0,external=0,externalBytes=0;
// 出貨優先用無損 WebP（同資料夾同名 .webp，pipeline/scripts/build/to_webp.py 產生）
async function media(absPath,name){
  const webp=absPath.replace(/\.png$/i,'.webp');
  let file=absPath,finalName=name;
  try{await fs.access(webp);file=webp;finalName=name.replace(/\.png$/i,'.webp');}catch{}
  const buf=await fs.readFile(file);
  if(buf.length<=INLINE_LIMIT){inlined++;return `data:image/${file.endsWith('.webp')?'webp':'png'};base64,`+buf.toString('base64');}
  const dest=path.join(mediaDir,finalName);
  await fs.mkdir(path.dirname(dest),{recursive:true});
  await fs.writeFile(dest,buf);
  external++;externalBytes+=buf.length;
  return 'media/'+finalName.split(path.sep).join('/');
}
const ui=await build({entryPoints:[path.join(root,'src/pixel-ui.js')],bundle:true,minify:true,write:false,format:'iife',target:'es2020',legalComments:'eof'});
let html=await fs.readFile(path.join(root,'src/pixel-index.html'),'utf8');
let css=await fs.readFile(path.join(root,'src/pixel-style.css'),'utf8');
 try { css += '\n' + await fs.readFile(path.join(root,'src/ui-kit.css'),'utf8'); } catch {}
 try { css += '\n' + await fs.readFile(path.join(root,'src/ui-kit-extra.css'),'utf8'); } catch {}
 try { css += '\n' + await fs.readFile(path.join(root,'src/ui-tone.css'),'utf8'); } catch {}
try { css += '\n' + await fs.readFile(path.join(root,'src/ui-motion.css'),'utf8'); } catch {}
 try { css += '\n' + await fs.readFile(path.join(root,'src/ui-grain.css'),'utf8'); } catch {}
 // 2026-11-11 獵魔村風格(docs/research/UI-REF-HUNTER-VILLAGE-2026-11-11.md):最後載入,蓋過前面所有主題層
 try { css += '\n' + await fs.readFile(path.join(root,'src/ui-hv.css'),'utf8'); } catch {}
css=css.replace("@import url('');",'');
let assetScript='';
const put=(key,value)=>assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.${key}=${value};`;
for(const name of ['title','plaza','road','woodui']){try{put(name,JSON.stringify(await media(path.join(root,`assets/${name}.png`),`ui/${name}.png`)));}catch{}}
// 建築與廣場雕像:Xilurus 風格(pipeline/scripts/xilurus/assemble.py buildings → assets/xilurus/<id>.png,已去背)。
// 2026-11-15 HeroLoom 風格重製(docs/HEROLOOM-BUILDINGS.md):assets/heroloom-buildings/<id>.png 存在就用它
// (prefer-if-present,原圖留著可 A/B);仍然是單張 alpha PNG + PIXEL_ASSETS.alphaAssets.<id>=true,
// 引擎只依 aspect 縮放,不需要改 pixel-world。
const existsFile=async(p)=>{try{return (await fs.stat(p)).isFile();}catch{return false;}};
for(const name of ['hall','inn','trading','restaurant','tavern','forge','clinic','academy','training','sanctuary','house','bounty','enhancement','dungeon','monument']){
  const loom=path.join(root,`assets/heroloom-buildings/${name}.png`),xl=path.join(root,`assets/xilurus/${name}.png`);
  const src=(await existsFile(loom))?loom:xl;
  put(name,JSON.stringify(await media(src,`xilurus/${name}.png`)));
  assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.alphaAssets=window.PIXEL_ASSETS.alphaAssets||{};window.PIXEL_ASSETS.alphaAssets.${name}=true;`;
}
// 舊建築圖集(buildings@*)不再嵌入:全部建築改用 Xilurus 單張圖(上面)。
// 地圖細節圖集:同一個 manifest 契約,只是 key 是裝飾型別。
for(const [tag,file] of [['detailsAtlas','details@1x.png'],['detailsAtlas2x','details@2x.png']]){
  try{put(tag,JSON.stringify(await media(path.join(root,`assets/${file}`),`details/${file}`)));}catch(e){console.warn('missing detail atlas',file);}
}
for(const [tag,file] of [['detailsManifest','details@1x.manifest.json'],['detailsManifest2x','details@2x.manifest.json']]){
  try{assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.${tag}=${await fs.readFile(path.join(root,`assets/${file}`),'utf8')};`;}catch(e){console.warn('missing detail manifest',file);}
}
// l0veyou（GPT Image 2）生的道具／花草／村民圖集:跟 details 同一個 manifest 契約。
for(const prefix of ['props','cold','woods','flora','villagers','icons','vfx','yard','town','town2']){
  for(const [suffix,lod] of [['Atlas','1x'],['Atlas2x','2x']]){
    try{put(prefix+suffix,JSON.stringify(await media(path.join(root,`assets/${prefix}@${lod}.png`),`atlas/${prefix}@${lod}.png`)));}catch(e){console.warn('missing atlas',prefix,lod);}
  }
  for(const [suffix,lod] of [['Manifest','1x'],['Manifest2x','2x']]){
    try{assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.${prefix}${suffix}=${await fs.readFile(path.join(root,`assets/${prefix}@${lod}.manifest.json`),'utf8')};`;}catch(e){console.warn('missing manifest',prefix,lod);}
  }
}
// 概念圖像素合成的地面材質(pipeline/scripts/align/concept_textures.py),村莊高解析地面層用。
// 2026-11-15 HeroLoom 風格重製(docs/HEROLOOM-BUILDINGS.md):assets/heroloom-buildings/terrain/ 存在就用它
// (prefer-if-present;key 不變,引擎不需要改)。材質必須是 256×256 無縫 tile。
// 檔名兩種都吃:concept-grass.png(對齊原素材命名)或 grass.png(模組 / checker 文件用的短名)。
for(const [tag,file,short] of [['conceptStone','concept-stone.png','stone.png'],['conceptEarth','concept-earth.png','earth.png'],['conceptGrass','concept-grass.png','grass.png']]){
  const dir=path.join(root,'assets/heroloom-buildings/terrain');
  const loom=(await existsFile(path.join(dir,file)))?path.join(dir,file):(await existsFile(path.join(dir,short)))?path.join(dir,short):null;
  try{const src=loom||path.join(root,`assets/${file}`);put(tag,JSON.stringify(await media(src,`concept/${file}`)));}catch(e){console.warn('missing concept texture',file);}
}
// 道路 tile(l0veyou/Xilurus 的舊檔是 assets/road.png;HeroLoom 版放 assets/heroloom-buildings/terrain/road.png)
{const loom=path.join(root,'assets/heroloom-buildings/terrain/road.png');
 if(await existsFile(loom)){try{put('road',JSON.stringify(await media(loom,'ui/road.png')));}catch(e){console.warn('loom road',e.message);}}}
// 無縫地面材質圖集
try{put('terrainAtlas',JSON.stringify(await media(path.join(root,'assets/terrain-atlas.png'),'terrain/terrain-atlas.png')));}catch(e){console.warn('missing terrain atlas');}
try{assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.terrainManifest=${await fs.readFile(path.join(root,'assets/terrain-atlas.manifest.json'),'utf8')};`;}catch{}
// 舊版角色/魔物圖集(hero@、heropose@、monsters@)已移除:英雄走 assets/heroes,魔物走 assets/monsters3。
// 新規格英雄 sprite sheet(sprites/SPRITE_VISUAL_BIBLE.md §9;pipeline/scripts/heroes/build_hero.py 產生)
{const dir=path.join(root,'assets/heroes');let files=[];try{files=await fs.readdir(dir);}catch{}
 const sheets={};for(const f of files.filter(f=>f.endsWith('.json')&&!f.endsWith('-fx.json')&&!f.includes('@'))){const id=f.slice(0,-5);
  sheets[id]={img:await media(path.join(dir,id+'.png'),`heroes/${id}.png`),meta:JSON.parse(await fs.readFile(path.join(dir,f),'utf8'))};
  try{sheets[id].fx=await media(path.join(dir,id+'-fx.png'),`heroes/${id}-fx.png`);sheets[id].fxMeta=JSON.parse(await fs.readFile(path.join(dir,id+'-fx.json'),'utf8'));}catch{}
  // 高解析 LOD：<id>@2x.png/.json（原生 1:1）。執行時依縮放自動挑，低縮放用 1x（銳利）、放大用 2x（細節）。
  try{sheets[id].hi={img:await media(path.join(dir,id+'@2x.png'),`heroes/${id}@2x.png`),meta:JSON.parse(await fs.readFile(path.join(dir,id+'@2x.json'),'utf8'))};}catch{}}
 put('heroSheets',JSON.stringify(sheets));
 // pixelfx sprite sheets: every assets/vfx-sheets/<id>.png + <id>.json (Aseprite JSON with
 // frameSize / pivot / fps / columns) becomes PIXEL_ASSETS.vfxSheets[id] = { img, meta }.
 // pixel-world.js drawVfxSheet() plays any of them frame by frame; cinder-cyclone, fireball, hit-spark.
 try{
  const dir=path.join(root,'assets/vfx-sheets'), shelf={};
  for(const f of (await fs.readdir(dir)).filter(f=>f.endsWith('.json'))){
    const id=f.slice(0,-5);
    try{ shelf[id]={img:await media(path.join(dir,id+'.png'),`vfx-sheets/${id}.png`),meta:JSON.parse(await fs.readFile(path.join(dir,f),'utf8'))}; }
    catch(e){ console.warn('missing vfx sheet png',id); }
  }
  assetScript+=`window.PIXEL_ASSETS.vfxSheets=${JSON.stringify(shelf)};`;
 }catch(e){console.warn('no vfx-sheets folder');}
 // 2026-10-31:英雄不再戴配件 → 配件圖集(5 KB)不再打包,檔案留在 assets/heroes/ 當歷史
 // try{put('heroAccessories',...)}
 // 新規格魔物(assets/monsters3/<魔物>.png/.json)——執行時用到哪一種才載(見 pixel-world.js ensureMonsterSheet)
 {const md=path.join(root,'assets/monsters3');let mf=[];try{mf=await fs.readdir(md);}catch{}const ms={};
  for(const f of mf.filter(f=>f.endsWith('.json'))){const id=f.slice(0,-5);
    ms[id]={img:await media(path.join(md,id+'.png'),`monsters3/${id}.png`),meta:JSON.parse(await fs.readFile(path.join(md,f),'utf8'))};}
  assetScript+=`window.PIXEL_ASSETS.monsterSheets=${JSON.stringify(ms)};`;}}

// 2026-10-28:PixelLab 生的 UI 零件（assets/ui/,每個 0.3–0.8 KB → 直接內嵌成 data URI）
{const ud=path.join(root,'assets/ui');let uf=[];try{uf=await fs.readdir(ud);}catch{}
 const ui={};for(const f of uf.filter(f=>f.endsWith('.png'))){const id=f.slice(0,-4);
   ui[id]=await media(path.join(ud,f),`ui/${f}`);}
 assetScript+=`window.PIXEL_ASSETS.ui=${JSON.stringify(ui)};`;}
// 2026-11-13 紙娃娃引擎第 1 期(docs/PAPERDOLL.md):assets/paperdoll/ 原樣複製到 media/paperdoll/(不內嵌、不轉 webp),
// HTML 只多一個路徑字串;只有 ?doll=1 的實驗面板(src/paperdoll-lab.js)才會 fetch/載圖,平常遊戲完全不碰。
{const pd=path.join(root,'assets/paperdoll');let pf=[];try{pf=await fs.readdir(pd);}catch{}
 pf=pf.filter(f=>/\.(png|json)$/.test(f));
 if(pf.includes('paperdoll.json')){const dest=path.join(mediaDir,'paperdoll');await fs.mkdir(dest,{recursive:true});
  for(const f of pf){await fs.copyFile(path.join(pd,f),path.join(dest,f));external++;externalBytes+=(await fs.stat(path.join(pd,f))).size;}
  assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.paperdollBase="media/paperdoll/";`;}}
// 2026-11-13 六部位裝備真美術包(docs/PAPERDOLL-EQUIPMENT-6.md §5):assets/paperdoll-classes/ → media/paperdoll-classes/,
// 同樣原樣複製、不內嵌。兩包格式相同;有這包時紙娃娃英雄優先用它(src/paperdoll-hero.js 的 base 優先序),沒有就退回上面那包。
// 2026-11-13 使用者:遊戲不再讀這包(改用 assets/paperdoll-dv2)。只有設 DOLL_CLASSES_PACK=1 才照舊複製,給該包自己的工具用;遊戲端 base 永遠不選它。
{const pdc=path.join(root,'assets/paperdoll-classes');let pcf=[];if(process.env.DOLL_CLASSES_PACK==='1')try{pcf=await fs.readdir(pdc);}catch{}
 pcf=pcf.filter(f=>/\.(png|json)$/.test(f));
 if(pcf.includes('paperdoll.json')){const dest=path.join(mediaDir,'paperdoll-classes');await fs.mkdir(dest,{recursive:true});
  for(const f of pcf){await fs.copyFile(path.join(pdc,f),path.join(dest,f));external++;externalBytes+=(await fs.stat(path.join(pdc,f))).size;}
  assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.paperdollClassesBase="media/paperdoll-classes/";`;}}
// 2026-11-13 DV2 格式原創英雄美術包(sprites/DV2_FORMAT_SPEC.md;pipeline/scripts/dv2fmt/build_pack.py 產生):assets/paperdoll-dv2/*.{png,json} → media/paperdoll-dv2/
// (src/ 子資料夾是原始分層圖,不出貨)。遊戲預設用這包(src/paperdoll-hero.js 的 base 優先序)。
{const pdd=path.join(root,'assets/paperdoll-dv2');let pdf=[];try{pdf=(await fs.readdir(pdd,{withFileTypes:true})).filter(e=>e.isFile()).map(e=>e.name);}catch{}
 pdf=pdf.filter(f=>/\.(png|json)$/.test(f));
 if(pdf.includes('paperdoll.json')){const dest=path.join(mediaDir,'paperdoll-dv2');await fs.mkdir(dest,{recursive:true});
  for(const f of pdf){await fs.copyFile(path.join(pdd,f),path.join(dest,f));external++;externalBytes+=(await fs.stat(path.join(pdd,f))).size;}
  assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.paperdollDv2Base="media/paperdoll-dv2/";`;}}
// 2026-11-14 騎乘(docs/PAPERDOLL.md §20):坐騎表 assets/mounts.json(pipeline/scripts/dv2fmt/gen_mounts.py 產生,約 3 KB)直接內嵌,
// 紙娃娃與 ?doll=off 兩條繪製路徑、實驗面板都同步讀得到。
{try{assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.mounts=${JSON.stringify(JSON.parse(await fs.readFile(path.join(root,'assets/mounts.json'),'utf8')))};`;}catch{}}
// 2026-11-14 單層怪物紙娃娃(DV2 C2,docs/PAPERDOLL.md §21;pipeline/scripts/dv2fmt/build_monster_pack.py 產生):assets/monsterdoll/ → media/monsterdoll/,
// 原樣複製、不內嵌。只有 ?mdoll=1 才會載(預設魔物仍畫 assets/monsters3)。
{const mdd=path.join(root,'assets/monsterdoll');let mdf=[];try{mdf=(await fs.readdir(mdd)).filter(f=>/\.(png|json)$/.test(f));}catch{}
 if(mdf.includes('monsterdoll.json')){const dest=path.join(mediaDir,'monsterdoll');await fs.mkdir(dest,{recursive:true});
  for(const f of mdf){await fs.copyFile(path.join(mdd,f),path.join(dest,f));external++;externalBytes+=(await fs.stat(path.join(mdd,f))).size;}
  assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.monsterDollBase="media/monsterdoll/";`;}}
// 2026-11-14 Heroloom 紙娃娃引擎(docs/HEROLOOM.md):assets/heroloom/(74 檔:character.json + parts/ 46 張 512×448 分層圖
// + icons/ 23 張 32×32 + runtime/js/paperdoll.js + 授權檔)→ media/heroloom/,原樣複製不內嵌、不轉 webp:
// 分層圖必須保留原始像素色,執行期才能做「6 色精確 RGB 對調」的調色盤換色(src/heroloom.js)。
// 例外:maker.html 是廠商的角色製造器,授權只准授權持有人自用、不得散布或當工具提供他人,所以不出貨;
// 遊戲只需要 character.json + parts/ + icons/。沒有這包時路徑字串不出現,呼叫端自行 fallback。
{const hd=path.join(root,'assets/heroloom');const hwalk=async(d,pre='')=>{let o=[],es=[];try{es=await fs.readdir(d,{withFileTypes:true});}catch{return o;}
  for(const e of es){const rel=pre?pre+'/'+e.name:e.name;if(e.isDirectory())o=o.concat(await hwalk(path.join(d,e.name),rel));else o.push(rel);}return o;};
 const hl=(await hwalk(hd)).filter(rel=>rel!=='maker.html');
 if(hl.includes('character.json')){const dest=path.join(mediaDir,'heroloom');
  for(const rel of hl){const src=path.join(hd,rel),dst=path.join(dest,rel);
   await fs.mkdir(path.dirname(dst),{recursive:true});
   await fs.copyFile(src,dst);external++;externalBytes+=(await fs.stat(src)).size;}
  assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.heroloomBase="media/heroloom/";`;}}
// 2026-11-15 延伸包(docs/HEROLOOM-OUTFITS.md / HEROLOOM-MONSTERS.md):
// assets/heroloom-outfits/(弓手換裝 sheet)→ media/heroloom-outfits/,PIXEL_ASSETS.heroloomOutfitsBase;
// assets/heroloom-monsters/<id>/(sheet.png + meta.json)→ media/heroloom-monsters/,meta 內嵌成
// PIXEL_ASSETS.loomMonsters[id](?lmob=1 時 MON_SHEET 改畫這包;缺檔就不出 key,遊戲照舊畫 monsters3)。
// 建築/地形是直接換掉 assets/xilurus 與 assets/concept-*.png 的圖(l0veyou/Muse 生的 HeroLoom 風格版本),
// 走原本 Xilurus 那條載入路徑,不需要新的 build 邏輯。
{const cpTree=async(dir,mediaSub)=>{const files=[];const walk=async(d,pre='')=>{let es=[];try{es=await fs.readdir(d,{withFileTypes:true});}catch{return;}
    for(const e of es){const rel=pre?pre+'/'+e.name:e.name;if(e.isDirectory())await walk(path.join(d,e.name),rel);else files.push(rel);}};
  await walk(dir);if(!files.length)return 0;const dest=path.join(mediaDir,mediaSub);
  for(const rel of files){const src=path.join(dir,rel),dst=path.join(dest,rel);await fs.mkdir(path.dirname(dst),{recursive:true});
    await fs.copyFile(src,dst);external++;externalBytes+=(await fs.stat(src)).size;}return files.length;};
 const outfitFiles=await cpTree(path.join(root,'assets/heroloom-outfits'),'heroloom-outfits');
 if(outfitFiles){assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.heroloomOutfitsBase="media/heroloom-outfits/";`;}
 const monFiles=await cpTree(path.join(root,'assets/heroloom-monsters'),'heroloom-monsters');
 if(monFiles){
   const monBase=path.join(root,'assets/heroloom-monsters');let metas={};
   try{const ids=(await fs.readdir(monBase,{withFileTypes:true})).filter(e=>e.isDirectory()).map(e=>e.name);
     for(const id of ids){try{metas[id]=JSON.parse(await fs.readFile(path.join(monBase,id,'meta.json'),'utf8'));}catch{}}}catch{}
   assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.heroloomMonstersBase="media/heroloom-monsters/";`
     +`window.PIXEL_ASSETS.loomMonsters=${JSON.stringify(metas)};`;
 }}
html=html.replace('/*__STYLE__*/',()=>css).replace('/*__ASSETS__*/',()=>assetScript).replace('/*__SCRIPT__*/',()=>ui.outputFiles[0].text.replaceAll('</script','<\\/script'));
for (const block of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(block[1]);
const file=path.join(out,'暮影村.html');await fs.writeFile(file,html,'utf8');
const externDir=await fs.readdir(mediaDir,{recursive:true});
console.log('Built '+file+' ('+(Buffer.byteLength(html)/1024/1024).toFixed(2)+' MB)'
  +` · media ${external} files / ${(externalBytes/1024/1024).toFixed(1)} MB · inline ${inlined} files · ${externDir.length} paths`);
