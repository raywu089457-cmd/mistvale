"""Pull the shorts' back bulge into the body on the snapped east sprite and mirror it to west.

    python pipeline/scripts/l0veyou/fix_side_ref.py <snap_dir>

PixelLab read the cloth patch sticking out behind the hips (east rows 24-28, cols 0-2, peeking out
behind the hanging arm) as a backpack and drew a brown wedge on the back. Here the outline moves back
to the body line (col 1), the patch becomes skin, a stray cloth pixel on the back of the thigh too.
west = mirrored east, so both side views stay identical.
"""
import sys
from pathlib import Path
from PIL import Image, ImageOps

d = Path(sys.argv[1])
im = Image.open(d / 'east-clean.png').convert('RGBA')
px = im.load()
outline = px[1, 23]
def skin(x, y):
    for xx in range(x + 1, x + 4):
        r, g, b, a = px[xx, y]
        if a and r >= 175: return px[xx, y]
    return px[4, y]
for y in range(24, 29):
    px[0, y] = (0, 0, 0, 0)
    px[1, y] = outline
    px[2, y] = skin(2, y)
r, g, b, a = px[3, 30]
if a and r < 130: px[3, 30] = skin(3, 30)
im.save(d / 'east-fixed.png')
ImageOps.mirror(im).save(d / 'west-fixed.png')
print('outline', outline, '-> east-fixed.png, west-fixed.png')
