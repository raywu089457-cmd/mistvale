import sys
from PIL import Image
D='output/ui-audit/zukan-cmp/src/%02d.jpg'
def lum(p): return 0.299*p[0]+0.587*p[1]+0.114*p[2]
def edges(img, axis, fixed, thr=22, lo=0, hi=None, minrun=3):
    w,h=img.size; hi = hi or (w if axis=='x' else h)
    out=[]; prev=None
    for i in range(lo,hi):
        p = img.getpixel((i,fixed)) if axis=='x' else img.getpixel((fixed,i))
        if prev is not None and abs(lum(p)-lum(prev))>thr: out.append((i,'#%02x%02x%02x'%prev[:3],'#%02x%02x%02x'%p[:3]))
        prev=p
    return out
def px(n,x,y):
    im=Image.open(D%n).convert('RGB'); return '#%02x%02x%02x'%im.getpixel((x,y))
if __name__=='__main__':
    n=int(sys.argv[1]); axis=sys.argv[2]; fixed=int(sys.argv[3]); thr=int(sys.argv[4]) if len(sys.argv)>4 else 22
    lo=int(sys.argv[5]) if len(sys.argv)>5 else 0; hi=int(sys.argv[6]) if len(sys.argv)>6 else None
    im=Image.open(D%n).convert('RGB'); print(im.size)
    for e in edges(im,axis,fixed,thr,lo,hi): print(e)
