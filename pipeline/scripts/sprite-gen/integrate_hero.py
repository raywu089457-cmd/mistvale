"""把角色圖集整合進 heroSprite()。

策略:heroSprite() 是整個遊戲唯一的角色取圖入口
(獵人、死亡姿勢、縮圖、立繪全部走它),
所以只要在它裡面加一個「圖集優先」的分支,其餘程式碼一行都不用改。

保留程序繪製當 fallback —— 圖集還沒載完時不會開天窗。
"""
import json
import shutil
import sys
from pathlib import Path

PROJ = Path(r"C:\Users\ray\sprite-demo\mistvale-work\proj")
POC = Path(r"C:\Users\ray\sprite-demo\buildings-poc")
SRC = POC / "hero-atlas"
PW = PROJ / "src" / "pixel-world.js"
BM = PROJ / "build.mjs"
ASSETS = PROJ / "assets"


def must(c, m):
    if not c:
        raise SystemExit("整合失敗:" + m)


# ── 1. 複製圖集 ────────────────────────────────────────────────────────────
for a, b in (("hero@1x.png", "hero@1x.png"),
             ("hero@1x.manifest.json", "hero@1x.manifest.json"),
             ("hero@2x.png", "hero@2x.png"),
             ("hero@2x.manifest.json", "hero@2x.manifest.json")):
    shutil.copy2(SRC / a, ASSETS / b)
print("已複製 4 個角色圖集檔")

# ── 2. build.mjs ───────────────────────────────────────────────────────────
bm = BM.read_text(encoding="utf-8")
if "heroAtlas" not in bm:
    anchor = "html=html.replace('/*__STYLE__*/'"
    must(anchor in bm, "build.mjs 找不到 STYLE 錨點")
    bm = bm.replace(anchor, """// 角色圖集(獵人六職業)
for(const [tag,file,js] of [['heroAtlas','hero@1x.png',false],['heroManifest','hero@1x.manifest.json',true],
                            ['heroAtlas2x','hero@2x.png',false],['heroManifest2x','hero@2x.manifest.json',true]]){
  try{const raw=await fs.readFile(path.join(root,`assets/${file}`));
    assetScript+=`window.PIXEL_ASSETS=window.PIXEL_ASSETS||{};window.PIXEL_ASSETS.${tag}=`
      +(js?raw.toString('utf8'):`'data:image/png;base64,${raw.toString('base64')}'`)+';';
  }catch(e){console.warn('missing hero atlas',file);}
}
""" + anchor, 1)
    BM.write_text(bm, encoding="utf-8")
    print("build.mjs 已改")
else:
    print("build.mjs 已有 hero 區塊")

# ── 3. pixel-world.js ─────────────────────────────────────────────────────
s = PW.read_text(encoding="utf-8")

# 3a. 模組層:狀態 + 載入器(在 loadedAssetKeys 之前)
if "heroAtlasLod" not in s:
    anchor = "// ── 無縫地面材質(整片 pattern,不是逐格貼圖)"
    must(anchor in s, "找不到地面材質區塊")
    block = '''// ── 角色圖集(六職業) ─────────────────────────────────────────────────
// heroSprite() 是遊戲唯一的角色取圖入口,所以在它裡面加「圖集優先」分支就好,
// 其餘程式碼(獵人、死亡姿勢、縮圖、立繪)一行都不用改。
const heroAtlasLod=[];
// heroSprite 在模組層,看不到閉包裡的 scale —— 用這個模組層變數由 update() 更新。
// (踩過兩次同樣的坑:h is not defined / scale is not defined)
let heroLodScale=1;
const HERO_TINT=['rgba(255,225,190,.10)','rgba(190,215,255,.10)','rgba(255,200,215,.10)'];
function heroFrameFor(classId,sc){
  const pick=sc>=2.2?2:1;
  for(const lod of heroAtlasLod)if(lod.scale===pick&&lod.frames[classId])return lod;
  for(const lod of heroAtlasLod)if(lod.frames[classId])return lod;
  return null;
}
function ensureHeroAtlas(){
  const assets=globalThis.PIXEL_ASSETS||{};
  for(const [sheetKey,manKey] of [['heroAtlas','heroManifest'],['heroAtlas2x','heroManifest2x']]){
    if(!assets[sheetKey]||!assets[manKey]||loadedAssetKeys.has(sheetKey))continue;
    loadedAssetKeys.add(sheetKey);
    const m=(typeof assets[manKey]==='string')?JSON.parse(assets[manKey]):assets[manKey];
    const im=new Image();
    im.onload=()=>{heroAtlasLod.push({img:im,scale:m.scale>=0.2?2:1,frames:m.cells});
      globalThis.dispatchEvent(new CustomEvent('pixel-assets-ready'));};
    im.onerror=()=>loadedAssetKeys.delete(sheetKey);
    im.src=assets[sheetKey];
  }
}

''' + anchor
    s = s.replace(anchor, block, 1)
    print("模組層:角色圖集區塊已插入")

