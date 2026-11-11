"""hv-collage2.py — 獵魔村風格第二階段拼圖。
用法: python pipeline/scripts/ui-audit/hv-collage2.py
  讀 output/ui-audit/hv-after2/(第二階段)與 output/ui-audit/hv-after/(第一階段),產生
    output/ui-audit/hv-phase2-desktop.png   1440x900 六格(主 HUD、獵人格狀卡、選取建築的六角鈕、亮色對話框、倉庫、首領),每格 第一階段|第二階段,總寬 <= 2600
    output/ui-audit/hv-phase2-phone.png     390x844 五格(主 HUD、獵人、選取六角鈕、對話框、倉庫)＋ 844x390 兩格(建設、首領),只放第二階段
    output/ui-audit/hv-phase2-allpanels.png 1440x900 其餘面板縮圖總覽(每張約 640 寬)
  第一階段沒有的畫面(亮色對話框)用 hv-wip/(第一階段收尾時的截圖)當對照;選取六角鈕的第一階段對照是「點建築直接開右側面板」。
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
P1 = ROOT / 'output/ui-audit/hv-after'
P1B = ROOT / 'output/ui-audit/hv-wip'
P2 = ROOT / 'output/ui-audit/hv-after2'
OUT = ROOT / 'output/ui-audit'
BG = (24, 21, 19)
FG = (244, 236, 214)


def font(n):
    for f in ('C:/Windows/Fonts/msjhbd.ttc', 'C:/Windows/Fonts/msjh.ttc', 'C:/Windows/Fonts/arial.ttf'):
        try:
            return ImageFont.truetype(f, n)
        except OSError:
            pass
    return ImageFont.load_default()


def fit(path, w):
    im = Image.open(path).convert('RGB')
    return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)


def desktop():
    cw, gap, lab = 1270, 20, 40
    rows = [
        ('主 HUD', P1 / '1440x900-hud.png', P2 / '1440x900-hud.png', '第一階段', '第二階段'),
        ('獵人名冊(格狀肖像卡)', P1 / '1440x900-hunters.png', P2 / '1440x900-hunters.png', '第一階段', '第二階段'),
        ('選取建築(腳下六角鈕)', P1 / '1440x900-inspector.png', P2 / '1440x900-select.png', '第一階段:點建築直接開面板', '第二階段:六角鈕'),
        ('亮色對話框(開場導覽)', P1B / '1440x900-welcome.png', P2 / '1440x900-welcome.png', '第一階段(收尾時)', '第二階段'),
        ('倉庫', P1 / '1440x900-inventory.png', P2 / '1440x900-inventory.png', '第一階段', '第二階段'),
        ('首領', P1 / '1440x900-boss.png', P2 / '1440x900-boss.png', '第一階段', '第二階段'),
    ]
    ch = round(900 * cw / 1440)
    W = cw * 2 + gap * 3
    H = len(rows) * (ch + lab + gap) + gap
    sheet = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(sheet)
    f = font(26)
    for i, (name, a, b, ta, tb) in enumerate(rows):
        y = gap + i * (ch + lab + gap)
        for j, (tag, src) in enumerate(((ta, a), (tb, b))):
            x = gap + j * (cw + gap)
            d.text((x, y + 4), f'1440x900 · {name} · {tag}', fill=FG, font=f)
            sheet.paste(fit(src, cw), (x, y + lab))
    p = OUT / 'hv-phase2-desktop.png'
    sheet.save(p)
    print(p, sheet.size)


def phone():
    cw, gap, lab = 390, 16, 34
    keys = [('主 HUD', 'hud'), ('獵人', 'hunters'), ('選取六角鈕', 'select'), ('亮色對話框', 'welcome'), ('倉庫', 'inventory')]
    ch = 844
    lw, lh = 844, 390
    W = max(len(keys) * cw + (len(keys) + 1) * gap, 2 * lw + 3 * gap)
    H = gap + lab + ch + gap + lab + lh + gap
    sheet = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(sheet)
    f = font(20)
    x = gap
    for name, key in keys:
        d.text((x, gap + 4), f'390x844 · {name}', fill=FG, font=f)
        sheet.paste(fit(P2 / f'390x844-{key}.png', cw), (x, gap + lab))
        x += cw + gap
    y = gap + lab + ch + gap
    for j, (name, key) in enumerate((('建設', 'build'), ('首領', 'boss'))):
        x = gap + j * (lw + gap)
        d.text((x, y + 4), f'844x390 橫向 · {name}', fill=FG, font=f)
        sheet.paste(fit(P2 / f'844x390-{key}.png', lw), (x, y + lab))
    p = OUT / 'hv-phase2-phone.png'
    sheet.save(p)
    print(p, sheet.size)


def allpanels():
    keys = [('build', '建設'), ('trade', '交易'), ('craft', '製作(生活)'), ('craftgear', '製作(裝備)'), ('dungeon', '地下城'), ('arena', '競技場'),
            ('quests', '委託'), ('settings', '設定'), ('help', '說明'), ('worldmap', '世界地圖'), ('mapregion', '地區詳情'), ('dispatch', '派遣隊伍'),
            ('recruit', '招募訪客'), ('hunter', '獵人詳情'), ('rostermenu', '獵人篩選展開'), ('offline', '離線戰報'), ('difficulty', '狩獵難度'),
            ('cmdk', '指令面板'), ('pilot', '手動操控'), ('inspector', '建築資訊'), ('unitcard', '單位小卡'), ('selhunter', '選取獵人六角鈕'),
            ('advisor', '顧問提示對話框'), ('confirm', '確認框'), ('toast', 'toast'), ('tooltip', 'tooltip')]
    keys = [(k, n) for k, n in keys if (P2 / f'1440x900-{k}.png').exists()]
    tw, gap, lab, cols = 630, 14, 30, 4
    th = round(900 * tw / 1440)
    rows = (len(keys) + cols - 1) // cols
    W = cols * tw + (cols + 1) * gap
    H = rows * (th + lab + gap) + gap
    sheet = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(sheet)
    f = font(20)
    for i, (k, n) in enumerate(keys):
        x = gap + (i % cols) * (tw + gap)
        y = gap + (i // cols) * (th + lab + gap)
        d.text((x, y + 4), f'1440x900 · {n}', fill=FG, font=f)
        sheet.paste(fit(P2 / f'1440x900-{k}.png', tw), (x, y + lab))
    p = OUT / 'hv-phase2-allpanels.png'
    sheet.save(p)
    print(p, sheet.size)


desktop()
phone()
allpanels()
