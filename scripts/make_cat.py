# -*- coding: utf-8 -*-
"""
Kitty —— 原创小猫桌宠资源生成器
生成: resources/seed-pets/kitty/{spritesheet.png, pet.json}
雪碧图: 16 帧 128x128, 8 列 x 2 行
  0-3  idle  (尾巴摆动 + 眨眼)
  4-9  walk  (四足交替 + 身体起伏)
 10-13 happy (^^眼 + 张嘴笑 + 爱心上升)
 14-15 sleep (趴睡 + Zzz)
"""
import json
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "resources", "seed-pets", "kitty")
os.makedirs(OUT, exist_ok=True)
S = 128
C = 8  # columns

# colors
FUR = (244, 162, 89, 255)        # orange
FUR_D = (214, 128, 48, 255)      # darker outline / stripes
BELLY = (255, 244, 224, 255)     # cream
PINK = (247, 166, 181, 255)      # inner ear / nose
EYE = (52, 42, 40, 255)
HEART = (240, 98, 130, 255)
WHITE = (255, 255, 255, 255)

def _outline(draw, box, fill, width=2):
    draw.ellipse(box, fill=fill, outline=FUR_D, width=width)

def cat_frame(f, state):
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    bob = {0: 0, 1: 1, 2: 2, 3: 1}[f % 4] if state in ("idle", "walk") else 0
    if state == "walk":
        bob = (0, 2, 0, 2, 1, 0)[f % 6]
    oy = 10 + bob  # global offset

    if state == "sleep":
        # lying cat: wider body, head on ground
        _outline(d, (24, 78, 104, 104), FUR)            # body
        d.ellipse((38, 84, 90, 102), fill=BELLY)
        hx, hy = 88, 74
        _outline(d, (hx - 26, hy - 20, hx + 26, hy + 22), FUR)  # head low
        _ears(d, hx, hy - 6, flat=True)
        d.line((hx - 14, hy + 2, hx - 6, hy + 2), fill=EYE, width=3)   # closed eyes
        d.line((hx + 6, hy + 2, hx + 14, hy + 2), fill=EYE, width=3)
        _mouth(d, hx, hy + 12)
        _tail(d, 30, 92, angle=25 + 8 * (f % 2), length=34, up=False)
        z = "z Z" if f % 2 else "z"
        try:
            font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 16 if f % 2 else 12)
        except Exception:
            font = ImageFont.load_default()
        d.text((18, 52 - (6 if f % 2 else 0)), z, font=font, fill=WHITE)
        return img

    # ---- tail ----
    tail_angles = {"idle": [0, 8, 16, 8], "walk": [0, 12, 24, 12, 0, -8], "happy": [10, 0, -10, 0]}
    tai = tail_angles[state][f % len(tail_angles[state])]
    _tail(d, 88, 96 - oy, angle=-tai, length=40, up=(state != "walk"))

    # ---- body ----
    _outline(d, (38, 78 - oy, 92, 112 - oy), FUR)
    d.ellipse((48, 90 - oy, 82, 110 - oy), fill=BELLY)

    # ---- legs ----
    if state == "walk":
        swing = (6, -6, 0, 6, -6, 0)[f % 6]
        d.ellipse((44 + swing, 104 - oy, 54 + swing, 116 - oy), fill=FUR, outline=FUR_D, width=1)
        d.ellipse((76 - swing, 104 - oy, 86 - swing, 116 - oy), fill=FUR, outline=FUR_D, width=1)
        d.ellipse((56 - swing, 106 - oy, 66 - swing, 118 - oy), fill=BELLY, outline=FUR_D, width=1)
        d.ellipse((70 + swing, 106 - oy, 80 + swing, 118 - oy), fill=BELLY, outline=FUR_D, width=1)
    else:
        d.ellipse((46, 106 - oy, 56, 116 - oy), fill=FUR, outline=FUR_D, width=1)
        d.ellipse((58, 108 - oy, 68, 118 - oy), fill=BELLY, outline=FUR_D, width=1)
        d.ellipse((74, 108 - oy, 84, 118 - oy), fill=FUR, outline=FUR_D, width=1)

    # ---- head ----
    hx, hy = 65, 52 - oy
    _outline(d, (hx - 30, hy - 27, hx + 30, hy + 29), FUR)
    _ears(d, hx, hy - 24, flat=False, wiggle=(state == "happy" and f % 2 == 0))
    # stripes on head
    for i, w in ((-12, 4), (0, 5), (12, 4)):
        d.arc((hx + i - w, hy - 27, hx + i + w, hy - 13), 200, 340, fill=FUR_D, width=2)
    # muzzle
    d.ellipse((hx - 13, hy + 4, hx + 13, hy + 22), fill=BELLY)

    # ---- eyes ----
    ex1, ex2, ey = hx - 13, hx + 13, hy - 2
    if state == "happy":
        d.arc((ex1 - 6, ey - 5, ex1 + 6, ey + 6), 180, 360, fill=EYE, width=3)
        d.arc((ex2 - 6, ey - 5, ex2 + 6, ey + 6), 180, 360, fill=EYE, width=3)
    elif state == "idle" and f == 2:
        d.line((ex1 - 5, ey, ex1 + 5, ey), fill=EYE, width=3)
        d.line((ex2 - 5, ey, ex2 + 5, ey), fill=EYE, width=3)
    else:
        d.ellipse((ex1 - 5, ey - 6, ex1 + 5, ey + 5), fill=EYE)
        d.ellipse((ex2 - 5, ey - 6, ex2 + 5, ey + 5), fill=EYE)
        d.ellipse((ex1 - 3, ey - 5, ex1, ey - 2), fill=WHITE)
        d.ellipse((ex2 + 1, ey - 5, ex2 + 4, ey - 2), fill=WHITE)

    # ---- nose + mouth ----
    d.polygon([(hx - 4, hy + 9), (hx + 4, hy + 9), (hx, hy + 14)], fill=PINK)
    _mouth(d, hx, hy + 14, open_mouth=(state == "happy"))
    # whiskers
    for sgn in (-1, 1):
        for dy in (-2, 2, 6):
            d.line((hx + sgn * 14, hy + 9 + dy * 0.6, hx + sgn * 30, hy + 6 + dy), fill=(120, 90, 60, 220), width=1)

    # ---- hearts (happy) ----
    if state == "happy":
        for k, (hxr, hyr) in enumerate(((hx + 26, hy - 18), (hx + 38, hy - 34))):
            t = (f + k) % 4
            _heart(d, hxr + t, hyr - t * 3, 7 - t)

    return img

