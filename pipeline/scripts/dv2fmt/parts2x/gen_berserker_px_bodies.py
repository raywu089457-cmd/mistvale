import sys, shutil
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, r"C:\Users\ray\Documents\Codex\2026-09-29\new-chat\work\mistvale\pipeline\scripts\pixellab")
import v2_client as V
from gen_defs import bodies
bodies={"":"standing straight with feet together and arms down at the sides",**{"_"+k:v for k,v in bodies.items()}}
P="pixel art game sprite of a headless chibi body: only a cream fur collar, a brown leather vest, dark brown belt with iron buckle, brown trousers and boots, arms ending in round stumps, nothing above the collar, empty space where the head would be, %s, 1-pixel dark outline, flat colours, transparent background"
def go(it):
    k,v=it; n="body"+k; dirs=["east"] if k=="_lying" else ["south","east","north"]
    for d in dirs:
        o=Path("px")/n; shutil.rmtree(o/f"{d}.png",ignore_errors=True)
        V.make_image(P%v,32,model="pixflux",view="low top-down",direction=d,outline="single color black outline",detail="medium detail",seed=7,out_dir=o/d)
        (o/d/"image-0.png").replace(o/f"{d}.png"); (o/d).rmdir()
with ThreadPoolExecutor(6) as ex: list(ex.map(go,bodies.items()))
print("DONE")
