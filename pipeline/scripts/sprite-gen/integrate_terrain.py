"""把無縫地面材質整合進 mistvale 的 generateGround()。

核心想法:
    地面原本是 9048 塊「平塗菱形」,每塊只有 9x5 螢幕像素 —— 塞不進任何細節。
    所以不是逐格貼圖,而是「按生態域整片填 Canvas pattern」,並把 pattern
    垂直壓 0.5,讓材質符合等角透視(從上方看下去被壓扁 2:1)。

    材質還沒載完時自動退回原本的平塗菱形,不會開天窗。
"""
import shutil
import sys
from pathlib import Path

PROJ = Path(r"C:\Users\ray\sprite-demo\mistvale-work\proj")
POC = Path(r"C:\Users\ray\sprite-demo\buildings-poc")
PW = PROJ / "src" / "pixel-world.js"
BM = PROJ / "build.mjs"
ASSETS = PROJ / "assets"


def must(c, m):
    if not c:
        raise SystemExit("整合失敗:" + m)


# ── 1. 256px RGB 版本 + 複製 ────────────────────────────────────────────────
from PIL import Image  # noqa: E402
import json  # noqa: E402

NAMES = ["village", "meadow", "birch", "forest", "taiga", "snow",
         "mountain", "desert", "river", "ocean", "ice", "bridge"]
S = 256
sheet = Image.new("RGB", (S * 4, S * 3))
cells = {}
for i, n in enumerate(NAMES):
    im = Image.open(POC / "terrain" / f"{n}.png").convert("RGB").resize((S, S), Image.NEAREST)
    c, r = i % 4, i // 4
    sheet.paste(im, (c * S, r * S))
    cells[n] = {"x": c * S, "y": r * S, "w": S, "h": S}
sheet.save(ASSETS / "terrain-atlas.png")
(ASSETS / "terrain-atlas.manifest.json").write_text(
    json.dumps({"version": 1, "kind": "mistvale-terrain-atlas",
                "image": "terrain-atlas.png", "sheetWidth": sheet.width,
                "sheetHeight": sheet.height, "tile": S, "cells": cells},
               ensure_ascii=False, indent=1), encoding="utf-8")
print(f"已寫入 terrain-atlas.png {(ASSETS/'terrain-atlas.png').stat().st_size/1024:.0f} KB + manifest")

# ── 2. build.mjs ───────────────────────────────────────────────────────────
bm = BM.read_text(encoding="utf-8")
if "terrainAtlas" not in bm:
    anchor = "html=html.replace('/*__STYLE__*/'"
    must(anchor in bm, "build.mjs 找不到 STYLE 錨點")
    bm = bm.replace(anchor, """// 無縫地面材質圖集
for(const [tag,file,js] of [['terrainAtlas','terrain-atlas.png',false],['terrainManifest','terrain-atlas.manifest.json',true]]){
  try{const raw=await fs.readFile(path.join(root,`assets/${file}`));
    assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.${tag}=`
      +(js?raw.toString('utf8'):`'data:image/png;base64,${raw.toString('base64')}'`)+';';
  }catch(e){console.warn('missing terrain atlas',file);}
}
""" + anchor, 1)
    BM.write_text(bm, encoding="utf-8")
    print("build.mjs 已改")
else:
    print("build.mjs 已有 terrain 區塊")

# ── 3. pixel-world.js ─────────────────────────────────────────────────────
s = PW.read_text(encoding="utf-8")

if "groundPatterns" not in s:
    anchor = "// ── 地圖細節圖集(樹、岩石、村莊家具)"
    must(anchor in s, "找不到細節圖集區塊")
    block = '''// ── 無縫地面材質(整片 pattern,不是逐格貼圖) ─────────────────────────
const groundPatterns={};
let terrainPatternRev=0;
function ensureTerrainAtlas(){
  const assets=globalThis.PIXEL_ASSETS||{};
  if(!assets.terrainAtlas||!assets.terrainManifest||loadedAssetKeys.has('terrainAtlas'))return;
  loadedAssetKeys.add('terrainAtlas');
  const m=(typeof assets.terrainManifest==='string')?JSON.parse(assets.terrainManifest):assets.terrainManifest;
  const im=new Image();
  im.onload=()=>{
    for(const [name,c] of Object.entries(m.cells)){
      const cv=makeCanvas(c.w,c.h),cx=cv.getContext('2d');
      cx.imageSmoothingEnabled=false;
      cx.drawImage(im,c.x,c.y,c.w,c.h,0,0,c.w,c.h);
      groundPatterns[name]=cx.createPattern(cv,'repeat');
    }
    terrainPatternRev++;   // generateGround 會偵測到這個變化並重畫
    globalThis.dispatchEvent(new CustomEvent('pixel-assets-ready'));
  };
  im.onerror=()=>loadedAssetKeys.delete('terrainAtlas');
  im.src=assets.terrainAtlas;
}

''' + anchor
    s = s.replace(anchor, block, 1)
    print("模組層:地形 pattern 區塊已插入")

