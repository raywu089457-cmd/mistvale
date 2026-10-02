from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[2]
source = root / 'output/imagegen'
target = root / 'assets/concept-clean'
target.mkdir(exist_ok=True)
for path in source.glob('*-concept-v2.png'):
    if path.stem.startswith('buildings-'):
        continue
    image = Image.open(path).convert('RGBA')
    original = image.copy()
    pixels = image.load()
    changed = 0
    # Smoke is confined to the top margin; preserve roof colors below it.
    limit = int(image.height * .15)
    for y in range(limit):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if a and r > g + 25 and b > g + 25 and r > 170 and b > 170:
                gray = max(r, b)
                pixels[x, y] = (gray, gray, max(0, gray - 8), a)
                changed += 1
    assert image.getchannel('A').tobytes() == original.getchannel('A').tobytes()
    assert image.crop((0, limit, image.width, image.height)).tobytes() == original.crop((0, limit, image.width, image.height)).tobytes()
    image.save(target / path.name)
    print(f'{path.name}: {changed} smoke pixels corrected; alpha and lower artwork preserved')
