"""hv-collage.py — 獵魔村風格第一階段改前/改後拼圖。
用法: python pipeline/scripts/ui-audit/hv-collage.py
  讀 output/ui-audit/theme-before/ 與 output/ui-audit/hv-after/,
  產生 output/ui-audit/hv-phase1-desktop.png(1440x900 主 HUD/建設/獵人/首領,每列改前|改後,總寬 <= 2600)
  與 output/ui-audit/hv-phase1-phone.png(390x844 主 HUD/建設/獵人 改前|改後,加一格 844x390 主 HUD 改後)。
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
BEFORE = ROOT / 'output/ui-audit/theme-before'
AFTER = ROOT / 'output/ui-audit/hv-after'
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
    rows = [('主 HUD', 'hud'), ('建設', 'build'), ('獵人', 'hunters'), ('首領', 'boss')]
    ch = round(900 * cw / 1440)
    W = cw * 2 + gap * 3
    H = len(rows) * (ch + lab + gap) + gap
    sheet = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(sheet)
    f = font(26)
    for i, (name, key) in enumerate(rows):
        y = gap + i * (ch + lab + gap)
        for j, (tag, src) in enumerate((('改前', BEFORE), ('改後', AFTER))):
            x = gap + j * (cw + gap)
            d.text((x, y + 4), f'1440x900 · {name} · {tag}', fill=FG, font=f)
            sheet.paste(fit(src / f'1440x900-{key}.png', cw), (x, y + lab))
    p = OUT / 'hv-phase1-desktop.png'
    sheet.save(p)
    print(p, sheet.size)


def phone():
    cw, gap, lab = 390, 16, 34
    keys = [('主 HUD', 'hud'), ('建設', 'build'), ('獵人', 'hunters')]
    ch = 844
    W = 6 * cw + 7 * gap
    lw = 844
    lh = 390
    H = gap + lab + ch + gap + lab + lh + gap
    sheet = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(sheet)
    f = font(20)
    x = gap
    for name, key in keys:
        for tag, src in (('改前', BEFORE), ('改後', AFTER)):
            d.text((x, gap + 4), f'390x844 · {name} · {tag}', fill=FG, font=f)
            sheet.paste(fit(src / f'390x844-{key}.png', cw), (x, gap + lab))
            x += cw + gap
    y = gap + lab + ch + gap
    d.text((gap, y + 4), '844x390 橫向 · 主 HUD · 改前', fill=FG, font=f)
    sheet.paste(fit(BEFORE / '844x390-hud.png', lw), (gap, y + lab))
    d.text((gap * 2 + lw, y + 4), '844x390 橫向 · 主 HUD · 改後', fill=FG, font=f)
    sheet.paste(fit(AFTER / '844x390-hud.png', lw), (gap * 2 + lw, y + lab))
    p = OUT / 'hv-phase1-phone.png'
    sheet.save(p)
    print(p, sheet.size)


desktop()
phone()
