# mcp.py — 直接跟 PixelLab 的 MCP 伺服器（https://api.pixellab.ai/mcp）講 JSON-RPC。
# 用法:
#   python mcp.py tools                     列出工具（不花錢）
#   python mcp.py schema <工具名>            印出某個工具的參數
#   python mcp.py call <工具名> <args.json>  呼叫工具（可能花錢），回應存到 out/<工具名>-<時間>.json
# 金鑰: PIXELLAB_TOKEN 環境變數，否則 ~/.pixellab-token（不會印出來）
import json, os, sys, time, pathlib, urllib.request

URL = 'https://api.pixellab.ai/mcp'
TOKEN = os.environ.get('PIXELLAB_TOKEN') or pathlib.Path(os.path.expanduser(os.environ.get('PIXELLAB_TOKEN_FILE', '~/.pixellab-token'))).read_text().strip()
OUT = pathlib.Path(__file__).with_name('out'); OUT.mkdir(exist_ok=True)
session = None


def rpc(method, params=None, notify=False, _id=[0]):
    global session
    body = {'jsonrpc': '2.0', 'method': method}
    if params is not None: body['params'] = params
    if not notify: _id[0] += 1; body['id'] = _id[0]
    h = {'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'Authorization': 'Bearer ' + TOKEN}
    if session: h['Mcp-Session-Id'] = session
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers=h, method='POST')
    with urllib.request.urlopen(req, timeout=600) as r:
        session = r.headers.get('Mcp-Session-Id') or session
        raw = r.read().decode('utf-8', 'replace')
    if notify or not raw.strip(): return None
    if raw.lstrip().startswith('{'): return json.loads(raw)
    # SSE: 取最後一個 data: 行
    data = [l[5:].strip() for l in raw.splitlines() if l.startswith('data:')]
    for d in reversed(data):
        try:
            m = json.loads(d)
            if m.get('id') == body.get('id'): return m
        except Exception: pass
    return {'raw': raw[:2000]}


def init():
    rpc('initialize', {'protocolVersion': '2025-03-26', 'capabilities': {}, 'clientInfo': {'name': 'mistvale-ui-test', 'version': '1'}})
    rpc('notifications/initialized', notify=True)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    init()
    cmd = sys.argv[1]
    if cmd == 'tools':
        for t in rpc('tools/list')['result']['tools']:
            print('-', t['name'], '::', (t.get('description') or '').split('\n')[0][:160])
    elif cmd == 'schema':
        for t in rpc('tools/list')['result']['tools']:
            if t['name'] == sys.argv[2]:
                print(t.get('description')); print(json.dumps(t.get('inputSchema'), ensure_ascii=False, indent=1))
    elif cmd == 'call':
        args = json.loads(pathlib.Path(sys.argv[3]).read_text(encoding='utf-8'))
        res = rpc('tools/call', {'name': sys.argv[2], 'arguments': args})
        f = OUT / f"{sys.argv[2]}-{time.strftime('%H%M%S')}.json"
        f.write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding='utf-8')
        print('saved', f)
        for c in (res.get('result') or {}).get('content', []):
            if c.get('type') == 'text': print(c['text'][:3000])
            else: print('[', c.get('type'), ']')
        if 'error' in res: print('ERROR', res['error'])
