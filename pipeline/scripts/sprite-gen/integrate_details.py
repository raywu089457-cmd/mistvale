"""把地圖細節圖集整合進 mistvale 的 drawDecoration()。

設計:每個型別給一個「世界單位」的外框(沿用遊戲原本的尺寸,所以版面不會跑掉),
物件用 contain 塞進外框、保持等比。atlas 畫成功就跳過程序繪製,失敗就退回舊路徑。
"""
import json
import shutil
import sys
from pathlib import Path

PROJ = Path(r"C:\Users\ray\sprite-demo\mistvale-work\proj")
POC = Path(r"C:\Users\ray\sprite-demo\buildings-poc")
LOD = POC / "detail-lod"
PW = PROJ / "src" / "pixel-world.js"
BM = PROJ / "build.mjs"
ASSETS = PROJ / "assets"


def must(c, m):
    if not c:
        raise SystemExit("整合失敗:" + m)


# ── 1. 把 detail 圖集改名後複製進 assets/(避開 buildings@* 的檔名) ──────────
for src, dst in (("buildings@1x.png", "details@1x.png"),
                 ("buildings@1x.manifest.json", "details@1x.manifest.json"),
                 ("buildings@2x.png", "details@2x.png"),
                 ("buildings@2x.manifest.json", "details@2x.manifest.json")):
    shutil.copy2(LOD / src, ASSETS / dst)
print("已複製 4 個 detail 圖集檔")

# ── 2. build.mjs ───────────────────────────────────────────────────────────
bm = BM.read_text(encoding="utf-8")
anchor = "html=html.replace('/*__STYLE__*/'"
must(anchor in bm, "build.mjs 找不到 STYLE 錨點")
inject = """// 地圖細節圖集:同一個 manifest 契約,只是 key 是裝飾型別。
for(const [tag,file] of [['detailsAtlas','details@1x.png'],['detailsAtlas2x','details@2x.png']]){
  try{const p=await fs.readFile(path.join(root,`assets/${file}`));assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.${tag}='data:image/png;base64,${p.toString('base64')}';`;}catch(e){console.warn('missing detail atlas',file);}
}
for(const [tag,file] of [['detailsManifest','details@1x.manifest.json'],['detailsManifest2x','details@2x.manifest.json']]){
  try{const t=await fs.readFile(path.join(root,`assets/${file}`),'utf8');assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.${tag}=${t};`;}catch(e){console.warn('missing detail manifest',file);}
}
"""
if "detailsAtlas" not in bm:
    bm = bm.replace(anchor, inject + anchor)
    BM.write_text(bm, encoding="utf-8")
    print("build.mjs 已改")
else:
    print("build.mjs 已有 detail 區塊,略過")

# ── 3. pixel-world.js ─────────────────────────────────────────────────────
s = PW.read_text(encoding="utf-8")

# 3a. 模組層:狀態 + 解析 + 載入(不能用閉包裡的 scale)
anchor_a = "const loadedAssetKeys=new Set();"
must(anchor_a in s, "找不到 loadedAssetKeys")
detail_block = '''// ── 地圖細節圖集(樹、岩石、村莊家具) ──────────────────────────────────
// key 就是裝飾型別,剛好 1:1 對上 drawDecoration() 的分支。
const detailLod=[];
// 樹用 variant%4 選型:0 松 / 1 闊葉 / 2 樺 / 3 雪松(跟 treeSprite 的 type 一致)
const TREE_ATLAS=['pine','oak','birch','snowpine'];
const detailUse={draw1x:0,draw2x:0};
function detailFrameFor(id,prefer2x){
  if(prefer2x)for(const lod of detailLod)if(lod.scale===2&&lod.frames[id])return lod;
  for(const lod of detailLod)if(lod.frames[id])return lod;
  return null;
}
function ensureDetailAtlas(){
  const assets=globalThis.PIXEL_ASSETS||{};
  for(const [sheetKey,manKey] of [['detailsAtlas','detailsManifest'],
                                  ['detailsAtlas2x','detailsManifest2x']]){
    if(!assets[sheetKey]||!assets[manKey]||loadedAssetKeys.has(sheetKey))continue;
    loadedAssetKeys.add(sheetKey);
    const m=(typeof assets[manKey]==='string')?JSON.parse(assets[manKey]):assets[manKey];
    const im=new Image();
    im.onload=()=>{detailLod.push({img:im,scale:m.scale===0.5?1:2,frames:m.cells});
      globalThis.dispatchEvent(new CustomEvent('pixel-assets-ready'));};
    im.onerror=()=>loadedAssetKeys.delete(sheetKey);
    im.src=assets[sheetKey];
  }
}

''' + anchor_a
s = s.replace(anchor_a, detail_block, 1)

# 3b. ensureAtlas 裡呼叫
must("function ensureAtlas() {\n  ensureAtlasManifest();" in s, "找不到 ensureAtlas 開頭")
s = s.replace("function ensureAtlas() {\n  ensureAtlasManifest();",
              "function ensureAtlas() {\n  ensureAtlasManifest();\n  ensureDetailAtlas();", 1)

