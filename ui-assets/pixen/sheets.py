# sheets.py — 用 Pixen（create_image_pixen，1 generation/張）一次生多張 2×2 UI 零件表，走 PixelLab MCP。
# 用法: python sheets.py <表名> [<表名> ...]   → out/<表名>.png
# 帳號：PIXELLAB_TOKEN_FILE（預設 ~/.pixellab-token = 帳號 1，月額度 0、用每日紅利）
import base64, json, re, sys, time, pathlib, urllib.request
import mcp

sys.stdout.reconfigure(encoding='utf-8')
OUT = pathlib.Path(__file__).with_name('out'); OUT.mkdir(exist_ok=True)
GRID = ('Pixel art game UI kit sheet, strict 2x2 grid of 4 separate UI elements, one element centred in each 128x128 cell '
        'with empty transparent space around it, nothing overlapping, no text, no letters, no numbers, no symbols on the faces. ')
STYLE = (' Cozy medieval village RPG interface, dark walnut wood, brass and gold trim, warm brown palette, '
         'hard pixel edges, 1 pixel dark brown outline, front view, flat orthographic.')
SHEETS = {
    # 按鈕：寬扁、面要平（九宮格中間會被拉伸）
    'buttons': ('Top-left: wide flat horizontal button, warm gold face, thin dark wood border with small brass corner caps, plain flat face. '
                'Top-right: the same wide flat button with a plain medium brown wood face. '
                'Bottom-left: the same wide flat button with a dark red lacquer face. '
                'Bottom-right: small square button of dark wood with a brass X cross.', 11),
    # 外框：視窗（中間平滑深色，字才好讀）、卡片、分頁
    'frames': ('Top-left: large square window frame, thick dark walnut wood border with brass corner caps and small rivets, flat smooth dark brown centre, no planks in the centre. '
               'Top-right: small square card frame, thin dark wood border with tiny brass corner studs, flat smooth dark centre. '
               'Bottom-left: wide tab with rounded top corners, plain brown wood face, thin dark outline. '
               'Bottom-right: the same wide tab, highlighted, warm gold face with brass trim.', 23),
    # 進度條、提示條、下方選單方塊、標題緞帶
    'bars': ('Top-left: long thin horizontal progress bar, empty dark recessed trough with a brass rim. '
             'Top-right: square wooden tile button with brass corner caps, flat medium brown face. '
             'Bottom-left: wide flat notification plate, dark wood with a thin brass border. '
             'Bottom-right: wide red cloth ribbon banner with folded ends.', 37),
}


def text_of(res):
    return '\n'.join(c.get('text', '') for c in (res.get('result') or {}).get('content', []) if c.get('type') == 'text')


if __name__ == '__main__':
    mcp.init()
    jobs = {}
    for name in sys.argv[1:]:
        desc, seed = SHEETS[name]
        args = {'description': GRID + desc + STYLE, 'width': 256, 'height': 256, 'no_background': True,
                'outline': 'single color outline', 'detail': 'medium detail', 'seed': seed}
        res = mcp.rpc('tools/call', {'name': 'create_image_pixen', 'arguments': args})
        m = re.search(r'job_id:\s*([0-9a-f-]{36})', text_of(res))
        if not m: print(name, 'FAILED', text_of(res)[:500], res.get('error')); continue
        jobs[name] = m.group(1); print(name, 'queued', jobs[name])
    for name, jid in jobs.items():
        for _ in range(90):
            t = text_of(mcp.rpc('tools/call', {'name': 'get_image', 'arguments': {'job_id': jid}}))
            if 'status: completed' in t:
                url = re.search(r'download:\s*(\S+)', t).group(1)
                (OUT / f'{name}.png').write_bytes(urllib.request.urlopen(url, timeout=120).read())
                print(name, 'saved;', ' '.join(l for l in t.splitlines() if l.startswith(('charged', 'transparent'))))
                break
            if re.search(r'status: (failed|error)', t): print(name, 'FAILED', t[:400]); break
            time.sleep(4)
