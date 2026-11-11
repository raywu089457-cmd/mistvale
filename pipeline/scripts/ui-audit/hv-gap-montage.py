# hv-gap-montage.py — 最嚴重缺口拼圖(編號對應 output/ui-audit/hv-gap/report.md)
from PIL import Image, ImageDraw, ImageFont
import os
B = 'output/ui-audit/hv-gap/shots'
cells = [
 (1, '載入畫面:木板+金框+金色進度條(390)', '390x844/loading.png', (0, 560, 780, 1130)),
 (2, '標題畫面橫向高401>視窗390,上下被切(844x390)', '844x390/title.png', None),
 (3, '舊 #left-panel:border-image棕底(1440)', '1440x900/left-panel.png', (0, 100, 560, 760)),
 (4, '面板開著時 toast 蓋住面板頂端(390)', '390x844/toast-modal.png', (0, 200, 780, 760)),
 (5, '#inspector 提示字擠成窄欄、右留8px縫(390)', '390x844/building-inspector-hall.png', (0, 260, 780, 1100)),
 (6, '獵人格手機 3 欄(規格 4 欄)(390)', '390x844/hunters.png', (0, 220, 780, 1100)),
 (7, '#unit-card 蓋縮放鈕、關閉鈕26px<44(390)', '390x844/unit-card.png', (0, 1150, 780, 1688)),
 (8, '橫向:徽記「初級」壓住任務標題(844x390)', '844x390/hud-day.png', (0, 0, 900, 420)),
 (9, '標題:16px圓角磨砂框+金箔按鈕(1440)', '1440x900/title.png', (440, 280, 1000, 720)),
 (10, '交易列4顆按鈕,非單一主按鈕(1440)', '1440x900/trade.png', (240, 224, 1200, 830)),
 (11, '低對比:按鈕副標3.2-3.9:1、kbd 2.99:1', '1440x900/hunter-detail.png', (240, 700, 1200, 900)),
 (12, '移動建築條:全寬實心,蓋縮放鈕(390)', '390x844/placement.png', (0, 1380, 780, 1688)),
]
CW, CH, CAP = 520, 400, 44
cols = 4; rows = (len(cells) + cols - 1) // cols
sheet = Image.new('RGB', (cols * CW, rows * (CH + CAP)), (30, 28, 26))
d = ImageDraw.Draw(sheet)
try:
    f = ImageFont.truetype('C:/Windows/Fonts/msjh.ttc', 16); fb = ImageFont.truetype('C:/Windows/Fonts/msjhbd.ttc', 22)
except Exception:
    f = fb = ImageFont.load_default()
for k, (n, cap, p, crop) in enumerate(cells):
    im = Image.open(os.path.join(B, p)).convert('RGB')
    if crop: im = im.crop(crop)
    s = min((CW - 8) / im.width, (CH - 8) / im.height)
    im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
    x, y = (k % cols) * CW, (k // cols) * (CH + CAP)
    sheet.paste(im, (x + (CW - im.width) // 2, y + 4 + (CH - 8 - im.height) // 2))
    d.rectangle([x, y + CH, x + CW - 1, y + CH + CAP - 1], fill=(60, 20, 16))
    d.text((x + 8, y + CH + 8), str(n), fill=(255, 220, 120), font=fb)
    # 拆兩行
    t = cap
    d.text((x + 46, y + CH + 4), t[:27], fill=(240, 232, 214), font=f)
    d.text((x + 46, y + CH + 24), t[27:54], fill=(240, 232, 214), font=f)
    d.rectangle([x, y, x + CW - 1, y + CH + CAP - 1], outline=(90, 80, 70))
sheet.save('output/ui-audit/hv-gap/gaps.png'); print(sheet.size)