# 3c. 閉包內:drawSprite 之後加 drawAtlasDetail
anchor_ds = "return{x:p.x-ww/2,y:p.y-hh+offset*scale,w:ww,h:hh};}"
must(anchor_ds in s, "找不到 drawSprite 結尾")
draw_fn = '''
  // 把圖集物件 contain 進「世界單位外框」並畫出。回傳 true = 畫成功。
  // contain 而不是拉伸:保持出土物件的等比,尺寸由外框決定(版面才不會跑掉)。
  function drawAtlasDetail(id,p,bw,bh,offset=0,alpha=1){
    const lod=detailFrameFor(id,scale>=2.2);
    if(!lod)return false;
    const c=lod.frames[id];
    const rs=Math.min(bw*scale/c.w,bh*scale/c.h);
    const dw=Math.max(1,Math.round(c.w*rs)),dh=Math.max(1,Math.round(c.h*rs));
    if(lod.scale===2)detailUse.draw2x++;else detailUse.draw1x++;
    g.globalAlpha=alpha;
    g.drawImage(lod.img,c.x,c.y,c.w,c.h,Math.round(p.x-dw/2),Math.round(p.y-dh+offset*scale),dw,dh);
    g.globalAlpha=1;
    return true;
  }'''
s = s.replace(anchor_ds, anchor_ds + draw_fn, 1)

# 3d. 各分支:atlas 成功就整個跳過程序繪製
#     寫法是在 if 條件裡呼叫 —— 畫成功回傳 true,條件變 false,該分支就不執行。
REPL = [
    ("if(d.type==='tree'){const obscured=[...(state.hunters||[]),...(state.enemies||[])].some(a=>a.hp>0&&a.x+a.z<d.x+d.z+.2&&canopyObscures(d.x,d.z,d.size,a.x,a.z,4));drawSprite(treeCanvases[d.variant],p,50*d.size,72*d.size,4,obscured?.18:1);return;}",
     "if(d.type==='tree'&&!drawAtlasDetail(TREE_ATLAS[(d.variant||0)%4],p,50*d.size,72*d.size,4,([...(state.hunters||[]),...(state.enemies||[])].some(a=>a.hp>0&&a.x+a.z<d.x+d.z+.2&&canopyObscures(d.x,d.z,d.size,a.x,a.z,4))?.18:1))){drawSprite(treeCanvases[d.variant],p,50*d.size,72*d.size,4,1);return;}"),
    ("if(d.type==='rock'){polygon(", "if(d.type==='rock'&&!drawAtlasDetail('boulders',p,13,10)){polygon("),
    ("if(d.type==='fence'){pixel(", "if(d.type==='fence'&&!drawAtlasDetail('fence',p,10,17)){pixel("),
    ("if(d.type==='signpost'){const s=scale;", "if(d.type==='signpost'&&!drawAtlasDetail('signpost',p,17,21)){const s=scale;"),
    ("if(d.type==='lamp'){pixel(g,p.x,p.y-21*scale,2*scale,22*scale,'#4e4937');",
     "if(d.type==='lamp'&&!drawAtlasDetail('lamppost',p,8,24)){pixel(g,p.x,p.y-21*scale,2*scale,22*scale,'#4e4937');"),
]
for old, new in REPL:
    must(old in s, "找不到分支:" + old[:48])
    s = s.replace(old, new, 1)

# outcrop / cave / ruins 共用一個分支,要在裡面插 atlas 嘗試
old_ocr = "if(d.type==='outcrop'||d.type==='cave'||d.type==='ruins'){const s=scale*d.size,hh=d.type==='cave'?38:d.type==='ruins'?28:17;"
must(old_ocr in s, "找不到 outcrop/cave/ruins 分支")
new_ocr = ("if(d.type==='outcrop'||d.type==='cave'||d.type==='ruins'){\n"
           "      const hh0=d.type==='cave'?38:d.type==='ruins'?28:17;\n"
           "      if(drawAtlasDetail(d.type==='ruins'?'ruin':d.type,p,38*d.size,hh0*d.size)){\n"
           "        if(d.type==='cave')textLabel('鐵脊礦坑',p.x,p.y+16*scale,{color:'#e3d5b0'});\n"
           "        return;}\n"
           "      const s=scale*d.size,hh=hh0;")
s = s.replace(old_ocr, new_ocr, 1)

# well / fountain
old_well = "if(d.type==='fountain'||d.type==='well'){const sp=atlasCell(d.type)||buildingSprite(d.type);"
must(old_well in s, "找不到 fountain/well 分支")
new_well = ("if(d.type==='fountain'||d.type==='well'){\n"
            "      if(d.type==='well'&&drawAtlasDetail('well',p,90*d.size,91*d.size,8))return;\n"
            "      const sp=atlasCell(d.type)||buildingSprite(d.type);")
s = s.replace(old_well, new_well, 1)

# 除錯鉤子
s = s.replace("globalThis.__mistvaleAtlas=()=>({ready:atlasLod.length>0,",
              "globalThis.__mistvaleDetails=()=>({ready:detailLod.length>0,use:Object.assign({},detailUse)});\n"
              "globalThis.__mistvaleAtlas=()=>({ready:atlasLod.length>0,", 1)

PW.write_text(s, encoding="utf-8")
print("pixel-world.js 已改")
print("已替換分支:", [r[0][:24] for r in REPL], "+ outcrop家族 + well")
