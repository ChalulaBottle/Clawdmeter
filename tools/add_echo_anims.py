#!/usr/bin/env python3
"""Append the ECHO edition animations to firmware/src/splash_animations.h.

Modelled on tools/add_csb_anims.py: the header is generated, so this writes a
delimited block (palette, frames, per-frame holds per animation) and rewrites
the splash_anims table and SPLASH_ANIM_COUNT. Idempotent: an earlier ECHO block
and its table rows are removed first. Never hand-edit the header.

Lattice: every animation has its own size, the cells a side of its frames (the
JSON "size" field, else the row count of its grids). A frame is written as size
times size bytes, the array is frames[frame_count][size * size], and the table
row ends in the size, for a 60 cell creature:
    {"name", "ECHO Model", 12, <id>_palette, <id>_frames, <id>_holds, 60},
The struct those rows fill carries the size as its last field (TYPEDEF below,
the same text tools/convert_to_c.js writes). A header written before that field
existed gets the struct put in, and its table rows without a size get 20, the
lattice they always had.

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
DEFAULT_SIZE = 20         # the lattice of every row written before the size field
PALETTE_MAX = 10          # SPLASH_PALETTE_SIZE; cells index 0..9

# Keep identical to TYPEDEF in tools/convert_to_c.js.
TYPEDEF = """// One animation. frames holds frame_count frames of size by size cells, one
// palette index per byte, back to back: frame f starts at byte f * size * size
// and inside a frame the cells run row by row from the top left. size is the
// lattice edge in cells; 20, 40 and 60 cut the 480 px panel into whole 24, 12
// and 8 px cells. A row that leaves size out gets 0, which the renderer reads
// as 20. frames is const void so the generated [frame_count][size * size]
// array of any lattice goes in by name.
typedef struct {
    const char *name;
    const char *category;
    uint16_t frame_count;
    const uint16_t *palette;
    const void *frames;
    const uint16_t *holds;
    uint8_t size;
} splash_anim_def_t;
"""

# The struct as any version of the header writes it, with the comment lines
# straight above it (the ones TYPEDEF brings along).
TYPEDEF_RE = re.compile(r"(?://[^\n]*\n)*typedef struct \{\n.*?\n\} splash_anim_def_t;\n", re.S)
# A table row without a size: name, category, count, palette, frames, holds.
ROW_WITHOUT_SIZE = re.compile(r'^(\s*\{"[^"]*", "[^"]*", \d+, \w+, \w+, \w+)\},$')


def rgb565(hex_color: str) -> int:
    if not hex_color or hex_color == "transparent":
        return 0
    h = hex_color.lstrip("#")
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)


def c_ident(name: str) -> str:
    return "splash_echo_" + re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def lattice(name: str, anim: dict) -> int:
    """Cells a side: the "size" field, else the row count of the first grid."""
    if not anim["frames"]:
        raise ValueError(f"{name}: no frames")
    size = anim.get("size") or len(anim["frames"][0]["grid"])
    if not isinstance(size, int) or not 1 <= size <= 255:
        raise ValueError(f"{name}: size {size!r} is not a lattice of 1 to 255 cells")
    return size


def emit(name: str, category: str, anim: dict) -> tuple[str, str]:
    ident = c_ident(name)
    size = lattice(name, anim)
    pal = [rgb565(c) for c in anim["palette"]][:PALETTE_MAX]
    pal += [0] * (PALETTE_MAX - len(pal))
    for i, f in enumerate(anim["frames"]):
        g = f["grid"]
        if len(g) != size or any(len(row) != size for row in g):
            raise ValueError(f"{name}: frame {i} is not {size} by {size} cells")
    frames = [[v for row in f["grid"] for v in row] for f in anim["frames"]]
    holds = [int(f["hold"]) for f in anim["frames"]]
    for i, f in enumerate(frames):
        if max(f) >= PALETTE_MAX or min(f) < 0:
            raise ValueError(f"{name}: frame {i} has values outside 0..9")
    out = [f"static const uint16_t {ident}_palette[10] = {{"
           + ",".join(f"0x{v:04X}" for v in pal) + "};"]
    out.append(f"static const uint8_t {ident}_frames[{len(frames)}][{size * size}] = {{")
    for f in frames:
        out.append("    {" + ",".join(str(v) for v in f) + "},")
    out.append("};")
    out.append(f"static const uint16_t {ident}_holds[{len(frames)}] = {{"
               + ",".join(str(h) for h in holds) + "};")
    row = (f'    {{"{name}", "{category}", {len(frames)}, '
           f"{ident}_palette, {ident}_frames, {ident}_holds, {size}}},")
    return "\n".join(out), row


def ensure_typedef(src: str) -> tuple[str, bool]:
    """Put TYPEDEF in place of the struct the header carries. True when it changed."""
    if TYPEDEF in src:
        return src, False
    m = TYPEDEF_RE.search(src)
    if not m:
        raise ValueError("struct splash_anim_def_t not found; format changed?")
    return src[:m.start()] + TYPEDEF + src[m.end():], True


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
    # An animation that another one replaces leaves the build, whether it is a stock row (dropped from
    # the kept rows below) or one of ours (dropped here, e.g. the orange Clawd coffee).
    def _as_list(v):
        return [v] if isinstance(v, str) else list(v or [])
    replaced_names = {n for _, _, d in anims for n in _as_list(d.get("replaces"))}
    dropped = [n for n, _, _ in anims if n in replaced_names]
    anims = [a for a in anims if a[0] not in replaced_names]
    if dropped:
        print("replaced, not shipped:", ", ".join(dropped))

    # Everything is checked and emitted before the header is touched.
    try:
        emitted = [emit(name, cat, d) for name, cat, d in anims]
    except ValueError as err:
        print("ERROR:", err)
        return 1

    path = os.path.abspath(args.out)
    src = open(path, encoding="utf-8").read()
    try:
        src, struct_changed = ensure_typedef(src)
    except ValueError as err:
        print("ERROR:", err)
        return 1
    src = re.sub(re.escape(BEGIN) + r".*?" + re.escape(END) + r"\n?", "", src, flags=re.S)

    m = re.search(r"#define SPLASH_ANIM_COUNT (\d+)\n"
                  r"static const splash_anim_def_t splash_anims\[SPLASH_ANIM_COUNT\] = \{\n"
                  r"(.*?)\n\};", src, re.S)
    if not m:
        print("ERROR: animation table not found; format changed?")
        return 1
    rows = m.group(2).splitlines()
    names = {n for n, _, _ in anims}
    # stock rows an ECHO animation replaces (the "replaces" field, docs/bench/anims_replace.js) leave
    # the table; their data arrays stay in the header but nothing references them, so the linker drops them
    replaced = replaced_names
    keep = []
    sized = 0
    for ln in rows:
        if not ln.strip():
            continue
        mm = re.match(r'\s*\{"([^"]+)",\s*"([^"]+)"', ln)
        if mm and (mm.group(2).startswith("ECHO") or mm.group(1) in names or mm.group(1) in replaced):
            continue
        # rows from the other generators that predate the size field: say 20,
        # the lattice they always had, so every row in the table carries one
        rs = ROW_WITHOUT_SIZE.match(ln)
        if rs:
            ln = f"{rs.group(1)}, {DEFAULT_SIZE}}},"
            sized += 1
        keep.append(ln)

    defs = [dd for dd, _ in emitted]
    new_rows = [r for _, r in emitted]

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
    size_of = {n: lattice(n, d) for n, _, d in anims}
    kb = sum(len(d["frames"]) * size_of[n] ** 2 for n, _, d in anims) / 1024
    print(f"{len(anims)} ECHO animations ({frames} frames, {kb:.1f} KB): "
          + ", ".join(n for n, _, _ in anims) + f" -> SPLASH_ANIM_COUNT {total}")
    fine = [f"{n} ({s} cells)" for n, s in size_of.items() if s != DEFAULT_SIZE]
    if fine:
        print("lattices other than 20: " + ", ".join(fine))
    if struct_changed:
        print("struct splash_anim_def_t now carries the lattice size")
    if sized:
        print(f"{sized} table rows without a size now say {DEFAULT_SIZE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
