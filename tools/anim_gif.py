#!/usr/bin/env python3
"""Render claudepix-format animation JSON to GIF (+ a frame-0 PNG).

usage: python tools/anim_gif.py [--in tools/echo_anims] [--out docs/media/anims] [--cell 12]
                                [--transparent] [--suffix _128] [--only echo_idle,coffee]
Palette-exact: each frame is a "P" image over the animation's own palette (<= 10 colours),
so colours match the panel and files stay tiny. --transparent makes index 0 see-through
(Discord emoji/stickers); without it index 0 is panel black. Holds are kept per frame.
Lattice: --cell is the cell size in px on the 20 cell lattice, so the image edge is 20 times
--cell for every animation, whatever its size (the JSON "size" field, else its grid length).
A finer lattice gets that edge divided by its size: at the default 12 (240 px, the site GIFs)
40 cells draw at 6 px and 60 cells at 4 px; at --cell 6 (120 px) at 3 and 2 px. Where the
edge does not divide (60 cells at --cell 16, 320 px) each cell takes the whole px below (5)
and index 0 pads the rest evenly, so the file keeps its exact edge. Only a lattice with more
cells than the edge has px (60 cells at --cell 2) draws at 1 px a cell and grows past it.
Needs Pillow (the Windows daemon venv has it: .venv\\Scripts\\python.exe).
Discord limits: emoji 128x128 and < 256 KB; stickers 320x320 and < 512 KB.
"""
import argparse, json, os
from PIL import Image

LATTICE = 20   # --cell is given on this lattice; every lattice gets the same image edge

ap = argparse.ArgumentParser()
ap.add_argument("--in", dest="src", default=os.path.join("tools", "echo_anims"))
ap.add_argument("--out", default=os.path.join("docs", "media", "anims"))
ap.add_argument("--cell", type=int, default=12,
                help="px per cell on the 20 cell lattice; the image edge is 20 times this for every lattice")
ap.add_argument("--transparent", action="store_true")
ap.add_argument("--suffix", default="")
ap.add_argument("--only", default="")
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)

def hexrgb(h):
    if not h or h == "transparent":
        return (0, 0, 0)
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

only = {k.strip() for k in a.only.split(",") if k.strip()}
index = json.load(open(os.path.join(a.src, "_index.json")))
for e in index:
    key = e["filename"].replace(".html", "")
    if only and key not in only:
        continue
    d = json.load(open(os.path.join(a.src, key + ".json")))
    pal = [hexrgb(p) for p in d["palette"]]
    flat_pal = []
    for rgb in pal:
        flat_pal.extend(rgb)
    flat_pal.extend([0] * (768 - len(flat_pal)))
    n = d.get("size") or len(d["frames"][0]["grid"])   # lattice: n x n cells
    for i, f in enumerate(d["frames"]):
        if len(f["grid"]) != n or any(len(row) != n for row in f["grid"]):
            raise SystemExit(f"{key}: frame {i} is not {n} x {n} cells")
    edge = LATTICE * a.cell               # image edge in px, the same for every lattice
    cell = max(1, edge // n)              # whole px per cell
    pad = max(0, edge - n * cell) // 2    # index 0 border, only where the edge does not divide
    size = max(edge, n * cell)
    frames, holds = [], []
    for f in d["frames"]:
        im = Image.new("P", (size, size), 0)
        im.putpalette(flat_pal)
        px = im.load()
        for r, row in enumerate(f["grid"]):
            for c, v in enumerate(row):
                if v:
                    x0, y0 = pad + c * cell, pad + r * cell
                    for y in range(cell):
                        for x in range(cell):
                            px[x0 + x, y0 + y] = v
        frames.append(im)
        holds.append(max(20, int(f["hold"])))
    name = key + a.suffix
    gif = os.path.join(a.out, name + ".gif")
    kw = dict(save_all=True, append_images=frames[1:], duration=holds, loop=0)
    if a.transparent:
        kw.update(transparency=0, disposal=2)
    else:
        kw.update(disposal=1)
    frames[0].save(gif, **kw)
    png = frames[0].convert("RGBA" if a.transparent else "RGB")
    if a.transparent:
        # index 0 -> alpha 0
        datas = [(0, 0, 0, 0) if p[:3] == pal[0] and px0 == 0 else p for p, px0 in zip(png.getdata(), frames[0].getdata())]
        png.putdata(datas)
    png.save(os.path.join(a.out, name + ".png"))
    kb = os.path.getsize(gif) / 1024
    print(f"{name}: {len(frames)} frames, cycle {sum(holds)/1000:.1f}s, {size}px "
          f"({n} cells at {cell} px{', padded ' + str(pad) + ' px' if pad else ''}), {kb:.0f} KB")
