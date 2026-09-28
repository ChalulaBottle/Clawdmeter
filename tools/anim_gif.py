#!/usr/bin/env python3
"""Render claudepix-format animation JSON to GIF + a frame-0 PNG for docs/media.

usage: python tools/anim_gif.py [--in tools/echo_anims] [--out docs/media/anims] [--cell 12]
Needs Pillow (the Windows daemon venv has it: .venv\\Scripts\\python.exe).
Holds are kept per frame (GIF timing is 10 ms granular, so 60 ms holds stay 60 ms).
"""
import argparse, json, os, sys
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("--in", dest="src", default=os.path.join("tools", "echo_anims"))
ap.add_argument("--out", default=os.path.join("docs", "media", "anims"))
ap.add_argument("--cell", type=int, default=12)
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)

def hexrgb(h):
    if not h or h == "transparent":
        return (0, 0, 0)
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

index = json.load(open(os.path.join(a.src, "_index.json")))
for e in index:
    key = e["filename"].replace(".html", "")
    d = json.load(open(os.path.join(a.src, key + ".json")))
    pal = [hexrgb(p) for p in d["palette"]]
    g = len(d["frames"][0]["grid"])
    size = g * a.cell
    frames, holds = [], []
    for f in d["frames"]:
        im = Image.new("RGB", (size, size), (0, 0, 0))
        px = im.load()
        for r, row in enumerate(f["grid"]):
            for c, v in enumerate(row):
                if v:
                    col = pal[v] if v < len(pal) else (255, 0, 255)
                    for y in range(a.cell):
                        for x in range(a.cell):
                            px[c * a.cell + x, r * a.cell + y] = col
        frames.append(im.quantize(colors=16, method=Image.Quantize.MEDIANCUT))
        holds.append(max(20, int(f["hold"])))
    gif = os.path.join(a.out, key + ".gif")
    frames[0].save(gif, save_all=True, append_images=frames[1:], duration=holds, loop=0, disposal=1)
    frames[0].convert("RGB").save(os.path.join(a.out, key + ".png"))
    print(f"{key}: {len(frames)} frames, cycle {sum(holds)/1000:.1f}s -> {gif}")
