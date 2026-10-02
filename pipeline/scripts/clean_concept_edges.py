from pathlib import Path
from PIL import Image, ImageFilter

assets=Path(__file__).resolve().parents[2]/'assets/concept-clean'
for path in sorted(assets.glob('*.png')):
    image=Image.open(path).convert('RGBA')
    original=image.copy()
    alpha=image.getchannel('A')
    interior=alpha.filter(ImageFilter.MinFilter(3))
    pixels=image.load()
    changed=0
    for y in range(image.height):
        for x in range(image.width):
            r,g,b,a=pixels[x,y]
            # Limit despill to the outer one-pixel contour, preserving purple
            # surfaces inside the artwork and the original alpha silhouette.
            if a and interior.getpixel((x,y))==0 and r>g+35 and b>g+35 and r>=b*.88:
                pixels[x,y]=(min(r,g+20),g,min(b,g+12),a)
                changed+=1
    assert alpha.tobytes()==image.getchannel('A').tobytes()
    for y in range(image.height):
        for x in range(image.width):
            if interior.getpixel((x,y))>0:
                assert pixels[x,y]==original.getpixel((x,y))
    image.save(path)
    print(f'{path.name}: {changed} contour pixels cleaned; interior and alpha preserved')
