#!/usr/bin/env python3
"""產生 Mistvale 的 iOS 設定描述檔（WebClip，把遊戲加到主畫面）。

免 Apple Developer 帳號、免簽章：使用者開描述檔 → 允許 → 到設定安裝 → 桌面出現圖示。
改網址／圖示後重跑本檔即可重新產生 mistvale.mobileconfig。

用法：
    python ota/gen_profile.py
"""
import base64
import plistlib
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAME_URL = "https://raywu089457-cmd.github.io/mistvale/"
ICON = ROOT / "pwa" / "apple-touch-icon.png"   # 180x180，主畫面圖示
OUT = Path(__file__).resolve().parent / "mistvale.mobileconfig"

icon_b64 = ICON.read_bytes() if ICON.exists() else None

webclip = {
    "PayloadType": "com.apple.webClip",
    "PayloadIdentifier": "com.mistvale.webclip",
    "PayloadUUID": str(uuid.uuid4()).upper(),
    "PayloadVersion": 1,
    "PayloadDisplayName": "暮影村",
    "Label": "暮影村",
    "URL": GAME_URL,
    "FullScreen": True,       # 全螢幕開啟，像 App
    "Precomposed": True,      # 圖示不再加玻璃反光
    "IsRemovable": True,      # 使用者可自行刪除
}
if icon_b64:
    webclip["Icon"] = icon_b64   # plistlib 自動轉成 <data> base64

profile = {
    "PayloadContent": [webclip],
    "PayloadType": "Configuration",
    "PayloadIdentifier": "com.mistvale.profile",
    "PayloadUUID": str(uuid.uuid4()).upper(),
    "PayloadVersion": 1,
    "PayloadDisplayName": "暮影村 · 像素獵魔物語",
    "PayloadDescription": "把「暮影村」加到主畫面，點圖示即可全螢幕遊玩。隨時可刪除。",
    "PayloadRemovalDisallowed": False,
    "PayloadScope": "User",
    "PayloadOrganization": "Mistvale",
}

with OUT.open("wb") as f:
    plistlib.dump(profile, f, fmt=plistlib.FMT_XML, sort_keys=False)

print("產生", OUT, OUT.stat().st_size, "bytes")
