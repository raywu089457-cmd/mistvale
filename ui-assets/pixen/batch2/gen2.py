# gen2.py — 第二批 Pixen 素材（帳號 2：~/.pixellab-token2）。每張 1 generation。
# 用法: python gen2.py <名稱> [<名稱> ...]   → out2/<名稱>.png
import re, sys, time, pathlib, urllib.request, os
os.environ.setdefault('PIXELLAB_TOKEN_FILE', os.path.expanduser('~/.pixellab-token2'))
import mcp

sys.stdout.reconfigure(encoding='utf-8')
OUT = pathlib.Path(__file__).with_name('out2'); OUT.mkdir(exist_ok=True)
ICON = ('Pixel art game icon sheet, strict 4x4 grid of 16 separate icons, one icon centred in each 32x32 cell, '
        'nothing overlapping, no text, no letters, no numbers, no frames or boxes around the icons. '
        'Bold readable silhouettes, 1 pixel dark brown outline, 3 to 4 shades per material, warm cozy medieval fantasy palette, '
        'front view, hard pixel edges. ')
JOBS = {
    # 下方選單、資源、常用功能
    'icons1': dict(w=128, h=128, bg=True, seed=101, desc=ICON +
        'Row 1: blacksmith hammer; hunter helmet with feather; two curved arrows exchanging (trade); iron anvil. '
        'Row 2: stone dungeon archway with dark door; two crossed swords; rolled parchment scroll with red seal; folded treasure map. '
        'Row 3: shiny gold coin; blue faceted gemstone; stack of three wooden logs; grey iron ore rock with metal flecks. '
        'Row 4: brass cog gear; white horned skull; curved war horn; small wooden town hall house with red roof.'),
    # 材料、物資、狀態
    'icons2': dict(w=128, h=128, bg=True, seed=102, desc=ICON +
        'Row 1: green herb sprig with leaves; folded beige linen cloth; small flour sack; brown leather hide. '
        'Row 2: loaf of baked bread; wooden mug of red berry juice; small bed with red blanket; rolled white bandage. '
        'Row 3: red heart with white cross (healing); golden star; green upward arrow; brass plus sign. '
        'Row 4: red X cross; brass right arrow; horned red demon head (boss); brown leather backpack.'),
    # 補：獵人、交易重做＋常用小圖示
    'icons3': dict(w=128, h=128, bg=True, seed=108, desc=ICON +
        'Row 1: head and shoulders of a hooded hunter with a bow on his back; brass balance scale; leather coin pouch with gold coins; three small villager heads (population). '
        'Row 2: wooden quest notice board with papers; golden trophy cup; small red potion bottle; iron padlock. '
        'Row 3: green check mark; question mark in a brass circle; red flag on a pole; wrapped gift box with ribbon. '
        'Row 4: brass compass; burning torch; open wooden treasure chest with gold; magnifying glass.'),
    # 區域徽章 8＋職業徽章 6＋地下城、競技場
    'emblems': dict(w=256, h=256, bg=True, seed=103, desc=
        'Pixel art round badge emblem sheet, strict 4x4 grid of 16 separate circular emblems, one centred in each 64x64 cell, '
        'each emblem a round medallion with a thin brass rim and a small scene inside, nothing overlapping, no text, no letters. '
        'Row 1: cozy village houses; green flower meadow with sheep; white birch trees with pink flowers; dark oak forest. '
        'Row 2: snowy pine taiga; golden desert dunes with cactus; snowfield with ice; grey rocky mountain peak. '
        'Row 3: crossed great axe (berserker); shield with golden cross (paladin); purple crystal staff (sorcerer); bow and arrow (archer). '
        'Row 4: twin daggers (assassin); white holy staff with light (priest); stone dungeon gate; arena with crossed spears. '
        'Warm cozy medieval fantasy palette, 1 pixel dark outline, hard pixel edges, front view.'),
    # 難度 5 級＋狀態圖示
    'status': dict(w=128, h=128, bg=True, seed=104, desc=ICON +
        'Row 1: small green slime face (easy); orange goblin face; red horned skull; purple skull with flames. '
        'Row 2: black demon skull with crown and fire (nightmare); red heart (health); bread slice (hunger); yellow lightning bolt (stamina). '
        'Row 3: smiling face (mood); short sword (attack); round wooden shield (defense); circular green arrows (rebirth). '
        'Row 4: golden upward arrow in a bubble (upgrade ready); exclamation mark in a yellow speech bubble (quest); gold crown; hourglass.'),
    # 讀取畫面背景
    'loading-bg': dict(w=768, h=340, bg=False, seed=105, desc=
        'Pixel art wide panoramic illustration of a cozy fantasy hunter village at dusk, wooden timber houses with warm glowing windows '
        'and orange thatched roofs, a stone town hall, a palisade fence, misty dark forest and blue mountains behind, '
        'purple and orange evening sky with soft mist, small lanterns, peaceful mood, detailed pixel art, no text, no characters in front.'),
    # 地下城、競技場標題橫幅
    'banner-dungeon': dict(w=512, h=128, bg=False, seed=106, desc=
        'Pixel art wide banner scene: entrance of an ancient stone dungeon in a dark cave, torches on both sides, glowing eyes in the darkness, '
        'stone steps going down, mossy rocks, dark moody palette with warm torch light, no text, no characters.'),
    'banner-arena': dict(w=512, h=128, bg=False, seed=107, desc=
        'Pixel art wide banner scene: a medieval wooden tournament arena with sand floor, colourful flags and banners, wooden stands, '
        'weapon racks, bright afternoon light, warm cozy palette, no text, no characters.'),
}


def text_of(res):
    return '\n'.join(c.get('text', '') for c in (res.get('result') or {}).get('content', []) if c.get('type') == 'text')


if __name__ == '__main__':
    mcp.init(); jobs = {}
    for name in sys.argv[1:]:
        j = JOBS[name]
        args = {'description': j['desc'], 'width': j['w'], 'height': j['h'], 'no_background': j['bg'],
                'outline': 'single color outline', 'detail': 'medium detail' if j['w'] <= 256 else 'highly detailed', 'seed': j['seed']}
        res = mcp.rpc('tools/call', {'name': 'create_image_pixen', 'arguments': args})
        m = re.search(r'job_id:\s*([0-9a-f-]{36})', text_of(res))
        if not m: print(name, 'FAILED', text_of(res)[:400], res.get('error')); continue
        jobs[name] = m.group(1); print(name, 'queued')
    for name, jid in jobs.items():
        for _ in range(120):
            t = text_of(mcp.rpc('tools/call', {'name': 'get_image', 'arguments': {'job_id': jid}}))
            if 'status: completed' in t:
                url = re.search(r'download:\s*(\S+)', t).group(1)
                (OUT / f'{name}.png').write_bytes(urllib.request.urlopen(url, timeout=120).read())
                print(name, 'saved;', ' '.join(l for l in t.splitlines() if l.startswith(('charged', 'transparent')))); break
            if re.search(r'status: (failed|error)', t): print(name, 'FAILED', t[:400]); break
            time.sleep(4)
