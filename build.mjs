import {build} from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
const root=path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const out=path.basename(path.dirname(root))==='work'?path.resolve(root,'../../outputs'):path.join(root,'dist');
await fs.mkdir(out,{recursive:true});
const ui=await build({entryPoints:[path.join(root,'src/pixel-ui.js')],bundle:true,minify:true,write:false,format:'iife',target:'es2020',legalComments:'eof'});
let html=await fs.readFile(path.join(root,'src/pixel-index.html'),'utf8');
let css=await fs.readFile(path.join(root,'src/pixel-style.css'),'utf8');
css=css.replace("@import url('');",'');
let assetScript='';
for(const name of ['title','hall','inn','monument','plaza','road','woodui']){try{const p=await fs.readFile(path.join(root,`assets/${name}.png`));assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.${name}='data:image/png;base64,${p.toString('base64')}';`;}catch{}}
for(const name of ['hall','inn','trading','restaurant','tavern','forge','clinic','academy','training','sanctuary','house','bounty','enhancement']){try{const candidates=name==='bounty'?['assets/concept-clean/noticeboard-web-v1.png',`assets/concept-clean/${name}-concept-v2.png`,`output/imagegen/${name}-concept-v2.png`]:[`assets/concept-clean/${name}-concept-v3.png`,`assets/concept-clean/${name}-concept-v2.png`,`output/imagegen/${name}-concept-v2.png`];let p;for(const file of candidates){try{p=await fs.readFile(path.join(root,file));break;}catch{}}if(!p)continue;assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.${name}='data:image/png;base64,${p.toString('base64')}';window.PIXEL_ASSETS.alphaAssets=window.PIXEL_ASSETS.alphaAssets||{};window.PIXEL_ASSETS.alphaAssets.${name}=true;`;}catch{}}

// 建築圖集:sprite-gen manifest 契約。兩段 LOD 的 rect 是對齊的,只是差 0.5 倍。
for(const [tag,file] of [['buildingsAtlas','buildings@1x.png'],['buildingsAtlas2x','buildings@2x.png']]){
  try{const p=await fs.readFile(path.join(root,`assets/${file}`));assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.${tag}='data:image/png;base64,${p.toString('base64')}';`;}catch(e){console.warn('missing atlas',file);}
}
for(const [tag,file] of [['buildingsManifest','buildings@1x.manifest.json'],['buildingsManifest2x','buildings@2x.manifest.json']]){
  try{const t=await fs.readFile(path.join(root,`assets/${file}`),'utf8');assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.${tag}=${t};`;}catch(e){console.warn('missing manifest',file);}
}
// 地圖細節圖集:同一個 manifest 契約,只是 key 是裝飾型別。
for(const [tag,file] of [['detailsAtlas','details@1x.png'],['detailsAtlas2x','details@2x.png']]){
  try{const p=await fs.readFile(path.join(root,`assets/${file}`));assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.${tag}='data:image/png;base64,${p.toString('base64')}';`;}catch(e){console.warn('missing detail atlas',file);}
}
for(const [tag,file] of [['detailsManifest','details@1x.manifest.json'],['detailsManifest2x','details@2x.manifest.json']]){
  try{const t=await fs.readFile(path.join(root,`assets/${file}`),'utf8');assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.${tag}=${t};`;}catch(e){console.warn('missing detail manifest',file);}
}
// l0veyou（GPT Image 2）生的道具／魔物／花草圖集:跟 details 同一個 manifest 契約。
for(const prefix of ['props','monsters','monsteratk','stream','cold','woods','flora','villagers','icons','vfx','yard','town','town2']){
  for(const [suffix,lod] of [['Atlas','1x'],['Atlas2x','2x']]){
    try{const p=await fs.readFile(path.join(root,`assets/${prefix}@${lod}.png`));assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.${prefix}${suffix}='data:image/png;base64,${p.toString('base64')}';`;}catch(e){console.warn('missing atlas',prefix,lod);}
  }
  for(const [suffix,lod] of [['Manifest','1x'],['Manifest2x','2x']]){
    try{const t=await fs.readFile(path.join(root,`assets/${prefix}@${lod}.manifest.json`),'utf8');assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.${prefix}${suffix}=${t};`;}catch(e){console.warn('missing manifest',prefix,lod);}
  }
}
// 概念圖像素合成的地面材質(pipeline/scripts/align/concept_textures.py),村莊高解析地面層用。
for(const [tag,file] of [['conceptStone','concept-stone.png'],['conceptEarth','concept-earth.png'],['conceptGrass','concept-grass.png']]){
  try{const p=await fs.readFile(path.join(root,`assets/${file}`));assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.${tag}='data:image/png;base64,${p.toString('base64')}';`;}catch(e){console.warn('missing concept texture',file);}
}
// 無縫地面材質圖集
for(const [tag,file,js] of [['terrainAtlas','terrain-atlas.png',false],['terrainManifest','terrain-atlas.manifest.json',true]]){
  try{const raw=await fs.readFile(path.join(root,`assets/${file}`));
    assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.${tag}=`
      +(js?raw.toString('utf8'):`'data:image/png;base64,${raw.toString('base64')}'`)+';';
  }catch(e){console.warn('missing terrain atlas',file);}
}
// 角色圖集(獵人六職業)
for(const [tag,file,js] of [['heroAtlas','hero@1x.png',false],['heroManifest','hero@1x.manifest.json',true],
                            ['heroAtlas2x','hero@2x.png',false],['heroManifest2x','hero@2x.manifest.json',true],
                            ['heroposeAtlas','heropose@1x.png',false],['heroposeManifest','heropose@1x.manifest.json',true],
                            ['heroposeAtlas2x','heropose@2x.png',false],['heroposeManifest2x','heropose@2x.manifest.json',true]]){
  try{const raw=await fs.readFile(path.join(root,`assets/${file}`));
    assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.${tag}=`
      +(js?raw.toString('utf8'):`'data:image/png;base64,${raw.toString('base64')}'`)+';';
  }catch(e){console.warn('missing hero atlas',file);}
}
html=html.replace('/*__STYLE__*/',()=>css).replace('/*__ASSETS__*/',()=>assetScript).replace('/*__SCRIPT__*/',()=>ui.outputFiles[0].text.replaceAll('</script','<\\/script'));
for (const block of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(block[1]);
const file=path.join(out,'暮影村.html');await fs.writeFile(file,html,'utf8');console.log('Built '+file+' ('+(Buffer.byteLength(html)/1024/1024).toFixed(2)+' MB)');
