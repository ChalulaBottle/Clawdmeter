#!/usr/bin/env python3
"""Die-cut sticker: the creature alone, on a transparent canvas, with a solid white contour around
the silhouette for the cut. Die-cut printers (Sticker Mule and the like) cut along the transparent
edge, so the white contour IS the sticker edge. The antenna tip is lit (the resting frame has it off).

usage: python tools/sticker_diecut.py [--anim echo_idle] [--mug] [--bigmug] [--inch 3] [--dpi 600]
                                      [--contour 0.1] [--out docs/media/sticker]
Writes sticker-diecut-<anim>-<inch>in.png sized to the requested inch at the requested dpi, plus a
-cutline.png preview (black fill = the cut shape) for a printer that wants the shape separately.
Needs Pillow (.venv\\Scripts\\python.exe).
"""
import argparse, json, os
from PIL import Image, ImageDraw, ImageFilter

ap = argparse.ArgumentParser()
ap.add_argument("--anim", default="echo_idle")
ap.add_argument("--mug", action="store_true")
ap.add_argument("--bigmug", action="store_true")
ap.add_argument("--inch", type=float, default=3.0)
ap.add_argument("--dpi", type=int, default=600)
ap.add_argument("--contour", type=float, default=0.10, help="white contour width in inches")
ap.add_argument("--edge", default="white", help="contour fill: white | island (cyan to pink sweep) | echo (cyan, teal, amber)")
ap.add_argument("--mugw", type=int, default=4, help="with --bigmug: mug width in cells (3 or 4)")
ap.add_argument("--mugh", type=int, default=4, help="with --bigmug: mug height in cells incl. the coffee row (4 or 5)")
ap.add_argument("--out", default=os.path.join("docs", "media", "sticker"))
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)

S = int(a.inch * a.dpi)
CONTOUR = int(a.contour * a.dpi)

def hexrgb(hx):
    if not hx or hx == "transparent": return None
    hx = hx.lstrip("#"); return tuple(int(hx[i:i + 2], 16) for i in (0, 2, 4))

d = json.load(open(os.path.join("tools", "echo_anims", a.anim + ".json")))
pal = [hexrgb(p) for p in d["palette"]]; grid = [row[:] for row in d["frames"][0]["grid"]]
# antenna tip lit: the ECHO family keeps the tip at (1, 15) as index 4 (ping); rest frames set it to body
if len(pal) > 4 and grid[1][15] == 1: grid[1][15] = 4
if a.mug or a.bigmug:
    m = json.load(open(os.path.join("tools", "echo_anims", "echo_coffee.json")))
    mpal = [hexrgb(p) for p in m["palette"]]
    while len(pal) < 7: pal.append(None)
    pal = pal[:7] + mpal[7:10]
    if a.bigmug:
        top = 11 - a.mugh                                   # mug bottom stays on row 10, hand on row 11
        c0m, c1m = 15, 15 + a.mugw                          # columns [c0m, c1m)
        for c in range(c0m, c1m): grid[top][c] = 8
        for r in range(top + 1, 11):
            for c in range(c0m, c1m): grid[r][c] = 7
        grid[top + 1][c1m] = 7; grid[top + 2][c1m] = 7      # handle
        grid[11][16] = 1; grid[11][17] = 1                   # hand
        # steam climbs to the right of the antenna only; a cell at column 15 read as part of the stalk
        for r, c in ((top - 3, 16), (top - 2, 17), (top - 1, 16), (top - 4, 17)):
            if 0 <= r < 20 and grid[r][c] == 0: grid[r][c] = 9
    else:
        mg = m["frames"][0]["grid"]
        for r in range(20):
            for c in range(20):
                if mg[r][c] in (7, 8, 9): grid[r][c] = mg[r][c]
        grid[11][16] = 1

rows = [r for r in range(20) if any(grid[r])]; cols = [c for c in range(20) if any(grid[r][c] for r in range(20))]
r0, r1, c0, c1 = min(rows), max(rows), min(cols), max(cols)
ch, cw = r1 - r0 + 1, c1 - c0 + 1

