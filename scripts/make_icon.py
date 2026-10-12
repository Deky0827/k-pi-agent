# -*- coding: utf-8 -*-
"""Generate K pi agent icon: rounded-square + 'K', multi-size .ico + png + base64."""
import base64
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "build")
os.makedirs(OUT, exist_ok=True)

SIZE = 256
BG = (108, 92, 231, 255)        # indigo/violet
FG = (255, 255, 255, 255)

def make(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    radius = int(size * 0.22)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=BG)
    # letter K centered, bold
    font = None
    for name in ("arialbd.ttf", "segoeuib.ttf", "arial.ttf"):
        try:
            font = ImageFont.truetype("C:/Windows/Fonts/" + name, int(size * 0.62))
            break
        except Exception:
            continue
    if font is None:
        font = ImageFont.load_default()
    bbox = d.textbbox((0, 0), "K", font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(((size - w) / 2 - bbox[0], (size - h) / 2 - bbox[1]), "K", font=font, fill=FG)
    return img

master = make(SIZE)
master.save(os.path.join(OUT, "icon.png"))

# multi-size ico
master.save(os.path.join(OUT, "icon.ico"), sizes=[(256, 256), (64, 64), (48, 48), (32, 32), (16, 16)])

# small tray png (32x32) -> base64 for embedding in TS
tray = make(32)
tray.save(os.path.join(OUT, "tray.png"))
with open(os.path.join(OUT, "tray.png"), "rb") as f:
    b64 = base64.b64encode(f.read()).decode()
with open(os.path.join(OUT, "trayIcon.base64.txt"), "w") as f:
    f.write(b64)
print("icon files written to", os.path.abspath(OUT))
print("tray base64 length:", len(b64))
