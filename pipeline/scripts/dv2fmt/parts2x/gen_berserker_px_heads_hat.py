import sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, r"C:\Users\ray\Documents\Codex\2026-09-29\new-chat\work\mistvale\pipeline\scripts\pixellab")
import v2_client as V
from gen_defs import *
OUT=Path(__file__).parent/"px"; OUT.mkdir(exist_ok=True)
ST="pixel art chibi RPG character part: "
def hd(extra=""): return ST+"a big round chibi head only, no neck, no body, spiky messy brown hair, fierce brown eyes, light stubble on the chin, tan skin, "+extra+TAIL
def bd(extra): return ST+"a tiny stubby chibi body with no head and no hands, the body ends at a cream fur collar at the top and at round wrist stumps on the arms, brown leather vest, heavy dark brown belt with a small iron buckle, brown trousers, dark brown boots, very short thick legs, broad shoulders, "+extra+", "+TAIL
jobs={}
jobs["head"]=hd()
for k,v in {"blink":"both eyes closed as if blinking","pain":"pained expression with eyes squeezed shut and gritted teeth","shout":"shouting fiercely with the mouth wide open and angry eyebrows","happy":"big happy grin with the eyes closed in joy","ko":"knocked out with eyes drawn as small x marks and a slack mouth"}.items():
    jobs["head_"+k]=hd(v+", ")
jobs["body"]=bd("standing straight with feet together and arms down at the sides")
for k,v in bodies.items(): jobs["body_"+k]=bd(v)
jobs["hat"]=HAT
def go(item):
    name,desc=item
    dirs=["east"] if name=="body_lying" else ["south","east","north"]
    for d in dirs:
        o=OUT/name; o.mkdir(exist_ok=True)
        if (o/f"{d}.png").exists(): continue
        V.make_image(desc,32,model="pixflux",view="low top-down",direction=d,outline="single color black outline",detail="medium detail",seed=7,out_dir=o/d)
        (o/d/"image-0.png").replace(o/f"{d}.png"); (o/d).rmdir()
with ThreadPoolExecutor(6) as ex: list(ex.map(go,jobs.items()))
print("DONE")
