import json
from pathlib import Path
from PIL import Image

root=Path(__file__).resolve().parents[2]
manifest=json.loads((root/'assets/buildings@2x.manifest.json').read_text(encoding='utf-8'))
cell=manifest['cells']['enhancement']
with Image.open(root/'assets'/manifest['image']) as sheet:
    image=sheet.crop((cell['x'],cell['y'],cell['x']+cell['w'],cell['y']+cell['h']))
image.save(root/'assets/concept-clean/enhancement-concept-v2.png')
print('Red-roof refinement workshop restored from existing building atlas')
