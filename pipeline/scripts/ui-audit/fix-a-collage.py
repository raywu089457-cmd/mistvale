# fix-a-collage.py — 把 output/ui-audit/fix-a/cells/NN-*.png 拼成 output/ui-audit/fix-a/after.png(4 欄,每格標編號與說明)
import glob, os
from PIL import Image, ImageDraw, ImageFont

root = os.path.join(os.path.dirname(__file__), '..', '..', '..')
cells = sorted(glob.glob(os.path.join(root, 'output/ui-audit/fix-a/cells/*.png')))
LABEL = {
    '01': 'B1 手機 出征小隊 HUD 在底部、撤退鈕可點',
    '02': 'B9 橫向 小隊 HUD 夾在任務欄與徽章之間、按鈕 44px',
    '03': 'B2+缺口12 手機 放置提示=小浮動條、暫停標籤不重疊',
    '04': 'B3 手機 手動操控選角=底部抽屜、頂欄可點',
    '05': 'B4 手機 小卡 X=44px、不蓋縮放鈕',
    '06': 'toast 手機 面板關閉:頁籤列上方、不蓋縮放鈕',
    '07': 'toast 手機 面板開著:避開按鈕中心',
    '08': 'toast 平板 面板開著:不在畫面中央、不蓋按鈕',
    '09': 'B7 橫向 離線戰報 收下鈕黏在底部一屏內',
    '10': '缺口8 橫向 難度色帶與任務標題不重疊',
    '11': '缺口20 手機 任務追蹤不壓日期標籤',
    '12': 'B5 手機 新玩家標題只有「開始遊戲」',
}
def font(sz):
    for f in ('C:/Windows/Fonts/msjh.ttc', 'C:/Windows/Fonts/msyh.ttc', 'C:/Windows/Fonts/mingliu.ttc'):
        if os.path.exists(f):
            return ImageFont.truetype(f, sz)
    return ImageFont.load_default()
F = font(15)
CW, CH, PAD, HEAD = 460, 520, 10, 26
cols = 4
rows = (len(cells) + cols - 1) // cols
out = Image.new('RGB', (cols * (CW + PAD) + PAD, rows * (CH + HEAD + PAD) + PAD), (24, 22, 20))
d = ImageDraw.Draw(out)
for i, p in enumerate(cells):
    key = os.path.basename(p)[:2]
    im = Image.open(p).convert('RGB')
    s = min(CW / im.width, CH / im.height)
    im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
    x = PAD + (i % cols) * (CW + PAD)
    y = PAD + (i // cols) * (CH + HEAD + PAD)
    d.rectangle([x, y, x + CW, y + CH + HEAD], fill=(40, 36, 32))
    d.text((x + 6, y + 4), f"{int(key)}  {LABEL.get(key, os.path.basename(p))}", fill=(244, 236, 214), font=F)
    out.paste(im, (x + (CW - im.width) // 2, y + HEAD + (CH - im.height) // 2))
dest = os.path.join(root, 'output/ui-audit/fix-a/after.png')
out.save(dest)
print(dest, out.size)
