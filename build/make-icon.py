"""One-shot helper: crop the AI-generated icon to its squircle, apply a real
rounded-corner alpha mask, and emit build/icon.png plus an .iconset folder."""
import sys
from PIL import Image, ImageDraw

SRC = sys.argv[1]
OUT_DIR = sys.argv[2]

img = Image.open(SRC).convert("RGB")
w, h = img.size

def is_dark(px):
    r, g, b = px
    return r + g + b < 420

mid = h // 2
left = next(x for x in range(w) if is_dark(img.getpixel((x, mid))))
right = next(x for x in range(w - 1, -1, -1) if is_dark(img.getpixel((x, mid))))
cx = w // 2
top = next(y for y in range(h) if is_dark(img.getpixel((cx, y))))
bottom = next(y for y in range(h - 1, -1, -1) if is_dark(img.getpixel((cx, y))))

img = img.crop((left, top, right + 1, bottom + 1)).resize((1024, 1024), Image.LANCZOS)

# Apple-style icon: content squircle inset within the 1024 canvas, ~22% corner radius.
canvas = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
inset = 100
size = 1024 - 2 * inset
content = img.resize((size, size), Image.LANCZOS)
mask = Image.new("L", (size, size), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.225), fill=255)
canvas.paste(content, (inset, inset), mask)
canvas.save(f"{OUT_DIR}/icon.png")

import os
iconset = f"{OUT_DIR}/icon.iconset"
os.makedirs(iconset, exist_ok=True)
for pts in (16, 32, 128, 256, 512):
    for scale in (1, 2):
        px = pts * scale
        suffix = "" if scale == 1 else "@2x"
        canvas.resize((px, px), Image.LANCZOS).save(f"{iconset}/icon_{pts}x{pts}{suffix}.png")
print("done")
