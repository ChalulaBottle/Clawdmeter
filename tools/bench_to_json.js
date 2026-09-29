#!/usr/bin/env node
/**
 * Writes the bench animations (docs/bench/anims.js) as claudepix-format JSON
 * into tools/echo_anims/, one file per animation plus _index.json, so
 * tools/convert_to_c.js --in tools/echo_anims can emit a header block and
 * tools/anim_gif.py can render GIFs for docs/media.
 *
 * Every file carries "size", the animation's lattice: each frame's grid is size rows of size
 * cells (20 unless the animation sets size; 40 and 60 cut the 480 px panel into whole 12 and
 * 8 px cells). Nothing is written unless every animation passes the checks: the lattice divides
 * the panel and fits the firmware table's one byte size field (255 at most), every frame is
 * size x size, every cell is a palette index 0..9, the palette has at most 10 colours. One bad
 * animation holds back the whole export on purpose: a partial set would drop that animation's
 * row from the firmware table on the next tools/add_echo_anims.py run.
 *
 * Usage: node tools/bench_to_json.js [--out DIR]
 */
const fs = require('fs');
const path = require('path');
const BENCH_DIR = path.join(__dirname, '..', 'docs', 'bench');
const BENCH = require(path.join(BENCH_DIR, 'anims.js'));
// Extra creature files register themselves into BENCH.anims (see anims.js, BENCH_LIB.register).
for (const f of fs.readdirSync(BENCH_DIR).filter(n => /^anims_.*\.js$/.test(n)).sort()) require(path.join(BENCH_DIR, f));

const PANEL = 480;          // the panel is 480 px square: a lattice must divide it into whole pixel cells
const SIZE_MAX = 255;       // the firmware table keeps size in one byte (splash_anim_def_t, tools/convert_to_c.js)
const PALETTE_MAX = 10;     // SPLASH_PALETTE_SIZE in the firmware; cells index 0..9

const args = process.argv.slice(2);
const i = args.indexOf('--out');
const OUT = path.resolve(i >= 0 ? args[i + 1] : path.join(__dirname, 'echo_anims'));

// Every problem with one animation, as readable lines (empty when it exports cleanly).
function problems(a, size, frames) {
  const out = [];
  if (!Number.isInteger(size) || size < 1 || PANEL % size) {
    out.push(`size ${JSON.stringify(a.size)} does not cut the ${PANEL} px panel into whole cells (20, 40 and 60 do)`);
    return out;
  }
  if (size > SIZE_MAX) {
    out.push(`size ${size} is over ${SIZE_MAX}, the most the firmware table's one byte size field holds`);
    return out;
  }
  if (a.palette.length > PALETTE_MAX) out.push(`palette has ${a.palette.length} colours, the firmware takes ${PALETTE_MAX}`);
  frames.forEach((f, k) => {
    const g = f.grid;
    const ok = Array.isArray(g) && g.length === size && g.every(row => Array.isArray(row) && row.length === size);
    if (!ok) {
      const shape = Array.isArray(g) ? `${g.length} rows of ${[...new Set(g.map(r => (Array.isArray(r) ? r.length : 'no')))].join(' or ')} cells` : 'not a grid';
      out.push(`frame ${k} is ${shape}, not ${size} x ${size}`);
      return;
    }
    // Cell by cell, not g.flat(): flat() skips the holes a hand built row can have, and the
    // position is what an author needs on a 3600 cell frame.
    let bad = null;
    for (let r = 0; r < size && !bad; r++) for (let c = 0; c < size; c++) {
      const v = g[r][c];
      if (!Number.isInteger(v) || v < 0 || v >= PALETTE_MAX) { bad = { r, c, v }; break; }
    }
    if (bad) out.push(`frame ${k} holds ${typeof bad.v === 'string' ? JSON.stringify(bad.v) : String(bad.v)} at row ${bad.r} col ${bad.c}, not a palette index 0..9`);
  });
  return out;
}

const exported = [], errors = [];
for (const a of BENCH.anims) {
  if (a.reference) continue;   // stock animations already live in the firmware under their own names
  const size = BENCH.sizeOf(a);
  // spinner cells bake in at export, phase = frame index (bench draws it from its own clock)
  const frames = a.frames.map((f, k) => ({ hold: f.hold, grid: a.spinner ? BENCH.spinnerAt(f.grid, k) : f.grid }));
  const p = problems(a, size, frames);
  if (p.length) { errors.push(...p.map(m => `${a.key}: ${m}`)); continue; }
  exported.push({ a, size, json: {
    filename: a.key + '.html',
    // firmware name: short, space separated, what the host's "a" field sends (splash_set_anim)
    name: a.fwname || a.name.replace(/\s*·\s*/g, ' ').toLowerCase(),
    category: a.category,
    description: a.intent,
    palette: a.palette,
    size,                      // lattice: frames are size x size cells
    frame_count: a.frames.length,
    frames,
  } });
}
if (errors.length) {
  console.error(`nothing written, ${errors.length} problem(s):\n  ` + errors.join('\n  '));
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
const index = [];
for (const { a, size, json } of exported) {
  fs.writeFileSync(path.join(OUT, a.key + '.json'), JSON.stringify(json, null, 1));
  index.push({ filename: json.filename, name: json.name, category: json.category, frame_count: json.frame_count, palette_size: a.palette.length });
  console.log(`${a.key}: ${a.frames.length} frames, palette ${a.palette.length}, ${size} x ${size} cells`);
}
fs.writeFileSync(path.join(OUT, '_index.json'), JSON.stringify(index, null, 2));
console.log(`wrote ${index.length} animations to ${OUT}`);
