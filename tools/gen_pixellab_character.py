"""Generate a new character with PixelLab (account #2) and download every direction."""

import json
import os
import time
import urllib.request

TOKEN = open(os.path.expanduser(r"~\.pixellab-token-2")).read().strip()
BASE = "https://api.pixellab.ai/v2"
OUT = r"C:\Users\ray\Documents\Codex\2026-09-29\new-chat\work\mistvale\output\pixellab\frostwarden"

DESC = (
    "frost warden knight, pale ice-blue plate armor with silver trim, "
    "horned helm with a small crystal, long greatsword, chibi 3-head proportions, "
    "16-bit pixel art, crisp single-pixel black outline, side profile facing right"
)


def call(path, payload=None, method="GET"):
    url = BASE + path
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + TOKEN)
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode())


print("creating character ...")
resp = call(
    "/create-character-v3",
    {
        "description": DESC,
        "image_size": {"width": 128, "height": 128},
        "view": "side",
        "template_id": "mannequin",
        "no_background": True,
        "outline": "single color black outline",
        "detail": "medium detail",
    },
    "POST",
)
print(json.dumps(resp, indent=2)[:600])

job = resp["background_job_id"]
cid = resp["character_id"]

print(f"\npolling job {job} ...")
for i in range(60):
    time.sleep(5)
    st = call(f"/background-jobs/{job}")
    status = st.get("status")
    print(f"  [{i*5:>3}s] {status}")
    if status in ("completed", "failed", "error"):
        break

print("\ncharacter:")
ch = call(f"/characters/{cid}")
print(json.dumps(ch, indent=2)[:2500])

os.makedirs(OUT, exist_ok=True)
json.dump(ch, open(os.path.join(OUT, "character.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)

# download any image urls we can find
def walk(obj, path=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from walk(v, f"{path}.{k}" if path else k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from walk(v, f"{path}[{i}]")
    elif isinstance(obj, str) and obj.startswith("http"):
        yield path, obj


n = 0
for key, url in walk(ch):
    if not any(key.lower().endswith(ext) for ext in ("url", "image", "png", "src")):
        continue
    name = key.replace("]", "").replace("[", "_").replace(".", "_")
    if not name.endswith(".png"):
        name += ".png"
    try:
        urllib.request.urlretrieve(url, os.path.join(OUT, name))
        print(f"  saved {name}")
        n += 1
    except Exception as exc:
        print(f"  fail {key}: {exc}")

print(f"\n{n} images -> {OUT}")
