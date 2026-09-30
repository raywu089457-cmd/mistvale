"""把 manifest 驅動的建築圖集整合進 mistvale 的 pixel-world.js / build.mjs。

用唯一錨點定位再替換,並在每個步驟 assert,避免靜默改錯地方。
"""
import json
import shutil
import sys
from pathlib import Path

PROJ = Path(r"C:\Users\ray\sprite-demo\mistvale-work\proj")
POC = Path(r"C:\Users\ray\sprite-demo\buildings-poc")
LOD = POC / "lod"                       # buildings@1x / @2x + manifest
PW = PROJ / "src" / "pixel-world.js"
BM = PROJ / "build.mjs"
ASSETS = PROJ / "assets"


def must(cond, msg):
    if not cond:
        raise SystemExit(f"整合失敗:{msg}")


# ── 0. 備份 ────────────────────────────────────────────────────────────────
for p in (PW, BM):
    bak = p.with_suffix(p.suffix + ".pre-atlas.bak")
    if not bak.exists():
        shutil.copy2(p, bak)
        print(f"備份 {bak.name}")

# ── 1. 複製圖集與 manifest 進 assets/ ──────────────────────────────────────
for name in ("buildings@1x.png", "buildings@1x.manifest.json",
             "buildings@2x.png", "buildings@2x.manifest.json"):
    shutil.copy2(LOD / name, ASSETS / name)
print("已複製 4 個圖集檔到 assets/")

# ── 2. build.mjs:把 buildings14 換成 manifest 圖集 ─────────────────────────
bm = BM.read_text(encoding="utf-8")
old_list = "['title','hall','inn','forge','clinic','tavern','buildings14','monument']"
must(old_list in bm, "build.mjs 找不到 asset 清單")
bm = bm.replace(old_list, "['title','hall','inn','monument']")

anchor = "html=html.replace('/*__STYLE__*/'"
must(anchor in bm, "build.mjs 找不到 STYLE 注入錨點")
inject = """// 建築圖集:sprite-gen manifest 契約。兩段 LOD 的 rect 是對齊的,只是差 0.5 倍。
for(const [tag,file] of [['buildingsAtlas','buildings@1x.png'],['buildingsAtlas2x','buildings@2x.png']]){
  try{const p=await fs.readFile(path.join(root,`assets/${file}`));assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.${tag}='data:image/png;base64,${p.toString('base64')}';`;}catch(e){console.warn('missing atlas',file);}
}
for(const [tag,file] of [['buildingsManifest','buildings@1x.manifest.json'],['buildingsManifest2x','buildings@2x.manifest.json']]){
  try{const t=await fs.readFile(path.join(root,`assets/${file}`),'utf8');assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.${tag}=${t};`;}catch(e){console.warn('missing manifest',file);}
}
"""
bm = bm.replace(anchor, inject + anchor)
BM.write_text(bm, encoding="utf-8")
print("build.mjs 已改")

# ── 3. pixel-world.js ─────────────────────────────────────────────────────
s = PW.read_text(encoding="utf-8")

