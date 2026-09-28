#!/usr/bin/env python3
"""Print-ready sticker: an ECHO creature with a QR code to the live landing page.

usage: python tools/sticker.py [--anim echo_idle] [--url https://chalulabottle.github.io/Clawdmeter/]
                               [--size 1200] [--out docs/media/sticker]
Writes <out>/sticker-<anim>-<size>.png (4 in at 300 dpi for size 1200, chamfered dark ground on a
transparent canvas with a white keyline for die-cut), plus qr-<size>.png (the code alone, white ground).
Needs Pillow and qrcode in the Windows daemon venv: .venv\\Scripts\\python.exe -m pip install qrcode
"""
import argparse, json, os
from PIL import Image, ImageDraw, ImageFont
import qrcode
from qrcode.constants import ERROR_CORRECT_H

ap = argparse.ArgumentParser()
ap.add_argument("--anim", default="echo_idle")
ap.add_argument("--url", default="https://chalulabottle.github.io/Clawdmeter/")
ap.add_argument("--size", type=int, default=1200)
ap.add_argument("--out", default=os.path.join("docs", "media", "sticker"))
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)

S = a.size
BG, EDGE, TEXT, MUTED, ECHO = (6, 9, 11), (44, 64, 69), (216, 230, 230), (125, 150, 152), (53, 224, 192)
FONT = os.path.join("assets", "DejaVuSansMono.ttf")

def hexrgb(h):
    if not h or h == "transparent":
        return None
    h = h.lstrip("#"); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

# creature frame 0
d = json.load(open(os.path.join("tools", "echo_anims", a.anim + ".json")))
pal = [hexrgb(p) for p in d["palette"]]
grid = d["frames"][0]["grid"]
rows = [r for r in range(20) if any(grid[r])]; cols = [c for c in range(20) if any(grid[r][c] for r in range(20))]
r0, r1, c0, c1 = min(rows), max(rows), min(cols), max(cols)

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
dr = ImageDraw.Draw(img)
cut = S // 12; m = S // 40                                     # chamfer, keyline margin
oct_ = lambda k: [(cut + k, k), (S - cut - k, k), (S - k, cut + k), (S - k, S - cut - k), (S - cut - k, S - k), (cut + k, S - k), (k, S - cut - k), (k, cut + k)]
dr.polygon(oct_(0), fill=(255, 255, 255, 255))                 # white keyline / die-cut bleed
dr.polygon(oct_(m), fill=BG + (255,))
# etched ticks
t = S // 30
dr.line([(m + cut // 2, m + t * 2), (m + cut // 2, m + t * 2 + t)], fill=EDGE, width=max(2, S // 400))
dr.line([(m + cut // 2, m + t * 2), (m + cut // 2 + t, m + t * 2)], fill=EDGE, width=max(2, S // 400))

# creature, left/top, cell size so the creature stands ~46% of the sticker height
ch = r1 - r0 + 1; cell = int(S * 0.50 / ch)
ox, oy = int(S * 0.09), int(S * 0.13)
for r in range(r0, r1 + 1):
    for c in range(c0, c1 + 1):
        v = grid[r][c]
        if v and pal[v]:
            x, y = ox + (c - c0) * cell, oy + (r - r0) * cell
            dr.rectangle([x, y, x + cell - 1, y + cell - 1], fill=pal[v] + (255,))

# QR, bottom right, on a white tile with quiet zone
qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, border=2)
qr.add_data(a.url); qr.make(fit=True)
mat = qr.get_matrix(); n = len(mat)
qside = int(S * 0.36); mod = qside // n; qside = mod * n
qx, qy = S - m - int(S * 0.07) - qside, S - m - int(S * 0.12) - qside
dr.rectangle([qx - mod, qy - mod, qx + qside + mod, qy + qside + mod], fill=(255, 255, 255, 255))
for r in range(n):
    for c in range(n):
        if mat[r][c]:
            dr.rectangle([qx + c * mod, qy + r * mod, qx + (c + 1) * mod - 1, qy + (r + 1) * mod - 1], fill=(6, 9, 11, 255))
qr_only = Image.new("RGB", (qside + 8 * mod, qside + 8 * mod), (255, 255, 255))
qd = ImageDraw.Draw(qr_only)
for r in range(n):
    for c in range(n):
        if mat[r][c]:
            qd.rectangle([4 * mod + c * mod, 4 * mod + r * mod, 4 * mod + (c + 1) * mod - 1, 4 * mod + (r + 1) * mod - 1], fill=(6, 9, 11))
qr_only.save(os.path.join(a.out, f"qr-{S}.png"), dpi=(300, 300))

# text
f_k = ImageFont.truetype(FONT, S // 42); f_t = ImageFont.truetype(FONT, S // 22); f_u = ImageFont.truetype(FONT, S // 46)
dr.text((ox, oy - S // 15), "ECHO · BUILD · DIGITAL ORUKAMI", font=f_k, fill=ECHO)
tx = ox; ty = oy + ch * cell + S // 30
dr.text((tx, ty), "CLAWDMETER", font=f_t, fill=TEXT)
dr.text((tx, ty + S // 18), "ECHO EDITION", font=f_t, fill=TEXT)
dr.text((tx, ty + S // 18 * 2 + S // 60), "a 4 inch desk meter", font=f_k, fill=MUTED)
dr.text((tx, ty + S // 18 * 2 + S // 60 + S // 34), "for Claude Code", font=f_k, fill=MUTED)
# URL right-aligned to the QR tile so it can never run off the edge
dr.text((qx + qside + mod, qy + qside + S // 60), a.url.replace("https://", "").rstrip("/"), font=f_u, fill=MUTED, anchor="ra")
dr.text((qx + qside + mod, qy - S // 30), "SCAN FOR THE LIVE PAGE", font=f_k, fill=ECHO, anchor="ra")

out = os.path.join(a.out, f"sticker-{a.anim}-{S}.png")
img.save(out, dpi=(300, 300))
print(out, f"{S}px = {S/300:.1f} in at 300 dpi; QR {n}x{n} modules, module {mod}px, ECC H")
