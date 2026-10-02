from pathlib import Path
from PIL import Image

root=Path(__file__).resolve().parents[2]
for path in sorted((root/'assets/concept-clean').glob('*.png')):
    image=Image.open(path).convert('RGBA')
    pixels=list(image.get_flattened_data())
    opaque=[p for p in pixels if p[3]>0]
    assert opaque, path.name
    magenta=sum(1 for r,g,b,a in opaque if r>245 and b>245 and g<15)
    assert magenta==0, (path.name,magenta)
    alpha=sum(1 for p in pixels if p[3]==0)
    print(f'PASS {path.name}: opaque={len(opaque)} transparent={alpha} magenta={magenta}')
