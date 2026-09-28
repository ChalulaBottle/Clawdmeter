#!/usr/bin/env python3
"""Append the ECHO edition animations to firmware/src/splash_animations.h.

Modelled on tools/add_csb_anims.py: the header is generated, so this writes a
delimited block (palette, frames, per-frame holds per animation) and rewrites
the splash_anims table and SPLASH_ANIM_COUNT. Idempotent: an earlier ECHO block
and its table rows are removed first. Never hand-edit the header.

Source: tools/echo_anims/*.json (claudepix format) written by
    node tools/bench_to_json.js
Run:
    python tools/add_echo_anims.py [--in tools/echo_anims] [--out firmware/src/splash_animations.h]
"""
import argparse
import json
import os
import re
import sys

BEGIN = "// ==== ECHO-ANIMATIONEN ANFANG (tools/add_echo_anims.py) ===="
END = "// ==== ECHO-ANIMATIONEN ENDE ===="
CATEGORY_MARK = '"ECHO'   # our rows carry a category starting with ECHO


def rgb565(hex_color: str) -> int:
    if not hex_color or hex_color == "transparent":
        return 0
    h = hex_color.lstrip("#")
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)


def c_ident(name: str) -> str:
    return "splash_echo_" + re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def emit(name: str, category: str, anim: dict) -> tuple[str, str]:
    ident = c_ident(name)
    pal = [rgb565(c) for c in anim["palette"]][:10]
    pal += [0] * (10 - len(pal))
    frames = [[v for row in f["grid"] for v in row] for f in anim["frames"]]
    holds = [int(f["hold"]) for f in anim["frames"]]
    for i, f in enumerate(frames):
        if len(f) != 400:
            raise ValueError(f"{name}: frame {i} has {len(f)} cells, not 400")
        if max(f) > 9 or min(f) < 0:
            raise ValueError(f"{name}: frame {i} has values outside 0..9")
    out = [f"static const uint16_t {ident}_palette[10] = {{"
           + ",".join(f"0x{v:04X}" for v in pal) + "};"]
    out.append(f"static const uint8_t {ident}_frames[{len(frames)}][400] = {{")
    for f in frames:
        out.append("    {" + ",".join(str(v) for v in f) + "},")
    out.append("};")
    out.append(f"static const uint16_t {ident}_holds[{len(frames)}] = {{"
               + ",".join(str(h) for h in holds) + "};")
    row = (f'    {{"{name}", "{category}", {len(frames)}, '
           f"{ident}_palette, {ident}_frames, {ident}_holds}},")
    return "\n".join(out), row


def main() -> int:
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", default=os.path.join(here, "echo_anims"))
    ap.add_argument("--out", default=os.path.join(here, "..", "firmware", "src", "splash_animations.h"))
    args = ap.parse_args()

    index = json.load(open(os.path.join(args.src, "_index.json"), encoding="utf-8"))
    anims = []
    for e in index:
        key = e["filename"].replace(".html", "")
        d = json.load(open(os.path.join(args.src, key + ".json"), encoding="utf-8"))
        # category "ECHO ..." marks our rows so a rerun can find and replace them
        cat = d.get("category", "ECHO")
        if not cat.startswith("ECHO"):
            cat = "ECHO " + cat
        anims.append((d["name"], cat, d))
    if not anims:
        print("no animations in", args.src)
        return 1

    path = os.path.abspath(args.out)
    src = open(path, encoding="utf-8").read()
    src = re.sub(re.escape(BEGIN) + r".*?" + re.escape(END) + r"\n?", "", src, flags=re.S)

    m = re.search(r"#define SPLASH_ANIM_COUNT (\d+)\n"
                  r"static const splash_anim_def_t splash_anims\[SPLASH_ANIM_COUNT\] = \{\n"
                  r"(.*?)\n\};", src, re.S)
    if not m:
        print("ERROR: animation table not found; format changed?")
        return 1
    rows = m.group(2).splitlines()
    names = {n for n, _, _ in anims}
    keep = []
    for ln in rows:
        if not ln.strip():
            continue
        mm = re.match(r'\s*\{"([^"]+)",\s*"([^"]+)"', ln)
        if mm and (mm.group(2).startswith("ECHO") or mm.group(1) in names):
            continue
        keep.append(ln)

    defs, new_rows = [], []
    for name, cat, d in anims:
        dd, r = emit(name, cat, d)
        defs.append(dd)
        new_rows.append(r)

    block = (BEGIN + "\n"
             + "// Generated from tools/echo_anims/*.json (docs/bench/anims.js via\n"
             + "// tools/bench_to_json.js). Do not edit by hand; rerun tools/add_echo_anims.py.\n"
             + "\n".join(defs) + "\n" + END)
    total = len(keep) + len(new_rows)
    table = ("#define SPLASH_ANIM_COUNT " + str(total) + "\n"
             "static const splash_anim_def_t splash_anims[SPLASH_ANIM_COUNT] = {\n"
             + "\n".join(keep) + "\n" + "\n".join(new_rows) + "\n};")
    src = src[:m.start()] + block + "\n" + table + src[m.end():]
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(src)

    frames = sum(len(d["frames"]) for _, _, d in anims)
    print(f"{len(anims)} ECHO animations ({frames} frames, {frames * 400 / 1024:.1f} KB): "
          + ", ".join(n for n, _, _ in anims) + f" -> SPLASH_ANIM_COUNT {total}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