must("  ensureTerrainAtlas();" in s, "找不到 ensureTerrainAtlas 呼叫")
s = s.replace("  ensureTerrainAtlas();", "  ensureTerrainAtlas();\n  ensureHeroAtlas();", 1)

# 3b. heroSprite:圖集優先
old = """function heroSprite(classId='berserker',frame=0,facing=1,variant=0) {
  const key=`${classId}:${frame}:${facing}:${variant%3}`;
  if(spriteCache.has(key))return spriteCache.get(key);
  const c=makeCanvas(28,35),g=c.getContext('2d');g.imageSmoothingEnabled=false;"""
must(old in s, "找不到 heroSprite 開頭")
new = """function heroSprite(classId='berserker',frame=0,facing=1,variant=0) {
  const key=`${classId}:${frame}:${facing}:${variant%3}`;
  if(spriteCache.has(key))return spriteCache.get(key);
  // ── 圖集優先 ────────────────────────────────────────────────────────
  // 28x35 是遊戲既定的角色畫布;把出土角色 contain 進去、底部對齊(腳 = 基準線),
  // frame 1 往上 1px 做走路起伏。variant 用一層極淡的染色保留「同職業不同人」的差異。
  // 圖集還沒載完時 heroFrameFor 回 null,自動退回下面的程序繪製。
  const hf=heroFrameFor(classId,heroLodScale);
  if(hf){
    const cell=hf.frames[classId],c=makeCanvas(28,35),g=c.getContext('2d');
    g.imageSmoothingEnabled=false;
    const k=Math.min(28/cell.w,(35-1)/cell.h);
    const dw=Math.max(1,Math.round(cell.w*k)),dh=Math.max(1,Math.round(cell.h*k));
    g.save();
    if(facing<0){g.translate(28,0);g.scale(-1,1);}
    g.drawImage(hf.img,cell.x,cell.y,cell.w,cell.h,
                Math.round((28-dw)/2),35-dh-(frame?1:0),dw,dh);
    g.restore();
    g.globalCompositeOperation='source-atop';
    g.fillStyle=HERO_TINT[variant%3];g.fillRect(0,0,28,35);
    g.globalCompositeOperation='source-over';
    spriteCache.set(key,c);return c;
  }
  const c=makeCanvas(28,35),g=c.getContext('2d');g.imageSmoothingEnabled=false;"""
s = s.replace(old, new, 1)

# 3c. 除錯鉤子
s = s.replace("globalThis.__mistvaleDetails=",
              "globalThis.__mistvaleHero=()=>({ready:heroAtlasLod.length>0,"
              "lods:heroAtlasLod.map(l=>({scale:l.scale,cells:Object.keys(l.frames).length}))});\n"
              "globalThis.__mistvaleDetails=", 1)

# 3d. update() 裡更新 heroLodScale
old_up = "elapsed+=Math.min(dt||0,.1);ensureAtlas();"
must(old_up in s, "找不到 update 的 elapsed 行")
s = s.replace(old_up, "elapsed+=Math.min(dt||0,.1);heroLodScale=scale;ensureAtlas();", 1)

PW.write_text(s, encoding="utf-8")
print("pixel-world.js 已改:heroSprite 圖集優先 + 程序 fallback")