# 3a. 圖集狀態 + 繪製函式:插在 ensureAtlas 之前
anchor_a = "const loadedAssetKeys=new Set();\nfunction ensureAtlas() {"
must(anchor_a in s, "找不到 ensureAtlas 起點")
new_block = '''const loadedAssetKeys=new Set();

// ── manifest 驅動的建築圖集 ────────────────────────────────────────────────
// 契約(build.mjs 注入):
//   PIXEL_ASSETS.buildingsAtlas / buildingsAtlas2x      = data:image/png;base64,...
//   PIXEL_ASSETS.buildingsManifest / buildingsManifest2x = {cells:{<id>:{x,y,w,h}}}
// 每格 rect 是「內容本身」的來源矩形,已經去背、去空白,所以不用再跑色鍵和 bbox 掃描。
const atlasLod=[];
// 圖集裡「參考建築」的來源寬度(manifest 產出時的中位數)。用它把舊版的
// 世界寬度 71 換算成「每來源像素多少世界單位」,畫面大小才跟改之前一致。
const ATLAS_REF_WIDTH_1X=145.5;
const BUILDING_WORLD_WIDTH=71;
// 大廳與地下城要比店鋪大。舊版是 hall:79 / dungeon:77,換算成倍率。
const BUILDING_SCALE={hall:1.11,dungeon:1.08};
function atlasFrameFor(id){
  // 由近到遠找第一個載好、且含這棟建築的 LOD
  for(const lod of atlasLod)if(lod.frames[id])return lod;
  return null;
}
function atlasReady(){return atlasLod.length>0;}
function ensureAtlasManifest(){
  const assets=globalThis.PIXEL_ASSETS||{};
  const specs=[['buildingsAtlas','buildingsManifest',1/ATLAS_REF_WIDTH_1X,1],
               ['buildingsAtlas2x','buildingsManifest2x',1/(ATLAS_REF_WIDTH_1X*2),2]];
  for(const [sheetKey,manKey] of specs){
    const urlKey=sheetKey, man=assets[manKey];
    if(!man||!assets[urlKey]||loadedAssetKeys.has(urlKey))continue;
    loadedAssetKeys.add(urlKey);
    const m=(typeof man==='string')?JSON.parse(man):man;
    const im=new Image();
    im.onload=()=>{
      const k=(m.scale===0.5)?(1/(ATLAS_REF_WIDTH_1X)):(1/(ATLAS_REF_WIDTH_1X*2));
      atlasLod.push({img:im,k,scale:m.scale===0.5?1:2,frames:m.cells});
      globalThis.dispatchEvent(new CustomEvent('pixel-assets-ready'));
    };
    im.onerror=()=>loadedAssetKeys.delete(urlKey);
    im.src=assets[urlKey];
  }
}
// 用「每來源像素」的統一倍率畫。不把寬度硬塞成固定值,所以寬一點的建築就真的寬一點。
function drawAtlasBuilding(id,p,offset=0){
  const lod=atlasFrameFor(id);
  if(!lod)return null;
  const c=lod.frames[id];
  const k=lod.k*(BUILDING_SCALE[id]||1);
  const dw=Math.max(1,Math.round(c.w*k*scale)),dh=Math.max(1,Math.round(c.h*k*scale));
  const dx=Math.round(p.x-dw/2),dy=Math.round(p.y-dh+offset*scale);
  g.drawImage(lod.img,c.x,c.y,c.w,c.h,dx,dy,dw,dh);
  return {x:dx,y:dy,w:dw,h:dh};
}

function ensureAtlas() {
  ensureAtlasManifest();'''
s = s.replace(anchor_a, new_block, 1)

# 3b. 拿掉舊的 buildings14 硬切格區塊
start = s.index("  const sheet=assets.buildings14;")
endmark = "im.onerror=()=>loadedAssetKeys.delete('sheet14');im.src=sheet;}"
end = s.index(endmark, start) + len(endmark)
s = s[:start] + "  // buildings14 的硬切格已由上面的 manifest 圖集取代(列切線原本是猜的)。" + s[end:]

# 3c. buildingDataURL 走圖集
old_url = "export function buildingDataURL(id) {return (atlasCell(id)||buildingSprite(id)).toDataURL();}"
must(old_url in s, "找不到 buildingDataURL")
s = s.replace(old_url, """export function buildingDataURL(id) {
  const lod=atlasFrameFor(id);
  if(!lod)return buildingSprite(id).toDataURL();
  const c=lod.frames[id],out=makeCanvas(c.w,c.h);
  out.getContext('2d').drawImage(lod.img,c.x,c.y,c.w,c.h,0,0,c.w,c.h);
  return out.toDataURL();
}""", 1)

# 3d. drawBuilding 改用 drawAtlasBuilding
old_draw = "const sprite=atlasCell(b.id)||buildingSprite(b.id),isAtlas=!!atlasCell(b.id);let w=b.id==='hall'?79:b.id==='dungeon'?77:71,h=isAtlas?w*sprite.height/sprite.width:72;\n    if(h>110){w*=110/h;h=110;}h=Math.max(48,h);\n    const rect=drawSprite(sprite,p,w,h,9);"
must(old_draw in s, "找不到 drawBuilding 的 sprite 計算")
s = s.replace(old_draw, """let rect=drawAtlasBuilding(b.id,p,9);
    if(!rect){const sprite=buildingSprite(b.id),w=b.id==='hall'?79:b.id==='dungeon'?77:71;rect=drawSprite(sprite,p,w,72,9);}""", 1)

# 3e. 除錯鉤子
s = s.replace("export function atlasFrame(id)", "globalThis.__mistvaleAtlas=()=>({ready:atlasReady(),lods:atlasLod.map(l=>({scale:l.scale,count:Object.keys(l.frames).length}))});\nexport function atlasFrame(id)", 1)

PW.write_text(s, encoding="utf-8")
print("pixel-world.js 已改")

# ── 4. 自我檢查 ───────────────────────────────────────────────────────────
txt = PW.read_text(encoding="utf-8")
for bad in ("buildings14", "rows=[0,.326,.66,1]"):
    must(bad not in txt, f"還有殘留:{bad}")
print("✅ 舊的 buildings14 硬切格已完全移除")
