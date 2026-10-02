import colorsys
from pathlib import Path
from PIL import Image

path=Path(__file__).resolve().parents[2]/'assets/concept-clean/academy-concept-v2.png'
image=Image.open(path).convert('RGBA')
original=image.copy()
pixels=image.load()
limit=int(image.height*.60)
changed=0
for y in range(limit):
    for x in range(image.width):
        r,g,b,a=pixels[x,y]
        hue,saturation,value=colorsys.rgb_to_hsv(r/255,g/255,b/255)
        if a and .52<hue<.70 and saturation>.35:
            rgb=colorsys.hsv_to_rgb(.76,saturation,value)
            pixels[x,y]=(*(round(channel*255) for channel in rgb),a)
            changed+=1
assert image.getchannel('A').tobytes()==original.getchannel('A').tobytes()
assert image.crop((0,limit,image.width,image.height)).tobytes()==original.crop((0,limit,image.width,image.height)).tobytes()
image.save(path)
print(f'{changed} academy roof pixels changed to violet; lower artwork and alpha preserved')
