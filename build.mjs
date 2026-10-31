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
css=css.replace("@import url('');",'');
let assetScript='';
const put=(key,value)=>assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.${key}=${value};`;
for(const name of ['title','plaza','road','woodui']){try{put(name,JSON.stringify(await media(path.join(root,`assets/${name}.png`),`ui/${name}.png`)));}catch{}}
// 建築與廣場雕像:Xilurus 風格(pipeline/scripts/xilurus/assemble.py buildings → assets/xilurus/<id>.png,已去背)。
for(const name of ['hall','inn','trading','restaurant','tavern','forge','clinic','academy','training','sanctuary','house','bounty','enhancement','dungeon','monument']){
  put(name,JSON.stringify(await media(path.join(root,`assets/xilurus/${name}.png`),`xilurus/${name}.png`)));
  assetScript+=`window.PIXEL_ASSETS.alphaAssets=window.PIXEL_ASSETS.alphaAssets||{};window.PIXEL_ASSETS.alphaAssets.${name}=true;`;
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
for(const [tag,file] of [['conceptStone','concept-stone.png'],['conceptEarth','concept-earth.png'],['conceptGrass','concept-grass.png']]){
  try{put(tag,JSON.stringify(await media(path.join(root,`assets/${file}`),`concept/${file}`)));}catch(e){console.warn('missing concept texture',file);}
}
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
html=html.replace('/*__STYLE__*/',()=>css).replace('/*__ASSETS__*/',()=>assetScript).replace('/*__SCRIPT__*/',()=>ui.outputFiles[0].text.replaceAll('</script','<\\/script'));
for (const block of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(block[1]);
const file=path.join(out,'暮影村.html');await fs.writeFile(file,html,'utf8');
const externDir=await fs.readdir(mediaDir,{recursive:true});
console.log('Built '+file+' ('+(Buffer.byteLength(html)/1024/1024).toFixed(2)+' MB)'
  +` · media ${external} files / ${(externalBytes/1024/1024).toFixed(1)} MB · inline ${inlined} files · ${externDir.length} paths`);
