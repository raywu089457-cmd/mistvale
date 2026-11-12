import sys
from PIL import Image, ImageDraw, ImageFont
# 用法: zukan-sheet.py out.png scale cols name1 name2 ...  (ours 目錄中的 390x844-<name>.png)
out=sys.argv[1]; sc=float(sys.argv[2]); cols=int(sys.argv[3]); names=sys.argv[4:]
d='output/ui-audit/zukan-cmp/ours/390x844-%s.png'
ims=[]
for n in names:
    im=Image.open(d%n).convert('RGB'); im=im.resize((int(390*sc),int(844*sc)),Image.LANCZOS)
    dr=ImageDraw.Draw(im); dr.rectangle((0,0,90,14),fill=(0,0,0)); dr.text((2,1),n,fill=(255,255,0)); ims.append(im)
w,h=ims[0].size; rows=(len(ims)+cols-1)//cols
S=Image.new('RGB',(cols*(w+4),rows*(h+4)),(50,50,50))
for i,im in enumerate(ims): S.paste(im,((i%cols)*(w+4),(i//cols)*(h+4)))
S.save(out); print(S.size)
