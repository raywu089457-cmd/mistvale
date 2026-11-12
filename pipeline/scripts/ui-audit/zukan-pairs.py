# 左:圖鑑原圖 右:我們(390x844)。用法: python zukan-pairs.py
from PIL import Image, ImageDraw, ImageFont
Z='output/ui-audit/zukan-cmp/src/%02d.jpg'; O='output/ui-audit/zukan-cmp/ours/390x844-%s.png'
F=ImageFont.truetype('C:/Windows/Fonts/msjh.ttc',17); Fs=ImageFont.truetype('C:/Windows/Fonts/msjh.ttc',13)
CW,CH=310,672
def fit(im):
    s=min(CW/im.width,CH/im.height,2.0); im=im.resize((max(1,int(im.width*s)),max(1,int(im.height*s))),Image.LANCZOS)
    c=Image.new('RGB',(CW,CH),(38,38,42)); c.paste(im,((CW-im.width)//2,(CH-im.height)//2)); return c
def sheet(out,pairs,cols=4):
    rows=(len(pairs)+cols-1)//cols; BW=CW*2+6; BH=CH+46
    S=Image.new('RGB',(cols*(BW+14),rows*(BH+10)),(20,20,22)); d=ImageDraw.Draw(S)
    for i,(title,z,o) in enumerate(pairs):
        x=(i%cols)*(BW+14); y=(i//cols)*(BH+10)
        d.text((x+4,y+2),title,font=F,fill=(255,225,120)); d.text((x+4,y+24),'圖鑑 %s'%z[1],font=Fs,fill=(170,200,255)); d.text((x+CW+10,y+24),'我們 390x844',font=Fs,fill=(255,170,170))
        S.paste(fit(Image.open(Z%z[0]).convert('RGB')),(x,y+44)); S.paste(fit(Image.open(O%o).convert('RGB')),(x+CW+6,y+44))
    S.save(out); print(out,S.size)
P1=[('1 主 HUD',(4,'戰鬥HUD完整佈局'),'hud'),
    ('2 頁籤列+背包抽屜(模式A)',(3,'背包子畫面'),'inventory'),
    ('3 獵人詳情(浮動視窗)',(12,'獵人卡-憂鬱瑪娜'),'hunter'),
    ('4 建築視窗(交易所)',(29,'建築-交易所'),'trade'),
    ('5 建築升級清單(生命之泉)',(23,'建築-生命之泉'),'inspector'),
    ('6 獵人排列/名冊',(19,'獵人-獵人排列'),'hunters'),
    ('7 新獵人到訪/招募',(39,'彈窗-新獵人到訪'),'recruit'),
    ('8 結算視窗/離線戰報',(8,'戰鬥-公會突襲成功'),'offline')]
P2=[('9 塔面板C/B/A/S ↔ 地下城',(25,'建築-遺忘塔'),'dungeon'),
    ('10 成就清單 ↔ 委託',(38,'系統-成就'),'quests'),
    ('11 確認彈窗',(36,'彈窗-小黑暗靈魂包確認'),'confirm'),
    ('12 新手引導氣泡 ↔ 歡迎',(0,'主畫面-新手引導氣泡'),'welcome'),
    ('13 世界內選取六角鈕',(1,'主畫面-村莊管理教學'),'selhunter'),
    ('14 突襲 HUD ↔ 首領',(6,'戰鬥-公會火龍突襲'),'boss'),
    ('15 獵人名冊卡 ↔ 派遣',(18,'獵人卡-火龍只會心碎重擊'),'dispatch'),
    ('16 說明/設定(圖鑑無)→最近:公會視窗',(31,'公會-主城公會'),'settings')]
sheet('output/ui-audit/zukan-cmp/pairs-1.png',P1); sheet('output/ui-audit/zukan-cmp/pairs-2.png',P2)
