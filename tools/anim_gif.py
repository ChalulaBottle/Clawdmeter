#!/usr/bin/env python3
"""Render claudepix-format animation JSON to GIF (+ a frame-0 PNG).

usage: python tools/anim_gif.py [--in tools/echo_anims] [--out docs/media/anims] [--cell 12]
                                [--transparent] [--suffix _128] [--only echo_idle,coffee]
Palette-exact: each frame is a "P" image over the animation's own palette (<= 10 colours),
so colours match the panel and files stay tiny. --transparent makes index 0 see-through
(Discord emoji/stickers); without it index 0 is panel black. Holds are kept per frame.
Needs Pillow (the Windows daemon venv has it: .venv\\Scripts\\python.exe).
Discord limits: emoji 128x128 and < 256 KB; stickers 320x320 and < 512 KB.
"""
import argparse, json, os
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("--in", dest="src", default=os.path.join("tools", "echo_anims"))
ap.add_argument("--out", default=os.path.join("docs", "media", "anims"))
ap.add_argument("--cell", type=int, default=12)
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
    g = len(d["frames"][0]["grid"])
    size = g * a.cell
    frames, holds = [], []
    for f in d["frames"]:
        im = Image.new("P", (size, size), 0)
        im.putpalette(flat_pal)
        px = im.load()
        for r, row in enumerate(f["grid"]):
            for c, v in enumerate(row):
                if v:
                    for y in range(a.cell):
                        for x in range(a.cell):
                            px[c * a.cell + x, r * a.cell + y] = v
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
    print(f"{name}: {len(frames)} frames, cycle {sum(holds)/1000:.1f}s, {size}px, {kb:.0f} KB")
