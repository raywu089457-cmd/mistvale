import colorsys
from pathlib import Path
from PIL import Image

root=Path(__file__).resolve().parents[2]
image=Image.open(root/'assets/concept-clean/house-concept-v2.png').convert('RGBA')
pixels=image.load()
original=image.copy()
changed=0
for y in range(int(image.height*.58)):
    for x in range(image.width):
        r,g,b,a=pixels[x,y]
        h,s,v=colorsys.rgb_to_hsv(r/255,g/255,b/255)
        if a and .15<h<.40 and s>.2:
            rgb=colorsys.hsv_to_rgb(.59,max(s,.48),v)
            pixels[x,y]=(*(round(c*255) for c in rgb),a)
            changed+=1
assert image.getchannel('A').tobytes()==original.getchannel('A').tobytes()
limit=int(image.height*.58)
assert image.crop((0,limit,image.width,image.height)).tobytes()==original.crop((0,limit,image.width,image.height)).tobytes()
image.save(root/'assets/concept-clean/house-concept-v2.png')
print(f'{changed} roof pixels changed to blue; alpha preserved')