must("  ensureDetailAtlas();" in s, "找不到 ensureDetailAtlas 呼叫")
s = s.replace("  ensureDetailAtlas();", "  ensureDetailAtlas();\n  ensureTerrainAtlas();", 1)

# 3a. generateGround:底層改成整片 pattern
old_head = """    const road=(x,z)=>onRoad(x,z,roads);
    for(let z=WORLD.minZ;z<WORLD.maxZ;z++)for(let x=WORLD.minX;x<WORLD.maxX;x++){
      const p=worldPos(x,z),biome=biomeAt(x,z),base=BIOME_PALETTE[biome],n=Math.floor(rand()*13)-6,col=shade(base,n);diamond(gc,x,z,.51,.51,col);"""
must(old_head in s, "找不到 generateGround 的 tile 迴圈開頭")
new_head = """    const road=(x,z)=>onRoad(x,z,roads);
    // 底層:按生態域「整片」填無縫材質。一格菱形只有 9x5 螢幕像素,逐格貼圖
    // 塞不進細節;整片填才會有連續的草/沙/雪紋理。pattern 垂直壓 0.5 符合等角透視。
    // 材質還沒載完時 tiled=false,退回原本的平塗菱形,不開天窗。
    const tiled=Object.keys(groundPatterns).length>0;
    if(tiled){
      const byBiome=new Map();
      for(let z=WORLD.minZ;z<WORLD.maxZ;z++)for(let x=WORLD.minX;x<WORLD.maxX;x++){
        const b=biomeAt(x,z);let arr=byBiome.get(b);if(!arr){arr=[];byBiome.set(b,arr);}arr.push(x,z);
      }
      for(const [b,pts] of byBiome){
        const pat=groundPatterns[b];if(!pat)continue;
        gc.beginPath();
        for(let i=0;i<pts.length;i+=2){
          const x0=pts[i],z0=pts[i+1];
          const q=worldPos(x0-.51,z0-.51),r=worldPos(x0+.51,z0-.51),
                t=worldPos(x0+.51,z0+.51),u=worldPos(x0-.51,z0+.51);
          gc.moveTo(q.x,q.y);gc.lineTo(r.x,r.y);gc.lineTo(t.x,t.y);gc.lineTo(u.x,u.y);gc.closePath();
        }
        gc.save();gc.clip();gc.scale(1,.5);
        gc.fillStyle=pat;gc.fillRect(0,0,ground.width,ground.height*2);
        gc.restore();
      }
    }
    for(let z=WORLD.minZ;z<WORLD.maxZ;z++)for(let x=WORLD.minX;x<WORLD.maxX;x++){
      const p=worldPos(x,z),biome=biomeAt(x,z),base=BIOME_PALETTE[biome],n=Math.floor(rand()*13)-6;
      if(!tiled)diamond(gc,x,z,.51,.51,shade(base,n));"""
s = s.replace(old_head, new_head, 1)

# 3b. 競技場空地:有材質時改成半透明覆蓋,保留底下紋理
old_cl = "if(clearing){const colors={meadow:'#aeb27d',forest:'#a4a77c',taiga:'#99aaa0',snow:'#e5eee7',mountain:'#b6b6a5',desert:'#e3c28a',birch:'#b9c18a'};diamond(gc,x,z,.51,.51,shade(colors[clearing.id]||'#b5b68a',n/2));"
must(old_cl in s, "找不到競技場空地分支")
new_cl = ("if(clearing){const colors={meadow:'#aeb27d',forest:'#a4a77c',taiga:'#99aaa0',snow:'#e5eee7',"
          "mountain:'#b6b6a5',desert:'#e3c28a',birch:'#b9c18a'};const cc=shade(colors[clearing.id]||'#b5b68a',n/2);"
          "if(tiled){gc.save();gc.globalAlpha=.5;diamond(gc,x,z,.51,.51,cc);gc.restore();}else diamond(gc,x,z,.51,.51,cc);")
s = s.replace(old_cl, new_cl, 1)

# 3c. 橋面:有材質時讓木板紋理透出來
old_br = "if(biome==='bridge'){diamond(gc,x,z,.51,.51,'#79583b');"
must(old_br in s, "找不到 bridge 分支")
s = s.replace(old_br, "if(biome==='bridge'){if(!tiled)diamond(gc,x,z,.51,.51,'#79583b');", 1)

# 3d. update():pattern 載入後要重畫地面
old_up = "if(key!==landscapeKey){landscapeKey=key;generateGround();}"
must(old_up in s, "找不到 update 的 landscapeKey 判斷")
s = s.replace(old_up, "if(key!==landscapeKey||terrainPatternRev!==lastPatternRev){lastPatternRev=terrainPatternRev;landscapeKey=key;generateGround();}", 1)
s = s.replace("const decorations=[];let roads=getRoads(),landscapeKey='',terrainRevision=0;",
              "const decorations=[];let roads=getRoads(),landscapeKey='',terrainRevision=0,lastPatternRev=-1;", 1)

PW.write_text(s, encoding="utf-8")
print("pixel-world.js 已改")
