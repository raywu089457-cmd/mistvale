import json
from pathlib import Path
from PIL import Image

source=Path('C:/Users/ray/sprite-demo/buildings-poc/hero-atlas')
target=Path(__file__).resolve().parents[2]/'assets'
manifest=json.loads((source/'hero@2x.manifest.json').read_text(encoding='utf-8'))
image=Image.open(source/'hero@2x.png').convert('RGBA')
sheet=Image.new('RGBA',(184,148))
cells={}
for i,(name,cell) in enumerate(manifest['cells'].items()):
    crop=image.crop((cell['x'],cell['y'],cell['x']+cell['w'],cell['y']+cell['h']))
    ratio=min(56/crop.width,68/crop.height)
    crop=crop.resize((round(crop.width*ratio),round(crop.height*ratio)),Image.Resampling.LANCZOS)
    x,y=4+(i%3)*60,4+(i//3)*72
    sheet.paste(crop,(x,y))
    cells[name]={'x':x,'y':y,'w':crop.width,'h':crop.height,'anchor':[crop.width/2,crop.height]}
sheet.save(target/'hero@2x.png')
manifest.update(image='hero@2x.png',sheetWidth=184,sheetHeight=148,cellWidth=60,cellHeight=72,cells=cells,scale=.28)
(target/'hero@2x.manifest.json').write_text(json.dumps(manifest,indent=1),encoding='utf-8')
print('Restored six 2x hero frames from existing source artwork')
