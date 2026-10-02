import colorsys
import json
from pathlib import Path
from PIL import Image, ImageDraw

root=Path(__file__).resolve().parents[2]
manifest=json.loads((root/'assets/buildings@2x.manifest.json').read_text(encoding='utf-8'))
cell=manifest['cells']['restaurant']
sheet=Image.open(root/'assets'/manifest['image']).convert('RGBA')
image=sheet.crop((cell['x'],cell['y'],cell['x']+cell['w'],cell['y']+cell['h']))
original=image.copy()
pixels=image.load()
roof=Image.new('L',image.size)
ImageDraw.Draw(roof).polygon([(15,115),(70,0),(190,0),(237,61),(196,118),(143,171),(80,134)],fill=255)
mask=roof.load()
changed=0
for y in range(image.height):
    for x in range(image.width):
        r,g,b,a=pixels[x,y]
        h,s,v=colorsys.rgb_to_hsv(r/255,g/255,b/255)
        if a and mask[x,y] and 0<h<.14 and s>.35 and v>.22:
            rgb=colorsys.hsv_to_rgb(.60,s*.85,v*.87)
            pixels[x,y]=(*(round(c*255) for c in rgb),a)
            changed+=1
assert changed>0
assert image.getchannel('A').tobytes()==original.getchannel('A').tobytes()
for y in range(image.height):
    for x in range(image.width):
        if not mask[x,y]:assert pixels[x,y]==original.getpixel((x,y))
image.save(root/'assets/concept-clean/restaurant-concept-v2.png')
print(f'Restaurant extracted from existing atlas; {changed} roof pixels recolored')