def _ears(d, cx, cy, flat=False, wiggle=False):
    dy = 6 if flat else 0
    for sgn in (-1, 1):
        wig = 3 if (wiggle and sgn == 1) else 0
        d.polygon([(cx + sgn * 8, cy + dy), (cx + sgn * 24 + wig, cy - 14 + dy), (cx + sgn * 27, cy + 4 + dy)],
                  fill=FUR, outline=FUR_D)
        d.polygon([(cx + sgn * 13, cy + dy - 1), (cx + sgn * 22 + wig, cy - 9 + dy), (cx + sgn * 23, cy + 1 + dy)],
                  fill=PINK)

def _mouth(d, cx, cy, open_mouth=False):
    if open_mouth:
        d.ellipse((cx - 6, cy + 1, cx + 6, cy + 10), fill=(210, 90, 90, 255), outline=FUR_D, width=1)
        d.arc((cx - 8, cy - 5, cx, cy + 3), 0, 180, fill=EYE, width=2)
        d.arc((cx, cy - 5, cx + 8, cy + 3), 0, 180, fill=EYE, width=2)
    else:
        d.arc((cx - 7, cy - 4, cx, cy + 4), 0, 180, fill=EYE, width=2)
        d.arc((cx, cy - 4, cx + 7, cy + 4), 0, 180, fill=EYE, width=2)

def _tail(d, bx, by, angle, length, up):
    import math
    a = math.radians(angle + (-40 if up else -15))
    x2, y2 = bx + length * math.cos(a), by + length * math.sin(a)
    d.line((bx, by, x2, y2), fill=FUR, width=9)
    d.line((bx, by, x2, y2), fill=FUR_D, width=11)
    d.line((bx, by, x2, y2), fill=FUR, width=7)
    d.ellipse((x2 - 5, y2 - 5, x2 + 5, y2 + 5), fill=FUR, outline=FUR_D, width=1)

def _heart(d, cx, cy, r):
    if r <= 0:
        return
    d.polygon([(cx - r, cy - r * 0.2), (cx + r, cy - r * 0.2), (cx, cy + r)], fill=HEART)
    d.ellipse((cx - r, cy - r, cx, cy), fill=HEART)
    d.ellipse((cx, cy - r, cx + r, cy), fill=HEART)

frames = []
frames += [cat_frame(i, "idle") for i in range(4)]
frames += [cat_frame(i, "walk") for i in range(6)]
frames += [cat_frame(i, "happy") for i in range(4)]
frames += [cat_frame(i, "sleep") for i in range(2)]

sheet = Image.new("RGBA", (S * C, S * 2), (0, 0, 0, 0))
for i, fr in enumerate(frames):
    sheet.paste(fr, ((i % C) * S, (i // C) * S))
sheet.save(os.path.join(OUT, "spritesheet.png"))

manifest = {
    "id": "kitty",
    "name": "小橘 Kitty",
    "author": "K pi agent 原创",
    "version": "1.0.0",
    "description": "一只圆滚滚的橘猫：待机眨眼、拖拽小跑、点击开心、久坐打盹。由脚本程序化绘制。",
    "frameSize": S,
    "columns": C,
    "defaultState": "idle",
    "states": {
        "idle": {"frames": [0, 1, 2, 3], "fps": 3},
        "walk": {"frames": [4, 5, 6, 7, 8, 9], "fps": 9},
        "happy": {"frames": [10, 11, 12, 13], "fps": 5},
        "sleep": {"frames": [14, 15], "fps": 1}
    }
}
with open(os.path.join(OUT, "pet.json"), "w", encoding="utf-8") as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)

# preview = frame 0
frames[0].save(os.path.join(OUT, "preview.png"))
print("kitty generated:", OUT)
