# make_mobile_ui.py — 手機版 UI 零件（2026-10-30）：跟桌機那套同一組配色，改成細框、小角釘、平面底，九宮格切片剛好落在整數像素上。
# 1. 畫 assets/ui/m-px-<名字>.png：一個「像素」= 6×6 圖片像素（iPhone DPR 3 剛好 1:1 不糊），CSS 用 2 CSS px 畫一個像素。
# 2. 改 src/pixel-style.css：用到這些零件的 border-image 切片／寬度改成變數（沒設變數時＝原本的值，桌機不變）；
#    檔尾「手機 UI 零件」區塊由本腳本重寫：html.ui-m（pixel-ui.js 在手機尺寸加上）時換切片、框寬。
# 用法: python -I pipeline/scripts/ui-mobile/make_mobile_ui.py   （改完要 npm run build）
import pathlib, re
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[3]
K, PX = 6, 2          # 圖片像素／美術像素、CSS px／美術像素
T = (0, 0, 0, 0)
def hx(s): return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4)) + (255,)
OUT = hx('170c0b')
W0, W1, Wm, W2 = hx('2d1a12'), hx('4a2d1e'), hx('3f2618'), hx('6b4026')        # 木頭：暗、主色、稍暗、亮
B0, B1, B2, B3 = hx('7a5418'), hx('c2922d'), hx('ddc24e'), hx('f3d994')        # 黃銅：暗→亮

class Art:
    def __init__(s, w, h): s.w, s.h, s.im = w, h, Image.new('RGBA', (w, h), T)
    def px(s, x, y, c):
        if 0 <= x < s.w and 0 <= y < s.h: s.im.putpixel((x, y), c)
    def rect(s, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1): s.px(x, y, c)
    def ring(s, i, top, left, bottom, right):
        for x in range(i, s.w - i): s.px(x, i, top); s.px(x, s.h - 1 - i, bottom)
        for y in range(i + 1, s.h - 1 - i): s.px(i, y, left); s.px(s.w - 1 - i, y, right)
    def corners_clear(s):
        for x, y in ((0, 0), (s.w - 1, 0), (0, s.h - 1), (s.w - 1, s.h - 1)): s.px(x, y, T)
    def save(s, name):
        s.im.resize((s.w * K, s.h * K), Image.NEAREST).save(ROOT / 'assets/ui' / f'm-px-{name}.png', optimize=True)

def stud(a, x, y):      # 2×2 小角釘
    a.px(x, y, B3); a.px(x + 1, y, B2); a.px(x, y + 1, B1); a.px(x + 1, y + 1, B0)

def window():           # 彈窗外框：4 像素木框＋5×5 黃銅角片，內底＝#modal 的底色
    a = Art(24, 24); a.rect(0, 0, 23, 23, hx('2a1609'))
    a.ring(0, OUT, OUT, OUT, OUT); a.ring(1, W2, W2, W0, W0); a.ring(2, W1, W1, W1, W1); a.ring(3, W1, W1, Wm, Wm)
    a.ring(4, OUT, OUT, OUT, OUT); a.ring(5, hx('1f1007'), hx('1f1007'), hx('2a1609'), hx('2a1609'))
    # 四角＝L 形黃銅包角（6 像素長、外描深色），比方塊角片更像「框」
    for fx in (0, 1):
        for fy in (0, 1):
            X = lambda x: 23 - x if fx else x
            Y = lambda y: 23 - y if fy else y
            for x in range(6):
                for y in range(6):
                    if x < 3 or y < 3: a.px(X(x), Y(y), OUT)
            for i in range(1, 5): a.px(X(i), Y(1), B2 if not fy else B1); a.px(X(1), Y(i), B2 if not fx else B1)
            a.px(X(1), Y(1), B3); a.px(X(4), Y(1), B0); a.px(X(1), Y(4), B0)
    a.corners_clear(); a.save('window'); return 6

def card():             # 卡片：2 像素木框＋小角釘
    a = Art(16, 16); a.rect(0, 0, 15, 15, hx('3b2416'))
    a.ring(0, OUT, OUT, OUT, OUT); a.ring(1, W2, W2, W0, W0); a.ring(2, W1, W1, Wm, Wm); a.ring(3, OUT, OUT, OUT, OUT)
    for x, y in ((1, 1), (13, 1), (1, 13), (13, 13)): stud(a, x, y)
    a.corners_clear(); a.save('card'); return 4

def tile(on):           # 清單格／選中格
    a = Art(16, 16)
    if on: a.rect(0, 0, 15, 15, hx('d2a73a')); a.ring(0, OUT, OUT, OUT, OUT); a.ring(1, B3, B3, B0, B0); a.ring(2, B2, B2, B1, B1); a.ring(3, hx('e6c867'), hx('e6c867'), hx('b98f33'), hx('b98f33'))
    else: a.rect(0, 0, 15, 15, hx('45301f')); a.ring(0, OUT, OUT, OUT, OUT); a.ring(1, hx('5e4231'), hx('5e4231'), hx('2b1a13'), hx('2b1a13')); a.ring(2, hx('4f3627'), hx('4f3627'), hx('3a271c'), hx('3a271c')); a.ring(3, hx('35211c'), hx('35211c'), hx('45301f'), hx('45301f'))
    for x, y in ((1, 1), (13, 1), (1, 13), (13, 13)): stud(a, x, y)
    a.corners_clear(); a.save('tile-on' if on else 'tile'); return 4

