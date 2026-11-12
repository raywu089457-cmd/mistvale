"""round3-mobile-collage.py -> output/ui-audit/round3-mobile/bugs.png (R1..R12)"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT = Path(__file__).resolve().parents[3]
R = ROOT / 'output/ui-audit/round3-mobile'
G = R / 'gap/shots'
def f(n):
    for p in ('C:/Windows/Fonts/msjhbd.ttc', 'C:/Windows/Fonts/msjh.ttc', 'C:/Windows/Fonts/arial.ttf'):
        try: return ImageFont.truetype(p, n)
        except OSError: pass
    return ImageFont.load_default()
S = R / 'sheets'
CELLS = [  # id, file, title, crop(0..1) or None
 ('R1', R/'new/l740x360/run-hud.png', '740x360 / 667x375 出征HUD:縮放鈕壓住第3位獵人血條與撤退區', (0,0.5,1,1)),
 ('R2', R/'safe-port/shots/390x844/building-inspector-hall.png', '390x844 瀏海下緣34px:建築抽屜底被頁籤列蓋住,「移動位置」被切', (0,0.35,1,1)),
 ('R3', R/'safe-land/shots/844x390/building-inspector-hall.png', '844x390 左右安全區47px:面板/抽屜貼邊,X 與按鈕落在瀏海區', None),
 ('R4', R/'sheets/worldmap-land.png', '667x375 / 740x360 世界地圖預覽放大3倍被裁(629x590塞進223px),844 正常', (0,0,0.4,1)),
 ('R5', R/'primary/shots/m430x932-dungeon.png', '全手機 地下城/競技場「出征/開始」鈕在內容尾端要捲(top 872-1012)', (0,0.1,1,0.95)),
 ('R6', R/'sheets/unit-card-land.png', '667x375 / 740x360 獵人小卡寬640 蓋住縮放鈕/行動徽章/任務', (0,0,0.3,1)),
 ('R7', R/'primary/shots/l740x360-recruit.png', '740x360 / 667x375 招募鈕被頁籤列蓋;首領面板底超出頁籤列8px', None),
 ('R8', G/'768x1024/trade.png', '768x1024 / 1024x768 觸控平板用桌機尺寸:X 32px、±32px、暫停40px', (0,0,1,0.6)),
 ('R9', G/'768x1024/pilot-pick.png', '768x1024 / 1024x768 手動操控選角清單蓋住資源/暫停/縮放,鈕26px', (0,0,1,0.45)),
 ('R10', R/'sheets/left-panel-land.png', '667x375 / 740x360 村長委託面板底被頁籤列切到', (0,0,0.38,1)),
 ('R11', G/'360x640/hud-day.png', '360x640 / 375x667 頂欄+任務+通知占約45%高;右側標籤壓地圖地名', (0,0,1,0.75)),
 ('R12', G/'375x667/building-inspector-hall.png', '375x667 / 360x640 建築抽屜蓋掉左側任務行(#hv-left 重疊 250x77~121)', (0,0,1,0.6)),
]
CW, CH, LAB, GAP, COLS = 600, 470, 56, 12, 4
rows = (len(CELLS) + COLS - 1) // COLS
W = COLS * (CW + GAP) + GAP; H = rows * (CH + LAB + GAP) + GAP + 50
out = Image.new('RGB', (W, H), (24, 21, 19)); d = ImageDraw.Draw(out)
d.text((GAP, 10), '暮影村 手機版面稽核 round3 · 最重要的12個問題(編號對應回報)', fill=(244, 236, 214), font=f(26))
for i, (cid, p, title, crop) in enumerate(CELLS):
    x = GAP + (i % COLS) * (CW + GAP); y = 50 + GAP + (i // COLS) * (CH + LAB + GAP)
    d.rectangle([x, y, x + CW, y + CH + LAB], fill=(40, 36, 32))
    d.rectangle([x, y, x + 64, y + 40], fill=(200, 70, 55)); d.text((x + 8, y + 6), cid, fill=(255, 255, 255), font=f(24))
    d.text((x + 72, y + 4), title[:30], fill=(244, 236, 214), font=f(16)); d.text((x + 72, y + 26), title[30:62], fill=(244, 236, 214), font=f(16))
    try:
        im = Image.open(p).convert('RGB')
        if crop:
            w, h = im.size; im = im.crop((int(w*crop[0]), int(h*crop[1]), int(w*crop[2]), int(h*crop[3])))
        k = min(CW / im.width, CH / im.height); im = im.resize((max(1, int(im.width*k)), max(1, int(im.height*k))))
        out.paste(im, (x + (CW - im.width)//2, y + LAB + (CH - im.height)//2))
    except Exception as e:
        d.text((x + 10, y + LAB + 10), 'missing ' + str(p.name), fill=(255, 120, 120), font=f(18))
out.save(R / 'bugs.png'); print(out.size)
