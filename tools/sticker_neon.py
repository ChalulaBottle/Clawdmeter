#!/usr/bin/env python3
"""Neon sticker, in the style of the ECHO 'The Island' sticker: rounded square with a gradient
border, dark ground, pixel-style title, the creature large, and the QR on a rounded gradient tile
(dark modules over a cyan to teal to amber sweep, ECC H so the gradient costs nothing in readability).

usage: python tools/sticker_neon.py [--anim echo_idle] [--url https://chalulabottle.github.io/Clawdmeter/]
                                    [--size 1800] [--out docs/media/sticker]
1800 px = 3 in at 600 dpi (or 6 in at 300). Needs Pillow + qrcode (.venv\\Scripts\\python.exe).
"""
import argparse, json, os
from PIL import Image, ImageDraw, ImageFont
import qrcode
from qrcode.constants import ERROR_CORRECT_H

ap = argparse.ArgumentParser()
ap.add_argument("--anim", default="echo_idle")
ap.add_argument("--url", default="https://chalulabottle.github.io/Clawdmeter/")
ap.add_argument("--size", type=int, default=1800)
ap.add_argument("--title", default="CLAWDMETER|ECHO EDITION")
ap.add_argument("--mug", action="store_true", help="hand the creature echo coffee's mug (cells 7..9 + the hand)")
ap.add_argument("--creature", type=float, default=0.38, help="creature height as a fraction of the sticker")
ap.add_argument("--qr", type=float, default=0.25, help="QR tile side as a fraction of the sticker")
ap.add_argument("--out", default=os.path.join("docs", "media", "sticker"))
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)

S = a.size
BG = (7, 12, 14)
CYAN, TEAL, AMBER, INK = (111, 233, 255), (53, 224, 192), (224, 178, 90), (6, 9, 11)
FONT = os.path.join("assets", "DejaVuSansMono.ttf")

def lerp(c0, c1, t): return tuple(int(c0[i] + (c1[i] - c0[i]) * t) for i in range(3))
def sweep(t):  # cyan -> teal -> amber
    return lerp(CYAN, TEAL, t * 2) if t < 0.5 else lerp(TEAL, AMBER, (t - 0.5) * 2)
def gradient(w, h):
    g = Image.new("RGB", (w, h))
    px = g.load()
    for y in range(h):
        for x in range(w):
            px[x, y] = sweep((x + y) / (w + h))
    return g
def rounded_mask(w, h, r):
    m = Image.new("L", (w, h), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, w - 1, h - 1], radius=r, fill=255); return m

def hexrgb(hx):
    if not hx or hx == "transparent": return None
    hx = hx.lstrip("#"); return tuple(int(hx[i:i + 2], 16) for i in (0, 2, 4))

# canvas: transparent outside the rounded sticker
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
R = S // 11
border = gradient(S, S); img.paste(border, (0, 0), rounded_mask(S, S, R))
bw = S // 36
inner = Image.new("RGB", (S - 2 * bw, S - 2 * bw), BG)
img.paste(inner, (bw, bw), rounded_mask(S - 2 * bw, S - 2 * bw, R - bw))
dr = ImageDraw.Draw(img)

# pixel-style title: render small, upscale nearest
lines = a.title.split("|")
small = ImageFont.truetype(FONT, 16)
scale = max(4, S // 300)
y = int(S * 0.09)
for ln in lines:
    tw = int(small.getlength(ln)); tile = Image.new("RGBA", (tw + 2, 22), (0, 0, 0, 0))
    ImageDraw.Draw(tile).text((1, 0), ln, font=small, fill=CYAN + (255,))
    big = tile.resize((tile.width * scale, tile.height * scale), Image.NEAREST)
    img.paste(big, ((S - big.width) // 2, y), big); y += big.height + S // 90

# creature, centred, ~44% of height
d = json.load(open(os.path.join("tools", "echo_anims", a.anim + ".json")))
pal = [hexrgb(p) for p in d["palette"]]; grid = [row[:] for row in d["frames"][0]["grid"]]
if a.mug:
    # borrow the mug from echo coffee: its palette puts cream/coffee/steam at 7, 8, 9; pad ours to match
    m = json.load(open(os.path.join("tools", "echo_anims", "echo_coffee.json")))
    mpal = [hexrgb(p) for p in m["palette"]]
    while len(pal) < 7: pal.append(None)
    pal = pal[:7] + mpal[7:10]
    mg = m["frames"][0]["grid"]
    for r in range(20):
        for c in range(20):
            if mg[r][c] in (7, 8, 9): grid[r][c] = mg[r][c]
    grid[11][16] = 1                                             # the hand under the mug
    cols_all = [c for c in range(20) if any(grid[r][c] for r in range(20))]
rows = [r for r in range(20) if any(grid[r])]; cols = [c for c in range(20) if any(grid[r][c] for r in range(20))]
r0, r1, c0, c1 = min(rows), max(rows), min(cols), max(cols)
ch, cw = r1 - r0 + 1, c1 - c0 + 1
cell = int(S * a.creature / ch)
ox, oy = (S - cw * cell) // 2, y + S // 60
for r in range(r0, r1 + 1):
    for c in range(c0, c1 + 1):
        v = grid[r][c]
        if v and pal[v]:
            x, yy = ox + (c - c0) * cell, oy + (r - r0) * cell
            dr.rectangle([x, yy, x + cell - 1, yy + cell - 1], fill=pal[v] + (255,))

# QR on a rounded gradient tile
qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, border=0); qr.add_data(a.url); qr.make(fit=True)
mat = qr.get_matrix(); n = len(mat)
tile_side = int(S * a.qr); quiet = 4
mod = tile_side // (n + 2 * quiet); qside = mod * n; tile_side = mod * (n + 2 * quiet)
tile = gradient(tile_side, tile_side); tile = tile.convert("RGBA"); tile.putalpha(rounded_mask(tile_side, tile_side, tile_side // 9))
td = ImageDraw.Draw(tile)
for r in range(n):
    for c in range(n):
        if mat[r][c]:
            x, yy = (quiet + c) * mod, (quiet + r) * mod
            td.rectangle([x, yy, x + mod - 1, yy + mod - 1], fill=INK + (255,))
tx, ty = (S - tile_side) // 2, S - bw - int(S * 0.075) - tile_side
img.paste(tile, (tx, ty), tile)

# url under the tile, kick above the creature, mono
f_u = ImageFont.truetype(FONT, S // 50); f_k = ImageFont.truetype(FONT, S // 56)
dr.text((S // 2, ty + tile_side + S // 60), a.url.replace("https://", "").rstrip("/"), font=f_u, fill=(200, 216, 216), anchor="ma")
dr.text((S // 2, S - bw - S // 30), "ECHO · BUILD · DIGITAL ORUKAMI", font=f_k, fill=TEAL, anchor="ma")

out = os.path.join(a.out, f"sticker-neon-{a.anim}{'-mug' if a.mug else ''}-{S}.png")
img.save(out, dpi=(600, 600))
print(out, f"{S}px; QR {n}x{n}, module {mod}px, ECC H")
