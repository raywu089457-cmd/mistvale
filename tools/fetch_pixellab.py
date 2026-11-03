"""Fetch the generated PixelLab character and download every direction PNG."""

import json
import os
import urllib.request

TOKEN = open(os.path.expanduser(r"~\.pixellab-token-2")).read().strip()
CID = "15747985-eee4-4608-b125-badbfa8e826c"
BASE = "https://api.pixellab.ai/v2"
OUT = r"C:\Users\ray\Documents\Codex\2026-09-29\new-chat\work\mistvale\output\pixellab\frostwarden"
os.makedirs(OUT, exist_ok=True)


def call(path):
    req = urllib.request.Request(BASE + path)
    req.add_header("Authorization", "Bearer " + TOKEN)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode())


ch = call(f"/characters/{CID}")
json.dump(ch, open(os.path.join(OUT, "character.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)

print("top-level keys:", list(ch.keys()))
print(json.dumps(ch, ensure_ascii=False, indent=1)[:1500])


def walk(obj, path=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from walk(v, f"{path}.{k}" if path else k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from walk(v, f"{path}_{i}")
    elif isinstance(obj, str) and obj.startswith("http"):
        yield path, obj


urls = list(walk(ch))
print(f"\nfound {len(urls)} urls")
for k, u in urls:
    print("  ", k, "->", u[:90])

for key, url in urls:
    if not any(t in key.lower() for t in ("image", "url", "frame", "sprite")):
        continue
    name = key.replace(".", "_").replace("-", "_") + ".png"
    try:
        urllib.request.urlretrieve(url, os.path.join(OUT, name))
        print("saved", name)
    except Exception as exc:
        print("fail", key, exc)
