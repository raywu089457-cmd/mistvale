"""村門 sprite 去雜物:只留門柱、茅草頂、旗幟與石座,拿掉兩側尖樁柵欄和中間泥土地。
(尖樁跟村子四周的橫木柵欄不是同一種;泥土地蓋掉了底下的石板路。)
作用在 assets/props@2x.png 的 gate cell(0,0,360,360),再用 LANCZOS+alpha 二值化縮成 props@1x 的 gate cell(0,0,180,180)。
可重複執行:已清掉的像素是透明,不會再被動到。
"""
import numpy as np
from PIL import Image
from pathlib import Path

A = Path(__file__).resolve().parents[3] / "assets"
N = 360

def clean(cell: np.ndarray) -> np.ndarray:
    a = cell.copy()
    ys, xs = np.mgrid[0:N, 0:N]
    r, g, b = (a[..., i].astype(int) for i in range(3))
    # 右門柱右側被尖樁蓋住的一條(x 270..281, y 237..297):用柱身左邊一格寬的紋路補回,x=282 補黑描邊。
    for y in range(237, 298):
        for x in range(270, 282):
            a[y, x] = a[y, x - 12]
        a[y, 282] = (20, 12, 8, 255)
    gone = np.zeros((N, N), bool)
    gone |= (xs <= 61) & (ys >= 175)                                   # 左尖樁
    gone |= (xs >= 283) & (ys >= 230) & (ys < 300)                     # 右尖樁(柱身以外)
    gone |= (xs >= 300) & (ys >= 230)
    left_base = (xs >= 60) & (xs <= 132) & (ys >= 236) & (ys <= 291)
    right_base = (xs >= 208) & (xs <= 300) & (ys >= 298) & (ys <= 342)
    mid = (xs >= 96) & (xs <= 218) & (ys >= 232) & (ys <= 340) & ~left_base
    mid |= (xs >= 96) & (xs <= 207) & (ys >= 298) & (ys <= 346)
    gone |= mid & ~left_base & ~right_base
    gone |= (xs >= 127) & (xs <= 218) & (ys >= 212) & (ys <= 232)      # 柱間殘留的細碎
    # 石座收成菱形(橢圓)外形,不留方形切邊;石座範圍內的橘色泥土一併去掉
    def ell(cx, cy, rx, ry):
        return ((xs - cx) / rx) ** 2 + ((ys - cy) / ry) ** 2 <= 1
    dirt = (r > 150) & (g > 80) & (b < 75) & (r - b > 90)
    gone |= left_base & (ys >= 255) & ~ell(96, 270, 40, 21)
    gone |= right_base & (ys >= 300) & ~ell(256, 320, 47, 24)
    gone |= (left_base | right_base) & (ys >= 262) & dirt & ~((xs >= 205) & (xs <= 285))
    gone |= (xs < 212) & (ys >= 292)
    gone |= (xs <= 66) & (ys >= 185) & (ys < 255)                      # 左柱外側殘留的尖樁描邊
    gone |= (ys > 342)
    a[gone, 3] = 0
    # 清掉剩下的零星小碎片(< 80 像素的獨立連通塊)
    from scipy import ndimage
    lab, n = ndimage.label(a[..., 3] > 0, structure=np.ones((3, 3)))
    sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
    for i, sz in enumerate(sizes, 1):
        if sz < 80:
            a[lab == i, 3] = 0
    return a

def main():
    p2 = A / "props@2x.png"
    im = Image.open(p2).convert("RGBA")
    arr = np.array(im)
    arr[:N, :N] = clean(arr[:N, :N])
    Image.fromarray(arr).save(p2)
    cell = Image.fromarray(arr[:N, :N])
    a = np.asarray(cell.resize((180, 180), Image.LANCZOS)).copy()
    a[..., 3] = np.where(a[..., 3] >= 128, 255, 0)
    p1 = A / "props@1x.png"
    im1 = Image.open(p1).convert("RGBA")
    arr1 = np.array(im1)
    arr1[:180, :180] = a
    Image.fromarray(arr1).save(p1)

if __name__ == "__main__":
    main()