def button(name, fill, hi, sh, lip):   # 按鈕：平面、上緣亮線、下緣 2 像素厚度（看得出能按），不放鉚釘
    a = Art(24, 12); a.rect(1, 1, 22, 10, fill); a.ring(0, OUT, OUT, OUT, OUT)
    for x in range(1, 23): a.px(x, 1, hi); a.px(x, 9, sh); a.px(x, 10, lip)
    for y in range(2, 9): a.px(1, y, hi); a.px(22, y, sh)
    a.corners_clear(); a.save(name); return 4

def close_x():          # 關閉鍵：方形木鍵＋金色 X（整張拉伸當背景用）
    a = Art(20, 20); fill, hi, sh, lip = hx('754521'), hx('9a6232'), hx('4a2610'), hx('3a1d0c')
    a.rect(1, 1, 18, 18, fill); a.ring(0, OUT, OUT, OUT, OUT)
    for x in range(1, 19): a.px(x, 1, hi); a.px(x, 17, sh); a.px(x, 18, lip)
    for y in range(2, 17): a.px(1, y, hi); a.px(18, y, sh)
    for t in range(9):
        for dx in (0, 1):
            a.px(5 + t + dx, 5 + t, B0); a.px(13 - t + dx, 5 + t, B0)       # 影子（往下一格）
    for t in range(9):
        for dx in (0, 1):
            a.px(5 + t + dx, 4 + t, B2); a.px(13 - t + dx, 4 + t, B2)
    a.corners_clear(); a.save('btn-x')

def toast(name, top, mid, bot):        # 提示：細黃銅（或紅）邊、深色底
    a = Art(16, 12); a.rect(0, 0, 15, 11, hx('3a2618'))
    a.ring(0, OUT, OUT, OUT, OUT); a.ring(1, top, mid, bot, mid); a.ring(2, OUT, OUT, OUT, OUT); a.ring(3, hx('2d1d14'), hx('2d1d14'), hx('3a2618'), hx('3a2618'))
    a.corners_clear(); a.save(name); return 4

slices = {'window': window(), 'card': card(), 'tile': tile(False), 'tile-on': tile(True),
          'btn-wood': button('btn-wood', hx('754521'), hx('9a6232'), hx('4a2610'), hx('3a1d0c')),
          'btn-gold': button('btn-gold', hx('d2a73a'), hx('f3d994'), hx('9c7225'), hx('7a5418')),
          'btn-red': button('btn-red', hx('711e1c'), hx('a5454a'), hx('531617'), hx('3c0f10')),
          'toast': toast('toast', B2, B1, B0), 'toast-err': toast('toast-err', hx('c0555b'), hx('943b40'), hx('531617'))}
close_x()

# ---- CSS ----
css_path = ROOT / 'src/pixel-style.css'
css = open(css_path, encoding='utf-8', newline='').read()   # 保留 CRLF
names = '|'.join(sorted(map(re.escape, slices), key=len, reverse=True))
# border-image: var(--ui-px-card) 16 fill stretch → var(--ui-px-card) var(--sl-card,16) fill / var(--biw-card,1) stretch（已改過的不再動）
css = re.sub(rf'var\(--ui-px-({names})\) (\d+)( fill)? stretch', lambda m: f'var(--ui-px-{m[1]}) var(--sl-{m[1]},{m[2]}){m[3] or ""} / var(--biw-{m[1]},1) stretch', css)
START, END = '/* 2026-10-30 手機 UI 零件（make_mobile_ui.py 產生，別手改） */', '/* 手機 UI 零件 end */'
css = re.sub(re.escape(START) + r'.*?' + re.escape(END) + r'\r?\n?', '', css, flags=re.S)
body = css
sel = {n: [] for n in slices}
body = re.sub(r'/\*.*?\*/', '', body, flags=re.S)   # 選擇器前面的註解不要帶進來
for m in re.finditer(r'([^{}]+)\{([^{}]*)\}', body):
    for n in slices:
        if re.search(rf'border-image:\s*var\(--ui-px-{re.escape(n)}\)', m[2]):
            sel[n] += [s.strip() for s in m[1].split(',') if s.strip() and not s.strip().startswith('@')]
nl = '\r\n' if '\r\n' in css else '\n'
lines = [START, 'html.ui-m{' + ';'.join(f'--sl-{n}:{s * K};--biw-{n}:{s * PX}px' for n, s in slices.items()) + '}']
for n, s in slices.items():
    if sel[n]: lines.append(f'html.ui-m :is({",".join(dict.fromkeys(sel[n]))}){{border-width:{s * PX}px}}')
lines.append(END)
css = css.rstrip('\r\n') + nl + nl.join(lines) + nl
css_path.write_text(css, encoding='utf-8', newline='')
print('slices', slices); print({n: len(v) for n, v in sel.items()})
