import json
from pathlib import Path
from PIL import Image

assets = Path(__file__).resolve().parents[2] / 'assets'
for path in sorted(assets.glob('*.manifest.json')):
    manifest = json.loads(path.read_text(encoding='utf-8'))
    with Image.open(assets / manifest['image']) as image:
        width, height = image.size
    assert (width, height) == (manifest['sheetWidth'], manifest['sheetHeight']), path.name
    for name, rect in manifest['cells'].items():
        assert rect['x'] >= 0 and rect['y'] >= 0, (path.name, name)
        assert rect['w'] > 0 and rect['h'] > 0, (path.name, name)
        assert rect['x'] + rect['w'] <= width and rect['y'] + rect['h'] <= height, (path.name, name)
    print(f'PASS {path.name}: {len(manifest["cells"])} frames inside {width}x{height}')