# fit the creature plus contour into the square with a small safety margin
avail = S - 2 * CONTOUR - int(0.05 * a.dpi)
cell = avail // max(ch, cw)
# work on a padded canvas so the close (extra dilate, erode back) never touches the border;
# everything is cropped back to S x S at the end
CLOSE = int(0.12 * a.dpi)
PAD = CONTOUR + CLOSE + 8
W = S + 2 * PAD
ox, oy = PAD + (S - cw * cell) // 2, PAD + (S - ch * cell) // 2

art = Image.new("RGBA", (W, W), (0, 0, 0, 0))
dr = ImageDraw.Draw(art)
for r in range(r0, r1 + 1):
    for c in range(c0, c1 + 1):
        v = grid[r][c]
        if v and pal[v]:
            x, y = ox + (c - c0) * cell, oy + (r - r0) * cell
            dr.rectangle([x, y, x + cell - 1, y + cell - 1], fill=pal[v] + (255,))

# contour: dilate the alpha (MaxFilter is square, which suits pixel art), then a morphological
# CLOSE (extra dilate, erode back) so narrow slots between the legs and around the steam fill in,
# and a flood fill from the corner so no interior hole survives. A die cutter wants one blob with
# no slot narrower than about 1/8 in and no islands.
# a MaxFilter/MinFilter of size k grows/shrinks the edge by k // 2 pixels per pass
def dilate(m, px):
    remaining = px
    while remaining > 0:
        k = min(15, 2 * remaining + 1); k = k if k % 2 == 1 else k + 1
        m = m.filter(ImageFilter.MaxFilter(k)); remaining -= k // 2
    return m
def erode(m, px):
    remaining = px
    while remaining > 0:
        k = min(15, 2 * remaining + 1); k = k if k % 2 == 1 else k + 1
        m = m.filter(ImageFilter.MinFilter(k)); remaining -= k // 2
    return m
mask = art.split()[3]
grown = erode(dilate(mask, CONTOUR + CLOSE), CLOSE)
# report any enclosed hole left after the close, so a printer surprise shows up here first
probe = grown.copy(); ImageDraw.floodfill(probe, (0, 0), 128)
holes_px = sum(1 for v in probe.getdata() if v == 0)
def lerp(c0, c1, t): return tuple(int(c0[i] + (c1[i] - c0[i]) * t) for i in range(3))
SWEEPS = {
    "island": [(92, 225, 255), (176, 150, 255), (255, 106, 213)],       # the Island sticker: cyan, lilac, pink
    "echo":   [(111, 233, 255), (53, 224, 192), (224, 178, 90)],       # ECHO tokens: cyan, teal, amber
}
if a.edge in SWEEPS:
    stops = SWEEPS[a.edge]
    edge = Image.new("RGB", (W, W)); px = edge.load()
    for y in range(W):
        for x in range(W):
            t = (x + y) / (2 * W); k = min(int(t * (len(stops) - 1)), len(stops) - 2)
            px[x, y] = lerp(stops[k], stops[k + 1], t * (len(stops) - 1) - k)
    white = edge.convert("RGBA")
else:
    white = Image.new("RGBA", (W, W), (255, 255, 255, 255))
white.putalpha(grown)
out = Image.alpha_composite(white, art).crop((PAD, PAD, PAD + S, PAD + S))
grown = grown.crop((PAD, PAD, PAD + S, PAD + S))

name = f"sticker-diecut-{a.anim}{'-bigmug' if a.bigmug else ('-mug' if a.mug else '')}{'' if a.edge == 'white' else '-' + a.edge}-{a.inch:g}in"
out.save(os.path.join(a.out, name + ".png"), dpi=(a.dpi, a.dpi))
cut = Image.new("RGB", (S, S), (255, 255, 255)); cut.paste((0, 0, 0), mask=grown)
cut.save(os.path.join(a.out, name + "-cutline.png"), dpi=(a.dpi, a.dpi))
# preview on a dark ground so the white contour can be judged on screen
prev = Image.new("RGBA", (S, S), (40, 44, 48, 255)); prev = Image.alpha_composite(prev, out)
prev.convert("RGB").save(os.path.join(a.out, name + "-preview.png"))
bbox = grown.getbbox()
print(os.path.join(a.out, name + ".png"), f"{S}px at {a.dpi} dpi = {a.inch:g} in; cell {cell}px; contour {CONTOUR}px ({a.contour} in); cut bbox {bbox}; enclosed holes {holes_px}px")
