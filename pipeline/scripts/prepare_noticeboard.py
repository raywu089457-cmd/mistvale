from pathlib import Path
from PIL import Image, ImageDraw

root=Path(__file__).resolve().parents[2]
source=Image.open(root/'assets/title.png').convert('RGBA')
board=source.crop((881,569,1045,652))
mask=Image.new('L',board.size)
ImageDraw.Draw(mask).polygon([(4,29),(35,8),(85,0),(119,8),(159,29),(157,48),(144,48),(144,97),(22,97),(22,48),(5,48)],fill=255)
board.putalpha(mask)
image=Image.new('RGBA',(184,148))
draw=ImageDraw.Draw(image)
draw.rectangle((32,77,155,105),fill='#664021')
draw.rectangle((34,80,153,102),fill='#97602e')
draw.rectangle((35,82,152,84),fill='#c99750')
draw.line((36,100,151,100),fill='#4b301e',width=2)
for y in (87,94):
    draw.line((36,y,151,y),fill='#6d4829',width=1)
for x in range(40,149,19):
    draw.line((x,85,x+9,85),fill='#b38245',width=1)
    draw.line((x+3,91,x+15,91),fill='#80502b',width=1)
    draw.rectangle((x,98,x+1,99),fill='#d0ad72')
# Reuse clean parchment notices from above the occluding character.
notice=source.crop((922,615,938,641))
image.paste(notice,(58,75))
image.paste(notice,(113,75))
for x in (32,147):
    draw.rectangle((x,94,x+8,141),fill='#4a2f1d')
    draw.rectangle((x+2,96,x+6,139),fill='#916131')
    draw.line((x+3,98,x+3,137),fill='#bc8847',width=1)
    draw.rectangle((x,118,x+8,121),fill='#45433a')
image.alpha_composite(board,(10,0))
assert image.getpixel((0,147))[3]==0
image.save(root/'assets/concept-clean/bounty-concept-v2.png')
print('Standalone noticeboard assembled from unoccluded concept artwork and timber posts')
